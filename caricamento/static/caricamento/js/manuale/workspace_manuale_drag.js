/**
 * Workspace Carico 3D — Modalità Manuale: Drag & Rotazione
 *
 * Gestisce il drag & drop degli oggetti nella scena 3D e la rotazione.
 * Dipende da: workspace_manuale.js (core)
 */

function _calcolaOrientamentiValidi(group) {
    var ud = group.userData;
    if (!ud || !ud.codice) return [{ label: 'LxPxH', tjsDims: _getTjsDimensions(group) }];

    // Dimensioni originali: preferisci da anagrafica WS, altrimenti da tjsDimCm corrente
    var L, P, H;
    var vincoli = {};

    var oggetto = null;        if (typeof WS !== 'undefined' && (WS.oggettiCatalog || WS.oggettiDisponibili)) {
            oggetto = trovaOggettoPerCodice(ud.codice);
    }

    if (oggetto) {
        L = oggetto.lunghezza_mm / 10;
        P = oggetto.larghezza_mm / 10;
        H = oggetto.altezza_mm / 10;

        if (typeof WS !== 'undefined' && WS.vincoli) {
            var v = WS.vincoli.find(function (x) { return x.oggetto_id == oggetto.id; });
            if (v) vincoli = v;
        }
    } else {
        // Fallback: usa dimensioni correnti Three.js
        var curDims = _getTjsDimensions(group);
        L = curDims.x;
        P = curDims.z;
        H = curDims.y;
        // Senza dati anagrafica, assumiamo tutte le rotazioni permesse (default DB)
    }

    // Se rotazione completamente disabilitata (solo se esplicitamente false)
    if (vincoli.rotazione_consentita === false) {
        return [{ label: 'LxPxH', tjsDims: { x: L, y: H, z: P } }];
    }

    // Costruisci la lista: label → [API_l, API_p, API_h] → Three.js {x, y, z}
    // Default: se il flag non esiste (undefined) → rotazione PERMESSA (default DB)
    var all = [];

    // LxPxH (sempre presente)
    all.push({ label: 'LxPxH', api: [L, P, H] });

    // PxLxH (rotazione_su_z: swap X↔Y in API → swap lunghezza↔larghezza)
    if (vincoli.rotazione_su_z !== false) {
        all.push({ label: 'PxLxH', api: [P, L, H] });
    }

    // LxHxP (rotazione_su_x: swap Y↔Z in API → swap larghezza↔altezza)
    if (vincoli.rotazione_su_x !== false) {
        all.push({ label: 'LxHxP', api: [L, H, P] });
    }

    // HxPxL (rotazione_su_y: swap X↔Z in API → swap lunghezza↔altezza)
    if (vincoli.rotazione_su_y !== false) {
        all.push({ label: 'HxPxL', api: [H, P, L] });
    }

    // PxHxL e HxLxP (tutti e 3 gli assi permessi)
    if (vincoli.rotazione_su_x !== false && vincoli.rotazione_su_y !== false && vincoli.rotazione_su_z !== false) {
        all.push({ label: 'PxHxL', api: [P, H, L] });
        all.push({ label: 'HxLxP', api: [H, L, P] });
    }

    // Converti API dims → Three.js dims: {x: API_l, y: API_h, z: API_p}
    // (Three.js: X=lunghezza, Y=altezza(up), Z=larghezza)
    return all.map(function (o) {
        return {
            label: o.label,
            tjsDims: { x: o.api[0], y: o.api[2], z: o.api[1] }
        };
    });
}

// =============================================================================
// ROTAZIONE: RICOSTRUZIONE MESH CON NUOVO ORIENTAMENTO
// =============================================================================

/**
 * Ricostruisce la mesh dell'oggetto con le nuove dimensioni Three.js.
 * Mantiene la stessa posizione (itemGroup.position).
 */
