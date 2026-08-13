/**
 * Workspace Carico 3D — Panel Views Module
 *
 * Panel view split (mezzi, oggetti, vincoli-tra, piani),
 * form rendering, mini viewport vincoli.
 *
 * Depends on: workspace_core.js, workspace_vt.js, workspace_sezioni.js
 */

// =============================================================================
// PANEL VIEW (split centrale: lista sx + form dx)
// =============================================================================

// Salvataggio dell'HTML originale del form per le viste custom
var _origFormInnerHTML = null;
var _panelViewEpoch = 0;

/**
 * Le viste del pannello ricostruiscono parte del DOM. Non conservare nodi
 * detached: aggiorna sempre i riferimenti standard prima di renderizzare una
 * nuova vista.
 */
function _ricaricaDOMPanelView() {
    DOM.pvListTitle = document.getElementById('pv-list-title');
    DOM.pvListCount = document.getElementById('pv-list-count');
    DOM.pvListBody = document.getElementById('pv-list-body');
    DOM.pvFormTitle = document.getElementById('pv-form-title');
    DOM.pvFormBody = document.getElementById('pv-form-body');
    return DOM;
}

function _panelViewPronto(contesto) {
    _ricaricaDOMPanelView();
    var richiesti = ['pvListTitle', 'pvListCount', 'pvListBody', 'pvFormTitle', 'pvFormBody'];
    var mancanti = richiesti.filter(function (nome) { return !DOM[nome] || !DOM[nome].isConnected; });
    if (mancanti.length === 0) return true;

    console.error('[Panel View] DOM incompleto in ' + (contesto || 'vista') + ':', mancanti);
    if (typeof showToast === 'function') {
        showToast('Impossibile visualizzare questa sezione: interfaccia incompleta.', 'error');
    }
    return false;
}

function _ripristinaFormOggetti() {
    if (_origFormInnerHTML !== null) {
        // Distruggi la scena 3D prima di ripristinare
        if (typeof PreviewOggetto3D !== 'undefined' && typeof PreviewOggetto3D.distruggi === 'function') {
            PreviewOggetto3D.distruggi();
        }
        var formEl = document.getElementById('panel-view-form');
        if (formEl) formEl.innerHTML = _origFormInnerHTML;
        _origFormInnerHTML = null;
        // Reset list width
        var listEl = document.getElementById('panel-view-list');
        if (listEl) listEl.style.flex = '';
    }

    // Le viste dinamiche possono sostituire il contenuto del form anche quando
    // non è disponibile uno snapshot da ripristinare (per esempio dopo Vincoli
    // o dopo un doppio passaggio nella vista Articoli). Ri-cache sempre i nodi
    // correnti, evitando di usare riferimenti null o detached.
    _ricaricaDOMPanelView();
}

function mostraPanelView(viewType) {
    _panelViewEpoch += 1;
    distruggiMiniViewportVincolo();
    if (typeof _vtDistruggiCanvases === 'function') _vtDistruggiCanvases();
    // Nascondi il pannello distribuzione pesi quando si esce dalla vista principale
    nascondiDistribuzionePesi();
    // Nascondi paginazione (verranno mostrate solo dalle rispettive render functions)
    var pagEl = document.getElementById('piani-pagination');
    if (pagEl) pagEl.style.display = 'none';
    var oggettiPagEl = document.getElementById('oggetti-pagination');
    if (oggettiPagEl) oggettiPagEl.style.display = 'none';
    // Rimuovi eventuali layout custom da viste precedenti
    var oldVT = document.querySelector('.vt-custom-layout');
    if (oldVT) oldVT.remove();
    // Ripristina il layout split standard e la struttura form originale
    var splitEl = document.getElementById('panel-view-split');
    if (splitEl) splitEl.style.display = '';
    _ripristinaFormOggetti();
    if (!_panelViewPronto(viewType)) return;
    if (!DOM.viewport3d || !DOM.panelView) {
        console.error('[Panel View] Contenitori principali mancanti.');
        return;
    }

    DOM.viewport3d.style.display = 'none';
    DOM.panelView.style.display = 'flex';
    switch (viewType) {
        case 'mezzi': renderMezziPanel(); break;
        case 'oggetti': renderOggettiPanel(); break;
        case 'vincoli-tra': renderVincoliTraPanel(); break;
        case 'piani': renderPianiPanel(); break;
        case 'impostazioni': renderImpostazioniPanel(); break;
    }
}

function mostraViewport() {
    _panelViewEpoch += 1;
    distruggiMiniViewportVincolo();
    if (typeof _vtDistruggiCanvases === 'function') _vtDistruggiCanvases();
    _ripristinaFormOggetti();
    DOM.panelView.style.display = 'none';
    DOM.viewport3d.style.display = '';
    // Toolbar orizzontale sostituita dalla palette flottante — non mostrarla
    setActiveView('carico');
}

// --- Helper: estrae messaggio errore da response API ---
async function _parseDeleteError(resp) {
    try { var errData = await resp.json(); if (errData.detail) return errData.detail; if (errData.error) return errData.error; } catch (_) {}
    return 'HTTP ' + resp.status;
}

// =============================================================================
// VINCOLI TRA OGGETTI — Nuovo layout 3 colonne (A | MiniViewport | B)
// =============================================================================

function renderVincoliTraPanel() {
    // v4: Canvas Three.js indipendenti — griglia di card cliccabili
    _vtDistruggiCanvases();
    _vtState = {
        oggettoAId: 0, oggettoBId: 0,
        oggettiASelezionati: [], oggettiBSelezionati: [],
        ultimoASelezionato: 0, ultimoBSelezionato: 0,
        configurazioni: [], batchEsclusioni: {}, batchInCorso: false,
        editingVincoloId: null, editingVincolo: null,
    };

    // Nascondi il layout split standard
    var splitEl = document.getElementById("panel-view-split");
    if (splitEl) splitEl.style.display = "none";

    // Rimuovi layout custom VT esistente
    var oldVT = document.querySelector(".vt-custom-layout");
    if (oldVT) oldVT.remove();

    // Costruisci il layout custom
    var layoutHtml =
        '<div class="vt-custom-layout">' +
            // Header
            '<div class="vt-header">' +
                '<h3>🔗 Vincoli tra Oggetti <span class="badge" id="vt-count-badge">' + WS.vincoliTra.length + '</span></h3>' +
                '<div style="display:flex;gap:6px;align-items:center;">' +
                    '<select class="vt-load-select" id="vt-load-select" style="font-size:11px;padding:4px 8px;border:1px solid #ccc;border-radius:4px;background:#fff;max-width:180px;">' +
                    _vtBuildLoadSelectOptions() +
                    '</select>' +
                    '<button class="btn btn-sm btn-escludi" id="vt-btn-escludi" title="Escludi tutte le configurazioni di questo vincolo">🚫 Escludi tutti</button>' +
                    '<button class="btn btn-sm" id="vt-btn-new">➕ Nuovo</button>' +
                '</div>' +
            '</div>' +

            // Griglia 3 colonne
            '<div class="vt-grid">' +
                // Colonna A (sinistra)
                '<div class="vt-obj-col">' +
                    '<div class="vt-obj-col-header">' +
                        '<span class="field-label">🔵 Oggetto A <small>(Ctrl/Shift: multipla)</small></span>' +
                        '<input type="text" class="vt-obj-search" id="vt-search-a" placeholder="Filtra..." autocomplete="off">' +
                    '</div>' +
                    '<div class="vt-obj-list" id="vt-list-a"></div>' +
                '</div>' +

                // Colonna centrale: griglia canvas
                '<div class="vt-center">' +
                    '<div class="vt-center-scroll">' +
                        // Relazione fissa
                        '<div class="vt-relation-header">' +
                            '<span class="vt-relation-icon">⬆</span>' +
                            '<strong>A deve stare sopra B</strong>' +
                            '<span class="vt-relation-badge" id="vt-config-count">0 config</span>' +
                        '</div>' +

                        // Hint selezione
                        '<div style="font-size:12px;min-height:18px;" id="vt-selection-hint"></div>' +

                        // Griglia canvas
                        '<div class="vt-config-grid" id="vt-config-grid">' +
                            '<div class="vt-obj-empty" style="grid-column:1/-1;padding:32px;">' +
                                'Seleziona Oggetto A e Oggetto B per vedere le configurazioni possibili.' +
                            '</div>' +
                        '</div>' +

                        // Azioni
                        '<div class="vt-actions" style="margin-top:8px;">' +
                            '<button class="btn btn-primary" id="vt-btn-create" disabled>➕ Crea Vincolo</button>' +
                            '<button class="btn btn-success" id="vt-btn-update" style="display:none;">💾 Aggiorna Vincolo</button>' +
                            '<button class="btn btn-danger" id="vt-btn-delete" style="display:none;">🗑 Elimina</button>' +
                        '</div>' +
                    '</div>' +
                '</div>' +

                // Colonna B (destra)
                '<div class="vt-obj-col">' +
                    '<div class="vt-obj-col-header">' +
                        '<span class="field-label">🟣 Oggetto B <small>(Ctrl/Shift: multipla)</small></span>' +
                        '<input type="text" class="vt-obj-search" id="vt-search-b" placeholder="Filtra..." autocomplete="off">' +
                    '</div>' +
                    '<div class="vt-obj-list" id="vt-list-b"></div>' +
                '</div>' +
            '</div>' +


        '</div>';

    // Inserisci nel DOM
    var panelView = document.getElementById("panel-view");
    if (panelView) {
        panelView.insertAdjacentHTML("beforeend", layoutHtml);
    }

    // Popola e wire
    _vtPopolaListeOggetti();
    _vtPopolaGrigliaConfigurazioni();
    _vtWireEvents();
}
function renderVincoliTraForm(vincoloId) {
    // Deprecato: la nuova UI v2 non usa questa funzione.
}

