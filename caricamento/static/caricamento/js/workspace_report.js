/**
 * Workspace Carico 3D — Report modules shared helpers and 3D report.
 *
 * The report window is opened synchronously from the user click. Its content
 * is generated afterwards, so browsers do not classify it as a blocked popup.
 */

var _reportWindowsAperti = [];

function _linguaReportCorrente() {
    return window.CARICO3D_LANGUAGE === 'en' ? 'en' : 'it';
}

function _traduciReport(key, fallback, lingua) {
    var lang = lingua === 'en' ? 'en' : 'it';
    var dizionario = window.DIZIONARIO && window.DIZIONARIO[lang];
    return (dizionario && dizionario[key]) || fallback;
}

function _formattaDataReport(data, lingua) {
    var valore = data instanceof Date ? data : new Date(data);
    if (isNaN(valore.getTime())) return data || '';
    return valore.toLocaleDateString(lingua === 'en' ? 'en-US' : 'it-IT');
}

function _traduciStatoReport(stato, lingua) {
    var mappa = {
        'Bozza': 'plan.status.bozza',
        'In elaborazione': 'plan.status.in-elaborazione',
        'Completato': 'plan.status.completato',
        'Parzialmente completato': 'plan.status.parziale',
        'Parziale': 'plan.status.parziale',
        'Fallito': 'plan.status.fallito',
        'Errore': 'plan.status.errore'
    };
    var chiave = mappa[stato];
    return chiave ? _traduciReport(chiave, stato, lingua) : (stato || _traduciReport('plan.status.completato', 'Completato', lingua));
}

function _registraReportAperto(finestra, renderizza) {
    _reportWindowsAperti = _reportWindowsAperti.filter(function (entry) {
        return entry.finestra && !entry.finestra.closed;
    });
    _reportWindowsAperti.push({ finestra: finestra, renderizza: renderizza });
}

function _aggiornaReportAperti(lingua) {
    _reportWindowsAperti = _reportWindowsAperti.filter(function (entry) {
        if (!entry.finestra || entry.finestra.closed) return false;
        try {
            entry.renderizza(lingua === 'en' ? 'en' : 'it');
            return true;
        } catch (error) {
            console.warn('Impossibile aggiornare il report aperto:', error);
            return false;
        }
    });
}

document.addEventListener('carico3d:language-change', function (event) {
    var lingua = event.detail && event.detail.language ? event.detail.language : _linguaReportCorrente();
    _aggiornaReportAperti(lingua);
});

// =============================================================================
// REPORT 3D
// =============================================================================

function generaReport() {
    if (!STATE.scene || !STATE.renderer || !WS.activePianoId) {
        showToast(_traduciReport('report.nessun-carico', 'Nessun carico 3D attivo da reportizzare.', _linguaReportCorrente()), 'warning');
        return;
    }

    var w = window.open('', '_blank', 'width=1100,height=800');
    var lingua = _linguaReportCorrente();
    if (!w) {
        showToast(_traduciReport('report.popup-bloccato', 'Popup bloccato. Consenti i popup per questo sito.', lingua), 'warning');
        return;
    }

    w.document.write('<!DOCTYPE html><html lang="' + lingua + '"><head><meta charset="UTF-8"><title>' +
        _traduciReport('report.generazione', 'Generazione report...', lingua) +
        '</title></head><body>' + _traduciReport('report.generazione', 'Generazione report...', lingua) + '</body></html>');
    w.document.close();

    try {
        var dati = _raccogliDatiReport();
        var vista1 = _catturaVista3D('isometrica-fronte');
        var vista2 = _catturaVista3D('isometrica-retro');
        var renderizza = function (nuovaLingua) {
            w.document.open();
            w.document.write(_buildReportHtml(dati, vista1, vista2, nuovaLingua));
            w.document.close();
        };
        renderizza(lingua);
        _registraReportAperto(w, renderizza);
    } catch (error) {
        w.document.body.innerHTML = '<p>' + _traduciReport('report.errore', 'Errore nella generazione del report.', lingua) + '</p>';
        console.error('Errore generazione report:', error);
        showToast(_traduciReport('report.errore', 'Errore nella generazione del report.', lingua), 'error');
        return;
    }
    showToast(_traduciReport('report.generato', '📄 Report generato! Usa il pulsante Stampa / Salva PDF in alto a destra.', lingua), 'success');
}

