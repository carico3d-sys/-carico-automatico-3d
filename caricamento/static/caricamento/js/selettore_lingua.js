/* Selettore lingua dell'interfaccia. */
(function () {
    'use strict';

    // Prefer server-side value over localStorage
    var langSelect = document.getElementById('header-lang-select');
    var serverLingua = langSelect && langSelect.getAttribute('data-server-lingua');
    var linguaSalvata = serverLingua || window.localStorage.getItem('carico3d-language') || 'en';
    var linguaCorrente = 'it';

    function traduci(key, fallback, lingua) {
        var dizionario = window.DIZIONARIO && window.DIZIONARIO[lingua];
        return (dizionario && dizionario[key]) || fallback;
    }

    function aggiornaHeader(lingua) {
        var labels = document.querySelectorAll('#header-categories .header-cat-btn');
        labels.forEach(function (button) {
            var label = button.querySelector('.header-cat-label');
            if (!label) return;
            var cat = button.dataset.cat;
            var key = 'header.' + ({
                documenti: 'documenti',
                anagrafica: 'anagrafica',
                'goto-manuale': 'manuale',
                'goto-automatica': 'auto',
                'toggle-vista': 'vista',
                report: 'report',
                sistema: 'sistema'
            }[cat] || cat);
            label.textContent = traduci(key, label.dataset.italiano || label.textContent, lingua);
        });

        [['#header-logout', 'header.esci'], ['#header-logout-full', 'header.logout']].forEach(function (entry) {
            var link = document.querySelector(entry[0]);
            if (!link) return;
            var testo = link.querySelector('.language-label');
            if (!testo) return;
            testo.textContent = traduci(entry[1], testo.dataset.italiano || testo.textContent, lingua);
        });
    }

    function aggiornaSidebar(lingua) {
        var mappa = {
            documenti: 'sidebar.documenti',
            anagrafica: 'sidebar.anagrafica',
            manuale: 'sidebar.manuale',
            automatica: 'sidebar.automatica'
        };
        document.querySelectorAll('#sidebar-tabs .sidebar-tab').forEach(function (tab) {
            var label = tab.querySelector('.sidebar-tab-label');
            if (!label) return;
            var key = mappa[tab.dataset.tab];
            if (key) label.textContent = traduci(key, label.dataset.italiano || label.textContent, lingua);
        });
    }

    function aggiornaElementiTraducibili(root, lingua) {
        var base = root || document;
        base.querySelectorAll('[data-translation-key]').forEach(function (element) {
            var fallback = element.dataset.italiano || element.textContent.trim();
            var testo = traduci(element.dataset.translationKey, fallback, lingua);
            if (element.tagName === 'INPUT') element.placeholder = testo;
            else if (element.tagName === 'OPTION') element.textContent = testo;
            else element.textContent = testo;
        });
    }

    function aggiornaPannelloDestro(lingua) {
        document.querySelectorAll('#panel-destro [data-translation-key]').forEach(function (element) {
            var testo = element.dataset.italiano || element.textContent;
            var tradotto = traduci(element.dataset.translationKey, testo, lingua);
            if (element.tagName === 'INPUT') element.placeholder = tradotto;
            else if (element.tagName === 'OPTION') element.textContent = tradotto;
            else element.textContent = tradotto;
        });
    }

    function aggiornaRiepilogo(lingua) {
        document.querySelectorAll('#sidebar-riepilogo [data-translation-key]').forEach(function (element) {
            element.textContent = traduci(element.dataset.translationKey, element.dataset.italiano || element.textContent, lingua);
        });
    }

    function aggiornaTestiAuto(lingua) {
        document.querySelectorAll('#sidebar-auto-panel [data-translation-key]').forEach(function (element) {
            element.textContent = traduci(element.dataset.translationKey, element.dataset.italiano || element.textContent.trim(), lingua);
        });
    }

    function aggiornaMenuSidebar(lingua) {
        document.querySelectorAll('#sidebar-nav-dynamic [data-translation-key], #sidebar-anagrafica-dynamic [data-translation-key], #sidebar-nav-dynamic [data-view="impostazioni"]').forEach(function (item) {
            var label = item.querySelector('.language-label');
            if (!label) return;
            var key = item.dataset.translationKey || 'sidebar.impostazioni';
            label.textContent = traduci(key, label.dataset.italiano || label.textContent, lingua);
        });
        var mappa = {
            oggetti: 'sidebar.oggetti',
            vincoli: 'sidebar.vincoli',
            mezzi: 'sidebar.trasporti'
        };
        document.querySelectorAll('#sidebar-anagrafica-dynamic [data-view]').forEach(function (item) {
            var label = item.querySelector('.language-label');
            var key = mappa[item.dataset.view];
            if (label && key) label.textContent = traduci(key, label.dataset.italiano || label.textContent, lingua);
        });
    }

    function aggiornaMenuDocumenti(lingua) {
        aggiornaMenuSidebar(lingua);
    }

    function aggiornaLingua(lingua) {
        linguaCorrente = lingua === 'en' ? 'en' : 'it';
        window.applicaTraduzioni = function (root) {
            aggiornaElementiTraducibili(root || document, linguaCorrente);
        };
        var langSelect = document.getElementById('header-lang-select');
        if (langSelect) langSelect.value = linguaCorrente;
        document.documentElement.lang = linguaCorrente;
        window.CARICO3D_LANGUAGE = linguaCorrente;
        window.localStorage.setItem('carico3d-language', linguaCorrente);
        // Save to backend if user is logged in
        if (document.querySelector('meta[name="user-id"]') || document.getElementById('header-user')) {
            // Get CSRF token from cookie
            function getCookie(name) {
                var v = null;
                document.cookie.split(';').forEach(function(c) {
                    c = c.trim();
                    if (c.startsWith(name + '=')) v = decodeURIComponent(c.substring(name.length + 1));
                });
                return v;
            }
            fetch('/api/user-lingua/', {
                method: 'PUT',
                headers: {'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') || ''},
                body: JSON.stringify({lingua: linguaCorrente})
            }).catch(function() {});  // Silent fail if not logged in
        }
        aggiornaHeader(linguaCorrente);
        aggiornaSidebar(linguaCorrente);
        aggiornaMenuSidebar(linguaCorrente);
        aggiornaTestiAuto(linguaCorrente);
        aggiornaRiepilogo(linguaCorrente);
        aggiornaElementiTraducibili(document.getElementById('panel-view'), linguaCorrente);
        aggiornaPannelloDestro(linguaCorrente);
        aggiornaElementiTraducibili(document.getElementById('panel-view'), linguaCorrente);
        if (typeof _applyButtonConfig === 'function') _applyButtonConfig(true);
        document.dispatchEvent(new CustomEvent('carico3d:language-change', {
            detail: { language: linguaCorrente }
        }));
        // Il placeholder contiene testo generato dinamicamente: ricostruiscilo
        // subito quando l'utente cambia lingua, senza attendere un nuovo render.
        var placeholder = document.getElementById('viewport-placeholder');
        if (placeholder && placeholder.style.display !== 'none' && typeof applicaTraduzioni === 'function') {
            applicaTraduzioni(placeholder);
        }
        // I pannelli anagrafici sono dinamici: il render deve avvenire dopo
        // l'evento, altrimenti i listener possono ricostruire il pannello in IT.
        window.setTimeout(function () {
            if (typeof renderMezziForm === 'function') {
                var mezzoSelezionato = document.querySelector('#panel-view-list .pv-list-item.selected');
                if (mezzoSelezionato && mezzoSelezionato.dataset.mezzoId) {
                    renderMezziForm(parseInt(mezzoSelezionato.dataset.mezzoId, 10));
                }
            }
            aggiornaElementiTraducibili(document.getElementById('panel-view'), linguaCorrente);
        }, 0);
    }

    document.addEventListener('carico3d:sidebar-rendered', function () {
        aggiornaMenuSidebar(linguaCorrente);
        aggiornaTestiAuto(linguaCorrente);
        aggiornaRiepilogo(linguaCorrente);
        aggiornaElementiTraducibili(document.getElementById('panel-view'), linguaCorrente);
        aggiornaPannelloDestro(linguaCorrente);
        aggiornaElementiTraducibili(document.getElementById('panel-view'), linguaCorrente);
    });

    document.addEventListener('carico3d:panel-rendered', function () {
        aggiornaElementiTraducibili(document.getElementById('panel-view'), linguaCorrente);
        aggiornaMenuSidebar(linguaCorrente);
        aggiornaTestiAuto(linguaCorrente);
        aggiornaPannelloDestro(linguaCorrente);
    });

    document.addEventListener('change', function (event) {
        var sel = event.target.closest('#header-lang-select');
        if (sel) aggiornaLingua(sel.value);
    });

    document.addEventListener('carico3d:icon-config-ready', function () {
        var placeholder = document.getElementById('viewport-placeholder');
        if (placeholder && typeof mostraPlaceholder === 'function') mostraPlaceholder();
    });

    document.addEventListener('DOMContentLoaded', function () {
        document.querySelectorAll('#header-categories .header-cat-label, #sidebar-tabs .sidebar-tab-label').forEach(function (label) {
            label.dataset.italiano = label.textContent.trim();
        });
        aggiornaLingua(linguaSalvata);
    });
})();
