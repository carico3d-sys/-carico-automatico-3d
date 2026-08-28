/**
 * Workspace Carico 3D — Report Stampa Module
 *
 * Genera un report HTML stampabile con:
 * - Intestazione (dati generali del carico)
 * - Tabella oggetti (codice, misure, qta, peso)
 * - 2 viste 3D isometriche a specchio (frontale-destra e posteriore-sinistra)
 *
 * Depends on: workspace_core.js (WS, DOM, STATE), Three.js
 */

// =============================================================================
// REPORT: GENERAZIONE E APERTURA
// =============================================================================

function generaReport() {
    if (!STATE.scene || !STATE.renderer || !WS.activePianoId) {
        showToast('Nessun carico 3D attivo da reportizzare.', 'warning');
        return;
    }

    var dati = _raccogliDatiReport();
    var vista1 = _catturaVista3D('isometrica-fronte');
    var vista2 = _catturaVista3D('isometrica-retro');
    var html = _buildReportHtml(dati, vista1, vista2);

    var w = window.open('', '_blank', 'width=1100,height=800');
    if (!w) {
        showToast('Popup bloccato. Consenti i popup per questo sito.', 'warning');
        return;
    }
    w.document.write(html);
    w.document.close();
    showToast('📄 Report generato! Usa il pulsante Stampa / Salva PDF in alto a destra.', 'success');
}

