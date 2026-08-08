/**
 * Workspace Carico 3D — Gestione Icone (Admin only)
 *
 * Catalogo icone, modale di configurazione, toggle emoji/PNG,
 * upload file, salvataggio config su server.
 *
 * Depends on: workspace_core.js (DOM, showToast, getCSRFToken, W, WS)
 *
 * OGNI icona ha un campo `selector` CSS univoco per evitare collisioni
 * tra icone che condividono la stessa classe Bootstrap.
 * Solo le icone Toast usano il selettore di default (classe).
 */

// =============================================================================
// CATALOGO ICONE — tutte le icone usate nel programma
// =============================================================================

var ICON_CATALOG = [
    // --- Header Categorie ---
    { id: 'header-documenti',   type: 'png',     iconClass: 'bi bi-folder2-open',      file: 'folder.png',  dims: [40, 40], desc: 'Header: pulsante Documenti',              location: 'Header',  selector: '#header .header-cat-btn[data-cat="documenti"] .header-cat-icon' },
    { id: 'header-anagrafica',  type: 'bootstrap', iconClass: 'bi bi-journal-text',      file: '', dims: [40, 40], desc: 'Header: pulsante Anagrafica',              location: 'Header',  selector: '#header .header-cat-btn[data-cat="anagrafica"] .header-cat-icon' },
    { id: 'header-auto',        type: 'bootstrap', iconClass: 'bi bi-lightning-charge',  file: '', dims: [40, 40], desc: 'Header: pulsante Auto',                     location: 'Header',  selector: '#header .header-cat-btn[data-cat="goto-automatica"] .header-cat-icon' },
    { id: 'header-manuale',     type: 'bootstrap', iconClass: 'bi bi-hand-index-thumb',  file: '', dims: [40, 40], desc: 'Header: pulsante Manuale',                  location: 'Header',  selector: '#header .header-cat-btn[data-cat="goto-manuale"] .header-cat-icon' },
    { id: 'header-vista',       type: 'bootstrap', iconClass: 'bi bi-eye',               file: '', dims: [40, 40], desc: 'Header: pulsante Vista',                    location: 'Header',  selector: '#header .header-cat-btn[data-cat="toggle-vista"] .header-cat-icon' },
    { id: 'header-report',      type: 'bootstrap', iconClass: 'bi bi-bar-chart',         file: '', dims: [40, 40], desc: 'Header: pulsante Report',                   location: 'Header',  selector: '#header .header-cat-btn[data-cat="report"] .header-cat-icon' },
    { id: 'header-sistema',     type: 'bootstrap', iconClass: 'bi bi-gear',              file: '', dims: [40, 40], desc: 'Header: pulsante Sistema',                  location: 'Header',  selector: '#header .header-cat-btn[data-cat="sistema"] .header-cat-icon' },

    // --- Header Tools ---
    { id: 'header-export',      type: 'bootstrap', iconClass: 'bi bi-filetype-txt',      file: '', dims: [20, 20], desc: 'Header: pulsante Posizioni',               location: 'Header',  selector: '#header-export-btn > i' },

    // --- Header Logout ---
    { id: 'header-logout',      type: 'bootstrap', iconClass: 'bi bi-box-arrow-right',   file: '', dims: [16, 16], desc: 'Header: link Esci',                        location: 'Header',  selector: '#header-logout > i' },
    { id: 'header-logout-full', type: 'bootstrap', iconClass: 'bi bi-door-open',         file: '', dims: [16, 16], desc: 'Header: link Logout completo',              location: 'Header',  selector: '#header-logout-full > i' },

    // --- Header Logo ---
    { id: 'header-logo',        type: 'bootstrap', iconClass: 'bi bi-box-seam',          file: '', dims: [20, 20], desc: 'Header: logo Carico 3D',                   location: 'Header',  selector: '#header-logo > i' },

    // --- Sidebar Tabs ---
    { id: 'sidebar-nav',        type: 'bootstrap', iconClass: 'bi bi-compass',           file: '', dims: [18, 18], desc: 'Sidebar: tab Navigazione',                 location: 'Sidebar', selector: '#sidebar-tabs .sidebar-tab[data-tab="navigazione"] .sidebar-tab-icon' },
    { id: 'sidebar-manuale',    type: 'bootstrap', iconClass: 'bi bi-hand-index-thumb',  file: '', dims: [18, 18], desc: 'Sidebar: tab Manuale',                     location: 'Sidebar', selector: '#sidebar-tabs .sidebar-tab[data-tab="manuale"] .sidebar-tab-icon' },
    { id: 'sidebar-auto',       type: 'bootstrap', iconClass: 'bi bi-lightning-charge',  file: '', dims: [18, 18], desc: 'Sidebar: tab Automatica',                  location: 'Sidebar', selector: '#sidebar-tabs .sidebar-tab[data-tab="automatica"] .sidebar-tab-icon' },

    // --- Sidebar Navigazione Dinamica ---
    // (i titoli di sezione categoria sono stati rimossi — il pulsante header indica già la categoria)
    // Nav items con data-view
    { id: 'nav-nuovo-carico',   type: 'bootstrap', iconClass: 'bi bi-file-earmark-plus', file: '', dims: [18, 18], desc: 'Sidebar Nav: Nuovo Carico',                location: 'Sidebar', selector: '.sidebar-nav-item[data-view="nuovo-carico"] > i' },
    { id: 'nav-apri-piano',     type: 'bootstrap', iconClass: 'bi bi-folder2',           file: '', dims: [18, 18], desc: 'Sidebar Nav: Apri Piano',                  location: 'Sidebar', selector: '.sidebar-nav-item[data-view="piani"] > i' },
    { id: 'nav-salva',          type: 'bootstrap', iconClass: 'bi bi-save',              file: '', dims: [18, 18], desc: 'Sidebar Nav: Salva',                       location: 'Sidebar', selector: '.sidebar-nav-item[data-view="salva-db"] > i' },
    { id: 'nav-esporta',        type: 'bootstrap', iconClass: 'bi bi-upload',            file: '', dims: [18, 18], desc: 'Sidebar Nav: Esporta',                     location: 'Sidebar', selector: '.sidebar-nav-item[data-view="export-file"] > i' },
    { id: 'nav-importa',        type: 'bootstrap', iconClass: 'bi bi-download',          file: '', dims: [18, 18], desc: 'Sidebar Nav: Importa',                     location: 'Sidebar', selector: '.sidebar-nav-item[data-view="import-file"] > i' },
    // Nav items con data-action
    { id: 'nav-svuota',         type: 'bootstrap', iconClass: 'bi bi-trash',             file: '', dims: [18, 18], desc: 'Sidebar Nav: Svuota Carico',               location: 'Sidebar', selector: '.sidebar-nav-item[data-action="svuota-carico"] > i' },
    { id: 'nav-articoli',       type: 'bootstrap', iconClass: 'bi bi-box-seam',          file: '', dims: [18, 18], desc: 'Sidebar Nav: Articoli',                    location: 'Sidebar', selector: '.sidebar-nav-item[data-view="oggetti"] > i' },
    { id: 'nav-vincoli',        type: 'bootstrap', iconClass: 'bi bi-link-45deg',        file: '', dims: [18, 18], desc: 'Sidebar Nav: Vincoli',                     location: 'Sidebar', selector: '.sidebar-nav-item[data-view="vincoli-tra"] > i' },
    { id: 'nav-trasporti',      type: 'bootstrap', iconClass: 'bi bi-truck',             file: '', dims: [18, 18], desc: 'Sidebar Nav: Trasporti',                   location: 'Sidebar', selector: '.sidebar-nav-item[data-view="mezzi"] > i' },
    { id: 'nav-impostazioni',   type: 'bootstrap', iconClass: 'bi bi-sliders',           file: '', dims: [18, 18], desc: 'Sidebar Nav: Impostazioni',                location: 'Sidebar', selector: '.sidebar-nav-item[data-view="impostazioni"] > i' },
    { id: 'nav-admin',          type: 'bootstrap', iconClass: 'bi bi-shield-shaded',     file: '', dims: [18, 18], desc: 'Sidebar Nav: Pannello Admin',              location: 'Sidebar', selector: '#sidebar-nav-dynamic a.sidebar-nav-item > i.bi-shield-shaded' },
    { id: 'nav-esci',           type: 'bootstrap', iconClass: 'bi bi-box-arrow-right',   file: '', dims: [18, 18], desc: 'Sidebar Nav: Esci',                        location: 'Sidebar', selector: '#sidebar-nav-dynamic a.sidebar-nav-item > i.bi-box-arrow-right' },
    // Strumenti Rapidi: azioni
    { id: 'nav-strum-nuovo',    type: 'bootstrap', iconClass: 'bi bi-file-earmark',      file: '', dims: [18, 18], desc: 'Sidebar Strumenti: Nuovo Carico',           location: 'Sidebar', selector: '.sidebar-nav-item[data-action="nuovo-carico"] > i' },
    { id: 'nav-pesi',           type: 'bootstrap', iconClass: 'bi bi-speedometer2',      file: '', dims: [18, 18], desc: 'Sidebar Strumenti: Distribuzione Pesi',      location: 'Sidebar', selector: '.sidebar-nav-item[data-action="grafico-pesi"] > i' },
    { id: 'nav-vista-carico',   type: 'bootstrap', iconClass: 'bi bi-bar-chart',         file: '', dims: [18, 18], desc: 'Sidebar Strumenti: Vista Carico',            location: 'Sidebar', selector: '.sidebar-nav-item[data-action="carico"] > i' },
    { id: 'nav-report-3d',      type: 'bootstrap', iconClass: 'bi bi-file-earmark',      file: '', dims: [18, 18], desc: 'Sidebar Nav: Report 3D (categoria Report)',  location: 'Sidebar', selector: '.sidebar-nav-item[data-action="report-3d"] > i' },
    { id: 'nav-quadranti',      type: 'bootstrap', iconClass: 'bi bi-grid-3x3-gap',      file: '', dims: [18, 18], desc: 'Sidebar Nav: Quadranti 2x2',               location: 'Sidebar', selector: '.sidebar-nav-item[data-action="report-quadranti"] > i' },

    // --- Sidebar Riepilogo ---
    { id: 'sidebar-mezzo',      type: 'bootstrap', iconClass: 'bi bi-truck',             file: '', dims: [18, 18], desc: 'Sidebar Riepilogo: icona mezzo',            location: 'Sidebar', selector: '#sidebar-mezzo-icon' },

    // --- Viewport Toolbar (quella orizzontale, ora nascosta ma presente nel DOM) ---
    { id: 'vp-top',             type: 'bootstrap', iconClass: 'bi bi-arrow-up-square',   file: '', dims: [18, 18], desc: 'Viewport Toolbar: vista dall\'alto',        location: 'Viewport', selector: '#vp-btn-top > i' },
    { id: 'vp-front',           type: 'bootstrap', iconClass: 'bi bi-square',            file: '', dims: [18, 18], desc: 'Viewport Toolbar: vista frontale',          location: 'Viewport', selector: '#vp-btn-front > i' },
    { id: 'vp-side',            type: 'bootstrap', iconClass: 'bi bi-arrow-right-square',file: '', dims: [18, 18], desc: 'Viewport Toolbar: vista laterale',          location: 'Viewport', selector: '#vp-btn-side > i' },
    { id: 'vp-grid',            type: 'bootstrap', iconClass: 'bi bi-grid-3x3-gap',      file: '', dims: [18, 18], desc: 'Viewport Toolbar: vista 2x2',               location: 'Viewport', selector: '#vp-btn-grid > i' },
    { id: 'vp-zoom-out',        type: 'bootstrap', iconClass: 'bi bi-zoom-out',          file: '', dims: [18, 18], desc: 'Viewport Toolbar: zoom out',                location: 'Viewport', selector: '#vp-btn-zoom-out > i' },
    { id: 'vp-zoom-in',         type: 'bootstrap', iconClass: 'bi bi-zoom-in',           file: '', dims: [18, 18], desc: 'Viewport Toolbar: zoom in',                 location: 'Viewport', selector: '#vp-btn-zoom-in > i' },
    { id: 'vp-reset',           type: 'bootstrap', iconClass: 'bi bi-house',             file: '', dims: [18, 18], desc: 'Viewport Toolbar: reset camera',            location: 'Viewport', selector: '#vp-btn-reset > i' },
    { id: 'vp-fullscreen',      type: 'bootstrap', iconClass: 'bi bi-arrows-fullscreen', file: '', dims: [18, 18], desc: 'Viewport Toolbar: fullscreen',              location: 'Viewport', selector: '#vp-btn-fullscreen > i' },
    { id: 'vp-help',            type: 'bootstrap', iconClass: 'bi bi-question-circle',   file: '', dims: [18, 18], desc: 'Viewport Toolbar: aiuto comandi',           location: 'Viewport', selector: '#vp-btn-help > i' },
    { id: 'vp-rulers',          type: 'bootstrap', iconClass: 'bi bi-rulers',            file: '', dims: [18, 18], desc: 'Viewport Toolbar: spaziatura',              location: 'Viewport', selector: '#vp-spaziatura-indicator > i' },

    // --- Palette Flottante ---
    { id: 'palette-close',      type: 'bootstrap', iconClass: 'bi bi-x',                 file: '', dims: [16, 16], desc: 'Palette Vista: chiudi',                    location: 'Viewport', selector: '#vp-palette-close > i' },

    // --- Viewport Placeholder ---
    { id: 'vp-placeholder',     type: 'bootstrap', iconClass: 'bi bi-box-seam',          file: '', dims: [56, 56], desc: 'Viewport: icona placeholder',              location: 'Viewport', selector: '#viewport-placeholder .vp-icon' },
    { id: 'vp-lightbulb',       type: 'bootstrap', iconClass: 'bi bi-lightbulb',         file: '', dims: [16, 16], desc: 'Viewport: hint controlli',                 location: 'Viewport', selector: '#viewport-placeholder .vp-hint-controls i' },

    // --- Slider Sequenza ---
    { id: 'vp-slider-icon',     type: 'bootstrap', iconClass: 'bi bi-box-seam',          file: '', dims: [15, 15], desc: 'Viewport: icona slider sequenza',           location: 'Viewport', selector: '#vp-slider-bar .vp-slider-icon > i' },

    // --- Panel View ---
    { id: 'pv-back',            type: 'bootstrap', iconClass: 'bi bi-arrow-left',        file: '', dims: [14, 14], desc: 'Panel View: torna al Carico 3D',           location: 'Panel View', selector: '#pv-btn-back > i' },

    // --- Panel Destro ---
    { id: 'panel-header-icon',  type: 'bootstrap', iconClass: 'bi bi-box-seam',          file: '', dims: [17, 17], desc: 'Panel Destro: icona header',                location: 'Panel Destro', selector: '#panel-destro .panel-header h3 > i' },
    { id: 'panel-trash',        type: 'bootstrap', iconClass: 'bi bi-trash',             file: '', dims: [16, 16], desc: 'Panel Destro: elimina selezionati',         location: 'Panel Destro', selector: '#panel-header-trash > i' },
    { id: 'panel-empty',        type: 'bootstrap', iconClass: 'bi bi-inbox',             file: '', dims: [36, 36], desc: 'Panel Destro: nessun oggetto',              location: 'Panel Destro', selector: '#panel-destro .panel-empty-icon' },

    // --- Manuale Help (dentro sidebar tab Manuale) ---
    { id: 'manuale-mouse',      type: 'bootstrap', iconClass: 'bi bi-mouse',             file: '', dims: [18, 18], desc: 'Manuale: icona mouse',                     location: 'Sidebar', selector: '.sidebar-manuale-content .manuale-help-icon.bi-mouse' },
    { id: 'manuale-keyboard',   type: 'bootstrap', iconClass: 'bi bi-keyboard',          file: '', dims: [18, 18], desc: 'Manuale: icona tastiera',                  location: 'Sidebar', selector: '.sidebar-manuale-content .manuale-help-icon.bi-keyboard' },
    { id: 'manuale-rotate',     type: 'bootstrap', iconClass: 'bi bi-arrow-repeat',      file: '', dims: [18, 18], desc: 'Manuale: icona rotazione',                 location: 'Sidebar', selector: '.sidebar-manuale-content .manuale-help-icon.bi-arrow-repeat' },

    // --- D-Pad ---
    { id: 'dpad-controller',    type: 'bootstrap', iconClass: 'bi bi-controller',        file: '', dims: [14, 14], desc: 'D-Pad: icona controller',                  location: 'Sidebar', selector: '.manuale-dpad-title > i' },
    { id: 'dpad-up',            type: 'bootstrap', iconClass: 'bi bi-chevron-up',        file: '', dims: [14, 14], desc: 'D-Pad: freccia su',                        location: 'Sidebar', selector: '#manuale-dpad-up > i' },
    { id: 'dpad-down',          type: 'bootstrap', iconClass: 'bi bi-chevron-down',      file: '', dims: [14, 14], desc: 'D-Pad: freccia giu',                       location: 'Sidebar', selector: '#manuale-dpad-down > i' },
    { id: 'dpad-left',          type: 'bootstrap', iconClass: 'bi bi-chevron-left',      file: '', dims: [14, 14], desc: 'D-Pad: freccia sinistra',                  location: 'Sidebar', selector: '#manuale-dpad-left > i' },
    { id: 'dpad-right',         type: 'bootstrap', iconClass: 'bi bi-chevron-right',     file: '', dims: [14, 14], desc: 'D-Pad: freccia destra',                    location: 'Sidebar', selector: '#manuale-dpad-right > i' },
    { id: 'dpad-confirm',       type: 'bootstrap', iconClass: 'bi bi-check-lg',          file: '', dims: [18, 18], desc: 'D-Pad: conferma posizione',                location: 'Sidebar', selector: '#manuale-dpad-confirm > i' },

    // --- Bottoni Manuale ---
    { id: 'manuale-ghost',      type: 'bootstrap', iconClass: 'bi bi-eye-slash',         file: '', dims: [14, 14], desc: 'Manuale: toggle ghost',                    location: 'Sidebar', selector: '#manuale-btn-ghost-toggle > i' },
    { id: 'manuale-add',        type: 'bootstrap', iconClass: 'bi bi-plus-circle',       file: '', dims: [14, 14], desc: 'Manuale: aggiungi alla scena',             location: 'Sidebar', selector: '#manuale-btn-aggiungi > i' },
    { id: 'manuale-cancel',     type: 'bootstrap', iconClass: 'bi bi-x-circle',          file: '', dims: [14, 14], desc: 'Manuale: annulla piazzamento',             location: 'Sidebar', selector: '#manuale-btn-annulla-ghost > i' },

    // --- Altro ---
    { id: 'sezioni-pesi-icon',  type: 'bootstrap', iconClass: 'bi bi-bar-chart',         file: '', dims: [16, 16], desc: 'Sezioni Pesi: icona titolo',               location: 'Viewport', selector: '#sezioni-pesi-panel .sezioni-pesi-title > i' },
    { id: 'alternative-icon',   type: 'bootstrap', iconClass: 'bi bi-shuffle',           file: '', dims: [16, 16], desc: 'Soluzioni Alternative SA: icona',          location: 'Viewport', selector: '#soluzioni-alternative-panel > .sezioni-pesi-title i.bi-shuffle' },
    { id: 'spaziatura-label',   type: 'bootstrap', iconClass: 'bi bi-rulers',            file: '', dims: [14, 14], desc: 'Spaziatura Sidebar: icona',                location: 'Sidebar', selector: '#sidebar-spaziatura-bar .spaziatura-label > i' },

    // --- Toast (dinamici, usano il selettore di default basato sulla classe) ---
    { id: 'toast-success',      type: 'bootstrap', iconClass: 'bi bi-check-circle',      file: '', dims: [16, 16], desc: 'Toast: successo',                          location: 'Toast' },
    { id: 'toast-error',        type: 'bootstrap', iconClass: 'bi bi-x-circle',          file: '', dims: [16, 16], desc: 'Toast: errore',                            location: 'Toast' },
    { id: 'toast-info',         type: 'bootstrap', iconClass: 'bi bi-info-circle',       file: '', dims: [16, 16], desc: 'Toast: info',                              location: 'Toast' },
    { id: 'toast-warning',      type: 'bootstrap', iconClass: 'bi bi-exclamation-triangle', file: '', dims: [16, 16], desc: 'Toast: warning',                        location: 'Toast' }
];

