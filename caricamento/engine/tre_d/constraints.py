"""Valutazione dei vincoli relazionali del packing 3D.

Il modulo usa il protocollo degli oggetti del packer invece di importare la
classe ``Obj``. In questo modo vincoli e strategia di ricerca restano separati
e non si introducono dipendenze circolari.

Valori di ``dettagli``:
- ``None``: relazione presente senza configurazione dimensionale specifica;
- set non vuoto: sono ammesse esclusivamente le coppie di dimensioni nel set;
- set vuoto: relazione presente ma nessuna configurazione è autorizzata.
"""

from collections.abc import Mapping


def _find_in_column(placed, top, target_object_id):
    """Restituisce l'istanza richiesta nella colonna, se presente."""
    if top.oggetto_id == target_object_id:
        return top

    x0 = top.x
    x1 = top.x + top.width
    y0 = top.y
    y1 = top.y + top.depth
    z_below = top.z

    for other in placed:
        if other is top:
            continue
        if abs(other.z + other.height - z_below) > 0.001:
            continue
        overlaps_xy = (
            x0 < other.x + other.width
            and x1 > other.x
            and y0 < other.y + other.depth
            and y1 > other.y
        )
        if not overlaps_xy:
            continue
        found = _find_in_column(placed, other, target_object_id)
        if found is not None:
            return found
        # La struttura del packer segue una sola catena sotto il top.
        return None

    return None


def column_contains(placed, top, target_object_id):
    """Verifica se ``target_object_id`` è presente nella colonna sotto ``top``."""
    return _find_in_column(placed, top, target_object_id) is not None


def is_constraint_base(obj, constraints):
    """Verifica se l'oggetto è base di almeno una relazione ``sopra``."""
    if not constraints:
        return False
    return any(
        obj.oggetto_id in bases
        for bases in constraints.values()
    )


def has_self_constraint(obj, constraints):
    """Verifica se esiste una relazione auto-referenziale ``A sopra A``."""
    return bool(
        constraints
        and obj.oggetto_id in constraints
        and obj.oggetto_id in constraints[obj.oggetto_id]
    )


def _dimensions_match(obj, base, details):
    """Verifica una coppia dimensionale autorizzata, se presente."""
    if details is None:
        return True
    obj_dims = (obj.width, obj.depth, obj.height)
    base_dims = (base.width, base.depth, base.height)
    return (obj_dims, base_dims) in details


def evaluate_relational_constraint(obj, base, placed, constraints):
    """Valuta il vincolo ``obj sopra base``.

    Restituisce una tupla ``(allowed, relational_match, details_match)``:

    - ``allowed``: il contatto non viola il vincolo;
    - ``relational_match``: una relazione autorizzata ha fatto match e può
      derogare alle regole standard dello stacking;
    - ``details_match``: il set dei dettagli che ha autorizzato il match,
      oppure ``None``.

    Se ``obj`` non ha relazioni dichiarate, il risultato è
    ``(True, False, None)``: la decisione passa alle regole geometriche
    ordinarie. Una relazione dichiarata con configurazione vuota o diversa
    da quella tentata viene invece rifiutata.
    """
    constraints = constraints or {}
    object_id = obj.oggetto_id
    if object_id not in constraints:
        return True, False, None

    required = constraints[object_id]
    if not isinstance(required, Mapping):
        required = {base_id: None for base_id in required}

    # La relazione verso la base direttamente sotto ha precedenza. Se è
    # definita, una configurazione non corrispondente è esplicitamente vietata
    # e non può ricadere nella regola standard dell'area.
    if base.oggetto_id in required:
        details = required[base.oggetto_id]
        if details is None or _dimensions_match(obj, base, details):
            return True, True, details
        return False, False, None

    # Una relazione può essere soddisfatta anche da una base più in basso
    # nella stessa colonna. In questo caso le dimensioni devono essere
    # confrontate con l'istanza richiesta, non con l'eventuale base
    # intermedia direttamente sotto l'oggetto.
    relazione_trovata = False
    for required_id, details in required.items():
        required_base = _find_in_column(placed, base, required_id)
        if required_base is None:
            continue
        relazione_trovata = True
        if details is None or _dimensions_match(obj, required_base, details):
            return True, True, details

    # Se una relazione esplicita è stata trovata nella colonna ma la coppia
    # non corrisponde alle configurazioni ammesse (compreso set vuoto), non
    # si può ricadere nello stacking standard.
    if relazione_trovata:
        return False, False, None

    # Un vincolo esclusivamente auto-referenziale vieta lo stacking su un tipo
    # estraneo. Nei vincoli misti le altre istanze restano libere e sottostanno
    # alle regole ordinarie.
    if set(required) == {object_id}:
        return False, False, None

    return True, False, None


# Alias storici mantenuti per gli import esistenti.
_colonna_contiene = column_contains
_e_una_base = is_constraint_base
_ha_auto_ref = has_self_constraint


__all__ = [
    "column_contains",
    "is_constraint_base",
    "has_self_constraint",
    "evaluate_relational_constraint",
    "_colonna_contiene",
    "_e_una_base",
    "_ha_auto_ref",
]
