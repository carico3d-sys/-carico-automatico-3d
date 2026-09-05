/**
 * Workspace Carico 3D — Manuale: Oggetti (selezione, creazione, auto-placement)
 *
 * Selezione/deselezione/rimozione oggetti 3D, creazione mesh singolo,
 * algoritmo di auto-posizionamento 3D (scansione volumetrica),
 * strategia di piazzamento (muro/colonne) e controllo supporto.
 *
 * Depends on: workspace_manuale_snap.js (_aabbOverlap, _checkCollisionWithOthers, _snapPosition, _getTjsDimensions)
 *             visualizzatore_3d_core.js (STATE)
 *             workspace_core.js (WS, DOM, trovaOggetto, coloreOggetto)
 */

// =============================================================================
// SELEZIONE / RIMOZIONE OGGETTO IN MODALITÀ MANUALE
// =============================================================================

/**
 * Seleziona un oggetto nella scena 3D (click senza drag).
 * Aggiunge un wireframe blu attorno all'oggetto e lo imposta come selectedObject.
 */
function _selectObject(group) {
    // La selezione rettangolare può avere più oggetti: puliscila interamente
    // prima di tornare alla selezione singola.
    if (typeof _clearManualMultiSelection === 'function') {
        _clearManualMultiSelection();
    } else {
        _deselectObject();
    }

    STATE.selectedObject = group;

    // Crea wireframe blu di selezione (leggermente più grande dell'oggetto)
    var dimCm = _getTjsDimensions(group);
    var selGeo = new THREE.BoxGeometry(dimCm.x + 2, dimCm.y + 2, dimCm.z + 2);
    var selEdges = new THREE.EdgesGeometry(selGeo);
    var selMat = new THREE.LineBasicMaterial({
        color: 0x3388ff,
        linewidth: 2,
        transparent: true,
        opacity: 0.8,
    });
    var selWire = new THREE.LineSegments(selEdges, selMat);
    selWire.userData._isSelectionHighlight = true;
    group.add(selWire);

    // Aggiorna pannello info e attiva pulsante rimuovi
    _aggiornaInfoOggettoManuale(group);
    var btnRimuovi = document.getElementById('manuale-btn-rimuovi');
    if (btnRimuovi) btnRimuovi.disabled = false;

    // Evidenzia e memorizza la riga corrispondente nel pannello destro.
    // La memoria logica è necessaria perché _selectObject() viene usato anche
    // durante l'aggiunta manuale e può quindi rimuovere la classe precedente.
    if (typeof DOM !== 'undefined' && DOM.panelItemsList && group.userData.codice) {
        var panelItem = null;
        if (group.userData.riga_id) {
            panelItem = DOM.panelItemsList.querySelector('.panel-item[data-riga-id="' + group.userData.riga_id + '"]');
        }
        if (!panelItem && group.userData.riga_key) {
            panelItem = DOM.panelItemsList.querySelector('.panel-item[data-riga-key="' + group.userData.riga_key + '"]');
        }
        if (!panelItem) {
            panelItem = DOM.panelItemsList.querySelector('.panel-item[data-codice="' + group.userData.codice + '"]');
        }
        if (panelItem) {
            if (typeof _impostaSelezionePanelManuale === 'function') {
                _impostaSelezionePanelManuale(
                    panelItem,
                    panelItem.dataset.oggettoId,
                    panelItem.dataset.codice
                );
            } else {
                panelItem.classList.add('selected');
            }
        }
    }

    // Aggiorna anche la select sinistra (panelSelectOggetto) per coerenza bidirezionale
    if (typeof DOM !== 'undefined' && DOM.panelSelectOggetto && group.userData.codice && typeof WS !== 'undefined' && WS.oggettiDisponibili) {
        var oggetto = trovaOggettoPerCodice(group.userData.codice);
        if (oggetto) {
            DOM.panelSelectOggetto.value = oggetto.id;
        }
    }
}

/**
 * Deseleziona l'oggetto corrente (rimuove wireframe blu).
 */
