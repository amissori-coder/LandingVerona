/* ============================================================
   Il sollecito personale della conferma dell'email
   ------------------------------------------------------------
   Agli eventi dove l'iscrizione vale solo dopo la conferma dell'email
   (Milano 2027) la mail con il pulsante parte da noreply, e a volte
   finisce nella posta indesiderata o in una cartella che nessuno apre.
   A UN'ORA dalla mail partita e non cliccata, parte una seconda mail:
   personale, da Andrea Missori, con il suo indirizzo come mittente e
   come "Rispondi", SOLO TESTO, senza collegamenti, senza immagini e
   senza intestazioni da invio di massa. E' una lettera, non una
   circolare: e' quello che le fa passare i filtri, ed e' quello che
   chi la riceve legge come scritta a lui. Dice di cercare la prima mail
   anche nello spam e nelle cartelle Promozioni e Aggiornamenti, e di
   rispondere se non la trova.

   La manda il giro delle conferme (lib/giro-conferme.js, 'sollecito'):
   una per scheda, dalle 8 alle 21 ora di Milano (di notte aspetta), e
   se il server di posta dice no si riprova dopo mezz'ora, tre tentativi
   in tutto. Il promemoria di sempre (mail e SMS, a un giorno) resta.
   Il segno sta sulla scheda: `sollecitoConferma: { quando, ok, errore,
   tentativi, a }`; Modifica se lo porta dietro con la conferma.

   IL MITTENTE. Brevo accetta come mittente solo un indirizzo verificato
   (o un dominio autenticato): `andreamissori@revilaw.it` va aggiunto fra
   i mittenti di Brevo, una volta. Si cambia senza toccare il codice con
   SOLLECITO_FROM_EMAIL e SOLLECITO_FROM_NAME; SOLLECITO_CONFERMA=no lo
   spegne (il giro lo salta e passa al promemoria).
   ============================================================ */
'use strict';
const CONF = require('./conferma-email');

const MITTENTE_EMAIL = 'andreamissori@revilaw.it';
const MITTENTE_NOME = 'Andrea Missori - Revilaw';
const FIRMA = [
    'Andrea Missori',
    'Equity Partner e Procuratore di Revilaw S.p.A.',
    'Capoarea Lazio, Marche e Umbria | Responsabile Area Centro',
    'Dottore Commercialista | Revisore Legale dei Conti | Chief Financial Officer',
    'M. +39 338 3074961 | T. +39 06 86398814',
    'nextgenerationbusiness.it | revilaw.it',
    'A. Via Giuseppe Gioachino Belli 60, 00193 Roma'
].join('\n');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function spento() {
    return /^(no|off|0|false|spento)$/i.test(String(process.env.SOLLECITO_CONFERMA || '').trim());
}
function mittenteEmail() {
    const v = String(process.env.SOLLECITO_FROM_EMAIL || '').trim().toLowerCase();
    return EMAIL_RE.test(v) ? v : MITTENTE_EMAIL;
}
function mittenteNome() {
    return (String(process.env.SOLLECITO_FROM_NAME || '').trim() || MITTENTE_NOME).replace(/[\r\n"<>]/g, ' ').slice(0, 80);
}
function pulito(v, max) { return String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').trim().slice(0, max || 200); }
function mailDiConferma() { return String(process.env.SMTP_FROM_EMAIL || 'noreply@nextgenerationbusiness.it').trim(); }

/* Il testo, personalizzato: il nome, l'azienda scritta nel modulo, la
   data e la sede dell'evento (CONF.dettagliEvento), e quello che arriva
   dopo il clic - l'invito in PDF per chi viene in sala, il collegamento per
   chi segue online. Niente collegamenti: un indirizzo scritto come testo
   non e' un link che un filtro debba controllare, e nemmeno uno che un
   antispam aziendale "visiti" al posto della persona. */
function componi(scheda) {
    const ev = CONF.dettagliEvento(scheda && scheda.pagina);
    const nome = pulito(((scheda && scheda.nome) || '') + ' ' + ((scheda && scheda.cognome) || ''), 160);
    const azienda = pulito(scheda && scheda.azienda, 200);
    const online = String((scheda && scheda.modalita) || '').toLowerCase() === 'online';
    const citta = ev.indirizzo ? String(ev.indirizzo).replace(/^.*\d{5}\s+/, '').replace(/^.*,\s*/, '') : 'Milano';
    const giorno = ev.quando ? String(ev.quando).replace(/^Venerd[iì]\s+/i, '') : '';
    const quando = ev.quando ? ev.quando.charAt(0).toLowerCase() + ev.quando.slice(1) : '';
    const oggetto = 'Next Generation Business ' + citta + (giorno ? ', ' + giorno : '') + ' – conferma della sua iscrizione';
    const testo = [
        'Gentile ' + (nome || 'iscritto') + ',',
        'la ringrazio per la sua iscrizione a Next Generation Business, il convegno con incontri B2B in programma a ' + citta
            + (quando ? ' ' + quando : '') + (ev.luogo ? ' presso l\'' + ev.luogo : '') + '.',
        (azienda ? 'La richiesta per ' + azienda + ' risulta registrata' : 'La sua richiesta risulta registrata')
            + ', ma l\'iscrizione non è ancora completa: manca la conferma dell\'indirizzo email. Subito dopo l\'invio del modulo le è arrivata una mail da '
            + mailDiConferma() + ' con il pulsante «Conferma il tuo indirizzo email».',
        'Le chiedo di cercarla anche nella posta indesiderata (spam) o nelle cartelle Promozioni e Aggiornamenti, dove a volte la spostano i filtri. '
            + 'Se la trova, basta un clic sul pulsante: subito dopo '
            + (online ? 'riceverà la conferma con il collegamento per seguire i lavori online.' : 'riceverà l\'invito personale in PDF da presentare all\'accreditamento.'),
        'Se invece non la trova, mi risponda pure a questa email e predisporremo un nuovo invio.',
        'Resto a disposizione per qualsiasi chiarimento.',
        'Cordiali saluti,',
        FIRMA
    ].join('\n\n');
    return { oggetto: oggetto, testo: testo };
}

/* La spedizione: una mail sola, solo testo, con i tempi massimi del
   trasporto delle conferme. Restituisce { ok, errore, a }. Niente secondo
   tentativo qui: lo fa il giro, dopo mezz'ora. */
async function spedisci(scheda) {
    const a = String((scheda && scheda.email) || '').trim().toLowerCase();
    if (!EMAIL_RE.test(a)) return { ok: false, errore: 'indirizzo mancante', a: a };
    const m = componi(scheda);
    const messaggio = {
        from: '"' + mittenteNome() + '" <' + mittenteEmail() + '>',
        replyTo: mittenteEmail(),
        to: a,
        subject: m.oggetto,
        text: m.testo,
        // il tag con cui la si ritrova fra i log transazionali di Brevo
        headers: { 'X-Mailin-Tag': 'sollecito-conferma' }
    };
    try {
        await CONF.trasporto().sendMail(messaggio);
        return { ok: true, errore: '', a: a };
    } catch (e) {
        const errore = String((e && e.message) || e || 'errore del server di posta').slice(0, 200);
        console.error('Sollecito conferma non inviato:', errore);
        return { ok: false, errore: errore, a: a };
    }
}

module.exports = { spento, componi, spedisci, mittenteEmail, mittenteNome, MITTENTE_EMAIL, MITTENTE_NOME };
