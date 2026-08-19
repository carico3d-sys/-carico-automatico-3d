"""
Modulo condiviso per l'engine di ottimizzazione 3D.

Contiene dataclass, helper e configurazione usati dal TreDPacker.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Dict, List, Optional, Set, Tuple

from ..models import VincoloTraOggetti

# ---------------------------------------------------------------------------
# Costanti
# ---------------------------------------------------------------------------

COLORI_PACCHI = [
    "#E74C3C", "#3498DB", "#2ECC71", "#F39C12", "#9B59B6",
    "#1ABC9C", "#E67E22", "#2980B9", "#27AE60", "#D35400",
    "#C0392B", "#8E44AD", "#16A085", "#2C3E50", "#F1C40F",
    "#E91E63", "#00BCD4", "#FF5722", "#795548", "#607D8B",
]

# ---------------------------------------------------------------------------
# Configurazione dell'ottimizzatore
# ---------------------------------------------------------------------------

@dataclass
class ConfigurazioneOttimizzazione:
    """Configurazione dell'ottimizzatore di carico (Algoritmo 3D Semplificato)."""    # --- Strategia ---
    algoritmo_base: str = "Algoritmo 3D Semplificato"
    ordinamento_casuale: bool = False
    distribuzione_pesi_attiva: bool = True
    compattazione_aggressiva: bool = False  # se True, permette incastro sotto sbalzi
    backtracking_avanzato: bool = False  # se True, attiva optimizer_v3 a blocchi



    @classmethod
    def from_dict(cls, data: dict) -> "ConfigurazioneOttimizzazione":
        defaults = get_configurazione_default()

        strategia = data.get("strategia_ottimizzazione", {}) or {}

        return cls(
            algoritmo_base=strategia.get("algoritmo_base", defaults["strategia_ottimizzazione"]["algoritmo_base"]),
            ordinamento_casuale=strategia.get("ordinamento_casuale", False),
            distribuzione_pesi_attiva=strategia.get("distribuzione_pesi_attiva", True),
            compattazione_aggressiva=strategia.get("compattazione_aggressiva", False),
            backtracking_avanzato=strategia.get("backtracking_avanzato", False),
        )


def get_configurazione_default() -> dict:
    return {
        "strategia_ottimizzazione": {
            "algoritmo_base": "Algoritmo 3D Semplificato",
            "ordinamento_casuale": False,
            "distribuzione_pesi_attiva": True,
            "compattazione_aggressiva": False,
            "backtracking_avanzato": False,
        },

    }


# ---------------------------------------------------------------------------
# Data classes per i risultati
# ---------------------------------------------------------------------------

@dataclass
class ItemPacked:
    oggetto_id: int
    codice: str
    coordinata_x_mm: int
    coordinata_y_mm: int
    coordinata_z_mm: int
    dimensione_x_mm: int
    dimensione_y_mm: int
    dimensione_z_mm: int
    rotazione_applicata: str
    peso_kg: Decimal
    colore: str
    peso_sopra_kg: Decimal = Decimal("0")


@dataclass
class OptimizerResult:
    successo: bool
    piano_id: int
    container_nome: str = ""
    container_dimensioni: Tuple[int, int, int] = (0, 0, 0)
    oggetti_posizionati: List[ItemPacked] = field(default_factory=list)
    oggetti_non_posizionati: List[str] = field(default_factory=list)
    peso_totale_kg: Decimal = Decimal("0")
    volume_utilizzato_mm3: int = 0
    saturazione_percentuale: float = 0.0
    messaggio: str = ""
    metriche: Optional[Dict] = None
    soluzioni_alternative: List[dict] = field(default_factory=list)
    report_priorita: Optional[Dict] = None
    telemetria: Optional[Dict] = None


# ---------------------------------------------------------------------------
# Funzioni helper condivise
# ---------------------------------------------------------------------------

