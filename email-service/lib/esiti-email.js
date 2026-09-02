/* ============================================================
   Chi ha ricevuto, chi ha aperto, chi ha cliccato
   ------------------------------------------------------------
   Sull'invito via PEC l'esito ce lo dice il gestore, e lo legge
   lib/lettore-pec.js: accettata, consegnata, e con valore legale.
   Sull'email ordinaria non esiste niente del genere. "Inviata"
   vuol dire soltanto che il relay ha preso in carico il
   messaggio: se poi sia arrivato, se qualcuno l'abbia aperto o
   abbia premuto il pulsante, il nostro servizio non lo sa.

   Lo sa Brevo, che quelle mail le consegna e ci mette il proprio
   pixel e i propri collegamenti tracciati. Qui glielo si chiede.

   PERCHE' PER INDIRIZZO E NON PER ETICHETTA. Le statistiche
   aggregate di api/andamento-newsletter.js si interrogano per tag,
   e funziona perche' la newsletter parte dall'API di Brevo, dove
   il tag e' un campo del messaggio. Questi inviti partono invece
   dal relay SMTP, dove l'unico modo di attaccare un'etichetta e'
   un'intestazione non documentata: appoggiarcisi vorrebbe dire
   costruire una colonna che un giorno smette di riempirsi senza
   che nessuno capisca perche'. Si chiede quindi la finestra di
   giorni in cui gli invii sono partiti e si tengono le righe i cui
   destinatari sono nel nostro elenco. Il legame e' l'indirizzo, che
   e' un dato che abbiamo noi e non dipende da come si spedisce.

   PERCHE' QUI GLI INDIRIZZI SI POSSONO VEDERE, E NELLA NEWSLETTER
   NO. E' la stessa differenza che passa fra una lista di iscritti e
   un elenco di aziende contattate una per una. Della newsletter
   interessa quante ne sono state aperte; qui la domanda e'
   esattamente "questa azienda ha aperto?", perche' da quella
   risposta dipende se richiamarla, riscriverle o lasciar perdere.
   Le righe che escono da qui riguardano solo indirizzi che chi
   guarda ha gia' davanti in tabella: la lettura filtra su quelli e
   scarta tutto il resto, comprese le mail di servizio e le
   newsletter che passano dallo stesso account.

   LA QUOTA. Gli endpoint /v3/smtp/... hanno 300 chiamate l'ora in
   tutto, condivise con la blocklist e con l'andamento della
   newsletter. Quindi: cache su Firestore (le istanze su Vercel sono
   piu' d'una e non condividono la memoria), scadenza dieci minuti,
   e un tetto di pagine per lettura. Se la lettura non riesce si
   restituisce l'ultima riuscita dicendo che e' vecchia, invece di
   una schermata di zeri che verrebbe letta come "non ha aperto
   nessuno".
   ============================================================ */

const N = require('./newsletter');

const TTL_MS = 10 * 60 * 1000;         // quanto vale una lettura prima di rifarla
const PAUSA_ERRORE_MS = 60 * 1000;     // dopo un errore, silenzio su quella chiave
const PER_PAGINA = 2500;               // quante righe per chiamata (il massimo e' 5000)
const MAX_PAGINE = 6;                  // quante chiamate al massimo per lettura
const FINESTRA_GIORNI = 90;            // quanto indietro guarda Brevo
const GIORNO_MS = 24 * 60 * 60 * 1000;

/* Dai nomi degli eventi di Brevo alle quattro cose che interessano qui.
   I nomi arrivano in forme diverse a seconda dell'endpoint (singolare,
   plurale, con o senza maiuscole): si normalizza prima di confrontare,
   altrimenti una colonna resta vuota per una "s". */
const RICEVUTA = ['delivered'];
const APERTURA = ['opened', 'uniqueopened', 'opens', 'proxy_open'];
const CLIC = ['click', 'clicks', 'uniqueclicked'];
const RIMBALZO = ['hardbounce', 'hardbounces', 'softbounce', 'softbounces', 'blocked', 'invalid', 'error', 'deferred'];
const LAMENTELA = ['spam', 'complaint'];
const DISISCRIZIONE = ['unsubscribed', 'unsubscribe', 'listaddition'];

