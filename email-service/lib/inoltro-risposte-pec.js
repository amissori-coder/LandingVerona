/* ============================================================
   Le risposte alle PEC dell'invito, inoltrate per posta ordinaria
   ------------------------------------------------------------
   Quando un'azienda risponde alla PEC dell'invito, la risposta arriva
   nella casella PEC dello studio, che nessuno apre tutti i giorni. Il
   lettore (lib/lettore-pec.js) la riconosce e la segna sulla scheda;
   qui c'e' il pezzo che la porta a chi organizza, con un'email
   ordinaria: il testo del messaggio dentro, gli allegati allegati.

   IN DUE TEMPI, perche' una risposta persa costa:
     accoda   quando il lettore riconosce una risposta scrive una riga in
              pecInoltri. La chiave e' il Message-ID del messaggio: se la
              casella viene riletta (o rigenerata, e gli UID cambiano) lo
              stesso messaggio non si accoda due volte. Se l'accodamento
              fallisce, il lettore non segna il messaggio come visto e lo
              rilegge al giro dopo;
     inoltra  a fine giro, con la connessione IMAP ancora aperta, prende
              le righe in attesa, va a leggere il messaggio nella casella
              e spedisce.
   Una riga si "prende" con una transazione prima di spedire, e la presa
   scade da sola: due giri sovrapposti non mandano la stessa mail due
   volte, e una funzione morta a meta' non blocca la riga per sempre.

   SE LA POSTA NON PARTE si riprova piu' avanti, a intervalli che
   crescono (10 minuti, 20, 40... fino a 6 ore): i tentativi si contano
   nel TEMPO, non nei giri, quindi premere dieci volte "Controlla le
   ricevute" durante un guasto della posta non brucia la risposta. Dopo
   poco piu' di un giorno si smette, e il riquadro della casella PEC
   nell'area riservata lo dice (meta/pecLettore.inoltriNonPartiti). Se il
   server di posta rifiuta proprio quel messaggio quando lo riceve (un
   allegato che non gli piace), dal tentativo dopo si spedisce senza
   allegati, elencandoli. Un messaggio che non si riesce a leggere dalla
   casella si riprova con le stesse attese; alla terza connessione caduta
   sullo stesso messaggio parte senza testo, dicendo dove leggerlo.

   SU FIRESTORE NON VA IL TESTO, per la stessa ragione per cui non ci va
   per il lettore: quella casella e' corrispondenza dello studio. Nella
   riga ci sono solo le coordinate (uid, mittente, oggetto), le stesse
   che la scheda ha gia'; il testo si legge dalla casella al momento di
   spedire, come quando lo si apre nell'area riservata. Mittente e oggetto
   si cancellano dalla riga appena la mail e' partita, e le righe se ne
   vanno con la scheda quando la si elimina (dimentica).

   A CHI: solo ad Andrea Missori (DESTINATARI qui sotto), a meno che
   PEC_RISPOSTE_DESTINATARI su Vercel indichi un elenco suo. Non agli
   organizzatori del riepilogo di mezzanotte: le risposte alle PEC le
   segue lui.
   ============================================================ */

const nodemailer = require('nodemailer');
const D = require('./daticert');
const CAMPAGNE = require('./campagne-invito');
const MNGB = require('./mail-ngb');

const COLL = 'pecInoltri';
const SCHEDE = 'aziendeInvito';
const META = ['meta', 'pecLettore'];
const MAX_TENTATIVI = 10;                     // con le attese qui sotto: poco piu' di un giorno (28 ore e mezza)
const ATTESA_PRIMA_MS = 10 * 60 * 1000;       // dopo il primo errore; poi raddoppia...
const ATTESA_MAX_MS = 6 * 60 * 60 * 1000;     // ...fino a sei ore
const MAX_CADUTE = 3;                         // connessioni cadute leggendo lo stesso messaggio, poi parte senza testo
const MAX_PER_GIRO = 5;                       // risposte inoltrate al massimo per giro
/* Le righe in attesa si leggono TUTTE (fino a questo tetto) e si sceglie
   qui quali sono pronte: con un limite piccolo e senza un ordine (che
   chiederebbe un indice composto) le righe ancora in attesa del loro turno
   potevano nascondere quelle gia' pronte. In pratica sono poche decine. */
