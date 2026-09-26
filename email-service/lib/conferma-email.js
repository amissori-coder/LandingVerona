/* ============================================================
   Conferma dell'indirizzo email di chi si iscrive
   ------------------------------------------------------------
   La mail di conferma dell'iscrizione porta in cima un pulsante
   "Conferma il tuo indirizzo email": apre /conferma_email/ con
   l'identificativo della scheda e una firma (lib/newsletter.js,
   contesto "conferma-email"), la pagina chiama qui, e sulla scheda
   resta scritto `emailConfermata: { quando, come }`. Nell'area
   riservata quel campo e' il baffetto verde accanto all'indirizzo.

   DUE MODI DI ESSERE CONFERMATI, e il baffetto e' lo stesso:
     come: 'mail'       la persona ha cliccato;
     come: 'pregresso'  iscritta prima che la mail avesse il pulsante.
                        Con quelle persone si e' gia' corrisposto: non
                        vanno disturbate con una richiesta di conferma,
                        e l'amministratore le segna d'ufficio, un
                        evento per volta (conferma-email-pregresso).
   Il suggerimento nell'elenco dice quale dei due.

   PERCHE' LA PAGINA CONFERMA CON UNA POST E NON APRENDOSI. Gli
   antispam aziendali (Safe Links di Outlook, i proxy di sicurezza)
   visitano ogni collegamento della mail prima che la persona lo veda,
   ma non eseguono JavaScript: se bastasse aprire l'indirizzo, ogni
   iscritto risulterebbe confermato da un robot. La conferma parte
   dallo script della pagina, che un robot non esegue.

   IDEMPOTENTE: la seconda apertura non sposta la data della prima, e
   il pregresso non tocca chi ha gia' il campo, in nessuno dei due
   modi. Cosi' l'ordine "pubblica, poi segna il pregresso" e' sicuro
   anche se qualcuno si iscrive nel mezzo.
   ============================================================ */

const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const NL = require('./newsletter');
const MNGB = require('./mail-ngb');
const INVITO = require('./pdf-invito');

/* LA SECONDA MAIL: l'invito. Dopo la conferma parte una mail con l'invito
   in PDF da esibire all'ingresso (per chi segue online, il promemoria che il
   collegamento arriva prima dell'evento). E' quello che rende "confermato"
   una cosa che si ha in mano: la registrazione non e' completa finche' non
   si clicca, e questa mail lo dice.
   I dati dell'evento stanno qui, per titolo del modulo: il servizio non ha
   un posto suo dove leggerli, e un invito senza giorno e indirizzo non e'
   un invito. Un evento che non e' in elenco riceve la mail con il solo
   nome. */
const DETTAGLI_EVENTO = [
    { se: /napoli/i, quando: 'Venerdì 2 ottobre 2026', orario: 'Registrazione dalle 9.00, lavori dalle 9.30 alle 17.30', luogo: 'Hotel Eurostars Excelsior', indirizzo: 'Via Partenope 48, Napoli' }
];
function dettagliEvento(pagina) {
    const d = DETTAGLI_EVENTO.find(x => x.se.test(String(pagina || '')));
    return d ? { quando: d.quando, orario: d.orario, luogo: d.luogo, indirizzo: d.indirizzo } : {};
}
function trasporto() {
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 465,
        secure: (Number(process.env.SMTP_PORT) || 465) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
}
function mittente() {
    const ind = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
    const nome = (process.env.SMTP_FROM_NAME || 'Revilaw S.p.A.').replace(/[\r\n]/g, ' ').slice(0, 80);
    return '"' + nome + '" <' + ind + '>';
}
function adessoInItalia() {
    const f = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
    const p = {};
    f.formatToParts(new Date()).forEach(x => { p[x.type] = x.value; });
    return p.day + '/' + p.month + '/' + p.year + ' ' + p.hour + ':' + p.minute;
}
/* Compone e spedisce l'invito. Restituisce { ok, errore }: se non parte, la
   conferma dell'indirizzo resta valida e l'area riservata puo' rimandarla. */
