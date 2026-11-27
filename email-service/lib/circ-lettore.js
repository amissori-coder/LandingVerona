/* ============================================================
   Circolarizzazioni via PEC: il lettore della casella
   ------------------------------------------------------------
   Nella casella delle circolarizzazioni arrivano due cose:
   le ricevute del gestore (accettazione, consegna, mancata
   consegna) e le risposte dei terzi. Qui si leggono, si
   riconosce a quale lettera appartengono e lo si scrive sulla
   scheda (lib/circ-dati.js).

   Stesse scelte di lib/lettore-pec.js, che fa lo stesso lavoro
   per gli inviti agli eventi: SOLA LETTURA (non si segna niente
   come letto, non si sposta e non si cancella: la casella e'
   l'archivio con valore legale), lettura INCREMENTALE per numero
   di messaggio con il segnaposto su Firestore, e niente testo
   copiato nel database: il testo e gli allegati di una risposta
   si vanno a prendere nella casella quando qualcuno li apre.

   A CHI APPARTIENE UNA RISPOSTA. Con migliaia di lettere a
   soggetti diversi l'abbinamento deve essere sicuro prima che
   comodo. Si prova in quest'ordine, e ci si ferma al primo che
   da' UNA sola lettera:
     1. il messaggio a cui si risponde (In-Reply-To / References,
        sulla busta e sul messaggio dentro la busta): e' la nostra
        PEC, o l'identificativo che il gestore le ha dato;
     2. il riferimento RVL-... nell'oggetto;
     3. l'indirizzo di chi scrive, se abbiamo scritto a
        quell'indirizzo per una sola lettera, oppure per piu'
        lettere di cui una sola ha la societa' revisionata citata
        nell'oggetto.
   Se nessuna strada porta a una lettera sola, la risposta NON si
   abbina a caso: resta fra le "non associate", con le lettere
   candidate, e la associa l'amministratore.

   PIU' CASELLE. Le lettere degli incarichi "per conto di" partono da
   un'altra casella (lib/circ-comune.js, caselle), e ricevute e
   risposte arrivano li'. Ogni casella si legge per conto suo, con il
   suo segnaposto (meta/circLettore per quella dello studio,
   meta/circLettore~pec2 per le altre) e il suo lucchetto. I
   messaggi delle altre caselle hanno la chiave che comincia con il
   nome della casella ("pec2~777_15"): due caselle diverse possono
   dare lo stesso numero a due messaggi diversi.
   ============================================================ */
'use strict';

const C = require('./circ-comune');
const D = require('./daticert');
const DATI = require('./circ-dati');
const ERRORI = require('./circ-errori');

let _ImapFlow = null;
function ImapFlowClasse() {
    if (!_ImapFlow) _ImapFlow = require('imapflow').ImapFlow;
    return _ImapFlow;
}

const MAX_MESSAGGI = 60;                    // messaggi lavorati per giro
const FINESTRA_UID = MAX_MESSAGGI * 5;
/* Se il gestore rigenera la cartella (cambia uidValidity) i numeri salvati non
   valgono piu': si riparte da questi ultimi messaggi. Alla PRIMA accensione
   invece non si guarda indietro affatto: la casella e' in uso da prima, e la
   posta vecchia (risposte a lettere mandate a mano) finirebbe tutta fra le
   "non associate". Il punto di partenza lo fissa il giro degli invii prima di
   spedire la prima PEC (lib/circ-giro.js), cosi' nessuna ricevuta va persa. */
const RECUPERO = Number(process.env.CIRC_LETTORE_RECUPERO) || 200;
const MAX_DATICERT = 64 * 1024;
const MAX_INTESTAZIONI = 16 * 1024;
const MAX_TESTO = 200 * 1024;
const LUCCHETTO_MS = 3 * 60 * 1000;
const PAUSA_ERRORE_MS = 10 * 60 * 1000;
const MAX_ERRORI_AUTH = 3;

function nomeMeta(casella) { return C.idCasella(casella) === C.STUDIO ? 'circLettore' : 'circLettore~' + C.idCasella(casella); }
function docMeta(db, casella) { return db.collection('meta').doc(nomeMeta(casella)); }
// il nome della casella davanti alla chiave del messaggio: vuoto per quella dello studio
function prefisso(casella) { return C.idCasella(casella) === C.STUDIO ? '' : C.idCasella(casella) + '~'; }
function configurato(casella) {
    const c = C.configurazione(casella);
    return !!(c.imapHost && c.imapUtente && c.imapPassword);
}
// le caselle che si leggono: quelle configurate per la lettura
function daLeggere() { return C.caselle().filter(c => configurato(c.id)).map(c => c.id); }
function nuovoClient(casella) {
    const c = C.configurazione(casella);
    const client = new (ImapFlowClasse())({
        host: c.imapHost, port: c.imapPorta, secure: true,
        auth: { user: c.imapUtente, pass: c.imapPassword },
        logger: false, emitLogs: false,
        socketTimeout: 25000, greetingTimeout: 15000, connectionTimeout: 15000
    });
    // senza un ascoltatore un guasto di rete farebbe cadere l'intera funzione
    client.on('error', () => { });
    return client;
}
async function chiudi(client) {
    try { await client.logout(); } catch (_) { try { client.close(); } catch (_) { /* gia' chiusa */ } }
}

