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
   posto, e se chi ha annullato ci ripensa lo riprende solo se e'
   ancora libero (riattiva, qui sotto). Una scheda che l'area riservata
   sposta su un documento nuovo (Modifica di email o data) si porta
   dietro il suo posto (trasloca, in fondo).

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

   IL SECONDO SMS: "CONFERMA LA TUA EMAIL". Subito dopo la mail con il
   pulsante, al numero appena verificato parte un SMS che dice dove
   cercarla (anche Spam e Posta indesiderata) e, se non arriva, dove
   chiederne un'altra: il modulo delle domande, /contatti/?t=mail.
   Chi si iscrive guarda il telefono in quel momento, e una mail finita
   fra la posta indesiderata non la cerca nessuno. Se la mail non e'
   partita l'SMS lo dice, e dice che si riprova da soli (il giro
   automatico di api/conferme-email.js). Lo stesso giro, dopo un giorno
   senza conferma, manda UN promemoria. I testi stanno dentro due SMS
   (306 caratteri dell'alfabeto GSM-7, niente virgolette tipografiche ne'
   lettere maiuscole accentate) e non hanno MAI la riga "@dominio
   #codice": il telefono proporrebbe di incollare un codice che non c'e'.
   Contano nel tetto giornaliero degli SMS: a tetto raggiunto non partono,
   e l'iscrizione va avanti lo stesso.
   ============================================================ */

const crypto = require('crypto');
const NL = require('./newsletter');
const CODICI = require('./codici-invito');
/* "In attesa di conferma" e' una regola sola (lib/conferma-email.js), e
   serve qui per il messaggio a chi si riscrive. Si carica quando serve:
   conferma-email si porta dietro la posta e i PDF, e questo modulo lo
   caricano anche le prove e i lavori che non spediscono niente. */
function moduloConferma() { return require('./conferma-email'); }

/* Gli eventi con le iscrizioni verificate. `se` riconosce la pagina del
   modulo ("Milano 26 Febbraio 2027 - Iscrizione") e anche il titolo corto
   delle iscrizioni inserite a mano dall'area riservata. `chiave` e' il nome
   stabile con cui l'evento entra nei documenti di unicita', ed e' lo stesso
   identificativo dell'evento nella sezione Eventi dell'area riservata:
   quello dei documenti delle presenze ("evento~idIscritto"). `fine` e' la
   fine dell'evento (ora di Milano): dopo, il giro automatico delle mail di
   conferma (lib/giro-conferme.js) non riprova e non ricorda piu' niente. */
const EVENTI = [
    { chiave: 'milano-2027-02-26', se: /^milano 26 febbraio 2027/i, nome: 'Milano', fine: Date.parse('2027-02-26T18:00:00+01:00') }
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
   vorrebbe dire indovinare. Restituisce `campo` ('email', 'telefono' oppure
   '') e, quando c'e', la scheda trovata (`id`, `scheda`). */
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
        // la scheda trovata serve al messaggio: confermata o ancora in attesa
        if (s.exists && attiva(s.data())) return { campo: controlli[k][0], blocchi: blocchi, id: id, scheda: s.data() || {} };
    }
    return { campo: '', blocchi: blocchi };
}
/* IL MESSAGGIO A CHI SI RISCRIVE. Un'iscrizione gia' fatta e confermata ha
   la mail con il collegamento personale: il messaggio di sempre. Una ancora
   IN ATTESA DI CONFERMA invece no, o quasi: e' proprio chi non ha trovato la
   mail che torna sul modulo e si riscrive, e "usa il collegamento nella mail"
   era un vicolo cieco. Qui gli si dice che l'iscrizione c'e', che manca la
   conferma, dove cercare la mail e dove chiederne un'altra. Mai l'indirizzo
   dell'iscrizione trovata: chi scrive un numero non deve leggere l'email di
   un altro. `rimandata`: la mail e' appena ripartita (iscrizione-nuova.js). */
