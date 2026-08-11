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
    ) -> List:
        """Restituisce gli oggetti posizionati/non posizionati del motore."""
        raise NotImplementedError
