"""
Task asincroni Django Q2 per l'elaborazione dell'ottimizzazione
di carico tridimensionale.

NOTA: Django Q2 usa `async_task()` come FUNZIONE, non come decorator.
      async_task(func, *args, **kwargs) accoda un task e restituisce un UUID.
"""

from django_q.tasks import async_task

from .engine import (
    ConfigurazioneOttimizzazione,
    esegui_ottimizzazione_tre_d,
)


def avvia_ottimizzazione(
    piano_id: int,
    config: dict = None,
    salva_risultato: bool = True,
) -> dict:
    """Esegue l'ottimizzazione 3D per un PianoDiCarico.

    Questa funzione viene passata a async_task() per l'esecuzione
    in coda. Può anche essere chiamata direttamente per test sincroni.

    Args:
        piano_id: ID del PianoDiCarico da elaborare.
        config: dict con la configurazione dell'ottimizzatore
                (Strategia, Performance, Output). Opzionale.

    Returns:
        dict con lo stato del risultato e metriche.
    """
    # Converti il dict config in dataclass (se presente)
    configurazione = None
    if config is not None:
        configurazione = ConfigurazioneOttimizzazione.from_dict(config)

    # Esegue direttamente l'Algoritmo 3D Semplificato (TreDPacker).
    # Il SezioneWeightTracker viene attivato automaticamente se il mezzo
    # ha sezioni configurate e "Priorità alla distribuzione dei pesi" è attiva.
    risultato = esegui_ottimizzazione_tre_d(
        piano_id,
        config=configurazione,
        salva_risultato=salva_risultato,
    )

    # Costruisci output base
    output = {
        "successo": risultato.successo,
        "piano_id": risultato.piano_id,
        "oggetti_posizionati": len(risultato.oggetti_posizionati),
        "oggetti_non_posizionati": risultato.oggetti_non_posizionati,
        "saturazione_percentuale": round(risultato.saturazione_percentuale, 1),
        "messaggio": risultato.messaggio,
        "report_priorita": risultato.report_priorita or {},
        "posizioni_preview": [
            {
                "oggetto_id": item.oggetto_id,
                "codice": item.codice,
                "posizione_mm": {
                    "x": item.coordinata_x_mm,
                    "y": item.coordinata_y_mm,
                    "z": item.coordinata_z_mm,
                },
                "dimensioni_mm": {
                    "x": item.dimensione_x_mm,
                    "y": item.dimensione_y_mm,
                    "z": item.dimensione_z_mm,
                },
                "rotazione": item.rotazione_applicata,
                "colore": item.colore,
                "peso_kg": float(item.peso_kg),
                "peso_sopra_kg": float(item.peso_sopra_kg),
            }
            for item in risultato.oggetti_posizionati
        ],
    }

    # Aggiungi metriche estese se presenti
    if risultato.metriche:
        output["metriche"] = risultato.metriche

    # Aggiungi soluzioni alternative generate dal Simulated Annealing
    if risultato.soluzioni_alternative:
        output["soluzioni_alternative"] = risultato.soluzioni_alternative

    return output


def esegui_ottimizzazione_sincrona(
    piano_id: int,
    config: dict = None,
    salva_risultato: bool = True,
) -> dict:
    """Wrapper sincrono per eseguire l'ottimizzazione direttamente
    (utile per test e debugging senza coda)."""
    return avvia_ottimizzazione(
        piano_id,
        config=config,
        salva_risultato=salva_risultato,
    )


def accoda_ottimizzazione(
    piano_id: int,
    config: dict = None,
    salva_risultato: bool = True,
) -> str:
    """Accoda un'ottimizzazione nella coda Django Q2.

    NOTA: Questo metodo non blocca. Il worker Django Q2 eseguirà
          avvia_ottimizzazione() in background.

    Args:
        piano_id: ID del PianoDiCarico.
        config: dict con la configurazione (opzionale).

    Returns:
        str: ID del task (UUID) per il monitoraggio.
    """
    task_id = async_task(
        "caricamento.tasks.avvia_ottimizzazione",  # string path per pickle
        piano_id,
        config=config,  # kwargs passati come dict
        salva_risultato=salva_risultato,
    )
    return task_id
