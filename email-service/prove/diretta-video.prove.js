/* ============================================================
   PROVE - il link del video della diretta (lib/diretta-sorgente-video.js)
   ------------------------------------------------------------
       node prove/diretta-video.prove.js

   Niente da installare. Esce con 1 se qualcosa e' rosso.

   COSA DIMOSTRANO. Che la copia del servizio e' identica a quella del
   sito (diretta/sorgente-video.js); che si riconosce quello che una
   web TV puo' dare (flusso HLS .m3u8 anche con token, flusso DASH .mpd,
   link del player, codice da incorporare con gli &amp;); che si
   rifiutano, con il motivo, http, RTMP/RTSP/SRT, file video e segmenti,
   link con credenziali, javascript:, localhost e testo qualsiasi; che
   non c'e' piu' nessuna traccia della vecchia piattaforma video (il suo
   nome qui si scrive a pezzi, per non comparire nelle ricerche); e che
   il servizio
   (leggiVideo, usata da salvaEvento e cambiaVideo per il link
   principale e per la riserva; campiVideo, che decide cosa va nel
   documento pubblico; eventoJSON, che non mostra mai la chiave della
   firma) fa la cosa giusta.
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
const VECCHIA = new RegExp('you' + 'tu', 'i');
vero(!VECCHIA.test(sito), 'nessuna traccia della vecchia piattaforma video in sorgente-video.js');
const libDiretta = fs.readdirSync(path.resolve(__dirname, '../lib')).filter(f => /^diretta-.*\.js$/.test(f))
    .map(f => path.resolve(__dirname, '../lib', f))
    .concat(fs.readdirSync(path.resolve(__dirname, '../api')).filter(f => /^diretta-.*\.js$/.test(f)).map(f => path.resolve(__dirname, '../api', f)));
const conVecchia = libDiretta.filter(f => VECCHIA.test(fs.readFileSync(f, 'utf8'))).map(f => path.basename(f));
vero(conVecchia.length === 0, 'nessuna traccia della vecchia piattaforma video nelle funzioni e nelle librerie della diretta: ' + conVecchia.join(', '));

/* ---------- quello che si accetta ---------- */
const buoni = [
    ['https://webtv.esempio.it/live/napoli/playlist.m3u8', 'hls', 'https://webtv.esempio.it/live/napoli/playlist.m3u8'],
    ['  https://cdn.webtv.it/hls/evento/index.m3u8?token=abc123&scade=99  ', 'hls', 'https://cdn.webtv.it/hls/evento/index.m3u8?token=abc123&scade=99'],
    ['https://cdn.webtv.it/HLS/EVENTO/MASTER.M3U8', 'hls', 'https://cdn.webtv.it/HLS/EVENTO/MASTER.M3U8'],
    ['https://cdn.webtv.it/hls/evento/index.m3u8#inizio', 'hls', 'https://cdn.webtv.it/hls/evento/index.m3u8'],
    ['https://webtv.esempio.it:8443/live/napoli/playlist.m3u8', 'hls', 'https://webtv.esempio.it:8443/live/napoli/playlist.m3u8'],
    ['https://dash.webtv.it/live/napoli/manifest.mpd', 'dash', 'https://dash.webtv.it/live/napoli/manifest.mpd'],
    ['https://dash.webtv.it/live/napoli/Manifest.MPD?t=1#x', 'dash', 'https://dash.webtv.it/live/napoli/Manifest.MPD?t=1'],
    ['https://player.webtv.it/embed/napoli-2026', 'incorporato', 'https://player.webtv.it/embed/napoli-2026'],
    ['<iframe width="640" height="360" src="https://player.webtv.it/embed/123?autoplay=1&amp;muted=1" frameborder="0" allowfullscreen></iframe>', 'incorporato', 'https://player.webtv.it/embed/123?autoplay=1&muted=1'],
    ["<IFRAME SRC='https://player.webtv.it/e/9'></IFRAME>", 'incorporato', 'https://player.webtv.it/e/9'],
    ['<div style="padding:56% 0 0"><iframe src=https://player.webtv.it/x allow="autoplay"></iframe></div>', 'incorporato', 'https://player.webtv.it/x'],
    ['<iframe src="https://webtv.esempio.it/live/napoli/playlist.m3u8"></iframe>', 'hls', 'https://webtv.esempio.it/live/napoli/playlist.m3u8'],
    // una pagina qualunque e' il ripiego: se si puo' incorporare lo dice la prova del link
    ['https://www.webtv-qualunque.com/canale/diretta', 'incorporato', 'https://www.webtv-qualunque.com/canale/diretta']
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
    ['rtsp://camera.webtv.it/live', 'rtmp', /RTMP/],
    ['srt://ingest.webtv.it:9000', 'rtmp', /RTMP/],
    ['https://cdn.webtv.it/video/replica.mp4', 'file', /file video/],
    ['https://cdn.webtv.it/video/replica.webm', 'file', /file video/],
    ['https://cdn.webtv.it/video/replica.MOV', 'file', /file video/],
    ['https://cdn.webtv.it/video/replica.mkv?x=1', 'file', /file video/],
    ['https://cdn.webtv.it/live/napoli/segmento_000123.ts', 'file', /file video/],
    ['https://cdn.webtv.it/live/napoli/chunk-5.m4s', 'file', /file video/],
    ['https://cdn.webtv.it/archivio/vecchio.flv', 'file', /file video/],
    ['https://utente:segreta@webtv.it/live/playlist.m3u8', 'credenziali', /password/],
    ['javascript:alert(1)', 'formato', /Non riconosco/],
    ['https://webtv.it/a b.m3u8', 'formato', /Non riconosco/],
    ['https://localhost/a.m3u8', 'formato', /Non riconosco/],
    ['https://server-interno/a.m3u8', 'formato', /Non riconosco/],
    ['https://webtv.it/"onload=x', 'formato', /Non riconosco/],
    ['diretta di napoli', 'formato', /Non riconosco/],
    ['abcdefghijk', 'formato', /Non riconosco/],
    ['<iframe width="640"></iframe>', 'codice', /src=/],
    ['https://webtv.it/' + 'a'.repeat(1100), 'lungo', /troppo lungo/]
];
cattivi.forEach(([testo, errore, messaggio]) => {
    const r = V.leggi(testo);
    vero(r && r.errore === errore && messaggio.test(V.messaggio(r)), 'rifiutato (' + errore + '): ' + testo.slice(0, 60) + ' -> ' + JSON.stringify(r) + ' «' + V.messaggio(r) + '»');
});
vero(V.leggi('') === null && V.leggi('   ') === null && V.messaggio(null) === 'Incolla il link della diretta.', 'vuoto: nessun video, e il messaggio chiede di incollare il link');
vero(V.tipoDi('') === '' && V.tipoDi('abcdefghijk') === '' && V.tipoDi('http://x.it/a.m3u8') === '', 'tipoDi: \'\' per quello che non e\' un link valido');