function tipoDi(nome) {
    const e = String(nome || '').toLowerCase().replace(/[\s_-]/g, '');
    if (RICEVUTA.indexOf(e) >= 0) return 'consegnata';
    if (APERTURA.indexOf(e) >= 0) return 'aperta';
    if (CLIC.indexOf(e) >= 0) return 'clic';
    if (LAMENTELA.indexOf(e) >= 0) return 'spam';
    if (DISISCRIZIONE.indexOf(e) >= 0) return 'disiscritto';
    if (RIMBALZO.indexOf(e) >= 0) return 'rimbalzo';
    return '';
}

function giorno(ms) {
    const d = new Date(ms);
    const p = n => String(n).padStart(2, '0');
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
}
function quandoDi(riga) {
    const t = Date.parse(String((riga && (riga.date || riga.eventDate || riga.ts)) || ''));
    return Number.isFinite(t) ? t : 0;
}

/* Una riga vuota per un indirizzo di cui Brevo non riporta niente. Serve a
   distinguere "non ha aperto" da "non lo sappiamo": la prima e' una riga
   con consegnata a true e aperta a false, la seconda e' l'assenza della
   riga. A video sono due frasi diverse. */
function vuoto() {
    return {
        consegnata: 0, aperta: 0, clic: 0, rimbalzo: 0, spam: 0, disiscritto: 0,
        aperture: 0, clicTotali: 0, motivo: ''
    };
}

/* Dalle righe di Brevo alla mappa indirizzo -> esito.
   `ammessi` e' l'insieme degli indirizzi che chi guarda ha gia' in tabella:
   tutto il resto (newsletter, mail di servizio, altri eventi) si scarta
   qui, prima ancora di essere contato. */
function raccogli(righe, ammessi) {
    const out = {};
    (Array.isArray(righe) ? righe : []).forEach(r => {
        const ind = String((r && r.email) || '').trim().toLowerCase();
        if (!ind || !ammessi[ind]) return;
        const tipo = tipoDi(r && r.event);
        if (!tipo) return;
        const q = quandoDi(r);
        const v = out[ind] || (out[ind] = vuoto());
        if (tipo === 'aperta') { v.aperture++; if (!v.aperta || q < v.aperta) v.aperta = q || v.aperta || 1; }
        else if (tipo === 'clic') { v.clicTotali++; if (!v.clic || q < v.clic) v.clic = q || v.clic || 1; }
        else if (!v[tipo]) v[tipo] = q || 1;
        /* Il motivo di un rimbalzo lo scrive il server del destinatario: e'
           testo altrui, e chi lo mostra deve trattarlo come tale. Qui si
           tiene solo il primo e accorciato. */
        if (tipo === 'rimbalzo' && !v.motivo) v.motivo = String((r && (r.reason || r.tag)) || '').slice(0, 200);
    });
    /* Un'apertura o un clic senza consegna non sono possibili: se manca la
       riga "delivered" (succede, Brevo non garantisce l'ordine ne' la
       completezza degli eventi) la si deduce, perche' altrimenti a video
       comparirebbe "aperta ma non consegnata", che chi legge non sa come
       interpretare. */
    Object.keys(out).forEach(k => {
        const v = out[k];
        if (!v.consegnata && (v.aperta || v.clic)) v.consegnata = v.aperta || v.clic;
    });
    return out;
}

async function daFirestore(db, chiave) {
    try {
        const s = await db.collection('emailEsiti').doc(chiave).get();
        return s.exists ? (s.data() || null) : null;
    } catch (_) { return null; }
}
async function inFirestore(db, chiave, dati) {
    try { await db.collection('emailEsiti').doc(chiave).set(dati, { merge: true }); }
    catch (_) { /* la cache che non si scrive non e' un guasto: si rilegge */ }
}

