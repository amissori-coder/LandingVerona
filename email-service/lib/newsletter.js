/* ============================================================
   Parti in comune dei tre endpoint della newsletter
   ------------------------------------------------------------
   Sta qui (e non copiato in ogni file) quello che DEVE restare
   identico ovunque: la firma del collegamento di disiscrizione.
   Se il calcolo divergesse fra chi invia e chi riceve, i
   collegamenti smetterebbero di funzionare senza che nessuno se
   ne accorga fino alla prima segnalazione.

   Non e' una funzione Vercel: la cartella delle funzioni e' solo
   "api/". Qui non c'e' nessun dato, solo codice.
   ============================================================ */

const crypto = require('crypto');
const admin = require('firebase-admin');

function leggiServiceAccount() {
    const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT mancante');
    let testo = raw;
    if (testo[0] !== '{') {
        try {
            const dec = Buffer.from(testo, 'base64').toString('utf8').trim();
            if (dec[0] === '{') testo = dec;
        } catch (_) { /* lo segnala JSON.parse */ }
    }
    let cred;
    try { cred = JSON.parse(testo); }
    catch (_) { throw new Error('FIREBASE_SERVICE_ACCOUNT non valido'); }
    if (cred.private_key && cred.private_key.includes('\\n')) {
        cred.private_key = cred.private_key.replace(/\\n/g, '\n');
    }
    return cred;
}

let appPronta = false;
function initAdmin() {
    if (appPronta) return;
    admin.initializeApp({ credential: admin.credential.cert(leggiServiceAccount()) });
    appPronta = true;
}

/* --- segreto della firma ---
   Variabile dedicata NEWSLETTER_SECRET se c'e'; altrimenti si ricava dalla
   chiave privata dell'account di servizio, che e' gia' segreta e gia'
   configurata: la disiscrizione funziona senza aggiungere configurazione.
   ATTENZIONE: cambiando l'una o l'altra, i collegamenti gia' spediti
   smettono di funzionare (chi ci clicca vede il messaggio di errore con
   l'indirizzo a cui scrivere). */
let _segreto = null;
function segreto() {
    if (_segreto) return _segreto;
    const esplicito = String(process.env.NEWSLETTER_SECRET || '').trim();
    if (esplicito) { _segreto = esplicito; return _segreto; }
    const cred = leggiServiceAccount();
    _segreto = crypto.createHash('sha256').update('newsletter|' + String(cred.private_key || '')).digest('hex');
    return _segreto;
}
function firma(email) {
    return crypto.createHmac('sha256', segreto())
        .update('disiscrizione|' + String(email || '').trim().toLowerCase())
        .digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, 32);
}
// confronto a tempo costante: non lascia capire quanto della firma era giusto
function firmaValida(email, token) {
    const attesa = Buffer.from(firma(email));
    const data = Buffer.from(String(token || ''));
    if (attesa.length !== data.length) return false;
    return crypto.timingSafeEqual(attesa, data);
}

/* Firma del collegamento "completa i dati dei partecipanti" (iscrizioni
   inserite a mano): stesso segreto, contesto diverso, cosi' un token di
   disiscrizione non apre i dati di un'iscrizione e viceversa. Si firma
   l'IDENTIFICATIVO DEL DOCUMENTO, quindi il collegamento vale per quella
   sola scheda. */
function firmaCompleta(idDoc) {
    return crypto.createHmac('sha256', segreto())
        .update('completa-iscrizione|' + String(idDoc || ''))
        .digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, 32);
}
function firmaCompletaValida(idDoc, token) {
    const attesa = Buffer.from(firmaCompleta(idDoc));
    const data = Buffer.from(String(token || ''));
    if (attesa.length !== data.length) return false;
    return crypto.timingSafeEqual(attesa, data);
}

const BASE = String(process.env.APP_BASE_URL || 'https://nextgenerationbusiness.it').replace(/\/+$/, '');
const PAGINA_DISISCRIZIONE = BASE + '/newsletter/disiscriviti.html';
const PAGINA_COMPLETA = BASE + '/completa_iscrizione/';
function linkCompleta(idDoc) {
    return PAGINA_COMPLETA + '?d=' + encodeURIComponent(String(idDoc || ''))
        + '&t=' + encodeURIComponent(firmaCompleta(idDoc));
}
/* Modulo degli incontri B2B: stessa firma della scheda (stesso perimetro:
   quella sola iscrizione), pagina diversa. */
