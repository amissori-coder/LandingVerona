/* ============================================================
   Cron: l'aggiornamento automatico sui nuovi bandi
   ------------------------------------------------------------
   Lavoro programmato (vercel.json), ogni quarto d'ora. Legge i
   bandi pubblicati sul sito, si accorge di quelli nuovi e, quando
   e' il momento, li manda per email agli iscritti alla newsletter
   dei bandi. Il lavoro vero, e le sue regole (l'ora di quiete, la
   finestra del giorno, un giro alla volta), stanno in
   lib/newsletter-bandi.js.

   Protezione: come gli altri lavori programmati, solo con
   l'intestazione Authorization e il segreto CRON_SECRET, che Vercel
   mette da se'. Chiamata a mano (per provare): GET con la stessa
   intestazione.
   ============================================================ */

const N = require('../lib/newsletter');
const NB = require('../lib/newsletter-bandi');

module.exports = async (req, res) => {
    const segreto = String(process.env.CRON_SECRET || '').trim();
    const auth = String((req.headers || {})['authorization'] || '');
    if (!segreto || auth !== 'Bearer ' + segreto) { res.status(401).json({ ok: false, msg: 'Non autorizzato' }); return; }
    try {
        N.initAdmin();
        const conti = await NB.giro(N.admin.firestore());
        // i conti finiscono nei log di Vercel: e' li' che si guarda se il giro lavora
        if (conti.erroreSito || conti.errore || conti.fermo || conti.avvisi) console.warn('Newsletter bandi:', JSON.stringify(conti));
        else if (conti.seminati || conti.giroCreato || conti.inviati || conti.finito || conti.nuovi) console.log('Newsletter bandi:', JSON.stringify(conti));
        res.status(200).json(Object.assign({ ok: true }, conti));
    } catch (e) {
        console.error('Newsletter bandi:', String((e && e.message) || e).slice(0, 200));
        res.status(500).json({ ok: false });
    }
};
