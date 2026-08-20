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
var _marqueeModeEnabled = false;  // toggle Selezione Multipla ON/OFF

// =============================================================================
// CRONOLOGIA UNDO — MODALITÀ MANUALE
// =============================================================================

function _manualeSnapshotCorrente() {
    if (typeof STATE === 'undefined' || !STATE.scene || !Array.isArray(STATE.oggettiMesh)) return null;

    var oggetti = STATE.oggettiMesh.filter(function (group) {
        return group && group.parent && group.userData && group.position;
    }).map(function (group) {
        var ud = group.userData || {};
        var dim = typeof _getTjsDimensions === 'function'
            ? _getTjsDimensions(group)
            : (ud._tjsDimCm || { x: 0, y: 0, z: 0 });
        var anagrafica = typeof trovaOggettoPerCodice === 'function'
            ? trovaOggettoPerCodice(ud.codice)
            : null;
        return {
            oggetto_id: anagrafica ? anagrafica.id : null,
            codice: String(ud.codice || ''),
            descrizione: ud.descrizione || (anagrafica && anagrafica.descrizione) || '',
            peso: Number(ud.peso || (anagrafica && anagrafica.peso_kg) || 0),
            colore: ud.colore || (anagrafica && coloreOggetto(anagrafica)) || '#447e9b',
            posizione: {
                x: Number(group.position.x),
                y: Number(group.position.y),
                z: Number(group.position.z),
            },
            dimensioni: {
                x: Number(dim.x),
                y: Number(dim.y),
                z: Number(dim.z),
            },
            orientamento: ud._orientamento || ud.rotazione || 'LxPxH',
            eccentricStep: Number(ud._eccentricStep || 0),
            riga_id: ud.riga_id || null,
            riga_key: ud.riga_key || null,
        };
    });

    var pannello = [];
    if (typeof DOM !== 'undefined' && DOM.panelItemsList) {
        DOM.panelItemsList.querySelectorAll('.panel-item').forEach(function (item) {
            pannello.push({
                oggetto_id: item.dataset.oggettoId || '',
                codice: item.dataset.codice || '',
                quantita: parseInt(item.querySelector('.panel-qty-input')?.value, 10) || 0,
                qtyOriginale: item.dataset.qtyOriginale || '',
                priorita: item.dataset.priorita || '0',
                colore: item.dataset.colore || '',
                coloreCustom: item.dataset.coloreCustom === '1' ? '1' : '',
                riga_id: item.dataset.rigaId || null,
                riga_key: item.dataset.rigaKey || null,
            });
        });
    }
    // Una riga a quantità zero è in fase di rimozione e non rappresenta più
    // un oggetto richiesto nel carico manuale.
    pannello = pannello.filter(function (item) { return item.quantita > 0; });
    return { oggetti: oggetti, pannello: pannello };
}

function _aggiornaUndoManualeUI() {
    var btn = document.getElementById('manuale-btn-annulla-ghost');
    if (!btn || typeof WS === 'undefined') return;
    var ghostAttivo = typeof _ghostState !== 'undefined' && _ghostState.active;
    var disponibile = ghostAttivo || (Array.isArray(WS._manualUndoStack) && WS._manualUndoStack.length > 1);
    // Il bottone può essere configurato con layout colonna (icona sopra,
    // testo sotto). `block` annullerebbe il flex-direction impostato da
    // Gestione Icone; quando è visibile deve restare un flex container.
    btn.style.display = WS.manualMode ? 'flex' : 'none';
    btn.disabled = !disponibile;
    btn.title = ghostAttivo
        ? 'Annulla il piazzamento corrente'
        : 'Annulla ultima modifica manuale';
    btn.setAttribute('aria-label', btn.title);
    // La Gestione Icone può personalizzare la scritta di questo bottone.
    // Mantieni il testo configurato anche quando cambia lo stato runtime;
    // prima questa funzione lo sostituiva sempre con il valore predefinito.
    var cfgAnnulla = (typeof BOTTONI_CONFIG !== 'undefined' && BOTTONI_CONFIG)
        ? BOTTONI_CONFIG['man-annulla'] : null;
    var testoConfigurato = cfgAnnulla && cfgAnnulla.label
        ? String(cfgAnnulla.label).trim()
        : '';
    var testo = ' ' + (testoConfigurato ||
        (ghostAttivo ? 'Annulla piazzamento' : 'Annulla ultima modifica'));
    var nodiTesto = Array.prototype.slice.call(btn.childNodes).filter(function (node) {
        return node.nodeType === 3;
    });
    if (nodiTesto.length > 0) {
        nodiTesto[nodiTesto.length - 1].nodeValue = testo;
    } else {
        btn.appendChild(document.createTextNode(testo));
    }
}

