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
     3b. salta chi risulta GIA' ISCRITTO all'evento con l'indirizzo a
        cui si sta per scrivere, e segna la scheda "iscritta" (vedi
        iscrittaAllEvento): l'invito a chi si e' gia' iscritto e' il
        doppione che gli iscritti di un altro evento non devono ricevere;
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
const VERIFICATA = require('./iscrizione-verificata');

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
/* IL SECONDO INVIO (soloNonIscritte): parte di nuovo, identico, solo a chi
   l'invito l'ha GIA' ricevuto e da allora non si e' fatto vivo. La regola di
   "si e' fatta viva" e' quella di lib/aziende-invito.js (haRisposto) e
   dell'area riservata: ha risposto alla PEC, ha chiesto di essere
   contattata, o si e' iscritta col codice. Si ricontrolla QUI, sulla scheda
   riletta nella transazione, e non solo nella selezione dell'area
   riservata: fra la scelta e l'invio - su un secondo invio programmato,
   giorni - un'azienda si puo' iscrivere, e il sollecito non le deve
   arrivare. Restano fuori anche, come nella scheda "Inviate" dell'area
   riservata (vistaDi):
     - chi il secondo invio l'ha GIA' avuto (`secondoInvio`, scritto qui
       sotto a ogni secondo invio riuscito): riprendere un invio fermato dal
       tetto orario, o ripremere il pulsante, non deve mandare una terza
       PEC a chi e' gia' stato sollecitato;
     - chi non e' (piu') "inviata": in errore, con l'esito ignoto, rimessa
       da invitare;
     - chi ha la PEC non arrivata: a un indirizzo che respinge non si
       rispedisce una PEC che si paga;
     - chi era stata invitata su un ALTRO canale: il secondo invio ripete il
       primo, e una PEC a chi era stata scritta un'email (o un'email a una
       casella PEC, che spesso la rifiuta) non e' ripeterlo. */
const PEC_KO = ['non-consegnata', 'non-accettata', 'in-dubbio'];
function fattaViva(a) {
    if (!a) return false;
    if (a.contatto && a.contatto.quando) return true;
    if (a.ricevute && a.ricevute.risposta && a.ricevute.risposta.quando) return true;
    return a.stato === 'risposta' || a.stato === 'iscritta';
}
function fuoriDalSecondoInvio(a, canale) {
    if (!(a && a.invio && a.invio.quando) || fattaViva(a)) return true;
    if (a.secondoInvio && a.secondoInvio.quando) return true;
    if (a.stato !== 'inviata') return true;
    if (a.invio.canale === 'pec' && PEC_KO.indexOf(String((a.ricevute && a.ricevute.esito) || '')) >= 0) return true;
    return !!(canale && a.invio.canale && a.invio.canale !== canale);
}

function giaServita(a, forza, prog) {
    const invio = a && a.invio;
    if (!invio || !invio.quando) return false;
    if (!forza) return true;
    return !!(prog && String(invio.prog || '') === String(prog));
}

/* GIA' ISCRITTA ALL'EVENTO A CUI LA STIAMO INVITANDO.
   Chi e' gia' iscritto non si invita: e' la regola di quando si invitano
   gli iscritti di un altro evento (gli iscritti di Milano al webinar), e
   l'area riservata la applica gia' quando prepara l'elenco
   (righeDaIscritti in app.js). Ma fra l'elenco e l'invio passano ore o
   giorni - un invio programmato per il fine settimana - e nel frattempo
   la persona si puo' iscrivere da sola, dalla PEC arrivata alla sua
   azienda o dal collegamento di un collega. Percio' si ricontrolla qui,
   scheda per scheda, sull'indirizzo a cui si sta per scrivere.

   Quale iscrizione e' "di questo evento": per gli eventi con le
   iscrizioni verificate (Milano, webinar) la riconosce la loro `se`;
   per gli altri la pagina dell'evento, che l'area riservata manda con
   l'invio (`pagina`, la stessa che viaggia col codice). Senza ne' l'una
   ne' l'altra non si controlla niente: meglio un invito in piu' che
   indovinare l'evento. Contano le iscrizioni attive, anche quelle che
   aspettano ancora la conferma dell'email (la persona si e' iscritta);
   non contano quelle annullate e quelle cancellate dall'area riservata.

   La ricerca si fa PRIMA della transazione che prende la scheda (vedi
   inviaSchede): dentro, fra la lettura e il timbro, non ci deve essere
   nessuna attesa. `leggi` e' la funzione di lettura, cosi' chi chiama
   decide come leggere. */
