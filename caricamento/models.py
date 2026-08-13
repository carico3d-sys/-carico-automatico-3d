"""
Modelli Django per l'ottimizzazione del carico tridimensionale (3D Bin Packing).

Scelte architetturali:
- Dimensioni in millimetri interi (PositiveIntegerField): evitiamo errori di
  arrotondamento floating-point nei calcoli geometrici. I mm offrono
  precisione sub-centimetrica, più che sufficiente per logistica.
- Pesi in kg con DecimalField(max_digits=8, decimal_places=2): servono
  decimali per pesi frazionari, ma senza eccessiva profondità.
- I vincoli dell'oggetto sono separati in un modello dedicato (OneToOneField)
  per mantenere l'Oggetto "pulito" e permettere future estensioni senza
  toccare la tabella principale.
- Coordinate assolute dello spigolo d'ancoraggio (angolo inferiore-sinistro-
  posteriore del pacco) con PositiveIntegerField: coerente con mm interi.
"""

from decimal import Decimal

from django.db import models
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.utils.translation import gettext_lazy as _


# ---------------------------------------------------------------------------
# Segnale: creazione automatica di VincoloOggetto
# ---------------------------------------------------------------------------

def _crea_vincoli_oggetto(sender, instance, created, **kwargs):
    """Alla creazione di un Oggetto, crea automaticamente i VincoloOggetto
    con valori predefiniti, se non già presenti."""
    if created and not hasattr(instance, 'vincoli'):
        VincoloOggetto.objects.create(oggetto=instance)


models.signals.post_save.connect(_crea_vincoli_oggetto, sender="caricamento.Oggetto")



# ---------------------------------------------------------------------------
# 1. CONTENITORE (Container / Veicolo)
# ---------------------------------------------------------------------------

class TipoMezzo(models.TextChoices):
    """Tipologia di mezzo di trasporto supportata."""
    AUTOCARRO = "autocarro", _("Autocarro")
    AUTOTRENO = "autotreno", _("Autotreno")
    BILICO = "bilico", _("Autoarticolato (Bilico)")
    FURGONE = "furgone", _("Furgone")
    NAVE = "nave", _("Nave")
    TRENO = "treno", _("Treno (Carro ferroviario)")
    CONTAINER_20 = "container_20", _("Container ISO 20'")
    CONTAINER_40 = "container_40", _("Container ISO 40'")
    CONTAINER_40_HC = "container_40_hc", _("Container ISO 40' High Cube")
    ALTRO = "altro", _("Altro / Personalizzato")


