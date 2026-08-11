"""
Data Adapter — Interfaccia tra il DB Django e l'algoritmo di packing 3D.

Flusso:
1. Estrae da DB: Contenitore, OggettoDaCaricare, VincoloOggetto, VincoloTraOggetti
2. Converte mm → cm
3. Chiama run_packing_v2()
4. Converte cm → mm
5. Salva i risultati come OggettoPosizionato nel DB
"""

from typing import List

from django.db import transaction

from caricamento.models import (
    Contenitore,
    Oggetto,
    OggettoDaCaricare,
    OggettoPosizionato,
    PianoDiCarico,
    StatoPiano,
    VincoloOggetto,
    VincoloTraOggetti,
)

from ..common import _build_lookup_vincoli_tra
from .packer_3d_v2 import Obj
from .packer_3d_v2 import run_packing_v2


# ============================
# ESTRAZIONE DATI DAL DB
# ============================

def _mm_to_cm(valore_mm: int) -> float:
    """Converte millimetri in centimetri."""
    return valore_mm / 10.0


def _cm_to_mm(valore_cm: float) -> int:
    """Converte centimetri in millimetri (troncato a int)."""
    return int(round(valore_cm * 10))


def _get_colore(oggetto: Oggetto, index: int) -> str:
    """Restituisce il colore dell'oggetto o un colore casuale se non impostato."""
    if oggetto.colore:
        return oggetto.colore
    # Colori predefiniti per distinguere oggetti senza colore
    palette = [
        "#4488ff", "#44cc44", "#ff6644", "#ffcc00",
        "#cc44ff", "#44dddd", "#ff4488", "#88aa44",
    ]
    return palette[index % len(palette)]


def _carica_oggetti(piano: PianoDiCarico) -> List[Obj]:
    """Carica gli OggettoDaCaricare e li trasforma in lista di Obj (in cm).

    Espande la quantità: se un oggetto ha quantita=3, crea 3 Obj distinti.
    """
    oggetti_da_caricare = OggettoDaCaricare.objects.filter(
        piano_di_carico=piano
    ).select_related("oggetto__vincoli")

    oggetti_estratti: List[Obj] = []
    index = 0

    for entry in oggetti_da_caricare:
        oggetto: Oggetto = entry.oggetto
        quantita = entry.quantita
        priorita = entry.priorita

        # Legge i vincoli dell'oggetto (se esistono)
        try:
            vincolo_oggetto: VincoloOggetto = oggetto.vincoli
        except VincoloOggetto.DoesNotExist:
            vincolo_oggetto = None

        orientation_allowed = True
        sovrapponibile = True
        solo_su_piano = False
        fragile = False
        rot_su_x = True
        rot_su_y = True
        rot_su_z = True

        if vincolo_oggetto is not None:
            orientation_allowed = vincolo_oggetto.rotazione_consentita
            sovrapponibile = vincolo_oggetto.sovrapponibile
            solo_su_piano = vincolo_oggetto.solo_su_piano
            fragile = vincolo_oggetto.fragile
            rot_su_x = vincolo_oggetto.rotazione_su_x
            rot_su_y = vincolo_oggetto.rotazione_su_y
            rot_su_z = vincolo_oggetto.rotazione_su_z

        w_cm = _mm_to_cm(oggetto.lunghezza_mm)
        d_cm = _mm_to_cm(oggetto.larghezza_mm)
        h_cm = _mm_to_cm(oggetto.altezza_mm)

        for _ in range(quantita):
            obj_id = f"{oggetto.codice}-{index}"
            obj = Obj(
                id=obj_id,
                w=w_cm,
                d=d_cm,
                h=h_cm,
                oggetto_id=oggetto.pk,
                orientation_allowed=orientation_allowed,
                rotazione_su_x=rot_su_x,
                rotazione_su_y=rot_su_y,
                rotazione_su_z=rot_su_z,
                sovrapponibile=sovrapponibile,
                solo_su_piano=solo_su_piano,
                fragile=fragile,
                priorita=priorita,
                vincolo_oggetto_id=(
                    getattr(vincolo_oggetto, "pk", None)
                    if vincolo_oggetto is not None else None
                ),
                note_vincolo=(
                    getattr(vincolo_oggetto, "note", "")
                    if vincolo_oggetto is not None else ""
                ),
            )
            # Memorizzo anche il colore come attributo (utile per salvare)
            obj._colore = _get_colore(oggetto, index)
            obj._peso_kg = float(oggetto.peso_kg)
            obj.peso_massimo_tetto = (
                float(vincolo_oggetto.peso_massimo_tetto_kg)
                if vincolo_oggetto and vincolo_oggetto.peso_massimo_tetto_kg
                else 0.0
            )
            oggetti_estratti.append(obj)
            index += 1

    return oggetti_estratti


