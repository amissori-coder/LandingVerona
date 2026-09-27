/* ============================================================
   PROVE - gli ascolti della diretta: la fotografia di ogni minuto
   e il riepilogo per la gestione (lib/diretta-ascolti.js,
   api/diretta-ascolti.js, azione 'ascolti' di api/diretta-gestione.js)
   ------------------------------------------------------------
       node diretta/prove/ascolti.prova.js [--firestore 8410] [--auth 9410]

   Se sulle due porte non risponde gia' un emulatore, la prova ne
   avvia uno suo (con le regole vere) e lo ferma alla fine. Le porte
   sono sue: altre prove possono girare insieme.

   L'OROLOGIO SI SPOSTA A MANO: la fotografia riceve `adesso`, il
   calcolo legge ctx.adesso (un contesto con l'ora scelta dalla prova).
   Le letture e le scritture di Firestore si CONTANO (documenti letti
   da query e get, minimo uno per query come le conta Google;
   scritture dei commit riusciti), per dimostrare i costi.

   COSA DIMOSTRA.
   A. Una CURVA NOTA, minuto per minuto, su un evento di un'ora
      (2 ottobre 2025, 9.00-10.00 ora di Roma: ora legale, UTC+2):
      dieci minuti di attesa ('a'), in onda, dieci minuti di pausa,
      di nuovo in onda, cinque minuti a diretta chiusa ('t'); dodici
      persone che entrano, escono e rientrano, una che non e' (piu')
      fra i partecipanti. Il cron salta 2 minuti (i tratti delle persone
      continuano) e poi 6 (i tratti ricominciano); nella curva i minuti
      saltati restano assenti. Controlli ESATTI della curva punto per
      punto, del documento ascolti/{id} (stringhe JSON, versione 1,
      primo e ultimo minuto), delle letture di una fotografia (collegati
      + 3) e della scrittura (una).
   B. Cron doppio sullo stesso minuto (due fotografie insieme): una
      scrive, l'altra salta; cron in ritardo (un minuto gia' passato):
      salta. Niente doppioni nella curva.
   C. Il riepilogo (calcola): picco (a parita' il primo), minimo in onda
      senza i primi e gli ultimi 5 minuti (le pause e l'attesa non
      contano), media, minuti in onda, pause, i 3 cali piu' forti non
      sovrapposti, il programma voce per voce (ore di Roma, una voce
      senza ora), gli ingressi ogni 5 minuti (primi e rientri),
      i dispositivi per persona (l'ultimo accesso), le persone (stato,
      credenziali, primo ingresso, minuti limitati alla durata,
      percentuale fino a 100, segmenti in ms), gli accessi in ordine.
   D. La cache di 60 s: la seconda chiamata costa UNA lettura e ha lo
      stesso `calcolato`; dopo 60 s si ricalcola; a 3 ore dalla fine di
      una diretta chiusa la cache dura 10 minuti. Evento inesistente:
      404 (e nessuna cache); identificativo non valido: 400.
   E. L'azione 'ascolti' della gestione chiamata davvero (token di un
      gestore dall'emulatore Auth): 200 con il risultato, 404, 401.
   F. Gli eventi in finestra: in onda o in pausa sempre; da 120 minuti
      prima dell'inizio a 120 dopo la fine; chiusi, fino a 60 minuti
      dopo la fine. Senza eventi in finestra la fotografia legge solo
      `eventi` (3 letture qui) e non scrive niente. Il confine dei 150
      secondi dei collegati.
   G. La funzione api/diretta-ascolti.js: 401 senza CRON_SECRET (o
      sbagliato, o non impostato), 405 con un altro metodo, 200 con il
      segreto (GET e POST); il log dice solo numeri.
   H. SCALA: mille presenze collegate. Il tempo della fotografia, le sue
      letture (1003), una giornata intera simulata (10 ore di
      fotografie, ingressi e uscite, pausa pranzo): la dimensione del
      documento ascolti (< 300 KB) e il tempo della fotografia sopra di
      esso; il calcolo per la gestione con mille persone (letture,
      tempo, dimensione del risultato e cache).
   Stampa "N verdi, M rossi" e i numeri della scala (anche in
   risultati/ascolti.json). Esce con 1 se qualcosa e' rosso.
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
const PORTA_FS = Number(argomento('firestore', 8410));
const PORTA_AUTH = Number(argomento('auth', 9410));
const PROGETTO = 'demo-ngb-eventi';
const SERVIZIO = path.resolve(__dirname, '../../email-service');
const RISULTATI = path.resolve(__dirname, 'risultati');
const SEGRETO_CRON = 'segreto-della-prova-ascolti';
const GESTORE = { email: 'gestore@prova.it', password: 'Gestore-della-prova-1' };

/* ---------- l'ambiente, PRIMA di caricare il servizio ---------- */
Object.assign(process.env, {
    DIRETTA_EMULATORE: '1',
    DIRETTA_PROGETTO: PROGETTO,
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:' + PORTA_FS,
    FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:' + PORTA_AUTH,
    DIRETTA_ADMIN_EMAILS: GESTORE.email,
    CRON_SECRET: SEGRETO_CRON
});
['DIRETTA_FIREBASE_SERVICE_ACCOUNT', 'ALLOWED_ORIGIN'].forEach(k => { delete process.env[k]; });

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

const GF = require(path.join(SERVIZIO, 'node_modules/@google-cloud/firestore'));
const { DocumentReader } = require(path.join(SERVIZIO, 'node_modules/@google-cloud/firestore/build/src/document-reader'));
const { contesto } = require(path.join(SERVIZIO, 'lib/diretta-firebase'));
const A = require(path.join(SERVIZIO, 'lib/diretta-ascolti'));
const C = require(path.join(SERVIZIO, 'lib/diretta-comune'));
const cronAscolti = require(path.join(SERVIZIO, 'api/diretta-ascolti.js'));
const gestione = require(path.join(SERVIZIO, 'api/diretta-gestione.js'));

let rossi = 0, verdi = 0;
function vero(cond, descrizione, dettaglio) {
    if (cond) { verdi++; logVero('  ok  ' + descrizione); }
    else { rossi++; logVero('ROSSO ' + descrizione + (dettaglio ? '\n       ' + String(dettaglio).slice(0, 1500) : '')); }
}
function titolo(t) { logVero('\n' + t); }
// uguaglianza profonda, con le chiavi in qualunque ordine
function canonico(v) {
    if (Array.isArray(v)) return v.map(canonico);
    if (v && typeof v === 'object') {
        const o = {};
        Object.keys(v).sort().forEach(k => { o[k] = canonico(v[k]); });
        return o;
    }
    return v;
}
function uguale(atteso, avuto, descrizione) {
    const a = JSON.stringify(canonico(atteso)), b = JSON.stringify(canonico(avuto));
    vero(a === b, descrizione, 'atteso ' + a + '\n       avuto  ' + b);
}

/* ---------- il contatore delle letture e delle scritture ----------
   Al livello piu' basso del client di Firestore: ogni query (anche
   dentro una transazione) conta i documenti restituiti, almeno uno
   (come li fattura Google); ogni lettura di documenti (get, getAll,
   transazioni) conta i documenti chiesti; ogni commit riuscito conta le
   sue scritture. Si segnano anche le raccolte toccate. */
const conta = { letture: 0, scritture: 0, raccolte: new Set() };
function azzera() { conta.letture = 0; conta.scritture = 0; conta.raccolte = new Set(); }
const queryVera = GF.Query.prototype._get;
GF.Query.prototype._get = async function (...args) {
    const r = await queryVera.apply(this, args);
    conta.letture += Math.max(1, r.result.size);
    conta.raccolte.add((this._queryOptions && this._queryOptions.collectionId) || '?');
    return r;
};
const letturaVera = DocumentReader.prototype._get;
DocumentReader.prototype._get = async function (...args) {
    const r = await letturaVera.apply(this, args);
    conta.letture += this.allDocuments.length;
    this.allDocuments.forEach(d => conta.raccolte.add(d.parent.id));
    return r;
};
const commitVero = GF.WriteBatch.prototype._commit;
GF.WriteBatch.prototype._commit = async function (...args) {
    const r = await commitVero.apply(this, args);
    conta.scritture += this._ops.length;
    this._ops.forEach(o => conta.raccolte.add(String(o.docPath).split('/')[0]));
    return r;
};
async function misura(fn) {
    azzera();
    const t0 = Date.now();
    const risultato = await fn();
    return { risultato, ms: Date.now() - t0, letture: conta.letture, scritture: conta.scritture, raccolte: Array.from(conta.raccolte).sort() };
}

