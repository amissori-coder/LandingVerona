/**
 * NGB — Consenso cookie (iubenda) + Google Analytics 4
 * ----------------------------------------------------------------------
 * Unico file incluso nel <head> di ogni pagina del sito.
 *
 *  - Google Consent Mode v2: ogni finalità è negata finché l'utente
 *    non acconsente dal banner.
 *  - Banner iubenda Cookie Solution (policy 40996386), che aggiorna
 *    automaticamente il Consent Mode alla scelta dell'utente.
 *  - GA4 viene caricato solo se NGB_GA_ID è valorizzato: finché resta
 *    vuoto il sito non carica nulla di Google e non traccia niente.
 *
 * ATTIVAZIONE ANALYTICS: inserire qui sotto l'ID misurazione della
 * proprietà GA4 (Amministrazione > Flussi di dati), es. 'G-AB12CD34EF'.
 */
(function () {
    'use strict';

    var NGB_GA_ID = ''; // TODO: ID misurazione GA4 (G-...)

    /* ---- Consent Mode v2: default negato, prima di ogni altro script ---- */
    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = window.gtag || gtag;

    window.gtag('consent', 'default', {
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
        analytics_storage: 'denied',
        wait_for_update: 2000
    });

    /* ---- GA4: caricato solo con un ID configurato ---- */
    if (NGB_GA_ID) {
        var ga = document.createElement('script');
        ga.async = true;
        ga.src = 'https://www.googletagmanager.com/gtag/js?id=' + NGB_GA_ID;
        document.head.appendChild(ga);

        window.gtag('js', new Date());
        window.gtag('config', NGB_GA_ID, { anonymize_ip: true });
    }

    /* ---- Banner iubenda Cookie Solution ---- */
    window._iub = window._iub || [];
    window._iub.csConfiguration = {
        cookiePolicyId: 40996386,
        lang: 'it',
        floatingPreferencesButtonDisplay: false,
        perPurposeConsent: true,
        googleConsentMode: true,
        banner: {
            position: 'float-bottom-center',
            acceptButtonDisplay: true,
            customizeButtonDisplay: true,
            rejectButtonDisplay: true,
            closeButtonDisplay: false,
            explicitWithdrawal: true,
            listPurposes: true,
            acceptButtonColor: '#164068',
            acceptButtonCaptionColor: '#FFFFFF',
            rejectButtonColor: '#DFE3EA',
            rejectButtonCaptionColor: '#1A2332',
            customizeButtonColor: '#DFE3EA',
            customizeButtonCaptionColor: '#1A2332',
            backgroundColor: '#FFFFFF',
            textColor: '#1A2332'
        }
    };

    function loadScript(src, attrs) {
        var s = document.createElement('script');
        s.src = src;
        if (attrs) {
            for (var k in attrs) {
                if (Object.prototype.hasOwnProperty.call(attrs, k)) s.setAttribute(k, attrs[k]);
            }
        }
        document.head.appendChild(s);
    }

    loadScript('https://cdn.iubenda.com/cs/gpp/stub.js');
    loadScript('https://cdn.iubenda.com/cs/iubenda_cs.js', { charset: 'UTF-8', async: 'async' });
})();
