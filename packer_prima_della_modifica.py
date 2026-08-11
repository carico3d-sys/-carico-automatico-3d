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

from .compattazione import _c_e_sbalzo_sopra
from .geometry import (
    center_of_mass,
    compute_overhang,
    intersection_area,
    point_inside,
    rect,
)
from .placement_rules import (
    can_stack,
    _check_z_collision,
)
from .constraints import (
    _colonna_contiene,
    _e_una_base,
    _ha_auto_ref,
    evaluate_relational_constraint,
)
from .priority_policy import (
    normalizza_vincoli_sopra,
    priorita_mancanti,
    riordina_per_fasi,
    score_soluzione,
)

# ============================
# CONFIGURAZIONE
# ============================

# Lo stacking standard è regolato dal rapporto tra le aree di appoggio.
# I vincoli relazionali "A sopra B" possono derogare a questa regola.
# La ricerca di posizioni traslate e' invece riservata alla compattazione
# aggressiva e richiede comunque un contatto minimo del 50%.
MIN_RELATIONAL_SUPPORT_RATIO = 0.50




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
                 peso_massimo_tetto: float = 0,
                 vincolo_oggetto_id: Optional[int] = None,
                 note_vincolo: str = ""):
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
        self.vincolo_oggetto_id = vincolo_oggetto_id
        self.note_vincolo = note_vincolo or ""

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
# STACKING AVANZATO
# ============================

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


def _prova_volume(
    obj, x, y, z, placed, container_dim, vincoli_sopra, tracker=None,
    compattazione_aggressiva=False,
):
    """Prova a posizionare obj a (x, y, z).

    Verifica:
    - Dentro i limiti del contenitore
    - Vincoli di peso sulle sezioni (se tracker attivo)
    - Nessuna collisione con oggetti esistenti
    - Vincoli 'sopra' rispettati

    Returns:
        True se posizionabile, obj.x/y/z vengono modificati
    """
    vincoli_sopra = normalizza_vincoli_sopra(vincoli_sopra)
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
    vincolo_relazionale_match = False

    # Un vincolo esterno ``A sopra B`` è una relazione richiesta almeno una
    # volta per il piano, non una prenotazione che obbliga ogni istanza A a
    # stare sopra B. Le altre istanze A restano quindi libere di stare a terra
    # o di impilarsi secondo la geometria ordinaria.

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

        # Una quota Z positiva è valida solo se esiste un supporto reale
        # direttamente sotto l'oggetto. La compattazione aggressiva può
        # derogare all'area della base e alla regola dello sbalzo, ma non può
        # mai creare un oggetto sospeso nel vuoto.
        if sotto is None:
            return False

        # --- Vincolo 'sopra' (controllato PRIMA di can_stack) ---
        (
            vincolo_consentito,
            vincolo_relazionale_match,
            dettagli_match,
        ) = evaluate_relational_constraint(
            obj,
            sotto,
            placed,
            vincoli_sopra,
        )
        if not vincolo_consentito:
            return False

        # --- Regola finale dello stacking ---
        if sotto:
            # Un oggetto "sopra" deve sempre condividere una parte della
            # proiezione XY con la base.
            inter = intersection_area(rect(obj), rect(sotto))
            if inter <= 0:
                return False

            # Solo la modalità aggressiva consente lo stacking relazionale
            # traslato: anche in quel caso almeno il 50% della base di A
            # deve essere sostenuto dalla base B.
            if (
                compattazione_aggressiva
                and vincolo_relazionale_match
                and inter / (obj.width * obj.depth) < MIN_RELATIONAL_SUPPORT_RATIO
            ):
                return False

            # Una traslazione relazionale non è ammessa nella modalità
            # conservativa: la base deve restare la colonna naturale.
            if (
                vincolo_relazionale_match
                and not compattazione_aggressiva
                and (abs(obj.x - sotto.x) > 0.001 or abs(obj.y - sotto.y) > 0.001)
            ):
                return False

            # Senza vincolo relazionale vale la regola standard dell'area;
            # con un vincolo valido la regola dell'area è derogata.
            if not vincolo_relazionale_match and not can_stack(obj, sotto):
                return False

    # Controllo collisione volume
    if _check_z_collision(obj, placed):
        return False

    return True


def _prova_tutte_orientazioni(
    obj, x, y, z, placed, container_dim, vincoli_sopra, tracker=None,
    compattazione_aggressiva=False,
):
    """Prova a posizionare obj a (x, y, z) con TUTTE le orientazioni
    disponibili (fino a 6 permutazioni)."""
    orig_w, orig_d, orig_h = obj.width, obj.depth, obj.height

    if not obj.orientation_allowed:
        if _prova_volume(
            obj, x, y, z, placed, container_dim, vincoli_sopra,
            tracker=tracker,
            compattazione_aggressiva=compattazione_aggressiva,
        ):
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
        if _prova_volume(
            obj, x, y, z, placed, container_dim, vincoli_sopra,
            tracker=tracker,
            compattazione_aggressiva=compattazione_aggressiva,
        ):
            return True

    obj.width, obj.depth, obj.height = orig_w, orig_d, orig_h
    return False


def _orientamenti_xy(obj):
    """Restituisce le coppie (X, Y) delle orientazioni consentite."""
    original = (obj.width, obj.depth, obj.height)
    orientamenti = [(original[0], original[1])]
    if obj.orientation_allowed:
        if obj.rotazione_su_z:
            orientamenti.append((original[1], original[0]))
        if obj.rotazione_su_x:
            orientamenti.append((original[0], original[2]))
        if obj.rotazione_su_y:
            orientamenti.append((original[2], original[1]))
        if obj.rotazione_su_x and obj.rotazione_su_y and obj.rotazione_su_z:
            orientamenti.extend(((original[1], original[2]), (original[2], original[0])))
    return list(dict.fromkeys(orientamenti))


