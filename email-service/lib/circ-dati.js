/* ============================================================
   Circolarizzazioni via PEC: i dati e chi li puo' vedere
   ------------------------------------------------------------
   Una scheda per ogni lettera (circInvii/<id>): a chi, per quale
   incarico, con quale PDF, e i tre passi possibili - l'invio, il
   primo e il secondo sollecito - ognuno con il suo stato e le sue
   ricevute. Le risposte arrivate stanno sulla stessa scheda.

   TUTTO passa da qui con l'account di servizio: nelle regole
   Firestore queste raccolte non hanno un `match`, quindi dal
   browser non si leggono e non si scrivono. E' il servizio a
   decidere chi vede che cosa, incarico per incarico:
     - chi e' nel team, il responsabile dell'incarico e il
       responsabile della qualita' vedono i propri incarichi;
     - l'amministratore, il titolare e le persone che
       l'amministratore indica come supervisori vedono tutto.

   QUATTRO RACCOLTE
     circInvii        le schede (e, sotto ognuna, il PDF a pezzi)
     circRiferimenti  l'indice: Message-ID, identificativo del
                      gestore e riferimento RVL-... -> scheda e passo
     circMessaggi     i messaggi della casella gia' letti; quelli
                      che sono risposte non abbinate aspettano qui
                      che l'amministratore le associ
     circIncarichi    i conteggi per incarico, rifatti quando servono

   LE INTERROGAZIONI usano solo uguaglianze, oppure un intervallo
   sullo stesso campo su cui si ordina: cosi' bastano gli indici
   automatici di Firestore e non c'e' niente da creare a mano.
   ============================================================ */
'use strict';

const crypto = require('crypto');
const C = require('./circ-comune');
const D = require('./daticert');

const INVII = 'circInvii', RIF = 'circRiferimenti', MSG = 'circMessaggi', INC = 'circIncarichi';
const PEZZI = 'allegato';
const PROPRIETARIO = 'a.missori@emvas.tax';
const MINUTO = 60 * 1000, GIORNO = 24 * 60 * MINUTO;
const VERIFICA_MS = 20 * MINUTO;        // un passo "in invio" senza esito si riguarda dopo venti minuti
const RIPROVA_MS = 15 * MINUTO;         // dopo un rifiuto che riguarda noi (tetto, blocco) si aspetta
const MAX_TENTATIVI = 3;

function docImpostazioni(db) { return db.collection('meta').doc('circolarizzazioni'); }

/* ============================================================
   CHI VEDE CHE COSA
   ============================================================ */
async function leggiArchivio(db, nome) {
    const snap = await db.collection('archivio').doc(nome).get();
    if (!snap.exists) return [];
    const d = snap.data() || {};
    if (typeof d.json !== 'string') return [];
    try { const v = JSON.parse(d.json); return Array.isArray(v) ? v : []; } catch (_) { return []; }
}
/* Le stesse regole dell'area riservata (risolutorePersone in app.js) e di
   api/cron-comunicazioni.js: sugli incarichi le persone sono scritte per
   etichetta - il cognome, o "Cognome Nome" quando il cognome e' di due. */
function dividiNomi(testo) { return String(testo || '').split(/[,;]|\s+-\s*|\s*-\s+/).map(t => t.trim()).filter(Boolean); }
function etichettaPersona(p, lista) {
    const cog = String((p && p.nome) || '').trim();
    if (!cog) return '';
    const np = String(p.nomeProprio || '').trim();
    if (!np) return cog;
    const condiviso = (lista || []).some(x => x && x.id !== p.id && x.attivo && !x.eliminato
        && String(x.nome || '').trim().toLowerCase() === cog.toLowerCase());
    return condiviso ? (cog + ' ' + np) : cog;
}
function risolutorePersone(lista) {
    lista = (lista || []).filter(Boolean);
    const perEt = new Map(), perPieno = new Map(), perCog = new Map();
    lista.filter(p => p.attivo && !p.eliminato).concat(lista.filter(p => !p.attivo && !p.eliminato)).concat(lista.filter(p => p.eliminato)).forEach(p => {
        const et = etichettaPersona(p, lista).toLowerCase();
        if (et && !perEt.has(et)) perEt.set(et, p);
        const np = String(p.nomeProprio || '').trim();
        if (np) { const f = (String(p.nome || '').trim() + ' ' + np).toLowerCase(); if (!perPieno.has(f)) perPieno.set(f, p); }
        const cg = String(p.nome || '').trim().toLowerCase();
        if (cg && !perCog.has(cg)) perCog.set(cg, p);
    });
    return str => { const t = String(str || '').trim().toLowerCase(); return t ? (perEt.get(t) || perPieno.get(t) || perCog.get(t) || null) : null; };
}
function nomePersona(p) { return p ? ((p.nomeProprio ? String(p.nomeProprio).trim() + ' ' : '') + String(p.nome || '').trim()).trim() : ''; }

/* In che veste una persona compare su un incarico: [] se non c'entra. */
function ruoliSuIncarico(inc, idPersone, risolvi) {
    const cita = campo => dividiNomi(campo).some(t => { const x = risolvi(t); return !!x && idPersone.has(x.id); });
    const r = [];
    if (cita(inc.respIncarico)) r.push('responsabile');
    if (cita(inc.qualita)) r.push('qualita');
    if (cita(inc.team)) r.push('team');
    return r;
}
const STATI_ESCLUSI = ['proposta', 'nonAccettato'];     // un incarico mai partito non ha circolarizzazioni
function incaricoBreve(inc, ruoli, risolvi) {
    const nomi = campo => dividiNomi(campo).map(t => nomePersona(risolvi(t)) || t).join(', ');
    return {
        id: String(inc.id), cliente: String(inc.cliente || ''), stato: String(inc.stato || 'attivo'),
        responsabile: nomi(inc.respIncarico), qualita: nomi(inc.qualita), team: nomi(inc.team),
        ruoli: ruoli || []
    };
}
async function impostazioni(db) {
    let d = {};
    try { const s = await docImpostazioni(db).get(); d = s.exists ? (s.data() || {}) : {}; } catch (_) { d = {}; }
    return { supervisori: Array.isArray(d.supervisori) ? d.supervisori.map(x => String(x).toLowerCase()) : [] };
}
/* `ue` e' il risultato di utenteEffettivo(): per un collaboratore valgono i
   permessi del suo utente di riferimento, e nei timbri resta chi ha agito. */
