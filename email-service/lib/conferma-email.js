/* ============================================================
   Conferma dell'indirizzo email di chi si iscrive
   ------------------------------------------------------------
   La mail di conferma dell'iscrizione porta in cima un pulsante
   "Conferma il tuo indirizzo email": apre /conferma_email/ con
   l'identificativo della scheda e una firma (lib/newsletter.js,
   contesto "conferma-email"), la pagina chiama qui, e sulla scheda
   resta scritto `emailConfermata: { quando, come }`. Nell'area
   riservata quel campo e' il baffetto verde accanto all'indirizzo.

   DUE MODI DI ESSERE CONFERMATI, e il baffetto e' lo stesso:
     come: 'mail'       la persona ha cliccato;
     come: 'pregresso'  iscritta prima che la mail avesse il pulsante.
                        Con quelle persone si e' gia' corrisposto: non
                        vanno disturbate con una richiesta di conferma,
                        e l'amministratore le segna d'ufficio, un
                        evento per volta (conferma-email-pregresso).
   Il suggerimento nell'elenco dice quale dei due.

   PERCHE' LA PAGINA CONFERMA CON UNA POST E NON APRENDOSI. Gli
   antispam aziendali (Safe Links di Outlook, i proxy di sicurezza)
   visitano ogni collegamento della mail prima che la persona lo veda,
   ma non eseguono JavaScript: se bastasse aprire l'indirizzo, ogni
   iscritto risulterebbe confermato da un robot. La conferma parte
   dallo script della pagina, che un robot non esegue.

   IDEMPOTENTE: la seconda apertura non sposta la data della prima, e
   il pregresso non tocca chi ha gia' il campo, in nessuno dei due
   modi. Cosi' l'ordine "pubblica, poi segna il pregresso" e' sicuro
   anche se qualcuno si iscrive nel mezzo.

   LA DIRETTA. Chi segue ONLINE riceve la password della diretta DOPO
   questa conferma, non all'iscrizione: alla prima conferma con il clic
   (mai con il pregresso, mai alla seconda apertura) si avvisa la
   diretta (lib/diretta-iscrizione.js, daConferma), che manda la password
   solo se sull'evento e' acceso l'interruttore delle iscrizioni dal
   modulo. Mai al posto del resto: dentro un try/catch, e su Vercel la
   risposta alla pagina non aspetta la diretta (waitUntil). Se l'avviso
   non arriva, lo ritrova la riconciliazione della diretta, che rilegge
   le schede confermate (emailConfermata.quando).

   LA MAIL CON IL PULSANTE PARTE DA UN POSTO SOLO (spedisciConferma):
   l'iscrizione dal sito, "Rimanda la mail di conferma" dell'area
   riservata, il pulsante "non e' arrivata? rimandala" della pagina
   (rimandaConferma), la domanda "non ho ricevuto la mail" dal modulo
   /contatti/ e il giro automatico (api/conferme-email.js). Ognuno lascia
   sulla scheda com'e' andata - `mailConferma: { quando, ok, errore, via,
   a }`, con `a` l'indirizzo a cui e' partita - e il conto dei tentativi
   (`invioConferma`). Cosi' un "mail non inviata" non resta indietro
   quando un invio dopo riesce, e il giro sa a chi deve ancora scrivere.
   Il server di posta ha tempi massimi stretti e un secondo tentativo,
   uno solo, se l'errore e' di quelli che passano (rete, tempo scaduto,
   un 4xx): una mail ferma non deve tenere ferma la risposta al modulo
   fino al limite della funzione, che chiude tutto senza lasciare
   traccia.

   LA BANDIERA `confermaInAttesa`. Scritta a true sulle iscrizioni dal
   sito agli eventi che chiedono la conferma (lib/iscrizione-verificata.js),
   nella stessa transazione della scheda: e' cio' che il giro automatico
   cerca, invece di rileggere tutte le iscrizioni ogni dieci minuti. Si
   toglie quando l'indirizzo e' confermato (qui sotto, dal clic e dal
   pregresso), quando l'iscrizione si annulla, e dal giro stesso quando
   non ha piu' niente da fare.
   ============================================================ */

const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const NL = require('./newsletter');
const MNGB = require('./mail-ngb');
const INVITO = require('./pdf-invito');
// la giornata in agenda: Google Calendar, Outlook e il file .ics allegato
const CAL = require('./calendario');