function _reimpostaCronologiaManuale() {
    if (typeof WS === 'undefined' || typeof STATE === 'undefined' || !STATE.scene) return;
    var snapshot = _manualeSnapshotCorrente();
    WS._manualUndoScene = STATE.scene;
    WS._manualUndoStack = snapshot ? [snapshot] : [];
    WS._manualUndoRestoring = false;
    _aggiornaUndoManualeUI();
}

function _inizializzaCronologiaManuale() {
    if (typeof WS === 'undefined' || typeof STATE === 'undefined' || !STATE.scene) return;
    if (WS._manualUndoScene === STATE.scene && Array.isArray(WS._manualUndoStack) && WS._manualUndoStack.length > 0) {
        _aggiornaUndoManualeUI();
        return;
    }
    var snapshot = _manualeSnapshotCorrente();
    WS._manualUndoScene = STATE.scene;
    WS._manualUndoStack = snapshot ? [snapshot] : [];
    WS._manualUndoRestoring = false;
    _aggiornaUndoManualeUI();
}

function _registraModificaManuale() {
    if (typeof WS === 'undefined' || !WS.manualMode || WS._manualUndoRestoring) return;
    _inizializzaCronologiaManuale();
    var snapshot = _manualeSnapshotCorrente();
    if (!snapshot) return;
    var stack = WS._manualUndoStack;
    if (stack.length > 0 && JSON.stringify(stack[stack.length - 1]) === JSON.stringify(snapshot)) return;
    stack.push(snapshot);
    // Evita una crescita illimitata mantenendo comunque una cronologia ampia.
    if (stack.length > 51) stack.splice(1, stack.length - 51);
    _aggiornaUndoManualeUI();
}

function _disposeGruppoManuale(group) {
    if (!group || typeof group.traverse !== 'function') return;
    group.traverse(function (child) {
        if (child.geometry && typeof child.geometry.dispose === 'function') child.geometry.dispose();
        if (child.material) {
            var materiali = Array.isArray(child.material) ? child.material : [child.material];
            materiali.forEach(function (materiale) {
                if (materiale.map && typeof materiale.map.dispose === 'function') materiale.map.dispose();
                if (typeof materiale.dispose === 'function') materiale.dispose();
            });
        }
    });
}

