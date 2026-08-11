/**
 * Workspace Carico 3D — Modalità Manuale: Ghost Mode
 *
 * Gestisce la modalità Ghost per il piazzamento assistito.
 * Dipende da: workspace_manuale.js (core)
 */

function _creaGhostMesh(dimCm, tjsPos, codice, colore) {
    var tjsDim = { w: dimCm.x, h: dimCm.y, d: dimCm.z };
    var col = new THREE.Color(colore || '#447e9b');

    var mat = new THREE.MeshPhysicalMaterial({
        color: col,
        roughness: 0.3,
        metalness: 0.1,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
    });

    var geo = new THREE.BoxGeometry(tjsDim.w, tjsDim.h, tjsDim.d);
    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, 0, 0);

    // Wireframe colorato (verde/rosso)
    var wireMat = new THREE.LineBasicMaterial({
        color: 0x44ff44,
        linewidth: 2,
        transparent: true,
        opacity: 0.9,
        depthTest: true,
        depthWrite: false,
    });
    var wireGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(tjsDim.w + 2, tjsDim.h + 2, tjsDim.d + 2));
    var wireframe = new THREE.LineSegments(wireGeo, wireMat);

    var itemGroup = new THREE.Group();
    itemGroup.add(mesh);
    itemGroup.add(wireframe);
    itemGroup.position.set(tjsPos.x, tjsPos.y, tjsPos.z);

    // userData minimale
    itemGroup.userData = { codice: codice, _tjsDimCm: { x: dimCm.x, y: dimCm.y, z: dimCm.z } };

    return { group: itemGroup, wireframe: wireframe, mesh: mesh };
}

/**
 * Aggiorna il colore del wireframe del ghost: verde = ok, rosso = collisione.
 */
function _aggiornaWireframeGhost() {
    if (!_ghostState.active || !_ghostState.wireframe) return;
    var hasCollision = _checkCollisionWithOthers(null, _ghostState.group.position, _ghostState.dims);
    // Controlla anche bound contenitore
    var fuori = false;
    if (!hasCollision && STATE.dati && STATE.dati.contenitore) {
        var cd = STATE.dati.contenitore.dimensioni_cm;
        var d = _ghostState.dims;
        var p = _ghostState.group.position;
        if (p.x - d.x/2 < 0 || p.x + d.x/2 > cd.x ||
            p.y - d.y/2 < 0 || p.y + d.y/2 > cd.z ||
            p.z - d.z/2 < 0 || p.z + d.z/2 > cd.y) {
            fuori = true;
        }
    }
    _ghostState.wireframe.material.color.set(fuori || hasCollision ? 0xff4444 : 0x44ff44);
}

/**
 * Ricostruisce la geometria del ghost dopo una rotazione.
 */
function _ricostruisciGhostGeometria() {
    var gs = _ghostState;
    var dimCm = gs.dims;
    var tjsDim = { w: dimCm.x, h: dimCm.y, d: dimCm.z };

    // Aggiorna geometria mesh
    var mesh = gs.group.children[0];
    if (mesh && mesh.geometry) {
        mesh.geometry.dispose();
        mesh.geometry = new THREE.BoxGeometry(tjsDim.w, tjsDim.h, tjsDim.d);
    }

    // Aggiorna wireframe
    if (gs.wireframe && gs.wireframe.geometry) {
        gs.wireframe.geometry.dispose();
        gs.wireframe.geometry = new THREE.EdgesGeometry(
            new THREE.BoxGeometry(tjsDim.w + 2, tjsDim.h + 2, tjsDim.d + 2)
        );
    }

    // Aggiorna userData
    gs.group.userData._tjsDimCm = { x: dimCm.x, y: dimCm.y, z: dimCm.z };
    _aggiornaWireframeGhost();
}

/**
 * Attiva la modalità ghost piazzamento per un oggetto.
 */
