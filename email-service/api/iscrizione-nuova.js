/* ============================================================
   Nuova iscrizione a un evento (dal form pubblico del sito)
   ------------------------------------------------------------
   I form del sito continuano a scrivere sul foglio Google come
   sempre; IN PIU' mandano qui gli stessi dati, che finiscono
   direttamente su Firestore (collezione "iscrizioni").

   Perche': il foglio resta comodo per chi lo consulta, ma l'area
   riservata non deve dipendere da una catena di tre pezzi (script
   di Google, API Sheets, account di servizio condiviso). Con i
   dati anche su Firestore, se una delle due strade si rompe
   l'altra continua a funzionare.

   Questo endpoint e' PUBBLICO per forza (lo chiama il visitatore
   che si iscrive), quindi:
     - accetta solo POST e solo campi noti, con lunghezze massime;
     - scrive con l'account di servizio (Admin SDK), quindi le
       regole di sicurezza di Firestore non entrano in gioco e
       nessuno puo' scrivere a mano sul database dal browser;
     - l'identificativo del documento e' ricavato da email e data,
       quindi un doppio invio aggiorna la stessa scheda invece di
       creare un duplicato;
     - limita gli invii ripetuti dallo stesso indirizzo IP.
   Non restituisce mai dati: risponde solo ok/non ok.

   QUI DENTRO vive anche il COMPLETAMENTO dei dati di un'iscrizione
   manuale (azioni "completa-leggi" e "completa-salva"). Ci e' finito
   perche' il piano Hobby ammetteva 12 funzioni per deploy e una
   tredicesima faceva fallire l'intera pubblicazione; sul piano Pro
   quel tetto non c'e' piu', ma resta il motivo buono: e' lo stesso
   tipo di endpoint (pubblico, con limite per IP), cambia solo
   l'azione nel corpo. Vedi completaIscrizione() qui sotto.
   ============================================================ */

const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
// firma del collegamento personale "completa i dati" (stesso segreto della
// disiscrizione, contesto diverso). Da NL si usano SOLO le funzioni di firma
// e la regex email: l'inizializzazione di firebase-admin resta quella locale,
// per non inizializzare l'app due volte.
const NL = require('../lib/newsletter');
// mail NGB composte dal servizio: questo endpoint e' pubblico, quindi l'HTML
// non puo' arrivare da fuori come per gli invii dell'area riservata
const MNGB = require('../lib/mail-ngb');
// il foglio della prenotazione B2B, allegato alla mail di conferma
const PDF = require('../lib/pdf-prenotazione');
/* L'agenda degli incontri B2B: aree, referenti, slot e prenotazioni. Qui
   serve la meta' pubblica - quello che vede e prenota chi ha ricevuto
   l'invito - mentre l'altra meta' la usa l'area riservata passando da
   api/presenze.js. E' un modulo solo perche' gli orari liberi e quelli
   occupati devono essere gli stessi da tutte e due le parti. */
const AGENDA = require('../lib/agenda-b2b');
/* I codici riservati alle aziende invitate: nascono nella PEC di invito e
   tornano qui scritti nel modulo. Sono il filo che lega l'elenco delle
   aziende selezionate a quello degli iscritti. */
const CODICI = require('../lib/codici-invito');
/* Le richieste di contatto che arrivano dal pulsante dentro le mail di
   sponsorizzazione. Stanno qui e non in una funzione loro perche' sono lo
   stesso genere di endpoint - pubblico, con il freno per indirizzo IP che
   questo file gia' applica - e riscriverne la guardia altrove vorrebbe dire
   avere due porte aperte da tenere chiuse invece di una. */
const CONTATTI = require('../lib/richieste-contatto');
/* Le conferme alle due cene dei giorni del convegno (1 e 2 ottobre a Napoli).
   Stesso genere di endpoint delle richieste di contatto - pubblico, con il
   freno per indirizzo IP che questo file gia' applica - e stessa ragione per
   non fargli una funzione sua: chi conferma arriva da una pagina che non ha
   nient'altro da chiedere al servizio. */
const CENE = require('../lib/cene-evento');

// stesso trasporto SMTP delle altre mail di servizio
function trasporto() {
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 465,
        secure: (Number(process.env.SMTP_PORT) || 465) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
}
function mittenteMail() {
    const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
    const fromName = (process.env.SMTP_FROM_NAME || 'Revilaw S.p.A.').replace(/[\r\n]/g, ' ').slice(0, 80);
    return '"' + fromName + '" <' + fromEmail + '>';
}
/* Le conferme automatiche partono SOLO per i moduli degli eventi: su questo
   archivio scrivono anche gli altri moduli del sito (approfondimenti,
   newsletter), e a quelli non va spedito nulla. */
const RE_PAGINA_EVENTO = /verona|roma|napoli|milano/i;

function leggiServiceAccount() {
    const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT mancante');
    let testo = raw;
    if (testo[0] !== '{') {
        try {
            const dec = Buffer.from(testo, 'base64').toString('utf8').trim();
            if (dec[0] === '{') testo = dec;
        } catch (_) { /* lo segnala JSON.parse */ }
    }
    let cred;
    try { cred = JSON.parse(testo); }
    catch (_) { throw new Error('FIREBASE_SERVICE_ACCOUNT non valido'); }
    if (cred.private_key && cred.private_key.includes('\\n')) {
        cred.private_key = cred.private_key.replace(/\\n/g, '\n');
    }
    return cred;
}

let appPronta = false;
function initAdmin(cred) {
    if (appPronta) return;
    admin.initializeApp({ credential: admin.credential.cert(cred) });
    appPronta = true;
}

/* --- limite dei salvataggi di UNA scheda ---
   La prenotazione si puo' cambiare quante volte si vuole, ed e' giusto cosi':
   ogni cambio pero' fa partire una mail con l'allegato. Questo tetto lascia
   passare tutti i ripensamenti veri e ferma solo l'accanimento sul pulsante,
   che sarebbe una mail dietro l'altra allo stesso indirizzo. */
const RL_SCHEDA_MS = 10 * 60 * 1000;
const RL_SCHEDA_MAX = 12;
const salvataggi = new Map();
function troppiSalvataggi(idDoc) {
    if (!idDoc) return false;
    const ora = Date.now();
    const elenco = (salvataggi.get(idDoc) || []).filter(t => ora - t < RL_SCHEDA_MS);
    if (elenco.length >= RL_SCHEDA_MAX) { salvataggi.set(idDoc, elenco); return true; }
    elenco.push(ora);
    salvataggi.set(idDoc, elenco);
    if (salvataggi.size > 500) {
        for (const [k, v] of salvataggi) {
            if (!v.length || ora - v[v.length - 1] > RL_SCHEDA_MS) salvataggi.delete(k);
        }
    }
    return false;
}

/* --- limite invii per indirizzo IP ---
   In memoria: su serverless l'istanza puo' cambiare, quindi non e' una
   difesa assoluta, ma taglia i tentativi ripetuti dalla stessa origine. */
const RL_FINESTRA_MS = 10 * 60 * 1000;
const RL_MAX = 8;
const invii = new Map();
function troppiInvii(ip) {
    if (!ip) return false;
    const ora = Date.now();
    const elenco = (invii.get(ip) || []).filter(t => ora - t < RL_FINESTRA_MS);
    if (elenco.length >= RL_MAX) { invii.set(ip, elenco); return true; }
    elenco.push(ora);
    invii.set(ip, elenco);
    // pulizia: non lasciamo crescere la mappa all'infinito
    if (invii.size > 500) {
        for (const [k, v] of invii) {
            if (!v.length || ora - v[v.length - 1] > RL_FINESTRA_MS) invii.delete(k);
        }
    }
    return false;
}

// testo ripulito e accorciato: niente campi enormi nel database
function testo(v, max) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 200);
}
function emailValida(e) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}
/* Consenso: TRE valori, non due. true = spuntato, false = ha detto no,
   null = il modulo non lo manda affatto.
   La differenza conta piu' di quanto sembri. Registrare false quando il campo
   non arriva vuol dire mettere agli atti un rifiuto che nessuno ha espresso, e
   il rifiuto e' definitivo: chi risulta rifiutato non entra in nessun invio,
   non si puo' spuntare a mano e non lo recupera nemmeno l'attribuzione del
   consenso, che per scelta vale solo per i consensi NON RISULTANTI. Un modulo
   collegato senza la casella marketing marchierebbe cosi ogni nuovo iscritto.
   Si accettano anche le forme testuali, accento compreso: i moduli scrivono
   "Si" con l'accento, e un consenso non deve dipendere da come e' scritto. */
const VERO_CONSENSO = /^(si|s|true|vero|1|x|yes|on)$/i;
function consenso(v) {
    if (v === true || v === false) return v;
    if (v == null) return null;
    const s = String(v).trim().normalize('NFD').replace(/\p{M}/gu, '');
    return s ? VERO_CONSENSO.test(s) : null;
}
/* Data di iscrizione in formato italiano, fuso di Roma (il server sta su UTC).
   Se il modulo non la manda ce la mette il server, perche' una scheda senza
   data fa due danni: l'identificativo del documento diventa lo stesso per ogni
   invio della stessa persona, e l'area riservata legge la data assente come
   "riga vecchissima", quindi l'attribuzione del consenso ai contatti gia'
   presenti coprirebbe anche un'iscrizione arrivata oggi. */
