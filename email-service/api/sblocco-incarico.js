/* ============================================================
   Sblocco del calcolo di un incarico, approvato per email
   ------------------------------------------------------------
   Quando il calcolo del compenso e' congelato, chi lavora
   sull'incarico non lo tocca piu'. Per riaprirlo serve il
   consenso del RESPONSABILE DELL'INCARICO, che arriva per posta:

     1. dall'area riservata parte una richiesta ('richiedi'):
        il servizio trova il responsabile in anagrafica, segna la
        richiesta sull'incarico e gli manda la mail;
     2. la mail porta un pulsante verso
        <APP_BASE_URL>/area-riservata/sblocco.html?t=<gettone>,
        che mostra la richiesta e chiede conferma ('stato');
     3. il responsabile decide ('approva' | 'rifiuta'): con
        l'approvazione il calcolo viene sbloccato davvero, con
        la traccia nel registro e l'allerta al titolare;
     4. a chi aveva chiesto lo sblocco arriva la mail di esito:
        se approvata puo' modificare il calcolo e, finito,
        ricongelarlo dall'area riservata.

   Il pulsante nella mail NON sblocca da solo: apre la pagina di
   conferma. I controlli antivirus dei programmi di posta aprono i
   collegamenti da soli, e una GET che sblocca verrebbe eseguita
   dall'antivirus invece che dal responsabile (stessa ragione per cui
   la disiscrizione dalla newsletter non agisce mai su GET).

   Tutte le scritture passano dall'account di servizio (Admin SDK):
   il gettone vale da solo, il responsabile non deve avere una
   sessione aperta nell'area riservata.

   Variabili d'ambiente: le stesse degli altri endpoint
   (FIREBASE_SERVICE_ACCOUNT, SMTP_*, APP_BASE_URL, ALLOWED_ORIGIN).
   ============================================================ */

'use strict';

const crypto = require('crypto');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const { utenteEffettivo, firmaCollaboratore } = require('../lib/utente-effettivo');
const { avvolgi, senzaTrattiniLunghi } = require('../lib/mail-layout');

const COLL = 'sbloccoIncarichi';
// il titolare dello studio: come in area-riservata/app.js e in lib/utente-effettivo.js
const PROPRIETARIO = 'a.missori@emvas.tax';
const GIORNI_VALIDITA = 14;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* --- credenziali (stesso schema degli altri endpoint) --- */
function leggiServiceAccount() {
    const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT mancante');
    let testo = raw;
    if (testo[0] !== '{') {
        try {
            const dec = Buffer.from(testo, 'base64').toString('utf8').trim();
            if (dec[0] === '{') testo = dec;
        } catch (_) { /* lo dira' JSON.parse */ }
    }
    let cred;
    try { cred = JSON.parse(testo); }
    catch (_) { throw new Error('FIREBASE_SERVICE_ACCOUNT non valido: atteso il JSON della chiave o lo stesso JSON in base64'); }
    if (cred.private_key && cred.private_key.includes('\\n')) cred.private_key = cred.private_key.replace(/\\n/g, '\n');
    return cred;
}
let appPronta = false;
function initAdmin() {
    if (appPronta) return;
    admin.initializeApp({ credential: admin.credential.cert(leggiServiceAccount()) });
    appPronta = true;
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
    return '"' + (process.env.SMTP_FROM_NAME || 'Revilaw S.p.A.') + '" <' + (process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER) + '>';
}
function baseApp() {
    return String(process.env.APP_BASE_URL || 'https://nextgenerationbusiness.it').replace(/\/+$/, '');
}

/* --- limite per indirizzo IP: 'stato', 'approva' e 'rifiuta' sono pubblici --- */
const RL_FINESTRA_MS = 10 * 60 * 1000;
const RL_MAX = 40;
const colpi = new Map();
function troppi(ip) {
    if (!ip) return false;
    const ora = Date.now();
    const elenco = (colpi.get(ip) || []).filter(t => ora - t < RL_FINESTRA_MS);
    if (elenco.length >= RL_MAX) { colpi.set(ip, elenco); return true; }
    elenco.push(ora); colpi.set(ip, elenco);
    if (colpi.size > 500) {
        for (const [k, v] of colpi) { if (!v.length || ora - v[v.length - 1] > RL_FINESTRA_MS) colpi.delete(k); }
    }
    return false;
}

