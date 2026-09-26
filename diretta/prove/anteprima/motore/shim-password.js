/* ============================================================
   ANTEPRIMA - le password della diretta, con un aggancio per la semina
   ------------------------------------------------------------
   Tutto come lib/diretta-password.js (lo stesso file, importato qui
   sotto), tranne una cosa: la semina dell'anteprima puo' fissare la
   PROSSIMA password generata, cosi' gli accessi di prova elencati
   nella guida sono proprio quelli scritti nelle email di prova.
   Fuori dalla semina, password casuali come sempre.
   ============================================================ */
'use strict';
const vero = require('../../../../email-service/lib/diretta-password.js');

function generaPassword(lunghezza) {
    const fissa = globalThis.NGBA_PROSSIMA_PASSWORD;
    if (fissa) { globalThis.NGBA_PROSSIMA_PASSWORD = ''; return fissa; }
    return vero.generaPassword(lunghezza);
}

module.exports = Object.assign({}, vero, { generaPassword });
