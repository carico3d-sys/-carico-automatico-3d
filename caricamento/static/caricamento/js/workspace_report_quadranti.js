/**
 * Workspace Carico 3D — Report Quadranti 2×2 Module
 *
 * Genera un report HTML con griglia 2×2:
 *   Fronte A  |  Retro A
 *   Pianta    |  3D Isometrica
 *
 * + tabella oggetti sotto la griglia.
 *
 * Depends on: workspace_report.js (_catturaVista3D, _aggiornaEtichettePerCamera),
 *             workspace_core.js (WS, STATE, escapeHtml, showToast)
 */

function generaReportQuadranti() {
    if (!STATE.scene || !STATE.renderer || !WS.activePianoId) {
        showToast('Nessun carico 3D attivo da reportizzare.', 'warning');
        return;
    }

    var dati = _raccogliDatiQuadranti();

    var fronte = _catturaVista3D('front', 0.56);
    var retro  = _catturaVista3D('rear', 0.56);
    var pianta = _catturaVista3D('top', 0.56);
    var iso    = _catturaVista3D('isometrica-fronte', 0.96);

    var html = _buildQuadrantiHtml(dati, fronte, retro, pianta, iso);

    var w = window.open('', '_blank', 'width=1100,height=800');
    if (!w) {
        showToast('Popup bloccato.', 'warning');
        return;
    }
    w.document.write(html);
    w.document.close();
    showToast('🧊 Report Quadranti generato!', 'success');
}

