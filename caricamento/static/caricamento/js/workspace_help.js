/* =============================================================================
   HELP MODAL — Guida rapida in-app
   ============================================================================= */

var HELP_SECTIONS = {
    'iniziare': {
        icon: '📦',
        title: { it: 'Per Iniziare', en: 'Getting Started' },
        steps: [
            { it: 'Crea gli <strong>Oggetti</strong> (Articoli) con dimensioni e peso', en: 'Create <strong>Objects</strong> with dimensions and weight' },
            { it: 'Crea un <strong>Mezzo di Trasporto</strong> (container, camion, etc.)', en: 'Create a <strong>Vehicle</strong> (container, truck, etc.)' },
            { it: 'Clicca <strong>Elabora</strong> per lanciare l\'ottimizzazione automatica', en: 'Click <strong>Run</strong> to launch automatic optimization' },
            { it: 'Il risultato appare nella <strong>vista 3D</strong>', en: 'The result appears in the <strong>3D view</strong>' }
        ],
        tip: { it: 'Puoi anche piazzare manualmente con drag & drop nella tab Manuale', en: 'You can also place manually with drag & drop in the Manual tab' }
    },
    'oggetti': {
        icon: '📋',
        title: { it: 'Gestione Oggetti', en: 'Object Management' },
        steps: [
            { it: '<strong>Codice</strong>: identificativo univoco (es. CART-102)', en: '<strong>Code</strong>: unique identifier (e.g. CART-102)' },
            { it: '<strong>Dimensioni</strong>: Lunghezza × Larghezza × Altezza in ' + unitaDimensione(), en: '<strong>Dimensions</strong>: Length × Width × Height in ' + unitaDimensione() },
            { it: '<strong>Peso</strong>: peso singolo in ' + unitaPeso(), en: '<strong>Weight</strong>: single unit weight in ' + unitaPeso() },
            { it: '<strong>Quantità</strong>: numero di pezzi disponibili', en: '<strong>Quantity</strong>: number of available pieces' },
            { it: '<strong>Colore personalizzato</strong>: colore diverso dall\'anagrafica', en: '<strong>Custom color</strong>: color different from master data' }
        ],
        tip: { it: 'Usa il checkbox "seleziona" per operazioni batch su più oggetti', en: 'Use the "select" checkbox for batch operations on multiple objects' }
    },
    'trasporti': {
        icon: '🚛',
        title: { it: 'Gestione Trasporti', en: 'Vehicle Management' },
        steps: [
            { it: '<strong>Tipo</strong>: Bilico, Autocarro, Container 20/40, Furgone, ecc.', en: '<strong>Type</strong>: Semi-trailer, Truck, Container 20/40, Van, etc.' },
            { it: '<strong>Dimensioni</strong>: L × W × H in ' + unitaDimensione() + ' del vano carico', en: '<strong>Dimensions</strong>: L × W × H in ' + unitaDimensione() + ' of the cargo space' },
            { it: '<strong>Portata</strong>: peso massimo trasportabile in ' + unitaPeso(), en: '<strong>Capacity</strong>: maximum transportable weight in ' + unitaPeso() },
            { it: '<strong>Sezioni</strong>: divisione in assi per vincoli di peso', en: '<strong>Sections</strong>: axle division for weight constraints' }
        ],
        tip: { it: 'Le sezioni servono per distribuire il peso sugli assi del veicolo', en: 'Sections are used to distribute weight across vehicle axles' }
    },
    'ottimizzazione': {
        icon: '⚙️',
        title: { it: 'Ottimizzazione Automatica', en: 'Automatic Optimization' },
        steps: [
            { it: 'Seleziona un mezzo e aggiungi gli oggetti', en: 'Select a vehicle and add objects' },
            { it: 'Clicca <strong>Elabora</strong> nel tab Automatica', en: 'Click <strong>Run</strong> in the Automatic tab' },
            { it: 'L\'algoritmo calcola la disposizione ottimale', en: 'The algorithm calculates the optimal layout' },
            { it: 'Il risultato viene mostrato nella vista 3D', en: 'The result is shown in the 3D view' }
        ],
        tip: { it: 'Nelle Impostazioni puoi configurare: ordinamento casuale, backtracking, compattazione', en: 'In Settings you can configure: random order, backtracking, compaction' }
    },
    'manuale': {
        icon: '🖐️',
        title: { it: 'Modalità Manuale', en: 'Manual Mode' },
        steps: [
            { it: 'Vai alla tab <strong>Manuale</strong> nella sidebar', en: 'Go to the <strong>Manual</strong> tab in the sidebar' },
            { it: 'Seleziona un oggetto e clicca <strong>Aggiungi alla scena</strong>', en: 'Select an object and click <strong>Add to scene</strong>' },
            { it: 'Trascina l\'oggetto nella posizione desiderata', en: 'Drag the object to the desired position' },
            { it: 'Usa <strong>Shift + click</strong> per ruotare l\'oggetto', en: 'Use <strong>Shift + click</strong> to rotate the object' }
        ],
        tip: { it: 'Snap griglia: 1cm, 5cm, 10cm, 50cm — configurabile nelle Impostazioni', en: 'Grid snap: 1cm, 5cm, 10cm, 50cm — configurable in Settings' }
    },
    'vista3d': {
        icon: '🖥️',
        title: { it: 'Vista 3D', en: '3D View' },
        steps: [
            { it: '<strong>Trascina</strong> con il mouse sinistro per ruotare la scena', en: '<strong>Drag</strong> with left mouse to rotate the scene' },
            { it: '<strong>Rotella mouse</strong> per zoom avanti/indietro', en: '<strong>Mouse wheel</strong> to zoom in/out' },
            { it: '<strong>Tasto destro</strong> + trascina per spostare la vista', en: '<strong>Right click</strong> + drag to pan the view' },
            { it: 'Le <strong>etichette</strong> mostrano codice e dimensioni degli oggetti', en: '<strong>Labels</strong> show object code and dimensions' }
        ],
        tip: { it: 'Usa i controlli in alto per le viste: alto, frontale, laterale', en: 'Use the top controls for views: top, front, side' }
    },
    'impostazioni': {
        icon: '⚙️',
        title: { it: 'Impostazioni', en: 'Settings' },
        steps: [
            { it: '<strong>Strategia</strong>: ordinamento, algoritmo, compattazione, pesi', en: '<strong>Strategy</strong>: sorting, algorithm, compaction, weights' },
            { it: '<strong>Output</strong>: etichette, rotazione, grafico pesi', en: '<strong>Output</strong>: labels, rotation, weight chart' },
            { it: '<strong>Manuale</strong>: strategia piazzamento, snap, sporgenza', en: '<strong>Manual</strong>: placement strategy, snap, overhang' }
        ],
        tip: { it: 'Le impostazioni vengono salvate automaticamente sul server', en: 'Settings are automatically saved to the server' }
    },
    'pianicarico': {
        icon: '💾',
        title: { it: 'Piani di Carico', en: 'Load Plans' },
        steps: [
            { it: '<strong>Salva</strong> il piano corrente per riprenderlo dopo', en: '<strong>Save</strong> the current plan to resume later' },
            { it: '<strong>Apri</strong> un piano salvato per modificarlo', en: '<strong>Open</strong> a saved plan to modify it' },
            { it: '<strong>Esporta</strong> in formato TXT o Excel', en: '<strong>Export</strong> to TXT or Excel format' }
        ],
        tip: { it: 'I piani vengono salvati automaticamente nel database utente', en: 'Plans are automatically saved in the user database' }
    }
};

