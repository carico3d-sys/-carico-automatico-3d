"""
Packer 3D v2 — Algoritmo di carico multi-corsia con search order Y → Z → X,
completamente autosufficiente (nessuna dipendenza da packer_3d.py).

Unità di misura: **centimetri** (cm).

Strategia:
1. Y (larghezza): affianca oggetti nella larghezza del contenitore
2. Z (altezza): impila oggetti in verticale
3. X (lunghezza): avanza in lunghezza quando Y e Z sono saturi

Mantiene colonne in (x, y), ognuna impilata in Z.

Differenza v2 vs v1: la Passata 1 per oggetti con AR >= 1.5 prova
TUTTE le orientazioni permesse dai flag di rotazione e sceglie quella che
satura meglio Y (massimo try_y + depth).

GAP 2: controllo peso_massimo_tetto a cascata durante lo stacking.
GAP 3: calcolo peso_posato_sopra_kg a fine packing.
"""

import copy
import random
from typing import Optional

# ============================
# CONFIGURAZIONE
# ============================

MIN_SUPPORT_RATIO = 0.60       # supporto minimo della base (60%)
MAX_OVERHANG = 15              # sporgenza massima consentita (cm)
MIN_SIDE_SUPPORT = 0.20        # supporto minimo laterale (20%)
MIN_DEPTH_SUPPORT = 0.20       # supporto minimo longitudinale (20%)


# ============================
# STRUTTURE DATI
# ============================

class Obj:
    """Rappresenta un oggetto da posizionare nel contenitore.

    Parametri:
        id: identificatore univoco (stringa)
        w: larghezza (X) in cm
        d: profondità (Y) in cm
        h: altezza (Z) in cm
        oggetto_id: PK del modello Oggetto (per risalire ai vincoli)
        orientation_allowed: se True può essere ruotato / impilato su altri
        sovrapponibile: se True altri oggetti possono appoggiarsi sopra
        solo_su_piano: se True deve stare direttamente sul pavimento
        fragile: se True nulla può essere appoggiato sopra
    """

    def __init__(self, id, w, d, h, *,
                 oggetto_id: Optional[int] = None,
                 orientation_allowed: bool = True,
                 rotazione_su_x: bool = True,
                 rotazione_su_y: bool = True,
                 rotazione_su_z: bool = True,
                 sovrapponibile: bool = True,
                 solo_su_piano: bool = False,
                 fragile: bool = False,
                 priorita: int = 0,
                 peso_massimo_tetto: float = 0):
        self.id = id
        self.width = w
        self.depth = d
        self.height = h
        self.oggetto_id = oggetto_id
        self.orientation_allowed = orientation_allowed
        self.rotazione_su_x = rotazione_su_x
        self.rotazione_su_y = rotazione_su_y
        self.rotazione_su_z = rotazione_su_z
        self.sovrapponibile = sovrapponibile
        self.solo_su_piano = solo_su_piano
        self.fragile = fragile
        self.priorita = priorita
        self.peso_massimo_tetto = peso_massimo_tetto

        # Posizione calcolata dall'algoritmo
        self.x = 0
        self.y = 0
        self.z = 0

        # Supporto ricevuto (calcolato in can_stack)
        self.support_ratio = 1.0

    def __repr__(self):
        return (f"Obj({self.id}, {self.width}x{self.depth}x{self.height} "
                f"→ ({self.x}, {self.y}, {self.z}))")


# ============================
# GEOMETRIA
# ============================

def rect(obj):
    return {
        "x1": obj.x,
        "x2": obj.x + obj.width,
        "y1": obj.y,
        "y2": obj.y + obj.depth,
    }


def intersection_area(A, B):
    w = max(0, min(A["x2"], B["x2"]) - max(A["x1"], B["x1"]))
    d = max(0, min(A["y2"], B["y2"]) - max(A["y1"], B["y1"]))
    return w * d


def compute_overhang(A, B):
    overhang_x = max(0, A["x2"] - B["x2"], B["x1"] - A["x1"])
    overhang_y = max(0, A["y2"] - B["y2"], B["y1"] - A["y1"])
    return max(overhang_x, overhang_y)


def center_of_mass(obj):
    return obj.x + obj.width / 2, obj.y + obj.depth / 2


def point_inside(px, py, B):
    return (B["x1"] <= px <= B["x2"]) and (B["y1"] <= py <= B["y2"])


# ============================
# STACKING AVANZATO
# ============================

