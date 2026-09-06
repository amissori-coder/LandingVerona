/* ============================================================
   Il nome accanto al mittente: "Nome" <indirizzo>
   ------------------------------------------------------------
   Quasi tutte le mail del servizio compongono il mittente come
   stringa, '"Nome" <indirizzo>'. Il nome arriva da una variabile
   d'ambiente (SMTP_FROM_NAME, MKT_FROM_NAME, PEC_FROM_NAME) o, per
   le Comunicazioni, dal nome dell'utente dell'area riservata.

   Dentro le virgolette non devono finire ne' a capo (aprirebbero una
   riga di intestazione nuova) ne' virgolette o barre rovesciate: da
   nodemailer 9 il lettore degli indirizzi e' piu' rigoroso, e con
   un nome come Studio D"Angelo trascina il nome dentro l'indirizzo
   e la mail parte da un mittente inesistente (o il server la
   rifiuta). La 6 tollerava e toglieva la virgoletta: qui si fa la
   stessa cosa, una volta per tutti, cosi' il comportamento resta
   quello di sempre.
   ============================================================ */
'use strict';

const PREDEFINITO = 'Revilaw S.p.A.';

/* Il nome pulito e accorciato a 80 caratteri; vuoto o mancante -> quello
   dello studio. */
function nomeMittente(nome) {
    const base = String(nome == null ? '' : nome).trim() || PREDEFINITO;
    return base.replace(/[\r\n]/g, ' ').replace(/["\\]/g, '').slice(0, 80);
}

module.exports = { nomeMittente, PREDEFINITO };
