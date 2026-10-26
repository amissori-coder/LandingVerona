/* ============================================================
   La PEC di sollecito della conferma dell'email
   ------------------------------------------------------------
   Un giorno dopo la lettera personale (lib/sollecito-conferma.js), se
   l'indirizzo email non e' ancora confermato, lo stesso testo parte
   per PEC dalla casella PEC dello studio (il canale degli inviti,
   lib/canali-invito.js: PEC_SMTP_*, PEC_FROM_EMAIL) all'indirizzo PEC
   con cui l'azienda e' stata invitata, firmato Revilaw S.p.A. Solo
   testo: una PEC e' una raccomandata, non una pagina.

   A CHI. Alle iscrizioni collegate a un'azienda invitata: la scheda di
   aziendeInvito a cui punta l'iscrizione (`invitoScheda`), o quella a
   cui punta il suo codice, o quella con quel codice (le schede spostate
   prima del 22 ottobre 2026 hanno solo `invio.codice`). Senza un'azienda
   con una PEC non parte niente, e la scheda lo dice (`esclusa`).

   LE RICEVUTE E LE RISPOSTE tornano nella casella PEC, dove le legge il
   lettore (lib/lettore-pec.js): il Message-ID si registra prima di
   spedire, con `tipo: 'sollecito'` e l'iscrizione, cosi' accettazione,
   consegna e risposta finiscono sulla scheda dell'ISCRIZIONE
   (`pecSollecito`), non sull'invito dell'azienda, e la risposta si
   inoltra per email ad Andrea Missori come le risposte agli inviti.

   La manda il giro delle conferme (lib/giro-conferme.js, 'pec'): una per
   scheda, di giorno; un no certo del gestore si riprova dopo mezz'ora,
   tre tentativi; un esito incerto non si ripete. SOLLECITO_PEC=no la
   spegne; senza le credenziali PEC non parte e la scheda esce come prima.
   ============================================================ */
'use strict';
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const CANALI = require('./canali-invito');
const CODICI = require('./codici-invito');
const SOLL = require('./sollecito-conferma');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function spenta() {
    return /^(no|off|0|false|spento|spenta)$/i.test(String(process.env.SOLLECITO_PEC || '').trim());
}
// la PEC si puo' mandare: accesa, e con le credenziali del canale PEC
function configurata() {
    return !spenta() && CANALI.configurato('pec');
}
function mittente() {
    const c = CANALI.configurazione('pec');
    return { email: String(c.mittente || '').toLowerCase(), nome: String(c.nome || 'Revilaw S.p.A.') };
}
/* Il Message-ID con cui si ritrovano le ricevute (come riferimentoNuovo
   degli inviti, con un prefisso suo: nei log si vede che cos'e'). */
function riferimentoNuovo() {
    const dominio = mittente().email.split('@')[1] || 'pec.it';
    return 'sol-' + crypto.randomBytes(8).toString('hex') + '@' + dominio;
}

/* L'azienda invitata di un'iscrizione, con la sua PEC: { id, dati } o
   null. Le strade, in ordine: la scheda scritta sull'iscrizione, quella a
   cui punta il codice, la ricerca per codice (`codice`, poi `invio.codice`). */
async function aziendaDi(db, scheda) {
    const codice = CODICI.valido(scheda && scheda.invitoCodice) ? CODICI.normalizza(scheda.invitoCodice) : '';
    const ids = [];
    if (scheda && scheda.invitoScheda) ids.push(String(scheda.invitoScheda));
    if (codice) {
        try {
            const c = await db.collection('codiciInvito').doc(codice).get();
            const sc = c.exists ? String((c.data() || {}).scheda || '') : '';
            if (sc && ids.indexOf(sc) < 0) ids.push(sc);
        } catch (_) { }
    }
    for (const id of ids) {
        const s = await db.collection('aziendeInvito').doc(id).get();
        if (s.exists) return { id: id, dati: s.data() || {} };
    }
    if (codice) {
        for (const campo of ['codice', 'invio.codice']) {
            const q = await db.collection('aziendeInvito').where(campo, '==', codice).limit(1).get();
            if (q && q.docs && q.docs.length) return { id: q.docs[0].id, dati: q.docs[0].data() || {} };
        }
    }
    return null;
}
function pecDi(azienda) {
    const v = String((azienda && azienda.dati && azienda.dati.pec) || '').trim().toLowerCase();
    return EMAIL_RE.test(v) ? v : '';
}

/* Il trasporto PEC, una connessione sola e con i tempi massimi: la
   funzione ha 60 secondi e il giro ne concede 35 alla fila; una PEC che
   non parte entro una ventina di secondi si riprova al giro dopo. */
function trasporto(extra) {
    const c = CANALI.configurazione('pec');
    return nodemailer.createTransport(Object.assign({
        host: c.host, port: c.porta, secure: c.porta === 465,
        auth: { user: c.utente, pass: c.password },
        connectionTimeout: 12000, greetingTimeout: 12000, socketTimeout: 20000, dnsTimeout: 5000
    }, extra || {}));
}

/* La spedizione: { ok, errore, incerto, canale, messageId, a }, con le
   stesse distinzioni della lettera (lib/sollecito-conferma.js, spedisci).
   Niente "Rispondi": la risposta torna nella casella PEC, dove il lettore
   la riconosce dal Message-ID e la inoltra. */
async function spedisci(scheda, azienda, riferimento) {
    const a = pecDi(azienda);
    if (!a) return { ok: false, errore: 'PEC dell\'azienda mancante', a: '', incerto: false, canale: false };
    const m = SOLL.componi(scheda, { pec: true });
    const mitt = mittente();
    const messaggio = {
        from: '"' + mitt.nome.replace(/[\r\n"<>]/g, ' ').slice(0, 80) + '" <' + mitt.email + '>',
        to: a,
        subject: m.oggetto,
        text: m.testo,
        messageId: '<' + riferimento + '>'
    };
    // a che punto cade la linea lo dice il registro dei comandi (lib/sollecito-conferma.js, tracciatore e classifica)
    const tr = SOLL.tracciatore();
    try {
        const info = await trasporto(tr.opzioni).sendMail(messaggio);
        return { ok: true, errore: '', a: a, incerto: false, canale: false, messageId: String((info && info.messageId) || '').slice(0, 300) };
    } catch (e) {
        const errore = String((e && e.message) || e || 'errore del gestore PEC').slice(0, 200);
        const c = SOLL.classifica(e, tr.traccia);
        console.error('PEC di sollecito non inviata' + (c.incerto ? ' (esito incerto)' : (c.canale ? ' (guasto del canale: ' + String((e && e.command) || e && e.code || '') + ')' : '')) + ':', errore);
        return { ok: false, errore: errore, a: a, incerto: c.incerto, canale: c.canale };
    }
}

module.exports = { spenta, configurata, mittente, riferimentoNuovo, aziendaDi, pecDi, spedisci };
