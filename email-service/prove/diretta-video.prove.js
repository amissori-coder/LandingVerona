/* ============================================================
   PROVE - il link del video della diretta (lib/diretta-sorgente-video.js)
   ------------------------------------------------------------
       node prove/diretta-video.prove.js

   Niente da installare. Esce con 1 se qualcosa e' rosso.

   COSA DIMOSTRANO. Che la copia del servizio e' identica a quella del
   sito (diretta/sorgente-video.js); che si riconosce quello che una
   web TV puo' dare (link HLS .m3u8 anche con token, file video, link
   del player, codice da incorporare con gli &amp;) e i link di YouTube;
   che si rifiutano, con il motivo, http, RTMP/RTSP/SRT, DASH, link con
   credenziali, javascript: e testo qualsiasi; e che il servizio
   (leggiVideo, usata da salvaEvento e cambiaVideo) salva il valore giusto.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const V = require('../lib/diretta-sorgente-video');

let rossi = 0, verdi = 0;
function vero(cond, descrizione) {
    if (cond) verdi++;
    else { rossi++; console.log('ROSSO  ' + descrizione); }
}

/* ---------- la copia del servizio e' la stessa del sito ---------- */
const sito = fs.readFileSync(path.resolve(__dirname, '../../diretta/sorgente-video.js'), 'utf8');
const servizio = fs.readFileSync(path.resolve(__dirname, '../lib/diretta-sorgente-video.js'), 'utf8');
vero(sito === servizio, 'email-service/lib/diretta-sorgente-video.js e\' identica a diretta/sorgente-video.js (si modifica il sito e si ricopia)');

/* ---------- quello che si accetta ---------- */
const buoni = [
    ['https://webtv.esempio.it/live/napoli/playlist.m3u8', 'hls', 'https://webtv.esempio.it/live/napoli/playlist.m3u8'],
    ['  https://cdn.webtv.it/hls/evento/index.m3u8?token=abc123&scade=99  ', 'hls', 'https://cdn.webtv.it/hls/evento/index.m3u8?token=abc123&scade=99'],
    ['https://cdn.webtv.it/HLS/EVENTO/MASTER.M3U8', 'hls', 'https://cdn.webtv.it/HLS/EVENTO/MASTER.M3U8'],
    ['https://cdn.webtv.it/video/replica.mp4#t=30', 'file', 'https://cdn.webtv.it/video/replica.mp4'],
    ['https://cdn.webtv.it/video/replica.webm', 'file', 'https://cdn.webtv.it/video/replica.webm'],
    ['https://player.webtv.it/embed/napoli-2026', 'incorporato', 'https://player.webtv.it/embed/napoli-2026'],
    ['<iframe width="640" height="360" src="https://player.webtv.it/embed/123?autoplay=1&amp;muted=1" frameborder="0" allowfullscreen></iframe>', 'incorporato', 'https://player.webtv.it/embed/123?autoplay=1&muted=1'],
    ["<IFRAME SRC='https://player.webtv.it/e/9'></IFRAME>", 'incorporato', 'https://player.webtv.it/e/9'],
    ['<div style="padding:56% 0 0"><iframe src=https://player.webtv.it/x allow="autoplay"></iframe></div>', 'incorporato', 'https://player.webtv.it/x'],
    ['https://www.youtube.com/watch?v=abcdefghijk', 'youtube', 'abcdefghijk'],
    ['youtu.be/abcdefghijk', 'youtube', 'abcdefghijk'],
    ['https://www.youtube.com/live/abcdefghijk?si=xyz', 'youtube', 'abcdefghijk'],
    ['<iframe src="https://www.youtube-nocookie.com/embed/abcdefghijk"></iframe>', 'youtube', 'abcdefghijk'],
    ['abcdefghijk', 'youtube', 'abcdefghijk']
];
buoni.forEach(([testo, tipo, valore]) => {
    const r = V.leggi(testo);
    vero(r && !r.errore && r.tipo === tipo && r.valore === valore, 'accettato come ' + tipo + ': ' + testo.slice(0, 70) + ' -> ' + JSON.stringify(r));
    vero(!r || r.errore || V.tipoDi(r.valore) === tipo, 'il valore salvato si riconosce di nuovo come ' + tipo + ': ' + (r && r.valore));
});

