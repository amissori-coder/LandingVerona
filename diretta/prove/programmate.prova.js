/* ============================================================
   PROVE - le EMAIL PROGRAMMATE: i promemoria in piu' che il gestore
   programma dalla scheda Email (lib/diretta-programmate.js, il giro
   del cron in lib/diretta-invio.js, le azioni di api/diretta-gestione.js)
   ------------------------------------------------------------
       node diretta/prove/programmate.prova.js [--firestore 8460] [--auth 9460]

   Se sulle due porte non risponde gia' un emulatore, la prova ne
   avvia uno suo (con le regole vere) e lo ferma alla fine. Niente
   SMTP: la posta finta scrive ogni email in
   risultati/programmate-posta.jsonl, e da li' si contano. L'orologio
   del servizio (ctx.adesso) si sposta: la prova vive fra il 28
   settembre e il 2 ottobre 2026.

   COSA DIMOSTRA.
   A. I testi del gestore: oggetto e titolo obbligatori e corti, la nota
      al massimo 500 caratteri e 12 righe, niente HTML e niente
      collegamenti scritti a mano (400); nell'email la nota e' testo
      (i caratteri speciali escono come testo, mai come HTML).
   B. Programmare: non nel passato, non dopo la fine dell'evento,
      destinatari validi; l'elenco dice quante persone lo riceveranno
      (tutti quelli con le credenziali «inviata», account attivo, ancora
      nell'evento; «solo chi non e' mai entrato»; mai «da confermare»,
      «da inviare», «respinta», «incerto»); modificare prima della
      partenza (con chi e quando); al massimo 10 in programma per evento;
      annullare (con chi e quando), e un annullato non si tocca piu'.
   C. Il cron: prima dell'ora non parte niente; all'ora parte UNA volta
      per persona anche con due giri insieme; chi riceve le credenziali
      dopo l'ora di partenza non lo riceve; l'email ha l'oggetto e il
      titolo del gestore, la sua nota, il pulsante «Accedi alla diretta»
      con il collegamento dell'evento, «Password dimenticata?», e MAI la
      password; il registro (partita, inviate, cominciato, ultimoGiro);
      dopo non si modifica ne' si annulla, e il giro dopo non rispedisce.
   D. Il tetto del giorno: i promemoria programmati si fermano al 70%
      (DIRETTA_PROMEMORIA_PERCENTO) e le credenziali passano ancora;
      a meta' si puo' solo FERMARE, e il giorno dopo non riparte; un
      giro in corso si ferma al lotto dopo se il gestore lo ferma.
   E. «Solo chi non e' mai entrato»: chi e' gia' entrato non lo riceve.
   F. Evento terminato: non parte, l'elenco dice perche', non se ne
      programmano altri; evento finito: non se ne programmano altri.
   G. L'anteprima (testo, nome di esempio, niente password) e la prova
      al gestore (EMAIL DI PROVA).
   H. Le azioni di api/diretta-gestione.js chiamate davvero: 401 senza
      accesso, 403 per un partecipante, 200 per il gestore (elenco,
      anteprima, programma, annulla), 400 con l'HTML nella nota.
   I. I log: solo numeri (niente indirizzi, niente testi del gestore).
   Stampa "N verdi, M rossi" (anche in risultati/programmate.json).
   ============================================================ */
'use strict';
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

function argomento(nome, predefinito) {
    const i = process.argv.indexOf('--' + nome);
    return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : predefinito;
}
const PORTA_FS = Number(argomento('firestore', 8460));
const PORTA_AUTH = Number(argomento('auth', 9460));
const PROGETTO = 'demo-ngb-eventi';
const SERVIZIO = path.resolve(__dirname, '../../email-service');
const RISULTATI = path.resolve(__dirname, 'risultati');
const POSTA = path.join(RISULTATI, 'programmate-posta.jsonl');
const GESTORE = { email: 'gestore@prova.it', password: 'Gestore-della-prova-1' };
const EV = 'napoli-2026';
const EV_T = 'roma-2026';     // sara' terminato
const EV_API = 'api-2026';    // con l'orologio vero, per le azioni della gestione

/* ---------- l'ambiente, PRIMA di caricare il servizio ---------- */
Object.assign(process.env, {
    DIRETTA_EMULATORE: '1',
    DIRETTA_PROGETTO: PROGETTO,
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:' + PORTA_FS,
    FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:' + PORTA_AUTH,
    DIRETTA_POSTA_FINTA: POSTA,
    DIRETTA_ADMIN_EMAILS: GESTORE.email,
    DIRETTA_MAX_GIORNO: '0',
    DIRETTA_MAX_LOTTO: '40',
    DIRETTA_CONCORRENZA: '4',
    DIRETTA_PAUSA_MS: '0',
    CRON_SECRET: 'segreto-della-prova-programmate'
});
['APP_BASE_URL', 'BREVO_API_KEY', 'DIRETTA_POSTA_RIFIUTA', 'DIRETTA_POSTA_ERRORE_MESSAGGIO', 'DIRETTA_POSTA_INCERTA',
    'DIRETTA_POSTA_ERRORE_ACCOUNT', 'DIRETTA_POSTA_RITARDO_MS', 'DIRETTA_PROMEMORIA_PERCENTO',
    'DIRETTA_FIREBASE_SERVICE_ACCOUNT', 'ALLOWED_ORIGIN'].forEach(k => { delete process.env[k]; });

