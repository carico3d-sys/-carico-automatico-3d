/**
 * Gestione File — Salvataggio / Caricamento / Esportazione / Importazione
 * 
 * Due flussi distinti:
 * 1. Interno (DB): 💾 Salva / 📂 Carica → API REST su PianoDiCarico
 * 2. Esterno (file): 📤 Esporta .carico3d / 📥 Importa .carico3d → File System Access API + fallback
 *
 * Dipende da: workspace.js (WS, DOM, raccogliOggettiDaPanel, showToast, getCSRFToken, etc.)
 */

// =============================================================================
// COSTANTI FORMATO FILE
// =============================================================================
var FORMATO_CARICO3D_VERSION = '1.0';
var ESTENSIONE_FILE = '.carico3d';

// =============================================================================
// 1. RACCOLTA DATI CARICO (per esportazione e salvataggio)
// =============================================================================

function _raccogliDatiCarico() {
    var oggetti = raccogliOggettiDaPanel();
    var mezzoId = WS.activeMezzoId;
    var mezzo = mezzoId ? WS.contenitori.find(function (c) { return c.id == mezzoId; }) : null;

    // Oggetti con dettagli completi e vincoli
    var oggettiCaricati = [];
    var codiciVisti = {};
    oggetti.forEach(function (o) {
        var full = trovaOggetto(o.oggetto_id);
        if (!full) return;
        var v = WS.vincoli.find(function (x) { return x.oggetto_id == o.oggetto_id; }) || {};
        codiciVisti[full.codice] = true;
        oggettiCaricati.push({
            codice: full.codice,
            descrizione: full.descrizione || '',
            dimensioni_mm: [full.lunghezza_mm, full.larghezza_mm, full.altezza_mm],
            peso_kg: parseFloat(full.peso_kg),
            quantita: o.quantita,
            colore: full.colore || '',
            vincoli: {
                rotazione_consentita: v.rotazione_consentita !== false,
                rotazione_su_x: v.rotazione_su_x !== false,
                rotazione_su_y: v.rotazione_su_y !== false,
                rotazione_su_z: v.rotazione_su_z !== false,
                sovrapponibile: v.sovrapponibile !== false,
                peso_massimo_tetto_kg: parseFloat(v.peso_massimo_tetto_kg) || 0,
                fragile: !!v.fragile,
                merce_pericolosa: !!v.merce_pericolosa,
                solo_su_piano: !!v.solo_su_piano,
                aggancio_forche: !!v.aggancio_forche,
            }
        });
    });

    // Vincoli tra oggetti (solo per codici presenti nel carico)
    var vincoliTra = WS.vincoliTra.filter(function (vt) {
        if (!vt.attivo) return false;
        var ca = trovaOggetto(vt.oggetto_a);
        var cb = trovaOggetto(vt.oggetto_b);
        return ca && cb && codiciVisti[ca.codice] && codiciVisti[cb.codice];
    }).map(function (vt) {
        var ca = trovaOggetto(vt.oggetto_a);
        var cb = trovaOggetto(vt.oggetto_b);
        return {
            oggetto_a: ca.codice,
            oggetto_b: cb.codice,
            tipo_relazione: vt.tipo_relazione,
            dettagli_posizionamento: vt.dettagli_posizionamento || null,
            note: vt.note || '',
        };
    });

    var data = {
        versione: FORMATO_CARICO3D_VERSION,
        metadata: {
            nome: 'Carico ' + new Date().toLocaleDateString('it-IT'),
            mezzo_id: mezzoId || null,
            mezzo_nome: mezzo ? mezzo.nome : '',
            mezzo_tipo: mezzo ? (mezzo.tipo_display || mezzo.tipo || '') : '',
            mezzo_dims_mm: mezzo ? [mezzo.lunghezza_mm, mezzo.larghezza_mm, mezzo.altezza_mm] : [0, 0, 0],
            mezzo_portata_kg: mezzo ? parseFloat(mezzo.carico_massimo_kg) : 0,
            mezzo_tara_kg: mezzo ? parseFloat(mezzo.tara_kg || 0) : 0,
            mezzo_note: mezzo ? (mezzo.note || '') : '',
            data_creazione: new Date().toISOString(),
            impostazioni: (typeof IMPOSTAZIONI !== 'undefined') ? JSON.parse(JSON.stringify(IMPOSTAZIONI)) : {},
        },
        oggetti_caricati: oggettiCaricati,
        vincoli_tra: vincoliTra,
    };

    return data;
}

// =============================================================================
// 2. ESPORTAZIONE .carico3d (su disco esterno)
// =============================================================================

