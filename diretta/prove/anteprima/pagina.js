/* ============================================================
   ANTEPRIMA - il raccordo dentro ogni pagina vera
   ------------------------------------------------------------
   Il guscio mette questo file in testa a diretta/index.html,
   diretta/reimposta.html e diretta/gestione/index.html, prima dei
   loro script. Fa tre cose, e nient'altro:
   1. le chiamate al servizio (fetch verso https://anteprima.invalid/api,
      l'indirizzo del servizio in anteprima/config.js) vanno alle
      funzioni vere dentro il motore, non in rete; quelle per la web TV
      di esempio (*.esempio.it, la prova del CORS della gestione) e per
      il player di Azoto (cdn.azotosolutions.com) alla web TV finta del
      motore (motore/webtv-finta.js);
   2. i collegamenti fra le pagine della diretta (/diretta/,
      /diretta/gestione/, /diretta/reimposta.html) restano dentro
      l'anteprima; quelli verso il sito si aprono in una scheda nuova;
   3. l'indirizzo della pagina: le pagine vive in un iframe non ne
      hanno uno vero, quindi i parametri (?u=, ?anteprima=, ?oobCode=)
      stanno in window.NGB_ANTEPRIMA_RICERCA, che il guscio decide
      (NGBA.configPer), insieme al "dispositivo" su cui gira la pagina.
   ============================================================ */
(function () {
    'use strict';
    var M = window.parent && window.parent !== window ? window.parent.NGBA : window.NGBA;
    if (!M) return;

    // chi e' questa pagina: il dispositivo (per la sessione), i parametri, l'indirizzo IP finto
    var cfg = (M.configPer && M.configPer(window)) || {};
    window.NGB_ANTEPRIMA_DISPOSITIVO = cfg.dispositivo || 'questo';
    window.NGB_ANTEPRIMA_RICERCA = cfg.ricerca || '';
    window.NGB_ANTEPRIMA_IP = cfg.ip || '93.44.10.20';

    /* ---------- 1. il servizio ---------- */
    var fetchVero = window.fetch ? window.fetch.bind(window) : null;
    window.fetch = function (url, init) {
        var indirizzo = String((url && url.url) || url);
        if (M.webtvFinta && M.webtvFinta.serve(indirizzo)) return M.webtvFinta.fetch(indirizzo, init);
        if (indirizzo.indexOf('https://anteprima.invalid/api/') !== 0) return fetchVero(url, init);
        init = init || {};
        var intestazioni = {};
        try {
            if (init.headers && typeof init.headers.forEach === 'function' && typeof init.headers.get === 'function') {
                init.headers.forEach(function (v, k) { intestazioni[k] = v; });
            } else if (init.headers) {
                Object.keys(init.headers).forEach(function (k) { intestazioni[k] = init.headers[k]; });
            }
        } catch (e) { /* senza intestazioni */ }
        return M.daPagina(indirizzo, { method: init.method || 'GET', headers: intestazioni, body: init.body }, {
            ip: window.NGB_ANTEPRIMA_IP || '93.44.10.20',
            userAgent: navigator.userAgent,
            origine: 'https://nextgenerationbusiness.it'
        }).then(function (r) {
            return new Response(r.corpo, { status: r.stato, headers: { 'content-type': 'application/json' } });
        });
    };

    /* ---------- 3. i parametri della pagina ---------- */
    window.NGBA_RICERCA = function () { return window.NGB_ANTEPRIMA_RICERCA || ''; };
    window.NGBA_RICERCA_IMPOSTA = function (s) {
        window.NGB_ANTEPRIMA_RICERCA = s || '';
        try { if (M.ricordaRicerca) M.ricordaRicerca(window, window.NGB_ANTEPRIMA_RICERCA); } catch (e) { /* niente */ }
    };
    window.NGBA_VAI = function (url) { M.naviga(window, String(url)); };
    // l'esportazione Excel della gestione: il contenuto si mostra nel guscio (qui i file non si scaricano)
    window.NGBA_SCARICA_EXCEL = function (XLSX, wb, nome) {
        var fogli = wb.SheetNames.map(function (n) {
            return { nome: n, html: XLSX.utils.sheet_to_html(wb.Sheets[n], { header: '', footer: '' }) };
        });
        M.mostraExcel(nome, fogli);
    };
    window.NGBA_APRI = function (url) { M.apri(window, String(url)); };

    /* ---------- 2. i collegamenti ---------- */
    // i file creati dalla pagina (blob): si leggono da qui, senza "scaricarli" (la CSP non lo permetterebbe)
    var fileCreati = {};
    var creaUrl = URL.createObjectURL;
    URL.createObjectURL = function (b) {
        var u = creaUrl.call(URL, b);
        if (b && typeof b.text === 'function') fileCreati[u] = b;
        return u;
    };
    function interno(href) {
        return /^\/diretta(\/|$)/.test(href) || /^(\.\.\/|\.\/)?(index\.html|reimposta\.html|gestione\/?)(\?|#|$)/.test(href);
    }
    document.addEventListener('click', function (e) {
        var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
        if (!a || e.defaultPrevented || a.hasAttribute('data-ngba-fuori')) return;
        var href = a.getAttribute('href') || '';
        // un file creato dalla pagina (il modello CSV): qui non si scarica, se ne mostra il contenuto
        if (a.hasAttribute('download') || /^blob:/i.test(href)) {
            e.preventDefault();
            var nome = a.getAttribute('download') || 'file';
            var b = fileCreati[a.href];
            if (b) b.text().then(function (t) { M.mostraFile(nome, t); }, function () { /* niente */ });
            return;
        }
        if (/^(mailto:|tel:|#|javascript:)/i.test(href)) return;
        if (interno(href)) { e.preventDefault(); M.naviga(window, href); return; }
        // il resto del sito (la pagina dell'evento, la home): fuori dall'anteprima
        e.preventDefault();
        var fuori = /^https?:/i.test(href) ? href : 'https://nextgenerationbusiness.it' + (href.charAt(0) === '/' ? '' : '/') + href;
        var l = document.createElement('a');
        l.href = fuori;
        l.target = '_blank';
        l.rel = 'noopener';
        l.setAttribute('data-ngba-fuori', '');
        document.body.appendChild(l);
        l.click();
        l.remove();
    }, true);

    window.addEventListener('pagehide', function () {
        try { M.dimenticaFinestra(window); } catch (e) { /* guscio gia' chiuso */ }
    });
})();
