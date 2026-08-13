/**
 * Workspace Carico 3D — Gestione Icone (Admin only)
 *
 * Catalogo icone, modale di configurazione a 2 tab (Icone | Bottoni),
 * toggle emoji/PNG, upload file, salvataggio config su server,
 * applicazione live senza reload, validazione e cancellazione PNG.
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
    { id: 'header-icone',       type: 'bootstrap', iconClass: 'bi bi-palette',           file: '', dims: [20, 20], desc: 'Header: pulsante Gestione Icone (admin)',   location: 'Header',  selector: '#header-icone-btn > i' },

    // --- Header Logout ---
    { id: 'header-logout',      type: 'bootstrap', iconClass: 'bi bi-box-arrow-right',   file: '', dims: [16, 16], desc: 'Header: link Esci',                        location: 'Header',  selector: '#header-logout > i' },
    { id: 'header-logout-full', type: 'bootstrap', iconClass: 'bi bi-door-open',         file: '', dims: [16, 16], desc: 'Header: link Logout completo',              location: 'Header',  selector: '#header-logout-full > i' },

    // --- Header Logo ---
    { id: 'header-logo',        type: 'bootstrap', iconClass: 'bi bi-box-seam',          file: '', dims: [20, 20], desc: 'Header: logo Carico 3D',                   location: 'Header',  selector: '#header-logo > i' },

    // --- Sidebar Tabs ---
    { id: 'sidebar-nav',        type: 'bootstrap', iconClass: 'bi bi-compass',           file: '', dims: [18, 18], desc: 'Sidebar: tab Documenti',                   location: 'Sidebar', selector: '#sidebar-tabs .sidebar-tab[data-tab="documenti"] .sidebar-tab-icon' },
    { id: 'sidebar-anagrafica', type: 'bootstrap', iconClass: 'bi bi-journal-text',      file: '', dims: [18, 18], desc: 'Sidebar: tab Anagrafica',                  location: 'Sidebar', selector: '#sidebar-tabs .sidebar-tab[data-tab="anagrafica"] .sidebar-tab-icon' },
    { id: 'sidebar-manuale',    type: 'bootstrap', iconClass: 'bi bi-hand-index-thumb',  file: '', dims: [18, 18], desc: 'Sidebar: tab Manuale',                     location: 'Sidebar', selector: '#sidebar-tabs .sidebar-tab[data-tab="manuale"] .sidebar-tab-icon' },
    { id: 'sidebar-auto',       type: 'bootstrap', iconClass: 'bi bi-lightning-charge',  file: '', dims: [18, 18], desc: 'Sidebar: tab Automatica',                  location: 'Sidebar', selector: '#sidebar-tabs .sidebar-tab[data-tab="automatica"] .sidebar-tab-icon' },

    // --- Sidebar Navigazione Dinamica ---
    { id: 'nav-nuovo-carico',   type: 'bootstrap', iconClass: 'bi bi-file-earmark-plus', file: '', dims: [18, 18], desc: 'Sidebar Nav: Nuovo Carico',                location: 'Sidebar', selector: '.sidebar-nav-item[data-view="nuovo-carico"] > i' },
    { id: 'nav-apri-piano',     type: 'bootstrap', iconClass: 'bi bi-folder2',           file: '', dims: [18, 18], desc: 'Sidebar Nav: Apri Piano',                  location: 'Sidebar', selector: '.sidebar-nav-item[data-view="piani"] > i' },
    { id: 'nav-salva',          type: 'bootstrap', iconClass: 'bi bi-save',              file: '', dims: [18, 18], desc: 'Sidebar Nav: Salva',                       location: 'Sidebar', selector: '.sidebar-nav-item[data-view="salva-db"] > i' },
    { id: 'nav-esporta',        type: 'bootstrap', iconClass: 'bi bi-upload',            file: '', dims: [18, 18], desc: 'Sidebar Nav: Esporta',                     location: 'Sidebar', selector: '.sidebar-nav-item[data-view="export-file"] > i' },
    { id: 'nav-importa',        type: 'bootstrap', iconClass: 'bi bi-download',          file: '', dims: [18, 18], desc: 'Sidebar Nav: Importa',                     location: 'Sidebar', selector: '.sidebar-nav-item[data-view="import-file"] > i' },
    { id: 'nav-svuota',         type: 'bootstrap', iconClass: 'bi bi-trash',             file: '', dims: [18, 18], desc: 'Sidebar Nav: Svuota Carico',               location: 'Sidebar', selector: '.sidebar-nav-item[data-action="svuota-carico"] > i' },
    { id: 'nav-articoli',       type: 'bootstrap', iconClass: 'bi bi-box-seam',          file: '', dims: [18, 18], desc: 'Sidebar Nav: Articoli',                    location: 'Sidebar', selector: '.sidebar-nav-item[data-view="oggetti"] > i' },
    { id: 'nav-vincoli',        type: 'bootstrap', iconClass: 'bi bi-link-45deg',        file: '', dims: [18, 18], desc: 'Sidebar Nav: Vincoli',                     location: 'Sidebar', selector: '.sidebar-nav-item[data-view="vincoli-tra"] > i' },
    { id: 'nav-trasporti',      type: 'bootstrap', iconClass: 'bi bi-truck',             file: '', dims: [18, 18], desc: 'Sidebar Nav: Trasporti',                   location: 'Sidebar', selector: '.sidebar-nav-item[data-view="mezzi"] > i' },
    { id: 'nav-impostazioni',   type: 'bootstrap', iconClass: 'bi bi-sliders',           file: '', dims: [18, 18], desc: 'Sidebar Nav: Impostazioni',                location: 'Sidebar', selector: '.sidebar-nav-item[data-view="impostazioni"] > i' },
    { id: 'nav-admin',          type: 'bootstrap', iconClass: 'bi bi-shield-shaded',     file: '', dims: [18, 18], desc: 'Sidebar Nav: Pannello Admin',              location: 'Sidebar', selector: '#sidebar-nav-dynamic a.sidebar-nav-item > i.bi-shield-shaded' },
    { id: 'nav-esci',           type: 'bootstrap', iconClass: 'bi bi-box-arrow-right',   file: '', dims: [18, 18], desc: 'Sidebar Nav: Esci',                        location: 'Sidebar', selector: '#sidebar-nav-dynamic a.sidebar-nav-item > i.bi-box-arrow-right' },
    { id: 'nav-strum-nuovo',    type: 'bootstrap', iconClass: 'bi bi-file-earmark',      file: '', dims: [18, 18], desc: 'Sidebar Strumenti: Nuovo Carico',           location: 'Sidebar', selector: '.sidebar-nav-item[data-action="nuovo-carico"] > i' },
    { id: 'nav-pesi',           type: 'bootstrap', iconClass: 'bi bi-speedometer2',      file: '', dims: [18, 18], desc: 'Sidebar Strumenti: Distribuzione Pesi',      location: 'Sidebar', selector: '.sidebar-nav-item[data-action="grafico-pesi"] > i' },
    { id: 'nav-vista-carico',   type: 'bootstrap', iconClass: 'bi bi-bar-chart',         file: '', dims: [18, 18], desc: 'Sidebar Strumenti: Vista Carico',            location: 'Sidebar', selector: '.sidebar-nav-item[data-action="carico"] > i' },
    { id: 'nav-report-3d',      type: 'bootstrap', iconClass: 'bi bi-file-earmark',      file: '', dims: [18, 18], desc: 'Sidebar Nav: Report 3D (categoria Report)',  location: 'Sidebar', selector: '.sidebar-nav-item[data-action="report-3d"] > i' },
    { id: 'nav-quadranti',      type: 'bootstrap', iconClass: 'bi bi-grid-3x3-gap',      file: '', dims: [18, 18], desc: 'Sidebar Nav: Quadranti 2x2',               location: 'Sidebar', selector: '.sidebar-nav-item[data-action="report-quadranti"] > i' },

    // --- Pannello Impostazioni (renderizzato dinamicamente) ---
    { id: 'settings-title',              type: 'bootstrap', iconClass: 'bi bi-gear',              file: '', dims: [18, 18], desc: 'Impostazioni: titolo pannello',                    location: 'Impostazioni', selector: '.settings-impostazioni-icon' },
    { id: 'settings-strategia',          type: 'bootstrap', iconClass: 'bi bi-bullseye',          file: '', dims: [16, 16], desc: 'Impostazioni: Strategia di Ottimizzazione',       location: 'Impostazioni', selector: '.settings-strategia-icon' },
    { id: 'settings-output',             type: 'bootstrap', iconClass: 'bi bi-bar-chart',         file: '', dims: [16, 16], desc: 'Impostazioni: Output',                            location: 'Impostazioni', selector: '.settings-output-icon' },
    { id: 'settings-manuale',            type: 'bootstrap', iconClass: 'bi bi-hand-index-thumb',  file: '', dims: [16, 16], desc: 'Impostazioni: Parametri Modalità Manuale',        location: 'Impostazioni', selector: '.settings-manuale-icon' },
    { id: 'settings-algoritmo',          type: 'bootstrap', iconClass: 'bi bi-tools',             file: '', dims: [15, 15], desc: 'Impostazioni: Algoritmo 3D',                      location: 'Impostazioni', selector: '.settings-algoritmo-icon' },
    { id: 'settings-compattazione',      type: 'bootstrap', iconClass: 'bi bi-boxes',             file: '', dims: [15, 15], desc: 'Impostazioni: Compattazione aggressiva',          location: 'Impostazioni', selector: '.settings-compattazione-icon' },
    { id: 'settings-backtracking',       type: 'bootstrap', iconClass: 'bi bi-lightning-charge',  file: '', dims: [15, 15], desc: 'Impostazioni: Backtracking avanzato',             location: 'Impostazioni', selector: '.settings-backtracking-icon' },
    { id: 'settings-distribuzione',      type: 'bootstrap', iconClass: 'bi bi-speedometer2',      file: '', dims: [15, 15], desc: 'Impostazioni: Distribuzione pesi',                location: 'Impostazioni', selector: '.settings-distribuzione-icon' },
    { id: 'settings-output-etichette',   type: 'bootstrap', iconClass: 'bi bi-tags',              file: '', dims: [15, 15], desc: 'Impostazioni Output: Etichette oggetti',          location: 'Impostazioni', selector: '.settings-output-etichette-icon' },
    { id: 'settings-output-contenitore', type: 'bootstrap', iconClass: 'bi bi-box',               file: '', dims: [15, 15], desc: 'Impostazioni Output: Etichetta contenitore',      location: 'Impostazioni', selector: '.settings-output-contenitore-icon' },
    { id: 'settings-output-vuoti',       type: 'bootstrap', iconClass: 'bi bi-graph-down',        file: '', dims: [15, 15], desc: 'Impostazioni Output: Grafico pesi nei vuoti',     location: 'Impostazioni', selector: '.settings-output-vuoti-icon' },
    { id: 'settings-output-rotazione',   type: 'bootstrap', iconClass: 'bi bi-arrow-repeat',      file: '', dims: [15, 15], desc: 'Impostazioni Output: Modalità rotazione',         location: 'Impostazioni', selector: '.settings-output-rotazione-icon' },
    { id: 'settings-manuale-strategia',  type: 'bootstrap', iconClass: 'bi bi-box-arrow-in-down', file: '', dims: [15, 15], desc: 'Impostazioni Manuale: Strategia piazzamento',   location: 'Impostazioni', selector: '.settings-manuale-strategia-icon' },
    { id: 'settings-manuale-snap',       type: 'bootstrap', iconClass: 'bi bi-magnet',             file: '', dims: [15, 15], desc: 'Impostazioni Manuale: Snap griglia',             location: 'Impostazioni', selector: '.settings-manuale-snap-icon' },
    { id: 'settings-manuale-sporgenza', type: 'bootstrap', iconClass: 'bi bi-arrows-expand-vertical', file: '', dims: [15, 15], desc: 'Impostazioni Manuale: Sporgenza massima',       location: 'Impostazioni', selector: '.settings-manuale-sporgenza-icon' },

    // --- Sidebar Riepilogo ---
    { id: 'sidebar-mezzo',      type: 'bootstrap', iconClass: 'bi bi-truck',             file: '', dims: [18, 18], desc: 'Sidebar Riepilogo: icona mezzo',            location: 'Sidebar', selector: '#sidebar-mezzo-icon' },    // --- Palette flottante Vista (unica toolbar Vista) ---
    // Gli ID di configurazione vp-* restano stabili per non perdere le
    // configurazioni già salvate; i selettori puntano esclusivamente alla
    // palette visibile vpf-*.
    { id: 'vp-top',             type: 'bootstrap', iconClass: 'bi bi-arrow-up-square',   file: '', dims: [18, 18], desc: 'Palette Vista: vista dall\'alto',           location: 'Viewport', selector: '#vpf-btn-top > i' },
    { id: 'vp-front',           type: 'bootstrap', iconClass: 'bi bi-square',            file: '', dims: [18, 18], desc: 'Palette Vista: vista frontale',             location: 'Viewport', selector: '#vpf-btn-front > i' },
    { id: 'vp-side',            type: 'bootstrap', iconClass: 'bi bi-arrow-right-square',file: '', dims: [18, 18], desc: 'Palette Vista: vista laterale',             location: 'Viewport', selector: '#vpf-btn-side > i' },
    { id: 'vp-grid',            type: 'bootstrap', iconClass: 'bi bi-grid-3x3-gap',      file: '', dims: [18, 18], desc: 'Palette Vista: vista 2x2',                  location: 'Viewport', selector: '#vpf-btn-grid > i' },
    { id: 'vp-zoom-out',        type: 'bootstrap', iconClass: 'bi bi-zoom-out',          file: '', dims: [18, 18], desc: 'Palette Vista: zoom out',                  location: 'Viewport', selector: '#vpf-btn-zoom-out > i' },
    { id: 'vp-zoom-in',         type: 'bootstrap', iconClass: 'bi bi-zoom-in',           file: '', dims: [18, 18], desc: 'Palette Vista: zoom in',                   location: 'Viewport', selector: '#vpf-btn-zoom-in > i' },
    { id: 'vp-reset',           type: 'bootstrap', iconClass: 'bi bi-house',             file: '', dims: [18, 18], desc: 'Palette Vista: reset camera',              location: 'Viewport', selector: '#vpf-btn-reset > i' },
    { id: 'vp-fullscreen',      type: 'bootstrap', iconClass: 'bi bi-arrows-fullscreen', file: '', dims: [18, 18], desc: 'Palette Vista: fullscreen',               location: 'Viewport', selector: '#vpf-btn-fullscreen > i' },
    { id: 'vp-help',            type: 'bootstrap', iconClass: 'bi bi-question-circle',   file: '', dims: [18, 18], desc: 'Palette Vista: aiuto comandi',             location: 'Viewport', selector: '#vpf-btn-help > i' },
    { id: 'vp-rulers',          type: 'bootstrap', iconClass: 'bi bi-rulers',            file: '', dims: [18, 18], desc: 'Palette Vista: spaziatura',                location: 'Viewport', selector: '#vpf-btn-spaziatura > i' },

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
    { id: 'manuale-help-mouse', type: 'bootstrap', iconClass: 'bi bi-mouse',             file: '', dims: [16, 16], desc: 'Manuale: pulsante Aiuto Mouse (modale)',    location: 'Sidebar', selector: '#manuale-btn-help-mouse > .bi' },
    { id: 'manuale-help-tastiera', type: 'bootstrap', iconClass: 'bi bi-keyboard',       file: '', dims: [16, 16], desc: 'Manuale: pulsante Aiuto Tastiera (modale)', location: 'Sidebar', selector: '#manuale-btn-help-tastiera > .bi' },
    { id: 'manuale-impostazioni', type: 'bootstrap', iconClass: 'bi bi-gear',             file: '', dims: [16, 16], desc: 'Manuale: pulsante Impostazioni',             location: 'Sidebar', selector: '#manuale-btn-impostazioni > .bi' },

    // --- D-Pad ---
    { id: 'dpad-up',            type: 'bootstrap', iconClass: 'bi bi-chevron-up',        file: '', dims: [14, 14], desc: 'D-Pad: freccia su',                        location: 'Sidebar', selector: '#manuale-dpad-up > i' },
    { id: 'dpad-down',          type: 'bootstrap', iconClass: 'bi bi-chevron-down',      file: '', dims: [14, 14], desc: 'D-Pad: freccia giu',                       location: 'Sidebar', selector: '#manuale-dpad-down > i' },
    { id: 'dpad-left',          type: 'bootstrap', iconClass: 'bi bi-chevron-left',      file: '', dims: [14, 14], desc: 'D-Pad: freccia sinistra',                  location: 'Sidebar', selector: '#manuale-dpad-left > i' },
    { id: 'dpad-right',         type: 'bootstrap', iconClass: 'bi bi-chevron-right',     file: '', dims: [14, 14], desc: 'D-Pad: freccia destra',                    location: 'Sidebar', selector: '#manuale-dpad-right > i' },
    { id: 'dpad-confirm',       type: 'bootstrap', iconClass: 'bi bi-check-lg',          file: '', dims: [18, 18], desc: 'D-Pad: conferma posizione',                location: 'Sidebar', selector: '#manuale-dpad-confirm > i' },

    // I bottoni d'azione del tab Manuale, incluso Annulla ultima modifica,
    // sono configurabili esclusivamente in BUTTON_CATALOG (tab Bottoni).
    // Non duplicare il selettore qui: una doppia configurazione può
    // trasformare il PNG in Bootstrap durante ogni aggiornamento live.

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
// CATALOGO BOTTONI — bottoni azione dei tab Auto e Manuale
// =============================================================================

var BUTTON_CATALOG = [
    // --- Tab Auto (bottoni alti 52px) ---
    { id: 'auto-ottimizza', selector: '#btn-ottimizza',       iconSelRelative: 'i',          iconClass: 'bi bi-lightning-charge', extraClass: '',            label_default: 'OTTIMIZZA E SALVA',  location: 'Tab Auto',    dims_px: [30, 30], height_default: 52, label_size: 12, label_pos: 'row', color_default: '#447e9b' },
    { id: 'auto-salva',     selector: '#btn-salva-auto',      iconSelRelative: 'i',          iconClass: 'bi bi-save',              extraClass: '',            label_default: 'SALVA',              location: 'Tab Auto',    dims_px: [24, 24], height_default: 52, label_size: 12, label_pos: 'row', color_default: '#27ae60' },
    { id: 'auto-elabora',   selector: '#btn-elabora-auto',    iconSelRelative: 'i',          iconClass: 'bi bi-play-fill',         extraClass: '',            label_default: 'ELABORA',            location: 'Tab Auto',    dims_px: [24, 24], height_default: 52, label_size: 12, label_pos: 'row', color_default: '#6f42c1' },
    { id: 'auto-pesi',      selector: '#auto-btn-pesi',       iconSelRelative: 'i',          iconClass: 'bi bi-bar-chart-fill',    extraClass: '',            label_default: 'Distribuzione Pesi', location: 'Tab Auto',    dims_px: [26, 26], height_default: 52, label_size: 12, label_pos: 'row', color_default: '#17a2b8' },

    // --- Tab Manuale (bottoni alti 33px) ---
    { id: 'man-aggiungi',   selector: '#manuale-btn-aggiungi',  iconSelRelative: '.manuale-emoji', iconClass: '',                  extraClass: 'manuale-emoji', label_default: 'Aggiungi',            location: 'Tab Manuale', dims_px: [20, 20], height_default: 33, label_size: 12, label_pos: 'row', color_default: '#447e9b' },
    { id: 'man-rimuovi',    selector: '#manuale-btn-rimuovi',   iconSelRelative: '.manuale-emoji', iconClass: '',                  extraClass: 'manuale-emoji', label_default: 'Rimuovi',             location: 'Tab Manuale', dims_px: [20, 20], height_default: 33, label_size: 12, label_pos: 'row', color_default: '#e74c3c' },
    { id: 'man-pesi',       selector: '#manuale-btn-pesi',      iconSelRelative: '.manuale-emoji', iconClass: '',                  extraClass: 'manuale-emoji', label_default: 'Pesi',                location: 'Tab Manuale', dims_px: [20, 20], height_default: 33, label_size: 12, label_pos: 'row', color_default: '#6c757d' },
    { id: 'man-salva',      selector: '#manuale-btn-salva',     iconSelRelative: '.manuale-emoji', iconClass: '',                  extraClass: 'manuale-emoji', label_default: 'Salva',               location: 'Tab Manuale', dims_px: [20, 20], height_default: 33, label_size: 12, label_pos: 'row', color_default: '#27ae60' },
    { id: 'man-ghost',      selector: '#manuale-btn-ghost-toggle', iconSelRelative: '.manuale-emoji', iconClass: '',               extraClass: 'manuale-emoji', label_default: 'Ghost: OFF',          location: 'Tab Manuale', dims_px: [20, 20], height_default: 33, label_size: 12, label_pos: 'row', color_default: '#6c757d' },
    { id: 'man-annulla',    selector: '#manuale-btn-annulla-ghost', iconSelRelative: 'i',     iconClass: 'bi bi-arrow-counterclockwise', extraClass: '',            label_default: 'Annulla ultima modifica', location: 'Tab Manuale', dims_px: [18, 18], height_default: 33, label_size: 12, label_pos: 'row', color_default: '#6c757d' },

    // --- Tab Impostazioni (renderizzati dinamicamente) ---
    { id: 'settings-salva',  selector: '#btn-save-impostazioni',  iconSelRelative: 'i', iconClass: 'bi bi-save',                  extraClass: '', label_default: 'Salva impostazioni',  location: 'Tab Impostazioni', dims_px: [18, 18], height_default: 36, label_size: 12, label_pos: 'row', color_default: '#27ae60' },
    { id: 'settings-reset',  selector: '#btn-reset-impostazioni', iconSelRelative: 'i', iconClass: 'bi bi-arrow-counterclockwise', extraClass: '', label_default: 'Ripristina default', location: 'Tab Impostazioni', dims_px: [16, 16], height_default: 33, label_size: 12, label_pos: 'row', color_default: '#6c757d' },

    // --- Finestre Main View: Piani di carico ---
    // (bottoni generati dinamicamente all'apertura della vista: iconSelRelative
    // vuoto perché l'emoji è nel testo, non in un elemento dedicato)
    { id: 'win-piani-elimina',       selector: '#pv-batch-delete-piani',  iconSelRelative: '', iconClass: '', extraClass: '',            label_default: 'Elimina selezione',      emoji_default: '🗑', location: 'Finestre: Piani di carico', tab: 'finestre', dims_px: [20, 20], height_default: 33, label_size: 12, label_pos: 'row', color_default: '#e74c3c' },
    { id: 'win-piani-clear',         selector: '#pv-batch-clear-piani',   iconSelRelative: '', iconClass: '', extraClass: '',            label_default: '',                       emoji_default: '✕',  location: 'Finestre: Piani di carico', tab: 'finestre', dims_px: [16, 16], height_default: 33, label_size: 12, label_pos: 'row', color_default: '#6c757d' },
    { id: 'win-piani-salva-nome',    selector: '#pd-btn-salva-nome',      iconSelRelative: '', iconClass: '', extraClass: '',            label_default: '',                       emoji_default: '💾', location: 'Finestre: Piani di carico', tab: 'finestre', dims_px: [16, 16], height_default: 33, label_size: 12, label_pos: 'row', color_default: '#447e9b' },
    { id: 'win-piani-carica',        selector: '#pv-piano-carica',        iconSelRelative: '', iconClass: '', extraClass: '',            label_default: 'Carica nel viewport 3D', emoji_default: '📦', location: 'Finestre: Piani di carico', tab: 'finestre', dims_px: [20, 20], height_default: 36, label_size: 12, label_pos: 'row', color_default: '#447e9b' },
    { id: 'win-piani-delete',        selector: '#pv-piano-delete',        iconSelRelative: '', iconClass: '', extraClass: '',            label_default: 'Elimina piano',          emoji_default: '🗑', location: 'Finestre: Piani di carico', tab: 'finestre', dims_px: [20, 20], height_default: 36, label_size: 12, label_pos: 'row', color_default: '#e74c3c' },
    { id: 'win-piani-seleziona',     selector: '#pv-piano-seleziona',     iconSelRelative: '', iconClass: '', extraClass: '',            label_default: 'Seleziona questo mezzo', emoji_default: '🚛', location: 'Finestre: Piani di carico', tab: 'finestre', dims_px: [20, 20], height_default: 36, label_size: 12, label_pos: 'row', color_default: '#6c757d' },

    // --- Finestre Main View: Vincoli ---
    { id: 'win-vincoli-escludi',     selector: '#vt-btn-escludi',     iconSelRelative: '', iconClass: '', extraClass: '',            label_default: 'Escludi tutti',     emoji_default: '🚫', location: 'Finestre: Vincoli', tab: 'finestre', dims_px: [18, 18], height_default: 33, label_size: 12, label_pos: 'row', color_default: '#6c757d' },
    { id: 'win-vincoli-nuovo',       selector: '#vt-btn-new',         iconSelRelative: '', iconClass: '', extraClass: '',            label_default: 'Nuovo',             emoji_default: '➕', location: 'Finestre: Vincoli', tab: 'finestre', dims_px: [18, 18], height_default: 33, label_size: 12, label_pos: 'row', color_default: '#6c757d' },
    { id: 'win-vincoli-crea',        selector: '#vt-btn-create',      iconSelRelative: '', iconClass: '', extraClass: '',            label_default: 'Crea Vincolo',      emoji_default: '➕', location: 'Finestre: Vincoli', tab: 'finestre', dims_px: [18, 18], height_default: 36, label_size: 12, label_pos: 'row', color_default: '#447e9b' },
    { id: 'win-vincoli-aggiorna',    selector: '#vt-btn-update',      iconSelRelative: '', iconClass: '', extraClass: '',            label_default: 'Aggiorna Vincolo',  emoji_default: '💾', location: 'Finestre: Vincoli', tab: 'finestre', dims_px: [18, 18], height_default: 36, label_size: 12, label_pos: 'row', color_default: '#27ae60' },
    { id: 'win-vincoli-delete',      selector: '#vt-btn-delete',      iconSelRelative: '', iconClass: '', extraClass: '',            label_default: 'Elimina',           emoji_default: '🗑', location: 'Finestre: Vincoli', tab: 'finestre', dims_px: [18, 18], height_default: 36, label_size: 12, label_pos: 'row', color_default: '#e74c3c' },

    // --- Finestre Main View: Articoli ---
    { id: 'win-art-reset-vista',     selector: '#pv3d-btn-reset-vista',   iconSelRelative: '', iconClass: '', extraClass: '',            label_default: 'Reset vista',     emoji_default: '🏠', location: 'Finestre: Articoli', tab: 'finestre', dims_px: [16, 16], height_default: 33, label_size: 12, label_pos: 'row', color_default: '#6c757d' },
    { id: 'win-art-reset-oggetto',   selector: '#pv3d-btn-reset-oggetto', iconSelRelative: '', iconClass: '', extraClass: '',            label_default: 'Reset oggetto',   emoji_default: '↺', location: 'Finestre: Articoli', tab: 'finestre', dims_px: [16, 16], height_default: 33, label_size: 12, label_pos: 'row', color_default: '#6c757d' },
    { id: 'win-art-delete',          selector: '#pv-batch-delete',        iconSelRelative: '', iconClass: '', extraClass: '',            label_default: 'Elimina selezione', emoji_default: '🗑', location: 'Finestre: Articoli', tab: 'finestre', dims_px: [18, 18], height_default: 33, label_size: 12, label_pos: 'row', color_default: '#e74c3c' },
    { id: 'win-art-vincoli',         selector: '#pv-batch-vincoli',       iconSelRelative: '', iconClass: '', extraClass: '',            label_default: 'Vincoli',         emoji_default: '🔧', location: 'Finestre: Articoli', tab: 'finestre', dims_px: [18, 18], height_default: 33, label_size: 12, label_pos: 'row', color_default: '#447e9b' },
    { id: 'win-art-clear',           selector: '#pv-batch-clear',         iconSelRelative: '', iconClass: '', extraClass: '',            label_default: '',                 emoji_default: '✕',  location: 'Finestre: Articoli', tab: 'finestre', dims_px: [16, 16], height_default: 33, label_size: 12, label_pos: 'row', color_default: '#6c757d' },
    { id: 'win-art-nuovo',           selector: '#pv-ogg-nuovo',           iconSelRelative: '', iconClass: '', extraClass: '',            label_default: 'Nuovo',            emoji_default: '➕', location: 'Finestre: Articoli', tab: 'finestre', dims_px: [18, 18], height_default: 36, label_size: 12, label_pos: 'row', color_default: '#6c757d' },
    { id: 'win-art-salva',           selector: '#pv-ogg-save',            iconSelRelative: '', iconClass: '', extraClass: '',            label_default: 'Salva',             emoji_default: '💾', location: 'Finestre: Articoli', tab: 'finestre', dims_px: [18, 18], height_default: 36, label_size: 12, label_pos: 'row', color_default: '#447e9b' },
    { id: 'win-art-delete-ogg',      selector: '#pv-ogg-delete',          iconSelRelative: '', iconClass: '', extraClass: '',            label_default: 'Elimina oggetto',   emoji_default: '🗑', location: 'Finestre: Articoli', tab: 'finestre', dims_px: [18, 18], height_default: 36, label_size: 12, label_pos: 'row', color_default: '#e74c3c' },
    { id: 'win-art-batch-annulla',   selector: '#modal-batch-cancel',     iconSelRelative: '', iconClass: '', extraClass: '',            label_default: 'Annulla',           emoji_default: '✕',  location: 'Finestre: Articoli', tab: 'finestre', dims_px: [18, 18], height_default: 36, label_size: 12, label_pos: 'row', color_default: '#6c757d' },
    { id: 'win-art-batch-applica',   selector: '#modal-batch-save',       iconSelRelative: '', iconClass: '', extraClass: '',            label_default: 'Applica',           emoji_default: '💾', location: 'Finestre: Articoli', tab: 'finestre', dims_px: [18, 18], height_default: 36, label_size: 12, label_pos: 'row', color_default: '#447e9b' },

    // --- Finestre Main View: Trasporti ---
    { id: 'win-trasp-delete',        selector: '#pv-batch-delete-mezzi',  iconSelRelative: '', iconClass: '', extraClass: '',            label_default: 'Elimina selezione', emoji_default: '🗑', location: 'Finestre: Trasporti', tab: 'finestre', dims_px: [18, 18], height_default: 33, label_size: 12, label_pos: 'row', color_default: '#e74c3c' },
    { id: 'win-trasp-clear',         selector: '#pv-batch-clear-mezzi',   iconSelRelative: '', iconClass: '', extraClass: '',            label_default: '',                 emoji_default: '✕',  location: 'Finestre: Trasporti', tab: 'finestre', dims_px: [16, 16], height_default: 33, label_size: 12, label_pos: 'row', color_default: '#6c757d' },
    { id: 'win-trasp-nuovo',         selector: '#pv-mezzo-nuovo',         iconSelRelative: '', iconClass: '', extraClass: '',            label_default: 'Nuovo',            emoji_default: '➕', location: 'Finestre: Trasporti', tab: 'finestre', dims_px: [18, 18], height_default: 36, label_size: 12, label_pos: 'row', color_default: '#6c757d' },
    { id: 'win-trasp-salva',         selector: '#pv-mezzo-save',          iconSelRelative: '', iconClass: '', extraClass: '',            label_default: 'Salva',             emoji_default: '💾', location: 'Finestre: Trasporti', tab: 'finestre', dims_px: [18, 18], height_default: 36, label_size: 12, label_pos: 'row', color_default: '#447e9b' },
    { id: 'win-trasp-delete-mezzo',  selector: '#pv-mezzo-delete',        iconSelRelative: '', iconClass: '', extraClass: '',            label_default: 'Elimina mezzo',     emoji_default: '🗑', location: 'Finestre: Trasporti', tab: 'finestre', dims_px: [18, 18], height_default: 36, label_size: 12, label_pos: 'row', color_default: '#e74c3c' }
];

// =============================================================================
// CATALOGO COLORI — colori di pannelli, header e slider (CSS variables)
// =============================================================================

// Colore di base usato per generare le tonalità coordinate (default: acciaio attuale)
var COLOR_BASE_DEFAULT = '#447e9b';

var COLOR_CATALOG = [
    // --- Aree ---
    { id: 'header',        variable: '--color-header',        label: 'Header',             group: 'aree',  def: '#1a1a2e' },
    { id: 'sidebar',       variable: '--color-sidebar-bg',   label: 'Sidebar',            group: 'aree',  def: '#f5f5f5' },
    { id: 'panel-bg',      variable: '--color-panel-bg',     label: 'Pannelli tab',       group: 'aree',  def: '#fafafa' },
    { id: 'panel-border',  variable: '--color-panel-border', label: 'Bordi pannelli',     group: 'aree',  def: '#dddddd' },
    { id: 'main-bg',       variable: '--color-bg',           label: 'Main view',          group: 'aree',  def: '#f0f2f5' },
    { id: 'accent',        variable: '--color-accent',       label: 'Accento',            group: 'aree',  def: '#447e9b' },
    { id: 'accent-hover',  variable: '--color-accent-hover', label: 'Accento hover',      group: 'aree',  def: '#5095b5' },

    // --- Slider ---
    { id: 'slider-track-start',  variable: '--color-slider-track-start',  label: 'Traccia inizio',             group: 'slider', def: '#e8ecf2' },
    { id: 'slider-track',        variable: '--color-slider-track-end',    label: 'Traccia spaziatura',         group: 'slider', def: '#447e9b' },
    { id: 'slider-thumb',        variable: '--color-slider-thumb',        label: 'Manopola spaziatura',        group: 'slider', def: '#447e9b' },
    { id: 'strategia-thumb',     variable: '--color-strategia-thumb',     label: 'Manopola strategia',         group: 'slider', def: '#447e9b' },
    { id: 'slider-sequence-bg',  variable: '--color-slider-sequence-bg', label: 'Sfondo slider sequenza oggetti', group: 'slider', def: '#1f3946' }
];

// =============================================================================
// STATO ICONE / BOTTONI / COLORI
// =============================================================================

var ICON_CONFIG = {};      // { 'header-documenti': { type: 'png', file: 'folder.png', dims: [40, 40] }, ... }
var BOTTONI_CONFIG = {};   // { 'auto-ottimizza': { type, file, dims_px, label, label_size, label_pos, color }, ... }
var COLOR_CONFIG = {};     // { 'header': '#1a1a2e', ... }

// Snapshot dell'HTML originale dei bottoni (prima di ogni applicazione config)
var _btnSnapshot = {};

// Flag anti-loop per il MutationObserver: evita di riapplicare la config
// mentre l'applicazione stessa sta modificando il DOM.
var _iconApplying = false;

// =============================================================================
// INIZIALIZZAZIONE
// =============================================================================

function _findCatalogIcon(id) {
    for (var i = 0; i < ICON_CATALOG.length; i++) {
        if (ICON_CATALOG[i].id === id) return ICON_CATALOG[i];
    }
    return null;
}

function _findCatalogButton(id) {
    for (var i = 0; i < BUTTON_CATALOG.length; i++) {
        if (BUTTON_CATALOG[i].id === id) return BUTTON_CATALOG[i];
    }
    return null;
}

/** Conta i bottoni del catalogo appartenenti a un tab ('tab' o 'finestre'). */
function _countCatalogButtons(tab) {
    var n = 0;
    for (var i = 0; i < BUTTON_CATALOG.length; i++) {
        if ((BUTTON_CATALOG[i].tab || 'tab') === tab) n++;
    }
    return n;
}

