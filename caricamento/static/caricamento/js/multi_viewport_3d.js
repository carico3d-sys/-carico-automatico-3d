/**
 * Multi Viewport 3D — Vista 2×2 (Fronte | Lato | Pianta | 3D)
 *
 * Dopo che la scena 3D è stata caricata (visualizzatore_3d.js),
 * questo modulo sostituisce il render loop con 4 viste simultanee:
 *
 *   ┌──────────┬──────────┐
 *   │  Fronte  │   Lato   │
 *   ├──────────┼──────────┤
 *   │  Pianta  │    3D    │
 *   └──────────┴──────────┘
 *
 * Usa un solo renderer + 4 camere, disegnando 4 volte per frame
 * con renderer.setViewport / renderer.setScissor.
 *
 * NOTA: OrbitControls r128 non supporta lo scissor — i controlli mouse
 * funzionano su tutto il canvas, non solo sul quadrante 3D.
 *
 * Caricato DOPO visualizzatore_3d.js — riusa STATE.scene, STATE.renderer,
 * STATE.oggettiMesh, STATE.containerMesh.
 */

// =============================================================================
// STATO MULTI-VIEWPORT
// =============================================================================

var MVP = {
    attivo: false,
    camFront: null,
    camSide: null,
    camTop: null,
    cam3D: null,
    controls3D: null,
    _overlayEl: null,
    _resizeHandler: null,
};

// =============================================================================
// INIZIALIZZAZIONE
// =============================================================================

function initMultiViewport() {
    if (!STATE.renderer || !STATE.scene || !STATE.camera) {
        console.warn('MultiViewport: scena 3D non ancora inizializzata.');
        return;
    }

    if (MVP.attivo) return; // già attivo

    var container = document.getElementById('viewport-3d');
    if (!container) return;

    // Ferma animazione corrente e pulisci controlli vecchi
    STATE.animating = false;

    // Rimuovi listener resize vecchio (messo da avviaVisualizzatore)
    window.removeEventListener('resize', handleResize);

    // Disposable dei vecchi OrbitControls
    if (STATE.controls) {
        STATE.controls.dispose();
        STATE.controls = null;
    }

    // --- Crea le 4 camere ---
    var halfAspect = (container.clientWidth / 2) / (container.clientHeight / 2);

    // Calcola centro container
    var target = new THREE.Vector3(0, 0, 0);
    if (STATE.containerMesh) {
        var box = new THREE.Box3().setFromObject(STATE.containerMesh);
        box.getCenter(target);
    }
    var dist = 1200;

    // Camera Frontale (da +Z verso -Z)
    MVP.camFront = new THREE.PerspectiveCamera(45, halfAspect, 1, 100000);
    MVP.camFront.position.set(target.x, target.y, target.z + dist);
    MVP.camFront.lookAt(target);

    // Camera Laterale (da +X verso -X)
    MVP.camSide = new THREE.PerspectiveCamera(45, halfAspect, 1, 100000);
    MVP.camSide.position.set(target.x + dist, target.y, target.z);
    MVP.camSide.lookAt(target);

    // Camera Pianta / Dall'alto (da +Y verso -Y)
    MVP.camTop = new THREE.PerspectiveCamera(45, halfAspect, 1, 100000);
    MVP.camTop.position.set(target.x, target.y + dist, target.z);
    MVP.camTop.lookAt(target);

    // Camera 3D prospettica (riusa STATE.camera, ma forza prospettiva)
    MVP.cam3D = STATE.camera;
    // Il quadrante 3D deve sempre essere in prospettiva, non flat.
    // Se l'utente ha premuto una vista singola (fronte/pianta/lato),
    // STATE.camera è in posizione ortografica — riposizionala in diagonale.
    MVP.cam3D.position.set(target.x + dist * 0.7, target.y + dist * 0.5, target.z + dist * 0.7);

    // Nuovi OrbitControls per il quadrante 3D
    // NOTA: r128 non supporta scissor — i mouse event funzionano su tutto il canvas
    MVP.controls3D = new THREE.OrbitControls(MVP.cam3D, STATE.renderer.domElement);
    MVP.controls3D.enableDamping = true;
    MVP.controls3D.dampingFactor = 0.1;
    MVP.controls3D.target.copy(target);
    MVP.controls3D.update();
    // Esponi come STATE.controls per le funzioni esistenti (cameraZoom, etc.)
    STATE.controls = MVP.controls3D;

    // --- Overlay etichette ---
    _creaOverlayEtichette(container);

    // --- Resize handler ---
    if (MVP._resizeHandler) window.removeEventListener('resize', MVP._resizeHandler);
    MVP._resizeHandler = function () { _multiViewportResize(); };
    window.addEventListener('resize', MVP._resizeHandler);

    // Avvia il loop
    MVP.attivo = true;
    STATE.animating = true;
    _multiViewportLoop();
}

