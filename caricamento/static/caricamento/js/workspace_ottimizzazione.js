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

function setupCameraControls() {

    // Helper: esce dai 4 quadranti se attivi (usato da tutti i pulsanti vista)
    function _esciDaMultiViewportSeAttivo() {
        if (typeof MVP !== 'undefined' && MVP.attivo) {
            disattivaMultiViewport();
            var gBtn = document.getElementById('vp-btn-grid');
            if (gBtn) gBtn.classList.remove('active');
        }
    }

    document.getElementById('vp-btn-top').addEventListener('click', function () {
        _esciDaMultiViewportSeAttivo();
        impostaVistaCamera('top');
    });
    document.getElementById('vp-btn-front').addEventListener('click', function () {
        _esciDaMultiViewportSeAttivo();
        impostaVistaCamera('front');
    });
    document.getElementById('vp-btn-side').addEventListener('click', function () {
        _esciDaMultiViewportSeAttivo();
        impostaVistaCamera('side');
    });
    // Vista 2×2 (4 quadranti)
    var gridBtn = document.getElementById('vp-btn-grid');
    if (gridBtn) {
        gridBtn.addEventListener('click', function () {
            if (typeof MVP !== 'undefined' && MVP.attivo) {
                disattivaMultiViewport();
                gridBtn.classList.remove('active');
            } else if (typeof initMultiViewport === 'function') {
                initMultiViewport();
                gridBtn.classList.add('active');
            }
        });
    }
    document.getElementById('vp-btn-fit').addEventListener('click', function () {
        impostaVistaCamera('reset');
    });
    document.getElementById('vp-btn-reset').addEventListener('click', function () {
        _esciDaMultiViewportSeAttivo();
        impostaVistaCamera('reset');
    });
    document.getElementById('vp-btn-fullscreen').addEventListener('click', function () {
        var c = DOM.viewport3d;
        if (!document.fullscreenElement) {
            c.requestFullscreen().catch(function () {});
        } else {
            document.exitFullscreen();
        }
    });

    // Zoom buttons
    if (DOM.vpBtnZoomIn) {
        DOM.vpBtnZoomIn.addEventListener('click', function () { cameraZoom(-1); });
    }
    if (DOM.vpBtnZoomOut) {
        DOM.vpBtnZoomOut.addEventListener('click', function () { cameraZoom(1); });
    }

    // Help popover
    if (DOM.vpBtnHelp) {
        DOM.vpBtnHelp.addEventListener('click', function () {
            if (!DOM.vpHelpPopover) return;
            var isVisible = DOM.vpHelpPopover.style.display === 'block';
            DOM.vpHelpPopover.style.display = isVisible ? 'none' : 'block';
            this.classList.toggle('active', !isVisible);
        });
        // Close popover clicking the X
        var helpClose = document.getElementById('vp-help-close');
        if (helpClose) {
            helpClose.addEventListener('click', function () {
                DOM.vpHelpPopover.style.display = 'none';
                DOM.vpBtnHelp.classList.remove('active');
            });
        }
    }

    var chartBtn = document.getElementById('vp-btn-chart');
    if (chartBtn) {
    chartBtn.addEventListener('click', function () {
        var panel = document.getElementById('sezioni-pesi-panel');
        var list = document.getElementById('sezioni-pesi-list');
        var btn = this;
        if (!panel) return;
        if (panel.style.display === 'none' || panel.style.display === '') {
            // Mostra il pannello SUBITO per dare al browser il tempo di calcolare il layout
            panel.style.display = 'block';
            btn.classList.add('active');

            // Calcola SEMPRE localmente da STATE.oggettiMesh (tempo reale, nessuna chiamata server)
            if (typeof Chart === 'undefined') {
                caricaChartJS().then(function () {
                    _disegnaDistribuzionePesiLocale();
                });
            } else {
                _disegnaDistribuzionePesiLocale();
            }
        } else {
            if (typeof nascondiDistribuzionePesi === 'function') {
                nascondiDistribuzionePesi();
            } else {
                panel.style.display = 'none';
            }
            btn.classList.remove('active');
        }
    });
    }
}

