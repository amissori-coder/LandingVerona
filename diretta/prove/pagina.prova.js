/* ============================================================
   PROVE - la pagina della diretta (/diretta/) nel browser vero
   ------------------------------------------------------------
       node diretta/prove/pagina.prova.js

   Da sola avvia (e alla fine ferma) gli emulatori Firebase e il sito
   in locale, sulle porte di questa prova:
       emulatori  firestore 8480, auth 9480
       sito       http://127.0.0.1:8490/   (server-locale.js --api 3480)
   Se sono gia' accesi (per esempio lanciati a mano), li usa e non li
   tocca.

   Il servizio di accesso lo fa la prova stessa: le chiamate a
   http://127.0.0.1:3480/api/diretta-accesso vengono intercettate
   (context.route) e la risposta 'entra' porta un gettone VERO creato
   con firebase-admin sull'emulatore. Tutto il resto e' vero: le
   regole di Firestore, l'SDK di Firebase da gstatic, l'ascolto
   dell'evento, le scritture di presenza, la CSP della pagina, il
   player (player-webtv.js con hls.js).
   Il video arriva dalla WEB TV FINTA di flusso-prova.js
   (https://webtv.prova.test): una diretta HLS vera trasmessa da
   ffmpeg (VP9 + Opus, 360p e 180p, segmenti da 2 secondi, finestra
   di 40 s: niente barra per tornare indietro). Serve ffmpeg (quello
   di sistema, FFMPEG=/percorso, oppure pip install imageio-ffmpeg).
   I casi della web TV (riserva, flusso pubblico con la finestra per
   tornare indietro, DASH, ripiego incorporato, link firmati) li prova
   webtv.prova.js, con il servizio vero come regia.

   Chromium, due dispositivi: computer 1366x900 e "iPhone" 390x844
   (isMobile, hasTouch, user agent di Safari su iPhone, e SENZA le API
   di schermo intero, come su iPhone: si prova lo pseudo schermo intero).

   COSA DIMOSTRA. Accesso scrivendo " Mario Rossi " (ripulito in
   mariorossi); vista di attesa con conto alla rovescia e programma; la
   regia (qui firebase-admin) manda in onda e la pagina passa da sola
   alla diretta: il video della web TV scorre nel NOSTRO <video>
   (playsinline, muto all'avvio, senza i comandi del browser, con
   controlsList="nodownload", senza picture-in-picture, senza menu del
   tasto destro), «IN DIRETTA» rosso, la scelta della qualita'
   (Automatica, 360p, 180p: cambia davvero le righe del video); il
   grande «Attiva l'audio»; play/pausa (in pausa il video e' nascosto e
   al suo posto c'e' la nostra schermata, con «Torna in diretta»);
   tasti spazio, F, M e frecce con il fuoco sul lettore (dopo un clic
   sul video); schermo intero (anche finto, su iPhone); «Torna in diretta» dopo la pausa riporta al punto live;
   cambio del link durante la diretta senza ricaricare (stesso <video>,
   nessun ascolto Firestore in piu'); un link non valido («Video non
   disponibile», chiaro, e la pagina non si rompe); connessione persa e
   ritrovata; la presenza scritta dopo il ritardo casuale; ricarica
   senza nuovo accesso; pausa dell'evento con l'avviso a tutti; fine;
   ritorno in onda dopo la fine; Esci con conferma; password
   dimenticata; reimpostazione della password (anche con un
   collegamento scaduto). E nessuna violazione della CSP.

   E I CASI DELLA REVISIONE (ognuno falliva prima delle correzioni):
   - un solo dispositivo, DUE contesti veri: A entra e segnala, B entra
     entro 50 s (il suo primo segnale e' rifiutato dalle regole): B
     resta dentro, A esce con "altro dispositivo" al secondo rifiuto;
   - il lucchetto della presenza: due schede su due eventi diversi
     scrivono entrambe; con la scheda che tiene il lucchetto congelata
     (come su iPhone in secondo piano) l'altra scrive dopo 90 s;
   - localStorage bloccato: la sessione resta quella dell'accesso e i
     minuti si contano;
   - player che nasce lento (hls.js che arriva dopo 6 s): niente
     "Avvia la diretta" prima del tempo e mai il video visibile sotto
     una nostra schermata; "Avvia la diretta" vero (autoplay bloccato
     dal browser) al posto del video;
   - audio rifiutato dal browser: "Attiva l'audio" ricompare e il muto
     dice il vero; pausa imposta dal browser (Safari): il video resta
     toccabile;
   - anteprima del gestore: "Chiudi l'anteprima" non scollega la
     gestione aperta nell'altra scheda;
   - 403 'nessun-evento' all'accesso; &e= mandato al servizio; il link
     ?u=...&dimenticata=1; SDK di Firebase non scaricato (rete: nuovo
     tentativo; codice rotto: "browser non aggiornato");
   - "Connessione persa" mai davanti al video o ai comandi; avviso della
     regia a schermo intero; pulsanti di almeno 48 px e "Torna in
     diretta" con il suo nome anche sul telefono (dove si legge «Live»).
   Screenshot in risultati/screenshot-pagina/. Esce con 1 se qualcosa
   e' rosso.
   ============================================================ */
'use strict';
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const PORTE = { firestore: 8480, auth: 9480, api: 3480, statico: 8490 };
const PROGETTO = 'demo-ngb-eventi';
const EVENTO = 'napoli-2026';
const SITO = 'http://127.0.0.1:' + PORTE.statico;
const API = 'http://127.0.0.1:' + PORTE.api + '/api';
const DOMINIO_TECNICO = 'utenti.diretta.nextgenerationbusiness.it';
const FOTO = path.resolve(__dirname, 'risultati/screenshot-pagina');
fs.mkdirSync(FOTO, { recursive: true });

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:' + PORTE.firestore;
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:' + PORTE.auth;
const admin = require(path.resolve(__dirname, '../../email-service/node_modules/firebase-admin'));
const { chromium } = require('playwright');
const { preparaContesto } = require('./rete-prove');
const F = require('./flusso-prova');

// la web TV finta: il link principale e un secondo link (per il cambio durante la diretta)
const CARTELLA_WEBTV = path.resolve(__dirname, 'risultati/webtv-prova-pagina');
const LINK = F.WEBTV + '/live/master.m3u8';
const LINK_NUOVO = F.WEBTV + '/riserva/master.m3u8';

const pausa = ms => new Promise(r => setTimeout(r, ms));

/* ---------- esito delle prove ---------- */
let verdi = 0, rossi = 0;
const rossiElenco = [];
async function prova(descrizione, fn) {
    try {
        await fn();
        verdi++;
        console.log('  ok  ' + descrizione);
    } catch (e) {
        rossi++;
        rossiElenco.push(descrizione);
        console.log('ROSSO ' + descrizione + '\n       ' + String((e && e.message) || e).split('\n').slice(0, 3).join('\n       '));
    }
}
function vero(cond, messaggio) { if (!cond) throw new Error(messaggio || 'condizione falsa'); }
async function aspetta(fn, ms, cosa) {
    const t0 = Date.now();
    for (;;) {
        let v;
        try { v = await fn(); } catch (e) { v = null; }
        if (v) return v;
        if (Date.now() - t0 > ms) throw new Error('tempo scaduto (' + ms + ' ms): ' + cosa);
        await pausa(100);
    }
}

/* ---------- processi di appoggio (emulatori e sito) ---------- */
const figli = [];
function portaOccupata(porta) {
    return new Promise(risolvi => {
        const s = net.connect({ host: '127.0.0.1', port: porta });
        s.once('connect', () => { s.destroy(); risolvi(true); });
        s.once('error', () => risolvi(false));
    });
}
function avvia(nome, argomenti, rigaPronto, tempoMax, comando, cartella) {
    return new Promise((risolvi, rifiuta) => {
        const f = spawn(comando || process.execPath, argomenti, {
            cwd: cartella || __dirname, stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { FORCE_COLOR: '0' })
        });
        figli.push({ nome, f });
        let uscita = '';
        const timer = setTimeout(() => rifiuta(new Error(nome + ' non parte:\n' + uscita.slice(-2000))), tempoMax);
        const leggi = d => {
            uscita += d.toString();
            if (uscita.indexOf(rigaPronto) >= 0) { clearTimeout(timer); risolvi(f); }
        };
        f.stdout.on('data', leggi);
        f.stderr.on('data', leggi);
        f.on('exit', c => { clearTimeout(timer); rifiuta(new Error(nome + ' uscito (' + c + '):\n' + uscita.slice(-2000))); });
    });
}
async function portaLibera(da, escluse) {
    for (let p = da; p < da + 400; p++) {
        if (escluse.indexOf(p) < 0 && !(await portaOccupata(p))) return p;
    }
    throw new Error('nessuna porta libera dopo ' + da);
}
/* Gli emulatori, con le regole VERE della diretta. Prima con avvia-emulatori.js
   (il modo comune a tutte le prove); se una delle porte "di servizio" che quel
   file ricava da quella di Firestore (hub 4400+scarto, log 4500+scarto) e' gia'
   presa da un'altra prova che gira insieme (succede: il log di 8480 e l'hub di
   8580 sono entrambi 4900), si parte con le stesse regole e porte di servizio
   libere scelte qui. Le porte di Firestore e Auth restano quelle della prova. */
async function avviaEmulatori() {
    try {
        await avvia('emulatori', ['avvia-emulatori.js', '--firestore', String(PORTE.firestore), '--auth', String(PORTE.auth)], 'EMULATORI PRONTI', 120000);
        return;
    } catch (e) {
        if (!/port taken|could not start/i.test(String(e.message))) throw e;
        console.log('   (porte di servizio degli emulatori occupate da un\'altra prova: se ne scelgono di libere)');
    }
    const cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'ngb-emulatori-pagina-'));
    fs.copyFileSync(path.resolve(__dirname, '../firebase/firestore.rules'), path.join(cartella, 'firestore.rules'));
    const hub = await portaLibera(4481, []);
    const log = await portaLibera(hub + 1, [hub]);
    const ws = await portaLibera(9551, [hub, log]);
    fs.writeFileSync(path.join(cartella, 'firebase.json'), JSON.stringify({
        firestore: { rules: 'firestore.rules' },
        emulators: {
            auth: { port: PORTE.auth, host: '127.0.0.1' },
            firestore: { port: PORTE.firestore, host: '127.0.0.1', websocketPort: ws },
            hub: { port: hub, host: '127.0.0.1' },
            logging: { port: log, host: '127.0.0.1' },
            ui: { enabled: false }
        }
    }));
    await avvia('emulatori (porte di riserva)', ['emulators:start', '--only', 'auth,firestore', '--project', PROGETTO],
        'All emulators ready', 120000, path.resolve(__dirname, 'node_modules/.bin/firebase'), cartella);
}
async function fermaFigli() {
    for (const { f } of figli.reverse()) {
        if (f.exitCode != null) continue;
        await new Promise(risolvi => {
            const t = setTimeout(() => { try { f.kill('SIGKILL'); } catch (e) { /* gia' fermo */ } risolvi(); }, 15000);
            f.once('exit', () => { clearTimeout(t); risolvi(); });
            try { f.kill('SIGINT'); } catch (e) { clearTimeout(t); risolvi(); }
        });
    }
}

