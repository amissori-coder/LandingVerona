/* ============================================================
   La newsletter dei bandi
   ------------------------------------------------------------
   Chi visita /bandi/ puo' chiedere di ricevere per email i bandi
   nuovi. Ogni volta che sul sito compaiono schede nuove, parte da
   sola una mail con le loro sintesi a tutti gli iscritti.

   L'ISCRIZIONE, CON LA CONFERMA (doppio consenso). Il modulo della
   pagina (azione 'bandi-newsletter' di api/iscrizione-nuova.js)
   salva la scheda in `bandiNewsletter` con stato 'attesa' e manda
   una mail con il pulsante "Conferma l'iscrizione". Finche' la
   persona non lo tocca non riceve niente: cosi' nessuno puo'
   iscrivere l'indirizzo di un altro. Il pulsante apre
   /bandi/newsletter/, che conferma con una POST (azione
   'bandi-newsletter-conferma') e non aprendosi: gli antispam
   aziendali visitano ogni collegamento della mail, ma non eseguono
   lo script della pagina (lo stesso ragionamento di
   lib/conferma-email.js). Il collegamento porta la scheda e il
   momento della richiesta, firmati (lib/newsletter.js): vale trenta
   giorni, e non riporta dentro chi nel frattempo si e' disiscritto.
   A chi e' gia' iscritto non si manda la conferma ma una mail che
   glielo dice; la risposta al modulo e' la stessa nei due casi, e
   non fa sapere a chi compila se un indirizzo e' iscritto.

   LA DISISCRIZIONE tocca solo i bandi. In fondo a ogni
   aggiornamento c'e' un collegamento personale firmato (contesto
   suo: non toglie nessuno dalla newsletter dello studio) che apre
   /bandi/newsletter/; l'"un clic" dei programmi di posta passa da
   api/disiscrizione.js con l=bandi. La scheda resta, con stato
   'disiscritta': e' la traccia della volonta' espressa.
   Chi ha chiesto di non ricevere piu' NULLA dalla newsletter dello
   studio (newsletterDisiscritti, dove finiscono anche i bloccati di
   Brevo) e' saltato se quella richiesta e' PIU' RECENTE della sua
   conferma ai bandi: vale l'ultima cosa che ha detto.

   L'AGGIORNAMENTO AUTOMATICO (giro, chiamato da
   api/newsletter-bandi.js ogni quarto d'ora). I bandi stanno nel
   sito (bandi/dati.js), non qui: il giro legge il file PUBBLICATO
   (lib/dati-bandi.js lo legge senza eseguirlo) e lo confronta con
   l'elenco dei bandi gia' annunciati, su meta/bandiNewsletter.
     - La prima volta non manda niente: segna come gia' annunciati
       i bandi che ci sono, e da li' in poi conta solo quelli nuovi.
     - Un bando nuovo non parte subito: si aspetta UN'ORA senza
       altri bandi nuovi, perche' chi ne carica tre li carica uno
       dopo l'altro, e ai lettori arriva una mail sola con tutti e
       tre. Al massimo sei ore dal primo, anche se se ne
       aggiungono altri.
     - Si spedisce solo di giorno, dalle 8 alle 20 ora italiana: un
       bando pubblicato la sera arriva la mattina dopo.
     - Non si annunciano i bandi gia' chiusi, e non contano le
       correzioni: un bando gia' annunciato non riparte se cambia
       il testo. Per riannunciare un bando serve un identificativo
       nuovo (per esempio una nuova edizione).
   Quando e' ora si crea un GIRO in `bandiNewsletterGiri`, con il
   contenuto della mail gia' composto, e nella stessa transazione i
   suoi bandi passano fra gli annunciati: due giri non possono
   annunciare lo stesso bando.

   LA SPEDIZIONE passa dal motore della newsletter dello studio
   (lib/invio-newsletter.js: Brevo, o la casella SMTP di ripiego), a
   lotti, con i collegamenti di disiscrizione dei bandi. Gli iscritti
   si leggono in ordine di scheda, e sul giro resta il segno
   dell'ultima servita: un giro interrotto riprende da li' al quarto
   d'ora dopo. Le regole contro le copie doppie sono quelle di
   lib/giro-newsletter.js:
     - un giro alla volta, con un lucchetto su meta/bandiNewsletter;
     - un lotto il cui esito non si conosce (la funzione e' morta
       dopo averlo consegnato e prima di scriverlo) NON si ritenta:
       si conta fra gli incerti e si va avanti. Una copia in meno e'
       meglio di una in piu';
     - si scrive dopo ogni lotto, non alla fine.
   Finito il giro, chi segue i bandi (BANDI_DESTINATARI, o i due
   indirizzi predefiniti di lib/richieste-bandi.js) riceve un
   resoconto: quali bandi, a quanti iscritti. Se Brevo rifiuta otto
   volte di fila il giro si ferma (stato 'fermo') e lo si dice a
   loro, con il modo per farlo ripartire.
   ============================================================ */

'use strict';

const crypto = require('crypto');
const nodemailer = require('nodemailer');
const N = require('./newsletter');
const M = require('./invio-newsletter');
const DATI = require('./dati-bandi');
const CAPTCHA = require('./captcha');
const { avvolgi, senzaTrattiniLunghi } = require('./mail-layout');

const COLL = 'bandiNewsletter';
const COLL_GIRI = 'bandiNewsletterGiri';
const COLL_LIMITI = 'bandiNewsletterLimiti';
function rifMeta(db) { return db.collection('meta').doc('bandiNewsletter'); }

