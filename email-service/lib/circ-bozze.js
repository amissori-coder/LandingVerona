/* ============================================================
   Circolarizzazioni via PEC: la bozza delle nuove lettere
   ------------------------------------------------------------
   Chi prepara un invio riempie una tabella per tipologia di
   lettera e allega un PDF per riga. Finche' non preme "Invia"
   quel lavoro sta qui, sul portale: righe, date e PDF. Cosi' lo
   ritrova da un altro computer, non solo da quello su cui l'ha
   scritto.

   UNA BOZZA PER PERSONA, INCARICO E AREA. E' di chi la scrive: un
   collega dello stesso team ha la sua. Due persone sulla stessa
   bozza si sovrascriverebbero a vicenda senza accorgersene.

   LA STESSA PERSONA SU DUE COMPUTER. Ogni salvataggio dice da
   quale versione parte (`base`): se nel frattempo la bozza e'
   cambiata altrove il salvataggio viene rifiutato ("conflitto") e
   l'area riservata chiede quale delle due tenere. Niente viene
   sovrascritto in silenzio.

   I PDF salgono a pezzi come quelli delle lettere (un documento
   Firestore non supera 1 MB). All'invio non si ricaricano: la
   lettera prende il suo PDF direttamente da qui (`pdfDiRiga`) e la
   riga esce dalla bozza (`consuma`).

   NON RESTANO PER SEMPRE: una bozza ferma da CIRC_BOZZA_GIORNI
   (30) viene tolta dalle pulizie del giro, PDF compresi.

   La raccolta `circBozze` non ha regole Firestore: dal browser non
   si legge e non si scrive, passa tutto da /api/circolarizzazioni.
   ============================================================ */
'use strict';

const crypto = require('crypto');
const C = require('./circ-comune');

const BOZZE = 'circBozze', PDF = 'pdf';
const MAX_RIGHE = 500;
const GIORNO = 24 * 60 * 60 * 1000;
const RE_RIGA = /^[A-Za-z0-9_-]{1,40}$/;
const RE_CHIAVE = /^[A-Za-z0-9_-]{1,24}$/;

const ha = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function idBozza(email, incaricoId, ambito) {
    return crypto.createHash('sha256').update(String(email) + '\n' + String(incaricoId) + '\n' + String(ambito)).digest('hex').slice(0, 40);
}
function rifBozza(db, prof, incaricoId, ambito) { return db.collection(BOZZE).doc(idBozza(prof.email, incaricoId, ambito)); }
function nomePezzo(n) { return ('000' + n).slice(-4); }
function rifPezzo(ref, riga, n) { return ref.collection(PDF).doc(riga + '~' + nomePezzo(n)); }
function no(stato, msg) { return { ok: false, stato: stato, msg: msg }; }

/* Quello che l'area riservata manda viene ripulito campo per campo: in bozza
   si scrive anche una riga a meta' (manca la PEC, il saldo e' sbagliato),
   quindi qui non si giudica, si limita. I controlli veri li fa `crea`. */
