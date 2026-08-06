/**
 * Visualizzatore 3D — Orchestratore
 *
 * Gestione viewport: aggiornaColore, animate, interazione mouse,
 * highlight, metriche, resetView, mostraContenitoreVuoto,
 * avviaVisualizzatore, aggiornaScenaVecchia, resetScene.
 *
 * Depends on: visualizzatore_3d_core.js, visualizzatore_3d_rendering.js
 */

// AGGIORNAMENTO COLORE OGGETTO IN SCENA 3D
// =============================================================================

function aggiornaColoreOggettoInScena(codice, nuovoColore) {
    if (!STATE.oggettiMesh || STATE.oggettiMesh.length === 0) return;
    if (!codice) return;

    var colore = new THREE.Color(nuovoColore || '#447e9b');

    STATE.oggettiMesh.forEach(function (group) {
        var data = group.userData;
        if (!data || data.codice !== codice) return;

        group.children.forEach(function (child) {
            if (child.type === 'Mesh' && child.material && child.material.color) {
                child.material.color.copy(colore);
            }
        });
        // Aggiorna anche il colore nei dati utente per il tooltip
        if (data) {
            data.colore = nuovoColore || '#447e9b';
        }
    });
}

// =========================================================================
// ANIMAZIONE
// =========================================================================

// Vettori riutilizzabili per calcoli camera-facing (evita allocazioni ogni frame)
const _camWorldVec = new THREE.Vector3();
const _camLocalVec = new THREE.Vector3();

function animate() {
    if (!STATE.animating) return;

    requestAnimationFrame(animate);

    // Damping per OrbitControls
    STATE.controls.update();

    // Posizione camera in world space (copia in vettore riutilizzabile)
    _camWorldVec.copy(STATE.camera.position);

    STATE.oggettiMesh.forEach((group, i) => {
        const mesh = group.children[0];
        if (!mesh || mesh.type !== 'Mesh') return;

        // --- Fluttuazione sottile (attorno a posizione relativa 0) ---
        mesh.position.y = Math.sin(Date.now() * 0.002 + i * 1.5) * 0.5;

        // --- Aggiornamento decal camera-facing ---
        const decalFaces = mesh.userData._decalFaces;
        if (!decalFaces) return;

        // Trasforma la posizione camera nello spazio locale del mesh
        mesh.worldToLocal(_camLocalVec.copy(_camWorldVec));

        // Mostra decal su TUTTE le facce rivolte verso la camera.
        // Una faccia è visibile se la sua normale (in spazio locale)
        // ha dot product > 0 con la direzione della camera.
        var lx = _camLocalVec.x;
        var ly = _camLocalVec.y;
        var lz = _camLocalVec.z;
        decalFaces[0].visible = (lz > 0) && STATE.mostraEtichetteOggetti;  // +Z
        decalFaces[1].visible = (lz < 0) && STATE.mostraEtichetteOggetti;  // -Z
        decalFaces[2].visible = (lx > 0) && STATE.mostraEtichetteOggetti;  // +X
        decalFaces[3].visible = (lx < 0) && STATE.mostraEtichetteOggetti;  // -X
        decalFaces[4].visible = (ly > 0) && STATE.mostraEtichetteOggetti;  // +Y
        decalFaces[5].visible = (ly < 0) && STATE.mostraEtichetteOggetti;  // -Y
    });

    STATE.renderer.render(STATE.scene, STATE.camera);

    // --- Aggiornamento decal camera-facing sul contenitore ---
    // Mostra SOLO 1 decal: quella sulla faccia più visibile (massimo dot product assoluto)
    if (STATE._containerDecalFaces && STATE._containerWalls) {
        STATE._containerWalls.worldToLocal(_camLocalVec.copy(_camWorldVec));
        var clx = _camLocalVec.x;
        var cly = _camLocalVec.y;
        var clz = _camLocalVec.z;
        var cdf = STATE._containerDecalFaces;
        // Calcola quanto ogni faccia è rivolta verso la camera (dot product assoluto)
        // +Z norm: (0,0,1), -Z norm: (0,0,-1), +X: (1,0,0), -X: (-1,0,0), +Y: (0,1,0), -Y: (0,-1,0)
        var dots = [
            clz,    // +Z
            -clz,   // -Z
            clx,    // +X
            -clx,   // -X
            cly,    // +Y
            -cly,   // -Y
        ];
        var bestIdx = 0;
        var bestDot = dots[0];
        for (var di = 1; di < 6; di++) {
            if (dots[di] > bestDot) {
                bestDot = dots[di];
                bestIdx = di;
            }
        }
        // Mostra solo la faccia col dot product massimo (rispettando toggle etichetta)
        for (var dj = 0; dj < 6; dj++) {
            cdf[dj].visible = (dj === bestIdx) && STATE.mostraEtichettaContenitore;
        }
    }

    // Aggiorna visibilità sprite etichetta dimensioni contenitore
    if (STATE._containerLabelSprite) {
        STATE._containerLabelSprite.visible = STATE.mostraEtichettaContenitore;
    }
}