class Contenitore(models.Model):
    """Rappresenta un contenitore/veicolo con dimensioni interne e portata."""

    # Nullable per consentire la migrazione dei dati legacy; i record creati
    # dall'API ricevono sempre il proprietario autenticato.
    owner = models.ForeignKey(
        "auth.User",
        on_delete=models.PROTECT,
        related_name="contenitori",
        null=True,
        blank=True,
        help_text=_("Utente proprietario del contenitore."),
    )

    nome = models.CharField(
        max_length=128,
        unique=True,
        help_text=_("Nome identificativo del contenitore (es. 'Camion A-123')."),
    )
    tipo_mezzo = models.CharField(
        max_length=24,
        choices=TipoMezzo.choices,
        default=TipoMezzo.ALTRO,
        help_text=_("Tipologia del mezzo di trasporto."),
    )
    lunghezza_mm = models.PositiveIntegerField(
        validators=[MinValueValidator(1)],
        help_text=_("Lunghezza interna (asse X) in millimetri."),
    )
    larghezza_mm = models.PositiveIntegerField(
        validators=[MinValueValidator(1)],
        help_text=_("Larghezza interna (asse Y) in millimetri."),
    )
    altezza_mm = models.PositiveIntegerField(
        validators=[MinValueValidator(1)],
        help_text=_("Altezza interna (asse Z) in millimetri."),
    )
    carico_massimo_kg = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        validators=[MinValueValidator(0.01)],
        help_text=_("Peso massimo trasportabile in chilogrammi."),
    )
    tara_kg = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        default=0,
        help_text=_("Peso a vuoto del contenitore/veicolo in chilogrammi."),
    )
    note = models.TextField(
        blank=True,
        help_text=_("Note opzionali (es. portellone, pianale, allestimento)."),
    )
    archiviato = models.BooleanField(
        default=False,
        help_text=_("Se True, il mezzo è archiviato e nascosto di default dalle liste."),
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Contenitore")
        verbose_name_plural = _("Contenitori")
        ordering = ["nome"]

    def __str__(self):
        return f"{self.nome} ({self.get_tipo_mezzo_display()})"

    @property
    def volume_mm3(self):
        """Volume interno in millimetri cubi."""
        if None in (self.lunghezza_mm, self.larghezza_mm, self.altezza_mm):
            return None
        return self.lunghezza_mm * self.larghezza_mm * self.altezza_mm

    @property
    def volume_m3(self):
        """Volume interno in metri cubi (approssimato)."""
        vol = self.volume_mm3
        if vol is None:
            return None
        return vol / 1_000_000_000

    @property
    def portata_netta_kg(self):
        """Peso massimo netto trasportabile (carico - tara) come Decimal."""
        if None in (self.carico_massimo_kg, self.tara_kg):
            return None
        return self.carico_massimo_kg - self.tara_kg

    def clean(self):
        """Valida che ogni sezione abbia fine > inizio.

        La copertura totale del cassone NON è obbligatoria:
        l'utente può definire una singola zona con peso localizzato.
        Le zone non coperte non avranno vincoli di carico per asse.
        """
        super().clean()
        if self.pk is None:
            return
        for s in self.sezioni.all():
            if s.fine_x_mm <= s.inizio_x_mm:
                raise ValidationError(
                    _("La sezione '%(nome)s' ha fine_x_mm (%(fine)d) <= "
                      "inizio_x_mm (%(inizio)d)."),
                    params={
                        "nome": s.nome,
                        "fine": s.fine_x_mm,
                        "inizio": s.inizio_x_mm,
                    },
                )


# ---------------------------------------------------------------------------
# 2. OGGETTO (Item / Pacco)
# ---------------------------------------------------------------------------

class Oggetto(models.Model):
    """Rappresenta un oggetto/pacco da imbarcare."""

    # Nullable per consentire la migrazione dei dati legacy; i record creati
    # dall'API ricevono sempre il proprietario autenticato.
    owner = models.ForeignKey(
        "auth.User",
        on_delete=models.PROTECT,
        related_name="oggetti",
        null=True,
        blank=True,
        help_text=_("Utente proprietario dell'oggetto."),
    )

    codice = models.CharField(
        max_length=64,
        unique=True,
        help_text=_("Codice univoco dell'oggetto (es. SKU, barcode, part number)."),
    )
    descrizione = models.TextField(
        blank=True,
        help_text=_("Descrizione dell'oggetto."),
    )
    lunghezza_mm = models.PositiveIntegerField(
        validators=[MinValueValidator(1)],
        help_text=_("Dimensione X (lunghezza) in millimetri."),
    )
    larghezza_mm = models.PositiveIntegerField(
        validators=[MinValueValidator(1)],
        help_text=_("Dimensione Y (larghezza) in millimetri."),
    )
    altezza_mm = models.PositiveIntegerField(
        validators=[MinValueValidator(1)],
        help_text=_("Dimensione Z (altezza) in millimetri."),
    )
    peso_kg = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        validators=[MinValueValidator(0.01)],
        help_text=_("Peso dell'oggetto in chilogrammi."),
    )
    quantita_disponibile = models.PositiveIntegerField(
        default=1,
        help_text=_("Quantità disponibile in magazzino (per oggetti multipli)."),
    )
    colore = models.CharField(
        max_length=7,
        default="",
        blank=True,
        help_text=_("Colore esadecimale personalizzato (es. #FF5733). Vuoto = assegnazione automatica."),
    )
    archiviato = models.BooleanField(
        default=False,
        help_text=_("Se True, l'oggetto è archiviato e nascosto di default dalle liste."),
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Oggetto")
        verbose_name_plural = _("Oggetti")
        ordering = ["codice"]

    def __str__(self):
        return f"{self.codice} - {self.descrizione[:50]}"

    @property
    def volume_mm3(self):
        """Volume dell'oggetto in millimetri cubi."""
        if None in (self.lunghezza_mm, self.larghezza_mm, self.altezza_mm):
            return None
        return self.lunghezza_mm * self.larghezza_mm * self.altezza_mm

    @property
    def dimensioni(self):
        """Tuple ordinata (X, Y, Z) delle dimensioni."""
        if None in (self.lunghezza_mm, self.larghezza_mm, self.altezza_mm):
            return None
        return (self.lunghezza_mm, self.larghezza_mm, self.altezza_mm)


# ---------------------------------------------------------------------------
# 3. VINCOLO OGGETTO (Item Constraints)
# ---------------------------------------------------------------------------

class VincoloOggetto(models.Model):
    """Vincoli fisici e logistici associati a un oggetto.

    Separato da Oggetto per mantenere il modello principale leggero e
    permettere future estensioni dei vincoli senza alterare la tabella
    degli oggetti.
    """

    oggetto = models.OneToOneField(
        Oggetto,
        on_delete=models.CASCADE,
        related_name="vincoli",
        help_text=_("Oggetto a cui appartengono questi vincoli."),
    )

    # -- Orientamento --
    rotazione_consentita = models.BooleanField(
        default=True,
        help_text=_(
            "Se True, l'oggetto può essere ruotato liberamente su qualsiasi asse. "
            "Se False, l'oggetto mantiene l'orientamento originale (X, Y, Z fissi)."
        ),
    )
    rotazione_su_x = models.BooleanField(
        default=True,
        help_text=_("Permette rotazione che scambia la dimensione X con Y."),
    )
    rotazione_su_y = models.BooleanField(
        default=True,
        help_text=_("Permette rotazione che scambia la dimensione Y con Z."),
    )
    rotazione_su_z = models.BooleanField(
        default=True,
        help_text=_("Permette rotazione che scambia la dimensione Z con X."),
    )

    # -- Sovrapponibilità --
    sovrapponibile = models.BooleanField(
        default=True,
        help_text=_(
            "Se True, l'oggetto può sostenere altri oggetti sopra di sé. "
            "Es. scatole di cartone sì, un carico di tubi no."
        ),
    )
    peso_massimo_tetto_kg = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        help_text=_(
            "Peso massimo (in kg) che questo oggetto può sopportare "
            "sul suo piano superiore. 0 = nessun limite (se sovrapponibile)."
        ),
    )

    # -- Ulteriori vincoli --
    fragile = models.BooleanField(
        default=False,
        help_text=_("Indica se l'oggetto è fragile (es. 'Questo lato verso l'alto')."),
    )
    merce_pericolosa = models.BooleanField(
        default=False,
        help_text=_("Indica se l'oggetto è una merce pericolosa (ADR/IMO)."),
    )
    solo_su_piano = models.BooleanField(
        default=False,
        help_text=_(
            "Se True, l'oggetto deve essere posizionato direttamente sul "
            "pavimento del contenitore (non sopra altri oggetti)."
        ),
    )
    aggancio_forche = models.BooleanField(
        default=False,
        help_text=_("Se True, l'oggetto può essere movimentato con carrello elevatore."),
    )

    note = models.TextField(
        blank=True,
        help_text=_("Note aggiuntive sui vincoli di carico."),
    )

    class Meta:
        verbose_name = _("Vincolo Oggetto")
        verbose_name_plural = _("Vincoli Oggetti")

    def __str__(self):
        return f"Vincoli: {self.oggetto.codice}"


