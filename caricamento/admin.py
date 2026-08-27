from django.contrib import admin, messages
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.contrib.auth.models import User
from django.db.models import Count
from django.db.models.deletion import ProtectedError
from django.utils.html import format_html
from django_q.models import Failure, Schedule, Success

from .models import (
    Contenitore,
    DemoFingerprint,
    ImpostazioniSistema,
    Oggetto,
    OggettoDaCaricare,
    OggettoPosizionato,
    PianoDiCarico,
    SezioneCarico,
    UserProfile,
    VincoloOggetto,
)


# ---------------------------------------------------------------------------
# I modelli Caricamento e Django Q2 sono gestiti dal Workspace.
# I commenti sotto servono per riattivare rapidamente l'admin se serve.
# ---------------------------------------------------------------------------

# Unregister Django Q2 models (sezione "Ottimizzazione Carico 3D")
for model in [Schedule, Success, Failure]:
    try:
        admin.site.unregister(model)
    except admin.sites.NotRegistered:
        pass


# ---------------------------------------------------------------------------
# Azioni amministrative sugli utenti demo
# ---------------------------------------------------------------------------

try:
    admin.site.unregister(User)
except admin.sites.NotRegistered:
    pass


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    """User admin con stato account e pulizia dati separata."""

    list_display = (
        "username",
        "email",
        "stato_account",
        "stato_pagamento",
        "stato_dati_workspace",
        "is_staff",
    )
    list_filter = ("is_active", "is_staff", "is_superuser")
    search_fields = ("username", "email", "first_name", "last_name")

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("profile").annotate(
            _num_piani=Count("piani_di_carico", distinct=True),
            _num_mezzi=Count("contenitori", distinct=True),
            _num_oggetti=Count("oggetti", distinct=True),
        )

    @admin.display(description="Stato", ordering="is_active")
    def stato_account(self, obj):
        return "🟢 Attivo" if obj.is_active else "🔴 Disattivato"

    @admin.display(description="Pagamento")
    def stato_pagamento(self, obj):
        profile = getattr(obj, "profile", None)
        return "💰 Pagante" if profile and profile.is_paying else "🎫 Demo"

    @admin.display(description="Dati workspace")
    def stato_dati_workspace(self, obj):
        piani = getattr(obj, "_num_piani", 0)
        mezzi = getattr(obj, "_num_mezzi", 0)
        oggetti = getattr(obj, "_num_oggetti", 0)
        totale = piani + mezzi + oggetti
        if totale == 0:
            return "⚪ Nessun dato"
        return f"📦 {piani} piani · 🚛 {mezzi} mezzi · 📦 {oggetti} oggetti"

    actions = [
        "delete_selected",
        "disattiva_utenti",
        "elimina_dati_utenti_disattivati",
        "rendi_utenti_paganti",
        "rimuovi_stato_pagante",
    ]

    @admin.action(description="Imposta utenti selezionati come paganti")
    def rendi_utenti_paganti(self, request, queryset):
        aggiornati = 0
        for user in queryset:
            profile, _ = UserProfile.objects.get_or_create(user=user)
            if not profile.is_paying:
                profile.is_paying = True
                profile.save(update_fields=["is_paying", "updated_at"])
                aggiornati += 1
        self.message_user(request, f"Impostati come paganti: {aggiornati} utenti.", messages.SUCCESS)

    @admin.action(description="Rimuovi stato pagante dagli utenti selezionati")
    def rimuovi_stato_pagante(self, request, queryset):
        aggiornati = 0
        for user in queryset:
            profile, _ = UserProfile.objects.get_or_create(user=user)
            if profile.is_paying:
                profile.is_paying = False
                profile.save(update_fields=["is_paying", "updated_at"])
                aggiornati += 1
        self.message_user(request, f"Tornati a demo: {aggiornati} utenti.", messages.SUCCESS)

    @admin.action(description="Disattiva utenti selezionati")
    def disattiva_utenti(self, request, queryset):
        # Non permettere all'amministratore di disattivare sé stesso o un
        # superuser dalla lista: evita di perdere l'unico accesso all'admin.
        eleggibili = queryset.exclude(pk=request.user.pk).exclude(is_superuser=True)
        disattivati = eleggibili.filter(is_active=True).update(is_active=False)
        ignorati = queryset.count() - eleggibili.count()

        self.message_user(
            request,
            f"Disattivati {disattivati} utenti."
            + (f" Ignorati {ignorati} account protetti." if ignorati else ""),
            messages.SUCCESS,
        )

    @admin.action(description="Elimina dati applicativi degli utenti disattivati")
    def elimina_dati_utenti_disattivati(self, request, queryset):
        """Elimina i dati di workspace ma conserva account e fingerprint.

        L'account resta disattivato, quindi non può accedere né riaprire il
        trial; mantenere UserProfile/DemoFingerprint conserva il segnale
        anti-abuso. Gli eventuali record protetti da dati di altri utenti
        interrompono la pulizia di quel singolo utente senza cancellazioni
        parziali.
        """
        inattivi = queryset.filter(is_active=False)
        attivi = queryset.filter(is_active=True).count()
        eliminati = 0
        bloccati = []

        for user in inattivi:
            try:
                from django.db import transaction
                with transaction.atomic():
                    # Prima i piani: rimuovono oggetti_da_caricare e
                    # oggetti_posizionati collegati in CASCADE.
                    PianoDiCarico.objects.filter(owner=user).delete()
                    Oggetto.objects.filter(owner=user).delete()
                    Contenitore.objects.filter(owner=user).delete()
                eliminati += 1
            except ProtectedError:
                bloccati.append(user.username)

        messaggio = f"Dati applicativi eliminati per {eliminati} utenti disattivati."
        if attivi:
            messaggio += f" Ignorati {attivi} utenti ancora attivi."
        if bloccati:
            messaggio += " Dati protetti non eliminati per: " + ", ".join(bloccati) + "."
        self.message_user(
            request,
            messaggio,
            messages.WARNING if bloccati or attivi else messages.SUCCESS,
        )