function _raccogliDatiReport() {
    var mezzo = WS.contenitori.find(function (c) { return c.id == WS.activeMezzoId; });
    var piano = WS.piani.find(function (p) { return p.id == WS.activePianoId; });
    var oggettiMesh = STATE.oggettiMesh || [];
    var conteggio = {};

    oggettiMesh.forEach(function (group) {
        var ud = group.userData;
        if (!ud || !ud.codice) return;
        var codice = ud.codice;
        var dimCm = ud._tjsDimCm;
        if (!dimCm) {
            var mesh = group.children[0];
            if (mesh && mesh.geometry && mesh.geometry.parameters) {
                var p = mesh.geometry.parameters;
                dimCm = { x: p.width || 0, y: p.height || 0, z: p.depth || 0 };
            } else {
                return;
            }
        }
        var colore = ud.colore || '#447e9b';
        var chiave = codice + '|' + colore;
        if (!conteggio[chiave]) {
            conteggio[chiave] = {
                codice: codice,
                qty: 0,
                dimCm: dimCm,
                peso: ud.peso || 0,
                colore: colore
            };
        }
        conteggio[chiave].qty++;
    });

    var totPezzi = 0;
    var totPeso = 0;
    Object.values(conteggio).forEach(function (o) {
        totPezzi += o.qty;
        totPeso += o.qty * o.peso;
    });

    var volumeM3 = 0;
    var saturazione = 0;
    if (mezzo) {
        var volContM3 = (mezzo.lunghezza_mm * mezzo.larghezza_mm * mezzo.altezza_mm) / 1e9;
        oggettiMesh.forEach(function (group) {
            var ud = group.userData;
            if (ud && ud._tjsDimCm) {
                volumeM3 += (ud._tjsDimCm.x * ud._tjsDimCm.y * ud._tjsDimCm.z) / 1e6;
            }
        });
        saturazione = volContM3 > 0 ? (volumeM3 / volContM3) * 100 : 0;
    }

    var mtLineari = '—';
    if (oggettiMesh.length > 0 && mezzo) {
        var maxX = 0;
        oggettiMesh.forEach(function (group) {
            var ud = group.userData;
            if (!ud || !ud._tjsDimCm) return;
            var fine = group.position.x + ud._tjsDimCm.x / 2;
            if (fine > maxX) maxX = fine;
        });
        var _isImp = getUnitaMisura() === 'imperiale';
        var _occM = maxX / 100;
        var _totM = mezzo.lunghezza_mm / 1000;
        var _u = unitaLineari();
        mtLineari = (_isImp ? (_occM * 3.28084).toFixed(1) : _occM.toFixed(1)) + ' / ' + (_isImp ? (_totM * 3.28084).toFixed(1) : _totM.toFixed(1)) + ' ' + _u;
    }

    return {
        pianoNome: piano ? piano.nome : ('Piano #' + WS.activePianoId),
        pianoStato: piano ? (piano.stato_display || piano.stato || 'Completato') : 'Completato',
        mezzoNome: mezzo ? mezzo.nome : 'N/D',
        mezzoDims: mezzo ? (mezzo.lunghezza_mm / 10).toFixed(0) + '×' + (mezzo.larghezza_mm / 10).toFixed(0) + '×' + (mezzo.altezza_mm / 10).toFixed(0) + ' ' + unitaDimensione() : 'N/D',
        data: new Date(),
        totPezzi: totPezzi,
        totPeso: totPeso,
        pesoTotale: totPeso,
        saturazione: saturazione,
        volumeM3: volumeM3,
        mtLineari: mtLineari,
        oggetti: Object.values(conteggio).sort(function (a, b) { return a.codice.localeCompare(b.codice); })
    };
}

// =============================================================================
// CATTURA VISTE 3D PER I REPORT
// =============================================================================

