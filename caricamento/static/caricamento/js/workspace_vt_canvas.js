/**
 * Workspace Carico 3D — Vincoli Tra Oggetti: Canvas 3D
 *
 * Rendering Three.js statico per le card configurazione,
 * con un solo contesto WebGL condiviso e copia raster nei canvas 2D.
 * Questo evita il limite del browser sui contesti WebGL simultanei.
 *
 * Griglia interattiva con selezione/esclusione e cleanup delle scene.
 *
 * Depends on: workspace_vt_rotazioni.js (_vtState, _vtNessunaSelezionata, _vtQualcunaSelezionata)
 */

// =============================================================================
// RENDERER CONDIVISO
// =============================================================================
// Un WebGLRenderer per ogni card supera il limite dei contesti WebGL del
// browser (in genere 8/16): le prime card diventano quindi vuote quando
// vengono create molte configurazioni. Il renderer resta fuori dal DOM e il
// suo frame viene copiato nel canvas 2D della card dopo ogni render.
var _vtSharedRenderer = null;

function _vtOttieniSharedRenderer() {
    if (_vtSharedRenderer) {
        try {
            var gl = _vtSharedRenderer.getContext();
            if (!gl || !gl.isContextLost()) return _vtSharedRenderer;
            _vtSharedRenderer.dispose();
        } catch (_) {
            // Ricrea il renderer se il contesto è diventato inutilizzabile.
        }
        _vtSharedRenderer = null;
    }
    if (typeof THREE === 'undefined' || !THREE.WebGLRenderer) return null;

    try {
        _vtSharedRenderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: false,
            preserveDrawingBuffer: true,
        });
        _vtSharedRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        _vtSharedRenderer.domElement.addEventListener('webglcontextlost', function (event) {
            event.preventDefault();
            console.warn('[Vincoli tra oggetti] Contesto WebGL perso; verrà ricreato al prossimo render.');
        }, false);
    } catch (err) {
        console.error('[Vincoli tra oggetti] Renderer WebGL non disponibile:', err);
        _vtSharedRenderer = null;
    }
    return _vtSharedRenderer;
}

function _vtLiberaMateriale(materiale) {
    if (!materiale) return;
    var materiali = Array.isArray(materiale) ? materiale : [materiale];
    materiali.forEach(function (material) {
        if (!material) return;
        if (material.map && typeof material.map.dispose === 'function') material.map.dispose();
        material.dispose();
    });
}

function _vtDistruggiCanvases() {
    _vtCanvases.forEach(function (entry) {
        // Il renderer è condiviso e non appartiene al singolo canvas: non
        // distruggerlo qui, altrimenti la card successiva ricreerebbe un altro
        // contesto WebGL. Vengono invece liberate le risorse della scena.
        if (entry.scene) {
            entry.scene.traverse(function (child) {
                if (child.geometry) child.geometry.dispose();
                _vtLiberaMateriale(child.material);
            });
        }
    });
    _vtCanvases = [];
}

