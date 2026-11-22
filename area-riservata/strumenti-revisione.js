/* =========================================================
   STRUMENTI DI REVISIONE (area riservata)
   ------------------------------------------------------------
   Il piano di revisione per anno (anni[]: 2026 compilato, gli anni
   successivi vuoti finche' il piano non e' pronto). Ogni riga del piano
   rimanda a un'attivita' (attivita{}): descrizione per il team, carta di
   lavoro trascritta passo per passo (carte{}) e documenti (allegati{}).
   scheda: assente = la scheda dell'attivita' si apre; "disattiva" = il
   pulsante «Apri» c'e' ma non si clicca; "chiusa" = niente pulsante, al
   suo posto l'etichetta breve (etichetta) e, in nota, l'avviso (il perche').

   I documenti collegati nelle carte sono in
   strumenti-revisione/allegati/ (copiati da Drive il 21/11/2026);
   il testo dei documenti Word brevi sta in strumenti-revisione/testi.json
   e si carica solo quando qualcuno apre "Leggi".

   Per cambiare un passo basta modificare il testo qui sotto. Per
   aggiungere un documento: copiarlo nella cartella degli allegati,
   aggiungerlo in "allegati" e citarlo nel passo con { a: 'nome-file', et: 'Etichetta' }.
   Collegamento esterno: { l: 'https://...', et: 'Etichetta', tipo: 'modulo' | 'drive' | 'web' }.
   { p: 'pec', et: 'Etichetta' } apre le circolarizzazioni via PEC dell'area riservata.
   I PDF «Stampa tutto» (scheda + documenti di ogni attivita' aperta) li
   prepara scripts/strumenti-revisione/fascicoli.py, che aggiunge in fondo
   a questo file la riga «fascicoli»: va rilanciato dopo ogni modifica.
   Il file lo carica app.js solo quando si apre la sezione: dopo ogni
   modifica cambiare SR_DATI_VERSIONE in app.js (e la ?v= di app.js in index.html).
========================================================= */
window.RV_STRUMENTI_REVISIONE = {
 "aggiornato": "2026-11-22",
 "fasi": {
  "interim": "Fase interim",
  "final": "Fase final",
  "newsletter": "Newsletter",
  "giudizio": "Giudizio di revisione"
 },
 "anni": [
  {
   "anno": 2026,
   "piano": [
    {
     "fase": "interim",
     "attivita": "accettazione",
     "nome": "Accettazione/mantenimento incarico",
     "inizio": "2026-04-01",
     "fine": "2026-09-30",
     "scheda": "chiusa",
     "etichetta": "Da elaborare per il 2027",
     "avviso": "La scheda sarà elaborata direttamente per il piano di revisione 2027."
    },
    {
     "fase": "interim",
     "attivita": "revisoreUscente",
     "nome": "Scambio informazioni revisore uscente",
     "inizio": "2026-04-01",
     "fine": "2026-09-30",
     "scheda": "chiusa",
     "etichetta": "Da elaborare per il 2027",
     "avviso": "La scheda sarà elaborata direttamente per il piano di revisione 2027."
    },
    {
     "fase": "interim",
     "attivita": "pianificazione",
     "nome": "Pianificazione e identificazione del rischio",
     "inizio": "2026-07-01",
     "fine": "2026-09-30",
     "scheda": "chiusa",
     "etichetta": "Da elaborare per il 2027",
     "avviso": "La scheda sarà elaborata direttamente per il piano di revisione 2027."
    },
    {
     "fase": "interim",
     "attivita": "strategia",
     "nome": "Strategia di audit e piano di revisione",
     "inizio": "2026-09-01",
     "fine": "2026-11-30",
     "scheda": "chiusa",
     "etichetta": "Da elaborare per il 2027",
     "avviso": "La scheda sarà elaborata direttamente per il piano di revisione 2027."
    },
    {
     "fase": "interim",
     "attivita": "modelloIva",
     "nome": "Modello IVA",
     "inizio": "2026-03-16",
     "fine": "2026-05-16",
     "scheda": "chiusa",
     "etichetta": "Da elaborare per il 2027",
     "avviso": "La scheda sarà elaborata direttamente per il piano di revisione 2027."
    },
    {
     "fase": "interim",
     "attivita": "redditi",
     "nome": "Modello Redditi/IRAP/CNM/770",
     "inizio": "2026-09-01",
     "fine": "2026-10-31",
     "scheda": "chiusa",
     "etichetta": "Da elaborare per il 2027",
     "avviso": "La scheda sarà elaborata direttamente per il piano di revisione 2027."
    },
    {
     "fase": "interim",
     "attivita": "trimestrali",
     "nome": "Verifica 1° trimestre",
     "inizio": "2026-03-20",
     "fine": "2026-05-16",
     "scheda": "chiusa",
     "etichetta": "Da elaborare per il 2027",
     "avviso": "La scheda sarà elaborata direttamente per il piano di revisione 2027."
    },
    {
     "fase": "interim",
     "attivita": "trimestrali",
     "nome": "Verifica 2° trimestre",
     "inizio": "2026-06-20",
     "fine": "2026-08-10",
     "scheda": "chiusa",
     "etichetta": "Da elaborare per il 2027",
     "avviso": "La scheda sarà elaborata direttamente per il piano di revisione 2027."
    },
    {
     "fase": "interim",
     "attivita": "trimestrali",
     "nome": "Verifica 3° trimestre",
     "inizio": "2026-09-16",
     "fine": "2026-11-16",
     "scheda": "chiusa",
     "etichetta": "Da elaborare per il 2027",
     "avviso": "La scheda sarà elaborata direttamente per il piano di revisione 2027."
    },
    {
     "fase": "interim",
     "attivita": "trimestrali",
     "nome": "Verifica 4° trimestre",
     "inizio": "2026-12-20",
     "fine": "2027-02-16",
     "scheda": "chiusa",
     "etichetta": "Da elaborare per il 2027",
     "avviso": "La scheda sarà elaborata direttamente per il piano di revisione 2027."
    },
    {
     "fase": "final",
     "attivita": "inventario",
     "nome": "Inventario magazzino",
     "inizio": "2026-12-27",
     "fine": "2027-01-16",
     "scheda": "disattiva"
    },
    {
     "fase": "final",
     "attivita": "circObbligatorie",
     "nome": "Circolarizzazioni obbligatorie",
     "inizio": "2027-01-07",
     "fine": "2027-01-31"
    },
    {
     "fase": "final",
     "attivita": "cespiti",
     "nome": "Verifica cespiti",
     "inizio": "2027-02-10",
     "fine": "2027-02-28",
     "scheda": "disattiva"
    },
    {
     "fase": "final",
     "attivita": "circClientiFornitori",
     "nome": "Circolarizzazione clienti & fornitori",
     "inizio": "2027-01-16",
     "fine": "2027-02-28"
    },
    {
     "fase": "newsletter",
     "attivita": "dichiarazioni",
     "nome": "Sottoscrizione dichiarazioni fiscali 2026 (2025)",
     "inizio": "2026-02-13",
     "fine": "2026-02-28",
     "scheda": "chiusa",
     "etichetta": "Da elaborare per il 2027",
     "avviso": "La scheda sarà elaborata direttamente per il piano di revisione 2027."
    },
    {
     "fase": "final",
     "attivita": "bilancio",
     "nome": "Verifiche bilancio 120/180 gg",
     "inizio": "2027-03-01",
     "fine": "2027-04-10",
     "scheda": "disattiva"
    },
    {
     "fase": "giudizio",
     "attivita": "qualita",
     "nome": "Richiesta controllo di qualità",
     "inizio": "2027-03-16",
     "fine": "2027-06-01",
     "scheda": "disattiva"
    }
   ]
  },
  {
   "anno": 2027,
   "piano": []
  },
  {
   "anno": 2028,
   "piano": []
  }
 ],
 "attivita": {
  "accettazione": {
   "titolo": "Accettazione e mantenimento dell'incarico",
   "carta": "indipendenza",
   "sintesi": "Ogni anno, prima di proseguire con un incarico (o all'avvio di uno nuovo), si verifica di poterlo mantenere: si identifica e si verifica il cliente ai fini antiriciclaggio (adeguata verifica), si aggiorna l'informativa privacy e Revilaw conferma la propria indipendenza con un'attestazione firmata dal socio responsabile, che viene comunicata al cliente.",
   "come": [
    "Lettera di incarico: per elaborarla rivolgersi agli equity partner.",
    "Inviare al cliente l'email di aggiornamento annuale con la scheda di identificazione, gli allegati privacy e il modulo per indicare l'indirizzo email amministrativo.",
    "Controllare la visura camerale aggiornata e che la documentazione di adeguata verifica sia completa.",
    "In Revisoft creare la sessione dell'anno e completare la carta AREA 1.REV.3 (riesame dell'incarico).",
    "Predisporre l'attestazione di indipendenza, farla firmare dal socio responsabile (Pier Luigi Sterzi), allegarla nella carta 1.REV.3 e inviarla al cliente.",
    "Se cambia il responsabile dell'incarico, formalizzarlo con l'addendum alla lettera di incarico."
   ],
   "agliAtti": "Carta AREA 1.REV.3 completata con l'attestazione di indipendenza allegata; documentazione di adeguata verifica e privacy acquisita.",
   "attenzione": "L'attestazione di indipendenza può partire separatamente dall'email di adeguata verifica, ma solo dopo aver completato la carta 1.REV.3, verificato visura e adeguata verifica e ottenuto la firma del socio responsabile.",
   "riferimenti": [
    "D.Lgs. 231/2007 (adeguata verifica antiriciclaggio)",
    "Norme di revisione e Codice deontologico sull'indipendenza"
   ]
  },
  "revisoreUscente": {
   "titolo": "Scambio di informazioni con il revisore uscente",
   "carta": "revisoreUscente",
   "sintesi": "Quando Revilaw subentra a un altro revisore, il team chiede al revisore uscente l'accesso alle informazioni sull'ultima revisione: carte di lavoro, procedure svolte, rischi identificati, rettifiche e giudizio espresso. Lo prevede l'art. 9-bis, comma 5, del D.Lgs. 39/2010 e serve a pianificare il nuovo incarico e a verificare i saldi di apertura.",
   "come": [
    "Lo scambio avviene solo dopo il conferimento formale dell'incarico; di norma le carte si consultano dopo che il revisore uscente ha concluso e archiviato la sua revisione.",
    "Informare la società e ottenere il suo consenso scritto.",
    "Chiedere per iscritto l'accesso al revisore uscente e concordare le modalità di consultazione; il revisore entrante sottoscrive un impegno di riservatezza.",
    "Usare le informazioni solo per la pianificazione e per gli elementi probativi iniziali: niente commenti sulla qualità del lavoro del predecessore.",
    "Se il revisore uscente non ha più le carte di lavoro, raccogliere informazioni verbali e documentarle in dettaglio."
   ],
   "agliAtti": "Nel fascicolo: consenso della società, lettera al revisore uscente con la sua risposta ed eventuali note interne sulle informazioni ricevute.",
   "attenzione": "I modelli di lettera sono quelli allegati al Documento di ricerca Assirevi n. 212, da adattare al caso.",
   "riferimenti": [
    "Art. 9-bis, c. 5, D.Lgs. 39/2010",
    "ISA Italia 300, 510 e 230",
    "SA Italia 250B",
    "Assirevi, Documento di ricerca n. 212"
   ]
  },
  "pianificazione": {
   "titolo": "Pianificazione e identificazione del rischio",
   "carta": null,
   "sintesi": "È la fase in cui il team conosce l'impresa e il suo contesto, valuta i rischi di errori significativi in bilancio e fissa la materialità su cui si costruiscono tutti i controlli. Nel piano di revisione non c'è una carta di lavoro dedicata: le indicazioni operative stanno nei documenti delle altre carte, raccolti qui sotto.",
   "come": [
    "Incontrare l'azienda per completare l'analisi del rischio e i questionari di conoscenza dell'azienda (acquisti, vendite, personale, area finanziaria, amministrazione, magazzino, IT, legale), con la richiesta documentale iniziale.",
    "Calcolare in Revisoft la materialità pianificata (carta 2.11.1 o 2.11.3); importato il bilancio nella carta 3.1.1 compare anche la materialità di bilancio.",
    "Definire il rischio di individuazione nella carta 2.10.1: è quello che le carte «Pianificazione» dell'area 3 riprendono per ogni voce."
   ],
   "agliAtti": "Questionari di conoscenza dell'azienda, valutazione del rischio e materialità documentati nelle carte Revisoft delle aree 1 e 2.",
   "riferimenti": [
    "ISA Italia 300 (pianificazione)",
    "ISA Italia 315 (identificazione e valutazione dei rischi)",
    "ISA Italia 320 (significatività)"
   ],
   "documentiUtili": [
    {
     "a": "email-richiesta-del-primo-incontro-nuovo-incarico",
     "et": "Email del primo incontro"
    },
    {
     "a": "pacchetto-kickoff",
     "et": "Pacchetto Kickoff"
    },
    {
     "a": "materialita-di-bilancio",
     "et": "Materialità di bilancio"
    },
    {
     "a": "carte-di-lavoro-pianificazione-e-controllo",
     "et": "Carte «Pianificazione» e «Controllo»"
    }
   ]
  },
  "strategia": {
   "titolo": "Strategia di audit e piano di revisione",
   "carta": null,
   "sintesi": "Valutati i rischi, il team decide la strategia generale e il piano dettagliato: quali controlli svolgere su ogni voce di bilancio, con quale estensione e in quali momenti dell'anno (verifiche periodiche, inventario, circolarizzazioni, cespiti, verifiche di bilancio). Nel piano di revisione non c'è una carta di lavoro dedicata: qui sotto i documenti delle altre carte che la riguardano.",
   "come": [
    "Compilare le carte «Pianificazione» dell'area 3 per ogni voce presente in bilancio (N/A solo se la voce non esiste).",
    "Anche sotto l'errore trascurabile pianificare sempre tre controlli: coerenza di saldi e variazioni, analisi comparativa con l'esercizio precedente, classificazione e informativa in nota integrativa (e coerenza con la relazione sulla gestione).",
    "I controlli ulteriori sono da svolgere se la voce supera la materialità di bilancio o, pur restando sotto, varia in modo rilevante rispetto all'anno prima.",
    "Verificare che materialità operativa ed errore trascurabile siano quelli della materialità di bilancio e scegliere l'R-factor (motivando la scelta se diversa da quella proposta).",
    "Fissare in calendario le verifiche periodiche dell'area 4 secondo il ciclo previsto per ciascun libro e registro."
   ],
   "agliAtti": "Carte «Pianificazione» dell'area 3 compilate, con il programma di lavoro di ciascuna voce.",
   "riferimenti": [
    "ISA Italia 300 (pianificazione)",
    "ISA Italia 330 (risposte ai rischi identificati e valutati)"
   ],
   "documentiUtili": [
    {
     "a": "carte-di-lavoro-pianificazione-e-controllo",
     "et": "Carte «Pianificazione» e «Controllo»"
    },
    {
     "a": "materialita-di-bilancio",
     "et": "Materialità di bilancio"
    },
    {
     "a": "ciclo-delle-verifiche-periodiche-area-4",
     "et": "Ciclo delle verifiche periodiche"
    }
   ]
  },
  "modelloIva": {
   "titolo": "Modello IVA",
   "carta": "modelloIva",
   "sintesi": "La dichiarazione IVA non va firmata dal revisore: nel frontespizio non si indicano i codici fiscali di Revilaw né del responsabile della revisione. L'attività serve a ricordarlo al cliente e a gestire l'unica eccezione, la richiesta di sottoscrizione per utilizzare il credito IVA.",
   "come": [
    "Ricordare al cliente quali dichiarazioni richiedono la firma del revisore (Redditi SC, IRAP, 770, CNM) e che la dichiarazione IVA non la richiede.",
    "Se il cliente chiede la sottoscrizione per utilizzare il credito IVA in dichiarazione, avvisare il responsabile della qualità, che valuta l'eventuale compenso."
   ],
   "documentiUtili": [
    {
     "a": "email-aggiornamenti-sulle-dichiarazioni-fiscali-2026-e-ruolo-della-socie",
     "et": "Email ai clienti sulle dichiarazioni da firmare"
    }
   ]
  },
  "redditi": {
   "titolo": "Modello Redditi, IRAP, CNM e 770",
   "carta": "redditi",
   "sintesi": "Nelle società sottoposte a revisione, le dichiarazioni Redditi, IRAP, CNM e 770 sono firmate anche da chi firma la relazione di revisione (art. 1, c. 5, D.P.R. 322/1998). La firma non è un giudizio sulla correttezza fiscale, che resta responsabilità degli organi sociali: i controlli sono quelli legati alla revisione del bilancio, indicati dal Documento di ricerca Assirevi n. 208R/2020.",
   "come": [
    "Redditi, IRAP e CNM: riscontrare i dati della dichiarazione con le scritture contabili e analizzare il prospetto di raccordo civilistico-fiscale solo per la continuità dei valori con l'esercizio precedente.",
    "770: riscontrare i dati con le scritture contabili e, a campione, i sostituiti a cui sono state applicate le ritenute con quanto risulta in contabilità.",
    "Prima della firma ottenere dagli amministratori la lettera di attestazione sulle dichiarazioni.",
    "Se la società aderisce al Concordato preventivo biennale: delibera dell'assemblea (necessaria per le S.r.l. trasparenti), delibera dell'organo amministrativo e attestazione dell'organo amministrativo.",
    "A controlli finiti e con le ricevute di invio telematico, mandare tutta la documentazione una sola volta con il modulo; per la firma di Pier Luigi Sterzi rivolgersi al responsabile qualità."
   ],
   "agliAtti": "Revisoft area 3 dell'anno del bilancio: carta 3.98 con la descrizione dei controlli nella sezione «Memo»; area 4 dell'anno in corso: carta 4.5 (adempimenti imposte dirette).",
   "attenzione": "La firma si può apporre solo dopo il rilascio del giudizio sul bilancio. Riguarda gli incarichi in carica nell'anno del bilancio: per gli incarichi iniziati nell'anno successivo la prima sottoscrizione arriva l'anno dopo. Scadenza: 31 ottobre.",
   "riferimenti": [
    "Art. 1, c. 5, D.P.R. 322/1998",
    "Assirevi, Documento di ricerca n. 208R/2020",
    "D.Lgs. 81/2025 (novità sul CPB)"
   ]
  },
  "trimestrali": {
   "titolo": "Verifiche trimestrali",
   "carta": "trimestrali",
   "sintesi": "Durante l'esercizio, ogni trimestre, il revisore verifica la regolare tenuta della contabilità e, dopo il Correttivo-ter del Codice della crisi (D.Lgs. 136/2024), controlla anche che non emergano i segnali di crisi e di insolvenza dell'art. 3, comma 4, CCII: se ci sono, li deve segnalare per iscritto all'organo amministrativo.",
   "come": [
    "Con un cliente nuovo: email per il primo incontro con la richiesta documentale e l'attestazione delle polizze, poi invio dell'attestazione di indipendenza firmata.",
    "Entro la fine di ogni trimestre: email di richiesta dell'incontro e dei documenti (bilancio di verifica, DURC, carichi pendenti, Centrale Rischi, debiti scaduti).",
    "Entro 15 giorni dalla fine del trimestre la società consegna il bilancio di verifica comparato con lo stesso trimestre dell'anno prima, con il verbale di consegna; si importa nella carta 4.12.",
    "Svolgere il test sui segnali di crisi e allegarlo, con i documenti, nella carta 4.12.12 del trimestre.",
    "Se emergono segnali, o la società non fornisce le informazioni, coinvolgere il responsabile qualità; la segnalazione parte dalla PEC di Revilaw entro 60 giorni e gli amministratori rispondono entro 30 giorni."
   ],
   "agliAtti": "Carte dell'area 4 del trimestre (4.12 con il bilancio comparato, 4.12.12 con test e documenti) e verbale di consegna del bilancio.",
   "attenzione": "Le informazioni delle verifiche periodiche sono più limitate di quelle di fine revisione: la segnalazione si basa sugli indicatori del test, discussi prima con gli amministratori.",
   "riferimenti": [
    "SA Italia 250B",
    "Art. 3, c. 4, e art. 25-octies CCII",
    "D.Lgs. 136/2024 (Correttivo-ter)",
    "Assirevi, Documento di ricerca n. 259"
   ],
   "documentiUtili": [
    {
     "a": "ciclo-delle-verifiche-periodiche-area-4",
     "et": "Ciclo delle verifiche periodiche (area 4)"
    }
   ]
  },
  "inventario": {
   "titolo": "Inventario di magazzino",
   "carta": "inventario",
   "sintesi": "Il revisore assiste alla conta fisica di fine anno organizzata dalla società e poi svolge le proprie verifiche sulle rimanenze: campione della conta, confronto con la contabilità, valorizzazione (price test), prodotti a lento rigiro (slow moving) e competenza dei movimenti (cut-off).",
   "come": [
    "Prima della conta: email con le istruzioni (fermo produzione, squadre di conta, tabulati ciechi, merci di terzi e beni obsoleti) e i quattro allegati; sollecitare date, procedura, planimetrie ed eventuale perizia.",
    "Chiedere se ci sono merci presso terzi ed eventualmente circolarizzare il depositario.",
    "Durante la conta: partecipare, verificare i tabulati ciechi, la merce obsoleta e le merci di terzi.",
    "Dopo la conta: attestazione, valorizzazione in Excel e bilancio di verifica; campionamento statistico in Revisoft, verifica del campione con DDT e fatture, test slow moving, price test e cut-off.",
    "Segnalare all'azienda errori sopra l'errore trascurabile e merce obsoleta; registrare le anomalie non corrette in «Errori rilevati»; redigere il verbale e inviare il modulo per i controlli di qualità."
   ],
   "agliAtti": "Carta 3.4.4 con tutti i documenti (nomi dei file corretti), la descrizione dei controlli nelle memo e l'elenco degli allegati.",
   "attenzione": "Se l'inventario si fa entro il 31/12 servono le bolle in entrata e in uscita di subito prima e subito dopo la conta; se si fa a inizio gennaio, la società manda entro fine gennaio le bolle dal 31/12 fino al giorno dell'inventario.",
   "riferimenti": [
    "ISA Italia 501 (rimanenze)",
    "ISA Italia 530 (campionamento)"
   ]
  },
  "circObbligatorie": {
   "titolo": "Circolarizzazioni obbligatorie",
   "carta": "circObbligatorie",
   "sintesi": "Sono le conferme esterne chieste direttamente a banche, enti finanziatori, amministrazione postale, società di leasing e di factoring, compagnie assicurative, consulenti (del lavoro, fiscali, legali), depositari di merci e parti correlate, per confermare saldi, garanzie, contenziosi e impegni al 31/12/2026. Si chiamano obbligatorie perché tutti i soggetti indicati nell'attestazione devono rispondere. Dal 2026 l'attestazione chiede anche tutte le carte prepagate della società, di qualsiasi emittente, e la lettera alle banche ne chiede conferma.",
   "come": [
    "Il cliente compila e firma l'attestazione 2026 con l'elenco dei soggetti e delle carte prepagate (o dichiara che non ce ne sono); se non indica legali, firma l'autocertificazione sui rischi legali.",
    "Il team prepara le lettere dai fac-simile 2026 (la data entro cui rispondere si scrive a mano); il cliente le stampa e le firma su carta intestata entro 5 giorni.",
    "Sui mastrini al 31/12/2026 si controlla che nell'attestazione ci siano tutti i soggetti e si verificano le PEC su INI-PEC.",
    "Le lettere firmate si inviano dall'area riservata (Circolarizzazioni via PEC): partono dalla PEC circolarizzazionirevilaw@pec.it con i solleciti già programmati, così il revisore controlla invio e risposte senza passare dalla società.",
    "Con la Centrale Rischi al 31/12/2026 si verificano fondo rischi, saldi dei conti correnti, debiti verso consulenti e informazioni in nota integrativa."
   ],
   "agliAtti": "Risposte allegate nelle carte Revisoft indicate qui sotto; report delle risposte del team nella carta 3.98.",
   "attenzione": "Per ogni carta prepagata indicata la società mette a disposizione l'estratto conto trimestrale e la riconciliazione dei movimenti, con chi usa la carta e la natura dei costi.",
   "riferimenti": [
    "ISA Italia 505 (conferme esterne)",
    "ISA Italia 501 (contenziosi)",
    "Assirevi, Documento di ricerca n. 187/2014 (uso della PEC)"
   ]
  },
  "cespiti": {
   "titolo": "Verifica dei cespiti",
   "carta": "cespiti",
   "sintesi": "Verifica delle immobilizzazioni materiali e immateriali: quadratura del libro cespiti con bilancio e contabilità, scelta del campione, test sul fondo e sulle quote di ammortamento, incrementi e decrementi dell'anno, verifica fisica e documentale dei beni.",
   "come": [
    "Chiedere al cliente il libro cespiti e la documentazione delle immobilizzazioni.",
    "Quadrare il totale del libro cespiti con il progetto di bilancio e con i mastrini.",
    "Calcolare la grandezza del campione: totale della voce diviso l'intervallo di campionamento (materialità / R-factor, carte 3.4.1 Ctrl e 3.4.2 Ctrl); per il campionamento ragionato seguire i parametri di selezione indicati.",
    "Svolgere il test overall del fondo, il ricalcolo delle quote e il test incrementi/decrementi.",
    "Verificare fisicamente i beni (foto, planimetrie per gli immobili), fatture e bonifici, eventuali crediti d'imposta (es. certificazione di interconnessione 4.0) e risconti; chiudere con il verbale."
   ],
   "agliAtti": "Test e documenti nelle carte delle immobilizzazioni (3.4.1 e 3.4.2) e verbale di verifica dei beni strumentali.",
   "riferimenti": [
    "ISA Italia 530 (campionamento)"
   ]
  },
  "circClientiFornitori": {
   "titolo": "Circolarizzazione di clienti e fornitori",
   "carta": "circClientiFornitori",
   "sintesi": "Conferme esterne dei saldi di clienti e fornitori scelti a campione: verificano l'esistenza dei crediti e la completezza dei debiti a fine esercizio. Per chi non risponde si svolgono procedure alternative.",
   "come": [
    "Chiedere le schede contabili e gli elenchi xls di clienti e fornitori, anche a saldo zero, che quadrino con il bilancio al 31/12.",
    "Importare gli elenchi in Revisoft (attenzione ai segni dei saldi) e campionare: 3.4.7 per i clienti, 3.4.17 per i fornitori.",
    "Chiedere le PEC dei campionati, preparare le lettere (ai clienti con l'estratto conto al 31/12) e farle firmare su carta intestata entro 5 giorni.",
    "Verificare le PEC su INI-PEC e inviare le lettere dall'area riservata (Circolarizzazioni via PEC), dalla casella circolarizzazionirevilaw@pec.it, con i solleciti già programmati.",
    "Seguire risposte e solleciti; per chi non risponde procedure alternative; controllare le fatture da emettere e ricevere e l'aging di crediti e debiti."
   ],
   "agliAtti": "Risposte nelle carte di campionamento 3.4.7 e 3.4.17; report del team nella 3.98; documenti probativi allegati in Revisoft.",
   "riferimenti": [
    "ISA Italia 505 (conferme esterne)",
    "ISA Italia 530 (campionamento)"
   ]
  },
  "dichiarazioni": {
   "titolo": "Sottoscrizione delle dichiarazioni fiscali",
   "carta": "dichiarazioni",
   "sintesi": "Comunicazione ai clienti, a inizio anno, su quali dichiarazioni il revisore deve firmare (Redditi SC, IRAP, 770 e CNM) e quale no (IVA), e su quali incarichi riguarda: quelli in carica nell'anno del bilancio. Per gli incarichi iniziati nell'anno in corso la prima firma arriva l'anno dopo.",
   "come": [
    "Inviare l'email ai clienti nel periodo indicato dal piano.",
    "I controlli e la firma delle dichiarazioni si svolgono poi con la carta «Modello Redditi, IRAP, CNM e 770»."
   ]
  },
  "bilancio": {
   "titolo": "Verifiche sul bilancio (120 o 180 giorni)",
   "carta": "bilancio",
   "sintesi": "È la fase finale sul progetto di bilancio: dalla ricezione del progetto approvato dall'organo amministrativo fino all'emissione della relazione di revisione. I tempi sono quelli dell'art. 2429 c.c.: il progetto arriva al revisore almeno 30 giorni prima dell'assemblea e la relazione resta depositata nei 15 giorni che la precedono.",
   "come": [
    "Inviare al cliente l'email sui termini: per approvare entro il 30 aprile il progetto va trasmesso entro il 30 marzo (per i 180 giorni, approvazione entro il 29 giugno e progetto entro il 29 maggio).",
    "Se il progetto non arriva in tempo: solleciti e rinuncia ai termini firmata da tutti i soci, da richiamare anche nel verbale di approvazione; nella relazione si commenta la data di emissione nel paragrafo «Altri aspetti».",
    "Per il rinvio a 180 giorni: verbale dell'organo amministrativo, condizioni statutarie e motivazioni in nota integrativa.",
    "Verificare tipologia di bilancio, compensi del revisore in nota integrativa e parti correlate (per i gruppi anche la circolarizzazione).",
    "Finite le verifiche si avvisa il responsabile qualità: nessuna relazione esce prima dei controlli di qualità; lettera di attestazione e relazione sono su format Revilaw."
   ],
   "agliAtti": "Carte di lavoro stampate con tutti gli allegati al momento del giudizio («congelate»): rinuncia ai termini e giudizio nella 3.95, parti correlate nella 3.5.1, lettera di attestazione nella 3.91.",
   "attenzione": "La lettera di attestazione si firma lo stesso giorno della relazione. La relazione esce almeno 15 giorni prima dell'assemblea in prima convocazione, oppure anche dopo se c'è la rinuncia ai termini di tutti i soci.",
   "riferimenti": [
    "Art. 2429 c.c.",
    "Art. 14 D.Lgs. 39/2010 (relazione di revisione)",
    "ISA Italia 550 (parti correlate)",
    "Assirevi, Documento di ricerca n. 251R (attestazioni della direzione)"
   ]
  },
  "qualita": {
   "titolo": "Richiesta del controllo di qualità",
   "carta": "qualita",
   "sintesi": "Prima di chiedere al responsabile qualità il controllo finale, da cui dipendono lettera di attestazione e giudizio, il team verifica che tutte le carte di lavoro Revisoft siano complete: controlli generici, avvio delle verifiche e carte di controllo di ogni voce di bilancio.",
   "come": [
    "Controlli generici: verifiche periodiche dell'area 4 alle quattro scadenze, import del progetto di bilancio, materialità, carte «Pianificazione» e «Controllo», errori di bilancio.",
    "Per ogni voce di bilancio le note di controllo dicono cosa verificare in pianificazione (materialità, rischio, R-factor, verifiche obbligatorie) e cosa allegare nella carta Ctrl.",
    "Parti correlate, fatti censurabili, eventi successivi, continuità aziendale, relazione sulla gestione e promemoria conclusivo si chiudono con i questionari Revisoft.",
    "Tutti gli errori, anche da campionamento e da riclassifica, vanno nella scheda «Errori rilevati» delle carte Ctrl, che alimenta il sommario degli errori.",
    "Lettera di attestazione e giudizio di revisione si chiedono al responsabile qualità."
   ],
   "agliAtti": "Tutte le carte delle aree 3 e 4 completate, con conclusioni, errori e allegati obbligatori.",
   "riferimenti": [
    "ISA Italia 570 (continuità aziendale)",
    "ISA Italia 550 (parti correlate)"
   ]
  }
 },
 "carte": {
  "indipendenza": {
   "titolo": "Check list indipendenza",
   "note": [
    "Lettera di incarico: non è tra i documenti di questa pagina. Per elaborarla rivolgersi agli equity partner."
   ],
   "blocchi": [
    {
     "titolo": "Adeguata verifica e privacy",
     "intro": "Ogni anno: identificazione e verifica del cliente ai fini antiriciclaggio e aggiornamento dell'informativa privacy.",
     "passi": [
      {
       "n": 1,
       "testo": "Memorandum",
       "doc": [
        {
         "a": "memorandum-verifica-annuale-di-adeguata-verifica-privacy-e-indipendenza",
         "et": "Memorandum"
        }
       ]
      },
      {
       "n": 2,
       "testo": "Email al cliente",
       "doc": [
        {
         "a": "email-aggiornamento-annuale-di-adeguata-verifica-e-privacy",
         "et": "Email"
        },
        {
         "a": "allegati-di-adeguata-verifica-privacy-e-raccolta-dati",
         "et": "Adeguata verifica, privacy e raccolta dati"
        },
        {
         "a": "dati-email-comunicazione-dell-indirizzo-email-amministrativo",
         "et": "Dati email"
        }
       ]
      }
     ]
    },
    {
     "titolo": "Indipendenza",
     "intro": "Ogni anno Revilaw conferma la propria indipendenza rispetto al cliente con una lettera firmata dal socio responsabile.",
     "passi": [
      {
       "n": 1,
       "testo": "Memorandum",
       "doc": [
        {
         "a": "memorandum-attestazione-di-indipendenza",
         "et": "Memorandum"
        }
       ]
      },
      {
       "n": 2,
       "testo": "Email al cliente",
       "doc": [
        {
         "a": "email-al-cliente-trasmissione-dell-attestazione-di-indipendenza",
         "et": "Email"
        },
        {
         "a": "attestazione-di-indipendenza-revilaw",
         "et": "Attestazione di indipendenza"
        },
        {
         "a": "addendum-alla-lettera-di-incarico-variazione-del-responsabile",
         "et": "Addendum variazione responsabile"
        }
       ]
      }
     ]
    }
   ]
  },
  "revisoreUscente": {
   "titolo": "Check list revisore uscente",
   "blocchi": [
    {
     "titolo": "",
     "passi": [
      {
       "n": 1,
       "testo": "Scambio di informazioni con il revisore uscente",
       "doc": [
        {
         "a": "memorandum-scambio-di-informazioni-con-il-revisore-uscente",
         "et": "Memorandum"
        },
        {
         "a": "allegato-1-assirevi-lettera-della-societa-conferente",
         "et": "Allegato 1 Assirevi"
        },
        {
         "a": "allegato-2-assirevi-lettera-al-revisore-entrante",
         "et": "Allegato 2 Assirevi"
        },
        {
         "a": "assirevi-documento-di-ricerca-n-212",
         "et": "Assirevi 212"
        }
       ]
      }
     ]
    }
   ]
  },
  "modelloIva": {
   "titolo": "Modello IVA",
   "note": [
    "Il modello IVA non deve essere firmato dal revisore: nel frontespizio non vanno quindi inseriti i codici fiscali di Revilaw e del responsabile della revisione.",
    "Solo se il cliente chiede la sottoscrizione per utilizzare il credito IVA in dichiarazione occorre avvisare il responsabile della qualità, che valuterà l'eventuale compenso."
   ],
   "blocchi": [
    {
     "titolo": "",
     "passi": [
      {
       "n": 1,
       "testo": "Indicazioni sul modello IVA",
       "doc": [
        {
         "a": "modello-iva-indicazioni-per-il-team",
         "et": "Indicazioni"
        }
       ]
      }
     ]
    }
   ]
  },
  "redditi": {
   "titolo": "Check list modello Redditi 2026 (2025)",
   "blocchi": [
    {
     "titolo": "Sottoscrizione delle dichiarazioni",
     "intro": "I controlli prima della firma e la lettera di attestazione degli amministratori.",
     "passi": [
      {
       "n": 1,
       "testo": "Memorandum sulla sottoscrizione della dichiarazione dei redditi",
       "doc": [
        {
         "a": "memorandum-sottoscrizione-delle-dichiarazioni-fiscali-2026-anno-d-impost",
         "et": "Memorandum"
        },
        {
         "a": "assirevi-documento-di-ricerca-n-208r-2020",
         "et": "Assirevi 208R/2020"
        },
        {
         "a": "check-controlli-documenti-ricevuti-per-la-sottoscrizione",
         "et": "Check controlli"
        },
        {
         "a": "dubbi-sul-quadro-ro-2026",
         "et": "Dubbi quadro RO"
        }
       ]
      },
      {
       "n": 2,
       "testo": "Email al cliente",
       "doc": [
        {
         "a": "email-al-cliente-trasmissione-dei-modelli-770-redditi-sc-irap-e-cnm-2026",
         "et": "Email"
        }
       ]
      },
      {
       "n": 3,
       "testo": "Attestazione",
       "doc": [
        {
         "a": "attestazione-sulle-dichiarazioni-2026-2025",
         "et": "Attestazione"
        }
       ]
      }
     ]
    },
    {
     "titolo": "Adesione al CPB",
     "intro": "Il Concordato preventivo biennale permette di concordare in anticipo con l'Agenzia delle Entrate redditi e valore della produzione da tassare. Per le S.r.l. trasparenti serve la delibera dei soci; nelle altre società decide l'organo amministrativo, ma è consigliato informare i soci.",
     "passi": [
      {
       "n": 1,
       "testo": "Memorandum",
       "doc": [
        {
         "a": "memorandum-concordato-preventivo-biennale-novita-2025-e-fac-simile-di-de",
         "et": "Memorandum"
        }
       ]
      },
      {
       "n": 2,
       "testo": "Delibera dell'assemblea dei soci (obbligatoria in caso di trasparenza)",
       "doc": [
        {
         "a": "verbale-di-assemblea-dei-soci-per-il-cpb-2026",
         "et": "Delibera assemblea"
        }
       ]
      },
      {
       "n": 3,
       "testo": "Delibera dell'organo amministrativo (obbligatoria)",
       "doc": [
        {
         "a": "verbale-di-delibera-dell-organo-amministrativo-per-il-cpb-2026",
         "et": "Delibera organo amministrativo"
        }
       ]
      },
      {
       "n": 4,
       "testo": "Attestazione CPB",
       "doc": [
        {
         "a": "attestazione-dell-organo-amministrativo-per-il-cpb-2026",
         "et": "Attestazione CPB"
        }
       ]
      }
     ]
    },
    {
     "titolo": "Modulo di invio delle dichiarazioni",
     "intro": "Il modulo si usa una sola volta, a controlli finiti e con le ricevute di invio telematico: gli invii parziali o con modelli di prova non valgono.",
     "passi": [
      {
       "n": 1,
       "testo": "Memorandum",
       "doc": [
        {
         "a": "memorandum-invio-della-documentazione-e-istruzioni-per-il-modulo-2026",
         "et": "Memorandum"
        }
       ]
      },
      {
       "n": 2,
       "testo": "Modulo di invio delle dichiarazioni",
       "doc": [
        {
         "l": "https://forms.gle/o4YeDu2pvBkJEU5g9",
         "et": "Modulo di invio delle dichiarazioni",
         "tipo": "modulo",
         "descrizione": "Il modulo con cui si inviano dichiarazioni, ricevute e attestazioni, una sola volta a controlli finiti."
        }
       ]
      }
     ]
    }
   ]
  },
  "trimestrali": {
   "titolo": "Check list verifiche trimestrali e segnalazione di crisi e insolvenza",
   "note": [
    "Non rientra nei compiti del revisore legale, in considerazione del suo ruolo, valutare l'adeguatezza delle azioni pianificate dagli amministratori in risposta allo stato di crisi o di insolvenza oggetto di segnalazione; il revisore legale, inoltre, non ha alcuno strumento per intervenire se gli amministratori non mettono in atto le iniziative programmate. Sulla scorta dei principi di revisione applicabili, potrà fare le proprie considerazioni su tali iniziative ai soli fini delle valutazioni per il giudizio professionale sul bilancio, nelle procedure svolte a tal fine.",
    "Se il revisore legale, nello scambio di informazioni con l'organo di controllo ai sensi dell'art. 2409-septies c.c., viene a sapere che quest'ultimo ha inviato la segnalazione, è raccomandabile che, previe le opportune verifiche e analisi, formalizzi anch'esso le proprie valutazioni, per inviare tempestivamente una propria segnalazione all'organo amministrativo."
   ],
   "blocchi": [
    {
     "titolo": "Procedura per il primo incontro con un nuovo cliente",
     "intro": "Solo per i clienti nuovi: il primo incontro serve a completare l'analisi del rischio e i questionari di conoscenza dell'azienda.",
     "passi": [
      {
       "n": 1,
       "testo": "Email da inviare per un nuovo incarico",
       "doc": [
        {
         "a": "email-richiesta-del-primo-incontro-nuovo-incarico",
         "et": "Email"
        },
        {
         "a": "allegato-attestazione-delle-polizze-assicurative",
         "et": "Allegato"
        }
       ]
      },
      {
       "n": 2,
       "testo": "Inviare l'attestazione di indipendenza firmata da Pier Luigi.",
       "doc": [
        {
         "a": "email-invio-dell-attestazione-di-indipendenza",
         "et": "Email"
        },
        {
         "a": "attestazione-di-indipendenza",
         "et": "Attestazione di indipendenza"
        }
       ],
       "nota": "Attenzione: l'attestazione va reinviata ogni anno, per la verifica dei bilanci successivi al primo."
      }
     ]
    },
    {
     "titolo": "Verifiche periodiche trimestrali e bilancio comparato da importare nella carta di lavoro 4.12",
     "intro": "Ogni trimestre, con il bilancio di verifica comparato fornito dalla società.",
     "passi": [
      {
       "n": 1,
       "testo": "Email da inviare entro la fine del trimestre che sarà oggetto di verifica.",
       "doc": [
        {
         "a": "email-richiesta-di-incontro-e-documenti-per-la-verifica-trimestrale",
         "et": "Email"
        },
        {
         "a": "bilancio-standard-comparato",
         "et": "Bilancio"
        }
       ]
      },
      {
       "n": 2,
       "testo": "Entro 15 giorni dalla fine del trimestre oggetto di verifica occorre ricevere il bilancio comparato con lo stesso trimestre dell'esercizio precedente. Redigere il verbale di consegna!",
       "doc": [
        {
         "a": "verbale-di-consegna-del-bilancio-trimestrale",
         "et": "Verbale di consegna del bilancio"
        }
       ],
       "nota": "Esempio: per verificare il 1° trimestre si invia l'email del punto 1 entro il 31 marzo e si deve ricevere dalla società il bilancio comparato del 1° trimestre entro il 15 aprile."
      }
     ]
    },
    {
     "titolo": "Analisi e segnalazione di situazioni di crisi e di insolvenza «in corso di esercizio» nelle procedure di revisione previste dal principio SA 250B",
     "intro": "I segnali da controllare sono quelli dell'art. 3, comma 4, CCII: debiti per retribuzioni, verso fornitori, verso banche e verso creditori pubblici qualificati scaduti oltre le soglie.",
     "passi": [
      {
       "n": 0,
       "testo": "Documenti utili da studiare per il revisore",
       "doc": [
        {
         "a": "segnalazioni-durante-le-verifiche-in-corso-di-esercizio-sa-250b",
         "et": "Segnalazioni durante le verifiche in corso di esercizio (SA 250B)"
        },
        {
         "a": "sintesi-del-documento-di-ricerca-assirevi-n-259",
         "et": "Sintesi del documento di ricerca 259"
        },
        {
         "a": "assirevi-documento-di-ricerca-n-259",
         "et": "Assirevi, documento di ricerca n. 259"
        }
       ],
       "nota": "Carta di lavoro Revisoft: allegare e rendicontare nella carta di lavoro 4.12.12 del trimestre oggetto di verifica."
      },
      {
       "n": 1,
       "testo": "Svolgere l'analisi sull'emersione dei segnali di crisi e di insolvenza di cui all'art. 3, comma 4, del CCII.",
       "doc": [
        {
         "a": "test-segnali-di-crisi-ex-art-3-c-4-ccii",
         "et": "Test"
        }
       ]
      },
      {
       "n": 2,
       "testo": "Se la società non è in grado di fornire al revisore legale le informazioni necessarie per individuare i segnali di crisi e di insolvenza, contattare il responsabile della qualità per informare l'organo di controllo, nell'ottica del reciproco scambio di informazioni."
      },
      {
       "n": 3,
       "testo": "Contattare il responsabile della qualità se emerge almeno un segnale di crisi e di insolvenza del CCII, oppure squilibri economici e/o finanziari diversi da quelli del test."
      },
      {
       "n": 4,
       "testo": "Discutere con l'organo amministrativo per acquisire elementi probativi sull'avvenuta risoluzione o sul superamento dei segnali di crisi e di insolvenza, o su specifici fatti e circostanze che facciano ritenere non dovuta la segnalazione.",
       "nota": "Tra gli elementi probativi idonei a escludere la segnalazione rientrano unicamente quelli di concreta attualità e messi tempestivamente a disposizione del revisore. Non vanno invece considerate le iniziative che gli amministratori abbiano in corso o intendano intraprendere per far fronte alla crisi o all'insolvenza nel momento in cui si riscontrano uno o più segnali dell'art. 3, comma 4, CCII: gli amministratori ne riferiranno nella risposta da inviare entro trenta giorni dalla ricezione della segnalazione (art. 25-octies CCII)."
      },
      {
       "n": 5,
       "testo": "Segnalare all'organo amministrativo (e per conoscenza all'organo di controllo), con la PEC di Revilaw, i segnali di crisi e di insolvenza entro 60 giorni da quando il revisore ne ha conoscenza nell'ambito delle verifiche trimestrali svolte regolarmente. Nella comunicazione va inserito l'invito all'organo amministrativo a riferire all'organo di controllo sulle iniziative intraprese."
      },
      {
       "n": 6,
       "testo": "Risposta dell'organo amministrativo sulla PEC di Revilaw entro 30 giorni dalla segnalazione."
      }
     ]
    }
   ]
  },
  "inventario": {
   "titolo": "Check list inventario",
   "note": [
    "Tutti i documenti vanno allegati nella carta di lavoro 3.4.4, indicando correttamente il nome del file, descrivendo i controlli nelle memo e riportando nelle memo l'elenco degli allegati."
   ],
   "blocchi": [
    {
     "titolo": "Prima dell'inizio dell'inventario",
     "intro": "La conta la organizza la società: il revisore dà le istruzioni e raccoglie le informazioni per pianificare la sua presenza.",
     "passi": [
      {
       "n": 1,
       "testo": "Inviare l'email alla società revisionata",
       "doc": [
        {
         "a": "email-inventario-di-fine-anno",
         "et": "Email"
        },
        {
         "a": "allegato-1-manuale-di-inventario-fac-simile",
         "et": "Allegato 1"
        },
        {
         "a": "allegato-2-attestazione-frontespizio-da-inviare-con-il-bilancio",
         "et": "Allegato 2"
        },
        {
         "a": "allegato-3-focus-sulla-revisione-delle-rimanenze-di-magazzino",
         "et": "Allegato 3"
        },
        {
         "a": "allegato-4-valorizzazione-dell-inventario-di-magazzino-cliente",
         "et": "Allegato 4"
        }
       ]
      },
      {
       "n": 2,
       "testo": "Sollecitare la conferma della data di inizio e di fine dell'inventario."
      },
      {
       "n": 3,
       "testo": "Sollecitare l'invio della procedura di inventario o dell'allegato 1 dell'email."
      },
      {
       "n": 4,
       "testo": "Sollecitare l'invio delle planimetrie dei locali del magazzino."
      },
      {
       "n": 5,
       "testo": "Sollecitare l'eventuale perizia."
      },
      {
       "n": 6,
       "testo": "Chiedere se ci sono merci di proprietà presso terzi."
      },
      {
       "n": 7,
       "testo": "Eventualmente circolarizzare il depositario della merce presso terzi (riferire al responsabile qualità).",
       "doc": [
        {
         "a": "lettera-di-circolarizzazione-ai-depositari-delle-rimanenze",
         "et": "Lettera di circolarizzazione"
        }
       ]
      },
      {
       "n": 8,
       "testo": "Completare, se non già fatto, la carta di lavoro 3.4.4 Pianificazione.",
       "doc": [
        {
         "a": "esempio-della-carta-di-lavoro-3-4-4-pianificazione",
         "et": "Esempio"
        }
       ]
      }
     ]
    },
    {
     "titolo": "Durante l'inventario",
     "intro": "Il revisore osserva la conta e la verifica a campione.",
     "passi": [
      {
       "n": 9,
       "testo": "Partecipare alla conta fisica del magazzino per verificare quanto indicato dalla società secondo il punto 2, nonché i tabulati ciechi."
      },
      {
       "n": 10,
       "testo": "Durante la conta verificare la presenza di merce obsoleta e di merci di terzi."
      }
     ]
    },
    {
     "titolo": "Verifica del revisore",
     "intro": "Dopo la conta: le verifiche del revisore su quantità, valori e competenza.",
     "passi": [
      {
       "n": 11,
       "testo": "Chiedere l'invio dell'attestazione (allegato 2 dell'email), della valorizzazione (allegato 4) e di un bilancio di verifica al 31/12."
      },
      {
       "n": 12,
       "testo": "Importare la valorizzazione in Revisoft e fare il campionamento statistico (chi vuole fare anche quello ragionato faccia sempre prima lo statistico)."
      },
      {
       "n": 13,
       "testo": "Tornare in azienda per la verifica del campione e riconciliare con DDT e fatture (conservare in Revisoft i documenti acquisiti).",
       "doc": [
        {
         "a": "carta-di-lavoro-conta-fisica-del-revisore",
         "et": "Conta fisica del revisore"
        }
       ]
      },
      {
       "n": 14,
       "testo": "Svolgere la verifica dal fisico al contabile."
      },
      {
       "n": 15,
       "testo": "Svolgere la verifica slow moving.",
       "doc": [
        {
         "a": "carta-di-lavoro-slow-moving",
         "et": "Slow moving"
        }
       ]
      },
      {
       "n": 16,
       "testo": "Svolgere il price test.",
       "doc": [
        {
         "a": "carta-di-lavoro-price-test",
         "et": "Price test"
        }
       ]
      },
      {
       "n": 17,
       "testo": "Svolgere il cut-off.",
       "doc": [
        {
         "a": "carta-di-lavoro-cut-off",
         "et": "Cut-off"
        }
       ]
      },
      {
       "n": 18,
       "testo": "Segnalare all'azienda gli eventuali errori al di sopra dell'errore trascurabile e la merce obsoleta, per la svalutazione del magazzino."
      },
      {
       "n": 19,
       "testo": "Riportare nella scheda «Errori rilevati» di Revisoft le anomalie rilevate e non corrette."
      },
      {
       "n": 20,
       "testo": "Documentare nelle note di Revisoft le attività sopra indicate, allegando carte di lavoro e documenti probativi (foto e altri documenti utili)."
      },
      {
       "n": 21,
       "testo": "Redigere il verbale di verifica del magazzino.",
       "doc": [
        {
         "a": "verbale-di-verifica-del-magazzino",
         "et": "Verbale"
        }
       ]
      },
      {
       "n": 22,
       "testo": "Inviare il modulo per i controlli di qualità.",
       "doc": [
        {
         "l": "https://forms.gle/ohhvfyKs5rJZX2YEA",
         "et": "Modulo per i controlli di qualità",
         "tipo": "modulo",
         "descrizione": "Il modulo che avvisa il controllo qualità che la verifica del magazzino è conclusa."
        }
       ]
      }
     ]
    }
   ]
  },
  "circObbligatorie": {
   "titolo": "Check list circolarizzazione soggetti obbligatori",
   "note": [
    "Fasi specifiche per gli incarichi affidati al controllo qualità di Elisa e Andrea (PEC: circolarizzazionirevilaw@pec.it)."
   ],
   "blocchi": [
    {
     "titolo": "",
     "passi": [
      {
       "n": 1,
       "testo": "Inviare l'email al cliente per chiedere l'attestazione.",
       "doc": [
        {
         "a": "email-al-cliente-richiesta-dell-attestazione-per-le-circolarizzazioni",
         "et": "Email"
        },
        {
         "a": "attestazione-dei-soggetti-obbligatori-2026-con-carte-prepagate",
         "et": "Attestazione"
        }
       ]
      },
      {
       "n": 2,
       "testo": "Ricevere l'attestazione."
      },
      {
       "n": 3,
       "testo": "Autocertificazione rischi legali: farla firmare quando nell'attestazione non sono indicati legali. Integrare il controllo con il punto 9.",
       "doc": [
        {
         "a": "autocertificazione-rischi-legali",
         "et": "Autocertificazione rischi legali"
        },
        {
         "a": "guida-pratica-circolarizzazioni-e-conferme-legali",
         "et": "Guida pratica legali"
        }
       ]
      },
      {
       "n": 4,
       "testo": "Predisporre le lettere di circolarizzazione come da attestazione ricevuta.",
       "doc": [
        {
         "c": [
          "lettera-alla-societa-incaricata-della-conta-fisica-delle-rimanenze",
          "lettera-agli-enti-finanziatori",
          "lettera-agli-istituti-di-credito",
          "lettera-all-amministrazione-postale",
          "lettera-ai-consulenti-del-lavoro",
          "lettera-ai-consulenti-fiscali",
          "lettera-ai-consulenti-legali",
          "lettera-alle-compagnie-assicurative",
          "lettera-alle-societa-di-leasing",
          "lettera-alle-societa-di-factor",
          "lettera-ai-depositanti-delle-rimanenze-di-magazzino",
          "lettera-alle-parti-correlate-e-societa-del-gruppo"
         ],
         "et": "Fac-simile delle lettere"
        }
       ]
      },
      {
       "n": 5,
       "testo": "Inviare al cliente le lettere di circolarizzazione da far stampare e firmare su carta intestata.",
       "doc": [
        {
         "a": "email-invio-delle-lettere-di-circolarizzazione",
         "et": "Email"
        }
       ]
      },
      {
       "n": 6,
       "testo": "Ricevere le lettere di circolarizzazione entro 5 giorni."
      },
      {
       "n": 7,
       "testo": "Sui mastrini al 31/12/2026 verificare che nell'attestazione ci siano tutti i soggetti obbligatori."
      },
      {
       "n": 8,
       "testo": "Controllare gli indirizzi PEC su INI-PEC.",
       "doc": [
        {
         "l": "https://www.inipec.gov.it/web/guest/cerca-pec?p_p_id=search_pec_SearchPecPortlet_INSTANCE_AXK2wimPmw44&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_search_pec_SearchPecPortlet_INSTANCE_AXK2wimPmw44_tabSelected=companies",
         "et": "INI-PEC",
         "tipo": "web",
         "descrizione": "Il registro pubblico degli indirizzi PEC di imprese e professionisti."
        }
       ]
      },
      {
       "n": 9,
       "testo": "Inviare le lettere firmate dall'area riservata: una PEC per destinatario dalla casella circolarizzazionirevilaw@pec.it, con la lettera in PDF, la data entro cui rispondere e le date del primo e del secondo sollecito.",
       "doc": [
        {
         "p": "pec",
         "et": "Circolarizzazioni via PEC",
         "descrizione": "Scegli l'incarico, indica i destinatari con la loro lettera in PDF e le date della risposta e dei solleciti. Qui trovi poi ricevute e risposte, da scaricare e salvare nelle carte."
        }
       ]
      }
     ]
    },
    {
     "titolo": "Controllo qualità: invio PEC",
     "intro": "Il controllo di invii e risposte, svolto con il controllo qualità.",
     "passi": [
      {
       "n": 10,
       "testo": "Verificare nell'area riservata che ogni PEC risulti consegnata: per quelle non consegnate correggere l'indirizzo e reinviare."
      },
      {
       "n": 11,
       "testo": "Controllare le risposte ricevute e i solleciti: quelli programmati partono da soli e si fermano quando la risposta arriva."
      },
      {
       "n": 12,
       "testo": "Report delle risposte ricevute dal team, da allegare in Revisoft 3.98.",
       "doc": [
        {
         "a": "report-del-team-soggetti-obbligatori-e-risposte",
         "et": "Report del team"
        }
       ],
       "nota": "Ricevute e risposte si scaricano dall'area riservata e si salvano nelle carte di lavoro: a lavoro concluso vengono cancellate dal portale."
      }
     ]
    },
    {
     "titolo": "Verificare fondo rischi, saldi dei c/c, debiti verso consulenti e informazioni in nota integrativa",
     "intro": "Le risposte servono a verificare queste voci: vanno allegate nelle carte indicate.",
     "passi": [
      {
       "n": 13,
       "testo": "Chiedere all'azienda la Centrale Rischi al 31/12/2026.",
       "doc": [
        {
         "a": "email-richiesta-della-centrale-rischi",
         "et": "Email"
        }
       ]
      },
      {
       "n": 14,
       "testo": "Allegare le risposte di enti finanziatori, istituti di credito e amministrazione postale in Revisoft 3.4.11 (Ctrl)."
      },
      {
       "n": 15,
       "testo": "Allegare le risposte di consulenti del lavoro, consulenti fiscali, consulenti legali e compagnie assicurative in Revisoft 3.4.14 (Ctrl)."
      },
      {
       "n": 16,
       "testo": "Allegare le risposte dei depositari delle rimanenze di magazzino in Revisoft 3.4.4 (Ctrl)."
      },
      {
       "n": 17,
       "testo": "Allegare le risposte delle società di leasing in Revisoft 3.98."
      }
     ]
    }
   ],
   "doveAllegare": [
    {
     "cosa": "Attestazione",
     "carta": "3.91"
    },
    {
     "cosa": "Risposte alle lettere a enti finanziatori, istituti di credito, amministrazione postale, Centrale Rischi",
     "carta": "3.4.11"
    },
    {
     "cosa": "Risposte alle lettere a società di leasing e compagnie assicurative",
     "carta": "3.98"
    },
    {
     "cosa": "Risposte alle lettere a consulenti del lavoro, fiscali e legali, e autocertificazione rischi legali",
     "carta": "3.4.14"
    },
    {
     "cosa": "Risposte alle lettere ai depositanti delle rimanenze di magazzino",
     "carta": "3.4.4"
    }
   ],
   "noteFinali": [
    "Tutti i soggetti indicati nell'attestazione devono rispondere alla richiesta di conferma esterna."
   ]
  },
  "cespiti": {
   "titolo": "Check list verifica cespiti",
   "blocchi": [
    {
     "titolo": "",
     "passi": [
      {
       "n": 1,
       "testo": "Inviare l'email al cliente.",
       "doc": [
        {
         "a": "email-richiesta-del-libro-cespiti",
         "et": "Email"
        }
       ]
      },
      {
       "n": 2,
       "testo": "Controllare che il totale delle immobilizzazioni del libro cespiti coincida con quello del progetto di bilancio e delle schede contabili/mastrini."
      },
      {
       "n": 3,
       "testo": "Individuare il numero di cespiti da campionare (grandezza del campione).",
       "doc": [
        {
         "a": "grandezza-del-campione",
         "et": "Grandezza del campione"
        },
        {
         "l": "https://amissori-coder.github.io/CALCOLO-GRANDEZZA-CAMPIONE-CESPITI/",
         "et": "App per il campionamento",
         "tipo": "web",
         "descrizione": "Calcola la grandezza del campione dei cespiti."
        }
       ]
      },
      {
       "n": 4,
       "testo": "Campionamento ragionato.",
       "doc": [
        {
         "a": "campionamento-ragionato-dei-cespiti",
         "et": "Campionamento ragionato"
        }
       ]
      },
      {
       "n": 5,
       "testo": "Test overall del fondo ammortamento.",
       "doc": [
        {
         "a": "test-overall-del-fondo-ammortamento",
         "et": "Test overall"
        }
       ]
      },
      {
       "n": 6,
       "testo": "Test di ricalcolo delle quote di ammortamento.",
       "doc": [
        {
         "a": "test-di-ricalcolo-delle-quote-di-ammortamento",
         "et": "Test ammortamento"
        }
       ]
      },
      {
       "n": 7,
       "testo": "Test incrementi e decrementi.",
       "doc": [
        {
         "a": "test-incrementi-e-decrementi",
         "et": "Test incrementi/decrementi"
        }
       ]
      },
      {
       "n": 8,
       "testo": "Verifica fisica con foto del cespite (allegare anche le planimetrie per i beni immobili)."
      },
      {
       "n": 9,
       "testo": "Acquisire fatture di acquisto, ricevute di bonifico e ogni altra documentazione probatoria (atti di compravendita, ecc.)."
      },
      {
       "n": 10,
       "testo": "Verificare eventuali crediti d'imposta fruiti con la relativa documentazione probatoria (ad esempio la certificazione di interconnessione 4.0) e i risconti."
      },
      {
       "n": 11,
       "testo": "Redigere il verbale di verifica.",
       "doc": [
        {
         "a": "verbale-di-verifica-dei-beni-strumentali",
         "et": "Verbale"
        }
       ]
      }
     ]
    }
   ]
  },
  "circClientiFornitori": {
   "titolo": "Check list circolarizzazione clienti/fornitori",
   "blocchi": [
    {
     "titolo": "",
     "passi": [
      {
       "n": 1,
       "testo": "Inviare l'email al cliente.",
       "doc": [
        {
         "a": "email-richiesta-della-documentazione-per-la-circolarizzazione-clienti-e",
         "et": "Email"
        },
        {
         "a": "allegato-elenco-clienti",
         "et": "Allegato clienti"
        },
        {
         "a": "allegato-elenco-fornitori",
         "et": "Allegato fornitori"
        }
       ]
      },
      {
       "n": 2,
       "testo": "Ricevere le schede contabili di clienti e fornitori e gli elenchi xls di clienti e fornitori, con il bilancio di verifica."
      },
      {
       "n": 3,
       "testo": "Procedere al campionamento in Revisoft.",
       "doc": [
        {
         "a": "note-sui-segni-dei-saldi-dare-avere",
         "et": "Note sui segni +/- dei saldi dare/avere"
        },
        {
         "a": "istruzioni-revisoft-campionamento",
         "et": "Istruzioni Revisoft"
        },
        {
         "a": "chiarimenti-per-il-campionamento",
         "et": "Chiarimenti Revisoft"
        }
       ]
      },
      {
       "n": 4,
       "testo": "Inviare l'xls dei clienti/fornitori campionati e chiedere di inserire le PEC.",
       "doc": [
        {
         "a": "xls-per-il-campionamento-pec-di-clienti-e-fornitori",
         "et": "Xls campionamento"
        }
       ]
      },
      {
       "n": 5,
       "testo": "Predisporre le lettere di circolarizzazione.",
       "doc": [
        {
         "a": "lettera-ai-clienti",
         "et": "Lettere clienti"
        },
        {
         "a": "lettera-ai-fornitori",
         "et": "Lettere fornitori"
        }
       ]
      },
      {
       "n": 6,
       "testo": "Inviare al cliente le lettere di circolarizzazione da far stampare e firmare su carta intestata.",
       "doc": [
        {
         "a": "email-invio-delle-lettere-di-circolarizzazione-a-clienti-e-fornitori",
         "et": "Email"
        }
       ]
      },
      {
       "n": 7,
       "testo": "Ricevere le lettere di circolarizzazione entro 5 giorni."
      },
      {
       "n": 8,
       "testo": "Per le lettere ai clienti, verificare che l'azienda abbia allegato l'estratto conto al 31/12."
      },
      {
       "n": 9,
       "testo": "Controllare gli indirizzi PEC su INI-PEC.",
       "doc": [
        {
         "l": "https://www.inipec.gov.it/web/guest/cerca-pec?p_p_id=search_pec_SearchPecPortlet_INSTANCE_AXK2wimPmw44&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_search_pec_SearchPecPortlet_INSTANCE_AXK2wimPmw44_tabSelected=companies",
         "et": "INI-PEC",
         "tipo": "web",
         "descrizione": "Il registro pubblico degli indirizzi PEC di imprese e professionisti."
        }
       ]
      },
      {
       "n": 10,
       "testo": "Inviare le lettere firmate dall'area riservata: una PEC per destinatario dalla casella circolarizzazionirevilaw@pec.it, con la lettera in PDF, la data entro cui rispondere e le date del primo e del secondo sollecito.",
       "doc": [
        {
         "p": "pec",
         "et": "Circolarizzazioni via PEC",
         "descrizione": "Scegli l'incarico, indica i destinatari con la loro lettera in PDF e le date della risposta e dei solleciti. Qui trovi poi ricevute e risposte, da scaricare e salvare nelle carte."
        }
       ]
      }
     ]
    },
    {
     "titolo": "Controllo qualità: invio PEC",
     "intro": "Il controllo di invii e risposte, poi le procedure sui saldi.",
     "passi": [
      {
       "n": 11,
       "testo": "Verificare nell'area riservata che ogni PEC risulti consegnata: per quelle non consegnate correggere l'indirizzo e reinviare."
      },
      {
       "n": 12,
       "testo": "Controllare le risposte ricevute e i solleciti: quelli programmati partono da soli e si fermano quando la risposta arriva."
      },
      {
       "n": 13,
       "testo": "Report delle risposte ricevute dal team, da allegare in Revisoft 3.98.",
       "doc": [
        {
         "a": "report-del-team-clienti-fornitori-e-risposte",
         "et": "Report del team"
        }
       ],
       "nota": "Ricevute e risposte si scaricano dall'area riservata e si salvano nelle carte di lavoro: a lavoro concluso vengono cancellate dal portale."
      },
      {
       "n": 14,
       "testo": "Svolgere procedure alternative per i clienti/fornitori che non hanno risposto."
      },
      {
       "n": 15,
       "testo": "Verificare «tutte» le fatture da emettere/ricevere, riconciliando le schede contabili con i documenti probativi (copia delle fatture, ecc., da allegare in Revisoft)."
      },
      {
       "n": 16,
       "testo": "Chiedere l'aging di tutti i crediti e debiti per verificarne l'anzianità e la capienza del fondo svalutazione.",
       "doc": [
        {
         "a": "esempio-di-aging-dei-crediti-e-dei-debiti",
         "et": "Esempio per il cliente"
        }
       ]
      }
     ]
    }
   ],
   "doveAllegare": [
    {
     "cosa": "Risposte alle lettere ai clienti",
     "carta": "3.4.7 Camp"
    },
    {
     "cosa": "Risposte alle lettere ai fornitori",
     "carta": "3.4.17 Camp"
    }
   ]
  },
  "dichiarazioni": {
   "titolo": "Check list sottoscrizione dichiarazioni fiscali 2026",
   "blocchi": [
    {
     "titolo": "",
     "passi": [
      {
       "n": 1,
       "testo": "Email da inviare per le dichiarazioni fiscali",
       "doc": [
        {
         "a": "email-aggiornamenti-sulle-dichiarazioni-fiscali-2026-e-ruolo-della-socie",
         "et": "Email"
        }
       ]
      }
     ]
    }
   ]
  },
  "bilancio": {
   "titolo": "Check list verifiche bilancio",
   "note": [
    "Nessuna relazione di revisione può essere emessa prima dei controlli di qualità di Revilaw. Al termine, se il controllo di qualità riterrà concluse positivamente tutte le verifiche, rilascerà: la lettera di attestazione della direzione su format Revilaw; la relazione di revisione su format Revilaw.",
    "Con l'emissione del giudizio le carte di lavoro vengono stampate con tutti gli allegati, così da essere congelate: dettagliare in modo analitico ogni controllo svolto e allegare tutti i documenti utili."
   ],
   "blocchi": [
    {
     "titolo": "",
     "passi": [
      {
       "n": 1,
       "testo": "Inviare l'email al cliente.",
       "doc": [
        {
         "a": "email-comunicazione-del-progetto-di-bilancio-al-revisore-legale",
         "et": "Email"
        }
       ]
      }
     ]
    },
    {
     "titolo": "Bilancio approvato entro 120 giorni",
     "intro": "Assemblea di approvazione entro il 30 aprile: il progetto deve arrivare almeno 30 giorni prima.",
     "passi": [
      {
       "n": 1,
       "testo": "Se il progetto di bilancio non arriva entro il 30/03, inviare un sollecito.",
       "doc": [
        {
         "a": "note-tecniche-mancata-comunicazione-del-progetto-di-bilancio-nei-tempi",
         "et": "Note tecniche"
        },
        {
         "a": "lettera-di-primo-sollecito",
         "et": "Email 1° sollecito"
        },
        {
         "a": "lettera-di-secondo-sollecito",
         "et": "Email 2° sollecito"
        }
       ]
      },
      {
       "n": 2,
       "testo": "Ricevere la rinuncia ai termini firmata da tutti i soci e dall'amministratore.",
       "doc": [
        {
         "a": "rinuncia-ai-termini-art-2429-c-c",
         "et": "Rinuncia ai termini"
        }
       ]
      },
      {
       "n": 3,
       "testo": "Ricevere il progetto di bilancio con la delibera del CdA (determina dell'A.U.)."
      },
      {
       "n": 4,
       "testo": "Verificare la tipologia di bilancio (ordinario/abbreviato)."
      },
      {
       "n": 5,
       "testo": "Svolgere le verifiche."
      },
      {
       "n": 6,
       "testo": "Verificare in nota integrativa l'indicazione dei compensi del revisore."
      },
      {
       "n": 7,
       "testo": "Sottoscrizione delle parti correlate.",
       "doc": [
        {
         "a": "attestazione-dei-controlli-sulle-parti-correlate-modello",
         "et": "Modello"
        },
        {
         "a": "lettera-alle-parti-correlate-e-societa-del-gruppo",
         "et": "Per i soli gruppi"
        }
       ],
       "nota": "Per i soli gruppi allegare anche la risposta alla circolarizzazione delle parti correlate presente nei fac-simile delle circolarizzazioni obbligatorie."
      },
      {
       "n": 8,
       "testo": "Comunicare al responsabile della qualità la fine delle verifiche.",
       "nota": "Il responsabile qualità è quello indicato per l'incarico, nella sua scheda della sezione Incarichi."
      },
      {
       "n": 9,
       "testo": "Sottoscrizione della lettera di attestazione: lo stesso giorno dell'emissione del giudizio.",
       "doc": [
        {
         "c": [
          "lettera-di-attestazione-bilancio-abbreviato",
          "lettera-di-attestazione-bilancio-ordinario-con-relazione-sulla-gestione",
          "assirevi-documento-di-ricerca-n-251r-2026-le-attestazioni-della-direzion"
         ],
         "et": "Format Revilaw da concordare con il responsabile qualità"
        }
       ],
       "nota": "Il format Revilaw si concorda con il responsabile qualità."
      },
      {
       "n": 10,
       "testo": "Verificare la bozza del verbale di approvazione del bilancio, con i riferimenti alla rinuncia ai termini da parte di tutti i soci."
      },
      {
       "n": 11,
       "testo": "Emissione del giudizio di revisione: almeno 15 giorni prima dell'assemblea in prima convocazione.",
       "doc": [
        {
         "c": [
          "giudizio-bilancio-ordinario-senza-collegio",
          "giudizio-bilancio-ordinario-con-collegio",
          "giudizio-bilancio-abbreviato-senza-collegio",
          "giudizio-con-rilievi-bilancio-abbreviato-senza-collegio",
          "impossibilita-di-esprimere-un-giudizio-bilancio-abbreviato-senza-collegi",
          "report-of-the-independent-legal-auditor-in-inglese"
         ],
         "et": "Format Revilaw da concordare con il responsabile qualità"
        }
       ],
       "nota": "Il format Revilaw si concorda con il responsabile qualità."
      },
      {
       "n": 12,
       "testo": "Emissione del giudizio di revisione: con la rinuncia ai termini anche nei 15 giorni prima dell'assemblea in prima convocazione."
      }
     ]
    },
    {
     "titolo": "Bilancio approvato entro 180 giorni",
     "intro": "Rinvio a 180 giorni deliberato dall'organo amministrativo e consentito dallo statuto.",
     "passi": [
      {
       "n": 1,
       "testo": "Ricevere il verbale dell'organo amministrativo (determina dell'A.U.) per il rinvio a 180 giorni."
      },
      {
       "n": 2,
       "testo": "Verificare le condizioni statutarie per il rinvio a 180 giorni."
      },
      {
       "n": 3,
       "testo": "Se il progetto di bilancio non arriva entro il 30/05, inviare un sollecito.",
       "doc": [
        {
         "a": "note-tecniche-mancata-comunicazione-del-progetto-di-bilancio-nei-tempi",
         "et": "Note tecniche"
        },
        {
         "a": "lettera-di-primo-sollecito",
         "et": "Email 1° sollecito"
        },
        {
         "a": "lettera-di-secondo-sollecito",
         "et": "Email 2° sollecito"
        }
       ]
      },
      {
       "n": 4,
       "testo": "Ricevere la rinuncia ai termini firmata da tutti i soci e dall'amministratore.",
       "doc": [
        {
         "a": "rinuncia-ai-termini-art-2429-c-c",
         "et": "Rinuncia ai termini"
        }
       ]
      },
      {
       "n": 5,
       "testo": "Ricevere il progetto di bilancio con la delibera del CdA (determina dell'A.U.)."
      },
      {
       "n": 6,
       "testo": "Verificare la tipologia di bilancio (ordinario/abbreviato)."
      },
      {
       "n": 7,
       "testo": "Svolgere le verifiche."
      },
      {
       "n": 8,
       "testo": "Verificare in nota integrativa la presenza delle motivazioni del rinvio a 180 giorni."
      },
      {
       "n": 9,
       "testo": "Verificare in nota integrativa l'indicazione dei compensi del revisore."
      },
      {
       "n": 10,
       "testo": "Sottoscrizione delle parti correlate.",
       "doc": [
        {
         "a": "attestazione-dei-controlli-sulle-parti-correlate-modello",
         "et": "Modello"
        },
        {
         "a": "lettera-alle-parti-correlate-e-societa-del-gruppo",
         "et": "Per i soli gruppi"
        }
       ],
       "nota": "Per i soli gruppi allegare anche la risposta alla circolarizzazione delle parti correlate presente nei fac-simile delle circolarizzazioni obbligatorie."
      },
      {
       "n": 11,
       "testo": "Comunicare al responsabile della qualità la fine delle verifiche.",
       "nota": "Il responsabile qualità è quello indicato per l'incarico, nella sua scheda della sezione Incarichi."
      },
      {
       "n": 12,
       "testo": "Sottoscrizione della lettera di attestazione: lo stesso giorno dell'emissione del giudizio.",
       "doc": [
        {
         "c": [
          "lettera-di-attestazione-bilancio-abbreviato",
          "lettera-di-attestazione-bilancio-ordinario-con-relazione-sulla-gestione",
          "assirevi-documento-di-ricerca-n-251r-2026-le-attestazioni-della-direzion"
         ],
         "et": "Format Revilaw da concordare con il responsabile qualità"
        }
       ],
       "nota": "Il format Revilaw si concorda con il responsabile qualità."
      },
      {
       "n": 13,
       "testo": "Verificare la bozza del verbale di approvazione del bilancio, con i riferimenti alla rinuncia ai termini da parte di tutti i soci."
      },
      {
       "n": 14,
       "testo": "Emissione del giudizio di revisione: almeno 15 giorni prima dell'assemblea in prima convocazione.",
       "doc": [
        {
         "c": [
          "giudizio-bilancio-ordinario-senza-collegio",
          "giudizio-bilancio-ordinario-con-collegio",
          "giudizio-bilancio-abbreviato-senza-collegio",
          "giudizio-con-rilievi-bilancio-abbreviato-senza-collegio",
          "impossibilita-di-esprimere-un-giudizio-bilancio-abbreviato-senza-collegi",
          "report-of-the-independent-legal-auditor-in-inglese"
         ],
         "et": "Format Revilaw da concordare con il responsabile qualità"
        }
       ],
       "nota": "Il format Revilaw si concorda con il responsabile qualità."
      },
      {
       "n": 15,
       "testo": "Emissione del giudizio di revisione: con la rinuncia ai termini anche nei 15 giorni prima dell'assemblea in prima convocazione."
      }
     ]
    }
   ],
   "doveAllegare": [
    {
     "cosa": "Rinuncia ai termini",
     "carta": "3.95"
    },
    {
     "cosa": "Modello parti correlate",
     "carta": "3.5.1"
    },
    {
     "cosa": "Risposta alla circolarizzazione delle parti correlate (gruppi)",
     "carta": "3.5.1"
    },
    {
     "cosa": "Lettera di attestazione",
     "carta": "3.91"
    },
    {
     "cosa": "Giudizio di revisione",
     "carta": "3.95"
    }
   ],
   "noteFinali": [
    "Se la società non riesce ad approvare il bilancio neanche entro 180 giorni, occorre un verbale dell'organo amministrativo che spieghi le ragioni del ritardo e annulli le convocazioni in prima e seconda convocazione."
   ]
  },
  "qualita": {
   "titolo": "Check list rilascio attestazione e giudizio",
   "note": [
    "Attenzione: prima di chiedere il controllo qualità verificare che tutte le carte di lavoro siano completate come indicato qui sotto."
   ],
   "blocchi": [
    {
     "titolo": "Controlli generici",
     "intro": "Da verificare su ogni incarico prima di chiedere il controllo qualità.",
     "passi": [
      {
       "n": 1,
       "testo": "Frequenza delle verifiche sulle carte di lavoro dell'area 4 (31/03, 30/06, 30/09, 31/12).",
       "doc": [
        {
         "a": "ciclo-delle-verifiche-periodiche-area-4",
         "et": "Ciclo verifiche periodiche"
        }
       ]
      },
      {
       "n": 2,
       "testo": "Import del progetto di bilancio.",
       "doc": [
        {
         "a": "import-del-bilancio",
         "et": "Nota"
        }
       ]
      },
      {
       "n": 3,
       "testo": "Materialità di bilancio.",
       "doc": [
        {
         "a": "materialita-di-bilancio",
         "et": "Nota"
        }
       ]
      },
      {
       "n": 4,
       "testo": "Carte di lavoro «Pianificazione» e «Controllo».",
       "doc": [
        {
         "a": "carte-di-lavoro-pianificazione-e-controllo",
         "et": "Nota"
        }
       ]
      },
      {
       "n": 5,
       "testo": "Errori di bilancio.",
       "doc": [
        {
         "a": "errori-nel-bilancio",
         "et": "Nota"
        }
       ]
      }
     ]
    },
    {
     "titolo": "Kickoff",
     "passi": [
      {
       "n": 1,
       "testo": "Pacchetto Kickoff, pensato soprattutto per i meno esperti, per avviare rapidamente le verifiche sul bilancio con le richieste iniziali. Il set documentale raccoglie i documenti che al 95% servono e sono subito disponibili in azienda; le milestone sono le attività che al 95% vanno svolte.",
       "doc": [
        {
         "a": "pacchetto-kickoff",
         "et": "Pacchetto Kickoff"
        }
       ],
       "nota": "Il pacchetto non sostituisce quanto indicato nelle carte di lavoro successive."
      }
     ]
    },
    {
     "titolo": "Controlli sulle carte di lavoro",
     "intro": "Una nota per ogni voce di bilancio, con cosa controllare in pianificazione e nel controllo e quali allegati sono obbligatori nella carta Ctrl.",
     "passi": [
      {
       "n": 1,
       "testo": "Immobilizzazioni immateriali",
       "doc": [
        {
         "a": "controlli-immobilizzazioni-immateriali",
         "et": "Note di controllo"
        }
       ]
      },
      {
       "n": 2,
       "testo": "Immobilizzazioni materiali",
       "doc": [
        {
         "a": "controlli-immobilizzazioni-materiali",
         "et": "Note di controllo"
        }
       ]
      },
      {
       "n": 3,
       "testo": "Immobilizzazioni finanziarie",
       "doc": [
        {
         "a": "controlli-immobilizzazioni-finanziarie",
         "et": "Note di controllo"
        }
       ]
      },
      {
       "n": 4,
       "testo": "Rimanenze di magazzino",
       "doc": [
        {
         "a": "controlli-rimanenze-di-magazzino",
         "et": "Note di controllo"
        }
       ]
      },
      {
       "n": 5,
       "testo": "Rimanenze: commesse e opere a lungo termine",
       "doc": [
        {
         "a": "controlli-rimanenze-commesse-e-opere-a-lungo-termine",
         "et": "Note di controllo"
        }
       ]
      },
      {
       "n": 6,
       "testo": "Attività finanziarie non immobilizzate",
       "doc": [
        {
         "a": "controlli-attivita-finanziarie-non-immobilizzate",
         "et": "Note di controllo"
        }
       ]
      },
      {
       "n": 7,
       "testo": "Crediti commerciali (clienti)",
       "doc": [
        {
         "a": "controlli-crediti-commerciali-clienti",
         "et": "Note di controllo"
        }
       ]
      },
      {
       "n": 8,
       "testo": "Crediti e debiti infragruppo",
       "doc": [
        {
         "a": "controlli-crediti-e-debiti-infragruppo",
         "et": "Note di controllo"
        }
       ]
      },
      {
       "n": 9,
       "testo": "Crediti tributari e per imposte anticipate",
       "doc": [
        {
         "a": "controlli-crediti-tributari-e-per-imposte-anticipate",
         "et": "Note di controllo"
        }
       ]
      },
      {
       "n": 10,
       "testo": "Crediti verso altri",
       "doc": [
        {
         "a": "controlli-crediti-verso-altri",
         "et": "Note di controllo"
        }
       ]
      },
      {
       "n": 11,
       "testo": "Cassa e banche",
       "doc": [
        {
         "a": "controlli-cassa-e-banche",
         "et": "Note di controllo"
        }
       ]
      },
      {
       "n": 12,
       "testo": "Ratei e risconti (attivi e passivi)",
       "doc": [
        {
         "a": "controlli-ratei-e-risconti-attivi-e-passivi",
         "et": "Note di controllo"
        }
       ]
      },
      {
       "n": 13,
       "testo": "Patrimonio netto",
       "doc": [
        {
         "a": "controlli-patrimonio-netto",
         "et": "Note di controllo"
        }
       ]
      },
      {
       "n": 14,
       "testo": "Fondi per rischi e oneri",
       "doc": [
        {
         "a": "controlli-fondi-per-rischi-e-oneri",
         "et": "Note di controllo"
        }
       ]
      },
      {
       "n": 15,
       "testo": "T.F.R. (trattamento di fine rapporto)",
       "doc": [
        {
         "a": "controlli-t-f-r",
         "et": "Note di controllo"
        }
       ]
      },
      {
       "n": 16,
       "testo": "Mutui e finanziamenti non bancari",
       "doc": [
        {
         "a": "controlli-mutui-e-finanziamenti-non-bancari",
         "et": "Note di controllo"
        }
       ]
      },
      {
       "n": 17,
       "testo": "Debiti commerciali (fornitori)",
       "doc": [
        {
         "a": "controlli-debiti-commerciali-fornitori",
         "et": "Note di controllo"
        }
       ]
      },
      {
       "n": 18,
       "testo": "Debiti tributari",
       "doc": [
        {
         "a": "controlli-debiti-tributari",
         "et": "Note di controllo"
        }
       ]
      },
      {
       "n": 19,
       "testo": "Debiti verso altri",
       "doc": [
        {
         "a": "controlli-debiti-verso-altri",
         "et": "Note di controllo"
        }
       ]
      },
      {
       "n": 20,
       "testo": "CE: valore della produzione",
       "doc": [
        {
         "a": "controlli-ce-valore-della-produzione",
         "et": "Note di controllo"
        },
        {
         "a": "verifica-della-corretta-applicazione-del-nuovo-oic-34",
         "et": "Nuovo OIC 34"
        }
       ]
      },
      {
       "n": 21,
       "testo": "CE: costi della produzione",
       "doc": [
        {
         "a": "controlli-ce-costi-della-produzione",
         "et": "Note di controllo"
        }
       ]
      },
      {
       "n": 22,
       "testo": "CE: gestione finanziaria",
       "doc": [
        {
         "a": "controlli-ce-gestione-finanziaria",
         "et": "Note di controllo"
        }
       ]
      },
      {
       "n": 23,
       "testo": "Parti correlate",
       "nota": "Questionario Revisoft, con l'attestazione delle parti correlate in allegato."
      },
      {
       "n": 24,
       "testo": "Fatti censurabili",
       "nota": "Questionario Revisoft."
      },
      {
       "n": 25,
       "testo": "Eventi successivi",
       "nota": "Questionario Revisoft."
      },
      {
       "n": 26,
       "testo": "Continuità aziendale",
       "doc": [
        {
         "a": "verifica-della-continuita-aziendale-linee-guida-per-il-revisore",
         "et": "Verifica della continuità"
        }
       ],
       "nota": "Questionario Revisoft."
      },
      {
       "n": 27,
       "testo": "Relazione sulla gestione",
       "nota": "Questionario Revisoft."
      },
      {
       "n": 28,
       "testo": "Sommario errori",
       "doc": [
        {
         "a": "sommario-errori",
         "et": "Nota"
        }
       ]
      },
      {
       "n": 29,
       "testo": "Promemoria conclusivo",
       "nota": "Questionario Revisoft."
      },
      {
       "n": 30,
       "testo": "Lettera di attestazione",
       "nota": "Da chiedere al responsabile qualità."
      },
      {
       "n": 31,
       "testo": "Giudizio di revisione",
       "nota": "Da chiedere al responsabile qualità."
      }
     ]
    }
   ]
  }
 },
 "allegati": {
  "memorandum-verifica-annuale-di-adeguata-verifica-privacy-e-indipendenza": {
   "nome": "Memorandum: verifica annuale di adeguata verifica, privacy e indipendenza",
   "descrizione": "Per il team: cosa fare ogni anno (adeguata verifica, privacy, carta 1.REV.3) e quando inviare l'attestazione di indipendenza.",
   "file": "strumenti-revisione/allegati/memorandum-verifica-annuale-di-adeguata-verifica-privacy-e-indipendenza.docx",
   "tipo": "docx",
   "kb": 152,
   "testo": true
  },
  "email-aggiornamento-annuale-di-adeguata-verifica-e-privacy": {
   "nome": "Email: aggiornamento annuale di adeguata verifica e privacy",
   "descrizione": "Testo dell'email al cliente per l'aggiornamento annuale di adeguata verifica e privacy.",
   "file": "strumenti-revisione/allegati/email-aggiornamento-annuale-di-adeguata-verifica-e-privacy.docx",
   "tipo": "docx",
   "kb": 8,
   "testo": true
  },
  "allegati-di-adeguata-verifica-privacy-e-raccolta-dati": {
   "nome": "Allegati di adeguata verifica, privacy e raccolta dati",
   "descrizione": "Scheda di identificazione del cliente (D.Lgs. 231/2007) e documenti privacy da far compilare.",
   "file": "strumenti-revisione/allegati/allegati-di-adeguata-verifica-privacy-e-raccolta-dati.pdf",
   "tipo": "pdf",
   "kb": 801
  },
  "dati-email-comunicazione-dell-indirizzo-email-amministrativo": {
   "nome": "Dati email: comunicazione dell'indirizzo email amministrativo",
   "descrizione": "Modello con cui la società comunica a Revilaw l'indirizzo email amministrativo per la revisione.",
   "file": "strumenti-revisione/allegati/dati-email-comunicazione-dell-indirizzo-email-amministrativo.docx",
   "tipo": "docx",
   "kb": 7,
   "testo": true
  },
  "memorandum-attestazione-di-indipendenza": {
   "nome": "Memorandum: attestazione di indipendenza",
   "descrizione": "Per il team: la procedura annuale per l'attestazione di indipendenza (Revisoft, verifiche preliminari, firma, invio).",
   "file": "strumenti-revisione/allegati/memorandum-attestazione-di-indipendenza.docx",
   "tipo": "docx",
   "kb": 8,
   "testo": true
  },
  "email-al-cliente-trasmissione-dell-attestazione-di-indipendenza": {
   "nome": "Email al cliente: trasmissione dell'attestazione di indipendenza",
   "descrizione": "Testo dell'email con cui si trasmette al cliente l'attestazione di indipendenza.",
   "file": "strumenti-revisione/allegati/email-al-cliente-trasmissione-dell-attestazione-di-indipendenza.docx",
   "tipo": "docx",
   "kb": 7,
   "testo": true
  },
  "attestazione-di-indipendenza-revilaw": {
   "nome": "Attestazione di indipendenza Revilaw",
   "descrizione": "Il modello dell'attestazione di indipendenza firmata dall'amministratore di Revilaw.",
   "file": "strumenti-revisione/allegati/attestazione-di-indipendenza-revilaw.docx",
   "tipo": "docx",
   "kb": 41,
   "testo": true
  },
  "addendum-alla-lettera-di-incarico-variazione-del-responsabile": {
   "nome": "Addendum alla lettera di incarico (variazione del responsabile)",
   "descrizione": "Modello di addendum alla lettera di incarico, da usare quando cambia il responsabile.",
   "file": "strumenti-revisione/allegati/addendum-alla-lettera-di-incarico-variazione-del-responsabile.docx",
   "tipo": "docx",
   "kb": 19,
   "testo": true
  },
  "memorandum-scambio-di-informazioni-con-il-revisore-uscente": {
   "nome": "Memorandum: scambio di informazioni con il revisore uscente",
   "descrizione": "Per il team: norme, tempi, procedura, limiti d'uso delle informazioni e documenti da archiviare.",
   "file": "strumenti-revisione/allegati/memorandum-scambio-di-informazioni-con-il-revisore-uscente.docx",
   "tipo": "docx",
   "kb": 9,
   "testo": true
  },
  "allegato-1-assirevi-lettera-della-societa-conferente": {
   "nome": "Allegato 1 Assirevi: lettera della società conferente",
   "descrizione": "Modello Assirevi di lettera alla società conferente previsto dall'art. 9-bis, c. 5, D.Lgs. 39/2010, da adattare.",
   "file": "strumenti-revisione/allegati/allegato-1-assirevi-lettera-della-societa-conferente.docx",
   "tipo": "docx",
   "kb": 8,
   "testo": true
  },
  "allegato-2-assirevi-lettera-al-revisore-entrante": {
   "nome": "Allegato 2 Assirevi: lettera al revisore entrante",
   "descrizione": "Modello Assirevi di lettera al revisore entrante sulle condizioni di accesso alle carte di lavoro, da adattare.",
   "file": "strumenti-revisione/allegati/allegato-2-assirevi-lettera-al-revisore-entrante.docx",
   "tipo": "docx",
   "kb": 9,
   "testo": true
  },
  "assirevi-documento-di-ricerca-n-212": {
   "nome": "Assirevi, Documento di ricerca n. 212",
   "descrizione": "Il documento Assirevi sullo scambio di informazioni tra revisore entrante e uscente, con i modelli di lettera.",
   "file": "strumenti-revisione/allegati/assirevi-documento-di-ricerca-n-212.pdf",
   "tipo": "pdf",
   "kb": 130
  },
  "modello-iva-indicazioni-per-il-team": {
   "nome": "Modello IVA: indicazioni per il team",
   "descrizione": "Le indicazioni del piano sul modello IVA (niente firma del revisore, salvo il caso del credito IVA).",
   "file": "strumenti-revisione/allegati/modello-iva-indicazioni-per-il-team.docx",
   "tipo": "docx",
   "kb": 7,
   "testo": true
  },
  "memorandum-sottoscrizione-delle-dichiarazioni-fiscali-2026-anno-d-impost": {
   "nome": "Memorandum: sottoscrizione delle dichiarazioni fiscali 2026 (anno d'imposta 2025)",
   "descrizione": "Per il team: chi firma, quali dichiarazioni, quali controlli (Assirevi 208R) e la lettera di attestazione da chiedere.",
   "file": "strumenti-revisione/allegati/memorandum-sottoscrizione-delle-dichiarazioni-fiscali-2026-anno-d-impost.docx",
   "tipo": "docx",
   "kb": 61,
   "testo": true
  },
  "assirevi-documento-di-ricerca-n-208r-2020": {
   "nome": "Assirevi, Documento di ricerca n. 208R/2020",
   "descrizione": "Il documento Assirevi sulla sottoscrizione delle dichiarazioni fiscali e sui controlli suggeriti.",
   "file": "strumenti-revisione/allegati/assirevi-documento-di-ricerca-n-208r-2020.pdf",
   "tipo": "pdf",
   "kb": 186
  },
  "check-controlli-documenti-ricevuti-per-la-sottoscrizione": {
   "nome": "Check controlli: documenti ricevuti per la sottoscrizione",
   "descrizione": "Foglio per tenere traccia, società per società, di email, solleciti e documenti ricevuti per la firma.",
   "file": "strumenti-revisione/allegati/check-controlli-documenti-ricevuti-per-la-sottoscrizione.xlsx",
   "tipo": "xlsx",
   "kb": 16
  },
  "dubbi-sul-quadro-ro-2026": {
   "nome": "Dubbi sul quadro RO 2026",
   "descrizione": "Chiarimenti su quali amministratori indicare nel quadro RO del Modello Redditi SC e come compilarlo.",
   "file": "strumenti-revisione/allegati/dubbi-sul-quadro-ro-2026.docx",
   "tipo": "docx",
   "kb": 8,
   "testo": true
  },
  "email-al-cliente-trasmissione-dei-modelli-770-redditi-sc-irap-e-cnm-2026": {
   "nome": "Email al cliente: trasmissione dei modelli 770, Redditi SC, IRAP e CNM 2026",
   "descrizione": "Testo dell'email al cliente con adempimenti e tempi per i modelli 770, Redditi SC, IRAP e CNM.",
   "file": "strumenti-revisione/allegati/email-al-cliente-trasmissione-dei-modelli-770-redditi-sc-irap-e-cnm-2026.docx",
   "tipo": "docx",
   "kb": 9,
   "testo": true
  },
  "attestazione-sulle-dichiarazioni-2026-2025": {
   "nome": "Attestazione sulle dichiarazioni 2026 (2025)",
   "descrizione": "Lettera di attestazione degli amministratori sulle dichiarazioni, da redigere su carta intestata prima della firma.",
   "file": "strumenti-revisione/allegati/attestazione-sulle-dichiarazioni-2026-2025.docx",
   "tipo": "docx",
   "kb": 317,
   "testo": true
  },
  "memorandum-concordato-preventivo-biennale-novita-2025-e-fac-simile-di-de": {
   "nome": "Memorandum: Concordato preventivo biennale, novità 2025 e fac-simile di delibera",
   "descrizione": "Per il team: cos'è il CPB, le novità del D.Lgs. 81/2025 e quali delibere servono.",
   "file": "strumenti-revisione/allegati/memorandum-concordato-preventivo-biennale-novita-2025-e-fac-simile-di-de.docx",
   "tipo": "docx",
   "kb": 9,
   "testo": true
  },
  "verbale-di-assemblea-dei-soci-per-il-cpb-2026": {
   "nome": "Verbale di assemblea dei soci per il CPB (2026)",
   "descrizione": "Bozza di verbale di assemblea dei soci di S.r.l. per decidere sull'adesione al CPB, con opzioni alternative.",
   "file": "strumenti-revisione/allegati/verbale-di-assemblea-dei-soci-per-il-cpb-2026.docx",
   "tipo": "docx",
   "kb": 12,
   "testo": true
  },
  "verbale-di-delibera-dell-organo-amministrativo-per-il-cpb-2026": {
   "nome": "Verbale di delibera dell'organo amministrativo per il CPB (2026)",
   "descrizione": "Bozza di verbale del CdA o dell'amministratore unico per l'adesione al CPB.",
   "file": "strumenti-revisione/allegati/verbale-di-delibera-dell-organo-amministrativo-per-il-cpb-2026.docx",
   "tipo": "docx",
   "kb": 11,
   "testo": true
  },
  "attestazione-dell-organo-amministrativo-per-il-cpb-2026": {
   "nome": "Attestazione dell'organo amministrativo per il CPB (2026)",
   "descrizione": "Modello di attestazione dell'organo amministrativo a Revilaw sulla valutazione dei rischi e l'adesione al CPB.",
   "file": "strumenti-revisione/allegati/attestazione-dell-organo-amministrativo-per-il-cpb-2026.docx",
   "tipo": "docx",
   "kb": 321,
   "testo": true
  },
  "memorandum-invio-della-documentazione-e-istruzioni-per-il-modulo-2026": {
   "nome": "Memorandum: invio della documentazione e istruzioni per il modulo 2026",
   "descrizione": "Per il team: documenti da inviare, come compilare il modulo, dove archiviare in Revisoft e scadenza.",
   "file": "strumenti-revisione/allegati/memorandum-invio-della-documentazione-e-istruzioni-per-il-modulo-2026.docx",
   "tipo": "docx",
   "kb": 9,
   "testo": true
  },
  "email-richiesta-del-primo-incontro-nuovo-incarico": {
   "nome": "Email: richiesta del primo incontro (nuovo incarico)",
   "descrizione": "Testo dell'email per fissare il primo incontro con un nuovo cliente, con l'elenco dei documenti da preparare.",
   "file": "strumenti-revisione/allegati/email-richiesta-del-primo-incontro-nuovo-incarico.docx",
   "tipo": "docx",
   "kb": 9,
   "testo": true
  },
  "allegato-attestazione-delle-polizze-assicurative": {
   "nome": "Allegato: attestazione delle polizze assicurative",
   "descrizione": "Modulo da far compilare al cliente con l'elenco delle polizze assicurative.",
   "file": "strumenti-revisione/allegati/allegato-attestazione-delle-polizze-assicurative.docx",
   "tipo": "docx",
   "kb": 10,
   "testo": true
  },
  "email-invio-dell-attestazione-di-indipendenza": {
   "nome": "Email: invio dell'attestazione di indipendenza",
   "descrizione": "Testo dell'email con cui si invia al cliente l'attestazione di indipendenza.",
   "file": "strumenti-revisione/allegati/email-invio-dell-attestazione-di-indipendenza.docx",
   "tipo": "docx",
   "kb": 7,
   "testo": true
  },
  "attestazione-di-indipendenza": {
   "nome": "Attestazione di indipendenza",
   "descrizione": "Il modello dell'attestazione di indipendenza per la revisione del bilancio.",
   "file": "strumenti-revisione/allegati/attestazione-di-indipendenza.docx",
   "tipo": "docx",
   "kb": 13,
   "testo": true
  },
  "email-richiesta-di-incontro-e-documenti-per-la-verifica-trimestrale": {
   "nome": "Email: richiesta di incontro e documenti per la verifica trimestrale",
   "descrizione": "Testo dell'email per fissare la verifica trimestrale, con i documenti da consegnare entro il 15 del mese successivo.",
   "file": "strumenti-revisione/allegati/email-richiesta-di-incontro-e-documenti-per-la-verifica-trimestrale.docx",
   "tipo": "docx",
   "kb": 9,
   "testo": true
  },
  "bilancio-standard-comparato": {
   "nome": "Bilancio standard comparato",
   "descrizione": "Schema di stato patrimoniale e conto economico per confrontare il trimestre con lo stesso periodo dell'anno prima.",
   "file": "strumenti-revisione/allegati/bilancio-standard-comparato.xlsx",
   "tipo": "xlsx",
   "kb": 82
  },
  "verbale-di-consegna-del-bilancio-trimestrale": {
   "nome": "Verbale di consegna del bilancio trimestrale",
   "descrizione": "Verbale con cui la società consegna il bilancio trimestrale, da redigere su carta intestata.",
   "file": "strumenti-revisione/allegati/verbale-di-consegna-del-bilancio-trimestrale.docx",
   "tipo": "docx",
   "kb": 9,
   "testo": true
  },
  "segnalazioni-durante-le-verifiche-in-corso-di-esercizio-sa-250b": {
   "nome": "Segnalazioni durante le verifiche in corso di esercizio (SA 250B)",
   "descrizione": "Le differenze tra le segnalazioni durante le verifiche periodiche e quelle al momento del giudizio.",
   "file": "strumenti-revisione/allegati/segnalazioni-durante-le-verifiche-in-corso-di-esercizio-sa-250b.docx",
   "tipo": "docx",
   "kb": 8,
   "testo": true
  },
  "sintesi-del-documento-di-ricerca-assirevi-n-259": {
   "nome": "Sintesi del Documento di ricerca Assirevi n. 259",
   "descrizione": "Sintesi del documento Assirevi n. 259 sull'obbligo di segnalazione del revisore dopo il Correttivo-ter.",
   "file": "strumenti-revisione/allegati/sintesi-del-documento-di-ricerca-assirevi-n-259.docx",
   "tipo": "docx",
   "kb": 11,
   "testo": true
  },
  "assirevi-documento-di-ricerca-n-259": {
   "nome": "Assirevi, Documento di ricerca n. 259",
   "descrizione": "Il documento Assirevi sull'obbligo di segnalazione delle situazioni di crisi e insolvenza (art. 25-octies CCII).",
   "file": "strumenti-revisione/allegati/assirevi-documento-di-ricerca-n-259.pdf",
   "tipo": "pdf",
   "kb": 400
  },
  "test-segnali-di-crisi-ex-art-3-c-4-ccii": {
   "nome": "Test: segnali di crisi ex art. 3, c. 4 CCII",
   "descrizione": "Il test con gli indici, i dati e i documenti per verificare i segnali di crisi del trimestre.",
   "file": "strumenti-revisione/allegati/test-segnali-di-crisi-ex-art-3-c-4-ccii.xlsx",
   "tipo": "xlsx",
   "kb": 61
  },
  "email-inventario-di-fine-anno": {
   "nome": "Email: inventario di fine anno",
   "descrizione": "Testo dell'email al cliente con le istruzioni per la conta e i documenti da mandare dopo.",
   "file": "strumenti-revisione/allegati/email-inventario-di-fine-anno.docx",
   "tipo": "docx",
   "kb": 9,
   "testo": true
  },
  "allegato-1-manuale-di-inventario-fac-simile": {
   "nome": "Allegato 1: manuale di inventario (fac-simile)",
   "descrizione": "Esempio di istruzioni interne per organizzare l'inventario, da dare alla società.",
   "file": "strumenti-revisione/allegati/allegato-1-manuale-di-inventario-fac-simile.docx",
   "tipo": "docx",
   "kb": 201,
   "testo": true
  },
  "allegato-2-attestazione-frontespizio-da-inviare-con-il-bilancio": {
   "nome": "Allegato 2: attestazione (frontespizio da inviare con il bilancio)",
   "descrizione": "Frontespizio su carta intestata che la società manda con il bilancio: valore delle rimanenze e data della conta.",
   "file": "strumenti-revisione/allegati/allegato-2-attestazione-frontespizio-da-inviare-con-il-bilancio.docx",
   "tipo": "docx",
   "kb": 249,
   "testo": true
  },
  "allegato-3-focus-sulla-revisione-delle-rimanenze-di-magazzino": {
   "nome": "Allegato 3: focus sulla revisione delle rimanenze di magazzino",
   "descrizione": "Il documento Revilaw per i clienti su inventario e valutazione delle rimanenze.",
   "file": "strumenti-revisione/allegati/allegato-3-focus-sulla-revisione-delle-rimanenze-di-magazzino.pdf",
   "tipo": "pdf",
   "kb": 661
  },
  "allegato-4-valorizzazione-dell-inventario-di-magazzino-cliente": {
   "nome": "Allegato 4: valorizzazione dell'inventario di magazzino (cliente)",
   "descrizione": "Il foglio Excel in cui la società valorizza le giacenze (codice, quantità, carichi, scarichi, costo).",
   "file": "strumenti-revisione/allegati/allegato-4-valorizzazione-dell-inventario-di-magazzino-cliente.xlsx",
   "tipo": "xlsx",
   "kb": 57
  },
  "lettera-di-circolarizzazione-ai-depositari-delle-rimanenze": {
   "nome": "Lettera di circolarizzazione ai depositari delle rimanenze",
   "descrizione": "Lettera ai depositari delle merci della società, da far firmare su carta intestata.",
   "file": "strumenti-revisione/allegati/lettera-di-circolarizzazione-ai-depositari-delle-rimanenze.docx",
   "tipo": "docx",
   "kb": 319,
   "testo": true
  },
  "esempio-della-carta-di-lavoro-3-4-4-pianificazione": {
   "nome": "Esempio della carta di lavoro 3.4.4 Pianificazione",
   "descrizione": "Esempio di carta di lavoro 3.4.4 di pianificazione delle rimanenze compilata (società di prova).",
   "file": "strumenti-revisione/allegati/esempio-della-carta-di-lavoro-3-4-4-pianificazione.pdf",
   "tipo": "pdf",
   "kb": 48
  },
  "carta-di-lavoro-conta-fisica-del-revisore": {
   "nome": "Carta di lavoro: conta fisica del revisore",
   "descrizione": "Carta di lavoro per il riepilogo della conta fisica campionaria del revisore.",
   "file": "strumenti-revisione/allegati/carta-di-lavoro-conta-fisica-del-revisore.xlsx",
   "tipo": "xlsx",
   "kb": 57
  },
  "carta-di-lavoro-slow-moving": {
   "nome": "Carta di lavoro: slow moving",
   "descrizione": "Carta di lavoro per l'analisi dei prodotti a lento rigiro e degli stanziamenti.",
   "file": "strumenti-revisione/allegati/carta-di-lavoro-slow-moving.xlsx",
   "tipo": "xlsx",
   "kb": 63
  },
  "carta-di-lavoro-price-test": {
   "nome": "Carta di lavoro: price test",
   "descrizione": "Carta di lavoro per il controllo della valorizzazione delle giacenze sui documenti di acquisto.",
   "file": "strumenti-revisione/allegati/carta-di-lavoro-price-test.xlsx",
   "tipo": "xlsx",
   "kb": 53
  },
  "carta-di-lavoro-cut-off": {
   "nome": "Carta di lavoro: cut-off",
   "descrizione": "Carta di lavoro per verificare che i movimenti a cavallo della conta siano nel periodo giusto.",
   "file": "strumenti-revisione/allegati/carta-di-lavoro-cut-off.xlsx",
   "tipo": "xlsx",
   "kb": 56
  },
  "verbale-di-verifica-del-magazzino": {
   "nome": "Verbale di verifica del magazzino",
   "descrizione": "Il verbale della verifica di magazzino: data e luogo della conta, partecipanti, controlli svolti.",
   "file": "strumenti-revisione/allegati/verbale-di-verifica-del-magazzino.docx",
   "tipo": "docx",
   "kb": 227,
   "testo": true
  },
  "email-al-cliente-richiesta-dell-attestazione-per-le-circolarizzazioni": {
   "nome": "Email al cliente: richiesta dell'attestazione per le circolarizzazioni",
   "descrizione": "Testo dell'email al cliente per far compilare l'attestazione 2026 con i soggetti da circolarizzare.",
   "file": "strumenti-revisione/allegati/email-al-cliente-richiesta-dell-attestazione-per-le-circolarizzazioni.docx",
   "tipo": "docx",
   "kb": 8,
   "testo": true
  },
  "attestazione-dei-soggetti-obbligatori-2026-con-carte-prepagate": {
   "nome": "Attestazione dei soggetti obbligatori 2026 (con carte prepagate)",
   "descrizione": "L'attestazione 2026 in cui la società elenca banche, finanziatori, leasing, factoring, posta, consulenti, assicurazioni, depositari e tutte le carte prepagate, firmata dal legale rappresentante.",
   "file": "strumenti-revisione/allegati/attestazione-dei-soggetti-obbligatori-2026-con-carte-prepagate.pdf",
   "tipo": "pdf",
   "kb": 242
  },
  "autocertificazione-rischi-legali": {
   "nome": "Autocertificazione rischi legali",
   "descrizione": "Dichiarazione sostitutiva sull'assenza di rischi legali significativi, da far firmare quando non ci sono legali.",
   "file": "strumenti-revisione/allegati/autocertificazione-rischi-legali.docx",
   "tipo": "docx",
   "kb": 9,
   "testo": true
  },
  "guida-pratica-circolarizzazioni-e-conferme-legali": {
   "nome": "Guida pratica: circolarizzazioni e conferme legali",
   "descrizione": "Guida operativa a conferme esterne e risposte dei legali (ISA Italia 505 e 501, prassi Assirevi).",
   "file": "strumenti-revisione/allegati/guida-pratica-circolarizzazioni-e-conferme-legali.docx",
   "tipo": "docx",
   "kb": 15,
   "testo": true
  },
  "lettera-alla-societa-incaricata-della-conta-fisica-delle-rimanenze": {
   "nome": "Lettera alla società incaricata della conta fisica delle rimanenze",
   "descrizione": "Lettera alla società esterna che ha svolto la conta fisica delle rimanenze.",
   "file": "strumenti-revisione/allegati/lettera-alla-societa-incaricata-della-conta-fisica-delle-rimanenze.docx",
   "tipo": "docx",
   "kb": 14,
   "testo": true
  },
  "lettera-agli-enti-finanziatori": {
   "nome": "Lettera agli enti finanziatori",
   "descrizione": "Lettera di conferma agli enti finanziatori.",
   "file": "strumenti-revisione/allegati/lettera-agli-enti-finanziatori.docx",
   "tipo": "docx",
   "kb": 320,
   "testo": true
  },
  "lettera-agli-istituti-di-credito": {
   "nome": "Lettera agli istituti di credito",
   "descrizione": "Lettera di conferma alle banche (rapporti, saldi, garanzie), che chiede anche le carte prepagate emesse alla società.",
   "file": "strumenti-revisione/allegati/lettera-agli-istituti-di-credito.docx",
   "tipo": "docx",
   "kb": 15,
   "testo": true
  },
  "lettera-all-amministrazione-postale": {
   "nome": "Lettera all'amministrazione postale",
   "descrizione": "Lettera di conferma all'amministrazione postale.",
   "file": "strumenti-revisione/allegati/lettera-all-amministrazione-postale.docx",
   "tipo": "docx",
   "kb": 14,
   "testo": true
  },
  "lettera-ai-consulenti-del-lavoro": {
   "nome": "Lettera ai consulenti del lavoro",
   "descrizione": "Lettera di conferma al consulente del lavoro.",
   "file": "strumenti-revisione/allegati/lettera-ai-consulenti-del-lavoro.docx",
   "tipo": "docx",
   "kb": 320,
   "testo": true
  },
  "lettera-ai-consulenti-fiscali": {
   "nome": "Lettera ai consulenti fiscali",
   "descrizione": "Lettera di conferma al consulente fiscale.",
   "file": "strumenti-revisione/allegati/lettera-ai-consulenti-fiscali.docx",
   "tipo": "docx",
   "kb": 15,
   "testo": true
  },
  "lettera-ai-consulenti-legali": {
   "nome": "Lettera ai consulenti legali",
   "descrizione": "Lettera ai legali su contenziosi e passività potenziali.",
   "file": "strumenti-revisione/allegati/lettera-ai-consulenti-legali.docx",
   "tipo": "docx",
   "kb": 14,
   "testo": true
  },
  "lettera-alle-compagnie-assicurative": {
   "nome": "Lettera alle compagnie assicurative",
   "descrizione": "Lettera di conferma alle compagnie assicurative.",
   "file": "strumenti-revisione/allegati/lettera-alle-compagnie-assicurative.docx",
   "tipo": "docx",
   "kb": 14,
   "testo": true
  },
  "lettera-alle-societa-di-leasing": {
   "nome": "Lettera alle società di leasing",
   "descrizione": "Lettera di conferma alle società di leasing.",
   "file": "strumenti-revisione/allegati/lettera-alle-societa-di-leasing.docx",
   "tipo": "docx",
   "kb": 14,
   "testo": true
  },
  "lettera-alle-societa-di-factor": {
   "nome": "Lettera alle società di factor",
   "descrizione": "Lettera di conferma alle società di factoring.",
   "file": "strumenti-revisione/allegati/lettera-alle-societa-di-factor.docx",
   "tipo": "docx",
   "kb": 14,
   "testo": true
  },
  "lettera-ai-depositanti-delle-rimanenze-di-magazzino": {
   "nome": "Lettera ai depositanti delle rimanenze di magazzino",
   "descrizione": "Lettera di conferma a chi custodisce merci della società.",
   "file": "strumenti-revisione/allegati/lettera-ai-depositanti-delle-rimanenze-di-magazzino.docx",
   "tipo": "docx",
   "kb": 13,
   "testo": true
  },
  "lettera-alle-parti-correlate-e-societa-del-gruppo": {
   "nome": "Lettera alle parti correlate e società del gruppo",
   "descrizione": "Lettera di conferma dei rapporti, crediti e debiti con le società del gruppo e le altre parti correlate.",
   "file": "strumenti-revisione/allegati/lettera-alle-parti-correlate-e-societa-del-gruppo.docx",
   "tipo": "docx",
   "kb": 15,
   "testo": true
  },
  "email-invio-delle-lettere-di-circolarizzazione": {
   "nome": "Email: invio delle lettere di circolarizzazione",
   "descrizione": "Testo dell'email con cui si mandano al cliente le lettere da intestare e firmare.",
   "file": "strumenti-revisione/allegati/email-invio-delle-lettere-di-circolarizzazione.docx",
   "tipo": "docx",
   "kb": 7,
   "testo": true
  },
  "report-del-team-soggetti-obbligatori-e-risposte": {
   "nome": "Report del team: soggetti obbligatori e risposte",
   "descrizione": "Foglio per il report delle risposte: soggetto, PEC, risposta ricevuta e date dei solleciti.",
   "file": "strumenti-revisione/allegati/report-del-team-soggetti-obbligatori-e-risposte.xlsx",
   "tipo": "xlsx",
   "kb": 51
  },
  "email-richiesta-della-centrale-rischi": {
   "nome": "Email: richiesta della Centrale Rischi",
   "descrizione": "Testo dell'email per chiedere al cliente l'estratto della Centrale Rischi al 31/12/2026.",
   "file": "strumenti-revisione/allegati/email-richiesta-della-centrale-rischi.docx",
   "tipo": "docx",
   "kb": 7,
   "testo": true
  },
  "email-richiesta-del-libro-cespiti": {
   "nome": "Email: richiesta del libro cespiti",
   "descrizione": "Testo dell'email per chiedere libro cespiti, schede contabili e documenti delle immobilizzazioni.",
   "file": "strumenti-revisione/allegati/email-richiesta-del-libro-cespiti.docx",
   "tipo": "docx",
   "kb": 7,
   "testo": true
  },
  "grandezza-del-campione": {
   "nome": "Grandezza del campione",
   "descrizione": "Come calcolare intervallo di campionamento e numero di cespiti da verificare.",
   "file": "strumenti-revisione/allegati/grandezza-del-campione.docx",
   "tipo": "docx",
   "kb": 24,
   "testo": true
  },
  "campionamento-ragionato-dei-cespiti": {
   "nome": "Campionamento ragionato dei cespiti",
   "descrizione": "I parametri per scegliere i cespiti con il campionamento ragionato.",
   "file": "strumenti-revisione/allegati/campionamento-ragionato-dei-cespiti.docx",
   "tipo": "docx",
   "kb": 7,
   "testo": true
  },
  "test-overall-del-fondo-ammortamento": {
   "nome": "Test overall del fondo ammortamento",
   "descrizione": "Foglio per il test di ragionevolezza complessiva del fondo ammortamento.",
   "file": "strumenti-revisione/allegati/test-overall-del-fondo-ammortamento.xlsx",
   "tipo": "xlsx",
   "kb": 55
  },
  "test-di-ricalcolo-delle-quote-di-ammortamento": {
   "nome": "Test di ricalcolo delle quote di ammortamento",
   "descrizione": "Foglio per ricalcolare le quote di ammortamento dei cespiti campionati.",
   "file": "strumenti-revisione/allegati/test-di-ricalcolo-delle-quote-di-ammortamento.xlsx",
   "tipo": "xlsx",
   "kb": 56
  },
  "test-incrementi-e-decrementi": {
   "nome": "Test incrementi e decrementi",
   "descrizione": "Foglio per verificare gli incrementi e i decrementi dell'anno sui documenti.",
   "file": "strumenti-revisione/allegati/test-incrementi-e-decrementi.xlsx",
   "tipo": "xlsx",
   "kb": 119
  },
  "verbale-di-verifica-dei-beni-strumentali": {
   "nome": "Verbale di verifica dei beni strumentali",
   "descrizione": "Verbale della verifica fisica dei beni strumentali presso la società.",
   "file": "strumenti-revisione/allegati/verbale-di-verifica-dei-beni-strumentali.docx",
   "tipo": "docx",
   "kb": 485,
   "testo": true
  },
  "email-richiesta-della-documentazione-per-la-circolarizzazione-clienti-e": {
   "nome": "Email: richiesta della documentazione per la circolarizzazione clienti e fornitori",
   "descrizione": "Testo dell'email per chiedere schede contabili ed elenchi di clienti e fornitori.",
   "file": "strumenti-revisione/allegati/email-richiesta-della-documentazione-per-la-circolarizzazione-clienti-e.docx",
   "tipo": "docx",
   "kb": 8,
   "testo": true
  },
  "allegato-elenco-clienti": {
   "nome": "Allegato: elenco clienti",
   "descrizione": "Il foglio da far compilare con codice, descrizione, progressivo dare e saldo di ogni cliente.",
   "file": "strumenti-revisione/allegati/allegato-elenco-clienti.xlsx",
   "tipo": "xlsx",
   "kb": 11
  },
  "allegato-elenco-fornitori": {
   "nome": "Allegato: elenco fornitori",
   "descrizione": "Il foglio da far compilare con codice, descrizione, progressivo avere e saldo di ogni fornitore.",
   "file": "strumenti-revisione/allegati/allegato-elenco-fornitori.xlsx",
   "tipo": "xlsx",
   "kb": 11
  },
  "note-sui-segni-dei-saldi-dare-avere": {
   "nome": "Note sui segni +/- dei saldi dare/avere",
   "descrizione": "Con quale segno importare in Revisoft i saldi di clienti e fornitori.",
   "file": "strumenti-revisione/allegati/note-sui-segni-dei-saldi-dare-avere.docx",
   "tipo": "docx",
   "kb": 7,
   "testo": true
  },
  "istruzioni-revisoft-campionamento": {
   "nome": "Istruzioni Revisoft: campionamento",
   "descrizione": "Le istruzioni Revisoft per il campionamento di clienti (3.4.7), fornitori (3.4.17) e magazzino (3.4.4).",
   "file": "strumenti-revisione/allegati/istruzioni-revisoft-campionamento.pdf",
   "tipo": "pdf",
   "kb": 771
  },
  "chiarimenti-per-il-campionamento": {
   "nome": "Chiarimenti per il campionamento",
   "descrizione": "Suggerimenti sul metodo di campionamento, anche alla luce del documento CNDCEC del 2018.",
   "file": "strumenti-revisione/allegati/chiarimenti-per-il-campionamento.pdf",
   "tipo": "pdf",
   "kb": 164
  },
  "xls-per-il-campionamento-pec-di-clienti-e-fornitori": {
   "nome": "Xls per il campionamento: PEC di clienti e fornitori",
   "descrizione": "Il foglio con cui chiedere alla società le PEC dei clienti e fornitori campionati.",
   "file": "strumenti-revisione/allegati/xls-per-il-campionamento-pec-di-clienti-e-fornitori.xlsx",
   "tipo": "xlsx",
   "kb": 40
  },
  "lettera-ai-clienti": {
   "nome": "Lettera ai clienti",
   "descrizione": "Lettera di conferma del saldo ai clienti, da unire all'estratto conto al 31/12.",
   "file": "strumenti-revisione/allegati/lettera-ai-clienti.docx",
   "tipo": "docx",
   "kb": 322,
   "testo": true
  },
  "lettera-ai-fornitori": {
   "nome": "Lettera ai fornitori",
   "descrizione": "Lettera di conferma del saldo ai fornitori.",
   "file": "strumenti-revisione/allegati/lettera-ai-fornitori.docx",
   "tipo": "docx",
   "kb": 16,
   "testo": true
  },
  "email-invio-delle-lettere-di-circolarizzazione-a-clienti-e-fornitori": {
   "nome": "Email: invio delle lettere di circolarizzazione a clienti e fornitori",
   "descrizione": "Testo dell'email con cui si mandano al cliente le lettere per clienti e fornitori.",
   "file": "strumenti-revisione/allegati/email-invio-delle-lettere-di-circolarizzazione-a-clienti-e-fornitori.docx",
   "tipo": "docx",
   "kb": 8,
   "testo": true
  },
  "report-del-team-clienti-fornitori-e-risposte": {
   "nome": "Report del team: clienti/fornitori e risposte",
   "descrizione": "Foglio per il report delle risposte di clienti e fornitori, con le date dei solleciti.",
   "file": "strumenti-revisione/allegati/report-del-team-clienti-fornitori-e-risposte.xlsx",
   "tipo": "xlsx",
   "kb": 51
  },
  "esempio-di-aging-dei-crediti-e-dei-debiti": {
   "nome": "Esempio di aging dei crediti e dei debiti",
   "descrizione": "Esempio di prospetto dell'anzianità di crediti e debiti per fasce di scaduto.",
   "file": "strumenti-revisione/allegati/esempio-di-aging-dei-crediti-e-dei-debiti.xlsx",
   "tipo": "xlsx",
   "kb": 107
  },
  "email-aggiornamenti-sulle-dichiarazioni-fiscali-2026-e-ruolo-della-socie": {
   "nome": "Email: aggiornamenti sulle dichiarazioni fiscali 2026 e ruolo della società di revisione",
   "descrizione": "Testo dell'email ai clienti su quali dichiarazioni richiedono la firma della società di revisione.",
   "file": "strumenti-revisione/allegati/email-aggiornamenti-sulle-dichiarazioni-fiscali-2026-e-ruolo-della-socie.docx",
   "tipo": "docx",
   "kb": 8,
   "testo": true
  },
  "email-comunicazione-del-progetto-di-bilancio-al-revisore-legale": {
   "nome": "Email: comunicazione del progetto di bilancio al revisore legale",
   "descrizione": "Testo dell'email al cliente sui termini dell'art. 2429 c.c. per mandare il progetto di bilancio.",
   "file": "strumenti-revisione/allegati/email-comunicazione-del-progetto-di-bilancio-al-revisore-legale.docx",
   "tipo": "docx",
   "kb": 7,
   "testo": true
  },
  "note-tecniche-mancata-comunicazione-del-progetto-di-bilancio-nei-tempi": {
   "nome": "Note tecniche: mancata comunicazione del progetto di bilancio nei tempi",
   "descrizione": "Cosa fare se il progetto di bilancio arriva in ritardo: rinuncia ai termini dei soci e paragrafo «Altri aspetti».",
   "file": "strumenti-revisione/allegati/note-tecniche-mancata-comunicazione-del-progetto-di-bilancio-nei-tempi.docx",
   "tipo": "docx",
   "kb": 8,
   "testo": true
  },
  "lettera-di-primo-sollecito": {
   "nome": "Lettera di primo sollecito",
   "descrizione": "Lettera di primo sollecito all'organo amministrativo per il progetto di bilancio.",
   "file": "strumenti-revisione/allegati/lettera-di-primo-sollecito.docx",
   "tipo": "docx",
   "kb": 328,
   "testo": true
  },
  "lettera-di-secondo-sollecito": {
   "nome": "Lettera di secondo sollecito",
   "descrizione": "Lettera di secondo sollecito all'organo amministrativo.",
   "file": "strumenti-revisione/allegati/lettera-di-secondo-sollecito.docx",
   "tipo": "docx",
   "kb": 325,
   "testo": true
  },
  "rinuncia-ai-termini-art-2429-c-c": {
   "nome": "Rinuncia ai termini (art. 2429 c.c.)",
   "descrizione": "Modello con cui ogni socio rinuncia ai termini dell'art. 2429 c.c. per il deposito della relazione.",
   "file": "strumenti-revisione/allegati/rinuncia-ai-termini-art-2429-c-c.docx",
   "tipo": "docx",
   "kb": 319,
   "testo": true
  },
  "attestazione-dei-controlli-sulle-parti-correlate-modello": {
   "nome": "Attestazione dei controlli sulle parti correlate (modello)",
   "descrizione": "Il modello dell'attestazione sui controlli delle parti correlate (ISA Italia 550).",
   "file": "strumenti-revisione/allegati/attestazione-dei-controlli-sulle-parti-correlate-modello.pdf",
   "tipo": "pdf",
   "kb": 279
  },
  "lettera-di-attestazione-bilancio-abbreviato": {
   "nome": "Lettera di attestazione: bilancio abbreviato",
   "descrizione": "Format Revilaw della lettera di attestazione per il bilancio abbreviato, da concordare con il responsabile qualità.",
   "file": "strumenti-revisione/allegati/lettera-di-attestazione-bilancio-abbreviato.docx",
   "tipo": "docx",
   "kb": 169
  },
  "lettera-di-attestazione-bilancio-ordinario-con-relazione-sulla-gestione": {
   "nome": "Lettera di attestazione: bilancio ordinario con relazione sulla gestione e collegio sindacale",
   "descrizione": "Format Revilaw della lettera di attestazione per il bilancio ordinario con relazione sulla gestione e collegio sindacale.",
   "file": "strumenti-revisione/allegati/lettera-di-attestazione-bilancio-ordinario-con-relazione-sulla-gestione.docx",
   "tipo": "docx",
   "kb": 170
  },
  "assirevi-documento-di-ricerca-n-251r-2026-le-attestazioni-della-direzion": {
   "nome": "Assirevi, Documento di ricerca n. 251R/2026: le attestazioni della Direzione",
   "descrizione": "Il documento Assirevi sulle attestazioni scritte della direzione.",
   "file": "strumenti-revisione/allegati/assirevi-documento-di-ricerca-n-251r-2026-le-attestazioni-della-direzion.docx",
   "tipo": "docx",
   "kb": 136
  },
  "giudizio-bilancio-ordinario-senza-collegio": {
   "nome": "Giudizio: bilancio ordinario (senza collegio)",
   "descrizione": "Format della relazione di revisione per il bilancio ordinario, società senza collegio sindacale.",
   "file": "strumenti-revisione/allegati/giudizio-bilancio-ordinario-senza-collegio.docx",
   "tipo": "docx",
   "kb": 465,
   "testo": true
  },
  "giudizio-bilancio-ordinario-con-collegio": {
   "nome": "Giudizio: bilancio ordinario (con collegio)",
   "descrizione": "Format della relazione di revisione per il bilancio ordinario, società con collegio sindacale.",
   "file": "strumenti-revisione/allegati/giudizio-bilancio-ordinario-con-collegio.docx",
   "tipo": "docx",
   "kb": 465,
   "testo": true
  },
  "giudizio-bilancio-abbreviato-senza-collegio": {
   "nome": "Giudizio: bilancio abbreviato (senza collegio)",
   "descrizione": "Format della relazione di revisione per il bilancio abbreviato, società senza collegio sindacale.",
   "file": "strumenti-revisione/allegati/giudizio-bilancio-abbreviato-senza-collegio.docx",
   "tipo": "docx",
   "kb": 465,
   "testo": true
  },
  "giudizio-con-rilievi-bilancio-abbreviato-senza-collegio": {
   "nome": "Giudizio con rilievi: bilancio abbreviato (senza collegio)",
   "descrizione": "Format della relazione con giudizio con rilievi, bilancio abbreviato senza collegio sindacale.",
   "file": "strumenti-revisione/allegati/giudizio-con-rilievi-bilancio-abbreviato-senza-collegio.docx",
   "tipo": "docx",
   "kb": 465,
   "testo": true
  },
  "impossibilita-di-esprimere-un-giudizio-bilancio-abbreviato-senza-collegi": {
   "nome": "Impossibilità di esprimere un giudizio: bilancio abbreviato (senza collegio)",
   "descrizione": "Format della relazione con dichiarazione di impossibilità di esprimere un giudizio, bilancio abbreviato senza collegio.",
   "file": "strumenti-revisione/allegati/impossibilita-di-esprimere-un-giudizio-bilancio-abbreviato-senza-collegi.docx",
   "tipo": "docx",
   "kb": 466,
   "testo": true
  },
  "report-of-the-independent-legal-auditor-in-inglese": {
   "nome": "Report of the independent legal auditor (in inglese)",
   "descrizione": "La relazione di revisione in inglese.",
   "file": "strumenti-revisione/allegati/report-of-the-independent-legal-auditor-in-inglese.docx",
   "tipo": "docx",
   "kb": 2347,
   "testo": true
  },
  "ciclo-delle-verifiche-periodiche-area-4": {
   "nome": "Ciclo delle verifiche periodiche (area 4)",
   "descrizione": "Quali libri e registri verificare e con che frequenza nelle carte dell'area 4, e dove inserire gli allegati.",
   "file": "strumenti-revisione/allegati/ciclo-delle-verifiche-periodiche-area-4.xlsx",
   "tipo": "xlsx",
   "kb": 22
  },
  "import-del-bilancio": {
   "nome": "Import del bilancio",
   "descrizione": "Come compilare le carte dell'area 3 con il bilancio di verifica, anche per i bilanci abbreviati.",
   "file": "strumenti-revisione/allegati/import-del-bilancio.docx",
   "tipo": "docx",
   "kb": 7,
   "testo": true
  },
  "materialita-di-bilancio": {
   "nome": "Materialità di bilancio",
   "descrizione": "Quando completare la carta della materialità, dopo l'import del bilancio nella 3.1.1.",
   "file": "strumenti-revisione/allegati/materialita-di-bilancio.docx",
   "tipo": "docx",
   "kb": 7,
   "testo": true
  },
  "carte-di-lavoro-pianificazione-e-controllo": {
   "nome": "Carte di lavoro «Pianificazione» e «Controllo»",
   "descrizione": "Quando una carta «Pianificazione» o «Controllo» può essere N/A e quali controlli pianificare sempre.",
   "file": "strumenti-revisione/allegati/carte-di-lavoro-pianificazione-e-controllo.docx",
   "tipo": "docx",
   "kb": 7,
   "testo": true
  },
  "errori-nel-bilancio": {
   "nome": "Errori nel bilancio",
   "descrizione": "Come funziona il sommario degli errori e come si alimenta dalle carte di controllo.",
   "file": "strumenti-revisione/allegati/errori-nel-bilancio.docx",
   "tipo": "docx",
   "kb": 7,
   "testo": true
  },
  "pacchetto-kickoff": {
   "nome": "Pacchetto Kickoff",
   "descrizione": "Il set di documenti e le milestone iniziali per avviare subito le verifiche sul bilancio.",
   "file": "strumenti-revisione/allegati/pacchetto-kickoff.xlsx",
   "tipo": "xlsx",
   "kb": 9
  },
  "controlli-immobilizzazioni-immateriali": {
   "nome": "Controlli: immobilizzazioni immateriali",
   "descrizione": "Cosa verificare per questa voce nelle carte Revisoft: in pianificazione materialità, rischio di individuazione, R-factor e verifiche obbligatorie; nel controllo le voci da controllare, le conclusioni con gli errori e gli allegati obbligatori nella carta Ctrl.",
   "file": "strumenti-revisione/allegati/controlli-immobilizzazioni-immateriali.docx",
   "tipo": "docx",
   "kb": 12,
   "testo": true
  },
  "controlli-immobilizzazioni-materiali": {
   "nome": "Controlli: immobilizzazioni materiali",
   "descrizione": "Cosa verificare per questa voce nelle carte Revisoft: in pianificazione materialità, rischio di individuazione, R-factor e verifiche obbligatorie; nel controllo le voci da controllare, le conclusioni con gli errori e gli allegati obbligatori nella carta Ctrl.",
   "file": "strumenti-revisione/allegati/controlli-immobilizzazioni-materiali.docx",
   "tipo": "docx",
   "kb": 12,
   "testo": true
  },
  "controlli-immobilizzazioni-finanziarie": {
   "nome": "Controlli: immobilizzazioni finanziarie",
   "descrizione": "Cosa verificare per questa voce nelle carte Revisoft: in pianificazione materialità, rischio di individuazione, R-factor e verifiche obbligatorie; nel controllo le voci da controllare, le conclusioni con gli errori e gli allegati obbligatori nella carta Ctrl.",
   "file": "strumenti-revisione/allegati/controlli-immobilizzazioni-finanziarie.docx",
   "tipo": "docx",
   "kb": 12,
   "testo": true
  },
  "controlli-rimanenze-di-magazzino": {
   "nome": "Controlli: rimanenze di magazzino",
   "descrizione": "Cosa verificare per questa voce nelle carte Revisoft: in pianificazione materialità, rischio di individuazione, R-factor e verifiche obbligatorie; nel controllo le voci da controllare, le conclusioni con gli errori e gli allegati obbligatori nella carta Ctrl.",
   "file": "strumenti-revisione/allegati/controlli-rimanenze-di-magazzino.docx",
   "tipo": "docx",
   "kb": 99,
   "testo": true
  },
  "controlli-rimanenze-commesse-e-opere-a-lungo-termine": {
   "nome": "Controlli: rimanenze, commesse e opere a lungo termine",
   "descrizione": "Cosa verificare per questa voce nelle carte Revisoft: in pianificazione materialità, rischio di individuazione, R-factor e verifiche obbligatorie; nel controllo le voci da controllare, le conclusioni con gli errori e gli allegati obbligatori nella carta Ctrl.",
   "file": "strumenti-revisione/allegati/controlli-rimanenze-commesse-e-opere-a-lungo-termine.docx",
   "tipo": "docx",
   "kb": 11,
   "testo": true
  },
  "controlli-attivita-finanziarie-non-immobilizzate": {
   "nome": "Controlli: attività finanziarie non immobilizzate",
   "descrizione": "Cosa verificare per questa voce nelle carte Revisoft: in pianificazione materialità, rischio di individuazione, R-factor e verifiche obbligatorie; nel controllo le voci da controllare, le conclusioni con gli errori e gli allegati obbligatori nella carta Ctrl.",
   "file": "strumenti-revisione/allegati/controlli-attivita-finanziarie-non-immobilizzate.docx",
   "tipo": "docx",
   "kb": 11,
   "testo": true
  },
  "controlli-crediti-commerciali-clienti": {
   "nome": "Controlli: crediti commerciali (clienti)",
   "descrizione": "Cosa verificare per questa voce nelle carte Revisoft: in pianificazione materialità, rischio di individuazione, R-factor e verifiche obbligatorie; nel controllo le voci da controllare, le conclusioni con gli errori e gli allegati obbligatori nella carta Ctrl.",
   "file": "strumenti-revisione/allegati/controlli-crediti-commerciali-clienti.docx",
   "tipo": "docx",
   "kb": 71,
   "testo": true
  },
  "controlli-crediti-e-debiti-infragruppo": {
   "nome": "Controlli: crediti e debiti infragruppo",
   "descrizione": "Cosa verificare per questa voce nelle carte Revisoft: in pianificazione materialità, rischio di individuazione, R-factor e verifiche obbligatorie; nel controllo le voci da controllare, le conclusioni con gli errori e gli allegati obbligatori nella carta Ctrl.",
   "file": "strumenti-revisione/allegati/controlli-crediti-e-debiti-infragruppo.docx",
   "tipo": "docx",
   "kb": 12,
   "testo": true
  },
  "controlli-crediti-tributari-e-per-imposte-anticipate": {
   "nome": "Controlli: crediti tributari e per imposte anticipate",
   "descrizione": "Cosa verificare per questa voce nelle carte Revisoft: in pianificazione materialità, rischio di individuazione, R-factor e verifiche obbligatorie; nel controllo le voci da controllare, le conclusioni con gli errori e gli allegati obbligatori nella carta Ctrl.",
   "file": "strumenti-revisione/allegati/controlli-crediti-tributari-e-per-imposte-anticipate.docx",
   "tipo": "docx",
   "kb": 12,
   "testo": true
  },
  "controlli-crediti-verso-altri": {
   "nome": "Controlli: crediti verso altri",
   "descrizione": "Cosa verificare per questa voce nelle carte Revisoft: in pianificazione materialità, rischio di individuazione, R-factor e verifiche obbligatorie; nel controllo le voci da controllare, le conclusioni con gli errori e gli allegati obbligatori nella carta Ctrl.",
   "file": "strumenti-revisione/allegati/controlli-crediti-verso-altri.docx",
   "tipo": "docx",
   "kb": 11,
   "testo": true
  },
  "controlli-cassa-e-banche": {
   "nome": "Controlli: cassa e banche",
   "descrizione": "Cosa verificare per questa voce nelle carte Revisoft: in pianificazione materialità, rischio di individuazione, R-factor e verifiche obbligatorie; nel controllo le voci da controllare, le conclusioni con gli errori e gli allegati obbligatori nella carta Ctrl.",
   "file": "strumenti-revisione/allegati/controlli-cassa-e-banche.docx",
   "tipo": "docx",
   "kb": 12,
   "testo": true
  },
  "controlli-ratei-e-risconti-attivi-e-passivi": {
   "nome": "Controlli: ratei e risconti (attivi e passivi)",
   "descrizione": "Cosa verificare per questa voce nelle carte Revisoft: in pianificazione materialità, rischio di individuazione, R-factor e verifiche obbligatorie; nel controllo le voci da controllare, le conclusioni con gli errori e gli allegati obbligatori nella carta Ctrl.",
   "file": "strumenti-revisione/allegati/controlli-ratei-e-risconti-attivi-e-passivi.docx",
   "tipo": "docx",
   "kb": 12,
   "testo": true
  },
  "controlli-patrimonio-netto": {
   "nome": "Controlli: patrimonio netto",
   "descrizione": "Cosa verificare per questa voce nelle carte Revisoft: in pianificazione materialità, rischio di individuazione, R-factor e verifiche obbligatorie; nel controllo le voci da controllare, le conclusioni con gli errori e gli allegati obbligatori nella carta Ctrl.",
   "file": "strumenti-revisione/allegati/controlli-patrimonio-netto.docx",
   "tipo": "docx",
   "kb": 12,
   "testo": true
  },
  "controlli-fondi-per-rischi-e-oneri": {
   "nome": "Controlli: fondi per rischi e oneri",
   "descrizione": "Cosa verificare per questa voce nelle carte Revisoft: in pianificazione materialità, rischio di individuazione, R-factor e verifiche obbligatorie; nel controllo le voci da controllare, le conclusioni con gli errori e gli allegati obbligatori nella carta Ctrl.",
   "file": "strumenti-revisione/allegati/controlli-fondi-per-rischi-e-oneri.docx",
   "tipo": "docx",
   "kb": 12,
   "testo": true
  },
  "controlli-t-f-r": {
   "nome": "Controlli: T.F.R.",
   "descrizione": "Cosa verificare per questa voce nelle carte Revisoft: in pianificazione materialità, rischio di individuazione, R-factor e verifiche obbligatorie; nel controllo le voci da controllare, le conclusioni con gli errori e gli allegati obbligatori nella carta Ctrl.",
   "file": "strumenti-revisione/allegati/controlli-t-f-r.docx",
   "tipo": "docx",
   "kb": 12,
   "testo": true
  },
  "controlli-mutui-e-finanziamenti-non-bancari": {
   "nome": "Controlli: mutui e finanziamenti non bancari",
   "descrizione": "Cosa verificare per questa voce nelle carte Revisoft: in pianificazione materialità, rischio di individuazione, R-factor e verifiche obbligatorie; nel controllo le voci da controllare, le conclusioni con gli errori e gli allegati obbligatori nella carta Ctrl.",
   "file": "strumenti-revisione/allegati/controlli-mutui-e-finanziamenti-non-bancari.docx",
   "tipo": "docx",
   "kb": 12,
   "testo": true
  },
  "controlli-debiti-commerciali-fornitori": {
   "nome": "Controlli: debiti commerciali (fornitori)",
   "descrizione": "Cosa verificare per questa voce nelle carte Revisoft: in pianificazione materialità, rischio di individuazione, R-factor e verifiche obbligatorie; nel controllo le voci da controllare, le conclusioni con gli errori e gli allegati obbligatori nella carta Ctrl.",
   "file": "strumenti-revisione/allegati/controlli-debiti-commerciali-fornitori.docx",
   "tipo": "docx",
   "kb": 71,
   "testo": true
  },
  "controlli-debiti-tributari": {
   "nome": "Controlli: debiti tributari",
   "descrizione": "Cosa verificare per questa voce nelle carte Revisoft: in pianificazione materialità, rischio di individuazione, R-factor e verifiche obbligatorie; nel controllo le voci da controllare, le conclusioni con gli errori e gli allegati obbligatori nella carta Ctrl.",
   "file": "strumenti-revisione/allegati/controlli-debiti-tributari.docx",
   "tipo": "docx",
   "kb": 12,
   "testo": true
  },
  "controlli-debiti-verso-altri": {
   "nome": "Controlli: debiti verso altri",
   "descrizione": "Cosa verificare per questa voce nelle carte Revisoft: in pianificazione materialità, rischio di individuazione, R-factor e verifiche obbligatorie; nel controllo le voci da controllare, le conclusioni con gli errori e gli allegati obbligatori nella carta Ctrl.",
   "file": "strumenti-revisione/allegati/controlli-debiti-verso-altri.docx",
   "tipo": "docx",
   "kb": 12,
   "testo": true
  },
  "controlli-ce-valore-della-produzione": {
   "nome": "Controlli: CE, valore della produzione",
   "descrizione": "Cosa verificare per questa voce nelle carte Revisoft: in pianificazione materialità, rischio di individuazione, R-factor e verifiche obbligatorie; nel controllo le voci da controllare, le conclusioni con gli errori e gli allegati obbligatori nella carta Ctrl.",
   "file": "strumenti-revisione/allegati/controlli-ce-valore-della-produzione.docx",
   "tipo": "docx",
   "kb": 12,
   "testo": true
  },
  "verifica-della-corretta-applicazione-del-nuovo-oic-34": {
   "nome": "Verifica della corretta applicazione del nuovo OIC 34",
   "descrizione": "Come verificare la corretta applicazione dell'OIC 34 sui ricavi.",
   "file": "strumenti-revisione/allegati/verifica-della-corretta-applicazione-del-nuovo-oic-34.docx",
   "tipo": "docx",
   "kb": 9,
   "testo": true
  },
  "controlli-ce-costi-della-produzione": {
   "nome": "Controlli: CE, costi della produzione",
   "descrizione": "Cosa verificare per questa voce nelle carte Revisoft: in pianificazione materialità, rischio di individuazione, R-factor e verifiche obbligatorie; nel controllo le voci da controllare, le conclusioni con gli errori e gli allegati obbligatori nella carta Ctrl.",
   "file": "strumenti-revisione/allegati/controlli-ce-costi-della-produzione.docx",
   "tipo": "docx",
   "kb": 12,
   "testo": true
  },
  "controlli-ce-gestione-finanziaria": {
   "nome": "Controlli: CE, gestione finanziaria",
   "descrizione": "Cosa verificare per questa voce nelle carte Revisoft: in pianificazione materialità, rischio di individuazione, R-factor e verifiche obbligatorie; nel controllo le voci da controllare, le conclusioni con gli errori e gli allegati obbligatori nella carta Ctrl.",
   "file": "strumenti-revisione/allegati/controlli-ce-gestione-finanziaria.docx",
   "tipo": "docx",
   "kb": 11,
   "testo": true
  },
  "verifica-della-continuita-aziendale-linee-guida-per-il-revisore": {
   "nome": "Verifica della continuità aziendale: linee guida per il revisore",
   "descrizione": "Linee guida sulla continuità aziendale in ottica di segnalazione della crisi (D.Lgs. 136/2024).",
   "file": "strumenti-revisione/allegati/verifica-della-continuita-aziendale-linee-guida-per-il-revisore.docx",
   "tipo": "docx",
   "kb": 153,
   "testo": true
  },
  "sommario-errori": {
   "nome": "Sommario errori",
   "descrizione": "Esempio del sommario degli errori, comprese le riclassifiche.",
   "file": "strumenti-revisione/allegati/sommario-errori.docx",
   "tipo": "docx",
   "kb": 127,
   "testo": true
  }
 }
};
window.RV_STRUMENTI_REVISIONE.fascicoli = {"2026": {"circObbligatorie": {"file": "strumenti-revisione/fascicoli/2026-circObbligatorie.pdf?v=0444975aca", "pagine": 40, "kb": 830, "documenti": 19}, "circClientiFornitori": {"file": "strumenti-revisione/fascicoli/2026-circClientiFornitori.pdf?v=7e27baae9d", "pagine": 29, "kb": 1251, "documenti": 12}}};