/**
 * Legge la configurazione icone inline dal template (json_script
 * #icon-config-data, iniettata dal server nella pagina). Funzione SINCROMA:
 * disponibile subito, senza fetch, quindi niente flash di icone Bootstrap
 * al primo paint. Restituisce true se i dati inline sono stati caricati.
 */
function _applicaConfigInline() {
    var inlineEl = document.getElementById('icon-config-data');
    if (!inlineEl || !inlineEl.textContent) return false;
    try {
        var inlineData = JSON.parse(inlineEl.textContent);
        ICON_CONFIG = inlineData.config || {};
        BOTTONI_CONFIG = inlineData.bottoni || {};
        COLOR_CONFIG = inlineData.colori || {};
        return true;
    } catch (e) {
        console.warn('Icon config: dati inline non validi, uso la fetch', e.message);
        return false;
    }
}

/**
 * Rende visibili le icone: rimuove la classe anti-flash icons-not-ready
 * da <html>. Chiamata subito dopo la prima applicazione della config;
 * un timer di sicurezza in initIconManager garantisce il reveal anche
 * se qualcosa va storto (mai icone nascoste per sempre).
 */
function _mostraIcone() {
    var h = document.documentElement;
    if (h && h.classList.contains('icons-not-ready')) {
        h.classList.remove('icons-not-ready');
    }
}

