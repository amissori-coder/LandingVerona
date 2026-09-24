/* ============================================================
   PROVE - l'accesso alla diretta, via HTTP
   ------------------------------------------------------------
       node accesso.prova.js [--firestore 8180] [--auth 9180]
                             [--api 3180] [--statico 8190] [--conta 9181]

   Se sulle porte degli emulatori non risponde gia' niente, la prova li
   avvia (con le regole vere) e li ferma alla fine. Il server locale
   (server-locale.js: le funzioni api/diretta-*.js come le monta
   Vercel) lo avvia sempre la prova, con due differenze rispetto ai
   predefiniti:
   - le chiamate del servizio all'emulatore di Auth passano da un
     piccolo inoltro sulla porta --conta, che CONTA le verifiche della
     password (accounts:signInWithPassword): e' cosi' che si vede
     quante richieste arrivano davvero alla verifica;
   - la posta finta va in risultati/posta-accesso.jsonl (non in quella
     comune ad altre prove).

   COSA DIMOSTRA.
   - Accesso con "Mario Rossi" scritto con maiuscole e spazi; il token
     restituito funziona (signInWithCustomToken) e porta il claim eventi;
     con quel token si legge il proprio evento e non il profilo altrui.
   - 5 password sbagliate di fila -> 429 con l'attesa (30 s), poi 60 s,
     poi 120 s; durante l'attesa nessuna verifica arriva a Google.
   - Nome inesistente: stessa risposta di una password sbagliata, e
     nessuna verifica.
   - Account disattivato: con l'account chiuso anche su Firebase Auth la
     risposta e' identica a una password sbagliata (DECISIONI T1: Google
     risponde USER_DISABLED anche con la password sbagliata, e dirlo
     rivelerebbe quali account sono chiusi); se la password e' giusta e
     l'account e' disattivato solo nei dati della diretta -> 403.
   - 20 accessi CONTEMPORANEI sbagliati per lo stesso nome dalla stessa
     rete: al massimo 5 arrivano alla verifica, gli altri 429.
   - 5 errori da una rete non bloccano lo stesso nome da un'altra rete.
   - Un accesso riuscito restituisce subito il tentativo della rete
     (tentativiIp/{rete}_{finestra}: inCorso torna a 0, falliti 0).
   - 100 accessi CONTEMPORANEI sbagliati da una rete, con 100 nomi
     diversi: al massimo 40 arrivano alla verifica, poi la rete aspetta
     (anche con la password giusta), mentre da un'altra rete si entra.
   - 60 "password dimenticata" CONTEMPORANEE da una rete, per 60 persone
     diverse: al massimo 20 email; tutte le richieste contate.
   - Password dimenticata con nome utente, con email, con nome o email
     inesistenti: sempre la stessa risposta, dopo lo stesso tempo; con
     la posta finta, l'email con /diretta/reimposta.html?oobCode= arriva
     all'indirizzo VERO e solo nei casi giusti, e il collegamento
     funziona.
   - Gestione: senza token 401; token di un non gestore 403; chi si
     registra da solo con l'email del gestore riceve 403 e, dopo
     'gestore-accesso', perde l'accesso; il gestore attivato entra.
   - 'aggiorna-permessi' ripara i claims.
   - diretta-stato: pubblico, con Cache-Control, mai il video; il video
     nel documento dell'evento solo in onda.
   - Un solo dispositivo: il secondo accesso cambia la sessione ammessa
     e le regole rifiutano la presenza del primo dispositivo.
   - Un iscritto con uno spazio invisibile U+200B nell'email (caricato
     cosi', o rimasto cosi' da prima della regola unica) riceve
     credenziali e reimpostazione all'indirizzo giusto.
   - Nei log del servizio non compaiono password ne' indirizzi email.
   Esce con 1 se qualcosa e' rosso.
   ============================================================ */
'use strict';
const fs = require('fs');
const os = require('os');
const net = require('net');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

function argomento(nome, predefinito) {
    const i = process.argv.indexOf('--' + nome);
    return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : predefinito;
}
const PORTA_FS = Number(argomento('firestore', 8180));
const PORTA_AUTH = Number(argomento('auth', 9180));
const PORTA_API = Number(argomento('api', 3180));
const PORTA_STATICO = Number(argomento('statico', 8190));
const PORTA_CONTA = Number(argomento('conta', 9181));
const PROGETTO = 'demo-ngb-eventi';
const EVENTO = 'napoli-2026';
const API = 'http://127.0.0.1:' + PORTA_API + '/api';
const AUTH_REST = 'http://127.0.0.1:' + PORTA_AUTH + '/identitytoolkit.googleapis.com/v1/accounts:';
const FS_DOC = 'http://127.0.0.1:' + PORTA_FS + '/v1/projects/' + PROGETTO + '/databases/(default)/documents';
const RISULTATI = path.resolve(__dirname, 'risultati');
const POSTA = path.join(RISULTATI, 'posta-accesso.jsonl');
const LOG_SERVER = path.join(RISULTATI, 'server-accesso.log');
const GESTORE = 'gestore@prova.it';
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:' + PORTA_FS;
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:' + PORTA_AUTH;
const SERVIZIO = path.resolve(__dirname, '../../email-service');
const admin = require(path.join(SERVIZIO, 'node_modules/firebase-admin'));
const C = require(path.join(SERVIZIO, 'lib/diretta-comune'));
const app = admin.initializeApp({ projectId: PROGETTO }, 'prova-accesso');
const db = app.firestore();
const auth = app.auth();
const pausa = ms => new Promise(r => setTimeout(r, ms));

let rossi = 0, verdi = 0;
function vero(cond, descrizione, dettaglio) {
    if (cond) { verdi++; console.log('  ok  ' + descrizione); }
    else { rossi++; console.log('ROSSO ' + descrizione + (dettaglio ? '\n       ' + dettaglio : '')); }
}
function uguale(ottenuto, atteso, descrizione) {
    const ok = JSON.stringify(ottenuto) === JSON.stringify(atteso);
    vero(ok, descrizione, ok ? '' : 'atteso ' + JSON.stringify(atteso) + ', ottenuto ' + JSON.stringify(ottenuto));
}

