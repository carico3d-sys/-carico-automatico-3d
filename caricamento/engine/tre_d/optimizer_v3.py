"""
Optimizer v3 — Backtracking locale basato su rilevazione buchi 3D.

Strategia:
1. Raggruppa gli oggetti per tipo (codice)
2. Esegue load_truck_v2 con ordini diversi (coda davanti, mescola testa/coda)
3. Dopo ogni load_truck_v2, rileva BUCHI 3D e genera nuove strategie mirate:
   - "Chi ha creato il buco? Sposto quel tipo di oggetto in testa!"
4. Confronto >= : soluzioni equivalenti vengono tenute

File separato per facilità di manutenzione/rimozione.
"""

import copy
import itertools
import random
import time
from typing import Dict, List, Optional, Tuple

from .constants import EARLY_STOP_STALL
from .group_optimizer import optimize_deterministic_groups
from .packer_3d_v2 import (
    Obj,
    filter_unfitted,
    load_truck_v2,
    _prova_tutte_orientazioni,
    _coordinate_stacking_aggressivo,
    _orientamenti_xy,
    _valuta_compattezza_locale,
)
from .priority_policy import priorita_effettive, priorita_esplicita, score_soluzione


# ============================
# RAGGRUPPAMENTO PER TIPO
# ============================

def _estrai_tipo(obj: Obj) -> str:
    """Estrae il tipo (codice) dall'id dell'oggetto."""
    return obj.id.rsplit('-', 1)[0] if '-' in obj.id else obj.id


def _raggruppa_per_tipo(objects: List[Obj]) -> Dict[str, List[Obj]]:
    """Raggruppa gli oggetti per tipo (codice), preservando l'ordine interno."""
    gruppi: Dict[str, List[Obj]] = {}
    for o in objects:
        tipo = _estrai_tipo(o)
        gruppi.setdefault(tipo, []).append(o)
    return gruppi


# ============================
# STRATEGIE DI RIORDINAMENTO
# ============================

def _tipi_a_x_max_ordinati(placed: List[Obj]) -> List[str]:
    """Restituisce i tipi ordinati per X max decrescente nella soluzione."""
    tipi_x: Dict[str, float] = {}
    for o in placed:
        tipo = _estrai_tipo(o)
        x_end = o.x + o.width
        if tipo not in tipi_x or x_end > tipi_x[tipo]:
            tipi_x[tipo] = x_end
    return sorted(tipi_x.keys(), key=lambda t: tipi_x[t], reverse=True)


def _coda_davanti(objects: List[Obj], tipo_da_spostare: Optional[str]) -> List[Obj]:
    """Sposta un tipo in testa solo alla sua fase di priorità.

    Le strategie di backtracking possono cambiare l'ordine dei codici, ma non
    possono attraversare le fasi esplicite: un codice con priorità 0 non può
    essere portato davanti a uno con priorità 1. Il riordino è quindi locale
    alla fase del tipo selezionato.
    """
    if tipo_da_spostare is None:
        return list(objects)

    target = next(
        (obj for obj in objects if _estrai_tipo(obj) == tipo_da_spostare),
        None,
    )
    if target is None:
        return list(objects)

    target_phase = priorita_esplicita(target)
    phases: Dict[int, List[Obj]] = {}
    phase_order: List[int] = []
    for obj in objects:
        phase = priorita_esplicita(obj)
        if phase not in phases:
            phases[phase] = []
            phase_order.append(phase)
        phases[phase].append(obj)

    result: List[Obj] = []
    for phase in phase_order:
        group = phases[phase]
        if phase == target_phase:
            target_group = [
                obj for obj in group
                if _estrai_tipo(obj) == tipo_da_spostare
            ]
            other_group = [
                obj for obj in group
                if _estrai_tipo(obj) != tipo_da_spostare
            ]
            result.extend(target_group + other_group)
        else:
            result.extend(group)
    return result


