/**
 * Workspace Carico 3D — Ottimizzazione & Distribuzione Pesi Module
 *
 * Camera controls, task status, distribuzione pesi,
 * elaborazione ottimizzazione 3D.
 *
 * Depends on: workspace_core.js, workspace_panel_destro.js
 */

// =============================================================================
// CAMERA CONTROLS (toolbar)
// =============================================================================

// Helper globale: esce dai 4 quadranti se attivi
function _esciDaMultiViewportSeAttivo() {
    if (typeof MVP !== 'undefined' && MVP.attivo) {
        disattivaMultiViewport();
        var gBtn = document.getElementById('vpf-btn-grid');
        if (gBtn) gBtn.classList.remove('active');
    }
}

function setupCameraControls() {
    // La palette flottante è l'unica toolbar Vista: i suoi comandi vengono
    // collegati in _initFloatingPalette(). Non esistono più listener duplicati
    // per la vecchia toolbar orizzontale.
    _initFloatingPalette();

}

// =============================================================================
// PALETTE FLOTTANTE VISTA (DRAGGABLE)
// =============================================================================

var _vpFloatPos = { left: null, top: null, width: null, height: null };

function _initFloatingPalette() {
    var palette = document.getElementById('vp-floating-palette');
    var header = document.getElementById('vp-palette-header');
    var closeBtn = document.getElementById('vp-palette-close');
    if (!palette || !header) return;

    // Ripristina posizione salvata
    try {
        var saved = localStorage.getItem('vp-palette-pos');
        if (saved) {
            var p = JSON.parse(saved);
            _vpFloatPos.left = p.left;
            _vpFloatPos.top = p.top;
            _vpFloatPos.width = p.width;
            _vpFloatPos.height = p.height;
        }
    } catch (e) { /* ignore */ }

    if (_vpFloatPos.left !== null) {
        palette.style.left = _vpFloatPos.left + 'px';
        palette.style.top = _vpFloatPos.top + 'px';
    }
    // width/height sono gestiti dal CSS (resize:both nativo), non da JS
    palette.style.width = '';
    palette.style.height = '';

    // Chiudi
    if (closeBtn) {
        closeBtn.addEventListener('click', function () {
            _chiudiFloatingPalette();
            // Aggiorna pallino Vista nell'header
            WS.vistaToolbarVisible = false;
        });
    }

    // Drag
    var dragging = false, startX, startY, origLeft, origTop;

    header.addEventListener('mousedown', function (e) {
        if (e.target === closeBtn) return;
        dragging = true;
        var rect = palette.getBoundingClientRect();
        startX = e.clientX;
        startY = e.clientY;
        // Se right era usato, converti a left
        if (palette.style.right) {
            palette.style.left = rect.left + 'px';
            palette.style.right = '';
        }
        origLeft = rect.left;
        origTop = rect.top;
        palette.style.transition = 'none';
        e.preventDefault();
    });

    // Resize è gestito dal CSS resize:both nativo — nessun JS necessario

    // Touch drag start (su header)
    header.addEventListener('touchstart', function (e) {
        if (e.target === closeBtn) return;
        if (e.touches.length !== 1) return;
        dragging = true;
        var rect = palette.getBoundingClientRect();
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        if (palette.style.right) {
            palette.style.left = rect.left + 'px';
            palette.style.right = '';
        }
        origLeft = rect.left;
        origTop = rect.top;
        palette.style.transition = 'none';
    }, { passive: false });

    // Unifica mousemove/touchmove per drag
    document.addEventListener('mousemove', function (e) {
        if (!dragging) return;
        var dx = e.clientX - startX;
        var dy = e.clientY - startY;
        var newLeft = Math.max(0, Math.min(window.innerWidth - palette.offsetWidth, origLeft + dx));
        var newTop = Math.max(0, Math.min(window.innerHeight - 60, origTop + dy));
        palette.style.left = newLeft + 'px';
        palette.style.top = newTop + 'px';
        palette.style.right = '';
    });

    document.addEventListener('touchmove', function (e) {
        if (!dragging) return;
        var dx = e.touches[0].clientX - startX;
        var dy = e.touches[0].clientY - startY;
        var newLeft = Math.max(0, Math.min(window.innerWidth - palette.offsetWidth, origLeft + dx));
        var newTop = Math.max(0, Math.min(window.innerHeight - 60, origTop + dy));
        palette.style.left = newLeft + 'px';
        palette.style.top = newTop + 'px';
        palette.style.right = '';
    }, { passive: false });

    document.addEventListener('mouseup', function () {
        if (!dragging) return;
        dragging = false;
        palette.style.transition = '';
        _salvaStatoPalette(palette);
    });

    document.addEventListener('touchend', function () {
        if (!dragging) return;
        dragging = false;
        palette.style.transition = '';
        _salvaStatoPalette(palette);
    });

    function _salvaStatoPalette(pal) {
        _vpFloatPos.left = parseInt(pal.style.left, 10);
        if (isNaN(_vpFloatPos.left)) _vpFloatPos.left = pal.getBoundingClientRect().left || 0;
        _vpFloatPos.top = parseInt(pal.style.top, 10);
        if (isNaN(_vpFloatPos.top)) _vpFloatPos.top = pal.getBoundingClientRect().top || 0;
        try {
            localStorage.setItem('vp-palette-pos', JSON.stringify(_vpFloatPos));
        } catch (e) { /* ignore */ }
    }

    // Collega i pulsanti della palette
    var bindings = [
        { id: 'vpf-btn-top', action: function () { _esciDaMultiViewportSeAttivo(); impostaVistaCamera('top'); } },
        { id: 'vpf-btn-front', action: function () { _esciDaMultiViewportSeAttivo(); impostaVistaCamera('front'); } },
        { id: 'vpf-btn-side', action: function () { _esciDaMultiViewportSeAttivo(); impostaVistaCamera('side'); } },
        { id: 'vpf-btn-grid', action: function () {
            if (typeof MVP !== 'undefined' && MVP.attivo) {
                disattivaMultiViewport();
                var gBtn2 = document.getElementById('vpf-btn-grid');
                if (gBtn2) gBtn2.classList.remove('active');
            } else if (typeof initMultiViewport === 'function') {
                initMultiViewport();
                var gBtn2 = document.getElementById('vpf-btn-grid');
                if (gBtn2) gBtn2.classList.add('active');
            }
        }},
        { id: 'vpf-btn-zoom-out', action: function () { cameraZoom(1); } },
        { id: 'vpf-btn-zoom-in', action: function () { cameraZoom(-1); } },
        { id: 'vpf-btn-reset', action: function () { _esciDaMultiViewportSeAttivo(); impostaVistaCamera('reset'); } },
        { id: 'vpf-btn-fullscreen', action: function () {
            var c = DOM.viewport3d;
            if (!document.fullscreenElement) {
                c.requestFullscreen().catch(function () {});
            } else {
                document.exitFullscreen();
            }
        }},
        { id: 'vpf-btn-help', action: function () {
            var popover = document.getElementById('vpf-help-popover');
            if (!popover) return;
            var isVisible = popover.style.display === 'block';
            if (isVisible) {
                popover.style.display = 'none';
            } else {
                // Mostra prima (per leggere dimensioni reali), poi posiziona
                popover.style.display = 'block';
                var palette = document.getElementById('vp-floating-palette');
                if (palette) {
                    var rect = palette.getBoundingClientRect();
                    var popH = popover.offsetHeight;
                    var popW = popover.offsetWidth;
                    // Sopra la palette, allineato a destra
                    var top = rect.top - popH - 6;
                    if (top < 4) top = rect.bottom + 6; // fallback: sotto
                    var left = rect.right - popW;
                    if (left < 4) left = 4;
                    popover.style.top = top + 'px';
                    popover.style.left = left + 'px';
                }
            }
            var hBtn = document.getElementById('vpf-btn-help');
            if (hBtn) hBtn.classList.toggle('active', !isVisible);
        }},
    ];

    bindings.forEach(function (b) {
        var el = document.getElementById(b.id);
        if (el) el.addEventListener('click', b.action);
    });

    // Chiudi popover help interno alla palette
    var helpCloseBtn = document.getElementById('vpf-help-close');
    if (helpCloseBtn) {
        helpCloseBtn.addEventListener('click', function () {
            var popover = document.getElementById('vpf-help-popover');
            if (popover) popover.style.display = 'none';
            var hBtn = document.getElementById('vpf-btn-help');
            if (hBtn) hBtn.classList.remove('active');
        });
    }

    // Pulsante spaziatura nella palette → toggle barra slider nella sidebar
    var spaziaturaBtn = document.getElementById('vpf-btn-spaziatura');
    if (spaziaturaBtn) {
        spaziaturaBtn.addEventListener('click', function () {
            if (typeof SPZ !== 'undefined' && SPZ.toggle) {
                SPZ.toggle();
            }
        });
    }

    // Inizializza barra slider spaziatura nella sidebar
    if (typeof SPZ !== 'undefined' && SPZ.init) {
        SPZ.init();
    }

    // Aggiorna label spaziatura quando cambia
    function _aggiornaLabelSpaziatura() {
        var btn = document.getElementById('vpf-btn-spaziatura');
        var val = document.getElementById('vp-spaziatura-val');
        if (btn && val) {
            btn.setAttribute('title', 'Spaziatura: ' + val.textContent + ' — Click per resettare');
        }
    }
    // Osserva cambiamenti alla label
    var spaziaturaVal = document.getElementById('vp-spaziatura-val');
    if (spaziaturaVal) {
        var observer = new MutationObserver(_aggiornaLabelSpaziatura);
        observer.observe(spaziaturaVal, { characterData: true, subtree: true });
        _aggiornaLabelSpaziatura();
    }
}