/* ---------- emulatori (come in doppioni.prova.js: avviati dalla prova se spenti, porte di servizio accanto a Firestore) ---------- */
function portaAperta(porta) {
    return new Promise(r => {
        const s = net.connect(porta, '127.0.0.1');
        s.on('connect', () => { s.destroy(); r(true); });
        s.on('error', () => r(false));
    });
}
async function assicuraEmulatori() {
    if (await portaAperta(PORTA_FS) && await portaAperta(PORTA_AUTH)) return null;
    const cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'ngb-accesso-'));
    fs.copyFileSync(path.resolve(__dirname, '../firebase/firestore.rules'), path.join(cartella, 'firestore.rules'));
    fs.writeFileSync(path.join(cartella, 'firebase.json'), JSON.stringify({
        firestore: { rules: 'firestore.rules' },
        emulators: {
            auth: { port: PORTA_AUTH, host: '127.0.0.1' },
            firestore: { port: PORTA_FS, host: '127.0.0.1', websocketPort: PORTA_FS + 5 },
            hub: { port: PORTA_FS + 3, host: '127.0.0.1' },
            logging: { port: PORTA_FS + 4, host: '127.0.0.1' },
            ui: { enabled: false }
        }
    }));
    const locale = path.resolve(__dirname, 'node_modules/.bin/firebase');
    const figlio = spawn(fs.existsSync(locale) ? locale : 'firebase', ['emulators:start', '--only', 'auth,firestore', '--project', PROGETTO], {
        cwd: cartella, stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { FORCE_COLOR: '0' })
    });
    await aspettaRiga(figlio, /All emulators ready/, 120000);
    console.log('(emulatori avviati dalla prova: firestore ' + PORTA_FS + ', auth ' + PORTA_AUTH + ')');
    return figlio;
}
function aspettaRiga(figlio, re, limiteMs, log) {
    return new Promise((ok, ko) => {
        const limite = setTimeout(() => ko(new Error('non pronto in ' + limiteMs + ' ms')), limiteMs);
        const leggi = d => {
            if (log) log.write(d);
            if (re.test(String(d))) { clearTimeout(limite); ok(); }
        };
        figlio.stdout.on('data', leggi);
        figlio.stderr.on('data', d => { if (log) log.write(d); else if (/Error:/.test(String(d))) process.stderr.write(d); });
        figlio.on('exit', c => { clearTimeout(limite); ko(new Error('processo uscito (' + c + ')')); });
    });
}
function ferma(figlio, segnale) {
    if (!figlio || figlio.exitCode !== null) return Promise.resolve();
    return new Promise(r => {
        const forza = setTimeout(() => { try { figlio.kill('SIGKILL'); } catch (_) { /* gia' fermo */ } r(); }, 20000);
        figlio.on('exit', () => { clearTimeout(forza); r(); });
        figlio.kill(segnale || 'SIGINT');
    });
}
async function svuota() {
    const [a, b] = await Promise.all([
        fetch('http://127.0.0.1:' + PORTA_FS + '/emulator/v1/projects/' + PROGETTO + '/databases/(default)/documents', { method: 'DELETE' }),
        fetch('http://127.0.0.1:' + PORTA_AUTH + '/emulator/v1/projects/' + PROGETTO + '/accounts', { method: 'DELETE' })
    ]);
    if (!a.ok || !b.ok) throw new Error('svuotamento degli emulatori non riuscito');
}

/* ---------- l'inoltro che conta le verifiche della password ---------- */
let verifiche = 0;
function avviaContatore() {
    const server = http.createServer((req, res) => {
        if (req.method === 'POST' && /accounts:signInWithPassword/.test(req.url)) verifiche++;
        const avanti = http.request({ host: '127.0.0.1', port: PORTA_AUTH, method: req.method, path: req.url, headers: req.headers }, r => {
            res.writeHead(r.statusCode, r.headers);
            r.pipe(res);
        });
        avanti.on('error', () => { res.statusCode = 502; res.end(); });
        req.pipe(avanti);
    });
    return new Promise(r => server.listen(PORTA_CONTA, '127.0.0.1', () => r(server)));
}

/* ---------- il server locale ---------- */
async function avviaServer() {
    const log = fs.createWriteStream(LOG_SERVER);
    const env = Object.assign({}, process.env, {
        FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:' + PORTA_CONTA,   // il servizio passa dal contatore
        FIRESTORE_EMULATOR_HOST: '127.0.0.1:' + PORTA_FS,
        DIRETTA_POSTA_FINTA: POSTA,
        DIRETTA_ADMIN_EMAILS: GESTORE,
        DIRETTA_EMULATORE: '1',
        DIRETTA_PROGETTO: PROGETTO
    });
    const figlio = spawn(process.execPath, [path.join(__dirname, 'server-locale.js'),
        '--api', String(PORTA_API), '--statico', String(PORTA_STATICO), '--firestore', String(PORTA_FS), '--auth', String(PORTA_AUTH)], {
        stdio: ['ignore', 'pipe', 'pipe'], env: env
    });
    await aspettaRiga(figlio, /SERVER LOCALE PRONTO/, 30000, log);
    return figlio;
}

/* ---------- chiamate ---------- */
async function chiama(funzione, corpo, opz) {
    const o = opz || {};
    const h = { 'content-type': 'application/json', 'x-forwarded-for': o.ip || '10.9.9.9', 'user-agent': o.ua || UA_IPHONE, origin: 'http://127.0.0.1:' + PORTA_STATICO };
    if (o.token) h.authorization = 'Bearer ' + o.token;
    const t0 = Date.now();
    const r = await fetch(API + '/' + funzione, { method: 'POST', headers: h, body: JSON.stringify(corpo) });
    const testo = await r.text();
    let dati = null;
    try { dati = JSON.parse(testo); } catch (_) { /* non JSON */ }
    return { stato: r.status, dati: dati || {}, testo: testo, ms: Date.now() - t0, h: r.headers };
}
const entra = (nomeUtente, password, opz) => chiama('diretta-accesso', { azione: 'entra', nomeUtente, password }, opz);
const gestione = (corpo, token) => chiama('diretta-gestione', corpo, { token });
async function rest(metodo, corpo) {
    const r = await fetch(AUTH_REST + metodo + '?key=finta', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
    return { stato: r.status, dati: await r.json() };
}
const contenuto = t => JSON.parse(Buffer.from(String(t).split('.')[1], 'base64url').toString('utf8'));
function leggiPosta() {
    if (!fs.existsSync(POSTA)) return [];
    return fs.readFileSync(POSTA, 'utf8').split('\n').filter(Boolean).map(r => { try { return JSON.parse(r); } catch (_) { return null; } }).filter(Boolean);
}
function oobDa(posta) {
    const testo = String(posta.testo || '') + ' ' + String(posta.html || '');
    const m = /\/diretta\/reimposta\.html\?oobCode=([A-Za-z0-9_-]+)/.exec(testo.replace(/&amp;/g, '&'));
    return m ? m[1] : '';
}
// la presenza come la scrive la pagina (creazione), con le regole vere
async function creaPresenza(idToken, uid, sessione) {
    const nome = 'projects/' + PROGETTO + '/databases/(default)/documents/presenze/' + EVENTO + '_' + uid;
    const r = await fetch(FS_DOC + ':commit', {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + idToken },
        body: JSON.stringify({
            writes: [{
                update: { name: nome, fields: { uid: { stringValue: uid }, idEvento: { stringValue: EVENTO }, secondi: { integerValue: '0' }, collegamenti: { integerValue: '1' }, sessione: { stringValue: sessione } } },
                updateTransforms: [{ fieldPath: 'primo', setToServerValue: 'REQUEST_TIME' }, { fieldPath: 'ultimo', setToServerValue: 'REQUEST_TIME' }],
                currentDocument: { exists: false }
            }]
        })
    });
    return r.status;
}
const password = () => 'Pr' + crypto.randomBytes(6).toString('base64url') + '7k';
const coppia = (nome, ip) => db.collection('tentativi').doc(nome + '_' + C.improntaIp(ip));
// il contatore della rete per la finestra fissa di 15 minuti che contiene `quando` (come lo calcola il servizio)
const QUINDICI_MINUTI = 15 * 60 * 1000;
async function contatoreRete(ip, t0, t1) {
    const ids = Array.from(new Set([Math.floor(t0 / QUINDICI_MINUTI), Math.floor(t1 / QUINDICI_MINUTI)]));
    const somma = { inCorso: 0, falliti: 0 };
    for (const f of ids) {
        const d = (await db.collection('tentativiIp').doc(C.improntaIp(ip) + '_' + f).get()).data() || {};
        somma.inCorso += Number(d.inCorso) || 0;
        somma.falliti += Number(d.falliti) || 0;
    }
    return somma;
}
/* Una raffica non deve cadere a cavallo di due finestre dei limiti (15
   minuti per l'accesso, un'ora per "password dimenticata"): se manca
   poco al cambio, si aspetta che passi. */
