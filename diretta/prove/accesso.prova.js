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
   - Si entra con l'EMAIL: accesso con l'email scritta in maiuscolo e
     con spazi prima e dopo; la risposta porta l'email (niente nome
     utente); il vecchio campo nomeUtente non si accetta piu'. Il token
     restituito funziona (signInWithCustomToken) e porta il claim eventi;
     con quel token si legge il proprio evento e non il profilo altrui.
   - 5 password sbagliate di fila -> 429 con l'attesa (30 s), poi 60 s,
     poi 120 s; durante l'attesa nessuna verifica arriva a Google. Gli
     id dei contatori dei tentativi sono impronte (niente indirizzi).
   - Email non iscritta (e un testo che non e' un'email): stessa
     risposta di una password sbagliata («Email o password non
     corretti.») e lo stesso tempo (mai prima di 450 ms, mediane vicine),
     senza nessuna verifica a Google.
   - L'import dalla gestione ('crea') non manda nessuna email.
   - L'interruttore iscrizioniAutomatiche ('evento-iscrizioni' ed
     evento-salva): spento di base, acceso solo con la pagina
     dell'evento, una pagina su un evento solo (409), resta acceso
     quando cambiano il video o la firma, non finisce nel documento
     pubblico dell'evento.
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
   - Password dimenticata per un iscritto (email scritta in maiuscolo,
     con spazi, anche con il vecchio campo identificativo) e per chi non
     e' iscritto (o scrive un vecchio nome utente): sempre la stessa
     risposta («Se l'indirizzo è iscritto alla diretta...»), dopo lo
     stesso tempo; con la posta finta, l'email con
     /diretta/reimposta.html?oobCode= (senza l'email nel collegamento)
     arriva SOLO agli iscritti, all'indirizzo vero, e il collegamento
     funziona; a chi non e' iscritto non parte niente.
   - Gestione: senza token 401; token di un non gestore 403; chi si
     registra da solo con l'email del gestore riceve 403 e, dopo
     'gestore-accesso', perde l'accesso; il gestore attivato entra.
   - 'aggiorna-permessi' ripara i claims.
   - diretta-stato: pubblico, con Cache-Control, mai il video (ne' il
     tipo di player); il video nel documento dell'evento solo in onda.
   - Il player di Azoto (la modalita' predefinita): l'evento si crea
     con il codice che da' Azoto e si salva SOLO l'indirizzo; in onda
     il documento dell'evento ha tipoPlayer 'azoto' e l'indirizzo del
     player, senza riserva ne' firma; link-video e link-firmato
     rispondono 409 'non-flusso'; codice malevolo, un indirizzo non di
     Azoto, un flusso nel campo di Azoto e Azoto nel campo del flusso:
     400 con il motivo; 'evento-player' passa tutti al flusso diretto e
     indietro (A -> B -> A in onda, la riconferma aggiorna
     videoAggiornato, 400 senza l'indirizzo della modalita'), e
     'evento-video' cambia l'indirizzo di Azoto in diretta.
   - Il flusso diretto della web TV: link principale e di riserva (la riserva
     nel documento dell'evento solo in onda), 'evento-sorgente' (la
     regia passa tutti alla riserva e torna al principale; 400 senza
     riserva), i link firmati (videoFirmato; la chiave non esce mai,
     ne' nelle risposte ne' nei log), 'link-video' per chi e' iscritto
     (url con la firma giusta e validoSecondi; non iscritto, senza token,
     evento non in onda, dispositivo sostituito con "un solo
     dispositivo": rifiutato; al massimo 60 l'ora), 'link-firmato' per la
     gestione, 'prova-link' che rifiuta http e indirizzi privati, con il
     suo limite per gestore.
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
// il player di Azoto (la modalita' predefinita) e il codice che Azoto da' da incollare nel sito
const LINK_AZOTO = 'https://cdn.azotosolutions.com/cloudtv/livetv91/player';
const LINK_AZOTO_30 = 'https://cdn.azotosolutions.com/cloudtv/livetv92/player';
const CODICE_AZOTO = "<div class='azoto-player-container'>\n<iframe src='" + LINK_AZOTO + "' frameborder='0' scrolling='no' allowfullscreen></iframe>\n</div>\n<script src='https://azotosolutions.com/videojs/azoto-player.js'></script>";
// i link del flusso diretto della web TV (la modalita' 'flusso')
const LINK_WEBTV = 'https://webtv.esempio.it/live/napoli/playlist.m3u8';
const LINK_RISERVA = 'https://riserva.webtv.esempio.it/live/napoli/playlist.m3u8';
const LINK_NUOVO = 'https://webtv.esempio.it/live/napoli-bis/playlist.m3u8';
const SEGRETO_FIRMA = 'firma-' + crypto.randomBytes(9).toString('hex');
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:' + PORTA_FS;
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:' + PORTA_AUTH;
const SERVIZIO = path.resolve(__dirname, '../../email-service');
const admin = require(path.join(SERVIZIO, 'node_modules/firebase-admin'));
const C = require(path.join(SERVIZIO, 'lib/diretta-comune'));
const EM = require(path.join(SERVIZIO, 'lib/diretta-email'));
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
const entra = (email, password, opz) => chiama('diretta-accesso', { azione: 'entra', email, password }, opz);
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
// la coppia email + rete dei tentativi: impronta dell'email e impronta della rete (come le calcola il servizio)
const coppia = (email, ip) => db.collection('tentativi').doc(EM.chiaveEmail(email) + '_' + C.improntaIp(ip));
const mediana = v => v.slice().sort((a, b) => a - b)[Math.floor(v.length / 2)];
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
        const nome = prefisso + i;
        return { uid: 'p' + crypto.randomBytes(10).toString('hex'), nome: nome, email: nome + '@raffica.prova' };
    });
    const r = await auth.importUsers(persone.map(p => ({ uid: p.uid, email: C.emailTecnica(p.uid), displayName: 'Prova ' + p.nome, customClaims: { eventi: [idEvento] } })));
    if (r.failureCount) throw new Error('importUsers: ' + r.failureCount + ' falliti');
    const ora = admin.firestore.Timestamp.now();
    for (const gruppo of C.aGruppi(persone, 100)) {
        const b = db.batch();
        gruppo.forEach(p => {
            b.set(db.collection('partecipanti').doc(p.uid), {
                uid: p.uid, nome: 'Prova', cognome: p.nome, email: p.email, emailNorm: p.email, azienda: '',
                idEvento: idEvento, eventi: [idEvento], stato: 'attivo', authCreato: true, ultimoAccesso: null,
                invii: {}, promemoria: {}, creato: ora, aggiornato: ora
            });
            b.set(db.collection('indirizzi').doc(p.email), { uid: p.uid, creato: ora });
            b.set(db.collection('sessioni').doc(p.uid), { stato: 'attivo', sessioneAttiva: null, aggiornato: ora });
        });
        await b.commit();
    }
    return persone;
}

// un ID token fresco per una persona (come dopo l'accesso), senza passare dalla password
async function tokenDi(uid) {
    const r = await rest('signInWithCustomToken', { token: await auth.createCustomToken(uid), returnSecureToken: true });
    return r.dati.idToken;
}
// la firma nginx (secure_link) che la web TV si aspetta: base64url(md5(scadenza + percorso + ' ' + chiave))
function md5Nginx(scadenza, percorso, chiave) {
    return crypto.createHash('md5').update(scadenza + percorso + ' ' + chiave).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/* ---------- il video della web TV: riserva, regia, link firmati, prova del link (evento in onda) ---------- */
async function provaVideoWebTv(tokG, P, segrete) {
    console.log('\nIl video della web TV: riserva, regia, link firmati, prova del link');
    const leggiEv = async () => (await db.collection('eventi').doc(EVENTO).get()).data();
    const prima = await leggiEv();
    vero(prima.videoId === LINK_WEBTV && prima.videoRiserva === LINK_RISERVA && prima.sorgente === 'principale', 'in onda: principale e riserva pubblicati, sorgente principale');

    // la regia passa tutti alla riserva e torna al principale
    const aRiserva = await gestione({ azione: 'evento-sorgente', idEvento: EVENTO, sorgente: 'riserva' }, tokG);
    const dopoRiserva = await leggiEv();
    vero(aRiserva.stato === 200 && aRiserva.dati.evento.sorgente === 'riserva' && dopoRiserva.sorgente === 'riserva'
        && dopoRiserva.videoAggiornato.toMillis() > prima.videoAggiornato.toMillis(), 'evento-sorgente riserva: tutti passano alla riserva (sorgente e videoAggiornato cambiano)');
    const sorgenteStrana = await gestione({ azione: 'evento-sorgente', idEvento: EVENTO, sorgente: 'terza' }, tokG);
    uguale(sorgenteStrana.stato, 400, 'evento-sorgente con una sorgente sconosciuta: 400');
    const senzaRiserva = await gestione({ azione: 'evento-video', idEvento: EVENTO, videoUrl: LINK_WEBTV, riservaUrl: '' }, tokG);
    const tolta = await leggiEv();
    vero(senzaRiserva.stato === 200 && senzaRiserva.dati.evento.riservaUrl === '' && tolta.videoRiserva === '' && tolta.sorgente === 'principale',
        'tolta la riserva (riservaUrl \'\') mentre la regia la usava: si torna al principale');
    const rifiutoRiserva = await gestione({ azione: 'evento-sorgente', idEvento: EVENTO, sorgente: 'riserva' }, tokG);
    vero(rifiutoRiserva.stato === 400 && /riserva/.test(rifiutoRiserva.dati.msg || ''), 'evento-sorgente riserva senza un link di riserva: 400 («' + rifiutoRiserva.dati.msg + '»)');
    const rimessa = await gestione({ azione: 'evento-video', idEvento: EVENTO, videoUrl: LINK_WEBTV, riservaUrl: LINK_RISERVA }, tokG);
    vero(rimessa.stato === 200 && (await leggiEv()).videoRiserva === LINK_RISERVA, 'la riserva rimessa con evento-video: pubblicata subito (in onda)');
    const soloRiserva = await gestione({ azione: 'evento-video', idEvento: EVENTO, videoUrl: '', riservaUrl: LINK_RISERVA }, tokG);
    uguale(soloRiserva.stato, 400, 'una riserva senza il link principale: 400');
    const riservaCattiva = await gestione({ azione: 'evento-salva', evento: { id: EVENTO, riservaUrl: 'http://riserva.webtv.esempio.it/a.m3u8' } }, tokG);
    vero(riservaCattiva.stato === 400 && /https:\/\//.test(riservaCattiva.dati.msg || ''), 'evento-salva con una riserva in http: 400 con il motivo');
    const torna = await gestione({ azione: 'evento-sorgente', idEvento: EVENTO, sorgente: 'principale' }, tokG);
    vero(torna.stato === 200 && (await leggiEv()).sorgente === 'principale', 'evento-sorgente principale: si torna al link principale');

    // i link firmati (nginx secure_link)
    segrete.push(SEGRETO_FIRMA);
    const conFirma = await gestione({ azione: 'evento-salva', evento: { id: EVENTO, firma: { schema: 'nginx', segreto: SEGRETO_FIRMA, durataOre: 2 } } }, tokG);
    const f = conFirma.dati.evento && conFirma.dati.evento.firma;
    vero(conFirma.stato === 200 && conFirma.dati.evento.videoFirmato === true && f && f.schema === 'nginx' && f.durataOre === 2 && f.segretoImpostato === true && !('segreto' in f),
        'evento-salva con la firma: videoFirmato, segretoImpostato, niente chiave nella risposta', conFirma.testo.slice(0, 300));
    vero(conFirma.testo.indexOf(SEGRETO_FIRMA) < 0, 'la chiave segreta non compare nella risposta');
    const docFirmato = await leggiEv();
    vero(docFirmato.videoFirmato === true && docFirmato.videoId === LINK_WEBTV, 'in onda: videoFirmato nel documento dell\'evento (la pagina chiedera\' il link firmato)');
    vero(JSON.stringify(docFirmato).indexOf(SEGRETO_FIRMA) < 0, 'la chiave non e\' nel documento pubblico');
    vero(((await db.collection('eventiRiservati').doc(EVENTO).get()).data().firma || {}).segreto === SEGRETO_FIRMA, 'la chiave sta solo nel documento riservato');
    const tieni = await gestione({ azione: 'evento-salva', evento: { id: EVENTO, firma: { schema: 'nginx', segreto: '', durataOre: 6 } } }, tokG);
    vero(tieni.stato === 200 && tieni.dati.evento.firma.durataOre === 6 && ((await db.collection('eventiRiservati').doc(EVENTO).get()).data().firma || {}).segreto === SEGRETO_FIRMA,
        'segreto \'\': la chiave salvata resta (cambia solo la durata)');
    const senzaChiave = await gestione({ azione: 'evento-salva', evento: { id: EVENTO, firma: { schema: 'akamai' } } }, tokG);
    vero(senzaChiave.stato === 400 && /esadecimale/.test(senzaChiave.dati.msg || '') && senzaChiave.testo.indexOf(SEGRETO_FIRMA) < 0, 'akamai con una chiave non esadecimale: 400, e la chiave non compare');
    const elencoF = await gestione({ azione: 'eventi' }, tokG);
    vero(elencoF.stato === 200 && elencoF.testo.indexOf(SEGRETO_FIRMA) < 0 && elencoF.dati.eventi[0].firma.segretoImpostato === true, 'eventi: la firma senza la chiave');

    // link-video: chi e' iscritto riceve il link firmato
    const tokMario = await tokenDi(P.mariorossi.uid);
    const t0 = Date.now();
    const lv = await chiama('diretta-accesso', { azione: 'link-video', idEvento: EVENTO, sorgente: 'principale' }, { token: tokMario });
    const u = lv.dati.url ? new URL(lv.dati.url) : null;
    const scad = u ? u.searchParams.get('expires') : '';
    vero(lv.stato === 200 && u && lv.dati.url.indexOf(LINK_WEBTV + '?md5=') === 0 && /^\d{10}$/.test(scad), 'link-video (iscritto, in onda): 200 con l\'url firmato ' + (lv.dati.url || lv.testo));
    vero(u && u.searchParams.get('md5') === md5Nginx(scad, '/live/napoli/playlist.m3u8', SEGRETO_FIRMA), 'la firma e\' quella che la web TV verifica (md5 di scadenza + percorso + chiave)');
    vero(lv.dati.scade === Number(scad) * 1000 && lv.dati.scade >= t0 + 6 * 3600 * 1000 - 5000 && lv.dati.scade <= Date.now() + 6 * 3600 * 1000 + 1000, 'scade tra 6 ore (in millisecondi)');
    vero(lv.dati.validoSecondi === 6 * 3600, 'validoSecondi: 21600 (la pagina calcola la scadenza sul suo orologio) — ' + lv.dati.validoSecondi);
    vero(lv.testo.indexOf(SEGRETO_FIRMA) < 0 && lv.h.get('cache-control') === 'no-store', 'la risposta non contiene la chiave e non si tiene in cache');
    const lvR = await chiama('diretta-accesso', { azione: 'link-video', idEvento: EVENTO, sorgente: 'riserva' }, { token: tokMario });
    vero(lvR.stato === 200 && lvR.dati.url.indexOf(LINK_RISERVA + '?md5=') === 0, 'link-video della riserva: firmato anche quello');
    const lvSenza = await chiama('diretta-accesso', { azione: 'link-video', idEvento: EVENTO, sorgente: 'principale' }, {});
    const lvGestore = await chiama('diretta-accesso', { azione: 'link-video', idEvento: EVENTO, sorgente: 'principale' }, { token: tokG });
    const lvFalso = await chiama('diretta-accesso', { azione: 'link-video', idEvento: EVENTO, sorgente: 'principale' }, { token: 'non.un.token' });
    vero(lvSenza.stato === 401 && lvFalso.stato === 401 && lvGestore.stato === 403 && !lvSenza.dati.url && !lvGestore.dati.url,
        'link-video senza token o con un token falso: 401; con il token del gestore (non partecipante): 403');
    const lvAltro = await chiama('diretta-accesso', { azione: 'link-video', idEvento: 'milano-2099', sorgente: 'principale' }, { token: tokMario });
    vero(lvAltro.stato === 403 && lvAltro.dati.codice === 'non-iscritto', 'link-video di un evento a cui non e\' iscritto: 403 non-iscritto');
    await db.collection('sessioni').doc(P.mariorossi.uid).update({ stato: 'disattivato' });
    const lvDis = await chiama('diretta-accesso', { azione: 'link-video', idEvento: EVENTO, sorgente: 'principale' }, { token: tokMario });
    await db.collection('sessioni').doc(P.mariorossi.uid).update({ stato: 'attivo' });
    vero(lvDis.stato === 403 && lvDis.dati.codice === 'disattivato', 'link-video con l\'account disattivato: 403 (anche con un token ancora valido)');

    // link-firmato: l'anteprima della regia
    const lf = await gestione({ azione: 'link-firmato', idEvento: EVENTO, sorgente: 'riserva' }, tokG);
    vero(lf.stato === 200 && lf.dati.url.indexOf(LINK_RISERVA + '?md5=') === 0 && lf.dati.scade > Date.now(), 'link-firmato (gestione): il link della riserva firmato');
    const lfMario = await gestione({ azione: 'link-firmato', idEvento: EVENTO, sorgente: 'principale' }, tokMario);
    uguale(lfMario.stato, 403, 'link-firmato con il token di un partecipante: 403');

    // prova-link: http e indirizzi privati rifiutati senza scaricare niente
    const pHttp = await gestione({ azione: 'prova-link', link: 'http://webtv.esempio.it/live/napoli/playlist.m3u8', idEvento: EVENTO }, tokG);
    vero(pHttp.stato === 200 && pHttp.dati.esito === 'errore' && pHttp.dati.problemi.some(p => p.codice === 'https' && p.grave && /nextgenerationbusiness\.it/.test(p.testoWebTv)) && pHttp.dati.urlProva === '',
        'prova-link http: esito errore «https» con il testo per la web TV', pHttp.testo.slice(0, 300));
    // (la pagina dei metadati, https://169.254.169.254/latest/meta-data/, non si prova nemmeno: non e' il player di Azoto)
    for (const link of ['https://127.0.0.1/live/playlist.m3u8', 'https://10.0.0.1:8443/live/playlist.m3u8', 'https://169.254.169.254/latest/meta-data/live.m3u8', 'https://[::1]/live.m3u8']) {
        const pp = await gestione({ azione: 'prova-link', link: link }, tokG);
        vero(pp.stato === 200 && pp.dati.esito === 'errore' && pp.dati.problemi.length === 1 && pp.dati.problemi[0].codice === 'non-pubblico' && pp.dati.info.raggiungibile === false,
            'prova-link ' + link + ': rifiutato (non-pubblico)', pp.testo.slice(0, 300));
    }
    const pRtmp = await gestione({ azione: 'prova-link', link: 'rtmp://ingest.webtv.esempio.it/live/chiave' }, tokG);
    vero(pRtmp.stato === 200 && pRtmp.dati.esito === 'errore' && pRtmp.dati.problemi[0].codice === 'rtmp', 'prova-link RTMP: «rtmp»');
    // una pagina che non e' il player di Azoto, e il codice con un iframe di un altro sito davanti: errore grave, niente scaricato
    for (const link of ['https://player.webtv.esempio.it/embed/9', "<iframe src='https://ladro.esempio.it/p'></iframe>" + CODICE_AZOTO]) {
        const pa = await gestione({ azione: 'prova-link', link: link, idEvento: EVENTO }, tokG);
        vero(pa.stato === 200 && pa.dati.esito === 'errore' && pa.dati.problemi.length === 1 && pa.dati.problemi[0].codice === 'non-azoto' && pa.dati.problemi[0].grave
            && pa.dati.info.raggiungibile === false && pa.dati.urlProva === '', 'prova-link ' + link.slice(0, 50) + ': non e\' il player di Azoto (non-azoto, grave)', pa.testo.slice(0, 300));
    }
    const pMario = await gestione({ azione: 'prova-link', link: 'http://x.it/a.m3u8' }, tokMario);
    uguale(pMario.stato, 403, 'prova-link con il token di un partecipante: 403');
    let rifiutate = 0, fatte = 0;
    for (let i = 0; i < 32 && !rifiutate; i++) {
        const r = await gestione({ azione: 'prova-link', link: 'http://webtv.esempio.it/' + i + '.m3u8' }, tokG);
        if (r.stato === 429 && r.dati.codice === 'attendi') rifiutate++; else if (r.stato === 200) fatte++;
    }
    // prima del giro: 8 prove (http, 4 indirizzi privati, RTMP, 2 non di Azoto); quella del partecipante si ferma prima
    vero(rifiutate === 1 && fatte + 8 === 30, 'prova-link: al massimo 30 al minuto per gestore, poi 429 (dopo ' + (fatte + 8) + ' prove)');

    // il tetto di link-video: 60 l'ora per persona
    // prima del giro Mario ne ha gia' usate 4 (principale, riserva, evento non suo, account disattivato)
    let lvOk = 0, lv429 = 0;
    for (let i = 0; i < 62 && !lv429; i++) {
        const r = await chiama('diretta-accesso', { azione: 'link-video', idEvento: EVENTO, sorgente: 'principale' }, { token: tokMario });
        if (r.stato === 429) lv429++; else if (r.stato === 200) lvOk++;
    }
    vero(lv429 === 1 && lvOk + 4 === 60, 'link-video: al massimo 60 l\'ora per persona, poi 429 (' + (lvOk + 4) + ' richieste prima)');

    // senza firma: il link com'e'
    const via = await gestione({ azione: 'evento-salva', evento: { id: EVENTO, firma: { schema: 'nessuna' } } }, tokG);
    const docVia = await leggiEv();
    vero(via.stato === 200 && via.dati.evento.videoFirmato === false && via.dati.evento.firma.segretoImpostato === false && docVia.videoFirmato === false
        && ((await db.collection('eventiRiservati').doc(EVENTO).get()).data().firma || {}).segreto === '', 'firma \'nessuna\': videoFirmato false e la chiave cancellata');
    const lfNessuna = await gestione({ azione: 'link-firmato', idEvento: EVENTO, sorgente: 'principale' }, tokG);
    vero(lfNessuna.stato === 200 && lfNessuna.dati.url === LINK_WEBTV && lfNessuna.dati.scade === null, 'senza firma link-firmato restituisce il link com\'e\' (scade null)');

    // la regia passa tutti al player di Azoto e torna al flusso (A <- B -> A), in onda
    console.log('\nevento-player: dal flusso diretto al player di Azoto e ritorno, in onda');
    const tokAnna = await tokenDi(P.annabianchi.uid);
    const pb = await leggiEv();
    const aAzoto = await gestione({ azione: 'evento-player', idEvento: EVENTO, tipoPlayer: 'azoto' }, tokG);
    const dopoA = await leggiEv();
    vero(aAzoto.stato === 200 && aAzoto.dati.evento.tipoPlayer === 'azoto' && dopoA.tipoPlayer === 'azoto' && dopoA.videoId === LINK_AZOTO_30
        && dopoA.videoRiserva === '' && dopoA.videoFirmato === false && dopoA.videoAggiornato.toMillis() > pb.videoAggiornato.toMillis(),
    'evento-player azoto: tutti passano al player di Azoto (videoId = il suo indirizzo, niente riserva ne\' firma, videoAggiornato cambia)', aAzoto.testo.slice(0, 300));
    await pausa(5);
    const riconferma = await gestione({ azione: 'evento-player', idEvento: EVENTO, tipoPlayer: 'azoto' }, tokG);
    const dopoR = await leggiEv();
    vero(riconferma.stato === 200 && dopoR.tipoPlayer === 'azoto' && dopoR.videoAggiornato.toMillis() > dopoA.videoAggiornato.toMillis(),
        'evento-player azoto di nuovo (riconferma): videoAggiornato cambia comunque (riporta tutti sul player scelto)');
    const lvA = await chiama('diretta-accesso', { azione: 'link-video', idEvento: EVENTO, sorgente: 'principale' }, { token: tokAnna });
    const lfA = await gestione({ azione: 'link-firmato', idEvento: EVENTO, sorgente: 'principale' }, tokG);
    vero(lvA.stato === 409 && lvA.dati.codice === 'non-flusso' && !lvA.dati.url && lfA.stato === 409 && lfA.dati.codice === 'non-flusso' && !lfA.dati.url,
        'con il player di Azoto link-video e link-firmato rispondono 409 non-flusso (' + lvA.stato + ', ' + lfA.stato + ')');
    const strano = await gestione({ azione: 'evento-player', idEvento: EVENTO, tipoPlayer: 'iframe' }, tokG);
    uguale(strano.stato, 400, 'evento-player con una modalita\' sconosciuta: 400');
    const aFlusso = await gestione({ azione: 'evento-player', idEvento: EVENTO, tipoPlayer: 'flusso' }, tokG);
    const dopoB = await leggiEv();
    vero(aFlusso.stato === 200 && dopoB.tipoPlayer === 'flusso' && dopoB.videoId === LINK_WEBTV && dopoB.videoRiserva === LINK_RISERVA && dopoB.videoAggiornato.toMillis() > dopoR.videoAggiornato.toMillis(),
        'evento-player flusso: tutti tornano al flusso diretto (principale e riserva)');
    const lvB = await chiama('diretta-accesso', { azione: 'link-video', idEvento: EVENTO, sorgente: 'principale' }, { token: tokAnna });
    vero(lvB.stato === 200 && lvB.dati.url === LINK_WEBTV, 'con il flusso diretto link-video torna a dare il link');
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
                data: '2026-10-02', oraInizio: '09:00', oraFine: '17:30', azotoUrl: CODICE_AZOTO, videoUrl: LINK_WEBTV, riservaUrl: LINK_RISERVA,
                programma: '09.00 Accoglienza e registrazione\n09.30 Apertura dei lavori', paginaEvento: '/napoli_ottobre_2026/',
                unSoloDispositivo: false, promemoria: { giornoPrima: false, oraPrima: false }
            }
        }, tokG);
        vero(ev.stato === 200 && ev.dati.evento.videoId === LINK_WEBTV && ev.dati.evento.videoTipo === 'hls' && ev.dati.evento.riservaId === LINK_RISERVA,
            'evento creato (la gestione vede il link della web TV e quello di riserva)', ev.testo.slice(0, 300));
        vero(ev.dati.evento && ev.dati.evento.sorgente === 'principale' && ev.dati.evento.videoFirmato === false && ev.dati.evento.firma && ev.dati.evento.firma.schema === 'nessuna',
            'evento nuovo: sorgente principale, nessuna firma');
        vero(ev.dati.evento && ev.dati.evento.tipoPlayer === 'azoto' && ev.dati.evento.azotoUrl === LINK_AZOTO && ev.dati.evento.azotoInOnda === '',
            'evento nuovo con il codice di Azoto: player Azoto (il predefinito), e del codice resta solo l\'indirizzo del player');
        const docEv = (await db.collection('eventi').doc(EVENTO).get()).data();
        vero(docEv.videoId === '' && docEv.videoRiserva === '' && docEv.videoUrl === undefined && docEv.riservaUrl === undefined && docEv.azotoUrl === undefined
            && docEv.sorgente === 'principale' && docEv.videoFirmato === false && docEv.tipoPlayer === 'azoto',
        'documento pubblico dell\'evento: tipoPlayer \'azoto\' e nessun video (ne\' Azoto ne\' il flusso) finche\' non si va in onda (DECISIONI D6)');
        const risEv = (await db.collection('eventiRiservati').doc(EVENTO).get()).data();
        vero(risEv.videoUrl === LINK_WEBTV && risEv.riservaUrl === LINK_RISERVA && risEv.riservaId === LINK_RISERVA && risEv.azotoUrl === LINK_AZOTO && risEv.tipoPlayer === 'azoto',
            'gli indirizzi stanno nel documento riservato');
        vero(!/[<>]|script|iframe/.test(JSON.stringify(risEv) + JSON.stringify(docEv)), 'del codice incollato non resta niente in Firestore (niente tag, niente script)');
        const persone = [
            ['Mario', 'Rossi', 'mario.rossi@esempio.it'], ['Luigi', 'Verdi', 'luigi.verdi@esempio.it'], ['Anna', 'Bianchi', 'anna.bianchi@esempio.it'],
            ['Carla', 'Neri', 'carla.neri@esempio.it'], ['Dario', 'Blu', 'dario.blu@esempio.it'], ['Elena', 'Gialli', 'elena.gialli@esempio.it']
        ];
        const postaPrimaCrea = leggiPosta().length;
        const crea = await gestione({ azione: 'crea', idEvento: EVENTO, righe: persone.map((p, i) => ({ riga: i + 2, nome: p[0], cognome: p[1], email: p[2], azienda: 'Prova srl' })) }, tokG);
        vero(crea.stato === 200 && crea.dati.risultati.every(r => r.esito === 'creato' && !('nomeUtente' in r)), 'creati 6 partecipanti (import per email, nessun nome utente)');
        await pausa(300);
        vero(leggiPosta().length === postaPrimaCrea, 'l\'import NON manda email: la posta finta non cambia (le credenziali partono solo con «Invia le credenziali»)');
        vero((await db.collection('partecipanti').where('eventi', 'array-contains', EVENTO).get()).docs.every(d => d.data().invii[EVENTO].stato === 'da inviare'),
            'dopo l\'import le credenziali sono tutte "da inviare"');
        // P.mariorossi, P.luigiverdi...: la persona, con la sua email e la password impostata dalla prova
        const P = {};
        for (const [i, r] of crea.dati.risultati.entries()) {
            const pw = password(); segrete.push(pw);
            await auth.updateUser(r.uid, { password: pw });
            P[(persone[i][0] + persone[i][1]).toLowerCase()] = { uid: r.uid, password: pw, email: persone[i][2] };
        }

        const ant = await gestione({ azione: 'anteprima', idEvento: EVENTO, righe: [
            { nome: 'Mario', cognome: 'Rossi', email: ' MARIO.ROSSI@esempio.it' }, { nome: 'Nuovo', cognome: 'Arrivato', email: 'nuovo@esempio.it' },
            { nome: 'Altro', cognome: 'Nome', email: 'luigi.verdi@esempio.it' }] }, tokG);
        vero(ant.stato === 200 && JSON.stringify(ant.dati.righe.map(r => r.esito)) === '["gia-iscritto","nuovo","email-condivisa"]' && ant.dati.pronto === false,
            'anteprima via API: gia-iscritto, nuovo, email-condivisa (e non pronta)', ant.testo.slice(0, 300));

        /* ================= L'INTERRUTTORE DELLE ISCRIZIONI DAL MODULO ================= */
        console.log('\nL\'interruttore «Invia subito la password a chi si iscrive dal modulo del sito»');
        vero(ev.dati.evento.iscrizioniAutomatiche === false, 'spento di base');
        const accendi = await gestione({ azione: 'evento-iscrizioni', idEvento: EVENTO, iscrizioniAutomatiche: true }, tokG);
        vero(accendi.stato === 200 && accendi.dati.evento.iscrizioniAutomatiche === true && accendi.dati.evento.titolo === ev.dati.evento.titolo,
            'evento-iscrizioni: acceso (gli altri campi restano)', accendi.testo.slice(0, 200));
        vero(((await db.collection('eventiRiservati').doc(EVENTO).get()).data() || {}).iscrizioniAutomatiche === true
            && (await db.collection('eventi').doc(EVENTO).get()).data().iscrizioniAutomatiche === undefined, 'sta nel documento riservato, non in quello pubblico dell\'evento');
        const valoreStrano = await gestione({ azione: 'evento-iscrizioni', idEvento: EVENTO, iscrizioniAutomatiche: 'si' }, tokG);
        vero(valoreStrano.stato === 400 && valoreStrano.dati.codice === 'iscrizioniAutomatiche', 'un valore che non e\' vero/falso: 400');
        const altroEv = await gestione({ azione: 'evento-salva', evento: { nuovo: true, id: 'napoli-bis-2026', titolo: 'Napoli bis', data: '2026-10-02', oraInizio: '09:00', oraFine: '12:00', paginaEvento: '/napoli_ottobre_2026', iscrizioniAutomatiche: true } }, tokG);
        vero(altroEv.stato === 409 && altroEv.dati.codice === 'iscrizioni-doppie', 'un altro evento con la stessa pagina e l\'interruttore acceso: 409 iscrizioni-doppie', altroEv.testo.slice(0, 200));
        const senzaPagina = await gestione({ azione: 'evento-salva', evento: { nuovo: true, id: 'senza-pagina-2026', titolo: 'Senza pagina', data: '2026-10-03', oraInizio: '09:00', oraFine: '12:00', iscrizioniAutomatiche: true } }, tokG);
        vero(senzaPagina.stato === 400 && senzaPagina.dati.codice === 'pagina', 'acceso senza la pagina dell\'evento: 400 pagina');
        // il documento riservato si riscrive per intero quando cambiano il video o la firma: l'interruttore deve restare
        const cambioVideo = await gestione({ azione: 'evento-video', idEvento: EVENTO, azotoUrl: LINK_AZOTO_30 }, tokG);
        const flagDopoVideo = ((await db.collection('eventiRiservati').doc(EVENTO).get()).data() || {});
        segrete.push('segreto-di-passaggio-1');
        const cambioFirma = await gestione({ azione: 'evento-salva', evento: { id: EVENTO, firma: { schema: 'nginx', segreto: 'segreto-di-passaggio-1', durataOre: 2 } } }, tokG);
        const flagDopoFirma = ((await db.collection('eventiRiservati').doc(EVENTO).get()).data() || {});
        const rimesso = await gestione({ azione: 'evento-video', idEvento: EVENTO, azotoUrl: CODICE_AZOTO }, tokG);
        const senzaFirma = await gestione({ azione: 'evento-salva', evento: { id: EVENTO, firma: { schema: 'nessuna' } } }, tokG);
        vero(cambioVideo.stato === 200 && flagDopoVideo.azotoUrl === LINK_AZOTO_30 && flagDopoVideo.iscrizioniAutomatiche === true
            && cambioFirma.stato === 200 && flagDopoFirma.firma.schema === 'nginx' && flagDopoFirma.iscrizioniAutomatiche === true
            && rimesso.stato === 200 && rimesso.dati.evento.azotoUrl === LINK_AZOTO && senzaFirma.stato === 200 && senzaFirma.dati.evento.iscrizioniAutomatiche === true,
        'cambiando il player di Azoto e la firma l\'interruttore resta acceso (poi tutto torna com\'era)');
        const spegni = await gestione({ azione: 'evento-salva', evento: { id: EVENTO, iscrizioniAutomatiche: false } }, tokG);
        const elencoIscr = await gestione({ azione: 'eventi' }, tokG);
        vero(spegni.stato === 200 && spegni.dati.evento.iscrizioniAutomatiche === false && elencoIscr.dati.eventi.every(e => e.iscrizioniAutomatiche === false),
            'evento-salva lo spegne, e l\'elenco degli eventi lo dice');

        /* ================= ENTRA ================= */
        console.log('\nAccesso con l\'email');
        const v0 = verifiche;
        const tMario = Date.now();
        const mario = await entra('  MARIO.Rossi@ESEMPIO.it ', P.mariorossi.password, { ip: '10.0.0.9' });
        vero(mario.stato === 200 && mario.dati.email === 'mario.rossi@esempio.it' && mario.dati.idEvento === EVENTO && !!mario.dati.token,
            '"  MARIO.Rossi@ESEMPIO.it " (maiuscole e spazi) entra come mario.rossi@esempio.it', mario.stato + ' ' + mario.testo.slice(0, 200));
        vero(!/password/i.test(Object.keys(mario.dati).join(',')) && !('nomeUtente' in mario.dati) && mario.dati.nome === 'Mario' && /^[0-9a-f]{24}$/.test(mario.dati.sessione),
            'risposta: token, sessione, evento, nome, email (niente password, niente nome utente)');
        const vecchioCampo = await chiama('diretta-accesso', { azione: 'entra', nomeUtente: 'mariorossi', password: P.mariorossi.password }, { ip: '10.0.0.9' });
        vero(vecchioCampo.stato === 400 && vecchioCampo.dati.codice === 'credenziali' && /email/.test(vecchioCampo.dati.msg), 'il vecchio campo nomeUtente non si accetta piu\' (400 «' + vecchioCampo.dati.msg + '»)');
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
        vero(accessi.size === 1 && accessi.docs[0].data().dispositivo === 'iPhone · Safari' && accessi.docs[0].data().email === 'mario.rossi@esempio.it' && accessi.docs[0].data().nomeUtente === undefined,
            'accesso registrato in accessi con l\'email (dispositivo: ' + (accessi.size ? accessi.docs[0].data().dispositivo : '-') + ')');
        const pMario = (await db.collection('partecipanti').doc(P.mariorossi.uid).get()).data();
        vero(pMario.ultimoAccesso && pMario.ultimoAccesso.toMillis() > Date.now() - 60000, 'ultimoAccesso aggiornato');

        console.log('\nPassword sbagliata 5 volte di fila: attesa crescente');
        const ipA = '10.0.0.1';
        const v1 = verifiche;
        const errate = [];
        for (let i = 0; i < 5; i++) errate.push(await entra('luigi.verdi@esempio.it', 'Sbagliata' + i, { ip: ipA }));
        uguale(errate.map(r => r.stato), [401, 401, 401, 401, 429], 'stati: 401 401 401 401 poi 429');
        uguale(errate.slice(0, 4).map(r => r.dati.rimasti), [4, 3, 2, 1], 'tentativi rimasti: 4, 3, 2, 1');
        vero(errate[0].dati.msg === 'Email o password non corretti.', 'il messaggio: «' + errate[0].dati.msg + '»');
        vero((await coppia('luigi.verdi@esempio.it', ipA).get()).exists && (await db.collection('tentativiNome').doc(EM.chiaveEmail('luigi.verdi@esempio.it')).get()).exists,
            'i contatori dei tentativi hanno per id l\'impronta dell\'email (niente indirizzi negli id)');
        const att1 = errate[4].dati.attesaSecondi;
        vero(errate[4].dati.codice === 'attendi' && att1 >= 29 && att1 <= 30, 'al quinto errore: attendi ' + att1 + ' secondi');
        vero(/Password dimenticata/.test(errate[4].dati.msg), 'il messaggio di attesa propone "Password dimenticata?"');
        uguale(verifiche - v1, 5, 'cinque verifiche arrivate a Google');
        const v2 = verifiche;
        const bloccato = await entra('LUIGI.VERDI@esempio.it', P.luigiverdi.password, { ip: ipA });
        vero(bloccato.stato === 429 && verifiche === v2, 'durante l\'attesa anche la password giusta aspetta, e nessuna verifica arriva a Google');
        await coppia('luigi.verdi@esempio.it', ipA).update({ bloccatoFino: Date.now() - 1 }); // l'attesa e' finita (senza aspettare 30 s)
        const sesto = await entra('luigi.verdi@esempio.it', 'Sbagliata6', { ip: ipA });
        vero(sesto.stato === 429 && sesto.dati.attesaSecondi >= 59 && sesto.dati.attesaSecondi <= 60, 'sesto errore: l\'attesa raddoppia (' + sesto.dati.attesaSecondi + ' s)');
        await coppia('luigi.verdi@esempio.it', ipA).update({ bloccatoFino: Date.now() - 1 });
        const settimo = await entra(' luigi.verdi@esempio.it', 'Sbagliata7', { ip: ipA });
        vero(settimo.stato === 429 && settimo.dati.attesaSecondi >= 119 && settimo.dati.attesaSecondi <= 120, 'settimo errore: raddoppia ancora (' + settimo.dati.attesaSecondi + ' s)');
        await coppia('luigi.verdi@esempio.it', ipA).update({ bloccatoFino: Date.now() - 1 });
        const giusta = await entra(' Luigi.Verdi@Esempio.it', P.luigiverdi.password, { ip: ipA });
        vero(giusta.stato === 200 && !(await coppia('luigi.verdi@esempio.it', ipA).get()).exists, 'finita l\'attesa, la password giusta entra e il conto degli errori si azzera');

        console.log('\nEmail non iscritta: stessa risposta e stesso tempo di una password sbagliata');
        const v3 = verifiche;
        const inesistente = await entra('nessuno.inventato@esempio.it', 'Qualunque123', { ip: '10.0.0.5' });
        const sbagliata = await entra('elena.gialli@esempio.it', 'Sbagliata0', { ip: '10.0.0.6' });
        const nonEmail = await entra('Nessuno Inventato', 'Qualunque123', { ip: '10.0.0.7' });
        vero(inesistente.stato === 401 && inesistente.dati.codice === sbagliata.dati.codice && inesistente.dati.msg === sbagliata.dati.msg
            && inesistente.dati.rimasti === sbagliata.dati.rimasti && Object.keys(inesistente.dati).join() === Object.keys(sbagliata.dati).join()
            && inesistente.testo === sbagliata.testo,
        'email non iscritta: la STESSA risposta di una password sbagliata: ' + inesistente.testo);
        vero(nonEmail.testo === sbagliata.testo, 'un testo che non e\' un\'email (un vecchio nome utente): la stessa risposta');
        uguale(verifiche - v3, 1, 'per l\'email non iscritta nessuna verifica a Google (solo quella della password sbagliata)');
        // i tempi: cinque misure per parte, alternate, da reti diverse (nessuna attesa per troppi errori)
        const tInesistente = [], tSbagliata = [];
        for (let i = 0; i < 5; i++) {
            tInesistente.push((await entra('nessuno' + i + '@esempio.it', 'Qualunque123', { ip: '10.0.8.' + (i + 1) })).ms);
            tSbagliata.push((await entra('elena.gialli@esempio.it', 'Sbagliata' + i, { ip: '10.0.9.' + (i + 1) })).ms);
        }
        const mI = mediana(tInesistente), mS = mediana(tSbagliata);
        vero(Math.min.apply(null, tInesistente.concat(tSbagliata)) >= 450, 'nessuna delle due risposte parte prima di 450 ms (' + tInesistente.join(', ') + ' / ' + tSbagliata.join(', ') + ' ms)');
        vero(Math.abs(mI - mS) < 150, 'stesso tempo: mediana ' + mI + ' ms per l\'email non iscritta, ' + mS + ' ms per la password sbagliata');

        console.log('\nAccount disattivato');
        const dis = await gestione({ azione: 'partecipante', uid: P.annabianchi.uid, idEvento: EVENTO, operazione: 'disattiva' }, tokG);
        vero(dis.stato === 200 && dis.dati.partecipante.stato === 'disattivato', 'la gestione disattiva annabianchi');
        const annaChiusa = await entra('anna.bianchi@esempio.it', P.annabianchi.password, { ip: '10.0.0.8' });
        vero(annaChiusa.stato === 401 && annaChiusa.dati.msg === sbagliata.dati.msg,
            'account chiuso anche su Auth: risposta identica a una password sbagliata (DECISIONI T1)', annaChiusa.stato + ' ' + annaChiusa.testo);
        await gestione({ azione: 'partecipante', uid: P.annabianchi.uid, idEvento: EVENTO, operazione: 'riattiva' }, tokG);
        const annaAperta = await entra('anna.bianchi@esempio.it', P.annabianchi.password, { ip: '10.0.0.8' });
        uguale(annaAperta.stato, 200, 'riattivata: entra');
        await db.collection('sessioni').doc(P.annabianchi.uid).update({ stato: 'disattivato' });
        const anna403 = await entra('anna.bianchi@esempio.it', P.annabianchi.password, { ip: '10.0.0.8' });
        vero(anna403.stato === 403 && anna403.dati.codice === 'disattivato' && /disattivato/.test(anna403.dati.msg),
            'password giusta e account disattivato nei dati della diretta: 403 "' + anna403.dati.msg + '"');
        await db.collection('sessioni').doc(P.annabianchi.uid).update({ stato: 'attivo' });

        console.log('\n20 accessi CONTEMPORANEI sbagliati per la stessa email dalla stessa rete');
        const v4 = verifiche;
        const venti = await Promise.all(Array.from({ length: 20 }, (_, i) => entra(i % 2 ? 'carla.neri@esempio.it' : 'CARLA.NERI@esempio.it ', 'Sbagliata' + i, { ip: '10.0.0.2' })));
        const arrivate = verifiche - v4;
        const stati429 = venti.filter(r => r.stato === 429).length;
        vero(arrivate <= 5, 'arrivate alla verifica: ' + arrivate + ' (al massimo 5)');
        vero(stati429 >= 15 && venti.every(r => r.stato === 401 || r.stato === 429), 'risposte 429: ' + stati429 + ', le altre 401');

        console.log('\nLa stessa persona da un\'altra rete');
        for (let i = 0; i < 5; i++) await entra('dario.blu@esempio.it', 'Sbagliata' + i, { ip: '10.0.0.3' });
        const daQui = await entra('dario.blu@esempio.it', P.darioblu.password, { ip: '10.0.0.3' });
        const daLi = await entra('dario.blu@esempio.it', P.darioblu.password, { ip: '10.0.0.4' });
        vero(daQui.stato === 429 && daLi.stato === 200, '5 errori dalla rete 10.0.0.3 la bloccano (429) ma la stessa email entra da 10.0.0.4 (200)');

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
        vero(!/video|webtv|riserva|azoto|tipoPlayer|player/i.test(testoStato), 'nessuna traccia del video (ne\' del tipo di player) nella risposta');
        uguale(stato1.headers.get('cache-control'), 'public, max-age=20, s-maxage=30, stale-while-revalidate=60', 'Cache-Control');
        uguale(stato1.headers.get('access-control-allow-origin'), '*', 'Access-Control-Allow-Origin: *');
        const cattivo = await fetch(API + '/diretta-stato?evento=NAPOLI!!');
        vero(cattivo.status === 400 && cattivo.headers.get('cache-control') === 'no-store', 'evento non valido: 400 senza cache');
        const assente = await fetch(API + '/diretta-stato?evento=inesistente-2099');
        vero(assente.status === 404 && (await assente.json()).ok === false, 'evento inesistente: { ok: false }');
        const inOnda = await gestione({ azione: 'evento-stato', idEvento: EVENTO, stato: 'in_onda' }, tokG);
        const docAzoto = (await db.collection('eventi').doc(EVENTO).get()).data();
        vero(inOnda.stato === 200 && docAzoto.tipoPlayer === 'azoto' && docAzoto.videoId === LINK_AZOTO && docAzoto.videoRiserva === '' && docAzoto.videoFirmato === false,
            'in onda con il player di Azoto: nel documento dell\'evento l\'indirizzo del player, niente riserva ne\' firma');
        vero(inOnda.dati.evento.azotoInOnda === LINK_AZOTO && inOnda.dati.evento.riservaInOnda === '', 'la gestione vede cosa ricevono i partecipanti (azotoInOnda)');
        const lvAzoto = await chiama('diretta-accesso', { azione: 'link-video', idEvento: EVENTO, sorgente: 'principale' }, { token: await tokenDi(P.luigiverdi.uid) });
        vero(lvAzoto.stato === 409 && lvAzoto.dati.codice === 'non-flusso' && !lvAzoto.dati.url, 'link-video con il player di Azoto: 409 non-flusso (l\'indirizzo arriva gia\' nel documento dell\'evento)');
        const passaFlusso = await gestione({ azione: 'evento-player', idEvento: EVENTO, tipoPlayer: 'flusso' }, tokG);
        const docInOnda = (await db.collection('eventi').doc(EVENTO).get()).data();
        vero(passaFlusso.stato === 200 && docInOnda.tipoPlayer === 'flusso' && docInOnda.videoId === LINK_WEBTV && docInOnda.videoRiserva === LINK_RISERVA && docInOnda.sorgente === 'principale'
            && docInOnda.videoFirmato === false && docInOnda.videoAggiornato.toMillis() > docAzoto.videoAggiornato.toMillis(),
        'evento-player flusso, in onda: il link principale e la riserva compaiono nel documento dell\'evento (videoAggiornato cambia)');
        vero(passaFlusso.dati.evento.videoInOnda === LINK_WEBTV && passaFlusso.dati.evento.riservaInOnda === LINK_RISERVA && passaFlusso.dati.evento.azotoInOnda === '',
            'la gestione vede cosa ricevono i partecipanti (videoInOnda, riservaInOnda)');
        const tInOnda = Date.now();

        console.log('\nUn solo dispositivo');
        const salva = await gestione({ azione: 'evento-salva', evento: { id: EVENTO, unSoloDispositivo: true } }, tokG);
        vero(salva.stato === 200 && salva.dati.evento.unSoloDispositivo === true && salva.dati.evento.titolo.indexOf('Napoli') >= 0, 'evento a un solo dispositivo (gli altri campi restano)');
        const primo = await entra('elena.gialli@esempio.it', P.elenagialli.password, { ip: '10.0.1.1', ua: UA_ANDROID });
        const tok1 = (await rest('signInWithCustomToken', { token: primo.dati.token, returnSecureToken: true })).dati.idToken;
        const s1 = (await db.collection('sessioni').doc(P.elenagialli.uid).get()).data().sessioneAttiva;
        vero(primo.stato === 200 && s1 === primo.dati.sessione, 'primo dispositivo: la sua sessione e\' quella ammessa');
        const secondo = await entra('elena.gialli@esempio.it', P.elenagialli.password, { ip: '10.0.1.2' });
        const tok2 = (await rest('signInWithCustomToken', { token: secondo.dati.token, returnSecureToken: true })).dati.idToken;
        const s2 = (await db.collection('sessioni').doc(P.elenagialli.uid).get()).data().sessioneAttiva;
        vero(secondo.stato === 200 && s2 === secondo.dati.sessione && s2 !== s1, 'secondo dispositivo: sessioneAttiva cambia');
        const pres1 = await creaPresenza(tok1, P.elenagialli.uid, primo.dati.sessione);
        const pres2 = await creaPresenza(tok2, P.elenagialli.uid, secondo.dati.sessione);
        vero(pres1 === 403 && pres2 === 200, 'le regole rifiutano la presenza del primo dispositivo (' + pres1 + ') e accettano quella del secondo (' + pres2 + ')');
        // il link del video, come la presenza: al dispositivo sostituito niente piu' link
        const lv1 = await chiama('diretta-accesso', { azione: 'link-video', idEvento: EVENTO, sorgente: 'principale', sessione: primo.dati.sessione }, { token: tok1 });
        const lv2 = await chiama('diretta-accesso', { azione: 'link-video', idEvento: EVENTO, sorgente: 'principale', sessione: secondo.dati.sessione }, { token: tok2 });
        const lvSenzaSessione = await chiama('diretta-accesso', { azione: 'link-video', idEvento: EVENTO, sorgente: 'principale' }, { token: tok2 });
        vero(lv1.stato === 403 && lv1.dati.codice === 'altro-dispositivo' && !lv1.dati.url && lv2.stato === 200 && lv2.dati.url === LINK_WEBTV
            && lvSenzaSessione.stato === 403 && lvSenzaSessione.dati.codice === 'altro-dispositivo',
            'link-video: il dispositivo sostituito riceve 403 altro-dispositivo (' + lv1.stato + '), quello ammesso il link (' + lv2.stato + '), senza sessione 403 (' + lvSenzaSessione.stato + ')');
        await gestione({ azione: 'evento-salva', evento: { id: EVENTO, unSoloDispositivo: false } }, tokG);
        const libero = await entra('elena.gialli@esempio.it', P.elenagialli.password, { ip: '10.0.1.2' });
        vero(libero.stato === 200 && (await db.collection('sessioni').doc(P.elenagialli.uid).get()).data().sessioneAttiva === null, 'tolta l\'opzione, nessuna sessione ammessa in particolare');
        const lvLibero = await chiama('diretta-accesso', { azione: 'link-video', idEvento: EVENTO, sorgente: 'principale', sessione: primo.dati.sessione }, { token: tok1 });
        vero(lvLibero.stato === 200, 'senza "un solo dispositivo" il link va a ogni dispositivo (' + lvLibero.stato + ')');

        console.log('\nPassword dimenticata: iscritti e non iscritti');
        const postaPrima = leggiPosta().length;
        const MSG_DIM = 'Se l\'indirizzo è iscritto alla diretta, tra poco ricevi un\'email con il collegamento per scegliere una nuova password. Controlla anche nella cartella Spam o Promozioni.';
        const richieste = [
            { email: ' MARIO.Rossi@Esempio.IT ' },              // iscritto, maiuscole e spazi
            { identificativo: 'LUIGI.VERDI@esempio.it ' },      // iscritto, con il vecchio nome del campo
            { email: 'nessuno@esempio.it' },                    // non iscritto
            { email: 'Nome Inesistente' },                      // un vecchio nome utente: non e' un'email
            { email: '' }                                        // vuoto
        ];
        const risp = await Promise.all(richieste.map(c => chiama('diretta-accesso', Object.assign({ azione: 'password-dimenticata' }, c), { ip: '10.0.2.1' })));
        vero(risp.every(r => r.stato === 200 && r.testo === risp[0].testo), 'iscritto, iscritto con il vecchio campo, non iscritto, nome utente, vuoto: sempre la stessa risposta');
        vero(risp[0].dati.msg === MSG_DIM, 'risposta: «' + risp[0].dati.msg + '»');
        vero(risp.every(r => r.ms >= 2500 && r.ms < 3600), 'tempi uguali: ' + risp.map(r => r.ms + ' ms').join(', '));
        if (invioPresente) {
            await pausa(300);
            const nuove = leggiPosta().slice(postaPrima);
            const aMario = nuove.filter(m => /mario\.rossi@esempio\.it/i.test(String(m.a)));
            const aLuigi = nuove.filter(m => /luigi\.verdi@esempio\.it/i.test(String(m.a)));
            vero(aMario.length === 1 && aLuigi.length === 1 && nuove.length === 2, 'due email, agli indirizzi VERI di Mario e di Luigi, e a nessun altro (' + nuove.length + ')');
            vero(!nuove.some(m => /nessuno@esempio\.it/i.test(String(m.a))), 'a chi non e\' iscritto non parte niente');
            const corpo = m => String(m.testo || '') + String(m.html || '');
            vero(aMario.length === 1 && /\/diretta\/reimposta\.html\?oobCode=[A-Za-z0-9_-]+"/.test(aMario[0].html) && !/reimposta\.html\?[^"\s]*(u=|@)/.test(corpo(aMario[0])),
                'l\'email contiene il collegamento /diretta/reimposta.html?oobCode=... (senza l\'email nel collegamento)');
            vero(aMario.length === 1 && /La tua email: mario\.rossi@esempio\.it/.test(aMario[0].testo) && !/nome utente/i.test(corpo(aMario[0])), 'e ricorda l\'email con cui si entra (nessun nome utente)');
            vero(nuove.every(m => !/@utenti\.diretta\./.test(String(m.a))), 'nessuna email verso gli indirizzi tecnici');
            const pwNuova = password(); segrete.push(pwNuova);
            const reset = aMario.length ? await rest('resetPassword', { oobCode: oobDa(aMario[0]), newPassword: pwNuova }) : { stato: 0 };
            const conNuova = await entra('mario.rossi@esempio.it', pwNuova, { ip: '10.0.2.2' });
            vero(reset.stato === 200 && conNuova.stato === 200, 'il collegamento funziona: nuova password impostata e accesso riuscito con l\'email');
        } else {
            console.log('       (lib/diretta-invio.js non c\'e\' ancora: controllo della posta saltato)');
        }

        console.log('\nGestione: le altre azioni');
        const elenco = await gestione({ azione: 'eventi' }, tokG);
        vero(elenco.stato === 200 && elenco.dati.eventi.length === 1 && elenco.dati.eventi[0].iscritti === 6 && elenco.dati.eventi[0].videoUrl,
            'eventi: uno, con 6 iscritti e il link del video (solo per la gestione)');
        const part = await gestione({ azione: 'partecipanti', idEvento: EVENTO }, tokG);
        vero(part.stato === 200 && part.dati.partecipanti.length === 6 && part.dati.partecipanti.every(p => p.authCreato && p.invio && p.invio.stato && EM.emailValida(p.email) && !('nomeUtente' in p)),
            'partecipanti: 6, con email, account e stato delle credenziali (niente nome utente)');
        const rig = await gestione({ azione: 'partecipante', uid: P.carlaneri.uid, idEvento: EVENTO, operazione: 'rigenera' }, tokG);
        vero(rig.stato === 200 && /^[A-HJ-NP-Za-hj-km-np-z2-9]{10}$/.test(rig.dati.password || ''), 'rigenera: una password nuova di 10 caratteri senza caratteri che si confondono');
        if (rig.dati.password) segrete.push(rig.dati.password);
        uguale((await entra('carla.neri@esempio.it', rig.dati.password, { ip: '10.0.3.1' })).stato, 200, 'la password rigenerata funziona');
        uguale((await entra('carla.neri@esempio.it', P.carlaneri.password, { ip: '10.0.3.1' })).stato, 401, 'quella di prima non piu\'');

        const pausaEv = await gestione({ azione: 'evento-stato', idEvento: EVENTO, stato: 'pausa', ripresa: '14.30' }, tokG);
        const inPausa = (await db.collection('eventi').doc(EVENTO).get()).data();
        vero(pausaEv.stato === 200 && inPausa.stato === 'pausa' && inPausa.ripresa === '14:30' && inPausa.videoId === '' && inPausa.videoRiserva === '',
            'pausa con ripresa alle 14:30: il video (anche la riserva) esce dal documento pubblico');
        const avviso = await gestione({ azione: 'evento-avviso', idEvento: EVENTO, avviso: '  Problema tecnico: torniamo tra 5 minuti ' }, tokG);
        vero(avviso.stato === 200 && (await db.collection('eventi').doc(EVENTO).get()).data().avviso === 'Problema tecnico: torniamo tra 5 minuti', 'avviso a tutti scritto nel documento dell\'evento');
        await gestione({ azione: 'evento-stato', idEvento: EVENTO, stato: 'in_onda' }, tokG);
        const ripreso = (await db.collection('eventi').doc(EVENTO).get()).data();
        vero(ripreso.stato === 'in_onda' && ripreso.videoId === LINK_WEBTV && ripreso.videoRiserva === LINK_RISERVA && ripreso.ripresa === '', 'di nuovo in onda: il video e la riserva tornano');
        const nuovoVideo = await gestione({ azione: 'evento-video', idEvento: EVENTO, videoUrl: LINK_NUOVO }, tokG);
        const dopoCambio = (await db.collection('eventi').doc(EVENTO).get()).data();
        vero(nuovoVideo.stato === 200 && dopoCambio.videoId === LINK_NUOVO && dopoCambio.videoRiserva === LINK_RISERVA,
            'cambio del video in onda: chi guarda riceve il nuovo link (la riserva, non mandata, resta)');
        // la web TV: il link HLS e il player incorporato si salvano come indirizzo (lo decide il servizio, non la pagina)
        const webtv = await gestione({ azione: 'evento-video', idEvento: EVENTO, videoUrl: 'https://webtv.esempio.it/live/napoli/playlist.m3u8?token=x', videoId: 'altro' }, tokG);
        vero(webtv.stato === 200 && (await db.collection('eventi').doc(EVENTO).get()).data().videoId === 'https://webtv.esempio.it/live/napoli/playlist.m3u8?token=x',
            'il link HLS della web TV: chi guarda riceve l\'indirizzo (l\'id mandato dalla pagina non conta)');
        const incorporato = await gestione({ azione: 'evento-video', idEvento: EVENTO, videoUrl: '<iframe src="https://player.webtv.esempio.it/embed/9?a=1&amp;b=2"></iframe>' }, tokG);
        vero(incorporato.stato === 400 && /non è il link di un flusso diretto/.test(incorporato.dati.msg || ''), 'la pagina da incorporare di un\'altra web TV nel campo del flusso: 400 («' + incorporato.dati.msg + '»)');
        const azotoNelFlusso = await gestione({ azione: 'evento-video', idEvento: EVENTO, videoUrl: CODICE_AZOTO }, tokG);
        vero(azotoNelFlusso.stato === 400 && azotoNelFlusso.dati.codice === 'video' && /va nel campo «Player Azoto»/.test(azotoNelFlusso.dati.msg || ''),
            'il codice di Azoto nel campo del flusso: 400 («' + azotoNelFlusso.dati.msg + '»)');
        const flussoInAzoto = await gestione({ azione: 'evento-salva', evento: { id: EVENTO, azotoUrl: LINK_WEBTV } }, tokG);
        vero(flussoInAzoto.stato === 400 && flussoInAzoto.dati.codice === 'azoto' && /va nel campo «Flusso diretto \(\.m3u8\)»/.test(flussoInAzoto.dati.msg || ''),
            'un .m3u8 nel campo del player Azoto: 400 («' + flussoInAzoto.dati.msg + '»)');
        const malevolo = await gestione({ azione: 'evento-salva', evento: { id: EVENTO, azotoUrl: "<script>alert(1)</script><iframe src='https://ladro.esempio.it/p' onload='alert(1)'></iframe>" + CODICE_AZOTO } }, tokG);
        vero(malevolo.stato === 400 && malevolo.dati.codice === 'azoto' && /cdn\.azotosolutions\.com/.test(malevolo.dati.msg || ''), 'codice malevolo (script e un iframe di un altro sito davanti): 400 («' + malevolo.dati.msg + '»)');
        const nonAzoto = await gestione({ azione: 'evento-video', idEvento: EVENTO, azotoUrl: 'https://azotosolutions.com/cloudtv/livetv91/player' }, tokG);
        vero(nonAzoto.stato === 400 && nonAzoto.dati.codice === 'azoto', 'azotosolutions.com senza cdn.: 400');
        const primaCambioAzoto = (await db.collection('eventi').doc(EVENTO).get()).data();
        const cambioAzoto = await gestione({ azione: 'evento-video', idEvento: EVENTO, azotoUrl: "<iframe src='" + LINK_AZOTO_30 + "'></iframe>" }, tokG);
        const dopoCambioAzoto = (await db.collection('eventi').doc(EVENTO).get()).data();
        vero(cambioAzoto.stato === 200 && cambioAzoto.dati.evento.azotoUrl === LINK_AZOTO_30 && dopoCambioAzoto.videoId === primaCambioAzoto.videoId
            && dopoCambioAzoto.videoAggiornato.toMillis() === primaCambioAzoto.videoAggiornato.toMillis(),
        'evento-video con l\'indirizzo di Azoto mentre si usa il flusso: cambia solo nel documento riservato (chi guarda non se ne accorge)');
        const altroPlayer = await gestione({ azione: 'evento-video', idEvento: EVENTO, videoUrl: '', videoId: 'vimeo-123456789' }, tokG);
        vero(altroPlayer.stato === 400, 'un identificativo che non e\' un link della web TV: 400 (il video arriva solo dalla web TV)');
        const linkFile = await gestione({ azione: 'evento-video', idEvento: EVENTO, videoUrl: 'https://webtv.esempio.it/archivio/replica.mp4' }, tokG);
        vero(linkFile.stato === 400 && /file video/.test(linkFile.dati.msg || ''), 'un file video (non una diretta): 400 con il motivo');
        const linkPrivato = await gestione({ azione: 'evento-video', idEvento: EVENTO, videoUrl: 'https://10.0.0.8/live/playlist.m3u8' }, tokG);
        vero(linkPrivato.stato === 400 && /interno o privato/.test(linkPrivato.dati.msg || ''), 'un indirizzo IP privato: 400');
        const linkHttp = await gestione({ azione: 'evento-video', idEvento: EVENTO, videoUrl: 'http://example.com/diretta.m3u8' }, tokG);
        vero(linkHttp.stato === 400 && /https:\/\//.test(linkHttp.dati.msg || ''), 'un link http: 400 con il motivo');
        const linkRtmp = await gestione({ azione: 'evento-video', idEvento: EVENTO, videoUrl: 'rtmp://ingest.example.com/live/chiave' }, tokG);
        vero(linkRtmp.stato === 400 && /RTMP/.test(linkRtmp.dati.msg || ''), 'un link per trasmettere (RTMP): 400 con il motivo');
        const dash = await gestione({ azione: 'evento-video', idEvento: EVENTO, videoUrl: 'https://dash.webtv.esempio.it/live/napoli/manifest.mpd' }, tokG);
        vero(dash.stato === 200 && dash.dati.evento.videoTipo === 'dash', 'un flusso DASH (.mpd) si salva');
        await gestione({ azione: 'evento-video', idEvento: EVENTO, videoUrl: LINK_WEBTV }, tokG);

        await provaVideoWebTv(tokG, P, segrete);

        const conn = await gestione({ azione: 'connessi', idEvento: EVENTO }, tokG);
        vero(conn.stato === 200 && conn.dati.connessi === 1 && conn.dati.quando > 0, 'connessi: 1 (la presenza scritta poco fa)');
        const esp = await gestione({ azione: 'esporta', idEvento: EVENTO }, tokG);
        const accTot = (await db.collection('accessi').where('idEvento', '==', EVENTO).get()).size;
        const elena = esp.dati.partecipanti && esp.dati.partecipanti.find(p => p.email === 'elena.gialli@esempio.it');
        vero(esp.stato === 200 && esp.dati.partecipanti.length === 6 && esp.dati.accessi.length === accTot && elena && elena.presenza && elena.presenza.collegamenti === 1,
            'esporta: 6 partecipanti con la presenza, ' + accTot + ' accessi');
        vero(esp.dati.accessi.every((a, i, v) => !i || v[i - 1].quando <= a.quando) && /limitati alla durata/.test(esp.dati.nota), 'accessi in ordine di tempo, con la nota sui minuti');
        vero(esp.dati.accessi.every(a => EM.emailValida(a.email) && !('nomeUtente' in a)) && esp.dati.partecipanti.every(p => !('nomeUtente' in p)), 'esportazione: con l\'email, senza la colonna del nome utente');

        const togli = await gestione({ azione: 'partecipante', uid: P.darioblu.uid, idEvento: EVENTO, operazione: 'rimuovi-evento' }, tokG);
        vero(togli.stato === 200 && JSON.stringify(((await auth.getUser(P.darioblu.uid)).customClaims || {}).eventi) === '[]', 'togli dall\'evento: claims senza eventi');
        const linkDario = await chiama('diretta-accesso', { azione: 'link-video', idEvento: EVENTO, sorgente: 'principale' }, { token: await tokenDi(P.darioblu.uid) });
        vero(linkDario.stato === 403 && linkDario.dati.codice === 'non-iscritto' && !linkDario.dati.url, 'link-video di chi non e\' (piu\') iscritto all\'evento: 403 non-iscritto');
        const senzaEventi = await entra('dario.blu@esempio.it', P.darioblu.password, { ip: '10.0.3.2' });
        vero(senzaEventi.stato === 403 && senzaEventi.dati.codice === 'nessun-evento', 'e senza eventi non entra (403 nessun-evento)');

        if (invioPresente) {
            const postaPrimaReinvio = leggiPosta().length;
            const re = await gestione({ azione: 'partecipante', uid: P.luigiverdi.uid, idEvento: EVENTO, operazione: 'reinvia' }, tokG);
            const cred = leggiPosta().slice(postaPrimaReinvio).filter(m => /luigi\.verdi@esempio\.it/i.test(String(m.a)));
            vero(re.stato === 200 && re.dati.invio && re.dati.invio.stato === 'inviata' && cred.length === 1 && /scrivi la tua email luigi\.verdi@esempio\.it e questa password: /.test(String(cred[0].testo))
                && !/nome utente/i.test(String(cred[0].testo) + String(cred[0].html)),
                'reinvia credenziali: email all\'indirizzo vero, «scrivi la tua email luigi.verdi@esempio.it e questa password» (' + (re.dati.invio && re.dati.invio.stato) + ')', re.testo.slice(0, 200));
            const pwReinvio = cred.length ? ((/\nPassword: (\S+)\n/.exec(cred[0].testo)) || [])[1] : '';
            if (pwReinvio) segrete.push(pwReinvio);
            uguale((await entra('luigi.verdi@esempio.it', P.luigiverdi.password, { ip: '10.0.3.3' })).stato, 401, 'dopo il reinvio la vecchia password non vale piu\'');
            uguale((await entra('luigi.verdi@esempio.it', pwReinvio, { ip: '10.0.3.3' })).stato, 200, 'la password dell\'email di reinvio funziona, con l\'email');
        }

        /* ================= RAFFICHE DA UNA RETE ================= */
        console.log('\n100 accessi CONTEMPORANEI sbagliati da una rete, con 100 email diverse');
        const raffica = await creaPersoneVeloci(100, 'raffica', 'raffica-2026');
        await fuoriDalBordo(QUINDICI_MINUTI, 15000);
        const ipR = '10.0.5.1';
        const v5 = verifiche;
        const tR = Date.now();
        const cento = await Promise.all(raffica.map((p, i) => entra(p.email, 'Sbagliata' + i, { ip: ipR })));
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
        const giustaBloccata = await entra('elena.gialli@esempio.it', P.elenagialli.password, { ip: ipR });
        vero(giustaBloccata.stato === 429 && verifiche === vR, 'dalla rete bloccata anche la password giusta aspetta, senza verifica');
        const altraRete = await entra('elena.gialli@esempio.it', P.elenagialli.password, { ip: '10.0.5.2' });
        uguale(altraRete.stato, 200, 'da un\'altra rete la stessa persona entra');

        console.log('\n60 "password dimenticata" CONTEMPORANEE da una rete, per 60 persone diverse');
        await fuoriDalBordo(60 * 60 * 1000, 20000);
        const postaPrimaR = leggiPosta().length;
        const tDim = Date.now();
        const sessanta = await Promise.all(raffica.slice(0, 60).map(p => chiama('diretta-accesso', { azione: 'password-dimenticata', email: p.email }, { ip: '10.0.6.1' })));
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
            await chiama('diretta-accesso', { azione: 'password-dimenticata', email: raffica[70].email.toUpperCase() }, { ip: '10.0.6.2' });
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
            await chiama('diretta-accesso', { azione: 'password-dimenticata', email: ' UGO.VECCHIO@esempio.it' }, { ip: '10.0.7.1' });
            await pausa(300);
            const resetU = leggiPosta().slice(postaU);
            vero(resetU.length === 1 && resetU[0].a === 'ugo.vecchio@esempio.it', 'password dimenticata: il collegamento va all\'indirizzo normalizzato (' + JSON.stringify(resetU.map(m => m.a)) + ')');
        }

        console.log('\nStato pubblico dopo la messa in onda');
        await pausa(Math.max(0, 15500 - (Date.now() - tInOnda)));
        const stato2 = await fetch(API + '/diretta-stato?evento=' + EVENTO);
        const testo2 = await stato2.text();
        vero(JSON.parse(testo2).stato === 'in_onda' && !/video|webtv|riserva|azoto|tipoPlayer|player/i.test(testo2), 'passata la memoria di 15 s: "in_onda", e ancora nessun video (ne\' il tipo di player)');
        await gestione({ azione: 'evento-stato', idEvento: EVENTO, stato: 'terminato' }, tokG);
        const finito = (await db.collection('eventi').doc(EVENTO).get()).data();
        vero(finito.videoId === '' && finito.videoRiserva === '' && finito.videoFirmato === false, 'terminato: il video (principale, riserva, videoFirmato) sparisce dal documento dell\'evento');
        const linkFinito = await chiama('diretta-accesso', { azione: 'link-video', idEvento: EVENTO, sorgente: 'principale' }, { token: await tokenDi(P.elenagialli.uid) });
        vero(linkFinito.stato === 409 && linkFinito.dati.codice === 'non-in-onda' && !linkFinito.dati.url, 'link-video con l\'evento non in onda: 409 non-in-onda');

        console.log('\nLog del servizio');
        await pausa(200);
        const log = fs.readFileSync(LOG_SERVER, 'utf8');
        vero(segrete.every(s => log.indexOf(s) < 0), 'nessuna password (e nessuna chiave dei link firmati) nei log del servizio');
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