// =============================================================================
// TOOLTIP / HOVER
// =============================================================================

function setupInteraction(container) {
    // Assicura che il tooltip esista sempre (anche dopo ricostruzioni scena)
    const tooltip = document.getElementById('tooltip-3d') || createTooltip();
    STATE.tooltip = tooltip;

    // Rimuovi listener precedenti per evitare accumulo su ricostruzioni scena
    // (innerHTML = '' rimuove i child ma NON gli event listener sul container div)
    if (container._hoverHandlers) {
        container.removeEventListener('mousemove', container._hoverHandlers.mousemove);
        container.removeEventListener('mouseleave', container._hoverHandlers.mouseleave);
    }

    const onMouseMove = (event) => {
        // Non processare hover durante un drag attivo (evita conflitti emissive)
        if (STATE.dragState && STATE.dragState.active) return;
        const rect = container.getBoundingClientRect();
        STATE.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        STATE.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        STATE.raycaster.setFromCamera(STATE.mouse, STATE.camera);

        // Raccogli tutti i mesh (non edges)
        const meshes = [];
        STATE.oggettiMesh.forEach(group => {
            group.children.forEach(child => {
                if (child.type === 'Mesh') {
                    meshes.push(child);
                }
            });
        });

        const intersects = STATE.raycaster.intersectObjects(meshes);

        if (intersects.length > 0) {
            const hit = intersects[0].object;
            const data = hit.userData;

            tooltip.style.display = 'block';
            tooltip.style.left = (event.clientX - rect.left + 15) + 'px';
            tooltip.style.top = (event.clientY - rect.top - 10) + 'px';

            const itemNumber = (data.index !== undefined ? data.index + 1 : '');
            tooltip.innerHTML = `
                <div class="tooltip-header" style="border-left: 4px solid ${data.colore};">
                    <strong>#${itemNumber} – ${data.codice}</strong>
                </div>
                <div class="tooltip-body">
                    <div class="tooltip-row">
                        <span class="tooltip-label">Dimensione:</span>
                        <span>${data.dimensione}</span>
                    </div>
                    <div class="tooltip-row">
                        <span class="tooltip-label">Posizione:</span>
                        <span>${data.posizione}</span>
                    </div>
                    <div class="tooltip-row">
                        <span class="tooltip-label">Peso:</span>
                        <span>${data.peso} kg</span>
                    </div>
                    ${data.pesoSopra > 0 ? `
                    <div class="tooltip-row">
                        <span class="tooltip-label">Peso sopra:</span>
                        <span>${data.pesoSopra} kg</span>
                    </div>` : ''}
                    <div class="tooltip-row">
                        <span class="tooltip-label">Rotazione:</span>
                        <span>${data.rotazione}</span>
                    </div>
                </div>
            `;

            // Evidenzia l'oggetto sotto il mouse
            resetHighlights();
            highlightObject(intersects[0].object);

            document.body.style.cursor = 'pointer';
        } else {
            tooltip.style.display = 'none';
            resetHighlights();
            document.body.style.cursor = 'default';
        }
    };

    const onMouseLeave = () => {
        // Non resettare highlight durante un drag attivo
        if (STATE.dragState && STATE.dragState.active) return;
        tooltip.style.display = 'none';
        resetHighlights();
    };

    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mouseleave', onMouseLeave);

    // Salva riferimenti per rimozione futura
    container._hoverHandlers = { mousemove: onMouseMove, mouseleave: onMouseLeave };
}