function evidenziaOggettiVincolo(vincoloId) {
    var v = WS.vincoliTra.find(function (x) { return x.id == vincoloId; });
    if (!v) return;
    if (typeof evidenziaOggetti3D === 'function') {
        evidenziaOggetti3D(v.oggetto_a_codice, v.oggetto_b_codice);
    }
}

// =============================================================================
// MINI-VIEWPORT 3D VINCOLI TRA OGGETTI
// =============================================================================

var _miniViewportState = null;

function distruggiMiniViewportVincolo() {
    if (_miniViewportState) {
        if (_miniViewportState.animationId) cancelAnimationFrame(_miniViewportState.animationId);
        if (_miniViewportState.controls) {
            _miniViewportState.controls.dispose();
        }
        // Il renderer veniva liberato, ma geometrie/materiali della scena
        // restavano referenziati fino al GC. Il pannello Vincoli può ricreare
        // molte anteprime durante la navigazione: libera esplicitamente tutte
        // le risorse Three.js prima di rimuovere il canvas.
        if (_miniViewportState.scene) {
            _miniViewportState.scene.traverse(function (child) {
                if (child.geometry) child.geometry.dispose();
                if (!child.material) return;
                var materiali = Array.isArray(child.material)
                    ? child.material : [child.material];
                materiali.forEach(function (materiale) {
                    if (materiale.map) materiale.map.dispose();
                    materiale.dispose();
                });
            });
        }
        if (_miniViewportState.renderer) {
            _miniViewportState.renderer.dispose();
            if (typeof _miniViewportState.renderer.forceContextLoss === 'function') {
                _miniViewportState.renderer.forceContextLoss();
            }
        }
        var container = document.getElementById('pv-vt-miniview');
        if (container) container.innerHTML = '';
        _miniViewportState = null;
    }
}

function initMiniViewportVincolo() {
    distruggiMiniViewportVincolo();

    var container = document.getElementById('pv-vt-miniview');
    if (!container || container.clientWidth === 0 || container.clientHeight === 0) return;

    var w = container.clientWidth;
    var h = container.clientHeight;

    var scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f2f5);

    var camera = new THREE.PerspectiveCamera(40, w / h, 1, 10000);
    camera.position.set(120, 90, 160);
    camera.lookAt(0, 20, 0);

    var renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    var controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.6;
    controls.zoomSpeed = 0.8;
    controls.target.set(0, 20, 0);
    controls.update();

    // Illuminazione
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    var dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
    dirLight.position.set(150, 250, 150);
    scene.add(dirLight);
    var dirLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    dirLight2.position.set(-80, 40, -60);
    scene.add(dirLight2);

    // Griglia sottile
    var grid = new THREE.GridHelper(500, 20, 0xcccccc, 0xe8e8e8);
    grid.position.y = -0.5;
    scene.add(grid);

    _miniViewportState = {
        scene: scene,
        camera: camera,
        renderer: renderer,
        controls: controls,
        container: container,
        animationId: null,
        groupA: null,
        groupB: null,
        constraintGroup: null,
    };

    function anim() {
        _miniViewportState.animationId = requestAnimationFrame(anim);
        controls.update();
        renderer.render(scene, camera);
    }
    anim();
}

