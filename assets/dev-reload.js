/**
 * NGB — Live reload per lo sviluppo
 * ----------------------------------------------------------------------
 * Controlla a intervalli regolari se la pagina aperta, i suoi fogli di
 * stile o i suoi script sono cambiati sul server, e aggiorna da solo:
 *
 *   - CSS  -> sostituito al volo, SENZA ricaricare la pagina (scroll,
 *             form compilati e stato dei menu restano intatti);
 *   - HTML / JS -> ricarica automatica della pagina.
 *
 * Il confronto usa l'header ETag (o Last-Modified) che GitHub Pages
 * restituisce per ogni file: nessun file di versione da mantenere.
 *
 * ATTIVAZIONE: aprire una pagina con ?dev=1 -- resta attivo per tutta la
 * scheda, anche navigando fra le pagine. Si spegne con ?dev=0 o chiudendo
 * la scheda. Non aggiunge nessun elemento visibile alla pagina.
 *
 * In produzione questo file non viene mai scaricato: analytics.js lo
 * carica solo quando la modalita' dev e' attiva.
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'ngbDevReload';
    var SEEN_KEY = 'ngbDevReloadSeen';
    var INTERVAL = 4000;      // ms fra un controllo e l'altro
    var MAX_SEEN = 6;         // firme memorizzate per ogni risorsa

    if (window.__ngbDevReload) return;   // gia' attivo su questa pagina
    window.__ngbDevReload = true;

    /* ---- Attivazione (utile se il file viene caricato a mano o da
       bookmarklet, senza passare da analytics.js) ---- */
    var flag = /[?&]dev=([01])/.exec(window.location.search);
    try {
        if (flag && flag[1] === '1') sessionStorage.setItem(STORAGE_KEY, '1');
        if (flag && flag[1] === '0') { sessionStorage.removeItem(STORAGE_KEY); return; }
        if (sessionStorage.getItem(STORAGE_KEY) !== '1') sessionStorage.setItem(STORAGE_KEY, '1');
    } catch (e) { /* storage non disponibile: si procede comunque */ }

    /* ---- Firme gia' viste, per risorsa ----
       Servono a evitare ricariche a ciclo continuo: la CDN di GitHub
       Pages puo' servire per qualche minuto l'ETag vecchio da un nodo e
       quello nuovo da un altro. Reagiamo solo a firme mai viste prima,
       e le conserviamo in sessionStorage perche' sopravvivano al reload. */
    var seen = {};
    try { seen = JSON.parse(sessionStorage.getItem(SEEN_KEY) || '{}') || {}; } catch (e) { seen = {}; }

    function remember(url, sig) {
        var list = seen[url] || [];
        if (list.indexOf(sig) === -1) list.push(sig);
        seen[url] = list.slice(-MAX_SEEN);
        try { sessionStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch (e) { /* ignora */ }
    }

    function isKnown(url, sig) {
        return (seen[url] || []).indexOf(sig) !== -1;
    }

    /* ---- Risorse da sorvegliare: la pagina stessa + CSS e JS locali ---- */
    function clean(url) {
        var a = document.createElement('a');
        a.href = url;
        if (a.origin !== window.location.origin) return null;   // solo same-origin
        return a.href.split('#')[0]
            .replace(/([?&])(dev|_dev)=[^&]*/g, '$1')
            .replace(/[?&]+$/, '');
    }

    var targets = [];
    function watch(url, kind, el) {
        var c = clean(url);
        if (!c) return;
        for (var i = 0; i < targets.length; i++) if (targets[i].url === c) return;
        targets.push({ url: c, kind: kind, el: el || null, sig: null });
    }

    watch(window.location.href, 'page');
    Array.prototype.forEach.call(document.querySelectorAll('link[rel="stylesheet"][href]'), function (el) {
        watch(el.getAttribute('href'), 'css', el);
    });
    Array.prototype.forEach.call(document.querySelectorAll('script[src]'), function (el) {
        if (/dev-reload\.js/.test(el.src)) return;
        watch(el.getAttribute('src'), 'js', el);
    });

    /* ---- Firma di una risorsa: ETag, altrimenti Last-Modified, altrimenti
       un hash leggero del contenuto (per i server che non mandano ne' l'uno
       ne' l'altro). ---- */
    function hash(text) {
        var h = 5381;
        for (var i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
        return 'h' + h;
    }

    function signature(url) {
        var bust = url + (url.indexOf('?') > -1 ? '&' : '?') + '_dev=' + Date.now();
        return fetch(bust, { method: 'HEAD', cache: 'no-store' })
            .then(function (res) {
                if (!res.ok) throw new Error(res.status);
                var sig = res.headers.get('etag') || res.headers.get('last-modified');
                if (sig) return sig;
                return fetch(bust, { cache: 'no-store' })
                    .then(function (r) { return r.text(); })
                    .then(hash);
            });
    }

    /* ---- Sostituzione a caldo del CSS ---- */
    function swapCss(target) {
        var el = target.el;
        if (!el || !el.parentNode) { window.location.reload(); return; }
        var next = el.cloneNode(false);
        next.href = target.url + (target.url.indexOf('?') > -1 ? '&' : '?') + '_dev=' + Date.now();
        next.addEventListener('load', function () {
            if (el.parentNode) el.parentNode.removeChild(el);
        });
        el.parentNode.insertBefore(next, el.nextSibling);
        target.el = next;
    }

    /* ---- Nessun elemento aggiunto alla pagina: quello che succede si
       legge solo nella console del browser. ---- */
    function say(text) {
        if (window.console && console.info) console.info('[NGB] ' + text);
    }

    /* ---- Ciclo di controllo ---- */
    var failures = 0;
    var busy = false;

    function check(first) {
        if (busy || (!first && document.hidden)) return;
        busy = true;

        Promise.all(targets.map(function (t) {
            return signature(t.url).then(
                function (sig) { return { t: t, sig: sig }; },
                function () { return { t: t, sig: null }; }
            );
        })).then(function (results) {
            busy = false;

            var ok = results.filter(function (r) { return r.sig !== null; });
            if (!ok.length) {
                failures++;
                if (failures >= 2) say('server non raggiungibile, riprovo');
                return;
            }
            failures = 0;

            var changedCss = [];
            var reload = false;

            ok.forEach(function (r) {
                var t = r.t;
                if (first || t.sig === null) {            // prima lettura: solo baseline
                    t.sig = r.sig;
                    remember(t.url, r.sig);
                    return;
                }
                if (r.sig === t.sig) return;
                t.sig = r.sig;
                if (isKnown(t.url, r.sig)) return;        // firma gia' vista: e' la CDN che oscilla
                remember(t.url, r.sig);
                if (t.kind === 'css') changedCss.push(t); else reload = true;
            });

            if (reload) {
                say('aggiornamento trovato, ricarico la pagina');
                setTimeout(function () { window.location.reload(); }, 150);
                return;
            }

            if (changedCss.length) {
                changedCss.forEach(swapCss);
                say('CSS aggiornato alle ' + new Date().toLocaleTimeString('it-IT'));
                return;
            }
        });
    }

    setInterval(check, INTERVAL);
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) check();                    // controllo subito al rientro sulla scheda
    });

    function start() {
        check(true);
    }
    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start);

    console.info('[NGB] Live reload attivo su ' + targets.length + ' risorse, controllo ogni ' +
        (INTERVAL / 1000) + 's. Per disattivarlo: ?dev=0');
})();
