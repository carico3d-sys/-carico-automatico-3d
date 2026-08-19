"""Costanti condivise del motore di packing 3D.

Modulo senza dipendenze interne: può essere importato da ``packer_3d_v2``,
``random_packer``, ``optimizer_v3`` e dal pacchetto ``strategies`` senza
creare import circolari.
"""

# NOTA: questi budget NON vengono più applicati come taglio per tempo.
# Il motore gira fino alla risposta definitiva (deadline=None): un risultato
# parziale può dipendere solo dalla geometria, mai dal tempo trascorso.
# I valori restano solo come default retrocompatibili del parametro
# ``budget_seconds`` (ignorato dal motore) e la sicurezza anti-patologico è
# affidata al timeout del worker Django Q2 (``Q_CLUSTER.timeout``, 300s), che
# opera sul processo e non sulla soluzione.
OPTIMIZATION_TIME_BUDGET_SECONDS = 17.0

# Budget più ampio usato dal percorso asincrono (coda Django Q2).
# Mantenuto per retrocompatibilità; non taglia l'esecuzione (vedi sopra).
OPTIMIZATION_TIME_BUDGET_ASYNC_SECONDS = 90.0

# Numero di passate consecutive senza miglioramento dello score dopo le quali
# una strategia si ferma (early-stop): evita di consumare vCPU su restart che
# non producono soluzioni migliori (es. un solo tipo = shuffle no-op).
EARLY_STOP_STALL = 2

# Soglia piu' alta usata dal loop dei restart Monte Carlo. Serve a raccogliere
# piu' soluzioni distinte (le alternative mostrate nella UI): con 2 il loop si
# ferma quasi subito e produce 1-2 soluzioni, con 6 esplora piu' ordini di
# carico prima di dichiarare convergenza. Non tocca il V3 (che usa
# EARLY_STOP_STALL) per non cambiare il comportamento di convergenza.
EARLY_STOP_STALL_MC = 6

# Deduplica delle soluzioni alternative: se True, due layout sono la "stessa"
# alternativa solo se piazzano gli stessi tipi nelle stesse posizioni con le
# stesse dimensioni (disposizione reale). Se False, la deduplica avviene per
# punteggio (posizioni diverse con lo stesso score collassano in una sola).
# True mostra piu' alternative distinte.
DEDUP_ALTERNATIVE_PER_POSIZIONI = True


# ---------------------------------------------------------------------------
# Spatial indexing (uniform grid)
# ---------------------------------------------------------------------------
# L'indice spaziale e' un FILTRO DI CANDIDATI per le query geometriche del
# packer (collisione, supporto, pesi sopra): non cambia nessuna regola di
# carico e restituisce risultati bit-identici (verificati con parity test).

# Dimensione della cella (cm) per l'uniform grid del volume. 50 cm e' un buon
# compromesso per contenitori ~13.6 m con oggetti ~50 cm: ogni oggetto occupa
# 1-4 celle e le query toccano poche celle.
SPATIAL_GRID_CELL_SIZE = 50.0

# Epsilon condivisa per le coincidenze di quota Z. Deve restare la stessa usata
# nel codice di stacking (0.001 cm), altrimenti le coincidenze z_top verrebbero
# perse dall'indice.
SPATIAL_GRID_EPS_Z = 0.001

# Attiva l'uniform grid nel motore. In produzione resta True; negli early test
# viene impostata a False per generare la baseline del parity test.
SPATIAL_GRID_ENABLED = True

# Soglia minima di oggetti piazzati oltre la quale le query usano la griglia.
# Sotto questa soglia la scansione lineare costa meno della manutenzione
# dell'indice.
SPATIAL_GRID_THRESHOLD = 40
