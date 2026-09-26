/* ============================================================
   PROVE - la coda delle email: mille credenziali, al massimo una
   volta ciascuna (lib/diretta-invio.js, api/diretta-cron.js)
   ------------------------------------------------------------
       node diretta/prove/coda.prova.js [--firestore 8280] [--auth 9280]
                                        [--persone 1000]

   Se gli emulatori non rispondono gia' su quelle porte, la prova li
   avvia da sola (avvia-emulatori.js) e li ferma alla fine. Niente
   SMTP: la posta finta scrive ogni email in
   risultati/coda-posta.jsonl, e da li' si contano.

   IL COPIONE, come nella realta' ma con i guai messi apposta:
     A. 1000 partecipanti creati direttamente con firebase-admin
        (account Auth + documenti come nel contratto), piu' qualcuno
        disattivato o senza account: "Invia a tutti" li salta.
     B. due giri avviati nello STESSO istante: il lucchetto ne fa
        passare uno solo.
     C. un giro UCCISO a meta' (kill -9 di un processo figlio mentre
        cinque email sono "in volo"): le cinque persone restano in
        'invio'; il lucchetto del morto scade da solo.
     D. Brevo rifiuta il login (EAUTH, prima del DATA): il lotto si
        ferma, le persone restano 'in coda', code/{id}.bloccato dice
        perche', e i clic a mano non martellano il server.
     E. due giri INSIEME senza lucchetto: bastano le transazioni.
     F. il cron, dieci minuti dopo: le cinque diventano 'incerto' e
        NON si rispediscono; un gestore tolto dall'elenco perde
        l'accesso.
     G. "Reinvia a chi non l'ha ricevuta": solo respinte ed errori di
        chi non e' mai entrato; mai gli incerti.
     H. conti finali: ogni persona ha ricevuto AL MASSIMO una email di
        credenziali (con «scrivi la tua email <email> e questa
        password», mai un nome utente), e 20 password prese dalla posta
        funzionano davvero (Identity Toolkit REST sull'emulatore); due
        "Reinvia" premuti insieme = una email sola; il reinvio dice che
        la password di prima non vale piu'. UNA PASSWORD PER PERSONA:
        chi ha gia' le credenziali di Napoli e viene aggiunto a Roma
        riceve «Sei iscritto anche a...» SENZA password (quella di
        Napoli continua a valere); chi aggiunto a Roma non aveva mai
        ricevuto una password riceve le credenziali; il "Reinvia" del
        gestore manda sempre una password.
     M. l'invio SUBITO (inviaSubito, quello delle iscrizioni dal modulo
        del sito) insieme a un giro della coda e a un secondo invio
        subito: una email sola; con Brevo che rifiuta il login la
        persona resta 'in coda' e la manda il cron dopo.
     I. tetto giornaliero (statoCoda: limiteRaggiunto, rimasteOggi);
        rimbalzi letti da un Brevo finto (con cache; esitiDisponibili):
        solo i rifiuti permanenti, un softBounce non cambia lo stato.
     L. indirizzi scritti con uno spazio invisibile U+200B, uno spazio
        in mezzo, un apostrofo: validi per il caricamento, quindi anche
        per l'invio, e le email vanno all'indirizzo normalizzato.
     J. promemoria del giorno prima e dell'ora prima con l'orologio
        spostato (ctx.adesso): partono una volta sola, senza password,
        solo sugli eventi dove sono attivi, e SOLO a chi ha le
        credenziali 'inviata' e l'account attivo (mai a 'da inviare',
        'respinta', 'incerto' o disattivati); statoCoda dice prima
        quante persone li riceveranno (destinatariPromemoria), anche
        con un giro rimasto a meta'.
     K. la funzione api/diretta-cron.js: 401 senza il segreto, 200 con.
   Stampa i numeri (inviate, respinte, errori, incerti, doppioni,
   tempo) e li scrive in risultati/coda.json. Esce con 1 se rosso.
   ============================================================ */
'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

function argomento(nome, predefinito) {
    const i = process.argv.indexOf('--' + nome);
    return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : predefinito;
}
const FIGLIO = process.argv.indexOf('--figlio') >= 0;
const PORTA_FS = Number(argomento('firestore', 8280));
const PORTA_AUTH = Number(argomento('auth', 9280));
const PERSONE = Number(argomento('persone', 1000));
const PROGETTO = 'demo-ngb-eventi';
const RADICE = path.resolve(__dirname, '../..');
const RISULTATI = path.resolve(__dirname, 'risultati');
const POSTA = path.join(RISULTATI, 'coda-posta.jsonl');
const EVENTO = 'napoli-2026';
const EVENTO_SENZA = 'roma-2026';      // promemoria spenti
const EVENTO_TETTO = 'tetto-2026';     // per il tetto giornaliero
const EVENTO_INCERTO = 'incerto-2026'; // per la connessione che cade dopo l'invio
// le frasi dell'email per chi aveva gia' una password (D14)
const FRASE_D14 = 'Questa email sostituisce le precedenti: la password che avevi ricevuto prima non è più valida.';
const FRASE_ANCHE = 'entra con la tua email e la password che hai già; se non la ricordi usa "Password dimenticata?"';
const SEGRETO_CRON = 'segreto-della-prova-coda';

/* ---------- l'ambiente, PRIMA di caricare il servizio ---------- */
const RIFIUTATI = [3, 77, 150, 222, 301, 404, 505, 606, 707, 808].filter(i => i < PERSONE).map(i => indirizzo(i));
const ERRORE_MESSAGGIO = [11, 111, 911].filter(i => i < PERSONE).map(i => indirizzo(i));
Object.assign(process.env, {
    DIRETTA_EMULATORE: '1',
    DIRETTA_PROGETTO: PROGETTO,
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:' + PORTA_FS,
    FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:' + PORTA_AUTH,
    DIRETTA_POSTA_FINTA: POSTA,
    DIRETTA_ADMIN_EMAILS: 'gestore@prova.it',
    DIRETTA_MAX_GIORNO: '0',
    DIRETTA_MAX_LOTTO: process.env.DIRETTA_MAX_LOTTO || '40',
    DIRETTA_CONCORRENZA: process.env.DIRETTA_CONCORRENZA || '4',
    DIRETTA_PAUSA_MS: process.env.DIRETTA_PAUSA_MS || '0',
    CRON_SECRET: SEGRETO_CRON
});
delete process.env.APP_BASE_URL;
delete process.env.BREVO_API_KEY;
delete process.env.DIRETTA_POSTA_ERRORE_ACCOUNT;
if (!FIGLIO) {
    // il figlio riceve le sue variabili dal genitore (ritardo compreso): non si toccano
    process.env.DIRETTA_POSTA_RIFIUTA = RIFIUTATI.join(',');
    process.env.DIRETTA_POSTA_ERRORE_MESSAGGIO = ERRORE_MESSAGGIO.join(',');
    delete process.env.DIRETTA_POSTA_INCERTA;
    delete process.env.DIRETTA_POSTA_RITARDO_MS;
}

const { contesto } = require(path.join(RADICE, 'email-service/lib/diretta-firebase'));
const invio = require(path.join(RADICE, 'email-service/lib/diretta-invio'));
const C = require(path.join(RADICE, 'email-service/lib/diretta-comune'));
const EM = require(path.join(RADICE, 'email-service/lib/diretta-email'));
const { passwordSegreta } = require(path.join(RADICE, 'email-service/lib/diretta-password'));
const I = invio._interni;

function indirizzo(i) { return 'persona' + i + '@coda.prova'; }
const pausa = ms => new Promise(r => setTimeout(r, ms));

/* ============================================================
   IL FIGLIO: un giro della coda che verra' ucciso a meta'
   ============================================================ */
if (FIGLIO) {
    (async () => {
        const ctx = contesto();
        console.log('FIGLIO PARTITO');
        await invio.avanzaCoda(ctx, { idEvento: EVENTO, budgetMs: 120000 });
        console.log('FIGLIO FINITO (non doveva arrivare qui)');
        process.exit(0);
    })().catch(e => { console.error('figlio:', e.message); process.exit(1); });
    return;
}

/* ============================================================
   IL GENITORE: la prova
   ============================================================ */
let rossi = 0, verdi = 0;
function vero(cond, descrizione, dettaglio) {
    if (cond) { verdi++; console.log('  ok  ' + descrizione); }
    else { rossi++; console.log('ROSSO ' + descrizione + (dettaglio ? '\n       ' + dettaglio : '')); }
}
function titolo(t) { console.log('\n== ' + t); }

// l'orologio della prova: il servizio legge l'ora da ctx.adesso()
let spostamento = 0;
const ctx = contesto();
ctx.adesso = () => Date.now() + spostamento;
function portaOra(ms) { spostamento = ms - Date.now(); }
function avanti(ms) { spostamento += ms; }

let emulatori = null, figlio = null, brevoFinto = null;