async function spedisciInvito(idDoc, scheda) {
    const online = String(scheda.modalita || '').toLowerCase() === 'online';
    const evento = dettagliEvento(scheda.pagina);
    const dati = {
        nome: testo(scheda.nome, 120), cognome: testo(scheda.cognome, 120),
        azienda: testo(scheda.azienda, 200), ruolo: testo(scheda.ruolo, 200),
        pagina: scheda.pagina, evento: Object.assign({ titolo: MNGB.nomeEvento(scheda.pagina) }, evento),
        modalita: online ? 'online' : 'presenza'
    };
    const m = MNGB.invitoIngresso(dati, NL.linkCompleta(idDoc));
    const messaggio = { from: mittente(), to: String(scheda.email), subject: m.oggetto, text: m.testo, html: m.html };
    if (!online) {
        const nomeCompleto = (dati.nome + ' ' + dati.cognome).trim();
        messaggio.attachments = [{
            filename: INVITO.nomeFileInvito(nomeCompleto),
            content: INVITO.pdfInvito({ nome: nomeCompleto, azienda: dati.azienda, ruolo: dati.ruolo, evento: dati.evento, online: false, emessoIl: adessoInItalia() }),
            contentType: 'application/pdf'
        }];
    }
    try {
        await trasporto().sendMail(messaggio);
        return { ok: true };
    } catch (e) {
        const motivo = String((e && e.message) || e).slice(0, 200);
        console.error('Invito a', scheda.email, 'non inviato:', motivo);
        return { ok: false, errore: motivo };
    }
}