// =============================================================================
// OVERLAY ETICHETTE QUADRANTI
// =============================================================================

function _creaOverlayEtichette(container) {
    var old = container.querySelector('.mvp-overlay');
    if (old) old.remove();

    MVP._overlayEl = document.createElement('div');
    MVP._overlayEl.className = 'mvp-overlay';

    var labels = [
        { text: '🚛 Fronte', pos: 'mvp-top-left' },
        { text: '📐 Lato',   pos: 'mvp-top-right' },
        { text: '📋 Pianta', pos: 'mvp-bottom-left' },
        { text: '🔄 3D',     pos: 'mvp-bottom-right' },
    ];

    labels.forEach(function (l) {
        var el = document.createElement('div');
        el.className = 'mvp-label ' + l.pos;
        el.textContent = l.text;
        MVP._overlayEl.appendChild(el);
    });

    // Linee separazione (croce centrale)
    var vLine = document.createElement('div');
    vLine.className = 'mvp-line mvp-line-v';
    MVP._overlayEl.appendChild(vLine);

    var hLine = document.createElement('div');
    hLine.className = 'mvp-line mvp-line-h';
    MVP._overlayEl.appendChild(hLine);

    container.appendChild(MVP._overlayEl);
}

// =============================================================================
// RENDER LOOP MULTI-VIEWPORT
// =============================================================================

function _multiViewportLoop() {
    if (!MVP.attivo || !STATE.animating) return;
    requestAnimationFrame(_multiViewportLoop);

    if (!STATE.renderer || !STATE.scene) return;

    var renderer = STATE.renderer;
    var scene = STATE.scene;
    var w = renderer.domElement.clientWidth;
    var h = renderer.domElement.clientHeight;
    var hw = Math.floor(w / 2);
    var hh = Math.floor(h / 2);

    // Aggiorna OrbitControls (quadrante 3D)
    if (MVP.controls3D) {
        MVP.controls3D.update();
    }

    // Animazione oggetti (floating + decal)
    _aggiornaOggettiAnimazione();

    // --- Disegna 4 quadranti ---
    renderer.setScissorTest(true);

    // 1. FRONTE (alto-sinistra)
    renderer.setViewport(0, hh, hw, hh);
    renderer.setScissor(0, hh, hw, hh);
    renderer.render(scene, MVP.camFront);

    // 2. LATO (alto-destra)
    renderer.setViewport(hw, hh, hw, hh);
    renderer.setScissor(hw, hh, hw, hh);
    renderer.render(scene, MVP.camSide);

    // 3. PIANTA (basso-sinistra)
    renderer.setViewport(0, 0, hw, hh);
    renderer.setScissor(0, 0, hw, hh);
    renderer.render(scene, MVP.camTop);

    // 4. 3D (basso-destra)
    renderer.setViewport(hw, 0, hw, hh);
    renderer.setScissor(hw, 0, hw, hh);
    renderer.render(scene, MVP.cam3D);

    renderer.setScissorTest(false);
}

// =============================================================================
// ANIMAZIONE OGGETTI (floating + decal camera-facing)
// =============================================================================

var _mvpCamWorldVec = new THREE.Vector3();
var _mvpCamLocalVec = new THREE.Vector3();

