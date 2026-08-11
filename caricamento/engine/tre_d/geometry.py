"""Primitive geometriche pure per il packing 3D.

Il modulo non conosce Django né la strategia di packing. Le funzioni lavorano
su oggetti che espongono ``x``, ``y``, ``width`` e ``depth`` oppure su dizionari
rettangolari con chiavi ``x1``, ``x2``, ``y1`` e ``y2``.
"""


def rect(obj):
    """Restituisce la proiezione XY di un oggetto come rettangolo."""
    return {
        "x1": obj.x,
        "x2": obj.x + obj.width,
        "y1": obj.y,
        "y2": obj.y + obj.depth,
    }


def intersection_area(first, second):
    """Calcola l'area di intersezione XY tra due rettangoli."""
    width = max(
        0,
        min(first["x2"], second["x2"])
        - max(first["x1"], second["x1"]),
    )
    depth = max(
        0,
        min(first["y2"], second["y2"])
        - max(first["y1"], second["y1"]),
    )
    return width * depth


def compute_overhang(first, second):
    """Restituisce lo sbalzo massimo XY tra due rettangoli."""
    overhang_x = max(
        0,
        first["x2"] - second["x2"],
        second["x1"] - first["x1"],
    )
    overhang_y = max(
        0,
        first["y2"] - second["y2"],
        second["y1"] - first["y1"],
    )
    return max(overhang_x, overhang_y)


def center_of_mass(obj):
    """Restituisce il centro geometrico XY dell'oggetto."""
    return obj.x + obj.width / 2, obj.y + obj.depth / 2


def point_inside(px, py, rectangle):
    """Verifica se un punto appartiene al rettangolo, bordi inclusi."""
    return (
        rectangle["x1"] <= px <= rectangle["x2"]
        and rectangle["y1"] <= py <= rectangle["y2"]
    )


__all__ = [
    "rect",
    "intersection_area",
    "compute_overhang",
    "center_of_mass",
    "point_inside",
]
