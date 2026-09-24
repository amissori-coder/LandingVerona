/* ============================================================
   PROVE - una web TV di prova per il browser di Playwright
   ------------------------------------------------------------
   Due cose, per le prove della diretta:

   1. Il FLUSSO PUBBLICO DI PROVA: la diretta 24 ore su 24 che il
      progetto Shaka Player (Google) tiene accesa apposta per provare i
      player, in HLS e in DASH:
          https://storage.googleapis.com/shaka-live-assets/player-source.m3u8
          https://storage.googleapis.com/shaka-live-assets/player-source.mpd
      E' una diretta vera (niente fine), con una finestra DVR di un'ora,
      piu' qualita' (480p, 720p) e codec che il Chromium di Playwright sa
      leggere (AV1, VP9, Opus; H.264 no: questo Chromium non ha i codec
      proprietari). Il CORS e' aperto. In questo ambiente il browser non
      esce in rete da solo: inoltraPubblico() fa passare quelle
      richieste da Node, SENZA cache (le playlist di una diretta cambiano
      ogni pochi secondi).

   2. Una WEB TV FINTA su https://webtv.prova.test, con una diretta HLS
      vera trasmessa da ffmpeg (VP9 + Opus, due qualita', segmenti da 2
      secondi), da poter rompere a comando:
          /live/master.m3u8      il link principale
          /riserva/master.m3u8   il link di riserva (stesso contenuto, altro "server")
          /senza-cors/master.m3u8  come /live ma senza Access-Control-Allow-Origin
          /spento/master.m3u8    404 finche' controllo.spentoAcceso e' false
          /player/napoli         una pagina da incorporare (il ripiego)
          /player/bloccata       una pagina con X-Frame-Options: DENY
          /documento.pdf         un indirizzo che non e' ne' un flusso ne' una pagina
      controllo = { principaleGiu, riservaGiu, spentoAcceso }: con
      principaleGiu (o riservaGiu) true, playlist e segmenti di quel
      percorso rispondono 503, come un server caduto.

   Serve ffmpeg: quello nel PATH, quello di FFMPEG=/percorso, oppure
   quello del pacchetto Python imageio-ffmpeg (pip install imageio-ffmpeg).

   Uso:
       const F = require('./flusso-prova');
       const trasmissione = await F.avviaTrasmissione(cartella);   // { ferma() }
       const controllo = await F.instradaWebTv(context, cartella);
       await F.inoltraPubblico(context);
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

if (!process.env.NODE_USE_ENV_PROXY) process.env.NODE_USE_ENV_PROXY = '1';

const WEBTV = 'https://webtv.prova.test';
const FLUSSO_PUBBLICO_HLS = 'https://storage.googleapis.com/shaka-live-assets/player-source.m3u8';
const FLUSSO_PUBBLICO_DASH = 'https://storage.googleapis.com/shaka-live-assets/player-source.mpd';

function trovaFfmpeg() {
    for (const c of [process.env.FFMPEG, 'ffmpeg'].filter(Boolean)) {
        if (spawnSync(c, ['-version']).status === 0) return c;
    }
    const r = spawnSync('python3', ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())']);
    const p = String(r.stdout || '').trim();
    return r.status === 0 && p ? p : '';
}

/* La diretta HLS di prova: sempre in corso, due qualita' (360p e 180p),
   VP9 + Opus in fMP4 (quello che Chromium sa leggere), finestra di 20
   segmenti da 2 secondi. Aspetta che ci siano almeno 6 segmenti. */
async function avviaTrasmissione(cartella) {
    const ffmpeg = trovaFfmpeg();
    if (!ffmpeg) throw new Error('ffmpeg non trovato: installalo, oppure pip install imageio-ffmpeg, oppure FFMPEG=/percorso/ffmpeg');
    const dove = path.join(cartella, 'hls');
    fs.rmSync(dove, { recursive: true, force: true });
    fs.mkdirSync(dove, { recursive: true });
    const p = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-re',
        '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
        '-filter_complex', '[0:v]split=2[a][b];[b]scale=320:180[bo]', '-map', '[a]', '-map', '[bo]', '-map', '1:a', '-map', '1:a',
        '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-row-mt', '1', '-g', '50', '-keyint_min', '50',
        '-b:v:0', '800k', '-b:v:1', '250k', '-c:a', 'libopus', '-b:a', '64k',
        '-f', 'hls', '-hls_time', '2', '-hls_list_size', '20', '-hls_flags', 'delete_segments+independent_segments',
        '-hls_segment_type', 'fmp4', '-master_pl_name', 'master.m3u8', '-var_stream_map', 'v:0,a:0 v:1,a:1', 'stream_%v.m3u8'],
    { cwd: dove, stdio: 'ignore' });
    const fino = Date.now() + 40000;
    while (Date.now() < fino) {
        const segmenti = fs.existsSync(dove) ? fs.readdirSync(dove).filter(f => /\.m4s$/.test(f)).length : 0;
        if (fs.existsSync(path.join(dove, 'stream_1.m3u8')) && segmenti >= 6) break;
        await new Promise(r => setTimeout(r, 500));
    }
    return { cartella: dove, ferma() { try { p.kill('SIGKILL'); } catch (e) { /* gia' ferma */ } } };
}