function _chiudiFloatingPalette() {
    var palette = document.getElementById('vp-floating-palette');
    if (palette) palette.classList.remove('visible');
}

function _apriFloatingPalette() {
    var palette = document.getElementById('vp-floating-palette');
    if (!palette) return;
    // Pulisci eventuali width/height/left/right inline → CSS prende il controllo
    palette.style.width = '';
    palette.style.height = '';
    if (_vpFloatPos.left === null) {
        // Default: lascia che il CSS gestisca right/top
        palette.style.left = '';
        palette.style.right = '';
        palette.style.top = '';
    }
    palette.classList.add('visible');
}

// =============================================================================
// ZOOM CAMERA (pulsanti +/- e tasti tastiera)
// =============================================================================

/**
 * Zoom in/out della camera 3D.
 * @param {number} direction - -1 = zoom in (avvicina), 1 = zoom out (allontana)
 */
function cameraZoom(direction) {
    if (!WS.treSceneLoaded) { console.log('[ZOOM] treSceneLoaded=false, abort'); return; }
    if (typeof STATE === 'undefined') { console.log('[ZOOM] STATE undefined, abort'); return; }
    if (!STATE.camera) { console.log('[ZOOM] STATE.camera null, abort'); return; }
    if (!STATE.controls) { console.log('[ZOOM] STATE.controls null, abort'); return; }
    // OrbitControls di Three.js r128: dollyIn/dollyOut sono disponibili
    if (typeof STATE.controls.dollyIn === 'function') {
        if (direction < 0) STATE.controls.dollyIn(1.18);
        else STATE.controls.dollyOut(1.18);
    } else {
        // Fallback manuale
        var cam = STATE.camera;
        var target = STATE.controls.target;
        var dir = new THREE.Vector3().subVectors(cam.position, target).normalize();
        var step = 80;
        cam.position.addScaledVector(dir, direction < 0 ? -step : step);
    }
    STATE.controls.update();
}

function mostraTaskStatus(state, label) {
    var dot = DOM.taskDot;
    dot.className = 'task-dot ' + state;
    DOM.taskStatusText.textContent = label || '';
}

// =============================================================================
// DISTRIBUZIONE PESI PER SEZIONE
// =============================================================================

// Cache dei dati di distribuzione per ricreare il grafico dopo averlo nascosto
var _ultimaDistribuzionePesi = null;
var _distribuzionePesiPianoId = null;
var _distribuzionePesiAperturaToken = 0;

/**
 * Inserisce punti a Y=0 nei vuoti tra le sezioni e all'inizio/fine del camion,
 * se l'utente ha attivato l'opzione corrispondente nelle impostazioni.
 * Serve a far scendere la linea del grafico a zero dove non c'è carico.
 */
function caricaChartJS() {
    return new Promise(function (resolve, reject) {
        if (typeof Chart !== 'undefined') {
            resolve();
            return;
        }
        var script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js';
        script.onload = resolve;
        script.onerror = function () { reject(new Error('Impossibile caricare Chart.js')); };
        document.head.appendChild(script);
    });
}

