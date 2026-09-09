/* ============================================================
   Il motore che spedisce l'invito, una scheda per volta
   ------------------------------------------------------------
   Questo ciclo stava dentro l'azione 'invia' di lib/aziende-invito.js,
   ed era l'unico posto da cui partiva un invito. Ora i posti sono due:
   l'invio a mano dall'area riservata (che chiama quell'azione a lotti,
   con la finestra aperta) e il lavoro automatico degli invii
   programmati (lib/giro-inviti.js), che va avanti da solo a ritmo.

   Sono due mestieri diversi ma spediscono la STESSA cosa, e tenerne
   due copie avrebbe voluto dire che prima o poi una delle due smette
   di assegnare il codice, o di saltare i disiscritti, o di annotare il
   riferimento delle ricevute. In un invio a freddo a migliaia di
   aziende quel genere di divergenza non si scopre: si paga.

   COSA FA PER OGNI SCHEDA, e in che ordine (l'ordine e' la parte che
   conta, e ogni passo e' li' per un guaio gia' successo):

     1. rilegge la scheda dall'archivio. Chi chiama manda solo degli
        identificativi, e fra la selezione e l'invio l'elenco puo'
        essere cambiato: una scheda esclusa, disiscritta o gia'
        servita non deve ripartire per il fatto di essere stata
        spuntata dieci minuti prima;
     2. controlla che sia dell'evento E della campagna giuste. Un
        identificativo arrivato per sbaglio dall'altra lista
        riceverebbe il testo sbagliato, e quello e' un danno che non
        si ritira;
     3. salta chi si e' disiscritto, qualunque lista lo riporti a
        galla, e glielo scrive in stato;
     4. assegna il CODICE riservato all'azienda e lo scrive PRIMA di
        spedire. Se partisse la mail e poi fallisse la scrittura,
        l'azienda avrebbe in mano un codice che qui non risulta e al
        momento di registrarsi si sentirebbe dire di no;
     5. annota il riferimento (Message-ID) PRIMA di spedire, sulla
        PEC: e' il filo con cui la ricevuta del gestore ritrova la
        scheda. Se la funzione morisse fra l'invio e la scrittura
        dell'esito, la ricevuta arriverebbe comunque e troverebbe il
        filo gia' teso;
     6. lascia un TIMBRO sulla scheda, sempre prima di spedire: e'
        l'unica cosa che, dopo un'interruzione, distingue "non e' mai
        partita" da "non si sa" (vedi INCERTO_DOPO_MS qui sotto);
     7. spedisce, aspettando fra un messaggio e l'altro il tempo che
        il canale chiede (un secondo e mezzo sulla PEC);
     8. scrive l'esito sulla scheda e toglie il timbro. E' li' che
        vive: percio' interrompere e riprendere non rispedisce a
        nessuno.

   NON si ferma al primo errore: un indirizzo inesistente e' un
   problema di quella riga. Si ferma invece quando il rifiuto riguarda
   NOI (IP bloccato, credenziali, tetto del gestore): insistere
   allungherebbe il blocco e marcherebbe "errore" decine di aziende che
   non c'entrano niente.
   ============================================================ */

const CANALI = require('./canali-invito');
const CODICI = require('./codici-invito');
const LETTORE = require('./lettore-pec');
const CAMPAGNE = require('./campagne-invito');
const RITMI = require('./ritmi-invito');

function testo(v, max) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 200);
}
function indirizzoValido(e) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || ''));
}

/* GIA' SERVITA? Tre risposte diverse, e sceglierne una sbagliata vuol
   dire o un doppione o un'azienda saltata per sempre.

     - invio normale: si salta chi ha gia' ricevuto qualcosa. E' cio'
       che permette di riprendere un invio interrotto premendo di
       nuovo Invia;
     - rinvio a mano ("manda una seconda volta"): non si salta
       nessuno, e' esattamente quello che e' stato chiesto;
     - rinvio PROGRAMMATO: si salta chi ha gia' ricevuto DA QUESTA
       programmazione. Senza questa distinzione un rinvio programmato
       che si interrompe a meta' ricomincerebbe da capo al giro dopo,
       e le prime aziende dell'elenco riceverebbero il messaggio
       cinque volte. Il segno lo lascia l'invio stesso (invio.prog),
       quindi non serve tenere un segnalibro da nessuna parte: e'
       la scheda a ricordare, come per tutto il resto. */
function giaServita(a, forza, prog) {
    const invio = a && a.invio;
    if (!invio || !invio.quando) return false;
    if (!forza) return true;
    return !!(prog && String(invio.prog || '') === String(prog));
}

