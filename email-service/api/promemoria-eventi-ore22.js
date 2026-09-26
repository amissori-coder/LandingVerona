/* ============================================================
   Cron: il giro delle 22 dei promemoria agli iscritti
   ------------------------------------------------------------
   Stesso servizio di promemoria-eventi.js, ma spedisce SOLO i promemoria
   che partono alle 22 (record con `ora: 22`: per Napoli la prima mail del
   24 settembre). Vercel lo richiama alle 22 di Roma (vercel.json: 20 UTC,
   che con l'ora solare diventano le 21).
   ============================================================ */
const promemoria = require('./promemoria-eventi');

module.exports = (req, res) => promemoria(req, res, { ora: 22 });
