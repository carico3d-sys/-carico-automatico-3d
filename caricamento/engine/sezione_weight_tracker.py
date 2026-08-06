"""
Tracker del carico sulle sezioni/assi del veicolo durante il packing.

Mantiene lo stato del carico per ogni sezione mentre gli oggetti vengono
posizionati. Il peso di un oggetto viene distribuito alle sezioni in base
alla sovrapposizione della sua proiezione sull'asse X con l'intervallo di
ciascuna sezione.
"""

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Dict, List, Optional, Tuple


@dataclass
class SezioneWeightTracker:
    """Tiene traccia del carico per sezione.

    Le sezioni possono essere qualsiasi oggetto con gli attributi:
    - id: identificativo
    - inizio_x_mm: inizio della sezione sull'asse X
    - fine_x_mm: fine della sezione sull'asse X
    - carico_massimo_kg: limite di peso della sezione
    """

    sezioni: List = field(default_factory=list)
    carico_attuale: Dict[int, float] = field(default_factory=dict)

    def __post_init__(self):
        for s in self.sezioni:
            self.carico_attuale.setdefault(s.id, 0.0)

    @staticmethod
    def _distribuisci_peso(
        sezione,
        x_start: int,
        x_end: int,
        peso: float,
    ) -> float:
        """Restituisce la frazione di peso che ricade sulla sezione."""
        if x_end <= sezione.inizio_x_mm or x_start >= sezione.fine_x_mm:
            return 0.0
        overlap = min(x_end, sezione.fine_x_mm) - max(x_start, sezione.inizio_x_mm)
        lunghezza_oggetto = x_end - x_start
        if lunghezza_oggetto <= 0:
            return 0.0
        return peso * (overlap / lunghezza_oggetto)

    def peso_per_sezioni(
        self,
        x_start: int,
        x_end: int,
        peso: float,
    ) -> Dict[int, float]:
        """Distribuisce il peso di un oggetto sulle sezioni in base alla
        sovrapposizione in X.
        """
        return {
            s.id: self._distribuisci_peso(s, x_start, x_end, peso)
            for s in self.sezioni
        }

    def sovraccarico_dopo(
        self,
        x_start: int,
        x_end: int,
        peso: float,
    ) -> float:
        """Calcola i kg totali di sovraccarico se si piazzasse un oggetto in
        [x_start, x_end) con il dato peso.

        Il sovraccarico è la somma, su tutte le sezioni, del carico
        aggiunto che supera il limite. Se nessuna sezione viene superata,
        restituisce 0.
        """
        sovraccarico = 0.0
        for s in self.sezioni:
            p = self._distribuisci_peso(s, x_start, x_end, peso)
            if p == 0.0:
                continue
            nuovo = self.carico_attuale.get(s.id, 0.0) + p
            limite = float(s.carico_massimo_kg)
            if nuovo > limite:
                sovraccarico += nuovo - limite
        return sovraccarico

    def margine_sezione(self, sezione_id: int) -> float:
        """Restituisce i kg ancora disponibili su una sezione."""
        for s in self.sezioni:
            if s.id == sezione_id:
                return max(0.0, float(s.carico_massimo_kg) - self.carico_attuale.get(s.id, 0.0))
        return 0.0

    def applica(self, x_start: int, x_end: int, peso: float) -> None:
        """Aggiunge il peso dell'oggetto appena posizionato ai carichi."""
        for s in self.sezioni:
            p = self._distribuisci_peso(s, x_start, x_end, peso)
            if p:
                self.carico_attuale[s.id] = self.carico_attuale.get(s.id, 0.0) + p

    def rimuovi(self, x_start: int, x_end: int, peso: float) -> None:
        """Rimuove il peso di un oggetto dai carichi (utile per rollback)."""
        for s in self.sezioni:
            p = self._distribuisci_peso(s, x_start, x_end, peso)
            if p:
                self.carico_attuale[s.id] = max(0.0, self.carico_attuale.get(s.id, 0.0) - p)

    def score_distribuzione(self) -> float:
        """Restituisce uno score di uniformità della distribuzione.

        Più alto è meglio. Se non ci sono sezioni o limiti, restituisce 0.
        Usa la deviazione standard dei carichi percentuali.
        """
        if not self.sezioni:
            return 0.0
        percentuali = []
        for s in self.sezioni:
            limite = float(s.carico_massimo_kg)
            if limite <= 0:
                continue
            carico = self.carico_attuale.get(s.id, 0.0)
            percentuali.append(carico / limite)
        if not percentuali:
            return 0.0
        media = sum(percentuali) / len(percentuali)
        varianza = sum((p - media) ** 2 for p in percentuali) / len(percentuali)
        # Restituisce un valore inversamente proporzionale alla deviazione:
        # più uniforme è la distribuzione, più alto è lo score.
        return - (varianza ** 0.5)

    def riepilogo(self) -> List[Dict]:
        """Restituisce un riepilogo leggibile per debug/reporting."""
        out = []
        for s in self.sezioni:
            limite = float(s.carico_massimo_kg)
            carico = self.carico_attuale.get(s.id, 0.0)
            out.append({
                "sezione_id": s.id,
                "inizio_x_mm": s.inizio_x_mm,
                "fine_x_mm": s.fine_x_mm,
                "carico_massimo_kg": limite,
                "carico_attuale_kg": round(carico, 2),
                "margine_kg": round(max(0.0, limite - carico), 2),
            })
        return out
