/* ============================================================
   PROVE - la diretta dalla WEB TV (player-webtv.js), sulle pagine vere
   ------------------------------------------------------------
       node diretta/prove/webtv.prova.js

   Serve ffmpeg: quello di sistema (ffmpeg nel PATH), oppure quello
   del pacchetto Python imageio-ffmpeg (pip install imageio-ffmpeg),
   oppure l'indirizzo in FFMPEG=/percorso/ffmpeg.

   Che cosa fa. ffmpeg trasmette una VERA diretta HLS di prova (due
   qualita', 360p e 180p, a segmenti da 2 secondi, sempre in corso),
   servita come se arrivasse da https://webtv.prova.test. Le pagine
   sono quelle vere (diretta/index.html e gestione/, con la loro CSP e
   il player vero), fatte girare con il servizio vero nel browser
   (anteprima/costruisci.js --player-vero: niente emulatori).

   COSA DIMOSTRA. La regia incolla il link .m3u8 della web TV, lo prova
   e lo applica; va in onda e il partecipante vede la diretta nel NOSTRO
   player (hls.js: Chromium non legge l'HLS da solo): il video scorre,
   la qualita' si sceglie (Automatica, 360p, 180p), «Attiva l'audio»,
   pausa e ripresa, «Torna in diretta». Poi il link del player della web
   TV (incorporato: restano solo i suoi comandi e il nostro schermo
   intero), un file video, e una diretta non ancora partita: la regia
   la salva con un avviso, il partecipante vede "non raggiungibile" e,
   appena la web TV trasmette, il video parte da solo. Link sbagliati
   (http, RTMP, DASH) rifiutati con il motivo. Nessun errore di CSP.
   Screenshot in risultati/screenshot-webtv/.
   ============================================================ */
'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn, execFileSync, spawnSync } = require('child_process');
const { chromium } = require('playwright');

const PORTA = 8795;
const QUI = __dirname;
const DIR = path.resolve(QUI, 'risultati/anteprima-vera');
const HLS = path.resolve(QUI, 'risultati/webtv-hls');
const FOTO = path.resolve(QUI, 'risultati/screenshot-webtv');
const WEBTV = 'https://webtv.prova.test';

let verdi = 0, rossi = 0;
function vero(c, d) { if (c) verdi++; else { rossi++; console.log('ROSSO  ' + d); } }

function trovaFfmpeg() {
    const candidati = [process.env.FFMPEG, 'ffmpeg'].filter(Boolean);
    for (const c of candidati) { if (spawnSync(c, ['-version']).status === 0) return c; }
    const r = spawnSync('python3', ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())']);
    const p = String(r.stdout || '').trim();
    return r.status === 0 && p ? p : '';
}

