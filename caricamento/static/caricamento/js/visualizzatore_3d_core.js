/**
 * Visualizzatore 3D — Core: inizializzazione Three.js
 *
 * STATE, SCENE, coordinate helpers, initScene, initControls,
 * initLights, initBackground — setup puro della scena.
 *
 * Depends on: three.js CDN (THREE, OrbitControls, CSS2DRenderer)
 */

/**
 * Visualizzatore 3D per l'ottimizzazione del carico tridimensionale.
 *
 * Utilizza Three.js (tramite CDN) per disegnare:
 * - Un parallelepipedo semitrasparente per il container
 * - Cubi colorati per gli oggetti posizionati
 * - Controlli Orbitali per rotazione/zoom
 * - Label, metriche e interazioni
 *
 * I dati vengono caricati dall'endpoint: GET /api/piani/{id}/dati_3d/
 * Le dimensioni sono gestite in centimetri per comodità di rendering.
 */

// =============================================================================
// STATO GLOBALE
// =============================================================================

const STATE = {
    pianoId: null,
    dati: null,
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    animazione: null,
    oggettiMesh: [],
    containerMesh: null,
    grigliaMesh: null,
    axesMesh: null,
    animating: true,
    tooltip: null,
    raycaster: null,
    mouse: null,
    // Toggle etichette (controllate dalle impostazioni output)
    mostraEtichetteOggetti: true,
    mostraEtichettaContenitore: true,
    _containerLabelSprite: null,
    // Drag manuale
    snapStepCm: 10,
    dragState: {
        active: false,
        object: null,
        ctrlDown: false,
        shiftDown: false,
        offset: new THREE.Vector3(),
        planeIntersect: new THREE.Vector3(),
        startPos: new THREE.Vector3(),
        lastValidPos: new THREE.Vector3(),  // ultima posizione senza collisioni
        _wasColliding: false,                // evita highlight ridondanti durante drag
        plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
        _ctrlPrevMouseY: 0,
        _ctrlRawApiZ: 0,          // accumulatore float per Z verticale (evita deadzone snap)
    },
    _dragListeners: null,
    // Spaziatura visiva tra oggetti (100 = dimensione reale, 70-100 = rimpiccioliti)
    spaziatura: 100,
    // Selezione oggetto (click senza drag in modalità manuale)
    selectedObject: null,
    // Rotazione manuale (Shift + drag)
    rotationState: {
        active: false,
        object: null,
        startAngle: 0,
        orientamentoIniziale: '',
        stepAccumulato: 0,        // numero di step da 90° accumulati
    },
};

// =============================================================================
// INIZIALIZZAZIONE
// =============================================================================

function initScene(containerId) {
    const container = document.getElementById(containerId);
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Pulisci il renderer precedente per evitare "Too many active WebGL contexts"
    if (STATE && STATE.renderer) {
        try {
            STATE.renderer.dispose();
            STATE.renderer.forceContextLoss();
        } catch (e) { /* ignore */ }
        STATE.renderer = null;
    }
    if (STATE && STATE.controls) {
        STATE.controls.dispose();
        STATE.controls = null;
    }
    // Rimuovi vecchi canvas orfani nel container
    var vecchiCanvas = container.querySelectorAll('canvas');
    for (var i = 0; i < vecchiCanvas.length; i++) {
        vecchiCanvas[i].remove();
    }

    // Scena — tema chiaro (Django Admin)
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f2f5);

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 100000);
    camera.position.set(800, 600, 1000);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    // --- Shift+rotella per spaziatura oggetti ---
    renderer.domElement.addEventListener('wheel', function (e) {
        if (!e.shiftKey) return;  // senza Shift → zoom normale (OrbitControls)
        e.preventDefault();
        e.stopImmediatePropagation();
        var delta = e.deltaY > 0 ? -1 : 1;  // rotella giù = rimpicciolisci
        var nuova = Math.max(30, Math.min(100, STATE.spaziatura + delta));
        if (typeof _applicaSpaziatura === 'function') {
            _applicaSpaziatura(nuova);
        }
    }, { passive: false });

    // Raycaster per hover/click
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    STATE.scene = scene;
    STATE.camera = camera;
    STATE.renderer = renderer;
    STATE.raycaster = raycaster;
    STATE.mouse = mouse;

    return { scene, camera, renderer };
}

