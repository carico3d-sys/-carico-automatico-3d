"""Factory delle strategie automatiche."""

from .backtracking import BacktrackingStrategy
from .deterministic import DeterministicStrategy
from .hybrid import HybridStrategy
from .monte_carlo import MonteCarloStrategy


# Cinque restart sono sufficienti per carichi piccoli, ma nel piano reale
# lasciano spesso l'ultima istanza in una fascia X troppo avanzata. Venti
# restart trovano più frequentemente una disposizione che completa Y/Z
# prima di aprire una nuova fascia X, mantenendo invariato il punteggio.
MONTE_CARLO_RESTARTS = 20


def strategy_for_config(config):
    """Restituisce la strategia corrispondente alla configurazione.

    La precedenza e il comportamento sono gli stessi del precedente blocco
    condizionale in ``TreDPacker``:

    - casuale + backtracking -> ibrida v3 + Monte Carlo;
    - casuale -> Monte Carlo;
    - backtracking -> v3;
    - altrimenti -> deterministica v2.
    """
    random_enabled = bool(getattr(config, "ordinamento_casuale", False))
    backtracking_enabled = bool(
        getattr(config, "backtracking_avanzato", False)
    )

    if random_enabled and backtracking_enabled:
        return HybridStrategy(iterations=7, num_restarts=MONTE_CARLO_RESTARTS)
    if random_enabled:
        return MonteCarloStrategy(num_restarts=MONTE_CARLO_RESTARTS)
    if backtracking_enabled:
        return BacktrackingStrategy(iterations=7)
    return DeterministicStrategy()
