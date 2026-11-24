/* ============================================================
   Diretta degli eventi: le DOMANDE AL RELATORE
   ------------------------------------------------------------
   Durante un evento online ogni partecipante puo' mandare domande al
   relatore dalla pagina della diretta. Non e' una chat: gli altri
   partecipanti non le vedono MAI. Le vedono:
     - il RELATORE, dalla sua pagina (/diretta/relatore/), insieme
       all'elenco dei partecipanti e a chi e' collegato; segna quelle a
       cui ha risposto («Risposta data»);
     - la REGIA (i gestori, DIRETTA_ADMIN_EMAILS), nella scheda Regia
       della gestione, con lo stesso segno.
   Chi scrive vede solo le PROPRIE domande, e se hanno avuto risposta.

   DOVE STANNO (Firestore del progetto della diretta, SOLO il server):
     domande/{auto}          idEvento, uid, nome, cognome, azienda, email,
                             testo, quando, risposta (vero o falso),
                             rispostaQuando, rispostaDa (chi l'ha segnata)
     relatoriEventi/{id}     email: [gli indirizzi dei relatori], aggiornato,
                             da: li decide la gestione (scheda Evento). Un
                             documento a parte perche' eventiRiservati si
                             riscrive per intero quando cambia il video, e i
                             relatori non devono sparire con lui
     relatoriAccount/{uid}   gli account attivati come relatore (come
                             gestoriAccount per i gestori)
   Nessuna regola nuova di Firestore: tutto passa dal servizio, con la
   chiave del server; per il browser queste raccolte sono chiuse dalla
   regola finale di firestore.rules (tutto il resto: solo il server).

   CHI E' IL RELATORE. Un account di Firebase Auth con la SUA email vera,
   come i gestori (i partecipanti hanno invece un indirizzo tecnico),
   attivato dal servizio con «Primo accesso o password dimenticata» della
   sua pagina (relatore-accesso in lib/diretta-accesso.js), con il claim
   relatore: true e l'email verificata. Il claim da solo non basta: a OGNI
   chiamata l'email deve essere fra i relatori dell'evento chiesto
   (relatoriEventi); togliere un'email dalla scheda Evento chiude subito
   la porta. I gestori passano sempre, su ogni evento.

   QUANTO PESA. Mille partecipanti che scrivono qualche domanda sono
   qualche centinaio di documenti. La pagina del relatore e la regia
   rileggono l'elenco ogni pochi secondi passando dal servizio: una
   lettura per domanda, centesimi per un pomeriggio. Il documento
   dell'evento, quello che mille persone ascoltano, non si tocca mai.
   ============================================================ */
'use strict';
const C = require('./diretta-comune');
const D = require('./diretta-dati');
const E = require('./diretta-email');

const MIN_TESTO = 3;
const MAX_TESTO = 600;
const MAX_RIGHE = 15;
const MAX_RELATORI = 10;
const ORA = 60 * 60 * 1000;
// fra una domanda e l'altra della stessa persona, e quante in un'ora
const PAUSA_FRA_DOMANDE_MS = 8 * 1000;
const DOMANDE_ORA = 20;
const MAX_ELENCO = 5000;
const MAX_MIE = 200;
// si possono mandare prima dell'inizio, in onda e in pausa; non dopo «Termina»
const STATI_APERTI = ['programmato', 'in_onda', 'pausa'];
// collegato = un segnale di presenza negli ultimi 150 secondi (come i «connessi» della regia)
const FINESTRA_COLLEGATI_MS = 150 * 1000;
const RE_ID_DOMANDA = /^[A-Za-z0-9_-]{1,64}$/;

const MSG_DISATTIVATO = 'Il tuo accesso è stato disattivato. Scrivi all\'assistenza.';
const MSG_NON_RELATORE = 'Questo account non è fra i relatori della diretta.';

/* ============================================================
   I RELATORI DI UN EVENTO
   ============================================================ */
function rifRelatori(ctx, idEvento) { return ctx.db.collection('relatoriEventi').doc(idEvento); }

/* L'elenco come lo scrive la gestione: email separate da a capo, spazi,
   virgole o punti e virgola (o gia' un array). Le doppie si tolgono;
   un'email non valida ferma tutto e si dice quale. */