function aggiornaMiniViewportVincolo(oggettoAId, oggettoBId, tipoRelazione, distanzaCm) {
    if (!_miniViewportState) return;

    var scene = _miniViewportState.scene;
    var st = _miniViewportState;

    // Rimuovi vecchi oggetti
    if (st.groupA) { scene.remove(st.groupA); _disposeGroupMini(st.groupA); }
    if (st.groupB) { scene.remove(st.groupB); _disposeGroupMini(st.groupB); }
    if (st.constraintGroup) { scene.remove(st.constraintGroup); _disposeGroupMini(st.constraintGroup); }
    st.groupA = null;
    st.groupB = null;
    st.constraintGroup = null;

    // Placeholder se mancano dati
    if (!oggettoAId || !oggettoBId) {
        _mostraPlaceholderMiniViewport('Seleziona Oggetto A e Oggetto B');
        return;
    }

    var objA = trovaOggetto(oggettoAId);
    var objB = trovaOggetto(oggettoBId);
    if (!objA || !objB) {
        _mostraPlaceholderMiniViewport('Oggetti non trovati');
        return;
    }

    // Dimensioni in cm
    var dimA = { w: objA.lunghezza_mm / 10, h: objA.altezza_mm / 10, d: objA.larghezza_mm / 10 };
    var dimB = { w: objB.lunghezza_mm / 10, h: objB.altezza_mm / 10, d: objB.larghezza_mm / 10 };
    var coloreA = objA.colore || '#3388ff';
    var coloreB = objB.colore || '#ff8833';

    // Calcola posizioni in base al tipo di vincolo
    var posA, posB;
    var maxDim = Math.max(dimA.w, dimA.d, dimB.w, dimB.d, 20);
    var spacing = maxDim * 1.8;

    switch (tipoRelazione) {
        case 'sopra':
            posA = { x: -dimA.w / 2, y: dimB.h + 8, z: 0 };
            posB = { x: -dimB.w / 2, y: 0, z: 0 };
            break;
        case 'non_sopra':
            posA = { x: -spacing, y: 0, z: 0 };
            posB = { x: spacing, y: 0, z: 0 };
            break;
        case 'vicino':
            posA = { x: -(dimA.w / 2 + 10), y: 0, z: 0 };
            posB = { x: dimB.w / 2 + 10, y: 0, z: 0 };
            break;
        case 'lontano':
            posA = { x: -spacing * 1.8, y: 0, z: 0 };
            posB = { x: spacing * 1.8, y: 0, z: 0 };
            break;
        case 'prima':
            posA = { x: -spacing, y: 0, z: 0 };
            posB = { x: spacing, y: 0, z: 0 };
            break;
        case 'dopo':
            posA = { x: spacing, y: 0, z: 0 };
            posB = { x: -spacing, y: 0, z: 0 };
            break;
        case 'entro':
            posA = { x: -(dimA.w / 2 + 15), y: 0, z: 0 };
            posB = { x: dimB.w / 2 + 15, y: 0, z: 0 };
            break;
        case 'almeno':
            posA = { x: -spacing * 2.2, y: 0, z: 0 };
            posB = { x: dimB.w / 2 + 5, y: 0, z: 0 };
            break;
        default:
            posA = { x: -spacing, y: 0, z: 0 };
            posB = { x: spacing, y: 0, z: 0 };
    }

    // Crea box
    var groupA = _creaBoxMiniViewport(dimA, coloreA, posA);
    var groupB = _creaBoxMiniViewport(dimB, coloreB, posB);
    scene.add(groupA);
    scene.add(groupB);
    st.groupA = groupA;
    st.groupB = groupB;

    // Visualizzazione vincolo
    var constraintGroup = _creaVisualizzazioneVincolo(tipoRelazione, distanzaCm, dimA, dimB, posA, posB);
    scene.add(constraintGroup);
    st.constraintGroup = constraintGroup;

    // Centra camera
    var centerX = (posA.x + posB.x) / 2;
    var centerY = Math.max(posA.y + dimA.h, posB.y + dimB.h) / 2;
    var centerZ = 0;
    var totalSpan = Math.max(Math.abs(posA.x - posB.x) + Math.max(dimA.w, dimB.w), 80);
    st.controls.target.set(centerX, centerY, centerZ);
    st.camera.position.set(centerX + totalSpan * 0.4, centerY + totalSpan * 0.5, totalSpan * 1.1);
    st.controls.update();
}

function _creaBoxMiniViewport(dimCm, coloreHex, pos) {
    var group = new THREE.Group();

    var geo = new THREE.BoxGeometry(dimCm.w, dimCm.h, dimCm.d);
    var mat = new THREE.MeshPhongMaterial({
        color: coloreHex,
        opacity: 0.85,
        transparent: true,
        specular: 0x111111,
        shininess: 20,
    });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos.x + dimCm.w / 2, pos.y + dimCm.h / 2, pos.z + dimCm.d / 2);
    group.add(mesh);

    // Bordi scuri per visibilità
    var edgeGeo = new THREE.EdgesGeometry(geo);
    var edgeMat = new THREE.LineBasicMaterial({ color: 0x333333, linewidth: 1 });
    var edges = new THREE.LineSegments(edgeGeo, edgeMat);
    edges.position.copy(mesh.position);
    group.add(edges);

    group._mesh = mesh;
    group._edges = edges;
    return group;
}

function _creaVisualizzazioneVincolo(tipo, distanzaCm, dimA, dimB, posA, posB) {
    var group = new THREE.Group();

    // Centri degli oggetti
    var cxA = posA.x + dimA.w / 2;
    var cyA = posA.y + dimA.h / 2;
    var czA = posA.z + dimA.d / 2;
    var cxB = posB.x + dimB.w / 2;
    var cyB = posB.y + dimB.h / 2;
    var czB = posB.z + dimB.d / 2;

    switch (tipo) {
        case 'sopra':
            // Freccia verticale da B (top) ad A (bottom)
            _aggiungiFrecciaVerticale(group, cyB + dimB.h / 2, cyA - dimA.h / 2, cxA, czA, 0x00aa00);
            break;

        case 'non_sopra':
            // A e B affiancati con X rossa tra le posizioni verticali
            _aggiungiX(group, (cxA + cxB) / 2, (cyA + cyB) / 2, (czA + czB) / 2, Math.max(dimA.h, dimB.h) * 0.7, 0xff0000);
            break;

        case 'vicino':
            // Linea verde che collega A e B
            _aggiungiLinea(group, cxA + dimA.w / 2, cyA, czA, cxB - dimB.w / 2, cyB, czB, 0x00aa00, false);
            break;

        case 'lontano':
            // Linea rossa tratteggiata con distanza
            _aggiungiLinea(group, cxA + dimA.w / 2, cyA, czA, cxB - dimB.w / 2, cyB, czB, 0xdd0000, true);
            if (distanzaCm) {
                _aggiungiEtichettaDistanza(group, (cxA + cxB) / 2, Math.max(cyA, cyB) + Math.max(dimA.h, dimB.h) / 2 + 8, 0, distanzaCm + ' cm', '#dd0000');
            }
            break;

        case 'prima':
            // Freccia A → B
            _aggiungiFrecciaOrizzontale(group, cxA + dimA.w / 2, cxB - dimB.w / 2, cyA, czA, 0x0066cc);
            break;

        case 'dopo':
            // Freccia B → A
            _aggiungiFrecciaOrizzontale(group, cxB + dimB.w / 2, cxA - dimA.w / 2, cyA, czA, 0x0066cc);
            break;

        case 'entro':
            // Cerchio verde attorno a B, A evidenziato dentro
            _aggiungiCerchio(group, cxB, 0, czB, distanzaCm || 40, 0x00aa00, 0.35);
            // Linea sottile da A a B
            _aggiungiLinea(group, cxA + dimA.w / 2, cyA, czA, cxB - dimB.w / 2, cyB, czB, 0x00aa00, true);
            break;

        case 'almeno':
            // Cerchio rosso attorno a B (raggio >= distanza), A fuori (indica distanza minima)
            var raggio = distanzaCm || 50;
            _aggiungiCerchio(group, cxB, 0, czB, raggio, 0xdd0000, 0.25);
            // Linea tratteggiata rossa
            _aggiungiLinea(group, cxA + dimA.w / 2, cyA, czA, cxB - dimB.w / 2, cyB, czB, 0xdd0000, true);
            if (distanzaCm) {
                _aggiungiEtichettaDistanza(group, (cxA + cxB) / 2, Math.max(cyA, cyB) + Math.max(dimA.h, dimB.h) / 2 + 8, 0, distanzaCm + ' cm min', '#dd0000');
            }
            break;
    }

    return group;
}

function _aggiungiFrecciaVerticale(group, fromY, toY, x, z, color) {
    var altezza = Math.abs(toY - fromY);
    var dir = toY > fromY ? 1 : -1;
    var midY = (fromY + toY) / 2;
    var colorHex = new THREE.Color(color);

    // Asta
    var shaftGeo = new THREE.CylinderGeometry(1, 1, altezza - 4, 8);
    var shaftMat = new THREE.MeshPhongMaterial({ color: colorHex, emissive: colorHex, emissiveIntensity: 0.4 });
    var shaft = new THREE.Mesh(shaftGeo, shaftMat);
    shaft.position.set(x, midY, z);
    group.add(shaft);

    // Punta
    var headGeo = new THREE.ConeGeometry(3, 8, 8);
    var headMat = new THREE.MeshPhongMaterial({ color: colorHex, emissive: colorHex, emissiveIntensity: 0.4 });
    var head = new THREE.Mesh(headGeo, headMat);
    head.position.set(x, toY - dir * 4, z);
    group.add(head);
}