function iscrizioneDellEvento(evento, pagina) {
    const ev = VERIFICATA.EVENTI.find(e => e.chiave === evento);
    if (ev) return p => ev.se.test(String(p || '').trim());
    const base = String(pagina || '').trim().toLowerCase();
    if (!base) return null;
    return p => String(p || '').trim().toLowerCase().indexOf(base) === 0;
}
async function iscrittaAllEvento(db, leggi, evento, dellEvento, indirizzo) {
    const em = String(indirizzo || '').trim().toLowerCase();
    if (!dellEvento || !indirizzoValido(em)) return null;
    const snap = await leggi(db.collection('iscrizioni').where('email', '==', em).limit(50));
    for (const d of snap.docs) {
        const x = d.data() || {};
        if (!dellEvento(x.pagina) || !VERIFICATA.attiva(x)) continue;
        if (await VERIFICATA.cancellata(db, { chiave: evento }, x, leggi)) continue;
        return { id: d.id, nome: ((x.nome || '') + ' ' + (x.cognome || '')).trim() };
    }
    return null;
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
     soloNonIscritte  il secondo invio: solo a chi ha gia' ricevuto e non si
                e' fatto vivo (fuoriDalSecondoInvio), con forza
     prog       identificativo della programmazione, se l'invio e' automatico
     email      chi firma l'invio (finisce nei timbri delle schede)
     collab     il collaboratore reale, se c'e'
     pagina     la pagina di iscrizione dell'evento, che viaggia col codice;
                serve anche a riconoscere chi e' gia' iscritto agli eventi
                che non hanno le iscrizioni verificate
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
    const soloNonIscritte = opz.soloNonIscritte === true;
    /* IL REINVIO A SCELTA (soloSenzaRisposta): chi organizza seleziona le
       aziende gia' invitate e rimanda, sul canale che vuole e quante volte
       vuole. Va con `forza`; qui si aggiunge il solo controllo che non si
       puo' fare prima: chi nel frattempo ha risposto o si e' iscritta si
       salta, scheda per scheda. */
    const soloSenzaRisposta = opz.soloSenzaRisposta === true;
    const prog = String(opz.prog || '');
    const email = String(opz.email || '');
    const collab = opz.collab || '';
    const fuori = opz.fuori || {};
    const scadenza = Number(opz.scadenza) || (Date.now() + 45000);
    const raccogliEsiti = opz.esiti !== false;
    const etichettaInvio = CAMPAGNE.etichetta(campagna, evento);
    // come si riconosce un'iscrizione a questo evento (null: non si controlla)
    const dellEvento = iscrizioneDellEvento(evento, opz.pagina);

    const conti = {
        /* giaIscritte: saltate perche' l'indirizzo risulta gia' iscritto
           all'evento. Sono contate ANCHE fra le saltate, cosi' i totali di
           chi somma solo quelle (il giro programmato, la barra della
           finestra) continuano a tornare. */
        inviate: 0, saltate: 0, senzaRecapito: 0, disiscritte: 0, incerte: 0, giaIscritte: 0,
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

            /* GIA' ISCRITTA? Si guarda PRIMA della transazione, con una
               lettura semplice della scheda e la ricerca dell'indirizzo fra le
               iscrizioni: dentro, fra la lettura della scheda e il timbro, non
               deve esserci nessuna attesa, perche' e' proprio li' che un
               secondo chiamante passerebbe (vedi il commento sulla
               transazione, qui sotto). La transazione usa questo esito solo
               se il recapito e' rimasto lo stesso. Chi non partirebbe
               comunque (gia' servita, esclusa, di un'altra lista) non costa
               la ricerca. Se la lettura non riesce si va avanti: l'elenco e'
               gia' stato ripulito quando e' stato preparato, questo e' il
               secondo controllo. */
            let giaIscritta = null;
            if (dellEvento) {
                try {
                    const pre = await rif.get();
                    const p = pre.exists ? (pre.data() || {}) : null;
                    if (p && String(p.evento || '') === evento && CAMPAGNE.diScheda(p) === campagna
                        && p.stato !== 'esclusa' && p.stato !== 'disiscritta' && !giaServita(p, forza, prog)) {
                        const ind = String(CANALI.destinatarioDi(canale, p) || '').toLowerCase();
                        const trovata = await iscrittaAllEvento(db, r => r.get(), evento, dellEvento, ind);
                        if (trovata) giaIscritta = Object.assign({ indirizzo: ind }, trovata);
                    }
                } catch (_) { giaIscritta = null; }
            }

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
                    if (soloNonIscritte && fuoriDalSecondoInvio(a, canale)) return { cosa: 'saltata' };
                    if (soloSenzaRisposta && fattaViva(a)) return { cosa: 'saltata' };
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
                        /* Il canale del tentativo rimasto appeso, non quello di questo
                           giro: e' da li' che il messaggio puo' essere partito (lo legge
                           lib/promemoria-seconda-persona.js, invitataPerPec). */
                        const errore = { quando: Date.now(), da: email, collab: collab, canale: String((a.tentativo && a.tentativo.canale) || canale), motivo: motivo, incerto: true };
                        tx.set(rif, { stato: 'errore', errore: errore, tentativo: null }, { merge: true });
                        return { cosa: 'incerta', errore: errore };
                    }
                    const dest = CANALI.destinatarioDi(canale, a);
                    if (!indirizzoValido(dest)) return { cosa: 'senza-recapito' };
                    if (fuori[dest.toLowerCase()]) {
                        tx.set(rif, { stato: 'disiscritta' }, { merge: true });
                        return { cosa: 'disiscritta' };
                    }
                    /* Gia' iscritta all'evento con questo indirizzo (lo ha visto
                       la lettura qui sopra, fuori dalla transazione): niente
                       invito, e la scheda lo dice ("iscritta", con chi), come
                       quando ci si iscrive con il codice. Vale solo se
                       l'indirizzo e' ancora quello letto allora: se nel
                       frattempo la scheda e' passata a un altro recapito,
                       quello non e' stato cercato, e la scheda non si salta
                       per l'iscrizione di un indirizzo che non e' piu' il suo. */
                    const iscr = (giaIscritta && giaIscritta.indirizzo === dest.toLowerCase()) ? giaIscritta : null;
                    if (iscr) {
                        const iscritti = Array.isArray(a.iscritti) ? a.iscritti.slice(0, 50) : [];
                        if (!iscritti.some(x => x && x.iscrizione === iscr.id)) {
                            iscritti.push({ quando: Date.now(), nome: iscr.nome.slice(0, 200), email: dest.toLowerCase(), iscrizione: iscr.id });
                        }
                        tx.set(rif, {
                            stato: 'iscritta', iscritti: iscritti,
                            giaIscritta: { quando: Date.now(), iscrizione: iscr.id, da: email }
                        }, { merge: true });
                        return { cosa: 'gia-iscritta' };
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
            if (verdetto.cosa === 'gia-iscritta') {
                if (raccogliEsiti) conti.esiti[id] = { stato: 'iscritta' };
                conti.saltate++;
                conti.giaIscritte++;
                continue;
            }
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
            /* Una scheda spostata su un indirizzo nuovo (Modifica) puo' aver
               perso il campo `codice` ma avere ancora quello spedito con il
               primo invito: il secondo deve ripetere quello. */
            if (!codice && a.invio && a.invio.codice) {
                codice = String(a.invio.codice);
                try { await rif.set({ codice: codice }, { merge: true }); } catch (_) { /* resta sull'invio */ }
                /* e il codice deve ritrovare questa scheda: se punta ancora a
                   quella vecchia, che non c'e' piu', chi si iscrive con il
                   codice del sollecito finirebbe nel vuoto */
                try {
                    const rc = db.collection('codiciInvito').doc(CODICI.normalizza(codice));
                    const sc = await rc.get();
                    const punta = sc.exists ? String((sc.data() || {}).scheda || '') : '';
                    if (punta && punta !== id && !(await db.collection('aziendeInvito').doc(punta).get()).exists) {
                        await rc.set({ scheda: id }, { merge: true });
                    }
                } catch (_) { /* il codice resta valido; l'iscrizione lo riconosce lo stesso */ }
            }
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
                const scrivi = { stato: 'inviata', invio: invio, errore: null, tentativo: null };
                /* Il segno del secondo invio, a parte e non dentro `invio`: una
                   scrittura con merge fonderebbe il campo dentro l'invio dopo e
                   se lo porterebbe dietro. E' cio' che lo rende una volta sola
                   (fuoriDalSecondoInvio). */
                if (soloNonIscritte) scrivi.secondoInvio = { quando: invio.quando, canale: canale, prog: prog || '' };
                // il reinvio a scelta a chi l'aveva gia' ricevuto: resta segnata come sollecitata
                else if (soloSenzaRisposta && a.invio && a.invio.quando) scrivi.secondoInvio = { quando: invio.quando, canale: canale, prog: prog || '', aScelta: true };
                await rif.set(scrivi, { merge: true });
                if (raccogliEsiti) conti.esiti[id] = { stato: 'inviata', invio: invio, codice: codice, secondoInvio: scrivi.secondoInvio || null };
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

module.exports = { inviaSchede, giaServita, fuoriDalSecondoInvio };
