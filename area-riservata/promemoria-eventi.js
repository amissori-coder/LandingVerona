/* ============================================================
   PROMEMORIA AGLI ISCRITTI - i testi e il calendario, evento per evento
   ------------------------------------------------------------
   Perche' un file a parte: qui non c'e' niente dell'applicazione.
   Sono i TESTI delle mail che ricordano l'evento a chi si e' gia'
   iscritto, con il giorno e l'ora in cui e' sensato mandarle e a
   quali sezioni (in sala oppure online). L'area riservata li mostra
   nella scheda "Promemoria agli iscritti" dell'evento come PROPOSTE:
   chi organizza le apre, le legge, corregge quello che vuole,
   sceglie data e ora e conferma. Finche' non conferma non parte
   niente. Il lavoro programmato del servizio (api/promemoria-eventi.js)
   spedisce poi quelle confermate, all'ora scelta.

   IN SALA E ONLINE SONO DUE SERIE DIVERSE, e non e' un dettaglio di
   stile: a chi viene di persona servono indirizzo, orari, come
   arrivare, il badge, il posto da liberare se non viene piu'; a chi
   segue da remoto serve il collegamento, a che ora aprirlo, cosa gli
   serve per seguire. Una mail sola per tutti direbbe a meta' dei
   lettori cose che non li riguardano.

   La forma della mail (testata, riquadro, pulsante, piede) sta in
   newsletter-format.js (promemoriaEvento): qui ci sono solo le
   parole. Regole del testo: si da' del Lei e si apre con "Gentile nome
   cognome", come le altre mail al singolo; niente trattini lunghi (nelle
   mail dello studio non ci vanno); nessun conto alla rovescia ("manca una
   settimana") scritto a mano: i giorni che mancano li scrive il servizio
   la mattina dell'invio, con {{MANCANO}} e {{QUANDO}};
   {{NOME}} e {{COMPLETA}} li sostituisce il servizio per
   destinatario; {{LINK_DIRETTA}} lo sostituisce l'area riservata
   con il collegamento scritto da chi programma (campo "linkDiretta").

   Il servizio passa tre volte al giorno, alle 7, alle 8 e alle 20: ogni
   proposta ha la sua ora (`ora`, se manca 20) e di una proposta si sceglie
   il giorno. Per Napoli: 24 e 29 settembre alle 20, sabato 26 e 1° ottobre
   alle 8, la mattina dell'evento alle 7.

   Ogni proposta: { id, nome, sezioni: 'sala'|'online', giorniPrima,
   campi: ['linkDiretta'], mail: { oggetto, anteprima, titolo,
   sommario, paragrafi, righe, programma, pulsante, nota,
   linkPersonale } } - la parte `mail` e' quella che promemoriaEvento
   riceve, gia' con i segnaposti al loro posto.
   ============================================================ */