function inserisciPuntiZeroNelGrafico(punti, lunghezzaM) {
    if (!IMPOSTAZIONI.output_ottimizzazione.azzera_grafico_pesi_nei_vuoti || !punti || punti.length === 0) {
        return punti;
    }
    var epsilon = 0.001;
    var ordinati = punti.slice().sort(function (a, b) { return a.x - b.x; });
    var risultato = [];

    function puntoZero(x1, x2) {
        return { x: x1, y: 0, nome: 'Vuoto', inizio: x1, fine: x2 };
    }

    // Spazio vuoto all'inizio del camion
    if (ordinati[0].x > epsilon) {
        risultato.push(puntoZero(0, ordinati[0].x));
        risultato.push(puntoZero(ordinati[0].x, ordinati[0].x));
    }

    risultato.push(ordinati[0]);

    for (var i = 1; i < ordinati.length; i++) {
        var prev = ordinati[i - 1];
        var curr = ordinati[i];
        if (curr.x > prev.x + epsilon) {
            // Gap tra due punti: scendi a zero e risali
            risultato.push(puntoZero(prev.x, curr.x));
            risultato.push(puntoZero(curr.x, curr.x));
        }
        risultato.push(curr);
    }

    // Spazio vuoto alla fine del camion
    var ultimo = ordinati[ordinati.length - 1];
    if (lunghezzaM && ultimo.x < lunghezzaM - epsilon) {
        risultato.push(puntoZero(ultimo.x, lunghezzaM));
        risultato.push(puntoZero(lunghezzaM, lunghezzaM));
    }

    return risultato;
}

/**
 * Costruisce il profilo di peso lungo l'asse X a partire dagli oggetti posizionati.
 * Restituisce un array di punti {x, y} per Chart.js, dove la linea sale e scende
 * in corrispondenza di inizio e fine di ogni oggetto.
 */
function _costruisciProfiloPesoDaOggetti(oggetti) {
    if (!oggetti || oggetti.length === 0) return [];
    var events = {};
    var maxFine = 0;
    oggetti.forEach(function (o) {
        var inizio = parseFloat(o.posizione_x_mm) || 0;
        var fine = inizio + (parseFloat(o.dimensione_x_mm) || 0);
        var peso = parseFloat(o.peso_kg) || 0;
        if (fine <= inizio) return;
        events[inizio] = (events[inizio] || 0) + peso;
        events[fine] = (events[fine] || 0) - peso;
        if (fine > maxFine) maxFine = fine;
    });
    var puntiCritici = Object.keys(events).map(Number).sort(function (a, b) { return a - b; });
    if (puntiCritici.length === 0) return [];
    var chartData = [];
    var pesoCorrente = 0;
    puntiCritici.forEach(function (x) {
        chartData.push({ x: x / 1000, y: pesoCorrente });
        pesoCorrente += events[x];
        chartData.push({ x: x / 1000, y: pesoCorrente });
    });
    // Chiudi il profilo verso la fine del camion se necessario
    if (maxFine > 0) {
        chartData.push({ x: maxFine / 1000, y: 0 });
    }
    return chartData;
}

function renderizzaDistribuzionePesi(sezioni, oggetti) {
    var container = document.getElementById('sezioni-pesi-panel');
    var list = document.getElementById('sezioni-pesi-list');
    if (!container || !list) return;

    if ((!sezioni || sezioni.length === 0) && (!oggetti || oggetti.length === 0)) {
        container.style.display = 'none';
        ['vp-btn-chart', 'auto-btn-pesi', 'manuale-btn-pesi'].forEach(function (id) {
            var button = document.getElementById(id);
            if (button) button.classList.remove('active');
        });
        return;
    }

    // Ordina le sezioni per posizione X crescente per grafico e lista.
    // L'endpoint può omettere la lista quando restituisce solo gli oggetti.
    sezioni = Array.isArray(sezioni) ? sezioni : [];
    oggetti = Array.isArray(oggetti) ? oggetti : [];
    var sezioniOrdinate = sezioni.slice().sort(function (a, b) {
        return parseFloat(a.inizio_x_mm) - parseFloat(b.inizio_x_mm);
    });

    var html = '';
    sezioniOrdinate.forEach(function (s) {
        var carico = parseFloat(s.carico_attuale_kg) || 0;
        var limite = parseFloat(s.carico_massimo_kg) || 1;
        var percentualeReale = limite > 0 ? (carico / limite) * 100 : 0;
        var percentualeBarra = Math.min(percentualeReale, 100);
        var classe = 'sezione-bar-fill';
        if (percentualeReale > 100) classe += ' danger';
        else if (percentualeReale > 80) classe += ' warning';

        html += '<div class="sezione-item">' +
            '<div class="sezione-item-header">' +
                '<span class="sezione-item-name">' + escapeHtml(s.nome) + '</span>' +
                '<span class="sezione-item-values">' + carico.toFixed(1) + ' / ' + limite.toFixed(1) + ' kg (' + percentualeReale.toFixed(1) + '%)</span>' +
            '</div>' +
            '<div class="sezione-bar-bg"><div class="' + classe + '" style="width:' + percentualeBarra.toFixed(1) + '%"></div></div>' +
            '<div class="sezione-range">X: ' + s.inizio_x_mm + '–' + s.fine_x_mm + ' mm</div>' +
        '</div>';
    });

    // Salva i dati per ricreare il grafico dopo chiusura/riapertura
    _ultimaDistribuzionePesi = { sezioni: sezioniOrdinate, oggetti: oggetti };
    _distribuzionePesiPianoId = WS.activePianoId;

    list.innerHTML = html;
    container.style.display = 'block';
    ['vp-btn-chart', 'auto-btn-pesi', 'manuale-btn-pesi'].forEach(function (id) {
        var button = document.getElementById(id);
        if (button) button.classList.add('active');
    });

    // Grafico a linee: asse X = lunghezza camion, asse Y = peso
    var canvas = document.getElementById('sezioni-peso-chart');
    if (canvas && typeof Chart !== 'undefined') {
        if (window.distribuzionePesoChart) {
            window.distribuzionePesoChart.destroy();
        }

        // Dati su asse X numerico (metri) per scala proporzionale:
        // se ci sono gli oggetti posizionati, la linea blu diventa un profilo di peso
        // lungo l'asse X; altrimenti si mantiene il comportamento per sezioni.
        var chartDataAttuale = [];
        // Se l'utente ha scelto di azzerare il grafico nei vuoti e ci sono oggetti
        // posizionati, usa il profilo di peso dettagliato lungo l'asse X.
        // Altrimenti usa il profilo per sezioni (linea sopra i vuoti).
        var usaProfiloOggetti = (oggetti && oggetti.length > 0) && IMPOSTAZIONI.output_ottimizzazione.azzera_grafico_pesi_nei_vuoti;
        // Fallback al profilo oggetti se non ci sono sezioni.
        if (sezioniOrdinate.length === 0 && oggetti && oggetti.length > 0) {
            usaProfiloOggetti = true;
        }
        if (usaProfiloOggetti) {
            chartDataAttuale = _costruisciProfiloPesoDaOggetti(oggetti);
        } else {
            sezioniOrdinate.forEach(function (s) {
                var inizioM = parseFloat(s.inizio_x_mm) / 1000;
                var fineM = parseFloat(s.fine_x_mm) / 1000;
                var carico = parseFloat(s.carico_attuale_kg) || 0;
                chartDataAttuale.push({
                    x: inizioM,
                    y: carico,
                    nome: s.nome,
                    inizio: inizioM,
                    fine: fineM
                });
                chartDataAttuale.push({
                    x: fineM,
                    y: carico,
                    nome: s.nome,
                    inizio: inizioM,
                    fine: fineM
                });
            });
            // Applica opzione "azzera grafico pesi nei vuoti" solo al peso attuale
            var mezzoAttivo = WS.contenitori.find(function (c) { return c.id == WS.activeMezzoId; });
            var lunghezzaM = mezzoAttivo ? parseFloat(mezzoAttivo.lunghezza_mm) / 1000 : null;
            if (!lunghezzaM && sezioniOrdinate.length > 0) {
                lunghezzaM = parseFloat(sezioniOrdinate[sezioniOrdinate.length - 1].fine_x_mm) / 1000;
            }
            chartDataAttuale = inserisciPuntiZeroNelGrafico(chartDataAttuale, lunghezzaM);
        }

        // Linea rossa del limite per sezione
        var chartDataLimite = [];
        sezioniOrdinate.forEach(function (s) {
            var inizioM = parseFloat(s.inizio_x_mm) / 1000;
            var fineM = parseFloat(s.fine_x_mm) / 1000;
            var limite = parseFloat(s.carico_massimo_kg) || 0;
            chartDataLimite.push({ x: inizioM, y: limite, nome: s.nome, inizio: inizioM, fine: fineM });
            chartDataLimite.push({ x: fineM, y: limite, nome: s.nome, inizio: inizioM, fine: fineM });
        });

        window.distribuzionePesoChart = new Chart(canvas, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: 'Peso attuale (kg)',
                        data: chartDataAttuale,
                        borderColor: '#447e9b',
                        backgroundColor: 'rgba(68, 126, 155, 0.15)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0,
                        pointRadius: 0,
                        pointHoverRadius: 6
                    },
                    {
                        label: 'Limite (kg)',
                        data: chartDataLimite,
                        borderColor: '#dc3545',
                        borderDash: [6, 4],
                        borderWidth: 2,
                        fill: false,
                        tension: 0,
                        pointRadius: 0,
                        pointHoverRadius: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                parsing: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { boxWidth: 12, font: { size: 11 } }
                    },
                    tooltip: {
                        callbacks: {
                            title: function (ctx) {
                                if (!ctx || !ctx.length) return '';
                                var d = ctx[0].raw;
                                if (!d) return '';
                                if (d.nome) {
                                    return d.nome + ' (' + d.inizio.toFixed(1) + '–' + d.fine.toFixed(1) + ' m)';
                                }
                                return 'Posizione X: ' + d.x.toFixed(2) + ' m';
                            },
                            label: function (ctx) {
                                return ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(1) + ' kg';
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        title: { display: true, text: 'Lunghezza camion (m)' },
                        ticks: { font: { size: 10 } }
                    },
                    y: {
                        title: { display: true, text: 'Peso (kg)' },
                        beginAtZero: true,
                        ticks: { font: { size: 10 } }
                    }
                }
            }
        });
    }
}