function leggiStream(stream, max) {
    return new Promise((risolvi, rifiuta) => {
        const pezzi = []; let letti = 0, finito = false;
        const fine = () => { if (!finito) { finito = true; risolvi(Buffer.concat(pezzi).slice(0, max)); } };
        stream.on('data', p => { letti += p.length; pezzi.push(p); if (letti > max) { stream.destroy(); fine(); } });
        stream.on('end', fine);
        stream.on('error', e => { if (!finito) { finito = true; rifiuta(e); } });
    });
}
function trovaParte(nodo, nome) {
    if (!nodo) return null;
    const p = nodo.parameters || {}, dp = nodo.dispositionParameters || {};
    if (String(dp.filename || p.name || '').toLowerCase() === nome) return { parte: nodo.part || '1', dimensione: Number(nodo.size) || 0 };
    for (const f of (nodo.childNodes || [])) { const t = trovaParte(f, nome); if (t) return t; }
    return null;
}
async function parteGrezza(client, uid, chiave, da, quanti) {
    const r = await client.fetchOne(String(uid), { uid: true, bodyParts: [{ key: chiave, start: da || 0, maxLength: quanti }] }, { uid: true });
    return r && r.bodyParts ? (r.bodyParts.get(String(chiave).toLowerCase()) || r.bodyParts.get(chiave) || null) : null;
}

/* ---------- il lucchetto e lo stato ---------- */
async function prendiLucchetto(db, chi, casella) {
    return db.runTransaction(async tx => {
        const snap = await tx.get(docMeta(db, casella));
        const d = snap.exists ? (snap.data() || {}) : {};
        const ora = Date.now();
        if (d.lucchetto && d.lucchetto.fino > ora) return { preso: false };
        tx.set(docMeta(db, casella), { lucchetto: { fino: ora + LUCCHETTO_MS, chi: String(chi || '').slice(0, 120) } }, { merge: true });
        return { preso: true, stato: d };
    });
}
async function mollaLucchetto(db, campi, casella) {
    try { await docMeta(db, casella).set(Object.assign({ lucchetto: null }, campi || {}), { merge: true }); } catch (_) { /* scade da solo */ }
}
async function statoDi(db, casella) {
    let d = {};
    try { const s = await docMeta(db, casella).get(); d = s.exists ? (s.data() || {}) : {}; } catch (_) { d = {}; }
    return {
        configurato: configurato(casella),
        ultimoGiro: d.ultimoGiro || null, ultimoOk: Number(d.ultimoOk) || 0,
        // la password per i programmi di posta di Aruba scade ogni sei mesi
        fermoPerCredenziali: (Number(d.erroriAuth) || 0) >= MAX_ERRORI_AUTH,
        inCorso: !!(d.lucchetto && d.lucchetto.fino > Date.now()),
        mai: !d.uidValidity
    };
}
/* Lo stato della casella dello studio, con in piu' (`caselle`) quello delle
   altre caselle configurate. */
async function stato(db) {
    const altre = C.caselle().filter(c => c.id !== C.STUDIO);
    const [st, ...resto] = await Promise.all([statoDi(db, C.STUDIO)].concat(altre.map(c => statoDi(db, c.id))));
    delete st.mai;
    if (altre.length) st.caselle = altre.map((c, i) => Object.assign({ id: c.id, etichetta: c.etichetta, indirizzo: c.mittente || '' }, resto[i]));
    return st;
}

/* ---------- a chi appartiene una risposta ---------- */
function normale(v) {
    return String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/\b(s\.?\s?r\.?\s?l\.?\s?s?\.?|s\.?\s?p\.?\s?a\.?|s\.?\s?a\.?\s?s\.?|s\.?\s?n\.?\s?c\.?|societa|in liquidazione)\b/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ').trim();
}
function riferimenti(v) { return String(v || '').split(/[\s,]+/).filter(x => x.indexOf('@') > 0); }
/* Torna { invio, via } quando la lettera e' una sola, altrimenti
   { candidati: [...] } (anche vuoto). `h` busta, `hi` messaggio dentro. */
