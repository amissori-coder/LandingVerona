/* ============================================================
   Cron: i promemoria agli iscritti di un evento (sezione Eventi)
   ------------------------------------------------------------
   Vercel richiama questo endpoint ogni quarto d'ora (vedi vercel.json).
   Legge archivio/promemoriaEventi - i promemoria che chi organizza ha
   CONFERMATO dall'area riservata, con la mail gia' composta - e per
   ognuno la cui ora e' arrivata:

     1. risolve GLI ISCRITTI DI ADESSO dell'evento, nelle sezioni scelte
        (in sala: presenza, aderenti, sponsor; oppure online), dalla
        copia condivisa dell'archivio (lib/copia-iscrizioni.js): chi si
        e' iscritto dopo la conferma entra da solo, chi ha annullato o
        e' stato cancellato resta fuori, un indirizzo riceve una mail
        sola anche se ha due iscrizioni;
     2. personalizza {{NOME}} (il nome di battesimo) e {{COMPLETA}} (il
        collegamento personale firmato, per correggere i dati o
        rinunciare) e spedisce, una mail per destinatario;
     3. scrive l'esito sul record, che l'area riservata mostra.

   PERCHE' PIU' GIRI NON RISPEDISCONO. Come per le comunicazioni
   programmate (api/cron-comunicazioni.js): l'avanzamento si scrive
   DURANTE l'invio (lib/comunicazioni-avanzamento.js), con l'impronta
   di chi ha gia' ricevuto, e un lucchetto tiene fuori un secondo giro
   mentre il primo sta spedendo. Se il tempo finisce a meta', il record
   resta dovuto e il giro dopo riprende da chi manca.

   UN PROMEMORIA VECCHIO NON PARTE. "A domani" spedito tre giorni dopo e'
   peggio di niente: se all'arrivo del giro l'ora scelta e' passata da
   piu' di un giorno (il servizio era fermo, il cron non era attivo) il
   record viene segnato "scaduto" e non si spedisce; dall'area
   riservata lo si riprogramma con un clic.

   Protezione: solo Vercel puo' chiamarlo, con l'intestazione
   Authorization e il segreto CRON_SECRET. Nessuna credenziale nel
   codice.
   ============================================================ */

const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const C = require('../lib/copia-iscrizioni');
const NL = require('../lib/newsletter');
const AV = require('../lib/comunicazioni-avanzamento');

/* Stessi tre numeri di cron-comunicazioni: il budget sta DENTRO il
   maxDuration di vercel.json (300 s) con un minuto per scrivere l'esito;
   il lucchetto dura piu' della funzione. */
const BUDGET_MS = 240 * 1000;
const LUCCHETTO_MS = 6 * 60 * 1000;
const PASSO_SALVATAGGIO = 20;
// oltre questo ritardo un promemoria non ha piu' senso: si segna scaduto
const RITARDO_MAX_MS = 24 * 60 * 60 * 1000;
const SEZIONI = ['presenza', 'aderenti', 'sponsor', 'online'];
const DOC = 'promemoriaEventi';
const BASE = String(process.env.APP_BASE_URL || 'https://nextgenerationbusiness.it').replace(/\/+$/, '');

function leggiServiceAccount() {
    const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT mancante');
    let testo = raw;
    if (testo[0] !== '{') {
        try { const dec = Buffer.from(testo, 'base64').toString('utf8').trim(); if (dec[0] === '{') testo = dec; } catch (_) { }
    }
    let cred;
    try { cred = JSON.parse(testo); } catch (_) { throw new Error('FIREBASE_SERVICE_ACCOUNT non valido'); }
    if (cred.private_key && cred.private_key.includes('\\n')) cred.private_key = cred.private_key.replace(/\\n/g, '\n');
    return cred;
}
function initAdmin() {
    if (admin.apps && admin.apps.length) return;
    admin.initializeApp({ credential: admin.credential.cert(leggiServiceAccount()) });
}
function trasporto() {
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 465,
        secure: (Number(process.env.SMTP_PORT) || 465) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
}

const reEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
/* Le stesse due funzioni di api/iscrizioni.js: l'identificativo della riga
   deve venire uguale, perche' e' la chiave con cui presenze e cancellazioni
   la citano. */