function nascondiDistribuzionePesi() {
    // Invalida eventuali aperture/render asincroni ancora in corso.
    _distribuzionePesiAperturaToken += 1;
    var container = document.getElementById('sezioni-pesi-panel');
    if (container) container.style.display = 'none';
    ['vp-btn-chart', 'auto-btn-pesi', 'manuale-btn-pesi'].forEach(function (id) {
        var button = document.getElementById(id);
        if (button) button.classList.remove('active');
    });
    if (window.distribuzionePesoChart) {
        window.distribuzionePesoChart.destroy();
        window.distribuzionePesoChart = null;
    }
}

function invalidaDistribuzionePesi() {
    if (typeof WS !== 'undefined') WS._autoPreviewPosizioni = null;
    nascondiDistribuzionePesi();
    // Pulisce anche il contenuto della lista per evitare che rimangano dati visuali obsoleti
    var listEl = document.getElementById('sezioni-pesi-list');
    if (listEl) listEl.innerHTML = '';
    _ultimaDistribuzionePesi = null;
    _distribuzionePesiPianoId = null;
}

/**
 * Ridisegna il grafico distribuzione pesi se il pannello è attualmente visibile.
 * Utile quando cambiano opzioni di visualizzazione come "azzera grafico pesi nei vuoti".
 */
function _aggiornaGraficoPesiSeVisibile() {
    var panel = document.getElementById('sezioni-pesi-panel');
    if (!panel || panel.style.display !== 'block') return;
    _disegnaDistribuzionePesiLocale();
}

/**
 * Scarica dal server la distribuzione pesi del piano attivo e la disegna.
 * Restituisce true se i dati sono stati trovati e renderizzati.
 */
async function caricaEDisegnaDistribuzionePesi() {
    if (!WS.activePianoId) return false;
    if (typeof Chart === 'undefined') {
        await caricaChartJS();
    }
    try {
        var resp = await fetch('/api/piani/' + WS.activePianoId + '/distribuzione_pesi/');
        if (resp.ok) {
            var data = await resp.json();
            if ((data.distribuzione_pesi && data.distribuzione_pesi.length > 0) || (data.oggetti && data.oggetti.length > 0)) {
                await new Promise(function (resolve) {
                    requestAnimationFrame(resolve);
                });
                renderizzaDistribuzionePesi(data.distribuzione_pesi, data.oggetti);
                return true;
            }
        }
    } catch (e) {
        console.warn('Errore caricamento distribuzione pesi:', e);
    }
    return false;
}

// ===========================================================================
// CALCOLO LOCALE DISTRIBUZIONE PESI (da STATE.oggettiMesh)
// ===========================================================================

/**
 * Calcola la distribuzione pesi localmente dai dati della scena 3D.
 * Non chiama il server: usa STATE.oggettiMesh e le sezioni del contenitore attivo.
 * @returns {{sezioni: Array, oggetti: Array}|null}
 */