async function abbina(db, h, hi, mittente, casella) {
    hi = hi || {};
    const chiavi = [];
    [h['in-reply-to'], hi['in-reply-to']].concat(riferimenti(h['references'])).concat(riferimenti(hi['references'])).forEach(v => {
        if (v) DATI.chiaviMsgId(v).forEach(k => { if (chiavi.indexOf(k) < 0) chiavi.push(k); });
    });
    let dove = await DATI.trovaRiferimento(db, chiavi);
    if (dove) return { invio: dove.invio, via: 'risposta' };
    const codice = C.codiceDa(h['subject']) || C.codiceDa(hi['subject']);
    if (codice) {
        dove = await DATI.trovaRiferimento(db, ['c~' + codice]);
        if (dove) return { invio: dove.invio, via: 'riferimento' };
    }
    const cand = await DATI.candidatiPerIndirizzo(db, mittente, casella);
    if (cand.length === 1) return { invio: cand[0].id, via: 'indirizzo' };
    if (cand.length > 1) {
        const oggetto = ' ' + normale(D.oggettoPulito(h['subject']) + ' ' + (hi['subject'] || '')) + ' ';
        const citate = cand.filter(x => { const n = normale(x.cliente); return n.length >= 4 && oggetto.indexOf(' ' + n + ' ') >= 0; });
        if (citate.length === 1) return { invio: citate[0].id, via: 'indirizzo e società' };
    }
    return { candidati: cand.slice(0, 12).map(x => ({ id: x.id, incaricoId: x.incaricoId, cliente: x.cliente, destinatario: x.destinatario, codice: x.codice })) };
}

