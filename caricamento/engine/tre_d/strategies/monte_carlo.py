"""Strategia Monte Carlo basata su restart random per tipo."""

from .base import PackingStrategy
from ..random_packer import run_packing_random


class MonteCarloStrategy(PackingStrategy):
    """Esegue restart random e conserva la soluzione migliore."""

    name = "monte_carlo"

    def __init__(self, num_restarts=5):
        self.num_restarts = num_restarts

    def execute(
        self,
        objects,
        constraints,
        container_dim,
        tracker=None,
        compattazione_aggressiva=False,
        deadline=None,
        telemetria=None,
    ):
        self.telemetria = telemetria
        return run_packing_random(
            objects,
            vincoli_sopra=constraints,
            num_restarts=self.num_restarts,
            container_dim=container_dim,
            tracker=tracker,
            compattazione_aggressiva=compattazione_aggressiva,
            deadline=deadline,
            telemetria=telemetria,
        )
