/* ============================================================
   Iscrizioni con il cellulare verificato (Milano 2027)
   ------------------------------------------------------------
   Per gli eventi elencati in EVENTI il modulo del sito chiede DUE
   conferme, non una:
     - il numero di cellulare, con un codice di sei cifre che arriva
       per SMS e si scrive nel modulo PRIMA di spedirlo;
     - l'indirizzo email, con il pulsante della mail di conferma,
       come per Napoli (lib/conferma-email.js).

   E tre regole che a Napoli non c'erano:
     - una sola iscrizione per indirizzo email, per evento;
     - una sola iscrizione per numero di cellulare, per evento;
     - un codice invito vale per DUE iscrizioni al massimo.

   PERCHE' IL CODICE SMS SI VERIFICA NEL MODULO E NON DOPO. Se la
   scheda si scrivesse prima e il numero si confermasse dopo, l'elenco
   si riempirebbe di iscrizioni con un numero mai verificato, e la
   regola "un numero, un'iscrizione" si potrebbe aggirare con numeri
   inventati. Cosi' invece la scheda nasce solo con un numero che ha
   davvero ricevuto il codice: il servizio, a verifica riuscita, rende
   al modulo una firma (numero + evento + scadenza) e la vuole indietro
   insieme ai dati.

   L'UNICITA' E' DI FIRESTORE, NON DI UNA RICERCA. Due invii nello
   stesso secondo con la stessa email passerebbero tutti e due un
   "c'e' gia'?" fatto prima di scrivere. Per ogni iscrizione si
   scrivono, nella STESSA transazione della scheda, due documenti dal
   nome fisso (evento|email|..., evento|tel|...) nella collezione
   `iscrizioniUniche`: se uno dei due esiste gia', e la scheda a cui
   punta e' ancora attiva, la transazione si ferma. Una scheda
   annullata libera l'email e il numero: chi ha annullato deve potersi
   iscrivere di nuovo.
   Il codice invito segue la stessa strada: sul suo documento c'e'
   l'elenco delle iscrizioni fatte con lui (`iscrizioniUsate`) e si
   contano quelle ancora attive. Anche qui un'annullata libera il
   posto.

   GLI SMS COSTANO, e il modulo e' aperto a chiunque: un robot che
   chiede codici a raffica verso numeri a pagamento e' una truffa nota
   (SMS pumping). I freni, dal piu' stretto:
     - solo cellulari ITALIANI (+39 3...): niente numeri esteri;
     - un SMS al minuto e cinque al giorno per lo stesso numero;
     - un tetto giornaliero per tutto il servizio (SMS_MAX_GIORNO);
     - il freno per indirizzo IP di iscrizione-nuova.js;
     - prima di spedire si guarda se email o numero sono gia' iscritti:
       un codice per un'iscrizione che non si puo' fare e' uno spreco.
   Il codice non si salva in chiaro (solo l'impronta) e si puo'
   sbagliare cinque volte, poi se ne chiede un altro.

   GLI SMS PARTONO DA BREVO, lo stesso conto delle mail, con la
   chiave BREVO_API_KEY e il mittente SMS_MITTENTE (vedi README).
   ============================================================ */

const crypto = require('crypto');
const NL = require('./newsletter');
const CODICI = require('./codici-invito');

/* Gli eventi con le iscrizioni verificate. `se` riconosce la pagina del
   modulo ("Milano 26 Febbraio 2027 - Iscrizione") e anche il titolo corto
   delle iscrizioni inserite a mano dall'area riservata. `chiave` e' il nome
   stabile con cui l'evento entra nei documenti di unicita'. */
const EVENTI = [
    { chiave: 'milano-2027-02-26', se: /^milano 26 febbraio 2027/i, nome: 'Milano' }
];
function eventoDi(pagina) {
    const p = String(pagina || '').trim();
    return EVENTI.find(e => e.se.test(p)) || null;
}

const MAX_PER_CODICE = 2;               // iscrizioni per codice invito
const CODICE_VALE_MS = 10 * 60 * 1000;  // il codice SMS scade dopo dieci minuti
const PAUSA_INVII_MS = 60 * 1000;       // un SMS al minuto per numero
const MAX_INVII_GIORNO = 5;             // e cinque al giorno
const MAX_TENTATIVI = 5;                // sbagli concessi per codice
const FIRMA_VALE_MS = 2 * 60 * 60 * 1000; // il numero verificato vale due ore per spedire il modulo
const GIORNO_MS = 24 * 60 * 60 * 1000;
function tettoGiornaliero() { return Number(process.env.SMS_MAX_GIORNO) || 1000; }