/* ---------- un messaggio ---------- */
async function lavora(db, client, m, uidValidity, conto, casella) {
    const h = D.intestazioni(m.headers);
    const g = D.genere(h);
    const uid = Number(m.uid);
    const chiave = prefisso(casella) + uidValidity + '_' + uid;
    const quando = m.internalDate ? new Date(m.internalDate).getTime() : Date.now();
    const coordinate = { chiave: chiave, uid: uid, uidValidity: uidValidity, dimensione: Number(m.size) || 0 };
    if (prefisso(casella)) coordinate.casella = C.idCasella(casella);

    if (g.genere === 'estraneo') { conto.estranei++; return { stato: 'ignorato' }; }

    if (g.genere === 'ricevuta') {
        let dc = null;
        const parte = trovaParte(m.bodyStructure, 'daticert.xml');
        if (parte && parte.dimensione <= MAX_DATICERT) {
            try {
                const sc = await client.download(String(uid), parte.parte, { uid: true, maxBytes: MAX_DATICERT });
                if (sc && sc.content) dc = D.leggiDaticert((await leggiStream(sc.content, MAX_DATICERT)).toString('utf8'));
            } catch (e) { if (client.usable === false) throw e; dc = null; }
        }
        const chiavi = [];
        [dc && dc.msgid, h['x-riferimento-message-id']].forEach(v => { if (v) DATI.chiaviMsgId(v).forEach(k => chiavi.push(k)); });
        const dove = await DATI.trovaRiferimento(db, chiavi);
        // una ricevuta di una PEC non partita da qui (qualcuno ha scritto dalla webmail): non ci riguarda
        if (!dove || !dove.passo) { conto.estranei++; return { stato: 'ignorato', tipo: 'ricevuta-estranea' }; }
        const tipo = (dc && dc.tipo) || g.tipo;
        const momento = (dc && dc.quando) || quando;
        let fatto;
        if (tipo === 'accettazione') {
            fatto = { genere: 'accettata', quando: momento, gestore: dc ? dc.gestore : '', identificativo: dc ? dc.identificativo : '' };
        } else if (tipo === 'avvenuta-consegna') {
            const atteso = String(dove.destinatario || '').toLowerCase(), dichiarato = dc ? String(dc.consegna || '').toLowerCase() : '';
            if (atteso && dichiarato && atteso !== dichiarato) { conto.estranei++; return { stato: 'ignorato', tipo: 'destinatario-diverso' }; }
            fatto = { genere: 'consegnata', quando: momento, destinatario: dichiarato || atteso };
        } else if (tipo === 'presa-in-carico' || tipo === 'sconosciuta') {
            return { stato: 'ignorato', tipo: tipo, invio: dove.invio };
        } else {
            const gr = D.gravitaProblema(tipo, dc ? dc.erroreEsteso : '');
            fatto = { genere: 'problema', quando: momento, tipo: tipo, motivo: (dc && dc.erroreEsteso) || D.oggettoPulito(h['subject']), definitivo: gr.definitivo, gravita: gr.gravita };
        }
        fatto.etichetta = tipo;
        await DATI.applicaRicevuta(db, dove, fatto, coordinate);
        // l'identificativo del gestore e' il ponte per le risposte: chi risponde, risponde a quello
        if (fatto.genere === 'accettata' && fatto.identificativo) {
            try { await db.collection(DATI.RIF).doc('m~' + D.chiaveMsgId(fatto.identificativo)).set({ invio: dove.invio, passo: dove.passo, destinatario: dove.destinatario || '', quando: Date.now() }, { merge: true }); } catch (_) { /* resta il riferimento nell'oggetto */ }
        }
        conto.ricevute++;
        return { stato: 'associato', genere: 'ricevuta', tipo: tipo, invio: dove.invio };
    }

    /* Una risposta (PEC vera) o un messaggio di posta ordinaria arrivato
       nella casella. Le intestazioni che contano stanno DENTRO la busta
       (postacert.eml): a chi si risponde, l'oggetto scritto dal terzo, le
       risposte automatiche. Pochi kB, solo l'intestazione. */
    let hi = {};
    const busta = D.trovaBusta(m.bodyStructure);
    if (busta && busta.part) {
        try {
            const grezzo = await parteGrezza(client, uid, busta.part + '.HEADER', 0, MAX_INTESTAZIONI);
            if (grezzo) hi = D.intestazioni(grezzo.toString('utf8'));
        } catch (e) { if (client.usable === false) throw e; hi = {}; }
    }
    const mittente = D.soloIndirizzo(h['reply-to']) || D.soloIndirizzo(hi['reply-to']) || D.soloIndirizzo(hi['from']) || D.soloIndirizzo(h['from']);
    const automatica = D.automatica(h) || D.automatica(hi);
    const struttura = D.normalizzaParti(m.bodyStructure);
    const allegati = D.trovaAllegati(struttura).map(a => ({ nome: a.nome, dimensione: a.dimensione, parte: a.parte, tipo: a.tipo, codifica: a.codifica }));
    const risposta = {
        chiave: chiave, uid: uid, uidValidity: uidValidity, quando: quando, da: mittente,
        oggetto: D.oggettoPulito(h['subject']), certificata: g.genere === 'risposta', automatica: automatica,
        allegati: allegati, dimensione: Number(m.size) || 0
    };
    if (prefisso(casella)) risposta.casella = C.idCasella(casella);
    const esito = await abbina(db, h, hi, mittente, casella);
    if (esito.invio) {
        const r = await DATI.registraRisposta(db, esito.invio, Object.assign({ via: esito.via }, risposta));
        if (r.ok) { conto.risposte++; return { stato: 'associato', genere: 'risposta', invio: esito.invio, automatica: automatica }; }
    }
    // una risposta automatica che non si sa di chi sia non serve a nessuno
    if (automatica) { conto.estranei++; return { stato: 'ignorato', tipo: 'automatica' }; }
    conto.nonAssociate++;
    return {
        stato: 'non-associato', genere: g.genere, da: mittente, oggetto: risposta.oggetto, certificata: risposta.certificata,
        allegati: allegati, dimensione: risposta.dimensione, candidati: esito.candidati || []
    };
}

/* ---------- un giro di lettura ----------
   `opz.casella`: si legge solo quella. Senza, si leggono tutte le caselle
   configurate, una dopo l'altra, nel tempo che c'e'; il risultato somma i
   conteggi (e in `caselle` c'e' quello di ognuna). */
