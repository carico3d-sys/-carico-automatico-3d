"""
Serializzatori Django REST Framework per il sistema di ottimizzazione
carico tridimensionale.

Fornisce sia serializzatori compatti (liste) che dettagliati
(con nidificazione per il frontend Three.js).
"""

from rest_framework import serializers

from .models import (
    Contenitore,
    Oggetto,
    OggettoPosizionato,
    PianoDiCarico,
    SezioneCarico,
    VincoloOggetto,
    VincoloTraOggetti,
)


# ===========================================================================
# Contenitore
# ===========================================================================

class ContenitoreListSerializer(serializers.ModelSerializer):
    """Serializzatore compatto per le liste."""
    tipo_mezzo_display = serializers.CharField(
        source="get_tipo_mezzo_display", read_only=True
    )
    volume_m3 = serializers.FloatField(read_only=True)

    class Meta:
        model = Contenitore
        fields = [
            "id",
            "nome",
            "tipo_mezzo",
            "tipo_mezzo_display",
            "lunghezza_mm",
            "larghezza_mm",
            "altezza_mm",
            "carico_massimo_kg",
            "volume_m3",
            "note",
            "archiviato",
        ]


class SezioneCaricoSerializer(serializers.ModelSerializer):
    """Serializzatore per le sezioni di carico (assi)."""
    baricentro_x_mm = serializers.IntegerField(read_only=True)
    lunghezza_mm = serializers.IntegerField(read_only=True)

    class Meta:
        model = SezioneCarico
        fields = [
            "id",
            "nome",
            "inizio_x_mm",
            "fine_x_mm",
            "carico_massimo_kg",
            "baricentro_x_mm",
            "lunghezza_mm",
        ]
        read_only_fields = ["id", "baricentro_x_mm", "lunghezza_mm"]


class SezioneCaricoWriteSerializer(serializers.Serializer):
    """Serializzatore per la scrittura bulk delle sezioni."""
    id = serializers.IntegerField(required=False)
    nome = serializers.CharField(max_length=64)
    inizio_x_mm = serializers.IntegerField(min_value=0)
    fine_x_mm = serializers.IntegerField(min_value=1)
    carico_massimo_kg = serializers.DecimalField(max_digits=8, decimal_places=2)


class ContenitoreDetailSerializer(serializers.ModelSerializer):
    """Serializzatore dettagliato con tutte le proprietà."""
    sezioni = SezioneCaricoSerializer(many=True, read_only=True)
    volume_mm3 = serializers.IntegerField(read_only=True)
    volume_m3 = serializers.FloatField(read_only=True)
    portata_netta_kg = serializers.DecimalField(
        max_digits=8, decimal_places=2, read_only=True
    )

    class Meta:
        model = Contenitore
        fields = [
            "id",
            "nome",
            "tipo_mezzo",
            "lunghezza_mm",
            "larghezza_mm",
            "altezza_mm",
            "carico_massimo_kg",
            "tara_kg",
            "portata_netta_kg",
            "volume_mm3",
            "volume_m3",
            "note",
            "archiviato",
            "sezioni",
            "created_at",
            "updated_at",
        ]


# ===========================================================================
# Oggetto
# ===========================================================================

class VincoloOggettoSerializer(serializers.ModelSerializer):
    """Serializzatore per i vincoli dell'oggetto."""

    class Meta:
        model = VincoloOggetto
        fields = [
            "rotazione_consentita",
            "rotazione_su_x",
            "rotazione_su_y",
            "rotazione_su_z",
            "sovrapponibile",
            "peso_massimo_tetto_kg",
            "fragile",
            "merce_pericolosa",
            "solo_su_piano",
            "aggancio_forche",
        ]


class OggettoListSerializer(serializers.ModelSerializer):
    """Serializzatore compatto per le liste."""
    volume_mm3 = serializers.IntegerField(read_only=True)

    class Meta:
        model = Oggetto
        fields = [
            "id",
            "codice",
            "descrizione",
            "lunghezza_mm",
            "larghezza_mm",
            "altezza_mm",
            "peso_kg",
            "volume_mm3",
            "quantita_disponibile",
            "colore",
            "archiviato",
        ]


