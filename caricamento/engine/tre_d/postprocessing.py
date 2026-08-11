"""Routine di post-processing del packing 3D.

Il modulo è indipendente dal packer: le regole di posizionamento e gli helper
specifici vengono passati tramite callback. Le operazioni che spostano oggetti
sono transazionali: un tentativo fallito ripristina coordinate, dimensioni,
lista ``placed`` e stato del tracker.
"""


def has_object_above(placed, target, container_h=None):
    """Verifica se esiste un oggetto impilato direttamente sopra ``target``."""
    z_top = target.z + target.height
    if container_h is not None and z_top >= container_h - 0.5:
        return True
    x0, x1 = target.x, target.x + target.width
    y0, y1 = target.y, target.y + target.depth
    for other in placed:
        if other is target:
            continue
        if abs(other.z - z_top) < 0.5:
            if (
                other.x < x1
                and other.x + other.width > x0
                and other.y < y1
                and other.y + other.depth > y0
            ):
                return True
    return False


def has_object_ahead(placed, target):
    """Verifica se ``target`` è interno rispetto alla fascia X terminale.

    Il rilevamento dei candidati mantiene la semantica storica basata
    sull'inizio della fascia; il controllo più stretto sulla fine geometrica
    viene applicato separatamente quando si accetta un deferimento.
    """
    max_start_x = max((other.x for other in placed), default=target.x)
    return target.x < max_start_x - 0.5


def find_internal_singles(placed, container_h, constraints=None):
    """Restituisce gli ID degli oggetti singoli interni candidati al deferral."""
    if not placed:
        return []
    return [
        obj.id
        for obj in placed
        if obj.z == 0
        and not has_object_above(placed, obj, container_h)
        and has_object_ahead(placed, obj)
    ]


def get_column(placed, base):
    """Restituisce tutti gli oggetti impilati sopra ``base`` inclusa la base."""
    column = [base]
    current_top_z = base.z + base.height
    x0, x1 = base.x, base.x + base.width
    y0, y1 = base.y, base.y + base.depth

    while True:
        found = None
        for other in placed:
            if other in column:
                continue
            if abs(other.z - current_top_z) < 0.5:
                if (
                    other.x < x1
                    and other.x + other.width > x0
                    and other.y < y1
                    and other.y + other.depth > y0
                ):
                    found = other
                    break
        if found is None:
            break
        column.append(found)
        current_top_z = found.z + found.height
        x0, x1 = found.x, found.x + found.width
        y0, y1 = found.y, found.y + found.depth

    return column


def _restore_tracker(tracker, snapshot):
    if tracker is not None and snapshot is not None:
        tracker.carico_attuale.clear()
        tracker.carico_attuale.update(snapshot)


def _object_state(obj):
    return (obj.x, obj.y, obj.z, obj.width, obj.depth, obj.height)


def _restore_object_state(obj, state):
    obj.x, obj.y, obj.z = state[:3]
    obj.width, obj.depth, obj.height = state[3:]


