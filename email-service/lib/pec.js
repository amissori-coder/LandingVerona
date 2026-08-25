/* ============================================================
   PEC: trasporto e composizione dell'invito alle aziende
   ------------------------------------------------------------
   Perche' un trasporto a parte e non quello di Brevo. Una PEC ha
   valore legale solo se parte DA una casella PEC, spedita
   dall'SMTP del gestore accreditato (Aruba, Namirial...): e' il
   gestore a produrre la ricevuta di accettazione e quella di
   consegna. Brevo non e' un gestore PEC: quello che passa di li'
   e' posta ordinaria, e diverse caselle PEC aziendali sono
   impostate per rifiutarla. Percio' qui c'e' un secondo
   nodemailer, con le credenziali della casella PEC.

   Niente credenziali nel codice: tutto dalle variabili d'ambiente
   di Vercel (PEC_SMTP_*). Se mancano, l'invio PEC resta spento e
   l'area riservata lo dice, invece di spedire per sbaglio da
   Brevo qualcosa che gli utenti crederebbero certificato.

   L'impaginazione e' quella delle altre mail dello studio
   (lib/mail-layout.js), cosi' l'invito ha la stessa faccia.
   ============================================================ */

const nodemailer = require('nodemailer');
const { avvolgi, senzaTrattiniLunghi } = require('./mail-layout');

/* Aruba PEC come predefinito perche' e' la casella dello studio; host e
   porta restano comunque parametrici, cosi' cambiando gestore basta
   cambiare una variabile e non una riga di codice. */
const HOST_PREDEFINITO = 'smtps.pec.aruba.it';
const PORTA_PREDEFINITA = 465;

function configurazione() {
    const s = v => String(v == null ? '' : v).trim();
    const utente = s(process.env.PEC_SMTP_USER);
    return {
        host: s(process.env.PEC_SMTP_HOST) || HOST_PREDEFINITO,
        porta: Number(process.env.PEC_SMTP_PORT) || PORTA_PREDEFINITA,
        utente: utente,
        password: String(process.env.PEC_SMTP_PASS || ''),
        // il mittente di una PEC DEVE essere la casella PEC stessa: il gestore
        // rifiuta qualunque altro indirizzo nel campo From
        mittente: s(process.env.PEC_FROM_EMAIL) || utente,
        nome: s(process.env.PEC_FROM_NAME || 'Revilaw S.p.A.').replace(/[\r\n]/g, ' ').slice(0, 80),
        /* Dove far arrivare le risposte. Rispondere a una PEC da una casella
           ordinaria spesso non si puo': indicare qui la mail normale dello
           studio evita di costringere l'azienda a usare la propria PEC per
           dire "vengo volentieri". Se non c'e', risponderanno alla PEC. */
        rispondiA: s(process.env.PEC_REPLY_TO)
    };
}

function configurata() {
    const c = configurazione();
    return !!(c.host && c.utente && c.password && c.mittente);
}

/* Quante PEC per chiamata. La funzione Vercel ha 60 secondi: ogni PEC costa
   un giro completo di SMTP con TLS, quindi si sta larghi e si lascia che sia
   l'area riservata a richiamare il servizio finche' l'elenco e' finito. */
const MAX_LOTTO = Number(process.env.PEC_MAX_LOTTO) || 15;
/* Tetto orario per utente: una PEC si paga e non si richiama indietro. */
const MAX_ORA = Number(process.env.PEC_MAX_ORA) || 300;

function trasporto() {
    const c = configurazione();
    return nodemailer.createTransport({
        host: c.host,
        port: c.porta,
        secure: c.porta === 465,
        auth: { user: c.utente, pass: c.password },
        /* Una sola connessione riusata per tutto il lotto: i gestori PEC
           contano le connessioni al minuto e chiudono chi ne apre troppe. */
        pool: true, maxConnections: 1, maxMessages: 50,
        connectionTimeout: 20000, greetingTimeout: 20000, socketTimeout: 30000
    });
}

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* Variabili scrivibili nell'oggetto e nel testo dell'invito. Il valore
   inserito e' LETTERALE: un "$" nella ragione sociale non e' un riferimento
   speciale (stessa attenzione di api/invia-comunicazione.js). */
const VARIABILI = ['ragione_sociale', 'referente', 'citta', 'provincia', 'piva', 'pec'];
function valori(a) {
    a = a || {};
    return {
        ragione_sociale: String(a.ragioneSociale || ''),
        referente: String(a.referente || ''),
        citta: String(a.citta || ''),
        provincia: String(a.provincia || ''),
        piva: String(a.piva || ''),
        pec: String(a.pec || '')
    };
}
function applica(testo, a) {
    const v = valori(a);
    let s = String(testo == null ? '' : testo);
    VARIABILI.forEach(n => { s = s.replace(new RegExp('\\{' + n + '\\}', 'g'), () => v[n]); });
    return s;
}
function applicaHtml(testo, a) {
    const v = valori(a);
    let s = String(testo == null ? '' : testo);
    VARIABILI.forEach(n => { s = s.replace(new RegExp('\\{' + n + '\\}', 'g'), () => esc(v[n])); });
    return s;
}

/* Dall'HTML del messaggio alla parte in testo semplice: una PEC viene letta
   anche da gestionali e caselle che l'HTML non lo mostrano affatto. */
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

/* Il messaggio pronto per UN'azienda. Una PEC per azienda, mai piu'
   destinatari insieme: le ricevute del gestore arrivano per messaggio, e
   con un destinatario solo si sa sempre a chi si riferiscono (oltre a non
   mostrare a ciascuno la lista di tutti gli altri invitati). */
function messaggio(azienda, mail) {
    const c = configurazione();
    const oggetto = (applica(senzaTrattiniLunghi(mail.oggetto || ''), azienda) || 'Invito').replace(/[\r\n]/g, ' ').slice(0, 250);
    const corpo = senzaTrattiniLunghi(String(mail.html || ''));
    const html = avvolgi(applicaHtml(corpo, azienda));
    const m = {
        from: '"' + c.nome + '" <' + c.mittente + '>',
        to: String(azienda.pec || ''),
        subject: oggetto,
        text: htmlInTesto(applica(corpo, azienda)),
        html: html
    };
    if (c.rispondiA) m.replyTo = c.rispondiA;
    return m;
}

module.exports = {
    configurazione, configurata, trasporto, messaggio,
    applica, applicaHtml, htmlInTesto, VARIABILI, MAX_LOTTO, MAX_ORA
};
