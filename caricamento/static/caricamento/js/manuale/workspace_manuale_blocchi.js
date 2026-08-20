/**
 * Workspace Carico 3D — Modalità Manuale: Movimento blocchi
 *
 * Sposta più oggetti come un unico blocco. Le coordinate relative restano
 * invariate. Stesso stile dell'oggetto singolo:
 *   - Ghost OFF: blocco opaco, ancorato all'ultima posizione valida (non si
 *     può lasciare in sovrapposizione con altri oggetti).
 *   - Ghost ON: blocco traslucido con wireframe verde/rosso; può attraversare
 *     temporaneamente gli altri oggetti, ma al rilascio una posizione
 *     invalida viene ripristinata all'originale (come il ghost singolo).
 */

var _manualeBlockDragState = {
    active: false,
    groups: [],
    startPositions: [],
    lastValidPositions: [],
    anchor: null,
    plane: null,
    offset: null,
    ctrlStarted: false,
    ctrlPrevMouseY: 0,
    ctrlRawApiZ: 0,
    wasColliding: false,
};

function _manualeGruppiSelezionati() {
    var groups = Array.isArray(STATE._manualSelectedObjects)
        ? STATE._manualSelectedObjects.filter(function (group) {
            return group && group.parent && STATE.oggettiMesh.indexOf(group) >= 0;
        })
        : [];
    return groups;
}

function _manualePosizioniUguali(a, b) {
    return a && b && Math.abs(a.x - b.x) < 0.001 &&
        Math.abs(a.y - b.y) < 0.001 && Math.abs(a.z - b.z) < 0.001;
}

function _manualeBloccoFuoriContenitore(groups) {
    if (!STATE.dati || !STATE.dati.contenitore) return false;
    var container = STATE.dati.contenitore.dimensioni_cm;
    return groups.some(function (group) {
        var dim = _getTjsDimensions(group);
        var p = group.position;
        return p.x - dim.x / 2 < 0 || p.x + dim.x / 2 > container.x ||
            p.y - dim.y / 2 < 0 || p.y + dim.y / 2 > container.z ||
            p.z - dim.z / 2 < 0 || p.z + dim.z / 2 > container.y;
    });
}

function _manualeBloccoCollide(groups) {
    var selected = groups;
    for (var i = 0; i < selected.length; i++) {
        var group = selected[i];
        var dim = _getTjsDimensions(group);
        for (var j = 0; j < STATE.oggettiMesh.length; j++) {
            var other = STATE.oggettiMesh[j];
            if (selected.indexOf(other) >= 0 || !other.visible) continue;
            if (_aabbOverlap(dim, group.position, _getTjsDimensions(other), other.position)) {
                return true;
            }
        }
    }
    return false;
}

function _manualeValidaBlocco(groups) {
    return !_manualeBloccoFuoriContenitore(groups) && !_manualeBloccoCollide(groups);
}

/**
 * Clampa il delta di traslazione del blocco affinché TUTTI i membri restino
 * dentro il contenitore. Stessa mappatura di _manualeBloccoFuoriContenitore:
 * X → [0, container.x], Y (altezza) → [0, container.z], Z → [0, container.y].
 * Restituisce un nuovo THREE.Vector3 (non modifica l'originale).
 */
function _manualeClampaDeltaAlContenitore(delta, startPositions, groups) {
    if (!STATE.dati || !STATE.dati.contenitore) return delta;
    var container = STATE.dati.contenitore.dimensioni_cm;
    var dxMin = -Infinity, dxMax = Infinity;
    var dyMin = -Infinity, dyMax = Infinity;
    var dzMin = -Infinity, dzMax = Infinity;
    groups.forEach(function (group, index) {
        var dim = _getTjsDimensions(group);
        var s = startPositions[index];
        dxMin = Math.max(dxMin, dim.x / 2 - s.x);
        dxMax = Math.min(dxMax, container.x - s.x - dim.x / 2);
        dyMin = Math.max(dyMin, dim.y / 2 - s.y);
        dyMax = Math.min(dyMax, container.z - s.y - dim.y / 2);
        dzMin = Math.max(dzMin, dim.z / 2 - s.z);
        dzMax = Math.min(dzMax, container.y - s.z - dim.z / 2);
    });
    return new THREE.Vector3(
        Math.max(dxMin, Math.min(dxMax, delta.x)),
        Math.max(dyMin, Math.min(dyMax, delta.y)),
        Math.max(dzMin, Math.min(dzMax, delta.z))
    );
}