function _ricostruisciMeshOrientamento(group, nuovoOrientamento) {
    var ud = group.userData;
    if (!ud) return;

    var newDims = nuovoOrientamento.tjsDims;  // {x: w, y: h, z: d}
    var oldDims = _getTjsDimensions(group);

    // Se le dimensioni non sono cambiate, non fare nulla
    if (Math.abs(newDims.x - oldDims.x) < 0.01 &&
        Math.abs(newDims.y - oldDims.y) < 0.01 &&
        Math.abs(newDims.z - oldDims.z) < 0.01) {
        ud._orientamento = nuovoOrientamento.label;
        return;
    }

    var mesh = group.children[0];
    if (!mesh || mesh.type !== 'Mesh') return;

    // Salva il materiale esistente (lo riusiamo)
    var oldMaterial = mesh.material;

    // Trova i bordi (edges e edges2 sono i figli 1 e 2 di group)
    var edges = group.children[1];
    var edges2 = group.children[2];

    // Salva i riferimenti alle decal
    var decalFaces = ud._decalFaces;

    // Crea nuova geometria
    var newGeo = new THREE.BoxGeometry(newDims.x, newDims.y, newDims.z);

    // Sostituisci geometria mesh
    if (mesh.geometry) mesh.geometry.dispose();
    mesh.geometry = newGeo;

    // Ricostruisci bordi
    if (edges && edges.userData && edges.userData.isEdge) {
        if (edges.geometry) edges.geometry.dispose();
        edges.geometry = new THREE.EdgesGeometry(newGeo);
    }
    if (edges2 && edges2.userData && edges2.userData.isEdge) {
        if (edges2.geometry) edges2.geometry.dispose();
        var thickGeo = new THREE.BoxGeometry(newDims.x + 2, newDims.y + 2, newDims.z + 2);
        edges2.geometry = new THREE.EdgesGeometry(thickGeo);
    }

    // Aggiorna userData
    ud._tjsDimCm = { x: newDims.x, y: newDims.y, z: newDims.z };
    ud._orientamento = nuovoOrientamento.label;
    ud.rotazione = nuovoOrientamento.label;

    // Ricostruisci decal faces (devono adattarsi alle nuove dimensioni)
    _ricostruisciDecalFaces(mesh, newDims, ud, decalFaces);

    // Forza update materiale
    if (oldMaterial) oldMaterial.needsUpdate = true;
}

/**
 * Ricostruisce le facce decal con le nuove dimensioni.
 */
function _ricostruisciDecalFaces(mesh, newDims, ud, oldDecalFaces) {
    // Rimuovi vecchie decal
    if (oldDecalFaces) {
        oldDecalFaces.forEach(function (face) {
            if (face.parent) face.parent.remove(face);
            if (face.geometry) face.geometry.dispose();
        });
    }

    // Crea nuove decal
    var decalCanvas = document.createElement('canvas');
    var decalCtx = decalCanvas.getContext('2d');
    var decalText = ud.codice || '';
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

    decalCtx.fillStyle = ud.colore || '#447e9b';
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
    var w = newDims.x, h = newDims.y, d = newDims.z;

    var faceDefs = [
        { pos: [0, 0,  d/2 + OFF], fW: w, fH: h, rot: [0, 0, 0] },
        { pos: [0, 0, -d/2 - OFF], fW: w, fH: h, rot: [0, Math.PI, 0] },
        { pos: [ w/2 + OFF, 0, 0], fW: d, fH: h, rot: [0, Math.PI/2, 0] },
        { pos: [-w/2 - OFF, 0, 0], fW: d, fH: h, rot: [0, -Math.PI/2, 0] },
        { pos: [0,  h/2 + OFF, 0], fW: w, fH: d, rot: [-Math.PI/2, 0, 0] },
        { pos: [0, -h/2 - OFF, 0], fW: w, fH: d, rot: [Math.PI/2, 0, 0] },
    ];

    var decalGroup = mesh.children[0]; // il primo figlio della mesh è il decalGroup
    if (!decalGroup) {
        decalGroup = new THREE.Group();
        mesh.add(decalGroup);
    }

    var newDecalFaces = [];
    faceDefs.forEach(function (def) {
        var maxH = def.fH * 0.55;
        var maxW = def.fW * 0.75;
        var physH = maxH;
        var physW = physH * aspect;
        if (physW > maxW) { physW = maxW; physH = physW / aspect; }

        var geo = new THREE.PlaneGeometry(physW, physH);
        var plane = new THREE.Mesh(geo, sharedDecalMat);
        plane.position.set(def.pos[0], def.pos[1], def.pos[2]);
        plane.rotation.set(def.rot[0], def.rot[1], def.rot[2]);
        plane.visible = false;
        decalGroup.add(plane);
        newDecalFaces.push(plane);
    });

    newDecalFaces[0].visible = STATE.mostraEtichetteOggetti;
    ud._decalFaces = newDecalFaces;
}