function _attivaModalitaGhost(oggetto) {
    // Se già attivo, annulla il precedente
    if (_ghostState.active) _annullaGhost(true);

    // Resetta step rotazione eccentrica per nuova attivazione
    _ghostState._eccentricStep = 0;

    var L = oggetto.lunghezza_mm / 10;
    var P = oggetto.larghezza_mm / 10;
    var H = oggetto.altezza_mm / 10;
    var orientamenti = _calcolaOrientamentiDaAnagrafica(L, P, H, oggetto);

    // Usa il primo orientamento
    var dimCm = orientamenti[0].tjsDims;
    var halfY = dimCm.y / 2;

    // Posizione iniziale: primo slot valido o centro in aria
    var risultato = _trovaPosizione3D(L, P, H, oggetto);
    var tjsPos;
    if (risultato) {
        tjsPos = risultato.pos.clone();
        dimCm = risultato.dims;
        _ghostState.orientamento = risultato.label;
    } else {
        var cDim = (STATE.dati && STATE.dati.contenitore) ? STATE.dati.contenitore.dimensioni_cm : null;
        if (cDim) {
            tjsPos = new THREE.Vector3(cDim.x / 2, cDim.z / 2, cDim.y / 2);
        } else {
            tjsPos = new THREE.Vector3(dimCm.x / 2, halfY, dimCm.z / 2);
        }
    }

    var colore = coloreOggetto(oggetto);
    var ghost = _creaGhostMesh(dimCm, tjsPos, oggetto.codice, colore);

    STATE.scene.add(ghost.group);
    STATE.controls.enabled = false;
    STATE.renderer.domElement.style.cursor = 'crosshair';

    // Mostra pulsante annulla ghost
    var btnAnnullaGhost2 = document.getElementById('manuale-btn-annulla-ghost');
    if (btnAnnullaGhost2) btnAnnullaGhost2.style.display = 'block';

    _ghostState.active = true;
    _ghostState.group = ghost.group;
    _ghostState.wireframe = ghost.wireframe;
    _ghostState.oggetto = oggetto;
    _ghostState.dims = dimCm;
    _ghostState.orientamento = _ghostState.orientamento || 'LxPxH';
    _ghostState.orientamenti = orientamenti;
    _ghostState._ctrlDown = false;
    _ghostState._prevClientY = 0;
    _ghostState._rawApiZ = tjsPos.y - halfY;
    _ghostState._plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -tjsPos.y);

    _aggiornaWireframeGhost();
    showToast('👻 Posiziona l\'oggetto. Click = piazza | Esc = annulla | Frecce = sposta | Ctrl+↑↓ = altezza | Ctrl+←→ = ruota | Enter = conferma', 'info');
}

/**
 * Gestisce il click durante la modalità ghost.
 * Chiamato da _onDragPointerDown quando ghost è attivo.
 */