function _aggiungiFrecciaOrizzontale(group, fromX, toX, y, z, color) {
    var lunghezza = Math.abs(toX - fromX);
    var dir = toX > fromX ? 1 : -1;
    var midX = (fromX + toX) / 2;
    var colorHex = new THREE.Color(color);

    // Asta
    var shaftGeo = new THREE.CylinderGeometry(1, 1, lunghezza - 4, 8);
    var shaftMat = new THREE.MeshPhongMaterial({ color: colorHex, emissive: colorHex, emissiveIntensity: 0.4 });
    var shaft = new THREE.Mesh(shaftGeo, shaftMat);
    shaft.rotation.z = Math.PI / 2;
    shaft.position.set(midX, y, z);
    group.add(shaft);

    // Punta
    var headGeo = new THREE.ConeGeometry(3, 8, 8);
    var headMat = new THREE.MeshPhongMaterial({ color: colorHex, emissive: colorHex, emissiveIntensity: 0.4 });
    var head = new THREE.Mesh(headGeo, headMat);
    head.rotation.z = Math.PI / 2;
    head.position.set(toX - dir * 4, y, z);
    group.add(head);
}

function _aggiungiLinea(group, x1, y1, z1, x2, y2, z2, color, dashed) {
    var points = [new THREE.Vector3(x1, y1, z1), new THREE.Vector3(x2, y2, z2)];
    var geo = new THREE.BufferGeometry().setFromPoints(points);
    var mat;
    if (dashed) {
        mat = new THREE.LineDashedMaterial({ color: color, dashSize: 5, gapSize: 3, linewidth: 1 });
    } else {
        mat = new THREE.LineBasicMaterial({ color: color, linewidth: 1 });
    }
    var line = new THREE.Line(geo, mat);
    if (dashed) line.computeLineDistances();
    group.add(line);
}

function _aggiungiCerchio(group, cx, cy, cz, radius, color, opacity) {
    var geo = new THREE.TorusGeometry(radius, 0.8, 8, 48);
    var mat = new THREE.MeshPhongMaterial({
        color: color,
        opacity: opacity,
        transparent: true,
        emissive: new THREE.Color(color),
        emissiveIntensity: 0.3,
    });
    var torus = new THREE.Mesh(geo, mat);
    torus.rotation.x = Math.PI / 2;
    torus.position.set(cx, cy + 0.5, cz);
    group.add(torus);
}

function _aggiungiX(group, cx, cy, cz, size, color) {
    var half = size / 2;
    var colorHex = new THREE.Color(color);
    var mat = new THREE.LineBasicMaterial({ color: colorHex, linewidth: 1 });

    // Prima diagonale
    var points1 = [new THREE.Vector3(cx - half, cy + half, cz), new THREE.Vector3(cx + half, cy - half, cz)];
    var line1 = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points1), mat);
    group.add(line1);

    // Seconda diagonale
    var points2 = [new THREE.Vector3(cx - half, cy - half, cz), new THREE.Vector3(cx + half, cy + half, cz)];
    var line2 = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points2), mat);
    group.add(line2);

    // Bordo del cerchio X (sottile)
    var borderGeo = new THREE.TorusGeometry(half * 0.85, 0.8, 8, 24);
    var borderMat = new THREE.MeshPhongMaterial({ color: colorHex, opacity: 0.5, transparent: true });
    var border = new THREE.Mesh(borderGeo, borderMat);
    border.position.set(cx, cy, cz);
    group.add(border);
}

function _aggiungiEtichettaDistanza(group, x, y, z, testo, colore) {
    var canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(20, 4, 216, 56, 8); } else { ctx.rect(20, 4, 216, 56); }
    ctx.fill();
    ctx.fillStyle = colore;
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(testo, 128, 38);

    var tex = new THREE.CanvasTexture(canvas);
    var spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    var sprite = new THREE.Sprite(spriteMat);
    sprite.position.set(x, y, z);
    sprite.scale.set(40, 10, 1);
    group.add(sprite);
}

function _disposeGroupMini(group) {
    if (!group) return;
    group.traverse(function (child) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            if (child.material.map) child.material.map.dispose();
            child.material.dispose();
        }
    });
}

function _mostraPlaceholderMiniViewport(messaggio) {
    var container = document.getElementById('pv-vt-miniview');
    if (!container) return;
    container.innerHTML = '<div class="pv-vt-miniview-placeholder"><span class="pv-vt-miniview-icon">📦</span><span>' + messaggio + '</span></div>';
}

// --- Piani Recenti ---

// ID del piano attualmente mostrato nel pannello di dettaglio.
// Serve a rinfrescare solo l'anteprima effettivamente aperta.
var _pianoDettaglioApertoId = null;
var _pianiDettaglioRichiesta = 0;

// Libera renderer, scena e risorse del canvas di anteprima attualmente montato.
// Viene chiamata prima di sostituire il contenuto del dettaglio, così i refresh
// non lasciano contesti WebGL inutilizzati.
function _distruggiAnteprima3DPiano() {
    var canvas = document.getElementById('pd-anteprima-canvas');
    if (!canvas) return;

    var renderer = canvas._pdRenderer;
    if (renderer) {
        renderer.dispose();
        if (typeof renderer.forceContextLoss === 'function') renderer.forceContextLoss();
    }

    var scene = canvas._pdScene;
    if (scene) {
        scene.traverse(function (obj) {
            if (obj.geometry) obj.geometry.dispose();
            if (!obj.material) return;
            var materiali = Array.isArray(obj.material) ? obj.material : [obj.material];
            materiali.forEach(function (materiale) {
                if (materiale.map) materiale.map.dispose();
                materiale.dispose();
            });
        });
    }

    canvas._pdRenderer = null;
    canvas._pdScene = null;
}

// Helper: costruisce l'HTML della lista piani
function _buildPianiListHtml() {
    var listHtml = '';
    WS.piani.forEach(function (p) {
        // Nella lista verticale di "Apri Piano" mostriamo solo il nome.
        listHtml += '<div class="pv-list-item" data-piano-id="' + p.id + '">' +
            '<div class="pv-list-item-info">' +
                '<strong>' + escapeHtml(p.nome) + '</strong>' +
            '</div>' +
        '</div>';
    });
    return listHtml || '<div class="pv-empty"><span class="pv-empty-icon">📁</span><span>Nessun piano salvato</span></div>';
}

// Helper: wiring click sugli item della lista piani (con multi-selezione Ctrl/Shift)
function _wirePianiListClickHandlers() {
    DOM.pvListBody.querySelectorAll('.pv-list-item').forEach(function (item) {
        item.addEventListener('click', function (e) {
            var pid = parseInt(item.dataset.pianoId) || 0;
            if (!pid) return;
            if (e.ctrlKey || e.shiftKey) {
                _toggleSelezioneMultiplaPiani(pid, e.ctrlKey, e.shiftKey);
            } else {
                // Click semplice: seleziona il piano e apri i dettagli
                _pulisciSelezioneMultiplaPiani();
                _pianiSelState.pianiSelezionati.push(pid);
                _pianiSelState.ultimoCliccato = pid;
                item.classList.add('selected-multi');
                _aggiornaBatchToolbarPiani();
                DOM.pvListBody.querySelectorAll('.pv-list-item').forEach(function (el) { el.classList.remove('selected'); });
                item.classList.add('selected');
                renderPianiDettaglio(pid);
            }
        });
    });
}

