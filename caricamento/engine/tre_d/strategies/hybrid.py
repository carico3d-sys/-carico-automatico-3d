"""Strategia ibrida: confronta backtracking v3 e Monte Carlo."""

import time

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
        telemetria=None,
    ):
        self.telemetria = telemetria
        if telemetria is not None:
            telemetria["passate_max"] = (
                self.backtracking.iterations + 1 + self.monte_carlo.num_restarts
            )
            telemetria["passate_eseguite"] = 0
            telemetria.setdefault("tempo_per_passata_s", [])

        backtracking_result = self.backtracking.execute(
            objects,
            constraints,
            container_dim,
            tracker=tracker,
            compattazione_aggressiva=compattazione_aggressiva,
            deadline=deadline,
            telemetria=telemetria,
        )

        # Se il budget è già scaduto, restituisci subito il risultato v3
        # (senza alternative): non c'è tempo per un'altra esecuzione completa.
        if deadline is not None and time.monotonic() >= deadline:
            return backtracking_result

        # Monte Carlo viene eseguito SEMPRE: oltre a confrontarsi con v3,
        # produce le soluzioni alternative (top-N) da mostrare all'utente.
        # Anche quando v3 ha già piazzato tutto, esplorare ordini diversi
        # può trovare una disposizione più compatta (X minore) e genera le
        # alternative richieste dalla UI.

        monte_carlo_result = self.monte_carlo.execute(
            objects,
            constraints,
            container_dim,
            tracker=tracker,
            compattazione_aggressiva=compattazione_aggressiva,
            deadline=deadline,
            telemetria=telemetria,
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
