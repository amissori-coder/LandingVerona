/* ============================================================
   Il giro automatico delle mail di conferma (api/conferme-email.js)
   ------------------------------------------------------------
   Agli eventi dove l'iscrizione vale solo dopo la conferma
   dell'email (Milano 2027, lib/iscrizione-verificata.js) una mail con
   il pulsante che non arriva vuol dire un iscritto che non e' iscritto,
   e che di solito non lo sa. Il modulo la spedisce subito, ma puo'
   andare storto in tre modi, e questo giro - ogni dieci minuti - li
   ripara da solo:

     MAI PARTITA   la funzione si e' chiusa dopo aver scritto la scheda
                   e prima di spedire (nessuna `mailConferma`): passati
                   cinque minuti dall'iscrizione, la si spedisce, con
                   l'SMS che sarebbe partito con lei;
     NON PARTITA   il server di posta ha detto no (`mailConferma.ok`
                   falso): si riprova dopo 5 minuti, 30 minuti, 2 ore e
                   12 ore, cinque tentativi in tutto, poi si lascia allo
                   staff (l'area riservata la mostra "mail non inviata");
     PARTITA MA NIENTE CLIC   dopo un giorno dall'ultimo invio riuscito
                   parte UN promemoria: la stessa mail, con "Promemoria:"
                   davanti all'oggetto, e un SMS che dice di cercarla anche
                   fra la posta indesiderata. Uno solo, mai un secondo:
                   resta scritto in `promemoriaConferma`.

   COSA LEGGE. Solo le schede con la bandiera `confermaInAttesa`
   (lib/conferma-email.js spiega chi la scrive e chi la toglie), non
   tutte le iscrizioni. La bandiera si toglie qui quando non c'e' piu'
   niente da fare: confermata, annullata, una scheda che la conferma non
   la chiede (inserita a mano, da un portale, importata), i tentativi
   finiti, il promemoria mandato. Cosi' le schede da guardare restano
   quelle dell'ultimo giorno o poco piu', e duecento per giro bastano.

   IL RECUPERO, UNA VOLTA. Le iscrizioni fatte prima che la bandiera
   esistesse non l'hanno: al primo giro si rilegge l'archivio una volta,
   si mette la bandiera a chi aspetta ancora la conferma, e si segna su
   meta/confermeEmail che e' fatto. Da li' in poi le prende il giro come
   tutte le altre (promemoria compreso, una volta).

   IL TEMPO. Una scheda nuova si comincia solo nei primi 35 secondi dei
   60 della funzione: nel caso peggiore una scheda ne chiede altri venti
   (un server di posta muto fino al suo tempo massimo, poi l'SMS con il
   suo), e una funzione chiusa a meta' lascerebbe una mail partita senza
   la sua traccia. Per questo qui la mail non ha il secondo tentativo
   immediato: riprova il giro, con le sue pause. Quello che resta fuori
   lo prende il giro dopo, dieci minuti piu' tardi.
   ============================================================ */

const admin = require('firebase-admin');
const CONF = require('./conferma-email');
const VERIFICATA = require('./iscrizione-verificata');

const BUDGET_MS = 35 * 1000;
const LIMITE = 200;
// la mail dell'iscrizione parte subito: il giro aspetta che il modulo abbia finito
const PRIMA_ATTESA_MS = 5 * 60 * 1000;
// dopo il primo, secondo, terzo e quarto invio non partito
const PAUSE_MS = [5 * 60 * 1000, 30 * 60 * 1000, 2 * 60 * 60 * 1000, 12 * 60 * 60 * 1000];
const MAX_TENTATIVI = 5;
const PROMEMORIA_DOPO_MS = 24 * 60 * 60 * 1000;
// alzarla rifa' il recupero (vedi in cima) al giro dopo
const VERSIONE_RECUPERO = 1;