def _coordinate_stacking_aggressivo(
    base, obj, placed, container_dim, orientamenti=None,
):
    """Genera coordinate XY traslate attorno a una base esistente.

    Queste coordinate vengono usate esclusivamente dalla modalità aggressiva:
    allinea i bordi della base, dell'oggetto e degli oggetti già presenti,
    così da poter sfruttare un appoggio parziale senza fare una ricerca
    continua. La validazione finale resta in ``_prova_volume``.
    """
    container_w, container_d, _ = container_dim or (None, None, None)
    orientamenti = orientamenti or [(obj.width, obj.depth)]
    x_candidates = {base.x}
    y_candidates = {base.y}
    for obj_width, obj_depth in orientamenti:
        x_candidates.add(base.x + base.width - obj_width)
        y_candidates.add(base.y + base.depth - obj_depth)

    # I bordi degli oggetti alla stessa quota sono i punti utili per
    # chiudere un interstizio: nel caso I01 n.11/n.7, il bordo destro di n.4
    # produce X=100 cm, mentre la base n.7 parte da X=80 cm.
    z_top = base.z + base.height
    for other in placed:
        # Sono utili sia i bordi degli oggetti che terminano sulla quota
        # della base sia quelli che iniziano alla stessa quota: nel caso
        # I01 n.11/n.7, il bordo di un oggetto sospeso adiacente produce
        # il candidato X=100 cm.
        if (
            abs(other.z + other.height - z_top) > 0.001
            and abs(other.z - z_top) > 0.001
        ):
            continue
        x_candidates.update((other.x, other.x + other.width))
        y_candidates.update((other.y, other.y + other.depth))
        for obj_width, obj_depth in orientamenti:
            x_candidates.update((other.x - obj_width, other.x + other.width - obj_width))
            y_candidates.update((other.y - obj_depth, other.y + other.depth - obj_depth))

    def _valid(values):
        # La dimensione effettiva dipende dall'orientamento che verra'
        # scelto da _prova_tutte_orientazioni. Non filtrare qui usando le
        # dimensioni correnti: la validazione dei limiti viene fatta per ogni
        # orientamento nel controllo finale.
        return {round(value, 6) for value in values if value >= 0}

    x_candidates = _valid(x_candidates)
    y_candidates = _valid(y_candidates)
    return sorted(
        (x, y) for x in x_candidates for y in y_candidates
    )


def _stacking_blocca_vincoli(obj, z_top, placed, vincoli_sopra, container_h, max_heights):
    """Mantiene libera la ricerca per i vincoli relazionali esistenziali.

    Un vincolo ``A sopra B`` deve essere soddisfatto da almeno una coppia di
    istanze, quindi non si possono bloccare tutte le basi B per riservarle ad
    A: ciò impedirebbe, ad esempio, le 7 pile di I01 prima di impilare un I02
    su un solo I01 rimasto libero.
    """
    return False


# ============================
# ALGORITMO v1: load_truck originale
# ============================

