/* ============================================================
   La traccia di un referente spostato d'azienda
   ------------------------------------------------------------
   Spostare una persona da un'impresa a un'altra e' una decisione di
   chi organizza gli incontri, non un dato che l'iscritto ha fornito:
   deve restare scritto chi l'ha presa, quando, e da dove veniva
   quella persona. La frase la compone il servizio - qui, in un posto
   solo - perche' la scrivono in due: presenze.js la restituisce
   subito a chi ha appena spostato, iscrizioni.js la allega alla
   scheda a ogni lettura dell'elenco. Se fossero due frasi diverse, la
   riga cambierebbe testo da sola al primo aggiornamento.
   ============================================================ */

function quandoInItalia(ms) {
    if (!ms) return '';
    try {
        return new Date(ms).toLocaleDateString('it-IT', {
            timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric'
        });
    } catch (e) { return new Date(ms).toISOString().slice(0, 10); }
}

/* `voce`: { prima, dopo, daNome, quando }. Torna stringa vuota se non c'e'
   niente da raccontare, cosi' chi la usa puo' scrivere `if (traccia)`. */
function tracciaSpostamento(voce) {
    const v = voce || {};
    if (!v.dopo && !v.prima) return '';
    const partenza = String(v.prima || '').trim();
    const quando = quandoInItalia(v.quando);
    const chi = String(v.daNome || '').trim();
    return (partenza ? 'spostato da ' + partenza : 'aggiunto a questa azienda')
        + (quando ? ' il ' + quando : '')
        + (chi ? ' da ' + chi : '');
}

module.exports = { tracciaSpostamento, quandoInItalia };