function leggiRelatori(v) {
    const grezzi = Array.isArray(v) ? v : String(v == null ? '' : v).split(/[\s,;]+/);
    const visti = new Set();
    const out = [];
    grezzi.forEach(x => {
        const t = String(x == null ? '' : x).trim();
        if (!t) return;
        const e = E.normalizzaEmail(t);
        if (!E.emailValida(e) || C.eEmailTecnica(e)) throw C.errore(400, 'Email del relatore non valida: «' + t.slice(0, 80) + '».', 'relatori');
        if (visti.has(e)) return;
        visti.add(e);
        out.push(e);
    });
    if (out.length > MAX_RELATORI) throw C.errore(400, 'Al massimo ' + MAX_RELATORI + ' relatori per evento.', 'relatori');
    return out;
}

async function relatoriDi(ctx, idEvento) {
    const s = await rifRelatori(ctx, idEvento).get();
    const l = s.exists ? s.data().email : null;
    return Array.isArray(l) ? l.map(x => String(x)) : [];
}

// gli elenchi di piu' eventi insieme (la gestione li mostra con gli eventi): { idEvento: [email] }
async function relatoriDiEventi(ctx, ids) {
    const out = {};
    if (!ids.length) return out;
    const snaps = await ctx.db.getAll(...ids.map(id => rifRelatori(ctx, id)));
    snaps.forEach((s, i) => { out[ids[i]] = s.exists && Array.isArray(s.data().email) ? s.data().email.map(String) : []; });
    return out;
}

async function salvaRelatori(ctx, { idEvento, relatori }, chi) {
    const id = D.controllaIdEvento(idEvento);
    const lista = leggiRelatori(relatori);
    const ev = await ctx.db.collection('eventi').doc(id).get();
    if (!ev.exists) throw C.errore(404, 'Evento inesistente.', 'evento');
    await rifRelatori(ctx, id).set({ email: lista, aggiornato: D.adessoTs(ctx), da: String(chi || '').slice(0, 254) });
    return lista;
}

// l'email e' fra i relatori di almeno un evento? (il primo accesso del relatore)
async function eRelatore(ctx, email) {
    const e = E.normalizzaEmail(email);
    if (!E.emailValida(e)) return false;
    const snap = await ctx.db.collection('relatoriEventi').where('email', 'array-contains', e).limit(1).get();
    return !snap.empty;
}

/* ============================================================
   CHI CHIAMA
   ============================================================ */
function bearer(req) {
    const m = /^Bearer\s+(.+)$/i.exec(String((req.headers || {}).authorization || ''));
    if (!m) throw C.errore(401, 'Accesso richiesto', 'non-autenticato');
    return m[1];
}
async function tokenDi(ctx, req, controllaRevoca) {
    const t = bearer(req);
    try { return await ctx.auth.verifyIdToken(t, !!controllaRevoca); } catch (e) {
        if (C.tokenNonValido(e)) throw C.errore(401, 'La sessione è scaduta: accedi di nuovo.', 'non-autenticato');
        throw C.errore(503, 'Servizio di accesso momentaneamente non disponibile: riprova tra qualche secondo.', 'riprova');
    }
}

/* Il PARTECIPANTE: gli stessi controlli del link del video (lib/diretta-
   accesso.js, linkVideo): account attivo, iscritto all'evento, e dal
   dispositivo ammesso quando l'evento ne vuole uno solo. */
async function partecipante(ctx, req, b) {
    const tok = await tokenDi(ctx, req, false);
    const idEvento = D.controllaIdEvento(b.idEvento);
    const [snapP, snapS] = await ctx.db.getAll(ctx.db.collection('partecipanti').doc(tok.uid), ctx.db.collection('sessioni').doc(tok.uid));
    if (!snapP.exists) throw C.errore(403, 'Questo account non è un partecipante della diretta.', 'non-partecipante');
    const p = snapP.data();
    const s = snapS.exists ? snapS.data() : null;
    if (p.stato !== 'attivo' || (s && s.stato !== 'attivo')) throw D.errorePubblico(403, 'disattivato', MSG_DISATTIVATO);
    const ammessa = s && typeof s.sessioneAttiva === 'string' && s.sessioneAttiva ? s.sessioneAttiva : null;
    if (ammessa && String(b.sessione || '') !== ammessa) {
        throw D.errorePubblico(403, 'altro-dispositivo', 'La diretta è stata aperta da un altro dispositivo: per mandare domande da qui, accedi di nuovo.');
    }
    if (!Array.isArray(p.eventi) || p.eventi.indexOf(idEvento) < 0) throw D.errorePubblico(403, 'non-iscritto', 'Non risulti iscritto a questa diretta.');
    return { uid: tok.uid, p: p, idEvento: idEvento };
}