const giorno = v => (C.giornoValido(String(v || '')) ? String(v) : '');
const orario = v => (String(v || '').trim() ? (C.orarioValido(v) || '') : '');
function pulisciRiga(r, ambito) {
    r = r || {};
    const id = String(r.id || ''), categoria = String(r.categoria || '');
    if (!RE_RIGA.test(id) || !ha(C.CATEGORIE, categoria) || C.ambitoDi(categoria) !== ambito) return null;
    const f = r.file && typeof r.file === 'object' ? r.file : null;
    return {
        id: id, categoria: categoria,
        nome: C.unaRiga(r.nome, 160), pec: C.unaRiga(r.pec, 200), saldo: C.unaRiga(r.saldo, 30), nota: C.unaRiga(r.nota, 200),
        forza: r.forza === true,
        file: f && C.unaRiga(f.nome, 140) ? { nome: C.unaRiga(f.nome, 140), peso: Math.max(0, Math.round(Number(f.peso) || 0)) } : null,
        /* Quando rispondere e quando sollecitare, riga per riga: `scad` il
           termine; per ogni sollecito il giorno (`d`), l'orario (`o`) e il
           nuovo termine (`s`). In bozza valgono anche vuoti o a meta'. */
        scad: giorno(r.scad), s1d: giorno(r.s1d), s1o: orario(r.s1o), s1s: giorno(r.s1s), s2d: giorno(r.s2d), s2o: orario(r.s2o), s2s: giorno(r.s2s)
    };
}
function pulisci(b, ambito) {
    b = b || {};
    const viste = {};
    const righe = (Array.isArray(b.righe) ? b.righe : []).slice(0, MAX_RIGHE + 1).map(r => pulisciRiga(r, ambito))
        .filter(r => r && !viste[r.id] && (viste[r.id] = 1));
    const date = {};
    Object.keys(b.date && typeof b.date === 'object' ? b.date : {}).slice(0, 12).forEach(k => {
        if (RE_CHIAVE.test(k)) date[k] = C.giornoValido(String(b.date[k] || '')) ? String(b.date[k]) : '';
    });
    const aperte = (Array.isArray(b.aperte) ? b.aperte : []).map(String).filter(k => ha(C.CATEGORIE, k) && C.ambitoDi(k) === ambito);
    return { righe: righe, date: date, s1: b.s1 !== false, s2: b.s2 !== false, aperte: aperte.filter((k, i) => aperte.indexOf(k) === i) };
}
/* La bozza come la vede l'area riservata. */
function perArea(d) {
    if (!d) return null;
    const pdf = {};
    Object.keys(d.pdf || {}).forEach(k => { const m = d.pdf[k] || {}; pdf[k] = { nome: m.nome || '', byte: m.byte || 0, pronto: !!m.pronto }; });
    return {
        versione: Number(d.versione) || 0, quando: Number(d.quando) || 0,
        righe: Array.isArray(d.righe) ? d.righe : [], date: d.date || {}, s1: d.s1 !== false, s2: d.s2 !== false, aperte: d.aperte || [], pdf: pdf
    };
}
function nuova(prof, inc, ambito, ora) {
    return {
        di: prof.email, nome: prof.nome || '', incaricoId: String(inc.id), cliente: String(inc.cliente || ''), ambito: ambito,
        righe: [], date: {}, s1: true, s2: true, aperte: [], pdf: {}, versione: 0, quando: ora, creata: ora
    };
}
async function togliPezzi(ref, riga, da, a) {
    for (let n = da; n < (Number(a) || 0); n++) {
        try { await rifPezzo(ref, riga, n).delete(); } catch (_) { /* resta un pezzo orfano: non fa danni, se ne va con la bozza */ }
    }
}

async function leggi(db, prof, incaricoId, ambito) {
    const s = await rifBozza(db, prof, incaricoId, ambito).get();
    return s.exists ? perArea(s.data()) : null;
}

/* Salva righe e date. `base` e' la versione da cui parte chi salva: se sul
   portale ce n'e' un'altra, qualcuno (la stessa persona, da un altro computer)
   l'ha cambiata nel frattempo e si torna il conflitto senza toccare niente.
   Una bozza senza righe non si conserva: si toglie, con i suoi PDF. */
async function salva(db, prof, inc, ambito, bozza, base) {
    const ref = rifBozza(db, prof, inc.id, ambito);
    const b = pulisci(bozza, ambito);
    if (b.righe.length > MAX_RIGHE) return no(400, 'Una bozza contiene al massimo ' + MAX_RIGHE + ' destinatari: invia le prime lettere e prosegui con le altre.');
    const ora = Date.now();
    let daTogliere = [];
    const esito = await db.runTransaction(async tx => {
        daTogliere = [];
        const s = await tx.get(ref);
        const v = s.exists ? (s.data() || {}) : null;
        const cur = v ? (Number(v.versione) || 0) : 0;
        if (cur !== (Math.round(Number(base)) || 0)) return { ok: false, conflitto: true, versione: cur, quando: v ? (Number(v.quando) || 0) : 0, msg: 'La bozza è stata modificata da un altro computer.' };
        const vecchi = (v && v.pdf) || {}, pdf = {};
        const vive = {};
        b.righe.forEach(r => { vive[r.id] = 1; });
        Object.keys(vecchi).forEach(k => { if (vive[k]) pdf[k] = vecchi[k]; else daTogliere.push([k, (vecchi[k] || {}).pezzi]); });
        if (!b.righe.length) {
            if (s.exists) tx.delete(ref);
            return { ok: true, versione: 0, quando: 0, svuotate: v ? (v.righe || []).length : 0 };      // quante righe c'erano: va nel registro
        }
        tx.set(ref, Object.assign(v || nuova(prof, inc, ambito, ora), b, { pdf: pdf, versione: cur + 1, quando: ora, nome: prof.nome || '', cliente: String(inc.cliente || '') }));
        return { ok: true, versione: cur + 1, quando: ora };
    });
    if (esito.ok) for (const [riga, pezzi] of daTogliere) await togliPezzi(ref, riga, 0, pezzi);
    return esito;
}

