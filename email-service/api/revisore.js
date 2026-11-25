/* ============================================================
   I dati del Revisore, e la prova che il database lo tiene fuori
   ------------------------------------------------------------
   Chi entra nell'area riservata con il ruolo Revisore vede solo cio'
   che riguarda i suoi incarichi. Con le regole di
   area-riservata/FIREBASE-SETUP.md il database a lui non consegna
   nessun archivio: i suoi dati glieli prepara questo servizio, che
   gli passa solo quelli dei suoi incarichi (lib/revisore.js spiega
   che cosa e perche').

   POST { idToken, azione }

   Per chi ha il ruolo Revisore (o ne e' il collaboratore):
     'dati'    -> { ok, scheda, miei, archivi: { incarichi, persone,
                  audit, fattureStato, controlliQualita, richieste,
                  firmeEmail } }
     'salva'   { archivio: 'audit' | 'richieste' | 'firmeEmail', upserts }
               -> { ok, valore, rifiutate }   le sole cose che scrive

   Per l'amministratore (e il suo vice, e il titolare):
     'prova-inizio' -> { ok, email, gettone }
               crea un REVISORE DI PROVA (un utente finto, senza scheda
               in anagrafica e senza incarichi) e torna il gettone con
               cui il browser dell'amministratore entra a suo nome, su
               un collegamento separato, e prova a leggere gli archivi
               direttamente dal database. Serve a vedere con i propri
               occhi che le regole pubblicate lo respingono.
     'prova-fine' { email } -> { ok }
               toglie il revisore di prova (scheda e account) e il
               documento di prova, se la scrittura fosse riuscita.
   Un revisore di prova rimasto li' (browser chiuso a meta') viene
   tolto alla prova successiva.

   Variabili d'ambiente: le stesse degli altri endpoint
   (FIREBASE_SERVICE_ACCOUNT, ALLOWED_ORIGIN).
   ============================================================ */
'use strict';

const crypto = require('crypto');
const admin = require('firebase-admin');
const { utenteEffettivo, eRuoloAdmin } = require('../lib/utente-effettivo');
const REVISORE = require('../lib/revisore');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// il titolare dello studio: come in area-riservata/app.js e in lib/utente-effettivo.js
const PROPRIETARIO = 'a.missori@emvas.tax';
// il revisore di prova: un indirizzo del nostro dominio che non esiste (non riceve nulla)
const DOMINIO_PROVA = 'nextgenerationbusiness.it';
const PREFISSO_PROVA = 'prova-protezione-';
// il documento su cui la prova tenta di SCRIVERE: mai un archivio vero
const DOC_PROVA = 'provaProtezione';

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
// il valore del campo "aggiornato" dei documenti dell'archivio: l'ora del server
function timbro() {
    const fv = admin.firestore && admin.firestore.FieldValue;
    return fv ? fv.serverTimestamp() : new Date();
}

/* Toglie un revisore di prova: l'account e la scheda. */
async function togliProva(db, email, scheda) {
    const uid = String((scheda && scheda.uidProva) || '');
    if (uid) { try { await admin.auth().deleteUser(uid); } catch (_) { /* gia' tolto */ } }
    await db.collection('utenti').doc(email).delete();
}
async function togliProveRimaste(db) {
    const rimaste = await db.collection('utenti').where('provaProtezione', '==', true).get();
    for (const d of rimaste.docs) await togliProva(db, d.id, d.data() || {});
    return rimaste.docs.length;
}