function _deselectObject(keepPanelSelected) {
    if (typeof _clearManualMultiSelection === 'function' &&
        Array.isArray(STATE._manualSelectedObjects) &&
        STATE._manualSelectedObjects.length > 0) {
        _clearManualMultiSelection(keepPanelSelected);
        return;
    }

    var group = STATE.selectedObject;
    if (group) {
        var toRemove = [];
        group.children.forEach(function (child) {
            if (child.userData && child.userData._isSelectionHighlight) {
                toRemove.push(child);
            }
        });
        toRemove.forEach(function (child) {
            group.remove(child);
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
    }
    STATE.selectedObject = null;

    // Una deselezione esplicita deve svuotare anche lo stato persistente della
    // riga; quando _selectObject() seleziona il nuovo mesh lo reimposta subito.
    if (!keepPanelSelected && typeof WS !== 'undefined') {
        WS._manualPanelSelectedOggettoId = null;
        WS._manualPanelSelectedCodice = null;
    }

    var btnRimuovi = document.getElementById('manuale-btn-rimuovi');
    if (btnRimuovi) btnRimuovi.disabled = true;

    // Se keepPanelSelected, mantieni visibile l'info box e la selezione panel
    if (keepPanelSelected) {
        return;
    }

    var infoEl = document.getElementById('manuale-oggetto-info');
    if (infoEl) infoEl.style.display = 'none';

    if (typeof DOM !== 'undefined' && DOM.panelItemsList) {
        DOM.panelItemsList.querySelectorAll('.panel-item.selected').forEach(function (item) {
            item.classList.remove('selected');
        });
    }
}

/**
 * Rimuove l'oggetto selezionato dalla scena 3D e dai dati.
 * Aggiorna anche il pannello destro (quantità oggetti nel carico).
 */
/**
 * Rimuove un singolo gruppo dalla scena, da STATE.oggettiMesh, dai dati
 * (STATE.dati.oggetti) e decrementa la quantità nel pannello destro.
 */
function _rimuoviGruppoManuale(group) {
    if (!group || !group.parent) return;
    var codiceRimosso = group.userData.codice;
    var rigaIdRimossa = group.userData.riga_id || null;
    var rigaKeyRimossa = group.userData.riga_key || null;

    // Rimuovi dalla scena
    if (group.parent) group.parent.remove(group);

    // Rimuovi da STATE.oggettiMesh
    var idx = STATE.oggettiMesh.indexOf(group);
    if (idx >= 0) STATE.oggettiMesh.splice(idx, 1);

    // Rimuovi dai dati (STATE.dati.oggetti) — solo UNA occorrenza
    if (STATE.dati && STATE.dati.oggetti) {
        var posApi = {
            x: group.position.x - _getTjsDimensions(group).x / 2,
            y: group.position.z - _getTjsDimensions(group).z / 2,
            z: group.position.y - _getTjsDimensions(group).y / 2
        };
        var idxDati = -1;
        for (var di = 0; di < STATE.dati.oggetti.length; di++) {
            var o = STATE.dati.oggetti[di];
            if (o.codice !== codiceRimosso) continue;
            var op = o.posizione_cm;
            if (Math.abs(op.x - posApi.x) <= 1 &&
                Math.abs(op.y - posApi.y) <= 1 &&
                Math.abs(op.z - posApi.z) <= 1) {
                idxDati = di;
                break;
            }
        }
        if (idxDati >= 0) STATE.dati.oggetti.splice(idxDati, 1);
    }

    // Aggiorna il pannello destro: diminuisci quantità o rimuovi riga
    _decrementaQtaPanelPerCodice(codiceRimosso, rigaIdRimossa, rigaKeyRimossa);
}

/**
 * Decrementa di 1 la quantità della riga del pannello col codice dato;
 * se arriva a zero rimuove la riga (con animazione e timer anti-accumulo).
 */
function _decrementaQtaPanelPerCodice(codiceRimosso, rigaId, rigaKey) {
    if (!codiceRimosso || typeof DOM === 'undefined' || !DOM.panelItemsList) return;
    var item = null;
    if (rigaId) item = DOM.panelItemsList.querySelector('.panel-item[data-riga-id="' + rigaId + '"]');
    if (!item && rigaKey) item = DOM.panelItemsList.querySelector('.panel-item[data-riga-key="' + rigaKey + '"]');
    var panelItems = item ? [item] : DOM.panelItemsList.querySelectorAll('.panel-item');
    for (var i = 0; i < panelItems.length; i++) {
        item = panelItems[i];
        if (item.dataset.codice !== codiceRimosso) continue;
        var qtyInput = item.querySelector('.panel-qty-input');
        var qty = parseInt(qtyInput.value) || 1;
        qty -= 1;
        if (qty <= 0) {
            // Mantieni temporaneamente la riga nel DOM per l'animazione,
            // ma registra subito la quantità reale (zero): così Undo
            // salva uno stato coerente anche prima del setTimeout.
            if (qtyInput) qtyInput.value = 0;
            // Rimuovi la riga dal pannello
            item.style.opacity = '0';
            item.style.transition = 'opacity 0.15s';
            var itemRef = item;
            var removalTimer = setTimeout(function () {
                // Se nel frattempo la riga è stata riutilizzata, non rimuoverla.
                if (itemRef._panelRemovalTimer !== removalTimer) return;
                itemRef._panelRemovalTimer = null;
                itemRef.remove();
                if (typeof aggiornaRiepilogoPanel === 'function') aggiornaRiepilogoPanel();
                if (typeof aggiornaStatoPulsante === 'function') aggiornaStatoPulsante();
                if (DOM.panelItemsList && DOM.panelItemsList.children.length === 0 && DOM.panelEmpty) {
                    DOM.panelEmpty.style.display = 'flex';
                }
            }, 150);
            itemRef._panelRemovalTimer = removalTimer;
        } else {
            qtyInput.value = qty;
            if (typeof aggiornaRiepilogoPanel === 'function') aggiornaRiepilogoPanel();
            if (typeof aggiornaStatoPulsante === 'function') aggiornaStatoPulsante();
        }
        break;
    }
}

function _removeSelectedObject() {
    // Con la selezione multipla attiva rimuove TUTTI gli oggetti selezionati;
    // altrimenti il singolo oggetto selezionato (comportamento precedente).
    var groups = [];
    if (Array.isArray(STATE._manualSelectedObjects) && STATE._manualSelectedObjects.length > 0) {
        groups = STATE._manualSelectedObjects.slice();
        if (STATE.selectedObject && groups.indexOf(STATE.selectedObject) === -1) {
            groups.push(STATE.selectedObject);
        }
    } else if (STATE.selectedObject) {
        groups = [STATE.selectedObject];
    }
    if (groups.length === 0) return;

    var multi = groups.length > 1;
    groups.forEach(function (group) {
        _rimuoviGruppoManuale(group);
    });

    // Segna modifiche manuali. La registrazione avviene dopo l'aggiornamento
    // della quantità nel pannello, così lo snapshot rappresenta davvero lo
    // stato corrente post-rimozione.
    if (typeof WS !== 'undefined') WS._manualDragOccurred = true;

    // Deseleziona (pulisce anche UI) — DEVE avvenire PRIMA di aggiornare lo slider,
    // altrimenti STATE.selectedObject orfano causa il ri-apparire dell'oggetto
    _deselectObject();

    // Aggiorna slider sequenza carico con il nuovo conteggio
    if (typeof _aggiornaSliderCarico === 'function') _aggiornaSliderCarico();

    // Aggiorna grafico distribuzione pesi in tempo reale se visibile
    if (typeof aggiornaGraficoPesiInTempoReale === 'function') aggiornaGraficoPesiInTempoReale();

    // Auto-selezione SOLO per la rimozione singola: l'ultimo oggetto dello
    // stesso tipo di quello rimosso (così l'utente può eliminare in serie
    // oggetti con lo stesso codice). Dopo una rimozione multipla la
    // selezione resta vuota.
    if (!multi && STATE.oggettiMesh.length > 0) {
        var codiceRimosso = groups[0].userData.codice;
        var found = null;
        if (codiceRimosso) {
            for (var j = STATE.oggettiMesh.length - 1; j >= 0; j--) {
                if (STATE.oggettiMesh[j].userData && STATE.oggettiMesh[j].userData.codice === codiceRimosso) {
                    found = STATE.oggettiMesh[j];
                    break;
                }
            }
        }
        // Fallback: se non ci sono altri oggetti dello stesso tipo, seleziona l'ultimo
        if (!found) found = STATE.oggettiMesh[STATE.oggettiMesh.length - 1];
        _selectObject(found);
    }

    if (typeof _registraModificaManuale === 'function') _registraModificaManuale();
    showToast(multi
        ? ('🗑️ ' + groups.length + ' oggetti rimossi dal carico.')
        : '🗑️ Oggetto rimosso dal carico.', 'info');
}

// =============================================================================
// INFO OGGETTO NEL PANNELLO MANUALE
// =============================================================================

function _aggiornaInfoOggettoManuale(group) {
    var infoEl = document.getElementById('manuale-oggetto-info');
    var codEl = document.getElementById('manuale-oggetto-codice');
    var posEl = document.getElementById('manuale-oggetto-pos');
    if (!infoEl || !codEl || !posEl) return;

    var ud = group.userData;
    if (!ud) return;

    var dimCm = _getTjsDimensions(group);
    var p = group.position;
    // group.position è il centro in Three.js:
    // X = lunghezza, Y = altezza(up), Z = larghezza
    var apiX = (p.x - dimCm.x / 2).toFixed(1);
    var apiY = (p.z - dimCm.z / 2).toFixed(1);
    var apiZ = (p.y - dimCm.y / 2).toFixed(1);

    infoEl.style.display = 'block';
    codEl.textContent = (ud._orientamento ? ud._orientamento + ' ' : '') + (ud.codice || 'Oggetto');
    posEl.innerHTML = 'Pos: <strong>' + apiX + ', ' + apiY + ', ' + apiZ + '</strong> ' + unitaDimensione() +
        ' | Snap: <strong>' + STATE.snapStepCm + ' ' + unitaDimensione() + '</strong>';
}

// =============================================================================
// UTILITY: FLASH OGGETTO
// =============================================================================

function _flashOggetto(group, colorHex) {
    var mesh = group.children[0];
    if (!mesh || mesh.type !== 'Mesh' || !mesh.material) return;
    // Cancella flash precedente per evitare race condition col drag
    if (group.userData._flashTimer) {
        clearTimeout(group.userData._flashTimer);
        group.userData._flashTimer = null;
    }
    var origEmissive = mesh.material.emissive ? mesh.material.emissive.clone() : new THREE.Color(0x000000);
    var origIntensity = mesh.material.emissiveIntensity || 0;
    mesh.material.emissive = new THREE.Color(colorHex);
    mesh.material.emissiveIntensity = 0.5;
    group.userData._flashTimer = setTimeout(function () {
        mesh.material.emissive = origEmissive;
        mesh.material.emissiveIntensity = origIntensity;
        group.userData._flashTimer = null;
    }, 300);
}

// =============================================================================
// CREAZIONE MESH 3D
// =============================================================================

/**
 * Crea un mesh 3D per un singolo oggetto, con lo stesso pattern di buildOggetti().
 */
function _creaMeshSingolo(dimCm, tjsPos, codice, colore, descrizione, pesoKg) {
    var tjsDim = { w: dimCm.x, h: dimCm.y, d: dimCm.z };
    var col = new THREE.Color(colore || '#447e9b');

    // Materiale principale
    var mat = new THREE.MeshPhysicalMaterial({
        color: col,
        roughness: 0.3,
        metalness: 0.1,
        clearcoat: 0.15,
        clearcoatRoughness: 0.4,
        envMapIntensity: 0.6,
    });

    var geo = new THREE.BoxGeometry(tjsDim.w, tjsDim.h, tjsDim.d);
    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, 0, 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Bordi
    var edgeMat = new THREE.LineBasicMaterial({
        color: 0x333333,
        transparent: true,
        opacity: 0.55,
    });
    var edgeGeo = new THREE.EdgesGeometry(geo);
    var edges = new THREE.LineSegments(edgeGeo, edgeMat);
    edges.position.set(0, 0, 0);
    edges.userData.isEdge = true;

    // Bordi spessi
    var edgeMat2 = new THREE.LineBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.18,
    });
    var edgeGeo2 = new THREE.EdgesGeometry(new THREE.BoxGeometry(tjsDim.w + 2, tjsDim.h + 2, tjsDim.d + 2));
    var edges2 = new THREE.LineSegments(edgeGeo2, edgeMat2);
    edges2.position.set(0, 0, 0);
    edges2.userData.isEdge = true;

    // userData
    var apiX = (tjsPos.x - dimCm.x / 2).toFixed(1);
    var apiY = (tjsPos.z - dimCm.z / 2).toFixed(1);
    var apiZ = (tjsPos.y - dimCm.y / 2).toFixed(1);
    mesh.userData = {
        codice: codice,
        descrizione: descrizione || '-',
        dimensione: dimCm.x.toFixed(1) + ' × ' + dimCm.z.toFixed(1) + ' × ' + dimCm.y.toFixed(1) + ' ' + unitaDimensione(),
        posizione: apiX + ', ' + apiY + ', ' + apiZ + ' ' + unitaDimensione(),
        peso: pesoKg || 0,
        pesoSopra: 0,
        rotazione: 'LxPxH',
        colore: colore || '#447e9b',
        index: STATE.oggettiMesh.length,
        _baseY: 0,
        _posZ: parseFloat(apiZ),
        _tjsDimCm: { x: dimCm.x, y: dimCm.y, z: dimCm.z },
        _orientamento: 'LxPxH',
    };

    // Decal con codice
    var decalCanvas = document.createElement('canvas');
    var decalCtx = decalCanvas.getContext('2d');
    var decalText = codice;
    var decalFontSize = 56;

    decalCtx.font = 'bold ' + decalFontSize + 'px "Segoe UI", Arial, sans-serif';
    var decalMetrics = decalCtx.measureText(decalText);
    var decalTextW = decalMetrics.width;
    var decalPadX = 28;
    var decalH = decalFontSize * 1.6;
    var decalW = decalTextW + decalPadX * 2;

    decalCanvas.width = Math.ceil(decalW);
    decalCanvas.height = Math.ceil(decalH);

    decalCtx.fillStyle = 'rgba(0,0,0,0.78)';
    decalCtx.beginPath();
    decalCtx.roundRect(0, 0, decalCanvas.width, decalCanvas.height, 10);
    decalCtx.fill();

    decalCtx.fillStyle = colore || '#447e9b';
    decalCtx.fillRect(0, 0, 8, decalCanvas.height);

    decalCtx.font = 'bold ' + decalFontSize + 'px "Segoe UI", Arial, sans-serif';
    decalCtx.fillStyle = '#ffffff';
    decalCtx.textAlign = 'center';
    decalCtx.textBaseline = 'middle';
    decalCtx.shadowColor = 'rgba(0,0,0,0.4)';
    decalCtx.shadowBlur = 4;
    decalCtx.fillText(decalText, decalCanvas.width / 2, decalCanvas.height / 2);

    var decalTexture = new THREE.CanvasTexture(decalCanvas);
    decalTexture.minFilter = THREE.LinearFilter;
    decalTexture.magFilter = THREE.LinearFilter;
    decalTexture.needsUpdate = true;

    var sharedDecalMat = new THREE.MeshBasicMaterial({
        map: decalTexture,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        side: THREE.DoubleSide,
    });

    var aspect = decalW / decalH;
    var OFF = 0.5;
    var w = tjsDim.w, h = tjsDim.h, d = tjsDim.d;

    var faceDefs = [
        { pos: [0, 0,  d/2 + OFF], fW: w, fH: h, rot: [0, 0, 0] },
        { pos: [0, 0, -d/2 - OFF], fW: w, fH: h, rot: [0, Math.PI, 0] },
        { pos: [ w/2 + OFF, 0, 0], fW: d, fH: h, rot: [0, Math.PI/2, 0] },
        { pos: [-w/2 - OFF, 0, 0], fW: d, fH: h, rot: [0, -Math.PI/2, 0] },
        { pos: [0,  h/2 + OFF, 0], fW: w, fH: d, rot: [-Math.PI/2, 0, 0] },
        { pos: [0, -h/2 - OFF, 0], fW: w, fH: d, rot: [Math.PI/2, 0, 0] },
    ];

    var decalGroup = new THREE.Group();
    var decalFaces = [];

    faceDefs.forEach(function (def) {
        var maxH = def.fH * 0.55;
        var maxW = def.fW * 0.75;
        var physH = maxH;
        var physW = physH * aspect;
        if (physW > maxW) { physW = maxW; physH = physW / aspect; }

        var planeGeo = new THREE.PlaneGeometry(physW, physH);
        var plane = new THREE.Mesh(planeGeo, sharedDecalMat);
        plane.position.set(def.pos[0], def.pos[1], def.pos[2]);
        plane.rotation.set(def.rot[0], def.rot[1], def.rot[2]);
        plane.visible = false;
        decalGroup.add(plane);
        decalFaces.push(plane);
    });

    decalFaces[0].visible = STATE.mostraEtichetteOggetti;
    mesh.userData._decalFaces = decalFaces;

    // itemGroup
    var itemGroup = new THREE.Group();
    mesh.add(decalGroup);
    itemGroup.add(mesh);
    itemGroup.add(edges);
    itemGroup.add(edges2);
    itemGroup.position.set(tjsPos.x, tjsPos.y, tjsPos.z);
    itemGroup.userData = mesh.userData;

    return itemGroup;
}