async function profilo(db, ue) {
    const email = String(ue.email || '').toLowerCase();
    const sessione = String((ue.sessione && ue.sessione.email) || email).toLowerCase();
    const imp = await impostazioni(db);
    const admin = ue.ruolo === 'admin' || email === PROPRIETARIO;
    const supervisore = imp.supervisori.indexOf(email) >= 0 || imp.supervisori.indexOf(sessione) >= 0;
    const incarichi = await leggiArchivio(db, 'incarichi');
    const persone = await leggiArchivio(db, 'persone');
    const risolvi = risolutorePersone(persone);
    const mie = new Set(persone.filter(p => p && !p.eliminato && String(p.email || '').trim().toLowerCase() === email).map(p => p.id));
    const visibili = [];
    incarichi.forEach(inc => {
        if (!inc || !inc.id || STATI_ESCLUSI.indexOf(String(inc.stato || '')) >= 0) return;
        const ruoli = mie.size ? ruoliSuIncarico(inc, mie, risolvi) : [];
        if (admin || supervisore || ruoli.length) visibili.push(incaricoBreve(inc, ruoli, risolvi));
    });
    const nome = String((ue.sessione && ue.sessione.nome) || (ue.dati && ue.dati.nome) || sessione);
    return {
        email: sessione, effettivo: email, nome: nome, admin: admin, supervisore: supervisore,
        vedeTutto: admin || supervisore, incarichi: visibili,
        firma: nome + ' <' + sessione + '>'
    };
}
function incaricoDi(prof, incaricoId) {
    return (prof.incarichi || []).find(i => i.id === String(incaricoId)) || null;
}

/* ============================================================
   LO STATO DI UNA SCHEDA
   Funzioni pure: dallo stato dei passi allo stato che si legge
   in tabella, e al prossimo momento in cui il giro deve tornarci.
   ============================================================ */
function passo(inv, nome) { return ((inv && inv.passi) || {})[nome] || { stato: 'non-previsto' }; }
function inviato(p) { return !!p && p.stato === 'inviato'; }
function esitoPasso(p) { return inviato(p) || (p && p.stato === 'invio') ? D.esitoDa(p) : ''; }

function statoDi(inv) {
    const p = passo(inv, 'primo');
    if (inv.annullato) return 'annullata';
    if (p.stato === 'bozza') return 'bozza';
    if (inv.risposta) return 'risposta';
    if (p.stato === 'coda' || p.stato === 'invio') return 'coda';
    if (p.stato === 'errore') return 'errore';
    const e = D.esitoDa(p);
    if (e === 'consegnata') return 'consegnata';
    if (e === 'non-accettata' || e === 'non-consegnata') return 'errore';
    if (e === 'in-dubbio') return 'in-dubbio';
    return 'inviata';
}
/* Quando il giro deve riguardare questa scheda (ms), o null se non c'e'
   niente in programma. E' il campo su cui il giro interroga. */
function prossimoDi(inv) {
    if (inv.annullato) return null;
    const p = passo(inv, 'primo');
    if (p.stato === 'coda') return Number(p.previsto) || 0;
    if (p.stato === 'invio') return Number(p.verificaIl) || 0;
    if (p.stato !== 'inviato') return null;
    for (const n of ['sollecito1', 'sollecito2']) {
        const s = passo(inv, n);
        if (s.stato === 'invio') return Number(s.verificaIl) || 0;
        if (s.stato === 'coda' || s.stato === 'programmato') return Number(s.previsto) || 0;
    }
    return null;
}
/* Il passo che tocca adesso, se ce n'e' uno. */
function passoDovuto(inv, ora) {
    if (inv.annullato) return '';
    for (const n of C.PASSI) {
        const s = passo(inv, n);
        if (n !== 'primo' && !inviato(passo(inv, 'primo'))) return '';
        if (s.stato === 'invio') return (Number(s.verificaIl) || 0) <= ora ? n : '';
        if (s.stato === 'coda' || s.stato === 'programmato') return (Number(s.previsto) || 0) <= ora ? n : '';
    }
    return '';
}
/* Ferma i solleciti non ancora partiti. Torna true se ha cambiato qualcosa. */
function bloccaSolleciti(inv, motivo, per) {
    let cambiato = false;
    ['sollecito1', 'sollecito2'].forEach(n => {
        const sol = inv.passi[n];
        if (sol && (sol.stato === 'programmato' || sol.stato === 'coda')) {
            inv.passi[n] = Object.assign({}, sol, { stato: 'bloccato', motivo: motivo, per: per });
            cambiato = true;
        }
    });
    return cambiato;
}
/* Rimette in programma i solleciti fermati per un certo motivo, se la loro
   data non e' ancora passata. */
function sbloccaSolleciti(inv, per, ora) {
    ['sollecito1', 'sollecito2'].forEach(n => {
        const sol = inv.passi[n];
        if (sol && sol.stato === 'bloccato' && sol.per === per) {
            if ((Number(sol.previsto) || 0) > ora) { const c = Object.assign({}, sol, { stato: 'programmato' }); delete c.motivo; delete c.per; inv.passi[n] = c; }
            else inv.passi[n] = Object.assign({}, sol, { motivo: 'La data programmata è trascorsa: indica una nuova data.', per: 'scaduto' });
        }
    });
}
/* Ricalcola i campi derivati prima di ogni scrittura. */
function chiudi(inv, ora) {
    inv.stato = statoDi(inv);
    inv.prossimo = prossimoDi(inv);
    inv.aggiornato = ora;
    /* Quando il PDF si toglie dal portale: un anno (CIRC_PDF_GIORNI) dopo che
       la lettera e' stata preparata. Mai prima dell'ultimo passo in programma:
       un sollecito deve poterlo riallegare. */
    if (inv.allegato && !inv.allegato.tolto) {
        const nata = Number((inv.creato || {}).il) || ora;
        inv.allegatoFino = inv.stato === 'bozza' ? null : Math.max(nata + C.LIMITI.pdfGiorni * GIORNO, inv.prossimo != null ? inv.prossimo + GIORNO : 0);
    }
    return inv;
}
function segnaSporco(tx, db, inv) {
    tx.set(db.collection(INC).doc(String(inv.incaricoId)), { cliente: String(inv.cliente || ''), sporco: true }, { merge: true });
}