// =============================================================================
// STATO ICONE
// =============================================================================

var ICON_CONFIG = {};  // { 'header-documenti': { type: 'png', file: 'folder.png', dims: [40, 40] }, ... }

// =============================================================================
// INIZIALIZZAZIONE
// =============================================================================

/**
 * Carica la configurazione icone dal server.
 */
async function _loadIconConfig() {
    try {
        var resp = await fetch('/api/icone-config/');
        if (resp.ok) {
            var data = await resp.json();
            ICON_CONFIG = data.config || {};
        }
    } catch (e) {
        console.warn('Icon config: using defaults (could not load from server)', e.message);
    }
    _applyIconConfig();
}

/**
 * Applica la configurazione icone al DOM: sostituisce le icone in base ai toggle.
 * Per le icone impostate su 'png', sostituisce il <i> con un <img>.
 * Usa il campo `selector` (se presente) per targettare in modo univoco l'elemento;
 * altrimenti fallback sul selettore basato sulla classe Bootstrap.
 */
var _applyIconConfig = function _applyIconConfig() {
    for (var id in ICON_CONFIG) {
        if (!ICON_CONFIG.hasOwnProperty(id)) continue;
        var cfg = ICON_CONFIG[id];
        if (cfg.type !== 'png' || !cfg.file) continue;

        var icon = _findCatalogIcon(id);
        if (!icon) continue;

        var dims = cfg.dims || icon.dims || [40, 40];
        var imgUrl = '/static/caricamento/img/' + cfg.file;

        // Usa il selettore univoco se presente, altrimenti fallback sulla classe
        var selector;
        if (icon.selector) {
            selector = icon.selector;
        } else {
            selector = 'i.' + icon.iconClass.replace(/ /g, '.');
        }

        var elements;
        try {
            elements = document.querySelectorAll(selector);
        } catch (e) {
            console.warn('Icone: selettore non valido per ' + id + ': ' + selector, e.message);
            continue;
        }

        elements.forEach(function (el) {
            // Non sostituire icone dentro la modale stessa
            if (el.closest('#icone-manager-overlay')) return;
            // Skip non-<i> e non-<img> elements
            if (el.tagName !== 'I' && el.tagName !== 'IMG') return;

            var img = document.createElement('img');
            img.src = imgUrl;
            img.className = el.className;  // mantiene le classi per il CSS
            img.style.width = dims[0] + 'px';
            img.style.height = dims[1] + 'px';
            img.style.objectFit = 'contain';
            img.alt = '';
            // Per header-cat-icon
            if (el.classList.contains('header-cat-icon')) {
                img.classList.add('header-cat-icon');
            }
            el.parentNode.replaceChild(img, el);
        });
    }
}

