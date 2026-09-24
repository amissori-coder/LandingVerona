/* ============================================================
   Cron della diretta: ogni 5 minuti (vercel.json)
   ------------------------------------------------------------
   Il lavoro che deve succedere anche quando la pagina di gestione e'
   chiusa. Tutto sta in lib/diretta-invio.js (giroCron); qui solo la
   porta:
     - i gestori tolti da DIRETTA_ADMIN_EMAILS perdono l'accesso;
     - gli invii rimasti a meta' da piu' di 10 minuti diventano
       'incerto' (mai rispediti da soli: forse sono partiti);
     - le code delle credenziali vanno avanti fino alla fine, anche se
       il gestore ha chiuso la pagina dopo "Invia a tutti";
     - i promemoria del giorno prima e dell'ora prima partono, se
       attivati sull'evento;
     - i rimbalzi di Brevo si leggono, al massimo ogni mezz'ora.
   Se non c'e' niente da fare esce subito, con poche letture.

   I TRE NUMERI che si muovono insieme (vedi il README del servizio,
   "I tempi massimi delle funzioni"): maxDuration 300 s in vercel.json,
   budget 240 s qui, lucchetto delle code 330 s in diretta-invio.js.

   Protezione: solo Vercel puo' chiamarlo, con l'intestazione
   Authorization: Bearer ${CRON_SECRET}. Vercel usa GET; si accetta
   anche POST, per lanciarlo a mano con curl.
   ============================================================ */
'use strict';
const crypto = require('crypto');
const { contesto } = require('../lib/diretta-firebase');
const invio = require('../lib/diretta-invio');

const BUDGET_MS = 240 * 1000;

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
        const riepilogo = await invio.giroCron(ctx, { budgetMs: BUDGET_MS });
        if (riepilogo.lavoro) {
            // solo numeri: niente nomi, indirizzi o password nei log
            console.log('[diretta-cron] ' + JSON.stringify({
                gestoriRimossi: riepilogo.gestoriRimossi, incerti: riepilogo.incerti,
                code: riepilogo.code.map(c => ({ idEvento: c.idEvento, inviate: c.inviate, respinte: c.respinte, errori: c.errori, rimaste: c.rimaste, bloccato: !!c.bloccato })),
                promemoria: riepilogo.promemoria.map(p => ({ idEvento: p.idEvento, tipo: p.tipo, inviate: p.inviate, finito: p.finito })),
                esiti: riepilogo.esiti.map(e => ({ idEvento: e.idEvento, respinte: e.respinte, letto: e.letto })),
                durataMs: riepilogo.durataMs
            }));
        }
        res.status(200).json(Object.assign({ ok: true }, riepilogo));
    } catch (e) {
        console.error('[diretta-cron] errore:', String((e && e.message) || e).slice(0, 300));
        res.status(500).json({ ok: false, msg: 'Errore interno' });
    }
};