function _ripristinaPannelloDaSnapshot(snapshot) {
    if (typeof DOM === 'undefined' || !DOM.panelItemsList) return;
    var desiderati = snapshot.pannello || [];
    var desideratiKey = {};

    DOM.panelItemsList.querySelectorAll('.panel-item').forEach(function (item) {
        if (item._panelRemovalTimer) {
            clearTimeout(item._panelRemovalTimer);
            item._panelRemovalTimer = null;
            item.style.opacity = '';
            item.style.transition = '';
        }
        var keep = desiderati.some(function (d) {
            if (d.riga_key && item.dataset.rigaKey === String(d.riga_key)) return true;
            if (d.riga_id && item.dataset.rigaId === String(d.riga_id)) return true;
            return String(d.oggetto_id) === String(item.dataset.oggettoId) &&
                (!d.riga_id || !item.dataset.rigaId);
        });
        if (!keep) item.remove();
    });

    desiderati.forEach(function (dati) {
        var item = Array.prototype.slice.call(DOM.panelItemsList.querySelectorAll('.panel-item')).find(function (row) {
            if (dati.riga_key && row.dataset.rigaKey === String(dati.riga_key)) return true;
            if (dati.riga_id && row.dataset.rigaId === String(dati.riga_id)) return true;
            return !dati.riga_id && !dati.riga_key && (
                (dati.oggetto_id && row.dataset.oggettoId === String(dati.oggetto_id)) ||
                (dati.codice && row.dataset.codice === dati.codice)
            );
        });
        if (!item && typeof trovaOggetto === 'function') {
            var oggetto = dati.oggetto_id ? trovaOggetto(parseInt(dati.oggetto_id, 10)) : trovaOggettoPerCodice(dati.codice);
            if (oggetto && typeof aggiungiAlCarico === 'function') {
                item = aggiungiAlCarico(oggetto.id, dati.quantita, true, dati.qtyOriginale || undefined, dati.riga_id || undefined, dati.colore || undefined);
            }
        }
        if (!item) return;
        if (dati.riga_id) item.dataset.rigaId = String(dati.riga_id);
        if (dati.riga_key) item.dataset.rigaKey = String(dati.riga_key);
        if (dati.colore) {
            item.dataset.colore = dati.colore;
            item.dataset.coloreAuto = '';
            item.dataset.coloreCustom = dati.coloreCustom === '1' ? '1' : '';
        }
        var qty = item.querySelector('.panel-qty-input');
        if (qty) {
            qty.value = dati.quantita;
            qty.min = '0';
        }
        item.dataset.priorita = dati.priorita || '0';
        var richiesta = dati.qtyOriginale || dati.quantita;
        item.dataset.qtyOriginale = String(richiesta);
        var badge = item.querySelector('.panel-qty-originale');
        if (badge) {
            badge.textContent = richiesta;
            badge.title = 'Quantità richiesta: ' + richiesta;
        }
        var prio = item.querySelector('.panel-prio-input');
        if (prio) prio.value = dati.priorita || '0';
    });

    // Riassegna colori per i codici duplicati rimasti senza personalizzazione.
    if (typeof _assegnaColoriAutomatici === 'function') _assegnaColoriAutomatici();

    var vuoto = DOM.panelItemsList.children.length === 0;
    var panelHeader = document.getElementById('panel-items-header');
    if (panelHeader) panelHeader.style.display = vuoto ? 'none' : 'flex';
    if (DOM.panelEmpty) DOM.panelEmpty.style.display = vuoto ? 'flex' : 'none';
    if (typeof aggiornaRiepilogoPanel === 'function') aggiornaRiepilogoPanel();
    if (typeof aggiornaStatoPulsante === 'function') aggiornaStatoPulsante();
}

