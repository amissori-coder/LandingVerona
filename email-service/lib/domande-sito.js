/* ============================================================
   Le domande dal modulo del sito (/contatti/)
   ------------------------------------------------------------
   Una pagina sola per chi ha una domanda su uno dei temi del sito o
   su un evento: nome, cognome, email, l'argomento (e, per gli eventi,
   quale evento e perche'), il messaggio. Arriva qui con l'azione
   'domanda-sito' di api/iscrizione-nuova.js, come tutti i moduli
   aperti del sito (text/plain, freno per indirizzo IP).

   Come le richieste di contatto (lib/richieste-contatto.js), DUE mail:
     A NOI   la domanda, a info@nextgenerationbusiness.it (o agli
             indirizzi di DOMANDE_DESTINATARI), con "Rispondi" che
             scrive direttamente alla persona;
     A LORO  una ricevuta breve, che NON ripete il messaggio: chi
             scrive l'indirizzo di un altro e un testo qualsiasi non
             deve poter usare il nostro modulo per fargli arrivare
             quel testo con il nostro nome (e il nome si ripete solo
             se e' un nome). Dice anche di guardare fra la posta
             indesiderata, dove la risposta potrebbe finire.

   L'ORDINE CONTA: prima si scrive in archivio (collezione
   `domandeSito`), poi si spedisce. Se la posta non parte la domanda c'e'
   lo stesso, e la risposta al modulo e' "ok": il lavoro e' fatto, e chi
   ha scritto non puo' farci niente.

   "NON HO RICEVUTO LA MAIL DI CONFERMA" (motivo 'mail-non-ricevuta') e'
   la ragione per cui la pagina e' nata, e ha due cose in piu':
     - nella mail A NOI, e SOLO li', cosa risulta delle iscrizioni con
       quell'indirizzo: quale evento, quando, se l'indirizzo e'
       confermato, se la mail e' partita o con che errore, l'SMS,
       l'annullamento. Chi risponde sa subito se e' un indirizzo
       sbagliato, una mail mai partita o una finita nello spam;
     - se c'e' un'iscrizione IN ATTESA DI CONFERMA a un evento che la
       chiede (Milano 2027), la mail le riparte subito (stesso freno del
       pulsante "rimandala" della pagina: due minuti, cinque al giorno),
       e nella mail a noi c'e' scritto.
   La risposta al modulo e la ricevuta non dicono MAI se l'indirizzo e'
   iscritto: la ricevuta dice "se risulta un'iscrizione in attesa... te
   l'abbiamo rimandata", a tutti uguale.

   I FRENI di un modulo aperto, dal primo all'ultimo:
     - un campo nascosto (`sito`) che una persona non vede e un robot
       riempie: se c'e' qualcosa si risponde "ok" e non succede niente;
     - il tempo: un modulo spedito meno di tre secondi dopo l'apertura
       (`ms`) e' troppo presto. Qui la risposta NON e' finta: un browser
       che rimette i campi gia' scritti (il tasto indietro, una pagina
       ricaricata) lo fa anche a una persona, che deve saperlo e premere di
       nuovo - un "ok" finto le farebbe credere spedita una domanda persa;
     - la casella "non sono un robot" di Turnstile (lib/captcha.js), con
       l'azione 'domanda-sito';
     - cinque domande al giorno per indirizzo email (un contatore in
       `domandeSitoLimiti`, per impronta dell'indirizzo);
     - il freno per indirizzo IP di iscrizione-nuova.js.

   L'INDIRIZZO E' SOLO UN INDIRIZZO: lettere, cifre e . _ % + ' - prima
   della chiocciola, un dominio dopo, niente spazi, virgolette, < > , ; :
   ( ) [ ] o barre. Con "testo<vittima@altro.it>" il server di posta
   leggerebbe un nome (il testo) e un indirizzo: la ricevuta partirebbe
   per l'altro con il nostro mittente e quel testo in vista, e ogni testo
   diverso conterebbe come un indirizzo nuovo nelle cinque al giorno. Il
   contatore, poi, conta l'indirizzo nella forma che arriva alla stessa
   casella: senza "+qualcosa" e, per Gmail, senza i punti.

   IN FONDO, le richieste di check-up dalle pagine dei temi: stessi
   destinatari, una mail sola a noi e nessuna ricevuta (vedi li').
   ============================================================ */