class OggettoDetailSerializer(serializers.ModelSerializer):
    """Serializzatore dettagliato con vincoli incorporati."""
    vincoli = VincoloOggettoSerializer(read_only=True)
    volume_mm3 = serializers.IntegerField(read_only=True)

    class Meta:
        model = Oggetto
        fields = [
            "id",
            "codice",
            "descrizione",
            "lunghezza_mm",
            "larghezza_mm",
            "altezza_mm",
            "peso_kg",
            "volume_mm3",
            "quantita_disponibile",
            "colore",
            "archiviato",
            "vincoli",
            "created_at",
            "updated_at",
        ]


# ===========================================================================
# OggettoPosizionato — il cuore del payload per il frontend 3D
# ===========================================================================

class OggettoPosizionatoSerializer(serializers.ModelSerializer):
    """Serializzatore per gli oggetti posizionati.

    Questo è il formato che il frontend Three.js consumerà per
    disegnare i cubi/pacchi all'interno del contenitore 3D.
    """
    codice = serializers.CharField(source="oggetto.codice", read_only=True)
    descrizione = serializers.CharField(
        source="oggetto.descrizione", read_only=True
    )

    class Meta:
        model = OggettoPosizionato
        fields = [
            "id",
            "codice",
            "descrizione",
            # Coordinate dello spigolo d'ancoraggio (angolo inf-sx-post)
            "coordinata_x_mm",
            "coordinata_y_mm",
            "coordinata_z_mm",
            # Dimensioni effettive (dopo eventuale rotazione)
            "dimensione_x_mm",
            "dimensione_y_mm",
            "dimensione_z_mm",
            # Metadati di posizionamento
            "rotazione_applicata",
            "colore",
            "peso_posato_sopra_kg",
        ]


# ===========================================================================
# PianoDiCarico — l'endpoint principale richiesto
# ===========================================================================

class PianoDiCaricoListSerializer(serializers.ModelSerializer):
    """Serializzatore compatto per il catalogo piani."""
    contenitore_nome = serializers.CharField(
        source="contenitore.nome", read_only=True
    )
    stato_display = serializers.CharField(
        source="get_stato_display", read_only=True
    )
    saturazione = serializers.FloatField(
        source="saturazione_volumetrica", read_only=True
    )
    num_oggetti = serializers.IntegerField(read_only=True)

    class Meta:
        model = PianoDiCarico
        fields = [
            "id",
            "nome",
            "contenitore_nome",
            "stato",
            "stato_display",
            "saturazione",
            "peso_totale_kg",
            "num_oggetti",
            "task_id",
            "created_at",
            "completato_at",
        ]


class PianoDiCaricoDetailSerializer(serializers.ModelSerializer):
    """Serializzatore dettagliato del piano di carico.

    Questo è l'endpoint principale richiesto dalla SEZIONE 3:
    dato l'ID di un PianoDiCarico completato, estrae:
    - Le dimensioni del contenitore
    - Le coordinate/dimensioni/colori di tutti i pacchi
    - Le metriche di riempimento
    """
    contenitore = ContenitoreDetailSerializer(read_only=True)
    oggetti_posizionati = OggettoPosizionatoSerializer(
        many=True, read_only=True
    )
    saturazione_volumetrica = serializers.FloatField(read_only=True)
    volume_m3 = serializers.FloatField(
        source="volume_utilizzato_m3", read_only=True
    )

    class Meta:
        model = PianoDiCarico
        fields = [
            "id",
            "nome",
            "contenitore",
            "stato",
            "oggetti_posizionati",
            "peso_totale_kg",
            "volume_m3",
            "saturazione_volumetrica",
            "task_id",
            "messaggio_errore",
            "created_at",
            "updated_at",
            "completato_at",
        ]


# ===========================================================================
# Serializzatori per scrittura (creazione/aggiornamento)
# ===========================================================================

class PianoDiCaricoCreateSerializer(serializers.ModelSerializer):
    """Serializzatore per la creazione di un nuovo piano di carico."""

    class Meta:
        model = PianoDiCarico
        fields = ["id", "nome", "contenitore", "stato"]

    def create(self, validated_data):
        validated_data["stato"] = "bozza"
        return super().create(validated_data)



class OggettoDaCaricareSerializer(serializers.Serializer):
    """Serializzatore per aggiungere oggetti a un piano via API."""
    oggetto_id = serializers.IntegerField(min_value=1)
    quantita = serializers.IntegerField(default=1, min_value=1)
    priorita = serializers.IntegerField(default=0, min_value=0)
    note = serializers.CharField(required=False, allow_blank=True)