def _shuffle_blocchi(objects: List[Obj], vincoli_sopra=None) -> List[Obj]:
    """Shuffla i blocchi solo dentro la stessa fase di priorità."""
    effective = priorita_effettive(objects)
    gruppi_fase: Dict[object, Dict[str, List[Obj]]] = {}
    for obj in objects:
        fase = effective.get(obj.oggetto_id, priorita_esplicita(obj))
        gruppi_fase.setdefault(fase, {}).setdefault(_estrai_tipo(obj), []).append(obj)

    risultato: List[Obj] = []
    for fase in sorted(gruppi_fase, key=lambda value: (value == 0, value or 999)):
        tipi = list(gruppi_fase[fase])
        random.shuffle(tipi)
        for tipo in tipi:
            risultato.extend(gruppi_fase[fase][tipo])
    return risultato


def _mescola_testa_coda(
    objects: List[Obj], take: int = 3, vincoli_sopra=None
) -> List[Obj]:
    """Mescola testa/coda senza attraversare fasi di priorità."""
    effective = priorita_effettive(objects)
    gruppi_fase: Dict[object, Dict[str, List[Obj]]] = {}
    for obj in objects:
        fase = effective.get(obj.oggetto_id, priorita_esplicita(obj))
        gruppi_fase.setdefault(fase, {}).setdefault(_estrai_tipo(obj), []).append(obj)

    risultato: List[Obj] = []
    for fase in sorted(gruppi_fase, key=lambda value: (value == 0, value or 999)):
        gruppi = gruppi_fase[fase]
        teste_pool: List[Obj] = []
        code_pool: List[Obj] = []
        centrali: Dict[str, List[Obj]] = {}
        piccoli: Dict[str, List[Obj]] = {}
        for tipo, blocco in gruppi.items():
            if len(blocco) >= take * 3:
                teste_pool.extend(blocco[:take])
                code_pool.extend(blocco[-take:])
                centrali[tipo] = blocco[take:-take]
            else:
                piccoli[tipo] = blocco

        random.shuffle(teste_pool)
        random.shuffle(code_pool)
        risultato.extend(teste_pool)
        for tipo in gruppi:
            risultato.extend(centrali.get(tipo, []))
        risultato.extend(code_pool)
        for tipo in gruppi:
            risultato.extend(piccoli.get(tipo, []))
    return risultato


# ============================
# RILEVAZIONE BUCHI 3D
# ============================

def _trova_buchi_verticali(placed: List[Obj], container_dim: tuple) -> List[dict]:
    """Trova gap verticali in Z all'interno di ogni colonna (x,y).

    Una colonna e' definita dalla coppia (x, y). Se in quella colonna
    ci sono gap tra un oggetto e il successivo in Z, quello e' un buco.

    Returns:
        Lista di buchi, ognuno con {x, y, z, w, d, h}.
    """
    cw, cd, ch = container_dim
    buchi: List[dict] = []

    # Raggruppa oggetti per colonna (x, y)
    colonne: Dict[Tuple, List[Obj]] = {}
    for o in placed:
        key = (o.x, o.y)
        colonne.setdefault(key, []).append(o)

    for (x, y), items in colonne.items():
        items.sort(key=lambda o: o.z)
        z_cursor = 0.0
        w = items[0].width
        d = items[0].depth

        for o in items:
            if o.z > z_cursor + 0.5:  # gap significativo (> 0.5 cm)
                buchi.append({
                    'x': x, 'y': y, 'z': z_cursor,
                    'w': w, 'd': d, 'h': o.z - z_cursor,
                })
            z_cursor = max(z_cursor, o.z + o.height)

        # Gap sopra l'ultimo oggetto (fino al tetto del container)
        if z_cursor < ch - 0.5:
            buchi.append({
                'x': x, 'y': y, 'z': z_cursor,
                'w': w, 'd': d, 'h': ch - z_cursor,
            })

    return buchi