const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { avvolgi, senzaTrattiniLunghi } = require('./mail-layout');
const CAPTCHA = require('./captcha');
const CONF = require('./conferma-email');
const VERIFICATA = require('./iscrizione-verificata');

/* Gli argomenti: l'identificativo lo manda la pagina, l'etichetta qui serve
   alla mail. Un identificativo che non c'e' vale 'altro'. */
const TEMI = {
    eventi: 'Eventi e convegni',
    governance: 'Governance e responsabilità degli amministratori',
    assetti: 'Adeguati assetti organizzativi',
    revisione: 'Organo di controllo e revisione legale',
    'modello-231': 'Modello 231',
    tcf: 'Tax Control Framework',
    legalita: 'Rating di legalità',
    ia: 'Intelligenza artificiale',
    credito: 'Accesso al credito',
    bandi: 'Bandi e agevolazioni',
    crisi: 'Crisi d\'impresa e continuità',
    esg: 'Sostenibilità ed ESG',
    altro: 'Altro'
};
const EVENTI = {
    'milano-2027': 'Milano, 26 febbraio 2027',
    'milano-2027-aderenti': 'Milano 2027, cena e meeting degli aderenti',
    'napoli-2026': 'Napoli, 1-2 ottobre 2026',
    'roma-2026': 'Roma, 29 aprile 2026',
    'verona-2026': 'Verona, 27 marzo 2026',
    altro: 'Altro evento'
};
const MOTIVI = {
    'mail-non-ricevuta': 'Mail di conferma non ricevuta',
    'modifica-annulla': 'Modifica o annullamento dell\'iscrizione',
    info: 'Informazioni su programma e sede',
    diretta: 'Diretta online',
    'sponsor-relatore': 'Sponsor o relatori',
    altro: 'Altro'
};
const MAX_MESSAGGIO = 2000;
const MIN_MS = 3000;
const MAX_AL_GIORNO = 5;
const MAX_DESTINATARI = 10;

function testo(v, max) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 200);
}
// il messaggio tiene gli a capo: e' l'unico campo scritto per essere letto
function testoLungo(v) {
    return String(v == null ? '' : v).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ')
        .replace(/\n{4,}/g, '\n\n\n').trim();
}
function esc(x) {
    return String(x == null ? '' : x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
}
/* Un indirizzo nudo, gia' in minuscolo e senza spazi intorno (vedi in cima):
   e' quello che va al contatore, al "Rispondi" e alla ricevuta. */
function indirizzoValido(e) {
    return /^[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(String(e || ''));
}
/* La forma con cui si contano le domande di un indirizzo: quella che arriva
   alla stessa casella. "lucia+1@studio.it" e "lucia+2@..." sono
   lucia@studio.it; per Gmail anche i punti non contano ("l.u.c.i.a@gmail.com")
   e googlemail.com e' gmail.com. */
function formaPerContare(email) {
    const e = String(email || '').toLowerCase();
    const i = e.lastIndexOf('@');
    if (i < 1) return e;
    let locale = e.slice(0, i);
    let dominio = e.slice(i + 1);
    locale = locale.split('+')[0] || locale;
    if (dominio === 'googlemail.com') dominio = 'gmail.com';
    if (dominio === 'gmail.com') locale = locale.replace(/\./g, '') || locale;
    return locale + '@' + dominio;
}
// come in iscrizione-nuova.js: true, false, oppure null se il campo non c'e'
function consenso(v) {
    if (v === true || v === false) return v;
    if (v == null) return null;
    const s = String(v).trim().normalize('NFD').replace(/\p{M}/gu, '');
    return s ? /^(si|s|true|vero|1|x|yes|on)$/i.test(s) : null;
}
function voce(elenco, v) {
    const k = testo(v, 40).toLowerCase();
    if (!k) return '';
    return Object.prototype.hasOwnProperty.call(elenco, k) ? k : 'altro';
}

/* A chi arrivano le domande: DOMANDE_DESTINATARI (separati da virgola), se
   c'e' e ha indirizzi buoni; altrimenti info@. */
function destinatari() {
    const visti = {};
    const out = [];
    String(process.env.DOMANDE_DESTINATARI || '').split(/[,;\s]+/).forEach(x => {
        const e = String(x || '').trim().toLowerCase();
        if (!e || !indirizzoValido(e) || visti[e]) return;
        visti[e] = true;
        if (out.length < MAX_DESTINATARI) out.push(e);
    });
    return out.length ? out : ['info@nextgenerationbusiness.it'];
}

function trasporto() {
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 465,
        secure: (Number(process.env.SMTP_PORT) || 465) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        // tempi massimi: la risposta al modulo non aspetta un server muto
        connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 15000, dnsTimeout: 5000
    });
}
function mittente() {
    const ind = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
    const nome = (process.env.SMTP_FROM_NAME || 'Revilaw S.p.A.').replace(/[\r\n]/g, ' ').slice(0, 80);
    return '"' + nome + '" <' + ind + '>';
}

