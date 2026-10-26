/* ============================================================
   Il giro automatico delle mail di conferma (api/conferme-email.js)
   ------------------------------------------------------------
   Agli eventi dove l'iscrizione vale solo dopo la conferma
   dell'email (Milano 2027, lib/iscrizione-verificata.js) una mail con
   il pulsante che non arriva vuol dire un iscritto che non e' iscritto,
   e che di solito non lo sa. Il modulo la spedisce subito, ma puo'
   andare storto in tre modi, e questo giro - ogni dieci minuti - li
   ripara da solo:

     MAI PARTITA   la funzione si e' chiusa dopo aver scritto la scheda
                   e prima di spedire (nessuna `mailConferma`): passati
                   cinque minuti dall'iscrizione, la si spedisce, con
                   l'SMS che sarebbe partito con lei;
     NON PARTITA   il server di posta ha detto no (`mailConferma.ok`
                   falso): si riprova dopo 5 minuti, 30 minuti, 2 ore e
                   12 ore, cinque tentativi in tutto, poi si lascia allo
                   staff (l'area riservata la mostra "mail non inviata");
     PARTITA MA NIENTE CLIC   a UN'ORA dall'ultimo invio riuscito parte
                   il SOLLECITO PERSONALE (lib/sollecito-conferma.js): una
                   mail solo testo da Andrea Missori, dal suo indirizzo, che
                   dice di cercare la prima nello spam e di rispondere se
                   non la trova. Una per scheda, finche' la mail ha meno di
                   ventidue ore (oltre, e' in arrivo il promemoria); se la
                   posta dice no si riprova dopo mezz'ora, tre tentativi in
                   tutto, e un esito incerto non si ripete; di giorno, come
                   il promemoria. Poi, dopo un giorno dall'ultimo invio
                   riuscito, parte UN promemoria: la stessa mail, con "Promemoria:"
                   davanti all'oggetto, e un SMS che dice di cercarla anche
                   fra la posta indesiderata. Uno solo, mai un secondo:
                   resta scritto in `promemoriaConferma`. E solo di giorno,
                   dalle 8 alle 21 ora di Milano: un SMS alle tre di notte
                   non lo vuole nessuno, e chi lo riceve al mattino ha la
                   mail in cima alla casella. Di notte il promemoria
                   aspetta, con la bandiera al suo posto.

   QUANDO NON SI MANDA PIU' NIENTE. Oltre alla conferma e
   all'annullamento: chi lo staff ha segnato "presente" (il documento
   delle presenze, come per i promemoria degli eventi: era in sala, non
   aspetta niente) e, dopo la fine dell'evento (`fine` in
   VERIFICATA.EVENTI), tutte le schede di quell'evento. Un "la tua
   iscrizione non e' ancora confermata" a chi e' gia' seduto in sala, o a
   evento finito, e' una mail sbagliata.

   COSA LEGGE. Solo le schede con la bandiera `confermaInAttesa`
   (lib/conferma-email.js spiega chi la scrive e chi la toglie), non
   tutte le iscrizioni. La bandiera si toglie qui quando non c'e' piu'
   niente da fare: confermata, annullata, presente, a evento finito, una
   scheda che la conferma non la chiede (inserita a mano, da un portale,
   importata), i tentativi finiti, il promemoria mandato. Cosi' le schede
   da guardare restano quelle dell'ultimo giorno o poco piu'; se ne
   leggono fino a duemila per giro, e se si arriva al limite il log lo
   dice (`limitePieno`): quelle oltre non le vedrebbe nessuno.

   PRIMA I GUASTI, POI I PROMEMORIA. Le schede lette si mettono in fila
   per urgenza: prima la mail mai partita e quella da riprovare (una
   persona che la aspetta adesso), poi le bandiere da togliere (una
   scrittura sola), per ultimi i promemoria (una mail e un SMS ciascuno,
   i piu' lenti). Una fila di promemoria arretrati non fa aspettare ore
   chi si e' appena iscritto e non ha ricevuto niente.

   LA SCHEDA DI ADESSO. La ricerca e' una fotografia, e fra la foto e il
   lavoro passano secondi: la persona puo' aver confermato, lo staff
   cancellato la scheda o spostata su un altro documento (Modifica di
   email o data), il pulsante "rimandala" aver appena spedito. Prima di
   fare qualunque cosa la scheda si rilegge, con la sua presenza, e si
   rifa' il conto; una scheda che non c'e' piu' si lascia stare - la
   bandiera si toglie con update(), che su un documento cancellato
   fallisce invece di farlo rinascere vuoto.

   UN GIRO ALLA VOLTA. Un lucchetto su meta/confermeEmail
   (`lucchettoFino`, piu' lungo della funzione, e `lucchettoGiro`): un
   giro lanciato a mano mentre lavora quello programmato, o lo stesso
   cron consegnato due volte da Vercel, trova il lucchetto e si ferma
   senza fare niente (`occupato`). Due giri insieme manderebbero due mail
   e due SMS alla stessa persona. Lo si molla alla fine solo se e' ancora
   nostro; se la funzione muore, scade da solo.

   IL RECUPERO, UNA VOLTA. Le iscrizioni fatte prima che la bandiera
   esistesse non l'hanno: al primo giro si rilegge l'archivio una volta,
   si mette la bandiera a chi aspetta ancora la conferma, e si segna su
   meta/confermeEmail che e' fatto. Da li' in poi le prende il giro come
   tutte le altre (promemoria compreso, una volta).

   IL TEMPO. Una scheda nuova si comincia solo nei primi 35 secondi dei
   60 della funzione: nel caso peggiore una scheda ne chiede altri venti
   (un server di posta muto fino al suo tempo massimo, poi l'SMS con il
   suo), e una funzione chiusa a meta' lascerebbe una mail partita senza
   la sua traccia. Per questo qui la mail non ha il secondo tentativo
   immediato: riprova il giro, con le sue pause. Quello che resta fuori
   lo prende il giro dopo, dieci minuti piu' tardi.
   ============================================================ */

