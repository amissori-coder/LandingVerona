/* ============================================================
   Cron: gli inviti alle aziende programmati (sezione Eventi)
   ------------------------------------------------------------
   Vercel richiama questo endpoint ogni dieci minuti (vedi vercel.json).
   A ogni giro fa partire quanti inviti il RITMO della programmazione
   consente adesso - per esempio 250 PEC ogni novanta minuti, oppure
   1.000 email ogni ora - e poi si ferma. Il lavoro vero sta in
   lib/giro-inviti.js: qui c'e' solo la porta.

   PERCHE' UNA FUNZIONE SUA e non una deviazione su api/presenze.js,
   che pure e' la porta di tutta la sezione aziende. Perche' presenze.js
   ha gia' un lavoro programmato (il lettore della casella PEC) e una
   terna di numeri tarata su di lui: maxDuration 60, budget 40 secondi,
   lucchetto 3 minuti. Un invio a ritmo ha bisogno di minuti, non di
   secondi: infilarlo li' avrebbe voluto dire alzare il maxDuration di
   una funzione che serve anche ogni singolo clic dell'area riservata,
   e far concorrere due lavori diversi sullo stesso budget. Il tetto
   delle 12 funzioni per rilascio, che a suo tempo aveva costretto a
   quelle deviazioni, sul piano Pro non c'e' piu'.

   Chi programma, sospende e annulla NON passa di qui: quelle azioni
   arrivano dall'area riservata insieme a tutte le altre della sezione
   aziende (api/presenze.js -> lib/aziende-invito.js), dove i permessi
   sono gia' verificati una volta sola.

   Protezione: solo Vercel puo' chiamarlo, con l'intestazione
   Authorization e il segreto CRON_SECRET. Nessuna credenziale nel
   codice.
   ============================================================ */

const admin = require('firebase-admin');
const GIRO = require('../lib/giro-inviti');

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
    /* Solo il lavoro programmato di Vercel. Il filtro sul segreto vuoto non
       e' pignoleria: senza, una variabile non impostata renderebbe valida
       la stringa 'Bearer undefined', che chiunque puo' scrivere a mano. */
    const segreto = String(process.env.CRON_SECRET || '').trim();
    const auth = String((req.headers || {})['authorization'] || '');
    if (!segreto || auth !== 'Bearer ' + segreto) {
        res.status(401).json({ ok: false, msg: 'Non autorizzato' });
        return;
    }
    try {
        initAdmin();
        const r = await GIRO.eseguiGiro(admin.firestore());
        res.status(r.ok ? 200 : (r.stato || 500)).json(r);
    } catch (e) {
        const motivo = String((e && e.message) || 'errore').slice(0, 300);
        console.error('Giro inviti programmati:', motivo);
        res.status(500).json({ ok: false, msg: 'Giro non riuscito: ' + motivo });
    }
};
