/**
 * Workspace Carico 3D — Vincoli Tra Oggetti: Calcolo Rotazioni
 *
 * Calcolo delle rotazioni valide per ogni oggetto, generazione
 * configurazioni (A sopra B con offset), match e lookup vincoli.
 *
 * Depends on: workspace_core.js (WS, trovaOggetto), STATE globale
 */

// =============================================================================
// CALCOLO ROTAZIONI VALIDE (invariato)
// =============================================================================

function _vtCalcolaRotazioniValide(oggettoId) {
    if (_vtRotazioniCache[oggettoId]) return _vtRotazioniCache[oggettoId];

    var oggetto = trovaOggetto(oggettoId);
    if (!oggetto) return [];

    var vincoli = WS.vincoli.find(function (v) { return v.oggetto_id == oggettoId; });
    if (!vincoli) vincoli = {};

    var l = oggetto.lunghezza_mm, p = oggetto.larghezza_mm, h = oggetto.altezza_mm;

    if (vincoli.rotazione_consentita === false) {
        var result = [{ rot_label: 'LxPxH', dims: [l, p, h] }];
        _vtRotazioniCache[oggettoId] = result;
        return result;
    }

    var rotazioni = [];
    rotazioni.push({ rot_label: 'LxPxH', dims: [l, p, h] });

    if (vincoli.rotazione_su_z !== false) {
        rotazioni.push({ rot_label: 'PxLxH', dims: [p, l, h] });
    }
    if (vincoli.rotazione_su_x !== false) {
        rotazioni.push({ rot_label: 'LxHxP', dims: [l, h, p] });
    }
    if (vincoli.rotazione_su_y !== false) {
        rotazioni.push({ rot_label: 'HxPxL', dims: [h, p, l] });
    }
    if (vincoli.rotazione_su_x !== false && vincoli.rotazione_su_y !== false && vincoli.rotazione_su_z !== false) {
        rotazioni.push({ rot_label: 'PxHxL', dims: [p, h, l] });
        rotazioni.push({ rot_label: 'HxLxP', dims: [h, l, p] });
    }

    var seen = {};
    rotazioni = rotazioni.filter(function (r) {
        var key = r.dims.join('x');
        if (seen[key]) return false;
        seen[key] = true;
        return true;
    });

    _vtRotazioniCache[oggettoId] = rotazioni;
    return rotazioni;
}

function _vtCalcolaConfigurazioni(aIdOverride, bIdOverride) {
    var aId = aIdOverride || _vtState.oggettoAId;
    var bId = bIdOverride || _vtState.oggettoBId;
    if (!aId || !bId) {
        if (!aIdOverride && !bIdOverride) _vtState.configurazioni = [];
        return [];
    }

    var rotsA = _vtCalcolaRotazioniValide(aId);
    var rotsB = _vtCalcolaRotazioniValide(bId);
    var configs = [];
    var idx = 0;
    for (var i = 0; i < rotsA.length; i++) {
        for (var j = 0; j < rotsB.length; j++) {
            // Stesso oggetto: R1×R2 ≡ R2×R1 (simmetria A↔B con offset invertiti)
            if (aId === bId && i > j) continue;

            var dimsA = rotsA[i].dims;
            var dimsB = rotsB[j].dims;
            var ax = dimsA[0], ay = dimsA[1];
            var bx = dimsB[0], by = dimsB[1];

            var diffX = Math.abs(ax - bx);
            var diffZ = Math.abs(ay - by);

            // Calcola offset estremi per X e Z
            var xOffsets = [0];
            var zOffsets = [0];
            if (diffX > 0.5) {
                var offX = Math.round(diffX / 2);
                xOffsets = [-offX, offX];
            }
            if (diffZ > 0.5) {
                var offZ = Math.round(diffZ / 2);
                zOffsets = [-offZ, offZ];
            }

            // Genera 1 config per ogni combinazione di estremi (salta centro se ci sono estremi)
            for (var xi = 0; xi < xOffsets.length; xi++) {
                for (var zi = 0; zi < zOffsets.length; zi++) {
                    var ox = xOffsets[xi], oz = zOffsets[zi];
                    if ((xOffsets.length > 1 || zOffsets.length > 1) && ox === 0 && oz === 0) continue;
                    // (ox,oz) ≡ (-ox,-oz) ruotato 180° → tieni solo lato sx/dietro
                    // Vale sia per oggetti uguali che diversi
                    if (ox > 0) continue;
                    if (ox === 0 && oz > 0) continue;

                    // Label: combina direzione X e Z
                    var labelParts = [];
                    if (ox < 0) labelParts.push('sx');
                    else if (ox > 0) labelParts.push('dx');
                    if (oz < 0) labelParts.push('dietro');
                    else if (oz > 0) labelParts.push('avanti');
                    var label = labelParts.length > 0 ? labelParts.join('-') : 'centro';

                    idx++;
                    configs.push({
                        id: idx,
                        rotA: rotsA[i].rot_label, dimsA: dimsA,
                        rotB: rotsB[j].rot_label, dimsB: dimsB,
                        offsetX: ox, offsetZ: oz,
                        posizione_label: label,
                        valida: true,
                    });
                }
            }
        }
    }
    if (!aIdOverride && !bIdOverride) _vtState.configurazioni = configs;
    return configs;
}