/**
 * Calcola gli orientamenti validi per un oggetto dell'anagrafica.
 * Versione standalone (senza THREE.Group), usata da _trovaPosizione3D.
 * @param {number} L - lunghezza API in cm
 * @param {number} P - larghezza API in cm
 * @param {number} H - altezza API in cm
 * @param {Object} oggetto - oggetto da WS.oggettiDisponibili (per ID e vincoli)
 * @returns {Array<{label: string, tjsDims: {x, y, z}}>}
 */
function _calcolaOrientamentiDaAnagrafica(L, P, H, oggetto) {
    var vincoli = {};
    if (oggetto && typeof WS !== 'undefined' && WS.vincoli) {
        var v = WS.vincoli.find(function (x) { return x.oggetto_id == oggetto.id; });
        if (v) vincoli = v;
    }

    // Se rotazione completamente disabilitata
    if (vincoli.rotazione_consentita === false) {
        return [{ label: 'LxPxH', tjsDims: { x: L, y: H, z: P } }];
    }

    var all = [];
    // LxPxH (sempre presente)
    all.push({ label: 'LxPxH', api: [L, P, H] });
    // PxLxH (rotazione_su_z)
    if (vincoli.rotazione_su_z !== false) {
        all.push({ label: 'PxLxH', api: [P, L, H] });
    }
    // LxHxP (rotazione_su_x)
    if (vincoli.rotazione_su_x !== false) {
        all.push({ label: 'LxHxP', api: [L, H, P] });
    }
    // HxPxL (rotazione_su_y)
    if (vincoli.rotazione_su_y !== false) {
        all.push({ label: 'HxPxL', api: [H, P, L] });
    }
    // PxHxL e HxLxP (tutti e 3)
    if (vincoli.rotazione_su_x !== false && vincoli.rotazione_su_y !== false && vincoli.rotazione_su_z !== false) {
        all.push({ label: 'PxHxL', api: [P, H, L] });
        all.push({ label: 'HxLxP', api: [H, L, P] });
    }

    // Converti in TJS: {x: w=L, y: h=H, z: d=P}
    return all.map(function (o) {
        return { label: o.label, tjsDims: { x: o.api[0], y: o.api[2], z: o.api[1] } };
    });
}

