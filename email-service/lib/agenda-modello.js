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
const { AREE_B2B, areaDa, nomeArea } = require('./temi-b2b');

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
/* Gli incontri vanno dalle 10 alle 18, mezz'ora ciascuno, con l'ora di
   pranzo fuori. Sono i valori di partenza: chi organizza li cambia
   dall'area riservata, e quello che vale e' sempre quello che ha scritto
   lui. */
const GIORNATA_PREDEFINITA = { inizio: '10:00', fine: '18:00', pranzoDa: '13:00', pranzoA: '14:00', durata: 30 };
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
/* Le aree SEMPRE tutte e undici, anche quelle che nessuno ha ancora
   toccato: chi apre la sezione deve vedere l'elenco intero e decidere,
   non indovinare quali mancano. */
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
            attiva: x.attiva === true,
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
            pagina: testo(ev.pagina, 200)
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
   LO STATO DI UN'AREA
========================================================= */
/* Gli slot di un'area con il loro stato. Tre stati e non due: LIBERO si
   prenota, OCCUPATO no, CHIUSO nemmeno - ma per un motivo diverso, che
   va detto (il referente e' sul palco, o al tavolo non c'e' nessuno). Chi
   guarda la pagina deve capire se ha perso il posto o se quel posto non
   c'e' mai stato. */
function slotDiArea(agenda, prenotazioni, areaId) {
    const cfg = (agenda.aree || {})[areaId] || areaVuota();
    const prese = (prenotazioni.aree || {})[areaId] || {};
    return slotDellaGiornata(agenda.giornata).map(s => {
        const p = prese[s.chiave];
        const chiuso = cfg.chiusi.indexOf(s.chiave) >= 0;
        return {
            ora: s.ora, fine: s.fine, chiave: s.chiave,
            stato: p ? 'occupato' : (chiuso ? 'chiuso' : 'libero'),
            chi: p || null
        };
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

/* I tavoli come li legge chi guarda: la configurazione e gli orari con
   dentro chi li occupa, gia' composti. Si risponde con QUESTO e non con i
   due archivi grezzi, perche' quali orari esistono dipende dalla durata e
   dalla pausa, e farlo due volte - qui e nel browser - vuol dire vederlo
   divergere il giorno in cui qualcuno cambia la durata. */
function areeComposte(agenda, prenotazioni) {
    return AREE_B2B.map(a => {
        const cfg = (agenda.aree || {})[a.id] || areaVuota();
        const slot = slotDiArea(agenda, prenotazioni, a.id);
        return {
            id: a.id, nome: a.nome, attiva: cfg.attiva, nota: cfg.nota,
            referenti: cfg.referenti, chiusi: cfg.chiusi, slot: slot,
            liberi: slot.filter(s => s.stato === 'libero').length,
            occupati: slot.filter(s => s.stato === 'occupato').length
        };
    });
}

module.exports = {
    AREE_B2B, areaDa, nomeArea, testo,
    oraValida, minutiOra, oraDaMinuti, chiaveSlot, oraDaChiave, fraseOrario,
    GIORNATA_PREDEFINITA, normalizzaGiornata, slotDellaGiornata,
    idEvento, rifAgenda, rifPrenotazioni,
    areaVuota, normalizzaReferente, normalizzaAree, normalizzaAgenda, leggiAgenda,
    normalizzaPrenotazioni, leggiPrenotazioni,
    slotDiArea, areeComposte, appuntamentoDi,
    orariPresi, chiDiSlot, bloccoSuPrenotazioni
};
