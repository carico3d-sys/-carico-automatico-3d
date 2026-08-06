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

    // 2. Svuota il carico attuale
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
        if (oc.colore) oggetto.colore = oc.colore;
        aggiungiAlCarico(oggetto.id, oc.quantita);
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
        };
    });

    // Aggiungi gli oggetti alla scena (STATE.scene deve essere già inizializzato)
    if (STATE && STATE.scene && oggetti3D.length > 0) {
        var oggettiGroup = buildOggetti(oggetti3D);
        STATE.scene.add(oggettiGroup);
        WS.treSceneLoaded = true;
    }

    // Aggiorna label toolbar e header
    var labelEl = document.getElementById('viewport-toolbar-label');
    if (labelEl) {
        labelEl.textContent = nome;
        _setHeaderCaricoLabel(nome);
    }
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
    var oggetti = raccogliOggettiDaPanel();
    if (oggetti.length === 0) {
        showToast('Aggiungi almeno un oggetto al carico prima di salvare.', 'warning');
        return;
    }
    if (!WS.activeMezzoId && !WS.activePianoId) {
        showToast('Seleziona un mezzo di trasporto prima di salvare.', 'warning');
        return;
    }

    setStatus('busy', 'Salvataggio nel DB...');

    try {
        var pianoId = WS.activePianoId;

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

        for (var i = 0; i < oggetti.length; i++) {
            await fetch('/api/piani/' + pianoId + '/oggetti_da_caricare/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
                body: JSON.stringify({ oggetto_id: oggetti[i].oggetto_id, quantita: oggetti[i].quantita, note: '' }),
            });
        }

        // Salva sempre le posizioni 3D (non solo in modalità manuale).
        // Prima, sincronizza la scena 3D con le q.tà del pannello:
        // rimuove gli oggetti 3D in eccesso rispetto alla q.tà indicata.
        if (typeof STATE !== 'undefined' && STATE.oggettiMesh && STATE.oggettiMesh.length > 0) {
            // Mappa q.tà pannello per codice
            var _panelQty = {};
            oggetti.forEach(function (o) { _panelQty[o.codice] = o.quantita; });
            // Tieni solo i primi N oggetti per codice (N = q.tà pannello)
            var _kept = [];
            var _keptCount = {};
            var _trimmedCount = 0;
            STATE.oggettiMesh.forEach(function (group) {
                var cod = group.userData && group.userData.codice;
                if (!cod) { _kept.push(group); return; }
                var target = _panelQty[cod] || 0;
                var cur = _keptCount[cod] || 0;
                if (cur < target) {
                    _kept.push(group);
                    _keptCount[cod] = cur + 1;
                } else {
                    STATE.scene.remove(group);
                    _trimmedCount++;
                }
            });
            STATE.oggettiMesh = _kept;
            if (_trimmedCount > 0) {
                showToast('🔧 ' + _trimmedCount + ' oggetti 3D rimossi per allineare la scena alle q.tà del pannello.', 'info');
            }
            await _salvaPosizioniManuali(pianoId);
            WS._manualDragOccurred = false;
        }

        // Allinea q.tà richiesta = q.tà reale (il salvataggio conferma le q.tà attuali)
        _allineaQtyOriginaleDopoSalvataggio();

        DOM.headerExportBtn.disabled = false;
        setStatus('idle', 'Salvato nel DB');
        showToast('💾 Piano salvato nel database (ID: ' + pianoId + ')', 'success');
    } catch (err) {
        console.error('Salva DB error:', err);
        showToast('❌ Salvataggio fallito: ' + err.message, 'error');
        setStatus('error', 'Errore salvataggio');
    }
}

// =============================================================================
// 5. SALVATAGGIO POSIZIONI MANUALI 3D
// =============================================================================

async function _salvaPosizioniManuali(pianoId) {
    var posizioni = [];

    STATE.oggettiMesh.forEach(function (group) {
        var ud = group.userData;
        if (!ud || !ud.codice) return;

        var dimCm = typeof _getTjsDimensions === 'function'
            ? _getTjsDimensions(group)
            : { x: 0, y: 0, z: 0 };

        // Salta oggetti con dimensioni invalide (zero)
        if (!dimCm.x || !dimCm.y || !dimCm.z) return;

        // group.position e' ora il centro world dell'oggetto (fix strutturale).
        // mesh.position e' (0,0,0) relativo al group. Nessun offset da sommare.
        var worldX = group.position.x;
        var worldY = group.position.y;
        var worldZ = group.position.z;

        // Converti da coordinate Three.js (centro) a coordinate API (angolo)
        // API.x = lunghezza, API.y = larghezza, API.z = altezza
        // Three.js X = lunghezza, Three.js Y = altezza(up), Three.js Z = larghezza
        var apiX = worldX - dimCm.x / 2;
        var apiY = worldZ - dimCm.z / 2;
        var apiZ = worldY - dimCm.y / 2;

        // Clamp al pavimento
        if (apiX < 0) apiX = 0;
        if (apiY < 0) apiY = 0;
        if (apiZ < 0) apiZ = 0;

        posizioni.push({
            codice: ud.codice,
            posizione_cm: { x: apiX, y: apiY, z: apiZ },
            dimensioni_cm: {
                x: dimCm.x,              // API lunghezza = dimCm.x
                y: dimCm.z,              // API larghezza = dimCm.z
                z: dimCm.y,              // API altezza  = dimCm.y
            },
            colore: ud.colore || '#447e9b',
            rotazione: ud.rotazione || 'XYZ',
        });
    });

    if (posizioni.length === 0) return;

    try {
        var resp = await fetch('/api/piani/' + pianoId + '/salva_posizioni_manuali/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
            body: JSON.stringify({ oggetti: posizioni }),
        });
        if (!resp.ok) {
            var errData = await resp.json().catch(function () { return {}; });
            console.warn('Salvataggio posizioni manuali fallito: HTTP ' + resp.status, errData);
        } else {
            var data = await resp.json();
            console.log('Posizioni manuali salvate: ' + data.oggetti_salvati + ' oggetti');
        }
    } catch (e) {
        console.warn('Errore salvataggio posizioni manuali:', e);
        showToast('⚠️ Posizioni 3D non salvate: ' + e.message, 'warning');
    }
}