async function esportaCarico3D() {
    var oggetti = raccogliOggettiDaPanel();
    if (oggetti.length === 0) {
        showToast('Aggiungi almeno un oggetto al carico prima di esportare.', 'warning');
        return;
    }

    var data = _raccogliDatiCarico();

    // Se esiste un piano ottimizzato, includi i posizionamenti 3D
    if (WS.activePianoId) {
        try {
            var resp = await fetch('/api/piani/' + WS.activePianoId + '/dati_3d/');
            if (resp.ok) {
                var dati3d = await resp.json();
                if (dati3d.oggetti && dati3d.oggetti.length > 0) {
                    data.posizionamenti = dati3d.oggetti.map(function (p) {
                        var pc = p.posizione_cm || {};
                        var dc = p.dimensioni_cm || {};
                        return {
                            codice: p.codice,
                            x_mm: Math.round((pc.x || 0) * 10),
                            y_mm: Math.round((pc.y || 0) * 10),
                            z_mm: Math.round((pc.z || 0) * 10),
                            dim_x: Math.round((dc.x || 0) * 10),
                            dim_y: Math.round((dc.y || 0) * 10),
                            dim_z: Math.round((dc.z || 0) * 10),
                            rotazione: p.rotazione || '',
                            colore: p.colore || '',
                        };
                    });
                    data.metadata.peso_totale_kg = dati3d.peso_totale_kg || null;
                    data.metadata.saturazione_percentuale = dati3d.saturazione || null;
                }
            }
        } catch (e) {
            console.warn('Impossibile includere posizionamenti 3D:', e);
            showToast('⚠️ Posizionamenti 3D non disponibili — il file conterrà solo il piano senza coordinate.', 'warning');
        }
    }

    var jsonStr = JSON.stringify(data, null, 2);
    var blob = new Blob([jsonStr], { type: 'application/json' });
    var nomeFile = (data.metadata.nome || 'carico').replace(/[^a-zA-Z0-9_\- ]/g, '') + ESTENSIONE_FILE;

    // File System Access API (Chrome/Edge/Opera) — ricorda automaticamente ultima cartella
    if (typeof showSaveFilePicker === 'function') {
        try {
            var handle = await showSaveFilePicker({
                suggestedName: nomeFile,
                types: [{
                    description: 'Piano di Carico 3D',
                    accept: { 'application/json': [ESTENSIONE_FILE] }
                }]
            });
            var writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            showToast('📤 Piano esportato: ' + nomeFile, 'success');
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('Export error:', err);
                showToast('❌ Esportazione fallita: ' + err.message, 'error');
            }
        }
    } else {
        // Fallback: download classico
        _downloadBlob(blob, nomeFile);
        showToast('📤 Piano esportato: ' + nomeFile, 'success');
    }
}

function _downloadBlob(blob, nomeFile) {
    var url = window.URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = nomeFile;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

// =============================================================================
// 3. IMPORTAZIONE .carico3d (da disco esterno)
// =============================================================================

async function importaCarico3D() {
    var file = null;

    // File System Access API
    if (typeof showOpenFilePicker === 'function') {
        try {
            var [handle] = await showOpenFilePicker({
                types: [{
                    description: 'Piano di Carico 3D',
                    accept: { 'application/json': [ESTENSIONE_FILE, '.json'] }
                }],
                multiple: false,
            });
            file = await handle.getFile();
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('Import error:', err);
                showToast('❌ Importazione fallita: ' + err.message, 'error');
            }
            return;
        }
    } else {
        // Fallback: input[type=file] nascosto
        file = await _apriFileDialog();
        if (!file) return;
    }

    try {
        var text = await file.text();
        var data = JSON.parse(text);

        // Validazione base
        if (!data.versione || !data.oggetti_caricati || !Array.isArray(data.oggetti_caricati)) {
            throw new Error('Formato file non valido. Atteso un file .carico3d.');
        }
        if (data.oggetti_caricati.length === 0) {
            throw new Error('Il file non contiene oggetti da caricare.');
        }

        _applicaImportazione(data, file.name);
    } catch (err) {
        console.error('Import parse error:', err);
        showToast('❌ Errore lettura file: ' + err.message, 'error');
    }
}

function _apriFileDialog() {
    return new Promise(function (resolve) {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = '.carico3d,.json';
        input.style.display = 'none';
        document.body.appendChild(input);

        var resolved = false;
        var cleanup = function () {
            if (document.body.contains(input)) {
                document.body.removeChild(input);
            }
            window.removeEventListener('focus', onFocus);
        };

        var done = function (file) {
            if (resolved) return;
            resolved = true;
            cleanup();
            resolve(file);
        };

        input.addEventListener('change', function () {
            done(input.files[0] || null);
        });

        // Rileva annullamento: quando l'utente chiude il dialogo, la finestra riprende focus
        var onFocus = function () {
            // Piccolo delay per lasciar scattare l'evento change prima
            setTimeout(function () {
                if (!resolved) done(null);
            }, 300);
        };
        window.addEventListener('focus', onFocus);

        input.click();
    });
}