async function giro(db, opz) {
    opz = opz || {};
    if (opz.casella) return giroCasella(db, opz, C.idCasella(opz.casella));
    const ids = daLeggere();
    if (ids.length <= 1) return giroCasella(db, opz, ids[0] || C.STUDIO);
    const inizio = Date.now(), budget = Number(opz.budgetMs) || 40000;
    const esiti = {};
    for (const id of ids) {
        const resta = budget - (Date.now() - inizio);
        if (resta < 3000) { esiti[id] = { ok: true, esito: 'rimandata', restanti: true }; continue; }
        esiti[id] = await giroCasella(db, Object.assign({}, opz, { budgetMs: resta }), id);
    }
    const tutti = ids.map(id => esiti[id]);
    const somma = k => tutti.reduce((t, r) => t + (Number(r[k]) || 0), 0);
    const nonOk = tutti.find(r => !r.ok);
    const etichetta = id => C.configurazione(id).etichetta;
    return {
        ok: !nonOk, esito: nonOk ? nonOk.esito : (tutti.some(r => r.esito === 'occupato') ? 'occupato' : 'ok'),
        msg: ids.filter(id => !esiti[id].ok && esiti[id].msg).map(id => etichetta(id) + ': ' + esiti[id].msg).join(' '),
        quando: Math.max.apply(null, tutti.map(r => Number(r.quando) || 0)), durataMs: Date.now() - inizio,
        restanti: tutti.some(r => r.restanti),
        letti: somma('letti'), ricevute: somma('ricevute'), risposte: somma('risposte'), nonAssociate: somma('nonAssociate'), estranei: somma('estranei'),
        caselle: esiti
    };
}
async function giroCasella(db, opz, casella) {
    const inizio = Date.now();
    const budget = Number(opz.budgetMs) || 40000;
    const nomeCasella = casella === C.STUDIO ? 'La casella PEC delle circolarizzazioni' : 'La casella PEC «' + C.configurazione(casella).etichetta + '»';
    if (!configurato(casella)) return { ok: false, esito: 'non-configurato', msg: nomeCasella + ' non è configurata per la lettura.' };
    const preso = await prendiLucchetto(db, opz.da || 'giro', casella);
    if (!preso.preso) return { ok: true, esito: 'occupato', msg: 'Un controllo della casella è già in corso.' };
    const prima = preso.stato || {};
    const ultimo = prima.ultimoGiro || {};
    if (!opz.forza) {
        if ((Number(prima.erroriAuth) || 0) >= MAX_ERRORI_AUTH) {
            await mollaLucchetto(db, null, casella);
            return { ok: false, esito: 'credenziali', msg: 'Il controllo della casella è fermo: la PEC ha rifiutato la password tre volte. Va rigenerata la password per i programmi di posta e aggiornata nelle variabili del servizio.' };
        }
        if (ultimo.esito === 'errore' && (Date.now() - (ultimo.quando || 0)) < PAUSA_ERRORE_MS) {
            await mollaLucchetto(db, null, casella);
            return { ok: false, esito: 'in-pausa', msg: 'Il controllo precedente non è riuscito: si riprova fra qualche minuto.' };
        }
    }
    const c = C.configurazione(casella);
    const client = nuovoClient(casella);
    const conto = { letti: 0, ricevute: 0, risposte: 0, nonAssociate: 0, estranei: 0 };
    let restanti = false, uidValidity = '', ultimoUid = 0, esito = 'ok', motivo = '';
    try {
        await client.connect();
        const mb = await client.mailboxOpen(c.cartella, { readOnly: true });
        uidValidity = String(mb.uidValidity);
        const uidNext = Number(mb.uidNext) || 1;
        const stessa = prima.uidValidity === uidValidity && prima.cartella === c.cartella;
        ultimoUid = stessa ? (Number(prima.ultimoUid) || 0) : (prima.uidValidity ? Math.max(0, uidNext - 1 - RECUPERO) : uidNext - 1);
        const daUid = ultimoUid + 1, aUid = Math.min(uidNext - 1, ultimoUid + FINESTRA_UID);
        if (aUid >= daUid) {
            const messaggi = [];
            // intervallo chiuso ai due estremi: con "N:*" il server ridarebbe sempre l'ultimo messaggio
            for await (const m of client.fetch({ uid: daUid + ':' + aUid },
                { uid: true, internalDate: true, size: true, bodyStructure: true, headers: D.INTESTAZIONI }, { uid: true })) {
                if (Number(m.uid) <= ultimoUid) continue;
                messaggi.push(m);
                if (messaggi.length >= MAX_MESSAGGI) break;
            }
            messaggi.sort((a, b) => Number(a.uid) - Number(b.uid));
            for (const m of messaggi) {
                if (Date.now() - inizio > budget) { restanti = true; break; }
                const uid = Number(m.uid);
                const rifVisto = db.collection(DATI.MSG).doc(prefisso(casella) + uidValidity + '_' + uid);
                let gia = false;
                try { gia = (await rifVisto.get()).exists; } catch (_) { gia = false; }
                if (gia) { ultimoUid = uid; continue; }
                let annotato;
                try { annotato = await lavora(db, client, m, uidValidity, conto, casella); }
                catch (e) {
                    if (client.usable === false) throw e;     // connessione caduta: non e' colpa del messaggio
                    annotato = { stato: 'ignorato', tipo: 'illeggibile' };
                    await ERRORI.segna(db, {
                        chiave: 'casella~messaggio~' + prefisso(casella) + uidValidity + '_' + uid, tipo: 'casella', gravita: 'avviso', titolo: 'Un messaggio della casella PEC non si è potuto leggere' + (prefisso(casella) ? ' (' + c.etichetta + ')' : ''),
                        dettaglio: 'Messaggio del ' + new Date(m.internalDate || Date.now()).toISOString().slice(0, 16).replace('T', ' ') + ' UTC: ' + String((e && e.message) || 'errore').slice(0, 200) + '. Se è una ricevuta o una risposta, va guardata dalla casella.'
                    });
                }
                // il segnaposto si scrive DOPO il lavoro: scritto prima, un guasto a meta' farebbe perdere il messaggio
                try {
                    await rifVisto.set(Object.assign({ quando: m.internalDate ? new Date(m.internalDate).getTime() : Date.now(), letto: Date.now(), uid: uid, uidValidity: uidValidity }, prefisso(casella) ? { casella: casella } : {}, annotato));
                } catch (_) { /* al massimo si rilegge: le scritture sono idempotenti */ }
                conto.letti++;
                ultimoUid = uid;
            }
            if (!restanti && (messaggi.length >= MAX_MESSAGGI || aUid < uidNext - 1)) restanti = true;
        }
    } catch (e) {
        const testo = String((e && (e.responseText || e.message)) || 'errore').slice(0, 200);
        const auth = /auth|login|credential|invalid user|password/i.test(testo) || !!(e && e.authenticationFailed);
        esito = 'errore';
        motivo = auth ? 'La casella PEC ha rifiutato le credenziali: ' + testo : testo;
        try { await docMeta(db, casella).set({ erroriAuth: auth ? (Number(prima.erroriAuth) || 0) + 1 : 0 }, { merge: true }); } catch (_) { /* niente da fare */ }
        /* Nel registro degli errori: la password rifiutata subito (dopo tre
           volte il lettore si ferma); un collegamento caduto solo se e' la
           seconda volta di fila, perche' una caduta isolata si sistema da sola
           al giro dopo e non merita un avviso. */
        const quale = prefisso(casella) ? ' (' + c.etichetta + ')' : '';
        const variabile = casella === C.STUDIO ? 'CIRC_PEC_PASS' : 'CIRC_PEC' + casella.slice(3) + '_PASS';
        if (auth) {
            await ERRORI.segna(db, { chiave: 'casella~credenziali' + (prefisso(casella) ? '~' + casella : ''), tipo: 'casella', titolo: 'La casella PEC rifiuta la password' + quale, dettaglio: testo + '. Dopo tre rifiuti la lettura si ferma: va rinnovata la password per i programmi di posta e aggiornata su Vercel (' + variabile + ').' });
        } else if (ultimo.esito === 'errore') {
            await ERRORI.segna(db, { chiave: 'casella~lettura' + (prefisso(casella) ? '~' + casella : ''), tipo: 'casella', titolo: 'La casella PEC non si riesce a leggere' + quale, dettaglio: testo + '. Finché non si legge, ricevute e risposte non si aggiornano e i solleciti non vengono fermati dalle risposte.' });
        }
    } finally {
        await chiudi(client);
    }
    const riepilogo = Object.assign({ quando: Date.now(), esito: esito, motivo: motivo, durataMs: Date.now() - inizio, restanti: restanti }, conto);
    const salva = { ultimoGiro: riepilogo };
    if (esito === 'ok') {
        Object.assign(salva, { uidValidity: uidValidity, cartella: c.cartella, ultimoUid: ultimoUid, erroriAuth: 0 });
        // "la casella e' stata letta fino in fondo a quest'ora": lo usa il giro degli invii
        if (!restanti) salva.ultimoOk = inizio;
    }
    await mollaLucchetto(db, salva, casella);
    return Object.assign({ ok: esito === 'ok', msg: motivo }, riepilogo);
}

