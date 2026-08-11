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
from typing import List, Optional

from .packer_3d_v2 import filter_unfitted, _e_una_base
from .packer_3d_v2 import load_truck_v2
from .priority_policy import priorita_effettive, priorita_esplicita
from .priority_policy import score_soluzione


def _estrai_tipo(obj) -> str:
    """Estrae il tipo (codice) dall'id dell'oggetto.
    
    Esempio: 'CART-I01-0' → 'CART-I01'
    """
    return obj.id.rsplit('-', 1)[0] if '-' in obj.id else obj.id


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

    best_solution = None
    best_score = None

    for _ in range(num_restarts):
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
        )

        placed, _ = filter_unfitted(solution)
        if placed:
            new_score = score_soluzione(
                placed,
                container_dim[2] if container_dim else None,
                all_objects=objects,
            )
            if best_score is None or new_score > best_score:
                best_solution = copy.deepcopy(solution)
                best_score = new_score

    # Fallback: nessun restart ha piazzato oggetti
    if best_solution is None:
        best_solution = load_truck_v2(
            copy.deepcopy(objects), vincoli_sopra=vincoli_sopra,
            container_dim=container_dim, tracker=tracker,
            compattazione_aggressiva=compattazione_aggressiva,
        )

    return best_solution