/* Il RELATORE (o un gestore): l'account con email e password, l'email
   verificata (la mette il servizio quando lo attiva: chi si registra da
   solo con l'email di un relatore non ce l'ha), il claim e, per l'evento
   chiesto, l'email fra i suoi relatori. Il token si controlla anche
   contro la revoca, come per i gestori. */
async function relatore(ctx, req, idEvento) {
    const tok = await tokenDi(ctx, req, true);
    const email = String(tok.email || '').toLowerCase();
    const provider = tok.firebase && tok.firebase.sign_in_provider;
    if (!email || provider !== 'password' || tok.email_verified !== true) throw C.errore(403, MSG_NON_RELATORE, 'non-relatore');
    if (tok.gestore === true && C.eGestore(email)) return { uid: tok.uid, email: email, ruolo: 'gestore' };
    if (tok.relatore !== true) throw C.errore(403, MSG_NON_RELATORE, 'non-relatore');
    if (idEvento && (await relatoriDi(ctx, idEvento)).indexOf(email) < 0) {
        throw C.errore(403, 'Non risulti fra i relatori di questo evento.', 'non-relatore');
    }
    return { uid: tok.uid, email: email, ruolo: 'relatore' };
}

/* ============================================================
   LE DOMANDE
   ============================================================ */

/* Il testo come lo si salva: niente caratteri di controllo, spazi in
   fila ridotti a uno, al massimo una riga vuota di fila. Resta TESTO:
   le pagine lo mostrano con textContent, mai come HTML. */
function pulisci(v) {
    return String(v == null ? '' : v).replace(/\r\n?/g, '\n')
        .replace(/[\u0000-\u0008\u000b-\u001f\u007f\u2028\u2029]/g, ' ')
        .split('\n').map(r => r.replace(/[ \t\u00a0]+/g, ' ').trim()).join('\n')
        .replace(/\n{3,}/g, '\n\n').trim();
}
function controllaTesto(v) {
    const t = pulisci(v);
    if (t.length < MIN_TESTO) throw C.errore(400, 'Scrivi la tua domanda (almeno ' + MIN_TESTO + ' caratteri).', 'testo');
    if (t.length > MAX_TESTO) throw C.errore(400, 'La domanda è troppo lunga: al massimo ' + MAX_TESTO + ' caratteri.', 'testo');
    if (t.split('\n').length > MAX_RIGHE) throw C.errore(400, 'La domanda ha troppi a capo: scrivila in meno righe.', 'testo');
    return t;
}

/* Le domande si possono mandare se la regia le ha accese per l'evento
   («Domande al relatore» nella scheda Evento: eventi.domande) e la
   diretta non e' terminata: prima dell'inizio, in onda e in pausa. */
function attive(evento) { return !!evento && evento.domande === true; }
function aperte(evento) {
    return attive(evento) && STATI_APERTI.indexOf(evento.stato || 'programmato') >= 0;
}

/* Una domanda come la vedono relatore e regia. L'email di chi l'ha
   scritta e chi l'ha segnata come risposta li vede solo la regia: al
   relatore bastano nome, cognome e azienda. */
function domandaJSON(id, d, perGestione) {
    const out = {
        id: id, idEvento: d.idEvento || '', testo: d.testo || '', quando: D.ms(d.quando),
        nome: d.nome || '', cognome: d.cognome || '', azienda: d.azienda || '',
        risposta: d.risposta === true, rispostaQuando: d.risposta === true ? D.ms(d.rispostaQuando) : null
    };
    if (perGestione) { out.email = d.email || ''; out.rispostaDa = d.risposta === true ? (d.rispostaDa || '') : ''; }
    return out;
}
// una domanda come la vede chi l'ha scritta
function miaJSON(id, d) {
    return { id: id, testo: d.testo || '', quando: D.ms(d.quando), risposta: d.risposta === true };
}
function eventoBreve(id, e) {
    const d = e || {};
    return {
        id: id, titolo: d.titolo || '', luogo: d.luogo || '', data: d.data || '', oraInizio: d.oraInizio || '', oraFine: d.oraFine || '',
        inizio: D.ms(d.inizio), fine: D.ms(d.fine), stato: d.stato || 'programmato', domande: d.domande === true
    };
}
const perOrdine = (a, b) => (a.quando || 0) - (b.quando || 0) || String(a.id).localeCompare(String(b.id));