def conteggio_orientazioni(
    width: float,
    depth: float,
    height: float,
    orientation_allowed: bool,
    rot_su_x: bool,
    rot_su_y: bool,
    rot_su_z: bool,
) -> int:
    """Numero di orientamenti distinti provati dal packer per un oggetto.

    Replica la costruzione delle permutazioni di ``_prova_tutte_orientazioni``
    in ``packer_3d_v2.py``: serve per stimare il numero di tentativi di
    piazzamento (``ops``) di un piano senza eseguire il packing.
    """
    if not orientation_allowed:
        return 1
    permutazioni = [(width, depth, height)]
    if rot_su_z:
        permutazioni.append((depth, width, height))
    if rot_su_x:
        permutazioni.append((width, height, depth))
    if rot_su_y:
        permutazioni.append((height, depth, width))
    if rot_su_x and rot_su_y and rot_su_z:
        permutazioni.append((depth, height, width))
        permutazioni.append((height, width, depth))
    return len(set(permutazioni))


def _genera_colore_da_oggetto(oggetto_id: int, colore_personalizzato: str = "") -> str:
    if colore_personalizzato and colore_personalizzato.strip():
        return colore_personalizzato.strip()
    return COLORI_PACCHI[oggetto_id % len(COLORI_PACCHI)]


# Alias per il lookup dei vincoli tra oggetti
VincoliTraLookup = Dict[
    int,
    List[
        Tuple[
            int,
            str,
            Optional[float],
            Optional[Set[Tuple[Tuple[int, int, int], Tuple[int, int, int]]]],
        ]
    ],
]


def _build_lookup_vincoli_tra(
    vincoli_tra_qs,
    oggetto_ids: Optional[Set[int]] = None,
) -> VincoliTraLookup:
    """Costruisce il lookup dei vincoli tra gli oggetti del piano.

    Se *oggetto_ids* è valorizzato, vengono mantenute solo le relazioni
    con entrambi gli estremi presenti nella lista di carico. In questo modo
    un vincolo dell'anagrafica riferito a un oggetto non incluso nel piano
    non influenza l'ottimizzazione corrente.
    """
    lookup: VincoliTraLookup = {}
    for vt in vincoli_tra_qs:
        if oggetto_ids is not None and (
            vt.oggetto_a_id not in oggetto_ids
            or vt.oggetto_b_id not in oggetto_ids
        ):
            continue
        valid_configs = _estrai_configurazioni_valide(vt.dettagli_posizionamento)
        entry_a = (vt.oggetto_b_id, vt.tipo_relazione, None, valid_configs)
        lookup.setdefault(vt.oggetto_a_id, []).append(entry_a)
    return lookup


def _estrai_configurazioni_valide(dettagli):
    """Estrae le configurazioni valide preservando le esclusioni esplicite.

    Valori restituiti:
    - ``None``: nessuna configurazione è stata definita (vincolo legacy
      senza dettagli; la relazione può usare le regole standard/relazionali);
    - ``set()``: il vincolo è definito, ma tutte le configurazioni sono
      escluse o non valide (la combinazione è vietata);
    - insieme non vuoto: solo le configurazioni contenute sono autorizzate.
    """
    if dettagli is None:
        return None
    configurazioni = dettagli.get('configurazioni')
    if configurazioni is None:
        configurazioni = dettagli.get('configurazioni_valide')
    if configurazioni is None:
        return None
    valide = set()
    for c in configurazioni:
        if c.get('valida') is False:
            continue
        try:
            # Il frontend salva in mm; l'algoritmo lavora in cm
            dims_a = (int(c['dimsA'][0]) / 10.0, int(c['dimsA'][1]) / 10.0, int(c['dimsA'][2]) / 10.0)
            dims_b = (int(c['dimsB'][0]) / 10.0, int(c['dimsB'][1]) / 10.0, int(c['dimsB'][2]) / 10.0)
        except (KeyError, IndexError, TypeError, ValueError):
            continue
        valide.add((dims_a, dims_b))
    return valide

