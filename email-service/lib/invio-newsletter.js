/* ============================================================
   Il motore di invio della newsletter
   ------------------------------------------------------------
   Perche' un file a parte: fino a ieri tutto questo stava dentro
   api/invia-newsletter.js, cioe' dentro un endpoint HTTP. Ma un
   invio PROGRAMMATO parte da un lavoro automatico, che non ha un
   idToken da verificare ne' un utente a cui contare i gettoni:
   chiamare l'endpoint dall'interno sarebbe stato un giro assurdo,
   e ricopiarne il contenuto avrebbe prodotto due motori destinati
   a divergere al primo ritocco.

   Qui dentro non si sa niente di req, res, sessioni e permessi:
   c'e' solo "manda questo contenuto a questi destinatari e dimmi
   com'e' andata". I controlli su CHI puo' inviare restano
   nell'endpoint, dove devono stare.

   Le due strade (Brevo e la casella SMTP di ripiego) e tutte le
   protezioni sono quelle di prima, spostate senza cambiarle.
   ============================================================ */

const crypto = require('crypto');
const nodemailer = require('nodemailer');
const N = require('./newsletter');

const SEGNAPOSTO = '{{DISISCRIVITI}}';

function trasporto() {
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 465,
        secure: (Number(process.env.SMTP_PORT) || 465) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        // una sola connessione riusata per tutto il lotto: piu' veloce e piu' gentile col server
        pool: true, maxConnections: 1, maxMessages: 100
    });
}

/* Quanti destinatari per chiamata. Con Brevo si manda tutto il lotto in UNA
   richiesta (una "versione" per persona), quindi il numero puo' essere alto;
   con la casella SMTP invece si spedisce una mail per volta e 20 e' quanto
   sta comodamente nel tempo della funzione. */
const MAX_LOTTO_BREVO = 200;
const MAX_LOTTO_SMTP = 20;
function maxLotto() { return N.brevoAttivo() ? MAX_LOTTO_BREVO : MAX_LOTTO_SMTP; }

/* --- dal nostro formato a quello di Brevo ---
   Brevo sostituisce i segnaposto scritti {{params.nome}}. Noi nel corpo
   abbiamo {{DISISCRIVITI}} e le variabili {nome} {cognome}...: si convertono,
   cosi' l'HTML viaggia UNA volta sola e cambia solo la manciata di valori di
   ciascun destinatario. Le graffe doppie eventualmente scritte da chi compone
   vengono neutralizzate prima, altrimenti Brevo proverebbe a interpretarle. */
const VARIABILI = ['nome_completo', 'nome', 'cognome', 'azienda', 'email'];
function perBrevo(testo) {
    /* Sentinella interna: deve essere qualcosa che NESSUNO possa scrivere per
       sbaglio nel testo della newsletter, altrimenti gliela sostituiremmo con il
       collegamento di disiscrizione. Si COSTRUISCE invece di scriverla nel
       sorgente: messa li come carattere, rende il file binario e un editor
       distratto puo trasformarla in uno spazio, che invece si puo digitare. */
    const NULLO = String.fromCharCode(0);
    const SEGNO = NULLO + 'DISISCRIVITI' + NULLO;
    let s = String(testo == null ? '' : testo).split(SEGNAPOSTO).join(SEGNO);
    s = s.replace(/\{\{/g, '&#123;&#123;').replace(/\}\}/g, '&#125;&#125;');
    s = s.split(SEGNO).join('{{params.disiscriviti}}');
    VARIABILI.forEach(v => { s = s.split('{' + v + '}').join('{{params.' + v + '}}'); });
    return s;
}
function perBrevoSemplice(testo) {
    let s = String(testo == null ? '' : testo).split(SEGNAPOSTO).join('{{params.disiscriviti}}');
    VARIABILI.forEach(v => { s = s.split('{' + v + '}').join('{{params.' + v + '}}'); });
    return s;
}

/* Chiave di non ripetizione: la stessa identica richiesta rimandata entro
   mezz'ora non fa partire le mail due volte. Ci deve entrare anche il
   CONTENUTO, non solo chi lo riceve: altrimenti una prova corretta dopo un
   refuso verrebbe scartata come doppione e non partirebbe niente. */
