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

import random
from typing import List, Optional

from .packer_3d_v2 import filter_unfitted, _e_una_base
from .packer_3d_v2 import load_truck_v2


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

    # Raggruppa per priorità
    prio_groups = {}
    for o in objects:
        p = getattr(o, 'priorita', 0) or 0
        prio_groups.setdefault(p, []).append(o)

    result = []

    # Priorità esplicite: 1, 2, 3, ...
    for p in sorted(k for k in prio_groups if k > 0):
        result.extend(_shuffle_tipi_in_priorita(prio_groups[p], vincoli_sopra))

    # Priorità 0: in fondo
    if 0 in prio_groups:
        result.extend(_shuffle_tipi_in_priorita(prio_groups[0], vincoli_sopra))

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
    best_length = float('inf')
    best_count = 0

    for _ in range(num_restarts):
        # Shuffle per tipo (con priorità e ordinamento logico)
        shuffled = _shuffle_per_tipo(objects, vincoli_sopra)

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
        )

        placed, _ = filter_unfitted(solution)
        if placed:
            new_length = max(o.x + o.width for o in placed)
            new_count = len(placed)
            if new_count > best_count or (new_count == best_count and new_length < best_length):
                best_solution = solution
                best_length = new_length
                best_count = new_count

    # Fallback: nessun restart ha piazzato oggetti
    if best_solution is None:
        best_solution = load_truck_v2(
            objects, vincoli_sopra=vincoli_sopra,
            container_dim=container_dim, tracker=tracker,
        )

    return best_solution
