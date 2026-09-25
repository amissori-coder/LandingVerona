/* ============================================================
   PROVE - carico: 1000 accessi in 2 minuti
   ------------------------------------------------------------
       node avvia-emulatori.js --firestore 8780 --auth 9780 &
       node server-locale.js --api 3780 --statico 8790 --firestore 8780 --auth 9780 &
       node carico.prova.js --api 3780 --firestore 8780 --auth 9780 [--persone 1000] [--secondi 120]

   Che cosa simula, per ognuna delle 1000 persone, a un istante
   casuale dentro i 2 minuti (come chi apre il link dell'email
   quando la diretta sta per cominciare):
     1. POST /api/diretta-accesso {azione:'entra'} (la funzione vera,
        con il blocco dei tentativi, la verifica della password e il
        token personalizzato);
     2. accesso a Firebase con il token (signInWithCustomToken);
     3. la lettura del proprio profilo e dell'evento, CON le regole
        vere (come fa la pagina; l'ascolto continuo della pagina qui
        e' una lettura singola: il costo del primo arrivo e' lo stesso);
     4. il primo segnale di presenza, a un ritardo casuale 0-60 s;
     5. un secondo segnale ("continua", +60 secondi) 60 s dopo il primo.
   I 1000 partecipanti si creano PRIMA, con la vera API di gestione
   (azione 'crea', a gruppi di 25, come fa la pagina di gestione):
   anche quella e' una misura.

   Risultati (tempi p50/p95/p99/massimo per passo, errori, scritture
   per secondo) su schermo e in risultati/carico.json.
   L'emulatore NON e' Firestore vero: e' un solo processo Java su
   questa macchina. I tempi dicono se il nostro codice regge il
   volume senza errori ne' contese; quelli veri di Google e Vercel
   sono di solito migliori (vedi README).
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

function argomento(nome, predefinito) {
    const i = process.argv.indexOf('--' + nome);
    return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : predefinito;
}
const API = 'http://127.0.0.1:' + argomento('api', '3780') + '/api';
const FS = 'http://127.0.0.1:' + argomento('firestore', '8780');
const AUTH = 'http://127.0.0.1:' + argomento('auth', '9780');
const PERSONE = Number(argomento('persone', 1000));
const FINESTRA_S = Number(argomento('secondi', 120));
const PROGETTO = 'demo-ngb-eventi';
const EVENTO = 'napoli-2026';
const GESTORE = 'gestore@prova.it';

process.env.FIRESTORE_EMULATOR_HOST = FS.replace('http://', '');
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH.replace('http://', '');
const admin = require(path.resolve(__dirname, '../../email-service/node_modules/firebase-admin'));
const app = admin.initializeApp({ projectId: PROGETTO }, 'carico');
const db = app.firestore();

const RADICE_DOC = FS + '/v1/projects/' + PROGETTO + '/databases/(default)/documents';
const pausa = ms => new Promise(r => setTimeout(r, ms));

/* ---------- misure ---------- */
const misure = {};
const errori = {};
const scrittureAlSecondo = {};
function misura(passo, ms) { (misure[passo] = misure[passo] || []).push(ms); }
function errore(passo, motivo) {
    const k = passo + ': ' + String(motivo).slice(0, 120);
    errori[k] = (errori[k] || 0) + 1;
}
function percentile(v, p) {
    if (!v.length) return 0;
    const s = v.slice().sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))];
}
async function cronometra(passo, fn) {
    const t0 = Date.now();
    try { const r = await fn(); misura(passo, Date.now() - t0); return r; }
    catch (e) { misura(passo, Date.now() - t0); errore(passo, e.message || e); return null; }
}
async function json(url, opz) {
    const r = await fetch(url, opz);
    const testo = await r.text();
    let dati = null;
    try { dati = JSON.parse(testo); } catch (_) { /* non JSON */ }
    if (!r.ok) throw new Error(r.status + ' ' + (dati && (dati.codice || (dati.error && dati.error.message)) || testo.slice(0, 80)));
    return dati;
}
const posta = (url, corpo, token) => json(url, {
    method: 'POST',
    headers: Object.assign({ 'content-type': 'application/json' }, token ? { authorization: 'Bearer ' + token } : {}),
    body: JSON.stringify(corpo)
});

/* ---------- preparazione ---------- */
async function tokenGestore() {
    // il gestore si attiva come nella realta': 'gestore-accesso' crea l'account e
    // gli mette il claim; qui la password la impostiamo noi (niente email da leggere)
    await posta(API + '/diretta-accesso', { azione: 'gestore-accesso', email: GESTORE });
    const u = await app.auth().getUserByEmail(GESTORE);
    await app.auth().updateUser(u.uid, { password: 'GestoreProva234' });
    const r = await posta(AUTH + '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=finta',
        { email: GESTORE, password: 'GestoreProva234', returnSecureToken: true });
    return r.idToken;
}