/* I conteggi di un incarico, dalle sue schede. `oggi` = giorno di Roma. */
function conteggi(schede, oggi) {
    const c = {
        totale: 0, inCoda: 0, inviate: 0, consegnate: 0, errori: 0, inDubbio: 0, risposte: 0, senzaRisposta: 0, scadute: 0, annullate: 0,
        sollecito1: { programmati: 0, inviati: 0, bloccati: 0 }, sollecito2: { programmati: 0, inviati: 0, bloccati: 0 },
        ultimoInvio: 0, ultimaRisposta: 0
    };
    (schede || []).forEach(inv => {
        const st = inv.stato || statoDi(inv);
        if (st === 'bozza') return;
        if (st === 'annullata') { c.annullate++; return; }
        c.totale++;
        const p = passo(inv, 'primo');
        if (inviato(p)) { c.inviate++; c.ultimoInvio = Math.max(c.ultimoInvio, Number(p.inviatoIl) || 0); }
        if (st === 'coda') c.inCoda++;
        if (D.esitoDa(p) === 'consegnata') c.consegnate++;
        if (st === 'errore') c.errori++;
        if (st === 'in-dubbio') c.inDubbio++;
        if (inv.risposta) { c.risposte++; c.ultimaRisposta = Math.max(c.ultimaRisposta, Number(inv.risposta.il) || 0); }
        else if (inviato(p) && st !== 'errore') {
            c.senzaRisposta++;
            if (inv.scadenza && inv.scadenza < oggi) c.scadute++;
        }
        ['sollecito1', 'sollecito2'].forEach(n => {
            const sol = passo(inv, n);
            if (sol.stato === 'programmato' || sol.stato === 'coda' || sol.stato === 'invio') c[n].programmati++;
            else if (sol.stato === 'inviato') c[n].inviati++;
            else if (sol.stato === 'bloccato') c[n].bloccati++;
        });
    });
    return c;
}

/* ============================================================
   LETTURE
   ============================================================ */
function conId(snap) { return Object.assign({ id: snap.id }, snap.data() || {}); }
async function schedeIncarico(db, incaricoId) {
    const q = await db.collection(INVII).where('incaricoId', '==', String(incaricoId)).get();
    return q.docs.map(conId).filter(x => x.stato !== 'bozza')
        .sort((a, b) => (Number((a.creato || {}).il) || 0) - (Number((b.creato || {}).il) || 0));
}
async function leggi(db, id) {
    const snap = await db.collection(INVII).doc(String(id)).get();
    return snap.exists ? conId(snap) : null;
}
/* I conteggi degli incarichi indicati (o di tutti quelli che hanno schede,
   con `ids` null). Quelli segnati "sporco" si rifanno dalle schede: e' cosi'
   che i numeri restano giusti senza tenere contatori da incrementare. */
async function riepiloghi(db, ids) {
    const oggi = C.giornoRoma();
    let docs;
    if (ids) {
        docs = [];
        for (const id of ids) { const s = await db.collection(INC).doc(String(id)).get(); if (s.exists) docs.push(s); }
    } else {
        docs = (await db.collection(INC).get()).docs;
    }
    const out = {};
    for (const s of docs) {
        const d = s.data() || {};
        // i conteggi "scadute" cambiano col calendario: si rifanno anche al cambio di giorno
        if (d.sporco || !d.conteggi || d.giorno !== oggi) {
            const schede = await schedeIncarico(db, s.id);
            d.conteggi = conteggi(schede, oggi);
            d.giorno = oggi;
            try { await db.collection(INC).doc(s.id).set({ conteggi: d.conteggi, giorno: oggi, sporco: false, aggiornato: Date.now() }, { merge: true }); } catch (_) { /* si rifaranno */ }
        }
        out[s.id] = { cliente: String(d.cliente || ''), conteggi: d.conteggi };
    }
    return out;
}

/* ============================================================
   UNA NUOVA LETTERA
   Prima la scheda in bozza, poi il PDF a pezzi, e solo quando il
   file e' arrivato intero ed e' davvero un PDF la scheda entra in
   coda: una lettera non puo' partire senza il suo allegato.
   ============================================================ */
