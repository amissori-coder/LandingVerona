/* ============================================================
   Cron: il giro delle 11 dei promemoria agli iscritti
   ------------------------------------------------------------
   Stesso servizio di promemoria-eventi.js, ma spedisce SOLO i promemoria
   che partono alle 11 (record con `ora: 11`: per Napoli l'ultimo giorno
   per prenotare gli incontri B2B, il 30 settembre). Vercel lo richiama
   alle 11 di Roma (vercel.json: 9 UTC, che con l'ora solare diventano
   le 10).
   ============================================================ */
const promemoria = require('./promemoria-eventi');

module.exports = (req, res) => promemoria(req, res, { ora: 11 });
