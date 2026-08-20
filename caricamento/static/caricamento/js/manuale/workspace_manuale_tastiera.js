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
 * Calcola la posizione snap+clamp di un gruppo spostato di (dx, dy, dz)
 * step di griglia, senza applicarla (funzione pura per il drag da tastiera).
 */
function _calcolaPosizioneTastiera(group, dx, dy, dz) {
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

    return snapped;
}

/**
 * Verifica se il blocco (gruppi selezionati) nelle posizioni date collide con
 * oggetti NON appartenenti al blocco (stesso criterio del drag a blocchi).
 */
function _bloccoCollideTastiera(groups, posizioni) {
    var altri = STATE.oggettiMesh.filter(function (o) {
        return groups.indexOf(o) === -1 && o.visible;
    });
    for (var i = 0; i < groups.length; i++) {
        var dim = _getTjsDimensions(groups[i]);
        for (var j = 0; j < altri.length; j++) {
            if (_aabbOverlap(dim, posizioni[i], _getTjsDimensions(altri[j]), altri[j].position)) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Muove l'oggetto selezionato — o l'intero blocco in caso di selezione
 * multipla — di (dx, dy, dz) step di griglia. Se anche un solo membro
 * collide con un oggetto non selezionato, il blocco non si muove.
 */
function _muoviOggettoTastiera(dx, dy, dz) {
    var groups = _manualeGruppiSelezionati();
    if (groups.length === 0) {
        if (!STATE.selectedObject) return;
        groups = [STATE.selectedObject];
    }

    var posizioni;
    if (groups.length > 1) {
        // Blocco: traslazione RIGIDA. Tutti i membri mantengono le posizioni
        // relative (quindi non possono mai sovrapporsi tra loro) e il delta
        // viene clampato per tenere l'intero blocco dentro il contenitore.
        // Senza questo, il clamp/snap indipendente per membro farebbe sì che
        // abbassando una pila il membro più basso si fermi sul pavimento
        // mentre quello sopra continua a scendere → si infila dentro.
        var ref = groups[0];
        var target = _calcolaPosizioneTastiera(ref, dx, dy, dz);
        var delta = new THREE.Vector3(
            target.x - ref.position.x,
            target.y - ref.position.y,
            target.z - ref.position.z
        );
        var startPositions = groups.map(function (g) { return g.position.clone(); });
        var deltaClamped = _manualeClampaDeltaAlContenitore(delta, startPositions, groups);
        posizioni = startPositions.map(function (p) {
            return new THREE.Vector3(p.x + deltaClamped.x, p.y + deltaClamped.y, p.z + deltaClamped.z);
        });
    } else {
        // Oggetto singolo: comportamento invariato
        posizioni = groups.map(function (g) { return _calcolaPosizioneTastiera(g, dx, dy, dz); });
    }

    if (_bloccoCollideTastiera(groups, posizioni)) {
        groups.forEach(function (g) { _flashOggetto(g, 0xff0000); });
        return;
    }

    groups.forEach(function (g, idx) { g.position.copy(posizioni[idx]); });
    _aggiornaInfoOggettoManuale(groups[0]);
    if (typeof WS !== 'undefined') WS._manualDragOccurred = true;
    if (typeof _registraModificaManuale === 'function') _registraModificaManuale();
    _refreshSidebarLineari();
}

// =============================================================================
// ROTAZIONE OGGETTO SELEZIONATO
// =============================================================================

/**
 * Ruota i gruppi dati (blocco o singolo) al loro orientamento successivo.
 * Con un blocco ogni membro ruota in place e la validità (collisioni +
 * contenitore) è valutata escludendo i membri del blocco stesso; se anche
 * un solo membro è invalido, l'intero blocco viene ripristinato.
 * Condivisa da tastiera (Ctrl+←/→) e mouse (Shift+click).
 */
function _ruotaGruppiTastiera(groups, isCW) {
    if (!groups || groups.length === 0) return;

    // Controlla se siamo in modalità eccentrica
    var isEccentricMode = (typeof IMPOSTAZIONI !== 'undefined' &&
        IMPOSTAZIONI.output_ottimizzazione &&
        IMPOSTAZIONI.output_ottimizzazione.modalita_rotazione === 'eccentrica');

    // Salva stato pre-rotazione per un eventuale revert completo del blocco
    var statiPre = groups.map(function (g) {
        return {
            group: g,
            dims: _getTjsDimensions(g),
            pos: g.position.clone(),
            orientamento: g.userData._orientamento || 'LxPxH',
            eccentricStep: g.userData._eccentricStep || 0
        };
    });

    // MODALITÀ UNIFORME per tutto il blocco: rotazione eccentrica solo se TUTTI
    // i membri possono ruotare eccentricamente; altrimenti l'intero blocco
    // ruota nel piano orizzontale senza spostarsi (fallback baricentrico
    // piatto). Così gli oggetti girano tutti nello stesso modo.
    var tuttiEccentrici = isEccentricMode && groups.every(function (g) {
        return typeof _puoRuotareEccentrico === 'function' && _puoRuotareEccentrico(g);
    });

    // Ruota ogni membro nella STESSA direzione: CW (isCW=true) o CCW (false).
    var ruotati = 0;
    groups.forEach(function (g) {
        var r;
        if (tuttiEccentrici) {
            r = _ruotaEccentrico(g, isCW);
        } else if (isEccentricMode) {
            r = _ruotaPiattoBaricentrico(g, isCW);
        } else {
            r = _ruotaAlProssimoOrientamento(g, isCW);
        }
        if (r) ruotati += 1;
    });
    if (ruotati === 0) {
        groups.forEach(function (g) { _flashOggetto(g, 0xff0000); });
        return;
    }

    // Validazione post-rotazione: fuori contenitore o collisione con oggetti
    // NON appartenenti al blocco (i membri selezionati non sono ostacoli).
    var altri = STATE.oggettiMesh.filter(function (o) {
        return groups.indexOf(o) === -1 && o.visible;
    });
    var invalido = false;
    for (var i = 0; i < groups.length && !invalido; i++) {
        var g = groups[i];
        var newDims = _getTjsDimensions(g);

        if (STATE.dati && STATE.dati.contenitore) {
            var cDim = STATE.dati.contenitore.dimensioni_cm;
            var halfX = newDims.x / 2, halfY = newDims.y / 2, halfZ = newDims.z / 2;
            if (g.position.x - halfX < 0 || g.position.x + halfX > cDim.x ||
                g.position.z - halfZ < 0 || g.position.z + halfZ > cDim.y ||
                g.position.y - halfY < 0 || g.position.y + halfY > cDim.z) {
                invalido = true;
            }
        }

        for (var j = 0; j < altri.length && !invalido; j++) {
            if (_aabbOverlap(newDims, g.position, _getTjsDimensions(altri[j]), altri[j].position)) {
                invalido = true;
            }
        }
    }

    if (invalido) {
        // Revert completo: ripristina dimensione, posizione e step eccentrico
        statiPre.forEach(function (s) {
            _ricostruisciMeshOrientamento(s.group, { label: s.orientamento, tjsDims: s.dims });
            s.group.position.copy(s.pos);
            s.group.userData._eccentricStep = s.eccentricStep;
            _flashOggetto(s.group, 0xff0000);
        });
        return;
    }

    groups.forEach(function (g) { _flashOggetto(g, 0x00ff00); });
    if (typeof WS !== 'undefined') WS._manualDragOccurred = true;
    if (typeof _registraModificaManuale === 'function') _registraModificaManuale();
    _refreshSidebarLineari();
    _aggiornaInfoOggettoManuale(groups[0]);
}

function _ruotaOggettoTastiera(isCW) {
    var groups = _manualeGruppiSelezionati();
    if (groups.length === 0) {
        if (!STATE.selectedObject) return;
        groups = [STATE.selectedObject];
    }
    _ruotaGruppiTastiera(groups, isCW);
}

/**
 * Snap alla griglia di tutti gli oggetti selezionati (o del singolo) e
 * deseleziona: conferma la posizione del blocco con Enter / D-pad ✓.
 */
function _snapEDeselezionaBlocco() {
    var groups = _manualeGruppiSelezionati();
    if (groups.length === 0) {
        if (!STATE.selectedObject) return;
        groups = [STATE.selectedObject];
    }
    groups.forEach(function (g) {
        var dim = _getTjsDimensions(g);
        var snapped = _snapPosition(g.position, dim);
        g.position.set(snapped.x, snapped.y, snapped.z);
    });
    _deselectObject();
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

    // M = toggle Selezione Rettangolare (non richiede oggetto selezionato)
    if (e.key === 'm' || e.key === 'M') {
        if (typeof _setMarqueeMode === 'function') {
            _setMarqueeMode(!_marqueeModeEnabled);
            showToast(_marqueeModeEnabled ? 'Selezione multipla: ON — click sx aggiunge, click dx seleziona colonna' : 'Selezione multipla: OFF', 'info');
        }
        return;
    }

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
            // Snap + deseleziona: oggetto (o blocco) confermato, focus rimosso
            _snapEDeselezionaBlocco();
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
            _snapEDeselezionaBlocco();
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
