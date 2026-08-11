/**
 * Workspace Carico 3D — Core Module (v4.0)
 *
 * State management (W, WS, DOM), cacheDom(), utility functions
 * (formatCm, escapeHtml, getCSRFToken, etc.), status/toast/modal helpers,
 * and sidebar navigation.
 *
 * Load order: 1st — defines globals used by all other workspace modules.
 */

// =============================================================================
// CONFIG & STATE
// =============================================================================

// Palette colori (deve corrispondere a COLORI_PACCHI in engine/common.py)
var COLORI_PACCHI = [
    "#E74C3C", "#3498DB", "#2ECC71", "#F39C12", "#9B59B6",
    "#1ABC9C", "#E67E22", "#2980B9", "#27AE60", "#D35400",
    "#C0392B", "#8E44AD", "#16A085", "#2C3E50", "#F1C40F",
    "#E91E63", "#00BCD4", "#FF5722", "#795548", "#607D8B",
];

/**
 * Restituisce il colore di un oggetto, replicando la logica del backend
 * _genera_colore_da_oggetto() in engine/common.py.
 */
function coloreOggetto(oggetto) {
    if (oggetto.colore && oggetto.colore.trim()) {
        return oggetto.colore.trim();
    }
    return COLORI_PACCHI[oggetto.id % COLORI_PACCHI.length];
}

const W = window.WORKSPACE_CONFIG || {};
const WS = {
    piani: W.pianiDisponibili || [],
    contenitori: W.contenitori || [],
    oggettiDisponibili: W.oggettiDisponibili || [],
    oggettiCatalog: W.oggettiCatalog || [],
    vincoli: W.vincoli || [],
    vincoliTra: W.vincoliTraOggetti || [],
    activePianoId: W.activePianoId || null,
    activeMezzoId: null,
    impostazioniSezione: null, // sezione attiva nelle impostazioni (utile solo UI)
    ottimizzazioneInCorso: false,
    treSceneLoaded: false,
    viewAttiva: 'carico',
    manualMode: false,
    _manualDragOccurred: false,  // flag: modifiche manuali non salvate
    headerCategory: 'documenti',  // categoria attiva nell'header
    vistaToolbarVisible: false,   // toggle palette flottante (toolbar orizzontale sostituita)
};

// =============================================================================
// DOM REFS
// =============================================================================
const DOM = {};

