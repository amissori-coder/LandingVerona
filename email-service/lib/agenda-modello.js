/* ============================================================
   IL MODELLO DELL'AGENDA B2B - documenti, orari, stato dei tavoli
   ------------------------------------------------------------
   Sta staccato da `agenda-b2b.js` perche' qui dentro non si manda
   niente a nessuno: si legge com'e' fatta la giornata, quali orari
   esistono e chi ha preso cosa. Non tira dentro ne' la posta ne'
   il PDF, e cosi' lo puo' usare anche chi ha bisogno solo di
   SAPERE - per esempio il programma della giornata, che prima di
   salvarsi deve controllare se manda sul palco qualcuno che in
   quell'ora ha gia' un incontro prenotato.

   Due documenti per evento, e non uno, perche' si scrivono in
   momenti diversi e da mani diverse:
     - `b2bAgenda/{evento}`      la configurazione (chi organizza)
     - `b2bPrenotazioni/{evento}` chi ha preso cosa (gli ospiti)
   Chi configura non deve poter sovrascrivere una prenotazione
   presa un attimo prima.
   ============================================================ */
'use strict';
const { AREE_B2B, areaDa, nomeArea, gemelliDi, capofilaDi, areaInterna, famiglieB2B } = require('./temi-b2b');

function testo(v, max) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 200);
}

/* =========================================================
   LE ORE
   ------------------------------------------------------------
   Un'ora e' sempre "HH:MM" e uno slot viaggia con la sua CHIAVE
   ("1030"): la chiave e' il nome di un campo dentro una mappa di
   Firestore, e li' i due punti sono un carattere da evitare.
========================================================= */
const RE_ORA = /^([01]\d|2[0-3]):[0-5]\d$/;
function oraValida(v) { return RE_ORA.test(String(v || '')); }
function minutiOra(v) {
    if (!oraValida(v)) return -1;
    const p = String(v).split(':');
    return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
}
function oraDaMinuti(n) {
    const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(n)));
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}
function chiaveSlot(ora) { return oraValida(ora) ? String(ora).replace(':', '') : ''; }
function oraDaChiave(k) {
    const s = String(k || '').replace(/[^0-9]/g, '');
    if (s.length !== 4) return '';
    const v = s.slice(0, 2) + ':' + s.slice(2);
    return oraValida(v) ? v : '';
}
/* La frase con cui un orario viaggia OVUNQUE - mail, foglio del desk,
   scheda: e' la stessa forma che lib/orari-b2b.js sa rileggere, e deve
   restare tale, altrimenti il foglio stamperebbe l'ora in fondo invece
   che nella colonna dell'ora. */
function fraseOrario(inizio, fine) { return 'dalle ' + inizio + ' alle ' + fine; }

/* =========================================================
   LA GIORNATA E I SUOI SLOT
========================================================= */
/* Gli incontri vanno dalle 10 alle 17, mezz'ora ciascuno, con l'ora di
   pranzo fuori: e' la giornata del convegno - i lavori in sala finiscono
   alle 17 e il buffet e' fra le 13:30 e le 14:30 - ed e' il punto da cui
   conviene partire, perche' un tavolo aperto quando in sala non c'e' piu'
   nessuno e' un orario che nessuno prenota. Sono i valori di PARTENZA: chi
   organizza li cambia dall'area riservata, e quello che vale e' sempre
   quello che ha scritto lui (un'agenda gia' salvata ha la sua giornata
   scritta dentro, e questi valori non la toccano). */
/* La giornata degli incontri quando nessuno l'ha ancora scritta: le stesse
   ore del convegno, perche' gli incontri corrono accanto ai lavori in sala e
   finiscono quando finiscono quelli. Chi organizza la cambia dalla finestra
   "La giornata", e da quel momento vale quello che ha scritto lui. */
const GIORNATA_PREDEFINITA = { inizio: '10:00', fine: '17:30', pranzoDa: '13:30', pranzoA: '14:30', durata: 30 };
const MAX_SLOT = 48;          // tetto di sicurezza: una giornata non ne ha di piu'
const DURATA_MIN = 10, DURATA_MAX = 240;

function normalizzaGiornata(v) {
    const g = (v && typeof v === 'object') ? v : {};
    const inizio = oraValida(g.inizio) ? g.inizio : GIORNATA_PREDEFINITA.inizio;
    const fine = oraValida(g.fine) ? g.fine : GIORNATA_PREDEFINITA.fine;
    let durata = parseInt(g.durata, 10);
    if (!(durata >= DURATA_MIN && durata <= DURATA_MAX)) durata = GIORNATA_PREDEFINITA.durata;
    /* La pausa e' facoltativa: vale solo se ci sono TUTTE E DUE le ore e la
       seconda viene dopo la prima. Una pausa a meta' - "da mezzogiorno a
       niente" - toglierebbe slot senza che nessuno sappia perche'. */
    let pranzoDa = oraValida(g.pranzoDa) ? g.pranzoDa : '';
    let pranzoA = oraValida(g.pranzoA) ? g.pranzoA : '';
    if (!pranzoDa || !pranzoA || minutiOra(pranzoA) <= minutiOra(pranzoDa)) { pranzoDa = ''; pranzoA = ''; }
    // una giornata che finisce prima di cominciare non e' una giornata
    if (minutiOra(fine) <= minutiOra(inizio)) {
        return Object.assign({}, GIORNATA_PREDEFINITA, { durata: durata });
    }
    return { inizio: inizio, fine: fine, pranzoDa: pranzoDa, pranzoA: pranzoA, durata: durata };
}

/* Gli slot della giornata, in fila. Uno slot che si sovrappone anche solo
   in parte alla pausa pranzo non c'e': meglio un buco di venti minuti che
   un ospite convocato mentre la sala mangia. */