/* Il PDF di una riga, ricomposto. null se manca un pezzo o non e' completo. */
async function pdfIntero(ref, riga, meta) {
    if (!meta || !(meta.pezzi > 0)) return null;
    const parti = [];
    for (let n = 0; n < meta.pezzi; n++) {
        const s = await rifPezzo(ref, riga, n).get();
        if (!s.exists) return null;
        const v = (s.data() || {}).dati;
        parti.push(Buffer.isBuffer(v) ? v : Buffer.from(v && v.toUint8Array ? v.toUint8Array() : (v || [])));
    }
    const tutto = Buffer.concat(parti);
    return tutto.length === meta.byte ? tutto : null;
}

/* Un pezzo del PDF di una riga. Il primo apre il caricamento (da li' la riga
   ha un PDF "in arrivo"), l'ultimo lo chiude dopo aver ricontato i pezzi. */
async function caricaPdf(db, prof, inc, ambito, b) {
    b = b || {};
    const riga = String(b.riga || '');
    if (!RE_RIGA.test(riga)) return no(400, 'Riga non valida.');
    const dimensione = Math.round(Number(b.dimensione) || 0);
    if (!(dimensione > 0)) return no(400, 'Il PDF è vuoto.');
    if (dimensione > C.LIMITI.pdfMaxByte) return no(413, 'Il PDF supera ' + C.megabyte(C.LIMITI.pdfMaxByte) + ': riducilo (per esempio con una scansione in bianco e nero a 150 dpi).');
    const pezzi = Math.ceil(dimensione / C.LIMITI.pezzoByte);
    const n = Math.round(Number(b.n));
    if (!(n >= 0 && n < pezzi)) return no(400, 'Pezzo del PDF non valido.');
    let buf;
    try { buf = Buffer.from(String(b.dati || ''), 'base64'); } catch (_) { buf = Buffer.alloc(0); }
    const atteso = n === pezzi - 1 ? dimensione - C.LIMITI.pezzoByte * (pezzi - 1) : C.LIMITI.pezzoByte;
    if (buf.length !== atteso) return no(400, 'Il PDF è arrivato incompleto: riprova.');
    const nome = C.nomeFile(b.nome);
    if (n === 0 && buf.slice(0, 1024).indexOf('%PDF-') < 0) return no(400, 'Il file "' + nome + '" non è un PDF: salva la lettera in PDF e riprova.');

    const ref = rifBozza(db, prof, inc.id, ambito);
    const ora = Date.now();
    if (n === 0) {
        let prima = 0;
        const troppi = await db.runTransaction(async tx => {
            const s = await tx.get(ref);
            const v = s.exists ? (s.data() || {}) : nuova(prof, inc, ambito, ora);
            const pdf = Object.assign({}, v.pdf);
            if (!pdf[riga] && Object.keys(pdf).length >= MAX_RIGHE) return true;
            prima = pdf[riga] ? (Number(pdf[riga].pezzi) || 0) : 0;
            pdf[riga] = { nome: nome, byte: dimensione, pezzi: pezzi, pronto: false, quando: ora };
            tx.set(ref, Object.assign({}, v, { pdf: pdf, quando: ora }));
            return false;
        });
        if (troppi) return no(400, 'Una bozza contiene al massimo ' + MAX_RIGHE + ' lettere.');
        if (prima > pezzi) await togliPezzi(ref, riga, pezzi, prima);        // il PDF di prima era piu' lungo
    }
    await rifPezzo(ref, riga, n).set({ dati: buf });
    if (n < pezzi - 1) return { ok: true, completo: false };

    if (!(await pdfIntero(ref, riga, { byte: dimensione, pezzi: pezzi }))) return no(400, 'Il PDF è arrivato incompleto: riprova.');
    const chiuso = await db.runTransaction(async tx => {
        const s = await tx.get(ref);
        const v = s.exists ? (s.data() || {}) : null;
        const m = v && v.pdf ? v.pdf[riga] : null;
        // nel frattempo la riga e' stata tolta, o per la stessa riga e' partito un altro PDF
        if (!m || m.byte !== dimensione || m.pezzi !== pezzi) return false;
        const pdf = Object.assign({}, v.pdf);
        pdf[riga] = Object.assign({}, m, { pronto: true, quando: Date.now() });
        tx.set(ref, Object.assign({}, v, { pdf: pdf, quando: Date.now() }));
        return true;
    });
    return chiuso ? { ok: true, completo: true } : no(409, 'Il caricamento è stato superato da un altro: riprova.');
}