function giornoItaliano(ms) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}
function quandoLeggibile(ms) {
    const n = Number(ms);
    if (!n) return '';
    const f = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
    const p = {};
    f.formatToParts(new Date(n)).forEach(x => { p[x.type] = x.value; });
    return p.day + '/' + p.month + '/' + p.year + ' ' + p.hour + ':' + p.minute;
}

/* Il contatore per indirizzo, nella giornata italiana. Il nome del
   documento e' un'impronta: l'indirizzo non ci sta scritto. L'indirizzo e'
   contato nella sua forma per contare (formaPerContare). */
async function prenotaDelGiorno(db, email) {
    const rif = db.collection('domandeSitoLimiti').doc(crypto.createHash('sha256').update('domanda|' + formaPerContare(email)).digest('hex').slice(0, 40));
    const oggi = giornoItaliano(Date.now());
    return db.runTransaction(async tx => {
        const s = await tx.get(rif);
        const d = s.exists ? (s.data() || {}) : {};
        const quante = d.giorno === oggi ? (Number(d.quante) || 0) : 0;
        if (quante >= MAX_AL_GIORNO) return false;
        tx.set(rif, { giorno: oggi, quante: quante + 1 }, { merge: true });
        return true;
    });
}

/* --- cosa risulta delle iscrizioni con quell'indirizzo (solo per noi) ---
   Le righe della diagnosi e le iscrizioni in attesa di conferma a un evento
   che la chiede, a cui rimandare la mail. */
async function iscrizioniDi(db, email) {
    const snap = await db.collection('iscrizioni').where('email', '==', email).limit(20).get();
    const out = [];
    snap.forEach(d => out.push({ id: d.id, x: d.data() || {} }));
    return out;
}
function rigaDiagnosi(x) {
    const r = [];
    r.push(['Evento', testo(x.pagina, 200) || '-']);
    r.push(['Registrata il', testo(x.data, 40) || '-']);
    const c = x.emailConfermata;
    r.push(['Email confermata', CONF.confermata(x)
        ? 'sì, il ' + quandoLeggibile(c.quando) + (c.come === 'pregresso' ? ' (d\'ufficio)' : ' (dalla mail)')
        : 'NO']);
    const m = CONF.mailPerIndirizzo(x);
    const mAltro = !m && x.mailConferma && typeof x.mailConferma === 'object';
    r.push(['Mail di conferma', m
        ? (m.ok === true ? 'inviata il ' + quandoLeggibile(m.quando) : 'NON inviata il ' + quandoLeggibile(m.quando) + ': ' + testo(m.errore, 200))
            + (m.via ? ' (' + testo(m.via, 20) + ')' : '')
        : (mAltro ? 'partita solo per un indirizzo precedente' : 'nessun invio registrato')]);
    const inv = CONF.invioPerIndirizzo(x);
    if (inv) r.push(['Invii della mail', String(Number(inv.tentativi) || 0)]);
    if (x.promemoriaConferma && x.promemoriaConferma.quando) r.push(['Promemoria', 'mandato il ' + quandoLeggibile(x.promemoriaConferma.quando)]);
    const s = x.smsConferma;
    if (s && typeof s === 'object') {
        r.push(['SMS "conferma la tua email"', (s.ok === true ? 'inviato il ' : 'NON inviato il ') + quandoLeggibile(s.quando)
            + (s.ok === true ? '' : ': ' + testo(s.errore, 200))]);
    }
    r.push(['Cellulare verificato', x.telefonoVerificato ? 'sì' : 'no']);
    r.push(['Annullata', x.annullato ? 'SÌ' : 'no']);
    return r;
}
async function controlloMail(db, email) {
    const out = { righe: [], trovate: 0, rimandate: [] };
    let schede = [];
    try { schede = await iscrizioniDi(db, email); }
    catch (e) {
        out.errore = 'lettura delle iscrizioni non riuscita';
        console.error('Domanda dal sito: iscrizioni non lette:', String((e && e.message) || e).slice(0, 200));
        return out;
    }
    out.trovate = schede.length;
    for (const s of schede) {
        const blocco = { id: s.id, righe: rigaDiagnosi(s.x) };
        /* in attesa a un evento che chiede la conferma: la mail riparte
           adesso, con il freno del pulsante "rimandala" */
        if (VERIFICATA.eventoDi(s.x.pagina) && CONF.inAttesaDiConferma(s.x)) {
            let r;
            try { r = await CONF.rimandaConferma(db, s.id, { via: 'rimanda' }); }
            catch (e) { r = { esito: 'errore', errore: String((e && e.message) || e).slice(0, 200) }; }
            const detto = {
                inviata: 'RIMANDATA ADESSO in automatico a ' + (r.a || email),
                errore: 'rimandata adesso, ma il server di posta non l\'ha presa: ' + testo(r.errore, 200) + ' (il giro automatico riprova)',
                attesa: r.ultimoOk === false
                    ? 'non rimandata adesso: l\'ultimo tentativo, appena fatto, non è partito (il giro automatico riprova; fra ' + r.attesa + ' secondi si può)'
                    : 'non rimandata adesso: era appena partita (fra ' + r.attesa + ' secondi si può)',
                troppi: 'non rimandata adesso: oggi è già stata rimandata 5 volte'
            }[r.esito] || ('non rimandata (' + r.esito + ')');
            blocco.righe.push(['Rinvio', detto]);
            out.rimandate.push({ id: s.id, esito: r.esito });
        }
        out.righe.push(blocco);
    }
    return out;
}

