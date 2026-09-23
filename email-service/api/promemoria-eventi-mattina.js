/* ============================================================
   Cron: il giro delle 7 dei promemoria agli iscritti
   ------------------------------------------------------------
   Stesso servizio di promemoria-eventi.js, ma spedisce SOLO le mail
   che partono alle 7 (la mattina dell'evento: record con `ora: 7`, o
   `mattina: true` se confermati prima). Vercel lo richiama alle 7 di Roma (vercel.json:
   5 UTC, che con l'ora solare diventano le 6).
   ============================================================ */
const promemoria = require('./promemoria-eventi');

module.exports = (req, res) => promemoria(req, res, { ora: 7 });