def _oggetti_vicini_al_buco(placed: List[Obj], buco: dict) -> List[Obj]:
    """Trova gli oggetti che delimitano un buco (sotto, sopra, ai lati)."""
    bx, by, bz = buco['x'], buco['y'], buco['z']
    bw, bd, bh = buco['w'], buco['d'], buco['h']
    vicini: List[Obj] = []

    for o in placed:
        # Sotto: il top dell'oggetto tocca il fondo del buco
        if abs((o.z + o.height) - bz) < 0.5:
            if o.x < bx + bw and o.x + o.width > bx and o.y < by + bd and o.y + o.depth > by:
                vicini.append(o)
                continue

        # Sopra: il bottom dell'oggetto tocca il tetto del buco
        if abs(o.z - (bz + bh)) < 0.5:
            if o.x < bx + bw and o.x + o.width > bx and o.y < by + bd and o.y + o.depth > by:
                vicini.append(o)
                continue

        # Lato destro/sinistro: oggetto adiacente in X, stessa Z
        if abs(o.z - bz) < 0.5:
            if abs(o.x + o.width - bx) < 0.5 or abs(o.x - (bx + bw)) < 0.5:
                if o.y < by + bd and o.y + o.depth > by:
                    vicini.append(o)
                    continue

    return vicini


def _strategie_da_buchi(placed: List[Obj], container_dim: tuple) -> List[tuple]:
    """Genera strategie 'coda davanti' basate sui buchi trovati.

    Per ogni buco significativo, trova i tipi di oggetti adiacenti
    e genera strategie per spostare quei tipi in testa all'ordine.
    Questo e' un backtracking locale: "chi ha creato il buco? Mettilo prima!"
    """
    buchi = _trova_buchi_verticali(placed, container_dim)
    if not buchi:
        return []

    # Ordina per volume decrescente (i buchi piu' grandi sono piu' importanti)
    buchi.sort(key=lambda b: b['w'] * b['d'] * b['h'], reverse=True)

    strategie: List[tuple] = []
    tipi_gia_aggiunti: set = set()

    for buco in buchi[:5]:  # max 5 buchi
        vicini = _oggetti_vicini_al_buco(placed, buco)
        for v in vicini:
            tipo = _estrai_tipo(v)
            if tipo not in tipi_gia_aggiunti:
                tipi_gia_aggiunti.add(tipo)
                strategie.append(('coda', tipo))
            if len(strategie) >= 3:  # max 3 strategie da buchi
                return strategie

    return strategie


# ============================
# METRICHE SOLUZIONE
# ============================

def _valuta_soluzione(
    solution: List[Obj],
    container_dim: Optional[tuple] = None,
    all_objects: Optional[List[Obj]] = None,
) -> tuple:
    """Valuta una soluzione: priorità, oggetti, X massimo, singoli interni.

    A parità di oggetti caricati, la lunghezza X è prioritaria: il carico deve
    completare Y/Z prima di aprire una nuova fascia longitudinale. I singoli
    interni restano uno spareggio secondario e mantengono la stessa
    definizione usata dal deferral del packer principale.
    """
    placed, _ = filter_unfitted(solution)
    if not placed:
        return (0, 0, 0, float('-inf'))
    container_h = container_dim[2] if container_dim else None
    return score_soluzione(
        placed, container_h, all_objects=all_objects or placed
    )


# ============================
# BACKTRACKING RICORSIVO PER OGGETTO
# ============================

