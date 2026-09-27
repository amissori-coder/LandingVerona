/* ============================================================
   Diretta degli eventi: le EMAIL PROGRAMMATE
   ------------------------------------------------------------
   Nella scheda Email della gestione, la sezione «Email programmate»
   mostra tutto quello che partira' da solo (elenco): i due promemoria
   automatici dell'evento (giorno prima, un'ora prima), le credenziali
   ancora in coda, l'invio automatico della password dopo la conferma
   dell'indirizzo (se l'interruttore e' acceso) e i PROMEMORIA IN PIU'
   che il gestore programma da li'.

   UN PROMEMORIA IN PIU' (raccolta programmate/{id}, chiusa ai browser
   come tutto quello che le regole non aprono):
     { idEvento, quando (Timestamp: l'ora di partenza), destinatari
       ('tutti' | 'mai-entrati'), oggetto, titolo, nota (solo testo),
       stato ('programmata' | 'partita' | 'annullata' | 'fermata'),
       cominciato (ms, il primo giro), finito, inviate, respinte,
       errori, incerti, ultimoGiro, creatoDa/creatoIl, modifiche,
       modificatoDa/modificatoIl, annullatoDa/annullatoIl }
   L'email e' il modello dei promemoria (lib/diretta-mail.js, tipo
   'extra'): l'oggetto e il titolo del gestore, la sua nota in cima, poi
   evento, data, orario, la sua email, il pulsante «Accedi alla diretta»,
   l'indirizzo per esteso, «Non trovi la password? Usa «Password
   dimenticata?»…», l'assistenza, la frase dello Spam. MAI la password.

   NIENTE PARTE SENZA UNA SCELTA DEL GESTORE: un promemoria in piu'
   esiste solo se il gestore lo programma (e conferma, nella pagina).

   CHI LO RICEVE: chi ha le credenziali «inviata» per l'evento (PRIMA
   dell'ora di partenza: chi entra dopo non lo riceve), account attivo,
   ancora nell'evento; con 'mai-entrati' solo chi non e' mai entrato. Chi
   e' «da confermare» o non ha le credenziali no (non ha una password).

   L'INVIO lo fa il lavoro programmato ogni 5 minuti (lib/diretta-
   invio.js, giroCron -> giroProgrammate), con la stessa presa in carico
   dei promemoria automatici (giroPromemoria): una volta sola per persona
   (promemoria.<idEvento>.x<id> sul profilo: 'invio' prima di spedire,
   poi l'orario; 'incerto' mai rimandato da solo), anche con due giri
   insieme o un giro interrotto. Dall'ora di partenza alla fine
   dell'evento; non a evento terminato. Dentro il tetto giornaliero, e
   al massimo fino al DIRETTA_PROMEMORIA_PERCENTO (70%) di quello del
   giorno: il resto resta a credenziali e «Password dimenticata?».

   MODIFICARE E ANNULLARE: finche' il primo giro non e' cominciato
   (cominciato, scritto dal cron in una transazione sullo stesso
   documento) si modifica o si annulla; dopo si puo' solo FERMARE: chi
   l'ha ricevuto l'ha ricevuto, gli altri no (il giro in corso lo
   ricontrolla prima di ogni gruppo).

   Nei log solo numeri: niente indirizzi, niente testi.
   ============================================================ */
'use strict';
const C = require('./diretta-comune');
const D = require('./diretta-dati');
const M = require('./diretta-mail');

const RACCOLTA = 'programmate';
const DESTINATARI = ['tutti', 'mai-entrati'];
const MAX_OGGETTO = 120;
const MAX_TITOLO = 80;
const MAX_NOTA = 500;
const MAX_RIGHE_NOTA = 12;
const MAX_ATTIVE = 10;
const RE_ID = /^[A-Za-z0-9]{10,40}$/;
// l'ora di partenza puo' essere "adesso" (con un minuto di margine per l'orologio)
const MARGINE_PASSATO_MS = 60 * 1000;
const MINUTO = 60 * 1000;
const ESEMPIO = { nome: 'Mario', cognome: 'Rossi', email: 'mario.rossi@esempio.it' };