function cacheDom() {
    // Sidebar
    DOM.sidebarTabs = document.querySelectorAll('.sidebar-tab');
    DOM.sidebarTabPanels = document.querySelectorAll('.sidebar-tab-panel');
    DOM.sidebarNavDynamic = document.getElementById('sidebar-nav-dynamic');
    DOM.headerCatBtns = document.querySelectorAll('.header-cat-btn');
    DOM.vpHelpPopover = document.getElementById('vp-help-popover');
    DOM.vpBtnZoomIn = document.getElementById('vp-btn-zoom-in');
    DOM.vpBtnZoomOut = document.getElementById('vp-btn-zoom-out');
    DOM.vpBtnHelp = document.getElementById('vp-btn-help');
    DOM.sidebarStatusDot = document.getElementById('sidebar-status-dot');
    DOM.sidebarStatusLabel = document.getElementById('sidebar-status-label');

    // Sidebar riepilogo
    DOM.sidebarStatPezzi = document.getElementById('sidebar-stat-pezzi');
    DOM.sidebarStatPeso = document.getElementById('sidebar-stat-peso');
    DOM.sidebarStatRighe = document.getElementById('sidebar-stat-righe');
    DOM.sidebarStatLineari = document.getElementById('sidebar-stat-lineari');
    DOM.sidebarMezzoNome = document.getElementById('sidebar-mezzo-nome');

    // Header
    DOM.headerVehicleSelect = document.getElementById('header-vehicle-select');
    DOM.headerExportBtn = document.getElementById('header-export-btn');
    DOM.ottimizzaBtn = document.getElementById('btn-ottimizza');
    DOM.btnSalvaAuto = document.getElementById('btn-salva-auto');
    DOM.btnElaboraAuto = document.getElementById('btn-elabora-auto');
    DOM.btnSalvaDB = document.getElementById('btn-salva-db');
    DOM.btnExportFile = document.getElementById('btn-export-file');
    DOM.btnImportFile = document.getElementById('btn-import-file');

    // Panel destro
    DOM.panelSelectOggetto = document.getElementById('panel-select-oggetto');
    DOM.btnPanelAdd = document.getElementById('btn-panel-add');
    DOM.panelItemsList = document.getElementById('panel-items-list');
    DOM.panelEmpty = document.getElementById('panel-empty');
    DOM.btnSvuotaCarico = document.getElementById('btn-svuota-carico');
    DOM.btnCaricaPiano = document.getElementById('btn-carica-piano');
    DOM.btnNuovoCarico = document.getElementById('btn-nuovo-carico');

    // Task status
    DOM.taskStatusText = document.getElementById('task-status-text');
    DOM.taskDot = document.querySelector('#task-status .task-dot');

    // Viewport
    DOM.viewport3d = document.getElementById('viewport-3d');
    DOM.viewportPlaceholder = document.getElementById('viewport-placeholder');
    DOM.viewportToolbarLabel = document.getElementById('viewport-toolbar-label');
    DOM.viewportToolbar = document.getElementById('viewport-toolbar');
    DOM.headerCaricoLabel = document.getElementById('header-carico-label');
    DOM.panelView = document.getElementById('panel-view');
    DOM.pvListTitle = document.getElementById('pv-list-title');
    DOM.pvListCount = document.getElementById('pv-list-count');
    DOM.pvListBody = document.getElementById('pv-list-body');
    DOM.pvFormTitle = document.getElementById('pv-form-title');
    DOM.pvFormBody = document.getElementById('pv-form-body');
    DOM.pvBtnBack = document.getElementById('pv-btn-back');

    // Modal
    DOM.modalOverlay = document.getElementById('modal-overlay');
    DOM.modalTitle = document.getElementById('modal-title');
    DOM.modalBody = document.getElementById('modal-body');
    DOM.modalClose = document.getElementById('modal-close');
    DOM.modalCancel = document.getElementById('modal-cancel');
    DOM.modalConfirm = document.getElementById('modal-confirm');

    // Toast
    DOM.toastContainer = document.getElementById('toast-container');

    // Template piani select
    DOM.templatePianiSelect = document.getElementById('template-piani-select');
}

// =============================================================================
// HELPER: cerca un oggetto per ID (prima pagina corrente, poi catalogo)
// =============================================================================

/**
 * Cerca un oggetto per ID in entrambi gli array disponibili.
 * Prima cerca in oggettiDisponibili (dati completi, pagina corrente),
 * poi in oggettiCatalog (dati leggeri, tutti gli oggetti).
 * @param {number} id - l'ID dell'oggetto da cercare
 * @returns {Object|undefined} l'oggetto trovato o undefined
 */
function trovaOggetto(id) {
    var found = WS.oggettiDisponibili.find(function (o) { return o.id == id; });
    if (found) return found;
    if (WS.oggettiCatalog) {
        found = WS.oggettiCatalog.find(function (o) { return o.id == id; });
    }
    return found;
}

/**
 * Cerca un oggetto per codice in entrambi gli array.
 * @param {string} codice
 * @returns {Object|undefined}
 */
function trovaOggettoPerCodice(codice) {
    var found = WS.oggettiDisponibili.find(function (o) { return o.codice === codice; });
    if (found) return found;
    if (WS.oggettiCatalog) {
        found = WS.oggettiCatalog.find(function (o) { return o.codice === codice; });
    }
    return found;
}