function nomi(i) {
    // tanti omonimi apposta: 1000 persone su 300 nomi e 40 cognomi
    const N = ['Mario', 'Anna', 'Giuseppe', 'Maria', 'Luca', 'Giulia', 'Nicolò', 'Francesca', 'Paolo', 'Chiara'];
    const C = ['Rossi', 'Bianchi', "D'Angelo", 'De Luca', 'Esposito', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco'];
    return { nome: N[i % N.length] + (i % 3 ? '' : ' Maria'), cognome: C[Math.floor(i / 10) % C.length] + (i % 7 ? '' : ' Russo') };
}

async function prepara() {
    console.log('Preparazione: gestore, evento, ' + PERSONE + ' partecipanti con l\'API di gestione...');
    const token = await tokenGestore();
    const g = (corpo) => posta(API + '/diretta-gestione', corpo, token);
    await g({
        azione: 'evento-salva', evento: {
            id: EVENTO, nuovo: true, titolo: 'Next Generation Business 2026 · Napoli', luogo: 'Napoli · Hotel Eurostars Excelsior',
            // il player predefinito e' quello di Azoto: in onda il suo indirizzo e' il videoId che le persone leggono
            data: '2026-10-02', oraInizio: '09:00', oraFine: '17:30', azotoUrl: 'https://cdn.azotosolutions.com/cloudtv/livetv91/player',
            videoUrl: 'https://webtv.esempio.it/live/napoli/playlist.m3u8',
            programma: '09.00 Accoglienza\n09.30 Apertura dei lavori', paginaEvento: '/napoli_ottobre_2026/',
            unSoloDispositivo: false, promemoria: { giornoPrima: false, oraPrima: false }
        }
    }).catch(e => { if (!/409|esiste/i.test(e.message)) throw e; });
    await g({ azione: 'evento-stato', idEvento: EVENTO, stato: 'in_onda' });

    const righe = [];
    for (let i = 0; i < PERSONE; i++) {
        const n = nomi(i);
        righe.push({ riga: i + 2, nome: n.nome, cognome: n.cognome, email: 'persona' + i + '@carico.prova', azienda: 'Azienda ' + (i % 50) });
    }
    const t0 = Date.now();
    const creati = [];
    for (let i = 0; i < righe.length; i += 25) {
        const r = await cronometra('crea (25 righe)', () => g({ azione: 'crea', idEvento: EVENTO, righe: righe.slice(i, i + 25) }));
        if (r && r.risultati) creati.push(...r.risultati);
    }
    const secCrea = (Date.now() - t0) / 1000;
    const buoni = creati.filter(x => x.esito === 'creato' || x.esito === 'aggiunto' || x.esito === 'gia-nell-evento');
    console.log('  creati ' + buoni.length + '/' + PERSONE + ' in ' + secCrea.toFixed(1) + ' s');

    // password note alla prova (in memoria, mai scritte): come se ognuno avesse la sua email
    const persone = [];
    for (let i = 0; i < buoni.length; i += 50) {
        await Promise.all(buoni.slice(i, i + 50).map(async x => {
            const password = 'Carico' + Math.random().toString(36).slice(2, 8) + '7K';
            await app.auth().updateUser(x.uid, { password: password });
            persone.push({ uid: x.uid, nomeUtente: x.nomeUtente, password: password });
        }));
    }
    return { persone, secCrea, gestore: token };
}

/* ---------- una persona ---------- */
async function commit(idToken, scrittura) {
    return json(RADICE_DOC + ':commit', {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + idToken },
        body: JSON.stringify({ writes: [scrittura] })
    });
}
function segnaScrittura() {
    const s = Math.floor(Date.now() / 1000);
    scrittureAlSecondo[s] = (scrittureAlSecondo[s] || 0) + 1;
}
async function persona(p, inizioProva) {
    // l'accesso si scrive come lo scriverebbe una persona: con maiuscole e spazi
    const scritto = ' ' + p.nomeUtente.charAt(0).toUpperCase() + p.nomeUtente.slice(1) + ' ';
    const acc = await cronometra('1 accesso (funzione diretta-accesso)', () =>
        posta(API + '/diretta-accesso', { azione: 'entra', nomeUtente: scritto, password: p.password }));
    if (!acc || !acc.token) return;
    const sess = await cronometra('2 signInWithCustomToken', () =>
        posta(AUTH + '/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=finta', { token: acc.token, returnSecureToken: true }));
    if (!sess) return;
    const idToken = sess.idToken;
    const leggi = (percorso) => json(RADICE_DOC + '/' + percorso, { headers: { authorization: 'Bearer ' + idToken } });
    await cronometra('3a lettura del profilo (regole)', () => leggi('partecipanti/' + p.uid));
    const ev = await cronometra('3b lettura dell\'evento (regole)', () => leggi('eventi/' + (acc.idEvento || EVENTO)));
    if (ev && !(ev.fields && ev.fields.videoId && ev.fields.videoId.stringValue)) errore('3b lettura dell\'evento (regole)', 'videoId assente con evento in onda');

    // primo segnale a un ritardo casuale 0-60 s: mai tutti nello stesso secondo
    await pausa(Math.random() * 60000);
    const nome = 'projects/' + PROGETTO + '/databases/(default)/documents/presenze/' + (acc.idEvento || EVENTO) + '_' + p.uid;
    const ok1 = await cronometra('4 primo segnale di presenza', async () => {
        await commit(idToken, {
            update: { name: nome, fields: { uid: { stringValue: p.uid }, idEvento: { stringValue: acc.idEvento || EVENTO }, secondi: { integerValue: '0' }, collegamenti: { integerValue: '1' }, sessione: { stringValue: acc.sessione || 's' } } },
            updateTransforms: [{ fieldPath: 'primo', setToServerValue: 'REQUEST_TIME' }, { fieldPath: 'ultimo', setToServerValue: 'REQUEST_TIME' }],
            currentDocument: { exists: false }
        });
        segnaScrittura();
        return true;
    });
    if (!ok1) return;
    // secondo segnale 60 s dopo il completamento del primo, come la pagina
    await pausa(60500);
    await cronometra('5 segnale "continua" (+60 s)', async () => {
        await commit(idToken, {
            update: { name: nome, fields: {} }, updateMask: { fieldPaths: [] },
            updateTransforms: [{ fieldPath: 'ultimo', setToServerValue: 'REQUEST_TIME' }, { fieldPath: 'secondi', increment: { integerValue: '60' } }],
            currentDocument: { exists: true }
        });
        segnaScrittura();
    });
}