/* LA SECONDA MAIL: l'invito. Dopo la conferma parte una mail con l'invito
   in PDF da esibire all'ingresso (per chi segue online, il promemoria che il
   collegamento arriva prima dell'evento). E' quello che rende "confermato"
   una cosa che si ha in mano: la registrazione non e' completa finche' non
   si clicca, e questa mail lo dice.
   I dati dell'evento stanno qui, per titolo del modulo: il servizio non ha
   un posto suo dove leggerli, e un invito senza giorno e indirizzo non e'
   un invito. Un evento che non e' in elenco riceve la mail con il solo
   nome. */
const DETTAGLI_EVENTO = [
    { se: /napoli/i, quando: 'Venerdì 2 ottobre 2026', orario: 'Registrazione dalle 9.00, lavori dalle 9.30 alle 17.30', luogo: 'Hotel Eurostars Excelsior', indirizzo: 'Via Partenope 48, Napoli' },
    { se: /milano/i, quando: 'Venerdì 26 febbraio 2027', orario: 'Dalle 8.30 alle 18.00', luogo: 'Excelsior Hotel Gallia', indirizzo: 'Piazza Duca d\'Aosta 9, 20124 Milano',
      tema: 'Merito creditizio, crescita e competitività delle imprese',
      programma: 'Convegno, networking lunch e incontri B2B one-to-one',
      // inizio e fine con il fuso: servono all'evento da aggiungere in agenda
      inizio: '2027-02-26T08:30:00+01:00', fine: '2027-02-26T18:00:00+01:00',
      url: 'https://nextgenerationbusiness.it/milano_febbraio_2027/' }
];
function dettagliEvento(pagina) {
    const d = DETTAGLI_EVENTO.find(x => x.se.test(String(pagina || '')));
    return d ? {
        quando: d.quando, orario: d.orario, luogo: d.luogo, indirizzo: d.indirizzo, tema: d.tema, programma: d.programma,
        inizio: d.inizio, fine: d.fine, url: d.url
    } : {};
}
/* Il trasporto, con i TEMPI MASSIMI. Senza, nodemailer aspetta due minuti
   la connessione e dieci un server che non risponde: molto oltre il limite
   della funzione, che si chiude senza lasciare traccia sulla scheda. */
function trasporto() {
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 465,
        secure: (Number(process.env.SMTP_PORT) || 465) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 15000, dnsTimeout: 5000
    });
}
function mittente() {
    const ind = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
    const nome = (process.env.SMTP_FROM_NAME || 'Revilaw S.p.A.').replace(/[\r\n]/g, ' ').slice(0, 80);
    return '"' + nome + '" <' + ind + '>';
}
/* A chi arriva una risposta alla mail di conferma: il mittente e' noreply,
   e chi risponde "non riesco a confermare" deve trovare qualcuno. */
function rispondiA() {
    const v = String(process.env.CONFERMA_RISPONDI_A || '').trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? v : 'info@nextgenerationbusiness.it';
}
function adessoInItalia() {
    const f = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
    const p = {};
    f.formatToParts(new Date()).forEach(x => { p[x.type] = x.value; });
    return p.day + '/' + p.month + '/' + p.year + ' ' + p.hour + ':' + p.minute;
}
/* Compone e spedisce l'invito. Restituisce { ok, errore }: se non parte, la
   conferma dell'indirizzo resta valida e l'area riservata puo' rimandarla. */