const LETTE_PER_GIRO = 500;
const MAX_NON_PARTITI = 10;                   // quanti inoltri abbandonati ricorda lo stato del lettore
const ILLEGGIBILE = 'il messaggio non si riesce a leggere dalla casella';
const ETA_MAX_MS = 30 * 24 * 60 * 60 * 1000;  // piu' vecchie di cosi' non si inoltrano (vedi accoda)
const PRESA_MS = 5 * 60 * 1000;               // quanto vale la presa su una riga
const MAX_LETTURA = 512 * 1024;               // il testo che si scarica dalla casella (codificato)
const MAX_TESTO_MAIL = 30000;                 // il testo che si mette nella mail (caratteri)
/* Gli allegati viaggiano dentro la mail finche' ci stanno: oltre, si
   dice che ci sono e dove trovarli. Le dimensioni sono quelle dichiarate
   dalla casella (codificate), quindi un po' piu' grandi del file vero. */
const MAX_ALLEGATI_BYTE = 4 * 1024 * 1024;
const MAX_ALLEGATI = 10;

const BASE = String(process.env.APP_BASE_URL || 'https://nextgenerationbusiness.it').replace(/\/+$/, '');
const LINK_AREA = BASE + '/area-riservata/#eventi';

const s = v => String(v == null ? '' : v).trim();
const unaRiga = (v, max) => s(v).replace(/[\r\n\t]+/g, ' ').slice(0, max || 250);

function postaConfigurata() {
    return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}