async function riservaCodice(db, idInvio) {
    for (let i = 0; i < 8; i++) {
        const codice = C.codiceNuovo();
        const rif = db.collection(RIF).doc('c~' + codice);
        const preso = await db.runTransaction(async tx => {
            const s = await tx.get(rif);
            if (s.exists) return false;
            tx.set(rif, { invio: idInvio, passo: '', codice: codice, quando: Date.now() });
            return true;
        });
        if (preso) return codice;
    }
    throw new Error('riferimento non assegnato');
}
async function doppioni(db, incaricoId, pec) {
    const q = await db.collection(INVII).where('incaricoId', '==', String(incaricoId)).where('pec', '==', String(pec)).get();
    return q.docs.map(conId).filter(x => x.stato !== 'bozza' && x.stato !== 'annullata');
}
async function crea(db, prof, inc, dati, opz) {
    opz = opz || {};
    if (!opz.forza) {
        const gia = await doppioni(db, inc.id, dati.pec);
        if (gia.length) {
            return {
                ok: false, doppione: true,
                msg: 'Per questo incarico c\'è già una lettera a ' + dati.pec + ' (' + gia[0].destinatario + ', rif. ' + gia[0].codice + ').'
            };
        }
    }
    const ora = Date.now();
    const rif = db.collection(INVII).doc();
    const codice = await riservaCodice(db, rif.id);
    const sollecito = x => x ? { stato: 'programmato', data: x.data, scadenza: x.scadenza, previsto: C.istanteRoma(x.data, C.LIMITI.oraSollecito) } : { stato: 'non-previsto' };
    const inv = {
        incaricoId: String(inc.id), cliente: String(inc.cliente || ''),
        destinatario: dati.destinatario, pec: dati.pec, categoria: dati.categoria,
        bilancio: dati.bilancio, scadenza: dati.scadenza, codice: codice,
        allegato: Object.assign({}, dati.allegato, { sha256: '' }), allegatoFino: null,
        creato: { il: ora, da: prof.email, nome: prof.nome },
        passi: { primo: { stato: 'bozza' }, sollecito1: sollecito(dati.sollecito1), sollecito2: sollecito(dati.sollecito2) },
        risposta: null, risposte: [], messaggi: [], annullato: null,
        stato: 'bozza', prossimo: null, aggiornato: ora
    };
    await rif.set(inv);
    return { ok: true, id: rif.id, codice: codice, pezzi: dati.allegato.pezzi, pezzoByte: C.LIMITI.pezzoByte };
}
function nomePezzo(n) { return ('000' + n).slice(-4); }
async function leggiAllegato(db, id, pezzi) {
    const parti = [];
    for (let n = 0; n < pezzi; n++) {
        const s = await db.collection(INVII).doc(id).collection(PEZZI).doc(nomePezzo(n)).get();
        if (!s.exists) return null;
        const v = (s.data() || {}).dati;
        parti.push(Buffer.isBuffer(v) ? v : Buffer.from(v && v.toUint8Array ? v.toUint8Array() : (v || [])));
    }
    return Buffer.concat(parti);
}
async function togliAllegato(db, id, pezzi) {
    for (let n = 0; n < (Number(pezzi) || 0); n++) {
        try { await db.collection(INVII).doc(id).collection(PEZZI).doc(nomePezzo(n)).delete(); } catch (_) { /* resta un pezzo: non fa danni */ }
    }
}
/* Un pezzo del PDF. Con l'ultimo il file si ricompone e si controlla; se e'
   a posto la scheda entra in coda e la PEC puo' partire. */
async function caricaPezzo(db, prof, id, n, base64) {
    const rif = db.collection(INVII).doc(String(id));
    const snap = await rif.get();
    if (!snap.exists) return { ok: false, stato: 404, msg: 'Lettera non trovata.' };
    const inv = snap.data() || {};
    if (inv.stato !== 'bozza') return { ok: false, stato: 409, msg: 'L\'allegato di questa lettera è già stato caricato.' };
    if (String((inv.creato || {}).da) !== prof.email) return { ok: false, stato: 403, msg: 'L\'allegato va caricato da chi ha preparato la lettera.' };
    const a = inv.allegato || {};
    n = Math.round(Number(n));
    if (!(n >= 0 && n < a.pezzi)) return { ok: false, stato: 400, msg: 'Pezzo dell\'allegato non valido.' };
    let buf;
    try { buf = Buffer.from(String(base64 || ''), 'base64'); } catch (_) { buf = Buffer.alloc(0); }
    const atteso = n === a.pezzi - 1 ? a.dimensione - C.LIMITI.pezzoByte * (a.pezzi - 1) : C.LIMITI.pezzoByte;
    if (buf.length !== atteso) return { ok: false, stato: 400, msg: 'L\'allegato è arrivato incompleto: riprova.' };
    await rif.collection(PEZZI).doc(nomePezzo(n)).set({ dati: buf });
    if (n < a.pezzi - 1) return { ok: true, completo: false };

    const tutto = await leggiAllegato(db, String(id), a.pezzi);
    if (!tutto || tutto.length !== a.dimensione) return { ok: false, stato: 400, msg: 'L\'allegato è arrivato incompleto: riprova.' };
    if (tutto.slice(0, 1024).indexOf('%PDF-') < 0) {
        await togliAllegato(db, String(id), a.pezzi);
        await rif.delete();
        return { ok: false, stato: 400, msg: 'Il file "' + a.nome + '" non è un PDF: salva la lettera in PDF e riprova.' };
    }
    const impronta = crypto.createHash('sha256').update(tutto).digest('hex');
    const esito = await db.runTransaction(async tx => {
        const s = await tx.get(rif);
        if (!s.exists) return null;
        const v = s.data() || {};
        if (v.stato !== 'bozza') return v;
        const ora = Date.now();
        v.allegato = Object.assign({}, v.allegato, { sha256: impronta });
        v.passi = Object.assign({}, v.passi, { primo: { stato: 'coda', previsto: ora, tentativi: 0 } });
        chiudi(v, ora);
        tx.set(rif, v);
        segnaSporco(tx, db, v);
        return v;
    });
    return esito ? { ok: true, completo: true, id: String(id), codice: esito.codice } : { ok: false, stato: 404, msg: 'Lettera non trovata.' };
}

/* ============================================================
   L'INDICE DEI RIFERIMENTI
   ============================================================ */
function chiaviMsgId(v) { return ['m~' + D.chiaveMsgId(v), 'lp~' + D.parteLocale(v)]; }
async function trovaRiferimento(db, chiavi) {
    for (const k of chiavi) {
        if (!k || /~$/.test(k)) continue;
        try {
            const s = await db.collection(RIF).doc(k).get();
            if (s.exists && (s.data() || {}).invio) return Object.assign({ via: k.split('~')[0] }, s.data());
        } catch (_) { /* si prova la prossima */ }
    }
    return null;
}

/* ============================================================
   IL GIRO: prendere un passo, e scriverne l'esito
   ============================================================ */
