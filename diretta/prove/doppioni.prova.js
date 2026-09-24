/* ============================================================
   PROVE - nessun account doppio, nessun nome utente doppio
   ------------------------------------------------------------
       node doppioni.prova.js [--firestore 8180] [--auth 9180]

   Se sulle due porte non risponde gia' un emulatore, la prova ne
   avvia uno suo (con le regole vere) e lo ferma alla fine.

   Chiama DIRETTAMENTE le funzioni di email-service/lib/diretta-dati.js
   (le stesse che usa api/diretta-gestione.js), contro gli emulatori di
   Firestore e di Auth, e fa quello che fa la pagina di gestione:
   anteprima -> analizzaRighe -> 'crea' a gruppi di 25.

   COSA DIMOSTRA.
   1. Lo stesso file caricato due volte: la seconda volta zero account.
   2. La stessa email scritta in modi diversi (maiuscole, spazi): un
      account solo, anche quando le righe arrivano insieme al servizio.
   3. Due caricamenti CONTEMPORANEI dello stesso file e un terzo file
      diverso, con tanti "Mario Rossi": zero account doppi e zero nomi
      utente doppi, controllando indirizzi, nomiUtente, partecipanti e
      gli utenti di Firebase Auth (listUsers).
   4. Gli omonimi numerati: mariorossi, mariorossi2, mariorossi3...
   5. Una persona gia' presente aggiunta a un secondo evento: nessun
      account nuovo, claims aggiornati con i due eventi.
   6. La correzione di nome e cognome: nome utente ricalcolato, vecchio
      nome liberato insieme ai suoi contatori dei tentativi (e solo ai
      suoi), controllo dei doppioni (anche sull'email).
   E in piu': l'indirizzo si salva normalizzato (anche con uno spazio
   invisibile U+200B copiato da Excel), lo stesso a cui si spedira'.
   7. Un nome utente scritto a mano gia' occupato: il servizio ne
      assegna un altro e lo dice.
   8. Un account rimasto a meta' (Auth non creato) si completa
      ricaricando il file, con lo stesso uid.
   Alla fine: "account creati: N, email uniche: N, nomi utente unici: N".
   Esce con 1 se qualcosa e' rosso.
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
const PORTA_FS = Number(argomento('firestore', 8180));
const PORTA_AUTH = Number(argomento('auth', 9180));
const PROGETTO = 'demo-ngb-eventi';

// il servizio parla con gli emulatori (mai con un progetto vero)
process.env.DIRETTA_EMULATORE = '1';
process.env.DIRETTA_PROGETTO = PROGETTO;
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:' + PORTA_FS;
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:' + PORTA_AUTH;

const SERVIZIO = path.resolve(__dirname, '../../email-service/lib');
const N = require(path.join(SERVIZIO, 'diretta-nome-utente'));
const C = require(path.join(SERVIZIO, 'diretta-comune'));

let rossi = 0, verdi = 0;
function vero(cond, descrizione, dettaglio) {
    if (cond) { verdi++; console.log('  ok  ' + descrizione); }
    else { rossi++; console.log('ROSSO ' + descrizione + (dettaglio ? '\n       ' + dettaglio : '')); }
}
function uguale(ottenuto, atteso, descrizione) {
    const ok = JSON.stringify(ottenuto) === JSON.stringify(atteso);
    vero(ok, descrizione, ok ? '' : 'atteso ' + JSON.stringify(atteso) + ', ottenuto ' + JSON.stringify(ottenuto));
}

/* ---------- gli emulatori ----------
   Se non sono gia' accesi, la prova li avvia da se' (con le regole
   vere) e li ferma alla fine: basta un comando. Le porte di servizio
   (hub, log, websocket) stanno accanto a quella di Firestore (+3, +4,
   +5): sono solo nostre, e non si scontrano con altri emulatori accesi
   nello stesso momento da altre prove. */
