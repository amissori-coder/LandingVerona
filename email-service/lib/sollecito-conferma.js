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
   solo finche' la mail ha meno di ventidue ore: oltre e' in arrivo il
   promemoria di sempre (mail e SMS, a un giorno), e due mail a dieci
   minuti non le vuole nessuno. Se il server di posta dice NO (una
   risposta con il suo codice) si riprova dopo mezz'ora, tre tentativi
   in tutto; se non risponde (tempo scaduto, connessione caduta), o la
   funzione si chiude a meta', l'esito e' INCERTO e non si riprova:
   meglio una lettera in meno che due uguali - il promemoria arriva lo
   stesso. Il segno sta sulla scheda: `sollecitoConferma: { quando, ok,
   incerto, errore, tentativi, a }`; Modifica se lo porta dietro con la
   conferma.

   IL MITTENTE. Brevo spedisce solo da un indirizzo verificato (o da un
   dominio autenticato): `andreamissori@revilaw.it` va aggiunto fra i
   mittenti di Brevo, una volta. E non lo dice al momento: il relay
   ACCETTA la mail (250) e la scarta dopo, in silenzio, con un "sender
   not valid" che si legge solo nei suoi log. Una lettera segnata partita
   e mai arrivata sarebbe il peggio: per questo, prima di spedire, il giro
   chiede a Brevo (API, la chiave degli SMS) se il mittente e' fra i
   verificati o il suo dominio fra gli autenticati (mittenteVerificato);
   se no, o se non riesce a chiederlo, le lettere ASPETTANO senza
   consumare tentativi, e si riprova al giro dopo. Si cambia senza toccare
   il codice con SOLLECITO_FROM_EMAIL e SOLLECITO_FROM_NAME;
   SOLLECITO_CONFERMA=no lo spegne (il giro lo salta e passa al
   promemoria).
   ============================================================ */
'use strict';
const CONF = require('./conferma-email');
const NL = require('./newsletter');

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
/* A chi torna "Rispondi": al mittente, salvo SOLLECITO_RISPONDI_A. Serve
   quando si spedisce da un indirizzo di un dominio autenticato su Brevo
   (DKIM e DMARC a posto) e le risposte devono arrivare lo stesso ad
   Andrea: la lettera resta sua. */
function rispondiA() {
    const v = String(process.env.SOLLECITO_RISPONDI_A || '').trim().toLowerCase();
    return EMAIL_RE.test(v) ? v : mittenteEmail();
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
            + (online ? 'riceverà la conferma dell\'iscrizione; le istruzioni per seguire i lavori online le arriveranno con un\'email a parte prima dell\'evento.'
                : 'riceverà l\'invito personale in PDF da presentare all\'accreditamento.'),
        'Se invece non la trova, mi risponda pure a questa email e predisporremo un nuovo invio.',
        'Resto a disposizione per qualsiasi chiarimento.',
        'Cordiali saluti,',
        FIRMA
    ].join('\n\n');
    return { oggetto: oggetto, testo: testo };
}

/* La spedizione: una mail sola, solo testo, con i tempi massimi del
   trasporto delle conferme. Restituisce { ok, errore, a, incerto, canale }:
   `incerto` quando il server non ha risposto con un suo codice (tempo
   scaduto, connessione caduta) e la mail potrebbe essere partita lo
   stesso; `canale` quando il no e' arrivato PRIMA del destinatario (il
   saluto, le credenziali, il MITTENTE: "Sender not valid" di Brevo per un
   indirizzo non verificato) - un guasto che vale per tutti, non per
   questa persona, e che non deve consumare i suoi tentativi. Niente
   secondo tentativo qui: lo fa il giro, dopo mezz'ora, e solo per un no
   certo. */
async function spedisci(scheda) {
    const a = String((scheda && scheda.email) || '').trim().toLowerCase();
    if (!EMAIL_RE.test(a)) return { ok: false, errore: 'indirizzo mancante', a: a };
    const m = componi(scheda);
    const messaggio = {
        from: '"' + mittenteNome() + '" <' + mittenteEmail() + '>',
        replyTo: rispondiA(),
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
        const incerto = !(Number(e && e.responseCode) > 0);
        // il comando a cui il server ha detto no (nodemailer lo scrive): prima del destinatario e' il canale
        const comando = String((e && e.command) || '').toUpperCase();
        const canale = !incerto && (/^(CONN|EHLO|HELO|STARTTLS|AUTH|MAIL FROM)/.test(comando) || String((e && e.code) || '') === 'EAUTH');
        console.error('Sollecito conferma non inviato' + (incerto ? ' (esito incerto)' : (canale ? ' (guasto del canale: ' + comando + ')' : '')) + ':', errore);
        return { ok: false, errore: errore, a: a, incerto: incerto, canale: canale };
    }
}

/* Il mittente e' verificato su Brevo? Si chiede ai mittenti (/senders:
   l'indirizzo, attivo) e, se non c'e', ai domini (/senders/domains: il suo
   dominio autenticato). Un si' vale un'ora, in memoria; un no, o una
   chiamata non riuscita (chiave mancante, rete), si richiede al giro dopo.
   Restituisce { ok, motivo }. */
const VERIFICA_VALE_MS = 60 * 60 * 1000;
let verifica = { quando: 0, mittente: '', esito: null };
function azzeraVerifica() { verifica = { quando: 0, mittente: '', esito: null }; }
async function mittenteVerificato(adesso) {
    const ora = Number(adesso) || Date.now();
    const email = mittenteEmail();
    if (verifica.esito && verifica.esito.ok && verifica.mittente === email && ora - verifica.quando < VERIFICA_VALE_MS) return verifica.esito;
    let esito;
    if (!NL.brevoAttivo()) {
        esito = { ok: false, motivo: 'BREVO_API_KEY mancante: non si può verificare il mittente ' + email };
    } else {
        try {
            const r = await NL.chiamataBrevo('/senders');
            if (!r.ok) throw new Error('Brevo ' + r.stato + (r.testo ? ': ' + r.testo.slice(0, 120) : ''));
            const lista = Array.isArray(r.dati && r.dati.senders) ? r.dati.senders : [];
            const suo = lista.find(x => String((x && x.email) || '').trim().toLowerCase() === email);
            if (suo && suo.active !== false) {
                esito = { ok: true };
            } else {
                const dominio = email.split('@')[1] || '';
                const d = await NL.chiamataBrevo('/senders/domains');
                if (!d.ok) throw new Error('Brevo ' + d.stato + (d.testo ? ': ' + d.testo.slice(0, 120) : ''));
                const domini = Array.isArray(d.dati && d.dati.domains) ? d.dati.domains : [];
                const mio = domini.find(x => String((x && (x.domain_name || x.domain)) || '').trim().toLowerCase() === dominio);
                esito = mio && (mio.authenticated === true || mio.verified === true)
                    ? { ok: true }
                    : { ok: false, motivo: 'il mittente ' + email + ' non è fra i mittenti verificati di Brevo, e il dominio ' + dominio + ' non è autenticato: le lettere aspettano' };
            }
        } catch (e) {
            esito = { ok: false, motivo: 'verifica del mittente ' + email + ' non riuscita: ' + String((e && e.message) || e).slice(0, 160) };
        }
    }
    verifica = { quando: ora, mittente: email, esito: esito };
    return esito;
}

module.exports = { spento, componi, spedisci, mittenteVerificato, azzeraVerifica, mittenteEmail, mittenteNome, rispondiA, MITTENTE_EMAIL, MITTENTE_NOME, VERIFICA_VALE_MS };
