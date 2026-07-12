/* ============================================================
   Servizio email dell'Area riservata Revilaw
   ------------------------------------------------------------
   Funzione serverless (Vercel) che invia l'email per impostare
   o reimpostare la password:
   - genera il link tramite Firebase Admin (con codice oobCode)
   - riscrive il link sul dominio dello studio (niente firebaseapp.com)
   - invia un messaggio in italiano, firmato Revilaw S.p.A., dal
     server di posta Aruba (mittente noreply@nextgenerationbusiness.it)

   Nessuna credenziale nel codice: tutto arriva dalle variabili
   d'ambiente configurate su Vercel (vedi README.md).
   ============================================================ */

const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

// Legge la chiave di servizio dalla variabile d'ambiente.
// Accetta due formati, per comodità di inserimento su Vercel:
//   - JSON grezzo (il contenuto del file .json, inizia con "{")
//   - la stessa cosa codificata in base64 (una sola riga: si incolla
//     senza problemi di a-capo ed evita l'escape degli \n nella chiave)
function leggiServiceAccount() {
    const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT mancante');
    let testo = raw;
    // Se non sembra JSON, proviamo a interpretarlo come base64.
    if (testo[0] !== '{') {
        try {
            const decodificato = Buffer.from(testo, 'base64').toString('utf8').trim();
            if (decodificato[0] === '{') testo = decodificato;
        } catch (_) { /* lasciamo testo invariato: sarà JSON.parse a segnalare l'errore */ }
    }
    let cred;
    try {
        cred = JSON.parse(testo);
    } catch (_) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT non valido: atteso il JSON della chiave o lo stesso JSON in base64');
    }
    // In alcuni incolli la private_key arriva con \n "letterali": li ripristiniamo.
    if (cred.private_key && cred.private_key.includes('\\n')) {
        cred.private_key = cred.private_key.replace(/\\n/g, '\n');
    }
    return cred;
}

// inizializzazione una sola volta (riusata tra le invocazioni "calde")
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
        secure: (Number(process.env.SMTP_PORT) || 465) === 465, // 465 = SSL
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
}

function corpoEmail(link, tipo) {
    const intro = tipo === 'recupero'
        ? 'Hai richiesto di reimpostare la password per accedere all\'Area riservata incarichi di Revilaw S.p.A.'
        : 'Il tuo accesso all\'Area riservata incarichi di Revilaw S.p.A. è stato abilitato. Per completare l\'attivazione imposta la tua password.';
    const testo =
`Gentile utente,

${intro}

Per procedere, apri questo collegamento e scegli la tua password:
${link}

Il collegamento è valido per un'ora. Se non hai richiesto tu questa operazione, ignora pure questa email: la password non verrà modificata.

Cordiali saluti,
Revilaw S.p.A.
Next Generation Business — nextgenerationbusiness.it`;

    const html =
`<div style="font-family:Arial,Helvetica,sans-serif;color:#1E293B;max-width:560px;margin:0 auto;">
  <div style="border-bottom:3px solid #164068;padding-bottom:12px;margin-bottom:20px;">
    <span style="font-size:20px;font-weight:800;color:#0A2844;">Revilaw <span style="color:#8bb8d4;">S.p.A.</span></span>
  </div>
  <p>Gentile utente,</p>
  <p>${intro}</p>
  <p>Per procedere, scegli la tua password:</p>
  <p style="text-align:center;margin:26px 0;">
    <a href="${link}" style="background:#164068;color:#ffffff;text-decoration:none;padding:12px 26px;border-radius:8px;font-weight:600;display:inline-block;">Imposta la password</a>
  </p>
  <p style="font-size:13px;color:#475569;">Se il pulsante non funziona, copia e incolla questo indirizzo nel browser:<br><span style="word-break:break-all;">${link}</span></p>
  <p style="font-size:13px;color:#475569;">Il collegamento è valido per un'ora. Se non hai richiesto tu questa operazione, ignora pure questa email.</p>
  <hr style="border:none;border-top:1px solid #E2E8F0;margin:22px 0;">
  <p style="font-size:13px;color:#475569;margin:0;">Cordiali saluti,<br><strong>Revilaw S.p.A.</strong><br>Next Generation Business — <a href="https://nextgenerationbusiness.it" style="color:#164068;">nextgenerationbusiness.it</a></p>
</div>`;

    return { testo, html };
}

module.exports = async (req, res) => {
    // CORS: consenti solo l'origine del sito
    const origin = process.env.ALLOWED_ORIGIN || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false, msg: 'Metodo non consentito' }); return; }

    try {
        initAdmin();
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
        const email = String(body.email || '').trim().toLowerCase();
        const tipo = body.tipo === 'recupero' ? 'recupero' : 'attivazione';
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { res.status(400).json({ ok: false, msg: 'Email non valida' }); return; }

        // gate: l'email deve essere un utente abilitato e attivo (collezione "utenti")
        const doc = await admin.firestore().collection('utenti').doc(email).get();
        if (!doc.exists || doc.data().attivo === false) {
            // per non rivelare chi è abilitato, rispondiamo comunque ok senza inviare
            res.status(200).json({ ok: true });
            return;
        }

        const base = (process.env.APP_BASE_URL || '').replace(/\/+$/, '');
        // genera il link Firebase (contiene oobCode) e riscrivilo sul nostro dominio
        const linkFirebase = await admin.auth().generatePasswordResetLink(email);
        const oob = new URL(linkFirebase).searchParams.get('oobCode');
        if (!oob) throw new Error('oobCode non ricavabile');
        const link = base + '/area-riservata/reimposta.html?mode=resetPassword&oobCode=' + encodeURIComponent(oob);

        const { testo, html } = corpoEmail(link, tipo);
        const fromName = process.env.SMTP_FROM_NAME || 'Revilaw S.p.A.';
        const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
        await trasporto().sendMail({
            from: '"' + fromName + '" <' + fromEmail + '>',
            to: email,
            subject: tipo === 'recupero'
                ? 'Revilaw S.p.A. — Reimposta la password dell\'Area riservata'
                : 'Revilaw S.p.A. — Imposta la password dell\'Area riservata',
            text: testo,
            html: html
        });

        res.status(200).json({ ok: true });
    } catch (e) {
        console.error('Invio email non riuscito:', e);
        res.status(500).json({ ok: false, msg: 'Invio non riuscito' });
    }
};