def _carica_vincoli_sopra(piano: PianoDiCarico) -> dict:
    """Carica il lookup completo dei vincoli ``sopra`` del piano.

    La struttura restituita è quella consumata dal packer:
    ``{A_id: {B_id: dettagli}}``. Sono incluse solo relazioni attive con
    entrambi gli oggetti nella lista del piano.
    """
    oggetti_nel_piano = set(
        OggettoDaCaricare.objects.filter(piano_di_carico=piano)
        .values_list("oggetto_id", flat=True)
    )
    vincoli = VincoloTraOggetti.objects.filter(
        attivo=True,
        tipo_relazione="sopra",
        oggetto_a_id__in=oggetti_nel_piano,
        oggetto_b_id__in=oggetti_nel_piano,
    ).select_related("oggetto_a", "oggetto_b")
    lookup = _build_lookup_vincoli_tra(
        vincoli,
        oggetto_ids=oggetti_nel_piano,
    )
    return {
        a_id: {entry[0]: entry[3] for entry in entries}
        for a_id, entries in lookup.items()
    }


# ============================
# SALVATAGGIO RISULTATI NEL DB
# ============================

def _salva_posizionamenti(
    piano: PianoDiCarico,
    oggetti_posizionati: List[Obj],
) -> int:
    """Salva i risultati dell'algoritmo come OggettoPosizionato nel DB.

    Args:
        piano: il PianoDiCarico
        oggetti_posizionati: lista di Obj posizionati (con x, y, z)

    Returns:
        numero di record salvati
    """
    # Elimina eventuali posizionamenti precedenti
    piano.oggetti_posizionati.all().delete()

    nuovi_posizionamenti = []
    for obj in oggetti_posizionati:
        nuovo = OggettoPosizionato(
            piano_di_carico=piano,
            oggetto_id=obj.oggetto_id,
            coordinata_x_mm=_cm_to_mm(obj.x),
            coordinata_y_mm=_cm_to_mm(obj.y),
            coordinata_z_mm=_cm_to_mm(obj.z),
            dimensione_x_mm=_cm_to_mm(obj.width),
            dimensione_y_mm=_cm_to_mm(obj.depth),
            dimensione_z_mm=_cm_to_mm(obj.height),
            rotazione_applicata="XYZ",
            colore=getattr(obj, "_colore", "#4488ff"),
            peso_posato_sopra_kg=0,  # verrà calcolato in un secondo momento
        )
        nuovi_posizionamenti.append(nuovo)

    OggettoPosizionato.objects.bulk_create(nuovi_posizionamenti)
    return len(nuovi_posizionamenti)