// il modulo
const MIN_MS = 3000;                                   // spedito prima: e' un programma, o il browser che rimette i campi
const MAX_MAIL_GIORNO = 3;                             // mail di conferma (o "sei gia' iscritto") per indirizzo al giorno
const VALIDITA_CONFERMA_MS = 30 * 24 * 60 * 60 * 1000;
const VERSIONE_CONSENSO = 'bandi-newsletter-1';        // il testo e' nel README, "Newsletter dei bandi"
// il giro
const QUIETE_MS = 60 * 60 * 1000;                      // un'ora senza bandi nuovi prima di spedire
const ATTESA_MASSIMA_MS = 6 * 60 * 60 * 1000;          // ma non piu' di sei ore dal primo
const FINESTRA_DALLE = 8;                              // ora italiana, compresa
const FINESTRA_ALLE = 20;                              // ora italiana, esclusa
/* Il tempo di lavoro deve stare dentro il maxDuration della funzione (300 s
   in vercel.json), con margine per l'ultimo lotto (fino a 25 s di Brevo) e
   per i conti. Se si cambia l'uno va cambiato l'altro. */
const BUDGET_MS = 230 * 1000;
const LUCCHETTO_MS = 6 * 60 * 1000;                    // piu' lungo della funzione
const PAUSA_LOTTI_MS = 2500;
const MAX_ERRORI = 8;

const attendi = ms => new Promise(r => setTimeout(r, ms));

function testo(v, max) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 200);
}
function esc(x) {
    return String(x == null ? '' : x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
}
/* Per i testi dei bandi dentro l'aggiornamento: le graffe diventano entita',
   perche' il motore di invio legge {nome}, {email}... come segnaposto. */
function escM(x) {
    return esc(x).replace(/\{/g, '&#123;').replace(/\}/g, '&#125;');
}
function senzaGraffe(x) {
    return String(x == null ? '' : x).replace(/\{/g, '(').replace(/\}/g, ')');
}
function motivo(e) {
    return String((e && e.message) || e || 'errore').slice(0, 200);
}
// true, false, oppure null se il campo non c'e' (come nei moduli del sito)
function consenso(v) {
    if (v === true || v === false) return v;
    if (v == null) return null;
    const s = String(v).trim().normalize('NFD').replace(/\p{M}/gu, '');
    return s ? /^(si|s|true|vero|1|x|yes|on)$/i.test(s) : null;
}
function giornoItaliano(ms) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}
function oraItaliana(ms) {
    const h = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', hour12: false }).format(new Date(ms));
    return Number(h) % 24;
}
function inFinestra(ms) {
    const h = oraItaliana(ms);
    return h >= FINESTRA_DALLE && h < FINESTRA_ALLE;
}
/* La scheda dell'iscritto: un'impronta dell'indirizzo, cosi' un indirizzo ha
   una scheda sola e il suo nome non compare fra gli identificativi. */
function idIscritto(email) {
    return 'b' + crypto.createHash('sha256').update('bandi-newsletter|' + String(email || '').trim().toLowerCase()).digest('hex').slice(0, 39);
}
/* Il nome si ripete nelle mail solo se sembra un nome: lettere, apostrofi e
   trattini, due parole al massimo. Chi scrive l'indirizzo di un altro non
   deve poter usare il nostro modulo per fargli arrivare un testo qualsiasi. */
function nomeDaSalutare(nome) {
    const n = String(nome || '').trim().replace(/\s+/g, ' ');
    return n.length <= 30 && /^[\p{L}][\p{L}'-]*( [\p{L}][\p{L}'-]*)?$/u.test(n) ? n : '';
}

/* --- la posta di servizio (conferma, "sei gia' iscritto", resoconti) ---
   Dalla casella delle mail di servizio, come le conferme delle iscrizioni:
   l'aggiornamento sui bandi invece passa dal motore della newsletter. */
function postaConfigurata() {
    return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
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
    return {
        name: String(process.env.SMTP_FROM_NAME || 'Revilaw S.p.A.').replace(/[\r\n]/g, ' ').slice(0, 80),
        address: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER
    };
}
async function spedisciServizio(msg) {
    if (!postaConfigurata()) return { ok: false, errore: 'posta non configurata' };
    const t = trasporto();
    try {
        await t.sendMail(Object.assign({ from: mittente() }, msg));
        return { ok: true };
    } catch (e) {
        return { ok: false, errore: motivo(e) };
    } finally {
        try { t.close(); } catch (_) { /* niente da chiudere */ }
    }
}
// chi segue i bandi: gli stessi indirizzi delle richieste di informazioni
function staffBandi() {
    return require('./richieste-bandi').destinatari();
}

/* ============================================================
   Le mail
   ============================================================ */
function pulsante(href, etichetta) {
    return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 18px;"><tr>'
        + '<td style="background-color:#164068;border-radius:6px;">'
        + '<a href="' + esc(href) + '" style="display:inline-block;padding:12px 22px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;">' + esc(etichetta) + '</a>'
        + '</td></tr></table>';
}
function paragrafo(t, stile) {
    return '<p style="margin:0 0 14px;' + (stile || '') + '">' + t + '</p>';
}

function mailConferma(link, nome) {
    const n = nomeDaSalutare(nome);
    const righe = [
        'Buongiorno' + (n ? ' ' + n : '') + ',',
        'per ricevere via email i nuovi bandi pubblicati nell\'area Bandi e agevolazioni di Next Generation Business, conferma il tuo indirizzo:',
        'Il pulsante vale trenta giorni. Se non hai chiesto tu l\'iscrizione, ignora questa email: senza conferma non ti scriveremo.'
    ];
    const html = paragrafo(esc(righe[0])) + paragrafo(esc(righe[1]))
        + pulsante(link, 'Conferma l\'iscrizione')
        + paragrafo(esc(righe[2]), 'font-size:13px;color:#475569;');
    return {
        oggetto: 'Conferma l\'iscrizione agli aggiornamenti sui bandi',
        html: avvolgi(html),
        testo: [righe[0], righe[1], link, righe[2]].join('\n\n')
    };
}