function _catturaVista3D(tipo, zoom, invertiX) {
    if (zoom === undefined) zoom = 1;
    if (invertiX === undefined) invertiX = false;

    var scene = STATE.scene;
    var IMG_W = 2400;
    var IMG_H = 1800;
    var bgOriginal = scene.background;
    scene.background = null;

    var grigliaVisible = STATE.grigliaMesh ? STATE.grigliaMesh.visible : true;
    if (STATE.grigliaMesh) STATE.grigliaMesh.visible = false;

    var offCanvas = document.createElement('canvas');
    offCanvas.width = IMG_W;
    offCanvas.height = IMG_H;

    var offRenderer = new THREE.WebGLRenderer({
        canvas: offCanvas,
        antialias: true,
        preserveDrawingBuffer: true,
        alpha: true
    });
    offRenderer.setSize(IMG_W, IMG_H);
    offRenderer.setPixelRatio(1);
    offRenderer.setClearColor(0x000000, 0);
    offRenderer.shadowMap.enabled = true;
    offRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    offRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    offRenderer.toneMappingExposure = 1.2;

    var offCamera = new THREE.PerspectiveCamera(45, IMG_W / IMG_H, 1, 100000);
    var centro = new THREE.Vector3(0, 0, 0);
    var dims = { x: 600, y: 200, z: 300 };
    if (STATE.containerMesh) {
        var box = new THREE.Box3().setFromObject(STATE.containerMesh);
        box.getCenter(centro);
        var sz = new THREE.Vector3();
        box.getSize(sz);
        dims = { x: sz.x, y: sz.y, z: sz.z };
    }

    var diag = Math.sqrt(dims.x * dims.x + dims.z * dims.z + (dims.y * dims.y) * 0.7);
    var distanza = (diag / 0.828) * 1.10 * zoom;
    var cos45 = Math.cos(Math.PI / 4);

    switch (tipo) {
        case 'isometrica-fronte':
            offCamera.position.set(centro.x + distanza * cos45 * 0.65, centro.y + distanza * 0.55, centro.z + distanza * cos45 * 0.65);
            break;
        case 'isometrica-retro':
            offCamera.position.set(centro.x - distanza * cos45 * 0.65, centro.y + distanza * 0.55, centro.z - distanza * cos45 * 0.65);
            break;
        case 'front':
            offCamera.position.set(centro.x, centro.y, centro.z + distanza * 1.3);
            break;
        case 'rear':
            offCamera.position.set(centro.x, centro.y, centro.z - distanza * 1.3);
            break;
        case 'top':
            offCamera.position.set(centro.x, centro.y + distanza * 1.3, centro.z + 1);
            break;
        default:
            offCamera.position.set(centro.x + distanza * cos45 * 0.65, centro.y + distanza * 0.55, centro.z + distanza * cos45 * 0.65);
    }
    offCamera.lookAt(centro);
    _aggiornaEtichettePerCamera(offCamera);

    var tempFill = new THREE.DirectionalLight(0xffffff, 0.5);
    tempFill.position.copy(offCamera.position);
    scene.add(tempFill);

    var textureStates = invertiX ? _inverteTextureDecalTemporaneamente() : [];
    try {
        offRenderer.render(scene, offCamera);
    } finally {
        _ripristinaTextureDecal(textureStates);
        scene.remove(tempFill);
        scene.background = bgOriginal;
        if (STATE.grigliaMesh) STATE.grigliaMesh.visible = grigliaVisible;
    }

    var imageCanvas = offCanvas;
    if (invertiX) {
        var flippedCanvas = document.createElement('canvas');
        flippedCanvas.width = IMG_W;
        flippedCanvas.height = IMG_H;
        var ctx = flippedCanvas.getContext('2d');
        ctx.translate(IMG_W, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(offCanvas, 0, 0);
        imageCanvas = flippedCanvas;
    }

    var dataUrl = imageCanvas.toDataURL('image/png');
    offRenderer.dispose();
    return dataUrl;
}

function _inverteTextureDecalTemporaneamente() {
    var states = [];
    var seen = [];
    var registra = function (texture) {
        if (!texture || seen.indexOf(texture) !== -1) return;
        seen.push(texture);
        states.push({
            texture: texture,
            wrapS: texture.wrapS,
            repeatX: texture.repeat.x,
            offsetX: texture.offset.x
        });
        texture.wrapS = THREE.RepeatWrapping;
        texture.repeat.x = -Math.abs(texture.repeat.x || 1);
        texture.offset.x = 1;
        texture.needsUpdate = true;
    };

    (STATE.oggettiMesh || []).forEach(function (group) {
        (group.userData && group.userData._decalFaces || []).forEach(function (plane) {
            if (plane.material && plane.material.map) registra(plane.material.map);
        });
    });
    (STATE._containerDecalFaces || []).forEach(function (plane) {
        if (plane.material && plane.material.map) registra(plane.material.map);
    });
    return states;
}

function _ripristinaTextureDecal(states) {
    (states || []).forEach(function (state) {
        state.texture.wrapS = state.wrapS;
        state.texture.repeat.x = state.repeatX;
        state.texture.offset.x = state.offsetX;
        state.texture.needsUpdate = true;
    });
}

function _aggiornaEtichettePerCamera(camera) {
    var camWorld = new THREE.Vector3();
    var camLocal = new THREE.Vector3();
    camWorld.copy(camera.position);

    (STATE.oggettiMesh || []).forEach(function (group) {
        var mesh = group.children[0];
        if (!mesh || mesh.type !== 'Mesh') return;
        var decalFaces = mesh.userData._decalFaces;
        if (!decalFaces || decalFaces.length < 6) return;
        mesh.worldToLocal(camLocal.copy(camWorld));
        var lx = camLocal.x;
        var ly = camLocal.y;
        var lz = camLocal.z;
        decalFaces[0].visible = (lz > 0) && STATE.mostraEtichetteOggetti;
        decalFaces[1].visible = (lz < 0) && STATE.mostraEtichetteOggetti;
        decalFaces[2].visible = (lx > 0) && STATE.mostraEtichetteOggetti;
        decalFaces[3].visible = (lx < 0) && STATE.mostraEtichetteOggetti;
        decalFaces[4].visible = (ly > 0) && STATE.mostraEtichetteOggetti;
        decalFaces[5].visible = (ly < 0) && STATE.mostraEtichetteOggetti;
    });

    if (STATE._containerDecalFaces && STATE._containerWalls) {
        STATE._containerWalls.worldToLocal(camLocal.copy(camWorld));
        var clx = camLocal.x;
        var cly = camLocal.y;
        var clz = camLocal.z;
        var faces = STATE._containerDecalFaces;
        var dots = [clz, -clz, clx, -clx, cly, -cly];
        var bestIdx = 0;
        var bestDot = dots[0];
        for (var i = 1; i < 6; i++) {
            if (dots[i] > bestDot) {
                bestDot = dots[i];
                bestIdx = i;
            }
        }
        for (var j = 0; j < 6; j++) {
            faces[j].visible = (j === bestIdx) && STATE.mostraEtichettaContenitore;
        }
    }
    if (STATE._containerLabelSprite) STATE._containerLabelSprite.visible = STATE.mostraEtichettaContenitore;
}

// =============================================================================
// HTML REPORT 3D
// =============================================================================

function _buildReportHtml(dati, vista1, vista2, lingua) {
    lingua = lingua === 'en' ? 'en' : 'it';
    var t = function (key, fallback) { return _traduciReport(key, fallback, lingua); };
    var data = _formattaDataReport(dati.data, lingua);
    var stato = _traduciStatoReport(dati.pianoStato, lingua);
    var righe = '';

    dati.oggetti.forEach(function (o) {
        var dims = o.dimCm;
        righe += '<tr>' +
            '<td style="display:flex;align-items:center;gap:6px;">' +
                '<span style="display:inline-block;width:16px;height:16px;border-radius:3px;background:' + o.colore + ';flex-shrink:0;border:1px solid rgba(0,0,0,0.15);box-shadow:0 1px 2px rgba(0,0,0,0.12);"></span>' +
                escapeHtml(o.codice) +
            '</td>' +
            '<td>' + (dims.x ? dims.x.toFixed(1) : '—') + ' × ' + (dims.y ? dims.y.toFixed(1) : '—') + ' × ' + (dims.z ? dims.z.toFixed(1) : '—') + '</td>' +
            '<td style="text-align:center;">' + o.qty + '</td>' +
            '<td style="text-align:right;">' + (o.qty * o.peso).toFixed(1) + '</td>' +
        '</tr>';
    });

    return '<!DOCTYPE html>\n' +
    '<html lang="' + lingua + '">\n' +
    '<head>\n' +
    '<meta charset="UTF-8">\n' +
    '<title>' + escapeHtml(t('report.titolo', 'Report')) + ': ' + escapeHtml(dati.pianoNome) + '</title>\n' +
    '<style>\n' +
    '  * { margin:0; padding:0; box-sizing:border-box; }\n' +
    '  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color:#1a1a2e; padding:20px 24px; font-size:11px; max-width:1100px; margin:0 auto; }\n' +
    '  .report-header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #1a1a2e; padding-bottom:12px; margin-bottom:16px; }\n' +
    '  .report-header-left h1 { font-size:22px; font-weight:800; margin-bottom:2px; }\n' +
    '  .report-header-left .subtitle { font-size:12px; color:#666; }\n' +
    '  .report-header-right { text-align:right; font-size:11px; color:#555; line-height:1.5; }\n' +
    '  .report-print-btn { display:inline-block; margin-top:6px; padding:8px 18px; background:#1a1a2e; color:#fff; border:none; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer; }\n' +
    '  .report-print-btn:hover { background:#2d2d4a; }\n' +
    '  .report-badge { display:inline-block; padding:2px 8px; border-radius:8px; font-size:10px; font-weight:700; }\n' +
    '  .report-badge-green { background:#d4edda; color:#155724; }\n' +
    '  .report-metrics { display:flex; gap:12px; margin-bottom:16px; flex-wrap:nowrap; }\n' +
    '  .report-metric { flex:1 1 0; min-width:0; background:#f5f6f8; border-radius:6px; padding:8px 10px; }\n' +
    '  .report-metric .label { font-size:8px; text-transform:uppercase; color:#888; letter-spacing:.5px; font-weight:700; white-space:nowrap; }\n' +
    '  .report-metric .value { font-size:15px; font-weight:800; color:#1a1a2e; white-space:nowrap; }\n' +
    '  .report-metric .sub { font-size:9px; color:#888; white-space:nowrap; }\n' +
    '  .report-views { display:flex; gap:16px; margin-top:16px; }\n' +
    '  .report-view { flex:1; text-align:center; }\n' +
    '  .report-view img { width:100%; max-height:380px; object-fit:contain; border-radius:6px; }\n' +
    '  .report-view .caption { font-size:10px; font-weight:700; color:#555; margin-top:6px; text-transform:uppercase; letter-spacing:.4px; }\n' +
    '  .report-table { width:100%; border-collapse:collapse; margin-bottom:16px; }\n' +
    '  .report-table th { background:#1a1a2e; color:#fff; padding:8px 10px; text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:.4px; }\n' +
    '  .report-table td { padding:7px 10px; border-bottom:1px solid #e5e5e5; font-size:11px; }\n' +
    '  .report-table tr:nth-child(even) { background:#fafafa; }\n' +
    '  .report-footer { margin-top:20px; padding-top:10px; border-top:1px solid #e5e5e5; font-size:9px; color:#aaa; text-align:center; }\n' +
    '  @media print { html,body { margin:0; padding:10px 16px; max-width:100%; height:auto; -webkit-print-color-adjust:exact; print-color-adjust:exact; } * { -webkit-print-color-adjust:exact; print-color-adjust:exact; } .report-metrics { flex-wrap:nowrap; } .report-metric { background:#fff !important; border:1px solid #ddd; } .report-print-btn { display:none; } .report-view img { width:100%; height:auto; max-height:none; } @page { margin:12mm; margin-top:6mm; size:A4; } }\n' +
    '</style>\n' +
    '</head>\n' +
    '<body>\n' +
    '<div class="report-header">\n' +
    '  <div class="report-header-left"><h1>🚛 ' + escapeHtml(dati.pianoNome) + '</h1><div class="subtitle">' + escapeHtml(t('report.veicolo', 'Veicolo')) + ': ' + escapeHtml(dati.mezzoNome) + ' &nbsp;|&nbsp; ' + dati.mezzoDims + '</div></div>\n' +
    '  <div class="report-header-right"><div>' + escapeHtml(t('report.data', 'Data')) + ': <strong>' + data + '</strong></div><div style="margin-top:4px;"><span class="report-badge report-badge-green">' + escapeHtml(stato) + '</span></div><button class="report-print-btn" onclick="window.print()">🖨️ ' + escapeHtml(t('report.stampa', 'Stampa / Salva PDF')) + '</button></div>\n' +
    '</div>\n' +
    '<div class="report-metrics">\n' +
    '  <div class="report-metric"><div class="label">' + escapeHtml(t('report.saturazione', 'Saturazione')) + '</div><div class="value">' + dati.saturazione.toFixed(1) + '%</div></div>\n' +
    '  <div class="report-metric"><div class="label">' + escapeHtml(t('report.pezzi-totali', 'Pezzi totali')) + '</div><div class="value">' + dati.totPezzi + '</div><div class="sub">' + dati.oggetti.length + ' ' + escapeHtml(t('report.codici', 'codici')) + '</div></div>\n' +
    '  <div class="report-metric"><div class="label">' + escapeHtml(t('report.peso-totale', 'Peso totale')) + '</div><div class="value">' + dati.totPeso.toFixed(0) + ' ' + unitaPeso() + '</div><div class="sub">' + escapeHtml(t('report.max', 'Max')) + ': ' + (dati.pesoTotale || '—') + ' ' + unitaPeso() + '</div></div>\n' +
    '  <div class="report-metric"><div class="label">' + escapeHtml(t('report.metri-lineari', 'Metri lineari')) + '</div><div class="value" style="font-size:15px;">' + dati.mtLineari + '</div></div>\n' +
    '  <div class="report-metric"><div class="label">' + escapeHtml(t('report.volume-occupato', 'Volume occupato')) + '</div><div class="value" style="font-size:15px;">' + formatVolume(dati.volumeM3) + '</div></div>\n' +
    '</div>\n' +
    '<div class="report-views">\n' +
    '  <div class="report-view"><img src="' + vista1 + '" alt="' + escapeHtml(t('report.vista-isometrica-frontale', 'Vista isometrica frontale')) + '"><div class="caption">🔍 ' + escapeHtml(t('report.vista-isometrica-frontale', 'Vista isometrica frontale')) + ' — ' + escapeHtml(t('report.assi', 'Assi')) + ': X→ Y↑ Z↗</div></div>\n' +
    '  <div class="report-view"><img src="' + vista2 + '" alt="' + escapeHtml(t('report.vista-isometrica-posteriore', 'Vista isometrica posteriore')) + '"><div class="caption">🔍 ' + escapeHtml(t('report.vista-isometrica-posteriore', 'Vista isometrica posteriore')) + ' — ' + escapeHtml(t('report.assi', 'Assi')) + ': X← Y↑ Z↙</div></div>\n' +
    '</div>\n' +
    '<table class="report-table"><thead><tr><th>' + escapeHtml(t('report.codice', 'Codice')) + '</th><th>' + escapeHtml(t('report.dimensioni', 'Dimensioni')) + ' (' + unitaDimensione() + ')' + '</th><th style="text-align:center;">' + escapeHtml(t('report.quantita', 'Qtà')) + '</th><th style="text-align:right;">' + escapeHtml(t('report.peso-tot', 'Peso tot')) + ' (' + unitaPeso() + ')' + '</th></tr></thead><tbody>' + righe + '</tbody></table>\n' +
    '<div class="report-footer">' + escapeHtml(t('report.generato-il', 'Report generato il')) + ' ' + data + ' — Carico 3D</div>\n' +
    '</body>\n' +
    '</html>';
}

// Localizza il modello italiano condiviso da Report 3D e Quadranti 2×2.
// I dati del carico restano invariati; vengono tradotte solo le etichette UI.
function _localizzaReportHtml(html, lingua, tipoReport, stato, data) {
    lingua = lingua === 'en' ? 'en' : 'it';
    if (lingua === 'it') return html.replace('<html lang="it">', '<html lang="it">');

    var t = function (key, fallback) {
        return escapeHtml(_traduciReport(key, fallback, lingua));
    };
    var sostituzioni = [
        // ── Intestazioni e metriche ──
        ['Quadranti:', t('report.quadranti-titolo', 'Quadrants report') + ':'],
        ['Report Quadranti generato il', t('report.quadranti-generato-il', 'Quadrants report generated on')],
        ['Report generato il', t('report.generato-il', 'Report generated on')],
        ['Vista isometrica frontale', t('report.vista-isometrica-frontale', 'Front isometric view')],
        ['Vista isometrica posteriore', t('report.vista-isometrica-posteriore', 'Rear isometric view')],
        ['Stampa / Salva PDF', t('report.stampa', 'Print / Save PDF')],
        ['Volume occupato', t('report.volume-occupato', 'Occupied volume')],
        ['Metri lineari', t('report.metri-lineari', 'Linear meters')],
        ['Linear meters', t('report.metri-lineari', 'Metri lineari')],
        ['Peso totale', t('report.peso-totale', 'Total weight')],
        ['Pezzi totali', t('report.pezzi-totali', 'Total pieces')],
        ['Total pieces', t('report.pezzi-totali', 'Pezzi totali')],
        ['Saturazione', t('report.saturazione', 'Saturation')],
        ['Saturation', t('report.saturazione', 'Saturazione')],
        // ── Dimensioni e peso (con unità separata) ──
        ['Dimensioni', t('report.dimensioni', 'Dimensions')],
        ['Dimensions', t('report.dimensioni', 'Dimensioni')],
        ['Peso tot', t('report.peso-tot', 'Total weight')],
        ['Total weight', t('report.peso-tot', 'Peso tot')],
        // ── Label generiche ──
        ['Fronte A', t('report.fronte-a', 'Front A')],
        ['Retro A', t('report.retro-a', 'Rear A')],
        ['3D Isometrica', t('report.isometrica-3d', '3D Isometric')],
        ['Isometrica', t('report.isometrica-3d', '3D Isometric')],
        ['Pianta', t('report.pianta', 'Top view')],
        ['Top view', t('report.pianta', 'Pianta')],
        ['Codice', t('report.codice', 'Code')],
        ['Code', t('report.codice', 'Codice')],
        ['Veicolo:', t('report.veicolo', 'Vehicle') + ':'],
        ['Vehicle:', t('report.veicolo', 'Veicolo') + ':'],
        ['Data:', t('report.data', 'Date') + ':'],
        ['Date:', t('report.data', 'Data') + ':'],
        ['Max:', t('report.max', 'Max') + ':'],
        ['codici', t('report.codici', 'codes')],
        ['codes', t('report.codici', 'codici')],
        ['Qtà', t('report.quantita', 'Qty')],
        ['Qty', t('report.quantita', 'Qtà')],
        ['Assi:', t('report.assi', 'Axes') + ':'],
        ['Axes:', t('report.assi', 'Assi') + ':'],
        ['Report:', t('report.titolo', 'Report') + ':'],
    ];

    if (stato) {
        var statoTradotto = _traduciStatoReport(stato, lingua);
        if (statoTradotto && statoTradotto !== stato) sostituzioni.unshift([stato, statoTradotto]);
    }
    sostituzioni.forEach(function (coppia) {
        html = html.split(coppia[0]).join(coppia[1]);
    });

    html = html.replace('<html lang="it">', '<html lang="' + lingua + '">');
    if (data instanceof Date) {
        var dataIt = _formattaDataReport(data, 'it');
        var dataLingua = _formattaDataReport(data, lingua);
        html = html.split(dataIt).join(dataLingua);
    }
    return html;
}