/* Prende in carico il passo dovuto. Tutto in una transazione, cosi' due giri
   partiti insieme non spediscono due volte la stessa PEC. Torna
   { invio, passo, riferimento } quando c'e' da spedire, altrimenti
   { saltato: motivo }.
   `lettoreOk`: l'ultima lettura riuscita della casella (ms). Un passo
   rimasto "in invio" si rispedisce solo se dopo la partenza la casella e'
   stata letta e l'accettazione non c'e': se la funzione si era fermata a
   meta' non sappiamo se la PEC fosse partita, e la ricevuta di accettazione
   e' l'unica cosa che lo dice. */
async function prendi(db, id, ora, lettoreOk) {
    const rif = db.collection(INVII).doc(String(id));
    return db.runTransaction(async tx => {
        const s = await tx.get(rif);
        if (!s.exists) return { saltato: 'sparita' };
        const inv = s.data() || {};
        const n = passoDovuto(inv, ora);
        if (!n) {
            // il campo `prossimo` era rimasto indietro: lo si riallinea e basta
            const p = prossimoDi(inv);
            if (p !== inv.prossimo) { chiudi(inv, ora); tx.set(rif, inv); }
            return { saltato: 'niente da fare' };
        }
        let p = Object.assign({}, inv.passi[n]);
        const salva = motivo => { inv.passi = Object.assign({}, inv.passi, { [n]: p }); chiudi(inv, ora); tx.set(rif, inv); segnaSporco(tx, db, inv); return { saltato: motivo }; };

        if (p.stato === 'invio') {
            if (p.accettata || p.consegnata) { p.stato = 'inviato'; p.inviatoIl = p.inviatoIl || (p.accettata || p.consegnata).quando || ora; return salva('gia partito'); }
            if (!(lettoreOk > (Number(p.avviatoIl) || 0) + 5 * MINUTO)) { p.verificaIl = ora + 10 * MINUTO; return salva('in verifica'); }
            // la casella e' stata letta dopo la partenza e l'accettazione non c'e': non era partito
        }
        if (n !== 'primo') {
            if (inv.risposta) { bloccaSolleciti(inv, 'Risposta ricevuta il ' + C.dataBreve(C.giornoRoma(inv.risposta.il)) + '.', 'risposta'); p = inv.passi[n]; return salva('risposta'); }
            const e = D.esitoDa(passo(inv, 'primo'));
            if (e === 'non-accettata' || e === 'non-consegnata') { bloccaSolleciti(inv, 'La prima PEC non è stata consegnata: correggi l\'indirizzo e reinvia.', 'recapito'); p = inv.passi[n]; return salva('recapito'); }
        }
        if ((Number(p.tentativi) || 0) >= MAX_TENTATIVI) {
            p.stato = 'errore';
            p.errore = p.errore || 'Invio non riuscito dopo ' + MAX_TENTATIVI + ' tentativi.';
            return salva('troppi tentativi');
        }
        if (!inv.allegato || inv.allegato.tolto) { p.stato = 'errore'; p.errore = 'Il PDF della lettera non è più sul portale: prepara una nuova lettera.'; return salva('senza allegato'); }

        const riferimento = C.riferimentoNuovo();
        p.stato = 'invio';
        p.riferimento = riferimento;
        p.riferimenti = (p.riferimenti || []).concat([riferimento]).slice(-MAX_TENTATIVI);
        p.avviatoIl = ora;
        p.verificaIl = ora + VERIFICA_MS;
        p.tentativi = (Number(p.tentativi) || 0) + 1;
        delete p.errore;
        inv.passi = Object.assign({}, inv.passi, { [n]: p });
        chiudi(inv, ora);
        tx.set(rif, inv);
        // l'indice si scrive PRIMA di spedire: la ricevuta puo' arrivare in pochi secondi
        chiaviMsgId(riferimento).forEach(k => tx.set(db.collection(RIF).doc(k), { invio: String(id), passo: n, destinatario: inv.pec, quando: ora }));
        return { invio: Object.assign({ id: String(id) }, inv), passo: n, riferimento: riferimento };
    });
}
/* L'esito della consegna al server di posta. `esito`: { ok } oppure
   { ok: false, msg, riprova } (riprova = il rifiuto riguarda noi, non il
   destinatario: si rimette in coda). */
async function esitoInvio(db, id, n, riferimento, esito) {
    const rif = db.collection(INVII).doc(String(id));
    return db.runTransaction(async tx => {
        const s = await tx.get(rif);
        if (!s.exists) return null;
        const inv = s.data() || {};
        const p = Object.assign({}, inv.passi[n]);
        if (p.riferimento !== riferimento || p.stato !== 'invio') return inv;     // nel frattempo e' cambiato: non si tocca
        const ora = Date.now();
        if (esito.ok) { p.stato = 'inviato'; p.inviatoIl = ora; delete p.verificaIl; delete p.errore; }
        else if (esito.riprova) { p.stato = 'coda'; p.previsto = ora + RIPROVA_MS; p.errore = String(esito.msg || '').slice(0, 300); }
        else { p.stato = 'errore'; p.errore = String(esito.msg || 'Invio non riuscito.').slice(0, 300); }
        inv.passi = Object.assign({}, inv.passi, { [n]: p });
        if (n === 'primo' && p.stato === 'errore') bloccaSolleciti(inv, 'La prima PEC non è partita: correggi l\'indirizzo e reinvia.', 'recapito');
        chiudi(inv, ora);
        tx.set(rif, inv);
        segnaSporco(tx, db, inv);
        return inv;
    });
}

/* ============================================================
   RICEVUTE E RISPOSTE (le scrive il lettore della casella)
   ============================================================ */
/* Un fatto letto da una ricevuta, sul passo a cui si riferisce. I fatti sono
   monotoni: rileggere la stessa ricevuta non cambia niente, e un preavviso in
   ritardo non cancella una consegna gia' registrata. */