function mailGiaIscritto(linkDisiscrizione, nome) {
    const n = nomeDaSalutare(nome);
    const righe = [
        'Buongiorno' + (n ? ' ' + n : '') + ',',
        'abbiamo ricevuto una nuova richiesta di iscrizione agli aggiornamenti sui bandi per questo indirizzo, che risulta già iscritto: non devi fare altro, continuerai a ricevere i nuovi bandi.',
        'Se invece non vuoi più riceverli, disiscriviti da qui:'
    ];
    const html = paragrafo(esc(righe[0])) + paragrafo(esc(righe[1]))
        + paragrafo(esc('Se invece non vuoi più riceverli, ') + '<a href="' + esc(linkDisiscrizione) + '" style="color:#164068;">disiscriviti da qui</a>.', 'font-size:13px;color:#475569;');
    return {
        oggetto: 'Sei già iscritto agli aggiornamenti sui bandi',
        html: avvolgi(html),
        testo: [righe[0], righe[1], righe[2] + ' ' + linkDisiscrizione].join('\n\n')
    };
}

// i bandi nella mail: prima i nazionali, poi le regioni in ordine alfabetico
function ordina(bandi) {
    return bandi.slice().sort((a, b) => {
        const na = a.regione === 'Nazionale', nb = b.regione === 'Nazionale';
        if (na !== nb) return na ? -1 : 1;
        return a.regione.localeCompare(b.regione, 'it') || a.titolo.localeCompare(b.titolo, 'it');
    });
}

/* Nelle schede dei bandi niente sillabazione: il testo e' allineato a
   sinistra, e mail-layout.js la accende su ogni div (servirebbe al giustificato). */
const SENZA_SILLABE = '-webkit-hyphens:manual;hyphens:manual;';

function rigaDato(nome, valore) {
    if (!valore) return '';
    return '<tr><td style="padding:3px 12px 3px 0;vertical-align:top;white-space:nowrap;font-size:11px;font-weight:bold;letter-spacing:.8px;text-transform:uppercase;color:#5A6270;text-align:left;' + SENZA_SILLABE + '">' + esc(nome) + '</td>'
        + '<td style="padding:3px 0;vertical-align:top;font-size:13px;line-height:1.45;font-weight:bold;color:#1E293B;text-align:left;' + SENZA_SILLABE + '">' + escM(valore) + '</td></tr>';
}

function bloccoBando(b, etichette) {
    const base = N.BASE;
    const scheda = base + '/bandi/#' + b.id;
    const pdf = b.pdf ? base + '/bandi/schede/' + encodeURIComponent(b.pdf) : '';
    const info = base + '/bandi/?bando=' + encodeURIComponent(b.id) + '#richiesta';
    const luogo = b.regione === 'Nazionale' ? 'Bando nazionale' : b.regione;
    const tipologie = b.tipologie.map(t => (etichette.tipologie || {})[t] || t).join(', ');
    const link = (href, t) => '<a href="' + esc(href) + '" style="color:#164068;font-weight:bold;text-decoration:underline;">' + esc(t) + '</a>';
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;border:1px solid #E2E8F0;border-radius:8px;">'
        + '<tr><td style="padding:16px 18px;text-align:left;' + SENZA_SILLABE + '">'
        + '<div style="margin:0 0 8px;font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#2A5A85;text-align:left;' + SENZA_SILLABE + '">' + escM(luogo)
        + (b.revisore ? '&nbsp; <span style="display:inline-block;padding:2px 9px;border-radius:10px;background-color:#E6C870;color:#0A2844;letter-spacing:.6px;">Certificazione del revisore</span>' : '')
        + '</div>'
        + '<div style="margin:0 0 4px;font-size:17px;font-weight:bold;line-height:1.3;text-align:left;' + SENZA_SILLABE + '"><a href="' + esc(scheda) + '" style="color:#0A2844;text-decoration:none;">' + escM(b.titolo) + '</a></div>'
        + (b.ente ? '<div style="margin:0 0 10px;font-size:13px;color:#475569;text-align:left;' + SENZA_SILLABE + '">' + escM(b.ente) + '</div>' : '')
        + (b.sintesi ? '<div style="margin:0 0 12px;font-size:14px;line-height:1.55;color:#1E293B;text-align:left;' + SENZA_SILLABE + '">' + escM(b.sintesi) + '</div>' : '')
        + '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;">'
        + rigaDato('Agevolazione', b.importo) + rigaDato('Tipologia', tipologie) + rigaDato('Per chi', b.beneficiari) + rigaDato('Quando', b.scadenza)
        + '</table>'
        + '<div style="font-size:13px;line-height:1.7;text-align:left;' + SENZA_SILLABE + '">'
        + link(scheda, 'Leggi la scheda') + (pdf ? ' &nbsp;·&nbsp; ' + link(pdf, 'Scarica il PDF') : '') + ' &nbsp;·&nbsp; ' + link(info, 'Chiedi informazioni')
        + '</div>'
        + '</td></tr></table>';
}

/* L'aggiornamento: oggetto, HTML con il segnaposto della disiscrizione
   ({{DISISCRIVITI}}, che il motore di invio sostituisce per ciascuno) e
   versione di solo testo. */
