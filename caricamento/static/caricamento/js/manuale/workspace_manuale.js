/**
 * Workspace Carico 3D — Modalità Manuale (Orchestratore)
 *
 * Gestisce lo stato ghost mode, il setup del drag interaction
 * e le variabili private condivise tra i moduli manuale.
 *
 * Dipende da: visualizzatore_3d_core.js (STATE), workspace_core.js (WS)
 *             workspace_manuale_snap.js, workspace_manuale_oggetti.js
 * Caricato DOPO i moduli snap/oggetti e PRIMA di workspace.js
 */

/**
 * Workspace Carico 3D — Modalità Manuale (Drag & Drop 3D + Rotazione)
 *
 * Gestisce il trascinamento degli oggetti nella scena 3D con raycaster
 * intelligente: cursore su oggetto = drag, cursore su vuoto = orbit.
 * Shift + drag = rotazione oggetto (4 step da 90°).
 *
 * Dipende da: visualizzatore_3d.js (STATE), workspace_core.js (WS)
 * Caricato DOPO visualizzatore_3d.js e PRIMA di workspace.js
 */

// =============================================================================
// VARIABILI PRIVATE
// =============================================================================

var _dragTjsPos = new THREE.Vector3();
var _fallbackOffsetCounter = 0;  // contatore per fallback incrementale
var _ghostIntersectVec = new THREE.Vector3();  // riutilizzabile per ghost pointermove
var _ghostModeEnabled = false;  // toggle Ghost ON/OFF nel pannello manuale



// =============================================================================
// GHOST MODE TOGGLE
// =============================================================================

function _setGhostMode(enabled) {
    _ghostModeEnabled = enabled;
    var btn = document.getElementById('manuale-btn-ghost-toggle');
    if (!btn) return;
    if (enabled) {
        btn.innerHTML = '<i class="bi bi-eye-slash"></i> Ghost: ON';
        btn.className = 'btn btn-sm btn-success';
    } else {
        btn.innerHTML = '<i class="bi bi-eye-slash"></i> Ghost: OFF';
        btn.className = 'btn btn-sm';
        // Se il ghost era attivo, annullalo
        if (_ghostState.active) _annullaGhost(true);
    }
}
var _ghostState = {
    active: false,
    group: null,          // THREE.Group del ghost
    wireframe: null,       // wireframe colorato (verde/rosso)
    oggetto: null,         // dati oggetto da WS
    dims: null,            // {x, y, z} TJS correnti
    orientamento: 'LxPxH', // label orientamento corrente
    orientamenti: [],      // [{label, tjsDims}]
    _ctrlDown: false,      // Ctrl premuto per movimento Z
    _prevClientY: 0,       // per calcolare delta Z
    _rawApiZ: 0,           // accumulatore float Z
    _plane: null,          // THREE.Plane per intersezione raycaster
    _eccentricStep: 0,     // step macchina a 4 stati per rotazione eccentrica
    _existingGroup: null,  // gruppo esistente in riposizionamento (ghost su oggetto in scena)
    _oldPosition: null,    // posizione originale prima del riposizionamento
};

function _isGhostActive() { return _ghostState.active; }
// =============================================================================
// GHOST: event wiring (funzioni in workspace_manuale_ghost.js)
// =============================================================================

/**
 * Crea il mesh ghost semi-trasparente (senza decal).
 */
