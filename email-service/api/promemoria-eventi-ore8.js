/* ============================================================
   Cron: il giro delle 8 dei promemoria agli iscritti
   ------------------------------------------------------------
   Stesso servizio di promemoria-eventi.js, ma spedisce SOLO i promemoria
   che partono alle 8 (record con `ora: 8`: per Napoli sabato 26 settembre
   e il 1° ottobre). Vercel lo richiama alle 8 di Roma (vercel.json: 6 UTC,
   che con l'ora solare diventano le 7).
   ============================================================ */
const promemoria = require('./promemoria-eventi');

module.exports = (req, res) => promemoria(req, res, { ora: 8 });
