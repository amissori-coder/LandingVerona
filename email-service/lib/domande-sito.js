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
   contato nella sua forma per contare (formaPerContare). Lo stesso
   contatore serve alle richieste di check-up (in fondo), con un altro
   prefisso nell'impronta e un altro tetto: i due conti non si toccano. */
async function prenotaDelGiorno(db, email, prefisso, massimo) {
    const rif = db.collection('domandeSitoLimiti').doc(crypto.createHash('sha256').update((prefisso || 'domanda|') + formaPerContare(email)).digest('hex').slice(0, 40));
    const tetto = massimo || MAX_AL_GIORNO;
    const oggi = giornoItaliano(Date.now());
    return db.runTransaction(async tx => {
        const s = await tx.get(rif);
        const d = s.exists ? (s.data() || {}) : {};
        const quante = d.giorno === oggi ? (Number(d.quante) || 0) : 0;
        if (quante >= tetto) return false;
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
        ? 'sì, il ' + quandoLeggibile(c.quando) + (c.come === 'pregresso' ? ' (d\'ufficio)'
            : c.come === 'spostamento' ? ' (d\'ufficio, con lo spostamento fra ' + (c.verso === 'sponsor' ? 'sponsor e relatori' : 'gli aderenti Revilaw') + ')'
                : ' (dalla mail)')
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
     - "Rispondi" verso chi scrive, e la mail parte SOLO con un indirizzo
       nudo (indirizzoValido): la scrittura generica accetta indirizzi piu'
       larghi, e con "testo<vittima@altro.it>" la nostra risposta
       partirebbe per l'altro (vedi i freni, qui sotto);
     - QUANDO avvisare lo decide iscrizione-nuova.js, accanto alla mail di
       conferma degli eventi: `pagina` che finisce con "- Contatto"
       (paginaCheckUp), mai una pagina di evento, mai un corpo con
       un'azione, mai il desk;
     - la mail non ferma niente: la riga e' gia' salva, e com'e' andata
       resta scritto li' (`avvisoInterno`: quando, ok, a quanti, l'errore).
       Lo stesso modulo spedito due volte nello stesso secondo riscrive la
       stessa riga, e una riga gia' avvisata non avvisa di nuovo.

   I FRENI. Senza la casella "non sono un robot", e con il freno per IP che
   vive nella memoria di una funzione (un robot che cambia IP lo salta),
   questa strada potrebbe far arrivare a info@ quante mail vuole chiunque.
   Percio' la mail parte solo se:
     - l'indirizzo e' un indirizzo nudo (indirizzoValido) e c'e' almeno il
       nome o il cognome: una riga senza una persona a cui rispondere resta
       nell'area riservata, e basta;
     - quell'indirizzo, oggi, non ha gia' fatto partire tre avvisi (il
       contatore delle domande, `domandeSitoLimiti`, con il prefisso
       'checkup|': stessa impronta, stessa forma per contare);
     - oggi, in tutto, non sono gia' partiti quaranta avvisi
       (`checkUpLimiti/<giorno italiano>`, un contatore in transazione;
       CHECKUP_MAX_GIORNO lo cambia). Il tetto per indirizzo si guarda per
       primo: chi lo ha gia' raggiunto non consuma il tetto di tutti;
     - l'oggetto dice il tema solo se la pagina e' una di quelle del sito
       (PAGINE_CHECK_UP, la stessa lista dell'HTML: le prove la confrontano
       con i file). Una pagina sconosciuta salva la riga e avvisa lo stesso
       (dentro i tetti), con "tema non riconosciuto" nell'oggetto: il testo
       scritto nel modulo si legge solo dentro la mail, neutralizzato.
   Oltre un tetto la riga c'e' e non parte niente: su `avvisoInterno`
   resta ok falso e quale tetto. Se un contatore non si legge la mail non
   parte (un robot che intasa il contatore non deve aprirsi la strada); la
   riga c'e' comunque.
   ============================================================ */
const RE_CHECK_UP = /\s-\s*contatto\s*$/i;
const MAX_CHECK_UP_INDIRIZZO = 3;
const MAX_CHECK_UP_GIORNO = 40;
/* Le pagine dei temi, come le scrive `data-pagina` nei moduli del sito.
   Una pagina nuova va aggiunta qui: finche' non c'e', le sue richieste
   arrivano con "tema non riconosciuto" (e prove/check-up-temi.prove.js e'
   rossa). */
const PAGINE_CHECK_UP = [
    'AI Act 2 agosto 2026 - Contatto',
    'AI Governance - Contatto',
    'Adeguati Assetti - Contatto',
    'Bandi Lazio 2026 - Contatto',
    'Bando-tipo aiuti di Stato 2026 - Contatto',
    'Benefici fiscali TCF - Circolare 6/E 2026 - Contatto',
    'Bilancio di sostenibilità e ISO - Contatto',
    'Cassazione 7134/2026 - Adeguati Assetti - Contatto',
    'Chi Siamo - Contatto',
    'Dlgs 47/2026 Amministratori controllori revisori - Contatto',
    'ESG e merito creditizio - Contatto',
    'Early Warning e Adeguati Assetti - Contatto',
    'Fondo Contrasto Deindustrializzazione 2026 - Contatto',
    'Holding, Protezione del Patrimonio e Trust - Contatto',
    'IA e Quantum Computing nell\'export - Contatto',
    'IA e reati presupposto 231 - Contatto',
    'Intelligenza artificiale in azienda - Contatto',
    'Iper Ammortamento 2026-2028 - Contatto',
    'L\'inconscio dell\'impresa - Contatto',
    'La Crisi d\'Impresa - Contatto',
    'Modello 231 - Contatto',
    'Nuove imprese a tasso zero - Contatto',
    'OIC 35 bilancio ETS - Contatto',
    'Organo di controllo Dlgs 47/2026 - Contatto',
    'Rating Bancario - Contatto',
    'Rating di Legalità - Contatto',
    'Rating di legalita e incentivi - Contatto',
    'Responsabilita Amministratori - Contatto',
    'Revisione Legale Demo - Contatto',
    'Riforma governance Dlgs 47/2026 - Contatto',
    'Sostenibilità ed ESG - Contatto',
    'Tax Control Framework - Contatto',
    'Tax Control Framework e Adempimento Collaborativo - Contatto',
    'Verbale di controllo ETS - Contatto',
    'Vibe coding e conformità UE - Contatto',
    'Voucher Digitalizzazione PMI 2026 Lazio - Contatto',
    'ZLS & ZES - Contatto'
];
// la chiave con cui si cerca: minuscole e spazi semplici
function chiavePagina(p) {
    return String(p || '').toLowerCase().replace(/\s+/g, ' ').trim();
}
// "la crisi d'impresa - contatto" -> "La Crisi d'Impresa": l'etichetta e' la nostra
const TEMA_DI_PAGINA = {};
PAGINE_CHECK_UP.forEach(p => { TEMA_DI_PAGINA[chiavePagina(p)] = p.replace(RE_CHECK_UP, '').trim(); });

function paginaCheckUp(pagina) {
    return RE_CHECK_UP.test(String(pagina || ''));
}
/* "La Crisi d'Impresa - Contatto" -> "La Crisi d'Impresa", dalla lista qui
   sopra; una pagina che non c'e' -> '' (il testo scritto nel modulo non
   diventa un'etichetta). */
function temaDaPagina(pagina) {
    const k = chiavePagina(testo(pagina, 200));
    return Object.prototype.hasOwnProperty.call(TEMA_DI_PAGINA, k) ? TEMA_DI_PAGINA[k] : '';
}
// il tetto di tutti, al giorno: CHECKUP_MAX_GIORNO se e' un intero positivo
function tettoCheckUpGiorno() {
    const n = Number(String(process.env.CHECKUP_MAX_GIORNO || '').trim());
    return Number.isInteger(n) && n > 0 ? n : MAX_CHECK_UP_GIORNO;
}
/* Il contatore di tutti gli avvisi del giorno italiano: un documento per
   giorno, che non si riapre il giorno dopo. Restituisce false se il tetto
   e' gia' raggiunto (e allora non conta). */
async function prenotaCheckUpDelGiorno(db, tetto) {
    const oggi = giornoItaliano(Date.now());
    const rif = db.collection('checkUpLimiti').doc(oggi);
    return db.runTransaction(async tx => {
        const s = await tx.get(rif);
        const quante = s.exists ? (Number((s.data() || {}).quante) || 0) : 0;
        if (quante >= tetto) return false;
        tx.set(rif, { giorno: oggi, quante: quante + 1 }, { merge: true });
        return true;
    });
}
/* Il messaggio dei simulatori (fcd_2026, lazio_bandi_2026): un riassunto su
   piu' righe, che la riga fra le iscrizioni tiene su una. Per la mail si
   ripulisce dal testo che arriva dal modulo, con gli a capo. */
function messaggioCheckUp(v) {
    return testoLungo(String(v == null ? '' : v).slice(0, 4 * MAX_MESSAGGIO)).slice(0, MAX_MESSAGGIO).trim();
}
function siNo(v) {
    return v === true ? 'sì' : (v === false ? 'no' : 'non indicato');
}
/* La mail a noi. `rispondi` e' l'indirizzo per "Rispondi", gia' controllato
   (vuoto se l'indirizzo scritto non e' un indirizzo nudo). Tutto quello che
   viene dal modulo passa da esc(): la riga l'ha scritta chiunque. Il tema
   nell'oggetto e nella prima riga e' solo un'etichetta nostra; la pagina
   com'e' arrivata sta nella tabella. */
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
    const messaggio = messaggioCheckUp(x.messaggio);
    const riga = r => '<tr><td style="padding:4px 12px 4px 0;color:#475569;white-space:nowrap;vertical-align:top;">' + esc(r[0]) + '</td>'
        + '<td style="padding:4px 0;font-weight:600;">' + esc(r[1] || '-') + '</td></tr>';
    const nota = rispondi
        ? 'Rispondendo a questo messaggio si scrive direttamente a ' + rispondi + '.'
        : 'L\'indirizzo scritto nel modulo non è un indirizzo semplice: «Rispondi» non scrive a chi ha fatto la richiesta. Controllarlo prima di rispondere.';
    // il modulo si chiama "Richiedi un check-up riservato" o "Richiedi informazioni", secondo la pagina
    const apertura = tema
        ? 'Richiesta dal modulo di contatto della pagina «' + tema + '» del sito.'
        : 'Richiesta dal modulo di contatto di una pagina che non è fra quelle dei temi del sito: la pagina scritta nel modulo è nella tabella, alla voce «Pagina».';
    const dove = 'La richiesta è salvata anche nell\'area riservata, sezione Newsletter, nel gruppo della pagina.';
    const dentro = '<p style="margin:0 0 14px;">' + esc(apertura) + '</p>'
        + '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;font-size:14px;">'
        + dati.map(riga).join('') + '</table>'
        // gli a capo del riassunto dei simulatori restano: testo neutralizzato, riga per riga
        + (messaggio ? '<p style="margin:0 0 14px;"><b>Messaggio</b><br>' + esc(messaggio).split('\n').join('<br>') + '</p>' : '')
        + '<p style="margin:0 0 8px;font-size:13px;color:#475569;">' + esc(nota) + '</p>'
        + '<p style="margin:0;font-size:13px;color:#475569;">' + esc(dove) + '</p>';
    const oggetto = senzaTrattiniLunghi('Richiesta di check-up dal sito - ' + (tema || 'tema non riconosciuto') + (chi ? ' - ' + chi : ''))
        .replace(/[\r\n]+/g, ' ').slice(0, 250);
    const testoMail = [apertura,
        dati.map(r => r[0] + ': ' + (r[1] || '-')).join('\n'),
        messaggio ? 'Messaggio:\n' + messaggio : '',
        nota, dove].filter(Boolean).join('\n\n');
    return { oggetto: oggetto, html: avvolgi(dentro), testo: senzaTrattiniLunghi(testoMail) };
}
/* Dopo il salvataggio della riga `iscrizioni/<idDoc>`. Non lancia mai:
   restituisce l'esito, che e' anche quello scritto sulla riga. opz:
   { messaggio } il messaggio come l'ha mandato la pagina, con gli a capo
   (sulla riga e' su una riga sola). */
async function avvisaCheckUp(db, idDoc, scheda, opz) {
    const s = scheda || {};
    const rif = db.collection('iscrizioni').doc(String(idDoc));
    try {
        const prima = await rif.get();
        const gia = prima.exists ? ((prima.data() || {}).avvisoInterno || null) : null;
        if (gia && gia.ok === true) return { ok: true, gia: true };
    } catch (_) { /* non si legge: meglio una mail in piu' che una richiesta persa */ }

    const esito = { quando: Date.now(), ok: false };
    const annota = async () => {
        try { await rif.set({ avvisoInterno: esito }, { merge: true }); } catch (_) { /* dato di servizio */ }
        return esito;
    };
    // una persona a cui rispondere: un indirizzo nudo, e un nome o un cognome
    const email = testo(s.email, 200).toLowerCase();
    if (!indirizzoValido(email)) { esito.errore = 'nessun avviso: l\'indirizzo email non è un indirizzo semplice'; return annota(); }
    if (!testo(s.nome, 120) && !testo(s.cognome, 120)) { esito.errore = 'nessun avviso: mancano nome e cognome'; return annota(); }

    // i tetti: prima quello dell'indirizzo, poi quello di tutti (vedi sopra)
    const tetto = tettoCheckUpGiorno();
    try {
        if (!await prenotaDelGiorno(db, email, 'checkup|', MAX_CHECK_UP_INDIRIZZO)) {
            esito.errore = 'tetto per indirizzo: ' + MAX_CHECK_UP_INDIRIZZO + ' avvisi al giorno';
            console.warn('Richiesta di check-up: tetto per indirizzo raggiunto, nessun avviso.');
            return annota();
        }
        if (!await prenotaCheckUpDelGiorno(db, tetto)) {
            esito.errore = 'tetto del giorno: ' + tetto + ' avvisi';
            console.warn('Richiesta di check-up: tetto del giorno raggiunto (' + tetto + '), nessun avviso.');
            return annota();
        }
    } catch (e) {
        esito.errore = 'nessun avviso: contatore non letto (' + String((e && e.message) || e).slice(0, 150) + ')';
        console.error('Richiesta di check-up, contatore non letto:', esito.errore);
        return annota();
    }

    const a = destinatari();
    let trans = null;
    try {
        const o = opz || {};
        const dati = Object.assign({}, s, { email: email, messaggio: 'messaggio' in o ? o.messaggio : s.messaggio });
        const m = mailCheckUp(dati, email);
        // "Rispondi" scrive alla persona: l'indirizzo e' nudo (controllato qui sopra)
        const msg = { from: mittente(), to: a.join(', '), replyTo: email, subject: m.oggetto, html: m.html, text: m.testo };
        trans = trasporto();
        await trans.sendMail(msg);
        esito.ok = true;
        esito.a = a.length;
    } catch (e) {
        esito.errore = String((e && e.message) || e).slice(0, 200);
        console.error('Richiesta di check-up, avviso interno non partito:', esito.errore);
    }
    try { if (trans) trans.close(); } catch (_) { /* niente da chiudere */ }
    return annota();
}

module.exports = {
    ricevi, destinatari, mailInterna, mailRicevuta, indirizzoValido, formaPerContare, TEMI, EVENTI, MOTIVI, MAX_AL_GIORNO,
    paginaCheckUp, temaDaPagina, mailCheckUp, avvisaCheckUp,
    PAGINE_CHECK_UP, MAX_CHECK_UP_INDIRIZZO, MAX_CHECK_UP_GIORNO
};
