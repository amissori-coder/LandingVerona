/* ============================================================
   Cron: le mail di conferma che non sono arrivate a destinazione
   ------------------------------------------------------------
   Lavoro programmato (vercel.json), ogni dieci minuti. Rispedisce la
   mail con il pulsante "Conferma il tuo indirizzo email" a chi si e'
   iscritto a un evento che chiede la conferma (Milano 2027) e non l'ha
   avuta - mai partita, o rifiutata dal server di posta -, manda a un'ora
   dalla mail il sollecito personale di Andrea Missori (solo testo, dal suo
   indirizzo) e UN promemoria (mail e SMS) a chi dopo un giorno non ha
   ancora cliccato.
   Il lavoro vero, e le sue regole, stanno in lib/giro-conferme.js.

   Protezione: come gli altri lavori programmati, solo con
   l'intestazione Authorization e il segreto CRON_SECRET, che Vercel
   mette da se'. Chiamata a mano (per provare): GET con la stessa
   intestazione. Un giro alla volta: se ne sta gia' lavorando un altro
   (il lucchetto su meta/confermeEmail) questo risponde `occupato` e non
   fa niente.
   ============================================================ */

const admin = require('firebase-admin');
const GIRO = require('../lib/giro-conferme');

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

module.exports = async (req, res) => {
    const segreto = String(process.env.CRON_SECRET || '').trim();
    const auth = String((req.headers || {})['authorization'] || '');
    if (!segreto || auth !== 'Bearer ' + segreto) { res.status(401).json({ ok: false, msg: 'Non autorizzato' }); return; }
    try {
        initAdmin();
        const conti = await GIRO.giro(admin.firestore());
        // i conti finiscono nei log di Vercel: e' li' che si guarda se il giro lavora
        if (conti.limitePieno || conti.rimaste) console.warn('Conferme email:', JSON.stringify(conti));
        else if (conti.inviate || conti.riprovate || conti.solleciti || conti.arretrati || conti.promemoria || conti.errori || conti.occupato) console.log('Conferme email:', JSON.stringify(conti));
        res.status(200).json(Object.assign({ ok: true }, conti));
    } catch (e) {
        console.error('Conferme email:', String((e && e.message) || e).slice(0, 200));
        res.status(500).json({ ok: false });
    }
};