function _onGhostClick(e) {
    // Previeni propagazione per TUTTI i click in ghost mode
    e.preventDefault();
    e.stopPropagation();

    if (e.shiftKey) {
        // Rotazione
        var orientamenti = _ghostState.orientamenti;
        console.log('[Ghost Rotate] shiftKey=true, orientamenti.length=' + (orientamenti ? orientamenti.length : 'undefined'), 'orientamenti=', orientamenti);
        if (!orientamenti || orientamenti.length <= 1) return;

        // Determina se siamo in modalità eccentrica
        var isEccentricMode = (typeof IMPOSTAZIONI !== 'undefined' &&
            IMPOSTAZIONI.output_ottimizzazione &&
            IMPOSTAZIONI.output_ottimizzazione.modalita_rotazione === 'eccentrica');

        if (isEccentricMode) {
            // === ROTAZIONE ECCENTRICA GHOST ===
            // Filtra solo orientamenti "piatti" (stessa altezza di LxPxH)
            var baseOrientamento = orientamenti.find(function(o) { return o.label === 'LxPxH'; }) || orientamenti[0];
            var altezzaBase = baseOrientamento.tjsDims.y;
            var orizzontali = orientamenti.filter(function(o) {
                return Math.abs(o.tjsDims.y - altezzaBase) < 0.01;
            });
            if (orizzontali.length <= 1) return;

            var currentLabel = _ghostState.orientamento;
            var currentIdx = 0;
            for (var i = 0; i < orizzontali.length; i++) {
                if (orizzontali[i].label === currentLabel) { currentIdx = i; break; }
            }
            // Se corrente non è tra quelli piatti, usa il primo
            if (orizzontali[currentIdx].label !== currentLabel) {
                currentIdx = 0;
            }

            var isCW = e.button === 2;  // destro = CW, sinistro = CCW
            var n = orizzontali.length;
            var nextIdx = isCW ? (currentIdx + 1) % n : (currentIdx - 1 + n) % n;

            var oldDims = _ghostState.dims;
            var oldX = _ghostState.group.position.x;
            var oldZ = _ghostState.group.position.z;
            var oldY = _ghostState.group.position.y;

            // Applica nuovo orientamento
            _ghostState.orientamento = orizzontali[nextIdx].label;
            _ghostState.dims = orizzontali[nextIdx].tjsDims;
            _ricostruisciGhostGeometria();

            // Calcola offset pivot
            var delta = Math.abs(oldDims.x - oldDims.z) / 2;
            if (delta >= 0.5) {
                var step = _ghostState._eccentricStep || 0;
                var movesX = [-delta, -delta, delta, delta];
                var movesZ = [-delta, delta, delta, -delta];
                if (isCW) {
                    _ghostState.group.position.x = oldX + movesX[step];
                    _ghostState.group.position.z = oldZ + movesZ[step];
                    _ghostState._eccentricStep = (step + 1) % 4;
                } else {
                    var prevStep = (step - 1 + 4) % 4;
                    _ghostState._eccentricStep = prevStep;
                    _ghostState.group.position.x = oldX - movesX[prevStep];
                    _ghostState.group.position.z = oldZ - movesZ[prevStep];
                }
                _ghostState.group.position.y = oldY;
                _ghostState._plane.constant = -(oldY);
                // Aggiorna rawApiZ per mantenere coerenza con Ctrl+Z
                _ghostState._rawApiZ = oldY - _ghostState.dims.y / 2;
            }

            _aggiornaWireframeGhost();
            showToast('🔄 ' + _ghostState.orientamento + (isCW ? ' CW' : ' CCW'), 'info');
        } else {
            // === ROTAZIONE BARICENTRICA ===
            var currentLabel2 = _ghostState.orientamento;
            var currentIdx2 = 0;
            for (var j = 0; j < orientamenti.length; j++) {
                if (orientamenti[j].label === currentLabel2) { currentIdx2 = j; break; }
            }
            var nextIdx2 = (currentIdx2 + 1) % orientamenti.length;
            _ghostState.orientamento = orientamenti[nextIdx2].label;
            _ghostState.dims = orientamenti[nextIdx2].tjsDims;
            _ricostruisciGhostGeometria();
            _aggiornaWireframeGhost();
            showToast('🔄 ' + _ghostState.orientamento, 'info');
        }
    } else if (e.button === 0) {
        // Click sinistro = conferma
        _confermaGhost();
    } else if (e.button === 2) {
        // Click destro = annulla
        _annullaGhost(false);
    }
}

/**
 * Gestisce il movimento del mouse durante la modalità ghost.
 */
function _onGhostPointerMove(e) {
    if (!_ghostState.active) return;

    var rect = STATE.renderer.domElement.getBoundingClientRect();
    STATE.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    STATE.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    var gs = _ghostState;

    if (gs._ctrlDown) {
        // Movimento verticale (Z)
        if (gs._prevClientY === 0) {
            gs._prevClientY = e.clientY;
        }
        var deltaPx = gs._prevClientY - e.clientY;
        gs._prevClientY = e.clientY;
        var sensitivity = 0.8;
        gs._rawApiZ += deltaPx * sensitivity;
        gs._rawApiZ = Math.max(0, gs._rawApiZ);

        var step = STATE.snapStepCm;
        var snappedApiZ = Math.round(gs._rawApiZ / step) * step;
        gs.group.position.y = snappedApiZ + gs.dims.y / 2;

        if (STATE.dati && STATE.dati.contenitore) {
            var cDim = STATE.dati.contenitore.dimensioni_cm;
            var maxY = cDim.z - gs.dims.y / 2;
            gs.group.position.y = Math.max(gs.dims.y / 2, Math.min(maxY, gs.group.position.y));
        }
        _ghostState._plane.constant = -(gs.group.position.y);
    } else {
        gs._prevClientY = 0;
        // Movimento XY
        _ghostState._plane.constant = -(gs.group.position.y);
        STATE.raycaster.setFromCamera(STATE.mouse, STATE.camera);
        STATE.raycaster.ray.intersectPlane(_ghostState._plane, _ghostIntersectVec);
        if (_ghostIntersectVec) {
            // Snap alla griglia
            var snapped = _snapPosition(_ghostIntersectVec, gs.dims);
            if (STATE.dati && STATE.dati.contenitore) {
                var cd = STATE.dati.contenitore.dimensioni_cm;
                snapped.x = Math.max(gs.dims.x / 2, Math.min(cd.x - gs.dims.x / 2, snapped.x));
                snapped.z = Math.max(gs.dims.z / 2, Math.min(cd.y - gs.dims.z / 2, snapped.z));
            }
            gs.group.position.set(snapped.x, snapped.y, snapped.z);
        }
    }

    _aggiornaWireframeGhost();
}

