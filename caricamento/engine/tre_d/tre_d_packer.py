"""
TreDPacker — Wrapper per l'integrazione con il sistema di ottimizzazione
esistente (EseguiOttimizzazione / _ottimizza in bin_packing.py).

Implementa la stessa interfaccia di CustomPacker:
- aggiungi_oggetto(oggetto, vincoli, colore)
- esegui()
- results : List[ItemPacked]
- unfitted_codes : List[str]
- genera_metriche() -> dict
"""

from decimal import Decimal
from typing import Dict, List, Optional

from django.db import transaction
from django.utils import timezone

from ..common import (
    ConfigurazioneOttimizzazione,
    ItemPacked,
)

from .data_adapter import _mm_to_cm, _cm_to_mm
from .packer_3d_v2 import Obj, filter_unfitted
from .priority_policy import (
    valida_priorita,
    valida_vincoli_sopra,
)
from .strategies import strategy_for_config


class TreDPacker:
    """Wrapper per l'algoritmo 3D semplificato (skyline+stacking+backtracking).

    Si interfaccia con il sistema di ottimizzazione esistente raccogliendo
    oggetti tramite aggiungi_oggetto(), e convertendoli internamente nel
    formato Obj dell'algoritmo tre_d.
    """

    def __init__(
        self,
        bin_dimensioni,
        peso_max_kg,
        configurazione: Optional[ConfigurazioneOttimizzazione] = None,
        vincoli_tra_lookup: Optional[Dict] = None,
        sezioni: Optional[List] = None,
    ):
        self.bin_dimensioni = bin_dimensioni  # (lunghezza_mm, larghezza_mm, altezza_mm)
        self.peso_max_kg = peso_max_kg
        self.config = configurazione or ConfigurazioneOttimizzazione()
        self.vincoli_tra_lookup = vincoli_tra_lookup or {}
        self.sezioni = sezioni or []

        # Collezione interna: lista di (oggetto, vincoli, colore)
        self._items: List = []

        # Output (popolati da esegui())
        self.results: List[ItemPacked] = []
        self.unfitted_codes: List[str] = []
        self.priority_report: Dict = {
            "prioritari_richiesti": [],
            "prioritari_caricati": [],
            "prioritari_mancanti": [],
            "priorita_completa": True,
        }
        self.priority_missing_codes: List[str] = []
        self.constraint_report: Dict = {
            "vincoli_richiesti": 0,
            "vincoli_non_rispettati": [],
            "vincoli_completi": True,
        }

    def aggiungi_oggetto(self, oggetto, vincoli=None, colore="#4488ff", priorita=0):
        """Raccoglie un oggetto da processare (interfaccia standard)."""
        self._items.append((oggetto, vincoli, colore, priorita))

    def esegui(self):
        """Converte gli oggetti in formato Obj, esegue l'algoritmo,
        e popola self.results con ItemPacked."""
        from caricamento.models import VincoloOggetto

        objs = []

        for idx, (oggetto, vincoli, colore, *extra) in enumerate(self._items):
            priorita = extra[0] if extra else 0
            w_cm = _mm_to_cm(oggetto.lunghezza_mm)
            d_cm = _mm_to_cm(oggetto.larghezza_mm)
            h_cm = _mm_to_cm(oggetto.altezza_mm)

            orientation_allowed = True
            sovrapponibile = True
            solo_su_piano = False
            fragile = False

            rot_su_x = True
            rot_su_y = True
            rot_su_z = True
            peso_massimo_tetto = 0.0

            if vincoli is not None and isinstance(vincoli, VincoloOggetto):
                orientation_allowed = vincoli.rotazione_consentita
                sovrapponibile = vincoli.sovrapponibile
                solo_su_piano = vincoli.solo_su_piano
                fragile = vincoli.fragile
                rot_su_x = vincoli.rotazione_su_x
                rot_su_y = vincoli.rotazione_su_y
                rot_su_z = vincoli.rotazione_su_z
                peso_massimo_tetto = float(
                    vincoli.peso_massimo_tetto_kg
                ) if vincoli.peso_massimo_tetto_kg else 0.0

            # ID univoco per ogni istanza (serve per backtracking)
            obj_id = f"{oggetto.codice}-{idx}"
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
                peso_massimo_tetto=peso_massimo_tetto,
                vincolo_oggetto_id=(
                    getattr(vincoli, "pk", None) if vincoli is not None else None
                ),
                note_vincolo=(
                    getattr(vincoli, "note", "") if vincoli is not None else ""
                ),
            )
            obj._colore = colore
            obj._peso_kg = float(oggetto.peso_kg)
            objs.append(obj)

        # Costruisce vincoli_sopra dalla vincoli_tra_lookup.
        # Struttura: {A_id: {B_id: dettagli}} dove dettagli è un set di
        # tuple (dimsA, dimsB) o None se non ci sono vincoli di
        # orientamento specifici.
        # ``None`` significa che il vincolo non ha dettagli dimensionali.
        # ``set()`` invece è significativo: il vincolo esiste ma tutte le
        # configurazioni sono escluse, quindi la combinazione deve essere
        # vietata e non può ricadere nelle regole standard.
        vincoli_sopra = {}
        for a_id, vincoli_list in self.vincoli_tra_lookup.items():
            for b_id, tipo_rel, _, dettagli in vincoli_list:
                if tipo_rel == "sopra":
                    if a_id not in vincoli_sopra:
                        vincoli_sopra[a_id] = {}
                    vincoli_sopra[a_id][b_id] = dettagli

        # Dimensioni contenitore in cm (da self.bin_dimensioni in mm)
        container_dim = (
            self.bin_dimensioni[0] / 10.0,  # lunghezza -> larghezza X
            self.bin_dimensioni[1] / 10.0,  # larghezza -> profondita Y
            self.bin_dimensioni[2] / 10.0,  # altezza -> altezza Z
        )

        # Tracker del peso sulle sezioni (solo se priorità attiva)
        tracker = None
        distribuzione_attiva = (
            self.sezioni
            and self.config.distribuzione_pesi_attiva
        )
        if distribuzione_attiva:
            from ..sezione_weight_tracker import SezioneWeightTracker
            tracker = SezioneWeightTracker(list(self.sezioni))

        # Esegue la strategia selezionata con i limiti del contenitore.
        # La factory mantiene la precedenza storica delle configurazioni,
        # mentre ogni algoritmo concreto vive nel proprio adattatore.
        strategia = strategy_for_config(self.config)
        risultati = strategia.execute(
            objs,
            vincoli_sopra,
            container_dim,
            tracker=tracker,
            compattazione_aggressiva=self.config.compattazione_aggressiva,
        )

        # Converte i risultati in ItemPacked (mm) — solo oggetti posizionati
        placed_objs, unfitted_objs = filter_unfitted(risultati)
        self.priority_report = valida_priorita(objs, placed_objs)
        self.constraint_report = valida_vincoli_sopra(
            objs, placed_objs, vincoli_sopra
        )
        self.priority_report["vincoli"] = self.constraint_report
        self.priority_missing_codes = list(self.priority_report["prioritari_mancanti"])
        self.results = []
        codici_per_oggetto_id = {
            oggetto.pk: oggetto.codice
            for oggetto, _vincoli, _colore, *_extra in self._items
        }
        for obj in placed_objs:
            # ``obj.id`` identifica l'istanza interna (es. CODICE-0) e non è
            # il codice dell'anagrafica. L'API/frontend devono ricevere il
            # codice canonico dell'Oggetto per poter salvare la preview.
            codice_anagrafica = codici_per_oggetto_id.get(obj.oggetto_id, obj.id)
            self.results.append(ItemPacked(
                oggetto_id=obj.oggetto_id or 0,
                codice=codice_anagrafica,
                coordinata_x_mm=_cm_to_mm(obj.x),
                coordinata_y_mm=_cm_to_mm(obj.y),
                coordinata_z_mm=_cm_to_mm(obj.z),
                dimensione_x_mm=_cm_to_mm(obj.width),
                dimensione_y_mm=_cm_to_mm(obj.depth),
                dimensione_z_mm=_cm_to_mm(obj.height),
                rotazione_applicata="XYZ",
                peso_kg=Decimal(str(getattr(obj, "_peso_kg", 0))),
                colore=getattr(obj, "_colore", "#4488ff"),
                peso_sopra_kg=Decimal(str(getattr(obj, "_peso_sopra_kg", 0))),
            ))
        self.unfitted_codes = [obj.id for obj in unfitted_objs]
        # I prioritari mancanti sono esposti separatamente per il report/API.
        for obj_id in self.priority_missing_codes:
            if obj_id not in self.unfitted_codes:
                self.unfitted_codes.append(obj_id)

    def genera_metriche(self) -> Dict:
        """Genera metriche minimali compatibili con il formato atteso."""
        if not self.results:
            return {}

        volume_oggetti = sum(
            r.dimensione_x_mm * r.dimensione_y_mm * r.dimensione_z_mm
            for r in self.results
        )
        volume_bin = (
            self.bin_dimensioni[0]
            * self.bin_dimensioni[1]
            * self.bin_dimensioni[2]
        )
        saturazione = (volume_oggetti / volume_bin * 100) if volume_bin > 0 else 0

        return {
            "efficienza": {
                "saturazione_percentuale": round(saturazione, 1),
                "volume_utilizzato_mm3": volume_oggetti,
                "volume_disponibile_mm3": volume_bin,
                "peso_totale_kg": round(
                    sum(float(r.peso_kg) for r in self.results), 2
                ),
            }
        }


__all__ = ["TreDPacker"]