/* ---------- descrizioni e avviso del ripiego ---------- */
vero(/nostro player/.test(V.descrizione('hls')) && /senza loghi/.test(V.descrizione('hls')), 'descrizione HLS: «' + V.descrizione('hls') + '»');
vero(/DASH/.test(V.descrizione('dash')) && /ripiego/.test(V.descrizione('incorporato')) && V.descrizione('altro') === '', 'descrizioni DASH e incorporato, niente per un tipo sconosciuto');
vero(V.AVVISO_INCORPORATO === 'Con questo tipo di link non possiamo togliere il logo della web TV né usare i nostri comandi: chiedete alla web TV il link .m3u8',
    'AVVISO_INCORPORATO come da contratto');
vero(V.messaggio(V.leggi('https://webtv.esempio.it/a.m3u8')) === V.descrizione('hls'), 'messaggio di un link valido: la sua descrizione');
vero(JSON.stringify(V.TIPI) === '["hls","dash","incorporato"]', 'i tipi: hls, dash, incorporato');

/* ---------- il servizio: leggiVideo, campiVideo, eventoJSON ---------- */
const D = require('../lib/diretta-dati');
(async () => {
    try {
        const a = D.leggiVideo('https://webtv.esempio.it/live/napoli/playlist.m3u8?token=x', '');
        vero(a.videoId === 'https://webtv.esempio.it/live/napoli/playlist.m3u8?token=x' && a.videoUrl === a.videoId, 'servizio: il link HLS si salva com\'e\' (videoId = indirizzo)');
        const b = D.leggiVideo('<iframe src="https://player.webtv.it/embed/1?a=1&amp;b=2"></iframe>', '');
        vero(b.videoId === 'https://player.webtv.it/embed/1?a=1&b=2' && b.videoUrl === b.videoId, 'servizio: del codice da incorporare si salva solo l\'indirizzo del player');
        const c = D.leggiVideo('https://dash.webtv.it/live/manifest.mpd', '');
        vero(c.videoId === 'https://dash.webtv.it/live/manifest.mpd', 'servizio: il link DASH si salva');
        const d = D.leggiVideo('https://webtv.esempio.it/live/x.m3u8', 'qualcosa-di-diverso');
        vero(d.videoId === 'https://webtv.esempio.it/live/x.m3u8', 'servizio: con il link, decide il servizio (l\'identificativo mandato dalla pagina non conta)');
        const e = D.leggiVideo('', 'https://webtv.esempio.it/riserva/playlist.m3u8');
        vero(e.videoId === 'https://webtv.esempio.it/riserva/playlist.m3u8', 'servizio: senza link, l\'identificativo si legge con le stesse regole');
        const f = D.leggiVideo('', '');
        vero(f.videoId === '' && f.videoUrl === '', 'servizio: nessun video');
        [
            ['http://webtv.esempio.it/live.m3u8', /https:\/\//], ['rtmp://ingest.webtv.it/live/x', /RTMP/], ['https://webtv.it/replica.mp4', /file video/],
            ['https://cdn.webtv.it/live/seg1.ts', /file video/], ['<script>alert(1)</script>', /Non riconosco/],
            ['https://utente:pw@webtv.it/a.m3u8', /password/], ['https://127.0.0.1/live.m3u8', /interno o privato/],
            ['https://10.1.2.3/live.m3u8', /interno o privato/], ['https://169.254.169.254/latest/meta-data', /interno o privato/],
            ['https://[::1]/live.m3u8', /interno o privato/]
        ].forEach(([l, m]) => {
            let motivo = '', stato = 0;
            try { D.leggiVideo(l, ''); } catch (x) { motivo = x.message; stato = x.stato; }
            vero(stato === 400 && m.test(motivo), 'servizio: rifiutato con 400 e il motivo: ' + l + ' («' + motivo + '»)');
        });
        let vecchioId = '';
        try { D.leggiVideo('', 'vimeo-123456'); } catch (x) { vecchioId = x.message; }
        vero(/Non riconosco/.test(vecchioId), 'servizio: un identificativo che non e\' un link della web TV non si salva piu\'');

        /* campiVideo: cosa va nel documento pubblico */
        const ris = {
            videoId: 'https://webtv.esempio.it/live/napoli/playlist.m3u8', riservaId: 'https://riserva.webtv.it/live/napoli/playlist.m3u8',
            firma: { schema: 'nginx', segreto: 'chiave-segreta-di-prova', durataOre: 6, parametri: {} }
        };
        const inOnda = D.campiVideo({}, ris, 'in_onda');
        vero(inOnda.videoId === ris.videoId && inOnda.videoRiserva === ris.riservaId && inOnda.videoFirmato === true && inOnda.sorgente === undefined,
            'in onda: si pubblicano videoId, videoRiserva e videoFirmato (la sorgente resta quella di prima) ' + JSON.stringify(inOnda));
        const pubblicato = Object.assign({ sorgente: 'riserva' }, inOnda);
        vero(Object.keys(D.campiVideo(pubblicato, ris, 'in_onda')).length === 0, 'in onda e niente di cambiato: nessuna scrittura');
        const fuori = D.campiVideo(pubblicato, ris, 'pausa');
        vero(fuori.videoId === '' && fuori.videoRiserva === '' && fuori.videoFirmato === false && fuori.sorgente === undefined,
            'uscendo dall\'onda si svuotano videoId, videoRiserva, videoFirmato; la sorgente resta ' + JSON.stringify(fuori));
        const senzaRiserva = D.campiVideo(pubblicato, Object.assign({}, ris, { riservaId: '' }), 'in_onda');
        vero(senzaRiserva.videoRiserva === '' && senzaRiserva.sorgente === 'principale', 'tolta la riserva mentre la regia la usava: si torna al principale');
        vero(D.campiVideo({}, { videoId: 'abcdefghijk' }, 'in_onda').videoId === undefined, 'un valore vecchio che il player non sa riprodurre non si pubblica');
        vero(Object.keys(D.campiVideo({}, {}, 'programmato')).length === 0, 'un evento senza video fuori onda: nessuna scrittura');
        vero(D.campiVideo({}, Object.assign({}, ris, { firma: { schema: 'nessuna' } }), 'in_onda').videoFirmato === undefined, 'senza firma videoFirmato resta false');

        /* eventoJSON: i campi nuovi, e MAI la chiave */
        const j = D.eventoJSON('napoli-2026', { titolo: 'Napoli', videoId: ris.videoId, videoRiserva: ris.riservaId, sorgente: 'riserva', videoFirmato: true },
            { videoUrl: ris.videoId, videoId: ris.videoId, riservaUrl: ris.riservaId, riservaId: ris.riservaId, firma: ris.firma });
        vero(j.riservaUrl === ris.riservaId && j.riservaId === ris.riservaId && j.riservaInOnda === ris.riservaId && j.sorgente === 'riserva' && j.videoFirmato === true,
            'eventoJSON: riservaUrl, riservaId, riservaInOnda, sorgente, videoFirmato');
        vero(j.videoTipo === 'hls' && j.riservaTipo === 'hls', 'eventoJSON: il tipo dei due link');
        vero(j.firma && j.firma.schema === 'nginx' && j.firma.durataOre === 6 && j.firma.segretoImpostato === true && !('segreto' in j.firma),
            'eventoJSON: la firma senza la chiave (segretoImpostato: true) ' + JSON.stringify(j.firma));
        vero(JSON.stringify(j).indexOf('chiave-segreta-di-prova') < 0, 'eventoJSON: la chiave segreta non compare da nessuna parte');
        const vuoto = D.eventoJSON('x-2026', { titolo: 'X' }, {});
        vero(vuoto.sorgente === 'principale' && vuoto.videoFirmato === false && vuoto.riservaUrl === '' && vuoto.firma.schema === 'nessuna' && vuoto.firma.segretoImpostato === false,
            'eventoJSON di un evento di prima (senza i campi nuovi): valori predefiniti');
    } catch (e) {
        rossi++;
        console.log('ROSSO  prova del servizio interrotta: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e));
    }
    console.log('\n' + verdi + ' verdi, ' + rossi + ' rossi');
    process.exit(rossi ? 1 : 0);
})();