/* --- le due mail --- */
function etichette(r) {
    return {
        tema: TEMI[r.tema] || TEMI.altro,
        evento: r.evento ? EVENTI[r.evento] : '',
        motivo: r.motivo ? MOTIVI[r.motivo] : ''
    };
}
function mailInterna(r, controllo) {
    const et = etichette(r);
    const chi = (r.nome + ' ' + r.cognome).trim();
    const riga = (k, v) => v
        ? '<tr><td style="padding:4px 12px 4px 0;color:#475569;white-space:nowrap;vertical-align:top;">' + esc(k) + '</td>'
        + '<td style="padding:4px 0;font-weight:600;">' + esc(v) + '</td></tr>'
        : '';
    const tabella = righe => '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;font-size:14px;">'
        + righe.map(x => riga(x[0], x[1])).join('') + '</table>';
    const dati = [
        ['Nome', chi], ['Email', r.email], ['Telefono', r.telefono], ['Azienda', r.azienda],
        ['Argomento', et.tema], ['Evento', et.evento], ['Motivo', et.motivo],
        ['Consenso marketing', r.marketing === true ? 'sì' : 'no'],
        ['Ricevuta il', quandoLeggibile(r.quando)]
    ];
    let controlloHtml = '', controlloTesto = '';
    if (controllo) {
        const titolo = 'Solo per noi: cosa risulta con questo indirizzo';
        if (controllo.errore) {
            controlloHtml = '<p style="margin:0 0 8px;"><b>' + esc(titolo) + '</b><br>' + esc(controllo.errore) + '</p>';
            controlloTesto = titolo + ':\n' + controllo.errore;
        } else if (!controllo.trovate) {
            const nessuna = 'Nessuna iscrizione con questo indirizzo. Può essersi iscritto con un altro indirizzo (un errore di battitura?): cercare nome e cognome nell\'area riservata.';
            controlloHtml = '<p style="margin:0 0 8px;"><b>' + esc(titolo) + '</b><br>' + esc(nessuna) + '</p>';
            controlloTesto = titolo + ':\n' + nessuna;
        } else {
            controlloHtml = '<p style="margin:0 0 8px;"><b>' + esc(titolo) + '</b> (iscrizioni trovate: ' + controllo.trovate + ')</p>'
                + controllo.righe.map(b => tabella(b.righe)).join('');
            controlloTesto = titolo + ' (iscrizioni trovate: ' + controllo.trovate + '):\n'
                + controllo.righe.map(b => b.righe.map(x => x[0] + ': ' + x[1]).join('\n')).join('\n\n');
        }
    }
    const dentro = '<p style="margin:0 0 14px;">Domanda ricevuta dal modulo del sito (pagina Contatti).</p>'
        + tabella(dati)
        + '<p style="margin:0 0 14px;"><b>Messaggio</b><br>' + (r.messaggio ? esc(r.messaggio).split('\n').join('<br>') : '<i>(nessun testo)</i>') + '</p>'
        + (controlloHtml ? '<div style="margin:0 0 16px;padding:12px 14px;background-color:#F8FAFC;border:1px solid #E2E8F0;">' + controlloHtml + '</div>' : '')
        + '<p style="margin:0;font-size:13px;color:#475569;">Rispondendo a questo messaggio si scrive direttamente a ' + esc(r.email) + '.</p>';
    const oggetto = senzaTrattiniLunghi('Domanda dal sito - ' + [et.tema, et.evento, et.motivo].filter(Boolean).join(' · ') + ' - ' + chi)
        .replace(/[\r\n]+/g, ' ').slice(0, 250);
    const testoMail = ['Domanda ricevuta dal modulo del sito (pagina Contatti).',
        dati.filter(x => x[1]).map(x => x[0] + ': ' + x[1]).join('\n'),
        'Messaggio:\n' + (r.messaggio || '(nessun testo)'),
        controlloTesto,
        'Rispondendo a questo messaggio si scrive direttamente a ' + r.email + '.'].filter(Boolean).join('\n\n');
    return { oggetto: oggetto, html: avvolgi(dentro), testo: senzaTrattiniLunghi(testoMail) };
}
/* La ricevuta: niente messaggio, niente dati scritti nel modulo se non il
   nome di battesimo, e solo quando sembra un nome: lettere, apostrofi e
   trattini, due parole al massimo, niente punti (un indirizzo web non ci
   passa). L'argomento e' un'etichetta nostra. */