function _applicaImportazione(data, nomeFile) {
    // L'importazione di un nuovo carico rende obsoleta la distribuzione del piano precedente
    if (WS.activePianoId) invalidaDistribuzionePesi();

    // 1. Imposta il mezzo (senza chiamare selezionaMezzo che mostrerebbe il contenitore vuoto)
    if (data.metadata && data.metadata.mezzo_id) {
        var mezzo = WS.contenitori.find(function (c) { return c.id == data.metadata.mezzo_id; });
        if (mezzo) {
            WS.activeMezzoId = mezzo.id;
            DOM.headerVehicleSelect.value = mezzo.id;
        }
    }

    // 2. Svuota il carico attuale e resetta la selezione manuale persistente.
    if (typeof WS !== 'undefined') {
        WS._manualPanelSelectedOggettoId = null;
        WS._manualPanelSelectedCodice = null;
        WS._manualPanelSelectedRigaId = null;
        WS._manualPanelSelectedRigaKey = null;
    }
    DOM.panelItemsList.innerHTML = '';
    DOM.panelEmpty.style.display = 'flex';

    // 3. Aggiungi oggetti al pannello
    var oggettiNonTrovati = [];
    data.oggetti_caricati.forEach(function (oc) {
        var oggetto = trovaOggettoPerCodice(oc.codice);
        if (!oggetto) {
            oggettiNonTrovati.push(oc.codice + ' (' + oc.quantita + ' pz)');
            return;
        }
        // Aggiorna temporaneamente le proprietà dell'oggetto nella cache
        if (oc.dimensioni_mm && oc.dimensioni_mm.length === 3) {
            oggetto.lunghezza_mm = oc.dimensioni_mm[0];
            oggetto.larghezza_mm = oc.dimensioni_mm[1];
            oggetto.altezza_mm = oc.dimensioni_mm[2];
        }
        if (oc.peso_kg) oggetto.peso_kg = oc.peso_kg;
        // Il colore importato viene portato sulla RIGA (per-riga), non
        // sull'anagrafica: così resta valido solo per questo carico.
        aggiungiAlCarico(oggetto.id, oc.quantita, false, undefined, undefined, oc.colore || '');
    });

    aggiornaRiepilogoPanel();
    aggiornaStatoPulsante();

    // 4. Avvisa su oggetti non trovati
    if (oggettiNonTrovati.length > 0) {
        showToast('⚠️ Alcuni oggetti non sono presenti in anagrafica: ' + oggettiNonTrovati.join(', '), 'warning');
    }

    // 5. Importa vincoli tra oggetti
    if (data.vincoli_tra && Array.isArray(data.vincoli_tra)) {
        // I vincoli vengono importati se gli oggetti esistono
        // (la sincronizzazione col server richiederebbe API dedicate)
        var vincoliImportati = 0;
        data.vincoli_tra.forEach(function (vt) {
            var a = trovaOggettoPerCodice(vt.oggetto_a);
            var b = trovaOggettoPerCodice(vt.oggetto_b);
            if (a && b) {
                var esiste = WS.vincoliTra.some(function (v) {
                    return v.oggetto_a === a.id && v.oggetto_b === b.id && v.tipo_relazione === vt.tipo_relazione;
                });
                if (!esiste) {
                    WS.vincoliTra.push({
                        id: -(WS.vincoliTra.length + 1),
                        _importato: true,
                        oggetto_a: a.id,
                        oggetto_a_codice: a.codice,
                        oggetto_b: b.id,
                        oggetto_b_codice: b.codice,
                        tipo_relazione: vt.tipo_relazione,
                        tipo_relazione_display: vt.tipo_relazione === 'sopra' ? 'A deve stare sopra B' : vt.tipo_relazione,
                        attivo: true,
                        note: vt.note || '',
                        dettagli_posizionamento: vt.dettagli_posizionamento || null,
                    });
                    vincoliImportati++;
                }
            }
        });
        if (vincoliImportati > 0) {
            showToast('🔗 ' + vincoliImportati + ' vincoli tra oggetti importati.', 'info');
        }
    }

    // 6. Mostra i posizionamenti 3D nel viewport (se presenti)
    if (data.posizionamenti && data.posizionamenti.length > 0) {
        _renderizzaImportati3D(data);
    } else {
        // Mostra almeno il contenitore vuoto nel viewport
        mostraViewport();
        nascondiPlaceholder();
        if (typeof mostraContenitoreVuoto === 'function' && data.metadata && data.metadata.mezzo_dims_mm) {
            var dims = data.metadata.mezzo_dims_mm;
            var nome = (data.metadata && data.metadata.mezzo_nome) ? '🟦 ' + data.metadata.mezzo_nome : 'Contenitore';
            mostraContenitoreVuoto({
                x: dims[0] / 10,
                y: dims[1] / 10,
                z: dims[2] / 10
            }, nome);
        }
    }

    showToast('📥 Piano importato: ' + (nomeFile || 'file.carico3d') + ' (' + data.oggetti_caricati.length + ' codici oggetto)', 'success');
}

