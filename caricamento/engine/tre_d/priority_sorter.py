"""
Priority Sorter — Ordina gli oggetti per priorità di carico.

Integrato sia in packer_3d.py (3D Semplificato) che in random_packer.py
(3D Semplificato Monte Carlo). Quando la priorità è impostata (≥1),
gli oggetti vengono caricati in ordine di priorità crescente.
Priorità 0 = default, usa l'ordinamento esistente.
"""

from typing import List, Optional

from .packer_3d_v2 import _e_una_base


def ordina_per_priorita(objects, vincoli_sopra=None) -> None:
    """Ordina gli oggetti in-place per priorità di carico.

    Regole di ordinamento:
    1. Priorità numerica crescente (1 = caricato per primo, poi 2, 3, ...)
       Gli oggetti con priorità 0 (default) vanno DOPO quelli con priorità ≥1.
    2. A parità di priorità: oggetti che devono stare sul pavimento
       (solo_su_piano=True)
    3. A parità: basi per vincoli \"sopra\"
    4. A parità: per dimensione decrescente (più grandi prima:
       -height, -depth, -width)

    Se NESSUN oggetto ha priorità > 0, l'ordinamento è identico a quello
    standard di packer_3d.py (nessun cambiamento di comportamento).

    Args:
        objects: lista di Obj da ordinare (modificata in-place)
        vincoli_sopra: dict {oggetto_id_A: {oggetto_id_B, ...}} opzionale
    """
    if vincoli_sopra is None:
        vincoli_sopra = {}

    def sort_key(o):
        p = getattr(o, 'priorita', 0) or 0

        if p > 0:
            # Gruppo 0: oggetti con priorità esplicita (caricati prima)
            gruppo = 0
        else:
            # Gruppo 1: oggetti senza priorità (caricati dopo)
            gruppo = 1

        # Sotto-gruppo (a parità di priorità/gruppo):
        # 0 = solo_su_piano, 1 = basi vincoli, 2 = resto
        if o.solo_su_piano:
            sotto_gruppo = 0
        elif _e_una_base(o, vincoli_sopra):
            sotto_gruppo = 1
        else:
            sotto_gruppo = 2

        # p effettiva: per gruppo 1 (senza priorità), metti 999
        p_effettiva = p if gruppo == 0 else 999

        return (gruppo, p_effettiva, sotto_gruppo, -o.height, -o.depth, -o.width)

    objects.sort(key=sort_key)


def ha_priorita_esplicita(objects) -> bool:
    """Verifica se almeno un oggetto ha priorità > 0.

    Utile per decidere se applicare l'ordinamento per priorità
    o mantenere il comportamento standard.
    """
    return any(getattr(o, 'priorita', 0) > 0 for o in objects)
