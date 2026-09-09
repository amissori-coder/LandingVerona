/* ============================================================
   Aziende da invitare a un evento, e invio dell'invito
   ------------------------------------------------------------
   Sono aziende che NON si sono iscritte: e' un elenco di
   marketing, tenuto separato dalle iscrizioni (collezione
   "aziendeInvito", una scheda per azienda per evento). Si carica
   da un file CSV nella sezione Eventi dell'area riservata.

   PERCHE' QUESTO NON E' UN ENDPOINT A SE'. Il piano Hobby di
   Vercel ammetteva 12 funzioni serverless per rilascio, e in api/
   ce n'erano gia' 12: la tredicesima faceva fallire la
   distribuzione con "No more than 12 Serverless Functions can be
   added to a Deployment on the Hobby plan". Quindi la logica vive
   qui in lib/, che non conta come funzione, e api/presenze.js le
   passa le richieste che portano sezione: 'aziende'. Sul piano Pro
   quel tetto non c'e' piu' e questa e' tornata una scelta: si puo'
   riportare fuori, lasciando per un po' anche la deviazione, perche'
   l'indirizzo lo tiene in mano l'area riservata. E' la stessa
   strada che il repository usa gia' per il giro della newsletter,
   che bussa a un endpoint esistente invece di averne uno suo.

   Di conseguenza qui NON ci sono: intestazioni CORS, avvio
   dell'Admin SDK, verifica dell'ID token, controllo del permesso
   sugli Eventi. Li ha gia' fatti presenze.js, e i suoi esiti
   arrivano dentro il contesto.

   Due canali, si sceglie al momento dell'invio (lib/canali-invito.js):
     - EMAIL ORDINARIA da Brevo: quello normale per un invito.
       Nessuna configurazione nuova, e ogni mail porta il
       collegamento di disiscrizione;
     - PEC dalla casella del gestore: per l'invito formale. Se le
       credenziali PEC non ci sono, quel canale resta spento e il
       servizio lo dice, invece di spedire posta ordinaria facendola
       passare per certificata.

   L'invio va a lotti perche' la funzione ha 60 secondi: l'area
   riservata richiama il servizio finche' l'elenco non e' finito, e
   ogni scheda porta con se' il proprio esito, cosi' una ripresa non
   rispedisce a chi ha gia' ricevuto.

   E CHI NON PUO' TENERE APERTA UNA FINESTRA PER OTTO ORE. Su un
   elenco da migliaia di aziende l'invio a mano non basta: si
   PROGRAMMA, e a mandarlo avanti e' il servizio, da solo, a ritmo
   (250 PEC ogni novanta minuti, 1.000 email ogni ora). Le azioni che
   lo mettono in piedi stanno qui in fondo; il lavoro vero e' in
   lib/giro-inviti.js, che gira ogni dieci minuti da
   api/invii-programmati.js. A spedire, in tutti e due i casi, e' lo
   stesso motore (lib/invio-inviti.js).

   Azioni, tutte con sezione: 'aziende':
     elenco, importa, aggiungi, modifica, cancella, segna, invia,
     configurazione, stato-lettore, ricevute, non-riconosciute,
     messaggi, leggi-messaggio,
     programmazione, programma, programma-lotto, programma-avvia,
     programma-sospendi, programma-riprendi, programma-annulla.
   ============================================================ */

const admin = require('firebase-admin');
const CANALI = require('./canali-invito');
const NL = require('./newsletter');
const LETTORE = require('./lettore-pec');
const CAMPAGNE = require('./campagne-invito');
const ESITI = require('./esiti-email');
const CONTATTI = require('./richieste-contatto');
/* Il motore che spedisce davvero, uno per scheda. Sta fuori perche' lo
   usa anche il lavoro automatico degli invii programmati: due copie
   dello stesso ciclo si sarebbero scollate al primo ritocco, e su un
   invio a freddo a migliaia di aziende quel genere di divergenza non si
   scopre - si paga. */
const MOTORE = require('./invio-inviti');
const PROG = require('./programmazione-inviti');
const RITMI = require('./ritmi-invito');

function testo(v, max) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 200);
}
function chiave(s) {
    return String(s == null ? '' : s).trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function indirizzoValido(e) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || ''));
}
/* Identificativo della scheda: evento + recapito principale (la PEC se c'e',
   altrimenti la mail ordinaria). Cosi' ricaricare lo stesso elenco NON crea
   doppioni e non azzera gli invii gia' fatti. */
function chiaveContatto(a) {
    return String((a && a.pec) || (a && a.email) || '').toLowerCase();
}
/* L'identificativo della scheda. Sulla campagna predefinita resta quello
   di sempre, senza suffisso: cambiarlo avrebbe reso irraggiungibili tutti
   gli inviti gia' spediti, con le loro ricevute e i loro codici. Le
   campagne nuove aggiungono il proprio, cosi' la stessa azienda puo'
   stare in due liste con due schede e due esiti separati. */