def can_stack(obj, base) -> bool:
    """Verifica se *obj* può essere impilato sopra *base*.

    Considera:
    - Orientamento consentito
    - Dimensioni (obj non più largo/profondo di base)
    - Supporto ≥ MIN_SUPPORT_RATIO
    - Sporgenza ≤ MAX_OVERHANG
    - Baricentro dentro la base
    - Supporto laterale / longitudinale minimo
    - La base deve essere sovrapponibile e non fragile
    """
    if not obj.orientation_allowed:
        return False

    # La base deve poter reggere carico sopra
    if not base.sovrapponibile:
        return False
    if base.fragile:
        return False

    # Confronto misure: obj non più largo/profondo della base
    if obj.width > base.width:
        return False
    if obj.depth > base.depth:
        return False

    A = rect(obj)
    B = rect(base)

    inter = intersection_area(A, B)
    area_obj = obj.width * obj.depth
    support_ratio = inter / area_obj if area_obj > 0 else 0
    obj.support_ratio = support_ratio

    # Supporto ≥ 60%
    if inter < MIN_SUPPORT_RATIO * area_obj:
        return False

    # Sporgenza ≤ MAX_OVERHANG
    if compute_overhang(A, B) > MAX_OVERHANG:
        return False

    # Baricentro dentro la base
    cx, cy = center_of_mass(obj)
    if not point_inside(cx, cy, B):
        return False

    # Stabilità laterale
    side_support = (min(A["x2"], B["x2"]) - max(A["x1"], B["x1"])) / obj.width
    if side_support < MIN_SIDE_SUPPORT:
        return False

    # Stabilità longitudinale
    depth_support = (min(A["y2"], B["y2"]) - max(A["y1"], B["y1"])) / obj.depth
    if depth_support < MIN_DEPTH_SUPPORT:
        return False

    return True


# ============================
# PESO CUMULATIVO SOPRA (GAP 2 & GAP 3)
# ============================

def _calcola_peso_sopra(placed, target):
    """Calcola il peso cumulativo (kg) degli oggetti sopra *target*.

    Ricorsivo: somma il peso degli oggetti direttamente sopra target
    piu' il peso degli oggetti sopra di essi.
    """
    peso = 0.0
    z_top = target.z + target.height
    x0, x1 = target.x, target.x + target.width
    y0, y1 = target.y, target.y + target.depth
    for p in placed:
        if p is target:
            continue
        if abs(p.z - z_top) < 0.001:
            if p.x < x1 and p.x + p.width > x0 and p.y < y1 and p.y + p.depth > y0:
                peso += float(getattr(p, '_peso_kg', 0)) + _calcola_peso_sopra(placed, p)
    return peso


def _trova_base_sotto(placed, obj):
    """Trova l'oggetto direttamente sotto *obj* nella colonna."""
    x0, x1 = obj.x, obj.x + obj.width
    y0, y1 = obj.y, obj.y + obj.depth
    for p in placed:
        if p is obj:
            continue
        if abs(p.z + p.height - obj.z) < 0.001:
            if p.x < x1 and p.x + p.width > x0 and p.y < y1 and p.y + p.depth > y0:
                return p
    return None


def _check_peso_massimo_tetto_cascade(placed, obj):
    """GAP 2: verifica che il nuovo oggetto non superi il peso_massimo_tetto
    di nessuna base nella colonna sottostante."""
    peso_nuovo = float(getattr(obj, '_peso_kg', 0))
    base = _trova_base_sotto(placed, obj)
    while base is not None:
        if base.peso_massimo_tetto > 0:
            peso_corrente = _calcola_peso_sopra(placed, base)
            if peso_corrente + peso_nuovo > base.peso_massimo_tetto:
                return False
        base = _trova_base_sotto(placed, base)
    return True


def _calcola_pesi_sopra(placed):
    """GAP 3: calcola _peso_sopra_kg per ogni oggetto in placed."""
    for obj in placed:
        obj._peso_sopra_kg = _calcola_peso_sopra(placed, obj)


# ============================
# ALGORITMO BASE DI CARICO
# ============================

def _check_z_collision(obj, placed):
    """Verifica se un altro oggetto occupa lo stesso volume XY alla Z di obj."""
    x0 = obj.x
    x1 = obj.x + obj.width
    y0 = obj.y
    y1 = obj.y + obj.depth
    z0 = obj.z
    z1 = obj.z + obj.height
    for p in placed:
        px0 = p.x
        px1 = p.x + p.width
        py0 = p.y
        py1 = p.y + p.depth
        pz0 = p.z
        pz1 = p.z + p.height
        if x0 < px1 and x1 > px0 and y0 < py1 and y1 > py0:
            if z0 < pz1 and pz0 < z1:
                return True
    return False