function _ricalcolaDistribuzionePesiLocale() {
    if (typeof STATE === 'undefined' || !STATE.oggettiMesh || STATE.oggettiMesh.length === 0) {
        return null;
    }

    // Recupera le sezioni dal contenitore attivo
    var mezzoId = WS.activeMezzoId;
    var mezzo = null;
    if (mezzoId) {
        mezzo = WS.contenitori.find(function (c) { return c.id == mezzoId; });
    }

    var sezioni = (mezzo && mezzo.sezioni) ? mezzo.sezioni : [];
    var sezioneCarico = {};
    if (sezioni.length > 0) {
        sezioni.forEach(function (s) {
            sezioneCarico[s.id] = 0;
        });
    }

    var oggetti = [];

    // Per ogni oggetto nella scena 3D, calcola posizione e dimensioni in mm API
    STATE.oggettiMesh.forEach(function (group) {
        var ud = group.userData;
        if (!ud || !ud.codice) return;

        var dimCm = ud._tjsDimCm;
        if (!dimCm) {
            // Fallback: calcola dalle geometrie
            var mesh = group.children[0];
            if (mesh && mesh.geometry && mesh.geometry.parameters) {
                var p = mesh.geometry.parameters;
                dimCm = { x: p.width || 0, y: p.height || 0, z: p.depth || 0 };
            } else {
                return;
            }
        }

        var peso = ud.peso || 0;
        if (peso <= 0) return;

        // Converti da Three.js a coordinate API:
        // API X (lunghezza) = TJS X - dimCm.x/2  (in cm → *10 per mm)
        var apiXCornerMm = (group.position.x - dimCm.x / 2) * 10;
        var apiXDimMm = dimCm.x * 10;
        var objInizioMm = apiXCornerMm;
        var objFineMm = apiXCornerMm + apiXDimMm;

        oggetti.push({
            codice: ud.codice,
            posizione_x_mm: objInizioMm,
            dimensione_x_mm: apiXDimMm,
            peso_kg: peso
        });

        // Distribuisci il peso proporzionalmente sulle sezioni che l'oggetto attraversa
        if (sezioni.length === 0) return;
        sezioni.forEach(function (s) {
            var sInizio = parseFloat(s.inizio_x_mm);
            var sFine = parseFloat(s.fine_x_mm);
            var overlapInizio = Math.max(objInizioMm, sInizio);
            var overlapFine = Math.min(objFineMm, sFine);
            if (overlapInizio < overlapFine) {
                var overlapLength = overlapFine - overlapInizio;
                var objLength = objFineMm - objInizioMm;
                if (objLength > 0) {
                    sezioneCarico[s.id] = (sezioneCarico[s.id] || 0) + peso * (overlapLength / objLength);
                }
            }
        });
    });

    // Costruisci array risultati sezioni
    var risultati = sezioni.map(function (s) {
        var carico = sezioneCarico[s.id] || 0;
        var limite = parseFloat(s.carico_massimo_kg) || 0;
        return {
            sezione_id: s.id,
            nome: s.nome,
            inizio_x_mm: s.inizio_x_mm,
            fine_x_mm: s.fine_x_mm,
            carico_massimo_kg: limite,
            carico_attuale_kg: Math.round(carico * 100) / 100,
            margine_kg: Math.round(Math.max(0, limite - carico) * 100) / 100
        };
    });

    return { sezioni: risultati, oggetti: oggetti };
}

/**
 * Calcola localmente e disegna il grafico distribuzione pesi.
 * Versione sincrona (senza fetch) da usare per aggiornamenti in tempo reale.
 */
function _disegnaDistribuzionePesiLocale() {
    if (typeof Chart === 'undefined') return false;
    var dati = _ricalcolaDistribuzionePesiLocale();
    if (!dati) return false;
    if ((!dati.sezioni || dati.sezioni.length === 0) &&
        (!dati.oggetti || dati.oggetti.length === 0)) {
        return false;
    }
    renderizzaDistribuzionePesi(dati.sezioni, dati.oggetti);
    return true;
}

/**
 * Apre e disegna la distribuzione pesi dopo un click.
 * Il frame successivo è necessario perché il canvas deve avere già
 * le dimensioni del pannello appena reso visibile. Se la scena locale
 * non contiene dati, usa la distribuzione persistita del piano.
 */
function _apriDistribuzionePesi() {
    var aperturaToken = ++_distribuzionePesiAperturaToken;

    function disegnaLocaleOPersistito() {
        if (_disegnaDistribuzionePesiLocale()) return Promise.resolve(true);
        if (!WS.activePianoId) return Promise.resolve(false);

        // Fallback server controllato da questo token: la funzione generale
        // caricaEDisegnaDistribuzionePesi potrebbe renderizzare dati obsoleti
        // mentre l'utente ha già chiuso il pannello.
        return fetch('/api/piani/' + WS.activePianoId + '/distribuzione_pesi/')
            .then(function (resp) {
                if (!resp.ok) return null;
                return resp.json();
            })
            .then(function (data) {
                if (aperturaToken !== _distribuzionePesiAperturaToken || !data) return false;
                var sezioni = Array.isArray(data.distribuzione_pesi) ? data.distribuzione_pesi : [];
                var oggetti = Array.isArray(data.oggetti) ? data.oggetti : [];
                if (sezioni.length === 0 && oggetti.length === 0) return false;
                renderizzaDistribuzionePesi(sezioni, oggetti);
                return true;
            });
    }

    function gestisciEsito(ok) {
        // Un'apertura precedente non deve sovrascrivere una chiusura o
        // un'apertura successiva avvenuta nel frattempo.
        if (aperturaToken !== _distribuzionePesiAperturaToken) return false;
        if (!ok) {
            nascondiDistribuzionePesi();
            showToast('Nessuna distribuzione pesi disponibile: esegui prima l\'ottimizzazione.', 'warning');
        }
        return ok;
    }

    function dopoLayout() {
        if (typeof Chart === 'undefined') {
            return caricaChartJS().then(disegnaLocaleOPersistito);
        }
        return disegnaLocaleOPersistito();
    }

    return new Promise(function (resolve) {
        requestAnimationFrame(function () {
            dopoLayout().then(function (ok) {
                resolve(gestisciEsito(ok));
            }).catch(function (err) {
                console.warn('Errore apertura distribuzione pesi:', err);
                resolve(gestisciEsito(false));
            });
        });
    });
}

/**
 * Aggiorna il grafico distribuzione pesi in tempo reale se il pannello è visibile.
 * Da chiamare dopo ogni modifica alla scena 3D (aggiunta/rimozione oggetti).
 */
