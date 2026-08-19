"""
Random Packer 3D — Algoritmo di carico con shuffle casuale per TIPO di oggetto.

Per ogni restart:
1. Raggruppa gli oggetti per priorità (1, 2, 3, ..., 0)
2. DENTRO ogni priorità, raggruppa per TIPO (codice)
3. Shuffla i TIPI casualmente
4. DENTRO ogni tipo, ordina: solo_su_piano → basi vincoli → resto
5. Appiattisce: priorità 1 (tipi shuffle) → 2 → ... → 0 (tipi shuffle)
6. Chiama load_truck_v2(preserve_order=True) — singolo passaggio, niente backtracking
7. Tiene la soluzione con più oggetti piazzati (a parità, X minore)

Leggero: solo 1 chiamata load_truck_v2 per restart, adatto a VPS.
"""

import copy
import random
import time
from typing import List, Optional

from .constants import EARLY_STOP_STALL_MC, DEDUP_ALTERNATIVE_PER_POSIZIONI
from .group_optimizer import optimize_deterministic_groups
from .packer_3d_v2 import filter_unfitted, _e_una_base
from .packer_3d_v2 import load_truck_v2
from .priority_policy import priorita_effettive, priorita_esplicita
from .priority_policy import score_soluzione

# Numero massimo di soluzioni alternative (oltre alla migliore) esposte
# all'utente tramite telemetria["soluzioni_alternative"].
MAX_ALTERNATIVE_SOLUZIONI = 3


def _estrai_tipo(obj) -> str:
    """Estrae il tipo (codice) dall'id dell'oggetto.
    
    Esempio: 'CART-I01-0' → 'CART-I01'
    """
    return obj.id.rsplit('-', 1)[0] if '-' in obj.id else obj.id


def _fingerprint_soluzione(soluzione) -> tuple:
    """Firma univoca della disposizione reale di una soluzione.

    Due soluzioni sono la "stessa alternativa" solo se piazzano gli stessi
    tipi nelle stesse posizioni con le stesse dimensioni (orientamento). La
    firma ignora l'id di istanza (es. CART-I01-0 vs CART-I01-1): due istanze
    dello stesso tipo scambiate di posto non cambiano la disposizione.
    """
    firme = []
    for obj in soluzione:
        if getattr(obj, "z", -1) < 0:
            continue
        firme.append((
            getattr(obj, "oggetto_id", 0),
            round(float(obj.x), 2),
            round(float(obj.y), 2),
            round(float(obj.z), 2),
            round(float(obj.width), 2),
            round(float(obj.depth), 2),
            round(float(obj.height), 2),
        ))
    firme.sort()
    return tuple(firme)


def _shuffle_per_tipo(objects: List, vincoli_sopra=None) -> List:
    """Raggruppa per priorità, poi per tipo, shuffla i tipi, appiattisce.

    Ordine output:
    1. Priorità esplicite (1, 2, 3, ...) in ordine crescente
    2. Priorità 0 (default) in fondo
    
    DENTRO ogni priorità:
    - I TIPI (codici) vengono shufflati casualmente
    - DENTRO ogni tipo: solo_su_piano → basi vincoli → resto
    
    Questo preserva l'ordine logico necessario per i vincoli di stacking
    mentre randomizza l'ordine dei tipi di oggetto.
    """
    if vincoli_sopra is None:
        vincoli_sopra = {}

    # Raggruppa esclusivamente per priorità esplicita. I vincoli descrivono
    # la geometria e non promuovono le basi nella fase dell'oggetto A.
    effective = priorita_effettive(objects)
    phase_groups = {}
    for o in objects:
        phase = effective.get(o.oggetto_id, priorita_esplicita(o))
        phase_groups.setdefault(phase, []).append(o)

    result = []
    for phase in sorted(phase_groups, key=lambda value: (value == 0, value or 999)):
        result.extend(_shuffle_tipi_in_priorita(phase_groups[phase], vincoli_sopra))
    return result