function createTooltip() {
    const tooltip = document.createElement('div');
    tooltip.id = 'tooltip-3d';
    tooltip.style.cssText = `
        position: absolute;
        display: none;
        background: #fff;
        border: 1px solid #ddd;
        border-radius: 8px;
        padding: 10px 14px;
        color: #333;
        font-family: 'Segoe UI', Arial, sans-serif;
        font-size: 13px;
        pointer-events: none;
        z-index: 1000;
        min-width: 200px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.08);
    `;
    document.getElementById('viewport-3d').appendChild(tooltip);
    return tooltip;
}

function highlightObject(mesh) {
    if (mesh.material && mesh.material.color) {
        const color = mesh.material.color.clone();
        mesh.userData._origColor = color;
        mesh.material.color.setHSL(
            (color.getHSL({}).h + 0.05) % 1,
            Math.min(color.getHSL({}).s * 1.3, 1),
            Math.min(color.getHSL({}).l * 1.4, 0.9)
        );
        mesh.material.emissive = new THREE.Color(0x4488ff);
        mesh.material.emissiveIntensity = 0.2;
    }
}

function resetHighlights() {
    STATE.oggettiMesh.forEach(group => {
        group.children.forEach(child => {
            if (child.type === 'Mesh' && child.material) {
                child.material.emissive = new THREE.Color(0x000000);
                child.material.emissiveIntensity = 0;
                if (child.userData._origColor) {
                    child.material.color.copy(child.userData._origColor);
                    delete child.userData._origColor;
                }
            }
        });
    });
}

// =============================================================================
// CARICAMENTO DATI
// =============================================================================

