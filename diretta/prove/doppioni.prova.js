/* ============================================================
   PROVE - nessun account doppio: un'email = un account
   ------------------------------------------------------------
       node doppioni.prova.js [--firestore 8180] [--auth 9180]

   Se sulle due porte non risponde gia' un emulatore, la prova ne
   avvia uno suo (con le regole vere) e lo ferma alla fine.

   Chiama DIRETTAMENTE le funzioni di email-service/lib/diretta-dati.js
   (le stesse che usa api/diretta-gestione.js), contro gli emulatori di
   Firestore e di Auth, e fa quello che fa la pagina di gestione:
   'anteprima' (per EMAIL: nessun nome utente) -> 'crea' a gruppi di 25
   delle righe che l'anteprima dice da creare.

   COSA DIMOSTRA.
   1. Omonimi (tanti "Mario Rossi" con email diverse): persone diverse,
      un account ciascuno, nessun numero da aggiungere a niente.
   2. Lo stesso file caricato due volte: la seconda volta l'anteprima dice
      "gia' iscritto" a tutte le righe e zero account nuovi, anche
      mandando le righe lo stesso al servizio.
   3. La stessa email scritta in modi diversi (maiuscole, spazi, uno
      spazio invisibile U+200B da Excel): un account solo, anche quando
      le righe arrivano insieme al servizio; si salva l'indirizzo
      normalizzato, lo stesso a cui si spedira'.
   4. Tre caricamenti CONTEMPORANEI (lo stesso file due volte e un terzo
      file con persone in comune): zero account doppi, controllando
      indirizzi, partecipanti e gli utenti di Firebase Auth (listUsers).
   5. L'email condivisa da persone diverse: nel file (due colleghi con
      info@) e rispetto a un account gia' registrato con un altro nome.
      L'anteprima la segnala da correggere e 'crea' la rifiuta lo stesso
      (nessun account aggiunto a una persona sbagliata).
   6. Una persona gia' presente aggiunta a un secondo evento: nessun
      account nuovo, claims aggiornati con i due eventi, credenziali
      "da inviare" (nessuna password nuova qui: la decide l'invio).
   7. La correzione dell'email: la prenotazione si sposta, i contatori
      dei tentativi del vecchio e del nuovo indirizzo (e solo quelli) si
      cancellano, le credenziali tornano "da inviare"; un'email di
      un'altra persona e' rifiutata.
   8. Un account rimasto a meta' (Auth non creato) si completa
      ricaricando il file, con lo stesso uid; le righe non valide danno
      errori con il codice dell'anteprima.
   E sempre: l'import NON manda email (la posta finta resta vuota), e
   nessuno scrive piu' nomi utente (ne' nomiUtente ne' il campo sul
   profilo). Alla fine: "account creati: N, email uniche: N".
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
const RISULTATI = path.resolve(__dirname, 'risultati');
const POSTA = path.join(RISULTATI, 'doppioni-posta.jsonl');

// il servizio parla con gli emulatori (mai con un progetto vero), e la posta e' finta
process.env.DIRETTA_EMULATORE = '1';
process.env.DIRETTA_PROGETTO = PROGETTO;
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:' + PORTA_FS;
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:' + PORTA_AUTH;
process.env.DIRETTA_POSTA_FINTA = POSTA;

const SERVIZIO = path.resolve(__dirname, '../../email-service/lib');
const E = require(path.join(SERVIZIO, 'diretta-email'));
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
function righePosta() {
    if (!fs.existsSync(POSTA)) return 0;
    return fs.readFileSync(POSTA, 'utf8').split('\n').filter(Boolean).length;
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
    const analisi = await dati.anteprima(ctx, { idEvento: idEvento, righe: righe });
    const daCreare = analisi.righe.filter(r => r.crea)
        .map(r => ({ riga: r.riga, nome: r.nome, cognome: r.cognome, email: r.email, azienda: r.azienda }));
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
    const partecipantiAuth = utenti.filter(u => C.eEmailTecnica(u.email));
    const emailAuth = new Set(partecipantiAuth.map(u => u.email));
    console.log('\n' + titolo);
    vero(email.size === P.length, 'partecipanti: nessuna email doppia (' + P.length + ' persone, ' + email.size + ' email)');
    vero(P.every(p => p.email === p.emailNorm && E.emailValida(p.emailNorm) && p.emailNorm === E.normalizzaEmail(p.emailNorm)), 'ogni profilo ha l\'email normalizzata e valida (email = emailNorm)');
    vero(indirizzi.size === P.length && indirizzi.docs.every(d => perUid.has(d.data().uid) && perUid.get(d.data().uid).emailNorm === d.id),
        'indirizzi: uno per persona, ognuno punta alla persona con quella email (' + indirizzi.size + ')');
    vero(nomiUtente.size === 0 && P.every(p => p.nomeUtente === undefined), 'nessun nome utente: nomiUtente vuota e nessun profilo con il campo nomeUtente');
    vero(partecipantiAuth.length === P.length && partecipantiAuth.every(u => perUid.has(u.uid) && u.email === C.emailTecnica(u.uid)),
        'Firebase Auth: un account per persona, con l\'email tecnica ricavata dall\'uid (' + partecipantiAuth.length + ' account)');
    vero(emailAuth.size === partecipantiAuth.length, 'Firebase Auth: nessuna email tecnica doppia');
    const claimsGiusti = partecipantiAuth.every(u => JSON.stringify((u.customClaims || {}).eventi) === JSON.stringify(perUid.get(u.uid).eventi));
    vero(claimsGiusti, 'claims "eventi" di ogni account uguali agli eventi del profilo');
    vero(righePosta() === 0, 'l\'import non ha mandato nessuna email (posta finta vuota)');
    return { persone: P.length, email: email.size, account: partecipantiAuth.length, P: P, perUid: perUid };
}

(async () => {
    const emulatori = await assicuraEmulatori();
    let esito = 1;
    try {
        await svuota();
        fs.mkdirSync(RISULTATI, { recursive: true });
        try { fs.unlinkSync(POSTA); } catch (_) { /* non c'era */ }
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
        vero(napoli.id === 'napoli-2026' && napoli.stato === 'programmato' && napoli.programma.length === 2 && napoli.iscrizioniAutomatiche === false,
            'evento di Napoli creato (invio automatico della password spento di base)');
        const milano = await dati.salvaEvento(ctx, Object.assign({}, evento, { id: 'milano-2026', titolo: 'Evento di Milano', data: '2026-11-20', videoUrl: '', paginaEvento: '/milano_2026/' }));
        vero(milano.id === 'milano-2026', 'secondo evento (Milano) creato');
        let doppio = null;
        try { await dati.salvaEvento(ctx, evento); } catch (e) { doppio = e; }
        vero(doppio && doppio.stato === 409, 'lo stesso identificativo non si crea due volte (409)');

        /* 1. primo caricamento, con gli omonimi */
        console.log('\n1. Primo caricamento (60 righe, 12 "Mario Rossi" con email diverse)');
        const fileA = file('a', 60, 12);
        const primo = await carica(dati, ctx, fileA, 'napoli-2026');
        uguale(primo.analisi.conteggi.nuovi, 60, 'l\'anteprima: 60 nuovi (gli omonimi sono persone diverse: email diverse)');
        uguale(conta(primo.risultati, 'creato'), 60, 'creati 60 account');
        vero(new Set(primo.risultati.filter(r => r.riga <= 13).map(r => r.uid)).size === 12, 'i 12 "Mario Rossi": 12 account diversi');
        vero(primo.risultati.every(r => r.nomeUtente === undefined && r.codice === ''), 'nessun nome utente nei risultati');
        await controllaTutto(ctx, 'Controllo dopo il primo caricamento');

        /* 2. lo stesso file, di nuovo */
        console.log('\n2. Lo stesso file caricato una seconda volta');
        const utentiPrima = (await tuttiGliUtenti(ctx)).length;
        const secondo = await carica(dati, ctx, fileA, 'napoli-2026');
        uguale(secondo.analisi.conteggi.giaIscritti, 60, 'l\'anteprima riconosce le 60 persone gia\' iscritte (esito "gia-iscritto")');
        uguale(secondo.risultati.length, 0, 'nessuna riga da creare');
        // anche forzando: le righe mandate lo stesso al servizio non creano niente
        const forzato = [];
        for (let i = 0; i < fileA.length; i += 25) forzato.push(...(await dati.crea(ctx, { idEvento: 'napoli-2026', righe: fileA.slice(i, i + 25) })).risultati);
        uguale(conta(forzato, 'creato'), 0, 'mandando comunque le 60 righe al servizio: zero account creati');
        uguale(conta(forzato, 'gia-iscritto'), 60, '... e 60 "gia-iscritto"');
        uguale((await tuttiGliUtenti(ctx)).length, utentiPrima, 'Firebase Auth: stesso numero di account di prima (' + utentiPrima + ')');

        /* 3. la stessa email scritta in modi diversi */
        console.log('\n3. La stessa email scritta in modi diversi');
        const varianti = [
            { riga: 2, nome: 'Carla', cognome: 'Neri', email: 'Carla.Neri@Prova.IT', azienda: 'Neri spa' },
            { riga: 3, nome: 'Carla', cognome: 'Neri', email: '  carla.neri@prova.it ', azienda: 'Neri spa' },
            { riga: 4, nome: 'carla', cognome: 'NERI', email: 'CARLA.NERI@PROVA.IT', azienda: '' },
            { riga: 5, nome: 'Carla', cognome: 'Neri', email: 'carla.neri@prova.it​', azienda: '' },
            { riga: 6, nome: 'Mario', cognome: 'Rossi', email: '  A.MARIO0@Prova.it', azienda: '' }
        ];
        const anal = await dati.anteprima(ctx, { idEvento: 'napoli-2026', righe: varianti });
        uguale(anal.righe.map(r => r.esito), ['nuovo', 'doppia-nel-file', 'doppia-nel-file', 'doppia-nel-file', 'gia-iscritto'], 'l\'anteprima vede la stessa persona ripetuta nel file e la persona gia\' iscritta');
        vero(anal.righe.slice(1, 4).every(r => r.primaRiga === 2) && anal.pronto === true, 'le ripetizioni rimandano alla riga 2, e non c\'e\' niente da correggere');
        // e se arrivano tutte insieme al servizio (cinque in parallelo nella stessa chiamata)?
        const tutte = (await dati.crea(ctx, { idEvento: 'napoli-2026', righe: varianti })).risultati;
        uguale(conta(tutte, 'creato'), 1, 'mandate tutte insieme al servizio: UN solo account per Carla Neri');
        const uidCarla = tutte.filter(r => r.riga <= 5).map(r => r.uid);
        vero(new Set(uidCarla).size === 1, 'le quattro righe di Carla puntano allo stesso uid');
        const pCarla = (await ctx.db.collection('partecipanti').doc(uidCarla[0]).get()).data();
        vero(pCarla.email === 'carla.neri@prova.it' && pCarla.emailNorm === 'carla.neri@prova.it',
            'si salva l\'indirizzo normalizzato, lo stesso a cui si spedira\' (' + JSON.stringify(pCarla.email) + ')');
        const zwsp = (await dati.crea(ctx, { idEvento: 'napoli-2026', righe: [{ riga: 7, nome: 'Zeno', cognome: 'Invisibile', email: 'Zeno.Invisibile@Prova.it​', azienda: '' }] })).risultati[0];
        const pZeno = zwsp.uid ? (await ctx.db.collection('partecipanti').doc(zwsp.uid).get()).data() : {};
        vero(zwsp.esito === 'creato' && pZeno.email === 'zeno.invisibile@prova.it' && pZeno.email.indexOf('​') < 0,
            'un\'email con lo spazio invisibile U+200B si salva senza (' + JSON.stringify(pZeno.email) + ')');
        vero(tutte.find(r => r.riga === 6).esito === 'gia-iscritto', 'A.MARIO0@Prova.it e\' la persona gia\' creata con a.mario0@prova.it');

        /* 4. caricamenti contemporanei */
        console.log('\n4. Tre caricamenti CONTEMPORANEI: lo stesso file due volte e un file diverso con persone in comune');
        const fileC = file('c', 55, 20);
        const fileD = file('d', 55, 20).map((r, i) => (i >= 45 ? Object.assign({}, fileC[i], { riga: r.riga, email: fileC[i].email.toUpperCase() + ' ' }) : r)); // 10 persone in comune con C
        const prima = await controllaTutto(ctx, 'Situazione prima dei caricamenti contemporanei');
        const tInsieme = Date.now();
        const [c1, c2, d1] = await Promise.all([
            carica(dati, ctx, fileC, 'napoli-2026'),
            carica(dati, ctx, fileC, 'napoli-2026'),
            carica(dati, ctx, fileD, 'napoli-2026')
        ]);
        const secInsieme = ((Date.now() - tInsieme) / 1000).toFixed(1);
        const tuttiRis = c1.risultati.concat(c2.risultati, d1.risultati);
        const emailNuove = new Set(fileC.concat(fileD).map(r => E.normalizzaEmail(r.email)));
        uguale(conta(tuttiRis, 'errore'), 0, 'nessuna riga in errore (' + tuttiRis.length + ' righe in ' + secInsieme + ' s)');
        uguale(conta(tuttiRis, 'creato'), emailNuove.size, 'account creati = email diverse nei file (' + emailNuove.size + ')');
        const perEmail = {};
        [[fileC, c1], [fileC, c2], [fileD, d1]].forEach(([righe, esito]) => esito.risultati.forEach(r => {
            const e = E.normalizzaEmail(righe.find(x => x.riga === r.riga).email);
            (perEmail[e] = perEmail[e] || []).push(r);
        }));
        vero(Object.keys(perEmail).every(e => perEmail[e].filter(r => r.esito === 'creato').length === 1 && new Set(perEmail[e].map(r => r.uid)).size === 1),
            'ogni email: creata una volta sola, e tutte le sue righe (anche quelle scritte in maiuscolo) hanno lo stesso uid');
        const dopo = await controllaTutto(ctx, 'Controllo dopo i caricamenti contemporanei');
        uguale(dopo.persone - prima.persone, emailNuove.size, 'persone in piu\' = email nuove');

        /* 5. l'email condivisa da persone diverse */
        console.log('\n5. La stessa email per persone diverse: da correggere prima di creare');
        const condivise = [
            { riga: 2, nome: 'Paolo', cognome: 'Gialli', email: 'info@ufficio-gialli.it', azienda: 'Gialli srl' },
            { riga: 3, nome: 'Pia', cognome: 'Gialli', email: 'INFO@ufficio-gialli.it', azienda: 'Gialli srl' },
            { riga: 4, nome: 'Dario', cognome: 'Blu', email: 'carla.neri@prova.it', azienda: '' }   // e' l'email di Carla Neri
        ];
        const anCond = await dati.anteprima(ctx, { idEvento: 'milano-2026', righe: condivise });
        uguale(anCond.righe.map(r => r.esito), ['email-condivisa', 'email-condivisa', 'email-condivisa'], 'l\'anteprima segnala tutte e tre le righe come "email-condivisa"');
        vero(anCond.pronto === false && anCond.conteggi.daCorreggere === 3 && anCond.righe.every(r => !r.crea), 'e non e\' pronta: «Crea gli account» resta spento');
        vero(/Carla Neri/.test(anCond.righe[2].problemi.find(p => p.codice === 'email-condivisa').testo), 'la riga con l\'email di un altro account dice a chi e\' registrata');
        const utentiPrimaCond = (await tuttiGliUtenti(ctx)).length;
        const forzaCond = (await dati.crea(ctx, { idEvento: 'milano-2026', righe: condivise })).risultati;
        uguale(forzaCond.map(r => r.esito + (r.codice ? ':' + r.codice : '')), ['creato', 'errore:email-condivisa', 'errore:email-condivisa'],
            'mandate lo stesso al servizio: la prima crea, le altre sono rifiutate (email-condivisa)');
        const pCarlaDopo = (await ctx.db.collection('partecipanti').doc(uidCarla[0]).get()).data();
        vero(pCarlaDopo.eventi.indexOf('milano-2026') < 0, 'Carla Neri NON e\' stata aggiunta a Milano per la riga di Dario Blu');
        uguale((await tuttiGliUtenti(ctx)).length - utentiPrimaCond, 1, 'Firebase Auth: un solo account nuovo (Paolo)');
        // corretta l'email di Pia (ognuno il suo indirizzo), si crea
        const piaCorretta = await carica(dati, ctx, [condivise[0], Object.assign({}, condivise[1], { email: 'pia@ufficio-gialli.it' })], 'milano-2026');
        uguale(piaCorretta.analisi.righe.map(r => r.esito), ['gia-iscritto', 'nuovo'], 'con l\'email di Pia corretta: Paolo gia\' iscritto, Pia nuova');
        uguale(piaCorretta.risultati.map(r => r.esito), ['creato'], 'e Pia ha il suo account');

        /* 6. persona gia' presente aggiunta a un secondo evento */
        console.log('\n6. Persone gia\' presenti aggiunte a un secondo evento (Milano)');
        const utentiPrimaMilano = (await tuttiGliUtenti(ctx)).length;
        const fileE = [
            { riga: 2, nome: 'Mario', cognome: 'Rossi', email: 'A.Mario0@PROVA.it ', azienda: '' },
            { riga: 3, nome: fileA[20].nome, cognome: fileA[20].cognome, email: fileA[20].email.toUpperCase(), azienda: '' },
            { riga: 4, nome: 'Carla', cognome: 'Neri', email: 'carla.neri@prova.it', azienda: '' },
            { riga: 5, nome: 'Elena', cognome: 'Milanesi', email: 'elena.milanesi@prova.it', azienda: '' },
            { riga: 6, nome: 'Mario', cognome: 'Rossi', email: 'mario.milano@prova.it', azienda: '' }
        ];
        const milanoRis = await carica(dati, ctx, fileE, 'milano-2026');
        uguale(milanoRis.analisi.righe.map(r => r.esito), ['gia-presente', 'gia-presente', 'gia-presente', 'nuovo', 'nuovo'], 'l\'anteprima riconosce 3 persone gia\' presenti (per email)');
        vero(milanoRis.analisi.righe.slice(0, 3).every(r => r.problemi.some(p => /nessuna password nuova/.test(p.testo))), 'e dice che non ricevono una password nuova');
        uguale(milanoRis.risultati.map(r => r.esito), ['aggiunto', 'aggiunto', 'aggiunto', 'creato', 'creato'], 'esiti: 3 aggiunte, 2 nuove');
        uguale((await tuttiGliUtenti(ctx)).length - utentiPrimaMilano, 2, 'Firebase Auth: solo 2 account nuovi');
        const uidMario0 = primo.risultati.find(r => r.riga === 2).uid;
        vero(milanoRis.risultati[0].uid === uidMario0, 'la persona aggiunta ha lo stesso uid di prima');
        const u0 = await ctx.auth.getUser(uidMario0);
        uguale((u0.customClaims || {}).eventi, ['milano-2026', 'napoli-2026'], 'claims aggiornati: ["milano-2026", "napoli-2026"]');
        const p0 = (await ctx.db.collection('partecipanti').doc(uidMario0).get()).data();
        vero(p0.idEvento === 'milano-2026' && p0.invii['milano-2026'].stato === 'da inviare' && p0.invii['napoli-2026'].stato === 'da inviare',
            'profilo: evento piu\' recente Milano, credenziali per Milano "da inviare" (partono solo con «Invia le credenziali»)');
        const ancora = await carica(dati, ctx, fileE, 'milano-2026');
        uguale(ancora.risultati.length, 0, 'ricaricando il file di Milano: niente da creare');

        /* 7. correzione dell'email */
        console.log('\n7. Correzione di nome, cognome ed email');
        const tre = primo.risultati.find(r => r.riga === 5);
        const emailTre = E.normalizzaEmail(fileA.find(x => x.riga === tre.riga).email);
        const NUOVA = 'mario.nuovo@prova.it';
        /* i contatori dei tentativi: quelli del vecchio e del nuovo indirizzo (due reti) si
           devono cancellare, quelli di un'altra email accanto no */
        const reti = [C.improntaIp('10.7.0.1'), C.improntaIp('10.7.0.2')];
        const tentativo = { falliti: 4, bloccatoFino: Date.now() + 60000, aggiornato: Date.now() };
        const chiaviSue = [E.chiaveEmail(emailTre), E.chiaveEmail(NUOVA)];
        const suoi = chiaviSue.flatMap(k => reti.map(r => k + '_' + r));
        const vicini = [E.chiaveEmail('altro@prova.it') + '_' + reti[0]];
        await Promise.all(suoi.concat(vicini).map(id => ctx.db.collection('tentativi').doc(id).set(tentativo)));
        await Promise.all(chiaviSue.map(k => ctx.db.collection('tentativiNome').doc(k).set({ falliti: 12, inizioFinestra: Date.now(), bloccatoFino: 0, aggiornato: Date.now() })));
        vero(suoi.concat(vicini).every(id => /^[0-9a-f]{32}_[0-9a-f]{32}$/.test(id)), 'gli id dei contatori dei tentativi non contengono indirizzi (impronta_impronta)');
        await ctx.db.collection('partecipanti').doc(tre.uid).update({ 'invii.napoli-2026.stato': 'inviata', 'invii.napoli-2026.inviata': ctx.Timestamp.fromMillis(Date.now()) });
        const corr1 = await dati.operazionePartecipante(ctx, { uid: tre.uid, idEvento: 'napoli-2026', operazione: 'correggi', nome: 'Maria', cognome: 'Rossi', azienda: 'Rossi srl', email: ' Mario.Nuovo@Prova.it​' });
        vero(corr1.emailCambiata === true && corr1.emailPrecedente === emailTre && corr1.partecipante.email === NUOVA && corr1.partecipante.nome === 'Maria',
            'Mario -> Maria Rossi con l\'email nuova: salvata normalizzata (' + corr1.partecipante.email + ')');
        uguale(corr1.partecipante.invio.stato, 'da inviare', 'credenziali gia\' inviate al vecchio indirizzo: tornano "da inviare"');
        const indVecchio = await ctx.db.collection('indirizzi').doc(emailTre).get();
        const indNuovo = await ctx.db.collection('indirizzi').doc(NUOVA).get();
        vero(!indVecchio.exists && indNuovo.exists && indNuovo.data().uid === tre.uid, 'la prenotazione dell\'email si sposta (vecchia liberata, nuova presa)');
        const restiSuoi = await Promise.all(suoi.map(id => ctx.db.collection('tentativi').doc(id).get()));
        const restiVicini = await Promise.all(vicini.map(id => ctx.db.collection('tentativi').doc(id).get()));
        const restiNome = await Promise.all(chiaviSue.map(k => ctx.db.collection('tentativiNome').doc(k).get()));
        vero(restiSuoi.every(d => !d.exists) && restiNome.every(d => !d.exists), 'cancellati i tentativi del vecchio e del nuovo indirizzo (due reti e tentativiNome)');
        vero(restiVicini.every(d => d.exists), 'restano quelli di un\'altra email');
        const pTre = (await ctx.db.collection('partecipanti').doc(tre.uid).get()).data();
        vero(pTre.emailCambiata && typeof pTre.emailCambiata.toMillis === 'function', 'sul profilo resta quando l\'email e\' cambiata (emailCambiata)');
        const u3 = await ctx.auth.getUser(tre.uid);
        vero(u3.displayName === 'Maria Rossi' && u3.email === C.emailTecnica(tre.uid), 'Auth: nome visualizzato aggiornato, email tecnica invariata (nessuna sessione chiusa)');
        let occupata = null;
        try { await dati.operazionePartecipante(ctx, { uid: tre.uid, idEvento: 'napoli-2026', operazione: 'correggi', nome: 'Maria', cognome: 'Rossi', azienda: '', email: ' A.MARIO0@prova.it' }); } catch (e) { occupata = e; }
        vero(occupata && occupata.stato === 409 && occupata.codice === 'email-occupata', 'correggere l\'email con quella di un\'altra persona: rifiutato (409 email-occupata)');
        const soloNome = await dati.operazionePartecipante(ctx, { uid: tre.uid, idEvento: 'napoli-2026', operazione: 'correggi', nome: 'Maria', cognome: 'Rossi Bianchi', azienda: 'X' });
        vero(soloNome.emailCambiata === false && soloNome.partecipante.email === NUOVA && soloNome.partecipante.cognome === 'Rossi Bianchi', 'senza email nella richiesta: l\'email resta quella');
        let vuoto = null;
        try { await dati.operazionePartecipante(ctx, { uid: tre.uid, idEvento: 'napoli-2026', operazione: 'correggi', nome: '<b>', cognome: 'Rossi', email: NUOVA }); } catch (e) { vuoto = e; }
        vero(vuoto && vuoto.stato === 400, 'nome con < > rifiutato (400)');
        let cattiva = null;
        try { await dati.operazionePartecipante(ctx, { uid: tre.uid, idEvento: 'napoli-2026', operazione: 'correggi', nome: 'Maria', cognome: 'Rossi', email: 'non-una-email' }); } catch (e) { cattiva = e; }
        vero(cattiva && cattiva.stato === 400 && cattiva.codice === 'email', 'email non valida rifiutata (400)');

        /* 8. account rimasto a meta' */
        console.log('\n8. Account rimasto a meta\' e righe non valide');
        const meta = primo.risultati.find(r => r.riga === 40);
        await ctx.auth.deleteUser(meta.uid);
        await ctx.db.collection('partecipanti').doc(meta.uid).update({ authCreato: false });
        const altro = primo.risultati.find(r => r.riga === 41);
        await ctx.db.collection('partecipanti').doc(altro.uid).update({ authCreato: false }); // Auth c'e', il profilo non lo sa
        const ripresa = (await dati.crea(ctx, { idEvento: 'napoli-2026', righe: [fileA[38], fileA[39]] })).risultati;
        uguale(ripresa.map(r => r.esito), ['gia-iscritto', 'gia-iscritto'], 'ricaricando le due righe: nessun account nuovo');
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
                { riga: 5, nome: 'Nessuna', cognome: 'Email', email: '   ' }
            ]
        })).risultati;
        uguale(cattive.map(r => r.esito + ':' + r.codice), ['errore:nome-non-valido', 'errore:email-non-valida', 'errore:nome-mancante', 'errore:email-mancante'],
            'nome con <script>, email non valida, nome vuoto, email vuota: errori con il codice dell\'anteprima');
        vero(cattive.every(r => r.motivo && !r.uid), 'nessun account per le righe non valide');
        const nonCinese = (await dati.crea(ctx, { idEvento: 'napoli-2026', righe: [{ riga: 6, nome: '王', cognome: '伟', email: 'wang.wei@prova.it' }] })).risultati[0];
        vero(nonCinese.esito === 'creato', 'un nome senza lettere a-z (王 伟) va bene: non serve piu\' ricavarne un nome utente');

        const fine = await controllaTutto(ctx, 'Controllo finale');
        const secondi = ((Date.now() - t0) / 1000).toFixed(1);
        console.log('\nRIEPILOGO: account creati: ' + fine.account + ', email uniche: ' + fine.email + ' (persone: ' + fine.persone + '; tempo: ' + secondi + ' s)');
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