function chiaveNonRipetere(campagna, destinatari, contenuto) {
    const impronta = crypto.createHash('sha256')
        .update(String(campagna || '') + '\n' + String(contenuto || '') + '\n'
            + destinatari.map(d => d.email).sort().join(','))
        .digest('hex');
    return impronta.slice(0, 8) + '-' + impronta.slice(8, 12) + '-4' + impronta.slice(13, 16)
        + '-a' + impronta.slice(17, 20) + '-' + impronta.slice(20, 32);
}

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function applicaVariabili(s, d, escapa) {
    d = d || {};
    const v = x => escapa ? esc(x || '') : String(x || '');
    const nc = (d.nome && d.cognome) ? (d.nome + ' ' + d.cognome) : (d.nome || d.cognome || '');
    return String(s == null ? '' : s)
        .replace(/\{nome_completo\}/g, () => v(nc))
        .replace(/\{nome\}/g, () => v(d.nome))
        .replace(/\{cognome\}/g, () => v(d.cognome))
        .replace(/\{azienda\}/g, () => v(d.azienda))
        .replace(/\{email\}/g, () => v(d.email));
}

/* Elenco ripulito: indirizzi validi, minuscoli, senza doppioni, campi accorciati.
   Serve sia all'endpoint sia a chi programma, quindi sta qui e non in due posti. */
function normalizzaDestinatari(grezzi) {
    const perEmail = {};
    (Array.isArray(grezzi) ? grezzi : []).forEach(d => {
        const o = (d && typeof d === 'object') ? d : { email: d };
        const email = String(o.email || '').trim().toLowerCase();
        if (!N.EMAIL_RE.test(email) || perEmail[email]) return;
        perEmail[email] = {
            email: email,
            nome: String(o.nome || '').slice(0, 80),
            cognome: String(o.cognome || '').slice(0, 80),
            azienda: String(o.azienda || '').slice(0, 120)
        };
    });
    return Object.keys(perEmail).map(k => perEmail[k]);
}

/* Impronta breve e non reversibile di un indirizzo. Copia letterale di quella
   dell'area riservata (improntaEmail): le due DEVONO dare lo stesso risultato,
   altrimenti gli elenchi di chi e' gia' stato servito non combaciano piu'. */
function improntaEmail(email) {
    const s = String(email == null ? '' : email).trim().toLowerCase();
    let a = 0x811c9dc5, b = 0x9e3779b9;
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        a = ((a ^ c) >>> 0) * 0x01000193 >>> 0;
        b = (((b + c * (i + 1)) >>> 0) ^ ((b << 5) >>> 0)) >>> 0;
    }
    return (a >>> 0).toString(36) + (b >>> 0).toString(36);
}

/* ============================================================
   inviaLotto: manda UN lotto e racconta com'e' andata.
   Non lancia eccezioni per gli errori previsti: restituisce
   sempre un oggetto, cosi' chi chiama (endpoint o lavoro
   programmato) decide da solo che farne.
   ============================================================ */
/* I controlli che si possono fare SENZA spedire niente. Stanno a parte perche'
   l'endpoint deve poterli fare PRIMA di consumare il gettone di chi invia:
   altrimenti una richiesta malformata brucia un gettone e chi corregge l'errore
   si ritrova bloccato per qualche secondo senza capire perche'. */
function verificaLotto(opz) {
    opz = opz || {};
    const html = String(opz.html || '');
    const destinatari = normalizzaDestinatari(opz.destinatari);
    if (!html) return { ok: false, stato: 400, msg: 'Contenuto mancante.', rimasti: destinatari };
    if (html.indexOf(SEGNAPOSTO) < 0) {
        // senza collegamento di disiscrizione la mail non parte: e' un obbligo, non un dettaglio
        return { ok: false, stato: 400, msg: 'La newsletter non contiene il collegamento per disiscriversi: non puo essere inviata.', rimasti: destinatari };
    }
    if (!destinatari.length) return { ok: false, stato: 400, msg: 'Nessun destinatario valido.', rimasti: [] };
    if (destinatari.length > maxLotto()) {
        return { ok: false, stato: 400, msg: 'Lotto troppo grande (massimo ' + maxLotto() + ' destinatari per volta).', rimasti: destinatari };
    }
    return { ok: true, destinatari: destinatari };
}

