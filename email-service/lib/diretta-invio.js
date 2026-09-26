/* ============================================================
   Diretta degli eventi: l'invio delle email
   ------------------------------------------------------------
   Qui passa ogni email della diretta: le credenziali (in coda, mille
   alla volta, una sola con "Reinvia", o subito a chi si iscrive dal
   modulo del sito con l'interruttore dell'evento acceso: inviaSubito),
   l'avviso «Sei iscritto anche a...», l'email di prova per il gestore,
   la reimpostazione della password, i promemoria del giorno prima e
   dell'ora prima. E qui gira il lavoro programmato (api/diretta-cron.js,
   ogni 5 minuti), che e' anche la rete di sicurezza degli invii subito:
   chi non e' partito resta 'in coda' e parte al giro dopo.

   UNA PASSWORD PER PERSONA. Si entra con l'email e UNA password, per
   tutti gli eventi. Quando le credenziali di un evento partono, si
   decide li' (tipoInvio) che cosa mandare:
     - la persona non ha ancora ricevuto una password (o l'ha ricevuta
       a un indirizzo che poi e' stato corretto) -> le credenziali, con
       una password nuova;
     - le credenziali di QUESTO evento erano gia' partite, al suo
       indirizzo di adesso (un reinvio a chi non l'ha ricevuta) -> le
       credenziali, con una password nuova, come sempre;
     - la persona ha gia' una password che funziona -> l'avviso «Sei
       iscritto anche a <evento>: entra con la tua email e la password
       che hai gia'», SENZA password: quella che ha continua a valere.
       "Ha gia' una password" (haPassword) vuol dire: le credenziali di
       un altro evento sono partite, oppure il gestore gliene ha data una
       a voce, oppure ha chiesto «Password dimenticata?» e il
       collegamento e' partito (resetInviato: forse se n'e' scelta una
       lei, e mandarle adesso una password nostra la cancellerebbe senza
       avviso), oppure e' gia' ENTRATA nella diretta (ultimoAccesso: la
       password che usa funziona).
   L'INDIRIZZO CORRETTO TAGLIA LA STORIA. Quando il gestore corregge
   l'email (emailCambiata sul profilo), tutto quello che e' successo
   prima e' andato a un'altra casella, o e' stato fatto da chi usava
   quella casella: credenziali, reimpostazioni, accessi di prima non
   dicono che la persona di ADESSO conosce una password. Conta solo
   quello che e' successo dopo (anche per la voce di QUESTO evento:
   credenziali partite al vecchio indirizzo non sono "gia' ricevute").
   Il pulsante "Reinvia" della gestione manda sempre le credenziali con
   una password nuova (e' quello che chiede il gestore), e l'email dice
   che la password di prima non vale piu' (sostituzione: anche quella
   scelta con «Password dimenticata?» o data a voce). Sulla voce resta
   che cosa e' partito (invii.<idEvento>.tipo: 'credenziali' o
   'anche').

   IL MODULO DEL SITO NON SI PRENDE TUTTO IL TETTO. Le voci messe in
   coda dal modulo pubblico (automatica: true, vedi
   lib/diretta-iscrizione.js) partono, sia subito (inviaSubito) sia dal
   cron, solo finche' le email del giorno non superano
   DIRETTA_MODULO_PERCENTO del tetto (60%): oltre, restano 'in coda' e
   partono il giorno dopo. Credenziali del gestore, promemoria e
   reimpostazioni (che si fermano all'80%) hanno sempre posto.

   LA REGOLA DI TUTTO: AL MASSIMO UNA VOLTA. Una persona non deve mai
   ricevere due email di credenziali per sbaglio: la seconda porta una
   password nuova, e la prima (che magari ha gia' copiato) smette di
   funzionare. Quindi per ogni persona:
     1. una TRANSAZIONE la passa da 'in coda' a 'invio' (tentativi +1):
        se due giri la vedono insieme, uno solo vince, l'altro la salta;
     2. si genera la password e la si imposta sull'account Firebase;
     3. si spedisce;
     4. si scrive l'esito: 'inviata', 'respinta', 'errore' o 'incerto'.
   Se il processo muore fra il 2 e il 4 (Vercel lo ferma, la rete
   cade) la persona resta in 'invio': nessuno la rispedisce da solo.
   Dopo dieci minuti il cron la mette in 'incerto' ("potrebbe essere
   partita"), e solo il gestore puo' decidere di reinviare, una per
   una. Un lucchetto su code/{idEvento} tiene fuori un secondo giro
   mentre il primo lavora: non serve alla correttezza (bastano le
   transazioni) ma evita di leggere e contendersi le stesse persone.

   GLI STATI (partecipanti/{uid}.invii.<idEvento>.stato):
     'da inviare' -> caricato, niente ancora spedito
     'in coda'    -> scelto per l'invio in blocco
     'invio'      -> preso da un giro, in spedizione adesso
     'inviata'    -> il server di posta l'ha accettata
     'respinta'   -> rifiuto definitivo del destinatario (5xx sul
                     destinatario, o rimbalzo letto da Brevo)
     'errore'     -> errore CERTO prima della consegna: non e' partita
     'incerto'    -> interrotto a meta': forse e' partita, forse no

   GLI ERRORI DI BREVO CHE RIGUARDANO NOI, NON LA PERSONA (account
   sospeso, login rifiutato, troppi invii, IP bloccato): non ha senso
   continuare e segnare "errore" tutto l'elenco. Il lotto si ferma,
   code/{id}.bloccato dice perche', e le persone tornano 'in coda' se
   il messaggio SICURAMENTE non e' partito (errore prima del DATA). Il
   cron riprova al giro dopo, un gruppo solo: se il blocco c'e' ancora,
   lo registra e aspetta, senza bruciare la lista.

   LE DIPENDENZE: solo nodemailer, firebase-admin (attraverso il
   contesto), mail-layout.js (dentro diretta-mail.js) e gli altri file
   diretta-*. La password non finisce MAI in un log, in Firestore o in
   un file: esiste solo nel momento in cui la si imposta e la si mette
   nell'email (la posta finta delle prove e' l'unica eccezione, ed e'
   spenta fuori dall'emulatore).
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const C = require('./diretta-comune');
const M = require('./diretta-mail');
const E = require('./diretta-email');
const { generaPassword } = require('./diretta-password');

const STATI = ['da inviare', 'in coda', 'invio', 'inviata', 'respinta', 'errore', 'incerto'];
const RE_ID_EVENTO = /^[a-z0-9][a-z0-9-]{2,40}$/;
const MINUTO = 60 * 1000;
const GIORNO = 24 * 60 * MINUTO;
// dopo quanto un 'invio' rimasto a meta' diventa 'incerto'
const SCADENZA_INVIO_MS = 10 * MINUTO;
const MOTIVO_INCERTO = 'Invio interrotto: esito non certo, controlla e reinvia se serve';
/* Il lucchetto dura PIU' della funzione che lo prende (60 s per
   diretta-gestione, 300 s per diretta-cron: vedi vercel.json), cosi' un
   secondo giro non entra mentre il primo sta ancora spedendo; se la
   funzione muore, scade da solo. */
const LUCCHETTO_MANUALE_MS = 90 * 1000;
const LUCCHETTO_CRON_MS = 330 * 1000;
/* Dopo un blocco dell'account di posta, le chiamate a mano (la pagina di
   gestione ne fa una ogni 2 secondi) aspettano un po' prima di riprovare:
   tanti login sbagliati di fila sono proprio quello che fa sospendere un
   account. Il cron passa ogni 5 minuti e riprova comunque. */
const PAUSA_BLOCCO_MS = 2 * MINUTO;
// quante volte una persona puo' tornare in coda per un rifiuto temporaneo SUO prima di diventare 'errore'
const MAX_RIMANDI = 3;
// Brevo: cache dei rimbalzi 10 minuti, e dal cron al massimo ogni mezz'ora
const CACHE_ESITI_MS = 10 * MINUTO;
const OGNI_ESITI_CRON_MS = 30 * MINUTO;
const PER_PAGINA_BREVO = 2500;
const MAX_PAGINE_BREVO = 4;
/* Solo i rifiuti PERMANENTI (DECISIONI T2 e D14: 'respinta' = il
   destinatario non ricevera' mai). Un softBounce (casella piena, server
   del destinatario momentaneamente giu') non dice niente di definitivo, e
   puo' riguardare un'altra email allo stesso indirizzo: segnare
   'respinta' credenziali gia' consegnate farebbe partire, con "Reinvia a
   chi non l'ha ricevuta", una password nuova che cancella quella buona. */
const TIPI_RIMBALZO = ['hardBounces', 'blocked', 'invalid'];
/* Chi riceve i promemoria: SOLO chi ha le credenziali per quell'evento
   in stato 'inviata' (e l'account attivo). Non chi e' ancora 'da
   inviare', 'in coda', 'respinta', 'errore' o 'incerto': un promemoria
   senza la password a chi la password non l'ha (o forse non l'ha) e'
   solo un invito a scrivere all'assistenza. */
const STATI_PROMEMORIA = ['inviata'];
const TIPI_PROMEMORIA = ['giorno', 'ora'];

/* ---------- regolazioni (variabili d'ambiente, vedi README) ---------- */
function lotto() { return Math.max(1, C.intero('DIRETTA_MAX_LOTTO', 40)); }
function concorrenza() { return Math.max(1, C.intero('DIRETTA_CONCORRENZA', 4)); }
function pausaGruppi() { return C.intero('DIRETTA_PAUSA_MS', 300); }
function maxGiorno() { return C.intero('DIRETTA_MAX_GIORNO', 0); }
/* La parte del tetto giornaliero che possono usare le email fatte
   partire dal modulo pubblico del sito (vedi IL MODULO DEL SITO NON SI
   PRENDE TUTTO IL TETTO): 60% di base. Meno delle reimpostazioni (80%),
   che sono anch'esse pubbliche ma servono a chi e' gia' iscritto; il
   40% che resta e' del gestore (credenziali, promemoria). Con
   DIRETTA_MAX_GIORNO a 0 (nessun tetto) non conta. */
function quotaModulo() { return Math.min(100, C.intero('DIRETTA_MODULO_PERCENTO', 60)) / 100; }

/* ---------- attrezzi ---------- */
function validaEvento(id) {
    const s = String(id || '');
    if (!RE_ID_EVENTO.test(s)) throw C.errore(400, 'Evento non valido', 'evento');
    return s;
}
function ts(ctx, ms) { return ctx.Timestamp.fromMillis(ms == null ? ctx.adesso() : ms); }
function millis(v) {
    if (v == null) return NaN;
    if (typeof v === 'number') return v;
    if (typeof v.toMillis === 'function') return v.toMillis();
    return NaN;
}
function voce(dati, idEvento) {
    return (dati && dati.invii && dati.invii[idEvento]) || {};
}
/* L'indirizzo a cui si spedisce: UNA regola sola, la stessa del
   caricamento (lib/diretta-dati.js) e di "una email = un account":
   l'indirizzo normalizzato, senza spazi ne' caratteri invisibili, in
   minuscolo, controllato con emailValida. Per i profili caricati prima
   che si salvasse cosi' si ricava dall'email scritta. */
function indirizzoDi(dati) {
    return String((dati && (dati.emailNorm || E.normalizzaEmail(dati.email))) || '');
}
function rifCoda(ctx, idEvento) { return ctx.db.collection('code').doc(idEvento); }
function rifPartecipanti(ctx) { return ctx.db.collection('partecipanti'); }
function campoStato(ctx, idEvento) { return new ctx.FieldPath('invii', idEvento, 'stato'); }
function conStato(ctx, idEvento, stato) {
    // UN solo filtro: basta l'indice automatico sul campo della mappa
    return rifPartecipanti(ctx).where(campoStato(ctx, idEvento), '==', stato);
}
async function conta(ctx, idEvento, stato) {
    const s = await conStato(ctx, idEvento, stato).count().get();
    return s.data().count;
}
/* I campi di invii.<idEvento> da aggiornare, come coppie campo/valore
   (FieldPath: l'identificativo dell'evento contiene trattini). undefined
   vuol dire "togli il campo". In coda l'aggiornato del documento. */
