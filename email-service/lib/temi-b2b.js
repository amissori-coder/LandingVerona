/* ============================================================
   I nove argomenti degli incontri B2B
   ------------------------------------------------------------
   Un tavolo per argomento, gli stessi del convegno. L'elenco sta
   qui, in un posto solo, perche' lo usano DUE endpoint: presenze.js
   (che con l'invito riceve l'orario di ciascun tavolo e deve poter
   scartare le etichette che non conosce) e iscrizione-nuova.js (che
   legge e salva le prenotazioni). Finche' erano due copie, bastava
   una virgola di differenza perche' un orario arrivasse su un tavolo
   e la prenotazione su un altro.

   Le stesse etichette, nello stesso ORDINE, stanno anche:
     - area-riservata/newsletter-format.js (TEMI_B2B, con la
       descrizione lunga accanto: e' quella che va nella mail);
     - incontri_b2b/index.html (le sole descrizioni lunghe).
   Sono file di un altro pezzo del sistema, che non condividono
   moduli con il servizio: se un giorno un argomento cambia, vanno
   aggiornati tutti e tre.
   ============================================================ */

const TEMI_B2B = [
    'Merito creditizio',
    'Governance e controllo di gestione',
    'Adeguati assetti',
    'ESG e sostenibilita',
    'Modello 231 e Rating di Legalita',
    'Finanza agevolata',
    'Tax Control Framework',
    "Bagnoli e America's Cup 2027",
    'Altre esigenze'
];

/* Etichette storiche del form del sito che non coincidono alla lettera con i
   nove temi: si riportano comunque come caselle gia' spuntate, cosi' chi ha
   scelto dal sito si ritrova le sue preferenze e puo' modificarle. Le chiavi
   sono in forma normalizzata (minuscole, senza accenti). */
const ALIAS_B2B = {
    'modello 231 e tax control framework': [4, 6],
    'rating di legalita': [4]
};

module.exports = { TEMI_B2B, ALIAS_B2B };