/**
 * Cerca il primo slot libero a PAVIMENTO per un oggetto (scan 2D su X e Z).
 * @param {Object} dimCm - dimensioni in cm Three.js {x: w, y: h, z: d}
 * @param {Object} cDim - dimensioni contenitore {x, y, z} in API
 * @param {number} step - passo griglia in cm
 * @returns {THREE.Vector3|null} posizione centro TJS, o null
 */
// =============================================================================
// STRATEGIA DI PIAZZAMENTO (toggle nella barra manuale)
// =============================================================================
var _strategiaPiazzamento = 'muro';  // 'muro' = Z→Y→X, 'colonne' = X→Z→Y
var _massimaSporgenzaPct = 100;      // 100 = nessuna restrizione, 50 = max 50% di sbalzo

/**
 * Verifica la percentuale di supporto in X e Z per un oggetto piazzato sopra il pavimento.
 * Cerca tutti gli oggetti il cui top coincide col bottom dell'oggetto in test,
 * e prende il MIGLIOR supporto dal singolo oggetto sotto (non l'unione).
 * Questo impedisce all'oggetto di "fare da ponte" tra due oggetti separati.
 * @param {THREE.Vector3} testPos - posizione candidata
 * @param {Object} dimCm - dimensioni Three.js
 * @returns {{x: number, z: number}} percentuali di supporto (0-100)
 */
