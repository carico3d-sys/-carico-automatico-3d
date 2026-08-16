"""Strategie automatiche di packing 3D."""

from .base import PackingStrategy
from .backtracking import BacktrackingStrategy
from .deterministic import DeterministicStrategy
from .factory import strategy_for_config
from .monte_carlo import MonteCarloStrategy
from .hybrid import HybridStrategy

# Budget di tempo per una singola ottimizzazione. Garantisce il rientro entro
# il timeout di 20s del browser (``_apiFetch`` in workspace_core.js), lasciando
# margine per la serializzazione della risposta HTTP. Le strategie controllano
# la scadenza tra un restart/iterazione e il successivo e restituiscono la
# soluzione migliore trovata finora.
OPTIMIZATION_TIME_BUDGET_SECONDS = 17.0

__all__ = [
    "PackingStrategy",
    "DeterministicStrategy",
    "MonteCarloStrategy",
    "BacktrackingStrategy",
    "HybridStrategy",
    "strategy_for_config",
    "OPTIMIZATION_TIME_BUDGET_SECONDS",
]