def load_truck(objects, vincoli_sopra=None, container_dim=None, tracker=None):
    """Posiziona gli oggetti nel contenitore con search order Y → Z → X.

    Versione originale (v1): Passata 1 per AR >= 1.5 prova SOLO
    l'orientamento a X stretto.
    """
    vincoli_sopra = normalizza_vincoli_sopra(vincoli_sopra)

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
                        tracker.applica(
                            x_start_mm, x_end_mm,
                            float(getattr(obj, '_peso_kg', 0)),
                        )
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
                                compattazione_aggressiva=compattazione_aggressiva,
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
                                tracker.applica(
                                    x_start_mm, x_end_mm,
                                    float(getattr(obj, '_peso_kg', 0)),
                                )
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
                  preserve_order=False, compattazione_aggressiva=False,
                  _defer_internal_singles=True, _run_postprocessing=True):
    """Versione migliorata di load_truck con best Y-fill per oggetti AR >= 1.5.

    La Passata 1 prova TUTTE le orientazioni permesse dai flag di rotazione
    a ogni posizione (X, Y) e sceglie quella con il miglior Y-fill
    (massimo try_y + depth). Se non trova spazio, ripiega su Passata 2
    (_prova_tutte_orientazioni standard).

    GAP 2: check peso_massimo_tetto a cascata in Fase 1.
    GAP 3: calcolo _peso_sopra_kg a fine packing.
    """

    vincoli_sopra = normalizza_vincoli_sopra(vincoli_sopra)

    container_w = container_dim[0] if container_dim else None
    container_d = container_dim[1] if container_dim else None
    container_h = container_dim[2] if container_dim else None

    if container_dim is None:
        container_d = float('inf')

    # Il tracker può essere già valorizzato dal chiamante: ogni tentativo
    # alternativo deve partire dallo stesso stato iniziale, non dal carico
    # prodotto dal primo passaggio.
    tracker_initial_loads = (
        dict(tracker.carico_attuale) if tracker is not None else None
    )

    # La priorità è una regola di fase: anche preserve_order=True non può
    # portare un oggetto senza priorità davanti a uno prioritario. L'ordine
    # ricevuto viene preservato solo dentro la stessa fase.
    riordina_per_fasi(
        objects,
        vincoli_sopra=vincoli_sopra,
        preserve_inner_order=preserve_order,
    )

    # Snapshot immutabile dell'ordine effettivo dopo la priorità/sort e
    # prima che il packing modifichi dimensioni e coordinate delle istanze.
    # Il repacking deve conservare questo ordine, non quello dell'input
    # originale non ordinato.
    ordered_source_objects = copy.deepcopy(objects)

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

                stack_positions = [(col_x, col_y)]
                if (
                    compattazione_aggressiva
                    and obj.oggetto_id in vincoli_sopra
                ):
                    stack_positions.extend(
                        _coordinate_stacking_aggressivo(
                            col['top_item'], obj, placed, container_dim,
                            orientamenti=_orientamenti_xy(obj),
                        )
                    )
                    stack_positions = list(dict.fromkeys(stack_positions))

                for stack_x, stack_y in stack_positions:
                    if _prova_tutte_orientazioni(
                        obj, stack_x, stack_y, z_top,
                        placed, container_dim, vincoli_sopra, tracker=tracker,
                        compattazione_aggressiva=compattazione_aggressiva,
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
                            tracker.applica(
                                x_start_mm, x_end_mm,
                                float(getattr(obj, '_peso_kg', 0)),
                            )
                        posizionato = True
                        break
                if posizionato:
                    break

        # ================================================================
        # FASE 2: Posizionamento a pavimento (nuova colonna)
        # ================================================================
        # --- Controllo sbalzo per posizioni a pavimento ---
        def _posizione_sotto_sbalzo(x, y, w, d):
            if compattazione_aggressiva:
                return False
            return _c_e_sbalzo_sopra(x, y, w, d, placed)
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
                                compattazione_aggressiva=compattazione_aggressiva,
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
                                compattazione_aggressiva=compattazione_aggressiva,
                            )
                            if _posizione_sotto_sbalzo(obj.x, obj.y, obj.width, obj.depth):
                                continue
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
                            compattazione_aggressiva=compattazione_aggressiva,
                        ):
                            if _posizione_sotto_sbalzo(obj.x, obj.y, obj.width, obj.depth):
                                obj.width, obj.depth, obj.height = orig_w, orig_d, orig_h
                                continue
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

    # ================================================================
    # DEFERIMENTO IN-PROCESS DEI SINGOLI INTERNI
    # ================================================================
    # Prima di qualsiasi riparazione post-packing, rifai il carico senza
    # i singoli interni: lo spazio liberato torna quindi disponibile alle
    # normali regole di ricerca (collisioni, stacking, peso e vincoli).
    internal_repack_attempted = False
    if (
        _defer_internal_singles
        and container_h is not None
        and placed
    ):
        deferred_ids = _trova_singoli_interni(
            placed,
            container_h,
            vincoli_sopra,
        )
        fasi_deferred = {
            int(getattr(source_obj, "priorita", 0) or 0)
            for source_obj in ordered_source_objects
        }
        # Con una sola fase non esiste alcuna barriera tra codici: usa il
        # percorso legacy, già responsabile della compattazione globale.
        # Il repacking dedicato viene usato solo quando deve rispettare più
        # livelli di priorità distinti.
        if deferred_ids and len(fasi_deferred) > 1:
            internal_repack_attempted = True
            old_score = _valuta_compattezza_locale(placed, container_h)
            deferred_set = set(deferred_ids)
            best_candidate = None
            best_candidate_tracker = None
            best_candidate_objects = None
            best_candidate_score = (-1, -1, float("-inf"))
            expected_fitted_count = len(placed)

            def _fase_esplicita(obj):
                return int(getattr(obj, "priorita", 0) or 0)

            def _ha_oggetto_piu_avanti_nella_fase(fitted, target):
                """Verifica se target è interno alla propria fase."""
                target_phase = _fase_esplicita(target)
                return any(
                    other is not target
                    and _fase_esplicita(other) == target_phase
                    and other.x > target.x + 0.5
                    for other in fitted
                )

            def _score_deferimento(candidate):
                fitted = [obj for obj in candidate if obj.z >= 0]
                max_x = max((obj.x + obj.width for obj in fitted), default=0)
                internal_deferred = sum(
                    1 for obj in fitted
                    if obj.id in deferred_set
                    and obj.z == 0
                    and not _ha_oggetto_sopra(fitted, obj, container_h)
                    and _ha_oggetto_piu_avanti_nella_fase(fitted, obj)
                )
                return (len(fitted), -internal_deferred, -max_x)

            # Il primo repacking può creare un nuovo singolo interno in una
            # posizione diversa. In quel caso non si deve accettare il piano
            # parziale: quel nuovo singolo entra nella coda dei deferiti e il
            # processo continua, come nella procedura manuale dell'operatore.
            # Limite volutamente basso: questa fase è una riparazione locale,
            # non deve trasformare il packing web in una ricerca esaustiva.
            max_defer_passes = min(4, len(ordered_source_objects))
            def _riordina_deferiti_per_fase(source_objects, deferred_ids):
                """Rimette i deferiti alla fine della loro fase esplicita.

                La coda di un singolo non è la coda globale del camion: se un
                I02 prioritario viene differito, deve restare dopo gli altri
                I02 ma prima che inizi la fase degli I01. Le fasi sono già
                ordinate da ``riordina_per_fasi``; qui preserviamo quell'ordine
                e spostiamo soltanto i deferiti all'interno della propria
                priorità.
                """
                result = []
                current_phase = None
                phase_items = []

                def flush_phase():
                    if not phase_items:
                        return
                    result.extend(
                        item for item in phase_items
                        if item.id not in deferred_ids
                    )
                    result.extend(
                        item for item in phase_items
                        if item.id in deferred_ids
                    )

                for source_obj in source_objects:
                    phase = int(getattr(source_obj, "priorita", 0) or 0)
                    if current_phase is None:
                        current_phase = phase
                    if phase != current_phase:
                        flush_phase()
                        phase_items = []
                        current_phase = phase
                    phase_items.append(source_obj)
                flush_phase()
                return result

            for _ in range(max_defer_passes):
                source_order = _riordina_deferiti_per_fase(
                    ordered_source_objects,
                    deferred_set,
                )

                repack_objects = [
                    copy.deepcopy(source_obj) for source_obj in source_order
                ]
                for target in repack_objects:
                    target.x, target.y, target.z = 0, 0, 0

                deferred_objects = [
                    copy.deepcopy(source_obj)
                    for source_obj in ordered_source_objects
                    if source_obj.id in deferred_set
                ]

                fresh_tracker = None
                if tracker is not None:
                    from ..sezione_weight_tracker import SezioneWeightTracker
                    fresh_tracker = SezioneWeightTracker(list(tracker.sezioni))
                    if tracker_initial_loads:
                        fresh_tracker.carico_attuale.update(tracker_initial_loads)

                candidate = load_truck_v2(
                    repack_objects,
                    vincoli_sopra=vincoli_sopra,
                    container_dim=container_dim,
                    tracker=fresh_tracker,
                    preserve_order=True,
                    compattazione_aggressiva=compattazione_aggressiva,
                    _defer_internal_singles=False,
                    _run_postprocessing=False,
                )
                # I deferiti sono già stati elaborati alla fine della
                # propria fase; non devono essere spostati nella coda globale
                # dopo le fasi successive.

                fitted_ids = {obj.id for obj in candidate if obj.z >= 0}
                expected_ids = {obj.id for obj in ordered_source_objects}
                candidate_internal_ids = _trova_singoli_interni(
                    candidate, container_h, vincoli_sopra
                )
                nuovi_deferiti = [
                    new_id for new_id in candidate_internal_ids
                    if new_id not in deferred_set
                ]

                # Il candidato deve contenere esattamente gli stessi oggetti
                # del piano di partenza e tutti i deferiti devono essere nella
                # fascia X terminale. Non richiediamo invece che spariscano
                # tutti i singoli di altri tipi: il backtracking successivo
                # potrà trattarli, ma non deve annullare il miglioramento già
                # ottenuto sul singolo richiesto.
                deferiti_in_coda = all(
                    not any(
                        obj.z >= 0
                        and obj.id not in deferred_set
                        and _fase_esplicita(obj) == _fase_esplicita(deferred_obj)
                        and obj.x > deferred_obj.x + 0.5
                        for deferred_obj in candidate
                        if deferred_obj.id == deferred_id
                    )
                    for deferred_id in deferred_set
                )
                candidate_completo = (
                    len(candidate) == expected_fitted_count
                    and fitted_ids == expected_ids
                    and deferiti_in_coda
                )
                if candidate_completo:
                    candidate_score = _score_deferimento(candidate)
                    if candidate_score > best_candidate_score:
                        best_candidate = candidate
                        best_candidate_tracker = fresh_tracker
                        best_candidate_objects = repack_objects
                        best_candidate_score = candidate_score

                # Se sono emersi nuovi singoli, deferiscili in una passata
                # successiva. Altrimenti non c'è una nuova alternativa da
                # esplorare.
                if not nuovi_deferiti:
                    break
                deferred_set.update(nuovi_deferiti)

            if (
                best_candidate is not None
                and best_candidate_score > _score_deferimento(placed)
            ):
                placed = best_candidate
                if tracker is not None and best_candidate_tracker is not None:
                    tracker.carico_attuale.clear()
                    tracker.carico_attuale.update(
                        best_candidate_tracker.carico_attuale
                    )
                best_repack_objects = best_candidate_objects
                unfitted_ids = [
                    obj.id for obj in best_repack_objects
                    if obj.z == -1
                ]

    # ================================================================
    # DEFERRAL PASS LEGACY: mantenuto solo per il percorso che non ha
    # eseguito il repacking dei singoli interni.
    # ================================================================
    if (
        _run_postprocessing
        and not internal_repack_attempted
        and container_h is not None
        and len(placed) > 0
    ):
        _deferral_pass(
            placed, objects, container_dim, vincoli_sopra, tracker,
            compattazione_aggressiva=compattazione_aggressiva,
        )
        _riempi_buchi_sicuro(
            placed, container_dim, vincoli_sopra, tracker,
            compattazione_aggressiva=compattazione_aggressiva,
        )

    # GAP 3: calcola il peso cumulativo sopra ogni oggetto posizionato
    _calcola_pesi_sopra(placed)

    for obj in objects:
        if obj.id in unfitted_ids:
            obj.z = -1
            obj.x = -1
            obj.y = -1

    return placed


