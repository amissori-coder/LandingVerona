/* ============================================================
   PROVE - dall'inizio alla fine, con tutto vero (tranne la web TV)
   ------------------------------------------------------------
       node diretta/prove/e2e.prova.js

   Le altre prove guardano un pezzo alla volta, e fingono gli altri.
   Questa li mette insieme, come sara' la settimana dell'evento:
   funzioni VERE del servizio (server-locale.js), regole VERE di
   Firestore, emulatori di Firebase, pagine VERE del sito, posta finta
   (una riga JSON per email, in risultati/posta-e2e.jsonl, da cui la
   prova legge i collegamenti e le credenziali come li leggerebbe una
   persona). Il video arriva dalla web TV finta di flusso-prova.js
   (https://webtv.prova.test): una diretta HLS vera trasmessa da ffmpeg
   (serve ffmpeg: quello di sistema, FFMPEG=/percorso, oppure pip
   install imageio-ffmpeg), riprodotta dal player vero della pagina.

   Avvia e ferma da sola: emulatori (firestore 8880, auth 9880) e
   server locale (api 3880, sito 8890).

   IL PERCORSO
    1. il gestore si attiva: "Primo accesso" -> email -> collegamento ->
       sceglie la password nella pagina di reimpostazione -> entra
       nella gestione;
    2. crea l'evento, carica i partecipanti (anteprima e creazione),
       manda un'email di prova a se' stesso e poi le credenziali a tutti;
    3. Mario Rossi (su un iPhone) apre il collegamento dell'email:
       nome utente gia' scritto, password copiata dall'email, entra
       e trova l'attesa con il conto alla rovescia e il programma;
       Anna Maria De Luca entra dal computer scrivendo "Anna Maria De Luca";
    4. il gestore manda in onda: le pagine passano da sole alla
       diretta e il video della web TV scorre nel nostro player;
       schermo intero (anche il finto schermo intero dell'iPhone); il
       gestore cambia il link: il video riparte dal nuovo senza
       ricaricare la pagina; il contatore dei collegati li vede;
    5. connessione persa e ritrovata; la pagina riaperta non chiede di
       nuovo l'accesso;
    6. un minuto intero di diretta: la presenza aggiunge 60 secondi
       (le regole lo verificano con l'orario del server);
    7. Esci; "Password dimenticata?" con l'email: arriva il collegamento
       all'indirizzo VERO, nuova password, accesso automatico;
    8. il gestore termina; esportazione con presenze e accessi.
   Screenshot di ogni passaggio in risultati/screenshot-e2e/.
   Esce con 1 se qualcosa e' rosso.
   ============================================================ */
'use strict';
const fs = require('fs');
const net = require('net');
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
const { preparaContesto } = require('./rete-prove');
const F = require('./flusso-prova');
const CARTELLA_WEBTV = path.join(RISULTATI, 'webtv-e2e');
const LINK = F.WEBTV + '/live/master.m3u8';
const LINK_NUOVO = F.WEBTV + '/riserva/master.m3u8';

const pausa = ms => new Promise(r => setTimeout(r, ms));

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

const PARTECIPANTI = [
    { nome: 'Mario', cognome: 'Rossi', email: 'mario.rossi@esempio.it', azienda: 'Rossi Costruzioni srl' },
    { nome: 'Anna Maria', cognome: 'De Luca', email: 'annamaria.deluca@esempio.it', azienda: 'Studio De Luca' },
    { nome: 'Nicolò', cognome: "D'Angelo", email: 'n.dangelo@esempio.it', azienda: 'DAngelo SpA' },
    { nome: 'Mario', cognome: 'Rossi', email: 'mario.rossi@altra.it', azienda: 'Altra impresa' },
    { nome: 'Giulia', cognome: 'Esposito', email: ' Giulia.Esposito@Esempio.IT ', azienda: 'Esposito & figli' },
    { nome: 'Giulia', cognome: 'Esposito', email: 'giulia.esposito@esempio.it', azienda: 'Esposito & figli' }
];