function idDoc(evento, contatto, campagna) {
    return (evento + '~' + String(contatto || '').toLowerCase() + CAMPAGNE.suffissoId(campagna))
        .replace(/[\/\\.#$\[\]]/g, '-').slice(0, 400);
}

const STATI = ['da-invitare', 'inviata', 'errore', 'esclusa', 'disiscritta', 'risposta', 'iscritta'];
const MAX_AZIENDE_EVENTO = 50000;
/* Quante schede per pagina quando si legge l'elenco. Il tetto e' alto, e
   50.000 schede non stanno ne' in una risposta sola (il corpo ha un tetto
   di pochi megabyte: oltre, la funzione risponde errore invece
   dell'elenco) ne' comodamente nei 60 secondi della funzione. Quindi
   l'elenco si legge a pagine e chi lo mostra le rimette insieme. */
const PAGINA_ELENCO = 1500;
/* Un'area riservata vecchia rimasta in cache non sa chiedere le pagine:
   le si risponde come prima, un blocco solo, invece di lasciarle un
   elenco tagliato senza dirlo. */
const PAGINA_INTERA = 5000;
/* Le letture di servizio (gli esiti delle email) non tornano le schede a
   chi guarda: leggono pochi campi e contano. Li' la pagina puo' essere
   larga, perche' non deve entrare in una risposta. */
const PAGINA_SERVIZIO = 5000;

/* Una pagina di schede dell'evento, in ordine di identificativo: e' l'unico
   ordine che regge un segnalibro senza un indice nuovo, e le schede scritte
   prima delle campagne non hanno campi su cui ordinare. In ordine alfabetico
   ci va chi disegna la tabella, che ha in mano tutte le pagine. */
function paginaEvento(db, evento, dopo, quante, campi) {
    let q = db.collection('aziendeInvito').where('evento', '==', evento);
    if (campi && q.select) q = q.select.apply(q, campi);
    q = q.orderBy(admin.firestore.FieldPath.documentId()).limit(quante);
    if (dopo) q = q.startAfter(db.collection('aziendeInvito').doc(dopo));
    return q.get();
}

/* Equity o founding partner: stessa regola di api/presenze.js (conta il RUOLO
   DI ACCESSO, non la spunta in anagrafica). In caso di dubbio si risponde no. */
const RE_PARTNER = /equity|found/i;
async function ePartner(db, ruolo) {
    if (!ruolo) return false;
    if (RE_PARTNER.test(ruolo)) return true;
    try {
        const rd = await db.collection('archivio').doc('ruoli').get();
        if (!rd.exists || typeof rd.data().json !== 'string') return false;
        const lista = JSON.parse(rd.data().json) || [];
        const r = (Array.isArray(lista) ? lista : []).find(x => x && x.id === ruolo);
        return !!(r && RE_PARTNER.test(String(r.nome || '')));
    } catch (_) { return false; }
}

/* Lettore CSV completo (virgolette, separatori dentro i campi, a capo nel
   testo). Riconosce da solo virgola e punto e virgola: gli elenchi scaricati
   in Italia usano quasi sempre il punto e virgola. */
function separatore(s) {
    const prima = String(s || '').split('\n')[0] || '';
    const pv = (prima.match(/;/g) || []).length;
    const vg = (prima.match(/,/g) || []).length;
    return pv > vg ? ';' : ',';
}
function leggiCsv(testoCsv) {
    const sep = separatore(testoCsv);
    const righe = [];
    let riga = [], campo = '', dentroVirgolette = false;
    const s = String(testoCsv || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (dentroVirgolette) {
            if (c === '"') {
                if (s[i + 1] === '"') { campo += '"'; i++; }
                else dentroVirgolette = false;
            } else campo += c;
        } else if (c === '"') {
            dentroVirgolette = true;
        } else if (c === sep) {
            riga.push(campo); campo = '';
        } else if (c === '\n') {
            riga.push(campo); campo = '';
            if (riga.some(x => x !== '')) righe.push(riga);
            riga = [];
        } else campo += c;
    }
    riga.push(campo);
    if (riga.some(x => x !== '')) righe.push(riga);
    return righe;
}

/* Intestazioni riconosciute. Gli elenchi arrivano dai posti piu' diversi
   (visure, gestionali, fogli fatti a mano): si accettano le varianti piu'
   comuni, e tutte le colonne NON riconosciute restano lo stesso nella
   scheda, cosi' non si perde niente di quello che e' stato caricato. */
const ALIAS = {
    'ragione sociale': 'ragioneSociale', 'ragione_sociale': 'ragioneSociale', 'ragionesociale': 'ragioneSociale',
    'denominazione': 'ragioneSociale', 'azienda': 'ragioneSociale', 'societa': 'ragioneSociale',
    'impresa': 'ragioneSociale', 'nome azienda': 'ragioneSociale', 'nome impresa': 'ragioneSociale', 'nome': 'ragioneSociale',
    'pec': 'pec', 'indirizzo pec': 'pec', 'email pec': 'pec', 'e-mail pec': 'pec', 'pec impresa': 'pec',
    'posta elettronica certificata': 'pec', 'pec_impresa': 'pec', 'indirizzo_pec': 'pec', 'domicilio digitale': 'pec',
    'partita iva': 'piva', 'partita_iva': 'piva', 'piva': 'piva', 'p.iva': 'piva', 'p iva': 'piva', 'vat': 'piva',
    'codice fiscale': 'cf', 'codice_fiscale': 'cf', 'cf': 'cf', 'cod. fiscale': 'cf',
    'referente': 'referente', 'contatto': 'referente', 'nome referente': 'referente', 'persona di riferimento': 'referente',
    'citta': 'citta', 'comune': 'citta', 'sede': 'citta', 'comune sede': 'citta',
    'provincia': 'provincia', 'prov': 'provincia', 'sigla provincia': 'provincia',
    'telefono': 'telefono', 'tel': 'telefono', 'cellulare': 'telefono',
    'email': 'email', 'e-mail': 'email', 'mail': 'email', 'email ordinaria': 'email', 'posta elettronica': 'email',
    'note': 'note', 'nota': 'note', 'settore': 'settore', 'ateco': 'settore', 'attivita': 'settore'
};

/* Freno agli invii, per utente e per canale. Il conteggio sta su Firestore
   (non in memoria) perche' ogni chiamata puo' finire su una macchina diversa,
   e una transazione regge anche le richieste in parallelo. */
const ORA_MS = 60 * 60 * 1000;
async function consumaGettoni(db, chi, canale, quanti) {
    const tetto = CANALI.maxOra(canale);
    const rif = db.collection('invito_throttle').doc(chi + '~' + canale);
    return db.runTransaction(async tx => {
        const snap = await tx.get(rif);
        const ora = Date.now();
        const d = snap.exists ? (snap.data() || {}) : {};
        const stessaFinestra = (ora - (d.inizioFinestra || 0)) < ORA_MS;
        const fatti = stessaFinestra ? (d.conteggio || 0) : 0;
        const disponibili = Math.max(0, tetto - fatti);
        const concessi = Math.min(quanti, disponibili);
        if (concessi > 0) {
            tx.set(rif, {
                inizioFinestra: stessaFinestra ? d.inizioFinestra : ora,
                conteggio: fatti + concessi, ultimo: ora
            }, { merge: true });
        }
        /* Quando la finestra si riapre. Non e' un di piu': quando il tetto e'
           pieno, "riprova piu' tardi" lascia la persona a indovinare, e chi
           indovina riprova ogni due minuti. Con l'ora esatta si sa se
           aspettare o andare a fare altro. */
        const inizio = stessaFinestra ? (d.inizioFinestra || ora) : ora;
        return {
            concessi: concessi, disponibili: disponibili, tetto: tetto,
            /* L'inizio della finestra torna indietro insieme ai gettoni, e non
               e' un di piu': serve al rimborso qui sotto per capire se sta
               ancora parlando della stessa finestra. */
            inizioFinestra: inizio,
            riprendeAlle: (fatti + concessi) >= tetto ? inizio + ORA_MS : 0
        };
    });
}

/* I gettoni prenotati e non usati tornano indietro, ma SOLO se la finestra
   e' ancora quella in cui erano stati presi.

   Il difetto che questa transazione ripara: il rimborso era un
   increment(-n) secco. Un invio lungo puo' cominciare a fine finestra e
   finire dentro quella dopo; li' il decremento si mangiava dei gettoni
   della finestra NUOVA, che nessuno aveva speso, e il conteggio poteva
   perfino andare sotto zero - cioe' concedere piu' invii del tetto. Con
   una persona che preme un pulsante ogni tanto era un caso di scuola; con
   un lavoro automatico che gira di continuo smette di esserlo. */
async function restituisciGettoni(db, chi, canale, quanti, inizioFinestra) {
    if (!(quanti > 0)) return;
    const rif = db.collection('invito_throttle').doc(chi + '~' + canale);
    await db.runTransaction(async tx => {
        const snap = await tx.get(rif);
        if (!snap.exists) return;
        const d = snap.data() || {};
        // finestra cambiata: quei gettoni sono scaduti da soli, non c'e' niente da rendere
        if (Number(d.inizioFinestra || 0) !== Number(inizioFinestra || 0)) return;
        const conteggio = Math.max(0, (Number(d.conteggio) || 0) - quanti);
        tx.set(rif, { conteggio: conteggio }, { merge: true });
    });
}

/* Lo stesso conto, ma senza consumare niente: serve a dire PRIMA dell'invio
   quanti ne restano in questa finestra, e a far vedere il tempo che scorre
   quando sono finiti. Fuori dalla transazione, perche' qui si legge e basta. */
async function gettoniStato(db, chi, canale) {
    const tetto = CANALI.maxOra(canale);
    let d = {};
    try {
        const snap = await db.collection('invito_throttle').doc(chi + '~' + canale).get();
        d = snap.exists ? (snap.data() || {}) : {};
    } catch (_) { d = {}; }
    const ora = Date.now();
    const inizio = d.inizioFinestra || 0;
    const dentro = (ora - inizio) < ORA_MS;
    const fatti = dentro ? (d.conteggio || 0) : 0;
    const disponibili = Math.max(0, tetto - fatti);
    return {
        tetto: tetto, usati: fatti, disponibili: disponibili,
        riprendeAlle: (dentro && disponibili === 0) ? inizio + ORA_MS : 0
    };
}

/* Ha risposto? Le tre forme che una risposta puo' prendere, in un posto
   solo: la risposta a una PEC, il modulo di richiesta contatto, e
   l'iscrizione all'evento col codice. Sono tre strade diverse per dire la
   stessa cosa - "questa azienda si e' fatta viva" - e chi guarda l'elenco
   non deve doverle cercare in tre colonne. */
function haRisposto(d) {
    if (!d) return false;
    if (d.contatto && d.contatto.quando) return true;
    if (d.ricevute && d.ricevute.risposta && d.ricevute.risposta.quando) return true;
    return d.stato === 'risposta' || d.stato === 'iscritta';
}

/* La stessa azienda nell'ALTRA lista dello stesso evento.
   Serve due volte: quando si importa (per avvisare prima che parta un
   doppione) e a ogni lettura dell'elenco (perche' l'avviso all'import lo si
   vede una volta sola, e tre settimane dopo la sovrapposizione c'e' ancora).
   Torna il minimo per decidere: dov'e', a che punto e', e se le e' gia'
   partito qualcosa - che e' l'unica cosa che rende la scelta obbligata. */
function altrove(d) {
    if (!d) return null;
    return {
        campagna: CAMPAGNE.diScheda(d),
        stato: d.stato || 'da-invitare',
        inviata: !!(d.invio && d.invio.quando),
        quando: (d.invio && d.invio.quando) || 0,
        risposto: haRisposto(d)
    };
}

/* Le sovrapposizioni fra questa campagna e le altre, per un elenco di
   recapiti. Si leggono per identificativo e non con una query: gli
   identificativi li sappiamo comporre, e getAll a blocchi costa una lettura
   per scheda invece di rileggere tutto l'evento. */
async function sovrapposizioni(db, evento, campagna, contatti) {
    const cercate = [];
    CAMPAGNE.altre(campagna).forEach(altra => {
        contatti.forEach(c => cercate.push({ contatto: c, campagna: altra, id: idDoc(evento, c, altra) }));
    });
    const trovate = [];
    for (let i = 0; i < cercate.length; i += 200) {
        const fetta = cercate.slice(i, i + 200);
        let doc;
        try { doc = await db.getAll.apply(db, fetta.map(x => db.collection('aziendeInvito').doc(x.id))); }
        catch (_) { continue; }
        doc.forEach((snap, k) => {
            if (!snap || !snap.exists) return;
            const v = snap.data() || {};
            const q = fetta[k];
            trovate.push({
                contatto: q.contatto,
                ragioneSociale: v.ragioneSociale || '',
                qui: idDoc(evento, q.contatto, campagna),
                la: q.id,
                campagna: q.campagna,
                stato: v.stato || 'da-invitare',
                inviata: !!(v.invio && v.invio.quando),
                quando: (v.invio && v.invio.quando) || 0,
                risposto: haRisposto(v)
            });
        });
    }
    return trovate;
}

/* La scheda come la vede l'area riservata: fuori restano solo i campi
   che servono a video, non l'intero documento. */
function inChiaro(id, d) {
    d = d || {};
    return {
        id: id,
        ragioneSociale: d.ragioneSociale || '', pec: d.pec || '', email: d.email || '',
        piva: d.piva || '', cf: d.cf || '', referente: d.referente || '',
        citta: d.citta || '', provincia: d.provincia || '', telefono: d.telefono || '',
        settore: d.settore || '', note: d.note || '',
        stato: d.stato || 'da-invitare', extra: d.extra || {},
        campagna: CAMPAGNE.diScheda(d),
        codice: d.codice || '',
        iscritti: Array.isArray(d.iscritti) ? d.iscritti.slice(0, 20) : [],
        invio: d.invio || null, errore: d.errore || null, aggiunta: d.aggiunta || null,
        /* Chi ha premuto il pulsante nella mail e ha lasciato i propri
           recapiti. E' l'esito che conta su una campagna di
           sponsorizzazione, e sta sulla scheda perche' la riga lo dica
           senza dover aprire un altro elenco. */
        contatto: d.contatto || null,
        risposto: haRisposto(d),
        /* Dov'e' la stessa azienda nell'altra lista, se c'e'. Lo riempie
           l'elenco, che ha gia' davanti tutte le schede dell'evento: qui
           resta null e non si va a cercarlo scheda per scheda. */
        anche: null,
        /* Gli esiti letti dalla casella PEC. Si espone il riepilogo, non la
           storia completa: alla tabella servono l'esito, quando e perche',
           e ogni campo in piu' viaggia moltiplicato per tutte le schede. */
        ricevute: d.ricevute ? {
            esito: d.ricevute.esito || 'attesa',
            accettata: d.ricevute.accettata || null,
            consegnata: d.ricevute.consegnata || null,
            problema: d.ricevute.problema || null,
            risposta: d.ricevute.risposta || null,
            aggiornato: d.ricevute.aggiornato || 0
        } : null
    };
}

/* Riconosce le richieste che riguardano questa sezione. presenze.js chiama
   questa prima del proprio smistamento: i nomi delle azioni si somigliano
   (aggiungi, modifica, cancella stanno da entrambe le parti) e senza un
   discriminante esplicito finirebbero nel posto sbagliato. */
function gestisce(body) {
    return !!(body && String(body.sezione || '') === 'aziende');
}

/* Un giro di lettura della casella PEC senza passare da un utente: lo usa
   la deviazione per lo scheduler in presenze.js. */
async function giroLettore(db, da) {
    return LETTORE.giro(db, { da: da || 'scheduler' });
}

/* L'esecuzione vera. Riceve dal chiamante cio' che ha gia' accertato
   (chi e', se e' amministratore, che ruolo ha) e restituisce lo stato HTTP
   con il corpo, senza toccare la risposta: e' presenze.js a scriverla.

   Il piccolo raccoglitore "res" qui sotto tiene il corpo di questa funzione
   IDENTICO a quando era un endpoint: era gia' provato riga per riga, e
   riscriverne duecento righe di uscite solo per cambiare la forma della
   risposta sarebbe stato un rischio senza vantaggio. */
async function esegui(ctx) {
    const db = ctx.db;
    const body = ctx.body || {};
    const email = ctx.email;
    // il collaboratore reale ('Nome <email>'), se a operare e' un collaboratore: nei timbri accanto a "da"
    const collab = ctx.collab || '';
    const ruolo = ctx.ruolo || '';
    const eAdmin = !!ctx.eAdmin;
    let esito = null;
    const res = {
        _stato: 200,
        status(s) { this._stato = s; return this; },
        json(v) { esito = { stato: this._stato, corpo: v }; return this; }
    };
    /* Il corpo sta dentro una funzione sua perche' conserva i "return" del
       codice originale: senza, quei return uscirebbero da esegui() prima che
       possa restituire l'esito raccolto qui sopra. */
    try {
        await (async () => {
        const azione = String(body.azione || 'elenco');
        const evento = testo(body.evento, 80);
        /* Quale delle due liste si sta guardando. Non riconosciuta = 'invito':
           l'area riservata vecchia in cache non manda niente, e deve
           continuare a vedere l'elenco che vedeva prima. */
        const campagna = CAMPAGNE.normalizza(body.campagna);

        /* Chi puo' TOCCARE l'elenco e spedire: amministratore, equity e founding
           partner. Consultarlo lo puo' chiunque veda la sezione Eventi. */
        /* Le azioni di sola lettura: chiunque veda la sezione Eventi.
           "programmazione" e' fra queste apposta - nascondere a meta' dello
           staff che c'e' gia' un invio programmato in corso e' il modo piu'
           rapido per farne partire un secondo a mano sulle stesse aziende. */
        const SOLA_LETTURA = ['elenco', 'configurazione', 'programmazione'];
        let puoGestire = eAdmin;
        if (!puoGestire && SOLA_LETTURA.indexOf(azione) < 0) puoGestire = await ePartner(db, ruolo);
        const negato = () => res.status(403).json({ ok: false, msg: 'Possono gestire le aziende da invitare l\'amministratore, gli equity partner e i founding partner.' });

        if (azione === 'configurazione') {
            const canale = c => {
                const pronto = CANALI.configurato(c);
                const cfg = CANALI.configurazione(c);
                return {
                    pronto: pronto, mittente: pronto ? cfg.mittente : '', host: pronto ? cfg.host : '',
                    separato: !!cfg.separato, rispondiA: cfg.rispondiA || '',
                    maxLotto: CANALI.maxLotto(c), maxOra: CANALI.maxOra(c)
                };
            };
            res.status(200).json({
                ok: true, canali: { email: canale('email'), pec: canale('pec') },
                /* Quanti ne restano in questa finestra oraria, canale per
                   canale: cosi' la finestra dell'invito lo dice prima, invece
                   di lasciarlo scoprire a meta' invio. */
                freno: {
                    email: await gettoniStato(db, email, 'email'),
                    pec: await gettoniStato(db, email, 'pec')
                },
                lettore: await LETTORE.stato(db)
            });
            return;
        }

        /* Com'e' messa la lettura della casella PEC: la vede chiunque apra la
           sezione, perche' serve a capire se la colonna delle ricevute e'
           aggiornata o se il controllo e' fermo da giorni. */
        if (azione === 'stato-lettore') {
            res.status(200).json(Object.assign({ ok: true }, await LETTORE.stato(db)));
            return;
        }

        /* Un giro di lettura della casella PEC. Lo fa partire chi gestisce gli
           inviti: apre una connessione a un servizio esterno e non e' una cosa
           da lasciare a chiunque passi di li'. */
        if (azione === 'ricevute') {
            if (!puoGestire) { negato(); return; }
            const r = await LETTORE.giro(db, { da: email, forza: body.forza === true });
            res.status(200).json({
                ok: !!r.ok, esito: r.esito || '', msg: r.msg || '',
                restanti: !!r.restanti, ultimoGiro: r.ultimoGiro || null,
                // solo le schede toccate da questo giro: l'area riservata
                // aggiorna le righe che ha gia' a video
                aggiornate: r.aggiornate || {}
            });
            return;
        }

        /* La posta che il lettore non sa a chi attribuire. Non e' un errore da
           nascondere: e' l'elenco delle cose da guardare a mano nella casella,
           ed e' anche il modo per accorgersi se la correlazione sta zoppicando. */
        if (azione === 'non-riconosciute') {
            if (!puoGestire) { negato(); return; }
            const snap = await db.collection('pecNonRiconosciute').orderBy('quando', 'desc').limit(50).get()
                .catch(() => db.collection('pecNonRiconosciute').limit(50).get());
            const elenco = [];
            snap.forEach(d => {
                const v = d.data() || {};
                elenco.push({
                    id: d.id, quando: v.quando || 0, genere: v.genere || '', motivo: v.motivo || '',
                    oggetto: v.oggetto || '', da: v.da || ''
                });
            });
            elenco.sort((a, b) => (b.quando || 0) - (a.quando || 0));
            res.status(200).json({ ok: true, messaggi: elenco });
            return;
        }

        if (!evento) { res.status(400).json({ ok: false, msg: 'Evento mancante.' }); return; }

        if (azione === 'elenco') {
            /* UNA PAGINA PER VOLTA. Chi chiede aPagine torna a bussare con il
               segnalibro dell'ultima scheda ricevuta finche' l'elenco non e'
               finito; chi non lo chiede e' un'area riservata vecchia, e
               riceve un blocco solo come prima. */
            const aPagine = body.aPagine === true;
            const dopo = testo(body.dopo, 400);
            const quante = aPagine ? PAGINA_ELENCO : PAGINA_INTERA;
            const snap = await paginaEvento(db, evento, aPagine ? dopo : '', quante);
            const aziende = [];
            /* Le schede delle ALTRE campagne non si buttano via: servono a
               dire, riga per riga, "questa azienda sta anche nell'altro
               elenco". Sono gia' in mano - la lettura e' per evento, non per
               campagna - quindi costa un giro di ciclo e nessuna lettura in
               piu'. */
            const fuoriCampagna = {};
            let ultimo = '';
            let quanteLette = 0;
            /* Il filtro sulla campagna si fa QUI e non nel where(): le schede
               scritte prima delle campagne non hanno il campo, e un
               where('campagna','==','invito') non troverebbe proprio quelle. */
            snap.forEach(d => {
                const v = d.data() || {};
                ultimo = d.id; quanteLette++;
                if (CAMPAGNE.diScheda(v) === campagna) { aziende.push(inChiaro(d.id, v)); return; }
                const k = chiaveContatto(v);
                if (k) fuoriCampagna[k] = altrove(v);
            });
            aziende.forEach(a => {
                const k = String(a.pec || a.email || '').toLowerCase();
                if (k && fuoriCampagna[k]) a.anche = fuoriCampagna[k];
            });
            aziende.sort((a, b) => String(a.ragioneSociale).localeCompare(String(b.ragioneSociale), 'it'));
            /* L'altra lista viaggia anche a parte: la sovrapposizione fra due
               schede puo' cadere su due pagine diverse, e chi rimette insieme
               le pagine e' l'unico che le ha davanti tutte e due. */
            res.status(200).json({
                ok: true, aziende: aziende, aggiornato: Date.now(),
                altre: aPagine ? fuoriCampagna : {},
                cursore: quanteLette >= quante ? ultimo : '',
                ancora: quanteLette >= quante,
                limite: MAX_AZIENDE_EVENTO
            });
            return;
        }

        /* Chi ha ricevuto, aperto, cliccato: solo per il canale ordinario.
           Sulla PEC la domanda non si pone - li' l'esito e' la ricevuta del
           gestore, che vale in giudizio, e non un pixel dentro un'immagine.

           Si chiede una lettura sola per evento e campagna, non una per
           azienda: la quota di Brevo e' di 300 chiamate l'ora per tutto il
           servizio, e una colonna che si aggiorna riga per riga la
           esaurirebbe da sola in un pomeriggio. */
        if (azione === 'esiti-email') {
            if (!puoGestire) { negato(); return; }
            /* Anche questa lettura va a pagine, e chiede i soli tre campi che
               guarda: con il tetto a 50.000 schede una lettura sola si
               porterebbe dietro l'intero elenco per contare gli indirizzi. */
            const indirizzi = [];
            let dal = 0;
            let dopoEsiti = '';
            for (let pagina = 0; pagina * PAGINA_SERVIZIO < MAX_AZIENDE_EVENTO; pagina++) {
                const snap = await paginaEvento(db, evento, dopoEsiti, PAGINA_SERVIZIO, ['campagna', 'invio', 'email']);
                let lette = 0;
                snap.forEach(d => {
                    const v = d.data() || {};
                    dopoEsiti = d.id; lette++;
                    if (CAMPAGNE.diScheda(v) !== campagna) return;
                    if (!v.invio || v.invio.canale !== 'email') return;
                    const ind = String(v.invio.destinatario || v.email || '').trim().toLowerCase();
                    if (!ind) return;
                    indirizzi.push(ind);
                    const q = Number(v.invio.quando) || 0;
                    if (q && (!dal || q < dal)) dal = q;
                });
                if (lette < PAGINA_SERVIZIO) break;
            }
            if (!indirizzi.length) {
                res.status(200).json({ ok: true, stato: 'nessuno', esiti: {}, msg: 'Nessun invio via email ordinaria in questa campagna.' });
                return;
            }
            const r = await ESITI.leggi(db, {
                chiave: evento + '~' + campagna, indirizzi: indirizzi, dal: dal || Date.now()
            });
            res.status(200).json({
                ok: true, stato: r.stato, aggiornato: r.aggiornato || 0,
                esiti: r.esiti || {}, msg: r.msg || '', guardati: indirizzi.length
            });
            return;
        }

        /* A chi arrivano le richieste di contatto di questa campagna, e
           quelle gia' arrivate. Sono la stessa schermata, quindi una
           chiamata sola: chiederle separate vorrebbe dire due giri di rete
           per aprire una finestra. */
        if (azione === 'contatti') {
            if (!puoGestire) { negato(); return; }
            /* La finestra dell'invio e quella dell'elenco chiedono solo A CHI
               arrivano le richieste, non quelle gia' arrivate: leggerle
               sarebbe una query in piu' per un dato che non mostrano. */
            const soloDest = body.soloDestinatari === true;
            res.status(200).json({
                ok: true,
                destinatari: await CONTATTI.destinatari(db, evento, campagna),
                richieste: soloDest ? [] : await CONTATTI.elenco(db, evento, campagna, body.quante),
                soloDestinatari: soloDest,
                postaPronta: CONTATTI.configurato(),
                max: CONTATTI.MAX_DESTINATARI
            });
            return;
        }

        if (azione === 'richieste-elimina') {
            if (!puoGestire) { negato(); return; }
            const ids = (Array.isArray(body.ids) ? body.ids : []).map(x => testo(x, 200)).filter(Boolean);
            if (!ids.length) { res.status(400).json({ ok: false, msg: 'Nessuna richiesta indicata.' }); return; }
            const r = await CONTATTI.elimina(db, evento, campagna, ids);
            res.status(200).json({ ok: true, tolte: r.tolte, schede: r.schede });
            return;
        }

        if (azione === 'contatti-salva') {
            if (!puoGestire) { negato(); return; }
            const d = (body.destinatari && typeof body.destinatari === 'object') ? body.destinatari : {};
            /* Un elenco vuoto e' una scelta legittima (si sospende la
                  campagna), ma va detto: senza destinatari le richieste si
                  registrano e basta, e nessuno riceve niente. */
            /* Chi ha cambiato i destinatari resta scritto, col collaboratore
               vero accanto se a operare e' stato uno di loro: e' la stessa
               regola dei timbri sulle schede. */
            const salvati = await CONTATTI.salvaDestinatari(db, evento, campagna, d,
                email + (collab ? ' (' + collab + ')' : ''));
            res.status(200).json({
                ok: true, destinatari: salvati,
                avviso: (!salvati.a.length && !salvati.cc.length)
                    ? 'Nessun destinatario: le richieste verranno registrate qui, ma non arriveranno per email a nessuno.'
                    : ''
            });
            return;
        }

        /* I messaggi PEC che riguardano UNA azienda: ricevute del gestore e
           risposte. Qui viaggiano solo le coordinate (quale messaggio, di che
           tipo, quando), non il contenuto. */
        if (azione === 'messaggi') {
            if (!puoGestire) { negato(); return; }
            const id = testo(body.id, 400);
            if (!id) { res.status(400).json({ ok: false, msg: 'Azienda non indicata.' }); return; }
            const snap = await db.collection('aziendeInvito').doc(id).get();
            if (!snap.exists || String((snap.data() || {}).evento || '') !== evento) {
                res.status(404).json({ ok: false, msg: 'Scheda non trovata.' }); return;
            }
            const r = (snap.data() || {}).ricevute || {};
            res.status(200).json({ ok: true, messaggi: Array.isArray(r.messaggi) ? r.messaggi : [] });
            return;
        }

        /* Il TESTO di un messaggio, letto dalla casella al momento e non
           conservato da nessuna parte.

           Il controllo che conta e' quello qui sotto: si accetta solo un uid
           che risulta gia' annotato SU QUELLA scheda. Senza, questo endpoint
           diventerebbe "leggimi qualunque messaggio della PEC dello studio",
           cioe' la corrispondenza dei clienti, a chiunque sappia indovinare
           un numero. */
        if (azione === 'leggi-messaggio') {
            if (!puoGestire) { negato(); return; }
            const id = testo(body.id, 400);
            const uid = Number(body.uid) || 0;
            if (!id || !uid) { res.status(400).json({ ok: false, msg: 'Messaggio non indicato.' }); return; }
            const snap = await db.collection('aziendeInvito').doc(id).get();
            if (!snap.exists || String((snap.data() || {}).evento || '') !== evento) {
                res.status(404).json({ ok: false, msg: 'Scheda non trovata.' }); return;
            }
            const elenco = ((snap.data() || {}).ricevute || {}).messaggi || [];
            const suo = elenco.find(x => Number(x.uid) === uid);
            if (!suo) { res.status(403).json({ ok: false, msg: 'Quel messaggio non risulta collegato a questa azienda.' }); return; }
            const letto = await LETTORE.leggiMessaggio(db, { uid: uid, uidValidity: suo.uidValidity });
            res.status(letto.ok ? 200 : 400).json(letto);
            return;
        }

        if (azione === 'importa') {
            if (!puoGestire) { negato(); return; }
            const righe = leggiCsv(typeof body.csv === 'string' ? body.csv : '');
            if (righe.length < 2) { res.status(400).json({ ok: false, msg: 'Il file non contiene righe da importare: la prima riga sono le intestazioni, dalla seconda in poi le aziende.' }); return; }

            /* L'asterisco del modello segna le colonne obbligatorie a chi apre
               il foglio; qui non significa niente e si toglie, cosi' chi lo
               cancella e chi lo lascia ottengono lo stesso risultato. */
            const intest = righe[0].map(h => chiave(h).replace(/\*/g, '').replace(/\s+/g, ' ').trim());
            const campoDi = {};
            const presi = {};
            intest.forEach((h, i) => {
                const campo = ALIAS[h];
                // la prima colonna che vale per un campo vince: se il file ha sia
                // "Denominazione" sia "Nome", la ragione sociale resta una sola
                if (campo && !presi[campo]) { campoDi[i] = campo; presi[campo] = true; }
            });
            const col = n => { for (const i in campoDi) { if (campoDi[i] === n) return +i; } return -1; };
            const iPec = col('pec'), iMail = col('email'), iRag = col('ragioneSociale');
            if (iPec < 0 && iMail < 0) {
                res.status(400).json({ ok: false, msg: 'Nella prima riga non trovo ne la colonna PEC ne quella Email: scarica il modello, oppure chiama "PEC" la colonna degli indirizzi.' });
                return;
            }
            const cella = (riga, i) => (i >= 0 && riga[i] != null) ? testo(riga[i], 300) : '';

            // quante ce ne sono gia': l'elenco non deve crescere all'infinito
            let gia = 0;
            try { gia = (await db.collection('aziendeInvito').where('evento', '==', evento).count().get()).data().count || 0; }
            catch (_) { gia = 0; }
            /* Il tetto vale sull'evento intero, non sulla singola campagna:
               e' li' che si misura quanto pesa la lettura dell'elenco, che
               legge tutte le schede dell'evento e filtra dopo. */

            /* Le righe si preparano TUTTE prima di scrivere. Il tetto vale
               sulle schede nuove, e quali siano nuove si sa solo dopo aver
               letto quali esistono gia': ricaricare un elenco su un evento
               pieno non fa crescere niente, e prima veniva scartato in blocco
               - "2250 oltre il limite" su 2250 righe che erano gia' li' e
               chiedevano solo di essere aggiornate. */
            let senzaRecapito = 0, doppie = 0, oltreIlLimite = 0, senzaDenominazione = 0;
            const viste = {};
            const candidate = [];
            for (let r = 1; r < righe.length; r++) {
                const riga = righe[r];
                if (!riga || !riga.length) continue;
                const pec = cella(riga, iPec).toLowerCase();
                const mail = cella(riga, iMail).toLowerCase();
                const pecOk = indirizzoValido(pec) ? pec : '';
                const mailOk = indirizzoValido(mail) ? mail : '';
                const contatto = pecOk || mailOk;
                if (!contatto) { senzaRecapito++; continue; }
                /* Senza denominazione la scheda non serve a niente: non si sa a
                   chi si sta scrivendo, l'invito non si puo' intestare e in
                   elenco resta una riga muta. Si scarta e si dice quante. */
                if (!cella(riga, iRag)) { senzaDenominazione++; continue; }
                if (viste[contatto]) { doppie++; continue; }
                viste[contatto] = true;

                // colonne non riconosciute: restano con la loro intestazione
                const extra = {};
                for (let c = 0; c < riga.length; c++) {
                    if (campoDi[c]) continue;
                    const et = String(righe[0][c] == null ? '' : righe[0][c]).trim();
                    const val = cella(riga, c);
                    if (!et || !val) continue;
                    extra[et.slice(0, 60)] = val.slice(0, 300);
                }
                candidate.push({
                    id: idDoc(evento, contatto, campagna), contatto: contatto,
                    dati: {
                        evento: evento, campagna: campagna, pec: pecOk, email: mailOk,
                        ragioneSociale: cella(riga, iRag) || contatto.split('@')[0],
                        piva: cella(riga, col('piva')), cf: cella(riga, col('cf')),
                        referente: cella(riga, col('referente')), citta: cella(riga, col('citta')),
                        provincia: cella(riga, col('provincia')).slice(0, 4), telefono: cella(riga, col('telefono')),
                        settore: cella(riga, col('settore')), note: cella(riga, col('note')), extra: extra,
                        aggiornata: { quando: Date.now(), da: email, collab: collab }
                    }
                });
            }

            /* Chi c'e' gia' e chi e' nuovo, in una lettura ogni 200 schede:
               sono le stesse letture che prima servivano, dopo la scrittura, a
               mettere lo stato iniziale. Farle adesso non costa una lettura in
               piu' e dice anche quali righe fanno davvero crescere l'elenco. */
            const presenti = {};
            for (let i = 0; i < candidate.length; i += 200) {
                const fetta = candidate.slice(i, i + 200).map(x => db.collection('aziendeInvito').doc(x.id));
                const doc = await db.getAll.apply(db, fetta);
                doc.forEach(d => { if (d.exists) presenti[d.id] = (d.data() || {}).stato || ''; });
            }

            let importate = 0, nuove = 0;
            // i recapiti finiti in questa lista: servono per il controllo incrociato
            const contattiVisti = [];
            let batch = db.batch(), nel = 0;
            for (let i = 0; i < candidate.length; i++) {
                const c = candidate[i];
                const esiste = Object.prototype.hasOwnProperty.call(presenti, c.id);
                // il tetto ferma solo le schede nuove: un aggiornamento non fa crescere l'elenco
                if (!esiste && gia + nuove >= MAX_AZIENDE_EVENTO) { oltreIlLimite++; continue; }
                const dati = c.dati;
                /* Lo stato iniziale si scrive SOLO alla creazione della scheda
                   (e a chi era rimasto senza): sulle schede gia' in elenco il
                   merge aggiorna l'anagrafica e non tocca stato ed esito
                   dell'invio gia' fatto. */
                if (!esiste || !presenti[c.id]) {
                    dati.stato = 'da-invitare';
                    dati.aggiunta = { quando: Date.now(), da: email, collab: collab };
                }
                batch.set(db.collection('aziendeInvito').doc(c.id), dati, { merge: true });
                contattiVisti.push(c.contatto);
                nel++; importate++;
                if (!esiste) nuove++;
                if (nel >= 300) { await batch.commit(); batch = db.batch(); nel = 0; }
            }
            if (nel) await batch.commit();

            /* IL CONTROLLO INCROCIATO. La stessa azienda in tutte e due le
               liste dello stesso evento vuol dire due messaggi diversi allo
               stesso indirizzo, a poche settimane di distanza: si invita a
               venire chi si sta gia' chiedendo di pagare, o viceversa. Non lo
               si vieta - a volte e' voluto - ma va detto SUBITO, mentre chi ha
               caricato il file e' ancora davanti allo schermo e sa perche'
               l'ha caricato. Fra tre settimane sarebbe una scoperta.

               Si dice e basta: la scelta di che cosa togliere resta a chi
               guarda, perche' e' l'unico a sapere quale delle due
               conversazioni conta di piu' con quell'azienda. */
            let sovrapposte = [];
            try { sovrapposte = await sovrapposizioni(db, evento, campagna, contattiVisti); }
            catch (e) { console.error('Sovrapposizioni non verificate:', String((e && e.message) || e).slice(0, 200)); }

            res.status(200).json({
                ok: true, lette: righe.length - 1, importate: importate, nuove: nuove,
                aggiornate: importate - nuove, senzaRecapito: senzaRecapito, doppie: doppie,
                oltreIlLimite: oltreIlLimite, senzaDenominazione: senzaDenominazione,
                limite: MAX_AZIENDE_EVENTO, inElenco: gia + nuove,
                sovrapposte: sovrapposte.slice(0, 500),
                sovrapposteTotali: sovrapposte.length
            });
            return;
        }

        if (azione === 'aggiungi' || azione === 'modifica') {
            if (!puoGestire) { negato(); return; }
            const a = (body.azienda && typeof body.azienda === 'object') ? body.azienda : {};
            const pec = testo(a.pec, 200).toLowerCase();
            const mail = testo(a.email, 200).toLowerCase();
            if (pec && !indirizzoValido(pec)) { res.status(400).json({ ok: false, msg: 'Indirizzo PEC non valido.' }); return; }
            if (mail && !indirizzoValido(mail)) { res.status(400).json({ ok: false, msg: 'Indirizzo email non valido.' }); return; }
            if (!pec && !mail) { res.status(400).json({ ok: false, msg: 'Serve almeno un recapito: PEC o email.' }); return; }
            const rag = testo(a.ragioneSociale, 200);
            if (!rag) { res.status(400).json({ ok: false, msg: 'Ragione sociale mancante.' }); return; }
            const campi = {
                evento: evento, campagna: campagna, pec: pec, email: mail, ragioneSociale: rag,
                piva: testo(a.piva, 30), cf: testo(a.cf, 30), referente: testo(a.referente, 120),
                citta: testo(a.citta, 80), provincia: testo(a.provincia, 4), telefono: testo(a.telefono, 40),
                settore: testo(a.settore, 120), note: testo(a.note, 500),
                aggiornata: { quando: Date.now(), da: email, collab: collab }
            };
            const id = idDoc(evento, chiaveContatto(campi), campagna);
            const rif = db.collection('aziendeInvito').doc(id);
            const prima = await rif.get();
            if (!prima.exists) {
                campi.stato = 'da-invitare';
                campi.aggiunta = { quando: Date.now(), da: email, collab: collab };
            }
            /* Cambiare il recapito principale vuol dire cambiare identificativo:
               la scheda vecchia va tolta, altrimenti resterebbe un doppione con
               l'indirizzo sbagliato ancora da invitare. Si porta con se' lo
               stato, cosi' una correzione di battitura non fa ripartire un
               invito gia' spedito. */
            const idVecchio = testo(body.id, 400);
            if (azione === 'modifica' && idVecchio && idVecchio !== id) {
                const vecchia = await db.collection('aziendeInvito').doc(idVecchio).get();
                if (vecchia.exists) {
                    const v = vecchia.data() || {};
                    if (!prima.exists && v.stato) {
                        campi.stato = v.stato;
                        if (v.invio) campi.invio = v.invio;
                        if (v.errore) campi.errore = v.errore;
                        if (v.aggiunta) campi.aggiunta = v.aggiunta;
                    }
                    await vecchia.ref.delete().catch(() => { });
                }
            }
            await rif.set(campi, { merge: true });
            const dopo = await rif.get();
            /* Stesso controllo dell'importazione: una scheda aggiunta a mano
               puo' sovrapporsi all'altra lista esattamente come una riga di
               foglio, e chi la sta scrivendo e' il momento giusto per
               dirglielo. */
            let sovr = [];
            try { sovr = await sovrapposizioni(db, evento, campagna, [chiaveContatto(campi)]); }
            catch (_) { sovr = []; }
            res.status(200).json({ ok: true, azienda: inChiaro(id, dopo.data()), sovrapposte: sovr });
            return;
        }

        if (azione === 'cancella') {
            if (!puoGestire) { negato(); return; }
            const ids = (Array.isArray(body.ids) ? body.ids : []).map(x => testo(x, 400)).filter(Boolean);
            if (!ids.length) { res.status(400).json({ ok: false, msg: 'Nessuna azienda indicata.' }); return; }
            if (ids.length > 500) { res.status(400).json({ ok: false, msg: 'Troppe aziende in una volta sola.' }); return; }
            let batch = db.batch(), n = 0;
            for (const id of ids) {
                const rif = db.collection('aziendeInvito').doc(id);
                /* I riferimenti delle ricevute se ne vanno con la scheda:
                   dentro ci sono l'indirizzo PEC dell'azienda e il legame con
                   l'evento, e una cancellazione fatta a meta' non e' una
                   cancellazione. */
                try {
                    const snap = await rif.get();
                    if (snap.exists) n += LETTORE.dimenticaRiferimenti(batch, db, snap.data());
                } catch (_) { /* la scheda si toglie comunque */ }
                batch.delete(rif);
                n++;
                if (n >= 300) { await batch.commit(); batch = db.batch(); n = 0; }
            }
            if (n) await batch.commit();
            res.status(200).json({ ok: true, tolte: ids.length });
            return;
        }

        if (azione === 'segna') {
            if (!puoGestire) { negato(); return; }
            const ids = (Array.isArray(body.ids) ? body.ids : []).map(x => testo(x, 400)).filter(Boolean).slice(0, 500);
            const stato = testo(body.stato, 30);
            if (!ids.length) { res.status(400).json({ ok: false, msg: 'Nessuna azienda indicata.' }); return; }
            if (STATI.indexOf(stato) < 0) { res.status(400).json({ ok: false, msg: 'Stato non riconosciuto.' }); return; }
            let batch = db.batch(), n = 0;
            for (const id of ids) {
                batch.set(db.collection('aziendeInvito').doc(id), { stato: stato, aggiornata: { quando: Date.now(), da: email, collab: collab } }, { merge: true });
                n++;
                if (n >= 300) { await batch.commit(); batch = db.batch(); n = 0; }
            }
            if (n) await batch.commit();
            res.status(200).json({ ok: true, segnate: ids.length });
            return;
        }

        if (azione === 'invia') {
            if (!puoGestire) { negato(); return; }
            const canale = String(body.canale || 'email') === 'pec' ? 'pec' : 'email';
            if (!CANALI.configurato(canale)) {
                res.status(400).json({
                    ok: false, nonConfigurato: true, canale: canale,
                    msg: canale === 'pec'
                        ? 'La casella PEC non e configurata sul servizio: senza quelle credenziali l\'invito non sarebbe una PEC. Vanno impostate le variabili PEC_SMTP_USER, PEC_SMTP_PASS e PEC_FROM_EMAIL su Vercel.'
                        : 'Il server di posta non e configurato sul servizio (variabili SMTP_USER e SMTP_PASS su Vercel).'
                });
                return;
            }
            const maxLotto = CANALI.maxLotto(canale);
            const ids = (Array.isArray(body.ids) ? body.ids : []).map(x => testo(x, 400)).filter(Boolean).slice(0, maxLotto);
            if (!ids.length) { res.status(400).json({ ok: false, msg: 'Nessuna azienda indicata.' }); return; }
            const mail = (body.mail && typeof body.mail === 'object') ? body.mail : {};
            const oggetto = testo(mail.oggetto, 250);
            const html = String(mail.html || '').slice(0, 300000);
            if (!oggetto) { res.status(400).json({ ok: false, msg: 'Oggetto dell\'invito mancante.' }); return; }
            if (!html.trim()) { res.status(400).json({ ok: false, msg: 'Testo dell\'invito mancante.' }); return; }
            const forza = body.forza === true;

            /* Chi ha gia' chiesto di non ricevere piu' nulla non lo si tocca,
               qualunque sia la lista da cui e' rispuntato. Si legge una volta
               sola per lotto: e' lo stesso elenco che usa la newsletter. */
            let fuori = {};
            try { fuori = await NL.disiscritti(db); }
            catch (_) { fuori = {}; }

            // gettoni: si prenotano PRIMA, per non spedire oltre il tetto orario
            let gettoni;
            try { gettoni = await consumaGettoni(db, email, canale, ids.length); }
            catch (_) { gettoni = { concessi: ids.length, disponibili: ids.length, tetto: CANALI.maxOra(canale) }; }
            if (!gettoni.concessi) {
                res.status(429).json({
                    ok: false, tettoPieno: true, riprendeAlle: gettoni.riprendeAlle || 0,
                    msg: 'Hai raggiunto il tetto di ' + gettoni.tetto + ' invii in un\'ora su questo canale. L\'elenco si ricorda a che punto era.'
                });
                return;
            }
            const daFare = ids.slice(0, gettoni.concessi);
            const tettoRaggiunto = gettoni.concessi < ids.length;

            /* Il ciclo vero e' in lib/invio-inviti.js, ed e' lo stesso che usa
               il lavoro automatico degli invii programmati. Qui restano le due
               cose che valgono SOLO per l'invio a mano: il tetto orario per
               utente (un freno contro l'invio partito per sbaglio da una
               finestra aperta) e il dettaglio degli esiti scheda per scheda,
               che serve all'area riservata per aggiornare la tabella senza
               rileggere l'elenco intero. */
            const r = await MOTORE.inviaSchede(db, {
                evento: evento, campagna: campagna, canale: canale,
                ids: daFare, mail: { oggetto: oggetto, html: html }, forza: forza,
                email: email, collab: collab,
                /* Il nome della pagina di iscrizione viaggia col codice: e' l'unico
                   modo che ha il modulo pubblico, che l'evento lo conosce solo per
                   nome, di accorgersi che gli stanno presentando il codice di un
                   altro evento. */
                pagina: testo(body.pagina, 200),
                rispondiA: email,
                // oltre i 45 secondi si smette: il resto lo fa la chiamata dopo
                scadenza: Date.now() + 45000,
                fuori: fuori
            });

            /* Gettoni prenotati e non usati (tempo scaduto, schede saltate):
               si restituiscono, altrimenti il tetto orario si consumerebbe
               anche per gli invii che non sono mai partiti. */
            const nonUsati = daFare.length - r.trattate;
            if (nonUsati > 0) {
                try { await restituisciGettoni(db, email, canale, nonUsati, gettoni.inizioFinestra); }
                catch (_) { /* il tetto si riazzera comunque a fine finestra */ }
            }

            res.status(200).json({
                ok: true, canale: canale, inviate: r.inviate, saltate: r.saltate,
                senzaRecapito: r.senzaRecapito, disiscritte: r.disiscritte,
                falliti: r.falliti.slice(0, 50), esiti: r.esiti,
                /* Le schede su cui un invio precedente si e' interrotto senza
                   lasciare un esito: non si ritentano, si mostrano. Vedi
                   INCERTO_DOPO_MS in lib/invio-inviti.js. */
                incerte: r.incerte || 0,
                tettoRaggiunto: tettoRaggiunto, maxLotto: maxLotto,
                bloccato: r.bloccato || '',
                // l'ora in cui la finestra si riapre, cosi' non si tira a indovinare
                riprendeAlle: gettoni.riprendeAlle || 0
            });
            return;
        }


        /* ============================================================
           GLI INVII PROGRAMMATI
           ------------------------------------------------------------
           L'invio a mano lo guida il browser: si preme Invia e i lotti
           partono finche' la finestra resta aperta. Su un elenco da
           cinquemila aziende non funziona - nessuno tiene aperta una
           finestra per otto ore, e il tetto orario per utente si
           esaurisce dopo il primo quarto d'ora.

           Un invio programmato lo porta avanti il servizio, da solo, a
           RITMO: 250 PEC ogni novanta minuti, oppure 1.000 email ogni
           ora. Qui ci sono solo le azioni che lo mettono in piedi e lo
           governano; a spedire ci pensa il lavoro automatico
           (lib/giro-inviti.js, chiamato da api/invii-programmati.js).

           PERCHE' TRE AZIONI PER CREARNE UNA. Perche' l'elenco degli
           identificativi puo' essere lungo decine di migliaia di voci e
           non entra in una richiesta sola: si crea il documento
           (programma), si mandano gli identificativi a blocchi
           (programma-lotto) e solo alla fine si accende
           (programma-avvia). Finche' non e' accesa la programmazione
           sta in stato "preparazione" e non spedisce niente: una
           programmazione a meta' che partisse scriverebbe alle prime
           cinquecento aziende e poi si direbbe conclusa. */
        /* Tutte le azioni della programmazione parlano di UN elenco, e un
           elenco e' un evento piu' una campagna: senza l'evento
           l'identificativo del documento sarebbe "~invito", cioe' un
           contenitore comune a tutti gli eventi. Meglio un no chiaro. */
        if (azione.indexOf('programma') === 0 && !evento) {
            res.status(400).json({ ok: false, msg: 'Evento non indicato.' });
            return;
        }

        if (azione === 'programmazione') {
            /* La sola LETTURA: la puo' fare chiunque veda la sezione
               Eventi, come l'elenco. Serve a disegnare il riquadro
               dell'avanzamento, e nascondere a meta' dello staff che c'e'
               un invio in corso e' il modo piu' rapido per farne partire
               un secondo a mano sulle stesse aziende. */
            const chieste = Array.isArray(body.campagne) && body.campagne.length
                ? body.campagne.slice(0, 5).map(c => CAMPAGNE.normalizza(c))
                : [campagna];
            const fuori = {};
            for (const c of chieste) {
                const id = PROG.idDi(evento, c);
                try {
                    const s = await PROG.rif(db, id).get();
                    fuori[c] = s.exists ? PROG.perVideo(id, s.data() || {}) : null;
                } catch (_) { fuori[c] = null; }
            }
            res.status(200).json({
                ok: true, programmazioni: fuori,
                programmazione: fuori[campagna] || null,
                /* I ritmi proposti e il passo del lavoro automatico li dice il
                   servizio: sono suoi, e un'area riservata rimasta in cache non
                   deve poter promettere un ritmo che qui non esiste. */
                ritmi: RITMI.RITMI, passoMin: RITMI.passoCronMin(),
                cron: await PROG.leggiBattito(db)
            });
            return;
        }

        if (azione === 'programma') {
            if (!puoGestire) { negato(); return; }
            const canale = String(body.canale || 'email') === 'pec' ? 'pec' : 'email';
            if (!CANALI.configurato(canale)) {
                res.status(400).json({
                    ok: false, nonConfigurato: true, canale: canale,
                    msg: canale === 'pec'
                        ? 'La casella PEC non e configurata sul servizio: senza quelle credenziali l\'invito non sarebbe una PEC.'
                        : 'Il server di posta non e configurato sul servizio (variabili SMTP_USER e SMTP_PASS su Vercel).'
                });
                return;
            }
            const mail = (body.mail && typeof body.mail === 'object') ? body.mail : {};
            const oggetto = testo(mail.oggetto, 250);
            const html = String(mail.html || '').slice(0, 300000);
            if (!oggetto) { res.status(400).json({ ok: false, msg: 'Oggetto dell\'invito mancante.' }); return; }
            if (!html.trim()) { res.status(400).json({ ok: false, msg: 'Testo dell\'invito mancante.' }); return; }

            const adesso = Date.now();
            /* Quando parte. Il passato vale come "appena puoi": chi sceglie
               un'ora gia' passata sta dicendo che vuole cominciare subito, e
               rispondergli "la data deve essere nel futuro" sarebbe pedanteria
               su una richiesta chiarissima. In avanti invece un tetto serve: il
               testo dell'invito e' una fotografia, e a due mesi di distanza
               parlerebbe di un evento con le date cambiate. */
            let quando = Number(body.quando) || 0;
            if (!quando || quando < adesso) quando = adesso;
            if (quando > adesso + 60 * 24 * 60 * 60 * 1000) {
                res.status(400).json({ ok: false, msg: 'Non si puo programmare oltre 60 giorni: il testo dell\'invito invecchierebbe.' });
                return;
            }
            const ritmo = RITMI.normalizza(canale, body.ritmo);
            const id = PROG.idDi(evento, campagna);

            /* Una sola programmazione per elenco, e lo garantisce la
               transazione: due persone che programmano lo stesso elenco, anche
               da due browser, finiscono sullo stesso documento e la seconda
               viene respinta invece di creare un doppione che spedirebbe tutto
               due volte.

               L'eccezione e' una preparazione abbandonata: se il browser di
               chi stava caricando gli identificativi e' morto a meta', quella
               riga resterebbe li' a bloccare l'elenco per sempre. Dopo mezz'ora
               si considera persa e si puo' ricominciare. */
            const SCADE_PREPARAZIONE_MS = PROG.SCADE_PREPARAZIONE_MS;
            let conflitto = null;
            let vecchiaDaPulire = false;
            await db.runTransaction(async (tx) => {
                const s = await tx.get(PROG.rif(db, id));
                if (s.exists) {
                    const d = s.data() || {};
                    const preparazionePersa = d.stato === PROG.IN_PREPARAZIONE
                        && (adesso - Number((d.creato && d.creato.il) || 0)) > SCADE_PREPARAZIONE_MS;
                    if (PROG.eAttiva(d.stato) && !preparazionePersa) {
                        conflitto = d.stato;
                        return;
                    }
                    if (preparazionePersa) vecchiaDaPulire = true;
                }
                tx.set(PROG.rif(db, id), {
                    evento: evento, campagna: campagna, canale: canale,
                    stato: PROG.IN_PREPARAZIONE,
                    /* LA CHIAVE DI QUESTA CORSA, e senza non funziona il secondo
                       invio. Il timbro che il motore lascia sulla scheda serve a
                       riconoscere "gia' servita da questa programmazione", ma
                       l'identificativo del documento e' evento~campagna, cioe'
                       sempre lo stesso su quell'elenco. Cosi' il sollecito -
                       "manda una seconda volta alle 5.000 che l'hanno gia'
                       ricevuto", che e' il secondo invio di ogni campagna -
                       trovava il proprio timbro gia' scritto dalla PRIMA
                       programmazione e saltava tutte le aziende, dichiarandosi
                       conclusa dopo aver spedito zero. Con una chiave nuova a
                       ogni corsa il timbro identifica l'invio, non l'elenco. */
                    corsa: adesso.toString(36) + '-' + Math.round(quando % 100000).toString(36),
                    /* Occupa il posto: e' su questo che il lavoro automatico
                       cerca le programmazioni, invece di pescare le piu'
                       vecchie fra tutte quelle mai create. */
                    attiva: true,
                    quando: quando, ritmo: ritmo,
                    mail: { oggetto: oggetto, html: html },
                    pagina: testo(body.pagina, 200),
                    forza: body.forza === true,
                    creato: { da: email, collab: collab, il: adesso },
                    totale: 0, lotti: 0,
                    conti: { inviate: 0, saltate: 0, senzaRecapito: 0, disiscritte: 0, falliti: 0 },
                    finestra: { inizio: 0, usati: 0 },
                    annullaRichiesto: false,
                    lucchetto: null, avviato: null, concluso: null,
                    sospesa: null, annullato: null,
                    ultimoErrore: '', ultimoGiro: 0
                });
            });
            if (conflitto !== null) {
                res.status(409).json({
                    ok: false, giaProgrammato: true, stato: conflitto,
                    msg: conflitto === 'sospesa'
                        ? 'Su questo elenco c\'e gia un invio programmato, adesso in pausa: riprendilo o annullalo prima di farne un altro.'
                        : 'Su questo elenco c\'e gia un invio programmato. Annullalo prima di farne un altro, altrimenti le stesse aziende riceverebbero due messaggi.'
                });
                return;
            }
            // gli identificativi della preparazione persa non devono mescolarsi ai nuovi
            if (vecchiaDaPulire) await PROG.cancellaLotti(db, id);

            res.status(200).json({
                ok: true, id: id, perLotto: PROG.PER_LOTTO,
                ritmo: ritmo, ritmoTesto: RITMI.descrizione(canale, ritmo), quando: quando
            });
            return;
        }

        if (azione === 'programma-lotto') {
            if (!puoGestire) { negato(); return; }
            const id = PROG.idDi(evento, campagna);
            const n = Math.round(Number(body.n) || 0);
            if (n < 1 || n > 2000) { res.status(400).json({ ok: false, msg: 'Numero del blocco non valido.' }); return; }
            /* Gli identificativi devono essere nomi di documento che Firestore
               accetti. Uno con una barra dentro non e' una scheda che non
               esiste: e' un percorso verso un'altra collezione, e Firestore lo
               rifiuta con un'eccezione. Arrivata dentro il lavoro automatico,
               quell'eccezione fermerebbe la fetta a ogni giro, per sempre,
               sulla stessa scheda. Si scartano qui, dove c'e' ancora qualcuno
               che legge la risposta.

               Il punto invece va bene, ed e' importante non vietarlo: gli
               identificativi veri lo contengono (nascono da un indirizzo di
               posta). Illeciti sono solo la barra, i nomi "." e ".." da soli,
               e la forma __qualcosa__ che Firestore riserva a se'. */
            const nomeDocValido = x => !/\//.test(x) && x !== '.' && x !== '..' && !/^__.*__$/.test(x);
            const grezzi = (Array.isArray(body.ids) ? body.ids : [])
                .map(x => testo(x, 400)).filter(Boolean).slice(0, PROG.PER_LOTTO);
            const ids = grezzi.filter(nomeDocValido);
            const scartati = grezzi.length - ids.length;
            if (!ids.length) { res.status(400).json({ ok: false, msg: 'Nessuna azienda valida in questo blocco.' }); return; }

            /* Il conto delle aziende cresce QUI, non alla fine: chi manda i
               blocchi non deve doverli ricontare, e soprattutto un blocco
               rispedito dopo un errore di rete non deve contare due volte. Lo
               garantisce la transazione, che guarda se quel blocco c'era gia'. */
            let esito = null;
            await db.runTransaction(async (tx) => {
                const s = await tx.get(PROG.rif(db, id));
                if (!s.exists) { esito = { ok: false, msg: 'Programmazione non trovata: ricomincia.' }; return; }
                const d = s.data() || {};
                if (d.stato !== PROG.IN_PREPARAZIONE) {
                    esito = { ok: false, msg: 'Questa programmazione e gia avviata: non si possono aggiungere aziende.' };
                    return;
                }
                const rifLotto = PROG.rifLotti(db, id).doc(PROG.nomeLotto(n));
                const vecchio = await tx.get(rifLotto);
                const giaContati = vecchio.exists ? ((vecchio.data() || {}).ids || []).length : 0;
                tx.set(rifLotto, { n: n, ids: ids, stato: 'attesa', quando: 0 });
                tx.set(PROG.rif(db, id), {
                    totale: admin.firestore.FieldValue.increment(ids.length - giaContati),
                    lotti: admin.firestore.FieldValue.increment(vecchio.exists ? 0 : 1)
                }, { merge: true });
                esito = { ok: true, n: n, quanti: ids.length, scartati: scartati };
            });
            if (!esito.ok) { res.status(409).json(esito); return; }
            res.status(200).json(esito);
            return;
        }

        if (azione === 'programma-avvia') {
            if (!puoGestire) { negato(); return; }
            const id = PROG.idDi(evento, campagna);
            let esito = null;
            await db.runTransaction(async (tx) => {
                const s = await tx.get(PROG.rif(db, id));
                if (!s.exists) { esito = { ok: false, msg: 'Programmazione non trovata: ricomincia.' }; return; }
                const d = s.data() || {};
                if (d.stato !== PROG.IN_PREPARAZIONE) {
                    esito = { ok: false, msg: 'Questa programmazione era gia avviata.' };
                    return;
                }
                if (!(Number(d.totale) > 0)) {
                    esito = { ok: false, msg: 'Nessuna azienda e arrivata: non c\'e niente da programmare.' };
                    return;
                }
                tx.set(PROG.rif(db, id), { stato: 'programmata' }, { merge: true });
                esito = {
                    ok: true, id: id, totale: d.totale || 0, lotti: d.lotti || 0,
                    quando: d.quando || 0, canale: d.canale || 'email',
                    ritmo: d.ritmo || null,
                    ritmoTesto: RITMI.descrizione(d.canale, d.ritmo),
                    passoMin: RITMI.passoCronMin()
                };
            });
            if (!esito.ok) { res.status(409).json(esito); return; }
            res.status(200).json(esito);
            return;
        }

        if (azione === 'programma-sospendi' || azione === 'programma-riprendi') {
            if (!puoGestire) { negato(); return; }
            const ferma = azione === 'programma-sospendi';
            const id = PROG.idDi(evento, campagna);
            let esito = null;
            await db.runTransaction(async (tx) => {
                const s = await tx.get(PROG.rif(db, id));
                if (!s.exists) { esito = { ok: false, msg: 'Questo elenco non ha un invio programmato.' }; return; }
                const d = s.data() || {};
                if (ferma) {
                    if (!PROG.daLavorare(d.stato)) {
                        esito = { ok: false, msg: 'Questo invio programmato non e in corso (stato: ' + (d.stato || 'ignoto') + ').' };
                        return;
                    }
                    tx.set(PROG.rif(db, id), {
                        stato: 'sospesa', sospesa: { da: email, collab: collab, il: Date.now() }
                    }, { merge: true });
                    /* Il messaggio dice la verita' scomoda: si ferma quello che
                       non e' ancora partito. Quello gia' consegnato al server di
                       posta non si richiama indietro, e chi mette in pausa deve
                       saperlo prima, non scoprirlo dalle risposte. */
                    esito = { ok: true, msg: 'Invio programmato in pausa: non parte piu niente. I messaggi gia usciti non si possono richiamare.' };
                } else {
                    if (d.stato !== 'sospesa') {
                        esito = { ok: false, msg: 'Questo invio programmato non e in pausa (stato: ' + (d.stato || 'ignoto') + ').' };
                        return;
                    }
                    /* annullaRichiesto si azzera qui, e non e' pignoleria: una
                       programmazione fermata dal servizio mentre un annullamento
                       era in volo se lo porterebbe dietro, e il primo giro dopo
                       la ripresa la chiuderebbe come annullata - cioe' "Riprendi"
                       avrebbe l'effetto opposto a quello scritto sopra. */
                    tx.set(PROG.rif(db, id), {
                        stato: 'programmata', sospesa: null, ultimoErrore: '',
                        lucchetto: null, annullaRichiesto: false, attiva: true
                    }, { merge: true });
                    esito = { ok: true, msg: 'Invio programmato ripreso: riparte al prossimo giro, allo stesso ritmo.' };
                }
            });
            if (!esito.ok) { res.status(409).json(esito); return; }
            res.status(200).json(esito);
            return;
        }

        if (azione === 'programma-annulla') {
            if (!puoGestire) { negato(); return; }
            const id = PROG.idDi(evento, campagna);
            let esito = null;
            await db.runTransaction(async (tx) => {
                const s = await tx.get(PROG.rif(db, id));
                if (!s.exists) { esito = { ok: false, msg: 'Questo elenco non ha un invio programmato.' }; return; }
                const d = s.data() || {};
                if (!PROG.eAttiva(d.stato)) {
                    esito = { ok: false, msg: 'Questa programmazione non e piu attiva (stato: ' + (d.stato || 'ignoto') + ').' };
                    return;
                }
                /* Se un giro ci sta lavorando adesso non lo si interrompe da
                   qui: si lascia il segno e sara' lui a chiudere, dopo il lotto
                   in corso. Toccare il documento sotto le mani di chi sta
                   spedendo vorrebbe dire perdere il conto di quello che e'
                   partito. Il lucchetto dice se qualcuno c'e' davvero: uno
                   scaduto e' di un giro morto, e non ferma niente. */
                const inLavorazione = !!(d.lucchetto && Number(d.lucchetto.fino) > Date.now());
                tx.set(PROG.rif(db, id), {
                    annullaRichiesto: true,
                    stato: inLavorazione ? d.stato : 'annullata',
                    // se resta in lavorazione lo spegnera' il giro, chiudendola
                    attiva: inLavorazione ? true : false,
                    annullato: { da: email, collab: collab, il: Date.now() }
                }, { merge: true });
                esito = {
                    ok: true, inLavorazione: inLavorazione,
                    msg: inLavorazione
                        ? 'Un giro sta spedendo proprio adesso: si ferma appena finisce il gruppo in corso. Quello che e gia uscito non si puo richiamare.'
                        : 'Invio programmato annullato: non partira piu niente.'
                };
            });
            if (!esito.ok) { res.status(409).json(esito); return; }
            // gli identificativi se ne vanno subito: sono l'unico posto nuovo in cui vivono dei recapiti
            if (!esito.inLavorazione) await PROG.cancellaLotti(db, id);
            res.status(200).json(esito);
            return;
        }

        res.status(400).json({ ok: false, msg: 'Azione non riconosciuta.' });
        })();
    } catch (e) {
        const motivo = String((e && e.message) || 'errore').slice(0, 200);
        console.error('Aziende invito:', motivo);
        return { stato: 500, corpo: { ok: false, msg: 'Operazione non riuscita: ' + motivo } };
    }
    return esito || { stato: 500, corpo: { ok: false, msg: 'Nessuna risposta prodotta.' } };
}

module.exports = { gestisce, esegui, giroLettore };
