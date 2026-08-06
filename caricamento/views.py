"""
API Views per il sistema di ottimizzazione carico tridimensionale.

Fornisce endpoint REST per:
- CRUD di Contenitori, Oggetti, PianiDiCarico
- Endpoint dettagliato per il frontend Three.js
- Avvio ottimizzazione (sincrona / asincrona)
"""

import hashlib
import json
import logging
import random
import uuid
from datetime import timedelta

from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.core.signing import BadSignature, Signer
from django.db.models.deletion import ProtectedError
from django.utils import timezone
from django.utils.http import url_has_allowed_host_and_scheme

logger = logging.getLogger(__name__)
from django.db import models, transaction
from django.shortcuts import redirect, render
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle


class OttimizzaRateThrottle(UserRateThrottle):
    """Throttle specifico per l'endpoint /ottimizza/ (10 richieste/minuto)."""
    scope = "ottimizza"

from .models import (
    Contenitore,
    Oggetto,
    OggettoDaCaricare,
    OggettoPosizionato,
    PianoDiCarico,
    SezioneCarico,
    StatoPiano,
    VincoloOggetto,
    VincoloTraOggetti,
)
from .serializers import (
    AvviaOttimizzazioneSerializer,
    ContenitoreCreateSerializer,
    ContenitoreDetailSerializer,
    ContenitoreListSerializer,
    OggettoCreateSerializer,
    OggettoDaCaricareSerializer,
    OggettoDetailSerializer,
    OggettoListSerializer,
    PianoDiCaricoCreateSerializer,
    PianoDiCaricoDetailSerializer,
    PianoDiCaricoListSerializer,
    SezioneCaricoSerializer,
    SezioneCaricoWriteSerializer,
    VincoloOggettoUpdateSerializer,
    VincoloTraOggettiSerializer,
)
from .tasks import accoda_ottimizzazione, esegui_ottimizzazione_sincrona


# ===========================================================================
# Helper: Calcola distribuzione pesi per sezioni
# ===========================================================================

def _calcola_distribuzione_pesi(piano):
    """Calcola la distribuzione del carico sulle sezioni per un piano.

    Replica la logica di _calcola_distribuzione_sezioni() di bin_packing.py
    ma opera su un piano salvato, senza dover ri-eseguire l'ottimizzazione.
    Restituisce anche i dati degli oggetti posizionati per il profilo di peso.
    """
    from .engine.sezione_weight_tracker import SezioneWeightTracker

    sezioni = list(piano.contenitore.sezioni.all())
    oggetti_posizionati = list(
        piano.oggetti_posizionati.select_related("oggetto").all()
    )

    oggetti = []
    for op in oggetti_posizionati:
        oggetti.append({
            "codice": op.oggetto.codice,
            "posizione_x_mm": op.coordinata_x_mm,
            "dimensione_x_mm": op.dimensione_x_mm,
            "peso_kg": float(op.oggetto.peso_kg),
        })

    if not sezioni:
        return {"sezioni": [], "oggetti": oggetti}

    if not oggetti_posizionati:
        return {"sezioni": [], "oggetti": oggetti}

    tracker = SezioneWeightTracker(sezioni)
    for op in oggetti_posizionati:
        x_start = op.coordinata_x_mm
        x_end = op.coordinata_x_mm + op.dimensione_x_mm
        peso = float(op.oggetto.peso_kg)
        tracker.applica(x_start, x_end, peso)

    # Riepilogo con nome sezione incluso
    risultati = []
    for s in sezioni:
        limite = float(s.carico_massimo_kg)
        carico = tracker.carico_attuale.get(s.id, 0.0)
        risultati.append({
            "sezione_id": s.id,
            "nome": s.nome,
            "inizio_x_mm": s.inizio_x_mm,
            "fine_x_mm": s.fine_x_mm,
            "carico_massimo_kg": limite,
            "carico_attuale_kg": round(carico, 2),
            "margine_kg": round(max(0.0, limite - carico), 2),
        })
    return {"sezioni": risultati, "oggetti": oggetti}


# ===========================================================================
# VIEW: Pagina Visualizzatore 3D
# ===========================================================================

# ---------------------------------------------------------------------------
# Helper: Controlli anti-abuso demo (3 segnali)
# ---------------------------------------------------------------------------

