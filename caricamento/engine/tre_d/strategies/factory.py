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
V3_ITERATIONS = 7


def _caps_per_ops(ops):
    """Restituisce (restart_mc, iterazioni_v3) in base al conteggio operazioni.

    ``ops`` = somma di (quantità × orientamenti) di tutti gli oggetti del piano.
    Carichi grandi eseguono poche passate: una singola passata su molte
    istanze è già costosa e il tempo residuo serve più a completare il carico
    che a esplorare ordini alternativi.
    """
    if ops is None:
        return MONTE_CARLO_RESTARTS, V3_ITERATIONS
    if ops <= 200:
        return 20, 7
    if ops <= 1000:
        return 10, 4
    if ops <= 3000:
        return 4, 2
    return 1, 1


def strategy_for_config(config, ops=None):
    """Restituisce la strategia corrispondente alla configurazione.

    La precedenza e il comportamento sono gli stessi del precedente blocco
    condizionale in ``TreDPacker``:

    - casuale + backtracking -> ibrida v3 + Monte Carlo;
    - casuale -> Monte Carlo;
    - backtracking -> v3;
    - altrimenti -> deterministica v2.

    Il numero di restart/iterazioni è dimensionato su ``ops`` (tentativi
    adattivi): i carichi pesanti esplorano meno, quelli leggeri di più.
    """
    random_enabled = bool(getattr(config, "ordinamento_casuale", False))
    backtracking_enabled = bool(
        getattr(config, "backtracking_avanzato", False)
    )
    mc_restarts, v3_iterations = _caps_per_ops(ops)

    if random_enabled and backtracking_enabled:
        return HybridStrategy(iterations=v3_iterations, num_restarts=mc_restarts)
    if random_enabled:
        return MonteCarloStrategy(num_restarts=mc_restarts)
    if backtracking_enabled:
        return BacktrackingStrategy(iterations=v3_iterations)
    return DeterministicStrategy()
