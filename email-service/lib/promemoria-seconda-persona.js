/* ============================================================
   "L'invito vale per due persone": la mail a chi si e' iscritto da solo
   ------------------------------------------------------------
   A Milano 2027 il codice riservato che parte con la PEC di invito vale
   per DUE iscrizioni (lib/iscrizione-verificata.js, MAX_PER_CODICE). Molte
   aziende ne usano una sola, e il secondo posto resta li' finche' la sala
   non si riempie. Questo giro (api/promemoria-seconda-persona.js, dal cron
   di vercel.json) scrive UNA mail, solo testo, a chi si e' iscritto con il
   codice quando e' l'unica persona della sua azienda: ricorda che l'invito
   e' per due, chiede di registrare la seconda prima che finiscano i posti
   e riporta il codice (il testo e' MNGB.secondaPersona).

   A CHI. Tutte e sei le condizioni, rilette sulla scheda di adesso prima
   di spedire:
     - l'iscrizione e' a un evento con il tetto per codice (VERIFICATA.EVENTI,
       oggi Milano), con il codice dell'invito (`selezionata`, `invitoCodice`);
     - con quel codice c'e' UNA sola iscrizione attiva: nell'elenco delle
       iscrizioni e nel conto del codice (`iscrizioniUsate`, lo stesso che
       ferma la terza persona al modulo). Un'annullata non conta;
     - l'indirizzo email e' confermato (`emailConfermata`, il pulsante della
       mail): la mail va all'indirizzo verificato, a nessun altro;
     - e' passato un giorno dalla conferma: chi si e' appena iscritto ha in
       mano la mail di conferma e quella con l'invito, e spesso il collega
       si sta gia' registrando. Chi era iscritto da prima la riceve al primo
       giro utile;
     - il codice e' quello di un invito (`campagna` 'invito', non la PEC
       degli sponsor) e all'azienda e' partito PER PEC: l'ultimo invio o il
       secondo invio sul canale 'pec', la ricevuta di consegna della PEC, o
       una PEC dall'esito mai scritto (vedi invitataPerPec). Chi l'ha avuto
       solo per email ordinaria resta fuori, come ha chiesto chi organizza;
     - l'evento non e' a meno di un giorno (dopo, un "registra il collega"
       arriva troppo tardi per servire).

   UNA PER AZIENDA, UNA VOLTA. Il segno sta sul documento del codice
   (`secondaPersona`), che e' l'azienda: se la persona annulla e se ne
   iscrive un'altra da sola, la mail non riparte. Si prende in una
   transazione PRIMA di spedire (stato 'in-corso', con una scadenza): due
   giri insieme non ne mandano due. Se la funzione si chiude a meta', alla
   scadenza il segno diventa 'incerta' e non si riprova: una mail in meno e'
   meglio della stessa mail due volte. Per la stessa ragione e' 'incerta'
   anche un errore di nodemailer arrivato dopo l'inizio dell'invio senza
   una risposta del server (tempo scaduto, connessione caduta: il messaggio
   puo' essere arrivato). Un no del server a questo messaggio si riprova
   dopo mezz'ora e dopo tre ore, tre tentativi in tutto, poi 'non-partita'.
   Un guasto del canale (credenziali, server irraggiungibile, conto
   bloccato o al tetto) non consuma i tentativi dell'azienda e ferma il
   giro (`bloccato`): si riprova al giro dopo, una azienda alla volta,
   finche' il guasto non passa (vedi esitoErrore).
   Lo stesso segno, finito il lavoro, si copia sulla scheda
   (`promemoriaSecondaPersona`): e' quello che fa saltare l'azienda ai giri
   dopo senza rileggere il codice ogni venti minuti.

   QUANDO. Dal lunedi' al venerdi', dalle 9 alle 19 ora di Milano: e' una
   mail di lavoro, e al lunedi' mattina si legge meglio che al sabato sera.
   Fuori orario il giro non legge niente. Al piu' PER_GIRO mail a giro,
   e solo nei primi BUDGET_MS dei 60 secondi della funzione; quelle che
   restano le prende il giro dopo, venti minuti piu' tardi.

   SPEGNERLO. PROMEMORIA_SECONDA_PERSONA=no su Vercel (per esempio quando
   la sala e' piena): il giro risponde `spento` e non fa niente.

   UN GIRO ALLA VOLTA. Il lucchetto su meta/promemoriaSecondaPersona, come
   quello di lib/giro-conferme.js.
   ============================================================ */