/* ---------- aprire un messaggio dalla casella ----------
   Chi chiama DEVE aver gia' verificato che quel messaggio appartenga a una
   lettera che l'utente puo' vedere (api/circolarizzazioni.js): qui non c'e'
   modo di saperlo. */
async function conMessaggio(opz, fn) {
    if (!configurato(opz.casella)) return { ok: false, msg: 'Casella PEC non configurata per la lettura.' };
    const uid = Number(opz.uid) || 0;
    if (!uid) return { ok: false, msg: 'Messaggio non indicato.' };
    const client = nuovoClient(opz.casella);
    try {
        await client.connect();
        const mb = await client.mailboxOpen(C.configurazione(opz.casella).cartella, { readOnly: true });
        // se la cartella e' stata rigenerata quell'uid non indica piu' lo stesso messaggio
        if (opz.uidValidity && String(mb.uidValidity) !== String(opz.uidValidity)) {
            return { ok: false, msg: 'Il messaggio non è più rintracciabile con lo stesso riferimento: aprilo dalla casella PEC.' };
        }
        return await fn(client, uid);
    } catch (e) {
        return { ok: false, msg: 'Lettura dalla casella PEC non riuscita: ' + String((e && (e.responseText || e.message)) || 'errore').slice(0, 200) };
    } finally {
        await chiudi(client);
    }
}
/* Il testo di una risposta (o di una ricevuta), con l'elenco degli allegati. */
function leggiTesto(opz) {
    return conMessaggio(opz, async (client, uid) => {
        let trovato = null;
        for await (const m of client.fetch({ uid: uid + ':' + uid }, { uid: true, internalDate: true, bodyStructure: true, headers: D.INTESTAZIONI }, { uid: true })) {
            if (Number(m.uid) === uid) trovato = m;
        }
        if (!trovato) return { ok: false, msg: 'Messaggio non trovato nella casella.' };
        const h = D.intestazioni(trovato.headers);
        const g = D.genere(h);
        const struttura = D.normalizzaParti(trovato.bodyStructure);
        const parte = D.trovaLeggibile(struttura, { fuoriBusta: g.genere === 'ricevuta' });
        let testo = '', troncato = false;
        if (parte) {
            const grezzo = await parteGrezza(client, uid, String(parte.parte || '1'), 0, MAX_TESTO);
            if (grezzo) {
                troncato = grezzo.length >= MAX_TESTO;
                let t = D.decodificaTesto(D.decodificaTrasferimento(grezzo, parte.codifica, troncato), parte.gioco, troncato);
                if (parte.html) t = D.testoDaHtml(t);
                else if (parte.flowed) t = D.testoFlowed(t.replace(/\r\n?/g, '\n'), parte.delsp);
                testo = t.replace(/\r\n?/g, '\n').trim();
            }
        }
        return {
            ok: true, genere: g.genere, oggetto: D.oggettoPulito(h['subject']),
            da: D.soloIndirizzo(h['reply-to']) || D.soloIndirizzo(h['from']),
            quando: trovato.internalDate ? new Date(trovato.internalDate).getTime() : 0,
            testo: testo, troncato: troncato
        };
    });
}
/* Un tratto del messaggio intero (`parte` vuota: il file .eml, firma del
   gestore compresa) o di un suo allegato. I byte sono quelli che stanno nella
   casella, non decodificati: li ricompone e li decodifica l'area riservata,
   cosi' un allegato grande si scarica a tratti senza superare il limite di
   una risposta del servizio. */