/* ============================================================
   ARCHIVI CONDIVISI
   Ogni archivio dell'area riservata e' un documento archivio/<nome>
   con il JSON in un campo di testo: si legge, si cambia e si
   riscrive dentro una transazione, come fa l'applicazione.
   ============================================================ */
async function leggiArchivio(nome) {
    const snap = await admin.firestore().collection('archivio').doc(nome).get();
    if (!snap.exists) return null;
    const d = snap.data() || {};
    if (typeof d.json !== 'string') return null;
    try { return JSON.parse(d.json); } catch (_) { return null; }
}
/* cambia() riceve i dati come array e restituisce l'array nuovo,
   oppure null per lasciare tutto com'e'. */
async function scriviArchivio(nome, cambia) {
    const db = admin.firestore();
    const rif = db.collection('archivio').doc(nome);
    return db.runTransaction(async (tx) => {
        const snap = await tx.get(rif);
        let dati = [];
        if (snap.exists && typeof (snap.data() || {}).json === 'string') {
            try { dati = JSON.parse(snap.data().json); } catch (_) { dati = []; }
        }
        const nuovi = cambia(dati);
        if (nuovi == null) return false;
        tx.set(rif, { json: JSON.stringify(nuovi), aggiornato: admin.firestore.FieldValue.serverTimestamp(), da: 'servizio-sblocco' });
        return true;
    });
}

function idCasuale() { return crypto.randomBytes(9).toString('hex'); }

/* Voce del registro, nella stessa forma di Audit.registra dell'applicazione. */
async function registra(utente, azione, rif, cliente, dettagli) {
    await scriviArchivio('audit', log => {
        const lista = Array.isArray(log) ? log : [];
        lista.unshift({
            id: idCasuale(), ts: Date.now(), utente: utente, azione: azione,
            entita: 'incarico', rif: rif || null, cliente: cliente || null, dettagli: dettagli || null
        });
        if (lista.length > 2000) lista.length = 2000;
        return lista;
    });
}
/* Allerta al titolare, nella stessa forma di Allerte.aggiungi. */
async function allerta(voce) {
    await scriviArchivio('allerte', l => {
        const lista = Array.isArray(l) ? l : [];
        lista.unshift(Object.assign({ id: idCasuale(), ts: Date.now(), letta: false }, voce));
        if (lista.length > 500) lista.length = 500;
        return lista;
    });
}

/* ============================================================
   ANAGRAFICA: dall'etichetta salvata sull'incarico alla persona
   Stesse regole di risolutorePersone() nell'applicazione: prima le
   attive (che "possiedono" il cognome nudo), poi le disattivate,
   infine le eliminate; si riconosce il cognome, "Cognome Nome" e
   l'etichetta con cui la persona compare nelle tendine.
   ============================================================ */
function personaDaEtichetta(persone, etichetta) {
    const s = String(etichetta || '').trim().toLowerCase();
    if (!s || !Array.isArray(persone)) return null;
    const ordinate = persone.filter(p => p && p.attivo && !p.eliminato)
        .concat(persone.filter(p => p && !p.attivo && !p.eliminato))
        .concat(persone.filter(p => p && p.eliminato));
    const cognome = p => String((p && p.nome) || '').trim().toLowerCase();
    const pieno = p => (cognome(p) + ' ' + String((p && p.nomeProprio) || '').trim().toLowerCase()).trim();
    return ordinate.find(p => pieno(p) === s) || ordinate.find(p => cognome(p) === s) || null;
}
function nomeCompleto(p) {
    if (!p) return '';
    const cog = String(p.nome || '').trim();
    const np = String(p.nomeProprio || '').trim();
    if (!np) return cog;
    return np.toLowerCase().endsWith(cog.toLowerCase()) ? np : (np + ' ' + cog).trim();
}

/* ============================================================
   MAIL
   ============================================================ */
