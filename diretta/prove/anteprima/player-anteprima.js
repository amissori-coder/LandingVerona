/* ============================================================
   IL PLAYER DELL'ANTEPRIMA: un video di prova disegnato nel browser
   ------------------------------------------------------------
   Nell'anteprima non si possono caricare video da altri siti (la
   pagina che la ospita non lo permette): niente canale della web TV.
   Al suo posto questo player, con la STESSA interfaccia di
   player-webtv.js:

       window.NGBPlayer = { nome, crea(contenitore, opzioni), idDa(url) }

   La pagina della diretta e la regia non sanno quale player stanno
   usando: qui si vedono i nostri comandi veri (qualita', «IN DIRETTA»,
   «Torna in diretta», la barra per tornare indietro) su una diretta
   finta, cominciata 4 minuti prima e con una finestra di 5 minuti.

   Il "video" e' un palco disegnato su un canvas: l'ora che scorre
   (quella della diretta: indietro, se si e' tornati indietro), il link
   caricato (cosi' si vede il cambio di link della regia), la qualita'
   scelta e un indicatore dell'audio quando e' attivo.
   ============================================================ */
(function () {
    'use strict';

    // come in player-webtv.js: accetta gli stessi link (sorgente-video.js), o almeno un indirizzo https
    function idDa(indirizzo) {
        var S = window.NGBSorgenteVideo;
        if (S) { var v = S.leggi(indirizzo); return v && !v.errore ? v.valore : ''; }
        var s = String(indirizzo == null ? '' : indirizzo).trim();
        try { var u = new URL(s); return u.protocol === 'https:' ? u.href : ''; } catch (e) { return ''; }
    }

    // la diretta finta: cominciata 4 minuti prima di carica(), finestra per tornare indietro di 5 minuti
    var GIA_IN_ONDA_S = 240;
    var FINESTRA_S = 300;
    var LIVELLI = [
        { valore: '-1', etichetta: 'Automatica' },
        { valore: '2', etichetta: '720p' },
        { valore: '1', etichetta: '480p' },
        { valore: '0', etichetta: '360p' }
    ];

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
        var ritardoMs = 0;          // quanto si e' indietro rispetto alla diretta (pause escluse)
        var origine = 0;            // quando e' "cominciata" la diretta finta (Date.now())
        var qualita = '-1';
        var timer = [];
        var timerTempo = null;

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
            var etichetta = ritardoMs > 10000 ? 'IN DIFFERITA' : 'DIRETTA DI PROVA';
            var lw = ctx.measureText(etichetta).width + u * 0.6;
            ctx.fillStyle = ritardoMs > 10000 ? '#5b6b7d' : '#c8102e';
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
            var q = LIVELLI.filter(function (l) { return l.valore === qualita; })[0];
            ctx.fillText('Video: ' + etichettaVideo(idCorrente) + '  ·  ' + (q ? q.etichetta : 'Automatica') + '  ·  al posto della web TV in questa anteprima', u * 0.65, H - u * 0.72);

            // l'audio, quando e' attivo: barrette che si muovono
            if (!muto && vol > 0) {
                ctx.fillStyle = 'rgba(255,255,255,0.85)';
                for (var b = 0; b < 5; b++) {
                    var alt = u * (0.12 + 0.3 * Math.abs(Math.sin(tempo * 6 + b * 1.3))) * (vol / 100);
                    ctx.fillRect(W - u * (1.3 - b * 0.2), u * 0.86 - alt, u * 0.12, alt);
                }
            }
        }

        /* ---------- il tempo della diretta finta ---------- */
        function finestra() {
            if (!tela || !origine) return { posizione: 0, inizio: 0, fine: 0, ritardo: 0, dvr: false, diretta: false };
            var fine = (Date.now() - origine) / 1000;
            var inizio = Math.max(0, fine - FINESTRA_S);
            var ritardo = Math.min(fine - inizio, (ritardoMs + (fermoA !== null ? Date.now() - fermoA : 0)) / 1000);
            return { posizione: fine - ritardo, inizio: inizio, fine: fine, ritardo: ritardo, dvr: true, diretta: true };
        }
        function tempo() { if (tela && origine) avvisa('onTempo', finestra()); }

        /* ---------- l'interfaccia ---------- */
        function carica(id) {
            id = String(id == null ? '' : id);
            if (distrutto || !id) return;
            var primo = !tela;
            idCorrente = id;
            ritardoMs = 0;
            fermoA = null;
            qualita = '-1';
            origine = Date.now() - GIA_IN_ONDA_S * 1000;
            monta();
            if (tela) tela._disegnato = false;
            if (primo && !muto) { muto = true; avvisaVolume(); }
            if (!timerTempo) timerTempo = setInterval(tempo, 1000);
            imposta('buffering');
            dopo(primo ? 700 : 400, function () {
                if (distrutto || idCorrente !== id) return;
                avvisa('onPronto');
                avvisa('onQualita', LIVELLI.slice());
                imposta('riproduzione');
                tempo();
            });
        }
        function play() {
            if (!tela) return;
            if (fermoA !== null) { ritardoMs += Date.now() - fermoA; fermoA = null; }
            tela._disegnato = false;
            imposta('riproduzione');
            tempo();
        }
        function pausa() {
            if (!tela) return;
            if (fermoA === null) fermoA = Date.now();
            imposta('pausa');
            tempo();
        }
        function alterna() { if (statoCorrente === 'riproduzione' || statoCorrente === 'buffering') pausa(); else play(); }
        function vaiAlLive() {
            ritardoMs = 0; fermoA = null;
            if (tela) tela._disegnato = false;
            imposta('buffering');
            dopo(300, function () { if (!distrutto) { imposta('riproduzione'); tempo(); } });
        }
        // come player-webtv.js: `secondi` nella scala di finestra(), fra inizio e fine
        function cerca(secondi) {
            var f = finestra();
            var s = Number(secondi);
            if (!f.diretta || !isFinite(s)) return;
            if (s >= f.fine - 1) { vaiAlLive(); return; }
            s = Math.max(f.inizio, Math.min(f.fine, s));
            ritardoMs = (f.fine - s) * 1000;
            if (fermoA !== null) fermoA = Date.now();
            if (tela) tela._disegnato = false;
            tempo();
        }

        return {
            carica: carica, play: play, pausa: pausa, alterna: alterna,
            muto: function () { muto = true; avvisaVolume(); },
            smuto: function () { muto = false; avvisaVolume(); },
            eMuto: function () { return muto; },
            volume: function (n) { vol = Math.max(0, Math.min(100, Math.round(Number(n) || 0))); avvisaVolume(); },
            leggiVolume: function () { return vol; },
            vaiAlLive: vaiAlLive, cerca: cerca, finestra: finestra,
            livelliQualita: function () { return tela ? LIVELLI.slice() : []; },
            impostaQualita: function (v) {
                var s = String(v);
                qualita = LIVELLI.some(function (l) { return l.valore === s; }) ? s : '-1';
                if (tela) tela._disegnato = false;
            },
            stato: function () { return statoCorrente; },
            mostra: function (si) { visibile = !!si; if (tela) tela._disegnato = false; applicaVisibilita(); },
            capacita: function () { return { comandi: true, qualita: !!tela, dvr: finestra().dvr }; },
            distruggi: function () {
                distrutto = true;
                cancelAnimationFrame(anim);
                clearInterval(timerTempo);
                timer.forEach(clearTimeout);
                if (osservatore) osservatore.disconnect();
                if (tela && tela.parentNode) tela.parentNode.removeChild(tela);
                tela = null; ctx = null;
            }
        };
    }

    window.NGBPlayer = { nome: 'anteprima', crea: crea, idDa: idDa };
})();
