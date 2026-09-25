/* ============================================================
   Le AREE degli incontri B2B (i tavoli)
   ------------------------------------------------------------
   Un tavolo per area, e ci sono SOLO i tavoli che si tengono
   davvero: sei argomenti del convegno piu' la revisione legale e
   la certificazione ISO, che tappe del programma non sono ma
   tavoli si'. Accanto a due argomenti c'e' il loro SECONDO TAVOLO:
   un orario ospita una prenotazione sola, quindi due referenti che
   ricevono in parallelo sono due tavoli.

   L'elenco sta qui, in un posto solo, perche' lo usano TRE pezzi del
   servizio: presenze.js (che con l'invito riceve l'area e l'orario di
   ciascun tavolo e deve poter scartare le etichette che non conosce),
   iscrizione-nuova.js (che legge e salva le prenotazioni) e
   agenda-b2b.js (che tiene referenti, slot e prenotazioni della
   giornata). Finche' erano due copie, bastava una virgola di
   differenza perche' un orario arrivasse su un tavolo e la
   prenotazione su un altro.

   DUE NOMI PER LA STESSA COSA, e servono tutti e due:
     - `id` e' la chiave STABILE con cui l'area viaggia fra invito,
       prenotazione e agenda. Non cambia mai: se un giorno si
       riscrive l'etichetta, le prenotazioni gia' prese restano
       attaccate al loro tavolo;
     - `nome` e' l'etichetta corta che si legge in tabella, nella
       mail e sul foglio del desk. Quella si puo' ritoccare.

   L'ORDINE non si cambia e le voci non si tolgono: la prenotazione
   vecchia (quella a caselle, prima che ci fossero gli slot) viaggia
   per INDICE, e spostare una riga sposterebbe le scelte gia' fatte
   da un argomento all'altro. Le voci nuove si aggiungono in fondo.

   UNA VOLTA E' SUCCESSO, e si e' scelto di farlo: l'elenco e' stato
   ripulito dei cinque tavoli che a Napoli non si tenevano
   (governance, il Tax Control Framework a se' - ora accorpato al
   231 -, Bagnoli, altre esigenze e il desk Revilaw) e rimesso
   nell'ordine in cui i tavoli si leggono. Gli indici quindi sono
   cambiati tutti: le scelte salvate PRIMA per numero - le
   preferenze del modulo del sito, le prenotazioni a caselle - non
   valgono piu', e chi le rilegge trova un altro argomento o niente.
   Si e' potuto fare perche' a quel momento nessuno aveva ancora
   prenotato. Da qui in avanti vale di nuovo la regola sopra: le
   voci nuove in fondo, quelle vecchie ferme dove sono.

   Le stesse etichette, nello stesso ORDINE, stanno anche:
     - area-riservata/newsletter-format.js (TEMI_B2B, con la
       descrizione lunga accanto: e' quella che va nella mail);
     - incontri_b2b/index.html (le sole descrizioni lunghe).
   Sono file di un altro pezzo del sistema, che non condividono
   moduli con il servizio: se un giorno un'area cambia, vanno
   aggiornati tutti e tre.
   ============================================================ */