function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const P = 'margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#0A2844;';
function bottone(href, testo) {
    return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0;"><tr>'
        + '<td style="background:#164068;border-radius:6px;">'
        + '<a href="' + esc(href) + '" style="display:inline-block;padding:13px 26px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">'
        + esc(testo) + '</a></td></tr></table>';
}
function citazione(testo) {
    return '<div style="margin:0 0 14px;padding:12px 16px;border-left:4px solid #C9A227;background:#F8FAFC;'
        + 'font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#0A2844;">'
        + esc(testo).replace(/\n/g, '<br>') + '</div>';
}
function soloTesto(html) {
    return senzaTrattiniLunghi(String(html).replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>|<\/div>|<\/tr>/gi, '\n').replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n')).trim();
}
async function spedisci(a, oggetto, inner) {
    const html = avvolgi(senzaTrattiniLunghi(inner));
    await trasporto().sendMail({
        from: mittente(), to: a, subject: senzaTrattiniLunghi(oggetto),
        text: soloTesto(inner), html: html
    });
}

function mailAlResponsabile(r, collegamento) {
    return '<p style="' + P + '">Ciao ' + esc(r.respNome || '') + ',</p>'
        + '<p style="' + P + '"><strong>' + esc(r.richiedenteNome || r.richiedenteEmail) + '</strong> chiede di sbloccare il calcolo del compenso dell\'incarico '
        + '<strong>' + esc(r.cliente) + '</strong>, di cui sei il responsabile. Finche\' il calcolo resta congelato, il compenso concordato non si puo\' modificare.</p>'
        + '<p style="' + P + '">Motivo indicato:</p>'
        + citazione(r.motivo || '')
        + '<p style="' + P + '">Apri la richiesta e decidi tu: il calcolo si sblocca solo dopo la tua conferma nella pagina.</p>'
        + bottone(collegamento, 'Apri la richiesta')
        + '<p style="' + P + 'font-size:13px;color:#475569;">Il collegamento vale ' + GIORNI_VALIDITA + ' giorni ed e\' valido una volta sola. '
        + 'Se non riconosci questa richiesta, ignora il messaggio: senza la tua conferma non cambia nulla.</p>';
}
function mailEsitoAlRichiedente(r, approvata) {
    if (approvata) {
        return '<p style="' + P + '">Ciao ' + esc(r.richiedenteNome || '') + ',</p>'
            + '<p style="' + P + '"><strong>' + esc(r.respNome || 'Il responsabile dell\'incarico') + '</strong> ha approvato lo sblocco del calcolo di <strong>' + esc(r.cliente) + '</strong>.</p>'
            + '<p style="' + P + '">Il calcolo e\' gia\' sbloccato: rientra nell\'area riservata e apporta le modifiche.</p>'
            + bottone(baseApp() + '/area-riservata/', 'Vai all\'area riservata')
            + '<p style="' + P + '">Quando hai finito, <strong>ricongela il calcolo</strong> dalla scheda dell\'incarico (pulsante <em>Congela calcolo</em>): il compenso concordato torna protetto.</p>';
    }
    return '<p style="' + P + '">Ciao ' + esc(r.richiedenteNome || '') + ',</p>'
        + '<p style="' + P + '"><strong>' + esc(r.respNome || 'Il responsabile dell\'incarico') + '</strong> ha respinto la richiesta di sblocco del calcolo di <strong>' + esc(r.cliente) + '</strong>.</p>'
        + '<p style="' + P + '">Il compenso concordato resta congelato. Se serve, parlane con il responsabile e ripresenta la richiesta.</p>';
}

/* ============================================================
   AZIONI
   ============================================================ */

/* 1) L'area riservata chiede lo sblocco: si verifica chi chiede, si
      trova il responsabile e gli si manda la mail. */