function componiAggiornamento(bandi, etichette) {
    etichette = etichette || {};
    const elenco = ordina(bandi);
    const n = elenco.length;
    const titolo = n === 1 ? 'Un nuovo bando per le imprese' : n + ' nuovi bandi per le imprese';
    const oggetto = senzaTrattiniLunghi(n === 1 ? 'Nuovo bando: ' + elenco[0].titolo : n + ' nuovi bandi per le imprese')
        .replace(/[\r\n]+/g, ' ').slice(0, 200);
    const intro = 'abbiamo pubblicato ' + (n === 1 ? 'una nuova scheda' : n + ' nuove schede')
        + ' nell\'area Bandi e agevolazioni di Next Generation Business. Per ogni bando trovi la sintesi, la scheda in PDF e il modulo per chiederci informazioni.';
    const tutti = N.BASE + '/bandi/';
    const html = '<div style="margin:0 0 6px;font-size:11px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;color:#2A5A85;text-align:left;">Bandi e agevolazioni · Next Generation Business</div>'
        + '<h1 style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.25;color:#0A2844;text-align:left;">' + esc(titolo) + '</h1>'
        + paragrafo('Buongiorno,<br>' + esc(intro))
        + elenco.map(b => bloccoBando(b, etichette)).join('')
        + pulsante(tutti, 'Vedi tutti i bandi')
        + '<p style="margin:0;font-size:12px;line-height:1.6;color:#475569;text-align:left;">'
        + 'Le schede sono sintesi a scopo informativo e non sostituiscono il testo ufficiale dei bandi. '
        + 'Ricevi questa email perché ti sei iscritto agli aggiornamenti sui nuovi bandi di Next Generation Business. '
        + '<a href="' + M.SEGNAPOSTO + '" style="color:#475569;">Non voglio più ricevere questi aggiornamenti</a>.</p>';
    const testoMail = [
        titolo.toUpperCase(),
        'Buongiorno,\n' + intro,
        elenco.map(b => [
            '* ' + b.titolo + ' (' + (b.regione === 'Nazionale' ? 'bando nazionale' : b.regione) + ')' + (b.revisore ? ' - Certificazione del revisore' : ''),
            b.sintesi,
            b.importo ? 'Agevolazione: ' + b.importo : '',
            b.scadenza ? 'Quando: ' + b.scadenza : '',
            'Scheda: ' + N.BASE + '/bandi/#' + b.id
        ].filter(Boolean).map(senzaGraffe).join('\n')).join('\n\n'),
        'Tutti i bandi: ' + tutti,
        'Le schede sono sintesi a scopo informativo e non sostituiscono il testo ufficiale dei bandi.\n'
        + 'Per non ricevere più questi aggiornamenti: ' + M.SEGNAPOSTO
    ].join('\n\n');
    return { oggetto: oggetto, html: avvolgi(html), testo: senzaTrattiniLunghi(testoMail) };
}

function mailResoconto(g, conti) {
    const bandi = (g.bandi || []).map(b => b.titolo + (b.regione ? ' (' + b.regione + ')' : ''));
    const righe = [
        ['Bandi annunciati', bandi.join('; ')],
        ['Oggetto della mail', g.oggetto || ''],
        ['Consegnate', String(conti.inviati || 0)],
        ['Saltate', (conti.saltati || 0) + ' (chi ha chiesto di non ricevere più la newsletter dello studio)'],
        ['Non partite', String(conti.falliti || 0)],
        ['Esito incerto', String(conti.incerti || 0)]
    ];
    const brevo = g.trasporto === 'brevo';
    const html = paragrafo('L\'aggiornamento sui nuovi bandi è stato spedito agli iscritti alla newsletter dei bandi.')
        + '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;font-size:14px;">'
        + righe.map(r => '<tr><td style="padding:4px 12px 4px 0;color:#475569;white-space:nowrap;vertical-align:top;text-align:left;">' + esc(r[0]) + '</td><td style="padding:4px 0;font-weight:600;text-align:left;">' + esc(r[1]) + '</td></tr>').join('')
        + '</table>'
        + (brevo ? paragrafo('Le mail sono state consegnate a Brevo per la spedizione: rimbalzi e aperture si vedono nel pannello di Brevo.', 'font-size:13px;color:#475569;') : '');
    return {
        oggetto: 'Newsletter bandi: aggiornamento inviato a ' + (conti.inviati || 0) + ' iscritti',
        html: avvolgi(html),
        testo: righe.map(r => r[0] + ': ' + r[1]).join('\n')
    };
}

function mailFermo(id, g, msg) {
    const html = paragrafo('L\'aggiornamento sui nuovi bandi si è fermato: l\'invio è stato rifiutato ' + MAX_ERRORI + ' volte di fila.')
        + paragrafo('Ultimo errore: <b>' + esc(msg) + '</b>')
        + paragrafo('Bandi del giro: ' + esc((g.bandi || []).map(b => b.titolo).join('; ')))
        + paragrafo('Per farlo ripartire da dove si è fermato, risolto il problema (di solito i crediti o la chiave di Brevo), nel database va rimesso <b>stato: "in-corso"</b> ed <b>errori: 0</b> sul documento <b>' + esc(id) + '</b> della raccolta bandiNewsletterGiri.', 'font-size:13px;color:#475569;');
    return {
        oggetto: 'Newsletter bandi: invio fermo',
        html: avvolgi(html),
        testo: 'L\'aggiornamento sui nuovi bandi si è fermato. Ultimo errore: ' + msg + '. Giro: ' + id
    };
}

/* ============================================================
   L'iscrizione dal modulo (azione 'bandi-newsletter', pubblica)
   ============================================================ */

/* Le mail per indirizzo al giorno, nella giornata italiana. Il nome del
   documento e' un'impronta, e l'indirizzo e' contato nella forma che arriva
   alla stessa casella (lib/domande-sito.js, formaPerContare): lucia+1@... e
   lucia+2@... sono la stessa persona da non sommergere di mail. */
