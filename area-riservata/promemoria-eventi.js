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

   Il servizio spedisce UNA VOLTA AL GIORNO, alle 8 del mattino: di una
   proposta si sceglie il giorno, non l'ora. La vigilia si scrive la
   mattina della vigilia, il giorno stesso alle 8, un'ora prima della
   registrazione.

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
            { ora: '10.00', nome: 'Il futuro della Piccola Industria italiana' },
            { ora: '10.30', nome: 'Adeguati assetti e continuità aziendale' },
            { ora: '11.10', nome: 'Modello 231 e Tax Control Framework' },
            { ora: '11.50', nome: 'Sostenibilità e fattori ESG' },
            { ora: '12.40', nome: 'Finanza agevolata' },
            { ora: '13.30', nome: 'Lunch buffet e networking', sala: true },
            { ora: '14.30', nome: 'Rating di Legalità' },
            { ora: '15.00', nome: 'Banche' },
            { ora: '15.50', nome: 'Invitalia e MCC · Bagnoli e America\'s Cup 2027' },
            { ora: '16.40', nome: 'Sessione Questions and Answers' },
            { ora: '17.10', nome: 'Conclusioni e chiusura dei lavori' }
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
    const PROPOSTE = {
        'napoli-2026-10-02': [
            /* ------------------------- IN SALA ------------------------- */
            {
                id: 'sala-programma', serie: 'sala', giorniPrima: 7, benvenuto: true,
                nome: 'Una settimana prima: programma e informazioni essenziali',
                mail: {
                    oggetto: '{{MANCANO}} a Next Generation Business: il programma della giornata',
                    anteprima: 'Venerdì 2 ottobre all\'Hotel Eurostars Excelsior di Napoli. Registrazione dalle 9.00, lavori fino alle 17.30.',
                    titolo: 'Venerdì 2 ottobre, a Napoli',
                    sommario: 'Gentile ' + NOME + ', {{mancano}} al Suo appuntamento con Next Generation Business: La aspettiamo in sala venerdì 2 ottobre all\'Hotel Eurostars Excelsior di Napoli.',
                    paragrafi: [
                        'La giornata si apre alle 9.00 con la registrazione e il welcome coffee e si chiude alle 17.30; alle 13.30 è offerto un lunch buffet. Qui sotto trova la scaletta; il programma completo, con i nomi dei relatori, è sul sito.',
                        { titolo: 'Incontri B2B', testo: 'Se ha ricevuto l\'invito agli incontri B2B e non ha ancora prenotato i Suoi appuntamenti, Le consigliamo di farlo al più presto dal collegamento contenuto nell\'invito: gli orari disponibili sono limitati e le prenotazioni si chiudono {{CHIUSURA_B2B}}.', se: 'B2B' }
                    ],
                    righe: [['Quando', 'Venerdì 2 ottobre 2026, dalle 9.00 alle 17.30'], ['Dove', NAPOLI.dove], ['Registrazione', 'Dalle 9.00, con il welcome coffee'], ['Pranzo', 'Lunch buffet offerto, alle 13.30']],
                    programma: PROGRAMMA_SALA,
                    pulsante: { testo: 'Il programma con i relatori', url: NAPOLI.programmaPagina },
                    nota: '',
                    linkPersonale: true
                }
            },
            {
                id: 'sala-presenza', serie: 'sala', giorniPrima: 3,
                nome: 'Tre giorni prima: conferma della presenza e incontri B2B',
                mail: {
                    oggetto: '{{MANCANO}}: la Sua presenza in sala e gli incontri B2B',
                    anteprima: 'Se non potrà esserci, ce lo dica: il posto andrà a chi è in lista d\'attesa.',
                    titolo: 'La Sua presenza in sala',
                    sommario: 'Gentile ' + NOME + ', {{mancano}} a venerdì 2 ottobre: stiamo preparando la sala e i badge e contiamo sulla Sua presenza.',
                    paragrafi: [
                        'Se verrà, non deve fare nulla: il badge La aspetta al desk. Se invece non potrà esserci, La preghiamo di dircelo dal pulsante qui sotto: la sala è al completo e il Suo posto andrà a una delle persone in lista d\'attesa.',
                        { titolo: 'Gli incontri B2B', testo: 'Si svolgono dalle 10.00 alle 17.00, in parallelo ai lavori, e sono riservati a chi ha ricevuto l\'invito. Se ha già prenotato, porti il foglio della prenotazione, stampato o sul telefono, e lo presenti al desk "Incontri B2B".' },
                        { testo: 'Se ha ricevuto l\'invito e non ha ancora prenotato, lo faccia al più presto dal collegamento contenuto nell\'invito: gli orari disponibili sono limitati e le prenotazioni si chiudono {{CHIUSURA_B2B}}.', se: 'B2B' }
                    ],
                    righe: [['Quando', 'Venerdì 2 ottobre 2026, dalle 9.00 alle 17.30'], ['Dove', NAPOLI.dove], ['Incontri B2B', 'Dalle 10.00 alle 17.00, su invito']],
                    pulsante: { testo: 'Modifica o annulla l\'iscrizione', url: COMPLETA },
                    nota: 'Il pulsante porta alla Sua iscrizione e vale solo per Lei: Le chiediamo di non inoltrare questa email.',
                    linkPersonale: false
                }
            },
            {
                id: 'sala-vigilia', serie: 'sala', giorniPrima: 1, soloIlGiorno: true,
                nome: 'Il giorno prima: orari, indirizzo e ultime indicazioni',
                mail: {
                    oggetto: '{{QUANDO}} a Napoli: arrivo alle 9.00, orari e indirizzo',
                    anteprima: 'La sala sarà al completo: Le chiediamo di arrivare alle 9.00, all\'apertura della registrazione.',
                    titolo: 'Tutto pronto per {{quando}}',
                    sommario: 'Gentile ' + NOME + ', ecco le ultime indicazioni per la giornata di venerdì 2 ottobre.',
                    paragrafi: [
                        { titolo: 'Arrivi in anticipo', testo: 'La sala sarà al completo. Per rispettare gli orari della giornata Le chiediamo di arrivare alle 9.00, quando apre la registrazione con il welcome coffee: così ciascuno ha il tempo di ritirare il badge e prendere posto, e i lavori cominciano puntuali alle 9.30.' },
                        'Al desk basta il Suo nome: il badge è già pronto. Alle 13.30 è offerto a tutti un lunch buffet; i lavori si chiudono alle 17.30. Se ha prenotato gli incontri B2B, ricordi il foglio della prenotazione con i Suoi orari. Il programma completo, con i nomi dei relatori, è sul sito dell\'evento.',
                        'Per i professionisti presenti in sala: il convegno è in corso di accreditamento presso l\'Ordine dei Dottori Commercialisti e degli Esperti Contabili di Napoli. Chi è iscritto all\'Ordine lo segnali al desk al momento della registrazione.'
                    ],
                    righe: [['Arrivo', 'Alle 9.00, all\'apertura della registrazione'], ['Inizio dei lavori', '9.30'], ['Pranzo', 'Lunch buffet offerto, alle 13.30'], ['Dove', NAPOLI.dove]],
                    pulsante: { testo: 'Apri la mappa', url: NAPOLI.mappa },
                    nota: '',
                    linkPersonale: true
                }
            },
            {
                id: 'sala-mattina', serie: 'sala', giorniPrima: 0, soloIlGiorno: true,
                nome: 'La mattina dell\'evento: messaggio breve con la mappa',
                mail: {
                    oggetto: 'Oggi a Napoli: registrazione dalle 9.00 in Via Partenope 48',
                    anteprima: 'Hotel Eurostars Excelsior. Apertura dei lavori alle 9.30.',
                    titolo: 'La aspettiamo stamattina',
                    sommario: 'Gentile ' + NOME + ', oggi è il giorno di Next Generation Business: La aspettiamo all\'Hotel Eurostars Excelsior dalle 9.00.',
                    paragrafi: [
                        'La sala è al completo: arrivi alle 9.00, così la registrazione è veloce e i lavori cominciano puntuali alle 9.30.'
                    ],
                    righe: [['Arrivo', 'Alle 9.00'], ['Inizio dei lavori', '9.30'], ['Dove', NAPOLI.dove]],
                    pulsante: { testo: 'Apri la mappa', url: NAPOLI.mappa },
                    nota: '',
                    linkPersonale: false
                }
            },

            /* -------------------------- ONLINE ------------------------- */
            {
                id: 'online-programma', serie: 'online', giorniPrima: 7, benvenuto: true,
                nome: 'Una settimana prima: programma e modalità della diretta',
                mail: {
                    oggetto: '{{MANCANO}} alla diretta di Next Generation Business: il programma',
                    anteprima: 'I lavori in diretta dalle 9.30. Collegamento e accessi arrivano in un messaggio a parte.',
                    titolo: 'La diretta del 2 ottobre',
                    sommario: 'Gentile ' + NOME + ', {{mancano}} alla diretta di Next Generation Business: venerdì 2 ottobre potrà seguire in diretta i lavori da Napoli.',
                    paragrafi: [
                        {
                            titolo: 'Come funziona la diretta', elenco: [
                                'Il collegamento e le credenziali di accesso arrivano a questo indirizzo in un messaggio a parte, prima dell\'evento',
                                'Basta un computer, un tablet o uno smartphone con una buona connessione',
                                'La diretta segue i lavori in sala; gli incontri B2B si svolgono in presenza e non vengono trasmessi'
                            ]
                        },
                        'Se si è iscritto quando la sala era già al completo, è in lista d\'attesa: se si libera un posto Le scriviamo, e decide Lei se venire di persona.'
                    ],
                    righe: [['Quando', 'Venerdì 2 ottobre 2026, dalle 9.30 alle 17.30'], ['Partecipazione', 'Online, in diretta'], ['Collegamento e accessi', 'In un messaggio a parte, prima dell\'evento']],
                    programma: PROGRAMMA_DIRETTA,
                    pulsante: { testo: 'Il programma con i relatori', url: NAPOLI.programmaPagina },
                    nota: '',
                    linkPersonale: true
                }
            },
            {
                id: 'online-vigilia', serie: 'online', giorniPrima: 1, soloIlGiorno: true,
                nome: 'Il giorno prima: ritrovi il collegamento e gli accessi',
                mail: {
                    oggetto: '{{QUANDO}} in diretta: tenga a portata di mano gli accessi',
                    anteprima: 'I lavori cominciano alle 9.30. Collegamento e credenziali sono nella mail con gli accessi.',
                    titolo: 'Gli accessi, a portata di mano',
                    sommario: 'Gentile ' + NOME + ', Le ricordiamo che venerdì 2 ottobre i lavori di Next Generation Business cominciano alle 9.30, in diretta da Napoli.',
                    paragrafi: [
                        'Il collegamento e le credenziali di accesso Le sono stati inviati per email in un messaggio a parte: Le conviene ritrovarlo adesso, così venerdì mattina è tutto pronto. Se non lo trova, controlli anche la posta indesiderata; se non c\'è, risponda a questa email e glielo rimandiamo.'
                    ],
                    righe: [['Quando', 'Venerdì 2 ottobre, dalle 9.30'], ['Partecipazione', 'Online, in diretta']],
                    pulsante: null,
                    nota: '',
                    linkPersonale: false
                }
            },
            {
                id: 'online-mattina', serie: 'online', giorniPrima: 0, soloIlGiorno: true,
                nome: 'La mattina dell\'evento: messaggio breve, la diretta comincia',
                mail: {
                    oggetto: 'La diretta comincia alle 9.30',
                    anteprima: 'Next Generation Business, in diretta da Napoli: collegamento e accessi sono nella mail che Le abbiamo inviato.',
                    titolo: 'Oggi in diretta',
                    sommario: 'Gentile ' + NOME + ', i lavori di Next Generation Business cominciano alle 9.30.',
                    paragrafi: [
                        'Per collegarsi usi il collegamento e le credenziali che trova nella mail con gli accessi. Se non la trova, risponda a questa email.'
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
        return { frasi: frasi, applica: applica, giorniTra: giorniTra, giornoEsteso: giornoEsteso, dataEstesa: dataEstesa };
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
       sceglie: il servizio passa alle 8 del mattino. */
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
        SERIE: SERIE, CAMPI: CAMPI, SEGNAPOSTO_NOME: NOME, SEGNAPOSTO_COMPLETA: COMPLETA, tempo: tempo, giornoDaTesto: giornoDaTesto,
        proposteDi: proposteDi, proposta: proposta, serieDi: serieDi, quandoProposto: quandoProposto,
        aTesto: aTesto, daTesto: daTesto, conCampi: conCampi, campiMancanti: campiMancanti, componi: componi
    };
});