// =============================================================================
// UTILITY
// =============================================================================
function formatCm(mm) { return (mm / 10).toFixed(1); }
function pluralize(n, sing, plur) { return n === 1 ? sing : (plur || sing + 'i'); }
function escapeHtml(s) { if (!s) return ''; return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function getCSRFToken() {
    const m = document.cookie.match(new RegExp('(^| )csrftoken=([^;]+)'));
    return m ? m[2] : '';
}

// =============================================================================
// STATUS
// =============================================================================
function setStatus(state, label) {
    const colors = { idle: '#ccc', busy: '#f0ad4e', success: '#5cb85c', error: '#d9534f' };
    DOM.sidebarStatusDot.style.background = colors[state] || '#ccc';
    DOM.sidebarStatusLabel.textContent = label;
}

// =============================================================================
// TOAST
// =============================================================================
function showToast(message, type) {
    type = type || 'info';
    const icons = { success: '<i class="bi bi-check-circle"></i>', error: '<i class="bi bi-x-circle"></i>', info: '<i class="bi bi-info-circle"></i>', warning: '<i class="bi bi-exclamation-triangle"></i>' };
    const t = document.createElement('div');
    t.className = 'toast toast-' + type;
    t.innerHTML = '<span class="toast-icon">' + (icons[type] || 'ℹ️') + '</span><span>' + message + '</span>';
    DOM.toastContainer.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.remove(); }, 4000);
}

// =============================================================================
// MODAL HELPERS
// =============================================================================
function apriModale(titolo, bodyHtml, onConfirm, opts) {
    opts = opts || {};
    var container = DOM.modalOverlay.querySelector('.modal-container');
    DOM.modalTitle.textContent = titolo;
    DOM.modalBody.innerHTML = bodyHtml;
    DOM.modalConfirm.onclick = onConfirm;
    DOM.modalCancel.onclick = chiudiModale;
    DOM.modalClose.onclick = chiudiModale;
    // Modali informativi (es. Aiuto) senza footer: resta solo la X per chiudere
    var footer = DOM.modalOverlay.querySelector('.modal-footer');
    if (footer) footer.style.display = opts.noFooter ? 'none' : '';
    // Classe opzionale sul contenitore (es. 'modal-auto' per larghezza adattata al contenuto)
    if (container) {
        container.classList.remove('modal-auto');
        if (opts.modalClass) container.classList.add(opts.modalClass);
    }
    // Classe opzionale sull'overlay (es. 'modal-overlay-clean': niente sfondo scuro,
    // pannello ancorato a fianco della sidebar)
    DOM.modalOverlay.classList.remove('modal-overlay-clean');
    if (opts.overlayClass) DOM.modalOverlay.classList.add(opts.overlayClass);
    DOM.modalOverlay.classList.remove('hidden');
}

function chiudiModale() {
    DOM.modalOverlay.classList.add('hidden');
    DOM.modalConfirm.onclick = null;
    // Ripristina footer e classi overlay/contenitore per i prossimi modali
    var footer = DOM.modalOverlay.querySelector('.modal-footer');
    if (footer) footer.style.display = '';
    var container = DOM.modalOverlay.querySelector('.modal-container');
    if (container) container.classList.remove('modal-auto');
    DOM.modalOverlay.classList.remove('modal-overlay-clean');
}

// =============================================================================
// SIDEBAR NAVIGATION
// =============================================================================
function setActiveView(viewId) {
    WS.viewAttiva = viewId;
}

/**
 * Cambia il tab attivo nella sidebar.
 * @param {string} tabName - 'navigazione', 'manuale', o 'automatica'
 */
function switchSidebarTab(tabName) {
    DOM.sidebarTabs.forEach(function (t) {
        t.classList.toggle('active', t.dataset.tab === tabName);
    });
    DOM.sidebarTabPanels.forEach(function (p) {
        p.classList.toggle('active', p.dataset.tabPanel === tabName);
    });

    if (tabName === 'automatica' || tabName === 'manuale') {
        if (typeof mostraViewport === 'function') {
            mostraViewport();
        }
        setActiveView('carico');
    }

    // Attiva/disattiva modalita manuale
    WS.manualMode = (tabName === 'manuale');
    if (!WS.manualMode) {
        // Non trasferire la selezione persistente del pannello
        // nell'automatica o nella navigazione.
        WS._manualPanelSelectedOggettoId = null;
        WS._manualPanelSelectedCodice = null;
    }
}