/**
 * Carica la configurazione icone + bottoni + colori.
 *
 * La fonte primaria è la config inline nel template (sincrona, via
 * _applicaConfigInline). La fetch a /api/icone-config/ resta solo come
 * fallback (es. se il tag manca o il JSON inline non è valido).
 * In entrambi i casi, al termine rende visibili le icone (_mostraIcone).
 */
async function _loadIconConfig() {
    if (_applicaConfigInline()) {
        _applyIconConfig();
        _applyButtonConfig();
        _applyColorConfig();
        _mostraIcone();
        return;
    }
    try {
        var resp = await fetch('/api/icone-config/');
        if (resp.ok) {
            var data = await resp.json();
            ICON_CONFIG = data.config || {};
            BOTTONI_CONFIG = data.bottoni || {};
            COLOR_CONFIG = data.colori || {};
        }
    } catch (e) {
        console.warn('Icon config: using defaults (could not load from server)', e.message);
    }
    _applyIconConfig();
    _applyButtonConfig();
    _applyColorConfig();
    _mostraIcone();
}

/**
 * Trova gli elementi su cui agire per un'icona, sia che siano ancora <i>
 * sia che siano già stati sostituiti con <img> (necessario per applicare
 * le modifiche live senza ricaricare la pagina).
 */