async function applicaRicevuta(db, dove, fatto, coordinate) {
    const rif = db.collection(INVII).doc(String(dove.invio));
    return db.runTransaction(async tx => {
        const s = await tx.get(rif);
        if (!s.exists) return { ok: false };
        const inv = s.data() || {};
        const n = dove.passo;
        if (!inv.passi || !inv.passi[n]) return { ok: false };
        const p = Object.assign({}, inv.passi[n]);
        const ora = Date.now();
        let cambiato = false;
        if (fatto.genere === 'accettata' && !p.accettata) { p.accettata = { quando: fatto.quando, gestore: fatto.gestore || '', identificativo: fatto.identificativo || '' }; cambiato = true; }
        if (fatto.genere === 'consegnata' && !p.consegnata) { p.consegnata = { quando: fatto.quando, destinatario: fatto.destinatario || '' }; cambiato = true; }
        if (fatto.genere === 'problema') {
            const vecchio = p.problema;
            if (!vecchio || (Number(fatto.gravita) || 0) > (Number(vecchio.gravita) || 0)) {
                p.problema = { quando: fatto.quando, tipo: fatto.tipo, motivo: String(fatto.motivo || '').slice(0, 300), definitivo: !!fatto.definitivo, gravita: Number(fatto.gravita) || 1 };
                cambiato = true;
            }
        }
        // la ricevuta dice che la PEC era partita, anche se la funzione si era fermata prima di annotarlo
        if (p.stato === 'invio' && (p.accettata || p.consegnata)) { p.stato = 'inviato'; p.inviatoIl = p.inviatoIl || fatto.quando || ora; delete p.verificaIl; cambiato = true; }
        if (p.stato === 'invio' && p.problema && p.problema.tipo === 'non-accettazione') { p.stato = 'inviato'; p.inviatoIl = p.inviatoIl || fatto.quando || ora; delete p.verificaIl; cambiato = true; }
        p.esito = D.esitoDa(p);
        const messaggi = Array.isArray(inv.messaggi) ? inv.messaggi.slice() : [];
        if (coordinate && coordinate.chiave && !messaggi.some(m => m.chiave === coordinate.chiave)) {
            messaggi.push({ chiave: coordinate.chiave, uid: coordinate.uid, uidValidity: coordinate.uidValidity, quando: fatto.quando || ora, tipo: fatto.etichetta || fatto.genere, passo: n, dimensione: Number(coordinate.dimensione) || 0 });
            cambiato = true;
        }
        if (!cambiato) return { ok: true, cambiato: false };
        inv.messaggi = messaggi.slice(-40);
        inv.passi = Object.assign({}, inv.passi, { [n]: p });
        if (n === 'primo' && (p.esito === 'non-accettata' || p.esito === 'non-consegnata')) {
            bloccaSolleciti(inv, 'La prima PEC non è stata consegnata: correggi l\'indirizzo e reinvia.', 'recapito');
        }
        chiudi(inv, ora);
        tx.set(rif, inv);
        segnaSporco(tx, db, inv);
        return { ok: true, cambiato: true, incaricoId: inv.incaricoId };
    });
}
/* Una risposta sulla scheda. Ferma i solleciti non ancora partiti: e' la
   regola piu' importante di tutte, chi ha risposto non va sollecitato.
   `r`: { chiave, uid, uidValidity, quando, da, oggetto, certificata,
   automatica, allegati, dimensione, via, associataDa }. */
async function registraRisposta(db, idInvio, r) {
    const rif = db.collection(INVII).doc(String(idInvio));
    return db.runTransaction(async tx => {
        const s = await tx.get(rif);
        if (!s.exists) return { ok: false, msg: 'Lettera non trovata.' };
        const inv = s.data() || {};
        const risposte = Array.isArray(inv.risposte) ? inv.risposte.slice() : [];
        // la stessa risposta riletta con un altro numero (il gestore ha rigenerato la cartella) e' sempre lei
        if (risposte.some(x => x.chiave === r.chiave || (r.quando && x.quando === r.quando && x.da === String(r.da || '').slice(0, 200) && x.oggetto === String(r.oggetto || '').slice(0, 250)))) {
            return { ok: true, cambiato: false, incaricoId: inv.incaricoId };
        }
        const ora = Date.now();
        risposte.push({
            chiave: r.chiave, uid: r.uid, uidValidity: r.uidValidity, quando: r.quando || ora,
            da: String(r.da || '').slice(0, 200), oggetto: String(r.oggetto || '').slice(0, 250),
            certificata: !!r.certificata, automatica: !!r.automatica, via: String(r.via || ''),
            allegati: (r.allegati || []).slice(0, 20), dimensione: Number(r.dimensione) || 0,
            associataDa: r.associataDa || null
        });
        risposte.sort((a, b) => (a.quando || 0) - (b.quando || 0));
        inv.risposte = risposte.slice(-30);
        if (!r.automatica) {
            const prima = inv.risposta;
            if (!prima || prima.modo === 'manuale' || (r.quando || ora) < (prima.il || 0)) {
                inv.risposta = { il: r.quando || ora, modo: r.certificata ? 'pec' : 'email', da: String(r.da || '').slice(0, 200) };
            }
            bloccaSolleciti(inv, 'Risposta ricevuta il ' + C.dataBreve(C.giornoRoma(inv.risposta.il)) + '.', 'risposta');
        }
        chiudi(inv, ora);
        tx.set(rif, inv);
        segnaSporco(tx, db, inv);
        return { ok: true, cambiato: true, incaricoId: inv.incaricoId, cliente: inv.cliente };
    });
}
/* Le schede a cui potrebbe riferirsi una risposta arrivata da `indirizzo`,
   quando ne' il messaggio a cui risponde ne' il riferimento nell'oggetto
   bastano a dirlo. Solo lettere partite e non annullate. */
async function candidatiPerIndirizzo(db, indirizzo) {
    if (!indirizzo) return [];
    const q = await db.collection(INVII).where('pec', '==', String(indirizzo).toLowerCase()).get();
    return q.docs.map(conId).filter(x => x.stato !== 'bozza' && x.stato !== 'annullata' && inviato(passo(x, 'primo')));
}