const LINK_MODULO_MAIL = 'https://nextgenerationbusiness.it/contatti/?t=mail';
function msgInAttesa(campo, rimandata) {
    const chi = campo === 'telefono'
        ? 'Con questo numero di cellulare risulta già un\'iscrizione a questo evento, ma il suo indirizzo email non è ancora confermato'
        : 'Con questo indirizzo email risulta già un\'iscrizione a questo evento, ma l\'indirizzo non è ancora confermato';
    return chi + (rimandata ? ': ti abbiamo appena rimandato la mail di conferma. ' : '. ')
        + 'Cerca la mail «Richiesta di conferma» anche nelle cartelle Spam, Posta indesiderata e Promozioni, e premi «Conferma il tuo indirizzo email». '
        + (campo === 'telefono' ? 'Se l\'indirizzo era sbagliato o la mail non arriva' : 'Se non la trovi')
        + ', scrivici dal modulo: ' + LINK_MODULO_MAIL;
}
// la scheda trovata aspetta ancora la conferma dell'email?
function inAttesa(gia) {
    return !!(gia && gia.scheda && moduloConferma().inAttesaDiConferma(gia.scheda));
}
// il messaggio giusto per quello che ha trovato giaIscritto (o giaIscrittoAMano)
function msgGia(gia) {
    return inAttesa(gia) ? msgInAttesa(gia.campo, false) : MSG[gia.campo];
}
/* Il no della registrazione. `inAttesa`: la scheda trovata aspetta ancora
   la conferma, e iscrizione-nuova.js le rimanda la mail (con il suo freno)
   dicendolo nel messaggio: chi si riscrive e' quasi sempre chi non l'ha
   trovata. */
function rifiuto(gia) {
    return { ok: false, campo: gia.campo, msg: msgGia(gia), inAttesa: inAttesa(gia) ? String(gia.id || '') : '' };
}
/* Per l'email anche le schede SENZA documento di unicita' (inserite a mano,
   o di prima): la prima attiva per questo evento, { campo, id, scheda },
   oppure null. */
async function giaIscrittoAMano(db, ev, email) {
    if (!email) return null;
    try {
        const snap = await db.collection('iscrizioni').where('email', '==', email).limit(50).get();
        const d = snap.docs.find(s => {
            const x = s.data() || {};
            return ev.se.test(String(x.pagina || '').trim()) && attiva(x);
        });
        return d ? { campo: 'email', id: d.id, scheda: d.data() || {} } : null;
    } catch (_) { return null; }   // la transazione resta il controllo vero
}

const MSG = {
    numero: 'Serve un numero di cellulare italiano (comincia con 3, per esempio 333 123 4567): il codice di verifica arriva per SMS.',
    email: 'Con questo indirizzo email risulta già un\'iscrizione a questo evento (anche se inserita dalla nostra segreteria). Per modificarla usa il collegamento nella mail di conferma, oppure scrivici a info@nextgenerationbusiness.it.',
    telefono: 'Questo numero di cellulare risulta già usato per un\'iscrizione a questo evento: ogni iscrizione richiede un numero suo. Se è un errore scrivici a info@nextgenerationbusiness.it.',
    codice: 'Questo codice invito è già stato usato per due iscrizioni, il massimo previsto. Puoi iscriverti lasciando vuoto il campo del codice, oppure scriverci a info@nextgenerationbusiness.it.',
    riattiva: 'Non possiamo riattivare questa iscrizione: nel frattempo il codice invito con cui era stata fatta è stato usato per altre due iscrizioni, il massimo previsto. Puoi iscriverti di nuovo dal modulo lasciando vuoto il campo del codice, oppure scriverci a info@nextgenerationbusiness.it.',
    nonVerificato: 'Il numero di cellulare non risulta verificato, o la verifica è scaduta. Chiedi il codice SMS e scrivilo nel modulo prima di inviare.',
    servizio: 'In questo momento non riusciamo a mandare l\'SMS. Riprova fra qualche minuto, oppure scrivici a info@nextgenerationbusiness.it.'
};

/* --- la spedizione dell'SMS (Brevo) ---
   Il numero va senza il +. Il mittente e' alfanumerico (11 caratteri al
   massimo) e in Italia va registrato presso l'operatore: vedi README. */
function mittenteSms() {
    return String(process.env.SMS_MITTENTE || 'Revilaw').replace(/[^0-9A-Za-z ]/g, '').slice(0, 11) || 'Revilaw';
}
/* `opz`: { tag, etichetta, attesa }. Il tag e' quello con cui l'SMS si
   ritrova fra i Log SMS di Brevo, l'etichetta quella delle righe nei log di
   Vercel, l'attesa il tempo massimo per la risposta di Brevo. Senza, sono
   quelli dell'SMS con il codice, com'erano. */
