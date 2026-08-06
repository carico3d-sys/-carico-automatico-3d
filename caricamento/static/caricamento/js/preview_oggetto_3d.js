/**
 * preview_oggetto_3d.js — Anteprima 3D interattiva per l'oggetto selezionato
 * 
 * Dipende da: Three.js (THREE), OrbitControls
 * 
 * Espone:
 *   PreviewOggetto3D.init(containerId)
 *   PreviewOggetto3D.aggiorna(oggetto, vincoli)
 *   PreviewOggetto3D.setRotazione(axis, deg)
 *   PreviewOggetto3D.setTraslazione(axis, mm)
 *   PreviewOggetto3D.ruota90(axis, direction)   // +1 o -1 → +/-90°
 *   PreviewOggetto3D.resetVista()
 *   PreviewOggetto3D.resettaOggetto()
 *   PreviewOggetto3D.distruggi()
 *   PreviewOggetto3D.getStatoAssi()  // { x: enabled, y: enabled, z: enabled }
 */

var PreviewOggetto3D = (function () {
    'use strict';

    // --- Stato interno ---
    var _scene, _camera, _renderer, _controls;
    var _mesh, _edges, _container, _axesGroup;
    var _axisLines = { x: null, y: null, z: null };
    var _axisLabels = { x: null, y: null, z: null };
    var _rot = { x: 0, y: 0, z: 0 };
    var _trans = { x: 0, y: 0, z: 0 };
    var _animationId = null;
    var _isFragile = false;
    var _vincoli = {};
    var _oggettoAttuale = null;
    var _statoAssi = { x: true, y: true, z: true };

    // --- Stato drag-to-rotate ---
    var _isDragging = false;
    var _prevMouse = { x: 0, y: 0 };
    var _dragSensibilita = 0.3;  // gradi per pixel

    // --- Crea etichetta testo per asse (Sprite con CanvasTexture) ---
    function _creaLabel(text, color) {
        var canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        var ctx = canvas.getContext('2d');

        // Sfondo trasparente
        ctx.clearRect(0, 0, 128, 128);

        // Testo
        var hex = '#' + color.toString(16).padStart(6, '0');
        ctx.font = 'Bold 72px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Ombra leggera per leggibilità
        ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;

        ctx.fillStyle = hex;
        ctx.fillText(text, 64, 64);

        var texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;

        var spriteMat = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false,
            depthWrite: false,
        });
        var sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(240, 240, 1);
        return sprite;
    }

    // --- Utility colori ---
    function _hexColor(c) {
        return c ? parseInt(c.replace('#', ''), 16) : 0x447e9b;
    }

    // --- Inizializzazione scena ---
    function init(containerId) {
        distruggi();

        _container = document.getElementById(containerId);
        if (!_container) return false;

        var w = _container.clientWidth || 400;
        var h = _container.clientHeight || 300;

        // Scene
        _scene = new THREE.Scene();
        _scene.background = new THREE.Color(0xf0f2f5);

        // Camera
        _camera = new THREE.PerspectiveCamera(35, w / h, 1, 10000);
        _camera.position.set(2000, 1600, 2000);
        _camera.lookAt(0, 0, 0);

        // Renderer
        _renderer = new THREE.WebGLRenderer({ antialias: true });
        _renderer.setSize(w, h);
        _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        _renderer.shadowMap.enabled = true;
        _renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        _container.appendChild(_renderer.domElement);

        // OrbitControls — solo ZOOM e PAN, NO camera rotate
        // La rotazione oggetto avviene tramite drag diretto sul canvas
        _controls = new THREE.OrbitControls(_camera, _renderer.domElement);
        _controls.enableRotate = false;
        _controls.enableDamping = true;
        _controls.dampingFactor = 0.08;
        _controls.minDistance = 200;
        _controls.maxDistance = 6000;
        _controls.target.set(0, 400, 0);
        _controls.mouseButtons = {
            LEFT: null,           // disabilita drag sinistro (usato per rotazione oggetto)
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.PAN
        };
        _controls.update();

        // Luci
        var ambient = new THREE.AmbientLight(0xffffff, 0.5);
        _scene.add(ambient);

        var dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
        dirLight.position.set(1500, 2500, 1500);
        dirLight.castShadow = true;
        _scene.add(dirLight);

        var fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
        fillLight.position.set(-1000, 1000, -1000);
        _scene.add(fillLight);

        // Assi colorati con frecce — posizionati al centro dell'oggetto in aggiorna()
        _axesGroup = new THREE.Group();
        var AXIS_LEN = 1200;
        var SHAFT_R = 8;       // raggio asta (cilindro)
        var CONE_R = 18;       // raggio base cono
        var CONE_H = 50;       // altezza cono

        // Crea un asse completo: asta (cilindro) + punta (cono)
        var _makeAxis = function (dir, color) {
            var group = new THREE.Group();

            // Asta: cilindro lungo AXIS_LEN nella direzione dir
            var shaftMat = new THREE.MeshBasicMaterial({ color: color, depthTest: false, depthWrite: false });
            var shaftGeom = new THREE.CylinderGeometry(SHAFT_R, SHAFT_R, AXIS_LEN, 8);
            var shaft = new THREE.Mesh(shaftGeom, shaftMat);
            // Ruota il cilindro (default orientato su Y) nella direzione voluta
            var up = new THREE.Vector3(0, 1, 0);
            shaft.quaternion.setFromUnitVectors(up, dir.clone().normalize());
            shaft.position.copy(dir.clone().multiplyScalar(AXIS_LEN / 2));
            group.add(shaft);

            // Punta: cono alla fine dell'asta
            var coneMat = new THREE.MeshBasicMaterial({ color: color, depthTest: false, depthWrite: false });
            var coneGeom = new THREE.ConeGeometry(CONE_R, CONE_H, 12);
            var cone = new THREE.Mesh(coneGeom, coneMat);
            cone.quaternion.setFromUnitVectors(up, dir.clone().normalize());
            cone.position.copy(dir.clone().multiplyScalar(AXIS_LEN + CONE_H / 2));
            group.add(cone);

            return { group: group, matShaft: shaftMat, matCone: coneMat };
        };

        var dirX = new THREE.Vector3(1, 0, 0);
        var dirZ = new THREE.Vector3(0, 1, 0);  // app Z=altezza → Three.js Y (su)
        var dirY = new THREE.Vector3(0, 0, 1);  // app Y=larghezza → Three.js Z (avanti)

        var axX = _makeAxis(dirX, 0xff4444);  // X rosso → app X (lunghezza)
        var axZ = _makeAxis(dirZ, 0x4444ff);  // Z blu → app Z (altezza)
        var axY = _makeAxis(dirY, 0x44ff44);  // Y verde → app Y (larghezza)

        _axesGroup.add(axX.group);
        _axesGroup.add(axY.group);
        _axesGroup.add(axZ.group);
        _axisLines.x = axX;
        _axisLines.y = axY;
        _axisLines.z = axZ;

        // Etichette X, Y, Z oltre le punte dei coni
        var LABEL_OFFSET = AXIS_LEN + CONE_H + 40;
        var lblX = _creaLabel('X', 0xff4444);
        lblX.position.set(LABEL_OFFSET, 0, 0);
        _axesGroup.add(lblX);
        _axisLabels.x = lblX;

        var lblZ = _creaLabel('Z', 0x4444ff);
        lblZ.position.set(0, LABEL_OFFSET, 0);   // app Z=altezza → Three.js Y (su)
        _axesGroup.add(lblZ);
        _axisLabels.z = lblZ;

        var lblY = _creaLabel('Y', 0x44ff44);
        lblY.position.set(0, 0, LABEL_OFFSET);   // app Y=larghezza → Three.js Z (avanti)
        _axesGroup.add(lblY);
        _axisLabels.y = lblY;

        _scene.add(_axesGroup);

        // Griglia di riferimento (1200mm × 1200mm, celle da 120mm)
        var gridHelper = new THREE.GridHelper(1200, 10, 0xbbbbbb, 0xdddddd);
        gridHelper.position.y = 1;
        _scene.add(gridHelper);

        // Animation loop
        function animate() {
            _animationId = requestAnimationFrame(animate);
            if (_controls) _controls.update();
            if (_renderer && _scene && _camera) _renderer.render(_scene, _camera);
        }
        animate();

        // Eventi drag-to-rotate sul canvas
        var canvas = _renderer.domElement;
        canvas.style.cursor = 'grab';
        canvas.addEventListener('pointerdown', _onPointerDown);
        canvas.addEventListener('pointermove', _onPointerMove);
        canvas.addEventListener('pointerup', _onPointerUp);
        canvas.addEventListener('pointerleave', _onPointerUp);

        // Resize
        window.addEventListener('resize', _onResize);

        return true;
    }

    function _onResize() {
        if (!_container || !_camera || !_renderer) return;
        var w = _container.clientWidth;
        var h = _container.clientHeight;
        if (w === 0 || h === 0) return;
        _camera.aspect = w / h;
        _camera.updateProjectionMatrix();
        _renderer.setSize(w, h);
    }

    // --- Drag-to-rotate handlers ---
    function _onPointerDown(e) {
        if (!_mesh) return;
        // Se nessun asse è abilitato, non avviare il drag
        if (!_statoAssi.x && !_statoAssi.y && !_statoAssi.z) return;
        _isDragging = true;
        _prevMouse.x = e.clientX;
        _prevMouse.y = e.clientY;
        e.target.style.cursor = 'grabbing';
        e.target.setPointerCapture(e.pointerId);
    }

    function _onPointerMove(e) {
        if (!_isDragging || !_mesh) return;
        var dx = e.clientX - _prevMouse.x;
        var dy = e.clientY - _prevMouse.y;
        _prevMouse.x = e.clientX;
        _prevMouse.y = e.clientY;

        // Mappa movimento mouse a rotazione (app: X=lunghezza, Y=larghezza, Z=altezza):
        // - Verticale (dy) → X (Three.js X) — inclinazione
        // - Orizzontale (dx) → Y (Three.js Z) — giradischi
        // - Diagonale (dx+dy) → Z (Three.js Y) — rollio
        // - Shift + orizzontale (dx) → Z puro (senza Y) — rollio dedicato
        var shiftPressed = !!(e.shiftKey);
        if (_statoAssi.x) {
            _rot.x += dy * _dragSensibilita;
        }
        if (_statoAssi.y && !shiftPressed) {
            _rot.y += dx * _dragSensibilita;
        }
        if (_statoAssi.z) {
            if (shiftPressed) {
                // Shift premuto: Z puro da movimento orizzontale
                _rot.z += -dx * _dragSensibilita;
            } else {
                // Nessun modificatore: Z da movimento diagonale
                var diagMag = Math.min(Math.abs(dx), Math.abs(dy));
                if (diagMag > 0) {
                    _rot.z += -Math.sign(dx) * diagMag * _dragSensibilita;
                }
            }
        }

        // Applica rotazione al mesh e agli assi (ruotano insieme)
        _mesh.rotation.x = THREE.MathUtils.degToRad(_rot.x);
        _mesh.rotation.z = THREE.MathUtils.degToRad(_rot.y);
        _mesh.rotation.y = THREE.MathUtils.degToRad(_rot.z);

        if (_edges) {
            _edges.rotation.copy(_mesh.rotation);
        }
        if (_axesGroup) {
            _axesGroup.rotation.copy(_mesh.rotation);
        }

        // Aggiorna display angoli
        _aggiornaAngoliUI();
    }

    function _onPointerUp(e) {
        if (!_isDragging) return;
        _isDragging = false;
        e.target.style.cursor = 'grab';
    }

    function _aggiornaAngoliUI() {
        ['x', 'y', 'z'].forEach(function (axis) {
            var el = document.getElementById('pv3d-rot-' + axis + '-angle');
            if (el) el.textContent = Math.round(_rot[axis]) + '°';
        });
    }

    // --- Distruzione (pulisce tutte le risorse GPU) ---
    function distruggi() {
        if (_animationId) {
            cancelAnimationFrame(_animationId);
            _animationId = null;
        }
        if (_mesh && _scene) { _scene.remove(_mesh); _mesh.geometry.dispose(); _mesh.material.dispose(); }
        if (_edges && _scene) { _scene.remove(_edges); _edges.geometry.dispose(); _edges.material.dispose(); }
        if (_axesGroup && _scene) {
            _scene.remove(_axesGroup);
            // Dispose axis geometries and materials (gruppo con asta + cono)
            Object.keys(_axisLines).forEach(function (k) {
                var ref = _axisLines[k];
                if (ref) {
                    ref.group.traverse(function (child) {
                        if (child.geometry) child.geometry.dispose();
                        if (child.material) child.material.dispose();
                    });
                }
            });
            // Dispose label materials (sprites)
            Object.keys(_axisLabels).forEach(function (k) {
                var lbl = _axisLabels[k];
                if (lbl) { lbl.material.map && lbl.material.map.dispose(); lbl.material.dispose(); }
            });
        }
        if (_renderer) {
            _renderer.dispose();
            if (_renderer.domElement && _renderer.domElement.parentNode) {
                _renderer.domElement.parentNode.removeChild(_renderer.domElement);
            }
        }
        _scene = null;
        _camera = null;
        _renderer = null;
        _controls = null;
        _mesh = null;
        _edges = null;
        _axesGroup = null;
        _container = null;
        _oggettoAttuale = null;
        _axisLines = { x: null, y: null, z: null };
        _axisLabels = { x: null, y: null, z: null };
        _isDragging = false;
        window.removeEventListener('resize', _onResize);
    }

    // --- Aggiorna box con dimensioni/colore oggetto ---
    function aggiorna(oggetto, vincoli) {
        if (!oggetto || !_scene) return;
        _oggettoAttuale = oggetto;
        _vincoli = vincoli || {};
        _isFragile = !!(_vincoli.fragile);

        // Reset rot/trans
        _rot = { x: 0, y: 0, z: 0 };
        _trans = { x: 0, y: 0, z: 0 };

        // Rimuovi mesh vecchi
        if (_mesh) { _scene.remove(_mesh); _mesh.geometry.dispose(); _mesh.material.dispose(); _mesh = null; }
        if (_edges) {
            _scene.remove(_edges);
            _edges.geometry.dispose();
            _edges.material.dispose();
            _edges = null;
        }

        var L = oggetto.lunghezza_mm;   // app X
        var P = oggetto.larghezza_mm;   // app Y
        var H = oggetto.altezza_mm;     // app Z (vertical)
        var colore = _hexColor(oggetto.colore);
        var opacity = _isFragile ? 0.7 : 0.85;

        // BoxGeometry(width=X, height=Y, depth=Z) in Three.js.
        // Mappiamo: app X→Three.js X, app Z→Three.js Y (vertical), app Y→Three.js Z
        var geom = new THREE.BoxGeometry(L, H, P);
        var mat = new THREE.MeshStandardMaterial({
            color: colore,
            transparent: true,
            opacity: opacity,
            roughness: 0.4,
            metalness: 0.1,
        });
        _mesh = new THREE.Mesh(geom, mat);
        _mesh.position.set(0, H / 2, 0);  // Y = vertical in Three.js
        _mesh.castShadow = true;

        // Bordi — colore giallo/arancio se fragile, scuro altrimenti
        var edgeColor = _isFragile ? 0xffaa00 : 0x333333;
        var edgeGeom = new THREE.EdgesGeometry(geom);
        var edgeMat = new THREE.LineBasicMaterial({ color: edgeColor });
        _edges = new THREE.LineSegments(edgeGeom, edgeMat);
        _edges.position.copy(_mesh.position);

        _scene.add(_mesh);
        _scene.add(_edges);

        // Se fragile, aggiungi una leggera luminosità al materiale
        if (_isFragile) {
            mat.emissive = new THREE.Color(0xff6600);
            mat.emissiveIntensity = 0.08;
        }

        // Posiziona gli assi al centro dell'oggetto, che è anche il centro di rotazione.
        // La mesh è a (0, H/2, 0) con BoxGeometry centrata, quindi il centro geometrico è (0, H/2, 0).
        if (_axesGroup) {
            _axesGroup.position.set(0, H / 2, 0);
        }

        // Centra la camera
        _controls.target.set(0, H / 2, 0);
        _camera.position.set(L * 1.8 + 500, H * 1.5 + 400, P * 1.8 + 500);
        _controls.update();

        // Resetta slider UI
        _resettaSliderUI();

        // Applica vincoli e aggiorna colori assi
        _applicaVincoliUI();
        _aggiornaAssi();
    }

    function _resettaSliderUI() {
        ['x', 'y', 'z'].forEach(function (axis) {
            var rotAngle = document.getElementById('pv3d-rot-' + axis + '-angle');
            if (rotAngle) rotAngle.textContent = '0°';
            var transSlider = document.getElementById('pv3d-trans-' + axis);
            if (transSlider) transSlider.value = '0';
            var transVal = document.getElementById('pv3d-trans-' + axis + '-val');
            if (transVal) transVal.textContent = '0';
        });
    }

    function _statoRotAbilitata(axis) {
        // Determina se la rotazione sull'asse è abilitata dai vincoli
        if (_vincoli.rotazione_consentita === false) return false;
        if (axis === 'x' && _vincoli.rotazione_su_x === false) return false;
        if (axis === 'y' && _vincoli.rotazione_su_y === false) return false;
        if (axis === 'z' && _vincoli.rotazione_su_z === false) return false;
        return true;
    }

    function _applicaVincoliUI() {
        _statoAssi.x = _statoRotAbilitata('x');
        _statoAssi.y = _statoRotAbilitata('y');
        _statoAssi.z = _statoRotAbilitata('z');

        // Aggiorna i dot indicator nell'header
        ['x', 'y', 'z'].forEach(function (axis) {
            var dot = document.querySelector('.axis-dot[data-axis="' + axis + '"]');
            if (dot) dot.classList.toggle('disabled', !_statoAssi[axis]);
        });

        // Cambia il cursore: grab se almeno un asse è abilitato, not-allowed se nessuno
        if (_renderer) {
            var haAssi = _statoAssi.x || _statoAssi.y || _statoAssi.z;
            _renderer.domElement.style.cursor = haAssi ? 'grab' : 'not-allowed';
        }

        // Solo su pavimento → blocca traslazione Z (app Z = verticale = Three.js Y)
        var transZSlider = document.getElementById('pv3d-trans-z');
        if (transZSlider) transZSlider.disabled = !!_vincoli.solo_su_piano;

        // Aggiorna badge testo "Stato assi"
        _aggiornaBadgeRotazioni();
    }

    function _aggiornaBadgeRotazioni() {
        var badge = document.getElementById('pv3d-rot-badge');
        if (!badge) return;
        var attivi = [];
        if (_statoAssi.x) attivi.push('X');
        if (_statoAssi.y) attivi.push('Y');
        if (_statoAssi.z) attivi.push('Z');
        if (attivi.length === 3) {
            badge.textContent = '🔄 Tutti gli assi abilitati';
            badge.className = 'pv-3d-badge pv-3d-badge-ok';
        } else if (attivi.length > 0) {
            badge.textContent = '🔄 Rotazione su ' + attivi.join(', ') + ' attiva';
            badge.className = 'pv-3d-badge pv-3d-badge-warn';
        } else {
            badge.textContent = '🔒 Rotazioni bloccate (Non capovolgere)';
            badge.className = 'pv-3d-badge pv-3d-badge-lock';
        }
    }

    function _aggiornaAssi() {
        // Colora gli assi: più accesi se attivi, grigio se disabilitati
        var axes = ['x', 'y', 'z'];
        var coloriAttivo = { x: 0xff2222, y: 0x22ff22, z: 0x2222ff };
        var coloriDefault = { x: 0xff6666, y: 0x66ff66, z: 0x6666ff };
        var grigio = 0xbbbbbb;
        axes.forEach(function (a) {
            var colore = _statoAssi[a] ? coloriAttivo[a] : grigio;
            var ref = _axisLines[a];
            if (ref) {
                ref.matShaft.color.setHex(colore);
                ref.matShaft.needsUpdate = true;
                ref.matCone.color.setHex(colore);
                ref.matCone.needsUpdate = true;
            }
            // Aggiorna anche il colore dell'etichetta (rigenera la texture)
            var lbl = _axisLabels[a];
            if (lbl) {
                var coloreLabel = _statoAssi[a] ? coloriAttivo[a] : 0xbbbbbb;
                var nuova = _creaLabel(a.toUpperCase(), coloreLabel);
                // Sostituisci sprite — salva parent PRIMA di remove() perché
                // Three.js setta child.parent = null quando lo rimuovi dal gruppo
                var parent = lbl.parent;
                if (parent) {
                    var pos = lbl.position.clone();
                    parent.remove(lbl);
                    lbl.material.map && lbl.material.map.dispose();
                    lbl.material.dispose();
                    nuova.position.copy(pos);
                    parent.add(nuova);
                    _axisLabels[a] = nuova;
                }
            }
        });
    }

    // --- Rotazione ---
    // Mappa slider → Three.js: X→X, Y→Z, Z→Y (perché app: X=lunghezza, Y=larghezza, Z=altezza/vertical)
    function setRotazione(sliderAxis, deg) {
        if (!_mesh) return;
        deg = parseFloat(deg) || 0;
        _rot[sliderAxis] = deg;

        _mesh.rotation.x = THREE.MathUtils.degToRad(_rot.x);          // slider X → Three.js X
        _mesh.rotation.z = THREE.MathUtils.degToRad(_rot.y);          // slider Y → Three.js Z
        _mesh.rotation.y = THREE.MathUtils.degToRad(_rot.z);          // slider Z → Three.js Y (vertical)

        if (_edges) {
            _edges.rotation.x = _mesh.rotation.x;
            _edges.rotation.y = _mesh.rotation.y;
            _edges.rotation.z = _mesh.rotation.z;
        }
        if (_axesGroup) {
            _axesGroup.rotation.copy(_mesh.rotation);
        }

        // Aggiorna label dell'angolo
        var angleEl = document.getElementById('pv3d-rot-' + sliderAxis + '-angle');
        if (angleEl) angleEl.textContent = _rot[sliderAxis].toFixed(0) + '°';
    }

    // --- Rotazione tramite scatto (mantenuta per compatibilità, usata da resettaOggetto) ---

    function getStatoAssi() {
        return { x: !!_statoAssi.x, y: !!_statoAssi.y, z: !!_statoAssi.z };
    }

    // --- Traslazione ---
    // Mappa slider → Three.js: X→X, Y→Z, Z→Y
    function setTraslazione(sliderAxis, mm) {
        if (!_mesh) return;
        mm = parseFloat(mm) || 0;
        _trans[sliderAxis] = mm;

        var H = _oggettoAttuale ? _oggettoAttuale.altezza_mm : 0;
        _mesh.position.x = _trans.x;              // slider X (app X=lunghezza) → Three.js X
        _mesh.position.z = _trans.y;              // slider Y (app Y=larghezza) → Three.js Z
        _mesh.position.y = H / 2 + _trans.z;      // slider Z (app Z=altezza/vertical) → Three.js Y

        if (_edges) {
            _edges.position.copy(_mesh.position);
        }

        var valEl = document.getElementById('pv3d-trans-values');
        if (valEl) valEl.textContent = _trans.x.toFixed(0) + ' / ' + _trans.y.toFixed(0) + ' / ' + _trans.z.toFixed(0) + ' mm';
    }

    // --- Reset vista (camera) ---
    function resetVista() {
        if (!_camera || !_controls || !_oggettoAttuale) return;
        var o = _oggettoAttuale;
        var H = o.altezza_mm;
        var L = o.lunghezza_mm;
        var P = o.larghezza_mm;
        _controls.target.set(0, H / 2, 0);
        _camera.position.set(L * 1.8 + 500, H * 1.5 + 400, P * 1.8 + 500);
        _controls.update();
    }

    // --- Reset oggetto (rot/trans) ---
    function resettaOggetto() {
        if (!_oggettoAttuale) return;
        aggiorna(_oggettoAttuale, _vincoli);
    }

    return {
        init: init,
        aggiorna: aggiorna,
        setRotazione: setRotazione,
        setTraslazione: setTraslazione,
        getStatoAssi: getStatoAssi,
        resetVista: resetVista,
        resettaOggetto: resettaOggetto,
        distruggi: distruggi,
    };
})();
