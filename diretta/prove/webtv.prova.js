/* ============================================================
   PROVE - le due modalita' del video nella pagina VERA dei partecipanti
   ------------------------------------------------------------
       node diretta/prove/webtv.prova.js

   Da sola avvia (e alla fine ferma) gli emulatori Firebase (firestore
   8380, auth 9380), il servizio VERO e il sito in locale
   (server-locale.js: api 3380, sito 8390) e la diretta di prova.
   Il video della diretta ha due modalita', scelte dalla regia per ogni
   evento («Tipo di player», eventi.tipoPlayer):
     A) il PLAYER DI AZOTO in un iframe (la predefinita): qui il player
        FINTO di flusso-prova.js (instradaAzoto) su
        https://cdn.azotosolutions.com/cloudtv/livetv<N>/player (301
        verso .../player/, come il vero), con il suo pulsante #play-azoto.
        Le prove non usano MAI la rete vera di Azoto;
     B) il FLUSSO DIRETTO nel NOSTRO player:
        - la WEB TV FINTA https://webtv.prova.test (flusso-prova.js): una
          diretta HLS vera trasmessa da ffmpeg (VP9 + Opus, 360p e 180p,
          segmenti da 2 s, finestra di 40 s: niente barra per tornare
          indietro), con /live/ (il link principale), /riserva/ (quello
          di riserva), /spento/ (una diretta non ancora partita); il
          principale si "rompe" a comando (503 su playlist e segmenti);
        - il FLUSSO PUBBLICO DI PROVA di Shaka Player (Google), in HLS e
          in DASH: una diretta vera, sempre in onda, con un'ora di
          finestra per tornare indietro e piu' qualita' (480p, 720p). Il
          browser non esce in rete da solo: le richieste le fa Node
          (inoltraPubblico).
   Serve ffmpeg (quello di sistema, FFMPEG=/percorso, oppure pip
   install imageio-ffmpeg).

   La regia e' quella vera: le azioni dell'API di gestione
   (evento-salva, evento-stato, evento-video, evento-player,
   evento-sorgente) con un gestore dell'emulatore. L'evento si crea
   incollando il CODICE che ha dato Azoto (si salva solo l'indirizzo) e
   il link del flusso; senza «Tipo di player» e' 'azoto'. Il
   partecipante entra con nome utente e password (azione 'entra' vera)
   nella pagina vera (/diretta/, con la sua CSP, player-azoto.js e
   player-webtv.js), su Chromium: computer 1440x900, iPhone 13
   simulato (devices['iPhone 13'], anche a 390x844, 360x740 e in
   orizzontale; senza API di schermo intero, come Safari) e telefono
   390x844 per la modalita' B.

   COSA DIMOSTRA.
   Modalita' A (il player di Azoto):
   - prima dell'accesso nessuna richiesta ad Azoto e l'indirizzo non e'
     nella pagina; dopo l'accesso, in onda, l'iframe del player con
     allow="autoplay; fullscreen; picture-in-picture; encrypted-media",
     allowfullscreen, referrerpolicy="strict-origin-when-cross-origin",
     scrolling="no" e il titolo «Diretta: <titolo dell'evento>»; mai
     azoto-player.js, mai richieste al servizio per il link;
   - sotto il video solo «Schermo intero» e la nota fissa; niente
     comandi del nostro player; i consigli della modalita' A;
   - NESSUN livello sopra l'iframe: centro e angoli del riquadro sono
     l'iframe, e un clic (e un tocco) VERO sul play di Azoto arriva al
     suo player (body[data-premuto="si"] dentro l'iframe);
   - riquadro 16:9 senza bande ne' barre di scorrimento (nemmeno dentro
     il player) a 1440x900, 390x664, 390x844, 360x740 e con l'iPhone in
     orizzontale (750x342);
   - la tastiera: con il fuoco sul riquadro vale solo F;
   - «Schermo intero»: sul computer lo schermo intero vero del riquadro,
     con l'iframe 16:9 piu' grande possibile e il pulsante per uscire
     fuori dall'iframe; sull'iPhone la vista a pagina intera
     orizzontale (riquadro ruotato di 90 gradi), con il pulsante per
     uscire che non copre l'iframe; Esc e il pulsante escono; l'iframe
     non si ricarica;
   - la regia cambia l'indirizzo (livetv29 -> livetv30): iframe nuovo,
     senza ricaricare la pagina, stessa lettura in ascolto;
   - A -> B -> A con evento-player: senza ricaricare la pagina e senza
     aprire o chiudere ascolti su Firestore; in B il nostro <video> con
     i nostri comandi;
   - il player che non risponde: a 15 s (non prima) «La diretta sta
     arrivando, attendi qualche secondo» SOTTO il riquadro, con
     «Ricarica il video», che ricrea SOLO l'iframe (la pagina non si
     ricarica); quando Azoto torna il messaggio sparisce da solo;
   - nessuna violazione della CSP, nessun errore nella pagina ne' in
     console.
   Modalita' B (il flusso diretto, come prima):
   - la diretta HLS della web TV parte da sola nel NOSTRO player, muta,
     con «Attiva l'audio»; «IN DIRETTA» rosso; niente barra per tornare
     indietro quando la web TV non tiene una finestra; qualita'
     Automatica, 360p, 180p (la scelta cambia davvero le righe del
     video);
   - la regia cambia il link durante la diretta: il video riparte dal
     nuovo, senza ricaricare la pagina, con lo stesso <video> e la
     stessa, unica, lettura in ascolto su Firestore;
   - il principale cade (503): al posto del video «Stiamo ricollegando
     la diretta…», nuovi tentativi distanziati, e dopo PIU' di 20
     secondi di guasto il passaggio da solo alla riserva, senza
     ricaricare. La regia poi riporta tutti sul principale, li manda
     sulla riserva e li riporta ancora (evento-sorgente);
   - una diretta che non risponde ancora (404): «Stiamo ricollegando»;
     appena la web TV trasmette, il video parte da solo;
   - un link non valido nel documento dell'evento: la pagina non si
     rompe e dice chiaramente «Video non disponibile», poi torna da
     sola quando il link e' buono;
   - il flusso pubblico HLS di Shaka: la barra per tornare indietro;
     indietro di 2 minuti con la barra -> «Torna in diretta» (e niente
     «IN DIRETTA»), l'etichetta «−2:00»; «Torna in diretta» riporta al
     punto live; dalla pausa idem; la qualita' 480p;
   - il flusso pubblico DASH (dash.js): parte, barra e qualita';
   - il link firmato (firma nginx): la pagina chiede il link al
     servizio (link-video), la firma arriva su playlist e segmenti, e
     la chiave non esce mai;
   - sul telefono: tutto dentro lo schermo (barra, «Live», qualita',
     schermo intero), schermate leggibili;
   - nessuna violazione della CSP, nessun errore nella pagina.
   Screenshot (computer 1440x900, telefono 390x844) in
   risultati/screenshot-webtv/: li raccoglie screenshot-finali.js.
   Esce con 1 se qualcosa e' rosso.
   ============================================================ */
'use strict';
const fs = require('fs');
const net = require('net');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const PORTE = { firestore: 8380, auth: 9380, api: 3380, statico: 8390 };
const PROGETTO = 'demo-ngb-eventi';
const EVENTO = 'webtv-2026';
const SITO = 'http://127.0.0.1:' + PORTE.statico;
const API = 'http://127.0.0.1:' + PORTE.api + '/api';
const GESTORE = 'gestore@prova.it';
const RISULTATI = path.resolve(__dirname, 'risultati');
const FOTO = path.join(RISULTATI, 'screenshot-webtv');
const CARTELLA = path.join(RISULTATI, 'webtv-pagina');
fs.mkdirSync(FOTO, { recursive: true });
fs.readdirSync(FOTO).filter(f => /\.png$/.test(f)).forEach(f => fs.unlinkSync(path.join(FOTO, f)));

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:' + PORTE.firestore;
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:' + PORTE.auth;
const admin = require(path.resolve(__dirname, '../../email-service/node_modules/firebase-admin'));
const { chromium, devices } = require('playwright');
const { preparaContesto } = require('./rete-prove');
const F = require('./flusso-prova');

const LIVE = F.WEBTV + '/live/master.m3u8';
const RISERVA = F.WEBTV + '/riserva/master.m3u8';
const SPENTO = F.WEBTV + '/spento/master.m3u8';
const SEGRETO = 'chiave-segreta-della-web-tv-' + crypto.randomBytes(4).toString('hex');
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
// l'iPhone 13 di Playwright, con la densita' dei pixel delle altre foto del telefono
const IPHONE_13 = Object.assign({}, devices['iPhone 13'], { deviceScaleFactor: 2 });

// il codice che ha dato Azoto, com'e' (virgolette singole, lo script): si salva solo l'indirizzo
const CODICE_AZOTO = '<div class=\'azoto-player-container\'>\n'
    + '<iframe src=\'' + F.PLAYER_AZOTO + '\' frameborder=\'0\' scrolling=\'no\' allowfullscreen></iframe>\n'
    + '</div>\n<script src=\'https://azotosolutions.com/videojs/azoto-player.js\'></script>';
const azotoCanale = n => F.AZOTO + '/cloudtv/livetv' + n + '/player';
const TITOLO = 'Next Generation Business 2026 · Napoli';
const TESTO_LENTO = 'La diretta sta arrivando, attendi qualche secondo';
const NOTA_AZOTO = 'Non senti l\'audio? Premi il pulsante del volume nel player. Il video si blocca? Ricarica la pagina.';
const PERMESSI = 'autoplay; fullscreen; picture-in-picture; encrypted-media';

const pausa = ms => new Promise(r => setTimeout(r, ms));

/* Il browser non esce MAI in rete da solo: quello che serve lo danno le
   regole di rete-prove.js e flusso-prova.js (context.route). Senza proxy
   e senza DNS (tranne 127.0.0.1) qualunque richiesta sfuggita alle regole
   fallisce (mai la rete vera di Azoto); e senza l'isolamento dei siti
   l'iframe di Azoto resta nel processo della pagina, cosi' il rimando 301
   del suo player (.../player -> .../player/) passa sempre dalle regole
   (con l'iframe in un processo a parte, a volte la richiesta rimandata
   sfuggiva alle regole e andava verso la rete vera). */
const LANCIO = {
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--disable-site-isolation-trials', '--disable-features=IsolateOrigins,site-per-process',
        '--no-proxy-server', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost']
};

/* ---------- esito ---------- */
let verdi = 0, rossi = 0;
const rossiElenco = [];
async function prova(descrizione, fn) {
    try {
        await fn();
        verdi++;
        console.log('  ok  ' + descrizione);
    } catch (e) {
        rossi++;
        rossiElenco.push(descrizione);
        console.log('ROSSO ' + descrizione + '\n       ' + String((e && e.message) || e).split('\n').slice(0, 4).join('\n       '));
    }
}
function vero(cond, messaggio) { if (!cond) throw new Error(messaggio || 'condizione falsa'); }
async function aspetta(fn, ms, cosa) {
    const t0 = Date.now();
    for (;;) {
        let v;
        try { v = await fn(); } catch (e) { v = null; }
        if (v) return v;
        if (Date.now() - t0 > ms) throw new Error('tempo scaduto (' + ms + ' ms): ' + cosa);
        await pausa(150);
    }
}

