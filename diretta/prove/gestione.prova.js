/* ============================================================
   PROVE - la pagina di GESTIONE della diretta (/diretta/gestione/)
   contro il SERVIZIO VERO
   ------------------------------------------------------------
       cd diretta/prove && node gestione.prova.js

   Avvia da sola gli emulatori di Firebase (Firestore 8580, Auth
   9580) e server-locale.js (funzioni vere api/diretta-*.js sulla
   3580, sito sulla 8590), apre la gestione in Chromium con la
   Content-Security-Policy vera e alla fine chiude tutto.

   IL SERVIZIO E' QUELLO VERO. Ogni chiamata della pagina arriva alle
   funzioni di email-service (diretta-gestione, diretta-accesso,
   diretta-cron) che leggono e scrivono gli emulatori; le email vanno
   nella posta finta del servizio (risultati/posta-gestione.jsonl,
   DIRETTA_POSTA_FINTA), da cui la prova legge i collegamenti e le
   password come farebbe una persona dalla sua casella.

   COME SI OTTENGONO I CASI DIFFICILI, senza fingere le risposte:
   - il gestore si attiva con «Primo accesso» (gestore-accesso): il
     collegamento arriva nella posta finta e la nuova password si
     sceglie con l'emulatore di Auth (accounts:resetPassword, quello
     che fa reimposta.html con confirmPasswordReset);
   - il caricamento "contemporaneo" di un altro gestore e' una
     chiamata vera a 'crea' fatta da qui, fra l'anteprima e la
     creazione;
   - il blocco di Brevo, il tetto giornaliero e il giro automatico
     lento si ottengono RIAVVIANDO server-locale.js con gli interruttori
     della posta finta del servizio (DIRETTA_POSTA_ERRORE_ACCOUNT=1:
     accesso SMTP rifiutato; DIRETTA_MAX_GIORNO; DIRETTA_POSTA_RITARDO_MS)
     e chiamando davvero api/diretta-cron;
   - i segnali di presenza (che scrive la pagina dei partecipanti) si
     scrivono con firebase-admin nei documenti presenze/, e gli accessi
     sono chiamate vere a diretta-accesso 'entra' con le password lette
     dalle email.
   UNICO context.route (page.route) DELLA PROVA: la rete che cade
   durante 'crea', per provare «Riprendi». Il primo tentativo del
   secondo gruppo arriva al servizio ma la risposta si perde (la
   creazione e' avvenuta), i due seguenti non partono proprio: e' il
   guasto che il servizio vero non sa produrre a comando. Tutte le
   altre risposte sono quelle del servizio.

   COSA DIMOSTRA. Accesso del gestore (password sbagliata, account fuori
   elenco, account "registrato da solo" che perde l'accesso e primo
   accesso con il collegamento); creazione dell'evento di Napoli;
   caricamento di esempio-partecipanti.csv con ogni problema evidenziato
   e il pulsante di creazione spento; correzioni in linea, esclusione e
   conferma degli omonimi; creazione a gruppi di 25 con un nome preso nel
   frattempo e la rete che cade (Riprendi, zero doppioni); elenco con
   ricerca; invio singolo, reinvio rifiutato entro un minuto (409 con il
   testo del servizio), nuova password, disattivazione, correzioni (R3,
   anche «Rossii» -> «Rossi» a credenziali partite: la finestra chiede se
   mantenere il nome utente); regia (in onda, pausa con il video tolto ai
   partecipanti, cambio del video provato prima, messaggio sul link che
   segue NGBPlayer.nome, avviso, contatore dei collegati); il video
   cambiato dalla scheda Evento (provato con il player, e mai rimesso
   vecchio da un modulo aperto da tempo); email di prova, invio a tutti
   fermato da Brevo, «Riprova adesso», tetto del giorno, giro automatico
   che lavora insieme alla pagina, reinvio a chi non l'ha ricevuta, esiti
   senza BREVO_API_KEY; esportazione in Excel con due fogli; la testata
   compatta sul telefono (390 e 360 px). Il file di esempio usa solo
   indirizzi su domini riservati (example.com, .example, .invalid).
   Screenshot in risultati/screenshot-gestione/ (computer 1440x900, tablet
   820x1180, testata del telefono). Esce con 1 se qualcosa e' rosso.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const PORTE = { firestore: 8580, auth: 9580, api: 3580, statico: 8590 };
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:' + PORTE.auth;
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:' + PORTE.firestore;

const RADICE = path.resolve(__dirname, '../..');
const RISULTATI = path.join(__dirname, 'risultati');
const FOTO = path.join(RISULTATI, 'screenshot-gestione');
const POSTA = path.join(RISULTATI, 'posta-gestione.jsonl');
fs.mkdirSync(FOTO, { recursive: true });

const admin = require(path.join(RADICE, 'email-service/node_modules/firebase-admin'));
const { chromium } = require('./node_modules/playwright');
const { preparaContesto } = require('./rete-prove');

const SITO = 'http://127.0.0.1:' + PORTE.statico;
const API = 'http://127.0.0.1:' + PORTE.api + '/api';
const AUTH_REST = 'http://127.0.0.1:' + PORTE.auth + '/identitytoolkit.googleapis.com/v1';
const EMAIL_GESTORE = 'gestore@prova.it';
const PASSWORD_GESTORE = 'Gestione-2026-prova';
// la password di chi si era "registrato da solo" con l'email del gestore
const PASSWORD_ABUSIVA = 'Mi-registro-da-solo-1';
const EMAIL_CURIOSO = 'curioso@prova.it';
const PASSWORD_CURIOSO = 'Curioso-2026-prova';
const ID = 'napoli-2026';
const SHEETJS_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
const SHEETJS_IMPRONTA = 'sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT';
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
// l'alfabeto di lib/diretta-password.js: niente 0/O/o, 1/l/I/i
const RE_PASSWORD = /^[A-HJKMNP-Za-hjkmnp-z2-9]{10}$/;

/* Le variabili del servizio in ogni fase della prova. La base e' quella
   chiesta: posta finta nella cartella risultati/, un solo gestore, e
   l'indirizzo di Chloé che il "server di posta" rifiuta (550). */
const SERVIZIO_BASE = {
    DIRETTA_POSTA_FINTA: POSTA,
    DIRETTA_ADMIN_EMAILS: EMAIL_GESTORE,
    DIRETTA_POSTA_RIFIUTA: 'chloe.dupont@dupont.invalid',
    DIRETTA_MAX_GIORNO: '0',
    DIRETTA_POSTA_ERRORE_ACCOUNT: '',
    DIRETTA_POSTA_RITARDO_MS: '0'
};

let rossi = 0, verdi = 0;
function vero(cond, descrizione, dettaglio) {
    if (cond) { verdi++; console.log('  ok  ' + descrizione); }
    else { rossi++; console.log('ROSSO ' + descrizione + (dettaglio !== undefined ? '\n       ' + String(dettaglio).slice(0, 600) : '')); }
    return !!cond;
}
const pausa = ms => new Promise(r => setTimeout(r, ms));

/* ---------- processi di appoggio ---------- */
function avvia(argomenti, pronto, nome, env) {
    return new Promise((risolvi, rifiuta) => {
        const figlio = spawn(process.execPath, argomenti, {
            cwd: __dirname, stdio: ['ignore', 'pipe', 'pipe'],
            env: Object.assign({}, process.env, { FORCE_COLOR: '0' }, env || {})
        });
        figlio.uscita = '';
        let partito = false;
        const limite = setTimeout(() => { figlio.kill('SIGTERM'); rifiuta(new Error(nome + ' non partito in tempo:\n' + figlio.uscita.slice(-2000))); }, 150000);
        const leggi = d => {
            figlio.uscita = (figlio.uscita + d.toString()).slice(-200000);
            if (!partito && pronto.test(figlio.uscita)) { partito = true; clearTimeout(limite); risolvi(figlio); }
        };
        figlio.stdout.on('data', leggi);
        figlio.stderr.on('data', leggi);
        figlio.on('exit', c => { clearTimeout(limite); if (!partito) rifiuta(new Error(nome + ' uscito (' + c + '):\n' + figlio.uscita.slice(-2000))); });
    });
}
function ferma(figlio) {
    return new Promise(r => {
        if (!figlio || figlio.exitCode !== null) return r();
        figlio.removeAllListeners('exit');
        figlio.on('exit', () => r());
        figlio.kill('SIGINT');
        setTimeout(() => { try { figlio.kill('SIGKILL'); } catch (_) { /* gia' fermo */ } r(); }, 8000);
    });
}

let server = null;
const uscitaServer = [];
async function avviaServer(extra, descrizione, fermo) {
    // prima di spegnerlo si aspetta che la pagina non abbia richieste in viaggio
    if (fermo) await fermo();
    if (server) { uscitaServer.push(server.uscita); await ferma(server); server = null; }
    const env = Object.assign({}, SERVIZIO_BASE, extra || {});
    server = await avvia([path.join(__dirname, 'server-locale.js'), '--api', String(PORTE.api), '--statico', String(PORTE.statico),
        '--firestore', String(PORTE.firestore), '--auth', String(PORTE.auth)], /SERVER LOCALE PRONTO/, 'server locale', env);
    if (descrizione) console.log('   (servizio riavviato: ' + descrizione + ')');
    return server;
}

/* ---------- il servizio visto da qui (come farebbe un altro gestore) ---------- */
async function postJSON(url, corpo, intestazioni) {
    const r = await fetch(url, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, intestazioni || {}), body: JSON.stringify(corpo) });
    let j = null;
    try { j = await r.json(); } catch (_) { j = null; }
    return { stato: r.status, dati: j };
}
async function api(funzione, corpo, token, intestazioni) {
    return postJSON(API + '/' + funzione, corpo, Object.assign(token ? { Authorization: 'Bearer ' + token } : {}, intestazioni || {}));
}
async function tokenDi(email, password) {
    const r = await postJSON(AUTH_REST + '/accounts:signInWithPassword?key=finta', { email: email, password: password, returnSecureToken: true });
    return r.stato === 200 ? r.dati.idToken : null;
}

/* ---------- la posta finta ---------- */
function leggiPosta() {
    if (!fs.existsSync(POSTA)) return [];
    return fs.readFileSync(POSTA, 'utf8').split('\n').filter(Boolean).map(r => JSON.parse(r));
}
const postaPer = (indirizzo, tipo) => leggiPosta().filter(m => m.a === indirizzo && (!tipo || m.tipo === tipo));
function passwordDa(messaggio) {
    const m = /Password:\s*(\S+)/.exec(String(messaggio && messaggio.testo || ''));
    return m ? m[1] : '';
}

/* ---------- SheetJS anche in Node, per rileggere l'Excel scaricato ---------- */
async function sheetJSNode() {
    const k = crypto.createHash('sha256').update(SHEETJS_URL).digest('hex').slice(0, 40);
    const cache = path.join(RISULTATI, 'cache-rete');
    fs.mkdirSync(cache, { recursive: true });
    const bin = path.join(cache, k + '.bin');
    if (!fs.existsSync(bin)) {
        const r = await fetch(SHEETJS_URL);
        if (!r.ok) throw new Error('SheetJS non scaricata: ' + r.status);
        fs.writeFileSync(bin, Buffer.from(await r.arrayBuffer()));
        fs.writeFileSync(path.join(cache, k + '.json'), JSON.stringify({ stato: 200, tipo: r.headers.get('content-type') || 'application/javascript' }));
    }
    const dati = fs.readFileSync(bin);
    const impronta = 'sha384-' + crypto.createHash('sha384').update(dati).digest('base64');
    const copia = path.join(RISULTATI, 'xlsx-node.js');
    fs.writeFileSync(copia, dati);
    return { XLSX: require(copia), impronta: impronta };
}

/* ============================================================
   LA PROVA
   ============================================================ */
