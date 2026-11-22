/* ============================================================
   Circolarizzazioni via PEC: il giro che spedisce
   ------------------------------------------------------------
   Le lettere non partono dal clic di chi le prepara: entrano in
   una coda, e da li' le prende UN giro per volta. E' questo che
   regge piu' persone che inviano nello stesso momento: ognuno
   aggiunge le sue schede, e chi spedisce e' sempre uno solo, con
   una sola connessione alla casella, al ritmo che il gestore PEC
   tollera.

   Il giro parte ogni cinque minuti (vercel.json) e, subito, quando
   qualcuno preme "Invia" nell'area riservata. Prende le schede che
   hanno qualcosa di dovuto ADESSO - la lettera appena caricata, o
   un sollecito arrivato alla sua data - le blocca una per una in
   transazione (lib/circ-dati.js: prendi) e le spedisce.

   TRE FRENI
     - il lucchetto: un giro per volta;
     - il tetto orario (CIRC_MAX_ORA): la casella non e' fatta per
       le raffiche, e un blocco antiabuso fermerebbe tutti;
     - il rifiuto che riguarda noi (tetto superato, IP bloccato,
       password): il giro si ferma li' e le schede tornano in coda,
       invece di marcarle "errore" una dopo l'altra.

   Un sollecito non parte se nel frattempo e' arrivata la risposta:
   lo controlla `prendi`, nella stessa transazione che lo blocca.
   Per questo, quando il giro e' quello programmato, PRIMA si legge
   la casella (api/circolarizzazioni.js) e poi si spedisce.
   ============================================================ */
'use strict';

const nodemailer = require('nodemailer');
const C = require('./circ-comune');
const DATI = require('./circ-dati');

const LUCCHETTO_MS = 6 * 60 * 1000;
function docGiro(db) { return db.collection('meta').doc('circGiro'); }
function aspetta(ms) { return ms > 0 ? new Promise(r => setTimeout(r, ms)) : Promise.resolve(); }

function trasporto() {
    const c = C.configurazione();
    return nodemailer.createTransport({
        host: c.smtpHost, port: c.smtpPorta, secure: c.smtpPorta === 465,
        auth: { user: c.utente, pass: c.password },
        // una sola connessione per tutto il giro: i gestori PEC contano le connessioni al minuto
        pool: true, maxConnections: 1, maxMessages: 200,
        connectionTimeout: 20000, greetingTimeout: 20000, socketTimeout: 45000
    });
}
/* Un rifiuto che riguarda NOI e non il destinatario (stessa regola di
   lib/canali-invito.js): insistere non lo migliora, e brucerebbe il resto
   della coda. */
function fermaTutto(e) {
    const testo = String((e && e.message) || '').toLowerCase();
    const codice = String((e && e.responseCode) || '');
    if (/bloccat|blocked|blacklist|spam|abus|too many|rate limit|troppi|quota|not allowed to send|sender denied/.test(testo)) return true;
    if (/^(421|450|451|452)$/.test(codice)) return true;
    if (/(^|[\s:])(421|45[0-2])([\s-]|$)/.test(testo)) return true;
    if (/5\.7\.\d/.test(testo) && /ip|host|client/.test(testo)) return true;
    if (e && (e.code === 'EAUTH' || e.code === 'ECONNECTION' || e.code === 'ETIMEDOUT' || e.code === 'ESOCKET')) return true;
    return false;
}

async function prendiLucchetto(db, chi) {
    return db.runTransaction(async tx => {
        const snap = await tx.get(docGiro(db));
        const d = snap.exists ? (snap.data() || {}) : {};
        const ora = Date.now();
        if (d.lucchetto && d.lucchetto.fino > ora) return { preso: false };
        tx.set(docGiro(db), { lucchetto: { fino: ora + LUCCHETTO_MS, chi: String(chi || '').slice(0, 120) } }, { merge: true });
        return { preso: true, stato: d };
    });
}
async function mollaLucchetto(db, campi) {
    try { await docGiro(db).set(Object.assign({ lucchetto: null }, campi || {}), { merge: true }); }
    catch (_) { /* al massimo scade da solo */ }
}
function chiaveOra(ms) { return new Date(ms).toISOString().slice(0, 13); }

async function stato(db) {
    let d = {};
    try { const s = await docGiro(db).get(); d = s.exists ? (s.data() || {}) : {}; } catch (_) { d = {}; }
    const adesso = chiaveOra(Date.now());
    return {
        ultimoGiro: d.ultimoGiro || null,
        inCorso: !!(d.lucchetto && d.lucchetto.fino > Date.now()),
        inviateNellOra: d.ora === adesso ? (Number(d.inviati) || 0) : 0,
        tettoOrario: C.LIMITI.perOra
    };
}

/* Quante schede hanno qualcosa di dovuto adesso (al massimo `max`). */
async function inAttesa(db, max) {
    const q = await db.collection(DATI.INVII).where('prossimo', '<=', Date.now()).orderBy('prossimo').limit(max || 50).get();
    return q.docs.length;
}

