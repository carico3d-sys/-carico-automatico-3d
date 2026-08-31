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
function coloreEsadecimaleValido(valore) {
    return typeof valore === 'string' && /^#[0-9a-fA-F]{6}$/.test(valore.trim());
}

function coloreOggetto(oggetto) {
    var colore = oggetto && typeof oggetto.colore === 'string' ? oggetto.colore.trim() : '';
    if (coloreEsadecimaleValido(colore)) {
        return colore;
    }
    var id = oggetto && Number.isFinite(Number(oggetto.id)) ? Number(oggetto.id) : 0;
    return COLORI_PACCHI[Math.abs(id) % COLORI_PACCHI.length];
}

/**
 * Colore effettivo di una riga del pannello "Oggetti nel carico":
 * colore personalizzato della riga (dataset.colore) se presente,
 * altrimenti colore dell'anagrafica dell'oggetto.
 */
function coloreRiga(itemDiv) {
    if (!itemDiv) return '#447e9b';
    var colore = itemDiv.dataset.colore || '';
    if (coloreEsadecimaleValido(colore)) {
        return colore;
    }
    var oid = parseInt(itemDiv.dataset.oggettoId, 10) || 0;
    return coloreOggetto(trovaOggetto(oid));
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
    _manualUndoStack: [],         // cronologia Undo delle modifiche manuali
    _manualUndoScene: null,       // scena a cui appartiene la cronologia
    _manualUndoRestoring: false,  // evita di registrare durante il ripristino
    _autoPreviewPosizioni: null, // snapshot stabile dell'ultimo "Elabora"
    salvataggioInCorso: false,    // impedisce salvataggi DB concorrenti
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
    DOM.sidebarAnagraficaDynamic = document.getElementById('sidebar-anagrafica-dynamic');
    DOM.headerCatBtns = document.querySelectorAll('.header-cat-btn');
    DOM.vpfHelpPopover = document.getElementById('vpf-help-popover');
    DOM.vpfBtnZoomIn = document.getElementById('vpf-btn-zoom-in');
    DOM.vpfBtnZoomOut = document.getElementById('vpf-btn-zoom-out');
    DOM.vpfBtnHelp = document.getElementById('vpf-btn-help');
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
    DOM.headerCaricoLabel = document.getElementById('header-carico-label');
    DOM.panelView = document.getElementById('panel-view');
    DOM.pvListTitle = document.getElementById('pv-list-title');
    DOM.pvListCount = document.getElementById('pv-list-count');
    DOM.pvListBody = document.getElementById('pv-list-body');
    DOM.pvFormTitle = document.getElementById('pv-form-title');
    DOM.pvFormBody = document.getElementById('pv-form-body');

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
// ERRORI API / RETE
// =============================================================================

function ApiError(message, status, code, requestId) {
    this.name = 'ApiError';
    this.message = message || 'Errore di comunicazione con il server.';
    this.status = status || 0;
    this.code = code || 'network_error';
    this.requestId = requestId || '';
    if (Error.captureStackTrace) Error.captureStackTrace(this, ApiError);
}
ApiError.prototype = Object.create(Error.prototype);
ApiError.prototype.constructor = ApiError;

function _messaggioErroreHttp(status) {
    if (status === 400 || status === 422) return 'I dati inseriti non sono validi.';
    if (status === 401) return 'La sessione è scaduta. Ricarica la pagina e accedi di nuovo.';
    if (status === 403) return 'Non hai i permessi per eseguire questa operazione.';
    if (status === 404) return 'La risorsa richiesta non è stata trovata.';
    if (status === 409) return 'L’operazione non è compatibile con lo stato attuale.';
    if (status === 429) return 'Troppe richieste. Riprova tra poco.';
    if (status >= 500) return 'Servizio temporaneamente non disponibile. Riprova più tardi.';
    return 'Errore di comunicazione con il server.';
}

function _datiErroreApi(payload) {
    if (!payload || typeof payload !== 'object') return null;
    var error = payload.error;
    if (error && typeof error === 'object') {
        return {
            message: typeof error.message === 'string' ? error.message : '',
            code: typeof error.code === 'string' ? error.code : '',
            requestId: typeof error.request_id === 'string' ? error.request_id : ''
        };
    }
    return {
        message: typeof error === 'string' ? error :
            (typeof payload.detail === 'string' ? payload.detail :
                (typeof payload.errore === 'string' ? payload.errore : '')),
        code: '',
        requestId: ''
    };
}

function _apiFetch(input, init) {
    init = init ? Object.assign({}, init) : {};
    var timeoutMs = Number(init.timeoutMs) || 20000;
    delete init.timeoutMs;
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = null;

    if (controller) {
        if (init.signal) {
            if (init.signal.aborted) controller.abort();
            else init.signal.addEventListener('abort', function () { controller.abort(); }, { once: true });
        }
        init.signal = controller.signal;
        timer = setTimeout(function () { controller.abort(); }, timeoutMs);
    }

    if (typeof Headers !== 'undefined') {
        var headers = new Headers(init.headers || {});
        if (!headers.has('Accept')) headers.set('Accept', 'application/json');
        init.headers = headers;
    }
    if (!init.credentials) init.credentials = 'same-origin';

    return window.__nativeFetch(input, init).then(async function (response) {
        if (timer) clearTimeout(timer);
        if (response.ok) return response;

        var payload = null;
        try { payload = await response.clone().json(); } catch (ignore) { /* risposta non JSON */ }
        var parsed = _datiErroreApi(payload) || {};
        var status = response.status;
        var message = status >= 500 ? _messaggioErroreHttp(status) : (parsed.message || _messaggioErroreHttp(status));
        var requestId = parsed.requestId || response.headers.get('X-Request-ID') || '';
        throw new ApiError(message, status, parsed.code || 'http_error', requestId);
    }).catch(function (error) {
        if (timer) clearTimeout(timer);
        if (error instanceof ApiError) throw error;
        if (error && error.name === 'AbortError') {
            throw new ApiError('La richiesta ha impiegato troppo tempo. Riprova.', 0, 'timeout_error');
        }
        throw new ApiError('Impossibile raggiungere il server. Controlla la connessione e riprova.', 0, 'network_error');
    });
}

// Una sola porta per tutte le chiamate fetch del workspace. I moduli esistenti
// continuano a usare fetch(), ma ricevono timeout e ApiError uniformi.
if (!window.__nativeFetch) {
    window.__nativeFetch = window.fetch.bind(window);
    window.fetch = _apiFetch;
}

function inizializzaGestioneErroriGlobale() {
    if (window.__workspaceErrorHandlersReady) return;
    window.__workspaceErrorHandlersReady = true;
    var ultimaNotifica = 0;

    function notificaErrore(error) {
        var now = Date.now();
        if (now - ultimaNotifica < 3000) return;
        ultimaNotifica = now;
        console.error('[Workspace] Errore non gestito:', error);
        if (DOM.toastContainer) {
            showToast(error instanceof ApiError ? error.message : 'Si è verificato un errore imprevisto. Riprova.', 'error');
        }
    }

    window.addEventListener('error', function (event) {
        notificaErrore(event.error || new Error(event.message || 'Errore JavaScript'));
    });
    window.addEventListener('unhandledrejection', function (event) {
        event.preventDefault();
        notificaErrore(event.reason instanceof Error ? event.reason : new Error(String(event.reason || 'Promise rifiutata')));
    });
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
    const icons = {
        success: 'bi-check-circle',
        error: 'bi-x-circle',
        info: 'bi-info-circle',
        warning: 'bi-exclamation-triangle'
    };
    const t = document.createElement('div');
    t.className = 'toast toast-' + type;
    const iconWrap = document.createElement('span');
    iconWrap.className = 'toast-icon';
    const icon = document.createElement('i');
    icon.className = 'bi ' + (icons[type] || 'bi-info-circle');
    iconWrap.appendChild(icon);
    const messageEl = document.createElement('span');
    messageEl.textContent = message == null ? '' : String(message);
    t.appendChild(iconWrap);
    t.appendChild(messageEl);
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
 * @param {string} tabName - 'documenti', 'anagrafica', 'manuale', o 'automatica'
 */
function switchSidebarTab(tabName) {
    var sidebarTabsBar = document.getElementById('sidebar-tabs');
    if (sidebarTabsBar) {
        sidebarTabsBar.classList.remove('sidebar-tabs-context-header');
    }
    DOM.sidebarTabs.forEach(function (t) {
        t.classList.toggle('active', t.dataset.tab === tabName);
    });
    DOM.sidebarTabPanels.forEach(function (p) {
        p.classList.toggle('active', p.dataset.tabPanel === tabName);
    });

    // I primi due tab hanno contenuti indipendenti: il click diretto sulla
    // sidebar deve sempre mostrare la categoria corrispondente.
    if (tabName === 'documenti') {
        _renderSidebarNavigazione('documenti');
    } else if (tabName === 'anagrafica') {
        _renderSidebarNavigazione('anagrafica');
    }

    if (tabName === 'automatica' || tabName === 'manuale') {
        if (typeof mostraViewport === 'function') {
            mostraViewport();
        }
        setActiveView('carico');
    }

    // Attiva/disattiva modalita manuale
    WS.manualMode = (tabName === 'manuale');
    if (WS.manualMode) {
        if (typeof _inizializzaCronologiaManuale === 'function') {
            _inizializzaCronologiaManuale();
        }
        if (typeof _aggiornaUndoManualeUI === 'function') {
            _aggiornaUndoManualeUI();
        }
    }
    if (!WS.manualMode) {
        // Non trasferire la selezione persistente del pannello
        // nell'automatica o nella navigazione.
        WS._manualPanelSelectedOggettoId = null;
        WS._manualPanelSelectedCodice = null;
        WS._manualPanelSelectedRigaId = null;
        WS._manualPanelSelectedRigaKey = null;
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
    var tabNavigazione = ['oggetti', 'vincoli-tra', 'mezzi'].indexOf(view) >= 0
        ? 'anagrafica' : 'documenti';
    var mantieneContestoHeader = view === 'impostazioni' && WS.headerCategory === 'sistema';
    if (!mantieneContestoHeader) {
        switchSidebarTab(tabNavigazione);
    }

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
        case 'abbonamento':
            mostraPanelView('abbonamento');
            break;
        case 'nuovo-carico':
            nuovoCarico();
            setActiveView('carico');
            break;
        case 'salva-db':
            if (typeof salvaPianoDB === 'function') {
                // Il comando Navigazione/Salva deve comportarsi esattamente
                // come i pulsanti Salva dei tab Manuale e Automatica.
                salvaPianoDB();
            } else {
                showToast('Modulo salvataggio non caricato.', 'error');
            }
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
// HEADER CATEGORY — CONTENUTO DINAMICO SIDEBAR
// =============================================================================

/**
 * Attiva una categoria nell'header e aggiorna il tab sidebar pertinente.
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

    // Documenti e Anagrafica hanno tab distinti; Report e Sistema usano
    // il tab Documenti come area di navigazione contestuale.
    var tabCategoria = cat === 'anagrafica' ? 'anagrafica' : 'documenti';
    switchSidebarTab(tabCategoria);

    var sidebarTabsBar = document.getElementById('sidebar-tabs');
    if (sidebarTabsBar) {
        var contestoHeader = cat === 'sistema' || cat === 'report';
        sidebarTabsBar.classList.toggle('sidebar-tabs-context-header', contestoHeader);
        if (contestoHeader) {
            // Sistema e Report sono contesti dell'header: lascia il pannello
            // menu visibile, ma non selezionare/sottolineare uno dei quattro tab.
            DOM.sidebarTabs.forEach(function (tab) { tab.classList.remove('active'); });
        }
    }

    // Renderizza il contenuto dinamico della categoria selezionata
    _renderSidebarNavigazione(cat);
}

/**
 * Renderizza il contenuto del tab Documenti/Anagrafica in base alla categoria header attiva.
 * @param {string} cat - 'documenti' | 'anagrafica' | 'sistema'
 */
function apriImpostazioniDaSidebar() {
    _attivaHeaderCategory('sistema');
    eseguiNavigazione('impostazioni');
}

function _renderSidebarNavigazione(cat) {
    var target = cat === 'anagrafica'
        ? DOM.sidebarAnagraficaDynamic
        : DOM.sidebarNavDynamic;
    if (!target) return;

    // Blocco Strumenti Rapidi (in fondo a ogni categoria)
    var strumentiRapidiHtml = '' +
        '<div class="sidebar-nav-bottom">' +
            '<div class="sidebar-nav-separator"></div>' +
            '<button class="sidebar-nav-item" data-translation-key="sidebar.vista-carico" data-action="carico" data-translation-key="sidebar.vista-carico">' +
                '<i class="bi bi-bar-chart sidebar-icon"></i> <span class="language-label" data-italiano="Vista Carico">Vista Carico</span>' +
            '</button>' +
            '<button class="sidebar-nav-item" data-translation-key="sidebar.distribuzione-pesi" data-action="grafico-pesi" data-translation-key="sidebar.distribuzione-pesi">' +
                '<i class="bi bi-speedometer2 sidebar-icon"></i> <span class="language-label" data-italiano="Distribuzione Pesi">Distribuzione Pesi</span>' +
            '</button>' +
        '</div>';

    var html = '';

    switch (cat) {
        case 'documenti':
            html = '' +
                '<button class="sidebar-nav-item" data-view="nuovo-carico" data-translation-key="sidebar.nuovo-carico">' +
                    '<i class="bi bi-file-earmark-plus sidebar-icon"></i> <span class="language-label" data-italiano="Nuovo Carico">Nuovo Carico</span>' +
                '</button>' +
                '<button class="sidebar-nav-item" data-view="piani" data-translation-key="sidebar.apri-piano">' +
                    '<i class="bi bi-folder2 sidebar-icon"></i> <span class="language-label" data-italiano="Apri Piano">Apri Piano</span>' +
                '</button>' +
                '<button class="sidebar-nav-item" data-view="abbonamento" data-translation-key="sidebar.abbonamento">' +
                    '<i class="bi bi-credit-card sidebar-icon"></i> <span class="language-label" data-italiano="Abbonamento">Abbonamento</span>' +
                '</button>' +
                '<button class="sidebar-nav-item" data-view="salva-db" data-translation-key="sidebar.salva">' +
                    '<i class="bi bi-save sidebar-icon"></i> <span class="language-label" data-italiano="Salva">Salva</span>' +
                '</button>' +
                '<button class="sidebar-nav-item" data-view="export-file" data-translation-key="sidebar.esporta">' +
                    '<i class="bi bi-upload sidebar-icon"></i> <span class="language-label" data-italiano="Esporta">Esporta</span>' +
                '</button>' +
                '<button class="sidebar-nav-item" data-view="import-file" data-translation-key="sidebar.importa">' +
                    '<i class="bi bi-download sidebar-icon"></i> <span class="language-label" data-italiano="Importa">Importa</span>' +
                '</button>' +
                '<button class="sidebar-nav-item" data-action="svuota-carico" data-translation-key="sidebar.svuota-carico">' +
                    '<i class="bi bi-trash sidebar-icon"></i> <span class="language-label" data-italiano="Svuota Carico">Svuota Carico</span>' +
                '</button>' +
                strumentiRapidiHtml;
            break;

        case 'anagrafica':
            html = '' +
                '<button class="sidebar-nav-item" data-view="oggetti" data-translation-key="sidebar.oggetti">' +
                    '<i class="bi bi-box-seam sidebar-icon"></i> <span class="language-label" data-translation-key="sidebar.oggetti" data-italiano="Oggetti">Oggetti</span>' +
                '</button>' +
                '<button class="sidebar-nav-item" data-view="vincoli-tra" data-translation-key="sidebar.vincoli">' +
                    '<i class="bi bi-link-45deg sidebar-icon"></i> <span class="language-label" data-translation-key="sidebar.vincoli" data-italiano="Vincoli">Vincoli</span>' +
                '</button>' +
                '<button class="sidebar-nav-item" data-view="mezzi" data-translation-key="sidebar.trasporti">' +
                    '<i class="bi bi-truck sidebar-icon"></i> <span class="language-label" data-translation-key="sidebar.trasporti" data-italiano="Trasporti">Trasporti</span>' +
                '</button>' +
                strumentiRapidiHtml;
            break;

        case 'sistema':
            html = '' +
                '<button class="sidebar-nav-item" data-view="impostazioni" data-translation-key="sidebar.impostazioni">' +
                    '<i class="bi bi-sliders sidebar-icon"></i> <span class="language-label" data-italiano="Impostazioni">Impostazioni</span>' +
                '</button>';
            if (W.user && W.user.isStaff) {
                html += '<a href="/admin/" class="sidebar-nav-item" style="text-decoration:none;">' +
                    '<i class="bi bi-shield-shaded sidebar-icon"></i> <span class="language-label" data-translation-key="sidebar.pannello-admin" data-italiano="Pannello Admin">Pannello Admin</span>' +
                '</a>';
            }
            html += strumentiRapidiHtml;
            break;

        case 'report':
            html = '' +
                '<button class="sidebar-nav-item" data-action="report-3d" data-translation-key="sidebar.report-3d">' +
                    '<i class="bi bi-file-earmark sidebar-icon"></i> <span class="language-label" data-italiano="Report 3D">Report 3D</span>' +
                '</button>' +
                '<button class="sidebar-nav-item" data-action="report-quadranti" data-translation-key="sidebar.quadranti">' +
                    '<i class="bi bi-grid-3x3-gap sidebar-icon"></i> <span class="language-label" data-italiano="Quadranti 2×2">Quadranti 2×2</span>' +
                '</button>' +
                strumentiRapidiHtml;
            break;
    }

    target.innerHTML = html;
    document.dispatchEvent(new CustomEvent('carico3d:sidebar-rendered'));

    // Rilega gli eventi click sugli item dinamici
    _bindSidebarNavDynamicEvents();

    // Riapplica icone PNG dopo render dinamico (se modulo icone caricato)
    if (typeof _applyIconConfig === 'function') {
        setTimeout(function () { _applyIconConfig(); }, 50);
    }
}

/**
 * Rilega gli eventi click sugli item generati dinamicamente nella sidebar.
 */
function _bindSidebarNavDynamicEvents() {
    var containers = [DOM.sidebarNavDynamic, DOM.sidebarAnagraficaDynamic];
    containers.forEach(function (container) {
        if (!container) return;

        // Item di navigazione (data-view)
        var navItems = container.querySelectorAll('.sidebar-nav-item[data-view]');
        navItems.forEach(function (item) {
            item.addEventListener('click', function (e) {
                e.preventDefault();
                var view = this.dataset.view;
                eseguiNavigazione(view);
            });
        });

        // Item azione rapida (data-action)
        var actionItems = container.querySelectorAll('.sidebar-nav-item[data-action]');
        actionItems.forEach(function (item) {
            item.addEventListener('click', function (e) {
                e.preventDefault();
                var action = this.dataset.action;
                _eseguiAzioneRapida(action);
            });
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
            // Torna al main view: mostra il viewport 3D.
            // Il tab resta dov'era — l'utente gestisce la navigazione.
            if (typeof mostraViewport === 'function') mostraViewport();
            setActiveView('carico');
            break;
        case 'grafico-pesi':
            var panel = document.getElementById('sezioni-pesi-panel');
            if (panel) {
                if (panel.style.display === 'none' || panel.style.display === '') {
                    panel.style.display = 'block';
                    // Il pannello deve essere già impaginato prima di creare
                    // il canvas. La funzione comune gestisce anche il fallback
                    // ai dati persistiti se la scena locale non è disponibile.
                    if (typeof _apriDistribuzionePesi === 'function') {
                        _apriDistribuzionePesi();
                    } else if (typeof Chart === 'undefined') {
                        if (typeof caricaChartJS === 'function') {
                            caricaChartJS().then(function () {
                                if (typeof _disegnaDistribuzionePesiLocale === 'function') _disegnaDistribuzionePesiLocale();
                            });
                        }
                    } else if (typeof _disegnaDistribuzionePesiLocale === 'function') {
                        requestAnimationFrame(function () {
                            _disegnaDistribuzionePesiLocale();
                        });
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