function aggiornaGraficoPesiInTempoReale() {
    var panel = document.getElementById('sezioni-pesi-panel');
    if (!panel || (panel.style.display !== 'block')) return;
    _disegnaDistribuzionePesiLocale();
}

function _impostaAzioniAutoDisabilitate(disabilitate) {
    [DOM.ottimizzaBtn, DOM.btnSalvaAuto, DOM.btnElaboraAuto].forEach(function (btn) {
        if (btn) btn.disabled = disabilitate;
    });
}

function _costruisciDatiPreviewOttimizzazione(risultato, pianoId) {
    var mezzo = WS.contenitori.find(function (c) {
        return c.id == WS.activeMezzoId;
    }) || {};
    var posizione = risultato.posizioni_preview || [];
    var oggetti = posizione.map(function (item) {
        // L'ID anagrafico è la chiave stabile: il codice dell'istanza
        // interna può ancora essere CODICE-0 su server/workers non aggiornati.
        var oggetto = (WS.oggettiDisponibili || []).find(function (o) {
            return (item.oggetto_id && String(o.id) === String(item.oggetto_id)) ||
                String(o.codice) === String(item.codice);
        }) || {};
        return {
            id: item.oggetto_id || oggetto.id,
            oggetto_id: item.oggetto_id || oggetto.id,
            codice: oggetto.codice || item.codice,
            descrizione: oggetto.descrizione || item.codice,
            posizione_mm: item.posizione_mm,
            dimensioni_mm: item.dimensioni_mm,
            posizione_cm: {
                x: item.posizione_mm.x / 10,
                y: item.posizione_mm.y / 10,
                z: item.posizione_mm.z / 10,
            },
            dimensioni_cm: {
                x: item.dimensioni_mm.x / 10,
                y: item.dimensioni_mm.y / 10,
                z: item.dimensioni_mm.z / 10,
            },
            rotazione: item.rotazione || 'XYZ',
            colore: item.colore || oggetto.colore || '#447e9b',
            peso_kg: Number(item.peso_kg || oggetto.peso_kg || 0),
            peso_sopra_kg: Number(item.peso_sopra_kg || 0),
        };
    });
    var metriche = risultato.metriche || {};
    return {
        piano: {
            id: pianoId,
            nome: 'Anteprima ottimizzazione',
            stato: risultato.successo ? 'completato' : 'parziale',
        },
        contenitore: {
            nome: mezzo.nome || 'Mezzo selezionato',
            dimensioni_cm: {
                x: Number(mezzo.lunghezza_mm || 0) / 10,
                y: Number(mezzo.larghezza_mm || 0) / 10,
                z: Number(mezzo.altezza_mm || 0) / 10,
            },
        },
        oggetti: oggetti,
        metriche: {
            peso_totale_kg: Number(metriche.peso_totale_kg || 0),
            saturazione: Number(risultato.saturazione || 0),
            oggetti_posizionati: oggetti.length,
        },
    };
}

/**
 * Conserva una copia indipendente delle coordinate restituite da "Elabora".
 * La preview usa un piano tecnico temporaneo che viene eliminato nel finally;
 * per il successivo click su Salva non dobbiamo dipendere né da quel piano né
 * dal grafo Three.js, che può essere ricostruito nel frattempo.
 */
function _salvaSnapshotPreviewOttimizzazione(datiPreview) {
    if (typeof WS === 'undefined') return;
    WS._autoPreviewPosizioni = datiPreview && Array.isArray(datiPreview.oggetti)
        ? datiPreview.oggetti.map(function (oggetto) {
            return {
                oggetto_id: oggetto.oggetto_id || oggetto.id || null,
                codice: oggetto.codice,
                posizione_cm: {
                    x: Number(oggetto.posizione_cm && oggetto.posizione_cm.x),
                    y: Number(oggetto.posizione_cm && oggetto.posizione_cm.y),
                    z: Number(oggetto.posizione_cm && oggetto.posizione_cm.z),
                },
                dimensioni_cm: {
                    x: Number(oggetto.dimensioni_cm && oggetto.dimensioni_cm.x),
                    y: Number(oggetto.dimensioni_cm && oggetto.dimensioni_cm.y),
                    z: Number(oggetto.dimensioni_cm && oggetto.dimensioni_cm.z),
                },
                colore: oggetto.colore || '#447e9b',
                rotazione: oggetto.rotazione || 'XYZ',
            };
        })
        : null;
}

async function _rimuoviPianoPreview(pianoId) {
    if (!pianoId) return false;
    try {
        var response = await fetch('/api/piani/' + pianoId + '/', {
            method: 'DELETE',
            headers: { 'X-CSRFToken': getCSRFToken() },
        });
        if (!response.ok && response.status !== 204) {
            throw new Error('HTTP ' + response.status);
        }
        WS.piani = (WS.piani || []).filter(function (p) { return p.id != pianoId; });
        return true;
    } catch (error) {
        console.warn('Impossibile rimuovere il piano di preview:', error);
        showToast('⚠️ La preview è stata elaborata, ma il piano tecnico non è stato eliminato.', 'warning');
        return false;
    }
}

function _svuotaViewportPrimaDiElaborare() {
    // Elabora deve mostrare subito che la scena precedente è stata rimossa.
    // Il piano persistito non viene cancellato: si lavora su un piano tecnico
    // temporaneo e il risultato resta in WS._autoPreviewPosizioni fino a Salva.
    if (typeof mostraContenitoreVuoto !== 'function') return;

    var mezzo = WS.contenitori.find(function (c) {
        return c.id == WS.activeMezzoId;
    });
    var dimensioni = mezzo ? {
        x: Number(mezzo.lunghezza_mm || 0) / 10,
        y: Number(mezzo.larghezza_mm || 0) / 10,
        z: Number(mezzo.altezza_mm || 0) / 10,
    } : null;
    if (!dimensioni || !dimensioni.x || !dimensioni.y || !dimensioni.z) {
        var datiCorrenti = typeof STATE !== 'undefined' && STATE.dati ? STATE.dati : null;
        dimensioni = datiCorrenti && datiCorrenti.contenitore
            ? datiCorrenti.contenitore.dimensioni_cm
            : null;
    }
    if (dimensioni && dimensioni.x && dimensioni.y && dimensioni.z) {
        mostraContenitoreVuoto(dimensioni, 'Elaborazione in corso');
    }
}

/**
 * Attende il completamento di un'ottimizzazione asincrona (coda Django Q2)
 * effettuando polling sullo stato del piano.
 * @param {number} pianoId
 * @param {string} taskId
 * @returns {Promise<Object>} stato finale del piano
 */