function initControls(camera, renderer) {
    // Pulisci listener precedenti (evita memory leak in caso di re-init)
    if (STATE._ctrlListeners) {
        window.removeEventListener('keydown', STATE._ctrlListeners.onKeyDown);
        window.removeEventListener('keyup', STATE._ctrlListeners.onKeyUp);
        window.removeEventListener('blur', STATE._ctrlListeners.onBlur);
        window.removeEventListener('focus', STATE._ctrlListeners.onFocus);
        STATE._ctrlListeners = null;
    }

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.rotateSpeed = 0.8;
    controls.zoomSpeed = 1.2;
    controls.panSpeed = 0.8;
    controls.target.set(0, 0, 0);
    controls.update();
    STATE.controls = controls;

    // --- Supporto panning con Ctrl + tasto sinistro ---
    // Three.js v0.128 non supporta i modificatori da tastiera per cambiare
    // il comportamento del mouse. Li implementiamo manualmente.
    var isCtrlDown = false;

    function onKeyDown(e) {
        if (e.ctrlKey || e.metaKey) {
            if (!isCtrlDown) {
                isCtrlDown = true;
                // Ctrl premuto: tasto sinistro → PAN invece di ROTATE
                controls.mouseButtons = {
                    LEFT: THREE.MOUSE.PAN,
                    MIDDLE: THREE.MOUSE.DOLLY,
                    RIGHT: THREE.MOUSE.PAN
                };
            }
        }
    }

    function onKeyUp(e) {
        if (!e.ctrlKey && !e.metaKey && isCtrlDown) {
            isCtrlDown = false;
            // Ctrl rilasciato: ripristina comportamento normale
            controls.mouseButtons = {
                LEFT: THREE.MOUSE.ROTATE,
                MIDDLE: THREE.MOUSE.DOLLY,
                RIGHT: THREE.MOUSE.PAN
            };
        }
    }

    // Traccia Ctrl anche quando la finestra perde/riacquista focus
    function onBlur() {
        if (isCtrlDown) {
            isCtrlDown = false;
            controls.mouseButtons = {
                LEFT: THREE.MOUSE.ROTATE,
                MIDDLE: THREE.MOUSE.DOLLY,
                RIGHT: THREE.MOUSE.PAN
            };
        }
    }

    // Ri-sincronizza stato Ctrl quando la finestra riacquista focus
    // (es. se l'utente torna al tab mentre tiene ancora premuto Ctrl)
    function onFocus(e) {
        // Non possiamo leggere e.ctrlKey da un evento focus,
        // ma al prossimo keydown/keyup lo stato si sincronizzerà automaticamente.
        // Resettiamo isCtrlDown per sicurezza — se Ctrl è ancora premuto,
        // il prossimo keydown lo rileverà.
        if (isCtrlDown) {
            isCtrlDown = false;
            controls.mouseButtons = {
                LEFT: THREE.MOUSE.ROTATE,
                MIDDLE: THREE.MOUSE.DOLLY,
                RIGHT: THREE.MOUSE.PAN
            };
        }
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);

    // Salva riferimenti per cleanup
    STATE._ctrlListeners = { onKeyDown: onKeyDown, onKeyUp: onKeyUp, onBlur: onBlur, onFocus: onFocus };

    return controls;
}

function initLights(scene) {
    // Luce ambientale
    const ambient = new THREE.AmbientLight(0x404060, 0.6);
    scene.add(ambient);

    // Luce principale (direzionale con ombre)
    const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
    mainLight.position.set(500, 1000, 500);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    scene.add(mainLight);

    // Luce di riempimento
    const fillLight = new THREE.DirectionalLight(0x4488ff, 0.4);
    fillLight.position.set(-500, 300, -500);
    scene.add(fillLight);

    // Luce laterale calda
    const rimLight = new THREE.DirectionalLight(0xff8844, 0.3);
    rimLight.position.set(-300, 200, 600);
    scene.add(rimLight);

    // Luce "sky" dall'alto
    const topLight = new THREE.DirectionalLight(0x88aaff, 0.2);
    topLight.position.set(0, 800, 0);
    scene.add(topLight);
}

function initBackground(scene) {
    // Griglia di riferimento sul piano di terra (Y=0)
    // Dimensione 3000 cm (30m) con divisioni ogni 100 cm (1m)
    // Nascosta di default — toggle in Impostazioni > Output > Mostra griglia
    const grid = new THREE.GridHelper(3000, 30, 0xcccccc, 0xe0e0e0);
    grid.position.y = 0;
    grid.visible = false;
    scene.add(grid);
    STATE.grigliaMesh = grid;

    // Assi di riferimento (X rosso, Y verde, Z blu) — nascosti di default
    var axes = new THREE.AxesHelper(200);
    axes.position.set(0, 0, 0);
    axes.visible = false;
    scene.add(axes);
    STATE.axesMesh = axes;
}