async function caricaDati(pianoId) {
    try {
        const response = await fetch(`/api/piani/${pianoId}/dati_3d/`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const dati = await response.json();
        STATE.dati = dati;
        STATE.pianoId = pianoId;
        return dati;
    } catch (error) {
        console.error('Errore caricamento dati:', error);
        mostraErrore(`Errore caricamento: ${error.message}`);
        throw error;
    }
}

function mostraErrore(messaggio) {
    const container = document.getElementById('viewport-3d');
    const overlay = document.createElement('div');
    overlay.className = 'error-overlay';
    overlay.innerHTML = `
        <div class="error-box">
            <span class="error-icon">⚠️</span>
            <h3>Errore</h3>
            <p>${messaggio}</p>
        </div>
    `;
    container.appendChild(overlay);
}

// =============================================================================
// AGGIORNAMENTO UI
// =============================================================================

function aggiornaMetriche(dati) {
    const m = dati.metriche;
    const c = dati.contenitore;

    // Null-safe: questi elementi potrebbero non esistere nel layout corrente
    const el = function (id) { return document.getElementById(id); };

    const metricaPeso = el('metrica-peso');
    const metricaSat = el('metrica-saturazione');
    const metricaOgg = el('metrica-oggetti');
    const metricaVol = el('metrica-volume');

    if (metricaPeso) metricaPeso.textContent = m.peso_totale_kg.toFixed(1) + ' kg';
    if (metricaSat) metricaSat.textContent = m.saturazione.toFixed(1) + '%';
    if (metricaOgg) metricaOgg.textContent = m.oggetti_posizionati;
    if (metricaVol) metricaVol.textContent =
        `${(c.dimensioni_cm.x / 100).toFixed(2)} × ${(c.dimensioni_cm.y / 100).toFixed(2)} × ${(c.dimensioni_cm.z / 100).toFixed(2)} m`;

    // Aggiorna barra saturazione
    const bar = el('barra-saturazione');
    if (bar) {
        bar.style.width = Math.min(m.saturazione, 100) + '%';
        bar.style.background = m.saturazione > 80
            ? 'linear-gradient(90deg, #2ecc71, #27ae60)'
            : m.saturazione > 50
                ? 'linear-gradient(90deg, #f39c12, #e67e22)'
                : 'linear-gradient(90deg, #e74c3c, #c0392b)';
    }

    // Nome piano e container
    const pianoNome = el('piano-nome');
    const containerNome = el('container-nome');
    if (pianoNome) pianoNome.textContent = dati.piano.nome;
    if (containerNome) containerNome.textContent = c.nome;
}

// =============================================================================
// RESIZE
// =============================================================================

function handleResize() {
    const container = document.getElementById('viewport-3d');
    const width = container.clientWidth;
    const height = container.clientHeight;
    STATE.camera.aspect = width / height;
    STATE.camera.updateProjectionMatrix();
    STATE.renderer.setSize(width, height);
}

// =============================================================================
// RESET VISTA
// =============================================================================

function resetView() {
    if (!STATE.dati) return;
    const c = STATE.dati.contenitore.dimensioni_cm;
    const dist = Math.max(c.x, c.z, c.y) * 1.8;
    // Centro del container in coordinate Three.js:
    // X = c.x/2 (lunghezza), Y = c.z/2 (altezza/2), Z = c.y/2 (larghezza/2)
    STATE.controls.target.set(c.x / 2, c.z / 2, c.y / 2);
    STATE.camera.position.set(
        c.x * 0.6,
        c.z * 0.8,
        Math.max(c.x, c.y, c.z) * 1.2
    );
    STATE.controls.update();
}

// =============================================================================
// FULLSCREEN
// =============================================================================

function toggleFullscreen() {
    const container = document.getElementById('viewport-3d');
    if (!document.fullscreenElement) {
        container.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
}

// =============================================================================
// MOSTRA CONTENITORE VUOTO (senza oggetti)
// =============================================================================

function mostraContenitoreVuoto(dimensioniCm, nomeMezzo) {
    const container = document.getElementById('viewport-3d');

    // Ferma animazione precedente
    STATE.animating = false;

    // Resetta flag modifiche manuali (scena ricostruita)
    if (typeof WS !== 'undefined') WS._manualDragOccurred = false;
    // Resetta contatore fallback posizionamento
    if (typeof _fallbackOffsetCounter !== 'undefined') _fallbackOffsetCounter = 0;
    // Resetta ghost placement se attivo        if (typeof _isGhostActive === 'function' && _isGhostActive()) { _annullaGhost(true); }
        // Forza ri-attach dei listener ghost sul nuovo canvas alla prossima setupDragInteraction
        STATE._ghostListenersAttached = false;

    // Pulisci canvas e contenuto esistente
    container.querySelectorAll('canvas').forEach(function (c) { c.remove(); });
    container.innerHTML = '';

    // Rimuovi tooltip se esiste
    var tooltip = document.getElementById('tooltip-3d');
    if (tooltip) tooltip.remove();

    // Resetta stato (mantieni scene/camera/renderer per initScene)
    STATE.scene = null;
    STATE.camera = null;
    STATE.renderer = null;
    STATE.controls = null;
    STATE.oggettiMesh = [];
    STATE.containerMesh = null;
    // Reset spaziatura a default
    if (typeof _applicaSpaziatura === 'function') _applicaSpaziatura(100);
    // Nascondi slider sequenza carico
    var sliderBar = document.getElementById('vp-slider-bar');
    if (sliderBar) sliderBar.style.display = 'none';
    STATE.dati = null;
    STATE.pianoId = null;
    STATE.tooltip = null;
    STATE._containerLabelSprite = null;

    // Inizializza scena
    const { scene, camera, renderer } = initScene('viewport-3d');
    initControls(camera, renderer);
    initLights(scene);
    initBackground(scene);

    // Container
    const containerObj = buildContainer(dimensioniCm, nomeMezzo);
    scene.add(containerObj);

    // Interazione
    setupInteraction(container);
    // Drag manuale
    setupDragInteraction(container);

    window.addEventListener('resize', handleResize);

    // Centra vista sul contenitore
    STATE.controls.target.set(
        dimensioniCm.x / 2,
        dimensioniCm.z / 2,
        dimensioniCm.y / 2
    );
    STATE.controls.update();

    // Avvia animazione
    STATE.animating = true;
    animate();

    // Aggiorna label toolbar e header
    var labelEl = document.getElementById('viewport-toolbar-label');
    if (labelEl) {
        labelEl.textContent = nomeMezzo || 'Contenitore vuoto';
        _setHeaderCaricoLabel(nomeMezzo || '');
    }

    // Disabilita pulsanti 3D (reset/fullscreen non servono per il contenitore vuoto)
    var btnReset = document.getElementById('btn-reset-view');
    var btnFullscreen = document.getElementById('btn-fullscreen');
    if (btnReset) btnReset.disabled = false;
    if (btnFullscreen) btnFullscreen.disabled = false;

    // Sincronizza visibilità etichette dalle impostazioni
    sincronizzaImpostazioniVisibilita();
}

// =============================================================================
// PUNTO DI INGRESSO PRINCIPALE
// =============================================================================

async function avviaVisualizzatore(pianoId) {
    const container = document.getElementById('viewport-3d');

    // Mostra loading
    container.innerHTML = `
        <div class="loading-overlay">
            <div class="loading-spinner"></div>
            <p>Caricamento dati 3D...</p>
        </div>
    `;

    try {
        // Carica dati
        const dati = await caricaDati(pianoId);

        if (!dati.oggetti || dati.oggetti.length === 0) {
            container.innerHTML = `
                <div class="error-overlay">
                    <div class="error-box">
                        <span class="error-icon">📦</span>
                        <h3>Nessun oggetto</h3>
                        <p>Questo piano di carico non ha oggetti posizionati.</p>
                        <p>Stato: <strong>${dati.piano.stato}</strong></p>
                    </div>
                </div>
            `;
            return;
        }

        // Pulisci e inizializza
        container.innerHTML = '';

        // Resetta flag modifiche manuali (scena ricostruita)
        if (typeof WS !== 'undefined') WS._manualDragOccurred = false;
        if (typeof _fallbackOffsetCounter !== 'undefined') _fallbackOffsetCounter = 0;
        if (typeof _isGhostActive === 'function' && _isGhostActive()) { _annullaGhost(true); }
        // Forza ri-attach dei listener ghost sul nuovo canvas
        STATE._ghostListenersAttached = false;

        // Inizializza scena
        const { scene, camera, renderer } = initScene('viewport-3d');
        initControls(camera, renderer);
        initLights(scene);
        initBackground(scene);

        // Container
        const containerObj = buildContainer(dati.contenitore.dimensioni_cm, dati.contenitore.nome);
        scene.add(containerObj);

        // Oggetti — azzera array prima di ricostruire (evita mesh fantasma)
        STATE.oggettiMesh = [];
        const oggettiGroup = buildOggetti(dati.oggetti);
        scene.add(oggettiGroup);

        // Applica spaziatura corrente (se l'utente l'aveva già modificata)
        if (STATE.spaziatura !== 100) _applicaSpaziatura(STATE.spaziatura);

        // Slider sequenza carico
        _aggiornaSliderCarico();

        // Interazione
        setupInteraction(container);
        // Drag manuale
        setupDragInteraction(container);

        // Resize
        window.addEventListener('resize', handleResize);

        // Centra vista sul contenitore (coordinate Three.js: Y=up → API.z)
        const c = dati.contenitore.dimensioni_cm;
        STATE.controls.target.set(c.x / 2, c.z / 2, c.y / 2);
        STATE.controls.update();

        // Avvia animazione
        STATE.animating = true;
        animate();

        // Aggiorna UI metriche (null-safe)
        aggiornaMetriche(dati);

        // Abilita pulsanti (null-safe: potrebbero non esistere nel layout a 3 colonne)
        const btnReset = document.getElementById('btn-reset-view');
        const btnFullscreen = document.getElementById('btn-fullscreen');
        if (btnReset) btnReset.disabled = false;
        if (btnFullscreen) btnFullscreen.disabled = false;

        // Sincronizza visibilità etichette dalle impostazioni
        sincronizzaImpostazioniVisibilita();

    } catch (error) {
        console.error('Errore avvio visualizzatore:', error);
        container.innerHTML = `
            <div class="error-overlay">
                <div class="error-box">
                    <span class="error-icon">❌</span>
                    <h3>Errore di caricamento</h3>
                    <p>${error.message}</p>
                </div>
            </div>
        `;
    }
}

/**
 * Renderizza una scena 3D a partire da un oggetto dati già in memoria.
 * Utile per mostrare soluzioni alternative senza dover interrogare il server.
 */
function renderizzaDati3D(dati) {
    const container = document.getElementById('viewport-3d');
    if (!dati || !dati.oggetti) {
        container.innerHTML = `
            <div class="error-overlay">
                <div class="error-box">
                    <span class="error-icon">📦</span>
                    <h3>Dati 3D non validi</h3>
                    <p>Non ci sono oggetti da visualizzare per questa soluzione.</p>
                </div>
            </div>
        `;
        return;
    }

    if (!dati.oggetti.length) {
        container.innerHTML = `
            <div class="error-overlay">
                <div class="error-box">
                    <span class="error-icon">📦</span>
                    <h3>Nessun oggetto</h3>
                    <p>Questa soluzione non ha oggetti posizionati.</p>
                </div>
            </div>
        `;
        return;
    }

    STATE.dati = dati;
    STATE.pianoId = dati.piano ? dati.piano.id : null;

    // Resetta flag modifiche manuali (scena ricostruita)
    if (typeof WS !== 'undefined') WS._manualDragOccurred = false;
    if (typeof _fallbackOffsetCounter !== 'undefined') _fallbackOffsetCounter = 0;
    if (typeof _isGhostActive === 'function' && _isGhostActive()) { _annullaGhost(true); }
    // Forza ri-attach dei listener ghost sul nuovo canvas
    STATE._ghostListenersAttached = false;

    // Pulisci e inizializza
    container.innerHTML = '';

    const { scene, camera, renderer } = initScene('viewport-3d');
    initControls(camera, renderer);
    initLights(scene);
    initBackground(scene);

    const containerObj = buildContainer(dati.contenitore.dimensioni_cm, dati.contenitore.nome);
    scene.add(containerObj);

    // Oggetti — azzera array prima di ricostruire (evita mesh fantasma)
    STATE.oggettiMesh = [];
    const oggettiGroup = buildOggetti(dati.oggetti);
    scene.add(oggettiGroup);

    // Applica spaziatura corrente (se l'utente l'aveva già modificata)
    if (STATE.spaziatura !== 100) _applicaSpaziatura(STATE.spaziatura);

    // Slider sequenza carico
    _aggiornaSliderCarico();

    setupInteraction(container);
    // Drag manuale
    setupDragInteraction(container);

    if (!STATE._resizeListenerAttached) {
        window.addEventListener('resize', handleResize);
        STATE._resizeListenerAttached = true;
    }

    const c = dati.contenitore.dimensioni_cm;
    STATE.controls.target.set(c.x / 2, c.z / 2, c.y / 2);
    STATE.controls.update();

    STATE.animating = true;
    animate();

    aggiornaMetriche(dati);

    const btnReset = document.getElementById('btn-reset-view');
    const btnFullscreen = document.getElementById('btn-fullscreen');
    if (btnReset) btnReset.disabled = false;
    if (btnFullscreen) btnFullscreen.disabled = false;

    // Sincronizza visibilità etichette dalle impostazioni
    sincronizzaImpostazioniVisibilita();
}

// =============================================================================
// TOGGLE ETICHETTE (chiamate dalle impostazioni output)
// =============================================================================

/**
 * Sincronizza i flag STATE con i valori delle impostazioni correnti.
 * Chiamata all'inizio di ogni inizializzazione scena per garantire
 * che le etichette rispettino le preferenze utente.
 */
function sincronizzaImpostazioniVisibilita() {
    if (typeof IMPOSTAZIONI !== 'undefined' && IMPOSTAZIONI.output_ottimizzazione) {
        STATE.mostraEtichetteOggetti = IMPOSTAZIONI.output_ottimizzazione.mostra_etichette_oggetti !== false;
        STATE.mostraEtichettaContenitore = IMPOSTAZIONI.output_ottimizzazione.mostra_etichetta_contenitore !== false;
    }
}

/**
 * Attiva/disattiva la visibilità delle etichette (codici) sugli oggetti.
 * Chiamata dalle impostazioni output quando l'utente cambia il toggle.
 */
function impostaVisibilitaEtichetteOggetti(visible) {
    STATE.mostraEtichetteOggetti = !!visible;
}

/**
 * Attiva/disattiva la visibilità dell'etichetta del contenitore
 * (nome decal + sprite dimensioni).
 * Chiamata dalle impostazioni output quando l'utente cambia il toggle.
 */
function impostaVisibilitaEtichettaContenitore(visible) {
    STATE.mostraEtichettaContenitore = !!visible;
}

// =============================================================================
// SLIDER SEQUENZA CARICO
// =============================================================================

var _sliderCaricoInizializzato = false;

function _initSliderCarico() {
    if (_sliderCaricoInizializzato) return;
    _sliderCaricoInizializzato = true;

    var slider = document.getElementById('vp-slider-carico');
    var countEl = document.getElementById('vp-slider-count');
    if (!slider) return;

    slider.addEventListener('input', function () {
        var n = parseInt(slider.value) || 0;
        var total = parseInt(slider.max) || 0;

        // Mostra/nascondi oggetti in sequenza
        STATE.oggettiMesh.forEach(function (group, i) {
            group.visible = i < n;
        });

        // Aggiorna contatore
        if (countEl) {
            if (n === 0) countEl.textContent = '0 / ' + total;
            else if (n >= total) countEl.textContent = 'Tutti';
            else countEl.textContent = n + ' / ' + total;
        }

        // Forza re-render (Three.js aggiorna solo se necessario)
        if (STATE.renderer) {
            STATE.renderer.render(STATE.scene, STATE.camera);
        }
    });

    // Auto-reset al rilascio: riporta a "Tutti" e rende visibili tutti gli oggetti
    slider.addEventListener('change', function () {
        var total = parseInt(slider.max) || 0;
        slider.value = total;
        STATE.oggettiMesh.forEach(function (group) {
            group.visible = true;
        });
        if (countEl) countEl.textContent = 'Tutti';
        if (STATE.renderer) {
            STATE.renderer.render(STATE.scene, STATE.camera);
        }
    });
}

// =============================================================================
// SPAZIATURA VISIVA TRA OGGETTI
// =============================================================================

/**
 * Scala tutte le mesh degli oggetti per creare gap visivi tra loro.
 * @param {number} percentuale - 100 = dimensione reale, 70-100 = rimpiccioliti
 */
function _applicaSpaziatura(percentuale) {
    percentuale = Math.max(30, Math.min(100, percentuale));
    STATE.spaziatura = percentuale;
    var s = percentuale / 100;

    STATE.oggettiMesh.forEach(function (group) {
        group.children.forEach(function (child) {
            // Scala mesh, edges e edges2 (tutti i figli diretti del gruppo)
            if (child.type === 'Mesh' || child.type === 'LineSegments') {
                child.scale.set(s, s, s);
            }
        });
    });

    // Aggiorna indicatore toolbar
    var indicator = document.getElementById('vp-spaziatura-val');
    if (indicator) {
        indicator.textContent = percentuale + '%';
        indicator.style.color = percentuale === 100 ? '#888' : '#f39c12';
    }

    // Sincronizza slider nella sidebar (se attivo)
    if (typeof SPZ !== 'undefined' && SPZ.sync) {
        SPZ.sync();
    }

    // Forza re-render
    if (STATE.renderer) {
        STATE.renderer.render(STATE.scene, STATE.camera);
    }
}

function _aggiornaSliderCarico() {
    _initSliderCarico();

    var sliderBar = document.getElementById('vp-slider-bar');
    var slider = document.getElementById('vp-slider-carico');
    var countEl = document.getElementById('vp-slider-count');
    if (!sliderBar || !slider) return;

    var n = STATE.oggettiMesh.length;

    if (n === 0) {
        sliderBar.style.display = 'none';
        return;
    }

    sliderBar.style.display = 'flex';
    slider.min = 0;
    slider.max = n;
    slider.value = n;
    slider.step = 1;

    if (countEl) countEl.textContent = 'Tutti';

    // Assicura che tutti gli oggetti siano visibili
    STATE.oggettiMesh.forEach(function (group) {
        group.visible = true;
    });
}