async function prenotaMail(db, email) {
    const DS = require('./domande-sito');
    const rif = db.collection(COLL_LIMITI).doc(crypto.createHash('sha256').update('bandi|' + DS.formaPerContare(email)).digest('hex').slice(0, 40));
    const oggi = giornoItaliano(Date.now());
    return db.runTransaction(async tx => {
        const s = await tx.get(rif);
        const d = s.exists ? (s.data() || {}) : {};
        const quante = d.giorno === oggi ? (Number(d.quante) || 0) : 0;
        if (quante >= MAX_MAIL_GIORNO) return false;
        tx.set(rif, { giorno: oggi, quante: quante + 1 }, { merge: true });
        return true;
    });
}

async function iscrivi(db, corpo, opz) {
    const c = corpo || {};
    // il campo nascosto pieno: a un programma si risponde come a una persona
    if (testo(c.sito, 200)) return { stato: 200, corpo: { ok: true } };
    const ms = Number(c.ms);
    if (!(ms >= MIN_MS)) return { stato: 400, corpo: { ok: false, msg: 'Attendi un attimo e premi di nuovo «Iscriviti».' } };

    const DS = require('./domande-sito');
    const email = testo(c.email, 200).toLowerCase();
    const nome = testo(c.nome, 80);
    if (!DS.indirizzoValido(email)) return { stato: 400, corpo: { ok: false, campo: 'email', msg: 'L\'indirizzo email non sembra valido: controllalo, è quello a cui scriviamo.' } };
    if (consenso(c.privacy) !== true) return { stato: 400, corpo: { ok: false, campo: 'privacy', msg: 'Per iscriverti serve il consenso a ricevere gli aggiornamenti e al trattamento dei dati.' } };

    // la casella "non sono un robot", dopo i controlli dei campi: il gettone vale una volta sola
    const cap = await CAPTCHA.verifica(c.captcha, (opz && opz.ip) || '', { azione: 'bandi-newsletter' });
    if (!cap.ok) {
        return {
            stato: 400, corpo: {
                ok: false, captchaKo: true,
                msg: cap.motivo === 'servizio'
                    ? 'Non riusciamo a controllare la casella «Non sono un robot»: riprova fra qualche secondo.'
                    : 'Conferma la casella «Non sono un robot», poi premi di nuovo «Iscriviti».'
            }
        };
    }

    try {
        if (!await prenotaMail(db, email)) {
            return { stato: 429, corpo: { ok: false, msg: 'Oggi abbiamo già scritto più volte a questo indirizzo: controlla la posta (anche Spam e Promozioni) o riprova domani.' } };
        }
    } catch (e) {
        // il contatore non si legge: meglio una mail in piu' che un'iscrizione persa
        console.error('Newsletter bandi: contatore non letto:', motivo(e));
    }

    const rif = db.collection(COLL).doc(idIscritto(email));
    let prima = {};
    try {
        const s = await rif.get();
        prima = s.exists ? (s.data() || {}) : {};
    } catch (e) {
        console.error('Newsletter bandi: scheda non letta:', motivo(e));
        return { stato: 500, corpo: { ok: false, msg: 'Non siamo riusciti a registrare la richiesta: riprova fra poco.' } };
    }
    const ora = Date.now();
    const rispondiA = staffBandi().join(', ');

    if (prima.stato === 'attiva') {
        const m = mailGiaIscritto(N.linkBandiDisiscrizione(email), nome || prima.nome);
        const r = await spedisciServizio({ to: email, replyTo: rispondiA, subject: m.oggetto, html: m.html, text: m.testo });
        if (!r.ok) console.error('Newsletter bandi, mail "gia\' iscritto" non partita:', r.errore);
        // la stessa risposta di una richiesta nuova: non si dice a chi compila se l'indirizzo e' iscritto
        return { stato: 200, corpo: { ok: true } };
    }

    const scheda = {
        email: email, stato: 'attesa', richiesta: ora, creata: Number(prima.creata) || ora,
        privacy: true, consenso: { versione: VERSIONE_CONSENSO, quando: ora },
        origine: testo(c.origine, 40) || 'bandi'
    };
    if (nome) scheda.nome = nome;
    try {
        await rif.set(scheda, { merge: true });
    } catch (e) {
        console.error('Newsletter bandi: iscrizione non registrata:', motivo(e));
        return { stato: 500, corpo: { ok: false, msg: 'Non siamo riusciti a registrare la richiesta: riprova fra poco.' } };
    }

    const m = mailConferma(N.linkBandiConferma(rif.id, ora), nome);
    const r = await spedisciServizio({ to: email, replyTo: rispondiA, subject: m.oggetto, html: m.html, text: m.testo });
    try { await rif.set({ mailConferma: { quando: ora, ok: r.ok, errore: r.ok ? '' : String(r.errore || '').slice(0, 200) } }, { merge: true }); }
    catch (_) { /* dato di servizio */ }
    if (!r.ok) {
        console.error('Newsletter bandi, mail di conferma non partita:', r.errore);
        return { stato: 502, corpo: { ok: false, msg: 'Non siamo riusciti a mandarti la mail di conferma: riprova fra qualche minuto.' } };
    }
    return { stato: 200, corpo: { ok: true } };
}

/* ============================================================
   La conferma dalla pagina (azione 'bandi-newsletter-conferma')
   ============================================================ */
