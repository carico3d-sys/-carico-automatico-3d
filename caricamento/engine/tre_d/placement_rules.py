"""Regole di posizionamento indipendenti dalla strategia di ricerca.

Le funzioni di questo modulo non conoscono Django e non importano il packer
principale. Ricevono oggetti compatibili con ``Obj`` tramite il loro
protocollo di attributi, evitando dipendenze circolari.
"""

from .constants import SPATIAL_GRID_THRESHOLD
from .geometry import intersection_area, rect


def can_stack(obj, base) -> bool:
    """Verifica se ``obj`` può essere impilato sopra ``base``.

    La regola standard richiede orientamento consentito, base sovrapponibile
    e non fragile, area dell'oggetto non superiore a quella della base e un
    contatto XY positivo. I vincoli relazionali che derogano a questa regola
    sono valutati dal packer prima di chiamare questa funzione.
    """
    if not obj.orientation_allowed:
        return False

    if not base.sovrapponibile or base.fragile:
        return False

    area_obj = obj.width * obj.depth
    area_base = base.width * base.depth
    if area_obj > area_base:
        return False

    inter = intersection_area(rect(obj), rect(base))
    if inter <= 0:
        return False

    # Mantiene il dato diagnostico già usato dal report e dai criteri
    # successivi, senza introdurre una nuova struttura dati.
    obj.support_ratio = inter / area_obj if area_obj > 0 else 0
    return True


def check_z_collision(obj, placed, grid=None) -> bool:
    """Verifica la sovrapposizione del volume 3D con oggetti già posizionati.

    ``grid`` (opzionale) è una :class:`SpatialGrid` che restringe i candidati
    con l'uniform grid; se assente o sotto la soglia, resta la scansione lineare.
    """
    x0 = obj.x
    x1 = obj.x + obj.width
    y0 = obj.y
    y1 = obj.y + obj.depth
    z0 = obj.z
    z1 = obj.z + obj.height

    candidati = (
        grid.query_volume(x0, y0, z0, x1, y1, z1)
        if grid is not None and len(placed) >= SPATIAL_GRID_THRESHOLD
        else placed
    )

    for other in candidati:
        px0 = other.x
        px1 = other.x + other.width
        py0 = other.y
        py1 = other.y + other.depth
        pz0 = other.z
        pz1 = other.z + other.height

        if x0 < px1 and x1 > px0 and y0 < py1 and y1 > py0:
            if z0 < pz1 and pz0 < z1:
                return True
    return False


# Nome storico mantenuto per compatibilità con il codice del packer e con
# eventuali integrazioni che lo importano direttamente.
_check_z_collision = check_z_collision


__all__ = ["can_stack", "check_z_collision", "_check_z_collision"]