async function fuoriDalBordo(finestraMs, margineMs) {
    const resto = finestraMs - (Date.now() % finestraMs);
    if (resto < margineMs) { console.log('       (attesa di ' + Math.ceil(resto / 1000) + ' s: la finestra dei limiti sta per cambiare)'); await pausa(resto + 500); }
}
/* Tante persone in un colpo, direttamente con firebase-admin (come fa
   coda.prova.js): account Auth con l'email tecnica dell'uid e i
   documenti come li scrive 'crea'. Servono solo a dare nomi e indirizzi
   veri alle raffiche; stanno in un evento a parte, per non cambiare i
   conti dell'evento di Napoli. */
async function creaPersoneVeloci(quante, prefisso, idEvento) {
    const persone = Array.from({ length: quante }, (_, i) => {
        const nomeUtente = prefisso + i;
        return { uid: 'p' + crypto.randomBytes(10).toString('hex'), nomeUtente: nomeUtente, email: nomeUtente + '@raffica.prova' };
    });
    const r = await auth.importUsers(persone.map(p => ({ uid: p.uid, email: C.emailTecnica(p.uid), displayName: 'Prova ' + p.nomeUtente, customClaims: { eventi: [idEvento] } })));
    if (r.failureCount) throw new Error('importUsers: ' + r.failureCount + ' falliti');
    const ora = admin.firestore.Timestamp.now();
    for (const gruppo of C.aGruppi(persone, 100)) {
        const b = db.batch();
        gruppo.forEach(p => {
            b.set(db.collection('partecipanti').doc(p.uid), {
                uid: p.uid, nomeUtente: p.nomeUtente, nome: 'Prova', cognome: p.nomeUtente, email: p.email, emailNorm: p.email, azienda: '',
                idEvento: idEvento, eventi: [idEvento], stato: 'attivo', authCreato: true, ultimoAccesso: null,
                invii: {}, promemoria: {}, creato: ora, aggiornato: ora
            });
            b.set(db.collection('nomiUtente').doc(p.nomeUtente), { uid: p.uid, base: p.nomeUtente, creato: ora });
            b.set(db.collection('indirizzi').doc(p.email), { uid: p.uid, creato: ora });
            b.set(db.collection('sessioni').doc(p.uid), { stato: 'attivo', sessioneAttiva: null, aggiornato: ora });
        });
        await b.commit();
    }
    return persone;
}