function _ripristinaSnapshotManuale(snapshot) {
    if (!snapshot || typeof STATE === 'undefined' || !STATE.scene) return;
    WS._manualUndoRestoring = true;
    try {
        if (typeof _deselectObject === 'function') _deselectObject(true);
        STATE.selectedObject = null;
        var infoEl = document.getElementById('manuale-oggetto-info');
        if (infoEl) infoEl.style.display = 'none';
        var btnRimuovi = document.getElementById('manuale-btn-rimuovi');
        if (btnRimuovi) btnRimuovi.disabled = true;
        if (STATE.dragState) {
            STATE.dragState.active = false;
            STATE.dragState.object = null;
        }
        STATE.oggettiMesh.forEach(function (group) {
            if (group.parent) group.parent.remove(group);
            _disposeGruppoManuale(group);
        });
        STATE.oggettiMesh = [];

        (snapshot.oggetti || []).forEach(function (dati) {
            var item = typeof trovaOggettoPerCodice === 'function' ? trovaOggettoPerCodice(dati.codice) : null;
            var colore = dati.colore || (item ? coloreOggetto(item) : '#447e9b');
            var nuovo = _creaMeshSingolo(
                dati.dimensioni,
                new THREE.Vector3(dati.posizione.x, dati.posizione.y, dati.posizione.z),
                dati.codice,
                colore,
                dati.descrizione || (item && item.descrizione) || '',
                dati.peso || (item && item.peso_kg) || 0
            );
            nuovo.userData._orientamento = dati.orientamento || 'LxPxH';
            nuovo.userData.rotazione = dati.orientamento || 'LxPxH';
            nuovo.userData._eccentricStep = dati.eccentricStep || 0;
            nuovo.userData.oggetto_id = dati.oggetto_id || (item && item.id) || null;
            nuovo.userData.riga_id = dati.riga_id || null;
            nuovo.userData.riga_key = dati.riga_key || null;
            STATE.scene.add(nuovo);
            STATE.oggettiMesh.push(nuovo);
        });

        _ripristinaPannelloDaSnapshot(snapshot);
        if (typeof _aggiornaSliderCarico === 'function') _aggiornaSliderCarico();
        if (typeof aggiornaGraficoPesiInTempoReale === 'function') aggiornaGraficoPesiInTempoReale();
        if (typeof _refreshSidebarLineari === 'function') _refreshSidebarLineari();
        if (STATE.dati) {
            STATE.dati.oggetti = (snapshot.oggetti || []).map(function (dati) {
                return {
                    codice: dati.codice,
                    descrizione: dati.descrizione || '',
                    posizione_cm: {
                        x: Math.max(0, dati.posizione.x - dati.dimensioni.x / 2),
                        y: Math.max(0, dati.posizione.z - dati.dimensioni.z / 2),
                        z: Math.max(0, dati.posizione.y - dati.dimensioni.y / 2),
                    },
                    dimensioni_cm: {
                        x: dati.dimensioni.x,
                        y: dati.dimensioni.z,
                        z: dati.dimensioni.y,
                    },
                    peso_kg: dati.peso || 0,
                    peso_sopra_kg: 0,
                    colore: dati.colore || '#447e9b',
                    rotazione: typeof _normalizzaRotazionePerApi === 'function'
                        ? _normalizzaRotazionePerApi(dati.orientamento || 'XYZ')
                        : (dati.orientamento || 'XYZ'),
                };
            });
        }
        if (typeof WS !== 'undefined') WS._manualDragOccurred = true;
    } finally {
        WS._manualUndoRestoring = false;
        _aggiornaUndoManualeUI();
    }
}

function _annullaUltimaModificaManuale() {
    if (typeof WS === 'undefined') return;
    if (typeof _ghostState !== 'undefined' && _ghostState.active) {
        _annullaGhost(false);
        return;
    }
    _inizializzaCronologiaManuale();
    if (!WS._manualUndoStack || WS._manualUndoStack.length <= 1) return;
    // Lo stato corrente è l'ultimo elemento: rimuovilo e ripristina il precedente.
    WS._manualUndoStack.pop();
    var precedente = WS._manualUndoStack[WS._manualUndoStack.length - 1];
    _ripristinaSnapshotManuale(precedente);
    showToast('↩️ Ultima modifica manuale annullata.', 'info');
}


// =============================================================================
// GHOST MODE TOGGLE
// =============================================================================

/**
 * Aggiorna solo la rappresentazione del toggle, senza confondere la modalità
 * Ghost (_ghostModeEnabled) con un piazzamento momentaneamente attivo
 * (_ghostState.active). Questo evita che la configurazione icone, che può
 * ricostruire il contenuto del bottone, lasci ON/OFF e colore desincronizzati.
 */