const AREE_B2B = [
    { id: 'merito-creditizio', nome: 'Merito creditizio' },
    { id: 'adeguati-assetti', nome: 'Adeguati assetti' },
    { id: 'esg', nome: 'ESG e sostenibilita' },
    /* Il 231 e il Tax Control Framework stanno insieme perche' insieme
       vanno sul palco e insieme si tengono: un sistema solo di presidio dei
       rischi, penali e fiscali. Il rating di legalita' invece e' una tappa
       sua del programma, con le sue persone, e ha il suo tavolo. */
    { id: 'modello-231', nome: 'Modello 231 e Tax Control Framework' },
    /* I TAVOLI DOPPI. Su un argomento tenuto da due persone gli incontri
       possono correre in parallelo, ma un orario di un tavolo ospita UNA
       prenotazione sola: due imprese alle 10:00 sullo stesso tavolo
       vorrebbe dire che una delle due non trova posto dove le abbiamo
       detto. Il secondo referente ha quindi il suo tavolo, con i suoi
       orari e le sue chiusure - se lui e' sul palco e l'altro no, il primo
       tavolo resta prenotabile - e chi invita sceglie a quale dei due
       convoca l'impresa. Sta accanto al suo gemello, non in fondo: chi
       guarda l'elenco deve vedere subito che sono lo stesso argomento. */
    { id: 'modello-231-b', nome: 'Modello 231 e TCF - secondo tavolo', gemelloDi: 'modello-231' },
    { id: 'finanza-agevolata', nome: 'Finanza agevolata' },
    /* I due tavoli che non sono tappe del programma: la revisione legale,
       che e' il mestiere di casa, e la certificazione ISO. Ci sono lo
       stesso, e chi organizza li gestisce insieme agli altri. */
    { id: 'revisione', nome: 'Revisione legale' },
    { id: 'certificazione-iso', nome: 'Certificazione ISO' },
    { id: 'rating-legalita', nome: 'Rating di legalita' },
    { id: 'rating-legalita-b', nome: 'Rating di legalita - secondo tavolo', gemelloDi: 'rating-legalita' },
    /* IL DESK REVILAW, e' INTERNO: non compare nel modulo dell'azienda ne'
       nella mail d'invito, e nessuno lo puo' prenotare da se'. Ci si finisce
       solo perche' lo decide chi organizza - di solito portandoci un'altra
       esigenza segnalata dall'impresa, che a un tavolo del convegno non
       appartiene. All'azienda arriva comunque la mail con il foglio: l'ora e
       il posto dove presentarsi ci sono, quello che non c'e' e' il modo di
       scegliersela da soli. Anche lui ha il suo secondo tavolo. */
    { id: 'desk-revilaw', nome: 'Desk Revilaw', interno: true },
    /* IL SECONDO TAVOLO DEL MERITO CREDITIZIO, e l'identificativo dice ancora
       "desk-revilaw-b" perche' questo tavolo NASCE come secondo desk Revilaw e
       poi e' stato convertito: il merito creditizio e' l'argomento piu'
       richiesto, e il desk interno ne serviva uno solo.
       L'identificativo non si e' cambiato perche' e' la chiave con cui il
       tavolo viaggia fra invito, prenotazione e agenda: riscriverlo avrebbe
       staccato dal loro tavolo gli appuntamenti gia' presi e le chiusure gia'
       decise. E' esattamente il caso per cui id e nome sono due cose diverse
       (vedi il cappello di questo file): il nome si ritocca, l'id no.
       Per la stessa ragione la riga resta IN FONDO e non accanto al merito
       creditizio: l'ordine e' quello con cui viaggiano le prenotazioni per
       indice, e spostarla sposterebbe le scelte gia' fatte.
       Non e' piu' `interno`: adesso l'azienda lo vede - anzi non lo vede come
       tavolo a se', vede il merito creditizio con il doppio degli orari. */
    { id: 'desk-revilaw-b', nome: 'Merito creditizio - secondo tavolo', gemelloDi: 'merito-creditizio' }
];

// le sole etichette, nello stesso ordine: la forma con cui gli orari e le
// prenotazioni viaggiavano gia' prima che le aree avessero un identificativo
const TEMI_B2B = AREE_B2B.map(a => a.nome);

