/* ============================================================
   Nuova iscrizione a un evento (dal form pubblico del sito)
   ------------------------------------------------------------
   I form del sito continuano a scrivere sul foglio Google come
   sempre; IN PIU' mandano qui gli stessi dati, che finiscono
   direttamente su Firestore (collezione "iscrizioni").

   Perche': il foglio resta comodo per chi lo consulta, ma l'area
   riservata non deve dipendere da una catena di tre pezzi (script
   di Google, API Sheets, account di servizio condiviso). Con i
   dati anche su Firestore, se una delle due strade si rompe
   l'altra continua a funzionare.

   Questo endpoint e' PUBBLICO per forza (lo chiama il visitatore
   che si iscrive), quindi:
     - accetta solo POST e solo campi noti, con lunghezze massime;
     - scrive con l'account di servizio (Admin SDK), quindi le
       regole di sicurezza di Firestore non entrano in gioco e
       nessuno puo' scrivere a mano sul database dal browser;
     - l'identificativo del documento e' ricavato da email e data,
       quindi un doppio invio aggiorna la stessa scheda invece di
       creare un duplicato;
     - limita gli invii ripetuti dallo stesso indirizzo IP.
   Non restituisce mai dati: risponde solo ok/non ok.

   QUI DENTRO vive anche il COMPLETAMENTO dei dati di un'iscrizione
   manuale (azioni "completa-leggi" e "completa-salva"), perche' il
   piano Hobby di Vercel ammette al massimo 12 funzioni per deploy e
   una tredicesima farebbe fallire l'intera pubblicazione. E' lo
   stesso tipo di endpoint (pubblico, con limite per IP): cambia solo
   l'azione nel corpo. Vedi completaIscrizione() qui sotto.
   ============================================================ */

const admin = require('firebase-admin');
// firma del collegamento personale "completa i dati" (stesso segreto della
// disiscrizione, contesto diverso). Da NL si usano SOLO le funzioni di firma
// e la regex email: l'inizializzazione di firebase-admin resta quella locale,
// per non inizializzare l'app due volte.
const NL = require('../lib/newsletter');

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
function initAdmin(cred) {
    if (appPronta) return;
    admin.initializeApp({ credential: admin.credential.cert(cred) });
    appPronta = true;
}

/* --- limite invii per indirizzo IP ---
   In memoria: su serverless l'istanza puo' cambiare, quindi non e' una
   difesa assoluta, ma taglia i tentativi ripetuti dalla stessa origine. */
const RL_FINESTRA_MS = 10 * 60 * 1000;
const RL_MAX = 8;
const invii = new Map();
function troppiInvii(ip) {
    if (!ip) return false;
    const ora = Date.now();
    const elenco = (invii.get(ip) || []).filter(t => ora - t < RL_FINESTRA_MS);
    if (elenco.length >= RL_MAX) { invii.set(ip, elenco); return true; }
    elenco.push(ora);
    invii.set(ip, elenco);
    // pulizia: non lasciamo crescere la mappa all'infinito
    if (invii.size > 500) {
        for (const [k, v] of invii) {
            if (!v.length || ora - v[v.length - 1] > RL_FINESTRA_MS) invii.delete(k);
        }
    }
    return false;
}

// testo ripulito e accorciato: niente campi enormi nel database
function testo(v, max) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 200);
}
function emailValida(e) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}
/* Consenso: TRE valori, non due. true = spuntato, false = ha detto no,
   null = il modulo non lo manda affatto.
   La differenza conta piu' di quanto sembri. Registrare false quando il campo
   non arriva vuol dire mettere agli atti un rifiuto che nessuno ha espresso, e
   il rifiuto e' definitivo: chi risulta rifiutato non entra in nessun invio,
   non si puo' spuntare a mano e non lo recupera nemmeno l'attribuzione del
   consenso, che per scelta vale solo per i consensi NON RISULTANTI. Un modulo
   collegato senza la casella marketing marchierebbe cosi ogni nuovo iscritto.
   Si accettano anche le forme testuali, accento compreso: i moduli scrivono
   "Si" con l'accento, e un consenso non deve dipendere da come e' scritto. */