function _findCatalogIcon(id) {
    for (var i = 0; i < ICON_CATALOG.length; i++) {
        if (ICON_CATALOG[i].id === id) return ICON_CATALOG[i];
    }
    return null;
}

// =============================================================================
// MODALE GESTIONE ICONE
// =============================================================================

/**
 * Apre la modale di gestione icone (solo admin).
 */
function apriModaleIcone() {
    if (!W.user || !W.user.isStaff) {
        showToast('Accesso riservato agli amministratori.', 'warning');
        return;
    }

    // Costruisci il body della modale
    var html = '' +
        '<div class="icone-toolbar">' +
            '<div class="icone-toolbar-info">' +
                '<span class="icone-toolbar-count">' + ICON_CATALOG.length + ' icone nel catalogo</span>' +
            '</div>' +
            '<div class="icone-toolbar-actions">' +
                '<button class="btn btn-sm" id="icone-btn-refresh"><i class="bi bi-arrow-repeat"></i> Ricarica default</button>' +
                '<button class="btn btn-primary btn-sm" id="icone-btn-salva"><i class="bi bi-save"></i> Salva configurazione</button>' +
            '</div>' +
        '</div>' +
        '<div class="icone-table-wrap">' +
            '<table class="icone-table">' +
                '<thead>' +
                    '<tr>' +
                        '<th class="icone-col-preview">Bootstrap <span style="opacity:0.4;">|</span> PNG</th>' +
                        '<th class="icone-col-desc">Descrizione / Posizione</th>' +
                        '<th class="icone-col-type">Tipo</th>' +
                        '<th class="icone-col-file">File PNG</th>' +
                        '<th class="icone-col-dims">Dim. (px)</th>' +
                        '<th class="icone-col-toggle">Usa PNG</th>' +
                    '</tr>' +
                '</thead>' +
                '<tbody id="icone-table-body"></tbody>' +
            '</table>' +
        '</div>';

    // Usa la modale standard ma con classi custom per dimensioni maggiori
    DOM.modalTitle.textContent = 'Gestione Icone';
    DOM.modalBody.innerHTML = html;
    DOM.modalConfirm.textContent = 'Chiudi';
    DOM.modalConfirm.onclick = chiudiModaleIcone;
    DOM.modalCancel.style.display = 'none';
    DOM.modalClose.onclick = chiudiModaleIcone;
    DOM.modalOverlay.classList.remove('hidden');

    // Aggiungi classe per modale grande
    document.querySelector('.modal-container').classList.add('modal-icon-manager');

    // Popola la tabella
    _popolaTabellaIcone();

    // Eventi toolbar
    document.getElementById('icone-btn-refresh').addEventListener('click', _resetIconConfig);
    document.getElementById('icone-btn-salva').addEventListener('click', _salvaIconConfig);
}