function slotDellaGiornata(giornata) {
    const g = normalizzaGiornata(giornata);
    const da = minutiOra(g.inizio), a = minutiOra(g.fine);
    const pDa = g.pranzoDa ? minutiOra(g.pranzoDa) : -1;
    const pA = g.pranzoA ? minutiOra(g.pranzoA) : -1;
    const fuori = [];
    for (let t = da; t + g.durata <= a && fuori.length < MAX_SLOT; t += g.durata) {
        const fine = t + g.durata;
        if (pDa >= 0 && t < pA && pDa < fine) continue;   // cade nella pausa
        const ora = oraDaMinuti(t);
        fuori.push({ ora: ora, fine: oraDaMinuti(fine), chiave: chiaveSlot(ora) });
    }
    return fuori;
}

/* =========================================================
   I DOCUMENTI
========================================================= */
// l'identificativo dell'evento arriva dall'area riservata ("napoli-2026-10-02"):
// nel nome di un documento non ci vanno barre ne' punti
function idEvento(evento) {
    return String(evento == null ? '' : evento).trim()
        .replace(/[\/\\.#$\[\]]/g, '-').slice(0, 120);
}
function rifAgenda(db, evento) { return db.collection('b2bAgenda').doc(idEvento(evento)); }
function rifPrenotazioni(db, evento) { return db.collection('b2bPrenotazioni').doc(idEvento(evento)); }

/* Un referente del tavolo: e' una persona dell'elenco iscritti (aderente
   Revilaw, oppure sponsor o relatore), ridotta a cio' che serve dire
   all'ospite e a chi prepara il desk. Si tiene anche `doc`, cosi' domani
   si puo' risalire alla scheda; il nome pero' resta scritto qui, perche'
   il foglio del desk deve poterlo stampare senza rileggere altro. */
function normalizzaReferente(v) {
    const r = (v && typeof v === 'object') ? v : {};
    const nome = testo(r.nome, 120);
    if (!nome) return null;
    const sezione = testo(r.sezione, 20);
    return {
        doc: testo(r.doc, 400), id: testo(r.id, 300), nome: nome,
        ruolo: testo(r.ruolo, 160), azienda: testo(r.azienda, 160),
        email: testo(r.email, 200).toLowerCase(),
        sezione: (['aderenti', 'sponsor'].indexOf(sezione) >= 0) ? sezione : ''
    };
}
function areaVuota() { return { attiva: false, referenti: [], chiusi: [], nota: '' }; }
/* Le aree SEMPRE tutte, anche quelle che nessuno ha ancora toccato: chi
   apre la sezione deve vedere l'elenco intero e decidere, non indovinare
   quali mancano. */
function normalizzaAree(v, giornata) {
    const dentro = (v && typeof v === 'object') ? v : {};
    const validi = slotDellaGiornata(giornata).map(s => s.chiave);
    const fuori = {};
    AREE_B2B.forEach(a => {
        const x = (dentro[a.id] && typeof dentro[a.id] === 'object') ? dentro[a.id] : {};
        const referenti = (Array.isArray(x.referenti) ? x.referenti : [])
            .map(normalizzaReferente).filter(Boolean).slice(0, 6);
        /* Gli slot chiusi si tengono solo se sono slot VERI di questa
           giornata: cambiando la durata o l'orario, una chiusura vecchia
           chiuderebbe un orario che non esiste piu' e toglierebbe posti
           senza che si veda dove. */
        const chiusi = (Array.isArray(x.chiusi) ? x.chiusi : [])
            .map(k => chiaveSlot(oraDaChiave(k)))
            .filter(k => k && validi.indexOf(k) >= 0);
        fuori[a.id] = {
            /* I tavoli INTERNI nascono ACCESI. Gli altri no, perche' un tavolo
               del convegno esiste solo se qualcuno lo tiene, e accenderlo da
               soli vorrebbe dire proporre alle imprese un incontro che non
               abbiamo mai deciso di fare. Il desk Revilaw e' l'opposto: e'
               nostro, sta li' tutta la giornata, non lo si propone a nessuno
               e chi organizza ci porta le cose a mano. Chiederne
               l'accensione sarebbe un passaggio in piu' per un tavolo che
               c'e' comunque - e finche' non si nota, le esigenze da portare
               al desk non si possono assegnare. Spegnerlo resta possibile:
               una volta toccato vale quello che c'e' scritto. */
            attiva: (x.attiva === undefined && a.interno) ? true : x.attiva === true,
            referenti: referenti,
            chiusi: Array.from(new Set(chiusi)).sort(),
            nota: testo(x.nota, 300)
        };
    });
    return fuori;
}
function normalizzaAgenda(v, evento) {
    const d = (v && typeof v === 'object') ? v : {};
    const giornata = normalizzaGiornata(d.giornata);
    const ev = (d.eventoDati && typeof d.eventoDati === 'object') ? d.eventoDati : {};
    return {
        evento: idEvento(evento || d.evento),
        eventoDati: {
            titolo: testo(ev.titolo, 120), quando: testo(ev.quando, 120),
            luogo: testo(ev.luogo, 200), indirizzo: testo(ev.indirizzo, 200),
            pagina: testo(ev.pagina, 200),
            /* ENTRO QUANDO SI PRENOTA. Gli abbinamenti li chiudiamo prima del
               convegno - le seconde e le terze preferenze si assegnano solo
               con quello che avanza, e per farlo bisogna sapere quando
               smettere di aspettare. La data si dichiara con il resto dei
               dati dell'evento (area-riservata/app.js, EVENTI_DEF): scritta a
               mano in ogni mail, prima o poi due mail ne direbbero due
               diverse. Vuota vuol dire "non la diciamo", non "non c'e'": i
               testi che la nominano si tolgono da soli. */
            scadenzaB2B: testo(ev.scadenzaB2B, 60)
        },
        giornata: giornata,
        aree: normalizzaAree(d.aree, giornata),
        aggiornato: (d.aggiornato && typeof d.aggiornato === 'object') ? d.aggiornato : null
    };
}
async function leggiAgenda(db, evento) {
    const snap = await rifAgenda(db, evento).get();
    return normalizzaAgenda(snap.exists ? snap.data() : null, evento);
}

function normalizzaPrenotazioni(v, evento) {
    const d = (v && typeof v === 'object') ? v : {};
    const aree = {};
    const dentro = (d.aree && typeof d.aree === 'object') ? d.aree : {};
    Object.keys(dentro).forEach(id => {
        if (!areaDa(id)) return;                      // area che non conosciamo: si scarta
        const slot = (dentro[id] && typeof dentro[id] === 'object') ? dentro[id] : {};
        const pulito = {};
        Object.keys(slot).forEach(k => { if (oraDaChiave(k) && slot[k]) pulito[k] = slot[k]; });
        aree[id] = pulito;
    });
    return {
        evento: idEvento(evento || d.evento),
        aree: aree,
        richieste: Array.isArray(d.richieste) ? d.richieste.filter(x => x && typeof x === 'object') : []
    };
}
async function leggiPrenotazioni(db, evento) {
    const snap = await rifPrenotazioni(db, evento).get();
    return normalizzaPrenotazioni(snap.exists ? snap.data() : null, evento);
}

/* =========================================================
   CHI TIENE IL TAVOLO E' SUL PALCO
   ------------------------------------------------------------
   Una persona sola non puo' stare in due posti: se la scaletta la
   manda sul palco alle 10:40, alle 10:40 il suo tavolo non e'
   prenotabile. Finora lo si diceva soltanto - un avviso giallo
   nell'area riservata, "chiudi quegli orari prima che qualcuno li
   prenoti" - e fra l'avviso e la mano di chi organizza c'era una
   finestra in cui un'impresa poteva prenotare un incontro che non
   sarebbe mai potuto avvenire. Ora quegli orari si chiudono DA
   SOLI: si ricavano dalla scaletta ogni volta che l'agenda si
   legge, e valgono anche dentro la transazione che prende lo slot.

   IL MARGINE. Fra il palco e il tavolo c'e' la sala da
   attraversare, le domande di chi ti ferma, il microfono da
   restituire. Un incontro che comincia nel minuto esatto in cui
   finisce la tavola rotonda e' un incontro che comincia in
   ritardo, e l'impresa che aspetta al tavolo non sa perche'.
   Quindi la fascia del palco si allarga di DIECI MINUTI prima e
   dopo: sono orari che si perdono, ed e' il prezzo di non far
   aspettare nessuno.

   Chi organizza puo' sempre chiudere altri orari a mano (`chiusi`)
   e puo' sempre assegnare d'ufficio un orario chiuso (`forzato`):
   e' una decisione, e le decisioni restano sue. Quello che non
   puo' piu' succedere e' che un orario cosi' resti LIBERO per
   distrazione.
========================================================= */
const MARGINE_PALCO = 10;

/* Due schede sono la stessa persona se hanno lo stesso indirizzo: il nome
   si scrive in dieci modi, e qui un confronto sbagliato vuol dire o un
   tavolo chiuso per niente o - peggio - un orario lasciato aperto a chi in
   quel momento e' sul palco. Senza indirizzo si ripiega sul nome ridotto
   all'osso. E' la stessa chiave di area-riservata/programma-giornata.js:
   le due devono dire la stessa cosa sulle stesse persone. */
function chiavePersona(p) {
    if (!p) return '';
    const mail = String(p.email || '').trim().toLowerCase();
    if (mail) return 'm:' + mail;
    const nome = String(p.nome || '').trim().toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
    return nome ? 'n:' + nome : '';
}
// chi sale sul palco in una voce della scaletta: chi modera e chi siede al tavolo
function personeDiVoce(v) {
    const fuori = [];
    if (v && v.moderatore && v.moderatore.nome) fuori.push(v.moderatore);
    ((v && v.partecipanti) || []).forEach(p => { if (p && p.nome) fuori.push(p); });
    return fuori;
}
/* Gli orari di QUESTO tavolo che cadono mentre uno dei suoi referenti e'
   sul palco: mappa chiave -> perche'. Il perche' si tiene per intero
   (chi, quale voce, da che ora a che ora) perche' un orario chiuso senza
   motivo scritto e' un orario che qualcuno riaprira'.
   Senza scaletta - o senza referenti - non si chiude niente: non sapere
   dove sono le persone non e' una ragione per togliere posti. */
function chiusureDaPalco(giornata, voci, referenti, margine) {
    const fuori = {};
    const chiavi = (referenti || []).map(chiavePersona).filter(Boolean);
    if (!chiavi.length || !(voci || []).length) return fuori;
    const m = (typeof margine === 'number' && margine >= 0) ? margine : MARGINE_PALCO;
    const slot = slotDellaGiornata(giornata);
    (voci || []).forEach(v => {
        const da = minutiOra(v && v.dalle), a = minutiOra(v && v.alle);
        // una voce senza due ore buone non colloca nessuno: indovinarlo
        // vorrebbe dire chiudere tavoli per un orario che non esiste
        if (da < 0 || a <= da) return;
        personeDiVoce(v).forEach(p => {
            const k = chiavePersona(p);
            if (!k || chiavi.indexOf(k) < 0) return;
            const dentro = da - m, fino = a + m;
            slot.forEach(s => {
                const sda = minutiOra(s.ora), sa = minutiOra(s.fine);
                if (!(dentro < sa && sda < fino)) return;   // non si toccano
                // il primo impegno che copre l'orario e' quello che si
                // racconta: due voci sullo stesso slot vogliono dire
                // comunque tavolo chiuso
                if (fuori[s.chiave]) return;
                fuori[s.chiave] = {
                    chi: String(p.nome || ''), voce: testo(v.titolo, 200),
                    dalle: String(v.dalle || ''), alle: String(v.alle || ''), margine: m
                };
            });
        });
    });
    return fuori;
}

/* =========================================================
   LO STATO DI UN'AREA
========================================================= */
/* Gli slot di un'area con il loro stato. Tre stati e non due: LIBERO si
   prenota, OCCUPATO no, CHIUSO nemmeno - ma per un motivo diverso, che
   va detto (il referente e' sul palco, o al tavolo non c'e' nessuno). Chi
   guarda la pagina deve capire se ha perso il posto o se quel posto non
   c'e' mai stato.
   `voci` e' la scaletta dell'evento, quando chi chiama ce l'ha: da li'
   escono gli orari chiusi dal palco. Senza, il tavolo si legge come
   prima - chiuso e' solo cio' che ha chiuso una mano. */
function slotDiArea(agenda, prenotazioni, areaId, voci) {
    const cfg = (agenda.aree || {})[areaId] || areaVuota();
    const prese = (prenotazioni.aree || {})[areaId] || {};
    const palco = chiusureDaPalco(agenda.giornata, voci, cfg.referenti);
    return slotDellaGiornata(agenda.giornata).map(s => {
        const p = prese[s.chiave];
        const aMano = cfg.chiusi.indexOf(s.chiave) >= 0;
        const sulPalco = palco[s.chiave] || null;
        return {
            ora: s.ora, fine: s.fine, chiave: s.chiave,
            stato: p ? 'occupato' : ((aMano || sulPalco) ? 'chiuso' : 'libero'),
            /* Perche' e' chiuso, e non solo che lo e': "sul palco" non si
               riapre premendoci sopra - si sposta la scaletta - mentre
               quello chiuso a mano si', ed e' la prima cosa che chiede chi
               guarda la griglia. */
            motivo: p ? '' : (sulPalco ? 'palco' : (aMano ? 'mano' : '')),
            palco: sulPalco,
            chi: p || null
        };
    });
}
/* =========================================================
   GLI ORARI DI UNA FAMIGLIA DI TAVOLI
   ---------------------------------------------------------
   Due tavoli gemelli, per l'azienda, sono un tavolo solo con il
   doppio dei posti: alle 10:00 ci si puo' sedere in due, uno per
   referente. Qui le due griglie si fondono in una, orario per
   orario, e resta scritto QUANTI posti restano e su quale tavolo
   vero finirebbe chi prenota adesso.

   Le regole della fusione, in ordine:
     - se in quell'ora un tavolo della famiglia e' gia' NOSTRO, la
       casella e' nostra: un'azienda non prenota due volte la stessa
       ora, e vedersela libera la inviterebbe a farlo;
     - se ce n'e' almeno uno libero, la casella e' libera (e `posti`
       dice se sono uno o due);
     - se sono tutti presi, e' occupata; se non ce n'e' nessuno
       disponibile per altri motivi, e' chiusa. Occupato e chiuso
       restano due cose diverse: la prima e' "qualcuno e' arrivato
       prima", la seconda e' "quel posto non c'e' mai stato".
   I tavoli SPENTI non entrano nella fusione: se sono spenti tutti e
   due si guarda comunque il capofila, cosi' un incontro gia' fissato
   non sparisce dalla pagina di chi lo ha.
========================================================= */
function slotDiFamiglia(agenda, prenotazioni, capofila, voci, aziendaId) {
    const capo = capofilaDi(capofila) || String(capofila || '');
    const tutti = gemelliDi(capo);
    const accesi = tutti.filter(id => (((agenda.aree || {})[id]) || {}).attiva === true);
    const lista = accesi.length ? accesi : [capo];
    const griglie = lista.map(id => ({ id: id, slot: slotDiArea(agenda, prenotazioni, id, voci) }));
    const az = String(aziendaId || '');
    return slotDellaGiornata(agenda.giornata).map((s, i) => {
        const celle = griglie.map(g => ({ area: g.id, cella: g.slot[i] })).filter(x => x.cella);
        const mia = celle.filter(x => x.cella.chi && az && String(x.cella.chi.aziendaId || '') === az)[0] || null;
        const liberi = celle.filter(x => x.cella.stato === 'libero');
        const occupati = celle.filter(x => x.cella.stato === 'occupato');
        const scelto = mia || liberi[0] || occupati[0] || celle[0] || null;
        return {
            ora: s.ora, fine: s.fine, chiave: s.chiave,
            stato: mia ? 'mio' : (liberi.length ? 'libero' : (occupati.length ? 'occupato' : 'chiuso')),
            // quanti posti restano a quell'ora: con i gemelli possono essere due
            posti: liberi.length,
            // su quale tavolo VERO finirebbe chi prenota adesso (o dove sta il nostro)
            area: scelto ? scelto.area : capo,
            chi: mia ? mia.cella.chi : null
        };
    });
}
/* I tavoli di una famiglia su cui si puo' davvero prenotare quell'ora, in
   ordine: il capofila per primo. Lo usa la transazione che prende lo slot,
   che dentro sceglie il primo ancora libero. */
function gemelliPrenotabili(agenda, capofila, chiave, voci) {
    return gemelliDi(capofilaDi(capofila) || String(capofila || '')).filter(id => {
        const cfg = (agenda.aree || {})[id] || areaVuota();
        if (!cfg.attiva) return false;
        if (cfg.chiusi.indexOf(chiave) >= 0) return false;
        if (voci && chiusureDaPalco(agenda.giornata, voci, cfg.referenti)[chiave]) return false;
        return true;
    });
}

/* =========================================================
   UN ORARIO PRENOTATO NON SI TOCCA
   ---------------------------------------------------------
   Dall'altra parte di ogni prenotazione c'e' un'impresa che ha in mano
   un foglio con quell'ora, quel tavolo e quel nome sopra. Chiudere
   quell'orario, spegnere quel tavolo o cambiare la durata della giornata
   lo farebbe sparire dall'agenda SENZA che nessuno se ne accorga: la
   prenotazione resterebbe scritta, ma non comparirebbe piu' da nessuna
   parte, e il giorno del convegno si presenterebbe qualcuno che noi non
   aspettiamo piu'.
   Quindi il servizio rifiuta la modifica e dice quale. Non e' un doppione
   del controllo del browser: il browser non fa nemmeno premere quegli
   orari, ma fra quando ha disegnato la griglia e quando qualcuno preme
   possono essere passati dieci minuti, e in quei dieci minuti qualcuno ha
   prenotato. Qui si decide sull'ultima versione dei dati, non su quella
   che aveva in mano chi guardava.

   Si blocca il CAMBIAMENTO, non lo stato: un orario prenotato che era
   gia' chiuso (succede quando si assegna un posto d'ufficio con
   `forzato`) resta chiuso, altrimenti quel tavolo non si potrebbe piu'
   salvare nemmeno per cambiargli la nota.
========================================================= */
function orariPresi(prenotazioni, areaId) {
    const prese = (prenotazioni.aree || {})[areaId] || {};
    return Object.keys(prese).filter(k => prese[k]);
}
function chiDiSlot(prenotazioni, areaId, chiave) {
    const p = ((prenotazioni.aree || {})[areaId] || {})[chiave] || {};
    return testo(p.nome, 120) + (p.azienda ? ' (' + testo(p.azienda, 120) + ')' : '');
}
function bloccoSuPrenotazioni(corrente, giornataNuova, areeNuove, prenotazioni) {
    const guai = [];
    const valideOra = slotDellaGiornata(corrente.giornata).map(s => s.chiave);
    const valideDopo = slotDellaGiornata(giornataNuova).map(s => s.chiave);
    const cambiaGiornata = valideOra.join(',') !== valideDopo.join(',');
    AREE_B2B.forEach(a => {
        const prese = orariPresi(prenotazioni, a.id);
        if (!prese.length) return;
        const prima = corrente.aree[a.id] || areaVuota();
        const dopo = areeNuove[a.id];
        prese.forEach(k => {
            /* La giornata cambia forma: un orario prenotato che c'era e che
               dopo non ci sarebbe piu' e' una prenotazione buttata via. */
            if (cambiaGiornata && valideOra.indexOf(k) >= 0 && valideDopo.indexOf(k) < 0) {
                guai.push('le ' + oraDaChiave(k) + ' al tavolo ' + nomeArea(a.id)
                    + ' (' + chiDiSlot(prenotazioni, a.id, k) + ')');
                return;
            }
            if (!dopo) return;      // di questo tavolo non si sta cambiando niente
            if (dopo.chiusi.indexOf(k) >= 0 && prima.chiusi.indexOf(k) < 0) {
                guai.push('le ' + oraDaChiave(k) + ' al tavolo ' + nomeArea(a.id)
                    + ' (' + chiDiSlot(prenotazioni, a.id, k) + ')');
            }
        });
        if (dopo && prima.attiva && !dopo.attiva) {
            guai.push('il tavolo ' + nomeArea(a.id) + ', che ha ' + prese.length
                + (prese.length === 1 ? ' prenotazione' : ' prenotazioni'));
        }
    });
    if (!guai.length) return null;
    const unici = Array.from(new Set(guai));
    return 'Non posso: c\'e\' gia\' una prenotazione su ' + unici.slice(0, 6).join('; ')
        + (unici.length > 6 ? ' e altri ' + (unici.length - 6) : '')
        + '. Chi ha prenotato ha in mano il foglio con quell\'ora sopra: prima libera la prenotazione '
        + '(la crocetta sull\'orario, nella giornata), poi rifai la modifica.';
}

// l'appuntamento di una persona in QUESTO evento, dovunque sia: si prenota
// un solo slot, quindi il primo che si trova e' il suo
function appuntamentoDi(prenotazioni, idDoc) {
    const doc = String(idDoc || '');
    if (!doc) return null;
    const aree = prenotazioni.aree || {};
    const nomi = Object.keys(aree);
    for (let i = 0; i < nomi.length; i++) {
        const areaId = nomi[i];
        const chiavi = Object.keys(aree[areaId] || {});
        for (let k = 0; k < chiavi.length; k++) {
            const p = aree[areaId][chiavi[k]];
            if (p && String(p.doc || '') === doc) {
                return { area: areaId, chiave: chiavi[k], ora: oraDaChiave(chiavi[k]), dati: p };
            }
        }
    }
    return null;
}

/* =========================================================
   IL DOCUMENTO DELLE PRENOTAZIONI SI SCRIVE DA UN POSTO SOLO
   ------------------------------------------------------------
   `b2bPrenotazioni/{evento}` si riscrive INTERO a ogni operazione
   (prendere uno slot, liberarlo, registrare una richiesta,
   segnarla gestita): un `set` senza merge, quattro volte, in
   quattro punti diversi di agenda-b2b.js. Finche' i campi erano
   tre andava bene; al primo campo nuovo ricopiato in tre punti su
   quattro, quel campo sparisce alla prima operazione successiva -
   e sparisce senza errore, che e' il modo peggiore.
   Quindi l'oggetto da scrivere lo compone QUESTA funzione, e i
   quattro punti passano tutti da qui. Un campo nuovo si aggiunge
   in due posti (il normalizzatore che legge e questo che scrive)
   invece che in cinque.
========================================================= */
function corpoPrenotazioni(corrente, cambi) {
    const c = (corrente && typeof corrente === 'object') ? corrente : {};
    const x = (cambi && typeof cambi === 'object') ? cambi : {};
    return {
        evento: idEvento(x.evento || c.evento),
        aree: (x.aree && typeof x.aree === 'object') ? x.aree : (c.aree || {}),
        richieste: Array.isArray(x.richieste) ? x.richieste : (c.richieste || []),
        aggiornato: (x.aggiornato && typeof x.aggiornato === 'object')
            ? x.aggiornato : (c.aggiornato || null)
    };
}

/* =========================================================
   QUALE POSTO SI LIBERA QUANDO SE NE PRENDE UN ALTRO
   ------------------------------------------------------------
   Finche' un'impresa aveva un incontro solo, la regola era
   semplice: "il posto di prima e' quello dove c'e' scritto il suo
   documento", e `appuntamentoDi` tornava il primo che trovava.
   Con le tre preferenze un'azienda puo' avere DUE incontri (la
   prima piu' una seconda che lo staff le ha assegnato): il primo
   che si trova non e' piu' quello giusto, e assegnare la seconda
   cancellerebbe la prima senza che nessuno se ne accorga finche'
   l'impresa non si presenta al tavolo.
   La regola, dichiarata:
     1. se chi chiama dice DA QUALE slot si parte (lo spostamento),
        si libera quello e nient'altro;
     2. se no, e la persona porta una chiave d'azienda, si libera
        il solo slot della STESSA azienda con la STESSA preferenza;
     3. se no - cioe' tutto quello che e' stato prenotato prima
        che le aziende esistessero - si ripiega sul documento
        della persona, che e' il comportamento di sempre.
========================================================= */
function slotDi(prenotazioni, area, chiave) {
    const p = ((prenotazioni.aree || {})[area] || {})[chiave];
    return p ? { area: area, chiave: chiave, ora: oraDaChiave(chiave), dati: p } : null;
}
function appuntamentoDaLiberare(prenotazioni, persona, slotDa) {
    const p = persona || {};
    if (slotDa && slotDa.area && slotDa.chiave) return slotDi(prenotazioni, slotDa.area, slotDa.chiave);
    const azienda = String(p.aziendaId || '');
    if (azienda) {
        const scelta = Number(p.scelta) || 1;
        const aree = prenotazioni.aree || {};
        const nomi = Object.keys(aree);
        for (let i = 0; i < nomi.length; i++) {
            const chiavi = Object.keys(aree[nomi[i]] || {});
            for (let k = 0; k < chiavi.length; k++) {
                const q = aree[nomi[i]][chiavi[k]];
                if (q && String(q.aziendaId || '') === azienda && (Number(q.scelta) || 1) === scelta) {
                    return { area: nomi[i], chiave: chiavi[k], ora: oraDaChiave(chiavi[k]), dati: q };
                }
            }
        }
        return null;
    }
    return appuntamentoDi(prenotazioni, p.doc);
}
/* L'appuntamento di un'AZIENDA, dovunque sia: tutti i suoi incontri, in
   ordine di orario. Non e' uno solo, come per la persona: la prima
   preferenza piu' le seconde/terze che lo staff ha assegnato. */
function appuntamentiAzienda(prenotazioni, aziendaId) {
    const az = String(aziendaId || '');
    if (!az) return [];
    const fuori = [];
    const aree = prenotazioni.aree || {};
    Object.keys(aree).forEach(area => {
        Object.keys(aree[area] || {}).forEach(k => {
            const q = aree[area][k];
            if (q && String(q.aziendaId || '') === az) {
                fuori.push({ area: area, chiave: k, ora: oraDaChiave(k), dati: q });
            }
        });
    });
    return fuori.sort((a, b) => minutiOra(a.ora) - minutiOra(b.ora));
}

/* I tavoli come li legge chi guarda: la configurazione e gli orari con
   dentro chi li occupa, gia' composti. Si risponde con QUESTO e non con i
   due archivi grezzi, perche' quali orari esistono dipende dalla durata e
   dalla pausa, e farlo due volte - qui e nel browser - vuol dire vederlo
   divergere il giorno in cui qualcuno cambia la durata. */
function areeComposte(agenda, prenotazioni, voci) {
    return AREE_B2B.map(a => {
        const cfg = (agenda.aree || {})[a.id] || areaVuota();
        const slot = slotDiArea(agenda, prenotazioni, a.id, voci);
        return {
            id: a.id, nome: a.nome, attiva: cfg.attiva, nota: cfg.nota,
            referenti: cfg.referenti, chiusi: cfg.chiusi, slot: slot,
            liberi: slot.filter(s => s.stato === 'libero').length,
            occupati: slot.filter(s => s.stato === 'occupato').length
        };
    });
}


/* =========================================================
   IL DOCUMENTO DELL'AZIENDA (b2bAziende/{evento}--{aziendaId})
   ------------------------------------------------------------
   Gli incontri B2B sono dell'IMPRESA, non della persona: un
   invito per azienda, un collegamento per azienda, una prima
   preferenza per azienda. Qui dentro sta cio' che l'impresa ha
   detto e che negli slot non puo' stare:
     - i REFERENTI a cui l'invito e' arrivato (congelati
       all'invio: la mail li nomina, e il modulo offre solo loro
       come nominativi);
     - la CODA, cioe' la seconda e la terza preferenza: non sono
       prenotazioni - non impegnano nessun orario - e vivono
       finche' lo staff non le assegna;
     - le ALTRE ESIGENZE, il testo libero con il nominativo.

   PERCHE' UN DOCUMENTO A PARTE e non un campo dentro
   `b2bPrenotazioni`: li' ogni operazione riscrive il documento
   intero e la lettura scarta cio' che non conosce, quindi la coda
   sparirebbe alla prima prenotazione; e `bloccoSuPrenotazioni`,
   che guarda la mappa degli slot per rifiutare una modifica su un
   orario gia' preso, comincerebbe a rifiutare la configurazione di
   tavoli in realta' liberi.
   PERCHE' UNO PER AZIENDA e non uno per evento: nei giorni
   dell'invito scrivono in cento, e un documento solo mette in coda
   ogni transazione dietro le altre.

   `rev` cresce di uno a ogni scrittura ed e' la guardia fra due
   referenti della stessa impresa che compilano insieme: chi salva
   con una revisione vecchia si sente dire che un collega ha
   appena cambiato le scelte, invece di cancellargliele.
========================================================= */
const MAX_REFERENTI = 8;
/* Una riga sola di "altre esigenze": e' una domanda in piu', non una
   quarta scelta. Con cinque righe diventava un elenco di desideri da
   leggere a mano la sera prima, e le preferenze restano tre. */
const MAX_ESIGENZE = 1;
/* La PREFERENZA di un appuntamento e' 1, 2 o 3. Un'altra esigenza portata a
   un tavolo non e' nessuna delle tre - non l'ha scelta l'impresa fra i temi,
   l'abbiamo spostata noi - e ha il suo numero: serve perche' "il posto della
   stessa azienda con la stessa preferenza" e' la regola con cui si decide
   quale incontro si sposta. Senza un numero suo, portare un'esigenza al desk
   cancellerebbe la seconda preferenza gia' assegnata a quell'impresa. */
const SCELTA_ESIGENZA = 4;
const TESTO_ESIGENZA = 600;

function rifAziende(db) { return db.collection('b2bAziende'); }
function nomeDocAzienda(evento, aziendaId) {
    return idEvento(evento) + '--' + String(aziendaId || '').replace(/[^a-zA-Z0-9_-]/g, '');
}
function rifAzienda(db, evento, aziendaId) {
    return rifAziende(db).doc(nomeDocAzienda(evento, aziendaId));
}
function normalizzaReferenteAzienda(v) {
    const r = (v && typeof v === 'object') ? v : {};
    const nome = testo(r.nome, 160);
    const email = testo(r.email, 200).toLowerCase();
    if (!nome && !email) return null;
    return {
        doc: testo(r.doc, 400), nome: nome, ruolo: testo(r.ruolo, 160),
        email: email, telefono: testo(r.telefono, 60)
    };
}
/* Una voce della coda: la seconda o la terza preferenza. `stato` dice a che
   punto e': in attesa che lo staff guardi, assegnata (e allora ha un orario
   vero, e il modulo non la puo' piu' toccare), oppure scartata. */
function normalizzaVoceCoda(v) {
    const x = (v && typeof v === 'object') ? v : {};
    const pos = (Number(x.pos) === 3) ? 3 : 2;
    const area = areaDa(x.area);
    if (!area) return null;
    const stato = ['attesa', 'assegnata', 'scartata'].indexOf(testo(x.stato, 20)) >= 0 ? testo(x.stato, 20) : 'attesa';
    const ass = (x.assegnato && typeof x.assegnato === 'object') ? x.assegnato : null;
    return {
        id: testo(x.id, 60) || ('c' + pos),
        pos: pos, area: area.id,
        perChi: testo(x.perChi, 160), perRuolo: testo(x.perRuolo, 160), perDoc: testo(x.perDoc, 400),
        quando: Number(x.quando) || 0,
        stato: stato,
        assegnato: (stato === 'assegnata' && ass) ? {
            area: testo(ass.area, 60), chiave: chiaveSlot(oraDaChiave(ass.chiave)),
            ora: oraDaChiave(ass.chiave) || testo(ass.ora, 5), fine: testo(ass.fine, 5),
            quando: Number(ass.quando) || 0, da: testo(ass.da, 200)
        } : null
    };
}
function normalizzaEsigenza(v) {
    const x = (v && typeof v === 'object') ? v : {};
    const t = testo(x.testo, TESTO_ESIGENZA);
    if (!t) return null;
    return {
        id: testo(x.id, 60),
        perChi: testo(x.perChi, 160), perRuolo: testo(x.perRuolo, 160), perDoc: testo(x.perDoc, 400),
        testo: t, quando: Number(x.quando) || 0,
        /* Tre stati: aperta (da guardare), gestita (l'abbiamo vista e
           risolta a voce), assegnata (l'abbiamo portata a un tavolo, e
           adesso e' un incontro con un'ora sopra). */
        stato: ['gestita', 'assegnata'].indexOf(testo(x.stato, 20)) >= 0 ? testo(x.stato, 20) : 'aperta'
    };
}
function aziendaVuota(evento, aziendaId) {
    return {
        evento: idEvento(evento), id: String(aziendaId || ''), nome: '', chiave: '', piva: '',
        aree: [], referenti: [], invito: null, coda: [], esigenze: [],
        rev: 0, aggiornato: null, esiste: false
    };
}
function normalizzaAziendaB2B(v, evento, aziendaId) {
    const d = (v && typeof v === 'object') ? v : null;
    if (!d) return aziendaVuota(evento, aziendaId);
    const aree = (Array.isArray(d.aree) ? d.aree : [])
        .map(x => (areaDa(x) || {}).id).filter(Boolean);
    /* Una sola voce per posizione: se ne arrivano due con lo stesso numero
       vale l'ultima, altrimenti la coda crescerebbe a ogni salvataggio. */
    const perPos = {};
    (Array.isArray(d.coda) ? d.coda : []).map(normalizzaVoceCoda).filter(Boolean)
        .forEach(c => { perPos[c.pos] = c; });
    const inv = (d.invito && typeof d.invito === 'object') ? d.invito : null;
    return {
        evento: idEvento(evento || d.evento),
        id: String(d.id || aziendaId || ''),
        nome: testo(d.nome, 200), chiave: testo(d.chiave, 200), piva: testo(d.piva, 20),
        aree: Array.from(new Set(aree)),
        referenti: (Array.isArray(d.referenti) ? d.referenti : [])
            .map(normalizzaReferenteAzienda).filter(Boolean).slice(0, MAX_REFERENTI),
        invito: inv ? {
            quando: Number(inv.quando) || 0, da: testo(inv.da, 200),
            collab: testo(inv.collab, 200), revocato: inv.revocato === true
        } : null,
        coda: [2, 3].map(n => perPos[n]).filter(Boolean),
        esigenze: (Array.isArray(d.esigenze) ? d.esigenze : [])
            .map(normalizzaEsigenza).filter(Boolean).slice(0, MAX_ESIGENZE),
        rev: Number(d.rev) || 0,
        aggiornato: (d.aggiornato && typeof d.aggiornato === 'object') ? d.aggiornato : null,
        esiste: true
    };
}
async function leggiAzienda(db, evento, aziendaId) {
    const snap = await rifAzienda(db, evento, aziendaId).get();
    return normalizzaAziendaB2B(snap.exists ? snap.data() : null, evento, aziendaId);
}
/* Tutte le aziende di un evento. Si legge la collezione intera e si filtra
   in JavaScript, senza `where`: il Firestore finto delle prove risponde
   vuoto a qualunque query, e una prova verde su un servizio che non trova
   niente e' peggio di nessuna prova. Le aziende di un evento sono cento, non
   centomila: la lettura intera costa poco e si fa una volta per schermata. */
async function leggiAziendeB2B(db, evento) {
    const ev = idEvento(evento);
    const snap = await rifAziende(db).get();
    const fuori = [];
    (snap && snap.docs ? snap.docs : []).forEach(d => {
        const dati = typeof d.data === 'function' ? d.data() : null;
        if (!dati || idEvento(dati.evento) !== ev) return;
        fuori.push(normalizzaAziendaB2B(dati, ev, dati.id));
    });
    return fuori.sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
}

/* =========================================================
   LE REGOLE DELLA PRENOTAZIONE, SCRITTE UNA VOLTA SOLA
   ------------------------------------------------------------
   Le stesse frasi vanno nella mail d'invito, nel modulo online e
   nella mail di conferma. Scritte tre volte, al primo ritocco
   diventano tre regole diverse - e la piu' vecchia e' quella che
   l'impresa ha letto quando ha deciso.
========================================================= */
/* =========================================================
   QUELLO CHE E' "ASSEGNATO" LO DICONO LE PRENOTAZIONI
   ---------------------------------------------------------
   Una preferenza in coda e un'altra esigenza diventano "assegnata"
   quando gli si da' un orario. L'orario pero' vive in un altro
   documento (b2bPrenotazioni) e si puo' annullare da li': se
   l'annullamento non torna indietro a riaprirle, quelle restano
   assegnate per sempre. Il riepilogo allora non le mostra piu' fra
   quelle da assegnare - sono "fatte" - e il modulo dell'azienda
   continua a dire "questo incontro e' gia' fissato". Due schermi che
   raccontano due cose diverse, e nessuno dei due quella vera.
   Chi annulla adesso le riapre (vedi agenda-b2b.js), ma quello che e'
   gia' rimasto indietro va letto per quello che e': qui lo stato
   scritto si confronta con le prenotazioni vere, e se l'incontro non
   c'e' piu' la voce torna in attesa. Una riga di verita' che non
   dipende dall'essere passati dal punto giusto.
========================================================= */
function codaViva(azienda, prenotazioni) {
    const nostri = appuntamentiAzienda(prenotazioni, (azienda || {}).id);
    return ((azienda || {}).coda || []).map(c => {
        if (c.stato !== 'assegnata') return c;
        const a = c.assegnato || {};
        const vivo = a.area && a.chiave
            && nostri.some(x => x.area === a.area && x.chiave === a.chiave);
        return vivo ? c : Object.assign({}, c, { stato: 'attesa', assegnato: null });
    });
}
/* Le esigenze, con lo stesso metro. Qui pero' non si sa QUALE incontro sia
   nato da quale esigenza - non c'e' un identificativo che le leghi - quindi
   si contano: se gli incontri nati da un'esigenza sono meno delle esigenze
   segnate assegnate, quelle in piu' tornano aperte. */
function esigenzeVive(azienda, prenotazioni) {
    const nostri = appuntamentiAzienda(prenotazioni, (azienda || {}).id);
    let coperte = nostri.filter(x => (Number(x.dati.scelta) || 1) === SCELTA_ESIGENZA).length;
    return ((azienda || {}).esigenze || []).map(e => {
        if (e.stato !== 'assegnata') return e;
        if (coperte > 0) { coperte--; return e; }
        return Object.assign({}, e, { stato: 'aperta' });
    });
}

function regoleB2B(giornata, scadenza) {
    const g = normalizzaGiornata(giornata);
    const entro = testo(scadenza, 60);
    return [
        'Un invito per azienda: indichi il nominativo di chi partecipa a ciascun incontro, '
        + 'e può essere una persona diversa da un tavolo all\'altro.',
        'La prima preferenza prenota davvero: sceglie il tavolo e l\'orario, e da quel momento quell\'orario è Suo. '
        + 'Gli orari che vede liberi sono quelli liberi adesso: appena un\'impresa ne prende uno, a tutti gli altri sparisce.',
        /* LA SECONDA E LA TERZA NON SONO PRENOTAZIONI, e va detto per intero:
           non sono un orario che aspetta conferma, sono una preferenza che
           diventera' un incontro solo se dopo le prime preferenze di tutti
           avanza un posto a quel tavolo - e l'ora la sceglieremo noi fra
           quelle rimaste, che puo' essere lontana da quella del primo
           incontro. Detto a meta', chi legge si aspetta "il suo orario, da
           confermare", e il giorno del convegno si presenta a un'ora che non
           gli abbiamo mai dato. */
        'La seconda e la terza sono solo il tavolo, e non prenotano niente: diventano un incontro solo se a quel '
        + 'tavolo avanzano posti dopo le prime preferenze di tutti, e l\'orario lo scegliamo noi fra quelli rimasti - '
        + 'anche lontano da quello del primo incontro. Glielo diciamo per mail: finché non arriva, a Suo nome non '
        + 'c\'è nessun orario.',
        'Se l\'orario che Le assegniamo non Le va bene può annullarlo da questa pagina: torna libero per un\'altra '
        + 'impresa, e la Sua preferenza resta in lista per un orario diverso.',
        'Ogni incontro dura ' + g.durata + ' minuti, fra le ' + g.inizio + ' e le ' + g.fine
        + (g.pranzoDa ? ', esclusa la pausa pranzo (' + g.pranzoDa + '-' + g.pranzoA + ')' : '') + '.',
        'Può cambiare tutto da questa pagina ' + (entro ? 'entro il ' + entro : 'fino al giorno del convegno')
        + ': a ogni modifica riceve una mail nuova con il foglio aggiornato, e vale sempre l\'ultimo emesso.'
        + (entro ? ' Dopo il ' + entro + ' chiudiamo gli abbinamenti e assegniamo gli orari rimasti.' : '')
    ];
}


module.exports = {
    AREE_B2B, areaDa, nomeArea, testo,
    oraValida, minutiOra, oraDaMinuti, chiaveSlot, oraDaChiave, fraseOrario,
    GIORNATA_PREDEFINITA, normalizzaGiornata, slotDellaGiornata,
    MARGINE_PALCO, chiavePersona, personeDiVoce, chiusureDaPalco,
    idEvento, rifAgenda, rifPrenotazioni,
    areaVuota, normalizzaReferente, normalizzaAree, normalizzaAgenda, leggiAgenda,
    normalizzaPrenotazioni, leggiPrenotazioni,
    slotDiArea, slotDiFamiglia, gemelliPrenotabili, areeComposte, appuntamentoDi,
    gemelliDi, capofilaDi, areaInterna, famiglieB2B, SCELTA_ESIGENZA,
    corpoPrenotazioni, appuntamentoDaLiberare, appuntamentiAzienda, slotDi,
    MAX_REFERENTI, MAX_ESIGENZE, TESTO_ESIGENZA,
    rifAziende, nomeDocAzienda, rifAzienda, aziendaVuota, normalizzaAziendaB2B,
    leggiAzienda, leggiAziendeB2B, regoleB2B, codaViva, esigenzeVive,
    orariPresi, chiDiSlot, bloccoSuPrenotazioni
};
