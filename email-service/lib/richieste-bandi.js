/* ============================================================
   Le richieste di informazioni dall'area bandi (/bandi/)
   ------------------------------------------------------------
   La pagina /bandi/ elenca le schede dei bandi aperti, da cercare
   per regione e per tipologia. Ogni scheda ha il pulsante "Richiedi
   informazioni", che apre un modulo: nome, cognome, azienda, email,
   telefono, un messaggio. Arriva qui con l'azione 'richiesta-bando'
   di api/iscrizione-nuova.js, come tutti i moduli aperti del sito
   (text/plain, freno per indirizzo IP).

   Come le domande del sito (lib/domande-sito.js), DUE mail:
     A NOI   la richiesta, a chi segue i bandi: a.missori@emvas.tax
             e dott.venturasara@gmail.com (o agli indirizzi di
             BANDI_DESTINATARI), con il bando nell'oggetto e
             "Rispondi" che scrive direttamente alla persona;
     A LORO  una ricevuta breve, che NON ripete ne' il messaggio ne'
             il titolo del bando: sono testi che arrivano dal
             browser, e chi scrive l'indirizzo di un altro non deve
             poter usare il nostro modulo per fargli arrivare un
             testo qualsiasi con il nostro nome.

   L'ORDINE CONTA: prima si scrive in archivio (collezione
   `richiesteBandi`), poi si spedisce. Se la posta non parte la
   richiesta c'e' lo stesso, e la risposta al modulo e' "ok".

   IL BANDO. L'elenco dei bandi vive nella pagina (bandi/dati.js), non
   qui: cambia ogni volta che si aggiunge una scheda, e il servizio
   non deve essere ripubblicato per questo. Quindi l'identificativo, il
   titolo, la regione e la tipologia che arrivano sono presi per quello
   che sono - testo scritto da chiunque - e finiscono SOLO nella mail a
   noi e in archivio, ripuliti e accorciati. Una richiesta senza bando
   e' una richiesta generica ("non trovo il bando che cerco"), e vale
   lo stesso.

   I FRENI, gli stessi delle domande del sito:
     - il campo nascosto `sito` (pieno: "ok" e non succede niente);
     - il tempo `ms` (meno di tre secondi: lo si dice, e si riprova);
     - la casella "non sono un robot" di Turnstile, con l'azione
       'richiesta-bando' (spenta senza TURNSTILE_SECRET);
     - cinque richieste al giorno per indirizzo email (contatore in
       `richiesteBandiLimiti`, per impronta dell'indirizzo);
     - il freno per indirizzo IP di iscrizione-nuova.js.
   ============================================================ */

const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { avvolgi, senzaTrattiniLunghi } = require('./mail-layout');
const CAPTCHA = require('./captcha');
/* L'indirizzo "solo un indirizzo" e la forma con cui lo si conta sono gli
   stessi del modulo delle domande: una regola sola, in un posto solo. */
const { indirizzoValido, formaPerContare } = require('./domande-sito');

/* A chi arrivano le richieste quando BANDI_DESTINATARI non c'e'. */
const DESTINATARI_PREDEFINITI = ['a.missori@emvas.tax', 'dott.venturasara@gmail.com'];
const MAX_DESTINATARI = 10;
const MAX_MESSAGGIO = 2000;
const MIN_MS = 3000;
const MAX_AL_GIORNO = 5;

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
// l'identificativo della scheda: lettere minuscole, cifre e trattini, come nella pagina
function idBando(v) {
    return String(v == null ? '' : v).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 80);
}
// true, false, oppure null se il campo non c'e'
function consenso(v) {
    if (v === true || v === false) return v;
    if (v == null) return null;
    const s = String(v).trim().normalize('NFD').replace(/\p{M}/gu, '');
    return s ? /^(si|s|true|vero|1|x|yes|on)$/i.test(s) : null;
}

/* A chi arrivano le richieste: BANDI_DESTINATARI (separati da virgola), se
   c'e' e ha indirizzi buoni; altrimenti i due predefiniti. */