function adesso() {
    const f = new Intl.DateTimeFormat('it-IT', {
        timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
    const p = {};
    f.formatToParts(new Date()).forEach(x => { p[x.type] = x.value; });
    return p.day + '/' + p.month + '/' + p.year + ' ' + p.hour + ':' + p.minute + ':' + p.second;
}
// data italiana "gg/mm/aaaa hh:mm:ss": nell'ID le barre non sono ammesse
function idDocumento(email, data, nome, cognome) {
    const base = (email || (testo(nome, 60) + '.' + testo(cognome, 60)).toLowerCase()) + '|' + data;
    return base.replace(/[\/\\.#$\[\]]/g, '-').slice(0, 300) || 'senza-identificativo';
}


/* Segna che i dati sono cambiati, cosi la lettura sa che deve rileggere. */
async function segnaCambiamento(db) {
    try {
        await db.collection('meta').doc('iscrizioni')
            .set({ rev: admin.firestore.FieldValue.increment(1), quando: Date.now() }, { merge: true });
    } catch (e) { /* non e grave: la lettura ha comunque una scadenza a tempo */ }
}

/* ============================================================
   Completamento dei dati di un'iscrizione manuale
   ------------------------------------------------------------
   Un'iscrizione inserita a mano (Eventbrite, altre piattaforme) ha
   spesso i soli dati dell'intestatario e puo' coprire piu' posti.
   L'area riservata gli manda una mail con un collegamento personale:

     /completa_iscrizione/?d=<idDoc>&t=<firma>

   La firma e' un HMAC dell'identificativo del documento: il
   collegamento apre SOLO quella scheda, e a firma sbagliata si
   risponde sempre allo stesso modo, senza dire se la scheda esiste.

   - "completa-leggi": evento, posti, dati noti dell'intestatario e
     dei partecipanti gia' scritti, per precompilare il modulo;
   - "completa-salva": UN ELEMENTO PER POSTO (1..N, il primo e'
     l'intestatario). Ogni posto puo' portare i dati, essere lasciato
     vuoto (posto riservato ma senza nome) oppure essere ANNULLATO.
     Il primo aggiorna la scheda originale (mai l'email, che e'
     l'identita' della scheda); gli altri diventano schede proprie con
     documenti dal nome fisso (<idDoc>~p2, ~p3...), quindi rimandare
     il modulo sovrascrive invece di duplicare. I posti senza nome
     restano contati sulla scheda originale, gli annullati escono dal
     conteggio: il totale non puo' MAI crescere da questo modulo, e
     ogni scheda scritta porta la firma di chi ha compilato
     ("compilato"), che l'area riservata mostra in "Aggiornato da".
     A ogni salvataggio parte all'intestatario la mail di riepilogo
     con lo stesso collegamento per modificare o annullare ancora.
   ============================================================ */
const MSG_LINK = 'Collegamento non valido o scaduto. Scrivi a info@nextgenerationbusiness.it e provvediamo noi.';
const MAX_PART = 99;
function pulisciPartecipante(p) {
    return {
        nome: testo(p.nome, 120), cognome: testo(p.cognome, 120),
        email: testo(p.email, 200).toLowerCase(),
        azienda: testo(p.azienda, 200), ruolo: testo(p.ruolo, 200), telefono: testo(p.telefono, 60)
    };
}
function partecipanteVuoto(p) { return !p.nome && !p.cognome && !p.email && !p.azienda && !p.telefono; }

/* ============================================================
   Prenotazione degli incontri B2B (azioni "b2b-leggi" e "b2b-salva")
   ------------------------------------------------------------
   L'invito agli incontri B2B porta un collegamento personale (stessa
   firma della scheda) verso /incontri_b2b/: non e' un sondaggio di
   gradimento, e' una PRENOTAZIONE. Chi apre la pagina sceglie a quali
   incontri partecipare - un tavolo per argomento, gli stessi del
   convegno - e puo' raccontare in breve il progetto. Le scelte
   finiscono sulla SUA scheda negli stessi campi del modulo di Napoli
   ("interessi" e "incontro"), cosi' l'area riservata le mostra nelle
   colonne aggiuntive gia' esistenti e il riepilogo per argomento
   somma tutto, da qualunque strada arrivi; la nota libera va nella
   colonna "Nota B2B". Le etichette le decide il servizio: dal modulo
   arrivano solo gli indici.

   L'invito parte a TUTTI i referenti dell'azienda, quindi la pagina
   mostra anche le prenotazioni dei COLLEGHI della stessa impresa
   (stesso evento): senza, due persone della stessa azienda si
   prenoterebbero allo stesso tavolo senza saperlo, o lascerebbero
   scoperto un argomento credendo che ci pensi l'altro. Dei colleghi
   si mostrano nome, ruolo e tavoli scelti: la nota no, e' scritta a
   noi e resta di chi l'ha scritta.
   ============================================================ */
// i tavoli e i loro alias stanno in un modulo a parte: li usa anche
// presenze.js, che con l'invito riceve l'orario di ciascun tavolo
const { TEMI_B2B, ALIAS_B2B } = require('../lib/temi-b2b');
function normalizzaTema(s) {
    return String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
/* Dal campo "interessi" (etichette separate da virgola) agli INDICI dei nove
   temi, piu' le voci che non corrispondono a nessuno: quelle non si buttano
   (possono venire da una scrittura a mano) e al salvataggio si riportano. */
function indiciDaInteressi(grezzo) {
    const attuali = String(grezzo || '').split(',').map(s => s.trim()).filter(Boolean);
    const norme = TEMI_B2B.map(normalizzaTema);
    const indici = new Set();
    const nonMappate = [];
    attuali.forEach(v => {
        const n = normalizzaTema(v);
        const i = norme.indexOf(n);
        if (i >= 0) { indici.add(i); return; }
        if (ALIAS_B2B[n]) { ALIAS_B2B[n].forEach(k => indici.add(k)); return; }
        nonMappate.push(v);
    });
    return { indici: Array.from(indici).sort((a, b) => a - b), nonMappate: nonMappate };
}
/* --- PRENOTAZIONI e PREFERENZE sono due cose diverse ---
   `interessi` sono le preferenze dichiarate iscrivendosi dal form del sito:
   dicono cosa interessa all'impresa, non che qualcuno verra' a un tavolo.
   La PRENOTAZIONE e' la risposta a questo invito, e sta per conto suo in
   `b2bScelte` (etichette dei tavoli) con `b2bRisposta` a fare da data.
   Tenerle separate e' l'unico modo perche' il riepilogo per argomento
   dell'area riservata conti chi viene davvero, invece di sommarci dentro
   chi aveva solo spuntato una casella al momento dell'iscrizione.
   Vale SOLO `b2bScelte`: prima di questo invito nessun modulo di
   prenotazione era mai partito, quindi non c'e' niente da recuperare
   altrove e `interessi` non e' mai una prenotazione. */
function haPrenotato(scheda) {
    return !!(scheda && Array.isArray(scheda.b2bScelte) && scheda.b2bScelte.length);
}
function prenotatiDi(scheda) {
    if (!scheda || !Array.isArray(scheda.b2bScelte)) return [];
    return scheda.b2bScelte.map(x => String(x || '').trim()).filter(Boolean);
}
/* Gli orari dei tavoli scritti sulla scheda al momento dell'invito, per
   etichetta corta. Gli inviti partiti con la versione precedente portano invece
   `orario`, uno solo per tutti: si legge come "tutti i tavoli a quell'ora", che
   e' quello che quella mail diceva davvero. Cosi' chi era gia' stato invitato
   non si ritrova un foglio senza orari. */
function orariDiInvito(scheda) {
    const inv = (scheda && scheda.b2bInvito && typeof scheda.b2bInvito === 'object') ? scheda.b2bInvito : {};
    const perTavolo = (inv.orari && typeof inv.orari === 'object') ? inv.orari : null;
    if (perTavolo) {
        const fuori = {};
        TEMI_B2B.forEach(t => {
            const v = String(perTavolo[t] || '').trim();
            if (v) fuori[t] = v;
        });
        return fuori;
    }
    const unico = String(inv.orario || '').trim();
    if (!unico) return {};
    const fuori = {};
    TEMI_B2B.forEach(t => { fuori[t] = unico; });
    return fuori;
}
function indiciDaTemi(etichette) {
    return indiciDaInteressi((etichette || []).join(',')).indici;
}

/* --- riconoscere che due persone sono della STESSA azienda ---
   La ragione sociale la scrive ognuno a modo suo: "Alfa S.r.l.", "ALFA SRL",
   "Alfa spa", "Alfa". Un confronto alla lettera lascerebbe i colleghi
   invisibili gli uni agli altri, che e' il contrario di cio' che serve qui.
   Quindi due passaggi:
     1. la ragione sociale si riduce all'osso (minuscole, senza accenti, senza
        punteggiatura, senza la forma giuridica): "Alfa S.r.l." e "ALFA SPA"
        diventano tutte e due "alfa";
     2. nel dubbio decide il DOMINIO della mail: chi scrive da @alfa.it e' di
        Alfa anche se ha lasciato in bianco il campo azienda o l'ha scritta in
        un modo che non somiglia a nessun altro. I domini di posta pubblici
        (gmail, libero, aruba...) non dicono niente sull'azienda e non contano.
   Le due cose insieme fondono i gruppi a catena: "Alfa Srl" + "Alfa SPA" con
   lo stesso dominio sono una sola impresa. */
/* Le due regole - la ragione sociale ridotta all'osso e il dominio della
   mail - stanno in lib/chiavi-azienda.js, insieme alla chiave con cui
   l'azienda viaggia negli incontri B2B: erano gia' scritte due volte (qui e
   nell'area riservata), e una terza copia le avrebbe fatte divergere al primo
   ritocco. Qui si usano per mettere insieme i colleghi; li' per decidere di
   chi e' una prenotazione. */
const { chiaveAzienda, dominioMail } = require('../lib/chiavi-azienda');

/* Mette insieme le persone che risultano della stessa impresa, per nome
   ridotto all'osso o per dominio della mail (una catena di unioni: chi condivide
   l'uno o l'altro finisce nello stesso gruppo). Torna un vettore di radici,
   una per persona, e `-1` per chi non ha ne' azienda ne' dominio aziendale:
   quelli non sono un gruppo, sono singoli. */
function radiciAziende(persone) {
    const padre = persone.map((_, i) => i);
    const trova = i => { while (padre[i] !== i) { padre[i] = padre[padre[i]]; i = padre[i]; } return i; };
    const unisci = (a, b) => { a = trova(a); b = trova(b); if (a !== b) padre[b] = a; };
    const perNome = {}, perDominio = {};
    /* Chi e' stato SPOSTATO a mano da un'azienda a un'altra non si unisce piu'
       per dominio: la decisione di una persona batte l'indizio ricavato
       dall'indirizzo. Senza questa eccezione mario@alfa.it spostato in Beta
       tornerebbe fra i colleghi di Alfa, e lo spostamento non si vedrebbe.
       Stessa regola nell'area riservata (app.js, raggruppaPerAzienda). */
    const chiavi = persone.map(p => ({
        nome: chiaveAzienda(p.azienda),
        dominio: (p.aziendaSpostata || p.aziendaFissa) ? '' : dominioMail(p.email)
    }));
    const identificabile = chiavi.map(k => !!(k.nome || k.dominio));
    persone.forEach((p, i) => {
        if (!identificabile[i]) return;
        const n = chiavi[i].nome;
        if (n) { if (perNome[n] === undefined) perNome[n] = i; else unisci(perNome[n], i); }
        const d = chiavi[i].dominio;
        if (d) { if (perDominio[d] === undefined) perDominio[d] = i; else unisci(perDominio[d], i); }
    });
    return persone.map((p, i) => identificabile[i] ? trova(i) : -1);
}
/* Le schede di UN evento, tenute in memoria per qualche decina di secondi:
   la pagina delle prenotazioni le rilegge a ogni apertura e a ogni salvataggio
   di un collega, e senza questa memoria ogni visita costerebbe una lettura per
   ogni iscritto dell'evento. Chi salva la butta via subito (`scordaEvento`),
   altrimenti il collega che si prenota un attimo dopo non lo vedrebbe. */
const COLLEGHI_MS = 30 * 1000;
const _cacheEvento = {};

/* --- quando due schede sono dello STESSO evento ---
   Il campo `pagina` dice da dove arriva un'iscrizione, e non e' scritto uguale
   da tutti: il modulo del sito di Napoli scrive "Napoli 2 Ottobre 2026 -
   Manifestazione di interesse", quello di Roma "Roma 29 Aprile 2026 -
   Iscrizione", l'area riservata - quando un'iscrizione si aggiunge a mano -
   scrive solo "Napoli 2 Ottobre 2026", e dal foglio importato puo' arrivare
   altro ancora. L'elenco degli eventi nell'area riservata infatti non confronta
   la stringa intera: cerca la citta' dentro la pagina.
   Confrontare la stringa INTERA, come si faceva qui, spezzava lo stesso evento
   in tanti eventi quante sono le sue provenienze: due colleghi della stessa
   azienda, uno iscritto dal sito e uno aggiunto a mano, non si vedevano.
   L'evento e' quindi la parte PRIMA del trattino, ridotta all'osso. */
function chiaveEvento(pagina) {
    return String(pagina || '').split(/\s[-\u2013\u2014]\s/)[0]
        .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ').trim();
}
function scordaEvento(pagina) { delete _cacheEvento[chiaveEvento(pagina)]; }
/* Le schede di un evento. Si chiedono a Firestore per INTERVALLO sul campo
   pagina ("tutto quello che comincia per Napoli 2 Ottobre 2026"): una sola
   lettura mirata, che prende sia la forma nuda sia quelle con il seguito.
   Se dall'intervallo non esce nulla oltre alla scheda di chi sta guardando,
   vuol dire che le pagine di questo evento sono scritte in modi che
   l'intervallo non copre (maiuscole diverse, un'altra punteggiatura): allora,
   e solo allora, si rilegge tutto e si filtra a mano. Costa, ma capita di rado
   ed e' l'unico modo per non lasciare qualcuno da solo per un trattino. */
async function schedeDellEvento(db, pagina) {
    const k = chiaveEvento(pagina);
    if (!k) return [];
    const c = _cacheEvento[k];
    if (c && (Date.now() - c.quando) < COLLEGHI_MS) return c.righe;
    const base = String(pagina || '').split(/\s[-\u2013\u2014]\s/)[0].trim();
    const daSnap = snap => {
        const fuori = [];
        snap.forEach(d => {
            const r = Object.assign({ _doc: d.id }, d.data() || {});
            if (chiaveEvento(r.pagina) === k) fuori.push(r);
        });
        return fuori;
    };
    let righe = [];
    if (base) {
        righe = daSnap(await db.collection('iscrizioni')
            .where('pagina', '>=', base).where('pagina', '<=', base + '\uf8ff').get());
    }
    if (righe.length < 2) righe = daSnap(await db.collection('iscrizioni').get());
    _cacheEvento[k] = { quando: Date.now(), righe: righe };
    return righe;
}
/* Chi altro, della stessa azienda e per lo stesso evento, e con che cosa:
   i tavoli PRENOTATI (risposta a questo invito) e, a parte, le preferenze
   dichiarate iscrivendosi - sono due cose diverse e la pagina le distingue.
   Una voce per persona (i doppioni di indirizzo si fondono), niente email e
   niente nota: alla pagina servono nome, ruolo e tavoli. */
function prenotazioniColleghi(righe, scheda, idDoc) {
    const vive = righe.filter(r => !r.annullato);
    const io = vive.findIndex(r => r._doc === idDoc);
    if (io < 0) return [];
    const radici = radiciAziende(vive);
    if (radici[io] < 0) return [];   // ne' azienda scritta ne' dominio aziendale: nessun "noi"
    const visti = {};
    const fuori = [];
    vive.forEach((r, i) => {
        if (i === io || radici[i] !== radici[io]) return;
        const em = String(r.email || '').toLowerCase();
        if (em && visti[em]) return;
        if (em) visti[em] = true;
        fuori.push({
            nome: ((String(r.nome || '') + ' ' + String(r.cognome || '')).trim()) || 'Un collega',
            ruolo: String(r.ruolo || '').slice(0, 120),
            temi: indiciDaTemi(prenotatiDi(r)),
            preferenze: indiciDaInteressi(r.interessi).indici,
            prenotato: haPrenotato(r)
        });
    });
    fuori.sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
    return fuori.slice(0, 60);
}
async function interessiB2B(azione, body, res) {
    const idDoc = String(body.d || '').slice(0, 400);
    const token = String(body.t || '').trim();
    if (!idDoc || !token || !NL.firmaCompletaValida(idDoc, token)) {
        res.status(403).json({ ok: false, msg: MSG_LINK });
        return;
    }
    initAdmin(leggiServiceAccount());
    const db = admin.firestore();
    const rif = db.collection('iscrizioni').doc(idDoc);
    const snap = await rif.get();
    if (!snap.exists) { res.status(403).json({ ok: false, msg: MSG_LINK }); return; }
    const scheda = snap.data() || {};

    /* --- DUE MODI DI PRENOTARE, e a decidere e' l'INVITO ---
       Chi e' stato invitato con l'agenda nuova (un tavolo, un orario) prenota
       uno SLOT; chi ha ricevuto l'invito di prima, a caselle, continua a
       vedere i tavoli come li ha visti nella sua mail. E' la stessa pagina e
       lo stesso collegamento: cambiare le regole sotto i piedi di chi ha gia'
       una mail in casella vorrebbe dire dargli una pagina che non parla piu'
       della convocazione che ha ricevuto. */
    /* UNA LOGICA SOLA, DUE PORTE. Se questa scheda e' stata invitata come
       AZIENDA, anche il collegamento personale apre gli incontri
       dell'azienda: stessa lettura, stesso salvataggio, stessa unicita'.
       Senza questa riga i due collegamenti vivrebbero uno accanto all'altro -
       uno che prenota per la persona e uno per l'impresa - e la stessa
       azienda potrebbe ritrovarsi con due prime preferenze. */
    const azScheda = (scheda.b2bAzienda && typeof scheda.b2bAzienda === 'object') ? scheda.b2bAzienda : null;
    if (azScheda && azScheda.id && AGENDA.idEvento(azScheda.evento) === AGENDA.eventoInvito(scheda)) {
        const azioneAz = (azione === 'b2b-leggi') ? 'b2b-azienda-leggi'
            : ((azione === 'b2b-salva' || azione === 'b2b-slot-prenota') ? 'b2b-azienda-salva' : azione);
        await incontriAzienda(azioneAz, Object.assign({}, body, {
            a: String(azScheda.id), e: AGENDA.idEvento(azScheda.evento)
        }), res, { db: db, gia: true });
        return;
    }
    if (AGENDA.invitoASlot(scheda)) {
        await prenotazioneASlot(azione, body, res, { db: db, rif: rif, scheda: scheda, idDoc: idDoc });
        return;
    }
    if (azione === 'b2b-slot-prenota' || azione === 'b2b-slot-richiedi') {
        res.status(400).json({ ok: false, msg: 'Questo invito non prevede la scelta di un orario: ricarichi la pagina.' });
        return;
    }

    if (azione === 'b2b-leggi') {
        let colleghi = [];
        // i colleghi sono un di piu': se la lettura non riesce, la prenotazione
        // si fa lo stesso invece di fermarsi su un errore
        try {
            colleghi = prenotazioniColleghi(await schedeDellEvento(db, scheda.pagina), scheda, idDoc);
        } catch (e) { colleghi = []; }
        /* Le caselle segnate all'apertura: la PRENOTAZIONE se c'e' gia', se no
           le preferenze dichiarate iscrivendosi - li' sono un suggerimento da
           confermare, non una prenotazione, e la pagina lo dice. */
        const prenotati = indiciDaTemi(prenotatiDi(scheda));
        const preferenze = indiciDaInteressi(scheda.interessi).indici;
        /* Gli orari dei tavoli, nello stesso ordine dei temi: la pagina li
           mostra accanto a ogni incontro. Un tavolo senza orario non e' in
           programma a questo evento e la pagina non lo propone. */
        const invitoOrari = orariDiInvito(scheda);
        const orari = TEMI_B2B.map(t => String(invitoOrari[t] || '').trim());
        res.status(200).json({
            ok: true,
            pagina: String(scheda.pagina || ''),
            nome: ((String(scheda.nome || '') + ' ' + String(scheda.cognome || '')).trim()),
            azienda: String(scheda.azienda || ''),
            temi: TEMI_B2B,
            orari: orari,
            scelti: prenotati.length ? prenotati : preferenze,
            prenotato: haPrenotato(scheda),
            // le caselle vengono dalle preferenze e non da una prenotazione
            daPreferenze: !prenotati.length && preferenze.length > 0,
            nota: String((scheda.extra && scheda.extra['Nota B2B']) || ''),
            // chi altro dell'azienda ha gia' scelto, e cosa
            colleghi: colleghi
        });
        return;
    }

    // b2b-salva: indici dei tavoli scelti + nota libera. Dal modulo arrivano
    // solo gli INDICI, quindi qui non puo' entrare un'etichetta inventata.
    const indici = Array.isArray(body.temi) ? body.temi.map(n => parseInt(n, 10)).filter(n => n >= 0 && n < TEMI_B2B.length) : [];
    const scelti = TEMI_B2B.filter((t, i) => indici.indexOf(i) >= 0);
    const nota = testo(body.nota, 800);
    /* Almeno un tavolo: qui si prenota, e una prenotazione senza incontro non
       e' una prenotazione. La sola nota non basta piu' (prima si raccoglievano
       interessi, e bastava). */
    if (!scelti.length) {
        res.status(400).json({ ok: false, msg: 'Scelga almeno un incontro B2B a cui partecipare.' });
        return;
    }
    /* Non si prenota un tavolo che non e' in programma: la pagina non lo mostra
       nemmeno, ma la firma sul collegamento non e' un lasciapassare per scrivere
       quello che si vuole. Il controllo vale solo se all'invito erano stati dati
       degli orari, altrimenti sarebbero tutti fuori programma. */
    const orariInvito = orariDiInvito(scheda);
    const inProgramma = TEMI_B2B.filter(t => String(orariInvito[t] || '').trim());
    if (inProgramma.length) {
        const fuori = scelti.filter(t => inProgramma.indexOf(t) < 0);
        if (fuori.length) {
            res.status(400).json({ ok: false, msg: 'Uno degli incontri scelti non e in programma: ricarichi la pagina e riprovi.' });
            return;
        }
    }
    if (troppiSalvataggi(idDoc)) {
        res.status(429).json({ ok: false, msg: 'Ha cambiato la prenotazione molte volte di seguito: aspetti qualche minuto e riprovi. Vale l\'ultima scelta salvata.' });
        return;
    }
    const chi = ((String(scheda.nome || '') + ' ' + String(scheda.cognome || '')).trim()) || String(scheda.email || '');
    await rif.set({
        /* La prenotazione sta per conto suo: `interessi` resta com'e', perche'
           sono le preferenze dell'iscrizione e cancellarle vorrebbe dire
           perdere un'informazione che non si puo' piu' ricostruire. */
        b2bScelte: scelti,
        incontro: 'si',
        extra: { 'Nota B2B': nota },
        b2bRisposta: { quando: Date.now(), temi: scelti.length },
        compilato: { daNome: chi, quando: Date.now() }
    }, { merge: true });
    // il collega che apre la pagina un attimo dopo deve vedere questa scelta
    scordaEvento(scheda.pagina);
    await segnaCambiamento(db);
    /* La ricevuta: mail di conferma con in allegato il foglio da presentare al
       desk. Riparte a ogni modifica, perche' vale sempre l'ultimo foglio
       emesso. Se la posta non risponde la prenotazione resta comunque
       registrata - perderla per una mail non partita sarebbe il danno
       peggiore - e la pagina lo dice a chi ha appena prenotato. */
    let mailInviata = false;
    try { mailInviata = await confermaPrenotazione(idDoc, scheda, scelti); }
    catch (e) {
        console.error('Conferma prenotazione B2B non inviata:', String((e && e.message) || e).slice(0, 200));
    }
    res.status(200).json({ ok: true, temi: scelti.length, mailInviata: mailInviata });
}

/* ============================================================
   PRENOTAZIONE A SLOT (azioni "b2b-leggi", "b2b-slot-prenota",
   "b2b-slot-richiedi")
   ------------------------------------------------------------
   Chi riceve l'invito nuovo non sceglie piu' "a quali tavoli":
   sceglie QUANDO. La giornata del suo tavolo e' divisa in
   appuntamenti - dalle 10 alle 18, pausa pranzo esclusa - e lui ne
   prende UNO. Gli orari gia' presi li vede occupati, senza nomi:
   chi viene a un incontro non deve poter leggere l'agenda degli
   altri.

   Quando non resta piu' niente, la pagina non si limita a dire
   "esaurito": lascia CHIEDERE un incontro lo stesso. Non impegna
   nessuno slot (e lo dice), ma la richiesta arriva a chi ha
   mandato l'invito, che puo' aprire un orario chiuso o spostare
   qualcosa. Un ospite che ha ricevuto una convocazione e trova la
   porta chiusa, senza nemmeno un modo per bussare, e' il modo
   piu' rapido per perdere un cliente.
   ============================================================ */
async function prenotazioneASlot(azione, body, res, ctx) {
    const db = ctx.db, scheda = ctx.scheda, idDoc = ctx.idDoc;
    const evento = AGENDA.eventoInvito(scheda);
    const invitate = AGENDA.areeInvitate(scheda);

    if (azione === 'b2b-leggi') {
        const dati = await AGENDA.letturaOspite(db, scheda, idDoc);
        res.status(200).json(Object.assign({ ok: true }, dati, {
            pagina: String(scheda.pagina || ''),
            nome: ((String(scheda.nome || '') + ' ' + String(scheda.cognome || '')).trim()),
            azienda: String(scheda.azienda || '')
        }));
        return;
    }
    if (azione === 'b2b-salva') {
        // pagina vecchia rimasta aperta mentre l'invito e' diventato a slot
        res.status(409).json({ ok: false, msg: 'Il Suo invito ora prevede la scelta di un orario: ricarichi la pagina.' });
        return;
    }

    /* Il tavolo deve essere uno di quelli a cui e' stato invitato. La firma
       sul collegamento dice chi e', non gli da' il permesso di sedersi dove
       vuole: senza questo controllo, chi conosce il nome di un'area potrebbe
       prenotare al tavolo di un altro. */
    const area = String(body.area || '').trim().toLowerCase();
    if (invitate.indexOf(area) < 0) {
        res.status(400).json({ ok: false, msg: 'Quel tavolo non e fra quelli del Suo invito: ricarichi la pagina.' });
        return;
    }
    const nota = testo(body.nota, 800);
    const persona = {
        doc: idDoc, id: testo(scheda.idIscritto, 300),
        nome: ((String(scheda.nome || '') + ' ' + String(scheda.cognome || '')).trim()),
        azienda: String(scheda.azienda || ''), ruolo: String(scheda.ruolo || ''),
        email: String(scheda.email || ''), telefono: String(scheda.telefono || ''),
        nota: nota
    };

    if (azione === 'b2b-slot-richiedi') {
        /* Si chiede un incontro fuori orario SOLO quando davvero non c'e'
           piu' posto: se un orario libero c'e', va prenotato: una richiesta
           che si poteva evitare e' lavoro a mano per chi organizza. */
        const stato = await AGENDA.letturaOspite(db, scheda, idDoc);
        if (!stato.esaurito) {
            res.status(409).json({ ok: false, msg: 'C\'e ancora qualche orario libero: ricarichi la pagina e scelga il Suo.' });
            return;
        }
        if (troppiSalvataggi(idDoc)) {
            res.status(429).json({ ok: false, msg: 'Ha gia mandato la richiesta poco fa: la stiamo guardando, non serve rimandarla.' });
            return;
        }
        const r = await AGENDA.chiediFuoriSlot(db, { evento: evento, area: area, nota: nota, persona: persona });
        if (!r.ok) { res.status(500).json(r); return; }
        if (nota) {
            // la nota vale anche sulla scheda: e' quello che l'impresa vuole
            // discutere, e serve a chi la richiamera'
            try { await ctx.rif.set({ extra: { 'Nota B2B': nota } }, { merge: true }); } catch (_) { /* la richiesta e' registrata */ }
        }
        let avvisato = false;
        try {
            const agenda = await AGENDA.leggiAgenda(db, evento);
            avvisato = await AGENDA.avvisaRichiesta(scheda, agenda, area, nota);
        } catch (e) {
            console.error('Avviso richiesta B2B non partito:', String((e && e.message) || e).slice(0, 200));
        }
        res.status(200).json({ ok: true, avvisato: avvisato });
        return;
    }

    // b2b-slot-prenota: l'orario scelto. La presa dello slot e' una
    // transazione dentro l'agenda: se qualcuno e' arrivato un attimo prima,
    // di qui torna "occupato" e la pagina lo dice, con l'elenco aggiornato.
    if (troppiSalvataggi(idDoc)) {
        res.status(429).json({ ok: false, msg: 'Ha cambiato la prenotazione molte volte di seguito: aspetti qualche minuto e riprovi. Vale l\'ultimo orario salvato.' });
        return;
    }
    const preso = await AGENDA.prendiSlot(db, {
        evento: evento, area: area, ora: testo(body.ora, 5), chiave: testo(body.chiave, 8),
        persona: persona, da: persona.email
    });
    if (!preso.ok) { res.status(409).json(preso); return; }
    /* L'appuntamento si scrive anche sulla scheda: e' quello che l'area
       riservata mostra in elenco. Se questa scrittura non riuscisse, lo slot
       resterebbe comunque preso - ed e' l'ordine giusto: perdere il posto
       varrebbe molto piu' di una colonna non aggiornata. */
    try { await AGENDA.scriviAppuntamento(db, idDoc, Object.assign({ evento: evento }, preso), nota); }
    catch (e) { console.error('Appuntamento B2B non scritto sulla scheda:', String((e && e.message) || e).slice(0, 200)); }
    scordaEvento(scheda.pagina);
    await segnaCambiamento(db);
    /* La ricevuta: mail di conferma con in allegato il foglio da presentare
       al desk. Riparte a ogni cambio di orario, perche' vale sempre l'ultimo
       foglio emesso. Se la posta non risponde la prenotazione resta comunque
       registrata, e la pagina lo dice a chi ha appena prenotato. */
    let mailInviata = false;
    try {
        const agenda = await AGENDA.leggiAgenda(db, evento);
        mailInviata = await AGENDA.inviaConferma(scheda, idDoc, agenda, preso);
    } catch (e) {
        console.error('Conferma appuntamento B2B non inviata:', String((e && e.message) || e).slice(0, 200));
    }
    res.status(200).json(Object.assign({}, preso, { mailInviata: mailInviata }));
}

/* ============================================================
   GLI INCONTRI DI UN'AZIENDA (azioni "b2b-azienda-leggi" e
   "b2b-azienda-salva")
   ------------------------------------------------------------
   L'invito e' uno per impresa e il collegamento gira fra i suoi
   referenti: chi lo apre non prenota per se', prenota per
   l'azienda. Quindi il modulo viaggia INTERO - prima preferenza,
   seconda, terza, altre esigenze - e a ogni salvataggio si
   riscrive tutto quello che l'azienda ha detto.
   Due cose da tenere a mente leggendo queste righe:
     - la PRIMA preferenza e' una prenotazione vera, e passa dalla
       transazione degli slot come tutte le altre; la seconda e la
       terza no, sono una coda che lo staff lavorera';
     - fra due referenti che compilano insieme decide la
       REVISIONE: chi arriva con una revisione vecchia si sente
       dire che un collega ha appena cambiato le scelte, invece di
       cancellargliele senza accorgersene.
============================================================ */
async function incontriAzienda(azione, body, res, ctx) {
    const aziendaId = String(body.a || '').slice(0, 40);
    const evento = AGENDA.idEvento(String(body.e || '').slice(0, 120));
    const token = String(body.t || '').trim();
    // chi arriva dal collegamento personale ha gia' passato la sua firma
    const giaFirmato = !!(ctx && ctx.gia);
    if (!aziendaId || !evento || (!giaFirmato && (!token || !NL.firmaAziendaValida(evento, aziendaId, token)))) {
        res.status(403).json({ ok: false, msg: MSG_LINK });
        return;
    }
    initAdmin(leggiServiceAccount());
    const db = (ctx && ctx.db) || admin.firestore();
    const azienda = await AGENDA.leggiAzienda(db, evento, aziendaId);
    /* Azienda che non c'e', o invito revocato: si risponde la stessa cosa che
       si risponde a una firma sbagliata. Dire "questa azienda non esiste"
       vorrebbe dire lasciar sapere, a chi prova, quali esistono. */
    if (!azienda.esiste || (azienda.invito && azienda.invito.revocato)) {
        res.status(403).json({ ok: false, msg: MSG_LINK });
        return;
    }

    if (azione === 'b2b-azienda-leggi') {
        const dati = await AGENDA.letturaAzienda(db, evento, aziendaId);
        res.status(200).json(Object.assign({ ok: true }, dati));
        return;
    }

    /* ANNULLARE UN INCONTRO DALLA PAGINA DELL'AZIENDA.
       La seconda e la terza preferenza non scelgono l'ora: gliela diamo noi
       fra quelle rimaste, e puo' cadere quando quella persona non c'e'. Prima
       la pagina diceva "per spostarlo ci scriva": nel frattempo il posto
       restava impegnato per qualcuno che non sarebbe venuto, e l'unico modo
       di liberarlo era che qualcuno leggesse una mail e lo facesse a mano.
       Ora lo annulla l'azienda, e l'orario torna libero per un'altra impresa
       nello stesso istante.
       Quello che succede e' tutto qui: lo slot si libera (solo se e'
       davvero suo - il controllo sta dentro la transazione), la preferenza
       che l'aveva portato li' torna IN ATTESA - non sparisce: l'impresa
       quel tavolo lo vuole ancora, e con un altro orario ce lo mandiamo -
       e parte la mail con il foglio aggiornato a tutti i referenti, perche'
       un collega puo' avere in tasca il foglio di prima. */
    if (azione === 'b2b-azienda-annulla') {
        // annullare scrive, quindi passa dallo stesso freno del salvataggio
        if (troppiSalvataggi('az:' + aziendaId)) {
            res.status(429).json({
                ok: false, motivo: 'freno',
                msg: 'Le scelte sono state cambiate molte volte di seguito: aspetti qualche minuto e riprovi.'
            });
            return;
        }
        const area = (AGENDA.areaDa(body.area) || {}).id || '';
        const chiave = AGENDA.chiaveSlot(AGENDA.oraDaChiave(body.chiave || '')) || AGENDA.chiaveSlot(body.ora);
        if (!area || !chiave) {
            res.status(400).json({ ok: false, msg: 'Non ho capito quale incontro annullare: ricarichi la pagina.' });
            return;
        }
        const r = await AGENDA.liberaSlot(db, evento, '', azienda.nome, {
            area: area, chiave: chiave, aziendaId: aziendaId
        });
        if (!r.ok) {
            const dati = await AGENDA.letturaAzienda(db, evento, aziendaId);
            res.status(409).json(Object.assign({ ok: false, motivo: r.motivo || 'sparito' }, dati, { msg: r.msg }));
            return;
        }
        const liberata = r.chi || {};
        if (liberata.codaId) {
            try { await AGENDA.rilasciaCoda(db, evento, aziendaId, String(liberata.codaId), azienda.nome, 'attesa'); }
            catch (_) { /* lo slot e' libero: e' quello che conta */ }
        }
        /* L'incontro nato da un'ALTRA ESIGENZA - al desk Revilaw quasi sempre -
           si porta dietro la domanda, segnata "assegnata". Annullato l'orario
           e non riaperta la domanda, quella sparirebbe dal riepilogo di chi
           organizza pur essendo rimasta senza risposta: nessuno la
           rivedrebbe piu'. */
        if ((Number(liberata.scelta) || 1) === AGENDA.SCELTA_ESIGENZA) {
            try { await AGENDA.riapriEsigenzeAssegnate(db, evento, aziendaId); }
            catch (_) { /* lo slot e' libero: e' quello che conta */ }
        }
        try { await AGENDA.scriviProgrammaAzienda(db, evento, aziendaId); } catch (_) { /* la copia si rifara' */ }
        try { await segnaCambiamento(db); } catch (_) { /* la lettura scade comunque */ }
        let mail = { ok: false, a: [] };
        try { mail = await AGENDA.inviaConfermaAzienda(db, evento, aziendaId, 'disdetta'); }
        catch (e) { console.error('Disdetta B2B non comunicata:', String((e && e.message) || e).slice(0, 200)); }
        const dati = await AGENDA.letturaAzienda(db, evento, aziendaId);
        res.status(200).json(Object.assign({ ok: true }, dati, {
            annullato: { areaNome: r.areaNome, ora: r.ora },
            mailInviata: mail.ok === true, avvisati: mail.a || []
        }));
        return;
    }

    /* --- le azioni che SCRIVONO: salvataggio e annullamento --- */
    if (troppiSalvataggi('az:' + aziendaId)) {
        res.status(429).json({
            ok: false, motivo: 'freno',
            msg: 'Le scelte sono state cambiate molte volte di seguito: aspetti qualche minuto e riprovi. Vale sempre l\'ultimo salvataggio.'
        });
        return;
    }
    const rev = Number(body.rev);
    if (rev >= 0 && azienda.rev !== rev) {
        const dati = await AGENDA.letturaAzienda(db, evento, aziendaId);
        res.status(409).json(Object.assign({
            ok: false, motivo: 'collega',
            msg: 'Un Suo collega ha appena cambiato le scelte dell\'azienda: qui sotto ci sono quelle aggiornate, le riveda e risalvi.'
        }, dati));
        return;
    }

    /* TRE PREFERENZE, TRE TAVOLI DIVERSI.
       Lo stesso argomento indicato due volte non e' una scelta: e' la stessa
       cosa chiesta due volte, e quando poi la seconda viene assegnata
       l'impresa si ritrova due incontri allo stesso tavolo - con le stesse
       persone, sullo stesso tema - mentre quel posto manca a un'altra
       azienda. Si ferma qui, prima di scrivere, e si dice quale: il
       salvataggio e' un'operazione sola, e lasciarne passare meta' vorrebbe
       dire salvare una scelta che l'impresa non ha fatto.
       Il confronto e' per FAMIGLIA, cioe' per argomento: i due tavoli gemelli
       per chi sceglie sono lo stesso tavolo. */
    const famigliaDi = a => AGENDA.capofilaDi(String(a || '')) || String(a || '');
    const sceltiOra = [];
    const prAreaN = (body.prima && typeof body.prima === 'object') ? famigliaDi(body.prima.area) : '';
    if (prAreaN) sceltiOra.push({ pos: 1, area: prAreaN });
    (Array.isArray(body.coda) ? body.coda : []).forEach(c => {
        const a = famigliaDi((c || {}).area);
        if (a) sceltiOra.push({ pos: Number((c || {}).pos) === 3 ? 3 : 2, area: a });
    });
    const doppione = sceltiOra.filter((x, i) => sceltiOra.findIndex(y => y.area === x.area) !== i)[0] || null;
    if (doppione) {
        const nome = AGENDA.AREE_B2B.filter(a => a.id === doppione.area).map(a => a.nome)[0] || 'quel tavolo';
        res.status(400).json({
            ok: false, motivo: 'doppione',
            msg: '"' + nome + '" \u00e8 indicato due volte: le tre preferenze devono essere di tre tavoli diversi. '
                + 'Ne scelga un altro per la ' + (doppione.pos === 3 ? 'terza' : (doppione.pos === 2 ? 'seconda' : 'prima')) + ' preferenza.'
        });
        return;
    }

    /* LA PRIMA PREFERENZA. Il nominativo si sceglie fra i referenti
       dell'invito: e' la regola detta a chi organizza, ed e' anche cio' che
       permette al desk di riconoscere chi si presenta. */
    const pr = (body.prima && typeof body.prima === 'object') ? body.prima : null;
    const nostri = AGENDA.appuntamentiAzienda(await AGENDA.leggiPrenotazioni(db, evento), aziendaId);
    const primaOra = nostri.filter(x => (Number(x.dati.scelta) || 1) === 1)[0] || null;
    let esitoPrima = null;
    if (pr && pr.area) {
        const ref = AGENDA.referenteDi(azienda, pr.perDoc);
        if (!ref) {
            res.status(400).json({ ok: false, motivo: 'nominativo', msg: 'Indichi chi partecipa all\'incontro, scegliendolo fra i referenti dell\'invito.' });
            return;
        }
        esitoPrima = await AGENDA.prendiSlot(db, {
            evento: evento, area: pr.area, ora: testo(pr.ora, 5), chiave: testo(pr.chiave, 8),
            scelta: 1, da: ref.email || azienda.nome,
            persona: {
                doc: ref.doc, nome: ref.nome, email: ref.email, telefono: ref.telefono, ruolo: ref.ruolo,
                azienda: azienda.nome, aziendaId: aziendaId, aziendaNome: azienda.nome,
                perChi: ref.nome, perRuolo: ref.ruolo, perDoc: ref.doc,
                nota: testo(body.nota, 800)
            }
        });
    } else if (primaOra) {
        /* La prima preferenza tolta: l'orario si libera. Non e' un caso raro -
           e' l'impresa che ci ripensa - e lasciarlo occupato vorrebbe dire
           tenere fermo un posto che nessuno usera'. */
        esitoPrima = await AGENDA.liberaSlot(db, evento, '', azienda.nome, { area: primaOra.area, chiave: primaOra.chiave });
        if (esitoPrima.ok) esitoPrima.liberata = true;
    }

    /* LE ALTRE DUE PREFERENZE E LE ESIGENZE. Si salvano anche se la prima
       preferenza non e' andata a buon fine (l'orario preso un attimo prima da
       un'altra impresa): quello che l'azienda ha scritto non si butta via
       perche' un orario e' sfumato. */
    const salvate = await AGENDA.salvaPreferenze(db, evento, aziendaId, {
        rev: azienda.rev,
        coda: Array.isArray(body.coda) ? body.coda : [],
        esigenze: Array.isArray(body.esigenze) ? body.esigenze : [],
        da: testo(body.da, 200) || azienda.nome
    });

    try { await AGENDA.scriviProgrammaAzienda(db, evento, aziendaId); }
    catch (e) { console.error('Programma B2B non scritto:', String((e && e.message) || e).slice(0, 200)); }
    try { scordaEvento(String(azienda.nome || '')); } catch (_) { /* niente */ }
    try { await segnaCambiamento(db); } catch (_) { /* la lettura scade comunque */ }

    /* La ricevuta: una mail sola a tutti i referenti, con il foglio
       aggiornato. Se la posta non risponde le scelte restano comunque
       registrate, e la pagina lo dice. */
    let mail = { ok: false, a: [] };
    try { mail = await AGENDA.inviaConfermaAzienda(db, evento, aziendaId, 'prenotazione'); }
    catch (e) { console.error('Conferma B2B azienda non inviata:', String((e && e.message) || e).slice(0, 200)); }

    const dati = await AGENDA.letturaAzienda(db, evento, aziendaId);
    res.status(200).json(Object.assign({ ok: true }, dati, {
        prima: dati.prima,
        esitoPrima: esitoPrima ? {
            ok: esitoPrima.ok === true, motivo: esitoPrima.motivo || '', msg: esitoPrima.msg || '',
            liberata: esitoPrima.liberata === true
        } : null,
        bloccate: salvate.bloccate || [],
        salvate: salvate.ok === true,
        motivoSalvataggio: salvate.motivo || '',
        mailInviata: mail.ok === true,
        avvisati: mail.a || []
    }));
}

/* Mail di conferma della prenotazione, con il PDF in allegato. Data, orario e
   luogo degli incontri arrivano da `b2bInvito`, dove li ha scritti l'invito:
   il servizio non ha una tabella degli eventi, e chiederglielo di nuovo
   vorrebbe dire tenerne due che prima o poi divergono. */
async function confermaPrenotazione(idDoc, scheda, tavoli) {
    const a = String(scheda.email || '').toLowerCase();
    if (!a || !emailValida(a)) return false;
    const invito = (scheda.b2bInvito && typeof scheda.b2bInvito === 'object') ? scheda.b2bInvito : {};
    const evento = (invito.evento && typeof invito.evento === 'object') ? invito.evento : {};
    const orari = orariDiInvito(scheda);
    const nome = ((String(scheda.nome || '') + ' ' + String(scheda.cognome || '')).trim());
    const dati = {
        nome: nome, azienda: String(scheda.azienda || ''), ruolo: String(scheda.ruolo || ''),
        pagina: String(scheda.pagina || ''),
        evento: {
            titolo: String(evento.titolo || '') || MNGB.nomeEvento(scheda.pagina),
            quando: String(evento.quando || ''),
            luogo: String(evento.luogo || ''), indirizzo: String(evento.indirizzo || '')
        },
        // ogni tavolo con il SUO orario: sul foglio del desk e nella mail e'
        // l'unica cosa che dice all'ospite dove deve essere e quando
        tavoli: tavoli.map(t => ({ nome: t, orario: String(orari[t] || '').trim() }))
    };
    const link = NL.linkB2B(idDoc);
    const m = MNGB.confermaB2B(dati, link);
    const foglio = PDF.pdfPrenotazione(Object.assign({}, dati, { emessoIl: quandoInItalia() }));
    await trasporto().sendMail({
        from: mittenteMail(),
        to: a,
        subject: m.oggetto,
        text: m.testo,
        html: m.html,
        attachments: [{
            filename: nomeFileFoglio(nome),
            content: foglio,
            contentType: 'application/pdf'
        }]
    });
    return true;
}
/* La data di emissione stampata sul foglio e il nome del file allegato
   stanno in lib/agenda-b2b.js, che spedisce lo stesso foglio per gli
   appuntamenti a slot: due copie si sarebbero allontanate al primo
   ritocco, e chi riceve le due mail non deve accorgersi che le ha
   scritte codice diverso. */
const quandoInItalia = AGENDA.quandoInItalia;
const nomeFileFoglio = AGENDA.nomeFileFoglio;

async function completaIscrizione(azione, body, res) {
    const idDoc = String(body.d || '').slice(0, 400);
    const token = String(body.t || '').trim();
    if (!idDoc || !token || !NL.firmaCompletaValida(idDoc, token)) {
        res.status(403).json({ ok: false, msg: MSG_LINK });
        return;
    }

    initAdmin(leggiServiceAccount());
    const db = admin.firestore();
    const rif = db.collection('iscrizioni').doc(idDoc);
    const snap = await rif.get();
    // scheda sparita (cancellata dall'area riservata): stessa risposta del
    // collegamento sbagliato, per non dire niente a chi tira a indovinare
    if (!snap.exists) { res.status(403).json({ ok: false, msg: MSG_LINK }); return; }
    const scheda = snap.data() || {};
    // il totale dei posti dell'ordine NON cambia mai: alla prima ripartizione
    // si mette da parte, perche' "partecipanti" della scheda da li' in poi
    // conta solo intestatario e posti non ancora nominati
    const nOrdine = Math.min(MAX_PART, Math.max(1,
        parseInt(scheda.partecipantiOrdine, 10) || parseInt(scheda.partecipanti, 10) || 1));

    // stato attuale dei posti 2..N: serve al modulo per preriempire e al
    // riepilogo per non perdere cio' che era gia' stato scritto
    const figliRef = [];
    for (let i = 2; i <= nOrdine; i++) figliRef.push(db.collection('iscrizioni').doc(idDoc + '~p' + i));
    const figliSnap = figliRef.length ? await db.getAll(...figliRef) : [];
    const figliAttuali = figliSnap.map(s => (s.exists ? (s.data() || {}) : null));

    if (azione === 'completa-leggi') {
        res.status(200).json({
            ok: true,
            pagina: String(scheda.pagina || ''),
            partecipanti: nOrdine,
            completato: !!scheda.completato,
            capofila: {
                nome: String(scheda.nome || ''), cognome: String(scheda.cognome || ''),
                email: String(scheda.email || ''),
                azienda: String(scheda.azienda || ''), ruolo: String(scheda.ruolo || ''),
                telefono: String(scheda.telefono || ''),
                annullato: !!scheda.annullato
            },
            // un elemento per posto (2..N): dati gia' scritti, segnaposto di un
            // posto annullato, oppure null se il posto non ha ancora un nome
            altri: figliAttuali.map(f => f ? {
                nome: String(f.nome || ''), cognome: String(f.cognome || ''),
                email: String(f.email || ''), azienda: String(f.azienda || ''),
                ruolo: String(f.ruolo || ''), telefono: String(f.telefono || ''),
                annullato: !!f.annullato
            } : null)
        });
        return;
    }

    /* --- completa-salva: un elemento PER POSTO --- */
    const grezzi = Array.isArray(body.partecipanti) ? body.partecipanti.slice(0, nOrdine) : [];
    const posti = [];
    for (let i = 0; i < nOrdine; i++) {
        const g = grezzi[i] && typeof grezzi[i] === 'object' ? grezzi[i] : {};
        if (g.annulla === true) { posti.push({ annulla: true }); continue; }
        const p = pulisciPartecipante(g);
        posti.push(partecipanteVuoto(p) ? null : p);
    }
    if (!posti.some(p => p)) {
        res.status(400).json({ ok: false, msg: 'Compila i dati di almeno un partecipante, oppure segna i posti da annullare.' }); return;
    }
    for (const p of posti) {
        if (!p || p.annulla) continue;
        if (p.email && !NL.EMAIL_RE.test(p.email)) {
            res.status(400).json({ ok: false, msg: 'Uno degli indirizzi email non sembra valido: ' + p.email }); return;
        }
        if (!p.nome && !p.cognome && !p.email) {
            res.status(400).json({ ok: false, msg: 'Per ogni partecipante servono almeno nome e cognome, oppure l\'email.' }); return;
        }
    }

    const primo = posti[0];
    const posto1Annullato = !!(primo && primo.annulla);
    const senzaNomeAltri = posti.slice(1).filter(p => !p).length;
    const figliCompilati = posti.slice(1).filter(p => p && !p.annulla).length;
    const annullati = posti.filter(p => p && p.annulla).length;
    // chi firma queste modifiche: l'intestatario. La firma finisce su ogni
    // scheda scritta e l'area riservata la mostra come "Nome (dal modulo)".
    const intestatarioNome = (primo && !primo.annulla && (primo.nome || primo.cognome))
        ? (primo.nome + ' ' + primo.cognome).trim()
        : ((String(scheda.nome || '') + ' ' + String(scheda.cognome || '')).trim() || String(scheda.email || ''));
    const compilato = { daNome: intestatarioNome, quando: Date.now() };

    /* La scheda originale: i dati dell'intestatario (mai l'email, che e'
       l'identita' della scheda e l'indirizzo del collegamento) piu' i posti
       senza nome. Con l'intestatario annullato la scheda esce dal conteggio
       e dall'elenco; i posti senza nome, senza piu' una scheda che li porti,
       decadono con lei (i partecipanti gia' nominati restano). */
    const postiScheda = posto1Annullato ? 0 : 1 + senzaNomeAltri;
    const patch = {
        partecipanti: postiScheda,
        partecipantiOrdine: nOrdine,
        extra: { Partecipanti: String(postiScheda) },
        compilato: compilato,
        completato: { quando: Date.now(), partecipanti: figliCompilati + (posto1Annullato ? 0 : 1) }
    };
    if (primo && !primo.annulla) {
        patch.nome = primo.nome; patch.cognome = primo.cognome;
        patch.azienda = primo.azienda; patch.ruolo = primo.ruolo; patch.telefono = primo.telefono;
    }
    // annullare e' reversibile: ricompilando i propri dati la scheda si riattiva
    patch.annullato = posto1Annullato
        ? { quando: Date.now(), da: 'intestatario' }
        : admin.firestore.FieldValue.delete();
    await rif.set(patch, { merge: true });

    // i posti 2..N per POSIZIONE: documenti dal nome fisso, cosi' rimandare il
    // modulo sovrascrive invece di duplicare
    const etichettaPortale = (scheda.extra && scheda.extra.Portale) || scheda.portaleNome || '';
    const batch = db.batch();
    for (let i = 2; i <= nOrdine; i++) {
        const p = posti[i - 1];
        const refFiglio = db.collection('iscrizioni').doc(idDoc + '~p' + i);
        if (p && p.annulla) {
            // segnaposto NON conteggiato: riaprendo il modulo si vede che il
            // posto e' stato annullato, e l'elenco non lo mostra
            batch.set(refFiglio, {
                data: String(scheda.data || ''), pagina: String(scheda.pagina || ''),
                gruppo: idDoc, origine: 'partecipante',
                partecipanti: 0, extra: { Partecipanti: '0' },
                annullato: { quando: Date.now(), da: 'intestatario' },
                compilato: compilato
            }, { merge: true });
        } else if (p) {
            batch.set(refFiglio, {
                data: String(scheda.data || ''),
                pagina: String(scheda.pagina || ''),
                nome: p.nome, cognome: p.cognome, email: p.email,
                azienda: p.azienda, ruolo: p.ruolo, telefono: p.telefono,
                messaggio: '',
                portale: String(scheda.portale || ''),
                portaleNome: etichettaPortale,
                partecipanti: 1,
                extra: Object.assign({ Partecipanti: '1' }, etichettaPortale ? { Portale: etichettaPortale } : {}),
                origine: 'partecipante',
                gruppo: idDoc,
                compilato: compilato,
                annullato: admin.firestore.FieldValue.delete(),
                ricevuto: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        } else {
            // posto senza nome: nessuna scheda propria, resta contato sull'originale
            batch.delete(refFiglio);
        }
    }
    await batch.commit();
    await segnaCambiamento(db);

    /* Riepilogo e mail di conferma delle variazioni, con lo stesso collegamento
       per modificare o annullare ancora. Se l'invio fallisce le modifiche
       restano salvate: la mail e' una cortesia, non una condizione. */
    const attivi = [];
    if (!posto1Annullato) {
        attivi.push(primo && !primo.annulla
            ? { nome: primo.nome, cognome: primo.cognome, azienda: primo.azienda }
            : { nome: String(scheda.nome || ''), cognome: String(scheda.cognome || ''), azienda: String(scheda.azienda || '') });
    }
    posti.slice(1).forEach(p => { if (p && !p.annulla) attivi.push({ nome: p.nome, cognome: p.cognome, azienda: p.azienda }); });
    const postiAttivi = postiScheda + figliCompilati;
    let mailInviata = false;
    if (scheda.email && NL.EMAIL_RE.test(String(scheda.email))) {
        try {
            const m = MNGB.confermaVariazioni({
                pagina: scheda.pagina, intestatario: intestatarioNome,
                attivi: attivi, postiAttivi: postiAttivi,
                senzaNome: posto1Annullato ? 0 : senzaNomeAltri, annullati: annullati
            }, NL.linkCompleta(idDoc));
            const messaggio = {
                from: mittenteMail(), to: String(scheda.email),
                subject: m.oggetto, text: m.testo, html: m.html
            };
            // chi aveva chiesto i dati dall'area riservata riceve copia nascosta:
            // sa cosi' che sono arrivati, senza dover controllare l'elenco
            const daStaff = scheda.datiRichiesti && String(scheda.datiRichiesti.da || '');
            if (daStaff && daStaff !== String(scheda.email)) messaggio.bcc = daStaff;
            await trasporto().sendMail(messaggio);
            mailInviata = true;
        } catch (e) {
            console.error('Conferma variazioni non inviata:', String((e && e.message) || e).slice(0, 200));
        }
    }

    res.status(200).json({ ok: true, postiAttivi: postiAttivi, annullati: annullati, mail: mailInviata });
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false }); return; }

    try {
        const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
        /* Il limite per indirizzo IP vale per i moduli APERTI del sito, dove
           chiunque puo' scrivere. Le pagine che si aprono solo dal collegamento
           firmato ne restano fuori: i referenti di un'azienda escono tutti dallo
           stesso IP dell'ufficio, e otto richieste in dieci minuti se le
           mangerebbero in due persone, bloccando proprio chi ha il diritto di
           cambiare idea. Li' il freno e' un altro, per singola scheda. */
        const conFirma = ['completa-leggi', 'completa-salva', 'b2b-leggi', 'b2b-salva',
            'b2b-slot-prenota', 'b2b-slot-richiedi',
            // il collegamento d'azienda ce l'hanno in piu' persone dello stesso
            // ufficio: a maggior ragione qui il freno per indirizzo IP se lo
            // mangerebbero fra loro
            'b2b-azienda-leggi', 'b2b-azienda-salva', 'b2b-azienda-annulla']
            .indexOf(String(body.azione || '')) >= 0;
        /* "cena-leggi" non scrive niente e non spedisce niente: e' la scheda
           della serata (data, termine, quanti ospiti si possono portare) che
           la pagina chiede appena si apre. Farla pesare sul freno vorrebbe
           dire che tre persone dello stesso studio, aprendo e richiudendo la
           pagina, si mangiano gli invii veri di tutti gli altri. */
        const soloLettura = String(body.azione || '') === 'cena-leggi';
        if (!conFirma && !soloLettura && troppiInvii(ip)) { res.status(429).json({ ok: false, msg: 'Troppi invii ravvicinati.' }); return; }

        // completamento dei dati (dal collegamento personale nella mail): altra
        // azione, stessa funzione. I form del sito non mandano "azione", quindi
        // per loro non cambia niente.
        const azione = String(body.azione || '');
        if (azione === 'completa-leggi' || azione === 'completa-salva') {
            await completaIscrizione(azione, body, res);
            return;
        }
        if (azione === 'b2b-leggi' || azione === 'b2b-salva'
            || azione === 'b2b-slot-prenota' || azione === 'b2b-slot-richiedi') {
            await interessiB2B(azione, body, res);
            return;
        }
        // il collegamento d'azienda: stessa pagina, altra porta
        if (azione === 'b2b-azienda-leggi' || azione === 'b2b-azienda-salva'
            || azione === 'b2b-azienda-annulla') {
            await incontriAzienda(azione, body, res);
            return;
        }
        /* Il modulo chiede se un codice e' buono PRIMA di spedire, cosi' chi
           lo ha trascritto male se ne accorge subito invece di scoprirlo il
           giorno dell'evento. Si risponde il minimo: se esiste e a che nome.
           E' un endpoint aperto, quindi ogni campo in piu' sarebbe un campo
           leggibile da chiunque provi codici a caso; il freno per indirizzo IP
           qui sopra vale anche per questa azione, ed e' cio' che rende il
           tentativo a tappeto impraticabile. */
        if (azione === 'verifica-codice') {
            const cred0 = leggiServiceAccount();
            initAdmin(cred0);
            const v = await CODICI.verifica(admin.firestore(), body.codice, testo(body.evento, 80), testo(body.pagina, 200));
            if (!v.ok) { res.status(200).json({ ok: false, motivo: v.motivo }); return; }
            res.status(200).json({ ok: true, codice: v.codice, azienda: v.ragioneSociale });
            return;
        }
        /* La richiesta di contatto del modulo di sponsorizzazione. Il freno
           per indirizzo IP qui sopra vale anche per questa azione: e' un
           modulo aperto, e senza sarebbe un modo comodo per far partire mail
           a raffica verso i nostri stessi indirizzi. */
        if (azione === 'richiesta-contatto') {
            const cred1 = leggiServiceAccount();
            initAdmin(cred1);
            const r = await CONTATTI.ricevi(admin.firestore(), body);
            res.status(r.stato).json(r.corpo);
            return;
        }
        /* Le due cene del convegno di Napoli. La pagina chiede prima la
           scheda della serata (cena-leggi) e poi manda la conferma
           (cena-conferma). Le date e il termine li tiene il servizio, non la
           pagina: un modulo chiuso non si riapre cambiando una riga nel
           browser. */
        if (azione === 'cena-leggi') {
            const c = CENE.perLaPagina(CENE.definizione(body.cena));
            if (!c) { res.status(404).json({ ok: false, msg: 'Cena non riconosciuta.' }); return; }
            res.status(200).json({ ok: true, cena: c, adesso: Date.now() });
            return;
        }
        if (azione === 'cena-conferma') {
            const cred2 = leggiServiceAccount();
            initAdmin(cred2);
            const r = await CENE.ricevi(admin.firestore(), body);
            res.status(r.stato).json(r.corpo);
            return;
        }
        const email = testo(body.email, 200).toLowerCase();
        const nome = testo(body.nome, 120);
        const cognome = testo(body.cognome, 120);
        const pagina = testo(body.pagina, 200);
        // servono almeno un recapito e l'indicazione dell'evento
        if (!pagina) { res.status(400).json({ ok: false, msg: 'Evento non indicato.' }); return; }
        if (!email && !nome && !cognome) { res.status(400).json({ ok: false, msg: 'Dati insufficienti.' }); return; }
        if (email && !emailValida(email)) { res.status(400).json({ ok: false, msg: 'Indirizzo email non valido.' }); return; }

        const cred = leggiServiceAccount();
        initAdmin(cred);

        /* Il codice e' FACOLTATIVO: la pagina resta aperta a tutti e chi
           arriva dal sito non ne ha uno. Ma se c'e' dev'essere buono, perche'
           un codice inventato che passasse renderebbe "azienda selezionata"
           un'etichetta senza significato. Sbagliato si rifiuta subito, con un
           messaggio che dice cosa fare invece di un no secco. */
        let invito = null;
        const codiceScritto = String(body.codiceInvito || body.codice || '').trim();
        if (codiceScritto) {
            const v = await CODICI.verifica(admin.firestore(), codiceScritto, '', pagina);
            if (!v.ok) {
                res.status(400).json({
                    ok: false, codiceKo: true,
                    msg: 'Il codice indicato non risulta fra quelli inviati. Controlla di averlo copiato per intero dal messaggio che hai ricevuto, oppure lascia il campo vuoto e registrati senza.'
                });
                return;
            }
            invito = v;
        }

        const data = testo(body.data, 40) || adesso();
        const scheda = {
            data: data,
            pagina: pagina,
            nome: nome,
            cognome: cognome,
            email: email,
            azienda: testo(body.azienda, 200),
            ruolo: testo(body.ruolo, 200),
            telefono: testo(body.telefono, 60),
            messaggio: testo(body.messaggio, 2000),
            privacy: consenso(body.privacy),
            marketing: consenso(body.marketing),
            ricevuto: admin.firestore.FieldValue.serverTimestamp()
        };

        /* Il ponte fra le due tabelle. Si scrive sulla scheda dell'iscritto, e
           non solo sul codice, perche' l'elenco degli iscritti si legge da
           solo: chi lo guarda deve vedere "azienda selezionata" senza che
           l'area riservata debba andare a interrogare un'altra collezione per
           ognuna delle righe. La ragione sociale e' quella dell'INVITO, non
           quella digitata nel modulo: e' l'unica che combacia con l'elenco
           delle aziende, ed e' tutto il punto di avere un codice. */
        if (invito) {
            scheda.invitoCodice = invito.codice;
            scheda.invitoAzienda = invito.ragioneSociale;
            scheda.invitoScheda = invito.scheda;
            scheda.selezionata = true;
        }

        /* Campi per il business matching, oggi mandati solo dal modulo di
           Napoli. Vengono aggiunti SOLO se arrivano davvero: tutti gli altri
           moduli del dominio postano qui lo stesso oggetto senza questi campi,
           e riempire ogni iscrizione di ogni altro evento con cinque stringhe
           vuote sarebbe rumore che poi qualcuno deve interpretare. Chi legge
           trova il campo quando c'e' e non lo trova quando non c'e'. */
        const CAMPI_MATCHING = { profilo: 40, settore: 40, dimensione: 40, incontro: 20, interessi: 400 };
        for (const campo of Object.keys(CAMPI_MATCHING)) {
            const valore = testo(body[campo], CAMPI_MATCHING[campo]);
            if (valore) scheda[campo] = valore;
        }

        /* Modalita' di partecipazione, quando il modulo la chiede: "presenza"
           oppure "online", e SOLO queste due. La terza sezione dell'elenco -
           gli aderenti Revilaw - non si dichiara da se': la decide chi
           organizza, dall'area riservata, e un "modalita": "aderenti" spedito
           a questo endpoint pubblico viene ignorato come qualsiasi altro
           valore inventato.
           Si scrive SOLO se arriva: l'assenza del campo vale in presenza,
           com'erano tutte le iscrizioni fino a Napoli, e un campo vuoto su ogni
           iscrizione di ogni altro modulo del sito sarebbe rumore. */
        const modalita = testo(body.modalita, 20).toLowerCase();
        if (modalita === 'presenza' || modalita === 'online') scheda.modalita = modalita;

        /* "Sono un aderente Revilaw", spuntato nel modulo: la persona finisce
           DIRETTAMENTE nella sezione degli aderenti, senza passare da una
           conferma. Chi organizza non deve rifare a mano una classificazione
           che l'interessato ha gia' fatto, e la sezione si legge giusta dal
           primo minuto: i posti in sala si contano da soli.
           Restano due cose a fare da freno, e bastano:
             - la casella e' l'UNICA strada. Un `modalita: "aderenti"` spedito a
               mano a questo endpoint continua a essere ignorato (vedi sopra):
               la sezione non si sceglie scrivendo un campo qualsiasi;
             - la dichiarazione resta scritta (`aderente`), distinta dalla
               sezione: nell'elenco si vede che e' stata l'iscrizione a metterlo
               li', e chi organizza puo' spostarlo altrove in un clic - la sua
               scelta, che vive fra le presenze, vince comunque su questa.
           Si scrive solo quando e' vera: il campo assente vale "no", e mettere
           un false su ogni iscrizione di ogni altro modulo sarebbe rumore. */
        if (body.aderente === true || /^(si|s|true|vero|1|on)$/i.test(String(body.aderente || '').trim())) {
            scheda.aderente = true;
            scheda.modalita = 'aderenti';
        }

        /* Lista d'attesa per un posto in sala. Ha senso in un caso solo: la
           sala e' al completo, il modulo iscrive per la diretta e chi si
           iscrive resta in coda se un posto si libera. Percio' si scrive solo
           accanto a "online" - a un evento che si segue solo da remoto non c'e'
           nessuna coda, e accanto a "presenza" o "aderenti" un posto ce l'hai
           gia'.
           Sta sulla scheda e non solo nella mail perche' quando il posto si
           libera bisogna sapere CHI chiamare: l'elenco deve poterlo dire da
           solo, senza che qualcuno vada a ricostruire chi si e' iscritto dopo
           il tutto esaurito. */
        if (scheda.modalita === 'online' && consenso(body.listaAttesa) === true) {
            scheda.listaAttesa = true;
        }

        const idDoc = idDocumento(email, data, nome, cognome);
        await admin.firestore().collection('iscrizioni')
            .doc(idDoc)
            .set(scheda, { merge: true });
        await segnaCambiamento(admin.firestore());

        /* Il ritorno verso l'elenco delle aziende: la scheda dell'azienda
           passa a "iscritta" e si tiene chi si e' registrato. Se qualcosa qui
           non riesce l'iscrizione resta valida: e' informazione di servizio,
           non una condizione. Il codice NON si consuma - un'azienda invitata
           puo' mandare due persone, e la seconda non va respinta. */
        if (invito) {
            await CODICI.segnaUso(admin.firestore(), invito.codice, { email: email, iscrizione: idDoc });
            if (invito.scheda) {
                try {
                    await admin.firestore().collection('aziendeInvito').doc(invito.scheda).set({
                        stato: 'iscritta',
                        iscritti: admin.firestore.FieldValue.arrayUnion({
                            quando: Date.now(),
                            nome: (nome + ' ' + cognome).trim().slice(0, 200),
                            email: email,
                            iscrizione: idDoc
                        })
                    }, { merge: true });
                } catch (e) {
                    console.error('Azienda invitata non aggiornata:', String((e && e.message) || e).slice(0, 200));
                }
            }
        }

        /* Conferma automatica a chi si iscrive dai moduli degli EVENTI, con il
           collegamento personale per modificare o annullare l'iscrizione: la
           stessa possibilita' che ha chi viene inserito a mano. Se l'invio
           fallisce l'iscrizione resta valida e il visitatore non se ne
           accorge: la registrazione e' il lavoro, la mail la cortesia. */
        if (email && RE_PAGINA_EVENTO.test(pagina)) {
            try {
                const m = MNGB.confermaSito(
                    {
                        nome: nome, cognome: cognome, email: email, azienda: scheda.azienda,
                        pagina: pagina, data: data, modalita: scheda.modalita || '',
                        listaAttesa: scheda.listaAttesa === true
                    },
                    NL.linkCompleta(idDoc));
                await trasporto().sendMail({
                    from: mittenteMail(), to: email,
                    subject: m.oggetto, text: m.testo, html: m.html
                });
            } catch (e) {
                console.error('Conferma iscrizione dal sito non inviata:', String((e && e.message) || e).slice(0, 200));
            }
        }

        res.status(200).json({ ok: true });
    } catch (e) {
        // il visitatore non deve vedere dettagli tecnici: restano nei log
        console.error('Iscrizione non registrata:', String((e && e.message) || e).slice(0, 200));
        res.status(500).json({ ok: false });
    }
};