def place_singles_at_end(
    placed,
    container_dim,
    constraints,
    tracker,
    try_orientations,
    *,
    compattazione_aggressiva=False,
):
    """Raccoglie i singoli e li riposiziona in fondo, affiancandoli in Y.

    L'intero batch è transazionale: se anche un solo singolo non trova una
    posizione valida, il carico torna esattamente allo stato iniziale.
    """
    if container_dim is None:
        return False
    container_w, container_d, container_h = container_dim
    if container_h is None:
        return False

    # I singoli già nella fascia terminale non vanno rimossi e ricomposti:
    # sono già nella posizione corretta. Si spostano soltanto quelli interni,
    # cioè con un altro oggetto più avanti sull'asse X.
    singles = [
        obj for obj in placed
        if (
            obj.z == 0
            and not has_object_above(placed, obj, container_h)
            and has_object_ahead(placed, obj)
        )
    ]
    if len(singles) <= 1:
        return True

    original_placed = list(placed)
    original_states = {obj.id: _object_state(obj) for obj in singles}
    tracker_snapshot = (
        dict(tracker.carico_attuale) if tracker is not None else None
    )

    def rollback():
        placed[:] = original_placed
        for obj in singles:
            _restore_object_state(obj, original_states[obj.id])
        _restore_tracker(tracker, tracker_snapshot)

    for obj in singles:
        placed.remove(obj)
        state = original_states[obj.id]
        if tracker is not None:
            tracker.rimuovi(
                int(state[0] * 10),
                int((state[0] + state[3]) * 10),
                float(getattr(obj, "_peso_kg", 0)),
            )
        _restore_object_state(obj, state)
        obj.x, obj.y, obj.z = 0, 0, 0

    max_x = max((obj.x + obj.width for obj in placed), default=0)
    singles.sort(key=lambda obj: obj.width, reverse=True)
    current_y = 0
    row_width = 0

    for obj in singles:
        state = original_states[obj.id]
        original_dims = state[3:]
        # Non scartare una posizione usando le dimensioni originali: una
        # rotazione consentita può ridurre la profondità o la larghezza.
        # Il callback è l'unico punto che conosce l'orientamento effettivo.
        row_required = (
            current_y > 0
            and current_y + original_dims[1] > (container_d or float("inf"))
        )
        y_candidates = [current_y]
        if row_required:
            y_candidates.append(0)

        positioned = False
        for try_y in y_candidates:
            row_x = max_x
            if try_y == 0 and current_y > 0:
                row_x += row_width or original_dims[0]

            candidate_x = {row_x}
            candidate_x.update(
                other.x + other.width
                for other in placed
                if other.x + other.width >= row_x - 0.5
            )

            for try_x in sorted(candidate_x):
                _restore_object_state(obj, state)
                obj.x, obj.y, obj.z = 0, 0, 0
                if try_orientations(
                    obj,
                    try_x,
                    try_y,
                    0,
                    placed,
                    container_dim,
                    constraints,
                    tracker=tracker,
                    compattazione_aggressiva=compattazione_aggressiva,
                ):
                    placed.append(obj)
                    if tracker is not None:
                        tracker.applica(
                            int(obj.x * 10),
                            int((obj.x + obj.width) * 10),
                            float(getattr(obj, "_peso_kg", 0)),
                        )
                    if try_y == 0 and current_y > 0:
                        max_x = row_x
                        row_width = 0
                    current_y = obj.y + obj.depth
                    row_width = max(row_width, obj.width)
                    positioned = True
                    break

            if positioned:
                break

        if not positioned:
            rollback()
            return False

    return True


def fill_holes_safely(
    placed,
    container_dim,
    constraints,
    tracker,
    try_orientations,
    *,
    fixed_orientation=None,
    fixed_base_orientation=None,
    compattazione_aggressiva=False,
):
    """Prova a riempire buchi spostando intere colonne con rollback.

    La base usa ``fixed_base_orientation`` quando fornito; gli elementi già
    presenti nella colonna usano ``fixed_orientation``. In questo modo una
    colonna viene traslata rigidamente e non ricomposta con orientamenti nuovi.
    """
    if container_dim is None:
        return False
    container_w, container_d, container_h = container_dim
    if container_h is None:
        return False

    for _ in range(2):
        improved = False
        holes = [
            obj for obj in placed
            if obj.z == 0 and not has_object_above(placed, obj, container_h)
        ]
        if not holes:
            break
        holes.sort(key=lambda obj: obj.x, reverse=True)

        for hole in holes[:3]:
            hole_x, hole_y = hole.x, hole.y
            hole_top_z = hole.z + hole.height
            hole_width, hole_depth = hole.width, hole.depth
            candidates = [
                obj for obj in placed
                if obj.z == 0
                and obj is not hole
                and not obj.solo_su_piano
                and not has_object_above(placed, obj, container_h)
                and obj.height <= container_h - hole_top_z
            ]
            candidates.sort(key=lambda obj: abs(obj.x - hole.x))

            for base in candidates[:2]:
                column = get_column(placed, base)
                original = [
                    (obj, _object_state(obj)) for obj in column
                ]
                tracker_snapshot = (
                    dict(tracker.carico_attuale) if tracker is not None else None
                )

                for obj, state in original:
                    placed.remove(obj)
                    if tracker is not None:
                        tracker.rimuovi(
                            int(state[0] * 10),
                            int((state[0] + state[3]) * 10),
                            float(getattr(obj, "_peso_kg", 0)),
                        )
                    _restore_object_state(obj, state)

                base_state = next(state for obj, state in original if obj is base)
                _restore_object_state(base, base_state)
                base.x, base.y, base.z = 0, 0, 0
                base_try = fixed_base_orientation or try_orientations
                valid = base_try(
                    base,
                    hole_x,
                    hole_y,
                    hole_top_z,
                    placed,
                    container_dim,
                    constraints,
                    tracker=tracker,
                    compattazione_aggressiva=compattazione_aggressiva,
                )

                shifted_column = []
                if valid:
                    if tracker is not None:
                        tracker.applica(
                            int(base.x * 10),
                            int((base.x + base.width) * 10),
                            float(getattr(base, "_peso_kg", 0)),
                        )
                    shifted_column.append(base)
                    x_offset = base.x - base_state[0]
                    y_offset = base.y - base_state[1]
                    z_offset = base.z - base_state[2]

                    for obj, state in original:
                        if obj is base:
                            continue
                        new_x = state[0] + x_offset
                        new_y = state[1] + y_offset
                        new_z = state[2] + z_offset
                        if new_z + state[5] > container_h:
                            valid = False
                            break
                        _restore_object_state(obj, state)
                        # Una colonna già esistente deve restare rigida: il
                        # suo spostamento non può ruotare solo un elemento,
                        # altrimenti si perde la geometria relativa della
                        # pila. Se non è fornito un callback specializzato,
                        # manteniamo il comportamento precedente.
                        fixed_try = fixed_orientation or try_orientations
                        obj.x, obj.y, obj.z = 0, 0, 0
                        if not fixed_try(
                            obj,
                            new_x,
                            new_y,
                            new_z,
                            placed + shifted_column,
                            container_dim,
                            constraints,
                            tracker=tracker,
                            compattazione_aggressiva=compattazione_aggressiva,
                        ):
                            valid = False
                            break
                        if tracker is not None:
                            tracker.applica(
                                int(obj.x * 10),
                                int((obj.x + obj.width) * 10),
                                float(getattr(obj, "_peso_kg", 0)),
                            )
                        shifted_column.append(obj)

                if valid:
                    for obj, _ in original:
                        placed.append(obj)
                    improved = True
                    break

                _restore_tracker(tracker, tracker_snapshot)
                for obj, state in original:
                    _restore_object_state(obj, state)
                    placed.append(obj)

            if improved:
                break

        if not improved:
            break

    return True