// =============================================================================
// 3b. RENDERIZZAZIONE 3D OGGETTI IMPORTATI
// =============================================================================

function _renderizzaImportati3D(data) {
    if (typeof mostraContenitoreVuoto !== 'function' || typeof buildOggetti !== 'function') {
        console.warn('Visualizzatore 3D non disponibile — impossibile mostrare i posizionamenti.');
        return;
    }

    var dims = data.metadata.mezzo_dims_mm;
    if (!dims || dims.length < 3) return;

    var nome = (data.metadata && data.metadata.mezzo_nome) ? '📦 ' + data.metadata.mezzo_nome : 'Carico importato';

    // Mostra il viewport e inizializza la scena col contenitore
    mostraViewport();
    nascondiPlaceholder();

    // Costruisci il contenitore vuoto (la scena viene inizializzata qui)
    mostraContenitoreVuoto({
        x: dims[0] / 10,
        y: dims[1] / 10,
        z: dims[2] / 10
    }, nome);

    // Converti i posizionamenti dal formato mm al formato cm atteso da buildOggetti
    var oggetti3D = data.posizionamenti.map(function (p, i) {
        // Cerca descrizione e peso dall'anagrafica
        var full = trovaOggettoPerCodice(p.codice);
        return {
            codice: p.codice,
            descrizione: full ? (full.descrizione || '') : '',
            posizione_cm: {
                x: (p.x_mm || 0) / 10,
                y: (p.y_mm || 0) / 10,
                z: (p.z_mm || 0) / 10
            },
            dimensioni_cm: {
                x: (p.dim_x || 0) / 10,
                y: (p.dim_y || 0) / 10,
                z: (p.dim_z || 0) / 10
            },
            colore: p.colore || '#447e9b',
            peso_kg: full ? parseFloat(full.peso_kg) : 0,
            peso_sopra_kg: 0,
            rotazione: p.rotazione || 'XYZ',
            riga_id: p.riga_id || null,
        };
    });

    // Aggiungi gli oggetti alla scena (STATE.scene deve essere già inizializzato)
    if (STATE && STATE.scene && oggetti3D.length > 0) {
        var oggettiGroup = buildOggetti(oggetti3D);
        STATE.scene.add(oggettiGroup);
        WS.treSceneLoaded = true;
    }

    // Aggiorna l'etichetta del carico nell'header.
    _setHeaderCaricoLabel(nome);
}

// =============================================================================
// 3c. ALLINEA Q.TÀ RICHIESTA DOPO SALVATAGGIO
// =============================================================================

function _allineaQtyOriginaleDopoSalvataggio() {
    var items = DOM.panelItemsList.querySelectorAll('.panel-item');
    items.forEach(function (div) {
        var qtyInput = div.querySelector('.panel-qty-input');
        var badge = div.querySelector('.panel-qty-originale');
        if (!qtyInput) return;
        var qtyReale = parseInt(qtyInput.value) || 1;
        // Allinea: la q.tà richiesta diventa quella reale
        div.dataset.qtyOriginale = qtyReale;
        if (badge) {
            badge.textContent = qtyReale;
            badge.title = 'Quantità richiesta: ' + qtyReale;
            badge.style.background = '#fff3cd';
            badge.style.borderColor = '#ffc107';
            badge.style.color = '#856404';
        }
        // Aggiorna min sull'input (ora c'è un qtyOriginale)
        qtyInput.min = 0;
    });
}

// =============================================================================
// 4. SALVATAGGIO NEL DATABASE (interno)
// =============================================================================