function _trovaElementiIcona(icon) {
    var els = [];
    if (icon.selector) {
        // Prova prima il selettore originale (elementi ancora <i>)
        try {
            els = Array.prototype.slice.call(document.querySelectorAll(icon.selector));
        } catch (e) { /* selettore non valido */ }
        // Se non trova nulla, prova la versione senza tag (per elementi già <img>)
        // Sostituisce il tag <i> con * sia quando è seguito da . # [ sia quando
        // è l'ultimo token del selettore (es. #vpf-btn-top > i → #vpf-btn-top *).
        if (els.length === 0) {
            var tagless = icon.selector
                .replace(/(^|[\s>])i(?=[.#\[]|$)/g, '$1*')
                .replace(/\s*>\s*\*/g, ' *');
            try {
                els = Array.prototype.slice.call(document.querySelectorAll(tagless));
            } catch (e2) { /* ignora */ }
        }
    } else {
        var cls = icon.iconClass.replace(/ /g, '.');
        try {
            els = Array.prototype.slice.call(document.querySelectorAll('i.' + cls + ', img.' + cls));
        } catch (e) { /* ignora */ }
    }
    // Filtra solo elementi icona (I o IMG) e fuori dalla modale
    return els.filter(function (el) {
        if (el.tagName !== 'I' && el.tagName !== 'IMG') return false;
        if (el.closest && el.closest('#icone-manager-overlay')) return false;
        return true;
    });
}

/**
 * Applica la configurazione icone al DOM. Prima RIPRISTINA le icone
 * Bootstrap (per gli elementi già sostituiti con <img>), poi riapplica
 * i PNG configurati: così funziona anche live, senza reload.
 */
var _applyIconConfig = function _applyIconConfig() {
    var applicate = 0;
    var configurateNonTrovate = [];

    ICON_CATALOG.forEach(function (icon) {
        var cfg = ICON_CONFIG[icon.id];
        var elements = _trovaElementiIcona(icon);

        // Quando la configurazione torna a Bootstrap, ripristina l'<i>.
        if (!cfg || cfg.type !== 'png' || !cfg.file) {
            elements.forEach(function (el) {
                if (el.tagName === 'IMG') {
                    var i = document.createElement('i');
                    i.className = el.className;
                    i.id = el.id;
                    el.parentNode.replaceChild(i, el);
                }
            });
            return;
        }

        // La configurazione è PNG: se l'elemento è già un'immagine lo
        // aggiorniamo in-place. Questo rende l'applicazione idempotente e
        // consente al MutationObserver di gestire anche icone dinamiche
        // senza creare un ciclo infinito di sostituzioni DOM.
        if (elements.length === 0) {
            configurateNonTrovate.push({ id: icon.id, selector: icon.selector });
            return;
        }

        var dims = cfg.dims || icon.dims || [40, 40];
        var imgUrl = _urlPng(cfg.file);

        elements.forEach(function (el) {
            if (el.closest && el.closest('#icone-manager-overlay')) return;
            var img = el;
            if (el.tagName !== 'IMG') {
                img = document.createElement('img');
                el.parentNode.replaceChild(img, el);
            }
            img.src = imgUrl;
            img.className = el.className;
            img.id = el.id;
            img.style.width = dims[0] + 'px';
            img.style.height = dims[1] + 'px';
            img.style.objectFit = 'contain';
            img.style.flexShrink = '0';
            // L'immagine è solo l'icona: il click deve sempre raggiungere
            // il bottone padre, anche quando il PNG copre tutta l'area visiva.
            img.style.pointerEvents = 'none';
            img.alt = '';
            img.dataset.iconConfigFile = cfg.file;
            if (el.classList.contains('header-cat-icon')) {
                img.classList.add('header-cat-icon');
            }
            applicate += 1;
        });
    });

    if (configurateNonTrovate.length > 0) {
        console.warn('[Gestione Icone] PNG configurati ma non trovati nel DOM:', configurateNonTrovate);
    }
    console.info('[Gestione Icone] Icone PNG applicate:', applicate,
        '| configurate non trovate:', configurateNonTrovate.length);
};

/**
 * Applica la configurazione bottoni al DOM (live, senza reload).
 * Per ogni bottone: ripristina il default, poi applica icona PNG (con
 * dimensioni in %), testo personalizzato, dimensione testo e posizione.
 */
var _applyButtonConfig = function _applyButtonConfig(force) {
    if (_iconApplying) return;
    _iconApplying = true;
    try {
        _applyButtonConfigInner(!!force);
    } finally {
        _iconApplying = false;
    }
};

var _applyButtonConfigInner = function _applyButtonConfigInner(force) {
    var bottoniApplicati = 0;
    var bottoniNonTrovati = [];
    var bottoniStaticiNonTrovati = [];
    var bottoniDinamiciNonPresenti = [];

    BUTTON_CATALOG.forEach(function (btnDef) {
        var el = document.querySelector(btnDef.selector);
        var cfg = BOTTONI_CONFIG[btnDef.id] || {};
        var configurato = Object.keys(cfg).length > 0;
        if (!el) {
            if (configurato) {
                var dettaglioMancante = {
                    id: btnDef.id,
                    selector: btnDef.selector,
                };
                bottoniNonTrovati.push(dettaglioMancante);
                if (btnDef.tab === 'finestre') {
                    bottoniDinamiciNonPresenti.push(dettaglioMancante);
                } else {
                    bottoniStaticiNonTrovati.push(dettaglioMancante);
                }
            }
            return;
        }
        // Ghost è un toggle con stato runtime: la Gestione Icone può
        // configurarne icona, dimensioni e stile, ma non deve ripristinare
        // ogni volta la scritta statica "Ghost: OFF".
        var isGhostToggle = btnDef.id === 'man-ghost' &&
            typeof _ghostModeEnabled !== 'undefined';
        // L'osservatore dei bottoni dinamici può rilevare anche le modifiche
        // effettuate da questa stessa funzione. Evita di ricreare il bottone
        // quando la configurazione è già stata applicata: senza questo stato
        // il ripristino dell'innerHTML innesca un ciclo e fa lampeggiare i PNG.
        var appliedState = JSON.stringify(cfg) + '|' +
            (isGhostToggle ? String(_ghostModeEnabled) : '');
        // Aggiorna icone/Salva possono passare una mappa degli ID modificati:
        // bypassa la cache solo per quei bottoni. Il MutationObserver e i
        // bottoni invariati restano idempotenti, evitando nuovi lampeggi.
        var forzaApplicazione = force === true || !!(force && force[btnDef.id]);
        if (!forzaApplicazione && el.dataset.appliedIconState === appliedState) return;
        if (isGhostToggle) {
            var ghostLabel = (cfg.label || '').replace(/\s*:\s*(ON|OFF)\s*$/i, '').trim();
            if (ghostLabel) el.dataset.ghostLabel = ghostLabel;
            else delete el.dataset.ghostLabel;
        }

        // Ripristina il default prima di riapplicare. Per Ghost lasciamo
        // intatto il contenuto dinamico, altrimenti il MutationObserver
        // annulla immediatamente ogni cambio ON/OFF.
        if (!isGhostToggle && _btnSnapshot[btnDef.id] !== undefined) {
            el.innerHTML = _btnSnapshot[btnDef.id];
        }
        el.style.fontSize = '';
        el.style.display = '';
        el.style.flexDirection = '';
        el.style.justifyContent = '';
        el.style.alignItems = '';
        el.style.gap = '';
        el.style.backgroundColor = '';
        el.style.color = '';
        el.style.borderColor = '';
        el.style.boxShadow = '';
        el.style.width = '';
        el.style.height = '';
        el.style.margin = '';
        delete el.dataset.iconColor;

        var hasConfig = false;
        for (var k in cfg) {
            if (cfg.hasOwnProperty(k)) { hasConfig = true; break; }
        }
        if (!hasConfig) {
            el.dataset.appliedIconState = appliedState;
            return;
        }

        // L'elemento icona va catturato PRIMA di ogni sostituzione: dopo il
        // passaggio <i> → <img> il selettore tag-based (es. 'i') non matcha più.
        // Per i bottoni delle finestre (emoji nel testo) non esiste un
        // elemento icona separato: iconSelRelative è vuoto.
        var iconEl = btnDef.iconSelRelative ? el.querySelector(btnDef.iconSelRelative) : null;

        // Icona PNG (dimensione in px)
        if (cfg.type === 'png' && cfg.file) {
            var dims = cfg.dims_px || _legacyDimsPx(btnDef, cfg) || btnDef.dims_px || [24, 24];
            // Mantiene un vero <img> per garantire che il PNG sia sempre
            // visibile. Il click passa comunque al bottone padre.
            var img = document.createElement('img');
            img.src = _urlPng(cfg.file);
            img.className = iconEl ? iconEl.className : (btnDef.extraClass || '');
            img.style.width = dims[0] + 'px';
            img.style.height = dims[1] + 'px';
            img.style.objectFit = 'contain';
            img.style.flexShrink = '0';
            img.style.pointerEvents = 'none';
            img.alt = '';
            if (iconEl) {
                iconEl.parentNode.replaceChild(img, iconEl);
            } else {
                // Nessun elemento icona: il contenuto è testo/emoji, lo
                // sostituiamo interamente con l'immagine PNG.
                el.textContent = '';
                el.appendChild(img);
            }
            iconEl = img;   // aggiorna il riferimento per la fase label
        }

        // Testo personalizzato (mantiene l'elemento icona)
        if (cfg.label && !isGhostToggle) {
            if (iconEl) {
                var nodes = Array.prototype.slice.call(el.childNodes);
                nodes.forEach(function (n) {
                    if (n.nodeType === 3) el.removeChild(n);
                    else if (n !== iconEl) el.removeChild(n);
                });
            } else {
                el.textContent = '';
            }
            el.appendChild(document.createTextNode(cfg.label));
        }

        // Dimensione testo, layout flex e posizione rispetto all'icona
        if (cfg.label_size) el.style.fontSize = cfg.label_size + 'px';
        el.style.display = 'flex';
        el.style.flexDirection = cfg.label_pos || 'row';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
        if (iconEl) el.style.gap = '6px';

        // Colore del bottone: sfondo + testo a contrasto + bordo/ombra scuriti.
        // Il data-icon-color attiva gli hover/active via filter nel CSS.
        if (cfg.color && _isHexColor(cfg.color) &&
            (!isGhostToggle || !_ghostModeEnabled)) {
            var dark = _darkenColor(cfg.color, 0.25);
            el.style.backgroundColor = cfg.color;
            el.style.color = _textColorFor(cfg.color);
            el.style.borderColor = dark;
            el.style.boxShadow = '0 2px 0 ' + dark + ', inset 0 1px 0 rgba(255,255,255,0.22)';
            el.dataset.iconColor = '1';
        }

        // Dimensioni del bottone: larghezza % (rispetto al contenitore) e
        // altezza px (override dell'altezza fissa 52/33). Larghezza < 100%
        // centra il bottone nel suo spazio con margin auto.
        if (cfg.width_pct) {
            el.style.width = cfg.width_pct + '%';
            el.style.margin = (cfg.width_pct < 100) ? '0 auto' : '';
        }
        if (cfg.height_px) {
            el.style.height = cfg.height_px + 'px';
        }
        el.dataset.appliedIconState = appliedState;
        bottoniApplicati += 1;
    });

    if (bottoniStaticiNonTrovati.length > 0) {
        console.warn('[Gestione Icone] Bottoni statici configurati ma non trovati nel DOM:', bottoniStaticiNonTrovati);
    }
    if (bottoniDinamiciNonPresenti.length > 0) {
        // Le finestre vengono create solo quando l'utente le apre: il
        // MutationObserver li catturerà e applicherà la configurazione.
        console.info('[Gestione Icone] Bottoni finestra in attesa di apertura:', bottoniDinamiciNonPresenti);
    }
    console.info('[Gestione Icone] Bottoni configurati applicati:', bottoniApplicati,
        '| non presenti ora:', bottoniNonTrovati.length);

    // Il bottone Undo ha uno stato runtime (tab Manuale, Ghost e cronologia):
    // la configurazione icone può ridisegnarlo, ma non deve perderne lo stato.
    if (typeof _aggiornaUndoManualeUI === 'function') _aggiornaUndoManualeUI();
};

// =============================================================================
// MODALE GESTIONE ICONE (tab Icone | Bottoni)
// =============================================================================

function apriModaleIcone() {
    if (!W.user || !W.user.isStaff) {
        showToast('Accesso riservato agli amministratori.', 'warning');
        return;
    }

    var html = '' +
        '<div class="icone-tabs" id="icone-tabs">' +
            '<button type="button" class="icone-tab active" data-icone-tab="icone"><i class="bi bi-grid"></i> Icone</button>' +
            '<button type="button" class="icone-tab" data-icone-tab="bottoni"><i class="bi bi-ui-radios"></i> Bottoni</button>' +
            '<button type="button" class="icone-tab" data-icone-tab="finestre"><i class="bi bi-window"></i> Bottoni Finestre</button>' +
            '<button type="button" class="icone-tab" data-icone-tab="colori"><i class="bi bi-palette2"></i> Colori</button>' +
        '</div>' +
        '<div class="icone-toolbar">' +
            '<div class="icone-toolbar-info">' +
                '<span class="icone-toolbar-count" id="icone-toolbar-count">' + ICON_CATALOG.length + ' icone · ' + _countCatalogButtons('tab') + ' bottoni · ' + _countCatalogButtons('finestre') + ' finestre · ' + COLOR_CATALOG.length + ' colori</span>' +
            '</div>' +
            '<div class="icone-toolbar-actions">' +
                '<button class="btn btn-sm" id="icone-btn-refresh" title="Ripristina i valori predefiniti della tabella (poi clicca Salva)"><i class="bi bi-arrow-repeat"></i> Ricarica default</button>' +
                '<button class="btn btn-sm" id="icone-btn-aggiorna" title="Applica subito le modifiche alla pagina, senza salvare"><i class="bi bi-arrow-clockwise"></i> Aggiorna icone</button>' +
                '<button class="btn btn-primary btn-sm" id="icone-btn-salva" title="Salva la configurazione su server e la applica subito"><i class="bi bi-save"></i> Salva configurazione</button>' +
            '</div>' +
        '</div>' +
        '<div class="icone-tab-panel active" data-icone-panel="icone">' +
            '<div class="icone-table-wrap">' +
                '<table class="icone-table">' +
                    '<thead><tr>' +
                        '<th class="icone-col-preview">Bootstrap <span style="opacity:0.4;">|</span> PNG</th>' +
                        '<th class="icone-col-desc">Descrizione / Posizione</th>' +
                        '<th class="icone-col-type">Tipo</th>' +
                        '<th class="icone-col-file">File PNG</th>' +
                        '<th class="icone-col-dims">Dim. (px)</th>' +
                        '<th class="icone-col-toggle">Usa PNG</th>' +
                    '</tr></thead>' +
                    '<tbody id="icone-table-body"></tbody>' +
                '</table>' +
            '</div>' +
        '</div>' +
        '<div class="icone-tab-panel" data-icone-panel="bottoni">' +
            '<div class="icone-table-wrap">' +
                '<table class="icone-table icone-table-bottoni">' +
                    '<thead><tr>' +
                        '<th class="bt-col-preview">Anteprima</th>' +
                        '<th class="bt-col-desc">Bottone</th>' +
                        '<th class="bt-col-file">Icona PNG</th>' +
                        '<th class="bt-col-dims">Dim. icona (px)<br><span class="bt-th-hint">larghezza × altezza</span></th>' +
                        '<th class="bt-col-btnsize">Dim. bottone<br><span class="bt-th-hint">larghezza % × altezza px</span></th>' +
                        '<th class="bt-col-label">Scritta</th>' +
                        '<th class="bt-col-labelsize">Dim. testo<br><span class="bt-th-hint">px</span></th>' +
                        '<th class="bt-col-pos">Posizione testo</th>' +
                        '<th class="bt-col-color">Colore<br><span class="bt-th-hint">sfondo bottone</span></th>' +
                        '<th class="bt-col-toggle">Usa PNG</th>' +
                    '</tr></thead>' +
                    '<tbody id="icone-table-body-bottoni"></tbody>' +
                '</table>' +
            '</div>' +
        '</div>' +
        '<div class="icone-tab-panel" data-icone-panel="finestre">' +
            '<div class="icone-table-wrap">' +
                '<table class="icone-table icone-table-bottoni">' +
                    '<thead><tr>' +
                        '<th class="bt-col-preview">Anteprima</th>' +
                        '<th class="bt-col-desc">Bottone</th>' +
                        '<th class="bt-col-file">Icona PNG</th>' +
                        '<th class="bt-col-dims">Dim. icona (px)<br><span class="bt-th-hint">larghezza × altezza</span></th>' +
                        '<th class="bt-col-btnsize">Dim. bottone<br><span class="bt-th-hint">larghezza % × altezza px</span></th>' +
                        '<th class="bt-col-label">Scritta</th>' +
                        '<th class="bt-col-labelsize">Dim. testo<br><span class="bt-th-hint">px</span></th>' +
                        '<th class="bt-col-pos">Posizione testo</th>' +
                        '<th class="bt-col-color">Colore<br><span class="bt-th-hint">sfondo bottone</span></th>' +
                        '<th class="bt-col-toggle">Usa PNG</th>' +
                    '</tr></thead>' +
                    '<tbody id="icone-table-body-bottoni-finestre"></tbody>' +
                '</table>' +
            '</div>' +
        '</div>' +
        '<div class="icone-tab-panel" data-icone-panel="colori">' +
            '<div class="colori-base-row" id="colori-base-row">' +
                '<span class="colori-base-swatch" id="colori-base-swatch"></span>' +
                '<label class="colori-base-label" for="colori-base-input">Colore di base</label>' +
                '<input type="color" class="colori-base-input" id="colori-base-input" title="Scegli il colore di riferimento">' +
                '<input type="text" class="form-input colori-base-hex" id="colori-base-hex" maxlength="7" placeholder="#rrggbb" title="Colore di riferimento">' +
                '<span class="colori-base-hint">genera tonalità coordinate per tutte le aree<br><small>per grigi puri usa #808080 o un grigio perfettamente neutro</small></span>' +
                '<button type="button" class="colori-base-gen" id="colori-base-gen"><i class="bi bi-magic"></i> Genera tonalità</button>' +
            '</div>' +
            '<div class="colori-preview">' +
                '<div class="colori-preview-title">Anteprima live</div>' +
                '<div class="colori-preview-stage">' +
                    '<div class="colori-preview-header"></div>' +
                    '<div class="colori-preview-body">' +
                        '<div class="colori-preview-sidebar">' +
                            '<div class="colori-preview-sidebar-tab"></div>' +
                            '<div class="colori-preview-sidebar-tab"></div>' +
                            '<div class="colori-preview-sidebar-tab active"></div>' +
                        '</div>' +
                        '<div class="colori-preview-main"></div>' +
                    '</div>' +
                '</div>' +
                '<div class="colori-preview-slider"></div>' +
            '</div>' +
            '<div class="colori-subtabs" id="colori-subtabs">' +
                '<button type="button" class="colori-subtab active" data-colori-subtab="aree">Aree</button>' +
                '<button type="button" class="colori-subtab" data-colori-subtab="slider">Slider</button>' +
            '</div>' +
            '<div class="colori-subpanel active" data-colori-subpanel="aree" id="colori-list-aree"></div>' +
            '<div class="colori-subpanel" data-colori-subpanel="slider" id="colori-list-slider"></div>' +
        '</div>';

    DOM.modalTitle.textContent = 'Gestione Icone';
    DOM.modalBody.innerHTML = html;
    DOM.modalConfirm.textContent = 'Chiudi';
    DOM.modalConfirm.onclick = chiudiModaleIcone;
    DOM.modalCancel.style.display = 'none';
    DOM.modalClose.onclick = chiudiModaleIcone;
    DOM.modalOverlay.classList.remove('hidden');

    var iconModal = document.querySelector('.modal-container');
    iconModal.classList.add('modal-icon-manager');
    _inizializzaDragModaleIcone(iconModal);

    // Tab switching
    document.querySelectorAll('#icone-tabs .icone-tab').forEach(function (tab) {
        tab.addEventListener('click', function () {
            var nome = this.dataset.iconeTab;
            document.querySelectorAll('#icone-tabs .icone-tab').forEach(function (t) {
                t.classList.toggle('active', t === tab);
            });
            document.querySelectorAll('.icone-tab-panel[data-icone-panel]').forEach(function (p) {
                p.classList.toggle('active', p.dataset.iconePanel === nome);
            });
        });
    });

    // Popola le tre tabelle
    _popolaTabellaIcone();
    _popolaTabellaBottoni('icone-table-body-bottoni', 'tab');
    _popolaTabellaBottoni('icone-table-body-bottoni-finestre', 'finestre');
    _popolaTabellaColori();

    // Sotto-tab Aree | Slider del tab Colori
    document.querySelectorAll('#colori-subtabs .colori-subtab').forEach(function (st) {
        st.addEventListener('click', function () {
            var nome = this.dataset.coloriSubtab;
            document.querySelectorAll('#colori-subtabs .colori-subtab').forEach(function (s) {
                s.classList.toggle('active', s === st);
            });
            document.querySelectorAll('.colori-subpanel[data-colori-subpanel]').forEach(function (p) {
                p.classList.toggle('active', p.dataset.coloriSubpanel === nome);
            });
        });
    });

    // Eventi toolbar
    document.getElementById('icone-btn-refresh').addEventListener('click', _resetIconConfig);
    document.getElementById('icone-btn-aggiorna').addEventListener('click', _aggiornaIconeLive);
    document.getElementById('icone-btn-salva').addEventListener('click', _salvaIconConfig);
}

function _inizializzaDragModaleIcone(container) {
    if (!container || container.dataset.dragInitialized === '1') return;

    var header = container.querySelector('.modal-header');
    if (!header) return;

    var dragging = false;
    var pointerOffsetX = 0;
    var pointerOffsetY = 0;

    function limita(valore, minimo, massimo) {
        return Math.min(Math.max(valore, minimo), massimo);
    }

    function iniziaDrag(e) {
        if (!container.classList.contains('modal-icon-manager')) return;
        // Il pulsante X deve chiudere la modale, non avviare il trascinamento.
        if (e.target.closest && e.target.closest('.modal-close')) return;
        if (e.button !== undefined && e.button !== 0) return;

        var rect = container.getBoundingClientRect();
        // Passa da flex-centering a coordinate esplicite solo al primo drag.
        container.style.left = rect.left + 'px';
        container.style.top = rect.top + 'px';
        container.style.transform = 'none';
        pointerOffsetX = e.clientX - rect.left;
        pointerOffsetY = e.clientY - rect.top;
        dragging = true;
        container.classList.add('modal-dragging');
        if (e.pointerId !== undefined && container.setPointerCapture) {
            container.setPointerCapture(e.pointerId);
        }
        e.preventDefault();
    }

    function spostaDrag(e) {
        if (!dragging) return;

        var maxLeft = Math.max(0, window.innerWidth - container.offsetWidth);
        var maxTop = Math.max(0, window.innerHeight - container.offsetHeight);
        container.style.left = limita(e.clientX - pointerOffsetX, 0, maxLeft) + 'px';
        container.style.top = limita(e.clientY - pointerOffsetY, 0, maxTop) + 'px';
    }

    function terminaDrag(e) {
        if (!dragging) return;
        dragging = false;
        container.classList.remove('modal-dragging');
        if (e && e.pointerId !== undefined && container.releasePointerCapture) {
            try { container.releasePointerCapture(e.pointerId); } catch (ignore) { /* già rilasciato */ }
        }
    }

    header.addEventListener('pointerdown', iniziaDrag);
    container.addEventListener('pointermove', spostaDrag);
    container.addEventListener('pointerup', terminaDrag);
    container.addEventListener('pointercancel', terminaDrag);
    container.dataset.dragInitialized = '1';
}

function chiudiModaleIcone() {
    DOM.modalOverlay.classList.add('hidden');
    DOM.modalConfirm.onclick = null;
    DOM.modalConfirm.textContent = 'Conferma';
    DOM.modalCancel.style.display = '';
    var container = document.querySelector('.modal-container');
    if (container) {
        container.classList.remove('modal-icon-manager', 'modal-dragging');
        container.style.removeProperty('left');
        container.style.removeProperty('top');
        container.style.removeProperty('transform');
    }
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

        var bootstrapPreview = '<i class="' + icon.iconClass + '" style="font-size:22px;"></i>';
        var pngPreview = '';
        var pngFile = cfg.file || icon.file || '';
        if (pngFile) {
            var pd = cfg.dims || icon.dims || [40, 40];
            pngPreview = '<img src="' + _urlPng(pngFile) + '" style="width:' + pd[0] + 'px;height:' + pd[1] + 'px;object-fit:contain;" alt="">';
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
                        '<button type="button" class="icone-del-btn" title="Elimina il file PNG dalla cartella img"><i class="bi bi-trash"></i></button>' +
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

    // Eventi toggle (con validazione file)
    tbody.querySelectorAll('.icone-toggle-input').forEach(function (input) {
        input.addEventListener('change', function () {
            var row = this.closest('.icone-row');
            var iconId = row.dataset.iconId;
            var icon = _findCatalogIcon(iconId);
            if (!icon) return;
            var isPng = this.checked;
            var fileInput = row.querySelector('.icone-file-input');
            var fn = fileInput.value.trim() || icon.file || '';

            if (isPng && !fn) {
                showToast('Indica il nome del file PNG prima di attivare il toggle.', 'warning');
                this.checked = false;
                return;
            }

            var self = this;
            _verificaFileEsiste(fn).then(function (esiste) {
                if (isPng && !esiste) {
                    showToast('File PNG non trovato: ' + fn, 'error');
                    self.checked = false;
                    return;
                }
                _aggiornaBadgeERigaIcona(row, isPng, fn);
            });
        });
    });

    // Eventi upload
    tbody.querySelectorAll('.icone-file-upload').forEach(function (input) {
        input.addEventListener('change', function () {
            var row = this.closest('.icone-row');
            var file = this.files[0];
            if (!file) return;
            row.querySelector('.icone-file-input').value = file.name;
            _uploadIconFile(file, row);
        });
    });

    // Eventi cambio nome file
    tbody.querySelectorAll('.icone-file-input').forEach(function (input) {
        input.addEventListener('change', function () {
            var row = this.closest('.icone-row');
            _aggiornaAnteprimaPngRigaIcona(row);
        });
    });

    // Eventi dimensioni
    tbody.querySelectorAll('.icone-dim-w, .icone-dim-h').forEach(function (input) {
        input.addEventListener('change', function () {
            var row = this.closest('.icone-row');
            _aggiornaAnteprimaPngRigaIcona(row);
        });
    });

    // Eventi eliminazione file
    tbody.querySelectorAll('.icone-del-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var row = this.closest('.icone-row');
            var fn = row.querySelector('.icone-file-input').value.trim();
            _cancellaFileIcona(fn, row, 'icone');
        });
    });
}

function _aggiornaBadgeERigaIcona(row, isPng, fn) {
    var badge = row.querySelector('.icone-type-badge');
    badge.textContent = isPng ? 'PNG' : 'Bootstrap';
    badge.className = 'icone-type-badge ' + (isPng ? 'icone-type-png' : 'icone-type-bootstrap');
    var pngSide = row.querySelector('.icone-preview-png');
    if (pngSide) {
        var w = parseInt(row.querySelector('.icone-dim-w').value) || 40;
        var h = parseInt(row.querySelector('.icone-dim-h').value) || 40;
        if (isPng && fn) {
            pngSide.innerHTML = '<img src="' + _urlPng(fn) + '" style="width:' + w + 'px;height:' + h + 'px;object-fit:contain;" alt="">';
        } else {
            pngSide.innerHTML = '<span class="icone-preview-png-empty">—</span>';
        }
    }
}

function _aggiornaAnteprimaPngRigaIcona(row) {
    var pngSide = row.querySelector('.icone-preview-png');
    if (!pngSide) return;
    var fn = row.querySelector('.icone-file-input').value.trim();
    var w = parseInt(row.querySelector('.icone-dim-w').value) || 40;
    var h = parseInt(row.querySelector('.icone-dim-h').value) || 40;
    if (fn) {
        pngSide.innerHTML = '<img src="' + _urlPng(fn) + '" style="width:' + w + 'px;height:' + h + 'px;object-fit:contain;" alt="">';
    } else {
        pngSide.innerHTML = '<span class="icone-preview-png-empty">—</span>';
    }
}

// =============================================================================
// POPOLA TABELLA BOTTONI
// =============================================================================

function _posLabel(pos) {
    return {
        'row': 'Icona sx — testo dx',
        'row-reverse': 'Icona dx — testo sx',
        'column': 'Icona sopra — testo sotto',
        'column-reverse': 'Testo sopra — icona sotto'
    }[pos] || pos;
}

/** Valida un colore esadecimale #rrggbb. */
function _isHexColor(v) {
    return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim());
}