function chiudiModaleIcone() {
    DOM.modalOverlay.classList.add('hidden');
    DOM.modalConfirm.onclick = null;
    DOM.modalConfirm.textContent = 'Conferma';
    DOM.modalCancel.style.display = '';
    var container = document.querySelector('.modal-container');
    if (container) container.classList.remove('modal-icon-manager');
}

// =============================================================================
// POPOLA TABELLA ICONE
// =============================================================================

function _popolaTabellaIcone() {
    var tbody = document.getElementById('icone-table-body');
    if (!tbody) return;

    var rowsHtml = '';
    ICON_CATALOG.forEach(function (icon) {
        var cfg = ICON_CONFIG[icon.id] || {};
        var isPng = cfg.type === 'png' || icon.type === 'png';

        // Preview icona: mostra SEMPRE Bootstrap + PNG affiancati
        var bootstrapPreview = '<i class="' + icon.iconClass + '" style="font-size:22px;"></i>';
        var pngPreview = '';
        var pngFile = cfg.file || icon.file || '';
        if (pngFile) {
            var pd = cfg.dims || icon.dims || [40, 40];
            pngPreview = '<img src="/static/caricamento/img/' + pngFile + '" style="width:' + pd[0] + 'px;height:' + pd[1] + 'px;object-fit:contain;" alt="">';
        } else {
            pngPreview = '<span class="icone-preview-png-empty">—</span>';
        }
        var previewHtml = '' +
            '<div class="icone-preview-dual">' +
                '<div class="icone-preview-bs">' + bootstrapPreview + '</div>' +
                '<div class="icone-preview-png">' + pngPreview + '</div>' +
            '</div>';

        var currentFile = cfg.file || icon.file || '';
        var currentDims = cfg.dims || icon.dims || [40, 40];

        rowsHtml += '' +
            '<tr class="icone-row" data-icon-id="' + icon.id + '">' +
                '<td class="icone-col-preview">' + previewHtml + '</td>' +
                '<td class="icone-col-desc">' +
                    '<strong>' + escapeHtml(icon.desc) + '</strong>' +
                    '<span class="icone-location">' + escapeHtml(icon.location) + '</span>' +
                '</td>' +
                '<td class="icone-col-type">' +
                    '<span class="icone-type-badge ' + (isPng ? 'icone-type-png' : 'icone-type-bootstrap') + '">' +
                        (isPng ? 'PNG' : 'Bootstrap') +
                    '</span>' +
                '</td>' +
                '<td class="icone-col-file">' +
                    '<div class="icone-file-row">' +
                        '<input type="text" class="form-input icone-file-input" value="' + escapeHtml(currentFile) + '" placeholder="es. icona.png">' +
                        '<label class="icone-upload-btn" title="Carica PNG">' +
                            '<i class="bi bi-cloud-arrow-up"></i>' +
                            '<input type="file" class="icone-file-upload" accept="image/png" style="display:none;">' +
                        '</label>' +
                    '</div>' +
                '</td>' +
                '<td class="icone-col-dims">' +
                    '<div class="icone-dims-row">' +
                        '<input type="number" class="form-input icone-dim-w" value="' + currentDims[0] + '" min="8" max="200" step="1" style="width:50px;">' +
                        '<span>x</span>' +
                        '<input type="number" class="form-input icone-dim-h" value="' + currentDims[1] + '" min="8" max="200" step="1" style="width:50px;">' +
                    '</div>' +
                '</td>' +
                '<td class="icone-col-toggle">' +
                    '<label class="icone-toggle-switch">' +
                        '<input type="checkbox" class="icone-toggle-input" ' + (isPng ? 'checked' : '') + '>' +
                        '<span class="icone-toggle-slider"></span>' +
                    '</label>' +
                '</td>' +
            '</tr>';
    });

    tbody.innerHTML = rowsHtml;

    // Eventi toggle
    tbody.querySelectorAll('.icone-toggle-input').forEach(function (input) {
        input.addEventListener('change', function () {
            var row = this.closest('.icone-row');
            var iconId = row.dataset.iconId;
            var icon = _findCatalogIcon(iconId);
            if (!icon) return;

            var isPng = this.checked;

            // Aggiorna badge tipo
            var badge = row.querySelector('.icone-type-badge');
            badge.textContent = isPng ? 'PNG' : 'Bootstrap';
            badge.className = 'icone-type-badge ' + (isPng ? 'icone-type-png' : 'icone-type-bootstrap');

            // Aggiorna solo il lato PNG dell'anteprima
            var pngSide = row.querySelector('.icone-preview-png');
            if (pngSide) {
                var fileInput = row.querySelector('.icone-file-input');
                var fn = fileInput.value.trim() || icon.file || '';
                var w = parseInt(row.querySelector('.icone-dim-w').value) || 40;
                var h = parseInt(row.querySelector('.icone-dim-h').value) || 40;
                if (fn) {
                    pngSide.innerHTML = '<img src="/static/caricamento/img/' + fn + '" style="width:' + w + 'px;height:' + h + 'px;object-fit:contain;" alt="">';
                } else {
                    pngSide.innerHTML = '<span class="icone-preview-png-empty">—</span>';
                }
            }
        });
    });

    // Eventi file upload
    tbody.querySelectorAll('.icone-file-upload').forEach(function (input) {
        input.addEventListener('change', function () {
            var row = this.closest('.icone-row');
            var file = this.files[0];
            if (!file) return;

            // Mostra nome file nell'input
            var fileInput = row.querySelector('.icone-file-input');
            fileInput.value = file.name;

            // Upload sempre, indipendentemente dal toggle
            _uploadIconFile(file, row);
        });
    });

    // Eventi cambio nome file (manuale)
    tbody.querySelectorAll('.icone-file-input').forEach(function (input) {
        input.addEventListener('change', function () {
            var row = this.closest('.icone-row');
            var fn = this.value.trim();
            var w = parseInt(row.querySelector('.icone-dim-w').value) || 40;
            var h = parseInt(row.querySelector('.icone-dim-h').value) || 40;
            var pngSide = row.querySelector('.icone-preview-png');
            if (pngSide) {
                if (fn) {
                    pngSide.innerHTML = '<img src="/static/caricamento/img/' + fn + '" style="width:' + w + 'px;height:' + h + 'px;object-fit:contain;" alt="">';
                } else {
                    pngSide.innerHTML = '<span class="icone-preview-png-empty">—</span>';
                }
            }
        });
    });

    // Eventi cambio dimensioni
    tbody.querySelectorAll('.icone-dim-w, .icone-dim-h').forEach(function (input) {
        input.addEventListener('change', function () {
            var row = this.closest('.icone-row');
            var w = parseInt(row.querySelector('.icone-dim-w').value) || 40;
            var h = parseInt(row.querySelector('.icone-dim-h').value) || 40;
            var pngSide = row.querySelector('.icone-preview-png');
            if (pngSide) {
                var img = pngSide.querySelector('img');
                if (img) {
                    img.style.width = w + 'px';
                    img.style.height = h + 'px';
                }
            }
        });
    });
}

