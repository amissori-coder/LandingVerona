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
   parole. Regole del testo: si da' del tu, come il modulo del sito;
   niente trattini lunghi (nelle mail dello studio non ci vanno);
   {{NOME}} e {{COMPLETA}} li sostituisce il servizio per
   destinatario; {{LINK_DIRETTA}} lo sostituisce l'area riservata
   con il collegamento scritto da chi programma (campo "linkDiretta").

   Ogni proposta: { id, nome, sezioni: 'sala'|'online', giorniPrima,
   ora, campi: ['linkDiretta'], mail: { oggetto, anteprima, titolo,
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

    /* --- Napoli, venerdi' 2 ottobre 2026 --- */
    const NAPOLI = {
        quando: 'Venerdì 2 ottobre 2026, dalle 9.00 alle 18.30',
        dove: 'Hotel Eurostars Excelsior, Via Partenope 48, Napoli',
        mappa: 'https://maps.google.com/?q=Eurostars+Hotel+Excelsior+Via+Partenope+48+Napoli',
        pagina: SITO + '/napoli_ottobre_2026/',
        programmaPdf: SITO + '/napoli_ottobre_2026/brochure-napoli-2026.pdf',
        tappe: [
            'Adeguati assetti',
            'Governance e controllo di gestione',
            'Modello 231 e Tax Control Framework',
            'Rating di Legalità',
            'ESG e sostenibilità',
            'Finanza agevolata',
            'Merito creditizio',
            'Bagnoli e America\'s Cup 2027'
        ],
        /* gli orari della diretta: quelli del programma pubblicato, che sono
           indicativi e lo si dice nella mail */
        programmaDiretta: [
            { ora: '9.30', nome: 'Apertura dei lavori e keynote introduttiva' },
            { ora: '10.00', nome: 'Adeguati assetti' },
            { ora: '10.40', nome: 'Modello 231 e Tax Control Framework' },
            { ora: '11.40', nome: 'Rating di Legalità' },
            { ora: '12.10', nome: 'Sostenibilità e fattori ESG' },
            { ora: '13.00', nome: 'Finanza agevolata e strumenti di finanza innovativa' },
            { ora: '14.30', nome: 'Tavola rotonda: come banche e imprese valutano il merito creditizio' },
            { ora: '15.40', nome: 'Invitalia: Bagnoli e America\'s Cup 2027' }
        ]
    };
    const PERCORSO = 'Non sarà il solito convegno. Per un\'intera giornata prenderemo idealmente l\'imprenditore per mano e lo accompagneremo '
        + 'lungo un percorso in otto tappe: dagli adeguati assetti al Modello 231 e al Tax Control Framework, dal Rating di Legalità '
        + 'all\'ESG, fino alla finanza agevolata, al merito creditizio e alle grandi opportunità del territorio, Bagnoli e '
        + 'l\'America\'s Cup 2027. Ogni intervento completa il precedente, e tutto è pensato per essere applicato in azienda da lunedì.';
    const RIGHE_SALA = [['Quando', NAPOLI.quando], ['Dove', NAPOLI.dove], ['Registrazione', 'Dalle 9.00, con il welcome coffee']];
    const NOTA_DIRETTA = 'Il collegamento è riservato agli iscritti: ti chiediamo di non condividerlo pubblicamente.';

    const PROPOSTE = {
        'napoli-2026-10-02': [
            /* ------------------------- IN SALA ------------------------- */
            {
                id: 's1', serie: 'sala', giorniPrima: 15, ora: '10:00',
                nome: 'Due settimane prima: il percorso della giornata',
                mail: {
                    oggetto: 'Mancano due settimane a Napoli: ecco il percorso della giornata',
                    anteprima: 'Venerdì 2 ottobre all\'Hotel Eurostars Excelsior: otto tappe per costruire l\'impresa del futuro.',
                    titolo: 'Ci vediamo fra due settimane',
                    sommario: 'Ciao ' + NOME + ', il tuo posto in sala per Next Generation Business Napoli è riservato: venerdì 2 ottobre ci vediamo all\'Hotel Eurostars Excelsior. Ecco cosa ti aspetta.',
                    paragrafi: [
                        PERCORSO,
                        { titolo: 'Le otto tappe', elenco: NAPOLI.tappe },
                        'In chiusura, dalle 16.30, la sessione di incontri B2B: due ore di confronti riservati fra imprese, professionisti, banche e sponsor, per trasformare le idee della giornata in relazioni concrete.'
                    ],
                    righe: [['Quando', NAPOLI.quando], ['Dove', NAPOLI.dove], ['Partecipazione', 'Gratuita, con il posto riservato in sala']],
                    pulsante: { testo: 'Scarica il programma', url: NAPOLI.programmaPdf },
                    nota: 'Il programma della giornata è sul sito e lo aggiorniamo man mano che arrivano le conferme dei relatori.',
                    linkPersonale: true
                }
            },
            {
                id: 's2', serie: 'sala', giorniPrima: 8, ora: '10:00',
                nome: 'Una settimana prima: come arrivare e orari',
                mail: {
                    oggetto: 'Una settimana a Napoli: come arrivare, orari e cosa aspettarti',
                    anteprima: 'Registrazione dalle 9.00 in Via Partenope 48. Tutto quello che serve sapere prima di venerdì 2 ottobre.',
                    titolo: 'Manca una settimana',
                    sommario: 'Ciao ' + NOME + ', venerdì prossimo ci vediamo a Napoli. Qui trovi le informazioni pratiche per arrivare con calma e goderti la giornata.',
                    paragrafi: [
                        { titolo: 'Dove e quando', testo: 'L\'Hotel Eurostars Excelsior è in Via Partenope 48, sul lungomare, a due passi da Castel dell\'Ovo. La registrazione apre alle 9.00 con il welcome coffee, i lavori cominciano alle 9.30 e la giornata si chiude alle 18.30 con gli incontri B2B.' },
                        { titolo: 'Come arrivare', testo: 'In auto: l\'hotel non ha un parcheggio riservato ai partecipanti, ma nella zona di Santa Lucia e Chiaia ci sono diversi garage a pagamento. In treno: da Napoli Centrale bastano circa quindici minuti di taxi. In aereo: da Capodichino l\'autobus Alibus arriva fino al Molo Beverello, a un quarto d\'ora a piedi dall\'hotel. Se hai bisogno di indicazioni, rispondi a questa mail.' },
                        {
                            titolo: 'Cosa aspettarti', elenco: [
                                'Welcome coffee alle 9.00, coffee break a metà mattina e nel pomeriggio',
                                'Lunch buffet alle 13.30, compreso nella partecipazione',
                                'Otto interventi in sequenza e una tavola rotonda con banche e imprese',
                                'Dalle 16.30 gli incontri B2B, per chi si è prenotato'
                            ]
                        },
                        'Il convegno è in corso di accreditamento presso l\'Ordine dei Dottori Commercialisti e degli Esperti Contabili di Napoli per i crediti formativi: se sei iscritto all\'Ordine, segnalalo al desk quando ti registri.'
                    ],
                    righe: RIGHE_SALA,
                    pulsante: { testo: 'Apri la mappa', url: NAPOLI.mappa },
                    nota: 'Al desk basterà il tuo nome: il badge lo troverai già pronto.',
                    linkPersonale: true
                }
            },
            {
                id: 's3', serie: 'sala', giorniPrima: 3, ora: '10:00',
                nome: 'Tre giorni prima: il posto ti aspetta (o liberalo)',
                mail: {
                    oggetto: 'Tre giorni a Napoli: il tuo posto ti aspetta',
                    anteprima: 'Venerdì 2 ottobre, ore 9.00. Se non puoi più esserci, dillo con un clic: il posto andrà a chi lo sta aspettando.',
                    titolo: 'Tre giorni e ci siamo',
                    sommario: 'Ciao ' + NOME + ', venerdì è il grande giorno. Stiamo preparando la sala e i badge, e vorremmo essere sicuri di averti con noi.',
                    paragrafi: [
                        'Se i tuoi programmi sono cambiati e non potrai venire, non serve scriverci: basta un clic dal tuo collegamento personale, in fondo a questa mail. È un gesto che conta, perché le richieste sono più dei posti e ogni sedia libera andrà a qualcuno che la sta aspettando.',
                        { titolo: 'Gli incontri B2B del pomeriggio', testo: 'Dalle 16.30 imprese, professionisti, banche e sponsor si incontrano ai tavoli tematici: assetti, governance, 231 e Tax Control Framework, Rating di Legalità, ESG, finanza agevolata, merito creditizio, Bagnoli e America\'s Cup. Se ti sei prenotato, porta il foglio della prenotazione (stampato o sul telefono) e presentalo al desk "Incontri B2B". Se non l\'hai ancora fatto e ti interessa, rispondi a questa mail.' },
                        {
                            titolo: 'Da portare con te', elenco: [
                                'I biglietti da visita: al desk basta il tuo nome, ma agli incontri B2B servono davvero',
                                'Le domande che vuoi fare ai relatori: c\'è spazio per il confronto',
                                'Se sei iscritto all\'Ordine dei Commercialisti di Napoli, segnalalo al desk per i crediti formativi'
                            ]
                        }
                    ],
                    righe: RIGHE_SALA,
                    pulsante: { testo: 'Rivedi il programma', url: NAPOLI.pagina + '#programma' },
                    nota: '',
                    linkPersonale: true
                }
            },
            {
                id: 's4', serie: 'sala', giorniPrima: 1, ora: '17:30',
                nome: 'La sera prima: a domani',
                mail: {
                    oggetto: 'A domani! Ci vediamo alle 9.00 all\'Excelsior',
                    anteprima: 'Via Partenope 48, Napoli. Registrazione dalle 9.00, si comincia alle 9.30.',
                    titolo: 'A domani',
                    sommario: 'Ciao ' + NOME + ', è tutto pronto: domani mattina ti aspettiamo a Napoli per Next Generation Business. Qui sotto i tre dati che servono.',
                    paragrafi: [
                        'Arriva con calma: la registrazione apre alle 9.00 con il welcome coffee e i lavori iniziano alle 9.30. Al desk basta il tuo nome, il badge è già pronto. Se hai prenotato gli incontri B2B, ricordati il foglio della prenotazione.',
                        'Porta con te curiosità e domande: il percorso della giornata è pensato per essere applicato in azienda da lunedì, non per restare sulla carta.'
                    ],
                    righe: [['Quando', 'Domani, venerdì 2 ottobre, dalle 9.00 alle 18.30'], ['Dove', NAPOLI.dove], ['Registrazione', 'Dalle 9.00, con il welcome coffee']],
                    pulsante: { testo: 'Apri la mappa', url: NAPOLI.mappa },
                    nota: 'Per qualunque cosa, rispondi a questa mail.',
                    linkPersonale: true
                }
            },
            {
                id: 's5', serie: 'sala', giorniPrima: 0, ora: '07:30',
                nome: 'La mattina stessa: oggi si comincia',
                mail: {
                    oggetto: 'Buongiorno! Oggi si comincia: Via Partenope 48, dalle 9.00',
                    anteprima: 'Hotel Eurostars Excelsior, Napoli. Registrazione e welcome coffee dalle 9.00.',
                    titolo: 'Oggi si comincia',
                    sommario: 'Buongiorno ' + NOME + ', oggi è il giorno di Next Generation Business Napoli. Ti aspettiamo dalle 9.00 all\'Hotel Eurostars Excelsior.',
                    paragrafi: [
                        'Questa mail è fatta per stare nel telefono: qui sotto trovi indirizzo e orari, e con il pulsante apri subito la mappa. Al desk basta il tuo nome. Buona giornata, e a fra poco.'
                    ],
                    righe: [['Quando', 'Oggi, dalle 9.00 alle 18.30'], ['Dove', NAPOLI.dove], ['Registrazione', 'Dalle 9.00, con il welcome coffee'], ['Inizio lavori', '9.30']],
                    pulsante: { testo: 'Apri la mappa', url: NAPOLI.mappa },
                    nota: '',
                    linkPersonale: false
                }
            },

            /* -------------------------- ONLINE ------------------------- */
            {
                id: 'o1', serie: 'online', giorniPrima: 15, ora: '10:30',
                nome: 'Due settimane prima: il percorso che seguirai online',
                mail: {
                    oggetto: 'Mancano due settimane: il percorso che seguirai online',
                    anteprima: 'Venerdì 2 ottobre, in diretta da Napoli: otto tappe per costruire l\'impresa del futuro.',
                    titolo: 'Ci vediamo online fra due settimane',
                    sommario: 'Ciao ' + NOME + ', la tua partecipazione online a Next Generation Business Napoli è registrata: venerdì 2 ottobre seguirai i lavori in diretta. Ecco cosa ti aspetta.',
                    paragrafi: [
                        PERCORSO,
                        { titolo: 'Le otto tappe', elenco: NAPOLI.tappe },
                        'Il collegamento per seguire la diretta arriverà a questo stesso indirizzo pochi giorni prima dell\'evento, insieme alle istruzioni: da adesso a quel momento non devi fare nulla.'
                    ],
                    righe: [['Quando', 'Venerdì 2 ottobre 2026, dalle 9.30'], ['Partecipazione', 'Online, in diretta'], ['Collegamento', 'Ti arriverà per email pochi giorni prima']],
                    pulsante: { testo: 'Scarica il programma', url: NAPOLI.programmaPdf },
                    nota: 'Il programma della giornata è sul sito e lo aggiorniamo man mano che arrivano le conferme dei relatori.',
                    linkPersonale: true
                }
            },
            {
                id: 'o2', serie: 'online', giorniPrima: 8, ora: '10:30',
                nome: 'Una settimana prima: come funzionerà la diretta',
                mail: {
                    oggetto: 'Una settimana all\'evento: come funzionerà la diretta',
                    anteprima: 'Cosa ti serve per seguire Next Generation Business Napoli online, e a che ora collegarti.',
                    titolo: 'Manca una settimana',
                    sommario: 'Ciao ' + NOME + ', venerdì prossimo Next Generation Business va in scena a Napoli, e tu lo seguirai in diretta. Ecco come funzionerà.',
                    paragrafi: [
                        {
                            titolo: 'Cosa ti serve', elenco: [
                                'Un computer, un tablet o un telefono con una buona connessione',
                                'Cuffie o un ambiente tranquillo: la giornata è lunga e vale la pena seguirla con attenzione',
                                'Il collegamento, che ti manderemo per email nei giorni prima dell\'evento'
                            ]
                        },
                        { titolo: 'A che ora collegarti', testo: 'I lavori cominciano alle 9.30: collegati qualche minuto prima, così hai il tempo di sistemare audio e video. La diretta segue tutta la giornata di lavori, dalla mattina alla tavola rotonda del pomeriggio. Gli incontri B2B delle 16.30 si svolgono in sala e non vengono trasmessi.' },
                        'Se nel frattempo preferisci venire di persona, rispondi a questa mail: se in sala si è liberato un posto, te lo diamo volentieri.'
                    ],
                    righe: [['Quando', 'Venerdì 2 ottobre 2026, dalle 9.30'], ['Partecipazione', 'Online, in diretta'], ['Collegamento', 'Arriva per email nei giorni prima']],
                    pulsante: { testo: 'Scarica il programma', url: NAPOLI.programmaPdf },
                    nota: '',
                    linkPersonale: true
                }
            },
            {
                id: 'o3', serie: 'online', giorniPrima: 2, ora: '10:00', campi: ['linkDiretta'],
                nome: 'Due giorni prima: il collegamento alla diretta',
                mail: {
                    oggetto: 'Il tuo collegamento per seguire Next Generation Business Napoli',
                    anteprima: 'Venerdì 2 ottobre dalle 9.30: ecco il collegamento e le istruzioni per la diretta.',
                    titolo: 'Ecco il collegamento',
                    sommario: 'Ciao ' + NOME + ', come promesso ecco il collegamento per seguire venerdì 2 ottobre la diretta di Next Generation Business da Napoli. Conservalo: ti servirà la mattina dell\'evento.',
                    paragrafi: [
                        'Venerdì apri il pulsante qui sotto qualche minuto prima delle 9.30. Il collegamento è lo stesso per tutta la giornata: se la connessione cade, basta riaprirlo.',
                        { titolo: 'Se il pulsante non funziona', testo: 'Copia e incolla questo indirizzo nel browser: ' + LINK_DIRETTA },
                        'Gli orari sono indicativi e possono scorrere di qualche minuto. Gli incontri B2B delle 16.30 si svolgono in sala e non fanno parte della diretta.'
                    ],
                    righe: [['Quando', 'Venerdì 2 ottobre 2026, dalle 9.30'], ['Partecipazione', 'Online, in diretta']],
                    programma: NAPOLI.programmaDiretta,
                    pulsante: { testo: 'Apri la diretta', url: LINK_DIRETTA },
                    nota: NOTA_DIRETTA,
                    linkPersonale: true
                }
            },
            {
                id: 'o4', serie: 'online', giorniPrima: 1, ora: '17:30', campi: ['linkDiretta'],
                nome: 'La sera prima: a domani, con il collegamento',
                mail: {
                    oggetto: 'A domani! Tieni a portata di mano il collegamento',
                    anteprima: 'Domani dalle 9.30 la diretta di Next Generation Business da Napoli. Il collegamento è qui.',
                    titolo: 'A domani',
                    sommario: 'Ciao ' + NOME + ', è tutto pronto: domani mattina alle 9.30 comincia la diretta di Next Generation Business da Napoli. Ti rimandiamo il collegamento, così domani non devi cercarlo.',
                    paragrafi: [
                        'Collegati qualche minuto prima delle 9.30 per sistemare audio e video. Se il pulsante non funziona, copia questo indirizzo nel browser: ' + LINK_DIRETTA,
                        'Porta con te curiosità e domande: il percorso della giornata è pensato per essere applicato in azienda da lunedì, non per restare sulla carta.'
                    ],
                    righe: [['Quando', 'Domani, venerdì 2 ottobre, dalle 9.30'], ['Partecipazione', 'Online, in diretta']],
                    pulsante: { testo: 'Apri la diretta', url: LINK_DIRETTA },
                    nota: NOTA_DIRETTA,
                    linkPersonale: false
                }
            },
            {
                id: 'o5', serie: 'online', giorniPrima: 0, ora: '08:00', campi: ['linkDiretta'],
                nome: 'La mattina stessa: oggi si comincia, con il collegamento',
                mail: {
                    oggetto: 'Buongiorno! Oggi si comincia: ecco il collegamento alla diretta',
                    anteprima: 'Dalle 9.30 in diretta da Napoli. Apri il collegamento qualche minuto prima.',
                    titolo: 'Oggi si comincia',
                    sommario: 'Buongiorno ' + NOME + ', oggi è il giorno di Next Generation Business Napoli. La diretta comincia alle 9.30: il collegamento è qui sotto.',
                    paragrafi: [
                        'Apri il pulsante qualche minuto prima delle 9.30. Il collegamento vale per tutta la giornata: se cade, riaprilo. Se il pulsante non funziona, copia questo indirizzo nel browser: ' + LINK_DIRETTA,
                        'Buona giornata, e a fra poco.'
                    ],
                    righe: [['Quando', 'Oggi, dalle 9.30'], ['Partecipazione', 'Online, in diretta']],
                    pulsante: { testo: 'Apri la diretta', url: LINK_DIRETTA },
                    nota: NOTA_DIRETTA,
                    linkPersonale: false
                }
            }
        ]
    };

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

    /* Quando spedire, in millisecondi, nell'ora locale di chi programma:
       il giorno dell'evento meno `giorniPrima`, all'ora indicata. */
    function quandoProposto(prop, giornoEvento) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(giornoEvento || ''));
        if (!m || !prop) return 0;
        const hm = /^(\d{1,2}):(\d{2})$/.exec(String(prop.ora || '10:00')) || [0, 10, 0];
        const d = new Date(+m[1], +m[2] - 1, +m[3] - (Number(prop.giorniPrima) || 0), +hm[1], +hm[2], 0, 0);
        return d.getTime();
    }

    /* IL TESTO MODIFICABILE. Nella finestra i paragrafi si correggono in
       un'area di testo sola, con tre regole facili: un paragrafo per
       blocco (separati da una riga vuota), una riga che comincia con "## "
       e' un sopratitolo, le righe che cominciano con "- " sono i punti di
       un elenco. Sono le stesse due funzioni, avanti e indietro, cosi'
       quello che si vede e' quello che parte. */
    function aTesto(paragrafi) {
        return (paragrafi || []).map(p => {
            if (typeof p === 'string') return p;
            const righe = [];
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
        const par = (m.paragrafi || []).map(p => {
            if (typeof p === 'string') return conCampi(p, valori);
            return { titolo: conCampi(p.titolo, valori), testo: conCampi(p.testo, valori), elenco: (p.elenco || []).map(v => conCampi(v, valori)) };
        });
        return NL.promemoriaEvento({
            evento: evento || {},
            oggetto: conCampi(m.oggetto, valori),
            anteprima: conCampi(m.anteprima, valori),
            titolo: conCampi(m.titolo, valori),
            sommario: conCampi(m.sommario, valori),
            paragrafi: par,
            righe: (m.righe || []).map(r => [conCampi(r[0], valori), conCampi(r[1], valori)]),
            programma: m.programma || [],
            pulsante: m.pulsante ? { testo: conCampi(m.pulsante.testo, valori), url: conCampi(m.pulsante.url, valori) } : null,
            nota: conCampi(m.nota, valori),
            linkPersonale: m.linkPersonale !== false
        });
    }

    return {
        SERIE: SERIE, CAMPI: CAMPI, SEGNAPOSTO_NOME: NOME, SEGNAPOSTO_COMPLETA: COMPLETA,
        proposteDi: proposteDi, proposta: proposta, serieDi: serieDi, quandoProposto: quandoProposto,
        aTesto: aTesto, daTesto: daTesto, conCampi: conCampi, campiMancanti: campiMancanti, componi: componi
    };
});