function elencoIndirizzi(v) {
    return String(v || '').split(/[,;\s]+/).map(x => x.trim().toLowerCase())
        .filter(x => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
}
const DESTINATARI = ['andreamissori@revilaw.it'];
function destinatari() {
    const propri = elencoIndirizzi(process.env.PEC_RISPOSTE_DESTINATARI);
    return propri.length ? propri : DESTINATARI.slice();
}
/* Tempi stretti, sotto il minuto della funzione (vercel.json): l'inoltro
   parte a fine giro, e una posta che non risponde non deve far morire il
   giro prima che salvi fin dove e' arrivato. */
function trasporto() {
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 465,
        secure: (Number(process.env.SMTP_PORT) || 465) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        connectionTimeout: 8000, greetingTimeout: 6000, socketTimeout: 12000
    });
}
function mittente() {
    const ind = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
    const nome = (process.env.SMTP_FROM_NAME || 'Revilaw S.p.A.').replace(/[\r\n"]/g, ' ').slice(0, 80);
    return '"' + nome + '" <' + ind + '>';
}

/* "milano-2027-02-26" -> pagina "Milano 26 Febbraio 2027" (la stessa forma
   dei moduli: e' quella che sceglie la testata dell'evento) e nome
   "Milano, 26 febbraio 2027". */
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
function evento(id) {
    const m = /^([a-z][a-z-]*?)-(\d{4})-(\d{2})-(\d{2})$/.exec(s(id).toLowerCase());
    if (!m || !MESI[Number(m[3]) - 1]) return { pagina: '', nome: '' };
    const citta = m[1].split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
    const mese = MESI[Number(m[3]) - 1];
    const giorno = String(Number(m[4]));
    return {
        pagina: citta + ' ' + giorno + ' ' + mese.charAt(0).toUpperCase() + mese.slice(1) + ' ' + m[2],
        nome: citta + ', ' + giorno + ' ' + mese + ' ' + m[2]
    };
}
function quandoTesto(ms) {
    if (!ms) return '';
    const f = new Intl.DateTimeFormat('it-IT', {
        timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(new Date(ms));
    const p = t => (f.find(x => x.type === t) || {}).value || '';
    return p('day') + '/' + p('month') + '/' + p('year') + ' alle ' + p('hour') + ':' + p('minute');
}
function attesaDopo(tentativi) {
    return Math.min(ATTESA_MAX_MS, ATTESA_PRIMA_MS * Math.pow(2, Math.max(0, (Number(tentativi) || 1) - 1)));
}

/* ---------- accoda ---------- */
function idRiga(dati) {
    const mid = D.chiaveMsgId(dati.messageId);
    if (mid && mid.length >= 4) return 'm~' + mid;
    return 'u~' + s(dati.uidValidity) + '_' + Number(dati.uid);
}
/* Una risposta da inoltrare. Le piu' vecchie di un mese no: capita solo
   quando il lettore rilegge la posta gia' passata (la prima accensione, o
   la casella rigenerata dal gestore), e quelle risposte qualcuno le ha
   gia' viste nell'area riservata. Se la riga c'e' gia' e non e' ancora
   partita, si aggiornano le coordinate: dopo una cartella rigenerata quelle
   vecchie non portano piu' al messaggio. */
async function accoda(db, dati) {
    const ora = Date.now();
    if (dati.quando && dati.quando < ora - ETA_MAX_MS) return { accodata: false, motivo: 'vecchia' };
    const rif = db.collection(COLL).doc(idRiga(dati));
    const uid = Number(dati.uid) || 0;
    const uidValidity = s(dati.uidValidity);
    return db.runTransaction(async tx => {
        const snap = await tx.get(rif);
        if (snap.exists) {
            const d = snap.data() || {};
            if (d.stato !== 'inviata' && (Number(d.uid) !== uid || s(d.uidValidity) !== uidValidity || s(d.cartella) !== s(dati.cartella))) {
                tx.set(rif, { uid: uid, uidValidity: uidValidity, cartella: s(dati.cartella) }, { merge: true });
                return { accodata: false, motivo: 'gia-accodata', aggiornata: true };
            }
            return { accodata: false, motivo: 'gia-accodata' };
        }
        tx.set(rif, {
            stato: 'da-inviare', tentativi: 0, cadute: 0, creato: ora, fino: 0, prossimo: 0,
            scheda: s(dati.scheda), evento: s(dati.evento),
            // la risposta a che cosa: all'invito (il solito), o alla PEC di sollecito della conferma email
            tipo: s(dati.tipo) || 'invito',
            uid: uid, uidValidity: uidValidity, cartella: s(dati.cartella),
            messageId: s(dati.messageId).slice(0, 400),
            quando: Number(dati.quando) || ora,
            da: unaRiga(dati.da, 200), oggetto: unaRiga(dati.oggetto, 250),
            certificata: dati.certificata !== false
        });
        return { accodata: true };
    });
}

/* Le righe delle schede che si eliminano se ne vanno con loro (vedi la
   cancellazione in lib/aziende-invito.js): dentro c'e' l'indirizzo PEC
   dell'azienda. Trenta schede per interrogazione ("in" ne accetta trenta),
   e batch propri: la cancellazione ne fa fino a cinquecento. */
async function dimentica(db, ids) {
    const elenco = (Array.isArray(ids) ? ids : [ids]).map(s).filter(Boolean);
    let n = 0;
    for (let i = 0; i < elenco.length; i += 30) {
        const snap = await db.collection(COLL).where('scheda', 'in', elenco.slice(i, i + 30)).get();
        let batch = db.batch(), k = 0;
        snap.forEach(d => { batch.delete(db.collection(COLL).doc(d.id)); k++; n++; });
        if (k) await batch.commit();
    }
    return n;
}
/* Una scheda che cambia identificativo ("Modifica" con un recapito nuovo):
   le sue righe in coda la seguono, come il codice in codiciInvito. */
async function ripunta(db, idVecchio, idNuovo) {
    if (!idVecchio || !idNuovo || idVecchio === idNuovo) return 0;
    const snap = await db.collection(COLL).where('scheda', '==', String(idVecchio)).get();
    let n = 0;
    const batch = db.batch();
    snap.forEach(d => { batch.set(db.collection(COLL).doc(d.id), { scheda: String(idNuovo) }, { merge: true }); n++; });
    if (n) await batch.commit();
    return n;
}

/* ---------- la presa e il rilascio ---------- */
function libera(d, ora) {
    if (d.stato === 'da-inviare') return (Number(d.prossimo) || 0) <= ora;
    return d.stato === 'in-invio' && (Number(d.fino) || 0) < ora;
}
async function prendi(db, id) {
    const rif = db.collection(COLL).doc(id);
    return db.runTransaction(async tx => {
        const snap = await tx.get(rif);
        if (!snap.exists) return null;
        const d = snap.data() || {};
        const ora = Date.now();
        if (!libera(d, ora)) return null;
        /* I tentativi si contano alla PRESA, non all'errore: una funzione
           che muore a meta' invio non arriva a scrivere l'errore, e senza
           questo conto riproverebbe per sempre. */
        const tentativi = (Number(d.tentativi) || 0) + 1;
        if (tentativi > MAX_TENTATIVI) {
            tx.set(rif, { stato: 'non-inviata', fino: 0 }, { merge: true });
            return { abbandonata: true, d: d };
        }
        tx.set(rif, { stato: 'in-invio', fino: ora + PRESA_MS, tentativi: tentativi }, { merge: true });
        return Object.assign({}, d, { tentativi: tentativi });
    });
}
/* update e non set: se nel frattempo la riga e' stata tolta (la scheda
   eliminata mentre si spediva) non deve rinascere vuota, senza scheda ne'
   messaggio, e partire come "Un'azienda ha risposto". */
async function chiudi(db, id, campi) {
    try { await db.collection(COLL).doc(id).update(Object.assign({ fino: 0 }, campi)); }
    catch (_) { /* tolta, o la presa scade da sola: al massimo si riprova */ }
}
/* Una risposta che non partira' per email: la riga lo dice, e il riquadro
   della casella PEC nell'area riservata anche (lettore stato(),
   inoltriNonPartiti: le ultime dieci, non solo l'ultima - un guasto lungo
   della posta le fa abbandonare tutte insieme). La risposta resta comunque
   sulla scheda, e si legge da li'. */
async function segnaAbbandono(db, riga, azienda, motivo) {
    const voce = {
        quando: Date.now(), azienda: unaRiga(azienda || riga.da || 'un\'azienda', 200),
        scheda: s(riga.scheda), evento: s(riga.evento), motivo: unaRiga(motivo, 200)
    };
    try {
        const rif = db.collection(META[0]).doc(META[1]);
        await db.runTransaction(async tx => {
            const snap = await tx.get(rif);
            const prima = snap.exists ? ((snap.data() || {}).inoltriNonPartiti || []) : [];
            tx.set(rif, { inoltriNonPartiti: (Array.isArray(prima) ? prima : []).concat([voce]).slice(-MAX_NON_PARTITI) }, { merge: true });
        });
    } catch (_) { /* resta il registro */ }
    console.error('Inoltro risposta PEC non partito (' + voce.azienda + '):', voce.motivo);
}

/* ---------- la lettura dalla casella ----------
   Le parti si scaricano da se', con UNA richiesta ciascuna (BODY.PEEK con
   un limite di byte), e si decodificano con quello che dice la struttura
   del messaggio: codifica e gioco di caratteri. Non con download() di
   imapflow, per due ragioni: per sapere come decodificare chiede al
   server l'intestazione MIME della parte, che per il corpo di una busta di
   una parte sola non tutti i server danno; e scarica a pezzi da 64 KB, con
   un viaggio di andata e ritorno per pezzo, che su quattro mega di
   allegati da un server lontano e' il tempo che la funzione non ha. */
async function scaricaParte(client, uid, p, max) {
    const chiave = String((p && p.parte) || '1');
    const r = await client.fetchOne(String(uid), { uid: true, bodyParts: [{ key: chiave, start: 0, maxLength: max }] }, { uid: true });
    const grezzo = r && r.bodyParts ? (r.bodyParts.get(chiave.toLowerCase()) || r.bodyParts.get(chiave)) : null;
    if (!grezzo) return null;
    const tagliato = grezzo.length >= max;
    return { buf: D.decodificaTrasferimento(grezzo, p.codifica, tagliato), tagliato: tagliato };
}
/* Il testo di una parte, pronto da leggere: byte decodificati, gioco di
   caratteri, righe "flowed" ricucite, HTML ridotto a testo. */
async function testoDiParte(client, uid, parte, max) {
    const sc = await scaricaParte(client, uid, parte, max);
    if (!sc) return null;
    let t = D.decodificaTesto(sc.buf, parte.gioco, sc.tagliato);
    if (parte.html) t = D.testoDaHtml(t);
    else if (parte.flowed) t = D.testoFlowed(t.replace(/\r\n?/g, '\n'), parte.delsp);
    return { testo: t.replace(/\r\n?/g, '\n').trim(), tagliato: sc.tagliato };
}
function nomeFile(v) {
    const n = unaRiga(v, 120).replace(/[\/\\]/g, '-');
    return n || 'allegato';
}
/* Il messaggio dalla casella: testo e allegati. Torna `nonLetto` (il
   motivo) quando il testo non c'e', e la mail parte lo stesso, dicendolo:
   una risposta arrivata vale piu' del suo testo mancante. Se invece cade
   la CONNESSIONE l'errore sale, e la riga si riprova al giro dopo.
   `opz`: { scadenza: oltre quell'istante non si scaricano altri allegati,
   senzaAllegati: si elencano soltanto }. */
async function leggiDallaCasella(client, riga, uidValidity, opz) {
    opz = opz || {};
    const vuoto = motivo => ({ testo: '', troncato: false, allegati: [], file: [], nonLetto: motivo });
    if (!client) return vuoto('casella non aperta');
    if ((Number(riga.cadute) || 0) >= MAX_CADUTE) return vuoto(ILLEGGIBILE);
    /* imapflow non sempre lancia un errore quando la connessione cade: a
       volte un comando torna vuoto (search false, fetch senza niente). Prima
       di concludere "il messaggio non c'e'" si guarda se la casella e' ancora
       collegata: se non lo e', e' una connessione caduta, non un messaggio
       sparito, e la mail non deve partire senza testo. */
    const viva = () => { if (client.usable === false) throw new Error('connessione con la casella caduta'); };
    viva();
    let uid = Number(riga.uid) || 0;
    /* Cartella rigenerata (o cambiata): le coordinate salvate non portano
       piu' al messaggio. Lo si cerca per il suo Message-ID, una richiesta
       sola; solo se non lo si trova si spedisce senza testo. */
    if (s(riga.uidValidity) !== s(uidValidity) || (riga.cartella && opz.cartella && s(riga.cartella) !== s(opz.cartella))) {
        uid = 0;
        if (riga.messageId) {
            const trovati = await client.search({ header: { 'message-id': s(riga.messageId) } }, { uid: true });
            viva();
            // false (non []) vuol dire che la ricerca stessa non e' riuscita: si riprova
            if (trovati === false) throw new Error('ricerca nella casella non riuscita');
            if (Array.isArray(trovati) && trovati.length) uid = Number(trovati[trovati.length - 1]) || 0;
        }
        if (!uid) return vuoto('la cartella della casella è stata rigenerata');
    }
    if (!uid) return vuoto('messaggio non indicato');
    let trovato = null;
    for await (const m of client.fetch({ uid: uid + ':' + uid },
        { uid: true, size: true, bodyStructure: true }, { uid: true })) {
        if (Number(m.uid) === uid) trovato = m;
    }
    viva();
    if (!trovato) return vuoto('il messaggio non è più nella casella: può essere stato spostato o cancellato');

    const struttura = D.normalizzaParti(trovato.bodyStructure);
    const out = { testo: '', troncato: false, allegati: [], file: [], nonLetto: '' };
    /* Il testo dell'AZIENDA, cioe' quello dentro la busta. Fuori dalla busta
       c'e' solo la descrizione del gestore ("Messaggio di posta
       certificata..."): se l'azienda ha mandato soltanto un allegato, meglio
       dire che il messaggio non ha testo che spacciare quella per sua. */
    const parte = D.trovaLeggibile(struttura);
    const usabile = parte && (parte.dentroBusta || !D.trovaBusta(struttura));
    if (usabile) {
        try {
            const letto = await testoDiParte(client, uid, parte, MAX_LETTURA);
            viva();
            if (letto) {
                out.troncato = letto.tagliato || letto.testo.length > MAX_TESTO_MAIL;
                out.testo = letto.testo.slice(0, MAX_TESTO_MAIL);
            }
        } catch (e) {
            if (client.usable === false) throw e;
            out.nonLetto = 'lettura del testo non riuscita';
        }
    }

    let usati = 0;
    for (const a of D.trovaAllegati(struttura)) {
        const voce = { nome: nomeFile(a.nome), dimensione: a.dimensione, allegato: false, motivo: '' };
        out.allegati.push(voce);
        if (opz.senzaAllegati) { voce.motivo = 'non allegato'; continue; }
        if (!a.parte) { voce.motivo = 'non allegato'; continue; }
        if (out.file.length >= MAX_ALLEGATI) { voce.motivo = 'troppi'; continue; }
        if (usati + (a.dimensione || 0) > MAX_ALLEGATI_BYTE) { voce.motivo = 'grande'; continue; }
        if (opz.scadenza && Date.now() > opz.scadenza) { voce.motivo = 'non allegato'; continue; }
        try {
            const sc = await scaricaParte(client, uid, a, MAX_ALLEGATI_BYTE + 1);
            viva();
            if (!sc || sc.tagliato) { voce.motivo = sc ? 'grande' : 'non allegato'; continue; }
            usati += Math.max(sc.buf.length, a.dimensione || 0);
            out.file.push({ filename: voce.nome, content: sc.buf, contentType: a.tipo || 'application/octet-stream' });
            voce.allegato = true;
            voce.dimensione = sc.buf.length;   // quella vera, non quella codificata
        } catch (e) {
            if (client.usable === false) throw e;
            voce.motivo = 'non allegato';
        }
    }
    return out;
}

/* ---------- inoltra ----------
   `opz`: {
     uidValidity  quello della cartella aperta;
     scadenza     oltre quell'istante non si comincia un altro inoltro;
     limiteLettura oltre quell'istante non si scaricano altri allegati;
     limiteInvio  oltre quell'istante non si spedisce: la riga torna in
                  attesa senza consumare il tentativo (la funzione ha un
                  minuto, e una mail partita mentre muore partirebbe due volte);
     limiteFine   la spedizione cominciata deve finire entro quell'istante:
                  oltre, si lascia perdere e la riga si riprova (vedi sotto);
     cartella     la cartella aperta;
     casella      l'indirizzo PEC dello studio (per dire da dove rispondere) }. */
async function inoltra(db, client, opz) {
    opz = opz || {};
    const esito = { inoltrate: 0, fallite: 0, rimaste: 0, abbandonate: 0, motivo: '' };
    if (!postaConfigurata()) { esito.motivo = 'posta non configurata'; return esito; }
    const a = destinatari();
    if (!a.length) { esito.motivo = 'nessun destinatario'; return esito; }

    const ora = Date.now();
    const righe = [];
    const [attesa, prese] = await Promise.all([
        db.collection(COLL).where('stato', '==', 'da-inviare').limit(LETTE_PER_GIRO).get(),
        db.collection(COLL).where('stato', '==', 'in-invio').limit(LETTE_PER_GIRO).get()
    ]);
    attesa.forEach(d => { const x = d.data() || {}; if (libera(x, ora)) righe.push({ id: d.id, d: x }); });
    prese.forEach(d => { const x = d.data() || {}; if (libera(x, ora)) righe.push({ id: d.id, d: x }); });
    righe.sort((x, y) => (x.d.quando || 0) - (y.d.quando || 0));

    let posta = null;
    try {
        for (const r of righe.slice(0, MAX_PER_GIRO)) {
            if ((opz.scadenza && Date.now() > opz.scadenza) || (client && client.usable === false)) { esito.rimaste++; continue; }
            const riga = await prendi(db, r.id);
            if (!riga) continue;
            let sch = {};
            try {
                const snap = await db.collection(SCHEDE).doc((riga.d || riga).scheda || '-').get();
                sch = snap.exists ? (snap.data() || {}) : {};
            } catch (_) { sch = {}; }
            if (riga.abbandonata) {
                await segnaAbbandono(db, riga.d, sch.ragioneSociale, riga.d.errore || 'troppi tentativi');
                esito.abbandonate++;
                continue;
            }
            let letto;
            try {
                letto = await leggiDallaCasella(client, riga, opz.uidValidity,
                    { scadenza: opz.limiteLettura, senzaAllegati: riga.senzaAllegati === true, cartella: opz.cartella });
            } catch (e) {
                const motivo = 'casella: ' + unaRiga((e && (e.responseText || e.message)) || e, 150);
                if (client && client.usable === false) {
                    /* La connessione e' caduta: non e' colpa della posta, il
                       tentativo non si conta. Si riprova fra dieci minuti, e
                       si tiene il conto: un messaggio che fa cadere la
                       connessione ogni volta, alla terza parte senza testo
                       (MAX_CADUTE) invece di bloccare tutti gli altri. */
                    await chiudi(db, r.id, {
                        stato: 'da-inviare', tentativi: riga.tentativi - 1, errore: motivo,
                        cadute: (Number(riga.cadute) || 0) + 1, prossimo: Date.now() + ATTESA_PRIMA_MS
                    });
                    esito.rimaste++;
                    continue;
                }
                /* La casella ha risposto con un errore su QUESTO messaggio: un
                   tentativo come gli altri, con la sua attesa. All'ultimo la
                   mail parte lo stesso, senza testo: una risposta arrivata vale
                   piu' del suo testo mancante. */
                if (riga.tentativi < MAX_TENTATIVI) {
                    await chiudi(db, r.id, { stato: 'da-inviare', errore: motivo, prossimo: Date.now() + attesaDopo(riga.tentativi) });
                    esito.fallite++;
                    continue;
                }
                letto = { testo: '', troncato: false, allegati: [], file: [], nonLetto: ILLEGGIBILE };
            }
            const ev = evento(riga.evento || sch.evento);
            /* "Rispondi" porta a un indirizzo che accetta posta ordinaria, mai
               a una PEC: una casella PEC di norma rifiuta la posta non
               certificata, e la risposta rimbalzerebbe. Se l'azienda ha
               scritto da un indirizzo ordinario (risposta non certificata) si
               risponde li'; altrimenti all'email ordinaria della scheda, se
               c'e' e non e' la stessa PEC. */
            const da = s(riga.da).toLowerCase();
            const pecScheda = s(sch.pec).toLowerCase();
            const ordinaria = elencoIndirizzi(sch.email)[0] || '';
            const rispondiA = riga.certificata === false && da
                ? da
                : (ordinaria && ordinaria !== da && ordinaria !== pecScheda ? ordinaria : '');
            const mail = MNGB.rispostaPec({
                azienda: unaRiga(sch.ragioneSociale, 200),
                da: riga.da, oggetto: riga.oggetto, quandoTesto: quandoTesto(riga.quando),
                certificata: riga.certificata !== false,
                pagina: ev.pagina, eventoNome: ev.nome,
                sponsor: CAMPAGNE.diScheda(sch) === 'sponsor',
                sollecito: s(riga.tipo) === 'sollecito',
                codice: unaRiga(sch.codice || (sch.invio && sch.invio.codice), 40),
                testo: letto.testo, troncato: letto.troncato, nonLetto: letto.nonLetto,
                allegati: letto.allegati, casella: unaRiga(opz.casella, 200),
                rispondiA: rispondiA
            }, LINK_AREA);
            if (opz.limiteInvio && Date.now() > opz.limiteInvio) {
                await chiudi(db, r.id, { stato: 'da-inviare', tentativi: riga.tentativi - 1 });
                esito.rimaste++;
                continue;
            }
            try {
                posta = posta || trasporto();
                const msg = { from: mittente(), to: a.join(', '), subject: unaRiga(mail.oggetto, 300), text: mail.testo, html: mail.html };
                if (rispondiA) msg.replyTo = rispondiA;
                if (letto.file.length) msg.attachments = letto.file;
                await spedisci(posta, msg, opz.limiteFine);
                // mittente e oggetto servivano a spedire: la scheda li ha gia'
                await chiudi(db, r.id, { stato: 'inviata', inviata: Date.now(), a: a.length, errore: null, da: '', oggetto: '' });
                esito.inoltrate++;
            } catch (e) {
                const motivo = 'posta: ' + unaRiga((e && e.message) || e, 150);
                const finita = riga.tentativi >= MAX_TENTATIVI;
                // un trasporto che ha sforato il tempo non si riusa
                if (e && e.tempo) posta = null;
                /* Senza allegati dal tentativo dopo, in due casi soli:
                   - il server di posta ha rifiutato PROPRIO QUESTO messaggio
                     dopo averlo ricevuto (EMESSAGE, 5xx: un allegato che non gli
                     piace). Non una password sbagliata, un indirizzo rifiutato
                     o il comando DATA respinto prima del contenuto: li' gli
                     allegati non c'entrano;
                   - la spedizione non e' finita in tempo con degli allegati
                     dentro. Quella mail potrebbe arrivare lo stesso (nodemailer
                     non interrompe un invio cominciato): la prossima, piu'
                     leggera, non deve fare la stessa fine dieci volte. */
                const rifiuto = letto.file.length > 0 && (
                    (Number(e && e.responseCode) >= 500 && String((e && e.code) || '') === 'EMESSAGE') || !!(e && e.tempo));
                await chiudi(db, r.id, Object.assign(
                    { stato: finita ? 'non-inviata' : 'da-inviare', errore: motivo, prossimo: Date.now() + attesaDopo(riga.tentativi) },
                    rifiuto ? { senzaAllegati: true } : {}));
                // "fallite" sono quelle che si riproveranno; le abbandonate a parte
                if (finita) { esito.abbandonate++; await segnaAbbandono(db, riga, sch.ragioneSociale, motivo); }
                else { esito.fallite++; console.error('Inoltro risposta PEC ' + r.id + ', tentativo ' + riga.tentativi + ':', motivo); }
            }
        }
    } finally {
        if (posta && typeof posta.close === 'function') { try { posta.close(); } catch (_) { } }
    }
    return esito;
}

/* La spedizione con un tempo massimo. I tempi di nodemailer sono di
   INATTIVITA': una posta lenta ma viva puo' andare oltre il minuto della
   funzione. Se il tempo scade la mail forse e' partita e forse no - e
   potrebbe ancora partire: nodemailer non interrompe un invio cominciato.
   La riga torna in attesa e si riprova, senza allegati (meglio un doppione,
   raro, che una risposta persa), e la funzione resta viva per salvare il
   giro. */
function spedisci(posta, msg, limiteFine) {
    const resta = limiteFine ? limiteFine - Date.now() : 0;
    if (!limiteFine) return posta.sendMail(msg);
    if (resta <= 0) { const e = new Error('tempo scaduto prima di spedire'); e.tempo = true; return Promise.reject(e); }
    let timer = null;
    return Promise.race([
        posta.sendMail(msg),
        new Promise((_, rifiuta) => { timer = setTimeout(() => { const e = new Error('la posta non ha finito in tempo'); e.tempo = true; rifiuta(e); }, resta); })
    ]).finally(() => clearTimeout(timer));
}

module.exports = {
    accoda, inoltra, dimentica, ripunta, segnaAbbandono, destinatari, evento, quandoTesto, scaricaParte, testoDiParte,
    COLL, MAX_TENTATIVI, ETA_MAX_MS,
    _interni: { prendi, leggiDallaCasella, idRiga, attesaDopo }
};
