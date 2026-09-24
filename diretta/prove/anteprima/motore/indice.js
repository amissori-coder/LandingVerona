/* ============================================================
   ANTEPRIMA - il motore: window.NGBA
   ------------------------------------------------------------
   Gira nel guscio dell'anteprima (la pagina che contiene le schede
   Partecipante, Gestione, Posta di prova). Le pagine vere, dentro gli
   iframe, lo raggiungono con window.parent.NGBA:
     - i moduli finti dell'SDK di Firebase (anteprima/sdk/*.js) usano
       NGBA.sdk;
     - le chiamate al servizio (fetch verso https://anteprima.invalid/api)
       passano da NGBA.daPagina, cioe' dalle funzioni VERE di
       email-service/api/;
     - la posta finisce in NGBA.posta.
   esbuild lo impacchetta con il codice del servizio in
   anteprima/motore.js (vedi ../costruisci.js).
   ============================================================ */
'use strict';
const { process } = require('./shim-globali');

// le variabili d'ambiente del servizio, come in diretta/prove/server-locale.js
Object.assign(process.env, {
    DIRETTA_EMULATORE: '1',
    FIRESTORE_EMULATOR_HOST: 'firestore.anteprima.invalid',
    FIREBASE_AUTH_EMULATOR_HOST: 'auth.anteprima.invalid',
    DIRETTA_PROGETTO: 'ngb-eventi',
    DIRETTA_ADMIN_EMAILS: 'gestore@anteprima.it',
    CRON_SECRET: 'anteprima-cron',
    DIRETTA_POSTA_FINTA: '/anteprima/risultati/posta.jsonl',
    // chi scrive a questo indirizzo vede come appare una email respinta
    DIRETTA_POSTA_RIFIUTA: 'rimbalzo@esempio.it',
    ALLOWED_ORIGIN: '*',
    APP_BASE_URL: 'https://nextgenerationbusiness.it',
    DIRETTA_AUTH_AL_SECONDO: '50'
});

const A = require('./archivio');
const adm = require('./admin');
const cli = require('./cliente');
const servizio = require('./servizio');
const posta = require('./posta');
const semina = require('./semina');

const archivio = new A.Archivio();
adm.usa(archivio);
archivio.carica();
cli.usa(archivio);
posta.carica();
globalThis.NGBA_POSTA = posta;
servizio.installaUscite();

function dimenticaSessioni() {
    cli.sessioni.clear();
    try { sessionStorage.removeItem('ngbAnteprimaSessioni.v1'); } catch (e) { /* niente */ }
}

const NGBA = {
    archivio, posta, servizio, semina,
    stato: { fase: 'avvio', messaggio: 'Preparo l\'anteprima…', errore: '' },
    osservatoriStato: new Set(),

    sdk: {
        app: {
            initializeApp(opzioni, nome, finestra, dispositivo) {
                return { name: nome || '[DEFAULT]', options: opzioni || {}, automaticDataCollectionEnabled: false, _finestra: finestra, _dispositivo: dispositivo || 'questo' };
            }
        },
        auth: {
            creaAuth: cli.creaAuth,
            onAuthStateChanged: cli.onAuthStateChanged,
            signInWithCustomToken: cli.signInWithCustomToken,
            signInWithEmailAndPassword: cli.signInWithEmailAndPassword,
            signOut: cli.signOut,
            verifyPasswordResetCode: cli.verifyPasswordResetCode,
            confirmPasswordReset: cli.confirmPasswordReset
        },
        firestore: {
            creaDb: cli.creaDb, doc: cli.doc, getDoc: cli.getDoc, setDoc: cli.setDoc, updateDoc: cli.updateDoc,
            onSnapshot: cli.onSnapshot, serverTimestamp: cli.serverTimestamp, increment: cli.increment, Timestamp: cli.Timestamp
        }
    },

    daPagina: servizio.daPagina,
    dimenticaFinestra: cli.dimenticaFinestra,
    utenteDi: cli.utenteDi,
    esciDa(dispositivo) { cli.chiudiSessione(dispositivo); },

    // il guscio le sostituisce: navigazione fra le pagine e "Vedi come un partecipante"
    naviga() {},
    apri() {},

    cambiaStato(fase, messaggio, errore) {
        this.stato = { fase, messaggio: messaggio || '', errore: errore || '' };
        Array.from(this.osservatoriStato).forEach(fn => { try { fn(this.stato); } catch (e) { this.osservatoriStato.delete(fn); } });
    },
    seguiStato(fn) { this.osservatoriStato.add(fn); fn(this.stato); return () => this.osservatoriStato.delete(fn); },

    accessi() { return (archivio.extra && archivio.extra.semina) || null; },

    // "Ricomincia da capo": via tutto (dati, account, posta, sessioni), poi di nuovo la semina
    ricomincia() {
        archivio.svuota();
        posta.svuota();
        dimenticaSessioni();
    }
};

NGBA.pronto = (async () => {
    try {
        if (semina.serveSemina(archivio)) {
            // un giorno nuovo (o la prima volta): si riparte puliti, con l'evento di oggi
            archivio.svuota();
            posta.svuota();
            dimenticaSessioni();
            await semina.semina(archivio, t => NGBA.cambiaStato('semina', t));
        }
        servizio.avviaCron();
        NGBA.cambiaStato('pronto', '');
        return NGBA.accessi();
    } catch (e) {
        console.error('[anteprima] preparazione non riuscita', e);
        NGBA.cambiaStato('errore', '', String((e && e.message) || e));
        throw e;
    }
})();

window.NGBA = NGBA;