/* ---------- gli emulatori (come in iscrizioni.prova.js) ---------- */
function portaAperta(porta) {
    return new Promise(r => {
        const s = net.connect(porta, '127.0.0.1');
        s.on('connect', () => { s.destroy(); r(true); });
        s.on('error', () => r(false));
    });
}
async function assicuraEmulatori() {
    if (await portaAperta(PORTA_FS) && await portaAperta(PORTA_AUTH)) return null;
    const cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'ngb-ascolti-'));
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

/* ---------- le funzioni come le chiama Vercel ---------- */
function rispostaFinta() {
    const res = { codice: 0, corpo: null, intestazioni: {} };
    res.setHeader = (k, v) => { res.intestazioni[String(k).toLowerCase()] = v; };
    res.status = c => { res.codice = c; return res; };
    res.json = d => { res.corpo = d; return res; };
    res.end = () => res;
    return res;
}
async function chiamaCron(metodo, intestazioni) {
    const res = rispostaFinta();
    await cronAscolti({ method: metodo, headers: intestazioni || {} }, res);
    return res;
}
async function chiamaGestione(token, corpo) {
    const res = rispostaFinta();
    await gestione({ method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, token ? { authorization: 'Bearer ' + token } : {}), body: corpo }, res);
    return res;
}

// un generatore di numeri casuali con il seme: la giornata simulata e' sempre la stessa
function casuale(seme) {
    let a = seme >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const KB = n => Math.round(n / 1024 * 10) / 10;
// la misura di un documento come la conta Firestore (circa): nomi dei campi + valori + 32
function misuraDocumento(d) {
    let n = 32 + 60;
    Object.keys(d).forEach(k => {
        const v = d[k];
        n += Buffer.byteLength(k) + 1;
        n += typeof v === 'string' ? Buffer.byteLength(v, 'utf8') + 1 : 8;
    });
    return n;
}

const numeri = {};

async function prova(ctx) {
    const db = ctx.db;
    const Ts = ctx.Timestamp;
    let orologio = 0;
    const ctxA = Object.assign({}, ctx, { adesso: () => orologio });

    /* ============================================================
       A. LA CURVA NOTA
       ============================================================ */
    titolo('A. La curva nota: attesa, in onda, pausa, rientri, due buchi del cron');
    const EV = 'ascolti-2025';
    const T0 = C.istanteRoma('2025-10-02', '09:00');
    vero(T0 === Date.UTC(2025, 9, 2, 7, 0, 0), 'l\'evento comincia alle 9.00 di Roma = 7.00 UTC (ora legale)');
    const M0 = T0 / 60000;
    const T = k => T0 + k * 60000;
    await db.doc('eventi/' + EV).set({
        titolo: 'Ascolti di prova', luogo: 'Verona', data: '2025-10-02', oraInizio: '09:00', oraFine: '10:00',
        inizio: Ts.fromMillis(T0), fine: Ts.fromMillis(T(60)), stato: 'programmato',
        programma: [
            { ora: '09.00', titolo: 'Apertura' }, { ora: '09.20', titolo: 'Tavola rotonda' }, { ora: '', titolo: 'Saluti' },
            { ora: '09.40', titolo: 'Interventi' }, { ora: '09.55', titolo: 'Chiusura' }
        ]
    });
    // i partecipanti (in ordine di cognome); p99 ha guardato ma non e' (piu') fra i partecipanti
    const P = [
        ['p01', 'Anna', 'Bianchi', 'inviata'], ['p02', 'Bruno', 'Colombo', 'inviata'], ['p03', 'Carla', 'Esposito', 'inviata'],
        ['p04', 'Dario', 'Ferrari', 'inviata'], ['p05', 'Elena', 'Gallo', 'inviata'], ['p06', 'Fabio', 'Greco', 'inviata'],
        ['p07', 'Giulia', 'Lombardi', 'inviata'], ['p08', 'Luca', 'Marino', 'inviata'], ['p09', 'Marta', 'Moretti', 'inviata'],
        ['p10', 'Nicola', 'Ricci', 'inviata'], ['p11', 'Olga', 'Romano', 'incerto'], ['p12', 'Paolo', 'Russo', 'inviata'],
        ['p13', 'Rita', 'Villa', null]
    ];
    const emailDi = uid => { const p = P.find(x => x[0] === uid); return (p[1] + '.' + p[2]).toLowerCase() + '@esempio.it'; };
    const aziendaDi = uid => P.find(x => x[0] === uid)[2] + ' srl';
    let lotto = db.batch();
    P.forEach(([uid, nome, cognome, invio]) => {
        lotto.set(db.doc('partecipanti/' + uid), Object.assign({
            uid: uid, nome: nome, cognome: cognome, email: emailDi(uid), emailNorm: emailDi(uid), azienda: aziendaDi(uid),
            idEvento: EV, eventi: [EV], stato: 'attivo', authCreato: true
        }, invio ? { invii: { [EV]: { stato: invio, tipo: 'credenziali' } } } : {}));
    });
    await lotto.commit();

    /* Chi ha la pagina aperta, minuto per minuto (k = minuti dalle 9.00,
       estremi inclusi). Nei minuti fotografati chi e' collegato ha
       l'ultimo segnale 25 s prima della fotografia, chi non lo e' 10
       minuti prima: la curva attesa si legge da qui a mano. */
    const APERTA = {
        p01: [[-10, 64]], p02: [[-8, 64]], p03: [[-3, 56]], p04: [[0, 56]], p05: [[0, 20], [24, 64]],
        p06: [[1, 11], [15, 29], [40, 64]], p07: [[2, 26]], p08: [[3, 26]], p09: [[4, 26], [41, 64]],
        p10: [[10, 11], [14, 18]], p13: [[-6, -2]], p99: [[5, 9]]
    };
    const collegato = (uid, k) => APERTA[uid].some(([a, b]) => k >= a && k <= b);
    // il cron salta 2 minuti (12 e 13) e poi 6 (da 45 a 50)
    const SALTATI = new Set([12, 13, 45, 46, 47, 48, 49, 50]);
    const statoDi = k => (k < 0 ? 'programmato' : k < 30 ? 'in_onda' : k < 40 ? 'pausa' : k < 60 ? 'in_onda' : 'terminato');
    let statoEvento = 'programmato';
    const fotografie = {};
    for (let k = -10; k <= 64; k++) {
        if (SALTATI.has(k)) continue;
        if (statoDi(k) !== statoEvento) { statoEvento = statoDi(k); await db.doc('eventi/' + EV).update({ stato: statoEvento }); }
        lotto = db.batch();
        Object.keys(APERTA).forEach(uid => lotto.set(db.doc('presenze/' + EV + '_' + uid), {
            uid: uid, idEvento: EV, ultimo: Ts.fromMillis(collegato(uid, k) ? T(k) - 5000 : T(k) - 600000)
        }, { merge: true }));
        await lotto.commit();
        const adesso = T(k) + 20000;
        if (k === 20) {
            // B. il cron doppio: due fotografie dello stesso minuto nello stesso istante
            const doppie = await Promise.all([A.fotografa(ctx, { adesso: adesso }), A.fotografa(ctx, { adesso: adesso + 5000 })]);
            fotografie.doppie = doppie;
            continue;
        }
        fotografie[k] = await misura(() => A.fotografa(ctx, { adesso: adesso }));
        if (k === 21) {
            fotografie.stessoMinuto = await A.fotografa(ctx, { adesso: T(21) + 50000 });
            fotografie.inRitardo = await A.fotografa(ctx, { adesso: T(19) + 30000 });
        }
    }
    const prima = fotografie[-10];
    uguale([{ idEvento: EV, minuto: M0 - 10, collegati: 1 }], prima.risultato, 'la prima fotografia (in attesa, alle 8.50): un collegato, documento creato');
    vero(prima.letture === 4 && prima.scritture === 1, 'la prima fotografia: 4 letture (2 query su eventi, 1 presenza, il documento che non c\'e\') e 1 scrittura', JSON.stringify(prima));
    const f5 = fotografie[5];
    uguale([{ idEvento: EV, minuto: M0 + 5, collegati: 10 }], f5.risultato, 'alle 9.05 dieci collegati');
    vero(f5.letture === 13 && f5.scritture === 1, 'una fotografia con 10 collegati costa 13 letture (10 presenze + 2 query su eventi + ascolti) e 1 scrittura', JSON.stringify(f5));
    uguale(['ascolti', 'eventi', 'presenze'], f5.raccolte, 'la fotografia tocca solo eventi, presenze e ascolti');
    vero(fotografie[14].risultato[0].collegati === 9 && fotografie[51].risultato[0].collegati === 7, 'dopo i buchi: 9 collegati alle 9.14, 7 alle 9.51');

    titolo('B. Cron doppio e cron in ritardo');
    const doppie = fotografie.doppie.map(x => x[0]);
    vero(doppie.filter(x => x.saltato === true).length === 1 && doppie.filter(x => !x.saltato).length === 1
        && doppie.every(x => x.minuto === M0 + 20 && x.collegati === 9),
    'due fotografie dello stesso minuto insieme: una scrive, l\'altra salta (saltato: true)', JSON.stringify(doppie));
    uguale([{ idEvento: EV, minuto: M0 + 21, collegati: 8, saltato: true }], fotografie.stessoMinuto, 'una seconda fotografia nello stesso minuto (30 s dopo): salta');
    // (i collegati sono quelli di adesso: la query guarda solo da quando)
    uguale([{ idEvento: EV, minuto: M0 + 19, collegati: 8, saltato: true }], fotografie.inRitardo, 'un cron in ritardo (il minuto 9.19, gia\' passato): salta, la curva resta in ordine');

    titolo('A. Il documento ascolti/' + EV);
    const docAscolti = (await db.doc('ascolti/' + EV).get()).data();
    vero(typeof docAscolti.curva === 'string' && typeof docAscolti.persone === 'string' && docAscolti.versione === 1 && docAscolti.idEvento === EV,
        'curva e persone sono STRINGHE JSON (niente voci d\'indice), versione 1');
    vero(docAscolti.primoMinuto === M0 - 10 && docAscolti.ultimoMinuto === M0 + 64 && docAscolti.aggiornato.toMillis() === T(64) + 20000,
        'primoMinuto (8.50), ultimoMinuto (10.04) e aggiornato (l\'ora dell\'ultima fotografia)');
    // la curva attesa, scritta a mano da APERTA: [k, collegati, codice]
    const CURVA = [
        [-10, 1, 'a'], [-9, 1, 'a'], [-8, 2, 'a'], [-7, 2, 'a'], [-6, 3, 'a'], [-5, 3, 'a'], [-4, 3, 'a'], [-3, 4, 'a'], [-2, 4, 'a'], [-1, 3, 'a'],
        [0, 5, 'o'], [1, 6, 'o'], [2, 7, 'o'], [3, 8, 'o'], [4, 9, 'o'], [5, 10, 'o'], [6, 10, 'o'], [7, 10, 'o'], [8, 10, 'o'], [9, 10, 'o'],
        [10, 10, 'o'], [11, 10, 'o'],
        [14, 9, 'o'], [15, 10, 'o'], [16, 10, 'o'], [17, 10, 'o'], [18, 10, 'o'], [19, 9, 'o'], [20, 9, 'o'], [21, 8, 'o'], [22, 8, 'o'],
        [23, 8, 'o'], [24, 9, 'o'], [25, 9, 'o'], [26, 9, 'o'], [27, 6, 'o'], [28, 6, 'o'], [29, 6, 'o'],
        [30, 5, 'p'], [31, 5, 'p'], [32, 5, 'p'], [33, 5, 'p'], [34, 5, 'p'], [35, 5, 'p'], [36, 5, 'p'], [37, 5, 'p'], [38, 5, 'p'], [39, 5, 'p'],
        [40, 6, 'o'], [41, 7, 'o'], [42, 7, 'o'], [43, 7, 'o'], [44, 7, 'o'],
        [51, 7, 'o'], [52, 7, 'o'], [53, 7, 'o'], [54, 7, 'o'], [55, 7, 'o'], [56, 7, 'o'], [57, 5, 'o'], [58, 5, 'o'], [59, 5, 'o'],
        [60, 5, 't'], [61, 5, 't'], [62, 5, 't'], [63, 5, 't'], [64, 5, 't']
    ];
    uguale(CURVA.map(([k, n, c]) => [M0 + k, n, c]), JSON.parse(docAscolti.curva),
        'la curva registrata e\' quella nota, punto per punto (67 minuti; 12-13 e 45-50 assenti, niente doppioni)');
    const TRATTI = {
        p01: [[-10, 44], [51, 64]], p02: [[-8, 44], [51, 64]], p03: [[-3, 44], [51, 56]], p04: [[0, 44], [51, 56]],
        p05: [[0, 20], [24, 44], [51, 64]], p06: [[1, 11], [15, 29], [40, 44], [51, 64]], p07: [[2, 26]], p08: [[3, 26]],
        p09: [[4, 26], [41, 44], [51, 64]], p10: [[10, 18]], p13: [[-6, -2]], p99: [[5, 9]]
    };
    const trattiMinuti = {};
    Object.keys(TRATTI).forEach(u => { trattiMinuti[u] = TRATTI[u].map(([a, b]) => [M0 + a, M0 + b]); });
    uguale(trattiMinuti, JSON.parse(docAscolti.persone),
        'i tratti delle persone: il buco di 2 minuti non li interrompe (p10 da 9.10 a 9.18), quello di 6 si\' (tutti ricominciano alle 9.51); chi manca a una fotografia ricomincia (p05, p06, p09)');

    /* ============================================================
       C. IL RIEPILOGO
       ============================================================ */
    titolo('C. Il riepilogo (calcola)');
    // le presenze finali (i minuti degli attestati) e gli accessi
    const PRESENZE = {
        p01: [T(-10) - 5000, T(64) - 5000, 3000, 1], p02: [T(-8) - 5000, T(64) - 5000, 4000, 1], p03: [T(-3) - 5000, T(56) - 5000, 1500, 1],
        p04: [T(0) - 30000, T(56) - 5000, 1260, 1], p05: [T(0) - 5000, T(64) - 5000, 1230, 2], p06: [T(1) - 5000, T(64) - 5000, 900, 4],
        p07: [T(2) - 5000, T(26) - 5000, 1440, 1], p08: [T(3) - 5000, T(26) - 5000, 1380, 1], p09: [T(4) - 5000, T(64) - 5000, 1800, 2],
        p10: [T(10) - 5000, T(18) - 5000, 450, 1], p13: [T(-6) - 5000, T(-2) - 5000, 0, 1], p99: [T(5) - 5000, T(9) - 5000, 240, 1]
    };
    lotto = db.batch();
    Object.keys(PRESENZE).forEach(uid => {
        const [primo, ultimo, secondi, collegamenti] = PRESENZE[uid];
        lotto.set(db.doc('presenze/' + EV + '_' + uid), {
            uid: uid, idEvento: EV, primo: Ts.fromMillis(primo), ultimo: Ts.fromMillis(ultimo), secondi: secondi, collegamenti: collegamenti, sessione: 's1'
        });
    });
    const ACCESSI = [
        ['p01', T(-11), 'iPhone · Safari'], ['p01', T(30), 'Windows · Chrome'], ['p02', T(-9), 'iPhone · Safari'], ['p03', T(-4), 'Android · Chrome'],
        ['p04', T(0) - 20000, 'Windows · Edge'], ['p05', T(-1), 'Mac · Safari'], ['p06', T(1) - 30000, 'iPad · Safari'],
        ['p07', T(2) - 30000, 'Linux · Firefox'], ['p08', T(3) - 30000, 'iPhone · Chrome'], ['p09', T(4) - 30000, 'Windows · Chrome'],
        ['p10', T(10) - 30000, 'Android · Samsung Internet'], ['p11', T(5), 'Mac · Safari'], ['p13', T(-7), 'Altro · altro browser'],
        ['p99', T(5) - 30000, 'iPhone · Safari']
    ];
    const datiDi = uid => (uid === 'p99'
        ? { nome: 'Ugo', cognome: 'Uscito', email: 'ugo.uscito@esempio.it', azienda: 'Uscito srl' }
        : { nome: P.find(x => x[0] === uid)[1], cognome: P.find(x => x[0] === uid)[2], email: emailDi(uid), azienda: aziendaDi(uid) });
    ACCESSI.forEach(([uid, quando, dispositivo], i) => {
        lotto.set(db.doc('accessi/acc' + String(i).padStart(2, '0')), Object.assign({ uid: uid, idEvento: EV, quando: Ts.fromMillis(quando), dispositivo: dispositivo }, datiDi(uid)));
    });
    await lotto.commit();

    orologio = T(66);
    const calcolo = await misura(() => A.calcola(ctxA, EV, { adesso: orologio }));
    const R = calcolo.risultato;
    vero(R.ok === true && R.calcolato === T(66), 'ok e calcolato (ms)');
    uguale({
        id: EV, titolo: 'Ascolti di prova', inizio: T0, fine: T(60), stato: 'terminato',
        programma: [{ ora: '09.00', titolo: 'Apertura' }, { ora: '09.20', titolo: 'Tavola rotonda' }, { ora: '', titolo: 'Saluti' }, { ora: '09.40', titolo: 'Interventi' }, { ora: '09.55', titolo: 'Chiusura' }]
    }, R.evento, 'l\'evento: titolo, inizio e fine in ms, stato, programma');
    uguale({ attiva: true, primoMinuto: T(-10), ultimoMinuto: T(64) }, R.registrazione, 'la registrazione: attiva, dal primo all\'ultimo minuto (ms)');
    uguale(CURVA.map(([k, n, c]) => ({ t: T(k), n: n, stato: c })), R.curva, 'la curva: un punto per minuto fotografato { t, n, stato }');
    uguale({
        iscritti: 13, credenzialiInviate: 11, entrati: 12, entratiPercento: 92, hannoVisto: 10,
        picco: { n: 10, t: T(5) }, minimo: { n: 6, t: T(27) }, media: 7.9, minutiInOnda: 42, tempoMedioMinuti: 27.6, oreTotali: 4.6
    }, R.riepilogo,
    'il riepilogo: 13 iscritti, 11 credenziali inviate, 12 entrati (92%), 10 hanno visto; PICCO 10 alle 9.05 (il primo dei pari, l\'attesa e la chiusura non contano); '
        + 'MINIMO 6 alle 9.27 (non il 5 dell\'avvio alle 9.00 ne\' della chiusura alle 9.57, non la pausa); media 7,9 su 42 minuti in onda; tempo medio 27,6 minuti (4000 s limitati a 3600); 4,6 ore');
    uguale([{ da: T(30), a: T(40) }], R.pause, 'la pausa: dalle 9.30 alle 9.40');
    uguale([{ t: T(24), da: 9, a: 6, perdita: 3 }, { t: T(16), da: 10, a: 8, perdita: 2 }, { t: T(52), da: 7, a: 5, perdita: 2 }], R.cali,
        'i 3 cali piu\' forti, non sovrapposti, dal piu\' forte: 9.24 (-3), 9.16 (-2; non 9.17 o 9.18, sovrapposti), 9.52 (-2); niente cali attraverso la pausa o i buchi');
    uguale([
        { ora: '09.00', titolo: 'Apertura', da: T(0), a: T(20), media: 9.1, massimo: 10, minimo: 5, minuti: 18 },
        { ora: '09.20', titolo: 'Tavola rotonda', da: T(20), a: T(40), media: 7.8, massimo: 9, minimo: 6, minuti: 10 },
        { ora: '', titolo: 'Saluti', da: null, a: null, media: null, massimo: null, minimo: null, minuti: 0 },
        { ora: '09.40', titolo: 'Interventi', da: T(40), a: T(55), media: 6.9, massimo: 7, minimo: 6, minuti: 9 },
        { ora: '09.55', titolo: 'Chiusura', da: T(55), a: T(60), media: 5.8, massimo: 7, minimo: 5, minuti: 5 }
    ], R.programma, 'il programma voce per voce (ore di Roma): fino alla voce dopo o alla fine; la pausa esclusa; una voce senza ora resta senza numeri');
    uguale([
        { t: T(-10), primi: 3, rientri: 0 }, { t: T(-5), primi: 1, rientri: 0 }, { t: T(0), primi: 6, rientri: 0 }, { t: T(5), primi: 1, rientri: 0 },
        { t: T(10), primi: 1, rientri: 0 }, { t: T(15), primi: 0, rientri: 1 }, { t: T(20), primi: 0, rientri: 1 }, { t: T(40), primi: 0, rientri: 2 }
    ], R.ingressi, 'gli ingressi ogni 5 minuti: primi e rientri, solo le fasce con qualcosa; dopo il buco grande del cron (9.46-9.50) nessun finto rientro di chi c\'era prima e dopo');
    uguale({
        tipi: [{ nome: 'Computer', persone: 6 }, { nome: 'Telefono', persone: 4 }, { nome: 'Altro', persone: 1 }, { nome: 'Tablet', persone: 1 }],
        browser: [{ nome: 'Chrome', persone: 4 }, { nome: 'Safari', persone: 4 }, { nome: 'altro browser', persone: 1 }, { nome: 'Edge', persone: 1 },
            { nome: 'Firefox', persone: 1 }, { nome: 'Samsung Internet', persone: 1 }],
        sistemi: [{ nome: 'Windows', persone: 3 }, { nome: 'Android', persone: 2 }, { nome: 'iPhone', persone: 2 }, { nome: 'Mac', persone: 2 },
            { nome: 'Altro', persone: 1 }, { nome: 'iPad', persone: 1 }, { nome: 'Linux', persone: 1 }]
    }, R.dispositivi, 'i dispositivi PER PERSONA (l\'ultimo accesso: Anna conta Windows, non l\'iPhone di prima; chi non e\' fra i partecipanti no)');
    uguale(P.map(x => x[0]), R.persone.map(x => x.uid), 'le persone: i 13 partecipanti, per cognome (p99 no: non e\' fra i partecipanti)');
    uguale(['ha-visto', 'ha-visto', 'ha-visto', 'ha-visto', 'ha-visto', 'ha-visto', 'ha-visto', 'ha-visto', 'ha-visto', 'ha-visto', 'entrato', 'mai-entrato', 'entrato'],
        R.persone.map(x => x.stato), 'lo stato: ha visto (secondi > 0), entrato (accesso o presenza, niente minuti), mai entrato');
    uguale([50, 60, 25, 21, 20.5, 15, 24, 23, 30, 7.5, 0, 0, 0], R.persone.map(x => x.minutiInOnda), 'i minuti in onda (degli attestati, limitati all\'ora dell\'evento: 4000 s -> 60)');
    uguale([100, 100, 60, 50, 49, 36, 57, 55, 71, 18, 0, 0, 0], R.persone.map(x => x.percentuale), 'la percentuale sui 42 minuti in onda fotografati, fino a 100');
    uguale({
        uid: 'p01', nome: 'Anna', cognome: 'Bianchi', email: 'anna.bianchi@esempio.it', azienda: 'Bianchi srl', stato: 'ha-visto', credenziali: 'inviata',
        primoIngresso: T(-11), ultimaPresenza: T(64) - 5000, minutiInOnda: 50, percentuale: 100, collegamenti: 1, accessi: 2,
        dispositivi: ['Windows · Chrome', 'iPhone · Safari'], segmenti: [[T(-10), T(65)]]
    }, R.persone[0], 'Anna per intero: primo ingresso = il primo accesso (prima della presenza), dispositivi dal piu\' recente, segmenti in ms (fine = fine dell\'ultimo minuto)');
    uguale({
        uid: 'p04', nome: 'Dario', cognome: 'Ferrari', email: 'dario.ferrari@esempio.it', azienda: 'Ferrari srl', stato: 'ha-visto', credenziali: 'inviata',
        primoIngresso: T(0) - 30000, ultimaPresenza: T(56) - 5000, minutiInOnda: 21, percentuale: 50, collegamenti: 1, accessi: 1,
        dispositivi: ['Windows · Edge'], segmenti: [[T(0), T(57)]]
    }, R.persone[3], 'Dario: primo ingresso = la presenza (prima dell\'accesso)');
    uguale([[T(0), T(21)], [T(24), T(65)]], R.persone[4].segmenti, 'Elena: due segmenti (uscita alle 9.21, rientro alle 9.24); il buco grande del cron non la spezza: c\'era prima e dopo');
    uguale({
        uid: 'p11', nome: 'Olga', cognome: 'Romano', email: 'olga.romano@esempio.it', azienda: 'Romano srl', stato: 'entrato', credenziali: 'incerto',
        primoIngresso: T(5), ultimaPresenza: null, minutiInOnda: 0, percentuale: 0, collegamenti: 0, accessi: 1, dispositivi: ['Mac · Safari'], segmenti: []
    }, R.persone[10], 'Olga: un accesso e nessuna presenza = entrata; credenziali \'incerto\'');
    uguale({
        uid: 'p12', nome: 'Paolo', cognome: 'Russo', email: 'paolo.russo@esempio.it', azienda: 'Russo srl', stato: 'mai-entrato', credenziali: 'inviata',
        primoIngresso: null, ultimaPresenza: null, minutiInOnda: 0, percentuale: 0, collegamenti: 0, accessi: 0, dispositivi: [], segmenti: []
    }, R.persone[11], 'Paolo: credenziali inviate e mai entrato (e\' nell\'elenco dei non collegati)');
    uguale({
        uid: 'p13', nome: 'Rita', cognome: 'Villa', email: 'rita.villa@esempio.it', azienda: 'Villa srl', stato: 'entrato', credenziali: 'da inviare',
        primoIngresso: T(-7), ultimaPresenza: T(-2) - 5000, minutiInOnda: 0, percentuale: 0, collegamenti: 1, accessi: 1,
        dispositivi: ['Altro · altro browser'], segmenti: [[T(-6), T(-1)]]
    }, R.persone[12], 'Rita: collegata solo in attesa = entrata senza minuti; credenziali come le dice l\'elenco dei partecipanti');
    vero(R.accessi.length === 14 && R.accessi.every((a, i) => i === 0 || a.quando >= R.accessi[i - 1].quando), 'gli accessi: tutti e 14 (anche di chi non e\' piu\' partecipante), in ordine di tempo');
    uguale({ quando: T(-11), uid: 'p01', email: 'anna.bianchi@esempio.it', nome: 'Anna', cognome: 'Bianchi', azienda: 'Bianchi srl', dispositivo: 'iPhone · Safari' },
        R.accessi[0], 'il primo accesso per intero { quando, uid, email, nome, cognome, azienda, dispositivo }');
    vero(typeof R.nota === 'string' && R.nota.length > 50 && R.nota.indexOf('—') < 0, 'la nota sulle definizioni (senza trattini lunghi)');
    const chiavi = ['ok', 'calcolato', 'evento', 'registrazione', 'riepilogo', 'curva', 'pause', 'cali', 'programma', 'ingressi', 'dispositivi', 'persone', 'accessi', 'nota'];
    uguale(chiavi.slice().sort(), Object.keys(R).sort(), 'il risultato ha esattamente i campi del contratto');
    vero(!/"(ip|token|password|sessione)"/i.test(JSON.stringify(R)), 'nessun IP, token, password o sessione nel risultato');
    vero(calcolo.letture === 1 + 1 + 12 + 14 + 13, 'il calcolo legge evento, registrazione, presenze (12), accessi (14) e partecipanti (13): ' + calcolo.letture + ' letture', JSON.stringify(calcolo.raccolte));

    titolo('C. Casi limite del riepilogo (senza Firestore)');
    const invernale = Date.UTC(2025, 10, 20, 8, 0, 0); // 20 novembre, 9.00 di Roma (ora solare, UTC+1)
    const vuoto = A.risultato({
        id: 'inverno-2025', ev: { titolo: 'Inverno', inizio: Ts.fromMillis(invernale), fine: Ts.fromMillis(invernale + 3600000), stato: 'programmato', programma: [{ ora: '09.30', titolo: 'Unica' }] },
        registrazione: null, presenze: [], accessi: [], partecipanti: [], adesso: invernale
    });
    uguale({ attiva: false, primoMinuto: null, ultimoMinuto: null }, vuoto.registrazione, 'senza fotografie: registrazione non attiva (la pagina lo dice), il resto c\'e\'');
    vero(vuoto.riepilogo.picco === null && vuoto.riepilogo.minimo === null && vuoto.riepilogo.media === 0 && vuoto.riepilogo.minutiInOnda === 0
        && vuoto.riepilogo.entratiPercento === 0 && vuoto.curva.length === 0 && vuoto.ingressi.length === 0,
    'senza minuti in onda: picco e minimo null, media 0; nessun iscritto: 0%');
    vero(vuoto.programma[0].da === Date.UTC(2025, 10, 20, 8, 30, 0) && vuoto.programma[0].a === invernale + 3600000 && vuoto.programma[0].media === null,
        'in ora solare "09.30" e\' 8.30 UTC (Europe/Rome), e l\'ultima voce finisce con l\'evento');
    const corta = A.risultato({
        id: 'corta-2025', ev: { inizio: Ts.fromMillis(T0), fine: Ts.fromMillis(T(10)), stato: 'terminato', programma: [] },
        registrazione: { primoMinuto: M0, ultimoMinuto: M0 + 9, curva: JSON.stringify([[M0, 3, 'o'], [M0 + 1, 5, 'o'], [M0 + 2, 5, 'o'], [M0 + 3, 2, 'o'], [M0 + 9, 2, 'o']]), persone: '{}' },
        presenze: [], accessi: [], partecipanti: [], adesso: T(20)
    });
    vero(corta.riepilogo.minimo.n === 2 && corta.riepilogo.minimo.t === T(3) && corta.riepilogo.picco.t === T(1),
        'con 10 minuti in onda o meno il minimo e\' su tutti (a parita\' il primo), come il picco');

    /* ============================================================
       D. LA CACHE
       ============================================================ */
    titolo('D. La cache (ascoltiCache): 60 s, poi 10 minuti a 3 ore dalla fine');
    orologio = T(66);
    const c1 = await misura(() => A.ascolti(ctxA, EV));
    vero(c1.risultato.calcolato === T(66) && c1.letture === 1 + calcolo.letture && c1.scritture === 1,
        'la prima chiamata calcola (' + c1.letture + ' letture: la cache che non c\'e\' + il calcolo) e salva la cache (1 scrittura)', JSON.stringify({ l: c1.letture, s: c1.scritture }));
    const docCache = (await db.doc('ascoltiCache/' + EV).get()).data();
    vero(docCache.calcolato.toMillis() === T(66) && docCache.datiGz && !('dati' in docCache)
        && JSON.parse(require('zlib').gunzipSync(Buffer.from(docCache.datiGz)).toString('utf8')).calcolato === T(66),
        'ascoltiCache/{id}: { calcolato (Timestamp), datiGz (il JSON del risultato compresso con gzip) }');
    orologio = T(66) + 59000;
    const c2 = await misura(() => A.ascolti(ctxA, EV));
    vero(c2.letture === 1 && c2.scritture === 0 && c2.risultato.calcolato === T(66), 'dopo 59 s: UNA lettura e lo stesso calcolato', JSON.stringify({ l: c2.letture, calcolato: c2.risultato.calcolato }));
    uguale(c1.risultato, c2.risultato, '...e lo stesso risultato');
    orologio = T(67);
    const c3 = await misura(() => A.ascolti(ctxA, EV));
    vero(c3.risultato.calcolato === T(67) && c3.letture > 1, 'dopo 60 s si ricalcola (diretta finita da meno di 3 ore)');
    orologio = T(60) + 3 * 3600000 + 60000;
    const c4 = await A.ascolti(ctxA, EV);
    orologio += 9 * 60000;
    const c5 = await misura(() => A.ascolti(ctxA, EV));
    vero(c4.calcolato === T(60) + 3 * 3600000 + 60000 && c5.risultato.calcolato === c4.calcolato && c5.letture === 1,
        'piu\' di 3 ore dopo la fine di una diretta chiusa: dopo 9 minuti ancora la cache (1 lettura)');
    orologio += 60000;
    const c6 = await A.ascolti(ctxA, EV);
    vero(c6.calcolato === orologio, '...e dopo 10 minuti si ricalcola');
    vero(A.durataCache({ evento: { stato: 'in_onda', fine: 0 } }, Date.now()) === 60000 && A.durataCache({ evento: { stato: 'pausa', fine: 0 } }, Date.now()) === 60000
        && A.durataCache({ evento: { stato: 'terminato', fine: 1000 } }, 1000 + 3 * 3600000) === 60000
        && A.durataCache({ evento: { stato: 'terminato', fine: 1000 } }, 1001 + 3 * 3600000) === 600000
        && A.durataCache({ evento: { stato: 'programmato', fine: 5e12 } }, 1e12) === 60000,
    'la durata della cache: 60 s in onda o in pausa (anche oltre la fine) e fino a 3 ore dopo la fine, 10 minuti oltre');
    const inesistente = await misura(() => A.ascolti(ctxA, 'inesistente-2025').then(() => null, e => e));
    vero(inesistente.risultato && inesistente.risultato.stato === 404 && inesistente.risultato.codice === 'evento' && inesistente.letture === 2 && inesistente.scritture === 0,
        'evento inesistente: 404 (2 letture: la cache e l\'evento), niente in cache', JSON.stringify({ e: inesistente.risultato && inesistente.risultato.stato, l: inesistente.letture }));
    const nonValido = await A.ascolti(ctxA, 'Evento Strano!').then(() => null, e => e);
    vero(nonValido && nonValido.stato === 400, 'identificativo non valido: 400');

    /* ============================================================
       E. L'AZIONE DELLA GESTIONE
       ============================================================ */
    titolo('E. L\'azione \'ascolti\' di api/diretta-gestione.js (chiamata davvero)');
    const utente = await ctx.auth.createUser({ email: GESTORE.email, password: GESTORE.password, emailVerified: true });
    await ctx.auth.setCustomUserClaims(utente.uid, { gestore: true });
    const accesso = await fetch('http://127.0.0.1:' + PORTA_AUTH + '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=finta', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: GESTORE.email, password: GESTORE.password, returnSecureToken: true })
    }).then(r => r.json());
    const g1 = await chiamaGestione(accesso.idToken, { azione: 'ascolti', idEvento: EV });
    vero(g1.codice === 200 && g1.corpo.ok === true && g1.corpo.curva.length === 67 && g1.corpo.riepilogo.picco.n === 10 && g1.corpo.persone.length === 13
        && g1.intestazioni['cache-control'] === 'no-store', 'il gestore: 200 con il risultato (67 punti, picco 10, 13 persone), no-store', g1.codice + ' ' + JSON.stringify(g1.corpo).slice(0, 200));
    const g2 = await chiamaGestione(accesso.idToken, { azione: 'ascolti', idEvento: 'inesistente-2025' });
    vero(g2.codice === 404 && g2.corpo.ok === false && g2.corpo.codice === 'evento', 'evento inesistente: 404 come le altre azioni', g2.codice + ' ' + JSON.stringify(g2.corpo));
    const g3 = await chiamaGestione(null, { azione: 'ascolti', idEvento: EV });
    vero(g3.codice === 401, 'senza accesso: 401');

    /* ============================================================
       F. GLI EVENTI IN FINESTRA
       ============================================================ */
    titolo('F. Gli eventi in finestra');
    const W = Date.UTC(2025, 10, 15, 12, 0, 0);
    const H = 3600000, MIN = 60000;
    const evento = (stato, inizio, fine) => ({ stato: stato, inizio: Ts.fromMillis(inizio), fine: Ts.fromMillis(fine), titolo: 'Finestra' });
    await Promise.all([
        db.doc('eventi/fuori-prima').set(evento('programmato', W + 121 * MIN, W + 4 * H)),
        db.doc('eventi/fuori-dopo').set(evento('terminato', W - 3 * H, W - 61 * MIN)),
        db.doc('eventi/fuori-vecchio').set(evento('terminato', W - 9 * H, W - 5 * H))
    ]);
    const vuota = await misura(() => A.fotografa(ctx, { adesso: W }));
    vero(vuota.risultato.length === 0 && vuota.letture === 3 && vuota.scritture === 0 && vuota.raccolte.join() === 'eventi',
        'nessun evento in finestra: nessuna fotografia, solo 3 letture di `eventi` (2 documenti + una query vuota), nessuna scrittura', JSON.stringify(vuota));
    await Promise.all([
        db.doc('eventi/dentro-prima').set(evento('programmato', W + 120 * MIN, W + 5 * H)),
        db.doc('eventi/dentro-dopo').set(evento('programmato', W - 5 * H, W - 120 * MIN)),
        db.doc('eventi/dentro-terminato').set(evento('terminato', W - 3 * H, W - 60 * MIN)),
        db.doc('eventi/dimenticato').set(evento('in_onda', W - 80 * H, W - 76 * H)),
        db.doc('eventi/pausa-lunga').set(evento('pausa', W - 30 * H, W - 26 * H)),
        db.doc('eventi/fuori-dopo-due-ore').set(evento('programmato', W - 5 * H, W - 121 * MIN))
    ]);
    uguale(['dentro-dopo', 'dentro-prima', 'dentro-terminato', 'dimenticato', 'pausa-lunga'], (await A.eventiInFinestra(ctx, W)).map(e => e.id),
        'in finestra: 120 minuti prima dell\'inizio, 120 dopo la fine, chiusa da 60 minuti, in onda o in pausa da giorni; fuori: 121 minuti prima, 121 dopo, chiusa da 61 minuti');
    vero(A.inFinestra({ stato: 'terminato', inizio: W - H, fine: W - 30 * MIN }, W) && !A.inFinestra({ stato: 'terminato', inizio: W - H, fine: W - 61 * MIN }, W)
        && A.inFinestra({ stato: 'programmato', inizio: W - H, fine: W - 61 * MIN }, W) && !A.inFinestra({ stato: 'programmato' }, W),
    'chiusa: fuori 60 minuti dopo la fine (programmata ancora dentro fino a 120); senza orari: fuori');
    const conQuelli = await A.fotografa(ctx, { adesso: W });
    uguale(['dentro-dopo', 'dentro-prima', 'dentro-terminato', 'dimenticato', 'pausa-lunga'], conQuelli.map(x => x.idEvento), 'la fotografia li fa tutti (0 collegati)');
    const codici = {};
    for (const id of ['dentro-dopo', 'dentro-terminato', 'dimenticato', 'pausa-lunga']) codici[id] = JSON.parse((await db.doc('ascolti/' + id).get()).data().curva)[0][2];
    uguale({ 'dentro-dopo': 'a', 'dentro-terminato': 't', 'dimenticato': 'o', 'pausa-lunga': 'p' }, codici, 'il codice del minuto: a (programmato), t, o, p');
    // il confine dei 150 secondi (lo stesso della regia)
    await db.doc('eventi/confine-2025').set(evento('in_onda', W - H, W + H));
    lotto = db.batch();
    [['c1', W - 150000], ['c2', W - 150001], ['c3', W - 1000]].forEach(([uid, ultimo]) => lotto.set(db.doc('presenze/confine-2025_' + uid), { uid: uid, idEvento: 'confine-2025', ultimo: Ts.fromMillis(ultimo) }));
    lotto.set(db.doc('presenze/dimenticato_c4'), { uid: 'c4', idEvento: 'dimenticato', ultimo: Ts.fromMillis(W) });
    await lotto.commit();
    // alla stessa ora di prima: gli altri eventi saltano (minuto gia' fatto), confine-2025 e' nuovo
    const confine = (await A.fotografa(ctx, { adesso: W })).find(x => x.idEvento === 'confine-2025');
    const personeConfine = JSON.parse((await db.doc('ascolti/confine-2025').get()).data().persone);
    vero(confine.collegati === 2 && Object.keys(personeConfine).sort().join() === 'c1,c3',
        'collegato = segnale negli ultimi 150 s: 150 s si\', 150,001 no (e la presenza di un altro evento non conta)', JSON.stringify(confine) + ' ' + JSON.stringify(personeConfine));
    // via gli eventi della finestra (in onda o in pausa: la fotografia li farebbe sempre)
    lotto = db.batch();
    ['fuori-prima', 'fuori-dopo', 'fuori-vecchio', 'dentro-prima', 'dentro-dopo', 'dentro-terminato', 'dimenticato', 'pausa-lunga', 'fuori-dopo-due-ore', 'confine-2025']
        .forEach(id => { lotto.delete(db.doc('eventi/' + id)); lotto.delete(db.doc('ascolti/' + id)); });
    await lotto.commit();

    /* ============================================================
       H. SCALA: MILLE PERSONE
       ============================================================ */
    titolo('H. Scala: mille presenze collegate');
    const ES = 'scala-2025';
    const S0 = C.istanteRoma('2025-10-03', '09:00');
    const S = k => S0 + k * 60000;
    const SM0 = S0 / 60000;
    const r = casuale(20251003);
    const NOMI = ['Mario', 'Giulia', 'Luca', 'Francesca', 'Marco', 'Sara', 'Andrea', 'Chiara', 'Giuseppe', 'Valentina', 'Alessandro', 'Federica', 'Stefano', 'Elisa', 'Roberto', 'Martina', 'Paolo', 'Silvia', 'Davide', 'Laura'];
    const COGNOMI = ['Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco', 'Bruno', 'Gallo', 'Conti', 'De Luca', 'Mancini', 'Costa', 'Giordano', 'Rizzo', 'Lombardi', 'Moretti', 'Barbieri', 'Fontana', 'Santoro', 'Mariani', 'Rinaldi', 'Caruso', 'Ferrara', 'Galli', 'Martini', 'Leone'];
    const DISPOSITIVI = ['iPhone · Safari', 'Windows · Chrome', 'Android · Chrome', 'Mac · Safari', 'Windows · Edge', 'iPad · Safari', 'Android · Samsung Internet', 'Mac · Chrome', 'Linux · Firefox', 'Tablet Android · Chrome'];
    const PROGRAMMA_SCALA = ['09.00', '09.30', '10.00', '10.45', '11.30', '12.15', '13.00', '14.00', '14.30', '15.15', '16.00', '16.30', '16.50']
        .map((ora, i) => ({ ora: ora, titolo: 'Voce ' + (i + 1) + ' del programma della giornata' }));
    await db.doc('eventi/' + ES).set({
        titolo: 'Mille persone', luogo: 'Verona', data: '2025-10-03', oraInizio: '09:00', oraFine: '17:00',
        inizio: Ts.fromMillis(S0), fine: Ts.fromMillis(S(480)), stato: 'in_onda', programma: PROGRAMMA_SCALA
    });
    const MILLE = [];
    for (let i = 0; i < 1000; i++) {
        const nome = NOMI[i % NOMI.length], cognome = COGNOMI[Math.floor(i / NOMI.length) % COGNOMI.length];
        MILLE.push({ uid: 'p' + crypto.randomBytes(10).toString('hex'), nome: nome, cognome: cognome, email: (nome + '.' + cognome).toLowerCase().replace(/ /g, '') + i + '@esempio.it', azienda: 'Azienda ' + (i % 150) + ' srl' });
    }
    let accessiScala = 0;
    for (let i = 0; i < 1000; i += 250) {
        lotto = db.batch();
        MILLE.slice(i, i + 250).forEach(p => {
            lotto.set(db.doc('partecipanti/' + p.uid), {
                uid: p.uid, nome: p.nome, cognome: p.cognome, email: p.email, emailNorm: p.email, azienda: p.azienda, idEvento: ES, eventi: [ES], stato: 'attivo',
                authCreato: true, invii: { [ES]: { stato: r() < 0.9 ? 'inviata' : 'da inviare', tipo: 'credenziali' } }
            });
            lotto.set(db.doc('presenze/' + ES + '_' + p.uid), {
                uid: p.uid, idEvento: ES, primo: Ts.fromMillis(S(-30)), ultimo: Ts.fromMillis(S(0) + 10000),
                secondi: Math.floor(r() * 480) * 60, collegamenti: 1 + Math.floor(r() * 5), sessione: 's' + Math.floor(r() * 1e6)
            });
            const quanti = r() < 0.5 ? 2 : 1;
            for (let a = 0; a < quanti; a++) {
                accessiScala++;
                lotto.set(db.collection('accessi').doc(), {
                    uid: p.uid, email: p.email, nome: p.nome, cognome: p.cognome, azienda: p.azienda, idEvento: ES,
                    quando: Ts.fromMillis(S(-40 + a * 200) + Math.floor(r() * 600000)), dispositivo: DISPOSITIVI[Math.floor(r() * DISPOSITIVI.length)]
                });
            }
        });
        await lotto.commit();
    }
    const scala = [];
    for (let k = 0; k < 3; k++) scala.push(await misura(() => A.fotografa(ctx, { adesso: S(k) + 20000 })));
    vero(scala.every(x => x.risultato.length === 1 && x.risultato[0].collegati === 1000 && x.letture === 1003 && x.scritture === 1),
        'tre fotografie di fila con 1000 collegati: 1003 letture e 1 scrittura ciascuna', JSON.stringify(scala.map(x => [x.letture, x.scritture, x.risultato])));
    vero(scala.every(x => x.ms < 10000), 'tempo della fotografia con 1000 collegati: ' + scala.map(x => x.ms + ' ms').join(', '));
    numeri.fotografia1000 = scala.map(x => ({ ms: x.ms, letture: x.letture, scritture: x.scritture }));

    /* Una giornata intera simulata (senza Firestore, con la stessa
       funzione della fotografia): dalle 7.00 alle 17.00, pausa pranzo
       dalle 13.00 alle 14.00. Ogni persona arriva fra le 7.30 e le
       10.00, se ne va fra le 14.00 e le 18.20 (dopo le 17.00: resta
       fino alla fine), e cade qualche volta (70%: 0-2 volte, 25%: 3-7,
       5%: 10-20; ogni volta da 3 a 15 minuti); a pranzo meta' esce. */
    function giornata(cadute) {
        const persone = MILLE.map(p => {
            const arrivo = -90 + Math.floor(r() * 150);
            const uscita = 300 + Math.floor(r() * 260);
            const buchi = [];
            const n = cadute(r());
            for (let i = 0; i < n; i++) {
                const da = arrivo + 1 + Math.floor(r() * Math.max(1, Math.min(uscita, 479) - arrivo - 2));
                buchi.push([da, da + 3 + Math.floor(r() * 13)]);
            }
            if (r() < 0.5) buchi.push([240, 240 + 20 + Math.floor(r() * 40)]);
            return { uid: p.uid, arrivo: arrivo, uscita: uscita, buchi: buchi };
        });
        let stato = null;
        for (let k = -120; k <= 479; k++) {
            const uids = persone.filter(p => k >= p.arrivo && k <= p.uscita && !p.buchi.some(([a, b]) => k >= a && k <= b)).map(p => p.uid);
            stato = A.aggiungiMinuto(stato, SM0 + k, uids, k < 0 ? 'a' : (k >= 240 && k < 300) ? 'p' : 'o');
        }
        return stato;
    }
    async function provaGiornata(nome, cadute, adesso) {
        const t0 = Date.now();
        const stato = giornata(cadute);
        const simulazioneMs = Date.now() - t0;
        const segmenti = Object.keys(stato.persone).reduce((s, u) => s + stato.persone[u].length, 0);
        await db.doc('ascolti/' + ES).set({
            idEvento: ES, aggiornato: Ts.fromMillis(S(479) + 20000), primoMinuto: stato.primoMinuto, ultimoMinuto: stato.ultimoMinuto,
            curva: JSON.stringify(stato.curva), persone: JSON.stringify(stato.persone), versione: 1
        });
        // alle 17.00 tutti collegati: la fotografia piu' pesante (tutti continuano o ricominciano)
        for (let i = 0; i < 1000; i += 500) {
            lotto = db.batch();
            MILLE.slice(i, i + 500).forEach(p => lotto.update(db.doc('presenze/' + ES + '_' + p.uid), { ultimo: Ts.fromMillis(adesso - 30000) }));
            await lotto.commit();
        }
        const f = await misura(() => A.fotografa(ctx, { adesso: adesso }));
        const doc = (await db.doc('ascolti/' + ES).get()).data();
        const byte = misuraDocumento(doc);
        const esito = {
            simulazioneMs: simulazioneMs, puntiCurva: JSON.parse(doc.curva).length, segmenti: segmenti + 0, segmentiPerPersona: Math.round(segmenti / 1000 * 10) / 10,
            curvaKB: KB(Buffer.byteLength(doc.curva)), personeKB: KB(Buffer.byteLength(doc.persone)), documentoKB: KB(byte),
            fotografiaMs: f.ms, letture: f.letture, scritture: f.scritture, collegati: f.risultato[0] && f.risultato[0].collegati, ferme: doc.personeFerme === true
        };
        numeri[nome] = esito;
        return { esito: esito, byte: byte, doc: doc };
    }
    const normale = await provaGiornata('giornataNormale', x => (x < 0.7 ? Math.floor(x / 0.7 * 3) : x < 0.95 ? 3 + Math.floor((x - 0.7) / 0.25 * 5) : 10 + Math.floor((x - 0.95) / 0.05 * 11)), S(480) + 20000);
    logVero('       giornata normale: ' + JSON.stringify(normale.esito));
    vero(normale.esito.collegati === 1000 && normale.esito.letture === 1003 && normale.esito.scritture === 1 && normale.esito.puntiCurva === 601 && !normale.esito.ferme,
        'la fotografia sopra una giornata intera (600 minuti gia\' registrati): 1000 collegati, 1003 letture, 1 scrittura; la curva ha 601 punti');
    vero(normale.byte < 300 * 1024, 'il documento ascolti con 1000 persone e una giornata intera: ' + normale.esito.documentoKB + ' KB (< 300 KB), '
        + normale.esito.segmentiPerPersona + ' segmenti a persona; fotografia in ' + normale.esito.fotografiaMs + ' ms');
    const pesante = await provaGiornata('giornataPesante', () => 12, S(480) + 20000);
    logVero('       giornata pesante (12 cadute a testa): ' + JSON.stringify(pesante.esito));
    vero(pesante.esito.collegati === 1000 && pesante.byte < 700 * 1024 && !pesante.esito.ferme,
        'anche con 12 cadute a testa (' + pesante.esito.segmentiPerPersona + ' segmenti a persona) la fotografia scrive: ' + pesante.esito.documentoKB + ' KB in ' + pesante.esito.fotografiaMs + ' ms');
    // la rete di sicurezza: una stringa delle persone oltre il limite resta ferma, la curva va avanti
    const enorme = {};
    MILLE.forEach(p => { enorme[p.uid] = Array.from({ length: 36 }, (_, i) => [SM0 - 200 + i * 10, SM0 - 195 + i * 10]); });
    const personeEnormi = JSON.stringify(enorme);
    await db.doc('ascolti/' + ES).set({
        idEvento: ES, aggiornato: Ts.fromMillis(S(480)), primoMinuto: SM0 - 200, ultimoMinuto: SM0 + 480,
        curva: JSON.stringify([[SM0 + 480, 1000, 'o']]), persone: personeEnormi, versione: 1
    });
    const oltre = await A.fotografa(ctx, { adesso: S(481) + 20000 });
    const docOltre = (await db.doc('ascolti/' + ES).get()).data();
    vero(Buffer.byteLength(personeEnormi) > A.LIMITE_PERSONE && oltre[0].collegati === 1000 && !oltre[0].errore && docOltre.personeFerme === true
        && docOltre.persone === personeEnormi && JSON.parse(docOltre.curva).length === 2 && docOltre.ultimoMinuto === SM0 + 481,
    'oltre ' + KB(A.LIMITE_PERSONE) + ' KB di persone (' + KB(Buffer.byteLength(personeEnormi)) + ' KB): le persone restano ferme (personeFerme), la curva va avanti');

    // il calcolo per la gestione con mille persone, sopra la giornata normale
    await db.doc('ascolti/' + ES).set({
        idEvento: ES, aggiornato: Ts.fromMillis(S(480)), primoMinuto: normale.doc.primoMinuto, ultimoMinuto: normale.doc.ultimoMinuto,
        curva: normale.doc.curva, persone: normale.doc.persone, versione: 1
    });
    orologio = S(481);
    const grande = await misura(() => A.calcola(ctxA, ES, { adesso: orologio }));
    const byteRisultato = Buffer.byteLength(JSON.stringify(grande.risultato), 'utf8');
    numeri.calcolo1000 = { ms: grande.ms, letture: grande.letture, accessi: accessiScala, risultatoKB: KB(byteRisultato), inCache: byteRisultato <= A.MAX_CACHE };
    logVero('       calcolo con 1000 persone: ' + JSON.stringify(numeri.calcolo1000));
    vero(grande.risultato.persone.length === 1000 && grande.risultato.accessi.length === accessiScala && grande.risultato.curva.length === 601
        && grande.risultato.programma.length === 13 && grande.risultato.riepilogo.picco && grande.risultato.riepilogo.minimo,
    'il calcolo con 1000 persone: 1000 persone, ' + accessiScala + ' accessi, 601 punti, 13 voci del programma');
    vero(grande.letture === 1 + 1 + 1000 + accessiScala + 1000, 'le letture del calcolo: evento + registrazione + 1000 presenze + ' + accessiScala + ' accessi + 1000 partecipanti = ' + grande.letture);
    vero(grande.ms < 20000, 'tempo del calcolo con 1000 persone: ' + grande.ms + ' ms; risultato ' + KB(byteRisultato) + ' KB');
    const cacheGrande = await misura(() => A.ascolti(ctxA, ES));
    const docGrande = await db.doc('ascoltiCache/' + ES).get();
    const salvata = docGrande.exists;
    const byteCompressi = salvata ? Buffer.from(docGrande.data().datiGz).length : 0;
    numeri.cache1000 = { risultatoKB: KB(Buffer.byteLength(JSON.stringify(cacheGrande.risultato))), compressoKB: KB(byteCompressi) };
    vero(salvata && byteCompressi > 0 && byteCompressi < 250 * 1024,
        'con mille persone la cache si salva compressa: risultato di ' + numeri.cache1000.risultatoKB + ' KB, compresso ' + numeri.cache1000.compressoKB + ' KB (limite 900 KB)');
    if (salvata) {
        orologio += 30000;
        const dopo = await misura(() => A.ascolti(ctxA, ES));
        vero(dopo.letture === 1 && dopo.risultato.calcolato === cacheGrande.risultato.calcolato, 'con mille persone la scheda riaperta entro 60 s costa 1 lettura');
    }
    // fine della scala: la diretta chiusa (una diretta in onda si fotograferebbe sempre)
    await db.doc('eventi/' + ES).update({ stato: 'terminato' });

    /* ============================================================
       G. LA FUNZIONE CRON
       ============================================================ */
    titolo('G. La funzione api/diretta-ascolti.js');
    const ora = Date.now();
    await db.doc('eventi/cron-prova').set(evento('in_onda', ora - H, ora + H));
    await db.doc('presenze/cron-prova_p01').set({ uid: 'p01', idEvento: 'cron-prova', ultimo: Ts.fromMillis(ora - 1000) });
    vero((await chiamaCron('GET')).codice === 401, 'senza Authorization: 401');
    vero((await chiamaCron('GET', { authorization: 'Bearer sbagliato' })).codice === 401, 'segreto sbagliato: 401');
    vero((await chiamaCron('GET', { authorization: SEGRETO_CRON })).codice === 401, 'il segreto senza "Bearer": 401');
    delete process.env.CRON_SECRET;
    vero((await chiamaCron('GET', { authorization: 'Bearer ' })).codice === 401, 'CRON_SECRET non impostato: 401 anche con "Bearer " vuoto');
    process.env.CRON_SECRET = SEGRETO_CRON;
    vero((await chiamaCron('PUT', { authorization: 'Bearer ' + SEGRETO_CRON })).codice === 405, 'metodo diverso da GET/POST: 405');
    vero(!(await db.doc('ascolti/cron-prova').get()).exists, 'le chiamate rifiutate non hanno fotografato niente');
    const righePrima = righeLog.length;
    const g = await chiamaCron('GET', { authorization: 'Bearer ' + SEGRETO_CRON });
    const minutoCron = g.corpo && g.corpo.fotografie && g.corpo.fotografie.find(x => x.idEvento === 'cron-prova');
    vero(g.codice === 200 && g.corpo.ok === true && minutoCron && minutoCron.collegati === 1 && !minutoCron.saltato && g.intestazioni['cache-control'] === 'no-store',
        'con il segreto (GET di Vercel): 200, la fotografia (1 collegato), no-store', JSON.stringify(g.corpo));
    const po = await chiamaCron('POST', { authorization: 'Bearer ' + SEGRETO_CRON });
    const secondo = po.corpo && po.corpo.fotografie && po.corpo.fotografie.find(x => x.idEvento === 'cron-prova');
    vero(po.codice === 200 && secondo && (secondo.minuto === minutoCron.minuto ? secondo.saltato === true : secondo.minuto > minutoCron.minuto),
        'anche POST (lancio a mano): 200; nello stesso minuto salta', JSON.stringify(secondo));
    const logCron = righeLog.slice(righePrima).filter(x => /^\[diretta-ascolti\]/.test(x));
    vero(logCron.length === 2 && logCron.every(x => /^\[diretta-ascolti\] \[\{"idEvento":"[a-z0-9-]+","minuto":\d+,"collegati":\d+(,"saltato":true)?\}(,\{[^{}]*\})*\]$/.test(x)),
        'il log del cron: solo [{ idEvento, minuto, collegati, saltato? }]', logCron.join('\n'));
    await db.doc('eventi/cron-prova').update({ stato: 'terminato', inizio: Ts.fromMillis(ora - 5 * H), fine: Ts.fromMillis(ora - 4 * H) });

    titolo('Log');
    vero(!righeLog.some(x => /@esempio\.it|anna|bianchi/i.test(x)), 'nessun dato personale nei log del servizio (' + righeLog.length + ' righe)');
    vero(!righeLog.some(x => /fotografia di .*:|errore/i.test(x)), 'nessun errore nei log', righeLog.filter(x => /errore|fotografia di/i.test(x)).join('\n'));
}

(async () => {
    let emulatori = null;
    const t = Date.now();
    try {
        emulatori = await assicuraEmulatori();
        await svuota();
        await prova(contesto());
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
            fs.writeFileSync(path.join(RISULTATI, 'ascolti.json'), JSON.stringify(Object.assign({ quando: new Date().toISOString() }, numeri), null, 2));
        } catch (_) { /* i numeri sono anche qui sotto */ }
        logVero('\n' + verdi + ' verdi, ' + rossi + ' rossi');
        await fermaEmulatori(emulatori);
        process.exit(rossi ? 1 : 0);
    }
})();
