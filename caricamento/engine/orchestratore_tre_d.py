"""
Orchestratore dedicato per l'algoritmo 3D Semplificato (TreDPacker).

Elimina tutte le dipendenze da py3dbp, CustomPacker e post-processing
inutili (swap_coupling, gap optimization). Fa solo cio' che serve:
1. Carica dati dal DB
2. Crea e popola TreDPacker
3. Esegue l'algoritmo
4. Salva i risultati

Interfaccia identica a EseguiOttimizzazione() di bin_packing.py:
restituisce OptimizerResult.
"""

from decimal import Decimal
from typing import Optional

from django.db import transaction
from django.utils import timezone

from ..models import (
    Oggetto,
    OggettoDaCaricare,
    OggettoPosizionato,
    PianoDiCarico,
    StatoPiano,
    VincoloOggetto,
    VincoloTraOggetti,
)

from .common import (
    ConfigurazioneOttimizzazione,
    OptimizerResult,
    _build_lookup_vincoli_tra,
    _genera_colore_da_oggetto,
)
from .tre_d import TreDPacker


def esegui_ottimizzazione_tre_d(
    piano_id: int,
    config: Optional[ConfigurazioneOttimizzazione] = None,
) -> OptimizerResult:
    """Esegue l'ottimizzazione con solo TreDPacker e salva i risultati.

    Args:
        piano_id: PK del PianoDiCarico.
        config: configurazione dell'ottimizzatore (opzionale).

    Returns:
        OptimizerResult con lo stato dell'operazione e le metriche.
    """
    # 1. Carica piano e contenitore
    try:
        piano = PianoDiCarico.objects.select_related("contenitore").get(pk=piano_id)
    except PianoDiCarico.DoesNotExist:
        return OptimizerResult(
            successo=False,
            piano_id=piano_id,
            messaggio=f"PianoDiCarico ID={piano_id} non trovato.",
        )

    contenitore = piano.contenitore
    dims = (contenitore.lunghezza_mm, contenitore.larghezza_mm, contenitore.altezza_mm)
    sezioni = list(contenitore.sezioni.all())

    # Vincoli tra oggetti
    vincoli_tra_qs = VincoloTraOggetti.objects.filter(attivo=True).select_related(
        "oggetto_a", "oggetto_b"
    )
    vincoli_tra_lookup = _build_lookup_vincoli_tra(vincoli_tra_qs)

    # Oggetti da caricare (con fallback)
    oggetti_da_caricare = OggettoDaCaricare.objects.filter(
        piano_di_carico=piano
    ).select_related("oggetto__vincoli")

    oggetti_fallback = Oggetto.objects.filter(
        quantita_disponibile__gte=1
    ).select_related("vincoli")

    if not oggetti_da_caricare.exists() and not oggetti_fallback.exists():
        piano.stato = StatoPiano.FALLITO
        piano.messaggio_errore = "Nessun oggetto selezionato ne' disponibile."
        piano.completato_at = timezone.now()
        piano.save(update_fields=["stato", "messaggio_errore", "completato_at"])
        return OptimizerResult(
            successo=False,
            piano_id=piano.id,
            container_nome=contenitore.nome,
            container_dimensioni=dims,
            messaggio="Nessun oggetto selezionato ne' disponibile.",
        )

    # 2. Crea e popola il packer
    packer = TreDPacker(
        dims,
        contenitore.carico_massimo_kg,
        configurazione=config,
        vincoli_tra_lookup=vincoli_tra_lookup,
        sezioni=sezioni,
    )
    _popola_tre_d(packer, oggetti_da_caricare, oggetti_fallback)

    # 3. Esegui
    piano.stato = StatoPiano.IN_ELABORAZIONE
    piano.save(update_fields=["stato"])

    try:
        packer.esegui()
    except Exception as exc:
        piano.stato = StatoPiano.ERRORE
        piano.messaggio_errore = f"{type(exc).__name__}: {exc}"
        piano.completato_at = timezone.now()
        piano.save(update_fields=["stato", "messaggio_errore", "completato_at"])
        return OptimizerResult(
            successo=False,
            piano_id=piano.id,
            container_nome=contenitore.nome,
            container_dimensioni=dims,
            messaggio=str(exc),
        )

    # 4. Salva risultati nel DB
    peso_totale = sum(float(r.peso_kg) for r in packer.results)
    volume_totale = sum(
        r.dimensione_x_mm * r.dimensione_y_mm * r.dimensione_z_mm
        for r in packer.results
    )

    with transaction.atomic():
        piano.oggetti_posizionati.all().delete()
        for r in packer.results:
            OggettoPosizionato.objects.create(
                piano_di_carico=piano,
                oggetto_id=r.oggetto_id,
                coordinata_x_mm=r.coordinata_x_mm,
                coordinata_y_mm=r.coordinata_y_mm,
                coordinata_z_mm=r.coordinata_z_mm,
                dimensione_x_mm=r.dimensione_x_mm,
                dimensione_y_mm=r.dimensione_y_mm,
                dimensione_z_mm=r.dimensione_z_mm,
                rotazione_applicata=r.rotazione_applicata,
                colore=r.colore,
                peso_posato_sopra_kg=r.peso_sopra_kg,
            )

        piano.stato = StatoPiano.COMPLETATO
        piano.peso_totale_kg = Decimal(str(round(peso_totale, 2)))
        piano.volume_utilizzato_mm3 = volume_totale
        piano.algoritmo = "Algoritmo 3D Semplificato" + (" 🎲 Monte Carlo" if (config and config.ordinamento_casuale) else "")
        piano.completato_at = timezone.now()
        piano.messaggio_errore = ""
        piano.save(update_fields=[
            "stato", "peso_totale_kg", "volume_utilizzato_mm3",
            "algoritmo", "completato_at", "messaggio_errore",
        ])

    # 5. Metriche
    volume_container = dims[0] * dims[1] * dims[2]
    saturazione = (volume_totale / volume_container * 100) if volume_container > 0 else 0
    metriche = packer.genera_metriche()

    oggetti_non_posizionati = list(packer.unfitted_codes)

    return OptimizerResult(
        successo=True,
        piano_id=piano.id,
        container_nome=contenitore.nome,
        container_dimensioni=dims,
        oggetti_posizionati=list(packer.results),
        oggetti_non_posizionati=oggetti_non_posizionati,
        peso_totale_kg=piano.peso_totale_kg,
        volume_utilizzato_mm3=volume_totale,
        saturazione_percentuale=round(saturazione, 1),
        metriche=metriche,
        messaggio=f"Completato: {len(packer.results)} oggetti posizionati.",
    )


def _popola_tre_d(packer, oggetti_da_caricare, oggetti_fallback_qs) -> None:
    """Popola un TreDPacker con gli oggetti dal DB."""
    if oggetti_da_caricare.exists():
        for o_dc in oggetti_da_caricare:
            oggetto = o_dc.oggetto
            priorita = o_dc.priorita
            for _ in range(o_dc.quantita):
                try:
                    vincoli = oggetto.vincoli
                except VincoloOggetto.DoesNotExist:
                    vincoli = None
                colore = _genera_colore_da_oggetto(oggetto.id, oggetto.colore)
                packer.aggiungi_oggetto(oggetto, vincoli, colore, priorita=priorita)
    else:
        for oggetto in oggetti_fallback_qs:
            for _ in range(oggetto.quantita_disponibile):
                try:
                    vincoli = oggetto.vincoli
                except VincoloOggetto.DoesNotExist:
                    vincoli = None
                colore = _genera_colore_da_oggetto(oggetto.id, oggetto.colore)
                packer.aggiungi_oggetto(oggetto, vincoli, colore)
