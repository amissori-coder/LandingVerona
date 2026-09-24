/* ============================================================
   PROVE - la prova del link della web TV (lib/diretta-prova-link.js)
   ------------------------------------------------------------
       node prove/diretta-prova-link.prove.js

   Niente da installare, niente rete: `fetch` e `lookup` sono finti
   (una piccola web TV in memoria). Esce con 1 se qualcosa e' rosso.

   COSA DIMOSTRANO.
   - HLS: master + media + segmento con il CORS -> ok, con le qualita'
     (1080p, 720p, 480p), la finestra per tornare indietro (somma degli
     #EXTINF), la durata dei segmenti; si manda Origin del nostro sito,
     si prova la qualita' piu' leggera e un segmento con Range piccolo.
     Senza CORS sulla playlist o sul segmento, CORS per un altro sito,
     404, 403, un server che non risponde (timeout), un corpo che non e'
     HLS, una registrazione (VOD), solo HEVC, una sola qualita'.
   - DASH: dynamic con timeShiftBufferDepth e le altezze, static
     (registrazione), manifest non valido, senza CORS.
   - Pagina da incorporare: si puo' (con l'avviso del ripiego),
     X-Frame-Options DENY e SAMEORIGIN, CSP frame-ancestors che ci
     include o no (e che vince su X-Frame-Options), non HTML, un flusso
     HLS senza .m3u8, il link .m3u8 trovato dentro la pagina.
   - SICUREZZA: http, indirizzo IP privato, nome che si risolve in un
     indirizzo privato (anche uno solo fra tanti, anche IPv6), redirect
     verso un indirizzo privato o verso http, troppi redirect, DNS che
     non risponde, al massimo 256 KB letti; il trasporto vero rifiuta
     gli indirizzi privati anche al momento della connessione.
   - I testi per la web TV contengono il link e il nostro dominio; mai
     la chiave di un link RTMP o una password.
   - Con la firma dell'evento si prova il link firmato (urlProva).
   ============================================================ */
'use strict';
const PL = require('../lib/diretta-prova-link');
const V = require('../lib/diretta-sorgente-video');

let rossi = 0, verdi = 0;
function vero(cond, descrizione, dettaglio) {
    if (cond) verdi++;
    else { rossi++; console.log('ROSSO  ' + descrizione + (dettaglio ? '\n       ' + dettaglio : '')); }
}
const SITO = 'https://nextgenerationbusiness.it';
const CORS = { 'access-control-allow-origin': '*' };

/* ---------- la web TV finta ---------- */
function crea(pagine, dns) {
    const registro = [];
    const risolti = [];
    const fetch = async (url, init) => {
        registro.push({ url: url, headers: Object.assign({}, init && init.headers) });
        const p = pagine[url];
        if (p === 'timeout') {
            return new Promise((_, no) => init.signal.addEventListener('abort', () => no(Object.assign(new Error('interrotta'), { name: 'AbortError' }))));
        }
        if (p === 'rifiuta') throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
        if (!p) return new Response('non trovato', { status: 404 });
        const v = typeof p === 'function' ? p(init) : p;
        return new Response(v.corpo === undefined ? '' : v.corpo, { status: v.stato || 200, headers: v.h || {} });
    };
    const lookup = async host => {
        risolti.push(host);
        const ip = (dns || {})[host] || (/\.(it|com|tv|net)$/.test(host) ? '93.184.216.34' : null);
        if (!ip) throw Object.assign(new Error('getaddrinfo ENOTFOUND ' + host), { code: 'ENOTFOUND' });
        return [].concat(ip).map(a => ({ address: a, family: a.indexOf(':') >= 0 ? 6 : 4 }));
    };
    return { fetch, lookup, registro, risolti };
}
function prova(link, pagine, dns, extra) {
    const w = crea(pagine, dns);
    return PL.provaLink(link, Object.assign({ fetch: w.fetch, lookup: w.lookup, timeoutMs: 300 }, extra || {})).then(r => ({ r, w }));
}
const codici = r => r.problemi.map(p => p.codice).sort().join(',');
const problema = (r, c) => r.problemi.find(p => p.codice === c);