function _aggiornaGhostToggleUI() {
    var btn = document.getElementById('manuale-btn-ghost-toggle');
    if (!btn) return;

    var enabled = !!_ghostModeEnabled;
    var icon = btn.querySelector('.manuale-emoji, img, i');
    var testoBase = btn.dataset.ghostLabel || 'Ghost';
    var textNodes = Array.prototype.slice.call(btn.childNodes).filter(function (node) {
        return node.nodeType === 3;
    });
    if (textNodes.length > 0) {
        var testoConfigurato = textNodes.map(function (node) {
            return node.nodeValue || '';
        }).join(' ').trim();
        testoConfigurato = testoConfigurato.replace(/\s*:\s*(ON|OFF)\s*$/i, '').trim();
        if (testoConfigurato && !btn.dataset.ghostLabel) testoBase = testoConfigurato;
    }

    Array.prototype.slice.call(btn.childNodes).forEach(function (node) {
        if (node.nodeType === 3 || (node !== icon && node.nodeType === 1)) {
            btn.removeChild(node);
        }
    });
    btn.appendChild(document.createTextNode(' ' + testoBase + ': ' + (enabled ? 'ON' : 'OFF')));
    btn.classList.toggle('btn-success', enabled);
    btn.dataset.ghostMode = enabled ? 'on' : 'off';

    // Un eventuale colore inline della Gestione Icone prevale su btn-success.
    // Per ON lo rimuoviamo: così il colore di stato torna visibile.
    if (enabled) {
        btn.style.backgroundColor = '';
        btn.style.borderColor = '';
        btn.style.boxShadow = '';
    }
}

function _setGhostMode(enabled) {
    _ghostModeEnabled = !!enabled;
    _aggiornaGhostToggleUI();
    if (!_ghostModeEnabled && _ghostState.active) {
        // Se il ghost era attivo, annullalo dopo aver aggiornato il toggle.
        _annullaGhost(true);
    }
}

// ---------------------------------------------------------------------------
// SELEZIONE RETTANGOLARE (MARQUEE) — Toggle in toolbar
// ---------------------------------------------------------------------------

function _aggiornaMarqueeToggleUI() {
    var btn = document.getElementById('manuale-btn-marquee-toggle');
    if (!btn) return;
    var enabled = !!_marqueeModeEnabled;
    var testoBase = 'Selezione';
    var textNodes = Array.prototype.slice.call(btn.childNodes).filter(function (n) {
        return n.nodeType === Node.TEXT_NODE;
    });
    textNodes.forEach(function (n) { n.textContent = ' ' + testoBase + (enabled ? ': ON' : ': OFF'); });
    if (enabled) {
        btn.classList.add('active');
        btn.style.backgroundColor = '#1f6feb';
        btn.style.color = '#fff';
        btn.style.boxShadow = '0 0 6px rgba(31,111,235,0.5)';
    } else {
        btn.classList.remove('active');
        btn.style.backgroundColor = '';
        btn.style.color = '';
        btn.style.boxShadow = '';
    }
}

function _setMarqueeMode(enabled) {
    _marqueeModeEnabled = !!enabled;
    _aggiornaMarqueeToggleUI();
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

    // Una ricostruzione della scena non deve conservare riferimenti a gruppi
    // selezionati nella scena precedente.
    if (typeof _clearManualMultiSelection === 'function') {
        _clearManualMultiSelection();
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
            _annullaUltimaModificaManuale();
        });
    }

    // Bottone Toggle Selezione Rettangolare (Marquee)
    var btnMarqueeToggle = document.getElementById('manuale-btn-marquee-toggle');
    if (btnMarqueeToggle && !btnMarqueeToggle._listenerAttached) {
        btnMarqueeToggle._listenerAttached = true;
        btnMarqueeToggle.addEventListener('click', function () {
            _setMarqueeMode(!_marqueeModeEnabled);
        });
    }

    // La scena può essere stata appena caricata/ricostruita: il primo stato
    // della cronologia è sempre quello realmente visibile all'utente.
    _inizializzaCronologiaManuale();

    // Riallinea anche un bottone eventualmente ricostruito dalla gestione
    // icone o da un rebuild della scena.
    _aggiornaGhostToggleUI();
    _aggiornaUndoManualeUI();
    _aggiornaMarqueeToggleUI();

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
