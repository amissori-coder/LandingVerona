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
          /senza-cors/master.m3u8  come /live, ma il CORS non consente il nostro sito:
                                 Access-Control-Allow-Origin e' solo quello della web TV
                                 (https://webtv.prova.test). Non si puo' semplicemente
                                 togliere l'intestazione: se manca, route.fulfill di
                                 Playwright la aggiunge da solo con l'origine della pagina
                                 (playwright issue 12929) e il browser leggerebbe tutto
          /spento/master.m3u8    404 finche' controllo.spentoAcceso e' false
          /player/napoli         una pagina da incorporare (il ripiego)
          /player/bloccata       una pagina con X-Frame-Options: DENY
          /documento.pdf         un indirizzo che non e' ne' un flusso ne' una pagina
      controllo = { principaleGiu, riservaGiu, spentoAcceso }: con
      principaleGiu (o riservaGiu) true, playlist e segmenti di quel
      percorso rispondono 503, come un server caduto.
      Le risposte le decide UNA funzione, rispostaWebTv(url, controllo,
      cartella) -> { status, headers, body }, che usano:
      - il browser di Playwright: instradaWebTv(context, cartella), con
        context.route (niente server, niente certificati);
      - il SERVIZIO, cioe' la prova del link (azione 'prova-link',
        email-service/lib/diretta-prova-link.js), che scarica il link da
        Node e non dal browser: webtv.prova.test non esiste nel DNS, e il
        servizio rifiuta gli indirizzi privati (127.0.0.1 compreso, la
        protezione SSRF). Per le prove server-locale.js, SOLO con la
        variabile DIRETTA_PROVE_WEBTV=<cartella della trasmissione>,
        passa a provaLink un fetch e un lookup finti fatti qui
        (servizioWebTv): il lookup risponde per *.prova.test con un
        indirizzo pubblico (93.184.216.34) e per interno.prova.test con
        un indirizzo privato (10.20.30.40: un nome che porta nella rete
        interna, che il servizio deve rifiutare); il fetch risponde per
        webtv.prova.test con rispostaWebTv. Tutti gli altri nomi e
        indirizzi seguono le strade VERE del servizio (DNS vero,
        fetchSicuro con i suoi controlli). Il controllo lato servizio
        e' quello predefinito, oppure quello scritto in
        <cartella>/controllo.json (scriviControllo), riletto a ogni
        richiesta. Niente di tutto questo entra nel servizio vero: e'
        solo in questo file e in server-locale.js.

   3. Un PLAYER DI AZOTO FINTO su https://cdn.azotosolutions.com, al posto
      di quello vero (le prove non dipendono mai dalla rete di Azoto: il
      player vero carica librerie da cdn.jsdelivr.net e il flusso da
      server che questo ambiente non raggiunge). Imita quello che
      abbiamo visto del vero (vedi diretta/README.md, §5.1):
          /cloudtv/<canale>/player    301 verso .../player/ (come il vero)
          /cloudtv/<canale>/player/   la pagina del player: "Player Azoto
                                      (prova)", il nome del canale e un suo
                                      pulsante #play-azoto (un clic lo segna
                                      in body[data-premuto]: prova che niente
                                      di nostro copre i comandi di Azoto)
                                      <canale> = livetv<numero>
          /cloudtv/lento/player/      non risponde MAI (i 15 secondi)
          /cloudtv/bloccato/player/   X-Frame-Options: DENY
          /cloudtv/altrove/player/    302 verso un altro sito
      controlloAzoto = { fermo }: con fermo true TUTTE le pagine del player
      non rispondono (la web TV caduta), finche' torna false.
      rispostaAzoto(url, controllo) -> { status, headers, body } oppure
      { mai: true }; instradaAzoto(context) per il browser; per il
      servizio lo stesso fetch finto di servizioWebTv (qui sotto), che
      risponde anche per cdn.azotosolutions.com senza DNS ne' rete.

   Serve ffmpeg: quello nel PATH, quello di FFMPEG=/percorso, oppure
   quello del pacchetto Python imageio-ffmpeg (pip install imageio-ffmpeg).

   Uso:
       const F = require('./flusso-prova');
       const trasmissione = await F.avviaTrasmissione(cartella);   // { ferma() }
       const controllo = await F.instradaWebTv(context, cartella);
       const azoto = await F.instradaAzoto(context);          // { fermo, richieste }
       await F.inoltraPubblico(context);
       // nel processo del servizio (server-locale.js):
       const { fetch, lookup } = F.servizioWebTv(cartella, { fetchVero, lookupVero });
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

const CONTROLLO_PREDEFINITO = { principaleGiu: false, riservaGiu: false, spentoAcceso: false };