// =============================================================================
// ROTAZIONE: UTILITY
// =============================================================================

/**
 * Lampeggia un oggetto di un colore per dare feedback visivo.
 */
function _ruotaAlProssimoOrientamento(group) {
    var orientamenti = _calcolaOrientamentiValidi(group);
    if (orientamenti.length <= 1) return false;

    var currentLabel = group.userData._orientamento || 'LxPxH';
    var currentIdx = 0;
    for (var i = 0; i < orientamenti.length; i++) {
        if (orientamenti[i].label === currentLabel) { currentIdx = i; break; }
    }
    var nextIdx = (currentIdx + 1) % orientamenti.length;
    var nuovoOrientamento = orientamenti[nextIdx];

    _ricostruisciMeshOrientamento(group, nuovoOrientamento);
    return true;
}

// =============================================================================
// ROTAZIONE ECCENTRICA (perno sul lato corto)
// =============================================================================
// Ruota l'oggetto attorno al baricentro del quadrato virtuale di lato W
// (lato corto) poggiato su uno spigolo. Simula il comportamento di un collo
// lungo che ruota facendo perno sul suo lato corto a contatto con un altro
// pacco (pallettizzazione a spina di pesce).
//
// Trasformazione: trasla(pivot→origine) → ruota(90°) → trasla(indietro).
//
// @param {boolean} isCW - true = rotazione oraria (CW, tasto destro), false = antioraria (CCW, tasto sinistro)

function _ruotaEccentrico(group, isCW) {
    var tuttiOrientamenti = _calcolaOrientamentiValidi(group);
    if (tuttiOrientamenti.length <= 1) return false;

    // In modalità eccentrica, ruota SOLO nel piano orizzontale (stessa Y
    // dell'orientamento base LxPxH). Filtra via i ribaltamenti che coinvolgono
    // l'altezza (es. HxLxP, LxHxP) perché il perno sul lato corto ha senso
    // solo quando l'oggetto resta "piatto" sulla sua base originale.
    var baseOrientamento = tuttiOrientamenti.find(function(o) { return o.label === 'LxPxH'; }) || tuttiOrientamenti[0];
    var altezzaBase = baseOrientamento.tjsDims.y;

    var orientamenti = tuttiOrientamenti.filter(function(o) {
        return Math.abs(o.tjsDims.y - altezzaBase) < 0.01;
    });

    // Se dopo il filtro resta solo 1 orientamento, non c'è nulla da ruotare
    if (orientamenti.length <= 1) return false;

    var currentLabel = group.userData._orientamento || 'LxPxH';
    var currentIdx = 0;
    var n = orientamenti.length;
    for (var i = 0; i < n; i++) {
        if (orientamenti[i].label === currentLabel) { currentIdx = i; break; }
    }

    // Se l'orientamento corrente non è tra quelli "piatti" (es. l'utente
    // ha ruotato in modalità baricentrica e poi è passato a eccentrica),
    // fai un fallback baricentrico: riporta al primo orientamento piatto
    // senza spostare la posizione (il delta non sarebbe calcolabile
    // correttamente dalle dimensioni non-piatte).
    if (orientamenti[currentIdx].label !== currentLabel) {
        _ricostruisciMeshOrientamento(group, orientamenti[0]);
        return true;
    }

    // CW = prossimo, CCW = precedente nel ciclo orizzontale
    var nextIdx = isCW ? (currentIdx + 1) % n : (currentIdx - 1 + n) % n;
    var nuovoOrientamento = orientamenti[nextIdx];

    // Salva dimensioni e posizione PRIMA di ricostruire la mesh
    var oldDims = _getTjsDimensions(group);
    var oldPos = group.position.clone();

    // Calcola offset del pivot: Δ = |Lungo - Corto| / 2
    // (le dimensioni orizzontali sono oldDims.x e oldDims.z)
    var delta = Math.abs(oldDims.x - oldDims.z) / 2;

    // Se oggetto quasi quadrato (Δ < 0.5 cm), la rotazione eccentrica non
    // ha effetto significativo → ricadi su baricentrica
    if (delta < 0.5) {
        _ricostruisciMeshOrientamento(group, nuovoOrientamento);
        return true;
    }

    // Ricostruisci mesh con nuove dimensioni (group.position NON cambia)
    _ricostruisciMeshOrientamento(group, nuovoOrientamento);

    // --- MACCHINA A 4 STATI: camminamento quadrato del centro ---
    // Ogni click ruota di 90° e sposta il centro dell'oggetto in modo che
    // il perno (spigolo del lato corto) resti fermo. Alternando il perno
    // tra sinistra e destra, dopo 4 click CW (o CCW) l'oggetto torna
    // esattamente al punto di partenza.
    //
    // Sequenza delta (dx, dz) per i 4 step:
    //   step 0: (-Δ, -Δ)  — perno sul lato sinistro, CW
    //   step 1: (-Δ, +Δ)  — perno sul lato destro (opposto), CW
    //   step 2: (+Δ, +Δ)  — perno sul lato sinistro, CW
    //   step 3: (+Δ, -Δ)  — perno sul lato destro, CW  → torna a step 0

    var ud = group.userData;
    var step = ud._eccentricStep || 0;

    var movesX = [-delta, -delta, delta, delta];
    var movesZ = [-delta, delta, delta, -delta];

    if (isCW) {
        // CW: applica il delta dello step corrente, poi avanza
        group.position.x = oldPos.x + movesX[step];
        group.position.z = oldPos.z + movesZ[step];
        ud._eccentricStep = (step + 1) % 4;
    } else {
        // CCW: arretra lo step, poi applica il delta INVERSO
        // (così CCW è sempre l'inverso perfetto del CW precedente)
        var prevStep = (step - 1 + 4) % 4;
        ud._eccentricStep = prevStep;
        group.position.x = oldPos.x - movesX[prevStep];
        group.position.z = oldPos.z - movesZ[prevStep];
    }
    group.position.y = oldPos.y;

    return true;
}

