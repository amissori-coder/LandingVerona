/* ============================================================
   PROVE - la diretta dalla WEB TV nella pagina VERA dei partecipanti
   ------------------------------------------------------------
       node diretta/prove/webtv.prova.js

   Da sola avvia (e alla fine ferma) gli emulatori Firebase (firestore
   8380, auth 9380), il servizio VERO e il sito in locale
   (server-locale.js: api 3380, sito 8390) e la diretta di prova:
   - la WEB TV FINTA https://webtv.prova.test (flusso-prova.js): una
     diretta HLS vera trasmessa da ffmpeg (VP9 + Opus, 360p e 180p,
     segmenti da 2 s, finestra di 40 s: niente barra per tornare
     indietro), con /live/ (il link principale), /riserva/ (quello di
     riserva), /spento/ (una diretta non ancora partita),
     /player/napoli (la pagina del player da incorporare); il principale
     si "rompe" a comando (503 su playlist e segmenti);
   - il FLUSSO PUBBLICO DI PROVA di Shaka Player (Google), in HLS e in
     DASH: una diretta vera, sempre in onda, con un'ora di finestra per
     tornare indietro e piu' qualita' (480p, 720p). Il browser non esce
     in rete da solo: le richieste le fa Node (inoltraPubblico).
   Serve ffmpeg (quello di sistema, FFMPEG=/percorso, oppure pip
   install imageio-ffmpeg).

   La regia e' quella vera: le azioni dell'API di gestione
   (evento-salva, evento-stato, evento-video, evento-sorgente) con un
   gestore dell'emulatore. Il partecipante entra con nome utente e
   password (azione 'entra' vera) nella pagina vera (/diretta/, con la
   sua CSP e player-webtv.js), su Chromium: computer 1440x900 e
   telefono 390x844 (iPhone: user agent di Safari, niente API di
   schermo intero).

   COSA DIMOSTRA.
   - La diretta HLS della web TV parte da sola nel NOSTRO player, muta,
     con «Attiva l'audio»; «IN DIRETTA» rosso; niente barra per tornare
     indietro quando la web TV non tiene una finestra; qualita'
     Automatica, 360p, 180p (la scelta cambia davvero le righe del
     video).
   - La regia cambia il link durante la diretta: il video riparte dal
     nuovo, senza ricaricare la pagina, con lo stesso <video> e la
     stessa, unica, lettura in ascolto su Firestore (nessun ascolto
     aperto o chiuso).
   - Il principale cade (503): al posto del video «Stiamo ricollegando
     la diretta…», nuovi tentativi distanziati, e dopo PIU' di 20
     secondi di guasto il passaggio da solo alla riserva, senza
     ricaricare. La regia poi riporta tutti sul principale, li manda
     sulla riserva e li riporta ancora (evento-sorgente).
   - Una diretta che non risponde ancora (404): «Stiamo ricollegando»;
     appena la web TV trasmette, il video parte da solo.
   - Il link della pagina del player (ripiego, anche come codice
     <iframe>): il player della web TV nel nostro riquadro, senza i
     nostri comandi (restano schermo intero e l'indicazione).
   - Un link non valido nel documento dell'evento: la pagina non si
     rompe e dice chiaramente «Video non disponibile», poi torna da
     sola quando il link e' buono.
   - Il flusso pubblico HLS di Shaka: la barra per tornare indietro;
     indietro di 2 minuti con la barra -> «Torna in diretta» (e niente
     «IN DIRETTA»), l'etichetta «−2:00»; «Torna in diretta» riporta al
     punto live; dalla pausa idem; la qualita' 480p.
   - Il flusso pubblico DASH (dash.js): parte, barra e qualita'.
   - Il link firmato (firma nginx): la pagina chiede il link al
     servizio (link-video), la firma arriva su playlist e segmenti, e
     la chiave non esce mai.
   - Sul telefono: tutto dentro lo schermo (barra, «Live», qualita',
     schermo intero), schermate leggibili.
   - Nessuna violazione della CSP, nessun errore nella pagina.
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
const { chromium } = require('playwright');
const { preparaContesto } = require('./rete-prove');
const F = require('./flusso-prova');

const LIVE = F.WEBTV + '/live/master.m3u8';
const RISERVA = F.WEBTV + '/riserva/master.m3u8';
const SPENTO = F.WEBTV + '/spento/master.m3u8';
const INCORPORATO = '<iframe src="' + F.WEBTV + '/player/napoli" width="640" height="360" allowfullscreen></iframe>';
const SEGRETO = 'chiave-segreta-della-web-tv-' + crypto.randomBytes(4).toString('hex');
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const pausa = ms => new Promise(r => setTimeout(r, ms));

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
        const EVENTO_DATI = {
            id: EVENTO, titolo: 'Next Generation Business 2026 · Napoli', luogo: 'Napoli · Hotel Eurostars Excelsior',
            data: '2026-10-02', oraInizio: '09:00', oraFine: '17:30', videoUrl: LIVE, riservaUrl: RISERVA,
            programma: '09.00 Accoglienza e registrazione\n09.30 Apertura dei lavori\n13.00 Pausa pranzo\n17.30 Chiusura',
            paginaEvento: '/napoli_ottobre_2026/', unSoloDispositivo: false, promemoria: { giornoPrima: false, oraPrima: false }
        };
        await g({ azione: 'evento-salva', evento: Object.assign({ nuovo: true }, EVENTO_DATI) });
        const creati = await g({ azione: 'crea', idEvento: EVENTO, righe: [{ riga: 2, nome: 'Luca', cognome: 'Bianchi', email: 'luca.bianchi@esempio.it', azienda: 'Bianchi srl', nomeUtente: 'lucabianchi' }] });
        const persona = creati.risultati[0];
        await app.auth().updateUser(persona.uid, { password: PASSWORD });
        await g({ azione: 'evento-stato', idEvento: EVENTO, stato: 'in_onda' });
        // la regia cambia il video (e la riserva: '' la toglie, assente resta com'e')
        const cambiaVideo = (videoUrl, riservaUrl) => g(Object.assign({ azione: 'evento-video', idEvento: EVENTO, videoUrl }, riservaUrl !== undefined ? { riservaUrl } : {}));
        const pubblico = async () => (await db.doc('eventi/' + EVENTO).get()).data();

        /* ---------- il browser ---------- */
        browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
        async function contesto(opzioni, senzaSchermoIntero) {
            const context = await browser.newContext(Object.assign({ locale: 'it-IT', timezoneId: 'Europe/Rome' }, opzioni));
            await preparaContesto(context, {});
            // registrate dopo preparaContesto: vincono loro
            const webtv = await F.instradaWebTv(context, CARTELLA);
            const pubblicoInoltrato = await F.inoltraPubblico(context);
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
                await context.addInitScript(() => {
                    const via = (o, k) => { try { Object.defineProperty(o, k, { value: undefined, configurable: true, writable: true }); } catch (e) { /* niente */ } };
                    via(Element.prototype, 'requestFullscreen');
                    via(Element.prototype, 'webkitRequestFullscreen');
                    try { Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => false, configurable: true }); } catch (e) { /* niente */ }
                });
            }
            const page = await context.newPage();
            page.__errori = [];
            page.on('pageerror', e => page.__errori.push(String(e && e.message || e)));
            const richieste = registroWebTv(page);
            const ascolti = contaAscolti(page);
            const chiamate = [];
            page.on('request', q => {
                if (q.url().indexOf(API + '/') !== 0 || q.method() !== 'POST') return;
                let c = {};
                try { c = JSON.parse(q.postData() || '{}'); } catch (e) { c = {}; }
                chiamate.push({ t: Date.now(), azione: c.azione, sorgente: c.sorgente });
            });
            return { context, page, webtv, pubblicoInoltrato, richieste, ascolti, chiamate };
        }
        async function entra(page) {
            await page.goto(SITO + '/diretta/?emulatori=1');
            await page.waitForSelector('body[data-vista="accesso"]', { timeout: 30000 });
            await page.fill('#campo-nome-utente', 'lucabianchi');
            await page.fill('#campo-password', PASSWORD);
            await page.click('#btn-entra');
            await page.waitForSelector('body[data-vista="diretta"]', { timeout: 30000 });
        }
        const foto = (page, nome) => page.screenshot({ path: path.join(FOTO, nome + '.png') });
        // dopo quando (ms) la pagina ha chiesto alla web TV un file di quel percorso?
        const primaDa = (richieste, re, da) => richieste.find(r => r.t >= da && re.test(r.percorso));

        /* =================== COMPUTER =================== */
        console.log('\nComputer 1440x900: la web TV finta (ffmpeg)');
        const pc = await contesto({ viewport: { width: 1440, height: 900 } });
        const p = pc.page;

        await prova('la diretta HLS della web TV parte da sola nel nostro player: muta, con «Attiva l\'audio»', async () => {
            await entra(p);
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

        await prova('il ripiego: il player della web TV incorporato (codice <iframe>), con i suoi comandi e il nostro schermo intero', async () => {
            await cambiaVideo(INCORPORATO, '');
            const fr = p.frameLocator('#video-player iframe');
            await fr.locator('#player-webtv').waitFor({ timeout: 15000 });
            await aspetta(async () => await p.getAttribute('#riquadro-video', 'data-comandi') === 'ridotti', 10000, 'comandi ridotti');
            vero(!(await p.locator('#video-player video').count()), 'resta un <video>');
            vero(await p.getAttribute('#video-player iframe', 'src') === F.WEBTV + '/player/napoli', 'src dell\'iframe: ' + await p.getAttribute('#video-player iframe', 'src'));
            for (const sel of ['#btn-play', '#btn-muto', '#btn-attiva-audio', '#indicatore-live', '#btn-live', '#sel-qualita', '#barra-dvr']) {
                vero(!(await visibile(p, sel)), sel + ' si vede con il player incorporato');
            }
            vero(await visibile(p, '#btn-schermo-intero'), 'manca lo schermo intero');
            vero(/comandi del player/.test(await p.textContent('#riga-comandi-aiuto')), 'indicazione: ' + await p.textContent('#riga-comandi-aiuto'));
            await p.click('#btn-schermo-intero');
            await p.waitForSelector('#riquadro-video[data-intero="1"]', { timeout: 5000 });
            await p.click('#btn-schermo-intero');
            await p.waitForSelector('#riquadro-video[data-intero="0"]', { timeout: 5000 });
            await foto(p, 'incorporato-computer');
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
            await foto(p, 'non-disponibile-computer');
            await cambiaVideo(LIVE, RISERVA);
            await videoVa(p, 25000, 'il video di nuovo');
            vero(!(await visibile(p, '#schermo-video')), 'la schermata d\'errore resta');
        });

        console.log('\nComputer: il flusso pubblico di Shaka Player (HLS e DASH, un\'ora di finestra)');
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

        console.log('\nComputer: il link firmato (firma nginx, dal servizio)');
        await prova('link firmato: la pagina chiede il link al servizio (link-video) e la firma arriva su playlist e segmenti; la chiave non esce', async () => {
            const da = Date.now();
            await g({ azione: 'evento-salva', evento: Object.assign({}, EVENTO_DATI, { nuovo: false, firma: { schema: 'nginx', segreto: SEGRETO, durataOre: 6 } }) });
            const pb = await pubblico();
            vero(pb.videoFirmato === true && pb.videoId === LIVE, 'documento pubblico: ' + JSON.stringify({ firmato: pb.videoFirmato, id: pb.videoId }));
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

        /* =================== TELEFONO =================== */
        console.log('\nTelefono 390x844 (iPhone, senza API di schermo intero)');
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
        });

        await prova('telefono: il ripiego incorporato, con lo schermo intero', async () => {
            await cambiaVideo(INCORPORATO, '');
            await t.frameLocator('#video-player iframe').locator('#player-webtv').waitFor({ timeout: 15000 });
            await aspetta(async () => await t.getAttribute('#riquadro-video', 'data-comandi') === 'ridotti', 10000, 'comandi ridotti');
            await dentroLoSchermo('incorporato');
            await foto(t, 'incorporato-telefono');
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