/* ---------- processi di appoggio ---------- */
const figli = [];
function portaOccupata(porta) {
    return new Promise(r => {
        const s = net.connect({ host: '127.0.0.1', port: porta });
        s.once('connect', () => { s.destroy(); r(true); });
        s.once('error', () => r(false));
    });
}
function avvia(nome, argomenti, rigaPronto, tempoMax, env) {
    return new Promise((risolvi, rifiuta) => {
        const f = spawn(process.execPath, argomenti, {
            cwd: __dirname, stdio: ['ignore', 'pipe', 'pipe'],
            env: Object.assign({}, process.env, { FORCE_COLOR: '0' }, env || {})
        });
        figli.push(f);
        let uscita = '';
        const timer = setTimeout(() => rifiuta(new Error(nome + ' non parte:\n' + uscita.slice(-1500))), tempoMax);
        const leggi = d => {
            uscita += d.toString();
            if (uscita.indexOf(rigaPronto) >= 0) { clearTimeout(timer); risolvi(f); }
        };
        f.stdout.on('data', leggi);
        f.stderr.on('data', leggi);
        f.on('exit', c => { clearTimeout(timer); rifiuta(new Error(nome + ' uscito (' + c + '):\n' + uscita.slice(-1500))); });
    });
}

/* ---------- il servizio ---------- */
async function chiama(funzione, corpo, token) {
    const r = await fetch(API + '/' + funzione, {
        method: 'POST',
        headers: Object.assign({ 'content-type': 'application/json', origin: SITO }, token ? { authorization: 'Bearer ' + token } : {}),
        body: JSON.stringify(corpo)
    });
    const dati = await r.json().catch(() => ({}));
    if (!r.ok || dati.ok === false) throw new Error(funzione + ' ' + (corpo.azione || '') + ' -> ' + r.status + ' ' + JSON.stringify(dati).slice(0, 300));
    return dati;
}

/* ---------- la pagina, vista dalla prova ---------- */
// il <video> e il riquadro: che cosa si vede adesso
const statoVideo = page => page.evaluate(() => {
    const v = document.querySelector('#video-player video');
    const a = document.getElementById('area-video');
    const sv = document.getElementById('schermo-video');
    return {
        presente: !!v,
        t: v ? v.currentTime : 0,
        fermo: v ? v.paused : true,
        muto: v ? v.muted : true,
        h: v ? v.videoHeight : 0,
        visibile: v ? getComputedStyle(v).visibility === 'visible' : false,
        bordo: v && v.seekable.length ? v.seekable.end(v.seekable.length - 1) : 0,
        schermata: a ? a.getAttribute('data-schermata') : '',
        tipo: sv && !sv.hidden ? sv.getAttribute('data-tipo') : '',
        iframe: !!document.querySelector('#video-player iframe')
    };
});
// il video scorre: visibile, in riproduzione, il tempo avanza e nessuna nostra schermata davanti
async function videoVa(page, ms, cosa) {
    return aspetta(async () => {
        const a = await statoVideo(page);
        if (!a.presente || a.fermo || !a.visibile || a.schermata !== 'video') return null;
        await pausa(1200);
        const b = await statoVideo(page);
        return !b.fermo && b.visibile && b.schermata === 'video' && b.t > a.t + 0.4 ? b : null;
    }, ms, cosa);
}
const visibile = (page, sel) => page.locator(sel).isVisible();

/* ---------- la modalita' A (il player di Azoto) vista dalla prova ---------- */
// l'iframe del player di Azoto e la pagina intorno
const statoAzoto = page => page.evaluate(() => {
    const tutti = document.querySelectorAll('#video-player iframe');
    const f = tutti[0];
    const h = document.documentElement.classList;
    return {
        quanti: tutti.length,
        src: f ? f.getAttribute('src') : '',
        classe: f ? f.className : '',
        allow: f ? f.getAttribute('allow') : '',
        allowfullscreen: f ? f.hasAttribute('allowfullscreen') : false,
        referrerpolicy: f ? f.getAttribute('referrerpolicy') : '',
        scrolling: f ? f.getAttribute('scrolling') : '',
        titolo: f ? f.getAttribute('title') : '',
        nelRiquadro: !!(f && document.getElementById('riquadro-video').contains(f)),
        video: document.querySelectorAll('#video-player video').length,
        modo: h.contains('modo-azoto') ? 'azoto' : (h.contains('modo-flusso') ? 'flusso' : ''),
        schermata: document.getElementById('area-video').getAttribute('data-schermata'),
        schermo: !document.getElementById('schermo-video').hidden,
        lento: !document.getElementById('avviso-lento').hidden
    };
});
// il canale scritto dal player di Azoto finto dentro l'iframe ('' se la pagina non e' arrivata)
async function canaleAzoto(page) {
    const h = await page.$('#video-player iframe');
    const fr = h && await h.contentFrame();
    if (!fr) return '';
    try { return String(await fr.textContent('#canale-azoto', { timeout: 500 }) || '').trim(); } catch (e) { return ''; }
}
async function frameAzoto(page) {
    const h = await page.$('#video-player iframe');
    return h ? h.contentFrame() : null;
}
// l'iframe c'e', con gli attributi giusti, e dentro c'e' il player di quel canale
async function iframeAzotoGiusto(page, canale, cosa) {
    await aspetta(async () => (await canaleAzoto(page)) === canale, 15000, cosa + ': il player di Azoto ' + canale + ' nell\'iframe');
    const s = await statoAzoto(page);
    vero(s.quanti === 1 && s.nelRiquadro, cosa + ': iframe ' + s.quanti + ', nel riquadro ' + s.nelRiquadro);
    vero(s.src === F.AZOTO + '/cloudtv/' + canale + '/player', cosa + ': src ' + s.src);
    vero(s.classe === 'player-azoto', cosa + ': classe «' + s.classe + '»');
    vero(s.allow === PERMESSI && s.allowfullscreen, cosa + ': allow «' + s.allow + '», allowfullscreen ' + s.allowfullscreen);
    vero(s.referrerpolicy === 'strict-origin-when-cross-origin', cosa + ': referrerpolicy «' + s.referrerpolicy + '»');
    vero(s.scrolling === 'no', cosa + ': scrolling «' + s.scrolling + '»');
    vero(s.titolo === 'Diretta: ' + TITOLO, cosa + ': titolo «' + s.titolo + '»');
    vero(s.video === 0 && s.modo === 'azoto', cosa + ': <video> ' + s.video + ', modo ' + s.modo);
    vero(s.schermata === 'video' && !s.schermo && !s.lento, cosa + ': schermata ' + s.schermata + ', nostra schermata ' + s.schermo + ', avviso ' + s.lento);
    return s;
}
// niente sopra l'iframe: il centro e gli angoli (dentro di poco) sono l'iframe stesso
const sopraIframe = page => page.evaluate(() => {
    const f = document.querySelector('#video-player iframe');
    const b = f.getBoundingClientRect();
    const punti = [[0.5, 0.5], [0.03, 0.03], [0.97, 0.03], [0.03, 0.97], [0.97, 0.97], [0.5, 0.95]];
    return punti.map(([px, py]) => {
        const x = b.left + b.width * px, y = b.top + b.height * py;
        const e = document.elementFromPoint(x, y);
        return e === f ? '' : (e ? e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className ? '.' + String(e.className).trim().replace(/\s+/g, '.') : '') : 'niente') + ' a ' + Math.round(x) + ',' + Math.round(y);
    }).filter(Boolean);
});
/* Un clic (o un tocco) VERO, alle coordinate dello schermo, sul pulsante
   play del player di Azoto dentro l'iframe: se qualcosa di nostro stesse
   sopra, il clic arriverebbe a quello e non ad Azoto. */
async function premiPlayAzoto(page, tocco) {
    const h = await page.$('#video-player iframe');
    const fr = await h.contentFrame();
    await fr.evaluate(() => document.body.removeAttribute('data-premuto'));
    const fb = await h.boundingBox();
    const bb = await fr.evaluate(() => { const b = document.getElementById('play-azoto').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
    const x = fb.x + bb.x, y = fb.y + bb.y;
    const sopra = await page.evaluate(([px, py]) => {
        const e = document.elementFromPoint(px, py);
        return e && e.matches('#video-player iframe') ? '' : (e ? e.outerHTML.slice(0, 100) : 'niente');
    }, [x, y]);
    vero(!sopra, 'sopra il play di Azoto c\'e\': ' + sopra);
    if (tocco) await page.touchscreen.tap(x, y);
    else await page.mouse.click(x, y);
    await aspetta(() => fr.evaluate(() => document.body.getAttribute('data-premuto') === 'si'), 5000, 'il clic arrivato al play di Azoto');
}
const premutoDentro = async page => {
    const fr = await frameAzoto(page);
    return fr ? fr.evaluate(() => document.body.getAttribute('data-premuto') === 'si').catch(() => false) : false;
};
// il riquadro dell'iframe: 16:9, senza bande, senza barre di scorrimento (nemmeno dentro il player)
async function controlla16x9(page, cosa) {
    const m = await page.evaluate(() => {
        const r = el => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; };
        const f = document.querySelector('#video-player iframe');
        return {
            iframe: r(f), area: r(document.getElementById('area-video')),
            largoPagina: document.documentElement.scrollWidth, finestra: window.innerWidth, scrolling: f.getAttribute('scrolling')
        };
    });
    const fr = await frameAzoto(page);
    const dentro = await fr.evaluate(() => ({
        w: window.innerWidth, h: window.innerHeight,
        sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight,
        cw: document.documentElement.clientWidth, ch: document.documentElement.clientHeight
    }));
    const f = m.iframe, a = m.area;
    vero(Math.abs(f.w / f.h - 16 / 9) < 0.01, cosa + ': l\'iframe non e\' 16:9 (' + f.w.toFixed(1) + 'x' + f.h.toFixed(1) + ')');
    vero(Math.abs(f.x - a.x) < 1 && Math.abs(f.y - a.y) < 1 && Math.abs(f.w - a.w) < 1 && Math.abs(f.h - a.h) < 1, cosa + ': bande intorno all\'iframe ' + JSON.stringify({ iframe: f, riquadro: a }));
    vero(f.x >= -0.5 && f.x + f.w <= m.finestra + 0.5, cosa + ': l\'iframe esce dallo schermo ' + JSON.stringify(f));
    vero(m.largoPagina <= m.finestra, cosa + ': la pagina scorre di lato (' + m.largoPagina + ' px su ' + m.finestra + ')');
    vero(m.scrolling === 'no', cosa + ': scrolling «' + m.scrolling + '»');
    vero(dentro.sw <= dentro.cw && dentro.sh <= dentro.ch, cosa + ': barre di scorrimento dentro il player ' + JSON.stringify(dentro));
    vero(Math.abs(dentro.w / dentro.h - 16 / 9) < 0.02, cosa + ': il player di Azoto non ha uno spazio 16:9 ' + JSON.stringify(dentro));
    return Object.assign(m, { dentro });
}
const siToccano = (a, b) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
// lo schermo intero in modalita' A: il riquadro, l'iframe, il pulsante per uscire
const misuraIntero = page => page.evaluate(() => {
    const r = el => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; };
    const q = document.getElementById('riquadro-video');
    const f = document.querySelector('#video-player iframe');
    const b = document.getElementById('btn-schermo-intero');
    const cf = f.getBoundingClientRect();
    const centro = document.elementFromPoint(cf.left + cf.width / 2, cf.top + cf.height / 2);
    return {
        vero: document.fullscreenElement === q, finto: document.documentElement.classList.contains('schermo-intero-finto'),
        intero: q.getAttribute('data-intero'), trasformazione: getComputedStyle(q).transform,
        riquadro: r(q), riquadroLocale: { w: q.offsetWidth, h: q.offsetHeight },
        iframe: r(f), iframeLocale: { w: f.offsetWidth, h: f.offsetHeight },
        pulsante: r(b), etichetta: b.getAttribute('aria-label'), testo: document.getElementById('btn-schermo-intero-testo').textContent,
        centroIframe: centro === f, finestra: { w: window.innerWidth, h: window.innerHeight },
        nota: getComputedStyle(document.getElementById('nota-azoto')).display !== 'none'
    };
});
function nelloSchermo(b, finestra) {
    return b.x >= -0.5 && b.y >= -0.5 && b.x + b.w <= finestra.w + 0.5 && b.y + b.h <= finestra.h + 0.5;
}
/* Il player di Azoto che non risponde E che poi torna. Con controllo.fermo
   di flusso-prova.js le richieste restano appese per sempre; questa
   regola (registrata DOPO instradaAzoto: vince lei) le tiene da parte
   mentre controllo.fermo e' vero, e rilascia() le passa al player finto,
   che con fermo tornato falso risponde: e' "Azoto che torna". */