function argomentiVoce(ctx, idEvento, campi, ora) {
    const args = [];
    Object.keys(campi).forEach(k => {
        args.push(new ctx.FieldPath('invii', idEvento, k), campi[k] === undefined ? ctx.FieldValue.delete() : campi[k]);
    });
    args.push('aggiornato', ts(ctx, ora));
    return args;
}
async function leggiEvento(ctx, idEvento) {
    const s = await ctx.db.collection('eventi').doc(idEvento).get();
    if (!s.exists) throw C.errore(404, 'Evento inesistente', 'evento');
    return Object.assign({ id: idEvento }, s.data());
}
/* ---------- che cosa sa gia' la persona (UNA PASSWORD PER PERSONA) ----------
   Tutte e tre le funzioni qui sotto leggono il profilo com'era PRIMA
   della presa in carico e contano solo quello che e' successo DOPO
   l'ultima correzione dell'indirizzo (vedi L'INDIRIZZO CORRETTO TAGLIA
   LA STORIA in testa al file). */
const STATI_PARTITI = ['inviata', 'incerto', 'invio'];
// da quando conta la storia: l'ultima correzione dell'email (0 se mai corretta)
function tagliaStoria(d) {
    const t = millis(d && d.emailCambiata);
    return Number.isFinite(t) ? t : 0;
}
/* Quando e' partita (o forse partita) una voce: l'invio riuscito
   (inviata), altrimenti l'ultimo cambio di stato (aggiornato: per
   'incerto' e 'invio' e' il momento della spedizione). */
function quandoVoce(v) {
    const inviata = millis(v && v.inviata);
    return Number.isFinite(inviata) ? inviata : millis(v && v.aggiornato);
}
/* La voce e' partita (o forse partita) verso l'indirizzo di ADESSO?
   Una voce senza nessuna data (profili di prima) conta come partita:
   NaN < dopo e' falso. */
function partitaDopo(v, dopo) {
    return !!(v && (v.inviata || STATI_PARTITI.indexOf(v.stato) >= 0)) && !(quandoVoce(v) < dopo);
}
// un istante del profilo (Timestamp) successivo al taglio: NaN (campo assente) non lo e' mai
function dopoIlTaglio(valore, dopo) {
    return millis(valore) >= dopo;
}

/* La persona aveva gia' una password? L'account e' uno solo, con una
   sola password: quella nuova rende inutile la vecchia, e l'email lo
   deve dire (vedi credenziali() in diretta-mail.js).
     'evento'       -> per QUESTO evento: le credenziali gia' inviate una
                       volta al suo indirizzo di adesso (anche se poi e'
                       tornata 'da inviare', respinta o in errore), oppure
                       forse partite ('incerto', o un 'invio' rimasto a
                       meta');
     'altro-evento' -> le credenziali di un altro evento;
     'precedente'   -> nessuna email di credenziali, ma una password ce
                       l'ha: scelta da lei con «Password dimenticata?»
                       (resetInviato), data a voce dal gestore
                       (passwordAVoce), gia' usata per entrare
                       (ultimoAccesso), o comunque gia' c'era quando le e'
                       partito un avviso «anche». Succede con il "Reinvia"
                       del gestore, che la cambia comunque: l'email dice
                       che quella di prima non vale piu';
     ''             -> niente: e' la prima.
   Un avviso «anche» non e' una password ricevuta: la voce con tipo
   'anche' non fa dire "la password che avevi ricevuto". Credenziali e
   accessi di PRIMA di una correzione dell'indirizzo non contano
   (L'INDIRIZZO CORRETTO TAGLIA LA STORIA). */
function sostituzione(dati, idEvento) {
    const d = dati || {};
    const dopo = tagliaStoria(d);
    const credenziali = v => partitaDopo(v, dopo) && v.tipo !== 'anche';
    if (credenziali(voce(d, idEvento))) return 'evento';
    const invii = d.invii || {};
    if (Object.keys(invii).some(k => k !== idEvento && credenziali(invii[k]))) return 'altro-evento';
    const avvisi = Object.keys(invii).some(k => partitaDopo(invii[k], dopo));
    if (avvisi || passwordPropriaDopo(d, dopo)) return 'precedente';
    return '';
}

/* La persona ha gia' una password che funziona? Si' se:
     - le CREDENZIALI (non l'avviso «anche») di un altro evento sono
       partite, o forse partite ('inviata', 'incerto', 'invio' in questo
       momento);
     - il gestore gliene ha data una a voce (passwordAVoce);
     - le e' partito il collegamento di «Password dimenticata?»
       (resetInviato): non si sa se l'ha usato, ma se l'ha usato la
       password l'ha scelta lei, e una nostra la cancellerebbe senza
       dirglielo; se non l'ha usato, l'avviso «anche» le ricorda proprio
       «Password dimenticata?», che conosce gia';
     - e' gia' entrata nella diretta (ultimoAccesso): la password che usa
       funziona.
   Contano solo le cose successive all'ultima correzione dell'indirizzo
   (emailCambiata): quelle di prima sono andate a un'altra casella (e un
   accesso di prima puo' averlo fatto chi leggeva quella casella).
   `tranne` e' l'evento che si sta spedendo. */
// una password "sua" (voce, reimpostazione, accesso) successiva all'istante `dopo`
function passwordPropriaDopo(d, dopo) {
    return dopoIlTaglio(d.passwordAVoce, dopo) || dopoIlTaglio(d.resetInviato, dopo) || dopoIlTaglio(d.ultimoAccesso, dopo);
}
function haPassword(dati, tranne) {
    const d = dati || {};
    const dopo = tagliaStoria(d);
    const invii = d.invii || {};
    const partite = Object.keys(invii).some(k => {
        const v = invii[k] || {};
        if (k === tranne || v.tipo === 'anche' || STATI_PARTITI.indexOf(v.stato) < 0) return false;
        return !(quandoVoce(v) < dopo);
    });
    return partite || passwordPropriaDopo(d, dopo);
}
/* Che cosa parte per questo evento: 'credenziali' (con una password
   nuova) o 'anche' (l'avviso, senza password). Vedi UNA PASSWORD PER
   PERSONA in testa al file. `forza`: il "Reinvia" del gestore.
   Le credenziali di QUESTO evento gia' partite (un reinvio a chi non
   l'ha ricevuta: respinta, errore) fanno ripartire le credenziali solo
   se erano andate all'indirizzo di adesso: quelle partite prima di una
   correzione dell'email non contano, e allora decide haPassword (chi
   nel frattempo ha ricevuto la password di un altro evento al nuovo
   indirizzo riceve «anche», e quella password continua a valere).
   E anche quando erano andate all'indirizzo giusto, se DOPO quell'invio
   la persona si e' fatta una password sua (reimpostazione, voce,
   accesso), parte «anche»: rimandare le credenziali la cancellerebbe. */
function tipoInvio(dati, idEvento, forza) {
    if (forza) return 'credenziali';
    const d = dati || {};
    const dopo = tagliaStoria(d);
    const v = voce(d, idEvento);
    if (v.tipo !== 'anche' && partitaDopo(v, dopo)) {
        return passwordPropriaDopo(d, Math.max(dopo, quandoVoce(v) || 0)) ? 'anche' : 'credenziali';
    }
    return haPassword(d, idEvento) ? 'anche' : 'credenziali';
}
/* Nei log mai un indirizzo intero: resta il dominio, che basta a capire
   "e' Gmail che rifiuta" senza scrivere di chi si tratta. */