function _manualeApplicaPosizioniBlocco(positions) {
    var groups = _manualeBlockDragState.groups;
    groups.forEach(function (group, index) {
        group.position.copy(positions[index]);
    });
}

function _manualeEvidenziaBlocco(colliding) {
    _manualeBlockDragState.groups.forEach(function (group) {
        _setDragHighlight(group, colliding);
    });
}

/**
 * Azzera l'evidenziazione emissiva dopo un drag (come fa il drag singolo
 * in pointerup): senza questo reset gli oggetti del blocco resterebbero
 * con il glow verde/rosso "attaccato" alla fine del drag.
 */
function _manualeResetEvidenziaBlocco() {
    _manualeBlockDragState.groups.forEach(function (group) {
        group.children.forEach(function (child) {
            if (child.type === 'Mesh' && child.material && child.material.emissive) {
                child.material.emissive = new THREE.Color(0x000000);
                child.material.emissiveIntensity = 0;
            }
        });
    });
}

// =============================================================================
// VISUAL GHOST PER BLOCCO (trasparenza + wireframe verde/rosso)
// =============================================================================

function _manualeApplicaTrasparenzaBlocco(transparent) {
    _manualeBlockDragState.groups.forEach(function (group) {
        group.children.forEach(function (child) {
            if (child.type !== 'Mesh' || !child.material) return;
            var m = child.material;
            if (transparent && m.userData._blockOriginalOpacity === undefined) {
                m.userData._blockOriginalOpacity = m.opacity;
                m.userData._blockOriginalTransparent = m.transparent;
                m.userData._blockOriginalDepthWrite = m.depthWrite;
                m.transparent = true;
                m.opacity = 0.35;
                m.depthWrite = false;
            } else if (!transparent && m.userData._blockOriginalOpacity !== undefined) {
                m.opacity = m.userData._blockOriginalOpacity;
                m.transparent = m.userData._blockOriginalTransparent;
                m.depthWrite = m.userData._blockOriginalDepthWrite;
                delete m.userData._blockOriginalOpacity;
                delete m.userData._blockOriginalTransparent;
                delete m.userData._blockOriginalDepthWrite;
            }
        });
    });
}

function _manualeEvidenziaBloccoWireframe(colliding) {
    var colorHex = colliding ? 0xff4444 : 0x44ff44;
    _manualeBlockDragState.groups.forEach(function (group) {
        var wire = null;
        for (var i = 0; i < group.children.length; i++) {
            var child = group.children[i];
            if (child.userData && child.userData._isBlockGhostWire) { wire = child; break; }
        }
        if (!wire) {
            var dim = _getTjsDimensions(group);
            wire = new THREE.LineSegments(
                new THREE.EdgesGeometry(new THREE.BoxGeometry(dim.x + 2, dim.y + 2, dim.z + 2)),
                new THREE.LineBasicMaterial({ color: colorHex, linewidth: 2, transparent: true, opacity: 0.9 })
            );
            wire.userData._isBlockGhostWire = true;
            group.add(wire);
        } else {
            wire.material.color.set(colorHex);
        }
    });
}

