/* ============================================================
   PROVE - le iscrizioni dal modulo del sito: la password subito
   ------------------------------------------------------------
       node iscrizioni.prova.js [--firestore 8330] [--auth 9330]

   Se sulle due porte non risponde gia' un emulatore, la prova ne
   avvia uno suo (con le regole vere) e lo ferma alla fine.

   Chiama DAVVERO la funzione del modulo del sito,
   email-service/api/iscrizione-nuova.js, come la chiama Vercel (req e
   res finti), con DUE progetti Firebase negli emulatori, come in
   produzione: quello dello studio (l'app predefinita di firebase-admin,
   con una chiave di servizio finta del progetto "demo-studio-prova":
   la' finisce la scheda dell'iscrizione) e quello della diretta (l'app
   "diretta", demo-ngb-eventi: la' finiscono account e partecipanti).
   Niente SMTP: la conferma del sito non parte (server di posta
   inesistente, e il modulo risponde lo stesso), le email della diretta
   vanno nella posta finta, risultati/iscrizioni-posta.jsonl.

   COSA DIMOSTRA.
   1. Interruttore spento (il predefinito): il modulo salva la scheda
      come sempre e nella diretta non succede niente.
   2. Interruttore acceso: chi si iscrive "online" (email scritta in
      maiuscolo e con spazi) ha subito l'account e l'email con la
      password, «scrivi la tua email <email> e questa password»; la
      password funziona con l'accesso vero della diretta (entra), con
      l'email scritta in qualunque modo; la risposta del modulo resta
      { ok: true } e arriva in pochi secondi.
   3. Iscrizione ripetuta: nessuna seconda password, nessuna seconda
      email; la password di prima vale ancora.
   4. Due iscrizioni della stessa email nello stesso istante: un account,
      una email.
   5. Email che ha gia' un account con la password (import di Milano e
      credenziali inviate): si aggiunge Napoli, arriva UNA volta
      «Sei iscritto anche a...» senza password, la password di prima
      vale ancora (anche per Napoli). Iscritta di nuovo: niente.
   6. Email caricata dal file e mai raggiunta (credenziali "da
      inviare"): con l'iscrizione dal modulo riceve le credenziali (la
      prima password). E dopo, quando il gestore manda le credenziali
      di Milano, riceve l'avviso «anche», non una seconda password.
   7. Una pagina che non porta a nessun evento (Roma, etichetta o
      percorso), la modalita' "presenza", gli aderenti, un evento
      terminato: niente.
   8. L'invio subito che non riesce (Brevo rifiuta il login): la
      persona resta "in coda" e la manda il cron al giro dopo.
   9. Su Vercel il modulo NON aspetta la diretta (waitUntil): con Brevo
      lento risponde prima che l'email parta, e nello stesso tempo per
      un indirizzo nuovo (account, password, email) e per uno gia'
      iscritto: il tempo della risposta non dice chi e' iscritto.
   10. La diretta non configurata: il modulo risponde come sempre e la
      scheda e' salvata; nessun account.
   12. Quale pagina conta: con Napoli e Roma accesi, il percorso di
      Napoli con l'etichetta di Roma porta a Napoli (vince il percorso);
      l'etichetta vale solo senza percorso (o con la home).
   13. «Password dimenticata?» PRIMA di «Invia le credenziali»: il
      collegamento lascia resetInviato sul profilo; la password scelta
      dalla persona resta: il gestore manda le credenziali e a lei
      arriva «anche», e cosi' dal modulo di un altro evento; il
      "Reinvia" del gestore manda le credenziali dicendo che quella di
      prima non vale piu'.
   14. Email corretta dal gestore (credenziali di Milano partite al
      vecchio indirizzo), poi iscrizione dal modulo di Napoli con il
      nuovo (credenziali, prima password per quella casella), poi
      «Invia le credenziali» di Milano: arriva «anche», non una seconda
      password, e quella di Napoli vale ancora.
   15. Due persone con la stessa email (info@...): la seconda non
      finisce nell'account della prima (niente evento aggiunto, niente
      email, account intatto), e c'e' una riga «da verificare» per il
      gestore (email-condivisa, con il nome sull'account), anche contro
      un account di un altro evento; iscritta di nuovo: la stessa riga
      (volte 2); l'elenco e «Segna come vista» (lib, come le azioni
      'da-verificare' e 'da-verificare-archivia').
   16. Indirizzi che il modulo del sito accetta e la diretta no: la
      scheda del sito c'e', nessun account, una riga «da verificare»
      (email-non-valida) con l'indirizzo come l'ha scritto la persona.
   17. I limiti del modulo pubblico: per rete (IPv6 della stessa /64:
      oltre DIRETTA_MODULO_RETE_ORA l'account si crea ma la password la
      manda il gestore), in tutto (DIRETTA_MODULO_ORA), e la parte del
      tetto giornaliero (60% di DIRETTA_MAX_GIORNO: oltre, restano in
      coda anche per il cron, mentre le credenziali del gestore e
      «Password dimenticata?» partono); i log dicono il limite, senza
      dati personali.
   18. La conferma del sito per chi si iscrive online dice che arrivera'
      un'email con la password (niente date promesse) e ricorda lo Spam;
      quella per la sala non cambia.
   11. I due progetti restano separati (nessuna scheda nella diretta,
      nessun account nello studio); nessuna password in chiaro nei log
      ne' in Firestore; nessun indirizzo email nei log della diretta;
      in nessuna email compare un "nome utente", in tutte la frase
      dello Spam.
   Esce con 1 se qualcosa e' rosso.
   ============================================================ */
'use strict';
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

function argomento(nome, predefinito) {
    const i = process.argv.indexOf('--' + nome);
    return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : predefinito;
}
const PORTA_FS = Number(argomento('firestore', 8330));
const PORTA_AUTH = Number(argomento('auth', 9330));
const PROGETTO = 'demo-ngb-eventi';
const PROGETTO_STUDIO = 'demo-studio-prova';
const RISULTATI = path.resolve(__dirname, 'risultati');
const POSTA = path.join(RISULTATI, 'iscrizioni-posta.jsonl');
const SERVIZIO = path.resolve(__dirname, '../../email-service');
const ETICHETTA_NAPOLI = 'Napoli 2 Ottobre 2026 - Manifestazione di interesse';
const FRASE_SPAM = 'Non trovi l\'email? Controlla nella cartella Spam o Promozioni e segna il mittente come sicuro.';
const CONTESTO_VERCEL = Symbol.for('@vercel/request-context');

/* ---------- l'ambiente, PRIMA di caricare il servizio ---------- */
const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' }
});
Object.assign(process.env, {
    DIRETTA_EMULATORE: '1',
    DIRETTA_PROGETTO: PROGETTO,
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:' + PORTA_FS,
    FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:' + PORTA_AUTH,
    DIRETTA_POSTA_FINTA: POSTA,
    DIRETTA_PAUSA_MS: '0',
    DIRETTA_MAX_GIORNO: '0',
    // il progetto dello studio: una chiave finta (l'emulatore non la chiede, firebase-admin si')
    FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ project_id: PROGETTO_STUDIO, private_key: privateKey, client_email: 'prova@' + PROGETTO_STUDIO + '.iam.gserviceaccount.com' }),
    // la conferma del sito non parte: nessun server di posta su questa porta
    SMTP_HOST: '127.0.0.1', SMTP_PORT: '9', SMTP_USER: 'nessuno', SMTP_PASS: 'nessuna'
});
['DIRETTA_POSTA_ERRORE_ACCOUNT', 'DIRETTA_POSTA_RITARDO_MS', 'DIRETTA_POSTA_RIFIUTA', 'DIRETTA_POSTA_INCERTA', 'DIRETTA_POSTA_ERRORE_MESSAGGIO',
    'DIRETTA_FIREBASE_SERVICE_ACCOUNT', 'APP_BASE_URL', 'BREVO_API_KEY',
    'DIRETTA_MODULO_RETE_ORA', 'DIRETTA_MODULO_ORA', 'DIRETTA_MODULO_PERCENTO'].forEach(k => { delete process.env[k]; });