/* Gli esiti degli indirizzi passati, dal giorno indicato a oggi.
   Restituisce sempre una risposta utilizzabile: `stato` dice se i numeri
   sono freschi, vecchi o assenti, e chi la mostra deve dirlo. */
async function leggi(db, opz) {
    opz = opz || {};
    const chiave = String(opz.chiave || '').replace(/[^A-Za-z0-9_~-]/g, '-').slice(0, 200);
    const indirizzi = (Array.isArray(opz.indirizzi) ? opz.indirizzi : [])
        .map(x => String(x || '').trim().toLowerCase()).filter(Boolean);
    const ammessi = {};
    indirizzi.forEach(x => { ammessi[x] = true; });

    if (!chiave || !indirizzi.length) return { stato: 'nessuno', esiti: {} };
    if (!N.brevoAttivo()) {
        return { stato: 'non-disponibile', esiti: {}, msg: 'Brevo non e attivo su questo servizio: aperture e clic non si possono leggere.' };
    }

    const ora = Date.now();
    /* Da quando guardare. Un giorno prima del primo invio, perche' Brevo
       aggrega per giornate nel proprio fuso e un invio delle 23:40
       rischierebbe di restare fuori dalla finestra. */
    const dal = Math.max(ora - FINESTRA_GIORNI * GIORNO_MS, (Number(opz.dal) || ora) - GIORNO_MS);

    const cache = await daFirestore(db, chiave);
    const fresca = cache && Number(cache.quando) && (ora - Number(cache.quando)) < TTL_MS;
    const inPausa = cache && Number(cache.ultimoTentativo) && (ora - Number(cache.ultimoTentativo)) < PAUSA_ERRORE_MS;
    if (fresca) return { stato: 'ok', aggiornato: Number(cache.quando), esiti: cache.esiti || {} };
    if (inPausa) {
        return cache.esiti
            ? { stato: 'vecchio', aggiornato: Number(cache.quando) || 0, esiti: cache.esiti }
            : { stato: 'attesa', esiti: {}, msg: 'Non ancora letto: riprova fra poco.' };
    }

    const righe = [];
    let errore = '';
    for (let pagina = 0; pagina < MAX_PAGINE; pagina++) {
        let r;
        try {
            r = await N.chiamataBrevo('/smtp/statistics/events'
                + '?limit=' + PER_PAGINA + '&offset=' + (pagina * PER_PAGINA)
                + '&startDate=' + encodeURIComponent(giorno(dal))
                + '&endDate=' + encodeURIComponent(giorno(ora)));
        } catch (e) {
            r = { ok: false, stato: 0, testo: String((e && e.message) || e) };
        }
        if (!r.ok) {
            /* 404 su questo endpoint vuol dire "nessun evento nel periodo",
               non un guasto: e' la stessa convenzione della blocklist. */
            if (r.stato === 404) break;
            errore = r.stato === 429
                ? 'Brevo ha risposto che sono troppe richieste: riprova fra qualche minuto.'
                : 'Brevo non ha risposto (' + (r.stato || 'rete') + ').';
            break;
        }
        const blocco = (r.dati && Array.isArray(r.dati.events)) ? r.dati.events
            : (Array.isArray(r.dati) ? r.dati : []);
        righe.push.apply(righe, blocco);
        if (blocco.length < PER_PAGINA) break;
    }

    if (errore) {
        await inFirestore(db, chiave, { ultimoTentativo: ora, ultimoErrore: errore.slice(0, 200) });
        return cache && cache.esiti
            ? { stato: 'vecchio', aggiornato: Number(cache.quando) || 0, esiti: cache.esiti, msg: errore }
            : { stato: 'errore', esiti: {}, msg: errore };
    }

    const esiti = raccogli(righe, ammessi);
    await inFirestore(db, chiave, { quando: ora, esiti: esiti, ultimoTentativo: 0, ultimoErrore: '' });
    return { stato: 'ok', aggiornato: ora, esiti: esiti };
}

module.exports = { leggi, raccogli, tipoDi, vuoto, FINESTRA_GIORNI, TTL_MS };