async function conferma(db, corpo) {
    const c = corpo || {};
    const d = testo(c.d, 80);
    const q = Number(c.q) || 0;
    const t = testo(c.t, 80);
    if (!d || !q || !t) return { stato: 400, corpo: { ok: false, msg: 'Collegamento incompleto.' } };
    if (!N.firmaBandiConfermaValida(d, q, t)) return { stato: 403, corpo: { ok: false, msg: 'Collegamento non valido.' } };
    const rif = db.collection(COLL).doc(d);
    const s = await rif.get();
    if (!s.exists) return { stato: 404, corpo: { ok: false, msg: 'Collegamento non valido.' } };
    const v = s.data() || {};
    if (v.stato === 'attiva') return { stato: 200, corpo: { ok: true, gia: true, email: v.email || '', quando: Number(v.confermata) || 0 } };
    /* Scaduto, oppure precedente a una disiscrizione: in tutti e due i casi
       la volonta' piu' recente e' un'altra, e ci si iscrive di nuovo. */
    if (Date.now() - q > VALIDITA_CONFERMA_MS || (Number(v.disiscritta) || 0) > q) {
        return { stato: 410, corpo: { ok: false, scaduto: true, msg: 'Questo collegamento non è più valido: iscriviti di nuovo dalla pagina dei bandi.' } };
    }
    const ora = Date.now();
    await rif.set({ stato: 'attiva', confermata: ora }, { merge: true });
    return { stato: 200, corpo: { ok: true, email: v.email || '', quando: ora } };
}

/* ============================================================
   Disiscrizione e ripensamento (da api/disiscrizione.js, l=bandi)
   La firma l'ha gia' controllata chi chiama.
   ============================================================ */
async function disiscrivi(db, email, opz) {
    opz = opz || {};
    const rif = db.collection(COLL).doc(idIscritto(email));
    /* Si LEGGE prima di scrivere, come per la newsletter dello studio: il
       collegamento ce l'ha ogni iscritto e non scade, e riaprirlo a
       ripetizione non deve consumare le scritture del database. */
    const s = await rif.get();
    const v = s.exists ? (s.data() || {}) : null;
    if (opz.riattiva) {
        if (!v) return { stato: 404, corpo: { ok: false, msg: 'Non troviamo l\'iscrizione: iscriviti di nuovo dalla pagina dei bandi.' } };
        if (v.stato === 'attiva') return { stato: 200, corpo: { ok: true, stato: 'iscritto' } };
        const ora = Date.now();
        await rif.set({ stato: 'attiva', confermata: ora, riattivata: ora }, { merge: true });
        return { stato: 200, corpo: { ok: true, stato: 'iscritto' } };
    }
    if (!v || v.stato === 'disiscritta') return { stato: 200, corpo: { ok: true, stato: 'disiscritto' } };
    await rif.set({ stato: 'disiscritta', disiscritta: Date.now(), comeDisiscritta: testo(opz.origine, 20) || 'pagina' }, { merge: true });
    return { stato: 200, corpo: { ok: true, stato: 'disiscritto' } };
}

/* ============================================================
   Il giro automatico
   ============================================================ */
