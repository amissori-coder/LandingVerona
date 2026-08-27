/* ============================================================
   I due canali con cui parte l'invito alle aziende
   ------------------------------------------------------------
   L'invito a un evento e' MARKETING: si scrive ad aziende che non
   si sono ancora iscritte. Quindi il canale normale e' la posta
   ordinaria da Brevo, quella che lo studio usa gia' per la
   newsletter: nessuna configurazione nuova, invii veloci, esiti e
   disiscrizioni gia' gestiti.

   La PEC resta come secondo canale, per l'invito formale. Una PEC
   ha valore legale solo se parte DA una casella PEC attraverso
   l'SMTP del gestore accreditato, che e' l'unico a produrre le
   ricevute di accettazione e consegna: Brevo non e' un gestore
   PEC, quindi quel canale ha credenziali sue (PEC_SMTP_*) ed e'
   spento finche' non ci sono.

   Due accortezze che valgono per il canale ordinario, e che qui
   sono dentro il messaggio invece che nelle buone intenzioni:

   - ogni mail porta il collegamento per non ricevere piu' nulla,
     piu' le intestazioni List-Unsubscribe che i client di posta
     usano da soli. Senza, un invio a freddo finisce nello spam e
     mette a rischio l'account;
   - il mittente puo' essere SEPARATO da quello delle email di
     servizio (MKT_SMTP_*). Serve: l'account Brevo dello studio
     porta anche le email con cui le persone entrano nell'area
     riservata, e una sospensione per lamentele su un invio a
     freddo le fermerebbe tutte. Se le variabili non ci sono si
     usa comunque il mittente di sempre.
   ============================================================ */

const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { avvolgi, senzaTrattiniLunghi } = require('./mail-layout');
const NL = require('./newsletter');

const s = v => String(v == null ? '' : v).trim();

/* --- canale ORDINARIO (Brevo) ---
   Credenziali proprie se ci sono, altrimenti quelle di sempre. */
function configurazioneEmail() {
    const propria = !!s(process.env.MKT_SMTP_USER);
    const utente = propria ? s(process.env.MKT_SMTP_USER) : s(process.env.SMTP_USER);
    const host = propria ? (s(process.env.MKT_SMTP_HOST) || 'smtp-relay.brevo.com') : s(process.env.SMTP_HOST);
    const porta = Number(propria ? process.env.MKT_SMTP_PORT : process.env.SMTP_PORT) || 587;
    return {
        canale: 'email', separato: propria,
        host: host, porta: porta, utente: utente,
        password: String((propria ? process.env.MKT_SMTP_PASS : process.env.SMTP_PASS) || ''),
        mittente: s(process.env.MKT_FROM_EMAIL) || s(process.env.SMTP_FROM_EMAIL) || utente,
        nome: (s(process.env.MKT_FROM_NAME) || s(process.env.SMTP_FROM_NAME) || 'Revilaw S.p.A.').replace(/[\r\n]/g, ' ').slice(0, 80),
        rispondiA: s(process.env.MKT_REPLY_TO)
    };
}

/* --- canale PEC ---
   Aruba come predefinito perche' e' la casella dello studio; host e porta
   restano parametrici, cosi' cambiando gestore basta cambiare una variabile. */
function configurazionePec() {
    const utente = s(process.env.PEC_SMTP_USER);
    return {
        canale: 'pec', separato: true,
        host: s(process.env.PEC_SMTP_HOST) || 'smtps.pec.aruba.it',
        porta: Number(process.env.PEC_SMTP_PORT) || 465,
        utente: utente,
        password: String(process.env.PEC_SMTP_PASS || ''),
        // il mittente di una PEC DEVE essere la casella PEC: il gestore
        // rifiuta qualunque altro indirizzo nel campo From
        mittente: s(process.env.PEC_FROM_EMAIL) || utente,
        nome: s(process.env.PEC_FROM_NAME || 'Revilaw S.p.A.').replace(/[\r\n]/g, ' ').slice(0, 80),
        /* Rispondere a una PEC da una casella ordinaria spesso non si puo':
           indicare qui la mail normale dello studio evita di costringere
           l'azienda a usare la propria PEC per dire "vengo volentieri". */
        rispondiA: s(process.env.PEC_REPLY_TO)
    };
}