// =============================================================================
// EVENT HANDLERS DRAG (XY / Ctrl+Z)
// =============================================================================

function _onDragPointerDown(e) {
    // Solo in modalità manuale
    if (typeof WS === 'undefined' || !WS.manualMode) return;

    // --- Ghost mode attivo: gestisci click ghost (conferma/ruota) ---
    if (_ghostState.active) {
        console.log('[Drag] ghost active, delegating to _onGhostClick, shiftKey=' + e.shiftKey + ', button=' + e.button);
        _onGhostClick(e);
        return;
    }

    // Determina se siamo in modalità eccentrica (accede a IMPOSTAZIONI globale)
    var isEccentricMode = (typeof IMPOSTAZIONI !== 'undefined' &&
        IMPOSTAZIONI.output_ottimizzazione &&
        IMPOSTAZIONI.output_ottimizzazione.modalita_rotazione === 'eccentrica');

    // In mod. baricentrica: solo tasto sinistro (button 0).
    // In mod. eccentrica: tasto sinistro (0, CCW) e tasto destro (2, CW).
    if (e.button !== 0 && !(isEccentricMode && e.button === 2)) return;

    var rect = STATE.renderer.domElement.getBoundingClientRect();
    STATE.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    STATE.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    STATE.raycaster.setFromCamera(STATE.mouse, STATE.camera);

    // Raccogli tutte le mesh degli oggetti
    var meshes = [];
    STATE.oggettiMesh.forEach(function (group) {
        group.children.forEach(function (child) {
            if (child.type === 'Mesh') meshes.push(child);
        });
    });

    var intersects = STATE.raycaster.intersectObjects(meshes);
    if (intersects.length === 0) {
        // Click su spazio vuoto: prepara deselezione (confermata in pointerup se non è un orbit)
        STATE._clickedOnEmpty = true;
        STATE._pointerDownPos = { x: e.clientX, y: e.clientY };
        return;  // nessun oggetto → OrbitControls libero
    }

    var group = intersects[0].object.parent;  // parent del mesh = itemGroup
    if (!group || STATE.oggettiMesh.indexOf(group) === -1) return;

    // --- GHOST MODE ON: raccogli oggetto esistente per riposizionamento ---
    if (_ghostModeEnabled && !_ghostState.active && e.button === 0) {
        e.preventDefault();
        e.stopPropagation();
        // Deseleziona eventuale selezione corrente
        _deselectObject();
        // Salva riferimento all'oggetto da riposizionare e alla sua posizione originale
        _ghostState._existingGroup = group;
        _ghostState._oldPosition = group.position.clone();
        // Rimuovi temporaneamente dalla scena e da oggettiMesh
        if (group.parent) group.parent.remove(group);
        var idx = STATE.oggettiMesh.indexOf(group);
        if (idx >= 0) STATE.oggettiMesh.splice(idx, 1);
        // Trova l'oggetto in anagrafica per attivare il ghost
        var codice = group.userData.codice;
        var oggettoAnagrafica = null;
        if (typeof WS !== 'undefined' && WS.oggettiDisponibili && codice) {
            oggettoAnagrafica = trovaOggettoPerCodice(codice);
        }
        if (oggettoAnagrafica) {
            _attivaModalitaGhost(oggettoAnagrafica);
            // Copia le dimensioni e orientamento correnti dell'oggetto esistente sul ghost
            if (group.userData._tjsDimCm) {
                _ghostState.dims = { x: group.userData._tjsDimCm.x, y: group.userData._tjsDimCm.y, z: group.userData._tjsDimCm.z };
                _ricostruisciGhostGeometria();
            }
            if (group.userData._orientamento) {
                _ghostState.orientamento = group.userData._orientamento;
            }
            // Posiziona il ghost dove era l'oggetto originale
            _ghostState.group.position.copy(_ghostState._oldPosition);
            _ghostState._rawApiZ = _ghostState._oldPosition.y - _ghostState.dims.y / 2;
            _ghostState._plane.constant = -(_ghostState._oldPosition.y);
            _aggiornaWireframeGhost();
            showToast('👻 Riposiziona l\'oggetto. Click = piazza | Esc = annulla e ripristina | Shift+click = ruota', 'info');
        } else {
            // Fallback: se non troviamo l'anagrafica, ripristina l'oggetto
            STATE.scene.add(group);
            STATE.oggettiMesh.push(group);
            _ghostState._existingGroup = null;
            _ghostState._oldPosition = null;
            showToast('⚠️ Oggetto non trovato in anagrafica.', 'warning');
        }
        return;
    }

    // --- ROTAZIONE: Shift+click ---
    // NOTA: usiamo e.shiftKey (non STATE.dragState.shiftDown) per evitare
    // il rischio di stato bloccato se un keyup viene perso (cambio finestra).
    if (e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();

        // Salva stato pre-rotazione per eventuale revert su collisione
        var oldDims = _getTjsDimensions(group);
        var oldPos = group.position.clone();
        var oldOrientamento = group.userData._orientamento || 'LxPxH';
        var oldEccentricStep = group.userData._eccentricStep || 0;

        var ruotato;
        if (isEccentricMode) {
            // Rotazione eccentrica: sinistro=CCW, destro=CW
            ruotato = _ruotaEccentrico(group, e.button === 2);
        } else {
            // Rotazione baricentrica (comportamento attuale)
            ruotato = _ruotaAlProssimoOrientamento(group);
        }

        if (ruotato) {
            // Controlla collisioni dopo la rotazione
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
                // Collisione o fuori contenitore: revert all'orientamento e posizione originali
                _ricostruisciMeshOrientamento(group, { label: oldOrientamento, tjsDims: oldDims });
                group.position.copy(oldPos);
                group.userData._eccentricStep = oldEccentricStep;
                _flashOggetto(group, 0xff0000);  // flash rosso: collisione o fuori bound
            } else {
                _flashOggetto(group, 0x00ff00);  // flash verde: ruotato ok
                if (typeof WS !== 'undefined') WS._manualDragOccurred = true;
                if (typeof _registraModificaManuale === 'function') _registraModificaManuale();
                _refreshSidebarLineari();
            }
            _aggiornaInfoOggettoManuale(group);
        } else {
            _flashOggetto(group, 0xff0000);  // flash rosso: non ruotabile
        }
        return;
    }

    // Il tasto destro (button 2) in modalità eccentrica serve solo per
    // la rotazione; non deve iniziare un drag né bloccare OrbitControls.
    if (e.button === 2) return;

    // Oggetto colpito con tasto sinistro: inizia drag
    e.preventDefault();
    e.stopPropagation();

    STATE.dragState.active = true;
    STATE.dragState.object = group;
    STATE.dragState._ctrlStarted = false;     // reset stato Ctrl per nuovo drag
    STATE.dragState._ctrlRawApiZ = 0;          // reset accumulatore Z
    STATE.dragState.startPos.copy(group.position);
    STATE.dragState.lastValidPos.copy(group.position);  // salva posizione iniziale valida
    STATE.dragState._wasColliding = false;    // reset stato collisione
    STATE.controls.enabled = false;           // disabilita OrbitControls

    // Calcola la dimensione per i calcoli successivi
    var dimCm = _getTjsDimensions(group);

    // Piano orizzontale all'altezza corrente dell'oggetto
    STATE.dragState.plane.set(
        new THREE.Vector3(0, 1, 0),
        -(group.position.y)
    );

    STATE.raycaster.ray.intersectPlane(
        STATE.dragState.plane,
        STATE.dragState.planeIntersect
    );
    STATE.dragState.offset.copy(group.position).sub(STATE.dragState.planeIntersect);

    // Evidenzia in verde (posizione iniziale è sempre valida)
    _setDragHighlight(group, false);

    // Nascondi tooltip durante il drag
    if (STATE.tooltip) STATE.tooltip.style.display = 'none';
    STATE.renderer.domElement.style.cursor = 'grabbing';

    _aggiornaInfoOggettoManuale(group);
}