# ---------------------------------------------------------------------------
# 4. PIANO DI CARICO (Load Plan)
# ---------------------------------------------------------------------------

class StatoPiano(models.TextChoices):
    BOZZA = "bozza", _("Bozza")
    IN_ELABORAZIONE = "in_elaborazione", _("In elaborazione")
    COMPLETATO = "completato", _("Completato")
    PARZIALE = "parziale", _("Completato parzialmente")
    FALLITO = "fallito", _("Nessuna soluzione trovata")
    ERRORE = "errore", _("Errore durante l'elaborazione")


class PianoDiCarico(models.Model):
    """Rappresenta un piano di carico: associazione tra un contenitore
    e un insieme di oggetti posizionati al suo interno."""

    # Nullable per consentire la migrazione dei dati legacy; i record creati
    # dall'API ricevono sempre il proprietario autenticato.
    owner = models.ForeignKey(
        "auth.User",
        on_delete=models.PROTECT,
        related_name="piani_di_carico",
        null=True,
        blank=True,
        help_text=_("Utente proprietario del piano di carico."),
    )

    nome = models.CharField(
        max_length=128,
        help_text=_("Nome identificativo del piano di carico (es. 'Spedizione #42')."),
    )
    contenitore = models.ForeignKey(
        Contenitore,
        on_delete=models.PROTECT,
        related_name="piani_di_carico",
        help_text=_("Il contenitore/veicolo utilizzato per questo carico."),
    )
    stato = models.CharField(
        max_length=24,
        choices=StatoPiano.choices,
        default=StatoPiano.BOZZA,
        help_text=_("Stato del processo di ottimizzazione."),
    )
    peso_totale_kg = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text=_("Peso totale del carico (calcolato dopo l'ottimizzazione)."),
    )
    volume_utilizzato_mm3 = models.PositiveBigIntegerField(
        null=True,
        blank=True,
        help_text=_("Volume totale occupato in mm³ (calcolato dopo l'ottimizzazione)."),
    )
    task_id = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        help_text=_("ID del task asincrono (coda) associato a questa elaborazione."),
    )
    algoritmo = models.CharField(
        max_length=128,
        blank=True,
        default="",
        help_text=_("Nome dell'algoritmo utilizzato per l'ottimizzazione."),
    )
    messaggio_errore = models.TextField(
        blank=True,
        help_text=_("Eventuale messaggio di errore se l'elaborazione fallisce."),
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    completato_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text=_("Timestamp di completamento dell'elaborazione."),
    )

    class Meta:
        verbose_name = _("Piano di Carico")
        verbose_name_plural = _("Piani di Carico")
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.nome} - {self.contenitore.nome} [{self.get_stato_display()}]"

    @property
    def volume_utilizzato_m3(self):
        if self.volume_utilizzato_mm3:
            return self.volume_utilizzato_mm3 / 1_000_000_000
        return None

    @property
    def saturazione_volumetrica(self):
        """Percentuale di volume utilizzato rispetto al volume del contenitore."""
        if self.volume_utilizzato_mm3 and self.contenitore.volume_mm3 > 0:
            return (self.volume_utilizzato_mm3 / self.contenitore.volume_mm3) * 100
        return None


