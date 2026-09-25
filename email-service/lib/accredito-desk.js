/* ============================================================
   Accredito dal QR al desk (chi arriva in sala senza iscrizione)
   ------------------------------------------------------------
   Il giorno del convegno al desk c'e' un cartello con un QR. Chi lo
   inquadra apre /p26/ dal proprio telefono e:

     1. dice chi e' (email, oppure nome e cognome);
     2. se risulta GIA' ISCRITTO, con un tocco si segna presente:
        niente modulo da ricompilare;
     3. se non risulta, compila il questionario - lo stesso del sito -
        e la presenza e' segnata nella stessa richiesta.

   Le due azioni di questo modulo ("presenza-cerca" e "presenza-segna")
   passano da /api/iscrizione-nuova, l'endpoint pubblico che ha gia'
   il freno per indirizzo IP e lo smistamento per azione: sono dello
   stesso genere delle cene e delle richieste di contatto, e una porta
   sola da tenere chiusa e' meglio di due.

   PERCHE' UNA CHIAVE. "Segnami presente" e "dimmi se questo indirizzo
   e' iscritto" NON possono essere aperti a chiunque conosca
   l'indirizzo del servizio: il primo altererebbe le presenze da casa,
   il secondo sarebbe un oracolo per scoprire chi viene al convegno
   provando indirizzi a caso. Il QR porta nell'indirizzo una chiave
   (#k=...) che il servizio confronta con PRESENZA_NAPOLI_CHIAVE:
   senza quella, tutto risponde "non trovato" e non scrive niente. La
   chiave e' stampata su un cartello in sala, quindi la protezione e'
   quella di un cartello: basta, insieme al fatto che le azioni
   funzionano SOLO dal 25 settembre al 3 ottobre (fuso di Roma).

   COSA SI RISPONDE. Il minimo per dire "sei tu?": nome, cognome e
   azienda - quello che e' comunque stampato sul badge. Mai l'email,
   mai il telefono. La scheda trovata non viaggia con il suo
   identificativo (contiene l'indirizzo email): viaggia con un
   riferimento cieco, l'impronta dell'identificativo, e la seconda
   azione lo ritrova da quella. Chi ha cercato per nome non scopre
   cosi' con quale indirizzo si e' iscritta la persona.

   DOVE SI SCRIVE. Nella collezione "presenze", con lo stesso nome di
   documento che compone /api/presenze ("evento~idIscritto"): la
   sezione Eventi dell'area riservata legge quella, e una presenza
   scritta con un nome diverso sarebbe di nessuno. Chi era iscritto
   per la diretta online e si presenta in sala passa in "presenza":
   e' in sala, e il posto che occupa va contato.
   ============================================================ */

const crypto = require('crypto');
const admin = require('firebase-admin');
const C = require('./copia-iscrizioni');

/* Gli eventi che accettano l'accredito dal desk, con la finestra in cui le
   azioni sono aperte. L'identificativo e' quello della sezione Eventi
   dell'area riservata: e' con quello che si compone il documento delle
   presenze. "pagina" e' il titolo del modulo con cui le iscrizioni dal
   telefono finiscono nella stessa lista di quelle del sito. */
const EVENTI = {
    'napoli-2026-10-02': {
        pagina: 'Napoli 2 Ottobre 2026 - Manifestazione di interesse',
        filtro: 'napoli',
        dal: '2026-09-25',   // aperto in anticipo per le prove con il cartello stampato
        al: '2026-10-03'
    }
};
const EVENTO_PREDEFINITO = 'napoli-2026-10-02';

/* L'etichetta nella colonna "Portale" dell'elenco: e' l'unico segno, in
   tabella, che la persona si e' registrata in sala e non da casa. Deve
   restare uguale a quella che conta l'area riservata. */
const PORTALE_DESK = 'Desk (QR)';
const ORIGINE = 'qr-desk';