function _getSupportRatio(testPos, dimCm) {
    var testMinX = testPos.x - dimCm.x / 2;
    var testMaxX = testPos.x + dimCm.x / 2;
    var testMinZ = testPos.z - dimCm.z / 2;
    var testMaxZ = testPos.z + dimCm.z / 2;
    var bottomY = testPos.y - dimCm.y / 2;

    var maxSupportX = 0;
    var maxSupportZ = 0;
    var tolerance = STATE.snapStepCm / 2;

    for (var i = 0; i < STATE.oggettiMesh.length; i++) {
        var other = STATE.oggettiMesh[i];
        if (!other.visible) continue;
        var otherDim = _getTjsDimensions(other);
        var otherTopY = other.position.y + otherDim.y / 2;

        // L'oggetto sotto deve avere il top all'altezza del nostro bottom
        if (Math.abs(otherTopY - bottomY) > tolerance) continue;

        var otherMinX = other.position.x - otherDim.x / 2;
        var otherMaxX = other.position.x + otherDim.x / 2;
        var otherMinZ = other.position.z - otherDim.z / 2;
        var otherMaxZ = other.position.z + otherDim.z / 2;

        // Le impronte XZ si toccano?
        if (testMinX < otherMaxX && testMaxX > otherMinX &&
            testMinZ < otherMaxZ && testMaxZ > otherMinZ) {
            var overlapX = Math.min(testMaxX, otherMaxX) - Math.max(testMinX, otherMinX);
            var overlapZ = Math.min(testMaxZ, otherMaxZ) - Math.max(testMinZ, otherMinZ);
            maxSupportX = Math.max(maxSupportX, overlapX);
            maxSupportZ = Math.max(maxSupportZ, overlapZ);
        }
    }

    return {
        x: dimCm.x > 0 ? (maxSupportX / dimCm.x) * 100 : 100,
        z: dimCm.z > 0 ? (maxSupportZ / dimCm.z) * 100 : 100
    };
}

/**
 * Controlla che un oggetto sopra il pavimento abbia supporto sufficiente.
 * @returns {boolean} true se il supporto è adeguato (o se siamo a pavimento)
 */
function _checkSupport(testPos, dimCm) {
    // Se la sporgenza max è 100%, nessuna restrizione
    if (_massimaSporgenzaPct >= 100) return true;
    // Se siamo a pavimento (o quasi), non serve controllo
    var halfY = dimCm.y / 2;
    if (testPos.y <= halfY + 1) return true;

    var support = _getSupportRatio(testPos, dimCm);
    var minSupport = 100 - _massimaSporgenzaPct;
    return support.x >= minSupport && support.z >= minSupport;
}

/**
 * Strategia "Muro Completo": Z (larghezza) → Y (altezza) → X (lunghezza).
 * Tue coordinate API: Y (larghezza) → Z (altezza) → X (lunghezza).
 * Riempie una fetta di larghezza completa (pavimento + stack), poi avanza in lunghezza.
 */
function _scan3D_ZYX(dimCm, cDim, step) {
    var halfX = dimCm.x / 2;
    var halfY = dimCm.y / 2;
    var halfZ = dimCm.z / 2;

    for (var z = halfZ; z <= cDim.y - halfZ; z += step) {
        for (var y = halfY; y <= cDim.z - halfY; y += step) {
            for (var x = halfX; x <= cDim.x - halfX; x += step) {
                var testPos = new THREE.Vector3(x, y, z);
                if (!_checkCollisionWithOthers(null, testPos, dimCm) && _checkSupport(testPos, dimCm)) {
                    return testPos;
                }
            }
        }
    }
    return null;
}