/* ============================================================
   LE AZIONI DI CHI LAVORA SULL'INCARICO
   ============================================================ */
async function cambia(db, id, fn) {
    const rif = db.collection(INVII).doc(String(id));
    return db.runTransaction(async tx => {
        const s = await tx.get(rif);
        if (!s.exists) return { ok: false, stato: 404, msg: 'Lettera non trovata.' };
        const inv = s.data() || {};
        const ora = Date.now();
        const esito = fn(inv, ora);
        if (esito && esito.ok === false) return esito;
        chiudi(inv, ora);
        tx.set(rif, inv);
        segnaSporco(tx, db, inv);
        return Object.assign({ ok: true, invio: Object.assign({ id: String(id) }, inv) }, esito || {});
    });
}
function modificaSolleciti(db, id, nuovi, prof) {
    const oggi = C.giornoRoma();
    return cambia(db, id, (inv, ora) => {
        if (inv.annullato) return { ok: false, stato: 409, msg: 'Questa lettera è stata annullata.' };
        if (inv.risposta) return { ok: false, stato: 409, msg: 'La risposta è già arrivata: i solleciti non servono più.' };
        let dopo = { giorno: oggi, a: 'a oggi' };
        for (const n of ['sollecito1', 'sollecito2']) {
            const attuale = passo(inv, n), x = (nuovi || {})[n];
            if (attuale.stato === 'inviato' || attuale.stato === 'invio') { dopo = { giorno: attuale.data || oggi, a: 'al primo sollecito' }; continue; }
            if (x === undefined) { if (attuale.data) dopo = { giorno: attuale.data, a: 'al primo sollecito' }; continue; }
            if (!x || !x.data) { inv.passi[n] = { stato: 'non-previsto' }; continue; }
            const etichetta = n === 'sollecito1' ? 'primo sollecito' : 'secondo sollecito';
            if (n === 'sollecito2' && passo(inv, 'sollecito1').stato === 'non-previsto') return { ok: false, stato: 400, msg: 'Il secondo sollecito si può programmare solo insieme al primo.' };
            if (!C.giornoValido(x.data) || x.data <= dopo.giorno) return { ok: false, stato: 400, msg: 'La data del ' + etichetta + ' deve essere successiva ' + dopo.a + '.' };
            if (!C.giornoValido(x.scadenza) || x.scadenza <= x.data) return { ok: false, stato: 400, msg: 'Nel ' + etichetta + ' la data entro cui rispondere deve essere successiva alla data del sollecito.' };
            inv.passi[n] = { stato: 'programmato', data: x.data, scadenza: x.scadenza, previsto: C.istanteRoma(x.data, C.LIMITI.oraSollecito), modificato: { il: ora, da: prof.firma } };
            dopo = { giorno: x.data, a: 'al primo sollecito' };
        }
        return null;
    });
}
function annulla(db, id, prof) {
    return cambia(db, id, (inv, ora) => {
        const p = passo(inv, 'primo');
        if (p.stato === 'invio') return { ok: false, stato: 409, msg: 'La PEC sta partendo in questo momento: riprova fra un minuto.' };
        if (p.stato === 'bozza' || p.stato === 'coda' || p.stato === 'errore') { inv.annullato = { il: ora, da: prof.firma }; return { cosa: 'lettera' }; }
        let n = 0;
        ['sollecito1', 'sollecito2'].forEach(k => {
            const sol = passo(inv, k);
            if (sol.stato === 'programmato' || sol.stato === 'coda') { inv.passi[k] = Object.assign({}, sol, { stato: 'annullato', motivo: 'Annullato da ' + prof.nome + '.', per: 'annullato' }); n++; }
        });
        if (!n) return { ok: false, stato: 409, msg: 'Non ci sono solleciti in programma da annullare.' };
        return { cosa: 'solleciti' };
    });
}
/* La risposta e' arrivata per un'altra strada (posta ordinaria al team,
   consegna a mano): si segna, e i solleciti si fermano. */
function rispostaManuale(db, id, nota, prof) {
    return cambia(db, id, (inv, ora) => {
        if (inv.risposta && inv.risposta.modo !== 'manuale') return { ok: false, stato: 409, msg: 'La risposta è già registrata.' };
        if (!inviato(passo(inv, 'primo'))) return { ok: false, stato: 409, msg: 'La lettera non è ancora partita.' };
        inv.risposta = { il: ora, modo: 'manuale', da: prof.firma, nota: C.unaRiga(nota, 300) };
        bloccaSolleciti(inv, 'Risposta registrata a mano il ' + C.dataBreve(C.giornoRoma(ora)) + '.', 'manuale');
        return null;
    });
}
function togliRispostaManuale(db, id) {
    return cambia(db, id, (inv, ora) => {
        if (!inv.risposta || inv.risposta.modo !== 'manuale') return { ok: false, stato: 409, msg: 'Su questa lettera non c\'è una risposta registrata a mano.' };
        inv.risposta = null;
        sbloccaSolleciti(inv, 'manuale', ora);
        return null;
    });
}
/* La prima PEC non e' arrivata: si corregge l'indirizzo e si rimanda. La
   storia del tentativo precedente resta sulla scheda. */
function reinvia(db, id, pec, prof) {
    pec = C.unaRiga(pec, 200).toLowerCase();
    return cambia(db, id, (inv, ora) => {
        if (inv.annullato) return { ok: false, stato: 409, msg: 'Questa lettera è stata annullata.' };
        if (statoDi(inv) !== 'errore') return { ok: false, stato: 409, msg: 'Si può reinviare solo una lettera non consegnata.' };
        if (!C.EMAIL_RE.test(pec)) return { ok: false, stato: 400, msg: 'L\'indirizzo PEC non è valido.' };
        if (!inv.allegato || inv.allegato.tolto) return { ok: false, stato: 409, msg: 'Il PDF della lettera non è più sul portale: prepara una nuova lettera.' };
        const vecchio = passo(inv, 'primo');
        inv.storico = (inv.storico || []).concat([{ il: ora, da: prof.firma, pec: inv.pec, esito: D.esitoDa(vecchio), errore: vecchio.errore || (vecchio.problema || {}).motivo || '' }]).slice(-10);
        inv.pec = pec;
        inv.passi = Object.assign({}, inv.passi, { primo: { stato: 'coda', previsto: ora, tentativi: 0 } });
        sbloccaSolleciti(inv, 'recapito', ora);
        return null;
    });
}