def _colonna_contiene(placed, top, target_oggetto_id):
    """Verifica se nella colonna, a partire da *top* o sotto di esso,
    c'è un item con *target_oggetto_id*."""
    if top.oggetto_id == target_oggetto_id:
        return True
    x0 = top.x
    x1 = top.x + top.width
    y0 = top.y
    y1 = top.y + top.depth
    z_sotto = top.z
    for p in placed:
        if p is top:
            continue
        if abs(p.z + p.height - z_sotto) > 0.001:
            continue
        px0 = p.x
        px1 = p.x + p.width
        py0 = p.y
        py1 = p.y + p.depth
        if x0 < px1 and x1 > px0 and y0 < py1 and y1 > py0:
            if p.oggetto_id == target_oggetto_id:
                return True
            return _colonna_contiene(placed, p, target_oggetto_id)
    return False


def _colonne_info(placed):
    """Costruisce mappa delle colonne dagli oggetti posizionati."""
    columns = {}
    for p in placed:
        key = (p.x, p.y)
        z_top = p.z + p.height
        if key not in columns or z_top > columns[key]['z_top']:
            columns[key] = {'z_top': z_top, 'top_item': p}
    return columns


def _x_candidate_positions(placed, container_w, obj_width):
    """Genera posizioni X candidate per un nuovo oggetto a pavimento."""
    candidates = set()
    candidates.add(0)
    for p in placed:
        candidates.add(p.x + p.width)
    if container_w is not None:
        candidates = {x for x in candidates if x + obj_width <= container_w}
    return sorted(candidates)


def _y_candidate_at_x(placed, try_x, container_d):
    """Genera posizioni Y candidate per un nuovo oggetto a pavimento
    alla coordinata X specificata (versione v1)."""
    candidates = set()
    candidates.add(0)
    for p in placed:
        if p.x < try_x + 1 and try_x < p.x + p.width:
            candidates.add(p.y + p.depth)
    return sorted(y for y in candidates if y < container_d)


def _y_candidate_at_x_v2(placed, try_x, container_d):
    """Genera posizioni Y candidate per un nuovo oggetto a pavimento.

    Rispetto alla v1, include anche oggetti il cui lato destro
    coincide con try_x (non solo quelli che overlappano strettamente).
    Questo permette di riempire fasce Y che si liberano a X successivi."""
    candidates = set()
    candidates.add(0)
    for p in placed:
        if p.x < try_x + 1 and p.x + p.width >= try_x - 0.5:
            candidates.add(p.y + p.depth)
    return sorted(y for y in candidates if y < container_d)


def _prova_volume(obj, x, y, z, placed, container_dim, vincoli_sopra, tracker=None):
    """Prova a posizionare obj a (x, y, z).

    Verifica:
    - Dentro i limiti del contenitore
    - Vincoli di peso sulle sezioni (se tracker attivo)
    - Nessuna collisione con oggetti esistenti
    - Vincoli 'sopra' rispettati

    Returns:
        True se posizionabile, obj.x/y/z vengono modificati
    """
    container_w, container_d, container_h = (container_dim or (None, None, None))

    if container_w is not None and x + obj.width > container_w:
        return False
    if container_d is not None and y + obj.depth > container_d:
        return False
    if container_h is not None and z + obj.height > container_h:
        return False

    obj.x = x
    obj.y = y
    obj.z = z

    # Controllo peso sulle sezioni (conversione cm -> mm)
    if tracker is not None:
        x_start_mm = int(x * 10)
        x_end_mm = int((x + obj.width) * 10)
        peso = float(getattr(obj, '_peso_kg', 0))
        if tracker.sovraccarico_dopo(x_start_mm, x_end_mm, peso) > 0:
            return False

    dettagli_match = None

    # Per stacking, verifica supporto del sotto-oggetto piu' alto
    if z > 0:
        sotto = None
        for p in placed:
            if abs(p.z + p.height - z) < 0.001:
                px0 = p.x
                px1 = p.x + p.width
                py0 = p.y
                py1 = p.y + p.depth
                if x < px1 and x + obj.width > px0 and y < py1 and y + obj.depth > py0:
                    if sotto is None or p.z > sotto.z:
                        sotto = p

        # --- Vincolo 'sopra' (controllato PRIMA di can_stack) ---
        if sotto and obj.oggetto_id in vincoli_sopra:
            required = vincoli_sopra[obj.oggetto_id]
            ok = False

            if obj.oggetto_id in required:
                if sotto.oggetto_id == obj.oggetto_id:
                    dettagli_a = required[obj.oggetto_id]
                    if dettagli_a is not None:
                        obj_dims = (obj.width, obj.depth, obj.height)
                        sotto_dims = (sotto.width, sotto.depth, sotto.height)
                        for dims_a, dims_b in dettagli_a:
                            if dims_a == obj_dims and dims_b == sotto_dims:
                                ok = True
                                dettagli_match = dettagli_a
                                break
                    else:
                        ok = True

            if not ok:
                for req_id, dettagli in required.items():
                    if _colonna_contiene(placed, sotto, req_id):
                        if dettagli is not None and sotto.oggetto_id == req_id:
                            obj_dims = (obj.width, obj.depth, obj.height)
                            sotto_dims = (sotto.width, sotto.depth, sotto.height)
                            for dims_a, dims_b in dettagli:
                                if dims_a == obj_dims and dims_b == sotto_dims:
                                    ok = True
                                    dettagli_match = dettagli
                                    break
                        else:
                            ok = True
                        break

            if not ok:
                return False

        # --- can_stack (saltato se dettagli_match esiste) ---
        if sotto and not can_stack(obj, sotto):
            if dettagli_match is None:
                return False

    # Controllo collisione volume
    if _check_z_collision(obj, placed):
        return False

    return True