/**
 * Strategia "Colonne Immediate": X (lunghezza) → Z (larghezza) → Y (altezza).
 * Tue coordinate API: X (lunghezza) → Y (larghezza) → Z (altezza).
 * Per ogni X, riempi tutta la larghezza al pavimento, poi impila in altezza, poi passa alla X successiva.
 * Impila subito: già dopo 2-3 oggetti inizia lo stacking.
 */
function _scan3D_XZY(dimCm, cDim, step) {
    var halfX = dimCm.x / 2;
    var halfY = dimCm.y / 2;
    var halfZ = dimCm.z / 2;

    for (var x = halfX; x <= cDim.x - halfX; x += step) {
        for (var z = halfZ; z <= cDim.y - halfZ; z += step) {
            for (var y = halfY; y <= cDim.z - halfY; y += step) {
                var testPos = new THREE.Vector3(x, y, z);
                if (!_checkCollisionWithOthers(null, testPos, dimCm) && _checkSupport(testPos, dimCm)) {
                    return testPos;
                }
            }
        }
    }
    return null;
}


/**
 * Cerca posizione libera in 3D provando TUTTI gli orientamenti validi.
 * La strategia di scan è controllata da _strategiaPiazzamento:
 *   'muro'    → Z→Y→X (larghezza→altezza→lunghezza) — riempie una fetta completa
 *   'colonne' → X→Z→Y (lunghezza→larghezza→altezza) — impila subito a colonne
 *
 * @param {number} L - lunghezza API in cm
 * @param {number} P - larghezza API in cm
 * @param {number} H - altezza API in cm
 * @param {Object} oggetto - oggetto da WS.oggettiDisponibili
 * @returns {{pos: THREE.Vector3, label: string}|null} posizione + orientamento, o null
 */
function _trovaPosizione3D(L, P, H, oggetto) {
    if (!STATE.dati || !STATE.dati.contenitore) return null;
    var cDim = STATE.dati.contenitore.dimensioni_cm;
    var step = STATE.snapStepCm;

    // Controllo rapido: l'oggetto in almeno un orientamento entra nel contenitore?
    var orientamenti = _calcolaOrientamentiDaAnagrafica(L, P, H, oggetto);

    for (var oi = 0; oi < orientamenti.length; oi++) {
        var dimCm = orientamenti[oi].tjsDims;
        var halfX = dimCm.x / 2;
        var halfY = dimCm.y / 2;
        var halfZ = dimCm.z / 2;

        // Salta se le dimensioni eccedono il contenitore
        if (dimCm.x > cDim.x || dimCm.y > cDim.z || dimCm.z > cDim.y) continue;

        var pos3d = (_strategiaPiazzamento === 'colonne') ? _scan3D_XZY(dimCm, cDim, step) : _scan3D_ZYX(dimCm, cDim, step);
        if (pos3d) {
            return { pos: pos3d, label: orientamenti[oi].label, dims: dimCm };
        }
    }

    return null;
}

/**
 * Sincronizza la quantità nel pannello destro con gli oggetti realmente
 * presenti nella scena manuale.
 *
 * L'oggetto è già stato aggiunto alla scena quando questa funzione viene
 * chiamata: incrementare il valore precedente causava quindi il passaggio
 * errato da 1 a 2 al primo inserimento. Il conteggio della scena mantiene
 * invece la riga coerente: primo oggetto = 1, secondo oggetto = 2, ecc.
 * Se il panel item non esiste (ad esempio dopo la rimozione dell'ultima riga),
 * viene ricreato con quantità 1.
 *
 * @param {number} oggettoId - ID dell'oggetto in anagrafica
 * @param {string} codice - codice oggetto (per lookup fallback)
 */
function _assicuraObserverSelezionePanelManuale() {
    if (typeof DOM === 'undefined' || !DOM.panelItemsList ||
        typeof WS === 'undefined' || typeof MutationObserver === 'undefined') return;
    if (WS._manualPanelSelectionObserver) return;

    WS._manualPanelSelectionObserver = new MutationObserver(function () {
        var selectedId = WS._manualPanelSelectedOggettoId;
        var selectedRigaId = WS._manualPanelSelectedRigaId;
        var selectedRigaKey = WS._manualPanelSelectedRigaKey;
        if ((!selectedId && !selectedRigaId && !selectedRigaKey) || !DOM.panelItemsList) return;

        var target = Array.from(DOM.panelItemsList.querySelectorAll('.panel-item')).find(function (row) {
            return (selectedRigaId && row.dataset.rigaId === String(selectedRigaId)) ||
                (selectedRigaKey && row.dataset.rigaKey === String(selectedRigaKey)) ||
                (!selectedRigaId && !selectedRigaKey && row.dataset.oggettoId === String(selectedId));
        });
        if (!target) return;

        var selectedRows = DOM.panelItemsList.querySelectorAll('.panel-item.selected');
        if (target.classList.contains('selected') && selectedRows.length === 1) return;

        selectedRows.forEach(function (row) {
            if (row !== target) row.classList.remove('selected');
        });
        target.classList.add('selected');
    });
    WS._manualPanelSelectionObserver.observe(DOM.panelItemsList, {
        childList: true,
        subtree: true,
    });
}

function _impostaSelezionePanelManuale(item, oggettoId, codice) {
    // Questa selezione persistente serve esclusivamente al flusso manuale.
    // L'automatica non deve ereditare né creare stato di selezione del panel.
    if (typeof DOM === 'undefined' || !DOM.panelItemsList ||
        typeof WS === 'undefined' || !WS.manualMode) return;

    _assicuraObserverSelezionePanelManuale();

    var target = item && item.isConnected ? item : null;
    if (!target && oggettoId) {
        target = Array.from(DOM.panelItemsList.querySelectorAll('.panel-item')).find(function (row) {
            return row.dataset.oggettoId === String(oggettoId);
        });
    }
    if (!target && codice) {
        target = Array.from(DOM.panelItemsList.querySelectorAll('.panel-item')).find(function (row) {
            return row.dataset.codice === codice;
        });
    }
    if (!target) return;

    WS._manualPanelSelectedOggettoId = target.dataset.oggettoId || String(oggettoId || '');
    WS._manualPanelSelectedCodice = target.dataset.codice || String(codice || '');
    WS._manualPanelSelectedRigaId = target.dataset.rigaId || null;
    WS._manualPanelSelectedRigaKey = target.dataset.rigaKey || null;

    DOM.panelItemsList.querySelectorAll('.panel-item.selected').forEach(function (row) {
        if (row !== target) row.classList.remove('selected');
    });
    target.classList.add('selected');
}