/**
 * Gestisce keydown durante ghost: Esc = annulla, Ctrl = attiva Z,
 * Frecce = trasla, Ctrl+Frecce = alza/ruota, Enter = conferma.
 */
function _onGhostKeyDown(e) {
    if (!_ghostState.active) return;

    // --- TASTI CHE FUNZIONANO SEMPRE (anche dentro input) ---
    if (e.key === 'Escape') {
        e.preventDefault();
        _annullaGhost(false);
        return;
    }

    // Non intercettare se l'utente sta scrivendo in un input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

    var gs = _ghostState;
    var step = STATE.snapStepCm;
    var dimCm = gs.dims;

    // --- TASTI SPECIALI ---
    if (e.key === 'Control') {
        gs._ctrlDown = true;
        return;
    }
    if (e.key === 'Enter') {
        e.preventDefault();
        _confermaGhost();
        return;
    }

    // --- CTRL + FRECCE: alza/abbassa / ruota ---
    if (e.ctrlKey) {
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            // Alza di 1 step
            gs._rawApiZ = (gs.group.position.y - dimCm.y / 2) + step;
            if (STATE.dati && STATE.dati.contenitore) {
                var maxY = STATE.dati.contenitore.dimensioni_cm.z - dimCm.y / 2;
                gs._rawApiZ = Math.min(maxY - dimCm.y / 2, gs._rawApiZ);
            }
            gs.group.position.y = Math.round(gs._rawApiZ / step) * step + dimCm.y / 2;
            gs._plane.constant = -(gs.group.position.y);
            _aggiornaWireframeGhost();
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            // Abbassa di 1 step
            gs._rawApiZ = Math.max(0, (gs.group.position.y - dimCm.y / 2) - step);
            gs.group.position.y = Math.round(gs._rawApiZ / step) * step + dimCm.y / 2;
            gs._plane.constant = -(gs.group.position.y);
            _aggiornaWireframeGhost();
            return;
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            // Rotazione: Left=CCW, Right=CW — rispetta impostazione eccentrica
            var orientamenti = gs.orientamenti;
            if (!orientamenti || orientamenti.length <= 1) return;

            var isEccentricMode = (typeof IMPOSTAZIONI !== 'undefined' &&
                IMPOSTAZIONI.output_ottimizzazione &&
                IMPOSTAZIONI.output_ottimizzazione.modalita_rotazione === 'eccentrica');
            var isCW = e.key === 'ArrowRight';

            if (isEccentricMode) {
                // === ROTAZIONE ECCENTRICA (da tastiera) ===
                var baseOrientamento = orientamenti.find(function(o) { return o.label === 'LxPxH'; }) || orientamenti[0];
                var altezzaBase = baseOrientamento.tjsDims.y;
                var orizzontali = orientamenti.filter(function(o) {
                    return Math.abs(o.tjsDims.y - altezzaBase) < 0.01;
                });
                if (orizzontali.length <= 1) return;

                var currentLabel = gs.orientamento;
                var currentIdx = 0;
                for (var i = 0; i < orizzontali.length; i++) {
                    if (orizzontali[i].label === currentLabel) { currentIdx = i; break; }
                }
                if (orizzontali[currentIdx].label !== currentLabel) currentIdx = 0;

                var n = orizzontali.length;
                var nextIdx = isCW ? (currentIdx + 1) % n : (currentIdx - 1 + n) % n;

                var oldDimsKb = gs.dims;
                var oldX = gs.group.position.x;
                var oldZ = gs.group.position.z;
                var oldY = gs.group.position.y;

                gs.orientamento = orizzontali[nextIdx].label;
                gs.dims = orizzontali[nextIdx].tjsDims;
                _ricostruisciGhostGeometria();

                var delta = Math.abs(oldDimsKb.x - oldDimsKb.z) / 2;
                if (delta >= 0.5) {
                    var eccStep = gs._eccentricStep || 0;
                    var movesX = [-delta, -delta, delta, delta];
                    var movesZ = [-delta, delta, delta, -delta];
                    if (isCW) {
                        gs.group.position.x = oldX + movesX[eccStep];
                        gs.group.position.z = oldZ + movesZ[eccStep];
                        gs._eccentricStep = (eccStep + 1) % 4;
                    } else {
                        var prevStep = (eccStep - 1 + 4) % 4;
                        gs._eccentricStep = prevStep;
                        gs.group.position.x = oldX - movesX[prevStep];
                        gs.group.position.z = oldZ - movesZ[prevStep];
                    }
                    gs.group.position.y = oldY;
                    gs._plane.constant = -(oldY);
                    gs._rawApiZ = oldY - gs.dims.y / 2;
                }
                _aggiornaWireframeGhost();
                showToast('🔄 ' + gs.orientamento + (isCW ? ' CW' : ' CCW'), 'info');
            } else {
                // === ROTAZIONE BARICENTRICA ===
                var currentLabelB = gs.orientamento;
                var currentIdxB = 0;
                for (var j = 0; j < orientamenti.length; j++) {
                    if (orientamenti[j].label === currentLabelB) { currentIdxB = j; break; }
                }
                var nextIdxB = isCW
                    ? (currentIdxB + 1) % orientamenti.length
                    : (currentIdxB - 1 + orientamenti.length) % orientamenti.length;
                gs.orientamento = orientamenti[nextIdxB].label;
                gs.dims = orientamenti[nextIdxB].tjsDims;
                _ricostruisciGhostGeometria();
                _aggiornaWireframeGhost();
                showToast('🔄 ' + gs.orientamento, 'info');
            }
            return;
        }
        return;
    }

    // --- FRECCE SEMPLICI: trasla XY ---
    var dx = 0, dz = 0;
    switch (e.key) {
        case 'ArrowLeft':  e.preventDefault(); dx = -1; break;
        case 'ArrowRight': e.preventDefault(); dx =  1; break;
        case 'ArrowUp':    e.preventDefault(); dz = -1; break;
        case 'ArrowDown':  e.preventDefault(); dz =  1; break;
        default: return;
    }

    var newX = gs.group.position.x + dx * step;
    var newZ = gs.group.position.z + dz * step;

    // Clamp ai limiti contenitore
    if (STATE.dati && STATE.dati.contenitore) {
        var cd = STATE.dati.contenitore.dimensioni_cm;
        newX = Math.max(dimCm.x / 2, Math.min(cd.x - dimCm.x / 2, newX));
        newZ = Math.max(dimCm.z / 2, Math.min(cd.y - dimCm.z / 2, newZ));
    }

    gs.group.position.x = newX;
    gs.group.position.z = newZ;
    gs._plane.constant = -(gs.group.position.y);
    _aggiornaWireframeGhost();
}

