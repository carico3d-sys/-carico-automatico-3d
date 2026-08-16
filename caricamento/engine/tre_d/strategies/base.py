"""Contratto comune delle strategie di packing."""

from abc import ABC, abstractmethod
from typing import List, Optional


class PackingStrategy(ABC):
    """Interfaccia uniforme per un'esecuzione di packing."""

    name = "base"

    @abstractmethod
    def execute(
        self,
        objects: List,
        constraints: Optional[dict],
        container_dim: tuple,
        tracker=None,
        compattazione_aggressiva: bool = False,
        deadline: Optional[float] = None,
    ) -> List:
        """Restituisce gli oggetti posizionati/non posizionati del motore.

        ``deadline`` è un timestamp ``time.monotonic()`` oltre il quale la
        strategia si interrompe e restituisce la soluzione migliore trovata
        finora. ``None`` = nessun limite di tempo.
        """
        raise NotImplementedError