def _check_demo_abuse(request, user=None):
    """Verifica se l'utente demo sta cercando di riutilizzare la prova.

    Controlla 3 segnali contro il DB dei fingerprint di demo scadute:
    1. IP Hash
    2. Browser Fingerprint (da cookie JS)
    3. Cookie Token server-side

    Restituisce True se l'utente DEVE essere bloccato (match trovati).
    Se user è None (controllo pre-creazione), salta il logging.
    """
    from .models import DemoFingerprint, ImpostazioniSistema

    imp = ImpostazioniSistema.get()
    soglia = imp.soglia_controlli_demo  # default 1

    # Raccogli i 3 segnali
    ip_raw = request.META.get("REMOTE_ADDR", "")
    ip_hash = hashlib.sha256(ip_raw.encode()).hexdigest()

    browser_hash = request.COOKIES.get("cb_fp", "") or None
    cookie_token = request.COOKIES.get("cb_demo", "") or None

    # Cerca fingerprint di demo SCADUTE (non paganti, trial finito)
    matches = DemoFingerprint.objects.filter(
        user_profile__is_paying=False,
        user_profile__trial_end__isnull=False,
        user_profile__trial_end__lt=timezone.now(),
    )

    match_count = 0
    if ip_hash:
        if matches.filter(ip_hash=ip_hash).exists():
            match_count += 1
    if browser_hash:
        if matches.filter(browser_hash=browser_hash).exists():
            match_count += 1
    if cookie_token:
        if matches.filter(cookie_token=cookie_token).exists():
            match_count += 1

    blocked = match_count >= soglia
    if blocked and user is not None:
        logger.info(
            "Demo BLOCKED: user=%s match_count=%d soglia=%d ip=%s fp=%s",
            user.username, match_count, soglia,
            ip_hash[:12], (browser_hash or "")[:12],
        )
    return blocked


def _setup_trial_for_user(user):
    """Crea o aggiorna il profilo utente con periodo di prova.

    Se il profilo esiste già (es. da precedente login Google),
    non sovrascrive trial_start/trial_end.
    """
    from .models import ImpostazioniSistema, UserProfile

    imp = ImpostazioniSistema.get()
    profile, created = UserProfile.objects.get_or_create(user=user)

    if created or profile.trial_start is None:
        profile.trial_start = timezone.now()
        profile.trial_end = timezone.now() + timedelta(days=imp.giorni_prova)
        profile.save(update_fields=["trial_start", "trial_end"])

    return profile


def _save_demo_fingerprints(request, user):
    """Salva i 3 segnali identificativi per l'utente demo."""
    from .models import DemoFingerprint, UserProfile

    try:
        profile = user.profile
    except UserProfile.DoesNotExist:
        return

    ip_raw = request.META.get("REMOTE_ADDR", "")
    ip_hash = hashlib.sha256(ip_raw.encode()).hexdigest()
    browser_hash = request.COOKIES.get("cb_fp", "") or None
    cookie_token = request.COOKIES.get("cb_demo", "") or None

    DemoFingerprint.objects.get_or_create(
        user_profile=profile,
        ip_hash=ip_hash,
        defaults={
            "browser_hash": browser_hash,
            "cookie_token": cookie_token,
        },
    )


# ===========================================================================
# VIEW: Landing Page / Homepage
# ===========================================================================

def homepage(request):
    """Landing page pubblica con workspace in vetrina + login.

    - Utenti autenticati: verifica trial, poi redirect al workspace.
    - Google OAuth: gestito da django-allauth (callback su /accounts/google/).
    - POST demo: autentica con account demo + 3 controlli anti-abuso.
    - GET: mostra landing page con form login e pulsante Google.
    """
    from django.contrib.auth import authenticate, login as auth_login
    from .models import ImpostazioniSistema, UserProfile

    imp = ImpostazioniSistema.get()

    # Helper per validare il parametro next (anti open-redirect)
    def _safe_next(request, default="caricamento:workspace"):
        next_url = request.POST.get("next") or request.GET.get("next") or ""
        if next_url and url_has_allowed_host_and_scheme(next_url, allowed_hosts=None):
            return next_url
        return default

    # Se già autenticato, verifica trial e redirect
    next_url = _safe_next(request)
    if request.user.is_authenticated:
        try:
            profile = request.user.profile
            if not profile.is_trial_active and not request.user.is_staff:
                # Trial scaduto: logout e redirect a landing con messaggio
                from django.contrib.auth import logout
                logout(request)
                return render(request, "caricamento/landing.html", {
                    "login_error": False,
                    "trial_expired": True,
                    "demo_user": "",
                    "demo_pass": "",
                    "oggetti_demo": [],
                    "google_oauth_attivo": imp.google_oauth_attivo,
                    "demo_attiva": imp.demo_attiva,
                    "switch_account": False,
                })
        except UserProfile.DoesNotExist:
            pass
        return redirect(next_url)

    login_error = False
    trial_expired = False
    switch_account = request.GET.get("switch_account", "") == "1"

    if request.method == "POST":
        username = request.POST.get("username", "").strip()
        password = request.POST.get("password", "").strip()

        if not username or not password:
            login_error = True
        else:
            user = authenticate(request, username=username, password=password)

            if user is not None:
                # Utente esistente → login demo (tutti dalla landing page sono demo)
                if not imp.demo_attiva and not user.is_staff:
                    login_error = True
                elif _check_demo_abuse(request, user):
                    trial_expired = True
                    logger.warning("Demo abuse detected for user=%s", username)
                else:
                    _setup_trial_for_user(user)
                    try:
                        profile = user.profile
                        if not profile.is_trial_active and not user.is_staff:
                            trial_expired = True
                        else:
                            auth_login(request, user)
                            _save_demo_fingerprints(request, user)
                            return redirect(_safe_next(request))
                    except UserProfile.DoesNotExist:
                        auth_login(request, user)
                        _save_demo_fingerprints(request, user)
                        return redirect(_safe_next(request))
            else:
                # Utente non esiste → auto-creazione demo (se demo_attiva)
                if not imp.demo_attiva:
                    login_error = True
                elif _check_demo_abuse(request):  # controlla fingerprint PRIMA di creare
                    trial_expired = True
                    logger.warning(
                        "Demo auto-create BLOCKED: username=%s ip_hash=%s",
                        username, hashlib.sha256(
                            request.META.get("REMOTE_ADDR", "").encode()
                        ).hexdigest()[:12],
                    )
                else:
                    user = User.objects.create_user(username=username, password=password)
                    _setup_trial_for_user(user)
                    auth_login(
                        request, user,
                        backend="django.contrib.auth.backends.ModelBackend",
                    )
                    _save_demo_fingerprints(request, user)
                    logger.info("Demo auto-created: user=%s", username)
                    return redirect(_safe_next(request))

    # GET: prepara il contesto per la landing page

    # Oggetti demo per il panel destro
    oggetti = Oggetto.objects.all().order_by("codice")[:5]
    oggetti_demo = []
    for o in oggetti:
        oggetti_demo.append({
            "codice": o.codice,
            "descrizione": o.descrizione or "",
            "colore": o.colore or "#447e9b",
            "dimensioni": f"{o.lunghezza_mm / 10:.0f}×{o.larghezza_mm / 10:.0f}×{o.altezza_mm / 10:.0f} cm",
            "peso_kg": f"{o.peso_kg} kg",
            "quantita": random.randint(3, 25),
        })

    return render(request, "caricamento/landing.html", {
        "login_error": login_error,
        "trial_expired": trial_expired,
        "demo_user": "",
        "demo_pass": "",
        "oggetti_demo": oggetti_demo,
        "google_oauth_attivo": imp.google_oauth_attivo,
        "demo_attiva": imp.demo_attiva,
        "switch_account": switch_account,
    })