const crypto = require('crypto');
const CODICI = require('./codici-invito');
const VERIFICATA = require('./iscrizione-verificata');
const CONF = require('./conferma-email');
const MNGB = require('./mail-ngb');
const CANALI = require('./canali-invito');

// dalla conferma dell'email
const DOPO_CONFERMA_MS = 24 * 60 * 60 * 1000;
// prima della fine dell'evento (VERIFICATA.EVENTI, `fine`): l'ultimo giorno non parte piu'
const FERMO_PRIMA_MS = 24 * 60 * 60 * 1000;
// dal lunedi' al venerdi', dalle 9 (compresa) alle 19 (esclusa), ora di Milano
const DALLE = 9;
const ALLE = 19;
const PER_GIRO = 15;
const BUDGET_MS = 30 * 1000;
// una mail che non parte entro questo tempo e' 'incerta': 30 + 25 sta dentro i 60 della funzione
const LIMITE_INVIO_MS = 25 * 1000;
// la presa del codice: piu' lunga della funzione, cosi' scade solo se la funzione e' morta
const IN_CORSO_MS = 2 * 60 * 1000;
const LUCCHETTO_MS = 2 * 60 * 1000;
// dopo il primo e il secondo no del server di posta
const PAUSE_MS = [30 * 60 * 1000, 3 * 60 * 60 * 1000];
const MAX_TENTATIVI = 3;
// gli stati che non si toccano piu'
const FINITI = ['inviata', 'non-partita', 'incerta'];
// i no della rilettura che non cambiano piu' (vedi lavora)
const ESCLUSIONI = ['codice', 'campagna', 'pec'];
// i campi della scheda che servono al giro (la ricerca legge solo questi)
const CAMPI = ['pagina', 'invitoCodice', 'annullato', 'email', 'emailConfermata', 'promemoriaSecondaPersona'];