# ---------------------------------------------------------------------------
# 5. OGGETTO DA CARICARE (Item to Load) — selezione pre-ottimizzazione
# ---------------------------------------------------------------------------

class OggettoDaCaricare(models.Model):
    """Associa un oggetto a un piano di carico PRIMA dell'ottimizzazione.

    Permette di selezionare esattamente quali oggetti caricare e in che
    quantità, prima di avviare l'ottimizzazione 3D.
    """

    piano_di_carico = models.ForeignKey(
        PianoDiCarico,
        on_delete=models.CASCADE,
        related_name="oggetti_da_caricare",
        help_text=_("Piano di carico a cui aggiungere l'oggetto."),
    )
    oggetto = models.ForeignKey(
        Oggetto,
        on_delete=models.CASCADE,
        related_name="da_caricare_in_piani",
        help_text=_("L'oggetto da caricare."),
    )
    quantita = models.PositiveIntegerField(
        default=1,
        validators=[MinValueValidator(1)],
        help_text=_("Quante unità di questo oggetto caricare."),
    )
    priorita = models.PositiveSmallIntegerField(
        default=0,
        validators=[MinValueValidator(0)],
        help_text=_("Priorità di carico (1 = massima priorità, caricato per primo). 0 = nessuna priorità."),
    )
    note = models.CharField(
        max_length=255,
        blank=True,
        help_text=_("Note opzionali per questo caricamento."),
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("Oggetto da Caricare")
        verbose_name_plural = _("Oggetti da Caricare")
        unique_together = ["piano_di_carico", "oggetto"]
        ordering = ["piano_di_carico", "priorita", "oggetto__codice"]

    def __str__(self):
        return (
            f"{self.oggetto.codice} x{self.quantita} "
            f"→ {self.piano_di_carico.nome}"
        )


# ---------------------------------------------------------------------------
# 6. OGGETTO POSIZIONATO (Positioned Item)
# ---------------------------------------------------------------------------

class OggettoPosizionato(models.Model):
    """Rappresenta un oggetto collocato all'interno del contenitore
    con coordinate assolute e rotazione applicata."""

    piano_di_carico = models.ForeignKey(
        PianoDiCarico,
        on_delete=models.CASCADE,
        related_name="oggetti_posizionati",
        help_text=_("Il piano di carico a cui appartiene questo posizionamento."),
    )
    oggetto = models.ForeignKey(
        Oggetto,
        on_delete=models.PROTECT,
        related_name="posizionamenti",
        help_text=_("L'oggetto che è stato posizionato. PROTECT: non si può eliminare un oggetto se è posizionato in un piano di carico."),
    )

    # -- Coordinate assolute dello spigolo d'ancoraggio --
    # Lo spigolo d'ancoraggio è l'angolo inferiore-sinistro-posteriore
    # del pacco (nel sistema di riferimento del contenitore).
    # Origine (0, 0, 0) = angolo inferiore-sinistro-posteriore del contenitore.
    coordinata_x_mm = models.PositiveIntegerField(
        help_text=_("Coordinata X (lunghezza) dello spigolo d'ancoraggio in mm."),
    )
    coordinata_y_mm = models.PositiveIntegerField(
        help_text=_("Coordinata Y (larghezza) dello spigolo d'ancoraggio in mm."),
    )
    coordinata_z_mm = models.PositiveIntegerField(
        help_text=_("Coordinata Z (altezza) dello spigolo d'ancoraggio in mm."),
    )

    # -- Dimensioni effettive dopo l'eventuale rotazione --
    # Questi campi memorizzano le dimensioni reali con cui l'oggetto
    # è stato posizionato, che possono differire dall'originale se
    # è stata applicata una rotazione.
    dimensione_x_mm = models.PositiveIntegerField(
        validators=[MinValueValidator(1)],
        help_text=_("Dimensione effettiva X (dopo rotazione) in mm."),
    )
    dimensione_y_mm = models.PositiveIntegerField(
        validators=[MinValueValidator(1)],
        help_text=_("Dimensione effettiva Y (dopo rotazione) in mm."),
    )
    dimensione_z_mm = models.PositiveIntegerField(
        validators=[MinValueValidator(1)],
        help_text=_("Dimensione effettiva Z (dopo rotazione) in mm."),
    )

    # -- Rotazione applicata (descrittiva) --
    # Memorizza la rotazione come permutation degli assi originali.
    # Formato: "XYZ" = nessuna rotazione, "YXZ" = X<->Y, "ZYX" = X<->Z, etc.
    rotazione_applicata = models.CharField(
        max_length=3,
        default="XYZ",
        help_text=_(
            "Permutazione degli assi applicata all'oggetto. "
            "Es. 'XYZ' = originale, 'YXZ' = X e Y scambiati."
        ),
    )

    # -- Colore esadecimale per la visualizzazione 3D --
    colore = models.CharField(
        max_length=7,
        default="#4488ff",
        help_text=_("Colore esadecimale (es. #FF5733) per la visualizzazione 3D."),
    )

    peso_posato_sopra_kg = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        default=0,
        help_text=_("Peso cumulativo degli oggetti appoggiati sopra questo (calcolato)."),
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("Oggetto Posizionato")
        verbose_name_plural = _("Oggetti Posizionati")
        ordering = ["id"]

    def __str__(self):
        return (
            f"{self.oggetto.codice} @ ({self.coordinata_x_mm}, "
            f"{self.coordinata_y_mm}, {self.coordinata_z_mm}) "
            f"[{self.piano_di_carico.nome}]"
        )

    @property
    def volume_mm3(self):
        """Volume effettivo occupato nel contenitore."""
        return self.dimensione_x_mm * self.dimensione_y_mm * self.dimensione_z_mm

    @property
    def coordinate_punti_estremi(self):
        """Restituisce le coordinate dei 4 vertici inferiori e 4 superiori
        del pacco per il debug / rendering."""

        def _spigoli_base():
            x, y, z = self.coordinata_x_mm, self.coordinata_y_mm, self.coordinata_z_mm
            dx, dy, dz = self.dimensione_x_mm, self.dimensione_y_mm, self.dimensione_z_mm
            return {
                "spigolo_inf_sx_post": (x, y, z),
                "spigolo_inf_dx_post": (x + dx, y, z),
                "spigolo_inf_sx_ant": (x, y + dy, z),
                "spigolo_inf_dx_ant": (x + dx, y + dy, z),
                "spigolo_sup_sx_post": (x, y, z + dz),
                "spigolo_sup_dx_post": (x + dx, y, z + dz),
                "spigolo_sup_sx_ant": (x, y + dy, z + dz),
                "spigolo_sup_dx_ant": (x + dx, y + dy, z + dz),
            }

        return _spigoli_base()


# ---------------------------------------------------------------------------
# 7. VINCOLO TRA OGGETTI (Pairwise Constraints)
# ---------------------------------------------------------------------------

class TipoRelazione(models.TextChoices):
    """Tipi di relazione vincolante tra coppie di oggetti."""
    SOPRA = "sopra", _("A deve stare sopra B")


class VincoloTraOggetti(models.Model):
    """Vincolo relazionale tra due oggetti (A e B).

    Definisce regole di posizionamento reciproco, sequenza di carico
    o distanza tra coppie di oggetti.
    """

    oggetto_a = models.ForeignKey(
        Oggetto,
        on_delete=models.CASCADE,
        related_name="vincoli_come_a",
        help_text=_("Oggetto A della relazione."),
    )
    oggetto_b = models.ForeignKey(
        Oggetto,
        on_delete=models.CASCADE,
        related_name="vincoli_come_b",
        help_text=_("Oggetto B della relazione."),
    )
    tipo_relazione = models.CharField(
        max_length=20,
        choices=TipoRelazione.choices,
        help_text=_("Tipo di vincolo tra A e B."),
    )

    attivo = models.BooleanField(
        default=True,
        help_text=_("Se False, il vincolo è disattivato e non applicato."),
    )
    dettagli_posizionamento = models.JSONField(
        null=True,
        blank=True,
        default=None,
        help_text=_(
            "Dettagli della configurazione di posizionamento. "
            "Formato: {configurazioni_valide: [{rotA: 'LxPxH', rotB: 'LxPxH'}], "
            "configurazione_selezionata: null|int}."
        ),
    )
    note = models.TextField(
        blank=True,
        help_text=_("Note opzionali sul vincolo."),
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Vincolo tra Oggetti")
        verbose_name_plural = _("Vincoli tra Oggetti")
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["oggetto_a", "oggetto_b", "tipo_relazione"],
                name="unique_vincolo_tra_oggetti",
            ),
        ]

    def __str__(self):
        return f"{self.oggetto_a.codice} {self.get_tipo_relazione_display()} {self.oggetto_b.codice}"


