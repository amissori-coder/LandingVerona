/* ============================================================
   AREA RISERVATA REVILAW - Dati dimostrativi
   ------------------------------------------------------------
   ATTENZIONE: questo file e' pubblicato sul sito, quindi
   contiene SOLO dati fittizi. I dati reali si caricano dalla
   funzione "Importa dati" (restano nel browser, mai sul sito).
   ============================================================ */

const RV_ROSTER = {
    qualita: ['Magaraci', 'Missori', 'Pani', 'Pisano'],
    respIncarico: ['Magaraci', 'Missori', 'Napolitano', 'Novembre', 'Pisano', 'Sterzi'],
    team: [
        'Agretti', 'Astone', 'Augello', 'Baggio', 'Bordignon', 'Calabria', 'Cambrea',
        'Candelieri', 'Cassia', 'Castellani', 'Cecchinato', 'Cerasa', 'Culpo',
        'Evangelista', 'Falconi', 'Ferrari', 'Fiameni', 'Fontanive', 'Giannelli',
        'Ingargiola', 'Invitti', 'Lasso', 'Lo Piccolo', 'Magaraci', 'Mariani',
        'Marra', 'Martella', 'Michelin', 'Missori', 'Mitrione', 'Mostacci',
        'Napolitano', 'Novembre', 'Pani', 'Pastorino', 'Pescatori', 'Pisano',
        'Portinari', 'Sangiorgio', 'Serinelli', 'Sideri', 'Speca', 'Sterzi',
        'Tonni', 'Trusso', 'Vaglica', 'Varetti', 'Zanchetto'
    ],
    aree: ['Nord', 'Centro', 'Sud'],
    regioni: [
        'Abruzzo', 'Basilicata', 'Calabria', 'Campania', 'Emilia Romagna',
        'Friuli Venezia Giulia', 'Lazio', 'Liguria', 'Lombardia', 'Marche',
        'Molise', 'Piemonte', 'Puglia', 'Sardegna', 'Sicilia', 'Toscana',
        'Trentino Alto Adige', 'Umbria', "Valle d'Aosta", 'Veneto'
    ]
};

/* Utenti iniziali: l'amministratore reale piu' due profili di prova.
   Le password NON sono precaricate: ogni utente richiede la prima
   password dal pulsante dedicato nella pagina di accesso. */
const RV_UTENTI_INIZIALI = [
    { email: 'a.missori@emvas.tax', nome: 'Andrea Missori', ruolo: 'admin' },
    { email: 'qualita@demo.revilaw.it', nome: 'Utente Qualita (demo)', ruolo: 'qualita' },
    { email: 'procuratore@demo.revilaw.it', nome: 'Utente Procuratore (demo)', ruolo: 'procuratore' }
];

/* Incarichi dimostrativi: societa' fittizie con struttura identica
   all'elenco reale (tipo, date, team, compensi per anno). */