async function salvaPianoDB() {
    // Elabora (preview) e Salva sono azioni asincrone: un secondo click mentre
    // il primo salvataggio è ancora in corso poteva svuotare/riallineare la
    // scena e lasciare la richiesta senza posizioni valide.
    if (WS.salvataggioInCorso) return;
    WS.salvataggioInCorso = true;
    if (typeof _impostaAzioniAutoDisabilitate === 'function') {
        _impostaAzioniAutoDisabilitate(true);
    }

    // Assicurati che i colori auto per righe duplicate siano aggiornati
    // prima di raccogliere gli oggetti dal pannello.
    if (typeof _assegnaColoriAutomatici === 'function') _assegnaColoriAutomatici();

    var oggetti = raccogliOggettiDaPanel();
    if (oggetti.length === 0) {
        WS.salvataggioInCorso = false;
        if (typeof _aggiornaStatoAzioniAuto === 'function') {
            _aggiornaStatoAzioniAuto();
        }
        showToast('Aggiungi almeno un oggetto al carico prima di salvare.', 'warning');
        return;
    }
    if (!WS.activeMezzoId && !WS.activePianoId) {
        WS.salvataggioInCorso = false;
        if (typeof _aggiornaStatoAzioniAuto === 'function') {
            _aggiornaStatoAzioniAuto();
        }
        showToast('Seleziona un mezzo di trasporto prima di salvare.', 'warning');
        return;
    }

    // Congela subito la scena corrente, prima di qualsiasi await/fetch.
    // Dopo "Elabora" la scena è una preview: attendere le chiamate DELETE/POST
    // del piano può lasciare STATE.oggettiMesh vuoto o ricostruito quando si
    // arriva al salvataggio delle coordinate. La quantità del pannello non
    // decide quali oggetti visibili vengono persistiti.
    var _originePosizioni = WS._manualDragOccurred ? 'manuale' : 'sincronizzazione';
    var _snapshotPosizioni = _raccogliPosizioniScena(
        _originePosizioni === 'sincronizzazione'
    );
    console.info('[SALVA] Snapshot 3D:', _snapshotPosizioni.length,
        'posizioni; origine:', _originePosizioni,
        'mesh:', (typeof STATE !== 'undefined' && Array.isArray(STATE.oggettiMesh)) ? STATE.oggettiMesh.length : 0,
        'preview:', (Array.isArray(WS._autoPreviewPosizioni) ? WS._autoPreviewPosizioni.length : 0),
        'STATE.dati:', (typeof STATE !== 'undefined' && STATE.dati && Array.isArray(STATE.dati.oggetti)) ? STATE.dati.oggetti.length : 0);
    if (_snapshotPosizioni.length === 0) {
        WS.salvataggioInCorso = false;
        if (typeof _aggiornaStatoAzioniAuto === 'function') {
            _aggiornaStatoAzioniAuto();
        }
        showToast('❌ Nessuna posizione 3D valida da salvare. Elabora prima il carico oppure verifica la scena 3D.', 'error');
        setStatus('error', 'Errore salvataggio');
        return;
    }

    setStatus('busy', 'Salvataggio nel DB...');

    try {
        var pianoId = WS.activePianoId;
        var pianoCreatoDuranteSalvataggio = false;

        // Se non esiste un piano, crealo
        if (!pianoId) {
            var nomePiano = 'Carico ' + new Date().toLocaleDateString('it-IT') + ' ' +
                new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
            var createResp = await fetch('/api/piani/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
                body: JSON.stringify({ nome: nomePiano, contenitore: WS.activeMezzoId }),
            });
            if (!createResp.ok) throw new Error('Creazione piano fallita: HTTP ' + createResp.status);
            var pianoData = await createResp.json();
            pianoId = pianoData.id;
            WS.activePianoId = pianoId;
            pianoCreatoDuranteSalvataggio = true;

            var mezzo = WS.contenitori.find(function (c) { return c.id == WS.activeMezzoId; });
            WS.piani.unshift({
                id: pianoId, nome: nomePiano,
                container: mezzo ? mezzo.nome : '',
                stato: 'bozza', stato_display: 'Bozza',
            });
        }

        // Svuota gli oggetti esistenti e riaggiungi
        await fetch('/api/piani/' + pianoId + '/oggetti_da_caricare/', {
            method: 'DELETE',
            headers: { 'X-CSRFToken': getCSRFToken() },
        });

        var mappaRighe = {};
        var mappaRigheKey = {};
        for (var i = 0; i < oggetti.length; i++) {
            var rigaPrecedente = oggetti[i].riga_id;
            var rigaResp = await fetch('/api/piani/' + pianoId + '/oggetti_da_caricare/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
                body: JSON.stringify({
                    oggetto_id: oggetti[i].oggetto_id,
                    quantita: oggetti[i].quantita,
                    priorita: oggetti[i].priorita || 0,
                    colore: oggetti[i].colore || '',
                    note: '',
                }),
            });
            if (!rigaResp.ok) throw new Error('Salvataggio riga carico fallito: HTTP ' + rigaResp.status);
            var rigaData = await rigaResp.json();
            if (rigaPrecedente && rigaData.id) mappaRighe[String(rigaPrecedente)] = rigaData.id;
            if (oggetti[i].riga_key && rigaData.id) mappaRigheKey[String(oggetti[i].riga_key)] = rigaData.id;
            var rigaItem = oggetti[i].riga_key
                ? DOM.panelItemsList.querySelector('.panel-item[data-riga-key="' + oggetti[i].riga_key + '"]')
                : null;
            if (rigaItem) rigaItem.dataset.rigaId = String(rigaData.id || '');
        }

        // Salva lo snapshot raccolto prima delle chiamate di rete. Non
        // modificare STATE.oggettiMesh qui: la preview deve restare visibile e
        // lo snapshot è già stato raccolto da _raccogliPosizioniScena().
        // Le coordinate di una preview possono contenere gli id delle righe
        // del piano tecnico già eliminato: convertili negli id delle nuove
        // righe appena create sul piano reale.
        var snapshotConRighe = _snapshotPosizioni.map(function (posizione) {
            var copia = Object.assign({}, posizione);
            if (copia.riga_id && mappaRighe[String(copia.riga_id)]) {
                copia.riga_id = mappaRighe[String(copia.riga_id)];
            } else if (copia.riga_key && mappaRigheKey[String(copia.riga_key)]) {
                copia.riga_id = mappaRigheKey[String(copia.riga_key)];
            }
            return copia;
        });
        await _salvaPosizioniManuali(
            pianoId,
            _originePosizioni,
            snapshotConRighe
        );
        WS._manualDragOccurred = false;
        // Una volta persistito il piano, lo snapshot non è più necessario
        // (anche dopo un salvataggio manuale non deve restare riutilizzabile).
        WS._autoPreviewPosizioni = null;

        // Allinea q.tà richiesta = q.tà reale (il salvataggio conferma le q.tà attuali)
        _allineaQtyOriginaleDopoSalvataggio();

        DOM.headerExportBtn.disabled = false;
        setStatus('idle', 'Salvato nel DB');
        showToast('💾 Piano salvato nel database (ID: ' + pianoId + ')', 'success');

        // Se il dettaglio del piano è aperto nei Piani Recenti, ricarica i dati
        // appena persistiti e ridisegna l'anteprima statica con un solo render.
        if (typeof _aggiornaAnteprimaPianoDopoSalvataggio === 'function') {
            _aggiornaAnteprimaPianoDopoSalvataggio(pianoId);
        }
    } catch (err) {
        console.error('Salva DB error:', err);

        // Se il piano è stato creato in questa operazione ma il salvataggio
        // delle posizioni è fallito, rimuovilo per non lasciare un piano
        // bozza senza oggetti posizionati. I piani già esistenti restano
        // invariati e possono essere corretti con un nuovo salvataggio.
        if (pianoCreatoDuranteSalvataggio && pianoId) {
            try {
                var rollbackResp = await fetch('/api/piani/' + pianoId + '/', {
                    method: 'DELETE',
                    headers: { 'X-CSRFToken': getCSRFToken() },
                });
                if (rollbackResp.ok || rollbackResp.status === 204) {
                    WS.activePianoId = null;
                    WS.piani = WS.piani.filter(function (p) { return p.id != pianoId; });
                    showToast('↩️ Piano non creato: le posizioni 3D non sono state salvate.', 'warning');
                } else {
                    console.warn('Rollback piano fallito: HTTP ' + rollbackResp.status);
                }
            } catch (rollbackErr) {
                console.warn('Errore rollback piano:', rollbackErr);
            }
        }

        showToast('❌ Salvataggio fallito: ' + err.message, 'error');
        setStatus('error', 'Errore salvataggio');
    } finally {
        WS.salvataggioInCorso = false;
        _aggiornaStatoAzioniAuto();
    }
}

