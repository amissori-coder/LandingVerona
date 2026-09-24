/* ============================================================
   PROVE - la pagina della diretta (/diretta/) nel browser vero
   ------------------------------------------------------------
       node diretta/prove/pagina.prova.js

   Da sola avvia (e alla fine ferma) gli emulatori Firebase e il sito
   in locale, sulle porte di questa prova:
       emulatori  firestore 8480, auth 9480
       sito       http://127.0.0.1:8490/   (server-locale.js --api 3480)
   Se sono gia' accesi (per esempio lanciati a mano), li usa e non li
   tocca.

   Il servizio di accesso lo fa la prova stessa: le chiamate a
   http://127.0.0.1:3480/api/diretta-accesso vengono intercettate
   (context.route) e la risposta 'entra' porta un gettone VERO creato
   con firebase-admin sull'emulatore. Tutto il resto e' vero: le
   regole di Firestore, l'SDK di Firebase da gstatic, l'ascolto
   dell'evento, le scritture di presenza, la CSP della pagina.
   YouTube e' il finto YouTube (finto-youtube.js): la rete di prova
   non lo raggiunge.

   Chromium, due dispositivi: computer 1366x900 e "iPhone" 390x844
   (isMobile, hasTouch, user agent di Safari su iPhone, e SENZA le API
   di schermo intero, come su iPhone: si prova lo pseudo schermo intero).

   COSA DIMOSTRA. Accesso scrivendo " Mario Rossi " (ripulito in
   mariorossi); vista di attesa con conto alla rovescia e programma; la
   regia (qui firebase-admin) manda in onda e la pagina passa da sola
   alla diretta, con il player sul dominio youtube-nocookie e i
   parametri del contratto; "Attiva l'audio"; play/pausa (in pausa il
   video e' nascosto e al suo posto c'e' la nostra schermata); tasti
   spazio, F, M e frecce; schermo intero (anche finto, su iPhone);
   cambio del video durante la diretta senza ricaricare; video in
   errore; connessione persa e ritrovata; la presenza scritta dopo il
   ritardo casuale; ricarica senza nuovo accesso; pausa dell'evento con
   l'avviso a tutti; fine; ritorno in onda dopo la fine; Esci con
   conferma; password dimenticata; reimpostazione della password (anche
   con un collegamento scaduto). E nessuna violazione della CSP.
   Screenshot in risultati/screenshot-pagina/. Esce con 1 se qualcosa
   e' rosso.
   ============================================================ */
'use strict';
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const PORTE = { firestore: 8480, auth: 9480, api: 3480, statico: 8490 };
const PROGETTO = 'demo-ngb-eventi';
const EVENTO = 'napoli-2026';
const SITO = 'http://127.0.0.1:' + PORTE.statico;
const API = 'http://127.0.0.1:' + PORTE.api + '/api';
const DOMINIO_TECNICO = 'utenti.diretta.nextgenerationbusiness.it';
const FOTO = path.resolve(__dirname, 'risultati/screenshot-pagina');
fs.mkdirSync(FOTO, { recursive: true });

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:' + PORTE.firestore;
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:' + PORTE.auth;
const admin = require(path.resolve(__dirname, '../../email-service/node_modules/firebase-admin'));
const { chromium } = require('playwright');
const { preparaContesto } = require('./rete-prove');

const pausa = ms => new Promise(r => setTimeout(r, ms));

/* ---------- esito delle prove ---------- */
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
        console.log('ROSSO ' + descrizione + '\n       ' + String((e && e.message) || e).split('\n').slice(0, 3).join('\n       '));
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
        await pausa(100);
    }
}

/* ---------- processi di appoggio (emulatori e sito) ---------- */
const figli = [];
function portaOccupata(porta) {
    return new Promise(risolvi => {
        const s = net.connect({ host: '127.0.0.1', port: porta });
        s.once('connect', () => { s.destroy(); risolvi(true); });
        s.once('error', () => risolvi(false));
    });
}
function avvia(nome, argomenti, rigaPronto, tempoMax, comando, cartella) {
    return new Promise((risolvi, rifiuta) => {
        const f = spawn(comando || process.execPath, argomenti, {
            cwd: cartella || __dirname, stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { FORCE_COLOR: '0' })
        });
        figli.push({ nome, f });
        let uscita = '';
        const timer = setTimeout(() => rifiuta(new Error(nome + ' non parte:\n' + uscita.slice(-2000))), tempoMax);
        const leggi = d => {
            uscita += d.toString();
            if (uscita.indexOf(rigaPronto) >= 0) { clearTimeout(timer); risolvi(f); }
        };
        f.stdout.on('data', leggi);
        f.stderr.on('data', leggi);
        f.on('exit', c => { clearTimeout(timer); rifiuta(new Error(nome + ' uscito (' + c + '):\n' + uscita.slice(-2000))); });
    });
}
async function portaLibera(da, escluse) {
    for (let p = da; p < da + 400; p++) {
        if (escluse.indexOf(p) < 0 && !(await portaOccupata(p))) return p;
    }
    throw new Error('nessuna porta libera dopo ' + da);
}
/* Gli emulatori, con le regole VERE della diretta. Prima con avvia-emulatori.js
   (il modo comune a tutte le prove); se una delle porte "di servizio" che quel
   file ricava da quella di Firestore (hub 4400+scarto, log 4500+scarto) e' gia'
   presa da un'altra prova che gira insieme (succede: il log di 8480 e l'hub di
   8580 sono entrambi 4900), si parte con le stesse regole e porte di servizio
   libere scelte qui. Le porte di Firestore e Auth restano quelle della prova. */