async function spedisciInvito(idDoc, scheda) {
    const online = String(scheda.modalita || '').toLowerCase() === 'online';
    const evento = dettagliEvento(scheda.pagina);
    const dati = {
        nome: testo(scheda.nome, 120), cognome: testo(scheda.cognome, 120),
        azienda: testo(scheda.azienda, 200), ruolo: testo(scheda.ruolo, 200),
        pagina: scheda.pagina, evento: Object.assign({ titolo: MNGB.nomeEvento(scheda.pagina) }, evento),
        modalita: online ? 'online' : 'presenza'
    };
    /* La giornata in agenda, quando l'evento ha inizio e fine: i due
       collegamenti vanno nella mail, il file .ics in allegato (Apple Calendar
       e qualunque altra agenda lo apre con un tocco). */
    const perAgenda = {
        titolo: 'Next Generation Business - ' + dati.evento.titolo.split(' ')[0],
        luogo: evento.luogo, indirizzo: evento.indirizzo, inizio: evento.inizio, fine: evento.fine, url: evento.url,
        descrizione: [evento.tema, evento.programma].filter(Boolean).join('. ')
    };
    const agenda = CAL.valido(perAgenda) ? { google: CAL.linkGoogle(perAgenda), outlook: CAL.linkOutlook(perAgenda) } : null;
    const m = MNGB.invitoIngresso(Object.assign({}, dati, { agenda: agenda }), NL.linkCompleta(idDoc));
    const messaggio = { from: mittente(), to: String(scheda.email), subject: m.oggetto, text: m.testo, html: m.html, attachments: [] };
    if (!online) {
        const nomeCompleto = (dati.nome + ' ' + dati.cognome).trim();
        messaggio.attachments.push({
            filename: INVITO.nomeFileInvito(nomeCompleto),
            content: INVITO.pdfInvito({ nome: nomeCompleto, azienda: dati.azienda, ruolo: dati.ruolo, evento: dati.evento, online: false, emessoIl: adessoInItalia() }),
            contentType: 'application/pdf'
        });
    }
    if (agenda) {
        messaggio.attachments.push({
            filename: 'Next-Generation-Business-' + dati.evento.titolo.split(' ')[0] + '.ics',
            content: CAL.ics(perAgenda, 'ngb-' + String(idDoc).replace(/[^A-Za-z0-9-]/g, '').slice(0, 60)),
            contentType: 'text/calendar; charset=utf-8; method=PUBLISH'
        });
    }
    if (!messaggio.attachments.length) delete messaggio.attachments;
    try {
        await trasporto().sendMail(messaggio);
        return { ok: true };
    } catch (e) {
        const motivo = String((e && e.message) || e).slice(0, 200);
        console.error('Invito a', scheda.email, 'non inviato:', motivo);
        return { ok: false, errore: motivo };
    }
}