function nomeDaSalutare(nome) {
    const n = String(nome || '').trim().replace(/\s+/g, ' ');
    return n.length <= 30 && /^[\p{L}][\p{L}'-]*( [\p{L}][\p{L}'-]*)?$/u.test(n) ? n : '';
}
function mailRicevuta(r) {
    const et = etichette(r);
    const nome = nomeDaSalutare(r.nome);
    const paragrafi = [
        'Buongiorno' + (nome ? ' ' + nome : '') + ',',
        'abbiamo ricevuto la tua domanda sull\'argomento «' + et.tema + '»' + (et.evento ? ' (' + et.evento + ')' : '')
            + ': ti rispondiamo al più presto a questo indirizzo.'
    ];
    if (r.motivo === 'mail-non-ricevuta') {
        paragrafi.push('Se risulta un\'iscrizione in attesa di conferma con questo indirizzo, ti abbiamo rimandato la mail con il pulsante «Conferma il tuo indirizzo email»: cercala anche nelle cartelle Spam, Posta indesiderata e Promozioni. Se ti eri iscritto con un altro indirizzo, rispondi a questa mail indicandolo e controlliamo noi.');
    }
    paragrafi.push('Se nei prossimi giorni non vedi la nostra risposta, guarda anche nella cartella Spam o Posta indesiderata.');
    paragrafi.push('Cordiali saluti.');
    const dentro = paragrafi.map(p => '<p style="margin:0 0 14px;">' + esc(p) + '</p>').join('');
    return {
        oggetto: 'Abbiamo ricevuto la tua domanda - Next Generation Business',
        html: avvolgi(dentro),
        testo: paragrafi.join('\n\n')
    };
}

/* --- l'arrivo di una domanda ---
   Chiamata dall'endpoint pubblico: quello che arriva qui lo ha scritto
   chiunque. opz: { ip } per Turnstile. Restituisce { stato, corpo }. */