/* ---------- i log: tutto quello che il servizio scrive, per controllarlo alla fine ---------- */
const righeLog = [];
const logVero = console.log, erroreVero = console.error;
function dalServizio(args) { return args.map(a => (a && a.stack) ? a.stack : String(a)).join(' '); }
console.error = (...a) => { righeLog.push(dalServizio(a)); };
console.log = (...a) => {
    const t = dalServizio(a);
    if (/^\[diretta/.test(t)) righeLog.push(t);
    else logVero.apply(console, a);
};

const { contesto } = require(path.join(SERVIZIO, 'lib/diretta-firebase'));
const P = require(path.join(SERVIZIO, 'lib/diretta-programmate'));
const I = require(path.join(SERVIZIO, 'lib/diretta-invio'));
const C = require(path.join(SERVIZIO, 'lib/diretta-comune'));
const M = require(path.join(SERVIZIO, 'lib/diretta-mail'));
const gestione = require(path.join(SERVIZIO, 'api/diretta-gestione.js'));

let rossi = 0, verdi = 0;
const numeri = {};
function vero(cond, descrizione, dettaglio) {
    if (cond) { verdi++; logVero('  ok  ' + descrizione); }
    else { rossi++; logVero('ROSSO ' + descrizione + (dettaglio ? '\n       ' + String(dettaglio).slice(0, 1500) : '')); }
}
function titolo(t) { logVero('\n== ' + t); }
const pausa = ms => new Promise(r => setTimeout(r, ms));

// l'orologio del servizio
let spostamento = 0;
const ctx = contesto();
ctx.adesso = () => Date.now() + spostamento;
function portaOra(ms) { spostamento = ms - Date.now(); }
const roma = (data, ora) => C.istanteRoma(data, ora);

/* ---------- gli emulatori (come in ascolti.prova.js) ---------- */
function portaAperta(porta) {
    return new Promise(r => {
        const s = net.connect(porta, '127.0.0.1');
        s.on('connect', () => { s.destroy(); r(true); });
        s.on('error', () => r(false));
    });
}
async function assicuraEmulatori() {
    if (await portaAperta(PORTA_FS) && await portaAperta(PORTA_AUTH)) return null;
    const cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'ngb-programmate-'));
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
    await new Promise((ok, ko) => {
        const limite = setTimeout(() => ko(new Error('emulatori non pronti in 120 s')), 120000);
        const leggi = d => { if (/All emulators ready/.test(String(d))) { clearTimeout(limite); ok(); } };
        figlio.stdout.on('data', leggi);
        figlio.stderr.on('data', d => { if (/Error:/.test(String(d))) process.stderr.write(d); });
        figlio.on('exit', c => { clearTimeout(limite); ko(new Error('emulatori usciti (' + c + ')')); });
    });
    logVero('(emulatori avviati dalla prova: firestore ' + PORTA_FS + ', auth ' + PORTA_AUTH + ')');
    return figlio;
}
function fermaEmulatori(figlio) {
    if (!figlio) return Promise.resolve();
    return new Promise(r => {
        const forza = setTimeout(() => { try { figlio.kill('SIGKILL'); } catch (_) { /* gia' fermo */ } r(); }, 20000);
        figlio.on('exit', () => { clearTimeout(forza); r(); });
        figlio.kill('SIGINT');
    });
}
async function svuota() {
    const r = await Promise.all([
        fetch('http://127.0.0.1:' + PORTA_FS + '/emulator/v1/projects/' + PROGETTO + '/databases/(default)/documents', { method: 'DELETE' }),
        fetch('http://127.0.0.1:' + PORTA_AUTH + '/emulator/v1/projects/' + PROGETTO + '/accounts', { method: 'DELETE' })
    ]);
    if (r.some(x => !x.ok)) throw new Error('svuotamento degli emulatori non riuscito');
}

/* ---------- la gestione, come la chiama Vercel ---------- */
function rispostaFinta() {
    const res = { codice: 0, corpo: null, intestazioni: {} };
    res.setHeader = (k, v) => { res.intestazioni[String(k).toLowerCase()] = v; };
    res.status = c => { res.codice = c; return res; };
    res.json = d => { res.corpo = d; return res; };
    res.end = () => res;
    return res;
}
async function chiamaGestione(token, corpo) {
    const res = rispostaFinta();
    await gestione({ method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, token ? { authorization: 'Bearer ' + token } : {}), body: corpo }, res);
    return res;
}
async function accedi(email, password) {
    const r = await fetch('http://127.0.0.1:' + PORTA_AUTH + '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=finta', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true })
    }).then(x => x.json());
    return r.idToken;
}

/* ---------- la posta finta ---------- */
function leggiPosta() {
    if (!fs.existsSync(POSTA)) return [];
    return fs.readFileSync(POSTA, 'utf8').split('\n').filter(Boolean).map(r => JSON.parse(r));
}
function uidDi(m) { return String((m.intestazioni || {})['X-Mailin-custom'] || '').split('|')[2] || ''; }
const dellaProgrammata = id => leggiPosta().filter(m => m.tipo === 'promemoria-x' + id);

