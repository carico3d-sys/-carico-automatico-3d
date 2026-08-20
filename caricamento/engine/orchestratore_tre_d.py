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
from .tre_d.constants import OPTIMIZATION_TIME_BUDGET_SECONDS


def _piano_e_parziale(oggetti_richiesti: int, oggetti_posizionati: int) -> bool:
    """Indica se il piano contiene meno istanze di quelle richieste.

    Priorità e vincoli vengono esposti nei report diagnostici, ma non rendono
    da soli il piano "parziale": lo stato parziale riguarda esclusivamente
    la quantità effettivamente posizionata.
    """
    return oggetti_posizionati < oggetti_richiesti


def esegui_ottimizzazione_tre_d(
    piano_id: int,
    config: Optional[ConfigurazioneOttimizzazione] = None,
    salva_risultato: bool = True,
    budget_seconds: float = OPTIMIZATION_TIME_BUDGET_SECONDS,
) -> OptimizerResult:
    """Esegue l'ottimizzazione con TreDPacker.

    Se ``salva_risultato`` è False, calcola comunque il posizionamento e
    restituisce i risultati in memoria senza aggiornare lo stato, le metriche
    o gli oggetti posizionati del piano nel database.
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

    # Oggetti da caricare dalla lista del piano. I vincoli tra oggetti
    # devono essere filtrati sulla lista effettiva prima del lookup.
    oggetti_da_caricare = list(
        OggettoDaCaricare.objects.filter(
            piano_di_carico=piano
        ).select_related("oggetto__vincoli")
    )
    # La lista del piano è la fonte unica degli oggetti da ottimizzare.
    # Non esiste fallback all'anagrafica: un piano vuoto non deve caricare
    # automaticamente tutti gli oggetti disponibili.
    oggetto_ids = {entry.oggetto_id for entry in oggetti_da_caricare}

    # Vincoli tra oggetti: esclusivamente relazioni con entrambi gli
    # oggetti presenti nella lista effettiva da caricare.
    vincoli_tra_qs = VincoloTraOggetti.objects.filter(
        attivo=True,
        oggetto_a_id__in=oggetto_ids,
        oggetto_b_id__in=oggetto_ids,
    ).select_related("oggetto_a", "oggetto_b")
    vincoli_tra_lookup = _build_lookup_vincoli_tra(
        vincoli_tra_qs,
        oggetto_ids=oggetto_ids,
    )

    if not oggetti_da_caricare:
        if salva_risultato:
            piano.stato = StatoPiano.FALLITO
            piano.messaggio_errore = "Nessun oggetto selezionato nella lista del piano."
            piano.completato_at = timezone.now()
            piano.save(update_fields=["stato", "messaggio_errore", "completato_at"])
        return OptimizerResult(
            successo=False,
            piano_id=piano.id,
            container_nome=contenitore.nome,
            container_dimensioni=dims,
            messaggio="Nessun oggetto selezionato nella lista del piano.",
        )

    # La quantità richiesta è la somma delle istanze indicate nella lista
    # del piano, non il numero di codici distinti.
    oggetti_richiesti = sum(
        max(0, int(getattr(entry, "quantita", 0) or 0))
        for entry in oggetti_da_caricare
    )

    # 2. Crea e popola il packer
    packer = TreDPacker(
        dims,
        contenitore.carico_massimo_kg,
        configurazione=config,
        vincoli_tra_lookup=vincoli_tra_lookup,
        sezioni=sezioni,
        budget_seconds=budget_seconds,
    )
    _popola_tre_d(packer, oggetti_da_caricare)

    # 3. Esegui
    if salva_risultato:
        piano.stato = StatoPiano.IN_ELABORAZIONE
        piano.save(update_fields=["stato"])

    try:
        packer.esegui()
    except Exception as exc:
        if salva_risultato:
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
    alternative_raw = getattr(packer, "soluzioni_alternative", None)
    soluzioni_alternative = (
        list(alternative_raw)
        if isinstance(alternative_raw, (list, tuple))
        else []
    )

    if salva_risultato:
        with transaction.atomic():
            piano.oggetti_posizionati.all().delete()
            for r in packer.results:
                OggettoPosizionato.objects.create(
                    piano_di_carico=piano,
                    oggetto_id=r.oggetto_id,
                    riga_origine_id=r.riga_origine_id,
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

            report_priorita = getattr(packer, "priority_report", None)
            piano_parziale = _piano_e_parziale(
                oggetti_richiesti,
                len(packer.results),
            )
            piano.stato = (
                StatoPiano.PARZIALE
                if piano_parziale
                else StatoPiano.COMPLETATO
            )
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
    report_priorita = getattr(packer, "priority_report", None)
    piano_parziale = _piano_e_parziale(
        oggetti_richiesti,
        len(packer.results),
    )

    return OptimizerResult(
        successo=not piano_parziale,
        piano_id=piano.id,
        container_nome=contenitore.nome,
        container_dimensioni=dims,
        oggetti_posizionati=list(packer.results),
        oggetti_non_posizionati=oggetti_non_posizionati,
        peso_totale_kg=(
            piano.peso_totale_kg
            if salva_risultato
            else Decimal(str(round(peso_totale, 2)))
        ),
        volume_utilizzato_mm3=volume_totale,
        saturazione_percentuale=round(saturazione, 1),
        metriche=metriche,
        messaggio=(
            f"Parziale: {len(packer.results)} di {oggetti_richiesti} oggetti "
            f"posizionati: i rimanenti non trovano spazio nel contenitore."
            if piano_parziale else
            f"Completato: {len(packer.results)} oggetti posizionati."
        ),
        report_priorita=report_priorita,
        telemetria=getattr(packer, "telemetria", None),
        soluzioni_alternative=soluzioni_alternative,
    )


def stima_ops_piano(piano) -> int:
    """Stima il numero di operazioni di piazzamento (``ops``) di un piano.

    ``ops`` = somma di (quantità × orientamenti consentiti) per ogni oggetto
    nella lista del piano. È la stessa metrica calcolata da ``TreDPacker``
    durante l'esecuzione, qui riusata a monte per decidere sync vs async.
    """
    from .common import conteggio_orientazioni

    ops = 0
    entries = OggettoDaCaricare.objects.filter(
        piano_di_carico=piano
    ).select_related("oggetto__vincoli")
    for entry in entries:
        oggetto = entry.oggetto
        try:
            vincoli = oggetto.vincoli
        except VincoloOggetto.DoesNotExist:
            vincoli = None

        orientation_allowed = vincoli.rotazione_consentita if vincoli else True
        rot_x = vincoli.rotazione_su_x if vincoli else True
        rot_y = vincoli.rotazione_su_y if vincoli else True
        rot_z = vincoli.rotazione_su_z if vincoli else True

        orientamenti = conteggio_orientazioni(
            oggetto.lunghezza_mm / 10.0,
            oggetto.larghezza_mm / 10.0,
            oggetto.altezza_mm / 10.0,
            orientation_allowed,
            rot_x,
            rot_y,
            rot_z,
        )
        ops += max(0, int(entry.quantita or 0)) * orientamenti
    return ops


def _popola_tre_d(packer, oggetti_da_caricare) -> None:
    """Popola un TreDPacker esclusivamente dalla lista del piano."""
    for o_dc in oggetti_da_caricare:
        oggetto = o_dc.oggetto
        priorita = o_dc.priorita
        for _ in range(o_dc.quantita):
            try:
                vincoli = oggetto.vincoli
            except VincoloOggetto.DoesNotExist:
                vincoli = None
            # Il colore della riga ha precedenza: se vuoto si usa quello
            # dell'anagrafica (o la palette derivata dall'id). In questo modo
            # due righe con lo stesso codice possono avere colori diversi
            # nello stesso piano di carico.
            colore = _genera_colore_da_oggetto(
                oggetto.id, o_dc.colore or oggetto.colore
            )
            packer.aggiungi_oggetto(
                oggetto,
                vincoli,
                colore,
                priorita=priorita,
                riga_origine_id=o_dc.id,
            )
