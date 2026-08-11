"""Ottimizzazione locale di gruppi omogenei per il packing 3D deterministico.

Il modulo non crea macro-oggetti: prepara copie degli oggetti originali con
un orientamento XY forzato per un sottoinsieme del gruppo e delega ogni
verifica geometrica, di peso e di vincolo a ``load_truck_v2``.

Sono provate soltanto configurazioni a blocchi promettenti. In particolare,
si cerca di sfruttare i casi in cui la rotazione aumenta il numero di righe
che possono entrare nella larghezza Y del contenitore. Monte Carlo e v3 non
importano questo modulo.
"""

from __future__ import annotations

import copy
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from .packer_3d_v2 import load_truck_v2, filter_unfitted
from .priority_policy import score_soluzione, valida_vincoli_sopra


# Limita il numero di configurazioni per codice: 0 (baseline escluso), una
# riga completa e due righe complete. Per i carichi web questo evita una
# crescita combinatoria mantenendo il caso 2x2 richiesto dall'operatore.
MAX_BLOCK_MULTIPLIER = 2
# Tetto globale per una richiesta HTTP: baseline + al massimo quattro prove.
MAX_GROUP_TRIALS = 4


def _group_key(obj) -> Tuple:
    """Raggruppa solo istanze con tutte le regole di posa compatibili."""
    return (
        getattr(obj, "oggetto_id", None),
        getattr(obj, "width", 0),
        getattr(obj, "depth", 0),
        getattr(obj, "height", 0),
        bool(getattr(obj, "orientation_allowed", False)),
        bool(getattr(obj, "rotazione_su_z", False)),
        bool(getattr(obj, "rotazione_su_x", False)),
        bool(getattr(obj, "rotazione_su_y", False)),
        bool(getattr(obj, "sovrapponibile", True)),
        bool(getattr(obj, "solo_su_piano", False)),
        bool(getattr(obj, "fragile", False)),
        float(getattr(obj, "peso_massimo_tetto", 0) or 0),
        int(getattr(obj, "priorita", 0) or 0),
        getattr(obj, "vincolo_oggetto_id", None),
    )


