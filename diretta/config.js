/* ============================================================
   CONFIGURAZIONE DELLA DIRETTA
   ------------------------------------------------------------
   La diretta usa un progetto Firebase TUTTO SUO ("ngb-eventi"),
   separato da quello dell'area riservata: account e dati diversi.

   Da compilare una volta (vedi diretta/README.md, "Il progetto
   Firebase"): in Firebase > Impostazioni progetto > Le tue app >
   app web, copia qui sotto i valori di firebaseConfig al posto di
   DA_COMPILARE. Finche' restano DA_COMPILARE la pagina dice
   "Diretta non ancora configurata" e non prova a collegarsi.

   NOTA: questi valori sono pubblici per natura (arrivano comunque al
   browser di chiunque apra la pagina). La protezione dei dati sta
   nelle regole di Firestore (diretta/firebase/firestore.rules) e nel
   servizio su Vercel, non nella segretezza di questo file.
   ============================================================ */
(function () {
    'use strict';

    window.NGB_DIRETTA_CONFIG = {
        firebase: {
            apiKey: 'AIzaSyCeGq35XyBUfmBlHm46xeLlKcU6N8RXVO8',
            authDomain: 'ngb-eventi.firebaseapp.com',
            projectId: 'ngb-eventi',
            storageBucket: 'ngb-eventi.firebasestorage.app',
            messagingSenderId: '901270627472',
            appId: '1:901270627472:web:6b2d65cce97185a235e415'
        },
        // la stessa versione dell'SDK usata dall'area riservata, da gstatic
        versioneFirebase: '11.6.1',
        // il servizio su Vercel (email-service): accesso, gestione, stato
        servizio: 'https://revilaw-email.vercel.app/api',
        // chi risponde se qualcosa non va (mostrato nella pagina)
        assistenza: { email: 'info@nextgenerationbusiness.it', telefono: '' },
        /* il modulo di iscrizione all'evento: «Iscriviti qui» nella frase
           «Non sei ancora iscritto? Iscriviti qui.» della pagina di accesso e
           di «Password dimenticata?». Sta qui (e non nei dati dell'evento)
           perche' la pagina lo mostra PRIMA dell'accesso, quando non legge
           ancora Firestore. Un percorso del sito (/...) oppure un indirizzo
           https://; vuoto o tolto: la frase non compare. */
        iscrizione: '/napoli_ottobre_2026/#accreditamento',
        emulatori: null,
        prove: null
    };

    /* PROVE IN LOCALE. Solo su questo computer (localhost o 127.0.0.1) e
       solo se chiesto con ?emulatori=1 (che resta ricordato per la
       sessione della scheda), la pagina parla con gli emulatori di
       Firebase e con il servizio avviato in locale
       (diretta/prove/server-locale.js). Le prove automatiche possono
       spostare porte e tempi con window.NGB_DIRETTA_PROVE, impostato
       prima che questo file venga letto. Sul sito vero niente di tutto
       questo si attiva. */
    var locale = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!locale) return;
    var chiesto = /[?&]emulatori=1\b/.test(location.search);
    try {
        if (chiesto) sessionStorage.setItem('ngbDirettaEmulatori', '1');
        else chiesto = sessionStorage.getItem('ngbDirettaEmulatori') === '1';
    } catch (e) { /* senza sessionStorage vale solo il parametro */ }
    if (!chiesto) return;

    var p = window.NGB_DIRETTA_PROVE || {};
    var c = window.NGB_DIRETTA_CONFIG;
    c.firebase = { apiKey: 'finta', authDomain: 'localhost', projectId: p.progetto || 'demo-ngb-eventi', appId: 'finta' };
    c.emulatori = {
        auth: 'http://127.0.0.1:' + (p.auth || 9099),
        firestore: { host: '127.0.0.1', porta: Number(p.firestore || 8080) }
    };
    c.servizio = p.api || 'http://127.0.0.1:3100/api';
    c.prove = {
        ritardoPresenzaMs: p.ritardoPresenzaMs != null ? Number(p.ritardoPresenzaMs) : null,
        intervalloPresenzaMs: p.intervalloPresenzaMs != null ? Number(p.intervalloPresenzaMs) : null
    };
})();