def logout_completo(request):
    """Logout completo: cancella la sessione Django e forza la scelta account
    Google al prossimo accesso (per utenti Google). Per utenti non-Google
    il comportamento è identico al logout normale.

    Reindirizza alla landing page con ?switch_account=1.
    """
    from django.contrib.auth import logout
    logout(request)
    return redirect("/?switch_account=1")


@login_required
def workspace(request, piano_id=None):
    """Pagina Workspace unificata (Single-Page App).

    Sostituisce l'admin per la gestione quotidiana: permette di
    creare piani, aggiungere oggetti, eseguire ottimizzazione e
    vedere il risultato 3D tutto in un'unica pagina.

    Piani e oggetti sono paginati (50 per pagina) per evitare di
    caricare centinaia di record nel frontend.
    Per le parti che necessitano di tutti gli oggetti (dropdown,
    colonne Vincoli-tra), viene fornito un catalogo leggero
    (id, codice, dimensioni).
    """
    from django.core.paginator import Paginator
    from django.db.models import Prefetch

    piani_qs = PianoDiCarico.objects.select_related("contenitore").order_by("-created_at")
    paginator = Paginator(piani_qs, 50)
    page_number = request.GET.get("page", 1)
    piani = paginator.get_page(page_number)

    contenitori = Contenitore.objects.prefetch_related("sezioni").all().order_by("nome")

    # --- Oggetti: paginati (50/pag) con vincoli prefetched ---
    oggetti_qs = Oggetto.objects.prefetch_related(
        Prefetch("vincoli", queryset=VincoloOggetto.objects.all())
    ).all().order_by("codice")
    oggetti_paginator = Paginator(oggetti_qs, 50)
    oggetti_page_number = request.GET.get("oggetti_page", 1)
    oggetti = oggetti_paginator.get_page(oggetti_page_number)

    # --- Vincoli: TUTTI (tabella piccola, serve lookup per oggetto_id nel frontend) ---
    vincoli = VincoloOggetto.objects.all()

    # --- Catalogo oggetti leggero: TUTTI (serve per dropdown e colonne Vincoli-tra) ---
    oggetti_catalog = list(Oggetto.objects.values(
        "id", "codice", "descrizione", "lunghezza_mm", "larghezza_mm", "altezza_mm",
        "peso_kg", "quantita_disponibile", "colore",
    ).order_by("codice"))

    vincoli_tra_oggetti = VincoloTraOggetti.objects.select_related(
        "oggetto_a", "oggetto_b"
    ).all().order_by("-created_at")

    # Serializza dettagli_posizionamento come JSON per il frontend
    vincoli_tra_js = []
    for v in vincoli_tra_oggetti:
        dett_json = json.dumps(v.dettagli_posizionamento) if v.dettagli_posizionamento else "null"
        vincoli_tra_js.append({
            "v": v,
            "dettagli_json": dett_json,
        })

    return render(request, "caricamento/workspace.html", {
        "piani": piani,
        "contenitori": contenitori,
        "oggetti": oggetti,
        "oggetti_catalog": oggetti_catalog,
        "vincoli": vincoli,
        "vincoli_tra_oggetti": vincoli_tra_js,
        "piano_id": piano_id,
    })