/**
 * Allinea i nomi ai file prodotti dall'endpoint di upload:
 * minuscolo, spazi trasformati in underscore e nessun percorso.
 */
function _normalizzaNomeFilePng(nome) {
    var file = String(nome || '').trim();
    try { file = decodeURIComponent(file); } catch (e) { /* nome già decodificato */ }
    file = file.split(/[\\/]/).pop();
    return file.toLowerCase().replace(/\\s+/g, '_').replace(/\\.\\.+/g, '');
}

function _urlPng(nome) {
    var file = _normalizzaNomeFilePng(nome);
    return file ? '/static/caricamento/img/' + encodeURIComponent(file) : '';
}

/** Sceglie il colore del testo (scuro/chiaro) in base alla luminanza dello sfondo. */
function _textColorFor(hex) {
    hex = String(hex).trim();
    var r = parseInt(hex.substr(1, 2), 16);
    var g = parseInt(hex.substr(3, 2), 16);
    var b = parseInt(hex.substr(5, 2), 16);
    var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.6 ? '#1f2937' : '#ffffff';
}

/** Scurisce un colore esadecimale di una percentuale (0-1) per bordo/ombra 3D. */
function _darkenColor(hex, amt) {
    hex = String(hex).trim();
    var out = '#';
    for (var i = 1; i <= 5; i += 2) {
        var v = Math.max(0, Math.round(parseInt(hex.substr(i, 2), 16) * (1 - amt)));
        out += (v < 16 ? '0' : '') + v.toString(16);
    }
    return out;
}