async function ricevi(db, corpo, opz) {
    const c = corpo || {};
    // il freno silenzioso: a un robot si risponde come a una persona
    if (testo(c.sito, 200)) return { stato: 200, corpo: { ok: true } };
    /* troppo presto: lo si dice (vedi in cima). Niente si salva e il
       gettone di Turnstile non si consuma: si controlla dopo */
    const ms = Number(c.ms);
    if (!(ms >= MIN_MS)) {
        console.warn('Domanda dal sito respinta: modulo spedito dopo ' + (isFinite(ms) ? Math.round(ms) : '?') + ' ms.');
        return { stato: 400, corpo: { ok: false, msg: 'Attendi un attimo e premi di nuovo «Invia la domanda».' } };
    }

    const nome = testo(c.nome, 80);
    const cognome = testo(c.cognome, 80);
    // la forma nuda e minuscola: e' questa che va al contatore, al "Rispondi" e alla ricevuta
    const email = testo(c.email, 200).toLowerCase();
    const tema = voce(TEMI, c.tema);
    const evento = tema === 'eventi' ? voce(EVENTI, c.evento) : '';
    const motivo = tema === 'eventi' ? voce(MOTIVI, c.motivo) : '';
    const messaggio = testoLungo(c.messaggio);
    if (!nome) return { stato: 400, corpo: { ok: false, campo: 'nome', msg: 'Scrivi il tuo nome.' } };
    if (!cognome) return { stato: 400, corpo: { ok: false, campo: 'cognome', msg: 'Scrivi il tuo cognome.' } };
    if (!indirizzoValido(email)) return { stato: 400, corpo: { ok: false, campo: 'email', msg: 'L\'indirizzo email non sembra valido: controllalo, è quello a cui ti rispondiamo.' } };
    if (!tema) return { stato: 400, corpo: { ok: false, campo: 'tema', msg: 'Scegli l\'argomento della domanda.' } };
    // a chi non ha ricevuto la mail basta il motivo: il testo puo' mancare
    if (!messaggio && motivo !== 'mail-non-ricevuta') return { stato: 400, corpo: { ok: false, campo: 'messaggio', msg: 'Scrivi la tua domanda.' } };
    if (messaggio.length > MAX_MESSAGGIO) return { stato: 400, corpo: { ok: false, campo: 'messaggio', msg: 'Il messaggio è troppo lungo: al massimo ' + MAX_MESSAGGIO + ' caratteri.' } };
    if (consenso(c.privacy) !== true) return { stato: 400, corpo: { ok: false, campo: 'privacy', msg: 'Per inviare la domanda serve il consenso al trattamento dei dati personali.' } };

    // la casella "non sono un robot", dopo i controlli dei campi: il gettone vale una volta sola
    const cap = await CAPTCHA.verifica(c.captcha, (opz && opz.ip) || '', { azione: 'domanda-sito' });
    if (!cap.ok) {
        return {
            stato: 400, corpo: {
                ok: false, captchaKo: true,
                msg: cap.motivo === 'servizio'
                    ? 'Non riusciamo a controllare la casella «Non sono un robot»: riprova fra qualche secondo.'
                    : 'Conferma la casella «Non sono un robot», poi invia di nuovo la domanda.'
            }
        };
    }

    try {
        if (!await prenotaDelGiorno(db, email)) {
            return { stato: 429, corpo: { ok: false, msg: 'Da questo indirizzo oggi abbiamo già ricevuto diverse domande: ti rispondiamo al più presto. Se è urgente scrivi a info@nextgenerationbusiness.it.' } };
        }
    } catch (e) {
        // il contatore non si legge: meglio una domanda in piu' che una persa
        console.error('Domanda dal sito: contatore non letto:', String((e && e.message) || e).slice(0, 200));
    }

    const r = {
        quando: Date.now(),
        nome: nome, cognome: cognome, email: email,
        telefono: testo(c.telefono, 40), azienda: testo(c.azienda, 200),
        tema: tema, evento: evento, motivo: motivo,
        messaggio: messaggio,
        privacy: true, marketing: consenso(c.marketing) === true,
        origine: 'contatti'
    };

    // 1) in archivio, sempre e per primo
    const id = new Date(r.quando).toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomBytes(4).toString('hex');
    const rif = db.collection('domandeSito').doc(id);
    try {
        await rif.set(r);
    } catch (e) {
        console.error('Domanda dal sito non registrata:', String((e && e.message) || e).slice(0, 200));
        return { stato: 500, corpo: { ok: false, msg: 'Non siamo riusciti a registrare la domanda: riprova fra poco, oppure scrivi a info@nextgenerationbusiness.it.' } };
    }

    // 2) chi non ha ricevuto la mail di conferma: cosa risulta, e la mail che riparte
    const controllo = motivo === 'mail-non-ricevuta' ? await controlloMail(db, email) : null;

    // 3) le mail: se non partono, la domanda e' comunque salva
    const a = destinatari();
    let avvisati = 0, confermato = false;
    const trans = trasporto();
    const interna = mailInterna(r, controllo);
    try {
        await trans.sendMail({
            from: mittente(), to: a.join(', '),
            // "Rispondi" scrive alla persona: e' il gesto di chi la legge
            replyTo: email,
            subject: interna.oggetto, html: interna.html, text: interna.testo
        });
        avvisati = a.length;
    } catch (e) {
        console.error('Domanda dal sito, avviso interno non partito:', String((e && e.message) || e).slice(0, 200));
    }
    const ricevuta = mailRicevuta(r);
    try {
        await trans.sendMail({
            from: mittente(), to: email,
            // e chi risponde alla ricevuta scrive a noi, non a noreply
            replyTo: a[0],
            subject: ricevuta.oggetto, html: ricevuta.html, text: ricevuta.testo
        });
        confermato = true;
    } catch (e) {
        console.error('Domanda dal sito, ricevuta non partita:', String((e && e.message) || e).slice(0, 200));
    }
    try { trans.close(); } catch (_) { /* niente da chiudere */ }

    try {
        const esito = { avvisati: avvisati, confermato: confermato };
        if (controllo) esito.controllo = { trovate: controllo.trovate, rimandate: controllo.rimandate };
        await rif.set(esito, { merge: true });
    } catch (_) { /* dato di servizio */ }

    // la risposta e' la stessa per tutti: non dice se l'indirizzo e' iscritto
    return { stato: 200, corpo: { ok: true } };
}