def candidate_rotation_counts(
    quantity: int,
    width: float,
    depth: float,
    container_dim: Optional[tuple],
) -> List[int]:
    """Restituisce i conteggi ruotati da provare per un gruppo.

    Il conteggio è scelto dalla capacità teorica della sezione Y, non da un
    numero fisso di pezzi:

    - ``rows_original`` è il numero di oggetti originali affiancabili in Y;
    - ``rows_rotated`` è il numero ottenibile dopo lo scambio X/Y;
    - se la rotazione non aumenta le righe, il gruppo non è candidato;
    - si provano una riga completa e, al massimo, due righe complete.

    Per un I05 600x800 in un contenitore Y=2480:
    ``rows_original=3``, ``rows_rotated=4`` e i candidati sono 4 e 8
    (troncati alla quantità disponibile). Il caso 2x2 è quindi il candidato
    ``4`` quando il gruppo contiene almeno quattro istanze.
    """
    quantity = max(0, int(quantity))
    if quantity == 0 or not container_dim or len(container_dim) < 2:
        return []
    container_y = float(container_dim[1])
    if width <= 0 or depth <= 0 or container_y <= 0:
        return []

    rows_original = int(container_y // depth)
    rows_rotated = int(container_y // width)
    if rows_rotated <= rows_original or rows_rotated <= 0:
        return []

    counts = []
    for multiplier in range(1, MAX_BLOCK_MULTIPLIER + 1):
        count = min(quantity, rows_rotated * multiplier)
        if count > 0:
            counts.append(count)
    return sorted(set(counts))


def _clone_tracker(tracker):
    """Clona il tracker senza condividere il carico tra candidati."""
    return copy.deepcopy(tracker) if tracker is not None else None


def _restore_tracker(target, source) -> None:
    """Copia nel tracker reale lo stato del candidato vincente."""
    if target is None or source is None:
        return
    if hasattr(target, "carico_attuale") and hasattr(source, "carico_attuale"):
        target.carico_attuale.clear()
        target.carico_attuale.update(source.carico_attuale)


def _groups(objects: Sequence) -> Iterable[Tuple[Tuple, List]]:
    grouped: Dict[Tuple, List] = {}
    for obj in objects:
        grouped.setdefault(_group_key(obj), []).append(obj)
    return grouped.items()


def _constraint_details(constraints: Optional[dict], above_id, below_id):
    """Restituisce i dettagli della relazione, distinguendo divieti e richieste."""
    required = (constraints or {}).get(above_id, {})
    if not isinstance(required, dict) or below_id not in required:
        return None, False
    details = required[below_id]
    # Un set vuoto rappresenta una configurazione esplicitamente vietata, non
    # una colonna da costruire. Le relazioni None o con configurazioni valide
    # sono invece autorizzate e possono formare un blocco.
    if isinstance(details, set) and not details:
        return details, False
    return details, True


def _group_is_relational(group_key: Tuple, constraints: Optional[dict]) -> bool:
    """Indica se il gruppo tocca una relazione cross autorizzata.

    I divieti ``A sopra B`` con configurazione vuota non descrivono una
    colonna: devono restare semplicemente controllati dal validatore e non
    impedire la rotazione di un gruppo omogeneo. Solo una relazione cross con
    almeno una configurazione consentita (o legacy ``None``) richiede il
    trattamento solidale del blocco.
    """
    object_id = group_key[0]
    for dependent_id, bases in (constraints or {}).items():
        if not isinstance(bases, dict):
            bases = {base_id: None for base_id in bases or ()}
        for base_id, details in bases.items():
            if dependent_id == base_id:
                continue
            if not isinstance(details, set) or details:
                if object_id in (dependent_id, base_id):
                    return True
    return False


def _directly_above(above, below) -> bool:
    """Verifica contatto verticale e sovrapposizione XY tra due istanze."""
    return (
        above.z >= 0
        and below.z >= 0
        and abs(above.z - (below.z + below.height)) <= 0.001
        and above.x < below.x + below.width
        and above.x + above.width > below.x
        and above.y < below.y + below.depth
        and above.y + above.depth > below.y
    )


def _relational_blocks(solution: Sequence, constraints: Optional[dict]) -> List[Tuple[Tuple[str, ...], Dict[str, Tuple[float, float, float]]]]:
    """Estrae le colonne reali che contengono almeno una relazione cross.

    Il blocco è la colonna completa, non soltanto l'oggetto A: in questo modo
    una rotazione non può separare A dalla base B. I blocchi sono estratti dal
    layout baseline, quindi il numero di tentativi non cresce con tutte le
    combinazioni teoriche del piano.
    """
    fitted = [obj for obj in solution if getattr(obj, "z", -1) >= 0]
    columns: Dict[Tuple[float, float], List] = {}
    for obj in fitted:
        columns.setdefault((obj.x, obj.y), []).append(obj)

    blocks = []
    for column in columns.values():
        column.sort(key=lambda obj: obj.z)
        has_cross = any(
            _constraint_details(
                constraints,
                above.oggetto_id,
                below.oggetto_id,
            )[1]
            and above.oggetto_id != below.oggetto_id
            for below, above in zip(column, column[1:])
        )
        if not has_cross or len(column) < 2:
            continue
        member_ids = tuple(obj.id for obj in column)
        dimensions = {
            obj.id: (obj.width, obj.depth, obj.height)
            for obj in column
        }
        blocks.append((member_ids, dimensions))
    return blocks


def _force_relational_block(
    objects: List,
    member_ids: Sequence[str],
    original_dimensions: Dict[str, Tuple[float, float, float]],
) -> None:
    """Ruota solidalmente tutti i membri XY di una colonna relazionale."""
    by_id = {obj.id: obj for obj in objects}
    for member_id in member_ids:
        obj = by_id[member_id]
        width, depth, height = original_dimensions[member_id]
        obj.width, obj.depth, obj.height = depth, width, height
        obj.rotazione_su_x = False
        obj.rotazione_su_y = False
        obj.rotazione_su_z = False


def _move_relational_block(
    objects: List,
    member_ids: Sequence[str],
) -> List:
    """Rende contigua una colonna e ordina dal basso verso l'alto."""
    member_set = set(member_ids)
    selected_by_id = {obj.id: obj for obj in objects if obj.id in member_set}
    selected = [selected_by_id[obj_id] for obj_id in member_ids if obj_id in selected_by_id]
    if not selected:
        return list(objects)
    first_index = min(index for index, obj in enumerate(objects) if obj.id in member_set)
    remainder = [obj for obj in objects if obj.id not in member_set]
    before_count = sum(
        1 for obj in objects[:first_index] if obj.id not in member_set
    )
    return remainder[:before_count] + selected + remainder[before_count:]


def _lock_relational_blocks(
    objects: List,
    locks: Dict[Tuple[str, ...], Dict[str, Tuple[float, float, float]]],
) -> None:
    """Ripristina le colonne relazionali già accettate in un candidato."""
    for member_ids, dimensions in locks.items():
        _force_relational_block(objects, member_ids, dimensions)
        objects[:] = _move_relational_block(objects, member_ids)


def _relational_block_rotatable(
    member_ids: Sequence[str],
    dimensions: Dict[str, Tuple[float, float, float]],
    objects: Sequence,
    constraints: Optional[dict],
) -> bool:
    """Controlla regole oggetto e configurazioni di ogni coppia della colonna."""
    by_id = {obj.id: obj for obj in objects}
    rotated = {
        member_id: (dims[1], dims[0], dims[2])
        for member_id, dims in dimensions.items()
    }
    for member_id in member_ids:
        obj = by_id.get(member_id)
        if obj is None or not (
            getattr(obj, "orientation_allowed", False)
            and getattr(obj, "rotazione_su_z", False)
        ):
            return False
    for below_id, above_id in zip(member_ids, member_ids[1:]):
        above = by_id[above_id]
        below = by_id[below_id]
        details, authorized = _constraint_details(
            constraints, above.oggetto_id, below.oggetto_id
        )
        if not authorized:
            continue
        if details is not None and (
            rotated[above_id], rotated[below_id]
        ) not in details:
            return False
    return True


def _relational_block_valid(
    solution: Sequence,
    member_ids: Sequence[str],
    constraints: Optional[dict],
) -> bool:
    """Conferma che la colonna ruotata sia ancora completa e verticale."""
    fitted = {obj.id: obj for obj in solution if getattr(obj, "z", -1) >= 0}
    members = [fitted.get(member_id) for member_id in member_ids]
    if any(obj is None for obj in members):
        return False
    for below, above in zip(members, members[1:]):
        if not _directly_above(above, below):
            return False
        # La trasformazione è solidale: una colonna baseline con la stessa
        # impronta XY deve restare una colonna, non diventare un semplice
        # contatto parziale tra due codici.
        if (
            abs(above.x - below.x) > 0.001
            or abs(above.y - below.y) > 0.001
        ):
            return False
        details, authorized = _constraint_details(
            constraints, above.oggetto_id, below.oggetto_id
        )
        if authorized and details is not None and (
            (above.width, above.depth, above.height),
            (below.width, below.depth, below.height),
        ) not in details:
            return False
    return True


def _force_group_orientation(
    objects: List,
    member_ids: Sequence[str],
    original_dims: Tuple[float, float, float],
    rotated_count: int,
) -> None:
    """Forza un numero esatto di istanze del gruppo in orientamento XY.

    Le copie candidate ricevono dimensioni e flag di rotazione bloccati:
    ``orientation_allowed`` resta attivo per consentire lo stacking, mentre
    i tre flag di rotazione vengono disattivati. Così il confronto misura
    davvero ``k`` oggetti ruotati senza impedire i vincoli di appoggio.
    """
    by_id = {obj.id: obj for obj in objects}
    original_w, original_d, original_h = original_dims
    for index, member_id in enumerate(member_ids):
        obj = by_id[member_id]
        if index < rotated_count:
            obj.width, obj.depth, obj.height = (
                original_d, original_w, original_h
            )
        else:
            obj.width, obj.depth, obj.height = original_dims
        obj.rotazione_su_x = False
        obj.rotazione_su_y = False
        obj.rotazione_su_z = False


def _move_group_contiguous(objects: List, member_ids: Sequence[str]) -> List:
    """Rende contigue le istanze del blocco mantenendo il resto dell'ordine."""
    member_set = set(member_ids)
    selected = [obj for obj in objects if obj.id in member_set]
    if not selected:
        return list(objects)
    first_index = min(
        index for index, obj in enumerate(objects) if obj.id in member_set
    )
    remainder = [obj for obj in objects if obj.id not in member_set]
    # L'indice è calcolato sul flusso originale; la correzione evita di
    # spostare il blocco oltre oggetti che lo precedevano.
    before_count = sum(
        1 for obj in objects[:first_index] if obj.id not in member_set
    )
    return (
        remainder[:before_count]
        + selected
        + remainder[before_count:]
    )


def _lock_groups(
    objects: List,
    locks: Dict[Tuple[str, ...], Tuple[float, float, float, int]],
) -> None:
    """Applica le configurazioni già accettate ai gruppi precedenti."""
    for member_ids, (width, depth, height, rotated_count) in locks.items():
        _force_group_orientation(
            objects,
            member_ids,
            (width, depth, height),
            rotated_count,
        )
        # La contiguità dell'ordine è parte della variante: va ripristinata
        # anche quando si valuta un gruppo successivo.
        reordered = _move_group_contiguous(objects, member_ids)
        objects[:] = reordered


def _has_spatial_block(
    solution: Sequence,
    member_ids: Sequence[str],
    rotated_count: int,
) -> bool:
    """Verifica che le istanze selezionate siano state davvero ruotate.

    Il packer può dover intercalare il gruppo con altre colonne per rispettare
    appoggio, vincoli e spazio residuo: imporre una griglia matematica sulle
    coordinate finali scarterebbe quindi configurazioni valide, anche quando
    il gruppo è contiguo nell'ordine di ricerca. La geometria finale resta
    comunque verificata dal packer; qui controlliamo che tutte le istanze del
    sottoinsieme siano presenti, abbiano la stessa orientazione e occupino
    celle distinte. La compattezza viene poi valutata dallo score globale.
    """
    fitted = {
        obj.id: obj for obj in solution if getattr(obj, "z", -1) >= 0
    }
    selected = [
        fitted.get(member_id)
        for member_id in member_ids[:rotated_count]
    ]
    if len(selected) != rotated_count or any(obj is None for obj in selected):
        return False
    dimensions = {
        (obj.width, obj.depth, obj.height)
        for obj in selected
    }
    if len(dimensions) != 1:
        return False
    cells = {
        (round(obj.x, 6), round(obj.y, 6), round(obj.z, 6))
        for obj in selected
    }
    return len(cells) == rotated_count


def _copy_solution_state(solution: Sequence, originals: Sequence) -> None:
    """Mantiene il contratto in-place storico del packer deterministico."""
    original_by_id = {obj.id: obj for obj in originals}
    for result in solution:
        target = original_by_id.get(result.id)
        if target is None:
            continue
        target.x, target.y, target.z = result.x, result.y, result.z
        target.width, target.depth, target.height = (
            result.width,
            result.depth,
            result.height,
        )
        for attr in ("_peso_sopra_kg", "support_ratio"):
            if hasattr(result, attr):
                setattr(target, attr, getattr(result, attr))


def _self_constraints_valid(solution: Sequence, constraints: Optional[dict]) -> bool:
    """Valida le relazioni auto-referenziali ``A sopra A`` del candidato.

    ``valida_vincoli_sopra`` mantiene la compatibilità storica e ignora le
    auto-relazioni. Il group optimizer deve invece controllarle esplicitamente
    prima di accettare una variante: il gruppo può ruotare, ma non può
    cancellare una coppia omogenea già richiesta o introdurre una coppia
    esplicitamente esclusa.
    """
    fitted = [obj for obj in solution if getattr(obj, "z", -1) >= 0]

    def _directly_above(above, below):
        return (
            above is not below
            and above.oggetto_id == below.oggetto_id
            and above.z > 0
            and abs(above.z - (below.z + below.height)) <= 0.001
            and above.x < below.x + below.width
            and above.x + above.width > below.x
            and above.y < below.y + below.depth
            and above.y + above.depth > below.y
        )

    for object_id, bases in (constraints or {}).items():
        if not isinstance(bases, dict) or object_id not in bases:
            continue
        details = bases[object_id]
        pairs = [
            (above, below)
            for above in fitted
            for below in fitted
            if _directly_above(above, below)
        ]
        if isinstance(details, set) and not details:
            if pairs:
                return False
            continue
        if details is None:
            if not pairs:
                return False
            continue
        if not any(
            ((above.width, above.depth, above.height),
             (below.width, below.depth, below.height)) in details
            for above, below in pairs
        ):
            return False
    return True


def _compactness_key(solution: Sequence) -> Tuple[float, int, int, int]:
    """Calcola una misura CPU-leggera della regolarità geometrica.

    La misura è volutamente locale al deterministico: non cambia il criterio
    usato da Monte Carlo o v3. Per ogni piano ``(X, Z)`` considera gli
    intervalli occupati su Y e somma i vuoti interni tra intervalli adiacenti.
    A parità di vuoti, penalizza le fasce Y e le orientazioni differenti.

    Restituisce valori da minimizzare:
    ``(vuoti_y, frammentazione_y, orientamenti, fasce_y)``.
    """
    fitted = [obj for obj in solution if getattr(obj, "z", -1) >= 0]
    if not fitted:
        return (0, 0, 0, 0)

    # Gli oggetti con la stessa X e Z condividono una sezione del carico.
    # L'arrotondamento evita che piccoli errori floating creino fasce fantasma.
    sezioni = {}
    for obj in fitted:
        key = (round(obj.x, 3), round(obj.z, 3))
        sezioni.setdefault(key, []).append(
            (round(obj.y, 3), round(obj.y + obj.depth, 3))
        )

    vuoti_y = 0
    frammentazione_y = 0
    for intervalli in sezioni.values():
        intervalli.sort()
        ultimo_fine = None
        for inizio, fine in intervalli:
            if ultimo_fine is not None:
                if inizio > ultimo_fine:
                    vuoti_y += round(inizio - ultimo_fine, 3)
                    frammentazione_y += 1
                ultimo_fine = max(ultimo_fine, fine)
            else:
                ultimo_fine = fine

    # La varietà va misurata per codice: una rotazione parziale degli I05
    # non deve essere nascosta dal fatto che I01/I02/I03 hanno già altre
    # orientazioni legittime. Una griglia 2x2 tutta ruotata resta uniforme e
    # quindi non viene penalizzata.
    orientamenti = 0
    for oggetto_id in {getattr(obj, "oggetto_id", None) for obj in fitted}:
        dimensioni_codice = {
            (
                round(obj.width, 3),
                round(obj.depth, 3),
                round(obj.height, 3),
            )
            for obj in fitted
            if getattr(obj, "oggetto_id", None) == oggetto_id
        }
        orientamenti += max(0, len(dimensioni_codice) - 1)

    # Coordinate Y multiple non sono un difetto in sé: possono rappresentare
    # righe perfettamente contigue. Conserviamo il dato solo diagnostico;
    # l'accettazione usa i vuoti reali e le orientazioni miste.
    fasce_y = len({round(obj.y, 3) for obj in fitted})
    return (vuoti_y, frammentazione_y, orientamenti, fasce_y)


def _score(solution, container_dim, all_objects):
    fitted, _ = filter_unfitted(solution)
    base = score_soluzione(
        fitted,
        container_h=container_dim[2] if container_dim else None,
        all_objects=all_objects,
    )
    # Il conteggio degli oggetti resta nella parte iniziale di ``base``.
    # I vuoti reali e la frammentazione entrano prima di X. Il numero grezzo
    # di fasce Y invece non è penalizzato: due righe Y contigue possono essere
    # proprio la soluzione che compatta il carico (caso 2x2). Le orientazioni
    # miste per lo stesso codice restano invece un criterio di regolarità
    # prima di X.
    priority_vector, fitted_count, _old_max_x, _old_singles = base
    vuoti_y, frammentazione_y, orientamenti, _fasce_y = _compactness_key(fitted)
    max_x = max((obj.x + obj.width for obj in fitted), default=0)
    return (
        priority_vector,
        fitted_count,
        -vuoti_y,
        -frammentazione_y,
        -orientamenti,
        -max_x,
        _old_singles,
    )


def optimize_deterministic_groups(
    objects: Sequence,
    constraints: Optional[dict],
    container_dim: tuple,
    tracker=None,
    compattazione_aggressiva: bool = False,
) -> List:
    """Esegue il 3D deterministico e valuta blocchi ruotati promettenti.

    La soluzione base viene sempre calcolata. Per ogni gruppo candidato si
    provano al massimo due conteggi di rotazione, uno alla volta, mantenendo
    la variante solo se migliora lo score completo. Ogni tentativo parte da
    copie nuove, quindi un tentativo fallito non può contaminare il successivo.
    """
    source = copy.deepcopy(list(objects))
    base_tracker = _clone_tracker(tracker)
    baseline_objects = copy.deepcopy(source)
    best_solution = load_truck_v2(
        baseline_objects,
        vincoli_sopra=constraints,
        container_dim=container_dim,
        tracker=base_tracker,
        compattazione_aggressiva=compattazione_aggressiva,
    )
    best_score = _score(best_solution, container_dim, source)
    best_tracker = base_tracker
    accepted_locks: Dict[Tuple[str, ...], Tuple[float, float, float, int]] = {}
    accepted_relational_locks: Dict[
        Tuple[str, ...], Dict[str, Tuple[float, float, float]]
    ] = {}
    trials = 0

    # Prima dei gruppi omogenei valuta le colonne che contengono una
    # relazione cross autorizzata. La colonna viene ruotata come un unico
    # blocco: nessun membro A può quindi separarsi dalla base B.
    relational_blocks = _relational_blocks(baseline_objects, constraints)
    for member_ids, dimensions in relational_blocks:
        if trials >= MAX_GROUP_TRIALS:
            break
        if not _relational_block_rotatable(
            member_ids,
            dimensions,
            source,
            constraints,
        ):
            continue

        trials += 1
        candidate_objects = copy.deepcopy(source)
        _lock_relational_blocks(candidate_objects, accepted_relational_locks)
        _lock_groups(candidate_objects, accepted_locks)
        _force_relational_block(candidate_objects, member_ids, dimensions)
        candidate_objects = _move_relational_block(
            candidate_objects,
            member_ids,
        )
        candidate_tracker = _clone_tracker(tracker)
        candidate_solution = load_truck_v2(
            candidate_objects,
            vincoli_sopra=constraints,
            container_dim=container_dim,
            tracker=candidate_tracker,
            preserve_order=True,
            compattazione_aggressiva=compattazione_aggressiva,
        )
        fitted_candidate, _ = filter_unfitted(candidate_solution)
        constraint_report = valida_vincoli_sopra(
            candidate_objects,
            fitted_candidate,
            constraints,
        )
        if (
            not _relational_block_valid(
                candidate_solution,
                member_ids,
                constraints,
            )
            or not constraint_report.get("vincoli_completi", True)
            or not _self_constraints_valid(candidate_solution, constraints)
        ):
            continue
        candidate_score = _score(
            candidate_solution,
            container_dim,
            candidate_objects,
        )
        if candidate_score > best_score:
            best_solution = candidate_solution
            best_score = candidate_score
            best_tracker = candidate_tracker
            accepted_relational_locks[member_ids] = dimensions

    # Preseleziona i gruppi con il maggior risparmio X teorico. La stima è
    # solo un filtro CPU: la scelta finale resta affidata allo score reale.
    eligible_groups = []
    for group_key, members in _groups(source):
        if len(members) < 2 or _group_is_relational(group_key, constraints):
            continue
        sample = members[0]
        if not (
            getattr(sample, "orientation_allowed", False)
            and getattr(sample, "rotazione_su_z", False)
        ):
            continue
        counts = candidate_rotation_counts(
            len(members), sample.width, sample.depth, container_dim
        )
        if not counts:
            continue
        rows_original = int(container_dim[1] // sample.depth)
        rows_rotated = int(container_dim[1] // sample.width)
        original_layers = (len(members) + rows_original - 1) // rows_original
        rotated_layers = (len(members) + rows_rotated - 1) // rows_rotated
        estimated_saving = (
            original_layers * sample.width - rotated_layers * sample.depth
        )
        eligible_groups.append(
            (estimated_saving, group_key, members, counts)
        )

    eligible_groups.sort(key=lambda item: item[0], reverse=True)

    # L'ordine dei gruppi è stabile dopo la preselezione. Il limite globale
    # impedisce che un carico con molti codici trasformi il deterministico in
    # una ricerca combinatoria.
    for _, group_key, members, counts in eligible_groups:
        sample = members[0]
        original_dims = (sample.width, sample.depth, sample.height)
        member_ids = tuple(obj.id for obj in members)

        for rotated_count in counts:
            if trials >= MAX_GROUP_TRIALS:
                break
            trials += 1
            candidate_objects = copy.deepcopy(source)
            _lock_relational_blocks(candidate_objects, accepted_relational_locks)
            _lock_groups(candidate_objects, accepted_locks)
            _force_group_orientation(
                candidate_objects,
                member_ids,
                original_dims,
                rotated_count,
            )
            candidate_objects = _move_group_contiguous(
                candidate_objects,
                member_ids,
            )
            candidate_tracker = _clone_tracker(tracker)
            candidate_solution = load_truck_v2(
                candidate_objects,
                vincoli_sopra=constraints,
                container_dim=container_dim,
                tracker=candidate_tracker,
                preserve_order=True,
                compattazione_aggressiva=compattazione_aggressiva,
            )
            if not _has_spatial_block(
                candidate_solution,
                member_ids,
                rotated_count,
            ):
                continue
            fitted_candidate, _ = filter_unfitted(candidate_solution)
            constraint_report = valida_vincoli_sopra(
                candidate_objects,
                fitted_candidate,
                constraints,
            )
            if not constraint_report.get("vincoli_completi", True):
                continue
            if not _self_constraints_valid(candidate_solution, constraints):
                continue
            candidate_score = _score(
                candidate_solution, container_dim, candidate_objects
            )
            if candidate_score > best_score:
                best_solution = candidate_solution
                best_score = candidate_score
                best_tracker = candidate_tracker
                accepted_locks[member_ids] = (
                    original_dims[0],
                    original_dims[1],
                    original_dims[2],
                    rotated_count,
                )

    _restore_tracker(tracker, best_tracker)
    _copy_solution_state(best_solution, objects)
    return best_solution


__all__ = [
    "candidate_rotation_counts",
    "optimize_deterministic_groups",
]