def visualizzatore_3d(request, piano_id=None):
    """Redirect alla nuova pagina Workspace (sostituisce il vecchio visualizzatore)."""
    if piano_id:
        return redirect("caricamento:workspace_piano", piano_id=piano_id)
    return redirect("caricamento:workspace")


# ===========================================================================
# ViewSet: Contenitore
# ===========================================================================

class ContenitoreViewSet(viewsets.ModelViewSet):
    """
    API endpoint per la gestione dei contenitori/veicoli.
    Richiede autenticazione."""
    permission_classes = [IsAuthenticated]

    queryset = Contenitore.objects.prefetch_related("sezioni").all()

    def get_serializer_class(self):
        if self.action == "list":
            return ContenitoreListSerializer
        if self.action == "create":
            return ContenitoreCreateSerializer
        return ContenitoreDetailSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        # Filtro archiviati SOLO sulla list: default mostra attivi, ?archiviati=1 mostra archiviati.
        # Su retrieve/update/delete NON filtriamo, così l'utente può sempre modificare/eliminare.
        if self.action == "list":
            mostra_archiviati = self.request.query_params.get("archiviati", "") == "1"
            qs = qs.filter(archiviato=mostra_archiviati)
        return qs

    def destroy(self, request, *args, **kwargs):
        """Elimina un contenitore. Blocca con 409 se ci sono piani di carico collegati."""
        instance = self.get_object()
        try:
            self.perform_destroy(instance)
        except ProtectedError:
            num_piani = instance.piani_di_carico.count()
            return Response(
                {
                    "detail": (
                        f"Impossibile eliminare '{instance.nome}': "
                        f"è usato in {num_piani} piano/i di carico. "
                        f"Archivia il mezzo o elimina prima i piani collegati."
                    ),
                },
                status=status.HTTP_409_CONFLICT,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["get", "put"])
    def sezioni(self, request, pk=None):
        """
        Legge o sostituisce in blocco le sezioni di carico di un contenitore.

        GET  /api/contenitori/{id}/sezioni/   → Restituisce le sezioni attuali
        PUT  /api/contenitori/{id}/sezioni/   → Sostituisce TUTTE le sezioni

        Corpo PUT (JSON):
            [
                {"nome": "Zona 1", "inizio_x_mm": 0, "fine_x_mm": 10000, "carico_massimo_kg": 9000},
                {"nome": "Zona 2", "inizio_x_mm": 10000, "fine_x_mm": 13600, "carico_massimo_kg": 9000}
            ]
        """
        contenitore = self.get_object()

        if request.method == "GET":
            sezioni = contenitore.sezioni.all()
            ser = SezioneCaricoSerializer(sezioni, many=True)
            return Response(ser.data)

        # PUT: sostituisci tutte le sezioni (atomico: o tutto o niente)
        ser = SezioneCaricoWriteSerializer(data=request.data, many=True)
        ser.is_valid(raise_exception=True)

        with transaction.atomic():
            contenitore.sezioni.all().delete()
            nuove_sezioni = []
            for item in ser.validated_data:
                nuove_sezioni.append(SezioneCarico(
                    contenitore=contenitore,
                    nome=item["nome"],
                    inizio_x_mm=item["inizio_x_mm"],
                    fine_x_mm=item["fine_x_mm"],
                    carico_massimo_kg=item["carico_massimo_kg"],
                ))
            SezioneCarico.objects.bulk_create(nuove_sezioni)

        # Rileggi e restituisci
        contenitore.refresh_from_db()
        sezioni = contenitore.sezioni.all()
        out = SezioneCaricoSerializer(sezioni, many=True)
        return Response(out.data, status=status.HTTP_200_OK)


# ===========================================================================
# ViewSet: Oggetto
# ===========================================================================

