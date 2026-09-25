/* ============================================================
   PROVE - il player del flusso diretto da solo (diretta/player-webtv.js,
   la modalita' B della diretta)
   ------------------------------------------------------------
       cd diretta/prove && node player.prova.js

   Una pagina minima (un riquadro, sorgente-video.js e player-webtv.js)
   e il player provato da solo, senza la pagina della diretta, con:
   - la diretta HLS PUBBLICA di prova di Shaka Player (in onda 24 ore su
     24, finestra per tornare indietro di un'ora, piu' codec per la
     stessa altezza: H.264, HEVC, VP9 e AV1; Chromium legge VP9/AV1):
       https://storage.googleapis.com/shaka-live-assets/player-source.m3u8
   - la stessa in DASH (.mpd), con dash.js;
   - una diretta locale fatta da ffmpeg (due qualita', finestra corta:
     niente barra per tornare indietro), servita come
     https://webtv.prova.test;
   - un link firmato: la web TV finta vuole la firma (?md5=...&expires=...)
     su OGNI richiesta, playlist delle qualita' e segmenti compresi; una
     qualita' sta su un altro server, che la firma non deve riceverla;
   - la pagina del player di Azoto (la modalita' A, che ora e' di
     player-azoto.js: qui deve dare l'errore 'link', senza iframe), un
     link che non risponde, una diretta non ancora partita, un link che
     non e' un flusso;
   - le correzioni della revisione: una playlist live FERMA (l'encoder
     spento, la rete di distribuzione che serve ancora l'ultima playlist:
     'segnale' dopo ~20 s, e finestra().avanza resta falso), il menu
     qualita' DASH in un riquadro di 1000 px, un segmento DASH perso
     (errore 27 di dash.js: nessun errore alla pagina), aggiornaFirma()
     che cambia la firma SENZA ricaricare (stesso <video>, pausa e
     posizione restano, le richieste dopo portano la firma nuova, quella
     vecchia sparisce anche dalla playlist principale), un link firmato
     di 1500 caratteri, un link non valido che spegne il flusso di prima,
     il video zittito mentre e' nascosto, muto/volume che non fanno
     ripartire, l'avvio automatico rifiutato (avvioBloccato, niente
     'lento'), niente 'lento' con la pagina nascosta.

   Il Chromium di Playwright non esce in rete da solo (il proxy di
   questo ambiente ricifra il traffico con un suo certificato): le
   richieste per storage.googleapis.com le fa Node, SENZA cache (una
   diretta cambia a ogni secondo), e tornano al browser con
   access-control-allow-origin: *. L'ora per dash.js (time.akamai.com)
   la da' la prova.

   Se sorgente-video.js non riconosce ancora i link DASH (il servizio lo
   riscrive in parallelo), la pagina usa un piccolo sostituto con le
   stesse regole del contratto.

   Esce con 1 se qualcosa e' rosso. Screenshot in
   risultati/screenshot-player/.
   ============================================================ */
'use strict';
process.env.NODE_USE_ENV_PROXY = process.env.NODE_USE_ENV_PROXY || '1';
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { chromium } = require('playwright');

const PORTA = 8796;
const QUI = __dirname;
const DIRETTA = path.resolve(QUI, '..');
const HLS_LOCALE = path.resolve(QUI, 'risultati/player-hls');
const FOTO = path.resolve(QUI, 'risultati/screenshot-player');
const SHAKA = 'https://storage.googleapis.com/shaka-live-assets/';
const HLS_PUBBLICO = SHAKA + 'player-source.m3u8';
const DASH_PUBBLICO = SHAKA + 'player-source.mpd';
const WEBTV = 'https://webtv.prova.test';
const ALTRO = 'https://altro.prova.test';
const FIRMA = 'md5=Ab_c-12%2B3&expires=2147483647';

let verdi = 0, rossi = 0;
function vero(c, d) { if (c) { verdi++; console.log('verde  ' + d); } else { rossi++; console.log('ROSSO  ' + d); } }
const aspetta = ms => new Promise(r => setTimeout(r, ms));

function trovaFfmpeg() {
    for (const c of [process.env.FFMPEG, 'ffmpeg'].filter(Boolean)) { if (spawnSync(c, ['-version']).status === 0) return c; }
    const r = spawnSync('python3', ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())']);
    const p = String(r.stdout || '').trim();
    return r.status === 0 && p ? p : '';
}

/* sorgente-video.js va bene se conosce i tipi del contratto (la pagina da
   incorporare solo se e' il player di Azoto) */
const AZOTO = 'https://cdn.azotosolutions.com/cloudtv/livetv29/player';
function sorgenteAggiornata() {
    try {
        const f = path.join(DIRETTA, 'sorgente-video.js');
        delete require.cache[require.resolve(f)];
        const V = require(f);
        return typeof V.perFlusso === 'function'
            && V.tipoDi('https://webtv.esempio.it/live/a.mpd') === 'dash'
            && V.tipoDi('https://webtv.esempio.it/live/a.m3u8') === 'hls'
            && V.tipoDi(AZOTO) === 'incorporato'
            && V.tipoDi('https://webtv.esempio.it/player/napoli') === ''
            && V.tipoDi('https://webtv.esempio.it/video/a.mp4') === '';
    } catch (e) { return false; }
}
// il sostituto: le regole del contratto (sezione 1), solo quello che serve al player
const SOSTITUTO = `(function () {
    function leggi(v) {
        var s = String(v == null ? '' : v).trim();
        if (!s) return null;
        if (!/^https:\\/\\//i.test(s)) return { errore: 'https' };
        var u; try { u = new URL(s); } catch (e) { return { errore: 'formato' }; }
        var p = u.pathname.toLowerCase(); u.hash = '';
        if (/\\.m3u8$/.test(p)) return { tipo: 'hls', valore: u.href };
        if (/\\.mpd$/.test(p)) return { tipo: 'dash', valore: u.href };
        if (/\\.(mp4|m4v|mov|webm|mkv|avi|flv|ts|m4s)$/.test(p)) return { errore: 'file' };
        if (u.hostname !== 'cdn.azotosolutions.com' || u.port) return { errore: 'non-azoto' };
        return { tipo: 'incorporato', valore: u.href };
    }
    function perFlusso(v) { var s = leggi(v); return s && s.tipo === 'incorporato' ? { errore: 'e-azoto' } : s; }
    window.NGBSorgenteVideo = { leggi: leggi, perFlusso: perFlusso, tipoDi: function (v) { var s = leggi(v); return s && !s.errore ? s.tipo : ''; } };
})();`;