function testo(v, max) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 200);
}

/* --- il numero di cellulare ---
   Dalla forma in cui lo scrive una persona ("333 123 4567", "+39 333-1234567",
   "0039 3331234567") alla forma unica "+393331234567", oppure '' se non e' un
   cellulare italiano. I cellulari italiani cominciano con 3 e hanno 9 o 10
   cifre; un fisso comincia con 0 e qui non passa: e' quello che vuol dire
   "deve essere un cellulare". */
function cellulare(v) {
    let s = String(v == null ? '' : v).replace(/[\s().\-\/]/g, '');
    if (s.indexOf('00') === 0) s = '+' + s.slice(2);
    if (s.indexOf('+') === 0) {
        if (s.indexOf('+39') !== 0) return '';
        s = s.slice(3);
    } else if (/^393\d{8,9}$/.test(s) && s.length > 10) {
        // 39 davanti senza il +: 393331234567. Un 393... di dieci cifre e'
        // invece un cellulare nazionale (prefisso 393) e resta com'e'.
        s = s.slice(2);
    }
    if (!/^3\d{8,9}$/.test(s)) return '';
    return '+39' + s;
}
// "+393331234567" -> "+39 333 123 4567": la forma che si legge nell'elenco
function leggibile(numero) {
    const n = String(numero || '').replace(/^\+39/, '');
    if (!n) return '';
    return '+39 ' + n.slice(0, 3) + ' ' + n.slice(3, 6) + ' ' + n.slice(6);
}
// "+39 333 ••• 4567": la sola forma che il servizio rimanda alla pagina
function mascherato(numero) {
    const n = String(numero || '').replace(/^\+39/, '');
    return '+39 ' + n.slice(0, 3) + ' ••• ' + n.slice(-4);
}

function impronta(s) {
    return crypto.createHash('sha256').update(String(s)).digest('hex');
}
/* L'impronta del codice porta dentro numero ed evento: la stessa cifra
   scritta per un altro numero non combacia. */