/* invia: { idEvento, testo, sessione } -> { domanda, aperte }. Il
   partecipante manda una domanda; 409 'domande-chiuse' dopo «Termina»;
   429 'attendi' se scrive troppo in fretta (una ogni 8 secondi, 20
   all'ora). Nome, cognome, azienda ed email si copiano dal profilo: il
   relatore li vede anche se poi il profilo cambia. */
async function invia(ctx, req, b) {
    const chi = await partecipante(ctx, req, b);
    const testo = controllaTesto(b.testo);
    const ev = await ctx.db.collection('eventi').doc(chi.idEvento).get();
    if (!ev.exists) throw C.errore(404, 'Evento inesistente.', 'evento');
    if (!attive(ev.data())) throw D.errorePubblico(409, 'domande-spente', 'Le domande al relatore non sono attive per questa diretta.');
    if (!aperte(ev.data())) throw D.errorePubblico(409, 'domande-chiuse', 'La diretta è terminata: le domande sono chiuse.');
    if (!await C.consumaGettone(ctx, 'limiti', 'domande_' + chi.uid, { pausaMs: PAUSA_FRA_DOMANDE_MS, maxFinestra: DOMANDE_ORA, finestraMs: ORA })) {
        throw D.errorePubblico(429, 'attendi', 'Stai mandando domande troppo in fretta: aspetta qualche secondo e riprova.', { attesaSecondi: Math.ceil(PAUSA_FRA_DOMANDE_MS / 1000) });
    }
    const p = chi.p;
    const rif = ctx.db.collection('domande').doc();
    const dati = {
        idEvento: chi.idEvento, uid: chi.uid,
        nome: C.testo(p.nome || '', 80), cognome: C.testo(p.cognome || '', 80), azienda: C.testo(p.azienda || '', 140),
        email: p.emailNorm || E.normalizzaEmail(p.email) || '',
        testo: testo, quando: D.adessoTs(ctx), risposta: false, rispostaQuando: null, rispostaDa: ''
    };
    await rif.set(dati);
    return { domanda: miaJSON(rif.id, dati), aperte: true };
}

/* mie: { idEvento, sessione } -> { domande, aperte, attive }: le domande
   di chi chiama per quell'evento, dalla piu' vecchia, se se ne possono
   ancora mandare e se l'evento le prevede. */
async function mie(ctx, req, b) {
    const chi = await partecipante(ctx, req, b);
    const [snap, ev] = await Promise.all([
        ctx.db.collection('domande').where('uid', '==', chi.uid).limit(MAX_MIE).get(),
        ctx.db.collection('eventi').doc(chi.idEvento).get()
    ]);
    const domande = snap.docs.filter(d => d.data().idEvento === chi.idEvento).map(d => miaJSON(d.id, d.data())).sort(perOrdine);
    return { domande: domande, aperte: ev.exists && aperte(ev.data()), attive: ev.exists && attive(ev.data()) };
}

/* eventi: gli eventi della pagina del relatore. Per un relatore quelli
   in cui c'e' la sua email; per un gestore tutti. */
async function eventiDi(ctx, chi) {
    let ids;
    if (chi.ruolo === 'gestore') ids = (await ctx.db.collection('eventi').get()).docs.map(d => d.id);
    else ids = (await ctx.db.collection('relatoriEventi').where('email', 'array-contains', chi.email).get()).docs.map(d => d.id);
    if (!ids.length) return { eventi: [], ruolo: chi.ruolo, email: chi.email };
    const snaps = await ctx.db.getAll(...ids.map(id => ctx.db.collection('eventi').doc(id)));
    const eventi = snaps.filter(s => s.exists).map(s => eventoBreve(s.id, s.data())).sort((a, b) => (b.inizio || 0) - (a.inizio || 0));
    return { eventi: eventi, ruolo: chi.ruolo, email: chi.email };
}

