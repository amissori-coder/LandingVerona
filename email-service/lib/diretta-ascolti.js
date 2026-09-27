/* ============================================================
   Diretta degli eventi: gli ascolti (chi ha guardato, e quando)
   ------------------------------------------------------------
   Due parti:

   1. LA FOTOGRAFIA DI OGNI MINUTO (fotografa, chiamata dal cron
      api/diretta-ascolti.js ogni minuto). Per ogni evento "in finestra"
      (vedi eventiInFinestra) si contano le persone collegate adesso: le
      presenze con un segnale negli ultimi 150 secondi, la stessa regola
      dei «collegati» della regia (FINESTRA_CONNESSI_MS in
      diretta-dati.js). Il numero, lo stato della diretta in quel minuto
      e chi c'era finiscono in UN documento per evento, ascolti/{idEvento}:
        idEvento, aggiornato (Timestamp), versione: 1
        primoMinuto, ultimoMinuto   minuti dall'epoca (Math.floor(ms / 60000))
        curva     STRINGA JSON [[minuto, collegati, codice], ...] in ordine;
                  codice: 'o' in onda, 'p' pausa, 'a' programmato (attesa),
                  't' terminato
        persone   STRINGA JSON { uid: [[inizio, fine], ...] }: i tratti in
                  cui ogni persona era collegata, in minuti, estremi inclusi
        personeFerme  (solo se serve) vedi LIMITE_PERSONE
      Stringhe e non liste o mappe di Firestore: ogni voce di una mappa e'
      una voce d'indice, e mille persone ne farebbero migliaia a ogni
      scrittura. Una stringa e' un campo solo. Con mille persone e una
      giornata intera il documento sta sui 120 KB, sui 240 KB se tutti
      cadono e rientrano una decina di volte (lo misura
      diretta/prove/ascolti.prova.js): sotto i 300 KB.

      Il costo: per ogni evento in finestra, ogni minuto, una lettura per
      ogni persona collegata (la query delle presenze, solo il campo uid;
      almeno una) piu' la lettura e la scrittura di ascolti/{id}; in piu',
      una volta per giro, le due query su `eventi`. Con un evento e mille
      collegati: 1003 letture e una scrittura al minuto. Senza eventi in
      finestra: solo le due query su `eventi` (una lettura ciascuna, piu'
      una per ogni evento futuro che restituiscono) e basta.

      I minuti che il cron salta NON si inventano: nella curva restano
      assenti (la pagina li collega se il buco e' di 3 minuti al massimo,
      altrimenti interrompe la linea). Per le persone vale la stessa
      soglia: chi c'era nella fotografia di prima e c'e' in questa, con
      al massimo 3 minuti di distanza, continua lo stesso tratto; se no
      ne comincia uno nuovo.

   2. IL CALCOLO PER LA GESTIONE (ascolti, l'azione 'ascolti' di
      api/diretta-gestione.js). Mette insieme la registrazione, le
      presenze (i minuti degli attestati), gli accessi e i partecipanti
      nel risultato che la scheda «Ascolti» mostra (il formato e' un
      contratto con la pagina: vedi `risultato`). Il calcolo legge tutte
      le presenze, gli accessi e i partecipanti dell'evento (qualche
      migliaio di letture con mille persone): per questo il risultato si
      tiene in ascoltiCache/{idEvento} per 60 secondi (a evento in corso o
      appena finito) o 10 minuti (altrimenti), e chi riapre la scheda
      nel frattempo costa una lettura sola.

   Nessun dato personale nei log: solo identificativi degli eventi e
   numeri. ascolti e ascoltiCache li legge e li scrive SOLO il server
   (le regole di Firestore li chiudono ai browser).
   ============================================================ */
'use strict';
const zlib = require('zlib');
const C = require('./diretta-comune');
const D = require('./diretta-dati');

