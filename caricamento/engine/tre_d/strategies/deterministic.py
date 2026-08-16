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
        deadline=None,
    ):
        # Singolo passaggio: il deadline non è necessario qui (stage 0 è
        # già veloce), ma il parametro mantiene l'interfaccia uniforme.
        return optimize_deterministic_groups(
            objects,
            constraints=constraints,
            container_dim=container_dim,
            tracker=tracker,
            compattazione_aggressiva=compattazione_aggressiva,
        )