def _prova_a_piazzare_ovunque(
    obj: Obj, placed: List[Obj], container_dim: tuple,
    vincoli_sopra: dict, compattazione_aggressiva: bool = False,
    deadline: Optional[float] = None,
) -> bool:
    """Prova a piazzare obj in TUTTE le posizioni candidate (pavimento, colonne)."""
    cw, cd, ch = container_dim

    # Posizioni X candidate
    x_candidates = sorted(set([0] + [o.x + o.width for o in placed]))
    x_candidates = [x for x in x_candidates if cw is None or x + obj.width <= cw]

    for try_x in x_candidates:
        if deadline is not None and time.monotonic() >= deadline:
            return False
        # Posizioni Y candidate a questo X
        y_candidates = sorted(set([0] + [
            o.y + o.depth for o in placed
            if o.x < try_x + obj.width and o.x + o.width > try_x
        ]))
        y_candidates = [y for y in y_candidates if cd is None or y + obj.depth <= cd]

        for try_y in y_candidates:
            if _prova_tutte_orientazioni(
                obj, try_x, try_y, 0,
                placed, container_dim, vincoli_sopra,
                compattazione_aggressiva=compattazione_aggressiva,
            ):
                return True

    # Prova in cima alle colonne. In aggressiva, prova anche gli
    # allineamenti traslati attorno alla base, usando la stessa regola del
    # percorso principale v2.
    for base in placed:
        if deadline is not None and time.monotonic() >= deadline:
            return False
        z_top = base.z + base.height
        if ch is not None and z_top + obj.height > ch:
            continue
        stack_positions = [(base.x, base.y)]
        if compattazione_aggressiva and obj.oggetto_id in vincoli_sopra:
            stack_positions.extend(
                _coordinate_stacking_aggressivo(
                    base, obj, placed, container_dim,
                    orientamenti=_orientamenti_xy(obj),
                )
            )
        for stack_x, stack_y in dict.fromkeys(stack_positions):
            if _prova_tutte_orientazioni(
                obj, stack_x, stack_y, z_top,
                placed, container_dim, vincoli_sopra,
                compattazione_aggressiva=compattazione_aggressiva,
            ):
                return True

    return False