async function avviaEmulatori() {
    try {
        await avvia('emulatori', ['avvia-emulatori.js', '--firestore', String(PORTE.firestore), '--auth', String(PORTE.auth)], 'EMULATORI PRONTI', 120000);
        return;
    } catch (e) {
        if (!/port taken|could not start/i.test(String(e.message))) throw e;
        console.log('   (porte di servizio degli emulatori occupate da un\'altra prova: se ne scelgono di libere)');
    }
    const cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'ngb-emulatori-pagina-'));
    fs.copyFileSync(path.resolve(__dirname, '../firebase/firestore.rules'), path.join(cartella, 'firestore.rules'));
    const hub = await portaLibera(4481, []);
    const log = await portaLibera(hub + 1, [hub]);
    const ws = await portaLibera(9551, [hub, log]);
    fs.writeFileSync(path.join(cartella, 'firebase.json'), JSON.stringify({
        firestore: { rules: 'firestore.rules' },
        emulators: {
            auth: { port: PORTE.auth, host: '127.0.0.1' },
            firestore: { port: PORTE.firestore, host: '127.0.0.1', websocketPort: ws },
            hub: { port: hub, host: '127.0.0.1' },
            logging: { port: log, host: '127.0.0.1' },
            ui: { enabled: false }
        }
    }));
    await avvia('emulatori (porte di riserva)', ['emulators:start', '--only', 'auth,firestore', '--project', PROGETTO],
        'All emulators ready', 120000, path.resolve(__dirname, 'node_modules/.bin/firebase'), cartella);
}
async function fermaFigli() {
    for (const { f } of figli.reverse()) {
        if (f.exitCode != null) continue;
        await new Promise(risolvi => {
            const t = setTimeout(() => { try { f.kill('SIGKILL'); } catch (e) { /* gia' fermo */ } risolvi(); }, 15000);
            f.once('exit', () => { clearTimeout(t); risolvi(); });
            try { f.kill('SIGINT'); } catch (e) { clearTimeout(t); risolvi(); }
        });
    }
}

/* ---------- dati dell'evento ---------- */
const PROGRAMMA = [
    ['09.00', 'Registrazione e welcome coffee'], ['09.30', 'Apertura ufficiale dei lavori'], ['09.50', 'Keynote introduttivo'],
    ['10.00', 'Il futuro della Piccola Industria italiana'], ['10.30', 'Adeguati assetti e continuità aziendale'],
    ['11.10', 'Modello 231 e Tax Control Framework'], ['11.50', 'Sostenibilità e fattori ESG'], ['12.40', 'Finanza agevolata'],
    ['13.30', 'Lunch buffet e networking'], ['14.30', 'Rating di Legalità'], ['15.00', 'Banche'],
    ['15.50', 'Invitalia e MCC · Bagnoli e America\'s Cup 2027'], ['16.40', 'Sessione Questions and Answers'], ['17.10', 'Chiusura dei lavori']
].map(([ora, titolo]) => ({ ora, titolo }));
const INIZIO = Date.parse('2026-10-02T09:00:00+02:00');
const FINE = Date.parse('2026-10-02T17:30:00+02:00');

function eventoIniziale(T) {
    return {
        titolo: 'Next Generation Business 2026 · Napoli',
        luogo: 'Napoli · Hotel Eurostars Excelsior',
        data: '2026-10-02', oraInizio: '09:00', oraFine: '17:30',
        inizio: T.fromMillis(INIZIO), fine: T.fromMillis(FINE),
        videoId: '', videoAggiornato: T.now(),
        stato: 'programmato', statoAggiornato: T.now(),
        programma: PROGRAMMA,
        paginaEvento: '/napoli_ottobre_2026/',
        unSoloDispositivo: false,
        promemoria: { giornoPrima: false, oraPrima: false },
        avviso: '',
        creato: T.now(), aggiornato: T.now()
    };
}

