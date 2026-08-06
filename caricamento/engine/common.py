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



    @classmethod
    def from_dict(cls, data: dict) -> "ConfigurazioneOttimizzazione":
        defaults = get_configurazione_default()

        strategia = data.get("strategia_ottimizzazione", {}) or {}

        return cls(
            algoritmo_base=strategia.get("algoritmo_base", defaults["strategia_ottimizzazione"]["algoritmo_base"]),
            ordinamento_casuale=strategia.get("ordinamento_casuale", False),
            distribuzione_pesi_attiva=strategia.get("distribuzione_pesi_attiva", True)
        )


def get_configurazione_default() -> dict:
    return {
        "strategia_ottimizzazione": {
            "algoritmo_base": "Algoritmo 3D Semplificato",
            "ordinamento_casuale": False,
            "distribuzione_pesi_attiva": True,
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


# ---------------------------------------------------------------------------
# Funzioni helper condivise
# ---------------------------------------------------------------------------

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
) -> VincoliTraLookup:
    lookup: Dict[int, List[Tuple[int, str, Optional[float], Optional[Set[Tuple[Tuple[int, int, int], Tuple[int, int, int]]]]]]] = {}
    for vt in vincoli_tra_qs:
        valid_configs = _estrai_configurazioni_valide(vt.dettagli_posizionamento)
        entry_a = (vt.oggetto_b_id, vt.tipo_relazione, None, valid_configs)
        lookup.setdefault(vt.oggetto_a_id, []).append(entry_a)
    return lookup


def _estrai_configurazioni_valide(dettagli):
    """Estrae le configurazioni valide da dettagli_posizionamento."""
    if not dettagli:
        return None
    configurazioni = dettagli.get('configurazioni') or dettagli.get('configurazioni_valide')
    if not configurazioni:
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