/* La risposta della web TV finta a un indirizzo (solo il percorso conta:
   la query, per esempio la firma di un link firmato, si ignora).
   -> { status, headers, body } (body: stringa o Buffer) */
function rispostaWebTv(url, controllo, cartella) {
    const c = Object.assign({}, CONTROLLO_PREDEFINITO, controllo || {});
    const u = new URL(url);
    const cors = { 'access-control-allow-origin': '*', 'cache-control': 'no-cache' };
    const nonTrovato = { status: 404, headers: cors, body: 'non trovato' };
    if (u.pathname === '/player/napoli') return { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body: PAGINA_PLAYER };
    if (u.pathname === '/player/bloccata') return { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'x-frame-options': 'DENY' }, body: PAGINA_PLAYER };
    if (u.pathname === '/documento.pdf') return { status: 200, headers: Object.assign({ 'content-type': 'application/pdf' }, cors), body: '%PDF-1.4 prova' };
    const m = /^\/(live|riserva|senza-cors|spento)\/([^/]+)$/.exec(u.pathname);
    if (!m) return nonTrovato;
    const [, percorso, file] = m;
    if ((percorso === 'live' && c.principaleGiu) || (percorso === 'riserva' && c.riservaGiu)) {
        return { status: 503, headers: cors, body: 'servizio non disponibile' };
    }
    if (percorso === 'spento' && !c.spentoAcceso) return nonTrovato;
    const f = path.join(cartella, 'hls', path.basename(file));
    if (!fs.existsSync(f)) return nonTrovato;
    let corpo;
    try { corpo = fs.readFileSync(f); } catch (_) { return nonTrovato; }   // un segmento appena cancellato da ffmpeg
    const intestazioni = { 'content-type': /\.m3u8$/.test(f) ? 'application/vnd.apple.mpegurl' : 'video/mp4', 'cache-control': 'no-cache' };
    intestazioni['access-control-allow-origin'] = percorso === 'senza-cors' ? WEBTV : '*';
    return { status: 200, headers: intestazioni, body: corpo };
}

/* La web TV finta vista dal browser: tutto passa da context.route.
   controllo.richieste: i percorsi chiesti; controllo.indirizzi: percorso
   e query (per vedere, per esempio, la firma di un link firmato). */
async function instradaWebTv(context, cartella, opzioni) {
    const controllo = Object.assign({}, CONTROLLO_PREDEFINITO, { richieste: [], indirizzi: [] }, opzioni || {});
    await context.route(WEBTV + '/**', route => {
        const url = route.request().url();
        const u = new URL(url);
        controllo.richieste.push(u.pathname);
        controllo.indirizzi.push(u.pathname + u.search);
        const r = rispostaWebTv(url, controllo, cartella);
        return route.fulfill({ status: r.status, headers: r.headers, body: r.body });
    });
    return controllo;
}

/* ---------- il player di Azoto finto ---------- */
const AZOTO = 'https://cdn.azotosolutions.com';
const PLAYER_AZOTO = AZOTO + '/cloudtv/livetv29/player';

function paginaAzoto(canale) {
    return '<!doctype html><html lang="it"><head><meta charset="utf-8"><title>AzotoSolutions (prova)</title>'
        + '<style>html,body{margin:0;height:100%;background:#000;color:#fff;font:18px sans-serif}'
        + 'main{height:100%;display:grid;place-content:center;text-align:center;gap:10px}'
        + '#play-azoto{font:inherit;padding:10px 22px;border-radius:6px;border:0;background:#2b6cb0;color:#fff;cursor:pointer}</style></head>'
        + '<body><main><p id="player-azoto-finto"><strong>Player Azoto (prova)</strong></p><p id="canale-azoto">' + canale + '</p>'
        + '<p><button id="play-azoto" type="button">&#9654; play (comandi di Azoto)</button></p></main>'
        + '<script>document.getElementById("play-azoto").addEventListener("click",function(){document.body.setAttribute("data-premuto","si")})</script>'
        + '</body></html>';
}

/* La risposta del player di Azoto finto. { mai: true } = non rispondere. */
function rispostaAzoto(url, controllo) {
    const c = controllo || {};
    const u = new URL(url);
    const html = { 'content-type': 'text/html; charset=UTF-8' };
    if (c.fermo) return { mai: true };
    const m = /^\/cloudtv\/([a-z0-9]+)\/player(\/?)$/.exec(u.pathname);
    if (!m) return { status: 404, headers: html, body: '<!doctype html><title>404</title>Not Found' };
    const [, canale, barra] = m;
    if (!barra) return { status: 301, headers: Object.assign({ location: AZOTO + u.pathname + '/' + u.search }, html), body: '' };
    if (canale === 'lento') return { mai: true };
    if (canale === 'bloccato') return { status: 200, headers: Object.assign({ 'x-frame-options': 'DENY' }, html), body: paginaAzoto(canale) };
    if (canale === 'altrove') return { status: 302, headers: Object.assign({ location: WEBTV + '/player/napoli' }, html), body: '' };
    if (!/^livetv\d+$/.test(canale)) return { status: 404, headers: html, body: '<!doctype html><title>404</title>Not Found' };
    return { status: 200, headers: html, body: paginaAzoto(canale) };
}

