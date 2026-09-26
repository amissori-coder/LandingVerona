/* ============================================================
   CONFIGURAZIONE DELLA DIRETTA - versione per l'ANTEPRIMA
   ------------------------------------------------------------
   Nell'anteprima prende il posto di diretta/config.js. Niente
   progetto Firebase vero: l'SDK e' quello finto dell'anteprima
   (anteprima/sdk/), e il servizio risponde dentro il browser
   (anteprima/motore.js) all'indirizzo qui sotto, che non esiste in
   rete: anteprima/pagina.js intercetta le chiamate.
   Il primo segnale di presenza parte dopo 4 secondi invece che fino
   a 60, cosi' il contatore dei collegati della regia si muove subito;
   poi uno al minuto, come sul sito.
   ============================================================ */
(function () {
    'use strict';
    window.NGB_DIRETTA_CONFIG = {
        firebase: {
            apiKey: 'anteprima',
            authDomain: 'ngb-eventi.firebaseapp.com',
            projectId: 'ngb-eventi',
            appId: 'anteprima'
        },
        versioneFirebase: '11.6.1',
        servizio: 'https://anteprima.invalid/api',
        assistenza: { email: 'info@nextgenerationbusiness.it', telefono: '' },
        // come sul sito: «Iscriviti qui» porta al modulo della pagina di Napoli
        // (nell'anteprima si apre fuori, sul sito vero: vedi anteprima/pagina.js)
        iscrizione: '/napoli_ottobre_2026/#accreditamento',
        emulatori: null,
        prove: { ritardoPresenzaMs: 4000, intervalloPresenzaMs: null },
        anteprima: true
    };
})();