(async () => {
    let browser = null;
    try {
        /* ---------- 1. emulatori e sito ---------- */
        if (!(await portaOccupata(PORTE.firestore)) || !(await portaOccupata(PORTE.auth))) {
            console.log('avvio degli emulatori (firestore ' + PORTE.firestore + ', auth ' + PORTE.auth + ')...');
            await avviaEmulatori();
        }
        if (!(await portaOccupata(PORTE.statico))) {
            await avvia('sito', ['server-locale.js', '--api', String(PORTE.api), '--statico', String(PORTE.statico),
                '--firestore', String(PORTE.firestore), '--auth', String(PORTE.auth)], 'SERVER LOCALE PRONTO', 30000);
        }

        /* ---------- 2. dati nell'emulatore ---------- */
        await fetch('http://127.0.0.1:' + PORTE.firestore + '/emulator/v1/projects/' + PROGETTO + '/databases/(default)/documents', { method: 'DELETE' });
        await fetch('http://127.0.0.1:' + PORTE.auth + '/emulator/v1/projects/' + PROGETTO + '/accounts', { method: 'DELETE' });
        const app = admin.initializeApp({ projectId: PROGETTO }, 'prova-pagina');
        const db = app.firestore();
        const auth = app.auth();
        const T = admin.firestore.Timestamp;
        const evento = db.doc('eventi/' + EVENTO);

        const uid = 'p' + crypto.randomBytes(10).toString('hex');
        const emailTecnica = uid + '@' + DOMINIO_TECNICO;
        // la password della prova non si stampa mai
        const passwordValide = new Set([crypto.randomBytes(9).toString('base64').replace(/[^A-Za-z0-9]/g, 'x') + '7a']);
        const passwordIniziale = Array.from(passwordValide)[0];
        await auth.createUser({ uid, email: emailTecnica, password: passwordIniziale, displayName: 'Mario Rossi' });
        await auth.setCustomUserClaims(uid, { eventi: [EVENTO] });
        await db.doc('partecipanti/' + uid).set({
            uid, nomeUtente: 'mariorossi', nome: 'Mario', cognome: 'Rossi',
            email: 'mario.rossi@esempio.it', emailNorm: 'mario.rossi@esempio.it', azienda: 'Rossi Srl',
            idEvento: EVENTO, eventi: [EVENTO], stato: 'attivo', authCreato: true, ultimoAccesso: null,
            invii: { [EVENTO]: { stato: 'inviata', aggiornato: T.now(), tentativi: 1 } },
            creato: T.now(), aggiornato: T.now()
        });
        await db.doc('sessioni/' + uid).set({ stato: 'attivo', sessioneAttiva: null, aggiornato: T.now() });
        const uidGestore = 'gestore' + crypto.randomBytes(4).toString('hex');
        await auth.createUser({ uid: uidGestore, email: 'gestore@prova.it', emailVerified: true, password: passwordIniziale });
        await auth.setCustomUserClaims(uidGestore, { gestore: true });
        await db.doc('nomiUtente/mariorossi').set({ uid, base: 'mariorossi', creato: T.now() });
        await db.doc('eventiRiservati/' + EVENTO).set({ videoUrl: '', videoId: '', aggiornato: T.now() });
        await evento.set(eventoIniziale(T));

        /* ---------- 3. il finto servizio di accesso ---------- */
        const chiamate = [];              // [{azione, nomeUtente?, identificativo?}] (mai le password)
        const sessioniRilasciate = [];
        let errori = 0;
        async function servizio(route) {
            const req = route.request();
            const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, authorization', 'access-control-allow-methods': 'POST, OPTIONS' };
            if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
            const risposta = (stato, dati) => route.fulfill({ status: stato, headers: cors, contentType: 'application/json', body: JSON.stringify(dati) });
            let corpo = {};
            try { corpo = JSON.parse(req.postData() || '{}'); } catch (e) { corpo = {}; }
            chiamate.push({ azione: corpo.azione, nomeUtente: corpo.nomeUtente, identificativo: corpo.identificativo, conToken: !!req.headers().authorization });
            if (corpo.azione === 'entra') {
                /* Scorciatoia SOLO di questa prova per avere nella pagina una sessione da
                   gestore (i gestori veri entrano dalla gestione con email e password) */
                if (corpo.nomeUtente === 'gestoreprova' && passwordValide.has(corpo.password)) {
                    return risposta(200, { ok: true, token: await auth.createCustomToken(uidGestore), sessione: 'g1', idEvento: EVENTO, nome: '', cognome: '', nomeUtente: '' });
                }
                if (corpo.nomeUtente === 'mariorossi' && passwordValide.has(corpo.password)) {
                    errori = 0;
                    const sessione = crypto.randomBytes(12).toString('hex');
                    sessioniRilasciate.push(sessione);
                    const token = await auth.createCustomToken(uid);
                    return risposta(200, { ok: true, token, sessione, idEvento: EVENTO, nome: 'Mario', cognome: 'Rossi', nomeUtente: 'mariorossi' });
                }
                errori++;
                if (errori >= 5) return risposta(429, { ok: false, codice: 'attendi', attesaSecondi: 30, msg: 'Troppi tentativi.' });
                return risposta(401, { ok: false, codice: 'credenziali', msg: 'Nome utente o password non corretti.', rimasti: Math.max(0, 5 - errori) });
            }
            if (corpo.azione === 'password-dimenticata') {
                return risposta(200, { ok: true, msg: 'Se l\'account esiste, ti abbiamo scritto all\'indirizzo email con cui ti sei iscritto.' });
            }
            if (corpo.azione === 'aggiorna-permessi') return risposta(200, { ok: true, aggiornati: false });
            return risposta(400, { ok: false, codice: 'azione', msg: 'Azione sconosciuta' });
        }
        const quante = azione => chiamate.filter(c => c.azione === azione).length;

        /* ---------- 4. il browser ---------- */
        browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

        async function nuovoContesto(opzioni, senzaSchermoIntero) {
            const context = await browser.newContext(Object.assign({ locale: 'it-IT', timezoneId: 'Europe/Rome' }, opzioni));
            await preparaContesto(context, {});
            await context.route(API + '/diretta-accesso', servizio);
            await context.addInitScript(porte => {
                window.NGB_DIRETTA_PROVE = porte;
                // le violazioni della Content-Security-Policy della pagina
                if (window.top === window) {
                    window.__violazioniCsp = [];
                    document.addEventListener('securitypolicyviolation', e => {
                        window.__violazioniCsp.push(e.violatedDirective + ' ' + e.blockedURI + ' ' + (e.sourceFile || ''));
                    });
                }
            }, { firestore: PORTE.firestore, auth: PORTE.auth, api: API, ritardoPresenzaMs: 400, intervalloPresenzaMs: 1500 });
            if (senzaSchermoIntero) {
                // come su iPhone: Safari non manda a schermo intero un riquadro qualsiasi
                await context.addInitScript(() => {
                    const via = (o, k) => { try { Object.defineProperty(o, k, { value: undefined, configurable: true, writable: true }); } catch (e) { /* niente */ } };
                    via(Element.prototype, 'requestFullscreen');
                    via(Element.prototype, 'webkitRequestFullscreen');
                    try { Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => false, configurable: true }); } catch (e) { /* niente */ }
                    try { Object.defineProperty(Document.prototype, 'webkitFullscreenEnabled', { get: () => false, configurable: true }); } catch (e) { /* niente */ }
                });
            }
            const page = await context.newPage();
            page.__erroriPagina = [];
            page.on('pageerror', e => page.__erroriPagina.push(String(e && e.message || e)));
            return { context, page };
        }
        const vistaE = (page, v, ms) => page.waitForSelector('body[data-vista="' + v + '"]', { timeout: ms || 15000 });
        const visibile = (page, sel) => page.locator(sel).isVisible();
        const comandiDa = (page, da) => page.evaluate(n => (window.__fintoYT ? window.__fintoYT.comandi.slice(n) : []), da);
        const numComandi = page => page.evaluate(() => (window.__fintoYT ? window.__fintoYT.comandi.length : 0));
        const foto = (page, nome, intera) => page.screenshot({ path: path.join(FOTO, nome + '.png'), fullPage: !!intera });
        const statoIframe = page => page.evaluate(() => {
            const f = document.querySelector('#video-player iframe');
            return f ? getComputedStyle(f).visibility : 'assente';
        });

        /* =================== COMPUTER =================== */
        console.log('\nComputer 1366x900');
        const pc = await nuovoContesto({ viewport: { width: 1366, height: 900 } });
        const p = pc.page;
        await p.goto(SITO + '/diretta/?emulatori=1');

        await prova('senza accesso la pagina mostra la vista di accesso', async () => {
            await vistaE(p, 'accesso', 30000);
            vero(await visibile(p, '#form-accesso'), 'modulo di accesso non visibile');
            vero(!(await visibile(p, '#btn-esci')), 'Esci visibile senza accesso');
            await p.evaluate(() => document.fonts && document.fonts.ready);
            await foto(p, 'accesso-computer');
        });

        await prova('la pagina ha la CSP e il viewport per iPhone (viewport-fit=cover)', async () => {
            const csp = await p.getAttribute('meta[http-equiv="Content-Security-Policy"]', 'content');
            vero(/script-src 'self' https:\/\/www\.gstatic\.com/.test(csp) && /object-src 'none'/.test(csp), 'CSP mancante o diversa');
            const vp = await p.getAttribute('meta[name="viewport"]', 'content');
            vero(/viewport-fit=cover/.test(vp), 'viewport senza viewport-fit=cover');
            const inLinea = await p.evaluate(() => Array.from(document.scripts).filter(s => !s.src && s.type !== 'application/ld+json').length);
            vero(inLinea === 0, 'script in linea nella pagina: ' + inLinea);
        });

        await prova('un indirizzo email al posto del nome utente: avviso, nessuna chiamata', async () => {
            const prima = quante('entra');
            await p.fill('#campo-nome-utente', 'mario.rossi@esempio.it');
            await p.fill('#campo-password', 'qualcosa');
            await p.click('#btn-entra');
            await p.waitForFunction(() => /non l'indirizzo email/.test(document.getElementById('msg-accesso').textContent));
            vero(quante('entra') === prima, 'la chiamata e\' partita');
        });

        await prova('password sbagliata due volte: messaggio chiaro e il consiglio sul nome con il numero', async () => {
            await p.fill('#campo-nome-utente', 'mariorossi');
            await p.fill('#campo-password', 'sbagliata1');
            await p.click('#btn-entra');
            await p.waitForFunction(() => /non corretti/.test(document.getElementById('msg-accesso').textContent));
            await p.fill('#campo-password', 'sbagliata2');
            await p.click('#btn-entra');
            await p.waitForFunction(() => /può finire con un numero/.test(document.getElementById('msg-accesso').textContent));
        });

        await prova('accesso scrivendo " Mario Rossi ": ripulito in mariorossi, vista di attesa', async () => {
            await p.fill('#campo-nome-utente', ' Mario Rossi ');
            await p.waitForFunction(() => /mariorossi/.test(document.getElementById('aiuto-nome-utente').textContent));
            await p.fill('#campo-password', passwordIniziale);
            await p.click('#btn-entra');
            await vistaE(p, 'attesa', 20000);
            const ultima = chiamate.filter(c => c.azione === 'entra').pop();
            vero(ultima.nomeUtente === 'mariorossi', 'nome utente inviato: ' + ultima.nomeUtente);
            vero((await p.textContent('#nome-persona')).trim() === 'Mario Rossi', 'nome della persona: ' + await p.textContent('#nome-persona'));
            vero(/Napoli/.test(await p.textContent('#titolo-evento')), 'titolo evento: ' + await p.textContent('#titolo-evento'));
            vero(await visibile(p, '#btn-esci'), 'Esci non visibile');
            const sess = await p.evaluate(() => localStorage.getItem('ngbDirettaSessione'));
            vero(sess === sessioniRilasciate[sessioniRilasciate.length - 1], 'sessione non salvata');
        });

        await prova('attesa: conto alla rovescia che scorre, programma, data in ora italiana', async () => {
            const leggi = () => p.evaluate(() => ['conto-giorni', 'conto-ore', 'conto-minuti', 'conto-secondi'].map(id => document.getElementById(id).textContent));
            const a = await leggi();
            vero(a.every(x => /^\d{2}$/.test(x)), 'conto: ' + a.join(':'));
            const giorni = Math.floor((INIZIO - Date.now()) / 86400000);
            vero(Number(a[0]) === giorni, 'giorni ' + a[0] + ' invece di ' + giorni);
            await pausa(1300);
            const b = await leggi();
            vero(a.join() !== b.join(), 'il conto non scorre');
            vero((await p.locator('#programma li').count()) === PROGRAMMA.length, 'voci del programma');
            vero(/2 ottobre 2026.*9\.00.*17\.30.*ora italiana/.test(await p.textContent('#attesa-quando')), 'data: ' + await p.textContent('#attesa-quando'));
            vero(/inizia tra/.test(await p.textContent('#attesa-titolo')), 'titolo di attesa');
            vero(!(await visibile(p, '#stato-evento')) || /programma/i.test(await p.textContent('#stato-evento')), 'bollino in attesa');
            await foto(p, 'attesa-computer', true);
        });

        await prova('la regia manda in onda: la pagina passa da sola alla diretta', async () => {
            await evento.update({ stato: 'in_onda', videoId: 'aaaaaaaaaaa', statoAggiornato: T.now() });
            await vistaE(p, 'diretta', 15000);
            await p.waitForSelector('#video-player iframe[data-finto-youtube]', { timeout: 15000 });
            vero((await p.textContent('#stato-evento')).trim() === 'IN DIRETTA', 'bollino: ' + await p.textContent('#stato-evento'));
            vero(await p.getAttribute('#stato-evento', 'data-stato') === 'in_onda', 'bollino non rosso');
        });

        await prova('player YouTube: dominio nocookie e parametri del contratto', async () => {
            const o = await p.evaluate(() => {
                const x = window.__fintoYT.opzioni;
                return { host: x.host, videoId: x.videoId, pv: x.playerVars };
            });
            vero(o.host === 'https://www.youtube-nocookie.com', 'host ' + o.host);
            vero(o.videoId === 'aaaaaaaaaaa', 'videoId ' + o.videoId);
            const attesi = { autoplay: 1, mute: 1, controls: 0, rel: 0, modestbranding: 1, playsinline: 1, disablekb: 1, iv_load_policy: 3, fs: 0, cc_load_policy: 0, enablejsapi: 1, origin: SITO };
            for (const k of Object.keys(attesi)) vero(o.pv[k] === attesi[k], 'playerVars.' + k + ' = ' + o.pv[k]);
            vero(await visibile(p, '#btn-attiva-audio'), '"Attiva l\'audio" non visibile');
            vero(!(await visibile(p, '#sel-qualita')), 'il selettore della qualita\' si vede con YouTube');
            // "Attiva l'audio" NON sta sopra il video
            const v = await p.locator('#area-video').boundingBox();
            const b = await p.locator('#btn-attiva-audio').boundingBox();
            vero(b.y >= v.y + v.height - 1, 'il pulsante dell\'audio si sovrappone al video');
            await foto(p, 'diretta-computer');
        });

        await prova('"Attiva l\'audio": smuto, volume 100 e play nello stesso clic', async () => {
            const da = await numComandi(p);
            await p.click('#btn-attiva-audio');
            const c = (await comandiDa(p, da)).map(x => x.comando + (x.valore != null ? ':' + x.valore : ''));
            vero(c.slice(0, 3).join(',') === 'smuto,volume:100,play', 'comandi: ' + c.join(','));
            await p.waitForSelector('#btn-attiva-audio', { state: 'hidden' });
            vero(await p.getAttribute('#btn-muto', 'data-muto') === '0', 'il bottone del muto non si aggiorna');
            await pausa(900);
            vero(!(await visibile(p, '#suggerimento-audio')), 'suggerimento audio mostrato a torto');
        });

        await prova('pausa: il video si nasconde e al suo posto compare la nostra schermata', async () => {
            const da = await numComandi(p);
            await p.click('#btn-play');
            await p.waitForSelector('#schermo-pausa', { state: 'visible' });
            vero((await comandiDa(p, da)).some(x => x.comando === 'pausa'), 'comando pausa non arrivato');
            vero(await statoIframe(p) === 'hidden', 'il video resta visibile sotto la schermata');
            const a = await p.locator('#area-video').boundingBox();
            const s = await p.locator('#schermo-pausa').boundingBox();
            vero(Math.abs(a.x - s.x) < 1 && Math.abs(a.width - s.width) < 1 && Math.abs(a.height - s.height) < 1, 'la schermata non occupa il posto del video');
            await foto(p, 'pausa-computer');
            await p.click('#btn-riprendi');
            await p.waitForSelector('#schermo-pausa', { state: 'hidden' });
            vero(await statoIframe(p) === 'visible', 'il video non ricompare');
        });

        await prova('tastiera: spazio pausa/play, M muto, frecce volume', async () => {
            await p.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
            let da = await numComandi(p);
            await p.keyboard.press('Space');
            await p.waitForSelector('#schermo-pausa', { state: 'visible' });
            await p.keyboard.press('Space');
            await p.waitForSelector('#schermo-pausa', { state: 'hidden' });
            let c = (await comandiDa(p, da)).map(x => x.comando);
            vero(c.join(',') === 'pausa,play', 'spazio: ' + c.join(','));
            da = await numComandi(p);
            await p.keyboard.press('m');
            await p.keyboard.press('m');
            c = (await comandiDa(p, da)).map(x => x.comando);
            vero(c.join(',') === 'muto,smuto', 'M: ' + c.join(','));
            da = await numComandi(p);
            await p.keyboard.press('ArrowDown');
            await p.keyboard.press('ArrowDown');
            await p.keyboard.press('ArrowUp');
            c = (await comandiDa(p, da)).map(x => x.comando + ':' + x.valore);
            vero(c.join(',') === 'volume:90,volume:80,volume:90', 'frecce: ' + c.join(','));
            vero(await p.inputValue('#volume') === '90', 'cursore del volume: ' + await p.inputValue('#volume'));
        });

        await prova('schermo intero sul nostro riquadro (tasto F e pulsante)', async () => {
            await p.keyboard.press('f');
            await p.waitForSelector('#riquadro-video[data-intero="1"]');
            const dim = await p.locator('#riquadro-video').boundingBox();
            vero(dim.width >= 1300 && dim.height >= 850, 'riquadro non a schermo intero: ' + JSON.stringify(dim));
            vero(await visibile(p, '#barra-comandi'), 'i nostri comandi non ci sono a schermo intero');
            await p.keyboard.press('f');
            await p.waitForSelector('#riquadro-video[data-intero="0"]');
            await p.click('#btn-schermo-intero');
            await p.waitForSelector('#riquadro-video[data-intero="1"]');
            await p.click('#btn-schermo-intero');
            await p.waitForSelector('#riquadro-video[data-intero="0"]');
        });

        await prova('"Torna in diretta" salta al momento attuale', async () => {
            const da = await numComandi(p);
            await p.click('#btn-live');
            const c = (await comandiDa(p, da)).map(x => x.comando);
            vero(c[0] === 'seek' && c.indexOf('play') > 0, 'comandi: ' + c.join(','));
        });

        await prova('la presenza viene scritta dopo il ritardo casuale (regole vere)', async () => {
            const snap = await aspetta(async () => {
                const s = await db.doc('presenze/' + EVENTO + '_' + uid).get();
                return s.exists ? s : null;
            }, 15000, 'documento di presenza');
            const d = snap.data();
            vero(d.uid === uid && d.idEvento === EVENTO, 'uid/evento');
            vero(d.collegamenti === 1 && d.secondi === 0, 'collegamenti ' + d.collegamenti + ', secondi ' + d.secondi);
            vero(d.sessione === sessioniRilasciate[sessioniRilasciate.length - 1], 'sessione diversa da quella dell\'accesso');
            vero(d.primo && d.ultimo && typeof d.primo.toMillis === 'function', 'orari del server');
            await pausa(4000);
            const d2 = (await db.doc('presenze/' + EVENTO + '_' + uid).get()).data();
            vero(d2.ultimo.toMillis() === d.ultimo.toMillis(), 'un secondo segnale prima di 55 s');
        });

        await prova('la regia cambia il video: il player carica il nuovo id senza ricaricare la pagina', async () => {
            await p.evaluate(() => { window.__segnoPagina = 'ancora-qui'; });
            const giocatori = await p.evaluate(() => window.__fintoYT.giocatori.length);
            await evento.update({ videoId: 'bbbbbbbbbbb', videoAggiornato: T.now() });
            await p.waitForFunction(() => window.__fintoYT.comandi.some(c => c.comando === 'carica' && c.valore === 'bbbbbbbbbbb'), null, { timeout: 10000 });
            vero(await p.evaluate(() => window.__segnoPagina) === 'ancora-qui', 'la pagina si e\' ricaricata');
            vero(await p.evaluate(() => window.__fintoYT.giocatori.length) === giocatori, 'e\' stato creato un player nuovo');
            vero(await statoIframe(p) === 'visible', 'video non visibile dopo il cambio');
        });

        await prova('video in errore: "Video non disponibile" al posto del video, poi un video buono torna', async () => {
            await evento.update({ videoId: 'errore00000', videoAggiornato: T.now() });
            await p.waitForSelector('#schermo-video', { state: 'visible', timeout: 10000 });
            vero(/Video non disponibile/.test(await p.textContent('#schermo-video-titolo')), 'testo: ' + await p.textContent('#schermo-video-titolo'));
            vero(await statoIframe(p) === 'hidden', 'il video in errore resta visibile');
            await foto(p, 'errore-video-computer');
            await evento.update({ videoId: 'ccccccccccc', videoAggiornato: T.now() });
            await p.waitForFunction(() => window.__fintoYT.comandi.some(c => c.comando === 'carica' && c.valore === 'ccccccccccc'), null, { timeout: 10000 });
            await p.waitForSelector('#schermo-video', { state: 'hidden', timeout: 10000 });
        });

        await prova('connessione persa: avviso dopo qualche secondo, poi sparisce al ritorno', async () => {
            await pc.context.setOffline(true);
            const t0 = Date.now();
            await p.waitForSelector('#avviso-connessione', { state: 'visible', timeout: 15000 });
            vero(Date.now() - t0 >= 4000, 'avviso mostrato subito (lampeggi)');
            vero(/Connessione persa/.test(await p.textContent('#avviso-connessione')), 'testo dell\'avviso');
            await foto(p, 'connessione-persa-computer');
            await pc.context.setOffline(false);
            await p.waitForSelector('#avviso-connessione', { state: 'hidden', timeout: 30000 });
        });

        await prova('ricarica della pagina: nessun nuovo accesso, di nuovo in diretta', async () => {
            const prima = quante('entra');
            await p.reload();
            await vistaE(p, 'diretta', 30000);
            await p.waitForSelector('#video-player iframe[data-finto-youtube]', { timeout: 15000 });
            vero(quante('entra') === prima, 'la pagina ha rifatto l\'accesso');
            vero(await p.evaluate(() => window.__fintoYT.opzioni.videoId) === 'ccccccccccc', 'video dopo la ricarica');
        });

        await prova('pausa dell\'evento con avviso a tutti: vista pausa con l\'orario di ripresa', async () => {
            await evento.update({ stato: 'pausa', videoId: '', ripresa: '14:30', avviso: 'Problema tecnico: torniamo tra 5 minuti.' });
            await vistaE(p, 'pausa', 10000);
            vero(/si riprende alle 14\.30/.test(await p.textContent('#pausa-titolo')), 'titolo: ' + await p.textContent('#pausa-titolo'));
            vero(await visibile(p, '#avviso-evento'), 'avviso a tutti non visibile');
            vero(/Problema tecnico/.test(await p.textContent('#avviso-evento')), 'testo dell\'avviso');
            vero(await p.locator('#video-player iframe').count() === 0, 'il player resta vivo in pausa');
            await foto(p, 'pausa-evento-computer');
            await evento.update({ stato: 'in_onda', videoId: 'ddddddddddd', avviso: '' });
            await vistaE(p, 'diretta', 10000);
            await p.waitForSelector('#video-player iframe[data-finto-youtube]', { timeout: 10000 });
            vero(!(await visibile(p, '#avviso-evento')), 'avviso non tolto');
        });

        await prova('stato terminato: vista di fine, poi di nuovo in onda riparte da sola', async () => {
            await evento.update({ stato: 'terminato', videoId: '', statoAggiornato: T.now() });
            await vistaE(p, 'fine', 10000);
            vero(await p.getAttribute('#fine-link-evento', 'href') === '/napoli_ottobre_2026/', 'link alla pagina dell\'evento');
            vero(await p.locator('#video-player iframe').count() === 0, 'il player resta vivo a fine diretta');
            await foto(p, 'fine-computer');
            await evento.update({ stato: 'in_onda', videoId: 'eeeeeeeeeee', statoAggiornato: T.now() });
            await vistaE(p, 'diretta', 10000);
            await p.waitForFunction(() => window.__fintoYT.opzioni && window.__fintoYT.opzioni.videoId === 'eeeeeeeeeee', null, { timeout: 10000 });
        });

        await prova('Esci chiede conferma e torna alla vista di accesso', async () => {
            await p.click('#btn-esci');
            await p.waitForSelector('#dialogo-conferma', { state: 'visible' });
            await p.click('#btn-conferma-no');
            await p.waitForSelector('#dialogo-conferma', { state: 'hidden' });
            vero(await p.getAttribute('body', 'data-vista') === 'diretta', 'uscito senza conferma');
            await p.click('#btn-esci');
            await p.click('#btn-conferma-si');
            await vistaE(p, 'accesso', 10000);
            vero(await p.evaluate(() => localStorage.getItem('ngbDirettaSessione')) === null, 'sessione non tolta');
            vero(await p.inputValue('#campo-nome-utente') === 'mariorossi', 'nome utente non riproposto');
            vero(await p.locator('#video-player iframe').count() === 0, 'il player resta vivo dopo l\'uscita');
            vero(!(await visibile(p, '#btn-esci')), 'Esci ancora visibile');
        });

        await prova('password dimenticata: stessa risposta sempre, niente pagina nuova', async () => {
            await p.click('#link-dimenticata');
            await vistaE(p, 'dimenticata', 5000);
            await p.fill('#campo-identificativo', 'mariorossi');
            await p.click('#btn-invia-reset');
            await p.waitForFunction(() => /Se l'account esiste/.test(document.getElementById('msg-dimenticata').textContent), null, { timeout: 10000 });
            const c = chiamate.filter(x => x.azione === 'password-dimenticata').pop();
            vero(c && c.identificativo === 'mariorossi', 'identificativo inviato');
            await foto(p, 'dimenticata-computer');
            await p.click('#link-torna-accesso');
            await vistaE(p, 'accesso', 5000);
            await p.goto(SITO + '/diretta/?dimenticata=1');
            await vistaE(p, 'dimenticata', 20000);
        });

        await prova('reimpostazione: collegamento scaduto -> "Richiedi un nuovo collegamento"', async () => {
            await p.goto(SITO + '/diretta/reimposta.html?oobCode=codice-inventato&u=mariorossi');
            await p.waitForSelector('#link-nuovo-collegamento', { state: 'visible', timeout: 20000 });
            vero(await p.getAttribute('#link-nuovo-collegamento', 'href') === '/diretta/?dimenticata=1', 'link del nuovo collegamento');
            vero(/scaduto o è già stato usato/.test(await p.textContent('#reimposta-sottotitolo')), 'testo: ' + await p.textContent('#reimposta-sottotitolo'));
        });

        await prova('reimpostazione: nuova password salvata, accesso automatico e poi la diretta', async () => {
            const link = await auth.generatePasswordResetLink(emailTecnica);
            const oob = new URL(link).searchParams.get('oobCode');
            await p.goto(SITO + '/diretta/reimposta.html?oobCode=' + encodeURIComponent(oob) + '&u=Mario%20Rossi');
            await p.waitForSelector('#form-reimposta', { state: 'visible', timeout: 20000 });
            vero(await p.inputValue('#nome-utente-reset') === 'mariorossi', 'nome utente mostrato: ' + await p.inputValue('#nome-utente-reset'));
            await p.fill('#campo-nuova', 'corta1');
            await p.fill('#campo-ripeti', 'corta1');
            await p.click('#btn-salva-password');
            await p.waitForFunction(() => /almeno 8 caratteri/.test(document.getElementById('msg-reimposta').textContent));
            await foto(p, 'reimposta-computer');
            const nuova = 'Nuova' + crypto.randomBytes(4).toString('hex') + '9';
            passwordValide.add(nuova);
            await p.fill('#campo-nuova', nuova);
            await p.fill('#campo-ripeti', nuova);
            await p.click('#btn-salva-password');
            await p.waitForURL(u => /\/diretta\/$/.test(new URL(u).pathname) && !/reimposta/.test(u), { timeout: 20000 });
            await vistaE(p, 'diretta', 30000);
            // la password vale davvero (emulatore di Auth)
            const r = await fetch('http://127.0.0.1:' + PORTE.auth + '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=finta', {
                method: 'POST', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ email: emailTecnica, password: nuova, returnSecureToken: true })
            });
            vero(r.ok, 'la nuova password non funziona');
        });

        await prova('nessuna violazione della Content-Security-Policy e nessun errore nella pagina', async () => {
            const v = await p.evaluate(() => window.__violazioniCsp || []);
            vero(v.length === 0, 'violazioni: ' + v.join(' | '));
            vero(p.__erroriPagina.length === 0, 'errori: ' + p.__erroriPagina.join(' | '));
        });
        await pc.context.close();

        /* =================== CASI PARTICOLARI =================== */
        console.log('\nCasi particolari (gestore, un solo dispositivo, account disattivato)');
        const cp = await nuovoContesto({ viewport: { width: 1366, height: 900 } });
        const q = cp.page;
        const entraCome = async (nome, password) => {
            await vistaE(q, 'accesso', 30000);
            await q.fill('#campo-nome-utente', nome);
            await q.fill('#campo-password', password);
            await q.click('#btn-entra');
        };
        const esciDa = async pagina => {
            await pagina.click('#btn-esci');
            await pagina.click('#btn-conferma-si');
            await vistaE(pagina, 'accesso', 10000);
        };
        await q.goto(SITO + '/diretta/?emulatori=1');

        await prova('gestore: vista con il collegamento alla gestione, poi anteprima senza presenze', async () => {
            await entraCome('gestoreprova', passwordIniziale);
            await vistaE(q, 'gestore', 20000);
            vero((await q.textContent('#nome-persona')).trim() === 'gestore@prova.it', 'nome nella testata');
            await q.goto(SITO + '/diretta/?anteprima=' + EVENTO);
            await vistaE(q, 'diretta', 20000);
            await q.waitForSelector('#video-player iframe[data-finto-youtube]', { timeout: 15000 });
            vero(await visibile(q, '#avviso-anteprima'), 'avviso di anteprima non visibile');
            vero(/Nessuna presenza registrata/.test(await q.textContent('#avviso-anteprima')), 'testo dell\'anteprima');
            await foto(q, 'anteprima-gestore-computer');
            await pausa(3000);
            vero(!(await db.doc('presenze/' + EVENTO + '_' + uidGestore).get()).exists, 'l\'anteprima ha scritto una presenza');
            await esciDa(q);
        });

        await prova('un solo dispositivo: la sessione e\' di un altro dispositivo -> messaggio e uscita', async () => {
            await evento.update({ unSoloDispositivo: true });
            await db.doc('sessioni/' + uid).update({ sessioneAttiva: 'sessione-di-un-altro-dispositivo' });
            await entraCome('mariorossi', passwordIniziale);
            await vistaE(q, 'messaggio', 20000);
            vero(/altro dispositivo/.test(await q.textContent('#messaggio-titolo')), 'titolo: ' + await q.textContent('#messaggio-titolo'));
            vero(/Accedi di nuovo qui/.test(await q.textContent('#btn-messaggio-azione')), 'bottone');
            vero(await q.locator('#video-player iframe').count() === 0, 'il video resta acceso');
            vero(!(await visibile(q, '#btn-esci')), 'ancora collegato');
            await foto(q, 'altro-dispositivo-computer');
            await q.click('#btn-messaggio-azione');
            await vistaE(q, 'accesso', 5000);
            await evento.update({ unSoloDispositivo: false });
            await db.doc('sessioni/' + uid).update({ sessioneAttiva: null });
        });

        await prova('account disattivato: messaggio chiaro, niente diretta', async () => {
            await db.doc('partecipanti/' + uid).update({ stato: 'disattivato' });
            await db.doc('sessioni/' + uid).update({ stato: 'disattivato' });
            await entraCome('mariorossi', passwordIniziale);
            await vistaE(q, 'messaggio', 20000);
            vero(/disattivato/.test(await q.textContent('#messaggio-titolo')), 'titolo: ' + await q.textContent('#messaggio-titolo'));
            vero(/Serve aiuto\? Scrivi a/.test(await q.textContent('#vista-messaggio')), 'manca l\'assistenza');
            await db.doc('partecipanti/' + uid).update({ stato: 'attivo' });
            await db.doc('sessioni/' + uid).update({ stato: 'attivo' });
            const v = await q.evaluate(() => window.__violazioniCsp || []);
            vero(v.length === 0, 'violazioni CSP: ' + v.join(' | '));
            vero(q.__erroriPagina.length === 0, 'errori: ' + q.__erroriPagina.join(' | '));
        });
        await cp.context.close();

        /* =================== TELEFONO (iPhone) =================== */
        console.log('\nTelefono 390x844 (iPhone, senza API di schermo intero)');
        await evento.set(eventoIniziale(T));
        const tel = await nuovoContesto({
            viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
        }, true);
        const t = tel.page;
        await t.goto(SITO + '/diretta/?emulatori=1&u=mariorossi');

        await prova('telefono: accesso con il nome utente dal link dell\'email', async () => {
            await vistaE(t, 'accesso', 30000);
            vero(await t.inputValue('#campo-nome-utente') === 'mariorossi', 'nome utente dal link');
            const larghezza = await t.evaluate(() => document.documentElement.scrollWidth);
            vero(larghezza <= 390, 'la pagina scorre in orizzontale: ' + larghezza);
            const corpo = await t.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
            vero(corpo >= 18, 'testo base ' + corpo + ' px');
            const h = (await t.locator('#btn-entra').boundingBox()).height;
            vero(h >= 48, 'pulsante Entra alto ' + h);
            await t.evaluate(() => document.fonts && document.fonts.ready);
            await foto(t, 'accesso-telefono', true);
            await t.fill('#campo-password', passwordIniziale);
            await t.tap('#btn-entra');
            await vistaE(t, 'attesa', 20000);
            await foto(t, 'attesa-telefono', true);
        });

        await prova('telefono: in onda, niente cursore del volume su iPhone, "Attiva l\'audio" grande', async () => {
            await evento.update({ stato: 'in_onda', videoId: 'fffffffffff' });
            await vistaE(t, 'diretta', 15000);
            await t.waitForSelector('#video-player iframe[data-finto-youtube]', { timeout: 15000 });
            vero(!(await visibile(t, '#volume')), 'cursore del volume visibile su iPhone');
            vero(await visibile(t, '#btn-muto'), 'manca il bottone del muto');
            const b = await t.locator('#btn-attiva-audio').boundingBox();
            vero(b.height >= 48 && b.width >= 300, 'pulsante audio piccolo: ' + JSON.stringify(b));
            const larghezza = await t.evaluate(() => document.documentElement.scrollWidth);
            vero(larghezza <= 390, 'la pagina scorre in orizzontale: ' + larghezza);
            await foto(t, 'diretta-telefono');
            await t.tap('#btn-attiva-audio');
            await t.waitForSelector('#btn-attiva-audio', { state: 'hidden' });
        });

        await prova('telefono: pseudo schermo intero senza requestFullscreen (iPhone)', async () => {
            vero(await t.evaluate(() => typeof Element.prototype.requestFullscreen) === 'undefined', 'API non tolte');
            await t.tap('#btn-schermo-intero');
            await t.waitForSelector('#riquadro-video[data-intero="1"]');
            vero(await t.evaluate(() => document.documentElement.classList.contains('schermo-intero-finto')), 'classe mancante su html');
            const r = await t.locator('#riquadro-video').boundingBox();
            vero(r.x === 0 && r.y === 0 && Math.round(r.width) === 390 && Math.round(r.height) === 844, 'riquadro ' + JSON.stringify(r));
            vero(await visibile(t, '#barra-comandi'), 'comandi non visibili');
            await foto(t, 'diretta-schermo-intero-telefono');
            await t.tap('#btn-schermo-intero');
            await t.waitForSelector('#riquadro-video[data-intero="0"]');
            vero(!(await t.evaluate(() => document.documentElement.classList.contains('schermo-intero-finto'))), 'classe rimasta');
        });

        await prova('telefono: pausa con la nostra schermata', async () => {
            await t.tap('#btn-play');
            await t.waitForSelector('#schermo-pausa', { state: 'visible' });
            vero(await statoIframe(t) === 'hidden', 'video visibile in pausa');
            await foto(t, 'pausa-telefono');
            await t.tap('#btn-riprendi');
            await t.waitForSelector('#schermo-pausa', { state: 'hidden' });
        });

        await prova('telefono: fine della diretta', async () => {
            await evento.update({ stato: 'terminato', videoId: '' });
            await vistaE(t, 'fine', 10000);
            await foto(t, 'fine-telefono', true);
            const v = await t.evaluate(() => window.__violazioniCsp || []);
            vero(v.length === 0, 'violazioni CSP: ' + v.join(' | '));
            vero(t.__erroriPagina.length === 0, 'errori: ' + t.__erroriPagina.join(' | '));
        });
        await tel.context.close();

        /* =================== TABLET (solo foto) =================== */
        await prova('tablet 820x1180: diretta', async () => {
            await evento.update({ stato: 'in_onda', videoId: 'ggggggggggg' });
            const tab = await nuovoContesto({ viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
            await tab.page.goto(SITO + '/diretta/?emulatori=1');
            await vistaE(tab.page, 'accesso', 30000);
            await tab.page.fill('#campo-nome-utente', 'mariorossi');
            await tab.page.fill('#campo-password', passwordIniziale);
            await tab.page.tap('#btn-entra');
            await vistaE(tab.page, 'diretta', 20000);
            await tab.page.waitForSelector('#video-player iframe[data-finto-youtube]', { timeout: 15000 });
            const larghezza = await tab.page.evaluate(() => document.documentElement.scrollWidth);
            vero(larghezza <= 820, 'la pagina scorre in orizzontale: ' + larghezza);
            await foto(tab.page, 'diretta-tablet', true);
            await tab.context.close();
        });

        await app.delete();
    } catch (e) {
        rossi++;
        console.log('ROSSO (interruzione) ' + String((e && e.stack) || e));
    } finally {
        if (browser) await browser.close().catch(() => {});
        await fermaFigli();
    }
    console.log('\n' + verdi + ' verdi, ' + rossi + ' rossi' + (rossiElenco.length ? ':\n - ' + rossiElenco.join('\n - ') : ''));
    console.log('Screenshot in ' + path.relative(process.cwd(), FOTO));
    process.exit(rossi ? 1 : 0);
})();