async function leggiBandiDalSito(opz) {
    const url = (opz && opz.url) || (N.BASE + '/bandi/dati.js');
    // il numero in coda scavalca la copia della rete di distribuzione: si vuole il file di adesso
    const r = await fetch(url + '?v=' + Date.now(), {
        headers: { 'cache-control': 'no-cache' },
        signal: (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(10000) : undefined
    });
    if (!r.ok) throw new Error('il sito risponde ' + r.status);
    const src = await r.text();
    if (src.length > 2 * 1024 * 1024) throw new Error('il file dei bandi e\' troppo grande');
    return DATI.leggiFile(src);
}

async function prendiLucchetto(db, chi) {
    return db.runTransaction(async tx => {
        const s = await tx.get(rifMeta(db));
        const d = s.exists ? (s.data() || {}) : {};
        if ((Number(d.lucchettoFino) || 0) > Date.now()) return false;
        tx.set(rifMeta(db), { lucchettoFino: Date.now() + LUCCHETTO_MS, lucchettoGiro: chi }, { merge: true });
        return true;
    });
}
/* Si molla solo se e' ancora nostro, e si lascia il battito (`ultimoGiro`):
   Vercel non ritenta i lavori falliti, e senza battito un giro che non
   parte non lo scopre nessuno. `update` e non `set` con merge: il battito si
   sostituisce intero, non si mescola con quello di prima. */
async function mollaLucchetto(db, chi, conti) {
    try {
        await db.runTransaction(async tx => {
            const s = await tx.get(rifMeta(db));
            const d = s.exists ? (s.data() || {}) : {};
            if (d.lucchettoGiro !== chi) return;
            tx.update(rifMeta(db), { lucchettoFino: 0, lucchettoGiro: null, ultimoGiro: { quando: Date.now(), conti: JSON.parse(JSON.stringify(conti || {})) } });
        });
    } catch (e) {
        console.error('Newsletter bandi: lucchetto non mollato (scade da solo):', motivo(e));
    }
}

async function giroInCorso(db) {
    const q = await db.collection(COLL_GIRI).where('stato', '==', 'in-corso').limit(1).get();
    if (q.empty || !q.docs.length) return null;
    return { id: q.docs[0].id, dati: q.docs[0].data() || {} };
}

/* Confronta i bandi del sito con quelli gia' annunciati e decide se e'
   ora di spedire. Restituisce i conti e, se ha creato un giro, il giro. */
async function valuta(db, letti) {
    const rif = rifMeta(db);
    const s = await rif.get();
    const m = s.exists ? (s.data() || {}) : {};
    const ora = Date.now();
    const ids = letti.bandi.map(b => b.id);

    // la prima volta: quello che c'e' e' gia' noto, non si annuncia niente
    if (!Array.isArray(m.annunciati)) {
        // un elenco vuoto non si prende per buono: alla lettura dopo, tutti i bandi sembrerebbero nuovi
        if (!ids.length) return { conti: { attesa: 'elenco vuoto' } };
        await rif.set({ annunciati: ids, seminato: ora, visti: {} }, { merge: true });
        return { conti: { seminati: ids.length } };
    }

    const noti = new Set(m.annunciati);
    const oggi = giornoItaliano(ora);
    const nuovi = letti.bandi.filter(b => !noti.has(b.id) && DATI.statoAl(b, oggi) !== 'chiuso');
    // quando si e' visto per la prima volta ogni bando nuovo (e via quelli spariti nel frattempo)
    const prima = (m.visti && typeof m.visti === 'object') ? m.visti : {};
    const visti = {};
    nuovi.forEach(b => { visti[b.id] = Number(prima[b.id]) || ora; });
    const cambiato = Object.keys(visti).length !== Object.keys(prima).length
        || Object.keys(visti).some(k => Number(prima[k]) !== visti[k]);
    if (cambiato) await rif.update({ visti: visti });

    const conti = { nuovi: nuovi.length };
    if (!nuovi.length) return { conti: conti };
    const tempi = Object.keys(visti).map(k => visti[k]);
    const primo = Math.min.apply(null, tempi);
    const ultimo = Math.max.apply(null, tempi);
    if (ora - ultimo < QUIETE_MS && ora - primo < ATTESA_MASSIMA_MS) { conti.attesa = 'quiete'; return { conti: conti }; }
    if (!inFinestra(ora)) { conti.attesa = 'fuori orario'; return { conti: conti }; }

    const g = await creaGiro(db, nuovi, letti);
    if (g) conti.giroCreato = g.id;
    return { conti: conti, giro: g };
}

/* Il giro nasce nella stessa transazione che mette i suoi bandi fra gli
   annunciati: se due istanze arrivassero qui insieme, la seconda li trova
   gia' annunciati e non crea niente. */
async function creaGiro(db, nuovi, letti) {
    const rif = rifMeta(db);
    const ora = Date.now();
    const id = new Date(ora).toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomBytes(3).toString('hex');
    const rifGiro = db.collection(COLL_GIRI).doc(id);
    return db.runTransaction(async tx => {
        const s = await tx.get(rif);
        const m = s.exists ? (s.data() || {}) : {};
        const annunciati = Array.isArray(m.annunciati) ? m.annunciati.slice() : [];
        const noti = new Set(annunciati);
        const scelti = ordina(nuovi.filter(b => !noti.has(b.id)));
        if (!scelti.length) return null;
        const contenuto = componiAggiornamento(scelti, letti);
        const visti = Object.assign({}, m.visti || {});
        scelti.forEach(b => { delete visti[b.id]; });
        const dati = {
            creato: ora, stato: 'in-corso',
            bandi: scelti.map(b => ({ id: b.id, titolo: b.titolo, regione: b.regione })),
            oggetto: contenuto.oggetto, html: contenuto.html, testo: contenuto.testo,
            campagna: 'bandi-' + giornoItaliano(ora),
            cursore: '', errori: 0,
            conti: { inviati: 0, saltati: 0, falliti: 0, incerti: 0, lotti: 0 }
        };
        tx.set(rifGiro, dati);
        tx.update(rif, { annunciati: annunciati.concat(scelti.map(b => b.id)), visti: visti });
        return { id: id, dati: dati };
    });
}

/* I prossimi iscritti attivi dopo `cursore`, in ordine di scheda. Se manca
   l'indice per l'ordinamento si ripiega: tutti gli attivi, ordinati qui. */
async function prossimiIscritti(db, cursore, n) {
    const coll = db.collection(COLL);
    try {
        let q = coll.where('stato', '==', 'attiva').orderBy(N.admin.firestore.FieldPath.documentId());
        if (cursore) q = q.startAfter(cursore);
        return (await q.limit(n).get()).docs;
    } catch (e) {
        console.warn('Newsletter bandi: iscritti letti senza indice:', motivo(e));
        const snap = await coll.where('stato', '==', 'attiva').get();
        return snap.docs.filter(d => !cursore || d.id > cursore).sort((a, b) => (a.id < b.id ? -1 : (a.id > b.id ? 1 : 0))).slice(0, n);
    }
}

async function spedisci(db, corrente, scadenza, opz) {
    opz = opz || {};
    const id = corrente.id;
    const g = corrente.dati || {};
    const rif = db.collection(COLL_GIRI).doc(id);
    const conti = Object.assign({ inviati: 0, saltati: 0, falliti: 0, incerti: 0, lotti: 0 }, g.conti || {});
    let cursore = String(g.cursore || '');
    let errori = Number(g.errori) || 0;
    const esito = { giro: id };

    /* Un lotto rimasto a meta': la funzione e' morta dopo averlo consegnato e
       prima di scriverlo (si lavora con il lucchetto, quindi non c'e' nessun
       altro). Non si ritenta: si conta fra gli incerti e si va oltre. */
    if (g.lottoInCorso && g.lottoInCorso.ultimo) {
        conti.incerti += Number(g.lottoInCorso.n) || 0;
        cursore = String(g.lottoInCorso.ultimo);
        await rif.update({ cursore: cursore, conti: conti, lottoInCorso: null });
    }

    const fuori = await N.disiscritti(db);
    const staff = staffBandi();
    const pausa = opz.pausaLotti != null ? Number(opz.pausaLotti) : PAUSA_LOTTI_MS;
    let finito = false;

    while (Date.now() < scadenza) {
        const docs = await prossimiIscritti(db, cursore, M.maxLotto());
        if (!docs.length) { finito = true; break; }
        // per ogni scheda: si spedisce o si salta (indirizzo storto, o "niente piu'" detto dopo la conferma)
        const voci = docs.map(d => {
            const v = d.data() || {};
            const email = String(v.email || '').trim().toLowerCase();
            const no = fuori[email];
            const salta = !N.EMAIL_RE.test(email) || (no && Number(no.quando) > (Number(v.confermata) || 0));
            return { id: d.id, email: email, nome: testo(v.nome, 80), salta: !!salta };
        });
        const destinatari = voci.filter(x => !x.salta).map(x => ({ email: x.email, nome: x.nome }));
        const ultimo = docs[docs.length - 1].id;
        // un lotto non pieno e' l'ultimo: dopo, non c'e' da rileggere
        const ultimoLotto = docs.length < M.maxLotto();
        if (!destinatari.length) {
            conti.saltati += voci.length;
            cursore = ultimo;
            await rif.update({ cursore: cursore, conti: conti });
            if (ultimoLotto) { finito = true; break; }
            continue;
        }

        await rif.update({ lottoInCorso: { ultimo: ultimo, n: destinatari.length, quando: Date.now() } });
        const r = await M.inviaLotto({
            oggetto: g.oggetto, html: g.html, testo: g.testo,
            destinatari: destinatari,
            campagna: g.campagna || 'bandi', invio: id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60),
            // il controllo su chi ha detto "niente piu'" l'ha gia' fatto questo giro, con le date
            saltaDisiscritti: true,
            linkDisiscrizione: N.linkBandiDisiscrizione,
            linkUnClic: N.linkBandiUnClic,
            etichetta: 'newsletter-bandi',
            rispondiA: staff,
            oggettoMailto: 'Disiscrizione aggiornamenti bandi',
            scadenza: Math.min(scadenza, Date.now() + 50000)
        });

        if (!r.ok) {
            errori++;
            const msg = String(r.msg || 'errore durante l\'invio').slice(0, 200);
            const patch = { lottoInCorso: null, errori: errori, ultimoErrore: { quando: Date.now(), msg: msg } };
            if (errori >= MAX_ERRORI) { patch.stato = 'fermo'; patch.fermato = Date.now(); }
            await rif.update(patch);
            esito.errore = msg;
            if (patch.stato === 'fermo') {
                esito.fermo = true;
                const mf = mailFermo(id, g, msg);
                const a = await spedisciServizio({ to: staff.join(', '), subject: mf.oggetto, html: mf.html, text: mf.testo });
                if (!a.ok) console.error('Newsletter bandi: avviso del giro fermo non partito:', a.errore);
            }
            break;
        }

        /* Con la casella SMTP chi non e' stato trattato per il tempo torna in
           `rimasti`, e la casella spedisce in fila: il cursore si ferma prima
           del primo rimasto, e lo riprende il giro dopo. */
        const rimasti = new Set((r.rimasti || []).map(x => String((x && x.email) || x).toLowerCase()));
        let fino = voci.length;
        if (rimasti.size) {
            const k = voci.findIndex(x => !x.salta && rimasti.has(x.email));
            if (k >= 0) fino = k;
        }
        conti.inviati += r.inviati || 0;
        conti.saltati += voci.slice(0, fino).filter(x => x.salta).length + (r.saltati || []).length;
        conti.falliti += (r.falliti || []).length;
        conti.lotti += 1;
        cursore = fino === voci.length ? ultimo : (fino > 0 ? voci[fino - 1].id : cursore);
        await rif.update({ cursore: cursore, conti: conti, lottoInCorso: null, errori: 0, trasporto: r.trasporto || '' });
        errori = 0;
        if (rimasti.size) break;
        if (ultimoLotto) { finito = true; break; }
        if (pausa > 0 && Date.now() + pausa < scadenza) await attendi(pausa);
    }

    Object.assign(esito, { inviati: conti.inviati, saltati: conti.saltati, falliti: conti.falliti, incerti: conti.incerti });
    if (finito) {
        await rif.update({ stato: 'finito', finito: Date.now(), conti: conti });
        esito.finito = true;
        const fresco = Object.assign({}, g, { trasporto: g.trasporto || (N.brevoAttivo() ? 'brevo' : 'smtp') });
        const mr = mailResoconto(fresco, conti);
        const a = await spedisciServizio({ to: staff.join(', '), subject: mr.oggetto, html: mr.html, text: mr.testo });
        if (!a.ok) console.error('Newsletter bandi: resoconto non partito:', a.errore);
    }
    return esito;
}