function testo(v, max) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 200);
}
// stessa normalizzazione dell'elenco e delle presenze: minuscolo, senza accenti
function chiave(s) {
    return String(s == null ? '' : s).trim().toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '');
}
// come lo compone /api/presenze: "evento~idIscritto", senza i caratteri vietati
function idDocPresenza(evento, idIscritto) {
    return (evento + '~' + idIscritto).replace(/[\/\\.#$\[\]]/g, '-').slice(0, 400);
}
/* L'identificativo dell'iscritto come lo costruisce l'elenco (api/iscrizioni):
   email in minuscolo - o nome.cognome - piu' la data, con la barra in mezzo.
   E' la chiave con cui l'area riservata abbina scheda e presenza. */
function idIscrittoDi(v) {
    const em = chiave(v.email);
    return (em || (chiave(v.nome) + '.' + chiave(v.cognome))) + '|' + String(v.data || '');
}
// il riferimento cieco con cui la scheda torna alla seconda azione
function impronta(idIscritto) {
    return crypto.createHash('sha256').update(String(idIscritto)).digest('hex').slice(0, 24);
}

function eventoDa(body) {
    const id = testo((body || {}).evento, 60) || EVENTO_PREDEFINITO;
    return EVENTI[id] ? Object.assign({ id: id }, EVENTI[id]) : null;
}

/* La chiave del cartello. Confronto a tempo costante sulle impronte: la
   lunghezza di quello che arriva non deve dire nulla di quella giusta. Senza
   variabile impostata NON esiste una chiave buona: e' il modo di tenere
   spento tutto fino a quando chi organizza non la sceglie. */
function chiaveBuona(data) {
    const giusta = String(process.env.PRESENZA_NAPOLI_CHIAVE || '').trim();
    const data2 = testo(data, 80);
    if (!giusta || !data2) return false;
    const a = crypto.createHash('sha256').update(giusta).digest();
    const b = crypto.createHash('sha256').update(data2).digest();
    return crypto.timingSafeEqual(a, b);
}

// "aaaa-mm-gg" di ADESSO nel fuso di Roma: il server sta su UTC
function giornoRoma(quando) {
    const f = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' });
    const p = {};
    f.formatToParts(new Date(quando == null ? Date.now() : quando)).forEach(x => { p[x.type] = x.value; });
    return p.year + '-' + p.month + '-' + p.day;
}
function oraRoma(quando) {
    const f = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
    const p = {};
    f.formatToParts(new Date(quando == null ? Date.now() : quando)).forEach(x => { p[x.type] = x.value; });
    return p.day + '/' + p.month + ' ' + p.hour + ':' + p.minute;
}
function aperto(ev, quando) {
    const g = giornoRoma(quando);
    return g >= ev.dal && g <= ev.al;
}

/* La guardia comune alle due azioni e all'iscrizione dal desk: evento
   conosciuto, chiave giusta, giorni giusti. Risponde con lo stesso "non
   trovato" in ogni caso: a chi prova senza chiave non si spiega cosa manca. */
function guardia(body) {
    const ev = eventoDa(body);
    if (!ev) return { ok: false, motivo: 'evento' };
    if (!chiaveBuona((body || {}).chiave)) return { ok: false, motivo: 'chiave' };
    if (!aperto(ev)) return { ok: false, motivo: 'chiuso' };
    return { ok: true, ev: ev };
}
// e' un'iscrizione arrivata dal telefono al desk, con la chiave del cartello?
function dalDesk(body) {
    return !!(body && String(body.origine || '') === ORIGINE) && guardia(body).ok;
}

/* Le schede dell'evento, dall'archivio condiviso (stessa lettura dell'area
   riservata: memoria per istanza, copia compressa su Firestore, rilettura
   solo se qualcuno ha scritto). Si tengono le iscrizioni la cui pagina
   contiene il filtro dell'evento - "Napoli 2 Ottobre 2026" con o senza
   "Manifestazione di interesse", perche' le schede inserite a mano hanno il
   titolo corto - e si tolgono quelle cancellate da chi organizza. */
async function schedeEvento(db, ev) {
    const arch = await C.archivio(db);
    const cancellate = {};
    (arch.cancellate || []).forEach(v => { if (v && v.evento === ev.id && v.idIscritto) cancellate[v.idIscritto] = true; });
    const presenze = {};
    (arch.presenze || []).forEach(v => { if (v && v.evento === ev.id && v.idIscritto) presenze[v.idIscritto] = v; });
    const righe = [];
    (arch.iscrizioni || []).forEach(v => {
        if (!v || chiave(v.pagina).indexOf(ev.filtro) < 0) return;
        if (v.annullata === true) return;   // annullata dall'intestatario, dal modulo "completa i dati"
        const id = idIscrittoDi(v);
        if (cancellate[id]) return;
        righe.push({ id: id, scheda: v, presenza: presenze[id] || null });
    });
    return righe;
}

/* La sezione in cui la persona si trova DAVVERO: la scelta di chi organizza
   (fra le presenze) vince su quello che ha dichiarato il modulo, e il vuoto
   vale in presenza - come legge l'area riservata. */
function modalitaEffettiva(r) {
    const p = (r.presenza || {}).modalita;
    const s = (r.scheda || {}).modalita;
    return String(p || s || '').toLowerCase() || 'presenza';
}

function rispostaScheda(r, perNome) {
    return {
        ok: true, trovato: true,
        rif: impronta(r.id),
        nome: testo(r.scheda.nome, 120),
        cognome: testo(r.scheda.cognome, 120),
        azienda: testo(r.scheda.azienda, 200),
        modalita: modalitaEffettiva(r),
        giaPresente: String((r.presenza || {}).stato || '') === 'presente',
        perNome: !!perNome
    };
}

/* ---------- presenza-cerca ---------- */
async function cerca(db, body) {
    const g = guardia(body);
    if (!g.ok) return { stato: 200, corpo: { ok: true, trovato: false } };
    const email = chiave(body.email);
    const nome = chiave(body.nome), cognome = chiave(body.cognome);
    if (!email && !(nome && cognome)) return { stato: 400, corpo: { ok: false, msg: 'Scrivi la tua email, oppure nome e cognome.' } };

    const righe = await schedeEvento(db, g.ev);
    let trovata = null, perNome = false;
    if (email) {
        const stesse = righe.filter(r => chiave(r.scheda.email) === email);
        // piu' schede con lo stesso indirizzo: si preferisce quella gia' in
        // presenza, poi quella gia' segnata, poi la piu' recente in elenco
        stesse.sort((a, b) => punteggio(b) - punteggio(a));
        trovata = stesse[0] || null;
    }
    if (!trovata && nome && cognome) {
        const stesse = righe.filter(r => chiave(r.scheda.nome) === nome && chiave(r.scheda.cognome) === cognome);
        stesse.sort((a, b) => punteggio(b) - punteggio(a));
        trovata = stesse[0] || null;
        perNome = !!trovata;
    }
    if (!trovata) return { stato: 200, corpo: { ok: true, trovato: false } };
    return { stato: 200, corpo: rispostaScheda(trovata, perNome) };
}
function punteggio(r) {
    let n = 0;
    if (String((r.presenza || {}).stato || '') === 'presente') n += 4;
    const m = modalitaEffettiva(r);
    if (m === 'presenza' || m === 'aderenti' || m === 'sponsor') n += 2;
    if ((r.presenza || {}).stato) n += 1;
    return n;
}

/* ---------- la scrittura della presenza ----------
   Usata sia da presenza-segna sia dall'iscrizione nuova dal desk. Stato
   "presente", la nota che dice da dove viene, e la firma nella forma delle
   presenze (da, daNome, quando), cosi' la colonna "Aggiornato da" la mostra
   come tutte le altre. Chi era online passa in sala. */
async function scriviPresenza(db, ev, r, quando) {
    const rif = db.collection('presenze').doc(idDocPresenza(ev.id, r.id));
    const prima = (r.presenza) || {};
    const riga = 'Accredito QR ' + oraRoma(quando);
    const notaPrima = testo(prima.nota, 1000);
    const patch = {
        evento: ev.id,
        idIscritto: r.id,
        stato: 'presente',
        nota: notaPrima ? (notaPrima.indexOf('Accredito QR') >= 0 ? notaPrima : notaPrima + ' - ' + riga) : riga,
        da: ORIGINE, daNome: 'Accredito QR', quando: quando == null ? Date.now() : quando
    };
    if (modalitaEffettiva(r) === 'online') {
        patch.modalita = 'presenza';
        // la coda per un posto in sala finisce qui: il posto se lo e' preso
        if (prima.listaAttesa !== undefined) patch.listaAttesa = admin.firestore.FieldValue.delete();
    }
    await rif.set(patch, { merge: true });
    await segnaCambiamento(db);
}

async function segnaCambiamento(db) {
    try {
        await db.collection('meta').doc('iscrizioni')
            .set({ rev: admin.firestore.FieldValue.increment(1), quando: Date.now() }, { merge: true });
    } catch (e) { /* la lettura ha comunque una scadenza a tempo */ }
}

/* ---------- presenza-segna ---------- */
async function segna(db, body) {
    const g = guardia(body);
    if (!g.ok) return { stato: 200, corpo: { ok: true, trovato: false } };
    const rif = testo(body.rif, 40);
    if (!rif) return { stato: 400, corpo: { ok: false, msg: 'Scheda non indicata.' } };
    const righe = await schedeEvento(db, g.ev);
    const r = righe.find(x => impronta(x.id) === rif);
    if (!r) return { stato: 200, corpo: { ok: true, trovato: false } };
    if (String((r.presenza || {}).stato || '') !== 'presente') await scriviPresenza(db, g.ev, r);
    return { stato: 200, corpo: { ok: true, trovato: true, presente: true, nome: testo(r.scheda.nome, 120), cognome: testo(r.scheda.cognome, 120) } };
}

/* ---------- l'iscrizione nuova, dal telefono al desk ----------
   Chiamata da iscrizione-nuova DOPO aver scritto la scheda: la scheda ha gia'
   il suo identificativo, qui si aggiunge solo la presenza. Se questa parte
   fallisse l'iscrizione resta valida: al desk si segna a mano. */
async function segnaNuova(db, body, scheda) {
    const g = guardia(body);
    if (!g.ok) return false;
    const r = { id: idIscrittoDi(scheda), scheda: scheda, presenza: null };
    await scriviPresenza(db, g.ev, r);
    return true;
}
/* Quello che l'iscrizione dal desk aggiunge alla scheda: la modalita' in
   presenza (la persona e' in sala), il portale che si legge nell'elenco e
   l'origine per chi cerca nel database. */
function completaScheda(scheda) {
    scheda.modalita = 'presenza';
    delete scheda.listaAttesa;
    scheda.origine = ORIGINE;
    scheda.extra = Object.assign({}, scheda.extra || {}, { Portale: PORTALE_DESK });
    return scheda;
}

module.exports = {
    cerca, segna, segnaNuova, completaScheda, dalDesk, guardia, aperto, giornoRoma,
    idIscrittoDi, idDocPresenza, impronta, EVENTI, PORTALE_DESK, ORIGINE
};
