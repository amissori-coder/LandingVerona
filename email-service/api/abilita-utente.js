/* ============================================================
   Nuovi accessi all'area riservata, abilitati da chi non e'
   amministratore
   ------------------------------------------------------------
   Lo chiama la sezione "Nuovi accessi" dell'area riservata. Chi puo'
   e che cosa puo' fare lo decide lib/abilita-utente.js (leggi li'):
   responsabili della qualita', equity partner e founding partner
   AGGIUNGONO utenti, solo con i ruoli Revisore, Coordinatore
   territoriale e Vice coordinatore territoriale.

   POST { idToken, azione }
     'stato'    -> { ok, puo, come, ruoli }   se chi chiama puo' abilitare
     'abilita'  -> { ok, email, ruolo }       crea la scheda in "utenti"
                   con { email, nome, ruolo }

   La scheda sola non fa entrare nessuno: l'email per impostare la
   password la manda poi l'area riservata, come dalla sezione Utenti
   (api/invia-email.js).

   Variabili d'ambiente: le stesse degli altri endpoint
   (FIREBASE_SERVICE_ACCOUNT, ALLOWED_ORIGIN).
   ============================================================ */
'use strict';

const admin = require('firebase-admin');
const { utenteEffettivo } = require('../lib/utente-effettivo');
const ABILITA = require('../lib/abilita-utente');

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

        if (azione === 'stato') {
            const come = await ABILITA.qualifica(db, ue);
            res.status(200).json({ ok: true, puo: !!come, come: come, ruoli: ABILITA.RUOLI_DELEGABILI });
            return;
        }
        if (azione === 'abilita') {
            const r = await ABILITA.abilita(db, ue, { email: body.email, nome: body.nome, ruolo: body.ruolo });
            if (!r.ok) { res.status(r.stato || 400).json({ ok: false, msg: r.msg }); return; }
            console.log('abilita-utente: ' + r.email + ' (' + r.ruolo + ') abilitato da ' + ue.email + ' come ' + r.come);
            res.status(200).json({ ok: true, email: r.email, ruolo: r.ruolo, nomeRuolo: r.nomeRuolo });
            return;
        }
        res.status(400).json({ ok: false, msg: 'Azione non riconosciuta.' });
    } catch (e) {
        console.error('abilita-utente:', (e && e.stack) || e);
        res.status(500).json({ ok: false, msg: 'Servizio non disponibile: riprova tra poco.' });
    }
};