def _backtracking_ricorsivo(
    placed: List[Obj], all_objects: List[Obj], container_dim: tuple,
    vincoli_sopra: dict, depth: int = 0, max_depth: int = 2,
    compattazione_aggressiva: bool = False,
    deadline: Optional[float] = None,
) -> List[Obj]:
    """Backtracking ricorsivo con deferimento simulato.

    Simula il deferimento durante il piazzamento:
    1. Trova un buco sopra un oggetto (il "colpevole")
    2. Rimuovi il colpevole (lo "metti da parte")
    3. Sostituiscilo con oggetti piazzati più avanti:
       - Priorità 1: stesso tipo (es. altro CART-I02 da X maggiore)
       - Priorità 2: altri tipi (es. I03, i05)
       - Priorità 3: unfitted (ultima risorsa)
    4. Ri-piazza il colpevole rimosso più avanti (in fondo)
    5. Ricorsione: se ancora buchi, ripeti

    Args:
        depth: profondità corrente
        max_depth: massima profondità ricorsiva
    """
    if depth >= max_depth:
        return placed

    if deadline is not None and time.monotonic() >= deadline:
        return placed

    buchi = _trova_buchi_verticali(placed, container_dim)
    if not buchi:
        return placed

    buchi.sort(key=lambda b: b['w'] * b['d'] * b['h'], reverse=True)

    placed_ids = {o.id for o in placed}
    unfitted = [o for o in all_objects if o.id not in placed_ids]
    unfitted_ids = {o.id for o in unfitted}  # set per lookup O(1)

    best_placed = list(placed)
    best_score = _valuta_soluzione(
        best_placed, container_dim, all_objects=all_objects
    )

    for buco in buchi[:2]:  # esplora fino a 2 buchi
        if deadline is not None and time.monotonic() >= deadline:
            break
        # Trova l'oggetto SOTTO il buco (il "colpevole")
        colpevole = None
        for o in best_placed:
            if abs((o.z + o.height) - buco['z']) < 0.5:
                if abs(o.x - buco['x']) < 0.5 and abs(o.y - buco['y']) < 0.5:
                    colpevole = o
                    break

        if colpevole is None:
            continue

        tipo_colpevole = _estrai_tipo(colpevole)
        resto = [o for o in best_placed if o.id != colpevole.id]
        # Il backtracking confronta la priorità originale del piano. Una
        # base coinvolta in un vincolo non viene promossa tecnicamente.
        effective_priorities = priorita_effettive(all_objects)
        priorita_colpevole = effective_priorities.get(
            colpevole.oggetto_id, priorita_esplicita(colpevole)
        )

        # PRIORITÀ CANDIDATI SOSTITUTI (simula deferimento)
        # 1. Stesso tipo, piazzato più avanti (X > colpevole.x)
        cand_stesso_tipo = [
            o for o in resto
            if o.x > colpevole.x and _estrai_tipo(o) == tipo_colpevole
        ]
        # 2. Altri tipi, piazzati più avanti
        cand_altro_tipo = [
            o for o in resto
            if o.x > colpevole.x and _estrai_tipo(o) != tipo_colpevole
        ]
        # 3. Unfitted come ultima risorsa
        candidati = []
        for cand in cand_stesso_tipo[:2] + cand_altro_tipo[:2] + unfitted[:1]:
            priorita_cand = effective_priorities.get(
                cand.oggetto_id, priorita_esplicita(cand)
            )
            # Un backtracking non può far retrocedere un prioritario dietro
            # a un oggetto non prioritario. Per un colpevole prioritario,
            # quindi, il sostituto deve appartenere a una fase prioritaria
            # non più bassa; per un colpevole non prioritario resta ammesso
            # solo un altro oggetto della fase 0.
            if priorita_colpevole > 0:
                ammesso = 0 < priorita_cand <= priorita_colpevole
            else:
                ammesso = priorita_cand == 0
            if ammesso:
                candidati.append(cand)

        for cand in candidati:
            if deadline is not None and time.monotonic() >= deadline:
                break
            is_unfitted = cand.id in unfitted_ids
            # Rimuovi il candidato dalla sua posizione corrente (se piazzato)
            test_resto = (
                [o for o in resto if o.id != cand.id]
                if not is_unfitted else list(resto)
            )

            sostituto = copy.deepcopy(cand)
            sostituto.x, sostituto.y, sostituto.z = 0, 0, 0

            # Prova a piazzare il sostituto dove era il colpevole
            if _prova_tutte_orientazioni(
                sostituto, colpevole.x, colpevole.y, colpevole.z,
                test_resto, container_dim, vincoli_sopra,
                compattazione_aggressiva=compattazione_aggressiva,
            ):
                test_placed = test_resto + [sostituto]

                # Prova a ri-piazzare il colpevole più avanti (in fondo)
                rimosso = copy.deepcopy(colpevole)
                rimosso.x, rimosso.y, rimosso.z = 0, 0, 0
                if _prova_a_piazzare_ovunque(
                    rimosso, test_placed, container_dim, vincoli_sopra,
                    compattazione_aggressiva=compattazione_aggressiva,
                    deadline=deadline,
                ):
                    test_placed.append(rimosso)

                # RICORSIONE: cerca altri buchi
                test_placed = _backtracking_ricorsivo(
                    test_placed, all_objects, container_dim, vincoli_sopra,
                    depth + 1, max_depth,
                    compattazione_aggressiva=compattazione_aggressiva,
                    deadline=deadline,
                )

                score = _valuta_soluzione(
                    test_placed, container_dim, all_objects=all_objects
                )
                if score > best_score:
                    best_placed = test_placed
                    best_score = score

    return best_placed


# ============================
# OPTIMIZE SOLUTION v3
# ============================