// lib/diretta-invio.js si carica quando serve (lui carica questo file nel giro del cron)
function invio() { return require('./diretta-invio'); }
const tipoDi = id => 'x' + id;
function percento() { return Math.max(1, Math.min(100, C.intero('DIRETTA_PROMEMORIA_PERCENTO', 70))) / 100; }
function millis(v) {
    if (v == null) return NaN;
    if (typeof v === 'number') return v;
    if (typeof v.toMillis === 'function') return v.toMillis();
    return NaN;
}

/* ---------- i testi ---------- */

// una riga: niente a capo, niente caratteri di controllo, niente < >
function riga(v, max) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').replace(/[<>]/g, '')
        .replace(/\s{2,}/g, ' ').trim().slice(0, max);
}
function nota(v) {
    const righe = String(v == null ? '' : v).replace(/\r\n?/g, '\n').split('\n')
        .map(r => r.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').replace(/\s{2,}/g, ' ').trim());
    // al massimo due righe vuote di fila si riducono a una
    return righe.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
/* I testi del gestore. La nota e' SOLO testo: niente HTML, niente
   collegamenti (il collegamento alla diretta c'e' gia' nell'email, e un
   collegamento scritto a mano in un'email della diretta e' proprio quello
   che un truffatore vorrebbe poter mettere). -> { oggetto, titolo, nota } */
function testi(b) {
    const o = b || {};
    const oggetto = riga(o.oggetto, MAX_OGGETTO + 1);
    const titolo = riga(o.titolo, MAX_TITOLO + 1);
    const n = nota(o.nota);
    if (!oggetto) throw C.errore(400, 'Scrivi l\'oggetto dell\'email.', 'oggetto');
    if (oggetto.length > MAX_OGGETTO) throw C.errore(400, 'L\'oggetto è troppo lungo (al massimo ' + MAX_OGGETTO + ' caratteri).', 'oggetto');
    if (!titolo) throw C.errore(400, 'Scrivi il titolo dell\'email.', 'titolo');
    if (titolo.length > MAX_TITOLO) throw C.errore(400, 'Il titolo è troppo lungo (al massimo ' + MAX_TITOLO + ' caratteri).', 'titolo');
    if (n.length > MAX_NOTA) throw C.errore(400, 'La nota è troppo lunga (al massimo ' + MAX_NOTA + ' caratteri).', 'nota');
    if (n.split('\n').length > MAX_RIGHE_NOTA) throw C.errore(400, 'La nota ha troppe righe (al massimo ' + MAX_RIGHE_NOTA + ').', 'nota');
    const tuttoIlTesto = [o.oggetto, o.titolo, o.nota].map(x => String(x == null ? '' : x)).join('\n');
    if (/<\s*\/?\s*[a-z!]/i.test(tuttoIlTesto)) throw C.errore(400, 'Nell\'email niente HTML: scrivi solo testo.', 'nota');
    if (/(https?:\/\/|www\.|javascript:|mailto:|data:)/i.test(tuttoIlTesto)) {
        throw C.errore(400, 'Nell\'email niente collegamenti scritti a mano: il pulsante «Accedi alla diretta» e l\'indirizzo della pagina ci sono già.', 'nota');
    }
    return { oggetto: oggetto, titolo: titolo, nota: n };
}

/* { data: 'AAAA-MM-GG', ora: 'HH:MM' } (ora di Roma) -> millisecondi, o
   NaN se il giorno o l'ora non esistono (31 settembre, 25:00). */
function istante(b) {
    const data = String((b && b.data) || '');
    const ora = String((b && b.ora) || '').trim();
    const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
    if (!d || !/^([01]\d|2[0-3]):[0-5]\d$/.test(ora)) return NaN;
    const giorno = new Date(Date.UTC(+d[1], +d[2] - 1, +d[3]));
    if (giorno.getUTCMonth() !== +d[2] - 1 || giorno.getUTCDate() !== +d[3]) return NaN;
    return C.istanteRoma(data, ora);
}
/* L'ora di partenza. Non nel passato, non dopo la fine dell'evento.
   -> millisecondi */
function orarioDi(ctx, b, evento) {
    const quando = istante(b);
    if (!Number.isFinite(quando)) throw C.errore(400, 'Scegli il giorno e l\'ora di partenza.', 'quando');
    if (quando < ctx.adesso() - MARGINE_PASSATO_MS) throw C.errore(400, 'L\'ora di partenza è già passata: scegline una da adesso in poi.', 'quando');
    const fine = millis(evento.fine);
    if (!Number.isFinite(fine)) throw C.errore(400, 'L\'evento non ha l\'orario di fine: salvalo prima nella scheda Evento.', 'quando');
    if (quando >= fine) throw C.errore(400, 'L\'ora di partenza è dopo la fine dell\'evento.', 'quando');
    return quando;
}

async function eventoAperto(ctx, idEvento) {
    const ev = await invio().leggiEvento(ctx, idEvento);
    if (ev.stato === 'terminato') throw C.errore(409, 'L\'evento è terminato: non si programmano più email.', 'terminato');
    const fine = millis(ev.fine);
    if (Number.isFinite(fine) && fine <= ctx.adesso()) throw C.errore(409, 'L\'evento è già finito: non si programmano più email.', 'finito');
    return ev;
}

/* ---------- chi lo riceve ---------- */

/* Le condizioni in piu' di un promemoria programmato (quelle di sempre
   le controlla vuolePromemoria di lib/diretta-invio.js): le credenziali
   partite PRIMA dell'ora di partenza, e con 'mai-entrati' nessun accesso. */
function filtroPer(p) {
    const quando = millis(p.quando);
    const idEvento = p.idEvento;
    return d => {
        const v = invio().voce(d, idEvento);
        const inviata = millis(v.inviata);
        if (!Number.isFinite(inviata) || !(inviata <= quando)) return false;
        if (p.destinatari === 'mai-entrati' && d.ultimoAccesso) return false;
        return true;
    };
}
// i profili con le credenziali «inviata» dell'evento, con i soli campi che servono ai conti
async function conCredenziali(ctx, idEvento) {
    const I = invio();
    const snap = await I.conStato(ctx, idEvento, I.STATI_PROMEMORIA[0]).select(
        'stato', 'authCreato', 'email', 'emailNorm', 'eventi', 'ultimoAccesso',
        new ctx.FieldPath('invii', idEvento, 'stato'), new ctx.FieldPath('invii', idEvento, 'inviata'), new ctx.FieldPath('promemoria', idEvento)
    ).get();
    return snap.docs.map(d => d.data());
}
function contaPer(profili, idEvento, p) {
    const I = invio();
    const f = filtroPer(p);
    return profili.filter(d => I.vuolePromemoria(d, idEvento, tipoDi(p.id), f)).length;
}

/* ---------- il documento, com'e' per la gestione ---------- */

function statoDi(p, evento, ora) {
    if (p.stato === 'annullata') return { stato: 'annullata' };
    if (p.stato === 'fermata') return { stato: 'fermata' };
    if (p.stato === 'partita' || p.finito) return { stato: 'partita' };
    if (!evento) return { stato: 'non-partira', motivo: 'l\'evento non c\'è più' };
    if (evento.stato === 'terminato') return { stato: 'non-partira', motivo: p.cominciato ? 'interrotto: l\'evento è terminato' : 'l\'evento è terminato' };
    const fine = millis(evento.fine);
    if (Number.isFinite(fine) && ora >= fine) return { stato: 'non-partira', motivo: 'l\'evento è finito' };
    const quando = millis(p.quando);
    if (ora < quando) return { stato: 'programmata' };
    return { stato: 'in-corso', motivo: p.cominciato ? '' : 'parte al prossimo giro (entro 5 minuti)' };
}
function json(doc, evento, ora, persone) {
    const p = doc.data();
    const s = statoDi(p, evento, ora);
    return {
        id: doc.id, quando: millis(p.quando), destinatari: p.destinatari, oggetto: p.oggetto || '', titolo: p.titolo || '', nota: p.nota || '',
        stato: s.stato, motivo: s.motivo || '', modificabile: p.stato === 'programmata' && !p.cominciato && s.stato === 'programmata',
        fermabile: p.stato === 'programmata' && s.stato === 'in-corso',
        persone: persone == null ? null : persone,
        inviate: Number(p.inviate) || 0, respinte: Number(p.respinte) || 0, errori: Number(p.errori) || 0, incerti: Number(p.incerti) || 0,
        cominciato: Number(p.cominciato) || null, ultimoGiro: Number(p.ultimoGiro) || null,
        creatoDa: p.creatoDa || '', creatoIl: millis(p.creatoIl) || null, modifiche: Number(p.modifiche) || 0,
        modificatoDa: p.modificatoDa || '', modificatoIl: millis(p.modificatoIl) || null,
        annullatoDa: p.annullatoDa || '', annullatoIl: millis(p.annullatoIl) || null
    };
}

/* ============================================================
   L'ELENCO per la sezione «Email programmate» (azione 'programmate').
   -> { adesso, automatici: [{ tipo, attivo, da, a, stato, motivo,
        persone, inviate, ultimoGiro }], coda: { inCoda, limiteRaggiunto },
        iscrizioniAutomatiche, programmate: [...json], tettoGiorno,
        inviateOggi, percentoProgrammate }
   Costa una lettura dei profili con le credenziali «inviata» (i soli
   campi dei conti) e poche altre.
   ============================================================ */
async function elenco(ctx, idEvento) {
    const id = D.controllaIdEvento(idEvento);
    const I = invio();
    const ev = await I.leggiEvento(ctx, id);
    const ora = ctx.adesso();
    const [codaSnap, risSnap, progSnap, profili, inCoda] = await Promise.all([
        ctx.db.collection('code').doc(id).get(),
        ctx.db.collection('eventiRiservati').doc(id).get(),
        ctx.db.collection(RACCOLTA).where('idEvento', '==', id).get(),
        conCredenziali(ctx, id),
        I.conStato(ctx, id, 'in coda').count().get().then(s => s.data().count)
    ]);
    const cd = codaSnap.exists ? codaSnap.data() : {};
    const fatti = cd.promemoria || {};
    const attivi = (ev.promemoria || {});
    const automatici = ['giorno', 'ora'].map(tipo => {
        const attivo = tipo === 'giorno' ? !!attivi.giornoPrima : !!attivi.oraPrima;
        const f = I.finestraPromemoria(ev, tipo);
        const segno = fatti[tipo] || {};
        let stato, motivo = '';
        if (!attivo) stato = 'spento';
        else if (segno.finito) stato = 'partito';
        else if (!f) { stato = 'non-partira'; motivo = 'l\'evento è terminato'; }
        else if (ora < f.da) stato = 'programmata';
        else if (ora < f.a) stato = 'in-corso';
        else if (Number(segno.inviate) > 0) stato = 'partito';
        else { stato = 'non-partira'; motivo = 'la sua finestra è passata'; }
        const aperto = !!f && ora < f.a && !segno.finito;
        const persone = aperto ? profili.filter(d => I.vuolePromemoria(d, id, tipo)).length : 0;
        const inizio = millis(ev.inizio);
        const da = f ? f.da : (Number.isFinite(inizio) ? inizio - (tipo === 'giorno' ? 24 * 60 : 60) * MINUTO : null);
        return { tipo: tipo, attivo: attivo, da: da, a: f ? f.a : null, stato: stato, motivo: motivo, persone: persone,
            inviate: Number(segno.inviate) || 0, ultimoGiro: Number(segno.quando) || null };
    });
    const programmate = progSnap.docs.map(doc => {
        const p = Object.assign({ id: doc.id }, doc.data());
        const s = statoDi(p, ev, ora).stato;
        const persone = s === 'programmata' || s === 'in-corso' ? contaPer(profili, id, p) : null;
        return json(doc, ev, ora, persone);
    }).sort((a, b) => a.quando - b.quando);
    const tetto = I.maxGiorno();
    let inviateOggi = null;
    if (tetto) {
        const c = await ctx.db.collection('contatori').doc(I.chiaveGiorno(ctx)).get();
        inviateOggi = c.exists ? Number(c.data().inviate) || 0 : 0;
    }
    return {
        adesso: ora, automatici: automatici,
        coda: { inCoda: inCoda, limiteRaggiunto: !!tetto && inviateOggi >= tetto },
        iscrizioniAutomatiche: !!(risSnap.exists && risSnap.data().iscrizioniAutomatiche === true),
        programmate: programmate,
        tettoGiorno: tetto || 0, inviateOggi: inviateOggi, percentoProgrammate: Math.round(percento() * 100),
        // chi riceverebbe un promemoria nuovo, adesso: per la conferma della pagina
        personeTutti: contaPer(profili, id, { id: '-', idEvento: id, quando: ora + 365 * 24 * 60 * MINUTO, destinatari: 'tutti' }),
        personeMaiEntrati: contaPer(profili, id, { id: '-', idEvento: id, quando: ora + 365 * 24 * 60 * MINUTO, destinatari: 'mai-entrati' })
    };
}

/* ============================================================
   PROGRAMMA O MODIFICA (azione 'programmata-salva')
   { idEvento, id? (per modificare), data, ora, destinatari, oggetto,
     titolo, nota } -> { programmata (json), persone }
   ============================================================ */
async function salva(ctx, b, chi) {
    const idEvento = D.controllaIdEvento(b && b.idEvento);
    const ev = await eventoAperto(ctx, idEvento);
    const t = testi(b);
    const quando = orarioDi(ctx, b, ev);
    const destinatari = String((b && b.destinatari) || 'tutti');
    if (DESTINATARI.indexOf(destinatari) < 0) throw C.errore(400, 'Destinatari non validi.', 'destinatari');
    const ora = ctx.adesso();
    const campi = {
        idEvento: idEvento, quando: ctx.Timestamp.fromMillis(quando), destinatari: destinatari,
        oggetto: t.oggetto, titolo: t.titolo, nota: t.nota
    };
    const esistente = b && b.id != null && b.id !== '';
    let rif;
    if (esistente) {
        if (!RE_ID.test(String(b.id))) throw C.errore(400, 'Promemoria non valido.', 'id');
        rif = ctx.db.collection(RACCOLTA).doc(String(b.id));
        await D.transazione(ctx, async tx => {
            const s = await tx.get(rif);
            if (!s.exists || s.data().idEvento !== idEvento) throw C.errore(404, 'Promemoria non trovato: aggiorna l\'elenco.', 'id');
            const p = s.data();
            if (p.stato !== 'programmata') throw C.errore(409, 'Questo promemoria è già ' + (p.stato === 'annullata' ? 'annullato' : p.stato === 'fermata' ? 'fermato' : 'partito') + ': non si modifica più.', 'stato');
            if (p.cominciato) throw C.errore(409, 'Questo promemoria è già cominciato a partire: si può solo fermare.', 'cominciato');
            tx.update(rif, Object.assign({}, campi, {
                modifiche: ctx.FieldValue.increment(1), modificatoDa: String(chi || '').slice(0, 254), modificatoIl: ctx.Timestamp.fromMillis(ora)
            }));
        });
    } else {
        const attive = await ctx.db.collection(RACCOLTA).where('idEvento', '==', idEvento).get();
        const n = attive.docs.filter(d => d.data().stato === 'programmata').length;
        if (n >= MAX_ATTIVE) throw C.errore(409, 'Ci sono già ' + MAX_ATTIVE + ' promemoria in programma per questo evento: annullane uno prima di aggiungerne altri.', 'troppe');
        rif = await ctx.db.collection(RACCOLTA).add(Object.assign({}, campi, {
            stato: 'programmata', finito: false, inviate: 0, respinte: 0, errori: 0, incerti: 0, modifiche: 0,
            creatoDa: String(chi || '').slice(0, 254), creatoIl: ctx.Timestamp.fromMillis(ora)
        }));
    }
    const doc = await rif.get();
    const profili = await conCredenziali(ctx, idEvento);
    const persone = contaPer(profili, idEvento, Object.assign({ id: doc.id }, doc.data()));
    console.log('[diretta-programmate] ' + JSON.stringify({ idEvento: idEvento, azione: esistente ? 'modificata' : 'programmata', persone: persone }));
    return { programmata: json(doc, ev, ctx.adesso(), persone), persone: persone };
}

/* ============================================================
   ANNULLA O FERMA (azione 'programmata-annulla') { idEvento, id }
   Prima del primo giro: annullata. Dopo: fermata (chi l'ha ricevuto
   l'ha ricevuto; il giro in corso si ferma al prossimo gruppo).
   -> { programmata (json) }
   ============================================================ */
async function annulla(ctx, b, chi) {
    const idEvento = D.controllaIdEvento(b && b.idEvento);
    if (!RE_ID.test(String((b && b.id) || ''))) throw C.errore(400, 'Promemoria non valido.', 'id');
    const rif = ctx.db.collection(RACCOLTA).doc(String(b.id));
    const ora = ctx.adesso();
    let nuovo = '';
    await D.transazione(ctx, async tx => {
        const s = await tx.get(rif);
        if (!s.exists || s.data().idEvento !== idEvento) throw C.errore(404, 'Promemoria non trovato: aggiorna l\'elenco.', 'id');
        const p = s.data();
        if (p.stato !== 'programmata') throw C.errore(409, 'Questo promemoria è già ' + (p.stato === 'annullata' ? 'annullato' : p.stato === 'fermata' ? 'fermato' : 'partito') + '.', 'stato');
        nuovo = p.cominciato ? 'fermata' : 'annullata';
        tx.update(rif, { stato: nuovo, annullatoDa: String(chi || '').slice(0, 254), annullatoIl: ctx.Timestamp.fromMillis(ora) });
    });
    const ev = await invio().leggiEvento(ctx, idEvento).catch(() => null);
    console.log('[diretta-programmate] ' + JSON.stringify({ idEvento: idEvento, azione: nuovo }));
    return { programmata: json(await rif.get(), ev, ora, null) };
}

/* ============================================================
   L'ANTEPRIMA (azione 'programmata-anteprima') e LA PROVA A ME
   (azione 'programmata-prova'): gli stessi testi, controllati come per
   il salvataggio. L'anteprima e' l'email come la riceve un partecipante
   (con un nome di esempio), in testo semplice: la pagina la mostra come
   testo. La prova arriva al gestore con la scritta EMAIL DI PROVA.
   ============================================================ */
function quandoProva(ctx, b, ev) {
    const q = istante(b);
    const fine = millis(ev.fine);
    if (Number.isFinite(q) && (!Number.isFinite(fine) || q < fine)) return Math.max(q, ctx.adesso());
    return ctx.adesso();
}
async function anteprima(ctx, b) {
    const idEvento = D.controllaIdEvento(b && b.idEvento);
    const ev = await invio().leggiEvento(ctx, idEvento);
    const t = testi(b);
    const m = M.promemoria({
        tipo: 'extra', oggetto: t.oggetto, titolo: t.titolo, nota: t.nota, evento: ev, idEvento: idEvento,
        nome: ESEMPIO.nome, cognome: ESEMPIO.cognome, email: ESEMPIO.email, paginaEvento: ev.paginaEvento,
        assistenza: C.assistenza(), adesso: quandoProva(ctx, b, ev)
    });
    return { oggetto: m.oggetto, testo: m.testo };
}
async function prova(ctx, b, emailGestore) {
    const idEvento = D.controllaIdEvento(b && b.idEvento);
    const ev = await invio().leggiEvento(ctx, idEvento);
    const t = testi(b);
    return invio().inviaProva(ctx, {
        a: emailGestore, idEvento: idEvento, tipo: 'promemoria-extra',
        oggetto: t.oggetto, titolo: t.titolo, nota: t.nota, quando: quandoProva(ctx, b, ev)
    });
}

/* ============================================================
   IL GIRO DEL CRON (da giroCron di lib/diretta-invio.js, dopo i
   promemoria automatici). `eventiDocs`: gli eventi non ancora finiti
   (gia' letti dal cron). -> [ esiti di giroPromemoria, con programmata ]
   ============================================================ */
async function giroProgrammate(ctx, eventiDocs, statoCode, scadenza) {
    const I = invio();
    const out = [];
    const snap = await ctx.db.collection(RACCOLTA).where('stato', '==', 'programmata').get();
    if (snap.empty) return out;
    const eventi = new Map(eventiDocs.map(d => [d.id, Object.assign({ id: d.id }, d.data())]));
    const ora = ctx.adesso();
    for (const doc of snap.docs) {
        if (Date.now() >= scadenza) break;
        const p = Object.assign({ id: doc.id }, doc.data());
        if (p.finito || !(millis(p.quando) <= ora)) continue;
        const ev = eventi.get(p.idEvento);
        if (!ev || ev.stato === 'terminato') continue;
        const tipo = tipoDi(doc.id);
        // il primo giro lo segna, in una transazione: da qui non si modifica ne' si annulla piu' (si ferma)
        const ok = await D.transazione(ctx, async tx => {
            const s = await tx.get(doc.ref);
            if (!s.exists || s.data().stato !== 'programmata') return false;
            if (!s.data().cominciato) tx.update(doc.ref, { cominciato: ctx.adesso() });
            return true;
        });
        if (!ok) continue;
        const extra = {
            filtro: filtroPer(p),
            frazione: percento(),
            mail: base => M.promemoria(Object.assign({}, base, { tipo: 'extra', oggetto: p.oggetto, titolo: p.titolo, nota: p.nota })),
            // prima di ogni gruppo: e' ancora da mandare? (fermata dal gestore nel frattempo)
            attivo: async () => { const s = await doc.ref.get(); return s.exists && s.data().stato === 'programmata'; },
            dopo: async r => {
                const agg = {
                    inviate: ctx.FieldValue.increment(r.inviate || 0), respinte: ctx.FieldValue.increment(r.respinte || 0),
                    errori: ctx.FieldValue.increment(r.errori || 0), incerti: ctx.FieldValue.increment(r.incerti || 0),
                    ultimoGiro: ctx.adesso()
                };
                if (r.finito) { agg.finito = true; agg.stato = 'partita'; }
                // una programmata fermata nel frattempo resta fermata
                await D.transazione(ctx, async tx => {
                    const s = await tx.get(doc.ref);
                    if (!s.exists) return;
                    if (s.data().stato !== 'programmata') { delete agg.finito; delete agg.stato; }
                    tx.update(doc.ref, agg);
                });
            }
        };
        let r;
        try {
            r = await I.giroPromemoria(ctx, p.idEvento, ev, tipo, scadenza, extra);
        } catch (e) {
            console.error('[diretta-programmate] giro di un promemoria programmato non riuscito: ' + D.perLog(e));
            continue;
        }
        const riga = { idEvento: p.idEvento, programmata: doc.id, inviate: r.inviate, respinte: r.respinte, errori: r.errori, incerti: r.incerti, finito: r.finito };
        if (r.fermato) riga.fermato = true;
        if (r.limiteGiorno) riga.limiteGiorno = true;
        if (r.occupato) riga.occupato = true;
        console.log('[diretta-programmate] giro: ' + JSON.stringify(riga));
        out.push(Object.assign({ programmata: doc.id }, r));
    }
    return out;
}

module.exports = {
    elenco, salva, annulla, anteprima, prova, giroProgrammate,
    // per le prove
    testi, filtroPer, statoDi, tipoDi, RACCOLTA, MAX_ATTIVE, MAX_NOTA
};
