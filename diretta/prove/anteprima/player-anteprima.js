/* ============================================================
   IL PLAYER DELL'ANTEPRIMA: un video di prova disegnato nel browser
   ------------------------------------------------------------
   Nell'anteprima non si possono caricare video da altri siti (la
   pagina che la ospita non lo permette): niente web TV e niente
   YouTube. Al loro posto questo player, con la STESSA interfaccia di
   player-webtv.js e player-youtube.js:

       window.NGBPlayer = { nome, crea(contenitore, opzioni), idDa(url) }

   E' anche la prova pratica di quello che dice il README (§11): per
   cambiare piattaforma basta un file con queste funzioni. La pagina
   della diretta e la regia non sanno quale player stanno usando.

   Il "video" e' un palco disegnato su un canvas: l'ora che scorre,
   l'identificativo del video caricato (cosi' si vede il cambio di
   link della regia), e un indicatore dell'audio quando e' attivo.
   ============================================================ */
(function () {
    'use strict';

    // come in player-webtv.js: accetta gli stessi link (sorgente-video.js), o almeno quelli di YouTube
    function idDa(indirizzo) {
        var S = window.NGBSorgenteVideo;
        if (S) { var v = S.leggi(indirizzo); return v && !v.errore ? v.valore : ''; }
        var s = String(indirizzo == null ? '' : indirizzo).trim();
        if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
        var u;
        try { u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s); } catch (e) { return ''; }
        var host = u.hostname.replace(/^www\.|^m\./, '').toLowerCase();
        var id = '';
        if (host === 'youtu.be') id = u.pathname.split('/')[1] || '';
        else if (/(^|\.)youtube(-nocookie)?\.com$/.test(host)) {
            if (u.searchParams.get('v')) id = u.searchParams.get('v');
            else {
                var m = /^\/(embed|live|shorts|v)\/([^/?#]+)/.exec(u.pathname);
                if (m) id = m[2];
            }
        }
        return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : '';
    }

    // un indirizzo lungo della web TV si accorcia: dominio e ultimo pezzo del percorso
    function etichettaVideo(v) {
        if (!/^https:\/\//.test(v)) return v;
        try { var u = new URL(v); var pezzi = u.pathname.split('/').filter(Boolean); return u.hostname + (pezzi.length > 1 ? '/…/' : '/') + (pezzi.pop() || ''); } catch (e) { return v; }
    }

    var riduciMovimento = false;
    try { riduciMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* niente */ }

    function crea(contenitore, opzioni) {
        opzioni = opzioni || {};
        var tela = null, ctx = null, anim = 0, osservatore = null;
        var idCorrente = '';
        var statoCorrente = 'non-avviato';
        var visibile = true, distrutto = false;
        var muto = true, vol = 100;
        var inizio = performance.now();
        var fermoA = null;          // quando si e' messo in pausa (per il "sei indietro")
        var ritardoMs = 0;          // quanto si e' indietro rispetto alla diretta
        var timer = [];

        function avvisa(nome, dati) {
            var f = opzioni[nome];
            if (typeof f !== 'function') return;
            try { f(dati); } catch (e) { setTimeout(function () { throw e; }); }
        }
        function avvisaVolume() { avvisa('onVolume', { volume: vol, muto: muto }); }
        function imposta(s) { if (statoCorrente !== s) { statoCorrente = s; avvisa('onStato', s); } }
        function dopo(ms, fn) { var t = setTimeout(fn, ms); timer.push(t); return t; }

        function applicaVisibilita() {
            if (!tela) return;
            tela.style.visibility = visibile ? '' : 'hidden';
            if (visibile) tela.removeAttribute('aria-hidden'); else tela.setAttribute('aria-hidden', 'true');
        }

        function dimensiona() {
            if (!tela) return;
            var r = contenitore.getBoundingClientRect();
            var d = Math.min(window.devicePixelRatio || 1, 2);
            var w = Math.max(160, Math.round(r.width * d)), h = Math.max(90, Math.round(r.height * d));
            if (tela.width !== w || tela.height !== h) { tela.width = w; tela.height = h; }
        }

        function monta() {
            if (tela) return;
            tela = document.createElement('canvas');
            tela.className = 'ngb-player-anteprima';
            tela.setAttribute('role', 'img');
            tela.setAttribute('aria-label', 'Video di prova della diretta');
            tela.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;display:block;background:#06182b;';
            contenitore.appendChild(tela);
            ctx = tela.getContext('2d');
            dimensiona();
            if (window.ResizeObserver) { osservatore = new ResizeObserver(dimensiona); osservatore.observe(contenitore); }
            applicaVisibilita();
            anim = requestAnimationFrame(disegna);
        }

        /* ---------- il disegno ---------- */
        function orario(ms) {
            var d = new Date(ms);
            function z(n) { return (n < 10 ? '0' : '') + n; }
            return z(d.getHours()) + ':' + z(d.getMinutes()) + ':' + z(d.getSeconds());
        }
        function disegna(t) {
            if (distrutto) return;
            anim = requestAnimationFrame(disegna);
            if (!ctx || !visibile) return;
            var fermo = statoCorrente !== 'riproduzione';
            if (fermo && tela._disegnato) return;
            tela._disegnato = true;
            var W = tela.width, H = tela.height, u = Math.min(W / 16, H / 9);
            var tempo = riduciMovimento ? 0 : (t - inizio) / 1000;

            // sala: fondo blu con luci
            var g = ctx.createLinearGradient(0, 0, 0, H);
            g.addColorStop(0, '#0b2a4a'); g.addColorStop(1, '#040f1c');
            ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
            for (var i = 0; i < 5; i++) {
                var x = W * (0.1 + i * 0.2) + Math.sin(tempo * 0.4 + i) * u * 0.6;
                var fascio = ctx.createRadialGradient(x, 0, 0, x, 0, H * 0.9);
                fascio.addColorStop(0, 'rgba(120,170,230,0.18)'); fascio.addColorStop(1, 'rgba(120,170,230,0)');
                ctx.fillStyle = fascio; ctx.fillRect(0, 0, W, H);
            }
            // schermo alle spalle del relatore
            ctx.fillStyle = '#123e6b'; ctx.fillRect(W * 0.18, H * 0.12, W * 0.64, H * 0.42);
            ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = Math.max(1, u * 0.03); ctx.strokeRect(W * 0.18, H * 0.12, W * 0.64, H * 0.42);
            ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.font = '800 ' + Math.round(u * 0.62) + 'px Montserrat, Arial, sans-serif';
            ctx.fillText('NEXT GENERATION BUSINESS', W / 2, H * 0.27);
            ctx.font = '600 ' + Math.round(u * 0.36) + 'px Inter, Arial, sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.8)';
            ctx.fillText('Napoli · diretta di prova', W / 2, H * 0.38);
            // palco e relatore
            ctx.fillStyle = '#1b2f45'; ctx.fillRect(0, H * 0.72, W, H * 0.28);
            var ox = Math.sin(tempo * 0.8) * u * 0.08;
            ctx.fillStyle = '#0d1d30';
            ctx.beginPath(); ctx.arc(W * 0.5 + ox, H * 0.52, u * 0.42, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(W * 0.5 + ox, H * 0.78, u * 0.95, u * 1.05, 0, Math.PI, 0); ctx.fill();
            ctx.fillStyle = '#2a4d73'; ctx.fillRect(W * 0.5 - u * 1.2, H * 0.66, u * 2.4, H * 0.34);
            ctx.fillStyle = '#c9a55a'; ctx.fillRect(W * 0.5 - u * 1.2, H * 0.66, u * 2.4, u * 0.08);

            // in alto: DIRETTA e l'ora
            var ora = Date.now() - ritardoMs;
            ctx.textAlign = 'left';
            ctx.font = '700 ' + Math.round(u * 0.3) + 'px Inter, Arial, sans-serif';
            var etichetta = ritardoMs > 3000 ? 'IN DIFFERITA' : 'DIRETTA DI PROVA';
            var lw = ctx.measureText(etichetta).width + u * 0.6;
            ctx.fillStyle = ritardoMs > 3000 ? '#5b6b7d' : '#c8102e';
            ctx.fillRect(u * 0.35, u * 0.35, lw, u * 0.5);
            ctx.fillStyle = '#fff'; ctx.fillText(etichetta, u * 0.65, u * 0.61);
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.fillText(orario(ora), u * 0.55 + lw, u * 0.61);

            // in basso: il sottopancia e il video caricato
            ctx.fillStyle = 'rgba(4,15,28,0.82)'; ctx.fillRect(u * 0.35, H - u * 1.45, W * 0.62, u * 1.0);
            ctx.fillStyle = '#c9a55a'; ctx.fillRect(u * 0.35, H - u * 1.45, u * 0.08, u * 1.0);
            ctx.fillStyle = '#fff'; ctx.font = '700 ' + Math.round(u * 0.34) + 'px Inter, Arial, sans-serif';
            ctx.fillText('Apertura dei lavori', u * 0.65, H - u * 1.08);
            ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = '500 ' + Math.round(u * 0.24) + 'px Inter, Arial, sans-serif';
            ctx.fillText('Video: ' + etichettaVideo(idCorrente) + '  ·  al posto della web TV in questa anteprima', u * 0.65, H - u * 0.72);

            // l'audio, quando e' attivo: barrette che si muovono
            if (!muto && vol > 0) {
                ctx.fillStyle = 'rgba(255,255,255,0.85)';
                for (var b = 0; b < 5; b++) {
                    var alt = u * (0.12 + 0.3 * Math.abs(Math.sin(tempo * 6 + b * 1.3))) * (vol / 100);
                    ctx.fillRect(W - u * (1.3 - b * 0.2), u * 0.86 - alt, u * 0.12, alt);
                }
            }
        }

        /* ---------- l'interfaccia ---------- */
        function carica(id) {
            id = String(id == null ? '' : id);
            if (distrutto || !id) return;
            var primo = !tela;
            idCorrente = id;
            ritardoMs = 0;
            fermoA = null;
            monta();
            if (tela) tela._disegnato = false;
            if (primo && !muto) { muto = true; avvisaVolume(); }
            imposta('buffering');
            dopo(primo ? 700 : 400, function () {
                if (distrutto || idCorrente !== id) return;
                if (primo) avvisa('onPronto');
                imposta('riproduzione');
            });
        }
        function play() {
            if (!tela) return;
            if (fermoA !== null) { ritardoMs += Date.now() - fermoA; fermoA = null; }
            tela._disegnato = false;
            imposta('riproduzione');
        }
        function pausa() {
            if (!tela) return;
            if (fermoA === null) fermoA = Date.now();
            imposta('pausa');
        }
        function alterna() { if (statoCorrente === 'riproduzione' || statoCorrente === 'buffering') pausa(); else play(); }
        function vaiAlLive() {
            ritardoMs = 0; fermoA = null;
            if (tela) tela._disegnato = false;
            imposta('buffering');
            dopo(300, function () { if (!distrutto) imposta('riproduzione'); });
        }

        return {
            carica: carica, play: play, pausa: pausa, alterna: alterna,
            muto: function () { muto = true; avvisaVolume(); },
            smuto: function () { muto = false; avvisaVolume(); },
            eMuto: function () { return muto; },
            volume: function (n) { vol = Math.max(0, Math.min(100, Math.round(Number(n) || 0))); avvisaVolume(); },
            leggiVolume: function () { return vol; },
            vaiAlLive: vaiAlLive,
            livelliQualita: function () { return []; },
            impostaQualita: function () { /* nell'anteprima c'e' una sola qualita' */ },
            stato: function () { return statoCorrente; },
            mostra: function (si) { visibile = !!si; if (tela) tela._disegnato = false; applicaVisibilita(); },
            distruggi: function () {
                distrutto = true;
                cancelAnimationFrame(anim);
                timer.forEach(clearTimeout);
                if (osservatore) osservatore.disconnect();
                if (tela && tela.parentNode) tela.parentNode.removeChild(tela);
                tela = null; ctx = null;
            }
        };
    }

    window.NGBPlayer = { nome: 'anteprima', crea: crea, idDa: idDa };
})();