async function inviaLotto(opz) {
    opz = opz || {};
    const controllo = verificaLotto(opz);
    if (!controllo.ok) return controllo;
    const destinatari = controllo.destinatari;
    const oggetto = String(opz.oggetto || '').slice(0, 300);
    const html = String(opz.html || '');
    const testoSemplice = String(opz.testo || '');
    const campagna = String(opz.campagna || '').slice(0, 60);
    const invio = String(opz.invio || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60);
    const sandbox = opz.sandbox === true;
    const scadenza = Number(opz.scadenza) || (Date.now() + 45000);

    /* Ultimo controllo sulle disiscrizioni, fatto QUI e non da chi chiama: vale
       quello del server al momento della spedizione, non l'elenco che qualcuno
       aveva a video. E' la difesa piu' importante di tutto il meccanismo, e per
       un invio programmato lo e' ancora di piu': fra la programmazione e la
       partenza possono passare giorni. */
    const fuori = opz.saltaDisiscritti === true ? {} : await N.disiscritti(N.admin.firestore());

    const fromEmail = process.env.NEWSLETTER_FROM_EMAIL || process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
    const fromName = String(opz.mittenteNome || process.env.NEWSLETTER_FROM_NAME || process.env.SMTP_FROM_NAME || 'Revilaw S.p.A.').replace(/[\r\n]/g, ' ').slice(0, 80);
    // forma a oggetto: la citazione la fa nodemailer. Componendo la stringa a mano,
    // un nome con virgolette dentro potrebbe aggiungere un secondo indirizzo al From.
    const from = { name: fromName, address: fromEmail };
    const rispostaA = process.env.NEWSLETTER_REPLY_TO || fromEmail || opz.rispostaA;

    /* ---------- strada 1: Brevo ----------
       Tutto il lotto in UNA richiesta: una "versione" per destinatario, con il
       suo collegamento di disiscrizione nei parametri. Brevo risponde accettato
       o rifiutato per l'INTERA richiesta: non esiste l'esito per singolo
       destinatario, e rimbalzi e blocchi si leggono dopo, in aggregato. */
    if (N.brevoAttivo()) {
        const vivi = [], saltatiB = [];
        destinatari.forEach(d => {
            if (fuori[d.email]) saltatiB.push({ email: d.email, motivo: 'disiscritto' });
            else vivi.push(d);
        });
        if (!vivi.length) return { ok: true, inviati: 0, saltati: saltatiB, falliti: [], rimasti: [], trasporto: 'brevo' };

        const versioni = vivi.map(d => ({
            to: [{ email: d.email, name: ((d.nome || '') + ' ' + (d.cognome || '')).trim() || undefined }],
            params: {
                disiscriviti: N.linkDisiscrizione(d.email, campagna),
                nome: d.nome || '', cognome: d.cognome || '',
                nome_completo: ((d.nome || '') + ' ' + (d.cognome || '')).trim(),
                azienda: d.azienda || '', email: d.email
            }
        }));
        const corpo = {
            sender: { name: fromName, email: fromEmail },
            replyTo: { email: rispostaA },
            subject: perBrevoSemplice(oggetto) || '(senza oggetto)',
            htmlContent: perBrevo(html),
            messageVersions: versioni,
            tags: ['newsletter'].concat(campagna ? [campagna] : []).concat(invio ? [invio] : []),
            headers: {
                idempotencyKey: chiaveNonRipetere(campagna, destinatari,
                    oggetto + '\n' + html + '\n' + testoSemplice + '\n' + (sandbox ? 'prova' : ''))
            }
        };
        if (testoSemplice) corpo.textContent = perBrevoSemplice(testoSemplice);

        const r = await N.chiamataBrevo('/smtp/email', { metodo: 'POST', corpo: corpo, sandbox: sandbox });
        if (r.ok) return { ok: true, inviati: vivi.length, saltati: saltatiB, falliti: [], rimasti: [], trasporto: 'brevo' };
        // stesso lotto gia' accettato poco fa: NON e' un errore, e' la protezione che ha funzionato
        if (r.dati && r.dati.code === 'duplicate_parameter') {
            console.warn('Newsletter: lotto gia accettato da Brevo (chiave di non ripetizione).');
            return { ok: true, inviati: vivi.length, saltati: saltatiB, falliti: [], rimasti: [], trasporto: 'brevo', giaAccettato: true };
        }
        const motivo = (r.dati && (r.dati.message || r.dati.code)) || ('errore ' + r.stato);
        console.error('Newsletter: Brevo ha rifiutato il lotto:', r.stato, String(motivo).slice(0, 200));
        return {
            ok: false, stato: 502, trasporto: 'brevo',
            msg: r.stato === 401 ? 'Chiave Brevo non valida o scaduta.'
                : (r.stato === 402 ? 'Crediti Brevo esauriti: controlla il piano.'
                    : 'Brevo ha rifiutato l\'invio: ' + String(motivo).slice(0, 160)),
            saltati: saltatiB, falliti: [], rimasti: vivi
        };
    }

    /* ---------- strada 2: la casella SMTP ----------
       Ripiego finche' la chiave Brevo non e' configurata. Una mail per volta,
       con un budget di tempo: si esce sempre con i conti in mano, e gli
       indirizzi non trattati tornano in "rimasti" invece di andare persi. */
    const trans = trasporto();
    let inviati = 0;
    const saltati = [], falliti = [], rimasti = [];
    for (const d of destinatari) {
        if (Date.now() > scadenza) { rimasti.push(d); continue; }
        if (fuori[d.email]) { saltati.push({ email: d.email, motivo: 'disiscritto' }); continue; }
        const link = N.linkDisiscrizione(d.email, campagna);
        const unClic = N.linkUnClic(d.email, campagna);
        const corpoHtml = applicaVariabili(html, d, true).split(SEGNAPOSTO).join(esc(link));
        const corpoTesto = applicaVariabili(testoSemplice, d, false).split(SEGNAPOSTO).join(link);
        const ogg = applicaVariabili(oggetto, d, false).trim() || '(senza oggetto)';
        try {
            await trans.sendMail({
                from: from, replyTo: rispostaA, to: d.email,
                subject: ogg, text: corpoTesto || undefined, html: corpoHtml,
                headers: {
                    'List-Unsubscribe': '<' + unClic + '>, <mailto:' + fromEmail + '?subject=Disiscrizione%20newsletter>',
                    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
                    'Precedence': 'bulk',
                    'Auto-Submitted': 'auto-generated'
                }
            });
            inviati++;
        } catch (e) {
            const motivo = String((e && e.message) || 'errore sconosciuto').slice(0, 200);
            console.error('Newsletter a', d.email, 'non inviata:', motivo);
            falliti.push({ email: d.email, motivo: motivo });
        }
    }
    try { trans.close(); } catch (_) { }

    if (!inviati && falliti.length) {
        return {
            ok: false, stato: 502, msg: 'Nessuna mail inviata (errore del server di posta).',
            falliti: falliti.slice(0, 100), saltati: saltati,
            rimasti: rimasti.concat(falliti.map(f => ({ email: f.email }))), trasporto: 'smtp'
        };
    }
    return { ok: true, inviati: inviati, saltati: saltati, falliti: falliti.slice(0, 100), rimasti: rimasti, trasporto: 'smtp' };
}

module.exports = {
    inviaLotto, verificaLotto, normalizzaDestinatari, improntaEmail,
    maxLotto, MAX_LOTTO_BREVO, MAX_LOTTO_SMTP, SEGNAPOSTO,
    // esportate per le prove: sono le parti con piu' trappole
    perBrevo, perBrevoSemplice, chiaveNonRipetere, applicaVariabili
};