/* ---------- le playlist ---------- */
const BASE = 'https://webtv.esempio.it/live/napoli/';
const MASTER = BASE + 'playlist.m3u8';
function master(varianti) {
    return '#EXTM3U\n#EXT-X-VERSION:3\n' + varianti.map(v => '#EXT-X-STREAM-INF:BANDWIDTH=' + v[1] + ',RESOLUTION=' + v[0] + ',CODECS="' + v[2] + '",FRAME-RATE=25\n' + v[3]).join('\n') + '\n';
}
const TRE = master([
    ['1920x1080', 5000000, 'avc1.640028,mp4a.40.2', '1080p/index.m3u8'],
    ['1280x720', 2800000, 'avc1.4d401f,mp4a.40.2', '720p/index.m3u8'],
    ['854x480', 1200000, 'avc1.4d401e,mp4a.40.2', '480p/index.m3u8']
]);
function media(n, durata, opz) {
    const o = opz || {};
    let s = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:' + durata + '\n#EXT-X-MEDIA-SEQUENCE:1000\n' + (o.tipo ? '#EXT-X-PLAYLIST-TYPE:' + o.tipo + '\n' : '');
    for (let i = 0; i < n; i++) s += '#EXTINF:' + durata.toFixed(3) + ',\nseg' + (1000 + i) + '.ts\n';
    return s + (o.fine ? '#EXT-X-ENDLIST\n' : '');
}
function webtv(opz) {
    const o = opz || {};
    const h = o.corsPlaylist === false ? {} : (o.corsPlaylist || CORS);
    const pagine = {};
    pagine[MASTER] = { corpo: o.master || TRE, h: Object.assign({ 'content-type': 'application/vnd.apple.mpegurl' }, h) };
    ['1080p', '720p', '480p'].forEach(q => {
        pagine[BASE + q + '/index.m3u8'] = { corpo: o.media || media(600, 6), h: Object.assign({ 'content-type': 'application/vnd.apple.mpegurl' }, h) };
        for (let i = 1000; i < 1600; i++) pagine[BASE + q + '/seg' + i + '.ts'] = { stato: 206, corpo: 'x', h: o.corsSegmenti === false ? {} : CORS };
    });
    return pagine;
}