// =============================================================================
// SIDEBAR NAVIGATION — ESEGUI NAVIGAZIONE
// =============================================================================

/**
 * Esegue la navigazione verso una vista (usato sia dalla sidebar che dal flyout).
 * @param {string} view - il valore di data-view
 */
function eseguiNavigazione(view) {
    setActiveView(view);
    switchSidebarTab('navigazione');

    switch (view) {
        case 'carico':
        case 'dashboard':
            mostraViewport();
            break;
        case 'mezzi':
            mostraPanelView('mezzi');
            break;
        case 'oggetti':
            mostraPanelView('oggetti');
            break;
        case 'vincoli-tra':
            mostraPanelView('vincoli-tra');
            break;
        case 'piani':
            mostraPanelView('piani');
            break;
        case 'impostazioni':
            mostraPanelView('impostazioni');
            break;
        case 'nuovo-carico':
            nuovoCarico();
            setActiveView('carico');
            break;
        case 'salva-db':
            if (typeof salvaPianoDB === 'function') salvaPianoDB();
            setActiveView('carico');
            break;
        case 'export-file':
            if (typeof esportaCarico3D === 'function') esportaCarico3D();
            setActiveView('carico');
            break;
        case 'import-file':
            if (typeof importaCarico3D === 'function') importaCarico3D();
            setActiveView('carico');
            break;
    }
}

// =============================================================================
// CONTROLLI VISTA CAMERA 3D
// =============================================================================

/**
 * Imposta la vista camera 3D (richiamato sia da toolbar che da sidebar).
 * @param {string} vista - 'top', 'front', 'side', 'reset'
 */
function impostaVistaCamera(vista) {
    if (!WS.treSceneLoaded || typeof STATE === 'undefined' || !STATE.controls) {
        showToast('⚠️ Carica prima una scena 3D', 'warning');
        return;
    }
    var t = STATE.controls.target;
    switch (vista) {
        case 'top':
            STATE.camera.position.set(t.x, t.y + 1000, t.z);
            break;
        case 'front':
            STATE.camera.position.set(t.x, t.y, t.z + 1000);
            break;
        case 'side':
            STATE.camera.position.set(t.x + 1000, t.y, t.z);
            break;
        case 'reset':
            if (typeof resetView === 'function') resetView();
            return;
        default:
            return;
    }
    STATE.controls.update();
}

// =============================================================================
// HEADER CATEGORY — CONTENUTO DINAMICO SIDEBAR NAVIGAZIONE
// =============================================================================

/**
 * Attiva una categoria nell'header e aggiorna la sidebar Navigazione.
 * @param {string} cat - 'documenti' | 'anagrafica' | 'sistema' | 'goto-automatica' | 'goto-manuale' | 'toggle-vista'
 */
function _attivaHeaderCategory(cat) {
    // Categorie speciali: shortcut e toggle
    if (cat === 'goto-automatica') {
        switchSidebarTab('automatica');
        return;
    }
    if (cat === 'goto-manuale') {
        switchSidebarTab('manuale');
        return;
    }
    if (cat === 'toggle-vista') {
        _toggleVistaToolbar();
        return;
    }

    // Categorie normali: aggiorna header e sidebar
    WS.headerCategory = cat;

    // Aggiorna stato visivo pulsanti header
    DOM.headerCatBtns.forEach(function (btn) {
        btn.classList.toggle('active', btn.dataset.cat === cat);
    });

    // Assicura che il tab Navigazione sia attivo
    switchSidebarTab('navigazione');

    // Renderizza il contenuto dinamico
    _renderSidebarNavigazione(cat);
}