// =============================================================================
// UPLOAD FILE PNG
// =============================================================================

async function _uploadIconFile(file, row) {
    try {
        var formData = new FormData();
        formData.append('file', file);

        var resp = await fetch('/api/icone-upload/', {
            method: 'POST',
            headers: { 'X-CSRFToken': getCSRFToken() },
            body: formData
        });

        if (!resp.ok) {
            var err = await resp.json();
            throw new Error(err.error || 'Upload fallito');
        }

        var data = await resp.json();
        showToast('File "' + data.filename + '" caricato!', 'success');

        // Aggiorna anteprima PNG
        var w = parseInt(row.querySelector('.icone-dim-w').value) || 40;
        var h = parseInt(row.querySelector('.icone-dim-h').value) || 40;
        var pngSide = row.querySelector('.icone-preview-png');
        if (pngSide) {
            pngSide.innerHTML = '<img src="/static/caricamento/img/' + data.filename + '" style="width:' + w + 'px;height:' + h + 'px;object-fit:contain;" alt="">';
        }
    } catch (e) {
        showToast('Errore upload: ' + e.message, 'error');
    }
}

// =============================================================================
// SALVATAGGIO / RESET CONFIGURAZIONE
// =============================================================================

function _raccogliConfigDallaTabella() {
    var config = {};
    var rows = document.querySelectorAll('#icone-table-body .icone-row');
    rows.forEach(function (row) {
        var iconId = row.dataset.iconId;
        var toggle = row.querySelector('.icone-toggle-input');
        var isPng = toggle.checked;
        var file = row.querySelector('.icone-file-input').value.trim();
        var w = parseInt(row.querySelector('.icone-dim-w').value) || 40;
        var h = parseInt(row.querySelector('.icone-dim-h').value) || 40;

        if (isPng || file) {
            config[iconId] = {
                type: isPng ? 'png' : 'bootstrap',
                file: file,
                dims: [w, h]
            };
        }
    });
    return config;
}