function _raccogliDatiQuadranti() {
    var mezzo = WS.contenitori.find(function (c) { return c.id == WS.activeMezzoId; });
    var piano = WS.piani.find(function (p) { return p.id == WS.activePianoId; });
    var oggettiMesh = STATE.oggettiMesh || [];
    var conteggio = {};

    oggettiMesh.forEach(function (group) {
        var ud = group.userData;
        if (!ud || !ud.codice) return;
        var dimCm = ud._tjsDimCm;
        if (!dimCm) {
            var mesh = group.children[0];
            if (mesh && mesh.geometry && mesh.geometry.parameters) {
                var p = mesh.geometry.parameters;
                dimCm = { x: p.width || 0, y: p.height || 0, z: p.depth || 0 };
            } else { return; }
        }
        if (!conteggio[ud.codice]) {
            conteggio[ud.codice] = { codice: ud.codice, qty: 0, dimCm: dimCm, peso: ud.peso || 0, colore: ud.colore || '#447e9b' };
        }
        conteggio[ud.codice].qty++;
    });

    var totPezzi = 0, totPeso = 0;
    Object.values(conteggio).forEach(function (o) { totPezzi += o.qty; totPeso += o.qty * o.peso; });

    var volumeM3 = 0, saturazione = 0;
    if (mezzo) {
        var volContM3 = (mezzo.lunghezza_mm * mezzo.larghezza_mm * mezzo.altezza_mm) / 1e9;
        oggettiMesh.forEach(function (g) {
            var u = g.userData;
            if (u && u._tjsDimCm) volumeM3 += (u._tjsDimCm.x * u._tjsDimCm.y * u._tjsDimCm.z) / 1e6;
        });
        saturazione = volContM3 > 0 ? (volumeM3 / volContM3) * 100 : 0;
    }

    var mtLineari = '—';
    if (oggettiMesh.length > 0 && mezzo) {
        var maxX = 0;
        oggettiMesh.forEach(function (g) {
            var u = g.userData;
            if (u && u._tjsDimCm) { var f = g.position.x + u._tjsDimCm.x / 2; if (f > maxX) maxX = f; }
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

function _buildQuadrantiHtml(dati, fronte, retro, pianta, iso) {
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
    '<title>Quadranti: ' + escapeHtml(dati.pianoNome) + '</title>\n' +
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
    '  .report-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }\n' +
    '  .report-grid-item { text-align: center; border: 1px solid #e5e5e5; border-radius: 6px; overflow: hidden; background: #fafafa; }\n' +
    '  .report-grid-item img { width: 100%; height: auto; display: block; }\n' +
    '  .report-grid-caption { font-size: 9px; font-weight: 700; color: #555; padding: 5px 8px; text-transform: uppercase; letter-spacing: 0.4px; background: #fff; border-top: 1px solid #e5e5e5; }\n' +
    '  .report-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }\n' +
    '  .report-table th { background: #1a1a2e; color: #fff; padding: 8px 10px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; }\n' +
    '  .report-table td { padding: 7px 10px; border-bottom: 1px solid #e5e5e5; font-size: 11px; }\n' +
    '  .report-table tr:nth-child(even) { background: #fafafa; }\n' +
    '  .report-footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #e5e5e5; font-size: 9px; color: #aaa; text-align: center; }\n' +
    '  @media print {\n' +
    '    html, body { margin: 0; padding: 10px 16px; max-width: 100%; height: auto; -webkit-print-color-adjust: exact; print-color-adjust: exact; }\n' +
    '    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }\n' +
    '    .report-metrics { flex-wrap: nowrap; }\n' +
    '    .report-metric { background: #fff !important; border: 1px solid #ddd; flex: 1 1 0; min-width: 0; }\n' +
    '    .report-print-btn { display: none; }\n' +
    '    .report-grid-item { border: 1px solid #ccc; background: #fff; }\n' +
    '    .report-grid-caption { background: #fff; border-top: 1px solid #ccc; }\n' +
    '    @page { margin: 12mm; margin-top: 6mm; size: A4; }\n' +
    '  }\n' +
    '</style>\n' +
    '</head>\n' +
    '<body>\n' +
    '<div class="report-header">\n' +
    '  <div class="report-header-left">\n' +
    '    <h1>🧊 ' + escapeHtml(dati.pianoNome) + '</h1>\n' +
    '    <div class="subtitle">Veicolo: ' + escapeHtml(dati.mezzoNome) + ' &nbsp;|&nbsp; ' + dati.mezzoDims + '</div>\n' +
    '  </div>\n' +
    '  <div class="report-header-right">\n' +
    '    <div>Data: <strong>' + dati.data + '</strong></div>\n' +
    '    <div style="margin-top:4px;"><span class="report-badge report-badge-green">' + escapeHtml(dati.pianoStato) + '</span></div>\n' +
    '    <button class="report-print-btn" onclick="window.print()">🖨️ Stampa / Salva PDF</button>\n' +
    '  </div>\n' +
    '</div>\n' +
    '<div class="report-metrics">\n' +
    '  <div class="report-metric"><div class="label">Saturazione</div><div class="value">' + dati.saturazione.toFixed(1) + '%</div></div>\n' +
    '  <div class="report-metric"><div class="label">Pezzi totali</div><div class="value">' + dati.totPezzi + '</div><div class="sub">' + dati.oggetti.length + ' codici</div></div>\n' +
    '  <div class="report-metric"><div class="label">Peso totale</div><div class="value">' + dati.totPeso.toFixed(0) + ' kg</div><div class="sub">Max: ' + (dati.pesoTotale || '—') + ' kg</div></div>\n' +
    '  <div class="report-metric"><div class="label">Metri lineari</div><div class="value" style="font-size:15px;">' + dati.mtLineari + '</div></div>\n' +
    '  <div class="report-metric"><div class="label">Volume occupato</div><div class="value" style="font-size:15px;">' + dati.volumeM3.toFixed(1) + ' m³</div></div>\n' +
    '</div>\n' +
    '<div class="report-grid">\n' +
    '  <div class="report-grid-item"><img src="' + fronte + '" alt="Fronte"><div class="report-grid-caption">🔍 Fronte A</div></div>\n' +
    '  <div class="report-grid-item"><img src="' + retro + '" alt="Retro"><div class="report-grid-caption">🔍 Retro A</div></div>\n' +
    '  <div class="report-grid-item"><img src="' + pianta + '" alt="Pianta"><div class="report-grid-caption">📐 Pianta</div></div>\n' +
    '  <div class="report-grid-item"><img src="' + iso + '" alt="Isometrica"><div class="report-grid-caption">🧊 3D Isometrica</div></div>\n' +
    '</div>\n' +
    '<table class="report-table">\n' +
    '  <thead><tr><th>Codice</th><th>Dimensioni (cm)</th><th style="text-align:center;">Qtà</th><th style="text-align:right;">Peso tot (kg)</th></tr></thead>\n' +
    '  <tbody>' + righeTabella + '</tbody>\n' +
    '</table>\n' +
    '<div class="report-footer">Report Quadranti generato il ' + dati.data + ' — Carico 3D</div>\n' +
    '</body>\n' +
    '</html>';
}