# ---------------------------------------------------------------------------
# Inline per VincoloOggetto dentro Oggetto
# ---------------------------------------------------------------------------

class VincoloOggettoInline(admin.StackedInline):
    model = VincoloOggetto
    can_delete = False
    verbose_name = "Vincolo"
    verbose_name_plural = "Vincoli"


# ---------------------------------------------------------------------------
# OggettoDaCaricare Inline (selezione oggetti pre-ottimizzazione)
# ---------------------------------------------------------------------------

class OggettoDaCaricareInline(admin.TabularInline):
    model = OggettoDaCaricare
    extra = 1
    autocomplete_fields = ["oggetto"]
    fields = ["oggetto", "quantita", "note"]


# ---------------------------------------------------------------------------
# OggettoPosizionato Inline dentro PianoDiCarico
# ---------------------------------------------------------------------------

class OggettoPosizionatoInline(admin.TabularInline):
    model = OggettoPosizionato
    extra = 0
    readonly_fields = [
        "coordinata_x_mm",
        "coordinata_y_mm",
        "coordinata_z_mm",
        "dimensione_x_mm",
        "dimensione_y_mm",
        "dimensione_z_mm",
        "rotazione_applicata",
        "colore",
        "peso_posato_sopra_kg",
    ]
    fields = [
        "oggetto",
        "coordinata_x_mm",
        "coordinata_y_mm",
        "coordinata_z_mm",
        "dimensione_x_mm",
        "dimensione_y_mm",
        "dimensione_z_mm",
        "rotazione_applicata",
        "colore",
        "peso_posato_sopra_kg",
    ]


# ===========================================================================
# TUTTI I MODELLI QUI SOTTO SONO GESTITI DAL WORKSPACE.
# Per riattivarli nell'admin, basta decommentare @admin.register(...)
# ===========================================================================

# ---------------------------------------------------------------------------
# SezioneCarico Inline dentro Contenitore
# ---------------------------------------------------------------------------

class SezioneCaricoInline(admin.TabularInline):
    model = SezioneCarico
    extra = 1
    fields = ["nome", "inizio_x_mm", "fine_x_mm", "carico_massimo_kg"]


# ---------------------------------------------------------------------------
# Contenitore
# ---------------------------------------------------------------------------

# @admin.register(Contenitore)
# class ContenitoreAdmin(admin.ModelAdmin):
#     list_display = [
#         "nome", "tipo_mezzo", "lunghezza_mm", "larghezza_mm",
#         "altezza_mm", "volume_m3", "carico_massimo_kg", "portata_netta_kg",
#     ]
#     list_filter = ["tipo_mezzo"]
#     search_fields = ["nome", "note"]
#     readonly_fields = ["volume_m3", "volume_mm3", "portata_netta_kg"]
#     inlines = [SezioneCaricoInline]


# ---------------------------------------------------------------------------
# Oggetto
# ---------------------------------------------------------------------------

# @admin.register(Oggetto)
# class OggettoAdmin(admin.ModelAdmin):
#     list_display = [
#         "codice", "descrizione_breve", "lunghezza_mm", "larghezza_mm",
#         "altezza_mm", "volume_mm3", "peso_kg", "quantita_disponibile",
#     ]
#     search_fields = ["codice", "descrizione"]
#     list_filter = ["quantita_disponibile"]
#     readonly_fields = ["volume_mm3"]
#     inlines = [VincoloOggettoInline]