function chiave(s) {
    return String(s == null ? '' : s).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function idRiga(v) {
    const em = String(v.email || '');
    return (em.toLowerCase() || (chiave(v.nome) + '.' + chiave(v.cognome))) + '|' + String(v.data || '');
}
/* Il nome con cui si saluta: quello di battesimo, quando cognome e nome
   sono due campi. "Ciao Maria" e' il tono di queste mail; "Ciao Maria
   Rossi" no. Se il campo nome e' vuoto si ripiega sul cognome, e in mancanza
   di tutto su "ospite". */
function nomeSaluto(v) {
    const n = String(v.nome || '').trim();
    const c = String(v.cognome || '').trim();
    if (n && c) return n.split(/\s+/)[0];
    return n || c || 'ospite';
}

/* Gli iscritti a cui scrivere ADESSO: { destinatari: [{email, nome, doc}],
   senzaEmail, doppie, cancellati }. `filtro` e' la parola che la pagina
   dell'iscrizione deve contenere ("napoli"), la stessa dell'area riservata. */
function risolviDestinatari(arch, rec) {
    const filtro = chiave(rec.filtro || '');
    const sezioni = (Array.isArray(rec.sezioni) ? rec.sezioni : []).map(s => String(s).toLowerCase()).filter(s => SEZIONI.indexOf(s) >= 0);
    const out = { destinatari: [], senzaEmail: 0, doppie: 0, cancellati: 0, esclusi: 0 };
    if (!filtro || !sezioni.length) return out;
    const presenze = {};
    (arch.presenze || []).forEach(p => { if (p && p.evento === rec.evento && p.idIscritto) presenze[p.idIscritto] = p; });
    const cancellate = {};
    (arch.cancellate || []).forEach(c => { if (c && c.evento === rec.evento && c.idIscritto) cancellate[c.idIscritto] = true; });
    const visti = {};
    (arch.iscrizioni || []).forEach(v => {
        if (!v || chiave(v.pagina).indexOf(filtro) < 0) return;
        if (v.annullato) { out.cancellati++; return; }
        const id = idRiga(v);
        if (cancellate[id]) { out.cancellati++; return; }
        const p = presenze[id] || {};
        // chi e' segnato assente non viene: non gli si ricorda niente
        if (String(p.stato || '') === 'assente') { out.esclusi++; return; }
        /* La sezione: la decisione di chi organizza (presenze) vince su quella
           dichiarata iscrivendosi; vuoto o sconosciuto vale in presenza. */
        let m = String(p.modalita || v.modalita || '').toLowerCase();
        if (SEZIONI.indexOf(m) < 0) m = 'presenza';
        if (sezioni.indexOf(m) < 0) return;
        const email = String(v.email || '').trim().toLowerCase();
        if (!email || !reEmail.test(email)) { out.senzaEmail++; return; }
        if (visti[email]) { out.doppie++; return; }
        visti[email] = true;
        out.destinatari.push({ email: email, nome: nomeSaluto(v), doc: String(v._doc || '') });
    });
    return out;
}

function personalizza(rec, d) {
    const m = rec.mail || {};
    const link = d.doc ? NL.linkCompleta(d.doc) : (BASE + '/');
    const ogg = String(m.oggetto || 'Promemoria - Next Generation Business').replace(/[\r\n]+/g, ' ').split('{{NOME}}').join(d.nome);
    const html = String(m.html || '').split('{{NOME}}').join(esc(d.nome)).split('{{COMPLETA}}').join(link);
    const testo = m.testo ? String(m.testo).split('{{NOME}}').join(d.nome).split('{{COMPLETA}}').join(link) : undefined;
    return { subject: ogg, html: html, text: testo };
}

/* Un promemoria: la spedizione a chi manca ancora, entro la scadenza.
   `avanz` = { serviti: Set, scadenza: ms, segna: (impronte, delta) => Promise }. */
async function inviaUno(trans, rec, destinatari, avanz, opz) {
    const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
    const fromName = String(process.env.SMTP_FROM_NAME || 'Revilaw S.p.A.').replace(/[\r\n]/g, ' ').slice(0, 80);
    const from = '"' + fromName + '" <' + fromEmail + '>';
    const creatoDa = String((rec.creato && rec.creato.da) || '').trim().toLowerCase();
    const replyTo = reEmail.test(creatoDa) ? creatoDa : fromEmail;
    const dd = destinatari.filter(d => !avanz.serviti.has(AV.impronta(d.email)));
    let inviati = 0, tentati = 0, restanti = false;
    const falliti = [];
    let impronte = [], delta = { inviati: 0, falliti: [] };
    const scarica = async () => {
        if (!inviati || !impronte.length) return;
        await avanz.segna(impronte, delta);
        impronte = []; delta = { inviati: 0, falliti: [] };
    };
    /* La COPIA a chi ha programmato, una volta sola, all'inizio: e' la prova
       di che cosa e' partito e con che testo, come la copia nascosta delle
       altre mail dell'area riservata - ma una sola, non una per
       destinatario. Se non parte non e' un guasto dell'invio. */
    if (opz && opz.primoGiro && reEmail.test(creatoDa)) {
        const nomeOp = String((rec.creato && rec.creato.daNome) || '').trim().split(/\s+/)[0] || 'collega';
        const copia = personalizza(rec, { email: creatoDa, nome: nomeOp, doc: '' });
        try {
            await trans.sendMail({ from: from, replyTo: replyTo, to: creatoDa, subject: '[Copia per te] ' + copia.subject, text: copia.text, html: copia.html });
        } catch (e) { console.error('Promemoria, copia a chi ha programmato non partita:', String((e && e.message) || e).slice(0, 150)); }
    }
    for (const d of dd) {
        if (Date.now() > avanz.scadenza) { restanti = true; break; }
        const msg = personalizza(rec, d);
        tentati++;
        try {
            await trans.sendMail({ from: from, replyTo: replyTo, to: d.email, subject: msg.subject, text: msg.text, html: msg.html });
            inviati++; delta.inviati++;
        } catch (e) {
            const motivo = String((e && e.message) || 'errore sconosciuto').slice(0, 200);
            console.error('Promemoria a', d.email, 'non riuscito:', motivo);
            falliti.push({ email: d.email, motivo: motivo });
            delta.falliti.push({ email: d.email, motivo: motivo });
        }
        // servito vuol dire TENTATO: un indirizzo che da' errore non si ritenta per sempre
        impronte.push(AV.impronta(d.email));
        if (impronte.length >= PASSO_SALVATAGGIO) await scarica();
    }
    await scarica();
    // tutto quello che si e' provato e' fallito: e' un guasto del canale, non un invio
    if (tentati && !inviati && !restanti) throw new Error('nessuna mail inviata');
    return { inviati: inviati, falliti: falliti, restanti: restanti, tentati: tentati };
}

/* Patch di UN record dentro archivio/promemoriaEventi, in transazione e per
   campo: l'area riservata riscrive il documento intero quando qualcuno
   programma, e qui non si deve perdere ne' la sua scrittura ne' questa. */
async function applicaPatch(db, id, patch) {
    const rif = db.collection('archivio').doc(DOC);
    await db.runTransaction(async (tx) => {
        const s = await tx.get(rif);
        let arr = [];
        if (s.exists && typeof s.data().json === 'string') { try { arr = JSON.parse(s.data().json) || []; } catch (_) { arr = []; } }
        arr = arr.map(r => {
            if (!r || r.id !== id) return r;
            const m = Object.assign({}, r);
            if (patch.stato) m.stato = patch.stato;
            if (patch.invio !== undefined) m.invio = patch.invio;
            return m;
        });
        tx.set(rif, { json: JSON.stringify(arr), aggiornato: admin.firestore.FieldValue.serverTimestamp(), da: 'cron' });
    });
}

module.exports = async (req, res) => {
    const segreto = String(process.env.CRON_SECRET || '').trim();
    const auth = String((req.headers || {})['authorization'] || '');
    if (!segreto || auth !== 'Bearer ' + segreto) { res.status(401).json({ ok: false, msg: 'Non autorizzato' }); return; }

    const inizio = Date.now();
    const scadenza = inizio + BUDGET_MS;
    const giro = 'run-' + inizio.toString(36);
    try {
        initAdmin();
        const db = admin.firestore();
        const snap = await db.collection('archivio').doc(DOC).get();
        let lista = [];
        if (snap.exists && typeof snap.data().json === 'string') { try { lista = JSON.parse(snap.data().json) || []; } catch (_) { lista = []; } }
        const ora = Date.now();
        const dovuti = lista.filter(r => r && r.stato === 'programmato' && Number(r.quando) > 0 && Number(r.quando) <= ora && r.mail && r.mail.html);
        if (!dovuti.length) { res.status(200).json({ ok: true, inviati: 0, sospesi: 0, scaduti: 0 }); return; }

        let arch = null;
        let trans = null;
        let inviatiTot = 0, sospesi = 0, scaduti = 0;
        for (const rec of dovuti) {
            if (Date.now() > scadenza) { sospesi++; continue; }
            try {
                if (ora - Number(rec.quando) > RITARDO_MAX_MS && !(rec.invio && rec.invio.inCorso)) {
                    await applicaPatch(db, rec.id, {
                        stato: 'scaduto',
                        invio: { il: ora, inviate: 0, motivo: 'L\'ora scelta era passata da più di un giorno quando il servizio è passato: non è partito niente. Riprogrammalo con una data nuova.' }
                    });
                    scaduti++;
                    continue;
                }
                if (!arch) arch = await C.archivio(db);
                const r = risolviDestinatari(arch, rec);
                if (!r.destinatari.length) {
                    await applicaPatch(db, rec.id, {
                        stato: 'inviato',
                        invio: { il: ora, inviate: 0, falliti: 0, senzaEmail: r.senzaEmail, doppie: r.doppie, destinatari: 0, motivo: 'Nessun iscritto con email nelle sezioni scelte.' }
                    });
                    continue;
                }
                const chiaveAv = 'promemoria~' + rec.id;
                const preso = await AV.prendiLucchetto(db, chiaveAv, giro, LUCCHETTO_MS);
                if (!preso) { sospesi++; continue; }
                try {
                    const stato = await AV.apri(db, chiaveAv, rec.quando);
                    if (!trans) trans = trasporto();
                    const esito = await inviaUno(trans, rec, r.destinatari, {
                        serviti: stato.serviti, scadenza: scadenza,
                        segna: (impronte, delta) => AV.segna(db, chiaveAv, rec.quando, impronte, delta)
                    }, { primoGiro: !stato.serviti.size && !stato.inviati });
                    const n = stato.inviati + esito.inviati;
                    const falliti = stato.falliti.concat(esito.falliti || []);
                    if (esito.restanti) {
                        /* Tempo finito a meta': il record resta dovuto e il giro
                           dopo riprende da chi manca. Sul record si scrive solo
                           "in corso" con il conteggio, che l'area riservata mostra. */
                        await applicaPatch(db, rec.id, { invio: { inCorso: true, il: ora, inviate: n, falliti: falliti.length } });
                        sospesi++;
                        continue;
                    }
                    if (esito.inviati) inviatiTot++;
                    const invio = {
                        il: Date.now(), inviate: n, falliti: falliti.length, dettaglioFalliti: falliti.slice(0, 100),
                        senzaEmail: r.senzaEmail, doppie: r.doppie, destinatari: r.destinatari.length, inCorso: false
                    };
                    // PRIMA l'esito sul record, POI la pulizia dell'avanzamento (come le comunicazioni)
                    await applicaPatch(db, rec.id, { stato: 'inviato', invio: invio });
                    await AV.chiudi(db, chiaveAv);
                } finally {
                    await AV.mollaLucchetto(db, chiaveAv);
                }
            } catch (e) {
                console.error('Promemoria non inviato (' + (rec.id || '?') + '):', String((e && e.message) || e).slice(0, 300));
            }
        }
        res.status(200).json({ ok: true, inviati: inviatiTot, sospesi: sospesi, scaduti: scaduti });
    } catch (e) {
        console.error('Cron promemoria: errore', String((e && e.message) || e).slice(0, 300));
        res.status(500).json({ ok: false, msg: 'Errore interno' });
    }
};

// esposti per le prove (prove/promemoria-eventi.prove.js)
module.exports._interni = { risolviDestinatari, personalizza, nomeSaluto, idRiga };