function configurazione(canale) {
    return canale === 'pec' ? configurazionePec() : configurazioneEmail();
}
function configurato(canale) {
    const c = configurazione(canale);
    return !!(c.host && c.utente && c.password && c.mittente);
}

/* Quanti destinatari per chiamata. La funzione Vercel ha 60 secondi: la posta
   ordinaria va veloce, una PEC costa un giro completo di SMTP con TLS. In
   entrambi i casi e' l'area riservata a richiamare il servizio finche'
   l'elenco non e' finito. */
function maxLotto(canale) {
    return canale === 'pec'
        ? (Number(process.env.PEC_MAX_LOTTO) || 15)
        : (Number(process.env.MKT_MAX_LOTTO) || 40);
}
/* Tetto orario per utente. Sulla PEC e' basso perche' ogni messaggio si paga
   e non si richiama indietro; sull'ordinaria serve solo a contenere i danni
   di un invio partito per sbaglio. */
function maxOra(canale) {
    return canale === 'pec'
        ? (Number(process.env.PEC_MAX_ORA) || 300)
        : (Number(process.env.MKT_MAX_ORA) || 2000);
}

/* Quanto si aspetta fra un messaggio e il successivo.
   Sulla PEC non e' prudenza generica: i gestori misurano il ritmo con cui
   arriva la posta, e una raffica da un indirizzo che non conoscono e' il
   profilo che fanno scattare i filtri antiabuso. Un secondo e mezzo non si
   nota (la funzione ha comunque i suoi 60 secondi e l'area riservata
   richiama finche' l'elenco non finisce) e cambia il profilo dell'invio.
   Sull'ordinaria non serve: la consegna al relay, che ha le sue code. */
function pausaFra(canale) {
    const v = canale === 'pec' ? process.env.PEC_PAUSA_MS : process.env.MKT_PAUSA_MS;
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) return Math.min(n, 10000);
    return canale === 'pec' ? 1500 : 0;
}
function aspetta(ms) {
    return ms > 0 ? new Promise(r => setTimeout(r, ms)) : Promise.resolve();
}

/* Un rifiuto che riguarda NOI, non il destinatario.
   La differenza conta piu' di quanto sembri: un indirizzo inesistente e' un
   problema di quella riga e si va avanti; un IP bloccato o un tetto superato
   valgono per tutto il lotto, e insistere non lo migliora - semmai allunga il
   blocco e brucia il resto dell'elenco marcandolo "errore" senza motivo.
   Quando si riconosce uno di questi, l'invio si ferma li'. */
function fermaTutto(e) {
    const testo = String((e && e.message) || '').toLowerCase();
    const codice = String((e && e.responseCode) || '');
    if (/bloccat|blocked|blacklist|spam|abus|too many|rate limit|troppi|quota|not allowed to send|sender denied/.test(testo)) return true;
    /* 421 e' "servizio non disponibile, riprova", 45x sono rifiuti temporanei:
       il codice arriva in un campo suo, ma non sempre, quindi si guarda anche
       il testo, dove nodemailer ricopia la risposta del server per intero. */
    if (/^(421|450|451|452)$/.test(codice)) return true;
    if (/(^|[\s:])(421|45[0-2])([\s-]|$)/.test(testo)) return true;
    if (/5\.7\.\d/.test(testo) && /ip|host|client/.test(testo)) return true;
    if (e && (e.code === 'EAUTH' || e.code === 'ECONNECTION' || e.code === 'ETIMEDOUT')) return true;
    return false;
}

function trasporto(canale) {
    const c = configurazione(canale);
    return nodemailer.createTransport({
        host: c.host,
        port: c.porta,
        secure: c.porta === 465,
        auth: { user: c.utente, pass: c.password },
        /* Una sola connessione riusata per tutto il lotto: piu' veloce, e i
           gestori PEC contano le connessioni al minuto e chiudono chi ne apre
           troppe. */
        pool: true, maxConnections: 1, maxMessages: canale === 'pec' ? 50 : 200,
        connectionTimeout: 20000, greetingTimeout: 20000, socketTimeout: 30000
    });
}

