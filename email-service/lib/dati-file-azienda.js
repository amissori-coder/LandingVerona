/* ============================================================
   I dati del file di un'azienda invitata
   ------------------------------------------------------------
   L'elenco delle aziende da invitare arriva da un file (il foglio
   della Lombardia: ricavi, utile, dipendenti, revisore, sede...) e
   chi organizza vuole ritrovare TUTTE quelle colonne accanto a chi
   si registra con il codice dell'invito, non solo le cinque che il
   servizio sa riconoscere. Qui sta la forma con cui viaggiano:

       [ { c: 'Ricavi (EUR)', v: '100674810' }, ... ]

   una voce per colonna del file, NELL'ORDINE DEL FILE, comprese le
   colonne riconosciute (PEC, Partita IVA) e le celle vuote (v: ''):
   chi legge la tabella deve ritrovare il foglio che ha caricato, non
   una sua parte riordinata. Un elenco e non una mappa perche' l'ordine
   e' parte del dato, e perche' due colonne con la stessa intestazione
   restano due.

   Sulla scheda dell'azienda e' `datiFile` (lib/aziende-invito.js, al
   caricamento); sulla scheda dell'iscritto e' `datiInvito`, copiato da
   api/iscrizione-nuova.js quando la persona si registra con il codice.
   Le schede caricate prima che esistesse `datiFile` non hanno l'elenco:
   lo si ricostruisce dai campi riconosciuti e dalle colonne in `extra`.

   PERCHE' UN FILE A PARTE. api/iscrizione-nuova.js e' l'endpoint
   pubblico del modulo e non deve caricare lib/aziende-invito.js, che
   si tira dietro il lettore della casella PEC (imapflow): se una di
   quelle librerie non parte, non deve cadere l'iscrizione (README,
   "Il modulo si carica solo quando serve"). Qui non c'e' nessun
   require.
   ============================================================ */
'use strict';

const MAX_COLONNE = 80;       // voci per scheda: un foglio vero ne ha una ventina
const MAX_INTESTAZIONE = 80;  // caratteri dell'intestazione
const MAX_VALORE = 1000;      // caratteri di una cella: i settori lunghi (~630) restano interi

function pulisci(v, max) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

/* L'elenco di una riga del file: una voce per intestazione non vuota,
   nell'ordine delle colonne. Una riga piu' corta delle intestazioni (le
   celle vuote in fondo, che il foglio non scrive) ha le voci con v: ''.
   L'asterisco in fondo all'intestazione e' quello del modello scaricabile
   ("PEC *": colonna obbligatoria): segna il foglio, non il dato, e in
   tabella sarebbe un segno senza significato. */
function colonne(intestazioni, riga) {
    const out = [];
    const et = Array.isArray(intestazioni) ? intestazioni : [];
    const r = Array.isArray(riga) ? riga : [];
    for (let i = 0; i < et.length && out.length < MAX_COLONNE; i++) {
        const c = pulisci(String(et[i] == null ? '' : et[i]).replace(/\s*\*+\s*$/, ''), MAX_INTESTAZIONE);
        if (!c) continue;
        out.push({ c: c, v: pulisci(r[i], MAX_VALORE) });
    }
    return out;
}

/* Un elenco arrivato da fuori (il database, una scheda vecchia), rimesso
   nella forma giusta: solo voci con l'intestazione, stringhe, nei limiti.
   Vuoto o assente: null. */
function pulito(lista) {
    if (!Array.isArray(lista)) return null;
    const out = [];
    for (const x of lista) {
        if (out.length >= MAX_COLONNE) break;
        if (!x || typeof x !== 'object') continue;
        const c = pulisci(x.c, MAX_INTESTAZIONE);
        if (!c) continue;
        out.push({ c: c, v: pulisci(x.v, MAX_VALORE) });
    }
    return out.length ? out : null;
}

/* I campi che il servizio riconosce, con il nome con cui si leggono in
   tabella. Servono a ricostruire l'elenco delle schede caricate prima di
   `datiFile`: di quelle il file non c'e' piu', e il meglio che si puo'
   dare e' quello che ne era rimasto. */
const CAMPI_NOTI = [
    ['ragioneSociale', 'Ragione sociale'], ['pec', 'PEC'], ['email', 'Email'],
    ['piva', 'Partita IVA'], ['cf', 'Codice fiscale'], ['referente', 'Referente'],
    ['citta', 'Citta'], ['provincia', 'Provincia'], ['telefono', 'Telefono'],
    ['settore', 'Settore'], ['note', 'Note']
];

/* L'elenco di una scheda di aziendeInvito: `datiFile` se c'e', altrimenti
   la ricostruzione - i campi riconosciuti non vuoti, poi le colonne in
   `extra` in ordine alfabetico (l'ordine del file non e' stato tenuto).
   Sempre un array, eventualmente vuoto. */
function datiFileDi(scheda) {
    const s = scheda || {};
    const suo = pulito(s.datiFile);
    if (suo) return suo;
    const out = [];
    CAMPI_NOTI.forEach(([k, c]) => {
        const v = pulisci(s[k], MAX_VALORE);
        if (v) out.push({ c: c, v: v });
    });
    const extra = (s.extra && typeof s.extra === 'object' && !Array.isArray(s.extra)) ? s.extra : {};
    Object.keys(extra).sort((a, b) => a.localeCompare(b, 'it')).forEach(k => {
        out.push({ c: k, v: extra[k] });
    });
    return pulito(out) || [];
}

module.exports = { colonne, pulito, datiFileDi, MAX_COLONNE, MAX_INTESTAZIONE, MAX_VALORE };