/**
 * Renderizza il contenuto del tab Navigazione in base alla categoria header attiva.
 * @param {string} cat - 'documenti' | 'anagrafica' | 'sistema'
 */
function _renderSidebarNavigazione(cat) {
    if (!DOM.sidebarNavDynamic) return;

    // Blocco Strumenti Rapidi (in fondo a ogni categoria)
    var strumentiRapidiHtml = '' +
        '<div class="sidebar-nav-bottom">' +
            '<div class="sidebar-nav-separator"></div>' +
            '<button class="sidebar-nav-item" data-action="carico">' +
                '<i class="bi bi-bar-chart sidebar-icon"></i> Vista Carico' +
            '</button>' +
            '<button class="sidebar-nav-item" data-action="grafico-pesi">' +
                '<i class="bi bi-speedometer2 sidebar-icon"></i> Distribuzione Pesi' +
            '</button>' +
        '</div>';

    var html = '';

    switch (cat) {
        case 'documenti':
            html = '' +
                '<button class="sidebar-nav-item" data-view="nuovo-carico">' +
                    '<i class="bi bi-file-earmark-plus sidebar-icon"></i> Nuovo Carico' +
                '</button>' +
                '<button class="sidebar-nav-item" data-view="piani">' +
                    '<i class="bi bi-folder2 sidebar-icon"></i> Apri Piano' +
                '</button>' +
                '<button class="sidebar-nav-item" data-view="salva-db">' +
                    '<i class="bi bi-save sidebar-icon"></i> Salva' +
                '</button>' +
                '<button class="sidebar-nav-item" data-view="export-file">' +
                    '<i class="bi bi-upload sidebar-icon"></i> Esporta' +
                '</button>' +
                '<button class="sidebar-nav-item" data-view="import-file">' +
                    '<i class="bi bi-download sidebar-icon"></i> Importa' +
                '</button>' +
                '<button class="sidebar-nav-item" data-action="svuota-carico">' +
                    '<i class="bi bi-trash sidebar-icon"></i> Svuota Carico' +
                '</button>' +
                strumentiRapidiHtml;
            break;

        case 'anagrafica':
            html = '' +
                '<button class="sidebar-nav-item" data-view="oggetti">' +
                    '<i class="bi bi-box-seam sidebar-icon"></i> Articoli' +
                '</button>' +
                '<button class="sidebar-nav-item" data-view="vincoli-tra">' +
                    '<i class="bi bi-link-45deg sidebar-icon"></i> Vincoli' +
                '</button>' +
                '<button class="sidebar-nav-item" data-view="mezzi">' +
                    '<i class="bi bi-truck sidebar-icon"></i> Trasporti' +
                '</button>' +
                strumentiRapidiHtml;
            break;

        case 'sistema':
            html = '' +
                '<button class="sidebar-nav-item" data-view="impostazioni">' +
                    '<i class="bi bi-sliders sidebar-icon"></i> Impostazioni' +
                '</button>';
            if (W.user && W.user.isStaff) {
                html += '<a href="/admin/" class="sidebar-nav-item" style="text-decoration:none;">' +
                    '<i class="bi bi-shield-shaded sidebar-icon"></i> Pannello Admin' +
                '</a>';
            }
            html += '<a href="/logout/" class="sidebar-nav-item" style="color:#c0392b;text-decoration:none;">' +
                '<i class="bi bi-box-arrow-right sidebar-icon"></i> Esci' +
            '</a>' +
            strumentiRapidiHtml;
            break;

        case 'report':
            html = '' +
                '<button class="sidebar-nav-item" data-action="report-3d">' +
                    '<i class="bi bi-file-earmark sidebar-icon"></i> Report 3D' +
                '</button>' +
                '<button class="sidebar-nav-item" data-action="report-quadranti">' +
                    '<i class="bi bi-grid-3x3-gap sidebar-icon"></i> Quadranti 2×2' +
                '</button>' +
                strumentiRapidiHtml;
            break;
    }

    DOM.sidebarNavDynamic.innerHTML = html;

    // Rilega gli eventi click sugli item dinamici
    _bindSidebarNavDynamicEvents();

    // Riapplica icone PNG dopo render dinamico (se modulo icone caricato)
    if (typeof _applyIconConfig === 'function') {
        setTimeout(function () { _applyIconConfig(); }, 50);
    }
}