def optimize_solution_v3(
    objects: List[Obj],
    vincoli_sopra: Optional[Dict] = None,
    iterations: int = 7,
    container_dim: Optional[tuple] = None,
    tracker=None,
    compattazione_aggressiva: bool = False,
    random_mode: bool = False,
    deadline: Optional[float] = None,
    telemetria: Optional[dict] = None,
    stall_limit: int = EARLY_STOP_STALL,
) -> List[Obj]:
    """Backtracking a blocchi con rilevazione buchi 3D.

    Args:
        random_mode: se True, usa SOLO strategie random (shuffle, mescola).
                     Ogni seed produce un risultato diverso.
    """
    if vincoli_sopra is None:
        vincoli_sopra = {}

    if telemetria is not None:
        telemetria["passate_max"] = 1 + max(0, int(iterations))
        telemetria["passate_eseguite"] = 0
        telemetria.setdefault("tempo_per_passata_s", [])
        telemetria["motivo_stop"] = "max_tentativi"

    def _fresh_tracker():
        if tracker is not None:
            from ..sezione_weight_tracker import SezioneWeightTracker
            return SezioneWeightTracker(tracker.sezioni)
        return None

    # Iterazione 0: baseline deterministico con blocchi ruotati (group
    # optimizer). È ciò che satura al massimo i carichi omogenei (es. un solo
    # tipo con rotazione): MC/V3 partono da qui e provano a migliorare lo
    # score solo se il tempo lo consente.
    t0 = time.monotonic()
    original_objects = copy.deepcopy(objects)
    best_solution = optimize_deterministic_groups(
        original_objects,
        constraints=vincoli_sopra,
        container_dim=container_dim,
        tracker=_fresh_tracker(),
        compattazione_aggressiva=compattazione_aggressiva,
        deadline=deadline,
    )
    if telemetria is not None:
        telemetria["passate_eseguite"] += 1
        telemetria["tempo_per_passata_s"].append(round(time.monotonic() - t0, 3))

    # Early-stop: la passata base (group optimizer) ha già piazzato tutti gli
    # oggetti. Il punteggio è già massimo e né il backtracking ricorsivo né le
    # iterazioni successive possono aggiungere istanze: saltarli evita di
    # bruciare l'intero budget (90s nell'asincrono) su lavoro inutile, che è
    # ciò che faceva sembrare "piantato" Ottimizza e Salva rispetto a Elabora.
    best_placed, _ = filter_unfitted(best_solution)
    if len(best_placed) >= len(objects):
        if telemetria is not None:
            telemetria["motivo_stop"] = "soluzione_completa"
        return best_solution

    # Backtracking ricorsivo sulla soluzione base (solo se ancora incompleta)
    if container_dim and not random_mode:
        best_solution = _backtracking_ricorsivo(
            best_solution, original_objects, container_dim, vincoli_sopra,
            compattazione_aggressiva=compattazione_aggressiva,
            deadline=deadline,
        )

    best_score = _valuta_soluzione(
        best_solution, container_dim, all_objects=objects
    )
    best_placed, _ = filter_unfitted(best_solution)

    strategie: List[tuple] = []

    if random_mode:
        # SOLO strategie random: ogni run esplora ordini diversi
        for _ in range(iterations):
            strategie.append(('shuffle', None))
    else:
        # Strategie deterministiche + random come fallback
        tipi_xmax = _tipi_a_x_max_ordinati(best_placed)
        if len(tipi_xmax) >= 2:
            strategie.append(('coda', tipi_xmax[0]))
        if container_dim:
            strategie_da_buchi = _strategie_da_buchi(best_placed, container_dim)
            strategie.extend(strategie_da_buchi)
        take_values = [3, 2]
        for tv in take_values:
            strategie.append(('mescola', tv))
        strategie.append(('shuffle', None))
        strategie.append(('shuffle', None))

    strategie = strategie[:iterations]

    stall_count = 0
    motivo_stop = "max_tentativi"

    for strategia, arg in strategie:
        # Time-budget: interrompe l'esplorazione quando la scadenza è stata
        # superata, conservando la migliore soluzione trovata finora.
        if deadline is not None and time.monotonic() >= deadline:
            motivo_stop = "deadline"
            break

        t_iter = time.monotonic()
        fresh_objects = copy.deepcopy(objects)

        if strategia == 'coda':
            candidate = _coda_davanti(fresh_objects, arg)
        elif strategia == 'mescola':
            candidate = _mescola_testa_coda(
                fresh_objects, take=arg, vincoli_sopra=vincoli_sopra
            )
        elif strategia == 'shuffle':
            candidate = _shuffle_blocchi(fresh_objects, vincoli_sopra)
        else:
            continue

        new_solution = load_truck_v2(
            candidate, vincoli_sopra,
            container_dim=container_dim, tracker=_fresh_tracker(),
            preserve_order=True,
            compattazione_aggressiva=compattazione_aggressiva,
            deadline=deadline,
        )

        # VERO BACKTRACKING RICORSIVO
        if container_dim and not random_mode:
            new_solution = _backtracking_ricorsivo(
                new_solution, candidate, container_dim, vincoli_sopra,
                compattazione_aggressiva=compattazione_aggressiva,
                deadline=deadline,
            )

        if telemetria is not None:
            telemetria["passate_eseguite"] += 1
            telemetria["tempo_per_passata_s"].append(
                round(time.monotonic() - t_iter, 3)
            )

        new_score = _valuta_soluzione(
            new_solution, container_dim, all_objects=objects
        )

        if new_score > best_score:
            best_solution = new_solution
            best_score = new_score
            stall_count = 0
        else:
            stall_count += 1

        best_placed, _ = filter_unfitted(best_solution)
        if len(best_placed) >= len(objects):
            motivo_stop = "soluzione_completa"
            break
        if stall_count >= max(1, int(stall_limit)):
            motivo_stop = "convergente"
            break

    # Backtracking ricorsivo finale
    if container_dim and not random_mode:
        if deadline is not None and time.monotonic() >= deadline:
            if telemetria is not None:
                telemetria["motivo_stop"] = motivo_stop
            return best_solution
        best_solution = _backtracking_ricorsivo(
            best_solution, list(objects), container_dim, vincoli_sopra,
            compattazione_aggressiva=compattazione_aggressiva,
            deadline=deadline,
        )
        # Il backtracking finale può aver mutato la soluzione scelta; il
        # confronto è già stato protetto dallo scoring lessicografico, quindi
        # non la sostituiamo con una soluzione peggiore senza rivalutazione.

    if telemetria is not None:
        telemetria["motivo_stop"] = motivo_stop

    return best_solution