# ---------------------------------------------------------------------------
# 8. SEZIONE DI CARICO (Load Section / Axle Zone)
# ---------------------------------------------------------------------------

class SezioneCarico(models.Model):
    """Una sezione/asse del veicolo con la sua zona di competenza e limite.

    Ogni sezione rappresenta una zona del cassone con un carico massimo
    ammissibile. Le sezioni possono coprire una parte della lunghezza
    o l'intero cassone — le zone non coperte non avranno vincoli di peso.

    Il baricentro della sezione è automaticamente al centro geometrico
    (inizio + fine) / 2.
    """

    contenitore = models.ForeignKey(
        Contenitore,
        on_delete=models.CASCADE,
        related_name="sezioni",
        help_text=_("Il contenitore/veicolo a cui appartiene questa sezione."),
    )
    nome = models.CharField(
        max_length=64,
        help_text=_("Nome descrittivo (es. 'Zona 1 - Tridem anteriore')."),
    )
    inizio_x_mm = models.PositiveIntegerField(
        help_text=_("Inizio della zona sull'asse X (lunghezza) in mm. Deve partire da 0."),
    )
    fine_x_mm = models.PositiveIntegerField(
        help_text=_("Fine della zona sull'asse X in mm. Deve essere > inizio."),
    )
    carico_massimo_kg = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        validators=[MinValueValidator(0.01)],
        help_text=_("Carico massimo ammissibile per questa sezione in kg."),
    )

    class Meta:
        verbose_name = _("Sezione di Carico")
        verbose_name_plural = _("Sezioni di Carico")
        ordering = ["inizio_x_mm"]

    def __str__(self):
        return (
            f"{self.nome}: {self.inizio_x_mm}→{self.fine_x_mm} mm, "
            f"max {self.carico_massimo_kg} kg"
        )

    @property
    def baricentro_x_mm(self):
        """Baricentro della sezione sull'asse X (centro geometrico)."""
        return (self.inizio_x_mm + self.fine_x_mm) // 2

    @property
    def lunghezza_mm(self):
        """Lunghezza della sezione in mm."""
        return self.fine_x_mm - self.inizio_x_mm