function motivo(e) { return String((e && e.message) || e).replace(/[^\s/@'"]+@[^\s/'"]+/g, '<email>').slice(0, 200); }

function spento() {
    return /^(no|off|0|false|spento)$/i.test(String(process.env.PROMEMORIA_SECONDA_PERSONA || '').trim());
}

/* Il giorno della settimana e l'ora di Milano di un istante, con l'ora
   legale o solare del giorno. Dall'istante, non da new Date(): l'orologio
   delle prove sostituisce Date.now(). */
function inOrario(ts) {
    const p = {};
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', weekday: 'short', hour: 'numeric', hourCycle: 'h23' })
        .formatToParts(new Date(ts)).forEach(x => { p[x.type] = x.value; });
    const h = Number(p.hour);
    return p.weekday !== 'Sat' && p.weekday !== 'Sun' && h >= DALLE && h < ALLE;
}

function quandoConfermata(x) {
    const c = x && x.emailConfermata;
    return c && typeof c === 'object' ? Number(c.quando) || 0 : 0;
}
function indirizzoValido(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim()); }

/* La scheda della persona, da sola: e' pronta a ricevere la mail adesso?
   Il conto delle iscrizioni del codice lo fa chi chiama. */
function pronta(x, ora) {
    const ev = VERIFICATA.eventoDi(x && x.pagina);
    if (!ev || !VERIFICATA.attiva(x)) return false;
    if (ev.fine && ora >= ev.fine - FERMO_PRIMA_MS) return false;
    if (!CODICI.valido(x.invitoCodice) || !indirizzoValido(x.email)) return false;
    const c = quandoConfermata(x);
    return c > 0 && ora - c >= DOPO_CONFERMA_MS;
}

/* Dalle schede con il codice (la ricerca) alle aziende da scrivere adesso:
   una per codice, con la sua unica iscrizione attiva, la piu' vecchia per
   prima. Senza scritture, cosi' le prove la leggono com'e'. */
function candidati(schede, ora) {
    const codici = new Map();
    for (const s of schede) {
        const x = s.x || {};
        if (!VERIFICATA.eventoDi(x.pagina) || !CODICI.valido(x.invitoCodice)) continue;
        const c = CODICI.normalizza(x.invitoCodice);
        const g = codici.get(c) || { attive: [], segnata: false };
        if (x.promemoriaSecondaPersona) g.segnata = true;
        if (VERIFICATA.attiva(x)) g.attive.push(s);
        codici.set(c, g);
    }
    const fuori = [];
    for (const [codice, g] of codici) {
        if (g.segnata || g.attive.length !== 1) continue;
        const s = g.attive[0];
        if (pronta(s.x, ora)) fuori.push({ codice: codice, id: s.id, confermata: quandoConfermata(s.x) });
    }
    return fuori.sort((a, b) => a.confermata - b.confermata);
}

/* L'invito e' partito per PEC. lib/invio-inviti.js scrive il canale
   sull'ultimo invio (`invio`) e sul secondo invio (`secondoInvio`), ma
   un invio dopo per email ordinaria riscrive `invio`, e una PEC partita
   senza che la funzione abbia scritto com'e' andata ("Esito ignoto") non
   ha `invio.canale` per niente. Valgono quindi anche:
     - la ricevuta di CONSEGNA (`ricevute.consegnata`): la scrive solo il
       lettore della casella PEC (lib/lettore-pec.js) e un invio dopo non la
       cancella. L'accettazione no: la da' il nostro gestore anche a una PEC
       che poi non arriva;
     - la PEC dall'esito ignoto (`errore.incerto` o il `tentativo` rimasto
       sul canale 'pec') quando non c'e' nessun invio dopo: l'azienda si e'
       iscritta con quel codice, quindi le e' arrivato da li'. */
function invitataPerPec(a) {
    if (!a) return false;
    if (a.invio && a.invio.canale === 'pec') return true;
    if (a.secondoInvio && a.secondoInvio.canale === 'pec') return true;
    if (a.ricevute && a.ricevute.consegnata) return true;
    if (!(a.invio && a.invio.canale)
        && ((a.errore && a.errore.canale === 'pec' && a.errore.incerto) || (a.tentativo && a.tentativo.canale === 'pec'))) return true;
    return false;
}
/* Una scheda di aziendeInvito che e' davvero quella di un invito, e non il
   guscio che l'iscrizione riscrive su un nome che non c'e' piu' (solo
   `stato` e `iscritti`, api/iscrizione-nuova.js): senza nessuna traccia di
   invio non dice niente sul canale. */
function conTracciaDiInvio(a) {
    return !!a && !!(a.invio || a.secondoInvio || a.tentativo || a.errore || a.ricevute);
}

/* ---------- come si legge un errore del server di posta ----------
   L'errore e' avvenuto PRIMA che il messaggio partisse (prima del DATA)?
   Allora e' certo che non e' arrivato niente. Stessa regola di
   lib/diretta-invio.js (primaDelData), con lo stesso avvertimento: gli
   errori della connessione di nodemailer (tempo scaduto, socket chiuso)
   portano command 'CONN' in QUALUNQUE momento, anche dopo che il messaggio
   e' stato trasmesso e si aspettava solo il "250 OK". 'CONN' vale "prima"
   solo se la connessione non si e' nemmeno aperta. */
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
/* Da un errore a cosa fare:
     incerta  il messaggio puo' essere arrivato (nessuna risposta del server
              dopo l'inizio dell'invio, o il tempo massimo): non si riprova;
     nostro   non e' partito niente e il guasto e' del canale, uguale per
              tutti (credenziali, server irraggiungibile, conto bloccato o
              al tetto, 421/45x): il tentativo non conta, si riprova al giro
              dopo e questo giro si ferma, invece di bruciare una dopo
              l'altra le mail di quindici aziende;
     conta    il server ha detto no a questo messaggio o a questo
              destinatario: e' un tentativo dei tre. */
function esitoErrore(e) {
    if (!e || e.limite) return 'incerta';
    const prima = primaDelData(e);
    if (!prima && !(Number(e.responseCode) >= 400)) return 'incerta';
    const comando = String(e.command || '').toUpperCase();
    if (comando === 'RCPT TO' || comando === 'API') return 'conta';
    return (prima || CANALI.fermaTutto(e)) ? 'nostro' : 'conta';
}

/* Il segno sul codice: tutti i campi ogni volta, perche' set con merge
   fonde le mappe e un `errore` di prima resterebbe attaccato a un 'inviata'. */
function segno(campi) {
    return Object.assign({ stato: '', quando: 0, iscrizione: '', a: '', tentativi: 0, errore: '', prossimo: 0, fino: 0 }, campi);
}
/* Il segno di prima, letto: lascia partire adesso? */
function puoPartire(sp, ora) {
    if (!sp || typeof sp !== 'object' || !sp.stato) return { si: true };
    if (FINITI.indexOf(sp.stato) >= 0) return { si: false, finito: true };
    if (sp.stato === 'in-corso') return (Number(sp.fino) || 0) > ora ? { si: false } : { si: false, scaduta: true };
    if (sp.stato === 'errore') return (Number(sp.prossimo) || 0) <= ora ? { si: true } : { si: false, aspetta: true };
    return { si: false };
}

function nonTrovata(e) {
    return !!e && (e.code === 5 || e.code === 'not-found' || /NOT_FOUND|No document to update/i.test(String(e.message || '')));
}
/* Il segno sulla scheda, a lavoro finito: update() e non set(merge), una
   scheda cancellata nel frattempo non deve rinascere vuota. */
async function segnaScheda(db, id, campi) {
    try { await db.collection('iscrizioni').doc(id).update({ promemoriaSecondaPersona: campi }); }
    catch (e) { if (!nonTrovata(e)) throw e; }
}

/* La spedizione, con il suo tempo massimo: oltre, l'esito e' incerto. */
function conLimite(p, ms) {
    let t;
    const scade = new Promise((_, no) => { t = setTimeout(() => { const e = new Error('tempo scaduto'); e.limite = true; no(e); }, ms); });
    return Promise.race([p, scade]).finally(() => clearTimeout(t));
}

/* Un'azienda: si prende il codice (in una transazione, rileggendo tutto),
   si spedisce, si scrive com'e' andata. Restituisce true se una mail e'
   partita (o ci ha provato): e' quello che conta per PER_GIRO. */
async function lavora(db, c, conti, spedisci, limiteInvio) {
    const rifCodice = db.collection('codiciInvito').doc(c.codice);
    const rifScheda = db.collection('iscrizioni').doc(c.id);
    const presa = await db.runTransaction(async tx => {
        // prima tutte le letture, poi tutte le scritture (lo vuole Firestore)
        const ora = Date.now();
        const sc = await tx.get(rifCodice);
        if (!sc.exists) return { no: 'codice' };
        const d = sc.data() || {};
        const sp = d.secondaPersona || null;
        const pp = puoPartire(sp, ora);
        if (!pp.si) {
            if (pp.scaduta) {
                tx.set(rifCodice, { secondaPersona: segno({ stato: 'incerta', quando: ora, iscrizione: String(sp.iscrizione || ''), a: String(sp.a || ''), tentativi: Number(sp.tentativi) || 0, errore: 'giro interrotto durante l\'invio' }) }, { merge: true });
                return { no: 'incerta', segna: { quando: ora, codice: c.codice, ok: false } };
            }
            if (pp.finito) return { no: 'gia', segna: { quando: Number(sp.quando) || ora, codice: c.codice, ok: sp.stato === 'inviata' } };
            return { no: pp.aspetta ? 'aspetta' : 'occupata' };
        }
        if (String(d.campagna || 'invito') !== 'invito') return { no: 'campagna' };
        const posti = await VERIFICATA.usiCodice(db, c.codice, tx);
        if (posti.attive.some(id => id !== c.id)) return { no: 'due' };
        const si = await tx.get(rifScheda);
        if (!si.exists) return { no: 'scheda' };
        const x = si.data() || {};
        if (CODICI.normalizza(x.invitoCodice) !== c.codice || !pronta(x, ora)) return { no: 'scheda' };
        /* La scheda dell'azienda: quella a cui punta il codice (Modifica del
           recapito la sposta e aggiorna il codice), poi quella scritta
           sull'iscrizione, poi la ricerca per codice. Se non se ne trova
           nessuna con un invio, si salta senza segnare niente: e' un buco
           dei dati, non la prova che l'invito non e' partito per PEC. */
        let az = null;
        for (const id of [String(d.scheda || ''), String(x.invitoScheda || '')].filter((v, i, t) => v && t.indexOf(v) === i)) {
            const sa = await tx.get(db.collection('aziendeInvito').doc(id));
            if (sa.exists && conTracciaDiInvio(sa.data())) { az = sa.data(); break; }
        }
        if (!az) {
            const q = await tx.get(db.collection('aziendeInvito').where('codice', '==', c.codice).limit(1));
            const trovata = q && q.docs && q.docs.length ? (q.docs[0].data() || {}) : null;
            if (conTracciaDiInvio(trovata)) az = trovata;
        }
        if (!az) return { no: 'azienda' };
        if (!invitataPerPec(az)) return { no: 'pec' };
        const tentativi = Number(sp && sp.tentativi) || 0;
        tx.set(rifCodice, { secondaPersona: segno({ stato: 'in-corso', quando: ora, iscrizione: c.id, a: String(x.email), tentativi: tentativi, fino: ora + IN_CORSO_MS }) }, { merge: true });
        return { x: x, d: d, tentativi: tentativi };
    });
    if (presa.no) {
        /* Le esclusioni che non cambiano (il codice non c'e' piu', e' di uno
           sponsor, l'invito non e' partito per PEC) si scrivono sulla scheda
           come il segno: senza, la stessa azienda si rileggerebbe a ogni
           giro e, in testa alla fila, terrebbe indietro le altre. Un'azienda
           gia' iscritta non riceve piu' inviti (il secondo invio va solo a chi
           non si e' iscritto), quindi "non per PEC" resta tale. */
        const esclusa = ESCLUSIONI.indexOf(presa.no) >= 0;
        if (presa.segna) await segnaScheda(db, c.id, presa.segna);
        else if (esclusa) await segnaScheda(db, c.id, { quando: Date.now(), codice: c.codice, ok: false, escluso: presa.no });
        if (presa.no === 'incerta') conti.incerte++;
        else if (presa.no === 'aspetta') conti.aspettano++;
        else if (esclusa) conti.escluse++;
        else conti.saltate++;
        return false;
    }
    const x = presa.x;
    const m = MNGB.secondaPersona({
        nome: x.nome, cognome: x.cognome, codice: c.codice, pagina: x.pagina,
        azienda: String(presa.d.ragioneSociale || x.invitoAzienda || x.azienda || ''),
        evento: CONF.dettagliEvento(x.pagina), contatto: CONF.rispondiA()
    });
    const a = String(x.email).trim();
    let errore = null;
    try {
        await conLimite(Promise.resolve().then(() => spedisci({
            from: CONF.mittente(), to: a, replyTo: CONF.rispondiA(), subject: m.oggetto, text: m.testo,
            // nei log transazionali di Brevo si filtra per tag, come per la mail di conferma
            headers: { 'X-Mailin-Tag': 'seconda-persona' }
        })), limiteInvio);
    } catch (e) { errore = e; }
    const ora = Date.now();
    const tentativi = presa.tentativi + 1;
    const base = { quando: ora, iscrizione: c.id, a: a };
    const come = errore ? esitoErrore(errore) : 'inviata';
    let s;
    if (come === 'inviata') s = segno(Object.assign(base, { stato: 'inviata', tentativi: tentativi }));
    else if (come === 'incerta') s = segno(Object.assign(base, { stato: 'incerta', tentativi: tentativi, errore: errore.limite ? 'il server di posta non ha risposto in tempo' : motivo(errore) }));
    // il guasto del canale non consuma i tentativi dell'azienda
    else if (come === 'nostro') s = segno(Object.assign(base, { stato: 'errore', tentativi: presa.tentativi, errore: motivo(errore), prossimo: ora + PAUSE_MS[0] }));
    else if (tentativi >= MAX_TENTATIVI) s = segno(Object.assign(base, { stato: 'non-partita', tentativi: tentativi, errore: motivo(errore) }));
    else s = segno(Object.assign(base, { stato: 'errore', tentativi: tentativi, errore: motivo(errore), prossimo: ora + PAUSE_MS[tentativi - 1] }));
    if (s.stato === 'inviata') conti.inviate++;
    else if (s.stato === 'incerta') conti.incerte++;
    else conti.errori++;
    /* Un guasto del canale, o un server che smette di rispondere a meta':
       il giro si ferma qui (vedi giro). Al piu' un'azienda per giro paga un
       esito incerto. */
    if (errore && come !== 'conta') conti.bloccato = motivo(errore);
    if (errore) console.error('Seconda persona: mail per il codice ' + c.codice + ' non partita (' + come + '):', motivo(errore));
    await rifCodice.update({ secondaPersona: s });
    if (FINITI.indexOf(s.stato) >= 0) await segnaScheda(db, c.id, { quando: ora, codice: c.codice, ok: s.stato === 'inviata' });
    return true;
}

/* Il lucchetto (vedi UN GIRO ALLA VOLTA): preso in una transazione,
   mollato solo se e' ancora di questo giro. */
function rifMeta(db) { return db.collection('meta').doc('promemoriaSecondaPersona'); }
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
        console.error('Seconda persona: lucchetto non mollato (scade da solo):', motivo(e));
    }
}