/* Il player di Azoto finto visto dal browser. controllo.fermo si puo'
   cambiare in ogni momento; le richieste "mai" restano appese (le chiude
   la fine del contesto). */
async function instradaAzoto(context, opzioni) {
    const controllo = Object.assign({ fermo: false, richieste: [] }, opzioni || {});
    await context.route(/^https:\/\/cdn\.azotosolutions\.com\//, route => {
        const url = route.request().url();
        controllo.richieste.push(new URL(url).pathname);
        const r = rispostaAzoto(url, controllo);
        if (r.mai) return undefined;
        return route.fulfill({ status: r.status, headers: r.headers, body: r.body });
    });
    return controllo;
}

/* ---------- la web TV finta vista dal SERVIZIO (solo per le prove) ---------- */
const IP_PUBBLICO_FINTO = '93.184.216.34';
const IP_INTERNO_FINTO = '10.20.30.40';
const FILE_CONTROLLO = 'controllo.json';

// il controllo per il servizio (un altro processo): <cartella>/controllo.json, se c'e'
function leggiControllo(cartella) {
    try { return Object.assign({}, CONTROLLO_PREDEFINITO, JSON.parse(fs.readFileSync(path.join(cartella, FILE_CONTROLLO), 'utf8'))); } catch (_) { return Object.assign({}, CONTROLLO_PREDEFINITO); }
}
function scriviControllo(cartella, controllo) {
    const c = {};
    Object.keys(CONTROLLO_PREDEFINITO).forEach(k => { c[k] = !!(controllo || {})[k]; });
    c.azoto = { fermo: !!((controllo || {}).azoto || {}).fermo };
    fs.writeFileSync(path.join(cartella, FILE_CONTROLLO), JSON.stringify(c));
}

/* fetch e lookup per provaLink (stesse firme di quelli veri del servizio:
   fetch(url, { method, redirect, signal, headers }) -> Response,
   lookup(host, { all: true, verbatim: true }) -> [{ address, family }]).
   Solo i nomi di prova sono finti; il resto va a fetchVero / lookupVero. */
function servizioWebTv(cartella, vere) {
    const fetchVero = vere && vere.fetchVero;
    const lookupVero = vere && vere.lookupVero;
    const lookup = (host, opzioni) => {
        const h = String(host || '').toLowerCase();
        if (h === 'interno.prova.test') return Promise.resolve([{ address: IP_INTERNO_FINTO, family: 4 }]);
        if (/(^|\.)prova\.test$/.test(h) || h === 'cdn.azotosolutions.com') return Promise.resolve([{ address: IP_PUBBLICO_FINTO, family: 4 }]);
        return lookupVero(host, opzioni);
    };
    const fetch = async (url, init) => {
        let u = null;
        try { u = new URL(url); } catch (_) { u = null; }
        if (init && init.signal && init.signal.aborted) throw Object.assign(new Error('interrotta'), { name: 'AbortError' });
        if (u && u.hostname === 'cdn.azotosolutions.com') {
            const a = rispostaAzoto(url, leggiControllo(cartella).azoto);
            if (a.mai) {
                // come un server che non risponde: finisce solo con il tempo massimo del servizio
                return new Promise((_, rifiuta) => {
                    if (init && init.signal) init.signal.addEventListener('abort', () => rifiuta(Object.assign(new Error('interrotta'), { name: 'AbortError' })));
                });
            }
            return new Response(a.status === 301 || a.status === 302 ? null : a.body, { status: a.status, headers: a.headers });
        }
        if (!u || u.hostname !== new URL(WEBTV).hostname) return fetchVero(url, init);
        const r = rispostaWebTv(url, leggiControllo(cartella), cartella);
        return new Response(r.body, { status: r.status, headers: r.headers });
    };
    return { fetch, lookup };
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

module.exports = {
    WEBTV, FLUSSO_PUBBLICO_HLS, FLUSSO_PUBBLICO_DASH, IP_PUBBLICO_FINTO, IP_INTERNO_FINTO, AZOTO, PLAYER_AZOTO, trovaFfmpeg, avviaTrasmissione,
    rispostaWebTv, instradaWebTv, rispostaAzoto, instradaAzoto, paginaAzoto, inoltraPubblico, servizioWebTv, leggiControllo, scriviControllo
};
