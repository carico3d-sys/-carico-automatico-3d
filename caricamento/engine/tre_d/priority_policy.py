"""Politica comune per priorità, dipendenze e validazione del packing.

La priorità di carico è una regola lessicograficamente superiore alla
compattezza: prima si massimizzano gli oggetti con priorità esplicita, poi il
numero totale di oggetti, infine i criteri geometrici secondari.

I vincoli ``A sopra B`` descrivono esclusivamente una relazione geometrica.
Non modificano la priorità del piano e non promuovono automaticamente B nella
fase di A: un camion o una cassa deve prima caricare i codici prioritari,
indipendentemente dal contenitore selezionato.
"""

from __future__ import annotations

from typing import Dict, Iterable, List, Mapping, Optional, Sequence, Tuple



def normalizza_vincoli_sopra(vincoli_sopra: Optional[Mapping] = None) -> dict:
    """Uniforma il formato dei vincoli a ``{A: {B: dettagli}}``.

    I percorsi legacy possono ancora passare ``{A: {B1, B2}}``; in quel
    formato non esistono dettagli dimensionali, quindi ogni relazione vale
    con ``None`` come configurazione.
    """
    normalizzati = {}
    for a_id, bases in (vincoli_sopra or {}).items():
        if isinstance(bases, Mapping):
            normalizzati[a_id] = dict(bases)
        else:
            normalizzati[a_id] = {base_id: None for base_id in bases}
    return normalizzati



def priorita_esplicita(obj) -> int:
    """Restituisce la priorità inserita nella lista del piano."""
    try:
        return max(0, int(getattr(obj, "priorita", 0) or 0))
    except (TypeError, ValueError):
        return 0



def priorita_effettive(objects: Sequence, vincoli_sopra: Optional[Mapping] = None) -> Dict[int, int]:
    """Restituisce la priorità esplicita per ogni codice presente.

    Il nome resta per compatibilità con i percorsi random e v3, ma non esiste
    più una priorità tecnica derivata dai vincoli: ``A sopra B`` non promuove
    tutte le istanze di B e non può far passare B davanti ad A. La relazione
    viene verificata solamente dal motore geometrico e dal validatore finale.
    """
    ids = {getattr(obj, "oggetto_id", None) for obj in objects}
    return {
        obj_id: min(
            (
                priorita_esplicita(obj)
                for obj in objects
                if getattr(obj, "oggetto_id", None) == obj_id
                and priorita_esplicita(obj) > 0
            ),
            default=0,
        )
        for obj_id in ids
    }



def riordina_per_fasi(
    objects: List,
    vincoli_sopra: Optional[Mapping] = None,
    *,
    preserve_inner_order: bool = True,
) -> None:
    """Ordina in-place per fase, senza mai mescolare priorità diverse.

    Con ``preserve_inner_order=True`` l'ordine ricevuto viene mantenuto
    all'interno di ogni fase: è il comportamento usato da random e
    backtracking dopo che hanno scelto una variante. Con False si applicano
    anche i tie-breaker geometrici esistenti.
    """
    vincoli_sopra = normalizza_vincoli_sopra(vincoli_sopra)
    # La priorità effettiva coincide sempre con quella esplicita del piano.
    # ``vincoli_sopra`` viene usato sotto solo per il tie-breaker tra oggetti
    # della stessa fase, mai per cambiare fase a una base.
    effective = priorita_effettive(objects)

    dependencies = {
        dependent_id: set(bases.keys())
        for dependent_id, bases in vincoli_sopra.items()
    }

    def dependency_depth(obj_id, trail=None):
        """Restituisce la profondità: le basi vengono prima dei dipendenti."""
        trail = set() if trail is None else trail
        if obj_id in trail or obj_id not in dependencies:
            return 0
        trail.add(obj_id)
        return 1 + max(
            (dependency_depth(base_id, trail) for base_id in dependencies[obj_id]),
            default=0,
        )

    def phase_key(obj):
        obj_id = getattr(obj, "oggetto_id", None)
        p = effective.get(obj_id, priorita_esplicita(obj))
        # A parità di priorità, preparare prima le basi e poi gli oggetti
        # dipendenti. Questo tie-breaker non può superare una priorità
        # esplicita diversa.
        return (
            0 if p > 0 else 1,
            p if p > 0 else 999,
            dependency_depth(obj_id),
        )

    if preserve_inner_order:
        objects.sort(key=phase_key)
        return

    def is_base(obj) -> bool:
        for bases in vincoli_sopra.values():
            if getattr(obj, "oggetto_id", None) in bases:
                return True
        return False

    def full_key(obj):
        group, p, depth = phase_key(obj)
        if getattr(obj, "solo_su_piano", False):
            subgroup = 0
        elif is_base(obj):
            subgroup = 1
        else:
            subgroup = 2
        return (
            group,
            p,
            depth,
            subgroup,
            -getattr(obj, "height", 0),
            -getattr(obj, "depth", 0),
            -getattr(obj, "width", 0),
        )

    objects.sort(key=full_key)



def priorita_mancanti(all_objects: Iterable, placed: Iterable) -> List[str]:
    """Restituisce gli ID delle istanze prioritarie non posizionate."""
    placed_ids = {getattr(obj, "id", None) for obj in placed}
    return [
        obj.id for obj in all_objects
        if priorita_esplicita(obj) > 0 and obj.id not in placed_ids
    ]