const PAGINA_B2B = BASE + '/incontri_b2b/';
function linkB2B(idDoc) {
    return PAGINA_B2B + '?d=' + encodeURIComponent(String(idDoc || ''))
        + '&t=' + encodeURIComponent(firmaCompleta(idDoc));
}
/* Collegamento personale mostrato in fondo alla mail (pagina di conferma). */
function linkDisiscrizione(email, campagna) {
    return PAGINA_DISISCRIZIONE + '?e=' + encodeURIComponent(email) + '&t=' + encodeURIComponent(firma(email))
        + (campagna ? '&c=' + encodeURIComponent(String(campagna).slice(0, 60)) : '');
}
/* Indirizzo che i client di posta chiamano da soli (un clic, senza aprire nulla). */
function linkUnClic(email, campagna) {
    const api = String(process.env.NEWSLETTER_API_BASE || (BASE.indexOf('nextgenerationbusiness') >= 0 ? 'https://revilaw-email.vercel.app' : BASE)).replace(/\/+$/, '');
    return api + '/api/disiscrizione?e=' + encodeURIComponent(email) + '&t=' + encodeURIComponent(firma(email))
        + (campagna ? '&c=' + encodeURIComponent(String(campagna).slice(0, 60)) : '');
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/* =========================================================
   BREVO
   ---------------------------------------------------------
   La newsletter esce da Brevo, non dalla casella dello studio: quella
   regge poche centinaia di email al giorno. Le email di servizio
   (password, comunicazioni) restano invece su Aruba, dove sono.

   Il dominio e' gia' autenticato per Brevo (chiavi DKIM brevo1/brevo2
   pubblicate), quindi non servono modifiche ai DNS.

   Basta la variabile BREVO_API_KEY: se manca, l'invio torna da solo
   sulla casella SMTP di prima. Cosi' si puo' accendere e spegnere senza
   toccare il codice.
========================================================= */
const BREVO_API = 'https://api.brevo.com/v3';
function brevoAttivo() { return !!String(process.env.BREVO_API_KEY || '').trim(); }

async function chiamataBrevo(percorso, opz) {
    opz = opz || {};
    const chiave = String(process.env.BREVO_API_KEY || '').trim();
    if (!chiave) throw new Error('BREVO_API_KEY mancante');
    const intestazioni = { 'api-key': chiave, 'accept': 'application/json' };
    if (opz.corpo) intestazioni['content-type'] = 'application/json';
    // in prova non parte niente: Brevo risponde ok e non spedisce (X-Sib-Sandbox)
    if (opz.sandbox) intestazioni['X-Sib-Sandbox'] = 'drop';
    /* Tempo massimo di attesa. Senza, una risposta lenta di Brevo blocca la
       funzione fino al suo limite: nella lettura dell'elenco (che di Brevo puo'
       fare a meno) significherebbe una sezione che non si apre. */
    const attesa = Number(process.env.BREVO_TIMEOUT_MS) || (opz.metodo === 'POST' ? 25000 : 6000);
    const r = await fetch(BREVO_API + percorso, {
        method: opz.metodo || 'GET',
        headers: intestazioni,
        body: opz.corpo ? JSON.stringify(opz.corpo) : undefined,
        signal: (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(attesa) : undefined
    });
    const testo = await r.text();
    let dati = null;
    try { dati = testo ? JSON.parse(testo) : null; } catch (_) { dati = null; }
    return { stato: r.status, ok: r.ok, dati: dati, testo: testo.slice(0, 500) };
}

/* Chi Brevo non contatta piu': disiscritti dal SUO pulsante, rimbalzi duri,
   segnalazioni di spam. E' un elenco separato dal nostro, e va letto: il
   pulsante "Annulla iscrizione" che i programmi di posta mostrano accanto al
   mittente lo mette Brevo e non si puo' sostituire con il nostro, quindi chi
   lo usa finisce li' e non nella nostra collezione. Senza questa lettura la
   sezione continuerebbe a contarlo fra i raggiungibili. */
async function bloccatiBrevo() {
    const out = {};
    if (!brevoAttivo()) return out;
    let offset = 0;
    const limite = 100;
    // tetto di sicurezza: l'endpoint consente 300 chiamate l'ora, non si esagera
    for (let giro = 0; giro < 20; giro++) {
        const r = await chiamataBrevo('/smtp/blockedContacts?limit=' + limite + '&offset=' + offset);
        if (!r.ok) {
            if (r.stato === 404) break;   // nessun bloccato: Brevo risponde 404
            throw new Error('blocklist Brevo non leggibile (' + r.stato + ')');
        }
        const righe = (r.dati && r.dati.contacts) || [];
        righe.forEach(c => {
            const em = String((c && c.email) || '').toLowerCase();
            if (em) out[em] = { motivo: String((c && c.reason && c.reason.code) || (c && c.reason) || 'bloccato'), quando: c && c.blockedAt ? Date.parse(c.blockedAt) || 0 : 0 };
        });
        if (righe.length < limite) break;
        offset += limite;
    }
    return out;
}

/* --- chi puo' usare la sezione Newsletter ---
   Amministratore, oppure contrassegno "newsletter" sulla scheda utente.
   NON si guarda l'elenco condiviso `archivio/newsletterConfig`, che pure
   esiste e pilota il menu dell'area riservata: quel documento, per le regole
   di Firestore, e' scrivibile da qualunque utente dello staff, quindi
   chiunque potrebbe aggiungerci il proprio indirizzo e concedersi da solo
   la rubrica completa e l'invio a nome dello studio. La scheda in `utenti`
   la scrive invece solo l'amministratore: e' l'unico permesso di cui fidarsi.
   L'area riservata scrive comunque entrambi (elenco + scheda), quindi per chi
   usa l'interfaccia non cambia nulla. */
async function autorizza(idToken) {
    if (!idToken) return { ok: false, stato: 401, msg: 'Autenticazione mancante' };
    let decoded;
    try { decoded = await admin.auth().verifyIdToken(String(idToken)); }
    catch (e) { return { ok: false, stato: 401, msg: 'Sessione non valida: rientra e riprova.' }; }
    const email = String(decoded.email || '').toLowerCase();
    if (!EMAIL_RE.test(email)) return { ok: false, stato: 401, msg: 'Utente non valido' };

    const uDoc = await admin.firestore().collection('utenti').doc(email).get();
    if (!uDoc.exists || uDoc.data().attivo === false) return { ok: false, stato: 403, msg: 'Utenza non abilitata.' };
    const dati = uDoc.data() || {};
    const ruolo = String(dati.ruolo || '');
    if (ruolo === 'admin' || dati.newsletter === true) return { ok: true, email: email, ruolo: ruolo, admin: ruolo === 'admin' };
    return {
        ok: false, stato: 403,
        msg: 'Non sei abilitato alla sezione Newsletter. Chiedi all\'amministratore di abilitarti da "Gestisci accessi".'
    };
}

/* Elenco degli indirizzi che hanno chiesto di non ricevere piu' nulla.
   Lo consultano sia la sezione (per mostrarli) sia l'invio (per saltarli). */
async function disiscritti(db) {
    const out = {};
    const snap = await db.collection('newsletterDisiscritti').get();
    snap.forEach(d => {
        const v = d.data() || {};
        const em = String(v.email || d.id || '').toLowerCase();
        if (em) out[em] = { quando: v.quando || 0, origine: v.origine || '' };
    });
    return out;
}

function testo(v, max) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 200);
}

module.exports = {
    leggiServiceAccount, initAdmin, admin,
    firma, firmaValida, linkDisiscrizione, linkUnClic,
    firmaCompleta, firmaCompletaValida, linkCompleta, linkB2B,
    PAGINA_DISISCRIZIONE, PAGINA_COMPLETA, PAGINA_B2B, BASE,
    EMAIL_RE, autorizza, disiscritti, testo,
    brevoAttivo, chiamataBrevo, bloccatiBrevo
};