/**
 * Converte le vecchie dimensioni percentuali (dims_pct, formato precedente)
 * in pixel usando la dimensione reale del bottone nel DOM, se disponibile.
 * Restituisce null se non c'è nulla da convertire.
 */
function _legacyDimsPx(btnDef, cfg) {
    if (!cfg || !cfg.dims_pct) return null;
    var el = document.querySelector(btnDef.selector);
    var bw = (el && el.offsetWidth) || 150;
    var bh = (el && el.offsetHeight) || 50;
    return [
        Math.max(8, Math.round((Number(cfg.dims_pct[0]) || 0) / 100 * bw)),
        Math.max(8, Math.round((Number(cfg.dims_pct[1]) || 0) / 100 * bh))
    ];
}

function _popolaTabellaBottoni(tbodyId, tab) {
    var tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    var rowsHtml = '';
    BUTTON_CATALOG.forEach(function (btnDef) {
        if ((btnDef.tab || 'tab') !== tab) return;
        var cfg = BOTTONI_CONFIG[btnDef.id] || {};
        var isPng = cfg.type === 'png' && cfg.file;
        var file = cfg.file || '';
        var dims = cfg.dims_px || _legacyDimsPx(btnDef, cfg) || btnDef.dims_px || [24, 24];
        var label = (cfg.label !== undefined && cfg.label !== null) ? cfg.label : btnDef.label_default;
        var labelSize = cfg.label_size || btnDef.label_size || 12;
        var pos = cfg.label_pos || btnDef.label_pos || 'row';
        var color = (cfg.color && _isHexColor(cfg.color)) ? cfg.color : (btnDef.color_default || '#6c757d');
        var textColor = _textColorFor(color);
        var btnW = cfg.width_pct || 100;
        var btnH = cfg.height_px || btnDef.height_default || 52;

        var iconPreview = '';
        if (isPng) {
            iconPreview = '<img src="' + _urlPng(file) + '" style="width:' + dims[0] + 'px;height:' + dims[1] + 'px;object-fit:contain;" alt="">';
        } else if (btnDef.iconClass) {
            iconPreview = '<i class="' + btnDef.iconClass + '"></i>';
        } else if (btnDef.emoji_default) {
            iconPreview = '<span class="manuale-emoji">' + btnDef.emoji_default + '</span>';
        } else {
            iconPreview = '<span class="manuale-emoji">🌟</span>';
        }

        rowsHtml += '' +
            '<tr class="icone-row" data-button-id="' + btnDef.id + '">' +
                '<td class="bt-col-preview">' +
                    '<div class="bt-preview-btn" data-preview-id="' + btnDef.id + '" style="flex-direction:' + pos + ';font-size:' + labelSize + 'px;background-color:' + color + ';color:' + textColor + ';width:' + btnW + '%;height:' + btnH + 'px;">' +
                        '<span class="bt-preview-icon">' + iconPreview + '</span>' +
                        '<span class="bt-preview-label">' + escapeHtml(label) + '</span>' +
                    '</div>' +
                '</td>' +
                '<td class="bt-col-desc">' +
                    '<strong>' + escapeHtml(btnDef.label_default) + '</strong>' +
                    '<span class="icone-location">' + escapeHtml(btnDef.location) + '</span>' +
                '</td>' +
                '<td class="bt-col-file">' +
                    '<div class="icone-file-row">' +
                        '<input type="text" class="form-input bt-file-input" value="' + escapeHtml(file) + '" placeholder="es. bottone.png">' +
                        '<label class="icone-upload-btn" title="Carica PNG">' +
                            '<i class="bi bi-cloud-arrow-up"></i>' +
                            '<input type="file" class="bt-file-upload" accept="image/png" style="display:none;">' +
                        '</label>' +
                        '<button type="button" class="icone-del-btn" title="Elimina il file PNG dalla cartella img"><i class="bi bi-trash"></i></button>' +
                    '</div>' +
                '</td>' +
                '<td class="bt-col-dims">' +
                    '<div class="icone-dims-row">' +
                        '<input type="number" class="form-input bt-dim-w" value="' + dims[0] + '" min="4" max="120" step="1">' +
                        '<span>px</span>' +
                        '<input type="number" class="form-input bt-dim-h" value="' + dims[1] + '" min="4" max="120" step="1">' +
                    '</div>' +
                '</td>' +
                '<td class="bt-col-btnsize">' +
                    '<div class="icone-dims-row">' +
                        '<input type="number" class="form-input bt-size-w" value="' + btnW + '" min="40" max="100" step="5">' +
                        '<span>%</span>' +
                        '<input type="number" class="form-input bt-size-h" value="' + btnH + '" min="20" max="120" step="1">' +
                        '<span>px</span>' +
                    '</div>' +
                '</td>' +
                '<td class="bt-col-label">' +
                    '<input type="text" class="form-input bt-label-input" value="' + escapeHtml(label) + '" placeholder="Testo bottone">' +
                '</td>' +
                '<td class="bt-col-labelsize">' +
                    '<input type="number" class="form-input bt-labelsize-input" value="' + labelSize + '" min="6" max="40" step="1" style="width:52px;">' +
                '</td>' +
                '<td class="bt-col-pos">' +
                    '<select class="form-select bt-pos-select">' +
                        '<option value="row"' + (pos === 'row' ? ' selected' : '') + '>Icona sx — testo dx</option>' +
                        '<option value="row-reverse"' + (pos === 'row-reverse' ? ' selected' : '') + '>Icona dx — testo sx</option>' +
                        '<option value="column"' + (pos === 'column' ? ' selected' : '') + '>Icona sopra — testo sotto</option>' +
                        '<option value="column-reverse"' + (pos === 'column-reverse' ? ' selected' : '') + '>Testo sopra — icona sotto</option>' +
                    '</select>' +
                '</td>' +
                '<td class="bt-col-color">' +
                    '<div class="icone-color-row">' +
                        '<input type="color" class="bt-color-input" value="' + color + '" title="Scegli il colore del bottone">' +
                        '<input type="text" class="form-input bt-color-hex" value="' + escapeHtml(color) + '" maxlength="7" placeholder="#rrggbb" title="Colore esadecimale">' +
                    '</div>' +
                '</td>' +
                '<td class="bt-col-toggle">' +
                    '<label class="icone-toggle-switch">' +
                        '<input type="checkbox" class="bt-toggle-input" ' + (isPng ? 'checked' : '') + '>' +
                        '<span class="icone-toggle-slider"></span>' +
                    '</label>' +
                '</td>' +
            '</tr>';
    });

    tbody.innerHTML = rowsHtml;

    // Toggle (con validazione file)
    tbody.querySelectorAll('.bt-toggle-input').forEach(function (input) {
        input.addEventListener('change', function () {
            var row = this.closest('.icone-row');
            var fileInput = row.querySelector('.bt-file-input');
            var fn = fileInput.value.trim();
            var isPng = this.checked;

            if (isPng && !fn) {
                showToast('Indica il nome del file PNG prima di attivare il toggle.', 'warning');
                this.checked = false;
                return;
            }
            var self = this;
            _verificaFileEsiste(fn).then(function (esiste) {
                if (isPng && !esiste) {
                    showToast('File PNG non trovato: ' + fn, 'error');
                    self.checked = false;
                    return;
                }
                _aggiornaAnteprimaBottone(row);
            });
        });
    });

    // Upload
    tbody.querySelectorAll('.bt-file-upload').forEach(function (input) {
        input.addEventListener('change', function () {
            var row = this.closest('.icone-row');
            var file = this.files[0];
            if (!file) return;
            row.querySelector('.bt-file-input').value = file.name;
            _uploadIconFile(file, row, true);
        });
    });

    // Cambi input → aggiorna anteprima
    tbody.querySelectorAll('.bt-file-input').forEach(function (input) {
        input.addEventListener('change', function () {
            _aggiornaAnteprimaBottone(this.closest('.icone-row'));
        });
    });
    tbody.querySelectorAll('.bt-dim-w, .bt-dim-h').forEach(function (input) {
        input.addEventListener('change', function () {
            _aggiornaAnteprimaBottone(this.closest('.icone-row'));
        });
    });
    tbody.querySelectorAll('.bt-size-w, .bt-size-h').forEach(function (input) {
        input.addEventListener('change', function () {
            _aggiornaAnteprimaBottone(this.closest('.icone-row'));
        });
    });
    tbody.querySelectorAll('.bt-label-input').forEach(function (input) {
        input.addEventListener('input', function () {
            var row = this.closest('.icone-row');
            var labelEl = row.querySelector('.bt-preview-label');
            if (labelEl) labelEl.textContent = this.value || '';
        });
    });
    tbody.querySelectorAll('.bt-labelsize-input').forEach(function (input) {
        input.addEventListener('change', function () {
            var row = this.closest('.icone-row');
            var prev = row.querySelector('.bt-preview-btn');
            if (prev) prev.style.fontSize = (this.value || 12) + 'px';
        });
    });
    tbody.querySelectorAll('.bt-pos-select').forEach(function (select) {
        select.addEventListener('change', function () {
            var row = this.closest('.icone-row');
            var prev = row.querySelector('.bt-preview-btn');
            if (prev) prev.style.flexDirection = this.value;
        });
    });

    // Colore: il picker aggiorna l'hex e viceversa (solo valori validi)
    tbody.querySelectorAll('.bt-color-input, .bt-color-hex').forEach(function (input) {
        input.addEventListener('input', function () {
            var row = this.closest('.icone-row');
            var picker = row.querySelector('.bt-color-input');
            var hex = row.querySelector('.bt-color-hex');
            var val = this === picker ? this.value : this.value.trim();

            if (!_isHexColor(val)) {
                if (this === hex && val.length === 7 && val.charAt(0) === '#') {
                    showToast('Colore non valido: usa il formato #rrggbb', 'warning');
                }
                return;
            }
            if (this === picker) hex.value = val;
            else picker.value = val;
            _aggiornaAnteprimaBottone(row);
        });
    });

    // Eliminazione file
    tbody.querySelectorAll('.icone-del-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var row = this.closest('.icone-row');
            var fn = row.querySelector('.bt-file-input').value.trim();
            _cancellaFileIcona(fn, row, 'bottoni');
        });
    });
}