function scarica(opz) {
    const da = Math.max(0, Math.round(Number(opz.da) || 0));
    const quanti = C.LIMITI.scaricoByte;
    return conMessaggio(opz, async (client, uid) => {
        let buf = null, totale = Number(opz.totale) || 0;
        if (opz.parte) {
            buf = await parteGrezza(client, uid, String(opz.parte), da, quanti);
        } else {
            const r = await client.fetchOne(String(uid), { uid: true, size: true, source: { start: da, maxLength: quanti } }, { uid: true });
            buf = r && r.source ? r.source : null;
            if (r && r.size) totale = Number(r.size);
        }
        if (!buf) return { ok: false, msg: 'Messaggio non trovato nella casella.' };
        return { ok: true, dati: Buffer.from(buf).toString('base64'), da: da, lunghezza: buf.length, totale: totale, fine: buf.length < quanti || (totale > 0 && da + buf.length >= totale) };
    });
}

/* Una sessione sulla casella per prendere il file intero (.eml, firma del
   gestore compresa) di piu' messaggi con un collegamento solo: serve alle
   email che portano in allegato le ricevute e le PEC da associare
   (lib/circ-avvisi.js). Il collegamento si apre alla prima richiesta.
   sorgente() torna { ok: true, dati } oppure { ok: false, perche }:
     'assente'  il messaggio non c'e' piu' con quel riferimento (cartella
                rigenerata, messaggio spostato): riprovare non serve;
     'grande'   pesa piu' di `max`;
     'guasto'   la casella non risponde: al giro dopo puo' andare. */