/* Un giro. `opz`: { budgetMs, max, da }. Torna sempre un riepilogo. */
async function giro(db, opz) {
    opz = opz || {};
    const inizio = Date.now();
    if (!C.configurato()) {
        return { ok: false, esito: 'non-configurato', msg: 'La casella PEC delle circolarizzazioni non è configurata (CIRC_PEC_USER e CIRC_PEC_PASS).' };
    }
    const preso = await prendiLucchetto(db, opz.da || 'giro');
    if (!preso.preso) return { ok: true, esito: 'occupato', msg: 'Un invio è già in corso.', inviate: 0, errori: 0 };
    const prima = preso.stato || {};
    const oraChiave = chiaveOra(inizio);
    const giaNellOra = prima.ora === oraChiave ? (Number(prima.inviati) || 0) : 0;
    const budget = Number(opz.budgetMs) || 200000;
    const disponibili = Math.min(Number(opz.max) || C.LIMITI.perGiro, C.LIMITI.perOra - giaNellOra);
    const conto = { inviate: 0, errori: 0, saltate: 0, solleciti: 0 };
    let fermato = '', restanti = false, incarichi = {};

    if (disponibili <= 0) {
        await mollaLucchetto(db);
        return { ok: true, esito: 'tetto', msg: 'Raggiunto il tetto di ' + C.LIMITI.perOra + ' PEC all\'ora: le altre partono nell\'ora successiva.', inviate: 0, errori: 0, restanti: true };
    }

    let posta = null;
    try {
        let lettoreOk = 0, mai = true;
        try {
            const s = await db.collection('meta').doc('circLettore').get();
            const dl = s.exists ? (s.data() || {}) : {};
            lettoreOk = Number(dl.ultimoOk) || 0;
            mai = !dl.uidValidity;
        } catch (_) { lettoreOk = 0; }
        /* La casella non e' mai stata letta: lo si fa adesso, PRIMA di spedire
           la prima PEC. Fissa il punto da cui il lettore partira' (lib/
           circ-lettore.js), e verifica che la lettura funzioni: spedire senza
           poter leggere le ricevute vorrebbe dire non sapere mai se le lettere
           sono arrivate. */
        if (mai) {
            const primo = await require('./circ-lettore').giro(db, { da: 'primo avvio', forza: true, budgetMs: 20000 });
            if (!primo.ok) {
                await mollaLucchetto(db);
                return { ok: false, esito: 'casella', msg: 'Le lettere restano in coda: prima di spedire va letta la casella PEC, e la lettura non è riuscita' + (primo.msg ? ' (' + primo.msg + ')' : '') + '.', inviate: 0, errori: 0, restanti: true };
            }
            lettoreOk = Number(primo.quando) || Date.now();
        }
        // qualcuna in piu' di quante se ne possono spedire: alcune si saltano (risposta arrivata, in verifica)
        const dovute = await db.collection(DATI.INVII).where('prossimo', '<=', inizio).orderBy('prossimo').limit(disponibili + 25).get();
        const mitt = C.configurazione();
        for (const doc of dovute.docs) {
            if (conto.inviate >= disponibili || Date.now() - inizio > budget) { restanti = true; break; }
            const lavoro = await DATI.prendi(db, doc.id, Date.now(), lettoreOk);
            if (lavoro.saltato) { conto.saltate++; continue; }
            const inv = lavoro.invio;
            const allegato = await DATI.leggiAllegato(db, inv.id, (inv.allegato || {}).pezzi || 0);
            if (!allegato || allegato.length !== inv.allegato.dimensione) {
                await DATI.esitoInvio(db, inv.id, lavoro.passo, lavoro.riferimento, { ok: false, msg: 'Il PDF della lettera non si legge più: prepara una nuova lettera.' });
                conto.errori++;
                continue;
            }
            const m = C.messaggio(inv, lavoro.passo);
            if (!posta) posta = trasporto();
            try {
                await posta.sendMail({
                    from: '"' + mitt.nome + '" <' + mitt.mittente + '>',
                    to: inv.pec,
                    subject: m.oggetto, text: m.testo, html: m.html,
                    // il filo per ritrovare le ricevute: il gestore lo ricopia in ognuna
                    messageId: '<' + lavoro.riferimento + '>',
                    headers: { 'X-Circolarizzazione': inv.codice },
                    attachments: [{ filename: inv.allegato.nome, content: allegato, contentType: 'application/pdf' }]
                });
                await DATI.esitoInvio(db, inv.id, lavoro.passo, lavoro.riferimento, { ok: true });
                conto.inviate++;
                if (lavoro.passo !== 'primo') conto.solleciti++;
                incarichi[inv.incaricoId] = 1;
            } catch (e) {
                const testo = String((e && (e.response || e.message)) || 'errore').replace(/\s+/g, ' ').slice(0, 250);
                if (fermaTutto(e)) {
                    await DATI.esitoInvio(db, inv.id, lavoro.passo, lavoro.riferimento, { ok: false, riprova: true, msg: testo });
                    fermato = testo;
                    restanti = true;
                    break;
                }
                await DATI.esitoInvio(db, inv.id, lavoro.passo, lavoro.riferimento, { ok: false, msg: 'Il server PEC ha rifiutato il messaggio: ' + testo });
                conto.errori++;
            }
            await aspetta(C.LIMITI.pausaMs);
        }
        if (!restanti && dovute.docs.length >= disponibili + 25) restanti = true;
    } catch (e) {
        fermato = fermato || String((e && e.message) || 'errore').slice(0, 250);
    } finally {
        if (posta) { try { posta.close(); } catch (_) { /* gia' chiusa */ } }
    }

    const riepilogo = {
        quando: Date.now(), durataMs: Date.now() - inizio, da: String(opz.da || 'giro').slice(0, 120),
        inviate: conto.inviate, solleciti: conto.solleciti, errori: conto.errori, saltate: conto.saltate,
        restanti: restanti, fermato: fermato
    };
    await mollaLucchetto(db, { ora: oraChiave, inviati: giaNellOra + conto.inviate, ultimoGiro: riepilogo });
    return Object.assign({ ok: !fermato, esito: fermato ? 'fermato' : 'ok', msg: fermato ? 'Invio sospeso dal server PEC: ' + fermato + '. Le lettere restano in coda e ripartono da sole.' : '', incarichi: Object.keys(incarichi) }, riepilogo);
}

module.exports = { giro, stato, inAttesa, _interni: { fermaTutto, docGiro } };