def _aggiorna_piano(
    piano: PianoDiCarico,
    oggetti_posizionati: List[Obj],
    lunghezza_mm: int,
) -> None:
    """Aggiorna i campi riassuntivi del PianoDiCarico."""
    peso_totale = sum(
        getattr(o, "_peso_kg", 0) for o in oggetti_posizionati
    )
    volume_totale_mm3 = sum(
        _cm_to_mm(o.width) * _cm_to_mm(o.depth) * _cm_to_mm(o.height)
        for o in oggetti_posizionati
    )
    if oggetti_posizionati:
        lunghezza_occupata_mm = _cm_to_mm(
            max(o.x + o.width for o in oggetti_posizionati)
        )
    else:
        lunghezza_occupata_mm = 0

    piano.peso_totale_kg = peso_totale
    piano.volume_utilizzato_mm3 = volume_totale_mm3
    piano.algoritmo = "Algoritmo 3D Semplificato (skyline+stacking)"
    piano.stato = StatoPiano.COMPLETATO

    # Segnala se il carico supera la lunghezza del contenitore
    if lunghezza_occupata_mm > lunghezza_mm:
        piano.stato = StatoPiano.PARZIALE

    piano.save(update_fields=[
        "peso_totale_kg", "volume_utilizzato_mm3",
        "algoritmo", "stato",
    ])


# ============================
# FUNZIONE PRINCIPALE
# ============================

def esegui_ottimizzazione_3d(
    piano_id: int,
    iterazioni: int = 10,
) -> dict:
    """Esegue l'ottimizzazione 3D su un PianoDiCarico usando solo questo algoritmo.

    Args:
        piano_id: PK del PianoDiCarico
        iterazioni: iterazioni di backtracking (default 10)

    Returns:
        dict con riepilogo dei risultati
    """
    try:
        piano = PianoDiCarico.objects.get(pk=piano_id)
    except PianoDiCarico.DoesNotExist:
        return {"successo": False, "errore": f"PianoDiCarico {piano_id} non trovato."}

    contenitore = piano.contenitore

    # 1. Estrai dati dal DB
    oggetti = _carica_oggetti(piano)
    vincoli_sopra = _carica_vincoli_sopra(piano)

    if not oggetti:
        return {"successo": False, "errore": "Nessun oggetto da caricare nel piano."}

    # Dimensioni contenitore in cm
    container_dim = (
        contenitore.lunghezza_mm / 10.0,
        contenitore.larghezza_mm / 10.0,
        contenitore.altezza_mm / 10.0,
    )

    # 2. Esegui l'algoritmo con i limiti del contenitore
    risultati = run_packing_v2(
        oggetti, vincoli_sopra=vincoli_sopra,
        iterations=iterazioni, container_dim=container_dim,
    )

    # Separa oggetti posizionati da quelli che non entrano
    from .packer_3d_v2 import filter_unfitted
    posizionati, non_posizionati = filter_unfitted(risultati)

    # 3. Salva solo i posizionati nel DB (se ce ne sono)
    with transaction.atomic():
        n_salvati = _salva_posizionamenti(piano, posizionati)
        _aggiorna_piano(piano, posizionati, contenitore.lunghezza_mm)
        # Se nessun oggetto posizionato, segnala come parziale
        if not posizionati:
            piano.stato = StatoPiano.PARZIALE
            piano.messaggio_errore = "Nessun oggetto entra nel contenitore."
            piano.save(update_fields=["stato", "messaggio_errore"])

    # 4. Riepilogo
    if posizionati:
        lunghezza_occupata_cm = max(o.x + o.width for o in posizionati)
    else:
        lunghezza_occupata_cm = 0
    lunghezza_contenitore_cm = _mm_to_cm(contenitore.lunghezza_mm)
    saturazione = (lunghezza_occupata_cm / lunghezza_contenitore_cm * 100) if lunghezza_contenitore_cm > 0 else 0

    return {
        "successo": True if posizionati else False,
        "piano_id": piano.pk,
        "piano_nome": piano.nome,
        "oggetti_caricati": n_salvati,
        "oggetti_non_caricati": len(non_posizionati),
        "lunghezza_occupata_cm": round(lunghezza_occupata_cm, 1),
        "lunghezza_contenitore_cm": round(lunghezza_contenitore_cm, 1),
        "saturazione_percentuale": round(saturazione, 1),
        "peso_totale_kg": float(piano.peso_totale_kg or 0),
        "vincoli_sopra_applicati": len(vincoli_sopra),
        "algoritmo": piano.algoritmo,
    }