/* ---------- il video nella pagina ---------- */
const statoVideo = page => page.evaluate(() => {
    const v = document.querySelector('#video-player video');
    const a = document.getElementById('area-video');
    return {
        presente: !!v, t: v ? v.currentTime : 0, fermo: v ? v.paused : true,
        visibile: v ? getComputedStyle(v).visibility === 'visible' : false,
        schermata: a ? a.getAttribute('data-schermata') : ''
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

(async () => {
    let browser;
    let trasmissione = null;
    try {
        /* ---------- 0. la diretta della web TV finta, emulatori e server ---------- */
        for (const p of Object.values(PORTE)) vero(!(await portaOccupata(p)), 'porta ' + p + ' gia\' occupata: chiudi le prove rimaste accese');
        console.log('Avvio della diretta di prova (ffmpeg), di emulatori e server locale...');
        const inTrasmissione = F.avviaTrasmissione(CARTELLA_WEBTV);
        await avvia('emulatori', ['avvia-emulatori.js', '--firestore', String(PORTE.firestore), '--auth', String(PORTE.auth)], 'EMULATORI PRONTI', 150000);
        await avvia('server locale', ['server-locale.js', '--api', String(PORTE.api), '--statico', String(PORTE.statico),
            '--firestore', String(PORTE.firestore), '--auth', String(PORTE.auth)], 'SERVER LOCALE PRONTO', 30000,
        { DIRETTA_POSTA_FINTA: POSTA, DIRETTA_ADMIN_EMAILS: GESTORE, DIRETTA_AUTH_AL_SECONDO: '40' });
        trasmissione = await inTrasmissione;
        const app = admin.initializeApp({ projectId: PROGETTO }, 'e2e');
        const db = app.firestore();

        browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
        async function contesto(opzioni, senzaSchermoIntero) {
            const context = await browser.newContext(Object.assign({ locale: 'it-IT', timezoneId: 'Europe/Rome' }, opzioni));
            await preparaContesto(context, {});
            // la web TV finta (dopo preparaContesto: vince lei); webtv.richieste: i percorsi chiesti
            const webtv = await F.instradaWebTv(context, CARTELLA_WEBTV);
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
                });
            }
            const page = await context.newPage();
            page.__errori = [];
            page.on('pageerror', e => page.__errori.push(String(e && e.message || e)));
            return { context, page, webtv };
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
        await prova('crea l\'evento di Napoli', async () => {
            const r = await g({ azione: 'evento-salva', evento: {
                id: EVENTO, nuovo: true, titolo: 'Next Generation Business 2026 · Napoli', luogo: 'Napoli · Hotel Eurostars Excelsior',
                data: '2026-10-02', oraInizio: '09:00', oraFine: '17:30', videoUrl: LINK,
                programma: '09.00 Accoglienza e registrazione\n09.30 Apertura dei lavori\n10.00 Adeguati assetti e governance\n13.00 Pausa pranzo\n17.30 Chiusura',
                paginaEvento: '/napoli_ottobre_2026/', unSoloDispositivo: false, promemoria: { giornoPrima: true, oraPrima: true }
            } });
            vero(r.evento && r.evento.id === EVENTO, 'evento non creato');
            const pubblico = (await db.doc('eventi/' + EVENTO).get()).data();
            vero(!pubblico.videoUrl && !pubblico.videoId, 'il link del video e\' leggibile prima della diretta');
        });
        let risultatiCrea = [];
        await prova('anteprima e creazione: omonimi numerati, stessa email scritta diversamente = una persona', async () => {
            const N = require(path.resolve(__dirname, '../nome-utente.js'));
            const righe = PARTECIPANTI.map((p, i) => Object.assign({ riga: i + 2 }, p));
            const emails = righe.map(r => N.emailNormalizzata(r.email));
            const basi = righe.map(r => N.nomeUtenteBase(r.nome, r.cognome));
            const ant = await g({ azione: 'anteprima', idEvento: EVENTO, emails, basi, nomi: [] });
            const analisi = N.analizzaRighe(righe.map(r => Object.assign({}, r, { confermaOmonimo: true })), ant.esistenti, EVENTO);
            vero(analisi.pronto, 'anteprima non pronta: ' + JSON.stringify(analisi.conteggi));
            const daCreare = analisi.righe.filter(r => r.esito === 'nuovo' || r.esito === 'esistente')
                .map(r => ({ riga: r.riga, nome: r.nome, cognome: r.cognome, email: r.email, azienda: r.azienda, nomeUtente: r.nomeUtente }));
            vero(daCreare.length === 5, 'righe da creare: ' + daCreare.length + ' invece di 5 (la sesta e\' un doppione)');
            const r = await g({ azione: 'crea', idEvento: EVENTO, righe: daCreare });
            risultatiCrea = r.risultati;
            const nomi = risultatiCrea.map(x => x.nomeUtente).sort();
            vero(JSON.stringify(nomi) === JSON.stringify(['annamariadeluca', 'giuliaesposito', 'mariorossi', 'mariorossi2', 'nicolodangelo']), 'nomi utente: ' + nomi.join(', '));
            // ricaricare lo stesso file non crea niente
            const r2 = await g({ azione: 'crea', idEvento: EVENTO, righe: daCreare });
            vero(r2.risultati.every(x => x.esito === 'gia-nell-evento'), 'il secondo caricamento ha creato qualcosa');
            const utenti = await app.auth().listUsers(1000);
            vero(utenti.users.filter(u => !u.customClaims || !u.customClaims.gestore).length === 5, 'account Auth: ' + utenti.users.length);
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
                const m = posta().filter(x => aIndirizzo(x, p.email.trim())).find(x => /Password:/.test(x.testo || ''));
                vero(m, 'nessuna email di credenziali per ' + p.email);
                const nu = /Nome utente:\s*(\S+)/.exec(m.testo)[1];
                const pw = /Password:\s*(\S+)/.exec(m.testo)[1];
                credenziali[p.email.trim().toLowerCase()] = { nomeUtente: nu, password: pw, link: linkDa(m.testo, /http:\/\/127\.0\.0\.1:\d+\/diretta\/\?[^\s"<>]+/) };
            });
            vero(posta().filter(x => /Password:/.test(x.testo || '') && !/prova/i.test(x.oggetto || '')).length === 5, 'email di credenziali doppie o mancanti');
            const nessunaInChiaro = (await db.collection('partecipanti').get()).docs.every(d => JSON.stringify(d.data()).indexOf(credenziali['mario.rossi@esempio.it'].password) < 0);
            vero(nessunaInChiaro, 'una password e\' finita in Firestore');
        });

        /* ---------- 3. i partecipanti entrano ---------- */
        console.log('\n3. I partecipanti entrano e aspettano');
        const iphone = await contesto({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' }, true);
        const mario = credenziali['mario.rossi@esempio.it'];
        await prova('Mario apre il collegamento dell\'email: nome utente gia\' scritto', async () => {
            vero(/\?u=mariorossi/.test(mario.link), 'il collegamento non porta il nome utente: ' + mario.link);
            await iphone.page.goto(mario.link);
            await vista(iphone.page, 'accesso');
            vero(await iphone.page.inputValue('#campo-nome-utente') === 'mariorossi', 'campo non precompilato');
            await foto(iphone.page, '02-accesso-telefono');
        });
        await prova('Mario entra con la password dell\'email e trova l\'attesa con conto alla rovescia e programma', async () => {
            await iphone.page.fill('#campo-password', mario.password);
            await iphone.page.click('#btn-entra');
            await vista(iphone.page, 'attesa');
            const giorni = Number(await iphone.page.textContent('#conto-giorni'));
            vero(giorni >= 1, 'conto alla rovescia: ' + giorni);
            vero(await iphone.page.locator('#programma li').count() >= 5, 'programma assente');
            await foto(iphone.page, '03-attesa-telefono');
        });
        const computer = await contesto({ viewport: { width: 1366, height: 900 } });
        const anna = credenziali['annamaria.deluca@esempio.it'];
        await prova('Anna Maria entra dal computer scrivendo "Anna Maria De Luca" (maiuscole e spazi)', async () => {
            await computer.page.goto(SITO + '/diretta/');
            await vista(computer.page, 'accesso');
            await computer.page.fill('#campo-nome-utente', ' Anna Maria De Luca ');
            await computer.page.fill('#campo-password', anna.password);
            await computer.page.click('#btn-entra');
            await vista(computer.page, 'attesa');
            vero(/Anna Maria/.test(await computer.page.textContent('#nome-persona')), 'nome della persona assente');
            await foto(computer.page, '04-attesa-computer');
        });

        /* ---------- 4. in onda ---------- */
        console.log('\n4. In onda');
        await prova('il gestore manda in onda: le pagine passano da sole alla diretta e il video della web TV scorre nel nostro player', async () => {
            await g({ azione: 'evento-stato', idEvento: EVENTO, stato: 'in_onda' });
            await vista(iphone.page, 'diretta');
            await vista(computer.page, 'diretta');
            const pubblico = (await db.doc('eventi/' + EVENTO).get()).data();
            vero(pubblico.videoId === LINK && !pubblico.videoUrl, 'documento pubblico: ' + JSON.stringify({ v: pubblico.videoId, u: pubblico.videoUrl }));
            for (const c of [computer, iphone]) {
                await videoVa(c.page, 30000, 'la diretta');
                vero(c.webtv.richieste.some(r => /^\/live\/.*\.m4s$/.test(r)), 'segmenti della web TV non chiesti');
                vero(await c.page.evaluate(() => { const v = document.querySelector('#video-player video'); return v.muted && !v.controls && /nodownload/.test(v.getAttribute('controlslist') || ''); }),
                    'il video non parte muto, o ha i comandi del browser, o si puo\' scaricare');
                await aspetta(() => c.page.locator('#indicatore-live').isVisible(), 10000, '«IN DIRETTA»');
                await aspetta(() => c.page.locator('#sel-qualita').isVisible(), 10000, 'la scelta della qualità');
            }
            await foto(computer.page, '05-diretta-computer');
            await foto(iphone.page, '06-diretta-telefono');
        });
        await prova('schermo intero sul computer e finto schermo intero sull\'iPhone', async () => {
            await computer.page.click('#btn-schermo-intero');
            await aspetta(() => computer.page.evaluate(() => document.getElementById('riquadro-video').getAttribute('data-intero') === '1'), 5000, 'schermo intero sul computer');
            await computer.page.keyboard.press('Escape');
            await iphone.page.click('#btn-schermo-intero');
            await aspetta(() => iphone.page.evaluate(() => document.getElementById('riquadro-video').getAttribute('data-intero') === '1'
                && document.documentElement.classList.contains('schermo-intero-finto')), 5000, 'finto schermo intero');
            await foto(iphone.page, '07-schermo-intero-telefono');
            await iphone.page.click('#btn-schermo-intero');
        });
        await prova('il gestore cambia il link durante la diretta: il video riparte dal nuovo senza ricaricare la pagina', async () => {
            const da = {};
            for (const c of [computer, iphone]) {
                await c.page.evaluate(() => { window.__segnoPagina = 'ancora-qui'; document.querySelector('#video-player video').dataset.segno = 'lo-stesso'; });
                da[c === computer ? 'computer' : 'iphone'] = c.webtv.richieste.length;
            }
            // incollato con uno spazio e un #: il servizio lo pulisce
            await g({ azione: 'evento-video', idEvento: EVENTO, videoUrl: ' ' + LINK_NUOVO + '#dal-sito ' });
            for (const [c, nome] of [[computer, 'computer'], [iphone, 'iphone']]) {
                await aspetta(() => c.webtv.richieste.slice(da[nome]).some(r => /^\/riserva\/.*\.m4s$/.test(r)), 15000, 'il nuovo link sul ' + nome);
                await videoVa(c.page, 20000, 'il video del nuovo link sul ' + nome);
                vero(await c.page.evaluate(() => window.__segnoPagina) === 'ancora-qui', 'la pagina si e\' ricaricata (' + nome + ')');
                vero(await c.page.evaluate(() => document.querySelector('#video-player video').dataset.segno === 'lo-stesso'), 'la pagina ha ricreato il video (' + nome + ')');
            }
            const pubblico = (await db.doc('eventi/' + EVENTO).get()).data();
            vero(pubblico.videoId === LINK_NUOVO && !pubblico.videoUrl, 'documento pubblico: ' + JSON.stringify({ v: pubblico.videoId, u: pubblico.videoUrl }));
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
            await computer.context.setOffline(true);
            await computer.page.waitForSelector('#avviso-connessione:not([hidden])', { timeout: 15000 });
            await foto(computer.page, '08-connessione-persa');
            await computer.context.setOffline(false);
            await computer.page.waitForSelector('#avviso-connessione', { state: 'hidden', timeout: 30000 });
        });
        await prova('riaprendo la pagina non si rifa\' l\'accesso, e il video riparte', async () => {
            await iphone.page.reload();
            await vista(iphone.page, 'diretta', 30000);
            await videoVa(iphone.page, 30000, 'il video dopo la riapertura');
        });

        /* ---------- 6. un minuto di diretta ---------- */
        console.log('\n6. Un minuto intero di diretta (presenza per gli attestati)');
        await prova('dopo un minuto la presenza aggiunge 60 secondi, verificati dalle regole', async () => {
            const uid = risultatiCrea.find(x => x.nomeUtente === 'annamariadeluca').uid;
            const doc = await aspetta(async () => {
                const d = (await db.doc('presenze/' + EVENTO + '_' + uid).get()).data();
                return d && d.secondi >= 60 ? d : null;
            }, 95000, 'secondi >= 60');
            vero(doc.secondi === 60 && doc.collegamenti >= 1, JSON.stringify({ s: doc.secondi, c: doc.collegamenti }));
        });

        /* ---------- 7. esci e password dimenticata ---------- */
        console.log('\n7. Esci e "Password dimenticata?"');
        await prova('Esci (con conferma) riporta all\'accesso', async () => {
            await iphone.page.click('#btn-esci');
            await conferma(iphone.page);
            await vista(iphone.page, 'accesso');
        });
        await prova('"Password dimenticata?" con l\'email: risposta uguale, collegamento all\'indirizzo vero', async () => {
            await iphone.page.click('#link-dimenticata');
            await vista(iphone.page, 'dimenticata');
            const prima = posta().length;
            await iphone.page.fill('#campo-identificativo', 'Mario.Rossi@Esempio.it');
            await iphone.page.click('#btn-invia-reset');
            await iphone.page.waitForFunction(() => /Se l.account esiste/i.test(document.getElementById('msg-dimenticata').textContent), null, { timeout: 15000 });
            const m = await aspetta(() => posta().slice(prima).find(x => aIndirizzo(x, 'mario.rossi@esempio.it')), 10000, 'email di reimpostazione');
            vero(!posta().slice(prima).some(x => aIndirizzo(x, 'mario.rossi@altra.it')), 'e\' stato scritto all\'omonimo');
            mario.reset = linkDa(m.testo || m.html, /http:\/\/127\.0\.0\.1:\d+\/diretta\/reimposta\.html\?[^\s"<>]+/);
            vero(/[?&]u=mariorossi/.test(mario.reset), 'il collegamento non porta il nome utente: ' + mario.reset);
            await foto(iphone.page, '09-dimenticata-telefono');
        });
        await prova('nuova password e accesso automatico alla diretta', async () => {
            await iphone.page.goto(mario.reset);
            await iphone.page.waitForSelector('#form-reimposta:not([hidden])', { timeout: 20000 });
            await iphone.page.fill('#campo-nuova', 'NuovaPassword2026');
            await iphone.page.fill('#campo-ripeti', 'NuovaPassword2026');
            await foto(iphone.page, '10-reimposta-telefono');
            await iphone.page.click('#btn-salva-password');
            await iphone.page.waitForURL(/\/diretta\/(\?.*)?$/, { timeout: 30000 });
            await vista(iphone.page, 'diretta', 30000);
        });
        await prova('la vecchia password non vale piu\', la nuova si', async () => {
            const vecchia = await fetch(API + '/diretta-accesso', { method: 'POST', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ azione: 'entra', nomeUtente: 'mariorossi', password: mario.password }) });
            vero(vecchia.status === 401, 'vecchia password: ' + vecchia.status);
            const nuova = await chiama('diretta-accesso', { azione: 'entra', nomeUtente: 'Mario Rossi', password: 'NuovaPassword2026' });
            vero(nuova.token, 'nuova password rifiutata');
        });

        /* ---------- 8. fine ed esportazione ---------- */
        console.log('\n8. Fine ed esportazione');
        await prova('il gestore termina: le pagine mostrano la fine e il video sparisce dal documento pubblico', async () => {
            await g({ azione: 'evento-stato', idEvento: EVENTO, stato: 'terminato' });
            await vista(computer.page, 'fine');
            await vista(iphone.page, 'fine');
            const pubblico = (await db.doc('eventi/' + EVENTO).get()).data();
            vero(!pubblico.videoId, 'il video resta nel documento pubblico');
            await foto(computer.page, '11-fine-computer');
        });
        await prova('esportazione: partecipanti con i minuti e registro degli accessi', async () => {
            const r = await g({ azione: 'esporta', idEvento: EVENTO });
            vero(r.partecipanti.length === 5, 'partecipanti: ' + r.partecipanti.length);
            const a = r.partecipanti.find(p => p.nomeUtente === 'annamariadeluca');
            vero(a && a.presenza && a.presenza.secondi >= 60, 'minuti di Anna Maria: ' + JSON.stringify(a && a.presenza));
            vero(r.accessi.length >= 3 && r.accessi.every(x => x.nomeUtente && x.quando), 'accessi: ' + r.accessi.length);
        });
        await prova('nessuna violazione della CSP e nessun errore nelle pagine', async () => {
            for (const c of [iphone, computer, gestione]) {
                const v = await c.page.evaluate(() => window.__violazioniCsp || []).catch(() => []);
                vero(v.length === 0, 'CSP: ' + v.join(' | '));
                vero(c.page.__errori.length === 0, 'errori: ' + c.page.__errori.join(' | '));
            }
        });
    } catch (e) {
        rossi++;
        console.log('ROSSO (interruzione) ' + (e && e.stack || e));
    } finally {
        if (browser) await browser.close().catch(() => {});
        if (trasmissione) trasmissione.ferma();
        ferma();
    }
    console.log('\n' + verdi + ' verdi, ' + rossi + ' rossi');
    setTimeout(() => process.exit(rossi ? 1 : 0), 1500);
})();