/**
 * Rilega gli eventi click sugli item generati dinamicamente nella sidebar Navigazione.
 */
function _bindSidebarNavDynamicEvents() {
    if (!DOM.sidebarNavDynamic) return;

    // Item di navigazione (data-view)
    var navItems = DOM.sidebarNavDynamic.querySelectorAll('.sidebar-nav-item[data-view]');
    navItems.forEach(function (item) {
        item.addEventListener('click', function (e) {
            e.preventDefault();
            var view = this.dataset.view;
            eseguiNavigazione(view);
        });
    });

    // Item azione rapida (data-action)
    var actionItems = DOM.sidebarNavDynamic.querySelectorAll('.sidebar-nav-item[data-action]');
    actionItems.forEach(function (item) {
        item.addEventListener('click', function (e) {
            e.preventDefault();
            var action = this.dataset.action;
            _eseguiAzioneRapida(action);
        });
    });
}

/**
 * Esegue un'azione rapida dalla sidebar dinamica.
 */
function _eseguiAzioneRapida(action) {
    switch (action) {
        case 'nuovo-carico':
            nuovoCarico();
            setActiveView('carico');
            break;
        case 'svuota-carico':
            if (typeof svuotaCarico === 'function') svuotaCarico();
            break;
        case 'carico':
            if (typeof mostraViewport === 'function') mostraViewport();
            setActiveView('carico');
            break;
        case 'grafico-pesi':
            var panel = document.getElementById('sezioni-pesi-panel');
            if (panel) {
                if (panel.style.display === 'none' || panel.style.display === '') {
                    panel.style.display = 'block';
                    if (typeof Chart === 'undefined') {
                        if (typeof caricaChartJS === 'function') {
                            caricaChartJS().then(function () {
                                if (typeof _disegnaDistribuzionePesiLocale === 'function') _disegnaDistribuzionePesiLocale();
                            });
                        }
                    } else {
                        if (typeof _disegnaDistribuzionePesiLocale === 'function') _disegnaDistribuzionePesiLocale();
                    }
                } else {
                    if (typeof nascondiDistribuzionePesi === 'function') nascondiDistribuzionePesi();
                    else panel.style.display = 'none';
                }
            }
            break;
        case 'salva-db':
            if (typeof salvaPianoDB === 'function') salvaPianoDB();
            break;
        case 'report-3d':
            if (typeof generaReport === 'function') generaReport();
            else showToast('Modulo report non caricato.', 'error');
            break;
        case 'report-quadranti':
            if (typeof generaReportQuadranti === 'function') generaReportQuadranti();
            else showToast('Modulo report quadranti non caricato.', 'error');
            break;
    }
}

/**
 * Toggle visibilità palette flottante Vista.
 */
function _toggleVistaToolbar() {
    WS.vistaToolbarVisible = !WS.vistaToolbarVisible;
    var palette = document.getElementById('vp-floating-palette');
    if (!palette) return;

    if (WS.vistaToolbarVisible) {
        if (typeof _apriFloatingPalette === 'function') _apriFloatingPalette();
        else palette.classList.add('visible');
        // Nascondi la toolbar orizzontale: sostituita dalla palette
        if (DOM.viewportToolbar) DOM.viewportToolbar.style.display = 'none';
    } else {
        if (typeof _chiudiFloatingPalette === 'function') _chiudiFloatingPalette();
        else palette.classList.remove('visible');
    }
}

/**
 * Aggiorna la label del carico nell'header (spostata dalla toolbar).
 * @param {string} text - il testo da mostrare (es. nome piano, o '' per default)
 */