(async () => {
    const emulatori = await assicuraEmulatori();
    let contatore = null, server = null;
    const segrete = [];   // le password della prova: non devono comparire nei log
    try {
        await svuota();
        fs.mkdirSync(RISULTATI, { recursive: true });
        try { fs.unlinkSync(POSTA); } catch (_) { /* non c'era */ }
        contatore = await avviaContatore();
        server = await avviaServer();
        const invioPresente = fs.existsSync(path.join(SERVIZIO, 'lib/diretta-invio.js'));

        /* ================= GESTORI ================= */
        console.log('\nGestione: chi entra e chi no');
        const senza = await gestione({ azione: 'chi-sono' });
        uguale(senza.stato, 401, 'chiamata senza token: 401');
        const pwAttacco = password(); segrete.push(pwAttacco);
        const attacco = await rest('signUp', { email: GESTORE, password: pwAttacco, returnSecureToken: true });
        vero(!!attacco.dati.idToken, 'un attaccante si registra da solo con l\'email del gestore (accounts:signUp con la chiave pubblica)');
        const r403 = await gestione({ azione: 'chi-sono' }, attacco.dati.idToken);
        vero(r403.stato === 403 && r403.dati.codice === 'da-attivare', 'il suo token riceve 403 ("usa Primo accesso...")', r403.stato + ' ' + r403.testo);
        const curioso = await rest('signUp', { email: 'curioso@prova.it', password: password(), returnSecureToken: true });
        const rCurioso = await gestione({ azione: 'eventi' }, curioso.dati.idToken);
        vero(rCurioso.stato === 403 && rCurioso.dati.codice === 'non-gestore', 'token di chi non e\' nell\'elenco dei gestori: 403');
        await pausa(1100); // le revoche di Firebase contano i secondi interi
        const [gAcc, gNo] = await Promise.all([
            chiama('diretta-accesso', { azione: 'gestore-accesso', email: '  Gestore@Prova.IT ' }, { ip: '10.1.0.1' }),
            chiama('diretta-accesso', { azione: 'gestore-accesso', email: 'nessuno@prova.it' }, { ip: '10.1.0.1' })
        ]);
        vero(gAcc.stato === 200 && gAcc.testo === gNo.testo, 'gestore-accesso: stessa risposta per un gestore e per un indirizzo qualunque', gAcc.testo + ' / ' + gNo.testo);
        vero(gAcc.ms >= 2500 && gNo.ms >= 2500 && gAcc.ms < 3600 && gNo.ms < 3600, 'gestore-accesso: risposta a durata costante (' + gAcc.ms + ' ms e ' + gNo.ms + ' ms)');
        vero(!(await auth.getUserByEmail('nessuno@prova.it').catch(() => null)), 'nessun account creato per un indirizzo che non e\' tra i gestori');
        const dopoRevoca = await gestione({ azione: 'chi-sono' }, attacco.dati.idToken);
        uguale(dopoRevoca.stato, 401, 'dopo gestore-accesso il token dell\'attaccante e\' revocato (401)');
        const riprova = await rest('signInWithPassword', { email: GESTORE, password: pwAttacco, returnSecureToken: true });
        vero(!riprova.dati.idToken, 'e la sua password non vale piu\': ha perso l\'accesso');
        const uGestore = await auth.getUserByEmail(GESTORE);
        vero(uGestore.emailVerified === true && uGestore.customClaims && uGestore.customClaims.gestore === true, 'l\'account del gestore ha l\'email verificata e il claim gestore');
        vero((await db.collection('gestoriAccount').doc(uGestore.uid).get()).exists, 'l\'account e\' registrato in gestoriAccount (per la pulizia del cron)');

        const pwGestore = password(); segrete.push(pwGestore);
        const mailGestore = leggiPosta().filter(m => String(m.a || '').toLowerCase().indexOf(GESTORE) >= 0);
        if (invioPresente) {
            vero(mailGestore.length === 1 && /per=gestione/.test(String(mailGestore[0].testo || '') + String(mailGestore[0].html || '')),
                'posta finta: UNA email al gestore con il collegamento ...&per=gestione', 'email trovate: ' + mailGestore.length);
            const oob = mailGestore.length ? oobDa(mailGestore[0]) : '';
            const reset = await rest('resetPassword', { oobCode: oob, newPassword: pwGestore });
            vero(reset.stato === 200, 'il collegamento dell\'email imposta la password del gestore');
        } else {
            console.log('       (lib/diretta-invio.js non c\'e\' ancora: password del gestore impostata con firebase-admin)');
            await auth.updateUser(uGestore.uid, { password: pwGestore });
        }
        const accG = await rest('signInWithPassword', { email: GESTORE, password: pwGestore, returnSecureToken: true });
        const tokG = accG.dati.idToken;
        const chi = await gestione({ azione: 'chi-sono' }, tokG);
        vero(chi.stato === 200 && chi.dati.email === GESTORE, 'il gestore attivato con gestore-accesso entra (chi-sono: ' + chi.dati.email + ')');

        /* ================= PREPARAZIONE ================= */
        console.log('\nPreparazione: evento e partecipanti con l\'API di gestione');
        const ev = await gestione({
            azione: 'evento-salva', evento: {
                nuovo: true, id: EVENTO, titolo: 'Next Generation Business 2026 · Napoli', luogo: 'Napoli · Hotel Eurostars Excelsior',
                data: '2026-10-02', oraInizio: '09:00', oraFine: '17:30', videoUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
                programma: '09.00 Accoglienza e registrazione\n09.30 Apertura dei lavori', paginaEvento: '/napoli_ottobre_2026/',
                unSoloDispositivo: false, promemoria: { giornoPrima: false, oraPrima: false }
            }
        }, tokG);
        vero(ev.stato === 200 && ev.dati.evento.videoId === 'abcdefghijk', 'evento creato (la gestione vede il video impostato)');
        const docEv = (await db.collection('eventi').doc(EVENTO).get()).data();
        vero(docEv.videoId === '' && docEv.videoUrl === undefined, 'documento pubblico dell\'evento: nessun video finche\' non si va in onda (DECISIONI D6)');
        const persone = [
            ['Mario', 'Rossi', 'mario.rossi@esempio.it'], ['Luigi', 'Verdi', 'luigi.verdi@esempio.it'], ['Anna', 'Bianchi', 'anna.bianchi@esempio.it'],
            ['Carla', 'Neri', 'carla.neri@esempio.it'], ['Dario', 'Blu', 'dario.blu@esempio.it'], ['Elena', 'Gialli', 'elena.gialli@esempio.it']
        ];
        const crea = await gestione({ azione: 'crea', idEvento: EVENTO, righe: persone.map((p, i) => ({ riga: i + 2, nome: p[0], cognome: p[1], email: p[2], azienda: 'Prova srl' })) }, tokG);
        vero(crea.stato === 200 && crea.dati.risultati.every(r => r.esito === 'creato'), 'creati 6 partecipanti');
        const P = {};
        for (const r of crea.dati.risultati) {
            const pw = password(); segrete.push(pw);
            await auth.updateUser(r.uid, { password: pw });
            P[r.nomeUtente] = { uid: r.uid, password: pw };
        }

        /* ================= ENTRA ================= */
        console.log('\nAccesso');
        const v0 = verifiche;
        const tMario = Date.now();
        const mario = await entra('  MARIO   Rossi ', P.mariorossi.password, { ip: '10.0.0.9' });
        vero(mario.stato === 200 && mario.dati.nomeUtente === 'mariorossi' && mario.dati.idEvento === EVENTO && !!mario.dati.token,
            '"  MARIO   Rossi " entra come mariorossi', mario.stato + ' ' + mario.testo.slice(0, 200));
        vero(!/password/i.test(Object.keys(mario.dati).join(',')) && mario.dati.nome === 'Mario' && /^[0-9a-f]{24}$/.test(mario.dati.sessione),
            'risposta: token, sessione, evento, nome (niente password)');
        uguale(verifiche - v0, 1, 'una verifica della password (Identity Toolkit)');
        const reteMario = await contatoreRete('10.0.0.9', tMario, Date.now());
        vero(reteMario.inCorso === 0 && reteMario.falliti === 0,
            'accesso riuscito: il tentativo della rete e\' gia\' restituito (inCorso ' + reteMario.inCorso + ', falliti ' + reteMario.falliti + ')');
        const sess = await rest('signInWithCustomToken', { token: mario.dati.token, returnSecureToken: true });
        const idTokMario = sess.dati.idToken;
        vero(!!idTokMario && JSON.stringify(contenuto(idTokMario).eventi) === '["napoli-2026"]', 'il token funziona (signInWithCustomToken) e porta il claim eventi ["napoli-2026"]');
        const letturaEv = await fetch(FS_DOC + '/eventi/' + EVENTO, { headers: { authorization: 'Bearer ' + idTokMario } });
        const letturaAltro = await fetch(FS_DOC + '/partecipanti/' + P.luigiverdi.uid, { headers: { authorization: 'Bearer ' + idTokMario } });
        vero(letturaEv.status === 200 && letturaAltro.status === 403, 'con quel token legge il suo evento (200) e NON il profilo di un altro (403)');
        const accessi = await db.collection('accessi').where('uid', '==', P.mariorossi.uid).get();
        vero(accessi.size === 1 && accessi.docs[0].data().dispositivo === 'iPhone · Safari', 'accesso registrato in accessi (dispositivo: ' + (accessi.size ? accessi.docs[0].data().dispositivo : '-') + ')');
        const pMario = (await db.collection('partecipanti').doc(P.mariorossi.uid).get()).data();
        vero(pMario.ultimoAccesso && pMario.ultimoAccesso.toMillis() > Date.now() - 60000, 'ultimoAccesso aggiornato');

        console.log('\nPassword sbagliata 5 volte di fila: attesa crescente');
        const ipA = '10.0.0.1';
        const v1 = verifiche;
        const errate = [];
        for (let i = 0; i < 5; i++) errate.push(await entra('luigiverdi', 'Sbagliata' + i, { ip: ipA }));
        uguale(errate.map(r => r.stato), [401, 401, 401, 401, 429], 'stati: 401 401 401 401 poi 429');
        uguale(errate.slice(0, 4).map(r => r.dati.rimasti), [4, 3, 2, 1], 'tentativi rimasti: 4, 3, 2, 1');
        const att1 = errate[4].dati.attesaSecondi;
        vero(errate[4].dati.codice === 'attendi' && att1 >= 29 && att1 <= 30, 'al quinto errore: attendi ' + att1 + ' secondi');
        vero(/Password dimenticata/.test(errate[4].dati.msg), 'il messaggio di attesa propone "Password dimenticata?"');
        uguale(verifiche - v1, 5, 'cinque verifiche arrivate a Google');
        const v2 = verifiche;
        const bloccato = await entra('luigiverdi', P.luigiverdi.password, { ip: ipA });
        vero(bloccato.stato === 429 && verifiche === v2, 'durante l\'attesa anche la password giusta aspetta, e nessuna verifica arriva a Google');
        await coppia('luigiverdi', ipA).update({ bloccatoFino: Date.now() - 1 }); // l'attesa e' finita (senza aspettare 30 s)
        const sesto = await entra('luigiverdi', 'Sbagliata6', { ip: ipA });
        vero(sesto.stato === 429 && sesto.dati.attesaSecondi >= 59 && sesto.dati.attesaSecondi <= 60, 'sesto errore: l\'attesa raddoppia (' + sesto.dati.attesaSecondi + ' s)');
        await coppia('luigiverdi', ipA).update({ bloccatoFino: Date.now() - 1 });
        const settimo = await entra('luigiverdi', 'Sbagliata7', { ip: ipA });
        vero(settimo.stato === 429 && settimo.dati.attesaSecondi >= 119 && settimo.dati.attesaSecondi <= 120, 'settimo errore: raddoppia ancora (' + settimo.dati.attesaSecondi + ' s)');
        await coppia('luigiverdi', ipA).update({ bloccatoFino: Date.now() - 1 });
        const giusta = await entra('Luigi Verdi', P.luigiverdi.password, { ip: ipA });
        vero(giusta.stato === 200 && !(await coppia('luigiverdi', ipA).get()).exists, 'finita l\'attesa, la password giusta entra e il conto degli errori si azzera');

        console.log('\nNome inesistente');
        const v3 = verifiche;
        const inesistente = await entra('Nessuno Inventato', 'Qualunque123', { ip: '10.0.0.5' });
        const sbagliata = await entra('elenagialli', 'Sbagliata0', { ip: '10.0.0.6' });
        vero(inesistente.stato === 401 && inesistente.dati.codice === sbagliata.dati.codice && inesistente.dati.msg === sbagliata.dati.msg
            && inesistente.dati.rimasti === sbagliata.dati.rimasti && Object.keys(inesistente.dati).join() === Object.keys(sbagliata.dati).join(),
        'stessa risposta di una password sbagliata: ' + inesistente.testo);
        uguale(verifiche - v3, 1, 'per il nome inesistente nessuna verifica a Google (solo quella della password sbagliata)');
        vero(inesistente.ms >= 150, 'e comunque con un tempo simile a una verifica (' + inesistente.ms + ' ms)');

        console.log('\nAccount disattivato');
        const dis = await gestione({ azione: 'partecipante', uid: P.annabianchi.uid, idEvento: EVENTO, operazione: 'disattiva' }, tokG);
        vero(dis.stato === 200 && dis.dati.partecipante.stato === 'disattivato', 'la gestione disattiva annabianchi');
        const annaChiusa = await entra('annabianchi', P.annabianchi.password, { ip: '10.0.0.8' });
        vero(annaChiusa.stato === 401 && annaChiusa.dati.msg === sbagliata.dati.msg,
            'account chiuso anche su Auth: risposta identica a una password sbagliata (DECISIONI T1)', annaChiusa.stato + ' ' + annaChiusa.testo);
        await gestione({ azione: 'partecipante', uid: P.annabianchi.uid, idEvento: EVENTO, operazione: 'riattiva' }, tokG);
        const annaAperta = await entra('annabianchi', P.annabianchi.password, { ip: '10.0.0.8' });
        uguale(annaAperta.stato, 200, 'riattivata: entra');
        await db.collection('sessioni').doc(P.annabianchi.uid).update({ stato: 'disattivato' });
        const anna403 = await entra('annabianchi', P.annabianchi.password, { ip: '10.0.0.8' });
        vero(anna403.stato === 403 && anna403.dati.codice === 'disattivato' && /disattivato/.test(anna403.dati.msg),
            'password giusta e account disattivato nei dati della diretta: 403 "' + anna403.dati.msg + '"');
        await db.collection('sessioni').doc(P.annabianchi.uid).update({ stato: 'attivo' });

        console.log('\n20 accessi CONTEMPORANEI sbagliati per lo stesso nome dalla stessa rete');
        const v4 = verifiche;
        const venti = await Promise.all(Array.from({ length: 20 }, (_, i) => entra('carlaneri', 'Sbagliata' + i, { ip: '10.0.0.2' })));
        const arrivate = verifiche - v4;
        const stati429 = venti.filter(r => r.stato === 429).length;
        vero(arrivate <= 5, 'arrivate alla verifica: ' + arrivate + ' (al massimo 5)');
        vero(stati429 >= 15 && venti.every(r => r.stato === 401 || r.stato === 429), 'risposte 429: ' + stati429 + ', le altre 401');

        console.log('\nLa stessa persona da un\'altra rete');
        for (let i = 0; i < 5; i++) await entra('darioblu', 'Sbagliata' + i, { ip: '10.0.0.3' });
        const daQui = await entra('darioblu', P.darioblu.password, { ip: '10.0.0.3' });
        const daLi = await entra('darioblu', P.darioblu.password, { ip: '10.0.0.4' });
        vero(daQui.stato === 429 && daLi.stato === 200, '5 errori dalla rete 10.0.0.3 la bloccano (429) ma lo stesso nome entra da 10.0.0.4 (200)');

        console.log('\nPermessi (claims) non allineati');
        await auth.setCustomUserClaims(P.mariorossi.uid, { eventi: [] });
        const perm = await chiama('diretta-accesso', { azione: 'aggiorna-permessi' }, { token: idTokMario });
        vero(perm.stato === 200 && perm.dati.aggiornati === true, 'aggiorna-permessi ripara i claims (aggiornati: true)');
        uguale(((await auth.getUser(P.mariorossi.uid)).customClaims || {}).eventi, ['napoli-2026'], 'claims di nuovo ["napoli-2026"]');
        const perm2 = await chiama('diretta-accesso', { azione: 'aggiorna-permessi' }, { token: idTokMario });
        vero(perm2.stato === 200 && perm2.dati.aggiornati === false, 'una seconda chiamata non riscrive niente (aggiornati: false)');
        const permSenza = await chiama('diretta-accesso', { azione: 'aggiorna-permessi' }, {});
        const permGestore = await chiama('diretta-accesso', { azione: 'aggiorna-permessi' }, { token: tokG });
        vero(permSenza.stato === 401 && permGestore.stato === 403, 'senza token 401, con il token del gestore (non partecipante) 403');

        console.log('\nStato pubblico (diretta-stato) e video solo in onda');
        const stato1 = await fetch(API + '/diretta-stato?evento=' + EVENTO + '&altro=1');
        const testoStato = await stato1.text();
        const corpoStato = JSON.parse(testoStato);
        vero(stato1.status === 200 && corpoStato.stato === 'programmato' && corpoStato.titolo && corpoStato.inizio && corpoStato.fine, 'GET pubblico: stato "programmato", titolo e orari');
        uguale(Object.keys(corpoStato).sort(), ['fine', 'id', 'inizio', 'ok', 'paginaEvento', 'ripresa', 'stato', 'titolo'], 'solo i campi pubblici');
        vero(!/video|abcdefghijk/i.test(testoStato), 'nessuna traccia del video nella risposta');
        uguale(stato1.headers.get('cache-control'), 'public, max-age=20, s-maxage=30, stale-while-revalidate=60', 'Cache-Control');
        uguale(stato1.headers.get('access-control-allow-origin'), '*', 'Access-Control-Allow-Origin: *');
        const cattivo = await fetch(API + '/diretta-stato?evento=NAPOLI!!');
        vero(cattivo.status === 400 && cattivo.headers.get('cache-control') === 'no-store', 'evento non valido: 400 senza cache');
        const assente = await fetch(API + '/diretta-stato?evento=inesistente-2099');
        vero(assente.status === 404 && (await assente.json()).ok === false, 'evento inesistente: { ok: false }');
        const inOnda = await gestione({ azione: 'evento-stato', idEvento: EVENTO, stato: 'in_onda' }, tokG);
        vero(inOnda.stato === 200 && (await db.collection('eventi').doc(EVENTO).get()).data().videoId === 'abcdefghijk', 'in onda: il video compare nel documento dell\'evento');
        const tInOnda = Date.now();

        console.log('\nUn solo dispositivo');
        const salva = await gestione({ azione: 'evento-salva', evento: { id: EVENTO, unSoloDispositivo: true } }, tokG);
        vero(salva.stato === 200 && salva.dati.evento.unSoloDispositivo === true && salva.dati.evento.titolo.indexOf('Napoli') >= 0, 'evento a un solo dispositivo (gli altri campi restano)');
        const primo = await entra('elenagialli', P.elenagialli.password, { ip: '10.0.1.1', ua: UA_ANDROID });
        const tok1 = (await rest('signInWithCustomToken', { token: primo.dati.token, returnSecureToken: true })).dati.idToken;
        const s1 = (await db.collection('sessioni').doc(P.elenagialli.uid).get()).data().sessioneAttiva;
        vero(primo.stato === 200 && s1 === primo.dati.sessione, 'primo dispositivo: la sua sessione e\' quella ammessa');
        const secondo = await entra('elenagialli', P.elenagialli.password, { ip: '10.0.1.2' });
        const tok2 = (await rest('signInWithCustomToken', { token: secondo.dati.token, returnSecureToken: true })).dati.idToken;
        const s2 = (await db.collection('sessioni').doc(P.elenagialli.uid).get()).data().sessioneAttiva;
        vero(secondo.stato === 200 && s2 === secondo.dati.sessione && s2 !== s1, 'secondo dispositivo: sessioneAttiva cambia');
        const pres1 = await creaPresenza(tok1, P.elenagialli.uid, primo.dati.sessione);
        const pres2 = await creaPresenza(tok2, P.elenagialli.uid, secondo.dati.sessione);
        vero(pres1 === 403 && pres2 === 200, 'le regole rifiutano la presenza del primo dispositivo (' + pres1 + ') e accettano quella del secondo (' + pres2 + ')');
        await gestione({ azione: 'evento-salva', evento: { id: EVENTO, unSoloDispositivo: false } }, tokG);
        const libero = await entra('elenagialli', P.elenagialli.password, { ip: '10.0.1.2' });
        vero(libero.stato === 200 && (await db.collection('sessioni').doc(P.elenagialli.uid).get()).data().sessioneAttiva === null, 'tolta l\'opzione, nessuna sessione ammessa in particolare');

        console.log('\nPassword dimenticata');
        const postaPrima = leggiPosta().length;
        const richieste = [' Mario Rossi ', 'LUIGI.VERDI@esempio.it ', 'Nome Inesistente', 'nessuno@esempio.it'];
        const risp = await Promise.all(richieste.map(id => chiama('diretta-accesso', { azione: 'password-dimenticata', identificativo: id }, { ip: '10.0.2.1' })));
        vero(risp.every(r => r.stato === 200 && r.testo === risp[0].testo), 'nome utente, email, nome inesistente, email inesistente: sempre la stessa risposta');
        vero(/Se l'account esiste/.test(risp[0].dati.msg || ''), 'risposta: "' + risp[0].dati.msg + '"');
        vero(risp.every(r => r.ms >= 2500 && r.ms < 3600), 'tempi uguali: ' + risp.map(r => r.ms + ' ms').join(', '));
        if (invioPresente) {
            await pausa(300);
            const nuove = leggiPosta().slice(postaPrima);
            const aMario = nuove.filter(m => /mario\.rossi@esempio\.it/i.test(String(m.a)));
            const aLuigi = nuove.filter(m => /luigi\.verdi@esempio\.it/i.test(String(m.a)));
            vero(aMario.length === 1 && aLuigi.length === 1 && nuove.length === 2, 'due email, agli indirizzi VERI di Mario e di Luigi, e a nessun altro (' + nuove.length + ')');
            const corpo = m => String(m.testo || '') + String(m.html || '');
            vero(aMario.length === 1 && /\/diretta\/reimposta\.html\?oobCode=/.test(corpo(aMario[0])) && /u=mariorossi/.test(corpo(aMario[0])),
                'l\'email contiene il collegamento /diretta/reimposta.html?oobCode=...&u=mariorossi');
            vero(nuove.every(m => !/@utenti\.diretta\./.test(String(m.a))), 'nessuna email verso gli indirizzi tecnici');
            const pwNuova = password(); segrete.push(pwNuova);
            const reset = aMario.length ? await rest('resetPassword', { oobCode: oobDa(aMario[0]), newPassword: pwNuova }) : { stato: 0 };
            const conNuova = await entra('mariorossi', pwNuova, { ip: '10.0.2.2' });
            vero(reset.stato === 200 && conNuova.stato === 200, 'il collegamento funziona: nuova password impostata e accesso riuscito');
        } else {
            console.log('       (lib/diretta-invio.js non c\'e\' ancora: controllo della posta saltato)');
        }

        console.log('\nGestione: le altre azioni');
        const elenco = await gestione({ azione: 'eventi' }, tokG);
        vero(elenco.stato === 200 && elenco.dati.eventi.length === 1 && elenco.dati.eventi[0].iscritti === 6 && elenco.dati.eventi[0].videoUrl,
            'eventi: uno, con 6 iscritti e il link del video (solo per la gestione)');
        const part = await gestione({ azione: 'partecipanti', idEvento: EVENTO }, tokG);
        vero(part.stato === 200 && part.dati.partecipanti.length === 6 && part.dati.partecipanti.every(p => p.authCreato && p.invio && p.invio.stato && p.nomeUtente),
            'partecipanti: 6, con nome utente, account e stato delle credenziali');
        const rig = await gestione({ azione: 'partecipante', uid: P.carlaneri.uid, idEvento: EVENTO, operazione: 'rigenera' }, tokG);
        vero(rig.stato === 200 && /^[A-HJ-NP-Za-hj-km-np-z2-9]{10}$/.test(rig.dati.password || ''), 'rigenera: una password nuova di 10 caratteri senza caratteri che si confondono');
        if (rig.dati.password) segrete.push(rig.dati.password);
        uguale((await entra('carlaneri', rig.dati.password, { ip: '10.0.3.1' })).stato, 200, 'la password rigenerata funziona');
        uguale((await entra('carlaneri', P.carlaneri.password, { ip: '10.0.3.1' })).stato, 401, 'quella di prima non piu\'');

        const pausaEv = await gestione({ azione: 'evento-stato', idEvento: EVENTO, stato: 'pausa', ripresa: '14.30' }, tokG);
        const inPausa = (await db.collection('eventi').doc(EVENTO).get()).data();
        vero(pausaEv.stato === 200 && inPausa.stato === 'pausa' && inPausa.ripresa === '14:30' && inPausa.videoId === '', 'pausa con ripresa alle 14:30: il video esce dal documento pubblico');
        const avviso = await gestione({ azione: 'evento-avviso', idEvento: EVENTO, avviso: '  Problema tecnico: torniamo tra 5 minuti ' }, tokG);
        vero(avviso.stato === 200 && (await db.collection('eventi').doc(EVENTO).get()).data().avviso === 'Problema tecnico: torniamo tra 5 minuti', 'avviso a tutti scritto nel documento dell\'evento');
        await gestione({ azione: 'evento-stato', idEvento: EVENTO, stato: 'in_onda' }, tokG);
        const ripreso = (await db.collection('eventi').doc(EVENTO).get()).data();
        vero(ripreso.stato === 'in_onda' && ripreso.videoId === 'abcdefghijk' && ripreso.ripresa === '', 'di nuovo in onda: il video torna');
        const nuovoVideo = await gestione({ azione: 'evento-video', idEvento: EVENTO, videoUrl: 'https://youtu.be/zyxwvutsrqp?si=condiviso' }, tokG);
        vero(nuovoVideo.stato === 200 && (await db.collection('eventi').doc(EVENTO).get()).data().videoId === 'zyxwvutsrqp', 'cambio del video in onda: chi guarda riceve il nuovo id');
        const altroPlayer = await gestione({ azione: 'evento-video', idEvento: EVENTO, videoUrl: 'https://vimeo.com/123456789', videoId: '123456789' }, tokG);
        vero(altroPlayer.stato === 200 && altroPlayer.dati.evento.videoId === '123456789', 'un id mandato dalla gestione (altro player) e\' accettato');
        const linkCattivo = await gestione({ azione: 'evento-video', idEvento: EVENTO, videoUrl: 'https://example.com/video' }, tokG);
        uguale(linkCattivo.stato, 400, 'un link che non e\' di YouTube, senza id: 400');
        await gestione({ azione: 'evento-video', idEvento: EVENTO, videoUrl: 'https://www.youtube.com/live/abcdefghijk' }, tokG);

        const conn = await gestione({ azione: 'connessi', idEvento: EVENTO }, tokG);
        vero(conn.stato === 200 && conn.dati.connessi === 1 && conn.dati.quando > 0, 'connessi: 1 (la presenza scritta poco fa)');
        const esp = await gestione({ azione: 'esporta', idEvento: EVENTO }, tokG);
        const accTot = (await db.collection('accessi').where('idEvento', '==', EVENTO).get()).size;
        const elena = esp.dati.partecipanti && esp.dati.partecipanti.find(p => p.nomeUtente === 'elenagialli');
        vero(esp.stato === 200 && esp.dati.partecipanti.length === 6 && esp.dati.accessi.length === accTot && elena && elena.presenza && elena.presenza.collegamenti === 1,
            'esporta: 6 partecipanti con la presenza, ' + accTot + ' accessi');
        vero(esp.dati.accessi.every((a, i, v) => !i || v[i - 1].quando <= a.quando) && /limitati alla durata/.test(esp.dati.nota), 'accessi in ordine di tempo, con la nota sui minuti');

        const togli = await gestione({ azione: 'partecipante', uid: P.darioblu.uid, idEvento: EVENTO, operazione: 'rimuovi-evento' }, tokG);
        vero(togli.stato === 200 && JSON.stringify(((await auth.getUser(P.darioblu.uid)).customClaims || {}).eventi) === '[]', 'togli dall\'evento: claims senza eventi');
        const senzaEventi = await entra('darioblu', P.darioblu.password, { ip: '10.0.3.2' });
        vero(senzaEventi.stato === 403 && senzaEventi.dati.codice === 'nessun-evento', 'e senza eventi non entra (403 nessun-evento)');

        if (invioPresente) {
            const postaPrimaReinvio = leggiPosta().length;
            const re = await gestione({ azione: 'partecipante', uid: P.luigiverdi.uid, idEvento: EVENTO, operazione: 'reinvia' }, tokG);
            const cred = leggiPosta().slice(postaPrimaReinvio).filter(m => /luigi\.verdi@esempio\.it/i.test(String(m.a)));
            vero(re.stato === 200 && re.dati.invio && re.dati.invio.stato === 'inviata' && cred.length === 1 && /luigiverdi/.test(String(cred[0].testo)),
                'reinvia credenziali: email all\'indirizzo vero con il nome utente (' + (re.dati.invio && re.dati.invio.stato) + ')', re.testo.slice(0, 200));
            uguale((await entra('luigiverdi', P.luigiverdi.password, { ip: '10.0.3.3' })).stato, 401, 'dopo il reinvio la vecchia password non vale piu\'');
        }

        /* ================= RAFFICHE DA UNA RETE ================= */
        console.log('\n100 accessi CONTEMPORANEI sbagliati da una rete, con 100 nomi diversi');
        const raffica = await creaPersoneVeloci(100, 'raffica', 'raffica-2026');
        await fuoriDalBordo(QUINDICI_MINUTI, 15000);
        const ipR = '10.0.5.1';
        const v5 = verifiche;
        const tR = Date.now();
        const cento = await Promise.all(raffica.map((p, i) => entra(p.nomeUtente, 'Sbagliata' + i, { ip: ipR })));
        const arrivateR = verifiche - v5;
        const conta = st => cento.filter(r => r.stato === st).length;
        console.log('       (risposte 401: ' + conta(401) + ', 429: ' + conta(429) + ', 503: ' + conta(503) + '; verifiche arrivate a Google: ' + arrivateR + '; ' + (Date.now() - tR) + ' ms)');
        vero(arrivateR <= 40 && conta(401) <= 40, 'arrivate alla verifica: ' + arrivateR + ' (al massimo 40); risposte "password sbagliata": ' + conta(401));
        vero(conta(401) + conta(429) + conta(503) === 100 && conta(429) > 0, 'le altre si fermano PRIMA della verifica (429 attendi: ' + conta(429) + ', 503 riprova: ' + conta(503) + ')');
        vero(conta(401) === arrivateR && arrivateR >= 20, 'ogni 401 e\' una verifica vera, e la rete ha avuto i suoi tentativi (' + arrivateR + ')');
        vero(cento.filter(r => r.stato === 429).every(r => r.dati.codice === 'attendi' && r.dati.attesaSecondi >= 290), '429 con l\'attesa della rete (almeno 5 minuti)');
        const reteR = await contatoreRete(ipR, tR, Date.now());
        vero(reteR.falliti === conta(401) && reteR.inCorso === 0, 'contatore della rete: falliti ' + reteR.falliti + ', in corso ' + reteR.inCorso + ' (nessun tentativo rimasto appeso)');
        const bloccoR = (await db.collection('tentativiIp').doc(C.improntaIp(ipR)).get()).data() || {};
        vero(bloccoR.bloccatoFino > Date.now() + 4 * 60000, 'la rete e\' bloccata per almeno 5 minuti (tentativiIp/<rete>.bloccatoFino)');
        const vR = verifiche;
        const giustaBloccata = await entra('elenagialli', P.elenagialli.password, { ip: ipR });
        vero(giustaBloccata.stato === 429 && verifiche === vR, 'dalla rete bloccata anche la password giusta aspetta, senza verifica');
        const altraRete = await entra('elenagialli', P.elenagialli.password, { ip: '10.0.5.2' });
        uguale(altraRete.stato, 200, 'da un\'altra rete la stessa persona entra');

        console.log('\n60 "password dimenticata" CONTEMPORANEE da una rete, per 60 persone diverse');
        await fuoriDalBordo(60 * 60 * 1000, 20000);
        const postaPrimaR = leggiPosta().length;
        const tDim = Date.now();
        const sessanta = await Promise.all(raffica.slice(0, 60).map(p => chiama('diretta-accesso', { azione: 'password-dimenticata', identificativo: p.nomeUtente }, { ip: '10.0.6.1' })));
        vero(sessanta.every(r => r.stato === 200 && r.testo === sessanta[0].testo), 'sempre la stessa risposta (' + sessanta.length + ' richieste, ' + (Date.now() - tDim) + ' ms)');
        const limiteRete = (await db.collection('limiti').doc('resetip_' + C.improntaIp('10.0.6.1') + '_' + Math.floor(tDim / 3600000)).get()).data() || {};
        vero(limiteRete.conteggio === 60, 'tutte le richieste contate, nessuna persa nella raffica (conteggio ' + limiteRete.conteggio + ')');
        if (invioPresente) {
            await pausa(300);
            const resetR = leggiPosta().slice(postaPrimaR).filter(m => /@raffica\.prova$/.test(String(m.a)));
            /* Al massimo 20: il conteggio e' "incremento e poi rilettura", senza transazione, e in una
               raffica la rilettura di una richiesta vede anche i +1 arrivati subito dopo; quindi ne
               possono passare meno di 20 (anche nessuna, se le 60 arrivano tutte insieme), mai di piu':
               sotto una raffica e' la scelta prudente. */
            vero(resetR.length <= 20, 'email di reimpostazione partite: ' + resetR.length + ' (al massimo 20 all\'ora dalla stessa rete)');
            vero(new Set(resetR.map(m => m.a)).size === resetR.length, 'a persone tutte diverse, una email ciascuna');
            const postaAltra = leggiPosta().length;
            await chiama('diretta-accesso', { azione: 'password-dimenticata', identificativo: raffica[70].nomeUtente }, { ip: '10.0.6.2' });
            await pausa(300);
            vero(leggiPosta().slice(postaAltra).filter(m => m.a === raffica[70].email).length === 1, 'da un\'altra rete la richiesta passa (il tetto e\' per rete)');
        }

        /* ================= L'INDIRIZZO CON LO SPAZIO INVISIBILE ================= */
        console.log('\nUn\'email con lo spazio invisibile U+200B (copiato da Excel)');
        const creaZ = await gestione({
            azione: 'crea', idEvento: EVENTO, righe: [
                { riga: 2, nome: 'Zeno', cognome: 'Invisibile', email: 'Zeno.Invisibile@esempio.it\u200b', azienda: 'Prova srl' },
                { riga: 3, nome: 'Ugo', cognome: 'Vecchio', email: 'ugo.vecchio@esempio.it', azienda: 'Prova srl' }
            ]
        }, tokG);
        const [rZ, rU] = creaZ.dati.risultati || [{}, {}];
        const pZ = rZ.uid ? (await db.collection('partecipanti').doc(rZ.uid).get()).data() : {};
        vero(creaZ.stato === 200 && rZ.esito === 'creato' && pZ.email === 'zeno.invisibile@esempio.it' && pZ.emailNorm === pZ.email,
            'caricato con U+200B: si salva l\'indirizzo normalizzato (' + JSON.stringify(pZ.email) + ')');
        // un profilo caricato PRIMA della regola unica: nel campo email c'e' ancora il carattere invisibile
        if (rU.uid) await db.collection('partecipanti').doc(rU.uid).update({ email: 'Ugo.Vecchio@esempio.it\u200b ' });
        if (invioPresente) {
            const postaZ = leggiPosta().length;
            const reZ = await gestione({ azione: 'partecipante', uid: rZ.uid, idEvento: EVENTO, operazione: 'reinvia' }, tokG);
            const reU = await gestione({ azione: 'partecipante', uid: rU.uid, idEvento: EVENTO, operazione: 'reinvia' }, tokG);
            vero(reZ.stato === 200 && reU.stato === 200 && reZ.dati.invio.stato === 'inviata' && reU.dati.invio.stato === 'inviata',
                'credenziali inviate a tutti e due (anche al profilo con U+200B nel campo email)', reZ.testo.slice(0, 160) + ' / ' + reU.testo.slice(0, 160));
            const credZ = leggiPosta().slice(postaZ).filter(m => m.tipo === 'credenziali');
            uguale(credZ.map(m => m.a).sort(), ['ugo.vecchio@esempio.it', 'zeno.invisibile@esempio.it'], 'le credenziali arrivano agli indirizzi giusti, senza il carattere invisibile');
            const postaU = leggiPosta().length;
            await chiama('diretta-accesso', { azione: 'password-dimenticata', identificativo: 'Ugo Vecchio' }, { ip: '10.0.7.1' });
            await pausa(300);
            const resetU = leggiPosta().slice(postaU);
            vero(resetU.length === 1 && resetU[0].a === 'ugo.vecchio@esempio.it', 'password dimenticata: il collegamento va all\'indirizzo normalizzato (' + JSON.stringify(resetU.map(m => m.a)) + ')');
        }

        console.log('\nStato pubblico dopo la messa in onda');
        await pausa(Math.max(0, 15500 - (Date.now() - tInOnda)));
        const stato2 = await fetch(API + '/diretta-stato?evento=' + EVENTO);
        const testo2 = await stato2.text();
        vero(JSON.parse(testo2).stato === 'in_onda' && !/video|abcdefghijk/i.test(testo2), 'passata la memoria di 15 s: "in_onda", e ancora nessun video');
        await gestione({ azione: 'evento-stato', idEvento: EVENTO, stato: 'terminato' }, tokG);
        vero((await db.collection('eventi').doc(EVENTO).get()).data().videoId === '', 'terminato: il video sparisce dal documento dell\'evento');

        console.log('\nLog del servizio');
        await pausa(200);
        const log = fs.readFileSync(LOG_SERVER, 'utf8');
        vero(segrete.every(s => log.indexOf(s) < 0), 'nessuna password nei log del servizio');
        vero(!/@esempio\.it|@raffica\.prova|gestore@prova\.it/i.test(log), 'nessun indirizzo email nei log del servizio');
    } catch (e) {
        console.error(e);
        rossi++;
    } finally {
        console.log('\n' + verdi + ' verdi, ' + rossi + ' rossi');
        await ferma(server, 'SIGTERM');
        if (contatore) contatore.close();
        await ferma(emulatori);
        process.exit(rossi ? 1 : 0);
    }
})();