# ============================
# DEFERRAL PASS
# ============================

def _ha_oggetto_sopra(placed, target, container_h=None):
    """Verifica se c'e' un oggetto impilato sopra *target*."""
    z_top = target.z + target.height
    # Se arriva al tetto, non c'e' buco
    if container_h is not None and z_top >= container_h - 0.5:
        return True
    x0, x1 = target.x, target.x + target.width
    y0, y1 = target.y, target.y + target.depth
    for p in placed:
        if p is target:
            continue
        if abs(p.z - z_top) < 0.5:
            if p.x < x1 and p.x + p.width > x0 and p.y < y1 and p.y + p.depth > y0:
                return True
    return False


def _piazza_deferiti_in_coda(
    placed,
    deferred_objects,
    container_dim,
    vincoli_sopra,
    tracker=None,
    compattazione_aggressiva=False,
):
    """Piazza i singoli differiti esclusivamente nella coda del carico.

    Lo spazio liberato viene già gestito dal repacking precedente. Qui non
    sono ammesse posizioni interne né stacking: si cerca soltanto l'ultima
    fascia X disponibile, provando tutte le Y candidate compatibili con la
    geometria esistente. Se una riga Y è piena, si apre una nuova riga in X.

    L'operazione è transazionale: se anche un solo differito non entra, lista
    ``placed`` e tracker vengono riportati allo stato iniziale.
    """
    if not deferred_objects:
        return True
    if container_dim is None:
        return False

    container_w, container_d, _ = container_dim
    inseriti = []
    original_state = {
        obj.id: (obj.x, obj.y, obj.z, obj.width, obj.depth, obj.height)
        for obj in deferred_objects
    }

    def _rollback():
        for obj in reversed(inseriti):
            if obj in placed:
                placed.remove(obj)
            if tracker is not None:
                tracker.rimuovi(
                    int(obj.x * 10),
                    int((obj.x + obj.width) * 10),
                    float(getattr(obj, "_peso_kg", 0)),
                )
        for obj in deferred_objects:
            state = original_state[obj.id]
            obj.x, obj.y, obj.z = state[:3]
            obj.width, obj.depth, obj.height = state[3:]

    # La coda è la fascia X più avanzata, non la fine del rettangolo più
    # largo. Questo consente il caso desiderato: un differito da 600x800
    # può condividere X=11700 con un terminale da 800x1200 posto a Y=800.
    row_x = max((obj.x for obj in placed), default=0)
    row_y = 0
    row_start_x = row_x

    for obj in deferred_objects:
        original_dims = original_state[obj.id][3:]
        obj.x, obj.y, obj.z = 0, 0, 0
        obj.width, obj.depth, obj.height = original_dims
        posizionato = False

        # Prova la fascia terminale corrente e, se è piena, tutte le X
        # successive generate dai terminali già presenti. La prima X è la
        # massima X iniziale: ciò consente di condividere la fascia in Y.
        x_candidates = {row_x}
        x_candidates.update(
            p.x + p.width
            for p in placed
            if p.x >= row_start_x - 0.5
        )
        x_candidates.update(
            p.x + p.width
            for p in inseriti
            if p.x >= row_start_x - 0.5
        )

        for try_x in sorted(x_candidates):
            y_candidates = set(_y_candidate_at_x_v2(
                placed, try_x, container_d or float("inf")
            ))
            if try_x == row_x:
                y_candidates.add(row_y)

            for try_y in sorted(y_candidates):
                obj.width, obj.depth, obj.height = original_dims
                if container_w is not None and try_x + obj.width > container_w:
                    continue
                if container_d is not None and try_y + obj.depth > container_d:
                    continue
                if not _prova_tutte_orientazioni(
                    obj,
                    try_x,
                    try_y,
                    0,
                    placed,
                    container_dim,
                    vincoli_sopra,
                    tracker=tracker,
                    compattazione_aggressiva=compattazione_aggressiva,
                ):
                    continue
                if (
                    not compattazione_aggressiva
                    and _c_e_sbalzo_sopra(
                        obj.x, obj.y, obj.width, obj.depth, placed
                    )
                ):
                    continue

                placed.append(obj)
                inseriti.append(obj)
                if tracker is not None:
                    tracker.applica(
                        int(obj.x * 10),
                        int((obj.x + obj.width) * 10),
                        float(getattr(obj, "_peso_kg", 0)),
                    )
                row_x = try_x
                row_start_x = min(row_start_x, try_x)
                row_y = obj.y + obj.depth
                posizionato = True
                break

            if posizionato:
                break

        if not posizionato:
            _rollback()
            return False

    return True


