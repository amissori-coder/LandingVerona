/* ============================================================
   Invio di una comunicazione (email) dall'Area riservata Revilaw
   ------------------------------------------------------------
   A differenza di invia-email.js (reimpostazione password), qui l'utente
   compone liberamente oggetto/testo/destinatari. Per NON diventare un
   relay aperto di spam, l'invio e' consentito SOLO a un utente abilitato
   e autenticato: il client passa il proprio ID token Firebase, che qui
   viene verificato con l'Admin SDK. Rate limit per utente.

   Nessuna credenziale nel codice: tutto dalle variabili d'ambiente Vercel
   (le stesse gia' configurate per invia-email.js).
   ============================================================ */

const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

function leggiServiceAccount() {
    const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT mancante');
    let testo = raw;
    if (testo[0] !== '{') {
        try {
            const dec = Buffer.from(testo, 'base64').toString('utf8').trim();
            if (dec[0] === '{') testo = dec;
        } catch (_) { /* lo segnala JSON.parse */ }
    }
    let cred;
    try { cred = JSON.parse(testo); }
    catch (_) { throw new Error('FIREBASE_SERVICE_ACCOUNT non valido'); }
    if (cred.private_key && cred.private_key.includes('\\n')) {
        cred.private_key = cred.private_key.replace(/\\n/g, '\n');
    }
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

// Rate limit per mittente: pausa minima + tetto orario (contro invii accidentali
// a raffica e abusi). Transazione: robusto anche a richieste concorrenti.
const RL_PAUSA_MS = 20 * 1000;        // almeno 20s tra un invio e il successivo
const RL_MAX_ORA = 30;                // massimo 30 invii/ora per utente
const RL_ORA_MS = 60 * 60 * 1000;
async function consumaGettone(email) {
    const ref = admin.firestore().collection('comunicazioni_throttle').doc(email);
    return admin.firestore().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const ora = Date.now();
        const d = snap.exists ? snap.data() : { inizioFinestra: 0, conteggio: 0, ultimo: 0 };
        const stessaFinestra = (ora - (d.inizioFinestra || 0)) < RL_ORA_MS;
        const conteggio = stessaFinestra ? (d.conteggio || 0) : 0;
        if ((ora - (d.ultimo || 0)) < RL_PAUSA_MS || conteggio >= RL_MAX_ORA) return false;
        tx.set(ref, { ultimo: ora, inizioFinestra: stessaFinestra ? d.inizioFinestra : ora, conteggio: conteggio + 1 }, { merge: true });
        return true;
    });
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX_DEST = 100;

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Variabili di personalizzazione: {nome} {cognome} {nome_completo} {email} {incarichi}
const RE_VARIABILI = /\{(nome_completo|nome|cognome|email|incarichi)\}/;
function haVariabili(s) { return RE_VARIABILI.test(String(s || '')); }
function applicaVariabili(s, d) {
    d = d || {};
    const nc = (d.nome && d.cognome) ? (d.nome + ' ' + d.cognome) : (d.nome || d.cognome || '');
    return String(s == null ? '' : s)
        .replace(/\{nome_completo\}/g, nc).replace(/\{nome\}/g, d.nome || '').replace(/\{cognome\}/g, d.cognome || '')
        .replace(/\{email\}/g, d.email || '').replace(/\{incarichi\}/g, d.incarichi || '');
}

// Firma con logo Revilaw, in fondo a ogni mail (uguale all'anteprima nell'app)
const FIRMA = '<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:26px;border-top:1px solid #E2E8F0;padding-top:16px;"><tr>'
    + '<td style="padding-right:14px;vertical-align:middle;"><img src="https://nextgenerationbusiness.it/zls_zes/img/logo-revilaw.png" alt="Revilaw" height="42" style="height:42px;width:auto;display:block;"></td>'
    + '<td style="vertical-align:middle;font-family:Arial,Helvetica,sans-serif;color:#0A2844;font-size:13px;line-height:1.5;">'
    + '<div style="font-size:16px;font-weight:bold;color:#0A2844;">Revilaw <span style="color:#8bb8d4;">S.p.A.</span></div>'
    + '<div style="color:#475569;">Revisione legale &middot; Next Generation Business</div>'
    + '<a href="https://nextgenerationbusiness.it" style="color:#164068;text-decoration:none;">nextgenerationbusiness.it</a>'
    + '</td></tr></table>';