function _onDragPointerMove(e) {
    if (!STATE.dragState.active) return;

    var rect = STATE.renderer.domElement.getBoundingClientRect();
    STATE.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    STATE.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    STATE.raycaster.setFromCamera(STATE.mouse, STATE.camera);

    var group = STATE.dragState.object;
    var dimCm = _getTjsDimensions(group);

    if (STATE.dragState.ctrlDown) {
        // --- Ctrl premuto: movimento verticale (asse Z API = Three.js Y) ---
        if (!STATE.dragState._ctrlStarted) {
            STATE.dragState._ctrlStarted = true;
            STATE.dragState._ctrlPrevMouseY = e.clientY;
            STATE.dragState._ctrlRawApiZ = group.position.y - dimCm.y / 2;
        }

        var deltaPx = STATE.dragState._ctrlPrevMouseY - e.clientY;
        STATE.dragState._ctrlPrevMouseY = e.clientY;
        var sensitivity = 0.8;

        STATE.dragState._ctrlRawApiZ += deltaPx * sensitivity;
        STATE.dragState._ctrlRawApiZ = Math.max(0, STATE.dragState._ctrlRawApiZ);

        var step = STATE.snapStepCm;
        var snappedApiZ = Math.round(STATE.dragState._ctrlRawApiZ / step) * step;

        group.position.y = snappedApiZ + dimCm.y / 2;

        // Clamp ai limiti del contenitore
        if (STATE.dati && STATE.dati.contenitore) {
            var cDim = STATE.dati.contenitore.dimensioni_cm;
            var maxY = cDim.z - dimCm.y / 2;
            group.position.y = Math.max(dimCm.y / 2, Math.min(maxY, group.position.y));
        }

    } else {
        STATE.dragState._ctrlStarted = false;
        // --- Movimento su piano XY (orizzontale) ---
        STATE.dragState.plane.constant = -(group.position.y);
        STATE.raycaster.ray.intersectPlane(
            STATE.dragState.plane,
            STATE.dragState.planeIntersect
        );
        _dragTjsPos.copy(STATE.dragState.planeIntersect)
            .add(STATE.dragState.offset);
        _dragTjsPos.y = group.position.y;

        var snapped = _snapPosition(_dragTjsPos, dimCm);

        if (STATE.dati && STATE.dati.contenitore) {
            var cDim2 = STATE.dati.contenitore.dimensioni_cm;
            snapped.x = Math.max(dimCm.x / 2, Math.min(cDim2.x - dimCm.x / 2, snapped.x));
            snapped.z = Math.max(dimCm.z / 2, Math.min(cDim2.y - dimCm.z / 2, snapped.z));
        }

        group.position.set(snapped.x, snapped.y, snapped.z);
    }

    // --- COLLISION DETECTION con altri oggetti ---
    // Strategia B: "last valid position" — se collide, torna all'ultima posizione valida
    var collision = _checkCollisionWithOthers(group, group.position, dimCm);
    if (collision) {
        // Collisione rilevata: torna all'ultima posizione valida
        group.position.copy(STATE.dragState.lastValidPos);
        if (!STATE.dragState._wasColliding) {
            _setDragHighlight(group, true);  // rosso = collisione
            STATE.dragState._wasColliding = true;
        }
    } else {
        // Posizione valida: aggiorna lastValidPos
        STATE.dragState.lastValidPos.copy(group.position);
        if (STATE.dragState._wasColliding) {
            _setDragHighlight(group, false);  // verde = ok
            STATE.dragState._wasColliding = false;
        }
    }

    _aggiornaInfoOggettoManuale(group);
}