function _onGhostKeyUp(e) {
    if (e.key === 'Control') {
        _ghostState._ctrlDown = false;
        _ghostState._prevClientY = 0;
    }
}

/**
 * Conferma il piazzamento: trasforma il ghost in oggetto reale.
 */
function _confermaGhost() {
    if (!_ghostState.active) return;

    var p = _ghostState.group.position;
    var d = _ghostState.dims;

    // Verifica bound contenitore
    if (STATE.dati && STATE.dati.contenitore) {
        var cd = STATE.dati.contenitore.dimensioni_cm;
        if (p.x - d.x/2 < 0 || p.x + d.x/2 > cd.x ||
            p.y - d.y/2 < 0 || p.y + d.y/2 > cd.z ||
            p.z - d.z/2 < 0 || p.z + d.z/2 > cd.y) {
            showToast('⚠️ Posizione fuori dal contenitore. Sposta il ghost o premi Esc.', 'warning');
            return;
        }
    }

    // Verifica collisioni
    var hasCollision = _checkCollisionWithOthers(null, p, d);
    if (hasCollision) {
        showToast('⚠️ Posizione in collisione. Sposta il ghost o premi Esc.', 'warning');
        return;
    }

    var gs = _ghostState;
    var oggetto = gs.oggetto;
    var tjsPos = gs.group.position.clone();
    var dimCm = gs.dims;
    var colore = coloreOggetto(oggetto);
    var existingGroup = gs._existingGroup;
    var oldPosition = gs._oldPosition;
    var orientamento = gs.orientamento;  // salva prima che _annullaGhost lo cancelli

    // Azzera _existingGroup/_oldPosition PRIMA di _annullaGhost,
    // così _annullaGhost non tenta di ripristinare l'oggetto
    gs._existingGroup = null;
    gs._oldPosition = null;

    // Rimuovi ghost
    _annullaGhost(true);

    if (existingGroup) {
        // --- RIPOSIZIONAMENTO: ricolloca l'oggetto esistente ---
        existingGroup.position.copy(tjsPos);
        // Ricostruisci la geometria 3D con le dimensioni ruotate
        var nuovoOrientamento = {
            label: orientamento,
            tjsDims: { x: dimCm.x, y: dimCm.y, z: dimCm.z }
        };
        _ricostruisciMeshOrientamento(existingGroup, nuovoOrientamento);

        STATE.scene.add(existingGroup);
        STATE.oggettiMesh.push(existingGroup);

        // Aggiorna slider sequenza carico con il nuovo conteggio
        if (typeof _aggiornaSliderCarico === 'function') _aggiornaSliderCarico();

        // Aggiorna grafico distribuzione pesi in tempo reale se visibile
        if (typeof aggiornaGraficoPesiInTempoReale === 'function') aggiornaGraficoPesiInTempoReale();

        _flashOggetto(existingGroup, 0x00ff00);
        _selectObject(existingGroup);

        if (typeof WS !== 'undefined') WS._manualDragOccurred = true;

        showToast('✅ "' + oggetto.codice + '" riposizionato!', 'success');
        _refreshSidebarLineari();
    } else {
        // --- NUOVO OGGETTO: crea mesh (comportamento originale) ---
        // Crea oggetto reale con le dimensioni ruotate (dimCm è già aggiornato)
        var itemGroup = _creaMeshSingolo(dimCm, tjsPos, oggetto.codice, colore, oggetto.descrizione, oggetto.peso_kg);
        itemGroup.userData._orientamento = orientamento;
        itemGroup.userData.rotazione = orientamento;

        STATE.scene.add(itemGroup);
        STATE.oggettiMesh.push(itemGroup);

        // Aggiorna slider sequenza carico con il nuovo conteggio
        if (typeof _aggiornaSliderCarico === 'function') _aggiornaSliderCarico();

        // Aggiorna grafico distribuzione pesi in tempo reale se visibile
        if (typeof aggiornaGraficoPesiInTempoReale === 'function') aggiornaGraficoPesiInTempoReale();

        _flashOggetto(itemGroup, 0x00ff00);
        _selectObject(itemGroup);

        if (typeof WS !== 'undefined') WS._manualDragOccurred = true;

        _incrementaPanelQty(oggetto.id, oggetto.codice);
        // Mantieni selezionata la riga usata anche dopo l'aggiornamento
        // della quantità e dopo la selezione del mesh nella scena.
        if (typeof _ripristinaSelezionePanelManuale === 'function') {
            _ripristinaSelezionePanelManuale(null, oggetto.id, oggetto.codice);
        }
        showToast('✅ "' + oggetto.codice + '" piazzato!', 'success');
        _refreshSidebarLineari();
    }
}