/* ============================================================
   L'AMMINISTRATORE: risposte non associate, cancellazioni
   ============================================================ */
async function nonAssociate(db) {
    const q = await db.collection(MSG).where('stato', '==', 'non-associato').get();
    return q.docs.map(conId).sort((a, b) => (b.quando || 0) - (a.quando || 0)).slice(0, 300);
}
async function associa(db, chiave, idInvio, prof) {
    const rifM = db.collection(MSG).doc(String(chiave));
    const sm = await rifM.get();
    if (!sm.exists) return { ok: false, stato: 404, msg: 'Messaggio non trovato.' };
    const m = sm.data() || {};
    if (m.stato !== 'non-associato') return { ok: false, stato: 409, msg: 'Questo messaggio è già stato associato o scartato.' };
    const r = await registraRisposta(db, idInvio, {
        chiave: String(chiave), uid: m.uid, uidValidity: m.uidValidity, quando: m.quando, da: m.da, oggetto: m.oggetto,
        certificata: !!m.certificata, automatica: false, allegati: m.allegati || [], dimensione: m.dimensione, via: 'manuale',
        associataDa: { il: Date.now(), da: prof.firma }
    });
    if (!r.ok) return Object.assign({ stato: 404 }, r);
    await rifM.set({ stato: 'associato', invio: String(idInvio), associataDa: prof.firma, associataIl: Date.now() }, { merge: true });
    return { ok: true, incaricoId: r.incaricoId, cliente: r.cliente };
}
async function scarta(db, chiave, prof) {
    const rifM = db.collection(MSG).doc(String(chiave));
    const sm = await rifM.get();
    if (!sm.exists) return { ok: false, stato: 404, msg: 'Messaggio non trovato.' };
    if ((sm.data() || {}).stato !== 'non-associato') return { ok: false, stato: 409, msg: 'Questo messaggio è già stato associato o scartato.' };
    await rifM.set({ stato: 'scartato', scartataDa: prof.firma, scartataIl: Date.now() }, { merge: true });
    return { ok: true };
}
/* Via tutte le lettere di un incarico: schede, PDF, indice e messaggi
   abbinati. I messaggi restano nella casella PEC, che e' l'archivio vero. */
async function cancellaIncarico(db, incaricoId) {
    const q = await db.collection(INVII).where('incaricoId', '==', String(incaricoId)).get();
    let tolte = 0;
    for (const s of q.docs) {
        const inv = s.data() || {};
        await togliAllegato(db, s.id, (inv.allegato || {}).pezzi);
        for (const coll of [RIF, MSG]) {
            const legati = await db.collection(coll).where('invio', '==', s.id).get();
            for (const l of legati.docs) { try { await db.collection(coll).doc(l.id).delete(); } catch (_) { /* resta un segnaposto */ } }
        }
        await db.collection(INVII).doc(s.id).delete();
        tolte++;
    }
    try { await db.collection(INC).doc(String(incaricoId)).delete(); } catch (_) { /* si rifa' da solo */ }
    return { ok: true, tolte: tolte };
}
/* Pulizie del giro: bozze rimaste a meta' (il caricamento del PDF si e'
   interrotto) e PDF delle lettere preparate da piu' di un anno
   (CIRC_PDF_GIORNI). La scheda resta, con ricevute e risposte. */
async function pulizia(db, ora, max) {
    let fatte = 0;
    const bozze = await db.collection(INVII).where('stato', '==', 'bozza').get();
    for (const s of bozze.docs) {
        if (fatte >= max) break;
        const inv = s.data() || {};
        if ((Number(inv.aggiornato) || 0) > ora - GIORNO) continue;
        await togliAllegato(db, s.id, (inv.allegato || {}).pezzi);
        try { await db.collection(RIF).doc('c~' + inv.codice).delete(); } catch (_) { }
        await db.collection(INVII).doc(s.id).delete();
        fatte++;
    }
    const vecchi = await db.collection(INVII).where('allegatoFino', '<=', ora).orderBy('allegatoFino').limit(Math.max(1, max - fatte)).get();
    for (const s of vecchi.docs) {
        const inv = s.data() || {};
        // c'e' ancora un passo da spedire: il PDF serve, se ne riparla dopo
        if (inv.prossimo != null) { await db.collection(INVII).doc(s.id).set({ allegatoFino: inv.prossimo + GIORNO }, { merge: true }); continue; }
        await togliAllegato(db, s.id, (inv.allegato || {}).pezzi);
        await db.collection(INVII).doc(s.id).set({ allegato: Object.assign({}, inv.allegato, { tolto: ora }), allegatoFino: null }, { merge: true });
        fatte++;
    }
    return fatte;
}

module.exports = {
    INVII, RIF, MSG, INC, PROPRIETARIO, VERIFICA_MS, RIPROVA_MS, MAX_TENTATIVI,
    profilo, incaricoDi, impostazioni, docImpostazioni,
    statoDi, prossimoDi, passoDovuto, conteggi, passo, inviato, esitoPasso,
    schedeIncarico, leggi, riepiloghi, crea, caricaPezzo, leggiAllegato,
    chiaviMsgId, trovaRiferimento, prendi, esitoInvio,
    applicaRicevuta, registraRisposta, candidatiPerIndirizzo,
    modificaSolleciti, annulla, rispostaManuale, togliRispostaManuale, reinvia,
    nonAssociate, associa, scarta, cancellaIncarico, pulizia,
    _interni: { risolutorePersone, ruoliSuIncarico, dividiNomi, bloccaSolleciti, sbloccaSolleciti, chiudi }
};