function testo(v, max) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 200);
}
function chiave(s) {
    return String(s == null ? '' : s).trim().toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

async function segnaCambiamento(db) {
    try {
        await db.collection('meta').doc('iscrizioni')
            .set({ rev: admin.firestore.FieldValue.increment(1), quando: Date.now() }, { merge: true });
    } catch (e) { /* la lettura ha comunque una scadenza a tempo */ }
}

/* --- il freno, per scheda ---
   Non per indirizzo IP: dieci persone dello stesso ufficio devono poter
   confermare nello stesso minuto. Per scheda, perche' l'unico abuso
   possibile e' martellare lo stesso collegamento. */
const RL_MS = 10 * 60 * 1000;
const RL_MAX = 20;
const tentativi = new Map();
function troppi(idDoc) {
    const ora = Date.now();
    const elenco = (tentativi.get(idDoc) || []).filter(t => ora - t < RL_MS);
    if (elenco.length >= RL_MAX) { tentativi.set(idDoc, elenco); return true; }
    elenco.push(ora);
    tentativi.set(idDoc, elenco);
    if (tentativi.size > 500) {
        for (const [k, v] of tentativi) {
            if (!v.length || ora - v[v.length - 1] > RL_MS) tentativi.delete(k);
        }
    }
    return false;
}

/* ---------- azione "conferma-email" (pubblica, dalla pagina) ----------
   opz.ip: l'indirizzo di chi clicca (solo per i limiti del modulo nella
   diretta). */
async function conferma(db, body, opz) {
    const idDoc = testo((body || {}).d, 400);
    const token = testo((body || {}).t, 80);
    if (!idDoc || !token || !NL.firmaConfermaEmailValida(idDoc, token)) {
        return { stato: 403, corpo: { ok: false, msg: 'Collegamento non valido.' } };
    }
    if (troppi(idDoc)) return { stato: 429, corpo: { ok: false, msg: 'Troppi tentativi ravvicinati: riprova fra qualche minuto.' } };

    const rif = db.collection('iscrizioni').doc(idDoc);
    const snap = await rif.get();
    if (!snap.exists) return { stato: 404, corpo: { ok: false, msg: 'Iscrizione non trovata.' } };
    const scheda = snap.data() || {};
    /* Una scheda-partecipante senza un indirizzo suo non ha niente da
       confermare: l'indirizzo e' dell'intestatario, e lo conferma lui
       dalla sua mail. */
    if (!scheda.email) return { stato: 400, corpo: { ok: false, msg: 'Questa iscrizione non ha un indirizzo email da confermare.' } };

    const nome = testo(scheda.nome, 120);
    const evento = MNGB.nomeEvento(scheda.pagina);
    const prima = scheda.emailConfermata;
    if (prima && typeof prima === 'object' && prima.quando) {
        return { stato: 200, corpo: { ok: true, gia: true, quando: prima.quando, nome: nome, evento: evento } };
    }
    const quando = Date.now();
    // confermata: il giro automatico non ha piu' niente da mandarle
    await rif.set({ emailConfermata: { quando: quando, come: 'mail' }, confermaInAttesa: admin.firestore.FieldValue.delete() }, { merge: true });
    await segnaCambiamento(db);
    const online = String(scheda.modalita || '').toLowerCase() === 'online';
    // la password della diretta, adesso che l'indirizzo e' confermato (vedi LA DIRETTA)
    if (online && !scheda.annullato) {
        try {
            await require('./diretta-iscrizione').daConferma({
                email: String(scheda.email), nome: String(scheda.nome || ''), cognome: String(scheda.cognome || ''),
                azienda: String(scheda.azienda || ''), pagina: String(scheda.pagina || ''),
                ricevutoMs: scheda.ricevuto && typeof scheda.ricevuto.toMillis === 'function' ? scheda.ricevuto.toMillis() : null,
                ip: String((opz && opz.ip) || '')
            });
        } catch (e) {
            console.error('Diretta: conferma dell\'indirizzo non passata alla diretta:', String((e && e.message) || e).replace(/[^\s/@'"]+@[^\s/'"]+/g, '<email>').slice(0, 200));
        }
    }
    // la seconda mail, con l'invito: parte una volta, alla prima conferma
    const invito = await spedisciInvito(idDoc, scheda);
    try {
        await rif.set({ mailInvito: { quando: Date.now(), ok: invito.ok === true, errore: testo(invito.errore, 200) } }, { merge: true });
    } catch (e) { /* informazione, non condizione */ }
    return { stato: 200, corpo: { ok: true, gia: false, quando: quando, nome: nome, evento: evento, invito: invito.ok === true, online: online } };
}

/* ---------- azione "conferma-email-pregresso" (area riservata, amministratore) ----------
   Tutte le schede dell'evento senza il campo, a lotti: `filtro` e' la parola
   con cui l'area riservata riconosce l'evento nel titolo del modulo
   ("napoli"), cosi' si prendono anche le schede inserite a mano, che hanno
   il titolo corto. `da` e' chi lancia. */
async function pregresso(db, opz) {
    const filtro = chiave((opz || {}).filtro);
    if (!filtro) return { stato: 400, corpo: { ok: false, msg: 'Evento mancante.' } };
    const snap = await db.collection('iscrizioni').get();
    const quando = Date.now();
    const patch = {
        emailConfermata: { quando: quando, come: 'pregresso', da: testo((opz || {}).da, 200) },
        // confermate d'ufficio: il giro automatico non le cerca piu'
        confermaInAttesa: admin.firestore.FieldValue.delete()
    };
    let batch = db.batch(), nel = 0, segnate = 0, giaFatte = 0;
    const docs = [];
    snap.forEach(d => docs.push(d));
    for (const d of docs) {
        const v = d.data() || {};
        if (chiave(v.pagina).indexOf(filtro) < 0) continue;
        if (v.emailConfermata && typeof v.emailConfermata === 'object' && v.emailConfermata.quando) { giaFatte++; continue; }
        batch.set(d.ref, patch, { merge: true });
        nel++; segnate++;
        if (nel >= 400) { await batch.commit(); batch = db.batch(); nel = 0; }
    }
    if (nel) await batch.commit();
    if (segnate) await segnaCambiamento(db);
    return { stato: 200, corpo: { ok: true, segnate: segnate, giaConfermate: giaFatte } };
}

/* ---------- la mail di conferma, rispedita dall'area riservata ----------
   Stessa mail dell'iscrizione dal sito, stesso collegamento firmato: la
   compone il servizio (l'endpoint dell'area riservata riceve HTML pronto
   per le altre mail, ma questa ha un pulsante che dipende da una firma che
   solo il servizio conosce). Restituisce il messaggio da spedire, o null. */
function mailDiConferma(idDoc, scheda) {
    if (!scheda || !scheda.email) return null;
    const m = MNGB.confermaSito({
        nome: scheda.nome, cognome: scheda.cognome, email: scheda.email, azienda: scheda.azienda,
        pagina: scheda.pagina, data: scheda.data, modalita: scheda.modalita || '',
        listaAttesa: scheda.listaAttesa === true
    }, NL.linkCompleta(idDoc), NL.linkConfermaEmail(idDoc));
    return { to: String(scheda.email), subject: m.oggetto, text: m.testo, html: m.html };
}

function confermata(scheda) {
    const c = scheda && scheda.emailConfermata;
    return !!(c && typeof c === 'object' && c.quando);
}

/* IN ATTESA DI CONFERMA: si e' iscritta dal sito, la mail con il pulsante
   e' partita, e non l'ha ancora premuto. Agli eventi dove l'iscrizione vale
   solo dopo la conferma (Milano 2027, quelli di lib/iscrizione-verificata.js)
   non e' ancora un posto: non ha ricevuto l'invito in PDF, non riceve i
   promemoria, e nel riepilogo serale sta fra quelli in attesa.
   Non lo e' mai chi non poteva ricevere la mail: le iscrizioni inserite a
   mano dall'area riservata (`inserito`), quelle arrivate da un altro
   portale o dal desk (`extra.Portale`) e quelle caricate con "Importa"
   (`importato` senza `mailConferma`: l'importazione non manda nessuna
   mail) sono gia' complete cosi'; e nemmeno chi non ha un indirizzo, che
   non avrebbe niente da confermare. Una scheda del sito toccata dopo da
   un'importazione (la colonna degli inviti B2B) ha `importato` ma anche
   la sua `mailConferma`: e' partita dal modulo, e resta in attesa.
   E non lo e' piu' chi e' venuto: `presenza` e' il documento delle
   presenze di quell'evento, quando chi chiama lo ha, e con lo stato
   "presente" la persona era in sala - le mail del giorno e il
   ringraziamento devono arrivarle. Solo "presente": "confermato" lo
   segna chi organizza prima dell'evento, e non dice niente
   dell'indirizzo.
   La regola deve restare la stessa dell'area riservata (app.js,
   inAttesaConfermaMail): altrimenti la sezione "In attesa di conferma
   mail" e chi riceve i promemoria direbbero due cose diverse.
   Chi la usa la applica SOLO agli eventi che chiedono la conferma: a
   Napoli una scheda senza conferma e' un iscritto come gli altri. */
function inAttesaDiConferma(scheda, presenza) {
    if (!scheda || scheda.annullato) return false;
    if (!String(scheda.email || '').trim()) return false;
    if (scheda.inserito) return false;
    if (scheda.extra && scheda.extra.Portale) return false;
    if (scheda.importato && !scheda.mailConferma) return false;
    if (presenza && String(presenza.stato || '') === 'presente') return false;
    return !confermata(scheda);
}

/* ============================================================
   La spedizione della mail con il pulsante, e la sua traccia
   ============================================================ */
const VIE = ['iscrizione', 'rimanda', 'automatico', 'promemoria', 'staff'];
const PAUSA_RIPROVA_MS = 1500;
/* Oltre questo tempo il secondo tentativo non si fa: la risposta al modulo
   (con l'SMS dopo) deve stare dentro il limite della funzione, e un server
   che ci ha gia' messo tanto a dire di no non e' un intoppo di un attimo. */
const RIPROVA_ENTRO_MS = 12000;
function indirizzoDi(scheda) { return String((scheda && scheda.email) || '').trim().toLowerCase(); }
/* Un errore che passa: la rete, un tempo scaduto, una connessione caduta, o
   un 4xx del server di posta ("riprova piu' tardi"). Un 5xx e' un no. */
function transitorio(e) {
    if (!e) return false;
    const rc = Number(e.responseCode);
    if (rc >= 400 && rc < 500) return true;
    return ['ETIMEDOUT', 'ECONNRESET', 'ECONNECTION', 'ESOCKET', 'EDNS', 'ECONNREFUSED', 'EPIPE']
        .indexOf(String(e.code || '')) >= 0;
}
function motivo(e) { return String((e && e.message) || e || 'errore del server di posta').slice(0, 200); }
const pausa = ms => new Promise(r => setTimeout(r, ms));

/* La traccia della mail per l'indirizzo che la scheda ha ADESSO. Una
   `mailConferma` partita per un altro indirizzo (l'amministratore lo ha
   corretto dopo) per quello nuovo non vale: e' come se non ci fosse. */
function mailPerIndirizzo(scheda) {
    const m = scheda && scheda.mailConferma;
    if (!m || typeof m !== 'object') return null;
    if (m.a && String(m.a).toLowerCase() !== indirizzoDi(scheda)) return null;
    return m;
}
function invioPerIndirizzo(scheda) {
    const i = scheda && scheda.invioConferma;
    return (i && typeof i === 'object' && String(i.a || '') === indirizzoDi(scheda)) ? i : null;
}
/* Quello che la pagina di Milano legge con "stato-iscrizione": 'inviata',
   'errore' (l'ultimo invio non e' partito: si riprova da soli) o
   'in-attesa' (nessun invio registrato per questo indirizzo). */
function statoMail(scheda) {
    const m = mailPerIndirizzo(scheda);
    if (!m) return 'in-attesa';
    return m.ok === true ? 'inviata' : 'errore';
}

/* Spedisce la mail di conferma di una scheda e scrive com'e' andata.
   opz: { via, bcc, attesa, riprova }. `via` dice chi l'ha fatta partire
   (VIE), `bcc` la copia nascosta a chi la rimanda dall'area riservata,
   `attesa` rimette la bandiera per il giro automatico (chi rimanda una mail
   a chi deve ancora confermare vuole anche il promemoria del giorno dopo),
   `riprova: false` toglie il secondo tentativo (al giro automatico non
   serve: riprova lui, con le sue pause, e il suo tempo e' contato).
   Restituisce { ok, errore, a } e non lancia mai: se la traccia non si
   scrive la mail e' gia' partita, o gia' fallita. */
async function spedisciConferma(db, idDoc, scheda, opz) {
    opz = opz || {};
    const via = VIE.indexOf(opz.via) >= 0 ? opz.via : 'iscrizione';
    const a = indirizzoDi(scheda);
    let m = null;
    try { m = mailDiConferma(idDoc, scheda); }
    catch (e) { console.error('Mail di conferma (' + via + ') non composta:', motivo(e)); return { ok: false, errore: 'mail non composta', a: a }; }
    if (!m || !a) return { ok: false, errore: 'indirizzo mancante', a: a };
    const messaggio = Object.assign({
        from: mittente(),
        replyTo: rispondiA(),
        // il tag con cui la si ritrova fra i log transazionali di Brevo
        headers: { 'X-Mailin-Tag': 'conferma-iscrizione' }
    }, m);
    if (via === 'promemoria') messaggio.subject = 'Promemoria: ' + m.subject;
    if (opz.bcc) messaggio.bcc = opz.bcc;
    const inizio = Date.now();
    let esito;
    try {
        await trasporto().sendMail(messaggio);
        esito = { ok: true };
    } catch (e) {
        if (opz.riprova !== false && transitorio(e) && Date.now() - inizio < RIPROVA_ENTRO_MS) {
            await pausa(PAUSA_RIPROVA_MS);
            try {
                await trasporto().sendMail(messaggio);
                esito = { ok: true };
            } catch (e2) { esito = { ok: false, errore: motivo(e2) }; }
        } else {
            esito = { ok: false, errore: motivo(e) };
        }
    }
    if (!esito.ok) console.error('Mail di conferma (' + via + ') non inviata:', esito.errore);
    const quando = Date.now();
    /* i conti di prima, per questo indirizzo; una scheda di prima del conto
       ha solo mailConferma, che vale un tentativo (fallito o no) */
    const mPrima = mailPerIndirizzo(scheda);
    const prima = invioPerIndirizzo(scheda) || (mPrima ? { tentativi: 1, falliti: mPrima.ok === true ? 0 : 1 } : {});
    const patch = {
        mailConferma: { quando: quando, ok: esito.ok === true, errore: testo(esito.errore, 200), via: via, a: a },
        invioConferma: {
            a: a, ultimo: quando,
            tentativi: (Number(prima.tentativi) || 0) + 1,
            // i fallimenti DI FILA: un invio riuscito li azzera (il giro li usa per le pause)
            falliti: esito.ok ? 0 : (Number(prima.falliti) || 0) + 1
        }
    };
    if (opz.attesa) patch.confermaInAttesa = true;
    try {
        await db.collection('iscrizioni').doc(String(idDoc)).set(patch, { merge: true });
    } catch (e) { /* informazione, non condizione */ }
    return { ok: esito.ok === true, errore: esito.errore || '', a: a };
}

/* --- "Non e' arrivata? Rimandala" ---
   Dalla pagina di Milano (azione "rimanda-conferma", firmata come
   "stato-iscrizione") e dalla domanda "non ho ricevuto la mail" del modulo
   /contatti/. Solo per chi deve ancora confermare, a un evento che chiede
   la conferma. Il freno sta sulla scheda, in una transazione: due minuti
   fra un invio e l'altro (qualunque invio: anche quello dell'iscrizione) e
   cinque rinvii nelle ventiquattr'ore. E' una mail a una persona: senza
   freno un pulsante premuto a ripetizione, o un modulo compilato da un
   altro con il suo indirizzo, gliene manderebbe una dietro l'altra.
   Restituisce { esito, ... }: 'inviata' (con `a`), 'errore', 'attesa' e
   'troppi' (con `attesa` in secondi), 'confermata', 'assente', 'fuori'. */
const RIMANDA_PAUSA_MS = 2 * 60 * 1000;
const RIMANDA_MAX_GIORNO = 5;
const GIORNO_MS = 24 * 60 * 60 * 1000;
async function rimandaConferma(db, idDoc, opz) {
    opz = opz || {};
    const rif = db.collection('iscrizioni').doc(String(idDoc));
    const ora = Date.now();
    const r = await db.runTransaction(async tx => {
        const s = await tx.get(rif);
        if (!s.exists) return { esito: 'assente' };
        const x = s.data() || {};
        if (confermata(x)) return { esito: 'confermata' };
        // gli eventi che chiedono la conferma: la regola sta in iscrizione-verificata
        if (!require('./iscrizione-verificata').eventoDi(x.pagina) || !inAttesaDiConferma(x)) return { esito: 'fuori' };
        // l'ultimo invio a questo indirizzo (le schede di prima hanno solo mailConferma)
        const inv = invioPerIndirizzo(x);
        const ultimo = inv ? Number(inv.ultimo) || 0 : Number((mailPerIndirizzo(x) || {}).quando) || 0;
        if (ultimo && ora - ultimo < RIMANDA_PAUSA_MS) {
            return { esito: 'attesa', attesa: Math.ceil((RIMANDA_PAUSA_MS - (ora - ultimo)) / 1000) };
        }
        const rr = x.rimandaConferma && typeof x.rimandaConferma === 'object' ? x.rimandaConferma : {};
        const invii = (Array.isArray(rr.invii) ? rr.invii : []).map(Number).filter(t => t && ora - t < GIORNO_MS);
        if (invii.length >= RIMANDA_MAX_GIORNO) {
            return { esito: 'troppi', attesa: Math.max(1, Math.ceil((Math.min.apply(null, invii) + GIORNO_MS - ora) / 1000)) };
        }
        invii.push(ora);
        tx.set(rif, { rimandaConferma: { invii: invii, ultimo: ora } }, { merge: true });
        return { esito: 'ok', scheda: x };
    });
    if (r.esito !== 'ok') return r;
    const e = await spedisciConferma(db, idDoc, r.scheda, { via: opz.via || 'rimanda', attesa: true });
    return { esito: e.ok ? 'inviata' : 'errore', a: e.a, errore: e.errore };
}

module.exports = {
    conferma, pregresso, mailDiConferma, spedisciInvito, dettagliEvento, confermata, inAttesaDiConferma, RL_MAX,
    spedisciConferma, rimandaConferma, statoMail, mailPerIndirizzo, invioPerIndirizzo, transitorio,
    RIMANDA_PAUSA_MS, RIMANDA_MAX_GIORNO
};