def _ha_oggetto_piu_avanti(placed, target):
    """True se *target* non appartiene alla fascia X più avanzata.

    Il confronto corretto è sulla coordinata X iniziale, non sulla fine del
    volume: un singolo può essere affiancato in Y a un altro oggetto con la
    stessa X (come #19 e #20 nel report), ma può comunque essere interno se
    esistono oggetti a una X successiva. Tutti gli oggetti che iniziano nella
    fascia X massima sono invece considerati terminali.
    """
    max_start_x = max((other.x for other in placed), default=target.x)
    return target.x < max_start_x - 0.5


def _trova_singoli_interni(placed, container_h, vincoli_sopra):
    """Restituisce gli ID dei singoli interni candidati al deferimento.

    Un singolo interno è a pavimento, non ha un oggetto sopra e ha almeno un
    oggetto che inizia oltre la sua fine. Un oggetto più largo affiancato in Y
    con la stessa X appartiene invece alla stessa fascia terminale e non lo
    rende interno.

    NOTA: non escludiamo gli oggetti coinvolti in vincoli tra oggetti. Nel
    caso reale tutti i tipi in carico hanno almeno un vincolo 'sopra', quindi
    quel filtro rendeva il deferimento inerte (nessun singolo veniva mai
    rilevato). Il deferimento non viola i vincoli: l'oggetto resta a z=0 e
    viene rimesso in coda con le stesse regole di verifica (collisioni,
    supporto, peso, vincoli 'sopra' applicati durante il re-inserimento).

    Il parametro ``vincoli_sopra`` è mantenuto solo per compatibilità con i
    chiamanti esistenti: la rilevazione è deliberatamente indipendente dai
    vincoli tra oggetti.
    """
    if not placed:
        return []

    return [
        obj.id for obj in placed
        if obj.z == 0
        and not _ha_oggetto_sopra(placed, obj, container_h)
        and _ha_oggetto_piu_avanti(placed, obj)
    ]