#     @admin.display(description="Descrizione")
#     def descrizione_breve(self, obj):
#         return obj.descrizione[:60] if obj.descrizione else "-"


# ---------------------------------------------------------------------------
# VincoloOggetto
# ---------------------------------------------------------------------------

# @admin.register(VincoloOggetto)
# class VincoloOggettoAdmin(admin.ModelAdmin):
#     list_display = [
#         "oggetto", "rotazione_consentita", "sovrapponibile", "fragile",
#         "merce_pericolosa", "solo_su_piano",
#     ]
#     list_filter = [
#         "rotazione_consentita", "sovrapponibile", "fragile",
#         "merce_pericolosa", "solo_su_piano",
#     ]


# ---------------------------------------------------------------------------
# PianoDiCarico
# ---------------------------------------------------------------------------

# @admin.register(PianoDiCarico)
# class PianoDiCaricoAdmin(admin.ModelAdmin):
#     list_display = [
#         "nome", "contenitore", "stato", "peso_totale_kg",
#         "saturazione_volumetrica", "num_oggetti_selezionati",
#         "task_id", "created_at", "completato_at",
#     ]
#     list_filter = ["stato", "created_at"]
#     search_fields = ["nome", "task_id"]
#     readonly_fields = [
#         "saturazione_volumetrica", "volume_utilizzato_m3",
#         "task_id", "created_at", "updated_at", "completato_at",
#     ]
#     inlines = [OggettoDaCaricareInline, OggettoPosizionatoInline]
#     actions = ["esegui_ottimizzazione"]

#     @admin.display(description="Oggetti selezionati")
#     def num_oggetti_selezionati(self, obj):
#         return obj.oggetti_da_caricare.count()

#     @admin.action(
#         description="⚡ Esegui ottimizzazione 3D (piani selezionati)",
#         permissions=["change"],
#     )
#     def esegui_ottimizzazione(self, request, queryset):
#         from .engine import EseguiOttimizzazione
#         risultati = []
#         for piano in queryset:
#             risultato = EseguiOttimizzazione(piano.id)
#             if risultato.successo:
#                 risultati.append(
#                     f"'{piano.nome}': {len(risultato.oggetti_posizionati)} "
#                     f"oggetti posizionati, "
#                     f"{risultato.saturazione_percentuale:.1f}% saturazione"
#                 )
#             else:
#                 risultati.append(f"'{piano.nome}': ⚠️ {risultato.messaggio}")
#         self.message_user(request, "✅ Ottimizzazione completata!")
#         for msg in risultati:
#             self.message_user(request, f"  • {msg}")


# ---------------------------------------------------------------------------
# OggettoDaCaricare
# ---------------------------------------------------------------------------

# @admin.register(OggettoDaCaricare)
# class OggettoDaCaricareAdmin(admin.ModelAdmin):
#     list_display = ["piano_di_carico", "oggetto", "quantita", "created_at"]
#     list_filter = ["piano_di_carico"]
#     autocomplete_fields = ["oggetto"]


# ---------------------------------------------------------------------------
# OggettoPosizionato
# ---------------------------------------------------------------------------

# @admin.register(OggettoPosizionato)
# class OggettoPosizionatoAdmin(admin.ModelAdmin):
#     list_display = [
#         "oggetto", "piano_di_carico", "coordinata_x_mm",
#         "coordinata_y_mm", "coordinata_z_mm", "rotazione_applicata", "colore",
#     ]
#     list_filter = ["piano_di_carico__nome"]
#     search_fields = ["oggetto__codice", "piano_di_carico__nome"]


# ===========================================================================
# NUOVI MODELLI: UserProfile, DemoFingerprint, ImpostazioniSistema
# ===========================================================================

