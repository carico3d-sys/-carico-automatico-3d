"""Strategie automatiche di packing 3D."""

from ..constants import (
    EARLY_STOP_STALL,
    OPTIMIZATION_TIME_BUDGET_ASYNC_SECONDS,
    OPTIMIZATION_TIME_BUDGET_SECONDS,
)

from .base import PackingStrategy
from .backtracking import BacktrackingStrategy
from .deterministic import DeterministicStrategy
from .factory import strategy_for_config
from .monte_carlo import MonteCarloStrategy
from .hybrid import HybridStrategy

__all__ = [
    "PackingStrategy",
    "DeterministicStrategy",
    "MonteCarloStrategy",
    "BacktrackingStrategy",
    "HybridStrategy",
    "strategy_for_config",
    "OPTIMIZATION_TIME_BUDGET_SECONDS",
    "OPTIMIZATION_TIME_BUDGET_ASYNC_SECONDS",
    "EARLY_STOP_STALL",
]