async function risponde(porta) {
    try { await fetch('http://127.0.0.1:' + porta + '/', { signal: AbortSignal.timeout(2000) }); return true; } catch (_) { return false; }
}
async function avviaEmulatori() {
    if (await risponde(PORTA_FS) && await risponde(PORTA_AUTH)) { console.log('Emulatori gia\' attivi su ' + PORTA_FS + '/' + PORTA_AUTH); return; }
    console.log('Avvio degli emulatori su ' + PORTA_FS + '/' + PORTA_AUTH + '...');
    emulatori = spawn(process.execPath, [path.join(__dirname, 'avvia-emulatori.js'), '--firestore', String(PORTA_FS), '--auth', String(PORTA_AUTH)], { stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((ok, ko) => {
        const t = setTimeout(() => ko(new Error('emulatori non pronti in 150 s')), 150000);
        emulatori.stdout.on('data', d => { if (/EMULATORI PRONTI/.test(String(d))) { clearTimeout(t); ok(); } });
        emulatori.stderr.on('data', d => process.stderr.write(d));
        emulatori.on('exit', c => { clearTimeout(t); ko(new Error('emulatori usciti (' + c + ')')); });
    });
}
async function fermaTutto() {
    if (figlio && figlio.exitCode == null) { try { figlio.kill('SIGKILL'); } catch (_) { /* gia' fermo */ } }
    if (brevoFinto) await new Promise(r => brevoFinto.close(r));
    if (emulatori && emulatori.exitCode == null) {
        const uscito = new Promise(r => emulatori.once('exit', r));
        emulatori.kill('SIGINT');
        await Promise.race([uscito, pausa(20000)]);
        if (emulatori.exitCode == null) emulatori.kill('SIGKILL');
    }
}
async function svuota() {
    const r1 = await fetch('http://127.0.0.1:' + PORTA_FS + '/emulator/v1/projects/' + PROGETTO + '/databases/(default)/documents', { method: 'DELETE' });
    const r2 = await fetch('http://127.0.0.1:' + PORTA_AUTH + '/emulator/v1/projects/' + PROGETTO + '/accounts', { method: 'DELETE' });
    if (!r1.ok || !r2.ok) throw new Error('emulatori non svuotati');
}

/* ---------- la posta finta ---------- */
function leggiPosta() {
    if (!fs.existsSync(POSTA)) return [];
    return fs.readFileSync(POSTA, 'utf8').split('\n').filter(Boolean).map(r => JSON.parse(r));
}
function righePosta() {
    if (!fs.existsSync(POSTA)) return 0;
    const b = fs.readFileSync(POSTA);
    let n = 0;
    for (let i = 0; i < b.length; i++) if (b[i] === 10) n++;
    return n;
}
function uidDi(m) { return String((m.intestazioni || {})['X-Mailin-custom'] || '').split('|')[2] || ''; }
function eventoDi(m) { return String((m.intestazioni || {})['X-Mailin-custom'] || '').split('|')[1] || ''; }
function passwordDi(m) { return ((/\nPassword: (\S+)\n/.exec(m.testo || '')) || [])[1] || ''; }
function perUid(tipo, idEvento) {
    const conti = {};
    leggiPosta().filter(m => m.tipo === tipo && (!idEvento || eventoDi(m) === idEvento)).forEach(m => {
        const u = uidDi(m);
        (conti[u] = conti[u] || []).push(m);
    });
    return conti;
}

/* ---------- lettura dello stato ---------- */
async function stati(idEvento) { return (await invio.statoCoda(ctx, { idEvento })).conteggi; }
async function conStato(idEvento, stato) {
    const s = await ctx.db.collection('partecipanti').where(new ctx.FieldPath('invii', idEvento, 'stato'), '==', stato).get();
    return s.docs;
}
async function coda(idEvento) {
    const s = await ctx.db.collection('code').doc(idEvento).get();
    return s.exists ? s.data() : {};
}
async function finoAllaFine(idEvento, etichetta, budgetMs) {
    const tot = { inviate: 0, respinte: 0, errori: 0, incerti: 0, giri: 0 };
    for (let g = 0; g < 200; g++) {
        const r = await invio.avanzaCoda(ctx, { idEvento, budgetMs: budgetMs || 30000 });
        tot.giri++;
        ['inviate', 'respinte', 'errori', 'incerti'].forEach(k => { tot[k] += r[k] || 0; });
        if (r.occupato || r.inPausa) throw new Error(etichetta + ': coda occupata o in pausa (' + JSON.stringify(r) + ')');
        if (r.bloccato) throw new Error(etichetta + ': coda bloccata: ' + r.bloccato);
        if (r.finito) return tot;
    }
    throw new Error(etichetta + ': la coda non finisce');
}

/* ---------- la preparazione: eventi e persone ---------- */
const NOMI = ['Mario', 'Anna', 'Giuseppe', 'Maria', 'Luca', 'Giulia', 'Nicolò', 'Francesca', 'Paolo', 'Chiara', 'Anna Maria', 'Marco'];
const COGNOMI = ['Rossi', 'Bianchi', 'D\'Angelo', 'De Luca', 'Esposito', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco', 'Bruno', 'Gallo'];
async function creaEvento(id, titoloEvento, data, promemoria) {
    const inizio = C.istanteRoma(data, '09:00');
    const fine = C.istanteRoma(data, '17:30');
    const ora = ctx.Timestamp.fromMillis(ctx.adesso());
    await ctx.db.collection('eventi').doc(id).set({
        titolo: titoloEvento, luogo: 'Napoli · Hotel Eurostars Excelsior', data: data, oraInizio: '09:00', oraFine: '17:30',
        inizio: ctx.Timestamp.fromMillis(inizio), fine: ctx.Timestamp.fromMillis(fine),
        videoId: '', videoAggiornato: ora, stato: 'programmato', statoAggiornato: ora,
        programma: [{ ora: '09.00', titolo: 'Accoglienza e registrazione' }, { ora: '09.30', titolo: 'Apertura dei lavori' }],
        paginaEvento: '/napoli_ottobre_2026/', unSoloDispositivo: false, promemoria: promemoria, creato: ora, aggiornato: ora
    });
}
async function creaPersone(idEvento, da, quante, opz) {
    opz = opz || {};
    const persone = [];
    for (let i = da; i < da + quante; i++) {
        const nome = NOMI[i % NOMI.length];
        const cognome = COGNOMI[Math.floor(i / NOMI.length) % COGNOMI.length];
        persone.push({
            i: i, uid: 'p' + require('crypto').randomBytes(10).toString('hex'),
            nome: nome, cognome: cognome,
            email: opz.email ? opz.email(i - da) : (i % 9 === 0 ? ' Persona' + i + '@Coda.Prova ' : indirizzo(i)).trim(),
            disattivato: (opz.disattivati || []).indexOf(i) >= 0,
            senzaAccount: (opz.senzaAccount || []).indexOf(i) >= 0
        });
    }
    // gli account Auth, a blocchi di 1000 (importUsers), con l'email tecnica dell'uid (D1)
    const conAccount = persone.filter(p => !p.senzaAccount);
    for (const gruppo of C.aGruppi(conAccount, 1000)) {
        const r = await ctx.auth.importUsers(gruppo.map(p => ({
            uid: p.uid, email: C.emailTecnica(p.uid), displayName: p.nome + ' ' + p.cognome,
            disabled: p.disattivato, customClaims: { eventi: [idEvento] }
        })));
        if (r.failureCount) throw new Error('importUsers: ' + r.failureCount + ' falliti');
    }
    // i documenti, a blocchi di 300 scritture (3 per persona: niente nomi utente)
    const ora = ctx.Timestamp.fromMillis(ctx.adesso());
    for (const gruppo of C.aGruppi(persone, 100)) {
        const b = ctx.db.batch();
        gruppo.forEach(p => {
            const emailNorm = EM.normalizzaEmail(p.email);
            b.set(ctx.db.collection('partecipanti').doc(p.uid), {
                uid: p.uid, nome: p.nome, cognome: p.cognome, email: p.email, emailNorm: emailNorm,
                azienda: 'Azienda ' + (p.i % 37), idEvento: idEvento, eventi: [idEvento],
                stato: p.disattivato ? 'disattivato' : 'attivo', authCreato: !p.senzaAccount, ultimoAccesso: null,
                invii: { [idEvento]: { stato: 'da inviare', aggiornato: ora, tentativi: 0 } }, promemoria: {},
                creato: ora, aggiornato: ora
            });
            b.set(ctx.db.collection('indirizzi').doc(emailNorm), { uid: p.uid, creato: ora });
            b.set(ctx.db.collection('sessioni').doc(p.uid), { stato: p.disattivato ? 'disattivato' : 'attivo', sessioneAttiva: null, aggiornato: ora });
        });
        await b.commit();
    }
    return persone;
}

/* ============================================================
   0. la lettura degli errori (senza emulatore)
   ============================================================ */
function erroreFinto(messaggio, codice, risposta, comando) {
    const e = new Error(messaggio + (risposta ? ': ' + risposta : ''));
    e.code = codice;
    if (risposta) { e.response = risposta; e.responseCode = Number(/^\d+/.exec(risposta)[0]); }
    if (comando) e.command = comando;
    return e;
}
function provaClassifica() {
    titolo('0. Come si legge un errore del server di posta');
    const k = e => I.classifica(e);
    let r = k(erroreFinto('Invalid login', 'EAUTH', '535 5.7.8 Error: authentication failed', 'AUTH PLAIN'));
    vero(r.stato === 'in coda' && r.ferma, 'login rifiutato (EAUTH): torna in coda e il lotto si ferma');
    r = k(erroreFinto('Recipient command failed', 'EENVELOPE', '550 5.1.1 <x@y.it>: User unknown', 'RCPT TO'));
    vero(r.stato === 'respinta' && !r.ferma, '550 sul destinatario: respinta, il lotto continua');
    r = k(erroreFinto('Recipient command failed', 'EENVELOPE', '450 4.2.0 greylisted, try later', 'RCPT TO'));
    vero(r.stato === 'in coda' && r.ferma && r.destinatario, '450 sul destinatario: rimandata (con il contatore dei rimandi)');
    r = k(erroreFinto('Mail command failed', 'EENVELOPE', '421 4.7.0 Too many messages, slow down', 'MAIL FROM'));
    vero(r.stato === 'in coda' && r.ferma, '421 troppi invii: torna in coda, lotto fermo');
    r = k(erroreFinto('Mail command failed', 'EENVELOPE', '550 5.7.1 Sender address not verified', 'MAIL FROM'));
    vero(r.stato === 'in coda' && r.ferma, 'mittente rifiutato (prima del DATA, uguale per tutti): lotto fermo, nessuno bruciato');
    r = k(erroreFinto('Message failed', 'EMESSAGE', '554 5.6.0 Message rejected', 'DATA'));
    vero(r.stato === 'errore' && !r.ferma, '554 dopo il DATA: errore certo (il server ha detto no)');
    const timeout = new Error('Timeout'); timeout.code = 'ETIMEDOUT'; timeout.command = 'CONN';
    r = k(timeout);
    vero(r.stato === 'incerto' && r.ferma, 'tempo scaduto a connessione aperta: INCERTO (forse partita), mai in coda');
    const chiusa = new Error('Connection closed unexpectedly'); chiusa.code = 'ECONNECTION'; chiusa.command = 'CONN';
    vero(k(chiusa).stato === 'incerto', 'connessione chiusa a meta\': incerto');
    const rifiutata = new Error('connect ECONNREFUSED 1.2.3.4:465'); rifiutata.code = 'ESOCKET'; rifiutata.command = 'CONN';
    r = k(rifiutata);
    vero(r.stato === 'in coda' && r.ferma, 'server irraggiungibile: in coda e lotto fermo (non si brucia la lista)');
    const collegamento = new Error('Connection timeout'); collegamento.code = 'ETIMEDOUT'; collegamento.command = 'CONN';
    vero(k(collegamento).stato === 'in coda', 'connessione mai aperta (Connection timeout): in coda');
    vero(I.mascheraEmail('550 <mario.rossi@gmail.com>: rifiutata') === '550 <***@gmail.com>: rifiutata', 'nei log l\'indirizzo si maschera (resta il dominio)');
    // le finestre dei promemoria
    const inizio = C.istanteRoma('2026-10-02', '09:00'), fine = C.istanteRoma('2026-10-02', '17:30');
    const ev = p => ({ inizio: ctx.Timestamp.fromMillis(inizio), fine: ctx.Timestamp.fromMillis(fine), stato: 'programmato', promemoria: p });
    const H = 3600e3;
    vero(I.promemoriaDovuti(ev({ giornoPrima: true, oraPrima: true }), inizio - 25 * H).length === 0, 'promemoria: 25 ore prima, niente');
    vero(I.promemoriaDovuti(ev({ giornoPrima: true, oraPrima: true }), inizio - 23 * H).join() === 'giorno', 'promemoria: 23 ore prima, quello del giorno prima');
    vero(I.promemoriaDovuti(ev({ giornoPrima: true, oraPrima: true }), inizio - 0.5 * H).join() === 'ora', 'promemoria: mezz\'ora prima, solo quello dell\'ora prima (mai due insieme)');
    vero(I.promemoriaDovuti(ev({ giornoPrima: true, oraPrima: false }), inizio - 0.5 * H).join() === 'giorno', 'promemoria: senza l\'ora prima, quello del giorno vale fino all\'inizio');
    vero(I.promemoriaDovuti(ev({ giornoPrima: false, oraPrima: false }), inizio - 0.5 * H).length === 0, 'promemoria spenti: niente');
    vero(I.promemoriaDovuti(Object.assign(ev({ giornoPrima: true, oraPrima: true }), { stato: 'terminato' }), inizio - 0.5 * H).length === 0, 'evento terminato: niente');
    vero(I.promemoriaDovuti(ev({ giornoPrima: true, oraPrima: true }), inizio - 0.5 * H, { ora: { finito: true } }).length === 0, 'promemoria gia\' finito: non si rilegge nessuno');
}

/* ============================================================
   LA PROVA CON L'EMULATORE
   ============================================================ */
const numeri = {};
async function prova() {
    provaClassifica();
    await avviaEmulatori();
    await svuota();
    fs.mkdirSync(RISULTATI, { recursive: true });
    fs.writeFileSync(POSTA, '');

    /* ---------- A ---------- */
    titolo('A. ' + PERSONE + ' partecipanti, "Invia a tutti"');
    let t = Date.now();
    await creaEvento(EVENTO, 'Next Generation Business 2026 · Napoli', '2026-10-02', { giornoPrima: false, oraPrima: false });
    await creaEvento(EVENTO_SENZA, 'Next Generation Business 2026 · Roma', '2026-10-02', { giornoPrima: false, oraPrima: false });
    const DISATTIVATI = [5, 55, 555, 600, 999].filter(i => i < PERSONE);
    const SENZA_ACCOUNT = [7, 70, 700].filter(i => i < PERSONE);
    const persone = await creaPersone(EVENTO, 0, PERSONE, { disattivati: DISATTIVATI, senzaAccount: SENZA_ACCOUNT });
    const personeRoma = await creaPersone(EVENTO_SENZA, 100000, 20);
    const perIndice = {};
    persone.forEach(p => { perIndice[p.i] = p; });
    numeri.preparazioneSecondi = (Date.now() - t) / 1000;
    console.log('  preparati ' + persone.length + ' + ' + personeRoma.length + ' partecipanti in ' + numeri.preparazioneSecondi.toFixed(1) + ' s');
    const attesi = PERSONE - DISATTIVATI.length - SENZA_ACCOUNT.length;
    const a = await invio.accoda(ctx, { idEvento: EVENTO, chi: 'da-inviare' });
    vero(a.accodate === attesi && a.saltate === DISATTIVATI.length + SENZA_ACCOUNT.length, 'accodate ' + a.accodate + ' (attese ' + attesi + '), saltati disattivati e senza account: ' + a.saltate);
    const a2 = await invio.accoda(ctx, { idEvento: EVENTO, chi: 'da-inviare' });
    vero(a2.accodate === 0, 'premere di nuovo "Invia a tutti" non accoda niente in piu\'');
    let s = await stati(EVENTO);
    vero(s['in coda'] === attesi && s['da inviare'] === DISATTIVATI.length + SENZA_ACCOUNT.length, 'conteggi: in coda ' + s['in coda'] + ', da inviare ' + s['da inviare']);
    vero((await coda(EVENTO)).attiva === true, 'code/' + EVENTO + '.attiva = true');
    const inizioInvii = Date.now();

    /* ---------- B ---------- */
    titolo('B. Due giri avviati nello stesso istante');
    const [g1, g2] = await Promise.all([
        invio.avanzaCoda(ctx, { idEvento: EVENTO, budgetMs: 6000 }),
        invio.avanzaCoda(ctx, { idEvento: EVENTO, budgetMs: 6000 })
    ]);
    vero((g1.occupato ? 1 : 0) + (g2.occupato ? 1 : 0) === 1, 'uno dei due trova il lucchetto chiuso (occupato)');
    const lavorato = g1.occupato ? g2 : g1;
    vero(lavorato.inviate > 0 && !lavorato.bloccato, 'l\'altro spedisce: ' + lavorato.inviate + ' inviate, ' + lavorato.respinte + ' respinte');
    vero(!(await coda(EVENTO)).lucchettoFino, 'alla fine del giro il lucchetto si libera');

    /* ---------- C ---------- */
    titolo('C. Un giro ucciso a meta\' (kill -9 con cinque email in volo)');
    const righePrima = righePosta();
    figlio = spawn(process.execPath, [__filename, '--figlio', '--firestore', String(PORTA_FS), '--auth', String(PORTA_AUTH)], {
        env: Object.assign({}, process.env, { DIRETTA_CONCORRENZA: '5', DIRETTA_POSTA_RITARDO_MS: '120000', DIRETTA_POSTA_RIFIUTA: '', DIRETTA_POSTA_ERRORE_MESSAGGIO: '', DIRETTA_POSTA_INCERTA: '' }),
        stdio: ['ignore', 'pipe', 'pipe']
    });
    figlio.stderr.on('data', d => process.stderr.write('[figlio] ' + d));
    let inVolo = [];
    for (let k = 0; k < 300; k++) {
        await pausa(200);
        inVolo = await conStato(EVENTO, 'invio');
        if (inVolo.length >= 5 && righePosta() >= righePrima + 5) break;
    }
    figlio.kill('SIGKILL');
    await new Promise(r => figlio.exitCode != null ? r() : figlio.once('exit', r));
    inVolo = await conStato(EVENTO, 'invio');
    const uccisi = inVolo.map(d => d.id);
    vero(uccisi.length === 5, 'dopo il kill restano ' + uccisi.length + ' persone in "invio"');
    vero(righePosta() === righePrima + 5, 'le loro 5 email erano gia\' partite (scritte nella posta finta) ma nessuno l\'ha registrato');
    const cMorto = await coda(EVENTO);
    vero((cMorto.lucchettoFino || 0) > ctx.adesso(), 'il lucchetto del processo morto e\' ancora chiuso');
    const occ = await invio.avanzaCoda(ctx, { idEvento: EVENTO, budgetMs: 3000 });
    vero(occ.occupato === true && occ.inviate === 0, 'un nuovo giro subito dopo aspetta (occupato)');
    avanti(2 * 60 * 1000);
    const dopo = await invio.avanzaCoda(ctx, { idEvento: EVENTO, budgetMs: 4000 });
    vero(!dopo.occupato && dopo.inviate > 0, 'due minuti dopo il lucchetto e\' scaduto da solo: il giro riparte (' + dopo.inviate + ' inviate)');
    s = await stati(EVENTO);
    vero(s.invio === 5, 'le 5 persone del processo morto restano in "invio": nessuno le riprende');

    /* ---------- D ---------- */
    titolo('D. Brevo rifiuta il login (EAUTH): il lotto si ferma');
    const inCodaPrima = (await stati(EVENTO))['in coda'];
    const erroriPrima = (await stati(EVENTO)).errore;
    const righeD = righePosta();
    process.env.DIRETTA_POSTA_ERRORE_ACCOUNT = '1';
    const bl = await invio.avanzaCoda(ctx, { idEvento: EVENTO, budgetMs: 10000 });
    s = await stati(EVENTO);
    vero(!!bl.bloccato && /535|authentication/i.test(bl.bloccato) && bl.inviate === 0 && !bl.finito, 'il giro si ferma con il motivo: "' + String(bl.bloccato).slice(0, 60) + '"');
    vero(s['in coda'] === inCodaPrima && s.errore === erroriPrima, 'le persone restano "in coda" (' + s['in coda'] + '), nessuna segnata errore');
    const cBloccata = await coda(EVENTO);
    vero(cBloccata.bloccato && /535/.test(cBloccata.bloccato.motivo) && cBloccata.bloccato.quando > 0, 'code/' + EVENTO + '.bloccato valorizzato (motivo e quando)');
    vero(righePosta() === righeD, 'nessuna email partita durante il blocco');
    const subito = await invio.avanzaCoda(ctx, { idEvento: EVENTO, budgetMs: 5000 });
    vero(subito.inPausa === true && subito.bloccato, 'un clic a mano subito dopo non riprova (pausa di 2 minuti): niente login sbagliati a raffica');
    const statoBloccato = await invio.statoCoda(ctx, { idEvento: EVENTO });
    vero(statoBloccato.coda.bloccato && /535/.test(statoBloccato.coda.bloccato.motivo), 'statoCoda mostra il blocco al gestore');
    delete process.env.DIRETTA_POSTA_ERRORE_ACCOUNT;
    avanti(3 * 60 * 1000);

    /* ---------- E ---------- */
    titolo('E. Due giri INSIEME senza lucchetto: bastano le transazioni');
    let persi = 0, giriDoppi = 0;
    for (;;) {
        const [x, y] = await Promise.all([
            I.lavoraCoda(ctx, EVENTO, { budgetMs: 20000 }),
            I.lavoraCoda(ctx, EVENTO, { budgetMs: 20000 })
        ]);
        giriDoppi++;
        persi += x.persi + y.persi;
        if (x.bloccato || y.bloccato) throw new Error('giro doppio bloccato: ' + (x.bloccato || y.bloccato));
        if (x.esaurita && y.esaurita) break;
        if (giriDoppi > 100) throw new Error('i giri doppi non finiscono');
    }
    vero(persi > 0, 'i due giri si sono contesi le stesse persone ' + persi + ' volte: ogni volta ne ha vinto uno solo');
    const ultimo = await invio.avanzaCoda(ctx, { idEvento: EVENTO, budgetMs: 5000 });
    vero(ultimo.finito && ultimo.rimaste === 0 && !ultimo.bloccato, 'coda finita, blocco tolto');
    vero((await coda(EVENTO)).attiva === false && !(await coda(EVENTO)).bloccato, 'code/' + EVENTO + ': attiva false, bloccato null');
    numeri.secondiPerLeCredenziali = (Date.now() - inizioInvii) / 1000;

    /* ---------- F ---------- */
    titolo('F. Il cron dieci minuti dopo: gli "invio" diventano "incerto"');
    // un gestore ancora in elenco e uno tolto (D2)
    const gestore = await ctx.auth.createUser({ email: 'gestore@prova.it', emailVerified: true, password: passwordSegreta() });
    const exGestore = await ctx.auth.createUser({ email: 'ex@prova.it', emailVerified: true, password: passwordSegreta() });
    await ctx.auth.setCustomUserClaims(gestore.uid, { gestore: true });
    await ctx.auth.setCustomUserClaims(exGestore.uid, { gestore: true });
    await ctx.db.collection('gestoriAccount').doc(gestore.uid).set({ email: 'gestore@prova.it', aggiornato: ctx.adesso() });
    await ctx.db.collection('gestoriAccount').doc(exGestore.uid).set({ email: 'ex@prova.it', aggiornato: ctx.adesso() });
    const righeF = righePosta();
    // l'orario in cui il processo morto le aveva prese in carico
    const tInvio = Math.max.apply(null, (await conStato(EVENTO, 'invio')).map(d => d.data().invii[EVENTO].aggiornato.toMillis()));
    let gestoriTolti = 0;
    if (ctx.adesso() < tInvio + 9 * 60 * 1000) {
        portaOra(tInvio + 9 * 60 * 1000);
        const cron9 = await invio.giroCron(ctx, { budgetMs: 60000 });
        gestoriTolti += cron9.gestoriRimossi;
        vero(cron9.incerti === 0 && (await stati(EVENTO)).invio === 5, 'dopo 9 minuti il cron non tocca ancora gli "invio"');
    } else console.log('  (controllo dei 9 minuti saltato: l\'orologio della prova e\' gia\' oltre)');
    portaOra(Math.max(ctx.adesso(), tInvio + 11 * 60 * 1000));
    const cron = await invio.giroCron(ctx, { budgetMs: 60000 });
    vero(cron.incerti === 5, 'dopo piu\' di 10 minuti: ' + cron.incerti + ' persone passano a "incerto"');
    const incertiDocs = await conStato(EVENTO, 'incerto');
    const uccisiOra = incertiDocs.filter(d => uccisi.indexOf(d.id) >= 0);
    vero(uccisiOra.length === 5 && uccisiOra.every(d => /esito non certo/.test(d.data().invii[EVENTO].errore)), 'sono proprio le 5 del processo morto, con il motivo "esito non certo"');
    vero(righePosta() === righeF, 'il cron NON le ha rispedite (nessuna email nuova)');
    const cron2 = await invio.giroCron(ctx, { budgetMs: 60000 });
    vero(cron2.incerti === 0 && righePosta() === righeF, 'un altro giro del cron non cambia niente');
    gestoriTolti += cron.gestoriRimossi + cron2.gestoriRimossi;
    vero(gestoriTolti === 1, 'il cron ha tolto l\'accesso al gestore uscito dall\'elenco (una volta sola)');
    const ex = await ctx.auth.getUser(exGestore.uid);
    const ok = await ctx.auth.getUser(gestore.uid);
    vero(ex.disabled === true && !(ex.customClaims && ex.customClaims.gestore), 'ex gestore: account disattivato, claim gestore tolto');
    vero(!ok.disabled && ok.customClaims && ok.customClaims.gestore === true, 'il gestore in elenco resta com\'era');
    vero(!(await ctx.db.collection('gestoriAccount').doc(exGestore.uid).get()).exists, 'gestoriAccount dell\'ex gestore cancellato');
    const vuoto = await invio.giroCron(ctx, { budgetMs: 60000 });
    vero(vuoto.lavoro === false, 'senza niente da fare il cron esce subito (' + vuoto.durataMs + ' ms)');

    /* ---------- G ---------- */
    titolo('G. "Reinvia a chi non l\'ha ricevuta"');
    s = await stati(EVENTO);
    const respinte = await conStato(EVENTO, 'respinta');
    const errori = await conStato(EVENTO, 'errore');
    /* L'ordine della coda e' quello degli identificativi, che sono casuali:
       fra le 5 persone del processo ucciso (C) puo' capitare un indirizzo che
       il server rifiuta o che da' errore. Quelle restano giustamente
       "incerto" (l'email era partita, dal figlio che non rifiuta niente) e
       non diventano "respinta": si contano a parte. */
    const emailUccisi = (await Promise.all(uccisi.map(id => ctx.db.collection('partecipanti').doc(id).get())))
        .map(d => String((d.data() || {}).emailNorm || (d.data() || {}).email || '').toLowerCase());
    const attesiRespinti = RIFIUTATI.filter(e => emailUccisi.indexOf(e) < 0);
    const attesiErrori = ERRORE_MESSAGGIO.filter(e => emailUccisi.indexOf(e) < 0);
    const statiDi = async lista => (await Promise.all(lista.map(async e => {
        const q = await ctx.db.collection('partecipanti').where('emailNorm', '==', e).limit(1).get();
        const v = q.empty ? {} : ((q.docs[0].data().invii || {})[EVENTO] || {});
        return e + '=' + (v.stato || '?');
    }))).join(', ');
    vero(respinte.length === attesiRespinti.length,
        'respinte: ' + respinte.length + ' (gli indirizzi che il server rifiuta: ' + RIFIUTATI.length
        + (attesiRespinti.length < RIFIUTATI.length ? ', di cui ' + (RIFIUTATI.length - attesiRespinti.length) + ' fra i 5 del processo ucciso' : '') + ')',
        respinte.length === attesiRespinti.length ? '' : await statiDi(RIFIUTATI));
    vero(errori.length === attesiErrori.length,
        'errori: ' + errori.length + ' (554 dopo il DATA: ' + ERRORE_MESSAGGIO.length
        + (attesiErrori.length < ERRORE_MESSAGGIO.length ? ', di cui ' + (ERRORE_MESSAGGIO.length - attesiErrori.length) + ' fra i 5 del processo ucciso' : '') + ')',
        errori.length === attesiErrori.length ? '' : await statiDi(ERRORE_MESSAGGIO));
    vero(s.incerto === 5, 'incerti: ' + s.incerto + ' (i 5 del processo ucciso)');
    numeri.primoGiro = { inviate: s.inviata, respinte: respinte.length, errori: errori.length, incerti: s.incerto };
    // una delle respinte e' riuscita a entrare lo stesso (per esempio con l'aiuto dell'assistenza)
    const entrata = respinte[0];
    await entrata.ref.update({ ultimoAccesso: ctx.Timestamp.fromMillis(ctx.adesso()) });
    const nr = await invio.accoda(ctx, { idEvento: EVENTO, chi: 'non-ricevuta' });
    vero(nr.accodate === respinte.length + errori.length - 1, 'riaccodate ' + nr.accodate + ': respinte ed errori, tranne chi e\' entrato (' + (respinte.length + errori.length - 1) + ')');
    s = await stati(EVENTO);
    vero(s.incerto === 5 && (await coda(EVENTO)).attiva === true, 'gli incerti NON si riaccodano (' + s.incerto + ' restano incerti)');
    delete process.env.DIRETTA_POSTA_RIFIUTA;
    delete process.env.DIRETTA_POSTA_ERRORE_MESSAGGIO;
    const rec = await finoAllaFine(EVENTO, 'reinvio');
    vero(rec.inviate === nr.accodate, 'reinviate ' + rec.inviate + ' (ora gli indirizzi funzionano)');
    const entrataOra = (await entrata.ref.get()).data().invii[EVENTO].stato;
    vero(entrataOra === 'respinta', 'chi e\' entrato resta com\'era (respinta, niente email nuova)');

    /* ---------- H ---------- */
    titolo('H. I conti: al massimo una email di credenziali a testa');
    const posta = perUid('credenziali', EVENTO);
    const doppioni = Object.keys(posta).filter(u => posta[u].length > 1);
    numeri.doppioni = doppioni.length;
    vero(doppioni.length === 0, 'doppioni = ' + doppioni.length);
    const tuttiDocs = (await ctx.db.collection('partecipanti').where('eventi', 'array-contains', EVENTO).get()).docs;
    const perStato = {};
    tuttiDocs.forEach(d => { const st = d.data().invii[EVENTO].stato; (perStato[st] = perStato[st] || []).push(d); });
    vero((perStato.inviata || []).every(d => (posta[d.id] || []).length === 1), 'ogni "inviata" ha esattamente una email (' + (perStato.inviata || []).length + ')');
    vero((perStato.incerto || []).every(d => (posta[d.id] || []).length === 1), 'ogni "incerto" ha la sua email partita una volta sola, mai ripetuta');
    vero(!posta[entrata.id], 'la respinta entrata lo stesso non ha email accettate');
    vero(DISATTIVATI.concat(SENZA_ACCOUNT).every(i => !posta[perIndice[i].uid]), 'disattivati e senza account: nessuna email');
    const conDestinatario = tuttiDocs.filter(d => posta[d.id]).every(d => posta[d.id][0].a === String(d.data().email).trim().toLowerCase());
    vero(conDestinatario, 'ogni email e\' andata all\'indirizzo VERO della persona (non all\'email tecnica)');
    const primaEmail = posta[(perStato.inviata || [])[0].id][0];
    vero(/noreply@nextgenerationbusiness\.it/.test(primaEmail.intestazioni.from) && /Revilaw S\.p\.A\./.test(primaEmail.intestazioni.from), 'mittente "Revilaw S.p.A." <noreply@nextgenerationbusiness.it>');
    vero(primaEmail.intestazioni['reply-to'] === 'info@nextgenerationbusiness.it', 'Reply-To all\'assistenza');
    vero(/^diretta\|napoli-2026\|p[0-9a-f]{20}$/.test(primaEmail.intestazioni['X-Mailin-custom']), 'intestazione X-Mailin-custom: diretta|<idEvento>|<uid>');
    vero(primaEmail.html.indexOf('/diretta/?e=' + EVENTO + '"') >= 0 && primaEmail.testo.indexOf('/diretta/?e=' + EVENTO) >= 0,
        'il collegamento porta l\'evento, e mai l\'email: /diretta/?e=' + EVENTO + ' (R4)');
    const primaDati = (await ctx.db.collection('partecipanti').doc(uidDi(primaEmail)).get()).data();
    vero(primaEmail.testo.indexOf('scrivi la tua email ' + primaDati.emailNorm + ' e questa password: ' + passwordDi(primaEmail)) >= 0,
        'le credenziali dicono «scrivi la tua email ' + primaDati.emailNorm + ' e questa password: ...»');
    const conNomeUtente = leggiPosta().filter(m => /nome utente|nomeutente|[?&](amp;)?u=/i.test(m.oggetto + m.html + m.testo));
    vero(conNomeUtente.length === 0, 'in nessuna email della coda compare un "nome utente" (' + leggiPosta().length + ' email controllate)');
    vero((perStato.inviata || []).every(d => !/sostituisce le precedenti|altro evento/.test(posta[d.id][0].testo)), 'al primo invio nessuna email dice "sostituisce le precedenti"');
    // 20 password prese dalla posta: funzionano davvero
    const campione = (perStato.inviata || []).slice(0, 20);
    let funzionano = 0, formaOk = 0;
    const passwordViste = [];
    for (const d of campione) {
        const pw = passwordDi(posta[d.id][0]);
        passwordViste.push(pw);
        if (/^[A-HJ-NP-Za-km-np-z2-9]{10}$/.test(pw)) formaOk++;
        const r = await fetch('http://127.0.0.1:' + PORTA_AUTH + '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=finta', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email: C.emailTecnica(d.id), password: pw, returnSecureToken: true })
        });
        const j = await r.json();
        if (r.ok && j.localId === d.id && j.idToken) funzionano++;
    }
    vero(formaOk === campione.length, 'le password sono di 10 caratteri senza quelli che si confondono (' + formaOk + '/' + campione.length + ')');
    vero(funzionano === campione.length && campione.length === 20, 'le password lette dalla posta funzionano: ' + funzionano + '/20 accessi riusciti (Identity Toolkit REST)');
    const sbagliata = await fetch('http://127.0.0.1:' + PORTA_AUTH + '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=finta', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: C.emailTecnica(campione[0].id), password: passwordViste[1], returnSecureToken: true })
    });
    vero(!sbagliata.ok, 'la password di un altro non funziona');
    const scaricati = JSON.stringify((await ctx.db.collection('partecipanti').get()).docs.map(d => d.data()))
        + JSON.stringify((await ctx.db.collection('code').get()).docs.map(d => d.data()));
    vero(passwordViste.every(pw => scaricati.indexOf(pw) < 0), 'nessuna password in Firestore (partecipanti, code)');

    // due "Reinvia" premuti insieme per la stessa persona (a qualche minuto dal suo primo invio)
    avanti(2 * 60 * 1000);
    const scelta = campione[0];
    const vecchia = passwordViste[0];
    process.env.DIRETTA_POSTA_RITARDO_MS = '400';
    const doppio = await Promise.allSettled([
        invio.inviaCredenziali(ctx, { uid: scelta.id, idEvento: EVENTO }),
        invio.inviaCredenziali(ctx, { uid: scelta.id, idEvento: EVENTO })
    ]);
    delete process.env.DIRETTA_POSTA_RITARDO_MS;
    const riusciti = doppio.filter(x => x.status === 'fulfilled' && x.value.stato === 'inviata').length;
    const rifiutati = doppio.filter(x => x.status === 'rejected' && x.reason.stato === 409).length;
    vero(riusciti === 1 && rifiutati === 1, 'due "Reinvia" insieme (doppio clic): uno spedisce, l\'altro riceve 409 ('
        + doppio.map(x => x.status === 'fulfilled' ? x.value.stato : String(x.reason.message).slice(0, 40)).join(' / ') + ')');
    let subitoDopo = null;
    try { await invio.inviaCredenziali(ctx, { uid: scelta.id, idEvento: EVENTO }); } catch (e) { subitoDopo = e; }
    vero(subitoDopo && subitoDopo.stato === 409 && /meno di un minuto/.test(subitoDopo.message), 'un terzo clic pochi secondi dopo: 409 "inviate meno di un minuto fa"');
    const suePosta = perUid('credenziali', EVENTO)[scelta.id];
    vero(suePosta.length === 2, 'la persona ha ora 2 email: quella del primo invio e UNA di reinvio');
    vero(suePosta[1].testo.indexOf(FRASE_D14) >= 0 && suePosta[1].html.indexOf(FRASE_D14) >= 0 && suePosta[0].testo.indexOf(FRASE_D14) < 0,
        'il reinvio (stesso evento) dice "' + FRASE_D14 + '" (D14)');
    const accedi2 = async (uid, pw) => (await fetch('http://127.0.0.1:' + PORTA_AUTH + '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=finta', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: C.emailTecnica(uid), password: pw, returnSecureToken: true })
    })).ok;
    const accedi = pw => accedi2(scelta.id, pw);
    vero(!(await accedi(vecchia)) && await accedi(passwordDi(suePosta[1])), 'dopo il reinvio la vecchia password non funziona piu\', la nuova si\'');
    let nonIscritto = null;
    try { await invio.inviaCredenziali(ctx, { uid: personeRoma[0].uid, idEvento: EVENTO }); } catch (e) { nonIscritto = e; }
    vero(nonIscritto && nonIscritto.stato === 409, 'reinvio a chi non e\' iscritto all\'evento: 409, nessuna email');
    let disatt = null;
    try { await invio.inviaCredenziali(ctx, { uid: perIndice[DISATTIVATI[0]].uid, idEvento: EVENTO }); } catch (e) { disatt = e; }
    vero(disatt && disatt.stato === 409 && /disattivato/.test(disatt.message), 'reinvio a un account disattivato: 409 con il motivo');

    // le credenziali anche per Roma (serviranno ai promemoria), piu' una persona di Napoli aggiunta anche a Roma
    const multi = campione[1];
    await multi.ref.update(new ctx.FieldPath('eventi'), [EVENTO_SENZA, EVENTO],
        new ctx.FieldPath('invii', EVENTO_SENZA), { stato: 'da inviare', aggiornato: ctx.Timestamp.fromMillis(ctx.adesso()), tentativi: 0 });
    await ctx.auth.setCustomUserClaims(multi.id, { eventi: [EVENTO_SENZA, EVENTO] });
    await invio.accoda(ctx, { idEvento: EVENTO_SENZA, chi: 'da-inviare' });
    // e una persona di Roma che non ha mai ricevuto una password, gia' iscritta a un terzo evento mai spedito
    const senzaPw = personeRoma[1];
    await ctx.db.collection('partecipanti').doc(senzaPw.uid).update(new ctx.FieldPath('eventi'), [EVENTO_SENZA, 'mai-spedito-2026'],
        new ctx.FieldPath('invii', 'mai-spedito-2026'), { stato: 'da inviare', aggiornato: ctx.Timestamp.fromMillis(ctx.adesso()), tentativi: 0 });
    await invio.accoda(ctx, { idEvento: EVENTO_SENZA, chi: 'da-inviare' });
    const roma = await finoAllaFine(EVENTO_SENZA, 'roma');
    vero(roma.inviate === 21, 'Roma: 21 email inviate (20 + una persona di Napoli)');
    const postaMulti = perUid('credenziali', EVENTO_SENZA)[multi.id] || [];
    const ancheMulti = perUid('iscritto-anche', EVENTO_SENZA)[multi.id] || [];
    vero(postaMulti.length === 0 && ancheMulti.length === 1, 'chi aveva gia\' le credenziali di Napoli: NESSUNA password nuova per Roma, ma l\'avviso «Sei iscritto anche a...»');
    vero(ancheMulti.length === 1 && ancheMulti[0].testo.indexOf(FRASE_ANCHE) >= 0 && /^Sei iscritto anche a /.test(ancheMulti[0].oggetto)
        && !/Password:\s*\S/.test(ancheMulti[0].testo) && ancheMulti[0].html.indexOf(passwordViste[1]) < 0,
        '...«' + FRASE_ANCHE + '», senza password');
    vero(ancheMulti.length === 1 && ancheMulti[0].html.indexOf('/diretta/?e=' + EVENTO_SENZA + '"') >= 0, '...e il suo collegamento porta a Roma (?e=' + EVENTO_SENZA + ')');
    vero(await accedi2(multi.id, passwordViste[1]), '...e la password di Napoli continua a valere');
    const vMulti = (await multi.ref.get()).data().invii[EVENTO_SENZA];
    vero(vMulti.stato === 'inviata' && vMulti.tipo === 'anche', 'sulla voce di Roma: inviata, tipo "anche" (riceve i promemoria come gli altri)');
    const credSenzaPw = perUid('credenziali', EVENTO_SENZA)[senzaPw.uid] || [];
    vero(credSenzaPw.length === 1 && /^[A-HJ-NP-Za-km-np-z2-9]{10}$/.test(passwordDi(credSenzaPw[0])) && !(perUid('iscritto-anche', EVENTO_SENZA)[senzaPw.uid]),
        'chi era iscritto anche a un altro evento ma non aveva MAI ricevuto una password: riceve le credenziali');
    vero((await ctx.db.collection('partecipanti').doc(senzaPw.uid).get()).data().invii[EVENTO_SENZA].tipo === 'credenziali', '...e sulla voce resta tipo "credenziali"');
    // il "Reinvia" del gestore manda sempre una password, anche a chi aveva avuto l'avviso «anche»
    avanti(2 * 60 * 1000);
    const reMulti = await invio.inviaCredenziali(ctx, { uid: multi.id, idEvento: EVENTO_SENZA });
    const credReMulti = perUid('credenziali', EVENTO_SENZA)[multi.id] || [];
    vero(reMulti.stato === 'inviata' && credReMulti.length === 1 && credReMulti[0].testo.indexOf(FRASE_D14) >= 0,
        '"Reinvia" del gestore a chi aveva l\'avviso «anche»: le credenziali con una password nuova (e la nota che la vecchia non vale piu\')');
    vero(!(await accedi2(multi.id, passwordViste[1])) && await accedi2(multi.id, passwordDi(credReMulti[0])), '...la password di prima non vale piu\', quella nuova si\'');
    vero((await multi.ref.get()).data().invii[EVENTO_SENZA].tipo === 'credenziali', '...e la voce di Roma torna tipo "credenziali"');

    /* ---------- I ---------- */
    titolo('I. Tetto giornaliero e rimbalzi letti da Brevo');
    await creaEvento(EVENTO_TETTO, 'Prova del tetto', '2026-11-20', { giornoPrima: false, oraPrima: false });
    await creaPersone(EVENTO_TETTO, 200000, 6);
    await invio.accoda(ctx, { idEvento: EVENTO_TETTO, chi: 'da-inviare' });
    process.env.DIRETTA_MAX_GIORNO = '3';
    const tetto = await invio.avanzaCoda(ctx, { idEvento: EVENTO_TETTO, budgetMs: 10000 });
    vero(tetto.inviate === 3 && tetto.limiteGiorno === true && tetto.rimaste === 3, 'con DIRETTA_MAX_GIORNO=3: 3 inviate, 3 restano in coda');
    const st = await invio.statoCoda(ctx, { idEvento: EVENTO_TETTO });
    vero(st.coda.tettoGiorno === 3 && st.coda.inviateOggi === 3, 'statoCoda: tetto 3, inviate oggi 3');
    vero(st.limiteRaggiunto === true && st.rimasteOggi === 3, 'statoCoda: limiteRaggiunto, e le 3 rimaste partono domani (rimasteOggi = 3) (R13)');
    const resetBloccato = await invio.inviaReimpostazione(ctx, { a: 'qualcuno@coda.prova', nome: 'Qualcuno', link: C.baseSito() + '/diretta/reimposta.html?oobCode=abc' });
    vero(resetBloccato.ok === false && /tetto/.test(resetBloccato.motivo), 'le reimpostazioni si fermano all\'80% del tetto (per non togliere posto alle credenziali)');
    process.env.DIRETTA_MAX_GIORNO = '0';
    const restoTetto = await finoAllaFine(EVENTO_TETTO, 'tetto');
    vero(restoTetto.inviate === 3, 'senza tetto partono le altre 3');
    const stLibero = await invio.statoCoda(ctx, { idEvento: EVENTO_TETTO });
    vero(stLibero.limiteRaggiunto === false && stLibero.rimasteOggi === 0, 'senza tetto: limiteRaggiunto false, rimasteOggi 0');
    const resetOk = await invio.inviaReimpostazione(ctx, { a: 'Qualcuno@Coda.Prova ', nome: 'Qualcuno', link: C.baseSito() + '/diretta/reimposta.html?oobCode=abc' });
    const ultimaReset = leggiPosta().filter(m => m.tipo === 'reimpostazione').pop();
    vero(resetOk.ok && ultimaReset && ultimaReset.a === 'qualcuno@coda.prova' && /reimposta\.html\?oobCode=abc"/.test(ultimaReset.html), 'reimpostazione: arriva all\'indirizzo vero con il collegamento');
    vero(ultimaReset && /La tua email: qualcuno@coda\.prova/.test(ultimaReset.testo), 'reimpostazione: ricorda l\'email con cui si entra');
    const resetCattivo = await invio.inviaReimpostazione(ctx, { a: 'qualcuno@coda.prova', nome: 'X', link: 'https://altrove.example/x' });
    vero(resetCattivo.ok === false, 'reimpostazione con un collegamento estraneo: non parte');

    // la connessione che cade DOPO che il messaggio e' partito: incerto, e il lotto si ferma
    await creaEvento(EVENTO_INCERTO, 'Prova incerto', '2026-11-21', { giornoPrima: false, oraPrima: false });
    const quattro = await creaPersone(EVENTO_INCERTO, 300000, 4);
    process.env.DIRETTA_POSTA_INCERTA = indirizzo(quattro[1].i);
    await invio.accoda(ctx, { idEvento: EVENTO_INCERTO, chi: 'da-inviare' });
    const inc = await invio.avanzaCoda(ctx, { idEvento: EVENTO_INCERTO, budgetMs: 10000 });
    delete process.env.DIRETTA_POSTA_INCERTA;
    vero(inc.incerti === 1 && inc.inviate === 3 && /Timeout/.test(inc.bloccato || ''), 'connessione caduta dopo l\'invio: 1 incerto (le altre 3 dello stesso gruppo inviate), lotto fermato');
    const statoInc = (await ctx.db.collection('partecipanti').doc(quattro[1].uid).get()).data().invii[EVENTO_INCERTO];
    vero(statoInc.stato === 'incerto' && (perUid('credenziali', EVENTO_INCERTO)[quattro[1].uid] || []).length === 1, 'la persona e\' "incerto" e la sua email e\' partita una volta');
    const incFine = await invio.avanzaCoda(ctx, { idEvento: EVENTO_INCERTO, budgetMs: 5000 });
    vero(incFine.finito && !incFine.bloccato && (perUid('credenziali', EVENTO_INCERTO)[quattro[1].uid] || []).length === 1, 'coda vuota: finita, blocco tolto, e l\'incerto non si rispedisce');

    /* il Brevo finto: due rimbalzi nuovi, uno vecchio, uno di un indirizzo che non e' della diretta;
       e due rifiuti TEMPORANEI (softBounce, casella piena) su credenziali gia' consegnate: uno lo
       darebbe la domanda "event=softBounces" (che il servizio non deve piu' fare), l'altro arriva
       mescolato nella risposta degli hardBounces. Nessuno dei due deve cambiare lo stato (T2, D14). */
    const inviateOra = await conStato(EVENTO, 'inviata');
    const rimbalzati = inviateOra.slice(0, 2).map(d => d.data().emailNorm);
    const vecchio = inviateOra[2].data().emailNorm;
    const soffice = inviateOra[3];
    const sofficeMescolato = inviateOra[4];
    let chiamateBrevo = 0;
    const tipiChiesti = new Set();
    brevoFinto = http.createServer((req, res) => {
        chiamateBrevo++;
        const u = new URL(req.url, 'http://x');
        res.setHeader('content-type', 'application/json');
        if (req.headers['api-key'] !== 'chiave-finta' || u.pathname !== '/v3/smtp/statistics/events') { res.statusCode = 401; res.end('{}'); return; }
        const tipo = u.searchParams.get('event');
        tipiChiesti.add(tipo);
        const adesso = new Date(ctx.adesso()).toISOString();
        if (tipo === 'softBounces') {
            res.end(JSON.stringify({ events: [{ email: soffice.data().emailNorm, date: adesso, event: 'softBounces', reason: 'mailbox full' }] }));
            return;
        }
        if (tipo !== 'hardBounces') { res.statusCode = 404; res.end('{"code":"not_found"}'); return; }
        res.end(JSON.stringify({ events: [
            { email: rimbalzati[0], date: adesso, event: 'hardBounces', reason: 'mailbox does not exist' },
            { email: rimbalzati[1].toUpperCase(), date: adesso, event: 'hardBounces', reason: '<b>user unknown</b>' },
            { email: vecchio, date: '2020-01-01T10:00:00.000+02:00', event: 'hardBounces', reason: 'vecchio' },
            { email: 'estraneo@altro-studio.it', date: adesso, event: 'hardBounces', reason: 'non nostro' },
            { email: sofficeMescolato.data().emailNorm, date: adesso, event: 'soft_bounce', reason: '452 mailbox full' }
        ] }));
    });
    await new Promise(r => brevoFinto.listen(0, '127.0.0.1', r));
    const senzaChiave = await invio.aggiornaEsiti(ctx, { idEvento: EVENTO });
    vero(senzaChiave.disponibile === false && senzaChiave.letto === false && chiamateBrevo === 0, 'senza BREVO_API_KEY: rimbalzi "non disponibili", nessuna chiamata');
    vero((await invio.statoCoda(ctx, { idEvento: EVENTO })).esitiDisponibili === false, 'senza BREVO_API_KEY: statoCoda.esitiDisponibili = false (R13)');
    process.env.BREVO_API_KEY = 'chiave-finta';
    process.env.DIRETTA_BREVO_API = 'http://127.0.0.1:' + brevoFinto.address().port + '/v3';
    vero((await invio.statoCoda(ctx, { idEvento: EVENTO })).esitiDisponibili === true, 'con BREVO_API_KEY: statoCoda.esitiDisponibili = true');
    const esiti = await invio.aggiornaEsiti(ctx, { idEvento: EVENTO });
    vero(esiti.letto && esiti.respinte === 2, 'rimbalzi letti: ' + esiti.respinte + ' persone passano a "respinta" (il rimbalzo vecchio non conta)');
    vero(!tipiChiesti.has('softBounces') && tipiChiesti.has('hardBounces'), 'a Brevo si chiedono solo i rifiuti permanenti: ' + Array.from(tipiChiesti).join(', ') + ' (niente softBounces)');
    const statoSoffice = (await soffice.ref.get()).data().invii[EVENTO];
    const statoMescolato = (await sofficeMescolato.ref.get()).data().invii[EVENTO];
    vero(statoSoffice.stato === 'inviata' && statoMescolato.stato === 'inviata',
        'un softBounce (casella piena) non cambia lo stato: le credenziali consegnate restano "inviata" (' + statoSoffice.stato + ', ' + statoMescolato.stato + ')');
    const r0 = (await ctx.db.collection('indirizzi').doc(rimbalzati[1]).get()).data().uid;
    const motivoR = (await ctx.db.collection('partecipanti').doc(r0).get()).data().invii[EVENTO];
    vero(motivoR.stato === 'respinta' && /Segnalata da Brevo/.test(motivoR.errore) && !/<b>/.test(motivoR.errore), 'il motivo arriva da Brevo, ripulito dai tag');
    const cache = (await ctx.db.collection('stato').doc('esitiBrevo').get()).data();
    vero(cache && cache.righe && !cache.righe['estraneo@altro-studio.it'] && cache.righe[rimbalzati[0]], 'la cache tiene solo gli indirizzi della diretta');
    const chiamatePrima = chiamateBrevo;
    const esiti2 = await invio.aggiornaEsiti(ctx, { idEvento: EVENTO });
    vero(chiamateBrevo === chiamatePrima && esiti2.respinte === 0, 'seconda lettura entro 10 minuti: dalla cache, nessuna chiamata a Brevo');
    delete process.env.BREVO_API_KEY;
    delete process.env.DIRETTA_BREVO_API;

    /* ---------- L ---------- */
    titolo('L. Indirizzi con spazi, caratteri invisibili e apostrofi: una sola regola per controllare e spedire');
    /* Profili caricati PRIMA che il caricamento salvasse l'indirizzo
       normalizzato: nel campo email c'e' ancora quello del file (uno
       spazio invisibile U+200B copiato da Excel, uno spazio in mezzo, un
       apostrofo, un BOM e un "word joiner"). Sono tutti validi per
       emailValida (quella del caricamento), e devono ricevere le
       credenziali all'indirizzo GIUSTO: niente U+200B che nodemailer
       trasformerebbe in un dominio punycode, niente "indirizzo non valido". */
    const EVENTO_INDIRIZZI = 'indirizzi-2026';
    const SCRITTI = ['Zeta.Invisibile@Coda.Prova​', 'luigi.verdi @coda.prova', 'n.d\'angelo@coda.prova', '﻿o⁠brien@coda.prova '];
    const GIUSTI = ['zeta.invisibile@coda.prova', 'luigi.verdi@coda.prova', 'n.d\'angelo@coda.prova', 'obrien@coda.prova'];
    await creaEvento(EVENTO_INDIRIZZI, 'Prova degli indirizzi', '2026-11-22', { giornoPrima: false, oraPrima: false });
    const strani = await creaPersone(EVENTO_INDIRIZZI, 500000, SCRITTI.length, { email: k => SCRITTI[k] });
    vero(strani.every((p, k) => p.email === SCRITTI[k]), 'profili con l\'email come era scritta nel file (U+200B compreso)');
    const accInd = await invio.accoda(ctx, { idEvento: EVENTO_INDIRIZZI, chi: 'da-inviare' });
    vero(accInd.accodate === SCRITTI.length && accInd.saltate === 0, 'accodate tutte e ' + accInd.accodate + ' (nessuna scartata come "indirizzo non valido")');
    const finInd = await finoAllaFine(EVENTO_INDIRIZZI, 'indirizzi');
    vero(finInd.inviate === SCRITTI.length && finInd.errori === 0, 'credenziali inviate: ' + finInd.inviate + ', errori: ' + finInd.errori);
    const postaInd = perUid('credenziali', EVENTO_INDIRIZZI);
    const arrivi = strani.map(p => ((postaInd[p.uid] || [])[0] || {}).a);
    vero(arrivi[0] === 'zeta.invisibile@coda.prova' && arrivi[0].indexOf('​') < 0,
        'l\'iscritto con lo spazio invisibile U+200B nell\'email riceve le credenziali all\'indirizzo giusto: ' + JSON.stringify(arrivi[0]));
    vero(JSON.stringify(arrivi) === JSON.stringify(GIUSTI), 'ognuno all\'indirizzo normalizzato: ' + arrivi.join(', '));
    vero(strani.every(p => (postaInd[p.uid] || []).length === 1), 'una email di credenziali a testa');
    const eventoInd = Object.assign({ id: EVENTO_INDIRIZZI }, (await ctx.db.collection('eventi').doc(EVENTO_INDIRIZZI).get()).data(), { promemoria: { giornoPrima: true, oraPrima: true } });
    const dpInd = await I.destinatariPromemoria(ctx, EVENTO_INDIRIZZI, eventoInd, SCRITTI.length, { promemoria: { giorno: { cominciato: ctx.adesso() } } });
    vero(dpInd.giorno === SCRITTI.length && dpInd.ora === SCRITTI.length, 'contati uno per uno, tutti riceverebbero i promemoria (giorno ' + dpInd.giorno + ', ora ' + dpInd.ora + ')');
    const resetInd = await invio.inviaReimpostazione(ctx, { a: SCRITTI[0], nome: 'Zeta', link: C.baseSito() + '/diretta/reimposta.html?oobCode=abc' });
    const ultimaResetInd = leggiPosta().filter(m => m.tipo === 'reimpostazione').pop();
    vero(resetInd.ok && ultimaResetInd.a === 'zeta.invisibile@coda.prova', 'anche la reimpostazione va all\'indirizzo normalizzato: ' + JSON.stringify(ultimaResetInd.a));

    /* ---------- M ---------- */
    titolo('M. L\'invio subito (le iscrizioni dal modulo del sito): una volta sola, e il cron come rete di sicurezza');
    const EVENTO_SUBITO = 'subito-2026';
    await creaEvento(EVENTO_SUBITO, 'Prova dell\'invio subito', '2026-11-23', { giornoPrima: false, oraPrima: false });
    const [s1, s2] = await creaPersone(EVENTO_SUBITO, 600000, 2);
    const mettiInCoda = p => ctx.db.collection('partecipanti').doc(p.uid).update(new ctx.FieldPath('invii', EVENTO_SUBITO, 'stato'), 'in coda');
    await mettiInCoda(s1);
    await ctx.db.collection('code').doc(EVENTO_SUBITO).set({ attiva: true }, { merge: true });
    process.env.DIRETTA_POSTA_RITARDO_MS = '300';
    const insieme = await Promise.all([
        invio.inviaSubito(ctx, { uid: s1.uid, idEvento: EVENTO_SUBITO }),
        invio.inviaSubito(ctx, { uid: s1.uid, idEvento: EVENTO_SUBITO }),
        I.lavoraCoda(ctx, EVENTO_SUBITO, { budgetMs: 10000 })
    ]);
    delete process.env.DIRETTA_POSTA_RITARDO_MS;
    const postaS1 = perUid('credenziali', EVENTO_SUBITO)[s1.uid] || [];
    vero(postaS1.length === 1, 'due invii subito e un giro della coda nello stesso istante: UNA email (' + insieme.slice(0, 2).map(x => x.stato).join(', ') + ', coda ' + insieme[2].inviate + ')');
    vero(insieme.slice(0, 2).filter(x => x.stato === 'inviata' && x.tipo === 'credenziali').length + insieme[2].inviate === 1, 'uno solo dei tre l\'ha spedita');
    vero(postaS1.length === 1 && await accedi2(s1.uid, passwordDi(postaS1[0])), 'la password dell\'invio subito funziona');
    const giaInviata = await invio.inviaSubito(ctx, { uid: s1.uid, idEvento: EVENTO_SUBITO });
    vero(giaInviata.stato === 'inviata' && (perUid('credenziali', EVENTO_SUBITO)[s1.uid] || []).length === 1, 'un altro invio subito a chi e\' gia\' "inviata": niente di nuovo (' + giaInviata.stato + ')');
    await mettiInCoda(s2);
    process.env.DIRETTA_POSTA_ERRORE_ACCOUNT = '1';
    const bloccataS = await invio.inviaSubito(ctx, { uid: s2.uid, idEvento: EVENTO_SUBITO });
    delete process.env.DIRETTA_POSTA_ERRORE_ACCOUNT;
    const vS2 = (await ctx.db.collection('partecipanti').doc(s2.uid).get()).data().invii[EVENTO_SUBITO];
    vero(bloccataS.stato === 'in coda' && vS2.stato === 'in coda' && !(perUid('credenziali', EVENTO_SUBITO)[s2.uid]), 'Brevo rifiuta il login: nessuna email, la persona resta "in coda"');
    avanti(3 * 60 * 1000);
    const cronS = await invio.giroCron(ctx, { budgetMs: 60000 });
    vero((perUid('credenziali', EVENTO_SUBITO)[s2.uid] || []).length === 1 && cronS.code.some(c => c.idEvento === EVENTO_SUBITO && c.inviate === 1),
        'il cron, al giro dopo, la manda (una email): e\' la rete di sicurezza dell\'invio subito');

    /* ---------- J ---------- */
    titolo('J. I promemoria, con l\'orologio spostato');
    await ctx.db.collection('eventi').doc(EVENTO).update({ promemoria: { giornoPrima: true, oraPrima: true } });
    // quattro persone caricate dopo l'invio a tutti: restano 'da inviare' (account attivo, ma niente password)
    const tardive = await creaPersone(EVENTO, 400000, 4);
    // una persona con le credenziali 'inviata' e poi disattivata
    const spenta = (await conStato(EVENTO, 'inviata')).find(d => d.id !== multi.id);
    await spenta.ref.update({ stato: 'disattivato' });
    await ctx.db.collection('sessioni').doc(spenta.id).set({ stato: 'disattivato', sessioneAttiva: null }, { merge: true });
    const tuttiJ = (await ctx.db.collection('partecipanti').where('eventi', 'array-contains', EVENTO).get()).docs;
    const statoJ = {};
    tuttiJ.forEach(d => { statoJ[d.id] = d.data().invii[EVENTO].stato; });
    const idoneiDocs = tuttiJ.filter(d => { const x = d.data(); return x.stato === 'attivo' && x.authCreato && x.invii[EVENTO].stato === 'inviata'; });
    const idonei = idoneiDocs.length;
    const nonInviata = tuttiJ.filter(d => d.data().invii[EVENTO].stato !== 'inviata');
    const quanti = st => nonInviata.filter(d => d.data().invii[EVENTO].stato === st).length;
    console.log('  idonei ' + idonei + '; esclusi: da inviare ' + quanti('da inviare') + ', respinta ' + quanti('respinta') + ', incerto ' + quanti('incerto') + ', inviata ma disattivata 1');
    vero(quanti('da inviare') >= tardive.length && quanti('respinta') > 0 && quanti('incerto') > 0, 'ci sono persone "da inviare", "respinta" e "incerto" su cui controllare l\'esclusione');
    const passwordDiChi = {};
    Object.entries(perUid('credenziali')).forEach(([u, mm]) => { passwordDiChi[u] = mm.map(passwordDi); });

    // quanti li riceveranno: prima che parta qualcosa basta il conteggio delle 'inviata' meno i disattivati
    let dp = (await invio.statoCoda(ctx, { idEvento: EVENTO })).destinatariPromemoria;
    vero(dp && dp.giorno === idonei && dp.ora === idonei, 'statoCoda.destinatariPromemoria prima dell\'invio: giorno ' + (dp && dp.giorno) + ', ora ' + (dp && dp.ora) + ' (attesi ' + idonei + ') (R12)');
    const dpRoma = (await invio.statoCoda(ctx, { idEvento: EVENTO_SENZA })).destinatariPromemoria;
    vero(dpRoma.giorno === 21 && dpRoma.ora === 21, 'Roma: anche con i promemoria spenti la gestione vede quanti li riceverebbero (21)');
    // un giro del giorno prima rimasto a meta': tre persone l'hanno gia' avuto (segno sul profilo)
    const giaAvuto = idoneiDocs.slice(0, 3);
    const quandoVecchio = ctx.Timestamp.fromMillis(C.istanteRoma('2026-10-01', '09:00'));
    for (const d of giaAvuto) await d.ref.update(new ctx.FieldPath('promemoria', EVENTO, 'giorno'), quandoVecchio);
    await ctx.db.collection('code').doc(EVENTO).set({ promemoria: { giorno: { cominciato: quandoVecchio.toMillis(), quando: quandoVecchio.toMillis(), finito: false, inviate: 3 } } }, { merge: true });
    dp = (await invio.statoCoda(ctx, { idEvento: EVENTO })).destinatariPromemoria;
    vero(dp.giorno === idonei - 3 && dp.ora === idonei, 'con un giro a meta\' si contano le persone una per una: giorno ' + dp.giorno + ' (attesi ' + (idonei - 3) + '), ora ' + dp.ora);

    portaOra(C.istanteRoma('2026-10-01', '09:30'));
    let t0 = Date.now();
    const cg = await invio.giroCron(ctx, { budgetMs: 200000 });
    numeri.secondiPromemoriaGiorno = (Date.now() - t0) / 1000;
    const pg = cg.promemoria.filter(p => p.idEvento === EVENTO && p.tipo === 'giorno');
    vero(pg.length === 1 && pg[0].inviate === idonei - 3 && pg[0].finito, '1 ottobre 9.30: promemoria del giorno prima a ' + (pg[0] && pg[0].inviate) + ' persone (idonee: ' + idonei + ', 3 l\'avevano gia\') in ' + numeri.secondiPromemoriaGiorno.toFixed(1) + ' s');
    vero(!cg.promemoria.some(p => p.idEvento === EVENTO_SENZA), 'Roma (promemoria spenti): nessun promemoria');
    const statoDopoGiorno = await invio.statoCoda(ctx, { idEvento: EVENTO });
    dp = statoDopoGiorno.destinatariPromemoria;
    vero(dp.giorno === 0 && dp.ora === idonei, 'dopo il giorno prima: destinatari giorno 0 (finito), ora ' + dp.ora);
    const pgCoda = statoDopoGiorno.coda.promemoria.giorno || {};
    vero(pgCoda.finito === true && pgCoda.inviate === idonei && pgCoda.cominciato > 0, 'code/' + EVENTO + '.promemoria.giorno: finito, inviate ' + pgCoda.inviate + ' (3 + ' + (idonei - 3) + ')');
    const cg2 = await invio.giroCron(ctx, { budgetMs: 60000 });
    vero(cg2.promemoria.length === 0, 'il giro dopo non riparte (finito): nessuna rilettura, nessuna email');
    portaOra(C.istanteRoma('2026-10-02', '08:10'));
    t0 = Date.now();
    const co = await invio.giroCron(ctx, { budgetMs: 200000 });
    numeri.secondiPromemoriaOra = (Date.now() - t0) / 1000;
    const po = co.promemoria.filter(p => p.idEvento === EVENTO);
    vero(po.length === 1 && po[0].tipo === 'ora' && po[0].inviate === idonei && po[0].finito, '2 ottobre 8.10: promemoria dell\'ora prima a ' + (po[0] && po[0].inviate) + ' persone (e niente di quello del giorno)');
    const co2 = await invio.giroCron(ctx, { budgetMs: 60000 });
    vero(co2.promemoria.length === 0, 'il giro dopo non riparte');
    dp = (await invio.statoCoda(ctx, { idEvento: EVENTO })).destinatariPromemoria;
    vero(dp.giorno === 0 && dp.ora === 0, 'dopo l\'ora prima: destinatari giorno 0, ora 0');
    const pGiorno = perUid('promemoria-giorno');
    const pOra = perUid('promemoria-ora');
    vero(Object.values(pGiorno).every(m => m.length === 1) && Object.values(pOra).every(m => m.length === 1), 'ogni persona: al massimo un promemoria per tipo');
    vero(Object.keys(pGiorno).length === idonei - 3 && Object.keys(pOra).length === idonei, 'promemoria del giorno: ' + Object.keys(pGiorno).length + ', dell\'ora: ' + Object.keys(pOra).length);
    vero(giaAvuto.every(d => !pGiorno[d.id] && pOra[d.id]), 'chi l\'aveva gia\' avuto nel giro interrotto non lo riceve di nuovo');
    const conPromemoria = Object.keys(pGiorno).concat(Object.keys(pOra));
    vero(conPromemoria.every(u => statoJ[u] === 'inviata'), 'tutti i promemoria sono andati a persone con le credenziali "inviata"');
    vero(nonInviata.every(d => !pGiorno[d.id] && !pOra[d.id]), 'nessun promemoria a chi e\' "da inviare", "respinta", "incerto" (' + nonInviata.length + ' persone) (R12)');
    vero(tardive.every(p => !pGiorno[p.uid] && !pOra[p.uid]), 'nessun promemoria alle 4 persone caricate dopo (ancora "da inviare")');
    vero(!pGiorno[spenta.id] && !pOra[spenta.id], 'nessun promemoria a chi ha le credenziali ma l\'account disattivato');
    const tuttiProm = leggiPosta().filter(m => /^promemoria-/.test(m.tipo));
    const conPassword = tuttiProm.filter(m => {
        const pw = passwordDiChi[uidDi(m)] || [];
        return /Password:\s*\S/.test(m.testo) || pw.some(x => x && (m.testo.indexOf(x) >= 0 || m.html.indexOf(x) >= 0));
    });
    vero(conPassword.length === 0, 'nessun promemoria contiene la password (controllati ' + tuttiProm.length + ')');
    vero(tuttiProm.every(m => eventoDi(m) === EVENTO), 'nessun promemoria per Roma, ne\' per l\'evento del tetto');
    vero(DISATTIVATI.every(i => !pGiorno[perIndice[i].uid] && !pOra[perIndice[i].uid]), 'nessun promemoria ai disattivati');
    const esempio = tuttiProm.find(m => m.tipo === 'promemoria-giorno');
    vero(/^Domani la diretta - /.test(esempio.oggetto) && /\/diretta\/\?e=napoli-2026"/.test(esempio.html), 'promemoria del giorno prima: "Domani la diretta" con il collegamento all\'evento (?e=)');
    vero(/La tua email: \S+@\S+/.test(esempio.testo), 'promemoria: ricorda l\'email con cui si entra');
    vero(/domani alle 9\.00 \(ora italiana\)/.test(esempio.testo) && /Non trovi la password\? Usa «Password dimenticata\?» nella pagina di accesso: \S+dimenticata=1/.test(esempio.testo),
        'promemoria: "domani alle 9.00 (ora italiana)" e "Non trovi la password? Usa «Password dimenticata?»" con il collegamento');
    const esempioOra = tuttiProm.find(m => m.tipo === 'promemoria-ora');
    vero(/^Tra poco in diretta - /.test(esempioOra.oggetto) && /comincia oggi alle 9\.00 \(ora italiana\)/.test(esempioOra.testo), 'promemoria dell\'ora prima: "Tra poco in diretta", "oggi alle 9.00 (ora italiana)"');
    const segno = (await ctx.db.collection('partecipanti').doc(uidDi(esempio)).get()).data().promemoria[EVENTO];
    vero(segno.giorno && typeof segno.giorno.toMillis === 'function' && segno.ora && typeof segno.ora.toMillis === 'function', 'sul profilo: promemoria.' + EVENTO + '.giorno e .ora con l\'orario dell\'invio');
    numeri.promemoria = { idonei: idonei, giorno: Object.keys(pGiorno).length, giaAvutoGiorno: giaAvuto.length, ora: Object.keys(pOra).length, esclusi: nonInviata.length + 1 };

    /* ---------- K ---------- */
    titolo('K. La funzione api/diretta-cron.js');
    const cronApi = require(path.join(RADICE, 'email-service/api/diretta-cron.js'));
    const chiama = async (metodo, intestazioni) => {
        const res = { codice: 0, corpo: null, intestazioni: {} };
        res.status = c => { res.codice = c; return res; };
        res.json = d => { res.corpo = d; return res; };
        res.setHeader = (k, v) => { res.intestazioni[k.toLowerCase()] = v; };
        await cronApi({ method: metodo, headers: intestazioni || {} }, res);
        return res;
    };
    vero((await chiama('GET')).codice === 401, 'senza Authorization: 401');
    vero((await chiama('GET', { authorization: 'Bearer sbagliato' })).codice === 401, 'segreto sbagliato: 401');
    vero((await chiama('PUT', { authorization: 'Bearer ' + SEGRETO_CRON })).codice === 405, 'metodo diverso da GET/POST: 405');
    const okCron = await chiama('GET', { authorization: 'Bearer ' + SEGRETO_CRON });
    vero(okCron.codice === 200 && okCron.corpo.ok === true && okCron.intestazioni['cache-control'] === 'no-store', 'con il segreto giusto (GET di Vercel): 200 ok');
    vero((await chiama('POST', { authorization: 'Bearer ' + SEGRETO_CRON })).codice === 200, 'anche POST (lancio a mano): 200');

    /* ---------- i numeri ---------- */
    const finale = await stati(EVENTO);
    numeri.finale = finale;
    numeri.email = {
        credenziali: leggiPosta().filter(m => m.tipo === 'credenziali').length,
        promemoria: tuttiProm.length,
        totaleRighe: leggiPosta().length
    };
}

(async () => {
    const t = Date.now();
    let fallita = null;
    try { await prova(); } catch (e) { fallita = e; }
    await fermaTutto();
    if (fallita) { rossi++; console.error('\nROSSO la prova si e\' interrotta: ' + (fallita.stack || fallita)); }
    numeri.secondiTotali = (Date.now() - t) / 1000;
    numeri.verdi = verdi;
    numeri.rossi = rossi;
    fs.mkdirSync(RISULTATI, { recursive: true });
    fs.writeFileSync(path.join(RISULTATI, 'coda.json'), JSON.stringify(Object.assign({ quando: new Date().toISOString(), persone: PERSONE }, numeri), null, 2));
    console.log('\n---------------------------------------------------------');
    if (numeri.primoGiro) {
        console.log('Primo giro su ' + PERSONE + ' persone: inviate ' + numeri.primoGiro.inviate + ', respinte ' + numeri.primoGiro.respinte
            + ', errori ' + numeri.primoGiro.errori + ', incerti ' + numeri.primoGiro.incerti);
    }
    if (numeri.finale) console.log('Alla fine: ' + JSON.stringify(numeri.finale));
    if (numeri.doppioni != null) console.log('Doppioni (persone con piu\' di una email di credenziali non richiesta): ' + numeri.doppioni);
    if (numeri.secondiPerLeCredenziali) console.log('Tempo per le credenziali (dal primo giro alla coda vuota, kill e blocco compresi): ' + numeri.secondiPerLeCredenziali.toFixed(1) + ' s');
    if (numeri.promemoria) console.log('Promemoria: ' + JSON.stringify(numeri.promemoria) + ' in ' + numeri.secondiPromemoriaGiorno.toFixed(1) + ' s + ' + numeri.secondiPromemoriaOra.toFixed(1) + ' s');
    console.log('Tempo totale della prova: ' + numeri.secondiTotali.toFixed(1) + ' s');
    console.log(verdi + ' verdi, ' + rossi + ' rossi');
    process.exit(rossi ? 1 : 0);
})();