class DemoFingerprintInline(admin.TabularInline):
    model = DemoFingerprint
    extra = 0
    readonly_fields = ["ip_hash", "browser_hash", "cookie_token", "created_at"]
    fields = ["ip_hash", "browser_hash", "cookie_token", "created_at"]
    can_delete = False
    verbose_name = "Fingerprint"
    verbose_name_plural = "Fingerprint"

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = [
        "user", "tipo_utente", "google_id", "trial_start",
        "trial_end", "trial_days_left", "created_at",
    ]
    list_filter = ["is_paying", "trial_end"]
    search_fields = ["user__username", "user__email", "google_id"]
    readonly_fields = ["created_at", "updated_at"]
    fieldsets = [
        ("Utente", {"fields": ["user", "is_paying"]}),
        ("Google OAuth", {"fields": ["google_id"]}),
        ("Periodo di Prova", {"fields": ["trial_start", "trial_end"]}),
        ("Timestamp", {"fields": ["created_at", "updated_at"]}),
    ]
    inlines = [DemoFingerprintInline]
    actions = ["crea_profili_mancanti"]

    @admin.display(description="Tipo")
    def tipo_utente(self, obj):
        if obj.is_paying:
            return "💰 Pagante"
        if obj.google_id:
            return "🔵 Google"
        return "🎫 Demo"

    @admin.action(
        description="🔄 Crea profili per TUTTI gli utenti che ne sono privi (globale, ignora la selezione)",
        permissions=["add"],
    )
    def crea_profili_mancanti(self, request, queryset=None):
        """Crea un UserProfile per ogni utente che ne è privo."""
        from datetime import timedelta
        from django.contrib.auth.models import User
        from django.utils import timezone

        imp = ImpostazioniSistema.get()
        users_senza_profilo = User.objects.filter(profile__isnull=True)
        creati = 0

        for user in users_senza_profilo:
            UserProfile.objects.create(
                user=user,
                trial_start=timezone.now(),
                trial_end=timezone.now() + timedelta(days=imp.giorni_prova),
            )
            creati += 1

        if creati:
            self.message_user(
                request,
                f"✅ Creati {creati} profili mancanti.",
            )
        else:
            self.message_user(
                request,
                "✅ Tutti gli utenti hanno già un profilo.",
            )

    def get_form(self, request, obj=None, **kwargs):
        form = super().get_form(request, obj, **kwargs)
        # Mostra tutti gli utenti nel dropdown (inclusi superuser/admin)
        from django.contrib.auth.models import User
        form.base_fields["user"].queryset = User.objects.all()
        return form


@admin.register(DemoFingerprint)
class DemoFingerprintAdmin(admin.ModelAdmin):
    list_display = [
        "user_profile", "ip_hash_short", "browser_hash_short",
        "cookie_token_short", "created_at",
    ]
    list_filter = ["created_at"]
    search_fields = ["ip_hash", "browser_hash", "cookie_token", "user_profile__user__username"]
    readonly_fields = ["ip_hash", "browser_hash", "cookie_token", "created_at"]

    @admin.display(description="IP Hash")
    def ip_hash_short(self, obj):
        return obj.ip_hash[:16] + "..."

    @admin.display(description="Browser Hash")
    def browser_hash_short(self, obj):
        if obj.browser_hash:
            return obj.browser_hash[:16] + "..."
        return "—"

    @admin.display(description="Cookie Token")
    def cookie_token_short(self, obj):
        if obj.cookie_token:
            return obj.cookie_token[:16] + "..."
        return "—"

    def has_add_permission(self, request):
        return False


@admin.register(ImpostazioniSistema)
class ImpostazioniSistemaAdmin(admin.ModelAdmin):
    list_display = [
        "giorni_prova", "demo_attiva", "controlli_demo_attivi",
        "google_oauth_attivo", "soglia_controlli_demo",
    ]
    fieldsets = [
        ("Periodo di Prova", {
            "fields": ["giorni_prova"],
            "description": "Durata del trial in giorni per nuovi utenti (demo e Google).",
        }),
        ("Demo", {
            "fields": ["demo_attiva", "controlli_demo_attivi", "soglia_controlli_demo"],
            "description": (
                "Abilita/disabilita l'accesso demo. I controlli anti-abuso "
                "usano IP, browser e cookie; la soglia indica quanti segnali "
                "devono coincidere per bloccare un nuovo trial."
            ),
        }),
        ("Google OAuth2", {
            "fields": ["google_oauth_attivo"],
            "description": (
                "Attiva il pulsante 'Accedi con Google' sulla landing page. "
                "Le credenziali (Client ID e Secret) vanno inserite in "
                "'Social applications' > Add > Google."
            ),
        }),
        ("Privacy — Dati del Titolare", {
            "fields": [
                "privacy_titolare", "privacy_email", "privacy_sede",
                "privacy_piva", "privacy_sito_url",
            ],
            "description": (
                "Dati mostrati nelle pagine Privacy Policy, Cookie Policy, "
                "Termini di Servizio e Rimborsi. In produzione aggiornare "
                "privacy_sito_url con il dominio reale (es. https://carico3d.com)."
            ),
        }),
    ]

    def has_add_permission(self, request):
        """Impedisce di creare nuove righe (singleton)."""
        return not ImpostazioniSistema.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False