(async () => {
    const { persone, secCrea, gestore } = await prepara();
    console.log('Carico: ' + persone.length + ' accessi distribuiti a caso in ' + FINESTRA_S + ' s, poi i segnali di presenza...');
    const inizio = Date.now();
    const arrivi = persone.map(p => ({ p, t: Math.random() * FINESTRA_S * 1000 })).sort((a, b) => a.t - b.t);
    const accessiAlSecondo = {};
    arrivi.forEach(a => { const s = Math.floor(a.t / 1000); accessiAlSecondo[s] = (accessiAlSecondo[s] || 0) + 1; });
    await Promise.all(arrivi.map(a => pausa(a.t).then(() => persona(a.p, inizio))));
    const durata = (Date.now() - inizio) / 1000;

    // quante persone il contatore della gestione vede collegate, adesso
    const collegati = await posta(API + '/diretta-gestione', { azione: 'connessi', idEvento: EVENTO }, gestore).catch(e => ({ errore: e.message }));
    const presenze = await db.collection('presenze').where('idEvento', '==', EVENTO).get();
    const conMinuto = presenze.docs.filter(d => d.data().secondi === 60).length;

    const tabella = Object.keys(misure).sort().map(k => {
        const v = misure[k];
        return { passo: k, n: v.length, p50: percentile(v, 50), p95: percentile(v, 95), p99: percentile(v, 99), max: Math.max.apply(null, v) };
    });
    const picco = Math.max.apply(null, Object.values(scrittureAlSecondo).concat([0]));
    const piccoAccessi = Math.max.apply(null, Object.values(accessiAlSecondo).concat([0]));
    const risultato = {
        quando: new Date().toISOString(), persone: persone.length, finestraSecondi: FINESTRA_S, durataTotaleSecondi: durata,
        creazioneAccountSecondi: secCrea, tempiMs: tabella, errori: errori,
        piccoAccessiInUnSecondo: piccoAccessi, piccoScrittureInUnSecondo: picco,
        presenzeScritte: presenze.size, presenzeConUnMinuto: conMinuto, collegatiSecondoLaGestione: collegati
    };
    fs.mkdirSync(path.resolve(__dirname, 'risultati'), { recursive: true });
    fs.writeFileSync(path.resolve(__dirname, 'risultati/carico.json'), JSON.stringify(risultato, null, 2));
    console.log('\nPasso'.padEnd(44) + 'n'.padStart(6) + 'p50'.padStart(8) + 'p95'.padStart(8) + 'p99'.padStart(8) + 'max'.padStart(8) + '  (ms)');
    tabella.forEach(r => console.log(r.passo.padEnd(43) + String(r.n).padStart(6) + String(r.p50).padStart(8) + String(r.p95).padStart(8) + String(r.p99).padStart(8) + String(r.max).padStart(8)));
    console.log('\nErrori: ' + (Object.keys(errori).length ? JSON.stringify(errori, null, 1) : 'nessuno'));
    console.log('Picco di accessi in un secondo: ' + piccoAccessi + '; picco di scritture di presenza in un secondo: ' + picco);
    console.log('Presenze scritte: ' + presenze.size + ' (con il secondo segnale: ' + conMinuto + '); collegati secondo la gestione: ' + JSON.stringify(collegati));
    console.log('Creazione dei ' + persone.length + ' account con l\'API di gestione: ' + secCrea.toFixed(1) + ' s');
    process.exit(Object.keys(errori).length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