/* ---------- eventi e persone ---------- */
async function creaEvento(id, titoloEvento, data, promemoria, inizioMs, fineMs) {
    const inizio = inizioMs != null ? inizioMs : roma(data, '09:00');
    const fine = fineMs != null ? fineMs : roma(data, '17:30');
    const ora = ctx.Timestamp.fromMillis(ctx.adesso());
    await ctx.db.collection('eventi').doc(id).set({
        titolo: titoloEvento, luogo: 'Napoli · Hotel Eurostars Excelsior', data: C.dataRoma(inizio), oraInizio: C.oraRoma(inizio), oraFine: C.oraRoma(fine),
        inizio: ctx.Timestamp.fromMillis(inizio), fine: ctx.Timestamp.fromMillis(fine),
        videoId: '', videoAggiornato: ora, stato: 'programmato', statoAggiornato: ora, programma: [],
        paginaEvento: '/napoli_ottobre_2026/', unSoloDispositivo: false, promemoria: promemoria, creato: ora, aggiornato: ora
    });
}
let contaPersone = 0;
async function persona(idEvento, nome, statoInvio, opz) {
    const o = opz || {};
    const uid = 'p' + (++contaPersone) + nome.toLowerCase() + 'x0000';
    const email = nome.toLowerCase() + '.' + idEvento.split('-')[0] + '@programmate.prova';
    const ora = ctx.Timestamp.fromMillis(ctx.adesso());
    const voce = { stato: statoInvio, aggiornato: ora };
    if (statoInvio === 'inviata') voce.inviata = ctx.Timestamp.fromMillis(o.inviata || roma('2026-09-27', '12:00'));
    await ctx.db.collection('partecipanti').doc(uid).set({
        uid: uid, nome: nome, cognome: 'Prova', email: email, emailNorm: email, azienda: 'Azienda', idEvento: idEvento,
        eventi: o.tolto ? [] : [idEvento], stato: o.disattivato ? 'disattivato' : 'attivo', authCreato: true,
        ultimoAccesso: o.entrato ? ctx.Timestamp.fromMillis(roma('2026-09-27', '18:00')) : null,
        invii: { [idEvento]: voce }, promemoria: {}, creato: ora, aggiornato: ora
    });
    await ctx.db.collection('indirizzi').doc(email).set({ uid: uid, creato: ora });
    return { uid, email, nome };
}
async function errore(promessa) {
    try { await promessa; return null; } catch (e) { return e; }
}
async function programmata(id) { return (await ctx.db.collection('programmate').doc(id).get()).data(); }
const TESTI = {
    oggetto: 'Il link della diretta', titolo: 'Ecco come collegarti',
    nota: 'Ciao a tutti & benvenuti, "ospiti" <di> Napoli.\nSecondo paragrafo: portate le domande!'
};
// TESTI.nota ha «<di>», che sembra un tag: serve a provare che si rifiuta. Quella buona e' questa
const NOTA_BUONA = 'Ciao a tutti & benvenuti, "ospiti" di Napoli.\nSecondo paragrafo: portate le domande!';