function _vtRenderConfigCanvas(canvas, configIdx) {
    var config = _vtState.configurazioni[configIdx];
    if (!config) return;

    var isSelected = config.valida;
    var anySelected = _vtQualcunaSelezionata();
    var isShaded = anySelected && !isSelected;

    // Cerca entry esistente per riuso renderer (evita crash WebGL su ricontestualizzazione)
    var existing = _vtCanvases.find(function (e) { return e.canvas === canvas; });

    // Ottieni dimensioni dal canvas wrapper
    var wrap = canvas.parentElement;
    var w = wrap.offsetWidth || wrap.clientWidth || 280;
    var h = wrap.offsetHeight || wrap.clientHeight || 180;
    if (w < 50) w = 280;
    if (h < 50) h = 180;

    canvas.width = w;
    canvas.height = h;

    // Pulisci scena precedente se esiste
    if (existing && existing.scene) {
        while (existing.scene.children.length > 0) {
            var child = existing.scene.children[0];
            existing.scene.remove(child);
            if (child.geometry) child.geometry.dispose();
            _vtLiberaMateriale(child.material);
        }
    }

    var scene, camera;
    if (existing && existing.scene && existing.camera) {
        scene = existing.scene;
        camera = existing.camera;
        scene.background = new THREE.Color(isShaded ? 0xeceef1 : 0xf5f6f8);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    } else {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(isShaded ? 0xeceef1 : 0xf5f6f8);
        camera = new THREE.PerspectiveCamera(35, w / h, 1, 5000);
    }

    var renderer = _vtOttieniSharedRenderer();
    if (!renderer) return;
    renderer.setSize(w, h);

    var dimsA = config.dimsA, dimsB = config.dimsB;
    // Converti cm
    var ax = dimsA[0] / 10, ay = dimsA[1] / 10, az = dimsA[2] / 10;
    var bx = dimsB[0] / 10, by = dimsB[1] / 10, bz = dimsB[2] / 10;

    // Usa offset scalari del config (v6)
    var offX = (config.offsetX || 0) / 10;
    var offZ = (config.offsetZ || 0) / 10;

    var gap = 3;
    var maxD = Math.max(ax + Math.abs(offX), ay + Math.abs(offZ), bx, by);
    var midX = offX / 2;
    var midZ = offZ / 2;

    // Luci
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    var dl = new THREE.DirectionalLight(0xffffff, 0.8);
    dl.position.set(50, 100, 60);
    scene.add(dl);
    var dl2 = new THREE.DirectionalLight(0xffffff, 0.3);
    dl2.position.set(-30, 20, -30);
    scene.add(dl2);

    // Grid
    var grid = new THREE.GridHelper(Math.max(maxD * 2, 40), 20, 0xdddddd, 0xeeeeee);
    grid.position.y = -0.5;
    scene.add(grid);

    // Materiali: usa il colore definito nell'anagrafica dell'oggetto.
    // Il fallback mantiene la stessa palette usata dal resto del workspace
    // quando l'oggetto non ha un colore esplicito.
    var oggettoA = (typeof trovaOggetto === 'function') ? trovaOggetto(_vtState.oggettoAId) : null;
    var oggettoB = (typeof trovaOggetto === 'function') ? trovaOggetto(_vtState.oggettoBId) : null;
    var colorA = (typeof coloreOggetto === 'function')
        ? coloreOggetto(oggettoA || { id: _vtState.oggettoAId, colore: '' })
        : ((oggettoA && oggettoA.colore) || '#447e9b');
    var colorB = (typeof coloreOggetto === 'function')
        ? coloreOggetto(oggettoB || { id: _vtState.oggettoBId, colore: '' })
        : ((oggettoB && oggettoB.colore) || '#447e9b');
    var matA = new THREE.MeshPhongMaterial({
        color: colorA,
        transparent: true,
        opacity: isShaded ? 0.35 : 0.9,
    });
    var matB = new THREE.MeshPhongMaterial({
        color: colorB,
        transparent: true,
        opacity: isShaded ? 0.35 : 0.9,
    });

    // Bordi scuri derivati dal colore dell'anagrafica, così il colore resta
    // riconoscibile anche quando la configurazione è attenuata.
    var edgeA = new THREE.Color(colorA).multiplyScalar(0.55);
    var edgeB = new THREE.Color(colorB).multiplyScalar(0.55);
    var edgeColorA = edgeA.getHex();
    var edgeColorB = edgeB.getHex();
    var edgeOpacity = isShaded ? 0.35 : 0.7;

    // --- Pavimento (centrato su B) ---
    var platW = Math.max(ax, bx) + Math.abs(offX) + 8;
    var platD = Math.max(ay, by) + Math.abs(offZ) + 8;
    var platCenterX = offX / 2;
    var platCenterZ = offZ / 2;
    var platColor = isSelected ? new THREE.Color(colorA).lerp(new THREE.Color(colorB), 0.5) : 0xf0f4ff;
    var platGeo = new THREE.PlaneGeometry(platW, platD);
    var platMat = new THREE.MeshPhongMaterial({
        color: platColor, transparent: true, opacity: isShaded ? 0.12 : (isSelected ? 0.3 : 0.15),
        side: THREE.DoubleSide,
    });
    var plat = new THREE.Mesh(platGeo, platMat);
    plat.rotation.x = -Math.PI / 2;
    plat.position.set(platCenterX, 0.05, platCenterZ);
    scene.add(plat);

    var platEdge = new THREE.EdgesGeometry(platGeo);
    var platLine = new THREE.LineSegments(platEdge,
        new THREE.LineBasicMaterial({
            color: isSelected ? 0x2563eb : (isShaded ? 0xcccccc : 0x94a3b8),
            transparent: true, opacity: isShaded ? 0.2 : 0.4,
        })
    );
    platLine.rotation.x = -Math.PI / 2;
    platLine.position.set(platCenterX, 0.06, platCenterZ);
    scene.add(platLine);

    // --- Box B (base, sempre centrato) ---
    var geoB = new THREE.BoxGeometry(bx, bz, by);
    var meshB = new THREE.Mesh(geoB, matB);
    meshB.position.set(0, bz / 2, 0);
    scene.add(meshB);

    var edgesB = new THREE.EdgesGeometry(geoB);
    var lineB = new THREE.LineSegments(edgesB,
        new THREE.LineBasicMaterial({ color: edgeColorB, transparent: true, opacity: edgeOpacity })
    );
    lineB.position.copy(meshB.position);
    scene.add(lineB);

    // --- Box A (sopra B, con offset) ---
    var geoA = new THREE.BoxGeometry(ax, az, ay);
    var meshA = new THREE.Mesh(geoA, matA);
    meshA.position.set(offX, bz + gap + az / 2, offZ);
    scene.add(meshA);

    var edgesA = new THREE.EdgesGeometry(geoA);
    var lineA = new THREE.LineSegments(edgesA,
        new THREE.LineBasicMaterial({ color: edgeColorA, transparent: true, opacity: edgeOpacity })
    );
    lineA.position.copy(meshA.position);
    scene.add(lineA);

    // --- Etichetta Config N (segue A) ---
    var labelCanvas = document.createElement('canvas');
    labelCanvas.width = 256; labelCanvas.height = 64;
    var ctx = labelCanvas.getContext('2d');
    ctx.fillStyle = isSelected ? '#2563eb' : (isShaded ? '#94a3b8' : '#475569');
    ctx.font = 'bold 20px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Config ' + config.id, 128, 30);
    ctx.fillStyle = isSelected ? '#2563eb' : (isShaded ? '#94a3b8' : '#64748b');
    ctx.font = '12px -apple-system, sans-serif';
    ctx.fillText('A:' + config.rotA + '  B:' + config.rotB, 128, 52);

    var texture = new THREE.CanvasTexture(labelCanvas);
    var sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
    sprite.position.set(offX, bz + gap + az + 6, offZ);
    sprite.scale.set(14, 3.5, 1);
    scene.add(sprite);

    // --- Highlight bordo se selezionato ---
    if (isSelected) {
        var hlW = Math.max(ax/2 + Math.abs(offX), bx/2) + 2;
        var hlD = Math.max(ay/2 + Math.abs(offZ), by/2) + 2;
        var hlGeo = new THREE.BoxGeometry(hlW * 2, bz + gap + az + 4, hlD * 2);
        var hlEdge = new THREE.EdgesGeometry(hlGeo);
        var hlLine = new THREE.LineSegments(hlEdge, new THREE.LineBasicMaterial({ color: 0x2563eb, linewidth: 1 }));
        hlLine.position.set(midX, (bz + gap + az) / 2, midZ);
        scene.add(hlLine);
    }

    // --- Inquadratura: centra e scala la scena per farla rientrare tutta
    // dentro il canvas. Il GridHelper viene escluso dal calcolo perché si
    // estende molto oltre i box e farebbe rimpicciolire troppo gli oggetti.
    var labelHalf = 7; // metà larghezza dello sprite etichetta (scala 14)
    var bMinX = Math.min(-bx / 2, offX - ax / 2, offX - labelHalf);
    var bMaxX = Math.max(bx / 2, offX + ax / 2, offX + labelHalf);
    var bMinY = 0;
    var bMaxY = bz + gap + az + 8;   // include l'etichetta sopra A
    var bMinZ = Math.min(-by / 2, offZ - ay / 2);
    var bMaxZ = Math.max(by / 2, offZ + ay / 2);
    var bCx = (bMinX + bMaxX) / 2;
    var bCy = (bMinY + bMaxY) / 2;
    var bCz = (bMinZ + bMaxZ) / 2;
    var bDx = (bMaxX - bMinX) / 2;
    var bDy = (bMaxY - bMinY) / 2;
    var bDz = (bMaxZ - bMinZ) / 2;
    var radius = Math.sqrt(bDx * bDx + bDy * bDy + bDz * bDz) || 1;

    var fovRad = camera.fov * Math.PI / 180;
    var aspect = w / h;
    var distV = radius / Math.sin(fovRad / 2);
    var hFovHalf = Math.atan(Math.tan(fovRad / 2) * aspect);
    var distH = radius / Math.sin(hFovHalf);
    var distCam = Math.max(distV, distH) * 1.12;

    var camDir = new THREE.Vector3(0.5, 0.45, 0.65).normalize();
    camera.position.set(bCx + camDir.x * distCam, bCy + camDir.y * distCam, bCz + camDir.z * distCam);
    camera.lookAt(bCx, bCy, bCz);

    // Render statico nel renderer condiviso. Il canvas della card è 2D: così
    // ogni card conserva la propria immagine senza creare un contesto WebGL.
    renderer.render(scene, camera);
    var cardContext = canvas.getContext('2d');
    if (cardContext) {
        cardContext.clearRect(0, 0, canvas.width, canvas.height);
        cardContext.drawImage(renderer.domElement, 0, 0, canvas.width, canvas.height);
    }

    // Salva/aggiorna solo scena e camera per il cleanup e il re-render.
    if (!existing) {
        _vtCanvases.push({ canvas: canvas, scene: scene, camera: camera });
    } else {
        existing.scene = scene;
        existing.camera = camera;
    }
}