def _valuta_compattezza_locale(placed, container_h):
    """Score per confrontare un packing con e senza singoli interni.

    Prima massimizza gli oggetti caricati, poi minimizza i singoli interni
    e infine minimizza la lunghezza X. Un buco terminale è quindi ammesso,
    mentre un buco nel mezzo viene penalizzato.
    """
    fitted = [obj for obj in placed if obj.z >= 0]
    if not fitted:
        return (0, 0, 0)
    max_x = max(obj.x + obj.width for obj in fitted)
    singoli_interni = sum(
        1 for obj in fitted
        if obj.z == 0
        and not _ha_oggetto_sopra(fitted, obj, container_h)
        and _ha_oggetto_piu_avanti(fitted, obj)
    )
    return score_soluzione(fitted, container_h)


def _deferral_pass(
    placed, all_objects, container_dim, vincoli_sopra, tracker,
    compattazione_aggressiva=False,
):
    """Deferral pass RICORSIVO-AGGRESSIVO.

    Strategia:
    1. RIMUOVI TUTTI gli oggetti a z=0 con buco sopra (nessun oggetto impilato)
    2. Ordinali per "stackabilita'": prima i piu' piccoli (piu' facilmente
       impilabili su colonne esistenti)
    3. Per ogni deferito, PROVA PRIMA lo stacking su colonne esistenti,
       POI il pavimento dopo tutti gli altri
    4. I deferiti che ancora creano buchi vengono TENUTI (non si puo' fare
       di meglio) ma solo DOPO aver provato tutti
    5. Ripeti fino a quando non ci sono piu' miglioramenti (max 5 passate)

    Questo simula il deferimento in-process: l'oggetto che crea il buco
    viene messo da parte, si prova con altri, e lo si recupera solo alla
    fine quando non ci sono alternative.
    """
    cw, cd, ch = container_dim
    if ch is None:
        return

    for pass_num in range(5):
        # 1. Raccogli TUTTI gli oggetti a z=0 con buco sopra
        with_holes = [
            o for o in placed
            if o.z == 0 and not _ha_oggetto_sopra(placed, o, ch)
        ]

        if not with_holes:
            break

        # 2. Salva stato originale di tutti i bucati (per rollback)
        originali = {}
        for o in with_holes:
            originali[o.id] = (
                o, o.x, o.y, o.z, o.width, o.depth, o.height
            )

        # 3. Rimuovi TUTTI i bucati da placed e tracker
        for o in with_holes:
            placed.remove(o)
            if tracker is not None:
                _, ox, oy, oz, ow, od, oh = originali[o.id]
                tracker.rimuovi(int(ox * 10), int((ox + ow) * 10),
                               float(getattr(o, '_peso_kg', 0)))
            # Reset posizione
            o.x, o.y, o.z = 0, 0, 0

        # 4. Ordina per priorita' di ri-piazzamento:
        #    Prima i piu' piccoli (footprint) → piu' facilmente impilabili
        with_holes.sort(key=lambda o: o.width * o.depth)

        # 5. Ripiazza i deferiti: PRIMA stacking, POI pavimento
        migliorato = False
        for obj in with_holes:
            ow, od, oh = obj.width, obj.depth, obj.height
            posizionato = False

            # --- FASE A: Prova stacking su colonne esistenti ---
            #    (solo per oggetti che possono essere impilati)
            if obj.solo_su_piano:
                posizionato = False  # forza FASE B (pavimento)
            else:
                posizionato = False
            columns = _colonne_info(placed) if not obj.solo_su_piano else {}
            # Ordina per (Y, Z crescente, X crescente) — stacking piu' vicino
            sorted_cols = sorted(
                columns.keys(),
                key=lambda k: (k[1], columns[k]['z_top'], k[0])
            )
            for col_x, col_y in sorted_cols:
                col = columns[(col_x, col_y)]
                z_top = col['z_top']
                if z_top + obj.height > ch:
                    continue
                if _prova_tutte_orientazioni(
                    obj, col_x, col_y, z_top,
                    placed, container_dim, vincoli_sopra,
                    tracker=tracker,
                    compattazione_aggressiva=compattazione_aggressiva,
                ):
                    if _check_peso_massimo_tetto_cascade(placed, obj):
                        placed.append(obj)
                        if tracker is not None:
                            tracker.applica(
                                int(obj.x * 10),
                                int((obj.x + obj.width) * 10),
                                float(getattr(obj, '_peso_kg', 0))
                            )
                        posizionato = True
                        migliorato = True  # stacking = sempre meglio!
                        break
                    else:
                        obj.width, obj.depth, obj.height = ow, od, oh

            if posizionato:
                continue

            # --- FASE B: Prova pavimento DOPO tutti gli altri ---
            #    (o in qualsiasi posizione X >= 0)
            obj.width, obj.depth, obj.height = ow, od, oh

            x_pos = set()
            max_xp = max((o.x + o.width for o in placed), default=0)
            # Prova prima in fondo (max_xp), poi negli interstizi
            x_pos.add(max_xp)
            for o in placed:
                x_pos.add(o.x + o.width)
            if cw is not None:
                x_pos = {x for x in x_pos if x + obj.width <= cw}
            # Prova prima le posizioni piu' vicine, cosi' il singolo
            # resta compatto. Poi _riempi_buchi_sicuro compattera'
            # gli oggetti successivi nel buco.
            x_pos = sorted(x_pos)

            for try_x in x_pos:
                y_candidates = _y_candidate_at_x_v2(
                    placed, try_x, cd or float('inf')
                )
                for try_y in y_candidates:
                    if _prova_tutte_orientazioni(
                        obj, try_x, try_y, 0,
                        placed, container_dim, vincoli_sopra,
                        tracker=tracker,
                        compattazione_aggressiva=compattazione_aggressiva,
                    ):
                        placed.append(obj)
                        if tracker is not None:
                            tracker.applica(
                                int(obj.x * 10),
                                int((obj.x + obj.width) * 10),
                                float(getattr(obj, '_peso_kg', 0))
                            )
                        # Verifica se X e' migliorato
                        orig_data = originali.get(obj.id)
                        if orig_data:
                            orig_x_end = orig_data[1] + orig_data[4]
                            if obj.x + obj.width < orig_x_end:
                                migliorato = True
                        posizionato = True
                        break
                if posizionato:
                    break

            if not posizionato:
                # --- FASE C: Ripristina posizione originale ---
                #    (accetta il buco, non si puo' fare di meglio)
                orig_data = originali.get(obj.id)
                if orig_data:
                    _, ox, oy, oz, ow, od, oh = orig_data
                    obj.x, obj.y, obj.z = ox, oy, oz
                    obj.width, obj.depth, obj.height = ow, od, oh
                placed.append(obj)
                if tracker is not None:
                    _, ox, oy, oz, ow, od, oh = originali[obj.id]
                    tracker.applica(int(ox * 10), int((ox + ow) * 10),
                                   float(getattr(obj, '_peso_kg', 0)))

        if not migliorato:
            break

    # ================================================================
    # FASE FINALE: tutti i singoli rimasti vanno in fondo, AFFIANCATI
    # in Y (non in sequenza X). Cosi' X_max aumenta solo del singolo
    # piu' largo, non della somma.
    # ================================================================
    _piazza_singoli_in_fondo(
        placed, container_dim, vincoli_sopra, tracker,
        compattazione_aggressiva=compattazione_aggressiva,
    )


