"""Strategia deterministica basata su ``load_truck_v2``."""

from .base import PackingStrategy
from ..group_optimizer import optimize_deterministic_groups


class DeterministicStrategy(PackingStrategy):
    """Esegue un singolo passaggio del packer v2."""

    name = "deterministic"

    def execute(
        self,
        objects,
        constraints,
        container_dim,
        tracker=None,
        compattazione_aggressiva=False,
    ):
        return optimize_deterministic_groups(
            objects,
            constraints=constraints,
            container_dim=container_dim,
            tracker=tracker,
            compattazione_aggressiva=compattazione_aggressiva,
        )