async function azioneRichiedi(body, res) {
    const idToken = String(body.idToken || '');
    if (!idToken) { res.status(401).json({ ok: false, msg: 'Autenticazione mancante.' }); return; }
    let decoded;
    try { decoded = await admin.auth().verifyIdToken(idToken); }
    catch (_) { res.status(401).json({ ok: false, msg: 'Sessione non valida: rientra e riprova.' }); return; }
    const chiamante = String(decoded.email || '').toLowerCase();
    if (!EMAIL_RE.test(chiamante)) { res.status(401).json({ ok: false, msg: 'Utente non valido.' }); return; }
    const ue = await utenteEffettivo(admin.firestore(), chiamante);
    if (!ue.ok) { res.status(403).json({ ok: false, msg: ue.msg || 'Utenza non abilitata.' }); return; }

    const incaricoId = String(body.incaricoId || '').trim();
    const motivo = String(body.motivo || '').trim();
    if (!incaricoId) { res.status(400).json({ ok: false, msg: 'Incarico non indicato.' }); return; }
    if (motivo.length < 5) { res.status(400).json({ ok: false, msg: 'Scrivi il motivo dello sblocco (almeno 5 caratteri).' }); return; }

    const incarichi = await leggiArchivio('incarichi');
    const inc = Array.isArray(incarichi) ? incarichi.find(i => i && i.id === incaricoId) : null;
    if (!inc) { res.status(404).json({ ok: false, msg: 'Incarico non trovato.' }); return; }
    if (!inc.calcoloCongelato) { res.status(409).json({ ok: false, msg: 'Il calcolo di questo incarico non è congelato.' }); return; }
    if (inc.sbloccoRichiesto) { res.status(409).json({ ok: false, msg: 'Una richiesta di sblocco è già in attesa della risposta del responsabile.' }); return; }

    const persone = await leggiArchivio('persone');
    const resp = personaDaEtichetta(persone, inc.respIncarico);
    const respEmail = String((resp && resp.email) || '').trim().toLowerCase();
    if (!inc.respIncarico) { res.status(400).json({ ok: false, msg: 'L\'incarico non indica il responsabile: impostalo prima di chiedere lo sblocco.' }); return; }
    if (!EMAIL_RE.test(respEmail)) {
        res.status(400).json({ ok: false, msg: 'Il responsabile dell\'incarico (' + inc.respIncarico + ') non ha un indirizzo email in anagrafica: aggiungilo nella sezione Persone.' });
        return;
    }

    const richiedenteNome = String((ue.dati && ue.dati.nome) || (ue.sessione && ue.sessione.nome) || ue.email);
    const collab = firmaCollaboratore(ue);
    const token = crypto.randomBytes(24).toString('hex');
    const ora = Date.now();
    const record = {
        incaricoId: incaricoId,
        cliente: String(inc.cliente || ''),
        motivo: motivo,
        richiedenteEmail: ue.email,
        richiedenteNome: richiedenteNome,
        collaboratore: collab || null,
        respNome: nomeCompleto(resp) || String(inc.respIncarico || ''),
        respEmail: respEmail,
        stato: 'attesa',
        creato: ora,
        scade: ora + GIORNI_VALIDITA * 24 * 60 * 60 * 1000
    };
    await admin.firestore().collection(COLL).doc(token).set(record);

    // la richiesta si vede subito nell'area riservata, accanto all'incarico
    const firma = richiedenteNome + ' <' + ue.email + '>';
    await scriviArchivio('incarichi', lista => {
        const arr = Array.isArray(lista) ? lista : [];
        const idx = arr.findIndex(i => i && i.id === incaricoId);
        if (idx < 0) return null;
        arr[idx] = Object.assign({}, arr[idx], {
            sbloccoRichiesto: {
                da: firma, il: ora, motivo: motivo,
                resp: record.respNome, respEmail: respEmail,
                collab: collab || undefined
            }
        });
        return arr;
    });

    try {
        await spedisci(respEmail, 'Richiesta di sblocco del calcolo - ' + record.cliente,
            mailAlResponsabile(record, baseApp() + '/area-riservata/sblocco.html?t=' + token));
    } catch (e) {
        // niente mail, niente richiesta: si torna indietro per non lasciare
        // l'incarico "in attesa" di una decisione che nessuno ha ricevuto
        await admin.firestore().collection(COLL).doc(token).delete().catch(() => { });
        await scriviArchivio('incarichi', lista => {
            const arr = Array.isArray(lista) ? lista : [];
            const idx = arr.findIndex(i => i && i.id === incaricoId);
            if (idx < 0) return null;
            const copia = Object.assign({}, arr[idx]);
            delete copia.sbloccoRichiesto;
            arr[idx] = copia;
            return arr;
        }).catch(() => { });
        console.error('Invio della richiesta di sblocco non riuscito:', (e && e.message) || e);
        res.status(502).json({ ok: false, msg: 'Mail al responsabile non inviata: riprova tra poco.' });
        return;
    }

    await registra(firma, 'Richiesta di sblocco del calcolo', incaricoId, record.cliente,
        [{ campo: 'Inviata a', prima: '', dopo: record.respNome + ' <' + respEmail + '>' },
        { campo: 'Motivo', prima: '', dopo: motivo }]);

    res.status(200).json({ ok: true, resp: { nome: record.respNome, email: respEmail } });
}