async function _attendiOttimizzazioneAsync(pianoId, taskId) {
    var attesaMassimaMs = 300000; // 5 minuti (allineato al timeout del worker Q2)
    var intervalloMs = 2000;
    var inizio = Date.now();
    var statiFinali = ['completato', 'parziale', 'fallito', 'errore'];

    while (Date.now() - inizio < attesaMassimaMs) {
        await new Promise(function (resolve) { setTimeout(resolve, intervalloMs); });
        var resp = await fetch('/api/piani/' + pianoId + '/stato/', {
            headers: { 'Accept': 'application/json' }
        });
        if (!resp.ok) continue;
        var stato = await resp.json();
        if (statiFinali.indexOf(stato.stato) >= 0) {
            return stato;
        }
        setStatus('busy', 'Elaborazione in coda...');
        mostraTaskStatus('busy', 'Elaborazione in coda... (' + (stato.oggetti_posizionati || 0) + ' pezzi)');
    }

    // Timeout di attesa: restituisci l'ultimo stato disponibile.
    try {
        var ultimoResp = await fetch('/api/piani/' + pianoId + '/stato/', {
            headers: { 'Accept': 'application/json' }
        });
        if (ultimoResp.ok) return await ultimoResp.json();
    } catch (e) { /* ignora */ }
    return { stato: 'errore', messaggio_errore: 'Attesa ottimizzazione scaduta.' };
}

