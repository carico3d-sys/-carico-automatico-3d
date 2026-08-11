/**
 * Workspace Carico 3D — Navigazione da Tastiera & D-Pad (Modalità Manuale)
 *
 * Aggiunge supporto per:
 * - Tasti freccia (←→↑↓): spostamento oggetto selezionato sul piano XZ
 * - PgUp / PgDn: spostamento verticale (asse Y Three.js)
 * - Ctrl+←→: rotazione 90° (CW / CCW)
 * - Ctrl+↑↓: spostamento verticale (alternativa a PgUp/PgDn)
 * - D-Pad a schermo nella barra laterale sinistra (tab Manuale)
 *
 * Dipende da: workspace_manuale.js (_selectObject, _deselectObject, _getTjsDimensions,
 *              _snapPosition, _checkCollisionWithOthers, _aggiornaInfoOggettoManuale,
 *              _flashOggetto, STATE)
 *             workspace_manuale_drag.js (_calcolaOrientamentiValidi, _ricostruisciMeshOrientamento,
 *              _ruotaAlProssimoOrientamento)
 *
 * Caricato DOPO workspace_manuale_drag.js
 */

// =============================================================================
// MOVIMENTO OGGETTO SELEZIONATO
// =============================================================================

/**
 * Muove l'oggetto selezionato di (dx, dy, dz) step di griglia.
 * @param {number} dx - step in X (lunghezza Three.js, positivo = destra)
 * @param {number} dy - step in Y (altezza Three.js, positivo = su)
 * @param {number} dz - step in Z (larghezza Three.js, positivo = avanti)
 */
function _muoviOggettoTastiera(dx, dy, dz) {
    var group = STATE.selectedObject;
    if (!group) return;

    var step = STATE.snapStepCm;
    var dimCm = _getTjsDimensions(group);
    var newPos = group.position.clone();

    newPos.x += dx * step;
    newPos.y += dy * step;
    newPos.z += dz * step;

    // Clamp ai limiti del contenitore
    if (STATE.dati && STATE.dati.contenitore) {
        var cDim = STATE.dati.contenitore.dimensioni_cm;
        var halfX = dimCm.x / 2;
        var halfY = dimCm.y / 2;
        var halfZ = dimCm.z / 2;
        newPos.x = Math.max(halfX, Math.min(cDim.x - halfX, newPos.x));
        newPos.z = Math.max(halfZ, Math.min(cDim.y - halfZ, newPos.z));
        newPos.y = Math.max(halfY, Math.min(cDim.z - halfY, newPos.y));
    }

    // Snap alla griglia
    var snapped = _snapPosition(newPos, dimCm);

    // Re-clamp dopo snap (come fa il drag handler) — lo snap può sforare di step/2
    if (STATE.dati && STATE.dati.contenitore) {
        var cDim2 = STATE.dati.contenitore.dimensioni_cm;
        snapped.x = Math.max(dimCm.x / 2, Math.min(cDim2.x - dimCm.x / 2, snapped.x));
        snapped.z = Math.max(dimCm.z / 2, Math.min(cDim2.y - dimCm.z / 2, snapped.z));
        snapped.y = Math.max(dimCm.y / 2, Math.min(cDim2.z - dimCm.y / 2, snapped.y));
    }

    // Controlla collisioni
    if (_checkCollisionWithOthers(group, snapped, dimCm)) {
        _flashOggetto(group, 0xff0000);
        return;
    }

    group.position.set(snapped.x, snapped.y, snapped.z);
    _aggiornaInfoOggettoManuale(group);
    if (typeof WS !== 'undefined') WS._manualDragOccurred = true;
    _refreshSidebarLineari();
}

// =============================================================================
// ROTAZIONE OGGETTO SELEZIONATO
// =============================================================================

function _ruotaOggettoTastiera(isCW) {
    var group = STATE.selectedObject;
    if (!group) return;

    var oldDims = _getTjsDimensions(group);
    var oldPos = group.position.clone();
    var oldOrientamento = group.userData._orientamento || 'LxPxH';
    var oldEccentricStep = group.userData._eccentricStep || 0;

    // Controlla se siamo in modalità eccentrica
    var isEccentricMode = (typeof IMPOSTAZIONI !== 'undefined' &&
        IMPOSTAZIONI.output_ottimizzazione &&
        IMPOSTAZIONI.output_ottimizzazione.modalita_rotazione === 'eccentrica');

    var ruotato;
    if (isEccentricMode) {
        ruotato = _ruotaEccentrico(group, isCW);
    } else {
        ruotato = _ruotaAlProssimoOrientamento(group);
    }

    if (ruotato) {
        var newDims = _getTjsDimensions(group);
        var collision = _checkCollisionWithOthers(group, group.position, newDims);

        // Controlla anche che l'oggetto non esca dai bordi del contenitore
        var fuoriContenitore = false;
        if (!collision && STATE.dati && STATE.dati.contenitore) {
            var cDim = STATE.dati.contenitore.dimensioni_cm;
            var halfX = newDims.x / 2, halfY = newDims.y / 2, halfZ = newDims.z / 2;
            if (group.position.x - halfX < 0 || group.position.x + halfX > cDim.x ||
                group.position.z - halfZ < 0 || group.position.z + halfZ > cDim.y ||
                group.position.y - halfY < 0 || group.position.y + halfY > cDim.z) {
                fuoriContenitore = true;
            }
        }

        if (collision || fuoriContenitore) {
            // Revert
            _ricostruisciMeshOrientamento(group, { label: oldOrientamento, tjsDims: oldDims });
            group.position.copy(oldPos);
            group.userData._eccentricStep = oldEccentricStep;
            _flashOggetto(group, 0xff0000);
        } else {
            _flashOggetto(group, 0x00ff00);
            if (typeof WS !== 'undefined') WS._manualDragOccurred = true;
            _refreshSidebarLineari();
        }
        _aggiornaInfoOggettoManuale(group);
    } else {
        _flashOggetto(group, 0xff0000);
    }
}