def _shuffle_tipi_in_priorita(items: List, vincoli_sopra) -> List:
    """Shuffla i TIPI dentro una priorità, preservando l'ordine logico
    dentro ogni tipo (solo_su_piano → basi → resto)."""
    # Raggruppa per tipo
    tipi = {}
    for o in items:
        tipo = _estrai_tipo(o)
        tipi.setdefault(tipo, []).append(o)

    # Sort key: solo_su_piano → basi → resto
    # (duplica la logica di load_truck_v2 per coerenza)
    def _sort_key(o):
        k = 0
        if o.solo_su_piano:
            k -= 10
        if _e_una_base(o, vincoli_sopra):
            k -= 5
        return k

    # Ordina dentro ogni tipo
    for tipo, gruppo in tipi.items():
        gruppo.sort(key=_sort_key)

    # Shuffla i tipi
    tipo_keys = list(tipi.keys())
    random.shuffle(tipo_keys)

    # Appiattisci
    result = []
    for tipo in tipo_keys:
        result.extend(tipi[tipo])

    return result


def run_packing_random(
    objects: List,
    vincoli_sopra=None,
    num_restarts: int = 5,
    container_dim=None,
    tracker=None,
    compattazione_aggressiva: bool = False,
    deadline: Optional[float] = None,
    telemetria: Optional[dict] = None,
    stall_limit: int = EARLY_STOP_STALL_MC,
) -> List:
    """Esegue N restart con shuffle per tipo e load_truck_v2 (senza backtracking).

    Ad ogni restart:
    1. Shuffla i TIPI di oggetto (preservando ordine logico dentro ogni tipo)
    2. Esegue load_truck_v2(preserve_order=True) — singolo passaggio v2
    3. Confronta col best corrente (più oggetti > X minore)

    Leggero: solo 1 chiamata load_truck_v2 per restart. Adatto a VPS.

    Args:
        objects: lista di Obj da posizionare
        vincoli_sopra: dict {oggetto_id_A: {oggetto_id_B, ...}}
        num_restarts: numero di restart (default 5, max 50)
        container_dim: (larghezza_cm, profondita_cm, altezza_cm) o None
        tracker: SezioneWeightTracker opzionale per vincoli di peso

    Returns:
        lista di Obj posizionati della soluzione migliore
    """
    if vincoli_sopra is None:
        vincoli_sopra = {}

    num_restarts = max(1, min(num_restarts, 50))

    if telemetria is not None:
        telemetria["passate_max"] = num_restarts + 1

    best_solution = None
    best_score = None
    stall_count = 0
    motivo_stop = "max_tentativi"
    # Soluzioni candidate (score, soluzione) raccolte dai restart: servono
    # per esporre le alternative (top-N distinte per score) oltre alla migliore.
    candidati = []

    # Passata 0: baseline deterministico con blocchi ruotati (group optimizer).
    # È solo un punto di partenza (seed): anche se piazza tutti gli oggetti,
    # NON interrompe la ricerca. "Completo" non significa "compatto": i
    # restart casuali devono poter cercare una disposizione con X minore.
    if deadline is None or time.monotonic() < deadline:
        t_det = time.monotonic()
        det_solution = optimize_deterministic_groups(
            copy.deepcopy(objects),
            constraints=vincoli_sopra,
            container_dim=container_dim,
            tracker=tracker,
            compattazione_aggressiva=compattazione_aggressiva,
            deadline=deadline,
        )
        if telemetria is not None:
            telemetria["passate_eseguite"] = telemetria.get("passate_eseguite", 0) + 1
            telemetria.setdefault("tempo_per_passata_s", []).append(
                round(time.monotonic() - t_det, 3)
            )
        det_placed, _ = filter_unfitted(det_solution)
        if det_placed:
            best_solution = copy.deepcopy(det_solution)
            best_score = score_soluzione(
                det_placed,
                container_dim[2] if container_dim else None,
                all_objects=objects,
            )
            candidati.append((best_score, copy.deepcopy(best_solution)))

    for _ in range(num_restarts):
        # Time-budget: se la scadenza è stata superata, restituisci la
        # migliore soluzione trovata finora invece di avviare un altro restart.
        if deadline is not None and time.monotonic() >= deadline:
            motivo_stop = "deadline"
            break

        t_start = time.monotonic()

        # Shuffle per tipo (con priorità e ordinamento logico)
        # Ogni restart lavora su proprie istanze: load_truck_v2 modifica
        # coordinate e dimensioni durante le prove di orientamento.
        shuffled = [
            copy.deepcopy(obj)
            for obj in _shuffle_per_tipo(objects, vincoli_sopra)
        ]

        # Tracker fresco per ogni restart
        fresh_tracker = None
        if tracker is not None:
            from ..sezione_weight_tracker import SezioneWeightTracker
            fresh_tracker = SezioneWeightTracker(tracker.sezioni)

        # Singolo passaggio v2, preservando l'ordine shuffle
        solution = load_truck_v2(
            shuffled,
            vincoli_sopra=vincoli_sopra,
            container_dim=container_dim,
            tracker=fresh_tracker,
            preserve_order=True,
            compattazione_aggressiva=compattazione_aggressiva,
            deadline=deadline,
        )

        if telemetria is not None:
            telemetria["passate_eseguite"] = telemetria.get("passate_eseguite", 0) + 1
            telemetria.setdefault("tempo_per_passata_s", []).append(
                round(time.monotonic() - t_start, 3)
            )

        placed, _ = filter_unfitted(solution)
        if not placed:
            # Nessun oggetto piazzato in questo restart: non può migliorare.
            if best_solution is None:
                stall_count += 1
            continue

        new_score = score_soluzione(
            placed,
            container_dim[2] if container_dim else None,
            all_objects=objects,
        )

        if best_score is None or new_score > best_score:
            best_solution = copy.deepcopy(solution)
            best_score = new_score
            stall_count = 0
        else:
            stall_count += 1

        candidati.append((new_score, copy.deepcopy(solution)))

        # Early-stop: nessun miglioramento per più passate consecutive.
        # NON ci si ferma su "soluzione completa": una soluzione completa può
        # ancora migliorare in compattezza (X minore), quindi è lo stall a
        # decidere quando smettere di esplorare.
        if stall_count >= max(1, int(stall_limit)):
            motivo_stop = "convergente"
            break

    # Fallback: nessun restart ha piazzato oggetti
    if best_solution is None:
        # Se il budget è già scaduto senza completare alcun restart, non
        # avviare un'ennesima esecuzione completa: una soluzione vuota è
        # valida e il chiamante ibrido userà l'altra strategia.
        if deadline is not None and time.monotonic() >= deadline:
            motivo_stop = "deadline"
            if telemetria is not None:
                telemetria["motivo_stop"] = motivo_stop
            return []
        best_solution = load_truck_v2(
            copy.deepcopy(objects), vincoli_sopra=vincoli_sopra,
            container_dim=container_dim, tracker=tracker,
            compattazione_aggressiva=compattazione_aggressiva,
            deadline=deadline,
        )

    if telemetria is not None:
        telemetria["motivo_stop"] = motivo_stop

    # Soluzioni da mostrare nel pannello: la migliore in testa (evidenziata
    # come "Migliore") seguita dalle alternative distinte. La deduplica avviene
    # per DISPOSIZIONE REALE (posizioni diverse = alternativa diversa) o per
    # punteggio, in base a DEDUP_ALTERNATIVE_PER_POSIZIONI.
    if telemetria is not None and candidati:
        viste = set()
        distinte = []
        for score, sol in sorted(candidati, key=lambda item: item[0], reverse=True):
            chiave = (
                _fingerprint_soluzione(sol)
                if DEDUP_ALTERNATIVE_PER_POSIZIONI
                else score
            )
            if chiave in viste:
                continue
            viste.add(chiave)
            distinte.append(sol)
        telemetria["soluzioni_alternative"] = distinte[:MAX_ALTERNATIVE_SOLUZIONI + 1]

    return best_solution