// =============================================================================
// RACCOLTA DATI
// =============================================================================

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
            } else { return; }
        }
        var colore = ud.colore || '#447e9b';
        var chiave = codice + '|' + colore;
        if (!conteggio[chiave]) {
            conteggio[chiave] = {
                codice: codice, qty: 0, dimCm: dimCm,
                peso: ud.peso || 0, colore: colore,
            };
        }
        conteggio[chiave].qty++;
    });

    var totPezzi = 0, totPeso = 0;
    Object.values(conteggio).forEach(function (o) { totPezzi += o.qty; totPeso += o.qty * o.peso; });

    var volumeM3 = 0, saturazione = 0;
    if (mezzo) {
        var volContM3 = (mezzo.lunghezza_mm * mezzo.larghezza_mm * mezzo.altezza_mm) / 1e9;
        oggettiMesh.forEach(function (group) {
            var ud = group.userData;
            if (!ud || !ud._tjsDimCm) return;
            volumeM3 += (ud._tjsDimCm.x * ud._tjsDimCm.y * ud._tjsDimCm.z) / 1e6;
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
        mtLineari = (maxX / 100).toFixed(1) + ' / ' + (mezzo.lunghezza_mm / 1000).toFixed(1) + ' m';
    }

    return {
        pianoNome: piano ? piano.nome : ('Piano #' + WS.activePianoId),
        pianoStato: piano ? (piano.stato_display || piano.stato || 'Completato') : 'Completato',
        mezzoNome: mezzo ? mezzo.nome : 'N/D',
        mezzoDims: mezzo ? (mezzo.lunghezza_mm/10).toFixed(0) + '×' + (mezzo.larghezza_mm/10).toFixed(0) + '×' + (mezzo.altezza_mm/10).toFixed(0) + ' cm' : 'N/D',
        data: new Date().toLocaleDateString('it-IT'),
        totPezzi: totPezzi, totPeso: totPeso, pesoTotale: totPeso,
        saturazione: saturazione, volumeM3: volumeM3, mtLineari: mtLineari,
        oggetti: Object.values(conteggio).sort(function (a, b) { return a.codice.localeCompare(b.codice); }),
    };
}

// =============================================================================
// CATTURA VISTE 3D
// =============================================================================

function _catturaVista3D(tipo, zoom) {
    if (zoom === undefined) zoom = 1;
    var scene = STATE.scene;
    var IMG_W = 2400, IMG_H = 1800;

    var bgOriginal = scene.background;
    scene.background = null;

    var grigliaVisible = STATE.grigliaMesh ? STATE.grigliaMesh.visible : true;
    if (STATE.grigliaMesh) STATE.grigliaMesh.visible = false;

    var offCanvas = document.createElement('canvas');
    offCanvas.width = IMG_W; offCanvas.height = IMG_H;

    var offRenderer = new THREE.WebGLRenderer({ canvas: offCanvas, antialias: true, preserveDrawingBuffer: true, alpha: true });
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
        var sz = new THREE.Vector3(); box.getSize(sz);
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

    // Luce temporanea dalla posizione camera: evita che la vista posteriore
    // risulti piu' scura di quella frontale (la luce principale arriva da +Z).
    var tempFill = new THREE.DirectionalLight(0xffffff, 0.5);
    tempFill.position.copy(offCamera.position);
    scene.add(tempFill);

    offRenderer.render(scene, offCamera);

    scene.remove(tempFill);

    scene.background = bgOriginal;
    if (STATE.grigliaMesh) STATE.grigliaMesh.visible = grigliaVisible;

    var dataUrl = offCanvas.toDataURL('image/png');
    offRenderer.dispose();
    return dataUrl;
}

function _aggiornaEtichettePerCamera(camera) {
    var camWorld = new THREE.Vector3(), camLocal = new THREE.Vector3();
    camWorld.copy(camera.position);

    STATE.oggettiMesh.forEach(function (group) {
        var mesh = group.children[0];
        if (!mesh || mesh.type !== 'Mesh') return;
        var decalFaces = mesh.userData._decalFaces;
        if (!decalFaces || decalFaces.length < 6) return;
        mesh.worldToLocal(camLocal.copy(camWorld));
        var lx = camLocal.x, ly = camLocal.y, lz = camLocal.z;
        decalFaces[0].visible = (lz > 0) && STATE.mostraEtichetteOggetti;
        decalFaces[1].visible = (lz < 0) && STATE.mostraEtichetteOggetti;
        decalFaces[2].visible = (lx > 0) && STATE.mostraEtichetteOggetti;
        decalFaces[3].visible = (lx < 0) && STATE.mostraEtichetteOggetti;
        decalFaces[4].visible = (ly > 0) && STATE.mostraEtichetteOggetti;
        decalFaces[5].visible = (ly < 0) && STATE.mostraEtichetteOggetti;
    });

    if (STATE._containerDecalFaces && STATE._containerWalls) {
        STATE._containerWalls.worldToLocal(camLocal.copy(camWorld));
        var clx = camLocal.x, cly = camLocal.y, clz = camLocal.z;
        var cdf = STATE._containerDecalFaces;
        var dots = [clz, -clz, clx, -clx, cly, -cly];
        var bestIdx = 0, bestDot = dots[0];
        for (var di = 1; di < 6; di++) { if (dots[di] > bestDot) { bestDot = dots[di]; bestIdx = di; } }
        for (var dj = 0; dj < 6; dj++) { cdf[dj].visible = (dj === bestIdx) && STATE.mostraEtichettaContenitore; }
    }
    if (STATE._containerLabelSprite) { STATE._containerLabelSprite.visible = STATE.mostraEtichettaContenitore; }
}

// =============================================================================
// COSTRUZIONE HTML REPORT
// =============================================================================

function _buildReportHtml(dati, vista1, vista2) {
    var righeTabella = '';
    dati.oggetti.forEach(function (o) {
        var dims = o.dimCm;
        righeTabella +=
            '<tr>' +
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
    '<html lang="it">\n' +
    '<head>\n' +
    '<meta charset="UTF-8">\n' +
    '<title>Report: ' + escapeHtml(dati.pianoNome) + '</title>\n' +
    '<style>\n' +
    '  * { margin:0; padding:0; box-sizing:border-box; }\n' +
    '  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #1a1a2e; padding: 20px 24px; font-size: 11px; max-width: 1100px; margin: 0 auto; }\n' +
    '  .report-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1a1a2e; padding-bottom: 12px; margin-bottom: 16px; }\n' +
    '  .report-header-left h1 { font-size: 22px; font-weight: 800; margin-bottom: 2px; }\n' +
    '  .report-header-left .subtitle { font-size: 12px; color: #666; }\n' +
    '  .report-header-right { text-align: right; font-size: 11px; color: #555; line-height: 1.5; }\n' +
    '  .report-print-btn { display: inline-block; margin-top: 6px; padding: 8px 18px; background: #1a1a2e; color: #fff; border: none; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer; letter-spacing: 0.3px; transition: background 0.2s; }\n' +
    '  .report-print-btn:hover { background: #2d2d4a; }\n' +
    '  .report-badge { display: inline-block; padding: 2px 8px; border-radius: 8px; font-size: 10px; font-weight: 700; }\n' +
    '  .report-badge-green { background: #d4edda; color: #155724; }\n' +
    '  .report-metrics { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: nowrap; }\n' +
    '  .report-metric { flex: 1 1 0; min-width: 0; background: #f5f6f8; border-radius: 6px; padding: 8px 10px; }\n' +
    '  .report-metric .label { font-size: 8px; text-transform: uppercase; color: #888; letter-spacing: 0.5px; font-weight: 700; white-space: nowrap; }\n' +
    '  .report-metric .value { font-size: 15px; font-weight: 800; color: #1a1a2e; white-space: nowrap; }\n' +
    '  .report-metric .sub { font-size: 9px; color: #888; white-space: nowrap; }\n' +
    '  .report-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }\n' +
    '  .report-table th { background: #1a1a2e; color: #fff; padding: 8px 10px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; }\n' +
    '  .report-table td { padding: 7px 10px; border-bottom: 1px solid #e5e5e5; font-size: 11px; }\n' +
    '  .report-table tr:nth-child(even) { background: #fafafa; }\n' +
    '  .report-views { display: flex; gap: 16px; margin-top: 16px; }\n' +
    '  .report-view { flex: 1; text-align: center; }\n' +
    '  .report-view img { width: 100%; max-height: 380px; object-fit: contain; border-radius: 6px; }\n' +
    '  .report-view .caption { font-size: 10px; font-weight: 700; color: #555; margin-top: 6px; text-transform: uppercase; letter-spacing: 0.4px; }\n' +
    '  .report-footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #e5e5e5; font-size: 9px; color: #aaa; text-align: center; }\n' +
    '  @media print {\n' +
    '    html, body { margin: 0; padding: 10px 16px; max-width: 100%; height: auto; -webkit-print-color-adjust: exact; print-color-adjust: exact; }\n' +
    '    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }\n' +
    '    .report-metrics { flex-wrap: nowrap; }\n' +
    '    .report-metric { background: #fff !important; border: 1px solid #ddd; flex: 1 1 0; min-width: 0; }\n' +
    '    .report-print-btn { display: none; }\n' +
    '    .report-view img { width: 100%; height: auto; max-height: none; }\n' +
    '    @page { margin: 12mm; margin-top: 6mm; size: A4; }\n' +
    '  }\n' +
    '</style>\n' +
    '</head>\n' +
    '<body>\n' +
    '\n' +
    '<div class="report-header">\n' +
    '  <div class="report-header-left">\n' +
    '    <h1>🚛 ' + escapeHtml(dati.pianoNome) + '</h1>\n' +
    '    <div class="subtitle">Veicolo: ' + escapeHtml(dati.mezzoNome) + ' &nbsp;|&nbsp; ' + dati.mezzoDims + '</div>\n' +
    '  </div>\n' +
    '  <div class="report-header-right">\n' +
    '    <div>Data: <strong>' + dati.data + '</strong></div>\n' +
    '    <div style="margin-top:4px;"><span class="report-badge report-badge-green">' + escapeHtml(dati.pianoStato) + '</span></div>\n' +
    '    <button class="report-print-btn" onclick="window.print()">🖨️ Stampa / Salva PDF</button>\n' +
    '  </div>\n' +
    '</div>\n' +
    '\n' +
    '<div class="report-metrics">\n' +
    '  <div class="report-metric"><div class="label">Saturazione</div><div class="value">' + dati.saturazione.toFixed(1) + '%</div></div>\n' +
    '  <div class="report-metric"><div class="label">Pezzi totali</div><div class="value">' + dati.totPezzi + '</div><div class="sub">' + dati.oggetti.length + ' codici</div></div>\n' +
    '  <div class="report-metric"><div class="label">Peso totale</div><div class="value">' + dati.totPeso.toFixed(0) + ' kg</div><div class="sub">Max: ' + (dati.pesoTotale || '—') + ' kg</div></div>\n' +
    '  <div class="report-metric"><div class="label">Metri lineari</div><div class="value" style="font-size:15px;">' + dati.mtLineari + '</div></div>\n' +
    '  <div class="report-metric"><div class="label">Volume occupato</div><div class="value" style="font-size:15px;">' + dati.volumeM3.toFixed(1) + ' m³</div></div>\n' +
    '</div>\n' +
    '\n' +
    '<div class="report-views">\n' +
    '  <div class="report-view">\n' +
    '    <img src="' + vista1 + '" alt="Vista isometrica frontale">\n' +
    '    <div class="caption">🔍 Vista isometrica frontale — Assi: X→ Y↑ Z↗</div>\n' +
    '  </div>\n' +
    '  <div class="report-view">\n' +
    '    <img src="' + vista2 + '" alt="Vista isometrica posteriore">\n' +
    '    <div class="caption">🔍 Vista isometrica posteriore — Assi: X← Y↑ Z↙</div>\n' +
    '  </div>\n' +
    '</div>\n' +
    '\n' +
    '<table class="report-table">\n' +
    '  <thead><tr><th>Codice</th><th>Dimensioni (cm)</th><th style="text-align:center;">Qtà</th><th style="text-align:right;">Peso tot (kg)</th></tr></thead>\n' +
    '  <tbody>' + righeTabella + '</tbody>\n' +
    '</table>\n' +
    '\n' +
    '<div class="report-footer">Report generato il ' + dati.data + ' — Carico 3D</div>\n' +
    '\n' +
    '</body>\n' +
    '</html>';
}