/* ---------- il video nella pagina ---------- */
// il <video> e il riquadro: che cosa si vede adesso
const statoVideo = page => page.evaluate(() => {
    const v = document.querySelector('#video-player video');
    const a = document.getElementById('area-video');
    const sv = document.getElementById('schermo-video');
    return {
        presente: !!v,
        t: v ? v.currentTime : 0,
        fermo: v ? v.paused : true,
        muto: v ? v.muted : true,
        volume: v ? Math.round(v.volume * 100) : 0,
        h: v ? v.videoHeight : 0,
        visibile: v ? getComputedStyle(v).visibility === 'visible' : false,
        bordo: v && v.seekable.length ? v.seekable.end(v.seekable.length - 1) : 0,
        schermata: a ? a.getAttribute('data-schermata') : '',
        tipo: sv && !sv.hidden ? sv.getAttribute('data-tipo') : ''
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
/* Gli ascolti su Firestore aperti e chiusi (addTarget/removeTarget nel
   canale Listen dell'SDK): durante la diretta la pagina ne tiene UNO,
   sull'evento. */
function contaAscolti(page) {
    const c = { aperti: 0, chiusi: 0 };
    page.on('request', q => {
        if (!/google\.firestore\.v1\.Firestore\/Listen\//.test(q.url())) return;
        let d = q.postData() || '';
        try { d = decodeURIComponent(d.replace(/\+/g, ' ')); } catch (e) { /* resta com'e' */ }
        c.aperti += (d.match(/"addTarget"/g) || []).length;
        c.chiusi += (d.match(/"removeTarget"/g) || []).length;
    });
    return c;
}

/* ---------- dati dell'evento ---------- */
const PROGRAMMA = [
    ['09.00', 'Registrazione e welcome coffee'], ['09.30', 'Apertura ufficiale dei lavori'], ['09.50', 'Keynote introduttivo'],
    ['10.00', 'Il futuro della Piccola Industria italiana'], ['10.30', 'Adeguati assetti e continuità aziendale'],
    ['11.10', 'Modello 231 e Tax Control Framework'], ['11.50', 'Sostenibilità e fattori ESG'], ['12.40', 'Finanza agevolata'],
    ['13.30', 'Lunch buffet e networking'], ['14.30', 'Rating di Legalità'], ['15.00', 'Banche'],
    ['15.50', 'Invitalia e MCC · Bagnoli e America\'s Cup 2027'], ['16.40', 'Sessione Questions and Answers'], ['17.10', 'Chiusura dei lavori']
].map(([ora, titolo]) => ({ ora, titolo }));
const INIZIO = Date.parse('2026-10-02T09:00:00+02:00');
const FINE = Date.parse('2026-10-02T17:30:00+02:00');

function eventoIniziale(T) {
    return {
        titolo: 'Next Generation Business 2026 · Napoli',
        luogo: 'Napoli · Hotel Eurostars Excelsior',
        data: '2026-10-02', oraInizio: '09:00', oraFine: '17:30',
        inizio: T.fromMillis(INIZIO), fine: T.fromMillis(FINE),
        videoId: '', videoAggiornato: T.now(),
        stato: 'programmato', statoAggiornato: T.now(),
        programma: PROGRAMMA,
        paginaEvento: '/napoli_ottobre_2026/',
        unSoloDispositivo: false,
        promemoria: { giornoPrima: false, oraPrima: false },
        avviso: '',
        creato: T.now(), aggiornato: T.now()
    };
}

(async () => {
    let browser = null;
    let trasmissione = null;
    try {
        /* ---------- 1. la diretta della web TV finta, emulatori e sito ---------- */
        const inTrasmissione = F.avviaTrasmissione(CARTELLA_WEBTV);
        if (!(await portaOccupata(PORTE.firestore)) || !(await portaOccupata(PORTE.auth))) {
            console.log('avvio degli emulatori (firestore ' + PORTE.firestore + ', auth ' + PORTE.auth + ')...');
            await avviaEmulatori();
        }
        if (!(await portaOccupata(PORTE.statico))) {
            await avvia('sito', ['server-locale.js', '--api', String(PORTE.api), '--statico', String(PORTE.statico),
                '--firestore', String(PORTE.firestore), '--auth', String(PORTE.auth)], 'SERVER LOCALE PRONTO', 30000);
        }
        trasmissione = await inTrasmissione;

        /* ---------- 2. dati nell'emulatore ---------- */
        await fetch('http://127.0.0.1:' + PORTE.firestore + '/emulator/v1/projects/' + PROGETTO + '/databases/(default)/documents', { method: 'DELETE' });
        await fetch('http://127.0.0.1:' + PORTE.auth + '/emulator/v1/projects/' + PROGETTO + '/accounts', { method: 'DELETE' });
        const app = admin.initializeApp({ projectId: PROGETTO }, 'prova-pagina');
        const db = app.firestore();
        const auth = app.auth();
        const T = admin.firestore.Timestamp;
        const evento = db.doc('eventi/' + EVENTO);

        const uid = 'p' + crypto.randomBytes(10).toString('hex');
        const emailTecnica = uid + '@' + DOMINIO_TECNICO;
        // la password della prova non si stampa mai
        const passwordValide = new Set([crypto.randomBytes(9).toString('base64').replace(/[^A-Za-z0-9]/g, 'x') + '7a']);
        const passwordIniziale = Array.from(passwordValide)[0];
        await auth.createUser({ uid, email: emailTecnica, password: passwordIniziale, displayName: 'Mario Rossi' });
        await auth.setCustomUserClaims(uid, { eventi: [EVENTO] });
        await db.doc('partecipanti/' + uid).set({
            uid, nomeUtente: 'mariorossi', nome: 'Mario', cognome: 'Rossi',
            email: 'mario.rossi@esempio.it', emailNorm: 'mario.rossi@esempio.it', azienda: 'Rossi Srl',
            idEvento: EVENTO, eventi: [EVENTO], stato: 'attivo', authCreato: true, ultimoAccesso: null,
            invii: { [EVENTO]: { stato: 'inviata', aggiornato: T.now(), tentativi: 1 } },
            creato: T.now(), aggiornato: T.now()
        });
        await db.doc('sessioni/' + uid).set({ stato: 'attivo', sessioneAttiva: null, aggiornato: T.now() });
        const uidGestore = 'gestore' + crypto.randomBytes(4).toString('hex');
        await auth.createUser({ uid: uidGestore, email: 'gestore@prova.it', emailVerified: true, password: passwordIniziale });
        await auth.setCustomUserClaims(uidGestore, { gestore: true });
        await db.doc('nomiUtente/mariorossi').set({ uid, base: 'mariorossi', creato: T.now() });
        await db.doc('eventiRiservati/' + EVENTO).set({ videoUrl: '', videoId: '', aggiornato: T.now() });
        await evento.set(eventoIniziale(T));

        /* Eventi e persone dei casi della revisione: ognuno il suo, cosi' le prove
           lunghe (che girano in sottofondo) non toccano l'evento di Napoli. */
        const ORA = Date.now();
        const oggiRoma = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ORA));
        async function eventoProva(id, titolo, extra) {
            await db.doc('eventi/' + id).set(Object.assign({
                titolo, luogo: 'Napoli', data: oggiRoma, oraInizio: '00:00', oraFine: '23:59',
                inizio: T.fromMillis(ORA - 3600e3), fine: T.fromMillis(ORA + 6 * 3600e3),
                videoId: LINK, videoAggiornato: T.now(), stato: 'in_onda', statoAggiornato: T.now(),
                programma: [], paginaEvento: '/napoli_ottobre_2026/', unSoloDispositivo: false,
                promemoria: { giornoPrima: false, oraPrima: false }, avviso: '', creato: T.now(), aggiornato: T.now()
            }, extra || {}));
            await db.doc('eventiRiservati/' + id).set({ videoUrl: LINK, videoId: LINK, aggiornato: T.now() });
        }
        await eventoProva('ev-unico', 'Prova: un solo dispositivo', { unSoloDispositivo: true });
        await eventoProva('ev-schede', 'Prova: due schede');
        await eventoProva('ev-lontano', 'Prova: evento di domani', { stato: 'programmato', videoId: '', inizio: T.fromMillis(ORA + 26 * 3600e3), fine: T.fromMillis(ORA + 30 * 3600e3) });
        await eventoProva('ev-in-onda', 'Prova: evento in onda');
        await eventoProva('ev-archivio', 'Prova: senza localStorage', { unSoloDispositivo: true });
        await eventoProva('ev-video', 'Prova: il player');

        // una password sola per queste persone (mai stampata)
        const PASSWORD_PROVA = 'Prova' + crypto.randomBytes(5).toString('hex') + '7';
        const utentiProva = {};
        async function nuovoPartecipante(nomeUtente, nome, cognome, eventi) {
            const id = 'p' + crypto.randomBytes(10).toString('hex');
            await auth.createUser({ uid: id, email: id + '@' + DOMINIO_TECNICO, password: PASSWORD_PROVA, displayName: nome + ' ' + cognome });
            await auth.setCustomUserClaims(id, { eventi });
            await db.doc('partecipanti/' + id).set({
                uid: id, nomeUtente, nome, cognome, email: nomeUtente + '@esempio.it', emailNorm: nomeUtente + '@esempio.it', azienda: 'Prova Srl',
                idEvento: eventi[0], eventi, stato: 'attivo', authCreato: true, ultimoAccesso: null, invii: {}, creato: T.now(), aggiornato: T.now()
            });
            await db.doc('sessioni/' + id).set({ stato: 'attivo', sessioneAttiva: null, aggiornato: T.now() });
            await db.doc('nomiUtente/' + nomeUtente).set({ uid: id, base: nomeUtente, creato: T.now() });
            utentiProva[nomeUtente] = { uid: id, nome, cognome, eventi, sessioni: [] };
        }
        await nuovoPartecipante('saracambio', 'Sara', 'Cambio', ['ev-unico']);
        await nuovoPartecipante('giuliaschede', 'Giulia', 'Schede', ['ev-schede']);
        await nuovoPartecipante('elenadue', 'Elena', 'Due', ['ev-lontano', 'ev-in-onda']);
        await nuovoPartecipante('luciasenza', 'Lucia', 'Senza', ['ev-archivio']);
        await nuovoPartecipante('paolovideo', 'Paolo', 'Video', ['ev-video']);
        const presenzaDi = async (idEvento, id) => {
            const s = await db.doc('presenze/' + idEvento + '_' + id).get();
            return s.exists ? s.data() : null;
        };

        /* ---------- 3. il finto servizio di accesso ---------- */
        const chiamate = [];              // [{azione, nomeUtente?, identificativo?}] (mai le password)
        const sessioniRilasciate = [];
        let errori = 0;
        async function servizio(route) {
            const req = route.request();
            const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, authorization', 'access-control-allow-methods': 'POST, OPTIONS' };
            if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
            const risposta = (stato, dati) => route.fulfill({ status: stato, headers: cors, contentType: 'application/json', body: JSON.stringify(dati) });
            let corpo = {};
            try { corpo = JSON.parse(req.postData() || '{}'); } catch (e) { corpo = {}; }
            chiamate.push({
                azione: corpo.azione, nomeUtente: corpo.nomeUtente, identificativo: corpo.identificativo, conToken: !!req.headers().authorization,
                idEvento: corpo.idEvento, conIdEvento: Object.prototype.hasOwnProperty.call(corpo, 'idEvento')
            });
            if (corpo.azione === 'entra') {
                // password giusta, ma nessun evento (per esempio dopo «Togli da questo evento»)
                if (corpo.nomeUtente === 'senzaeventi') {
                    return risposta(403, { ok: false, codice: 'nessun-evento', msg: 'Non risulti iscritto a nessuna diretta. Scrivi all\'assistenza.' });
                }
                /* Le persone dei casi della revisione: come il servizio vero
                   (lib/diretta-accesso.js), l'evento e' quello chiesto dal link se e'
                   tra i suoi, e con "un solo dispositivo" la sessione nuova diventa
                   quella ammessa in sessioni/{uid}. */
                const u = utentiProva[corpo.nomeUtente];
                if (u && corpo.password === PASSWORD_PROVA) {
                    const id = u.eventi.indexOf(corpo.idEvento) >= 0 ? corpo.idEvento : u.eventi[0];
                    const ev = (await db.doc('eventi/' + id).get()).data() || {};
                    const sessione = crypto.randomBytes(12).toString('hex');
                    await db.doc('sessioni/' + u.uid).set({ stato: 'attivo', sessioneAttiva: ev.unSoloDispositivo === true ? sessione : null, aggiornato: T.now() }, { merge: true });
                    u.sessioni.push(sessione);
                    return risposta(200, { ok: true, token: await auth.createCustomToken(u.uid), sessione, idEvento: id, nome: u.nome, cognome: u.cognome, nomeUtente: corpo.nomeUtente });
                }
                /* Scorciatoia SOLO di questa prova per avere nella pagina una sessione da
                   gestore (i gestori veri entrano dalla gestione con email e password) */
                if (corpo.nomeUtente === 'gestoreprova' && passwordValide.has(corpo.password)) {
                    return risposta(200, { ok: true, token: await auth.createCustomToken(uidGestore), sessione: 'g1', idEvento: EVENTO, nome: '', cognome: '', nomeUtente: '' });
                }
                if (corpo.nomeUtente === 'mariorossi' && passwordValide.has(corpo.password)) {
                    errori = 0;
                    const sessione = crypto.randomBytes(12).toString('hex');
                    sessioniRilasciate.push(sessione);
                    const token = await auth.createCustomToken(uid);
                    return risposta(200, { ok: true, token, sessione, idEvento: EVENTO, nome: 'Mario', cognome: 'Rossi', nomeUtente: 'mariorossi' });
                }
                errori++;
                if (errori >= 5) return risposta(429, { ok: false, codice: 'attendi', attesaSecondi: 30, msg: 'Troppi tentativi.' });
                return risposta(401, { ok: false, codice: 'credenziali', msg: 'Nome utente o password non corretti.', rimasti: Math.max(0, 5 - errori) });
            }
            if (corpo.azione === 'password-dimenticata') {
                return risposta(200, { ok: true, msg: 'Se l\'account esiste, ti abbiamo scritto all\'indirizzo email con cui ti sei iscritto.' });
            }
            if (corpo.azione === 'aggiorna-permessi') return risposta(200, { ok: true, aggiornati: false });
            return risposta(400, { ok: false, codice: 'azione', msg: 'Azione sconosciuta' });
        }
        // solo le chiamate delle prove "a vista": quelle lunghe, in sottofondo, entrano con le loro persone
        const quante = azione => chiamate.filter(c => c.azione === azione && !utentiProva[c.nomeUtente]).length;

        /* ---------- 4. il browser ---------- */
        browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

        /* extra (facoltativo): { prove: tempi della presenza, ritardoLibreriaMs:
           hls.js (diretta/hls.min.js) che arriva tardi, initScript: codice da
           eseguire in ogni pagina prima di tutto } */
        async function nuovoContesto(opzioni, senzaSchermoIntero, extra) {
            extra = extra || {};
            const context = await browser.newContext(Object.assign({ locale: 'it-IT', timezoneId: 'Europe/Rome' }, opzioni));
            await preparaContesto(context, {});
            // la web TV finta (registrata dopo preparaContesto: vince lei); controllo.richieste: i percorsi chiesti
            const webtv = await F.instradaWebTv(context, CARTELLA_WEBTV);
            if (extra.ritardoLibreriaMs) {
                await context.route('**/diretta/hls.min.js', async route => {
                    await pausa(extra.ritardoLibreriaMs);
                    try { await route.continue(); } catch (e) { /* pagina gia' chiusa */ }
                });
            }
            await context.route(API + '/diretta-accesso', servizio);
            await context.addInitScript(porte => {
                window.NGB_DIRETTA_PROVE = porte;
                // le violazioni della Content-Security-Policy della pagina
                if (window.top === window) {
                    window.__violazioniCsp = [];
                    document.addEventListener('securitypolicyviolation', e => {
                        window.__violazioniCsp.push(e.violatedDirective + ' ' + e.blockedURI + ' ' + (e.sourceFile || ''));
                    });
                }
            }, Object.assign({ firestore: PORTE.firestore, auth: PORTE.auth, api: API, ritardoPresenzaMs: 400, intervalloPresenzaMs: 1500 }, extra.prove || {}));
            if (extra.initScript) await context.addInitScript(extra.initScript);
            if (senzaSchermoIntero) {
                // come su iPhone: Safari non manda a schermo intero un riquadro qualsiasi
                await context.addInitScript(() => {
                    const via = (o, k) => { try { Object.defineProperty(o, k, { value: undefined, configurable: true, writable: true }); } catch (e) { /* niente */ } };
                    via(Element.prototype, 'requestFullscreen');
                    via(Element.prototype, 'webkitRequestFullscreen');
                    try { Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => false, configurable: true }); } catch (e) { /* niente */ }
                    try { Object.defineProperty(Document.prototype, 'webkitFullscreenEnabled', { get: () => false, configurable: true }); } catch (e) { /* niente */ }
                });
            }
            const page = await context.newPage();
            page.__erroriPagina = [];
            page.on('pageerror', e => page.__erroriPagina.push(String(e && e.message || e)));
            page.__ascolti = contaAscolti(page);
            return { context, page, webtv };
        }
        const vistaE = (page, v, ms) => page.waitForSelector('body[data-vista="' + v + '"]', { timeout: ms || 15000 });
        const visibile = (page, sel) => page.locator(sel).isVisible();
        const foto = (page, nome, intera) => page.screenshot({ path: path.join(FOTO, nome + '.png'), fullPage: !!intera });
        // il nostro <video>: 'assente', 'visible' o 'hidden' (nascosto sotto una nostra schermata)
        const visibilitaVideo = page => page.evaluate(() => {
            const v = document.querySelector('#video-player video');
            return v ? getComputedStyle(v).visibility : 'assente';
        });
        const vistaDi = page => page.getAttribute('body', 'data-vista');
        async function accedi(page, nome, password, indirizzo) {
            await page.goto(indirizzo || SITO + '/diretta/?emulatori=1');
            await vistaE(page, 'accesso', 30000);
            await page.fill('#campo-nome-utente', nome);
            await page.fill('#campo-password', password);
            await page.click('#btn-entra');
        }
        // le prove lunghe girano in sottofondo; l'esito si raccoglie alla fine
        const inSottofondo = fn => fn().then(v => ({ ok: true, v }), e => ({ ok: false, e }));
        async function esitoDi(promessa) {
            const r = await promessa;
            if (!r.ok) throw r.e;
            return r.v;
        }
        const tempiVeloci = { ritardoPresenzaMs: 300, intervalloPresenzaMs: 2000 };

        /* =================== PROVE LUNGHE (in sottofondo) ===================
           Le regole impongono 50 s fra due segnali: queste prove durano minuti,
           e girano insieme a tutte le altre. */

        /* 1. Un solo dispositivo, due dispositivi VERI: A entra e segnala; B entra
              entro 50 s. Il primo segnale di B e' rifiutato (troppo vicino a quello
              di A): prima delle correzioni B, il dispositivo buono, veniva fatto
              uscire con "altro dispositivo". Ora B resta dentro e al giro dopo
              segnala; A, soppiantato davvero, esce con il messaggio al secondo
              rifiuto di fila. */
        async function scenarioCambioDispositivo() {
            const u = utentiProva.saracambio;
            const A = await nuovoContesto({ viewport: { width: 1280, height: 800 } }, false, { prove: tempiVeloci });
            const B = await nuovoContesto({
                viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
                userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
            }, true, { prove: tempiVeloci });
            try {
                await accedi(A.page, 'saracambio', PASSWORD_PROVA);
                await vistaE(A.page, 'diretta', 30000);
                const sessA = u.sessioni[u.sessioni.length - 1];
                const primo = await aspetta(() => presenzaDi('ev-unico', u.uid), 20000, 'primo segnale di A');
                vero(primo.sessione === sessA && primo.collegamenti === 1, 'primo segnale di A: ' + JSON.stringify({ collegamenti: primo.collegamenti }));
                const tA = primo.ultimo.toMillis();

                await accedi(B.page, 'saracambio', PASSWORD_PROVA);
                await vistaE(B.page, 'diretta', 30000);
                const sessB = u.sessioni[u.sessioni.length - 1];
                vero((await db.doc('sessioni/' + u.uid).get()).data().sessioneAttiva === sessB, 'il servizio non ha ammesso B');
                // il primo segnale di B parte entro 300 ms: arriva meno di 50 s dopo quello di A
                await pausa(8000);
                vero(Date.now() - tA < 45000, 'prova troppo lenta: il segnale di B non e\' caduto nei 50 s');
                const dopoB = await presenzaDi('ev-unico', u.uid);
                vero(dopoB.sessione === sessA && dopoB.collegamenti === 1, 'il primo segnale di B doveva essere rifiutato: ' + JSON.stringify({ collegamenti: dopoB.collegamenti }));
                vero(await vistaDi(B.page) === 'diretta', 'B, il dispositivo ammesso, e\' stato fatto uscire dopo UN solo rifiuto (vista ' + await vistaDi(B.page) + ': «' + await B.page.textContent('#messaggio-titolo') + '»)');

                // A: il secondo rifiuto di fila (un "nuovo collegamento" un minuto dopo il primo) lo fa uscire
                await A.page.waitForSelector('body[data-vista="messaggio"]', { timeout: 180000 });
                const secondi = Math.round((Date.now() - tA) / 1000);
                vero(/altro dispositivo/.test(await A.page.textContent('#messaggio-titolo')), 'titolo su A: ' + await A.page.textContent('#messaggio-titolo'));
                vero(/Accedi di nuovo qui/.test(await A.page.textContent('#btn-messaggio-azione')), 'bottone su A');
                vero(await A.page.locator('#video-player video, #video-player iframe').count() === 0, 'il video resta acceso su A');
                vero(!(await A.page.locator('#btn-esci').isVisible()), 'A ancora collegato');
                await foto(A.page, 'altro-dispositivo-computer');

                // B e' ancora dentro, e il suo "nuovo collegamento" e' passato
                vero(await vistaDi(B.page) === 'diretta', 'B non e\' piu\' in diretta: ' + await vistaDi(B.page));
                const ora = await presenzaDi('ev-unico', u.uid);
                vero(ora.sessione === sessB && ora.collegamenti >= 2, 'il segnale di B non e\' mai passato: ' + JSON.stringify({ collegamenti: ora.collegamenti, diB: ora.sessione === sessB }));
                vero((await db.doc('sessioni/' + u.uid).get()).data().sessioneAttiva === sessB, 'sessione ammessa cambiata');
                vero(B.page.__erroriPagina.length === 0 && A.page.__erroriPagina.length === 0, 'errori: ' + A.page.__erroriPagina.concat(B.page.__erroriPagina).join(' | '));
                await A.page.click('#btn-messaggio-azione');
                await vistaE(A.page, 'accesso', 5000);
                return secondi;
            } finally {
                await A.context.close().catch(() => {});
                await B.context.close().catch(() => {});
            }
        }

        /* 2. Due schede sullo STESSO evento: la prima tiene il lucchetto e segnala;
              poi si ferma (come una scheda sospesa in secondo piano su iPhone:
              qui la ferma il debugger di Chromium, che blocca il suo codice ma
              le lascia il lucchetto). La seconda, che la persona sta guardando,
              prima non scriveva mai; ora scrive quando le altre tacciono da 90 s. */
        async function scenarioSchedaCongelata() {
            const u = utentiProva.giuliaschede;
            const C = await nuovoContesto({ viewport: { width: 1280, height: 800 } }, false, { prove: tempiVeloci });
            try {
                const a = C.page;
                await accedi(a, 'giuliaschede', PASSWORD_PROVA);
                await vistaE(a, 'diretta', 30000);
                const primo = await aspetta(() => presenzaDi('ev-schede', u.uid), 20000, 'primo segnale della scheda A');
                const tA = primo.ultimo.toMillis();
                const b = await C.context.newPage();
                b.__erroriPagina = [];
                b.on('pageerror', e => b.__erroriPagina.push(String(e && e.message || e)));
                await b.goto(SITO + '/diretta/?emulatori=1');
                await vistaE(b, 'diretta', 30000);
                await b.bringToFront();
                const cdp = await C.context.newCDPSession(a);
                await cdp.send('Debugger.enable');
                await cdp.send('Debugger.pause');
                const dopo = await aspetta(async () => {
                    const d = await presenzaDi('ev-schede', u.uid);
                    return d && d.collegamenti >= 2 ? d : null;
                }, 150000, 'segnale della scheda B');
                const attesa = Math.round((dopo.ultimo.toMillis() - tA) / 1000);
                vero(attesa >= 85, 'la scheda B ha scritto mentre la A segnalava ancora (dopo ' + attesa + ' s)');
                vero(b.__erroriPagina.length === 0, 'errori: ' + b.__erroriPagina.join(' | '));
                return attesa;
            } finally {
                await C.context.close().catch(() => {});
            }
        }

        /* 3. localStorage bloccato (Safari "Blocca tutti i cookie", dati dei siti
              bloccati): la sessione del dispositivo resta quella dell'accesso (in
              memoria), anche con "un solo dispositivo", e i minuti si contano.
              Prima: una sessione nuova a ogni segnale, rifiutata dalle regole. */
        async function scenarioSenzaLocalStorage() {
            const u = utentiProva.luciasenza;
            const C = await nuovoContesto({ viewport: { width: 1280, height: 800 } }, false, {
                // un minuto vero fra i segnali: il +60 vale solo dopo almeno 58 s
                prove: { ritardoPresenzaMs: 300, intervalloPresenzaMs: 60000 },
                initScript: () => {
                    try {
                        Object.defineProperty(window, 'localStorage', {
                            configurable: true,
                            get() { throw new DOMException('I dati dei siti sono bloccati', 'SecurityError'); }
                        });
                    } catch (e) { /* niente */ }
                }
            });
            try {
                await accedi(C.page, 'luciasenza', PASSWORD_PROVA);
                await vistaE(C.page, 'diretta', 30000);
                vero(await C.page.evaluate(() => { try { window.localStorage.getItem('x'); return false; } catch (e) { return true; } }), 'localStorage non bloccato');
                const sess = u.sessioni[u.sessioni.length - 1];
                const primo = await aspetta(() => presenzaDi('ev-archivio', u.uid), 20000, 'primo segnale');
                vero(primo.sessione === sess, 'il primo segnale non usa la sessione data all\'accesso');
                const d = await aspetta(async () => {
                    const x = await presenzaDi('ev-archivio', u.uid);
                    return x && x.secondi >= 60 ? x : null;
                }, 110000, 'un minuto contato');
                vero(d.sessione === sess && d.collegamenti === 1, JSON.stringify({ collegamenti: d.collegamenti, stessa: d.sessione === sess }));
                vero(await vistaDi(C.page) === 'diretta', 'vista: ' + await vistaDi(C.page));
                vero(C.page.__erroriPagina.length === 0, 'errori: ' + C.page.__erroriPagina.join(' | '));
                return d.secondi;
            } finally {
                await C.context.close().catch(() => {});
            }
        }

        const lunghe = {
            cambio: inSottofondo(scenarioCambioDispositivo),
            congelata: inSottofondo(scenarioSchedaCongelata),
            senzaArchivio: inSottofondo(scenarioSenzaLocalStorage)
        };

        /* =================== COMPUTER =================== */
        console.log('\nComputer 1366x900');
        const pc = await nuovoContesto({ viewport: { width: 1366, height: 900 } });
        const p = pc.page;
        await p.goto(SITO + '/diretta/?emulatori=1');

        await prova('senza accesso la pagina mostra la vista di accesso', async () => {
            await vistaE(p, 'accesso', 30000);
            vero(await visibile(p, '#form-accesso'), 'modulo di accesso non visibile');
            vero(!(await visibile(p, '#btn-esci')), 'Esci visibile senza accesso');
            await p.evaluate(() => document.fonts && document.fonts.ready);
            await foto(p, 'accesso-computer');
        });

        await prova('la pagina ha la CSP e il viewport per iPhone (viewport-fit=cover)', async () => {
            const csp = await p.getAttribute('meta[http-equiv="Content-Security-Policy"]', 'content');
            vero(/script-src 'self' https:\/\/www\.gstatic\.com/.test(csp) && /object-src 'none'/.test(csp), 'CSP mancante o diversa');
            const vp = await p.getAttribute('meta[name="viewport"]', 'content');
            vero(/viewport-fit=cover/.test(vp), 'viewport senza viewport-fit=cover');
            const inLinea = await p.evaluate(() => Array.from(document.scripts).filter(s => !s.src && s.type !== 'application/ld+json').length);
            vero(inLinea === 0, 'script in linea nella pagina: ' + inLinea);
        });

        await prova('un indirizzo email al posto del nome utente: avviso, nessuna chiamata', async () => {
            const prima = quante('entra');
            await p.fill('#campo-nome-utente', 'mario.rossi@esempio.it');
            await p.fill('#campo-password', 'qualcosa');
            await p.click('#btn-entra');
            await p.waitForFunction(() => /non l'indirizzo email/.test(document.getElementById('msg-accesso').textContent));
            vero(quante('entra') === prima, 'la chiamata e\' partita');
        });

        await prova('password sbagliata due volte: messaggio chiaro e il consiglio sul nome con il numero', async () => {
            await p.fill('#campo-nome-utente', 'mariorossi');
            await p.fill('#campo-password', 'sbagliata1');
            await p.click('#btn-entra');
            await p.waitForFunction(() => /non corretti/.test(document.getElementById('msg-accesso').textContent));
            await p.fill('#campo-password', 'sbagliata2');
            await p.click('#btn-entra');
            await p.waitForFunction(() => /può finire con un numero/.test(document.getElementById('msg-accesso').textContent));
        });

        await prova('accesso scrivendo " Mario Rossi ": ripulito in mariorossi, vista di attesa', async () => {
            await p.fill('#campo-nome-utente', ' Mario Rossi ');
            await p.waitForFunction(() => /mariorossi/.test(document.getElementById('aiuto-nome-utente').textContent));
            await p.fill('#campo-password', passwordIniziale);
            await p.click('#btn-entra');
            await vistaE(p, 'attesa', 20000);
            const ultima = chiamate.filter(c => c.azione === 'entra' && !utentiProva[c.nomeUtente]).pop();
            vero(ultima.nomeUtente === 'mariorossi', 'nome utente inviato: ' + ultima.nomeUtente);
            vero((await p.textContent('#nome-persona')).trim() === 'Mario Rossi', 'nome della persona: ' + await p.textContent('#nome-persona'));
            vero(/Napoli/.test(await p.textContent('#titolo-evento')), 'titolo evento: ' + await p.textContent('#titolo-evento'));
            vero(await visibile(p, '#btn-esci'), 'Esci non visibile');
            const sess = await p.evaluate(() => localStorage.getItem('ngbDirettaSessione'));
            vero(sess === sessioniRilasciate[sessioniRilasciate.length - 1], 'sessione non salvata');
        });

        await prova('attesa: conto alla rovescia che scorre, programma, data in ora italiana', async () => {
            const leggi = () => p.evaluate(() => ['conto-giorni', 'conto-ore', 'conto-minuti', 'conto-secondi'].map(id => document.getElementById(id).textContent));
            const a = await leggi();
            vero(a.every(x => /^\d{2}$/.test(x)), 'conto: ' + a.join(':'));
            const giorni = Math.floor((INIZIO - Date.now()) / 86400000);
            vero(Number(a[0]) === giorni, 'giorni ' + a[0] + ' invece di ' + giorni);
            await pausa(1300);
            const b = await leggi();
            vero(a.join() !== b.join(), 'il conto non scorre');
            vero((await p.locator('#programma li').count()) === PROGRAMMA.length, 'voci del programma');
            vero(/2 ottobre 2026.*9\.00.*17\.30.*ora italiana/.test(await p.textContent('#attesa-quando')), 'data: ' + await p.textContent('#attesa-quando'));
            vero(/inizia tra/.test(await p.textContent('#attesa-titolo')), 'titolo di attesa');
            vero(!(await visibile(p, '#stato-evento')) || /programma/i.test(await p.textContent('#stato-evento')), 'bollino in attesa');
            await foto(p, 'attesa-computer', true);
        });

        await prova('la regia manda in onda: la pagina passa da sola alla diretta e il video della web TV scorre', async () => {
            await evento.update({ stato: 'in_onda', videoId: LINK, statoAggiornato: T.now() });
            await vistaE(p, 'diretta', 15000);
            await videoVa(p, 30000, 'la diretta della web TV');
            vero((await p.textContent('#stato-evento')).trim() === 'IN DIRETTA', 'bollino: ' + await p.textContent('#stato-evento'));
            vero(await p.getAttribute('#stato-evento', 'data-stato') === 'in_onda', 'bollino non rosso');
            vero(pc.webtv.richieste.some(r => /^\/live\/stream_\d+\.m3u8$/.test(r)) && pc.webtv.richieste.some(r => /^\/live\/.*\.m4s$/.test(r)), 'playlist e segmenti della web TV non chiesti');
        });

        await prova('il player della web TV: il nostro <video> muto, senza comandi del browser, senza «scarica» né menu del tasto destro; «IN DIRETTA» e la qualità', async () => {
            const a = await p.evaluate(() => {
                const v = document.querySelector('#video-player video');
                return {
                    quanti: document.querySelectorAll('#video-player video, #video-player iframe').length,
                    playsinline: v.playsInline === true && v.hasAttribute('playsinline'), muto: v.muted, controlli: v.controls,
                    lista: v.getAttribute('controlslist') || '', nodownload: !!(v.controlsList && v.controlsList.contains('nodownload')),
                    pip: v.disablePictureInPicture === true, remoto: v.disableRemotePlayback === true
                };
            });
            vero(a.quanti === 1, 'elementi del video: ' + a.quanti);
            vero(a.playsinline && a.muto && !a.controlli, 'playsinline/muto/comandi del browser: ' + JSON.stringify(a));
            vero(/\bnodownload\b/.test(a.lista) && a.nodownload, 'controlsList: «' + a.lista + '»');
            vero(a.pip && a.remoto, 'picture-in-picture o trasmissione ad altri schermi possibili');
            // un vero clic destro sul video: il menu non si apre (l'evento arriva annullato)
            await p.evaluate(() => { window.__menu = null; window.addEventListener('contextmenu', e => { window.__menu = e.defaultPrevented; }, { once: true }); });
            const box = await p.locator('#video-player video').boundingBox();
            await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
            await pausa(200);
            vero(await p.evaluate(() => window.__menu) === true, 'il menu del tasto destro non e\' annullato');
            vero(await visibile(p, '#btn-attiva-audio'), '"Attiva l\'audio" non visibile');
            // "Attiva l'audio" NON sta sopra il video
            const v = await p.locator('#area-video').boundingBox();
            const b = await p.locator('#btn-attiva-audio').boundingBox();
            vero(b.y >= v.y + v.height - 1, 'il pulsante dell\'audio si sovrappone al video');
            await aspetta(() => visibile(p, '#indicatore-live'), 10000, '«IN DIRETTA» accanto ai comandi');
            vero(!(await visibile(p, '#btn-live')), '«Torna in diretta» al punto live');
            vero(!(await visibile(p, '#barra-dvr')), 'la barra per tornare indietro senza la finestra della web TV');
            await aspetta(() => visibile(p, '#sel-qualita'), 10000, 'la scelta della qualità');
            const voci = await p.locator('#sel-qualita option').allInnerTexts();
            vero(voci.join(',') === 'Automatica,360p,180p', 'qualità: ' + voci.join(', '));
            await foto(p, 'diretta-computer');
        });

        await prova('"Attiva l\'audio": il video suona (volume pieno) e continua, nello stesso clic', async () => {
            await p.click('#btn-attiva-audio');
            await p.waitForSelector('#btn-attiva-audio', { state: 'hidden' });
            const s = await statoVideo(p);
            vero(!s.muto && s.volume === 100 && !s.fermo, 'dopo il clic: ' + JSON.stringify({ muto: s.muto, volume: s.volume, fermo: s.fermo }));
            vero(await p.getAttribute('#btn-muto', 'data-muto') === '0', 'il bottone del muto non si aggiorna');
            await pausa(900);
            vero(!(await visibile(p, '#suggerimento-audio')), 'suggerimento audio mostrato a torto');
        });

        await prova('la qualità: scelta 180p il video passa a 180 righe, poi di nuovo «Automatica»', async () => {
            await p.selectOption('#sel-qualita', { label: '180p' });
            await aspetta(async () => { const s = await statoVideo(p); return s.h === 180 && !s.fermo; }, 20000, 'il video a 180 righe');
            await p.selectOption('#sel-qualita', { label: 'Automatica' });
            vero(await p.inputValue('#sel-qualita') === '-1', 'selettore: ' + await p.inputValue('#sel-qualita'));
            vero(!(await statoVideo(p)).fermo, 'il video si e\' fermato');
        });

        await prova('pausa: il video si nasconde, al suo posto la nostra schermata, e compare «Torna in diretta»', async () => {
            await p.click('#btn-play');
            await p.waitForSelector('#schermo-pausa', { state: 'visible' });
            vero((await statoVideo(p)).fermo, 'il video non si e\' fermato');
            vero(await visibilitaVideo(p) === 'hidden', 'il video resta visibile sotto la schermata');
            const a = await p.locator('#area-video').boundingBox();
            const s = await p.locator('#schermo-pausa').boundingBox();
            vero(Math.abs(a.x - s.x) < 1 && Math.abs(a.width - s.width) < 1 && Math.abs(a.height - s.height) < 1, 'la schermata non occupa il posto del video');
            await aspetta(() => visibile(p, '#btn-live'), 5000, '«Torna in diretta» in pausa');
            vero(!(await visibile(p, '#indicatore-live')), '«IN DIRETTA» in pausa');
            await foto(p, 'pausa-computer');
            await p.click('#btn-riprendi');
            await p.waitForSelector('#schermo-pausa', { state: 'hidden' });
            await videoVa(p, 10000, 'il video dopo «Riprendi»');
        });

        await prova('tastiera, con il fuoco sul lettore (dopo un clic sul video): spazio pausa/play, M muto, frecce volume', async () => {
            // un clic sul video porta il fuoco sul riquadro del lettore: da li' valgono le scorciatoie
            await p.click('#area-video');
            vero(await p.evaluate(() => document.activeElement === document.getElementById('riquadro-video')), 'dopo il clic sul video il fuoco non e\' sul lettore');
            await p.keyboard.press('Space');
            await p.waitForSelector('#schermo-pausa', { state: 'visible' });
            vero((await statoVideo(p)).fermo, 'spazio: il video non si ferma');
            await p.keyboard.press('Space');
            await p.waitForSelector('#schermo-pausa', { state: 'hidden' });
            await aspetta(async () => !(await statoVideo(p)).fermo, 5000, 'spazio: il video riparte');
            await p.keyboard.press('m');
            await aspetta(async () => (await statoVideo(p)).muto, 3000, 'M: il video diventa muto');
            vero(await p.getAttribute('#btn-muto', 'data-muto') === '1', 'M: il bottone del muto non segue');
            await p.keyboard.press('m');
            await aspetta(async () => !(await statoVideo(p)).muto, 3000, 'M: il video torna a suonare');
            await p.keyboard.press('ArrowDown');
            await p.keyboard.press('ArrowDown');
            vero((await statoVideo(p)).volume === 80, 'frecce giù: volume ' + (await statoVideo(p)).volume);
            await p.keyboard.press('ArrowUp');
            vero((await statoVideo(p)).volume === 90, 'freccia su: volume ' + (await statoVideo(p)).volume);
            vero(await p.inputValue('#volume') === '90', 'cursore del volume: ' + await p.inputValue('#volume'));
        });

        await prova('schermo intero sul nostro riquadro (tasto F e pulsante)', async () => {
            await p.focus('#riquadro-video');
            await p.keyboard.press('f');
            await p.waitForSelector('#riquadro-video[data-intero="1"]');
            const dim = await p.locator('#riquadro-video').boundingBox();
            vero(dim.width >= 1300 && dim.height >= 850, 'riquadro non a schermo intero: ' + JSON.stringify(dim));
            vero(await visibile(p, '#barra-comandi'), 'i nostri comandi non ci sono a schermo intero');
            vero(await visibile(p, '#indicatore-live') && await visibile(p, '#sel-qualita'), '«IN DIRETTA» o la qualità spariscono a schermo intero');
            await p.keyboard.press('f');
            await p.waitForSelector('#riquadro-video[data-intero="0"]');
            await p.click('#btn-schermo-intero');
            await p.waitForSelector('#riquadro-video[data-intero="1"]');
            await p.click('#btn-schermo-intero');
            await p.waitForSelector('#riquadro-video[data-intero="0"]');
        });

        await prova('avviso a tutti durante la diretta: in cima, annunciato, e a schermo intero nella striscia SOTTO il video', async () => {
            await evento.update({ avviso: 'Problema tecnico: torniamo tra 5 minuti.' });
            await p.waitForSelector('#avviso-evento', { state: 'visible', timeout: 10000 });
            await p.waitForFunction(() => /Avviso: Problema tecnico/.test(document.getElementById('annuncio').textContent), null, { timeout: 5000 });
            vero(!(await visibile(p, '#avviso-intero')), 'la copia nel riquadro si vede anche fuori dallo schermo intero');
            await p.focus('#riquadro-video');
            await p.keyboard.press('f');
            await p.waitForSelector('#riquadro-video[data-intero="1"]');
            await p.waitForSelector('#avviso-intero', { state: 'visible', timeout: 5000 });
            vero(/Problema tecnico/.test(await p.textContent('#avviso-intero')), 'testo: ' + await p.textContent('#avviso-intero'));
            const v = await p.locator('#area-video').boundingBox();
            const a = await p.locator('#avviso-intero').boundingBox();
            vero(a.y >= v.y + v.height - 1, 'l\'avviso sta sopra il video');
            vero(a.y + a.height <= 900 + 1, 'l\'avviso esce dallo schermo');
            await foto(p, 'avviso-schermo-intero-computer');
            await p.keyboard.press('f');
            await p.waitForSelector('#riquadro-video[data-intero="0"]');
            await evento.update({ avviso: '' });
            await p.waitForSelector('#avviso-evento', { state: 'hidden', timeout: 10000 });
        });

        await prova('"Torna in diretta" (e si chiama cosi\' anche per i lettori di schermo): dopo la pausa riporta al punto live, con «IN DIRETTA»', async () => {
            await p.click('#btn-play');
            await p.waitForSelector('#schermo-pausa', { state: 'visible' });
            await aspetta(() => visibile(p, '#btn-live'), 5000, '«Torna in diretta»');
            vero(await p.getByRole('button', { name: 'Torna in diretta' }).count() === 1, 'pulsante senza nome');
            await pausa(6000);
            const prima = await statoVideo(p);
            await p.click('#btn-live');
            await p.waitForSelector('#schermo-pausa', { state: 'hidden', timeout: 5000 });
            const dopo = await videoVa(p, 15000, 'il video al punto live');
            vero(dopo.bordo - dopo.t < 10 && dopo.bordo - dopo.t < prima.bordo - prima.t - 2,
                'non e\' tornato al punto live: ' + (prima.bordo - prima.t).toFixed(1) + ' s -> ' + (dopo.bordo - dopo.t).toFixed(1) + ' s dal bordo');
            await aspetta(() => visibile(p, '#indicatore-live'), 10000, '«IN DIRETTA» di nuovo');
            vero(!(await visibile(p, '#btn-live')), '«Torna in diretta» resta al punto live');
            await p.waitForFunction(() => /Di nuovo in diretta/.test(document.getElementById('annuncio').textContent), null, { timeout: 3000 });
        });

        await prova('la presenza viene scritta dopo il ritardo casuale (regole vere)', async () => {
            const snap = await aspetta(async () => {
                const s = await db.doc('presenze/' + EVENTO + '_' + uid).get();
                return s.exists ? s : null;
            }, 15000, 'documento di presenza');
            const d = snap.data();
            vero(d.uid === uid && d.idEvento === EVENTO, 'uid/evento');
            vero(d.collegamenti === 1 && d.secondi === 0, 'collegamenti ' + d.collegamenti + ', secondi ' + d.secondi);
            vero(d.sessione === sessioniRilasciate[sessioniRilasciate.length - 1], 'sessione diversa da quella dell\'accesso');
            vero(d.primo && d.ultimo && typeof d.primo.toMillis === 'function', 'orari del server');
            await pausa(4000);
            const d2 = (await db.doc('presenze/' + EVENTO + '_' + uid).get()).data();
            vero(d2.ultimo.toMillis() === d.ultimo.toMillis(), 'un secondo segnale prima di 55 s');
        });

        await prova('la regia cambia il link: il video riparte dal nuovo senza ricaricare la pagina, con lo stesso <video> e la stessa lettura in ascolto', async () => {
            await p.evaluate(() => { window.__segnoPagina = 'ancora-qui'; document.querySelector('#video-player video').dataset.segno = 'lo-stesso'; });
            const ascolti = Object.assign({}, p.__ascolti);
            vero(ascolti.aperti >= 1, 'la prova non vede l\'ascolto su Firestore: ' + JSON.stringify(ascolti));
            const da = pc.webtv.richieste.length;
            await evento.update({ videoId: LINK_NUOVO, videoAggiornato: T.now() });
            await aspetta(() => pc.webtv.richieste.slice(da).some(r => /^\/riserva\/.*\.m4s$/.test(r)), 15000, 'i segmenti del link nuovo');
            await videoVa(p, 15000, 'il video del link nuovo');
            const n = pc.webtv.richieste.length;
            await pausa(3000);
            vero(!pc.webtv.richieste.slice(n).some(r => /^\/live\//.test(r)), 'il player legge ancora il link di prima');
            vero(await p.evaluate(() => window.__segnoPagina) === 'ancora-qui', 'la pagina si e\' ricaricata');
            vero(await p.evaluate(() => { const v = document.querySelectorAll('#video-player video'); return v.length === 1 && v[0].dataset.segno === 'lo-stesso'; }), 'e\' stato creato un <video> nuovo');
            vero(p.__ascolti.aperti === ascolti.aperti && p.__ascolti.chiusi === ascolti.chiusi, 'ascolti su Firestore aperti o chiusi: ' + JSON.stringify({ prima: ascolti, dopo: p.__ascolti }));
            vero(!(await statoVideo(p)).muto, 'l\'audio attivato si e\' perso con il cambio di link');
        });

        await prova('un link non valido: «Video non disponibile» al posto del video, chiaro, la pagina non si rompe; poi un link buono torna da solo', async () => {
            // un file (non una diretta), poi un id di 11 caratteri rimasto dal player di prima: valori che il servizio non salva piu'
            await evento.update({ videoId: F.WEBTV + '/video/prova.mp4', videoAggiornato: T.now() });
            await aspetta(async () => (await statoVideo(p)).tipo === 'errore', 10000, '«Video non disponibile»');
            vero(/Video non disponibile/.test(await p.textContent('#schermo-video-titolo')), 'titolo: ' + await p.textContent('#schermo-video-titolo'));
            vero(/non è valido/.test(await p.textContent('#schermo-video-testo')), 'testo: ' + await p.textContent('#schermo-video-testo'));
            vero(await visibilitaVideo(p) !== 'visible', 'il video in errore resta visibile');
            // il video di prima (con l'audio attivo) non continua di nascosto
            vero((await statoVideo(p)).fermo, 'il video di prima continua a suonare sotto «Video non disponibile»');
            vero(!(await visibile(p, '#btn-attiva-audio')) && await p.isDisabled('#btn-play'), '«Attiva l\'audio» o il play con il video non disponibile');
            await foto(p, 'errore-video-computer');
            await evento.update({ videoId: 'aaaaaaaaaaa', videoAggiornato: T.now() });
            await pausa(1500);
            vero((await statoVideo(p)).tipo === 'errore' && await vistaDi(p) === 'diretta', 'con un id del player di prima: ' + JSON.stringify(await statoVideo(p)));
            await evento.update({ videoId: LINK, videoAggiornato: T.now() });
            await p.waitForSelector('#schermo-video', { state: 'hidden', timeout: 10000 });
            await videoVa(p, 20000, 'il video buono');
            vero(p.__erroriPagina.length === 0, 'errori: ' + p.__erroriPagina.join(' | '));
        });

        await prova('connessione persa: avviso dopo qualche secondo, poi sparisce al ritorno', async () => {
            await pc.context.setOffline(true);
            const t0 = Date.now();
            await p.waitForSelector('#avviso-connessione', { state: 'visible', timeout: 15000 });
            vero(Date.now() - t0 >= 4000, 'avviso mostrato subito (lampeggi)');
            vero(/Connessione persa/.test(await p.textContent('#avviso-connessione')), 'testo dell\'avviso');
            await foto(p, 'connessione-persa-computer');
            await pc.context.setOffline(false);
            await p.waitForSelector('#avviso-connessione', { state: 'hidden', timeout: 30000 });
        });

        await prova('ricarica della pagina: nessun nuovo accesso, di nuovo in diretta', async () => {
            const prima = quante('entra');
            const da = pc.webtv.richieste.length;
            await p.reload();
            await vistaE(p, 'diretta', 30000);
            await videoVa(p, 30000, 'il video dopo la ricarica');
            vero(quante('entra') === prima, 'la pagina ha rifatto l\'accesso');
            vero(pc.webtv.richieste.slice(da).some(r => /^\/live\/.*\.m4s$/.test(r)), 'video dopo la ricarica: non il link attuale');
        });

        await prova('pausa dell\'evento con avviso a tutti: vista pausa con l\'orario di ripresa', async () => {
            await evento.update({ stato: 'pausa', videoId: '', ripresa: '14:30', avviso: 'Problema tecnico: torniamo tra 5 minuti.' });
            await vistaE(p, 'pausa', 10000);
            vero(/si riprende alle 14\.30/.test(await p.textContent('#pausa-titolo')), 'titolo: ' + await p.textContent('#pausa-titolo'));
            vero(await visibile(p, '#avviso-evento'), 'avviso a tutti non visibile');
            vero(/Problema tecnico/.test(await p.textContent('#avviso-evento')), 'testo dell\'avviso');
            vero(await p.locator('#video-player video, #video-player iframe').count() === 0, 'il player resta vivo in pausa');
            await foto(p, 'pausa-evento-computer');
            await evento.update({ stato: 'in_onda', videoId: LINK, avviso: '' });
            await vistaE(p, 'diretta', 10000);
            await videoVa(p, 30000, 'il video dopo la pausa dell\'evento');
            vero(!(await visibile(p, '#avviso-evento')), 'avviso non tolto');
        });

        await prova('stato terminato: vista di fine, poi di nuovo in onda riparte da sola', async () => {
            await evento.update({ stato: 'terminato', videoId: '', statoAggiornato: T.now() });
            await vistaE(p, 'fine', 10000);
            vero(await p.getAttribute('#fine-link-evento', 'href') === '/napoli_ottobre_2026/', 'link alla pagina dell\'evento');
            vero(await p.locator('#video-player video, #video-player iframe').count() === 0, 'il player resta vivo a fine diretta');
            await foto(p, 'fine-computer');
            const da = pc.webtv.richieste.length;
            await evento.update({ stato: 'in_onda', videoId: LINK_NUOVO, statoAggiornato: T.now() });
            await vistaE(p, 'diretta', 10000);
            await aspetta(() => pc.webtv.richieste.slice(da).some(r => /^\/riserva\/.*\.m4s$/.test(r)), 15000, 'il video del nuovo link');
            await videoVa(p, 20000, 'il video di nuovo in onda');
        });

        await prova('Esci chiede conferma e torna alla vista di accesso', async () => {
            await p.click('#btn-esci');
            await p.waitForSelector('#dialogo-conferma', { state: 'visible' });
            await p.click('#btn-conferma-no');
            await p.waitForSelector('#dialogo-conferma', { state: 'hidden' });
            vero(await p.getAttribute('body', 'data-vista') === 'diretta', 'uscito senza conferma');
            await p.click('#btn-esci');
            await p.click('#btn-conferma-si');
            await vistaE(p, 'accesso', 10000);
            vero(await p.evaluate(() => localStorage.getItem('ngbDirettaSessione')) === null, 'sessione non tolta');
            vero(await p.inputValue('#campo-nome-utente') === 'mariorossi', 'nome utente non riproposto');
            vero(await p.locator('#video-player video, #video-player iframe').count() === 0, 'il player resta vivo dopo l\'uscita');
            vero(!(await visibile(p, '#btn-esci')), 'Esci ancora visibile');
        });

        await prova('password dimenticata: stessa risposta sempre, niente pagina nuova', async () => {
            await p.click('#link-dimenticata');
            await vistaE(p, 'dimenticata', 5000);
            await p.fill('#campo-identificativo', 'mariorossi');
            await p.click('#btn-invia-reset');
            await p.waitForFunction(() => /Se l'account esiste/.test(document.getElementById('msg-dimenticata').textContent), null, { timeout: 10000 });
            const c = chiamate.filter(x => x.azione === 'password-dimenticata').pop();
            vero(c && c.identificativo === 'mariorossi', 'identificativo inviato');
            await foto(p, 'dimenticata-computer');
            await p.click('#link-torna-accesso');
            await vistaE(p, 'accesso', 5000);
            await p.goto(SITO + '/diretta/?dimenticata=1');
            await vistaE(p, 'dimenticata', 20000);
        });

        await prova('il link «password dimenticata» delle email (?u=mariorossi&dimenticata=1) scrive già il nome utente', async () => {
            await p.goto(SITO + '/diretta/?u=mariorossi&dimenticata=1');
            await vistaE(p, 'dimenticata', 20000);
            vero(await p.inputValue('#campo-identificativo') === 'mariorossi', 'campo: «' + await p.inputValue('#campo-identificativo') + '»');
        });

        await prova('reimpostazione: collegamento scaduto -> "Richiedi un nuovo collegamento"', async () => {
            await p.goto(SITO + '/diretta/reimposta.html?oobCode=codice-inventato&u=mariorossi');
            await p.waitForSelector('#link-nuovo-collegamento', { state: 'visible', timeout: 20000 });
            vero(await p.getAttribute('#link-nuovo-collegamento', 'href') === '/diretta/?dimenticata=1', 'link del nuovo collegamento');
            vero(/scaduto o è già stato usato/.test(await p.textContent('#reimposta-sottotitolo')), 'testo: ' + await p.textContent('#reimposta-sottotitolo'));
        });

        await prova('reimpostazione: nuova password salvata, accesso automatico e poi la diretta', async () => {
            const link = await auth.generatePasswordResetLink(emailTecnica);
            const oob = new URL(link).searchParams.get('oobCode');
            await p.goto(SITO + '/diretta/reimposta.html?oobCode=' + encodeURIComponent(oob) + '&u=Mario%20Rossi');
            await p.waitForSelector('#form-reimposta', { state: 'visible', timeout: 20000 });
            vero(await p.inputValue('#nome-utente-reset') === 'mariorossi', 'nome utente mostrato: ' + await p.inputValue('#nome-utente-reset'));
            await p.fill('#campo-nuova', 'corta1');
            await p.fill('#campo-ripeti', 'corta1');
            await p.click('#btn-salva-password');
            await p.waitForFunction(() => /almeno 8 caratteri/.test(document.getElementById('msg-reimposta').textContent));
            await foto(p, 'reimposta-computer');
            const nuova = 'Nuova' + crypto.randomBytes(4).toString('hex') + '9';
            passwordValide.add(nuova);
            await p.fill('#campo-nuova', nuova);
            await p.fill('#campo-ripeti', nuova);
            await p.click('#btn-salva-password');
            await p.waitForURL(u => /\/diretta\/$/.test(new URL(u).pathname) && !/reimposta/.test(u), { timeout: 20000 });
            await vistaE(p, 'diretta', 30000);
            // la password vale davvero (emulatore di Auth)
            const r = await fetch('http://127.0.0.1:' + PORTE.auth + '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=finta', {
                method: 'POST', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ email: emailTecnica, password: nuova, returnSecureToken: true })
            });
            vero(r.ok, 'la nuova password non funziona');
        });

        await prova('nessuna violazione della Content-Security-Policy e nessun errore nella pagina', async () => {
            const v = await p.evaluate(() => window.__violazioniCsp || []);
            vero(v.length === 0, 'violazioni: ' + v.join(' | '));
            vero(p.__erroriPagina.length === 0, 'errori: ' + p.__erroriPagina.join(' | '));
        });
        await pc.context.close();

        /* =================== CASI PARTICOLARI =================== */
        console.log('\nCasi particolari (gestore, accesso, account disattivato)');
        const cp = await nuovoContesto({ viewport: { width: 1366, height: 900 } });
        const q = cp.page;
        const entraCome = async (nome, password) => {
            await vistaE(q, 'accesso', 30000);
            await q.fill('#campo-nome-utente', nome);
            await q.fill('#campo-password', password);
            await q.click('#btn-entra');
        };
        const esciDa = async pagina => {
            await pagina.click('#btn-esci');
            await pagina.click('#btn-conferma-si');
            await vistaE(pagina, 'accesso', 10000);
        };
        await q.goto(SITO + '/diretta/?emulatori=1');

        await prova('gestore: vista con il collegamento alla gestione, poi anteprima senza presenze', async () => {
            await entraCome('gestoreprova', passwordIniziale);
            await vistaE(q, 'gestore', 20000);
            vero((await q.textContent('#nome-persona')).trim() === 'gestore@prova.it', 'nome nella testata');
            await q.goto(SITO + '/diretta/?anteprima=' + EVENTO);
            await vistaE(q, 'diretta', 20000);
            await videoVa(q, 30000, 'il video nell\'anteprima');
            vero(await visibile(q, '#avviso-anteprima'), 'avviso di anteprima non visibile');
            vero(/Nessuna presenza registrata/.test(await q.textContent('#avviso-anteprima')), 'testo dell\'anteprima');
            await foto(q, 'anteprima-gestore-computer');
            // in anteprima il pulsante chiude l'anteprima, non scollega (vedi la prova con la gestione vera)
            vero((await q.textContent('#btn-esci')).trim() === 'Chiudi l\'anteprima', 'pulsante in anteprima: «' + (await q.textContent('#btn-esci')).trim() + '»');
            await pausa(3000);
            vero(!(await db.doc('presenze/' + EVENTO + '_' + uidGestore).get()).exists, 'l\'anteprima ha scritto una presenza');
            // dalla vista del gestore "Esci" scollega: la conferma dice che esce anche dalla gestione
            await q.goto(SITO + '/diretta/');
            await vistaE(q, 'gestore', 20000);
            vero((await q.textContent('#btn-esci')).trim() === 'Esci', 'pulsante nella vista del gestore');
            await q.click('#btn-esci');
            await q.waitForSelector('#dialogo-conferma', { state: 'visible' });
            vero(/anche dalla gestione/.test(await q.textContent('#dialogo-testo')), 'conferma: ' + await q.textContent('#dialogo-testo'));
            await q.click('#btn-conferma-si');
            await vistaE(q, 'accesso', 10000);
        });

        await prova('accesso di chi non è iscritto a nessun evento (403 nessun-evento): il messaggio giusto, non «errore del servizio»', async () => {
            await entraCome('senzaeventi', 'una-password-qualsiasi');
            await q.waitForFunction(() => /Non risulti iscritto a nessuna diretta/.test(document.getElementById('msg-accesso').textContent), null, { timeout: 10000 });
            vero(!/Errore del servizio/.test(await q.textContent('#msg-accesso')), 'messaggio generico');
            vero(await vistaDi(q) === 'accesso', 'vista: ' + await vistaDi(q));
        });

        await prova('il link dell\'email con &e=: l\'evento va anche al servizio; un valore non valido no', async () => {
            await q.goto(SITO + '/diretta/?e=' + EVENTO);
            await entraCome('mariorossi', passwordIniziale);
            await q.waitForSelector('body[data-vista="diretta"], body[data-vista="attesa"]', { timeout: 20000 });
            const c = chiamate.filter(x => x.azione === 'entra' && x.nomeUtente === 'mariorossi').pop();
            vero(c.idEvento === EVENTO, 'idEvento mandato: ' + c.idEvento);
            await esciDa(q);
            await q.goto(SITO + '/diretta/?e=' + encodeURIComponent('../Napoli 2026'));
            await entraCome('mariorossi', passwordIniziale);
            await q.waitForSelector('body[data-vista="diretta"], body[data-vista="attesa"]', { timeout: 20000 });
            const c2 = chiamate.filter(x => x.azione === 'entra' && x.nomeUtente === 'mariorossi').pop();
            vero(!c2.conIdEvento, 'mandato un idEvento non valido: ' + c2.idEvento);
            await esciDa(q);
        });

        await prova('account disattivato: messaggio chiaro, niente diretta', async () => {
            await db.doc('partecipanti/' + uid).update({ stato: 'disattivato' });
            await db.doc('sessioni/' + uid).update({ stato: 'disattivato' });
            await entraCome('mariorossi', passwordIniziale);
            await vistaE(q, 'messaggio', 20000);
            vero(/disattivato/.test(await q.textContent('#messaggio-titolo')), 'titolo: ' + await q.textContent('#messaggio-titolo'));
            vero(/Serve aiuto\? Scrivi a/.test(await q.textContent('#vista-messaggio')), 'manca l\'assistenza');
            await db.doc('partecipanti/' + uid).update({ stato: 'attivo' });
            await db.doc('sessioni/' + uid).update({ stato: 'attivo' });
            const v = await q.evaluate(() => window.__violazioniCsp || []);
            vero(v.length === 0, 'violazioni CSP: ' + v.join(' | '));
            vero(q.__erroriPagina.length === 0, 'errori: ' + q.__erroriPagina.join(' | '));
        });
        await cp.context.close();

        /* =================== ANTEPRIMA DALLA GESTIONE VERA =================== */
        console.log('\nAnteprima del gestore con la gestione aperta');
        await prova('«Vedi come un partecipante» e poi «Chiudi l\'anteprima»: la gestione aperta nell\'altra scheda resta collegata', async () => {
            const G = await nuovoContesto({ viewport: { width: 1366, height: 900 } }, false, { prove: { ritardoPresenzaMs: 999999 } });
            try {
                const g = G.page;
                await g.goto(SITO + '/diretta/gestione/?emulatori=1');
                await g.waitForSelector('#gestore-email', { state: 'visible', timeout: 30000 });
                await g.fill('#gestore-email', 'gestore@prova.it');
                await g.fill('#gestore-password', passwordIniziale);
                await g.click('#btn-gestore-entra');
                await g.waitForSelector('body[data-vista="app"]', { timeout: 30000 });
                // la gestione ha caricato gli eventi e ne ha scelto uno
                await g.waitForFunction(() => { const s = document.getElementById('sel-evento'); return s && s.value; }, null, { timeout: 30000 });
                await g.click('[data-scheda="regia"]');
                await g.waitForSelector('#btn-anteprima', { state: 'visible', timeout: 10000 });
                const [ant] = await Promise.all([G.context.waitForEvent('page', { timeout: 15000 }), g.click('#btn-anteprima')]);
                ant.__erroriPagina = [];
                ant.on('pageerror', e => ant.__erroriPagina.push(String(e && e.message || e)));
                await ant.waitForSelector('#avviso-anteprima:not([hidden])', { timeout: 30000 });
                vero((await ant.textContent('#btn-esci')).trim() === 'Chiudi l\'anteprima', 'pulsante: «' + (await ant.textContent('#btn-esci')).trim() + '»');
                const chiusa = ant.waitForEvent('close', { timeout: 10000 }).then(() => 'chiusa', () => '');
                const tornata = ant.waitForURL(/\/diretta\/gestione\//, { timeout: 10000 }).then(() => 'gestione', () => '');
                await ant.click('#btn-esci');
                const come = await Promise.race([chiusa, tornata]);
                vero(come, 'l\'anteprima non si e\' chiusa e non e\' tornata alla gestione');
                // prima delle correzioni qui la gestione tornava al modulo di accesso
                await pausa(4000);
                vero(await vistaDi(g) === 'app', 'la gestione e\' stata scollegata: vista ' + await vistaDi(g));
                vero(!(await g.locator('#form-gestore').isVisible()), 'modulo di accesso della gestione visibile');
                await g.reload();
                await g.waitForSelector('body[data-vista="app"]', { timeout: 30000 });
                vero(ant.__erroriPagina.length === 0, 'errori: ' + ant.__erroriPagina.join(' | '));
            } finally {
                await G.context.close().catch(() => {});
            }
        });

        /* =================== LUCCHETTO DELLA PRESENZA =================== */
        console.log('\nPresenza con due schede');
        await prova('due schede su due eventi diversi: il lucchetto e\' per evento, la scheda in onda segnala (e i lucchetti si rilasciano all\'uscita)', async () => {
            const u = utentiProva.elenadue;
            const C = await nuovoContesto({ viewport: { width: 1280, height: 800 } }, false, { prove: tempiVeloci });
            try {
                const a = C.page;
                await accedi(a, 'elenadue', PASSWORD_PROVA, SITO + '/diretta/?emulatori=1&e=ev-lontano');
                await vistaE(a, 'attesa', 30000);
                vero(chiamate.filter(x => x.azione === 'entra' && x.nomeUtente === 'elenadue').pop().idEvento === 'ev-lontano', 'evento del link non mandato al servizio');
                await pausa(1500);
                const b = await C.context.newPage();
                await b.goto(SITO + '/diretta/?emulatori=1&e=ev-in-onda');
                await vistaE(b, 'diretta', 30000);
                const d = await aspetta(() => presenzaDi('ev-in-onda', u.uid), 15000, 'segnale della scheda in onda');
                vero(d.collegamenti === 1, 'collegamenti ' + d.collegamenti);
                vero(!(await presenzaDi('ev-lontano', u.uid)), 'segnale sull\'evento di domani (fuori dalla finestra)');
                const tenuti = await b.evaluate(async () => (await navigator.locks.query()).held.map(l => l.name).filter(n => /^ngb-presenza/.test(n)).sort());
                vero(tenuti.length === 2 && tenuti[0] === 'ngb-presenza-ev-in-onda_' + u.uid && tenuti[1] === 'ngb-presenza-ev-lontano_' + u.uid, 'lucchetti: ' + tenuti.join(', '));
                await b.click('#btn-esci');
                await b.click('#btn-conferma-si');
                await vistaE(b, 'accesso', 10000);
                await vistaE(a, 'accesso', 10000);
                const dopo = await aspetta(async () => {
                    const l = await b.evaluate(async () => (await navigator.locks.query()).held.map(x => x.name).filter(n => /^ngb-presenza/.test(n)));
                    return l.length === 0 ? 'liberi' : '';
                }, 5000, 'lucchetti rilasciati').catch(e => e.message);
                vero(dopo === 'liberi', 'lucchetti ancora tenuti dopo l\'uscita: ' + dopo);
            } finally {
                await C.context.close().catch(() => {});
            }
        });

        /* =================== IL PLAYER NEI CASI DIFFICILI =================== */
        console.log('\nIl player nei casi difficili');
        // registra ogni 50 ms che cosa mostra il riquadro del video
        const registraSchermo = () => {
            if (window.top !== window) return;
            window.__registroSchermo = [];
            const t0 = Date.now();
            setInterval(() => {
                const area = document.getElementById('area-video');
                if (!area || document.body.getAttribute('data-vista') !== 'diretta') return;
                const v = document.querySelector('#video-player video');
                const sv = document.getElementById('schermo-video');
                const sp = document.getElementById('schermo-pausa');
                window.__registroSchermo.push({
                    t: Date.now() - t0,
                    schermata: area.getAttribute('data-schermata'),
                    video: v ? getComputedStyle(v).visibility : 'assente',
                    pronto: !!(v && v.readyState >= 1),
                    nostra: !sv.hidden || !sp.hidden,
                    avvia: !sv.hidden && !document.getElementById('btn-avvia-diretta').hidden
                });
            }, 50);
        };
        /* Il browser che blocca l'autoplay (come un iPhone in risparmio
           energetico): play() viene rifiutato finche' la persona non tocca la
           pagina dopo l'arrivo del video (qui: il tocco su «Avvia la
           diretta»; il clic su «Entra» di prima non vale), e l'attributo
           autoplay non vale. */
        const autoplayBloccato = () => {
            const play = HTMLMediaElement.prototype.play;
            let toccato = false;
            document.addEventListener('click', e => { if (e.target && e.target.closest && e.target.closest('#btn-avvia-diretta')) toccato = true; }, true);
            HTMLMediaElement.prototype.play = function () {
                if (toccato) return play.call(this);
                return Promise.reject(new DOMException('autoplay bloccato (prova)', 'NotAllowedError'));
            };
            Object.defineProperty(HTMLMediaElement.prototype, 'autoplay', { configurable: true, get() { return false; }, set() { /* ignorato */ } });
        };
        // il browser rifiuta l'audio: togliere il muto non ha effetto
        const audioRifiutato = () => {
            const d = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'muted');
            Object.defineProperty(HTMLMediaElement.prototype, 'muted', { configurable: true, get: d.get, set(v) { if (v) d.set.call(this, true); } });
        };
        // come Safari: quando gli si toglie il muto senza un tocco DENTRO il video, lo ferma
        const pausaDiSafari = () => {
            const d = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'muted');
            Object.defineProperty(HTMLMediaElement.prototype, 'muted', {
                configurable: true, get: d.get,
                set(v) { d.set.call(this, v); if (!v) { const el = this; setTimeout(() => el.pause(), 100); } }
            });
        };

        await prova('player che nasce lento (hls.js arriva dopo 6 s): niente «Avvia la diretta», mai il video SOTTO una nostra schermata', async () => {
            const C = await nuovoContesto({ viewport: { width: 1280, height: 800 } }, false, { ritardoLibreriaMs: 6000, prove: { ritardoPresenzaMs: 999999 }, initScript: registraSchermo });
            try {
                await accedi(C.page, 'paolovideo', PASSWORD_PROVA);
                await vistaE(C.page, 'diretta', 30000);
                await videoVa(C.page, 40000, 'il video dopo la libreria lenta');
                await pausa(3500);    // oltre i 3 s del "fermo"
                const reg = await C.page.evaluate(() => window.__registroSchermo);
                const attesa = reg.filter(x => x.video !== 'assente' && !x.pronto);
                vero(attesa.length && attesa[attesa.length - 1].t - attesa[0].t >= 4000, 'la prova non ha visto il player lento (' + (attesa.length ? attesa[attesa.length - 1].t - attesa[0].t : 0) + ' ms senza video)');
                const avvia = reg.filter(x => x.avvia);
                vero(!avvia.length, '«Avvia la diretta» mentre il player nasceva, a ' + (avvia[0] && avvia[0].t) + ' ms');
                const sotto = reg.filter(x => x.nostra && x.video === 'visible');
                vero(!sotto.length, 'video visibile sotto la schermata «' + (sotto[0] && sotto[0].schermata) + '» a ' + (sotto[0] && sotto[0].t) + ' ms');
                vero(reg[reg.length - 1].schermata === 'video', 'alla fine: ' + reg[reg.length - 1].schermata);
                vero(C.page.__erroriPagina.length === 0, 'errori: ' + C.page.__erroriPagina.join(' | '));
            } finally {
                await C.context.close().catch(() => {});
            }
        });

        await prova('in onda ma il dispositivo non avvia il video (autoplay bloccato): «Avvia la diretta» AL POSTO del video dopo 3 s, e poi il video', async () => {
            const C = await nuovoContesto({ viewport: { width: 1280, height: 800 } }, false, { prove: { ritardoPresenzaMs: 999999 }, initScript: autoplayBloccato });
            try {
                const pg = C.page;
                await accedi(pg, 'paolovideo', PASSWORD_PROVA);
                await vistaE(pg, 'diretta', 30000);
                await pg.waitForSelector('#video-player video', { state: 'attached', timeout: 15000 });
                const t0 = Date.now();
                await pg.waitForSelector('#btn-avvia-diretta', { state: 'visible', timeout: 20000 });
                vero(Date.now() - t0 >= 2000, '«Avvia la diretta» troppo presto');
                vero((await statoVideo(pg)).fermo, 'il video e\' partito da solo: la prova non ha bloccato l\'autoplay');
                vero(await visibilitaVideo(pg) === 'hidden', 'il video resta visibile sotto «Avvia la diretta»');
                vero(/La diretta è pronta/.test(await pg.textContent('#schermo-video-titolo')), 'titolo: ' + await pg.textContent('#schermo-video-titolo'));
                await foto(pg, 'avvia-la-diretta-computer');
                await pg.click('#btn-avvia-diretta');
                await pg.waitForFunction(() => document.getElementById('area-video').getAttribute('data-schermata') === 'video', null, { timeout: 5000 });
                const s = await videoVa(pg, 15000, 'il video dopo «Avvia la diretta»');
                vero(!s.muto, 'dopo «Avvia la diretta» il video resta muto');
            } finally {
                await C.context.close().catch(() => {});
            }
        });

        await prova('il browser rifiuta l\'audio: «Attiva l\'audio» ricompare e il pulsante del muto dice il vero', async () => {
            const C = await nuovoContesto({ viewport: { width: 1280, height: 800 } }, false, { prove: { ritardoPresenzaMs: 999999 }, initScript: audioRifiutato });
            try {
                const pg = C.page;
                await accedi(pg, 'paolovideo', PASSWORD_PROVA);
                await vistaE(pg, 'diretta', 30000);
                await videoVa(pg, 30000, 'la diretta');
                await pg.waitForSelector('#btn-attiva-audio', { state: 'visible', timeout: 15000 });
                await pg.click('#btn-attiva-audio');
                await pausa(1300);
                vero((await statoVideo(pg)).muto, 'la prova non ha rifiutato l\'audio');
                vero(await visibile(pg, '#btn-attiva-audio'), '«Attiva l\'audio» sparito con il video ancora muto');
                vero(await pg.getAttribute('#btn-muto', 'data-muto') === '1', 'il pulsante del muto dice «audio attivo»');
                vero(/Audio disattivato/.test(await pg.getAttribute('#btn-muto', 'aria-label')), 'etichetta: ' + await pg.getAttribute('#btn-muto', 'aria-label'));
                vero(await visibile(pg, '#suggerimento-audio') && /Tocca il video/.test(await pg.textContent('#suggerimento-audio')), 'suggerimento mancante');
                await foto(pg, 'audio-rifiutato-computer');
            } finally {
                await C.context.close().catch(() => {});
            }
        });

        await prova('il browser ferma il video quando si chiede l\'audio (come Safari): il video resta visibile e toccabile, niente nostra schermata di pausa', async () => {
            const C = await nuovoContesto({ viewport: { width: 1280, height: 800 } }, false, { prove: { ritardoPresenzaMs: 999999 }, initScript: pausaDiSafari });
            try {
                const pg = C.page;
                await accedi(pg, 'paolovideo', PASSWORD_PROVA);
                await vistaE(pg, 'diretta', 30000);
                await videoVa(pg, 30000, 'la diretta');
                await pg.waitForSelector('#btn-attiva-audio', { state: 'visible', timeout: 15000 });
                await pg.click('#btn-attiva-audio');
                await pausa(1300);
                vero((await statoVideo(pg)).fermo, 'la prova non ha fermato il video');
                vero(!(await visibile(pg, '#schermo-pausa')), 'la nostra schermata di pausa copre il video da toccare');
                vero(await visibilitaVideo(pg) === 'visible', 'video nascosto');
                vero(await visibile(pg, '#suggerimento-audio') && /Tocca il video/.test(await pg.textContent('#suggerimento-audio')), 'suggerimento mancante');
                // la persona tocca il video: riparte, con l'audio
                await pg.evaluate(() => document.querySelector('#video-player video').play());
                await pg.waitForSelector('#suggerimento-audio', { state: 'hidden', timeout: 5000 });
                vero(!(await statoVideo(pg)).muto, 'dopo il tocco il video e\' muto');
                // una pausa chiesta con i nostri comandi mostra invece la nostra schermata
                await pg.click('#btn-play');
                await pg.waitForSelector('#schermo-pausa', { state: 'visible', timeout: 5000 });
                vero(await visibilitaVideo(pg) === 'hidden', 'in pausa il video resta visibile');
            } finally {
                await C.context.close().catch(() => {});
            }
        });

        /* =================== CARICAMENTO DELL'SDK =================== */
        console.log('\nSDK di Firebase non scaricato');
        await prova('SDK non scaricato per la rete: «Non riusciamo a caricare la diretta» (non «browser non aggiornato») e nuovo tentativo da solo al ritorno della rete', async () => {
            const C = await nuovoContesto({ viewport: { width: 1280, height: 800 } }, false, { prove: { ritardoPresenzaMs: 999999 } });
            const blocca = route => route.abort('internetdisconnected');
            try {
                const pg = C.page;
                await C.context.route('**/firebasejs/*/firebase-auth.js', blocca);
                await pg.goto(SITO + '/diretta/?emulatori=1');
                await vistaE(pg, 'messaggio', 30000);
                vero(/Non riusciamo a caricare la diretta/.test(await pg.textContent('#messaggio-titolo')), 'titolo: ' + await pg.textContent('#messaggio-titolo'));
                vero(await visibile(pg, '#btn-messaggio-azione'), 'nessun pulsante per riprovare');
                await foto(pg, 'sdk-rete-computer');
                await C.context.unroute('**/firebasejs/*/firebase-auth.js', blocca);
                // la rete va e torna: la pagina si ricarica da sola
                await C.context.setOffline(true);
                await pausa(500);
                await C.context.setOffline(false);
                await vistaE(pg, 'accesso', 30000);
            } finally {
                await C.context.close().catch(() => {});
            }
        });

        await prova('SDK scaricato ma che il browser non capisce (SyntaxError): «Il browser non è aggiornato»', async () => {
            const C = await nuovoContesto({ viewport: { width: 1280, height: 800 } }, false, { prove: { ritardoPresenzaMs: 999999 } });
            try {
                const pg = C.page;
                await C.context.route('**/firebasejs/*/firebase-auth.js', route => route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: 'export const x = ;' }));
                await pg.goto(SITO + '/diretta/?emulatori=1');
                await vistaE(pg, 'messaggio', 30000);
                vero(/Il browser non è aggiornato/.test(await pg.textContent('#messaggio-titolo')), 'titolo: ' + await pg.textContent('#messaggio-titolo'));
            } finally {
                await C.context.close().catch(() => {});
            }
        });

        /* =================== TELEFONO (iPhone) =================== */
        console.log('\nTelefono 390x844 (iPhone, senza API di schermo intero)');
        await evento.set(eventoIniziale(T));
        const tel = await nuovoContesto({
            viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
        }, true);
        const t = tel.page;
        await t.goto(SITO + '/diretta/?emulatori=1&u=mariorossi');

        await prova('telefono: accesso con il nome utente dal link dell\'email', async () => {
            await vistaE(t, 'accesso', 30000);
            vero(await t.inputValue('#campo-nome-utente') === 'mariorossi', 'nome utente dal link');
            const larghezza = await t.evaluate(() => document.documentElement.scrollWidth);
            vero(larghezza <= 390, 'la pagina scorre in orizzontale: ' + larghezza);
            const corpo = await t.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
            vero(corpo >= 18, 'testo base ' + corpo + ' px');
            const h = (await t.locator('#btn-entra').boundingBox()).height;
            vero(h >= 48, 'pulsante Entra alto ' + h);
            const hd = (await t.locator('#link-dimenticata').boundingBox()).height;
            vero(hd >= 48, '«Password dimenticata?» alto ' + hd);
            await t.evaluate(() => document.fonts && document.fonts.ready);
            await foto(t, 'accesso-telefono', true);
            await t.fill('#campo-password', passwordIniziale);
            await t.tap('#btn-entra');
            await vistaE(t, 'attesa', 20000);
            await foto(t, 'attesa-telefono', true);
        });

        await prova('telefono: in onda, il video scorre, niente cursore del volume su iPhone, "Attiva l\'audio" grande', async () => {
            await evento.update({ stato: 'in_onda', videoId: LINK });
            await vistaE(t, 'diretta', 15000);
            await videoVa(t, 30000, 'la diretta sul telefono');
            vero(await t.evaluate(() => document.querySelector('#video-player video').playsInline === true), 'il video non resta nella pagina (playsinline)');
            await aspetta(() => visibile(t, '#indicatore-live'), 10000, '«IN DIRETTA»');
            await aspetta(() => visibile(t, '#sel-qualita'), 10000, 'la qualità');
            vero(!(await visibile(t, '#volume')), 'cursore del volume visibile su iPhone');
            vero(await visibile(t, '#btn-muto'), 'manca il bottone del muto');
            const b = await t.locator('#btn-attiva-audio').boundingBox();
            vero(b.height >= 48 && b.width >= 300, 'pulsante audio piccolo: ' + JSON.stringify(b));
            const larghezza = await t.evaluate(() => document.documentElement.scrollWidth);
            vero(larghezza <= 390, 'la pagina scorre in orizzontale: ' + larghezza);
            await foto(t, 'diretta-telefono');
            await t.tap('#btn-attiva-audio');
            await t.waitForSelector('#btn-attiva-audio', { state: 'hidden' });
        });

        await prova('telefono: pseudo schermo intero senza requestFullscreen (iPhone)', async () => {
            vero(await t.evaluate(() => typeof Element.prototype.requestFullscreen) === 'undefined', 'API non tolte');
            await t.tap('#btn-schermo-intero');
            await t.waitForSelector('#riquadro-video[data-intero="1"]');
            vero(await t.evaluate(() => document.documentElement.classList.contains('schermo-intero-finto')), 'classe mancante su html');
            const r = await t.locator('#riquadro-video').boundingBox();
            vero(r.x === 0 && r.y === 0 && Math.round(r.width) === 390 && Math.round(r.height) === 844, 'riquadro ' + JSON.stringify(r));
            vero(await visibile(t, '#barra-comandi'), 'comandi non visibili');
            await foto(t, 'diretta-schermo-intero-telefono');
            await t.tap('#btn-schermo-intero');
            await t.waitForSelector('#riquadro-video[data-intero="0"]');
            vero(!(await t.evaluate(() => document.documentElement.classList.contains('schermo-intero-finto'))), 'classe rimasta');
        });

        await prova('telefono: pulsanti di almeno 48 px, tutto dentro la barra, «Torna in diretta» ha il suo nome anche se si vede «Live»', async () => {
            // al punto live: «IN DIRETTA», la qualita' e lo schermo intero stanno nella barra
            const barra = await t.evaluate(() => {
                const r = document.getElementById('barra-comandi').getBoundingClientRect();
                return ['indicatore-live', 'sel-qualita', 'btn-schermo-intero'].map(id => {
                    const b = document.getElementById(id).getBoundingClientRect();
                    return { id, dentro: b.width > 0 && b.left >= r.left - 0.5 && b.right <= r.right + 0.5 };
                });
            });
            vero(barra.every(x => x.dentro), 'fuori dalla barra: ' + barra.filter(x => !x.dentro).map(x => x.id).join(', '));
            // «Torna in diretta» c'e' quando si e' indietro: qui, in pausa
            await t.tap('#btn-play');
            await t.waitForSelector('#schermo-pausa', { state: 'visible' });
            await aspetta(() => visibile(t, '#btn-live'), 5000, '«Torna in diretta» in pausa');
            const live = t.getByRole('button', { name: 'Torna in diretta' });
            vero(await live.count() === 1 && await live.isVisible(), 'pulsante «Torna in diretta» senza nome');
            vero((await t.textContent('#btn-live')).indexOf('Live') >= 0 && await t.locator('#btn-live .testo-corto').isVisible(), 'a vista non dice «Live»');
            for (const id of ['btn-live', 'btn-esci', 'btn-play', 'btn-muto', 'btn-schermo-intero', 'btn-attiva-audio', 'btn-riprendi']) {
                const el = t.locator('#' + id);
                if (!(await el.isVisible())) continue;
                const b = await el.boundingBox();
                vero(b.height >= 48 && b.width >= 44, '#' + id + ' misura ' + Math.round(b.width) + 'x' + Math.round(b.height));
            }
            const larghezza = await t.evaluate(() => document.documentElement.scrollWidth);
            vero(larghezza <= 390, 'la pagina scorre in orizzontale: ' + larghezza);
            await foto(t, 'torna-in-diretta-telefono');
            await t.tap('#btn-live');
            await t.waitForSelector('#schermo-pausa', { state: 'hidden', timeout: 5000 });
            await videoVa(t, 15000, 'il video dopo «Live»');
            await aspetta(() => visibile(t, '#indicatore-live'), 10000, '«IN DIRETTA» dopo «Live»');
        });

        await prova('telefono: l\'avviso della regia si vede anche nello pseudo schermo intero, sotto il video', async () => {
            await evento.update({ avviso: 'Riprendiamo alle 14.30.' });
            await t.waitForSelector('#avviso-evento', { state: 'visible', timeout: 10000 });
            await t.tap('#btn-schermo-intero');
            await t.waitForSelector('#riquadro-video[data-intero="1"]');
            await t.waitForSelector('#avviso-intero', { state: 'visible', timeout: 5000 });
            const v = await t.locator('#area-video').boundingBox();
            const a = await t.locator('#avviso-intero').boundingBox();
            vero(a.y >= v.y + v.height - 1 && a.y + a.height <= 844 + 1, 'avviso fuori posto: ' + JSON.stringify({ a, v }));
            await foto(t, 'avviso-schermo-intero-telefono');
            await t.tap('#btn-schermo-intero');
            await t.waitForSelector('#riquadro-video[data-intero="0"]');
            await evento.update({ avviso: '' });
            await t.waitForSelector('#avviso-evento', { state: 'hidden', timeout: 10000 });
        });

        await prova('telefono: «Connessione persa» in cima al riquadro del video, visibile e mai davanti al video o ai comandi (verticale, orizzontale, schermo intero)', async () => {
            const misura = () => t.evaluate(() => {
                const r = id => { const b = document.getElementById(id).getBoundingClientRect(); return { alto: b.top, basso: b.bottom }; };
                return {
                    avviso: r('avviso-connessione'), video: r('area-video'), comandi: r('barra-comandi'),
                    dentro: document.getElementById('riquadro-video').contains(document.getElementById('avviso-connessione')),
                    altezza: window.innerHeight
                };
            });
            const controlla = async come => {
                const m = await misura();
                vero(m.dentro, come + ': l\'avviso non e\' nel riquadro del video');
                // sopra il video, non davanti; e quindi nemmeno sui comandi, che stanno sotto il video
                vero(m.avviso.basso <= m.video.alto + 0.5, come + ': l\'avviso copre il video ' + JSON.stringify(m));
                vero(m.video.basso <= m.comandi.alto + 0.5, come + ': il video copre i comandi ' + JSON.stringify(m));
                vero(m.avviso.alto >= -0.5 && m.avviso.basso <= m.altezza + 0.5, come + ': l\'avviso e\' fuori dallo schermo ' + JSON.stringify(m));
                return m;
            };
            await tel.context.setOffline(true);
            await t.waitForSelector('#avviso-connessione', { state: 'visible', timeout: 15000 });
            await controlla('verticale');
            await t.tap('#btn-schermo-intero');
            await t.waitForSelector('#riquadro-video[data-intero="1"]');
            const m = await controlla('schermo intero');
            vero(m.comandi.basso <= m.altezza + 0.5, 'a schermo intero i comandi escono dallo schermo');
            await foto(t, 'connessione-persa-schermo-intero-telefono');
            await t.tap('#btn-schermo-intero');
            await t.waitForSelector('#riquadro-video[data-intero="0"]');
            await t.setViewportSize({ width: 844, height: 390 });
            await pausa(300);
            await controlla('orizzontale');
            await foto(t, 'connessione-persa-orizzontale-telefono');
            await t.setViewportSize({ width: 390, height: 844 });
            await tel.context.setOffline(false);
            await t.waitForSelector('#avviso-connessione', { state: 'hidden', timeout: 30000 });
        });

        await prova('telefono: pausa con la nostra schermata', async () => {
            await t.tap('#btn-play');
            await t.waitForSelector('#schermo-pausa', { state: 'visible' });
            vero(await visibilitaVideo(t) === 'hidden', 'video visibile in pausa');
            await foto(t, 'pausa-telefono');
            await t.tap('#btn-riprendi');
            await t.waitForSelector('#schermo-pausa', { state: 'hidden' });
        });

        await prova('telefono: fine della diretta', async () => {
            await evento.update({ stato: 'terminato', videoId: '' });
            await vistaE(t, 'fine', 10000);
            await foto(t, 'fine-telefono', true);
            const v = await t.evaluate(() => window.__violazioniCsp || []);
            vero(v.length === 0, 'violazioni CSP: ' + v.join(' | '));
            vero(t.__erroriPagina.length === 0, 'errori: ' + t.__erroriPagina.join(' | '));
        });
        await tel.context.close();

        /* =================== TABLET (solo foto) =================== */
        await prova('tablet 820x1180: diretta', async () => {
            await evento.update({ stato: 'in_onda', videoId: LINK });
            const tab = await nuovoContesto({ viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
            await tab.page.goto(SITO + '/diretta/?emulatori=1');
            await vistaE(tab.page, 'accesso', 30000);
            await tab.page.fill('#campo-nome-utente', 'mariorossi');
            await tab.page.fill('#campo-password', passwordIniziale);
            await tab.page.tap('#btn-entra');
            await vistaE(tab.page, 'diretta', 20000);
            await videoVa(tab.page, 30000, 'la diretta sul tablet');
            const larghezza = await tab.page.evaluate(() => document.documentElement.scrollWidth);
            vero(larghezza <= 820, 'la pagina scorre in orizzontale: ' + larghezza);
            await foto(tab.page, 'diretta-tablet', true);
            await tab.context.close();
        });

        /* =================== L'ESITO DELLE PROVE LUNGHE =================== */
        console.log('\nProve lunghe (partite all\'inizio, in sottofondo)');
        await prova('un solo dispositivo, due dispositivi veri: B entra entro 50 s da A e resta dentro; A esce con «altro dispositivo» al secondo rifiuto', async () => {
            const s = await esitoDi(lunghe.cambio);
            console.log('       (A e\' uscito ' + s + ' s dopo il suo ultimo segnale riuscito)');
        });
        await prova('due schede sullo stesso evento, quella col lucchetto congelata: l\'altra segnala dopo 90 s di silenzio', async () => {
            const s = await esitoDi(lunghe.congelata);
            console.log('       (la seconda scheda ha segnalato ' + s + ' s dopo l\'ultimo segnale della prima)');
        });
        await prova('localStorage bloccato: la sessione resta quella dell\'accesso («un solo dispositivo») e il minuto si conta', async () => {
            await esitoDi(lunghe.senzaArchivio);
        });

        await app.delete();
    } catch (e) {
        rossi++;
        console.log('ROSSO (interruzione) ' + String((e && e.stack) || e));
    } finally {
        if (browser) await browser.close().catch(() => {});
        if (trasmissione) trasmissione.ferma();
        await fermaFigli();
    }
    console.log('\n' + verdi + ' verdi, ' + rossi + ' rossi' + (rossiElenco.length ? ':\n - ' + rossiElenco.join('\n - ') : ''));
    console.log('Screenshot in ' + path.relative(process.cwd(), FOTO));
    process.exit(rossi ? 1 : 0);
})();
