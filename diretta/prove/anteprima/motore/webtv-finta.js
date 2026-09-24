/* ============================================================
   ANTEPRIMA - la web TV finta (https://webtv.esempio.it e ogni
   indirizzo *.esempio.it)
   ------------------------------------------------------------
   Nell'anteprima nessuna richiesta esce in rete. Questa e' la web TV
   che risponde al posto di quella vera, per due usi:
   - la prova del link della gestione (azione 'prova-link' del servizio
     VERO: prova-link.js le passa questo `fetch` e questo `lookup`);
   - il controllo del CORS che la gestione fa dal browser (fetch
     dell'urlProva): anteprima/pagina.js gira qui le richieste per
     *.esempio.it.
   Che cosa risponde (sempre con Access-Control-Allow-Origin: *):
   - ...qualcosa.m3u8: una playlist principale con tre qualita'
     (1080p, 720p, 480p, H.264 + AAC); qualita_<altezza>.m3u8: la
     diretta, segmenti da 4 secondi, una finestra di 5 minuti per
     tornare indietro;
   - ...qualcosa.mpd: una diretta DASH (dynamic), finestra di 5 minuti;
   - i segmenti (.ts, .m4s, .mp4): pochi byte;
   - ogni altro indirizzo: la pagina del player della web TV (HTML,
     incorporabile);
   - gli indirizzi con "/spenta/" nel percorso: 404 (una diretta non
     ancora partita).
   Il video vero di questi link nell'anteprima non si vede comunque: al
   posto del player c'e' il video di prova (player-anteprima.js).
   ============================================================ */
'use strict';

const HOST = /(^|\.)esempio\.it$/i;
const DURATA_SEGMENTO = 4;
const FINESTRA_S = 300;
const QUALITA = [
    { altezza: 1080, larghezza: 1920, banda: 5000000, codec: 'avc1.640028,mp4a.40.2' },
    { altezza: 720, larghezza: 1280, banda: 2800000, codec: 'avc1.64001f,mp4a.40.2' },
    { altezza: 480, larghezza: 854, banda: 1200000, codec: 'avc1.64001e,mp4a.40.2' }
];

function serve(indirizzo) {
    try {
        const u = new URL(String(indirizzo));
        return u.protocol === 'https:' && HOST.test(u.hostname);
    } catch (e) { return false; }
}

function master() {
    return ['#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-INDEPENDENT-SEGMENTS']
        .concat(...QUALITA.map(q => ['#EXT-X-STREAM-INF:BANDWIDTH=' + q.banda + ',RESOLUTION=' + q.larghezza + 'x' + q.altezza + ',CODECS="' + q.codec + '",FRAME-RATE=25.000',
            'qualita_' + q.altezza + '.m3u8']))
        .join('\n') + '\n';
}
function media(altezza) {
    const n = Math.floor(Date.now() / 1000 / DURATA_SEGMENTO);
    const quanti = FINESTRA_S / DURATA_SEGMENTO;
    const righe = ['#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-TARGETDURATION:' + DURATA_SEGMENTO, '#EXT-X-MEDIA-SEQUENCE:' + (n - quanti)];
    for (let i = n - quanti; i < n; i++) righe.push('#EXTINF:' + DURATA_SEGMENTO.toFixed(3) + ',', 'seg_' + altezza + '_' + i + '.ts');
    return righe.join('\n') + '\n';
}
function mpd() {
    const inizio = new Date(Date.now() - 3600 * 1000).toISOString().replace(/\.\d+Z$/, 'Z');
    return '<?xml version="1.0" encoding="UTF-8"?>\n'
        + '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" profiles="urn:mpeg:dash:profile:isoff-live:2011" type="dynamic" availabilityStartTime="' + inizio
        + '" minimumUpdatePeriod="PT8S" timeShiftBufferDepth="PT' + FINESTRA_S + 'S" minBufferTime="PT2S">\n'
        + '  <Period id="0" start="PT0S">\n'
        + '    <AdaptationSet contentType="video" mimeType="video/mp4" segmentAlignment="true">\n'
        + '      <SegmentTemplate timescale="1000" duration="4000" initialization="v_$RepresentationID$_init.mp4" media="v_$RepresentationID$_$Number$.m4s" startNumber="1"/>\n'
        + QUALITA.map(q => '      <Representation id="' + q.altezza + '" bandwidth="' + q.banda + '" codecs="avc1.64001f" width="' + q.larghezza + '" height="' + q.altezza + '"/>\n').join('')
        + '    </AdaptationSet>\n  </Period>\n</MPD>\n';
}
function pagina() {
    return '<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Player della web TV</title></head>'
        + '<body style="margin:0;background:#113;color:#fff;font:20px sans-serif;display:grid;place-items:center;height:100vh"><p>Player della web TV (anteprima)</p></body></html>';
}

function risposta(corpo, stato, tipo, metodo, extra) {
    const h = Object.assign({ 'content-type': tipo, 'access-control-allow-origin': '*', 'cache-control': 'no-cache' }, extra || {});
    return new Response(metodo === 'HEAD' ? null : corpo, { status: stato, headers: h });
}

async function fetchFinto(indirizzo, init) {
    const metodo = String((init && init.method) || 'GET').toUpperCase();
    if (!serve(indirizzo)) throw new TypeError('rete non disponibile nell\'anteprima');
    const u = new URL(String(indirizzo));
    const p = u.pathname.toLowerCase();
    if (/\/spenta\//.test(p)) return risposta('non trovato', 404, 'text/plain', metodo);
    const nome = p.slice(p.lastIndexOf('/') + 1);
    if (/\.m3u8$/.test(p)) {
        const m = /^qualita_(\d+)\.m3u8$/.exec(nome);
        return risposta(m ? media(m[1]) : master(), 200, 'application/vnd.apple.mpegurl', metodo);
    }
    if (/\.mpd$/.test(p)) return risposta(mpd(), 200, 'application/dash+xml', metodo);
    if (/\.(ts|m4s|mp4|aac)$/.test(p)) {
        const corpo = new Uint8Array(188).fill(0x47);
        const range = init && init.headers ? (typeof init.headers.get === 'function' ? init.headers.get('range') : (init.headers.range || init.headers.Range)) : '';
        if (range) return risposta(corpo, 206, /\.ts$/.test(p) ? 'video/mp2t' : 'video/mp4', metodo, { 'content-range': 'bytes 0-187/188' });
        return risposta(corpo, 200, /\.ts$/.test(p) ? 'video/mp2t' : 'video/mp4', metodo);
    }
    return risposta(pagina(), 200, 'text/html; charset=utf-8', metodo);
}

// il DNS finto: ogni *.esempio.it e' un indirizzo pubblico qualsiasi
async function lookupFinto(host) {
    if (!HOST.test(String(host || ''))) throw Object.assign(new Error('ENOTFOUND ' + host), { code: 'ENOTFOUND' });
    return [{ address: '93.184.215.14', family: 4 }];
}

module.exports = { serve: serve, fetch: fetchFinto, lookup: lookupFinto };