async function trattieniAzoto(context, controllo) {
    const appese = [];
    await context.route(/^https:\/\/cdn\.azotosolutions\.com\//, route => {
        if (controllo.fermo) { appese.push(route); return undefined; }
        return route.fallback();
    });
    return {
        appese: () => appese.length,
        rilascia() { const r = appese.splice(0); r.forEach(x => x.fallback().catch(() => {})); return r.length; }
    };
}
// tempi misurati DENTRO la pagina: quando nasce l'iframe di quel canale e quando compare l'avviso dei 15 s
const segnaTempiLento = (page, canale) => page.evaluate(c => {
    const t = window.__tempiLento = { iframe: 0, avviso: 0 };
    const vp = document.getElementById('video-player');
    new MutationObserver(() => {
        const f = vp.querySelector('iframe');
        if (f && !t.iframe && f.getAttribute('src').indexOf('/' + c + '/') > 0) t.iframe = performance.now();
    }).observe(vp, { childList: true });
    const av = document.getElementById('avviso-lento');
    new MutationObserver(() => { if (!av.hidden && !t.avviso) t.avviso = performance.now(); }).observe(av, { attributes: true, attributeFilter: ['hidden'] });
}, canale);

/* Le richieste alla web TV finta e al flusso pubblico, con l'ora:
   registroWebTv(page) -> [{ t, percorso, query }] (per il flusso pubblico
   il percorso comincia con /shaka-live-assets/) */
const PUBBLICO = new URL(F.FLUSSO_PUBBLICO_HLS).origin;
function registroWebTv(page) {
    const r = [];
    page.on('request', q => {
        const u = q.url();
        if (u.indexOf(F.WEBTV + '/') !== 0 && u.indexOf(PUBBLICO + '/') !== 0) return;
        const x = new URL(u);
        r.push({ t: Date.now(), percorso: x.pathname, query: x.search });
    });
    return r;
}
/* Gli ascolti su Firestore aperti e chiusi (addTarget/removeTarget nel
   canale Listen dell'SDK): la pagina ne tiene UNO, sull'evento. */