/* IL MESSAGGIO E' PARTITO E L'ESITO NON SI E' SCRITTO.
   Fra la consegna al server di posta e la riga che la registra sulla
   scheda passano dei millisecondi, ma sono i millisecondi in cui la
   funzione puo' morire: tempo scaduto, istanza spenta, rete caduta. La
   scheda resta com'era - "da invitare" - e la PEC e' partita lo stesso.

   Con una persona davanti il problema era piccolo: si vedeva
   l'interruzione e si decideva. Con un lavoro automatico che riprende
   ogni dieci minuti, di notte, quella scheda riceverebbe una seconda
   PEC. Una PEC si paga e non si richiama indietro.

   Percio' PRIMA di spedire si lascia un timbro, e lo si toglie subito
   dopo aver scritto l'esito. Un timbro che sopravvive vuol dire
   esattamente una cosa: qualcuno stava spedendo li' e non e' tornato.
   Allora:
     - se e' fresco, c'e' un invio in corso adesso (o e' appena morto):
       non si tocca, si riprova piu' tardi;
     - se e' vecchio, l'esito e' ignoto e NON si ritenta. La scheda va
       in "errore" con scritto perche', dove una persona la vede e
       decide. Una copia in meno e' meglio di una in piu', ed e' la
       stessa scelta gia' presa dal giro delle newsletter.

   Sulla PEC c'e' anche la seconda rete: il riferimento e' registrato
   prima dell'invio, quindi se il messaggio era davvero partito la
   ricevuta del gestore arriva e ritrova la scheda da sola. */
/* Quanto deve essere vecchio un timbro perche' lo si consideri di un
   invio morto e non di uno in corso. DEVE stare sopra il passo del lavoro
   automatico, con margine: erano dieci minuti esatti, cioe' proprio il
   passo del cron, e il giro successivo trovava il timbro sempre piu'
   giovane di dieci minuti. Risultato: quella scheda veniva rimandata a
   ogni passaggio e non finiva mai in "Con errore", cioe' non finiva mai
   sotto gli occhi di nessuno. */
const INCERTO_DOPO_MS = Math.max(
    25 * 60 * 1000,
    Math.round(2.5 * RITMI.passoCronMin() * 60 * 1000)
);

/* Spedisce l'invito alle schede indicate. Chi chiama decide QUALI
   (gli identificativi) e FINO A QUANDO (la scadenza): questo motore
   non sa niente ne' di tetti orari ne' di ritmi, e non deve saperlo -
   l'invio a mano e quello programmato si frenano in due modi diversi.

   opz:
     evento, campagna, canale, ids, mail {oggetto, html}
     forza      rispedire a chi ha gia' ricevuto
     prog       identificativo della programmazione, se l'invio e' automatico
     email      chi firma l'invio (finisce nei timbri delle schede)
     collab     il collaboratore reale, se c'e'
     pagina     la pagina di iscrizione dell'evento, che viaggia col codice
     scadenza   istante oltre il quale non si comincia un altro messaggio
     fuori      elenco dei disiscritti, gia' letto da chi chiama
     rispondiA  dove tornano le risposte all'email ordinaria
     esiti      se false non si raccoglie il dettaglio per scheda (il
                lavoro automatico non ne fa niente e su migliaia di
                schede sarebbe solo memoria sprecata)

   Restituisce i conti, gli esiti per scheda, l'eventuale blocco del
   server di posta e "trattate": quante schede hanno consumato un
   messaggio davvero (partite o fallite). E' quello il numero con cui
   si contano i tetti e i ritmi - le saltate non consumano niente. */
