"""
Packer 3D — Algoritmo di carico multi-corsia con search order Y → Z → X.

Unità di misura: **centimetri** (cm).

Strategia:
1. Y (larghezza): affianca oggetti nella larghezza del contenitore
2. Z (altezza): impila oggetti in verticale
3. X (lunghezza): avanza in lunghezza quando Y e Z sono saturi

Mantiene colonne in (x, y), ognuna impilata in Z.
Skyline rimosso: lo stato è dato dalla mappa delle colonne.
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
# ALGORITMO BASE DI CARICO
# ============================

def _check_z_collision(obj, placed):
    """Verifica se un altro oggetto occupa lo stesso volume XY alla Z di obj.

    Controlla se tra gli oggetti già posizionati ce n'è uno con
    range Z sovrapposto (non solo Z uguale) e footprint XY
    sovrapposto.
    """
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
        # Sovrapposizione XY
        if x0 < px1 and x1 > px0 and y0 < py1 and y1 > py0:
            # Sovrapposizione Z (range, non solo stesso piano)
            if z0 < pz1 and pz0 < z1:
                return True
    return False


def _colonna_contiene(placed, top, target_oggetto_id):
    """Verifica se nella colonna, a partire da *top* o sotto di esso,
    c'è un item con *target_oggetto_id*.

    Prima controlla *top* stesso, poi cammina verso il basso seguendo
    la catena di stacking.
    """
    # Controlla PRIMA top stesso (potrebbe gia' essere il target)
    if top.oggetto_id == target_oggetto_id:
        return True

    x0 = top.x
    x1 = top.x + top.width
    y0 = top.y
    y1 = top.y + top.depth
    z_sotto = top.z  # cerchiamo direttamente sotto di questo
    for p in placed:
        if p is top:
            continue
        if abs(p.z + p.height - z_sotto) > 0.001:
            continue  # non e' direttamente sotto
        px0 = p.x
        px1 = p.x + p.width
        py0 = p.y
        py1 = p.y + p.depth
        if x0 < px1 and x1 > px0 and y0 < py1 and y1 > py0:
            if p.oggetto_id == target_oggetto_id:
                return True
            # Ricorsione: controlla più in basso
            return _colonna_contiene(placed, p, target_oggetto_id)
    return False


def _colonne_info(placed):
    """Costruisce mappa delle colonne dagli oggetti posizionati.

    Returns:
        dict {(x, y): {'z_top': float, 'top_item': Obj, 'max_z': float}}
        dove z_top = altezza della cima della colonna
    """
    columns = {}
    for p in placed:
        key = (p.x, p.y)
        z_top = p.z + p.height
        if key not in columns or z_top > columns[key]['z_top']:
            columns[key] = {'z_top': z_top, 'top_item': p}
    return columns


def _x_candidate_positions(placed, container_w, obj_width):
    """Genera posizioni X candidate per un nuovo oggetto a pavimento.

    Include X=0 e, per ogni colonna, la posizione subito dopo la fine
    della colonna (x + width del top item).
    Ordina X crescente (avanzi lunghezza per ultimo).
    """
    candidates = set()
    candidates.add(0)
    for p in placed:
        candidates.add(p.x + p.width)
    if container_w is not None:
        candidates = {x for x in candidates if x + obj_width <= container_w}
    return sorted(candidates)


def _y_candidate_at_x(placed, try_x, container_d):
    """Genera posizioni Y candidate per un nuovo oggetto a pavimento
    alla coordinata X specificata.

    Ordina Y in modo crescente (riempi larghezza prima).
    Genera Y=0 e subito dopo ogni colonna esistente a questa X.
    """
    candidates = set()
    candidates.add(0)
    for p in placed:
        # Controlla se l'oggetto occupa questa fascia X
        if p.x < try_x + 1 and try_x < p.x + p.width:
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

    # Imposta subito la posizione target cosi' can_stack e _check_z_collision
    # usano le coordinate giuste (non quelle vecchie di obj)
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

    # Flag per override vincolo: se un VincoloTraOggetti con
    # dettagli_posizionamento matching esiste, puo' sovrascrivere
    # il check can_stack (il vincolo vince sulla colonna).
    dettagli_match = None

    # Per stacking, verifica supporto del sotto-oggetto piu' alto
    if z > 0:
        # Trova l'item direttamente sotto a questa Z
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
        # vincoli_sopra e' un dict {A: {B: dettagli}} dove A puo' stare
        # sopra QUALSIASI dei B.
        # dettagli = set di (dimsA, dimsB) per vincoli con orientamento
        # specifico, o None se qualsiasi orientamento e' ammesso.
        # Priorita': prima stesso tipo (auto-referenziale), poi misto.
        if sotto and obj.oggetto_id in vincoli_sopra:
            required = vincoli_sopra[obj.oggetto_id]  # dict {B_id: dettagli}
            ok = False

            # "A sopra A": la base DEVE essere dello stesso tipo.
            if obj.oggetto_id in required:
                if sotto.oggetto_id == obj.oggetto_id:
                    dettagli_a = required[obj.oggetto_id]
                    if dettagli_a is not None:
                        # Vincolo con orientamento specifico: verifica match
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
                # "A sopra B" (anche B==A se auto-ref non ok):
                # controlla se QUALCHE required_id e' nella colonna
                for req_id, dettagli in required.items():
                    if _colonna_contiene(placed, sotto, req_id):
                        # Se ci sono dettagli e l'oggetto sotto e' proprio
                        # il req_id, verifica l'orientamento specifico.
                        # Se il req_id e' piu' in basso nella colonna,
                        # la verifica e' gia' stata fatta al piazzamento.
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
            # Se esiste un vincolo "sopra" con dettagli_posizionamento
            # matching, il vincolo prevale sulla logica della colonna
            # (l'oggetto puo' estendersi oltre il footprint della base).
            if dettagli_match is None:
                return False
            # altrimenti: dettagli_match esiste, il vincolo vince su can_stack

    # Controllo collisione volume (usa obj.x/y/z gia' impostati)
    if _check_z_collision(obj, placed):
        return False

    return True


def _e_una_base(obj, vincoli_sopra):
    """Verifica se obj e' una BASE per qualche vincolo 'sopra'.

    vincoli_sopra e' {A: {B: dettagli}}. obj e' una base se il suo
    oggetto_id appare come B (chiave in uno dei dict interni).
    """
    if not vincoli_sopra:
        return False
    for bases in vincoli_sopra.values():
        if obj.oggetto_id in bases:
            return True
    return False


def _ha_auto_ref(obj, vincoli_sopra):
    """Verifica se obj ha un vincolo auto-referenziale (A sopra A).

    I vincoli auto-referenziali hanno PRIORITA' sui vincoli misti:
    prima si impila lo stesso tipo, poi si lascia spazio per tipi
    misti.
    """
    return (vincoli_sopra and
            obj.oggetto_id in vincoli_sopra and
            obj.oggetto_id in vincoli_sopra[obj.oggetto_id])


def _prova_tutte_orientazioni(obj, x, y, z, placed, container_dim, vincoli_sopra, tracker=None):
    """Prova a posizionare obj a (x, y, z) con TUTTE le orientazioni
    disponibili (fino a 6 permutazioni).

    Rispetta i flag individuali di rotazione:
      rotazione_su_z = swap X↔Y (YXZ)
      rotazione_su_x = swap Y↔Z (XZY)
      rotazione_su_y = swap X↔Z (ZYX)
      Se tutti e 3 attivi → anche YZX e ZXY

    Le orientazioni vengono ordinate per larghezza X crescente
    (per ottimizzare l'occupazione in lunghezza del contenitore).

    Returns:
        True se una orientazione ha funzionato (obj.width/depth/height/x/y/z
        aggiornati).
    """
    orig_w, orig_d, orig_h = obj.width, obj.depth, obj.height

    if not obj.orientation_allowed:
        # Rotazione non consentita: solo orientazione originale
        if _prova_volume(obj, x, y, z, placed, container_dim, vincoli_sopra, tracker=tracker):
            return True
        return False

    # Costruisce la lista di permutazioni valide in base ai flag
    permutations = [(orig_w, orig_d, orig_h)]  # 1. XYZ (originale)

    if obj.rotazione_su_z:
        permutations.append((orig_d, orig_w, orig_h))  # 2. YXZ (swap X↔Y)
    if obj.rotazione_su_x:
        permutations.append((orig_w, orig_h, orig_d))  # 3. XZY (swap Y↔Z)
    if obj.rotazione_su_y:
        permutations.append((orig_h, orig_d, orig_w))  # 4. ZYX (swap X↔Z)

    # Permutazioni 5 e 6: richiedono tutti e 3 i flag
    if obj.rotazione_su_x and obj.rotazione_su_y and obj.rotazione_su_z:
        permutations.append((orig_d, orig_h, orig_w))  # 5. YZX
        permutations.append((orig_h, orig_w, orig_d))  # 6. ZXY

    # Ordina per larghezza X crescente (per ottimizzare X)
    # Usa dict.fromkeys() per eliminare duplicati preservando l'ordine
    # di inserimento (set() non garantisce ordine).
    permutations = list(dict.fromkeys(permutations))
    permutations.sort(key=lambda p: p[0])

    for w, d, h in permutations:
        obj.width, obj.depth, obj.height = w, d, h
        if _prova_volume(obj, x, y, z, placed, container_dim, vincoli_sopra, tracker=tracker):
            return True

    # Ripristina dimensioni originali se nessuna orientazione funziona
    obj.width, obj.depth, obj.height = orig_w, orig_d, orig_h
    return False


def _stacking_blocca_vincoli(obj, z_top, placed, vincoli_sopra, container_h, max_heights):
    """Verifica se impilare *obj* a z_top bloccherebbe oggetti vincolati
    che devono stare sopra la base (valori in vincoli_sopra).

    Se dopo lo stacking non rimane spazio per l'oggetto vincolato piu'
    alto, allora NON impilare — lascia spazio per il vincolo.

    NOTA: i vincoli auto-referenziali (A sopra A) hanno PRIORITA'.
    Se obj ha auto-ref, non viene mai bloccato.
    """
    if not vincoli_sopra or container_h is None:
        return False
    if not _e_una_base(obj, vincoli_sopra):
        return False

    # Priorita' assoluta: stacking stesso tipo non viene mai bloccato
    if _ha_auto_ref(obj, vincoli_sopra):
        return False

    remaining = container_h - (z_top + obj.height)
    for constrained_id, bases in vincoli_sopra.items():
        if constrained_id != obj.oggetto_id and obj.oggetto_id in bases:
            needed = max_heights.get(constrained_id, obj.height)
            if remaining < needed:
                return True  # blocca! non impilare
    return False


def load_truck(objects, vincoli_sopra=None, container_dim=None, tracker=None):
    """Posiziona gli oggetti nel contenitore con search order Y → Z → X.

    Strategia multi-corsia:
    1. **Y prima**: riempi la larghezza del contenitore
    2. **Z poi**: impila in altezza
    3. **X infine**: avanza in lunghezza

    Mantiene colonne in (x, y) dove ogni colonna è impilata in Z.
    Quando una colonna è piena (limite altezza), prova la prossima Y.
    Quando Y è saturo, avanza X.
    Se non trova spazio, l'oggetto è marcato come non caricabile (z=-1).

    Args:
        objects: lista di Obj da posizionare
        vincoli_sopra: dict opzionale {oggetto_id_A: oggetto_id_B}
        container_dim: (larghezza_cm, profondita_cm, altezza_cm) contenitore
                        o None per nessun limite
        tracker: SezioneWeightTracker opzionale per vincoli di peso

    Returns:
        lista di Obj posizionati (con x, y, z aggiornati)
    """
    if vincoli_sopra is None:
        vincoli_sopra = {}

    container_w = container_dim[0] if container_dim else None
    container_d = container_dim[1] if container_dim else None
    container_h = container_dim[2] if container_dim else None

    if container_dim is None:
        container_d = float('inf')  # nessun limite Y

    # Ordinamento: priorità utente → piano → basi → dimensione decrescente
    # Usa priority_sorter se almeno un oggetto ha priorità esplicita
    from .priority_sorter import ordina_per_priorita, ha_priorita_esplicita
    if ha_priorita_esplicita(objects):
        ordina_per_priorita(objects, vincoli_sopra)
    else:
        # Ordinamento standard: piano → basi → dimensione decrescente
        def sort_key(o):
            priorita_interna = 0
            if o.solo_su_piano:
                priorita_interna -= 10
            if _e_una_base(o, vincoli_sopra):
                priorita_interna -= 5
            return (priorita_interna, -o.height, -o.depth, -o.width)
        objects.sort(key=sort_key)

    # Pre-calcola altezza massima per ogni tipo oggetto (serve per
    # _stacking_blocca_vincoli: sapere quanto spazio serve per gli
    # oggetti vincolati sopra una base).
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
        # Prova a impilare su ogni colonna esisente. Per ogni colonna,
        # prova TUTTE le orientazioni e sceglie la prima che funziona.
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

                # Se l'oggetto e' una BASE per vincoli "sopra" (es. CART-I01
                # e' base per CART-I02), controlla che lo stacking non blocchi
                # lo spazio per gli oggetti vincolati.
                if _stacking_blocca_vincoli(
                    obj, z_top, placed,
                    vincoli_sopra, container_h, max_heights,
                ):
                    continue

                # Prova TUTTE le orientazioni su questa colonna
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

        # ================================================================
        # FASE 2: Posizionamento a pavimento (nuova colonna)
        # ================================================================
        # Per ogni X, prova tutte le Y candidate. Per ogni (X, Y), prova
        # TUTTE le orientazioni e sceglie quella che entra (preferendo
        # la larghezza X minore, ma accettando anche la maggiore se
        # l'unica che entra in Y).
        #
        # Per oggetti con alto aspect ratio (>= 1.5), fa una DOPPIA
        # PASSATA: prima prova l'orientamento a X stretto ("traverso")
        # su TUTTE le X candidate, e solo se fallisce ovunque ripiega
        # su tutte le orientazioni. Questo evita che l'oggetto venga
        # piazzato "di taglio" in una X subottimale.
        if not posizionato:
            # Raccoglie TUTTE le X candidate da TUTTE le orientazioni
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

            # Se il tracker delle sezioni e' attivo, aggiungi gli inizi
            # delle sezioni come candidati X.
            if tracker is not None:
                for s in tracker.sezioni:
                    sec_x_cm = s.inizio_x_mm / 10.0
                    if container_w is None or sec_x_cm + min(orig_w, orig_d) <= container_w:
                        x_positions.add(sec_x_cm)

            x_positions = sorted(x_positions)

            # Calcola aspect ratio per decidere se fare la doppia passata
            _ar = max(orig_w, orig_d) / min(orig_w, orig_d) if min(orig_w, orig_d) > 0 else 1.0
            _doppia_passata = obj.orientation_allowed and _ar >= 1.5

            if _doppia_passata:
                # === PASSATA 1: prova SOLO l'orientamento a X stretto ===
                # su TUTTE le X candidate. Se trova un buco, piazza
                # l'oggetto "di traverso" (lato lungo su Y).
                _narrow_w = min(orig_w, orig_d)
                _narrow_d = max(orig_w, orig_d)
                _narrow_orientations = [(_narrow_w, _narrow_d, orig_h)]
                if obj.rotazione_su_x:
                    _narrow_orientations.append((_narrow_w, orig_h, _narrow_d))
                # Deduplica
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
                    # Ripristina dimensioni originali per il fallback
                    obj.width, obj.depth, obj.height = orig_w, orig_d, orig_h

            if not posizionato:
                # === PASSATA 2 (o unica): prova TUTTE le orientazioni ===
                for try_x in x_positions:
                    min_depth = min(orig_w, orig_d) if obj.orientation_allowed else orig_d
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

    # Marca gli oggetti non posizionati con z=-1 per identificarli
    for obj in objects:
        if obj.id in unfitted_ids:
            obj.z = -1
            obj.x = -1
            obj.y = -1

    return placed


def filter_unfitted(objects):
    """Filtra gli oggetti non posizionati (z == -1).

    Returns:
        (posizionati, non_posizionati) come liste separate
    """
    posizionati = []
    non_posizionati = []
    for o in objects:
        if o.z == -1:
            non_posizionati.append(o)
        else:
            posizionati.append(o)
    return posizionati, non_posizionati


# ============================
# SCELTA OGGETTI PER BACKTRACKING
# ============================

def choose_objects_for_backtracking(placed):
    # 1) oggetti che allungano il pianale
    tail = sorted(placed, key=lambda o: o.x + o.width, reverse=True)[:5]

    # 2) oggetti a terra
    ground = [o for o in placed if o.z == 0]

    # 3) oggetti con supporto borderline
    borderline = [o for o in placed if getattr(o, "support_ratio", 1) < 0.70]

    # Unisci e togli duplicati
    unique = {}
    for o in tail + ground + borderline:
        unique[o.id] = o
    return list(unique.values())


# ============================
# BACKTRACKING LEGGERO (10 ITERAZIONI)
# ============================

def optimize_solution(objects, vincoli_sopra=None, iterations=10, container_dim=None, tracker=None):
    """Esegue il carico con leggero backtracking per migliorare la soluzione.

    Args:
        objects: lista di Obj da posizionare
        vincoli_sopra: dict opzionale {oggetto_id_A: oggetto_id_B}
        iterations: numero di iterazioni di miglioramento
        container_dim: (larghezza_cm, profondita_cm, altezza_cm) o None
        tracker: SezioneWeightTracker opzionale per vincoli di peso

    Returns:
        lista di Obj posizionati (con x, y, z aggiornati)
        NOTA: gli oggetti non posizionati hanno z=-1
    """
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

        # Crea un tracker fresco per ogni tentativo di backtracking,
        # così il controllo peso riparte da zero.
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
            # Priorità: più oggetti > lunghezza minore
            if new_count > best_count or (new_count == best_count and new_length < best_length):
                best_solution = new_solution
                best_length = new_length
                best_count = new_count

    return best_solution


# ============================
# FUNZIONE PRINCIPALE
# ============================

def run_packing(objects, vincoli_sopra=None, iterations=10, container_dim=None, tracker=None):
    """Entry point principale per l'algoritmo di packing 3D.

    Args:
        objects: lista di Obj da posizionare
        vincoli_sopra: dict {oggetto_id_A: oggetto_id_B}
        iterations: iterazioni di backtracking (default 10)
        container_dim: (larghezza_cm, profondita_cm, altezza_cm) o None
        tracker: SezioneWeightTracker opzionale per vincoli di peso

    Returns:
        lista di Obj posizionati (con x, y, z aggiornati)
        NOTA: gli oggetti non posizionati hanno z=-1
    """
    return optimize_solution(
        objects,
        vincoli_sopra=vincoli_sopra,
        iterations=iterations,
        container_dim=container_dim,
        tracker=tracker,
    )