// =============================================================================
// HANDLER TASTIERA FISICA
// =============================================================================

function _onTastieraManualeKeyDown(e) {
    // Solo in modalità manuale e con scena attiva
    if (typeof WS === 'undefined' || !WS.manualMode) return;
    if (!STATE.scene) return;

    // Non intercettare i campi testuali né le altre combo. La select dello
    // snap è l'unica eccezione: con un oggetto selezionato, le frecce devono
    // muoverlo anche se il controllo conserva il focus dopo la scelta.
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.target.tagName === 'SELECT' && e.target.id !== 'manuale-snap-step') return;

    // Non interferire se il ghost è attivo
    if (_ghostState && _ghostState.active) return;

    // Enter senza oggetto selezionato: lascia passare (es. per attivare bottone col focus)
    if (e.key === 'Enter' && !STATE.selectedObject) return;

    // Tutti gli altri tasti richiedono un oggetto selezionato in 3D
    if (!STATE.selectedObject) return;

    // Ctrl+freccia: operazioni verticali e rotazione
    if (e.ctrlKey) {
        switch (e.key) {
            case 'ArrowLeft':
                e.preventDefault();
                _ruotaOggettoTastiera(false);  // CCW
                return;
            case 'ArrowRight':
                e.preventDefault();
                _ruotaOggettoTastiera(true);   // CW
                return;
            case 'ArrowUp':
                e.preventDefault();
                _muoviOggettoTastiera(0, 1, 0);  // alza (Y+)
                return;
            case 'ArrowDown':
                e.preventDefault();
                _muoviOggettoTastiera(0, -1, 0); // abbassa (Y-)
                return;
        }
        return;
    }

    // Frecce semplici: movimento XZ
    switch (e.key) {
        case 'ArrowLeft':
            e.preventDefault();
            _muoviOggettoTastiera(-1, 0, 0);
            break;
        case 'ArrowRight':
            e.preventDefault();
            _muoviOggettoTastiera(1, 0, 0);
            break;
        case 'ArrowUp':
            e.preventDefault();
            _muoviOggettoTastiera(0, 0, -1);
            break;
        case 'ArrowDown':
            e.preventDefault();
            _muoviOggettoTastiera(0, 0, 1);
            break;
        case 'PageUp':
            e.preventDefault();
            _muoviOggettoTastiera(0, 1, 0);
            break;
        case 'PageDown':
            e.preventDefault();
            _muoviOggettoTastiera(0, -1, 0);
            break;
        case 'Enter':
            // Se il focus e' sul bottone Aggiungi, lascia che Enter lo clicchi
            var btnAdd = document.getElementById('manuale-btn-aggiungi');
            if (document.activeElement === btnAdd) break;
            e.preventDefault();
            // Snap + deseleziona: oggetto confermato, focus rimosso
            var dimCm = _getTjsDimensions(STATE.selectedObject);
            var snapped = _snapPosition(STATE.selectedObject.position, dimCm);
            STATE.selectedObject.position.set(snapped.x, snapped.y, snapped.z);
            _deselectObject();
            break;
    }
}

// =============================================================================
// D-PAD BUTTON HANDLERS (pannello a schermo)
// =============================================================================

function _setupDPadButtons() {
    // Mappa id bottone → [dx, dy, dz] in step griglia
    var map = {
        'dpad-up':    { dx:  0, dy:  0, dz: -1 },
        'dpad-down':  { dx:  0, dy:  0, dz:  1 },
        'dpad-left':  { dx: -1, dy:  0, dz:  0 },
        'dpad-right': { dx:  1, dy:  0, dz:  0 },
    };

    Object.keys(map).forEach(function (id) {
        var btn = document.getElementById('manuale-' + id);
        if (!btn) return;
        btn.addEventListener('click', function () {
            var m = map[id];
            _muoviOggettoTastiera(m.dx, m.dy, m.dz);
        });
    });

    // Bottone Conferma (✓) al centro del D-pad
    var btnConfirm = document.getElementById('manuale-dpad-confirm');
    if (btnConfirm) {
        btnConfirm.addEventListener('click', function () {
            if (STATE.selectedObject) {
                var dimCm = _getTjsDimensions(STATE.selectedObject);
                var snapped = _snapPosition(STATE.selectedObject.position, dimCm);
                STATE.selectedObject.position.set(snapped.x, snapped.y, snapped.z);
                _deselectObject();
            }
        });
    }

    // Bottone Aggiungi alla scena — garanzia listener sempre attivo
    // (setupDragInteraction potrebbe averlo già attaccato, usiamo lo stesso flag)
    var btnAggiungi = document.getElementById('manuale-btn-aggiungi');
    if (btnAggiungi && !btnAggiungi._listenerAttached) {
        btnAggiungi._listenerAttached = true;
        btnAggiungi.addEventListener('click', function () {
            if (typeof _aggiungiOggettoDaPanel === 'function') {
                _aggiungiOggettoDaPanel();
            }
        });
    }
}

// =============================================================================
// INIZIALIZZAZIONE
// =============================================================================

// Registra handler tastiera fisica
document.addEventListener('keydown', _onTastieraManualeKeyDown);

// Setup D-Pad dopo che il DOM è pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _setupDPadButtons);
} else {
    _setupDPadButtons();
}