function _setHeaderCaricoLabel(text) {
    if (DOM.headerCaricoLabel) {
        DOM.headerCaricoLabel.textContent = text || 'Nessun carico';
        DOM.headerCaricoLabel.style.color = text ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.35)';
    }
}

/**
 * Aggiorna il riepilogo nella sidebar sinistra (pezzi, peso, oggetti, mt lineari).
 * @param {number} totPezzi - totale pezzi (da aggiornaRiepilogoPanel)
 * @param {number} totPeso - peso totale in kg
 * @param {number} totRighe - numero oggetti distinti
 */
function _aggiornaSidebarRiepilogo(totPezzi, totPeso, totRighe) {
    if (!DOM.sidebarStatPezzi) return;

    DOM.sidebarStatPezzi.textContent = totPezzi || 0;
    DOM.sidebarStatPeso.textContent = (totPeso || 0).toFixed(1) + ' kg';
    DOM.sidebarStatRighe.textContent = totRighe || 0;

    // Metri lineari: totale mezzo + occupato (se disponibile da scena 3D)
    var lineariText = '— m';
    if (WS.activeMezzoId) {
        var mezzo = WS.contenitori.find(function (c) { return c.id == WS.activeMezzoId; });
        if (mezzo) {
            var totM = (mezzo.lunghezza_mm / 1000).toFixed(1);
            // Prova a calcolare l'occupato dalla scena 3D (oggetti posizionati)
            var maxXmm = _calcolaMaxXOccupato();
            if (maxXmm > 0) {
                var occM = (maxXmm / 1000).toFixed(1);
                lineariText = occM + ' / ' + totM + ' m';
            } else {
                lineariText = '— / ' + totM + ' m';
            }
        }
    }
    DOM.sidebarStatLineari.textContent = lineariText;

    // Mezzo info
    if (DOM.sidebarMezzoNome) {
        if (WS.activeMezzoId) {
            var m = WS.contenitori.find(function (c) { return c.id == WS.activeMezzoId; });
            DOM.sidebarMezzoNome.textContent = m ? m.nome : 'Selezionato';
        } else {
            DOM.sidebarMezzoNome.textContent = 'Nessun mezzo';
        }
    }
}

/**
 * Calcola la massima estensione X degli oggetti nella scena 3D (in mm).
 * Restituisce 0 se non ci sono oggetti posizionati.
 */
/**
 * Helper: ricalcola il riepilogo sidebar dai dati pannello correnti.
 * Usato per aggiornare i mt lineari in tempo reale dopo modifiche 3D.
 */
function _refreshSidebarLineari() {
    if (typeof _aggiornaSidebarRiepilogo !== 'function') return;
    var panelItems = document.querySelectorAll('#panel-items-list .panel-item');
    var tp = 0, tkg = 0;
    panelItems.forEach(function (d) {
        var q = parseInt(d.querySelector('.panel-qty-input')?.value) || 1;
        var p = parseFloat(d.dataset.peso) || 0;
        tp += q; tkg += q * p;
    });
    _aggiornaSidebarRiepilogo(tp, tkg, panelItems.length);
}

function _calcolaMaxXOccupato() {
    if (typeof STATE === 'undefined' || !STATE.oggettiMesh || !STATE.oggettiMesh.length) return 0;
    var maxX = 0;
    STATE.oggettiMesh.forEach(function (group) {
        if (!group.userData || !group.userData._tjsDimCm) return;
        var dimCm = group.userData._tjsDimCm;
        // group.position.x = centro X in cm (Three.js)
        // dimCm.x = lunghezza in cm (Three.js X = API lunghezza)
        var centroX_cm = group.position.x;
        var fineX_cm = centroX_cm + dimCm.x / 2;
        var fineX_mm = fineX_cm * 10;
        if (fineX_mm > maxX) maxX = fineX_mm;
    });
    return maxX;
}