/* ---------- i log: tutto quello che il servizio scrive, per controllarlo alla fine ---------- */
const righeLog = [];
const logVero = console.log, erroreVero = console.error;
function dalServizio(args) { return args.map(a => (a && a.stack) ? a.stack : String(a)).join(' '); }
console.error = (...a) => { righeLog.push(dalServizio(a)); };
console.log = (...a) => {
    const t = dalServizio(a);
    if (/^\[diretta/.test(t)) righeLog.push(t);
    logVero.apply(console, a);
};

const admin = require(path.join(SERVIZIO, 'node_modules/firebase-admin'));
const modulo = require(path.join(SERVIZIO, 'api/iscrizione-nuova.js'));
const { contesto } = require(path.join(SERVIZIO, 'lib/diretta-firebase'));
const D = require(path.join(SERVIZIO, 'lib/diretta-dati'));
const A = require(path.join(SERVIZIO, 'lib/diretta-accesso'));
const invio = require(path.join(SERVIZIO, 'lib/diretta-invio'));
const C = require(path.join(SERVIZIO, 'lib/diretta-comune'));
const I = require(path.join(SERVIZIO, 'lib/diretta-iscrizione'));
const MNGB = require(path.join(SERVIZIO, 'lib/mail-ngb'));

let rossi = 0, verdi = 0;
function vero(cond, descrizione, dettaglio) {
    if (cond) { verdi++; logVero('  ok  ' + descrizione); }
    else { rossi++; logVero('ROSSO ' + descrizione + (dettaglio ? '\n       ' + dettaglio : '')); }
}
function titolo(t) { logVero('\n' + t); }
const pausa = ms => new Promise(r => setTimeout(r, ms));

/* ---------- gli emulatori (come in doppioni.prova.js) ---------- */
function portaAperta(porta) {
    return new Promise(r => {
        const s = net.connect(porta, '127.0.0.1');
        s.on('connect', () => { s.destroy(); r(true); });
        s.on('error', () => r(false));
    });
}
async function assicuraEmulatori() {
    if (await portaAperta(PORTA_FS) && await portaAperta(PORTA_AUTH)) return null;
    const cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'ngb-iscrizioni-'));
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
    const richieste = [PROGETTO, PROGETTO_STUDIO].map(p => fetch('http://127.0.0.1:' + PORTA_FS + '/emulator/v1/projects/' + p + '/databases/(default)/documents', { method: 'DELETE' }))
        .concat([PROGETTO, PROGETTO_STUDIO].map(p => fetch('http://127.0.0.1:' + PORTA_AUTH + '/emulator/v1/projects/' + p + '/accounts', { method: 'DELETE' })));
    const r = await Promise.all(richieste);
    if (r.some(x => !x.ok)) throw new Error('svuotamento degli emulatori non riuscito');
}

/* ---------- il modulo del sito, come lo chiama Vercel ---------- */
let ipProgressivo = 0;
async function iscrivi(dati, opz) {
    const o = opz || {};
    const corpo = Object.assign({
        data: '26/09/2026 10:' + String(10 + (ipProgressivo % 50)).padStart(2, '0') + ':00', pagina: ETICHETTA_NAPOLI,
        azienda: 'Prova srl', ruolo: '', telefono: '', messaggio: '', modalita: 'online', privacy: true, marketing: false
    }, dati);
    ipProgressivo++;
    const req = { method: 'POST', headers: { 'x-forwarded-for': o.ip || ('10.50.' + Math.floor(ipProgressivo / 200) + '.' + (ipProgressivo % 200 + 1)) }, body: JSON.stringify(corpo) };
    const res = { stato: 0, corpo: null, intestazioni: {} };
    res.setHeader = (k, v) => { res.intestazioni[k.toLowerCase()] = v; };
    res.status = c => { res.stato = c; return res; };
    res.json = d => { res.corpo = d; return res; };
    res.end = () => res;
    const t0 = Date.now();
    await modulo(req, res);
    res.ms = Date.now() - t0;
    return res;
}

/* ---------- la posta finta ---------- */
function leggiPosta() {
    if (!fs.existsSync(POSTA)) return [];
    return fs.readFileSync(POSTA, 'utf8').split('\n').filter(Boolean).map(r => JSON.parse(r));
}
const postaA = (email, tipo) => leggiPosta().filter(m => m.a === email && (!tipo || m.tipo === tipo));
const passwordDi = m => ((/\nPassword: (\S+)\n/.exec(m.testo || '')) || [])[1] || '';