function _onDragPointerUp(e) {
    // --- Click su spazio vuoto (senza drag): deseleziona ---
    if (STATE._clickedOnEmpty) {
        STATE._clickedOnEmpty = false;
        if (STATE._pointerDownPos && STATE.selectedObject) {
            var dx = e.clientX - STATE._pointerDownPos.x;
            var dy = e.clientY - STATE._pointerDownPos.y;
            // Solo se è stato un click fermo (< 3px) — un orbit non deseleziona
            if (Math.sqrt(dx * dx + dy * dy) < 3) {
                _deselectObject();
            }
        }
        STATE._pointerDownPos = null;
    }

    if (!STATE.dragState.active) return;

    var group = STATE.dragState.object;
    var dimCm = _getTjsDimensions(group);

    // Rileva se è stato un click (senza movimento) → selezione
    var distanza = group.position.distanceTo(STATE.dragState.startPos);
    var eClick = distanza < 0.5;  // meno di 0.5 cm = click, non drag

    if (eClick) {
        // Click senza drag: seleziona/deseleziona l'oggetto
        if (STATE.selectedObject === group) {
            _deselectObject();
        } else {
            _selectObject(group);
        }
        // Non segnare come modifica manuale (nessun movimento)
    } else {
        // Drag effettivo: snap finale
        var snapped = _snapPosition(group.position, dimCm);
        group.position.set(snapped.x, snapped.y, snapped.z);
        // Flag: modifiche manuali da salvare
        if (typeof WS !== 'undefined') WS._manualDragOccurred = true;
        if (typeof _registraModificaManuale === 'function') _registraModificaManuale();
        // Dopo un drag, mantieni la selezione sull'oggetto spostato
        _selectObject(group);
        _refreshSidebarLineari();
    }

    // Rimuovi evidenziazione drag
    group.children.forEach(function (child) {
        if (child.type === 'Mesh' && child.material && child.material.emissive) {
            child.material.emissive = new THREE.Color(0x000000);
            child.material.emissiveIntensity = 0;
        }
    });

    // Reset stato drag
    STATE.dragState.active = false;
    STATE.dragState.object = null;
    STATE.controls.enabled = true;          // riabilita OrbitControls
    STATE.renderer.domElement.style.cursor = '';

    // Nascondi info oggetto (a meno che non sia selezionato)
    if (!STATE.selectedObject) {
        var infoEl = document.getElementById('manuale-oggetto-info');
        if (infoEl) infoEl.style.display = 'none';
    }
}

// =============================================================================
// AGGIUNTA MANUALE OGGETTO DAL PANNELLO DESTRO
// =============================================================================

/**
 * Crea un mesh 3D per un singolo oggetto, con lo stesso pattern di buildOggetti().
 * @param {Object} dimCm - dimensioni in cm Three.js {x: w, y: h, z: d}
 * @param {THREE.Vector3} tjsPos - posizione centro in coordinate Three.js
 * @param {string} codice - codice oggetto
 * @param {string} colore - colore esadecimale (es. "#447e9b")
 * @param {string} descrizione - descrizione opzionale
 * @param {number} pesoKg - peso in kg
 * @returns {THREE.Group} itemGroup pronto da aggiungere alla scena
 */