function motivo(e) { return String((e && e.message) || e).replace(/[^\s/@'"]+@[^\s/'"]+/g, '<email>').slice(0, 200); }

/* Quando la scheda e' stata scritta: `ricevuto` e' il momento del server
   (Timestamp di Firestore). Una scheda senza, o con un valore che non si
   legge, e' vecchia: non c'e' un modulo che stia ancora lavorando. */
function registrataIl(x) {
    const r = x && x.ricevuto;
    if (r && typeof r.toMillis === 'function') return r.toMillis();
    if (typeof r === 'number') return r;
    if (r && typeof r === 'object') {
        const sec = Number(r.seconds != null ? r.seconds : r._seconds);
        if (sec) return sec * 1000;
    }
    return 0;
}

/* Cosa fare di una scheda con la bandiera, adesso. Una funzione sola e
   senza scritture, cosi' le prove la leggono com'e'. */
function cosaFare(x, ora) {
    if (!VERIFICATA.eventoDi(x && x.pagina)) return { fare: 'togli', perche: 'evento senza conferma' };
    if (!CONF.inAttesaDiConferma(x)) return { fare: 'togli', perche: CONF.confermata(x) ? 'confermata' : 'non in attesa' };
    const m = CONF.mailPerIndirizzo(x);
    if (!m) {
        return ora - registrataIl(x) >= PRIMA_ATTESA_MS ? { fare: 'invia' } : { fare: 'aspetta' };
    }
    if (m.ok !== true) {
        const inv = CONF.invioPerIndirizzo(x);
        const falliti = Math.max(1, inv ? Number(inv.falliti) || 0 : 1);
        if (falliti >= MAX_TENTATIVI) return { fare: 'togli', perche: 'tentativi finiti' };
        const pausa = PAUSE_MS[Math.min(falliti, PAUSE_MS.length) - 1];
        return ora - (Number(m.quando) || 0) >= pausa ? { fare: 'riprova' } : { fare: 'aspetta' };
    }
    if (x.promemoriaConferma) return { fare: 'togli', perche: 'promemoria gia\' mandato' };
    return ora - (Number(m.quando) || 0) >= PROMEMORIA_DOPO_MS ? { fare: 'promemoria' } : { fare: 'aspetta' };
}

async function togli(db, id) {
    await db.collection('iscrizioni').doc(id).set({ confermaInAttesa: admin.firestore.FieldValue.delete() }, { merge: true });
}

/* IL PROMEMORIA, UNO. Prima si scrive che parte (in una transazione, e
   solo se non c'e' gia'), poi si spedisce: due giri che si sovrapponessero
   non ne manderebbero due. Se la mail non parte la bandiera resta, e il giro
   la riprova con le pause di sempre; il promemoria pero' non si ripete. */
async function promemoria(db, id, x) {
    const rif = db.collection('iscrizioni').doc(id);
    const ora = Date.now();
    const prenotato = await db.runTransaction(async tx => {
        const s = await tx.get(rif);
        const y = s.exists ? (s.data() || {}) : null;
        if (!y || y.promemoriaConferma || !CONF.inAttesaDiConferma(y)) return false;
        tx.set(rif, { promemoriaConferma: { quando: ora } }, { merge: true });
        return true;
    });
    if (!prenotato) return { fatto: false };
    const e = await CONF.spedisciConferma(db, id, x, { via: 'promemoria', riprova: false });
    let sms = null;
    if (x.telefonoNumero) {
        const s = await VERIFICATA.smsConfermaEmail(db, { idDoc: id, numero: x.telefonoNumero, email: x.email, tipo: 'promemoria' });
        sms = s.ok === true;
    }
    const patch = { promemoriaConferma: { quando: ora, mail: e.ok === true, sms: sms } };
    if (e.ok) patch.confermaInAttesa = admin.firestore.FieldValue.delete();
    try { await rif.set(patch, { merge: true }); } catch (_) { /* la prenotazione c'e' gia': non si ripete */ }
    return { fatto: true, mail: e.ok === true, sms: sms };
}

/* Il recupero delle iscrizioni di prima della bandiera (vedi in cima). */
async function recupero(db) {
    const rif = db.collection('meta').doc('confermeEmail');
    const s = await rif.get();
    if (s.exists && Number((s.data() || {}).recupero) >= VERSIONE_RECUPERO) return 0;
    const snap = await db.collection('iscrizioni').get();
    const docs = [];
    snap.forEach(d => docs.push(d));
    let batch = db.batch(), nel = 0, segnate = 0;
    for (const d of docs) {
        const x = d.data() || {};
        if (x.confermaInAttesa === true || x.promemoriaConferma) continue;
        if (!VERIFICATA.eventoDi(x.pagina) || !CONF.inAttesaDiConferma(x)) continue;
        batch.set(d.ref, { confermaInAttesa: true }, { merge: true });
        nel++; segnate++;
        if (nel >= 400) { await batch.commit(); batch = db.batch(); nel = 0; }
    }
    if (nel) await batch.commit();
    await rif.set({ recupero: VERSIONE_RECUPERO, recuperoQuando: Date.now(), recuperate: segnate }, { merge: true });
    return segnate;
}

/* Il giro. opz.budget (millisecondi) solo per le prove. Restituisce i
   conti, che l'endpoint rimanda tali e quali (nei log di Vercel). */
async function giro(db, opz) {
    opz = opz || {};
    const scadenza = Date.now() + (Number(opz.budget) || BUDGET_MS);
    const conti = { recuperate: 0, esaminate: 0, inviate: 0, riprovate: 0, promemoria: 0, sms: 0, tolte: 0, aspettano: 0, errori: 0, rimaste: 0 };
    try { conti.recuperate = await recupero(db); }
    catch (e) { console.error('Conferme email: recupero non riuscito:', motivo(e)); }
    const snap = await db.collection('iscrizioni').where('confermaInAttesa', '==', true).limit(LIMITE).get();
    const docs = [];
    snap.forEach(d => docs.push(d));
    for (const d of docs) {
        if (Date.now() >= scadenza) { conti.rimaste++; continue; }
        conti.esaminate++;
        const x = d.data() || {};
        const id = d.id;
        try {
            const c = cosaFare(x, Date.now());
            if (c.fare === 'togli') {
                await togli(db, id);
                conti.tolte++;
            } else if (c.fare === 'aspetta') {
                conti.aspettano++;
            } else if (c.fare === 'invia' || c.fare === 'riprova') {
                const e = await CONF.spedisciConferma(db, id, x, { via: 'automatico', riprova: false });
                conti[c.fare === 'invia' ? 'inviate' : 'riprovate']++;
                if (!e.ok) conti.errori++;
                /* Mai partita: con lei non era partito nemmeno l'SMS che la
                   accompagna. Parte adesso, una volta (chi riprova dopo un
                   errore l'SMS l'ha gia' avuto, con la notizia del ritardo). */
                if (c.fare === 'invia' && !x.smsConferma && x.telefonoNumero) {
                    const s = await VERIFICATA.smsConfermaEmail(db, {
                        idDoc: id, numero: x.telefonoNumero, email: x.email, tipo: e.ok ? 'inviata' : 'non-inviata'
                    });
                    if (s.ok) conti.sms++;
                }
            } else if (c.fare === 'promemoria') {
                const p = await promemoria(db, id, x);
                if (p.fatto) {
                    conti.promemoria++;
                    if (!p.mail) conti.errori++;
                    if (p.sms) conti.sms++;
                }
            }
        } catch (e) {
            conti.errori++;
            console.error('Conferme email: scheda non lavorata:', motivo(e));
        }
    }
    return conti;
}

module.exports = { giro, cosaFare, registrataIl, recupero, PAUSE_MS, MAX_TENTATIVI, PRIMA_ATTESA_MS, PROMEMORIA_DOPO_MS, LIMITE };