async function spedisciSms(numero, contenuto, opz) {
    opz = opz || {};
    const etichetta = String(opz.etichetta || 'SMS di verifica');
    if (!NL.brevoAttivo()) return { ok: false, errore: 'BREVO_API_KEY mancante' };
    try {
        const r = await NL.chiamataBrevo('/transactionalSMS/sms', {
            metodo: 'POST',
            attesa: opz.attesa,
            corpo: {
                type: 'transactional', sender: mittenteSms(),
                recipient: String(numero).replace(/^\+/, ''),
                content: contenuto, tag: String(opz.tag || 'verifica-iscrizione'), unicodeEnabled: false
            }
        });
        /* Brevo risponde "accettato" anche quando poi l'operatore scarta il
           messaggio (mittente non approvato, numero spento): nei log di Vercel
           resta il riferimento da cercare nei Log SMS di Brevo, e i crediti
           rimasti. Il numero non si scrive. */
        if (r.ok) {
            const d = r.dati || {};
            console.log(etichetta + ' accettato da Brevo: messageId', d.messageId || '?',
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

/* --- il secondo SMS: "conferma la tua email" ---
   Tre testi, tutti nell'alfabeto GSM-7 (quello degli SMS normali: con un
   carattere fuori, Brevo passerebbe all'Unicode e i caratteri per SMS
   scenderebbero da 153 a 67) e dentro due SMS. Ognuno nomina l'indirizzo a
   cui e' partita la mail - chi lo ha scritto male se ne accorge leggendo -
   quando ci sta; altrimenti c'e' la versione senza. */
const SMS_MAX_CARATTERI = 306;          // due SMS concatenati: 2 x 153
// i caratteri sicuri: quelli che ogni telefono mostra come sono, uno per uno
const GSM7_SICURI = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyzàèéìòù\n';
// questi stanno nell'estensione dell'alfabeto: valgono due caratteri ciascuno
const GSM7_ESTESI = '^{}\\[~]|€';
/* Quanti caratteri vale un testo in un SMS, oppure -1 se ha un carattere
   fuori dall'alfabeto (una lettera maiuscola accentata, le virgolette
   tipografiche, i puntini di sospensione...). */
function caratteriSms(s) {
    let n = 0;
    for (const c of String(s == null ? '' : s)) {
        if (GSM7_SICURI.indexOf(c) >= 0) n += 1;
        else if (GSM7_ESTESI.indexOf(c) >= 0) n += 2;
        else return -1;
    }
    return n;
}
function staInDueSms(s) {
    const n = caratteriSms(s);
    return n >= 0 && n <= SMS_MAX_CARATTERI;
}
/* dove scriverci se la mail non arriva: il modulo contatti del sito, gia'
   aperto sulla richiesta "mail di conferma non ricevuta". Corto apposta:
   ogni carattere in piu' qui ne toglie uno all'indirizzo email, che con i
   testi di sotto ci sta fino a 38 caratteri (36 in quello della mail non
   partita); piu' lungo, l'SMS esce nella versione senza. */
const SMS_MODULO = 'Scrivici dal modulo contatti: ' + LINK_MODULO_MAIL;
const TESTI_CONFERMA = {
    // la mail e' partita: dov'e' il pulsante e dove cercarla
    inviata: a => 'Next Generation Business: per confermare l\'iscrizione premi "Conferma il tuo indirizzo email" nella mail '
        + (a ? 'inviata a ' + a : 'che ti abbiamo inviato')
        + '. Se non la trovi guarda in Spam/Posta indesiderata. Non l\'hai ricevuta? ' + SMS_MODULO,
    // la mail non e' partita: l'iscrizione c'e', si riprova da soli
    'non-inviata': a => 'Next Generation Business: la tua iscrizione è registrata ma la mail di conferma non è ancora partita'
        + (a ? ' verso ' + a : '') + ': riproviamo in automatico. '
        + 'Guarda anche in Spam/Posta indesiderata. Se non arriva ' + SMS_MODULO.charAt(0).toLowerCase() + SMS_MODULO.slice(1),
    // il promemoria del giro automatico, dopo un giorno senza conferma
    promemoria: a => 'Next Generation Business: la tua iscrizione non è ancora confermata. Premi "Conferma il tuo indirizzo email" nella mail '
        + (a ? 'inviata a ' + a : 'che ti abbiamo inviato')
        + ' (guarda anche in Spam/Posta indesiderata). Non la trovi? ' + SMS_MODULO
};
function testoSmsConferma(tipo, email) {
    const t = TESTI_CONFERMA[tipo] || TESTI_CONFERMA.inviata;
    const conIndirizzo = t(String(email || '').trim().toLowerCase());
    return email && staInDueSms(conIndirizzo) ? conIndirizzo : t('');
}

/* L'SMS dopo la mail di conferma. dati: { idDoc, numero, email, tipo }, con
   `tipo` 'inviata' (la mail e' partita), 'non-inviata' (non e' partita) o
   'promemoria' (il giro automatico, dopo un giorno). Mai un'eccezione: e'
   un avviso in piu', e chi lo chiama ha gia' fatto il lavoro vero. Sulla
   scheda resta `smsConferma: { quando, ok, errore, id, tipo }`, che l'area
   riservata mostra accanto al numero. Senza Brevo non parte niente e non si
   scrive niente: non c'e' un servizio SMS da cui aspettarselo. */
async function smsConfermaEmail(db, dati) {
    dati = dati || {};
    const numero = cellulare(dati.numero);
    const tipo = TESTI_CONFERMA[dati.tipo] ? dati.tipo : 'inviata';
    if (!numero) return { ok: false, saltato: 'numero' };
    if (!NL.brevoAttivo()) return { ok: false, saltato: 'brevo' };
    let esito;
    try {
        if (!await prenotaSmsDelGiorno(db)) {
            console.error('SMS di conferma email: raggiunto il tetto giornaliero (SMS_MAX_GIORNO), non parte.');
            esito = { ok: false, errore: 'tetto giornaliero degli SMS raggiunto', saltato: 'tetto' };
        } else {
            esito = await spedisciSms(numero, testoSmsConferma(tipo, dati.email),
                { tag: 'conferma-email', etichetta: 'SMS di conferma email', attesa: 8000 });
        }
    } catch (e) {
        esito = { ok: false, errore: String((e && e.message) || e).slice(0, 200) };
    }
    if (!esito.ok) console.error('SMS di conferma email non inviato:', String(esito.errore || '').replace(/\+?\d{9,}/g, '<numero>'));
    if (dati.idDoc) {
        try {
            const rif = db.collection('iscrizioni').doc(String(dati.idDoc));
            const patch = {
                smsConferma: {
                    quando: Date.now(), ok: esito.ok === true, tipo: tipo, id: esito.id == null ? null : String(esito.id),
                    errore: testo(String(esito.errore || '').replace(/\+?\d{9,}/g, '<numero>'), 200)
                }
            };
            // il giro automatico non fa rinascere una scheda cancellata nel frattempo (lib/conferma-email.js)
            if (dati.soloSeEsiste) await rif.update(patch);
            else await rif.set(patch, { merge: true });
        } catch (e) { /* informazione, non condizione */ }
    }
    return esito;
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
    // qui la mail non si rimanda: il numero non e' ancora verificato
    if (gia.campo) return { stato: 409, corpo: { ok: false, campo: gia.campo, msg: msgGia(gia) } };
    const aMano = NL.EMAIL_RE.test(email) ? await giaIscrittoAMano(db, ev, email) : null;
    if (aMano) return { stato: 409, corpo: { ok: false, campo: 'email', msg: msgGia(aMano) } };

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
    return { rif: rif, attive: attive, esiste: s.exists };
}

/* ---------- la scrittura dell'iscrizione ----------
   Tutto in una transazione: i controlli di unicita', i posti del codice e
   la scheda. O passa tutto o non si scrive niente.
   dati: { ev, idDoc, scheda, email, numero, codice }
   Restituisce { ok: true } oppure { ok: false, campo, msg, inAttesa }, con
   `inAttesa` la scheda gia' iscritta che aspetta ancora la conferma
   dell'email (vedi rifiuto). */
async function registra(db, dati) {
    const ev = dati.ev;
    const email = String(dati.email || '');
    const numero = String(dati.numero || '');
    const aMano = await giaIscrittoAMano(db, ev, email);
    if (aMano) return rifiuto(aMano);
    return db.runTransaction(async tx => {
        // prima tutte le letture, poi tutte le scritture (lo vuole Firestore)
        const gia = await giaIscritto(db, ev, email, numero, tx);
        if (gia.campo) return rifiuto(gia);
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

/* ---------- la riattivazione dal collegamento personale ----------
   Chi ha annullato puo' ripensarci: ricompilando i propri dati da
   /completa_iscrizione/ la scheda torna attiva. Con un codice invito
   quella era una porta sul retro: A e B si iscrivono, A annulla e il
   posto passa a C, poi A ricompila - e il codice si ritrova con TRE
   iscrizioni attive, senza che nessuno l'abbia contato. Qui la
   riattivazione passa dallo stesso conto della registrazione, nella
   stessa transazione che riscrive la scheda: se il codice ha gia' due
   iscrizioni attive (questa esclusa) non si scrive niente.
   Email e numero non si ricontrollano qui: restano le regole di prima.
   dati: { idDoc, codice, patch }
   Restituisce { ok: true } oppure { ok: false, campo: 'codice', msg }. */
async function riattiva(db, dati) {
    const rif = db.collection('iscrizioni').doc(String(dati.idDoc));
    return db.runTransaction(async tx => {
        const posti = await usiCodice(db, dati.codice, tx);
        // la scheda stessa non conta: un doppio invio del modulo la troverebbe gia' attiva
        const altre = posti.attive.filter(id => id !== String(dati.idDoc));
        if (altre.length >= MAX_PER_CODICE) return { ok: false, campo: 'codice', msg: MSG.riattiva };
        // un codice che non c'e' piu' non si ricrea: un documento senza evento ne' pagina varrebbe ovunque
        if (posti.esiste) tx.set(posti.rif, { iscrizioniUsate: altre.concat([String(dati.idDoc)]) }, { merge: true });
        tx.set(rif, dati.patch, { merge: true });
        return { ok: true };
    });
}

/* ---------- il trasloco di una scheda (Modifica dall'area riservata) ----------
   Il nome del documento nasce da email e data: correggendo l'una o
   l'altra l'amministratore sposta la scheda su un documento nuovo
   (api/presenze.js, 'modifica'). Ma i conti di questo modulo puntano alla
   scheda per NOME: il codice invito (`iscrizioniUsate`) e i documenti di
   unicita'. Lasciati sul nome vecchio, che sparisce, il codice non
   conterebbe piu' questa iscrizione - e ne lascerebbe passare una terza -
   e il cellulare verificato risulterebbe libero per un'altra persona.
   Qui il nome vecchio diventa quello nuovo, in una transazione, e solo
   dove c'era: un codice o un documento che puntano altrove non si
   toccano, e un codice che non c'e' piu' non si ricrea. Rifarlo non cambia
   niente: e' quello che serve se la modifica va ripetuta.
   dati: { da, a, codice, ev, email, numero }. `email` solo se e' rimasta
   la stessa: un indirizzo nuovo non eredita il posto del vecchio, e il
   vecchio cosi' torna libero. `numero` e' il cellulare verificato
   (telefonoNumero). Restituisce { codice: true/false, unici: N }. */
async function trasloca(db, dati) {
    const da = String(dati.da || ''), a = String(dati.a || '');
    if (!da || !a || da === a) return { codice: false, unici: 0 };
    const rifCodice = dati.codice ? db.collection('codiciInvito').doc(CODICI.normalizza(dati.codice)) : null;
    const unici = [];
    if (dati.ev && dati.email) unici.push(rifUnico(db, dati.ev.chiave, 'email', dati.email));
    if (dati.ev && dati.numero) unici.push(rifUnico(db, dati.ev.chiave, 'tel', dati.numero));
    if (!rifCodice && !unici.length) return { codice: false, unici: 0 };
    return db.runTransaction(async tx => {
        // prima tutte le letture, poi tutte le scritture (lo vuole Firestore)
        const sCodice = rifCodice ? await tx.get(rifCodice) : null;
        const sUnici = [];
        for (const r of unici) sUnici.push(await tx.get(r));
        const esito = { codice: false, unici: 0 };
        const usate = (sCodice && sCodice.exists && Array.isArray((sCodice.data() || {}).iscrizioniUsate))
            ? sCodice.data().iscrizioniUsate.map(String) : [];
        if (usate.indexOf(da) >= 0) {
            const nuove = [];
            usate.forEach(id => { const x = id === da ? a : id; if (nuove.indexOf(x) < 0) nuove.push(x); });
            tx.set(rifCodice, { iscrizioniUsate: nuove }, { merge: true });
            esito.codice = true;
        }
        sUnici.forEach((s, k) => {
            if (!s.exists || String((s.data() || {}).iscrizione || '') !== da) return;
            tx.set(unici[k], { iscrizione: a }, { merge: true });
            esito.unici++;
        });
        return esito;
    });
}

module.exports = {
    EVENTI, eventoDi, cellulare, leggibile, mascherato,
    invia, verifica, registra, riattiva, trasloca, usiCodice, firmaNumero, firmaNumeroValida,
    smsConfermaEmail, testoSmsConferma, caratteriSms, msgInAttesa, LINK_MODULO_MAIL, SMS_MAX_CARATTERI,
    MAX_PER_CODICE, MSG
};
