/**
 * Workspace Carico 3D — Modalità Manuale: Selezione multipla
 *
 * Funzioni di utilità per la selezione multipla di oggetti.
 * Il marquee/rettangolo è stato rimosso: la selezione multipla avviene
 * tramite il toggle nella toolbar:
 *   - Toggle ON + click sx: aggiunge l'oggetto alla selezione
 *   - Click dx: seleziona l'oggetto + tutti quelli sotto nella colonna
 *   - Toggle OFF: selezione singola normale
 */

// =============================================================================
// UTILITÀ SELEZIONE
// =============================================================================

/**
 * Determina se l'oggetto a è "sotto" l'oggetto b (stessa colonna XZ).
 */
function _manualeOggettoSotto(a, b) {
    var aDim = _getTjsDimensions(a);
    var bDim = _getTjsDimensions(b);
    var aMinX = a.position.x - aDim.x / 2;
    var aMaxX = a.position.x + aDim.x / 2;
    var aMinZ = a.position.z - aDim.z / 2;
    var aMaxZ = a.position.z + aDim.z / 2;
    var bMinX = b.position.x - bDim.x / 2;
    var bMaxX = b.position.x + bDim.x / 2;
    var bMinZ = b.position.z - bDim.z / 2;
    var bMaxZ = b.position.z + bDim.z / 2;
    var overlapXZ = aMinX < bMaxX && aMaxX > bMinX && aMinZ < bMaxZ && aMaxZ > bMinZ;
    var aTop = a.position.y + aDim.y / 2;
    var bBottom = b.position.y - bDim.y / 2;
    return overlapXZ && aTop <= bBottom + 0.1;
}

/**
 * Seleziona tutti gli oggetti sotto il group nella colonna verticale.
 * Restituisce l'array aggiornato dei gruppi selezionati.
 */
function _manualeSelezionaColonna(group) {
    var selected = [group];
    var i = 0;
    while (i < selected.length) {
        var source = selected[i];
        STATE.oggettiMesh.forEach(function (candidate) {
            if (candidate === source || !candidate.visible || !candidate.parent) return;
            if (_manualeOggettoSotto(candidate, source) && selected.indexOf(candidate) === -1) {
                selected.push(candidate);
            }
        });
        i += 1;
    }
    return selected;
}

// =============================================================================
// HIGHLIGHT SELEZIONE MULTIPLA (wireframe blu attorno agli oggetti)
// =============================================================================

function _rimuoviHighlightGruppoManuale(group) {
    if (!group || !group.children) return;
    var toRemove = group.children.filter(function (child) {
        return child.userData && child.userData._isSelectionHighlight;
    });
    toRemove.forEach(function (child) {
        group.remove(child);
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
    });
}

function _clearManualMultiSelection(keepPanelSelected) {
    var selected = Array.isArray(STATE._manualSelectedObjects)
        ? STATE._manualSelectedObjects.slice()
        : [];
    if (STATE.selectedObject && selected.indexOf(STATE.selectedObject) === -1) {
        selected.push(STATE.selectedObject);
    }
    selected.forEach(_rimuoviHighlightGruppoManuale);
    STATE._manualSelectedObjects = [];
    STATE.selectedObject = null;
    if (typeof DOM !== 'undefined' && DOM.panelItemsList && !keepPanelSelected) {
        DOM.panelItemsList.querySelectorAll('.panel-item.selected').forEach(function (item) {
            item.classList.remove('selected');
        });
    }
    var btn = document.getElementById('manuale-btn-rimuovi');
    if (btn) btn.disabled = true;
    if (!keepPanelSelected) {
        var info = document.getElementById('manuale-oggetto-info');
        if (info) info.style.display = 'none';
        if (typeof WS !== 'undefined') {
            WS._manualPanelSelectedOggettoId = null;
            WS._manualPanelSelectedCodice = null;
            WS._manualPanelSelectedRigaId = null;
            WS._manualPanelSelectedRigaKey = null;
        }
    }
    _aggiornaBadgeConteggioSelezione();
}

function _setManualSelection(groups) {
    _clearManualMultiSelection();
    groups = (groups || []).filter(function (group, index, array) {
        return group && group.parent && group.visible && array.indexOf(group) === index;
    });
    STATE._manualSelectedObjects = groups;
    STATE.selectedObject = groups[0] || null;
    groups.forEach(function (group) {
        var dim = _getTjsDimensions(group);
        var wire = new THREE.LineSegments(
            new THREE.EdgesGeometry(new THREE.BoxGeometry(dim.x + 2, dim.y + 2, dim.z + 2)),
            new THREE.LineBasicMaterial({ color: 0x3388ff, linewidth: 2, transparent: true, opacity: 0.85 })
        );
        wire.userData._isSelectionHighlight = true;
        group.add(wire);
        var row = null;
        if (DOM.panelItemsList && group.userData.riga_id) {
            row = DOM.panelItemsList.querySelector('.panel-item[data-riga-id="' + group.userData.riga_id + '"]');
        }
        if (!row && DOM.panelItemsList && group.userData.riga_key) {
            row = DOM.panelItemsList.querySelector('.panel-item[data-riga-key="' + group.userData.riga_key + '"]');
        }
        if (!row && DOM.panelItemsList) {
            row = Array.prototype.slice.call(
                DOM.panelItemsList.querySelectorAll('.panel-item')
            ).find(function (item) { return item.dataset.codice === group.userData.codice; });
        }
        if (row) row.classList.add('selected');
    });
    if (STATE.selectedObject) {
        _aggiornaInfoOggettoManuale(STATE.selectedObject);
        var btn = document.getElementById('manuale-btn-rimuovi');
        if (btn) btn.disabled = false;
    }
    _aggiornaBadgeConteggioSelezione();
}

/**
 * Mostra/nasconde il badge con il numero di oggetti selezionati nell'angolo
 * in basso a destra della label dell'oggetto (solo per selezione multipla,
 * > 1 oggetto). Il badge è in overlay assoluto: non modifica le dimensioni
 * della label.
 */
function _aggiornaBadgeConteggioSelezione() {
    var badge = document.getElementById('manuale-oggetto-count');
    if (!badge) return;
    var n = Array.isArray(STATE._manualSelectedObjects)
        ? STATE._manualSelectedObjects.length
        : 0;
    if (n > 1) {
        badge.textContent = String(n);
        badge.style.display = 'inline-block';
    } else {
        badge.textContent = '';
        badge.style.display = 'none';
    }
}