/* ============================================================
   Le richieste di check-up dalle pagine dei temi
   ------------------------------------------------------------
   Le pagine dei temi (crisi_impresa/, modello_231/, adeguati_assetti/...)
   chiudono con il modulo "Richiedi un check-up riservato". Lo gestisce
   zls_zes/script.js (e, nelle tre pagine che non lo caricano, il loro
   script): le stesse colonne vanno al foglio Google e alla scrittura
   generica di api/iscrizione-nuova.js, con `pagina` = "<Tema> - Contatto".
   Fin qui la riga restava li' e basta: nessuno sapeva che qualcuno
   aspettava una risposta.

   Adesso, salvata la riga, parte UNA mail a noi, agli stessi indirizzi
   delle domande (DOMANDE_DESTINATARI, o info@), con i dati del modulo.
   Le differenze dalle domande di /contatti/, e perche':
     - NIENTE RICEVUTA a chi scrive. La scrittura generica non ha la
       casella "non sono un robot": una mail all'indirizzo scritto nel
       modulo farebbe partire la nostra posta verso chiunque. Chi scrive ha
       gia' il messaggio a schermo, e la risposta gli arriva da info@;
     - "Rispondi" verso chi scrive SOLO con un indirizzo nudo
       (indirizzoValido): la scrittura generica accetta indirizzi piu'
       larghi, e con "testo<vittima@altro.it>" la nostra risposta
       partirebbe per l'altro. Senza, la mail dice di controllarlo;
     - QUANDO avvisare lo decide iscrizione-nuova.js, accanto alla mail di
       conferma degli eventi: `pagina` che finisce con "- Contatto"
       (paginaCheckUp), mai una pagina di evento, mai un corpo con
       un'azione, mai il desk;
     - la mail non ferma niente: la riga e' gia' salva, e com'e' andata
       resta scritto li' (`avvisoInterno`: quando, ok, a quanti, l'errore).
       Lo stesso modulo spedito due volte nello stesso secondo riscrive la
       stessa riga, e una riga gia' avvisata non avvisa di nuovo.
   ============================================================ */
const RE_CHECK_UP = /\s-\s*contatto\s*$/i;
function paginaCheckUp(pagina) {
    return RE_CHECK_UP.test(String(pagina || ''));
}
// "La Crisi d'Impresa - Contatto" -> "La Crisi d'Impresa"
function temaDaPagina(pagina) {
    const p = testo(pagina, 200);
    return p.replace(RE_CHECK_UP, '').trim() || p;
}
function siNo(v) {
    return v === true ? 'sì' : (v === false ? 'no' : 'non indicato');
}
/* La mail a noi. `rispondi` e' l'indirizzo per "Rispondi", gia' controllato
   (vuoto se l'indirizzo scritto non e' un indirizzo nudo). Tutto quello che
   viene dal modulo passa da esc(): la riga l'ha scritta chiunque. */
