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
const NL = require('./newsletter');
const MNGB = require('./mail-ngb');

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
    return { stato: 200, corpo: { ok: true, gia: false, quando: quando, nome: nome, evento: evento } };
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

module.exports = { conferma, pregresso, mailDiConferma, confermata, RL_MAX };