function destinatari() {
    const visti = {};
    const out = [];
    String(process.env.BANDI_DESTINATARI || '').split(/[,;\s]+/).forEach(x => {
        const e = String(x || '').trim().toLowerCase();
        if (!e || !indirizzoValido(e) || visti[e]) return;
        visti[e] = true;
        if (out.length < MAX_DESTINATARI) out.push(e);
    });
    return out.length ? out : DESTINATARI_PREDEFINITI.slice();
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

/* Il contatore per indirizzo, nella giornata italiana. Il nome del documento
   e' un'impronta: l'indirizzo non ci sta scritto. */
async function prenotaDelGiorno(db, email) {
    const rif = db.collection('richiesteBandiLimiti')
        .doc(crypto.createHash('sha256').update('bando|' + formaPerContare(email)).digest('hex').slice(0, 40));
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

/* --- le due mail --- */
function mailInterna(r) {
    const chi = (r.nome + ' ' + r.cognome).trim();
    const riga = (k, v) => v
        ? '<tr><td style="padding:4px 12px 4px 0;color:#475569;white-space:nowrap;vertical-align:top;">' + esc(k) + '</td>'
        + '<td style="padding:4px 0;font-weight:600;">' + esc(v) + '</td></tr>'
        : '';
    const dati = [
        ['Bando', r.bandoTitolo || (r.bando ? r.bando : 'Richiesta generica (nessun bando scelto)')],
        ['Regione / ente', r.bandoRegione], ['Tipologia', r.bandoTipologia],
        ['Nome', chi], ['Azienda', r.azienda], ['Sede dell\'azienda', r.sede],
        ['Email', r.email], ['Telefono', r.telefono],
        ['Consenso marketing', r.marketing === true ? 'sì' : 'no'],
        ['Ricevuta il', quandoLeggibile(r.quando)]
    ];
    const dentro = '<p style="margin:0 0 14px;">Richiesta di informazioni ricevuta dall\'area bandi del sito.</p>'
        + '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;font-size:14px;">'
        + dati.map(x => riga(x[0], x[1])).join('') + '</table>'
        + '<p style="margin:0 0 14px;"><b>Messaggio</b><br>' + (r.messaggio ? esc(r.messaggio).split('\n').join('<br>') : '<i>(nessun testo)</i>') + '</p>'
        + '<p style="margin:0;font-size:13px;color:#475569;">Rispondendo a questo messaggio si scrive direttamente a ' + esc(r.email) + '.</p>';
    const oggetto = senzaTrattiniLunghi('Richiesta bando - ' + (r.bandoTitolo || 'richiesta generica') + ' - ' + (r.azienda || chi))
        .replace(/[\r\n]+/g, ' ').slice(0, 250);
    const testoMail = ['Richiesta di informazioni ricevuta dall\'area bandi del sito.',
        dati.filter(x => x[1]).map(x => x[0] + ': ' + x[1]).join('\n'),
        'Messaggio:\n' + (r.messaggio || '(nessun testo)'),
        'Rispondendo a questo messaggio si scrive direttamente a ' + r.email + '.'].join('\n\n');
    return { oggetto: oggetto, html: avvolgi(dentro), testo: senzaTrattiniLunghi(testoMail) };
}
/* La ricevuta: dei dati scritti nel modulo solo il nome di battesimo, e solo
   quando sembra un nome (lettere, apostrofi e trattini, due parole al
   massimo: un indirizzo web non ci passa). */
function nomeDaSalutare(nome) {
    const n = String(nome || '').trim().replace(/\s+/g, ' ');
    return n.length <= 30 && /^[\p{L}][\p{L}'-]*( [\p{L}][\p{L}'-]*)?$/u.test(n) ? n : '';
}
function mailRicevuta(r) {
    const nome = nomeDaSalutare(r.nome);
    const paragrafi = [
        'Buongiorno' + (nome ? ' ' + nome : '') + ',',
        'abbiamo ricevuto la tua richiesta di informazioni dall\'area bandi di Next Generation Business: un nostro referente ti ricontatta al più presto ai recapiti che ci hai indicato.',
        'Se nei prossimi giorni non vedi la nostra risposta, guarda anche nella cartella Spam o Posta indesiderata.',
        'Cordiali saluti.'
    ];
    return {
        oggetto: 'Abbiamo ricevuto la tua richiesta sui bandi - Next Generation Business',
        html: avvolgi(paragrafi.map(p => '<p style="margin:0 0 14px;">' + esc(p) + '</p>').join('')),
        testo: paragrafi.join('\n\n')
    };
}

/* --- l'arrivo di una richiesta ---
   Chiamata dall'endpoint pubblico: quello che arriva qui lo ha scritto
   chiunque. opz: { ip } per Turnstile. Restituisce { stato, corpo }. */
async function ricevi(db, corpo, opz) {
    const c = corpo || {};
    // il freno silenzioso: a un robot si risponde come a una persona
    if (testo(c.sito, 200)) return { stato: 200, corpo: { ok: true } };
    /* troppo presto: lo si dice (un browser che rimette i campi lo fa anche
       a una persona). Niente si salva e il gettone di Turnstile non si consuma */
    const ms = Number(c.ms);
    if (!(ms >= MIN_MS)) {
        console.warn('Richiesta bando respinta: modulo spedito dopo ' + (isFinite(ms) ? Math.round(ms) : '?') + ' ms.');
        return { stato: 400, corpo: { ok: false, msg: 'Attendi un attimo e premi di nuovo «Invia la richiesta».' } };
    }

    const nome = testo(c.nome, 80);
    const cognome = testo(c.cognome, 80);
    const azienda = testo(c.azienda, 200);
    const email = testo(c.email, 200).toLowerCase();
    const telefono = testo(c.telefono, 40);
    const messaggio = testoLungo(c.messaggio);
    if (!nome) return { stato: 400, corpo: { ok: false, campo: 'nome', msg: 'Scrivi il tuo nome.' } };
    if (!cognome) return { stato: 400, corpo: { ok: false, campo: 'cognome', msg: 'Scrivi il tuo cognome.' } };
    if (!azienda) return { stato: 400, corpo: { ok: false, campo: 'azienda', msg: 'Indica l\'azienda o lo studio.' } };
    if (!indirizzoValido(email)) return { stato: 400, corpo: { ok: false, campo: 'email', msg: 'L\'indirizzo email non sembra valido: controllalo, è quello a cui ti rispondiamo.' } };
    // il telefono e' facoltativo, ma se c'e' deve essere un numero
    if (telefono && telefono.replace(/[^0-9]/g, '').length < 6) return { stato: 400, corpo: { ok: false, campo: 'telefono', msg: 'Il numero di telefono non sembra completo.' } };
    if (messaggio.length > MAX_MESSAGGIO) return { stato: 400, corpo: { ok: false, campo: 'messaggio', msg: 'Il messaggio è troppo lungo: al massimo ' + MAX_MESSAGGIO + ' caratteri.' } };
    if (consenso(c.privacy) !== true) return { stato: 400, corpo: { ok: false, campo: 'privacy', msg: 'Per inviare la richiesta serve il consenso al trattamento dei dati personali.' } };

    // la casella "non sono un robot", dopo i controlli dei campi: il gettone vale una volta sola
    const cap = await CAPTCHA.verifica(c.captcha, (opz && opz.ip) || '', { azione: 'richiesta-bando' });
    if (!cap.ok) {
        return {
            stato: 400, corpo: {
                ok: false, captchaKo: true,
                msg: cap.motivo === 'servizio'
                    ? 'Non riusciamo a controllare la casella «Non sono un robot»: riprova fra qualche secondo.'
                    : 'Conferma la casella «Non sono un robot», poi invia di nuovo la richiesta.'
            }
        };
    }

    try {
        if (!await prenotaDelGiorno(db, email)) {
            return { stato: 429, corpo: { ok: false, msg: 'Da questo indirizzo oggi abbiamo già ricevuto diverse richieste: ti ricontattiamo al più presto. Se è urgente scrivi a info@nextgenerationbusiness.it.' } };
        }
    } catch (e) {
        // il contatore non si legge: meglio una richiesta in piu' che una persa
        console.error('Richiesta bando: contatore non letto:', String((e && e.message) || e).slice(0, 200));
    }

    const r = {
        quando: Date.now(),
        nome: nome, cognome: cognome, azienda: azienda, email: email, telefono: telefono,
        sede: testo(c.sede, 80),
        bando: idBando(c.bando), bandoTitolo: testo(c.bandoTitolo, 200),
        bandoRegione: testo(c.bandoRegione, 80), bandoTipologia: testo(c.bandoTipologia, 200),
        messaggio: messaggio,
        privacy: true, marketing: consenso(c.marketing) === true,
        origine: 'bandi'
    };

    // 1) in archivio, sempre e per primo
    const id = new Date(r.quando).toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomBytes(4).toString('hex');
    const rif = db.collection('richiesteBandi').doc(id);
    try {
        await rif.set(r);
    } catch (e) {
        console.error('Richiesta bando non registrata:', String((e && e.message) || e).slice(0, 200));
        return { stato: 500, corpo: { ok: false, msg: 'Non siamo riusciti a registrare la richiesta: riprova fra poco, oppure scrivi a info@nextgenerationbusiness.it.' } };
    }

    // 2) le mail: se non partono, la richiesta e' comunque salva
    const a = destinatari();
    let avvisati = 0, confermato = false;
    const trans = trasporto();
    const interna = mailInterna(r);
    try {
        await trans.sendMail({
            from: mittente(), to: a.join(', '),
            // "Rispondi" scrive alla persona: e' il gesto di chi la legge
            replyTo: email,
            subject: interna.oggetto, html: interna.html, text: interna.testo
        });
        avvisati = a.length;
    } catch (e) {
        console.error('Richiesta bando, avviso interno non partito:', String((e && e.message) || e).slice(0, 200));
    }
    const ricevuta = mailRicevuta(r);
    try {
        await trans.sendMail({
            from: mittente(), to: email,
            // chi risponde alla ricevuta scrive a chi segue i bandi, non a noreply
            replyTo: a.join(', '),
            subject: ricevuta.oggetto, html: ricevuta.html, text: ricevuta.testo
        });
        confermato = true;
    } catch (e) {
        console.error('Richiesta bando, ricevuta non partita:', String((e && e.message) || e).slice(0, 200));
    }
    try { trans.close(); } catch (_) { /* niente da chiudere */ }

    try { await rif.set({ avvisati: avvisati, confermato: confermato }, { merge: true }); }
    catch (_) { /* dato di servizio */ }

    return { stato: 200, corpo: { ok: true } };
}

module.exports = { ricevi, destinatari, mailInterna, mailRicevuta, DESTINATARI_PREDEFINITI, MAX_AL_GIORNO };
