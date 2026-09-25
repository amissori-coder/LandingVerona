/* ============================================================
   ANTEPRIMA DELLA DIRETTA - il guscio
   ------------------------------------------------------------
   Le schede Guida, Partecipante, Gestione e Posta di prova. Le pagine
   vere della diretta girano in iframe "srcdoc" (stessa origine del
   guscio: cosi' raggiungono il motore, window.NGBA). Ogni iframe e' un
   "dispositivo": il telefono del partecipante e il computer della regia
   hanno accessi separati, come nella realta'.
   ============================================================ */
(function () {
    'use strict';
    var M = window.NGBA;
    var PAGINE = window.NGBA_PAGINE || {};
    var ID_EVENTO = 'napoli-anteprima';
    var SITO = 'https://nextgenerationbusiness.it';
    function $(id) { return document.getElementById(id); }
    function testo(el, t) { el.textContent = t == null ? '' : String(t); }
    function crea(tag, attr, figli) {
        var el = document.createElement(tag);
        Object.keys(attr || {}).forEach(function (k) {
            if (k === 'testo') el.textContent = attr[k];
            else if (k === 'classe') el.className = attr[k];
            else el.setAttribute(k, attr[k]);
        });
        (figli || []).forEach(function (f) { if (f) el.appendChild(f); });
        return el;
    }
    var memoria = {
        leggi: function (k) { try { return localStorage.getItem('ngbAnteprimaGuscio.' + k); } catch (e) { return null; } },
        scrivi: function (k, v) { try { localStorage.setItem('ngbAnteprimaGuscio.' + k, v); } catch (e) { /* niente */ } }
    };
    function avviso(t) {
        var el = crea('div', { classe: 'copiato', role: 'status', testo: t });
        document.body.appendChild(el);
        setTimeout(function () { el.remove(); }, 1800);
    }

    /* ---------------- le pagine negli iframe ---------------- */
    var pannelli = {
        partecipante: { iframe: $('fr-partecipante'), dispositivo: 'telefono', ip: '93.44.10.21', pagina: 'diretta', ricerca: '' },
        gestione: { iframe: $('fr-gestione'), dispositivo: 'regia', ip: '151.12.3.4', pagina: 'gestione', ricerca: '' },
        sopra: { iframe: null, dispositivo: 'regia', ip: '151.12.3.4', pagina: 'diretta', ricerca: '' }
    };
    function monta(p, pagina, ricerca) {
        if (pagina) p.pagina = pagina;
        if (ricerca != null) p.ricerca = String(ricerca || '');
        p.montato = true;
        var html = PAGINE[p.pagina] || '<p>Pagina mancante</p>';
        // il raccordo con il motore prima di ogni altro script della pagina
        p.iframe.srcdoc = html.replace(/<head([^>]*)>/i, function (t) { return t + '<script src="anteprima/pagina.js"><\/script>'; });
    }
    function montaSeServe(p) { if (!p.montato) monta(p); }
    function pannelloDi(finestra) {
        var trovato = null;
        Object.keys(pannelli).forEach(function (k) {
            var p = pannelli[k];
            try { if (p.iframe && p.iframe.contentWindow === finestra) trovato = p; } catch (e) { /* niente */ }
        });
        return trovato;
    }
    function paginaDa(percorso) {
        if (/^\/diretta\/gestione(\/|\/index\.html)?$/.test(percorso)) return 'gestione';
        if (/^\/diretta\/reimposta\.html$/.test(percorso)) return 'reimposta';
        if (/^\/diretta(\/|\/index\.html)?$/.test(percorso)) return 'diretta';
        return '';
    }
    function apriFuori(url) {
        var a = crea('a', { href: url, target: '_blank', rel: 'noopener' });
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    M.configPer = function (finestra) {
        var p = pannelloDi(finestra);
        return p ? { dispositivo: p.dispositivo, ricerca: p.ricerca, ip: p.ip } : { dispositivo: 'questo', ricerca: '', ip: '93.44.10.20' };
    };
    M.ricordaRicerca = function (finestra, s) { var p = pannelloDi(finestra); if (p) p.ricerca = s; };
    M.naviga = function (finestra, url) {
        var p = pannelloDi(finestra) || pannelli.partecipante;
        var base = SITO + (p.pagina === 'gestione' ? '/diretta/gestione/' : '/diretta/');
        var u;
        try { u = new URL(url, base); } catch (e) { return; }
        var dest = u.origin === SITO ? paginaDa(u.pathname) : '';
        if (!dest) { apriFuori(u.href); return; }
        if (dest === 'gestione') {
            if (p === pannelli.sopra) chiudiSopra();
            monta(pannelli.gestione, 'gestione', '');
            apriScheda('gestione');
            return;
        }
        // dalla regia, la pagina dei partecipanti si apre sopra (anteprima del gestore)
        if (p === pannelli.gestione && dest === 'diretta') { apriSopraPagina(u.search); return; }
        monta(p, dest, u.search);
    };
    M.apri = function (finestra, url) {
        var u;
        try { u = new URL(url, SITO + '/diretta/gestione/'); } catch (e) { return; }
        apriSopraPagina(u.search);
    };

    /* ---------------- schede ---------------- */
    var SCHEDE = ['guida', 'partecipante', 'gestione', 'posta'];
    function apriScheda(nome, conFuoco) {
        SCHEDE.forEach(function (s) {
            var tab = $('tab-' + s), pan = $('pannello-' + s), si = s === nome;
            tab.setAttribute('aria-selected', si ? 'true' : 'false');
            tab.tabIndex = si ? 0 : -1;
            pan.hidden = !si;
        });
        if (nome === 'partecipante') montaSeServe(pannelli.partecipante);
        if (nome === 'gestione') montaSeServe(pannelli.gestione);
        if (nome === 'posta') disegnaPosta();
        if (conFuoco) $('tab-' + nome).focus();
        memoria.scrivi('scheda', nome);
    }
    document.querySelector('.schede').addEventListener('click', function (e) {
        var b = e.target.closest('[data-scheda]');
        if (b) apriScheda(b.getAttribute('data-scheda'));
    });
    document.querySelector('.schede').addEventListener('keydown', function (e) {
        var i = SCHEDE.indexOf((document.activeElement.getAttribute('data-scheda') || ''));
        if (i < 0) return;
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            apriScheda(SCHEDE[(i + (e.key === 'ArrowRight' ? 1 : SCHEDE.length - 1)) % SCHEDE.length], true);
        }
    });

    /* ---------------- partecipante e gestione ---------------- */
    function formato(tel) {
        $('cornice-partecipante').classList.toggle('telefono', tel);
        $('formato-telefono').setAttribute('aria-pressed', tel ? 'true' : 'false');
        $('formato-computer').setAttribute('aria-pressed', tel ? 'false' : 'true');
        memoria.scrivi('formato', tel ? 'telefono' : 'computer');
    }
    $('formato-telefono').addEventListener('click', function () { formato(true); });
    $('formato-computer').addEventListener('click', function () { formato(false); });
    $('btn-ricarica-partecipante').addEventListener('click', function () { monta(pannelli.partecipante); });
    $('btn-ricarica-gestione').addEventListener('click', function () { monta(pannelli.gestione); });

    function nomeUtenteDi(uid) {
        var r = M.archivio.leggi('partecipanti/' + uid);
        return r && r.dati ? r.dati.nomeUtente : '';
    }
    function aggiornaChi() {
        var u = M.utenteDi('telefono');
        var cp = $('chi-partecipante');
        cp.textContent = '';
        if (u) { cp.appendChild(document.createTextNode('Su questo telefono è collegato ')); cp.appendChild(crea('b', { testo: nomeUtenteDi(u.uid) || u.email || 'un gestore' })); }
        else cp.textContent = 'Nessuno è collegato su questo telefono.';
        var g = M.utenteDi('regia');
        var cg = $('chi-gestione');
        cg.textContent = '';
        if (g) { cg.appendChild(document.createTextNode('Regia collegata come ')); cg.appendChild(crea('b', { testo: g.email || '' })); }
        else cg.textContent = 'La regia non è ancora collegata.';
    }
    ['telefono', 'regia'].forEach(function (d) {
        M.sdk.auth.onAuthStateChanged({ _dispositivo: d, app: { _finestra: window } }, aggiornaChi);
    });

    // aspetta che nella pagina di un pannello compaia un elemento (visibile)
    function aspetta(p, selettore, ms) {
        var fine = Date.now() + (ms || 10000);
        return new Promise(function (ok, ko) {
            (function giro() {
                var el = null;
                try { el = p.iframe.contentDocument && p.iframe.contentDocument.querySelector(selettore); } catch (e) { el = null; }
                if (el && el.getClientRects().length) { ok(el); return; }
                if (Date.now() > fine) { ko(new Error('non trovato: ' + selettore)); return; }
                setTimeout(giro, 150);
            })();
        });
    }
    function scriviIn(el, valore) {
        var w = el.ownerDocument.defaultView;
        el.focus();
        el.value = valore;
        el.dispatchEvent(new w.Event('input', { bubbles: true }));
        el.dispatchEvent(new w.Event('change', { bubbles: true }));
    }

    function usaAccesso(a) {
        var p = pannelli.partecipante;
        apriScheda('partecipante');
        var gia = M.utenteDi('telefono');
        if (gia && nomeUtenteDi(gia.uid) === a.nomeUtente) return;
        if (gia) M.esciDa('telefono');
        monta(p, 'diretta', '');
        aspetta(p, '#campo-nome-utente', 12000).then(function (campo) {
            scriviIn(campo, a.nomeUtente);
            scriviIn(p.iframe.contentDocument.getElementById('campo-password'), a.password);
            p.iframe.contentDocument.getElementById('btn-entra').click();
        }).catch(function () { avviso('Scrivi nome utente e password nella pagina.'); });
    }
    function entraInGestione() {
        var p = pannelli.gestione;
        apriScheda('gestione');
        if (M.utenteDi('regia')) return Promise.resolve();
        var g = (M.accessi() || {}).gestore || {};
        return aspetta(p, '#gestore-email', 12000).then(function (campo) {
            scriviIn(campo, g.email);
            scriviIn(p.iframe.contentDocument.getElementById('gestore-password'), g.password);
            p.iframe.contentDocument.getElementById('btn-gestore-entra').click();
        });
    }
    $('btn-usa-gestore').addEventListener('click', function () { entraInGestione().catch(function () { avviso('Scrivi email e password nella pagina.'); }); });

    $('btn-file-esempio').addEventListener('click', function () {
        var p = pannelli.gestione;
        entraInGestione().then(function () {
            return aspetta(p, '#sel-evento option[value="' + ID_EVENTO + '"]', 15000).catch(function () { return null; });
        }).then(function () {
            return aspetta(p, '[data-scheda="partecipanti"]', 15000);
        }).then(function (tab) {
            tab.click();
            var doc = p.iframe.contentDocument, w = doc.defaultView;
            var input = doc.getElementById('file-partecipanti');
            var dt = new w.DataTransfer();
            dt.items.add(new w.File([window.NGBA_CSV_ESEMPIO || ''], 'esempio-partecipanti.csv', { type: 'text/csv' }));
            input.files = dt.files;
            input.dispatchEvent(new w.Event('change', { bubbles: true }));
        }).catch(function () { avviso('Entra nella gestione e carica il file dalla scheda Partecipanti.'); });
    });

    /* ---------------- guida: evento e accessi ---------------- */
    function copiabile(el, valore) {
        el.textContent = valore;
        el.tabIndex = 0;
        el.setAttribute('role', 'button');
        el.setAttribute('aria-label', 'Copia ' + valore);
        function copia() {
            var fatto = function () { avviso('Copiato: ' + valore); };
            try {
                navigator.clipboard.writeText(valore).then(fatto, function () { seleziona(el); });
            } catch (e) { seleziona(el); }
        }
        el.addEventListener('click', copia);
        el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); copia(); } });
    }
    function seleziona(el) {
        var r = document.createRange();
        r.selectNodeContents(el);
        var s = window.getSelection();
        s.removeAllRanges();
        s.addRange(r);
        avviso('Selezionato: copialo con Ctrl+C');
    }

    var STATI = { programmato: 'In attesa', in_onda: 'In onda', pausa: 'In pausa', terminato: 'Terminata' };
    function aggiornaEvento() {
        var r = M.archivio.leggi('eventi/' + ID_EVENTO);
        var ev = r && r.dati;
        var badge = $('stato-evento');
        badge.setAttribute('data-stato', ev ? ev.stato : '');
        testo(badge, ev ? (STATI[ev.stato] || ev.stato) : '…');
        var info = $('info-evento');
        info.textContent = '';
        if (!ev) return;
        var data = '';
        try {
            data = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', weekday: 'long', day: 'numeric', month: 'long' }).format(ev.inizio.toDate());
        } catch (e) { data = ev.data; }
        [['Evento', ev.titolo], ['Quando', data + ', dalle ' + ev.oraInizio.replace(':', '.') + ' alle ' + ev.oraFine.replace(':', '.')], ['Stato', STATI[ev.stato] || ev.stato],
            ['Video', ev.tipoPlayer === 'flusso' ? 'flusso diretto (.m3u8)' : 'player Azoto (iframe)']]
            .forEach(function (x) { info.appendChild(crea('span', {}, [crea('b', { testo: x[0] + ': ' }), document.createTextNode(x[1])])); });
    }
    M.archivio.ascolta('eventi/' + ID_EVENTO, aggiornaEvento);

    function disegnaAccessi() {
        var s = M.accessi();
        var corpo = $('tabella-accessi');
        corpo.textContent = '';
        if (!s) return;
        s.accessi.forEach(function (a) {
            var nomeUt = crea('span', { classe: 'credenziale' });
            copiabile(nomeUt, a.nomeUtente);
            var pw = crea('span', { classe: 'credenziale' });
            copiabile(pw, a.password);
            var chi = crea('td', { classe: 'chi' }, [document.createTextNode(a.nome), crea('small', { testo: a.azienda })]);
            if (/\d$/.test(a.nomeUtente)) chi.firstChild.after(crea('span', { classe: 'omonimo', testo: 'omonimo' }));
            var entra = crea('button', { type: 'button', classe: 'bottone', testo: 'Entra', 'aria-label': 'Entra come ' + a.nomeUtente });
            entra.addEventListener('click', function () { usaAccesso(a); });
            corpo.appendChild(crea('tr', {}, [chi, crea('td', {}, [nomeUt]), crea('td', {}, [pw]), crea('td', {}, [entra])]));
        });
        copiabile($('gestore-email'), s.gestore.email);
        copiabile($('gestore-password'), s.gestore.password);
    }

    /* ---------------- posta di prova ---------------- */
    var aperto = '';
    var TIPI = { credenziali: 'Credenziali', 'promemoria-giorno': 'Promemoria', 'promemoria-ora': 'Promemoria', reimpostazione: 'Password', prova: 'Prova' };
    function tipoDi(m) {
        if (/^\[PROVA\]/.test(m.oggetto || '')) return 'Prova';
        return TIPI[m.tipo] || (m.tipo ? m.tipo : 'Email');
    }
    function quando(iso) {
        try { return new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }).format(new Date(iso)); } catch (e) { return ''; }
    }
    function disegnaPosta() {
        var n = M.posta.nonLetti();
        testo($('conta-posta'), n ? n : '');
        if ($('pannello-posta').hidden) return;
        var ul = $('elenco-posta');
        ul.textContent = '';
        if (!M.posta.messaggi.length) { ul.appendChild(crea('li', { classe: 'vuoto', testo: 'Ancora nessuna email.' })); return; }
        M.posta.messaggi.forEach(function (m) {
            var b = crea('button', { type: 'button', classe: m.letto ? '' : 'non-letto' }, [
                crea('span', { classe: 'ogg', testo: m.oggetto || '(senza oggetto)' }),
                crea('span', { classe: 'meta' }, [crea('span', { classe: 'tipo', testo: tipoDi(m) }), crea('span', { testo: m.a }), crea('span', { testo: quando(m.quando) })])
            ]);
            if (m.id === aperto) b.setAttribute('aria-current', 'true');
            b.addEventListener('click', function () { apriMessaggio(m.id); });
            ul.appendChild(crea('li', {}, [b]));
        });
    }
    function htmlEmail(h) {
        var locale = new URL('assets/', location.href).href;
        return String(h || '').split(SITO + '/assets/').join(locale);
    }
    function seguiCollegamento(href) {
        var u;
        try { u = new URL(href); } catch (e) { return false; }
        var dest = u.origin === SITO ? paginaDa(u.pathname) : '';
        if (!dest) return false;
        var perGestione = dest === 'gestione' || u.searchParams.get('per') === 'gestione';
        var p = perGestione ? pannelli.gestione : pannelli.partecipante;
        monta(p, dest, u.search);
        apriScheda(perGestione ? 'gestione' : 'partecipante');
        return true;
    }
    function apriMessaggio(id) {
        var m = M.posta.messaggi.filter(function (x) { return x.id === id; })[0];
        if (!m) return;
        aperto = id;
        M.posta.segnaLetto(id);
        var l = $('lettore');
        l.textContent = '';
        var da = (m.intestazioni && m.intestazioni.from) || '';
        l.appendChild(crea('div', { classe: 'intestazione' }, [
            crea('span', { classe: 'ogg', testo: m.oggetto || '' }),
            crea('span', { classe: 'riga-meta' }, [crea('span', { testo: 'Da: ' + da }), crea('span', { testo: 'A: ' + m.a }), crea('span', { testo: quando(m.quando) })])
        ]));
        var bHtml = crea('button', { type: 'button', 'aria-pressed': 'true', testo: 'Come arriva' });
        var bTesto = crea('button', { type: 'button', 'aria-pressed': 'false', testo: 'Solo testo' });
        l.appendChild(crea('div', { classe: 'azioni' }, [crea('div', { classe: 'segmenti', role: 'group', 'aria-label': 'Versione' }, [bHtml, bTesto]),
            crea('span', { classe: 'riga-meta', testo: 'I pulsanti dell\'email aprono la pagina qui nell\'anteprima.' })]));
        var fr = crea('iframe', { title: 'Email: ' + (m.oggetto || '') });
        var pre = crea('pre', { testo: m.testo || '' });
        pre.hidden = true;
        l.appendChild(fr);
        l.appendChild(pre);
        fr.srcdoc = htmlEmail(m.html);
        fr.addEventListener('load', function () {
            try {
                fr.contentDocument.addEventListener('click', function (e) {
                    var a = e.target.closest && e.target.closest('a[href]');
                    if (!a) return;
                    var href = a.getAttribute('href') || '';
                    if (/^mailto:/i.test(href)) return;
                    e.preventDefault();
                    if (!seguiCollegamento(href)) apriFuori(href);
                });
            } catch (e) { /* niente */ }
        });
        function scegli(html) {
            bHtml.setAttribute('aria-pressed', html ? 'true' : 'false');
            bTesto.setAttribute('aria-pressed', html ? 'false' : 'true');
            fr.hidden = !html;
            pre.hidden = html;
        }
        bHtml.addEventListener('click', function () { scegli(true); });
        bTesto.addEventListener('click', function () { scegli(false); });
        disegnaPosta();
    }
    M.posta.ascolta(function () { disegnaPosta(); });

    /* ---------------- sovrapposto ---------------- */
    var primaDelSopra = null;
    function mostraSopra(titolo, corpo) {
        primaDelSopra = document.activeElement;
        testo($('titolo-sopra'), titolo);
        var c = $('corpo-sopra');
        c.textContent = '';
        c.appendChild(corpo);
        $('sopra').hidden = false;
        $('btn-chiudi-sopra').focus();
    }
    function chiudiSopra() {
        if ($('sopra').hidden) return;
        $('sopra').hidden = true;
        $('corpo-sopra').textContent = '';
        pannelli.sopra.iframe = null;
        pannelli.sopra.montato = false;
        if (primaDelSopra && primaDelSopra.focus) { try { primaDelSopra.focus(); } catch (e) { /* niente */ } }
    }
    function apriSopraPagina(ricerca) {
        var fr = crea('iframe', { title: 'La diretta vista da un partecipante (anteprima del gestore)', allow: 'fullscreen; autoplay', allowfullscreen: '' });
        pannelli.sopra.iframe = fr;
        mostraSopra('Vedi come un partecipante', fr);
        monta(pannelli.sopra, 'diretta', ricerca);
    }
    M.mostraExcel = function (nome, fogli) {
        var box = crea('div', { classe: 'excel' });
        box.appendChild(crea('p', { testo: 'Nell\'anteprima il file «' + nome + '» non si scarica: ecco che cosa contiene, foglio per foglio.' }));
        var bottoni = crea('div', { classe: 'segmenti', role: 'group', 'aria-label': 'Fogli' });
        var tabella = crea('div', { classe: 'tabella' });
        function mostra(i) {
            Array.prototype.forEach.call(bottoni.children, function (b, j) { b.setAttribute('aria-pressed', i === j ? 'true' : 'false'); });
            tabella.innerHTML = fogli[i].html;   // HTML di SheetJS: i valori delle celle sono gia' "escaped"
        }
        fogli.forEach(function (f, i) {
            var b = crea('button', { type: 'button', testo: f.nome });
            b.addEventListener('click', function () { mostra(i); });
            bottoni.appendChild(b);
        });
        box.appendChild(bottoni);
        box.appendChild(crea('div', { style: 'height:10px' }));
        box.appendChild(tabella);
        mostraSopra('Esportazione Excel', box);
        mostra(0);
    };
    M.mostraFile = function (nome, contenuto) {
        var box = crea('div', { classe: 'excel' }, [
            crea('p', { testo: 'Nell\'anteprima il file «' + nome + '» non si scarica: ecco il suo contenuto.' }),
            crea('pre', { testo: String(contenuto || '').replace(/^\ufeff/, ''), style: 'margin:0;font:13px/1.5 var(--mono);white-space:pre-wrap' })
        ]);
        mostraSopra('File «' + nome + '»', box);
    };
    $('btn-chiudi-sopra').addEventListener('click', chiudiSopra);
    $('sopra').addEventListener('click', function (e) { if (e.target === $('sopra')) chiudiSopra(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') chiudiSopra(); });

    /* ---------------- ricomincia ---------------- */
    $('btn-ricomincia').addEventListener('click', function () {
        var si = crea('button', { type: 'button', classe: 'bottone', testo: 'Sì, ricomincia' });
        var no = crea('button', { type: 'button', classe: 'bottone secondario', testo: 'Annulla' });
        var box = crea('div', { classe: 'excel' }, [
            crea('p', { testo: 'Si cancellano i partecipanti caricati, le email di prova e gli accessi fatti; l\'evento di prova e gli accessi della guida si ricreano da capo.' }),
            crea('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, [si, no])
        ]);
        si.addEventListener('click', function () { M.ricomincia(); location.reload(); });
        no.addEventListener('click', chiudiSopra);
        mostraSopra('Ricominciare da capo?', box);
    });

    /* ---------------- avvio ---------------- */
    var alto = function () { document.documentElement.style.setProperty('--testata', $('testata').offsetHeight + 'px'); };
    window.addEventListener('resize', alto);
    alto();
    formato(memoria.leggi('formato') !== 'computer');
    M.seguiStato(function (s) {
        if (s.fase === 'errore') {
            var p = $('testo-preparazione');
            p.className = 'errore';
            testo(p, 'Non sono riuscito a preparare l\'anteprima: ' + s.errore);
            var b = crea('button', { type: 'button', classe: 'bottone', testo: 'Ricomincia da capo', style: 'margin-top:14px' });
            b.addEventListener('click', function () { M.ricomincia(); location.reload(); });
            p.after(b);
        } else if (s.messaggio) testo($('testo-preparazione'), s.messaggio);
    });
    M.pronto.then(function () {
        $('preparazione').hidden = true;
        disegnaAccessi();
        aggiornaEvento();
        aggiornaChi();
        disegnaPosta();
        var scheda = memoria.leggi('scheda');
        apriScheda(SCHEDE.indexOf(scheda) >= 0 ? scheda : 'guida');
    }, function () { /* il messaggio e' gia' nella preparazione */ });
})();