function renderPianiPanel() {
    if (!_panelViewPronto('piani')) return;
    _pianiDettaglioRichiesta++;
    _pianoDettaglioApertoId = null;
    DOM.pvListTitle.innerHTML = '<i class="bi bi-folder2-open"></i> Piani Recenti';
    DOM.pvFormTitle.textContent = 'Dettaglio Piano';
    DOM.pvListCount.textContent = WS.piani.length;

    // Mostra i controlli di paginazione (dal template Django)
    var pagEl = document.getElementById('piani-pagination');
    if (pagEl) pagEl.style.display = '';

    // Restringi lista sinistra al 30%
    document.getElementById('panel-view-list').style.flex = '0 0 30%';

    // Reset stato selezione multipla piani
    _pianiSelState.pianiSelezionati = [];
    _pianiSelState.ultimoCliccato = null;

    // ---- HEADER: select-all checkbox ----
    var listHeader = document.querySelector('#panel-view-list .pv-list-header');
    if (listHeader) {
        var oldSelAll = listHeader.querySelector('.pv-list-select-all');
        if (oldSelAll) oldSelAll.remove();
        var selectAllHtml = '<label class="pv-list-select-all" title="Seleziona/Deseleziona tutti">' +
            '<input type="checkbox" id="pv-select-all-piani"> Seleziona tutti</label>';
        listHeader.insertAdjacentHTML('afterbegin', selectAllHtml);
        var selAll = document.getElementById('pv-select-all-piani');
        if (selAll) {
            selAll.addEventListener('change', function () {
                if (this.checked) {
                    var items = document.querySelectorAll('#pv-list-body .pv-list-item');
                    items.forEach(function (item) {
                        var id = parseInt(item.dataset.pianoId);
                        if (_pianiSelState.pianiSelezionati.indexOf(id) === -1) {
                            _pianiSelState.pianiSelezionati.push(id);
                        }
                        item.classList.add('selected-multi');
                    });
                } else {
                    _pulisciSelezioneMultiplaPiani();
                }
                _aggiornaBatchToolbarPiani();
            });
        }
    }

    // ---- BATCH TOOLBAR (rimuovi vecchie per evitare duplicati) ----
    var oldToolbar = document.getElementById('pv-batch-toolbar-piani');
    if (oldToolbar) oldToolbar.remove();
    var oldMezziToolbar = document.getElementById('pv-batch-toolbar-mezzi');
    if (oldMezziToolbar) oldMezziToolbar.remove();
    var oldOggettiToolbar = document.getElementById('pv-batch-toolbar');
    if (oldOggettiToolbar) oldOggettiToolbar.remove();
    var batchToolbarHtml =
        '<div class="pv-batch-toolbar" id="pv-batch-toolbar-piani">' +
            '<span class="pv-batch-count">0 selezionati</span>' +
            '<button class="btn btn-danger" id="pv-batch-delete-piani">🗑 Elimina</button>' +
            '<button class="btn btn-sm" id="pv-batch-clear-piani" title="Cancella selezione">✕</button>' +
        '</div>';
    if (listHeader && listHeader.parentNode) {
        listHeader.parentNode.insertBefore(
            (function () { var d = document.createElement('div'); d.innerHTML = batchToolbarHtml; return d.firstElementChild; })(),
            listHeader.nextSibling
        );
    }
    var batchDelP = document.getElementById('pv-batch-delete-piani');
    if (batchDelP) batchDelP.addEventListener('click', _eseguiEliminazioneBatchPiani);
    var batchClearP = document.getElementById('pv-batch-clear-piani');
    if (batchClearP) batchClearP.addEventListener('click', _pulisciSelezioneMultiplaPiani);

    DOM.pvListBody.innerHTML = _buildPianiListHtml();
    _wirePianiListClickHandlers();

    DOM.pvFormBody.innerHTML = '<p style="color:#999;text-align:center;padding:40px;">Seleziona un piano per vedere i dettagli.</p>';
}

function renderPianiDettaglio(pianoId) {
    if (!_panelViewPronto('dettaglio piano')) return;
    var vistaEpoch = _panelViewEpoch;
    _pianoDettaglioApertoId = pianoId;
    var richiesta = ++_pianiDettaglioRichiesta;
    var p = WS.piani.find(function (x) { return x.id == pianoId; });
    if (!p) return;

    // Il dettaglio verrà sostituito dal loader: libera prima il canvas vecchio.
    _distruggiAnteprima3DPiano();
    DOM.pvFormTitle.innerHTML = '<i class="bi bi-file-earmark"></i> ' + escapeHtml(p.nome);

    var statoClass = 'stato-bozza';
    if (p.stato === 'completato') statoClass = 'stato-completato';
    else if (p.stato === 'in_elaborazione') statoClass = 'stato-in_elaborazione';
    else if (p.stato === 'parziale') statoClass = 'stato-parziale';
    else if (p.stato === 'fallito' || p.stato === 'errore') statoClass = 'stato-errore';

    // Mostra loading mentre fetcha i dati
    DOM.pvFormBody.innerHTML = '<p style="color:#999;text-align:center;padding:40px;">Caricamento dettagli piano...</p>';

    // Fetch full data: dettagli piano + distribuzione pesi
    Promise.all([
        fetch('/api/piani/' + pianoId + '/', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); }),
        fetch('/api/piani/' + pianoId + '/distribuzione_pesi/', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
    ]).then(function (results) {
        // Ignora risposte arrivate in ritardo dopo un altro click o refresh.
        if (vistaEpoch !== _panelViewEpoch || richiesta !== _pianiDettaglioRichiesta || _pianoDettaglioApertoId != pianoId) return;
        var pianoFull = results[0];
        var distribuzione = results[1];
        _renderPianiDettaglioContent(pianoId, p, pianoFull, distribuzione, statoClass, richiesta);
    }).catch(function () {
        if (vistaEpoch !== _panelViewEpoch || richiesta !== _pianiDettaglioRichiesta || _pianoDettaglioApertoId != pianoId) return;
        if (DOM.pvFormBody && DOM.pvFormBody.isConnected) {
            DOM.pvFormBody.innerHTML = '<p style="color:#c0392b;text-align:center;padding:40px;">Errore caricamento dettagli.</p>';
        }
    });
}

