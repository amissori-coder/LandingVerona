/* ============================================================
   AREA BANDI - le schede
   ------------------------------------------------------------
   Questo file e' l'elenco dei bandi mostrati in /bandi/. La pagina
   (bandi.js) non contiene nessun bando: legge tutto da qui, e da qui
   ricava anche le voci dei filtri (regioni, tipologie, finalita') e
   l'elenco "Bando di interesse" del modulo.

   PER AGGIUNGERE UN BANDO basta aggiungere un blocco in fondo a
   BANDI, copiandone uno esistente:

     id          identificativo unico: minuscole, cifre e trattini.
                 E' anche l'indirizzo della scheda (/bandi/#<id>) e il
                 nome del PDF.
     titolo      il nome del bando
     ente        chi lo promuove e chi lo gestisce
     regione     il nome della regione, oppure 'Nazionale' per i bandi
                 validi in tutta Italia (MIMIT, SIMEST, Invitalia...)
     tipologie   una o piu' chiavi di TIPOLOGIE (la forma dell'aiuto)
     finalita    una o piu' chiavi di FINALITA (a cosa serve)
     beneficiari chi puo' chiederlo, in poche parole
     importo     la cifra che conta, in una riga
     sintesi     due o tre righe: cos'e' e a cosa serve
     apertura    'AAAA-MM-GG' (facoltativa): da quando si presenta domanda
     chiusura    'AAAA-MM-GG' (facoltativa): l'ultimo giorno utile. Senza,
                 lo sportello resta "aperto fino a esaurimento risorse"
     scadenza    la stessa informazione scritta per esteso
     procedura   'sportello' (ordine cronologico) o 'graduatoria' (facoltativa)
     sezioni     il testo della scheda: per ogni sezione un titolo (t),
                 dei paragrafi (p) e/o un elenco puntato (l)
     pdf         il file in bandi/schede/ (facoltativo)
     aggiornata  la data della scheda, 'AAAA-MM-GG'

   Lo stato (in apertura, aperto, in scadenza, chiuso) NON si scrive:
   lo calcola la pagina dalle date, giorno per giorno. Un bando chiuso
   resta in elenco, in fondo e segnato come chiuso: per toglierlo del
   tutto si cancella il blocco.

   Per una nuova TIPOLOGIA o FINALITA basta aggiungere la riga qui
   sotto: compare nei filtri appena un bando la usa.
   ============================================================ */