function mascheraEmail(s) {
    return String(s == null ? '' : s).replace(/[^\s<>()"',;:]+@([^\s<>()"',;:]+)/g, '***@$1');
}
function motivoBreve(e) {
    const codice = e && e.responseCode ? String(e.responseCode) : '';
    let m = String((e && e.message) || e || 'errore sconosciuto').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    if (codice && m.indexOf(codice) < 0) m = codice + ' ' + m;
    return m.slice(0, 180);
}
function log(msg, e) {
    console.error('[diretta-invio] ' + msg + (e ? ': ' + mascheraEmail(motivoBreve(e)) : ''));
}

/* Il limitatore delle scritture su Firebase Auth (lib/diretta-auth.js):
   si carica QUI dentro e non in cima al file, cosi' questo modulo si
   carica anche dove quel file non c'e' (le prove di una parte sola). */
function conLimiteAuth(fn) {
    let limitatore;
    try {
        limitatore = require('./diretta-auth').conLimite;
    } catch (e) {
        if (!(e && e.code === 'MODULE_NOT_FOUND' && /diretta-auth/.test(String(e.message)))) throw e;
        limitatore = f => f();
    }
    return limitatore(fn);
}

/* ============================================================
   COME SI LEGGE UN ERRORE DEL SERVER DI POSTA
   ============================================================ */

/* Un rifiuto che riguarda NOI, non il destinatario. COPIA (senza
   require, per tenere la diretta separata) di fermaTutto() in
   lib/canali-invito.js: se la' cambia, va cambiata anche qui.
   Un indirizzo inesistente e' un problema di quella riga e si va
   avanti; un IP bloccato o un tetto superato valgono per tutto il
   lotto, e insistere non lo migliora - semmai allunga il blocco e
   brucia il resto dell'elenco marcandolo "errore" senza motivo. */
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

/* L'errore e' avvenuto PRIMA che il messaggio partisse (prima del DATA)?
   Allora e' certo che non e' arrivato niente, e la persona puo' tornare
   in coda senza rischio di doppioni.
   ATTENZIONE a un dettaglio di nodemailer: gli errori della connessione
   (socket chiuso, tempo scaduto) portano sempre command 'CONN', in
   QUALUNQUE momento avvengano, anche dopo che il messaggio e' stato
   trasmesso e si aspettava solo il "250 OK". Quindi 'CONN' da solo non
   basta: vale "prima" solo se il messaggio dice che la connessione non
   si e' nemmeno aperta (indirizzo sconosciuto, rifiutata, nessun saluto
   del server). Una connessione caduta a meta' e' 'incerto'. */
const COMANDI_PRIMA_DEL_DATA = /^(EHLO|HELO|LHLO|STARTTLS|MAIL FROM|RCPT TO|API|AUTH\b.*)$/;
function primaDelData(e) {
    if (!e) return false;
    if (e.code === 'EAUTH' || e.code === 'ECONFIG') return true;
    const comando = String(e.command || '').toUpperCase();
    if (COMANDI_PRIMA_DEL_DATA.test(comando)) return true;
    if (comando === 'CONN' || !comando) {
        if (e.code === 'EDNS') return true;
        return /Connection timeout|Greeting never received|Invalid greeting|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|getaddrinfo|Error initiating TLS/i.test(String(e.message || ''));
    }
    return false;
}

/* Dall'errore all'esito per la persona:
   { stato: 'respinta'|'errore'|'incerto'|'in coda', ferma, motivo, destinatario }
   Oltre ai casi di fermaTutto, ferma il lotto anche ogni errore PRIMA del
   DATA che non riguarda il destinatario: server irraggiungibile, saluto
   mancato, mittente rifiutato. Sono guai del canale, uguali per tutti:
   continuare vorrebbe dire segnare "errore" l'intero elenco. Solo il
   rifiuto sul destinatario (RCPT TO) o un indirizzo malformato (API)
   riguardano quella persona e basta. */
function problemaNostro(e) {
    if (fermaTutto(e)) return true;
    const comando = String((e && e.command) || '').toUpperCase();
    return primaDelData(e) && comando !== 'RCPT TO' && comando !== 'API';
}
function classifica(e) {
    const motivo = motivoBreve(e);
    const comando = String((e && e.command) || '').toUpperCase();
    const codice = Number(e && e.responseCode) || 0;
    const prima = primaDelData(e);
    if (problemaNostro(e)) {
        // non e' partita: torna in coda, e il lotto si ferma
        if (prima) return { stato: 'in coda', ferma: true, motivo: motivo, destinatario: comando === 'RCPT TO' };
        // il server ha risposto "no" dopo il DATA: non e' partita; senza risposta: forse si'
        return { stato: codice >= 400 ? 'errore' : 'incerto', ferma: true, motivo: motivo };
    }
    if (comando === 'RCPT TO' && codice >= 500) return { stato: 'respinta', motivo: motivo };
    if (prima || codice >= 400) return { stato: 'errore', motivo: motivo };
    return { stato: 'incerto', motivo: motivo };
}

/* La password non si e' potuta impostare: l'email non parte. Se e'
   l'account a non esistere piu' e' un problema della persona ('errore');
   se e' Firebase che non risponde e' un problema di tutti: si ferma il
   lotto e la persona torna in coda. */
function esitoAuth(e) {
    const codice = String((e && (e.code || (e.errorInfo && e.errorInfo.code))) || '');
    const motivo = 'Password non impostata (' + (codice || 'errore di Firebase') + ')';
    if (/user-not-found|invalid-uid|user-disabled/.test(codice)) {
        return { stato: 'errore', auth: true, motivo: 'Account di accesso inesistente o disattivato: ricarica il file per ricrearlo' };
    }
    return { stato: 'in coda', ferma: true, auth: true, motivo: motivo };
}

/* ============================================================
   IL TRASPORTO: Brevo, oppure la posta finta delle prove
   ============================================================ */

/* La posta finta: SOLO con l'emulatore (ctx.emulatore) e SOLO in una
   cartella risultati/ (quella delle prove, ignorata da git: dentro ci
   sono password di prova in chiaro). Ogni messaggio e' una riga JSON
   { a, oggetto, html, testo, quando, intestazioni, tipo }. Per simulare
   i guai del server di posta, indirizzi separati da virgola in:
     DIRETTA_POSTA_RIFIUTA          -> 550 sul destinatario ('respinta')
     DIRETTA_POSTA_ERRORE_MESSAGGIO -> 554 dopo il DATA ('errore')
     DIRETTA_POSTA_INCERTA          -> connessione caduta dopo l'invio ('incerto')
   e DIRETTA_POSTA_ERRORE_ACCOUNT=1 -> login rifiutato (EAUTH), prima del
   DATA, per tutti. DIRETTA_POSTA_RITARDO_MS aspetta DOPO aver scritto la
   riga: e' il momento in cui la mail e' partita ma nessuno lo sa ancora. */
function fileFinto(ctx) {
    const f = String(process.env.DIRETTA_POSTA_FINTA || '').trim();
    if (!ctx || ctx.emulatore !== true || !f) return '';
    const assoluto = path.resolve(f);
    if (path.dirname(assoluto).split(path.sep).indexOf('risultati') < 0) {
        const e = new Error('DIRETTA_POSTA_FINTA deve stare in una cartella risultati/ (ignorata da git)');
        e.code = 'ECONFIG';
        throw e;
    }
    return assoluto;
}
function inLista(lista, indirizzo) {
    return String(lista || '').toLowerCase().split(/[\s,;]+/).filter(Boolean).indexOf(String(indirizzo || '').toLowerCase()) >= 0;
}
// un errore con la stessa forma di quelli di nodemailer (_formatError)
function erroreSmtp(messaggio, codice, risposta, comando) {
    const e = new Error(messaggio + (risposta ? ': ' + risposta : ''));
    e.code = codice;
    if (risposta) { e.response = risposta; e.responseCode = Number((/^\d+/.exec(risposta) || [])[0]) || undefined; }
    e.command = comando;
    return e;
}
function postaFinta(file) {
    return {
        finta: true,
        async sendMail(m) {
            const a = String(m.to || '').trim().toLowerCase();
            const env = process.env;
            if (env.DIRETTA_POSTA_ERRORE_ACCOUNT === '1') {
                throw erroreSmtp('Invalid login', 'EAUTH', '535 5.7.8 Error: authentication failed', 'AUTH PLAIN');
            }
            if (inLista(env.DIRETTA_POSTA_RIFIUTA, a)) {
                throw erroreSmtp('Can\'t send mail - all recipients were rejected', 'EENVELOPE', '550 5.1.1 <' + a + '>: Recipient address rejected: User unknown', 'RCPT TO');
            }
            if (inLista(env.DIRETTA_POSTA_ERRORE_MESSAGGIO, a)) {
                throw erroreSmtp('Message failed', 'EMESSAGE', '554 5.6.0 Message rejected', 'DATA');
            }
            const riga = {
                a: a, oggetto: m.subject, html: m.html, testo: m.text, quando: new Date().toISOString(),
                intestazioni: Object.assign({ from: m.from, 'reply-to': m.replyTo }, m.headers || {}),
                tipo: m.tipoDiretta || ''
            };
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.appendFileSync(file, JSON.stringify(riga) + '\n');
            const ritardo = Number(env.DIRETTA_POSTA_RITARDO_MS) || 0;
            if (ritardo > 0) await C.pausa(ritardo);
            if (inLista(env.DIRETTA_POSTA_INCERTA, a)) {
                const e = new Error('Timeout');
                e.code = 'ETIMEDOUT';
                e.command = 'CONN';
                throw e;
            }
            return { messageId: '<finta-' + crypto.randomBytes(6).toString('hex') + '@diretta.prova>', accepted: [a], rejected: [] };
        },
        close() { /* niente da chiudere */ }
    };
}

/* Brevo, con gli stessi SMTP_* del resto del servizio. Pool di due
   connessioni: con quattro invii in parallelo si riusano, invece di
   aprire e chiudere un collegamento per ogni email. Tempi massimi
   stretti: una risposta lenta non deve mangiarsi il budget della
   funzione e lasciare persone in 'invio'. Un trasporto per giro, chiuso
   alla fine: fra due chiamate l'istanza di Vercel si congela, e una
   connessione tenuta aperta la' in mezzo si ritroverebbe morta. */
function creaTrasporto(ctx) {
    const finta = fileFinto(ctx);
    if (finta) return postaFinta(finta);
    const host = String(process.env.SMTP_HOST || '').trim();
    const utente = String(process.env.SMTP_USER || '').trim();
    const segreto = String(process.env.SMTP_PASS || '');
    if (!host || !utente || !segreto) {
        const e = new Error('Server di posta non configurato: mancano SMTP_HOST, SMTP_USER o SMTP_PASS');
        e.code = 'ECONFIG';
        throw e;
    }
    const porta = Number(process.env.SMTP_PORT) || 465;
    const nodemailer = require('nodemailer');
    return nodemailer.createTransport({
        host: host, port: porta, secure: porta === 465,
        auth: { user: utente, pass: segreto },
        pool: true, maxConnections: 2, maxMessages: 100,
        connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000
    });
}
function chiudi(trasporto) {
    try { if (trasporto && typeof trasporto.close === 'function') trasporto.close(); } catch (_) { /* gia' chiuso */ }
}
function mittente() {
    const nome = String(process.env.SMTP_FROM_NAME || 'Revilaw S.p.A.').replace(/["\r\n<>\\]/g, ' ').trim().slice(0, 80) || 'Revilaw S.p.A.';
    const email = String(process.env.SMTP_FROM_EMAIL || 'noreply@nextgenerationbusiness.it').trim();
    return '"' + nome + '" <' + email + '>';
}
/* Una email: mittente di Revilaw, risposte all'assistenza (non al
   noreply), e l'intestazione X-Mailin-custom che Brevo riporta nei suoi
   eventi: dice di che evento e di che persona e' quella email. */
async function spedisci(trasporto, opz) {
    const info = await trasporto.sendMail({
        from: mittente(),
        replyTo: C.assistenza().email,
        to: opz.a,
        subject: opz.mail.oggetto,
        text: opz.mail.testo,
        html: opz.mail.html,
        headers: { 'X-Mailin-custom': opz.custom, 'X-Mailin-Tag': 'diretta' },
        tipoDiretta: opz.tipo
    });
    // un solo destinatario: se non e' fra gli accettati, e' stato rifiutato
    if (info && Array.isArray(info.rejected) && info.rejected.length && !(info.accepted || []).length) {
        throw erroreSmtp('Recipient rejected', 'EENVELOPE', '550 destinatario rifiutato', 'RCPT TO');
    }
    return info;
}

/* ============================================================
   IL TETTO GIORNALIERO (DIRETTA_MAX_GIORNO, 0 = nessun tetto)
   contatori/giorno-YYYYMMDD, giorno di Roma. Si riserva un blocco di
   invii per volta (un lotto) in una transazione, e alla fine si
   restituisce quello che non si e' usato: una transazione per lotto
   invece di una per email. Con il tetto a 0 il contatore non si tocca.
   `frazione` serve alle email che arrivano da richieste PUBBLICHE: le
   reimpostazioni si fermano all'80%, le password del modulo del sito al
   60% (quotaModulo), per lasciare spazio a credenziali e promemoria. Il
   contatore e' uno solo: una frazione dice "si parte solo finche' le
   email di oggi, di tutti, sono meno di tanto".
   ============================================================ */
function chiaveGiorno(ctx) {
    return 'giorno-' + C.dataRoma(ctx.adesso()).replace(/-/g, '');
}
async function riserva(ctx, n, frazione) {
    const max = maxGiorno();
    if (!max || n <= 0) return { preso: Math.max(0, n), chiave: null };
    const tetto = Math.floor(max * (frazione == null ? 1 : frazione));
    const chiave = chiaveGiorno(ctx);
    const ref = ctx.db.collection('contatori').doc(chiave);
    const preso = await ctx.db.runTransaction(async tx => {
        const s = await tx.get(ref);
        const usate = s.exists ? Number(s.data().inviate) || 0 : 0;
        const p = Math.max(0, Math.min(n, tetto - usate));
        if (p > 0) tx.set(ref, { inviate: usate + p, aggiornato: ctx.adesso() }, { merge: true });
        return p;
    });
    return { preso: preso, chiave: chiave };
}
async function restituisci(ctx, prenotazione, n) {
    if (!prenotazione || !prenotazione.chiave || !(n > 0)) return;
    try {
        await ctx.db.collection('contatori').doc(prenotazione.chiave).update({ inviate: ctx.FieldValue.increment(-n) });
    } catch (e) { log('contatore giornaliero non aggiornato', e); }
}

/* ============================================================
   IL LUCCHETTO della coda di un evento (code/{idEvento})
   ============================================================ */
async function prendiLucchetto(ctx, idEvento, durataMs) {
    const ref = rifCoda(ctx, idEvento);
    const giro = crypto.randomBytes(8).toString('hex');
    const preso = await ctx.db.runTransaction(async tx => {
        const s = await tx.get(ref);
        const d = s.exists ? s.data() : {};
        const ora = ctx.adesso();
        if ((Number(d.lucchettoFino) || 0) > ora) return false;
        tx.set(ref, { lucchettoFino: ora + durataMs, giro: giro, aggiornato: ora }, { merge: true });
        return true;
    });
    return preso ? giro : null;
}
// lo si molla solo se e' ancora nostro, insieme ai campi da scrivere alla fine del giro
async function mollaLucchetto(ctx, idEvento, giro, campi) {
    const ref = rifCoda(ctx, idEvento);
    await ctx.db.runTransaction(async tx => {
        const s = await tx.get(ref);
        const d = s.exists ? s.data() : {};
        const dati = Object.assign({ aggiornato: ctx.adesso() }, campi || {});
        if (d.giro === giro) { dati.lucchettoFino = 0; dati.giro = null; }
        tx.set(ref, dati, { merge: true });
    });
}

/* ============================================================
   UNA PERSONA: la presa in carico, l'invio, l'esito
   ============================================================ */

/* La presa in carico, in transazione: la persona passa in 'invio' solo
   se il suo stato e' quello atteso (`ammesso`). Con `individuale` (il
   pulsante "Reinvia") le condizioni che non vanno diventano un errore da
   mostrare; nel giro in blocco chi non si puo' raggiungere (disattivato,
   account non creato, tolto dall'evento) torna 'da inviare' con il
   perche', cosi' non resta in coda per sempre. */
function nonInviabile(d, idEvento) {
    if (d.stato !== 'attivo') return 'Account disattivato: riattivalo prima di inviare le credenziali';
    if (!d.authCreato) return 'Account non ancora creato: ricarica il file per completarlo';
    if (!(Array.isArray(d.eventi) && d.eventi.indexOf(idEvento) >= 0)) return 'La persona non è iscritta a questo evento';
    if (!E.emailValida(indirizzoDi(d))) return 'Indirizzo email non valido';
    return '';
}
async function reclama(ctx, ref, idEvento, opz) {
    return ctx.db.runTransaction(async tx => {
        const s = await tx.get(ref);
        if (!s.exists) return { preso: false, http: 404, messaggio: 'Partecipante inesistente' };
        const d = s.data();
        const v = voce(d, idEvento);
        const ora = ctx.adesso();
        // `ammesso` risponde true, oppure false o la frase che spiega perche' no
        const ammesso = opz.ammesso(v, ora);
        if (ammesso !== true) {
            return { preso: false, http: 409, messaggio: typeof ammesso === 'string' ? ammesso : 'Stato cambiato nel frattempo', stato: v.stato };
        }
        const perche = nonInviabile(d, idEvento);
        if (perche) {
            if (opz.individuale) return { preso: false, http: 409, messaggio: perche, stato: v.stato };
            tx.update(ref, ...argomentiVoce(ctx, idEvento, { stato: 'da inviare', aggiornato: ts(ctx, ora), errore: perche, rimandi: undefined }, ora));
            return { preso: false, rimessa: true, stato: v.stato };
        }
        tx.update(ref, ...argomentiVoce(ctx, idEvento, {
            stato: 'invio', aggiornato: ts(ctx, ora), tentativi: (Number(v.tentativi) || 0) + 1, errore: undefined
        }, ora));
        return { preso: true, dati: d, voce: v };
    });
}

/* Una persona: le credenziali (nuova password, impostata sull'account e
   scritta nell'email: esiste solo dentro questa funzione) oppure
   l'avviso «Sei iscritto anche a...» senza password, secondo tipoInvio.
   Cambiare la password chiude anche le sessioni aperte con quella
   vecchia (entro un'ora, alla scadenza del token): e' quello che si
   vuole quando si reinvia. `opz.forza`: il "Reinvia" del gestore, sempre
   con una password nuova. -> l'esito, con `tipo`. */
async function inviaUna(ctx, trasporto, idEvento, evento, uid, dati, opz) {
    const tipo = tipoInvio(dati, idEvento, opz && opz.forza);
    const comune = {
        evento: evento, idEvento: idEvento, nome: dati.nome, cognome: dati.cognome, email: indirizzoDi(dati),
        paginaEvento: evento.paginaEvento, assistenza: C.assistenza(), adesso: ctx.adesso()
    };
    if (tipo === 'anche') {
        try {
            await spedisci(trasporto, { a: indirizzoDi(dati), mail: M.iscrittoAnche(comune), custom: 'diretta|' + idEvento + '|' + uid, tipo: 'iscritto-anche' });
            return { stato: 'inviata', tipo: 'anche' };
        } catch (e) {
            return Object.assign(classifica(e), { tipo: 'anche' });
        }
    }
    const password = generaPassword(10);
    try {
        await conLimiteAuth(() => ctx.auth.updateUser(uid, { password: password }));
    } catch (e) {
        return Object.assign(esitoAuth(e), { tipo: 'credenziali' });
    }
    const mail = M.credenziali(Object.assign({ password: password, sostituisce: sostituzione(dati, idEvento) }, comune));
    try {
        await spedisci(trasporto, { a: indirizzoDi(dati), mail: mail, custom: 'diretta|' + idEvento + '|' + uid, tipo: 'credenziali' });
        return { stato: 'inviata', tipo: 'credenziali' };
    } catch (e) {
        return Object.assign(classifica(e), { tipo: 'credenziali' });
    }
}

/* L'esito sul documento della persona. Scrittura semplice, senza
   rileggere: la persona e' "nostra" da quando e' in 'invio'. Se proprio
   questa scrittura fallisse, la persona resterebbe in 'invio' e il cron
   la farebbe diventare 'incerto': mai un secondo invio. */
async function applicaEsito(ctx, ref, idEvento, prec, esito) {
    const ora = ctx.adesso();
    let campi;
    if (esito.stato === 'inviata') {
        campi = { stato: 'inviata', inviata: ts(ctx, ora), aggiornato: ts(ctx, ora), errore: undefined, rimandi: undefined };
    } else if (esito.stato === 'in coda') {
        // torna in coda: che cosa mandare si decidera' di nuovo al prossimo giro (niente `tipo`)
        /* Un rifiuto temporaneo che riguarda SOLO questa persona (sul suo
           indirizzo) non deve fermare la coda per sempre: si contano quelli, e
           al quarto diventa 'errore'. I blocchi dell'account (login, server
           irraggiungibile) non si contano: non sono colpa sua. */
        const rimandi = (Number(prec && prec.rimandi) || 0) + (esito.destinatario ? 1 : 0);
        if (rimandi > MAX_RIMANDI) {
            campi = { stato: 'errore', aggiornato: ts(ctx, ora), errore: 'Rifiuto temporaneo ripetuto del destinatario: ' + esito.motivo, rimandi: undefined };
        } else {
            campi = { stato: 'in coda', aggiornato: ts(ctx, ora), rimandi: rimandi || undefined, errore: undefined };
        }
    } else {
        campi = { stato: esito.stato, aggiornato: ts(ctx, ora), errore: esito.motivo || '' };
    }
    // che cosa e' partito (o si e' provato a far partire): le credenziali o l'avviso «anche»
    if (esito.tipo && campi.stato !== 'in coda') campi.tipo = esito.tipo;
    for (let prova = 0; prova < 2; prova++) {
        try { await ref.update(...argomentiVoce(ctx, idEvento, campi, ora)); return campi.stato; }
        catch (e) { if (prova) log('esito non registrato (la persona resta in invio)', e); else await C.pausa(300); }
    }
    return 'invio';
}

/* ============================================================
   LA CODA: il giro vero e proprio (senza lucchetto)
   Lotti di DIRETTA_MAX_LOTTO persone 'in coda', a gruppi di
   DIRETTA_CONCORRENZA in parallelo, con DIRETTA_PAUSA_MS fra un gruppo
   e l'altro, finche' c'e' tempo. Il tempo si guarda PRIMA di ogni
   gruppo, mai in mezzo: una email partita e non registrata e' proprio
   il caso che tutto questo serve a evitare.
   LE VOCI DEL MODULO DEL SITO (automatica: true) hanno la loro parte del
   tetto (quotaModulo): nello stesso lotto si riserva prima per le altre
   (il gestore: tutto il tetto) e poi per loro (fino al 60%). Quelle che
   non ci stanno restano 'in coda' e il giro va oltre (un cursore sul
   documento, startAfter: l'ordine delle query e' quello degli id), cosi'
   non tengono ferme le persone del gestore che vengono dopo. Se alla
   fine del giro sono rimaste solo loro, il giro dice limiteGiorno
   (partono domani da sole: e' quello che la gestione mostra). */
async function lavoraCoda(ctx, idEvento, opz) {
    const scadenza = Date.now() + Math.max(1000, Number(opz && opz.budgetMs) || 40000);
    const r = { inviate: 0, respinte: 0, errori: 0, incerti: 0, rimandate: 0, persi: 0, bloccato: null, limiteGiorno: false, esaurita: false, trattenute: 0 };
    const trattenute = new Set();   // le voci del modulo lasciate in coda (oltre la loro parte del tetto)
    const evento = await leggiEvento(ctx, idEvento);
    let trasporto;
    try { trasporto = creaTrasporto(ctx); } catch (e) { r.bloccato = motivoBreve(e); log('coda ' + idEvento + ' ferma', e); return r; }
    await rifCoda(ctx, idEvento).set({ ultimoInvio: ctx.adesso() }, { merge: true });
    const pausa = pausaGruppi();
    let primoGruppo = true;
    let dopo = null;   // l'ultimo documento di un lotto con voci del modulo lasciate in coda
    try {
        while (Date.now() < scadenza && !r.bloccato) {
            let q = conStato(ctx, idEvento, 'in coda');
            if (dopo) q = q.startAfter(dopo);
            const snap = await q.limit(lotto()).get();
            if (snap.empty) {
                if (trattenute.size) r.limiteGiorno = true;
                else r.esaurita = true;
                break;
            }
            const delModulo = [], altre = [];
            snap.docs.forEach(doc => (voce(doc.data(), idEvento).automatica === true ? delModulo : altre).push(doc));
            const prenAltre = await riserva(ctx, altre.length);
            const prenModulo = await riserva(ctx, delModulo.length, quotaModulo());
            // la stessa chiave del giorno per le due (o nessuna, senza tetto): si restituisce da una sola
            const prenotazione = { preso: prenAltre.preso + prenModulo.preso, chiave: prenAltre.chiave || prenModulo.chiave };
            delModulo.slice(prenModulo.preso).forEach(doc => trattenute.add(doc.id));
            /* Il cursore va oltre il lotto solo se tutte le persone del gestore
               del lotto sono partite: quelle rimaste fuori per il tetto (una
               email respinta restituisce il suo posto, e il giro dopo lo usa)
               si rileggono al giro seguente, come prima. */
            if (prenModulo.preso < delModulo.length && prenAltre.preso === altre.length) dopo = snap.docs[snap.docs.length - 1];
            const docs = altre.slice(0, prenAltre.preso).concat(delModulo.slice(0, prenModulo.preso));
            if (!docs.length) {
                // il tetto e' pieno per tutti: le altre partono domani
                if (altre.length) { r.limiteGiorno = true; break; }
                continue;   // solo voci del modulo oltre la loro parte: si va al lotto dopo
            }
            let usate = 0;
            const n = concorrenza();
            for (let i = 0; i < docs.length && !r.bloccato; i += n) {
                if (Date.now() >= scadenza) break;
                if (!primoGruppo && pausa > 0) await C.pausa(pausa);
                primoGruppo = false;
                const esiti = await Promise.all(docs.slice(i, i + n).map(async doc => {
                    let presa;
                    try {
                        presa = await reclama(ctx, doc.ref, idEvento, { ammesso: v => v.stato === 'in coda' });
                    } catch (e) {
                        // transazione non riuscita (contesa, rete): niente e' cambiato, la persona resta com'era
                        log('presa in carico non riuscita', e);
                        r.persi++;
                        return null;
                    }
                    if (!presa.preso) { if (!presa.rimessa) r.persi++; return null; }
                    const esito = await inviaUna(ctx, trasporto, idEvento, evento, doc.id, presa.dati);
                    esito.registrato = await applicaEsito(ctx, doc.ref, idEvento, presa.voce, esito);
                    return esito;
                }));
                esiti.forEach(e => {
                    if (!e) return;
                    // sul tetto del giorno pesa quello che il server di posta ha preso (o forse preso)
                    if (e.stato === 'inviata' || e.stato === 'incerto') usate++;
                    if (e.registrato === 'inviata') r.inviate++;
                    else if (e.registrato === 'respinta') r.respinte++;
                    else if (e.registrato === 'errore') r.errori++;
                    else if (e.registrato === 'incerto' || e.registrato === 'invio') r.incerti++;
                    else if (e.registrato === 'in coda') r.rimandate++;
                    if (e.ferma && !r.bloccato) r.bloccato = e.motivo;
                });
            }
            await restituisci(ctx, prenotazione, prenotazione.preso - usate);
            if (r.limiteGiorno) break;
        }
    } finally {
        chiudi(trasporto);
    }
    r.trattenute = trattenute.size;
    if (r.bloccato) log('coda ' + idEvento + ' fermata: ' + mascheraEmail(r.bloccato));
    return r;
}

/* ============================================================
   INTERFACCIA (usata da api/diretta-gestione.js, api/diretta-accesso.js
   e api/diretta-cron.js)
   ============================================================ */

/* Mette in coda: chi: 'da-inviare' (le persone caricate e mai
   raggiunte) oppure 'non-ricevuta' (respinte ed errori di chi non e' mai
   entrato: chi e' entrato l'email l'ha ricevuta). Mai 'incerto': quelli
   si reinviano uno per uno, con conferma. -> { accodate, saltate } */
async function accoda(ctx, opz) {
    const idEvento = validaEvento(opz && opz.idEvento);
    const chi = String((opz && opz.chi) || '');
    if (chi !== 'da-inviare' && chi !== 'non-ricevuta') throw C.errore(400, 'Scelta non valida', 'chi');
    await leggiEvento(ctx, idEvento);
    const stati = chi === 'da-inviare' ? ['da inviare'] : ['respinta', 'errore'];
    const idonea = d => !nonInviabile(d, idEvento) && (chi === 'da-inviare' || !d.ultimoAccesso);
    const scelti = [];
    let saltate = 0;
    for (const st of stati) {
        const snap = await conStato(ctx, idEvento, st).get();
        snap.docs.forEach(doc => { if (idonea(doc.data())) scelti.push(doc); else saltate++; });
    }
    let accodate = 0;
    for (const gruppo of C.aGruppi(scelti, 400)) accodate += await passaInCoda(ctx, gruppo, idEvento, stati, idonea);
    const rimaste = await conta(ctx, idEvento, 'in coda');
    // chiedere di nuovo l'invio e' la decisione di riprovare: il blocco precedente si toglie
    await rifCoda(ctx, idEvento).set({
        attiva: rimaste > 0, accodate: ctx.FieldValue.increment(accodate), aggiornato: ctx.adesso(), bloccato: null
    }, { merge: true });
    return { accodate: accodate, saltate: saltate };
}
/* In blocco, con la condizione "nessuno l'ha toccata da quando l'ho
   letta" (lastUpdateTime) su ogni documento: se qualcuno nel frattempo
   l'ha cambiata (un "Reinvia" proprio in quel momento), il blocco intero
   non passa e si rifa' una per una, in transazione, ricontrollando lo stato.
   Messa in coda dal gestore, una voce nata dal modulo del sito non e'
   piu' "automatica": parte con tutto il tetto, come le altre. */
async function passaInCoda(ctx, docs, idEvento, stati, idonea) {
    const ora = ctx.adesso();
    const campi = { stato: 'in coda', aggiornato: ts(ctx, ora), errore: undefined, rimandi: undefined, automatica: undefined };
    const batch = ctx.db.batch();
    docs.forEach(doc => batch.update(doc.ref, ...argomentiVoce(ctx, idEvento, campi, ora), { lastUpdateTime: doc.updateTime }));
    try {
        await batch.commit();
        return docs.length;
    } catch (_) {
        let n = 0;
        for (const doc of docs) {
            const ok = await ctx.db.runTransaction(async tx => {
                const s = await tx.get(doc.ref);
                if (!s.exists) return false;
                const d = s.data();
                if (stati.indexOf(voce(d, idEvento).stato) < 0 || !idonea(d)) return false;
                tx.update(doc.ref, ...argomentiVoce(ctx, idEvento, campi, ora));
                return true;
            });
            if (ok) n++;
        }
        return n;
    }
}

/* Un giro della coda, con il lucchetto.
   -> { inviate, respinte, errori, incerti, rimaste, bloccato, finito } */
async function avanzaCoda(ctx, opz) {
    const idEvento = validaEvento(opz && opz.idEvento);
    const daCron = !!(opz && opz.daCron);
    const ref = rifCoda(ctx, idEvento);
    const s = await ref.get();
    const cd = s.exists ? s.data() : {};
    const ora = ctx.adesso();
    const vuoto = { inviate: 0, respinte: 0, errori: 0, incerti: 0, rimaste: 0, bloccato: (cd.bloccato && cd.bloccato.motivo) || null, finito: false };
    if ((Number(cd.lucchettoFino) || 0) > ora) {
        return Object.assign(vuoto, { occupato: true, rimaste: await conta(ctx, idEvento, 'in coda') });
    }
    const qualcuno = await conStato(ctx, idEvento, 'in coda').limit(1).get();
    if (qualcuno.empty) {
        if (cd.attiva || cd.bloccato) await ref.set({ attiva: false, bloccato: null, aggiornato: ora }, { merge: true });
        return Object.assign(vuoto, { bloccato: null, finito: true });
    }
    if (!daCron && cd.bloccato && ora - (Number(cd.bloccato.quando) || 0) < PAUSA_BLOCCO_MS) {
        return Object.assign(vuoto, { inPausa: true, riprovaTraSecondi: Math.ceil((PAUSA_BLOCCO_MS - (ora - Number(cd.bloccato.quando))) / 1000), rimaste: await conta(ctx, idEvento, 'in coda') });
    }
    const giro = await prendiLucchetto(ctx, idEvento, (opz && opz.lucchettoMs) || (daCron ? LUCCHETTO_CRON_MS : LUCCHETTO_MANUALE_MS));
    if (!giro) return Object.assign(vuoto, { occupato: true, rimaste: await conta(ctx, idEvento, 'in coda') });
    let r = null;
    let rimaste = 0;
    try {
        r = await lavoraCoda(ctx, idEvento, { budgetMs: (opz && opz.budgetMs) || 40000 });
    } finally {
        const fine = ctx.adesso();
        try { rimaste = await conta(ctx, idEvento, 'in coda'); } catch (_) { rimaste = 1; }
        const campi = { attiva: rimaste > 0, ultimoGiro: fine };
        if (r && r.bloccato) campi.bloccato = { motivo: r.bloccato, quando: fine };
        else if (r && (r.inviate + r.respinte + r.errori + r.incerti > 0 || rimaste === 0)) campi.bloccato = null;
        await mollaLucchetto(ctx, idEvento, giro, campi);
    }
    return {
        inviate: r.inviate, respinte: r.respinte, errori: r.errori, incerti: r.incerti, rimaste: rimaste,
        bloccato: r.bloccato || null, limiteGiorno: r.limiteGiorno, finito: rimaste === 0 && !r.bloccato
    };
}

/* Il pulsante "Reinvia credenziali" di una persona: nuova password e
   email subito. Stessa presa in carico transazionale della coda:
   ammesso da qualunque stato tranne un 'invio' ancora fresco (qualcuno
   la sta spedendo adesso). -> { stato, errore? } */
async function inviaCredenziali(ctx, opz) {
    const idEvento = validaEvento(opz && opz.idEvento);
    const uid = String((opz && opz.uid) || '');
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw C.errore(400, 'Partecipante non valido', 'uid');
    const ref = rifPartecipanti(ctx).doc(uid);
    const evento = await leggiEvento(ctx, idEvento);
    // senza server di posta non si tocca niente: ne' la persona ne' la sua password
    let trasporto;
    try { trasporto = creaTrasporto(ctx); } catch (e) { log('reinvio impossibile', e); throw C.errore(503, motivoBreve(e), 'posta'); }
    try {
        const prenotazione = await riserva(ctx, 1);
        if (!prenotazione.preso) throw C.errore(429, 'Raggiunto il tetto giornaliero di email della diretta: riprova domani.', 'limite');
        let presa;
        try {
            presa = await reclama(ctx, ref, idEvento, { individuale: true, ammesso: reinvioAmmesso });
        } catch (e) { await restituisci(ctx, prenotazione, 1); throw e; }
        if (!presa.preso) {
            await restituisci(ctx, prenotazione, 1);
            throw C.errore(presa.http || 409, presa.messaggio || 'Invio non possibile', 'stato');
        }
        await rifCoda(ctx, idEvento).set({ ultimoInvio: ctx.adesso() }, { merge: true });
        const esito = await inviaUna(ctx, trasporto, idEvento, evento, uid, presa.dati, { forza: true });
        if (esito.auth && esito.stato === 'in coda') {
            /* Firebase non ha cambiato la password: la persona e' esattamente
               come prima (la vecchia password funziona ancora). Si rimette lo
               stato di prima e si dice di riprovare. */
            await ripristina(ctx, ref, idEvento, presa.voce);
            await restituisci(ctx, prenotazione, 1);
            throw C.errore(503, 'Firebase non ha risposto: la password non è cambiata, riprova tra poco.', 'auth');
        }
        // qui l'ha chiesta una persona, che aspetta la risposta: niente "torna in coda"
        const finale = esito.stato === 'in coda' ? { stato: 'errore', motivo: esito.motivo, ferma: esito.ferma } : esito;
        const registrato = await applicaEsito(ctx, ref, idEvento, presa.voce, finale);
        if (finale.ferma) {
            await rifCoda(ctx, idEvento).set({ bloccato: { motivo: finale.motivo, quando: ctx.adesso() } }, { merge: true });
            log('reinvio fermato: ' + mascheraEmail(finale.motivo));
        }
        if (registrato !== 'inviata' && registrato !== 'incerto' && registrato !== 'invio') await restituisci(ctx, prenotazione, 1);
        return registrato === 'inviata' ? { stato: 'inviata' } : { stato: registrato, errore: finale.motivo || '' };
    } finally {
        chiudi(trasporto);
    }
}
/* L'invio SUBITO di una persona gia' 'in coda': chi si iscrive dal
   modulo del sito con l'interruttore dell'evento acceso
   (lib/diretta-iscrizione.js la mette in coda e chiama qui). Stessa
   presa in carico della coda (reclama: 'in coda' -> 'invio' in una
   transazione, quindi una volta sola anche se il cron o un giro della
   gestione la prendono nello stesso istante), stesso tetto giornaliero,
   stessa scelta fra credenziali e avviso «anche» (tipoInvio), stessi
   esiti. Se non parte (server di posta non configurato o bloccato,
   tetto del giorno pieno, un guaio passeggero prima del DATA) resta 'in
   coda' e la manda il cron al giro dopo: code/{idEvento}.attiva l'ha
   gia' accesa chi l'ha messa in coda. Non lancia per i guai della
   posta: -> { stato, tipo? } (stato: quello registrato, oppure 'in coda'
   se non e' partita, oppure lo stato trovato se non era piu' in coda).
   IL TETTO: la richiesta arriva dal modulo PUBBLICO del sito, quindi
   parte solo entro la parte del tetto giornaliero che spetta al modulo
   (quotaModulo, 60%): oltre, resta 'in coda' e la manda il cron quando
   c'e' posto (il giorno dopo, se il tetto di oggi e' pieno), sempre
   entro la stessa parte (la voce e' "automatica"). */
async function inviaSubito(ctx, opz) {
    const idEvento = validaEvento(opz && opz.idEvento);
    const uid = String((opz && opz.uid) || '');
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw C.errore(400, 'Partecipante non valido', 'uid');
    const ref = rifPartecipanti(ctx).doc(uid);
    const evento = await leggiEvento(ctx, idEvento);
    let trasporto;
    try { trasporto = creaTrasporto(ctx); } catch (e) { log('invio subito rimandato al cron', e); return { stato: 'in coda', motivo: motivoBreve(e) }; }
    try {
        const prenotazione = await riserva(ctx, 1, quotaModulo());
        if (!prenotazione.preso) { log('invio subito rimandato: raggiunta la parte del tetto giornaliero per il modulo del sito'); return { stato: 'in coda', limiteGiorno: true }; }
        let presa;
        try {
            presa = await reclama(ctx, ref, idEvento, { ammesso: v => v.stato === 'in coda' });
        } catch (e) { await restituisci(ctx, prenotazione, 1); throw e; }
        if (!presa.preso) {
            await restituisci(ctx, prenotazione, 1);
            return { stato: presa.rimessa ? 'da inviare' : String(presa.stato || 'non-in-coda') };
        }
        await rifCoda(ctx, idEvento).set({ ultimoInvio: ctx.adesso() }, { merge: true });
        const esito = await inviaUna(ctx, trasporto, idEvento, evento, uid, presa.dati);
        const registrato = await applicaEsito(ctx, ref, idEvento, presa.voce, esito);
        if (esito.ferma) {
            await rifCoda(ctx, idEvento).set({ bloccato: { motivo: esito.motivo, quando: ctx.adesso() } }, { merge: true });
            log('invio subito fermato: ' + mascheraEmail(esito.motivo));
        }
        if (registrato !== 'inviata' && registrato !== 'incerto' && registrato !== 'invio') await restituisci(ctx, prenotazione, 1);
        return { stato: registrato, tipo: esito.tipo };
    } finally {
        chiudi(trasporto);
    }
}

/* Quando un "Reinvia" si puo' fare. Non mentre un altro invio e' in
   corso ('invio' fresco), e non entro un minuto da un invio riuscito:
   un doppio clic arriva al server come due richieste quasi insieme, e
   la seconda, se la sua transazione deve ripartire (Firestore riprova
   dopo circa un secondo), trova la prima gia' conclusa ('inviata') e
   non avrebbe modo di capire che e' lo stesso clic. Dopo un minuto e'
   di sicuro una scelta del gestore. */
const PAUSA_REINVIO_MS = 60 * 1000;
function reinvioAmmesso(v, ora) {
    if (v.stato === 'invio' && (ora - millis(v.aggiornato)) <= SCADENZA_INVIO_MS) return 'Invio già in corso: riprova tra qualche minuto';
    if (v.stato === 'inviata' && (ora - millis(v.inviata)) < PAUSA_REINVIO_MS) return 'Credenziali inviate meno di un minuto fa: attendi un momento prima di reinviarle';
    return true;
}
// lo stato di prima, com'era (per un reinvio che non ha cambiato niente)
async function ripristina(ctx, ref, idEvento, prec) {
    const ora = ctx.adesso();
    const campi = {
        stato: (prec && prec.stato) || 'da inviare', aggiornato: ts(ctx, ora),
        tentativi: Number(prec && prec.tentativi) || 0, errore: (prec && prec.errore) || undefined
    };
    try { await ref.update(...argomentiVoce(ctx, idEvento, campi, ora)); } catch (e) { log('stato non ripristinato (la persona resta in invio)', e); }
}

/* L'email di prova per il gestore, con dati di esempio evidenti.
   Il promemoria di prova e' scritto come se partisse nel suo momento
   vero (un giorno prima, un'ora prima), cosi' le parole sono giuste. */
const ESEMPIO = { nome: 'Mario', cognome: 'Rossi', email: 'mario.rossi@esempio.it', password: 'Esempio7Kq' };
/* tipo: 'credenziali', 'iscritto-anche' (l'avviso senza password),
   'promemoria-giorno', 'promemoria-ora' */
async function inviaProva(ctx, opz) {
    const a = E.normalizzaEmail((opz && opz.a) || '');
    if (!E.emailValida(a)) throw C.errore(400, 'Indirizzo per la prova non valido', 'a');
    const idEvento = validaEvento(opz && opz.idEvento);
    const tipo = String((opz && opz.tipo) || 'credenziali');
    const evento = await leggiEvento(ctx, idEvento);
    const base = {
        evento: evento, idEvento: idEvento, nome: ESEMPIO.nome, cognome: ESEMPIO.cognome, email: ESEMPIO.email,
        paginaEvento: evento.paginaEvento, assistenza: C.assistenza(), prova: true
    };
    const inizio = millis(evento.inizio);
    let mail;
    if (tipo === 'credenziali') mail = M.credenziali(Object.assign({ password: ESEMPIO.password, adesso: ctx.adesso() }, base));
    else if (tipo === 'iscritto-anche') mail = M.iscrittoAnche(Object.assign({ adesso: ctx.adesso() }, base));
    else if (tipo === 'promemoria-giorno' || tipo === 'promemoria-ora') {
        const giorno = tipo === 'promemoria-giorno';
        const quando = Number.isFinite(inizio) ? inizio - (giorno ? GIORNO : 60 * MINUTO) : ctx.adesso();
        mail = M.promemoria(Object.assign({ tipo: giorno ? 'giorno' : 'ora', adesso: quando }, base));
    } else throw C.errore(400, 'Tipo di email non valido', 'tipo');
    let trasporto;
    try { trasporto = creaTrasporto(ctx); } catch (e) { throw C.errore(503, motivoBreve(e), 'posta'); }
    let prenotazione = null;
    try {
        prenotazione = await riserva(ctx, 1);
        if (!prenotazione.preso) throw C.errore(429, 'Raggiunto il tetto giornaliero di email della diretta: riprova domani.', 'limite');
        await spedisci(trasporto, { a: a, mail: mail, custom: 'diretta|' + idEvento + '|prova', tipo: 'prova-' + tipo });
        return { ok: true };
    } catch (e) {
        if (e && e.stato) throw e;
        if (primaDelData(e) || Number(e && e.responseCode) >= 400) await restituisci(ctx, prenotazione, 1);
        log('email di prova non inviata', e);
        throw C.errore(502, 'Email di prova non inviata: ' + mascheraEmail(motivoBreve(e)), 'invio');
    } finally {
        chiudi(trasporto);
    }
}

/* Il collegamento per una password nuova (partecipanti) o per il primo
   accesso (gestori). Non lancia mai: chi chiama risponde comunque sempre
   allo stesso modo ("se l'account esiste, ti abbiamo scritto"), e il
   motivo di un mancato invio finisce solo nel log. Si ferma all'80% del
   tetto giornaliero: la richiesta e' pubblica, e non deve poter togliere
   spazio alle credenziali. -> { ok, motivo?, forse? }: `forse` quando
   l'invio non e' riuscito ma NON prima del DATA (connessione caduta a
   meta'): il collegamento potrebbe essere arrivato, e chi chiama lo
   tratta come partito (vedi resetInviato in lib/diretta-accesso.js). */
async function inviaReimpostazione(ctx, opz) {
    const o = opz || {};
    let trasporto = null;
    let forse = false;
    try {
        const a = E.normalizzaEmail(o.a || '');
        if (!E.emailValida(a)) return { ok: false, motivo: 'indirizzo non valido' };
        const mail = M.reimpostazione({
            nome: o.nome, cognome: o.cognome, email: o.perGestore ? '' : a, link: o.link, perGestore: !!o.perGestore,
            assistenza: C.assistenza(), adesso: ctx.adesso()
        });
        trasporto = creaTrasporto(ctx);
        const prenotazione = await riserva(ctx, 1, 0.8);
        if (!prenotazione.preso) { log('reimpostazione non inviata: tetto giornaliero'); return { ok: false, motivo: 'tetto giornaliero' }; }
        try {
            await spedisci(trasporto, { a: a, mail: mail, custom: o.perGestore ? 'diretta|gestione|reimpostazione' : 'diretta|reimpostazione', tipo: 'reimpostazione' });
        } catch (e) {
            if (primaDelData(e)) await restituisci(ctx, prenotazione, 1);
            else forse = true;
            throw e;
        }
        return { ok: true };
    } catch (e) {
        log('reimpostazione non inviata', e);
        return { ok: false, motivo: mascheraEmail(motivoBreve(e)), forse: forse };
    } finally {
        chiudi(trasporto);
    }
}

/* I numeri per la scheda email della gestione: quante persone per stato
   (count(): una lettura ogni mille), come sta la coda, e in piu':
     destinatariPromemoria { giorno, ora }: quante persone riceverebbero
       ciascun promemoria da adesso in poi (vedi destinatariPromemoria);
     esitiDisponibili: c'e' BREVO_API_KEY, quindi i rimbalzi si leggono;
     limiteRaggiunto: il tetto giornaliero (DIRETTA_MAX_GIORNO) e' pieno;
     rimasteOggi: con il tetto pieno, quante persone in coda partono
       domani da sole (0 altrimenti). */
async function statoCoda(ctx, opz) {
    const idEvento = validaEvento(opz && opz.idEvento);
    const conteggi = {};
    await Promise.all(STATI.map(async st => { conteggi[st] = await conta(ctx, idEvento, st); }));
    const [s, se] = await Promise.all([rifCoda(ctx, idEvento).get(), ctx.db.collection('eventi').doc(idEvento).get()]);
    const cd = s.exists ? s.data() : {};
    const ora = ctx.adesso();
    const coda = {
        attiva: !!cd.attiva,
        inCorso: (Number(cd.lucchettoFino) || 0) > ora,
        accodate: Number(cd.accodate) || 0,
        aggiornato: Number(cd.aggiornato) || null,
        ultimoGiro: Number(cd.ultimoGiro) || null,
        bloccato: cd.bloccato || null,
        promemoria: cd.promemoria || {},
        tettoGiorno: maxGiorno()
    };
    if (coda.tettoGiorno) {
        const c = await ctx.db.collection('contatori').doc(chiaveGiorno(ctx)).get();
        coda.inviateOggi = c.exists ? Number(c.data().inviate) || 0 : 0;
    }
    const limiteRaggiunto = !!coda.tettoGiorno && coda.inviateOggi >= coda.tettoGiorno;
    const evento = se.exists ? Object.assign({ id: idEvento }, se.data()) : null;
    return {
        conteggi: conteggi,
        coda: coda,
        destinatariPromemoria: await destinatariPromemoria(ctx, idEvento, evento, conteggi.inviata, cd),
        esitiDisponibili: !!chiaveBrevo(),
        limiteRaggiunto: limiteRaggiunto,
        rimasteOggi: limiteRaggiunto ? conteggi['in coda'] : 0
    };
}

/* Quante persone riceverebbero ciascun promemoria da adesso in poi:
   credenziali 'inviata', account attivo, quel promemoria non ancora
   avuto. 0 se il promemoria e' gia' finito o la sua finestra e' chiusa
   (evento passato o terminato). Il conto vale anche se il promemoria
   non e' attivato: e' il numero che la gestione mostra accanto alla
   casella, prima di decidere.
   Costa poco quasi sempre: se nessun promemoria e' ancora cominciato,
   nessuno l'ha avuto, e basta il conteggio delle 'inviata' (gia' fatto)
   meno le poche 'inviata' con l'account disattivato (letti solo i
   disattivati, un campo solo). Solo con un promemoria a meta' (un giro
   interrotto, un blocco di Brevo) si contano le persone una per una. */
async function destinatariPromemoria(ctx, idEvento, evento, inviate, cd) {
    const out = { giorno: 0, ora: 0 };
    if (!evento || !(inviate > 0)) return out;
    const ora = ctx.adesso();
    const fatti = (cd && cd.promemoria) || {};
    const aperti = TIPI_PROMEMORIA.filter(t => {
        const f = finestraPromemoria(evento, t);
        return f && ora < f.a && !(fatti[t] && fatti[t].finito);
    });
    if (!aperti.length) return out;
    if (aperti.some(t => fatti[t])) {
        const snap = await conStato(ctx, idEvento, STATI_PROMEMORIA[0])
            .select('stato', 'authCreato', 'email', 'emailNorm', 'eventi', new ctx.FieldPath('invii', idEvento, 'stato'), new ctx.FieldPath('promemoria', idEvento))
            .get();
        snap.docs.forEach(doc => {
            const d = doc.data();
            aperti.forEach(t => { if (vuolePromemoria(d, idEvento, t)) out[t]++; });
        });
        return out;
    }
    const disattivati = await rifPartecipanti(ctx).where('stato', '==', 'disattivato')
        .select(new ctx.FieldPath('invii', idEvento, 'stato')).get();
    const fuori = disattivati.docs.filter(doc => STATI_PROMEMORIA.indexOf(voce(doc.data(), idEvento).stato) >= 0).length;
    aperti.forEach(t => { out[t] = Math.max(0, inviate - fuori); });
    return out;
}

/* ============================================================
   I RIMBALZI LETTI DA BREVO
   "Inviata" vuol dire solo che Brevo ha preso in carico il messaggio.
   Se poi la casella non esiste o il server del destinatario rifiuta, lo
   sa Brevo: glielo si chiede per tipo di evento, SOLO i rifiuti
   permanenti (hardBounces, blocked, invalid: vedi TIPI_RIMBALZO), e per
   finestra di date, e si segnano 'respinta' le persone con un rimbalzo
   arrivato DOPO il loro invio.
   Senza BREVO_API_KEY i rimbalzi non si vedono (e lo si dice).
   La quota di Brevo (300 chiamate l'ora per /smtp, condivise con il
   resto dello studio) si protegge con una cache di 10 minuti in
   stato/esitiBrevo. La cache tiene SOLO gli indirizzi della diretta
   (quelli che esistono in indirizzi/): i rimbalzi delle altre email
   dello studio non entrano nel progetto della diretta.
   ============================================================ */
function chiaveBrevo() { return String(process.env.BREVO_API_KEY || '').trim(); }
function baseBrevo(ctx) {
    // un Brevo finto solo nelle prove con l'emulatore
    const finto = String(process.env.DIRETTA_BREVO_API || '').trim();
    return (ctx.emulatore === true && finto) ? finto.replace(/\/+$/, '') : 'https://api.brevo.com/v3';
}
function giornoUtc(ms) { return new Date(ms).toISOString().slice(0, 10); }
function pulisciMotivo(s) { return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 160); }
async function chiamaBrevo(ctx, percorso) {
    const r = await fetch(baseBrevo(ctx) + percorso, {
        headers: { 'api-key': chiaveBrevo(), accept: 'application/json' },
        signal: AbortSignal.timeout(8000)
    });
    const testo = await r.text();
    let dati = null;
    try { dati = testo ? JSON.parse(testo) : null; } catch (_) { dati = null; }
    return { stato: r.status, ok: r.ok, dati: dati };
}
async function soloIndirizziDiretta(ctx, indirizzi) {
    const buoni = indirizzi.filter(x => x && x.indexOf('/') < 0 && x.length < 700);
    const out = [];
    for (const gruppo of C.aGruppi(buoni, 100)) {
        const docs = await ctx.db.getAll(...gruppo.map(x => ctx.db.collection('indirizzi').doc(x)));
        docs.forEach(d => { if (d.exists) out.push(d.id); });
    }
    return out;
}
async function rimbalziBrevo(ctx, dal) {
    const ref = ctx.db.collection('stato').doc('esitiBrevo');
    const ora = ctx.adesso();
    const s = await ref.get();
    const c = s.exists ? s.data() : {};
    if (c.quando && ora - Number(c.quando) < CACHE_ESITI_MS && (Number(c.dal) || Infinity) <= dal) {
        return { ok: true, righe: c.righe || {}, quando: Number(c.quando), daCache: true };
    }
    const inizio = Math.max(dal - GIORNO, ora - 30 * GIORNO);
    const righe = {};
    for (const tipo of TIPI_RIMBALZO) {
        for (let pagina = 0; pagina < MAX_PAGINE_BREVO; pagina++) {
            let r;
            try {
                r = await chiamaBrevo(ctx, '/smtp/statistics/events?event=' + tipo + '&limit=' + PER_PAGINA_BREVO
                    + '&offset=' + (pagina * PER_PAGINA_BREVO) + '&startDate=' + giornoUtc(inizio) + '&endDate=' + giornoUtc(ora) + '&sort=desc');
            } catch (e) {
                return { ok: false, msg: 'Brevo non ha risposto (' + motivoBreve(e).slice(0, 60) + ').' };
            }
            if (r.stato === 404) break;   // nessun evento di quel tipo nel periodo
            if (!r.ok) return { ok: false, msg: r.stato === 429 ? 'Brevo: troppe richieste, riprova fra qualche minuto.' : 'Brevo non ha risposto (' + r.stato + ').' };
            const eventi = (r.dati && Array.isArray(r.dati.events)) ? r.dati.events : [];
            eventi.forEach(ev => {
                const em = E.normalizzaEmail(ev && ev.email);
                if (!em) return;
                /* Si e' chiesto un tipo solo, ma se Brevo mescolasse nella
                   risposta un rifiuto temporaneo (i nomi cambiano forma da un
                   endpoint all'altro: softBounce, soft_bounce, deferred) lo si
                   scarta qui: non e' mai un motivo per dire 'respinta'. */
                if (/soft|defer/.test(String((ev && ev.event) || '').toLowerCase().replace(/[\s_-]/g, ''))) return;
                (righe[em] = righe[em] || []).push({ tipo: tipo, quando: Date.parse(String(ev.date || '')) || 0, motivo: pulisciMotivo(ev.reason) });
            });
            if (eventi.length < PER_PAGINA_BREVO) break;
        }
    }
    const tenute = {};
    (await soloIndirizziDiretta(ctx, Object.keys(righe))).forEach(em => { tenute[em] = righe[em].slice(0, 5); });
    await ref.set({ quando: ora, dal: inizio, righe: tenute });
    return { ok: true, righe: tenute, quando: ora };
}
const NOMI_RIMBALZO = { hardBounces: 'rimbalzo definitivo', blocked: 'bloccata da Brevo', invalid: 'indirizzo non valido' };
/* -> { respinte, letto, disponibile, aggiornato?, msg? } */
async function aggiornaEsiti(ctx, opz) {
    const idEvento = validaEvento(opz && opz.idEvento);
    if (!chiaveBrevo()) {
        return { respinte: 0, letto: false, disponibile: false, msg: 'Senza BREVO_API_KEY i rimbalzi non si possono leggere: «inviata» vuol dire solo accettata dal server di posta.' };
    }
    const snap = await conStato(ctx, idEvento, 'inviata').get();
    if (snap.empty) return { respinte: 0, letto: true, disponibile: true };
    const inviate = [];
    let dal = Infinity;
    snap.docs.forEach(doc => {
        const d = doc.data();
        const quando = millis(voce(d, idEvento).inviata);
        const em = indirizzoDi(d);
        if (!em || !Number.isFinite(quando)) return;
        inviate.push({ ref: doc.ref, email: em, quando: quando });
        dal = Math.min(dal, quando);
    });
    if (!inviate.length) return { respinte: 0, letto: true, disponibile: true };
    const b = await rimbalziBrevo(ctx, dal);
    if (!b.ok) return { respinte: 0, letto: false, disponibile: true, msg: b.msg };
    let respinte = 0;
    for (const p of inviate) {
        // un rimbalzo vale solo se e' arrivato dopo QUESTO invio (un minuto di tolleranza sugli orologi)
        // (solo i tipi permanenti: una cache scritta prima di questa regola puo' contenere anche altro)
        const rimbalzo = (b.righe[p.email] || []).filter(x => TIPI_RIMBALZO.indexOf(x.tipo) >= 0 && x.quando >= p.quando - MINUTO)
            .sort((x, y) => y.quando - x.quando)[0];
        if (!rimbalzo) continue;
        const cambiata = await ctx.db.runTransaction(async tx => {
            const s = await tx.get(p.ref);
            if (!s.exists) return false;
            const v = voce(s.data(), idEvento);
            if (v.stato !== 'inviata' || millis(v.inviata) !== p.quando) return false;
            const ora = ctx.adesso();
            tx.update(p.ref, ...argomentiVoce(ctx, idEvento, {
                stato: 'respinta', aggiornato: ts(ctx, ora),
                errore: 'Segnalata da Brevo: ' + NOMI_RIMBALZO[rimbalzo.tipo] + (rimbalzo.motivo ? ' (' + rimbalzo.motivo + ')' : '')
            }, ora));
            return true;
        });
        if (cambiata) respinte++;
    }
    return { respinte: respinte, letto: true, disponibile: true, aggiornato: b.quando };
}

/* ============================================================
   I PROMEMORIA
   Il giorno prima (da 24 ore prima dell'inizio) e un'ora prima (da 60
   minuti prima fino alla fine), solo se attivati sull'evento e solo se
   l'evento non e' terminato. Se sono attivi entrambi, quello del giorno
   prima smette di partire quando comincia l'ora prima: due email a
   pochi minuti l'una dall'altra (succede se li si attiva tardi) sono
   una di troppo.
   Solo a chi ha le credenziali 'inviata' e l'account attivo (vedi
   STATI_PROMEMORIA): per questo si leggono solo le persone 'inviata'
   dell'evento, con UN filtro (l'indice automatico basta).
   Al massimo una volta per persona e per tipo: una transazione scrive
   promemoria.<idEvento>.<tipo> = 'invio' prima di spedire, e dopo
   l'orario (Timestamp). Un 'invio' rimasto li' non si rispedisce mai.
   Se il server di posta rifiuta PRIMA di accettare il messaggio (account
   bloccato), il segno si toglie e si riprova al giro dopo. Quando
   nessuno manca piu', code/{id}.promemoria.<tipo>.finito evita di
   rileggere mille profili ogni cinque minuti.
   ============================================================ */

/* La finestra in cui un promemoria puo' partire: [da, a). null se
   l'evento non ha orari o e' terminato. `oraPrima` sposta la fine di
   quella del giorno prima (vedi sopra), anche per contare i
   destinatari: vale l'impostazione di adesso. */
function finestraPromemoria(evento, tipo) {
    const inizio = millis(evento && evento.inizio);
    const fine = millis(evento && evento.fine);
    if (!Number.isFinite(inizio) || !Number.isFinite(fine) || evento.stato === 'terminato') return null;
    const p = evento.promemoria || {};
    if (tipo === 'giorno') return { da: inizio - GIORNO, a: p.oraPrima ? inizio - 60 * MINUTO : inizio };
    return { da: inizio - 60 * MINUTO, a: fine };
}
function promemoriaDovuti(evento, adesso, fatti) {
    const p = (evento && evento.promemoria) || {};
    const attivi = { giorno: !!p.giornoPrima, ora: !!p.oraPrima };
    return TIPI_PROMEMORIA.filter(t => {
        const f = attivi[t] && finestraPromemoria(evento, t);
        return f && adesso >= f.da && adesso < f.a && !(fatti && fatti[t] && fatti[t].finito);
    });
}
function vuolePromemoria(d, idEvento, tipo) {
    const segno = ((d.promemoria || {})[idEvento] || {})[tipo];
    return segno == null && d.stato === 'attivo' && d.authCreato === true
        && Array.isArray(d.eventi) && d.eventi.indexOf(idEvento) >= 0
        && STATI_PROMEMORIA.indexOf(voce(d, idEvento).stato) >= 0 && E.emailValida(indirizzoDi(d));
}
async function promemoriaUna(ctx, trasporto, ref, idEvento, evento, tipo) {
    const campo = new ctx.FieldPath('promemoria', idEvento, tipo);
    const dati = await ctx.db.runTransaction(async tx => {
        const s = await tx.get(ref);
        if (!s.exists) return null;
        const d = s.data();
        if (!vuolePromemoria(d, idEvento, tipo)) return null;
        tx.update(ref, campo, 'invio');
        return d;
    });
    if (!dati) return null;
    const mail = M.promemoria({
        tipo: tipo, evento: evento, idEvento: idEvento, nome: dati.nome, cognome: dati.cognome, email: indirizzoDi(dati),
        paginaEvento: evento.paginaEvento, assistenza: C.assistenza(), adesso: ctx.adesso()
    });
    try {
        await spedisci(trasporto, { a: indirizzoDi(dati), mail: mail, custom: 'diretta|' + idEvento + '|' + ref.id, tipo: 'promemoria-' + tipo });
        await ref.update(campo, ts(ctx)).catch(e => log('promemoria partito ma non registrato (resta "invio")', e));
        return { stato: 'inviata' };
    } catch (e) {
        const esito = classifica(e);
        try {
            // non partita per un guaio NOSTRO: si ritenta al prossimo giro
            if (esito.stato === 'in coda' && !esito.destinatario) await ref.update(campo, ctx.FieldValue.delete());
            else if (esito.stato !== 'incerto') await ref.update(campo, esito.stato === 'in coda' ? 'errore' : esito.stato);
            // 'incerto': resta 'invio', e non si ritenta
        } catch (e2) { log('esito del promemoria non registrato', e2); }
        return esito;
    }
}
async function giroPromemoria(ctx, idEvento, evento, tipo, scadenza) {
    const r = { idEvento: idEvento, tipo: tipo, inviate: 0, respinte: 0, errori: 0, incerti: 0, finito: false, bloccato: null };
    const giro = await prendiLucchetto(ctx, idEvento, LUCCHETTO_CRON_MS);
    if (!giro) return Object.assign(r, { occupato: true });
    let finito = false;
    try {
        /* Il segno "cominciato" PRIMA di spedire: se il giro muore a meta',
           la gestione sa che alcune persone l'hanno gia' avuto e le conta
           una per una (vedi destinatariPromemoria). */
        await rifCoda(ctx, idEvento).set({ promemoria: { [tipo]: { cominciato: ctx.adesso() } } }, { merge: true });
        const snap = await conStato(ctx, idEvento, STATI_PROMEMORIA[0]).get();
        const idonei = snap.docs.filter(doc => vuolePromemoria(doc.data(), idEvento, tipo));
        let trasporto;
        try { trasporto = creaTrasporto(ctx); } catch (e) { r.bloccato = motivoBreve(e); return r; }
        let fatti = 0;
        const pausa = pausaGruppi();
        try {
            for (let i = 0; i < idonei.length && !r.bloccato && !r.limiteGiorno; i += lotto()) {
                const blocco = idonei.slice(i, i + lotto());
                const prenotazione = await riserva(ctx, blocco.length);
                if (!prenotazione.preso) { r.limiteGiorno = true; break; }
                let usate = 0;
                for (let j = 0; j < prenotazione.preso && !r.bloccato; j += concorrenza()) {
                    if (Date.now() >= scadenza) break;
                    if (i + j > 0 && pausa > 0) await C.pausa(pausa);
                    const gruppo = blocco.slice(j, Math.min(j + concorrenza(), prenotazione.preso));
                    const esiti = await Promise.all(gruppo.map(doc => promemoriaUna(ctx, trasporto, doc.ref, idEvento, evento, tipo)
                        .catch(e => { log('promemoria non preso in carico', e); return { stato: 'guasto' }; })));
                    fatti += gruppo.length;
                    esiti.forEach(e => {
                        if (!e) return;
                        if (e.stato === 'inviata' || e.stato === 'incerto') usate++;
                        // presa in carico non riuscita: la persona e' com'era, la si riprende al giro dopo
                        if (e.stato === 'guasto') { r.guasti = (r.guasti || 0) + 1; return; }
                        if (e.stato === 'inviata') r.inviate++;
                        else if (e.stato === 'respinta') r.respinte++;
                        else if (e.stato === 'incerto') r.incerti++;
                        else if (e.stato !== 'in coda') r.errori++;
                        if (e.ferma && !r.bloccato) r.bloccato = e.motivo;
                    });
                }
                await restituisci(ctx, prenotazione, prenotazione.preso - usate);
                if (Date.now() >= scadenza) break;
            }
        } finally { chiudi(trasporto); }
        finito = fatti >= idonei.length && !r.bloccato && !r.limiteGiorno && !r.guasti;
        r.finito = finito;
    } finally {
        const ora = ctx.adesso();
        const segno = { quando: ora, finito: finito, inviate: ctx.FieldValue.increment(r.inviate) };
        await mollaLucchetto(ctx, idEvento, giro, { promemoria: { [tipo]: segno } });
    }
    if (r.bloccato) log('promemoria ' + tipo + ' di ' + idEvento + ' fermati: ' + mascheraEmail(r.bloccato));
    return r;
}

/* ============================================================
   IL GIRO DEL CRON (api/diretta-cron.js, ogni 5 minuti)
   1. gestori tolti da DIRETTA_ADMIN_EMAILS: claims via, sessioni chiuse,
      account disattivato;
   2. la riconciliazione delle iscrizioni dal modulo del sito
      (lib/diretta-riconcilia.js): per gli eventi con l'interruttore
      acceso, chi si e' iscritto online mentre il servizio non rispondeva
      riceve adesso l'account e la password (al massimo un minuto;
      senza la chiave del sito, o se la lettura non riesce, salta e il
      resto del giro va avanti). Prima delle code: le credenziali che
      nascono qui partono al punto 4, nello stesso giro;
   3. gli 'invio' rimasti a meta' da piu' di 10 minuti diventano
      'incerto' (mai rispediti da soli);
   4. le code attive vanno avanti;
   5. i promemoria dovuti partono;
   6. i rimbalzi di Brevo, al massimo ogni mezz'ora.
   Se non c'e' niente da fare costa poche letture: l'elenco (breve)
   dei gestori, degli eventi con l'interruttore acceso (e, per ognuno,
   il suo cursore e una query sulle schede del sito), delle code e
   degli eventi non ancora finiti.
   ============================================================ */
async function ripulisciGestori(ctx) {
    const snap = await ctx.db.collection('gestoriAccount').get();
    if (snap.empty) return 0;
    if (!C.gestori().size) {
        // tutti fuori in un colpo solo e' quasi sempre una variabile persa, non una decisione
        log('DIRETTA_ADMIN_EMAILS vuota: gestori non ripuliti (controlla la configurazione)');
        return 0;
    }
    let tolti = 0;
    for (const doc of snap.docs) {
        const email = String(doc.data().email || '').toLowerCase();
        if (C.eGestore(email)) continue;
        try {
            await conLimiteAuth(() => ctx.auth.setCustomUserClaims(doc.id, null));
            await conLimiteAuth(() => ctx.auth.revokeRefreshTokens(doc.id));
            await conLimiteAuth(() => ctx.auth.updateUser(doc.id, { disabled: true }));
        } catch (e) {
            const codice = String((e && (e.code || (e.errorInfo && e.errorInfo.code))) || '');
            if (codice.indexOf('user-not-found') < 0) { log('gestore non ripulito', e); continue; }
        }
        await doc.ref.delete();
        tolti++;
    }
    return tolti;
}
async function chiudiInviiScaduti(ctx, idEvento) {
    const snap = await conStato(ctx, idEvento, 'invio').get();
    let n = 0;
    for (const doc of snap.docs) {
        const limite = ctx.adesso() - SCADENZA_INVIO_MS;
        if (!(millis(voce(doc.data(), idEvento).aggiornato) < limite)) continue;
        const cambiata = await ctx.db.runTransaction(async tx => {
            const s = await tx.get(doc.ref);
            const v = voce(s.exists ? s.data() : {}, idEvento);
            if (v.stato !== 'invio' || !(millis(v.aggiornato) < limite)) return false;
            const ora = ctx.adesso();
            tx.update(doc.ref, ...argomentiVoce(ctx, idEvento, { stato: 'incerto', aggiornato: ts(ctx, ora), errore: MOTIVO_INCERTO }, ora));
            return true;
        });
        if (cambiata) n++;
    }
    return n;
}
async function giroCron(ctx, opz) {
    const t0 = Date.now();
    const scadenza = t0 + Math.max(10000, Number(opz && opz.budgetMs) || 240000);
    // per gli ultimi passi (promemoria, rimbalzi) si lascia sempre un po' di tempo
    const MARGINE = 20000;
    const riepilogo = { gestoriRimossi: 0, riconciliazione: null, incerti: 0, code: [], promemoria: [], esiti: [], lavoro: false, durataMs: 0 };

    try { riepilogo.gestoriRimossi = await ripulisciGestori(ctx); } catch (e) { log('pulizia dei gestori', e); }

    // la riconciliazione (caricata qui: il modulo usa questo file per le code)
    try {
        const resta = scadenza - Date.now() - MARGINE;
        if (resta >= 5000) riepilogo.riconciliazione = await require('./diretta-riconcilia').riconcilia(ctx, { budgetMs: Math.min(60000, resta) });
    } catch (e) { log('riconciliazione delle iscrizioni dal sito', e); }

    // le code si leggono DOPO la riconciliazione: una coda accesa li' si vede gia' in questo giro
    const code = await ctx.db.collection('code').get();
    for (const doc of code.docs) {
        const d = doc.data();
        if (!RE_ID_EVENTO.test(doc.id) || !(ctx.adesso() - (Number(d.ultimoInvio) || 0) < 7 * GIORNO)) continue;
        try { riepilogo.incerti += await chiudiInviiScaduti(ctx, doc.id); } catch (e) { log('invii scaduti di ' + doc.id, e); }
    }

    for (const doc of code.docs) {
        if (!doc.data().attiva || !RE_ID_EVENTO.test(doc.id)) continue;
        const resta = scadenza - Date.now() - MARGINE;
        if (resta < 5000) break;
        try {
            const r = await avanzaCoda(ctx, { idEvento: doc.id, budgetMs: resta, daCron: true });
            riepilogo.code.push(Object.assign({ idEvento: doc.id }, r));
        } catch (e) { log('coda di ' + doc.id, e); }
    }

    const eventi = await ctx.db.collection('eventi').where('fine', '>', ts(ctx, ctx.adesso())).get();
    const statoCode = {};
    code.docs.forEach(d => { statoCode[d.id] = d.data().promemoria || {}; });
    for (const doc of eventi.docs) {
        const e = Object.assign({ id: doc.id }, doc.data());
        for (const tipo of promemoriaDovuti(e, ctx.adesso(), statoCode[doc.id])) {
            if (Date.now() >= scadenza) break;
            try { riepilogo.promemoria.push(await giroPromemoria(ctx, doc.id, e, tipo, scadenza)); } catch (err) { log('promemoria ' + tipo + ' di ' + doc.id, err); }
        }
    }

    if (chiaveBrevo() && Date.now() < scadenza) {
        const recenti = code.docs.filter(d => RE_ID_EVENTO.test(d.id) && ctx.adesso() - (Number(d.data().ultimoInvio) || 0) < 3 * GIORNO);
        if (recenti.length) {
            const ref = ctx.db.collection('stato').doc('esitiBrevo');
            const s = await ref.get();
            if (ctx.adesso() - (Number(s.exists && s.data().ultimoCron) || 0) >= OGNI_ESITI_CRON_MS) {
                await ref.set({ ultimoCron: ctx.adesso() }, { merge: true });
                for (const d of recenti) {
                    try { riepilogo.esiti.push(Object.assign({ idEvento: d.id }, await aggiornaEsiti(ctx, { idEvento: d.id }))); } catch (e) { log('rimbalzi di ' + d.id, e); }
                }
            }
        }
    }

    const riconciliate = riepilogo.riconciliazione ? riepilogo.riconciliazione.eventi.some(r => r.lette || r.limite || r.errore) : false;
    riepilogo.lavoro = !!(riepilogo.gestoriRimossi || riconciliate || riepilogo.incerti || riepilogo.code.length || riepilogo.promemoria.length || riepilogo.esiti.length);
    riepilogo.durataMs = Date.now() - t0;
    return riepilogo;
}

module.exports = {
    inviaCredenziali, inviaSubito, inviaProva, inviaReimpostazione, accoda, avanzaCoda, statoCoda, aggiornaEsiti, giroCron,
    STATI,
    // per le prove: il giro senza lucchetto, la presa in carico, la lettura degli errori
    _interni: {
        lavoraCoda, reclama, classifica, primaDelData, fermaTutto, problemaNostro, promemoriaDovuti, finestraPromemoria,
        destinatariPromemoria, sostituzione, haPassword, tipoInvio, creaTrasporto, mascheraEmail, riserva, quotaModulo, SCADENZA_INVIO_MS, PAUSA_BLOCCO_MS
    }
};