(function (radice, fabbrica) {
    const api = fabbrica();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else radice.RV_PROMEMORIA = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const SITO = 'https://nextgenerationbusiness.it';
    const NOME = '{{NOME}}';
    const COMPLETA = '{{COMPLETA}}';
    const LINK_DIRETTA = '{{LINK_DIRETTA}}';

    /* Le sezioni a cui una serie si rivolge. "In sala" sono le tre sezioni
       che occupano un posto (ospiti, aderenti Revilaw, sponsor e relatori):
       a tutti e tre servono le stesse informazioni pratiche. Chi programma
       puo' comunque togliere una sezione prima di confermare. */
    const SERIE = {
        sala: { id: 'sala', nome: 'In sala', sezioni: ['presenza', 'aderenti', 'sponsor'], spiega: 'ospiti, aderenti Revilaw e sponsor e relatori: chi viene di persona' },
        online: { id: 'online', nome: 'Online', sezioni: ['online'], spiega: 'chi segue i lavori da remoto' }
    };

    /* I campi che una proposta puo' chiedere a chi programma. Il collegamento
       alla diretta non sta scritto qui perche' non si conosce in anticipo, e
       una mail che lo promette senza averlo non deve poter partire. */
    const CAMPI = {
        linkDiretta: {
            id: 'linkDiretta', etichetta: 'Collegamento alla diretta', tipo: 'url', segnaposto: LINK_DIRETTA,
            esempio: 'https://...',
            aiuto: 'L\'indirizzo che gli iscritti online apriranno per seguire i lavori. Finisce nel pulsante e, scritto per esteso, nel testo. Lo stesso per tutte le mail che lo chiedono.'
        }
    };

    /* --- Napoli, venerdi' 2 ottobre 2026 ---
       SECONDA VERSIONE, dopo le osservazioni di Sergio Miele (15 settembre)
       e con il programma aggiornato sulla pagina dell'evento:
         - quattro mail per serie invece di cinque, senza quella che a due
           settimane raccontava di nuovo gli argomenti (sembrava promozionale);
         - i giorni che mancano li scrive il servizio la mattina dell'invio
           ({{MANCANO}}, {{QUANDO}}): la stessa mail e' giusta il giorno per
           cui e' programmata e giorni dopo, come benvenuto a chi si iscrive
           in ritardo. La chiusura delle prenotazioni B2B, idem, e il
           paragrafo che invita a prenotare sparisce da solo dopo quel giorno;
         - il programma con i titoli esatti delle sessioni, e gli orari veri:
           lavori 9.00-17.30, incontri B2B 10.00-17.00 e solo su invito;
         - Lei e "Gentile nome cognome", come le altre mail al singolo.
       La mail con il collegamento e le credenziali di accesso alla diretta
       NON e' qui: la manda chi organizza, a parte, perche' contiene gli
       accessi. Le due mail online che seguono la richiamano senza ripeterne
       il contenuto.
       Gli identificativi sono nuovi apposta: un promemoria confermato con la
       prima versione resta in elenco come riga a parte, riconoscibile, e il
       servizio non lo manda a chi si iscrive dopo (vedi "recupera"). */
    const NAPOLI = {
        dove: 'Hotel Eurostars Excelsior, Via Partenope 48, Napoli',
        mappa: 'https://maps.google.com/?q=Eurostars+Hotel+Excelsior+Via+Partenope+48+Napoli',
        programmaPagina: SITO + '/napoli_ottobre_2026/#programma',
        /* I titoli ESATTI delle sessioni, come sulla pagina dell'evento: una
           sessione che non c'e' non si inventa, e una che cambia nome la si
           cambia qui. */
        programma: [
            { ora: '9.00', nome: 'Registrazione e welcome coffee', sala: true },
            { ora: '9.30', nome: 'Apertura ufficiale dei lavori' },
            { ora: '9.50', nome: 'Keynote introduttivo' },
            { ora: '10.00', nome: 'Adeguati assetti e continuità aziendale' },
            { ora: '10.30', nome: 'Il futuro della Piccola Industria italiana' },
            { ora: '11.00', nome: 'Modello 231 e Tax Control Framework' },
            { ora: '11.30', nome: 'Coffee break', sala: true },
            { ora: '11.50', nome: 'Sostenibilità e fattori ESG' },
            { ora: '12.40', nome: 'Finanza agevolata' },
            { ora: '13.30', nome: 'Lunch buffet e networking', sala: true },
            { ora: '14.30', nome: 'Banche' },
            { ora: '15.30', nome: 'Invitalia e SIMEST · Bagnoli e America\'s Cup 2027' },
            { ora: '16.20', nome: 'Rating di Legalità' },
            { ora: '17.00', nome: 'Conclusioni e chiusura dei lavori' }
        ]
    };
    // per la sala tutto; per la diretta non la registrazione, e il pranzo e' una pausa
    const PROGRAMMA_SALA = NAPOLI.programma.map(v => ({ ora: v.ora, nome: v.nome }));
    const PROGRAMMA_DIRETTA = NAPOLI.programma
        .filter(v => v.nome !== 'Registrazione e welcome coffee')
        .map(v => ({ ora: v.ora, nome: v.nome === 'Lunch buffet e networking' ? 'Pausa pranzo' : v.nome }));

    /* COME SI LEGGONO I SEGNI SULLE PROPOSTE
       - benvenuto: e' la mail COMPLETA della serie. A chi entra nella serie
         dopo che e' partita, il servizio la manda la mattina seguente, con i
         giorni ricalcolati: e' il suo primo contatto.
       - soloIlGiorno: vale solo per il suo giorno (la vigilia, la mattina
         dell'evento). Quel giorno arriva a tutti e ha la precedenza sul
         benvenuto; non si manda mai in un altro giorno.
       - {{MANCANO}} {{QUANDO}} {{CHIUSURA_B2B}} e i paragrafi `se: 'B2B'`: li
         scrive il servizio la mattina dell'invio (vedi tempo, qui sotto). */
    /* La versione dei testi e della forma della mail. Si scrive sul record
       quando si conferma: un promemoria confermato con una versione
       precedente l'area riservata lo segnala, perche' riaprendolo si
       possano prendere i testi nuovi. Va cambiata a ogni revisione. */
    const VERSIONE_TESTI = '2026-09-24-programma';
    const PROPOSTE = {
        'napoli-2026-10-02': [
            /* ------------------------- IN SALA ------------------------- */
            {
                id: 'sala-programma', serie: 'sala', giorniPrima: 8, benvenuto: true, ora: 22,
                nome: 'Otto giorni prima: programma e informazioni essenziali',
                mail: {
                    oggetto: 'IMPORTANTE - {{AZIENDA}} - {{MANCANO}} a Next Generation Business: il programma dei lavori',
                    anteprima: 'Venerdì 2 ottobre 2026, Hotel Eurostars Excelsior di Napoli. Registrazione dalle ore 9.00.',
                    titolo: 'Venerdì 2 ottobre 2026, Napoli',
                    sommario: 'Gentile ' + NOME + ', {{mancano}} a Next Generation Business, che si terrà venerdì 2 ottobre 2026 presso l\'Hotel Eurostars Excelsior di Napoli. Siamo lieti di confermarLe la partecipazione in presenza.',
                    paragrafi: [
                        'I lavori avranno inizio alle ore 9.30 e si concluderanno alle ore 17.30. La registrazione dei partecipanti, accompagnata dal welcome coffee, sarà aperta dalle ore 9.00; alle ore 13.30 è previsto un lunch buffet offerto dall\'organizzazione.',
                        'Poiché la sala sarà al completo, La invitiamo a presentarsi prima delle ore 9.00, così da consentire l\'avvio puntuale dei lavori. Di seguito riportiamo il programma della giornata; la versione completa, con i nominativi dei relatori, è disponibile sul sito dell\'evento.',
                        { titolo: 'Incontri B2B', testo: 'Qualora abbia ricevuto l\'invito agli incontri B2B e non abbia ancora prenotato i Suoi appuntamenti, La invitiamo a provvedere quanto prima attraverso il collegamento indicato nell\'invito: le fasce orarie disponibili sono limitate e le prenotazioni si chiuderanno {{CHIUSURA_B2B}}.', se: 'B2B' }
                    ],
                    righe: [['Data', 'Venerdì 2 ottobre 2026, dalle ore 9.00 alle ore 17.30'], ['Sede', NAPOLI.dove], ['Arrivo', 'Prima delle ore 9.00'], ['Registrazione', 'Dalle ore 9.00, con welcome coffee'], ['Pranzo', 'Lunch buffet offerto, ore 13.30']],
                    programma: PROGRAMMA_SALA,
                    pulsante: { testo: 'Programma completo e relatori', url: NAPOLI.programmaPagina },
                    nota: '',
                    linkPersonale: true
                }
            },
            {
                id: 'sala-sabato', serie: 'sala', giorniPrima: 6, ora: 8,
                nome: 'Sabato 26: incontri B2B, networking e arrivo',
                mail: {
                    oggetto: 'IMPORTANTE - {{AZIENDA}} - {{MANCANO}} a Next Generation Business: incontri B2B e networking',
                    anteprima: 'Le informazioni sugli incontri B2B e sui momenti di networking della giornata del 2 ottobre.',
                    titolo: 'Incontri B2B e networking',
                    sommario: 'Gentile ' + NOME + ', {{mancano}} a Next Generation Business. Oltre alle sessioni in programma, la giornata offrirà diverse occasioni di confronto tra imprese, professionisti e relatori.',
                    paragrafi: [
                        'Il welcome coffee delle ore 9.00 e il lunch buffet delle ore 13.30 sono pensati anche come momenti di networking, per favorire la conoscenza e il dialogo tra i partecipanti.',
                        { titolo: 'Incontri B2B', testo: 'Dalle ore 10.00 alle ore 17.00, in parallelo ai lavori, si svolgeranno gli incontri B2B, riservati ai partecipanti che hanno ricevuto l\'invito.' },
                        { testo: 'Qualora abbia ricevuto l\'invito e non abbia ancora prenotato, La invitiamo a farlo al più presto attraverso il collegamento indicato nell\'invito: le fasce orarie sono limitate e vengono assegnate in ordine di prenotazione. Le prenotazioni si chiuderanno {{CHIUSURA_B2B}}.', se: 'B2B' },
                        { titolo: 'Orario di arrivo', testo: 'Poiché la sala sarà al completo, La invitiamo a presentarsi prima delle ore 9.00, così da consentire l\'avvio puntuale dei lavori alle ore 9.30. Per la registrazione sarà sufficiente indicare il Suo nominativo al desk di accoglienza.' }
                    ],
                    righe: [['Data', 'Venerdì 2 ottobre 2026, dalle ore 9.00 alle ore 17.30'], ['Sede', NAPOLI.dove], ['Arrivo', 'Prima delle ore 9.00'], ['Pranzo', 'Lunch buffet offerto, ore 13.30']],
                    pulsante: { testo: 'Programma completo e relatori', url: NAPOLI.programmaPagina },
                    nota: '',
                    linkPersonale: true
                }
            },
            {
                id: 'sala-presenza', serie: 'sala', giorniPrima: 3,
                nome: 'Tre giorni prima: conferma della presenza e incontri B2B',
                mail: {
                    oggetto: 'IMPORTANTE - {{AZIENDA}} - {{MANCANO}} a Next Generation Business: la Sua partecipazione in sala',
                    anteprima: 'Qualora non potesse partecipare, La preghiamo di comunicarcelo: il posto sarà assegnato a chi è in lista d\'attesa.',
                    titolo: 'La Sua partecipazione in sala',
                    sommario: 'Gentile ' + NOME + ', {{mancano}} a Next Generation Business e l\'organizzazione sta ultimando la predisposizione della sala e dei badge nominativi.',
                    paragrafi: [
                        'Per partecipare non è necessaria alcuna ulteriore conferma: il Suo badge sarà disponibile al desk di accoglienza. Qualora invece non potesse essere presente, La preghiamo di comunicarcelo tramite il pulsante sottostante: la sala è al completo e il posto potrà essere assegnato a una persona in lista d\'attesa.',
                        { titolo: 'Incontri B2B', testo: 'Gli incontri B2B si svolgeranno dalle ore 10.00 alle ore 17.00, in parallelo ai lavori, e sono riservati ai partecipanti che hanno ricevuto l\'invito. Chi ha già prenotato è pregato di presentare il riepilogo della prenotazione, in formato cartaceo o digitale, al desk "Incontri B2B".' },
                        { testo: 'Qualora abbia ricevuto l\'invito e non abbia ancora prenotato, La invitiamo a provvedere quanto prima attraverso il collegamento indicato nell\'invito: le fasce orarie disponibili sono limitate e le prenotazioni si chiuderanno {{CHIUSURA_B2B}}.', se: 'B2B' }
                    ],
                    righe: [['Data', 'Venerdì 2 ottobre 2026, dalle ore 9.00 alle ore 17.30'], ['Sede', NAPOLI.dove], ['Arrivo', 'Prima delle ore 9.00'], ['Incontri B2B', 'Dalle ore 10.00 alle ore 17.00, su invito']],
                    pulsante: { testo: 'Modifica o annulla l\'iscrizione', url: COMPLETA },
                    nota: 'Il pulsante dà accesso alla Sua iscrizione ed è strettamente personale: La preghiamo di non inoltrare questa email.',
                    linkPersonale: false
                }
            },
            {
                id: 'sala-vigilia', serie: 'sala', giorniPrima: 1, soloIlGiorno: true, ora: 8,
                nome: 'Il giorno prima: orari, indirizzo e ultime indicazioni',
                mail: {
                    oggetto: 'IMPORTANTE - {{AZIENDA}} - Next Generation Business si terrà {{quando}}: orari e indicazioni per l\'arrivo',
                    anteprima: 'La sala sarà al completo: La invitiamo a presentarsi prima delle ore 9.00.',
                    titolo: 'Le ultime indicazioni',
                    sommario: 'Gentile ' + NOME + ', in vista della giornata di {{quando}} Le trasmettiamo le ultime indicazioni organizzative.',
                    paragrafi: [
                        { titolo: 'Orario di arrivo', testo: 'Poiché la sala sarà al completo, La invitiamo a presentarsi prima delle ore 9.00, orario di apertura della registrazione e del welcome coffee. In questo modo sarà possibile completare le operazioni di accredito e avviare puntualmente i lavori alle ore 9.30.' },
                        'Per la registrazione sarà sufficiente indicare il Suo nominativo al desk di accoglienza. Alle ore 13.30 è previsto un lunch buffet offerto dall\'organizzazione; i lavori si concluderanno alle ore 17.30. Chi ha prenotato gli incontri B2B è pregato di portare con sé il riepilogo della prenotazione. Il programma completo, con i nominativi dei relatori, è disponibile sul sito dell\'evento.',
                        { titolo: 'Crediti formativi', testo: 'Per i professionisti presenti in sala: il convegno è in corso di accreditamento presso l\'Ordine dei Dottori Commercialisti e degli Esperti Contabili di Napoli. Gli iscritti all\'Ordine sono pregati di segnalarlo al desk al momento della registrazione.' }
                    ],
                    righe: [['Arrivo', 'Prima delle ore 9.00'], ['Inizio dei lavori', 'Ore 9.30'], ['Pranzo', 'Lunch buffet offerto, ore 13.30'], ['Sede', NAPOLI.dove]],
                    pulsante: { testo: 'Visualizza la mappa', url: NAPOLI.mappa },
                    nota: '',
                    linkPersonale: true
                }
            },
            {
                id: 'sala-mattina', serie: 'sala', giorniPrima: 0, soloIlGiorno: true, mattina: true, ora: 7,
                nome: 'La mattina dell\'evento, alle 7: messaggio breve con la mappa',
                mail: {
                    oggetto: 'IMPORTANTE - {{AZIENDA}} - Next Generation Business si tiene oggi: registrazione dalle ore 9.00',
                    anteprima: 'Hotel Eurostars Excelsior, Via Partenope 48, Napoli. Inizio dei lavori alle ore 9.30.',
                    titolo: 'La attendiamo questa mattina',
                    sommario: 'Gentile ' + NOME + ', Le ricordiamo che Next Generation Business si terrà oggi presso l\'Hotel Eurostars Excelsior di Napoli.',
                    paragrafi: [
                        'Poiché la sala è al completo, La invitiamo a presentarsi prima delle ore 9.00, così da agevolare le operazioni di registrazione e consentire l\'avvio puntuale dei lavori alle ore 9.30.'
                    ],
                    righe: [['Arrivo', 'Prima delle ore 9.00'], ['Inizio dei lavori', 'Ore 9.30'], ['Sede', NAPOLI.dove]],
                    pulsante: { testo: 'Visualizza la mappa', url: NAPOLI.mappa },
                    nota: '',
                    linkPersonale: false
                }
            },

            /* -------------------------- ONLINE ------------------------- */
            {
                id: 'online-programma', serie: 'online', giorniPrima: 8, benvenuto: true, ora: 22,
                nome: 'Otto giorni prima: programma e modalità della diretta',
                mail: {
                    oggetto: 'IMPORTANTE - {{AZIENDA}} - {{MANCANO}} alla diretta di Next Generation Business: il programma dei lavori',
                    anteprima: 'Venerdì 2 ottobre 2026, in diretta dalle ore 9.30. Le credenziali di accesso Le saranno inviate con un messaggio separato.',
                    titolo: 'La diretta del 2 ottobre',
                    sommario: 'Gentile ' + NOME + ', {{mancano}} a Next Generation Business: venerdì 2 ottobre 2026 potrà seguire in diretta i lavori da Napoli.',
                    paragrafi: [
                        {
                            titolo: 'Modalità di partecipazione', elenco: [
                                'Il collegamento e le credenziali di accesso Le saranno inviati a questo indirizzo con un messaggio separato, prima dell\'evento',
                                'Per seguire la diretta è sufficiente un computer, un tablet o uno smartphone con una connessione stabile',
                                'La diretta riprende i lavori in sala; gli incontri B2B si svolgono esclusivamente in presenza e non sono trasmessi'
                            ]
                        },
                        'Qualora si sia iscritto quando la sala aveva già raggiunto la capienza massima, il Suo nominativo è inserito in lista d\'attesa: se si rendesse disponibile un posto, La contatteremo per offrirLe la possibilità di partecipare in presenza.'
                    ],
                    righe: [['Data', 'Venerdì 2 ottobre 2026, dalle ore 9.30 alle ore 17.30'], ['Modalità', 'Online, in diretta'], ['Accesso', 'Credenziali inviate con un messaggio separato']],
                    programma: PROGRAMMA_DIRETTA,
                    pulsante: { testo: 'Programma completo e relatori', url: NAPOLI.programmaPagina },
                    nota: '',
                    linkPersonale: true
                }
            },
            {
                id: 'online-sabato', serie: 'online', giorniPrima: 6, ora: 8,
                nome: 'Sabato 26: come seguire al meglio la diretta',
                mail: {
                    oggetto: 'IMPORTANTE - {{AZIENDA}} - {{MANCANO}} alla diretta di Next Generation Business: indicazioni per il collegamento',
                    anteprima: 'Alcune indicazioni per seguire al meglio la diretta del 2 ottobre e gli orari delle sessioni.',
                    titolo: 'Indicazioni per il collegamento',
                    sommario: 'Gentile ' + NOME + ', {{mancano}} alla diretta di Next Generation Business. Di seguito alcune indicazioni utili per seguire i lavori nelle migliori condizioni.',
                    paragrafi: [
                        {
                            titolo: 'Prima del 2 ottobre', elenco: [
                                'Il collegamento e le credenziali di accesso Le saranno inviati con un messaggio separato: qualora non lo trovasse nella posta in arrivo, La invitiamo a verificare la cartella della posta indesiderata (spam)',
                                'Le suggeriamo di verificare per tempo il funzionamento del dispositivo che utilizzerà, con l\'audio attivo',
                                'Qualora intenda seguire solo alcune sessioni, di seguito trova gli orari del programma'
                            ]
                        },
                        'La diretta avrà inizio alle ore 9.30 e si concluderà alle ore 17.30. Gli incontri B2B si svolgono esclusivamente in presenza e non sono trasmessi.'
                    ],
                    righe: [['Data', 'Venerdì 2 ottobre 2026, dalle ore 9.30 alle ore 17.30'], ['Modalità', 'Online, in diretta']],
                    programma: PROGRAMMA_DIRETTA,
                    pulsante: { testo: 'Programma completo e relatori', url: NAPOLI.programmaPagina },
                    nota: '',
                    linkPersonale: true
                }
            },
            {
                id: 'online-vigilia', serie: 'online', giorniPrima: 1, soloIlGiorno: true, ora: 8,
                nome: 'Il giorno prima: ritrovi il collegamento e gli accessi',
                mail: {
                    oggetto: 'IMPORTANTE - {{AZIENDA}} - Next Generation Business in diretta {{quando}}: le credenziali di accesso',
                    anteprima: 'I lavori avranno inizio alle ore 9.30. Collegamento e credenziali sono contenuti nel messaggio con gli accessi.',
                    titolo: 'Le credenziali di accesso',
                    sommario: 'Gentile ' + NOME + ', Le ricordiamo che {{quando}}, venerdì 2 ottobre, i lavori di Next Generation Business avranno inizio alle ore 9.30, in diretta da Napoli.',
                    paragrafi: [
                        'Il collegamento e le credenziali di accesso Le sono stati inviati con un messaggio separato. Le suggeriamo di recuperarlo sin d\'ora, così da potersi collegare senza difficoltà. Qualora non lo trovasse nella posta in arrivo, La invitiamo a verificare la cartella della posta indesiderata (spam).'
                    ],
                    righe: [['Data', 'Venerdì 2 ottobre 2026, dalle ore 9.30'], ['Modalità', 'Online, in diretta']],
                    pulsante: null,
                    nota: '',
                    linkPersonale: false
                }
            },
            {
                id: 'online-mattina', serie: 'online', giorniPrima: 0, soloIlGiorno: true, mattina: true, ora: 7,
                nome: 'La mattina dell\'evento, alle 7: messaggio breve, la diretta comincia',
                mail: {
                    oggetto: 'IMPORTANTE - {{AZIENDA}} - Next Generation Business: la diretta inizia alle ore 9.30',
                    anteprima: 'In diretta da Napoli. Collegamento e credenziali sono contenuti nel messaggio con gli accessi.',
                    titolo: 'Oggi in diretta',
                    sommario: 'Gentile ' + NOME + ', Le ricordiamo che i lavori di Next Generation Business avranno inizio oggi alle ore 9.30.',
                    paragrafi: [
                        'Per collegarsi utilizzi il collegamento e le credenziali contenuti nel messaggio con gli accessi. Qualora non lo trovasse nella posta in arrivo, La invitiamo a verificare la cartella della posta indesiderata (spam).'
                    ],
                    righe: [],
                    pulsante: null,
                    nota: '',
                    linkPersonale: false
                }
            }
        ]
    };

    /* LE PAROLE CHE DIPENDONO DAL GIORNO DELL'INVIO. Gemella di
       email-service/lib/promemoria-tempo.js, che le scrive davvero la
       mattina in cui la mail parte: questa copia serve all'anteprima, per
       far vedere la mail come arrivera' il giorno scelto. Una prova le
       confronta giorno per giorno: se ne cambia una, va cambiata l'altra. */
    const tempo = (function () {
        const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
        const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
        const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
        function utc(iso) { const m = ISO.exec(String(iso || '')); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN; }
        function giorniTra(da, a) { return Math.round((utc(a) - utc(da)) / 86400000); }
        function dataEstesa(iso) { const t = utc(iso); if (isNaN(t)) return ''; const d = new Date(t); return d.getUTCDate() + ' ' + MESI[d.getUTCMonth()]; }
        function giornoEsteso(iso) { const t = utc(iso); if (isNaN(t)) return ''; return GIORNI[new Date(t).getUTCDay()] + ' ' + dataEstesa(iso); }
        function maiuscola(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
        function frasi(oggi, evento, chiusuraB2B) {
            const n = ISO.test(evento) && ISO.test(oggi) ? giorniTra(oggi, evento) : NaN;
            const mancano = isNaN(n) ? 'mancano pochi giorni'
                : n >= 2 ? 'mancano ' + n + ' giorni'
                    : n === 1 ? 'manca un giorno'
                        : n === 0 ? 'ci siamo' : '';
            const quando = isNaN(n) ? '' : n === 0 ? 'oggi' : n === 1 ? 'domani' : giornoEsteso(evento);
            let chiusura = 'prima dell\'evento', b2bAperto = true;
            if (ISO.test(chiusuraB2B) && ISO.test(oggi)) {
                const k = giorniTra(oggi, chiusuraB2B);
                b2bAperto = k >= 0;
                chiusura = k === 0 ? 'oggi' : k === 1 ? 'domani' : 'il ' + dataEstesa(chiusuraB2B);
            }
            return { giorni: n, mancano: mancano, quando: quando, chiusura: chiusura, b2bAperto: b2bAperto };
        }
        function applica(s, f) {
            let out = String(s == null ? '' : s)
                .split('{{MANCANO}}').join(maiuscola(f.mancano)).split('{{mancano}}').join(f.mancano)
                .split('{{QUANDO}}').join(maiuscola(f.quando)).split('{{quando}}').join(f.quando)
                .split('{{CHIUSURA_B2B}}').join(f.chiusura);
            out = out.replace(/<!--SE_B2B-->([\s\S]*?)<!--\/SE_B2B-->/g, (m, dentro) => f.b2bAperto ? dentro : '')
                .replace(/\[\[SE_B2B\]\]([\s\S]*?)\[\[\/SE_B2B\]\]/g, (m, dentro) => f.b2bAperto ? dentro : '');
            return out.replace(/\n{3,}/g, '\n\n');
        }
        /* NOMI E AZIENDE SCRITTI TUTTI ALLO STESSO MODO.
           Persone: chi scrive tutto maiuscolo o tutto minuscolo ("MARIO ROSSI",
           "anna d'amico") diventa "Mario Rossi", "Anna D'Amico"; chi ha gia' messo
           le maiuscole al loro posto ("McArthur") resta com'e'.
           Aziende: stessa regola per le parole, le preposizioni in mezzo restano
           minuscole ("Studio di Consulenza"), e la forma societaria si scrive
           sempre nello stesso modo: S.r.l., S.r.l.s., S.p.A., S.a.s., S.n.c.,
           S.c.a r.l., S.s. */
        const FORME = [
            [/(^|[\s,])s\.?\s?c\.?\s?a\.?\s?r\.?\s?l\.?(?=$|[\s,])/gi, 'S.c.a r.l.'],
            [/(^|[\s,])s\.?\s?c\.?\s?r\.?\s?l\.?(?=$|[\s,])/gi, 'S.c.r.l.'],
            [/(^|[\s,])s\.?\s?r\.?\s?l\.?\s?s\.?(?=$|[\s,])/gi, 'S.r.l.s.'],
            [/(^|[\s,])s\.?\s?r\.?\s?l\.?(?=$|[\s,])/gi, 'S.r.l.'],
            [/(^|[\s,])s\.?\s?p\.?\s?a\.?(?=$|[\s,])/gi, 'S.p.A.'],
            [/(^|[\s,])s\.?\s?a\.?\s?s\.?(?=$|[\s,])/gi, 'S.a.s.'],
            [/(^|[\s,])s\.?\s?n\.?\s?c\.?(?=$|[\s,])/gi, 'S.n.c.']
        ];
        const PICCOLE = ['di', 'e', 'ed', 'del', 'della', 'delle', 'dei', 'degli', 'dello', 'da', 'in', 'per', 'con', 'a', 'al', 'alla', 'and', 'of', '&'];
        function maiuscoleAPosto(t) {
            return t.toLowerCase().replace(/(^|[\s'’\-./(])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
        }
        function formaNome(s) {
            const t = String(s || '').trim().replace(/\s+/g, ' ');
            if (!t || (t !== t.toUpperCase() && t !== t.toLowerCase())) return t;
            return maiuscoleAPosto(t);
        }
        function formaAzienda(s) {
            let t = String(s || '').trim().replace(/\s+/g, ' ');
            if (!t) return '';
            if (t === t.toUpperCase() || t === t.toLowerCase()) {
                t = maiuscoleAPosto(t).split(' ').map((w, i) => (i && PICCOLE.indexOf(w.toLowerCase()) >= 0) ? w.toLowerCase() : w).join(' ');
            }
            FORME.forEach(f => { t = t.replace(f[0], (m, a) => a + f[1]); });
            // "Alfa S.r.l" e "Alfa, S.r.l.": la virgola prima della forma societaria non serve
            return t.replace(/\s*,\s*(S\.(?:r\.l\.s?|p\.A|a\.s|n\.c|c\.a r\.l|c\.r\.l)\.?)$/, ' $1').replace(/\s+/g, ' ').trim();
        }
        /* {{AZIENDA}} nell'oggetto: il nome dell'azienda di chi riceve. Se
           l'azienda non c'e', sparisce con il suo separatore (" - ", ": ", ", "). */
        function conAzienda(s, azienda) {
            const a = formaAzienda(azienda);
            const x = String(s || '');
            if (a) return x.split('{{AZIENDA}}').join(a);
            return x.replace(/\s*[-–|:,]\s*\{\{AZIENDA\}\}/g, '').replace(/\{\{AZIENDA\}\}\s*[-–|:,]?\s*/g, '').trim();
        }
        return { frasi: frasi, applica: applica, giorniTra: giorniTra, giornoEsteso: giornoEsteso, dataEstesa: dataEstesa, formaNome: formaNome, formaAzienda: formaAzienda, conAzienda: conAzienda };
    })();

    /* "30 settembre" (come lo scrive la scheda dell'evento) -> "2026-09-30",
       con l'anno del giorno dell'evento. Vuoto se non si legge. */
    function giornoDaTesto(testo, giornoEvento) {
        const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
        const m = /(\d{1,2})\s+([a-zà-ù]+)/i.exec(String(testo || ''));
        const a = /^(\d{4})-/.exec(String(giornoEvento || ''));
        if (!m || !a) return '';
        const mese = MESI.indexOf(m[2].toLowerCase());
        if (mese < 0) return '';
        return a[1] + '-' + String(mese + 1).padStart(2, '0') + '-' + String(+m[1]).padStart(2, '0');
    }

    /* Le proposte di un evento, con la serie risolta. Copie, non gli
       originali: chi le modifica a video non deve cambiare il catalogo. */
    function proposteDi(idEvento) {
        const lista = PROPOSTE[String(idEvento || '')] || [];
        return lista.map(p => JSON.parse(JSON.stringify(p)));
    }
    function proposta(idEvento, idProposta) {
        return proposteDi(idEvento).find(p => p.id === idProposta) || null;
    }
    function serieDi(id) { return SERIE[id] || SERIE.sala; }

    /* Il giorno in cui spedire, in millisecondi, a mezzanotte nell'ora di
       chi programma: il giorno dell'evento meno `giorniPrima`. L'ora non si
       sceglie: il servizio passa alle 20. */
    function quandoProposto(prop, giornoEvento) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(giornoEvento || ''));
        if (!m || !prop) return 0;
        const d = new Date(+m[1], +m[2] - 1, +m[3] - (Number(prop.giorniPrima) || 0), 0, 0, 0, 0);
        return d.getTime();
    }

    /* IL TESTO MODIFICABILE. Nella finestra i paragrafi si correggono in
       un'area di testo sola, con tre regole facili: un paragrafo per
       blocco (separati da una riga vuota), una riga che comincia con "## "
       e' un sopratitolo, le righe che cominciano con "- " sono i punti di
       un elenco. Sono le stesse due funzioni, avanti e indietro, cosi'
       quello che si vede e' quello che parte. */
    const SEGNO_B2B = '[fino alla chiusura delle prenotazioni B2B]';
    function aTesto(paragrafi) {
        return (paragrafi || []).map(p => {
            if (typeof p === 'string') return p;
            const righe = [];
            // un paragrafo a scadenza si riconosce da questa prima riga, e la tiene
            if (p.se === 'B2B') righe.push(SEGNO_B2B);
            if (p.titolo) righe.push('## ' + p.titolo);
            if (p.testo) righe.push(p.testo);
            (p.elenco || []).forEach(v => righe.push('- ' + v));
            return righe.join('\n');
        }).join('\n\n');
    }
    function daTesto(testo) {
        return String(testo || '').replace(/\r\n?/g, '\n').split(/\n\s*\n/).map(blocco => {
            const p = { titolo: '', testo: '', elenco: [] };
            const libere = [];
            blocco.split('\n').forEach(r => {
                const s = r.trim();
                if (!s) return;
                if (s === SEGNO_B2B) { p.se = 'B2B'; return; }
                if (/^##\s+/.test(s) && !p.titolo) p.titolo = s.replace(/^##\s+/, '');
                else if (/^[-*]\s+/.test(s)) p.elenco.push(s.replace(/^[-*]\s+/, ''));
                else libere.push(s);
            });
            p.testo = libere.join(' ');
            return (p.titolo || p.testo || p.elenco.length) ? p : null;
        }).filter(Boolean);
    }

    /* Sostituisce i campi scritti da chi programma ({{LINK_DIRETTA}}) in ogni
       parte della mail. {{NOME}} e {{COMPLETA}} restano: li mette il
       servizio, uno per destinatario. */
    function conCampi(s, valori) {
        let out = String(s == null ? '' : s);
        Object.keys(CAMPI).forEach(k => {
            const v = String((valori || {})[k] || '').trim();
            out = out.split(CAMPI[k].segnaposto).join(v);
        });
        return out;
    }
    function campiMancanti(prop, valori) {
        return (prop && prop.campi || []).filter(k => CAMPI[k] && !String((valori || {})[k] || '').trim());
    }

    /* La mail pronta da mettere in coda: { oggetto, html, testo }, con i
       segnaposti del servizio ancora al loro posto. `mail` e' la parte
       `mail` della proposta, eventualmente corretta a video; `evento` e'
       la definizione dell'evento (titolo, quando, luogo...). `formato` e'
       il modulo newsletter-format (RV_NEWSLETTER nel browser). */
    function componi(mail, evento, valori, formato) {
        const NL = formato || (typeof RV_NEWSLETTER !== 'undefined' ? RV_NEWSLETTER : null);
        if (!NL || typeof NL.promemoriaEvento !== 'function') return null;
        const m = mail || {};
        /* Solo i campi di chi programma. I giorni che mancano, la chiusura
           delle prenotazioni B2B e i paragrafi a scadenza restano segnaposti:
           li scrive il servizio la mattina in cui la mail parte davvero. */
        const sost = (x, v) => conCampi(x, v);
        const par = (m.paragrafi || []).map(p => {
            if (typeof p === 'string') return sost(p, valori);
            return { titolo: sost(p.titolo, valori), testo: sost(p.testo, valori), elenco: (p.elenco || []).map(v => sost(v, valori)), se: p.se || '' };
        });
        return NL.promemoriaEvento({
            evento: evento || {},
            oggetto: sost(m.oggetto, valori),
            anteprima: sost(m.anteprima, valori),
            titolo: sost(m.titolo, valori),
            sommario: sost(m.sommario, valori),
            paragrafi: par,
            righe: (m.righe || []).map(r => [sost(r[0], valori), sost(r[1], valori)]),
            programma: m.programma || [],
            pulsante: m.pulsante ? { testo: sost(m.pulsante.testo, valori), url: sost(m.pulsante.url, valori) } : null,
            nota: sost(m.nota, valori),
            linkPersonale: m.linkPersonale !== false
        });
    }

    return {
        SERIE: SERIE, CAMPI: CAMPI, VERSIONE_TESTI: VERSIONE_TESTI, SEGNAPOSTO_NOME: NOME, SEGNAPOSTO_COMPLETA: COMPLETA, tempo: tempo, giornoDaTesto: giornoDaTesto,
        proposteDi: proposteDi, proposta: proposta, serieDi: serieDi, quandoProposto: quandoProposto,
        aTesto: aTesto, daTesto: daTesto, conCampi: conCampi, campiMancanti: campiMancanti, componi: componi
    };
});