function _aggiornaOggettiAnimazione() {
    if (!STATE.oggettiMesh) return;

    _mvpCamWorldVec.copy(MVP.cam3D.position);

    STATE.oggettiMesh.forEach(function (group, i) {
        var mesh = group.children[0];
        if (!mesh || mesh.type !== 'Mesh') return;

        // Fluttuazione
        mesh.position.y = Math.sin(Date.now() * 0.002 + i * 1.5) * 0.5;

        // Decal camera-facing
        var decalFaces = mesh.userData._decalFaces;
        if (!decalFaces) return;

        mesh.worldToLocal(_mvpCamLocalVec.copy(_mvpCamWorldVec));
        var lx = _mvpCamLocalVec.x;
        var ly = _mvpCamLocalVec.y;
        var lz = _mvpCamLocalVec.z;
        decalFaces[0].visible = (lz > 0) && STATE.mostraEtichetteOggetti;
        decalFaces[1].visible = (lz < 0) && STATE.mostraEtichetteOggetti;
        decalFaces[2].visible = (lx > 0) && STATE.mostraEtichetteOggetti;
        decalFaces[3].visible = (lx < 0) && STATE.mostraEtichetteOggetti;
        decalFaces[4].visible = (ly > 0) && STATE.mostraEtichetteOggetti;
        decalFaces[5].visible = (ly < 0) && STATE.mostraEtichetteOggetti;
    });
}

// =============================================================================
// RESIZE
// =============================================================================

function _multiViewportResize() {
    var container = document.getElementById('viewport-3d');
    if (!container) return;
    var w = container.clientWidth;
    var h = container.clientHeight;
    var halfAspect = (w / 2) / (h / 2);

    STATE.renderer.setSize(w, h);

    [MVP.camFront, MVP.camSide, MVP.camTop, MVP.cam3D].forEach(function (cam) {
        if (cam) {
            cam.aspect = halfAspect;
            cam.updateProjectionMatrix();
        }
    });
}

// =============================================================================
// DISATTIVA MULTI-VIEWPORT (torna al singolo viewport)
// =============================================================================

function disattivaMultiViewport() {
    MVP.attivo = false;
    STATE.animating = false;

    // Rimuovi stato attivo dal pulsante griglia
    var gridBtn = document.getElementById('vp-btn-grid');
    if (gridBtn) gridBtn.classList.remove('active');

    if (MVP._overlayEl) {
        MVP._overlayEl.remove();
        MVP._overlayEl = null;
    }

    // Rimuovi listener resize multi-viewport
    if (MVP._resizeHandler) {
        window.removeEventListener('resize', MVP._resizeHandler);
        MVP._resizeHandler = null;
    }

    // Dispose OrbitControls multi-viewport
    if (MVP.controls3D) {
        MVP.controls3D.dispose();
        MVP.controls3D = null;
    }

    // Ricrea OrbitControls standard e riavvia scena
    STATE.controls = null;
    initControls(STATE.camera, STATE.renderer);

    // Ripristina listener resize standard (rimuovi eventuali duplicati)  
    window.removeEventListener('resize', handleResize);
    window.addEventListener('resize', handleResize);

    // Reset viewport/scissor a tutto canvas (il multi-viewport lascia il
    // renderer sull'ultimo quadrante, altrimenti animate() disegna solo lì)
    var canvasW = STATE.renderer.domElement.clientWidth;
    var canvasH = STATE.renderer.domElement.clientHeight;
    STATE.renderer.setViewport(0, 0, canvasW, canvasH);
    STATE.renderer.setScissor(0, 0, canvasW, canvasH);
    STATE.renderer.setScissorTest(false);

    // Ripristina aspect ratio camera per il viewport intero
    // (il multi-viewport imposta halfAspect su STATE.camera/MVP.cam3D).
    // Usa le dimensioni del canvas (sempre disponibili), non del container.
    if (canvasW > 0 && canvasH > 0) {
        STATE.camera.aspect = canvasW / canvasH;
        STATE.camera.updateProjectionMatrix();
    }

    // Ripristina il target degli OrbitControls al centro del contenitore
    if (STATE.containerMesh) {
        var box = new THREE.Box3().setFromObject(STATE.containerMesh);
        var centro = new THREE.Vector3();
        box.getCenter(centro);
        STATE.controls.target.copy(centro);
    }

    // Torna sempre in prospettiva 3D all'uscita dai 4 quadranti
    var dist = 1200;
    STATE.camera.position.set(
        STATE.controls.target.x + dist * 0.7,
        STATE.controls.target.y + dist * 0.5,
        STATE.controls.target.z + dist * 0.7
    );
    STATE.controls.update();

    // Riavvia animazione standard
    STATE.animating = true;
    animate();
}