function contaAscolti(page) {
    const c = { aperti: 0, chiusi: 0 };
    page.on('request', q => {
        if (!/google\.firestore\.v1\.Firestore\/Listen\//.test(q.url())) return;
        let d = q.postData() || '';
        try { d = decodeURIComponent(d.replace(/\+/g, ' ')); } catch (e) { /* resta com'e' */ }
        c.aperti += (d.match(/"addTarget"/g) || []).length;
        c.chiusi += (d.match(/"removeTarget"/g) || []).length;
    });
    return c;
}

(async () => {
    let browser = null;
    let trasmissione = null;
    try {
        /* ---------- 0. la diretta di prova, emulatori, servizio ---------- */
        for (const p of Object.values(PORTE)) vero(!(await portaOccupata(p)), 'porta ' + p + ' gia\' occupata: chiudi le prove rimaste accese');
        console.log('Avvio della diretta di prova (ffmpeg), degli emulatori e del server locale...');
        const inTrasmissione = F.avviaTrasmissione(CARTELLA);
        await avvia('emulatori', ['avvia-emulatori.js', '--firestore', String(PORTE.firestore), '--auth', String(PORTE.auth)], 'EMULATORI PRONTI', 150000);
        await avvia('server locale', ['server-locale.js', '--api', String(PORTE.api), '--statico', String(PORTE.statico),
            '--firestore', String(PORTE.firestore), '--auth', String(PORTE.auth)], 'SERVER LOCALE PRONTO', 30000,
        { DIRETTA_POSTA_FINTA: path.join(RISULTATI, 'posta-webtv.jsonl'), DIRETTA_ADMIN_EMAILS: GESTORE });
        trasmissione = await inTrasmissione;
        const app = admin.initializeApp({ projectId: PROGETTO }, 'webtv');
        const db = app.firestore();
        const T = admin.firestore.Timestamp;

        // il gestore (la regia) e il suo token
        const PASSWORD = 'Prova' + crypto.randomBytes(5).toString('hex') + '7';
        const g0 = await app.auth().createUser({ email: GESTORE, emailVerified: true, password: PASSWORD });
        await app.auth().setCustomUserClaims(g0.uid, { gestore: true });
        const accesso = await (await fetch('http://127.0.0.1:' + PORTE.auth + '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=finta', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: GESTORE, password: PASSWORD, returnSecureToken: true })
        })).json();
        vero(accesso.idToken, 'accesso del gestore non riuscito');
        const g = corpo => chiama('diretta-gestione', corpo, accesso.idToken);
        // l'evento: il codice di Azoto incollato com'e' e il flusso diretto (principale e riserva); «Tipo di player» non scelto
        const EVENTO_DATI = {
            id: EVENTO, titolo: TITOLO, luogo: 'Napoli · Hotel Eurostars Excelsior',
            data: '2026-10-02', oraInizio: '09:00', oraFine: '17:30', azotoUrl: CODICE_AZOTO, videoUrl: LIVE, riservaUrl: RISERVA,
            programma: '09.00 Accoglienza e registrazione\n09.30 Apertura dei lavori\n13.00 Pausa pranzo\n17.30 Chiusura',
            paginaEvento: '/napoli_ottobre_2026/', unSoloDispositivo: false, promemoria: { giornoPrima: false, oraPrima: false }
        };
        const creato = await g({ azione: 'evento-salva', evento: Object.assign({ nuovo: true }, EVENTO_DATI) });
        vero(creato.evento.tipoPlayer === 'azoto' && creato.evento.azotoUrl === F.PLAYER_AZOTO, 'evento creato: ' + JSON.stringify({ tipo: creato.evento.tipoPlayer, azoto: creato.evento.azotoUrl }));
        const creati = await g({ azione: 'crea', idEvento: EVENTO, righe: [{ riga: 2, nome: 'Luca', cognome: 'Bianchi', email: 'luca.bianchi@esempio.it', azienda: 'Bianchi srl', nomeUtente: 'lucabianchi' }] });
        const persona = creati.risultati[0];
        await app.auth().updateUser(persona.uid, { password: PASSWORD });
        await g({ azione: 'evento-stato', idEvento: EVENTO, stato: 'in_onda' });
        // la regia cambia il video (e la riserva: '' la toglie, assente resta com'e')
        const cambiaVideo = (videoUrl, riservaUrl) => g(Object.assign({ azione: 'evento-video', idEvento: EVENTO, videoUrl }, riservaUrl !== undefined ? { riservaUrl } : {}));
        const cambiaAzoto = azotoUrl => g({ azione: 'evento-video', idEvento: EVENTO, azotoUrl });
        const passaA = tipoPlayer => g({ azione: 'evento-player', idEvento: EVENTO, tipoPlayer });
        const pubblico = async () => (await db.doc('eventi/' + EVENTO).get()).data();

        /* ---------- il browser ---------- */
        browser = await chromium.launch(LANCIO);
        async function contesto(opzioni, senzaSchermoIntero) {
            const context = await browser.newContext(Object.assign({ locale: 'it-IT', timezoneId: 'Europe/Rome' }, opzioni));
            await preparaContesto(context, {});
            // registrate dopo preparaContesto: vincono loro
            const webtv = await F.instradaWebTv(context, CARTELLA);
            const pubblicoInoltrato = await F.inoltraPubblico(context);
            // il player di Azoto finto (mai la rete vera) e, sopra, la regola per fermarlo e farlo tornare
            const azoto = await F.instradaAzoto(context);
            const trattieni = await trattieniAzoto(context, azoto);
            // l'ora per dash.js (mai dalla cache delle prove)
            await context.route(/^https:\/\/time\.akamai\.com\//, r => r.fulfill({ status: 200, headers: { 'content-type': 'text/plain', 'access-control-allow-origin': '*' }, body: new Date().toISOString() }));
            await context.addInitScript(porte => {
                window.NGB_DIRETTA_PROVE = porte;
                if (window.top === window) {
                    window.__violazioniCsp = [];
                    document.addEventListener('securitypolicyviolation', e => window.__violazioniCsp.push(e.violatedDirective + ' ' + e.blockedURI));
                }
            }, { firestore: PORTE.firestore, auth: PORTE.auth, api: API, ritardoPresenzaMs: 999999 });
            if (senzaSchermoIntero) {
                // come Safari su iPhone: nessun elemento qualsiasi va a schermo intero
                await context.addInitScript(() => {
                    const via = (o, k) => { try { Object.defineProperty(o, k, { value: undefined, configurable: true, writable: true }); } catch (e) { /* niente */ } };
                    via(Element.prototype, 'requestFullscreen');
                    via(Element.prototype, 'webkitRequestFullscreen');
                    try { Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => false, configurable: true }); } catch (e) { /* niente */ }
                    try { Object.defineProperty(Document.prototype, 'webkitFullscreenEnabled', { get: () => false, configurable: true }); } catch (e) { /* niente */ }
                });
            }
            const page = await context.newPage();
            page.__errori = [];
            page.on('pageerror', e => page.__errori.push(String(e && e.message || e)));
            // gli errori in console (di tutte le cornici, anche quella di Azoto)
            page.__console = [];
            page.on('console', m => { if (m.type() === 'error') page.__console.push(m.text()); });
            // ogni richiesta verso azotosolutions.com, e i caricamenti della pagina (una ricarica li conta)
            const richiesteAzoto = [];
            page.on('request', q => { if (/^https:\/\/([a-z0-9-]+\.)*azotosolutions\.com[:/]/.test(q.url())) richiesteAzoto.push(q.url()); });
            // le richieste ad Azoto non riuscite (non quelle interrotte perche' l'iframe e' stato tolto)
            const falliteAzoto = [];
            page.on('requestfailed', q => {
                const e = String((q.failure() || {}).errorText || '');
                if (/azotosolutions\.com/.test(q.url()) && !/ERR_ABORTED/.test(e)) falliteAzoto.push(q.url() + ' ' + e);
            });
            const navigazioni = { n: 0 };
            page.on('framenavigated', f => { if (f === page.mainFrame()) navigazioni.n++; });
            const richieste = registroWebTv(page);
            const ascolti = contaAscolti(page);
            const chiamate = [];
            page.on('request', q => {
                if (q.url().indexOf(API + '/') !== 0 || q.method() !== 'POST') return;
                let c = {};
                try { c = JSON.parse(q.postData() || '{}'); } catch (e) { c = {}; }
                chiamate.push({ t: Date.now(), azione: c.azione, sorgente: c.sorgente });
            });
            return { context, page, webtv, pubblicoInoltrato, azoto, trattieni, richiesteAzoto, falliteAzoto, navigazioni, richieste, ascolti, chiamate };
        }
        async function apri(page) {
            await page.goto(SITO + '/diretta/?emulatori=1');
            await page.waitForSelector('body[data-vista="accesso"]', { timeout: 30000 });
        }
        async function accedi(page) {
            await page.fill('#campo-nome-utente', 'lucabianchi');
            await page.fill('#campo-password', PASSWORD);
            await page.click('#btn-entra');
            await page.waitForSelector('body[data-vista="diretta"]', { timeout: 30000 });
        }
        async function entra(page) {
            await apri(page);
            await accedi(page);
        }
        const foto = (page, nome) => page.screenshot({ path: path.join(FOTO, nome + '.png') });
        // dopo quando (ms) la pagina ha chiesto alla web TV un file di quel percorso?
        const primaDa = (richieste, re, da) => richieste.find(r => r.t >= da && re.test(r.percorso));
        // la pagina si e' ricaricata? (una variabile globale messa prima, i caricamenti della pagina)
        const segnaPagina = (c, segno) => c.page.evaluate(s => { window.__segnoPagina = s; document.getElementById('riquadro-video').dataset.segno = s; }, segno).then(() => c.navigazioni.n);
        async function nonRicaricata(c, segno, navigazioniPrima, cosa) {
            const s = await c.page.evaluate(() => [window.__segnoPagina, document.getElementById('riquadro-video').dataset.segno]);
            vero(s[0] === segno && s[1] === segno && c.navigazioni.n === navigazioniPrima, cosa + ': la pagina si e\' ricaricata (' + JSON.stringify({ segni: s, caricamenti: c.navigazioni.n - navigazioniPrima }) + ')');
        }

        /* =================== MODALITA' A: IL PLAYER DI AZOTO =================== */
        console.log('\nModalità A (il player di Azoto finto): computer 1440x900 e iPhone 13 (senza API di schermo intero)');
        const pc = await contesto({ viewport: { width: 1440, height: 900 } });
        const ip = await contesto(IPHONE_13, true);
        const p = pc.page;
        const i = ip.page;

        await prova('prima dell\'accesso nessuna richiesta ad Azoto e l\'indirizzo non è nella pagina; dopo l\'accesso l\'iframe del player con gli attributi e il titolo giusti', async () => {
            for (const [c, nome] of [[pc, 'computer'], [ip, 'iPhone']]) {
                await apri(c.page);
                await pausa(1500);
                vero(!c.richiesteAzoto.length && !c.azoto.richieste.length, nome + ': richieste ad Azoto prima dell\'accesso: ' + c.richiesteAzoto.join(', '));
                const html = await c.page.content();
                vero(html.indexOf('/cloudtv/') < 0 && !(await c.page.locator('#video-player iframe').count()), nome + ': l\'indirizzo del player o l\'iframe nella pagina prima dell\'accesso');
                await accedi(c.page);
                await iframeAzotoGiusto(c.page, 'livetv29', nome);
                // solo la pagina del player (e il 301 verso .../player/); mai azoto-player.js ne' altro di Azoto
                vero(c.richiesteAzoto.length >= 1 && c.richiesteAzoto.every(u => /^https:\/\/cdn\.azotosolutions\.com\/cloudtv\/livetv29\/player\/?$/.test(u)),
                    nome + ': richieste ad Azoto: ' + c.richiesteAzoto.join(', '));
                vero(!c.chiamate.some(x => x.azione === 'link-video'), nome + ': in modalità A la pagina ha chiesto il link del flusso al servizio');
                vero((await c.page.textContent('#stato-evento')).trim() === 'IN DIRETTA', nome + ': bollino «' + (await c.page.textContent('#stato-evento')).trim() + '»');
            }
            const pb = await pubblico();
            vero(pb.tipoPlayer === 'azoto' && pb.videoId === F.PLAYER_AZOTO && !pb.videoRiserva, 'documento pubblico: ' + JSON.stringify({ t: pb.tipoPlayer, v: pb.videoId, r: pb.videoRiserva }));
            vero(pc.ascolti.aperti >= 1, 'la prova non vede l\'ascolto su Firestore (canale Listen): ' + JSON.stringify(pc.ascolti));
        });

        await prova('sotto il video solo la nostra grafica: «Schermo intero» e la nota fissa; niente comandi del nostro player; i consigli della modalità A', async () => {
            vero(await visibile(p, '#btn-schermo-intero') && (await p.textContent('#btn-schermo-intero-testo')).trim() === 'Schermo intero', '«Schermo intero» con la scritta');
            vero(await visibile(p, '#nota-azoto') && (await p.textContent('#nota-azoto')).trim() === NOTA_AZOTO, 'nota: «' + (await p.textContent('#nota-azoto')).trim() + '»');
            for (const sel of ['#btn-play', '#btn-muto', '#volume', '#btn-attiva-audio', '#indicatore-live', '#btn-live', '#sel-qualita', '#barra-dvr', '#riga-comandi-aiuto', '#avviso-lento', '#schermo-video', '#schermo-pausa']) {
                vero(!(await visibile(p, sel)), sel + ' si vede in modalità A');
            }
            // la nota e il pulsante stanno SOTTO il video, non sopra
            const v = await p.locator('#area-video').boundingBox();
            for (const sel of ['#nota-azoto', '#btn-schermo-intero']) {
                const b = await p.locator(sel).boundingBox();
                vero(b.y >= v.y + v.height - 0.5, sel + ' non sta sotto il video');
            }
            const consigli = await p.evaluate(() => Array.from(document.querySelectorAll('#vista-diretta li[data-solo]')).map(li => li.getAttribute('data-solo') + ':' + (li.offsetParent !== null)));
            vero(consigli.filter(x => /^azoto:/.test(x)).every(x => /true$/.test(x)) && consigli.filter(x => /^flusso:/.test(x)).every(x => /false$/.test(x)) && consigli.some(x => /^azoto/.test(x)),
                'consigli: ' + consigli.join(', '));
            vero(/Luca Bianchi/.test(await p.textContent('#nome-persona')) && await visibile(p, '#btn-esci') && (await p.textContent('#titolo-evento')).trim() === TITOLO, 'testata: nome, «Esci» o titolo');
            vero(/F schermo intero/.test(await p.textContent('#aiuto-scorciatoie')) && !/Spazio/.test(await p.textContent('#aiuto-scorciatoie')), 'aiuto per la tastiera: ' + await p.textContent('#aiuto-scorciatoie'));
        });

        await prova('nessun livello sopra l\'iframe: centro e angoli del riquadro sono l\'iframe, e un clic (e un tocco) vero sul play di Azoto arriva al suo player', async () => {
            for (const [c, nome, tocco] of [[pc, 'computer', false], [ip, 'iPhone', true]]) {
                const sopra = await sopraIframe(c.page);
                vero(!sopra.length, nome + ': sopra l\'iframe: ' + sopra.join(' | '));
                await premiPlayAzoto(c.page, tocco);
            }
        });

        await prova('riquadro 16:9 senza bande né barre di scorrimento: 1440x900, iPhone 13 (390x664), 390x844, 360x740 e iPhone in orizzontale (750x342)', async () => {
            await controlla16x9(p, '1440x900');
            await p.evaluate(() => document.fonts && document.fonts.ready);
            await foto(p, 'azoto-computer');
            await controlla16x9(i, '390x664');
            for (const [w, h] of [[390, 844], [360, 740], [devices['iPhone 13 landscape'].viewport.width, devices['iPhone 13 landscape'].viewport.height]]) {
                await i.setViewportSize({ width: w, height: h });
                await pausa(400);
                await controlla16x9(i, w + 'x' + h);
                if (w === 390) {
                    await i.evaluate(() => document.fonts && document.fonts.ready);
                    await foto(i, 'azoto-telefono');
                }
            }
            await i.setViewportSize(IPHONE_13.viewport);
            await pausa(300);
        });

        await prova('tastiera in modalità A, con il fuoco sul riquadro: vale solo F; spazio, M e frecce restano alla pagina (e al player di Azoto)', async () => {
            await p.evaluate(() => {
                window.__tasti = [];
                window.addEventListener('keydown', e => window.__tasti.push(e.key + ':' + (e.defaultPrevented ? 'preso' : 'libero')));
            });
            await p.focus('#riquadro-video');
            for (const k of ['Space', 'm', 'ArrowUp', 'ArrowDown']) await p.keyboard.press(k);
            vero(await p.getAttribute('#riquadro-video', 'data-intero') === '0', 'un tasto diverso da F ha cambiato lo schermo intero');
            await p.focus('#riquadro-video');
            await p.keyboard.press('f');
            await p.waitForSelector('#riquadro-video[data-intero="1"]', { timeout: 5000 });
            await p.keyboard.press('f');
            await p.waitForSelector('#riquadro-video[data-intero="0"]', { timeout: 5000 });
            const tasti = await p.evaluate(() => window.__tasti);
            vero(tasti.join(',') === ' :libero,m:libero,ArrowUp:libero,ArrowDown:libero,f:preso,f:preso', 'tasti: ' + tasti.join(', '));
            await p.evaluate(() => window.scrollTo(0, 0));
            vero(p.__errori.length === 0, 'errori: ' + p.__errori.join(' | '));
        });

        await prova('«Schermo intero» sul computer: il riquadro va davvero a schermo intero, iframe 16:9 più grande possibile e il pulsante per uscire fuori dall\'iframe', async () => {
            await p.click('#btn-schermo-intero');
            await p.waitForFunction(() => document.fullscreenElement === document.getElementById('riquadro-video'), null, { timeout: 5000 });
            await pausa(300);
            const m = await misuraIntero(p);
            vero(m.vero && m.intero === '1', 'schermo intero: ' + JSON.stringify({ vero: m.vero, intero: m.intero }));
            vero(Math.abs(m.riquadro.w - m.finestra.w) < 1 && Math.abs(m.riquadro.h - m.finestra.h) < 1, 'riquadro ' + JSON.stringify(m.riquadro));
            vero(Math.abs(m.iframe.w / m.iframe.h - 16 / 9) < 0.01, 'iframe non 16:9: ' + JSON.stringify(m.iframe));
            // il 16:9 piu' grande che lascia 64 px per il pulsante (qui, 1440x900, e' largo quanto lo schermo)
            const massimo = Math.max(Math.min(m.finestra.w - 128, m.finestra.h * 16 / 9), Math.min(m.finestra.h - 64, m.finestra.w * 9 / 16) * 16 / 9);
            vero(m.iframe.w >= massimo - 2, 'iframe piccolo: ' + m.iframe.w.toFixed(0) + ' px invece di ' + massimo.toFixed(0));
            vero(!siToccano(m.pulsante, m.iframe) && nelloSchermo(m.pulsante, m.finestra), 'il pulsante per uscire copre l\'iframe o esce dallo schermo ' + JSON.stringify({ p: m.pulsante, f: m.iframe }));
            vero(m.pulsante.w >= 48 && m.pulsante.h >= 48 && m.etichetta === 'Esci dallo schermo intero', 'pulsante: ' + JSON.stringify({ p: m.pulsante, e: m.etichetta }));
            vero(m.centroIframe && !m.nota, 'qualcosa sopra l\'iframe, o la nota a schermo intero');
            vero(await premutoDentro(p), 'l\'iframe si e\' ricaricato andando a schermo intero');
            await foto(p, 'azoto-schermo-intero-computer');
            await p.click('#btn-schermo-intero');
            await p.waitForFunction(() => !document.fullscreenElement && document.getElementById('riquadro-video').getAttribute('data-intero') === '0', null, { timeout: 5000 });
            vero(await p.getAttribute('#btn-schermo-intero', 'aria-label') === 'Schermo intero', 'etichetta dopo l\'uscita');
        });

        await prova('«Schermo intero» su iPhone (niente API di schermo intero): vista a pagina intera orizzontale, pulsante per uscire che non copre l\'iframe; Esc e il pulsante escono', async () => {
            vero(await i.evaluate(() => typeof Element.prototype.requestFullscreen === 'undefined' && document.documentElement.classList.contains('ios')), 'la prova non simula iPhone');
            const controlla = async cosa => {
                await i.waitForSelector('#riquadro-video[data-intero="1"]', { timeout: 5000 });
                await pausa(300);
                const m = await misuraIntero(i);
                const t = /matrix\(([^)]+)\)/.exec(m.trasformazione);
                const n = t ? t[1].split(',').map(Number) : [];
                vero(m.finto && !m.vero, cosa + ': non e\' lo pseudo schermo intero ' + JSON.stringify({ finto: m.finto, vero: m.vero }));
                vero(n.length === 6 && Math.abs(n[0]) < 0.01 && Math.abs(n[1] - 1) < 0.01 && Math.abs(n[2] + 1) < 0.01 && Math.abs(n[3]) < 0.01, cosa + ': il riquadro non e\' ruotato di 90 gradi: ' + m.trasformazione);
                vero(Math.abs(m.riquadro.x) < 1 && Math.abs(m.riquadro.y) < 1 && Math.abs(m.riquadro.w - m.finestra.w) < 1 && Math.abs(m.riquadro.h - m.finestra.h) < 1, cosa + ': non copre lo schermo ' + JSON.stringify({ r: m.riquadro, f: m.finestra }));
                vero(m.riquadroLocale.w > m.riquadroLocale.h && Math.abs(m.riquadroLocale.w - m.finestra.h) < 1, cosa + ': la vista non e\' orizzontale ' + JSON.stringify(m.riquadroLocale));
                vero(Math.abs(m.iframeLocale.w / m.iframeLocale.h - 16 / 9) < 0.01 && m.iframe.h > m.iframe.w, cosa + ': iframe ' + JSON.stringify({ locale: m.iframeLocale, schermo: m.iframe }));
                vero(!siToccano(m.pulsante, m.iframe) && nelloSchermo(m.pulsante, m.finestra), cosa + ': il pulsante per uscire copre l\'iframe o esce dallo schermo ' + JSON.stringify({ p: m.pulsante, f: m.iframe }));
                vero(m.pulsante.w >= 47.5 && m.pulsante.h >= 47.5 && m.etichetta === 'Esci dallo schermo intero', cosa + ': pulsante ' + JSON.stringify({ p: m.pulsante, e: m.etichetta }));
                vero(m.centroIframe, cosa + ': qualcosa sopra l\'iframe');
                vero(await premutoDentro(i), cosa + ': l\'iframe si e\' ricaricato');
                const scorre = await i.evaluate(() => getComputedStyle(document.documentElement).overflow === 'hidden' && getComputedStyle(document.body).overflow === 'hidden');
                vero(scorre, cosa + ': la pagina sotto scorre ancora');
                return m;
            };
            await i.tap('#btn-schermo-intero');
            await controlla('iPhone 13 (390x664)');
            await i.keyboard.press('Escape');
            await i.waitForSelector('#riquadro-video[data-intero="0"]', { timeout: 5000 });
            vero(!(await i.evaluate(() => document.documentElement.classList.contains('schermo-intero-finto'))), 'Esc: classe rimasta');
            await i.setViewportSize({ width: 390, height: 844 });
            await pausa(300);
            await i.tap('#btn-schermo-intero');
            await controlla('390x844');
            await foto(i, 'azoto-schermo-intero-telefono');
            await i.tap('#btn-schermo-intero');
            await i.waitForSelector('#riquadro-video[data-intero="0"]', { timeout: 5000 });
            vero(!(await i.evaluate(() => document.documentElement.classList.contains('schermo-intero-finto'))), 'pulsante: classe rimasta');
            await controlla16x9(i, 'dopo lo schermo intero');
        });

        await prova('la regia cambia l\'indirizzo del player durante la diretta (livetv29 -> livetv30): iframe nuovo senza ricaricare la pagina, stessa lettura in ascolto', async () => {
            const prima = {};
            for (const c of [pc, ip]) prima[c === pc ? 'pc' : 'ip'] = { nav: await segnaPagina(c, 'cambio-indirizzo'), ascolti: Object.assign({}, c.ascolti) };
            // incollato con uno spazio: il servizio lo pulisce
            await cambiaAzoto(' ' + azotoCanale(30) + ' ');
            for (const [c, nome] of [[pc, 'computer'], [ip, 'iPhone']]) {
                await iframeAzotoGiusto(c.page, 'livetv30', nome);
                const x = prima[c === pc ? 'pc' : 'ip'];
                await nonRicaricata(c, 'cambio-indirizzo', x.nav, nome);
                vero(c.ascolti.aperti === x.ascolti.aperti && c.ascolti.chiusi === x.ascolti.chiusi, nome + ': ascolti su Firestore aperti o chiusi: ' + JSON.stringify({ prima: x.ascolti, dopo: c.ascolti }));
            }
            vero((await pubblico()).videoId === azotoCanale(30), 'documento pubblico: ' + (await pubblico()).videoId);
        });

        await prova('A -> B -> A con evento-player: senza ricaricare la pagina e senza aprire altri ascolti su Firestore; in B il nostro <video> con i nostri comandi', async () => {
            const prima = {};
            for (const c of [pc, ip]) prima[c === pc ? 'pc' : 'ip'] = { nav: await segnaPagina(c, 'a-b-a'), ascolti: Object.assign({}, c.ascolti) };
            const da = Date.now();
            await passaA('flusso');
            vero((await pubblico()).tipoPlayer === 'flusso' && (await pubblico()).videoId === LIVE, 'documento pubblico in B');
            for (const [c, nome] of [[pc, 'computer'], [ip, 'iPhone']]) {
                await videoVa(c.page, 30000, nome + ': il flusso della web TV nel nostro <video>');
                const s = await statoAzoto(c.page);
                vero(s.quanti === 0 && s.video === 1 && s.modo === 'flusso', nome + ': in B ' + JSON.stringify({ iframe: s.quanti, video: s.video, modo: s.modo }));
                vero(primaDa(c.richieste, /^\/live\/.*\.m4s$/, da), nome + ': segmenti della web TV non chiesti');
                vero(!(await visibile(c.page, '#nota-azoto')) && (await c.page.textContent('#btn-schermo-intero-testo')).trim() === 'Schermo intero', nome + ': la nota di Azoto in B');
            }
            // i nostri comandi (sul computer): play, muto, volume, «Attiva l'audio», «IN DIRETTA», qualita'
            for (const sel of ['#btn-play', '#btn-muto', '#volume', '#btn-attiva-audio']) vero(await visibile(p, sel), sel + ' non si vede in B');
            await aspetta(() => visibile(p, '#indicatore-live'), 10000, '«IN DIRETTA» in B');
            await aspetta(() => visibile(p, '#sel-qualita'), 10000, 'la qualità in B');
            const consigli = await p.evaluate(() => Array.from(document.querySelectorAll('#vista-diretta li[data-solo]')).map(li => li.getAttribute('data-solo') + ':' + (li.offsetParent !== null)));
            vero(consigli.filter(x => /^flusso:/.test(x)).every(x => /true$/.test(x)) && consigli.filter(x => /^azoto:/.test(x)).every(x => /false$/.test(x)), 'consigli in B: ' + consigli.join(', '));
            await passaA('azoto');
            for (const [c, nome] of [[pc, 'computer'], [ip, 'iPhone']]) {
                await iframeAzotoGiusto(c.page, 'livetv30', nome + ' di nuovo in A');
                const x = prima[c === pc ? 'pc' : 'ip'];
                await nonRicaricata(c, 'a-b-a', x.nav, nome);
                vero(c.ascolti.aperti === x.ascolti.aperti && c.ascolti.chiusi === x.ascolti.chiusi, nome + ': ascolti su Firestore aperti o chiusi: ' + JSON.stringify({ prima: x.ascolti, dopo: c.ascolti }));
            }
            vero(!(await visibile(p, '#btn-play')) && await visibile(p, '#nota-azoto'), 'di nuovo in A: restano i nostri comandi o manca la nota');
        });

        await prova('il player di Azoto non risponde: a 15 s (non prima) «La diretta sta arrivando, attendi qualche secondo» SOTTO il riquadro, con «Ricarica il video» (computer e telefono)', async () => {
            await i.setViewportSize({ width: 390, height: 844 });
            for (const c of [pc, ip]) { c.azoto.fermo = true; await segnaTempiLento(c.page, 'livetv31'); }
            await cambiaAzoto(azotoCanale(31));
            await Promise.all([pc, ip].map(c => c.page.waitForFunction(() => window.__tempiLento.avviso > 0, null, { timeout: 30000 })));
            for (const [c, nome] of [[pc, 'computer'], [ip, 'telefono']]) {
                const t = await c.page.evaluate(() => window.__tempiLento);
                const dopo = (t.avviso - t.iframe) / 1000;
                console.log('       (' + nome + ': l\'avviso ' + dopo.toFixed(2) + ' s dopo l\'iframe)');
                vero(t.iframe > 0 && dopo >= 14.9 && dopo <= 17, nome + ': avviso dopo ' + dopo.toFixed(2) + ' s (deve essere 15)');
                await c.page.waitForFunction(t => document.getElementById('avviso-lento-testo').textContent === t, TESTO_LENTO, { timeout: 2000 });
                vero(await c.page.getAttribute('#avviso-lento', 'role') === 'status', nome + ': l\'avviso non e\' una regione "status"');
                const m = await c.page.evaluate(() => {
                    const r = id => { const b = document.getElementById(id).getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; };
                    return { avviso: r('avviso-lento'), video: r('area-video'), pulsante: r('btn-ricarica-video'), dentro: document.getElementById('riquadro-video').contains(document.getElementById('avviso-lento')), finestra: { w: innerWidth, h: innerHeight } };
                });
                vero(m.avviso.y >= m.video.y + m.video.h - 0.5, nome + ': l\'avviso non sta sotto il video ' + JSON.stringify(m));
                vero(m.pulsante.h >= 48 && nelloSchermo(m.pulsante, m.finestra), nome + ': «Ricarica il video» ' + JSON.stringify(m.pulsante));
                const s = await statoAzoto(c.page);
                vero(s.quanti === 1 && /livetv31/.test(s.src) && s.schermata === 'video' && !s.schermo, nome + ': l\'iframe non resta al suo posto ' + JSON.stringify(s));
                const sopra = await sopraIframe(c.page);
                vero(!sopra.length, nome + ': sopra l\'iframe: ' + sopra.join(' | '));
                await foto(c.page, nome === 'computer' ? 'azoto-lenta-computer' : 'azoto-lenta-telefono');
            }
        });

        await prova('«Ricarica il video» ricrea SOLO l\'iframe: la pagina non si ricarica (variabile globale), stesso riquadro, stessa lettura in ascolto', async () => {
            const nav = await segnaPagina(pc, 'ricarica');
            await p.evaluate(() => { document.querySelector('#video-player iframe').dataset.segno = 'vecchio'; });
            const ascolti = Object.assign({}, pc.ascolti);
            const n0 = pc.richiesteAzoto.filter(u => /livetv31\/player/.test(u)).length;
            await p.click('#btn-ricarica-video');
            await aspetta(() => p.evaluate(() => { const f = document.querySelectorAll('#video-player iframe'); return f.length === 1 && !f[0].dataset.segno && /livetv31/.test(f[0].src); }), 5000, 'l\'iframe nuovo');
            vero(!(await visibile(p, '#avviso-lento')), 'l\'avviso resta dopo «Ricarica il video»');
            await aspetta(() => pc.richiesteAzoto.filter(u => /livetv31\/player/.test(u)).length > n0, 5000, 'la pagina del player chiesta di nuovo');
            await nonRicaricata(pc, 'ricarica', nav, 'computer');
            vero(pc.ascolti.aperti === ascolti.aperti && pc.ascolti.chiusi === ascolti.chiusi, 'ascolti su Firestore: ' + JSON.stringify({ prima: ascolti, dopo: pc.ascolti }));
            vero(await p.evaluate(() => document.activeElement === document.getElementById('riquadro-video')), 'il fuoco si e\' perso (doveva andare sul riquadro)');
            // il telefono non ha premuto niente: il suo avviso resta
            vero(await visibile(i, '#avviso-lento'), 'l\'avviso del telefono e\' sparito senza che Azoto tornasse');
        });

        await prova('quando Azoto torna il messaggio sparisce da solo e si vede il player (telefono: senza toccare niente)', async () => {
            for (const c of [pc, ip]) { c.azoto.fermo = false; c.trattieni.rilascia(); }
            await i.waitForSelector('#avviso-lento', { state: 'hidden', timeout: 10000 });
            for (const [c, nome] of [[pc, 'computer'], [ip, 'telefono']]) {
                await iframeAzotoGiusto(c.page, 'livetv31', nome);
            }
            await pausa(1000);
            vero(!(await visibile(p, '#avviso-lento')) && !(await visibile(i, '#avviso-lento')), 'l\'avviso e\' tornato');
        });

        await prova('modalità A: nessuna violazione della CSP (frame-src solo il player di Azoto), nessun errore nella pagina né in console', async () => {
            const csp = await p.getAttribute('meta[http-equiv="Content-Security-Policy"]', 'content');
            const frameSrc = (/(?:^|;)\s*frame-src ([^;]*)/.exec(csp) || [])[1];
            vero(frameSrc && frameSrc.trim() === 'https://cdn.azotosolutions.com', 'frame-src: «' + frameSrc + '»');
            vero(!/azotosolutions/.test((/(?:^|;)\s*script-src ([^;]*)/.exec(csp) || [])[1] || ''), 'script di Azoto ammessi nella CSP');
            for (const [c, nome] of [[pc, 'computer'], [ip, 'iPhone']]) {
                const v = await c.page.evaluate(() => window.__violazioniCsp || []);
                vero(v.length === 0, nome + ': CSP: ' + v.join(' | '));
                vero(c.page.__errori.length === 0, nome + ': errori: ' + c.page.__errori.join(' | '));
                vero(c.page.__console.length === 0, nome + ': errori in console: ' + c.page.__console.join(' | '));
                vero(c.richiesteAzoto.every(u => /^https:\/\/cdn\.azotosolutions\.com\/cloudtv\/livetv\d+\/player\/?$/.test(u)), nome + ': richieste ad Azoto: ' + c.richiesteAzoto.filter(u => !/cloudtv/.test(u)).join(', '));
                vero(!c.falliteAzoto.length, nome + ': richieste ad Azoto non riuscite (uscite dalle regole della prova?): ' + c.falliteAzoto.join(' | '));
            }
        });
        await ip.context.close();
        // da qui la modalita' B: la console del computer vedra' anche gli errori voluti (503 della web TV)
        pc.page.__console.length = 0;

        /* =================== MODALITA' B: IL FLUSSO DIRETTO =================== */
        console.log('\nModalità B, computer 1440x900: la web TV finta (ffmpeg)');

        await prova('la regia passa al flusso diretto (evento-player): la diretta HLS della web TV parte da sola nel nostro player, muta, con «Attiva l\'audio»', async () => {
            await passaA('flusso');
            const s = await videoVa(p, 30000, 'la diretta che va');
            vero(s.muto === true, 'il video non parte muto');
            vero(await visibile(p, '#btn-attiva-audio'), '«Attiva l\'audio» non si vede');
            vero(!(await p.locator('#video-player iframe').count()), 'c\'e\' un iframe: il video deve essere nel nostro <video>');
            vero(pc.richieste.some(r => /^\/live\/stream_\d+\.m3u8$/.test(r.percorso)) && pc.richieste.some(r => /^\/live\/.*\.m4s$/.test(r.percorso)),
                'il player non ha letto playlist e segmenti del link principale');
            vero(pc.ascolti.aperti >= 1, 'la prova non vede l\'ascolto su Firestore (canale Listen): ' + JSON.stringify(pc.ascolti));
        });

        await prova('«IN DIRETTA» rosso al punto live, niente «Torna in diretta» e niente barra (la web TV tiene solo 40 s), qualità Automatica/360p/180p', async () => {
            await aspetta(() => visibile(p, '#indicatore-live'), 10000, '«IN DIRETTA»');
            vero(/in diretta/i.test(await p.textContent('#indicatore-live')), 'testo: ' + await p.textContent('#indicatore-live'));
            vero(!(await visibile(p, '#btn-live')), '«Torna in diretta» si vede al punto live');
            vero(!(await visibile(p, '#barra-dvr')), 'la barra per tornare indietro si vede senza finestra');
            await aspetta(() => visibile(p, '#sel-qualita'), 10000, 'la scelta della qualità');
            const voci = await p.locator('#sel-qualita option').allInnerTexts();
            vero(voci.join(',') === 'Automatica,360p,180p', 'qualità: ' + voci.join(', '));
            await foto(p, 'diretta-computer');
            await p.selectOption('#sel-qualita', { label: '180p' });
            await aspetta(async () => (await statoVideo(p)).h === 180, 20000, 'il video a 180 righe');
            await p.selectOption('#sel-qualita', { label: 'Automatica' });
            vero((await statoVideo(p)).fermo === false, 'il video si e\' fermato cambiando qualità');
        });

        await prova('la regia cambia il link durante la diretta: il video riparte dal nuovo, senza ricaricare, stesso <video>, nessun ascolto Firestore in più', async () => {
            await p.evaluate(() => { window.__segnoPagina = 'ancora-qui'; document.querySelector('#video-player video').dataset.segno = 'lo-stesso'; });
            const ascoltiPrima = Object.assign({}, pc.ascolti);
            const da = Date.now();
            await cambiaVideo(RISERVA, '');
            await aspetta(() => primaDa(pc.richieste, /^\/riserva\/.*\.m4s$/, da), 15000, 'i segmenti del link nuovo');
            await videoVa(p, 20000, 'il video del link nuovo');
            await pausa(3000);
            vero(!pc.richieste.some(r => r.t > Date.now() - 2500 && /^\/live\//.test(r.percorso)), 'il player legge ancora il link vecchio');
            vero(await p.evaluate(() => window.__segnoPagina) === 'ancora-qui', 'la pagina si e\' ricaricata');
            vero(await p.evaluate(() => { const v = document.querySelectorAll('#video-player video'); return v.length === 1 && v[0].dataset.segno === 'lo-stesso'; }), 'il <video> e\' cambiato');
            vero(pc.ascolti.aperti === ascoltiPrima.aperti && pc.ascolti.chiusi === ascoltiPrima.chiusi,
                'ascolti su Firestore aperti o chiusi durante il cambio: ' + JSON.stringify({ prima: ascoltiPrima, dopo: pc.ascolti }));
            vero(!pc.chiamate.some(c => c.t >= da), 'la pagina ha chiamato il servizio per un link non firmato: ' + JSON.stringify(pc.chiamate.filter(c => c.t >= da)));
            // di nuovo il principale, con la riserva
            const da2 = Date.now();
            await cambiaVideo(LIVE, RISERVA);
            await aspetta(() => primaDa(pc.richieste, /^\/live\/.*\.m4s$/, da2), 15000, 'di nuovo il link principale');
            await videoVa(p, 20000, 'il video del principale');
        });

        await prova('il principale cade: «Stiamo ricollegando la diretta…», tentativi distanziati, e dopo PIÙ di 20 s di guasto il passaggio da solo alla riserva', async () => {
            const pb = await pubblico();
            vero(pb.videoRiserva === RISERVA && pb.sorgente === 'principale', 'documento pubblico: ' + JSON.stringify({ r: pb.videoRiserva, s: pb.sorgente }));
            await p.evaluate(() => { window.__segnoPagina = 'prima-del-guasto'; });
            const t0 = Date.now();
            pc.webtv.principaleGiu = true;
            await aspetta(async () => (await statoVideo(p)).tipo === 'ricollegamento', 45000, '«Stiamo ricollegando»');
            const tRic = Date.now();
            vero(/Stiamo ricollegando la diretta/.test(await p.textContent('#schermo-video-titolo')), 'titolo: ' + await p.textContent('#schermo-video-titolo'));
            vero(/non serve ricaricarla/.test(await p.textContent('#schermo-video-testo')), 'testo: ' + await p.textContent('#schermo-video-testo'));
            vero(!(await statoVideo(p)).visibile, 'il video fermo resta visibile sotto la schermata');
            vero(!(await visibile(p, '#btn-attiva-audio')), '«Attiva l\'audio» durante il ricollegamento');
            await foto(p, 'ricollegamento-computer');
            // i tempi cambiano con le correzioni del player: attese larghe, ma mai prima di ~20 s di guasto
            const riserva = await aspetta(() => primaDa(pc.richieste, /^\/riserva\//, t0), 70000, 'la riserva');
            const dalGuasto = (riserva.t - t0) / 1000;
            console.log('       (caduta -> «Stiamo ricollegando» ' + ((tRic - t0) / 1000).toFixed(1) + ' s; caduta -> riserva ' + dalGuasto.toFixed(1) + ' s)');
            vero(dalGuasto >= 17, 'passaggio alla riserva troppo presto: ' + dalGuasto.toFixed(1) + ' s dopo la caduta (la regola: dopo 20 s di guasto)');
            // i tentativi sul principale, nel frattempo: distanziati, mai a raffica
            const tentativi = pc.richieste.filter(r => r.t >= tRic && r.t < riserva.t && r.percorso === '/live/master.m3u8').map(r => r.t);
            const intervalli = tentativi.slice(1).map((t, i) => t - tentativi[i]);
            vero(tentativi.length >= 1 && intervalli.every(x => x >= 500), 'tentativi sul principale: ' + tentativi.length + ', intervalli ' + intervalli.join(', ') + ' ms');
            await videoVa(p, 30000, 'il video della riserva');
            vero(await p.evaluate(() => window.__segnoPagina) === 'prima-del-guasto', 'la pagina si e\' ricaricata');
            vero(!(await visibile(p, '#schermo-video')), 'la schermata resta sopra il video');
            pc.webtv.principaleGiu = false;
        });

        await prova('la regia riporta tutti sul principale, li manda sulla riserva e li riporta (senza ricaricare)', async () => {
            let da = Date.now();
            await g({ azione: 'evento-sorgente', idEvento: EVENTO, sorgente: 'principale' });
            await aspetta(() => primaDa(pc.richieste, /^\/live\/.*\.m4s$/, da), 15000, 'di nuovo il principale (la regia annulla il passaggio automatico)');
            await videoVa(p, 20000, 'il video del principale');
            da = Date.now();
            await g({ azione: 'evento-sorgente', idEvento: EVENTO, sorgente: 'riserva' });
            vero((await pubblico()).sorgente === 'riserva', 'sorgente nel documento pubblico');
            await aspetta(() => primaDa(pc.richieste, /^\/riserva\/.*\.m4s$/, da), 15000, 'tutti sulla riserva');
            await videoVa(p, 20000, 'il video della riserva');
            await pausa(2500);
            vero(!pc.richieste.some(r => r.t > Date.now() - 2000 && /^\/live\//.test(r.percorso)), 'il player legge ancora il principale');
            da = Date.now();
            await g({ azione: 'evento-sorgente', idEvento: EVENTO, sorgente: 'principale' });
            await aspetta(() => primaDa(pc.richieste, /^\/live\/.*\.m4s$/, da), 15000, 'di nuovo tutti sul principale');
            await videoVa(p, 20000, 'il video del principale');
            vero(await p.evaluate(() => window.__segnoPagina) === 'prima-del-guasto', 'la pagina si e\' ricaricata');
        });

        await prova('una diretta che non risponde ancora (404): «Stiamo ricollegando», e appena la web TV trasmette il video parte da solo', async () => {
            await cambiaVideo(SPENTO, '');
            await aspetta(async () => (await statoVideo(p)).tipo === 'ricollegamento', 30000, '«Stiamo ricollegando» sulla diretta spenta');
            vero(!(await statoVideo(p)).visibile, 'lo schermo nero del video si vede');
            await pausa(3000);
            const t0 = Date.now();
            pc.webtv.spentoAcceso = true;
            await videoVa(p, 60000, 'il video che parte da solo');
            console.log('       (partito ' + Math.round((Date.now() - t0) / 1000) + ' s dopo l\'accensione)');
            vero(pc.richieste.some(r => /^\/spento\/.*\.m4s$/.test(r.percorso)), 'segmenti della diretta accesa');
            vero(await p.evaluate(() => window.__segnoPagina) === 'prima-del-guasto', 'la pagina si e\' ricaricata');
        });

        await prova('un link non valido nel documento dell\'evento: la pagina non si rompe, «Video non disponibile» chiaro, poi il video torna da solo', async () => {
            // un valore che il servizio non salverebbe mai (un file, non una diretta): scritto a mano
            await db.doc('eventi/' + EVENTO).update({ videoId: F.WEBTV + '/video/prova.mp4', videoRiserva: '', videoAggiornato: T.now() });
            await aspetta(async () => (await statoVideo(p)).tipo === 'errore', 10000, '«Video non disponibile»');
            vero(/Video non disponibile/.test(await p.textContent('#schermo-video-titolo')), 'titolo: ' + await p.textContent('#schermo-video-titolo'));
            const t = await p.textContent('#schermo-video-testo');
            vero(/collegamento al video .* non è valido/.test(t) && !/browser/i.test(t), 'testo poco chiaro: ' + t);
            vero(!(await visibile(p, '#btn-attiva-audio')), '«Attiva l\'audio» con il video non disponibile');
            vero(await p.getAttribute('body', 'data-vista') === 'diretta', 'vista: ' + await p.getAttribute('body', 'data-vista'));
            // il video di prima non resta acceso di nascosto (se ne sentirebbe l'audio), e nessun iframe
            const resto = await p.evaluate(() => ({
                iframe: !!document.querySelector('#video-player iframe'),
                va: Array.from(document.querySelectorAll('#video-player video')).some(v => !v.paused)
            }));
            vero(!resto.iframe && !resto.va, 'il video di prima resta acceso sotto «Video non disponibile» (se ne sentirebbe l\'audio): ' + JSON.stringify(resto));
            await foto(p, 'non-disponibile-computer');
            await cambiaVideo(LIVE, RISERVA);
            await videoVa(p, 25000, 'il video di nuovo');
            vero(!(await visibile(p, '#schermo-video')), 'la schermata d\'errore resta');
        });

        console.log('\nModalità B, computer: il flusso pubblico di Shaka Player (HLS e DASH, un\'ora di finestra)');
        await prova('HLS pubblico: la diretta parte, «IN DIRETTA», la barra per tornare indietro (un\'ora), qualità 480p', async () => {
            const da = Date.now();
            await cambiaVideo(F.FLUSSO_PUBBLICO_HLS, '');
            await aspetta(() => primaDa(pc.richieste, /\/shaka-live-assets\/.*\.mp4$/, da), 30000, 'i segmenti del flusso pubblico');
            await videoVa(p, 60000, 'il flusso pubblico HLS');
            await aspetta(() => visibile(p, '#barra-dvr'), 15000, 'la barra per tornare indietro');
            await aspetta(() => visibile(p, '#indicatore-live'), 15000, '«IN DIRETTA»');
            vero(!(await visibile(p, '#btn-live')), '«Torna in diretta» al punto live');
            vero(await p.textContent('#dvr-etichetta') === 'In diretta', 'etichetta: ' + await p.textContent('#dvr-etichetta'));
            const min = Number(await p.getAttribute('#dvr', 'min'));
            vero(min <= -1800, 'la barra copre ' + Math.round(-min / 60) + ' minuti');
            const voci = await p.locator('#sel-qualita option').allInnerTexts();
            vero(voci[0] === 'Automatica' && voci.indexOf('720p') > 0 && voci.indexOf('480p') > 0 && new Set(voci).size === voci.length, 'qualità: ' + voci.join(', '));
            await p.selectOption('#sel-qualita', { label: '480p' });
            await aspetta(async () => { const s = await statoVideo(p); return s.h === 480 && !s.fermo; }, 30000, 'il video a 480 righe');
            await p.selectOption('#sel-qualita', { label: 'Automatica' });
            vero(pc.pubblicoInoltrato.richieste > 0, 'nessuna richiesta al flusso pubblico');
        });

        await prova('HLS pubblico: indietro di 2 minuti con la barra -> «Torna in diretta» e «−2:00»; «Torna in diretta» riporta al punto live', async () => {
            // con l'audio attivo (la foto mostra anche il volume)
            if (await visibile(p, '#btn-attiva-audio')) await p.click('#btn-attiva-audio');
            await p.evaluate(() => {
                const r = document.getElementById('dvr');
                r.value = '-120';
                r.dispatchEvent(new Event('input', { bubbles: true }));
                r.dispatchEvent(new Event('change', { bubbles: true }));
            });
            await aspetta(() => visibile(p, '#btn-live'), 20000, '«Torna in diretta»');
            await aspetta(async () => /^−(1:5\d|2:\d\d)$/.test(await p.textContent('#dvr-etichetta')), 20000, 'etichetta «−2:00»');
            vero(!(await visibile(p, '#indicatore-live')), '«IN DIRETTA» mentre si e\' indietro');
            const s = await videoVa(p, 20000, 'il video indietro che va');
            vero(s.bordo - s.t > 100, 'non e\' indietro: ' + (s.bordo - s.t).toFixed(1) + ' s dal bordo');
            vero(/indietro rispetto alla diretta/.test(await p.getAttribute('#dvr', 'aria-valuetext')), 'aria-valuetext: ' + await p.getAttribute('#dvr', 'aria-valuetext'));
            await foto(p, 'dvr-computer');
            await p.click('#btn-live');
            await aspetta(() => visibile(p, '#indicatore-live'), 20000, '«IN DIRETTA» dopo «Torna in diretta»');
            vero(!(await visibile(p, '#btn-live')), '«Torna in diretta» resta');
            vero(await p.textContent('#dvr-etichetta') === 'In diretta', 'etichetta: ' + await p.textContent('#dvr-etichetta'));
            const s2 = await videoVa(p, 20000, 'il video al punto live');
            vero(s2.bordo - s2.t < 40, 'lontano dal punto live: ' + (s2.bordo - s2.t).toFixed(1) + ' s');
        });

        await prova('HLS pubblico: in pausa compare «Torna in diretta», che riparte dal punto live', async () => {
            await p.click('#btn-play');
            await p.waitForSelector('#schermo-pausa', { state: 'visible', timeout: 5000 });
            await aspetta(() => visibile(p, '#btn-live'), 5000, '«Torna in diretta» in pausa');
            vero(!(await visibile(p, '#indicatore-live')), '«IN DIRETTA» in pausa');
            await pausa(4000);
            await p.click('#btn-live');
            await p.waitForSelector('#schermo-pausa', { state: 'hidden', timeout: 5000 });
            await aspetta(() => visibile(p, '#indicatore-live'), 15000, '«IN DIRETTA» dopo la pausa');
            await videoVa(p, 20000, 'il video dopo la pausa');
        });

        await prova('DASH pubblico (dash.js): la diretta parte, con «IN DIRETTA» e la barra per tornare indietro', async () => {
            const da = Date.now();
            await cambiaVideo(F.FLUSSO_PUBBLICO_DASH, '');
            await aspetta(() => primaDa(pc.richieste, /\.mpd$/, da), 30000, 'il manifesto DASH');
            await aspetta(() => p.evaluate(() => typeof window.dashjs === 'object'), 20000, 'dash.js caricato');
            await videoVa(p, 60000, 'il flusso pubblico DASH');
            await aspetta(() => visibile(p, '#barra-dvr'), 15000, 'la barra per tornare indietro');
            await aspetta(() => visibile(p, '#indicatore-live'), 15000, '«IN DIRETTA»');
            await foto(p, 'dash-computer');
        });

        await prova('DASH pubblico: la scelta della qualità (Automatica e le due altezze del flusso, 720p e 480p)', async () => {
            await aspetta(async () => (await p.locator('#sel-qualita option').count()) >= 3, 15000,
                'le qualità del DASH (il selettore ha ' + await p.locator('#sel-qualita option').count() + ' voci)');
            const voci = await p.locator('#sel-qualita option').allInnerTexts();
            vero(voci[0] === 'Automatica' && voci.indexOf('720p') > 0 && voci.indexOf('480p') > 0 && new Set(voci).size === voci.length, 'qualità: ' + voci.join(', '));
        });

        console.log('\nModalità B, computer: il link firmato (firma nginx, dal servizio)');
        await prova('link firmato: la pagina chiede il link al servizio (link-video) e la firma arriva su playlist e segmenti; la chiave non esce', async () => {
            const da = Date.now();
            await g({ azione: 'evento-salva', evento: Object.assign({}, EVENTO_DATI, { nuovo: false, firma: { schema: 'nginx', segreto: SEGRETO, durataOre: 6 } }) });
            const pb = await pubblico();
            vero(pb.videoFirmato === true && pb.videoId === LIVE && pb.tipoPlayer === 'flusso', 'documento pubblico: ' + JSON.stringify({ firmato: pb.videoFirmato, id: pb.videoId, tipo: pb.tipoPlayer }));
            vero(JSON.stringify(pb).indexOf(SEGRETO) < 0, 'la chiave e\' nel documento pubblico');
            const master = await aspetta(() => primaDa(pc.richieste, /^\/live\/master\.m3u8$/, da), 20000, 'la playlist firmata');
            await aspetta(() => pc.richieste.filter(r => r.t >= master.t && /^\/live\/.*\.m4s$/.test(r.percorso)).length >= 2, 20000, 'i segmenti');
            await videoVa(p, 20000, 'il video firmato');
            vero(pc.chiamate.filter(c => c.t >= da && c.azione === 'link-video').length === 1, 'richieste di link-video: ' + JSON.stringify(pc.chiamate.filter(c => c.t >= da)));
            const q = new URLSearchParams(master.query);
            const scade = Number(q.get('expires'));
            const atteso = crypto.createHash('md5').update(scade + '/live/master.m3u8 ' + SEGRETO).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
            vero(q.get('md5') === atteso, 'firma della playlist: ' + master.query);
            vero(Math.abs(scade * 1000 - (Date.now() + 6 * 3600e3)) < 120000, 'scadenza: ' + new Date(scade * 1000).toISOString());
            const dopo = pc.richieste.filter(r => r.t >= master.t && /^\/live\//.test(r.percorso));
            vero(dopo.length > 3 && dopo.every(r => r.query.indexOf('md5=' + atteso) >= 0 && r.query.indexOf('expires=' + scade) >= 0),
                'richieste senza firma: ' + dopo.filter(r => r.query.indexOf('md5=') < 0).map(r => r.percorso).slice(0, 3).join(', '));
            vero(!pc.richieste.some(r => (r.percorso + r.query).indexOf(SEGRETO) >= 0), 'la chiave e\' in un indirizzo');
            // via la firma: di nuovo il link com'e'
            await g({ azione: 'evento-salva', evento: Object.assign({}, EVENTO_DATI, { nuovo: false, firma: { schema: 'nessuna' } }) });
            await aspetta(async () => (await pubblico()).videoFirmato === false, 10000, 'firma tolta');
            const da2 = Date.now();
            await aspetta(() => pc.richieste.find(r => r.t >= da2 && /^\/live\/.*\.m4s$/.test(r.percorso) && !r.query), 20000, 'segmenti senza firma');
            await videoVa(p, 20000, 'il video senza firma');
        });

        await prova('computer: nessuna violazione della CSP e nessun errore nella pagina', async () => {
            const v = await p.evaluate(() => window.__violazioniCsp || []);
            vero(v.length === 0, 'CSP: ' + v.join(' | '));
            vero(p.__errori.length === 0, 'errori: ' + p.__errori.join(' | '));
        });
        await pc.context.close();

        /* =================== TELEFONO (modalita' B) =================== */
        console.log('\nModalità B, telefono 390x844 (iPhone, senza API di schermo intero)');
        const tel = await contesto({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IPHONE }, true);
        const t = tel.page;
        // ogni comando visibile della barra sta dentro lo schermo, senza scorrere di lato
        async function dentroLoSchermo(cosa) {
            const m = await t.evaluate(() => {
                const fuori = [];
                ['btn-play', 'btn-muto', 'indicatore-live', 'btn-live', 'sel-qualita', 'btn-schermo-intero', 'dvr', 'dvr-etichetta', 'btn-attiva-audio'].forEach(id => {
                    const el = document.getElementById(id);
                    if (!el || el.offsetParent === null) return;
                    const b = el.getBoundingClientRect();
                    if (b.left < -0.5 || b.right > window.innerWidth + 0.5) fuori.push(id + ' ' + Math.round(b.left) + '-' + Math.round(b.right));
                });
                return { fuori, largo: document.documentElement.scrollWidth };
            });
            vero(m.largo <= 390, cosa + ': la pagina scorre di lato (' + m.largo + ' px)');
            vero(!m.fuori.length, cosa + ': fuori dallo schermo: ' + m.fuori.join(', '));
        }
        // la schermata al posto del video si legge tutta
        async function schermataLeggibile(cosa) {
            const m = await t.evaluate(() => {
                const a = document.getElementById('area-video').getBoundingClientRect();
                const pezzi = ['schermo-video-titolo', 'schermo-video-testo'].map(id => document.getElementById(id).getBoundingClientRect());
                const sv = document.getElementById('schermo-video');
                return { dentro: pezzi.every(b => b.top >= a.top - 0.5 && b.bottom <= a.bottom + 0.5 && b.left >= a.left - 0.5 && b.right <= a.right + 0.5), tagliato: sv.scrollHeight > sv.clientHeight + 1 };
            });
            vero(m.dentro && !m.tagliato, cosa + ': il testo della schermata esce dal riquadro ' + JSON.stringify(m));
        }

        await prova('telefono: la diretta con «IN DIRETTA», qualità e «Attiva l\'audio», tutto dentro lo schermo', async () => {
            await entra(t);
            await videoVa(t, 30000, 'la diretta sul telefono');
            await aspetta(() => visibile(t, '#indicatore-live'), 10000, '«IN DIRETTA»');
            await aspetta(() => visibile(t, '#sel-qualita'), 10000, 'la qualità');
            vero(!(await visibile(t, '#volume')), 'cursore del volume su iPhone');
            const b = await t.locator('#btn-attiva-audio').boundingBox();
            vero(b && b.height >= 48 && b.width >= 300, '«Attiva l\'audio» piccolo: ' + JSON.stringify(b));
            await dentroLoSchermo('in diretta');
            await t.evaluate(() => document.fonts && document.fonts.ready);
            await foto(t, 'diretta-telefono');
        });

        await prova('telefono: HLS pubblico indietro di 2 minuti: barra, «−2:00» e «Live» (Torna in diretta) dentro lo schermo', async () => {
            const da = Date.now();
            await cambiaVideo(F.FLUSSO_PUBBLICO_HLS, '');
            await aspetta(() => primaDa(tel.richieste, /\/shaka-live-assets\/.*\.mp4$/, da), 30000, 'i segmenti del flusso pubblico');
            await videoVa(t, 60000, 'il flusso pubblico HLS');
            await aspetta(() => visibile(t, '#barra-dvr'), 15000, 'la barra');
            if (await visibile(t, '#btn-attiva-audio')) await t.tap('#btn-attiva-audio');
            await t.evaluate(() => {
                const r = document.getElementById('dvr');
                r.value = '-120';
                r.dispatchEvent(new Event('input', { bubbles: true }));
                r.dispatchEvent(new Event('change', { bubbles: true }));
            });
            await aspetta(() => visibile(t, '#btn-live'), 20000, '«Torna in diretta»');
            await aspetta(async () => /^−(1:5\d|2:\d\d)$/.test(await t.textContent('#dvr-etichetta')), 20000, 'etichetta «−2:00»');
            await videoVa(t, 20000, 'il video indietro');
            vero(await t.locator('#btn-live .testo-corto').isVisible() && await t.getByRole('button', { name: 'Torna in diretta' }).count() === 1, '«Live» sul telefono, con il nome «Torna in diretta»');
            const hb = await t.locator('#btn-live').boundingBox();
            vero(hb.height >= 44, '«Live» alto ' + Math.round(hb.height));
            await dentroLoSchermo('indietro nella diretta');
            await foto(t, 'dvr-telefono');
            await t.tap('#btn-live');
            await aspetta(() => visibile(t, '#indicatore-live'), 20000, '«IN DIRETTA» dopo «Live»');
        });

        await prova('telefono: «Stiamo ricollegando la diretta…» si legge tutto, al posto del video', async () => {
            await cambiaVideo(SPENTO, '');
            await aspetta(async () => (await statoVideo(t)).tipo === 'ricollegamento', 30000, '«Stiamo ricollegando»');
            await schermataLeggibile('ricollegamento');
            await dentroLoSchermo('ricollegamento');
            await foto(t, 'ricollegamento-telefono');
        });

        await prova('telefono: «Video non disponibile» si legge tutto', async () => {
            await db.doc('eventi/' + EVENTO).update({ videoId: F.WEBTV + '/video/prova.mp4', videoRiserva: '', videoAggiornato: T.now() });
            await aspetta(async () => (await statoVideo(t)).tipo === 'errore', 10000, '«Video non disponibile»');
            await schermataLeggibile('video non disponibile');
            await foto(t, 'non-disponibile-telefono');
            await cambiaVideo(LIVE, RISERVA);
            await videoVa(t, 25000, 'di nuovo la diretta');
        });

        await prova('telefono: nessuna violazione della CSP e nessun errore nella pagina', async () => {
            const v = await t.evaluate(() => window.__violazioniCsp || []);
            vero(v.length === 0, 'CSP: ' + v.join(' | '));
            vero(t.__errori.length === 0, 'errori: ' + t.__errori.join(' | '));
        });
        await tel.context.close();
        await app.delete();
    } catch (e) {
        rossi++;
        console.log('ROSSO (interruzione) ' + String((e && e.stack) || e));
    } finally {
        if (browser) await browser.close().catch(() => {});
        if (trasmissione) trasmissione.ferma();
        figli.forEach(f => { try { f.kill('SIGINT'); } catch (e) { /* gia' fermo */ } });
    }
    console.log('\n' + verdi + ' verdi, ' + rossi + ' rossi' + (rossiElenco.length ? ':\n - ' + rossiElenco.join('\n - ') : ''));
    console.log('Screenshot in ' + path.relative(process.cwd(), FOTO));
    setTimeout(() => process.exit(rossi ? 1 : 0), 1500);
})();