class StrategiaOttimizzazioneSerializer(serializers.Serializer):
    """Sezione 3: Strategia di Ottimizzazione."""
    # Nessun default qui: questo serializer è condiviso dall'API delle
    # preferenze personali, dove un aggiornamento parziale deve conservare i
    # campi già salvati. I default per la configurazione di ottimizzazione
    # vengono applicati esplicitamente da ConfigurazioneOttimizzazioneSerializer.
    algoritmo_base = serializers.ChoiceField(
        choices=[
            'Algoritmo 3D Semplificato',
        ],
        required=False,
    )
    priorita_obiettivi = serializers.ListField(
        child=serializers.CharField(),
        required=False,
    )
    ordinamento_casuale = serializers.BooleanField(
        required=False,
        help_text="Se True, usa ordinamento casuale (Monte Carlo) invece che per dimensione.",
    )
    distribuzione_pesi_attiva = serializers.BooleanField(
        required=False,
        help_text="Se True, attiva il controllo dei limiti di peso sulle sezioni del contenitore.",
    )
    compattazione_aggressiva = serializers.BooleanField(
        required=False,
        help_text="Se True, permette l'incastro di oggetti sotto lo sbalzo di oggetti impilati.",
    )
    backtracking_avanzato = serializers.BooleanField(
        required=False,
        help_text="Se True, attiva il backtracking a blocchi v3 (5 iterazioni mirate).",
    )


class ImpostazioniOutputSerializer(serializers.Serializer):
    """Campi consentiti per le preferenze di output del workspace."""
    azzera_grafico_pesi_nei_vuoti = serializers.BooleanField(required=False)
    mostra_etichette_oggetti = serializers.BooleanField(required=False)
    mostra_etichetta_contenitore = serializers.BooleanField(required=False)
    modalita_rotazione = serializers.ChoiceField(
        choices=["baricentrica", "eccentrica"], required=False
    )


class ImpostazioniManualeSerializer(serializers.Serializer):
    """Campi consentiti per la modalità manuale."""
    strategia_piazzamento = serializers.ChoiceField(
        choices=["muro", "colonne"], required=False
    )
    massima_sporgenza_pct = serializers.IntegerField(
        min_value=0, max_value=100, required=False
    )


class ImpostazioniOttimizzatoreSerializer(serializers.Serializer):
    """Valida le sezioni delle preferenze personali del workspace.

    Le sezioni e i campi sono opzionali per consentire aggiornamenti parziali;
    i valori mancanti vengono mantenuti dal backend.
    """
    strategia_ottimizzazione = StrategiaOttimizzazioneSerializer(required=False)
    output_ottimizzazione = ImpostazioniOutputSerializer(required=False)
    manuale = ImpostazioniManualeSerializer(required=False)

    def validate(self, data):
        # DRF ignora di default le chiavi sconosciute nei Serializer annidati;
        # rifiutiamole esplicitamente per non memorizzare configurazioni arbitrarie.
        allowed_sections = set(self.fields)
        unknown_sections = set(self.initial_data or {}) - allowed_sections
        if unknown_sections:
            raise serializers.ValidationError({
                "sezioni": "Sezioni non ammesse: " + ", ".join(sorted(unknown_sections)),
            })

        for section_name, section_data in (self.initial_data or {}).items():
            if not isinstance(section_data, dict):
                raise serializers.ValidationError({
                    section_name: "La sezione deve essere un oggetto JSON.",
                })
            allowed_fields = set(self.fields[section_name].fields)
            unknown_fields = set(section_data) - allowed_fields
            if unknown_fields:
                raise serializers.ValidationError({
                    section_name: "Campi non ammessi: " + ", ".join(sorted(unknown_fields)),
                })
        return data


class ConfigurazioneOttimizzazioneSerializer(serializers.Serializer):
    """Serializzatore per la configurazione completa dell'ottimizzatore."""
    strategia_ottimizzazione = StrategiaOttimizzazioneSerializer(required=False)
    def validate(self, data):
        """Applica i valori di default per i campi mancanti."""
        from .engine import get_configurazione_default
        defaults = get_configurazione_default()
        for sezione in ('strategia_ottimizzazione',):
            if sezione not in data or data[sezione] is None:
                data[sezione] = {}
            # Merge con default per campi mancanti
            for k, v in defaults[sezione].items():
                if k not in data[sezione] or data[sezione][k] is None:
                    data[sezione][k] = v
        return data


