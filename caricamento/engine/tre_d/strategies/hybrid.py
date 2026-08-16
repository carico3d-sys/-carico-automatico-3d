"""Strategia ibrida: confronta backtracking v3 e Monte Carlo."""

from .base import PackingStrategy
from ..packer_3d_v2 import filter_unfitted
from ..priority_policy import score_soluzione
from .backtracking import BacktrackingStrategy
from .monte_carlo import MonteCarloStrategy


class HybridStrategy(PackingStrategy):
    """Esegue v3 e Monte Carlo e restituisce la soluzione con score migliore."""

    name = "hybrid"

    def __init__(self, iterations=7, num_restarts=5):
        self.backtracking = BacktrackingStrategy(iterations=iterations)
        self.monte_carlo = MonteCarloStrategy(num_restarts=num_restarts)

    def execute(
        self,
        objects,
        constraints,
        container_dim,
        tracker=None,
        compattazione_aggressiva=False,
        deadline=None,
    ):
        backtracking_result = self.backtracking.execute(
            objects,
            constraints,
            container_dim,
            tracker=tracker,
            compattazione_aggressiva=compattazione_aggressiva,
            deadline=deadline,
        )
        monte_carlo_result = self.monte_carlo.execute(
            objects,
            constraints,
            container_dim,
            tracker=tracker,
            compattazione_aggressiva=compattazione_aggressiva,
            deadline=deadline,
        )

        backtracking_placed, _ = filter_unfitted(backtracking_result)
        monte_carlo_placed, _ = filter_unfitted(monte_carlo_result)
        backtracking_score = score_soluzione(
            backtracking_placed,
            container_dim[2] if container_dim else None,
            all_objects=objects,
        )
        monte_carlo_score = score_soluzione(
            monte_carlo_placed,
            container_dim[2] if container_dim else None,
            all_objects=objects,
        )
        return (
            backtracking_result
            if backtracking_score >= monte_carlo_score
            else monte_carlo_result
        )