/* elenco: { idEvento } -> { evento, domande, conteggi, aggiornato }:
   tutte le domande dell'evento, dalla piu' vecchia. */
async function elenco(ctx, idEvento, chi) {
    const id = D.controllaIdEvento(idEvento);
    const [ev, snap] = await Promise.all([
        ctx.db.collection('eventi').doc(id).get(),
        ctx.db.collection('domande').where('idEvento', '==', id).limit(MAX_ELENCO).get()
    ]);
    if (!ev.exists) throw C.errore(404, 'Evento inesistente.', 'evento');
    const domande = snap.docs.map(d => domandaJSON(d.id, d.data(), chi.ruolo === 'gestore')).sort(perOrdine);
    return {
        evento: eventoBreve(id, ev.data()), domande: domande,
        conteggi: { totale: domande.length, risposte: domande.filter(x => x.risposta).length },
        aggiornato: ctx.adesso()
    };
}

/* segna: { idEvento, idDomanda, risposta: true|false } -> { domanda }:
   «Risposta data» (o tolta), con chi e quando. Ripetere la stessa scelta
   non cambia niente. */
async function segna(ctx, { idEvento, idDomanda, risposta }, chi) {
    const id = D.controllaIdEvento(idEvento);
    const idD = String(idDomanda == null ? '' : idDomanda);
    if (!RE_ID_DOMANDA.test(idD)) throw C.errore(400, 'Domanda non valida.', 'domanda');
    if (typeof risposta !== 'boolean') throw C.errore(400, 'Indica se la domanda ha avuto risposta.', 'risposta');
    const rif = ctx.db.collection('domande').doc(idD);
    const dopo = await ctx.db.runTransaction(async tx => {
        const s = await tx.get(rif);
        if (!s.exists || s.data().idEvento !== id) throw C.errore(404, 'Domanda inesistente.', 'domanda');
        const d = s.data();
        if ((d.risposta === true) === risposta) return d;
        const nuovi = risposta
            ? { risposta: true, rispostaQuando: D.adessoTs(ctx), rispostaDa: chi.email }
            : { risposta: false, rispostaQuando: null, rispostaDa: '' };
        tx.update(rif, nuovi);
        return Object.assign({}, d, nuovi);
    });
    return { domanda: domandaJSON(idD, dopo, chi.ruolo === 'gestore') };
}

/* partecipanti: { idEvento } -> { partecipanti, conteggi, aggiornato }:
   gli iscritti con l'account attivo (nome, cognome, azienda; l'email
   solo alla regia) e chi e' collegato adesso. */
async function partecipanti(ctx, idEvento, chi) {
    const id = D.controllaIdEvento(idEvento);
    const ora = ctx.adesso();
    const [snapP, snapPres] = await Promise.all([
        ctx.db.collection('partecipanti').where('eventi', 'array-contains', id).get(),
        ctx.db.collection('presenze').where('idEvento', '==', id).where('ultimo', '>=', ctx.Timestamp.fromMillis(ora - FINESTRA_COLLEGATI_MS)).get()
    ]);
    const collegati = new Set(snapPres.docs.map(d => d.data().uid));
    const elencoP = snapP.docs.filter(d => (d.data().stato || 'attivo') === 'attivo').map(d => {
        const x = d.data();
        const o = { nome: x.nome || '', cognome: x.cognome || '', azienda: x.azienda || '', collegato: collegati.has(d.id) };
        if (chi.ruolo === 'gestore') o.email = x.emailNorm || E.normalizzaEmail(x.email) || '';
        return o;
    }).sort((a, b) => (a.cognome + ' ' + a.nome).localeCompare(b.cognome + ' ' + b.nome, 'it'));
    return {
        partecipanti: elencoP,
        conteggi: { iscritti: elencoP.length, collegati: elencoP.filter(p => p.collegato).length },
        aggiornato: ora
    };
}

module.exports = {
    // relatori
    leggiRelatori, relatoriDi, relatoriDiEventi, salvaRelatori, eRelatore,
    // chi chiama
    partecipante, relatore,
    // domande
    pulisci, controllaTesto, attive, aperte, domandaJSON, invia, mie, eventiDi, elenco, segna, partecipanti,
    MIN_TESTO, MAX_TESTO, MAX_RELATORI, PAUSA_FRA_DOMANDE_MS, DOMANDE_ORA, STATI_APERTI
};