/* Un giro completo. opz (per le prove): budget, pausaLotti, url. */
async function giro(db, opz) {
    opz = opz || {};
    const partito = Date.now();
    const scadenza = partito + (Number(opz.budget) || BUDGET_MS);
    const chi = 'g' + partito.toString(36) + crypto.randomBytes(3).toString('hex');
    const conti = {};
    if (!await prendiLucchetto(db, chi)) return { occupato: true };
    try {
        let corrente = await giroInCorso(db);
        if (!corrente) {
            let letti;
            try {
                letti = await leggiBandiDalSito(opz);
            } catch (e) {
                conti.erroreSito = motivo(e);
                return conti;
            }
            if (letti.avvisi.length) conti.avvisi = letti.avvisi.slice(0, 5);
            const v = await valuta(db, letti);
            Object.assign(conti, v.conti);
            corrente = v.giro || null;
        }
        if (corrente) Object.assign(conti, await spedisci(db, corrente, scadenza, opz));
        return conti;
    } finally {
        await mollaLucchetto(db, chi, conti);
    }
}

module.exports = {
    iscrivi, conferma, disiscrivi, giro,
    // per le prove e per chi volesse ricomporre un aggiornamento
    componiAggiornamento, mailConferma, mailGiaIscritto, idIscritto, leggiBandiDalSito, inFinestra,
    COLL, COLL_GIRI, QUIETE_MS, ATTESA_MASSIMA_MS, MAX_MAIL_GIORNO, MAX_ERRORI, VALIDITA_CONFERMA_MS
};