function _manualeRimuoviWireframeBlocco() {
    _manualeBlockDragState.groups.forEach(function (group) {
        var toRemove = [];
        for (var i = 0; i < group.children.length; i++) {
            var child = group.children[i];
            if (child.userData && child.userData._isBlockGhostWire) toRemove.push(child);
        }
        toRemove.forEach(function (child) {
            group.remove(child);
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
    });
}

function _manualeIniziaDragBlocco(e, anchor) {
    var groups = _manualeGruppiSelezionati();
    if (groups.length < 2 || !anchor || groups.indexOf(anchor) < 0) return false;

    // Difesa: se un drag a blocchi precedente non è stato chiuso correttamente
    // (es. pointerup perso), chiudilo prima di sovrascrivere lo stato. Così
    // trasparenza/wireframe eventualmente rimasti vengono sempre ripristinati.
    if (_manualeBlockDragState.active) {
        _manualeTerminaDragBlocco();
    }

    e.preventDefault();
    e.stopPropagation();
    var canvas = STATE.renderer.domElement;
    var dim = _getTjsDimensions(anchor);
    var plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -anchor.position.y);
    STATE.mouse.x = ((e.clientX - canvas.getBoundingClientRect().left) / canvas.clientWidth) * 2 - 1;
    STATE.mouse.y = -((e.clientY - canvas.getBoundingClientRect().top) / canvas.clientHeight) * 2 + 1;
    STATE.raycaster.setFromCamera(STATE.mouse, STATE.camera);
    var intersect = new THREE.Vector3();
    STATE.raycaster.ray.intersectPlane(plane, intersect);

    _manualeBlockDragState = {
        active: true,
        groups: groups,
        startPositions: groups.map(function (group) { return group.position.clone(); }),
        lastValidPositions: groups.map(function (group) { return group.position.clone(); }),
        anchor: anchor,
        anchorStart: anchor.position.clone(),
        plane: plane,
        offset: anchor.position.clone().sub(intersect),
        ctrlStarted: false,
        ctrlPrevMouseY: e.clientY,
        ctrlRawApiZ: anchor.position.y - dim.y / 2,
        wasColliding: false,
    };
    STATE.controls.enabled = false;
    canvas.style.cursor = 'grabbing';
    if (typeof _ghostModeEnabled !== 'undefined' && _ghostModeEnabled) {
        // Ghost ON: blocco traslucido con wireframe verde (posizione iniziale valida)
        _manualeApplicaTrasparenzaBlocco(true);
        _manualeEvidenziaBloccoWireframe(false);
    } else {
        _manualeEvidenziaBlocco(false);
    }
    return true;
}

function _manualeMuoviDragBlocco(e) {
    var state = _manualeBlockDragState;
    if (!state.active) return;
    var canvas = STATE.renderer.domElement;
    var anchor = state.anchor;
    var anchorDim = _getTjsDimensions(anchor);
    var delta = new THREE.Vector3();

    STATE.mouse.x = ((e.clientX - canvas.getBoundingClientRect().left) / canvas.clientWidth) * 2 - 1;
    STATE.mouse.y = -((e.clientY - canvas.getBoundingClientRect().top) / canvas.clientHeight) * 2 + 1;
    STATE.raycaster.setFromCamera(STATE.mouse, STATE.camera);

    if (STATE.dragState.ctrlDown) {
        if (!state.ctrlStarted) {
            state.ctrlStarted = true;
            state.ctrlPrevMouseY = e.clientY;
            state.ctrlRawApiZ = state.anchorStart.y - anchorDim.y / 2;
        }
        state.ctrlRawApiZ += (state.ctrlPrevMouseY - e.clientY) * 0.8;
        state.ctrlPrevMouseY = e.clientY;
        state.ctrlRawApiZ = Math.max(0, state.ctrlRawApiZ);
        var step = STATE.snapStepCm;
        var snappedY = Math.round(state.ctrlRawApiZ / step) * step + anchorDim.y / 2;
        delta.y = snappedY - state.anchorStart.y;
    } else {
        state.ctrlStarted = false;
        var intersect = new THREE.Vector3();
        if (!STATE.raycaster.ray.intersectPlane(state.plane, intersect)) return;
        var target = intersect.add(state.offset);
        var snapped = _snapPosition(target, anchorDim);
        delta.x = snapped.x - state.anchorStart.x;
        delta.z = snapped.z - state.anchorStart.z;
    }

    // Ghost OFF: il delta viene clampato ai bordi del contenitore, così il
    // blocco "scivola" lungo le pareti come un oggetto singolo invece di
    // fermarsi di colpo. Ghost ON: nessun clamp (posizioni temporanee anche
    // fuori dai limiti, segnalate in rosso).
    if (typeof _ghostModeEnabled === 'undefined' || !_ghostModeEnabled) {
        delta = _manualeClampaDeltaAlContenitore(delta, state.startPositions, state.groups);
    }

    var proposed = state.startPositions.map(function (position) {
        return position.clone().add(delta);
    });
    _manualeApplicaPosizioniBlocco(proposed);

    // Ghost ON: rosso se collide O esce dal contenitore (può restare fuori).
    // Ghost OFF: il contenitore è già garantito dal clamp → valuta solo le
    // collisioni con gli altri oggetti (stesso comportamento del singolo).
    var ghostOn = typeof _ghostModeEnabled !== 'undefined' && _ghostModeEnabled;
    var invalido = ghostOn ? !_manualeValidaBlocco(state.groups) : _manualeBloccoCollide(state.groups);
    if (ghostOn) {
        // Ghost ON: il blocco "fantasma" può attraversare temporaneamente;
        // il wireframe segnala verde (ok) / rosso (collisione o fuori limiti).
        _manualeEvidenziaBloccoWireframe(invalido);
    } else if (invalido) {
        // Ghost OFF: come l'oggetto singolo — non si può restare in
        // sovrapposizione, il blocco torna all'ultima posizione valida.
        _manualeApplicaPosizioniBlocco(state.lastValidPositions);
        if (!state.wasColliding) {
            _manualeEvidenziaBlocco(true);
            state.wasColliding = true;
        }
    } else {
        state.lastValidPositions = state.groups.map(function (group) { return group.position.clone(); });
        if (state.wasColliding) {
            _manualeEvidenziaBlocco(false);
            state.wasColliding = false;
        }
    }
}

function _manualeTerminaDragBlocco() {
    var state = _manualeBlockDragState;
    if (!state.active) return false;
    var groups = state.groups.slice();
    var moved = groups.some(function (group, index) {
        return !_manualePosizioniUguali(group.position, state.startPositions[index]);
    });

    var ghostOn = typeof _ghostModeEnabled !== 'undefined' && _ghostModeEnabled;
    if (!ghostOn) {
        // Ghost OFF: il blocco resta ancorato all'ultima posizione valida
        // (non può essere lasciato in sovrapposizione con altri oggetti).
        _manualeApplicaPosizioniBlocco(state.lastValidPositions);
    } else if (!_manualeValidaBlocco(groups)) {
        // Ghost ON: come l'oggetto singolo — se la posizione finale collide
        // o esce dal contenitore, il blocco torna alla posizione originale.
        _manualeApplicaPosizioniBlocco(state.startPositions);
        groups.forEach(function (group) {
            if (typeof _flashOggetto === 'function') _flashOggetto(group, 0xff0000);
        });
        showToast('⚠️ Posizione in collisione o fuori dal contenitore: blocco ripristinato.', 'warning');
        moved = false;
    }

    if (moved) {
        if (typeof WS !== 'undefined') WS._manualDragOccurred = true;
        if (typeof _registraModificaManuale === 'function') _registraModificaManuale();
        if (typeof _refreshSidebarLineari === 'function') _refreshSidebarLineari();
    }

    // Pulizia visual ghost (trasparenza + wireframe) e azzeramento highlight
    _manualeApplicaTrasparenzaBlocco(false);
    _manualeRimuoviWireframeBlocco();
    _manualeResetEvidenziaBlocco();

    var canvas = STATE.renderer.domElement;
    _manualeBlockDragState.active = false;
    _manualeBlockDragState.groups = [];
    STATE.controls.enabled = true;
    canvas.style.cursor = '';
    if (state.anchor && state.anchor.parent) _aggiornaInfoOggettoManuale(state.anchor);
    return true;
}