function mailCheckUp(s, rispondi) {
    const x = s || {};
    const tema = temaDaPagina(x.pagina);
    const chi = (testo(x.nome, 120) + ' ' + testo(x.cognome, 120)).trim();
    const dati = [
        ['Nome', testo(x.nome, 120)], ['Cognome', testo(x.cognome, 120)], ['Email', testo(x.email, 200)],
        ['Azienda', testo(x.azienda, 200)], ['Ruolo', testo(x.ruolo, 200)], ['Telefono', testo(x.telefono, 60)],
        ['Pagina', testo(x.pagina, 200)], ['Data', testo(x.data, 40)],
        ['Consenso privacy', siNo(x.privacy)], ['Consenso marketing', siNo(x.marketing)]
    ];
    const messaggio = testo(x.messaggio, 2000);
    const riga = r => '<tr><td style="padding:4px 12px 4px 0;color:#475569;white-space:nowrap;vertical-align:top;">' + esc(r[0]) + '</td>'
        + '<td style="padding:4px 0;font-weight:600;">' + esc(r[1] || '-') + '</td></tr>';
    const nota = rispondi
        ? 'Rispondendo a questo messaggio si scrive direttamente a ' + rispondi + '.'
        : 'L\'indirizzo scritto nel modulo non è un indirizzo semplice: «Rispondi» non scrive a chi ha fatto la richiesta. Controllarlo prima di rispondere.';
    // il modulo si chiama "Richiedi un check-up riservato" o "Richiedi informazioni", secondo la pagina
    const apertura = 'Richiesta dal modulo di contatto della pagina «' + tema + '» del sito.';
    const dove = 'La richiesta è salvata anche nell\'area riservata, sezione Newsletter, nel gruppo della pagina.';
    const dentro = '<p style="margin:0 0 14px;">' + esc(apertura) + '</p>'
        + '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;font-size:14px;">'
        + dati.map(riga).join('') + '</table>'
        + (messaggio ? '<p style="margin:0 0 14px;"><b>Messaggio</b><br>' + esc(messaggio) + '</p>' : '')
        + '<p style="margin:0 0 8px;font-size:13px;color:#475569;">' + esc(nota) + '</p>'
        + '<p style="margin:0;font-size:13px;color:#475569;">' + esc(dove) + '</p>';
    const oggetto = senzaTrattiniLunghi('Richiesta di check-up dal sito - ' + tema + (chi ? ' - ' + chi : ''))
        .replace(/[\r\n]+/g, ' ').slice(0, 250);
    const testoMail = [apertura,
        dati.map(r => r[0] + ': ' + (r[1] || '-')).join('\n'),
        messaggio ? 'Messaggio:\n' + messaggio : '',
        nota, dove].filter(Boolean).join('\n\n');
    return { oggetto: oggetto, html: avvolgi(dentro), testo: senzaTrattiniLunghi(testoMail) };
}
/* Dopo il salvataggio della riga `iscrizioni/<idDoc>`. Non lancia mai:
   restituisce l'esito, che e' anche quello scritto sulla riga. */
async function avvisaCheckUp(db, idDoc, scheda) {
    const s = scheda || {};
    const rif = db.collection('iscrizioni').doc(String(idDoc));
    try {
        const prima = await rif.get();
        const gia = prima.exists ? ((prima.data() || {}).avvisoInterno || null) : null;
        if (gia && gia.ok === true) return { ok: true, gia: true };
    } catch (_) { /* non si legge: meglio una mail in piu' che una richiesta persa */ }

    const a = destinatari();
    const email = testo(s.email, 200).toLowerCase();
    const rispondi = indirizzoValido(email) ? email : '';
    const esito = { quando: Date.now(), ok: false };
    let trans = null;
    try {
        const m = mailCheckUp(s, rispondi);
        const msg = { from: mittente(), to: a.join(', '), subject: m.oggetto, html: m.html, text: m.testo };
        // "Rispondi" scrive alla persona, ma solo a un indirizzo nudo (vedi sopra)
        if (rispondi) msg.replyTo = rispondi;
        trans = trasporto();
        await trans.sendMail(msg);
        esito.ok = true;
        esito.a = a.length;
    } catch (e) {
        esito.errore = String((e && e.message) || e).slice(0, 200);
        console.error('Richiesta di check-up, avviso interno non partito:', esito.errore);
    }
    try { if (trans) trans.close(); } catch (_) { /* niente da chiudere */ }
    try { await rif.set({ avvisoInterno: esito }, { merge: true }); } catch (_) { /* dato di servizio */ }
    return esito;
}

module.exports = {
    ricevi, destinatari, mailInterna, mailRicevuta, indirizzoValido, formaPerContare, TEMI, EVENTI, MOTIVI, MAX_AL_GIORNO,
    paginaCheckUp, temaDaPagina, mailCheckUp, avvisaCheckUp
};