/* 1-bis) Chi ha chiesto lo sblocco (o un amministratore) ritira la richiesta:
      senza questa via, una richiesta mai evasa terrebbe l'incarico "in attesa"
      fino alla scadenza, senza poterne fare un'altra. */
async function azioneAnnulla(body, res) {
    const idToken = String(body.idToken || '');
    if (!idToken) { res.status(401).json({ ok: false, msg: 'Autenticazione mancante.' }); return; }
    let decoded;
    try { decoded = await admin.auth().verifyIdToken(idToken); }
    catch (_) { res.status(401).json({ ok: false, msg: 'Sessione non valida: rientra e riprova.' }); return; }
    const chiamante = String(decoded.email || '').toLowerCase();
    const ue = await utenteEffettivo(admin.firestore(), chiamante);
    if (!ue.ok) { res.status(403).json({ ok: false, msg: ue.msg || 'Utenza non abilitata.' }); return; }

    const incaricoId = String(body.incaricoId || '').trim();
    if (!incaricoId) { res.status(400).json({ ok: false, msg: 'Incarico non indicato.' }); return; }

    const db = admin.firestore();
    const trovate = await db.collection(COLL).where('incaricoId', '==', incaricoId).get();
    const doc = trovate.docs.find(d => (d.data() || {}).stato === 'attesa');
    const potere = ue.email === PROPRIETARIO || String(ue.ruolo || '') === 'admin';
    if (doc && !potere && String((doc.data() || {}).richiedenteEmail || '') !== ue.email) {
        res.status(403).json({ ok: false, msg: 'La richiesta l\'ha fatta un\'altra persona: può ritirarla lei, oppure un amministratore.' });
        return;
    }
    if (doc) await doc.ref.update({ stato: 'annullata', deciso: Date.now(), annullataDa: ue.email });

    // il segno sull'incarico si toglie comunque: se il documento non c'e' piu'
    // (scaduto, ripulito) l'incarico non deve restare bloccato in attesa
    await scriviArchivio('incarichi', lista => {
        const arr = Array.isArray(lista) ? lista : [];
        const idx = arr.findIndex(i => i && i.id === incaricoId);
        if (idx < 0 || !arr[idx].sbloccoRichiesto) return null;
        const copia = Object.assign({}, arr[idx]);
        delete copia.sbloccoRichiesto;
        arr[idx] = copia;
        return arr;
    });
    const d = doc ? (doc.data() || {}) : {};
    await registra((ue.dati && ue.dati.nome ? ue.dati.nome + ' <' + ue.email + '>' : ue.email),
        'Richiesta di sblocco ritirata', incaricoId, d.cliente || null, null);
    res.status(200).json({ ok: true });
}

/* 2) La pagina di conferma legge la richiesta (solo con il gettone). */
async function azioneStato(body, res) {
    const token = String(body.token || '').trim();
    const snap = token ? await admin.firestore().collection(COLL).doc(token).get() : null;
    if (!snap || !snap.exists) { res.status(404).json({ ok: false, msg: 'Richiesta non trovata: il collegamento non è più valido.' }); return; }
    const r = snap.data() || {};
    res.status(200).json({
        ok: true,
        cliente: r.cliente || '',
        motivo: r.motivo || '',
        richiedente: r.richiedenteNome || r.richiedenteEmail || '',
        resp: r.respNome || '',
        creato: r.creato || null,
        stato: (r.scade && Date.now() > r.scade && r.stato === 'attesa') ? 'scaduta' : (r.stato || 'attesa')
    });
}