const RV_INCARICHI_DEMO = [
    { cliente: 'ALFA MECCANICA SRL', tipo: 'legale', codiceFiscale: '01234560101', area: 'Nord', regione: 'Lombardia', localita: 'MILANO', dataInizio: '2023-05-10', dataFine: '2026-04-30', qualita: 'Magaraci', respIncarico: 'Sterzi', referente: 'Culpo', team: 'Culpo, Falconi', email1: 'amministrazione@alfameccanica.example', compensi: { 2023: 7500, 2024: 7500, 2025: 7500 }, fatturazione: 'annuale' },
    { cliente: 'BORGO VINI SPA', tipo: 'legale', codiceFiscale: '01234560102', area: 'Nord', regione: 'Veneto', localita: 'VERONA', dataInizio: '2024-04-28', dataFine: '2027-04-30', qualita: 'Pisano', respIncarico: 'Missori', referente: 'Zanchetto', team: 'Zanchetto, Baggio', email1: 'afc@borgovini.example', compensi: { 2024: 11000, 2025: 11000, 2026: 11000 }, fatturazione: 'trimestrale' },
    { cliente: 'CARTOTECNICA DEL PO SRL', tipo: 'legale', codiceFiscale: '01234560103', area: 'Nord', regione: 'Emilia Romagna', localita: 'PARMA', dataInizio: '2022-05-02', dataFine: '2025-04-30', rinnovo: '2028-04-30', qualita: 'Magaraci', respIncarico: 'Magaraci', referente: 'Novembre', team: 'Pastorino', email1: 'bilancio@cartopo.example', compensi: { 2022: 6500, 2023: 6500, 2024: 6500, 2025: 6800, 2026: 6800, 2027: 6800 }, fatturazione: 'annuale' },
    { cliente: 'DELTA LOGISTICA SPA', tipo: 'legale', codiceFiscale: '01234560104', area: 'Centro', regione: 'Lazio', localita: 'ROMA', dataInizio: '2023-06-15', dataFine: '2026-04-30', qualita: 'Pani', respIncarico: 'Sterzi', referente: 'Lo Piccolo', team: 'Lo Piccolo, Cerasa', email1: 'cfo@deltalog.example', compensi: { 2023: 14000, 2024: 14000, 2025: 14000 }, fatturazione: 'mensile' },
    { cliente: 'ETRURIA IMPIANTI SRL', tipo: 'legale', codiceFiscale: '01234560105', area: 'Centro', regione: 'Toscana', localita: 'FIRENZE', dataInizio: '2024-05-20', dataFine: '2027-04-30', qualita: 'Pani', respIncarico: 'Missori', referente: 'Missori', team: 'Mitrione, Evangelista', email1: 'contabilita@etruriaimpianti.example', compensi: { 2024: 6000, 2025: 6000, 2026: 6000 }, fatturazione: 'annuale' },
    { cliente: 'FARO EDITORE SRL', tipo: 'volontaria', codiceFiscale: '01234560106', area: 'Nord', regione: 'Lombardia', localita: 'MILANO', dataInizio: '2025-01-01', dataFine: '2025-12-31', dataInizioNote: 'Rev. volontaria 2025', qualita: 'Magaraci', respIncarico: 'Sterzi', referente: 'Magaraci', team: 'Calabria, Sideri', email1: 'direzione@faroeditore.example', compensi: { 2025: 4500 }, fatturazione: 'annuale' },
    { cliente: 'GRANDA DOLCIARIA SPA', tipo: 'legale', codiceFiscale: '01234560107', area: 'Nord', regione: 'Piemonte', localita: 'CUNEO', dataInizio: '2022-04-29', dataFine: '2025-04-30', rinnovo: '2028-04-30', qualita: 'Pisano', respIncarico: 'Napolitano', referente: 'Napolitano', team: 'Cassia, Martella', email1: 'amm@grandadolciaria.example', compensi: { 2022: 9000, 2023: 9000, 2024: 9000, 2025: 9500, 2026: 9500, 2027: 9500 }, fatturazione: 'trimestrale' },
    { cliente: 'HOTEL RIVIERA HOLDING SRL', tipo: 'volontaria', codiceFiscale: '01234560108', area: 'Sud', regione: 'Campania', localita: 'NAPOLI', dataInizio: '2024-01-01', dataFine: '2024-12-31', dataInizioNote: 'Volontaria 2024', qualita: 'Missori', respIncarico: 'Pisano', referente: 'Pisano', team: 'Ingargiola', email1: 'holding@rivierahotels.example', compensi: { 2024: 5500, 2025: 5500 }, fatturazione: 'annuale' },
    { cliente: 'IDROTERMICA ADRIATICA SRL', tipo: 'legale', codiceFiscale: '01234560109', area: 'Centro', regione: 'Marche', localita: 'ANCONA', dataInizio: '2023-05-30', dataFine: '2026-04-30', qualita: 'Pani', respIncarico: 'Sterzi', referente: 'Fiameni', team: 'Fiameni, Tonni', email1: 'info@idroadriatica.example', compensi: { 2023: 5000, 2024: 5000, 2025: 5000 }, fatturazione: 'annuale' },
    { cliente: 'LAGUNA NAUTICA SPA', tipo: 'legale', codiceFiscale: '01234560110', area: 'Nord', regione: 'Veneto', localita: 'VENEZIA', dataInizio: '2025-04-30', dataFine: '2028-04-30', qualita: 'Pisano', respIncarico: 'Novembre', referente: 'Fontanive', team: 'Fontanive, Michelin', email1: 'afc@lagunanautica.example', compensi: { 2025: 18000, 2026: 18000, 2027: 18000 }, fatturazione: 'trimestrale' },
    { cliente: 'MURGIA AGRICOLA SRL', tipo: 'legale', codiceFiscale: '01234560111', area: 'Sud', regione: 'Puglia', localita: 'BARI', dataInizio: '2024-06-10', dataFine: '2027-04-30', qualita: 'Missori', respIncarico: 'Pisano', referente: 'Vaglica', team: 'Vaglica, Trusso', email1: 'amministrazione@murgiagricola.example', compensi: { 2024: 4000, 2025: 4000, 2026: 4000 }, fatturazione: 'annuale' },
    { cliente: 'NUOVA FONDERIA LOMBARDA SPA', tipo: 'legale', codiceFiscale: '01234560112', area: 'Nord', regione: 'Lombardia', localita: 'BRESCIA', dataInizio: '2023-04-28', dataFine: '2026-04-30', qualita: 'Magaraci', respIncarico: 'Sterzi', referente: 'Castellani', team: 'Castellani, Ferrari', email1: 'bilanci@nfl.example', compensi: { 2023: 22000, 2024: 22000, 2025: 22000 }, fatturazione: 'mensile' },
    { cliente: 'OLEIFICIO DEL SALENTO SRL', tipo: 'volontaria', codiceFiscale: '01234560113', area: 'Sud', regione: 'Puglia', localita: 'LECCE', dataInizio: '2025-01-01', dataFine: '2025-12-31', dataInizioNote: 'Volontaria 2025', qualita: 'Missori', respIncarico: 'Napolitano', referente: 'Augello', team: 'Augello', email1: 'info@oleificiosalento.example', compensi: { 2025: 3000 }, fatturazione: 'annuale' },
    { cliente: 'PONTE VECCHIO IMMOBILIARE SRL', tipo: 'legale', codiceFiscale: '01234560114', area: 'Centro', regione: 'Toscana', localita: 'FIRENZE', dataInizio: '2024-04-30', dataFine: '2027-04-30', qualita: 'Pani', respIncarico: 'Missori', referente: 'Serinelli', team: 'Serinelli', email1: 'segreteria@pvimmobiliare.example', compensi: { 2024: 3500, 2025: 3500, 2026: 3500 }, fatturazione: 'annuale' },
    { cliente: 'QUADRIFOGLIO ENERGIA SPA', tipo: 'legale', codiceFiscale: '01234560115', area: 'Nord', regione: 'Emilia Romagna', localita: 'BOLOGNA', dataInizio: '2025-05-05', dataFine: '2028-04-30', qualita: 'Magaraci', respIncarico: 'Sterzi', referente: 'Bordignon', team: 'Bordignon, Candelieri', email1: 'cfo@quadrifoglioenergia.example', compensi: { 2025: 26000, 2026: 26000, 2027: 26000 }, fatturazione: 'trimestrale' },
    { cliente: 'RIVA COSTRUZIONI SRL', tipo: 'legale', codiceFiscale: '01234560116', area: 'Sud', regione: 'Sicilia', localita: 'PALERMO', dataInizio: '2022-05-15', dataFine: '2025-04-30', qualita: 'Missori', respIncarico: 'Pisano', referente: 'Cambrea', team: 'Cambrea, Astone', email1: 'amm@rivacostruzioni.example', compensi: { 2022: 8000, 2023: 8000, 2024: 8000 }, statoNote: 'Triennio scaduto, rinnovo da valutare', fatturazione: 'annuale' },
    { cliente: 'SIBILLA FARMACEUTICI SPA', tipo: 'legale', codiceFiscale: '01234560117', area: 'Centro', regione: 'Umbria', localita: 'PERUGIA', dataInizio: '2024-05-12', dataFine: '2027-04-30', qualita: 'Pani', respIncarico: 'Novembre', referente: 'Pescatori', team: 'Pescatori, Mariani', email1: 'finance@sibillapharma.example', compensi: { 2024: 16000, 2025: 16000, 2026: 16000 }, fatturazione: 'mensile' },
    { cliente: 'TORRE ANTICA VITICOLTORI SRL', tipo: 'volontaria', codiceFiscale: '01234560118', area: 'Centro', regione: 'Lazio', localita: 'FROSINONE', dataInizio: '2026-01-01', dataFine: '2026-12-31', dataInizioNote: 'Volontaria 2026', qualita: 'Pani', respIncarico: 'Sterzi', referente: 'Marra', team: 'Marra', email1: 'cantina@torreantica.example', compensi: { 2026: 3800 }, fatturazione: 'annuale' },
    { cliente: 'UMBRA PLASTICS SRL', tipo: 'legale', codiceFiscale: '01234560119', area: 'Centro', regione: 'Umbria', localita: 'TERNI', dataInizio: '2023-05-25', dataFine: '2026-04-30', qualita: 'Pani', respIncarico: 'Missori', referente: 'Invitti', team: 'Invitti, Lasso', email1: 'quality@umbraplastics.example', compensi: { 2023: 6000, 2024: 6000, 2025: 6000 }, fatturazione: 'annuale' },
    { cliente: 'VESUVIO FOOD GROUP SPA', tipo: 'legale', codiceFiscale: '01234560120', area: 'Sud', regione: 'Campania', localita: 'NAPOLI', dataInizio: '2025-06-01', dataFine: '2028-04-30', qualita: 'Missori', respIncarico: 'Napolitano', referente: 'Mostacci', team: 'Mostacci, Sangiorgio', email1: 'group@vesuviofood.example', compensi: { 2025: 12500, 2026: 12500, 2027: 12500 }, fatturazione: 'trimestrale' },
    { cliente: 'ZEFIRO TESSILE SRL', tipo: 'legale', codiceFiscale: '01234560121', area: 'Nord', regione: 'Piemonte', localita: 'BIELLA', dataInizio: '2024-04-26', dataFine: '2027-04-30', qualita: 'Magaraci', respIncarico: 'Sterzi', referente: 'Speca', team: 'Speca, Portinari', email1: 'amministrazione@zefirotessile.example', compensi: { 2024: 7000, 2025: 7000, 2026: 7000 }, fatturazione: 'annuale' },
    { cliente: 'DOLOMITI SKI RESORT SPA', tipo: 'legale', codiceFiscale: '01234560122', area: 'Nord', regione: 'Trentino Alto Adige', localita: 'TRENTO', dataInizio: '2023-05-08', dataFine: '2026-04-30', qualita: 'Pisano', respIncarico: 'Novembre', referente: 'Varetti', team: 'Varetti, Giannelli', email1: 'cda@dolomitiski.example', compensi: { 2023: 10000, 2024: 10000, 2025: 10000 }, fatturazione: 'trimestrale' }
];