async function elaboraOttimizzazione(salvaRisultato) {
    if (WS.ottimizzazioneInCorso) return;
    // "Elabora" è sempre una preview; il salvataggio definitivo è esplicito
    // tramite Ottimizza e Salva oppure tramite il pulsante Salva.
    salvaRisultato = salvaRisultato === true;

    // Elabora è una nuova ottimizzazione, non un aggiornamento incrementale
    // della scena precedente. Svuota subito il viewport come fa il caricamento
    // di un piano, ma senza toccare il piano definitivo nel database.
    if (!salvaRisultato) {
        _svuotaViewportPrimaDiElaborare();
    }

    // Protezione: avvisa se ci sono modifiche manuali non salvate
    if (salvaRisultato && WS._manualDragOccurred && WS.activePianoId) {
        var conferma = confirm(
            '⚠️ Hai modifiche manuali NON salvate nella scena 3D.\n\n' +
            'L\'ottimizzazione automatica RICALCOLERA\' tutte le posizioni ' +
            'sovrascrivendo le tue modifiche manuali.\n\n' +
            'Vuoi salvare prima le modifiche manuali?\n\n' +
            '• OK    = salva le modifiche e poi ottimizza\n' +
            '• Annulla = torna indietro senza fare nulla'
        );
        if (conferma) {
            // Salva prima le modifiche manuali
            if (typeof salvaPianoDB === 'function') {
                await salvaPianoDB();
            }
            WS._manualDragOccurred = false;
        } else {
            return;
        }
    }

    var oggetti = raccogliOggettiDaPanel();
    if (oggetti.length === 0) {
        showToast('Aggiungi almeno un oggetto al carico.', 'warning');
        return;
    }
    if (!WS.activeMezzoId && !WS.activePianoId) {
        showToast('Seleziona un mezzo di trasporto.', 'warning');
        return;
    }

    WS.ottimizzazioneInCorso = true;
    _impostaAzioniAutoDisabilitate(true);
    setStatus('busy', 'Ottimizzazione...');
    mostraTaskStatus('busy', 'Elaborazione in corso...');
    // L'ottimizzazione sta per ricalcolare il carico: i dati precedenti non sono più validi
    invalidaDistribuzionePesi();

    // La preview usa sempre un piano tecnico separato: non deve modificare
    // il piano attivo né la sua lista di oggetti.
    var pianoAttivoOriginale = WS.activePianoId;
    var statoPianoOriginale = (typeof STATE !== 'undefined') ? STATE.pianoId : null;
    var pianoId = salvaRisultato ? WS.activePianoId : null;
    var pianoPreEsistente = !!pianoId;
    var pianoPreviewId = null;

    try {
        if (!pianoId) {
            var mezzoId = WS.activeMezzoId;
            var nomePiano = 'Carico ' + new Date().toLocaleDateString('it-IT') + ' ' +
                new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

            setStatus('busy', 'Creazione piano...');
            var createResp = await fetch('/api/piani/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
                body: JSON.stringify({ nome: nomePiano, contenitore: mezzoId }),
            });
            if (!createResp.ok) throw new Error('Errore creazione piano: ' + createResp.status);
            var pianoData = await createResp.json();
            pianoId = pianoData.id;
            if (salvaRisultato) {
                WS.activePianoId = pianoId;
            } else {
                pianoPreviewId = pianoId;
            }
            if (DOM.headerExportBtn) DOM.headerExportBtn.disabled = false;
            // Aggiungi alla cache locale
            var mezzo = WS.contenitori.find(function (c) { return c.id == mezzoId; });
            WS.piani.unshift({
                id: pianoId, nome: nomePiano, container: mezzo ? mezzo.nome : '',
                stato: 'bozza', stato_display: 'Bozza'
            });
            showToast('Piano "' + nomePiano + '" creato.', 'success');
        }

        // Se il piano era già esistente, svuota i vecchi oggetti prima di riaggiungerli
        if (pianoPreEsistente) {
            var delResp = await fetch('/api/piani/' + pianoId + '/oggetti_da_caricare/', {
                method: 'DELETE',
                headers: { 'X-CSRFToken': getCSRFToken() },
            });
            if (!delResp.ok) throw new Error('Errore pulizia oggetti precedenti: ' + delResp.status);
        }

        // 2. Aggiungi oggetti da caricare
        setStatus('busy', 'Registrazione oggetti...');
        for (var i = 0; i < oggetti.length; i++) {
            await fetch('/api/piani/' + pianoId + '/oggetti_da_caricare/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
                body: JSON.stringify({ oggetto_id: oggetti[i].oggetto_id, quantita: oggetti[i].quantita, priorita: oggetti[i].priorita || 0, note: '' }),
            });
        }

        // 3. Configurazione dell'ottimizzatore.
        // Entrambi i flussi (Elabora e Ottimizza e Salva) passano dalla coda
        // asincrona Django Q2: niente limite dei 20s del browser e niente
        // taglio per tempo nel motore. L'anteprima salva sul piano temporaneo
        // (poi eliminato): il piano reale non viene mai toccato.
        var payloadOttimizzazione = {
            asincrono: true,
            salva_risultato: true,
        };

        // Invia anche le impostazioni correnti dell'ottimizzatore
        if (typeof IMPOSTAZIONI !== 'undefined' && IMPOSTAZIONI) {
            payloadOttimizzazione.config = {
                strategia_ottimizzazione: {
                    algoritmo_base: 'Algoritmo 3D Semplificato',
                    ordinamento_casuale: IMPOSTAZIONI.strategia_ottimizzazione.ordinamento_casuale || false,
                    distribuzione_pesi_attiva: IMPOSTAZIONI.strategia_ottimizzazione.distribuzione_pesi_attiva !== false,
                    compattazione_aggressiva: IMPOSTAZIONI.strategia_ottimizzazione.compattazione_aggressiva || false,
                    backtracking_avanzato: IMPOSTAZIONI.strategia_ottimizzazione.backtracking_avanzato || false,
                },

            };
        }

        setStatus('busy', 'Elaborazione 3D...');
        mostraTaskStatus('busy', 'Calcolo posizionamento...');
        var ottimizzaResp = await fetch('/api/piani/' + pianoId + '/ottimizza/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
            body: JSON.stringify(payloadOttimizzazione),
        });
        if (!ottimizzaResp.ok) {
            var dettaglio = '';
            try {
                var errBody = await ottimizzaResp.json();
                dettaglio = ' — ' + JSON.stringify(errBody);
            } catch (_) {}
            throw new Error('Errore ottimizzazione: ' + ottimizzaResp.status + dettaglio);
        }
        var risultato = await ottimizzaResp.json();

        // Il workspace usa sempre la coda asincrona (risposta 202).
        if (!risultato.asincrono) {
            throw new Error('Il backend non ha accodato l\'elaborazione asincrona.');
        }

        // Attesa del completamento (polling sullo stato del piano: quello
        // reale per "Ottimizza e Salva", quello temporaneo per "Elabora").
        var statoFinale = await _attendiOttimizzazioneAsync(pianoId, risultato.task_id);
        var completato = statoFinale && statoFinale.stato === 'completato';

        // Aggiorna lo stato nella lista dei piani
        var pIdxAsync = WS.piani.findIndex(function (p) { return p.id == pianoId; });
        if (pIdxAsync >= 0) {
            WS.piani[pIdxAsync].stato = statoFinale.stato;
            WS.piani[pIdxAsync].stato_display = completato ? 'Completato' : 'Parziale';
        }

        if (!salvaRisultato) {
            // Anteprima: il risultato è stato salvato sul piano temporaneo.
            // Lo si usa per costruire lo snapshot immutabile della preview
            // (stesso flusso di sempre per il successivo "Salva").
            var dati3dResp = await fetch('/api/piani/' + pianoId + '/dati_3d/', {
                headers: { 'Accept': 'application/json' },
            });
            var dati3d = dati3dResp.ok ? await dati3dResp.json() : null;
            var oggettiDati = (dati3d && Array.isArray(dati3d.oggetti)) ? dati3d.oggetti : [];
            var risultatoPreview = {
                successo: completato,
                oggetti_posizionati: ((dati3d && dati3d.metriche && dati3d.metriche.oggetti_posizionati) || oggettiDati.length),
                saturazione: (dati3d && dati3d.metriche && dati3d.metriche.saturazione) || 0,
                messaggio: (statoFinale && statoFinale.messaggio_errore) || '',
                metriche: (dati3d && dati3d.metriche) || {},
                posizioni_preview: oggettiDati.map(function (o) {
                    return {
                        oggetto_id: o.oggetto_id || null,
                        codice: o.codice,
                        posizione_mm: o.posizione_mm,
                        dimensioni_mm: o.dimensioni_mm,
                        rotazione: o.rotazione || 'XYZ',
                        colore: o.colore,
                        peso_kg: o.peso_kg || 0,
                        peso_sopra_kg: o.peso_sopra_kg || 0,
                    };
                }),
            };
            var datiPreview = _costruisciDatiPreviewOttimizzazione(risultatoPreview, pianoId);
            _salvaSnapshotPreviewOttimizzazione(datiPreview);
            renderizzaDati3D(datiPreview);
            WS.treSceneLoaded = true;
            pianoPreviewId = pianoId;
            _setHeaderCaricoLabel('Anteprima ottimizzazione');
        } else {
            await caricaScena3D(pianoId);
            var nomePianoAsync = WS.piani.find(function (p) { return p.id == pianoId; });
            _setHeaderCaricoLabel(nomePianoAsync ? nomePianoAsync.nome : ('Piano #' + pianoId));
        }
        _refreshSidebarLineari();

        if (completato) {
            setStatus('success', 'Completato');
            mostraTaskStatus('done', 'Completata');
            showToast(salvaRisultato
                ? '✅ Ottimizzazione completata e salvata!'
                : '👁️ Preview elaborata! Clicca "Salva" per salvare il carico.', 'success');
        } else if (statoFinale && (statoFinale.stato === 'errore' || statoFinale.stato === 'fallito')) {
            setStatus('error', 'Errore');
            mostraTaskStatus('fail', 'Elaborazione non riuscita');
            showToast('❌ ' + ((statoFinale && statoFinale.messaggio_errore) || 'Elaborazione non riuscita.'), 'error');
        } else {
            setStatus('idle', 'Parziale');
            mostraTaskStatus('fail', 'Parziale');
            showToast('⚠️ Risultato parziale: i rimanenti oggetti non trovano spazio nel contenitore.', 'warning');
        }

        // Il grafico pesi NON si apre da solo dopo l'ottimizzazione: resta
        // chiuso e si apre solo premendo l'apposito bottone (che fa anche toggle).
        nascondiDistribuzionePesi();
        // Mostra le soluzioni alternative (es. Monte Carlo) se il backend le ha prodotte.
        if (statoFinale && Array.isArray(statoFinale.soluzioni_alternative) && statoFinale.soluzioni_alternative.length) {
            mostraSoluzioniAlternative(statoFinale.soluzioni_alternative);
        } else {
            nascondiSoluzioniAlternative();
        }

    } catch (error) {
        console.error('Errore ottimizzazione:', error);
        showToast('❌ Errore: ' + error.message, 'error');
        setStatus('error', 'Errore');
        mostraTaskStatus('fail', error.message);
    } finally {
        if (pianoPreviewId) {
            await _rimuoviPianoPreview(pianoPreviewId);
            WS.activePianoId = pianoAttivoOriginale || null;
            if (typeof STATE !== 'undefined') STATE.pianoId = statoPianoOriginale || null;
            if (DOM.headerExportBtn) DOM.headerExportBtn.disabled = !pianoAttivoOriginale;
        }
        WS.ottimizzazioneInCorso = false;
        _aggiornaStatoAzioniAuto();
    }
}