function _renderPianiDettaglioContent(pianoId, p, pianoFull, distribuzione, statoClass, richiesta) {
    var oggetti = (pianoFull.oggetti_posizionati || []);
    var contenitore = pianoFull.contenitore || {};
    var sezioniCont = (contenitore.sezioni || []);
    var pesoTot = parseFloat(pianoFull.peso_totale_kg) || 0;
    var saturazione = parseFloat(pianoFull.saturazione_volumetrica) || 0;
    var dimsCont = contenitore.dimensioni_mm || contenitore.lunghezza_mm ? {
        x: contenitore.lunghezza_mm || 0, y: contenitore.larghezza_mm || 0, z: contenitore.altezza_mm || 0
    } : { x: 0, y: 0, z: 0 };
    var volumeM3 = (dimsCont.x * dimsCont.y * dimsCont.z) / 1000000000;
    var mesiIt = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];

    // --- Riepilogo oggetti (raggruppa per codice) ---
    var riepilogo = {};
    oggetti.forEach(function (o) {
        var codice = o.codice || '???';
        if (!riepilogo[codice]) riepilogo[codice] = { qty: 0, colore: o.colore || '#447e9b' };
        riepilogo[codice].qty++;
    });
    var codici = Object.keys(riepilogo).sort();
    var maxQty = 1;
    codici.forEach(function (c) { if (riepilogo[c].qty > maxQty) maxQty = riepilogo[c].qty; });

    var riepilogoHtml = '';
    if (codici.length > 0) {
        codici.forEach(function (codice) {
            var r = riepilogo[codice];
            var barW = Math.max(4, Math.round((r.qty / maxQty) * 100));
            riepilogoHtml += '<div class="pd-riep-item">' +
                '<span class="pd-riep-codice" title="' + escapeHtml(codice) + '">' + escapeHtml(codice) + '</span>' +
                '<div class="pd-riep-bar"><div class="pd-riep-bar-fill" style="width:' + barW + '%;background:' + r.colore + ';"></div></div>' +
                '<span class="pd-riep-qty">' + r.qty + '</span>' +
            '</div>';
        });
    } else {
        riepilogoHtml = '<span style="color:#999;font-size:11px;">Nessun oggetto posizionato</span>';
    }

    // --- Peso per asse ---
    var sezioniPeso = (distribuzione && distribuzione.distribuzione_pesi) ? distribuzione.distribuzione_pesi : [];
    var assiHtml = '';
    if (sezioniPeso.length > 0) {
        sezioniPeso.forEach(function (s) {
            var carico = parseFloat(s.carico_attuale_kg) || 0;
            var limite = parseFloat(s.carico_massimo_kg) || 1;
            var pct = Math.min(100, Math.round((carico / limite) * 100));
            var cls = pct > 100 ? 'danger' : (pct > 80 ? 'warning' : '');
            var inizioM = (parseFloat(s.inizio_x_mm) / 1000).toFixed(1);
            var fineM = (parseFloat(s.fine_x_mm) / 1000).toFixed(1);
            assiHtml += '<div class="pd-asse-row">' +
                '<div class="pd-asse-label">' + escapeHtml(s.nome || (inizioM + '-' + fineM + 'm')) + '</div>' +
                '<div class="pd-asse-bar-wrap"><div class="pd-asse-bar-fill ' + cls + '" style="width:' + pct + '%"></div></div>' +
                '<div class="pd-asse-val">' + carico.toFixed(0) + '/' + limite.toFixed(0) + ' kg</div>' +
            '</div>';
        });
    } else {
        assiHtml = '<span style="color:#999;font-size:11px;">Nessuna sezione configurata per questo mezzo</span>';
    }

    // --- Pianale ---
    var maxXmm = 0;
    oggetti.forEach(function (o) {
        var fine = (parseFloat(o.coordinata_x_mm) || 0) + (parseFloat(o.dimensione_x_mm) || 0);
        if (fine > maxXmm) maxXmm = fine;
    });
    var lunghezzaContMm = dimsCont.x;
    var pianaleOccM = lunghezzaContMm > 0 ? (maxXmm / 1000).toFixed(1) : 0;
    var pianaleTotM = (lunghezzaContMm / 1000).toFixed(1);
    var pianalePct = lunghezzaContMm > 0 ? Math.min(100, Math.round((maxXmm / lunghezzaContMm) * 100)) : 0;
    var pianaleLiberoM = Math.max(0, (lunghezzaContMm - maxXmm) / 1000).toFixed(1);
    var pianaleHtml =
        '<div class="pd-pianale-row">' +
            '<div class="pd-pianale-bar-wrap"><div class="pd-pianale-bar-fill" style="width:' + pianalePct + '%"></div></div>' +
            '<div class="pd-pianale-val">Occupato ' + pianaleOccM + 'm / ' + pianaleTotM + 'm (' + pianalePct + '%) · Libero ' + pianaleLiberoM + 'm</div>' +
        '</div>';

    // --- Date del piano ---
    function formattaDataPiano(valore) {
        if (!valore) return '';
        var d = new Date(valore);
        if (isNaN(d.getTime())) return '';
        return d.getDate() + ' ' + (mesiIt[d.getMonth()] || '') + ' ' + d.getFullYear() + ' ' +
            String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }
    var dataCreazioneStr = formattaDataPiano(pianoFull.created_at);
    var ultimaModificaStr = formattaDataPiano(pianoFull.updated_at);
    var datePianoHtml =
        '<div style="font-size:10px;color:#999;margin-bottom:6px;">' +
            'Data creazione: ' + (dataCreazioneStr || '—') +
            ' · Ultima modifica: ' + (ultimaModificaStr || '—') +
        '</div>';

    // --- Layout completo ---
    DOM.pvFormBody.innerHTML =
        '<!-- TOP ROW: colonna sx (info+assi+pianale) + colonna dx (riepilogo a tutta altezza) -->' +
        '<div class="pd-toprow">' +
            '<div class="pd-info-col">' +
                '<div class="field-group" style="margin-bottom:6px;">' +
                    '<label class="field-label">Nome Piano</label>' +
                    '<div class="pd-nome-row">' +
                        '<input type="text" class="form-input" id="pd-piano-nome" value="' + escapeHtml(p.nome) + '" style="flex:1;">' +
                        '<button class="btn btn-sm btn-primary" id="pd-btn-salva-nome">💾</button>' +
                    '</div>' +
                '</div>' +
                '<div style="display:flex;align-items:center;gap:8px;margin-bottom:2px;">' +
                    '<span class="field-label" style="margin:0;">Stato:</span>' +
                    '<span class="stato-badge ' + statoClass + '">' + escapeHtml(p.stato_display || p.stato) + '</span>' +
                '</div>' +
                '<div style="font-size:11px;color:#666;margin-bottom:1px;">Mezzo: <strong>' + escapeHtml(p.container || contenitore.nome || '-') + '</strong></div>' +
                '<div style="font-size:11px;color:#666;margin-bottom:1px;">' + formatCm(dimsCont.x) + '×' + formatCm(dimsCont.y) + '×' + formatCm(dimsCont.z) + ' cm · ' + volumeM3.toFixed(1) + ' m³</div>' +
                datePianoHtml +
                '<!-- PESO PER ASSE -->' +
                '<div class="pd-info-section">' +
                    '<div class="field-label">📊 Peso per Asse</div>' +
                    '<div class="pd-assi-list">' + assiHtml + '</div>' +
                '</div>' +
                '<!-- PIANALE -->' +
                '<div class="pd-info-section">' +
                    '<div class="field-label">📏 Pianale</div>' +
                    pianaleHtml +
                '</div>' +
            '</div>' +
            '<div class="pd-riep-col">' +
                '<div class="field-label" style="margin-bottom:4px;">📦 Riepilogo Carico</div>' +
                '<div class="pd-riep-list">' + riepilogoHtml + '</div>' +
                '<div class="pd-riep-totali">' +
                    '<span>🏋️ ' + pesoTot.toFixed(0) + ' kg</span>' +
                    '<span>📐 ' + saturazione.toFixed(0) + '%</span>' +
                    '<span>📦 ' + oggetti.length + ' pz</span>' +
                '</div>' +
            '</div>' +
        '</div>' +
        '<!-- ANTEPRIMA 3D -->' +
        '<div class="pd-section">' +
            '<div class="field-label">🎯 Anteprima Carico</div>' +
            '<div class="pd-anteprima-wrap" id="pd-anteprima-wrap">' +
                '<canvas id="pd-anteprima-canvas" style="width:100%;height:100%;display:block;"></canvas>' +
            '</div>' +
        '</div>' +
        '<!-- AZIONI -->' +
        '<div class="field-row" style="gap:8px;margin-top:4px;">' +
            '<button class="btn btn-primary" style="flex:1;" id="pv-piano-carica">📦 Carica nel viewport 3D</button>' +
            '<button class="btn btn-danger" id="pv-piano-delete">🗑 Elimina</button>' +
        '</div>' +
        '<button class="btn btn-block" id="pv-piano-seleziona" style="margin-top:4px;">🚛 Seleziona questo mezzo</button>';

    // --- Event listeners ---
    document.getElementById('pv-piano-carica').addEventListener('click', function () {
        if (typeof WS !== 'undefined') WS._autoPreviewPosizioni = null;
        WS.activePianoId = pianoId;
        if (DOM.headerExportBtn) DOM.headerExportBtn.disabled = false;
        var mezzo = WS.contenitori.find(function (c) { return c.nome === p.container; });
        if (mezzo) selezionaMezzo(mezzo.id);
        caricaScena3D(pianoId);
        mostraViewport();
        showToast('Piano #' + pianoId + ' caricato.', 'info');
    });

    var deleteBtn = document.getElementById('pv-piano-delete');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async function (e) {
            e.stopPropagation();
            if (!confirm('Eliminare il piano "' + escapeHtml(p.nome) + '"?\n\nQuesta operazione è irreversibile.')) return;
            try {
                setStatus('busy', 'Eliminazione piano...');
                var resp = await fetch('/api/piani/' + pianoId + '/', { method: 'DELETE', headers: { 'X-CSRFToken': getCSRFToken() } });
                if (!resp.ok) throw new Error(await _parseDeleteError(resp));
                var idx = WS.piani.findIndex(function (x) { return x.id == pianoId; });
                if (idx >= 0) WS.piani.splice(idx, 1);
                renderPianiPanel();
                showToast('🗑 Piano eliminato!', 'success');
                setStatus('idle', 'Eliminato');
            } catch (err) { showToast('❌ Errore eliminazione: ' + err.message, 'error'); setStatus('error', 'Errore'); }
        });
    }

    document.getElementById('pv-piano-seleziona').addEventListener('click', function () {
        var mezzo = WS.contenitori.find(function (c) { return c.nome === p.container; });
        if (mezzo) selezionaMezzo(mezzo.id);
        showToast('Mezzo selezionato: ' + p.container, 'info');
    });

    // Salva nome piano
    document.getElementById('pd-btn-salva-nome').addEventListener('click', async function () {
        var nuovoNome = document.getElementById('pd-piano-nome').value.trim();
        if (!nuovoNome) { showToast('Inserisci un nome.', 'warning'); return; }
        try {
            var resp = await fetch('/api/piani/' + pianoId + '/', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
                body: JSON.stringify({ nome: nuovoNome }),
            });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            var idx = WS.piani.findIndex(function (x) { return x.id == pianoId; });
            if (idx >= 0) WS.piani[idx].nome = nuovoNome;
            showToast('✅ Nome aggiornato!', 'success');
        } catch (err) { showToast('❌ Errore: ' + err.message, 'error'); }
    });

    // Aggiornamento live: mentre scrivi, cambia subito nome nella lista e nel titolo
    var _nomeOriginale = p.nome;
    document.getElementById('pd-piano-nome').addEventListener('input', function () {
        var nomeLive = this.value.trim() || _nomeOriginale;
        // Aggiorna titolo pannello destro
        DOM.pvFormTitle.innerHTML = '<i class="bi bi-file-earmark"></i> ' + escapeHtml(nomeLive);
        // Aggiorna nome nella lista sinistra (item corrispondente)
        var listItem = document.querySelector('#pv-list-body .pv-list-item[data-piano-id="' + pianoId + '"]');
        if (listItem) {
            var strongEl = listItem.querySelector('.pv-list-item-info strong');
            if (strongEl) strongEl.textContent = nomeLive;
        }
        // Aggiorna anche WS.piani in locale (così altri riferimenti sono allineati)
        var idx = WS.piani.findIndex(function (x) { return x.id == pianoId; });
        if (idx >= 0) WS.piani[idx].nome = nomeLive;
    });

    // Render anteprima 3D
    setTimeout(function () {
        // Evita che un render ritardato di un piano precedente finisca
        // nel canvas del piano appena selezionato.
        if (vistaEpoch !== _panelViewEpoch || richiesta !== _pianiDettaglioRichiesta || _pianoDettaglioApertoId != pianoId) return;
        _renderAnteprima3DPiano('pd-anteprima-canvas', oggetti, dimsCont);
    }, 100);
}