async function prova() {
    fs.mkdirSync(RISULTATI, { recursive: true });
    try { fs.unlinkSync(POSTA); } catch (_) { /* non c'era */ }

    /* ============================================================
       A. I TESTI
       ============================================================ */
    titolo('A. I testi del gestore');
    const t = (b) => { try { return P.testi(b); } catch (e) { return e; } };
    vero(t({ oggetto: '', titolo: 'x' }).codice === 'oggetto', 'oggetto vuoto: 400 oggetto');
    vero(t({ oggetto: 'x', titolo: '   ' }).codice === 'titolo', 'titolo vuoto: 400 titolo');
    vero(t({ oggetto: 'x'.repeat(121), titolo: 'x' }).codice === 'oggetto', 'oggetto di 121 caratteri: 400');
    vero(t({ oggetto: 'x', titolo: 'x'.repeat(81) }).codice === 'titolo', 'titolo di 81 caratteri: 400');
    vero(t({ oggetto: 'x', titolo: 'x', nota: 'a'.repeat(501) }).codice === 'nota', 'nota di 501 caratteri: 400');
    vero(!(t({ oggetto: 'x', titolo: 'x', nota: 'a'.repeat(500) }) instanceof Error), 'nota di 500 caratteri: va bene');
    vero(t({ oggetto: 'x', titolo: 'x', nota: Array.from({ length: 13 }, (_, i) => 'riga ' + i).join('\n') }).codice === 'nota', 'nota di 13 righe: 400');
    vero(t({ oggetto: 'x', titolo: 'x', nota: 'Ciao <b>a tutti</b>' }).codice === 'nota', 'HTML nella nota (<b>): 400');
    vero(t({ oggetto: 'x', titolo: 'x', nota: '<script>alert(1)</script>' }).codice === 'nota', 'HTML nella nota (<script>): 400');
    vero(t({ oggetto: 'Clicca <a href=x>qui</a>', titolo: 'x' }).codice === 'nota', 'HTML nell\'oggetto: 400');
    vero(t({ oggetto: 'x', titolo: 'x', nota: 'Entra da https://truffa.example/diretta' }).codice === 'nota', 'un collegamento https:// scritto a mano: 400');
    vero(t({ oggetto: 'x', titolo: 'x', nota: 'Vai su www.truffa.example' }).codice === 'nota', 'un collegamento www. scritto a mano: 400');
    vero(t({ oggetto: 'x', titolo: 'x', nota: 'javascript:alert(1)' }).codice === 'nota', 'javascript: nella nota: 400');
    const buoni = t({ oggetto: '  Il link   della diretta ', titolo: 'Ecco come collegarti', nota: 'Prima riga\r\n\r\n\r\n\r\nSeconda riga 3 < 5' });
    vero(buoni.oggetto === 'Il link della diretta' && buoni.nota === 'Prima riga\n\nSeconda riga 3 < 5',
        'spazi in piu\' tolti, righe vuote ridotte, "3 < 5" (non e\' HTML) resta', JSON.stringify(buoni));
    const mEsempio = M.promemoria({
        tipo: 'extra', oggetto: 'Oggetto', titolo: 'Titolo', nota: 'Uno & due "tre" 3 < 5\nSeconda',
        evento: { titolo: 'NGB Napoli', inizio: roma('2026-10-02', '09:00'), fine: roma('2026-10-02', '17:30') },
        idEvento: EV, nome: 'Mario', cognome: 'Rossi', email: 'mario@esempio.it', adesso: roma('2026-09-30', '18:00')
    });
    vero(mEsempio.html.indexOf('Uno &amp; due') >= 0 && mEsempio.html.indexOf('3 &lt; 5') >= 0 && mEsempio.html.indexOf('3 < 5') < 0,
        'nell\'HTML dell\'email la nota e\' testo: & e < escono come &amp; e &lt;');
    vero(/Uno & due "tre" 3 < 5\nSeconda/.test(mEsempio.testo), 'nel testo semplice la nota c\'e\' com\'e\', riga per riga');

    /* ============================================================
       B. PROGRAMMARE
       ============================================================ */
    titolo('B. Programmare, modificare, annullare');
    portaOra(roma('2026-09-28', '10:00'));
    await creaEvento(EV, 'NGB Napoli 2026', '2026-10-02', { giornoPrima: true, oraPrima: false });
    await creaEvento(EV_T, 'NGB Roma 2026', '2026-10-05', { giornoPrima: false, oraPrima: false });
    const P_EV = {};
    for (const n of ['Anna', 'Bruno', 'Carla', 'Dario', 'Elena', 'Fabio']) P_EV[n] = await persona(EV, n, 'inviata', { entrato: n === 'Anna' });
    P_EV.Gino = await persona(EV, 'Gino', 'inviata', { disattivato: true });
    P_EV.Ilaria = await persona(EV, 'Ilaria', 'da confermare');
    P_EV.Luca = await persona(EV, 'Luca', 'da inviare');
    P_EV.Marta = await persona(EV, 'Marta', 'respinta');
    P_EV.Nadia = await persona(EV, 'Nadia', 'inviata', { tolto: true });
    P_EV.Olga = await persona(EV, 'Olga', 'incerto');
    const P_T = [await persona(EV_T, 'Rita', 'inviata'), await persona(EV_T, 'Sara', 'inviata')];
    const G = GESTORE.email;
    const base = Object.assign({ idEvento: EV, destinatari: 'tutti' }, TESTI, { nota: NOTA_BUONA });

    let e = await errore(P.salva(ctx, Object.assign({}, base, { data: '2026-09-28', ora: '09:00' }), G));
    vero(e && e.stato === 400 && e.codice === 'quando', 'nel passato: 400 quando', e && e.message);
    e = await errore(P.salva(ctx, Object.assign({}, base, { data: '2026-10-02', ora: '18:00' }), G));
    vero(e && e.stato === 400 && e.codice === 'quando' && /dopo la fine/.test(e.message), 'dopo la fine dell\'evento: 400 quando', e && e.message);
    e = await errore(P.salva(ctx, Object.assign({}, base, { data: '2026-10-02', ora: '17:30' }), G));
    vero(e && e.codice === 'quando', 'proprio alla fine dell\'evento: 400');
    e = await errore(P.salva(ctx, Object.assign({}, base, { data: '2026-09-30', ora: '25:00' }), G));
    vero(e && e.codice === 'quando', 'ora non valida: 400');
    e = await errore(P.salva(ctx, Object.assign({}, base, { data: '2026-09-30', ora: '18:00', destinatari: 'da-confermare' }), G));
    vero(e && e.codice === 'destinatari', 'destinatari "da-confermare": 400 (non hanno una password)');
    e = await errore(P.salva(ctx, Object.assign({}, base, { data: '2026-09-30', ora: '18:00', nota: TESTI.nota }), G));
    vero(e && e.codice === 'nota', 'con "<di>" nella nota: 400 (sembra HTML)');
    e = await errore(P.salva(ctx, Object.assign({}, base, { idEvento: 'inesistente-2026', data: '2026-09-30', ora: '18:00' }), G));
    vero(e && e.stato === 404, 'evento inesistente: 404');
    vero((await ctx.db.collection('programmate').get()).empty, 'nessuna di queste ha scritto qualcosa');

    const s1 = await P.salva(ctx, Object.assign({}, base, { data: '2026-09-30', ora: '18:00' }), G);
    const pr1 = s1.programmata;
    vero(s1.persone === 6 && pr1.stato === 'programmata' && pr1.modificabile && !pr1.fermabile && pr1.creatoDa === G && pr1.quando === roma('2026-09-30', '18:00'),
        'programmato per il 30 settembre alle 18: 6 persone, modificabile, creato dal gestore', JSON.stringify(s1));
    let el = await P.elenco(ctx, EV);
    const aut = t2 => el.automatici.find(a => a.tipo === t2);
    vero(el.programmate.length === 1 && el.personeTutti === 6 && el.personeMaiEntrati === 5,
        'l\'elenco: 1 programmato; lo riceverebbero 6 persone (5 fra chi non e\' mai entrato)', JSON.stringify({ n: el.programmate.length, t: el.personeTutti, m: el.personeMaiEntrati }));
    vero(aut('giorno').attivo && aut('giorno').stato === 'programmata' && aut('giorno').persone === 6 && aut('giorno').da === roma('2026-10-01', '09:00')
        && !aut('ora').attivo && aut('ora').stato === 'spento',
        'l\'elenco: il promemoria automatico del giorno prima (dal 1 ottobre 9.00, 6 persone), quello dell\'ora prima spento', JSON.stringify(el.automatici));
    vero(el.coda.inCoda === 0 && el.iscrizioniAutomatiche === false && el.tettoGiorno === 0 && el.percentoProgrammate === 70,
        'l\'elenco: credenziali in coda 0, invio automatico dopo la conferma spento, tetto 0, quota 70%');

    let s = await P.salva(ctx, Object.assign({}, base, { id: pr1.id, data: '2026-09-30', ora: '18:30', destinatari: 'mai-entrati' }), 'altro@prova.it');
    vero(s.persone === 5 && s.programmata.destinatari === 'mai-entrati' && s.programmata.modifiche === 1 && s.programmata.modificatoDa === 'altro@prova.it',
        'modificato prima della partenza: 18.30, solo chi non e\' mai entrato (5), con chi l\'ha modificato');
    s = await P.salva(ctx, Object.assign({}, base, { id: pr1.id, data: '2026-09-30', ora: '18:00' }), G);
    vero(s.persone === 6 && s.programmata.modifiche === 2 && s.programmata.creatoDa === G, 'e rimesso com\'era: 18.00, tutti (6), 2 modifiche, chi l\'ha creato resta');
    e = await errore(P.salva(ctx, Object.assign({}, base, { id: pr1.id, idEvento: EV_T, data: '2026-09-30', ora: '18:00' }), G));
    vero(e && e.stato === 404, 'modificarlo passando un altro evento: 404');
    e = await errore(P.annulla(ctx, { idEvento: EV, id: '../../eventi/x' }, G));
    vero(e && e.stato === 400, 'annullare con un identificativo strano: 400');

    const altri = [];
    for (let i = 0; i < 9; i++) altri.push((await P.salva(ctx, Object.assign({}, base, { data: '2026-10-01', ora: '12:0' + i }), G)).programmata.id);
    e = await errore(P.salva(ctx, Object.assign({}, base, { data: '2026-10-01', ora: '13:00' }), G));
    vero(e && e.stato === 409 && e.codice === 'troppe', 'l\'undicesimo in programma: 409 (al massimo 10 per evento)');
    for (const id of altri) {
        const a = await P.annulla(ctx, { idEvento: EV, id: id }, 'altro@prova.it');
        if (a.programmata.stato !== 'annullata' || a.programmata.annullatoDa !== 'altro@prova.it') vero(false, 'annullato ' + id, JSON.stringify(a));
    }
    const annullati = await Promise.all(altri.map(programmata));
    vero(annullati.every(x => x.stato === 'annullata' && x.annullatoDa === 'altro@prova.it' && x.annullatoIl && !x.cominciato),
        'annullati i 9 in piu\': stato annullata, con chi e quando');
    e = await errore(P.annulla(ctx, { idEvento: EV, id: altri[0] }, G));
    vero(e && e.stato === 409, 'annullarlo di nuovo: 409');
    e = await errore(P.salva(ctx, Object.assign({}, base, { id: altri[0], data: '2026-10-01', ora: '12:00' }), G));
    vero(e && e.stato === 409 && e.codice === 'stato', 'modificare un annullato: 409');
    el = await P.elenco(ctx, EV);
    vero(el.programmate.length === 10 && el.programmate[0].id === pr1.id && el.programmate.filter(x => x.stato === 'annullata').length === 9,
        'l\'elenco in ordine di ora: il primo e\' quello delle 18.00 del 30, poi i 9 annullati');

    /* ============================================================
       C. IL CRON
       ============================================================ */
    titolo('C. Il lavoro programmato');
    portaOra(roma('2026-09-30', '17:50'));
    const Quinto = await persona(EV, 'Quinto', 'inviata', { inviata: roma('2026-09-30', '17:55') });
    let cron = await I.giroCron(ctx, { budgetMs: 60000 });
    vero(!cron.promemoria.some(r => r.programmata) && dellaProgrammata(pr1.id).length === 0, 'alle 17.50 non parte niente');
    const Pietro = await persona(EV, 'Pietro', 'inviata', { inviata: roma('2026-09-30', '18:01') });
    portaOra(roma('2026-09-30', '18:03'));
    el = await P.elenco(ctx, EV);
    const inAttesa = el.programmate.find(x => x.id === pr1.id);
    vero(inAttesa.stato === 'in-corso' && /prossimo giro/.test(inAttesa.motivo) && inAttesa.persone === 7,
        'alle 18.03, prima del giro: «in corso», parte al prossimo giro, 7 persone (Quinto si\', Pietro no: credenziali dopo le 18)', JSON.stringify(inAttesa));
    const [c1, c2] = await Promise.all([I.giroCron(ctx, { budgetMs: 60000 }), I.giroCron(ctx, { budgetMs: 60000 })]);
    const giri = c1.promemoria.concat(c2.promemoria).filter(r => r.programmata === pr1.id);
    const posta1 = dellaProgrammata(pr1.id);
    const perPersona = {};
    posta1.forEach(m => { perPersona[uidDi(m)] = (perPersona[uidDi(m)] || 0) + 1; });
    const attesi = ['Anna', 'Bruno', 'Carla', 'Dario', 'Elena', 'Fabio'].map(n => P_EV[n].uid).concat([Quinto.uid]);
    vero(posta1.length === 7 && attesi.every(u => perPersona[u] === 1), 'due giri insieme: 7 email, una per persona', JSON.stringify(perPersona));
    vero(giri.reduce((n, r) => n + r.inviate, 0) === 7, 'i giri contano 7 inviate in tutto (' + giri.length + ' giri sulla programmata)');
    const esclusi = ['Gino', 'Ilaria', 'Luca', 'Marta', 'Nadia', 'Olga'].map(n => P_EV[n].uid).concat([Pietro.uid]);
    vero(esclusi.every(u => !perPersona[u]), 'nessuna email a disattivati, «da confermare», «da inviare», «respinta», tolti dall\'evento, «incerto», e a chi ha avuto le credenziali dopo le 18');
    vero(!leggiPosta().some(m => P_T.some(p => p.email === m.a)), 'nessuna email alle persone dell\'altro evento');
    const m1 = posta1.find(m => uidDi(m) === P_EV.Bruno.uid);
    vero(m1.oggetto === 'Il link della diretta - NGB Napoli 2026' && m1.a === P_EV.Bruno.email, 'l\'oggetto del gestore, con il nome dell\'evento; all\'indirizzo della persona', m1.oggetto);
    vero(m1.testo.indexOf('ECCO COME COLLEGARTI') >= 0 && m1.testo.indexOf('Gentile Bruno Prova,') >= 0
        && m1.testo.indexOf('Ciao a tutti & benvenuti, "ospiti" di Napoli.\nSecondo paragrafo: portate le domande!') >= 0,
        'il titolo del gestore, il saluto con il nome, la nota riga per riga');
    vero(/Accedi alla diretta: \S+\/diretta\/\?e=napoli-2026/.test(m1.testo) && /href="[^"]*\/diretta\/\?e=napoli-2026"/.test(m1.html) && m1.html.indexOf('Accedi alla diretta') >= 0,
        'il pulsante «Accedi alla diretta» con il collegamento dell\'evento (anche per esteso nel testo)');
    vero(/Non trovi la password\? Usa «Password dimenticata\?» nella pagina di accesso: \S+dimenticata=1/.test(m1.testo) && /La tua email: bruno\.napoli@programmate\.prova/.test(m1.testo),
        '«Non trovi la password? Usa «Password dimenticata?»» con il collegamento, e la sua email');
    vero(m1.html.indexOf('Ciao a tutti &amp; benvenuti, &quot;ospiti&quot; di Napoli.') >= 0, 'nell\'HTML la nota e\' testo (& e " come &amp; e &quot;)');
    vero(posta1.every(m => !/Password:\s*\S/.test(m.testo) && !/password: \S{8,}/i.test(m.testo)), 'nessuna email contiene una password');
    vero(/Spam|spam/.test(m1.testo) && /assistenza|Assistenza|scrivi/.test(m1.testo), 'l\'assistenza e la frase dello Spam');
    let doc1 = await programmata(pr1.id);
    vero(doc1.stato === 'partita' && doc1.finito === true && doc1.inviate === 7 && doc1.respinte === 0 && doc1.cominciato > 0 && doc1.ultimoGiro > 0,
        'il registro: partita, 7 inviate, cominciato e ultimo giro', JSON.stringify(doc1));
    const segno = (await ctx.db.collection('partecipanti').doc(P_EV.Bruno.uid).get()).data().promemoria[EV]['x' + pr1.id];
    vero(segno && typeof segno.toMillis === 'function', 'sul profilo: promemoria.' + EV + '.x<id> con l\'orario dell\'invio');
    el = await P.elenco(ctx, EV);
    const dopo1 = el.programmate.find(x => x.id === pr1.id);
    vero(dopo1.stato === 'partita' && dopo1.inviate === 7 && !dopo1.modificabile && !dopo1.fermabile && dopo1.persone == null, 'l\'elenco: partito, 7 inviate, niente modifica ne\' stop');
    e = await errore(P.salva(ctx, Object.assign({}, base, { id: pr1.id, data: '2026-10-01', ora: '10:00' }), G));
    vero(e && e.stato === 409, 'modificare un promemoria partito: 409');
    e = await errore(P.annulla(ctx, { idEvento: EV, id: pr1.id }, G));
    vero(e && e.stato === 409, 'annullare un promemoria partito: 409');
    cron = await I.giroCron(ctx, { budgetMs: 60000 });
    vero(!cron.promemoria.some(r => r.programmata === pr1.id) && dellaProgrammata(pr1.id).length === 7, 'il giro dopo non lo riprende: sempre 7 email');
    numeri.primo = { inviate: 7, esclusi: esclusi.length };

    /* ============================================================
       D. IL TETTO DEL GIORNO E LO STOP
       ============================================================ */
    titolo('D. Il tetto del giorno, fermare a meta\'');
    // l'automatico del giorno prima si spegne: qui conta solo il programmato
    await ctx.db.collection('eventi').doc(EV).update({ promemoria: { giornoPrima: false, oraPrima: false } });
    const pr2 = (await P.salva(ctx, Object.assign({}, base, { oggetto: 'Secondo promemoria', data: '2026-10-01', ora: '10:00' }), G)).programmata;
    process.env.DIRETTA_MAX_GIORNO = '10';
    portaOra(roma('2026-10-01', '10:02'));
    await ctx.db.collection('contatori').doc(I.chiaveGiorno(ctx)).set({ inviate: 5, aggiornato: ctx.adesso() });
    el = await P.elenco(ctx, EV);
    vero(el.tettoGiorno === 10 && el.inviateOggi === 5, 'l\'elenco dice il tetto del giorno (10) e le email di oggi (5)');
    cron = await I.giroCron(ctx, { budgetMs: 60000 });
    const g2 = cron.promemoria.find(r => r.programmata === pr2.id);
    vero(g2 && g2.inviate === 2 && g2.limiteGiorno && !g2.finito, 'tetto 10, gia\' 5 email oggi: il programmato si ferma al 70% (2 email), limiteGiorno', JSON.stringify(g2));
    let doc2 = await programmata(pr2.id);
    vero(doc2.stato === 'programmata' && doc2.cominciato > 0 && doc2.inviate === 2 && !doc2.finito, 'il registro: cominciato, 2 inviate, non finito');
    const prova1 = await errore(I.inviaProva(ctx, { a: GESTORE.email, idEvento: EV, tipo: 'credenziali' }));
    const contatore = (await ctx.db.collection('contatori').doc(I.chiaveGiorno(ctx)).get()).data().inviate;
    vero(!prova1 && contatore === 8, 'le credenziali passano ancora (lo spazio oltre il 70% e\' loro): contatore a 8', prova1 && prova1.message);
    el = await P.elenco(ctx, EV);
    const in2 = el.programmate.find(x => x.id === pr2.id);
    // alle 10 del 1 ottobre anche Pietro (credenziali del 30 alle 18.01) e' fra i destinatari: 8 in tutto
    vero(in2.stato === 'in-corso' && in2.fermabile && !in2.modificabile && in2.inviate === 2 && in2.persone === 6,
        'l\'elenco: in corso, si puo\' solo fermare; 2 inviate, 6 ancora da raggiungere (8 in tutto, Pietro compreso)', JSON.stringify(in2));
    e = await errore(P.salva(ctx, Object.assign({}, base, { id: pr2.id, data: '2026-10-01', ora: '11:00' }), G));
    vero(e && e.stato === 409 && e.codice === 'cominciato', 'modificarlo a meta\': 409 cominciato (si puo\' solo fermare)');
    const f2 = await P.annulla(ctx, { idEvento: EV, id: pr2.id }, G);
    vero(f2.programmata.stato === 'fermata' && f2.programmata.annullatoDa === G, 'fermato: stato fermata, con chi');
    process.env.DIRETTA_MAX_GIORNO = '0';
    portaOra(roma('2026-10-02', '07:00'));
    cron = await I.giroCron(ctx, { budgetMs: 60000 });
    vero(!cron.promemoria.some(r => r.programmata === pr2.id) && dellaProgrammata(pr2.id).length === 2, 'il giorno dopo non riparte: sempre 2 email');
    doc2 = await programmata(pr2.id);
    vero(doc2.stato === 'fermata' && doc2.inviate === 2, 'il registro resta: fermata, 2 inviate');

    // un giro in corso si ferma al lotto dopo
    const pr3 = (await P.salva(ctx, Object.assign({}, base, { oggetto: 'Terzo promemoria', data: '2026-10-02', ora: '07:05' }), G)).programmata;
    portaOra(roma('2026-10-02', '07:06'));
    Object.assign(process.env, { DIRETTA_MAX_LOTTO: '2', DIRETTA_CONCORRENZA: '1', DIRETTA_POSTA_RITARDO_MS: '400' });
    const giroLento = I.giroCron(ctx, { budgetMs: 60000 });
    for (let i = 0; i < 100 && dellaProgrammata(pr3.id).length < 1; i++) await pausa(50);
    const f3 = await P.annulla(ctx, { idEvento: EV, id: pr3.id }, G);
    const c3 = await giroLento;
    Object.assign(process.env, { DIRETTA_MAX_LOTTO: '40', DIRETTA_CONCORRENZA: '4' });
    delete process.env.DIRETTA_POSTA_RITARDO_MS;
    const g3 = c3.promemoria.find(r => r.programmata === pr3.id);
    const n3 = dellaProgrammata(pr3.id).length;
    const doc3 = await programmata(pr3.id);
    vero(f3.programmata.stato === 'fermata' && g3 && g3.fermato && n3 >= 1 && n3 <= 2 && doc3.inviate === n3 && doc3.stato === 'fermata',
        'fermato durante il giro: il giro si ferma al lotto dopo (' + n3 + ' email su 8), il registro conta ' + doc3.inviate, JSON.stringify({ g3, n3, stato: doc3.stato }));

    /* ============================================================
       E. SOLO CHI NON E' MAI ENTRATO
       ============================================================ */
    titolo('E. Solo chi non e\' mai entrato');
    const pr4 = (await P.salva(ctx, Object.assign({}, base, { oggetto: 'Non sei ancora entrato', data: '2026-10-02', ora: '07:30', destinatari: 'mai-entrati' }), G)).programmata;
    vero(pr4.persone === 7, 'lo riceveranno 7 persone (8 con le credenziali, meno Anna che e\' gia\' entrata)', String(pr4.persone));
    portaOra(roma('2026-10-02', '07:31'));
    await I.giroCron(ctx, { budgetMs: 60000 });
    const posta4 = dellaProgrammata(pr4.id);
    vero(posta4.length === 7 && !posta4.some(m => uidDi(m) === P_EV.Anna.uid), '7 email, nessuna ad Anna');
    vero((await programmata(pr4.id)).stato === 'partita', 'e il registro dice partita');

    /* ============================================================
       F. EVENTO TERMINATO O FINITO
       ============================================================ */
    titolo('F. Evento terminato o finito');
    const pr5 = (await P.salva(ctx, Object.assign({}, base, { idEvento: EV_T, data: '2026-10-02', ora: '08:00' }), G)).programmata;
    vero(pr5.persone === 2, 'a Roma lo riceverebbero 2 persone');
    await ctx.db.collection('eventi').doc(EV_T).update({ stato: 'terminato' });
    portaOra(roma('2026-10-02', '08:05'));
    cron = await I.giroCron(ctx, { budgetMs: 60000 });
    vero(!cron.promemoria.some(r => r.programmata === pr5.id) && dellaProgrammata(pr5.id).length === 0, 'evento terminato: non parte');
    el = await P.elenco(ctx, EV_T);
    const t5 = el.programmate.find(x => x.id === pr5.id);
    vero(t5.stato === 'non-partira' && /terminato/.test(t5.motivo) && !t5.modificabile && !t5.fermabile, 'l\'elenco: «non partirà», l\'evento è terminato', JSON.stringify(t5));
    e = await errore(P.salva(ctx, Object.assign({}, base, { idEvento: EV_T, data: '2026-10-03', ora: '08:00' }), G));
    vero(e && e.stato === 409 && e.codice === 'terminato', 'programmarne un altro a evento terminato: 409');
    portaOra(roma('2026-10-02', '18:00'));
    e = await errore(P.salva(ctx, Object.assign({}, base, { data: '2026-10-02', ora: '18:10' }), G));
    vero(e && e.stato === 409 && e.codice === 'finito', 'a evento finito: 409');

    /* ============================================================
       G. L'ANTEPRIMA E LA PROVA A ME
       ============================================================ */
    titolo('G. Anteprima e prova al gestore');
    portaOra(roma('2026-09-30', '12:00'));
    const ant = await P.anteprima(ctx, Object.assign({}, base, { data: '2026-09-30', ora: '18:00' }));
    vero(ant.oggetto === 'Il link della diretta - NGB Napoli 2026' && ant.testo.indexOf('Gentile Mario Rossi,') >= 0 && ant.testo.indexOf('Secondo paragrafo') >= 0
        && /Accedi alla diretta: \S+\/diretta\/\?e=napoli-2026/.test(ant.testo) && /Password dimenticata\?/.test(ant.testo) && !/Password:\s*\S/.test(ant.testo) && ant.html === undefined,
        'l\'anteprima: oggetto, «Gentile Mario Rossi», la nota, il pulsante, «Password dimenticata?», nessuna password, solo testo');
    e = await errore(P.anteprima(ctx, Object.assign({}, base, { nota: '<img src=x onerror=alert(1)>' })));
    vero(e && e.codice === 'nota', 'l\'anteprima con HTML nella nota: 400');
    const primaProva = leggiPosta().length;
    const pv = await P.prova(ctx, Object.assign({}, base, { data: '2026-09-30', ora: '18:00' }), GESTORE.email);
    const mp = leggiPosta().slice(primaProva);
    vero(pv.ok && mp.length === 1 && mp[0].a === GESTORE.email && /^\[PROVA\] Il link della diretta - /.test(mp[0].oggetto)
        && /^EMAIL DI PROVA/.test(mp[0].testo) && mp[0].testo.indexOf('Secondo paragrafo') >= 0 && mp[0].tipo === 'prova-promemoria-extra',
        'la prova arriva solo al gestore: [PROVA], «EMAIL DI PROVA», la nota', JSON.stringify(mp.map(m => [m.a, m.oggetto])));

    /* ============================================================
       H. LE AZIONI DELLA GESTIONE (orologio vero)
       ============================================================ */
    titolo('H. Le azioni di api/diretta-gestione.js');
    const oraVera = Date.now();
    await creaEvento(EV_API, 'NGB Prova API', null, { giornoPrima: false, oraPrima: false }, oraVera + 3 * 24 * 3600e3, oraVera + 3 * 24 * 3600e3 + 8 * 3600e3);
    const utente = await ctx.auth.createUser({ email: GESTORE.email, password: GESTORE.password, emailVerified: true });
    await ctx.auth.setCustomUserClaims(utente.uid, { gestore: true });
    const tokG = await accedi(GESTORE.email, GESTORE.password);
    await ctx.auth.createUser({ email: 'curioso@prova.it', password: 'Curioso-della-prova-1', emailVerified: true });
    const tokP = await accedi('curioso@prova.it', 'Curioso-della-prova-1');
    let r = await chiamaGestione(null, { azione: 'programmate', idEvento: EV_API });
    vero(r.codice === 401, 'senza accesso: 401', r.codice);
    r = await chiamaGestione(tokP, { azione: 'programmate', idEvento: EV_API });
    vero(r.codice === 403, 'un account che non e\' gestore: 403', r.codice);
    r = await chiamaGestione(tokP, { azione: 'programmata-salva', idEvento: EV_API, data: C.dataRoma(oraVera + 2 * 24 * 3600e3), ora: '10:00', oggetto: 'x', titolo: 'x' });
    vero(r.codice === 403 && (await ctx.db.collection('programmate').where('idEvento', '==', EV_API).get()).empty, 'un non gestore non programma niente: 403');
    r = await chiamaGestione(tokG, { azione: 'programmate', idEvento: EV_API });
    vero(r.codice === 200 && r.corpo.ok && Array.isArray(r.corpo.programmate) && r.corpo.automatici.length === 2 && r.intestazioni['cache-control'] === 'no-store',
        'il gestore: 200 con l\'elenco (automatici e programmate), no-store', r.codice + ' ' + JSON.stringify(r.corpo).slice(0, 300));
    r = await chiamaGestione(tokG, { azione: 'programmata-anteprima', idEvento: EV_API, oggetto: 'Ciao', titolo: 'Titolo', nota: 'Una nota' });
    vero(r.codice === 200 && r.corpo.oggetto === 'Ciao - NGB Prova API' && /Una nota/.test(r.corpo.testo), 'anteprima: 200');
    r = await chiamaGestione(tokG, { azione: 'programmata-salva', idEvento: EV_API, data: C.dataRoma(oraVera + 2 * 24 * 3600e3), ora: '10:00', oggetto: 'Ciao', titolo: 'Titolo', nota: '<b>x</b>' });
    vero(r.codice === 400 && r.corpo.codice === 'nota', 'programmare con HTML nella nota: 400 nota', r.codice + ' ' + JSON.stringify(r.corpo));
    r = await chiamaGestione(tokG, { azione: 'programmata-salva', idEvento: EV_API, data: C.dataRoma(oraVera + 2 * 24 * 3600e3), ora: '10:00', destinatari: 'tutti', oggetto: 'Ciao', titolo: 'Titolo', nota: 'Una nota' });
    vero(r.codice === 200 && r.corpo.programmata && r.corpo.programmata.creatoDa === GESTORE.email && r.corpo.persone === 0, 'programmare: 200, creato dal gestore (dal token, non dal corpo)', JSON.stringify(r.corpo).slice(0, 300));
    const idApi = r.corpo.programmata && r.corpo.programmata.id;
    r = await chiamaGestione(tokG, { azione: 'programmata-annulla', idEvento: EV_API, id: idApi });
    vero(r.codice === 200 && r.corpo.programmata.stato === 'annullata' && r.corpo.programmata.annullatoDa === GESTORE.email, 'annullare: 200, annullata dal gestore');

    /* ============================================================
       I. I LOG
       ============================================================ */
    titolo('I. I log');
    const logProg = righeLog.filter(x => /diretta-programmate/.test(x));
    vero(logProg.length >= 5, 'il servizio registra programmati, modifiche, annullati e giri (' + logProg.length + ' righe)');
    const conTesti = righeLog.filter(x => /@|benvenuti|Il link della diretta|Secondo paragrafo|Non sei ancora entrato/.test(x) && /diretta-programmate/.test(x));
    vero(conTesti.length === 0, 'nei log dei promemoria programmati niente indirizzi e niente testi del gestore', conTesti.slice(0, 3).join('\n'));
    const conNota = righeLog.filter(x => /benvenuti|Secondo paragrafo/.test(x));
    vero(conNota.length === 0, 'in nessun log del servizio c\'e\' la nota', conNota.slice(0, 3).join('\n'));
    numeri.email = leggiPosta().length;
}

(async () => {
    let emulatori = null;
    const t = Date.now();
    try {
        emulatori = await assicuraEmulatori();
        await svuota();
        await prova();
    } catch (e) {
        rossi++;
        erroreVero('\nROSSO la prova si e\' interrotta: ' + (e && e.stack || e));
    } finally {
        console.log = logVero;
        console.error = erroreVero;
        numeri.secondiTotali = (Date.now() - t) / 1000;
        numeri.verdi = verdi;
        numeri.rossi = rossi;
        try {
            fs.mkdirSync(RISULTATI, { recursive: true });
            fs.writeFileSync(path.join(RISULTATI, 'programmate.json'), JSON.stringify(Object.assign({ quando: new Date().toISOString() }, numeri), null, 2));
        } catch (_) { /* i numeri sono anche qui sotto */ }
        logVero('\n' + verdi + ' verdi, ' + rossi + ' rossi');
        await fermaEmulatori(emulatori);
        process.exit(rossi ? 1 : 0);
    }
})();