/* =========================================================
   TAVOLI GEMELLI E TAVOLI INTERNI
   ---------------------------------------------------------
   Due argomenti (e il desk Revilaw) sono tenuti da DUE persone, quindi
   hanno due tavoli. Sono due tavoli veri - due referenti, due griglie
   di orari, due chiusure diverse quando uno dei due e' sul palco - e
   per chi organizza restano due.
   Per l'AZIENDA invece sono un tavolo solo: a lei interessa l'argomento
   e l'ora, non a quale dei due professionisti la manderemo. Prima il
   modulo li mostrava tutti e due, uno sotto l'altro, con lo stesso
   titolo: sembrava un errore, e all'impresa toccava scegliere una cosa
   che non e' sua. Adesso il modulo mostra UNA voce per famiglia, con
   gli orari dei due tavoli fusi: lo stesso orario si puo' prenotare due
   volte, e a chi dei due assegnarlo lo decide il servizio (il primo
   libero, il capofila per primo). Chi organizza puo' sempre spostare.

   `interno` e' l'altra faccia: un tavolo che esiste per noi e non per
   loro. Non si manda nell'invito, non compare nel modulo, non si
   prenota da se'. L'appuntamento pero' e' vero, e va sul foglio.
========================================================= */
function capofilaDi(id) {
    const a = areaDa(id);
    return a ? (a.gemelloDi || a.id) : '';
}
/* I tavoli di una famiglia, nell'ordine in cui si riempiono: prima il
   capofila, poi i suoi secondi tavoli. L'ordine e' quello dell'elenco. */
function gemelliDi(id) {
    const capo = capofilaDi(id);
    if (!capo) return [];
    return AREE_B2B.filter(a => (a.gemelloDi || a.id) === capo).map(a => a.id);
}
function areaInterna(id) { const a = areaDa(id); return !!(a && a.interno); }
/* Le famiglie che l'azienda puo' vedere: una voce per argomento, senza le
   interne. `aree` sono i tavoli veri che ci stanno dentro. */
function famiglieB2B() {
    return AREE_B2B.filter(a => !a.gemelloDi && !a.interno)
        .map(a => ({ id: a.id, nome: a.nome, aree: gemelliDi(a.id) }));
}

function areaDa(id) {
    const k = String(id == null ? '' : id).trim().toLowerCase();
    return AREE_B2B.find(a => a.id === k) || null;
}
// l'etichetta corta di un'area, oppure stringa vuota se l'identificativo non
// e' dei nostri: chi chiama non deve mai stampare quello che gli e' arrivato
function nomeArea(id) { const a = areaDa(id); return a ? a.nome : ''; }
/* Le etichette con cui un'area si chiamava PRIMA. Un nome si puo' ritoccare
   (l'identificativo no), ma un invito partito mesi fa parla ancora per nome:
   senza questa riga quel nome non corrisponderebbe piu' a niente, e il
   tavolo di quella convocazione sparirebbe senza che nessuno lo veda. */
const NOMI_STORICI = {
    // quando il rating di legalita' stava ancora insieme al 231
    'modello 231 e rating di legalita': 'modello-231',
    // quando desk-revilaw-b era il secondo desk della segreteria, prima di
    // diventare il secondo tavolo del merito creditizio
    'desk revilaw - secondo tavolo': 'desk-revilaw-b'
};
// dall'etichetta corta all'identificativo (gli inviti vecchi parlano per nome)
function idArea(nome) {
    const k = String(nome == null ? '' : nome).trim().toLowerCase();
    const a = AREE_B2B.find(x => x.nome.toLowerCase() === k);
    return a ? a.id : (NOMI_STORICI[k] || '');
}

/* Etichette storiche del form del sito che non coincidono alla lettera con i
   tavoli: si riportano comunque come caselle gia' spuntate, cosi' chi ha
   scelto dal sito si ritrova le sue preferenze e puo' modificarle. Le chiavi
   sono in forma normalizzata (minuscole, senza accenti).
   Le voci del modulo che un tavolo non ce l'hanno piu' (governance, Bagnoli)
   non si buttano: restano scritte sulla scheda come sono arrivate, e al
   salvataggio si riportano. Sono quello che quell'impresa aveva chiesto. */
const ALIAS_B2B = {
    'modello 231 e tax control framework': [3],
    'rating di legalita': [8],
    /* Come si chiamava il tavolo quando il 231 e il rating stavano insieme:
       chi aveva gia' scelto quella voce ritrova spuntati tutti e due i
       tavoli in cui si e' diviso, invece di ritrovarsi la casella vuota. */
    'modello 231 e rating di legalita': [3, 8]
};

module.exports = {
    AREE_B2B, TEMI_B2B, ALIAS_B2B, areaDa, nomeArea, idArea,
    capofilaDi, gemelliDi, areaInterna, famiglieB2B
};