const MINUTO = 60 * 1000;
// lo stesso valore di FINESTRA_CONNESSI_MS in diretta-dati.js: «collegato» vuol dire la stessa cosa in regia e qui
const FINESTRA_CONNESSI_MS = 150 * 1000;
// la finestra delle fotografie: due ore prima dell'inizio, due ore dopo la fine...
const PRIMA_MS = 120 * MINUTO;
const DOPO_MS = 120 * MINUTO;
// ...ma a diretta chiusa ('terminato') bastano 60 minuti dopo la fine
const DOPO_TERMINATO_MS = 60 * MINUTO;
// minuti saltati dal cron oltre i quali i tratti delle persone si interrompono
const BUCO_MAX_MINUTI = 3;
const CODICI = { in_onda: 'o', pausa: 'p', programmato: 'a', terminato: 't' };
/* Oltre questa misura la stringa delle persone non si aggiorna piu'
   (personeFerme: true) e la curva va avanti: meglio la curva completa
   che nessuna scrittura (Firestore rifiuta i documenti sopra 1 MiB). Con
   mille persone e una giornata normale si sta sui 100-250 KB: e' una
   rete di sicurezza per i casi anomali (collegamenti che cadono di
   continuo per ore). */
const LIMITE_PERSONE = 700 * 1024;
// la cache del calcolo per la gestione
const CACHE_BREVE_MS = 60 * 1000;
const CACHE_LUNGA_MS = 10 * MINUTO;
const CACHE_DOPO_FINE_MS = 3 * 60 * MINUTO;
const MAX_CACHE = 900 * 1024;
// il minimo "in onda" non guarda l'avvio e la chiusura della giornata
const MINUTI_BORDO = 5;
const LARGHEZZA_CALO = 5;
const QUANTI_CALI = 3;
const LARGHEZZA_FASCIA = 5;

const NOTA = 'Spettatori di un minuto: le persone con la pagina della diretta aperta che hanno mandato il segnale '
    + 'negli ultimi 2 minuti e mezzo (una fotografia al minuto). Picco, minimo e media contano solo i minuti in onda '
    + '(pause escluse; il minimo non guarda i primi e gli ultimi 5 minuti in onda). I minuti per persona sono quelli '
    + 'degli attestati, limitati alla durata dell\'evento. «Vedi come un partecipante» non conta. Orari in ora italiana.';
const NOTA_FERME = ' Da un certo punto le linee del tempo delle persone non sono piu\' state registrate (troppi dati): la curva si\'.';

// come controllaUid in diretta-dati.js
const RE_UID = /^[A-Za-z0-9_-]{1,128}$/;

const unDecimale = x => Math.round(x * 10) / 10;

/* ============================================================
   1. LA FOTOGRAFIA
   ============================================================ */

/* Un evento e' "in finestra" (si fotografa) se e' in onda o in pausa,
   comunque siano gli orari (una diretta che sfora resta registrata),
   oppure se adesso sta fra due ore prima dell'inizio e due ore dopo la
   fine: si vede chi arriva in anticipo e chi resta dopo. Una diretta
   chiusa ('terminato') si guarda fino a 60 minuti dopo la fine: chi ha
   ancora la pagina aperta dopo un'ora non dice piu' niente. */
function inFinestra(ev, adesso) {
    const stato = ev && ev.stato;
    if (stato === 'in_onda' || stato === 'pausa') return true;
    const inizio = D.ms(ev && ev.inizio);
    const fine = D.ms(ev && ev.fine);
    if (inizio == null || fine == null) return false;
    if (stato === 'terminato' && adesso > fine + DOPO_TERMINATO_MS) return false;
    return adesso >= inizio - PRIMA_MS && adesso <= fine + DOPO_MS;
}

/* Gli eventi da fotografare adesso: [{ id, stato, inizio, fine }].
   Due query piccole invece di leggere tutti gli eventi (che crescono con
   gli anni, e si leggerebbero 1440 volte al giorno): quelli che finiscono
   da due ore fa in poi (indice automatico su `fine`, come il cron delle
   code) e quelli in onda o in pausa (una diretta dimenticata accesa,
   anche con la fine passata). Senza eventi in finestra la fotografia
   finisce qui: nessun'altra lettura. */