# ============================
# ENTRY POINT
# ============================

def run_packing_v3(
    objects: List[Obj],
    vincoli_sopra: Optional[Dict] = None,
    iterations: int = 7,
    container_dim: Optional[tuple] = None,
    tracker=None,
    compattazione_aggressiva: bool = False,
    deadline: Optional[float] = None,
    telemetria: Optional[dict] = None,
) -> List[Obj]:
    """Entry point per optimizer v3 (singola esecuzione)."""
    return optimize_solution_v3(
        objects,
        vincoli_sopra=vincoli_sopra,
        iterations=iterations,
        container_dim=container_dim,
        tracker=tracker,
        compattazione_aggressiva=compattazione_aggressiva,
        deadline=deadline,
        telemetria=telemetria,
    )


def run_packing_v3_multiple(
    objects: List[Obj],
    vincoli_sopra: Optional[Dict] = None,
    num_restarts: int = 3,
    iterations: int = 5,
    container_dim: Optional[tuple] = None,
    tracker=None,
    compattazione_aggressiva: bool = False,
) -> List[Obj]:
    """Esegue v3 N volte con seed diversi, tenendo la soluzione migliore.

    Ogni restart usa un seed diverso per garantire sequenze random diverse
    nelle strategie 'mescola'. Utile combinato con ordinamento_casuale.
    """
    best_solution = None
    best_score = None

    for i in range(num_restarts):
        # Seed diverso per ogni restart
        random.seed(i * 7777 + hash(tuple(o.id for o in objects[:5])) % 100000)

        result = optimize_solution_v3(
            objects,
            vincoli_sopra=vincoli_sopra,
            iterations=iterations,
            container_dim=container_dim,
            tracker=tracker,
            compattazione_aggressiva=compattazione_aggressiva,
            random_mode=True,
        )
        score = _valuta_soluzione(
            result, container_dim, all_objects=objects
        )

        if score > best_score:
            best_solution = result
            best_score = score

    if best_solution is None:
        return optimize_solution_v3(
            objects, vincoli_sopra=vincoli_sopra,
            iterations=iterations, container_dim=container_dim,
            tracker=tracker, compattazione_aggressiva=compattazione_aggressiva,
            random_mode=True,
        )

    return best_solution