function _aggiornaAnteprimaBottone(row) {
    var btnDef = _findCatalogButton(row.dataset.buttonId);
    if (!btnDef) return;
    var prev = row.querySelector('.bt-preview-btn');
    if (!prev) return;

    var isPng = row.querySelector('.bt-toggle-input').checked;
    var file = row.querySelector('.bt-file-input').value.trim();
    var defDims = btnDef.dims_px || [24, 24];
    var w = parseInt(row.querySelector('.bt-dim-w').value) || defDims[0];
    var h = parseInt(row.querySelector('.bt-dim-h').value) || defDims[1];
    var label = row.querySelector('.bt-label-input').value.trim();
    var labelSize = parseInt(row.querySelector('.bt-labelsize-input').value) || 12;
    var pos = row.querySelector('.bt-pos-select').value;
    var colorHex = row.querySelector('.bt-color-hex').value.trim();
    var color = _isHexColor(colorHex) ? colorHex : (btnDef.color_default || '#6c757d');
    var btnW = parseInt(row.querySelector('.bt-size-w').value) || 100;
    var btnH = parseInt(row.querySelector('.bt-size-h').value) || (btnDef.height_default || 52);

    var iconHtml;
    if (isPng && file) {
        iconHtml = '<img src="' + _urlPng(file) + '" style="width:' + w + 'px;height:' + h + 'px;object-fit:contain;" alt="">';
    } else if (btnDef.iconClass) {
        iconHtml = '<i class="' + btnDef.iconClass + '"></i>';
    } else if (btnDef.emoji_default) {
        iconHtml = '<span class="manuale-emoji">' + btnDef.emoji_default + '</span>';
    } else {
        iconHtml = '<span class="manuale-emoji">🌟</span>';
    }
    prev.querySelector('.bt-preview-icon').innerHTML = iconHtml;
    prev.querySelector('.bt-preview-label').textContent = label;
    prev.style.fontSize = labelSize + 'px';
    prev.style.flexDirection = pos;
    prev.style.backgroundColor = color;
    prev.style.color = _textColorFor(color);
    prev.style.width = btnW + '%';
    prev.style.height = btnH + 'px';
}

// =============================================================================
// TAB COLORI (Aree | Slider) — applicazione live tramite CSS variables
// =============================================================================

/**
 * Applica i colori configurati come CSS variables su <html> (documentElement).
 * I valori validi #rrggbb sovrascrivono i default del CSS; se un colore non
 * è configurato (o non è valido) la variabile torna al default del :root.
 */
function _applyColorConfig() {
    COLOR_CATALOG.forEach(function (c) {
        var val = COLOR_CONFIG[c.id];
        if (val && _isHexColor(val)) {
            document.documentElement.style.setProperty(c.variable, val);
        } else {
            document.documentElement.style.removeProperty(c.variable);
        }
    });
}

function _findCatalogColor(id) {
    for (var i = 0; i < COLOR_CATALOG.length; i++) {
        if (COLOR_CATALOG[i].id === id) return COLOR_CATALOG[i];
    }
    return null;
}

/**
 * Mescola due colori esadecimali: amount 0 → colore1, 1 → colore2.
 * Usato per derivare tonalità coordinate dalla base.
 */
function _mixColor(hex1, hex2, amount) {
    function norm(h) {
        h = String(h).trim().replace(/^#/, '');
        if (h.length === 3) {
            h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        }
        return h;
    }
    var a = norm(hex1);
    var b = norm(hex2);
    var out = '#';
    for (var i = 0; i < 6; i += 2) {
        var v1 = parseInt(a.substr(i, 2), 16);
        var v2 = parseInt(b.substr(i, 2), 16);
        var v = Math.round(v1 + (v2 - v1) * amount);
        out += (v < 16 ? '0' : '') + v.toString(16);
    }
    return out;
}

/**
 * Genera la palette coordinata a partire dal colore di base:
 * tutte le aree ricevono tonalità della STESSA famiglia cromatica
 * (es. base gialla → tonalità di giallo; base grigia → tonalità di grigio).
 *
 * Se la base è molto chiara, l'accento (usato anche come colore del testo:
 * tab attivi, link, voci nav) viene scurito per garantire leggibilità,
 * mantenendo la stessa famiglia cromatica.
 *
 * Restituisce un dict { id_colore: '#rrggbb' } per ogni voce del catalogo.
 */
function _generaTonalitaDaBase(baseHex) {
    if (!_isHexColor(baseHex)) return null;
    var base = baseHex.toLowerCase();
    var nero = '#000000';
    var bianco = '#ffffff';

    // Luminanza percepita della base: se alta, scurisci l'accento per il testo
    function luminanza(h) {
        h = h.replace(/^#/, '');
        var r = parseInt(h.substr(0, 2), 16) / 255;
        var g = parseInt(h.substr(2, 2), 16) / 255;
        var b = parseInt(h.substr(4, 2), 16) / 255;
        return 0.299 * r + 0.587 * g + 0.114 * b;
    }
    var baseLum = luminanza(base);

    // Header: base scurita molto (55% verso il nero)
    var header = _mixColor(base, nero, 0.55);
    // Accento: la base; se troppo chiara (luminanza > 0.72) la scurisco del
    // 35% verso il nero — tonalità identica, ma il testo resta leggibile.
    var accent = baseLum > 0.72 ? _mixColor(base, nero, 0.35) : base;
    // Hover: accento schiarito (20% verso il bianco)
    var accentHover = _mixColor(accent, bianco, 0.20);
    // Superfici: base schiarita verso il bianco (le aree chiare restano quasi bianche)
    var sidebar = _mixColor(base, bianco, 0.90);
    var panelBg = _mixColor(base, bianco, 0.94);
    var panelBorder = _mixColor(base, bianco, 0.80);
    var mainBg = _mixColor(base, bianco, 0.88);
    // Slider
    var trackStart = _mixColor(base, bianco, 0.70);
    var trackEnd = accent;
    var thumb = accent;
    var strategiaThumb = accent;
    var sequenceBg = _mixColor(base, nero, 0.55);

    var map = {
        'header': header,
        'sidebar': sidebar,
        'panel-bg': panelBg,
        'panel-border': panelBorder,
        'main-bg': mainBg,
        'accent': accent,
        'accent-hover': accentHover,
        'slider-track-start': trackStart,
        'slider-track': trackEnd,
        'slider-thumb': thumb,
        'strategia-thumb': strategiaThumb,
        'slider-sequence-bg': sequenceBg
    };
    var palette = {};
    COLOR_CATALOG.forEach(function (c) {
        palette[c.id] = (map[c.id] || c.def).toLowerCase();
    });
    return palette;
}

/**
 * Applica la palette generata alle righe del tab Colori e la rende live:
 * aggiorna picker, hex, swatch e COLOR_CONFIG, poi riapplica le variabili.
 */
function _applicaTonalitaDaBase(baseHex) {
    var palette = _generaTonalitaDaBase(baseHex);
    if (!palette) return;
    COLOR_CATALOG.forEach(function (c) {
        var row = document.querySelector('.colori-row[data-color-id="' + c.id + '"]');
        if (!row) return;
        var val = palette[c.id];
        row.querySelector('.colori-input').value = val;
        row.querySelector('.colori-hex').value = val;
        row.querySelector('.colori-swatch').style.background = val;
        COLOR_CONFIG[c.id] = val;
    });
    _applyColorConfig();
}

/**
 * Popola le liste Aree e Slider del tab Colori e inizializza la riga
 * "Colore di base" (generazione automatica delle tonalità coordinate).
 */
function _popolaTabellaColori() {
    // --- Riga "Colore di base" ---
    var baseInput = document.getElementById('colori-base-input');
    if (baseInput) {
        var baseVal = (COLOR_CONFIG['base'] && _isHexColor(COLOR_CONFIG['base']))
            ? COLOR_CONFIG['base'] : COLOR_BASE_DEFAULT;
        baseInput.value = baseVal;
        var baseHex = document.getElementById('colori-base-hex');
        if (baseHex) baseHex.value = baseVal;
        var baseSwatch = document.getElementById('colori-base-swatch');
        if (baseSwatch) baseSwatch.style.background = baseVal;

        function sincronizzaBase() {
            var picker = document.getElementById('colori-base-input');
            var hex = document.getElementById('colori-base-hex');
            var val = this === picker ? picker.value : hex.value.trim();
            if (!_isHexColor(val)) return;
            if (this === picker) hex.value = val;
            else picker.value = val;
            document.getElementById('colori-base-swatch').style.background = val;
            COLOR_CONFIG['base'] = val;
            _applicaTonalitaDaBase(val);
        }
        baseInput.addEventListener('input', sincronizzaBase);
        if (baseHex) baseHex.addEventListener('input', sincronizzaBase);
        var genBtn = document.getElementById('colori-base-gen');
        if (genBtn) {
            genBtn.addEventListener('click', function () {
                var val = (COLOR_CONFIG['base'] && _isHexColor(COLOR_CONFIG['base']))
                    ? COLOR_CONFIG['base'] : baseInput.value;
                _applicaTonalitaDaBase(val);
                showToast('Tonalità coordinate generate dal colore di base!', 'success');
            });
        }
    }

    // --- Liste Aree e Slider ---
    ['aree', 'slider'].forEach(function (group) {
        var list = document.getElementById('colori-list-' + group);
        if (!list) return;
        var rowsHtml = '';
        COLOR_CATALOG.forEach(function (c) {
            if (c.group !== group) return;
            var val = (COLOR_CONFIG[c.id] && _isHexColor(COLOR_CONFIG[c.id])) ? COLOR_CONFIG[c.id] : c.def;
            rowsHtml += '' +
                '<div class="colori-row" data-color-id="' + c.id + '">' +
                    '<span class="colori-swatch" style="background:' + val + '"></span>' +
                    '<label class="colori-label">' + escapeHtml(c.label) + '</label>' +
                    '<input type="color" class="colori-input" value="' + val + '" title="Scegli il colore">' +
                    '<input type="text" class="form-input colori-hex" value="' + escapeHtml(val) + '" maxlength="7" placeholder="#rrggbb" title="Colore esadecimale">' +
                    '<button type="button" class="colori-reset" title="Ripristina il colore predefinito"><i class="bi bi-arrow-counterclockwise"></i></button>' +
                '</div>';
        });
        list.innerHTML = rowsHtml;

        // Picker → hex e applica live; hex → picker (solo valori validi)
        list.querySelectorAll('.colori-input, .colori-hex').forEach(function (input) {
            input.addEventListener('input', function () {
                var row = this.closest('.colori-row');
                var picker = row.querySelector('.colori-input');
                var hex = row.querySelector('.colori-hex');
                var val = this === picker ? this.value : this.value.trim();
                if (!_isHexColor(val)) return;
                if (this === picker) hex.value = val;
                else picker.value = val;
                row.querySelector('.colori-swatch').style.background = val;
                var c = _findCatalogColor(row.dataset.colorId);
                if (!c) return;
                COLOR_CONFIG[c.id] = val;
                _applyColorConfig();
            });
        });

        // Reset al default
        list.querySelectorAll('.colori-reset').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var row = this.closest('.colori-row');
                var c = _findCatalogColor(row.dataset.colorId);
                if (!c) return;
                row.querySelector('.colori-input').value = c.def;
                row.querySelector('.colori-hex').value = c.def;
                row.querySelector('.colori-swatch').style.background = c.def;
                delete COLOR_CONFIG[c.id];
                _applyColorConfig();
            });
        });
    });
}

/**
 * Raccoglie i colori personalizzati (diversi dal default) dalle liste,
 * includendo il colore di base se impostato.
 */
function _raccogliConfigColoriDallaTabella() {
    var config = {};
    COLOR_CATALOG.forEach(function (c) {
        var row = document.querySelector('.colori-row[data-color-id="' + c.id + '"]');
        if (!row) return;
        var val = row.querySelector('.colori-hex').value.trim();
        if (_isHexColor(val) && val.toLowerCase() !== c.def.toLowerCase()) {
            config[c.id] = val.toLowerCase();
        }
    });
    var baseHex = document.getElementById('colori-base-hex');
    if (baseHex && _isHexColor(baseHex.value.trim())) {
        var bv = baseHex.value.trim().toLowerCase();
        if (bv !== COLOR_BASE_DEFAULT.toLowerCase()) {
            config['base'] = bv;
        }
    }
    return config;
}