// =============================================================================
// 5. SALVATAGGIO POSIZIONI MANUALI 3D
// =============================================================================

function _normalizzaRotazionePerApi(rotazione) {
    var valore = String(rotazione || 'XYZ');
    var mappa = {
        'LxPxH': 'XYZ',
        'PxLxH': 'YXZ',
        'LxHxP': 'XZY',
        'HxPxL': 'ZYX',
        'PxHxL': 'YZX',
        'HxLxP': 'ZXY',
    };
    if (mappa[valore]) return mappa[valore];
    var compatta = valore.replace(/[^XYZ]/gi, '').toUpperCase();
    return compatta.length === 3 ? compatta : 'XYZ';
}

function _posizioneNumericaValida(posizione, dimensioni) {
    if (!posizione || !dimensioni) return false;
    var valori = [posizione.x, posizione.y, posizione.z, dimensioni.x, dimensioni.y, dimensioni.z];
    return valori.every(function (valore) {
        return Number.isFinite(Number(valore)) && Number(valore) >= 0;
    }) && Number(dimensioni.x) > 0 && Number(dimensioni.y) > 0 && Number(dimensioni.z) > 0;
}

function _codicePosizione(oggetto) {
    if (!oggetto) return '';
    return String(oggetto.codice || oggetto.codice_oggetto || oggetto.oggetto_codice || '').trim();
}

function _triplettaPosizione(valore) {
    if (Array.isArray(valore)) {
        return { x: valore[0], y: valore[1], z: valore[2] };
    }
    if (!valore || typeof valore !== 'object') return null;
    return {
        x: valore.x !== undefined ? valore.x : (valore.l !== undefined ? valore.l : valore.lunghezza),
        y: valore.y !== undefined ? valore.y : (valore.p !== undefined ? valore.p : valore.larghezza),
        z: valore.z !== undefined ? valore.z : (valore.h !== undefined ? valore.h : valore.altezza),
    };
}