async function _salvaIconConfig() {
    var config = _raccogliConfigDallaTabella();
    try {
        var resp = await fetch('/api/icone-config/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
            body: JSON.stringify({ config: config })
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        ICON_CONFIG = config;
        showToast('Configurazione icone salvata! Ricarica la pagina per vedere le modifiche.', 'success');
    } catch (e) {
        showToast('Errore salvataggio: ' + e.message, 'error');
    }
}

function _resetIconConfig() {
    if (!confirm('Ripristinare tutte le icone ai valori predefiniti (Bootstrap Icons)?')) return;

    // Resetta tutti i toggle a off (Bootstrap)
    var toggles = document.querySelectorAll('#icone-table-body .icone-toggle-input');
    toggles.forEach(function (t) {
        t.checked = false;
        // Trigger change per aggiornare preview
        t.dispatchEvent(new Event('change'));
    });

    // Resetta file input e dimensioni
    ICON_CATALOG.forEach(function (icon) {
        var row = document.querySelector('#icone-table-body .icone-row[data-icon-id="' + icon.id + '"]');
        if (!row) return;
        row.querySelector('.icone-file-input').value = icon.file || '';
        row.querySelector('.icone-dim-w').value = (icon.dims || [40, 40])[0];
        row.querySelector('.icone-dim-h').value = (icon.dims || [40, 40])[1];
    });

    showToast('Configurazione ripristinata ai default. Clicca "Salva" per rendere effettivo.', 'info');
}

// =============================================================================
// INIZIALIZZAZIONE: chiamata da workspace.js dopo cacheDom()
// =============================================================================

/**
 * Inizializza il modulo icone: carica config e applica le sostituzioni.
 * Chiamata da inizializza() in workspace.js.
 */
function initIconManager() {
    _loadIconConfig();
}
