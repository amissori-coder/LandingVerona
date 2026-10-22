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
              stesso messaggio non si accoda due volte;
     inoltra  a fine giro, con la connessione IMAP ancora aperta, prende
              le righe in attesa, va a leggere il messaggio nella casella
              e spedisce. Se la posta non parte, la riga torna in attesa e
              il giro dopo (un quarto d'ora) riprova, fino a cinque volte.
   Una riga si "prende" con una transazione prima di spedire, e la presa
   scade da sola: due giri sovrapposti non mandano la stessa mail due
   volte, e una funzione morta a meta' non blocca la riga per sempre.

   SU FIRESTORE NON VA IL TESTO, per la stessa ragione per cui non ci va
   per il lettore: quella casella e' corrispondenza dello studio. Nella
   riga ci sono solo le coordinate (uid, mittente, oggetto), le stesse
   che la scheda ha gia'; il testo si legge dalla casella al momento di
   spedire, come quando lo si apre nell'area riservata.

   A CHI: agli stessi destinatari dei riepiloghi di mezzanotte
   (RIEPILOGO_DESTINATARI, o l'elenco in lib/riepilogo-iscrizioni.js),
   a meno che PEC_RISPOSTE_DESTINATARI indichi un elenco suo.
   ============================================================ */

const nodemailer = require('nodemailer');
const D = require('./daticert');
const CAMPAGNE = require('./campagne-invito');
const MNGB = require('./mail-ngb');

const COLL = 'pecInoltri';
const SCHEDE = 'aziendeInvito';
const MAX_TENTATIVI = 5;
const MAX_PER_GIRO = 5;                       // risposte inoltrate al massimo per giro
const ETA_MAX_MS = 30 * 24 * 60 * 60 * 1000;  // piu' vecchie di cosi' non si inoltrano (vedi accoda)
const PRESA_MS = 5 * 60 * 1000;               // quanto vale la presa su una riga
const MAX_LETTURA = 512 * 1024;               // il testo che si scarica dalla casella
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
function destinatari() {
    const propri = elencoIndirizzi(process.env.PEC_RISPOSTE_DESTINATARI);
    if (propri.length) return propri;
    // caricato qui e non in cima: il lettore PEC non deve portarsi dietro
    // tutto il riepilogo delle iscrizioni solo per sapere a chi scrivere
    return require('./riepilogo-iscrizioni').destinatari();
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

/* ---------- accoda ---------- */
function idRiga(dati) {
    const mid = D.chiaveMsgId(dati.messageId);
    if (mid && mid.length >= 4) return 'm~' + mid;
    return 'u~' + s(dati.uidValidity) + '_' + Number(dati.uid);
}
/* Una risposta da inoltrare. Le piu' vecchie di un mese no: capita solo
   quando il lettore rilegge la posta gia' passata (la prima accensione, o
   la casella rigenerata dal gestore), e quelle risposte qualcuno le ha
   gia' viste nell'area riservata. */
async function accoda(db, dati) {
    const ora = Date.now();
    if (dati.quando && dati.quando < ora - ETA_MAX_MS) return { accodata: false, motivo: 'vecchia' };
    const rif = db.collection(COLL).doc(idRiga(dati));
    return db.runTransaction(async tx => {
        const snap = await tx.get(rif);
        if (snap.exists) return { accodata: false, motivo: 'gia-accodata' };
        tx.set(rif, {
            stato: 'da-inviare', tentativi: 0, creato: ora, fino: 0,
            scheda: s(dati.scheda), evento: s(dati.evento),
            uid: Number(dati.uid) || 0, uidValidity: s(dati.uidValidity),
            messageId: s(dati.messageId).slice(0, 400),
            quando: Number(dati.quando) || ora,
            da: unaRiga(dati.da, 200), oggetto: unaRiga(dati.oggetto, 250),
            certificata: !!dati.certificata
        });
        return { accodata: true };
    });
}

/* ---------- la presa e il rilascio ---------- */
async function prendi(db, id) {
    const rif = db.collection(COLL).doc(id);
    return db.runTransaction(async tx => {
        const snap = await tx.get(rif);
        if (!snap.exists) return null;
        const d = snap.data() || {};
        const ora = Date.now();
        const libera = d.stato === 'da-inviare' || (d.stato === 'in-invio' && (Number(d.fino) || 0) < ora);
        if (!libera) return null;
        /* I tentativi si contano alla PRESA, non all'errore: una funzione
           che muore a meta' invio non arriva a scrivere l'errore, e senza
           questo conto riproverebbe per sempre. */
        const tentativi = (Number(d.tentativi) || 0) + 1;
        if (tentativi > MAX_TENTATIVI) {
            tx.set(rif, { stato: 'non-inviata', fino: 0 }, { merge: true });
            return null;
        }
        tx.set(rif, { stato: 'in-invio', fino: ora + PRESA_MS, tentativi: tentativi }, { merge: true });
        return Object.assign({}, d, { tentativi: tentativi });
    });
}
async function chiudi(db, id, campi) {
    try { await db.collection(COLL).doc(id).set(Object.assign({ fino: 0 }, campi), { merge: true }); }
    catch (_) { /* la presa scade da sola: al massimo si riprova */ }
}

/* ---------- la lettura dalla casella ---------- */
function leggiBuffer(stream, max) {
    return new Promise((risolvi, rifiuta) => {
        const pezzi = []; let letti = 0, finito = false;
        stream.on('data', p => {
            letti += p.length;
            pezzi.push(p);
            if (letti > max) { stream.destroy(); if (!finito) { finito = true; risolvi(Buffer.concat(pezzi).slice(0, max)); } }
        });
        stream.on('end', () => { if (!finito) { finito = true; risolvi(Buffer.concat(pezzi)); } });
        stream.on('error', e => { if (!finito) { finito = true; rifiuta(e); } });
    });
}
function nomeFile(v) {
    const n = unaRiga(v, 120).replace(/[\/\\]/g, '-');
    return n || 'allegato';
}
/* Il messaggio dalla casella: testo e allegati. Torna `nonLetto` (il
   motivo) quando il testo non c'e', e la mail parte lo stesso, dicendolo:
   una risposta arrivata vale piu' del suo testo mancante. Se invece cade
   la CONNESSIONE l'errore sale, e la riga si riprova al giro dopo. */
async function leggiDallaCasella(client, riga, uidValidity) {
    const vuoto = motivo => ({ testo: '', troncato: false, allegati: [], file: [], nonLetto: motivo });
    if (!client) return vuoto('casella non aperta');
    if (s(riga.uidValidity) !== s(uidValidity)) return vuoto('la cartella della casella è stata rigenerata');
    const uid = Number(riga.uid) || 0;
    if (!uid) return vuoto('messaggio non indicato');
    let trovato = null;
    for await (const m of client.fetch({ uid: uid + ':' + uid },
        { uid: true, size: true, bodyStructure: true }, { uid: true })) {
        if (Number(m.uid) === uid) trovato = m;
    }
    if (!trovato) return vuoto('il messaggio non è più nella casella');

    const out = { testo: '', troncato: false, allegati: [], file: [], nonLetto: '' };
    const parte = D.trovaLeggibile(trovato.bodyStructure);
    if (parte) {
        try {
            const sc = await client.download(uid, parte.parte, { uid: true, maxBytes: MAX_LETTURA });
            if (sc && sc.content) {
                /* Il gioco di caratteri e' quello che dice lo SCARICAMENTO:
                   imapflow converte da se' in UTF-8 il testo delle parti in
                   linea, e ridecodificarlo con quello dichiarato dal mittente
                   (iso-8859-1) trasformerebbe ogni "e'" in "Ã¨". */
                let t = D.decodificaTesto(await leggiBuffer(sc.content, MAX_LETTURA), (sc.meta && sc.meta.charset) || parte.gioco);
                if (parte.html) t = D.testoDaHtml(t);
                t = t.replace(/\r\n?/g, '\n').trim();
                out.troncato = parte.dimensione > MAX_LETTURA || t.length > MAX_TESTO_MAIL;
                out.testo = t.slice(0, MAX_TESTO_MAIL);
            }
        } catch (e) {
            if (client.usable === false) throw e;
            out.nonLetto = 'lettura del testo non riuscita';
        }
    }

    let usati = 0;
    for (const a of D.trovaAllegati(trovato.bodyStructure)) {
        const voce = { nome: nomeFile(a.nome), dimensione: a.dimensione, allegato: false };
        out.allegati.push(voce);
        if (!a.parte || out.file.length >= MAX_ALLEGATI || usati + (a.dimensione || 0) > MAX_ALLEGATI_BYTE) continue;
        try {
            const sc = await client.download(uid, a.parte, { uid: true, maxBytes: MAX_ALLEGATI_BYTE });
            if (!sc || !sc.content) continue;
            const buf = await leggiBuffer(sc.content, MAX_ALLEGATI_BYTE + 1);
            if (buf.length > MAX_ALLEGATI_BYTE) continue;
            usati += Math.max(buf.length, a.dimensione || 0);
            out.file.push({ filename: voce.nome, content: buf, contentType: (sc.meta && sc.meta.contentType) || a.tipo || 'application/octet-stream' });
            voce.allegato = true;
        } catch (e) {
            if (client.usable === false) throw e;
        }
    }
    return out;
}

/* ---------- inoltra ----------
   `opz`: { uidValidity: quello della cartella aperta, scadenza: oltre
   quell'istante non si comincia un altro inoltro, casella: l'indirizzo PEC
   dello studio (per dire da dove rispondere) }. */
async function inoltra(db, client, opz) {
    opz = opz || {};
    const esito = { inoltrate: 0, fallite: 0, rimaste: 0, motivo: '' };
    if (!postaConfigurata()) { esito.motivo = 'posta non configurata'; return esito; }
    const a = destinatari();
    if (!a.length) { esito.motivo = 'nessun destinatario'; return esito; }

    const ora = Date.now();
    const righe = [];
    const [attesa, prese] = await Promise.all([
        db.collection(COLL).where('stato', '==', 'da-inviare').limit(MAX_PER_GIRO).get(),
        db.collection(COLL).where('stato', '==', 'in-invio').limit(MAX_PER_GIRO).get()
    ]);
    attesa.forEach(d => righe.push({ id: d.id, d: d.data() || {} }));
    prese.forEach(d => { const x = d.data() || {}; if ((Number(x.fino) || 0) < ora) righe.push({ id: d.id, d: x }); });
    righe.sort((x, y) => (x.d.quando || 0) - (y.d.quando || 0));

    let posta = null;
    try {
        for (const r of righe.slice(0, MAX_PER_GIRO)) {
            if ((opz.scadenza && Date.now() > opz.scadenza) || (client && client.usable === false)) { esito.rimaste++; continue; }
            const riga = await prendi(db, r.id);
            if (!riga) continue;
            let letto;
            try {
                letto = await leggiDallaCasella(client, riga, opz.uidValidity);
            } catch (e) {
                // la connessione e' caduta: la riga torna in attesa e si riprova al giro dopo
                await chiudi(db, r.id, { stato: 'da-inviare', errore: 'casella: ' + unaRiga((e && e.message) || e, 150) });
                esito.rimaste++;
                continue;
            }
            let sch = {};
            try {
                const snap = await db.collection(SCHEDE).doc(riga.scheda).get();
                sch = snap.exists ? (snap.data() || {}) : {};
            } catch (_) { sch = {}; }
            const ev = evento(riga.evento || sch.evento);
            /* "Rispondi" porta all'email ORDINARIA dell'azienda, se la scheda
               ce l'ha, e mai alla sua PEC: una casella PEC di norma rifiuta la
               posta che non e' certificata, e la risposta rimbalzerebbe. */
            const ordinaria = elencoIndirizzi(sch.email)[0] || '';
            const rispondiA = ordinaria && ordinaria !== String(riga.da || '').toLowerCase() ? ordinaria : '';
            const mail = MNGB.rispostaPec({
                azienda: unaRiga(sch.ragioneSociale, 200),
                da: riga.da, oggetto: riga.oggetto, quandoTesto: quandoTesto(riga.quando),
                certificata: riga.certificata !== false,
                pagina: ev.pagina, eventoNome: ev.nome,
                sponsor: CAMPAGNE.diScheda(sch) === 'sponsor',
                codice: unaRiga(sch.codice || (sch.invio && sch.invio.codice), 40),
                testo: letto.testo, troncato: letto.troncato, nonLetto: letto.nonLetto,
                allegati: letto.allegati, casella: unaRiga(opz.casella, 200),
                rispondiA: rispondiA
            }, LINK_AREA);
            try {
                posta = posta || trasporto();
                const msg = { from: mittente(), to: a.join(', '), subject: unaRiga(mail.oggetto, 300), text: mail.testo, html: mail.html };
                if (rispondiA) msg.replyTo = rispondiA;
                if (letto.file.length) msg.attachments = letto.file;
                await posta.sendMail(msg);
                await chiudi(db, r.id, { stato: 'inviata', inviata: Date.now(), a: a.length, errore: null });
                esito.inoltrate++;
            } catch (e) {
                const finita = riga.tentativi >= MAX_TENTATIVI;
                await chiudi(db, r.id, { stato: finita ? 'non-inviata' : 'da-inviare', errore: 'posta: ' + unaRiga((e && e.message) || e, 150) });
                esito.fallite++;
                console.error('Inoltro risposta PEC ' + r.id + (finita ? ' abbandonato' : '') + ':', unaRiga((e && e.message) || e, 200));
            }
        }
    } finally {
        if (posta && typeof posta.close === 'function') { try { posta.close(); } catch (_) { } }
    }
    return esito;
}

module.exports = {
    accoda, inoltra, destinatari, evento, quandoTesto,
    COLL, MAX_TENTATIVI, ETA_MAX_MS,
    _interni: { prendi, leggiDallaCasella, idRiga }
};