/* ---------- quello che si rifiuta, con il motivo ---------- */
const cattivi = [
    ['http://webtv.esempio.it/live/playlist.m3u8', 'https', /https:\/\//],
    ['rtmp://ingest.webtv.it/live/chiave-segreta', 'rtmp', /RTMP/],
    ['rtmps://ingest.webtv.it:443/live/x', 'rtmp', /RTMP/],
    ['srt://ingest.webtv.it:9000', 'rtmp', /RTMP/],
    ['https://webtv.it/live/manifest.mpd', 'dash', /DASH/],
    ['https://utente:segreta@webtv.it/live/playlist.m3u8', 'credenziali', /password/],
    ['javascript:alert(1)', 'formato', /Non riconosco/],
    ['https://webtv.it/a b.m3u8', 'formato', /Non riconosco/],
    ['https://localhost/a.m3u8', 'formato', /Non riconosco/],
    ['https://webtv.it/"onload=x', 'formato', /Non riconosco/],
    ['diretta di napoli', 'formato', /Non riconosco/],
    ['<iframe width="640"></iframe>', 'codice', /src=/],
    ['https://webtv.it/' + 'a'.repeat(1100), 'lungo', /troppo lungo/]
];
cattivi.forEach(([testo, errore, messaggio]) => {
    const r = V.leggi(testo);
    vero(r && r.errore === errore && messaggio.test(V.messaggio(r)), 'rifiutato (' + errore + '): ' + testo.slice(0, 60) + ' -> ' + JSON.stringify(r) + ' «' + V.messaggio(r) + '»');
});
vero(V.leggi('') === null && V.leggi('   ') === null && /Incolla/.test(V.messaggio(null)), 'vuoto: nessun video, e il messaggio chiede di incollare il link');

/* ---------- il servizio: leggiVideo (la usano salvaEvento e cambiaVideo) ---------- */
const D = require('../lib/diretta-dati');
(async () => {
    try {
        const a = D.leggiVideo('https://webtv.esempio.it/live/napoli/playlist.m3u8?token=x', '');
        vero(a.videoId === 'https://webtv.esempio.it/live/napoli/playlist.m3u8?token=x' && a.videoUrl === a.videoId, 'servizio: il link HLS si salva com\'e\' (videoId = indirizzo)');
        const b = D.leggiVideo('<iframe src="https://player.webtv.it/embed/1?a=1&amp;b=2"></iframe>', '');
        vero(b.videoId === 'https://player.webtv.it/embed/1?a=1&b=2' && b.videoUrl === b.videoId, 'servizio: del codice da incorporare si salva solo l\'indirizzo del player');
        const c = D.leggiVideo('https://youtu.be/abcdefghijk', 'abcdefghijk');
        vero(c.videoId === 'abcdefghijk' && c.videoUrl === 'https://youtu.be/abcdefghijk', 'servizio: YouTube come prima (videoId = identificativo, videoUrl = il link incollato)');
        const d = D.leggiVideo('https://webtv.esempio.it/live/x.m3u8', 'qualcosa-di-diverso');
        vero(d.videoId === 'https://webtv.esempio.it/live/x.m3u8', 'servizio: con il link, decide il servizio (l\'identificativo mandato dalla pagina non conta)');
        const e = D.leggiVideo('', 'vimeo-123456');
        vero(e.videoId === 'vimeo-123456', 'servizio: senza link, un identificativo di un player futuro (lettere, numeri, -) passa');
        const f = D.leggiVideo('', '');
        vero(f.videoId === '' && f.videoUrl === '', 'servizio: nessun video');
        [['http://webtv.esempio.it/live.m3u8', /https:\/\//], ['rtmp://ingest.webtv.it/live/x', /RTMP/], ['https://webtv.it/m.mpd', /DASH/], ['<script>alert(1)</script>', /Non riconosco/]].forEach(([l, m]) => {
            let motivo = '', stato = 0;
            try { D.leggiVideo(l, ''); } catch (x) { motivo = x.message; stato = x.stato; }
            vero(stato === 400 && m.test(motivo), 'servizio: rifiutato con 400 e il motivo: ' + l + ' («' + motivo + '»)');
        });
    } catch (e) {
        rossi++;
        console.log('ROSSO  prova del servizio interrotta: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e));
    }
    console.log('\n' + verdi + ' verdi, ' + rossi + ' rossi');
    process.exit(rossi ? 1 : 0);
})();