function testo(v, max) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 200);
}
function chiave(s) {
    return String(s == null ? '' : s).trim().toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

async function segnaCambiamento(db) {
    try {
        await db.collection('meta').doc('iscrizioni')
            .set({ rev: admin.firestore.FieldValue.increment(1), quando: Date.now() }, { merge: true });
    } catch (e) { /* la lettura ha comunque una scadenza a tempo */ }
}

/* --- il freno, per scheda ---
   Non per indirizzo IP: dieci persone dello stesso ufficio devono poter
   confermare nello stesso minuto. Per scheda, perche' l'unico abuso
   possibile e' martellare lo stesso collegamento. */
const RL_MS = 10 * 60 * 1000;
const RL_MAX = 20;
const tentativi = new Map();
function troppi(idDoc) {
    const ora = Date.now();
    const elenco = (tentativi.get(idDoc) || []).filter(t => ora - t < RL_MS);
    if (elenco.length >= RL_MAX) { tentativi.set(idDoc, elenco); return true; }
    elenco.push(ora);
    tentativi.set(idDoc, elenco);
    if (tentativi.size > 500) {
        for (const [k, v] of tentativi) {
            if (!v.length || ora - v[v.length - 1] > RL_MS) tentativi.delete(k);
        }
    }
    return false;
}

/* ---------- azione "conferma-email" (pubblica, dalla pagina) ---------- */
async function conferma(db, body) {
    const idDoc = testo((body || {}).d, 400);
    const token = testo((body || {}).t, 80);
    if (!idDoc || !token || !NL.firmaConfermaEmailValida(idDoc, token)) {
        return { stato: 403, corpo: { ok: false, msg: 'Collegamento non valido.' } };
    }
    if (troppi(idDoc)) return { stato: 429, corpo: { ok: false, msg: 'Troppi tentativi ravvicinati: riprova fra qualche minuto.' } };

    const rif = db.collection('iscrizioni').doc(idDoc);
    const snap = await rif.get();
    if (!snap.exists) return { stato: 404, corpo: { ok: false, msg: 'Iscrizione non trovata.' } };
    const scheda = snap.data() || {};
    /* Una scheda-partecipante senza un indirizzo suo non ha niente da
       confermare: l'indirizzo e' dell'intestatario, e lo conferma lui
       dalla sua mail. */
    if (!scheda.email) return { stato: 400, corpo: { ok: false, msg: 'Questa iscrizione non ha un indirizzo email da confermare.' } };

    const nome = testo(scheda.nome, 120);
    const evento = MNGB.nomeEvento(scheda.pagina);
    const prima = scheda.emailConfermata;
    if (prima && typeof prima === 'object' && prima.quando) {
        return { stato: 200, corpo: { ok: true, gia: true, quando: prima.quando, nome: nome, evento: evento } };
    }
    const quando = Date.now();
    await rif.set({ emailConfermata: { quando: quando, come: 'mail' } }, { merge: true });
    await segnaCambiamento(db);
    // la seconda mail, con l'invito: parte una volta, alla prima conferma
    const invito = await spedisciInvito(idDoc, scheda);
    try {
        await rif.set({ mailInvito: { quando: Date.now(), ok: invito.ok === true, errore: testo(invito.errore, 200) } }, { merge: true });
    } catch (e) { /* informazione, non condizione */ }
    return { stato: 200, corpo: { ok: true, gia: false, quando: quando, nome: nome, evento: evento, invito: invito.ok === true, online: String(scheda.modalita || '').toLowerCase() === 'online' } };
}

/* ---------- azione "conferma-email-pregresso" (area riservata, amministratore) ----------
   Tutte le schede dell'evento senza il campo, a lotti: `filtro` e' la parola
   con cui l'area riservata riconosce l'evento nel titolo del modulo
   ("napoli"), cosi' si prendono anche le schede inserite a mano, che hanno
   il titolo corto. `da` e' chi lancia. */
async function pregresso(db, opz) {
    const filtro = chiave((opz || {}).filtro);
    if (!filtro) return { stato: 400, corpo: { ok: false, msg: 'Evento mancante.' } };
    const snap = await db.collection('iscrizioni').get();
    const quando = Date.now();
    const patch = { emailConfermata: { quando: quando, come: 'pregresso', da: testo((opz || {}).da, 200) } };
    let batch = db.batch(), nel = 0, segnate = 0, giaFatte = 0;
    const docs = [];
    snap.forEach(d => docs.push(d));
    for (const d of docs) {
        const v = d.data() || {};
        if (chiave(v.pagina).indexOf(filtro) < 0) continue;
        if (v.emailConfermata && typeof v.emailConfermata === 'object' && v.emailConfermata.quando) { giaFatte++; continue; }
        batch.set(d.ref, patch, { merge: true });
        nel++; segnate++;
        if (nel >= 400) { await batch.commit(); batch = db.batch(); nel = 0; }
    }
    if (nel) await batch.commit();
    if (segnate) await segnaCambiamento(db);
    return { stato: 200, corpo: { ok: true, segnate: segnate, giaConfermate: giaFatte } };
}

/* ---------- la mail di conferma, rispedita dall'area riservata ----------
   Stessa mail dell'iscrizione dal sito, stesso collegamento firmato: la
   compone il servizio (l'endpoint dell'area riservata riceve HTML pronto
   per le altre mail, ma questa ha un pulsante che dipende da una firma che
   solo il servizio conosce). Restituisce il messaggio da spedire, o null. */
function mailDiConferma(idDoc, scheda) {
    if (!scheda || !scheda.email) return null;
    const m = MNGB.confermaSito({
        nome: scheda.nome, cognome: scheda.cognome, email: scheda.email, azienda: scheda.azienda,
        pagina: scheda.pagina, data: scheda.data, modalita: scheda.modalita || '',
        listaAttesa: scheda.listaAttesa === true
    }, NL.linkCompleta(idDoc), NL.linkConfermaEmail(idDoc));
    return { to: String(scheda.email), subject: m.oggetto, text: m.testo, html: m.html };
}

function confermata(scheda) {
    const c = scheda && scheda.emailConfermata;
    return !!(c && typeof c === 'object' && c.quando);
}

module.exports = { conferma, pregresso, mailDiConferma, spedisciInvito, dettagliEvento, confermata, RL_MAX };