def _e_una_base(obj, vincoli_sopra):
    """Verifica se obj e' una BASE per qualche vincolo 'sopra'."""
    if not vincoli_sopra:
        return False
    for bases in vincoli_sopra.values():
        if obj.oggetto_id in bases:
            return True
    return False


def _ha_auto_ref(obj, vincoli_sopra):
    """Verifica se obj ha un vincolo auto-referenziale (A sopra A)."""
    return (vincoli_sopra and
            obj.oggetto_id in vincoli_sopra and
            obj.oggetto_id in vincoli_sopra[obj.oggetto_id])


def _prova_tutte_orientazioni(obj, x, y, z, placed, container_dim, vincoli_sopra, tracker=None):
    """Prova a posizionare obj a (x, y, z) con TUTTE le orientazioni
    disponibili (fino a 6 permutazioni)."""
    orig_w, orig_d, orig_h = obj.width, obj.depth, obj.height

    if not obj.orientation_allowed:
        if _prova_volume(obj, x, y, z, placed, container_dim, vincoli_sopra, tracker=tracker):
            return True
        return False

    permutations = [(orig_w, orig_d, orig_h)]

    if obj.rotazione_su_z:
        permutations.append((orig_d, orig_w, orig_h))
    if obj.rotazione_su_x:
        permutations.append((orig_w, orig_h, orig_d))
    if obj.rotazione_su_y:
        permutations.append((orig_h, orig_d, orig_w))

    if obj.rotazione_su_x and obj.rotazione_su_y and obj.rotazione_su_z:
        permutations.append((orig_d, orig_h, orig_w))
        permutations.append((orig_h, orig_w, orig_d))

    permutations = list(dict.fromkeys(permutations))
    permutations.sort(key=lambda p: p[0])

    for w, d, h in permutations:
        obj.width, obj.depth, obj.height = w, d, h
        if _prova_volume(obj, x, y, z, placed, container_dim, vincoli_sopra, tracker=tracker):
            return True

    obj.width, obj.depth, obj.height = orig_w, orig_d, orig_h
    return False


def _stacking_blocca_vincoli(obj, z_top, placed, vincoli_sopra, container_h, max_heights):
    """Verifica se impilare *obj* a z_top bloccherebbe oggetti vincolati
    che devono stare sopra la base."""
    if not vincoli_sopra or container_h is None:
        return False
    if not _e_una_base(obj, vincoli_sopra):
        return False
    if _ha_auto_ref(obj, vincoli_sopra):
        return False

    remaining = container_h - (z_top + obj.height)
    for constrained_id, bases in vincoli_sopra.items():
        if constrained_id != obj.oggetto_id and obj.oggetto_id in bases:
            needed = max_heights.get(constrained_id, obj.height)
            if remaining < needed:
                return True
    return False


# ============================
# ALGORITMO v1: load_truck originale
# ============================