/**
 * Annulla il ghost mode.
 * @param {boolean} silent - se true, non mostra toast
 */
function _annullaGhost(silent) {
    if (!_ghostState.active) return;

    // Se c'è un oggetto esistente in riposizionamento, ripristinalo
    var existingGroup = _ghostState._existingGroup;
    var oldPosition = _ghostState._oldPosition;

    if (_ghostState.group) {
        if (_ghostState.group.parent) _ghostState.group.parent.remove(_ghostState.group);
        _ghostState.group.children.forEach(function (child) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
    }

    _ghostState.active = false;
    _ghostState.group = null;
    _ghostState.wireframe = null;
    _ghostState.oggetto = null;
    _ghostState.dims = null;
    _ghostState._existingGroup = null;
    _ghostState._oldPosition = null;

    // Ripristina l'oggetto esistente alla posizione originale
    if (existingGroup && oldPosition) {
        existingGroup.position.copy(oldPosition);
        if (STATE.scene) STATE.scene.add(existingGroup);
        STATE.oggettiMesh.push(existingGroup);
        if (!silent) showToast('↩️ Oggetto ripristinato alla posizione originale.', 'info');
    }

    STATE.controls.enabled = true;
    STATE.renderer.domElement.style.cursor = '';

    // Nascondi pulsante annulla ghost
    var btnAnnulla = document.getElementById('manuale-btn-annulla-ghost');
    if (btnAnnulla) btnAnnulla.style.display = 'none';

    if (!silent && !existingGroup) showToast('👻 Piazzamento annullato.', 'info');
}

// =============================================================================
// SETUP / CLEANUP LISTENER
// =============================================================================

