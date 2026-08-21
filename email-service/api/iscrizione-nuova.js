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
const nodemailer = require('nodemailer');
// firma del collegamento personale "completa i dati" (stesso segreto della
// disiscrizione, contesto diverso). Da NL si usano SOLO le funzioni di firma
// e la regex email: l'inizializzazione di firebase-admin resta quella locale,
// per non inizializzare l'app due volte.
const NL = require('../lib/newsletter');
// mail NGB composte dal servizio: questo endpoint e' pubblico, quindi l'HTML
// non puo' arrivare da fuori come per gli invii dell'area riservata
const MNGB = require('../lib/mail-ngb');

// stesso trasporto SMTP delle altre mail di servizio
function trasporto() {
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 465,
        secure: (Number(process.env.SMTP_PORT) || 465) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
}
function mittenteMail() {
    const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
    const fromName = (process.env.SMTP_FROM_NAME || 'Revilaw S.p.A.').replace(/[\r\n]/g, ' ').slice(0, 80);
    return '"' + fromName + '" <' + fromEmail + '>';
}
/* Le conferme automatiche partono SOLO per i moduli degli eventi: su questo
   archivio scrivono anche gli altri moduli del sito (approfondimenti,
   newsletter), e a quelli non va spedito nulla. */
const RE_PAGINA_EVENTO = /verona|roma|napoli|milano/i;

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

   - "completa-leggi": evento, posti, dati noti dell'intestatario e
     dei partecipanti gia' scritti, per precompilare il modulo;
   - "completa-salva": UN ELEMENTO PER POSTO (1..N, il primo e'
     l'intestatario). Ogni posto puo' portare i dati, essere lasciato
     vuoto (posto riservato ma senza nome) oppure essere ANNULLATO.
     Il primo aggiorna la scheda originale (mai l'email, che e'
     l'identita' della scheda); gli altri diventano schede proprie con
     documenti dal nome fisso (<idDoc>~p2, ~p3...), quindi rimandare
     il modulo sovrascrive invece di duplicare. I posti senza nome
     restano contati sulla scheda originale, gli annullati escono dal
     conteggio: il totale non puo' MAI crescere da questo modulo, e
     ogni scheda scritta porta la firma di chi ha compilato
     ("compilato"), che l'area riservata mostra in "Aggiornato da".
     A ogni salvataggio parte all'intestatario la mail di riepilogo
     con lo stesso collegamento per modificare o annullare ancora.
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

/* ============================================================
   Interessi per gli incontri B2B (azioni "b2b-leggi" e "b2b-salva")
   ------------------------------------------------------------
   L'invito agli incontri B2B porta un collegamento personale (stessa
   firma della scheda) verso /incontri_b2b/: l'iscritto sceglie uno o
   piu' temi e racconta in breve il progetto. Le scelte finiscono
   sulla SUA scheda negli stessi campi del modulo di Napoli
   ("interessi" e "incontro"), cosi' l'area riservata le mostra nelle
   colonne aggiuntive gia' esistenti e il riepilogo per argomento
   somma tutto, da qualunque strada arrivi; la nota libera va nella
   colonna "Nota B2B". Le etichette le decide il servizio: dal modulo
   arrivano solo gli indici.
   ============================================================ */
const TEMI_B2B = [
    'Merito creditizio',
    'Governance e controllo di gestione',
    'Adeguati assetti',
    'ESG e sostenibilita',
    'Modello 231 e Rating di Legalita',
    'Finanza agevolata',
    'Tax Control Framework',
    "Bagnoli e America's Cup 2027",
    'Altre esigenze'
];
/* Etichette storiche del form del sito che non coincidono alla lettera con i
   nove temi: si riportano comunque come caselle gia' spuntate, cosi' chi ha
   scelto dal sito si ritrova le sue preferenze e puo' modificarle. Le chiavi
   sono in forma normalizzata (minuscole, senza accenti). */
const ALIAS_B2B = {
    'modello 231 e tax control framework': [4, 6],
    'rating di legalita': [4]
};
function normalizzaTema(s) {
    return String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
/* Dal campo "interessi" (etichette separate da virgola) agli INDICI dei nove
   temi, piu' le voci che non corrispondono a nessuno: quelle non si buttano
   (possono venire da una scrittura a mano) e al salvataggio si riportano. */
function indiciDaInteressi(grezzo) {
    const attuali = String(grezzo || '').split(',').map(s => s.trim()).filter(Boolean);
    const norme = TEMI_B2B.map(normalizzaTema);
    const indici = new Set();
    const nonMappate = [];
    attuali.forEach(v => {
        const n = normalizzaTema(v);
        const i = norme.indexOf(n);
        if (i >= 0) { indici.add(i); return; }
        if (ALIAS_B2B[n]) { ALIAS_B2B[n].forEach(k => indici.add(k)); return; }
        nonMappate.push(v);
    });
    return { indici: Array.from(indici).sort((a, b) => a - b), nonMappate: nonMappate };
}
async function interessiB2B(azione, body, res) {
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
    if (!snap.exists) { res.status(403).json({ ok: false, msg: MSG_LINK }); return; }
    const scheda = snap.data() || {};

    if (azione === 'b2b-leggi') {
        res.status(200).json({
            ok: true,
            pagina: String(scheda.pagina || ''),
            nome: ((String(scheda.nome || '') + ' ' + String(scheda.cognome || '')).trim()),
            temi: TEMI_B2B,
            // le preferenze gia' espresse tornano come caselle spuntate, anche
            // quando arrivano dal form del sito con le etichette storiche
            scelti: indiciDaInteressi(scheda.interessi).indici,
            nota: String((scheda.extra && scheda.extra['Nota B2B']) || '')
        });
        return;
    }

    // b2b-salva: indici dei temi + nota libera. Le voci del campo che non
    // corrispondono a nessuno dei nove temi (scritte a mano, per esempio)
    // si riportano cosi' come sono: il modulo non le mostra e non deve
    // nemmeno cancellarle.
    const indici = Array.isArray(body.temi) ? body.temi.map(n => parseInt(n, 10)).filter(n => n >= 0 && n < TEMI_B2B.length) : [];
    const scelti = TEMI_B2B.filter((t, i) => indici.indexOf(i) >= 0);
    const nota = testo(body.nota, 800);
    if (!scelti.length && !nota) {
        res.status(400).json({ ok: false, msg: 'Indica almeno un tema di interesse, o racconta in breve la tua esigenza.' });
        return;
    }
    const chi = ((String(scheda.nome || '') + ' ' + String(scheda.cognome || '')).trim()) || String(scheda.email || '');
    await rif.set({
        interessi: scelti.concat(indiciDaInteressi(scheda.interessi).nonMappate).join(','),
        incontro: 'si',
        extra: { 'Nota B2B': nota },
        b2bRisposta: { quando: Date.now(), temi: scelti.length },
        compilato: { daNome: chi, quando: Date.now() }
    }, { merge: true });
    await segnaCambiamento(db);
    res.status(200).json({ ok: true, temi: scelti.length });
}

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
    // conta solo intestatario e posti non ancora nominati
    const nOrdine = Math.min(MAX_PART, Math.max(1,
        parseInt(scheda.partecipantiOrdine, 10) || parseInt(scheda.partecipanti, 10) || 1));

    // stato attuale dei posti 2..N: serve al modulo per preriempire e al
    // riepilogo per non perdere cio' che era gia' stato scritto
    const figliRef = [];
    for (let i = 2; i <= nOrdine; i++) figliRef.push(db.collection('iscrizioni').doc(idDoc + '~p' + i));
    const figliSnap = figliRef.length ? await db.getAll(...figliRef) : [];
    const figliAttuali = figliSnap.map(s => (s.exists ? (s.data() || {}) : null));

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
                telefono: String(scheda.telefono || ''),
                annullato: !!scheda.annullato
            },
            // un elemento per posto (2..N): dati gia' scritti, segnaposto di un
            // posto annullato, oppure null se il posto non ha ancora un nome
            altri: figliAttuali.map(f => f ? {
                nome: String(f.nome || ''), cognome: String(f.cognome || ''),
                email: String(f.email || ''), azienda: String(f.azienda || ''),
                ruolo: String(f.ruolo || ''), telefono: String(f.telefono || ''),
                annullato: !!f.annullato
            } : null)
        });
        return;
    }

    /* --- completa-salva: un elemento PER POSTO --- */
    const grezzi = Array.isArray(body.partecipanti) ? body.partecipanti.slice(0, nOrdine) : [];
    const posti = [];
    for (let i = 0; i < nOrdine; i++) {
        const g = grezzi[i] && typeof grezzi[i] === 'object' ? grezzi[i] : {};
        if (g.annulla === true) { posti.push({ annulla: true }); continue; }
        const p = pulisciPartecipante(g);
        posti.push(partecipanteVuoto(p) ? null : p);
    }
    if (!posti.some(p => p)) {
        res.status(400).json({ ok: false, msg: 'Compila i dati di almeno un partecipante, oppure segna i posti da annullare.' }); return;
    }
    for (const p of posti) {
        if (!p || p.annulla) continue;
        if (p.email && !NL.EMAIL_RE.test(p.email)) {
            res.status(400).json({ ok: false, msg: 'Uno degli indirizzi email non sembra valido: ' + p.email }); return;
        }
        if (!p.nome && !p.cognome && !p.email) {
            res.status(400).json({ ok: false, msg: 'Per ogni partecipante servono almeno nome e cognome, oppure l\'email.' }); return;
        }
    }

    const primo = posti[0];
    const posto1Annullato = !!(primo && primo.annulla);
    const senzaNomeAltri = posti.slice(1).filter(p => !p).length;
    const figliCompilati = posti.slice(1).filter(p => p && !p.annulla).length;
    const annullati = posti.filter(p => p && p.annulla).length;
    // chi firma queste modifiche: l'intestatario. La firma finisce su ogni
    // scheda scritta e l'area riservata la mostra come "Nome (dal modulo)".
    const intestatarioNome = (primo && !primo.annulla && (primo.nome || primo.cognome))
        ? (primo.nome + ' ' + primo.cognome).trim()
        : ((String(scheda.nome || '') + ' ' + String(scheda.cognome || '')).trim() || String(scheda.email || ''));
    const compilato = { daNome: intestatarioNome, quando: Date.now() };

    /* La scheda originale: i dati dell'intestatario (mai l'email, che e'
       l'identita' della scheda e l'indirizzo del collegamento) piu' i posti
       senza nome. Con l'intestatario annullato la scheda esce dal conteggio
       e dall'elenco; i posti senza nome, senza piu' una scheda che li porti,
       decadono con lei (i partecipanti gia' nominati restano). */
    const postiScheda = posto1Annullato ? 0 : 1 + senzaNomeAltri;
    const patch = {
        partecipanti: postiScheda,
        partecipantiOrdine: nOrdine,
        extra: { Partecipanti: String(postiScheda) },
        compilato: compilato,
        completato: { quando: Date.now(), partecipanti: figliCompilati + (posto1Annullato ? 0 : 1) }
    };
    if (primo && !primo.annulla) {
        patch.nome = primo.nome; patch.cognome = primo.cognome;
        patch.azienda = primo.azienda; patch.ruolo = primo.ruolo; patch.telefono = primo.telefono;
    }
    // annullare e' reversibile: ricompilando i propri dati la scheda si riattiva
    patch.annullato = posto1Annullato
        ? { quando: Date.now(), da: 'intestatario' }
        : admin.firestore.FieldValue.delete();
    await rif.set(patch, { merge: true });

    // i posti 2..N per POSIZIONE: documenti dal nome fisso, cosi' rimandare il
    // modulo sovrascrive invece di duplicare
    const etichettaPortale = (scheda.extra && scheda.extra.Portale) || scheda.portaleNome || '';
    const batch = db.batch();
    for (let i = 2; i <= nOrdine; i++) {
        const p = posti[i - 1];
        const refFiglio = db.collection('iscrizioni').doc(idDoc + '~p' + i);
        if (p && p.annulla) {
            // segnaposto NON conteggiato: riaprendo il modulo si vede che il
            // posto e' stato annullato, e l'elenco non lo mostra
            batch.set(refFiglio, {
                data: String(scheda.data || ''), pagina: String(scheda.pagina || ''),
                gruppo: idDoc, origine: 'partecipante',
                partecipanti: 0, extra: { Partecipanti: '0' },
                annullato: { quando: Date.now(), da: 'intestatario' },
                compilato: compilato
            }, { merge: true });
        } else if (p) {
            batch.set(refFiglio, {
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
                compilato: compilato,
                annullato: admin.firestore.FieldValue.delete(),
                ricevuto: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        } else {
            // posto senza nome: nessuna scheda propria, resta contato sull'originale
            batch.delete(refFiglio);
        }
    }
    await batch.commit();
    await segnaCambiamento(db);

    /* Riepilogo e mail di conferma delle variazioni, con lo stesso collegamento
       per modificare o annullare ancora. Se l'invio fallisce le modifiche
       restano salvate: la mail e' una cortesia, non una condizione. */
    const attivi = [];
    if (!posto1Annullato) {
        attivi.push(primo && !primo.annulla
            ? { nome: primo.nome, cognome: primo.cognome, azienda: primo.azienda }
            : { nome: String(scheda.nome || ''), cognome: String(scheda.cognome || ''), azienda: String(scheda.azienda || '') });
    }
    posti.slice(1).forEach(p => { if (p && !p.annulla) attivi.push({ nome: p.nome, cognome: p.cognome, azienda: p.azienda }); });
    const postiAttivi = postiScheda + figliCompilati;
    let mailInviata = false;
    if (scheda.email && NL.EMAIL_RE.test(String(scheda.email))) {
        try {
            const m = MNGB.confermaVariazioni({
                pagina: scheda.pagina, intestatario: intestatarioNome,
                attivi: attivi, postiAttivi: postiAttivi,
                senzaNome: posto1Annullato ? 0 : senzaNomeAltri, annullati: annullati
            }, NL.linkCompleta(idDoc));
            const messaggio = {
                from: mittenteMail(), to: String(scheda.email),
                subject: m.oggetto, text: m.testo, html: m.html
            };
            // chi aveva chiesto i dati dall'area riservata riceve copia nascosta:
            // sa cosi' che sono arrivati, senza dover controllare l'elenco
            const daStaff = scheda.datiRichiesti && String(scheda.datiRichiesti.da || '');
            if (daStaff && daStaff !== String(scheda.email)) messaggio.bcc = daStaff;
            await trasporto().sendMail(messaggio);
            mailInviata = true;
        } catch (e) {
            console.error('Conferma variazioni non inviata:', String((e && e.message) || e).slice(0, 200));
        }
    }

    res.status(200).json({ ok: true, postiAttivi: postiAttivi, annullati: annullati, mail: mailInviata });
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
        if (azione === 'b2b-leggi' || azione === 'b2b-salva') {
            await interessiB2B(azione, body, res);
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

        const idDoc = idDocumento(email, data, nome, cognome);
        await admin.firestore().collection('iscrizioni')
            .doc(idDoc)
            .set(scheda, { merge: true });
        await segnaCambiamento(admin.firestore());

        /* Conferma automatica a chi si iscrive dai moduli degli EVENTI, con il
           collegamento personale per modificare o annullare l'iscrizione: la
           stessa possibilita' che ha chi viene inserito a mano. Se l'invio
           fallisce l'iscrizione resta valida e il visitatore non se ne
           accorge: la registrazione e' il lavoro, la mail la cortesia. */
        if (email && RE_PAGINA_EVENTO.test(pagina)) {
            try {
                const m = MNGB.confermaSito(
                    { nome: nome, cognome: cognome, email: email, azienda: scheda.azienda, pagina: pagina, data: data },
                    NL.linkCompleta(idDoc));
                await trasporto().sendMail({
                    from: mittenteMail(), to: email,
                    subject: m.oggetto, text: m.testo, html: m.html
                });
            } catch (e) {
                console.error('Conferma iscrizione dal sito non inviata:', String((e && e.message) || e).slice(0, 200));
            }
        }

        res.status(200).json({ ok: true });
    } catch (e) {
        // il visitatore non deve vedere dettagli tecnici: restano nei log
        console.error('Iscrizione non registrata:', String((e && e.message) || e).slice(0, 200));
        res.status(500).json({ ok: false });
    }
};