/**
 * Cerca la configurazione calcolata che corrisponde a quella salvata
 * (match per rotA, rotB, offsetX, offsetZ).
 */
function _vtMatchConfig(savedCfg) {
    for (var i = 0; i < _vtState.configurazioni.length; i++) {
        var nc = _vtState.configurazioni[i];
        if (nc.rotA === savedCfg.rotA && nc.rotB === savedCfg.rotB
            && (nc.offsetX || 0) === (savedCfg.offsetX || 0)
            && (nc.offsetZ || 0) === (savedCfg.offsetZ || 0)) {
            return nc;
        }
    }
    return null;
}

/**
 * Cerca un vincolo SOPRA esistente tra due oggetti.
 * Restituisce l'oggetto vincolo da WS.vincoliTra, oppure null.
 */
function _vtTrovaVincoloEsistente(oggettoAId, oggettoBId) {
    if (!oggettoAId || !oggettoBId) return null;
    for (var i = 0; i < WS.vincoliTra.length; i++) {
        var v = WS.vincoliTra[i];
        if (v.tipo_relazione === 'sopra' && v.oggetto_a === oggettoAId && v.oggetto_b === oggettoBId) {
            return v;
        }
    }
    return null;
}

/**
 * Restituisce i vincoli "sopra" esistenti su tutte le coppie A×B della
 * selezione corrente (supporta selezione multipla su un lato). Ogni vincolo
 * compare una sola volta anche se raggiunto da più combinazioni.
 */
function _vtTrovaVincoliSelezione() {
    var idsA = (_vtState.oggettiASelezionati || []).slice();
    var idsB = (_vtState.oggettiBSelezionati || []).slice();
    if (!idsA.length && _vtState.oggettoAId) idsA = [_vtState.oggettoAId];
    if (!idsB.length && _vtState.oggettoBId) idsB = [_vtState.oggettoBId];

    var trovati = [];
    var seen = {};
    function aggiungi(v) {
        if (v && !seen[v.id]) {
            seen[v.id] = true;
            trovati.push(v);
        }
    }
    idsA.forEach(function (aId) {
        idsB.forEach(function (bId) {
            if (!aId || !bId) return;
            // Cerca in entrambe le direzioni: il vincolo "sopra" può essere
            // stato salvato con A/B invertiti rispetto alla selezione attuale.
            aggiungi(_vtTrovaVincoloEsistente(aId, bId));
            if (aId !== bId) aggiungi(_vtTrovaVincoloEsistente(bId, aId));
        });
    });
    return trovati;
}

/**
 * Dopo che A e B sono selezionati, controlla se esiste già un vincolo
 * e in caso positivo lo carica automaticamente (stato valida/esclusa dei canvas).
 * Con selezione multipla mostra/abilita il pulsante Elimina per tutti i
 * vincoli della selezione.
 */
function _vtControllaVincoloEsistente() {
    var aId = _vtState.oggettoAId;
    var bId = _vtState.oggettoBId;

    var btnCreate = document.getElementById('vt-btn-create');
    var btnUpdate = document.getElementById('vt-btn-update');
    var btnDelete = document.getElementById('vt-btn-delete');

    var vincoliSelezione = _vtTrovaVincoliSelezione();

    if (!aId || !bId) {
        if (btnDelete) btnDelete.style.display = (vincoliSelezione.length > 0) ? '' : 'none';
        return;
    }

    var esistente = _vtTrovaVincoloEsistente(aId, bId);

    // Carica lo stato salvato del vincolo esistente della coppia primaria
    if (esistente) {
        _vtState.editingVincoloId = esistente.id;
        _vtState.editingVincolo = esistente;

        var dettagli = esistente.dettagli_posizionamento;
        if (dettagli && dettagli.configurazioni) {
            dettagli.configurazioni.forEach(function (dc) {
                if (dc.posizioni && dc.posizioni.length > 0) {
                    // Backward compat: old format with posizioni array — flatten
                    dc.posizioni.forEach(function (pos) {
                        var matched = _vtMatchConfig({ rotA: dc.rotA, rotB: dc.rotB, offsetX: pos.offsetX, offsetZ: pos.offsetZ });
                        if (matched) matched.valida = (dc.valida !== false);
                    });
                } else {
                    // New format: scalar offsetX/offsetZ
                    var matched = _vtMatchConfig(dc);
                    if (matched) matched.valida = (dc.valida !== false);
                }
            });
        }
    }

    // Bottoni: Crea/Aggiorna seguono il comportamento storico sulla coppia
    // primaria; Elimina compare se esistono vincoli da eliminare nella
    // selezione corrente (coppia primaria in selezione singola, oppure tutte
    // le coppie in selezione multipla).
    if (esistente) {
        if (btnCreate) btnCreate.style.display = 'none';
        if (btnUpdate) btnUpdate.style.display = '';
    } else {
        if (btnCreate) btnCreate.style.display = '';
        if (btnUpdate) btnUpdate.style.display = 'none';
    }
    if (btnDelete) btnDelete.style.display = (vincoliSelezione.length > 0) ? '' : 'none';

    // Aggiorna hint dopo le modifiche alle validità
    _vtAggiornaValidazione();
}

function _vtNessunaSelezionata() {
    return _vtState.configurazioni.every(function (c) { return c.valida; });
}

function _vtQualcunaSelezionata() {
    return _vtState.configurazioni.some(function (c) { return !c.valida; });
}

