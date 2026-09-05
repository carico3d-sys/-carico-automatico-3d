/*
 * Excel per l'anagrafica oggetti.
 * Dipende da workspace_core.js, workspace_panels_oggetti.js e workspace.js.
 */
(function () {
    var importModaleAperto = false;

    function traduciExcel(key, fallback) {
        var lingua = window.CARICO3D_LANGUAGE === 'en' ? 'en' : 'it';
        var dizionario = window.DIZIONARIO && window.DIZIONARIO[lingua];
        return (dizionario && dizionario[key]) || fallback;
    }

    function aggiornaTestiModaleExcel() {
        if (!importModaleAperto) return;
        var titolo = document.getElementById('modal-title');
        var descrizione = document.getElementById('excel-import-descrizione');
        var fileLabel = document.getElementById('excel-import-file-label');
        var modalitaLabel = document.getElementById('excel-import-modalita-label');
        var nota = document.getElementById('excel-import-nota');
        var modalita = document.getElementById('excel-oggetti-modalita');
        var annulla = document.getElementById('modal-cancel');
        var conferma = document.getElementById('modal-confirm');

        if (titolo) titolo.textContent = traduciExcel('excel.import.titolo', 'Importa oggetti da Excel');
        if (descrizione) descrizione.innerHTML = traduciExcel(
            'excel.import.descrizione',
            'Seleziona un file .xlsx con i fogli Oggetti, Rotazioni e Vincoli.'
        );
        if (fileLabel) fileLabel.textContent = traduciExcel('excel.import.file', 'File Excel');
        if (modalitaLabel) modalitaLabel.textContent = traduciExcel('excel.import.modalita', 'Modalità');
        if (nota) nota.textContent = traduciExcel(
            'excel.import.nota',
            'Aggiungi non crea duplicati. Aggiorna usa il Codice. Ripristina sostituisce i vincoli tra gli oggetti presenti nel file.'
        );
        if (modalita) {
            var opzioni = {
                add: ['excel.import.aggiungi', 'Aggiungi'],
                update: ['excel.import.aggiorna', 'Aggiorna'],
                restore: ['excel.import.ripristina', 'Ripristina']
            };
            Array.prototype.forEach.call(modalita.options, function (option) {
                var entry = opzioni[option.value];
                if (entry) option.textContent = traduciExcel(entry[0], entry[1]);
            });
        }
        if (annulla) annulla.textContent = traduciExcel('modal.annulla', 'Annulla');
        if (conferma) conferma.textContent = traduciExcel('modal.conferma', 'Conferma');
    }

    document.addEventListener('carico3d:language-change', function () {
        aggiornaTestiModaleExcel();
    });
    function oggettiSelezionatiExcel() {
        var ids = [];
        if (typeof _multiSelState !== 'undefined' && Array.isArray(_multiSelState.oggettiSelezionati)) {
            ids = _multiSelState.oggettiSelezionati.slice();
        }
        // Se un solo oggetto è aperto, la selezione grafica resta disponibile
        // anche quando l'utente non ha premuto Ctrl/Shift.
        if (!ids.length) {
            var selected = document.querySelector('#pv-list-body .pv-list-item.selected-multi, #pv-list-body .pv-list-item.selected');
            if (selected) ids.push(parseInt(selected.dataset.oggettoId, 10));
        }
        return ids.filter(function (id, index) { return id && ids.indexOf(id) === index; });
    }

    function messaggioErroreExcel(response) {
        return response.text().then(function (text) {
            try {
                var data = JSON.parse(text);
                return data.errore || data.detail || ('HTTP ' + response.status);
            } catch (_) {
                return 'HTTP ' + response.status;
            }
        });
    }

    function esportaOggettiExcel() {
        var ids = oggettiSelezionatiExcel();
        if (!ids.length) {
            showToast('Seleziona almeno un oggetto da esportare.', 'warning');
            return;
        }
        var button = document.getElementById('btn-oggetti-export-excel');
        if (button) button.disabled = true;
        fetch('/api/oggetti/export-excel/?ids=' + encodeURIComponent(ids.join(',')))
            .then(function (response) {
                if (!response.ok) return messaggioErroreExcel(response).then(function (message) { throw new Error(message); });
                return response.blob();
            }).then(function (blob) {
                var url = URL.createObjectURL(blob);
                var link = document.createElement('a');
                link.href = url;
                link.download = 'oggetti_loadplanner3d.xlsx';
                document.body.appendChild(link);
                link.click();
                link.remove();
                URL.revokeObjectURL(url);
                showToast('File Excel esportato.', 'success');
            }).catch(function (error) {
                showToast('Errore esportazione Excel: ' + error.message, 'error');
            }).finally(function () {
                if (button) button.disabled = false;
            });
    }

    function importaOggettiExcel(file, modalita) {
        if (!file) {
            showToast('Seleziona un file Excel.', 'warning');
            return;
        }
        var formData = new FormData();
        formData.append('file', file);
        formData.append('modalita', modalita);
        setStatus('busy', 'Importazione Excel...');
        fetch('/api/oggetti/import-excel/', {
            method: 'POST',
            headers: { 'X-CSRFToken': getCSRFToken() },
            body: formData,
        }).then(function (response) {
            if (!response.ok) return messaggioErroreExcel(response).then(function (message) { throw new Error(message); });
            return response.json();
        }).then(function (data) {
            importModaleAperto = false;
            chiudiModale();
            showToast(
                'Excel importato: ' + (data.oggetti_aggiunti || 0) + ' aggiunti, ' +
                (data.oggetti_aggiornati || 0) + ' aggiornati, ' +
                (data.vincoli_importati || 0) + ' vincoli importati.',
                'success'
            );
            setStatus('idle', 'Importato');
            // Il workspace contiene anche i cataloghi e i vincoli in memoria:
            // un reload evita dati parzialmente desincronizzati.
            setTimeout(function () { window.location.reload(); }, 700);
        }).catch(function (error) {
            setStatus('error', 'Errore importazione');
            showToast('Importazione Excel non eseguita: ' + error.message, 'error');
        });
    }

    function apriImportazioneOggettiExcel() {
        var bodyHtml =
            '<p id="excel-import-descrizione" style="margin-top:0;">Seleziona un file .xlsx con i fogli Oggetti, Rotazioni e Vincoli.</p>' +
            '<div class="field-group">' +
                '<label class="field-label" id="excel-import-file-label" for="excel-oggetti-file">File Excel</label>' +
                '<input type="file" class="form-input" id="excel-oggetti-file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">' +
            '</div>' +
            '<div class="field-group">' +
                '<label class="field-label" id="excel-import-modalita-label" for="excel-oggetti-modalita">Modalità</label>' +
                '<select class="form-select" id="excel-oggetti-modalita">' +
                    '<option value="add">Aggiungi</option>' +
                    '<option value="update">Aggiorna</option>' +
                    '<option value="restore">Ripristina</option>' +
                '</select>' +
            '</div>' +
            '<p id="excel-import-nota" style="font-size:11px;color:#777;margin-bottom:0;">Aggiungi non crea duplicati. Aggiorna usa il Codice. Ripristina sostituisce i vincoli tra gli oggetti presenti nel file.</p>';

        importModaleAperto = true;
        apriModale(traduciExcel('excel.import.titolo', 'Importa oggetti da Excel'), bodyHtml, function () {
            var fileInput = document.getElementById('excel-oggetti-file');
            var modeInput = document.getElementById('excel-oggetti-modalita');
            importaOggettiExcel(fileInput && fileInput.files[0], modeInput ? modeInput.value : 'add');
        });
        var modalCancel = document.getElementById('modal-cancel');
        var modalClose = document.getElementById('modal-close');
        if (modalCancel) {
            modalCancel.onclick = function () {
                importModaleAperto = false;
                chiudiModale();
            };
        }
        if (modalClose) {
            modalClose.onclick = function () {
                importModaleAperto = false;
                chiudiModale();
            };
        }
        aggiornaTestiModaleExcel();
    }

    function inizializzaOggettiExcel() {
        var exportButton = document.getElementById('btn-oggetti-export-excel');
        var importButton = document.getElementById('btn-oggetti-import-excel');
        if (exportButton) exportButton.addEventListener('click', esportaOggettiExcel);
        if (importButton) importButton.addEventListener('click', apriImportazioneOggettiExcel);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inizializzaOggettiExcel);
    } else {
        inizializzaOggettiExcel();
    }
})();
