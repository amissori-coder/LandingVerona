/* ============================================================
   PROVE - dall'inizio alla fine, con tutto vero (tranne Azoto)
   ------------------------------------------------------------
       node diretta/prove/e2e.prova.js

   Le altre prove guardano un pezzo alla volta, e fingono gli altri.
   Questa li mette insieme, come sara' la settimana dell'evento:
   funzioni VERE del servizio (server-locale.js), regole VERE di
   Firestore, emulatori di Firebase, pagine VERE del sito, posta finta
   (una riga JSON per email, in risultati/posta-e2e.jsonl, da cui la
   prova legge i collegamenti e le credenziali come li leggerebbe una
   persona). Il video e' quello della modalita' predefinita, il PLAYER
   DI AZOTO in un iframe: qui il player finto di flusso-prova.js
   (instradaAzoto) su https://cdn.azotosolutions.com/cloudtv/livetv<N>/player,
   mai la rete vera di Azoto. (Il flusso diretto, la modalita' B, e il
   passaggio da una modalita' all'altra li prova webtv.prova.js.)

   Avvia e ferma da sola: emulatori (firestore 8880, auth 9880) e
   server locale (api 3880, sito 8890).

   IL PERCORSO
    1. il gestore si attiva: "Primo accesso" -> email -> collegamento ->
       sceglie la password nella pagina di reimpostazione -> entra
       nella gestione;
    2. crea l'evento incollando il CODICE che ha dato Azoto (div,
       iframe e script): il servizio salva solo l'indirizzo del player,
       e il «Tipo di player» e' quello predefinito (Azoto); carica i
       partecipanti PER EMAIL (anteprima e creazione con le azioni vere
       della gestione: due Mario Rossi con email diverse sono due
       persone, la stessa email scritta in due modi e' una persona;
       creare NON manda email), manda un'email di prova a se' stesso e
       poi, con «Invia le credenziali», le credenziali a tutti;
    2b. le iscrizioni dal modulo del sito: il gestore accende dalla
       gestione «Invia subito la password a chi si iscrive dal modulo del
       sito»; Luca Nuovo si iscrive online dal modulo di Napoli (la
       funzione VERA del sito, api/iscrizione-nuova.js, chiamata come la
       chiama Vercel: server-locale.js monta solo le funzioni della
       diretta) e la password gli arriva subito nella posta finta; entra
       con la sua email e quella password; nella gestione compare «dal
       modulo del sito»; Mario, gia' iscritto, si iscrive di nuovo: niente
       seconda password;
    3. Mario Rossi (su un iPhone) apre il collegamento dell'email (che
       non porta l'indirizzo: e nessuna richiesta ad Azoto), scrive la
       sua email e la password copiata dall'email, entra e trova l'attesa
       con il conto alla rovescia e il programma, senza iframe; Anna
       Maria De Luca entra dal computer scrivendo la sua email con
       maiuscole e spazi;
    4. il gestore manda in onda: le pagine passano da sole alla
       diretta e compare l'iframe del player di Azoto, con gli attributi
       e il titolo giusti; chi NON ha fatto l'accesso non riceve
       l'indirizzo (non e' nell'HTML ne' nel JS pubblico, ne' nello
       stato pubblico della diretta; Firestore non lo da'); schermo
       intero (vero sul computer, la vista orizzontale sull'iPhone); il
       gestore cambia l'indirizzo del player (livetv91 -> livetv92):
       l'iframe cambia senza ricaricare la pagina; il contatore dei
       collegati li vede;
    5. connessione persa e ritrovata; la pagina riaperta non chiede di
       nuovo l'accesso;
    6. un minuto intero di diretta: la presenza aggiunge 60 secondi
       (le regole lo verificano con l'orario del server); pausa
       dell'evento: la nostra schermata AL POSTO dell'iframe, e alla
       ripresa l'iframe torna;
    7. Esci; «Password dimenticata?» con l'email: la risposta di sempre
       (con lo Spam e «Non sei ancora iscritto? Iscriviti qui.»), il
       collegamento arriva all'indirizzo VERO (a chi non e' iscritto non
       parte niente), nuova password, accesso automatico con l'email
       ricordata; la vecchia password non vale piu';
    8. il gestore termina: l'iframe sparisce, la nostra schermata di
       chiusura; esportazione con presenze e accessi. Nessuna violazione
       della CSP, nessun errore nelle pagine ne' in console.
   Screenshot di ogni passaggio in risultati/screenshot-e2e/.
   Esce con 1 se qualcosa e' rosso.
   ============================================================ */
'use strict';
const fs = require('fs');
const net = require('net');
const crypto = require('crypto');
const path = require('path');
const { spawn } = require('child_process');

const PORTE = { firestore: 8880, auth: 9880, api: 3880, statico: 8890 };
const PROGETTO = 'demo-ngb-eventi';
const EVENTO = 'napoli-2026';
const SITO = 'http://127.0.0.1:' + PORTE.statico;
const API = 'http://127.0.0.1:' + PORTE.api + '/api';
const GESTORE = 'gestore@prova.it';
const PASSWORD_GESTORE = 'GestioneNapoli2026';
const RISULTATI = path.resolve(__dirname, 'risultati');
const FOTO = path.join(RISULTATI, 'screenshot-e2e');
const POSTA = path.join(RISULTATI, 'posta-e2e.jsonl');
fs.mkdirSync(FOTO, { recursive: true });
try { fs.unlinkSync(POSTA); } catch (e) { /* non c'era */ }

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:' + PORTE.firestore;
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:' + PORTE.auth;
const admin = require(path.resolve(__dirname, '../../email-service/node_modules/firebase-admin'));
const { chromium } = require('playwright');
const esbuild = require('esbuild');
const { preparaContesto } = require('./rete-prove');
const F = require('./flusso-prova');

const TITOLO = 'Next Generation Business 2026 · Napoli';
// il codice che ha dato Azoto, com'e' (virgolette singole, lo script): si salva solo l'indirizzo
const CODICE_AZOTO = '<div class=\'azoto-player-container\'>\n'
    + '<iframe src=\'' + F.PLAYER_AZOTO + '\' frameborder=\'0\' scrolling=\'no\' allowfullscreen></iframe>\n'
    + '</div>\n<script src=\'https://azotosolutions.com/videojs/azoto-player.js\'></script>';
const AZOTO_30 = F.AZOTO + '/cloudtv/livetv92/player';
const PERMESSI = 'autoplay; fullscreen; picture-in-picture; encrypted-media';

const pausa = ms => new Promise(r => setTimeout(r, ms));

/* Il browser non esce MAI in rete da solo: quello che serve lo danno le
   regole di rete-prove.js e flusso-prova.js (context.route). Senza proxy
   e senza DNS (tranne 127.0.0.1) qualunque richiesta sfuggita alle regole
   fallisce invece di uscire: mai la rete vera di Azoto (il 25/09 il
   rimando 301 del player finto sfuggiva alle regole e andava verso
   l'Azoto vero; ora lo segue instradaAzoto, e questa e' la rete di
   sicurezza). */
const LANCIO = {
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-proxy-server', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost']
};