async function sessione(casella) {
    const client = configurato(casella) ? nuovoClient(casella) : null;
    let mb = null, guasta = !client, tentata = false;
    const apri = async () => {
        if (mb || guasta) return;
        tentata = true;
        try { await client.connect(); mb = await client.mailboxOpen(C.configurazione(casella).cartella, { readOnly: true }); }
        catch (_) { guasta = true; }
    };
    return {
        async sorgente(dove, max) {
            const uid = Number(dove && dove.uid) || 0;
            if (!uid) return { ok: false, perche: 'assente' };
            await apri();
            if (!mb) return { ok: false, perche: 'guasto' };
            if (dove.uidValidity && String(mb.uidValidity) !== String(dove.uidValidity)) return { ok: false, perche: 'assente' };
            try {
                const tetto = Math.max(1, Number(max) || C.LIMITI.rispostaMaxByte);
                const r = await client.fetchOne(String(uid), { uid: true, size: true, source: { start: 0, maxLength: tetto + 1 } }, { uid: true });
                if (!r || !r.source || !r.source.length) return { ok: false, perche: 'assente' };
                if (r.source.length > tetto || Number(r.size) > tetto) return { ok: false, perche: 'grande' };
                return { ok: true, dati: Buffer.from(r.source) };
            } catch (e) {
                if (client.usable === false) { guasta = true; mb = null; }
                return { ok: false, perche: 'guasto' };
            }
        },
        /* Il testo e gli allegati di una risposta, decodificati: servono
           all'inoltro a chi ha la revisione legale (lib/circ-inoltri.js).
           `max`: quanti byte di allegati, in tutto, al massimo. Torna
           { ok, testo, file: [{ filename, content, contentType }], mancanti:
           [{ nome, motivo }] } oppure { ok: false, perche } come sorgente(). */
        async contenuto(dove, max) {
            const uid = Number(dove && dove.uid) || 0;
            if (!uid) return { ok: false, perche: 'assente' };
            await apri();
            if (!mb) return { ok: false, perche: 'guasto' };
            if (dove.uidValidity && String(mb.uidValidity) !== String(dove.uidValidity)) return { ok: false, perche: 'assente' };
            try {
                let trovato = null;
                for await (const m of client.fetch({ uid: uid + ':' + uid }, { uid: true, size: true, bodyStructure: true }, { uid: true })) {
                    if (Number(m.uid) === uid) trovato = m;
                }
                if (!trovato) return { ok: false, perche: 'assente' };
                const struttura = D.normalizzaParti(trovato.bodyStructure);
                let testo = '';
                const leggibile = D.trovaLeggibile(struttura);
                if (leggibile && (leggibile.dentroBusta || !D.trovaBusta(struttura))) {
                    try {
                        const grezzo = await parteGrezza(client, uid, String(leggibile.parte || '1'), 0, MAX_TESTO);
                        if (grezzo) {
                            const tagliato = grezzo.length >= MAX_TESTO;
                            let t = D.decodificaTesto(D.decodificaTrasferimento(grezzo, leggibile.codifica, tagliato), leggibile.gioco, tagliato);
                            if (leggibile.html) t = D.testoDaHtml(t);
                            else if (leggibile.flowed) t = D.testoFlowed(t.replace(/\r\n?/g, '\n'), leggibile.delsp);
                            testo = t.replace(/\r\n?/g, '\n').trim().slice(0, 20000);
                        }
                    } catch (e) { if (client.usable === false) throw e; testo = ''; }
                }
                const tetto = Math.max(1, Number(max) || C.LIMITI.rispostaMaxByte);
                const file = [], mancanti = [];
                let usati = 0;
                for (const a of D.trovaAllegati(struttura)) {
                    const nome = String(a.nome || 'allegato').replace(/[\/\\]/g, '-').slice(0, 120);
                    if (!a.parte) { mancanti.push({ nome: nome, motivo: 'non leggibile' }); continue; }
                    // stima dal peso codificato: in base64 un file pesa circa un terzo in piu'
                    const stima = a.codifica === 'base64' ? Math.round((Number(a.dimensione) || 0) * 0.74) : (Number(a.dimensione) || 0);
                    if (usati + stima > tetto) { mancanti.push({ nome: nome, motivo: 'peso', dimensione: stima }); continue; }
                    const grezzo = await parteGrezza(client, uid, String(a.parte), 0, Math.ceil(tetto * 1.4) + 4096);
                    if (!grezzo) { mancanti.push({ nome: nome, motivo: 'non leggibile' }); continue; }
                    const buf = D.decodificaTrasferimento(grezzo, a.codifica, false);
                    if (usati + buf.length > tetto) { mancanti.push({ nome: nome, motivo: 'peso', dimensione: buf.length }); continue; }
                    usati += buf.length;
                    file.push({ filename: nome, content: buf, contentType: a.tipo || 'application/octet-stream' });
                }
                return { ok: true, testo: testo, file: file, mancanti: mancanti };
            } catch (e) {
                if (client.usable === false) { guasta = true; mb = null; }
                return { ok: false, perche: 'guasto' };
            }
        },
        // si chiude solo un collegamento che si e' provato ad aprire
        async chiudi() { if (client && tentata) await chiudi(client); }
    };
}

module.exports = { configurato, stato, statoDi, giro, leggiTesto, scarica, sessione, daLeggere, nomeMeta, MAX_MESSAGGI, _interni: { lavora, abbina, normale, docMeta, prefisso } };