# ---------------------------------------------------------------------------
# 9. PROFILO UTENTE (UserProfile)
# ---------------------------------------------------------------------------

class UserProfile(models.Model):
    """Estensione del modello User di Django con dati per il trial e Google OAuth."""

    user = models.OneToOneField(
        "auth.User",
        on_delete=models.CASCADE,
        related_name="profile",
        help_text=_("Utente Django associato."),
    )
    google_id = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        unique=True,
        help_text=_("ID account Google (sub) per OAuth2. Unico per utente."),
    )
    trial_start = models.DateTimeField(
        null=True,
        blank=True,
        help_text=_("Data di inizio del periodo di prova."),
    )
    trial_end = models.DateTimeField(
        null=True,
        blank=True,
        help_text=_("Data di fine del periodo di prova (scadenza)."),
    )
    is_paying = models.BooleanField(
        default=False,
        help_text=_("Utente pagante: accesso illimitato senza scadenza trial."),
    )
    impostazioni_ottimizzatore = models.JSONField(
        default=dict,
        blank=True,
        help_text=_("Preferenze personali del workspace e dell'ottimizzatore."),
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Profilo Utente")
        verbose_name_plural = _("Profili Utente")

    def __str__(self):
        tipo = "💰" if self.is_paying else "🕐"
        return f"{tipo} {self.user.username}"

    @property
    def is_trial_active(self):
        """True se il periodo di prova è ancora valido."""
        if self.is_paying:
            return True
        if self.trial_end is None:
            return True
        from django.utils import timezone
        return timezone.now() < self.trial_end

    @property
    def trial_days_left(self):
        """Giorni rimanenti di prova (0 se scaduta)."""
        if self.is_paying or self.trial_end is None:
            return None
        from django.utils import timezone
        delta = self.trial_end - timezone.now()
        return max(0, delta.days)


# ---------------------------------------------------------------------------
# 10. DEMO FINGERPRINT (Anti-abuso — 3 controlli)
# ---------------------------------------------------------------------------

class DemoFingerprint(models.Model):
    """Traccia i 3 segnali identificativi per prevenire abusi della demo.

    Quando una demo scade, i fingerprint restano nel DB per bloccare
    tentativi futuri con gli stessi segnali (IP, browser, cookie).
    """

    user_profile = models.ForeignKey(
        UserProfile,
        on_delete=models.CASCADE,
        related_name="fingerprints",
        help_text=_("Profilo utente associato a questo fingerprint."),
    )
    ip_hash = models.CharField(
        max_length=64,
        db_index=True,
        help_text=_("SHA256 hash dell'IP del visitatore."),
    )
    browser_hash = models.CharField(
        max_length=64,
        null=True,
        blank=True,
        db_index=True,
        help_text=_("Hash del fingerprint del browser (JS lato client)."),
    )
    cookie_token = models.CharField(
        max_length=128,
        null=True,
        blank=True,
        db_index=True,
        help_text=_("Token persistente firmato lato server, salvato nel cookie."),
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("Fingerprint Demo")
        verbose_name_plural = _("Fingerprint Demo")
        unique_together = [["user_profile", "ip_hash"]]
        indexes = [
            models.Index(fields=["ip_hash"]),
            models.Index(fields=["browser_hash"]),
            models.Index(fields=["cookie_token"]),
        ]

    def __str__(self):
        return f"Fingerprint per {self.user_profile.user.username}"


# ---------------------------------------------------------------------------
# 11. IMPOSTAZIONI SISTEMA (Configurabili da admin)
# ---------------------------------------------------------------------------

class ImpostazioniSistema(models.Model):
    """Configurazione globale del sistema, modificabile dal pannello admin.

    Singleton: esiste sempre una sola riga (pk=1).
    """

    giorni_prova = models.PositiveIntegerField(
        default=14,
        help_text=_("Durata del periodo di prova in giorni (default: 14)."),
    )
    demo_attiva = models.BooleanField(
        default=True,
        help_text=_("Se attivo, gli utenti possono accedere con account demo."),
    )
    controlli_demo_attivi = models.BooleanField(
        default=True,
        help_text=_(
            "Se attivo, IP/browser/cookie impediscono di ottenere più trial "
            "dallo stesso dispositivo o dalla stessa rete."
        ),
    )
    google_oauth_attivo = models.BooleanField(
        default=False,
        help_text=_(
            "Abilita il pulsante 'Accedi con Google' sulla landing page. "
            "Richiede una Social Application Google configurata in "
            "'Social applications' (Client ID + Secret da Google Cloud Console)."
        ),
    )
    soglia_controlli_demo = models.PositiveSmallIntegerField(
        default=1,
        validators=[MinValueValidator(1), MaxValueValidator(3)],
        help_text=_(
            "Numero minimo di controlli (su 3) che devono matchare per "
            "bloccare un utente demo. 1 = basta 1 match, 3 = tutti e 3."
        ),
    )

    class Meta:
        verbose_name = _("Impostazioni Sistema")
        verbose_name_plural = _("Impostazioni Sistema")

    def __str__(self):
        return (
            f"⚙️ Impostazioni (prova: {self.giorni_prova}gg, "
            f"demo: {'ON' if self.demo_attiva else 'OFF'}, "
            f"anti-abuso: {'ON' if self.controlli_demo_attivi else 'OFF'})"
        )

    def save(self, *args, **kwargs):
        """Forza il singleton: salva sempre su pk=1."""
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def get(cls):
        """Restituisce l'istanza singleton, creandola se non esiste."""
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


# ---------------------------------------------------------------------------
# Segnale: creazione automatica di UserProfile per ogni nuovo User
# ---------------------------------------------------------------------------

def _crea_profilo_utente(sender, instance, created, **kwargs):
    """Alla creazione di un User, crea automaticamente il UserProfile
    se non già presente. Garantisce che ogni utente abbia sempre un profilo,
    anche se creato direttamente dall'admin Django."""
    if created:
        UserProfile.objects.get_or_create(user=instance)


models.signals.post_save.connect(
    _crea_profilo_utente,
    sender="auth.User",
    dispatch_uid="crea_profilo_utente",
)
