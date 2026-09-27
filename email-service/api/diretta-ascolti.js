/* ============================================================
   Cron degli ascolti della diretta: OGNI MINUTO (vercel.json)
   ------------------------------------------------------------
   La fotografia di chi e' collegato, per ogni evento "in finestra"
   (in onda o in pausa, oppure da due ore prima dell'inizio a due ore
   dopo la fine; a diretta chiusa un'ora dopo la fine basta). Tutto sta
   in lib/diretta-ascolti.js (fotografa); qui solo la porta. E' una
   funzione separata da diretta-cron.js perche' quello gira ogni 5
   minuti e puo' lavorare per minuti (le code delle email): la
   fotografia deve arrivare puntuale, e pesa poco.

   Senza eventi in finestra costa due letture (le query su `eventi`) e
   niente log. Con un evento in finestra: una lettura per ogni persona
   collegata, piu' una lettura e una scrittura del documento
   ascolti/{idEvento}. Un cron doppio o in ritardo sullo stesso minuto
   non scrive niente (saltato).

   maxDuration 60 s in vercel.json: con mille collegati la fotografia
   dura qualche centinaio di millisecondi.

   Protezione: la stessa di diretta-cron.js. Solo Vercel puo'
   chiamarlo, con l'intestazione Authorization: Bearer ${CRON_SECRET}.
   Vercel usa GET; si accetta anche POST, per lanciarlo a mano con curl.
   Nei log solo numeri: [{ idEvento, minuto, collegati, saltato? }].
   ============================================================ */
'use strict';
const crypto = require('crypto');
const { contesto } = require('../lib/diretta-firebase');
const A = require('../lib/diretta-ascolti');
const D = require('../lib/diretta-dati');

// confronto a tempo costante: il segreto non si indovina misurando le risposte
function autorizzato(req) {
    const segreto = String(process.env.CRON_SECRET || '').trim();
    if (!segreto) return false;
    const arrivato = String((req.headers || {}).authorization || '');
    const a = crypto.createHash('sha256').update(arrivato).digest();
    const b = crypto.createHash('sha256').update('Bearer ' + segreto).digest();
    return crypto.timingSafeEqual(a, b);
}

module.exports = async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'POST') {
        res.setHeader('Allow', 'GET, POST');
        res.status(405).json({ ok: false, msg: 'Metodo non consentito' });
        return;
    }
    if (!autorizzato(req)) { res.status(401).json({ ok: false, msg: 'Non autorizzato' }); return; }
    res.setHeader('Cache-Control', 'no-store');
    try {
        const ctx = contesto();
        const fotografie = await A.fotografa(ctx, { adesso: ctx.adesso() });
        // solo numeri: identificativo dell'evento, minuto, quanti collegati
        if (fotografie.length) console.log('[diretta-ascolti] ' + JSON.stringify(fotografie));
        res.status(200).json({ ok: true, fotografie: fotografie });
    } catch (e) {
        console.error('[diretta-ascolti] errore: ' + D.perLog(e));
        res.status(500).json({ ok: false, msg: 'Errore interno' });
    }
};
