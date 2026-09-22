/* ============================================================
   Le AREE degli incontri B2B (i tavoli)
   ------------------------------------------------------------
   Un tavolo per area, e ci sono SOLO i tavoli che si tengono
   davvero: sei argomenti del convegno piu' la revisione legale e
   la certificazione ISO, che tappe del programma non sono ma
   tavoli si'. Accanto a due argomenti c'e' il loro SECONDO TAVOLO:
   un orario ospita una prenotazione sola, quindi due referenti che
   ricevono in parallelo sono due tavoli.

   MA CHI PRENOTA NON DEVE SAPERLO. Due tavoli sullo stesso
   argomento sono un dettaglio della nostra organizzazione: per
   l'impresa invitata c'e' UN argomento e UN elenco di orari, e le
   10:00 sono libere finche' c'e' posto su almeno uno dei due. Il
   conto dei posti lo teniamo noi (`gruppo`), e quando si prenota si
   riempie PRIMA il tavolo principale - quello del referente che
   l'argomento lo porta sul palco - e solo dopo il secondo.
   Il campo `gruppo` dice a quale argomento un tavolo appartiene;
   l'ordine dell'elenco dice quale si riempie per primo.

   TAVOLI INTERNI (`interna`). Il desk Revilaw non e' un argomento
   del convegno: e' il banco dove si chiede di noi. Non compare fra
   le scelte dell'invito ne' nel modulo dell'ospite, e ci si finisce
   solo perche' lo decide chi organizza. Sta nell'elenco lo stesso,
   perche' un incontro assegnato li' e' un incontro come gli altri:
   ha un orario, una conferma e un foglio per il desk.

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
    { id: 'modello-231-b', nome: 'Modello 231 e TCF - secondo tavolo', gruppo: 'modello-231' },
    { id: 'finanza-agevolata', nome: 'Finanza agevolata' },
    /* I due tavoli che non sono tappe del programma: la revisione legale,
       che e' il mestiere di casa, e la certificazione ISO. Ci sono lo
       stesso, e chi organizza li gestisce insieme agli altri. */
    { id: 'revisione', nome: 'Revisione legale' },
    { id: 'certificazione-iso', nome: 'Certificazione ISO' },
    { id: 'rating-legalita', nome: 'Rating di legalita' },
    { id: 'rating-legalita-b', nome: 'Rating di legalita - secondo tavolo', gruppo: 'rating-legalita' },
    /* In fondo, come vuole la regola dell'ordine. Interno: non si invita
       nessuno al desk Revilaw, ci si assegna. */
    { id: 'desk-revilaw', nome: 'Desk Revilaw', interna: true }
];

// le sole etichette, nello stesso ordine: la forma con cui gli orari e le
// prenotazioni viaggiavano gia' prima che le aree avessero un identificativo
const TEMI_B2B = AREE_B2B.map(a => a.nome);

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
    'modello 231 e rating di legalita': 'modello-231'
};
// dall'etichetta corta all'identificativo (gli inviti vecchi parlano per nome)
function idArea(nome) {
    const k = String(nome == null ? '' : nome).trim().toLowerCase();
    const a = AREE_B2B.find(x => x.nome.toLowerCase() === k);
    return a ? a.id : (NOMI_STORICI[k] || '');
}

/* =========================================================
   I GRUPPI: piu' tavoli, un argomento solo
   ------------------------------------------------------------
   `gruppoDi` dice sotto quale argomento un tavolo va mostrato: per un
   tavolo normale e' se stesso, per un secondo tavolo e' il suo gemello.
   `tavoliDelGruppo` li rida' NELL'ORDINE IN CUI SI RIEMPIONO - prima il
   principale, poi i secondi - ed e' quest'ordine che manda le prime
   prenotazioni al referente che tiene l'argomento.
========================================================= */
function gruppoDi(id) {
    const a = areaDa(id);
    if (!a) return '';
    return a.gruppo && areaDa(a.gruppo) ? a.gruppo : a.id;
}
// e' un secondo tavolo? (serve a non mostrarlo come argomento a se')
function eSecondario(id) { const a = areaDa(id); return !!(a && a.gruppo); }
// e' un tavolo nostro, che negli inviti non si offre?
function eInterna(id) { const a = areaDa(id); return !!(a && a.interna); }
/* I tavoli di un argomento, nell'ordine in cui si riempiono. Un id che non
   e' un capogruppo torna la lista del SUO gruppo: chi chiama puo' passare
   indifferentemente 'modello-231' o 'modello-231-b' e ottiene la stessa
   coppia, sempre nello stesso ordine. */
function tavoliDelGruppo(id) {
    const g = gruppoDi(id);
    if (!g) return [];
    return AREE_B2B.filter(a => (a.gruppo && areaDa(a.gruppo) ? a.gruppo : a.id) === g).map(a => a.id);
}
/* Gli ARGOMENTI: un capogruppo per volta, senza i secondi tavoli. E' l'elenco
   che vede chi prenota e chi sceglie a cosa invitare un'impresa. Con
   `conInterne` si aggiungono i tavoli nostri: lo fa solo l'area riservata. */
function argomentiB2B(conInterne) {
    return AREE_B2B.filter(a => !a.gruppo && (conInterne ? true : !a.interna))
        .map(a => ({ id: a.id, nome: a.nome, interna: !!a.interna, tavoli: tavoliDelGruppo(a.id) }));
}
/* Il nome dell'ARGOMENTO di un tavolo: il secondo tavolo del 231 si chiama
   "Modello 231 e Tax Control Framework" dovunque l'ospite lo legga - mail,
   foglio del desk, riepilogo -, perche' e' li' che ha l'appuntamento. Il
   nome vero del tavolo resta per noi. */
function nomeArgomento(id) { return nomeArea(gruppoDi(id)); }

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
    gruppoDi, eSecondario, eInterna, tavoliDelGruppo, argomentiB2B, nomeArgomento
};