class AvviaOttimizzazioneSerializer(serializers.Serializer):
    """Serializzatore per l'endpoint di avvio ottimizzazione."""
    asincrono = serializers.BooleanField(
        default=True,
        help_text="Se True, esegue in coda asincrona (Django Q2). "
                  "Se False, esegue in tempo reale (solo per test).",
    )
    salva_risultato = serializers.BooleanField(
        default=True,
        help_text="Se False, esegue una preview senza salvare i posizionamenti.",
    )
    config = ConfigurazioneOttimizzazioneSerializer(
        required=False,
        help_text="Configurazione dell'ottimizzatore (Strategia, Performance, Output).",
    )


class VincoloOggettoUpdateSerializer(serializers.ModelSerializer):
    """Serializzatore per la creazione/aggiornamento dei vincoli oggetto."""

    class Meta:
        model = VincoloOggetto
        fields = [
            "rotazione_consentita",
            "rotazione_su_x",
            "rotazione_su_y",
            "rotazione_su_z",
            "sovrapponibile",
            "peso_massimo_tetto_kg",
            "fragile",
            "merce_pericolosa",
            "solo_su_piano",
            "aggancio_forche",
            "note",
        ]


# ===========================================================================
# VincoloTraOggetti
# ===========================================================================

class VincoloTraOggettiSerializer(serializers.ModelSerializer):
    """Serializzatore per i vincoli tra coppie di oggetti."""
    oggetto_a_codice = serializers.CharField(source="oggetto_a.codice", read_only=True)
    oggetto_b_codice = serializers.CharField(source="oggetto_b.codice", read_only=True)
    tipo_relazione_display = serializers.CharField(source="get_tipo_relazione_display", read_only=True)

    class Meta:
        model = VincoloTraOggetti
        fields = [
            "id",
            "oggetto_a",
            "oggetto_a_codice",
            "oggetto_b",
            "oggetto_b_codice",
            "tipo_relazione",
            "tipo_relazione_display",
            "attivo",
            "dettagli_posizionamento",
            "note",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]


class ContenitoreCreateSerializer(serializers.ModelSerializer):
    """Serializzatore per la creazione di un nuovo contenitore dal workspace."""
    lunghezza_cm = serializers.FloatField(write_only=True)
    larghezza_cm = serializers.FloatField(write_only=True)
    altezza_cm = serializers.FloatField(write_only=True)

    class Meta:
        model = Contenitore
        fields = [
            "id",
            "nome",
            "tipo_mezzo",
            "lunghezza_cm",
            "larghezza_cm",
            "altezza_cm",
            "lunghezza_mm",
            "larghezza_mm",
            "altezza_mm",
            "carico_massimo_kg",
            "note",
            "archiviato",
        ]
        read_only_fields = ["lunghezza_mm", "larghezza_mm", "altezza_mm"]

    def create(self, validated_data):
        validated_data["lunghezza_mm"] = int(validated_data.pop("lunghezza_cm") * 10)
        validated_data["larghezza_mm"] = int(validated_data.pop("larghezza_cm") * 10)
        validated_data["altezza_mm"] = int(validated_data.pop("altezza_cm") * 10)
        return super().create(validated_data)


class OggettoCreateSerializer(serializers.ModelSerializer):
    """Serializzatore per la creazione di un nuovo oggetto dal workspace.
    Accetta dimensioni in cm e le converte in mm.
    """
    lunghezza_cm = serializers.FloatField(write_only=True)
    larghezza_cm = serializers.FloatField(write_only=True)
    altezza_cm = serializers.FloatField(write_only=True)

    class Meta:
        model = Oggetto
        fields = [
            "id",
            "codice",
            "descrizione",
            "lunghezza_cm",
            "larghezza_cm",
            "altezza_cm",
            "lunghezza_mm",
            "larghezza_mm",
            "altezza_mm",
            "peso_kg",
            "quantita_disponibile",
            "colore",
            "archiviato",
        ]
        read_only_fields = ["lunghezza_mm", "larghezza_mm", "altezza_mm"]

    def create(self, validated_data):
        validated_data["lunghezza_mm"] = int(validated_data.pop("lunghezza_cm") * 10)
        validated_data["larghezza_mm"] = int(validated_data.pop("larghezza_cm") * 10)
        validated_data["altezza_mm"] = int(validated_data.pop("altezza_cm") * 10)
        return super().create(validated_data)