async function inviaSchede(db, opz) {
    opz = opz || {};
    const evento = String(opz.evento || '');
    const campagna = CAMPAGNE.normalizza(opz.campagna);
    const canale = String(opz.canale || 'email') === 'pec' ? 'pec' : 'email';
    const ids = Array.isArray(opz.ids) ? opz.ids : [];
    const mail = opz.mail || {};
    const oggetto = testo(mail.oggetto, 250);
    const html = String(mail.html || '');
    const forza = opz.forza === true;
    const prog = String(opz.prog || '');
    const email = String(opz.email || '');
    const collab = opz.collab || '';
    const fuori = opz.fuori || {};
    const scadenza = Number(opz.scadenza) || (Date.now() + 45000);
    const raccogliEsiti = opz.esiti !== false;
    const etichettaInvio = CAMPAGNE.etichetta(campagna, evento);

    const conti = {
        inviate: 0, saltate: 0, senzaRecapito: 0, disiscritte: 0, incerte: 0,
        /* rimandate: schede su cui qualcun altro sta lavorando adesso. Non
           sono ne' fatte ne' fallite: si torna.
           avanzabili: quante schede dalla testa dell'elenco sono DEFINITE,
           cioe' fin dove un segnalibro puo' spostarsi senza scavalcare una
           rimandata. -1 vuol dire "tutte quelle guardate". */
        rimandate: 0, avanzabili: -1,
        falliti: [], esiti: {}, bloccato: '', errore: '', trattate: 0, viste: 0, finite: true
    };
    if (!ids.length) return conti;

    const trans = CANALI.trasporto(canale);
    const pausa = CANALI.pausaFra(canale);
    let primo = true;
    try {
        for (const id of ids) {
            /* Il tempo finisce prima dell'elenco: si smette e si dice che
               non si e' arrivati in fondo. Le schede non toccate restano
               esattamente com'erano, quindi la ripresa non ha niente da
               riparare. */
            if (Date.now() > scadenza) { conti.finite = false; break; }
            conti.viste++;
            const rif = db.collection('aziendeInvito').doc(id);

            /* SI PRENDE LA SCHEDA IN UNA TRANSAZIONE, e non e' un
               irrigidimento gratuito: e' l'unica cosa che rende il timbro
               davvero escludente.

               Prima si leggeva la scheda, si facevano i controlli e solo
               decine di millisecondi dopo si scriveva il timbro. In quella
               finestra ci sta comodo un secondo chiamante - ed esiste
               davvero: l'area riservata lascia "Invia" premibile apposta
               mentre una programmazione va avanti, e il lavoro automatico
               parte a un orario noto ogni dieci minuti. Tutti e due
               leggevano una scheda ancora senza timbro, tutti e due
               passavano i controlli, e all'azienda arrivavano DUE PEC.
               Il lucchetto della programmazione non c'entra: esclude due
               giri fra loro, non un giro e una persona.

               Dentro la transazione si fa tutto quello che decide SE
               spedire, e si esce con un verdetto. Fuori restano solo le
               cose lente: il codice, l'invio, l'esito. */
            let verdetto;
            try {
                verdetto = await db.runTransaction(async tx => {
                    const snap = await tx.get(rif);
                    if (!snap.exists) return { cosa: 'saltata' };
                    const a = snap.data() || {};
                    if (String(a.evento || '') !== evento) return { cosa: 'saltata' };
                    if (CAMPAGNE.diScheda(a) !== campagna) return { cosa: 'saltata' };
                    if (a.stato === 'esclusa' || a.stato === 'disiscritta') return { cosa: 'saltata' };
                    if (giaServita(a, forza, prog)) return { cosa: 'saltata' };
                    /* Un tentativo rimasto appeso: vedi il commento su
                       INCERTO_DOPO_MS. Fresco vuol dire "ci sta lavorando
                       qualcun altro proprio adesso"; vecchio vuol dire "non si
                       sa com'e' finita". In nessuno dei due casi si spedisce,
                       ma sono due cose diverse e chi chiama deve poterle
                       distinguere: sulla prima si torna, sulla seconda no. */
                    const tent = Number(a.tentativo && a.tentativo.quando) || 0;
                    if (tent) {
                        if (Date.now() - tent < INCERTO_DOPO_MS) return { cosa: 'rimandata' };
                        const motivo = 'Esito ignoto: il servizio si e interrotto dopo aver consegnato il messaggio al server '
                            + 'di posta. Non e stato ritentato per non rischiare un doppione: se serve, rimandalo a mano.';
                        const errore = { quando: Date.now(), da: email, collab: collab, canale: canale, motivo: motivo, incerto: true };
                        tx.set(rif, { stato: 'errore', errore: errore, tentativo: null }, { merge: true });
                        return { cosa: 'incerta', errore: errore };
                    }
                    const dest = CANALI.destinatarioDi(canale, a);
                    if (!indirizzoValido(dest)) return { cosa: 'senza-recapito' };
                    if (fuori[dest.toLowerCase()]) {
                        tx.set(rif, { stato: 'disiscritta' }, { merge: true });
                        return { cosa: 'disiscritta' };
                    }
                    /* Il timbro, prima di spedire e nella stessa transazione
                       della lettura. Se piu' sotto si muore, e' l'unica cosa
                       che distingue "non e' mai partita" da "non si sa". */
                    const riferimento = CANALI.riferimentoNuovo(canale);
                    tx.set(rif, {
                        tentativo: { quando: Date.now(), da: email, canale: canale, prog: prog, riferimento: riferimento }
                    }, { merge: true });
                    return { cosa: 'presa', a: a, dest: dest, riferimento: riferimento };
                });
            } catch (e) {
                /* L'archivio non risponde. Non si spedisce alla cieca: senza
                   il timbro un'interruzione subito dopo produrrebbe proprio il
                   doppione che il timbro serve a evitare. Si smette qui e si
                   dice perche': la fetta non e' finita, quindi chi chiama
                   restituisce la quota e riprende al giro dopo. */
                conti.errore = 'Archivio non raggiungibile: ' + String((e && e.message) || e).slice(0, 160);
                conti.finite = false;
                break;
            }

            if (verdetto.cosa === 'saltata') { conti.saltate++; continue; }
            if (verdetto.cosa === 'senza-recapito') { conti.senzaRecapito++; continue; }
            if (verdetto.cosa === 'disiscritta') {
                if (raccogliEsiti) conti.esiti[id] = { stato: 'disiscritta' };
                conti.disiscritte++;
                continue;
            }
            if (verdetto.cosa === 'incerta') {
                if (raccogliEsiti) conti.esiti[id] = { stato: 'errore', errore: verdetto.errore };
                conti.incerte++;
                continue;
            }
            if (verdetto.cosa === 'rimandata') {
                /* Su questa si TORNA: qualcuno ci sta lavorando adesso, o e'
                   appena morto lasciandola a meta'. Va detto a chi chiama, che
                   altrimenti farebbe avanzare il proprio segnalibro anche su di
                   lei e non la riguarderebbe mai piu'. */
                conti.rimandate++;
                if (conti.avanzabili < 0) conti.avanzabili = conti.viste - 1;
                continue;
            }

            const a = verdetto.a;
            const dest = verdetto.dest;
            const riferimento = verdetto.riferimento;

            /* Il codice riservato all'azienda: si crea PRIMA di spedire e si
               scrive subito. Una scheda che ce l'ha gia' lo tiene - un
               secondo invito deve ripetere lo stesso, altrimenti il primo
               smette di valere senza che nessuno lo sappia. */
            let codice = String(a.codice || '');
            if (!codice) {
                try {
                    codice = await CODICI.assegna(db, {
                        scheda: id, evento: evento, campagna: campagna,
                        ragioneSociale: a.ragioneSociale,
                        pagina: testo(opz.pagina, 200)
                    });
                    await rif.set({ codice: codice }, { merge: true });
                    a.codice = codice;
                } catch (e) {
                    const motivo = 'Codice invito non assegnato: ' + String((e && e.message) || e).slice(0, 120);
                    const errore = { quando: Date.now(), da: email, collab: collab, canale: canale, motivo: motivo };
                    await rif.set({ stato: 'errore', errore: errore, tentativo: null }, { merge: true });
                    if (raccogliEsiti) conti.esiti[id] = { stato: 'errore', errore: errore };
                    conti.falliti.push({ id: id, indirizzo: dest, motivo: motivo });
                    conti.trattate++;
                    continue;
                }
            }

            if (!primo) await CANALI.aspetta(pausa);
            primo = false;
            try {
                if (canale === 'pec') {
                    await LETTORE.registraRiferimento(db, riferimento, { scheda: id, evento: evento, destinatario: dest });
                }
                const info = await trans.sendMail(CANALI.messaggio(canale, a, { oggetto: oggetto, html: html }, {
                    campagna: etichettaInvio, rispondiA: String(opz.rispondiA || email), riferimento: riferimento
                }));
                const invio = {
                    quando: Date.now(), da: email, collab: collab, canale: canale, destinatario: dest,
                    codice: codice,
                    riferimento: riferimento,
                    oggetto: CANALI.applica(oggetto, a).slice(0, 250),
                    messageId: String((info && info.messageId) || '').slice(0, 300),
                    risposta: String((info && info.response) || '').slice(0, 200)
                };
                /* Il timbro della programmazione che ha spedito. Serve solo al
                   rinvio programmato (vedi giaServita), ma si scrive sempre
                   quando c'e': cosi' sulla scheda si vede da dove e' partito
                   il messaggio, che e' la prima domanda quando qualcosa non
                   torna. */
                if (prog) invio.prog = prog;
                await rif.set({ stato: 'inviata', invio: invio, errore: null, tentativo: null }, { merge: true });
                if (raccogliEsiti) conti.esiti[id] = { stato: 'inviata', invio: invio, codice: codice };
                conti.inviate++;
                conti.trattate++;
            } catch (e) {
                const motivo = String((e && e.message) || 'errore del server di posta').slice(0, 200);
                const errore = { quando: Date.now(), da: email, collab: collab, canale: canale, motivo: motivo };
                await rif.set({ stato: 'errore', errore: errore, tentativo: null }, { merge: true });
                if (raccogliEsiti) conti.esiti[id] = { stato: 'errore', errore: errore };
                conti.falliti.push({ id: id, indirizzo: dest, motivo: motivo });
                conti.trattate++;
                if (CANALI.fermaTutto(e)) {
                    conti.bloccato = motivo;
                    conti.finite = false;
                    break;
                }
            }
        }
    } finally {
        try { trans.close(); } catch (_) { /* niente da chiudere */ }
    }
    // nessuna rimandata: tutto quello che si e' guardato e' definito
    if (conti.avanzabili < 0) conti.avanzabili = conti.viste;
    return conti;
}

module.exports = { inviaSchede, giaServita };
