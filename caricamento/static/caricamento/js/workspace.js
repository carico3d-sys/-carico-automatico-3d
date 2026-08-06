/**
 * Workspace Carico 3D — Init & Bootstrap (v4.0)
 *
 * Inizializzazione e bootstrap dell applicazione.
 * Tutti i moduli sono caricati separatamente prima di questo file.
 *
 * Load order: LAST — all other workspace_*.js files must load before this.
 */

function inizializza() {
    cacheDom();
    caricaImpostazioni(); // Carica impostazioni ottimizzatore da localStorage

    // Chiudi modale cliccando fuori
    DOM.modalOverlay.addEventListener('click', function (e) {
        if (e.target === DOM.modalOverlay) chiudiModale();
    });

    // --- Sidebar tabs ---
    DOM.sidebarTabs.forEach(function (tab) {
        tab.addEventListener('click', function (e) {
            e.preventDefault();
            var tabName = this.dataset.tab;
            switchSidebarTab(tabName);
        });
    });

    // --- Header: category buttons ---
    DOM.headerCatBtns.forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            var cat = this.dataset.cat;
            _attivaHeaderCategory(cat);
        });
    });

    // --- Header: selezione mezzo ---
    DOM.headerVehicleSelect.addEventListener('change', function () {
        selezionaMezzo(this.value);
    });

    if (DOM.headerExportBtn) {
        DOM.headerExportBtn.addEventListener('click', function () {
            esportaPosizioni();
        });
    }

    // --- Panel destro: inizializza autocomplete "Aggiungi oggetto" ---
    if (typeof _initPanelAutocomplete === 'function') {
        _initPanelAutocomplete();
    }
    // --- Cestino batch nel pannello destro ---
    var trashBtn = document.getElementById('panel-header-trash');
    if (trashBtn) {
        trashBtn.addEventListener('click', function () {
            if (typeof _eliminaPanelItemsBatch === 'function') {
                _eliminaPanelItemsBatch();
            }
        });
    }
    // --- Deseleziona item selezionati al click ovunque tranne che su item, form anagrafica, modali o help popover ---
    document.addEventListener('click', function (e) {
        if (!e.target.closest('.panel-item') && !e.target.closest('.pv-list-item') && !e.target.closest('#panel-view-form') && !e.target.closest('#modal-overlay') && !e.target.closest('#vp-help-popover')) {
            _deselezionaTuttiItemSelezionati();
        }
    });
    // Il pulsante '+' è gestito dall'autocomplete, resta visibile
    if (DOM.btnPanelAdd) {
        DOM.btnPanelAdd.style.display = '';
    }

    // --- Back button panel view ---
    DOM.pvBtnBack.addEventListener('click', function () {
        mostraViewport();
        setActiveView('carico');
    });

    // --- Ottimizza ---
    DOM.ottimizzaBtn.addEventListener('click', elaboraOttimizzazione);

    // --- Snap step manuale ---
    var snapSelect = document.getElementById('manuale-snap-step');
    if (snapSelect) {
        snapSelect.addEventListener('change', function () {
            if (typeof STATE !== 'undefined') {
                STATE.snapStepCm = parseInt(this.value) || 10;
            }
        });
    }

    // --- Pulsanti Distribuzione Pesi nei tab Manuale e Automatica ---
    var manualeBtnPesi = document.getElementById('manuale-btn-pesi');
    if (manualeBtnPesi) {
        manualeBtnPesi.addEventListener('click', function () {
            _eseguiAzioneRapida('grafico-pesi');
        });
    }
    var autoBtnPesi = document.getElementById('auto-btn-pesi');
    if (autoBtnPesi) {
        autoBtnPesi.addEventListener('click', function () {
            _eseguiAzioneRapida('grafico-pesi');
        });
    }

    // --- Camera controls ---
    setupCameraControls();

    // --- Tastiera: shortcut scena 3D ---
    document.addEventListener('keydown', function (e) {
        // Ignora se l'utente sta scrivendo in un input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

        console.log('[KEY]', e.key, '| treSceneLoaded:', WS.treSceneLoaded, '| controls:', typeof STATE !== 'undefined' && STATE.controls ? 'OK' : 'MISSING');

        switch (e.key) {
            case '+':
            case '=':
                e.preventDefault();
                console.log('[KEY] cameraZoom(-1)');
                cameraZoom(-1);
                break;
            case '-':
                e.preventDefault();
                console.log('[KEY] cameraZoom(1)');
                cameraZoom(1);
                break;
            case 'f':
            case 'F':
            case 'r':
            case 'R':
                if (e.key === 'r' || e.key === 'R') {
                    if (e.ctrlKey || e.metaKey) break; // non bloccare Ctrl+R / Cmd+R
                }
                e.preventDefault();
                console.log('[KEY] impostaVistaCamera reset, treSceneLoaded:', WS.treSceneLoaded);
                impostaVistaCamera('reset');
                break;
            case '[':
                e.preventDefault();
                if (typeof _applicaSpaziatura === 'function') {
                    _applicaSpaziatura(Math.max(70, STATE.spaziatura - 5));
                }
                break;
            case ']':
                e.preventDefault();
                if (typeof _applicaSpaziatura === 'function') {
                    _applicaSpaziatura(Math.min(100, STATE.spaziatura + 5));
                }
                break;
            case '\\':
                e.preventDefault();
                if (typeof _applicaSpaziatura === 'function') {
                    _applicaSpaziatura(100);
                }
                break;
        }
    });

    // Chiudi popover aiuto cliccando fuori
    document.addEventListener('click', function (e) {
        if (DOM.vpHelpPopover && DOM.vpHelpPopover.style.display === 'block') {
            var clickedInside = DOM.vpHelpPopover.contains(e.target) || (DOM.vpBtnHelp && DOM.vpBtnHelp.contains(e.target));
            if (!clickedInside) {
                DOM.vpHelpPopover.style.display = 'none';
                if (DOM.vpBtnHelp) DOM.vpBtnHelp.classList.remove('active');
            }
        }
    });

    // --- Avvio con piano pre-caricato ---
    if (WS.activePianoId) {
        caricaScena3D(WS.activePianoId);
    }

    // --- Se mezzo pre-selezionato ---
    if (DOM.headerVehicleSelect.value) {
        selezionaMezzo(DOM.headerVehicleSelect.value);
    }

    // --- Aggiorna select oggetti ---
    aggiornaSelectOggetti();
    aggiornaSelectMezzi();

    // --- Render iniziale sidebar Navigazione (categoria default: documenti)
    _renderSidebarNavigazione('documenti');

    setStatus('idle', 'Pronto');
    console.log('🏗️ Workspace Carico 3D v4 inizializzato (layout 3 colonne, header categorie)');
}

// --- Avvio ---
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inizializza);
} else {
    inizializza();
}