module.exports = async (req, res) => {
    const origin = process.env.ALLOWED_ORIGIN || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false, msg: 'Metodo non consentito' }); return; }

    try {
        initAdmin();
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

        // 1) autenticazione: verifica l'ID token Firebase del mittente
        const idToken = String(body.idToken || '');
        if (!idToken) { res.status(401).json({ ok: false, msg: 'Autenticazione mancante' }); return; }
        let decoded;
        try { decoded = await admin.auth().verifyIdToken(idToken); }
        catch (e) { res.status(401).json({ ok: false, msg: 'Sessione non valida: rientra e riprova.' }); return; }
        const mittente = String(decoded.email || '').toLowerCase();
        if (!EMAIL_RE.test(mittente)) { res.status(401).json({ ok: false, msg: 'Utente non valido' }); return; }

        // 2) autorizzazione: dev'essere un utente abilitato e attivo
        const uDoc = await admin.firestore().collection('utenti').doc(mittente).get();
        if (!uDoc.exists || uDoc.data().attivo === false) { res.status(403).json({ ok: false, msg: 'Utenza non abilitata all\'invio.' }); return; }

        // 3) validazione contenuto
        const oggetto = String(body.oggetto || '').trim();
        const testo = String(body.testo || '').trim();
        if (!oggetto) { res.status(400).json({ ok: false, msg: 'Oggetto mancante.' }); return; }
        if (!testo) { res.status(400).json({ ok: false, msg: 'Testo del messaggio mancante.' }); return; }
        // destinatari: array di stringhe (email) o oggetti {email, nome, cognome, incarichi}
        const grezzi = Array.isArray(body.destinatari) ? body.destinatari : [];
        const perEmail = {};
        grezzi.forEach(d => {
            const o = (d && typeof d === 'object') ? d : { email: d };
            const email = String(o.email || '').trim().toLowerCase();
            if (!EMAIL_RE.test(email) || perEmail[email]) return;
            perEmail[email] = { email: email, nome: String(o.nome || ''), cognome: String(o.cognome || ''), incarichi: String(o.incarichi || '') };
        });
        const destinatari = Object.keys(perEmail).map(k => perEmail[k]);
        if (!destinatari.length) { res.status(400).json({ ok: false, msg: 'Nessun destinatario valido.' }); return; }
        if (destinatari.length > MAX_DEST) { res.status(400).json({ ok: false, msg: 'Troppi destinatari (max ' + MAX_DEST + ' per invio).' }); return; }

        // 4) rate limit
        const consentito = await consumaGettone(mittente);
        if (!consentito) { res.status(429).json({ ok: false, msg: 'Troppi invii ravvicinati: attendi qualche istante e riprova.' }); return; }

        // 5) invio: mittente autenticato SMTP dello studio, Reply-To = chi scrive.
        // Piu destinatari => in copia nascosta (BCC), per non esporre gli indirizzi.
        const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
        const fromName = String(body.mittenteNome || process.env.SMTP_FROM_NAME || 'Revilaw S.p.A.').replace(/[\r\n]/g, ' ').slice(0, 80);
        const from = '"' + fromName + '" <' + fromEmail + '>';
        const htmlDi = (txt) => '<div style="font-family:Arial,Helvetica,sans-serif;color:#1E293B;font-size:14px;line-height:1.6;max-width:620px;">'
            + esc(txt).replace(/\n/g, '<br>') + FIRMA + '</div>';
        const trans = trasporto();

        // se il testo/oggetto usa variabili: una mail PERSONALIZZATA per ogni destinatario;
        // altrimenti un unico invio (BCC se piu destinatari), piu efficiente.
        if (haVariabili(oggetto) || haVariabili(testo)) {
            let inviati = 0;
            for (const d of destinatari) {
                const ogg = applicaVariabili(oggetto, d).trim() || '(senza oggetto)';
                const txt = applicaVariabili(testo, d);
                try {
                    await trans.sendMail({ from: from, replyTo: mittente, to: d.email, subject: ogg, text: txt, html: htmlDi(txt) });
                    inviati++;
                } catch (e) { console.error('Invio personalizzato a', d.email, 'non riuscito:', e && e.message); }
            }
            if (!inviati) { res.status(502).json({ ok: false, msg: 'Nessuna mail inviata (errore del server di posta).' }); return; }
            res.status(200).json({ ok: true, inviati: inviati });
            return;
        }

        const emails = destinatari.map(d => d.email);
        const messaggio = { from: from, replyTo: mittente, subject: oggetto, text: testo, html: htmlDi(testo) };
        if (emails.length === 1) messaggio.to = emails[0];
        else { messaggio.to = mittente; messaggio.bcc = emails; }
        await trans.sendMail(messaggio);
        res.status(200).json({ ok: true, inviati: emails.length });
    } catch (e) {
        console.error('Invio comunicazione non riuscito:', e);
        res.status(500).json({ ok: false, msg: 'Invio non riuscito. Riprova.' });
    }
};