function _triplettaNumerica(valore, fattore) {
    var tripletta = _triplettaPosizione(valore);
    if (!tripletta) return null;
    return {
        x: Number(tripletta.x) * fattore,
        y: Number(tripletta.y) * fattore,
        z: Number(tripletta.z) * fattore,
    };
}

function _triplettaFinita(valore) {
    return valore && [valore.x, valore.y, valore.z].every(function (n) {
        return Number.isFinite(Number(n));
    });
}

function _triplettaPositiva(valore) {
    return _triplettaFinita(valore) && [valore.x, valore.y, valore.z].every(function (n) {
        return Number(n) > 0;
    });
}

function _normalizzaPosizioneDaDati3D(oggetto) {
    var codice = _codicePosizione(oggetto);
    if (!oggetto || !codice) return null;

    // Accetta sia il formato API in cm sia il formato dell'ottimizzatore in mm.
    // Se il formato cm è presente ma contiene NaN/chiavi diverse, prova comunque
    // il formato mm originale invece di scartare l'intero oggetto.
    var posizioneCm = _triplettaNumerica(
        oggetto.posizione_cm || oggetto.posizione || oggetto.position,
        1
    );
    var dimensioniCm = _triplettaNumerica(
        oggetto.dimensioni_cm || oggetto.dimensioni || oggetto.dimensions,
        1
    );
    var posizioneMm = _triplettaNumerica(oggetto.posizione_mm || oggetto.position_mm, 0.1);
    var dimensioniMm = _triplettaNumerica(oggetto.dimensioni_mm || oggetto.dimensioni, 0.1);

    var posizione = _triplettaFinita(posizioneCm) ? posizioneCm : posizioneMm;
    var dimensioni = _triplettaPositiva(dimensioniCm) ? dimensioniCm : dimensioniMm;
    if (!_triplettaFinita(posizione) || !_triplettaPositiva(dimensioni)) return null;

    // La preview può avere una minima imprecisione negativa vicino a zero.
    posizione = {
        x: Math.max(0, Number(posizione.x)),
        y: Math.max(0, Number(posizione.y)),
        z: Math.max(0, Number(posizione.z)),
    };
    dimensioni = {
        x: Number(dimensioni.x),
        y: Number(dimensioni.y),
        z: Number(dimensioni.z),
    };
    if (!_posizioneNumericaValida(posizione, dimensioni)) return null;

    return {
        oggetto_id: oggetto.oggetto_id || oggetto.id || oggetto.oggettoId || null,
        codice: codice,
        posizione_cm: posizione,
        dimensioni_cm: dimensioni,
        colore: oggetto.colore || '#447e9b',
        rotazione: _normalizzaRotazionePerApi(oggetto.rotazione || oggetto.rotazione_applicata || 'XYZ'),
        riga_id: oggetto.riga_id || null,
        riga_key: oggetto.riga_key || null,
    };
}

/**
 * Raccoglie le coordinate dalla scena corrente. Dopo "Elabora" la scena è una
 * preview e, in alcuni casi, i gruppi Three.js possono essere stati ricreati o
 * riallineati prima che il salvataggio parta: STATE.dati.oggetti è il fallback
 * persistito in memoria con lo stesso formato dell'endpoint 3D. La quantità
 * richiesta dal pannello non viene usata per filtrare la scena visibile.
 */