function _ripristinaSelezionePanelManuale(item, oggettoId, codice) {
    _impostaSelezionePanelManuale(item, oggettoId, codice);
}

function _incrementaPanelQty(oggettoId, codice, rigaId, rigaKey) {
    if (typeof DOM === 'undefined' || !DOM.panelItemsList) return;

    // Prima cerca il lotto preciso; il codice è solo fallback per i legacy.
    var item = rigaId
        ? DOM.panelItemsList.querySelector('.panel-item[data-riga-id="' + rigaId + '"]')
        : null;
    if (!item && rigaKey) {
        item = DOM.panelItemsList.querySelector('.panel-item[data-riga-key="' + rigaKey + '"]');
    }
    if (!item && codice) {
        // Fallback: cerca per codice
        var items = DOM.panelItemsList.querySelectorAll('.panel-item');
        for (var i = 0; i < items.length; i++) {
            if (items[i].dataset.codice === codice) { item = items[i]; break; }
        }
    }

    if (item) {
        // Se la riga era in attesa di rimozione, l'utente l'ha riutilizzata:
        // annulla l'animazione per evitare che venga rimossa dopo il reinserimento.
        if (item._panelRemovalTimer) {
            clearTimeout(item._panelRemovalTimer);
            item._panelRemovalTimer = null;
            item.style.opacity = '';
            item.style.transition = '';
        }

        // Il mesh è già presente: usa il conteggio reale della scena,
        // senza sommare nuovamente l'oggetto appena aggiunto.
        var quantitaInScena = 0;
        if (typeof STATE !== 'undefined' && Array.isArray(STATE.oggettiMesh)) {
            STATE.oggettiMesh.forEach(function (mesh) {
                if (mesh && mesh.parent === STATE.scene && mesh.userData &&
                    mesh.userData.codice === codice) {
                    var stessoLotto = (rigaId && String(mesh.userData.riga_id) === String(rigaId)) ||
                        (rigaKey && mesh.userData.riga_key === rigaKey) ||
                        (!rigaId && !rigaKey);
                    if (stessoLotto) quantitaInScena += 1;
                }
            });
        }

        var qtyInput = item.querySelector('.panel-qty-input');
        if (qtyInput && quantitaInScena > 0) {
            qtyInput.value = quantitaInScena;
        }
        // Mostra pannello vuoto nascosto
        if (DOM.panelEmpty) DOM.panelEmpty.style.display = 'none';
        if (typeof aggiornaRiepilogoPanel === 'function') aggiornaRiepilogoPanel();
        if (typeof aggiornaStatoPulsante === 'function') aggiornaStatoPulsante();
    } else if (typeof aggiungiAlCarico === 'function') {
        // Panel item non esiste: crealo con il primo oggetto già piazzato
        aggiungiAlCarico(oggettoId, 1, true);
    }
}

/**
 * Recupera la riga attiva del pannello per l'inserimento manuale.
 *
 * La riga può perdere temporaneamente la classe `.selected` quando
 * `_selectObject()` aggiorna la selezione 3D o quando il pannello aggiorna la
 * quantità. In quel caso usiamo prima l'ID persistente e poi l'oggetto 3D
 * attualmente selezionato, che è la stessa memoria usata da Rimuovi.
 */
function _getManualeSelectedPanelItem() {
    if (typeof DOM === 'undefined' || !DOM.panelItemsList) return null;

    var item = DOM.panelItemsList.querySelector('.panel-item.selected');
    if (!item && typeof WS !== 'undefined' && WS._manualPanelSelectedRigaId) {
        item = DOM.panelItemsList.querySelector(
            '.panel-item[data-riga-id="' + WS._manualPanelSelectedRigaId + '"]'
        );
    }
    if (!item && typeof WS !== 'undefined' && WS._manualPanelSelectedRigaKey) {
        item = DOM.panelItemsList.querySelector(
            '.panel-item[data-riga-key="' + WS._manualPanelSelectedRigaKey + '"]'
        );
    }
    if (!item && typeof WS !== 'undefined' && WS._manualPanelSelectedOggettoId) {
        item = DOM.panelItemsList.querySelector(
            '.panel-item[data-oggetto-id="' + WS._manualPanelSelectedOggettoId + '"]'
        );
    }
    if (!item && typeof STATE !== 'undefined' && STATE.selectedObject &&
        STATE.selectedObject.userData && STATE.selectedObject.userData.codice) {
        var codiceSelezionato = STATE.selectedObject.userData.codice;
        item = Array.from(DOM.panelItemsList.querySelectorAll('.panel-item')).find(function (row) {
            return row.dataset.codice === codiceSelezionato;
        });
    }

    if (item && typeof _impostaSelezionePanelManuale === 'function') {
        _impostaSelezionePanelManuale(item, item.dataset.oggettoId, item.dataset.codice);
    }
    return item;
}

/**
 * Aggiunge alla scena 3D l'oggetto selezionato nel pannello destro.
 * Recupera la riga anche se la classe `.selected` è stata temporaneamente
 * rimossa durante l'aggiornamento della scena.
 */