def load_truck(objects, vincoli_sopra=None, container_dim=None, tracker=None):
    """Posiziona gli oggetti nel contenitore con search order Y → Z → X.

    Versione originale (v1): Passata 1 per AR >= 1.5 prova SOLO
    l'orientamento a X stretto.
    """
    if vincoli_sopra is None:
        vincoli_sopra = {}

    container_w = container_dim[0] if container_dim else None
    container_d = container_dim[1] if container_dim else None
    container_h = container_dim[2] if container_dim else None

    if container_dim is None:
        container_d = float('inf')

    from .priority_sorter import ordina_per_priorita, ha_priorita_esplicita
    if ha_priorita_esplicita(objects):
        ordina_per_priorita(objects, vincoli_sopra)
    else:
        def sort_key(o):
            priorita_interna = 0
            if o.solo_su_piano:
                priorita_interna -= 10
            if _e_una_base(o, vincoli_sopra):
                priorita_interna -= 5
            return (priorita_interna, -o.height, -o.depth, -o.width)
        objects.sort(key=sort_key)

    max_heights = {}
    for o in objects:
        max_heights[o.oggetto_id] = max(
            max_heights.get(o.oggetto_id, 0), o.height
        )

    placed = []
    unfitted_ids = []

    for obj in objects:
        posizionato = False

        # FASE 1: stacking su colonne esistenti
        columns = _colonne_info(placed)

        if not obj.solo_su_piano:
            sorted_cols = sorted(
                columns.keys(),
                key=lambda k: (k[1], columns[k]['z_top'], k[0]),
            )
            for col_x, col_y in sorted_cols:
                col = columns[(col_x, col_y)]
                z_top = col['z_top']

                if container_h is not None and z_top + obj.height > container_h:
                    continue

                if _stacking_blocca_vincoli(
                    obj, z_top, placed,
                    vincoli_sopra, container_h, max_heights,
                ):
                    continue

                if _prova_tutte_orientazioni(
                    obj, col_x, col_y, z_top,
                    placed, container_dim, vincoli_sopra, tracker=tracker,
                ):
                    placed.append(obj)
                    if tracker is not None:
                        x_start_mm = int(obj.x * 10)
                        x_end_mm = int((obj.x + obj.width) * 10)
                        tracker.applica(x_start_mm, x_end_mm, float(getattr(obj, '_peso_kg', 0)))
                    posizionato = True
                    break

        # FASE 2: pavimento
        if not posizionato:
            orig_w, orig_d, orig_h = obj.width, obj.depth, obj.height
            x_positions = set()
            for w, d in [(orig_w, orig_d)]:
                if obj.orientation_allowed and orig_w != orig_d:
                    orientations_to_try = [(orig_w, orig_d), (orig_d, orig_w)]
                else:
                    orientations_to_try = [(orig_w, orig_d)]

                for w, d in orientations_to_try:
                    x_positions.update(
                        _x_candidate_positions(placed, container_w, w)
                    )

            if tracker is not None:
                for s in tracker.sezioni:
                    sec_x_cm = s.inizio_x_mm / 10.0
                    if container_w is None or sec_x_cm + min(orig_w, orig_d) <= container_w:
                        x_positions.add(sec_x_cm)

            x_positions = sorted(x_positions)

            _ar = max(orig_w, orig_d) / min(orig_w, orig_d) if min(orig_w, orig_d) > 0 else 1.0
            _doppia_passata = obj.orientation_allowed and _ar >= 1.5

            if _doppia_passata:
                _narrow_w = min(orig_w, orig_d)
                _narrow_d = max(orig_w, orig_d)
                _narrow_orientations = [(_narrow_w, _narrow_d, orig_h)]
                if obj.rotazione_su_x:
                    _narrow_orientations.append((_narrow_w, orig_h, _narrow_d))
                _narrow_orientations = list(dict.fromkeys(_narrow_orientations))

                for try_x in x_positions:
                    y_candidates = _y_candidate_at_x(
                        placed, try_x, container_d or float('inf')
                    )
                    for try_y in y_candidates:
                        for w, d, h in _narrow_orientations:
                            obj.width, obj.depth, obj.height = w, d, h
                            if _prova_volume(
                                obj, try_x, try_y, 0,
                                placed, container_dim, vincoli_sopra,
                                tracker=tracker,
                            ):
                                placed.append(obj)
                                if tracker is not None:
                                    x_start_mm = int(obj.x * 10)
                                    x_end_mm = int((obj.x + obj.width) * 10)
                                    tracker.applica(x_start_mm, x_end_mm, float(getattr(obj, '_peso_kg', 0)))
                                posizionato = True
                                break
                        if posizionato:
                            break
                    if posizionato:
                        break

                if not posizionato:
                    obj.width, obj.depth, obj.height = orig_w, orig_d, orig_h

            if not posizionato:
                for try_x in x_positions:
                    y_candidates = _y_candidate_at_x(
                        placed, try_x, container_d or float('inf')
                    )
                    for try_y in y_candidates:
                        if _prova_tutte_orientazioni(
                            obj, try_x, try_y, 0,
                            placed, container_dim, vincoli_sopra,
                            tracker=tracker,
                        ):
                            placed.append(obj)
                            if tracker is not None:
                                x_start_mm = int(obj.x * 10)
                                x_end_mm = int((obj.x + obj.width) * 10)
                                tracker.applica(x_start_mm, x_end_mm, float(getattr(obj, '_peso_kg', 0)))
                            posizionato = True
                            break
                    if posizionato:
                        break

        if not posizionato:
            unfitted_ids.append(obj.id)

    for obj in objects:
        if obj.id in unfitted_ids:
            obj.z = -1
            obj.x = -1
            obj.y = -1

    return placed


