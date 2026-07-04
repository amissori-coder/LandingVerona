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

    var NGB_GA_ID = 'G-TDKR0JGG60'; // ID misurazione GA4

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

    /* ---- GA4: caricato SOLO dopo il consenso dell'utente ----
       Approccio "basic consent mode", il piu' prudente per l'Italia:
       finche' l'utente non acconsente alla misurazione, nessuno script
       di Google viene caricato e nessun dato lascia il browser. Il
       consenso memorizzato riattiva il caricamento alle visite
       successive tramite la callback iubenda qui sotto. */
    var gaLoaded = false;
    function loadGA() {
        if (gaLoaded || !NGB_GA_ID) return;
        gaLoaded = true;

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
        siteId: 4392696,
        cookiePolicyId: 40996386,
        lang: 'it',
        floatingPreferencesButtonDisplay: false,
        perPurposeConsent: true,
        googleConsentMode: true,
        callback: {
            /* Chiamata sia alla scelta dell'utente sia, nelle visite
               successive, quando la preferenza salvata viene riletta. */
            onPreferenceExpressedOrNotNeeded: function (preference) {
                if (!preference) return;
                var misurazione = preference.consent === true ||
                    !!(preference.purposes && preference.purposes[4]);
                if (misurazione) loadGA();
            }
        },
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