def score_soluzione(
    placed: Sequence,
    container_h: Optional[float] = None,
    all_objects: Optional[Sequence] = None,
) -> Tuple[tuple, int, int, float]:
    """Score lessicografico: priorità, totale, lunghezza X, buchi interni.

    Il primo elemento è una tupla ``(livello_1, livello_2, ...)``: una
    soluzione che carica un prioritario di livello 1 prevale sempre su una
    che carica solo livelli successivi, anche se il totale fosse maggiore.
    A parità di priorità e oggetti caricati, si preferisce la soluzione che
    termina prima sull'asse X: è la regola necessaria per riempire Y/Z prima
    di aprire una nuova fascia longitudinale. I singoli interni restano un
    criterio secondario di spareggio.
    """
    fitted = [obj for obj in placed if getattr(obj, "z", -1) >= 0]
    source = all_objects if all_objects is not None else placed
    livelli = sorted({
        priorita_esplicita(obj) for obj in source
        if priorita_esplicita(obj) > 0
    })
    priorita_vector = tuple(
        sum(
            1 for obj in fitted
            if priorita_esplicita(obj) == livello
        )
        for livello in livelli
    )
    if not fitted:
        return (priorita_vector, 0, 0, float("-inf"))

    # Import locale per evitare dipendenze circolari tra policy e packer.
    from .packer_3d_v2 import _ha_oggetto_sopra, _ha_oggetto_piu_avanti

    singoli_interni = sum(
        1 for obj in fitted
        if obj.z == 0
        and not _ha_oggetto_sopra(fitted, obj, container_h)
        and _ha_oggetto_piu_avanti(fitted, obj)
    )
    max_x = max(obj.x + obj.width for obj in fitted)
    return (priorita_vector, len(fitted), -max_x, -singoli_interni)



def valida_vincoli_sopra(all_objects: Sequence, placed: Sequence, vincoli_sopra: Optional[Mapping] = None) -> dict:
    """Verifica relazioni valide e divieti espliciti ``A sopra B``.

    Una relazione con ``None`` o configurazioni valide richiede almeno una
    coppia A/B. Una relazione con set vuoto è invece un divieto: nessuna
    istanza A può stare direttamente sopra B.
    """
    vincoli = normalizza_vincoli_sopra(vincoli_sopra)
    invalidi = []
    placed_list = list(placed)

    def _sopra_diretto(sopra, sotto):
        return (
            sopra.z > 0
            and abs(sopra.z - (sotto.z + sotto.height)) <= 0.5
            and sopra.x < sotto.x + sotto.width
            and sopra.x + sopra.width > sotto.x
            and sopra.y < sotto.y + sotto.depth
            and sopra.y + sopra.depth > sotto.y
        )

    def _configurazione_consentita(sopra, sotto, dettagli):
        """Verifica anche le dimensioni effettive della coppia A/B."""
        if dettagli is None:
            return True
        dimensioni_sopra = (sopra.width, sopra.depth, sopra.height)
        dimensioni_sotto = (sotto.width, sotto.depth, sotto.height)
        return (dimensioni_sopra, dimensioni_sotto) in dettagli

    relazioni_richieste = set()
    divieti = set()
    for a_id, bases in vincoli.items():
        for b_id, dettagli in bases.items():
            if a_id == b_id:
                continue
            if isinstance(dettagli, set) and not dettagli:
                divieti.add((a_id, b_id))
            else:
                relazioni_richieste.add((a_id, b_id))

    for a_id, b_id in sorted(divieti):
        if any(
            sopra.oggetto_id == a_id
            and sotto.oggetto_id == b_id
            and _sopra_diretto(sopra, sotto)
            for sopra in placed_list
            for sotto in placed_list
        ):
            invalidi.append({
                "sopra_oggetto_id": a_id,
                "sotto_oggetto_id": b_id,
                "tipo": "configurazione_esclusa",
            })

    for a_id, b_id in sorted(relazioni_richieste):
        dettagli = vincoli[a_id][b_id]
        if not any(
            sopra.oggetto_id == a_id
            and sotto.oggetto_id == b_id
            and _sopra_diretto(sopra, sotto)
            and _configurazione_consentita(sopra, sotto, dettagli)
            for sopra in placed_list
            for sotto in placed_list
        ):
            invalidi.append({
                "sopra_oggetto_id": a_id,
                "sotto_oggetto_id": b_id,
            })

    return {
        "vincoli_richiesti": len(relazioni_richieste) + len(divieti),
        "vincoli_non_rispettati": invalidi,
        "vincoli_completi": not invalidi,
    }



def valida_priorita(all_objects: Sequence, placed: Sequence) -> dict:
    """Valida il risultato e prepara il report dei prioritari mancanti."""
    prioritari_richiesti = [
        obj.id for obj in all_objects if priorita_esplicita(obj) > 0
    ]
    prioritari_caricati = [
        obj.id for obj in placed if priorita_esplicita(obj) > 0
    ]
    mancanti = [obj_id for obj_id in prioritari_richiesti if obj_id not in set(prioritari_caricati)]
    return {
        "prioritari_richiesti": prioritari_richiesti,
        "prioritari_caricati": prioritari_caricati,
        "prioritari_mancanti": mancanti,
        "priorita_completa": not mancanti,
    }