// Ricarica dal server il dettaglio attualmente aperto dopo un salvataggio.
// Il canvas resta statico: viene eseguito un solo render, soltanto quando serve.
function _aggiornaAnteprimaPianoDopoSalvataggio(pianoId) {
    if (_pianoDettaglioApertoId == null || _pianoDettaglioApertoId != pianoId) return;
    if (!document.getElementById('pd-anteprima-canvas')) return;
    renderPianiDettaglio(pianoId);
}

// =============================================================================
// ANTEPRIMA 3D STATICA PIANO (canvas leggero, camera fissa)
// =============================================================================

function _renderAnteprima3DPiano(canvasId, oggetti, dimsCont) {
    var canvas = document.getElementById(canvasId);
    if (!canvas || typeof THREE === 'undefined') return;

    var wrap = canvas.parentElement;
    var w = wrap.clientWidth || 350;
    var h = wrap.clientHeight || 180;
    if (w < 10) w = 350;
    if (h < 10) h = 180;
    canvas.width = w;
    canvas.height = h;

    // Libera eventuale vecchia scena sul canvas (utile anche in caso di
    // ridisegno diretto senza ricreare il markup del dettaglio).
    _distruggiAnteprima3DPiano();

    var scene = new THREE.Scene();
    scene.background = new THREE.Color('#e8ecf0');
    canvas._pdScene = scene;

    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
    renderer.setSize(w, h, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    canvas._pdRenderer = renderer;

    // Camera isometrica fissa — immagine ingrandita del 20% rispetto alla
    // scala precedente, mantenendo invariato il canvas.
    var maxDim = Math.max(dimsCont.x || 1000, dimsCont.y || 1000, dimsCont.z || 1000) / 10;

    // Stessa convenzione del mainview:
    // API.x = lunghezza → Three.js X,
    // API.y = larghezza → Three.js Z,
    // API.z = altezza → Three.js Y.
    var centerX = (dimsCont.x || 100) / 20;
    var centerY = (dimsCont.z || 100) / 20;
    var centerZ = (dimsCont.y || 100) / 20;

    // Il mainview parte da (800, 600, 1000) e guarda il contenitore.
    // Manteniamo lo zoom +20%, ma applichiamo una piccola variazione
    // controllata all'orientamento: più inclinazione dall'alto e una lieve
    // rotazione laterale, senza modificare coordinate o geometrie.
    var zoom = 1.1;
    var mainViewCamera = { x: 800, y: 600, z: 1000 };
    var yaw = 10 * Math.PI / 180;     // rotazione laterale opposta, 10 gradi
    var pitch = 8 * Math.PI / 180;    // inclinazione dall'alto, 8 gradi
    var viewX = mainViewCamera.x - centerX;
    var viewY = mainViewCamera.y - centerY;
    var viewZ = mainViewCamera.z - centerZ;

    // Ruota il vettore attorno all'asse verticale (yaw).
    var yawX = viewX * Math.cos(yaw) + viewZ * Math.sin(yaw);
    var yawZ = -viewX * Math.sin(yaw) + viewZ * Math.cos(yaw);
    var horizontal = Math.sqrt(yawX * yawX + yawZ * yawZ);

    // Inclina la vista verso il basso/alto mantenendo invariata la distanza.
    var pitchY = viewY * Math.cos(pitch) + horizontal * Math.sin(pitch);
    var pitchHorizontal = -viewY * Math.sin(pitch) + horizontal * Math.cos(pitch);
    var horizontalScale = horizontal > 0 ? pitchHorizontal / horizontal : 1;

    var camera = new THREE.PerspectiveCamera(
        45,
        w / h,
        1,
        Math.max(10000, maxDim * 4)
    );
    camera.position.set(
        centerX + (yawX * horizontalScale) / zoom,
        centerY + pitchY / zoom,
        centerZ + (yawZ * horizontalScale) / zoom
    );
    camera.lookAt(centerX, centerY, centerZ);
    camera.updateProjectionMatrix();

    // Luci
    scene.add(new THREE.AmbientLight('#ffffff', 0.6));
    var dir = new THREE.DirectionalLight('#ffffff', 0.7);
    dir.position.set(1, 1.5, 1);
    scene.add(dir);

    // Contenitore wireframe
    // Il contenitore usa X=lunghezza, Y=altezza, Z=larghezza,
    // come buildContainer() del mainview.
    var cx = (dimsCont.x || 100) / 10;
    var cy = (dimsCont.z || 100) / 10;
    var cz = (dimsCont.y || 100) / 10;
    var contGeo = new THREE.BoxGeometry(cx, cy, cz);
    var contEdges = new THREE.EdgesGeometry(contGeo);
    var contLine = new THREE.LineSegments(contEdges, new THREE.LineBasicMaterial({ color: '#8899aa', transparent: true, opacity: 0.5 }));
    contLine.position.set(cx / 2, cy / 2, cz / 2);
    scene.add(contLine);
    contGeo.dispose();

    // Oggetti
    var coloriUsati = {};
    var colorIdx = 0;
    var defaultColors = ['#447e9b','#e74c3c','#27ae60','#f39c12','#9b59b6','#1abc9c','#e67e22','#2980b9'];
    oggetti.forEach(function (o) {
        // Stesso mapping del mainview: API z è l'altezza verticale,
        // mentre API y è la profondità Three.js.
        var dx = (parseFloat(o.dimensione_x_mm) || 10) / 10;
        var dy = (parseFloat(o.dimensione_z_mm) || 10) / 10;
        var dz = (parseFloat(o.dimensione_y_mm) || 10) / 10;
        var px = (parseFloat(o.posizione_x_mm || o.coordinata_x_mm) || 0) / 10;
        var py = (parseFloat(o.posizione_z_mm || o.coordinata_z_mm) || 0) / 10;
        var pz = (parseFloat(o.posizione_y_mm || o.coordinata_y_mm) || 0) / 10;
        if (dx <= 0 || dy <= 0 || dz <= 0) return;

        var col = o.colore;
        if (!col || col === '#447e9b' || col === '#4488ff') {
            var cod = o.codice || '';
            if (!coloriUsati[cod]) { coloriUsati[cod] = defaultColors[colorIdx % defaultColors.length]; colorIdx++; }
            col = coloriUsati[cod];
        }

        var geo = new THREE.BoxGeometry(dx, dy, dz);
        var mat = new THREE.MeshPhongMaterial({ color: col, transparent: true, opacity: 0.85, shininess: 20 });
        var mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(px + dx / 2, py + dy / 2, pz + dz / 2);
        scene.add(mesh);

        // Bordi sottili
        var edgeGeo = new THREE.EdgesGeometry(geo);
        var edgeLine = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: '#000000', transparent: true, opacity: 0.15 }));
        edgeLine.position.copy(mesh.position);
        scene.add(edgeLine);
    });

    renderer.render(scene, camera);
}