const PAGINA = usaSostituto => '<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Prova del player</title>'
    + '<style>body{margin:0;background:#111;font:14px sans-serif;color:#fff}#c{position:relative;width:640px;height:360px;background:#000}</style></head><body>'
    + '<div id="c"></div>'
    + (usaSostituto ? '<script src="/sostituto-sorgente.js"></script>' : '<script src="/diretta/sorgente-video.js"></script>')
    + '<script src="/diretta/player-webtv.js"></script>'
    + '<script src="/prova.js"></script></body></html>';

// la parte della pagina che registra quello che dice il player
const PROVA_JS = `(function () {
    window.registro = [];
    window.tempi = [];
    window.qualita = [];
    function r(x) { window.registro.push({ t: Date.now(), x: x }); }
    window.nuovoPlayer = function () {
        if (window.pl) window.pl.distruggi();
        window.registro = []; window.tempi = []; window.qualita = []; window.messaggi = [];
        window.pl = NGBPlayer.crea(document.getElementById('c'), {
            onPronto: function () { r('pronto'); },
            onStato: function (s) { r('stato:' + s); },
            onErrore: function (e) { r('errore:' + e.codice); window.messaggi.push(e.codice + ': ' + e.messaggio); },
            onVolume: function (v) { r('volume:' + (v.muto ? 'muto' : v.volume)); },
            onTempo: function (t) { window.tempi.push(t); if (window.tempi.length > 400) window.tempi.shift(); },
            onQualita: function (l) { window.qualita.push(l); }
        });
        return true;
    };
    window.ultimo = function (prefisso) {
        for (var i = window.registro.length - 1; i >= 0; i--) if (window.registro[i].x.indexOf(prefisso) === 0) return window.registro[i];
        return null;
    };
})();`;