const VERO_CONSENSO = /^(si|s|true|vero|1|x|yes|on)$/i;
function consenso(v) {
    if (v === true || v === false) return v;
    if (v == null) return null;
    const s = String(v).trim().normalize('NFD').replace(/\p{M}/gu, '');
    return s ? VERO_CONSENSO.test(s) : null;
}
/* Data di iscrizione in formato italiano, fuso di Roma (il server sta su UTC).
   Se il modulo non la manda ce la mette il server, perche' una scheda senza
   data fa due danni: l'identificativo del documento diventa lo stesso per ogni
   invio della stessa persona, e l'area riservata legge la data assente come
   "riga vecchissima", quindi l'attribuzione del consenso ai contatti gia'
   presenti coprirebbe anche un'iscrizione arrivata oggi. */
function adesso() {
    const f = new Intl.DateTimeFormat('it-IT', {
        timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
    const p = {};
    f.formatToParts(new Date()).forEach(x => { p[x.type] = x.value; });
    return p.day + '/' + p.month + '/' + p.year + ' ' + p.hour + ':' + p.minute + ':' + p.second;
}
// data italiana "gg/mm/aaaa hh:mm:ss": nell'ID le barre non sono ammesse
function idDocumento(email, data, nome, cognome) {
    const base = (email || (testo(nome, 60) + '.' + testo(cognome, 60)).toLowerCase()) + '|' + data;
    return base.replace(/[\/\\.#$\[\]]/g, '-').slice(0, 300) || 'senza-identificativo';
}


/* Segna che i dati sono cambiati, cosi la lettura sa che deve rileggere. */
async function segnaCambiamento(db) {
    try {
        await db.collection('meta').doc('iscrizioni')
            .set({ rev: admin.firestore.FieldValue.increment(1), quando: Date.now() }, { merge: true });
    } catch (e) { /* non e grave: la lettura ha comunque una scadenza a tempo */ }
}

/* ============================================================
   Completamento dei dati di un'iscrizione manuale
   ------------------------------------------------------------
   Un'iscrizione inserita a mano (Eventbrite, altre piattaforme) ha
   spesso i soli dati dell'intestatario e puo' coprire piu' posti.
   L'area riservata gli manda una mail con un collegamento personale:

     /completa_iscrizione/?d=<idDoc>&t=<firma>

   La firma e' un HMAC dell'identificativo del documento: il
   collegamento apre SOLO quella scheda, e a firma sbagliata si
   risponde sempre allo stesso modo, senza dire se la scheda esiste.

   - "completa-leggi": evento, posti e dati noti dell'intestatario,
     per precompilare il modulo della pagina;
   - "completa-salva": il PRIMO partecipante aggiorna la scheda
     originale (mai l'email, che e' l'identita' della scheda); gli
     altri diventano schede proprie con documenti dal nome fisso
     (<idDoc>~p2, ~p3...), quindi rimandare il modulo sovrascrive
     invece di duplicare. I posti si RIPARTISCONO senza cambiare il
     totale: la scheda originale tiene quelli non ancora nominati e i
     figli oltre l'ultimo invio vengono tolti. Nessun doppio conteggio
     dei partecipanti, qualunque cosa faccia chi compila.
   ============================================================ */
const MSG_LINK = 'Collegamento non valido o scaduto. Scrivi a info@nextgenerationbusiness.it e provvediamo noi.';
const MAX_PART = 99;
function pulisciPartecipante(p) {
    return {
        nome: testo(p.nome, 120), cognome: testo(p.cognome, 120),
        email: testo(p.email, 200).toLowerCase(),
        azienda: testo(p.azienda, 200), ruolo: testo(p.ruolo, 200), telefono: testo(p.telefono, 60)
    };
}
function partecipanteVuoto(p) { return !p.nome && !p.cognome && !p.email && !p.azienda && !p.telefono; }

async function completaIscrizione(azione, body, res) {
    const idDoc = String(body.d || '').slice(0, 400);
    const token = String(body.t || '').trim();
    if (!idDoc || !token || !NL.firmaCompletaValida(idDoc, token)) {
        res.status(403).json({ ok: false, msg: MSG_LINK });
        return;
    }

    initAdmin(leggiServiceAccount());
    const db = admin.firestore();
    const rif = db.collection('iscrizioni').doc(idDoc);
    const snap = await rif.get();
    // scheda sparita (cancellata dall'area riservata): stessa risposta del
    // collegamento sbagliato, per non dire niente a chi tira a indovinare
    if (!snap.exists) { res.status(403).json({ ok: false, msg: MSG_LINK }); return; }
    const scheda = snap.data() || {};
    // il totale dei posti dell'ordine NON cambia mai: alla prima ripartizione
    // si mette da parte, perche' "partecipanti" della scheda da li' in poi
    // conta solo i posti non ancora nominati
    const nOrdine = Math.min(MAX_PART, Math.max(1,
        parseInt(scheda.partecipantiOrdine, 10) || parseInt(scheda.partecipanti, 10) || 1));

    if (azione === 'completa-leggi') {
        res.status(200).json({
            ok: true,
            pagina: String(scheda.pagina || ''),
            partecipanti: nOrdine,
            completato: !!scheda.completato,
            capofila: {
                nome: String(scheda.nome || ''), cognome: String(scheda.cognome || ''),
                email: String(scheda.email || ''),
                azienda: String(scheda.azienda || ''), ruolo: String(scheda.ruolo || ''),
                telefono: String(scheda.telefono || '')
            }
        });
        return;
    }

    // al massimo i posti dell'ordine: i partecipanti in piu' non entrano,
    // perche' e' cosi' che il totale non puo' crescere da questo modulo
    const grezzi = Array.isArray(body.partecipanti) ? body.partecipanti.slice(0, nOrdine) : [];
    const lista = grezzi.map(p => pulisciPartecipante(p && typeof p === 'object' ? p : {})).filter(p => !partecipanteVuoto(p));
    if (!lista.length) { res.status(400).json({ ok: false, msg: 'Compila almeno i dati di un partecipante.' }); return; }
    for (const p of lista) {
        if (p.email && !NL.EMAIL_RE.test(p.email)) {
            res.status(400).json({ ok: false, msg: 'Uno degli indirizzi email non sembra valido: ' + p.email }); return;
        }
        if (!p.nome && !p.cognome && !p.email) {
            res.status(400).json({ ok: false, msg: 'Per ogni partecipante servono almeno nome e cognome, oppure l\'email.' }); return;
        }
    }

    /* Il primo della lista e' l'intestatario: aggiorna la scheda originale.
       L'email NON si tocca: e' l'identita' della scheda (le presenze sono
       agganciate li') e l'indirizzo a cui e' arrivato questo collegamento. */
    const primo = lista[0];
    const figli = lista.slice(1);
    // la scheda originale tiene i posti non ancora nominati: mai sotto 1
    const restanti = Math.max(1, nOrdine - figli.length);
    await rif.set({
        nome: primo.nome, cognome: primo.cognome,
        azienda: primo.azienda, ruolo: primo.ruolo, telefono: primo.telefono,
        partecipanti: restanti,
        partecipantiOrdine: nOrdine,
        extra: { Partecipanti: String(restanti) },
        completato: { quando: Date.now(), partecipanti: lista.length }
    }, { merge: true });

    // ogni altro partecipante diventa una scheda propria, con un posto solo.
    // I nomi dei documenti sono FISSI (idDoc~p2, ~p3...): rimandare il modulo
    // sovrascrive le stesse schede invece di crearne di nuove.
    const etichettaPortale = (scheda.extra && scheda.extra.Portale) || scheda.portaleNome || '';
    const batch = db.batch();
    figli.forEach((p, i) => {
        batch.set(db.collection('iscrizioni').doc(idDoc + '~p' + (i + 2)), {
            data: String(scheda.data || ''),
            pagina: String(scheda.pagina || ''),
            nome: p.nome, cognome: p.cognome, email: p.email,
            azienda: p.azienda, ruolo: p.ruolo, telefono: p.telefono,
            messaggio: '',
            portale: String(scheda.portale || ''),
            portaleNome: etichettaPortale,
            partecipanti: 1,
            extra: Object.assign({ Partecipanti: '1' }, etichettaPortale ? { Portale: etichettaPortale } : {}),
            origine: 'partecipante',
            gruppo: idDoc,
            ricevuto: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    });
    // i figli oltre l'ultimo invio si tolgono: se prima erano stati indicati
    // tre nomi e ora due, il terzo non deve restare a gonfiare l'elenco
    for (let i = figli.length + 2; i <= nOrdine; i++) {
        batch.delete(db.collection('iscrizioni').doc(idDoc + '~p' + i));
    }
    await batch.commit();
    await segnaCambiamento(db);

    res.status(200).json({ ok: true, salvati: lista.length, posti: nOrdine });
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false }); return; }

    try {
        const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
        if (troppiInvii(ip)) { res.status(429).json({ ok: false, msg: 'Troppi invii ravvicinati.' }); return; }

        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
        // completamento dei dati (dal collegamento personale nella mail): altra
        // azione, stessa funzione. I form del sito non mandano "azione", quindi
        // per loro non cambia niente.
        const azione = String(body.azione || '');
        if (azione === 'completa-leggi' || azione === 'completa-salva') {
            await completaIscrizione(azione, body, res);
            return;
        }
        const email = testo(body.email, 200).toLowerCase();
        const nome = testo(body.nome, 120);
        const cognome = testo(body.cognome, 120);
        const pagina = testo(body.pagina, 200);
        // servono almeno un recapito e l'indicazione dell'evento
        if (!pagina) { res.status(400).json({ ok: false, msg: 'Evento non indicato.' }); return; }
        if (!email && !nome && !cognome) { res.status(400).json({ ok: false, msg: 'Dati insufficienti.' }); return; }
        if (email && !emailValida(email)) { res.status(400).json({ ok: false, msg: 'Indirizzo email non valido.' }); return; }

        const cred = leggiServiceAccount();
        initAdmin(cred);

        const data = testo(body.data, 40) || adesso();
        const scheda = {
            data: data,
            pagina: pagina,
            nome: nome,
            cognome: cognome,
            email: email,
            azienda: testo(body.azienda, 200),
            ruolo: testo(body.ruolo, 200),
            telefono: testo(body.telefono, 60),
            messaggio: testo(body.messaggio, 2000),
            privacy: consenso(body.privacy),
            marketing: consenso(body.marketing),
            ricevuto: admin.firestore.FieldValue.serverTimestamp()
        };

        /* Campi per il business matching, oggi mandati solo dal modulo di
           Napoli. Vengono aggiunti SOLO se arrivano davvero: tutti gli altri
           moduli del dominio postano qui lo stesso oggetto senza questi campi,
           e riempire ogni iscrizione di ogni altro evento con cinque stringhe
           vuote sarebbe rumore che poi qualcuno deve interpretare. Chi legge
           trova il campo quando c'e' e non lo trova quando non c'e'. */
        const CAMPI_MATCHING = { profilo: 40, settore: 40, dimensione: 40, incontro: 20, interessi: 400 };
        for (const campo of Object.keys(CAMPI_MATCHING)) {
            const valore = testo(body[campo], CAMPI_MATCHING[campo]);
            if (valore) scheda[campo] = valore;
        }

        await admin.firestore().collection('iscrizioni')
            .doc(idDocumento(email, data, nome, cognome))
            .set(scheda, { merge: true });
        await segnaCambiamento(admin.firestore());

        res.status(200).json({ ok: true });
    } catch (e) {
        // il visitatore non deve vedere dettagli tecnici: restano nei log
        console.error('Iscrizione non registrata:', String((e && e.message) || e).slice(0, 200));
        res.status(500).json({ ok: false });
    }
};
