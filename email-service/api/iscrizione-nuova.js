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
// i nove argomenti e i loro alias stanno in un modulo a parte: li usa anche
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
const DOMINI_PUBBLICI = [
    'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.it', 'outlook.com', 'outlook.it',
    'live.it', 'live.com', 'msn.com', 'yahoo.it', 'yahoo.com', 'libero.it', 'virgilio.it',
    'alice.it', 'tin.it', 'tiscali.it', 'inwind.it', 'iol.it', 'email.it', 'fastwebnet.it',
    'icloud.com', 'me.com', 'mac.com', 'aruba.it', 'pec.it', 'legalmail.it', 'poste.it',
    'protonmail.com', 'proton.me', 'gmx.com', 'katamail.com', 'supereva.it', 'teletu.it',
    'vodafone.it', 'wind.it', 'tim.it', 'windtre.it', 'blu.it'
];
/* Le forme giuridiche: si tolgono dal confronto perche' la stessa impresa
   compare ora con la sigla, ora senza, ora con i punti. Restano fuori le
   parole che potrebbero essere il nome vero ("studio", "impresa", "gruppo"):
   toglierle farebbe di "Studio Rossi" e "Studio Bianchi" la stessa cosa. */
const FORME_GIURIDICHE = /\b(s\s*r\s*l\s*s?|s\s*p\s*a|s\s*a\s*p\s*a|s\s*a\s*s|s\s*n\s*c|s\s*c\s*a\s*r\s*l|s\s*s|societa|soc|cooperativa|coop|sarl|ltd|limited|llc|inc|gmbh|plc)\b/g;
function chiaveAzienda(s) {
    let t = String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    t = t.replace(/&/g, ' e ');
    // i punti e gli apostrofi spariscono senza lasciare spazio: "s.r.l." -> "srl"
    t = t.replace(/[.'\u2019"]/g, '');
    t = t.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
    const senzaForma = t.replace(FORME_GIURIDICHE, ' ').replace(/\s+/g, ' ').trim();
    // se dell'azienda resta solo la forma giuridica, meglio la stringa intera
    return senzaForma || t;
}
function dominioMail(email) {
    const m = String(email || '').toLowerCase().trim().match(/@([a-z0-9.\-]+)$/);
    if (!m) return '';
    let d = m[1];
    if (DOMINI_PUBBLICI.indexOf(d) >= 0) return '';
    /* Le caselle di posta certificata dell'azienda portano lo stesso nome
       (pec.alfa.it e alfa.it sono la stessa impresa). Il prefisso si toglie
       solo se quel che resta e' ancora un dominio: da "pec.it" resterebbe
       "it", e allora mezzo mondo diventerebbe un'azienda sola. */
    const senzaPrefisso = d.replace(/^(pec|mail|posta)\./, '');
    if (senzaPrefisso !== d && senzaPrefisso.indexOf('.') > 0) d = senzaPrefisso;
    return DOMINI_PUBBLICI.indexOf(d) >= 0 ? '' : d;
}
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
/* Data e ora in Italia, per il "emessa il" stampato sul foglio: e' l'unico
   modo per capire quale di due fogli e' il piu' recente. */
function quandoInItalia() {
    try {
        return new Date().toLocaleString('it-IT', {
            timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        }).replace(',', ' alle');
    } catch (e) { return new Date().toISOString().slice(0, 16).replace('T', ' '); }
}
// il nome del file lo legge chi lo salva sul telefono: niente accenti ne' spazi
function nomeFileFoglio(nome) {
    const pulito = PDF.inLatin1(nome).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    return 'Incontri-B2B-prenotazione' + (pulito ? '-' + pulito : '') + '.pdf';
}

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
        const conFirma = ['completa-leggi', 'completa-salva', 'b2b-leggi', 'b2b-salva']
            .indexOf(String(body.azione || '')) >= 0;
        if (!conFirma && troppiInvii(ip)) { res.status(429).json({ ok: false, msg: 'Troppi invii ravvicinati.' }); return; }

        // completamento dei dati (dal collegamento personale nella mail): altra
        // azione, stessa funzione. I form del sito non mandano "azione", quindi
        // per loro non cambia niente.
        const azione = String(body.azione || '');
        if (azione === 'completa-leggi' || azione === 'completa-salva') {
            await completaIscrizione(azione, body, res);
            return;
        }
        if (azione === 'b2b-leggi' || azione === 'b2b-salva') {
            await interessiB2B(azione, body, res);
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
                    { nome: nome, cognome: cognome, email: email, azienda: scheda.azienda, pagina: pagina, data: data },
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