function apriModaleHelp() {
    var lingua = window.CARICO3D_LANGUAGE || 'it';
    var sections = Object.keys(HELP_SECTIONS);

    var tabsHtml = sections.map(function (key, i) {
        var s = HELP_SECTIONS[key];
        return '<button type="button" class="help-tab' + (i === 0 ? ' active' : '') + '" data-help-tab="' + key + '">' + s.icon + ' ' + s.title[lingua] + '</button>';
    }).join('');

    var panelsHtml = sections.map(function (key, i) {
        var s = HELP_SECTIONS[key];
        var stepsHtml = s.steps.map(function (step) {
            return '<li>' + step[lingua] + '</li>';
        }).join('');
        var tipHtml = s.tip ? '<div class="help-tip">💡 ' + s.tip[lingua] + '</div>' : '';
        return '<div class="help-panel' + (i === 0 ? ' active' : '') + '" data-help-panel="' + key + '">' +
            '<h3>' + s.icon + ' ' + s.title[lingua] + '</h3>' +
            '<ol>' + stepsHtml + '</ol>' +
            tipHtml +
        '</div>';
    }).join('');

    var bodyHtml =
        '<div class="help-tabs">' + tabsHtml + '</div>' +
        '<div class="help-panels">' + panelsHtml + '</div>';

    apriModale(lingua === 'it' ? '❓ Guida Rapida' : '❓ Quick Guide', bodyHtml, null, { wide: true });

    // Tab switching
    document.querySelectorAll('.help-tab').forEach(function (tab) {
        tab.addEventListener('click', function () {
            document.querySelectorAll('.help-tab').forEach(function (t) { t.classList.remove('active'); });
            document.querySelectorAll('.help-panel').forEach(function (p) { p.classList.remove('active'); });
            this.classList.add('active');
            var panel = document.querySelector('[data-help-panel="' + this.dataset.helpTab + '"]');
            if (panel) panel.classList.add('active');
        });
    });
}