class OggettoViewSet(viewsets.ModelViewSet):
    """
    API endpoint per la gestione degli oggetti/pacchi da caricare.
    Richiede autenticazione."""
    permission_classes = [IsAuthenticated]

    queryset = Oggetto.objects.all()

    def get_serializer_class(self):
        if self.action == "list":
            return OggettoListSerializer
        if self.action == "create":
            return OggettoCreateSerializer
        return OggettoDetailSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        # Filtro archiviati SOLO sulla list: default mostra attivi, ?archiviati=1 mostra archiviati.
        # Su retrieve/update/delete NON filtriamo, così l'utente può sempre modificare/eliminare.
        if self.action == "list":
            mostra_archiviati = self.request.query_params.get("archiviati", "") == "1"
            qs = qs.filter(archiviato=mostra_archiviati)
        return qs

    def destroy(self, request, *args, **kwargs):
        """Elimina un oggetto. Blocca con 409 se è posizionato in piani di carico."""
        instance = self.get_object()
        try:
            self.perform_destroy(instance)
        except ProtectedError:
            num_piani = instance.posizionamenti.count()
            return Response(
                {
                    "detail": (
                        f"Impossibile eliminare '{instance.codice}': "
                        f"è posizionato in {num_piani} piano/i di carico. "
                        f"Elimina prima i posizionamenti o i piani collegati."
                    ),
                },
                status=status.HTTP_409_CONFLICT,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["get", "patch"])
    def vincoli(self, request, pk=None):
        """
        Legge o aggiorna i vincoli di un oggetto.

        GET  /api/oggetti/{id}/vincoli/  → Restituisce i vincoli attuali
        PATCH /api/oggetti/{id}/vincoli/ → Aggiorna i vincoli (parziale)

        Esempio corpo PATCH:
            { "rotazione_su_x": false, "sovrapponibile": false }
        """
        oggetto = self.get_object()
        vincolo, created = VincoloOggetto.objects.get_or_create(oggetto=oggetto)

        if request.method == "GET":
            from .serializers import VincoloOggettoSerializer
            ser = VincoloOggettoSerializer(vincolo)
            return Response(ser.data)

        # PATCH
        serializer = VincoloOggettoUpdateSerializer(
            vincolo, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @action(detail=False, methods=["post"])
    def bulk_delete(self, request):
        """
        Elimina multipli oggetti in blocco.

        POST /api/oggetti/bulk_delete/
        Corpo: { "ids": [1, 2, 3] }
        """
        ids = request.data.get("ids", [])
        if not ids:
            return Response(
                {"errore": "Nessun ID fornito."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        qs = Oggetto.objects.filter(id__in=ids)
        deleted_count, _ = qs.delete()
        return Response({"eliminati": deleted_count})

    @action(detail=False, methods=["post"])
    def bulk_vincoli(self, request):
        """
        Aggiorna i vincoli di multipli oggetti in blocco.

        POST /api/oggetti/bulk_vincoli/
        Corpo: { "ids": [1, 2, 3], "vincoli": { "fragile": true, "sovrapponibile": false } }
        """
        ids = request.data.get("ids", [])
        vincoli_data = request.data.get("vincoli", {})
        if not ids:
            return Response(
                {"errore": "Nessun ID fornito."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not vincoli_data:
            return Response(
                {"errore": "Nessun vincolo da aggiornare."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Prende o crea i VincoloOggetto per tutti gli ID
        vincoli_qs = VincoloOggetto.objects.filter(oggetto_id__in=ids)
        vincoli_map = {v.oggetto_id: v for v in vincoli_qs}

        aggiornati = 0
        for oid in ids:
            vincolo = vincoli_map.get(oid)
            if vincolo is None:
                vincolo = VincoloOggetto(oggetto_id=oid)
            # Applica i campi
            for campo, valore in vincoli_data.items():
                if hasattr(vincolo, campo):
                    setattr(vincolo, campo, valore)
            vincolo.save()
            aggiornati += 1

        return Response({"aggiornati": aggiornati})


# ===========================================================================
# ViewSet: PianoDiCarico (con azioni personalizzate)
# ===========================================================================

class PianoDiCaricoViewSet(viewsets.ModelViewSet):
    """
    API endpoint per la gestione dei piani di carico.
    Richiede autenticazione.

    ## Endpoint standard
    list:       Elenco di tutti i piani di carico
    create:     Crea un nuovo piano di carico
    read:       Dettaglio completo (contenitore + oggetti posizionati) ← ★
    update:     Aggiorna un piano di carico
    delete:     Elimina un piano di carico

    ## Azioni personalizzate
    /{id}/ottimizza/     Avvia l'ottimizzazione 3D (sincrona o asincrona) — limitato a 10/min
    /{id}/stato/         Stato del task di ottimizzazione
    """
    permission_classes = [IsAuthenticated]
    queryset = PianoDiCarico.objects.prefetch_related(
        "oggetti_posizionati__oggetto",
        "contenitore",
    ).annotate(
        num_oggetti=models.Count("oggetti_posizionati"),
    )

    def get_serializer_class(self):
        if self.action == "list":
            return PianoDiCaricoListSerializer
        if self.action == "create":
            return PianoDiCaricoCreateSerializer
        return PianoDiCaricoDetailSerializer

    # ---- Azioni personalizzate ----

    @action(detail=True, methods=["post"], throttle_classes=[OttimizzaRateThrottle])
    def ottimizza(self, request, pk=None):
        """Avvia l'ottimizzazione 3D per un piano di carico.

        Corpo richiesta (JSON):
            {
                "asincrono": true,           // default true
                "config": { ... }             // configurazione opzionale
            }

        Il campo `config` segue il formato delle impostazioni dell'ottimizzatore
        (Strategia, Performance, Output). Se omesso, vengono usati i default.
        """
        piano = self.get_object()

        # Legge i parametri dal body
        data = request.data if request.data else {}
        logger.info("OTTIMIZZA richiesta — piano_id=%s — request.data=%s", pk, data)
        serializer = AvviaOttimizzazioneSerializer(data=data)
        if not serializer.is_valid():
            logger.warning("OTTIMIZZA validazione fallita — errori=%s", serializer.errors)
            raise ValidationError(serializer.errors)
        validated = serializer.validated_data
        asincrono = validated["asincrono"]
        config = validated.get("config", None)  # dict o None

        if asincrono:
            # Task asincrono via Django Q2
            task_id = accoda_ottimizzazione(piano.id, config=config)

            piano.task_id = task_id
            piano.stato = StatoPiano.IN_ELABORAZIONE
            piano.save(update_fields=["task_id", "stato"])

            return Response(
                {
                    "successo": True,
                    "piano_id": piano.id,
                    "task_id": task_id,
                    "config_applicata": config is not None,
                    "messaggio": (
                        f"Ottimizzazione avviata in coda asincrona. "
                        f"Task ID: {task_id}"
                    ),
                },
                status=status.HTTP_202_ACCEPTED,
            )
        else:
            # Esecuzione sincrona (bloccante)
            risultato = esegui_ottimizzazione_sincrona(piano.id, config=config)

            # Ricarica il piano per dati aggiornati
            piano.refresh_from_db()

            # Costruisci risposta con metriche estese
            response_data = {
                "successo": risultato["successo"],
                "piano_id": piano.id,
                "piano_nome": piano.nome,
                "oggetti_posizionati": risultato["oggetti_posizionati"],
                "oggetti_non_posizionati": risultato["oggetti_non_posizionati"],
                "saturazione": round(risultato["saturazione_percentuale"], 1),
                "messaggio": risultato["messaggio"],
            }

            # Aggiungi metriche estese se configurate per output dettagliato
            if risultato.get("metriche"):
                response_data["metriche"] = risultato["metriche"]

            # Aggiungi eventuali soluzioni alternative generate dal Simulated Annealing
            if risultato.get("soluzioni_alternative"):
                response_data["soluzioni_alternative"] = risultato["soluzioni_alternative"]

            return Response(response_data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"])
    def stato(self, request, pk=None):
        """Restituisce lo stato corrente del piano di carico.

        Utile per il polling del frontend dopo aver avviato
        un'ottimizzazione asincrona.
        """
        piano = self.get_object()
        num_posizionati = piano.oggetti_posizionati.count()

        return Response(
            {
                "id": piano.id,
                "nome": piano.nome,
                "stato": piano.stato,
                "task_id": piano.task_id,
                "oggetti_posizionati": num_posizionati,
                "saturazione": piano.saturazione_volumetrica,
                "peso_totale_kg": piano.peso_totale_kg,
                "completato_at": piano.completato_at,
                "messaggio_errore": piano.messaggio_errore,
            }
        )

    @action(detail=True, methods=["post", "delete"])
    def oggetti_da_caricare(self, request, pk=None):
        """Gestisce gli oggetti da caricare per questo piano.

        POST   /api/piani/{id}/oggetti_da_caricare/  → Aggiunge/modifica un oggetto
        DELETE /api/piani/{id}/oggetti_da_caricare/  → Rimuove TUTTI gli oggetti dal piano

        Corpo POST (JSON):
            { "oggetto_id": 1, "quantita": 5, "note": "" }
        """
        piano = self.get_object()

        if request.method == "DELETE":
            count = piano.oggetti_da_caricare.count()
            piano.oggetti_da_caricare.all().delete()
            return Response({"successo": True, "rimossi": count})

        # POST
        serializer = OggettoDaCaricareSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        oggetto_da_caricare, created = OggettoDaCaricare.objects.update_or_create(
            piano_di_carico=piano,
            oggetto_id=serializer.validated_data["oggetto_id"],
            defaults={
                "quantita": serializer.validated_data.get("quantita", 1),
                "priorita": serializer.validated_data.get("priorita", 0),
                "note": serializer.validated_data.get("note", ""),
            },
        )

        # Ogni salvataggio dal pannello frontend consolida la configurazione
        # manuale: le q.tà confermate dall'utente sono la nuova fonte di verità.
        if piano.algoritmo != "manuale":
            piano.algoritmo = "manuale"
            piano.save(update_fields=["algoritmo", "updated_at"])

        return Response(
            {
                "id": oggetto_da_caricare.id,
                "oggetto_id": oggetto_da_caricare.oggetto_id,
                "quantita": oggetto_da_caricare.quantita,
                "created": created,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @action(detail=True, methods=["get"])
    def export_posizioni(self, request, pk=None):
        """Esporta le posizioni degli oggetti in formato testo leggibile.

        Restituisce un file .txt con tutte le coordinate, dimensioni,
        rotazioni e codici degli oggetti posizionati nel piano.
        """
        from django.http import HttpResponse

        piano = self.get_object()
        contenitore = piano.contenitore
        oggetti_posizionati = list(
            piano.oggetti_posizionati.select_related("oggetto").order_by(
                "coordinata_x_mm", "coordinata_y_mm", "coordinata_z_mm"
            )
        )

        lines = []
        lines.append("=" * 85)
        lines.append(f"PIANO DI CARICO: {piano.nome}")
        lines.append(f"Contenitore: {contenitore.nome} ({contenitore.tipo_mezzo})")
        lines.append(f"Dimensioni contenitore (mm): X={contenitore.lunghezza_mm} Y={contenitore.larghezza_mm} Z={contenitore.altezza_mm}")
        lines.append(f"Stato: {piano.get_stato_display()}")
        lines.append(f"Algoritmo: {piano.algoritmo or 'N/D'}")
        lines.append(f"Oggetti posizionati: {len(oggetti_posizionati)}")
        lines.append(f"Saturazione: {piano.saturazione_volumetrica:.1f}%" if piano.saturazione_volumetrica else "Saturazione: N/D")
        lines.append(f"Peso totale: {piano.peso_totale_kg} kg" if piano.peso_totale_kg else "Peso totale: N/D")
        lines.append("=" * 85)
        lines.append("")
        lines.append(f"{'#':>3} {'Codice':<12} {'X':>6} {'Y':>6} {'Z':>6} {'dX':>5} {'dY':>5} {'dZ':>5} {'Rot':<15} {'Colore'}")
        lines.append("-" * 85)

        for i, op in enumerate(oggetti_posizionati, 1):
            lines.append(
                f"{i:>3} {op.oggetto.codice:<12} "
                f"{op.coordinata_x_mm:>6} {op.coordinata_y_mm:>6} {op.coordinata_z_mm:>6} "
                f"{op.dimensione_x_mm:>5} {op.dimensione_y_mm:>5} {op.dimensione_z_mm:>5} "
                f"{op.rotazione_applicata or 'nessuna':<15} "
                f"{op.colore or '-'}"
            )

        lines.append("-" * 85)
        lines.append("")

        # Riepilogo per codice
        from collections import Counter
        codici = Counter(op.oggetto.codice for op in oggetti_posizionati)
        lines.append("RIEPILOGO PER CODICE:")
        for codice, qty in sorted(codici.items()):
            lines.append(f"  {codice}: {qty} pezzi")

        # Riepilogo occupazione X
        if oggetti_posizionati:
            max_x = max(op.coordinata_x_mm + op.dimensione_x_mm for op in oggetti_posizionati)
            lines.append(f"\nOccupazione X max: {max_x} mm = {max_x/10:.1f} cm")

        content = "\n".join(lines)

        response = HttpResponse(content, content_type="text/plain; charset=utf-8")
        response["Content-Disposition"] = (
            f'attachment; filename="piano_{piano.id}_{piano.nome.replace(" ", "_")}.txt"'
        )
        return response

    @action(detail=True, methods=["get"])
    def dati_3d(self, request, pk=None):
        """Restituisce i dati pronti per il rendering Three.js.

        Endpoint ottimizzato per il frontend: sfrutta la
        prefetch_related già presente nella queryset del viewset
        per evitare query N+1.
        """
        piano = self.get_object()
        contenitore = piano.contenitore

        # Usa la prefetch cache (evita select_related extra)
        # IMPORTANTE: stesso ordinamento di export_posizioni per avere
        # numeri corrispondenti tra tabella esportata e scene 3D.
        oggetti_posizionati = list(
            piano.oggetti_posizionati.order_by(
                "coordinata_x_mm", "coordinata_y_mm", "coordinata_z_mm"
            )
        )

        # Includi anche gli oggetti_da_caricare (q.tà salvate dall'utente)
        oggetti_da_caricare = list(
            piano.oggetti_da_caricare.select_related("oggetto").all()
        )

        payload = {
            "piano": {
                "id": piano.id,
                "nome": piano.nome,
                "stato": piano.stato,
                "algoritmo": piano.algoritmo or "",
            },
            "contenitore": {
                "nome": contenitore.nome,
                "dimensioni_mm": {
                    "x": contenitore.lunghezza_mm,
                    "y": contenitore.larghezza_mm,
                    "z": contenitore.altezza_mm,
                },
                "dimensioni_cm": {
                    "x": round(contenitore.lunghezza_mm / 10, 1),
                    "y": round(contenitore.larghezza_mm / 10, 1),
                    "z": round(contenitore.altezza_mm / 10, 1),
                },
            },
            "oggetti": [],
            "metriche": {
                "peso_totale_kg": (
                    float(piano.peso_totale_kg)
                    if piano.peso_totale_kg else 0
                ),
                "saturazione": (
                    round(piano.saturazione_volumetrica, 1)
                    if piano.saturazione_volumetrica else 0
                ),
                "oggetti_posizionati": len(oggetti_posizionati),
            },
            "oggetti_da_caricare": [
                {
                    "codice": odc.oggetto.codice,
                    "quantita": odc.quantita,
                    "priorita": odc.priorita,
                }
                for odc in oggetti_da_caricare
            ],
        }

        for op in oggetti_posizionati:
            payload["oggetti"].append(
                {
                    "id": op.id,
                    "codice": op.oggetto.codice,
                    "descrizione": op.oggetto.descrizione,
                    "posizione_mm": {
                        "x": op.coordinata_x_mm,
                        "y": op.coordinata_y_mm,
                        "z": op.coordinata_z_mm,
                    },
                    "dimensioni_mm": {
                        "x": op.dimensione_x_mm,
                        "y": op.dimensione_y_mm,
                        "z": op.dimensione_z_mm,
                    },
                    "posizione_cm": {
                        "x": round(op.coordinata_x_mm / 10, 1),
                        "y": round(op.coordinata_y_mm / 10, 1),
                        "z": round(op.coordinata_z_mm / 10, 1),
                    },
                    "dimensioni_cm": {
                        "x": round(op.dimensione_x_mm / 10, 1),
                        "y": round(op.dimensione_y_mm / 10, 1),
                        "z": round(op.dimensione_z_mm / 10, 1),
                    },
                    "rotazione": op.rotazione_applicata,
                    "colore": op.colore,
                    "peso_kg": float(op.oggetto.peso_kg),
                    "peso_sopra_kg": float(op.peso_posato_sopra_kg),
                }
            )

        return Response(payload)

    @action(detail=True, methods=["get"])
    def distribuzione_pesi(self, request, pk=None):
        """Restituisce la distribuzione del carico sulle sezioni.

        Calcola per ogni sezione del contenitore quanto carico (in kg)
        ricade su di essa, basandosi sugli oggetti posizionati.
        Utile per il grafico della toolbar dopo aver caricato un piano salvato.
        Restituisce anche gli oggetti posizionati per disegnare il profilo
        di peso lungo l'asse X del veicolo.
        """
        piano = self.get_object()
        dati = _calcola_distribuzione_pesi(piano)
        return Response({
            "distribuzione_pesi": dati["sezioni"],
            "oggetti": dati["oggetti"],
        })

    @action(detail=True, methods=["post"])
    def salva_posizioni_manuali(self, request, pk=None):
        """Salva le posizioni 3D modificate in modalità manuale.

        POST /api/piani/{id}/salva_posizioni_manuali/

        Corpo richiesta (JSON):
            {
                "oggetti": [
                    {
                        "codice": "CART-102",
                        "posizione_cm": {"x": 0, "y": 100, "z": 200},
                        "dimensioni_cm": {"x": 40, "y": 30, "z": 25},
                        "colore": "#447e9b",
                        "rotazione": "XYZ"
                    }
                ]
            }
        """
        piano = self.get_object()
        oggetti_data = request.data.get("oggetti", [])

        if not oggetti_data:
            return Response(
                {"errore": "Nessun oggetto fornito."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Cancella i posizionamenti esistenti e ricrea in modo atomico
        # (o tutto o niente: se bulk_create fallisce, il delete viene annullato)
        with transaction.atomic():
            piano.oggetti_posizionati.all().delete()

            # Recupera tutti gli oggetti in una query
            codici = [item["codice"] for item in oggetti_data]
            oggetti_map = {
                o.codice: o
                for o in Oggetto.objects.filter(codice__in=codici)
            }

            nuovi = []
            for item in oggetti_data:
                codice = item.get("codice")
                oggetto = oggetti_map.get(codice)
                if not oggetto:
                    continue

                pc = item.get("posizione_cm", {})
                dc = item.get("dimensioni_cm", {})

                nuovi.append(OggettoPosizionato(
                    piano_di_carico=piano,
                    oggetto=oggetto,
                    coordinata_x_mm=round(pc.get("x", 0) * 10),
                    coordinata_y_mm=round(pc.get("y", 0) * 10),
                    coordinata_z_mm=round(pc.get("z", 0) * 10),
                    dimensione_x_mm=round(dc.get("x", 0) * 10),
                    dimensione_y_mm=round(dc.get("y", 0) * 10),
                    dimensione_z_mm=round(dc.get("z", 0) * 10),
                    colore=item.get("colore", "#4488ff"),
                    rotazione_applicata=item.get("rotazione", "XYZ"),
                ))

            OggettoPosizionato.objects.bulk_create(nuovi)

            # Aggiorna lo stato del piano
            piano.stato = StatoPiano.COMPLETATO
            piano.algoritmo = "manuale"
            piano.save(update_fields=["stato", "algoritmo", "updated_at"])

        return Response({
            "successo": True,
            "oggetti_salvati": len(nuovi),
        })


# ===========================================================================
# ViewSet: VincoloTraOggetti
# ===========================================================================

class VincoloTraOggettiViewSet(viewsets.ModelViewSet):
    """API endpoint per la gestione dei vincoli tra coppie di oggetti.
    Richiede autenticazione."""
    permission_classes = [IsAuthenticated]
    queryset = VincoloTraOggetti.objects.select_related("oggetto_a", "oggetto_b").all()
    serializer_class = VincoloTraOggettiSerializer