/* ---------- esito ---------- */
let verdi = 0, rossi = 0;
async function prova(descrizione, fn) {
    try { await fn(); verdi++; console.log('  ok  ' + descrizione); }
    catch (e) { rossi++; console.log('ROSSO ' + descrizione + '\n       ' + String((e && e.message) || e).split('\n').slice(0, 4).join('\n       ')); }
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
function ferma() { figli.forEach(f => { try { f.kill('SIGINT'); } catch (e) { /* gia' fermo */ } }); }

/* ---------- posta finta ---------- */
function posta() {
    try {
        return fs.readFileSync(POSTA, 'utf8').split('\n').filter(Boolean).map(r => JSON.parse(r));
    } catch (e) { return []; }
}
function linkDa(testo, re) {
    const m = re.exec(String(testo || ''));
    return m ? m[0].replace(/&amp;/g, '&') : '';
}
const aIndirizzo = (m, a) => String(m.a || m.to || '').toLowerCase().indexOf(a.toLowerCase()) >= 0;

/* ---------- chiamate al servizio ---------- */
async function chiama(funzione, corpo, token) {
    const r = await fetch(API + '/' + funzione, {
        method: 'POST',
        headers: Object.assign({ 'content-type': 'application/json', origin: SITO }, token ? { authorization: 'Bearer ' + token } : {}),
        body: JSON.stringify(corpo)
    });
    const dati = await r.json().catch(() => ({}));
    if (!r.ok || dati.ok === false) throw new Error(funzione + ' ' + (corpo.azione || '') + ' -> ' + r.status + ' ' + JSON.stringify(dati).slice(0, 200));
    return dati;
}
async function tokenDaPassword(email, password) {
    const r = await fetch('http://127.0.0.1:' + PORTE.auth + '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=finta', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true })
    });
    const j = await r.json();
    if (!j.idToken) throw new Error('accesso del gestore fallito: ' + JSON.stringify(j).slice(0, 200));
    return j.idToken;
}

/* ---------- il modulo del sito (api/iscrizione-nuova.js) ----------
   server-locale.js monta solo le funzioni della diretta (api/diretta-*):
   la funzione del modulo del sito si chiama qui, VERA, con req e res
   finti come la chiama Vercel (come in iscrizioni.prova.js). Due progetti
   Firebase separati negli emulatori, come in produzione: la scheda
   dell'iscrizione va nel progetto dello studio (l'app predefinita di
   firebase-admin, con una chiave finta di "demo-studio-prova"), l'account
   e l'email della diretta in quello della diretta (demo-ngb-eventi,
   lib/diretta-firebase.js), nella stessa posta finta di questa prova. La
   conferma del sito non parte (nessun server di posta su quella porta):
   il modulo risponde lo stesso. */
let moduloDelSito = null;
function modulo() {
    if (moduloDelSito) return moduloDelSito;
    const { privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' }
    });
    Object.assign(process.env, {
        DIRETTA_EMULATORE: '1', DIRETTA_PROGETTO: PROGETTO, DIRETTA_POSTA_FINTA: POSTA, DIRETTA_PAUSA_MS: '0', APP_BASE_URL: SITO,
        FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ project_id: 'demo-studio-prova', private_key: privateKey, client_email: 'prova@demo-studio-prova.iam.gserviceaccount.com' }),
        SMTP_HOST: '127.0.0.1', SMTP_PORT: '9', SMTP_USER: 'nessuno', SMTP_PASS: 'nessuna'
    });
    moduloDelSito = require(path.resolve(__dirname, '../../email-service/api/iscrizione-nuova.js'));
    return moduloDelSito;
}
let ipModulo = 0;
async function iscriviDalSito(dati) {
    const corpo = Object.assign({
        data: '26/09/2026 10:15:00', pagina: 'Napoli 2 Ottobre 2026 - Manifestazione di interesse', azienda: 'Prova srl',
        ruolo: '', telefono: '', messaggio: '', modalita: 'online', privacy: true, marketing: false
    }, dati);
    const req = { method: 'POST', headers: { 'x-forwarded-for': '10.77.0.' + (++ipModulo) }, body: JSON.stringify(corpo) };
    const res = { stato: 0, corpo: null };
    res.setHeader = () => {};
    res.status = c => { res.stato = c; return res; };
    res.json = d => { res.corpo = d; return res; };
    res.end = () => res;
    const t0 = Date.now();
    await modulo()(req, res);
    res.ms = Date.now() - t0;
    return res;
}
// «La tua email: ...» e «Password: ...» dall'email delle credenziali
const passwordDa = m => ((/\nPassword:\s*(\S+)/.exec((m && m.testo) || '')) || [])[1] || '';

const PARTECIPANTI = [
    { nome: 'Mario', cognome: 'Rossi', email: 'mario.rossi@esempio.it', azienda: 'Rossi Costruzioni srl' },
    { nome: 'Anna Maria', cognome: 'De Luca', email: 'annamaria.deluca@esempio.it', azienda: 'Studio De Luca' },
    { nome: 'Nicolò', cognome: "D'Angelo", email: 'n.dangelo@esempio.it', azienda: 'DAngelo SpA' },
    { nome: 'Mario', cognome: 'Rossi', email: 'mario.rossi@altra.it', azienda: 'Altra impresa' },
    { nome: 'Giulia', cognome: 'Esposito', email: ' Giulia.Esposito@Esempio.IT ', azienda: 'Esposito & figli' },
    { nome: 'Giulia', cognome: 'Esposito', email: 'giulia.esposito@esempio.it', azienda: 'Esposito & figli' }
];

/* ---------- il player di Azoto nella pagina ---------- */
const statoAzoto = page => page.evaluate(() => {
    const tutti = document.querySelectorAll('#video-player iframe');
    const f = tutti[0];
    return {
        quanti: tutti.length,
        src: f ? f.getAttribute('src') : '',
        classe: f ? f.className : '',
        allow: f ? f.getAttribute('allow') : '',
        allowfullscreen: f ? f.hasAttribute('allowfullscreen') : false,
        referrerpolicy: f ? f.getAttribute('referrerpolicy') : '',
        scrolling: f ? f.getAttribute('scrolling') : '',
        titolo: f ? f.getAttribute('title') : '',
        video: document.querySelectorAll('#video-player video').length,
        azoto: document.documentElement.classList.contains('modo-azoto'),
        schermata: document.getElementById('area-video').getAttribute('data-schermata')
    };
});
// il canale scritto dal player finto dentro l'iframe ('' se la pagina non e' arrivata)
async function canaleAzoto(page) {
    const h = await page.$('#video-player iframe');
    const fr = h && await h.contentFrame();
    if (!fr) return '';
    try { return String(await fr.textContent('#canale-azoto', { timeout: 500 }) || '').trim(); } catch (e) { return ''; }
}
// l'iframe c'e', con gli attributi giusti, e dentro c'e' il player di quel canale
async function iframeAzotoGiusto(page, canale, cosa) {
    await aspetta(async () => (await canaleAzoto(page)) === canale, 20000, cosa + ': il player di Azoto ' + canale + ' nell\'iframe');
    const s = await statoAzoto(page);
    vero(s.quanti === 1 && s.src === F.AZOTO + '/cloudtv/' + canale + '/player' && s.classe === 'player-azoto', cosa + ': iframe ' + JSON.stringify({ n: s.quanti, src: s.src, classe: s.classe }));
    vero(s.allow === PERMESSI && s.allowfullscreen && s.referrerpolicy === 'strict-origin-when-cross-origin' && s.scrolling === 'no',
        cosa + ': attributi ' + JSON.stringify({ allow: s.allow, fs: s.allowfullscreen, ref: s.referrerpolicy, scr: s.scrolling }));
    vero(s.titolo === 'Diretta: ' + TITOLO, cosa + ': titolo «' + s.titolo + '»');
    vero(s.video === 0 && s.azoto && s.schermata === 'video', cosa + ': ' + JSON.stringify({ video: s.video, azoto: s.azoto, schermata: s.schermata }));
}
const nessunIframe = page => page.evaluate(() => document.querySelectorAll('#video-player iframe, #video-player video').length === 0);