# ============================
# ALGORITMO v2: load_truck_v2 (best Y-fill + GAP 2 + GAP 3)
# ============================

def load_truck_v2(objects, vincoli_sopra=None, container_dim=None, tracker=None,
                  preserve_order=False):
    """Versione migliorata di load_truck con best Y-fill per oggetti AR >= 1.5.

    La Passata 1 prova TUTTE le orientazioni permesse dai flag di rotazione
    a ogni posizione (X, Y) e sceglie quella con il miglior Y-fill
    (massimo try_y + depth). Se non trova spazio, ripiega su Passata 2
    (_prova_tutte_orientazioni standard).

    GAP 2: check peso_massimo_tetto a cascata in Fase 1.
    GAP 3: calcolo _peso_sopra_kg a fine packing.
    """

    if vincoli_sopra is None:
        vincoli_sopra = {}

    container_w = container_dim[0] if container_dim else None
    container_d = container_dim[1] if container_dim else None
    container_h = container_dim[2] if container_dim else None

    if container_dim is None:
        container_d = float('inf')

    if not preserve_order:
        from .priority_sorter import ordina_per_priorita, ha_priorita_esplicita
        if ha_priorita_esplicita(objects):
            ordina_per_priorita(objects, vincoli_sopra)
        else:
            def sort_key(o):
                priorita_interna = 0
                if o.solo_su_piano:
                    priorita_interna -= 10
                if _e_una_base(o, vincoli_sopra):
                    priorita_interna -= 5
                return (priorita_interna, -o.height, -o.depth, -o.width)
            objects.sort(key=sort_key)

    max_heights = {}
    for o in objects:
        max_heights[o.oggetto_id] = max(
            max_heights.get(o.oggetto_id, 0), o.height
        )

    placed = []
    unfitted_ids = []

    for obj in objects:
        posizionato = False

        # ================================================================
        # FASE 1: Tentativo di stacking su colonne esistenti
        # ================================================================
        columns = _colonne_info(placed)

        if not obj.solo_su_piano:
            _orig_f1_w, _orig_f1_d, _orig_f1_h = obj.width, obj.depth, obj.height
            sorted_cols = sorted(
                columns.keys(),
                key=lambda k: (k[1], columns[k]['z_top'], k[0]),
            )
            for col_x, col_y in sorted_cols:
                col = columns[(col_x, col_y)]
                z_top = col['z_top']

                if container_h is not None and z_top + obj.height > container_h:
                    continue

                if _stacking_blocca_vincoli(
                    obj, z_top, placed,
                    vincoli_sopra, container_h, max_heights,
                ):
                    continue

                if _prova_tutte_orientazioni(
                    obj, col_x, col_y, z_top,
                    placed, container_dim, vincoli_sopra, tracker=tracker,
                ):
                    # GAP 2: verifica peso_massimo_tetto a cascata
                    if not _check_peso_massimo_tetto_cascade(placed, obj):
                        obj.width, obj.depth, obj.height = (
                            _orig_f1_w, _orig_f1_d, _orig_f1_h
                        )
                        continue
                    placed.append(obj)
                    if tracker is not None:
                        x_start_mm = int(obj.x * 10)
                        x_end_mm = int((obj.x + obj.width) * 10)
                        tracker.applica(x_start_mm, x_end_mm, float(getattr(obj, '_peso_kg', 0)))
                    posizionato = True
                    break

        # ================================================================
        # FASE 2: Posizionamento a pavimento (nuova colonna)
        # ================================================================
        if not posizionato:
            orig_w, orig_d, orig_h = obj.width, obj.depth, obj.height
            x_positions = set()
            for w, d in [(orig_w, orig_d)]:
                if obj.orientation_allowed and orig_w != orig_d:
                    orientations_to_try = [(orig_w, orig_d), (orig_d, orig_w)]
                else:
                    orientations_to_try = [(orig_w, orig_d)]

                for w, d in orientations_to_try:
                    x_positions.update(
                        _x_candidate_positions(placed, container_w, w)
                    )

            if tracker is not None:
                for s in tracker.sezioni:
                    sec_x_cm = s.inizio_x_mm / 10.0
                    if container_w is None or sec_x_cm + min(orig_w, orig_d) <= container_w:
                        x_positions.add(sec_x_cm)

            x_positions = sorted(x_positions)

            # ============================================================
            # PASSATA 1 (v2): best Y-fill
            # ============================================================
            _ar = max(orig_w, orig_d) / min(orig_w, orig_d) if min(orig_w, orig_d) > 0 else 1.0
            _doppia_passata = obj.orientation_allowed and _ar >= 1.5

            if _doppia_passata:
                _narrow_w = min(orig_w, orig_d)
                _narrow_d = max(orig_w, orig_d)

                _all_orientations = [(orig_w, orig_d, orig_h)]
                if obj.rotazione_su_z and orig_w != orig_d:
                    _all_orientations.append((orig_d, orig_w, orig_h))
                if obj.rotazione_su_x:
                    _all_orientations.append((orig_w, orig_h, orig_d))
                if obj.rotazione_su_y:
                    _all_orientations.append((orig_h, orig_d, orig_w))
                if obj.rotazione_su_x and obj.rotazione_su_y and obj.rotazione_su_z:
                    _all_orientations.append((orig_d, orig_h, orig_w))
                    _all_orientations.append((orig_h, orig_w, orig_d))
                _all_orientations = list(dict.fromkeys(_all_orientations))

                for try_x in x_positions:
                    y_candidates = _y_candidate_at_x_v2(
                        placed, try_x, container_d or float('inf')
                    )
                    y_set = set(y_candidates)
                    if _narrow_d < (container_d or float('inf')):
                        y_set.add(_narrow_d)
                    if 0 < (container_d or float('inf')):
                        y_set.add(0)
                    y_candidates = sorted(y_set, key=lambda y: (
                        0 if y == 0 else 1 if y == _narrow_d else 2, y
                    ))

                    for try_y in y_candidates:
                        best_y_end = -1
                        best_dims = None

                        for w, d, h in _all_orientations:
                            obj.width, obj.depth, obj.height = w, d, h
                            if _prova_volume(
                                obj, try_x, try_y, 0,
                                placed, container_dim, vincoli_sopra,
                                tracker=tracker,
                            ):
                                y_end = try_y + d
                                if y_end > best_y_end:
                                    best_y_end = y_end
                                    best_dims = (w, d, h)

                        if best_dims is not None:
                            w, d, h = best_dims
                            obj.width, obj.depth, obj.height = w, d, h
                            _prova_volume(
                                obj, try_x, try_y, 0,
                                placed, container_dim, vincoli_sopra,
                                tracker=tracker,
                            )
                            placed.append(obj)
                            if tracker is not None:
                                x_start_mm = int(obj.x * 10)
                                x_end_mm = int((obj.x + obj.width) * 10)
                                tracker.applica(x_start_mm, x_end_mm, float(getattr(obj, '_peso_kg', 0)))
                            posizionato = True
                            break
                    if posizionato:
                        break

                if not posizionato:
                    obj.width, obj.depth, obj.height = orig_w, orig_d, orig_h

            # ============================================================
            # PASSATA 2 (fallback): tutte le orientazioni standard
            # ============================================================
            if not posizionato:
                for try_x in x_positions:
                    y_candidates = _y_candidate_at_x_v2(
                        placed, try_x, container_d or float('inf')
                    )
                    for try_y in y_candidates:
                        if _prova_tutte_orientazioni(
                            obj, try_x, try_y, 0,
                            placed, container_dim, vincoli_sopra,
                            tracker=tracker,
                        ):
                            placed.append(obj)
                            if tracker is not None:
                                x_start_mm = int(obj.x * 10)
                                x_end_mm = int((obj.x + obj.width) * 10)
                                tracker.applica(x_start_mm, x_end_mm, float(getattr(obj, '_peso_kg', 0)))
                            posizionato = True
                            break
                    if posizionato:
                        break

        if not posizionato:
            unfitted_ids.append(obj.id)

    # GAP 3: calcola il peso cumulativo sopra ogni oggetto posizionato
    _calcola_pesi_sopra(placed)

    for obj in objects:
        if obj.id in unfitted_ids:
            obj.z = -1
            obj.x = -1
            obj.y = -1

    return placed