(async () => {
    let emulatori = null, browser = null;
    const t0 = Date.now();
    try {
        const { XLSX, impronta } = await sheetJSNode();
        vero(impronta === SHEETJS_IMPRONTA, 'SheetJS 0.20.3 dalla CDN ufficiale: l\'impronta del file coincide con quella scritta nella pagina');
        const codiceGestione = fs.readFileSync(path.join(RADICE, 'diretta/gestione/gestione.js'), 'utf8');
        vero(codiceGestione.includes(SHEETJS_IMPRONTA) && codiceGestione.includes(SHEETJS_URL), 'la gestione carica SheetJS con URL e integrity della decisione D15');
        const htmlGestione = fs.readFileSync(path.join(RADICE, 'diretta/gestione/index.html'), 'utf8');
        vero(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(htmlGestione) && !/\son[a-z]+=/i.test(htmlGestione), 'nessuno script in linea e nessun gestore on...= nell\'HTML (CSP)');
        vero(!/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML/.test(codiceGestione), 'gestione.js non usa innerHTML/outerHTML/insertAdjacentHTML (D3)');
        vero(!/Non riconosco un video YouTube/.test(codiceGestione) && /P\.nome/.test(codiceGestione),
            'i messaggi sul link del video non nominano YouTube: dipendono da NGBPlayer.nome (per cambiare piattaforma)');
        const csvEsempio = fs.readFileSync(path.join(__dirname, 'esempio-partecipanti.csv'), 'utf8');
        const indirizziEsempio = csvEsempio.split(/\r?\n/).slice(1).map(r => (r.split(';')[2] || '').trim()).filter(e => e.includes('@'));
        const riservato = e => /@(?:[^@\s]+\.)?(example\.com|example\.org|example\.net)$|\.(example|test|invalid)$/i.test(e);
        vero(indirizziEsempio.length === 41 && indirizziEsempio.every(riservato),
            'esempio-partecipanti.csv: tutti gli indirizzi (' + indirizziEsempio.length + ') su domini riservati che non ricevono posta (example.com, .example, .invalid…)',
            indirizziEsempio.filter(e => !riservato(e)).join(', '));

        console.log('\n-- avvio di emulatori e servizio vero (porte ' + JSON.stringify(PORTE) + ')');
        try { fs.unlinkSync(POSTA); } catch (_) { /* non c'era */ }
        emulatori = await avvia([path.join(__dirname, 'avvia-emulatori.js'), '--firestore', String(PORTE.firestore), '--auth', String(PORTE.auth)], /EMULATORI PRONTI/, 'emulatori');
        await avviaServer();

        const app = admin.initializeApp({ projectId: 'demo-ngb-eventi' }, 'prova-gestione');
        const auth = app.auth();
        const db = app.firestore();
        const Ts = admin.firestore.Timestamp;
        // qualcuno fuori elenco, e qualcuno che si e' registrato da solo con l'email del gestore
        await auth.createUser({ email: EMAIL_CURIOSO, password: PASSWORD_CURIOSO, emailVerified: true });
        await auth.createUser({ email: EMAIL_GESTORE, password: PASSWORD_ABUSIVA, emailVerified: false });

        const partecipante = async nome => {
            const s = await db.collection('partecipanti').where('nomeUtente', '==', nome).get();
            return s.empty ? null : Object.assign({ uid: s.docs[0].id }, s.docs[0].data());
        };
        const uidDi = async nome => ((await partecipante(nome)) || {}).uid;
        const delEvento = async () => (await db.collection('partecipanti').where('eventi', 'array-contains', ID).get()).docs.map(d => Object.assign({ uid: d.id }, d.data()));
        const statiEmail = async () => {
            const k = {};
            (await delEvento()).forEach(p => { const s = ((p.invii || {})[ID] || {}).stato || 'da inviare'; k[s] = (k[s] || 0) + 1; });
            return k;
        };

        // lingua del sistema italiana: i campi data e ora del browser si mostrano
        // come li vede il gestore (14:30 e 02/10/2026, non 02:30 PM e 10/02/2026)
        browser = await chromium.launch({
            executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--lang=it-IT'],
            env: Object.assign({}, process.env, { LANG: 'it_IT.UTF-8', LANGUAGE: 'it', LC_ALL: 'it_IT.UTF-8' })
        });
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, locale: 'it-IT', timezoneId: 'Europe/Rome' });
        await preparaContesto(context, {});
        await context.addInitScript(p => {
            window.NGB_DIRETTA_PROVE = p;
            /* Solo un cronometro: quando partono e quando tornano le chiamate
               della pagina al servizio, misurato DENTRO la pagina (serve alla
               pausa fra i gruppi di 'crea'; da fuori i tempi arrivano sfasati). */
            window.__tempiServizio = [];
            const fetchVero = window.fetch;
            window.fetch = function (indirizzo, opzioni) {
                const voce = { azione: '', inizio: performance.now(), fine: null };
                if (typeof indirizzo === 'string' && /\/api\/diretta-/.test(indirizzo)) {
                    try { voce.azione = JSON.parse((opzioni && opzioni.body) || '{}').azione || ''; } catch (_) { /* niente */ }
                    window.__tempiServizio.push(voce);
                }
                return fetchVero.apply(this, arguments).then(
                    r => { voce.fine = performance.now(); return r; },
                    e => { voce.fine = performance.now(); throw e; });
            };
            window.__violazioniCSP = [];
            document.addEventListener('securitypolicyviolation', e => {
                window.__violazioniCSP.push(e.violatedDirective + ' ' + e.blockedURI + ' ' + (e.sourceFile || ''));
            });
        }, { firestore: PORTE.firestore, auth: PORTE.auth, api: API });

        const page = await context.newPage();
        const erroriConsole = [];
        const erroriPagina = [];
        page.on('console', m => { if (m.type() === 'error') erroriConsole.push(m.text()); });
        page.on('pageerror', e => erroriPagina.push(e.message));

        /* Il registro delle chiamate della pagina al servizio: si guarda, non
           si tocca (page.on). Le risposte di email-avanza servono a vedere
           come la pagina segue la coda. */
        const registro = [];
        const risposteAvanza = [];
        page.on('request', req => {
            if (req.method() !== 'POST' || !/\/api\/diretta-(gestione|accesso)$/.test(req.url())) return;
            let dati = {};
            try { dati = JSON.parse(req.postData() || '{}'); } catch (_) { dati = {}; }
            registro.push({ azione: dati.azione, dati: dati, quando: Date.now() });
        });
        page.on('requestfinished', async req => {
            if (req.method() !== 'POST' || !/\/api\/diretta-gestione$/.test(req.url())) return;
            let dati = {};
            try { dati = JSON.parse(req.postData() || '{}'); } catch (_) { return; }
            if (dati.azione === 'email-avanza') {
                const risposta = await req.response().catch(() => null);
                const j = risposta ? await risposta.json().catch(() => null) : null;
                risposteAvanza.push({ quando: Date.now(), dati: j });
            }
        });
        const chiamate = azione => registro.filter(c => c.azione === azione);
        // le richieste della pagina al servizio ancora in viaggio (prima di riavviarlo)
        let inViaggio = 0;
        const eDelServizio = req => /\/api\/diretta-/.test(req.url()) && req.method() === 'POST';
        page.on('request', req => { if (eDelServizio(req)) inViaggio++; });
        page.on('requestfinished', req => { if (eDelServizio(req)) inViaggio--; });
        page.on('requestfailed', req => { if (eDelServizio(req)) inViaggio--; });

        /* L'unico guasto finto: la rete che cade durante 'crea'. */
        const creaRichieste = [];
        const guastoCrea = { restanti: 0, perse: 0 };
        await page.route(API + '/diretta-gestione', async route => {
            const req = route.request();
            let dati = {};
            try { dati = JSON.parse(req.postData() || '{}'); } catch (_) { dati = {}; }
            if (req.method() !== 'POST' || dati.azione !== 'crea') return route.continue();
            const n = creaRichieste.length;
            creaRichieste.push({ quando: Date.now(), righe: (dati.righe || []).length, emails: (dati.righe || []).map(r => r.email).join('|'), esito: 'passata' });
            if (n >= 1 && guastoCrea.restanti > 0) {
                guastoCrea.restanti--;
                if (guastoCrea.perse > 0) {
                    // arriva al servizio (che crea gli account), ma la risposta si perde
                    guastoCrea.perse--;
                    creaRichieste[n].esito = 'risposta persa';
                    await route.fetch().catch(() => null);
                    return route.abort('connectionreset');
                }
                creaRichieste[n].esito = 'non partita';
                return route.abort('internetdisconnected');
            }
            return route.continue();
        });

        await page.clock.install();

        const $ = s => page.locator(s);
        const testo = async s => (await $(s).textContent() || '').trim();
        const visibile = s => $(s).isVisible();
        const aspetta = async (fn, ms, descr) => {
            const fine = Date.now() + (ms || 10000);
            let ultimo;
            while (Date.now() < fine) {
                try { ultimo = await fn(); if (ultimo) return ultimo; } catch (e) { ultimo = e.message; }
                await pausa(100);
            }
            throw new Error('Tempo scaduto: ' + (descr || '') + ' (' + ultimo + ')');
        };
        /* Le foto a pagina intera non ricalcolano gli elementi "appiccicati"
           (la testata, il piede dell'anteprima) ne' quelli fissi (gli avvisi):
           li disegnerebbero a meta' pagina, sopra le righe. Solo per la foto
           si rimettono al loro posto nel flusso della pagina. */
        async function foto(nome, soloVista) {
            const stile = soloVista ? null : await page.addStyleTag({ content: '.testata,.anteprima-piede{position:static!important}.avvisi{display:none!important}' });
            await page.evaluate(() => window.scrollTo(0, 0));
            for (const [dispositivo, vista] of [['computer', { width: 1440, height: 900 }], ['tablet', { width: 820, height: 1180 }]]) {
                await page.setViewportSize(vista);
                await pausa(300);
                await page.screenshot({ path: path.join(FOTO, dispositivo + '-' + nome + '.png'), fullPage: !soloVista });
            }
            if (stile) await stile.evaluate(n => n.remove());
            await page.setViewportSize({ width: 1440, height: 900 });
            await pausa(150);
        }
        async function confermaDialogo(atteso) {
            await $('#dialogo-conferma').waitFor({ state: 'visible', timeout: 5000 });
            const titolo = await testo('#conferma-titolo');
            const corpo = await testo('#conferma-testo') + ' ' + await testo('#conferma-dettagli');
            if (atteso) vero(atteso.test(titolo + ' ' + corpo), 'conferma chiesta: «' + titolo + '»', corpo);
            await $('#conferma-ok').click();
            await $('#dialogo-conferma').waitFor({ state: 'hidden', timeout: 5000 });
            return titolo + ' ' + corpo;
        }
        const calma = () => aspetta(async () => { if (inViaggio > 0) return false; await pausa(400); return inViaggio === 0; }, 20000, 'richieste in viaggio');
        const riga = n => $('#tabella-anteprima tr[data-riga="' + n + '"]');
        const classeRiga = async n => (await riga(n).getAttribute('class')) || '';
        const avvisi = async () => (await $('#avvisi').textContent()) || '';

        /* ---------- 1. accesso e attivazione del gestore ---------- */
        console.log('\n-- accesso del gestore');
        await page.goto(SITO + '/diretta/gestione/?emulatori=1');
        await $('#form-gestore').waitFor({ state: 'visible', timeout: 30000 });
        vero(await page.evaluate(() => !!document.querySelector('meta[http-equiv="Content-Security-Policy"]')), 'la pagina ha la Content-Security-Policy');
        await foto('accesso', true);
        await $('#gestore-email').fill(EMAIL_GESTORE);
        await $('#gestore-password').fill('sbagliata-123');
        await $('#btn-gestore-entra').click();
        await aspetta(async () => /non corretti/.test(await testo('#msg-gestore')), 10000, 'messaggio password sbagliata');
        vero(true, 'password sbagliata: «' + await testo('#msg-gestore') + '»');

        await $('#gestore-email').fill(EMAIL_CURIOSO);
        await $('#gestore-password').fill(PASSWORD_CURIOSO);
        await $('#btn-gestore-entra').click();
        await aspetta(async () => /non è tra i gestori/.test(await testo('#msg-gestore')) && await visibile('#form-gestore'), 15000, 'rifiuto del non gestore');
        vero(true, 'un account che non è in elenco viene respinto dal servizio e scollegato: «' + await testo('#msg-gestore') + '»');

        // l'email e' in elenco, ma l'account l'aveva creato qualcun altro (con la chiave pubblica si puo')
        await $('#gestore-email').fill(EMAIL_GESTORE);
        await $('#gestore-password').fill(PASSWORD_ABUSIVA);
        await $('#btn-gestore-entra').click();
        await aspetta(async () => /Primo accesso o password dimenticata/.test(await testo('#msg-gestore')) && await visibile('#form-gestore'), 15000, 'gestore non attivato');
        vero(true, 'email in elenco ma account non attivato: il servizio lo rifiuta e indica la strada: «' + await testo('#msg-gestore') + '»');

        await $('#gestore-password').fill('');
        await $('#link-gestore-reset').click();
        await aspetta(async () => /tra i gestori/.test(await testo('#msg-gestore')), 15000, 'primo accesso');
        const ga = chiamate('gestore-accesso');
        vero(ga.length === 1 && ga[0].dati.email === EMAIL_GESTORE, '«Primo accesso o password dimenticata» chiama diretta-accesso {azione: gestore-accesso} con l\'email scritta');
        const lettera = postaPer(EMAIL_GESTORE, 'reimpostazione').pop();
        const link = lettera && /https?:\/\/\S+?reimposta\.html\?oobCode=[^\s"<]+/.exec(lettera.testo + ' ' + lettera.html);
        vero(!!link && link[0].startsWith(SITO + '/diretta/reimposta.html?oobCode=') && /[?&]per=gestione\b/.test(link[0]),
            'nella casella del gestore arriva il collegamento per la password (reimposta.html?…&per=gestione)', link && link[0]);
        vero(!(await tokenDi(EMAIL_GESTORE, PASSWORD_ABUSIVA)), 'chi si era registrato da solo con quell\'email perde l\'accesso: la sua password non vale più (D2)');
        const oob = new URL(link[0].replace(/&amp;/g, '&')).searchParams.get('oobCode');
        const reset = await postJSON(AUTH_REST + '/accounts:resetPassword?key=finta', { oobCode: oob, newPassword: PASSWORD_GESTORE });
        vero(reset.stato === 200, 'il collegamento funziona: la nuova password del gestore è impostata (come fa reimposta.html)', JSON.stringify(reset.dati));
        const utenteGestore = await auth.getUserByEmail(EMAIL_GESTORE);
        vero(utenteGestore.customClaims && utenteGestore.customClaims.gestore === true && utenteGestore.emailVerified === true,
            'l\'account di gestione ora ha il claim «gestore» e l\'email verificata (messi solo dal servizio)');

        // un evento passato, preparato con il servizio vero dal "gestore" stesso
        const tokGestore = await tokenDi(EMAIL_GESTORE, PASSWORD_GESTORE);
        const s1 = await api('diretta-gestione', { azione: 'evento-salva', evento: { id: 'roma-2026', nuovo: true, titolo: 'Next Generation Business 2026 · Roma', luogo: 'Roma', data: '2026-04-17', oraInizio: '09:00', oraFine: '17:00', videoUrl: '', programma: [], paginaEvento: '/roma_aprile_2026/' } }, tokGestore);
        const s2 = await api('diretta-gestione', { azione: 'crea', idEvento: 'roma-2026', righe: [
            { riga: 2, nome: 'Mario', cognome: 'Rossi', email: 'mario.rossi@altra-azienda.example', azienda: 'Altra Azienda S.p.A.' },
            { riga: 3, nome: 'Giulia', cognome: 'Ferri', email: 'giulia.ferri@ferri-consulting.example', azienda: 'Ferri Consulting' }
        ] }, tokGestore);
        const s3 = await api('diretta-gestione', { azione: 'evento-stato', idEvento: 'roma-2026', stato: 'terminato' }, tokGestore);
        vero(s1.stato === 200 && s2.stato === 200 && s3.stato === 200 && s2.dati.risultati.every(x => x.esito === 'creato'),
            'preparato con il servizio l\'evento passato di Roma, con Mario Rossi e Giulia Ferri', JSON.stringify([s1.dati, s2.dati, s3.dati]).slice(0, 400));

        await $('#gestore-password').fill(PASSWORD_GESTORE);
        await $('#btn-gestore-entra').click();
        await $('#vista-app').waitFor({ state: 'visible', timeout: 20000 });
        vero(await testo('#gestore-connesso') === EMAIL_GESTORE, 'gestore collegato con la password scelta dal collegamento: la testata mostra la sua email');
        await aspetta(async () => await $('#sel-evento').inputValue() === 'roma-2026', 10000, 'elenco degli eventi');
        vero(await page.locator('#sel-evento option[value="roma-2026"]').count() === 1 && /Dati dell'evento/.test(await testo('#titolo-form-evento')),
            'l\'elenco degli eventi arriva dal servizio (azione eventi) e si apre l\'ultimo evento');

        /* ---------- 2. evento di Napoli ---------- */
        console.log('\n-- creazione dell\'evento di Napoli');
        await $('#btn-nuovo-evento').click();
        vero(await $('#tab-partecipanti').isDisabled(), 'con un evento nuovo non ancora salvato le altre schede sono spente');
        await $('#ev-titolo').fill('Next Generation Business 2026 · Napoli');
        await $('#ev-luogo').fill('Napoli · Hotel Eurostars Excelsior');
        await $('#ev-data').fill('2026-10-02');
        vero(await $('#ev-id').inputValue() === ID, 'identificativo proposto dal luogo e dall\'anno: ' + await $('#ev-id').inputValue());
        await $('#ev-ora-inizio').fill('17:30');
        await $('#ev-ora-fine').fill('09:00');
        await $('#ev-video').fill('https://www.youtube.com/live/abcdefghijk');
        await $('#ev-programma').fill('09.00 Accoglienza e registrazione\n09.30 Saluti istituzionali\n10:00 - Adeguati assetti e governance\n13.00 Pausa pranzo\n17.30 Chiusura dei lavori');
        await $('#ev-pagina').fill('napoli_ottobre_2026');
        await $('#ev-promemoria-giorno').check();
        await $('#btn-salva-evento').click();
        vero(await $('#ev-ora-fine').getAttribute('aria-invalid') === 'true' && /dopo quella di inizio/.test(await testo('#msg-evento')), 'fine prima dell\'inizio: errore sul campo, niente chiamata al servizio');
        vero(chiamate('evento-salva').length === 0, 'nessun salvataggio con dati sbagliati');
        await $('#ev-ora-inizio').fill('09:00');
        await $('#ev-ora-fine').fill('17:30');
        await $('#btn-salva-evento').click();
        await aspetta(async () => /Evento creato/.test(await testo('#msg-evento')), 10000, 'evento creato');
        const salvato = chiamate('evento-salva')[0].dati.evento;
        vero(salvato.nuovo === true && salvato.id === ID && salvato.paginaEvento === '/napoli_ottobre_2026/' && salvato.videoId === 'abcdefghijk',
            'evento-salva riceve id, pagina normalizzata e videoId ricavato dal link', JSON.stringify(salvato));
        vero(salvato.programma.length === 5 && salvato.programma[2].ora === '10.00' && salvato.programma[2].titolo === 'Adeguati assetti e governance',
            'programma letto riga per riga ("10:00 - Titolo" diventa {ora: "10.00", titolo})', JSON.stringify(salvato.programma));
        const [docEv, docRis] = await Promise.all([db.doc('eventi/' + ID).get(), db.doc('eventiRiservati/' + ID).get()]);
        vero(docEv.exists && docEv.data().videoId === '' && !('videoUrl' in docEv.data()) && docRis.data().videoId === 'abcdefghijk'
            && docEv.data().inizio.toMillis() === Date.parse('2026-10-02T09:00:00+02:00') && docEv.data().programma.length === 5,
            'sul servizio: evento con inizio alle 9.00 di Roma, e il video solo nel documento riservato finché non si va in onda (D6)');
        vero(await $('#sel-evento').inputValue() === ID && await testo('#stato-testata') === 'In attesa', 'evento selezionato, stato «In attesa» in testata');
        vero(await $('#ev-id').evaluate(n => n.readOnly), 'dopo la creazione l\'identificativo non si cambia più');
        await foto('evento');

        /* ---------- 3. caricamento e anteprima ---------- */
        console.log('\n-- caricamento di esempio-partecipanti.csv');
        await page.click('[data-scheda="partecipanti"]');
        const [modello] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), $('#link-modello').click()]);
        const testoModello = fs.readFileSync(await modello.path(), 'utf8');
        vero(modello.suggestedFilename() === 'modello-partecipanti.csv' && /^﻿nome;cognome;email;azienda\r\n/.test(testoModello), '«Scarica il modello CSV»: nome;cognome;email;azienda, con il BOM per Excel');
        await $('#file-partecipanti').setInputFiles(path.join(__dirname, 'esempio-partecipanti.csv'));
        await $('#anteprima-caricamento').waitFor({ state: 'visible', timeout: 20000 });
        await aspetta(async () => (await $('#tabella-anteprima tbody tr').count()) === 42 && /righe lette/.test(await testo('#riepilogo-anteprima')), 15000, 'anteprima con 42 righe');
        vero(true, 'anteprima: 42 righe (la riga vuota del file è saltata)');
        const attese = {
            2: ['esito-nuovo', 'omonimo', 'da-confermare'], 3: ['esito-nuovo', 'omonimo'], 4: ['esito-nuovo'], 5: ['esito-esistente'],
            6: ['esito-errore'], 7: ['esito-errore'], 8: ['esito-errore'], 9: ['esito-errore'], 10: ['esito-doppione'],
            11: ['esito-nuovo', 'omonimo', 'da-confermare'], 12: ['esito-nuovo', 'omonimo', 'da-confermare'], 13: ['esito-nuovo'],
            20: ['esito-nuovo', 'omonimo', 'da-confermare'], 31: ['esito-nuovo', 'omonimo', 'da-confermare'], 32: ['esito-errore'],
            34: ['esito-doppione'], 36: ['esito-doppione', 'da-confermare']
        };
        for (const n of Object.keys(attese)) {
            const cl = await classeRiga(n);
            vero(attese[n].every(c => cl.split(/\s+/).includes(c)), 'riga ' + n + ': ' + attese[n].join(' '), cl);
        }
        const nu = async n => riga(n).locator('input.nome-utente-riga').inputValue();
        vero(await nu(2) === 'mariorossi2' && await nu(11) === 'mariorossi3' && await nu(12) === 'mariorossi4', 'omonimi numerati: mariorossi2, mariorossi3, mariorossi4 (mariorossi è già di Mario Rossi di Roma)');
        vero(await nu(13) === 'ivanpetrov' && await nu(4) === 'nicolodangelo' && await nu(24) === 'carmeladauria' && await nu(25) === 'carloconti',
            'nomi utente: cirillico traslitterato, accenti e apostrofi (anche tipografici) tolti, spazi ripuliti');
        vero(await nu(5) === 'giuliaferri' && await riga(5).locator('input.nome-utente-riga').evaluate(n => n.readOnly), 'persona già presente (email con maiuscole e spazi): nome utente esistente, non modificabile');
        const problemi2 = await riga(2).locator('.problemi').textContent();
        vero(/Mario Rossi, Altra Azienda S\.p\.A\., m\*\*\*@altra-azienda\.example/.test(problemi2), 'l\'omonimo dice chi usa già il nome, con l\'email mascherata (dettagliOccupati del servizio)', problemi2);
        vero(await riga(2).locator('input.conferma-omonimo').count() === 1 && await riga(4).locator('input.conferma-omonimo').count() === 0, 'la casella di conferma c\'è solo sugli omonimi numerati');
        vero(await riga(36).locator('input.conferma-doppione').count() === 1, 'stessa email con nome diverso: casella «È la stessa persona»');
        vero(await riga(6).locator('input.campo-email').getAttribute('aria-invalid') === 'true', 'email mancante: campo segnato');
        vero(await $('#btn-crea-account').isDisabled(), 'con errori e omonimi da confermare il pulsante di creazione è spento');
        vero(/correggi o escludi 5 righe in errore/.test(await testo('#motivo-blocco')) && /conferma 5 omonimi/.test(await testo('#motivo-blocco')), 'il motivo del blocco è spiegato: «' + await testo('#motivo-blocco') + '»');
        const primaAnteprima = chiamate('anteprima')[0].dati;
        vero(primaAnteprima.emails.length === 37 && primaAnteprima.basi.includes('mariorossi') && primaAnteprima.idEvento === ID, 'anteprima: una chiamata con le email valide (' + primaAnteprima.emails.length + ') e le basi del file');
        const visibili = () => page.evaluate(() => Array.from(document.querySelectorAll('#tabella-anteprima tbody tr')).filter(t => !t.hidden).length);
        vero(await $('input[name="filtro-anteprima"][value="problemi"]').isChecked() && await visibili() === 16, 'con dei problemi si parte dal filtro «Solo da controllare» (16 righe)', await visibili());
        await foto('anteprima');
        await page.click('input[name="filtro-anteprima"][value="da-sistemare"] >> xpath=..');
        vero(await visibili() === 11, 'filtro «Solo da sistemare»: 11 righe (5 errori, 6 da confermare)', await visibili());
        await page.click('input[name="filtro-anteprima"][value="tutte"] >> xpath=..');
        vero(await visibili() === 42, 'filtro «Tutte»: 42 righe');

        console.log('\n-- correzioni in linea');
        const nAnteprima = chiamate('anteprima').length;
        await riga(7).locator('input.campo-email').fill('francesca.esposito@esposito.example');
        await aspetta(async () => (await classeRiga(7)).includes('esito-nuovo'), 5000, 'riga 7 corretta');
        vero(true, 'riga 7: email corretta, ora «nuovo account»');
        await riga(6).locator('input.campo-email').fill('luca.bianchi@bianchi-impianti.example');
        await riga(9).locator('input.campo-cognome').fill('Verdi');
        await riga(8).locator('input.escludi-riga').check();
        await riga(32).locator('input.nome-utente-riga').fill('wangxiaoming');
        await riga(36).locator('input.campo-email').fill('marco.galli@studiogalli.example');
        await aspetta(async () => (await classeRiga(8)).includes('esito-escluso') && (await classeRiga(6)).includes('esito-nuovo')
            && (await classeRiga(9)).includes('esito-nuovo') && (await classeRiga(32)).includes('esito-nuovo') && (await classeRiga(36)).includes('esito-nuovo'), 5000, 'correzioni');
        vero(true, 'righe 6, 9, 32, 36 corrette e riga 8 esclusa');
        vero(await nu(9) === 'paoloverdi' && await nu(32) === 'wangxiaoming' && await nu(36) === 'marcogalli', 'il nome utente segue le correzioni (anche quello scritto a mano)');
        await aspetta(() => chiamate('anteprima').length > nAnteprima, 5000, 'nuova anteprima');
        await aspetta(async () => !/Controllo dei dati/.test(await testo('#motivo-blocco')), 5000, 'fine controllo');
        const seconde = chiamate('anteprima').slice(nAnteprima).map(c => c.dati);
        const emailRichieste = [].concat.apply([], seconde.map(d => d.emails));
        vero(emailRichieste.includes('francesca.esposito@esposito.example') && emailRichieste.includes('marco.galli@studiogalli.example') && emailRichieste.length <= 4,
            'dopo le correzioni si chiedono al servizio solo le email nuove (' + emailRichieste.length + '), non tutto il file');
        // un nome utente scritto a mano gia' occupato (lo dice il servizio: nomi richiesti)
        await riga(44).locator('input.nome-utente-riga').fill('mariorossi');
        await aspetta(async () => (await classeRiga(44)).includes('esito-errore'), 5000, 'nome occupato');
        vero(/già usato/.test(await riga(44).locator('.problemi').textContent()), 'nome utente scritto a mano già occupato: errore sulla riga');
        await riga(44).locator('input.nome-utente-riga').fill('');
        await page.locator('#cerca-partecipanti').focus();
        await aspetta(async () => (await classeRiga(44)).includes('esito-nuovo') && await nu(44) === 'giorgiofontana', 5000, 'nome automatico');
        vero(true, 'svuotato il campo, torna il nome utente calcolato (giorgiofontana)');
        vero(await $('#btn-crea-account').isDisabled(), 'ancora spento: restano gli omonimi da confermare');
        await $('#btn-conferma-omonimi').click();
        await aspetta(async () => !(await $('#btn-crea-account').isDisabled()), 5000, 'pulsante acceso');
        vero(!(await classeRiga(2)).includes('da-confermare') && (await classeRiga(2)).includes('omonimo'), 'omonimi confermati: restano evidenziati, non più da confermare');
        vero(/Tutto pronto/.test(await testo('#motivo-blocco')) && /Crea 38 account e aggiungi 1 persona già registrata/.test(await testo('#btn-crea-account')),
            'pulsante acceso: «' + await testo('#btn-crea-account') + '»');

        /* ---------- 4. creazione a gruppi, con un nome preso nel frattempo e la rete che cade ---------- */
        console.log('\n-- creazione degli account');
        // un altro gestore, proprio adesso, carica Nicolò D'Angelo (un'altra persona) in un altro evento
        const altro = await api('diretta-gestione', { azione: 'crea', idEvento: 'roma-2026', righe: [{ riga: 9, nome: 'Nicolò', cognome: 'D\'Angelo', email: 'nicolo.dangelo@altro-caricamento.example', azienda: 'Altro Studio' }] }, tokGestore);
        vero(altro.stato === 200 && altro.dati.risultati[0].nomeUtente === 'nicolodangelo', 'nel frattempo un altro caricamento (vero) prende «nicolodangelo»');
        guastoCrea.restanti = 3;
        guastoCrea.perse = 1;
        await $('#btn-crea-account').click();
        await confermaDialogo(/Creare 38 account.*NON partono/s);
        await $('#btn-riprendi-crea').waitFor({ state: 'visible', timeout: 30000 });
        vero(/Caricamento interrotto al gruppo 2 di 2.*Riprendi.*non si duplicano/.test(await testo('#avanzamento-crea .avanzamento-testo')),
            'la rete cade al secondo gruppo: dopo 3 tentativi la creazione si ferma e propone «Riprendi» (R18) — «' + await testo('#avanzamento-crea .avanzamento-testo') + '»');
        vero(await $('#btn-crea-account').isDisabled() && /Creazione interrotta/.test(await testo('#motivo-blocco')) && !(await $('#btn-annulla-caricamento').isDisabled()),
            'intanto «Crea» resta spento e si può anche annullare');
        vero((await delEvento()).length === 39, 'il primo tentativo del secondo gruppo era arrivato al servizio: nell\'evento ci sono già tutte le 39 persone');
        await $('#btn-riprendi-crea').click();
        await $('#esito-crea').waitFor({ state: 'visible', timeout: 30000 });
        vero(true, '«Riprendi»: la creazione riparte dal gruppo interrotto e si completa');
        vero(JSON.stringify(creaRichieste.map(c => c.righe)) === JSON.stringify([25, 14, 14, 14, 14])
            && JSON.stringify(creaRichieste.map(c => c.esito)) === JSON.stringify(['passata', 'risposta persa', 'non partita', 'non partita', 'passata']),
            'crea a gruppi di 25: ' + creaRichieste.map(c => c.righe + ' (' + c.esito + ')').join(', '));
        vero(new Set(creaRichieste.slice(1).map(c => c.emails)).size === 1, 'il gruppo interrotto si rimanda identico (stesse righe, stessi nomi utente)');
        // misurata nella pagina: dall'arrivo della risposta del primo gruppo alla partenza del secondo
        const tempiCrea = await page.evaluate(() => window.__tempiServizio.filter(x => x.azione === 'crea'));
        const pausaGruppi = Math.round(tempiCrea[1].inizio - tempiCrea[0].fine);
        // 300 ms nella pagina; l'orologio finto di Playwright puo' anticipare un timer di qualche ms
        vero(tempiCrea.length === 5 && pausaGruppi >= 290, 'pausa fra un gruppo e l\'altro (' + pausaGruppi + ' ms)');
        const riepilogoCrea = await testo('#esito-crea-riepilogo');
        vero(/24\s*account creati/.test(riepilogoCrea) && /1\s*persona aggiunta/.test(riepilogoCrea) && /14\s*righe già completate dal tentativo interrotto/.test(riepilogoCrea),
            'riepilogo onesto: 24 creati, 1 aggiunta, 14 completate dal tentativo interrotto', riepilogoCrea);
        const cambiato = $('#tabella-esito-crea tr.nome-cambiato');
        vero(await cambiato.count() === 1 && /nicolodangelo\s*→\s*nicolodangelo2/.test(await cambiato.textContent()), 'nome utente preso nel frattempo da un altro caricamento: evidenziato (nicolodangelo → nicolodangelo2)');
        // zero doppioni, contati sul servizio
        const tutti = (await db.collection('partecipanti').get()).docs.map(d => Object.assign({ uid: d.id }, d.data()));
        const nomi = (await db.collection('nomiUtente').get()).docs;
        const inNapoli = tutti.filter(p => (p.eventi || []).includes(ID));
        const utentiAuth = (await auth.listUsers(1000)).users;
        vero(inNapoli.length === 39 && tutti.length === 41, 'sul servizio: 39 persone nell\'evento, 41 partecipanti in tutto (38 nuovi + Mario, Giulia e Nicolò di Roma)', inNapoli.length + ' / ' + tutti.length);
        vero(new Set(tutti.map(p => p.emailNorm)).size === tutti.length && new Set(tutti.map(p => p.nomeUtente)).size === tutti.length,
            'zero account doppi e zero nomi utente doppi (per email e per nome utente)');
        vero(nomi.length === tutti.length && nomi.every(d => tutti.some(p => p.uid === d.data().uid && p.nomeUtente === d.id)),
            'ogni nome utente prenotato appartiene a una sola persona, e nessuna prenotazione è rimasta orfana');
        vero(utentiAuth.filter(u => /^p[0-9a-f]{20}$/.test(u.uid)).length === 41 && tutti.every(p => p.authCreato === true),
            'un account di accesso per persona (41), tutti completi');

        /* ---------- 5. elenco e ricerca ---------- */
        console.log('\n-- elenco dei partecipanti');
        await aspetta(async () => (await $('#tabella-partecipanti tbody tr').count()) === 39, 10000, 'elenco con 39 persone');
        vero(true, 'elenco: 39 persone (38 nuove + Giulia già registrata)');
        const visibiliElenco = () => page.evaluate(() => Array.from(document.querySelectorAll('#tabella-partecipanti tbody tr')).filter(t => !t.hidden).map(t => t.dataset.uid));
        const cerca = async q => { await $('#cerca-partecipanti').fill(q); await pausa(80); return visibiliElenco(); };
        let v = await cerca('ivanpetrov');
        vero(v.length === 1 && v[0] === await uidDi('ivanpetrov'), 'ricerca per nome utente');
        v = await cerca('deluca-figli.example');
        vero(v.length === 2, 'ricerca per email (2 persone di deluca-figli.example)', v.length);
        v = await cerca('Ferri Consulting');
        vero(v.length === 1 && v[0] === await uidDi('giuliaferri'), 'ricerca per azienda');
        v = await cerca('mario rossi');
        vero(v.length === 3, 'ricerca «mario rossi»: i tre omonimi', v.length);
        v = await cerca('NUNEZ');
        vero(v.length === 1, 'ricerca senza accenti e maiuscole («NUNEZ» trova Núñez)');
        await cerca('');
        vero((await visibiliElenco()).length === 39 && /\(39\)/.test(await testo('#conta-partecipanti')), 'ricerca vuota: tutti');

        console.log('\n-- azioni sul partecipante');
        const rp = async nome => $('#tabella-partecipanti tr[data-uid="' + await uidDi(nome) + '"]');
        await (await rp('ivanpetrov')).locator('button[data-op="reinvia"]').click();
        await confermaDialogo(/Inviare adesso le credenziali/);
        await aspetta(async () => (await (await rp('ivanpetrov')).locator('.stato-email').textContent()) === 'inviata', 10000, 'invio');
        vero(/stato-inviata/.test(await (await rp('ivanpetrov')).locator('.stato-email').getAttribute('class')), '«Invia ora»: stato email della persona «inviata», con il colore giusto');
        const letteraIvan = postaPer('ivan.petrov@petrov-trading.example', 'credenziali');
        vero(letteraIvan.length === 1 && /Nome utente:\s*ivanpetrov/.test(letteraIvan[0].testo) && RE_PASSWORD.test(passwordDa(letteraIvan[0])),
            'nella casella di Ivan: una email con il suo nome utente e una password di 10 caratteri senza lettere ambigue');
        const elenchiPrimaDel409 = chiamate('partecipanti').length;
        await (await rp('ivanpetrov')).locator('button[data-op="reinvia"]').click();
        const avvisoReinvio = await confermaDialogo(/Reinviare le credenziali/);
        vero(/smetterà di funzionare.*entro un'ora/s.test(avvisoReinvio), 'il reinvio avverte che la password attuale smette di funzionare (T9)');
        await aspetta(async () => /meno di un minuto fa/.test(await avvisi()), 10000, '409 del reinvio');
        vero(true, 'reinvio entro un minuto: il servizio risponde 409 e la pagina mostra il suo testo: «' + ((await $('#avvisi .avviso').last().textContent()) || '').trim() + '»');
        vero(postaPer('ivan.petrov@petrov-trading.example', 'credenziali').length === 1, 'e nessuna seconda email è partita');
        /* dopo un 409 la pagina rilegge l'elenco e ridisegna le righe: si
           aspetta che abbia finito, altrimenti il menu «Altro» aperto qui
           sotto verrebbe sostituito (chiuso) a meta' del clic */
        await aspetta(() => chiamate('partecipanti').length > elenchiPrimaDel409, 10000, 'elenco riletto dopo il 409');
        await calma();
        await (await rp('annamariadeluca')).locator('summary').click();
        await (await rp('annamariadeluca')).locator('button[data-op="rigenera"]').click();
        await confermaDialogo(/Nuova password|nuova password/);
        await $('#dialogo-password').waitFor({ state: 'visible', timeout: 5000 });
        const pw = await testo('#password-mostrata');
        vero(RE_PASSWORD.test(pw) && await testo('#password-nome-utente') === 'annamariadeluca', 'nuova password mostrata una volta, in chiaro solo nella finestra');
        const entraAnna = await api('diretta-accesso', { azione: 'entra', nomeUtente: 'Anna Maria De Luca', password: pw });
        vero(entraAnna.stato === 200 && entraAnna.dati.nomeUtente === 'annamariadeluca' && !!entraAnna.dati.token, 'con quella password Anna Maria entra davvero nella diretta (diretta-accesso «entra»)');
        await foto('password', true);
        await $('#btn-chiudi-password').click();
        vero(await testo('#password-mostrata') === '', 'chiusa la finestra, la password sparisce dalla pagina');
        await (await rp('robertomoretti')).locator('summary').click();
        await (await rp('robertomoretti')).locator('button[data-op="disattiva"]').click();
        await confermaDialogo(/Disattivare l'account/);
        await aspetta(async () => /disattivato/.test(await (await rp('robertomoretti')).getAttribute('class') || ''), 5000, 'disattivato');
        vero(await (await rp('robertomoretti')).locator('button[data-op="riattiva"]').count() === 1, 'disattivato: la riga lo dice e offre «Riattiva»');
        const uidRoberto = await uidDi('robertomoretti');
        const [sessRoberto, authRoberto] = await Promise.all([db.doc('sessioni/' + uidRoberto).get(), auth.getUser(uidRoberto)]);
        vero(sessRoberto.data().stato === 'disattivato' && authRoberto.disabled === true, 'sul servizio: sessioni/{uid} «disattivato» e account di accesso disabilitato');
        const uidSara = await uidDi('sarabarbieri');
        await (await rp('sarabarbieri')).locator('summary').click();
        await (await rp('sarabarbieri')).locator('button[data-op="rimuovi-evento"]').click();
        await confermaDialogo(/Togliere da questo evento/);
        await aspetta(async () => (await $('#tabella-partecipanti tbody tr').count()) === 38, 5000, 'tolta');
        const sara = (await db.doc('partecipanti/' + uidSara).get()).data();
        vero(!sara.eventi.includes(ID) && sara.stato === 'attivo', '«Togli da questo evento»: la persona sparisce dall\'elenco dell\'evento, l\'account resta attivo');
        // correzione con ricalcolo del nome utente
        await (await rp('chloelhoteldupont')).locator('button[data-op="correggi"]').click();
        await $('#dialogo-correggi').waitFor({ state: 'visible' });
        await $('#corr-cognome').fill('Dupont');
        vero(/chloedupont/.test(await testo('#corr-anteprima-nome')) && await $('#corr-scelta-nome').isHidden(), 'la finestra mostra il nuovo nome utente prima di salvare');
        await $('#btn-corr-salva').click();
        await $('#dialogo-correggi').waitFor({ state: 'hidden' });
        await aspetta(async () => (await page.locator('#tabella-partecipanti td.col-nome-utente', { hasText: /^chloedupont$/ }).count()) === 1, 5000, 'nome ricalcolato');
        vero(/da chloelhoteldupont a chloedupont/.test(await avvisi()), 'correzione del cognome: nome utente ricalcolato, e l\'avviso dice da che cosa a che cosa (nomeUtentePrecedente)');
        const [nVecchio, nNuovo] = await Promise.all([db.doc('nomiUtente/chloelhoteldupont').get(), db.doc('nomiUtente/chloedupont').get()]);
        vero(!nVecchio.exists && nNuovo.exists, 'sul servizio: il vecchio nome utente è stato liberato, il nuovo prenotato');
        // credenziali gia' partite: si chiede se tenere il nome utente (R3)
        await (await rp('ivanpetrov')).locator('button[data-op="correggi"]').click();
        await $('#corr-cognome').fill('Petrova');
        vero(await $('#corr-scelta-nome').isVisible(), 'credenziali già inviate e nome che cambierebbe: si chiede se mantenerlo');
        await $('#btn-corr-salva').click();
        await $('#dialogo-correggi').waitFor({ state: 'hidden' });
        const corr = chiamate('partecipante').filter(c => c.dati.operazione === 'correggi').pop().dati;
        const ivanDopo = await partecipante('ivanpetrov');
        vero(corr.mantieniNomeUtente === true && ivanDopo && ivanDopo.cognome === 'Petrova' && ivanDopo.invii[ID].stato === 'inviata',
            'scelta predefinita «Mantieni»: mantieniNomeUtente true, nome utente e credenziali restano validi');
        // di nuovo Petrov: la nuova base e' proprio il nome utente attuale, che resta com'e' (anche per il servizio)
        await (await rp('ivanpetrov')).locator('button[data-op="correggi"]').click();
        await $('#dialogo-correggi').waitFor({ state: 'visible' });
        await $('#corr-cognome').fill('Petrov');
        vero(/resta ivanpetrov/.test(await testo('#corr-anteprima-nome')) && await $('#corr-scelta-nome').isHidden(),
            'cognome rimesso a «Petrov»: la nuova base coincide con il nome utente, la finestra dice che resta e non chiede niente');
        await $('#btn-corr-salva').click();
        await $('#dialogo-correggi').waitFor({ state: 'hidden' });
        const ivanDiNuovo = await partecipante('ivanpetrov');
        vero(ivanDiNuovo && ivanDiNuovo.cognome === 'Petrov' && ivanDiNuovo.invii[ID].stato === 'inviata',
            'sul servizio: stesso nome utente e credenziali ancora «inviata», come annunciato');
        // email gia' di un altro: 409 mostrato nella finestra
        await (await rp('elenaricci')).locator('button[data-op="correggi"]').click();
        await $('#corr-email').fill('giulia.ferri@ferri-consulting.example');
        await $('#btn-corr-salva').click();
        await aspetta(async () => /appartiene già a un'altra persona/.test(await testo('#msg-correggi')), 5000, '409');
        vero(await $('#corr-email').getAttribute('aria-invalid') === 'true', 'email già usata da un\'altra persona: il 409 del servizio è mostrato nella finestra, niente salvato');
        await $('#btn-corr-annulla').click();

        /* ---------- 6. regia ---------- */
        console.log('\n-- regia');
        /* I segnali di presenza li scrive la pagina dei partecipanti, uno al
           minuto: qui si scrivono direttamente (firebase-admin) per 31 persone. */
        const persone = (await delEvento()).filter(p => p.stato === 'attivo').sort((a, b) => a.nomeUtente.localeCompare(b.nomeUtente));
        const segnala = async (elenco, campi) => {
            const lotto = db.batch();
            elenco.forEach(p => lotto.set(db.doc('presenze/' + ID + '_' + p.uid), Object.assign({
                uid: p.uid, idEvento: ID, primo: Ts.now(), ultimo: Ts.now(), secondi: 0, collegamenti: 1, sessione: 'prova-' + p.uid.slice(1, 9)
            }, typeof campi === 'function' ? campi(p) : (campi || {}))));
            await lotto.commit();
        };
        await segnala(persone.slice(0, 31));
        await page.click('[data-scheda="regia"]');
        await aspetta(async () => await testo('#num-connessi') === '31', 10000, 'collegati');
        vero(await testo('#regia-stato-testo') === 'IN ATTESA', 'stato grande: IN ATTESA');
        vero(/su 38 iscritti/.test(await testo('#connessi-dettaglio')), 'contatore dei collegati dal servizio: 31, accanto agli iscritti di adesso (' + await testo('#connessi-dettaglio') + ')');
        await $('#btn-in-onda').click();
        const domandaOnda = await confermaDialogo(/Mandare in onda.*Il video è impostato \(abcdefghijk\)/s);
        vero(/previsto per venerdì 2 ottobre 2026, non per oggi/.test(domandaOnda), 'oggi non è il giorno dell\'evento: la conferma lo dice (evento sbagliato nel menu?)');
        await aspetta(async () => await $('#regia-stato').getAttribute('data-stato') === 'in_onda', 5000, 'in onda');
        vero(await testo('#regia-stato-testo') === 'IN ONDA' && await testo('#stato-testata') === 'In onda', 'IN ONDA, grande in regia e in testata');
        vero(await $('#btn-in-onda').isDisabled() && !(await $('#btn-termina').isDisabled()) && !(await $('#btn-pausa').isDisabled()), 'in onda: «Vai in onda» spento, «Termina» e «Pausa» accesi');
        vero((await db.doc('eventi/' + ID).get()).data().videoId === 'abcdefghijk' && /stanno guardando questo video/.test(await testo('#regia-video-pubblico')),
            'in onda il servizio pubblica il video per i partecipanti, e la regia lo dice (videoInOnda)');
        await segnala(persone.slice(31, 36));
        const primaDelTimer = chiamate('connessi').length;
        await page.clock.fastForward(21000);
        await aspetta(async () => chiamate('connessi').length > primaDelTimer && await testo('#num-connessi') === '36', 10000, 'aggiornamento dei collegati');
        vero(true, 'dopo 20 secondi il contatore si aggiorna da solo (36: cinque persone in più si sono collegate)');
        // un link che non e' di un video: il messaggio nomina la piattaforma del player (NGBPlayer.nome)
        await $('#regia-video').fill('https://example.com/diretta');
        await $('#btn-cambia-video').click();
        await aspetta(async () => /Non riconosco un video/.test(await testo('#msg-video')), 5000, 'link non riconosciuto');
        const msgYouTube = await testo('#msg-video');
        await page.evaluate(() => { if (window.NGBPlayer) window.NGBPlayer.nome = 'vimeo'; });
        await $('#btn-cambia-video').click();
        await aspetta(async () => /di Vimeo/.test(await testo('#msg-video')), 5000, 'messaggio con la piattaforma');
        const msgVimeo = await testo('#msg-video');
        await page.evaluate(() => { if (window.NGBPlayer) window.NGBPlayer.nome = 'youtube'; });
        vero(/Non riconosco un video di YouTube in questo link.*youtu\.be/.test(msgYouTube) && /Non riconosco un video di Vimeo in questo link.*vimeo\.com/.test(msgVimeo)
            && !/YouTube/.test(msgVimeo) && chiamate('evento-video').length === 0,
            'link non riconosciuto: il messaggio segue NGBPlayer.nome («' + msgVimeo + '»), niente chiamato');
        // il video: prima provato con il player, poi cambiato per tutti
        const conPlayer = await page.evaluate(() => !!(window.NGBPlayer && window.NGBPlayer.crea));
        if (conPlayer) {
            await $('#regia-video').fill('https://youtu.be/errore12345');
            await $('#btn-cambia-video').click();
            await aspetta(async () => /non si può usare/.test(await testo('#msg-video')), 15000, 'errore del video');
            vero(chiamate('evento-video').length === 0, 'video non incorporabile (errore 150 del player): bloccato con il motivo, niente cambiato — «' + await testo('#msg-video') + '»');
        } else vero(true, '(player-youtube.js assente: prova dell\'errore del video saltata)');
        await $('#regia-video').fill('https://www.youtube.com/watch?v=zyxwvutsrqp');
        await $('#btn-cambia-video').click();
        await confermaDialogo(/Cambiare il video per tutti/);
        await aspetta(async () => /zyxwvutsrqp/.test(await testo('#regia-video-attuale')), 15000, 'video cambiato');
        const cv = chiamate('evento-video').pop().dati;
        vero(cv.videoId === 'zyxwvutsrqp' && cv.videoUrl === 'https://www.youtube.com/watch?v=zyxwvutsrqp', 'evento-video riceve videoUrl e videoId (R21)');
        vero((await db.doc('eventi/' + ID).get()).data().videoId === 'zyxwvutsrqp', 'sul servizio: chi è collegato passa subito al nuovo video (documento pubblico aggiornato)');
        if (conPlayer) vero(await $('#regia-video-anteprima').isVisible(), 'anteprima del video in regia con lo stesso player dei partecipanti');
        // avviso a tutti
        await $('#regia-avviso').fill('Problema tecnico: torniamo tra 5 minuti');
        await $('#btn-avviso').click();
        await confermaDialogo(/Pubblicare l'avviso/);
        await aspetta(async () => /torniamo tra 5 minuti/.test(await testo('#regia-avviso-attuale')), 5000, 'avviso');
        vero((await db.doc('eventi/' + ID).get()).data().avviso === 'Problema tecnico: torniamo tra 5 minuti', 'avviso a tutti pubblicato (evento-avviso, nel documento che i partecipanti ascoltano)');
        // pausa con orario di ripresa e ripresa
        await $('#regia-ripresa').fill('14:30');
        await $('#btn-pausa').click();
        await confermaDialogo(/Mettere in pausa.*14\.30/s);
        await aspetta(async () => await $('#regia-stato').getAttribute('data-stato') === 'pausa', 5000, 'pausa');
        vero(await testo('#regia-stato-testo') === 'IN PAUSA' && /si riprende alle 14\.30/.test(await testo('#regia-orari')) && await $('#btn-riprendi').isVisible(), 'pausa: IN PAUSA, orario di ripresa, pulsante «Riprendi»');
        const inPausa = (await db.doc('eventi/' + ID).get()).data();
        vero(chiamate('evento-stato').pop().dati.ripresa === '14:30' && inPausa.stato === 'pausa' && inPausa.ripresa === '14:30' && inPausa.videoId === '',
            'evento-stato {stato: pausa, ripresa: 14:30}: in pausa il video sparisce anche dal documento dei partecipanti (R7)');
        await $('#btn-riprendi').click();
        await confermaDialogo(/Riprendere la diretta/);
        await aspetta(async () => await $('#regia-stato').getAttribute('data-stato') === 'in_onda', 5000, 'ripresa');
        vero((await db.doc('eventi/' + ID).get()).data().videoId === 'zyxwvutsrqp', 'ripresa: di nuovo IN ONDA, con il video');
        // termina: la conferma dice quanti sono collegati; qui si annulla
        await $('#btn-termina').click();
        await $('#dialogo-conferma').waitFor({ state: 'visible' });
        vero(/Terminare la diretta per tutti \(36 collegati\)/.test(await testo('#conferma-titolo')), 'la conferma di «Termina» dice quante persone sono collegate: «' + await testo('#conferma-titolo') + '»');
        vero(await page.evaluate(() => document.activeElement && document.activeElement.id) === 'conferma-annulla', 'per «Termina» il fuoco parte da «Annulla»');
        await page.keyboard.press('Escape');
        await $('#dialogo-conferma').waitFor({ state: 'hidden' });
        vero(await $('#regia-stato').getAttribute('data-stato') === 'in_onda', 'Esc annulla: la diretta resta in onda');

        /* Il video si puo' cambiare anche dalla scheda Evento. Prima: un altro
           gestore (qui una chiamata vera al servizio) cambia il video dalla sua
           regia; in questa pagina il modulo dell'evento e' rimasto aperto con il
           link di prima. Correggere il luogo NON deve rimettere il video vecchio. */
        console.log('\n-- il video dalla scheda Evento');
        const altroGestore = await api('diretta-gestione', { azione: 'evento-video', idEvento: ID, videoUrl: 'https://youtu.be/altrogestor', videoId: 'altrogestor' }, tokGestore);
        vero(altroGestore.stato === 200 && (await db.doc('eventi/' + ID).get()).data().videoId === 'altrogestor', 'un altro gestore cambia il video dalla sua regia (altrogestor)');
        await page.click('[data-scheda="evento"]');
        vero(/zyxwvutsrqp/.test(await $('#ev-video').inputValue()), 'qui il modulo dell\'evento mostra ancora il link di prima (nessuno lo ha ricaricato)');
        const salvaPrima = chiamate('evento-salva').length;
        await $('#ev-luogo').fill('Napoli · Hotel Eurostars Excelsior, Sala Posillipo');
        await $('#btn-salva-evento').click();
        await aspetta(async () => /Modifiche salvate/.test(await testo('#msg-evento')), 10000, 'luogo salvato');
        const soloLuogo = chiamate('evento-salva').slice(salvaPrima).pop().dati.evento;
        const [pubblicoDopo, riservatoDopo] = await Promise.all([db.doc('eventi/' + ID).get(), db.doc('eventiRiservati/' + ID).get()]);
        vero(!('videoUrl' in soloLuogo) && !('videoId' in soloLuogo) && pubblicoDopo.data().luogo === 'Napoli · Hotel Eurostars Excelsior, Sala Posillipo',
            'correggendo il luogo il link non si manda (non era stato toccato)', JSON.stringify(soloLuogo));
        vero(pubblicoDopo.data().videoId === 'altrogestor' && riservatoDopo.data().videoId === 'altrogestor',
            'e il video dell\'altro gestore resta: nessuno torna al video vecchio');
        vero(/altrogestor/.test(await $('#ev-video').inputValue()), 'dopo il salvataggio il modulo mostra il link attuale');
        if (conPlayer) {
            // un link nuovo scritto qui si prova con il player, come in Regia: se non si puo' incorporare, niente salvato
            const salvaPrimaErrore = chiamate('evento-salva').length;
            await $('#ev-video').fill('https://youtu.be/errore12345');
            await $('#btn-salva-evento').click();
            await aspetta(async () => /non si può usare/.test(await testo('#msg-evento')), 15000, 'video bloccato dalla scheda Evento');
            vero(chiamate('evento-salva').length === salvaPrimaErrore && await $('#ev-video').getAttribute('aria-invalid') === 'true'
                && (await db.doc('eventiRiservati/' + ID).get()).data().videoId === 'altrogestor',
                'dalla scheda Evento un video non incorporabile (errore 150 del player) si blocca con il motivo e non si salva — «' + await testo('#msg-evento') + '»');
        } else vero(true, '(player-youtube.js assente: prova del video bloccato dalla scheda Evento saltata)');
        await $('#ev-video').fill('https://www.youtube.com/watch?v=nuovovideo1');
        await $('#btn-salva-evento').click();
        await confermaDialogo(/Cambiare il video per tutti.*in onda/s);
        await aspetta(async () => /Modifiche salvate.*nuovo video/.test(await testo('#msg-evento')), 15000, 'video cambiato dalla scheda Evento');
        const dallEvento = chiamate('evento-salva').pop().dati.evento;
        vero(dallEvento.videoId === 'nuovovideo1' && (await db.doc('eventi/' + ID).get()).data().videoId === 'nuovovideo1',
            'un link nuovo dalla scheda Evento: provato, confermato (in onda) e applicato a tutti');
        if (conPlayer) vero(await $('#ev-video-anteprima').isVisible() && (await $('#ev-video-anteprima iframe').count()) === 1,
            'l\'anteprima del nuovo video compare sotto il campo, con lo stesso player dei partecipanti');
        await page.click('[data-scheda="regia"]');
        vero(/nuovovideo1/.test(await testo('#regia-video-attuale')) && await $('#ev-video-anteprima').isHidden(),
            'la regia mostra il video appena scelto; l\'anteprima della scheda Evento si chiude cambiando scheda');
        // vedi come un partecipante
        const [nuovaScheda] = await Promise.all([context.waitForEvent('page'), $('#btn-anteprima').click()]);
        await nuovaScheda.waitForLoadState('domcontentloaded').catch(() => {});
        vero(/\/diretta\/\?anteprima=napoli-2026&emulatori=1$/.test(nuovaScheda.url()), '«Vedi come un partecipante» apre /diretta/?anteprima=napoli-2026 in una nuova scheda');
        if (fs.existsSync(path.join(RADICE, 'diretta/diretta.js'))) {
            // stessa app Firebase (nome predefinito) = stessa sessione: la pagina
            // dei partecipanti riconosce il gestore senza chiedere un nuovo accesso
            const vistaAnteprima = await aspetta(async () => {
                const vv = await nuovaScheda.evaluate(() => document.body.dataset.vista || '');
                return vv && vv !== 'caricamento' ? vv : '';
            }, 20000, 'vista dell\'anteprima').catch(e => 'errore: ' + e.message);
            vero(vistaAnteprima !== 'accesso' && !/^errore/.test(vistaAnteprima), 'la pagina della diretta riconosce il gestore già collegato (vista «' + vistaAnteprima + '», non l\'accesso)');
        }
        await nuovaScheda.close();
        await foto('regia');

        /* ---------- 7. email ---------- */
        console.log('\n-- email');
        await page.click('[data-scheda="email"]');
        await aspetta(async () => /\(36\)/.test(await testo('#btn-invia-tutti')), 5000, 'conteggi email');
        const conteggiOk = await aspetta(async () => await testo('#conteggi-email li[data-stato="da inviare"] .conteggio-num') === '37'
            && await testo('#conteggi-email li[data-stato="inviata"] .conteggio-num') === '1', 5000, 'conteggi').catch(() => false);
        vero(conteggiOk, 'conteggi per stato dal servizio: 37 da inviare, 1 inviata (quella mandata a mano)', await testo('#conteggi-email'));
        vero(/1 persona «da inviare» ha l'account disattivato/.test(await testo('#nota-disattivati')), 'il pulsante dice a quante persone partirà davvero (36): l\'account disattivato non si conta, e la nota lo spiega');
        vero(/manca BREVO_API_KEY/.test(await testo('#nota-esiti')) && await visibile('#nota-esiti'), 'senza BREVO_API_KEY lo si dice subito, accanto al pulsante degli esiti (esitiDisponibili)');
        vero(/Promemoria del giorno prima: attivo\. Parte da solo giovedì 1 ottobre 2026 dalle 9\.00: oggi lo riceverebbero 1 persona/.test(await testo('#promemoria-stato')),
            'promemoria del giorno prima: quando parte e a quante persone arriverebbe oggi (destinatariPromemoria.giorno)', await testo('#promemoria-stato'));
        await $('#sel-tipo-prova').selectOption('credenziali');
        await $('#btn-email-prova').click();
        await aspetta(async () => /Email di prova inviata a gestore@prova\.it/.test(await testo('#msg-email-prova')), 10000, 'prova');
        const prova = postaPer(EMAIL_GESTORE, 'prova-credenziali');
        vero(chiamate('email-prova').pop().dati.tipo === 'credenziali' && prova.length === 1 && /EMAIL DI PROVA/.test(prova[0].testo + prova[0].oggetto),
            '«Invia email di prova a me»: nella casella del gestore arriva l\'email con la scritta EMAIL DI PROVA');

        // Brevo rifiuta l'accesso SMTP (account sospeso, chiave cambiata): per tutti, prima del DATA
        await avviaServer({ DIRETTA_POSTA_ERRORE_ACCOUNT: '1' }, 'server di posta che rifiuta l\'accesso', calma);
        const credenzialiPrima = leggiPosta().filter(m => m.tipo === 'credenziali').length;
        await $('#btn-invia-tutti').click();
        await confermaDialogo(/Inviare le credenziali a 36 persone/);
        await aspetta(async () => await visibile('#btn-riprova-invio') && /Invio fermo/.test(await testo('#coda-bloccata')), 20000, 'blocco di Brevo');
        vero(/535/.test(await testo('#coda-bloccata')) && /36 persone restano in coda/.test(await testo('#coda-bloccata')),
            'blocco del server di posta: la pagina dice il motivo del servizio e che nessuno è stato saltato — «' + await testo('#coda-bloccata') + '»');
        vero(/Invio fermo per un problema del server di posta/.test(await testo('#avanzamento-email .avanzamento-testo')), 'l\'avanzamento si ferma e lo dice (niente tentativi a raffica: riprova il giro automatico)');
        const kBlocco = await statiEmail();
        vero(kBlocco['in coda'] === 36 && leggiPosta().filter(m => m.tipo === 'credenziali').length === credenzialiPrima,
            'sul servizio: 36 persone ancora in coda e nessuna email partita', JSON.stringify(kBlocco));
        const bloccoSalvato = (await db.doc('code/' + ID).get()).data().bloccato;
        vero(bloccoSalvato && /535/.test(bloccoSalvato.motivo) && bloccoSalvato.quando > 0, 'code/' + ID + '.bloccato = {motivo, quando}, come lo legge la pagina');

        // Brevo di nuovo a posto, ma con un tetto di 20 email al giorno
        await avviaServer({ DIRETTA_MAX_GIORNO: '20' }, 'server di posta a posto, tetto di 20 email al giorno', calma);
        await $('#btn-riprova-invio').click();
        await aspetta(async () => /Limite di oggi raggiunto/.test(await testo('#coda-bloccata')), 30000, 'tetto del giorno');
        const kLimite = await statiEmail();
        const restano = kLimite['in coda'];
        vero(kLimite.inviata === 21 && restano >= 15 && restano <= 16 && (await db.doc('code/' + ID).get()).data().bloccato == null,
            '«Riprova adesso»: il blocco si toglie e la coda riparte, fino al tetto (20 email oggi)', JSON.stringify(kLimite));
        vero(new RegExp('Limite di oggi raggiunto: le restanti ' + restano + ' partono domani da sole').test(await testo('#coda-bloccata')) && await $('#btn-riprova-invio').isHidden(),
            'tetto del giorno: «' + await testo('#coda-bloccata') + '» (R13)');
        vero(/Invio fermo per il limite di oggi/.test(await testo('#avanzamento-email .avanzamento-testo')), 'l\'avanzamento dice che il resto parte domani');
        await foto('email-limite');
        await page.click('[data-scheda="partecipanti"]');
        await aspetta(async () => (await page.locator('#tabella-partecipanti .stato-email.stato-in-coda').count()) === restano, 10000, 'stati nell\'elenco');
        vero(await page.locator('#tabella-partecipanti .stato-email.stato-inviata').count() === 21, 'nell\'elenco gli stati delle email: inviate, in coda, da inviare');
        await foto('partecipanti');
        await page.click('[data-scheda="email"]');

        /* Il giorno dopo (qui: il servizio riavviato senza tetto) la coda la manda
           avanti il giro automatico, api/diretta-cron, chiamato davvero. Le email
           sono lente (1 s l'una): mentre il cron lavora, la pagina lo segue. */
        await avviaServer({ DIRETTA_POSTA_RITARDO_MS: '1000' }, 'nessun tetto, server di posta lento', calma);
        const giroPrima = (await db.doc('code/' + ID).get()).data().giro || null;
        const cron = fetch(API + '/diretta-cron', { headers: { Authorization: 'Bearer prova' } }).then(r => r.json()).catch(e => ({ errore: e.message }));
        await aspetta(async () => {
            const d = (await db.doc('code/' + ID).get()).data();
            return d.giro && d.giro !== giroPrima && d.lucchettoFino > Date.now();
        }, 15000, 'il cron prende il lucchetto');
        const avanzaPrima = risposteAvanza.length;
        await $('#btn-aggiorna-email').click();
        await aspetta(async () => /Invio completato/.test(await testo('#avanzamento-email .avanzamento-testo')), 60000, 'invio completato');
        const esitoCron = await cron;
        const seguite = risposteAvanza.slice(avanzaPrima);
        vero(seguite.some(x => x.dati && x.dati.occupato === true), 'la pagina trova il giro automatico al lavoro (occupato) e lo segue senza spedire niente', JSON.stringify(seguite.map(x => x.dati)));
        const intervalli = seguite.slice(1).map((x, i) => x.quando - seguite[i].quando);
        vero(seguite.length >= 2 && intervalli.every(x => x >= 4500), 'mentre un altro giro lavora la pagina chiede più piano (' + intervalli.join(', ') + ' ms fra le chiamate)');
        const codaCron = (esitoCron.code || []).find(c => c.idEvento === ID);
        vero(codaCron && codaCron.inviate >= restano - 1, 'il cron ha spedito il resto della coda (' + (codaCron && codaCron.inviate) + ')', JSON.stringify(esitoCron).slice(0, 300));
        const k = await statiEmail();
        vero(k.inviata === 36 && k.respinta === 1 && !k['in coda'] && k['da inviare'] === 1, 'invio a tutti completato (resta solo l\'account disattivato): ' + JSON.stringify(k));
        vero(await testo('#conteggi-email li[data-stato="inviata"] .conteggio-num') === '36' && await testo('#conteggi-email li[data-stato="respinta"] .conteggio-num') === '1', 'i conteggi colorati si aggiornano (36 inviate, 1 respinta)');
        const perIndirizzo = {};
        leggiPosta().filter(m => m.tipo === 'credenziali').forEach(m => { perIndirizzo[m.a] = (perIndirizzo[m.a] || 0) + 1; });
        vero(Object.keys(perIndirizzo).length === 36 && Object.values(perIndirizzo).every(n => n === 1),
            'nella posta: 36 persone con UNA sola email di credenziali ciascuna, nonostante blocco, tetto e due giri insieme', JSON.stringify(perIndirizzo).slice(0, 300));
        await aspetta(async () => /\(1\)/.test(await testo('#btn-reinvia-non-ricevute')), 5000, 'non ricevute');
        await foto('email');
        await $('#btn-reinvia-non-ricevute').click();
        await confermaDialogo(/Reinviare a chi non l'ha ricevuta/);
        await aspetta(() => chiamate('email-accoda').some(c => c.dati.chi === 'non-ricevuta'), 5000, 'riaccodata');
        vero(true, '«Reinvia a chi non l\'ha ricevuta» riaccoda con chi: non-ricevuta');
        await aspetta(async () => /Invio completato: 0 inviate, 1 respinta/.test(await testo('#avanzamento-email .avanzamento-testo')), 30000, 'secondo invio');
        vero(true, 'Chloé viene respinta di nuovo (l\'indirizzo è sbagliato): «' + await testo('#avanzamento-email .avanzamento-testo') + '»');
        await $('#btn-aggiorna-esiti').click();
        await aspetta(async () => /manca BREVO_API_KEY/.test(await testo('#msg-email')), 5000, 'esiti');
        vero(true, 'senza BREVO_API_KEY la gestione lo dice anche quando si chiedono gli esiti (R13)');
        await page.click('[data-scheda="evento"]');
        vero(/Parte da solo giovedì 1 ottobre 2026 dalle 9\.00: oggi lo riceverebbero 36 persone/.test(await testo('#prom-dest-giorno'))
            && /Se lo attivi, oggi lo riceverebbero 36 persone/.test(await testo('#prom-dest-ora')),
            'accanto alle caselle dei promemoria: a quante persone arriverebbero (36, chi ha le credenziali)', await testo('#prom-dest-giorno') + ' | ' + await testo('#prom-dest-ora'));
        await page.click('[data-scheda="partecipanti"]');
        vero(/stato-respinta/.test(await (await rp('chloedupont')).locator('.stato-email').getAttribute('class')), 'nell\'elenco la persona respinta ha lo stato rosso «respinta»');
        /* Il giro dei promemoria lo fa il cron nella sua finestra (dal 1 ottobre):
           qui se ne scrive con firebase-admin il segno finale, quello che il
           servizio lascia in code/{id}.promemoria.giorno, per vedere come la
           gestione lo racconta. */
        await db.doc('code/' + ID).set({ promemoria: { giorno: { cominciato: Date.now() - 90000, quando: Date.now(), finito: true, inviate: 36 } } }, { merge: true });
        await page.click('[data-scheda="email"]');
        await aspetta(async () => /Promemoria del giorno prima: attivo\. Già partito: 36 email inviate \(ultimo giro \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}\)/.test(await testo('#promemoria-stato')), 10000, 'promemoria partito');
        vero(true, 'promemoria già partito: la scheda Email lo dice con il numero del servizio (coda.promemoria.giorno)');

        /* ---------- 8. esportazione ---------- */
        console.log('\n-- esportazione');
        // due accessi veri (con le password arrivate per email) e due presenze del giorno dell'evento
        const pwIvan = passwordDa(postaPer('ivan.petrov@petrov-trading.example', 'credenziali').pop());
        const pwAnna = passwordDa(postaPer('annamaria.deluca@deluca-figli.example', 'credenziali').pop());
        const e1 = await api('diretta-accesso', { azione: 'entra', nomeUtente: 'ivanpetrov', password: pwIvan }, null, { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36' });
        const e2 = await api('diretta-accesso', { azione: 'entra', nomeUtente: 'annamariadeluca', password: pwAnna }, null, { 'User-Agent': UA_IPHONE });
        vero(e1.stato === 200 && e2.stato === 200, 'Ivan e Anna Maria entrano con le credenziali ricevute per email', JSON.stringify([e1.dati, e2.dati]).slice(0, 300));
        const inizio = Date.parse('2026-10-02T09:00:00+02:00');
        const fine = Date.parse('2026-10-02T17:30:00+02:00');
        await segnala([await partecipante('ivanpetrov')], { primo: Ts.fromMillis(inizio + 3 * 60e3), ultimo: Ts.fromMillis(fine + 5 * 60e3), secondi: 40000, collegamenti: 2 });
        await segnala([await partecipante('annamariadeluca')], { primo: Ts.fromMillis(inizio + 15 * 60e3), ultimo: Ts.fromMillis(inizio + 135 * 60e3), secondi: 7200, collegamenti: 1 });
        await page.click('[data-scheda="esporta"]');
        const [scarico] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), $('#btn-esporta').click()]);
        const nomeFile = scarico.suggestedFilename();
        vero(/^diretta-napoli-2026-\d{8}-\d{4}\.xlsx$/.test(nomeFile), 'file scaricato: ' + nomeFile);
        const doveFile = path.join(RISULTATI, 'gestione-esportazione.xlsx');
        await scarico.saveAs(doveFile);
        const wb = XLSX.read(fs.readFileSync(doveFile), { type: 'buffer' });
        vero(JSON.stringify(wb.SheetNames) === JSON.stringify(['Partecipanti', 'Accessi']), 'due fogli: ' + wb.SheetNames.join(', '));
        const fp = XLSX.utils.sheet_to_json(wb.Sheets.Partecipanti, { header: 1, defval: '' });
        const fa = XLSX.utils.sheet_to_json(wb.Sheets.Accessi, { header: 1, defval: '' });
        vero(fp[0].join('|') === 'Nome utente|Nome|Cognome|Email|Azienda|Account|Email credenziali|Inviata il|Primo collegamento|Ultimo segnale|Minuti collegati (durante la diretta)|Collegamenti|Ultimo accesso',
            'colonne del foglio Partecipanti come da contratto');
        // tre accessi veri: Anna Maria con la password rigenerata, poi Ivan e Anna Maria con quelle delle email
        vero(fa[0].join('|') === 'Quando|Nome utente|Nome|Cognome|Azienda|Dispositivo' && fa.length === 4, 'foglio Accessi con le sue colonne e i 3 accessi veri', fa.length);
        const annaAccesso = fa.filter(r => r[1] === 'annamariadeluca').pop();
        vero(annaAccesso && annaAccesso[5] === 'iPhone · Safari' && /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(annaAccesso[0]), 'accesso di Anna Maria: data e ora di Roma, dispositivo «iPhone · Safari»', annaAccesso && annaAccesso.join('|'));
        const ivan = fp.find(r => r[0] === 'ivanpetrov');
        vero(ivan && ivan[10] === 510 && ivan[11] === 2, 'minuti limitati alla durata dell\'evento: 40000 s collegati -> 510 minuti (8 ore e mezza)', ivan && ivan.join('|'));
        vero(ivan && ivan[8] === '02/10/2026 09:03' && ivan[6] === 'inviata' && /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(ivan[12]), 'date in ora di Roma «02/10/2026 09:03», stato delle credenziali e ultimo accesso', ivan && ivan.join('|'));
        vero(fp.filter(r => r[0] && r[0] !== 'Nome utente' && !/^Minuti stimati/.test(r[0])).length === 38 && /^Minuti stimati/.test(fp[fp.length - 1][0]), '38 partecipanti e, in fondo, la nota sui minuti (T13)');
        vero(/Scaricato/.test(await testo('#msg-esporta')), 'messaggio di conferma dell\'esportazione');

        /* ---------- 9. file con colonne da abbinare, piu' fogli, codifica ---------- */
        console.log('\n-- abbinamento delle colonne e codifica');
        await page.click('[data-scheda="partecipanti"]');
        const wbProva = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wbProva, XLSX.utils.aoa_to_sheet([['Note'], ['Elenco degli iscritti nel secondo foglio']]), 'Note');
        XLSX.utils.book_append_sheet(wbProva, XLSX.utils.aoa_to_sheet([
            ['Nominativo', 'Posta elettronica', 'Ragione sociale'],
            ['De Luca Anna Maria', 'annamaria.deluca@deluca-figli.example', 'De Luca & Figli S.p.A.'],
            ['Bruno Carla', 'carla.bruno@bruno.example', 'Bruno Srl'],
            ['Van der Berg Jan', 'jan@vanderberg.example', 'VDB BV']
        ]), 'Iscritti');
        const bufXlsx = Buffer.from(XLSX.write(wbProva, { type: 'array', bookType: 'xlsx' }));
        await $('#file-partecipanti').setInputFiles({ name: 'iscritti-due-fogli.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: bufXlsx });
        await $('#abbina-colonne').waitFor({ state: 'visible', timeout: 10000 });
        vero(await $('#scelta-foglio').isVisible() && await $('#btn-abbina-continua').isDisabled(), 'più fogli: selettore del foglio; nel primo foglio non ci sono le colonne -> passo «abbina le colonne»');
        await $('#sel-foglio').selectOption('Iscritti');
        await aspetta(() => $('#abb-ordine').isVisible(), 5000, 'ordine');
        vero(await $('#abb-email').inputValue() === '1' && await $('#abb-azienda').inputValue() === '2' && await $('#abb-nome').inputValue() === '0',
            'foglio «Iscritti»: riconosciute «Nominativo» (nome e cognome insieme), «Posta elettronica», «Ragione sociale»');
        await page.click('input[name="abb-ordine"][value="cognome-nome"] >> xpath=..');
        const esempio = await page.evaluate(() => Array.from(document.querySelectorAll('#abb-esempio tbody tr')).map(tr => Array.from(tr.cells).map(c => c.textContent)));
        vero(esempio[0][1] === 'Anna Maria' && esempio[0][2] === 'De Luca' && esempio[2][1] === 'Jan' && esempio[2][2] === 'Van der Berg', 'ordine «Cognome Nome»: il cognome si prende con le particelle (De Luca, Van der Berg)', JSON.stringify(esempio));
        await $('#btn-abbina-continua').click();
        await aspetta(async () => (await $('#tabella-anteprima tbody tr').count()) === 3 && /righe lette/.test(await testo('#riepilogo-anteprima')), 10000, 'anteprima abbinata');
        vero((await classeRiga(2)).includes('esito-gia-nell-evento'), 'Anna Maria De Luca è già nell\'evento (lo dice il servizio): nessun nuovo account');
        await $('#btn-annulla-caricamento').click();
        const csvRotto = Buffer.from('nome;cognome;email\nNicolÃ²;Rossi;nicolo@esempio.example\nAnna;Neri;anna.neri@esempio.example\n', 'utf8');
        await $('#file-partecipanti').setInputFiles({ name: 'codifica-sbagliata.csv', mimeType: 'text/csv', buffer: csvRotto });
        await aspetta(async () => (await $('#tabella-anteprima tbody tr').count()) === 2 && /righe lette/.test(await testo('#riepilogo-anteprima')), 10000, 'anteprima codifica');
        vero((await classeRiga(2)).includes('esito-errore') && /codifica/.test(await riga(2).locator('.problemi').textContent()), 'caratteri «Ã²»: problema grave «codifica del file sbagliata» (R9)');
        await $('#btn-annulla-caricamento').click();

        // lo stesso file caricato di nuovo: niente da creare
        await $('#file-partecipanti').setInputFiles(path.join(__dirname, 'esempio-partecipanti.csv'));
        await aspetta(async () => (await $('#tabella-anteprima tbody tr').count()) === 42 && /righe lette/.test(await testo('#riepilogo-anteprima')), 15000, 'ricarico');
        const esiti = await page.evaluate(() => Array.from(document.querySelectorAll('#tabella-anteprima tbody tr')).map(t => t.className));
        vero(!esiti.some(c => /esito-nuovo/.test(c)) && esiti.filter(c => /esito-gia-nell-evento/.test(c)).length >= 30,
            'lo stesso file ricaricato: nessun nuovo account, ' + esiti.filter(c => /esito-gia-nell-evento/.test(c)).length + ' righe «già nell\'evento»');
        // Sara Barbieri era stata tolta dall'evento: ha gia' l'account, torna solo nell'evento
        vero(esiti.filter(c => /esito-esistente/.test(c)).length === 1 && (await classeRiga(42)).includes('esito-esistente'),
            'la persona tolta dall\'evento risulta «già registrata, da aggiungere» (nessun secondo account)');
        vero(await $('#btn-crea-account').isDisabled(), 'con le righe originali in errore il pulsante resta spento');
        await $('#btn-annulla-caricamento').click();

        /* ---------- 9b. un refuso nel cognome, a credenziali partite (R3) ----------
           «Rossii» corretto in «Rossi»: il nome utente mariorossii comincia con
           la nuova base mariorossi, ma il servizio lo ricalcolerebbe comunque
           (sarebbe mariorossi5) e le credenziali spedite smetterebbero di
           valere. La finestra deve dirlo e chiedere se mantenerlo. */
        console.log('\n-- correzione «Rossii» -> «Rossi» con le credenziali già inviate');
        const refuso = await api('diretta-gestione', { azione: 'crea', idEvento: ID, righe: [
            { riga: 2, nome: 'Mario', cognome: 'Rossii', email: 'mario.rossii@refuso.example', azienda: 'Refuso S.r.l.' }] }, tokGestore);
        vero(refuso.stato === 200 && refuso.dati.risultati[0].nomeUtente === 'mariorossii', 'un iscritto con un refuso nel cognome (dal servizio vero): nome utente mariorossii');
        await $('#btn-aggiorna-partecipanti').click();
        await aspetta(async () => (await page.locator('#tabella-partecipanti td.col-nome-utente', { hasText: /^mariorossii$/ }).count()) === 1, 10000, 'mariorossii in elenco');
        await (await rp('mariorossii')).locator('button[data-op="reinvia"]').click();
        await confermaDialogo(/Inviare adesso le credenziali/);
        await aspetta(async () => (await (await rp('mariorossii')).locator('.stato-email').textContent()) === 'inviata', 20000, 'credenziali a mariorossii');
        const pwRossii = passwordDa(postaPer('mario.rossii@refuso.example', 'credenziali').pop());
        vero(RE_PASSWORD.test(pwRossii), 'le credenziali di mariorossii sono partite');
        await (await rp('mariorossii')).locator('button[data-op="correggi"]').click();
        await $('#dialogo-correggi').waitFor({ state: 'visible' });
        await $('#corr-cognome').fill('Rossi');
        vero(await $('#corr-scelta-nome').isVisible() && /cambierebbe da mariorossii a mariorossi/.test(await testo('#corr-anteprima-nome')),
            '«Rossii» -> «Rossi» con le credenziali già inviate: la finestra dice che il nome utente cambierebbe e chiede se mantenerlo — «' + await testo('#corr-anteprima-nome') + '»');
        vero(await $('input[name="corr-nome-utente"][value="mantieni"]').isChecked(), 'la scelta proposta è «Mantieni il nome utente attuale»');
        await $('#btn-corr-salva').click();
        await $('#dialogo-correggi').waitFor({ state: 'hidden' });
        const corrRossii = chiamate('partecipante').filter(c => c.dati.operazione === 'correggi').pop().dati;
        const rossiiDopo = await partecipante('mariorossii');
        const [nRossii, nRossi5] = await Promise.all([db.doc('nomiUtente/mariorossii').get(), db.doc('nomiUtente/mariorossi5').get()]);
        vero(corrRossii.mantieniNomeUtente === true && rossiiDopo && rossiiDopo.cognome === 'Rossi' && rossiiDopo.invii[ID].stato === 'inviata'
            && nRossii.exists && nRossii.data().uid === rossiiDopo.uid && !nRossi5.exists,
            '«Mantieni»: cognome corretto, il nome utente resta mariorossii (nessun mariorossi5) e le credenziali restano «inviata»');
        const entraRossii = await api('diretta-accesso', { azione: 'entra', nomeUtente: 'mariorossii', password: pwRossii });
        vero(entraRossii.stato === 200 && entraRossii.dati.cognome === 'Rossi', 'e con il nome utente e la password dell\'email Mario entra davvero');

        /* ---------- 10. accessibilita' e tastiera ---------- */
        console.log('\n-- accessibilità');
        const senzaNome = await page.evaluate(() => {
            const out = [];
            document.querySelectorAll('input, select, textarea').forEach(n => {
                if (n.type === 'hidden') return;
                const etichetta = n.getAttribute('aria-label') || (n.id && document.querySelector('label[for="' + n.id + '"]')) || n.closest('label');
                if (!etichetta) out.push(n.id || n.className || n.name);
            });
            return out;
        });
        vero(senzaNome.length === 0, 'ogni campo ha un\'etichetta', senzaNome.join(', '));
        await $('#tab-evento').click();
        await $('#tab-evento').focus();
        await page.keyboard.press('ArrowRight');
        vero(await $('#tab-regia').getAttribute('aria-selected') === 'true' && await page.evaluate(() => document.activeElement.id) === 'tab-regia', 'schede: le frecce spostano la scheda attiva (role="tab")');
        await page.keyboard.press('End');
        vero(await $('#tab-esporta').getAttribute('aria-selected') === 'true', 'schede: Fine porta all\'ultima');

        /* ---------- 10b. la testata sul telefono ----------
           Sul telefono la testata (che resta in cima scorrendo) e' compatta: una
           riga con marchio, stato e pulsanti piccoli, il menu degli eventi a tutta
           larghezza su una riga sua, le schede che scorrono con un indizio. */
        console.log('\n-- testata sul telefono');
        const misuraTestata = () => page.evaluate(() => {
            const r = s => document.querySelector(s).getBoundingClientRect();
            const t = r('.testata'), sel = r('#sel-evento'), pil = r('#stato-testata'), nuovo = r('#btn-nuovo-evento'), esci = r('#btn-gestore-esci');
            const s = document.querySelector('.schede');
            const scelta = document.querySelector('.schede [aria-selected="true"]').getBoundingClientRect();
            const c = s.getBoundingClientRect();
            const centro = b => b.top + b.height / 2;
            return {
                altezza: Math.round(t.height), finestra: window.innerWidth, selLargo: Math.round(sel.width),
                selSotto: sel.top >= Math.max(pil.bottom, nuovo.bottom, esci.bottom) - 1,
                unaRiga: [pil, nuovo].every(b => Math.abs(centro(b) - centro(esci)) < 4),
                bottoni: Math.round(Math.max(nuovo.height, esci.height)),
                titolo: r('.testata-titolo').width > 1,
                orizzontale: document.documentElement.scrollWidth > window.innerWidth,
                sceltaInVista: scelta.left >= c.left - 1 && scelta.right <= c.right + 1,
                classi: document.querySelector('.testata').className,
                sfumatura: getComputedStyle(s).webkitMaskImage || getComputedStyle(s).maskImage || 'none',
                freccia: getComputedStyle(document.querySelector('.testata'), '::after').content
            };
        });
        const alComputer = await misuraTestata();
        await page.setViewportSize({ width: 390, height: 844 });
        await pausa(400);
        const a390 = await misuraTestata();
        vero(a390.altezza <= 150, '390px: testata compatta, alta ' + a390.altezza + 'px (prima era 212)');
        vero(a390.selSotto && a390.selLargo >= a390.finestra - 32, 'il menu degli eventi sta su una riga sua, largo quanto lo schermo (' + a390.selLargo + 'px): il titolo non è più tagliato');
        vero(a390.unaRiga && a390.bottoni <= 36, 'stato, «Nuovo evento» ed «Esci» su una riga, pulsanti più piccoli (' + a390.bottoni + 'px)');
        vero(!a390.orizzontale && a390.sceltaInVista, 'niente scorrimento orizzontale della pagina, la scheda scelta si vede');
        await page.screenshot({ path: path.join(FOTO, 'telefono-testata-390.png'), clip: { x: 0, y: 0, width: 390, height: 320 } });
        await page.setViewportSize({ width: 360, height: 780 });
        await pausa(400);
        const a360 = await misuraTestata();
        vero(/altre-a-sinistra/.test(a360.classi) && !/altre-a-destra/.test(a360.classi) && a360.sceltaInVista && a360.sfumatura !== 'none' && a360.freccia === 'none',
            '360px: le schede scorrono; con «Esporta» scelta la riga va in fondo e il bordo sinistro sfuma (altre schede prima)', JSON.stringify(a360));
        await $('#tab-evento').click();
        await pausa(300);
        const b360 = await misuraTestata();
        vero(/altre-a-destra/.test(b360.classi) && b360.sceltaInVista && b360.sfumatura !== 'none' && /›/.test(b360.freccia),
            'scelta «Evento», la riga torna all\'inizio: sfumatura e freccia «›» sul bordo destro dicono che ci sono altre schede', JSON.stringify(b360));
        await page.screenshot({ path: path.join(FOTO, 'telefono-testata-360.png'), clip: { x: 0, y: 0, width: 360, height: 300 } });
        await page.setViewportSize({ width: 1440, height: 900 });
        await pausa(400);
        const dopo = await misuraTestata();
        vero(dopo.altezza === alComputer.altezza && dopo.titolo && !/altre-a-/.test(dopo.classi) && dopo.selLargo < 600,
            'sul computer la testata resta com\'era (alta ' + dopo.altezza + 'px, con il titolo, senza indizi)');

        /* ---------- 11. la sessione resta, poi si esce ---------- */
        console.log('\n-- sessione');
        await page.reload();
        await $('#vista-app').waitFor({ state: 'visible', timeout: 20000 });
        // la gestione si mostra subito e l'elenco degli eventi arriva un attimo dopo dal servizio
        const sceltoDopoRicarica = await aspetta(async () => await $('#sel-evento').inputValue() === ID, 10000, 'evento scelto dopo la ricarica').catch(() => false);
        vero(await testo('#gestore-connesso') === EMAIL_GESTORE && sceltoDopoRicarica, 'ricaricando la pagina la sessione resta aperta e l\'evento resta scelto',
            await $('#sel-evento').inputValue());
        await $('#btn-gestore-esci').click();
        await $('#form-gestore').waitFor({ state: 'visible', timeout: 10000 });
        vero(true, '«Esci»: di nuovo alla schermata di accesso');

        /* ---------- 12. errori della pagina e del servizio ---------- */
        const csp = await page.evaluate(() => window.__violazioniCSP);
        vero(csp.length === 0, 'nessuna violazione della Content-Security-Policy', csp.join('\n'));
        vero(erroriPagina.length === 0, 'nessun errore JavaScript nella pagina', erroriPagina.join('\n'));
        /* attesi: le risposte 4xx provocate apposta (password sbagliata, non
           gestore, reinvio entro un minuto, email gia' usata), le richieste di
           'crea' interrotte apposta (rete caduta) e lo script in linea del
           finto YouTube (srcdoc), che la CSP vera blocca come deve */
        const inattesi = erroriConsole.filter(t => !/Failed to load resource: the server responded with a status of (400|401|403|409)/.test(t)
            && !/Failed to load resource: net::ERR_(CONNECTION_RESET|INTERNET_DISCONNECTED)/.test(t)
            && !/Refused to execute inline script/.test(t));
        vero(inattesi.length === 0, 'nessun errore inatteso nella console', inattesi.join('\n'));
        uscitaServer.push(server.uscita);
        const guasti = uscitaServer.join('\n').split('\n').filter(r => /\[server-locale\]|Errore non gestito|TypeError|ReferenceError/.test(r));
        vero(guasti.length === 0, 'nessun errore non gestito nelle funzioni del servizio', guasti.slice(0, 5).join('\n'));
        const tuttaLaPosta = JSON.stringify(leggiPosta().filter(m => m.tipo !== 'credenziali' && m.tipo !== 'prova-credenziali').map(m => m.testo));
        vero(!/Password:\s*\S/.test(tuttaLaPosta), 'nessuna password nelle email che non sono di credenziali (promemoria, reimpostazione)');
    } catch (e) {
        rossi++;
        console.log('ROSSO la prova si è interrotta: ' + (e && e.stack || e));
        if (server && server.uscita) console.log('--- ultime righe del servizio ---\n' + server.uscita.slice(-3000));
    } finally {
        if (browser) await browser.close().catch(() => {});
        await ferma(server);
        await ferma(emulatori);
    }
    console.log('\n' + verdi + ' verdi, ' + rossi + ' rossi (' + Math.round((Date.now() - t0) / 1000) + ' s)');
    console.log('screenshot in ' + path.relative(process.cwd(), FOTO));
    process.exit(rossi ? 1 : 0);
})();