(async () => {
    let browser;
    try {
        /* ---------- 0. emulatori e server ---------- */
        for (const p of Object.values(PORTE)) vero(!(await portaOccupata(p)), 'porta ' + p + ' gia\' occupata: chiudi le prove rimaste accese');
        console.log('Avvio di emulatori e server locale...');
        await avvia('emulatori', ['avvia-emulatori.js', '--firestore', String(PORTE.firestore), '--auth', String(PORTE.auth)], 'EMULATORI PRONTI', 150000);
        await avvia('server locale', ['server-locale.js', '--api', String(PORTE.api), '--statico', String(PORTE.statico),
            '--firestore', String(PORTE.firestore), '--auth', String(PORTE.auth)], 'SERVER LOCALE PRONTO', 30000,
        { DIRETTA_POSTA_FINTA: POSTA, DIRETTA_ADMIN_EMAILS: GESTORE, DIRETTA_AUTH_AL_SECONDO: '40' });
        const app = admin.initializeApp({ projectId: PROGETTO }, 'e2e');
        const db = app.firestore();

        browser = await chromium.launch(LANCIO);
        async function contesto(opzioni, senzaSchermoIntero) {
            const context = await browser.newContext(Object.assign({ locale: 'it-IT', timezoneId: 'Europe/Rome' }, opzioni));
            await preparaContesto(context, {});
            // il player di Azoto finto (dopo preparaContesto: vince lei); azoto.richieste: i percorsi chiesti
            const azoto = await F.instradaAzoto(context);
            /* La prova di connessione dell'SDK di Firestore dopo un guasto di rete
               (un'immagine di www.google.com): qui la rete di prova la rifiuta (403),
               in realta' c'e'. La si da' com'e' davvero, un gif di un pixel. */
            await context.route(/^https:\/\/www\.google\.com\/images\/cleardot\.gif/, r => r.fulfill({
                status: 200, contentType: 'image/gif', body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
            }));
            await context.addInitScript(porte => {
                window.NGB_DIRETTA_PROVE = porte;
                try { sessionStorage.setItem('ngbDirettaEmulatori', '1'); } catch (e) { /* niente */ }
                if (window.top === window) {
                    window.__violazioniCsp = [];
                    document.addEventListener('securitypolicyviolation', e => window.__violazioniCsp.push(e.violatedDirective + ' ' + e.blockedURI));
                }
            }, { firestore: PORTE.firestore, auth: PORTE.auth, api: API, ritardoPresenzaMs: 500 });
            if (senzaSchermoIntero) {
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
            /* Gli errori in console (di tutte le cornici). Mentre la prova toglie
               la rete apposta (page.__senzaRete) quelli della rete sono attesi. */
            page.__console = [];
            page.on('console', m => {
                if (m.type() !== 'error') return;
                const dove = m.location() && m.location().url ? m.location().url : '';
                if (page.__senzaRete && /ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|Failed to fetch|Could not reach Cloud Firestore/i.test(m.text())) return;
                /* Il canale di ascolto dell'SDK di Firestore che il server chiude
                   (400, sessione del canale finita: succede quando la pagina esce o
                   riapre l'ascolto): l'SDK ne apre da solo uno nuovo. Non e' un errore
                   della pagina; qualunque altro errore in console si': */
                if (/status of 400/.test(m.text()) && /\/google\.firestore\.v1\.Firestore\/(Listen|Write)\/channel\?/.test(dove)) { page.__canaleChiuso = (page.__canaleChiuso || 0) + 1; return; }
                page.__console.push(m.text() + (dove ? ' [' + dove + ']' : ''));
            });
            // ogni richiesta verso azotosolutions.com (anche azoto-player.js, che non si deve mai caricare)
            const richiesteAzoto = [];
            page.on('request', q => { if (/^https:\/\/([a-z0-9-]+\.)*azotosolutions\.com[:/]/.test(q.url())) richiesteAzoto.push(q.url()); });
            // le richieste ad Azoto non riuscite (non quelle interrotte perche' l'iframe e' stato tolto)
            const falliteAzoto = [];
            page.on('requestfailed', q => {
                const e = String((q.failure() || {}).errorText || '');
                if (/azotosolutions\.com/.test(q.url()) && !/ERR_ABORTED/.test(e)) falliteAzoto.push(q.url() + ' ' + e);
            });
            return { context, page, azoto, richiesteAzoto, falliteAzoto };
        }
        const vista = (page, v, ms) => page.waitForSelector('body[data-vista="' + v + '"]', { timeout: ms || 20000 });
        const foto = (page, nome, intera) => page.screenshot({ path: path.join(FOTO, nome + '.png'), fullPage: !!intera });
        async function conferma(page) {
            const si = page.locator('#btn-conferma-si');
            if (await si.isVisible().catch(() => false)) await si.click();
        }

        /* ---------- 1. il gestore si attiva ---------- */
        console.log('\n1. Il gestore si attiva dal collegamento ricevuto via email');
        let tokenGestore = '';
        await prova('"Primo accesso": risposta uguale per chiunque, email solo al gestore vero', async () => {
            const a = await chiama('diretta-accesso', { azione: 'gestore-accesso', email: GESTORE });
            const b = await chiama('diretta-accesso', { azione: 'gestore-accesso', email: 'curioso@esempio.it' });
            vero(a.msg === b.msg, 'le due risposte sono diverse');
            const m = await aspetta(() => posta().find(x => aIndirizzo(x, GESTORE)), 10000, 'email al gestore');
            vero(!posta().some(x => aIndirizzo(x, 'curioso@esempio.it')), 'e\' partita un\'email a chi non e\' gestore');
            vero(/reimposta\.html\?oobCode=/.test(m.testo || m.html), 'manca il collegamento');
        });
        const gestione = await contesto({ viewport: { width: 1440, height: 900 } });
        await prova('il gestore sceglie la password dalla pagina di reimpostazione', async () => {
            const m = posta().find(x => aIndirizzo(x, GESTORE));
            const link = linkDa(m.testo || m.html, /http:\/\/127\.0\.0\.1:\d+\/diretta\/reimposta\.html\?[^\s"<>]+/);
            vero(link, 'collegamento non trovato nell\'email');
            await gestione.page.goto(link);
            await gestione.page.waitForSelector('#form-reimposta:not([hidden])', { timeout: 20000 });
            await gestione.page.fill('#campo-nuova', PASSWORD_GESTORE);
            await gestione.page.fill('#campo-ripeti', PASSWORD_GESTORE);
            await gestione.page.click('#btn-salva-password');
            await gestione.page.waitForSelector('#link-dopo-reimposta:not([hidden])', { timeout: 20000 });
            vero(/\/diretta\/gestione\//.test(await gestione.page.getAttribute('#link-dopo-reimposta', 'href')), 'non porta alla gestione');
            tokenGestore = await tokenDaPassword(GESTORE, PASSWORD_GESTORE);
            await chiama('diretta-gestione', { azione: 'chi-sono' }, tokenGestore);
        });
        await prova('il gestore entra nella pagina di gestione', async () => {
            await gestione.page.goto(SITO + '/diretta/gestione/');
            await gestione.page.fill('#gestore-email', GESTORE);
            await gestione.page.fill('#gestore-password', PASSWORD_GESTORE);
            await gestione.page.click('#btn-gestore-entra');
            await gestione.page.waitForSelector('#sel-evento', { state: 'visible', timeout: 20000 });
            await foto(gestione.page, '01-gestione-entrata');
        });

        /* ---------- 2. evento, partecipanti, credenziali ---------- */
        console.log('\n2. Evento, partecipanti e credenziali');
        const g = corpo => chiama('diretta-gestione', corpo, tokenGestore);
        await prova('crea l\'evento di Napoli incollando il codice di Azoto: si salva solo l\'indirizzo, il player predefinito è Azoto', async () => {
            const r = await g({ azione: 'evento-salva', evento: {
                id: EVENTO, nuovo: true, titolo: TITOLO, luogo: 'Napoli · Hotel Eurostars Excelsior',
                data: '2026-10-02', oraInizio: '09:00', oraFine: '17:30', azotoUrl: CODICE_AZOTO,
                programma: '09.00 Accoglienza e registrazione\n09.30 Apertura dei lavori\n10.00 Adeguati assetti e governance\n13.00 Pausa pranzo\n17.30 Chiusura',
                paginaEvento: '/napoli_ottobre_2026/', unSoloDispositivo: false, promemoria: { giornoPrima: true, oraPrima: true }
            } });
            vero(r.evento && r.evento.id === EVENTO, 'evento non creato');
            vero(r.evento.tipoPlayer === 'azoto' && r.evento.azotoUrl === F.PLAYER_AZOTO, 'evento: ' + JSON.stringify({ tipo: r.evento.tipoPlayer, azoto: r.evento.azotoUrl }));
            const pubblico = (await db.doc('eventi/' + EVENTO).get()).data();
            vero(pubblico.tipoPlayer === 'azoto' && !pubblico.videoUrl && !pubblico.videoId && !pubblico.azotoUrl, 'il documento pubblico prima della diretta: ' + JSON.stringify({ t: pubblico.tipoPlayer, v: pubblico.videoId }));
            const riservato = (await db.doc('eventiRiservati/' + EVENTO).get()).data();
            vero(riservato.azotoUrl === F.PLAYER_AZOTO, 'indirizzo salvato: ' + riservato.azotoUrl);
            vero(!/[<>]|script|azoto-player\.js|iframe/i.test(JSON.stringify(riservato)), 'e\' stato salvato l\'HTML incollato: ' + JSON.stringify(riservato).slice(0, 200));
        });
        let risultatiCrea = [];
        await prova('anteprima e creazione PER EMAIL: due Mario Rossi con email diverse = due persone, la stessa email scritta in due modi = una; creare NON manda email', async () => {
            const righe = PARTECIPANTI.map((p, i) => Object.assign({ riga: i + 2 }, p));
            const ant = await g({ azione: 'anteprima', idEvento: EVENTO, righe: righe });
            vero(ant.pronto && JSON.stringify(ant.righe.map(r => r.esito)) === JSON.stringify(['nuovo', 'nuovo', 'nuovo', 'nuovo', 'nuovo', 'doppia-nel-file'])
                && ant.conteggi.daCreare === 5 && ant.righe[5].primaRiga === 6, 'anteprima: ' + JSON.stringify(ant.righe.map(r => r.esito)));
            const daCreare = ant.righe.filter(r => r.crea).map(r => ({ riga: r.riga, nome: r.nome, cognome: r.cognome, email: r.email, azienda: r.azienda }));
            const postaPrima = posta().length;
            const r = await g({ azione: 'crea', idEvento: EVENTO, righe: daCreare });
            risultatiCrea = r.risultati;
            vero(risultatiCrea.length === 5 && risultatiCrea.every(x => x.esito === 'creato' && !('nomeUtente' in x)), 'crea: ' + JSON.stringify(risultatiCrea.map(x => x.esito)));
            // ricaricare lo stesso file non crea niente
            const r2 = await g({ azione: 'crea', idEvento: EVENTO, righe: daCreare });
            vero(r2.risultati.every(x => x.esito === 'gia-iscritto'), 'il secondo caricamento ha creato qualcosa: ' + JSON.stringify(r2.risultati.map(x => x.esito)));
            const utenti = await app.auth().listUsers(1000);
            vero(utenti.users.filter(u => !u.customClaims || !u.customClaims.gestore).length === 5, 'account Auth: ' + utenti.users.length);
            vero(posta().length === postaPrima, 'creare gli account ha mandato ' + (posta().length - postaPrima) + ' email');
            const st = await g({ azione: 'email-stato', idEvento: EVENTO });
            vero(st.conteggi && st.conteggi['da inviare'] === 5, 'credenziali non tutte «da inviare»: ' + JSON.stringify(st.conteggi));
        });
        await prova('"Invia email di prova a me": arriva solo al gestore, marcata come prova', async () => {
            await g({ azione: 'email-prova', idEvento: EVENTO, tipo: 'credenziali' });
            const m = await aspetta(() => posta().filter(x => aIndirizzo(x, GESTORE)).find(x => /prova/i.test(x.oggetto || '')), 10000, 'email di prova');
            vero(/EMAIL DI PROVA/i.test(m.testo || m.html), 'non e\' marcata come prova');
        });
        let credenziali = {};
        await prova('invio delle credenziali a tutti, a gruppi, fino alla fine', async () => {
            const acc = await g({ azione: 'email-accoda', idEvento: EVENTO, chi: 'da-inviare' });
            vero(acc.accodate === 5, 'accodate ' + acc.accodate);
            for (let giro = 0; giro < 20; giro++) {
                const r = await g({ azione: 'email-avanza', idEvento: EVENTO });
                if (r.finito || r.rimaste === 0) break;
                await pausa(500);
            }
            const st = await g({ azione: 'email-stato', idEvento: EVENTO });
            vero(st.conteggi && st.conteggi.inviata === 5, 'conteggi: ' + JSON.stringify(st.conteggi));
            PARTECIPANTI.slice(0, 5).forEach(p => {
                const email = p.email.trim().toLowerCase();
                const m = posta().filter(x => aIndirizzo(x, email)).find(x => /Password:/.test(x.testo || ''));
                vero(m, 'nessuna email di credenziali per ' + p.email);
                const pw = passwordDa(m);
                vero(m.testo.indexOf('scrivi la tua email ' + email + ' e questa password: ' + pw) >= 0 && /La tua email: /.test(m.testo) && !/nome utente/i.test(m.testo + m.html),
                    'l\'email delle credenziali di ' + email + ' non dice «scrivi la tua email … e questa password: …»');
                credenziali[email] = { password: pw, link: linkDa(m.testo, /http:\/\/127\.0\.0\.1:\d+\/diretta\/\?[^\s"<>]+/) };
            });
            vero(posta().filter(x => /Password:/.test(x.testo || '') && !/prova/i.test(x.oggetto || '')).length === 5, 'email di credenziali doppie o mancanti');
            const nessunaInChiaro = (await db.collection('partecipanti').get()).docs.every(d => JSON.stringify(d.data()).indexOf(credenziali['mario.rossi@esempio.it'].password) < 0);
            vero(nessunaInChiaro, 'una password e\' finita in Firestore');
        });

        /* ---------- 2b. le iscrizioni dal modulo del sito ---------- */
        console.log('\n2b. Le iscrizioni dal modulo del sito: la password arriva subito');
        await prova('il gestore accende dalla gestione «Invia subito la password a chi si iscrive dal modulo del sito» (spento di base)', async () => {
            const gp = gestione.page;
            await gp.goto(SITO + '/diretta/gestione/');
            await gp.waitForFunction(ev => document.getElementById('sel-evento').value === ev && !document.getElementById('ev-iscrizioni-auto').disabled, EVENTO, { timeout: 20000 });
            vero(!(await gp.isChecked('#ev-iscrizioni-auto')), 'l\'interruttore non e\' spento di base');
            await gp.click('label.interruttore');
            await gp.waitForSelector('#dialogo-conferma[open]', { timeout: 5000 });
            vero(/\/napoli_ottobre_2026\//.test(await gp.textContent('#conferma-testo')), 'la conferma non dice la pagina del modulo');
            await gp.click('#conferma-ok');
            await gp.waitForFunction(() => document.getElementById('ev-iscrizioni-auto').checked && /Invio automatico acceso/.test(document.getElementById('msg-iscrizioni').textContent), null, { timeout: 10000 });
            vero((await db.doc('eventiRiservati/' + EVENTO).get()).data().iscrizioniAutomatiche === true, 'sul servizio l\'interruttore e\' ancora spento');
            await gp.locator('#riquadro-iscrizioni').scrollIntoViewIfNeeded();
            await foto(gp, '02b-gestione-interruttore');
        });
        const LUCA = 'luca.nuovo@esempio.it';
        let pwLuca = '';
        await prova('Luca si iscrive online dal modulo del sito (la funzione vera): la risposta di sempre, e la password gli arriva subito', async () => {
            const prima = posta().length;
            const r = await iscriviDalSito({ nome: 'Luca', cognome: 'Nuovo', email: ' Luca.Nuovo@Esempio.IT ' });
            vero(r.stato === 200 && r.corpo && r.corpo.ok === true && r.ms < 10000, 'il modulo del sito: ' + r.stato + ' ' + JSON.stringify(r.corpo) + ' in ' + r.ms + ' ms');
            const arrivate = posta().slice(prima).filter(x => aIndirizzo(x, LUCA));
            vero(arrivate.length === 1 && arrivate[0].tipo === 'credenziali', 'email a Luca: ' + JSON.stringify(arrivate.map(x => x.tipo)));
            pwLuca = passwordDa(arrivate[0]);
            vero(/^[A-HJ-NP-Za-km-np-z2-9]{10}$/.test(pwLuca) && arrivate[0].testo.indexOf('scrivi la tua email ' + LUCA + ' e questa password: ' + pwLuca) >= 0,
                'l\'email non dice «scrivi la tua email ' + LUCA + ' e questa password: …»');
            vero(/Non trovi l'email\? Controlla nella cartella Spam o Promozioni/.test(arrivate[0].testo), 'manca la frase dello Spam');
            const ind = await db.doc('indirizzi/' + LUCA).get();
            const p = ind.exists ? (await db.doc('partecipanti/' + ind.data().uid).get()).data() : null;
            vero(p && p.origine === 'modulo' && p.eventi.join() === EVENTO && p.invii[EVENTO].stato === 'inviata', 'profilo di Luca: ' + JSON.stringify(p && { o: p.origine, e: p.eventi, i: p.invii }));
            vero(JSON.stringify(p).indexOf(pwLuca) < 0, 'la password e\' finita in Firestore');
        });
        await prova('Luca entra nella diretta con la sua email e quella password', async () => {
            const nuovo = await contesto({ viewport: { width: 1280, height: 860 } });
            try {
                await nuovo.page.goto(SITO + '/diretta/');
                await vista(nuovo.page, 'accesso');
                await nuovo.page.fill('#email', LUCA);
                await nuovo.page.fill('#campo-password', pwLuca);
                await nuovo.page.click('#btn-entra');
                await vista(nuovo.page, 'attesa');
                vero(/Luca Nuovo/.test(await nuovo.page.textContent('#nome-persona')), 'nome della persona: ' + await nuovo.page.textContent('#nome-persona'));
                await foto(nuovo.page, '02c-dal-modulo-entrato');
                vero(nuovo.page.__errori.length === 0 && nuovo.page.__console.length === 0, 'errori: ' + nuovo.page.__errori.concat(nuovo.page.__console).join(' | '));
            } finally {
                await nuovo.context.close().catch(() => {});
            }
        });
        await prova('nella gestione Luca compare «dal modulo del sito», con le credenziali «inviata»', async () => {
            const gp = gestione.page;
            await gp.click('[data-scheda="partecipanti"]');
            await gp.click('#btn-aggiorna-partecipanti');
            const riga = gp.locator('#tabella-partecipanti tr[data-origine="modulo"]');
            await riga.waitFor({ timeout: 10000 });
            vero(await gp.locator('#tabella-partecipanti tbody tr').count() === 6 && await riga.count() === 1, 'righe: ' + await gp.locator('#tabella-partecipanti tbody tr').count());
            const t = await riga.textContent();
            vero(/Luca Nuovo/.test(t) && /dal modulo del sito/.test(t) && t.indexOf(LUCA) >= 0 && /inviata/.test(t), 'riga di Luca: ' + t.replace(/\s+/g, ' ').slice(0, 200));
            await foto(gp, '02d-gestione-dal-modulo');
        });
        await prova('Mario, che ha già la password, si iscrive di nuovo dal modulo: nessuna seconda password, nessuna email', async () => {
            const prima = posta().length;
            const r = await iscriviDalSito({ nome: 'Mario', cognome: 'Rossi', email: 'Mario.Rossi@esempio.it' });
            vero(r.stato === 200 && r.corpo.ok === true, 'il modulo: ' + r.stato);
            vero(posta().length === prima, 'email partite: ' + posta().slice(prima).map(x => x.tipo + ' ' + x.a).join(', '));
            const entra = await chiama('diretta-accesso', { azione: 'entra', email: 'mario.rossi@esempio.it', password: credenziali['mario.rossi@esempio.it'].password });
            vero(entra.token, 'la password di Mario non vale piu\'');
        });

        /* ---------- 3. i partecipanti entrano ---------- */
        console.log('\n3. I partecipanti entrano e aspettano');
        const iphone = await contesto({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' }, true);
        const mario = credenziali['mario.rossi@esempio.it'];
        await prova('Mario apre il collegamento dell\'email (senza il suo indirizzo), la pagina chiede email e password, e nessuna richiesta ad Azoto', async () => {
            vero(/\/diretta\/\?e=napoli-2026$/.test(mario.link) && !/@|%40|[?&]u=/.test(mario.link), 'il collegamento: ' + mario.link);
            await iphone.page.goto(mario.link);
            await vista(iphone.page, 'accesso');
            vero(await iphone.page.inputValue('#email') === '' && await iphone.page.getAttribute('#email', 'type') === 'email' && await iphone.page.getAttribute('#email', 'autocomplete') === 'username',
                'campo Email: ' + JSON.stringify(await iphone.page.inputValue('#email')));
            vero((await iphone.page.textContent('#frase-iscrizione')).trim() === 'Non sei ancora iscritto? Iscriviti qui.' && await iphone.page.isVisible('#frase-iscrizione'),
                'manca «Non sei ancora iscritto? Iscriviti qui.» sotto il pulsante');
            vero(!iphone.richiesteAzoto.length && !iphone.azoto.richieste.length, 'richieste ad Azoto prima dell\'accesso: ' + iphone.richiesteAzoto.join(', '));
            await foto(iphone.page, '02-accesso-telefono');
        });
        await prova('Mario entra con la sua email e la password dell\'email e trova l\'attesa con conto alla rovescia e programma, senza iframe', async () => {
            await iphone.page.fill('#email', 'mario.rossi@esempio.it');
            await iphone.page.fill('#campo-password', mario.password);
            await iphone.page.click('#btn-entra');
            await vista(iphone.page, 'attesa');
            const giorni = Number(await iphone.page.textContent('#conto-giorni'));
            vero(giorni >= 1, 'conto alla rovescia: ' + giorni);
            vero(await iphone.page.locator('#programma li').count() >= 5, 'programma assente');
            await pausa(1000);
            vero(await nessunIframe(iphone.page) && !iphone.richiesteAzoto.length, 'nell\'attesa c\'e\' il player, o la pagina ha chiamato Azoto');
            // i consigli dell'attesa sono quelli del player di Azoto
            vero(await iphone.page.evaluate(() => document.documentElement.classList.contains('modo-azoto')
                && Array.from(document.querySelectorAll('#vista-attesa li[data-solo]')).every(li => (li.offsetParent !== null) === (li.getAttribute('data-solo') === 'azoto'))), 'consigli dell\'attesa');
            await foto(iphone.page, '03-attesa-telefono');
        });
        const computer = await contesto({ viewport: { width: 1440, height: 900 } });
        const anna = credenziali['annamaria.deluca@esempio.it'];
        await prova('Anna Maria entra dal computer scrivendo la sua email con maiuscole e spazi (" AnnaMaria.DeLuca@Esempio.IT ")', async () => {
            await computer.page.goto(SITO + '/diretta/');
            await vista(computer.page, 'accesso');
            await computer.page.fill('#email', ' AnnaMaria.DeLuca@Esempio.IT ');
            await computer.page.fill('#campo-password', anna.password);
            await computer.page.click('#btn-entra');
            await vista(computer.page, 'attesa');
            vero(/Anna Maria/.test(await computer.page.textContent('#nome-persona')), 'nome della persona assente');
            vero(await nessunIframe(computer.page), 'nell\'attesa c\'e\' il player');
            await computer.page.evaluate(() => document.fonts && document.fonts.ready);
            await foto(computer.page, '04-attesa-computer');
        });

        /* ---------- 4. in onda ---------- */
        console.log('\n4. In onda');
        await prova('il gestore manda in onda: le pagine passano da sole alla diretta e compare l\'iframe del player di Azoto (attributi e titolo giusti)', async () => {
            await g({ azione: 'evento-stato', idEvento: EVENTO, stato: 'in_onda' });
            await vista(iphone.page, 'diretta');
            await vista(computer.page, 'diretta');
            const pubblico = (await db.doc('eventi/' + EVENTO).get()).data();
            vero(pubblico.tipoPlayer === 'azoto' && pubblico.videoId === F.PLAYER_AZOTO && !pubblico.videoUrl && !pubblico.azotoUrl, 'documento pubblico: ' + JSON.stringify({ t: pubblico.tipoPlayer, v: pubblico.videoId }));
            for (const [c, nome] of [[computer, 'computer'], [iphone, 'iPhone']]) {
                await iframeAzotoGiusto(c.page, 'livetv91', nome);
                vero(c.richiesteAzoto.every(u => /^https:\/\/cdn\.azotosolutions\.com\/cloudtv\/livetv91\/player\/?$/.test(u)), nome + ': richieste ad Azoto: ' + c.richiesteAzoto.join(', '));
                vero(await c.page.locator('#nota-azoto').isVisible() && await c.page.locator('#btn-schermo-intero').isVisible() && !(await c.page.locator('#btn-play').isVisible()),
                    nome + ': sotto il video non ci sono solo «Schermo intero» e la nota');
            }
            await computer.page.evaluate(() => document.fonts && document.fonts.ready);
            await foto(computer.page, '05-diretta-computer');
            await foto(iphone.page, '06-diretta-telefono');
        });
        await prova('chi NON ha fatto l\'accesso non riceve l\'indirizzo del player: niente richieste ad Azoto, niente indirizzo nell\'HTML o nel JS pubblico, nello stato pubblico, in Firestore', async () => {
            const estraneo = await contesto({ viewport: { width: 1366, height: 900 } });
            try {
                const pg = estraneo.page;
                const risorse = new Set();
                pg.on('response', r => { if (r.url().indexOf(SITO + '/') === 0) risorse.add(r.url()); });
                await pg.goto(SITO + '/diretta/');
                await vista(pg, 'accesso');
                await pausa(2000);
                vero(!estraneo.richiesteAzoto.length && !estraneo.azoto.richieste.length, 'richieste ad Azoto senza accesso: ' + estraneo.richiesteAzoto.join(', '));
                const html = await pg.content();
                vero(html.indexOf('/cloudtv/') < 0 && !(await pg.locator('iframe').count()), 'l\'indirizzo o un iframe nella pagina senza accesso');
                // i file del sito che la pagina ha scaricato (HTML, JS, CSS): l'indirizzo non c'e' nel codice che il browser usa
                const nelCodice = [], neiCommenti = [];
                for (const u of risorse) {
                    const testo = await (await fetch(u)).text();
                    if (/\.(js|css)(\?|$)/.test(u)) {
                        const pulito = /\.js(\?|$)/.test(u) ? esbuild.transformSync(testo, { minify: true, legalComments: 'none' }).code : testo.replace(/\/\*[\s\S]*?\*\//g, '');
                        if (/\/cloudtv\/|livetv\d/.test(pulito)) nelCodice.push(u);
                        else if (/\/cloudtv\/|livetv\d/.test(testo)) neiCommenti.push(u.replace(SITO, ''));
                    } else if (/\/cloudtv\//.test(testo)) nelCodice.push(u);
                }
                vero(risorse.size >= 5, 'la prova ha visto solo ' + risorse.size + ' file del sito');
                vero(!nelCodice.length, 'l\'indirizzo del player e\' nel codice pubblico: ' + nelCodice.join(', '));
                if (neiCommenti.length) console.log('       (attenzione: un indirizzo di esempio del player Azoto in un commento di ' + neiCommenti.join(', ') + ')');
                // lo stato pubblico della diretta (home e pagina di Napoli) non lo dice
                const stato = await (await fetch(API + '/diretta-stato?evento=' + EVENTO)).text();
                vero(/in_onda/.test(stato) && !/azotosolutions|cloudtv|tipoPlayer/.test(stato), 'stato pubblico: ' + stato.slice(0, 200));
                // Firestore senza accesso: le regole non danno l'evento
                const r = await fetch('http://127.0.0.1:' + PORTE.firestore + '/v1/projects/' + PROGETTO + '/databases/(default)/documents/eventi/' + EVENTO);
                const corpo = await r.text();
                vero(r.status === 403 && corpo.indexOf('cloudtv') < 0, 'Firestore senza accesso: ' + r.status + ' ' + corpo.slice(0, 120));
                vero(estraneo.page.__console.length === 0 && estraneo.page.__errori.length === 0, 'errori: ' + estraneo.page.__console.concat(estraneo.page.__errori).join(' | '));
            } finally {
                await estraneo.context.close().catch(() => {});
            }
        });
        await prova('«Schermo intero»: sul computer lo schermo intero vero del riquadro; sull\'iPhone la vista a pagina intera orizzontale', async () => {
            await computer.page.click('#btn-schermo-intero');
            await computer.page.waitForFunction(() => document.fullscreenElement === document.getElementById('riquadro-video')
                && document.getElementById('riquadro-video').getAttribute('data-intero') === '1', null, { timeout: 5000 });
            const f = await computer.page.locator('#video-player iframe').boundingBox();
            vero(f.width >= 1300 && Math.abs(f.width / f.height - 16 / 9) < 0.01, 'iframe a schermo intero: ' + JSON.stringify(f));
            await computer.page.click('#btn-schermo-intero');
            await computer.page.waitForFunction(() => !document.fullscreenElement, null, { timeout: 5000 });
            await iphone.page.click('#btn-schermo-intero');
            await aspetta(() => iphone.page.evaluate(() => document.getElementById('riquadro-video').getAttribute('data-intero') === '1'
                && document.documentElement.classList.contains('schermo-intero-finto')), 5000, 'la vista a pagina intera');
            await pausa(300);
            const m = await iphone.page.evaluate(() => {
                const q = document.getElementById('riquadro-video');
                const b = q.getBoundingClientRect();
                return { t: getComputedStyle(q).transform, w: q.offsetWidth, h: q.offsetHeight, bb: { x: b.left, y: b.top, w: b.width, h: b.height } };
            });
            const n = (/matrix\(([^)]+)\)/.exec(m.t) || [])[1];
            const r = n ? n.split(',').map(Number) : [];
            // ruotato di 90 gradi (matrix(0, 1, -1, 0, ...)) e piu' largo che alto: orizzontale
            vero(r.length === 6 && Math.abs(r[0]) < 0.01 && Math.abs(r[1] - 1) < 0.01 && Math.abs(r[2] + 1) < 0.01 && Math.abs(r[3]) < 0.01 && m.w > m.h,
                'l\'iPhone non passa alla vista orizzontale: ' + JSON.stringify(m));
            vero(Math.abs(m.bb.w - 390) < 1 && Math.abs(m.bb.h - 844) < 1, 'la vista non copre lo schermo: ' + JSON.stringify(m.bb));
            await foto(iphone.page, '07-schermo-intero-telefono');
            await iphone.page.click('#btn-schermo-intero');
            await aspetta(() => iphone.page.evaluate(() => document.getElementById('riquadro-video').getAttribute('data-intero') === '0'), 5000, 'uscita dalla vista a pagina intera');
            vero(await canaleAzoto(iphone.page) === 'livetv91', 'l\'iframe si e\' perso con lo schermo intero');
        });
        await prova('il gestore cambia l\'indirizzo del player durante la diretta (livetv91 -> livetv92): l\'iframe cambia senza ricaricare la pagina', async () => {
            for (const c of [computer, iphone]) await c.page.evaluate(() => { window.__segnoPagina = 'ancora-qui'; });
            // incollato con gli spazi intorno: il servizio lo pulisce
            await g({ azione: 'evento-video', idEvento: EVENTO, azotoUrl: ' ' + AZOTO_30 + ' ' });
            for (const [c, nome] of [[computer, 'computer'], [iphone, 'iPhone']]) {
                await iframeAzotoGiusto(c.page, 'livetv92', nome);
                vero(await c.page.evaluate(() => window.__segnoPagina) === 'ancora-qui', 'la pagina si e\' ricaricata (' + nome + ')');
            }
            const pubblico = (await db.doc('eventi/' + EVENTO).get()).data();
            vero(pubblico.videoId === AZOTO_30 && !pubblico.videoUrl, 'documento pubblico: ' + JSON.stringify({ v: pubblico.videoId, u: pubblico.videoUrl }));
        });
        // fuori dalla finestra oraria dell'evento (qui la data e' fra otto giorni) le
        // pagine cominciano a segnalarsi dopo la messa in onda, al loro giro: fino a 60 s
        await prova('il contatore della gestione vede le due persone collegate', async () => {
            const n = await aspetta(async () => {
                const r = await g({ azione: 'connessi', idEvento: EVENTO });
                return r.connessi >= 2 ? r.connessi : 0;
            }, 80000, 'connessi >= 2');
            vero(n === 2, 'connessi: ' + n);
        });

        /* ---------- 5. rete e riapertura ---------- */
        console.log('\n5. Connessione persa e pagina riaperta');
        await prova('connessione persa: avviso dopo qualche secondo, poi sparisce al ritorno', async () => {
            computer.page.__senzaRete = true;
            await computer.context.setOffline(true);
            await computer.page.waitForSelector('#avviso-connessione:not([hidden])', { timeout: 15000 });
            // l'avviso sta in cima al riquadro: mai sopra l'iframe
            const a = await computer.page.locator('#avviso-connessione').boundingBox();
            const v = await computer.page.locator('#video-player iframe').boundingBox();
            vero(a.y + a.height <= v.y + 0.5, 'l\'avviso copre l\'iframe');
            await foto(computer.page, '08-connessione-persa');
            await computer.context.setOffline(false);
            await computer.page.waitForSelector('#avviso-connessione', { state: 'hidden', timeout: 30000 });
            await pausa(3000);
            computer.page.__senzaRete = false;
            vero(await canaleAzoto(computer.page) === 'livetv92', 'il player di Azoto non c\'e\' piu\' dopo la connessione persa');
        });
        await prova('riaprendo la pagina non si rifa\' l\'accesso, e il player di Azoto torna', async () => {
            await iphone.page.reload();
            await vista(iphone.page, 'diretta', 30000);
            await iframeAzotoGiusto(iphone.page, 'livetv92', 'iPhone dopo la riapertura');
        });

        /* ---------- 6. un minuto di diretta, una pausa ---------- */
        console.log('\n6. Un minuto intero di diretta (presenza per gli attestati) e una pausa');
        await prova('dopo un minuto la presenza aggiunge 60 secondi, verificati dalle regole', async () => {
            const uid = risultatiCrea.find(x => x.riga === 3).uid;
            const doc = await aspetta(async () => {
                const d = (await db.doc('presenze/' + EVENTO + '_' + uid).get()).data();
                return d && d.secondi >= 60 ? d : null;
            }, 95000, 'secondi >= 60');
            vero(doc.secondi === 60 && doc.collegamenti >= 1, JSON.stringify({ s: doc.secondi, c: doc.collegamenti }));
        });
        await prova('pausa dell\'evento: la nostra schermata AL POSTO dell\'iframe (nessuna richiesta ad Azoto); alla ripresa l\'iframe torna', async () => {
            await g({ azione: 'evento-stato', idEvento: EVENTO, stato: 'pausa', ripresa: '14:30' });
            for (const c of [computer, iphone]) {
                await vista(c.page, 'pausa');
                vero(await nessunIframe(c.page), 'il player resta in pausa');
                vero(/si riprende alle 14\.30/.test(await c.page.textContent('#pausa-titolo')), 'titolo: ' + await c.page.textContent('#pausa-titolo'));
            }
            const n = computer.richiesteAzoto.length + iphone.richiesteAzoto.length;
            await pausa(2000);
            vero(computer.richiesteAzoto.length + iphone.richiesteAzoto.length === n, 'richieste ad Azoto durante la pausa');
            vero(!(await db.doc('eventi/' + EVENTO).get()).data().videoId, 'l\'indirizzo resta nel documento pubblico in pausa');
            await g({ azione: 'evento-stato', idEvento: EVENTO, stato: 'in_onda' });
            for (const [c, nome] of [[computer, 'computer'], [iphone, 'iPhone']]) {
                await vista(c.page, 'diretta');
                await iframeAzotoGiusto(c.page, 'livetv92', nome + ' dopo la pausa');
            }
        });

        /* ---------- 7. esci e password dimenticata ---------- */
        console.log('\n7. Esci e "Password dimenticata?"');
        await prova('Esci (con conferma) riporta all\'accesso, senza player', async () => {
            await iphone.page.click('#btn-esci');
            await conferma(iphone.page);
            await vista(iphone.page, 'accesso');
            vero(await nessunIframe(iphone.page), 'il player resta dopo l\'uscita');
        });
        const RISPOSTA_DIMENTICATA = 'Se l\'indirizzo è iscritto alla diretta, tra poco ricevi un\'email con il collegamento per scegliere una nuova password. Controlla anche nella cartella Spam o Promozioni.';
        await prova('«Password dimenticata?» con l\'email: la risposta di sempre (con lo Spam e «Iscriviti qui»), il collegamento all\'indirizzo vero', async () => {
            await iphone.page.click('#link-dimenticata');
            await vista(iphone.page, 'dimenticata');
            const prima = posta().length;
            await iphone.page.fill('#email-dimenticata', 'Mario.Rossi@Esempio.it');
            await iphone.page.click('#btn-invia-reset');
            await iphone.page.waitForFunction(() => /Spam o Promozioni/.test(document.getElementById('msg-dimenticata').textContent), null, { timeout: 15000 });
            vero((await iphone.page.textContent('#msg-dimenticata')).trim() === RISPOSTA_DIMENTICATA, 'risposta: ' + await iphone.page.textContent('#msg-dimenticata'));
            vero(await iphone.page.isVisible('#frase-iscrizione-dimenticata') && (await iphone.page.textContent('#frase-iscrizione-dimenticata')).trim() === 'Non sei ancora iscritto? Iscriviti qui.',
                'sotto la risposta manca «Non sei ancora iscritto? Iscriviti qui.»');
            const m = await aspetta(() => posta().slice(prima).find(x => aIndirizzo(x, 'mario.rossi@esempio.it')), 10000, 'email di reimpostazione');
            vero(!posta().slice(prima).some(x => aIndirizzo(x, 'mario.rossi@altra.it')), 'e\' stato scritto all\'omonimo');
            vero(/Spam o Promozioni/.test(m.testo) && !/nome utente/i.test(m.testo + m.html), 'email di reimpostazione: niente Spam o un «nome utente»');
            mario.reset = linkDa(m.testo || m.html, /http:\/\/127\.0\.0\.1:\d+\/diretta\/reimposta\.html\?[^\s"<>]+/);
            vero(/\?oobCode=/.test(mario.reset) && !/@|%40|[?&]u=/.test(mario.reset), 'il collegamento: ' + mario.reset);
            await foto(iphone.page, '09-dimenticata-telefono');
        });
        await prova('«Password dimenticata?» per un\'email che non è iscritta: la stessa risposta, e non parte niente', async () => {
            const prima = posta().length;
            await iphone.page.fill('#email-dimenticata', 'nessuno.iscritto@esempio.it');
            await iphone.page.click('#btn-invia-reset');
            await iphone.page.waitForFunction(() => !document.getElementById('btn-invia-reset').disabled && /Spam o Promozioni/.test(document.getElementById('msg-dimenticata').textContent), null, { timeout: 15000 });
            vero((await iphone.page.textContent('#msg-dimenticata')).trim() === RISPOSTA_DIMENTICATA, 'risposta diversa: ' + await iphone.page.textContent('#msg-dimenticata'));
            await pausa(1500);
            vero(posta().length === prima, 'e\' partita un\'email: ' + posta().slice(prima).map(x => x.a).join(', '));
        });
        await prova('nuova password e accesso automatico alla diretta (l\'email è quella ricordata su questo telefono)', async () => {
            await iphone.page.goto(mario.reset);
            await iphone.page.waitForSelector('#form-reimposta:not([hidden])', { timeout: 20000 });
            vero(await iphone.page.inputValue('#email-reset') === 'mario.rossi@esempio.it', 'email della reimpostazione: ' + await iphone.page.inputValue('#email-reset'));
            await iphone.page.fill('#campo-nuova', 'NuovaPassword2026');
            await iphone.page.fill('#campo-ripeti', 'NuovaPassword2026');
            await foto(iphone.page, '10-reimposta-telefono');
            await iphone.page.click('#btn-salva-password');
            await iphone.page.waitForURL(/\/diretta\/(\?.*)?$/, { timeout: 30000 });
            await vista(iphone.page, 'diretta', 30000);
            await iframeAzotoGiusto(iphone.page, 'livetv92', 'iPhone dopo la nuova password');
        });
        await prova('la vecchia password non vale piu\', la nuova si', async () => {
            const vecchia = await fetch(API + '/diretta-accesso', { method: 'POST', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ azione: 'entra', email: 'mario.rossi@esempio.it', password: mario.password }) });
            vero(vecchia.status === 401, 'vecchia password: ' + vecchia.status);
            const nuova = await chiama('diretta-accesso', { azione: 'entra', email: ' Mario.Rossi@Esempio.it ', password: 'NuovaPassword2026' });
            vero(nuova.token, 'nuova password rifiutata');
        });

        /* ---------- 8. fine ed esportazione ---------- */
        console.log('\n8. Fine ed esportazione');
        await prova('il gestore termina: l\'iframe sparisce, la nostra schermata di chiusura, e l\'indirizzo esce dal documento pubblico', async () => {
            await g({ azione: 'evento-stato', idEvento: EVENTO, stato: 'terminato' });
            for (const c of [computer, iphone]) {
                await vista(c.page, 'fine');
                vero(await nessunIframe(c.page), 'il player resta a fine diretta');
                vero(await c.page.locator('#vista-fine h2').isVisible() && /La diretta è terminata/.test(await c.page.textContent('#vista-fine h2')), 'schermata di chiusura');
            }
            const pubblico = (await db.doc('eventi/' + EVENTO).get()).data();
            vero(!pubblico.videoId && pubblico.tipoPlayer === 'azoto', 'documento pubblico: ' + JSON.stringify({ v: pubblico.videoId, t: pubblico.tipoPlayer }));
            await foto(computer.page, '11-fine-computer');
        });
        await prova('esportazione: partecipanti con i minuti e registro degli accessi', async () => {
            const r = await g({ azione: 'esporta', idEvento: EVENTO });
            vero(r.partecipanti.length === 6 && r.partecipanti.every(p => !('nomeUtente' in p)), 'partecipanti: ' + r.partecipanti.length);
            vero(r.partecipanti.filter(p => p.origine === 'modulo').map(p => p.email).join() === 'luca.nuovo@esempio.it', 'origine: ' + JSON.stringify(r.partecipanti.map(p => p.origine)));
            const a = r.partecipanti.find(p => p.email === 'annamaria.deluca@esempio.it');
            vero(a && a.presenza && a.presenza.secondi >= 60, 'minuti di Anna Maria: ' + JSON.stringify(a && a.presenza));
            vero(r.accessi.length >= 4 && r.accessi.every(x => x.email && x.quando && !('nomeUtente' in x)), 'accessi: ' + r.accessi.length);
        });
        await prova('nessuna violazione della CSP e nessun errore nelle pagine né in console; mai azoto-player.js', async () => {
            const chiusi = [iphone, computer, gestione].map(c => c.page.__canaleChiuso || 0).reduce((a, b) => a + b, 0);
            if (chiusi) console.log('       (canali di ascolto di Firestore chiusi dal server e riaperti dall\'SDK: ' + chiusi + ')');
            for (const [c, nome] of [[iphone, 'iPhone'], [computer, 'computer'], [gestione, 'gestione']]) {
                const v = await c.page.evaluate(() => window.__violazioniCsp || []).catch(() => []);
                vero(v.length === 0, nome + ': CSP: ' + v.join(' | '));
                vero(c.page.__errori.length === 0, nome + ': errori: ' + c.page.__errori.join(' | '));
                vero(c.page.__console.length === 0, nome + ': errori in console: ' + c.page.__console.join(' | '));
                vero(c.richiesteAzoto.every(u => /^https:\/\/cdn\.azotosolutions\.com\/cloudtv\/livetv\d+\/player\/?$/.test(u)), nome + ': richieste ad Azoto: ' + c.richiesteAzoto.filter(u => !/cloudtv/.test(u)).join(', '));
                vero(!c.falliteAzoto.length, nome + ': richieste ad Azoto non riuscite (uscite dalle regole della prova?): ' + c.falliteAzoto.join(' | '));
            }
        });
    } catch (e) {
        rossi++;
        console.log('ROSSO (interruzione) ' + (e && e.stack || e));
    } finally {
        if (browser) await browser.close().catch(() => {});
        ferma();
    }
    console.log('\n' + verdi + ' verdi, ' + rossi + ' rossi');
    setTimeout(() => process.exit(rossi ? 1 : 0), 1500);
})();
