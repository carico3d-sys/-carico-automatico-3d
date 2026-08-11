"""
Compattazione — Controllo sbalzo sopra posizione candidata.

Modulo isolato: se in futuro si vuole rimuovere la feature,
basta eliminare questo file e la chiamata in packer_3d_v2.py.
"""


def _c_e_sbalzo_sopra(x, y, obj_width, obj_depth, placed):
    """Verifica se la posizione (x, y) a pavimento è sotto uno sbalzo.

    Uno "sbalzo" si verifica quando un oggetto impilato (z > 0)
    sporge oltre l'impronta della sua base. Posizionare un nuovo
    oggetto sotto lo sbalzo è rischioso logisticamente (blocca
    la sequenza di scarico), quindi questa funzione lo rileva
    per poterlo impedire in modalità standard.

    Args:
        x, y: coordinate del candidato (cm)
        obj_width, obj_depth: dimensioni XY del candidato (cm)
        placed: lista degli oggetti già posizionati

    Returns:
        True se la posizione è (anche parzialmente) sotto uno sbalzo
    """
    x0, x1 = x, x + obj_width
    y0, y1 = y, y + obj_depth

    for p in placed:
        if p.z == 0:
            continue  # oggetti a terra non creano sbalzi

        px0, px1 = p.x, p.x + p.width
        py0, py1 = p.y, p.y + p.depth

        # Overlap XY tra candidato e oggetto sospeso?
        if not (x0 < px1 and x1 > px0 and y0 < py1 and y1 > py0):
            continue

        # Trova la base dell'oggetto sospeso
        base = None
        for b in placed:
            if b is p:
                continue
            if abs(b.z + b.height - p.z) < 0.001:
                bx0, bx1 = b.x, b.x + b.width
                by0, by1 = b.y, b.y + b.depth
                if px0 < bx1 and px1 > bx0 and py0 < by1 and py1 > by0:
                    base = b
                    break

        if base is None:
            # Oggetto sospeso senza base? anomalo, ma consideriamolo sbalzo
            return True

        # L'area del candidato è INTERAMENTE coperta dalla base?
        if x0 >= base.x and x1 <= base.x + base.width and \
           y0 >= base.y and y1 <= base.y + base.depth:
            continue  # tutto ok, il candidato sta sotto la base

        # Altrimenti il candidato è (almeno in parte) sotto lo sbalzo
        return True

    return False
