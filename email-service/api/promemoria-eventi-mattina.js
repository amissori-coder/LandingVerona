/* ============================================================
   Cron: il giro delle 7 dei promemoria agli iscritti
   ------------------------------------------------------------
   Stesso servizio di promemoria-eventi.js, ma spedisce SOLO le mail
   della mattina dell'evento (record con `mattina: true`): tutte le altre
   partono alle 20. Vercel lo richiama alle 7 di Roma (vercel.json:
   5 UTC, che con l'ora solare diventano le 6).
   ============================================================ */
const promemoria = require('./promemoria-eventi');

module.exports = (req, res) => promemoria(req, res, { mattina: true });