/* Il Message-ID che imponiamo al messaggio in partenza.
   Perche' non lasciarlo generare a nodemailer: e' ESATTAMENTE questo
   valore che il gestore PEC ricopia nell'intestazione
   X-Riferimento-Message-ID di tutte le ricevute e dentro daticert.xml.
   E' il filo che lega la ricevuta di consegna all'azienda a cui
   abbiamo scritto: se lo genera qualcun altro e non lo annotiamo,
   quando la ricevuta arriva non sappiamo piu' di chi sia.

   Il dominio dev'essere quello della casella da cui si spedisce: un
   Message-ID con un dominio estraneo e' una delle cose che fanno
   scattare l'avviso di non accettazione per eccezioni formali. */
function riferimentoNuovo(canale) {
    const c = configurazione(canale);
    const dominio = String(c.mittente || '').split('@')[1] || 'nextgenerationbusiness.it';
    return 'inv-' + crypto.randomBytes(8).toString('hex') + '@' + dominio;
}

function esc(x) {
    return String(x == null ? '' : x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* Variabili scrivibili nell'oggetto e nel testo dell'invito. Il valore
   inserito e' LETTERALE: un "$" nella ragione sociale non e' un riferimento
   speciale (stessa attenzione di api/invia-comunicazione.js). */
/* Le variabili che chi scrive l'invito puo' mettere nel testo. "codice" e'
   diversa dalle altre: le altre ripetono un dato che l'azienda gia' conosce,
   questa porta un'informazione che nasce qui e che l'azienda dovra'
   restituirci per registrarsi. */
const VARIABILI = ['ragione_sociale', 'referente', 'citta', 'provincia', 'piva', 'pec', 'codice'];
function valori(a) {
    a = a || {};
    return {
        ragione_sociale: String(a.ragioneSociale || ''),
        referente: String(a.referente || ''),
        citta: String(a.citta || ''),
        provincia: String(a.provincia || ''),
        piva: String(a.piva || ''),
        pec: String(a.pec || ''),
        codice: String(a.codice || '')
    };
}
function applica(testo, a) {
    const v = valori(a);
    let out = String(testo == null ? '' : testo);
    VARIABILI.forEach(n => { out = out.replace(new RegExp('\\{' + n + '\\}', 'g'), () => v[n]); });
    return out;
}
function applicaHtml(testo, a) {
    const v = valori(a);
    let out = String(testo == null ? '' : testo);
    VARIABILI.forEach(n => { out = out.replace(new RegExp('\\{' + n + '\\}', 'g'), () => esc(v[n])); });
    return out;
}

/* Dall'HTML del messaggio alla parte in testo semplice: c'e' ancora chi legge
   la posta senza HTML, e una mail con la sola parte HTML e' un indizio di
   spam per i filtri. */
function htmlInTesto(h) {
    return String(h || '')
        .replace(/<\s*br\s*\/?>/gi, '\n')
        .replace(/<\/(td|th)>/gi, '\t')
        .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
        .replace(/<li[^>]*>/gi, '- ')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
        .replace(/\n{3,}/g, '\n\n').trim();
}

/* Il piede con il collegamento per non ricevere piu' nulla. Su un invito a
   freddo non e' una gentilezza: e' cio' che tiene la mail fuori dallo spam e
   l'account fuori dai guai. Ci va su entrambi i canali. */
function piedeDisiscrizione(indirizzo, campagna) {
    const link = NL.linkDisiscrizione(indirizzo, campagna);
    return {
        link: link,
        html: '<p style="margin:22px 0 0;padding-top:14px;border-top:1px solid #E2E8F0;font-size:12px;line-height:1.5;color:#64748B;">'
            + 'Ricevete questo messaggio perche il vostro indirizzo risulta fra i recapiti pubblici della vostra impresa. '
            + 'Se non desiderate ricevere altre comunicazioni, <a href="' + esc(link) + '" style="color:#164068;">cliccate qui</a>: '
            + 'l\'indirizzo viene tolto subito e per sempre.</p>',
        testo: '\n\n---\nRicevete questo messaggio perche il vostro indirizzo risulta fra i recapiti pubblici della vostra impresa.\n'
            + 'Per non ricevere altre comunicazioni: ' + link
    };
}

/* Il messaggio pronto per UN'azienda. Un destinatario per messaggio, mai piu'
   insieme: sulla PEC perche' le ricevute del gestore arrivano per messaggio e
   cosi' si sa sempre a chi si riferiscono, sull'ordinaria perche' cosi' ogni
   scheda porta il proprio esito e nessuno vede gli indirizzi degli altri. */
function messaggio(canale, azienda, mail, opz) {
    opz = opz || {};
    const c = configurazione(canale);
    const a = azienda || {};
    // sull'ordinaria si preferisce la mail normale, se l'elenco ce l'ha:
    // arriva meglio della PEC, che molte aziende leggono di rado
    const destinatario = canale === 'pec'
        ? String(a.pec || '')
        : (String(a.email || '') || String(a.pec || ''));
    const oggetto = (applica(senzaTrattiniLunghi(mail.oggetto || ''), a) || 'Invito').replace(/[\r\n]/g, ' ').slice(0, 250);
    const corpo = senzaTrattiniLunghi(String(mail.html || ''));
    const piede = piedeDisiscrizione(destinatario, opz.campagna || '');
    const m = {
        from: '"' + c.nome + '" <' + c.mittente + '>',
        to: destinatario,
        subject: oggetto,
        text: htmlInTesto(applica(corpo, a)) + piede.testo,
        html: avvolgi(applicaHtml(corpo, a) + piede.html)
    };
    /* DOVE VANNO A FINIRE LE RISPOSTE. Non e' un dettaglio di forma: decide
       se si potranno leggere o no dall'area riservata.

       Sulla PEC, se non si dice niente, la risposta torna al mittente, cioe'
       nella casella PEC: e' li' che il lettore va a prenderla, ed e' cosi'
       che compare sulla scheda dell'azienda. Percio' qui NON si ripiega
       sull'indirizzo di chi ha premuto invia: lo si facesse, le risposte
       finirebbero nella posta personale di quella persona e l'area riservata
       non ne saprebbe piu' niente. Un PEC_REPLY_TO impostato apposta vale
       come scelta esplicita, e ha la stessa conseguenza: chi lo mette deve
       sapere che sta portando le risposte fuori di qui.

       Sull'email ordinaria il ragionamento e' opposto: non c'e' nessun
       lettore che guardi la casella, quindi la cosa piu' utile e' che la
       risposta arrivi a chi ha mandato l'invito. */
    const rispondiA = canale === 'pec' ? c.rispondiA : (c.rispondiA || opz.rispondiA || '');
    if (rispondiA) m.replyTo = rispondiA;
    // il filo per ritrovare le ricevute: si veda riferimentoNuovo()
    if (opz.riferimento) m.messageId = '<' + opz.riferimento + '>';
    /* Le intestazioni che i client di posta usano da soli per il pulsante
       "Annulla iscrizione". Sulla PEC no: il gestore imbusta il messaggio e
       quel pulsante li' non esiste. */
    if (canale !== 'pec') {
        m.headers = {
            'List-Unsubscribe': '<' + NL.linkUnClic(destinatario, opz.campagna || '') + '>, <mailto:' + c.mittente + '?subject=Disiscrizione>',
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
        };
    }
    return m;
}

/* A quale indirizzo arriverebbe l'invito su questo canale (serve anche a
   scartare le schede che su quel canale non hanno recapito). */
function destinatarioDi(canale, a) {
    a = a || {};
    return canale === 'pec' ? String(a.pec || '') : (String(a.email || '') || String(a.pec || ''));
}

module.exports = {
    configurazione, configurato, trasporto, messaggio, destinatarioDi, riferimentoNuovo,
    pausaFra, aspetta, fermaTutto,
    applica, applicaHtml, htmlInTesto, maxLotto, maxOra, VARIABILI
};