const PAGINA_PLAYER = '<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Player della web TV</title></head>'
    + '<body style="margin:0;background:#111a33;color:#fff;font:20px sans-serif;display:grid;place-items:center;height:100vh">'
    + '<p id="player-webtv">Player della web TV (prova) · logo della web TV</p></body></html>';

/* Le risposte della web TV finta. Tutto passa da context.route: niente
   server, niente certificati. */
async function instradaWebTv(context, cartella, opzioni) {
    const controllo = Object.assign({ principaleGiu: false, riservaGiu: false, spentoAcceso: false, richieste: [] }, opzioni || {});
    const dove = path.join(cartella, 'hls');
    await context.route(WEBTV + '/**', route => {
        const u = new URL(route.request().url());
        controllo.richieste.push(u.pathname);
        const cors = { 'access-control-allow-origin': '*', 'cache-control': 'no-cache' };
        if (u.pathname === '/player/napoli') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PAGINA_PLAYER });
        if (u.pathname === '/player/bloccata') return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'x-frame-options': 'DENY' }, body: PAGINA_PLAYER });
        if (u.pathname === '/documento.pdf') return route.fulfill({ status: 200, headers: Object.assign({ 'content-type': 'application/pdf' }, cors), body: '%PDF-1.4 prova' });
        const m = /^\/(live|riserva|senza-cors|spento)\/([^/]+)$/.exec(u.pathname);
        if (!m) return route.fulfill({ status: 404, headers: cors, body: 'non trovato' });
        const [, percorso, file] = m;
        if ((percorso === 'live' && controllo.principaleGiu) || (percorso === 'riserva' && controllo.riservaGiu)) {
            return route.fulfill({ status: 503, headers: cors, body: 'servizio non disponibile' });
        }
        if (percorso === 'spento' && !controllo.spentoAcceso) return route.fulfill({ status: 404, headers: cors, body: 'non trovato' });
        const f = path.join(dove, path.basename(file));
        if (!fs.existsSync(f)) return route.fulfill({ status: 404, headers: cors, body: 'non trovato' });
        const intestazioni = { 'content-type': /\.m3u8$/.test(f) ? 'application/vnd.apple.mpegurl' : 'video/mp4', 'cache-control': 'no-cache' };
        if (percorso !== 'senza-cors') intestazioni['access-control-allow-origin'] = '*';
        return route.fulfill({ status: 200, headers: intestazioni, body: fs.readFileSync(f) });
    });
    return controllo;
}

/* Il flusso pubblico di Shaka, inoltrato da Node senza cache. */
async function inoltraPubblico(context) {
    const conteggio = { richieste: 0, errori: 0 };
    await context.route(/^https:\/\/storage\.googleapis\.com\/shaka-live-assets\//, async route => {
        const url = route.request().url();
        conteggio.richieste++;
        try {
            const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 Chrome/140 Safari/537.36' } });
            const corpo = Buffer.from(await r.arrayBuffer());
            await route.fulfill({ status: r.status, headers: { 'content-type': r.headers.get('content-type') || 'application/octet-stream', 'access-control-allow-origin': '*', 'cache-control': 'no-cache' }, body: corpo });
        } catch (e) {
            conteggio.errori++;
            await route.abort().catch(() => {});
        }
    });
    return conteggio;
}

module.exports = { WEBTV, FLUSSO_PUBBLICO_HLS, FLUSSO_PUBBLICO_DASH, trovaFfmpeg, avviaTrasmissione, instradaWebTv, inoltraPubblico };