function _aggiungiOggettoDaPanel() {
    // Solo in modalità manuale
    if (typeof WS === 'undefined' || !WS.manualMode) {
        showToast('⚠️ Passa al tab "Manuale" per aggiungere oggetti alla scena.', 'warning');
        return;
    }

    // Controlla che la scena 3D sia attiva
    if (!STATE.scene) {
        showToast('⚠️ Avvia prima la visualizzazione 3D (seleziona un mezzo).', 'warning');
        return;
    }

    // Trova l'oggetto selezionato nel pannello destro, con fallback sulla
    // selezione persistente e sull'oggetto 3D attivo.
    var selectedItem = _getManualeSelectedPanelItem();
    if (!selectedItem) {
        showToast('⚠️ Seleziona un oggetto nel pannello destro "Oggetti nel Carico".', 'warning');
        return;
    }

    // Conserva la riga selezionata: _selectObject() seleziona il nuovo mesh
    // e, per sincronizzare scena/pannello, rimuove temporaneamente la classe
    // selected dalle righe del pannello.
    var selectedPanelItem = selectedItem;
    var selectedPanelOggettoId = selectedItem.dataset.oggettoId;
    var selectedPanelCodice = selectedItem.dataset.codice;
    var selectedPanelRigaId = selectedItem.dataset.rigaId || null;
    var selectedPanelRigaKey = selectedItem.dataset.rigaKey || null;
    // Il ghost deve mantenere il lotto selezionato fino alla conferma.
    _ghostState.riga_id = selectedPanelRigaId;
    _ghostState.riga_key = selectedPanelRigaKey;

    var oggettoId = parseInt(selectedItem.dataset.oggettoId);
    if (!oggettoId) {
        showToast('⚠️ Oggetto non valido.', 'warning');
        return;
    }

    var oggetto = trovaOggetto(oggettoId);
    if (!oggetto) {
        showToast('⚠️ Oggetto non trovato in anagrafica.', 'warning');
        return;
    }

    // Converti dimensioni da mm a cm
    var L = oggetto.lunghezza_mm / 10;
    var P = oggetto.larghezza_mm / 10;
    var H = oggetto.altezza_mm / 10;

    // dimCm in TJS: {x: w=L, y: h=H, z: d=P}
    var dimCm = { x: L, y: H, z: P };

    // Controlla che l'oggetto entri nel contenitore (se disponibile)
    var cDim = null;
    if (STATE.dati && STATE.dati.contenitore) {
        cDim = STATE.dati.contenitore.dimensioni_cm;
    } else if (STATE.containerMesh) {
        // Fallback: estrai dimensioni dal mesh contenitore
        var contMesh = STATE.containerMesh.children[0];
        if (contMesh && contMesh.geometry && contMesh.geometry.parameters) {
            var cp = contMesh.geometry.parameters;
            cDim = { x: cp.width, y: cp.depth, z: cp.height };
        }
    }
    if (cDim) {
        if (L > cDim.x || P > cDim.y || H > cDim.z) {
            showToast('⚠️ L\'oggetto è più grande del contenitore!', 'error');
            return;
        }
    }

    // Ghost mode ON → piazzamento interattivo col fantasma
    // Ghost mode OFF → piazzamento automatico con algoritmo
    if (_ghostModeEnabled) {
        // Il colore della riga (se personalizzato) ha precedenza su quello
        // dell'anagrafica, così anche in ghost mode due lotti con lo stesso
        // codice restano distinguibili.
        _attivaModalitaGhost(oggetto, coloreRiga(selectedItem));
    } else {
        // Auto-place: trova posizione libera con algoritmo 3D
        var risultato = _trovaPosizione3D(L, P, H, oggetto);
        if (!risultato) {
            showToast('⚠️ Nessuno slot libero trovato per ' + oggetto.codice + '. Attiva Ghost per piazzamento manuale.', 'warning');
            return;
        }
        var codice = oggetto.codice;
        var descrizione = oggetto.descrizione || '';
        // Il colore della riga (se personalizzato) ha precedenza su quello
        // dell'anagrafica, così anche in modalità manuale due lotti con lo
        // stesso codice restano distinguibili.
        var colore = coloreRiga(selectedItem);
        var pesoKg = oggetto.peso_kg || 0;
        var nuovoItem = _creaMeshSingolo(risultato.dims, risultato.pos, codice, colore, descrizione, pesoKg);
        nuovoItem.userData._orientamento = risultato.label;
        nuovoItem.userData.riga_id = selectedPanelRigaId;
        nuovoItem.userData.riga_key = selectedPanelRigaKey;
        STATE.scene.add(nuovoItem);
        STATE.oggettiMesh.push(nuovoItem);
        if (typeof WS !== 'undefined') WS._manualDragOccurred = true;

        // Aggiorna slider e grafico distribuzione pesi in tempo reale
        if (typeof _aggiornaSliderCarico === 'function') _aggiornaSliderCarico();
        if (typeof aggiornaGraficoPesiInTempoReale === 'function') aggiornaGraficoPesiInTempoReale();

        _flashOggetto(nuovoItem, 0x00ff00);
        _selectObject(nuovoItem);
        showToast('✅ ' + codice + ' piazzato (' + risultato.label + ')', 'success');
        _incrementaPanelQty(oggetto.id, codice, selectedPanelRigaId, selectedPanelRigaKey);
        // Ripristina la riga solo dopo l'aggiornamento della quantità, che
        // conclude tutte le modifiche al pannello.
        _ripristinaSelezionePanelManuale(
            selectedPanelItem,
            selectedPanelOggettoId,
            selectedPanelCodice || codice
        );
        // _incrementaPanelQty aggiorna quantità e riepiloghi: ora lo snapshot
        // include sia il nuovo mesh sia la quantità aggiornata.
        if (typeof _registraModificaManuale === 'function') _registraModificaManuale();
        _ripristinaSelezionePanelManuale(
            selectedPanelItem,
            selectedPanelOggettoId,
            selectedPanelCodice || codice
        );
    }
}

