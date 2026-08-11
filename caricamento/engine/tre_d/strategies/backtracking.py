"""Strategia backtracking basata su optimizer v3."""

from .base import PackingStrategy
from ..optimizer_v3 import run_packing_v3


class BacktrackingStrategy(PackingStrategy):
    """Esegue optimizer v3 con ricerca locale e backtracking."""

    name = "backtracking"

    def __init__(self, iterations=7):
        self.iterations = iterations

    def execute(
        self,
        objects,
        constraints,
        container_dim,
        tracker=None,
        compattazione_aggressiva=False,
    ):
        return run_packing_v3(
            objects,
            vincoli_sopra=constraints,
            iterations=self.iterations,
            container_dim=container_dim,
            tracker=tracker,
            compattazione_aggressiva=compattazione_aggressiva,
        )