/**
 * Conta il totale delle configurazioni per la selezione corrente.
 * Con selezione multipla (più A o più B) somma le configurazioni di ogni
 * coppia A×B; con selezione singola coincide con la coppia primaria.
 */
function _vtContaConfigurazioniTotali() {
    var idsA = (_vtState.oggettiASelezionati || []).slice();
    var idsB = (_vtState.oggettiBSelezionati || []).slice();
    if (!idsA.length) idsA = [_vtState.oggettoAId];
    if (!idsB.length) idsB = [_vtState.oggettoBId];

    var totale = 0;
    idsA.forEach(function (aId) {
        idsB.forEach(function (bId) {
            if (!aId || !bId) return;
            var configs = (aId === _vtState.oggettoAId && bId === _vtState.oggettoBId)
                ? _vtState.configurazioni
                : _vtCalcolaConfigurazioni(aId, bId);
            totale += configs.length;
        });
    });
    return totale;
}

function _vtPopolaGrigliaConfigurazioni() {
    _vtDistruggiCanvases();

    var grid = document.getElementById('vt-config-grid');
    var hint = document.getElementById('vt-selection-hint');
    var count = document.getElementById('vt-config-count');

    if (!grid) return;

    var configs = _vtState.configurazioni;
    if (count) count.textContent = _vtContaConfigurazioniTotali() + ' config';

    // Colonne dinamiche: 1 col per 1-2 config, 2 col per 3-4, 3 col per 5-6, auto per >6
    var cols;
    if (configs.length <= 2) cols = (configs.length === 1) ? 1 : 2;
    else if (configs.length <= 4) cols = 2;
    else if (configs.length <= 9) cols = 3;
    else cols = 0; // auto-fill
    if (cols > 0) {
        grid.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
    } else {
        grid.style.gridTemplateColumns = ''; // usa CSS default (auto-fill)
    }

    if (configs.length === 0) {
        grid.innerHTML = '<div class="vt-obj-empty" style="grid-column:1/-1;padding:32px;">Seleziona Oggetto A e Oggetto B per vedere le configurazioni.</div>';
        if (hint) hint.textContent = '';
        return;
    }

    var anySelected = _vtQualcunaSelezionata();
    var nessuna = _vtNessunaSelezionata();

    if (hint) {
        if (nessuna) {
            hint.textContent = '\u2014 Tutte valide';
            hint.style.color = '#16a34a';
        } else {
            var cnt = configs.filter(function (c) { return c.valida; }).length;
            hint.textContent = '\u2014 ' + cnt + ' di ' + configs.length + ' valide';
            hint.style.color = '#2563eb';
        }
    }

    var html = '';
    configs.forEach(function (c, idx) {
        var isSelected = c.valida;
        var isShaded = anySelected && !isSelected;
        var cls = 'vt-config-card';
        if (isSelected && anySelected) cls += ' selected';
        if (isShaded) cls += ' shaded';
        var badgeHtml = c.valida
            ? '<span class="vt-config-badge valid">valida</span>'
            : '<span class="vt-config-badge invalid">esclusa</span>';

        html += '<div class="' + cls + '" data-config-idx="' + idx + '">' +
            '<div class="vt-config-canvas-wrap"><canvas></canvas></div>' +
            '<div class="vt-config-card-footer">' +
                '<span class="vt-config-id">Config ' + c.id + '</span>' +
                badgeHtml +
                '<span class="vt-config-rots">A:' + c.rotA + ' B:' + c.rotB + '</span>' +
                '<span class="vt-config-pos">' + escapeHtml(c.posizione_label || 'centro') + '</span>' +
            '</div>' +
        '</div>';
    });

    grid.innerHTML = html;

    // Singolo rAF (innerHTML + offsetHeight forza il layout sincrono)
    requestAnimationFrame(function () {
        grid.querySelectorAll('.vt-config-card').forEach(function (card) {
            var idx = parseInt(card.dataset.configIdx);
            var canvas = card.querySelector('canvas');
            if (canvas && idx >= 0) {
                _vtRenderConfigCanvas(canvas, idx);
            }
        });

        // Click handler sul canvas-wrap (canvas ha pointer-events:none)
        grid.querySelectorAll('.vt-config-canvas-wrap').forEach(function (wrap) {
            var card = wrap.closest('.vt-config-card');
            var idx = parseInt(card ? card.dataset.configIdx : '-1');
            if (idx >= 0) {
                wrap.addEventListener('click', function (e) {
                    e.stopPropagation();
                    _vtSelezionaConfigurazione(idx);
                });
            }
        });
    });

    _vtAggiornaValidazione();
}