def _piazza_singoli_in_fondo(
    placed, container_dim, vincoli_sopra, tracker,
    compattazione_aggressiva=False,
):
    """Raccoglie TUTTI i singoli (z=0, nessun oggetto sopra) e li piazza
    in fondo al carico, AFFIANCATI in Y (non in sequenza X).

    Cosi' X_max aumenta solo della larghezza del singolo piu' largo,
    non della somma di tutti."""
    cw, cd, ch = container_dim
    if ch is None:
        return

    # Raccogli singoli
    singoli = [o for o in placed
               if o.z == 0 and not _ha_oggetto_sopra(placed, o, ch)]
    if len(singoli) <= 1:
        return  # niente da compattare con 0 o 1 singolo

    # Salva stato originale
    originali = {}
    for o in singoli:
        originali[o.id] = (o.x, o.y, o.z, o.width, o.depth, o.height)

    # Rimuovi tutti i singoli
    for o in singoli:
        placed.remove(o)
        if tracker is not None:
            ox, oy, oz, ow, od, oh = originali[o.id]
            tracker.rimuovi(int(ox * 10), int((ox + ow) * 10),
                           float(getattr(o, '_peso_kg', 0)))
        o.x, o.y, o.z = 0, 0, 0

    # Calcola X di partenza = fine del carico (dopo tutti i non-singoli)
    max_xp = max((o.x + o.width for o in placed), default=0)

    # Piazza i singoli in fondo, affiancati in Y
    # Ordina per larghezza decrescente (i piu' larghi prima)
    singoli.sort(key=lambda o: o.width, reverse=True)

    current_y = 0
    for obj in singoli:
        if current_y + obj.depth > (cd or float('inf')):
            # Non ci sta in Y → vai a capo in X (nuova fila)
            current_y = 0
            max_xp = max_xp + max((o.width for o in singoli
                                   if o.x >= max_xp - 0.5), default=obj.width)

        posizionato = False
        for try_x in [max_xp] + sorted(
            {o.x + o.width for o in placed if o.x + o.width >= max_xp - 0.5}
        ):
            if cw is not None and try_x + obj.width > cw:
                continue
            if _prova_tutte_orientazioni(
                obj, try_x, current_y, 0,
                placed, container_dim, vincoli_sopra,
                tracker=tracker,
                compattazione_aggressiva=compattazione_aggressiva,
            ):
                placed.append(obj)
                if tracker is not None:
                    tracker.applica(int(obj.x * 10),
                                   int((obj.x + obj.width) * 10),
                                   float(getattr(obj, '_peso_kg', 0)))
                current_y = obj.y + obj.depth
                posizionato = True
                break

        if not posizionato:
            # Rollback: ripristina posizione originale
            ox, oy, oz, ow, od, oh = originali[obj.id]
            obj.x, obj.y, obj.z = ox, oy, oz
            obj.width, obj.depth, obj.height = ow, od, oh
            placed.append(obj)
            if tracker is not None:
                tracker.applica(int(ox * 10), int((ox + ow) * 10),
                               float(getattr(obj, '_peso_kg', 0)))


# ============================
# RIEMPIMENTO BUCHI SICURO (sposta intere colonne)
# ============================
def _get_colonna(placed, base):
    """Restituisce tutti gli oggetti impilati sopra *base* (inclusa la base)."""
    colonna = [base]
    current_top_z = base.z + base.height
    x0, x1 = base.x, base.x + base.width
    y0, y1 = base.y, base.y + base.depth

    while True:
        trovato = None
        for p in placed:
            if p in colonna:
                continue
            if abs(p.z - current_top_z) < 0.5:
                if p.x < x1 and p.x + p.width > x0 and p.y < y1 and p.y + p.depth > y0:
                    trovato = p
                    break
        if trovato is None:
            break
        colonna.append(trovato)
        current_top_z = trovato.z + trovato.height
        x0, x1 = trovato.x, trovato.x + trovato.width
        y0, y1 = trovato.y, trovato.y + trovato.depth

    return colonna


