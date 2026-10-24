/* ============================================================
   Cron: "l'invito vale per due persone"
   ------------------------------------------------------------
   Lavoro programmato (vercel.json), ogni venti minuti nei giorni
   feriali. Scrive UNA mail, solo testo, a chi si e' iscritto a Milano
   2027 con il codice riservato arrivato per PEC quando e' l'unica
   persona della sua azienda: l'invito vale per due, la seconda si
   registri prima che i posti finiscano, e il codice e' questo. Il
   lavoro vero, e le sue regole, stanno in
   lib/promemoria-seconda-persona.js.

   Protezione: come gli altri lavori programmati, solo con
   l'intestazione Authorization e il segreto CRON_SECRET, che Vercel
   mette da se'. Fuori dall'orario (lun-ven, 9-19 ora di Milano) il
   giro risponde `fuoriOrario` e non legge niente; con
   PROMEMORIA_SECONDA_PERSONA=no risponde `spento`.
   ============================================================ */

const admin = require('firebase-admin');
const GIRO = require('../lib/promemoria-seconda-persona');

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
        if (conti.bloccato || conti.rimaste || conti.errori || conti.incerte) console.warn('Seconda persona:', JSON.stringify(conti));
        else if (conti.inviate || conti.occupato) console.log('Seconda persona:', JSON.stringify(conti));
        res.status(200).json(Object.assign({ ok: true }, conti));
    } catch (e) {
        console.error('Seconda persona:', String((e && e.message) || e).slice(0, 200));
        res.status(500).json({ ok: false });
    }
};