const crypto = require('crypto');
const admin = require('firebase-admin');
const CONF = require('./conferma-email');
const VERIFICATA = require('./iscrizione-verificata');
const SOLL = require('./sollecito-conferma');
const PEC = require('./sollecito-pec');
const LETTORE = require('./lettore-pec');

const BUDGET_MS = 35 * 1000;
// le schede con la bandiera lette per giro: molte piu' di quelle che ci sono di solito
const LIMITE = 2000;
// la mail dell'iscrizione parte subito: il giro aspetta che il modulo abbia finito
const PRIMA_ATTESA_MS = 5 * 60 * 1000;
// dopo il primo, secondo, terzo e quarto invio non partito
const PAUSE_MS = [5 * 60 * 1000, 30 * 60 * 1000, 2 * 60 * 60 * 1000, 12 * 60 * 60 * 1000];
const MAX_TENTATIVI = 5;
const PROMEMORIA_DOPO_MS = 24 * 60 * 60 * 1000;
// il sollecito personale: a un'ora dalla mail partita, e non oltre le ventidue (poi tocca al promemoria); se non parte, dopo mezz'ora, tre volte
const SOLLECITO_DOPO_MS = 60 * 60 * 1000;
const SOLLECITO_ENTRO_MS = 22 * 60 * 60 * 1000;
const SOLLECITO_RIPROVA_MS = 30 * 60 * 1000;
const SOLLECITO_MAX_TENTATIVI = 3;
// la PEC di sollecito: a un giorno dalla lettera partita; se il gestore dice no, dopo mezz'ora, tre volte
const PEC_DOPO_MS = 24 * 60 * 60 * 1000;
const PEC_RIPROVA_MS = 30 * 60 * 1000;
const PEC_MAX_TENTATIVI = 3;
// il promemoria parte solo di giorno, ora di Milano: dalle 8 (compresa) alle 21 (esclusa)
const PROMEMORIA_DALLE = 8;
const PROMEMORIA_ALLE = 21;
// piu' lungo della funzione (maxDuration 60 s in vercel.json): un giro vivo non lo perde mai
const LUCCHETTO_MS = 120 * 1000;
// alzarla rifa' il recupero (vedi in cima) al giro dopo
const VERSIONE_RECUPERO = 1;
/* IL SOLLECITO AGLI ARRETRATI, una volta: alla pubblicazione del sollecito
   personale chi aspettava gia' da prima (anche con il promemoria gia'
   ricevuto, e fuori dal giro) lo riceve lo stesso, una volta. Si rilegge
   l'archivio, si segnano le schede (`sollecitoArretrato`) e si rimette la
   bandiera; da li' le prende il giro, di giorno, poche per volta. */
const VERSIONE_SOLLECITO = 1;
// l'ordine del lavoro (vedi PRIMA I GUASTI): l'attesa non costa niente e non entra nel tempo
const PRIORITA = { invia: 0, riprova: 0, togli: 1, sollecito: 2, pec: 3, promemoria: 4, aspetta: 5 };

function motivo(e) { return String((e && e.message) || e).replace(/[^\s/@'"]+@[^\s/'"]+/g, '<email>').slice(0, 200); }

/* Quando la scheda e' stata scritta: `ricevuto` e' il momento del server
   (Timestamp di Firestore). Una scheda senza, o con un valore che non si
   legge, e' vecchia: non c'e' un modulo che stia ancora lavorando. */
function registrataIl(x) {
    const r = x && x.ricevuto;
    if (r && typeof r.toMillis === 'function') return r.toMillis();
    if (typeof r === 'number') return r;
    if (r && typeof r === 'object') {
        const sec = Number(r.seconds != null ? r.seconds : r._seconds);
        if (sec) return sec * 1000;
    }
    return 0;
}

/* L'ora di Milano di un istante (0-23), con l'ora legale o solare del
   giorno. Si parte dall'istante, non da new Date(): l'orologio delle prove
   sostituisce Date.now(). */
function oraRoma(ts) {
    return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: 'numeric', hourCycle: 'h23' }).format(new Date(ts)));
}
function diGiorno(ts) {
    const h = oraRoma(ts);
    return h >= PROMEMORIA_DALLE && h < PROMEMORIA_ALLE;
}