function _vtSelezionaConfigurazione(index) {
    var config = _vtState.configurazioni[index];
    if (!config) return;

    // Toggle
    config.valida = !config.valida;

    // Ri-renderizza tutte le card (cambia stato selected/shaded)
    var grid = document.getElementById('vt-config-grid');
    if (!grid) return;

    var cards = grid.querySelectorAll('.vt-config-card');
    var anySelected = _vtQualcunaSelezionata();

    cards.forEach(function (card) {
        var idx = parseInt(card.dataset.configIdx);
        var c = _vtState.configurazioni[idx];
        if (!c) return;

        var isSelected = c.valida;
        var isShaded = anySelected && !isSelected;

        // Aggiorna classi CSS
        card.classList.remove('selected', 'shaded');
        if (isSelected && anySelected) card.classList.add('selected');
        if (isShaded) card.classList.add('shaded');

        // Aggiorna badge
        var badge = card.querySelector('.vt-config-badge');
        if (badge) {
            badge.className = 'vt-config-badge ' + (c.valida ? 'valid' : 'invalid');
            badge.textContent = c.valida ? 'valida' : 'esclusa';
        }

        // Ri-renderizza canvas (riusa renderer esistente, non ricrea il contesto WebGL)
        var canvas = card.querySelector('canvas');
        if (canvas) {
            _vtRenderConfigCanvas(canvas, idx);
        }
    });

    // Aggiorna hint
    var hint = document.getElementById('vt-selection-hint');
    if (hint) {
        if (_vtNessunaSelezionata()) {
            hint.textContent = '\u2014 Tutte valide';
            hint.style.color = '#16a34a';
        } else {
            var cnt = _vtState.configurazioni.filter(function (c) { return c.valida; }).length;
            hint.textContent = '\u2014 ' + cnt + ' di ' + _vtState.configurazioni.length + ' valide';
            hint.style.color = '#2563eb';
        }
    }

    _vtAggiornaValidazione();
}