const TIPI = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const f = path.join(DIR, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
    if (!f.startsWith(DIR) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    let corpo = fs.readFileSync(f);
    if (u.pathname === '/' || u.pathname === '/index.html') {
        corpo = '<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>' + corpo + '</body></html>';
    }
    res.writeHead(200, { 'content-type': TIPI[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(corpo);
});

(async () => {
    const ffmpeg = trovaFfmpeg();
    if (!ffmpeg) {
        console.log('ROSSO  ffmpeg non trovato: installalo, oppure pip install imageio-ffmpeg, oppure FFMPEG=/percorso/ffmpeg');
        console.log('\n0 verdi, 1 rossi');
        process.exit(1);
    }
    execFileSync(process.execPath, [path.join(QUI, 'anteprima/costruisci.js'), '--player-vero'], { stdio: 'ignore' });
    fs.rmSync(HLS, { recursive: true, force: true });
    fs.mkdirSync(path.join(HLS, 'live'), { recursive: true });
    fs.mkdirSync(FOTO, { recursive: true });

    // un file video (WebM, 6 secondi) per il caso "link a un file"
    execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=25:duration=6',
        '-c:v', 'libvpx', '-b:v', '300k', path.join(HLS, 'prova.webm')]);
    // la diretta HLS: sempre in corso, due qualita', VP9 + Opus in fMP4 (quello che Chromium sa leggere)
    const trasmissione = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-re',
        '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
        '-filter_complex', '[0:v]split=2[a][b];[b]scale=320:180[bo]', '-map', '[a]', '-map', '[bo]', '-map', '1:a', '-map', '1:a',
        '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-row-mt', '1', '-g', '50', '-keyint_min', '50',
        '-b:v:0', '800k', '-b:v:1', '250k', '-c:a', 'libopus', '-b:a', '64k',
        '-f', 'hls', '-hls_time', '2', '-hls_list_size', '8', '-hls_flags', 'delete_segments+independent_segments',
        '-hls_segment_type', 'fmp4', '-master_pl_name', 'master.m3u8', '-var_stream_map', 'v:0,a:0 v:1,a:1', 'stream_%v.m3u8'],
    { cwd: path.join(HLS, 'live'), stdio: 'ignore' });
    const finoA = Date.now() + 30000;
    while (Date.now() < finoA && !(fs.existsSync(path.join(HLS, 'live/stream_1.m3u8')) && fs.readdirSync(path.join(HLS, 'live')).filter(f => /\.m4s$/.test(f)).length >= 6)) {
        await new Promise(r => setTimeout(r, 500));
    }

    await new Promise(r => server.listen(PORTA, '127.0.0.1', r));
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
    const errori = [];
    let accesaSpenta = false;   // la diretta "non ancora partita" comincia quando diventa true
    const richieste = [];
    try {
        const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'it-IT', timezoneId: 'Europe/Rome' });
        // i font e gli altri indirizzi esterni non servono: niente rete
        await context.route(/^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
        // la web TV finta: la diretta, il file, il suo player, e un indirizzo ancora spento
        await context.route(WEBTV + '/**', route => {
            const u = new URL(route.request().url());
            richieste.push(u.pathname);
            const cors = { 'access-control-allow-origin': '*', 'cache-control': 'no-cache' };
            if (u.pathname === '/player/napoli') {
                return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><title>Player</title><body style="margin:0;background:#113;color:#fff;font:20px sans-serif;display:grid;place-items:center;height:100vh"><p id="player-webtv">Player della web TV (prova)</p></body>' });
            }
            if (u.pathname === '/file/prova.webm') return route.fulfill({ status: 200, headers: Object.assign({ 'content-type': 'video/webm' }, cors), body: fs.readFileSync(path.join(HLS, 'prova.webm')) });
            let rel = '';
            if (u.pathname.startsWith('/live/')) rel = u.pathname.slice(6);
            else if (u.pathname.startsWith('/spento/') && accesaSpenta) rel = u.pathname.slice(8);
            const f = rel ? path.join(HLS, 'live', path.basename(rel)) : '';
            if (!f || !fs.existsSync(f)) return route.fulfill({ status: 404, headers: cors, body: 'non trovato' });
            return route.fulfill({ status: 200, headers: Object.assign({ 'content-type': /\.m3u8$/.test(f) ? 'application/vnd.apple.mpegurl' : 'video/mp4' }, cors), body: fs.readFileSync(f) });
        });
        const page = await context.newPage();
        page.on('console', m => { if (m.type() === 'error') errori.push(m.text()); });
        page.on('pageerror', e => errori.push('pageerror: ' + e.message));
        await page.goto('http://127.0.0.1:' + PORTA + '/');
        await page.locator('#preparazione').waitFor({ state: 'hidden', timeout: 30000 });
        const P = page.frameLocator('#fr-partecipante');
        const G = page.frameLocator('#fr-gestione');
        const video = () => P.locator('#video-player video');
        const statoVideo = () => P.locator('#video-player video').evaluate(v => ({ t: v.currentTime, fermo: v.paused, muto: v.muted, h: v.videoHeight, errore: v.error && v.error.code }));

        // il partecipante entra, la regia entra
        await page.locator('#tabella-accessi button').first().click();
        await P.locator('body[data-vista="attesa"]').waitFor({ timeout: 20000 });
        await page.locator('#tab-guida').click();
        await page.locator('#btn-usa-gestore').click();
        await G.locator('#sel-evento').waitFor({ state: 'visible', timeout: 20000 });
        await G.locator('[data-scheda="regia"]').click();

        // link sbagliati: rifiutati con il motivo, niente chiamato
        const sbagliati = [
            ['http://webtv.prova.test/live/master.m3u8', /https:\/\//],
            ['rtmp://ingest.webtv.prova.test/live/napoli', /RTMP/],
            ['https://webtv.prova.test/live/napoli.mpd', /DASH/]
        ];
        for (const [link, motivo] of sbagliati) {
            await G.locator('#regia-video').fill(link);
            await G.locator('#btn-cambia-video').click();
            await page.waitForTimeout(300);
            vero(motivo.test(await G.locator('#msg-video').innerText()), 'link rifiutato con il motivo: ' + link + ' -> «' + await G.locator('#msg-video').innerText() + '»');
        }

        // 1. il link HLS della web TV: provato in regia e applicato
        await G.locator('#regia-video').fill(WEBTV + '/live/master.m3u8');
        await G.locator('#btn-cambia-video').click();
        await G.locator('#dialogo-conferma[open]').waitFor({ timeout: 20000 });
        vero(/Cambiare il video per tutti/.test(await G.locator('#dialogo-conferma').innerText()), 'la regia prova il link HLS e chiede conferma');
        await G.locator('#conferma-ok').click();
        await page.waitForTimeout(800);
        vero(/webtv\.prova\.test\/live\/master\.m3u8/.test(await G.locator('#regia-video-attuale').innerText()), 'il video attuale in regia e\' il link della web TV');

        // 2. in onda: il partecipante vede la diretta nel nostro player
        await G.locator('#btn-in-onda').click();
        await G.locator('#conferma-ok').click();
        await page.locator('#tab-partecipante').click();
        await P.locator('body[data-vista="diretta"]').waitFor({ timeout: 20000 });
        await video().waitFor({ timeout: 15000 });
        await page.waitForTimeout(5000);
        const s1 = await statoVideo();
        await page.waitForTimeout(2500);
        const s2 = await statoVideo();
        vero(!s2.fermo && s2.t > s1.t + 1, 'la diretta HLS scorre nel nostro player (' + s1.t.toFixed(1) + ' s -> ' + s2.t.toFixed(1) + ' s)');
        vero(s2.muto === true, 'parte muta (autoplay), come con YouTube');
        vero(await P.locator('#riquadro-video').getAttribute('data-comandi') === 'pieni', 'con l\'HLS i comandi sono tutti nostri');
        await page.screenshot({ path: path.join(FOTO, '01-webtv-hls.png') });
        await page.locator('#cornice-partecipante').screenshot({ path: path.join(FOTO, 'diretta-webtv-telefono.png') });

        // la qualita': Automatica, 360p, 180p
        const opzioni = await P.locator('#sel-qualita option').allInnerTexts();
        vero(!(await P.locator('#sel-qualita').isHidden()) && opzioni.join(',') === 'Automatica,360p,180p', 'si sceglie la qualità: ' + opzioni.join(', '));
        const dentro = await P.locator('#barra-comandi').evaluate(b => {
            const r = b.getBoundingClientRect(), f = b.querySelector('#btn-schermo-intero').getBoundingClientRect();
            return f.width > 0 && f.right <= r.right + 1;
        });
        vero(dentro, 'sul telefono, con la scelta della qualità, lo schermo intero resta dentro la barra');
        await P.locator('#sel-qualita').selectOption({ label: '180p' });
        await page.waitForTimeout(7000);
        vero((await statoVideo()).h === 180, 'scelta 180p: il video passa a 180 righe (' + (await statoVideo()).h + ')');
        await P.locator('#sel-qualita').selectOption({ label: 'Automatica' });

        // audio, pausa, ripresa, torna in diretta
        await P.locator('#btn-attiva-audio').click();
        await page.waitForTimeout(600);
        vero((await statoVideo()).muto === false && await P.locator('#btn-attiva-audio').isHidden(), '«Attiva l\'audio» toglie il muto al video');
        await P.locator('#btn-play').click();
        await page.waitForTimeout(800);
        vero((await statoVideo()).fermo === true && !(await P.locator('#schermo-pausa').isHidden()), 'pausa: il video si ferma e compare la nostra schermata');
        await page.waitForTimeout(6000);
        await P.locator('#btn-live').click();
        await page.waitForTimeout(3000);
        const s3 = await statoVideo();
        const bordo = await P.locator('#video-player video').evaluate(v => v.seekable.length ? v.seekable.end(v.seekable.length - 1) : 0);
        vero(!s3.fermo && bordo - s3.t < 10, '«Torna in diretta» riparte vicino al punto piu\' recente (' + (bordo - s3.t).toFixed(1) + ' s di distanza)');

        // 3. il player della web TV incorporato: i suoi comandi, il nostro schermo intero
        await page.locator('#tab-gestione').click();
        await G.locator('#regia-video').fill('<iframe src="' + WEBTV + '/player/napoli" width="640" height="360" allowfullscreen></iframe>');
        await G.locator('#btn-cambia-video').click();
        await G.locator('#dialogo-conferma[open]').waitFor({ timeout: 20000 });
        await G.locator('#conferma-ok').click();
        await page.locator('#tab-partecipante').click();
        const fr = P.frameLocator('#video-player iframe');
        await fr.locator('#player-webtv').waitFor({ timeout: 15000 });
        vero(true, 'il codice da incorporare della web TV: il suo player compare nel nostro riquadro');
        await page.waitForTimeout(500);
        vero(await P.locator('#riquadro-video').getAttribute('data-comandi') === 'ridotti' && await P.locator('#btn-play').isHidden()
            && !(await P.locator('#btn-schermo-intero').isHidden()) && await P.locator('#btn-attiva-audio').isHidden(),
            'player incorporato: niente play/volume nostri, resta lo schermo intero');
        await page.screenshot({ path: path.join(FOTO, '02-webtv-incorporato.png') });
        await page.locator('#cornice-partecipante').screenshot({ path: path.join(FOTO, 'diretta-webtv-incorporato-telefono.png') });

        // 4. un file video
        await page.locator('#tab-gestione').click();
        await G.locator('#regia-video').fill(WEBTV + '/file/prova.webm');
        await G.locator('#btn-cambia-video').click();
        await G.locator('#dialogo-conferma[open]').waitFor({ timeout: 20000 });
        await G.locator('#conferma-ok').click();
        await page.locator('#tab-partecipante').click();
        await P.locator('#video-player video').waitFor({ timeout: 15000 });
        await page.waitForTimeout(2500);
        const f1 = await statoVideo();
        vero(!f1.fermo && f1.t > 0.5 && await P.locator('#riquadro-video').getAttribute('data-comandi') === 'pieni', 'un file video (.webm) si riproduce con i nostri comandi');

        // 5. la diretta non ancora partita: salvata con un avviso, poi parte da sola
        await page.locator('#tab-gestione').click();
        await G.locator('#regia-video').fill(WEBTV + '/spento/master.m3u8');
        await G.locator('#btn-cambia-video').click();
        await G.locator('#dialogo-conferma[open]').waitFor({ timeout: 30000 });
        const avviso = await G.locator('#dialogo-conferma').innerText();
        vero(/non vedo la diretta/.test(avviso), 'diretta non ancora partita: la regia avvisa ma non blocca («' + avviso.replace(/\s+/g, ' ').slice(0, 140) + '…»)');
        await G.locator('#conferma-ok').click();
        await page.locator('#tab-partecipante').click();
        await P.locator('#schermo-video[data-tipo="errore"]').waitFor({ state: 'visible', timeout: 30000 });
        vero(true, 'il partecipante vede «non raggiungibile» invece di uno schermo nero');
        await page.screenshot({ path: path.join(FOTO, '03-webtv-non-partita.png') });
        accesaSpenta = true;
        await P.locator('#video-player video').evaluate(() => 0).catch(() => 0);
        const ripresa = Date.now();
        let parte = false;
        while (Date.now() - ripresa < 45000) {
            await page.waitForTimeout(2000);
            const st = await P.locator('#video-player video').evaluate(v => ({ t: v.currentTime, fermo: v.paused })).catch(() => null);
            if (st && !st.fermo && st.t > 1 && await P.locator('#schermo-video').isHidden()) { parte = true; break; }
        }
        vero(parte, 'appena la web TV trasmette, il video parte da solo (dopo ' + Math.round((Date.now() - ripresa) / 1000) + ' s), senza ricaricare');
        await page.screenshot({ path: path.join(FOTO, '04-webtv-ripartita.png') });
        vero(richieste.some(r => /\/live\/stream_\d+\.m3u8$/.test(r)) && richieste.some(r => /\.m4s$/.test(r)), 'il player ha letto le playlist e i segmenti della web TV');
    } catch (e) {
        rossi++;
        console.log('ROSSO  interrotta: ' + (e && e.message ? e.message.split('\n')[0] : e));
    } finally {
        const rilevanti = errori.filter(t => !/status of 404|net::ERR_ABORTED|favicon/.test(t));
        vero(!rilevanti.some(t => /Content Security Policy/i.test(t)), 'nessuna violazione della CSP: ' + rilevanti.filter(t => /Content Security Policy/i.test(t)).slice(0, 3).join(' | '));
        vero(rilevanti.length === 0, 'nessun errore in console: ' + rilevanti.slice(0, 5).join(' | '));
        await browser.close();
        server.close();
        try { trasmissione.kill('SIGKILL'); } catch (e) { /* gia' ferma */ }
        console.log('\n' + verdi + ' verdi, ' + rossi + ' rossi');
        process.exit(rossi ? 1 : 0);
    }
})();