def filter_unfitted(objects):
    """Filtra gli oggetti non posizionati (z == -1)."""
    posizionati = []
    non_posizionati = []
    for o in objects:
        if o.z == -1:
            non_posizionati.append(o)
        else:
            posizionati.append(o)
    return posizionati, non_posizionati


def choose_objects_for_backtracking(placed):
    tail = sorted(placed, key=lambda o: o.x + o.width, reverse=True)[:5]
    ground = [o for o in placed if o.z == 0]
    borderline = [o for o in placed if getattr(o, "support_ratio", 1) < 0.70]
    unique = {}
    for o in tail + ground + borderline:
        unique[o.id] = o
    return list(unique.values())


# ============================
# BACKTRACKING v1
# ============================

def optimize_solution(objects, vincoli_sopra=None, iterations=10, container_dim=None, tracker=None):
    """Esegue il carico con leggero backtracking (usa load_truck v1)."""
    if vincoli_sopra is None:
        vincoli_sopra = {}

    best_solution = load_truck(objects, vincoli_sopra, container_dim=container_dim, tracker=tracker)

    placed, _ = filter_unfitted(best_solution)
    if placed:
        best_length = max(o.x + o.width for o in placed)
        best_count = len(placed)
    else:
        best_length = float('inf')
        best_count = 0

    for _ in range(iterations):
        candidates = choose_objects_for_backtracking(best_solution)
        candidate_list = copy.deepcopy(objects)

        if len(candidates) >= 2:
            i, j = random.sample(range(len(candidates)), 2)
            idx_i = next(
                (k for k, o in enumerate(candidate_list) if o.id == candidates[i].id),
                None,
            )
            idx_j = next(
                (k for k, o in enumerate(candidate_list) if o.id == candidates[j].id),
                None,
            )
            if idx_i is not None and idx_j is not None:
                candidate_list[idx_i], candidate_list[idx_j] = (
                    candidate_list[idx_j],
                    candidate_list[idx_i],
                )

        random.shuffle(candidate_list)

        fresh_tracker = None
        if tracker is not None:
            from ..sezione_weight_tracker import SezioneWeightTracker
            fresh_tracker = SezioneWeightTracker(tracker.sezioni)

        new_solution = load_truck(
            candidate_list, vincoli_sopra,
            container_dim=container_dim, tracker=fresh_tracker,
        )
        new_placed, _ = filter_unfitted(new_solution)
        if new_placed:
            new_length = max(o.x + o.width for o in new_placed)
            new_count = len(new_placed)
            if new_count > best_count or (new_count == best_count and new_length < best_length):
                best_solution = new_solution
                best_length = new_length
                best_count = new_count

    return best_solution