def defer_singles(
    placed,
    all_objects,
    container_dim,
    constraints,
    tracker,
    try_orientations,
    columns_info,
    y_candidates_at_x,
    check_weight,
    *,
    compattazione_aggressiva=False,
):
    """Differisce un singolo interno e ricompatta il suffisso del carico.

    Ogni tentativo è transazionale: il singolo viene rimosso, gli oggetti che
    occupano la coda vengono ricaricati nell'ordine Y -> Z -> X e il singolo
    viene provato per ultimo. Se il suffisso non entra, si ripristina soltanto
    quel tentativo e si passa al successivo singolo candidato.
    """
    if container_dim is None:
        return
    container_w, container_d, container_h = container_dim
    if container_h is None:
        return

    attempted_targets = set()

    def _overlap_xy(left, right):
        return (
            left.x < right.x + right.width
            and left.x + left.width > right.x
            and left.y < right.y + right.depth
            and left.y + left.depth > right.y
        )

    def _expand_dependencies(seed_objects, current_placed):
        """Include solo gli oggetti sopra le colonne del suffisso.

        Il prefisso a sinistra del singolo resta congelato. Le basi sotto un
        oggetto del suffisso non vengono trascinate nel batch: se la nuova
        disposizione non riesce a ricostruire correttamente il supporto, la
        validazione finale provoca il rollback invece di spostare il prefisso.
        """
        selected = list(seed_objects)
        selected_ids = {obj.id for obj in selected}
        changed = True
        while changed:
            changed = False
            for obj in current_placed:
                if obj.id in selected_ids:
                    continue
                for selected_obj in tuple(selected):
                    directly_above = (
                        abs(obj.z - (selected_obj.z + selected_obj.height)) < 0.5
                        and _overlap_xy(obj, selected_obj)
                    )
                    if directly_above:
                        selected.append(obj)
                        selected_ids.add(obj.id)
                        changed = True
                        break
        return selected

    def _layout_valid(current_placed):
        """Controllo finale collisioni/vincoli dopo il repacking del suffisso."""
        from .placement_rules import _check_z_collision

        for index, obj in enumerate(current_placed):
            others = current_placed[:index] + current_placed[index + 1:]
            if _check_z_collision(obj, others):
                return False
        if constraints:
            from .priority_policy import valida_vincoli_sopra
            report = valida_vincoli_sopra(
                all_objects,
                current_placed,
                constraints,
            )
            if not report["vincoli_completi"]:
                return False
        return True

    for _ in range(5):
        internal_singles = [
            obj for obj in placed
            if (
                obj.id not in attempted_targets
                and obj.z == 0
                and not has_object_above(placed, obj, container_h)
                and has_object_ahead(placed, obj)
            )
        ]
        if not internal_singles:
            break

        # L'ordine della lista può dipendere dal random packer: il primo
        # candidato deve invece essere quello più avanti nella fascia interna.
        target = min(
            internal_singles,
            key=lambda obj: (obj.x, obj.y, obj.z, obj.id),
        )
        target_x = target.x
        target_original_state = _object_state(target)
        old_max_x = max(
            (obj.x + obj.width for obj in placed if obj.z >= 0),
            default=0,
        )
        old_internal_count = sum(
            1 for obj in placed
            if obj.z == 0
            and not has_object_above(placed, obj, container_h)
            and has_object_ahead(placed, obj)
        )

        batch_original_placed = list(placed)
        batch_original_states = {
            obj.id: _object_state(obj) for obj in batch_original_placed
        }
        batch_tracker_snapshot = (
            dict(tracker.carico_attuale) if tracker is not None else None
        )

        def rollback_batch():
            placed[:] = batch_original_placed
            for saved_obj in batch_original_placed:
                _restore_object_state(
                    saved_obj,
                    batch_original_states[saved_obj.id],
                )
            _restore_tracker(tracker, batch_tracker_snapshot)

        # Il suffisso comprende gli oggetti che intersecano il punto X del
        # singolo. Poi si chiudono anche tutte le dipendenze sopra/sotto delle
        # colonne coinvolte, evitando pile spezzate durante il repacking.
        suffix_seed = [
            obj for obj in placed
            if obj is target or obj.x + obj.width > target_x + 0.5
        ]
        with_holes = _expand_dependencies(suffix_seed, placed)
        original = {
            obj.id: (obj, _object_state(obj))
            for obj in with_holes
        }
        for obj in with_holes:
            placed.remove(obj)
            state = original[obj.id][1]
            if tracker is not None:
                tracker.rimuovi(
                    int(state[0] * 10),
                    int((state[0] + state[3]) * 10),
                    float(getattr(obj, "_peso_kg", 0)),
                )
            _restore_object_state(obj, state)
            obj.x, obj.y, obj.z = 0, 0, 0

        # Il target è l'ultimo: prima si riempie lo spazio con gli altri
        # codici, rispettando le regole di stacking e i relativi vincoli.
        with_holes.sort(
            key=lambda obj: (
                obj is target,
                original[obj.id][1][0],
                original[obj.id][1][1],
                original[obj.id][1][2],
                obj.id,
            )
        )
        batch_ok = True
        for obj in with_holes:
            original_state = original[obj.id][1]
            original_dims = original_state[3:]
            positioned = False

            columns = (
                {}
                if obj is target or obj.solo_su_piano
                else {
                    key: value
                    for key, value in columns_info(placed).items()
                    if key[0] + value["top_item"].width > target_x + 0.5
                }
            )
            sorted_columns = sorted(
                columns.keys(),
                key=lambda key: (
                    key[0], key[1], columns[key]["z_top"]
                ),
            )
            for col_x, col_y in sorted_columns:
                z_top = columns[(col_x, col_y)]["z_top"]
                if z_top + original_dims[2] > container_h:
                    continue
                _restore_object_state(obj, original_state)
                if (
                    try_orientations(
                        obj,
                        col_x,
                        col_y,
                        z_top,
                        placed,
                        container_dim,
                        constraints,
                        tracker=tracker,
                        compattazione_aggressiva=compattazione_aggressiva,
                    )
                    and check_weight(placed, obj)
                ):
                    placed.append(obj)
                    if tracker is not None:
                        tracker.applica(
                            int(obj.x * 10),
                            int((obj.x + obj.width) * 10),
                            float(getattr(obj, "_peso_kg", 0)),
                        )
                    positioned = True
                    break
                _restore_object_state(obj, original_state)

            if positioned:
                continue

            # Per gli oggetti del suffisso la prima X da provare è quella
            # dell'isolato rimosso: è il punto in cui va tappato il buco.
            # Solo il target differito viene invece cercato esclusivamente
            # nella coda. In entrambi i casi Y precede l'apertura di una
            # nuova fascia X.
            _restore_object_state(obj, original_state)
            terminal_x = max(
                (other.x + other.width for other in placed if other.z >= 0),
                default=target_x,
            )
            if obj is target:
                # La coda è la fine geometrica del carico, non l'inizio
                # dell'oggetto più avanzato: così il differito non resta
                # davanti a un terminale che parte prima ma è più largo.
                x_positions = {terminal_x}
                x_positions.update(
                    other.x + other.width
                    for other in placed
                    if other.z >= 0 and other.x + other.width >= target_x
                )
            else:
                x_positions = {target_x}
                x_positions.update(
                    other.x + other.width
                    for other in placed
                    if other.z >= 0 and other.x + other.width >= target_x
                )
            # Non filtrare in base alla dimensione originale: il callback può
            # trovare una rotazione valida con una dimensione X diversa.
            if container_w is not None:
                x_positions = {
                    x for x in x_positions
                    if x < container_w
                }
            for try_x in sorted(x_positions):
                for try_y in y_candidates_at_x(
                    placed,
                    try_x,
                    container_d or float("inf"),
                ):
                    _restore_object_state(obj, original_state)
                    if try_orientations(
                        obj,
                        try_x,
                        try_y,
                        0,
                        placed,
                        container_dim,
                        constraints,
                        tracker=tracker,
                        compattazione_aggressiva=compattazione_aggressiva,
                    ):
                        placed.append(obj)
                        if tracker is not None:
                            tracker.applica(
                                int(obj.x * 10),
                                int((obj.x + obj.width) * 10),
                                float(getattr(obj, "_peso_kg", 0)),
                            )
                        positioned = True
                        break
                if positioned:
                    break

            if not positioned:
                batch_ok = False
                break

        if batch_ok:
            target_end_in_tail = (
                target in placed
                and target.z >= 0
                # La coda è una fascia X: più oggetti possono iniziare
                # sulla stessa X e affiancarsi in Y. Non serve quindi che il
                # target abbia la massima estremità X, ma solo che nessun
                # oggetto inizi più avanti.
                and target.x >= max(
                    (
                        other.x
                        for other in placed
                        if other is not target and other.z >= 0
                    ),
                    default=target.x,
                ) - 0.5
            )
            new_max_x = max(
                (obj.x + obj.width for obj in placed if obj.z >= 0),
                default=0,
            )
            new_internal_count = sum(
                1 for obj in placed
                if obj.z == 0
                and not has_object_above(placed, obj, container_h)
                and has_object_ahead(placed, obj)
            )
            # Se il target viene accodato, il suo buco può far emergere un
            # nuovo candidato interno. Questo non è un peggioramento: è la
            # coda sequenziale richiesta, che va trattata nella passata
            # successiva. Verifichiamo quindi che almeno un altro oggetto
            # abbia realmente occupato la fascia liberata.
            filled_gap = any(
                obj is not target
                and obj.id in original
                and (
                    obj.x <= target_x + 0.5
                    and obj.x + obj.width > target_x + 0.5
                    or obj.x < original[obj.id][1][0] - 0.5
                )
                for obj in placed
            )
            improved = (
                target_end_in_tail
                and _layout_valid(placed)
                and (
                    filled_gap
                    or new_max_x < old_max_x - 0.5
                    or new_internal_count < old_internal_count
                )
            )
            if improved:
                # Il layout modificato diventa la nuova base per cercare il
                # successivo isolato; un candidato fallito in precedenza può
                # ora essere valido dopo questo riempimento.
                attempted_targets.clear()
                continue

        # Rollback del solo tentativo corrente. Non si interrompe il processo:
        # si marca il target e si prova il prossimo singolo sulla disposizione
        # originale, come richiesto dalla strategia sequenziale.
        rollback_batch()
        attempted_targets.add(target.id)

    return True





# Compatibility aliases used by the packer during the staged migration.
_ha_oggetto_sopra = has_object_above
_ha_oggetto_piu_avanti = has_object_ahead
_trova_singoli_interni = find_internal_singles
_piazza_singoli_in_fondo = place_singles_at_end
_get_colonna = get_column
_riempi_buchi_sicuro = fill_holes_safely
_deferral_pass = defer_singles


__all__ = [
    "has_object_above",
    "has_object_ahead",
    "find_internal_singles",
    "get_column",
    "place_singles_at_end",
    "fill_holes_safely",
    "defer_singles",
    "_ha_oggetto_sopra",
    "_ha_oggetto_piu_avanti",
    "_trova_singoli_interni",
    "_piazza_singoli_in_fondo",
    "_get_colonna",
    "_riempi_buchi_sicuro",
    "_deferral_pass",
]
