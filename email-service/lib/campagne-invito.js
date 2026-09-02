/* ============================================================
   Le campagne di invio alle aziende
   ------------------------------------------------------------
   La stessa macchina - elenco di aziende, invio a lotti, PEC o
   email, ricevute, esiti - serve a due scopi diversi, e finora ne
   conosceva uno solo:

     INVITO       chiedere a un'azienda di venire all'evento;
     SPONSOR      chiedere a un'azienda di sostenerlo.

   Sono liste diverse per natura. Alla prima si scrive a centinaia
   di imprese del territorio; alla seconda a poche decine scelte
   perche' hanno un interesse a mettere il proprio nome sopra la
   giornata. Tenerle nello stesso elenco vorrebbe dire che "quante
   aziende restano da invitare" non risponde piu' a niente, e che
   un invio parte per sbaglio col testo dell'altra campagna.

   COME CONVIVONO NELLO STESSO ARCHIVIO. Le schede stanno tutte in
   "aziendeInvito" e portano il campo `campagna`. Le schede scritte
   prima di questa modifica quel campo non ce l'hanno: valgono come
   'invito', che e' quello che erano. Per questo il confronto passa
   sempre da normalizza() e il filtro dell'elenco si fa in memoria e
   non con un where() - un where('campagna','==','invito') non
   troverebbe proprio le schede che ci sono gia'.

   E per la stessa ragione l'identificativo del documento, per la
   campagna 'invito', resta ESATTAMENTE quello di prima: aggiungere
   un suffisso anche li' avrebbe reso irraggiungibili gli inviti
   gia' spediti, le loro ricevute e i loro codici. Il suffisso ce
   l'hanno solo le campagne nuove. Cosi' la stessa azienda puo'
   stare in tutte e due le liste con due schede distinte, che e'
   giusto: invitarla e chiederle una sponsorizzazione sono due
   conversazioni separate, con due esiti separati.
   ============================================================ */

const PREDEFINITA = 'invito';

const ELENCO = [
    {
        id: 'invito',
        nome: 'Aziende da invitare',
        breve: 'invito',
        // il verbo usato nei messaggi a video: "da invitare", "gia invitate"
        azione: 'invitare',
        fatto: 'invitate',
        // l'etichetta con cui l'invio si presenta a Brevo e alla disiscrizione
        tag: 'invito'
    },
    {
        id: 'sponsor',
        nome: 'Richieste di sponsorizzazione',
        breve: 'sponsorizzazione',
        azione: 'contattare',
        fatto: 'contattate',
        tag: 'sponsor'
    }
];

const PER_ID = {};
ELENCO.forEach(c => { PER_ID[c.id] = c; });

/* Da quello che arriva dalla rete a una campagna che esiste.
   Qualunque cosa non riconosciuta diventa 'invito': e' il comportamento
   di prima, ed e' l'unico che non fa sparire delle schede a chi apre la
   finestra con una versione vecchia dell'area riservata in cache. */
function normalizza(v) {
    const s = String(v == null ? '' : v).trim().toLowerCase();
    return PER_ID[s] ? s : PREDEFINITA;
}
function definizione(v) { return PER_ID[normalizza(v)]; }
function esiste(v) { return !!PER_ID[String(v == null ? '' : v).trim().toLowerCase()]; }

/* La campagna di una scheda gia' in archivio: manca sulle schede
   scritte prima, e li' vale 'invito'. */
function diScheda(d) { return normalizza((d && d.campagna) || PREDEFINITA); }

/* Il suffisso dell'identificativo del documento. Vuoto sulla campagna
   predefinita, per non spostare le schede che ci sono gia'. */
function suffissoId(v) {
    const c = normalizza(v);
    return c === PREDEFINITA ? '' : ('~' + c);
}

/* L'etichetta dell'invio: entra nel collegamento di disiscrizione e
   nella chiave con cui si rileggono gli esiti da Brevo. Resta
   'invito-<evento>' sulla campagna predefinita, cosi' le disiscrizioni
   gia' registrate continuano a valere. */
function etichetta(v, evento) {
    return (definizione(v).tag + '-' + String(evento || '')).slice(0, 60);
}

/* Le ALTRE campagne rispetto a una. Oggi sono due e "l'altra" e' una sola,
   ma chi chiama non deve saperlo: il giorno che se ne aggiunge una terza,
   il controllo delle sovrapposizioni continua a guardarle tutte invece di
   guardarne una e dire che va bene. */
function altre(v) {
    const c = normalizza(v);
    return ELENCO.filter(x => x.id !== c).map(x => x.id);
}

module.exports = { PREDEFINITA, ELENCO, normalizza, definizione, esiste, diScheda, suffissoId, etichetta, altre };