/* La PEC di sollecito, un giorno dopo la lettera (lib/sollecito-pec.js):
   'no' se non si applica (la lettera non e' partita, nessuna azienda
   invitata collegata, canale PEC spento o senza credenziali), 'fatta'
   (partita, incerta, esclusa, tentativi finiti), 'aspetta' (il giorno non
   e' passato, la notte, la mezz'ora dopo un no) o 'fare'. */
function sollecitoDi(x) {
    return x && x.sollecitoConferma && typeof x.sollecitoConferma === 'object' ? x.sollecitoConferma : null;
}
function pecStato(x, so, ora) {
    if (!so || so.ok !== true) return 'no';
    if (!x.invitoScheda && !x.invitoCodice) return 'no';
    if (!PEC.configurata()) return 'no';
    const p = x.pecSollecito && typeof x.pecSollecito === 'object' ? x.pecSollecito : null;
    if (p && (p.ok === true || p.incerto === true || p.esclusa === true || p.definitivo === true || (Number(p.tentativi) || 0) >= PEC_MAX_TENTATIVI)) return 'fatta';
    if (ora - (Number(so.quando) || 0) < PEC_DOPO_MS) return 'aspetta';
    if (p && ora - (Number(p.quando) || 0) < PEC_RIPROVA_MS) return 'aspetta';
    return diGiorno(ora) ? 'fare' : 'aspetta';
}

/* Cosa fare di una scheda con la bandiera, adesso. Una funzione sola e
   senza scritture, cosi' le prove la leggono com'e'. `presenza` e' il
   documento delle presenze della scheda, quando chi chiama lo ha letto:
   con lo stato "presente" la persona non aspetta piu' niente. */
function cosaFare(x, ora, presenza) {
    const ev = VERIFICATA.eventoDi(x && x.pagina);
    if (!ev) return { fare: 'togli', perche: 'evento senza conferma' };
    if (ev.fine && ora >= ev.fine) return { fare: 'togli', perche: 'evento finito' };
    if (!CONF.inAttesaDiConferma(x, presenza)) {
        return {
            fare: 'togli',
            perche: CONF.confermata(x) ? 'confermata' : (CONF.inAttesaDiConferma(x) ? 'presente' : 'non in attesa')
        };
    }
    const m = CONF.mailPerIndirizzo(x);
    if (!m) {
        return ora - registrataIl(x) >= PRIMA_ATTESA_MS ? { fare: 'invia' } : { fare: 'aspetta' };
    }
    if (m.ok !== true) {
        const inv = CONF.invioPerIndirizzo(x);
        const falliti = Math.max(1, inv ? Number(inv.falliti) || 0 : 1);
        if (falliti >= MAX_TENTATIVI) return { fare: 'togli', perche: 'tentativi finiti' };
        const pausa = PAUSE_MS[Math.min(falliti, PAUSE_MS.length) - 1];
        return ora - (Number(m.quando) || 0) >= pausa ? { fare: 'riprova' } : { fare: 'aspetta' };
    }
    /* Il sollecito personale, prima del promemoria: a un'ora dalla mail
       partita, finche' non e' partito (o i tentativi sono finiti), e con lo
       stesso orario di giorno. Spento, si salta e si passa al promemoria. */
    const so = sollecitoDi(x);
    /* fatto: partito; o i tentativi finiti; o un esito incerto (la posta non
       ha risposto, o la funzione si e' chiusa fra la presa e la traccia): meglio
       una lettera in meno che due uguali. */
    const soFatto = !!so && (so.ok === true || so.incerto === true || so.definitivo === true || (Number(so.tentativi) || 0) >= SOLLECITO_MAX_TENTATIVI);
    const soRiprova = !!so && ora - (Number(so.quando) || 0) < SOLLECITO_RIPROVA_MS;
    // la PEC, un giorno dopo la lettera: finche' e' da fare la scheda non esce
    const pec = pecStato(x, so, ora);
    const dopoLaPec = (fare, perche) => pec === 'fare' ? { fare: 'pec' } : (pec === 'aspetta' ? { fare: 'aspetta', perche: 'pec a un giorno dalla lettera' } : { fare: fare, perche: perche });
    /* Gli arretrati (recuperoSollecito): anche con il promemoria gia' mandato
       e la mail di giorni fa, una volta; poi la scheda esce, com'era: il
       sollecito e' la sua ultima mail, non l'anticamera di un promemoria.
       Salvo che DOPO la lettera la mail con il pulsante sia ripartita (un
       rinvio dello staff, "Rimandala"): allora e' una scheda come le altre,
       con il promemoria a un giorno. Spento, aspetta: riacceso riparte, e
       nessuno resta indietro. Dopo un rinvio aspetta l'ora di tutti. */
    if (x.sollecitoArretrato === true) {
        const ripartita = !!so && (Number(m.quando) || 0) > (Number(so.quando) || 0);
        if (soFatto && !ripartita) return dopoLaPec('togli', 'sollecito agli arretrati fatto');
        if (!soFatto) {
            if (SOLL.spento()) return { fare: 'aspetta', perche: 'spento' };
            if (ora - (Number(m.quando) || 0) < SOLLECITO_DOPO_MS) return { fare: 'aspetta' };
            if (soRiprova) return { fare: 'aspetta', perche: 'sollecito da riprovare' };
            return diGiorno(ora) ? { fare: 'sollecito' } : { fare: 'aspetta', perche: 'notte' };
        }
    }
    if (x.promemoriaConferma) return dopoLaPec('togli', 'promemoria gia\' mandato');
    // e solo finche' il promemoria non e' alle porte: una scheda vecchia ha quello
    if (!soFatto && !SOLL.spento() && ora - (Number(m.quando) || 0) < SOLLECITO_ENTRO_MS) {
        if (ora - (Number(m.quando) || 0) < SOLLECITO_DOPO_MS) return { fare: 'aspetta' };
        if (soRiprova) return { fare: 'aspetta', perche: 'sollecito da riprovare' };
        return diGiorno(ora) ? { fare: 'sollecito' } : { fare: 'aspetta', perche: 'notte' };
    }
    // prima il promemoria di sempre; la PEC viene dopo (dopoLaPec, sopra), al giro seguente
    if (ora - (Number(m.quando) || 0) < PROMEMORIA_DOPO_MS) return { fare: 'aspetta' };
    return diGiorno(ora) ? { fare: 'promemoria' } : { fare: 'aspetta', perche: 'notte' };
}