function _raccogliPosizioniScena(usaFallback) {
    // Nel flusso automatico usa prima il risultato immutabile di "Elabora".
    // La scena Three.js è solo una rappresentazione visuale e può contenere
    // gruppi ricostruiti, dimensioni locali o coordinate non più leggibili.
    if (usaFallback && typeof WS !== 'undefined' &&
        Array.isArray(WS._autoPreviewPosizioni) &&
        WS._autoPreviewPosizioni.length > 0) {
        var previewValide = 0;
        var posizioniPreview = WS._autoPreviewPosizioni.map(function (oggetto) {
            var normalizzata = _normalizzaPosizioneDaDati3D(oggetto);
            if (normalizzata) previewValide += 1;
            return normalizzata;
        }).filter(function (posizione) { return !!posizione; });
        // La preview è il risultato diretto dell'ottimizzatore: è già stata
        // costruita sulla lista inviata al backend e rappresenta esattamente
        // le posizioni che l'utente vede dopo "Elabora". Non ricostruirla dalla
        // scena e non applicare il filtro quantità del pannello: quel filtro
        // può avere codici/quantità visuali diversi dalla quantità piazzata.
        console.info('[SALVA] Preview normalizzata:', previewValide + '/' + WS._autoPreviewPosizioni.length,
            'usata direttamente:', posizioniPreview.length);
        if (posizioniPreview.length > 0) {
            return posizioniPreview;
        }
    }

    var posizioni = [];
    var meshDisponibili = typeof STATE !== 'undefined' && Array.isArray(STATE.oggettiMesh)
        ? STATE.oggettiMesh : [];

    meshDisponibili.forEach(function (group) {
        var ud = group && group.userData;
        if (!ud || !ud.codice || !group.position) return;

        var dimCm = typeof _getTjsDimensions === 'function'
            ? _getTjsDimensions(group)
            : { x: 0, y: 0, z: 0 };
        if (!dimCm || !group.position) return;

        // group.position è il centro world. Three.js usa Y per l'altezza,
        // mentre l'API usa z per l'altezza.
        var posizione = {
            x: Math.max(0, Number(group.position.x) - Number(dimCm.x) / 2),
            y: Math.max(0, Number(group.position.z) - Number(dimCm.z) / 2),
            z: Math.max(0, Number(group.position.y) - Number(dimCm.y) / 2),
        };
        var dimensioni = {
            x: Number(dimCm.x),
            y: Number(dimCm.z),
            z: Number(dimCm.y),
        };
        if (!_posizioneNumericaValida(posizione, dimensioni)) return;

        posizioni.push({
            codice: String(ud.codice),
            posizione_cm: posizione,
            dimensioni_cm: dimensioni,
            colore: ud.colore || '#447e9b',
            rotazione: _normalizzaRotazionePerApi(ud._orientamento || ud.rotazione || 'XYZ'),
            riga_id: ud.riga_id || null,
            riga_key: ud.riga_key || null,
        });
    });

    // Fallback specifico per la preview di "Elabora": i dati sono già in cm
    // API (x=lunghezza, y=larghezza, z=altezza), quindi non vanno riconvertiti.
    // Non usarlo per un salvataggio manuale: in quel caso STATE.dati può essere
    // una fotografia precedente e sovrascrivere modifiche dell'utente.
    var snapshotPreview = (typeof WS !== 'undefined' && Array.isArray(WS._autoPreviewPosizioni))
        ? WS._autoPreviewPosizioni
        : [];
    // Preferisci lo snapshot dell'ottimizzazione: STATE.dati può essere
    // successivamente sostituito da una scena vuota o da dati più vecchi.
    var datiFallback = snapshotPreview.length > 0
        ? snapshotPreview
        : ((typeof STATE !== 'undefined' && STATE.dati &&
            Array.isArray(STATE.dati.oggetti)) ? STATE.dati.oggetti : []);

    if (usaFallback && posizioni.length === 0 && datiFallback.length > 0) {
        datiFallback.forEach(function (oggetto) {
            var normalizzata = _normalizzaPosizioneDaDati3D(oggetto);
            if (normalizzata) posizioni.push(normalizzata);
        });
    }

    // Salva significa persistere la scena visibile. Le quantità del pannello
    // descrivono la richiesta, ma non possono cancellare posizionamenti che
    // l'utente vede (piano parziale, duplicati o override manuali inclusi).
    return posizioni;
}

async function _salvaPosizioniManuali(pianoId, origine, posizioniSnapshot) {
    origine = origine || 'manuale';
    // Le coordinate possono essere state raccolte prima di un'altra await
    // (flusso Elabora → Salva). Se non viene passato uno snapshot, mantieni
    // il comportamento precedente raccogliendo dalla scena al momento della
    // chiamata.
    // Lo snapshot è già stato raccolto dalla scena visibile prima delle
    // chiamate di rete. Non applicare qui limiti di quantità: Salva deve
    // persistere esattamente gli oggetti mostrati, sia in automatico sia in
    // manuale.
    var posizioni = Array.isArray(posizioniSnapshot)
        ? posizioniSnapshot
        : _raccogliPosizioniScena(origine === 'sincronizzazione');

    if (posizioni.length === 0) {
        throw new Error('Nessuna posizione 3D valida da salvare.');
    }

    try {
        var resp = await fetch('/api/piani/' + pianoId + '/salva_posizioni_manuali/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
            body: JSON.stringify({ oggetti: posizioni, origine: origine }),
        });
        if (!resp.ok) {
            var errData = await resp.json().catch(function () { return {}; });
            var dettaglio = errData.errore || errData.detail || errData.oggetti || JSON.stringify(errData) || ('HTTP ' + resp.status);
            throw new Error('Salvataggio posizioni manuali fallito: ' + dettaglio);
        }
        var data = await resp.json();
        if (data.successo !== true) {
            throw new Error('Il server non ha confermato il salvataggio delle posizioni.');
        }
        console.log('Posizioni manuali salvate: ' + data.oggetti_salvati + ' oggetti');
    } catch (e) {
        console.warn('Errore salvataggio posizioni manuali:', e);
        throw e;
    }
}