/* Un pezzo del PDF, per riaprirlo da un altro computer. */
async function leggiPdf(db, prof, incaricoId, ambito, riga, n) {
    riga = String(riga || '');
    const ref = rifBozza(db, prof, incaricoId, ambito);
    const s = await ref.get();
    const m = s.exists && RE_RIGA.test(riga) ? ((s.data() || {}).pdf || {})[riga] : null;
    if (!m || !m.pronto) return no(404, 'Il PDF di questa riga non è sul portale.');
    n = Math.round(Number(n) || 0);
    if (!(n >= 0 && n < m.pezzi)) return no(400, 'Pezzo del PDF non valido.');
    const p = await rifPezzo(ref, riga, n).get();
    if (!p.exists) return no(404, 'Il PDF di questa riga non è sul portale.');
    const v = (p.data() || {}).dati;
    const buf = Buffer.isBuffer(v) ? v : Buffer.from(v && v.toUint8Array ? v.toUint8Array() : (v || []));
    return { ok: true, n: n, pezzi: m.pezzi, nome: m.nome, byte: m.byte, dati: buf.toString('base64') };
}

/* Il PDF pronto di una riga, per farne l'allegato della lettera. */
async function pdfDiRiga(db, prof, incaricoId, ambito, riga) {
    riga = String(riga || '');
    if (!RE_RIGA.test(riga)) return null;
    const ref = rifBozza(db, prof, incaricoId, ambito);
    const s = await ref.get();
    const m = s.exists ? ((s.data() || {}).pdf || {})[riga] : null;
    if (!m || !m.pronto) return null;
    const buf = await pdfIntero(ref, riga, m);
    return buf ? { buf: buf, nome: m.nome } : null;
}

/* La lettera di questa riga e' in coda: la riga esce dalla bozza con il suo
   PDF. Quando esce l'ultima, la bozza non c'e' piu'. */
async function consuma(db, prof, incaricoId, ambito, riga) {
    riga = String(riga || '');
    const ref = rifBozza(db, prof, incaricoId, ambito);
    let pezzi = 0;
    const esito = await db.runTransaction(async tx => {
        pezzi = 0;
        const s = await tx.get(ref);
        if (!s.exists) return { versione: 0 };
        const v = s.data() || {};
        const righe = (v.righe || []).filter(r => r.id !== riga);
        const pdf = Object.assign({}, v.pdf);
        pezzi = pdf[riga] ? (Number(pdf[riga].pezzi) || 0) : 0;
        delete pdf[riga];
        if (!righe.length && !Object.keys(pdf).length) { tx.delete(ref); return { versione: 0 }; }
        const versione = (Number(v.versione) || 0) + 1;
        tx.set(ref, Object.assign({}, v, { righe: righe, pdf: pdf, versione: versione, quando: Date.now() }));
        return { versione: versione };
    });
    await togliPezzi(ref, riga, 0, pezzi);
    return esito;
}

async function togliTutta(ref, d) {
    const pdf = (d && d.pdf) || {};
    for (const riga of Object.keys(pdf)) await togliPezzi(ref, riga, 0, (pdf[riga] || {}).pezzi);
    await ref.delete();
}
async function togli(db, prof, incaricoId, ambito) {
    const ref = rifBozza(db, prof, incaricoId, ambito);
    const s = await ref.get();
    const d = s.exists ? (s.data() || {}) : null;
    if (d) await togliTutta(ref, d);
    return { ok: true, versione: 0, svuotate: d ? (d.righe || []).length : 0 };      // quante righe c'erano: va nel registro
}
/* Con i dati di un incarico se ne vanno anche le bozze di chi ci stava lavorando. */
async function dimenticaIncarico(db, incaricoId) {
    const q = await db.collection(BOZZE).where('incaricoId', '==', String(incaricoId)).get();
    for (const s of q.docs) await togliTutta(db.collection(BOZZE).doc(s.id), s.data());
    return q.docs.length;
}
/* Le bozze ferme da troppo tempo. */
async function pulizia(db, ora, max) {
    const q = await db.collection(BOZZE).where('quando', '<=', ora - C.LIMITI.bozzaGiorni * GIORNO).orderBy('quando').limit(Math.max(1, max)).get();
    for (const s of q.docs) await togliTutta(db.collection(BOZZE).doc(s.id), s.data());
    return q.docs.length;
}

module.exports = { BOZZE, MAX_RIGHE, leggi, salva, caricaPdf, leggiPdf, pdfDiRiga, consuma, togli, dimenticaIncarico, pulizia, _interni: { idBozza, pulisci } };