module.exports = async (req, res) => {
    const origin = process.env.ALLOWED_ORIGIN || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false, msg: 'Metodo non consentito.' }); return; }

    const body = typeof req.body === 'string'
        ? (() => { try { return JSON.parse(req.body || '{}'); } catch (_) { return {}; } })()
        : (req.body || {});
    const azione = String(body.azione || '').trim();

    try {
        initAdmin();
        const idToken = String(body.idToken || '');
        if (!idToken) { res.status(401).json({ ok: false, msg: 'Autenticazione mancante.' }); return; }
        let decoded;
        try { decoded = await admin.auth().verifyIdToken(idToken); }
        catch (_) { res.status(401).json({ ok: false, msg: 'Sessione non valida: rientra e riprova.' }); return; }
        const chiamante = String(decoded.email || '').toLowerCase();
        if (!EMAIL_RE.test(chiamante)) { res.status(401).json({ ok: false, msg: 'Utente non valido.' }); return; }
        const db = admin.firestore();
        const ue = await utenteEffettivo(db, chiamante);
        if (!ue.ok) { res.status(403).json({ ok: false, msg: ue.msg || 'Utenza non abilitata.' }); return; }

        /* ---- il revisore: i suoi dati ---- */
        if (azione === 'dati' || azione === 'salva') {
            if (!REVISORE.eRevisore(ue)) { res.status(403).json({ ok: false, msg: 'Questo servizio prepara i dati di chi ha il ruolo Revisore.' }); return; }
            if (azione === 'dati') {
                const d = await REVISORE.dati(db, ue);
                res.status(200).json({ ok: true, scheda: d.scheda, miei: d.miei, archivi: d.archivi });
                return;
            }
            const r = await REVISORE.salva(db, ue, String(body.archivio || ''), body.upserts, { timbro: timbro() });
            if (!r.ok) { res.status(r.stato || 400).json({ ok: false, msg: r.msg }); return; }
            res.status(200).json({ ok: true, archivio: String(body.archivio || ''), valore: r.valore, rifiutate: r.rifiutate });
            return;
        }

        /* ---- l'amministratore: la prova della protezione ---- */
        if (azione === 'prova-inizio' || azione === 'prova-fine') {
            // un collaboratore non la lancia: i poteri dell'amministratore non si delegano
            const potere = !ue.collaboratore && (ue.email === PROPRIETARIO || eRuoloAdmin(ue.ruolo));
            if (!potere) { res.status(403).json({ ok: false, msg: 'La prova della protezione la lancia l\'amministratore.' }); return; }
            if (azione === 'prova-inizio') {
                await togliProveRimaste(db);
                const email = PREFISSO_PROVA + crypto.randomBytes(5).toString('hex') + '@' + DOMINIO_PROVA;
                // l'account: una password a caso che nessuno conosce, si entra solo con il gettone qui sotto
                const utente = await admin.auth().createUser({ email: email, password: crypto.randomBytes(24).toString('base64'), displayName: 'Prova della protezione' });
                await db.collection('utenti').doc(email).set({
                    nome: 'Prova della protezione (si può eliminare)', ruolo: REVISORE.RUOLO_REVISORE, attivo: true,
                    creato: Date.now(), creatoDa: ue.email, provaProtezione: true, uidProva: utente.uid
                });
                const gettone = await admin.auth().createCustomToken(utente.uid);
                console.log('revisore: prova della protezione avviata da ' + ue.email);
                res.status(200).json({ ok: true, email: email, gettone: gettone, documento: DOC_PROVA });
                return;
            }
            const email = String(body.email || '').trim().toLowerCase();
            const rif = db.collection('utenti').doc(email);
            const s = email.indexOf(PREFISSO_PROVA) === 0 ? await rif.get() : null;
            // si toglie SOLO un revisore di prova: mai un utente vero, qualunque indirizzo arrivi
            if (s && s.exists && (s.data() || {}).provaProtezione === true) await togliProva(db, email, s.data());
            // se le regole erano ancora quelle vecchie la scrittura di prova e' riuscita: via anche quella
            try { await db.collection('archivio').doc(DOC_PROVA).delete(); } catch (_) { /* non c'era */ }
            res.status(200).json({ ok: true });
            return;
        }
        res.status(400).json({ ok: false, msg: 'Azione non riconosciuta.' });
    } catch (e) {
        console.error('revisore:', (e && e.stack) || e);
        res.status(500).json({ ok: false, msg: 'Servizio non disponibile: riprova tra poco.' });
    }
};