// =============================================================================
// VERIFICA / UPLOAD / CANCELLAZIONE FILE PNG
// =============================================================================

async function _verificaFileEsiste(filename) {
    if (!filename) return Promise.resolve(false);
    try {
        var resp = await fetch(_urlPng(filename), { method: 'HEAD' });
        return resp.ok;
    } catch (e) {
        return false;
    }
}

async function _uploadIconFile(file, row, isButton) {
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

        if (isButton) {
            _aggiornaAnteprimaBottone(row);
        } else {
            _aggiornaBadgeERigaIcona(row, row.querySelector('.icone-toggle-input').checked, data.filename);
        }
    } catch (e) {
        showToast('Errore upload: ' + e.message, 'error');
    }
}

async function _cancellaFileIcona(filename, row, tipo) {
    if (!filename) {
        showToast('Nessun file da eliminare.', 'info');
        return;
    }
    if (!confirm("Eliminare il file PNG '" + filename + "' dalla cartella img?")) return;

    try {
        var resp = await fetch('/api/icone-file/', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
            body: JSON.stringify({ filename: _normalizzaNomeFilePng(filename) })
        });
        var data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'HTTP ' + resp.status);

        showToast(data.message || 'File eliminato.', 'success');

        // Svuota la riga e spegni il toggle
        if (tipo === 'bottoni') {
            row.querySelector('.bt-file-input').value = '';
            var tog = row.querySelector('.bt-toggle-input');
            if (tog) { tog.checked = false; }
            _aggiornaAnteprimaBottone(row);
        } else {
            row.querySelector('.icone-file-input').value = '';
            var tog2 = row.querySelector('.icone-toggle-input');
            if (tog2) { tog2.checked = false; }
            _aggiornaBadgeERigaIcona(row, false, '');
        }
    } catch (e) {
        showToast('Errore: ' + e.message, 'error');
    }
}

// =============================================================================
// SALVATAGGIO / AGGIORNAMENTO LIVE / RESET
// =============================================================================

function _raccogliConfigDallaTabella() {
    var config = {};
    document.querySelectorAll('#icone-table-body .icone-row').forEach(function (row) {
        var iconId = row.dataset.iconId;
        var isPng = row.querySelector('.icone-toggle-input').checked;
        var file = _normalizzaNomeFilePng(row.querySelector('.icone-file-input').value);
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

function _raccogliConfigBottoniDallaTabella() {
    var config = {};
    ['#icone-table-body-bottoni', '#icone-table-body-bottoni-finestre'].forEach(function (sel) {
        document.querySelectorAll(sel + ' .icone-row').forEach(function (row) {
        var btnId = row.dataset.buttonId;
        var btnDef = _findCatalogButton(btnId);
        if (!btnDef) return;

        var isPng = row.querySelector('.bt-toggle-input').checked;
        var file = _normalizzaNomeFilePng(row.querySelector('.bt-file-input').value);
        var w = parseInt(row.querySelector('.bt-dim-w').value) || 0;
        var h = parseInt(row.querySelector('.bt-dim-h').value) || 0;
        var label = row.querySelector('.bt-label-input').value.trim();
        var labelSize = parseInt(row.querySelector('.bt-labelsize-input').value) || 0;
        var pos = row.querySelector('.bt-pos-select').value;
        var colorHex = row.querySelector('.bt-color-hex').value.trim();
        var color = _isHexColor(colorHex) ? colorHex : (btnDef.color_default || '#6c757d');
        var defaultColor = (btnDef.color_default || '#6c757d').toLowerCase();
        var btnW = parseInt(row.querySelector('.bt-size-w').value) || 0;
        var btnH = parseInt(row.querySelector('.bt-size-h').value) || 0;
        var defaultH = btnDef.height_default || 52;

        // Salva la voce solo se c'è almeno una personalizzazione
        var defaultDims = (btnDef.dims_px || [24, 24]);
        var personalizzato = isPng || file || label || labelSize ||
            (pos !== (btnDef.label_pos || 'row')) ||
            (color.toLowerCase() !== defaultColor) ||
            (btnW && btnW !== 100) || (btnH && btnH !== defaultH) ||
            (w && w !== defaultDims[0]) || (h && h !== defaultDims[1]);

        if (personalizzato) {
            config[btnId] = {
                type: isPng ? 'png' : 'bootstrap',
                file: file,
                dims_px: [w || defaultDims[0], h || defaultDims[1]],
                label: label,
                label_size: labelSize,
                label_pos: pos,
                color: color,
                width_pct: btnW || 100,
                height_px: btnH || defaultH
            };
        }
    });
    });
    return config;
}

function _bottoniConfigurazioneModificati(precedente, successiva) {
    var modificati = {};
    precedente = precedente || {};
    successiva = successiva || {};
    BUTTON_CATALOG.forEach(function (btnDef) {
        var prima = precedente[btnDef.id] || {};
        var dopo = successiva[btnDef.id] || {};
        if (JSON.stringify(prima) !== JSON.stringify(dopo)) {
            modificati[btnDef.id] = true;
        }
    });
    return modificati;
}

async function _salvaIconConfig() {
    var config = _raccogliConfigDallaTabella();
    var bottoni = _raccogliConfigBottoniDallaTabella();
    var colori = _raccogliConfigColoriDallaTabella();
    try {
        var resp = await fetch('/api/icone-config/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
            body: JSON.stringify({ config: config, bottoni: bottoni, colori: colori })
        });
        var data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'HTTP ' + resp.status);        var bottoniDaForzare = _bottoniConfigurazioneModificati(BOTTONI_CONFIG, bottoni);
        ICON_CONFIG = config;
        BOTTONI_CONFIG = bottoni;
        COLOR_CONFIG = colori;
        // Applica subito: niente reload (punto 1). Forza solo i bottoni
        // realmente cambiati, così un PNG già visibile non viene ricreato.
        _applyIconConfig();
        _applyButtonConfig(bottoniDaForzare);
    _applyColorConfig();
    showToast('Configurazione salvata e applicata!', 'success');
    } catch (e) {
        showToast('Errore salvataggio: ' + e.message, 'error');
    }
}

/**
 * "Aggiorna icone": applica subito alla pagina la configurazione corrente
 * delle due tabelle, senza salvare su server.
 */
function _aggiornaIconeLive() {
    var config = _raccogliConfigDallaTabella();
    var bottoni = _raccogliConfigBottoniDallaTabella();
    var colori = _raccogliConfigColoriDallaTabella();
    var bottoniDaForzare = _bottoniConfigurazioneModificati(BOTTONI_CONFIG, bottoni);
    ICON_CONFIG = config;
    BOTTONI_CONFIG = bottoni;
    COLOR_CONFIG = colori;
    _applyIconConfig();
    // È un aggiornamento richiesto dall'utente: forza solo i bottoni cambiati,
    // compreso man-annulla, senza ricreare gli altri PNG già visibili.
    _applyButtonConfig(bottoniDaForzare);
    _applyColorConfig();
    showToast('Icone, bottoni e colori aggiornati!', 'success');
}

function _resetIconConfig() {
    if (!confirm('Ripristinare tutte le icone, i bottoni e i colori ai valori predefiniti?')) return;

    // Tab Icone
    document.querySelectorAll('#icone-table-body .icone-toggle-input').forEach(function (t) {
        t.checked = false;
        t.dispatchEvent(new Event('change'));
    });
    ICON_CATALOG.forEach(function (icon) {
        var row = document.querySelector('#icone-table-body .icone-row[data-icon-id="' + icon.id + '"]');
        if (!row) return;
        row.querySelector('.icone-file-input').value = icon.file || '';
        row.querySelector('.icone-dim-w').value = (icon.dims || [40, 40])[0];
        row.querySelector('.icone-dim-h').value = (icon.dims || [40, 40])[1];
    });

    // Tab Bottoni e Bottoni Finestre
    ['#icone-table-body-bottoni', '#icone-table-body-bottoni-finestre'].forEach(function (sel) {
        document.querySelectorAll(sel + ' .bt-toggle-input').forEach(function (t) {
            t.checked = false;
        });
    });
    BUTTON_CATALOG.forEach(function (btnDef) {
        var row = document.querySelector('#icone-table-body-bottoni .icone-row[data-button-id="' + btnDef.id + '"]') ||
                  document.querySelector('#icone-table-body-bottoni-finestre .icone-row[data-button-id="' + btnDef.id + '"]');
        if (!row) return;
        row.querySelector('.bt-file-input').value = '';
        row.querySelector('.bt-dim-w').value = (btnDef.dims_px || [24, 24])[0];
        row.querySelector('.bt-dim-h').value = (btnDef.dims_px || [24, 24])[1];
        row.querySelector('.bt-size-w').value = 100;
        row.querySelector('.bt-size-h').value = btnDef.height_default || 52;
        row.querySelector('.bt-label-input').value = btnDef.label_default;
        row.querySelector('.bt-labelsize-input').value = btnDef.label_size || 12;
        row.querySelector('.bt-pos-select').value = btnDef.label_pos || 'row';
        var defColor = btnDef.color_default || '#6c757d';
        row.querySelector('.bt-color-input').value = defColor;
        row.querySelector('.bt-color-hex').value = defColor;
        _aggiornaAnteprimaBottone(row);
    });

    // Tab Colori: ripristina i valori di default e applica subito
    COLOR_CONFIG = {};
    COLOR_CATALOG.forEach(function (c) {
        var row = document.querySelector('.colori-row[data-color-id="' + c.id + '"]');
        if (!row) return;
        row.querySelector('.colori-input').value = c.def;
        row.querySelector('.colori-hex').value = c.def;
        row.querySelector('.colori-swatch').style.background = c.def;
    });
    var baseInput = document.getElementById('colori-base-input');
    if (baseInput) baseInput.value = COLOR_BASE_DEFAULT;
    var baseHex = document.getElementById('colori-base-hex');
    if (baseHex) baseHex.value = COLOR_BASE_DEFAULT;
    var baseSwatch = document.getElementById('colori-base-swatch');
    if (baseSwatch) baseSwatch.style.background = COLOR_BASE_DEFAULT;
    _applyColorConfig();

    showToast('Configurazione ripristinata ai default. Clicca "Salva" o "Aggiorna icone" per renderla effettiva.', 'info');
}

// =============================================================================
// INIZIALIZZAZIONE: chiamata da workspace.js dopo cacheDom()
// =============================================================================

/**
 * Inizializza il modulo icone: cattura lo snapshot dei bottoni, carica
 * config e applica le sostituzioni. Chiamata da inizializza() in workspace.js.
 */
function initIconManager() {
    // Snapshot dell'HTML originale dei bottoni (PRIMA di applicare qualsiasi config)
    _btnSnapshot = {};
    BUTTON_CATALOG.forEach(function (btnDef) {
        var el = document.querySelector(btnDef.selector);
        if (el) _btnSnapshot[btnDef.id] = el.innerHTML;
    });
    _loadIconConfig();

    // I bottoni delle finestre del main view (Piani di carico, Articoli,
    // Vincoli, Trasporti) vengono creati dinamicamente all'apertura della
    // vista. L'osservatore cattura lo snapshot al primo render e applica la
    // configurazione. Il flag _iconApplying evita loop sulle nostre stesse
    // modifiche; il debounce raggruppa i render multipli.
    if (window.MutationObserver && document.body) {
        var _obsTimer = null;
        var _obs = new MutationObserver(function () {
            if (_iconApplying) return;
            clearTimeout(_obsTimer);
            _obsTimer = setTimeout(_osservaBottoniFinestre, 80);
        });
        _obs.observe(document.body, { childList: true, subtree: true });
    }
}

/**
 * Cattura lo snapshot dei bottoni dinamici appena comparsi nel DOM e, se ce
 * n'è almeno uno nuovo, applica la configurazione corrente.
 */
function _osservaBottoniFinestre() {
    // I bottoni delle finestre vengono distrutti e ricreati a ogni apertura
    // della vista (e a ogni dettaglio diverso). Riapplichiamo la config ogni
    // volta che un bottone del catalogo è presente nel DOM: _applyButtonConfig
    // è idempotente (ripristina dallo snapshot e riapplica), quindi è sicuro.
    var trovato = false;
    BUTTON_CATALOG.forEach(function (btnDef) {
        var el = document.querySelector(btnDef.selector);
        if (!el) return;
        if (_btnSnapshot[btnDef.id] === undefined) {
            _btnSnapshot[btnDef.id] = el.innerHTML;
        }
        trovato = true;
    });
    // Anche le icone presenti in blocchi dinamici (sidebar, popup,
    // finestre) vengono riallineate quando il DOM viene ricostruito.
    // _applyIconConfig è idempotente: sugli elementi già applicati aggiorna
    // solo gli attributi, senza ricreare nodi né innescare loop.
    _applyIconConfig();
    if (trovato) _applyButtonConfig();
}
