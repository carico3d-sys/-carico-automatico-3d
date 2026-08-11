/**
 * Workspace Carico 3D — Vincoli Tra Oggetti: Canvas 3D
 *
 * Rendering Three.js indipendente per ogni card configurazione,
 * griglia interattiva con selezione/esclusione, cleanup WebGL.
 *
 * Depends on: workspace_vt_rotazioni.js (_vtState, _vtNessunaSelezionata, _vtQualcunaSelezionata)
 */

// =============================================================================
// CANVAS THREE.JS INDIPENDENTI
// =============================================================================

function _vtDistruggiCanvases() {
    _vtCanvases.forEach(function (entry) {
        if (entry.renderer) {
            entry.renderer.dispose();
            entry.renderer.forceContextLoss();
        }
        if (entry.scene) {
            entry.scene.traverse(function (child) {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(function (m) { m.dispose(); });
                    } else {
                        child.material.dispose();
                    }
                }
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
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(function (m) { m.dispose(); });
                } else {
                    child.material.dispose();
                }
            }
        }
    }

    var scene, renderer, camera;
    if (existing && existing.renderer && existing.camera) {
        scene = existing.scene;
        renderer = existing.renderer;
        camera = existing.camera;
        scene.background = new THREE.Color(isShaded ? 0xeceef1 : 0xf5f6f8);
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    } else {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(isShaded ? 0xeceef1 : 0xf5f6f8);

        camera = new THREE.PerspectiveCamera(35, w / h, 1, 5000);

        renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    }

    var dimsA = config.dimsA, dimsB = config.dimsB;
    // Converti cm
    var ax = dimsA[0] / 10, ay = dimsA[1] / 10, az = dimsA[2] / 10;
    var bx = dimsB[0] / 10, by = dimsB[1] / 10, bz = dimsB[2] / 10;

    // Usa offset scalari del config (v6)
    var offX = (config.offsetX || 0) / 10;
    var offZ = (config.offsetZ || 0) / 10;

    var gap = 3;
    var maxD = Math.max(ax + Math.abs(offX), ay + Math.abs(offZ), bx, by);
    var stackH = bz + gap + az;
    var dist = Math.max(maxD * 2.2, stackH * 1.8, 35);
    var midX = offX / 2;
    var midZ = offZ / 2;
    camera.position.set(dist * 0.5 + midX, dist * 0.45, dist * 0.65 + midZ);
    camera.lookAt(midX, stackH / 2, midZ);

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

    // Render statico
    renderer.render(scene, camera);

    // Salva/aggiorna per cleanup
    if (!existing) {
        _vtCanvases.push({ canvas: canvas, renderer: renderer, scene: scene, camera: camera });
    } else {
        existing.scene = scene;
        existing.renderer = renderer;
        existing.camera = camera;
    }
}

function _vtPopolaGrigliaConfigurazioni() {
    _vtDistruggiCanvases();

    var grid = document.getElementById('vt-config-grid');
    var hint = document.getElementById('vt-selection-hint');
    var count = document.getElementById('vt-config-count');

    if (!grid) return;

    var configs = _vtState.configurazioni;
    if (count) count.textContent = configs.length + ' config';

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