// =============================================================================
// SELEZIONE MULTIPLA PIANI — Stato e funzioni
// =============================================================================

var _pianiSelState = {
    pianiSelezionati: [],
    ultimoCliccato: null,
};

function _pulisciSelezioneMultiplaPiani() {
    _pianiSelState.pianiSelezionati = [];
    _pianiSelState.ultimoCliccato = null;
    var items = document.querySelectorAll('#pv-list-body .pv-list-item');
    items.forEach(function (el) { el.classList.remove('selected-multi'); });
    var selAll = document.getElementById('pv-select-all-piani');
    if (selAll) selAll.checked = false;
    _aggiornaBatchToolbarPiani();
}

function _aggiornaBatchToolbarPiani() {
    var toolbar = document.getElementById('pv-batch-toolbar-piani');
    if (!toolbar) return;
    var count = _pianiSelState.pianiSelezionati.length;
    if (count >= 2) {
        toolbar.classList.add('visible');
        var countEl = toolbar.querySelector('.pv-batch-count');
        if (countEl) countEl.textContent = count + ' selezionati';
        var delBtn = document.getElementById('pv-batch-delete-piani');
        if (delBtn) delBtn.textContent = '🗑 Elimina ' + count;
    } else {
        toolbar.classList.remove('visible');
    }
}

function _toggleSelezioneMultiplaPiani(pianoId, ctrlKey, shiftKey) {
    var items = Array.from(document.querySelectorAll('#pv-list-body .pv-list-item'));
    var currentItem = items.find(function (el) { return parseInt(el.dataset.pianoId) == pianoId; });
    if (!currentItem) return;

    if (shiftKey && _pianiSelState.ultimoCliccato !== null) {
        var startIdx = items.findIndex(function (el) { return parseInt(el.dataset.pianoId) == _pianiSelState.ultimoCliccato; });
        var endIdx = items.findIndex(function (el) { return el === currentItem; });
        if (startIdx >= 0 && endIdx >= 0) {
            var minIdx = Math.min(startIdx, endIdx);
            var maxIdx = Math.max(startIdx, endIdx);
            for (var i = minIdx; i <= maxIdx; i++) {
                var id = parseInt(items[i].dataset.pianoId);
                if (_pianiSelState.pianiSelezionati.indexOf(id) === -1) {
                    _pianiSelState.pianiSelezionati.push(id);
                }
                items[i].classList.add('selected-multi');
            }
        }
    } else if (ctrlKey) {
        var idx = _pianiSelState.pianiSelezionati.indexOf(pianoId);
        if (idx >= 0) {
            _pianiSelState.pianiSelezionati.splice(idx, 1);
            currentItem.classList.remove('selected-multi');
        } else {
            _pianiSelState.pianiSelezionati.push(pianoId);
            currentItem.classList.add('selected-multi');
        }
    } else {
        _pulisciSelezioneMultiplaPiani();
        _pianiSelState.pianiSelezionati.push(pianoId);
        currentItem.classList.add('selected-multi');
    }

    _pianiSelState.ultimoCliccato = pianoId;
    _aggiornaBatchToolbarPiani();
}

async function _eseguiEliminazioneBatchPiani() {
    var ids = _pianiSelState.pianiSelezionati;
    if (ids.length === 0) return;

    var piani = ids.map(function (id) {
        return WS.piani.find(function (p) { return p.id == id; });
    }).filter(Boolean);
    var nomi = piani.map(function (p) { return p.nome; }).join(', ');

    if (!confirm('Eliminare ' + ids.length + ' piani?\n\n' + nomi + '\n\nQuesta operazione è irreversibile.')) return;

    try {
        setStatus('busy', 'Eliminazione batch piani...');
        var eliminati = 0;
        for (var i = 0; i < ids.length; i++) {
            var resp = await fetch('/api/piani/' + ids[i] + '/', {
                method: 'DELETE',
                headers: { 'X-CSRFToken': getCSRFToken() },
            });
            if (resp.ok) {
                var idx = WS.piani.findIndex(function (p) { return p.id == ids[i]; });
                if (idx >= 0) WS.piani.splice(idx, 1);
                eliminati++;
            }
        }
        _pulisciSelezioneMultiplaPiani();
        renderPianiPanel();
        showToast('🗑 Eliminati ' + eliminati + ' piani!', 'success');
        setStatus('idle', 'Eliminati');
    } catch (err) {
        showToast('❌ Errore eliminazione batch: ' + err.message, 'error');
        setStatus('error', 'Errore');
    }
}