/* Il giro. opz.spedisci(messaggio), opz.budget e opz.limiteInvio solo per le prove; di
   norma la posta e' quella delle mail di conferma (CONF.trasporto).
   Restituisce i conti, che l'endpoint rimanda tali e quali (nei log di
   Vercel): `spento`, `fuoriOrario` e `occupato` se il giro non ha fatto
   niente, `lette` le schede con il codice, `candidate` le aziende con una
   persona sola pronte adesso, `escluse` quelle fuori per sempre (invito non
   per PEC, codice di sponsor o sparito), `aspettano` quelle con un
   tentativo da rifare piu' tardi, `saltate` quelle che la rilettura ha
   trovato cambiate (un secondo iscritto, la scheda modificata) o senza la
   scheda dell'azienda, `rimaste` quelle per il giro dopo, `bloccato` il
   guasto del server di posta che ha fermato il giro. */
async function giro(db, opz) {
    opz = opz || {};
    const conti = {
        spento: false, fuoriOrario: false, occupato: false,
        lette: 0, candidate: 0, inviate: 0, errori: 0, incerte: 0, aspettano: 0, escluse: 0, saltate: 0, rimaste: 0,
        bloccato: ''
    };
    if (spento()) { conti.spento = true; return conti; }
    if (!inOrario(Date.now())) { conti.fuoriOrario = true; return conti; }
    const scadenza = Date.now() + (Number(opz.budget) || BUDGET_MS);
    let spedisci = opz.spedisci;
    if (!spedisci) { const t = CONF.trasporto(); spedisci = mess => t.sendMail(mess); }
    const idGiro = crypto.randomBytes(8).toString('hex');
    if (!await prendiLucchetto(db, idGiro)) { conti.occupato = true; return conti; }
    try {
        const snap = await db.collection('iscrizioni').where('selezionata', '==', true).select(...CAMPI).get();
        const schede = [];
        snap.forEach(d => schede.push({ id: d.id, x: d.data() || {} }));
        conti.lette = schede.length;
        const fila = candidati(schede, Date.now());
        conti.candidate = fila.length;
        let fatte = 0;
        for (const c of fila) {
            if (fatte >= PER_GIRO || conti.bloccato || Date.now() >= scadenza) { conti.rimaste++; continue; }
            try {
                if (await lavora(db, c, conti, spedisci, Number(opz.limiteInvio) || LIMITE_INVIO_MS)) fatte++;
            } catch (e) {
                conti.errori++;
                console.error('Seconda persona: azienda non lavorata:', motivo(e));
            }
        }
    } finally {
        await mollaLucchetto(db, idGiro);
    }
    return conti;
}

module.exports = {
    giro, candidati, pronta, inOrario, invitataPerPec, puoPartire, esitoErrore,
    DOPO_CONFERMA_MS, FERMO_PRIMA_MS, PER_GIRO, PAUSE_MS, MAX_TENTATIVI, IN_CORSO_MS, LIMITE_INVIO_MS, CAMPI
};