function setupDragInteraction(container) {
    // Pulisci listener precedenti (evita memory leak su re-init scena)
    if (STATE._dragListeners) {
        var old = STATE._dragListeners;
        old.canvas.removeEventListener('pointerdown', old.onDown, true);
        document.removeEventListener('pointermove', old.onMove);
        document.removeEventListener('pointerup', old.onUp);
        document.removeEventListener('keydown', old.onKeyDown);
        document.removeEventListener('keyup', old.onKeyUp);
        old.canvas.removeEventListener('contextmenu', old.onContextMenu);
    }

    var canvas = STATE.renderer.domElement;

    function onKeyDown(e) {
        if (e.key === 'Control') STATE.dragState.ctrlDown = true;
    }
    function onKeyUp(e) {
        if (e.key === 'Control') STATE.dragState.ctrlDown = false;
    }

    // Previeni menu contestuale durante Shift+click in mod. eccentrica
    // e durante il ghost placement (tasto destro = annulla)
    function onContextMenu(e) {
        if (_ghostState.active) {
            e.preventDefault();
            return;
        }
        var isEccentricMode = (typeof IMPOSTAZIONI !== 'undefined' &&
            IMPOSTAZIONI.output_ottimizzazione &&
            IMPOSTAZIONI.output_ottimizzazione.modalita_rotazione === 'eccentrica');
        if (isEccentricMode && e.shiftKey) {
            e.preventDefault();
        }
    }

    // pointerdown in capture → intercetta prima di OrbitControls
    canvas.addEventListener('pointerdown', _onDragPointerDown, true);
    document.addEventListener('pointermove', _onDragPointerMove);
    document.addEventListener('pointerup', _onDragPointerUp);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('contextmenu', onContextMenu);

    // Tasto Delete/Canc: rimuovi oggetto selezionato (con guard anti-accumulo)
    if (!STATE._deleteKeyListenerAttached) {
        STATE._deleteKeyListenerAttached = true;
        document.addEventListener('keydown', function _onKeyDelete(e) {
            if (e.key === 'Delete' || e.key === 'Canc') {
                // Non intercettare se l'utente sta scrivendo in un input
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
                if (STATE.selectedObject) {
                    e.preventDefault();
                    _removeSelectedObject();
                }
            }
        });
    }

    // Bottone Rimuovi nel pannello manuale
    var btnRimuovi = document.getElementById('manuale-btn-rimuovi');
    if (btnRimuovi && !btnRimuovi._listenerAttached) {
        btnRimuovi._listenerAttached = true;
        btnRimuovi.addEventListener('click', function () {
            if (STATE.selectedObject) _removeSelectedObject();
        });
    }

    // Bottone Aggiungi nel pannello manuale
    var btnAggiungi = document.getElementById('manuale-btn-aggiungi');
    if (btnAggiungi && !btnAggiungi._listenerAttached) {
        btnAggiungi._listenerAttached = true;
        btnAggiungi.addEventListener('click', function () {
            _aggiungiOggettoDaPanel();
        });
    }

    // --- Ghost placement: listener globali (ri-attacca su ogni rebuild scena) ---
    if (STATE._ghostListenersAttached) {
        // Rimuovi vecchi listener dal canvas precedente e da document
        var oldCanvas = STATE._ghostCanvas;
        if (oldCanvas) oldCanvas.removeEventListener('pointermove', _onGhostPointerMove, true);
        document.removeEventListener('keydown', _onGhostKeyDown);
        document.removeEventListener('keyup', _onGhostKeyUp);
    }
    STATE._ghostListenersAttached = true;
    STATE._ghostCanvas = canvas;
    canvas.addEventListener('pointermove', _onGhostPointerMove, true);
    document.addEventListener('keydown', _onGhostKeyDown);
    document.addEventListener('keyup', _onGhostKeyUp);

    // Bottone Toggle Ghost nel pannello manuale
    var btnGhostToggle = document.getElementById('manuale-btn-ghost-toggle');
    if (btnGhostToggle && !btnGhostToggle._listenerAttached) {
        btnGhostToggle._listenerAttached = true;
        btnGhostToggle.addEventListener('click', function () {
            _setGhostMode(!_ghostModeEnabled);
        });
    }

    // Bottone Annulla Ghost nel pannello manuale
    var btnAnnullaGhost = document.getElementById('manuale-btn-annulla-ghost');
    if (btnAnnullaGhost && !btnAnnullaGhost._listenerAttached) {
        btnAnnullaGhost._listenerAttached = true;
        btnAnnullaGhost.addEventListener('click', function () {
            if (_ghostState.active) _annullaGhost(false);
        });
    }

    STATE._dragListeners = {
        canvas: canvas,
        onDown: _onDragPointerDown,
        onMove: _onDragPointerMove,
        onUp: _onDragPointerUp,
        onKeyDown: onKeyDown,
        onKeyUp: onKeyUp,
        onContextMenu: onContextMenu
    };
}