async function eventiInFinestra(ctx, adesso) {
    const eventi = ctx.db.collection('eventi');
    const [recenti, accesi] = await Promise.all([
        eventi.where('fine', '>=', ctx.Timestamp.fromMillis(adesso - DOPO_MS)).get(),
        eventi.where('stato', 'in', ['in_onda', 'pausa']).get()
    ]);
    const perId = new Map();
    recenti.docs.concat(accesi.docs).forEach(d => perId.set(d.id, d.data()));
    const out = [];
    perId.forEach((dati, id) => {
        // l'identificativo serve anche a ricavare l'uid dal nome del documento di presenza
        if (!D.RE_ID_EVENTO.test(id) || !inFinestra(dati, adesso)) return;
        out.push({ id: id, stato: dati.stato || 'programmato', inizio: D.ms(dati.inizio), fine: D.ms(dati.fine) });
    });
    return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/* Lo stato registrato, dal documento ascolti/{id} (o null se non c'e').
   Un documento guasto (JSON non leggibile) fa fallire la fotografia di
   quell'evento invece di essere riscritto da capo: meglio un buco nei
   dati che perdere la giornata. */
function leggiRegistrazione(d) {
    if (!d) return null;
    return {
        primoMinuto: Number(d.primoMinuto), ultimoMinuto: Number(d.ultimoMinuto),
        curva: JSON.parse(d.curva || '[]'), persone: JSON.parse(d.persone || '{}'),
        ferme: d.personeFerme === true
    };
}

/* Una fotografia nello stato registrato: `stato` (quello di
   leggiRegistrazione, o null per la prima) viene MODIFICATO e
   restituito; null se quel minuto e' gia' registrato, o se ce n'e' uno
   piu' recente (un cron doppio o in ritardo: niente doppioni, e la
   curva resta in ordine). uids: chi e' collegato adesso. */
function aggiungiMinuto(stato, minuto, uids, codice) {
    if (stato && stato.ultimoMinuto >= minuto) return null;
    const s = stato || { primoMinuto: minuto, ultimoMinuto: null, curva: [], persone: {}, ferme: false };
    const unici = Array.from(new Set(uids));
    const vicino = s.ultimoMinuto != null && minuto - s.ultimoMinuto <= BUCO_MAX_MINUTI;
    unici.forEach(uid => {
        const tratti = Object.prototype.hasOwnProperty.call(s.persone, uid) ? s.persone[uid] : (s.persone[uid] = []);
        const ultimo = tratti[tratti.length - 1];
        // c'era nella fotografia di prima (il suo tratto finisce li'), e il buco e' piccolo: continua
        if (vicino && ultimo && ultimo[1] === s.ultimoMinuto) ultimo[1] = minuto;
        else tratti.push([minuto, minuto]);
    });
    s.curva.push([minuto, unici.length, codice]);
    s.ultimoMinuto = minuto;
    return s;
}

/* Chi e' collegato adesso: le presenze dell'evento con un segnale negli
   ultimi 150 secondi (indice presenze: idEvento, ultimo), solo il campo
   uid. Fuori dalla transazione: le presenze si scrivono di continuo (una
   al minuto per persona) e dentro la transazione la farebbero ripartire. */
async function collegatiAdesso(ctx, idEvento, adesso) {
    const snap = await ctx.db.collection('presenze')
        .where('idEvento', '==', idEvento)
        .where('ultimo', '>=', ctx.Timestamp.fromMillis(adesso - FINESTRA_CONNESSI_MS))
        .select('uid').get();
    /* presenze/{idEvento}_{uid}: se il campo mancasse, l'uid e' nel nome
       del documento. Gli uid diventano chiavi di un oggetto JSON: fuori
       quelli che non sono uid (e "__proto__", che una chiave non puo' essere). */
    return snap.docs.map(d => String(d.get('uid') || d.id.slice(idEvento.length + 1)))
        .filter(u => RE_UID.test(u) && u !== '__proto__');
}

async function fotografaEvento(ctx, ev, adesso) {
    const minuto = Math.floor(adesso / MINUTO);
    const codice = CODICI[ev.stato] || 'a';
    const uids = await collegatiAdesso(ctx, ev.id, adesso);
    const rif = ctx.db.collection('ascolti').doc(ev.id);
    return D.transazione(ctx, async tx => {
        const snap = await tx.get(rif);
        const d = snap.exists ? snap.data() : null;
        const stato = aggiungiMinuto(leggiRegistrazione(d), minuto, uids, codice);
        if (!stato) return { idEvento: ev.id, minuto: minuto, collegati: uids.length, saltato: true };
        let persone = JSON.stringify(stato.persone);
        let ferme = stato.ferme;
        if (ferme || Buffer.byteLength(persone, 'utf8') > LIMITE_PERSONE) {
            // le persone restano come erano; la curva va avanti
            ferme = true;
            persone = d ? String(d.persone || '{}') : '{}';
        }
        const doc = {
            idEvento: ev.id, aggiornato: ctx.Timestamp.fromMillis(adesso),
            primoMinuto: stato.primoMinuto, ultimoMinuto: stato.ultimoMinuto,
            curva: JSON.stringify(stato.curva), persone: persone, versione: 1
        };
        if (ferme) doc.personeFerme = true;
        tx.set(rif, doc);
        return { idEvento: ev.id, minuto: minuto, collegati: uids.length };
    });
}

/* La fotografia di questo minuto, per tutti gli eventi in finestra.
   -> [{ idEvento, minuto, collegati, saltato?, errore? }] (solo numeri:
   e' quello che il cron scrive nei log). Un evento che fallisce non
   ferma gli altri. */
async function fotografa(ctx, opz) {
    const adesso = opz && Number.isFinite(opz.adesso) ? opz.adesso : ctx.adesso();
    const eventi = await eventiInFinestra(ctx, adesso);
    return Promise.all(eventi.map(async ev => {
        try {
            return await fotografaEvento(ctx, ev, adesso);
        } catch (e) {
            console.error('[diretta-ascolti] fotografia di ' + ev.id + ': ' + D.perLog(e));
            return { idEvento: ev.id, minuto: Math.floor(adesso / MINUTO), collegati: null, errore: true };
        }
    }));
}

/* ============================================================
   2. IL CALCOLO PER LA GESTIONE
   ============================================================ */

/* "iPhone · Safari" -> il tipo di dispositivo, il sistema, il browser
   (le parole sono quelle di descriviDispositivo in diretta-accesso.js). */
const TIPI = {
    'iPhone': 'Telefono', 'Android': 'Telefono',
    'iPad': 'Tablet', 'Tablet Android': 'Tablet',
    'Windows': 'Computer', 'Mac': 'Computer', 'Linux': 'Computer', 'Chromebook': 'Computer'
};
function parti(dispositivo) {
    const p = String(dispositivo || '').split(' · ');
    const sistema = (p[0] || '').trim() || 'Altro';
    const browser = (p[1] || '').trim() || 'altro browser';
    return { tipo: TIPI[sistema] || 'Altro', sistema: sistema, browser: browser };
}
// { nome: persone } -> [{ nome, persone }], dal numero piu' alto (a parita' in ordine alfabetico)
function classifica(conteggi) {
    return Object.keys(conteggi).map(nome => ({ nome: nome, persone: conteggi[nome] }))
        .sort((a, b) => b.persone - a.persone || a.nome.localeCompare(b.nome, 'it'));
}

// statistiche di un insieme di punti della curva (null se non ce ne sono)
function statistiche(punti) {
    if (!punti.length) return { media: null, massimo: null, minimo: null, minuti: 0 };
    let somma = 0, massimo = -Infinity, minimo = Infinity;
    punti.forEach(p => { somma += p.n; massimo = Math.max(massimo, p.n); minimo = Math.min(minimo, p.n); });
    return { media: unDecimale(somma / punti.length), massimo: massimo, minimo: minimo, minuti: punti.length };
}

/* Il picco: il massimo fra i minuti in onda, a parita' il PRIMO. */
function picco(inOnda) {
    let meglio = null;
    inOnda.forEach(p => { if (!meglio || p.n > meglio.n) meglio = p; });
    return meglio ? { n: meglio.n, t: meglio.t } : null;
}
/* Il minimo: fra i minuti in onda SENZA i primi 5 e gli ultimi 5 della
   giornata (l'avvio e la chiusura non sono un calo di ascolto); con 10
   minuti in onda o meno, su tutti. A parita' il primo. */
function minimo(inOnda) {
    const candidati = inOnda.length > 2 * MINUTI_BORDO ? inOnda.slice(MINUTI_BORDO, inOnda.length - MINUTI_BORDO) : inOnda;
    let peggio = null;
    candidati.forEach(p => { if (!peggio || p.n < peggio.n) peggio = p; });
    return peggio ? { n: peggio.n, t: peggio.t } : null;
}

/* Le pause: i tratti di punti consecutivi della curva in pausa. `a` e'
   la fine dell'ultimo minuto in pausa (come i tratti delle persone). */
function pause(curva) {
    const out = [];
    let aperta = null;
    curva.forEach(p => {
        if (p.stato === 'p') {
            if (!aperta) { aperta = { da: p.t, a: p.t + MINUTO }; out.push(aperta); } else aperta.a = p.t + MINUTO;
        } else aperta = null;
    });
    return out;
}

/* I cali: fra un minuto in onda e quello 5 minuti dopo (se fotografato,
   in onda, e senza minuti fuori onda in mezzo: una pausa non e' un calo
   di ascolto), quanti spettatori in meno. I 3 piu' forti, che non si
   sovrappongono (due cali possono toccarsi: uno finisce dove comincia
   l'altro), dal piu' forte; a parita' il primo. */
function cali(curva) {
    const indice = new Map();
    curva.forEach((p, i) => indice.set(p.m, i));
    const candidati = [];
    curva.forEach((p, i) => {
        if (p.stato !== 'o') return;
        const j = indice.get(p.m + LARGHEZZA_CALO);
        if (j === undefined) return;
        for (let k = i + 1; k <= j; k++) if (curva[k].stato !== 'o') return;
        const perdita = p.n - curva[j].n;
        if (perdita > 0) candidati.push({ m: p.m, t: p.t, da: p.n, a: curva[j].n, perdita: perdita });
    });
    candidati.sort((x, y) => y.perdita - x.perdita || x.m - y.m);
    const scelti = [];
    for (const c of candidati) {
        if (scelti.length >= QUANTI_CALI) break;
        if (scelti.every(s => Math.abs(s.m - c.m) >= LARGHEZZA_CALO)) scelti.push(c);
    }
    return scelti.map(c => ({ t: c.t, da: c.da, a: c.a, perdita: c.perdita }));
}

/* Il programma: ogni voce comincia alla sua ora nel giorno dell'evento
   (ora di Roma: "09.30" e' l'ora scritta nel programma, estate o inverno
   che sia) e finisce dove comincia la voce dopo (la prima con un'ora
   piu' tardi), o alla fine dell'evento. Le statistiche sui minuti in
   onda di [da, a). Una voce senza ora (il programma lo permette) resta
   con da e a null e nessuna statistica. */
function programma(ev, inOnda) {
    const inizio = D.ms(ev.inizio);
    const fine = D.ms(ev.fine);
    const giorno = inizio != null ? C.dataRoma(inizio) : '';
    const voci = (Array.isArray(ev.programma) ? ev.programma : []).map(v => ({ ora: String((v && v.ora) || ''), titolo: String((v && v.titolo) || '') }));
    const orari = voci.map(v => {
        const o = D.normalizzaOra(v.ora);
        const t = giorno && o ? C.istanteRoma(giorno, o) : NaN;
        return Number.isFinite(t) ? t : null;
    });
    return voci.map((v, i) => {
        const da = orari[i];
        if (da == null) return Object.assign({ ora: v.ora, titolo: v.titolo, da: null, a: null }, statistiche([]));
        let a = null;
        for (let j = i + 1; j < orari.length && a == null; j++) if (orari[j] != null && orari[j] > da) a = orari[j];
        if (a == null) a = fine;
        const dentro = a != null ? inOnda.filter(p => p.t >= da && p.t < a) : [];
        return Object.assign({ ora: v.ora, titolo: v.titolo, da: da, a: a }, statistiche(dentro));
    });
}

/* Gli ingressi ogni 5 minuti (fasce allineate all'orologio: 9.00, 9.05...):
   primi = persone il cui PRIMO tratto comincia nella fascia, rientri =
   gli inizi degli altri tratti. Tutti quelli che la curva conta (anche
   chi non e' piu' fra i partecipanti). Solo le fasce con qualcosa. */
function ingressi(persone) {
    const fasce = new Map();
    Object.keys(persone).forEach(uid => {
        (persone[uid] || []).forEach((tratto, k) => {
            const f = Math.floor(tratto[0] / LARGHEZZA_FASCIA) * LARGHEZZA_FASCIA;
            const x = fasce.get(f) || { t: f * MINUTO, primi: 0, rientri: 0 };
            if (k === 0) x.primi++; else x.rientri++;
            fasce.set(f, x);
        });
    });
    return Array.from(fasce.keys()).sort((a, b) => a - b).map(f => fasce.get(f));
}

/* IL RISULTATO per la scheda «Ascolti» (il formato e' un contratto con la
   pagina diretta/gestione/: tempi in millisecondi dall'epoca, gli orari
   li formatta la pagina). Da dati gia' letti, senza Firestore:
     id, ev              l'evento (i campi del documento)
     registrazione       i dati di ascolti/{id} (o null)
     presenze, accessi   i documenti dell'evento
     partecipanti        D.elencoPartecipanti
     adesso              il momento del calcolo (-> calcolato)
   Le statistiche PER PERSONA (iscritti, entrati, hanno visto, dispositivi,
   l'elenco) sono sui partecipanti dell'evento, come l'esportazione per gli
   attestati; quelle PER MINUTO (curva, picco, ingressi) contano chiunque
   avesse la pagina aperta, come il numero dei collegati della regia. */
function risultato({ id, ev, registrazione, presenze, accessi, partecipanti, adesso }) {
    const inizio = D.ms(ev.inizio);
    const fine = D.ms(ev.fine);
    const durataS = inizio != null && fine != null ? Math.max(0, Math.round((fine - inizio) / 1000)) : 0;
    const limita = secondi => (durataS ? Math.min(secondi, durataS) : secondi);

    // la registrazione minuto per minuto
    const reg = registrazione ? leggiRegistrazione(registrazione) : null;
    const curvaInterna = reg ? reg.curva.slice().sort((a, b) => a[0] - b[0])
        .map(p => ({ m: Number(p[0]), t: Number(p[0]) * MINUTO, n: Number(p[1]) || 0, stato: String(p[2] || 'a') })) : [];
    const inOnda = curvaInterna.filter(p => p.stato === 'o');
    const tratti = reg ? reg.persone : {};

    // presenze e accessi per persona
    const presenzaDi = new Map();
    presenze.forEach(p => { if (p && p.uid) presenzaDi.set(String(p.uid), p); });
    const accessiDi = new Map();
    const elencoAccessi = accessi.map(a => ({
        quando: D.ms(a.quando), uid: String(a.uid || ''), email: a.email || '', nome: a.nome || '', cognome: a.cognome || '',
        azienda: a.azienda || '', dispositivo: a.dispositivo || ''
    })).sort((a, b) => (a.quando || 0) - (b.quando || 0));
    elencoAccessi.forEach(a => {
        if (!accessiDi.has(a.uid)) accessiDi.set(a.uid, []);
        accessiDi.get(a.uid).push(a);
    });

    const minutiInOnda = inOnda.length;
    // la base delle percentuali: i minuti in onda fotografati, o la durata dell'evento se non ce ne sono
    const base = minutiInOnda || durataS / 60;
    const conteggiTipi = {}, conteggiBrowser = {}, conteggiSistemi = {};
    let credenzialiInviate = 0, entrati = 0, hannoVisto = 0, secondiVisti = 0;

    const persone = partecipanti.map(p => {
        const pr = presenzaDi.get(p.uid) || null;
        const suoi = accessiDi.get(p.uid) || [];
        const secondi = pr ? Math.max(0, Number(pr.secondi) || 0) : 0;
        const minuti = unDecimale(limita(secondi) / 60);
        const stato = secondi > 0 ? 'ha-visto' : (pr || suoi.length ? 'entrato' : 'mai-entrato');
        const credenziali = (p.invio && p.invio.stato) || '';
        if (credenziali === 'inviata') credenzialiInviate++;
        if (stato !== 'mai-entrato') entrati++;
        if (secondi > 0) { hannoVisto++; secondiVisti += limita(secondi); }
        const inizi = [pr ? D.ms(pr.primo) : null, suoi.length ? suoi[0].quando : null].filter(x => x != null);
        // i dispositivi, dal piu' recente; per i conteggi vale quello dell'ultimo accesso
        const dispositivi = [];
        suoi.slice().reverse().forEach(a => { if (a.dispositivo && dispositivi.indexOf(a.dispositivo) < 0) dispositivi.push(a.dispositivo); });
        if (suoi.length) {
            const x = parti(suoi[suoi.length - 1].dispositivo);
            conteggiTipi[x.tipo] = (conteggiTipi[x.tipo] || 0) + 1;
            conteggiBrowser[x.browser] = (conteggiBrowser[x.browser] || 0) + 1;
            conteggiSistemi[x.sistema] = (conteggiSistemi[x.sistema] || 0) + 1;
        }
        return {
            uid: p.uid, nome: p.nome || '', cognome: p.cognome || '', email: p.email || '', azienda: p.azienda || '',
            stato: stato, credenziali: credenziali,
            primoIngresso: inizi.length ? Math.min.apply(null, inizi) : null,
            ultimaPresenza: pr ? D.ms(pr.ultimo) : null,
            minutiInOnda: minuti,
            percentuale: base > 0 ? Math.min(100, Math.round(minuti / base * 100)) : 0,
            collegamenti: pr ? Number(pr.collegamenti) || 0 : 0,
            accessi: suoi.length,
            dispositivi: dispositivi,
            segmenti: (Object.prototype.hasOwnProperty.call(tratti, p.uid) ? tratti[p.uid] : []).map(s => [s[0] * MINUTO, (s[1] + 1) * MINUTO])
        };
    });

    const iscritti = partecipanti.length;
    let somma = 0;
    inOnda.forEach(p => { somma += p.n; });
    return {
        ok: true, calcolato: adesso,
        evento: {
            id: id, titolo: ev.titolo || '', inizio: inizio, fine: fine, stato: ev.stato || 'programmato',
            programma: (Array.isArray(ev.programma) ? ev.programma : []).map(v => ({ ora: String((v && v.ora) || ''), titolo: String((v && v.titolo) || '') }))
        },
        registrazione: {
            attiva: !!reg,
            primoMinuto: reg ? reg.primoMinuto * MINUTO : null,
            ultimoMinuto: reg ? reg.ultimoMinuto * MINUTO : null
        },
        riepilogo: {
            iscritti: iscritti,
            credenzialiInviate: credenzialiInviate,
            entrati: entrati,
            entratiPercento: iscritti ? Math.round(entrati / iscritti * 100) : 0,
            hannoVisto: hannoVisto,
            picco: picco(inOnda),
            minimo: minimo(inOnda),
            media: minutiInOnda ? unDecimale(somma / minutiInOnda) : 0,
            minutiInOnda: minutiInOnda,
            tempoMedioMinuti: hannoVisto ? unDecimale(secondiVisti / hannoVisto / 60) : 0,
            oreTotali: unDecimale(secondiVisti / 3600)
        },
        curva: curvaInterna.map(p => ({ t: p.t, n: p.n, stato: p.stato })),
        pause: pause(curvaInterna),
        cali: cali(curvaInterna),
        programma: programma(ev, inOnda),
        ingressi: ingressi(tratti),
        dispositivi: { tipi: classifica(conteggiTipi), browser: classifica(conteggiBrowser), sistemi: classifica(conteggiSistemi) },
        persone: persone,
        accessi: elencoAccessi,
        nota: NOTA + (reg && reg.ferme ? NOTA_FERME : '')
    };
}

/* Il calcolo, leggendo tutto: l'evento (404 se non c'e'), la
   registrazione, le presenze, gli accessi e i partecipanti dell'evento. */
async function calcola(ctx, idEvento, opz) {
    const id = D.controllaIdEvento(idEvento);
    const adesso = opz && Number.isFinite(opz.adesso) ? opz.adesso : ctx.adesso();
    const db = ctx.db;
    // prima l'evento: per un evento che non c'e' basta una lettura
    const ev = await db.collection('eventi').doc(id).get();
    if (!ev.exists) throw C.errore(404, 'Evento inesistente.', 'evento');
    const [registrazione, presenze, accessi, partecipanti] = await Promise.all([
        db.collection('ascolti').doc(id).get(),
        db.collection('presenze').where('idEvento', '==', id).get(),
        db.collection('accessi').where('idEvento', '==', id).get(),
        D.elencoPartecipanti(ctx, id)
    ]);
    return risultato({
        id: id, ev: ev.data(),
        registrazione: registrazione.exists ? registrazione.data() : null,
        presenze: presenze.docs.map(d => Object.assign({ uid: d.id.slice(id.length + 1) }, d.data())),
        accessi: accessi.docs.map(d => d.data()),
        partecipanti: partecipanti,
        adesso: adesso
    });
}

/* Quanto vale un risultato gia' calcolato: 60 secondi mentre la diretta
   e' in onda o in pausa, o fino a 3 ore dopo la fine (i numeri si
   muovono, la scheda si aggiorna ogni minuto); 10 minuti altrimenti.
   Lo si decide dal risultato stesso (l'evento com'era quando e' stato
   calcolato): cosi' la risposta dalla cache costa una lettura sola. */
function durataCache(dati, adesso) {
    const ev = (dati && dati.evento) || {};
    if (ev.stato === 'in_onda' || ev.stato === 'pausa') return CACHE_BREVE_MS;
    if (ev.fine != null && adesso <= ev.fine + CACHE_DOPO_FINE_MS) return CACHE_BREVE_MS;
    return CACHE_LUNGA_MS;
}

/* L'azione 'ascolti' della gestione: il risultato dalla cache
   ascoltiCache/{id} { calcolato (Timestamp), datiGz (il JSON del
   risultato compresso con gzip, in byte) } se e' abbastanza recente,
   altrimenti ricalcolato e salvato. COMPRESSO perche' con 1000 persone
   il JSON e' vicino agli 800 KB, e Firestore non tiene documenti sopra
   1 MiB: compresso sta intorno al decimo, e la cache regge anche eventi
   molto piu' grandi. Un risultato che compresso supera 900 KB non si
   salva: si restituisce lo stesso. (Un documento di prima, con `dati` in
   chiaro, si legge ancora.) */
function leggiCache(d) {
    try {
        if (d.datiGz) return JSON.parse(zlib.gunzipSync(Buffer.from(d.datiGz)).toString('utf8'));
        if (typeof d.dati === 'string') return JSON.parse(d.dati);
    } catch (_) { /* rovinata: si ricalcola */ }
    return null;
}
async function ascolti(ctx, idEvento) {
    const id = D.controllaIdEvento(idEvento);
    const adesso = ctx.adesso();
    const rif = ctx.db.collection('ascoltiCache').doc(id);
    const snap = await rif.get();
    if (snap.exists) {
        const d = snap.data();
        const calcolato = D.ms(d.calcolato);
        const dati = leggiCache(d);
        const eta = calcolato == null ? -1 : adesso - calcolato;
        if (dati && eta >= 0 && eta < durataCache(dati, adesso)) return dati;
    }
    const dati = await calcola(ctx, id, { adesso: adesso });
    const compresso = zlib.gzipSync(Buffer.from(JSON.stringify(dati), 'utf8'));
    if (compresso.length <= MAX_CACHE) {
        try {
            await rif.set({ calcolato: ctx.Timestamp.fromMillis(dati.calcolato), datiGz: compresso });
        } catch (e) {
            // senza cache la scheda funziona lo stesso: si ricalcola alla prossima apertura
            console.error('[diretta-ascolti] cache di ' + id + ': ' + D.perLog(e));
        }
    }
    return dati;
}

module.exports = {
    // la fotografia
    inFinestra, eventiInFinestra, aggiungiMinuto, leggiRegistrazione, fotografa,
    // il calcolo
    risultato, calcola, ascolti, durataCache, parti, leggiCache,
    MINUTO, FINESTRA_CONNESSI_MS, BUCO_MAX_MINUTI, CODICI, LIMITE_PERSONE, MAX_CACHE
};