(async () => {
    const emulatori = await assicuraEmulatori();
    let ctx = null;
    const passwordViste = [];
    try {
        await svuota();
        fs.mkdirSync(RISULTATI, { recursive: true });
        try { fs.unlinkSync(POSTA); } catch (_) { /* non c'era */ }
        ctx = contesto();
        const studio = () => admin.app().firestore();
        const profiloDi = async email => {
            const i = await ctx.db.collection('indirizzi').doc(email).get();
            if (!i.exists) return null;
            const p = await ctx.db.collection('partecipanti').doc(i.data().uid).get();
            return p.exists ? Object.assign({ uid: p.id }, p.data()) : null;
        };
        // l'accesso vero della diretta, con l'email scritta come la scrive la persona
        const entra = async (email, password, ip) => {
            try { return Object.assign({ stato: 200 }, await A.entra(ctx, { email: email, password: password, ip: ip || '10.60.0.1', userAgent: 'prova' })); } catch (e) { return { stato: e.stato || 500, codice: e.codice }; }
        };

        titolo('Preparazione: gli eventi della diretta');
        const EV = {
            titolo: 'Next Generation Business 2026 · Napoli', luogo: 'Napoli', data: '2026-10-02', oraInizio: '09:00', oraFine: '17:30',
            paginaEvento: '/napoli_ottobre_2026/', unSoloDispositivo: false, promemoria: { giornoPrima: false, oraPrima: false }
        };
        const napoli = await D.salvaEvento(ctx, Object.assign({ nuovo: true, id: 'napoli-2026' }, EV));
        await D.salvaEvento(ctx, Object.assign({ nuovo: true, id: 'milano-2026' }, EV, { titolo: 'Evento di Milano', data: '2026-11-20', paginaEvento: '/milano_2026/' }));
        vero(napoli.iscrizioniAutomatiche === false, 'Napoli e Milano create; a Napoli l\'invio automatico e\' spento di base');

        /* ---------- 1 ---------- */
        titolo('1. Interruttore spento: il modulo come sempre, nella diretta niente');
        const spento = await iscrivi({ nome: 'Sara', cognome: 'Spenta', email: 'sara.spenta@esempio.it' });
        vero(spento.stato === 200 && spento.corpo && spento.corpo.ok === true, 'il modulo risponde { ok: true }');
        const schede = await studio().collection('iscrizioni').where('email', '==', 'sara.spenta@esempio.it').get();
        vero(schede.size === 1 && schede.docs[0].data().modalita === 'online', 'la scheda e\' salvata nel progetto dello studio (modalita\' online)');
        vero(!(await profiloDi('sara.spenta@esempio.it')) && leggiPosta().length === 0, 'nessun account della diretta e nessuna email');

        /* ---------- 2 ---------- */
        titolo('2. Interruttore acceso: la password arriva subito');
        const acceso = await D.cambiaIscrizioni(ctx, { idEvento: 'napoli-2026', iscrizioniAutomatiche: true });
        vero(acceso.iscrizioniAutomatiche === true, 'il gestore accende «Invia subito la password a chi si iscrive dal modulo del sito»');
        const luca = await iscrivi({ nome: 'Luca', cognome: 'Nuovo', email: ' Luca.Nuovo@ESEMPIO.it ' });
        vero(luca.stato === 200 && luca.corpo.ok === true && luca.ms < 4000, 'il modulo risponde { ok: true } in ' + luca.ms + ' ms');
        const pLuca = await profiloDi('luca.nuovo@esempio.it');
        vero(!!pLuca && pLuca.email === 'luca.nuovo@esempio.it' && pLuca.origine === 'modulo' && pLuca.nome === 'Luca' && pLuca.eventi.join() === 'napoli-2026' && pLuca.authCreato === true,
            'account creato con l\'email normalizzata, origine "modulo", evento Napoli');
        vero(pLuca && pLuca.invii['napoli-2026'].stato === 'inviata' && pLuca.invii['napoli-2026'].tipo === 'credenziali', 'credenziali "inviata" (tipo credenziali)');
        const credLuca = postaA('luca.nuovo@esempio.it', 'credenziali');
        const pwLuca = credLuca.length ? passwordDi(credLuca[0]) : '';
        passwordViste.push(pwLuca);
        vero(credLuca.length === 1 && /^[A-HJ-NP-Za-km-np-z2-9]{10}$/.test(pwLuca), 'UNA email con la password (10 caratteri, niente caratteri che si confondono)');
        vero(credLuca.length === 1 && credLuca[0].testo.indexOf('scrivi la tua email luca.nuovo@esempio.it e questa password: ' + pwLuca) >= 0,
            'l\'email dice «Per entrare nella diretta: vai su ..., scrivi la tua email luca.nuovo@esempio.it e questa password: ...»');
        const entraLuca = await entra('  LUCA.NUOVO@esempio.IT ', pwLuca);
        vero(entraLuca.stato === 200 && entraLuca.idEvento === 'napoli-2026' && entraLuca.email === 'luca.nuovo@esempio.it', 'con quella password si entra nella diretta, con l\'email scritta in maiuscolo e con spazi');

        /* ---------- 3 ---------- */
        titolo('3. Iscrizione ripetuta');
        const ancora = await iscrivi({ nome: 'Luca', cognome: 'Nuovo', email: 'luca.nuovo@esempio.it' });
        vero(ancora.stato === 200 && ancora.corpo.ok === true, 'il modulo risponde { ok: true }');
        vero(postaA('luca.nuovo@esempio.it').length === 1, 'nessuna seconda email (e nessuna seconda password)');
        vero((await entra('luca.nuovo@esempio.it', pwLuca)).stato === 200, 'la password di prima vale ancora');

        /* ---------- 4 ---------- */
        titolo('4. La stessa email due volte nello stesso istante');
        const [g1, g2] = await Promise.all([
            iscrivi({ nome: 'Gemma', cognome: 'Doppia', email: 'gemma.doppia@esempio.it' }),
            iscrivi({ nome: 'Gemma', cognome: 'Doppia', email: 'GEMMA.DOPPIA@esempio.it' })
        ]);
        const utentiGemma = (await ctx.db.collection('partecipanti').where('emailNorm', '==', 'gemma.doppia@esempio.it').get()).size;
        vero(g1.corpo.ok && g2.corpo.ok && utentiGemma === 1 && postaA('gemma.doppia@esempio.it', 'credenziali').length === 1, 'un account e una email di credenziali');
        passwordViste.push(passwordDi(postaA('gemma.doppia@esempio.it', 'credenziali')[0] || {}));

        /* ---------- 5 ---------- */
        titolo('5. Un\'email che ha gia\' un account e una password (Milano)');
        await D.crea(ctx, { idEvento: 'milano-2026', righe: [{ riga: 2, nome: 'Anna', cognome: 'Bianchi', email: 'anna.bianchi@esempio.it', azienda: 'X' }] });
        vero(postaA('anna.bianchi@esempio.it').length === 0, 'l\'import di Milano non manda email');
        await invio.accoda(ctx, { idEvento: 'milano-2026', chi: 'da-inviare' });
        await invio.avanzaCoda(ctx, { idEvento: 'milano-2026', budgetMs: 20000 });
        const credAnna = postaA('anna.bianchi@esempio.it', 'credenziali');
        const pwAnna = credAnna.length ? passwordDi(credAnna[0]) : '';
        passwordViste.push(pwAnna);
        vero(credAnna.length === 1 && !!pwAnna, 'con «Invia le credenziali» Anna riceve la password di Milano');
        const anna = await iscrivi({ nome: 'Anna', cognome: 'Bianchi', email: 'Anna.Bianchi@esempio.it' });
        const pAnna = await profiloDi('anna.bianchi@esempio.it');
        vero(anna.corpo.ok && pAnna.eventi.indexOf('napoli-2026') >= 0 && pAnna.eventi.indexOf('milano-2026') >= 0, 'dal modulo di Napoli: Napoli si aggiunge al suo account (lo stesso)');
        const ancheAnna = postaA('anna.bianchi@esempio.it', 'iscritto-anche');
        vero(ancheAnna.length === 1 && postaA('anna.bianchi@esempio.it', 'credenziali').length === 1, 'arriva UNA email «Sei iscritto anche a...», nessuna nuova email di credenziali');
        vero(ancheAnna.length === 1 && /^Sei iscritto anche a Next Generation Business 2026 · Napoli$/.test(ancheAnna[0].oggetto)
            && ancheAnna[0].testo.indexOf('entra con la tua email e la password che hai già; se non la ricordi usa "Password dimenticata?"') >= 0
            && !/Password:\s*\S/.test(ancheAnna[0].testo) && ancheAnna[0].html.indexOf(pwAnna) < 0,
        '«Sei iscritto anche a <evento>: entra con la tua email e la password che hai già...», senza password');
        vero(pAnna.invii['napoli-2026'].stato === 'inviata' && pAnna.invii['napoli-2026'].tipo === 'anche', 'sulla voce di Napoli: inviata, tipo "anche"');
        const entraAnna = await entra('anna.bianchi@esempio.it', pwAnna);
        vero(entraAnna.stato === 200, 'la password di Milano vale ancora (una password per tutti gli eventi)');
        const claimsAnna = ((await ctx.auth.getUser(pAnna.uid)).customClaims || {}).eventi || [];
        vero(claimsAnna.indexOf('napoli-2026') >= 0 && claimsAnna.indexOf('milano-2026') >= 0, 'i permessi del suo account comprendono Napoli e Milano');
        await iscrivi({ nome: 'Anna', cognome: 'Bianchi', email: 'anna.bianchi@esempio.it' });
        vero(postaA('anna.bianchi@esempio.it').length === 2, 'iscritta di nuovo: niente (l\'avviso «anche» parte una volta sola)');

        /* ---------- 6 ---------- */
        titolo('6. Un\'email caricata dal file e mai raggiunta');
        await D.crea(ctx, { idEvento: 'napoli-2026', righe: [{ riga: 2, nome: 'Bruno', cognome: 'Verdi', email: 'bruno.verdi@esempio.it' }] });
        await D.crea(ctx, { idEvento: 'milano-2026', righe: [{ riga: 2, nome: 'Bruno', cognome: 'Verdi', email: 'bruno.verdi@esempio.it' }] });
        vero((await profiloDi('bruno.verdi@esempio.it')).invii['napoli-2026'].stato === 'da inviare' && postaA('bruno.verdi@esempio.it').length === 0, 'caricato dal file (Napoli e Milano): "da inviare", nessuna email');
        await iscrivi({ nome: 'Bruno', cognome: 'Verdi', email: 'bruno.verdi@esempio.it' });
        const credBruno = postaA('bruno.verdi@esempio.it', 'credenziali');
        passwordViste.push(passwordDi(credBruno[0] || {}));
        vero(credBruno.length === 1 && (await profiloDi('bruno.verdi@esempio.it')).invii['napoli-2026'].stato === 'inviata', 'iscritto dal modulo: riceve le credenziali di Napoli (la sua prima password)');
        await invio.accoda(ctx, { idEvento: 'milano-2026', chi: 'da-inviare' });
        await invio.avanzaCoda(ctx, { idEvento: 'milano-2026', budgetMs: 20000 });
        vero(postaA('bruno.verdi@esempio.it', 'credenziali').length === 1 && postaA('bruno.verdi@esempio.it', 'iscritto-anche').length === 1,
            'poi il gestore manda le credenziali di Milano: a lui l\'avviso «anche», non una seconda password');
        vero((await entra('bruno.verdi@esempio.it', passwordDi(credBruno[0] || {}))).stato === 200, 'e la password di Napoli vale ancora');

        /* ---------- 7 ---------- */
        titolo('7. Quando non si fa niente');
        const primaNiente = leggiPosta().length;
        await iscrivi({ nome: 'Rita', cognome: 'Roma', email: 'rita.roma@esempio.it', pagina: 'Roma 16 Aprile 2026 - Iscrizione' });
        await iscrivi({ nome: 'Rita', cognome: 'Roma', email: 'rita.roma2@esempio.it', pagina: '/roma_aprile_2026/' });
        vero(!(await profiloDi('rita.roma@esempio.it')) && !(await profiloDi('rita.roma2@esempio.it')), 'una pagina che non porta a nessun evento (etichetta o percorso): nessun account');
        await iscrivi({ nome: 'Paolo', cognome: 'Presente', email: 'paolo.presente@esempio.it', modalita: 'presenza' });
        await iscrivi({ nome: 'Ada', cognome: 'Aderente', email: 'ada.aderente@esempio.it', aderente: true });
        vero(!(await profiloDi('paolo.presente@esempio.it')) && !(await profiloDi('ada.aderente@esempio.it')), 'in presenza o da aderente: nessun account della diretta');
        await iscrivi({ nome: 'Milo', cognome: 'Milano', email: 'milo@esempio.it', pagina: '/milano_2026/' });
        vero(!(await profiloDi('milo@esempio.it')), 'la pagina di Milano, dove l\'interruttore e\' spento: nessun account');
        vero(leggiPosta().length === primaNiente, 'e nessuna email');

        /* ---------- 8 ---------- */
        titolo('8. L\'invio subito non riesce: ci pensa il cron');
        process.env.DIRETTA_POSTA_ERRORE_ACCOUNT = '1';
        const rosa = await iscrivi({ nome: 'Rosa', cognome: 'Rimandata', email: 'rosa.rimandata@esempio.it' });
        delete process.env.DIRETTA_POSTA_ERRORE_ACCOUNT;
        const pRosa = await profiloDi('rosa.rimandata@esempio.it');
        vero(rosa.corpo.ok === true && pRosa && pRosa.invii['napoli-2026'].stato === 'in coda' && postaA('rosa.rimandata@esempio.it').length === 0,
            'Brevo rifiuta il login: il modulo risponde { ok: true }, l\'account c\'e\', le credenziali restano "in coda"');
        vero((await ctx.db.collection('code').doc('napoli-2026').get()).data().attiva === true, 'la coda di Napoli e\' accesa per il cron');
        const cron = await invio.giroCron(ctx, { budgetMs: 60000 });
        const credRosa = postaA('rosa.rimandata@esempio.it', 'credenziali');
        passwordViste.push(passwordDi(credRosa[0] || {}));
        vero(credRosa.length === 1 && cron.code.some(c => c.idEvento === 'napoli-2026' && c.inviate === 1), 'il cron la manda al giro dopo (una email)');
        await invio.giroCron(ctx, { budgetMs: 60000 });
        vero(postaA('rosa.rimandata@esempio.it').length === 1, 'e un altro giro non la rimanda');

        /* ---------- 9 ---------- */
        titolo('9. Su Vercel il modulo non aspetta la diretta: lo stesso tempo per un indirizzo nuovo e per uno gia\' iscritto');
        /* Brevo lento (1,5 s per email): se il modulo aspettasse il lavoro
           della diretta, un indirizzo nuovo (account + password + email)
           risponderebbe un secondo e mezzo dopo uno gia' iscritto (qualche
           lettura), e il tempo direbbe chi e' iscritto. Ogni lavoro affidato
           a waitUntil si aspetta prima della misura seguente, cosi' non si
           misurano due cose insieme. */
        const affidati = [];
        globalThis[CONTESTO_VERCEL] = { get: () => ({ waitUntil: p => affidati.push(p) }) };
        process.env.DIRETTA_POSTA_RITARDO_MS = '1500';
        const tempiNuovo = [], tempiGia = [];
        for (let i = 0; i < 3; i++) {
            const email = 'lia.lenta' + i + '@esempio.it';
            const prima = affidati.length;
            const nuova = await iscrivi({ nome: 'Lia', cognome: 'Lenta' + i, email: email });
            tempiNuovo.push(nuova.ms);
            vero(nuova.corpo.ok === true && affidati.length === prima + 1 && postaA(email).length === 0,
                'indirizzo nuovo: il modulo risponde { ok: true } in ' + nuova.ms + ' ms, il lavoro della diretta passa a waitUntil e l\'email non e\' ancora partita');
            await affidati[affidati.length - 1];
            const ancora = await iscrivi({ nome: 'Lia', cognome: 'Lenta' + i, email: email });
            tempiGia.push(ancora.ms);
            await affidati[affidati.length - 1];
        }
        delete process.env.DIRETTA_POSTA_RITARDO_MS;
        delete globalThis[CONTESTO_VERCEL];
        const med = v => v.slice().sort((a, b) => a - b)[Math.floor(v.length / 2)];
        vero(Math.max.apply(null, tempiNuovo.concat(tempiGia)) < 1200 && affidati.length === 6,
            'su Vercel nessuna risposta aspetta Brevo (1,5 s): indirizzo nuovo ' + tempiNuovo.join(', ') + ' ms, gia\' iscritto ' + tempiGia.join(', ') + ' ms');
        vero(Math.abs(med(tempiNuovo) - med(tempiGia)) < 250, 'lo stesso tempo: mediana ' + med(tempiNuovo) + ' ms (nuovo) e ' + med(tempiGia) + ' ms (gia\' iscritto)');
        const credLia = [0, 1, 2].map(i => postaA('lia.lenta' + i + '@esempio.it', 'credenziali'));
        credLia.forEach(c => passwordViste.push(passwordDi(c[0] || {})));
        vero(credLia.every(c => c.length === 1) && (await profiloDi('lia.lenta0@esempio.it')).invii['napoli-2026'].stato === 'inviata',
            'finito il lavoro affidato a waitUntil, le email sono partite (una per indirizzo; la seconda iscrizione non manda niente)');

        /* ---------- 10 ---------- */
        titolo('10. La diretta non configurata');
        delete process.env.DIRETTA_EMULATORE;
        const nc = await iscrivi({ nome: 'Nora', cognome: 'Nonconfigurata', email: 'nora@esempio.it' });
        process.env.DIRETTA_EMULATORE = '1';
        const schedaNora = await studio().collection('iscrizioni').where('email', '==', 'nora@esempio.it').get();
        vero(nc.stato === 200 && nc.corpo.ok === true && schedaNora.size === 1, 'il modulo risponde come sempre e la scheda e\' salvata');
        vero(!(await profiloDi('nora@esempio.it')) && postaA('nora@esempio.it').length === 0, 'nessun account e nessuna email');

        /* ---------- 12 ---------- */
        titolo('12. Quale pagina conta: vince il percorso, l\'etichetta solo senza');
        await D.salvaEvento(ctx, Object.assign({ nuovo: true, id: 'roma-2026' }, EV, { titolo: 'Evento di Roma', data: '2026-12-01', paginaEvento: '/roma_aprile_2026/' }));
        await D.cambiaIscrizioni(ctx, { idEvento: 'roma-2026', iscrizioniAutomatiche: true });
        await iscrivi({ nome: 'Pia', cognome: 'Percorso', email: 'pia.percorso@esempio.it', pagina: 'Roma 16 Aprile 2026 - Iscrizione', percorso: '/napoli_ottobre_2026/' });
        const pPia = await profiloDi('pia.percorso@esempio.it');
        vero(pPia && pPia.eventi.join() === 'napoli-2026', 'Napoli e Roma accesi, percorso di Napoli con l\'etichetta di Roma: iscritta a Napoli (vince il percorso)', pPia ? pPia.eventi.join() : 'nessun account');
        await iscrivi({ nome: 'Rino', cognome: 'Percorso', email: 'rino.percorso@esempio.it', pagina: ETICHETTA_NAPOLI, percorso: '/roma_aprile_2026/index.html' });
        const pRino = await profiloDi('rino.percorso@esempio.it');
        vero(pRino && pRino.eventi.join() === 'roma-2026', 'percorso di Roma con l\'etichetta di Napoli: iscritto a Roma', pRino ? pRino.eventi.join() : 'nessun account');
        await iscrivi({ nome: 'Ugo', cognome: 'Home', email: 'ugo.home@esempio.it', pagina: ETICHETTA_NAPOLI, percorso: '/' });
        const pUgoHome = await profiloDi('ugo.home@esempio.it');
        vero(pUgoHome && pUgoHome.eventi.join() === 'napoli-2026', 'percorso della home (non e\' la pagina di un evento): conta l\'etichetta, Napoli');
        await D.cambiaIscrizioni(ctx, { idEvento: 'roma-2026', iscrizioniAutomatiche: false });

        /* ---------- 13 ---------- */
        titolo('13. «Password dimenticata?» prima di «Invia le credenziali»: la password scelta dalla persona resta');
        const PW_SCELTA = 'MiaScelta2026';
        passwordViste.push(PW_SCELTA);
        await D.crea(ctx, { idEvento: 'milano-2026', righe: [{ riga: 2, nome: 'Rita', cognome: 'Reset', email: 'rita.reset@esempio.it' }] });
        await A.passwordDimenticata(ctx, { email: ' Rita.Reset@esempio.it', ip: '10.62.0.1' });
        const resetRita = postaA('rita.reset@esempio.it', 'reimpostazione');
        let pRita = await profiloDi('rita.reset@esempio.it');
        vero(resetRita.length === 1 && postaA('rita.reset@esempio.it', 'credenziali').length === 0 && pRita.invii['milano-2026'].stato === 'da inviare'
            && pRita.resetInviato && Date.now() - pRita.resetInviato.toMillis() < 60000,
        'caricata a Milano (credenziali non ancora inviate), chiede «Password dimenticata?»: il collegamento parte e sul profilo resta resetInviato');
        const oobRita = ((/oobCode=([A-Za-z0-9_-]+)/.exec(resetRita[0] ? resetRita[0].testo : '')) || [])[1] || '';
        const sceglie = await fetch('http://127.0.0.1:' + PORTA_AUTH + '/identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=finta', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ oobCode: oobRita, newPassword: PW_SCELTA })
        });
        vero(sceglie.status === 200 && (await entra('rita.reset@esempio.it', PW_SCELTA, '10.62.0.2')).stato === 200, 'sceglie la sua password (reimposta.html) ed entra');
        await invio.accoda(ctx, { idEvento: 'milano-2026', chi: 'da-inviare' });
        await invio.avanzaCoda(ctx, { idEvento: 'milano-2026', budgetMs: 20000 });
        pRita = await profiloDi('rita.reset@esempio.it');
        vero(postaA('rita.reset@esempio.it', 'credenziali').length === 0 && postaA('rita.reset@esempio.it', 'iscritto-anche').length === 1
            && pRita.invii['milano-2026'].stato === 'inviata' && pRita.invii['milano-2026'].tipo === 'anche',
        'poi il gestore preme «Invia le credenziali» di Milano: a Rita arriva «anche», nessuna password nuova');
        vero((await entra('rita.reset@esempio.it', PW_SCELTA, '10.62.0.3')).stato === 200, '...e la password che ha scelto vale ancora');
        await iscrivi({ nome: 'Rita', cognome: 'Reset', email: 'rita.reset@esempio.it' });
        vero(postaA('rita.reset@esempio.it', 'credenziali').length === 0 && postaA('rita.reset@esempio.it', 'iscritto-anche').length === 2
            && (await entra('rita.reset@esempio.it', PW_SCELTA, '10.62.0.4')).stato === 200,
        'e dal modulo di Napoli: di nuovo «anche», la sua password vale anche per Napoli');
        // il "Reinvia" esplicito del gestore (fra due minuti: non e' un doppio clic) manda le credenziali, e lo dice
        const ctxDopo = Object.assign({}, ctx, { adesso: () => Date.now() + 2 * 60 * 1000 });
        const reRita = await invio.inviaCredenziali(ctxDopo, { uid: pRita.uid, idEvento: 'milano-2026' });
        const credRita = postaA('rita.reset@esempio.it', 'credenziali');
        const pwRitaNuova = passwordDi(credRita[0] || {});
        passwordViste.push(pwRitaNuova);
        vero(reRita.stato === 'inviata' && credRita.length === 1
            && credRita[0].testo.indexOf('Questa password sostituisce quella che usavi finora (anche se l\'avevi scelta tu con «Password dimenticata?»): quella di prima non è più valida.') >= 0,
        '"Reinvia" del gestore: le credenziali, con la frase che la password di prima (anche quella scelta da lei) non vale piu\'');
        vero((await entra('rita.reset@esempio.it', PW_SCELTA, '10.62.0.5')).stato === 401 && (await entra('rita.reset@esempio.it', pwRitaNuova, '10.62.0.6')).stato === 200,
            '...e infatti la sua password non vale piu\', quella nuova si\'');

        /* ---------- 14 ---------- */
        titolo('14. Email corretta dal gestore, iscrizione dal modulo con quella nuova, poi «Invia le credenziali»: una password sola');
        await D.crea(ctx, { idEvento: 'milano-2026', righe: [{ riga: 2, nome: 'Ugo', cognome: 'Cambio', email: 'ugo.vecchia@esempio.it' }] });
        await invio.accoda(ctx, { idEvento: 'milano-2026', chi: 'da-inviare' });
        await invio.avanzaCoda(ctx, { idEvento: 'milano-2026', budgetMs: 20000 });
        const pUgo = await profiloDi('ugo.vecchia@esempio.it');
        vero(postaA('ugo.vecchia@esempio.it', 'credenziali').length === 1, 'le credenziali di Milano vanno all\'indirizzo vecchio (sbagliato)');
        await D.operazionePartecipante(ctx, { uid: pUgo.uid, idEvento: 'milano-2026', operazione: 'correggi', nome: 'Ugo', cognome: 'Cambio', azienda: '', email: 'ugo.nuova@esempio.it' });
        vero((await profiloDi('ugo.nuova@esempio.it')).invii['milano-2026'].stato === 'da inviare', 'il gestore corregge l\'email: le credenziali di Milano tornano «da inviare»');
        await iscrivi({ nome: 'Ugo', cognome: 'Cambio', email: 'ugo.nuova@esempio.it' });
        const credUgo = postaA('ugo.nuova@esempio.it', 'credenziali');
        const pwUgo = passwordDi(credUgo[0] || {});
        passwordViste.push(pwUgo);
        vero(credUgo.length === 1 && (await entra('ugo.nuova@esempio.it', pwUgo, '10.63.0.1')).stato === 200, 'Ugo si iscrive a Napoli dal modulo con l\'indirizzo nuovo: la password (la prima per quella casella), ed entra');
        await invio.accoda(ctx, { idEvento: 'milano-2026', chi: 'da-inviare' });
        await invio.avanzaCoda(ctx, { idEvento: 'milano-2026', budgetMs: 20000 });
        const pUgoDopo = await profiloDi('ugo.nuova@esempio.it');
        vero(postaA('ugo.nuova@esempio.it', 'credenziali').length === 1 && postaA('ugo.nuova@esempio.it', 'iscritto-anche').length === 1
            && pUgoDopo.invii['milano-2026'].stato === 'inviata' && pUgoDopo.invii['milano-2026'].tipo === 'anche',
        'poi il gestore rimanda le credenziali di Milano: all\'indirizzo nuovo arriva «anche», NON una seconda password');
        vero((await entra('ugo.nuova@esempio.it', pwUgo, '10.63.0.2')).stato === 200, '...e la password di Napoli, ricevuta un minuto prima, vale ancora');

        /* ---------- 15 ---------- */
        titolo('15. La stessa email per due persone: la seconda non entra nell\'account della prima');
        const INFO = 'info@studio-esempio.it';
        await iscrivi({ nome: 'Carla', cognome: 'Prima', email: INFO });
        const pInfo = await profiloDi(INFO);
        const postaInfo = postaA(INFO).length;
        vero(pInfo && pInfo.nome === 'Carla' && postaInfo === 1, 'la prima (Carla Prima) ha il suo account e la sua password');
        passwordViste.push(passwordDi(postaA(INFO, 'credenziali')[0] || {}));
        const secondo = await iscrivi({ nome: 'Luigi', cognome: 'Secondo', email: INFO, azienda: 'Studio Esempio' });
        const pInfoDopo = await profiloDi(INFO);
        vero(secondo.corpo.ok === true && JSON.stringify(pInfoDopo) === JSON.stringify(pInfo) && postaA(INFO).length === postaInfo,
            'il secondo (Luigi Secondo, stessa email): il modulo risponde { ok: true }, l\'account di Carla non cambia di una virgola e non parte niente');
        const righeNapoli = async () => (await I.elencoDaVerificare(ctx, 'napoli-2026')).righe;
        let daVed = await righeNapoli();
        const rigaLuigi = daVed.find(r => r.nome === 'Luigi');
        vero(rigaLuigi && rigaLuigi.motivo === 'email-condivisa' && rigaLuigi.cognome === 'Secondo' && rigaLuigi.email === INFO && rigaLuigi.esistente === 'Carla Prima'
            && rigaLuigi.azienda === 'Studio Esempio' && rigaLuigi.origine === 'modulo' && rigaLuigi.volte === 1 && rigaLuigi.quando > Date.now() - 60000,
        'per il gestore, una riga «da verificare»: email-condivisa, chi si e\' iscritto e il nome sull\'account che c\'e\' gia\'', JSON.stringify(rigaLuigi));
        const doc = rigaLuigi ? (await ctx.db.collection('daVerificare').doc(rigaLuigi.id).get()).data() : {};
        vero(doc.idEvento === 'napoli-2026' && doc.origine === 'modulo' && doc.archiviato === false && doc.quando && typeof doc.quando.toMillis === 'function',
            'il documento daVerificare/{id}: evento, nome, cognome, email, motivo, quando, origine "modulo"');
        vero(righeLog.some(r => /\[diretta\] iscrizione dal modulo: \{"idEvento":"napoli-2026","esito":"email-condivisa"[^}]*"daVerificare":true/.test(r)),
            'il log dice evento ed esito (email-condivisa), senza dati personali');
        await iscrivi({ nome: 'Luigi', cognome: 'Secondo', email: INFO, azienda: 'Studio Esempio' });
        daVed = await righeNapoli();
        vero(daVed.filter(r => r.nome === 'Luigi').length === 1 && daVed.find(r => r.nome === 'Luigi').volte === 2 && postaA(INFO).length === postaInfo,
            'si iscrive di nuovo: la stessa riga (volte 2), ancora nessuna email');
        // contro l'account di un'altra persona caricato per un altro evento (Milano)
        await D.crea(ctx, { idEvento: 'milano-2026', righe: [{ riga: 2, nome: 'Mario', cognome: 'Rossi', email: 'segreteria@esempio.it' }] });
        await invio.accoda(ctx, { idEvento: 'milano-2026', chi: 'da-inviare' });
        await invio.avanzaCoda(ctx, { idEvento: 'milano-2026', budgetMs: 20000 });
        passwordViste.push(passwordDi(postaA('segreteria@esempio.it', 'credenziali')[0] || {}));
        await iscrivi({ nome: 'Luisa', cognome: 'Verdi', email: 'segreteria@esempio.it' });
        const pSegr = await profiloDi('segreteria@esempio.it');
        vero(pSegr.nome === 'Mario' && pSegr.eventi.join() === 'milano-2026' && postaA('segreteria@esempio.it', 'iscritto-anche').length === 0
            && ((await ctx.auth.getUser(pSegr.uid)).customClaims || {}).eventi.join() === 'milano-2026',
        'Luisa Verdi con la segreteria@ di Mario Rossi (Milano): Napoli NON si aggiunge all\'account di Mario, nessun «anche», permessi invariati');
        daVed = await righeNapoli();
        const rigaLuisa = daVed.find(r => r.nome === 'Luisa');
        vero(rigaLuisa && rigaLuisa.motivo === 'email-condivisa' && rigaLuisa.esistente === 'Mario Rossi', '...e c\'e\' la sua riga «da verificare» (account di Mario Rossi)');
        // «Segna come vista»
        const arch = await I.archiviaDaVerificare(ctx, { idEvento: 'napoli-2026', id: rigaLuigi.id }, 'gestore@prova.it');
        const docArch = (await ctx.db.collection('daVerificare').doc(rigaLuigi.id).get()).data();
        daVed = await righeNapoli();
        vero(arch.id === rigaLuigi.id && !daVed.some(r => r.id === rigaLuigi.id) && docArch.archiviato === true && docArch.archiviatoDa === 'gestore@prova.it',
            '«Segna come vista»: la riga esce dall\'elenco (resta, archiviata, con chi l\'ha segnata)');
        const ancoraArch = await I.archiviaDaVerificare(ctx, { idEvento: 'napoli-2026', id: rigaLuigi.id }, 'altro@prova.it');
        let sbagliato = null, malformato = null;
        try { await I.archiviaDaVerificare(ctx, { idEvento: 'milano-2026', id: rigaLuisa.id }, 'gestore@prova.it'); } catch (e) { sbagliato = e; }
        try { await I.archiviaDaVerificare(ctx, { idEvento: 'napoli-2026', id: '../indirizzi/x' }, 'gestore@prova.it'); } catch (e) { malformato = e; }
        vero(ancoraArch.id === rigaLuigi.id && sbagliato && sbagliato.stato === 404 && malformato && malformato.stato === 400,
            'segnata due volte: va bene; la riga di un altro evento: 404; un id non valido: 400');
        vero((await I.elencoDaVerificare(ctx, 'milano-2026')).righe.length === 0, 'l\'elenco e\' per evento (Milano: niente)');

        /* ---------- 16 ---------- */
        titolo('16. Un indirizzo che il modulo del sito accetta e la diretta no');
        const STRANI = ['josé.garcia@esempio.it', 'mario.@esempio.it', 'mario@esempio.it.'];
        for (const e of STRANI) {
            const r = await iscrivi({ nome: 'Zeno', cognome: 'Strano', email: e });
            const schede = await studio().collection('iscrizioni').where('email', '==', e).get();
            vero(r.stato === 200 && r.corpo.ok === true && schede.size === 1 && !(await ctx.db.collection('indirizzi').doc(e).get()).exists && postaA(e).length === 0,
                JSON.stringify(e) + ': il modulo risponde { ok: true } e salva la scheda del sito; nessun account della diretta, nessuna email');
        }
        daVed = await righeNapoli();
        const nonValide = daVed.filter(r => r.motivo === 'email-non-valida');
        vero(nonValide.length === 3 && STRANI.every(e => nonValide.some(r => r.email === e && r.nome === 'Zeno' && r.cognome === 'Strano')),
            'e tre righe «da verificare» (email-non-valida), con l\'indirizzo come l\'ha scritto la persona: ' + nonValide.map(r => r.email).join(', '));
        vero(righeLog.some(r => /\[diretta\] iscrizione dal modulo: \{"idEvento":"napoli-2026","esito":"email-non-valida"/.test(r)), 'il log dice email-non-valida (senza l\'indirizzo)');

        /* ---------- 17 ---------- */
        titolo('17. I limiti del modulo pubblico (persistenti, nella diretta)');
        // una finestra oraria che sta per chiudersi azzererebbe i contatori a meta' prova: si aspetta che passi
        const restoOra = 3600000 - (Date.now() % 3600000);
        if (restoOra < 120000) { logVero('       (attesa di ' + Math.ceil(restoOra / 1000) + ' s: la finestra oraria dei limiti sta per cambiare)'); await pausa(restoOra + 1000); }
        // a) per rete: IPv6 diversi della stessa /64 contano insieme
        process.env.DIRETTA_MODULO_RETE_ORA = '3';
        const reteIscritti = [];
        for (let i = 0; i < 5; i++) {
            const email = 'rete' + i + '@esempio.it';
            await iscrivi({ nome: 'Rete', cognome: 'N' + i, email: email }, { ip: '2001:db8:1:2:' + (i + 1) + '::1' });
            reteIscritti.push(await profiloDi(email));
        }
        const inviateRete = reteIscritti.filter(p => p && p.invii['napoli-2026'].stato === 'inviata').length;
        const trattenute = reteIscritti.filter(p => p && p.invii['napoli-2026'].stato === 'da inviare' && p.invii['napoli-2026'].errore === I.MOTIVO_TRATTENUTA);
        vero(reteIscritti.every(Boolean) && inviateRete === 3 && trattenute.length === 2 && postaA('rete3@esempio.it').length === 0 && postaA('rete4@esempio.it').length === 0,
            'DIRETTA_MODULO_RETE_ORA=3, cinque iscrizioni da cinque IPv6 della stessa /64: tutte hanno l\'account, 3 password partono, 2 restano «da inviare» con il motivo per il gestore');
        await iscrivi({ nome: 'Altra', cognome: 'Rete', email: 'altra.rete@esempio.it' }, { ip: '2001:db8:9:9::1' });
        vero(postaA('altra.rete@esempio.it', 'credenziali').length === 1, 'da un\'altra rete la password parte');
        passwordViste.push(passwordDi(postaA('altra.rete@esempio.it', 'credenziali')[0] || {}));
        vero(righeLog.some(r => /\[diretta\] iscrizione dal modulo: \{"idEvento":"napoli-2026","esito":"creato","invio":"","tipo":"","trattenuta":"rete"/.test(r))
            && righeLog.some(r => /limite della rete raggiunto, la password non parte da sola: la manda il gestore \(napoli-2026\)/.test(r)),
        'il log dice che il limite della rete ha fermato la password (senza email, nomi, ne\' IP)');
        delete process.env.DIRETTA_MODULO_RETE_ORA;
        await invio.accoda(ctx, { idEvento: 'napoli-2026', chi: 'da-inviare' });
        await invio.avanzaCoda(ctx, { idEvento: 'napoli-2026', budgetMs: 20000 });
        vero(postaA('rete3@esempio.it', 'credenziali').length === 1 && postaA('rete4@esempio.it', 'credenziali').length === 1,
            'il gestore preme «Invia le credenziali»: le due trattenute ricevono la password');
        ['rete0', 'rete1', 'rete2', 'rete3', 'rete4'].forEach(n => passwordViste.push(passwordDi(postaA(n + '@esempio.it', 'credenziali')[0] || {})));
        // b) in tutto: il contatore dell'ora e' quello di tutte le iscrizioni con una password da mandare
        const contoOra = async () => Number(((await ctx.db.collection('limiti').doc('modulo_globale_' + Math.floor(Date.now() / 3600000)).get()).data() || {}).conteggio) || 0;
        process.env.DIRETTA_MODULO_ORA = String((await contoOra()) + 2);
        for (let i = 0; i < 3; i++) await iscrivi({ nome: 'Tutti', cognome: 'N' + i, email: 'tutti' + i + '@esempio.it' });
        const tutti = await Promise.all([0, 1, 2].map(i => profiloDi('tutti' + i + '@esempio.it')));
        vero(tutti.every(Boolean) && tutti.filter(p => p.invii['napoli-2026'].stato === 'inviata').length === 2 && tutti[2].invii['napoli-2026'].stato === 'da inviare'
            && righeLog.some(r => /"trattenuta":"totale"/.test(r)) && righeLog.some(r => /limite orario complessivo raggiunto/.test(r)),
        'DIRETTA_MODULO_ORA: oltre il tetto orario complessivo (da reti diverse) l\'account si crea ma la password la manda il gestore');
        // la terza la manda il gestore (qui, prima di mettere il tetto del giorno qui sotto)
        await invio.accoda(ctx, { idEvento: 'napoli-2026', chi: 'da-inviare' });
        await invio.avanzaCoda(ctx, { idEvento: 'napoli-2026', budgetMs: 20000 });
        vero(postaA('tutti2@esempio.it', 'credenziali').length === 1, '...e con «Invia le credenziali» del gestore anche la terza riceve la password');
        [0, 1, 2].forEach(i => passwordViste.push(passwordDi(postaA('tutti' + i + '@esempio.it', 'credenziali')[0] || {})));
        process.env.DIRETTA_MODULO_ORA = '1000';
        // c) la parte del tetto giornaliero: con DIRETTA_MAX_GIORNO=10 il modulo arriva al 60% (6), il resto e' del gestore
        process.env.DIRETTA_MAX_GIORNO = '10';
        const contatoreOggi = async () => Number(((await ctx.db.collection('contatori').doc('giorno-' + C.dataRoma(Date.now()).replace(/-/g, '')).get()).data() || {}).inviate) || 0;
        const usateOggi = await contatoreOggi();
        vero(usateOggi === 0, 'il contatore del giorno parte da 0 (fin qui nessun tetto)');
        for (let i = 0; i < 8; i++) await iscrivi({ nome: 'Quota', cognome: 'N' + i, email: 'quota' + i + '@esempio.it' });
        const quota = await Promise.all([0, 1, 2, 3, 4, 5, 6, 7].map(i => profiloDi('quota' + i + '@esempio.it')));
        const partite = quota.filter(p => p.invii['napoli-2026'].stato === 'inviata').length;
        const inCodaQ = quota.filter(p => p.invii['napoli-2026'].stato === 'in coda' && p.invii['napoli-2026'].automatica === true);
        vero(partite === 6 && inCodaQ.length === 2 && await contatoreOggi() === 6,
            'DIRETTA_MAX_GIORNO=10, otto iscrizioni dal modulo: 6 password partono subito (60%), 2 restano «in coda» (automatiche)');
        await D.crea(ctx, { idEvento: 'napoli-2026', righe: [{ riga: 2, nome: 'Gina', cognome: 'Gestore', email: 'gina.gestore@esempio.it' }] });
        await invio.accoda(ctx, { idEvento: 'napoli-2026', chi: 'da-inviare' });
        const cronQ = await invio.giroCron(ctx, { budgetMs: 60000 });
        const cQ = cronQ.code.find(c => c.idEvento === 'napoli-2026') || {};
        const quotaDopo = await Promise.all(inCodaQ.map(p => profiloDi(p.emailNorm)));
        vero(postaA('gina.gestore@esempio.it', 'credenziali').length === 1 && quotaDopo.every(p => p.invii['napoli-2026'].stato === 'in coda') && cQ.limiteGiorno === true,
            'il cron: le credenziali del gestore partono (Gina), le 2 del modulo no (oltre la sua parte: aspettano domani)');
        passwordViste.push(passwordDi(postaA('gina.gestore@esempio.it', 'credenziali')[0] || {}));
        await A.passwordDimenticata(ctx, { email: 'quota0@esempio.it', ip: '10.66.0.1' });
        vero(postaA('quota0@esempio.it', 'reimpostazione').length === 1, '«Password dimenticata?» di un iscritto parte ancora (il modulo non ha preso il posto delle reimpostazioni)');
        process.env.DIRETTA_MAX_GIORNO = '0';
        await invio.giroCron(ctx, { budgetMs: 60000 });
        vero(inCodaQ.every(p => postaA(p.emailNorm, 'credenziali').length === 1), 'il giorno dopo (qui: tetto tolto) il cron manda anche le due del modulo');
        quota.forEach(p => passwordViste.push(passwordDi(postaA(p.emailNorm, 'credenziali')[0] || {})));
        delete process.env.DIRETTA_MODULO_ORA;

        /* ---------- 18 ---------- */
        titolo('18. La conferma del sito a chi si iscrive online');
        const confOnline = MNGB.confermaSito({ nome: 'Luca', cognome: 'Nuovo', email: 'luca.nuovo@esempio.it', pagina: ETICHETTA_NAPOLI, data: '26/09/2026 10:00:00', modalita: 'online' }, 'https://esempio.it/completa');
        const FRASE_ONLINE = 'Per seguire la diretta riceverai un\'email con la password per entrare (se non è già arrivata, arriverà prima dell\'evento). Non trovi l\'email? Controlla nella cartella Spam o Promozioni e segna il mittente come sicuro.';
        vero(confOnline.testo.indexOf(FRASE_ONLINE) >= 0 && confOnline.html.indexOf('riceverai un') >= 0 && !/Qualche giorno prima|collegamento e le istruzioni/.test(confOnline.testo + confOnline.html),
            'online: «' + FRASE_ONLINE + '» (niente date promesse, niente «collegamento e istruzioni qualche giorno prima»)');
        const confSala = MNGB.confermaSito({ nome: 'Luca', cognome: 'Nuovo', email: 'luca.nuovo@esempio.it', pagina: ETICHETTA_NAPOLI, data: '26/09/2026 10:00:00', modalita: 'presenza' }, 'https://esempio.it/completa');
        vero(/Il tuo posto è riservato\./.test(confSala.testo) && confSala.testo.indexOf('password') < 0, 'in sala: il testo di sempre («Il tuo posto è riservato.»)');

        /* ---------- 7 bis ---------- */
        titolo('7 bis. Un evento terminato');
        await D.cambiaStato(ctx, { idEvento: 'napoli-2026', stato: 'terminato' });
        await iscrivi({ nome: 'Tea', cognome: 'Tardi', email: 'tea.tardi@esempio.it' });
        vero(!(await profiloDi('tea.tardi@esempio.it')), 'a evento terminato il modulo non crea piu\' account');

        /* ---------- 11 ---------- */
        titolo('11. Separazione, password, log, testi');
        const nelloStudio = await Promise.all(['partecipanti', 'indirizzi', 'eventi'].map(c => studio().collection(c).limit(1).get()));
        vero(nelloStudio.every(s => s.empty), 'nel progetto dello studio nessun dato della diretta (partecipanti, indirizzi, eventi)');
        vero((await ctx.db.collection('iscrizioni').limit(1).get()).empty, 'nel progetto della diretta nessuna scheda del sito');
        const utentiStudio = await admin.app().auth().listUsers(10).catch(() => ({ users: [] }));
        vero(utentiStudio.users.length === 0, 'nessun account creato nel progetto dello studio');
        const password = passwordViste.filter(Boolean);
        vero(password.length >= 6, 'password lette dalla posta: ' + password.length);
        const tuttoFirestore = JSON.stringify((await ctx.db.collection('partecipanti').get()).docs.map(d => d.data()))
            + JSON.stringify((await ctx.db.collection('code').get()).docs.map(d => d.data()))
            + JSON.stringify((await studio().collection('iscrizioni').get()).docs.map(d => d.data()));
        vero(password.every(pw => tuttoFirestore.indexOf(pw) < 0), 'nessuna password in chiaro in Firestore (partecipanti, code, schede)');
        const log = righeLog.join('\n');
        vero(password.every(pw => log.indexOf(pw) < 0), 'nessuna password nei log (' + righeLog.length + ' righe)');
        const logDiretta = righeLog.filter(r => /diretta/i.test(r)).join('\n');
        vero(!/@esempio\.it/i.test(logDiretta), 'nessun indirizzo email nei log della diretta');
        vero(/\[diretta\] iscrizione dal modulo: \{"idEvento":"napoli-2026","esito":"creato","invio":"inviata"/.test(log), 'il log dice evento ed esiti (senza dati personali)');
        const tutta = leggiPosta();
        vero(tutta.length > 0 && tutta.every(m => !/nome utente|nomeutente/i.test(m.oggetto + m.html + m.testo)), 'in nessuna email compare un "nome utente" (' + tutta.length + ' email)');
        vero(tutta.every(m => m.testo.indexOf(FRASE_SPAM) >= 0), 'in tutte: «' + FRASE_SPAM + '»');
        vero(tutta.every(m => !/@utenti\.diretta\./.test(m.a)), 'nessuna email verso gli indirizzi tecnici');
    } catch (e) {
        erroreVero(e);
        rossi++;
    } finally {
        console.log = logVero;
        console.error = erroreVero;
        logVero('\n' + verdi + ' verdi, ' + rossi + ' rossi');
        await fermaEmulatori(emulatori);
        process.exit(rossi ? 1 : 0);
    }
})();