const TIPI = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
function server(usaSostituto) {
    return http.createServer((req, res) => {
        const u = new URL(req.url, 'http://x');
        if (u.pathname === '/') { res.writeHead(200, { 'content-type': TIPI['.html'], 'cache-control': 'no-store' }); res.end(PAGINA(usaSostituto)); return; }
        if (u.pathname === '/prova.js') { res.writeHead(200, { 'content-type': TIPI['.js'] }); res.end(PROVA_JS); return; }
        if (u.pathname === '/sostituto-sorgente.js') { res.writeHead(200, { 'content-type': TIPI['.js'] }); res.end(SOSTITUTO); return; }
        const f = path.join(DIRETTA, decodeURIComponent(u.pathname.replace(/^\/diretta\//, '/')));
        if (!f.startsWith(DIRETTA) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'content-type': TIPI[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
        res.end(fs.readFileSync(f));
    });
}

(async () => {
    const ffmpeg = trovaFfmpeg();
    const usaSostituto = !sorgenteAggiornata();
    console.log(usaSostituto ? '(sorgente-video.js non conosce ancora i tipi del contratto: si usa il sostituto)' : '(sorgente-video.js del contratto)');
    fs.mkdirSync(FOTO, { recursive: true });

    // la diretta locale: VP9 + Opus in fMP4, due qualita', 5 segmenti da 2 s (niente finestra per tornare indietro)
    let trasmissione = null;
    if (ffmpeg) {
        fs.rmSync(HLS_LOCALE, { recursive: true, force: true });
        fs.mkdirSync(HLS_LOCALE, { recursive: true });
        trasmissione = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-re',
            '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
            '-filter_complex', '[0:v]split=2[a][b];[b]scale=320:180[bo]', '-map', '[a]', '-map', '[bo]', '-map', '1:a', '-map', '1:a',
            '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-row-mt', '1', '-g', '50', '-keyint_min', '50',
            '-b:v:0', '800k', '-b:v:1', '250k', '-c:a', 'libopus', '-b:a', '64k',
            '-f', 'hls', '-hls_time', '2', '-hls_list_size', '5', '-hls_flags', 'delete_segments+independent_segments',
            '-hls_segment_type', 'fmp4', '-master_pl_name', 'master.m3u8', '-var_stream_map', 'v:0,a:0 v:1,a:1', 'stream_%v.m3u8'],
        { cwd: HLS_LOCALE, stdio: 'ignore' });
    }

    const srv = server(usaSostituto);
    await new Promise(r => srv.listen(PORTA, '127.0.0.1', r));
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
    const errori = [];
    const inoltri = { n: 0, falliti: 0, bloccati: 0, segmenti: [] };
    let bloccaSegmenti = false;
    // un segmento video del DASH pubblico che non arriva mai (404 a ogni tentativo): l'errore 27 di dash.js
    const perso = { attivo: false, url: '', richieste: 0 };
    const firmate = { webtv: [], altro: [] };
    // la diretta locale "fermata": una fotografia dei file (playlist e segmenti) che non cambia piu'
    const ferma = new Map();
    // le due firme del link firmato (aggiornaFirma): la web TV finta le accetta tutte e due
    const FIRMA_NUOVA = 'md5=Nuova_Firma-9&expires=2147483600';
    try {
        const context = await browser.newContext({ viewport: { width: 900, height: 600 }, locale: 'it-IT' });
        // la diretta pubblica: da Node, senza cache
        await context.route(SHAKA + '**', async route => {
            const url = route.request().url();
            if (bloccaSegmenti && /\.mp4(\?|$)/.test(url)) { inoltri.bloccati++; return route.abort('connectionreset'); }
            if (perso.attivo && !perso.url && /\/video_[^/]*_\d+\.mp4(\?|$)/.test(url)) perso.url = url.split('?')[0];
            if (perso.url && url.split('?')[0] === perso.url) { perso.richieste++; return route.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: 'perso' }); }
            if (/\.mp4(\?|$)/.test(url)) inoltri.segmenti.push(url);
            inoltri.n++;
            try {
                const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 Chrome/140 Safari/537.36' } });
                const corpo = Buffer.from(await r.arrayBuffer());
                await route.fulfill({ status: r.status, headers: { 'content-type': r.headers.get('content-type') || 'application/octet-stream', 'access-control-allow-origin': '*', 'cache-control': 'no-cache' }, body: corpo });
            } catch (e) { inoltri.falliti++; await route.abort().catch(() => {}); }
        });
        // l'ora per dash.js (sincronizzazione con il server)
        await context.route(/^https:\/\/time\.akamai\.com\//, route => route.fulfill({ status: 200, headers: { 'content-type': 'text/plain', 'access-control-allow-origin': '*' }, body: new Date().toISOString() }));
        // la web TV finta: diretta locale, player da incorporare, un link che non risponde, una diretta spenta
        // un altro server della web TV (una qualita' del link firmato sta qui): non deve ricevere la firma
        await context.route(ALTRO + '/**', route => {
            const u = new URL(route.request().url());
            firmate.altro.push(u.search);
            const f = path.join(HLS_LOCALE, path.basename(u.pathname));
            const cors = { 'access-control-allow-origin': '*', 'cache-control': 'no-cache' };
            if (fs.existsSync(f)) return route.fulfill({ status: 200, headers: Object.assign({ 'content-type': /\.m3u8$/.test(f) ? 'application/vnd.apple.mpegurl' : 'video/mp4' }, cors), body: fs.readFileSync(f) });
            return route.fulfill({ status: 404, headers: cors, body: 'non trovato' });
        });
        await context.route(WEBTV + '/**', route => {
            const u = new URL(route.request().url());
            const cors = { 'access-control-allow-origin': '*', 'cache-control': 'no-cache' };
            // la diretta firmata: senza la firma esatta (anche sui segmenti) 403
            if (u.pathname.startsWith('/firmato/')) {
                const coppie = u.search.slice(1).split('&');
                const vecchia = coppie.indexOf('md5=Ab_c-12%2B3') >= 0 && coppie.indexOf('expires=2147483647') >= 0;
                const nuova = coppie.indexOf('md5=Nuova_Firma-9') >= 0 && coppie.indexOf('expires=2147483600') >= 0;
                const unaSola = coppie.filter(c => /^md5=/.test(c)).length === 1 && coppie.filter(c => /^expires=/.test(c)).length === 1;
                const ok = (vecchia || nuova) && unaSola;
                firmate.webtv.push({ percorso: u.pathname, ok: ok, firma: !unaSola ? 'mista' : vecchia ? 'vecchia' : nuova ? 'nuova' : 'nessuna', t: Date.now() });
                if (!ok) return route.fulfill({ status: 403, headers: cors, body: 'firma mancante' });
                const nome = path.basename(u.pathname);
                const f = path.join(HLS_LOCALE, nome);
                if (!fs.existsSync(f)) return route.fulfill({ status: 404, headers: cors, body: 'non trovato' });
                let corpo = fs.readFileSync(f);
                // la qualita' bassa sta su un altro server
                if (nome === 'master.m3u8') corpo = Buffer.from(corpo.toString('utf8').replace(/^stream_1\.m3u8$/m, ALTRO + '/live/stream_1.m3u8'));
                return route.fulfill({ status: 200, headers: Object.assign({ 'content-type': /\.m3u8$/.test(f) ? 'application/vnd.apple.mpegurl' : 'video/mp4' }, cors), body: corpo });
            }
            // la diretta fermata: sempre la stessa playlist (senza ENDLIST) e gli stessi segmenti
            if (u.pathname.startsWith('/ferma/')) {
                const nome = path.basename(u.pathname);
                if (!ferma.has(nome)) return route.fulfill({ status: 404, headers: cors, body: 'non trovato' });
                return route.fulfill({ status: 200, headers: Object.assign({ 'content-type': /\.m3u8$/.test(nome) ? 'application/vnd.apple.mpegurl' : 'video/mp4' }, cors), body: ferma.get(nome) });
            }
            // playlist che arrivano, segmenti mai (niente metadati): per l'avvio bloccato
            if (u.pathname.startsWith('/sospeso/')) {
                const nome = path.basename(u.pathname);
                if (!/\.m3u8$/.test(nome)) return;       // non risponde mai
                const f = path.join(HLS_LOCALE, nome);
                if (fs.existsSync(f)) return route.fulfill({ status: 200, headers: Object.assign({ 'content-type': 'application/vnd.apple.mpegurl' }, cors), body: fs.readFileSync(f) });
            }
            if (u.pathname.startsWith('/muto/')) return;       // non risponde mai
            if (u.pathname.startsWith('/live/')) {
                const f = path.join(HLS_LOCALE, path.basename(u.pathname));
                if (fs.existsSync(f)) return route.fulfill({ status: 200, headers: Object.assign({ 'content-type': /\.m3u8$/.test(f) ? 'application/vnd.apple.mpegurl' : 'video/mp4' }, cors), body: fs.readFileSync(f) });
            }
            return route.fulfill({ status: 404, headers: cors, body: 'non trovato' });
        });
        const page = await context.newPage();
        page.on('console', m => { if (m.type() === 'error') errori.push(m.text()); });
        page.on('pageerror', e => errori.push('pageerror: ' + e.message));
        await page.goto('http://127.0.0.1:' + PORTA + '/');
        await page.evaluate(() => nuovoPlayer());

        const aspettaChe = async (fn, arg, ms) => {
            try { await page.waitForFunction(fn, arg, { timeout: ms, polling: 250 }); return true; } catch (e) { return false; }
        };
        const video = () => page.evaluate(() => {
            const v = document.querySelector('#c video');
            return v ? { t: v.currentTime, fermo: v.paused, muto: v.muted, h: v.videoHeight, vis: v.style.visibility } : null;
        });
        const finestra = () => page.evaluate(() => pl.finestra());

        /* ---------- 1. HLS pubblico: avvio e riproduzione ---------- */
        const inizio = Date.now();
        await page.evaluate(u => pl.carica(NGBPlayer.idDa(u)), HLS_PUBBLICO);
        const parte = await aspettaChe(() => !!ultimo('stato:riproduzione'), null, 40000);
        vero(parte, 'HLS pubblico: la diretta parte (' + Math.round((Date.now() - inizio) / 1000) + ' s)');
        vero(await page.evaluate(() => !!ultimo('pronto')), 'onPronto arriva');
        const a1 = await video();
        await aspetta(3000);
        const a2 = await video();
        vero(a1 && a2 && !a2.fermo && a2.t > a1.t + 1.5, 'il video scorre (' + (a1 && a1.t.toFixed(1)) + ' -> ' + (a2 && a2.t.toFixed(1)) + ')');
        vero(a2 && a2.muto === true, 'parte muto (autoplay consentito dai browser)');
        await page.screenshot({ path: path.join(FOTO, '01-hls-pubblico.png') });

        // gli attributi del <video> e niente menu del tasto destro
        const attr = await page.evaluate(() => {
            const v = document.querySelector('#c video');
            const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
            v.dispatchEvent(ev);
            const ev2 = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
            document.getElementById('c').dispatchEvent(ev2);
            return {
                playsinline: v.hasAttribute('playsinline') && v.playsInline === true,
                autoplay: v.autoplay, muto: v.defaultMuted, controlli: v.controls,
                lista: v.getAttribute('controlslist'),
                listaVera: v.controlsList ? ['nodownload', 'noplaybackrate', 'noremoteplayback'].every(x => v.controlsList.contains(x)) : null,
                pip: v.disablePictureInPicture, remoto: v.disableRemotePlayback,
                menuVideo: ev.defaultPrevented, menuRiquadro: ev2.defaultPrevented,
                iframe: !!document.querySelector('#c iframe')
            };
        });
        vero(attr.playsinline && attr.autoplay && attr.muto && !attr.controlli, '<video> playsinline, autoplay, muted, senza i comandi del browser');
        vero(attr.lista === 'nodownload noplaybackrate noremoteplayback' && attr.listaVera !== false, 'controlsList="nodownload noplaybackrate noremoteplayback"');
        vero(attr.pip === true && attr.remoto === true, 'disablePictureInPicture e disableRemotePlayback');
        vero(attr.menuVideo && attr.menuRiquadro, 'niente menu del tasto destro sul video e sul riquadro');
        // un vero clic destro: il menu non si apre (l'evento arriva annullato)
        await page.evaluate(() => { window.menuAnnullato = null; window.addEventListener('contextmenu', e => { window.menuAnnullato = e.defaultPrevented; }, { once: true }); });
        await page.mouse.click(300, 180, { button: 'right' });
        await aspetta(200);
        vero(await page.evaluate(() => window.menuAnnullato === true), 'clic destro vero sul video: menu annullato');

        /* ---------- 2. qualita': una voce per altezza, niente doppioni ---------- */
        const q = await page.evaluate(() => ({ voci: pl.livelliQualita(), cap: pl.capacita(), arrivate: qualita.length }));
        const etichette = q.voci.map(v => v.etichetta);
        vero(etichette[0] === 'Automatica' && etichette.length >= 3, 'qualità: ' + etichette.join(', '));
        vero(new Set(etichette).size === etichette.length, 'nessuna altezza doppia (il flusso ha 8 livelli per 2 altezze)');
        vero(q.cap.qualita === true && q.cap.comandi === true, 'capacita(): comandi e qualità');
        vero(q.arrivate > 0, 'onQualita ha dato l\'elenco');
        const v720 = q.voci.find(v => v.etichetta === '720p');
        const v480 = q.voci.find(v => v.etichetta === '480p');
        if (v720 && v480) {
            await page.evaluate(v => pl.impostaQualita(v), v720.valore);
            const a720 = await aspettaChe(() => { const v = document.querySelector('#c video'); return v && v.videoHeight === 720 && !v.paused; }, null, 25000);
            vero(a720, 'scelta 720p: il video passa a 720 righe');
            await page.evaluate(v => pl.impostaQualita(v), v480.valore);
            const a480 = await aspettaChe(() => { const v = document.querySelector('#c video'); return v && v.videoHeight === 480 && !v.paused; }, null, 25000);
            vero(a480, 'scelta 480p: il video passa a 480 righe');
            const dopo = await page.evaluate(() => pl.livelliQualita().map(v => v.etichetta));
            vero(JSON.stringify(dopo) === JSON.stringify(etichette), 'l\'elenco resta lo stesso dopo il cambio (stessi codec)');
            await page.evaluate(() => pl.impostaQualita('-1'));
            await aspetta(1500);
            vero(await page.evaluate(() => !document.querySelector('#c video').paused), '«Automatica»: il video continua');
        } else {
            vero(false, 'qualità 720p e 480p presenti');
        }

        /* ---------- 3. finestra DVR, cerca(), ritardo, vaiAlLive ---------- */
        const f1 = await finestra();
        vero(f1.diretta === true && f1.dvr === true, 'finestra: è una diretta, con DVR (' + Math.round((f1.fine - f1.inizio) / 60) + ' minuti)');
        vero(f1.fine - f1.inizio > 1800, 'la finestra DVR è di circa un\'ora');
        vero(f1.ritardo < 10, 'all\'avvio si è al punto live (ritardo ' + f1.ritardo.toFixed(1) + ' s)');
        vero(await page.evaluate(() => pl.capacita().dvr === true), 'capacita().dvr');
        await page.evaluate(() => { const f = pl.finestra(); pl.cerca(f.fine - 120); });
        const indietro = await aspettaChe(() => { const f = pl.finestra(); const v = document.querySelector('#c video'); return f.ritardo > 105 && f.ritardo < 140 && !v.paused && v.readyState >= 3; }, null, 25000);
        const f2 = await finestra();
        vero(indietro, 'cerca() indietro di 2 minuti: ritardo ' + f2.ritardo.toFixed(1) + ' s, il video va');
        await aspetta(2500);
        const t2 = await page.evaluate(() => tempi[tempi.length - 1]);
        vero(t2 && t2.ritardo > 100 && t2.dvr === true && t2.diretta === true, 'onTempo riporta il ritardo (' + (t2 && t2.ritardo.toFixed(1)) + ' s)');
        await page.evaluate(() => pl.vaiAlLive());
        const live = await aspettaChe(() => { const f = pl.finestra(); const v = document.querySelector('#c video'); return f.ritardo < 10 && !v.paused; }, null, 20000);
        vero(live, 'vaiAlLive(): di nuovo al punto live (ritardo ' + (await finestra()).ritardo.toFixed(1) + ' s)');
        // la pausa fa crescere il ritardo
        await page.evaluate(() => pl.pausa());
        await aspetta(600);
        const p1 = await finestra();
        await aspetta(6000);
        const p2 = await finestra();
        vero(await page.evaluate(() => pl.stato()) === 'pausa' && p2.ritardo > p1.ritardo + 3, 'in pausa il ritardo cresce (' + p1.ritardo.toFixed(1) + ' -> ' + p2.ritardo.toFixed(1) + ' s)');
        // l'audio non fa ripartire un video in pausa (i tasti M e le frecce della pagina passano di qui)
        await page.evaluate(() => { pl.smuto(); pl.volume(60); pl.muto(); pl.smuto(); pl.volume(100); pl.muto(); });
        await aspetta(1500);
        vero(await page.evaluate(() => pl.stato() === 'pausa' && document.querySelector('#c video').paused), 'in pausa, smuto(), muto() e volume() non fanno ripartire il video');
        await page.evaluate(() => pl.vaiAlLive());
        vero(await aspettaChe(() => pl.stato() === 'riproduzione' && pl.finestra().ritardo < 10, null, 20000), 'dalla pausa, vaiAlLive() riparte dal punto live');

        // l'audio: lo stesso <video> dopo un nuovo carica(), con l'audio chiesto
        await page.evaluate(() => { document.querySelector('#c video').dataset.segno = 'uno'; pl.smuto(); pl.volume(80); });
        await aspetta(500);
        const audio1 = await page.evaluate(() => ({ muto: pl.eMuto(), vol: pl.leggiVolume() }));
        vero(audio1.muto === false && audio1.vol === 80, 'smuto() e volume(80)');
        await page.evaluate(u => pl.carica(u), HLS_PUBBLICO);
        await aspettaChe(() => pl.stato() === 'riproduzione', null, 30000);
        const stesso = await page.evaluate(() => ({ segno: document.querySelector('#c video').dataset.segno, quanti: document.querySelectorAll('#c video').length }));
        vero(stesso.segno === 'uno' && stesso.quanti === 1, 'un nuovo carica() riusa lo stesso <video> (l\'audio resta concesso)');
        await page.evaluate(() => pl.muto());

        // mostra(false): il video resta vivo ma non si vede, e non si sente (l'audio della persona resta)
        await page.evaluate(() => { registro = []; pl.smuto(); pl.mostra(false); });
        await aspetta(300);
        const nascosto = await page.evaluate(() => { const v = document.querySelector('#c video'); return { vis: v.style.visibility === 'hidden' && v.getAttribute('aria-hidden') === 'true', muto: v.muted, suo: pl.eMuto(), fermo: v.paused }; });
        await page.evaluate(() => pl.mostra(true));
        await aspetta(300);
        const rivisto = await page.evaluate(() => ({ muto: document.querySelector('#c video').muted, avvisi: registro.filter(r => /^volume:/.test(r.x)).map(r => r.x) }));
        vero(nascosto.vis, 'mostra(false) nasconde il video (anche ai lettori di schermo)');
        vero(nascosto.muto === true && nascosto.suo === false && !nascosto.fermo && rivisto.muto === false && rivisto.avvisi.indexOf('volume:muto') < 0,
            'nascosto il video va avanti MUTO (niente audio dietro una schermata), l\'audio della persona resta e torna quando si rimostra (' + JSON.stringify([nascosto, rivisto]) + ')');
        await page.evaluate(() => pl.muto());

        /* ---------- 4. segnale fermo: i segmenti non arrivano piu' ---------- */
        await page.evaluate(() => { registro = []; });
        bloccaSegmenti = true;
        const t0 = Date.now();
        const fermo = await aspettaChe(() => !!(ultimo('errore:segnale') || ultimo('errore:rete')), null, 90000);
        const quale = await page.evaluate(() => { const e = ultimo('errore:segnale') || ultimo('errore:rete'); return e ? e.x : ''; });
        vero(fermo, 'segmenti bloccati: onErrore «' + quale.replace('errore:', '') + '» dopo ' + Math.round((Date.now() - t0) / 1000) + ' s (' + inoltri.bloccati + ' richieste bloccate)');
        const statiFermo = await page.evaluate(() => registro.map(r => r.x).filter(x => /^stato:/.test(x)));
        vero(statiFermo.indexOf('stato:buffering') >= 0, 'prima dell\'errore il player dice «buffering»');
        await page.screenshot({ path: path.join(FOTO, '02-segnale-fermo.png') });
        bloccaSegmenti = false;
        // la pagina ricollega: un nuovo carica() riparte dal punto live
        await page.evaluate(u => { registro = []; pl.carica(u); }, HLS_PUBBLICO);
        vero(await aspettaChe(() => !!ultimo('stato:riproduzione') && pl.finestra().ritardo < 10, null, 40000), 'dopo il guasto, carica() riparte dal punto live');

        /* ---------- 5. DASH pubblico ---------- */
        await page.evaluate(() => nuovoPlayer());
        const d0 = Date.now();
        await page.evaluate(u => pl.carica(NGBPlayer.idDa(u)), DASH_PUBBLICO);
        const dParte = await aspettaChe(() => !!ultimo('stato:riproduzione'), null, 45000);
        vero(dParte, 'DASH pubblico: la diretta parte con dash.js (' + Math.round((Date.now() - d0) / 1000) + ' s)');
        vero(await page.evaluate(() => typeof window.dashjs === 'object'), 'dash.js caricato solo adesso (serve per il .mpd)');
        const d1 = await video();
        await aspetta(3000);
        const d2 = await video();
        vero(d1 && d2 && d2.t > d1.t + 1.5, 'il DASH scorre (' + (d1 && d1.t.toFixed(1)) + ' -> ' + (d2 && d2.t.toFixed(1)) + ')');
        const df = await finestra();
        vero(df.diretta && df.dvr && df.ritardo < 10, 'DASH: diretta con DVR (' + Math.round((df.fine - df.inizio) / 60) + ' minuti), ritardo ' + df.ritardo.toFixed(1) + ' s');
        const dq = await page.evaluate(() => pl.livelliQualita().map(v => v.etichetta));
        vero(dq[0] === 'Automatica' && new Set(dq).size === dq.length && dq.length >= 3, 'DASH: qualità senza doppioni: ' + dq.join(', '));
        await page.screenshot({ path: path.join(FOTO, '03-dash-pubblico.png') });
        await page.evaluate(() => { const f = pl.finestra(); pl.cerca(f.fine - 120); });
        const dIndietro = await aspettaChe(() => { const f = pl.finestra(); return f.ritardo > 100 && f.ritardo < 145 && pl.stato() === 'riproduzione'; }, null, 30000);
        vero(dIndietro, 'DASH: cerca() indietro di 2 minuti (ritardo ' + (await finestra()).ritardo.toFixed(1) + ' s)');
        await page.evaluate(() => pl.vaiAlLive());
        vero(await aspettaChe(() => pl.finestra().ritardo < 10 && pl.stato() === 'riproduzione', null, 30000), 'DASH: vaiAlLive() (ritardo ' + (await finestra()).ritardo.toFixed(1) + ' s)');
        const dLiv = await page.evaluate(() => pl.livelliQualita());
        for (const et of ['720p', '480p']) {
            const v = dLiv.find(x => x.etichetta === et);
            if (!v) { vero(false, 'DASH: qualità ' + et + ' presente'); continue; }
            await page.evaluate(x => pl.impostaQualita(x), v.valore);
            vero(await aspettaChe(h => { const e = document.querySelector('#c video'); return e && e.videoHeight === h; }, Number(et.replace('p', '')), 30000), 'DASH: scelta ' + et);
        }
        await page.evaluate(() => pl.impostaQualita('-1'));

        // DASH con un link firmato: dash.js mette la firma anche sui segmenti
        await page.evaluate(() => nuovoPlayer());
        inoltri.segmenti.length = 0;
        await page.evaluate(u => pl.carica(u, { firmato: true }), DASH_PUBBLICO + '?tok=prova-1&scade=99');
        const dFirmato = await aspettaChe(() => !!ultimo('stato:riproduzione'), null, 45000);
        const segD = inoltri.segmenti.slice();
        vero(dFirmato && segD.length > 0 && segD.every(u => /[?&]tok=prova-1&scade=99$|[?&]tok=prova-1(&|$)/.test(u) && /scade=99/.test(u)),
            'DASH firmato: la firma è su tutti i ' + segD.length + ' segmenti chiesti da dash.js');

        /* DASH in un riquadro largo 1000 px: il menu qualita' c'e' (con
           limitBitrateByPortal di dash.js 5 le rappresentazioni piu' larghe
           del riquadro sparivano, e con loro il menu). E un segmento perso:
           dash.js lo riprova, poi da' l'errore 27 (DOWNLOAD_ERROR_ID_CONTENT);
           la pagina non deve saperne niente, il video va avanti. */
        await page.evaluate(() => {
            document.getElementById('c').style.cssText = 'width:1000px;height:562px';
            // una spia sugli errori di dash.js (per sapere che il 27 e' arrivato davvero)
            window.erroriDash = [];
            if (!window.dashjs.MediaPlayer.spiato) {
                const vero = window.dashjs.MediaPlayer;
                const spia = function () {
                    const fabbrica = vero.apply(this, arguments);
                    const crea = fabbrica.create;
                    fabbrica.create = function () {
                        const pp = crea.apply(this, arguments);
                        pp.on(vero.events.ERROR, e => window.erroriDash.push(Number(e && e.error && e.error.code)));
                        return pp;
                    };
                    return fabbrica;
                };
                Object.keys(vero).forEach(k => { spia[k] = vero[k]; });
                spia.spiato = true;
                window.dashjs.MediaPlayer = spia;
            }
            nuovoPlayer();
        });
        await page.evaluate(u => pl.carica(u), DASH_PUBBLICO);
        const d1000 = await aspettaChe(() => pl.stato() === 'riproduzione' && pl.livelliQualita().length >= 3, null, 45000);
        const menu1000 = await page.evaluate(() => pl.livelliQualita().map(v => v.etichetta));
        vero(d1000 && menu1000.indexOf('720p') > 0, 'DASH in un riquadro di 1000 px: il menu qualità c\'è (' + menu1000.join(', ') + ')');
        perso.attivo = true;
        const persoOk = await aspettaChe(() => window.erroriDash.indexOf(27) >= 0, null, 40000);
        await aspetta(3000);
        const dopoPerso = await video();
        await aspetta(3000);
        const dopoPerso2 = await video();
        const erroriPerso = await page.evaluate(() => registro.filter(r => /^errore:/.test(r.x)).map(r => r.x));
        vero(persoOk && erroriPerso.length === 0 && dopoPerso2.t > dopoPerso.t + 1.5,
            'un segmento DASH perso (' + perso.richieste + ' richieste, dash.js da\' l\'errore 27): nessun errore alla pagina (' + erroriPerso.join(',') + '), il video va avanti (' + dopoPerso.t.toFixed(1) + ' -> ' + dopoPerso2.t.toFixed(1) + ')');
        perso.attivo = false;
        await page.evaluate(() => { document.getElementById('c').style.cssText = ''; });

        /* ---------- 6. la diretta locale: finestra corta, niente DVR ---------- */
        if (ffmpeg) {
            const pronta = Date.now() + 30000;
            while (Date.now() < pronta && !(fs.existsSync(path.join(HLS_LOCALE, 'stream_1.m3u8')) && fs.readdirSync(HLS_LOCALE).filter(f => /\.m4s$/.test(f)).length >= 6)) await aspetta(500);
            await page.evaluate(() => nuovoPlayer());
            await page.evaluate(u => pl.carica(u), WEBTV + '/live/master.m3u8');
            const lParte = await aspettaChe(() => !!ultimo('stato:riproduzione'), null, 30000);
            vero(lParte, 'diretta locale (ffmpeg): parte');
            await aspetta(2500);
            const lf = await finestra();
            vero(lf.diretta === true && lf.dvr === false, 'finestra di ' + Math.round(lf.fine - lf.inizio) + ' s: diretta senza DVR (niente barra)');
            vero(await page.evaluate(() => pl.capacita().dvr === false), 'capacita().dvr falso');
            const lq = await page.evaluate(() => pl.livelliQualita().map(v => v.etichetta).join(','));
            vero(lq === 'Automatica,360p,180p', 'qualità della diretta locale: ' + lq);
            // una diretta vera va avanti: il bordo cresce (segmenti da 2 s)
            const va = await aspettaChe(() => pl.finestra().avanza === true, null, 15000);
            vero(va, 'diretta locale: finestra().avanza diventa vero (il bordo live cresce)');

            /* ---------- 6b. link firmato: la firma su ogni richiesta dello stesso server ---------- */
            // senza { firmato: true } la playlist della qualita' sullo stesso server arriva senza firma: 403
            await page.evaluate(() => nuovoPlayer());
            await page.evaluate(u => pl.carica(u), WEBTV + '/firmato/master.m3u8?' + FIRMA);
            const t403 = Date.now() + 15000;
            while (Date.now() < t403 && !firmate.webtv.some(r => !r.ok)) await aspetta(250);
            vero(firmate.webtv.some(r => !r.ok && /stream_0\.m3u8$/.test(r.percorso)), 'link firmato caricato come non firmato: la web TV rifiuta la playlist della qualità (403)');
            firmate.webtv.length = 0;
            firmate.altro.length = 0;
            await page.evaluate(() => nuovoPlayer());
            await page.evaluate(u => pl.carica(u, { firmato: true }), WEBTV + '/firmato/master.m3u8?' + FIRMA);
            const conFirma = await aspettaChe(() => !!ultimo('stato:riproduzione'), null, 30000);
            // tutte e due le qualita': 360p (stesso server) e 180p (l'altro server)
            const fq = await page.evaluate(() => pl.livelliQualita());
            for (const et of ['360p', '180p']) {
                const v = fq.find(x => x.etichetta === et);
                if (v) {
                    await page.evaluate(x => pl.impostaQualita(x), v.valore);
                    await aspettaChe(h => { const e = document.querySelector('#c video'); return e && e.videoHeight === h && !e.paused; }, Number(et.replace('p', '')), 20000);
                }
            }
            const segmentiFirmati = firmate.webtv.filter(r => /\.m4s$/.test(r.percorso));
            vero(conFirma && firmate.webtv.length > 3 && firmate.webtv.every(r => r.ok) && segmentiFirmati.length > 0,
                'link firmato: la diretta parte e la firma è su tutte le ' + firmate.webtv.length + ' richieste dello stesso server (' + segmentiFirmati.length + ' segmenti)');
            vero(firmate.altro.length > 0 && firmate.altro.every(q => !/md5=|expires=/.test(q)), 'le richieste verso un altro server (' + firmate.altro.length + ') restano senza firma');

            // un link firmato di 1500 caratteri (la firma puo' allungarlo): il tipo si legge dal percorso, e parte
            await page.evaluate(() => nuovoPlayer());
            await page.evaluate(u => pl.carica(u, { firmato: true }), WEBTV + '/firmato/master.m3u8?' + FIRMA + '&coda=' + 'x'.repeat(1500));
            const lungo = await aspettaChe(() => !!ultimo('stato:riproduzione') || !!ultimo('errore:'), null, 30000);
            vero(lungo && await page.evaluate(() => !!ultimo('stato:riproduzione') && !ultimo('errore:link')), 'link firmato di 1500 caratteri: niente errore «link», la diretta parte');

            /* aggiornaFirma(): il link firmato rinnovato, SENZA ricaricare. La
               playlist principale e' quella di una qualita' (la libreria la
               richiede di continuo con la firma VECCHIA nell'indirizzo): la
               firma vecchia deve sparire e al suo posto andare la nuova. */
            await page.evaluate(() => nuovoPlayer());
            await page.evaluate(u => pl.carica(u, { firmato: true }), WEBTV + '/firmato/stream_0.m3u8?' + FIRMA);
            const media = await aspettaChe(() => pl.stato() === 'riproduzione', null, 30000);
            await aspetta(2500);
            await page.evaluate(() => {
                const v = document.querySelector('#c video');
                v.dataset.segno = 'prima-della-firma';
                window.ricaricato = 0;
                v.addEventListener('emptied', () => { window.ricaricato++; });
                pl.pausa();
            });
            await aspetta(800);
            const primaFirma = await page.evaluate(() => ({ t: document.querySelector('#c video').currentTime, n: registro.length }));
            const tFirma = Date.now();
            await page.evaluate(u => pl.aggiornaFirma(u), WEBTV + '/firmato/stream_0.m3u8?' + FIRMA_NUOVA);
            await aspetta(7000);
            const dopoFirma = await page.evaluate(n => ({
                segno: document.querySelector('#c video').dataset.segno, ricaricato: window.ricaricato,
                fermo: document.querySelector('#c video').paused, t: document.querySelector('#c video').currentTime,
                stati: registro.slice(n).map(r => r.x).filter(x => /^(stato|errore)/.test(x))
            }), primaFirma.n);
            const richiesteDopo = firmate.webtv.filter(r => r.t > tFirma + 300);
            vero(media && dopoFirma.segno === 'prima-della-firma' && dopoFirma.ricaricato === 0 && dopoFirma.stati.length === 0,
                'aggiornaFirma(): il video NON si ricarica (stesso <video>, nessun cambio di stato: ' + JSON.stringify(dopoFirma.stati) + ')');
            vero(dopoFirma.fermo && Math.abs(dopoFirma.t - primaFirma.t) < 0.05, 'aggiornaFirma(): la pausa e la posizione restano (' + primaFirma.t.toFixed(2) + ' -> ' + dopoFirma.t.toFixed(2) + ')');
            vero(richiesteDopo.length > 0 && richiesteDopo.every(r => r.firma === 'nuova' && r.ok),
                'aggiornaFirma(): le ' + richiesteDopo.length + ' richieste dopo (la playlist, ricaricata in pausa) portano solo la firma nuova (' + richiesteDopo.map(r => r.firma).join(',') + ')');
            await page.evaluate(() => pl.play());
            await aspettaChe(() => pl.stato() === 'riproduzione', null, 15000);
            await aspetta(4000);
            const segDopo = firmate.webtv.filter(r => r.t > tFirma + 300 && /\.m4s$/.test(r.percorso));
            vero(segDopo.length > 0 && segDopo.every(r => r.firma === 'nuova' && r.ok), 'aggiornaFirma(): ripartito, i ' + segDopo.length + ' segmenti nuovi hanno la firma nuova');

            // un link non valido mentre il video va: il flusso di prima si spegne (niente audio dietro la schermata d'errore)
            await page.evaluate(() => { registro = []; pl.carica('https://webtv.prova.test/video/prova.mp4'); });
            await aspetta(500);
            const spento = await page.evaluate(() => { const v = document.querySelector('#c video'); return { errore: !!ultimo('errore:link'), fermo: !v || v.paused, src: v ? (v.getAttribute('src') || '') : '', dati: v ? v.readyState : 0 }; });
            vero(spento.errore && spento.fermo && !spento.src && spento.dati === 0, 'link non valido durante la diretta: «link», e il flusso di prima si spegne (niente src, nessun dato: ' + JSON.stringify(spento) + ')');

            /* ---------- 6c. playlist FERMA: l'encoder si e' spento, la rete di distribuzione serve ancora l'ultima playlist ---------- */
            ferma.clear();
            ['master.m3u8', 'stream_0.m3u8', 'stream_1.m3u8', 'init_0.mp4', 'init_1.mp4'].forEach(n => { const f = path.join(HLS_LOCALE, n); if (fs.existsSync(f)) ferma.set(n, fs.readFileSync(f)); });
            ['stream_0.m3u8', 'stream_1.m3u8'].forEach(n => {
                String(ferma.get(n) || '').split('\n').filter(r => /\.m4s\s*$/.test(r)).forEach(r => { const f = path.join(HLS_LOCALE, r.trim()); if (fs.existsSync(f)) ferma.set(r.trim(), fs.readFileSync(f)); });
            });
            /* Il video rigioca gli ultimi secondi e poi si fermerebbe (e dopo 12 s
               lo direbbe il segnale fermo): qui lo si fa andare a un decimo della
               velocita', cosi' non si ferma mai, e l'errore puo' venire SOLO dal
               controllo del bordo live che non cresce. */
            await page.evaluate(() => nuovoPlayer());
            const f0 = Date.now();
            await page.evaluate(u => pl.carica(u), WEBTV + '/ferma/master.m3u8');
            const fermaParte = await aspettaChe(() => !!ultimo('stato:riproduzione'), null, 20000);
            await page.evaluate(() => { document.querySelector('#c video').playbackRate = 0.1; });
            await aspetta(3000);
            const avanzaFerma = await page.evaluate(() => pl.finestra());
            const fermaErr = await aspettaChe(() => !!ultimo('errore:'), null, 45000);
            const quando = Math.round((Date.now() - f0) / 1000);
            const qualeFerma = await page.evaluate(() => ({ codici: registro.filter(r => /^errore:/.test(r.x)).map(r => r.x), messaggi: messaggi.slice(), fermo: document.querySelector('#c video').paused }));
            await page.evaluate(() => { const v = document.querySelector('#c video'); if (v) v.playbackRate = 1; });
            vero(fermaParte && avanzaFerma.diretta === true && avanzaFerma.avanza === false, 'playlist ferma: il video rigioca gli ultimi secondi, ma finestra().avanza resta falso (' + JSON.stringify({ diretta: avanzaFerma.diretta, avanza: avanzaFerma.avanza }) + ')');
            vero(fermaErr && qualeFerma.codici.length === 1 && qualeFerma.codici[0] === 'errore:segnale' && /non va avanti/.test(qualeFerma.messaggi[0] || '') && quando >= 18 && quando <= 26,
                'playlist ferma (il video non si ferma mai): UN errore «segnale» per il bordo fermo dopo ' + quando + ' s (3 segmenti, almeno 20 s): ' + qualeFerma.messaggi.join(' | '));

            /* ---------- 6d. l'avvio automatico rifiutato (iPhone in risparmio energetico) ---------- */
            await page.evaluate(() => {
                window.playVero = HTMLMediaElement.prototype.play;
                HTMLMediaElement.prototype.play = function () { return Promise.reject(new DOMException('rifiutato', 'NotAllowedError')); };
                nuovoPlayer();
            });
            await page.evaluate(u => pl.carica(u), WEBTV + '/sospeso/master.m3u8');
            const bloccatoOk = await aspettaChe(() => pl.avvioBloccato() === true, null, 15000);
            const nonAvviati = await page.evaluate(() => registro.filter(r => r.x === 'stato:non-avviato').length);
            vero(bloccatoOk && nonAvviati >= 2, 'avvio rifiutato dal browser: avvioBloccato() e onStato «non-avviato» ridetto alla pagina (' + nonAvviati + ' volte), anche senza metadati');
            await aspetta(17000);
            vero(await page.evaluate(() => !ultimo('errore:lento')), 'avvio bloccato: niente «lento» dopo 17 s (il video aspetta un tocco, non e\' lento)');
            const b0 = Date.now();
            await page.evaluate(() => { HTMLMediaElement.prototype.play = window.playVero; pl.play(); });
            const lentoDopo = await aspettaChe(() => !!ultimo('errore:lento'), null, 25000);
            const dopoTocco = Math.round((Date.now() - b0) / 1000);
            vero(lentoDopo && !(await page.evaluate(() => pl.avvioBloccato())) && dopoTocco >= 13 && dopoTocco <= 20, 'dopo il tocco (play()) il conto del «lento» riparte da li\' (' + dopoTocco + ' s)');

            // 'lento' non scatta con la pagina nascosta (una scheda in secondo piano)
            await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); nuovoPlayer(); });
            await page.evaluate(u => pl.carica(u), WEBTV + '/muto/master.m3u8');
            await aspetta(18000);
            const lentoNascosta = await page.evaluate(() => !!ultimo('errore:lento'));
            const v0 = Date.now();
            await page.evaluate(() => { delete document.visibilityState; });
            const lentoVisibile = await aspettaChe(() => !!ultimo('errore:lento'), null, 10000);
            vero(!lentoNascosta && lentoVisibile && Date.now() - v0 < 7000, 'pagina nascosta: niente «lento» (18 s); tornata visibile, «lento» dopo ' + Math.round((Date.now() - v0) / 1000) + ' s');
        } else {
            vero(false, 'ffmpeg non trovato (pip install imageio-ffmpeg, oppure FFMPEG=/percorso/ffmpeg)');
        }

        /* ---------- 7. il player di Azoto, link che non risponde, diretta spenta, link sbagliato ---------- */
        /* La pagina del player di Azoto (modalita' A) non e' di questo player:
           la mostra player-azoto.js. Qui: idDa() vuoto, onErrore 'link', e
           nel riquadro niente iframe e niente <video>. E nessuna richiesta
           verso Azoto (nelle prove la rete verso Azoto non si usa: la si conta). */
        const versoAzoto = [];
        await context.route('https://cdn.azotosolutions.com/**', route => { versoAzoto.push(route.request().url()); return route.abort(); });
        await page.evaluate(() => nuovoPlayer());
        const idAzoto = await page.evaluate(u => NGBPlayer.idDa(u), AZOTO);
        await page.evaluate(u => { registro = []; pl.carica(u); }, AZOTO);
        await aspetta(500);
        const azInfo = await page.evaluate(() => ({ link: !!ultimo('errore:link'), iframe: !!document.querySelector('#c iframe'), video: !!document.querySelector('#c video'), cap: pl.capacita(), stato: pl.stato() }));
        vero(idAzoto === '' && azInfo.link && !azInfo.iframe && !azInfo.video && versoAzoto.length === 0,
            'il player di Azoto non è un flusso: idDa() vuoto, onErrore «link», niente iframe né <video>, nessuna richiesta ad Azoto');
        vero(azInfo.cap.comandi === true && azInfo.cap.qualita === false && azInfo.cap.dvr === false && azInfo.stato === 'non-avviato',
            'capacita(): i comandi sono sempre i nostri (' + JSON.stringify(azInfo.cap) + ')');

        // una diretta non ancora partita (playlist 404): onErrore 'rete', presto
        await page.evaluate(() => { registro = []; });
        const s0 = Date.now();
        await page.evaluate(u => pl.carica(u), WEBTV + '/spenta/master.m3u8');
        vero(await aspettaChe(() => !!ultimo('errore:rete'), null, 20000), 'diretta non partita (404): onErrore «rete» dopo ' + Math.round((Date.now() - s0) / 1000) + ' s');

        // un link che non risponde: onErrore 'lento' dopo 15 s
        await page.evaluate(() => { registro = []; });
        const m0 = Date.now();
        await page.evaluate(u => pl.carica(u), WEBTV + '/muto/master.m3u8');
        const lento = await aspettaChe(() => !!(ultimo('errore:lento') || ultimo('errore:rete')), null, 30000);
        const primoErr = await page.evaluate(() => { const e = registro.find(r => /^errore:/.test(r.x)); return e ? e.x : ''; });
        vero(lento && primoErr === 'errore:lento', 'link che non risponde: onErrore «lento» dopo ' + Math.round((Date.now() - m0) / 1000) + ' s');

        // un link che non e' un flusso
        await page.evaluate(() => { registro = []; pl.carica('https://webtv.prova.test/video/prova.mp4'); });
        vero(await page.evaluate(() => !!ultimo('errore:link')), 'un file video non è una diretta: onErrore «link»');

        // distruggi(): niente resta nel riquadro
        await page.evaluate(() => pl.distruggi());
        vero(await page.evaluate(() => document.getElementById('c').children.length === 0), 'distruggi() svuota il riquadro');
    } catch (e) {
        rossi++;
        console.log('ROSSO  interrotta: ' + (e && e.message ? e.message.split('\n')[0] : e));
    } finally {
        // attesi: 404 (diretta spenta), 403 (link firmato caricato senza firma), le richieste bloccate
        const rilevanti = errori.filter(t => !/status of 40[34]|net::ERR_ABORTED|net::ERR_CONNECTION_RESET|net::ERR_FAILED|favicon/.test(t));
        vero(rilevanti.length === 0, 'nessun errore in console' + (rilevanti.length ? ': ' + rilevanti.slice(0, 5).join(' | ') : ''));
        console.log('(richieste inoltrate alla diretta pubblica: ' + inoltri.n + ', fallite ' + inoltri.falliti + ')');
        await browser.close();
        srv.close();
        if (trasmissione) { try { trasmissione.kill('SIGKILL'); } catch (e) { /* gia' ferma */ } }
        console.log('\n' + verdi + ' verdi, ' + rossi + ' rossi');
        process.exit(rossi ? 1 : 0);
    }
})();