/* 3) Il responsabile decide: qui il calcolo si sblocca davvero. */
async function azioneDecidi(body, res, approva) {
    const token = String(body.token || '').trim();
    const db = admin.firestore();
    const rif = db.collection(COLL).doc(token);

    // il gettone vale una volta sola: la transazione impedisce la doppia decisione
    let r;
    try {
        r = await db.runTransaction(async (tx) => {
            const snap = await tx.get(rif);
            if (!snap.exists) throw new Error('assente');
            const d = snap.data() || {};
            if (d.stato !== 'attesa') throw new Error('decisa:' + d.stato);
            if (d.scade && Date.now() > d.scade) throw new Error('scaduta');
            tx.update(rif, { stato: approva ? 'approvata' : 'respinta', deciso: Date.now() });
            return d;
        });
    } catch (e) {
        const m = String((e && e.message) || '');
        if (m === 'assente') { res.status(404).json({ ok: false, msg: 'Richiesta non trovata: il collegamento non è più valido.' }); return; }
        if (m === 'scaduta') { res.status(410).json({ ok: false, msg: 'Richiesta scaduta: chiedi che venga rifatta dall\'area riservata.' }); return; }
        if (m.indexOf('decisa:') === 0) {
            res.status(409).json({ ok: false, msg: 'Richiesta già ' + (m.slice(7) === 'approvata' ? 'approvata' : 'respinta') + ': non serve fare altro.' });
            return;
        }
        throw e;
    }

    const firmaResp = (r.respNome || 'Responsabile incarico') + ' <' + (r.respEmail || '') + '>';
    await scriviArchivio('incarichi', lista => {
        const arr = Array.isArray(lista) ? lista : [];
        const idx = arr.findIndex(i => i && i.id === r.incaricoId);
        if (idx < 0) return null;
        const copia = Object.assign({}, arr[idx]);
        delete copia.sbloccoRichiesto;
        if (approva) { copia.calcoloCongelato = false; copia.congelamento = null; }
        arr[idx] = copia;
        return arr;
    });

    if (approva) {
        await allerta({
            tipo: 'sblocco-calcolo', incaricoId: r.incaricoId, cliente: r.cliente,
            da: r.richiedenteNome + ' <' + r.richiedenteEmail + '>',
            collab: r.collaboratore || null,
            messaggio: (r.motivo || '') + ' (approvato da ' + firmaResp + ')'
        });
    }
    await registra(firmaResp, approva ? 'Sblocco del calcolo approvato' : 'Sblocco del calcolo respinto',
        r.incaricoId, r.cliente,
        [{ campo: 'Richiesto da', prima: '', dopo: r.richiedenteNome + ' <' + r.richiedenteEmail + '>' },
        { campo: 'Motivo', prima: '', dopo: r.motivo || '' }]);

    // l'esito torna a chi aveva chiesto: la mail non deve far fallire la decisione,
    // che a questo punto e' gia' registrata
    try {
        await spedisci(r.richiedenteEmail,
            (approva ? 'Sblocco approvato - ' : 'Sblocco respinto - ') + r.cliente,
            mailEsitoAlRichiedente(r, approva));
    } catch (e) {
        console.error('Mail di esito non inviata a', r.richiedenteEmail, (e && e.message) || e);
    }

    res.status(200).json({ ok: true, stato: approva ? 'approvata' : 'respinta', cliente: r.cliente, richiedente: r.richiedenteNome });
}

module.exports = async (req, res) => {
    const origin = process.env.ALLOWED_ORIGIN || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    // GET non decide nulla: i controlli antivirus dei programmi di posta
    // aprono i collegamenti da soli. Il pulsante della mail porta alla pagina.
    if (req.method === 'GET') { res.status(405).json({ ok: false, msg: 'Apri la richiesta dalla pagina di conferma.' }); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false, msg: 'Metodo non consentito.' }); return; }

    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const body = typeof req.body === 'string'
        ? (() => { try { return JSON.parse(req.body || '{}'); } catch (_) { return {}; } })()
        : (req.body || {});
    const azione = String(body.azione || '').trim();

    try {
        initAdmin();
        if (azione === 'richiedi') { await azioneRichiedi(body, res); return; }
        if (azione === 'annulla') { await azioneAnnulla(body, res); return; }
        if (troppi(ip)) { res.status(429).json({ ok: false, msg: 'Troppe richieste: riprova tra qualche minuto.' }); return; }
        if (azione === 'stato') { await azioneStato(body, res); return; }
        if (azione === 'approva') { await azioneDecidi(body, res, true); return; }
        if (azione === 'rifiuta') { await azioneDecidi(body, res, false); return; }
        res.status(400).json({ ok: false, msg: 'Azione non riconosciuta.' });
    } catch (e) {
        console.error('sblocco-incarico:', (e && e.stack) || e);
        res.status(500).json({ ok: false, msg: 'Servizio non disponibile: riprova tra poco.' });
    }
};