def _riempi_buchi_sicuro(
    placed, container_dim, vincoli_sopra, tracker,
    compattazione_aggressiva=False,
):
    """Riempie i buchi impilando INTERE COLONNE da X precedenti sopra
    gli oggetti rimasti soli. Verifica ogni oggetto con _prova_volume,
    quindi niente oggetti volanti."""
    cw, cd, ch = container_dim

    for _ in range(2):  # max 2 passate
        migliorato = False

        # Trova buchi: oggetti a z=0 senza nulla sopra
        buchi = [o for o in placed if o.z == 0 and not _ha_oggetto_sopra(placed, o, ch)]
        if not buchi:
            break

        # Ordina per X decrescente (riempi prima i buchi piu' avanti)
        buchi.sort(key=lambda o: o.x, reverse=True)

        for buco in buchi[:3]:  # max 3 buchi per passata
            bx, by, bz_top = buco.x, buco.y, buco.z + buco.height
            bw, bd = buco.width, buco.depth

            # Cerca colonne da QUALSIASI X (prima o dopo il buco)
            # che potrebbero impilarsi sopra. ESCLUDE oggetti solo_su_piano
            # e oggetti che hanno gia' qualcosa impilato sopra (sono basi).
            # Ordina per vicinanza al buco (le piu' vicine prima).
            candidati = [
                o for o in placed
                if o.z == 0 and o is not buco
                and not o.solo_su_piano
                and not _ha_oggetto_sopra(placed, o, ch)
                and o.width <= bw and o.depth <= bd
                and o.height <= ch - bz_top
            ]
            # Piu' vicine al buco prima (cosi' compattiamo)
            candidati.sort(key=lambda o: abs(o.x - buco.x))

            for base_cand in candidati[:2]:
                # Estrai l'intera colonna
                colonna = _get_colonna(placed, base_cand)

                # Salva coordinate originali di tutta la colonna
                originali = [(o, o.x, o.y, o.z, o.width, o.depth, o.height)
                            for o in colonna]

                # Rimuovi colonna da placed e tracker
                for o in colonna:
                    placed.remove(o)
                    if tracker is not None:
                        x_start = int(o.x * 10)
                        x_end = int((o.x + o.width) * 10)
                        tracker.rimuovi(x_start, x_end,
                                       float(getattr(o, '_peso_kg', 0)))

                # Prova a piazzare la base sopra il buco
                base_cand.x, base_cand.y, base_cand.z = 0, 0, 0

                if _prova_tutte_orientazioni(
                    base_cand, bx, by, bz_top,
                    placed, container_dim, vincoli_sopra,
                    tracker=tracker,
                    compattazione_aggressiva=compattazione_aggressiva,
                ):
                    # Base piazzata! Calcola offset per il resto della colonna
                    x_offset = base_cand.x - originali[0][1]  # delta X
                    y_offset = base_cand.y - originali[0][2]  # delta Y
                    z_offset = base_cand.z - originali[0][3]  # delta Z
                    ok = True

                    for o, ox, oy, oz, ow, od, oh in originali[1:]:
                        new_x = ox + x_offset
                        new_y = oy + y_offset
                        new_z = oz + z_offset
                        if ch is not None and new_z + oh > ch:
                            ok = False
                            break
                        o.x, o.y, o.z = 0, 0, 0
                        o.width, o.depth, o.height = ow, od, oh
                        if not _prova_tutte_orientazioni(
                            o, new_x, new_y, new_z,
                            placed + [bo for bo in colonna if bo is not o],
                            container_dim, vincoli_sopra,
                            tracker=tracker,
                            compattazione_aggressiva=compattazione_aggressiva,
                        ):
                            ok = False
                            break

                    if ok:
                        # Successo! Aggiungi tutta la colonna
                        for o, _, _, _, _, _, _ in originali:
                            placed.append(o)
                            if tracker is not None:
                                x_start = int(o.x * 10)
                                x_end = int((o.x + o.width) * 10)
                                tracker.applica(x_start, x_end,
                                               float(getattr(o, '_peso_kg', 0)))
                        migliorato = True
                        break  # passa al prossimo buco

                # Rollback: ripristina coordinate originali
                for (o, ox, oy, oz, ow, od, oh) in originali:
                    o.x, o.y, o.z = ox, oy, oz
                    o.width, o.depth, o.height = ow, od, oh
                    placed.append(o)
                    if tracker is not None:
                        x_start = int(ox * 10)
                        x_end = int((ox + ow) * 10)
                        tracker.applica(x_start, x_end,
                                       float(getattr(o, '_peso_kg', 0)))

        if not migliorato:
            break


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
    best_priority_count = sum(
        1 for obj in placed if getattr(obj, 'priorita', 0) > 0
    ) if placed else 0

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
            new_priority_count = sum(
                1 for obj in new_placed if getattr(obj, 'priorita', 0) > 0
            )
            if (
                new_priority_count > best_priority_count
                or (
                    new_priority_count == best_priority_count
                    and (
                        new_count > best_count
                        or (new_count == best_count and new_length < best_length)
                    )
                )
            ):
                best_solution = new_solution
                best_length = new_length
                best_count = new_count
                best_priority_count = new_priority_count

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
    best_priority_count = sum(
        1 for obj in placed if getattr(obj, 'priorita', 0) > 0
    ) if placed else 0

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
            new_priority_count = sum(
                1 for obj in new_placed if getattr(obj, 'priorita', 0) > 0
            )
            if (
                new_priority_count > best_priority_count
                or (
                    new_priority_count == best_priority_count
                    and (
                        new_count > best_count
                        or (new_count == best_count and new_length < best_length)
                    )
                )
            ):
                best_solution = new_solution
                best_length = new_length
                best_count = new_count
                best_priority_count = new_priority_count

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