function portaAperta(porta) {
    return new Promise(r => {
        const s = net.connect(porta, '127.0.0.1');
        s.on('connect', () => { s.destroy(); r(true); });
        s.on('error', () => r(false));
    });
}
async function assicuraEmulatori() {
    if (await portaAperta(PORTA_FS) && await portaAperta(PORTA_AUTH)) return null;
    const cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'ngb-doppioni-'));
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
    console.log('(emulatori avviati dalla prova: firestore ' + PORTA_FS + ', auth ' + PORTA_AUTH + ')');
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
    const fsUrl = 'http://127.0.0.1:' + PORTA_FS + '/emulator/v1/projects/' + PROGETTO + '/databases/(default)/documents';
    const authUrl = 'http://127.0.0.1:' + PORTA_AUTH + '/emulator/v1/projects/' + PROGETTO + '/accounts';
    const [a, b] = await Promise.all([fetch(fsUrl, { method: 'DELETE' }), fetch(authUrl, { method: 'DELETE' })]);
    if (!a.ok || !b.ok) throw new Error('svuotamento degli emulatori non riuscito');
}

/* ---------- i file di prova ---------- */
const NOMI = ['Giulia', 'Luca', 'Nicolò', 'Anna Maria', 'Francesca', 'Paolo', 'Chiara', 'Giuseppe', 'Sofia', 'Marco'];
const COGNOMI = ['Bianchi', "D'Angelo", 'De Luca', 'Esposito', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco', 'Bruno'];
function persona(i, prefisso) {
    return { nome: NOMI[i % NOMI.length], cognome: COGNOMI[Math.floor(i / NOMI.length) % COGNOMI.length], email: prefisso + i + '@prova.it', azienda: 'Azienda ' + (i % 7) };
}
// n righe, le prime `mario` sono "Mario Rossi" con email diverse
function file(prefisso, n, mario) {
    const righe = [];
    for (let i = 0; i < n; i++) {
        const p = i < mario ? { nome: 'Mario', cognome: 'Rossi', email: prefisso + '.mario' + i + '@prova.it', azienda: 'Rossi srl' } : persona(i, prefisso);
        righe.push(Object.assign({ riga: i + 2 }, p));
    }
    return righe;
}

/* ---------- il caricamento, come lo fa la pagina di gestione ---------- */
async function carica(dati, ctx, righe, idEvento) {
    const { esistenti } = await dati.anteprima(ctx, {
        idEvento: idEvento,
        emails: righe.map(r => N.emailNormalizzata(r.email)),
        basi: righe.map(r => N.nomeUtenteBase(r.nome, r.cognome)),
        nomi: righe.map(r => N.pulisciNomeUtente(r.nomeUtente)).filter(Boolean)
    });
    // il gestore conferma gli omonimi (e le stesse email con nomi diversi)
    const analisi = N.analizzaRighe(righe.map(r => Object.assign({ confermaOmonimo: true, confermaDoppione: true }, r)), esistenti, idEvento);
    const daCreare = analisi.righe.filter(r => r.esito === 'nuovo' || r.esito === 'esistente')
        .map(r => ({ riga: r.riga, nome: r.nome, cognome: r.cognome, email: r.email, azienda: r.azienda, nomeUtente: r.nomeUtente }));
    const risultati = [];
    for (let i = 0; i < daCreare.length; i += 25) {
        const r = await dati.crea(ctx, { idEvento: idEvento, righe: daCreare.slice(i, i + 25) });
        risultati.push(...r.risultati);
    }
    return { analisi, risultati };
}
const conta = (risultati, esito) => risultati.filter(r => r.esito === esito).length;

/* ---------- il controllo dei doppioni, su tutto ---------- */
async function tuttiGliUtenti(ctx) {
    const out = [];
    let pagina;
    do {
        const r = await ctx.auth.listUsers(1000, pagina);
        out.push(...r.users);
        pagina = r.pageToken;
    } while (pagina);
    return out;
}
async function controllaTutto(ctx, titolo) {
    const [partecipanti, indirizzi, nomiUtente, utenti] = await Promise.all([
        ctx.db.collection('partecipanti').get(), ctx.db.collection('indirizzi').get(),
        ctx.db.collection('nomiUtente').get(), tuttiGliUtenti(ctx)
    ]);
    const P = partecipanti.docs.map(d => Object.assign({ id: d.id }, d.data()));
    const perUid = new Map(P.map(p => [p.id, p]));
    const email = new Set(P.map(p => p.emailNorm));
    const nomi = new Set(P.map(p => p.nomeUtente));
    const partecipantiAuth = utenti.filter(u => C.eEmailTecnica(u.email));
    const emailAuth = new Set(partecipantiAuth.map(u => u.email));
    console.log('\n' + titolo);
    vero(email.size === P.length, 'partecipanti: nessuna email doppia (' + P.length + ' persone, ' + email.size + ' email)');
    vero(nomi.size === P.length, 'partecipanti: nessun nome utente doppio (' + nomi.size + ' nomi)');
    vero(indirizzi.size === P.length && indirizzi.docs.every(d => perUid.has(d.data().uid) && perUid.get(d.data().uid).emailNorm === d.id),
        'indirizzi: uno per persona, ognuno punta alla persona con quella email (' + indirizzi.size + ')');
    vero(nomiUtente.size === P.length && nomiUtente.docs.every(d => perUid.has(d.data().uid) && perUid.get(d.data().uid).nomeUtente === d.id),
        'nomiUtente: uno per persona, ognuno punta alla persona con quel nome (' + nomiUtente.size + ')');
    vero(partecipantiAuth.length === P.length && partecipantiAuth.every(u => perUid.has(u.uid) && u.email === C.emailTecnica(u.uid)),
        'Firebase Auth: un account per persona, con l\'email tecnica ricavata dall\'uid (' + partecipantiAuth.length + ' account)');
    vero(emailAuth.size === partecipantiAuth.length, 'Firebase Auth: nessuna email tecnica doppia');
    const claimsGiusti = partecipantiAuth.every(u => JSON.stringify((u.customClaims || {}).eventi) === JSON.stringify(perUid.get(u.uid).eventi));
    vero(claimsGiusti, 'claims "eventi" di ogni account uguali agli eventi del profilo');
    return { persone: P.length, email: email.size, nomi: nomi.size, account: partecipantiAuth.length, P: P, perUid: perUid };
}

(async () => {
    const emulatori = await assicuraEmulatori();
    let esito = 1;
    try {
        await svuota();
        const { contesto } = require(path.join(SERVIZIO, 'diretta-firebase'));
        const dati = require(path.join(SERVIZIO, 'diretta-dati'));
        const ctx = contesto();
        const t0 = Date.now();

        console.log('\nEventi');
        const evento = {
            nuovo: true, id: 'napoli-2026', titolo: 'Next Generation Business 2026 · Napoli', luogo: 'Napoli · Hotel Eurostars Excelsior',
            data: '2026-10-02', oraInizio: '09:00', oraFine: '17:30', videoUrl: 'https://webtv.esempio.it/live/napoli/playlist.m3u8',
            programma: '09.00 Accoglienza e registrazione\n09.30 Apertura dei lavori', paginaEvento: '/napoli_ottobre_2026/',
            unSoloDispositivo: false, promemoria: { giornoPrima: false, oraPrima: false }
        };
        const napoli = await dati.salvaEvento(ctx, evento);
        vero(napoli.id === 'napoli-2026' && napoli.stato === 'programmato' && napoli.programma.length === 2, 'evento di Napoli creato');
        const milano = await dati.salvaEvento(ctx, Object.assign({}, evento, { id: 'milano-2026', titolo: 'Evento di Milano', data: '2026-11-20', videoUrl: '' }));
        vero(milano.id === 'milano-2026', 'secondo evento (Milano) creato');
        let doppio = null;
        try { await dati.salvaEvento(ctx, evento); } catch (e) { doppio = e; }
        vero(doppio && doppio.stato === 409, 'lo stesso identificativo non si crea due volte (409)');

        /* 1 + 4. primo caricamento e omonimi numerati */
        console.log('\n1. Primo caricamento (60 righe, 12 "Mario Rossi")');
        const fileA = file('a', 60, 12);
        const primo = await carica(dati, ctx, fileA, 'napoli-2026');
        uguale(conta(primo.risultati, 'creato'), 60, 'creati 60 account');
        const marioA = primo.risultati.filter(r => r.riga <= 13).map(r => r.nomeUtente).sort();
        const attesi = ['mariorossi'].concat(Array.from({ length: 11 }, (_, i) => 'mariorossi' + (i + 2))).sort();
        uguale(marioA, attesi, 'omonimi numerati: mariorossi, mariorossi2 ... mariorossi12');
        vero(primo.risultati.some(r => r.nomeUtente === 'nicolodangelo') && primo.risultati.some(r => r.nomeUtente === 'annamariadeluca'),
            'accenti, apostrofi e doppi nomi ripuliti (nicolodangelo, annamariadeluca)');
        await controllaTutto(ctx, 'Controllo dopo il primo caricamento');

        /* 1. lo stesso file, di nuovo */
        console.log('\n2. Lo stesso file caricato una seconda volta');
        const utentiPrima = (await tuttiGliUtenti(ctx)).length;
        const secondo = await carica(dati, ctx, fileA, 'napoli-2026');
        uguale(secondo.analisi.conteggi.giaNellEvento, 60, 'l\'anteprima riconosce le 60 persone gia\' nell\'evento');
        uguale(secondo.risultati.length, 0, 'nessuna riga da creare');
        // anche forzando: le righe mandate lo stesso al servizio non creano niente
        const forzato = [];
        for (let i = 0; i < fileA.length; i += 25) forzato.push(...(await dati.crea(ctx, { idEvento: 'napoli-2026', righe: fileA.slice(i, i + 25) })).risultati);
        uguale(conta(forzato, 'creato'), 0, 'mandando comunque le 60 righe al servizio: zero account creati');
        uguale(conta(forzato, 'gia-nell-evento'), 60, '... e 60 "gia\' nell\'evento"');
        uguale((await tuttiGliUtenti(ctx)).length, utentiPrima, 'Firebase Auth: stesso numero di account di prima (' + utentiPrima + ')');

        /* 2. la stessa email scritta in modi diversi */
        console.log('\n3. La stessa email scritta in modi diversi');
        const varianti = [
            { riga: 2, nome: 'Carla', cognome: 'Neri', email: 'Carla.Neri@Prova.IT', azienda: 'Neri spa' },
            { riga: 3, nome: 'Carla', cognome: 'Neri', email: '  carla.neri@prova.it ', azienda: 'Neri spa' },
            { riga: 4, nome: 'carla', cognome: 'NERI', email: 'CARLA.NERI@PROVA.IT', azienda: '' },
            { riga: 5, nome: 'Carla', cognome: 'Neri', email: 'carla.neri@prova.it​', azienda: '' },
            { riga: 6, nome: 'Mario', cognome: 'Rossi', email: '  A.MARIO0@Prova.it', azienda: '' }
        ];
        const anal = N.analizzaRighe(varianti, (await dati.anteprima(ctx, { idEvento: 'napoli-2026', emails: varianti.map(v => v.email), basi: ['carlaneri', 'mariorossi'], nomi: [] })).esistenti, 'napoli-2026');
        uguale(anal.righe.map(r => r.esito), ['nuovo', 'doppione', 'doppione', 'doppione', 'gia-nell-evento'], 'l\'anteprima vede i doppioni nel file e la persona gia\' presente');
        // e se arrivano tutte insieme al servizio (cinque in parallelo nella stessa chiamata)?
        const tutte = (await dati.crea(ctx, { idEvento: 'napoli-2026', righe: varianti })).risultati;
        uguale(conta(tutte, 'creato'), 1, 'mandate tutte insieme al servizio: UN solo account per Carla Neri');
        const uidCarla = tutte.filter(r => r.riga <= 5).map(r => r.uid);
        vero(new Set(uidCarla).size === 1, 'le quattro righe di Carla puntano allo stesso uid');
        const pCarla = (await ctx.db.collection('partecipanti').doc(uidCarla[0]).get()).data();
        vero(pCarla.email === 'carla.neri@prova.it' && pCarla.emailNorm === 'carla.neri@prova.it',
            'si salva l\'indirizzo normalizzato, lo stesso a cui si spedira\' (' + JSON.stringify(pCarla.email) + ')');
        const zwsp = (await dati.crea(ctx, { idEvento: 'napoli-2026', righe: [{ riga: 7, nome: 'Zeno', cognome: 'Invisibile', email: 'Zeno.Invisibile@Prova.it\u200b', azienda: '' }] })).risultati[0];
        const pZeno = zwsp.uid ? (await ctx.db.collection('partecipanti').doc(zwsp.uid).get()).data() : {};
        vero(zwsp.esito === 'creato' && pZeno.email === 'zeno.invisibile@prova.it' && pZeno.email.indexOf('\u200b') < 0,
            'un\'email con lo spazio invisibile U+200B si salva senza (' + JSON.stringify(pZeno.email) + ')');
        vero(tutte.find(r => r.riga === 6).esito === 'gia-nell-evento', 'A.MARIO0@Prova.it e\' la persona gia\' creata con a.mario0@prova.it');

        /* 3. caricamenti contemporanei */
        console.log('\n4. Tre caricamenti CONTEMPORANEI: lo stesso file due volte e un file diverso, con omonimi');
        const fileC = file('c', 55, 20);
        const fileD = file('d', 55, 20).map((r, i) => (i >= 45 ? Object.assign({}, fileC[i]) : r)); // 10 persone in comune con C
        const prima = await controllaTutto(ctx, 'Situazione prima dei caricamenti contemporanei');
        const tInsieme = Date.now();
        const [c1, c2, d1] = await Promise.all([
            carica(dati, ctx, fileC, 'napoli-2026'),
            carica(dati, ctx, fileC, 'napoli-2026'),
            carica(dati, ctx, fileD, 'napoli-2026')
        ]);
        const secInsieme = ((Date.now() - tInsieme) / 1000).toFixed(1);
        const tuttiRis = c1.risultati.concat(c2.risultati, d1.risultati);
        const emailNuove = new Set(fileC.concat(fileD).map(r => N.emailNormalizzata(r.email)));
        uguale(conta(tuttiRis, 'errore'), 0, 'nessuna riga in errore (' + tuttiRis.length + ' righe in ' + secInsieme + ' s)');
        uguale(conta(tuttiRis, 'creato'), emailNuove.size, 'account creati = email diverse nei file (' + emailNuove.size + ')');
        const perEmail = {};
        [[fileC, c1], [fileC, c2], [fileD, d1]].forEach(([righe, esito]) => esito.risultati.forEach(r => {
            const e = N.emailNormalizzata(righe.find(x => x.riga === r.riga).email);
            (perEmail[e] = perEmail[e] || []).push(r);
        }));
        vero(Object.keys(perEmail).every(e => perEmail[e].filter(r => r.esito === 'creato').length === 1 && new Set(perEmail[e].map(r => r.uid)).size === 1),
            'ogni email: creata una volta sola, e tutte le sue righe hanno lo stesso uid');
        const cambiati = conta(tuttiRis.filter(r => r.nomeUtenteCambiato), 'creato');
        console.log('       (nomi utente proposti dall\'anteprima e cambiati dal servizio per le collisioni: ' + cambiati + ')');
        const dopo = await controllaTutto(ctx, 'Controllo dopo i caricamenti contemporanei');
        uguale(dopo.persone - prima.persone, emailNuove.size, 'persone in piu\' = email nuove');
        const mario = dopo.P.filter(p => p.nome === 'Mario' && p.cognome === 'Rossi').map(p => p.nomeUtente);
        vero(mario.every(n => /^mariorossi(\d+)?$/.test(n)) && new Set(mario).size === mario.length,
            'tutti i ' + mario.length + ' "Mario Rossi" hanno un nome diverso della serie mariorossi, mariorossi2...');

        /* 5. persona gia' presente aggiunta a un secondo evento */
        console.log('\n5. Persone gia\' presenti aggiunte a un secondo evento (Milano)');
        const utentiPrimaMilano = (await tuttiGliUtenti(ctx)).length;
        const fileE = [
            { riga: 2, nome: 'Mario', cognome: 'Rossi', email: 'A.Mario0@PROVA.it ', azienda: '' },
            { riga: 3, nome: fileA[20].nome, cognome: fileA[20].cognome, email: fileA[20].email.toUpperCase(), azienda: '' },
            { riga: 4, nome: 'Carla', cognome: 'Neri', email: 'carla.neri@prova.it', azienda: '' },
            { riga: 5, nome: 'Elena', cognome: 'Milanesi', email: 'elena.milanesi@prova.it', azienda: '' },
            { riga: 6, nome: 'Mario', cognome: 'Rossi', email: 'mario.milano@prova.it', azienda: '' }
        ];
        const milanoRis = await carica(dati, ctx, fileE, 'milano-2026');
        uguale(milanoRis.analisi.conteggi.esistenti, 3, 'l\'anteprima riconosce 3 persone gia\' presenti (per email)');
        uguale(milanoRis.risultati.map(r => r.esito), ['aggiunto', 'aggiunto', 'aggiunto', 'creato', 'creato'], 'esiti: 3 aggiunte, 2 nuove');
        uguale((await tuttiGliUtenti(ctx)).length - utentiPrimaMilano, 2, 'Firebase Auth: solo 2 account nuovi');
        const uidMario0 = primo.risultati.find(r => r.riga === 2).uid;
        vero(milanoRis.risultati[0].uid === uidMario0, 'la persona aggiunta ha lo stesso uid di prima');
        const u0 = await ctx.auth.getUser(uidMario0);
        uguale((u0.customClaims || {}).eventi, ['milano-2026', 'napoli-2026'], 'claims aggiornati: ["milano-2026", "napoli-2026"]');
        const p0 = (await ctx.db.collection('partecipanti').doc(uidMario0).get()).data();
        vero(p0.idEvento === 'milano-2026' && p0.invii['milano-2026'].stato === 'da inviare' && p0.invii['napoli-2026'].stato === 'da inviare',
            'profilo: evento piu\' recente Milano, credenziali per Milano "da inviare"');
        const nuovoMario = milanoRis.risultati[4].nomeUtente;
        vero(/^mariorossi\d+$/.test(nuovoMario) && !dopo.P.some(p => p.nomeUtente === nuovoMario), 'il nuovo Mario Rossi di Milano ha un numero nuovo (' + nuovoMario + ')');
        const ancora = await carica(dati, ctx, fileE, 'milano-2026');
        uguale(ancora.risultati.length, 0, 'ricaricando il file di Milano: niente da creare');

        /* 7. nome utente scritto a mano gia' occupato */
        console.log('\n6. Nome utente scritto a mano');
        const manuali = [
            { riga: 2, nome: 'Mario', cognome: 'Rossi', email: 'mario.mano@prova.it', azienda: '', nomeUtente: 'mariorossi' },
            { riga: 3, nome: 'Giulia', cognome: 'Verdi', email: 'giulia.verdi@prova.it', azienda: '', nomeUtente: 'giuliaverdi7' },
            { riga: 4, nome: 'Giulia', cognome: 'Verdi', email: 'giulia.v@prova.it', azienda: '', nomeUtente: 'G. Verdi' }
        ];
        const esistMan = (await dati.anteprima(ctx, { idEvento: 'napoli-2026', emails: manuali.map(m => m.email), basi: ['mariorossi', 'giuliaverdi'], nomi: ['mariorossi', 'giuliaverdi7', 'gverdi'] })).esistenti;
        const analMan = N.analizzaRighe(manuali, esistMan, 'napoli-2026');
        vero(analMan.righe[0].esito === 'errore' && analMan.righe[0].problemi.some(p => p.codice === 'nome-utente-occupato'),
            'l\'anteprima segnala "mariorossi" scritto a mano come gia\' occupato');
        const man = (await dati.crea(ctx, { idEvento: 'napoli-2026', righe: manuali })).risultati;
        vero(man[0].esito === 'creato' && man[0].nomeUtente !== 'mariorossi' && /^mariorossi\d+$/.test(man[0].nomeUtente) && man[0].nomeUtenteCambiato === true,
            'mandato lo stesso al servizio: "mariorossi" e\' occupato, assegnato ' + man[0].nomeUtente + ' (nomeUtenteCambiato)');
        vero(man[1].nomeUtente === 'giuliaverdi7' && man[1].nomeUtenteCambiato === false, 'un nome scritto a mano libero resta com\'e\' (giuliaverdi7)');
        vero(man[2].nomeUtente === 'gverdi', 'un nome scritto a mano si ripulisce come gli altri ("G. Verdi" -> gverdi)');
        vero(esistMan.dettagliOccupati && esistMan.dettagliOccupati.mariorossi && /^a\*\*\*@prova\.it$/.test(esistMan.dettagliOccupati.mariorossi.emailMascherata),
            'l\'anteprima dice chi usa gia\' "mariorossi" (email mascherata: ' + (esistMan.dettagliOccupati.mariorossi || {}).emailMascherata + ')');

        /* 6. correzione di nome e cognome */
        console.log('\n7. Correzione di nome e cognome');
        const tre = primo.risultati.find(r => r.nomeUtente === 'mariorossi3');
        const emailTre = fileA.find(x => x.riga === tre.riga).email;
        /* i contatori dei tentativi del vecchio nome (due reti) e, accanto, quelli di nomi vicini
           ("mariorossi30", "mariorossi31", "mariorossi3a"): si devono cancellare i primi e solo quelli */
        const reti = [C.improntaIp('10.7.0.1'), C.improntaIp('10.7.0.2')];
        const tentativo = { falliti: 4, bloccatoFino: Date.now() + 60000, aggiornato: Date.now() };
        const suoi = reti.map(r => 'mariorossi3_' + r);
        const vicini = ['mariorossi30_' + reti[0], 'mariorossi31_' + reti[1], 'mariorossi3a_' + reti[0]];
        await Promise.all(suoi.concat(vicini).map(id => ctx.db.collection('tentativi').doc(id).set(tentativo)));
        await ctx.db.collection('tentativiNome').doc('mariorossi3').set({ falliti: 12, inizioFinestra: Date.now(), bloccatoFino: 0, aggiornato: Date.now() });
        const corr1 = await dati.operazionePartecipante(ctx, { uid: tre.uid, idEvento: 'napoli-2026', operazione: 'correggi', nome: 'Maria', cognome: 'Rossi', azienda: 'Rossi srl', email: emailTre });
        vero(corr1.nomeUtenteCambiato && corr1.partecipante.nomeUtente === 'mariarossi', 'Mario -> Maria Rossi: nome utente ricalcolato in mariarossi');
        const liberato = await ctx.db.collection('nomiUtente').doc('mariorossi3').get();
        vero(!liberato.exists, 'il vecchio nome mariorossi3 e\' liberato');
        const restiSuoi = await Promise.all(suoi.map(id => ctx.db.collection('tentativi').doc(id).get()));
        const restiVicini = await Promise.all(vicini.map(id => ctx.db.collection('tentativi').doc(id).get()));
        vero(restiSuoi.every(d => !d.exists) && !(await ctx.db.collection('tentativiNome').doc('mariorossi3').get()).exists,
            'cancellati i tentativi del vecchio nome (mariorossi3_<rete> su due reti e tentativiNome): chi lo ricevera\' non eredita errori ne\' blocchi');
        vero(restiVicini.every(d => d.exists), 'restano quelli dei nomi vicini (mariorossi30, mariorossi31, mariorossi3a)');
        const u3 = await ctx.auth.getUser(tre.uid);
        vero(u3.displayName === 'Maria Rossi' && u3.email === C.emailTecnica(tre.uid), 'Auth: nome visualizzato aggiornato, email tecnica invariata (nessuna sessione chiusa)');
        // una persona diversa (riga 14, Nicolò D'Angelo) corretta in "Mario Rossi": prende il primo numero libero (mariorossi3)
        const luca = primo.risultati.find(r => r.riga === 14);
        vero(luca.nomeUtente === 'nicolodangelo', 'la riga 14 e\' nicolodangelo');
        await ctx.db.collection('partecipanti').doc(luca.uid).update({ 'invii.napoli-2026.stato': 'inviata' });
        const corr2 = await dati.operazionePartecipante(ctx, { uid: luca.uid, idEvento: 'napoli-2026', operazione: 'correggi', nome: 'Mario', cognome: 'Rossi', azienda: '', email: fileA[12].email });
        uguale(corr2.partecipante.nomeUtente, 'mariorossi3', 'Nicolò D\'Angelo corretto in Mario Rossi: prende il numero libero mariorossi3, nessun doppione');
        vero(!(await ctx.db.collection('nomiUtente').doc('nicolodangelo').get()).exists, 'nicolodangelo e\' liberato');
        uguale(corr2.partecipante.invio.stato, 'da inviare', 'credenziali gia\' inviate con il vecchio nome: tornano "da inviare"');
        let occupata = null;
        try {
            await dati.operazionePartecipante(ctx, { uid: luca.uid, idEvento: 'napoli-2026', operazione: 'correggi', nome: 'Mario', cognome: 'Rossi', azienda: '', email: ' A.MARIO0@prova.it' });
        } catch (e) { occupata = e; }
        vero(occupata && occupata.stato === 409, 'correggere l\'email con quella di un\'altra persona: rifiutato (409)');
        const corr3 = await dati.operazionePartecipante(ctx, { uid: luca.uid, idEvento: 'napoli-2026', operazione: 'correggi', nome: 'Luca', cognome: 'Rossi', azienda: 'X', email: ' Luca.Nuova@prova.it\u200b', mantieniNomeUtente: true });
        vero(!corr3.nomeUtenteCambiato && corr3.partecipante.nomeUtente === 'mariorossi3' && corr3.partecipante.email === 'luca.nuova@prova.it',
            'con "mantieni il nome utente": nome utente invariato, email spostata e salvata normalizzata (' + JSON.stringify(corr3.partecipante.email) + ')');
        const indVecchio = await ctx.db.collection('indirizzi').doc(N.emailNormalizzata(fileA[12].email)).get();
        const indNuovo = await ctx.db.collection('indirizzi').doc('luca.nuova@prova.it').get();
        vero(!indVecchio.exists && indNuovo.exists && indNuovo.data().uid === luca.uid, 'la prenotazione dell\'email si sposta (vecchia liberata, nuova presa)');
        let vuoto = null;
        try { await dati.operazionePartecipante(ctx, { uid: luca.uid, idEvento: 'napoli-2026', operazione: 'correggi', nome: '<b>', cognome: 'Rossi', email: 'luca.nuova@prova.it' }); } catch (e) { vuoto = e; }
        vero(vuoto && vuoto.stato === 400, 'nome con < > rifiutato (400)');

        /* 8. account rimasto a meta' */
        console.log('\n8. Account rimasto a meta\' e righe non valide');
        const meta = primo.risultati.find(r => r.riga === 40);
        await ctx.auth.deleteUser(meta.uid);
        await ctx.db.collection('partecipanti').doc(meta.uid).update({ authCreato: false });
        const altro = primo.risultati.find(r => r.riga === 41);
        await ctx.db.collection('partecipanti').doc(altro.uid).update({ authCreato: false }); // Auth c'e', il profilo non lo sa
        const ripresa = (await dati.crea(ctx, { idEvento: 'napoli-2026', righe: [fileA[38], fileA[39]] })).risultati;
        uguale(ripresa.map(r => r.esito), ['gia-nell-evento', 'gia-nell-evento'], 'ricaricando le due righe: nessun account nuovo');
        const rifatto = await ctx.auth.getUser(meta.uid).catch(() => null);
        vero(rifatto && rifatto.email === C.emailTecnica(meta.uid) && JSON.stringify(rifatto.customClaims.eventi) === '["napoli-2026"]',
            'l\'account Auth mancante e\' ricreato con lo stesso uid e i suoi claims');
        const pMeta = (await ctx.db.collection('partecipanti').doc(meta.uid).get()).data();
        const pAltro = (await ctx.db.collection('partecipanti').doc(altro.uid).get()).data();
        vero(pMeta.authCreato === true && pAltro.authCreato === true, 'entrambi i profili segnano l\'account come creato');
        const cattive = (await dati.crea(ctx, {
            idEvento: 'napoli-2026', righe: [
                { riga: 2, nome: '<script>alert(1)</script>', cognome: 'X', email: 'x1@prova.it' },
                { riga: 3, nome: 'Senza', cognome: 'Email', email: 'non-una-email' },
                { riga: 4, nome: '', cognome: 'Vuoto', email: 'x2@prova.it' },
                { riga: 5, nome: '王', cognome: '伟', email: 'x3@prova.it' }
            ]
        })).risultati;
        uguale(cattive.map(r => r.esito), ['errore', 'errore', 'errore', 'errore'], 'nome con <script>, email non valida, nome vuoto, nome senza lettere a-z: errori con motivo');
        vero(cattive.every(r => r.motivo && !r.uid), 'nessun account per le righe non valide');

        const fine = await controllaTutto(ctx, 'Controllo finale');
        const secondi = ((Date.now() - t0) / 1000).toFixed(1);
        console.log('\nRIEPILOGO: account creati: ' + fine.account + ', email uniche: ' + fine.email + ', nomi utente unici: ' + fine.nomi
            + ' (persone: ' + fine.persone + '; tempo: ' + secondi + ' s)');
        esito = rossi ? 1 : 0;
    } catch (e) {
        console.error(e);
        rossi++;
    } finally {
        console.log('\n' + verdi + ' verdi, ' + rossi + ' rossi');
        await fermaEmulatori(emulatori);
        process.exit(rossi ? 1 : esito);
    }
})();