/* Il documento delle presenze di una scheda: "evento~idIscritto", con
   l'identificativo dell'iscritto come lo compone l'elenco (api/iscrizioni.js:
   l'email in minuscolo - o nome.cognome - e la data) e senza i caratteri che
   il nome di un documento non puo' avere. Lo stesso di api/presenze.js,
   lib/accredito-desk.js e api/promemoria-eventi.js: una presenza cercata con
   un nome diverso non si troverebbe mai. L'evento e' la `chiave` di
   VERIFICATA.EVENTI, che e' l'identificativo della sezione Eventi. */
function chiaveTesto(s) {
    return String(s == null ? '' : s).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
// l'identificativo dell'iscritto come lo compone l'elenco (vale anche per le cancellate, iscrizioniCancellate)
function idIscritto(x) {
    const em = String((x && x.email) || '');
    return (em.toLowerCase() || (chiaveTesto(x && x.nome) + '.' + chiaveTesto(x && x.cognome))) + '|' + String((x && x.data) || '');
}
function idPresenza(ev, x) {
    return (ev.chiave + '~' + idIscritto(x)).replace(/[\/\\.#$\[\]]/g, '-').slice(0, 400);
}
async function leggiPresenza(db, ev, x) {
    const s = await db.collection('presenze').doc(idPresenza(ev, x)).get();
    return s.exists ? (s.data() || {}) : null;
}

/* update() e non set(merge): una scheda cancellata nel frattempo non deve
   rinascere vuota (varrebbe come iscritta attiva, e terrebbe occupati
   email e cellulare). Su un documento che non c'e' update fallisce con
   NOT_FOUND, ed e' quello che si vuole. */
function nonTrovata(e) {
    return !!e && (e.code === 5 || e.code === 'not-found' || /NOT_FOUND|No document to update/i.test(String(e.message || '')));
}
async function togli(db, id) {
    try { await db.collection('iscrizioni').doc(id).update({ confermaInAttesa: admin.firestore.FieldValue.delete() }); }
    catch (e) { if (!nonTrovata(e)) throw e; }
}

/* IL PROMEMORIA, UNO. Prima si scrive che parte (in una transazione, e
   solo se la scheda di adesso lo chiede ancora), poi si spedisce: due giri
   che si sovrapponessero non ne manderebbero due. Si spedisce con la scheda
   letta nella transazione. Se la mail non parte la bandiera resta, e il
   giro la riprova con le pause di sempre; il promemoria pero' non si
   ripete. */
async function promemoria(db, id, presenza) {
    const rif = db.collection('iscrizioni').doc(id);
    const ora = Date.now();
    const y = await db.runTransaction(async tx => {
        const s = await tx.get(rif);
        const z = s.exists ? (s.data() || {}) : null;
        if (!z || z.confermaInAttesa !== true || cosaFare(z, ora, presenza).fare !== 'promemoria') return null;
        tx.set(rif, { promemoriaConferma: { quando: ora } }, { merge: true });
        return z;
    });
    if (!y) return { fatto: false };
    const e = await CONF.spedisciConferma(db, id, y, { via: 'promemoria', riprova: false, soloSeEsiste: true });
    let sms = null;
    if (y.telefonoNumero) {
        const s = await VERIFICATA.smsConfermaEmail(db, { idDoc: id, numero: y.telefonoNumero, email: y.email, tipo: 'promemoria', soloSeEsiste: true });
        sms = s.ok === true;
    }
    const patch = { promemoriaConferma: { quando: ora, mail: e.ok === true, sms: sms } };
    // la bandiera resta se c'e' ancora la PEC di sollecito da mandare
    const pecResta = ['aspetta', 'fare'].indexOf(pecStato(y, sollecitoDi(y), Date.now())) >= 0;
    if (e.ok && !pecResta) patch.confermaInAttesa = admin.firestore.FieldValue.delete();
    try { await rif.update(patch); } catch (_) { /* la prenotazione c'e' gia': non si ripete */ }
    return { fatto: true, mail: e.ok === true, sms: sms };
}

/* IL SOLLECITO PERSONALE, come il promemoria: prima si scrive che parte (in
   una transazione, e solo se la scheda di adesso lo chiede ancora), con il
   tentativo contato e l'esito INCERTO, poi si spedisce con la scheda letta
   li'. Cosi' una funzione chiusa fra la presa e la traccia, o una traccia
   che non si scrive, non fanno ripartire la stessa lettera. Un no certo
   della posta resta con il suo errore e il giro riprova dopo mezz'ora; al
   terzo no si lascia stare, e resta il promemoria. */
async function sollecito(db, id, presenza) {
    const rif = db.collection('iscrizioni').doc(id);
    const ora = Date.now();
    const y = await db.runTransaction(async tx => {
        const s = await tx.get(rif);
        const z = s.exists ? (s.data() || {}) : null;
        if (!z || z.confermaInAttesa !== true || cosaFare(z, ora, presenza).fare !== 'sollecito') return null;
        const prima = z.sollecitoConferma && typeof z.sollecitoConferma === 'object' ? z.sollecitoConferma : {};
        tx.set(rif, { sollecitoConferma: { quando: ora, ok: false, incerto: true, errore: 'in corso', tentativi: (Number(prima.tentativi) || 0) + 1, a: String(z.email || '').trim().toLowerCase() } }, { merge: true });
        return z;
    });
    if (!y) return { fatto: false };
    const prima = y.sollecitoConferma && typeof y.sollecitoConferma === 'object' ? y.sollecitoConferma : {};
    const e = await SOLL.spedisci(y);
    /* Un guasto del canale (il mittente rifiutato, le credenziali, il saluto)
       non e' un no a questa persona: il tentativo non si conta, si riprova
       fra mezz'ora come dopo un no, e il giro non prova altre lettere. Un no
       definitivo (5xx) chiude: non si riprova. `copia`: la copia nascosta
       e' gia' arrivata (con lei il server aveva detto si'), e ai tentativi
       dopo non si rimanda. */
    const tentativi = (Number(prima.tentativi) || 0) + (e.ok || !e.canale ? 1 : 0);
    const patch = { sollecitoConferma: { quando: ora, ok: e.ok === true, incerto: !e.ok && e.incerto === true, canale: !e.ok && e.canale === true, definitivo: !e.ok && e.definitivo === true,
        errore: String(e.errore || '').slice(0, 200), tentativi: tentativi, a: e.a, copia: prima.copia === true || e.copia === true } };
    try { await rif.update(patch); } catch (_) { /* la scheda non c'e' piu': non rinasce */ }
    return { fatto: true, mail: e.ok === true, canale: !e.ok && e.canale === true };
}

/* LA PEC DI SOLLECITO, come la lettera: la presa in una transazione (con
   l'esito incerto, cosi' una funzione chiusa a meta' non la ripete), poi
   l'azienda invitata con la sua PEC, il Message-ID registrato per il lettore
   della casella (tipo 'sollecito', con l'iscrizione: ricevute e risposte
   finiscono qui, non sull'invito), e la spedizione. Senza un'azienda con una
   PEC la scheda resta `esclusa`, e lo dice. */
async function pecSollecito(db, id, presenza) {
    const rif = db.collection('iscrizioni').doc(id);
    const ora = Date.now();
    const y = await db.runTransaction(async tx => {
        const s = await tx.get(rif);
        const z = s.exists ? (s.data() || {}) : null;
        if (!z || z.confermaInAttesa !== true || cosaFare(z, ora, presenza).fare !== 'pec') return null;
        const prima = z.pecSollecito && typeof z.pecSollecito === 'object' ? z.pecSollecito : {};
        tx.set(rif, { pecSollecito: { quando: ora, ok: false, incerto: true, errore: 'in corso', tentativi: (Number(prima.tentativi) || 0) + 1 } }, { merge: true });
        return z;
    });
    if (!y) return { fatto: false };
    const prima = y.pecSollecito && typeof y.pecSollecito === 'object' ? y.pecSollecito : {};
    const tentativi = (Number(prima.tentativi) || 0) + 1;
    const scrivi = async patch => { try { await rif.update({ pecSollecito: patch }); } catch (_) { /* la scheda non c'e' piu': non rinasce */ } };
    let az = null;
    try { az = await PEC.aziendaDi(db, y); }
    catch (e) {
        // non si e' potuto leggere: non e' un no, si riprova dopo mezz'ora senza contare il tentativo
        await scrivi({ quando: ora, ok: false, incerto: false, canale: true, errore: 'azienda invitata non letta: ' + String((e && e.message) || e).slice(0, 150), tentativi: tentativi - 1 });
        return { fatto: true, mail: false, canale: true };
    }
    const a = PEC.pecDi(az);
    if (!a) {
        await scrivi({ quando: ora, ok: false, incerto: false, esclusa: true, tentativi: tentativi,
            errore: az ? 'l\'azienda invitata non ha un indirizzo PEC' : 'nessuna azienda invitata collegata all\'iscrizione' });
        return { fatto: true, mail: false, esclusa: true };
    }
    const ev = VERIFICATA.eventoDi(y.pagina);
    const riferimento = PEC.riferimentoNuovo();
    try {
        await LETTORE.registraRiferimento(db, riferimento, { scheda: az.id, evento: ev ? ev.chiave : '', destinatario: a, tipo: 'sollecito', iscrizione: id });
    } catch (e) {
        await scrivi({ quando: ora, ok: false, incerto: false, canale: true, errore: 'riferimento non registrato: ' + String((e && e.message) || e).slice(0, 150), tentativi: tentativi - 1 });
        return { fatto: true, mail: false, canale: true };
    }
    const e = await PEC.spedisci(y, az, riferimento);
    await scrivi({
        quando: ora, ok: e.ok === true, incerto: !e.ok && e.incerto === true, canale: !e.ok && e.canale === true, definitivo: !e.ok && e.definitivo === true,
        errore: String(e.errore || '').slice(0, 200), tentativi: (Number(prima.tentativi) || 0) + (e.ok || !e.canale ? 1 : 0),
        a: a, azienda: az.id, riferimento: e.ok ? riferimento : '', messageId: e.ok ? String(e.messageId || '') : ''
    });
    return { fatto: true, mail: e.ok === true, canale: !e.ok && e.canale === true };
}

/* Una scheda, adesso (vedi LA SCHEDA DI ADESSO): si rilegge, si rifa' il
   conto con la scheda fresca - e, se c'e' da spedire, con la sua presenza -
   e si lavora su quella. I conti si aggiornano qui. */
async function lavora(db, id, conti) {
    const rif = db.collection('iscrizioni').doc(id);
    const s = await rif.get();
    if (!s.exists) { conti.cambiate++; return; }
    const x = s.data() || {};
    // la bandiera l'ha gia' tolta qualcun altro: la conferma, l'annullamento, un rinvio riuscito del promemoria
    if (x.confermaInAttesa !== true) { conti.cambiate++; return; }
    const ora = Date.now();
    let c = cosaFare(x, ora);
    let presenza = null;
    if (c.fare === 'invia' || c.fare === 'riprova' || c.fare === 'promemoria' || c.fare === 'sollecito' || c.fare === 'pec') {
        presenza = await leggiPresenza(db, VERIFICATA.eventoDi(x.pagina), x);
        c = cosaFare(x, ora, presenza);
        if (c.fare === 'pec') {
            // con il gestore PEC guasto (credenziali, saluto) le altre aspettano il giro dopo
            if (conti.pecBloccato) { conti.aspettano++; return; }
            const p = await pecSollecito(db, id, presenza);
            if (p.fatto) {
                conti.pec++;
                if (!p.mail && !p.esclusa) conti.errori++;
                if (p.esclusa) conti.pecEscluse++;
                if (p.canale) conti.pecBloccato = true;
            } else {
                conti.cambiate++;
            }
            return;
        }
        if (c.fare === 'sollecito') {
            // con il canale guasto (vedi sollecito) le altre lettere aspettano il giro dopo
            if (conti.sollecitoBloccato) { conti.aspettano++; return; }
            /* Prima della prima lettera del giro: il mittente e' verificato su
               Brevo? Se no, Brevo accetterebbe e scarterebbe in silenzio
               (lib/sollecito-conferma.js): tutte aspettano, senza tentativi. */
            if (!conti.mittenteOk) {
                const v = await SOLL.mittenteVerificato();
                if (!v.ok) {
                    conti.sollecitoBloccato = true;
                    conti.sollecitoMotivo = String(v.motivo || '').slice(0, 300);
                    console.warn('Sollecito conferma fermo:', conti.sollecitoMotivo);
                    conti.aspettano++;
                    return;
                }
                conti.mittenteOk = true;
            }
            const p = await sollecito(db, id, presenza);
            if (p.fatto) {
                conti.solleciti++;
                if (!p.mail) conti.errori++;
                if (p.canale) conti.sollecitoBloccato = true;
            } else {
                conti.cambiate++;
            }
            return;
        }
        if (c.fare === 'promemoria') {
            const p = await promemoria(db, id, presenza);
            if (p.fatto) {
                conti.promemoria++;
                if (!p.mail) conti.errori++;
                if (p.sms) conti.sms++;
            } else {
                conti.cambiate++;
            }
            return;
        }
    }
    if (c.fare === 'togli') {
        await togli(db, id);
        conti.tolte++;
        return;
    }
    if (c.fare === 'aspetta') { conti.aspettano++; return; }
    /* Invia o riprova. La scheda si PRENDE in una transazione prima di
       spedire (vedi UN INVIO ALLA VOLTA in lib/conferma-email.js): se nel
       frattempo e' partito un "Rimandala", o ne sta partendo uno, o il conto
       non torna piu', questo giro la lascia. Si spedisce con la scheda letta
       nella transazione. */
    const fare = c.fare;
    const z = await db.runTransaction(async tx => {
        const s2 = await tx.get(rif);
        if (!s2.exists) return null;
        const y = s2.data() || {};
        const adesso = Date.now();
        if (y.confermaInAttesa !== true || (Number(y.invioInCorsoFino) || 0) > adesso) return null;
        if (cosaFare(y, adesso, presenza).fare !== fare) return null;
        tx.set(rif, { invioInCorsoFino: adesso + CONF.INVIO_IN_CORSO_MS }, { merge: true });
        return y;
    });
    if (!z) { conti.cambiate++; return; }
    const e = await CONF.spedisciConferma(db, id, z, { via: 'automatico', riprova: false, soloSeEsiste: true });
    conti[fare === 'invia' ? 'inviate' : 'riprovate']++;
    if (!e.ok) conti.errori++;
    /* Mai partita: con lei non era partito nemmeno l'SMS che la
       accompagna. Parte adesso, una volta (chi riprova dopo un
       errore l'SMS l'ha gia' avuto, con la notizia del ritardo). */
    if (fare === 'invia' && !z.smsConferma && z.telefonoNumero) {
        const sm = await VERIFICATA.smsConfermaEmail(db, {
            idDoc: id, numero: z.telefonoNumero, email: z.email, tipo: e.ok ? 'inviata' : 'non-inviata', soloSeEsiste: true
        });
        if (sm.ok) conti.sms++;
    }
}

/* Il lucchetto (vedi UN GIRO ALLA VOLTA), come quello delle code della
   diretta (lib/diretta-invio.js): preso in una transazione, mollato solo
   se e' ancora di questo giro. */
function rifMeta(db) { return db.collection('meta').doc('confermeEmail'); }
async function prendiLucchetto(db, giro) {
    return db.runTransaction(async tx => {
        const s = await tx.get(rifMeta(db));
        const d = s.exists ? (s.data() || {}) : {};
        const ora = Date.now();
        if ((Number(d.lucchettoFino) || 0) > ora) return false;
        tx.set(rifMeta(db), { lucchettoFino: ora + LUCCHETTO_MS, lucchettoGiro: giro }, { merge: true });
        return true;
    });
}
async function mollaLucchetto(db, giro) {
    try {
        await db.runTransaction(async tx => {
            const s = await tx.get(rifMeta(db));
            const d = s.exists ? (s.data() || {}) : {};
            if (d.lucchettoGiro === giro) tx.set(rifMeta(db), { lucchettoFino: 0, lucchettoGiro: null }, { merge: true });
        });
    } catch (e) {
        console.error('Conferme email: lucchetto non mollato (scade da solo):', motivo(e));
    }
}

/* Il recupero delle iscrizioni di prima della bandiera (vedi in cima). */
async function recupero(db) {
    const rif = rifMeta(db);
    const s = await rif.get();
    if (s.exists && Number((s.data() || {}).recupero) >= VERSIONE_RECUPERO) return 0;
    const snap = await db.collection('iscrizioni').get();
    const docs = [];
    snap.forEach(d => docs.push(d));
    let batch = db.batch(), nel = 0, segnate = 0;
    for (const d of docs) {
        const x = d.data() || {};
        if (x.confermaInAttesa === true || x.promemoriaConferma) continue;
        if (!VERIFICATA.eventoDi(x.pagina) || !CONF.inAttesaDiConferma(x)) continue;
        batch.set(d.ref, { confermaInAttesa: true }, { merge: true });
        nel++; segnate++;
        if (nel >= 400) { await batch.commit(); batch = db.batch(); nel = 0; }
    }
    if (nel) await batch.commit();
    await rif.set({ recupero: VERSIONE_RECUPERO, recuperoQuando: Date.now(), recuperate: segnate }, { merge: true });
    return segnate;
}

/* Il sollecito agli arretrati, una volta (VERSIONE_SOLLECITO): le schede
   di un evento con la conferma, dal modulo del sito, con la mail con il
   pulsante partita e mai cliccata, senza il sollecito. Anche quelle fuori
   dal giro: con il promemoria gia' ricevuto, o di giorni fa. Si segnano
   (`sollecitoArretrato`) e si rimette la bandiera: da li' le prende il
   giro, di giorno, poche per volta, con la presenza riletta prima di
   spedire (chi e' gia' in sala non riceve niente), e dopo il sollecito
   escono. Chi e' ancora NEL giro (la bandiera alzata) non e' un arretrato:
   segue la strada di tutti - il sollecito se la mail ha meno di ventidue
   ore, poi il promemoria. Una scheda confermata, annullata, inserita a
   mano, importata o di un altro evento resta fuori. */
async function recuperoSollecito(db) {
    const rif = rifMeta(db);
    const s = await rif.get();
    if (s.exists && Number((s.data() || {}).sollecitoArretrati) >= VERSIONE_SOLLECITO) return 0;
    if (SOLL.spento()) return 0;
    const snap = await db.collection('iscrizioni').get();
    const docs = [];
    snap.forEach(d => docs.push(d));
    let batch = db.batch(), nel = 0, segnate = 0;
    for (const d of docs) {
        const x = d.data() || {};
        if (x.sollecitoConferma || x.sollecitoArretrato || x.confermaInAttesa === true) continue;
        const ev = VERIFICATA.eventoDi(x.pagina);
        if (!ev || (ev.fine && Date.now() >= ev.fine) || !CONF.inAttesaDiConferma(x)) continue;
        const m = CONF.mailPerIndirizzo(x);
        if (!m || m.ok !== true) continue;
        batch.set(d.ref, { confermaInAttesa: true, sollecitoArretrato: true }, { merge: true });
        nel++; segnate++;
        if (nel >= 400) { await batch.commit(); batch = db.batch(); nel = 0; }
    }
    if (nel) await batch.commit();
    await rif.set({ sollecitoArretrati: VERSIONE_SOLLECITO, sollecitoArretratiQuando: Date.now(), sollecitiArretrati: segnate }, { merge: true });
    return segnate;
}

/* Il giro. opz.budget (millisecondi) solo per le prove. Restituisce i
   conti, che l'endpoint rimanda tali e quali (nei log di Vercel):
   `occupato` se un altro giro aveva il lucchetto (e questo non ha fatto
   niente), `lette` le schede con la bandiera trovate, `limitePieno` se
   erano tante quante il limite (ce ne possono essere altre), `cambiate`
   quelle che fra la ricerca e il lavoro sono sparite o uscite dal giro,
   `rimaste` quelle che avevano qualcosa da fare e aspettano il giro dopo. */
async function giro(db, opz) {
    opz = opz || {};
    const scadenza = Date.now() + (Number(opz.budget) || BUDGET_MS);
    const conti = {
        occupato: false, recuperate: 0, arretrati: 0, lette: 0, limitePieno: false, esaminate: 0, inviate: 0, riprovate: 0,
        solleciti: 0, sollecitoBloccato: false, sollecitoMotivo: '', mittenteOk: false, pec: 0, pecEscluse: 0, pecBloccato: false, promemoria: 0,
        sms: 0, tolte: 0, aspettano: 0, cambiate: 0, errori: 0, rimaste: 0
    };
    const idGiro = crypto.randomBytes(8).toString('hex');
    if (!await prendiLucchetto(db, idGiro)) { conti.occupato = true; return conti; }
    try {
        try { conti.recuperate = await recupero(db); }
        catch (e) { console.error('Conferme email: recupero non riuscito:', motivo(e)); }
        try { conti.arretrati = await recuperoSollecito(db); }
        catch (e) { console.error('Conferme email: sollecito agli arretrati non segnato:', motivo(e)); }
        const snap = await db.collection('iscrizioni').where('confermaInAttesa', '==', true).limit(LIMITE).get();
        const fila = [];
        snap.forEach(d => fila.push({ id: d.id, c: cosaFare(d.data() || {}, Date.now()) }));
        conti.lette = fila.length;
        if (fila.length >= LIMITE) {
            conti.limitePieno = true;
            console.warn('Conferme email: lette ' + fila.length + ' schede con la bandiera, il limite del giro: ce ne possono essere altre che questo giro non vede.');
        }
        // per urgenza; a parita' l'ordine della ricerca (sort e' stabile)
        fila.sort((a, b) => PRIORITA[a.c.fare] - PRIORITA[b.c.fare]);
        for (const f of fila) {
            // chi aspetta non costa niente: si conta, anche a tempo finito
            if (f.c.fare === 'aspetta') { conti.esaminate++; conti.aspettano++; continue; }
            if (Date.now() >= scadenza) { conti.rimaste++; continue; }
            conti.esaminate++;
            try {
                await lavora(db, f.id, conti);
            } catch (e) {
                conti.errori++;
                console.error('Conferme email: scheda non lavorata:', motivo(e));
            }
        }
    } finally {
        /* lo stato del mittente, dove lo si puo' leggere senza i log: su meta,
           solo quando il giro l'ha chiesto (una lettera da spedire c'era) */
        if (conti.mittenteOk || conti.sollecitoMotivo) {
            try { await rifMeta(db).set({ sollecitoMittente: { quando: Date.now(), ok: !!conti.mittenteOk, motivo: conti.sollecitoMotivo || '', mittente: SOLL.mittenteEmail() } }, { merge: true }); } catch (_) { }
        }
        await mollaLucchetto(db, idGiro);
    }
    return conti;
}

module.exports = {
    giro, cosaFare, pecStato, registrataIl, recupero, recuperoSollecito, idPresenza, idIscritto, oraRoma,
    PAUSE_MS, MAX_TENTATIVI, PRIMA_ATTESA_MS, PROMEMORIA_DOPO_MS, PROMEMORIA_DALLE, PROMEMORIA_ALLE, LIMITE, LUCCHETTO_MS,
    SOLLECITO_DOPO_MS, SOLLECITO_ENTRO_MS, SOLLECITO_RIPROVA_MS, SOLLECITO_MAX_TENTATIVI, VERSIONE_SOLLECITO,
    PEC_DOPO_MS, PEC_RIPROVA_MS, PEC_MAX_TENTATIVI
};