def run_packing(objects, vincoli_sopra=None, iterations=10, container_dim=None, tracker=None):
    """Entry point v1 (usa optimize_solution con load_truck)."""
    return optimize_solution(
        objects,
        vincoli_sopra=vincoli_sopra,
        iterations=iterations,
        container_dim=container_dim,
        tracker=tracker,
    )


# ============================
# BACKTRACKING v2
# ============================

def optimize_solution_v2(objects, vincoli_sopra=None, iterations=10, container_dim=None, tracker=None,
                         preserve_order=False):
    """Versione v2 di optimize_solution che usa load_truck_v2."""
    if vincoli_sopra is None:
        vincoli_sopra = {}

    best_solution = load_truck_v2(
        objects, vincoli_sopra, container_dim=container_dim,
        tracker=tracker, preserve_order=preserve_order,
    )

    placed, _ = filter_unfitted(best_solution)
    if placed:
        best_length = max(o.x + o.width for o in placed)
        best_count = len(placed)
    else:
        best_length = float('inf')
        best_count = 0

    for _ in range(iterations):
        candidates = choose_objects_for_backtracking(best_solution)
        candidate_list = copy.deepcopy(objects)

        if len(candidates) >= 2:
            i, j = random.sample(range(len(candidates)), 2)
            idx_i = next(
                (k for k, o in enumerate(candidate_list) if o.id == candidates[i].id),
                None,
            )
            idx_j = next(
                (k for k, o in enumerate(candidate_list) if o.id == candidates[j].id),
                None,
            )
            if idx_i is not None and idx_j is not None:
                candidate_list[idx_i], candidate_list[idx_j] = (
                    candidate_list[idx_j],
                    candidate_list[idx_i],
                )

        random.shuffle(candidate_list)

        fresh_tracker = None
        if tracker is not None:
            from ..sezione_weight_tracker import SezioneWeightTracker
            fresh_tracker = SezioneWeightTracker(tracker.sezioni)

        new_solution = load_truck_v2(
            candidate_list, vincoli_sopra,
            container_dim=container_dim, tracker=fresh_tracker,
            preserve_order=True,
        )
        new_placed, _ = filter_unfitted(new_solution)
        if new_placed:
            new_length = max(o.x + o.width for o in new_placed)
            new_count = len(new_placed)
            if new_count > best_count or (new_count == best_count and new_length < best_length):
                best_solution = new_solution
                best_length = new_length
                best_count = new_count

    return best_solution


def run_packing_v2(objects, vincoli_sopra=None, iterations=10, container_dim=None, tracker=None,
                   preserve_order=False):
    """Entry point v2 (usa optimize_solution_v2 con load_truck_v2)."""
    return optimize_solution_v2(
        objects,
        vincoli_sopra=vincoli_sopra,
        iterations=iterations,
        container_dim=container_dim,
        tracker=tracker,
        preserve_order=preserve_order,
    )