// =============================================================================
// OTTIMIZZAZIONE
// =============================================================================

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
        var chartBtn = document.getElementById('vp-btn-chart');
        if (chartBtn) chartBtn.classList.remove('active');
        return;
    }

    // Ordina le sezioni per posizione X crescente per grafico e lista
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
    var chartBtn = document.getElementById('vp-btn-chart');
    if (chartBtn) chartBtn.classList.add('active');

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
    var container = document.getElementById('sezioni-pesi-panel');
    if (container) container.style.display = 'none';
    var btn = document.getElementById('vp-btn-chart');
    if (btn) btn.classList.remove('active');
    if (window.distribuzionePesoChart) {
        window.distribuzionePesoChart.destroy();
        window.distribuzionePesoChart = null;
    }
}

function invalidaDistribuzionePesi() {
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
    if (typeof Chart === 'undefined') return;
    var dati = _ricalcolaDistribuzionePesiLocale();
    if (!dati) return;
    renderizzaDistribuzionePesi(dati.sezioni, dati.oggetti);
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

async function elaboraOttimizzazione() {
    if (WS.ottimizzazioneInCorso) return;

    // Protezione: avvisa se ci sono modifiche manuali non salvate
    if (WS._manualDragOccurred && WS.activePianoId) {
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
    DOM.ottimizzaBtn.disabled = true;
    setStatus('busy', 'Ottimizzazione...');
    mostraTaskStatus('busy', 'Elaborazione in corso...');
    // L'ottimizzazione sta per ricalcolare il carico: i dati precedenti non sono più validi
    invalidaDistribuzionePesi();

    var pianoId = WS.activePianoId;
    var pianoPreEsistente = !!pianoId;

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
            WS.activePianoId = pianoId;
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

        // 3. Prepara la configurazione dell'ottimizzatore
        var payloadOttimizzazione = {
            asincrono: false,
        };

        // Invia anche le impostazioni correnti dell'ottimizzatore
        if (typeof IMPOSTAZIONI !== 'undefined' && IMPOSTAZIONI) {
            payloadOttimizzazione.config = {
                strategia_ottimizzazione: {
                    algoritmo_base: 'Algoritmo 3D Semplificato',
                    ordinamento_casuale: IMPOSTAZIONI.strategia_ottimizzazione.ordinamento_casuale || false,
                    distribuzione_pesi_attiva: IMPOSTAZIONI.strategia_ottimizzazione.distribuzione_pesi_attiva !== false,
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

        // Aggiorna stato piano in cache
        var pIdx = WS.piani.findIndex(function (p) { return p.id == pianoId; });
        if (pIdx >= 0) {
            WS.piani[pIdx].stato = risultato.successo ? 'completato' : 'parziale';
            WS.piani[pIdx].stato_display = risultato.successo ? 'Completato' : 'Parziale';
        }

        if (risultato.successo) {
            showToast('✅ Ottimizzazione completata! ' + (risultato.oggetti_posizionati || 0) + ' oggetti. Saturazione: ' + (risultato.saturazione || 0).toFixed(1) + '%', 'success');
            setStatus('success', 'Completato');
            mostraTaskStatus('done', 'Completata (' + risultato.oggetti_posizionati + ' pezzi)');
            var nomePiano = risultato.piano_nome || ('Piano #' + pianoId);
            if (DOM.viewportToolbarLabel) DOM.viewportToolbarLabel.textContent = nomePiano;
            _setHeaderCaricoLabel(nomePiano);
            await caricaScena3D(pianoId);
            // Aggiorna sidebar riepilogo con i nuovi mt lineari (dopo caricamento scena 3D)
            _refreshSidebarLineari();
            if (risultato.metriche && risultato.metriche.distribuzione_pesi) {
                await caricaEDisegnaDistribuzionePesi();
            } else {
                nascondiDistribuzionePesi();
            }
            if (risultato.soluzioni_alternative && risultato.soluzioni_alternative.length > 0) {
                mostraSoluzioniAlternative(risultato.soluzioni_alternative);
            } else {
                nascondiSoluzioniAlternative();
            }
        } else {
            showToast('⚠️ ' + (risultato.messaggio || 'Ottimizzazione parziale o fallita'), 'warning');
            setStatus('idle', 'Parziale');
            mostraTaskStatus('fail', risultato.messaggio || 'Fallita');
            if (risultato.oggetti_posizionati > 0) {
                await caricaScena3D(pianoId);
            }
        }
    } catch (error) {
        console.error('Errore ottimizzazione:', error);
        showToast('❌ Errore: ' + error.message, 'error');
        setStatus('error', 'Errore');
        mostraTaskStatus('fail', error.message);
    } finally {
        WS.ottimizzazioneInCorso = false;
        DOM.ottimizzaBtn.disabled = false;
    }
}

