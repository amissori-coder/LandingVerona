/* ============================================================
   L'origine autorizzata a chiamare il servizio dal browser (CORS)
   ------------------------------------------------------------
   Il sito sta su un solo dominio (file CNAME alla radice del repo) e
   tutte le pagine che chiamano queste funzioni girano li'. Su Vercel
   l'origine e' nella variabile ALLOWED_ORIGIN (README, passo 4); se
   la variabile manca - progetto ricreato, variabile dimenticata - il
   servizio non si apre a qualunque sito ('*'), come faceva prima, ma
   resta chiuso sul dominio dello studio. Con la variabile impostata
   il comportamento e' identico a prima.

   Vale solo per le chiamate fatte dal browser: i lavori programmati,
   i pulsanti "Annulla iscrizione" dei programmi di posta e i
   collegamenti aperti dalle email non mandano un'origine e non ne
   sono toccati.
   ============================================================ */
'use strict';

const ORIGINE_SITO = 'https://nextgenerationbusiness.it';

function origineConsentita() {
    return process.env.ALLOWED_ORIGIN || ORIGINE_SITO;
}

module.exports = { ORIGINE_SITO, origineConsentita };