function improntaCodice(evento, numero, codice) {
    return impronta('sms|' + evento + '|' + numero + '|' + String(codice || '').replace(/\D/g, ''));
}
function rifVerifica(db, evento, numero) {
    return db.collection('verificheSms').doc(impronta(evento + '|' + numero).slice(0, 40));
}
function rifUnico(db, evento, campo, valore) {
    // nel nome di un documento la barra non e' ammessa
    return db.collection('iscrizioniUniche').doc((evento + '|' + campo + '|' + String(valore)).replace(/\//g, '%2F').slice(0, 400));
}
function giornoItaliano(ms) {
    const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' });
    return f.format(new Date(ms));
}
function attiva(scheda) {
    return !!scheda && !scheda.annullato;
}

/* --- la firma del numero verificato --- */
function firmaNumero(evento, numero, adesso) {
    const scade = (adesso || Date.now()) + FIRMA_VALE_MS;
    return scade + '.' + NL.firmaSms(evento, numero, scade);
}
function firmaNumeroValida(evento, numero, token) {
    const t = String(token || '');
    const i = t.indexOf('.');
    if (i < 1) return false;
    const scade = Number(t.slice(0, i));
    if (!scade || scade < Date.now()) return false;
    return NL.firmaSmsValida(evento, numero, scade, t.slice(i + 1));
}

/* --- chi e' gia' iscritto ---
   Due strade, perche' due sono le origini delle schede. Quelle nate da
   questo modulo hanno il documento di unicita'; quelle inserite a mano
   dall'area riservata no, e per l'email si cercano fra le schede. Per il
   numero basta il documento: a mano lo si scrive come capita, e confrontarlo
   vorrebbe dire indovinare. Restituisce 'email', 'telefono' oppure ''. */
async function giaIscritto(db, ev, email, numero, tx) {
    const leggi = r => (tx ? tx.get(r) : r.get());
    const controlli = [];
    if (email) controlli.push(['email', rifUnico(db, ev.chiave, 'email', email)]);
    if (numero) controlli.push(['telefono', rifUnico(db, ev.chiave, 'tel', numero)]);
    const blocchi = await Promise.all(controlli.map(c => leggi(c[1])));
    for (let k = 0; k < controlli.length; k++) {
        const b = blocchi[k];
        if (!b.exists) continue;
        const id = String((b.data() || {}).iscrizione || '');
        if (!id) continue;
        const s = await leggi(db.collection('iscrizioni').doc(id));
        if (s.exists && attiva(s.data())) return { campo: controlli[k][0], blocchi: blocchi };
    }
    return { campo: '', blocchi: blocchi };
}
async function giaIscrittoAMano(db, ev, email) {
    if (!email) return false;
    try {
        const snap = await db.collection('iscrizioni').where('email', '==', email).limit(50).get();
        return snap.docs.some(d => {
            const x = d.data() || {};
            return ev.se.test(String(x.pagina || '').trim()) && attiva(x);
        });
    } catch (_) { return false; }   // la transazione resta il controllo vero
}

const MSG = {
    numero: 'Serve un numero di cellulare italiano (comincia con 3, per esempio 333 123 4567): il codice di verifica arriva per SMS.',
    email: 'Con questo indirizzo email risulta già un\'iscrizione a questo evento (anche se inserita dalla nostra segreteria). Per modificarla usa il collegamento nella mail di conferma, oppure scrivici a info@nextgenerationbusiness.it.',
    telefono: 'Questo numero di cellulare risulta già usato per un\'iscrizione a questo evento: ogni iscrizione richiede un numero suo. Se è un errore scrivici a info@nextgenerationbusiness.it.',
    codice: 'Questo codice invito è già stato usato per due iscrizioni, il massimo previsto. Puoi iscriverti lasciando vuoto il campo del codice, oppure scriverci a info@nextgenerationbusiness.it.',
    nonVerificato: 'Il numero di cellulare non risulta verificato, o la verifica è scaduta. Chiedi il codice SMS e scrivilo nel modulo prima di inviare.',
    servizio: 'In questo momento non riusciamo a mandare l\'SMS. Riprova fra qualche minuto, oppure scrivici a info@nextgenerationbusiness.it.'
};

/* --- la spedizione dell'SMS (Brevo) ---
   Il numero va senza il +. Il mittente e' alfanumerico (11 caratteri al
   massimo) e in Italia va registrato presso l'operatore: vedi README. */
function mittenteSms() {
    return String(process.env.SMS_MITTENTE || 'Revilaw').replace(/[^0-9A-Za-z ]/g, '').slice(0, 11) || 'Revilaw';
}
async function spedisciSms(numero, contenuto) {
    if (!NL.brevoAttivo()) return { ok: false, errore: 'BREVO_API_KEY mancante' };
    try {
        const r = await NL.chiamataBrevo('/transactionalSMS/sms', {
            metodo: 'POST',
            corpo: {
                type: 'transactional', sender: mittenteSms(),
                recipient: String(numero).replace(/^\+/, ''),
                content: contenuto, tag: 'verifica-iscrizione', unicodeEnabled: false
            }
        });
        /* Brevo risponde "accettato" anche quando poi l'operatore scarta il
           messaggio (mittente non approvato, numero spento): nei log di Vercel
           resta il riferimento da cercare nei Log SMS di Brevo, e i crediti
           rimasti. Il numero non si scrive. */
        if (r.ok) {
            const d = r.dati || {};
            console.log('SMS di verifica accettato da Brevo: messageId', d.messageId || '?',
                '- riferimento', d.reference || '?', '- crediti usati', d.usedCredits == null ? '?' : d.usedCredits,
                '- rimasti', d.remainingCredits == null ? '?' : d.remainingCredits, '- mittente', mittenteSms());
            return { ok: true, id: d.messageId || null };
        }
        return { ok: false, errore: 'Brevo ' + r.stato + ' ' + String(r.testo || '').slice(0, 150) };
    } catch (e) {
        return { ok: false, errore: String((e && e.message) || e).slice(0, 200) };
    }
}
/* Il testo non nomina la citta': e' lo stesso per ogni evento, e cosi' e'
   stato registrato su Brevo. L'ULTIMA RIGA e' per i telefoni: "@dominio
   #codice" e' il formato con cui Android (WebOTP) e iPhone legano il codice
   al sito, e lo propongono da soli nel modulo. Il dominio e' quello della
   pagina; tutto il messaggio resta sotto i 160 caratteri (un SMS solo). */
const DOMINIO_SITO = 'nextgenerationbusiness.it';
function testoSms(ev, codice) {
    return codice + ' è il codice per confermare l\'iscrizione a Next Generation Business'
        + '. Scade fra 10 minuti. Non comunicarlo a nessuno.'
        + '\n\n@' + DOMINIO_SITO + ' #' + codice;
}

/* Il tetto giornaliero di tutto il servizio: un contatore per giorno. */
async function prenotaSmsDelGiorno(db) {
    const rif = db.collection('meta').doc('smsVerifica');
    const oggi = giornoItaliano(Date.now());
    return db.runTransaction(async tx => {
        const s = await tx.get(rif);
        const d = s.exists ? (s.data() || {}) : {};
        const inviati = d.giorno === oggi ? (Number(d.inviati) || 0) : 0;
        if (inviati >= tettoGiornaliero()) return false;
        tx.set(rif, { giorno: oggi, inviati: inviati + 1 }, { merge: true });
        return true;
    });
}

/* ---------- azione "sms-invia" (pubblica, dal modulo) ----------
   body: { pagina, telefono, email } */
async function invia(db, body) {
    const ev = eventoDi((body || {}).pagina);
    if (!ev) return { stato: 400, corpo: { ok: false, msg: 'Evento non riconosciuto.' } };
    const numero = cellulare((body || {}).telefono);
    if (!numero) return { stato: 400, corpo: { ok: false, campo: 'telefono', msg: MSG.numero } };
    const email = testo((body || {}).email, 200).toLowerCase();

    // prima di spendere un SMS: l'iscrizione si potrebbe fare?
    const gia = await giaIscritto(db, ev, NL.EMAIL_RE.test(email) ? email : '', numero);
    if (gia.campo) return { stato: 409, corpo: { ok: false, campo: gia.campo, msg: MSG[gia.campo] } };
    if (NL.EMAIL_RE.test(email) && await giaIscrittoAMano(db, ev, email)) {
        return { stato: 409, corpo: { ok: false, campo: 'email', msg: MSG.email } };
    }

    const rif = rifVerifica(db, ev.chiave, numero);
    const ora = Date.now();
    const codice = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const esito = await db.runTransaction(async tx => {
        const s = await tx.get(rif);
        const d = s.exists ? (s.data() || {}) : {};
        const invii = (Array.isArray(d.invii) ? d.invii : []).filter(t => ora - t < GIORNO_MS);
        const ultimo = invii.length ? Math.max.apply(null, invii) : 0;
        if (ultimo && ora - ultimo < PAUSA_INVII_MS) {
            return { attesa: Math.ceil((PAUSA_INVII_MS - (ora - ultimo)) / 1000) };
        }
        if (invii.length >= MAX_INVII_GIORNO) return { troppi: true };
        invii.push(ora);
        tx.set(rif, {
            evento: ev.chiave, numero: numero, invii: invii,
            impronta: improntaCodice(ev.chiave, numero, codice),
            scade: ora + CODICE_VALE_MS, tentativi: 0, verificato: null
        }, { merge: true });
        return { invii: invii };
    });
    if (esito.attesa) {
        return { stato: 429, corpo: { ok: false, campo: 'telefono', attesa: esito.attesa, msg: 'Ti abbiamo appena mandato un codice: per chiederne un altro aspetta ' + esito.attesa + ' secondi.' } };
    }
    if (esito.troppi) {
        return { stato: 429, corpo: { ok: false, campo: 'telefono', msg: 'Per oggi abbiamo già mandato a questo numero tutti i codici previsti. Riprova domani, oppure scrivici a info@nextgenerationbusiness.it.' } };
    }
    if (!await prenotaSmsDelGiorno(db)) {
        console.error('SMS di verifica: raggiunto il tetto giornaliero (SMS_MAX_GIORNO).');
        return { stato: 503, corpo: { ok: false, msg: MSG.servizio } };
    }
    const sms = await spedisciSms(numero, testoSms(ev, codice));
    if (!sms.ok) {
        console.error('SMS di verifica non inviato:', String(sms.errore || '').replace(/\+?\d{9,}/g, '<numero>'));
        // l'invio fallito non deve far aspettare un minuto per riprovare
        try { await rif.set({ invii: esito.invii.slice(0, -1), impronta: null }, { merge: true }); } catch (_) { /* resta il freno */ }
        return { stato: 502, corpo: { ok: false, msg: MSG.servizio } };
    }
    return { stato: 200, corpo: { ok: true, numero: mascherato(numero), attesa: PAUSA_INVII_MS / 1000, vale: CODICE_VALE_MS / 60000 } };
}

/* ---------- azione "sms-verifica" (pubblica, dal modulo) ----------
   body: { pagina, telefono, codice }. A codice giusto rende la firma del
   numero, che il modulo rimanda con l'iscrizione. Il codice si usa una
   volta: dopo la verifica l'impronta si cancella. */
async function verifica(db, body) {
    const ev = eventoDi((body || {}).pagina);
    if (!ev) return { stato: 400, corpo: { ok: false, msg: 'Evento non riconosciuto.' } };
    const numero = cellulare((body || {}).telefono);
    if (!numero) return { stato: 400, corpo: { ok: false, campo: 'telefono', msg: MSG.numero } };
    const codice = String((body || {}).codice || '').replace(/\D/g, '');
    if (codice.length !== 6) return { stato: 400, corpo: { ok: false, msg: 'Il codice è di 6 cifre.' } };

    const rif = rifVerifica(db, ev.chiave, numero);
    const ora = Date.now();
    const r = await db.runTransaction(async tx => {
        const s = await tx.get(rif);
        const d = s.exists ? (s.data() || {}) : {};
        if (!d.impronta) return { esito: 'nessuno' };
        if (Number(d.scade) < ora) return { esito: 'scaduto' };
        const tentativi = Number(d.tentativi) || 0;
        if (tentativi >= MAX_TENTATIVI) return { esito: 'troppi' };
        const giusto = crypto.timingSafeEqual(
            Buffer.from(String(d.impronta)), Buffer.from(improntaCodice(ev.chiave, numero, codice)));
        if (!giusto) {
            tx.set(rif, { tentativi: tentativi + 1 }, { merge: true });
            return { esito: 'sbagliato', restano: MAX_TENTATIVI - tentativi - 1 };
        }
        tx.set(rif, { impronta: null, verificato: ora }, { merge: true });
        return { esito: 'ok' };
    });
    if (r.esito === 'ok') {
        return { stato: 200, corpo: { ok: true, token: firmaNumero(ev.chiave, numero, ora), numero: mascherato(numero) } };
    }
    const msg = {
        nessuno: 'Per questo numero non c\'è un codice da verificare: chiedi il codice SMS.',
        scaduto: 'Il codice è scaduto: chiedine uno nuovo.',
        troppi: 'Troppi tentativi con questo codice: chiedine uno nuovo.',
        sbagliato: 'Il codice non è corretto' + (r.restano > 0 ? ' (tentativi rimasti: ' + r.restano + ').' : ': chiedine uno nuovo.')
    }[r.esito];
    return { stato: r.esito === 'troppi' ? 429 : 400, corpo: { ok: false, esito: r.esito, msg: msg } };
}

/* --- i posti di un codice invito ---
   Quante iscrizioni ANCORA ATTIVE sono state fatte con quel codice. */
async function usiCodice(db, codice, tx) {
    const leggi = r => (tx ? tx.get(r) : r.get());
    const rif = db.collection('codiciInvito').doc(CODICI.normalizza(codice));
    const s = await leggi(rif);
    const usate = s.exists && Array.isArray((s.data() || {}).iscrizioniUsate) ? s.data().iscrizioniUsate : [];
    const attive = [];
    for (const id of usate) {
        const x = await leggi(db.collection('iscrizioni').doc(String(id)));
        if (x.exists && attiva(x.data())) attive.push(String(id));
    }
    return { rif: rif, attive: attive };
}

/* ---------- la scrittura dell'iscrizione ----------
   Tutto in una transazione: i controlli di unicita', i posti del codice e
   la scheda. O passa tutto o non si scrive niente.
   dati: { ev, idDoc, scheda, email, numero, codice }
   Restituisce { ok: true } oppure { ok: false, campo, msg }. */
async function registra(db, dati) {
    const ev = dati.ev;
    const email = String(dati.email || '');
    const numero = String(dati.numero || '');
    if (await giaIscrittoAMano(db, ev, email)) return { ok: false, campo: 'email', msg: MSG.email };
    return db.runTransaction(async tx => {
        // prima tutte le letture, poi tutte le scritture (lo vuole Firestore)
        const gia = await giaIscritto(db, ev, email, numero, tx);
        if (gia.campo) return { ok: false, campo: gia.campo, msg: MSG[gia.campo] };
        let posti = null;
        if (dati.codice) {
            posti = await usiCodice(db, dati.codice, tx);
            if (posti.attive.length >= MAX_PER_CODICE) return { ok: false, campo: 'codice', msg: MSG.codice };
        }
        const quando = Date.now();
        if (email) tx.set(rifUnico(db, ev.chiave, 'email', email), { evento: ev.chiave, campo: 'email', iscrizione: dati.idDoc, quando: quando });
        if (numero) tx.set(rifUnico(db, ev.chiave, 'tel', numero), { evento: ev.chiave, campo: 'telefono', iscrizione: dati.idDoc, quando: quando });
        if (posti) tx.set(posti.rif, { iscrizioniUsate: posti.attive.concat([dati.idDoc]) }, { merge: true });
        tx.set(db.collection('iscrizioni').doc(dati.idDoc), dati.scheda, { merge: true });
        return { ok: true };
    });
}

module.exports = {
    EVENTI, eventoDi, cellulare, leggibile, mascherato,
    invia, verifica, registra, usiCodice, firmaNumero, firmaNumeroValida,
    MAX_PER_CODICE, MSG
};