(function () {
    'use strict';

    // la forma dell'aiuto
    var TIPOLOGIE = {
        'fondo-perduto': 'Contributo a fondo perduto',
        'finanziamento': 'Finanziamento agevolato',
        'voucher': 'Voucher',
        'conto-interessi': 'Contributo in conto interessi'
    };

    // a cosa serve
    var FINALITA = {
        'digitale': 'Digitalizzazione e cybersecurity',
        'energia': 'Energia e sostenibilità',
        'export': 'Internazionalizzazione',
        'investimenti': 'Investimenti produttivi',
        'startup': 'Start up e nuove imprese',
        'ricerca': 'Ricerca e sviluppo',
        'proprieta-industriale': 'Brevetti e marchi',
        'credito': 'Accesso al credito',
        'certificazioni': 'Certificazioni e parità di genere',
        'commercio-artigianato': 'Commercio e artigianato'
    };

    var BANDI = [
        {
            id: 'mimit-brevetti-piu',
            titolo: 'Brevetti+',
            ente: 'MIMIT · gestito da Invitalia',
            regione: 'Nazionale',
            tipologie: ['fondo-perduto'],
            finalita: ['proprieta-industriale'],
            beneficiari: 'PMI titolari o licenziatarie di un brevetto',
            importo: 'Fino a 140.000 €, 80% dei costi',
            sintesi: 'Contributo a fondo perduto per l\'acquisto di servizi specialistici che valorizzano economicamente un brevetto: industrializzazione, organizzazione, tutela.',
            apertura: '2026-11-25',
            scadenza: 'Sportello dal 25 novembre 2026, ore 12:00-18:00; nei giorni lavorativi successivi solo se restano risorse',
            procedura: 'sportello',
            sezioni: [
                { t: 'Cos\'è', p: ['È un contributo a fondo perduto del Ministero delle Imprese e del Made in Italy, gestito da Invitalia, che favorisce lo sviluppo di una strategia brevettuale e la competitività delle micro, piccole e medie imprese attraverso l\'acquisto di servizi specialistici per la valorizzazione economica di un brevetto, in termini di redditività, produttività e sviluppo di mercato.'] },
                { t: 'Beneficiari', p: ['PMI, anche di nuova costituzione, con sede legale e operativa in Italia, che siano:'], l: [
                    'titolari o licenziatarie esclusive di un brevetto per invenzione industriale concesso in Italia dopo il 1° gennaio 2025;',
                    'titolari di una domanda nazionale di brevetto depositata dopo il 1° gennaio 2024, con rapporto di ricerca con esito "non negativo";',
                    'titolari di brevetti concessi dall\'EPO e convalidati in Italia dopo il 1° gennaio 2025, di brevetti con effetto unitario o di domande europee o internazionali con priorità su una precedente domanda nazionale, purché non già ammessa ai precedenti bandi Brevetti+.'
                ] },
                { t: 'Importi e dotazione', p: ['Dotazione complessiva: 20.000.000 euro. Il contributo, in regime de minimis, ha un valore massimo di 140.000 euro e non può superare l\'80% dei costi ammissibili. La percentuale sale all\'85% per le imprese con certificazione della parità di genere e al 100% per le imprese contitolari o licenziatarie esclusive di un brevetto rilasciato a un ente pubblico di ricerca (università, enti di ricerca, IRCCS).'] },
                { t: 'Spese ammissibili', l: [
                    'Macroarea A - progettazione, ingegnerizzazione e industrializzazione, incluso il Proof of Concept: studio di fattibilità, progettazione produttiva, prototipo, test di produzione, certificazioni di prodotto o processo, servizi di università ed enti pubblici di ricerca;',
                    'Macroarea B - organizzazione dei processi produttivi, analisi dei nuovi mercati, strategie di comunicazione e distribuzione;',
                    'Macroarea C - tutela della proprietà industriale: accordi di segretezza e accordi di licenza.'
                ], p: ['Il progetto deve includere almeno un servizio della Macroarea A; le Macroaree B e C, sommate, non possono superare il 20% del piano. Le spese vanno sostenute dopo la presentazione della domanda, con pagamenti tracciabili e fatture recanti il CUP.'] },
                { t: 'Come e quando presentare domanda', p: ['Esclusivamente online sulla piattaforma di Invitalia, con SPID o CIE e firma digitale. Lo sportello apre il 25 novembre 2026 alle 12:00 e chiude alle 18:00 dello stesso giorno; se restano risorse prosegue nei giorni lavorativi successivi, fino a esaurimento. Procedura a sportello, in ordine cronologico di presentazione.'] }
            ],
            pdf: 'mimit-brevetti-piu.pdf',
            aggiornata: '2026-11-15'
        },
        {
            id: 'mimit-marchi-piu',
            titolo: 'Marchi+',
            ente: 'MIMIT',
            regione: 'Nazionale',
            tipologie: ['fondo-perduto'],
            finalita: ['proprieta-industriale', 'export'],
            beneficiari: 'PMI titolari di un marchio UE o internazionale',
            importo: 'Fino a 6.000 € (UE) o 9.000 € (internazionale) per marchio',
            sintesi: 'Contributo a fondo perduto per tutelare i marchi all\'estero: tasse di registrazione e servizi specialistici per i marchi dell\'Unione europea (EUIPO) e internazionali (OMPI).',
            apertura: '2026-12-03',
            scadenza: 'Sportello dal 3 dicembre 2026, ore 12:00-18:00; nei giorni lavorativi successivi solo se restano risorse',
            procedura: 'sportello',
            sezioni: [
                { t: 'Cos\'è', p: ['È un contributo a fondo perduto del Ministero delle Imprese e del Made in Italy che sostiene le micro, piccole e medie imprese italiane nella tutela dei propri marchi all\'estero, finanziando le tasse di registrazione e l\'acquisizione di servizi specialistici esterni. Due linee: Misura A per i marchi dell\'Unione europea presso EUIPO, Misura B per i marchi internazionali presso OMPI.'] },
                { t: 'Beneficiari', p: ['PMI con sede legale e operativa in Italia, regolarmente costituite, iscritte e attive nel Registro delle imprese, in regola con DURC e normativa antimafia, titolari del marchio oggetto della domanda. Per la Misura A il marchio deve essere già registrato presso EUIPO prima della domanda; per la Misura B la domanda deve essere già pubblicata sul registro internazionale OMPI (Madrid Monitor).'] },
                { t: 'Importi e dotazione', p: ['Dotazione complessiva: 2.000.000 euro.'], l: [
                    'Misura A: 80% delle spese ammissibili, fino a 6.000 euro per marchio;',
                    'Misura B: 90% delle spese ammissibili, fino a 9.000 euro per marchio;',
                    'con certificazione della parità di genere le percentuali salgono all\'85% e al 95%;',
                    'ogni impresa può presentare più richieste, fino a 25.000 euro complessivi.'
                ] },
                { t: 'Spese ammissibili', p: ['Tasse di deposito o registrazione e costi per servizi specialistici esterni: progettazione della rappresentazione del marchio, assistenza per il deposito, ricerche di anteriorità, assistenza legale in caso di opposizioni o rilievi. Le spese devono essere state sostenute dal 1° gennaio 2023 (alcune fonti indicano il 1° giugno 2023) e comunque prima della presentazione della domanda.'] },
                { t: 'Come e quando presentare domanda', p: ['Esclusivamente online sul portale www.marchipiu2026.it. Lo sportello apre il 3 dicembre 2026 alle 12:00 e chiude alle 18:00 dello stesso giorno; se restano risorse rimane aperto dalle 12:00 alle 18:00 dei giorni lavorativi successivi, fino a esaurimento. Procedura a sportello, in ordine cronologico di presentazione.'] }
            ],
            pdf: 'mimit-marchi-piu.pdf',
            aggiornata: '2026-11-15'
        },
        {
            id: 'mimit-mini-contratti-sviluppo-automotive',
            titolo: 'Mini Contratti di Sviluppo - Filiera automotive',
            ente: 'MIMIT · istruttoria Unioncamere',
            regione: 'Nazionale',
            tipologie: ['fondo-perduto', 'finanziamento'],
            finalita: ['investimenti', 'ricerca'],
            beneficiari: 'Imprese di ogni dimensione della filiera automotive',
            importo: 'Programmi da 5 a 20 milioni €, aiuto fino al 75%',
            sintesi: 'Contributi a fondo perduto e finanziamenti agevolati per la transizione tecnologica e produttiva della filiera automotive: nuovi veicoli, componenti, propulsione, mobilità sostenibile e connessa.',
            apertura: '2026-11-30',
            scadenza: 'Sportello dal 30 novembre 2026, ore 12:00, fino a esaurimento risorse',
            procedura: 'sportello',
            sezioni: [
                { t: 'Cos\'è', p: ['È uno strumento agevolativo del Ministero delle Imprese e del Made in Italy che estende la logica dei Contratti di Sviluppo a programmi di investimento di dimensione più contenuta, tra 5 e 20 milioni di euro. Sostiene la transizione tecnologica e produttiva della filiera automotive italiana: nuovi veicoli, componenti, sistemi di propulsione e tecnologie per la mobilità sostenibile, autonoma, connessa e sicura.'] },
                { t: 'Beneficiari', p: ['Imprese di qualsiasi dimensione che operano nella filiera automotive in Italia, regolarmente costituite, iscritte e attive nel Registro delle imprese, in regola con gli obblighi contributivi e non in difficoltà. Sono ammessi programmi congiunti di al massimo cinque imprese, con un investimento minimo di 1,5 milioni di euro per ciascun partecipante. Le imprese non residenti devono disporre di un\'unità locale in Italia al momento dell\'erogazione.'] },
                { t: 'Importi e dotazione', p: ['Dotazione complessiva: 300 milioni di euro. L\'agevolazione combina contributi a fondo perduto e finanziamenti agevolati, con un\'intensità che può arrivare al 75% delle spese ammissibili secondo dimensione d\'impresa, localizzazione e tipologia di progetto.', 'Riserve per i primi sei mesi: 60% alle PMI (di cui un quarto a micro e piccole imprese); 40% ai programmi realizzati in Abruzzo, Molise, Campania, Basilicata, Calabria, Puglia, Sicilia e Sardegna; 10% ciascuna alle imprese con rating di legalità e a quelle con certificazione della parità di genere.'] },
                { t: 'Interventi ammissibili', p: ['Programmi di investimento produttivo, eventualmente accompagnati da ricerca industriale e sviluppo sperimentale e da formazione del personale (entro il 10% dell\'investimento produttivo): nuove unità produttive, ampliamenti, riconversioni, ristrutturazioni e acquisizioni di unità produttive, anche per salvaguardare l\'occupazione.', 'Ambiti tecnologici: nuovi veicoli e soluzioni di mobilità, alimentazione e propulsione a basse emissioni, componenti e tecnologie per la mobilità sostenibile e sicura, diversificazione e riconversione verso tecnologie strategiche ad alta intensità di ricerca, anche dual-use.'] },
                { t: 'Requisiti finanziari', p: ['Per la solidità finanziaria il decreto direttoriale guarda a: almeno tre bilanci approvati e depositati; fatturato superiore a 3 milioni di euro in ciascuno degli ultimi tre esercizi; PFN/MOL inferiore a 6,5; investimento/fatturato inferiore a 1,5; patrimonio netto superiore al 30% del totale attivo; (patrimonio netto + debiti finanziari a medio-lungo termine)/immobilizzazioni superiore a 1; MOL superiore all\'8% del fatturato. Il mancato rispetto di un parametro non esclude automaticamente, ma apre un approfondimento istruttorio.'] },
                { t: 'Come e quando presentare domanda', p: ['Esclusivamente online sulla piattaforma www.minicdsautomotive.dgiai.gov.it, con firma digitale del legale rappresentante (per i programmi congiunti, dell\'impresa capofila). Una sola domanda per impresa, salvo rigetto della precedente. Lo sportello apre il 30 novembre 2026 alle 12:00; valutazione in ordine cronologico fino a esaurimento delle risorse. L\'istruttoria, affidata a Unioncamere, esamina solidità economico-finanziaria, fattibilità tecnica e ricadute occupazionali.'] }
            ],
            pdf: 'mimit-mini-contratti-sviluppo-automotive.pdf',
            aggiornata: '2026-11-15'
        },
        {
            id: 'mimit-voucher-cloud-cybersecurity',
            titolo: 'Voucher Cloud & Cybersecurity 2026',
            ente: 'MIMIT · piattaforma Invitalia',
            regione: 'Nazionale',
            tipologie: ['fondo-perduto', 'voucher'],
            finalita: ['digitale'],
            beneficiari: 'PMI e lavoratori autonomi',
            importo: '50% delle spese, fino a 20.000 €',
            sintesi: 'Contributo a fondo perduto per l\'acquisto di servizi e prodotti di cloud computing e cyber security più avanzati di quelli già in uso, da fornitori iscritti nell\'elenco MIMIT.',
            apertura: '2026-11-10',
            chiusura: '2027-01-20',
            scadenza: 'Domande dal 10 novembre 2026 alle 12:00 del 20 gennaio 2027, salvo esaurimento risorse',
            procedura: 'sportello',
            sezioni: [
                { t: 'Cos\'è', p: ['È un incentivo nazionale del Ministero delle Imprese e del Made in Italy, con dotazione di 150.000.000 euro, che sostiene l\'acquisizione di servizi e prodotti di cloud computing e cyber security da parte di PMI e lavoratori autonomi, per favorire la transizione digitale e l\'adozione di soluzioni più avanzate e sicure di quelle già in uso.'] },
                { t: 'Beneficiari e requisiti', p: ['Microimprese, piccole e medie imprese e lavoratori autonomi operanti su tutto il territorio nazionale. Requisito tecnico obbligatorio: al momento della domanda, un contratto di connettività con velocità minima in download di 30 Mbps.', 'Non sono ammissibili prodotti o servizi con prestazioni analoghe a quelli già in uso, né estensioni di licenze esistenti, aumenti di postazioni o utenze, aggiornamenti di versione senza un miglioramento sostanziale.'] },
                { t: 'Spese ammissibili', l: [
                    'hardware di cybersecurity: firewall, NGFW, router/switch, IPS;',
                    'software di cybersecurity: antivirus/antimalware, monitoraggio reti, crittografia dati, SIEM, gestione vulnerabilità;',
                    'cloud IaaS / PaaS: virtual machine, storage e backup, network e security (VPN, DDoS), database;',
                    'cloud SaaS: contabilità, HRM, ERP (anche con funzioni IA), CMS/e-commerce, CRM/UCC/PABX;',
                    'servizi accessori: configurazione, monitoraggio e supporto continuativo (esclusa la formazione), entro il 30% del piano di spesa.'
                ], p: ['Gli acquisti vanno fatti da fornitori iscritti nell\'elenco ufficiale MIMIT, con acquisto diretto, abbonamento (durata minima 24 mesi; se superiore, ammissibili i primi 24) o una combinazione dei due. Piano di spesa minimo: 4.000 euro. Con il solo acquisto diretto il piano si chiude entro 12 mesi dalla concessione.'] },
                { t: 'Entità del contributo', l: [
                    '50% delle spese ammissibili;',
                    'massimale di 20.000 euro per beneficiario;',
                    'regime de minimis;',
                    'erogazione in due quote (dopo almeno il 50% del piano e a saldo) oppure in un\'unica soluzione a ultimazione, non prima di 3 mesi dalla concessione.'
                ] },
                { t: 'Come e quando presentare domanda', p: ['Procedura a sportello: la valutazione segue l\'ordine cronologico di presentazione, quindi conviene arrivare preparati. Precompilazione dalle 12:00 del 20 ottobre 2026; invio della domanda dalle 12:00 del 10 novembre 2026 alle 12:00 del 20 gennaio 2027, salvo esaurimento delle risorse. La precompilazione non consente di avviare il piano: le spese devono essere successive alla presentazione formale della domanda.'] }
            ],
            pdf: 'mimit-voucher-cloud-cybersecurity.pdf',
            aggiornata: '2026-11-15'
        },
        {
            id: 'simest-certificazioni-consulenze',
            titolo: 'SIMEST - Certificazioni e consulenze',
            ente: 'SIMEST · Fondo 394/81',
            regione: 'Nazionale',
            tipologie: ['finanziamento', 'fondo-perduto'],
            finalita: ['export', 'certificazioni'],
            beneficiari: 'Imprese italiane con almeno due bilanci, in particolare PMI',
            importo: 'Da 10.000 a 500.000 €, con quota a fondo perduto fino al 10%',
            sintesi: 'Finanziamento agevolato per consulenze specialistiche, studi di fattibilità, formazione e certificazioni finalizzate all\'internazionalizzazione, con una quota a fondo perduto.',
            apertura: '2026-01-14',
            scadenza: 'Sportello aperto dal 14 gennaio 2026, fino a esaurimento risorse',
            procedura: 'sportello',
            sezioni: [
                { t: 'Cos\'è', p: ['È un finanziamento agevolato di SIMEST, a valere sul Fondo 394/81, che sostiene le spese per consulenze specialistiche, studi di fattibilità, formazione e ottenimento di certificazioni finalizzate all\'internazionalizzazione. Punta a rafforzare la competitività sui mercati esteri attraverso innovazione digitale e tecnologica, tutela della proprietà intellettuale e certificazioni di sostenibilità.'] },
                { t: 'Beneficiari', p: ['Tutte le imprese italiane, con particolare attenzione a micro, piccole e medie imprese, iscritte nel Registro delle imprese e attive, con sede legale e operativa in Italia e almeno due bilanci depositati relativi a due esercizi completi. Sono ammesse anche le reti-soggetto.'] },
                { t: 'Importi', p: ['Importo minimo 10.000 euro; massimo pari al minore tra 500.000 euro e il 20% dei ricavi medi degli ultimi due bilanci. Durata 4 anni, di cui 2 di preammortamento, con tasso agevolato a scelta tra il 10%, il 50% o l\'80% del tasso di riferimento UE.', 'Cofinanziamento a fondo perduto fino al 10% dell\'intervento (massimo 100.000 euro) in presenza di specifici requisiti: PMI con sede al Sud, con certificazioni ambientali (ISO 45001, ISO 14001, SA8000), giovanili o femminili, con export pari ad almeno il 20% del fatturato, innovative, con interessi nei Balcani Occidentali o con policy di procurement sostenibile. Per progetti con focus su Africa, America Centrale o Meridionale o India la quota può salire al 20% (fino a 200.000 euro) per imprese del Sud o start up e PMI innovative. Per le imprese con interessi negli USA sono previste condizioni agevolate, tra cui l\'anticipo della prima tranche al 50%.'] },
                { t: 'Interventi ammissibili', p: ['Consulenze specialistiche e studi di fattibilità per l\'internazionalizzazione, formazione del management e del personale su export, consulenze per l\'innovazione digitale e tecnologica di prodotto, certificazioni di prodotto, di sostenibilità e di innovazione tecnologica, tutela dei diritti di proprietà intellettuale. Sono comprese le spese di supporto al progetto (massimo 20%) e le consulenze per la presentazione della domanda (massimo 5% dell\'importo deliberato).', 'Il contratto di consulenza, in italiano o in inglese, deve indicare professionista, oggetto, attività, Paesi di destinazione, durata e corrispettivo. Le spese vanno fatturate e pagate dopo la ricezione del CUP e rendicontate entro 12 mesi dalla stipula.'] },
                { t: 'Spese escluse', p: ['Attività direttamente collegate ai quantitativi esportati, spese correnti dell\'attività di esportazione, costi del personale dell\'impresa, consulenze continuative o periodiche (fiscale, legale, pubblicità) e spese già coperte da altra agevolazione pubblica non cumulabile.'] },
                { t: 'Come e quando presentare domanda', p: ['Sul portale SIMEST, con registrazione, firma digitale del legale rappresentante e documentazione allegata. Lo sportello è operativo dal 14 gennaio 2026 e resta aperto fino a esaurimento delle risorse, senza una data di chiusura fissa. SIMEST istruisce in ordine cronologico e sottopone la domanda al Comitato Agevolazioni.'] }
            ],
            pdf: 'simest-certificazioni-consulenze.pdf',
            aggiornata: '2026-11-15'
        },
        {
            id: 'simest-transizione-digitale-ecologica',
            titolo: 'SIMEST - Transizione digitale e/o ecologica',
            ente: 'SIMEST · Fondo 394/81, in convenzione con il MAECI',
            regione: 'Nazionale',
            tipologie: ['finanziamento', 'fondo-perduto'],
            finalita: ['digitale', 'energia', 'export'],
            beneficiari: 'Imprese esportatrici con almeno due bilanci',
            importo: 'Da 10.000 € fino a 5 milioni €, con quota a fondo perduto fino al 10%',
            sintesi: 'Finanziamento agevolato per investimenti in innovazione digitale e transizione ecologica, con una parte destinabile al rafforzamento patrimoniale, per le imprese con vocazione internazionale.',
            apertura: '2026-05-25',
            chiusura: '2026-12-31',
            scadenza: 'Sportello aperto fino al 31 dicembre 2026, salvo esaurimento risorse',
            procedura: 'sportello',
            sezioni: [
                { t: 'Cos\'è', p: ['È un finanziamento agevolato di SIMEST, a valere sul Fondo 394/81 gestito in convenzione con il MAECI, che sostiene investimenti per l\'innovazione digitale e la transizione ecologica, oltre al rafforzamento patrimoniale dell\'impresa, per aumentarne la competitività sui mercati internazionali.'] },
                { t: 'Beneficiari', p: ['Imprese iscritte nel Registro delle imprese e attive, con sede legale e operativa in Italia e almeno due bilanci depositati. È richiesto un fatturato export pari ad almeno il 10% dell\'ultimo bilancio oppure, per le PMI produttive, ad almeno il 3% se inserite in una filiera con contratti di fornitura attivi da almeno 12 mesi. MidCap e grandi imprese accedono con massimali differenti.'] },
                { t: 'Importi', p: ['Importo minimo 10.000 euro; massimo pari al minore tra il 35% dei ricavi medi degli ultimi due bilanci e: 500.000 euro per le micro imprese, 2.500.000 euro per PMI e PMI innovative, 5.000.000 euro per le altre imprese. Durata 6 anni, di cui 2 di preammortamento, con tasso agevolato a scelta tra il 10%, il 50% o l\'80% del tasso di riferimento.', 'Cofinanziamento a fondo perduto fino al 10% dell\'intervento (massimo 100.000 euro) in presenza di specifici requisiti: sede al Sud, certificazioni ambientali, imprese giovanili o femminili, PMI innovative, interessi nei Balcani Occidentali, sedi in territori alluvionati.'] },
                { t: 'Interventi ammissibili', p: ['Almeno il 50% dell\'importo deliberato deve andare a investimenti in transizione digitale e/o ecologica; il resto può essere destinato al rafforzamento patrimoniale (fino all\'80% per imprese con interessi nei Balcani Occidentali, fino al 90% per sedi nei territori colpiti dalle alluvioni del 2023).', 'Transizione digitale: integrazione digitale dei processi, ammodernamento dei modelli organizzativi, attrezzature tecnologiche, software e contenuti digitali, consulenze e formazione legata a Industria 4.0. Transizione ecologica: sostenibilità ambientale, efficientamento energetico e idrico, mitigazione degli impatti climatici, certificazioni ambientali.'] },
                { t: 'Come e quando presentare domanda', p: ['Sul portale SIMEST. Lo sportello è operativo dal 25 maggio 2026 e resta aperto fino al 31 dicembre 2026, salvo esaurimento anticipato delle risorse. Procedura a sportello, in ordine cronologico di presentazione.'] }
            ],
            pdf: 'simest-transizione-digitale-ecologica.pdf',
            aggiornata: '2026-11-15'
        },
        {
            id: 'emilia-romagna-fondo-energia',
            titolo: 'Fondo Energia 2021-2027',
            ente: 'Regione Emilia-Romagna',
            regione: 'Emilia-Romagna',
            tipologie: ['finanziamento', 'fondo-perduto'],
            finalita: ['energia'],
            beneficiari: 'Imprese con sede o unità locale in Emilia-Romagna',
            importo: 'Mutui da 25.000 a 1.000.000 €, 100% del progetto',
            sintesi: 'Finanziamento a tasso agevolato per efficienza energetica, fonti rinnovabili per l\'autoconsumo, adeguamento sismico ed economia circolare, con un contributo a fondo perduto sulle spese tecniche.',
            chiusura: '2026-11-30',
            scadenza: 'Sportello aperto fino al 30 novembre 2026, salvo proroghe',
            procedura: 'sportello',
            sezioni: [
                { t: 'Cos\'è', p: ['È un fondo regionale di finanza agevolata che sostiene gli interventi di green economy delle imprese: efficientamento energetico, autoproduzione di energia da fonti rinnovabili, adeguamento sismico abbinato a interventi energetici e sviluppo di processi di economia circolare. L\'obiettivo è aumentare la competitività riducendo consumi e costi energetici.'] },
                { t: 'Beneficiari', p: ['Imprese con sede legale o unità locale in cui si realizza il progetto, con codice di attività principale nelle sezioni ATECO 2007 B, C, D, E, F, G, H, I, J, L, M, N, P, Q, R, S.'] },
                { t: 'Importi e forma dell\'agevolazione', p: ['Finanziamento a tasso agevolato con provvista mista: 75% da risorse pubbliche del Fondo e 25% da istituti di credito convenzionati. Mutuo chirografario da 18 a 96 mesi (con preammortamento fino a 18 mesi), di importo tra 25.000 e 1.000.000 di euro, a copertura del 100% del progetto.', 'Il tasso a carico dell\'impresa è la media ponderata tra lo 0,00% sulla quota pubblica e l\'Euribor 6 mesi con spread massimo del 4,99% sulla quota bancaria. In più, un contributo a fondo perduto per le spese tecniche di preparazione e supporto del progetto, fino al 12,5% della quota pubblica del finanziamento.'] },
                { t: 'Interventi ammissibili', l: [
                    'efficientamento energetico delle imprese;',
                    'impianti di produzione di energia da fonti rinnovabili per l\'autoconsumo;',
                    'miglioramento e adeguamento sismico associati a interventi energetici;',
                    'circolarità dei processi e impianti di economia circolare.'
                ] },
                { t: 'Come e quando presentare domanda', p: ['Le domande si presentano sul portale dedicato. Lo sportello è aperto fino al 30 novembre 2026, salvo proroghe.'] }
            ],
            pdf: 'emilia-romagna-fondo-energia.pdf',
            aggiornata: '2026-11-15'
        },
        {
            id: 'lazio-voucher-internazionalizzazione',
            titolo: 'Voucher Internazionalizzazione 2027',
            ente: 'Regione Lazio · PR FESR Lazio 2021-2027',
            regione: 'Lazio',
            tipologie: ['voucher', 'fondo-perduto'],
            finalita: ['export'],
            beneficiari: 'PMI con sede operativa nel Lazio, di ogni settore',
            importo: '15.240 € a fiera, fino a tre fiere (45.720 €)',
            sintesi: 'Voucher forfettario a fondo perduto per partecipare a fiere internazionali B2B che si svolgono nel 2027, in Italia o all\'estero, senza rendicontazione analitica.',
            apertura: '2026-12-10',
            chiusura: '2027-01-21',
            scadenza: 'Domande dal 10 dicembre 2026 al 21 gennaio 2027',
            procedura: 'graduatoria',
            sezioni: [
                { t: 'Cos\'è', p: ['È un contributo a fondo perduto della Regione Lazio, cofinanziato dal PR FESR Lazio 2021-2027, che sostiene la partecipazione delle PMI con sede operativa nel Lazio a fiere internazionali Business to Business che si svolgono nel 2027, in Italia o all\'estero. Serve ad aprire o consolidare relazioni commerciali sui mercati esteri.'] },
                { t: 'Beneficiari', p: ['Tutte le PMI con sede operativa nel Lazio, di qualsiasi settore: non c\'è un elenco di codici ATECO ammessi, solo le attività espressamente escluse.'] },
                { t: 'Importi', p: ['Il voucher è forfettario, non richiede rendicontazione analitica e vale 15.240 euro per ogni fiera ammessa: 12.700 euro per la partecipazione e 2.540 euro (20%) per i costi diretti del personale. Ogni PMI può presentare un solo progetto, per un massimo di tre fiere e 45.720 euro. L\'aiuto è in regime de minimis: se il plafond residuo non basta si riduce il numero di fiere, non il valore del voucher.'] },
                { t: 'Spese coperte', l: [
                    'noleggio dell\'area espositiva e allestimenti (affidati all\'organizzatore o, all\'estero, all\'agenzia locale);',
                    'servizi tecnici, logistica e trasporti connessi allo stand;',
                    'viaggi del personale e materiali promozionali usati in fiera;',
                    'servizi di marketing e PR strettamente legati alla presenza in fiera, e servizi digitali solo se integrativi;',
                    'costi diretti del personale interno, coperti dalla quota forfettaria del 20% senza cedolini o timesheet.'
                ] },
                { t: 'Spese non coperte', p: ['Attività generiche di export non legate a una fiera approvata, campagne di comunicazione non collegate alle fiere del progetto, fiere fuori dal 2027 o sostituite senza autorizzazione, partecipazioni senza contratto diretto con l\'organizzatore (o, all\'estero, con l\'agenzia locale specializzata). Il voucher non è cumulabile con altri aiuti pubblici per la stessa fiera, anche sotto forma di servizi finanziati da ICE, ENIT o CCIAA.'] },
                { t: 'Vincoli sulle fiere', p: ['Ogni fiera deve iniziare e concludersi nel 2027, essere B2B e internazionale (all\'estero, oppure in Italia se censita come internazionale nel calendario fieristico nazionale 2027). La PMI deve avere uno spazio espositivo fisico proprio: niente spazi collettivi o intermediari italiani. Una fiera approvata si può sostituire solo se l\'organizzatore la cancella. Ridurre il numero di fiere è ammesso, ma se il punteggio scende sotto la soglia può comportare la revoca.'] },
                { t: 'Come e quando presentare domanda', p: ['Sulla piattaforma GeCoWEB Plus, con accesso SPID o CIE. Lo sportello apre il 10 dicembre 2026 e chiude il 21 gennaio 2027. L\'assegnazione avviene per graduatoria a punteggio.'] }
            ],
            pdf: 'lazio-voucher-internazionalizzazione.pdf',
            aggiornata: '2026-11-15'
        },
        {
            id: 'lazio-finanziamenti-bei',
            titolo: 'Finanziamenti con provvista BEI e contributo in conto interessi',
            ente: 'Regione Lazio · PR FESR Lazio 2021-2027',
            regione: 'Lazio',
            tipologie: ['conto-interessi', 'fondo-perduto'],
            finalita: ['credito', 'investimenti'],
            beneficiari: 'PMI con un finanziamento BEI di almeno 100.000 €',
            importo: 'Dall\'80% al 100% degli interessi, entro 300.000 € de minimis',
            sintesi: 'Contributo a fondo perduto sugli interessi dei finanziamenti bancari concessi con provvista della Banca europea per gli investimenti, per investimenti o capitale circolante.',
            apertura: '2026-11-23',
            chiusura: '2028-10-03',
            scadenza: 'Sportello dal 23 novembre 2026, ore 12:00, al 3 ottobre 2028, salvo esaurimento risorse',
            procedura: 'sportello',
            sezioni: [
                { t: 'Cos\'è', p: ['È un contributo a fondo perduto della Regione Lazio, nell\'ambito del PR FESR Lazio 2021-2027, che riduce gli oneri finanziari delle PMI riconoscendo un contributo sugli interessi dei finanziamenti bancari concessi con la provvista della Banca europea per gli investimenti (BEI).'] },
                { t: 'Beneficiari', p: ['Esclusivamente le PMI (le MidCap possono avere il finanziamento BEI, ma non il contributo regionale) che:'], l: [
                    'hanno già ottenuto da una banca convenzionata un finanziamento con provvista BEI di almeno 100.000 euro;',
                    'sono iscritte al Registro delle imprese o, se lavoratori autonomi, hanno partita IVA attiva;',
                    'hanno nel Lazio la sede operativa interessata dal progetto;',
                    'sono in regola con i requisiti generali, compresi regolarità contributiva e, se obbligatoria, polizza contro i rischi catastrofali.'
                ] },
                { t: 'Importi', p: ['Contributo in conto interessi, in regime de minimis, erogato in un\'unica soluzione anticipata e calcolato sul valore attuale degli interessi del piano di ammortamento:'], l: [
                    '100% per i progetti di PMI dell\'indotto automotive;',
                    '90% per i progetti Green e per le sedi nelle Zone assistite o nelle Aree di crisi industriale;',
                    '80% per tutti gli altri finanziamenti agevolabili.'
                ] },
                { t: 'I finanziamenti BEI sottostanti', p: ['Il contributo riguarda solo finanziamenti già formalizzati ed erogati alla data della domanda: importo tra 100.000 euro e 10 milioni, durata da 2 a 12 anni con preammortamento fino a 24 mesi, tasso inferiore a quello praticato dalla banca con provvista propria, eventuale garanzia (anche del Fondo centrale di garanzia). Devono finanziare investimenti o capitale circolante di attività svolte in sedi operative nel Lazio.', 'La provvista BEI, 120 milioni di euro in tutto, è assegnata a BNL (30 milioni), al raggruppamento ICCREA Banca, BCC di Roma, BCC di Bellegra, Banca TEMA, BCC dei Colli Albani (45 milioni) e al raggruppamento Mediocredito Centrale, BdM Banca, Cassa di Risparmio di Orvieto, Banca Italiana per l\'Ambiente e per l\'Energia, Banca del Fucino (45 milioni). Il prestito si chiede direttamente a una di queste banche.'] },
                { t: 'Come e quando presentare domanda', p: ['Sulla piattaforma GeCoWEB Plus, con accesso SPID o CIE. Lo sportello apre il 23 novembre 2026 alle 12:00 e chiude il 3 ottobre 2028 alle 17:00, salvo chiusura anticipata per esaurimento della dotazione. Procedura a sportello, in ordine cronologico. Tra gli allegati obbligatori: l\'attestazione della banca sul prestito con provvista BEI (Modello 1), la dichiarazione sul requisito di PMI e la polizza catastrofale o la dichiarazione di esclusione.'] }
            ],
            pdf: 'lazio-finanziamenti-bei.pdf',
            aggiornata: '2026-11-15'
        },
        {
            id: 'lazio-pre-seed-plus',
            titolo: 'PRE-SEED Plus - Start up innovative',
            ente: 'Regione Lazio · gestito da Lazio Innova',
            regione: 'Lazio',
            tipologie: ['fondo-perduto'],
            finalita: ['startup', 'ricerca'],
            beneficiari: 'Start up innovative costituite da non più di 24 mesi, o da costituire',
            importo: 'Da 10.000 a 100.000 €, 100% delle spese',
            sintesi: 'Contributo a fondo perduto per un Piano di Attività di 12 mesi che renda la start up innovativa più attrattiva per il capitale di rischio, con attenzione agli spin-off della ricerca.',
            scadenza: 'Sportello aperto fino a esaurimento risorse',
            procedura: 'sportello',
            sezioni: [
                { t: 'Cos\'è', p: ['È un contributo a fondo perduto della Regione Lazio, gestito da Lazio Innova nell\'ambito del PR FESR Lazio 2021-2027, che promuove la creazione e il consolidamento di start up innovative ad alto potenziale di crescita. Sostiene un Piano di Attività della durata massima di 12 mesi, con particolare attenzione agli spin-off della ricerca.'] },
                { t: 'Beneficiari', p: ['Start up innovative iscritte nella sezione speciale del Registro delle imprese, in forma singola, che:'], l: [
                    'se già costituite, non lo siano da più di 24 mesi;',
                    'abbiano la sede operativa nel Lazio al più tardi alla prima erogazione del contributo;',
                    'abbiano un codice ATECO nei Settori ad Alta Intensità Tecnologica e di Conoscenza;',
                    'siano una piccola impresa dalla domanda fino alla concessione.'
                ] },
                { t: 'Importi', p: ['Contributo minimo 10.000 euro, con cofinanziamento del 100%. Massimi:'], l: [
                    'start up non spin-off della ricerca: 30.000 euro;',
                    'start up non spin-off con apporto di capitale da investitori terzi e indipendenti di almeno 10.000 euro: il contributo cresce dell\'importo dell\'apporto, fino a 60.000 euro;',
                    'start up spin-off della ricerca: 100.000 euro.'
                ] },
                { t: 'Interventi e spese ammissibili', p: ['Progetti di avviamento basati su una soluzione innovativa già individuata, scalabile anche sui mercati internazionali e rientrante in un\'area della Smart Specialisation Strategy regionale. Il Piano di Attività deve consolidare capitale tecnologico (prototipazione, proprietà intellettuale) e capitale umano, e sviluppare strategie commerciali, finanziarie e di ricerca di partner.', 'Spese finanziabili: investimenti (incluse le spese di costituzione), servizi specialistici, costo del personale diverso da soci e amministratori, altre spese previste dall\'Avviso. Vanno sostenute dopo la domanda (salvo la progettazione) ed entro 12 mesi dalla concessione. Un solo progetto per start up.'] },
                { t: 'Come e quando presentare domanda', p: ['Sulla piattaforma GeCoWEB Plus. Procedura valutativa a sportello, in ordine cronologico, fino a esaurimento delle risorse. Una Commissione valuta qualità tecnica del progetto, competenze del team e adeguatezza del Piano di Attività, con una premialità per le ricadute ambientali.'] }
            ],
            pdf: 'lazio-pre-seed-plus.pdf',
            aggiornata: '2026-11-15'
        },
        {
            id: 'lombardia-parita-di-genere',
            titolo: 'Verso la certificazione della parità di genere',
            ente: 'Regione Lombardia · Unioncamere Lombardia',
            regione: 'Lombardia',
            tipologie: ['voucher', 'fondo-perduto'],
            finalita: ['certificazioni'],
            beneficiari: 'PMI lombarde con almeno un dipendente',
            importo: 'Voucher fino a 7.000 € (consulenza) e 9.000 € (certificazione)',
            sintesi: 'Voucher a fondo perduto per ottenere la certificazione della parità di genere UNI/PdR 125:2022: consulenza specialistica e costi di certificazione.',
            scadenza: 'Sportello aperto fino a esaurimento della dotazione',
            procedura: 'sportello',
            sezioni: [
                { t: 'Cos\'è', p: ['È un contributo a fondo perduto, sotto forma di voucher aziendale, che la Regione Lombardia riconosce tramite Unioncamere Lombardia, nell\'ambito del PR FSE+ 2021-2027, alle micro, piccole e medie imprese che vogliono ottenere la certificazione della parità di genere secondo la prassi UNI/PdR 125:2022.'] },
                { t: 'Beneficiari', l: [
                    'micro, piccole o medie imprese, iscritte e attive nel Registro delle imprese o titolari di partita IVA attiva;',
                    'con sede operativa attiva in Lombardia (o domicilio fiscale in Lombardia, per i titolari di sola partita IVA);',
                    'con almeno un dipendente in pianta organica;',
                    'in regola con DURC, de minimis, collocamento mirato (L. 68/1999) e, se dovuto, Rapporto sulla situazione del personale.'
                ], p: ['Sono esclusi i soggetti che operano come fornitori di servizi consulenziali nella stessa misura.'] },
                { t: 'Importi', p: ['Il contributo copre fino all\'80% delle spese ammissibili. Valore massimo dei voucher per numero di dipendenti:'], l: [
                    'da 1 a 9: 2.500 euro per la consulenza (Linea A) e 2.000 euro per la certificazione (Linea B);',
                    'da 10 a 49: 4.000 euro e 4.000 euro;',
                    'da 50 a 125: 5.000 euro e 7.000 euro;',
                    'da 126 a 249: 7.000 euro e 9.000 euro.'
                ] },
                { t: 'Interventi ammissibili', p: ['Linea A - servizi di consulenza specialistica per impostare un sistema di gestione per la parità di genere: analisi organizzativa, individuazione dei gap, Piano strategico, supporto all\'implementazione e al monitoraggio, creazione di competenze interne.', 'Linea B - costi di certificazione presso organismi accreditati, conformi alla UNI/PdR 125:2022. Chi chiede la Linea A deve chiedere anche la B; la sola Linea B è ammessa.', 'Il contributo è in regime de minimis e non è cumulabile con altre agevolazioni sugli stessi costi.'] },
                { t: 'Come e quando presentare domanda', p: ['Esclusivamente online sulla piattaforma Bandi Online di Regione Lombardia (www.bandi.regione.lombardia.it). Procedura a sportello, in ordine cronologico, fino a esaurimento della dotazione.'] }
            ],
            pdf: 'lombardia-parita-di-genere.pdf',
            aggiornata: '2026-11-15'
        },
        {
            id: 'lombardia-pacchetto-investimenti',
            titolo: 'Pacchetto investimenti - Linea sviluppo aziendale',
            ente: 'Regione Lombardia · gestito da Finlombarda',
            regione: 'Lombardia',
            tipologie: ['fondo-perduto', 'finanziamento'],
            finalita: ['investimenti', 'digitale'],
            beneficiari: 'PMI e MidCap con sede operativa in Lombardia e due bilanci',
            importo: 'Investimenti da 100.000 €, fino a 3 milioni € per progetto',
            sintesi: 'Finanziamento assistito da garanzia e contributo a fondo perduto per ammodernare e ampliare la produzione: nuovi stabilimenti, macchinari, impianti, software e tecnologie digitali.',
            scadenza: 'Sportello aperto fino a esaurimento risorse',
            procedura: 'sportello',
            sezioni: [
                { t: 'Cos\'è', p: ['È un\'agevolazione della Regione Lombardia, nell\'ambito del PR FESR 2021-2027 (Azione 1.3.3), gestita da Finlombarda, che sostiene gli investimenti di PMI e MidCap per rafforzare flessibilità produttiva e organizzativa, crescita dimensionale e resilienza, con particolare attenzione alle nuove tecnologie digitali.'] },
                { t: 'Beneficiari', p: ['PMI e MidCap (fino a 3.000 dipendenti) costituite, iscritte e attive nel Registro delle imprese con almeno due bilanci depositati, con sede operativa in Lombardia (per l\'Area 2, nelle zone dell\'art. 107.3.c TFUE) e rating da 1 a 10 secondo il Credit Scoring del Fondo Centrale di Garanzia. Esclusi, tra gli altri: settore agricolo (salvo eccezioni), magazzinaggio e supporto ai trasporti (ATECO H 52), attività finanziarie e assicurative, grandi strutture di vendita, tabacco.'] },
                { t: 'Importi', p: ['Investimento minimo 100.000 euro; finanziamento assistito da garanzia e contributo, sommati, non oltre 3.000.000 di euro per progetto. Intensità massima del contributo a fondo perduto:'], l: [
                    'Area 1 (tutta la Lombardia): 15% per PMI e MidCap in de minimis; con l\'art. 17 GBER 15% per micro e piccole e 5% per le medie;',
                    'Area 2, province di Pavia, Lodi, Como e Sondrio: 30% micro e piccole, 20% medie, 10% MidCap;',
                    'Area 2, province di Mantova e Cremona: 25% micro e piccole, 15% medie, 5% MidCap.'
                ] },
                { t: 'Progetti e spese ammissibili', p: ['Progetti di sviluppo aziendale: nuovo stabilimento, ampliamento di uno esistente, diversificazione della produzione o trasformazione radicale del processo produttivo. Le spese, al netto di IVA, vanno sostenute dopo la domanda:'], l: [
                    'macchinari, impianti di produzione, attrezzature, hardware e arredi;',
                    'software, licenze d\'uso, servizi cloud e SaaS (massimo 12 mesi);',
                    'marchi, brevetti e licenze di produzione;',
                    'opere murarie, bonifica e impiantistica funzionali all\'installazione, entro il 20%.'
                ] },
                { t: 'Come e quando presentare domanda', p: ['Procedura valutativa a sportello, in ordine cronologico di invio sulla piattaforma Bandi e Servizi di Regione Lombardia: istruttoria formale e valutazione tecnica con soglia minima di 60 punti. I progetti vanno realizzati e rendicontati entro 15 mesi dalla pubblicazione della concessione. Lo sportello è aperto fino a esaurimento delle risorse, senza una scadenza fissa.'] }
            ],
            pdf: 'lombardia-pacchetto-investimenti.pdf',
            aggiornata: '2026-11-15'
        },
        {
            id: 'piemonte-energie-rinnovabili',
            titolo: 'Efficienza energetica ed energie rinnovabili nelle imprese',
            ente: 'Regione Piemonte · gestito da Finpiemonte',
            regione: 'Piemonte',
            tipologie: ['finanziamento', 'fondo-perduto'],
            finalita: ['energia'],
            beneficiari: 'MPMI e grandi imprese con unità locale in Piemonte',
            importo: 'Investimenti da 50.000 € a 5 milioni €, coperti fino al 100%',
            sintesi: 'Finanziamento agevolato e sovvenzione a fondo perduto per impianti che producono energia termica ed elettrica da fonti rinnovabili, idrogeno verde e sistemi di accumulo.',
            apertura: '2026-06-04',
            chiusura: '2026-11-27',
            scadenza: 'Sportello aperto fino al 27 novembre 2026, ore 12:00',
            procedura: 'sportello',
            sezioni: [
                { t: 'Cos\'è', p: ['È un\'agevolazione della Regione Piemonte, nell\'ambito del PR FESR 2021-2027 (Azione II.2ii.2), gestita da Finpiemonte, che promuove la diffusione delle fonti rinnovabili nel sistema produttivo per ridurre emissioni di CO₂ e costi energetici.'] },
                { t: 'Beneficiari', p: ['Micro, piccole, medie e grandi imprese che investono in Piemonte, con unità locale attiva nella regione, iscritte al Registro delle imprese da almeno due anni e con almeno due bilanci chiusi e approvati. Escluse le imprese in difficoltà.'] },
                { t: 'Importi', p: ['Investimento ammissibile: da 50.000 a 3.000.000 di euro per le MPMI, da 300.000 a 5.000.000 di euro per le grandi imprese (IVA esclusa). L\'agevolazione copre fino al 100% dei costi, con un finanziamento agevolato (quota a tasso zero con fondi regionali e quota bancaria a tasso di mercato) e una sovvenzione a fondo perduto.', 'Intensità massima di aiuto: fino al 65% per micro e piccole imprese, 55% per le medie, 45% per le grandi (50%, 40% e 30% per i soli sistemi di accumulo). Durata del finanziamento: 60 mesi fino a 1.000.000 di euro, 72 mesi fino a 2.000.000, più lunga oltre.'] },
                { t: 'Interventi ammissibili', l: [
                    'impianti di cogenerazione ad alto rendimento alimentati da fonti rinnovabili;',
                    'impianti fotovoltaici e idroelettrici di nuova costruzione, su edifici esistenti o a terra in aree non agricole;',
                    'impianti per energia termica da fonti rinnovabili: geotermico, solare termico, pompe di calore, biomasse;',
                    'impianti per la produzione di idrogeno verde;',
                    'sistemi di accumulo collegati a un impianto rinnovabile.'
                ], p: ['Gli investimenti devono coprire esclusivamente il consumo medio annuo dell\'impresa e concludersi entro 18 mesi dalla concessione. Ammesse forniture, installazione, opere edili connesse (fino al 30%) e spese tecniche.'] },
                { t: 'Come e quando presentare domanda', p: ['Esclusivamente online sul portale della Regione Piemonte, con SPID, CIE o CNS. Procedura a sportello, in ordine cronologico; una sola domanda per beneficiario. Finestra: dal 4 giugno 2026 alle 10:00 al 27 novembre 2026 alle 12:00, salvo sospensione anticipata per esaurimento delle risorse.'] }
            ],
            pdf: 'piemonte-energie-rinnovabili.pdf',
            aggiornata: '2026-11-15'
        },
        {
            id: 'piemonte-contratto-insediamento',
            titolo: 'Contratto di insediamento - Grandi imprese',
            ente: 'Regione Piemonte · gestito da Finpiemonte',
            regione: 'Piemonte',
            tipologie: ['fondo-perduto'],
            finalita: ['investimenti', 'ricerca'],
            beneficiari: 'Grandi imprese, small midcap e midcap',
            importo: 'Spesa minima da 1 a 3 milioni €',
            sintesi: 'Contributo a fondo perduto per nuovi insediamenti o ampliamenti in Piemonte di stabilimenti produttivi, centri di ricerca e centri servizi che creano nuova occupazione qualificata.',
            scadenza: 'Sportello aperto fino a esaurimento risorse',
            procedura: 'sportello',
            sezioni: [
                { t: 'Cos\'è', p: ['È un contributo a fondo perduto della Regione Piemonte (L.R. 34/2004), gestito da Finpiemonte, che favorisce l\'insediamento e lo sviluppo di investimenti di grandi imprese in Piemonte: nuovi insediamenti o ampliamenti di sedi esistenti, per stabilimenti produttivi, centri di ricerca e centri servizi che generino nuova occupazione qualificata, diretta o indiretta.'] },
                { t: 'Beneficiari', p: ['Grandi imprese singole, non riunite in raggruppamento: small midcap, midcap e grandi imprese non midcap. I progetti di ricerca e sviluppo possono essere realizzati in collaborazione effettiva con PMI attive da almeno un anno e con organismi di ricerca. Per la grande impresa proponente è obbligatorio un incremento occupazionale in Piemonte.'] },
                { t: 'Importi', p: ['Contributi massimi e intensità dipendono dalla tipologia di progetto e dalla dimensione dell\'azienda. Soglie minime di spesa ammissibile:'], l: [
                    'progetti di ricerca e sviluppo: 1.000.000 di euro;',
                    'investimenti materiali e immateriali: 2.000.000 di euro per le small midcap, 3.000.000 di euro per midcap e grandi imprese non midcap.'
                ] },
                { t: 'Interventi ammissibili', p: ['Due tipologie, anche insieme: progetti di ricerca e sviluppo preordinati o conseguenti all\'insediamento o all\'ampliamento di una sede in Piemonte; investimenti materiali e immateriali nelle aree della Carta degli aiuti a finalità regionale (107.3.c) per creare una nuova attività economica, cioè un nuovo stabilimento o la diversificazione di uno esistente verso un\'attività non uguale o simile alla precedente. Gli interventi si concludono entro 36 mesi dalla concessione.'] },
                { t: 'Come e quando presentare domanda', p: ['Procedura a sportello: i progetti sono valutati in ordine cronologico di presentazione. Lo sportello può essere sospeso o chiuso quando le risorse sono esaurite o in via di esaurimento.'] }
            ],
            pdf: 'piemonte-contratto-insediamento.pdf',
            aggiornata: '2026-11-15'
        },
        {
            id: 'piemonte-digitalizzazione-efficientamento',
            titolo: 'Digitalizzazione ed efficientamento produttivo delle imprese',
            ente: 'Regione Piemonte · gestito da Finpiemonte',
            regione: 'Piemonte',
            tipologie: ['finanziamento', 'fondo-perduto'],
            finalita: ['digitale', 'investimenti', 'energia'],
            beneficiari: 'PMI e MidCap con sede operativa in Piemonte',
            importo: 'Investimenti da 50.000 € a 3 milioni €, coperti al 100%',
            sintesi: 'Finanziamento a tasso zero e contributo a fondo perduto per digitalizzare il processo produttivo e renderlo più efficiente, sostenibile e sicuro.',
            apertura: '2026-07-07',
            chiusura: '2028-10-29',
            scadenza: 'Sportelli aperti fino al 29 ottobre 2028, salvo esaurimento risorse',
            procedura: 'sportello',
            sezioni: [
                { t: 'Cos\'è', p: ['È un bando della Regione Piemonte, nell\'ambito del PR FESR 2021-2027 (Azioni I.1ii.2 e I.1iii.1), gestito da Finpiemonte, che sostiene programmi organici di investimento per innovare il processo produttivo: prodotti più sostenibili, processi più efficienti sotto il profilo energetico e ambientale, più sicurezza sul lavoro.'] },
                { t: 'Beneficiari', p: ['PMI, piccole imprese a media capitalizzazione e MidCap (fino a 3.000 ULA) con un processo produttivo attivo e una sede operativa o unità locale in Piemonte (o l\'impegno ad attivarla prima dell\'erogazione), iscritte al Registro delle imprese, con almeno un bilancio chiuso e approvato, non in difficoltà e in regola con i contributi. Le MidCap possono presentare domanda solo per le sotto-linee "green".'] },
                { t: 'Importi e dotazione', p: ['Dotazione: 37.000.000 di euro per la Digitalizzazione e 41.000.000 di euro per l\'Efficientamento produttivo. L\'agevolazione copre il 100% dell\'investimento ammesso, combinando finanziamento a tasso zero, quota a tasso bancario e contributo a fondo perduto, con maggiorazioni per i progetti green e premialità per rating di legalità, certificazione della parità di genere, certificazione ambientale, rating ESG e componente femminile o giovanile.', 'Investimento minimo: 50.000 euro per micro e piccole imprese, 100.000 euro per le medie, 250.000 euro per le MidCap. Massimo 3.000.000 di euro per tutti.'] },
                { t: 'Interventi ammissibili', p: ['Linea A - Digitalizzazione del processo produttivo: infrastrutture digitali e cybersecurity (cloud, 5G, intelligenza artificiale, protezione reti), sistemi integrati aziendali (ERP, MES, CRM), e-commerce, tecnologie emergenti (robotica avanzata, IoT, stampa 3D, realtà aumentata e virtuale), soluzioni digitali per la sostenibilità.', 'Linea B - Efficientamento sostenibile del processo produttivo: diversificazione produttiva, innovazioni di prodotto, trasformazione del processo, sicurezza sul lavoro, progetti green per decarbonizzazione ed economia circolare. Gli investimenti si concludono entro 18 mesi dalla concessione.'] },
                { t: 'Come e quando presentare domanda', p: ['Procedura a sportello, in ordine cronologico, sulla procedura informatizzata indicata da Finpiemonte. La Linea B è aperta dal 7 luglio 2026, la Linea A dal 13 ottobre 2026; entrambe fino al 29 ottobre 2028 alle 12:00, salvo sospensione anticipata per esaurimento delle risorse.'] }
            ],
            pdf: 'piemonte-digitalizzazione-efficientamento.pdf',
            aggiornata: '2026-11-15'
        },
        {
            id: 'sardegna-ricerca-transizione-energetica',
            titolo: 'Aiuti a sportello per progetti di R&S per la transizione energetica delle MPMI',
            ente: 'Regione Sardegna · Sardegna Ricerche',
            regione: 'Sardegna',
            tipologie: ['fondo-perduto'],
            finalita: ['ricerca', 'energia'],
            beneficiari: 'MPMI, singole o con un organismo di ricerca',
            importo: 'Progetti da 50.000 a 150.000 €',
            sintesi: 'Sovvenzione a fondo perduto per progetti di ricerca e sviluppo sulle reti intelligenti e sulle tecnologie per la transizione energetica, da svolgere nella Piattaforma Energie Rinnovabili.',
            apertura: '2026-03-16',
            chiusura: '2027-03-31',
            scadenza: 'Sportello aperto fino al 31 marzo 2027, salvo esaurimento risorse',
            procedura: 'sportello',
            sezioni: [
                { t: 'Cos\'è', p: ['È un contributo a fondo perduto di Sardegna Ricerche, nell\'ambito del PR FESR Sardegna 2021-2027 (Azione 1.1.1), che sostiene progetti di ricerca e sviluppo delle MPMI nell\'area di specializzazione "Reti Intelligenti per la gestione efficiente dell\'energia" della S3 regionale, con focus sulle tecnologie per la transizione energetica.'] },
                { t: 'Beneficiari', p: ['Micro, piccole e medie imprese, in forma singola oppure aggregata con un unico organismo di ricerca. Sono ammessi tutti i settori ATECO 2025, esclusi pesca e acquacoltura, produzione primaria di prodotti agricoli e le attività escluse dai regolamenti de minimis e GBER o contrarie al principio DNSH.'] },
                { t: 'Importi e dotazione', p: ['Dotazione complessiva: 3.000.000 di euro. Sovvenzione a fondo perduto sui costi ammissibili del progetto approvato, in regime di aiuto ai sensi del Reg. (UE) n. 651/2014. I progetti devono avere una dimensione finanziaria tra 50.000 e 150.000 euro e una durata tra 6 e 24 mesi.'] },
                { t: 'Attività ammissibili', p: ['Progetti di ricerca e sviluppo realizzati in Sardegna sulle tecnologie per la transizione energetica, finalizzati a incrementare la collaborazione con la Piattaforma Energie Rinnovabili di Sardegna Ricerche e da svolgere all\'interno della Piattaforma stessa.'] },
                { t: 'Come e quando presentare domanda', p: ['Esclusivamente in modalità telematica sul sistema SIPES della Regione Sardegna. Procedura a sportello, in ordine cronologico, fino a esaurimento delle risorse. Finestra: dal 16 marzo 2026 alle 9:00 al 31 marzo 2027.'] }
            ],
            pdf: 'sardegna-ricerca-transizione-energetica.pdf',
            aggiornata: '2026-11-15'
        },
        {
            id: 'sicilia-piu-artigianato',
            titolo: 'Più Artigianato - contributi su finanziamenti per investimenti',
            ente: 'Regione Siciliana · gestito dalla CRIAS',
            regione: 'Sicilia',
            tipologie: ['conto-interessi', 'fondo-perduto'],
            finalita: ['commercio-artigianato', 'investimenti', 'credito'],
            beneficiari: 'Imprese artigiane con sede operativa in Sicilia',
            importo: 'Fondo perduto al 35% dell\'investimento, più contributo sugli interessi',
            sintesi: 'Abbattimento del costo di finanziamenti bancari, leasing e microcredito delle imprese artigiane, integrato da contributi a fondo perduto in conto capitale e sulle scorte.',
            apertura: '2026-10-27',
            scadenza: 'Piattaforma riaperta il 27 ottobre 2026, fino a esaurimento risorse',
            procedura: 'sportello',
            sezioni: [
                { t: 'Cos\'è', p: ['È un avviso pubblico della Regione Siciliana, gestito dalla CRIAS (Cassa regionale per il credito alle imprese artigiane siciliane), che agevola gli investimenti delle imprese artigiane abbattendo i costi di finanziamenti bancari, leasing e microcredito, con contributi a fondo perduto. La misura è stata rifinanziata e la piattaforma riaperta il 27 ottobre 2026.'] },
                { t: 'Beneficiari', p: ['Imprese artigiane attive, con sede operativa in Sicilia, iscritte all\'Albo delle imprese artigiane, che abbiano stipulato finanziamenti con banche, leasing finanziario, finanziamenti con intermediari ex art. 106 TUB o con operatori del microcredito. I contratti devono essere di almeno 5.000 euro, con ammortamento minimo di 12 mesi.'] },
                { t: 'Importi e forme di agevolazione', p: ['Dotazione complessiva di oltre 100 milioni di euro. Quattro forme:'], l: [
                    'contributo in conto interessi pari al 60% del tasso di riferimento (80% se il finanziamento è garantito da un Confidi);',
                    'contributo in conto canoni per i leasing, con la stessa riduzione della quota interessi;',
                    'contributo in conto capitale: 35% a fondo perduto del costo totale se l\'investimento è finanziato per almeno l\'80%, altrimenti sulla sola parte finanziata;',
                    'contributo in conto esercizio: 20% della spesa per scorte di materie prime e prodotti finiti, fino a 200.000 euro.'
                ] },
                { t: 'Spese ammissibili', p: ['Al netto delle imposte: terreno per costruzione o ampliamento (entro il 10-15% della spesa); acquisto, costruzione, ristrutturazione e ammodernamento di fabbricati; macchine, attrezzature e impianti, compresi i sistemi informatici; autoveicoli destinati esclusivamente all\'attività; software, brevetti, licenze, siti web, studi e progettazione; scorte di materie prime e prodotti finiti fino a 200.000 euro.'] },
                { t: 'Come e quando presentare domanda', p: ['Esclusivamente online sulla piattaforma dedicata "Più Artigianato". Procedura valutativa a sportello, gestita dalla CRIAS, fino a esaurimento delle risorse.'] }
            ],
            pdf: 'sicilia-piu-artigianato.pdf',
            aggiornata: '2026-11-15'
        },
        {
            id: 'toscana-internazionalizzazione',
            titolo: 'Sostegno all\'internazionalizzazione delle imprese toscane',
            ente: 'Regione Toscana · PR FESR 2021-2027',
            regione: 'Toscana',
            tipologie: ['fondo-perduto'],
            finalita: ['export'],
            beneficiari: 'MPMI, professionisti e aggregazioni con sede in Toscana',
            importo: 'Fino al 50% delle spese, progetti da 10.000 a 1 milione €',
            sintesi: 'Contributo a fondo perduto per progetti di internazionalizzazione verso Paesi extra-UE: consulenza, fiere, uffici all\'estero, servizi promozionali.',
            apertura: '2026-11-18',
            chiusura: '2026-12-18',
            scadenza: 'Domande dal 18 novembre al 18 dicembre 2026, ore 16:00',
            procedura: 'graduatoria',
            sezioni: [
                { t: 'Cos\'è', p: ['È un contributo a fondo perduto della Regione Toscana, nell\'ambito del PR FESR 2021-2027 (Azione 1.3.1 "Sostegno alle PMI export"), che sostiene progetti di internazionalizzazione verso Paesi extra-UE, con priorità ai mercati emergenti strategici per il Made in Italy. Rientra nel progetto Giovanisì, con premialità per imprese giovanili e assunzioni di giovani a tempo indeterminato.'] },
                { t: 'Beneficiari', p: ['MPMI, professionisti, forme associative con personalità giuridica e forme associative senza personalità giuridica di almeno 3 imprese o professionisti, con sede legale o unità locale in Toscana, nei settori manifatturiero, turismo e commercio (nei limiti dei codici ATECO ammessi). È ammessa la partecipazione aggregata: consorzi, reti-soggetto, RTI/ATS.'] },
                { t: 'Importi', p: ['Dotazione complessiva: 15.099.012,74 euro, di cui 1.500.000 euro riservati alla Moda e circa 1.490.000 euro a Turismo e Commercio. Il contributo copre fino al 50% delle spese ammissibili. Dimensione del progetto:'], l: [
                    'micro imprese: da 10.000 a 150.000 euro;',
                    'piccole imprese: da 12.500 a 150.000 euro;',
                    'medie imprese: da 20.000 a 150.000 euro;',
                    'consorzi e reti-soggetto: da 35.000 a 400.000 euro;',
                    'aggregazioni di almeno 3 soggetti: fino a 1.000.000 di euro.'
                ] },
                { t: 'Spese ammissibili', p: ['Almeno il 60% del progetto deve riguardare servizi specifici per l\'internazionalizzazione: consulenza specialistica (anche Temporary Export Manager), fiere e saloni internazionali, uffici o sale espositive all\'estero (solo in de minimis), servizi promozionali, innovazione commerciale per nuovi mercati. Fino al 25% può andare a servizi integrativi: digitalizzazione, proprietà intellettuale, sostenibilità. I progetti si concludono entro 9 mesi dalla concessione, prorogabili fino a 12.'] },
                { t: 'Come e quando presentare domanda', p: ['Esclusivamente online sul Sistema Fondi Toscana (sft.sviluppo.toscana.it). Finestra: dal 18 novembre 2026 alle 10:00 al 18 dicembre 2026 alle 16:00. Procedura a graduatoria, non click day: i progetti sono ordinati per punteggio, con soglia minima di 14 punti che non garantisce il finanziamento.'] }
            ],
            pdf: 'toscana-internazionalizzazione.pdf',
            aggiornata: '2026-11-15'
        },
        {
            id: 'veneto-fondo-competitivita-start-up',
            titolo: 'Fondo Veneto Competitività - sezione Start up',
            ente: 'Regione Veneto · PR Veneto FESR 2021-2027',
            regione: 'Veneto',
            tipologie: ['finanziamento', 'fondo-perduto'],
            finalita: ['startup', 'investimenti'],
            beneficiari: 'PMI e lavoratori autonomi veneti attivi da non oltre tre anni',
            importo: 'Da 20.000 a 150.000 € a tasso zero, con quota convertibile a fondo perduto',
            sintesi: 'Finanziamento a tasso zero, senza garanzie, per avviare e consolidare nuove imprese nei settori manifatturiero, servizi e commercio; dopo 36 mesi una quota può diventare fondo perduto.',
            scadenza: 'Sportello aperto',
            procedura: 'sportello',
            sezioni: [
                { t: 'Cos\'è', p: ['È uno strumento finanziario della Regione Veneto, nell\'ambito del PR Veneto FESR 2021-2027 (Azione 1.3.5), che sostiene l\'avvio e il consolidamento di nuove iniziative imprenditoriali nei settori manifatturiero, servizi e commercio, su progetti legati a innovazione, digitalizzazione e sviluppo sostenibile.'] },
                { t: 'Beneficiari', p: ['Linea A: PMI e lavoratori autonomi con sede operativa in Veneto, attivi da non oltre tre anni. Linea B: PMI, attive da non oltre tre anni, selezionate da Soggetti Qualificati (Competence Center, Centri di Trasferimento Tecnologico, incubatori certificati) dopo un percorso di formazione e accompagnamento.', 'Servono iscrizione al Registro delle imprese (anche come impresa inattiva) o partita IVA attiva con domicilio fiscale in Veneto, regolarità contributiva e un codice ATECO primario tra quelli ammessi.'] },
                { t: 'Importi e forma dell\'agevolazione', p: ['Dotazione: 14.000.000 di euro, metà per linea. Finanziamento a tasso zero con provvista interamente pubblica, fino al 100% dell\'investimento ammissibile e senza garanzie, con ammortamento da 36 a 84 mesi. Importi: da 20.000 a 75.000 euro per la Linea A, da 20.000 a 150.000 euro per la Linea B.', 'Dopo 36 mesi dall\'erogazione, se l\'impresa è in regola, una quota del finanziamento può essere convertita in sovvenzione a fondo perduto: 15% fisso per le piccole imprese e 10% per le medie, più una quota variabile fino al 25% legata a criteri premiali.'] },
                { t: 'Spese ammissibili', p: ['Macchinari, impianti produttivi, hardware, attrezzature tecnologiche e arredi; software, licenze d\'uso, siti web ed e-commerce; marchi, brevetti, licenze e know-how; certificazioni di sistema o di prodotto; opere murarie e impiantistica (entro il 20%); marketing e web marketing (entro il 10%).'] }
            ],
            pdf: 'veneto-fondo-competitivita-start-up.pdf',
            aggiornata: '2026-11-15'
        },
        {
            id: 'veneto-distretti-del-commercio',
            titolo: 'Competitività del sistema commerciale e distretti del commercio',
            ente: 'Regione Veneto · PR Veneto FESR 2021-2027',
            regione: 'Veneto',
            tipologie: ['fondo-perduto'],
            finalita: ['commercio-artigianato', 'digitale'],
            beneficiari: 'Aggregazioni di almeno 3 PMI dello stesso Distretto del commercio',
            importo: 'Fino a 150.000 € per progetto',
            sintesi: 'Contributo a fondo perduto per progetti di rigenerazione urbana e rilancio nei Distretti del commercio: innovazione dell\'offerta, digitalizzazione, ammodernamento dei negozi.',
            apertura: '2026-09-22',
            chiusura: '2027-01-12',
            scadenza: 'Domande fino al 12 gennaio 2027, ore 12:00',
            sezioni: [
                { t: 'Cos\'è', p: ['È un contributo a fondo perduto della Regione Veneto, nell\'ambito del PR Veneto FESR 2021-2027 (Azione 1.3.7), che sostiene progetti di rigenerazione urbana e ripresa economica nei Distretti del commercio riconosciuti, attraverso forme aggregative di PMI.'] },
                { t: 'Beneficiari', p: ['PMI del commercio, della somministrazione di alimenti e bevande e dei servizi, appartenenti a un Distretto del commercio riconosciuto ai sensi della L.R. n. 50/2012 (con esclusione di alcuni codici ATECO). L\'aggregazione deve contare almeno 3 imprese dello stesso Distretto, più un Promotore sottoscrittore dell\'Accordo operativo, che presenta la domanda.'] },
                { t: 'Importi', p: ['Contributo massimo per progetto: 150.000 euro, su una spesa massima ammissibile di 270.000 euro. Intensità: 50% per lo sviluppo dell\'offerta commerciale delle imprese, 100% per la valorizzazione del Distretto. Ogni impresa sostiene al massimo il 50% della spesa ammessa, con un investimento minimo di 15.000 euro. Una sola domanda per Distretto.'] },
                { t: 'Interventi ammissibili', p: ['Innovazione dell\'offerta commerciale, digitalizzazione, ammodernamento di attrezzature e impianti, macchinari, hardware, software, arredi, siti web e piattaforme e-commerce; interventi edilizi e impiantistici funzionali all\'attività; azioni collettive di promozione e animazione del Distretto. Il progetto deve essere concluso e operativo entro il 3 ottobre 2028.'] },
                { t: 'Come e quando presentare domanda', p: ['Esclusivamente online sul sistema Fondi.RVE della Regione Veneto, a cura del Promotore. Finestra: dal 22 settembre 2026 alle 10:00 al 12 gennaio 2027 alle 12:00.'] }
            ],
            pdf: 'veneto-distretti-del-commercio.pdf',
            aggiornata: '2026-11-15'
        }
    ];

    window.NGB_BANDI = { TIPOLOGIE: TIPOLOGIE, FINALITA: FINALITA, BANDI: BANDI };
})();