(async () => {
    try {
        /* ================= HLS ================= */
        {
            const { r, w } = await prova(MASTER, webtv());
            vero(r.esito === 'ok' && r.tipo === 'hls' && r.valore === MASTER && r.problemi.length === 0, 'HLS completo con CORS: esito ok', JSON.stringify(r.problemi));
            vero(r.titolo === 'Flusso HLS in diretta, 3 qualità (1080p, 720p, 480p), si può tornare indietro di 60 minuti', 'titolo: «' + r.titolo + '»');
            vero(r.info.diretta === true && r.info.dvrSecondi === 3600 && r.info.durataSegmento === 6 && r.info.corsOk === true && r.info.raggiungibile === true,
                'info: diretta, 3600 s di finestra, segmenti da 6 s, CORS ok ' + JSON.stringify(r.info));
            vero(JSON.stringify(r.info.qualita) === '[{"altezza":1080,"banda":5000000},{"altezza":720,"banda":2800000},{"altezza":480,"banda":1200000}]', 'info.qualita dalla piu\' alta');
            vero(r.info.codec.indexOf('avc1.640028') >= 0 && r.info.codec.indexOf('mp4a.40.2') >= 0, 'info.codec: ' + r.info.codec.join(', '));
            vero(r.righe.some(x => /1080p \(5,0 Mbit\/s\)/.test(x)) && r.righe.some(x => /Segmenti da 6 secondi/.test(x)), 'righe con le qualita\' e i segmenti: ' + JSON.stringify(r.righe));
            vero(r.urlProva === MASTER, 'urlProva: il link stesso (nessuna firma)');
            vero(w.registro.length === 3 && w.registro[1].url === BASE + '480p/index.m3u8', 'tre richieste: master, la qualita\' piu\' leggera (480p), un segmento', w.registro.map(x => x.url).join(' | '));
            vero(w.registro.every(x => x.headers.origin === SITO), 'ogni richiesta porta Origin: ' + SITO);
            vero(w.registro[2].url === BASE + '480p/seg1599.ts' && w.registro[2].headers.range === 'bytes=0-1023', 'il segmento piu\' recente, con Range: bytes=0-1023');
            vero(w.risolti.indexOf('webtv.esempio.it') >= 0, 'il nome del server si risolve (DNS) prima di scaricare');
        }
        {
            const { r } = await prova(MASTER, webtv({ corsPlaylist: false }));
            const p = problema(r, 'cors');
            vero(r.esito === 'avviso' && p && !p.grave && r.info.corsOk === false, 'playlist senza CORS: avviso «cors» (non grave)', JSON.stringify(r.problemi));
            vero(p && /Chrome/.test(p.messaggio) && /Safari/.test(p.messaggio), 'messaggio chiaro: «' + (p && p.messaggio) + '»');
            vero(p && p.testoWebTv.indexOf(MASTER) >= 0 && p.testoWebTv.indexOf('Access-Control-Allow-Origin: ' + SITO) >= 0 && /^Buongiorno/.test(p.testoWebTv),
                'testo per la web TV con il link e il dominio: ' + (p && p.testoWebTv.slice(0, 160)));
            vero(r.urlProva === MASTER, 'con un avviso urlProva resta (la gestione conferma il CORS dal browser)');
        }
        {
            const { r } = await prova(MASTER, webtv({ corsSegmenti: false }));
            const p = problema(r, 'cors-segmenti');
            vero(r.esito === 'avviso' && codici(r) === 'cors-segmenti' && p.testoWebTv.indexOf(SITO) >= 0 && r.info.corsOk === false,
                'playlist con CORS ma segmenti senza: avviso «cors-segmenti»', JSON.stringify(r.problemi));
        }
        {
            const { r } = await prova(MASTER, webtv({ corsPlaylist: { 'access-control-allow-origin': 'https://altro-sito.it' } }));
            vero(codici(r) === 'cors' && /altro-sito\.it/.test(problema(r, 'cors').messaggio), 'CORS per un altro sito: «cors», e il messaggio dice per chi e\'');
        }
        {
            const { r } = await prova(MASTER, webtv({ corsPlaylist: { 'access-control-allow-origin': SITO } }));
            vero(r.esito === 'ok' && r.info.corsOk === true, 'CORS con il nostro dominio preciso: ok');
        }
        {
            const { r } = await prova(MASTER, {});
            const p = problema(r, 'non-trovato');
            vero(r.esito === 'avviso' && p && !p.grave && /404/.test(p.messaggio) && /non è ancora cominciata/.test(p.messaggio), '404: avviso «non-trovato» (prima della diretta e\' normale)', JSON.stringify(r.problemi));
            vero(p && p.testoWebTv.indexOf(MASTER) >= 0 && p.testoWebTv.indexOf(SITO) >= 0, '404: testo per la web TV con il link e il dominio');
            vero(/404/.test(r.titolo) && r.info.raggiungibile === true, 'titolo: «' + r.titolo + '»');
        }
        {
            const pag = {}; pag[MASTER] = { stato: 403, corpo: 'Forbidden' };
            const { r } = await prova(MASTER, pag);
            vero(codici(r) === 'rifiutato' && /403/.test(problema(r, 'rifiutato').messaggio) && /token/.test(problema(r, 'rifiutato').messaggio), '403: «rifiutato» (token, dominio o paese)');
            vero(r.esito === 'avviso' && problema(r, 'rifiutato').testoWebTv.indexOf(MASTER) >= 0, '403: avviso con il testo per la web TV');
        }
        {
            const pag = {}; pag[MASTER] = { stato: 503, corpo: 'guasto' };
            const { r } = await prova(MASTER, pag);
            vero(codici(r) === 'non-risponde' && /503/.test(r.problemi[0].messaggio), '503: «non-risponde» con il codice');
        }
        {
            const pag = {}; pag[MASTER] = 'timeout';
            const t0 = Date.now();
            const { r } = await prova(MASTER, pag);
            vero(codici(r) === 'non-risponde' && /non risponde entro/.test(r.problemi[0].messaggio) && Date.now() - t0 < 2000,
                'server che non risponde: «non-risponde» allo scadere del tempo (' + (Date.now() - t0) + ' ms)', JSON.stringify(r.problemi));
            vero(r.esito === 'avviso' && r.info.raggiungibile === false && r.titolo === 'Il server della web TV non risponde', 'avviso, non raggiungibile, titolo «' + r.titolo + '»');
        }
        {
            // un server che manda la playlist a goccia a goccia, senza mai finire
            const pag = {};
            pag[MASTER] = () => ({
                corpo: new ReadableStream({ async pull(c) { await new Promise(r => setTimeout(r, 50)); c.enqueue(Buffer.from('#EXTM3U\n')); } }),
                h: CORS
            });
            const t0 = Date.now();
            const { r } = await prova(MASTER, pag);
            vero(codici(r) === 'non-risponde' && /non risponde entro/.test(r.problemi[0].messaggio) && Date.now() - t0 < 2000,
                'server che manda i byte a goccia a goccia: la lettura si ferma allo scadere del tempo (' + (Date.now() - t0) + ' ms)', JSON.stringify(r.problemi));
        }
        {
            const pag = {}; pag[MASTER] = 'rifiuta';
            const { r } = await prova(MASTER, pag);
            vero(codici(r) === 'non-risponde' && /ECONNREFUSED/.test(r.problemi[0].messaggio), 'connessione rifiutata: «non-risponde» (' + r.problemi[0].messaggio + ')');
        }
        {
            const pag = {}; pag[MASTER] = { corpo: '<!DOCTYPE html><html><body>Diretta</body></html>', h: Object.assign({ 'content-type': 'text/html' }, CORS) };
            const { r } = await prova(MASTER, pag);
            const p = problema(r, 'non-e-hls');
            vero(r.esito === 'errore' && p && p.grave && /pagina web/.test(p.messaggio) && r.urlProva === '', 'corpo che non e\' HLS (una pagina): «non-e-hls» grave, esito errore, niente urlProva');
        }
        {
            const pag = {}; pag[MASTER] = { corpo: 'ciao', h: CORS };
            const { r } = await prova(MASTER, pag);
            vero(r.esito === 'errore' && /EXTM3U/.test(problema(r, 'non-e-hls').messaggio), 'corpo qualsiasi: «non-e-hls» (manca #EXTM3U)');
        }
        {
            const { r } = await prova(MASTER, webtv({ media: media(450, 6, { tipo: 'VOD', fine: true }) }));
            const p = problema(r, 'registrazione');
            vero(r.esito === 'avviso' && p && !p.grave && r.info.diretta === false && r.info.dvrSecondi === null, 'registrazione (VOD): avviso «registrazione», diretta false');
            vero(/^Registrazione HLS \(non è una diretta\), 3 qualità .*durata 45 minuti$/.test(r.titolo), 'titolo: «' + r.titolo + '»');
        }
        {
            const { r } = await prova(MASTER, webtv({ media: media(100, 6, { fine: true }) }));
            vero(codici(r) === 'registrazione', '#EXT-X-ENDLIST senza PLAYLIST-TYPE: registrazione');
        }
        {
            const { r } = await prova(MASTER, webtv({ media: media(600, 6, { tipo: 'EVENT' }) }));
            vero(r.esito === 'ok' && r.righe.some(x => /EVENT/.test(x)), 'playlist EVENT: diretta, e la riga dice che la finestra cresce');
        }
        {
            const soloHevc = master([['1920x1080', 4000000, 'hvc1.1.6.L120.90,mp4a.40.2', '1080p/index.m3u8'], ['1280x720', 2000000, 'hev1.1.6.L93.90,mp4a.40.2', '720p/index.m3u8']]);
            const { r } = await prova(MASTER, webtv({ master: soloHevc }));
            const p = problema(r, 'solo-hevc');
            vero(r.esito === 'avviso' && p && /H\.264/.test(p.messaggio) && /HEVC/.test(p.testoWebTv), 'solo HEVC: avviso «solo-hevc»', JSON.stringify(r.problemi));
        }
        {
            const misto = master([['1920x1080', 4000000, 'hvc1.1.6.L120.90,mp4a.40.2', '1080p/index.m3u8'], ['1280x720', 2000000, 'avc1.4d401f,mp4a.40.2', '720p/index.m3u8']]);
            const { r, w } = await prova(MASTER, webtv({ master: misto }));
            vero(r.esito === 'ok' && r.righe.some(x => /HEVC/.test(x)) && w.registro[1].url === BASE + '720p/index.m3u8', 'HEVC e H.264 insieme: ok, si prova la qualita\' H.264, una riga lo dice');
        }
        {
            const conAudio = TRE + '#EXT-X-STREAM-INF:BANDWIDTH=64000,CODECS="mp4a.40.2"\naudio/index.m3u8\n';
            const { r } = await prova(MASTER, webtv({ master: conAudio }));
            vero(r.info.qualita.length === 3 && /3 qualità/.test(r.titolo), 'una variante solo audio non conta fra le qualita\'');
        }
        {
            const pag = webtv();
            const solo = BASE + '480p/index.m3u8';
            pag[solo] = { corpo: media(5, 6), h: CORS };
            const { r } = await prova(solo, pag);
            vero(r.esito === 'ok' && r.titolo === 'Flusso HLS in diretta, una sola qualità, non si può tornare indietro', 'una sola qualita\' (playlist media): «' + r.titolo + '»');
            vero(r.righe.some(x => /una sola qualità/.test(x) && /master/.test(x)) && r.info.dvrSecondi === 30, 'riga che consiglia il link «master»; finestra di 30 s');
        }
        {
            const pag = webtv();
            delete pag[BASE + '480p/index.m3u8'];
            const { r } = await prova(MASTER, pag);
            vero(codici(r) === 'non-trovato' && /qualità 480p/.test(r.problemi[0].messaggio) && r.info.diretta === null, 'la playlist di una qualita\' manca: «non-trovato» con la qualita\'');
            vero(/non è stato possibile leggerlo tutto/.test(r.titolo), 'titolo: «' + r.titolo + '»');
        }
        {
            const pag = webtv();
            for (let i = 1000; i < 1600; i++) pag[BASE + '480p/seg' + i + '.ts'] = { stato: 403, h: CORS };
            const { r } = await prova(MASTER, pag);
            vero(codici(r) === 'rifiutato' && /segmento/.test(r.problemi[0].messaggio), 'segmenti che rifiutano (token non propagato): «rifiutato» sul segmento');
        }

        /* ================= DASH ================= */
        const MPD = 'https://dash.webtv.esempio.it/live/napoli/manifest.mpd';
        const mpd = (tipo, extra) => '<?xml version="1.0"?>\n<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="' + tipo + '" ' + (extra || '') + ' profiles="urn:mpeg:dash:profile:isoff-live:2011">\n<Period id="1">\n'
            + '<AdaptationSet mimeType="video/mp4" codecs="avc1.4d401f"><SegmentTemplate timescale="90000" duration="360000" media="v$Number$.m4s"/>\n'
            + '<Representation id="720" width="1280" height="720" bandwidth="2800000"/>\n<Representation id="360" width="640" height="360" bandwidth="800000"/>\n</AdaptationSet>\n'
            + '<AdaptationSet mimeType="audio/mp4" codecs="mp4a.40.2"><Representation id="a" bandwidth="128000"/></AdaptationSet>\n</Period>\n</MPD>\n';
        {
            const pag = {}; pag[MPD] = { corpo: mpd('dynamic', 'timeShiftBufferDepth="PT30M"'), h: Object.assign({ 'content-type': 'application/dash+xml' }, CORS) };
            const { r } = await prova(MPD, pag);
            vero(r.esito === 'ok' && r.tipo === 'dash' && r.titolo === 'Flusso DASH in diretta, 2 qualità (720p, 360p), si può tornare indietro di 30 minuti', 'DASH dynamic: «' + r.titolo + '»', JSON.stringify(r.problemi));
            vero(r.info.diretta === true && r.info.dvrSecondi === 1800 && r.info.durataSegmento === 4 && r.info.corsOk === true
                && JSON.stringify(r.info.qualita) === '[{"altezza":720,"banda":2800000},{"altezza":360,"banda":800000}]' && r.info.codec.join() === 'avc1.4d401f,mp4a.40.2',
            'DASH: finestra 1800 s, segmenti da 4 s, altezze e codec ' + JSON.stringify(r.info));
        }
        {
            const pag = {}; pag[MPD] = { corpo: mpd('static', 'mediaPresentationDuration="PT1H2M"'), h: CORS };
            const { r } = await prova(MPD, pag);
            vero(r.esito === 'avviso' && codici(r) === 'registrazione' && r.info.diretta === false && /durata 62 minuti/.test(r.titolo), 'DASH static: registrazione («' + r.titolo + '»)');
        }
        {
            const pag = {}; pag[MPD] = { corpo: mpd('dynamic'), h: {} };
            const { r } = await prova(MPD, pag);
            vero(codici(r) === 'cors' && r.info.corsOk === false && r.info.dvrSecondi === null && /non si può tornare indietro/.test(r.titolo), 'DASH senza CORS e senza finestra: «cors», niente DVR');
        }
        {
            const pag = {}; pag[MPD] = { corpo: '{"errore":true}', h: CORS };
            const { r } = await prova(MPD, pag);
            vero(r.esito === 'errore' && problema(r, 'non-e-dash') && problema(r, 'non-e-dash').grave, 'manifest non valido: «non-e-dash» grave');
        }
        vero(PL.durataIso('PT1H30M') === 5400 && PL.durataIso('PT59.5S') === 59.5 && PL.durataIso('P1DT1S') === 86401 && PL.durataIso('') === null && PL.durataIso('PT') === null, 'durate ISO 8601 (PT1H30M, PT59.5S, P1DT1S)');

        /* ================= PAGINA DA INCORPORARE ================= */
        const PAGINA = 'https://player.webtv.esempio.it/embed/napoli';
        const html = (h, corpo) => { const p = {}; p[PAGINA] = { corpo: corpo || '<!doctype html><html><body><video></video></body></html>', h: Object.assign({ 'content-type': 'text/html; charset=utf-8' }, h || {}) }; return p; };
        {
            const { r } = await prova(PAGINA, html());
            const p = problema(r, 'incorporato');
            vero(r.esito === 'avviso' && r.tipo === 'incorporato' && r.info.incorporabile === true && codici(r) === 'incorporato', 'pagina incorporabile: avviso «incorporato» (il ripiego)', JSON.stringify(r.problemi));
            vero(p && p.messaggio === V.AVVISO_INCORPORATO && !p.grave, 'il messaggio e\' AVVISO_INCORPORATO');
            vero(p && p.testoWebTv.indexOf('.m3u8') >= 0 && p.testoWebTv.indexOf(PAGINA) >= 0 && p.testoWebTv.indexOf(SITO) >= 0, 'testo per la web TV: chiede il link .m3u8, con la pagina e il dominio');
            vero(r.titolo === 'Pagina della web TV da incorporare (ripiego): si può incorporare' && r.urlProva === PAGINA, 'titolo: «' + r.titolo + '»');
        }
        for (const [xfo, desc] of [['DENY', 'DENY'], ['SAMEORIGIN', 'SAMEORIGIN'], ['deny', 'deny (minuscolo)'], ['SAMEORIGIN, ALLOWALL', 'valori in conflitto']]) {
            const { r } = await prova(PAGINA, html({ 'x-frame-options': xfo }));
            const p = problema(r, 'non-incorporabile');
            vero(r.esito === 'errore' && p && p.grave && r.info.incorporabile === false && /X-Frame-Options/.test(p.messaggio), 'X-Frame-Options ' + desc + ': «non-incorporabile» grave', JSON.stringify(r.problemi));
            vero(p && p.testoWebTv.indexOf('frame-ancestors ' + SITO) >= 0 && r.urlProva === '', 'testo per la web TV con frame-ancestors del nostro dominio; niente urlProva');
        }
        {
            const { r } = await prova(PAGINA, html({ 'x-frame-options': 'ALLOW-FROM https://nextgenerationbusiness.it' }));
            vero(r.info.incorporabile === true, 'X-Frame-Options ALLOW-FROM (ignorato dai browser): incorporabile');
        }
        {
            const { r } = await prova(PAGINA, html({ 'content-security-policy': 'default-src \'self\'; frame-ancestors \'self\' https://nextgenerationbusiness.it', 'x-frame-options': 'DENY' }));
            vero(r.esito === 'avviso' && r.info.incorporabile === true && r.righe.some(x => /frame-ancestors/.test(x)), 'CSP frame-ancestors che ci include (e vince su X-Frame-Options DENY): incorporabile');
        }
        {
            const { r } = await prova(PAGINA, html({ 'content-security-policy': 'frame-ancestors \'self\' https://altro-sito.it' }));
            const p = problema(r, 'non-incorporabile');
            vero(r.esito === 'errore' && p && /frame-ancestors 'self' https:\/\/altro-sito\.it/.test(p.messaggio), 'CSP frame-ancestors che non ci include: «non-incorporabile» (' + (p && p.messaggio) + ')');
        }
        {
            const { r } = await prova(PAGINA, html({ 'content-security-policy': 'frame-ancestors \'none\'' }));
            vero(r.info.incorporabile === false, 'frame-ancestors \'none\': non incorporabile');
        }
        {
            const { r } = await prova(PAGINA, html({ 'content-security-policy': 'frame-ancestors *.nextgenerationbusiness.it' }));
            vero(r.info.incorporabile === false, 'frame-ancestors *.nextgenerationbusiness.it: vale per i sottodomini, non per il dominio stesso');
        }
        {
            const { r: a } = await prova(PAGINA, html({ 'content-security-policy': 'frame-ancestors https:' }));
            const { r: b } = await prova(PAGINA, html({ 'content-security-policy': 'frame-ancestors *' }));
            const { r: c } = await prova(PAGINA, html({ 'content-security-policy': 'frame-ancestors nextgenerationbusiness.it' }));
            vero(a.info.incorporabile && b.info.incorporabile && c.info.incorporabile, 'frame-ancestors https:, * e nextgenerationbusiness.it (senza schema): incorporabile');
        }
        {
            const { r } = await prova(PAGINA, html({ 'content-security-policy': 'frame-ancestors *, frame-ancestors \'self\'' }));
            vero(r.info.incorporabile === false, 'due politiche CSP: valgono tutte e due (la piu\' stretta blocca)');
        }
        {
            const p = {}; p[PAGINA] = { corpo: '{"a":1}', h: { 'content-type': 'application/json' } };
            const { r } = await prova(PAGINA, p);
            vero(r.esito === 'errore' && problema(r, 'non-html') && /application\/json/.test(problema(r, 'non-html').messaggio), 'pagina che non e\' HTML: «non-html» grave');
        }
        {
            const p = {}; p[PAGINA] = { corpo: '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nx.m3u8\n', h: { 'content-type': 'application/x-mpegurl' } };
            const { r } = await prova(PAGINA, p);
            vero(r.esito === 'errore' && /non finisce con \.m3u8/.test(problema(r, 'non-html').messaggio), 'un flusso HLS senza .m3u8 nel link: lo dice');
        }
        {
            const corpo = '<!doctype html><html><script>var sorgente = "https:\\/\\/cdn.webtv.esempio.it\\/live\\/napoli\\/index.m3u8?t=1";</script></html>';
            const { r } = await prova(PAGINA, html({}, corpo));
            vero(r.righe.some(x => x.indexOf('https://cdn.webtv.esempio.it/live/napoli/index.m3u8?t=1') >= 0), 'il link .m3u8 dentro la pagina si propone come flusso diretto');
        }
        {
            const p = {}; p[PAGINA] = { stato: 404 };
            const { r } = await prova(PAGINA, p);
            vero(r.esito === 'avviso' && codici(r) === 'incorporato,non-trovato' && /non trovata/.test(r.titolo), 'pagina 404: avviso con il titolo «' + r.titolo + '»');
        }

        /* ================= SICUREZZA ================= */
        {
            const { r, w } = await prova('http://webtv.esempio.it/live/napoli/playlist.m3u8', webtv());
            const p = problema(r, 'https');
            vero(r.esito === 'errore' && p && p.grave && w.registro.length === 0 && w.risolti.length === 0, 'http: «https» grave, nessuna richiesta partita');
            vero(p && p.testoWebTv.indexOf('http://webtv.esempio.it/live/napoli/playlist.m3u8') >= 0 && p.testoWebTv.indexOf(SITO) >= 0, 'http: testo per la web TV con il link e il dominio');
        }
        for (const ip of ['127.0.0.1', '10.0.0.5', '169.254.169.254', '192.168.1.20', '100.64.1.1', '[::1]', '[fd00::1]', '[::ffff:127.0.0.1]']) {
            const { r, w } = await prova('https://' + ip + '/live/playlist.m3u8', {});
            vero(r.esito === 'errore' && codici(r) === 'non-pubblico' && w.registro.length === 0 && r.urlProva === '', 'indirizzo privato ' + ip + ': «non-pubblico», nessuna richiesta', JSON.stringify(r.problemi));
        }
        {
            const { r, w } = await prova('https://169.254.169.254/latest/meta-data/', {});
            vero(r.esito === 'errore' && codici(r) === 'non-pubblico' && r.tipo === 'incorporato' && w.registro.length === 0, 'i metadati del cloud (169.254.169.254) come pagina: solo «non-pubblico», nessuna richiesta');
        }
        {
            const { r, w } = await prova('https://interno.webtv.esempio.it/live/playlist.m3u8', {}, { 'interno.webtv.esempio.it': '10.0.0.7' });
            vero(r.esito === 'errore' && codici(r) === 'non-pubblico' && w.registro.length === 0, 'nome che si risolve in un indirizzo privato: «non-pubblico», nessuna richiesta');
        }
        {
            const { r, w } = await prova('https://misto.webtv.esempio.it/live/playlist.m3u8', {}, { 'misto.webtv.esempio.it': ['93.184.216.34', '192.168.0.1'] });
            vero(codici(r) === 'non-pubblico' && w.registro.length === 0, 'anche UNO solo fra gli indirizzi privato: «non-pubblico»');
        }
        {
            const { r } = await prova('https://v6.webtv.esempio.it/live/playlist.m3u8', {}, { 'v6.webtv.esempio.it': ['2a00:1450:4002::1', 'fe80::1'] });
            vero(codici(r) === 'non-pubblico', 'IPv6 link-local fra gli indirizzi: «non-pubblico»');
        }
        {
            const pag = webtv();
            const corto = 'https://corto.esempio.it/napoli.m3u8';
            pag[corto] = { stato: 302, h: { location: 'https://interno.esempio.it/live/playlist.m3u8' } };
            pag['https://interno.esempio.it/live/playlist.m3u8'] = { corpo: TRE, h: CORS };
            const { r, w } = await prova(corto, pag, { 'interno.esempio.it': '172.16.5.5' });
            vero(r.esito === 'errore' && codici(r) === 'non-pubblico' && w.registro.length === 1, 'redirect verso un indirizzo privato: «non-pubblico», la seconda richiesta non parte', w.registro.map(x => x.url).join(' | '));
        }
        {
            const pag = {};
            const corto = 'https://corto.esempio.it/napoli.m3u8';
            pag[corto] = { stato: 301, h: { location: 'http://webtv.esempio.it/live/napoli/playlist.m3u8' } };
            const { r, w } = await prova(corto, pag);
            vero(r.esito === 'errore' && codici(r) === 'https' && /redirect/.test(r.problemi[0].messaggio) && w.registro.length === 1, 'redirect verso http: «https» grave');
        }
        {
            const pag = {};
            for (let i = 0; i < 6; i++) pag['https://giro.esempio.it/' + i + '.m3u8'] = { stato: 302, h: { location: '/' + (i + 1) + '.m3u8' } };
            const { r, w } = await prova('https://giro.esempio.it/0.m3u8', pag);
            vero(codici(r) === 'non-risponde' && /troppe volte/.test(r.problemi[0].messaggio) && w.registro.length === 4, 'piu\' di 3 redirect: «non-risponde» (4 richieste in tutto)');
        }
        {
            const pag = webtv();
            const corto = 'https://corto.esempio.it/napoli.m3u8';
            pag[corto] = { stato: 307, h: { location: MASTER } };
            const { r, w } = await prova(corto, pag);
            vero(r.esito === 'ok' && r.righe.some(x => /rimanda a/.test(x)) && w.risolti.indexOf('corto.esempio.it') >= 0 && w.risolti.indexOf('webtv.esempio.it') >= 0,
                'redirect buono: ok, ogni salto ricontrollato (DNS di tutti e due i server)');
        }
        {
            const { r } = await prova('https://inesistente.invalid/live.m3u8', {});
            vero(codici(r) === 'non-risponde' && /DNS/.test(r.problemi[0].messaggio), 'nome che non esiste: «non-risponde» (DNS)');
        }
        {
            const { r } = await prova('rtmp://ingest.webtv.esempio.it/live/CHIAVE-SEGRETA-123', {});
            const p = problema(r, 'rtmp');
            vero(r.esito === 'errore' && p && /HLS/.test(p.testoWebTv) && p.testoWebTv.indexOf('CHIAVE-SEGRETA-123') < 0, 'RTMP: «rtmp» grave, e il testo per la web TV NON ripete la chiave di trasmissione');
        }
        {
            const { r } = await prova('https://mario:Password123@webtv.esempio.it/live.m3u8', {});
            const p = problema(r, 'credenziali');
            vero(r.esito === 'errore' && p && p.testoWebTv.indexOf('Password123') < 0 && JSON.stringify(r).indexOf('Password123') < 0, 'credenziali: «credenziali» grave, la password non compare nella risposta');
        }
        {
            const { r } = await prova('https://cdn.webtv.esempio.it/replica.mp4', {});
            vero(r.esito === 'errore' && codici(r) === 'file' && problema(r, 'file').testoWebTv.indexOf('replica.mp4') >= 0, 'file video: «file» grave, con il testo per la web TV');
        }
        {
            const { r } = await prova('diretta di napoli', {});
            const { r: vuoto } = await prova('', {});
            vero(r.esito === 'errore' && codici(r) === 'formato' && r.problemi[0].testoWebTv === '' && vuoto.esito === 'errore' && vuoto.titolo === 'Nessun link', 'testo qualsiasi e vuoto: «formato»');
        }
        {
            // una playlist enorme: si leggono al massimo 256 KB
            let dati = 0;
            const pag = {};
            pag[MASTER] = () => {
                const pezzo = Buffer.from(('#EXTINF:6.000,\nseg.ts\n').repeat(3000));
                let n = 0;
                return {
                    corpo: new ReadableStream({
                        pull(c) {
                            if (n++ === 0) { c.enqueue(Buffer.from('#EXTM3U\n#EXT-X-TARGETDURATION:6\n')); return; }
                            if (dati > 20 * 1024 * 1024) { c.close(); return; }
                            dati += pezzo.length;
                            c.enqueue(pezzo);
                        }
                    }),
                    h: CORS
                };
            };
            const { r } = await prova(MASTER, pag);
            vero(dati < 1024 * 1024 && r.info.raggiungibile === true, 'playlist enorme: letti ' + Math.round(dati / 1024) + ' KB (al massimo 256 KB, poi si smette)');
        }
        {
            const firmato = MASTER + '?md5=abc&expires=1800000000';
            const pag = webtv();
            pag[firmato] = pag[MASTER];
            delete pag[MASTER];
            const { r, w } = await prova(MASTER, pag, null, { firma: u => u + '?md5=abc&expires=1800000000' });
            vero(r.esito === 'ok' && r.valore === MASTER && r.urlProva === firmato && w.registro[0].url === firmato && r.righe.some(x => /firma/.test(x)),
                'con la firma dell\'evento: si prova il link firmato, urlProva e\' quello firmato, valore quello salvato');
        }
        {
            const pag = {}; pag[MASTER + '?t=1'] = { stato: 403 };
            const { r } = await prova(MASTER, pag, null, { firma: u => u + '?t=1' });
            vero(/chiave segreta/.test(problema(r, 'rifiutato').messaggio), '403 con la firma: il messaggio invita a controllare la chiave e i parametri');
        }

        /* ---------- il trasporto vero (senza rete: rifiuta prima di connettersi) ---------- */
        for (const u of ['https://127.0.0.1:9/x.m3u8', 'https://[::1]:9/x.m3u8', 'https://localhost:9/x.m3u8']) {
            let codice = '';
            try { await PL.fetchSicuro(u, {}); } catch (e) { codice = e.code || e.message; }
            vero(codice === 'NGB_NON_PUBBLICO', 'fetchSicuro rifiuta ' + u + ' anche al momento della connessione (' + codice + ')');
        }
        let http = '';
        try { await PL.fetchSicuro('http://example.com/x', {}); } catch (e) { http = e.message; }
        vero(/https/.test(http), 'fetchSicuro: solo https');

        /* ---------- ogni problema ha il suo messaggio; i gravi sono quelli del contratto ---------- */
        vero(['https', 'formato', 'file', 'rtmp', 'credenziali', 'non-pubblico', 'non-incorporabile', 'non-html', 'non-e-hls', 'non-e-dash'].every(c => PL.GRAVI.has(c))
            && ['cors', 'cors-segmenti', 'solo-hevc', 'registrazione', 'incorporato', 'non-risponde', 'non-trovato', 'rifiutato'].every(c => !PL.GRAVI.has(c)),
        'problemi gravi (non si salva) e avvisi (si salva dopo conferma) come da contratto');
    } catch (e) {
        rossi++;
        console.log('ROSSO  prova interrotta: ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e));
    }
    console.log('\n' + verdi + ' verdi, ' + rossi + ' rossi');
    process.exit(rossi ? 1 : 0);
})();
