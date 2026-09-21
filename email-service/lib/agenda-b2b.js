/* ============================================================
   L'AGENDA DEGLI INCONTRI B2B: aree, referenti, slot, prenotazioni
   ------------------------------------------------------------
   Gli incontri B2B non sono piu' un tavolo per argomento con
   un'ora sola per tutti: sono APPUNTAMENTI. La giornata di
   ciascun'area (gli argomenti del convegno, piu' la revisione
   legale e la certificazione ISO, che tappe del programma non sono
   ma tavoli si') e' divisa in slot - dalle 10 alle 17, con la
   pausa pranzo fuori - e chi riceve l'invito ne prenota UNO.

   Perche' il conto lo tiene il servizio e non l'area riservata:
   due ospiti che aprono la pagina nello stesso momento vedono
   tutti e due lo slot delle 10:30 libero. Se a decidere fosse il
   browser, si prenoterebbero tutti e due e uno dei due lo
   scoprirebbe il giorno del convegno. Qui la presa dello slot
   avviene dentro una TRANSAZIONE: il secondo trova occupato e la
   pagina glielo dice subito, con l'elenco aggiornato.

   COSA STA DOVE
     - b2bAgenda/{evento}       la configurazione: gli orari della
       giornata, e per ogni area i referenti che tengono il tavolo,
       gli slot chiusi (il referente e' sul palco) e se l'area e'
       attiva. La scrive l'area riservata.
     - b2bPrenotazioni/{evento} chi ha preso cosa: per area, uno
       slot per chiave oraria, con la scheda del prenotato. E le
       richieste "fuori slot", di chi ha trovato tutto esaurito e
       ha chiesto un incontro lo stesso.
   Sono due documenti e non uno perche' si scrivono in momenti
   diversi e da mani diverse: chi configura non deve poter
   sovrascrivere una prenotazione presa un attimo prima.

   SULLA SCHEDA DELL'ISCRITTO (collezione "iscrizioni") resta
   scritto l'appuntamento (`b2bAppuntamento`): e' quello che l'area
   riservata mostra in tabella accanto alla persona. La
   prenotazione vera pero' e' quella nel documento degli slot: la
   scheda ne e' la copia comoda.

   PERCHE' QUESTO NON E' UN ENDPOINT A SE'. Come per le aziende da
   invitare: la logica vive in lib/, e api/presenze.js le passa le
   richieste con sezione: 'b2b' (lato area riservata), mentre
   api/iscrizione-nuova.js le passa quelle dell'ospite che prenota
   (lato pubblico, con il collegamento firmato). Le intestazioni
   CORS, l'avvio dell'Admin SDK e il controllo di chi chiama li
   hanno gia' fatti loro.
   ============================================================ */

const nodemailer = require('nodemailer');
// firma del collegamento personale (la stessa della pagina di prenotazione)
const NL = require('./newsletter');
// le mail composte dal servizio: qui non arriva HTML da fuori
const MNGB = require('./mail-ngb');
// il foglio da presentare al desk
const PDF = require('./pdf-prenotazione');
const { AREE_B2B, areaDa, nomeArea } = require('./temi-b2b');
/* La SCALETTA della giornata: serve per sapere chi e' sul palco e quando.
   Gli orari in cui chi tiene un tavolo e' in sala non si chiudono piu' a
   mano - si ricavano da qui ogni volta che l'agenda si legge (vedi
   `chiusureDaPalco` nel modello) - cosi' fra l'accorgersene e il chiuderli
   non resta una finestra in cui qualcuno prenota un incontro impossibile. */
const PRG = require('./programma-evento');
/* Il modello - documenti, orari, stato dei tavoli - sta in un file suo,
   senza posta ne' PDF: cosi' lo puo' leggere anche chi ha bisogno solo di
   sapere chi ha prenotato (vedi lib/agenda-modello.js). Qui si tiene tutto
   quello che il modello espone, perche' il resto del servizio e le prove
   continuano a chiederlo a questo modulo. */
const M = require('./agenda-modello');
const {
    oraValida, minutiOra, oraDaMinuti, chiaveSlot, oraDaChiave, fraseOrario,
    GIORNATA_PREDEFINITA, normalizzaGiornata, slotDellaGiornata,
    idEvento, rifAgenda, rifPrenotazioni,
    areaVuota, normalizzaReferente, normalizzaAree, normalizzaAgenda, leggiAgenda,
    normalizzaPrenotazioni, leggiPrenotazioni,
    slotDiArea, areeComposte, appuntamentoDi, chiusureDaPalco,
    corpoPrenotazioni, appuntamentoDaLiberare, appuntamentiAzienda,
    rifAzienda, normalizzaAziendaB2B, leggiAzienda, leggiAziendeB2B, regoleB2B,
    MAX_ESIGENZE, TESTO_ESIGENZA,
    orariPresi, chiDiSlot, bloccoSuPrenotazioni
} = M;

/* Le voci della scaletta, o niente. "Niente" e' una risposta buona: un
   evento senza programma scritto non ha nessuno sul palco, e i tavoli si
   leggono come si sono sempre letti. Un errore nel leggerlo non deve
   fermare la pagina di chi prenota, ma nemmeno spalancare gli orari di
   chi e' in sala: se il programma non si legge, si risponde `null` e chi
   chiama lo distingue dalla scaletta vuota. */
async function vociProgramma(db, evento) {
    try {
        const p = await PRG.leggiProgramma(db, evento);
        return (p && p.voci) || [];
    } catch (e) { return null; }
}

function testo(v, max) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 200);
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* =========================================================
   L'INVITO: a quali aree e' stata invitata questa persona
========================================================= */
/* L'area non viaggia nel collegamento: sta SULLA SCHEDA, scritta al
   momento dell'invito. Cosi' chi riceve la mail non puo' cambiarla
   ritoccando l'indirizzo, e chi organizza sa sempre a che tavolo aveva
   convocato quella persona. Un secondo invito ad un'altra area si
   AGGIUNGE: sono due convocazioni, non una che cancella l'altra. */
function areeInvitate(scheda) {
    const inv = (scheda && scheda.b2bInvito && typeof scheda.b2bInvito === 'object') ? scheda.b2bInvito : {};
    const grezze = Array.isArray(inv.aree) ? inv.aree : (inv.area ? [inv.area] : []);
    const viste = [];
    grezze.forEach(x => {
        const a = areaDa(x);
        if (a && viste.indexOf(a.id) < 0) viste.push(a.id);
    });
    return viste;
}
// l'evento a cui l'invito si riferisce: senza, non si sa quale agenda leggere
function eventoInvito(scheda) {
    const inv = (scheda && scheda.b2bInvito && typeof scheda.b2bInvito === 'object') ? scheda.b2bInvito : {};
    return idEvento(inv.eventoId || '');
}
// invito "a slot" (quello nuovo): ha un evento e almeno un'area
function invitoASlot(scheda) { return !!(eventoInvito(scheda) && areeInvitate(scheda).length); }

/* =========================================================
   QUELLO CHE VEDE CHI HA RICEVUTO L'INVITO
========================================================= */
/* Gli slot si mostrano liberi oppure occupati, MAI con il nome di chi li
   ha presi: sono imprese che vengono a incontrare noi, e chi prenota non
   deve poter leggere l'agenda degli altri. Il proprio invece si riconosce
   ("mio"), altrimenti chi torna sulla pagina vedrebbe il suo posto come
   occupato da uno sconosciuto. */
async function letturaOspite(db, scheda, idDoc) {
    const evento = eventoInvito(scheda);
    const invitate = areeInvitate(scheda);
    const agenda = await leggiAgenda(db, evento);
    const pren = await leggiPrenotazioni(db, evento);
    const voci = await vociProgramma(db, evento) || [];
    const mio = appuntamentoDi(pren, idDoc);
    /* Le aree da mostrare: quelle a cui e' stato invitato e che sono
       ATTIVE. Piu' quella dove ha gia' l'appuntamento, anche se nel
       frattempo e' stata spenta: il suo incontro esiste, e nascondergli
       la riga in cui e' scritto sarebbe il modo piu' rapido per farlo
       arrivare a un tavolo che crede ancora suo. */
    const daMostrare = invitate.filter(id => ((agenda.aree || {})[id] || {}).attiva === true);
    if (mio && daMostrare.indexOf(mio.area) < 0) daMostrare.push(mio.area);
    const aree = daMostrare.map(id => {
        const cfg = (agenda.aree || {})[id] || areaVuota();
        const slot = slotDiArea(agenda, pren, id, voci);
        return {
            id: id, nome: nomeArea(id), nota: cfg.nota,
            // di chi tiene il tavolo si dice nome e ruolo: e' la persona che
            // l'ospite trovera' seduta di la', e saperlo prima cambia la
            // conversazione. L'indirizzo email no: non e' un contatto diretto.
            referenti: cfg.referenti.map(r => ({ nome: r.nome, ruolo: r.ruolo, azienda: r.azienda })),
            slot: slot.map(s => ({
                ora: s.ora, fine: s.fine, chiave: s.chiave,
                stato: (mio && mio.area === id && mio.chiave === s.chiave) ? 'mio' : s.stato
            })),
            liberi: slot.filter(s => s.stato === 'libero').length
        };
    });
    const richiesta = (pren.richieste || []).filter(r => String(r.doc || '') === String(idDoc || ''))[0] || null;
    return {
        modo: 'slot',
        evento: agenda.eventoDati,
        giornata: agenda.giornata,
        aree: aree,
        // tutto esaurito: nessuno slot libero in nessuna delle sue aree
        esaurito: aree.length > 0 && aree.every(a => !a.liberi),
        mio: mio ? {
            area: mio.area, areaNome: nomeArea(mio.area),
            ora: mio.ora, fine: String((mio.dati || {}).fine || ''),
            quando: Number((mio.dati || {}).quando) || 0
        } : null,
        richiesta: richiesta ? { quando: Number(richiesta.quando) || 0, stato: String(richiesta.stato || 'aperta') } : null,
        nota: String((scheda.extra && scheda.extra['Nota B2B']) || '')
    };
}

/* =========================================================
   PRENDERE UNO SLOT
   ------------------------------------------------------------
   Dentro una transazione, perche' e' qui che due ospiti si
   incontrano. Chi arriva secondo non "vince l'ultimo scritto": si
   sente dire che quello slot non c'e' piu'.
   E si prenota UN SOLO slot per evento: se ne aveva gia' uno, quello
   vecchio si libera nello stesso passaggio, altrimenti chi cambia
   idea terrebbe impegnati due posti.
========================================================= */
async function prendiSlot(db, dati) {
    const evento = idEvento(dati.evento);
    const areaId = (areaDa(dati.area) || {}).id || '';
    const chiave = chiaveSlot(dati.ora) || chiaveSlot(oraDaChiave(dati.chiave || ''));
    if (!evento || !areaId || !chiave) {
        return { ok: false, motivo: 'dati', msg: 'Incontro non riconosciuto: ricarichi la pagina e riprovi.' };
    }
    const agenda = await leggiAgenda(db, evento);
    const cfg = (agenda.aree || {})[areaId] || areaVuota();
    const slot = slotDellaGiornata(agenda.giornata).filter(s => s.chiave === chiave)[0];
    if (!slot) return { ok: false, motivo: 'orario', msg: 'Quell\'orario non e piu in programma: ricarichi la pagina e scelga fra quelli disponibili.' };
    /* Lo staff puo' assegnare anche uno slot chiuso o di un'area spenta: e'
       il senso di "forzare", ed e' la risposta a chi ha chiesto un incontro
       a posti esauriti. L'ospite no. */
    if (!dati.forzato) {
        if (!cfg.attiva) return { ok: false, motivo: 'area', msg: 'Questo tavolo non e attivo: ricarichi la pagina.' };
        if (cfg.chiusi.indexOf(chiave) >= 0) return { ok: false, motivo: 'chiuso', msg: 'Quell\'orario non e disponibile: ne scelga un altro.' };
        /* E nemmeno un orario in cui chi tiene il tavolo e' sul palco: la
           pagina quegli orari non li mostra liberi, ma fra quando li ha
           disegnati e quando qualcuno preme la scaletta puo' essere
           cambiata. Qui si decide sull'ultima versione. Se il programma
           non si riesce a leggere non si tira a indovinare: si chiede di
           riprovare, perche' l'alternativa e' fissare un incontro con
           qualcuno che in quell'ora e' in sala. */
        const voci = await vociProgramma(db, evento);
        if (voci === null) {
            return { ok: false, motivo: 'errore', msg: 'Non riesco a controllare il programma della giornata: riprovi fra un momento.' };
        }
        const palco = chiusureDaPalco(agenda.giornata, voci, cfg.referenti)[chiave];
        if (palco) return { ok: false, motivo: 'palco', msg: 'Quell\'orario non e disponibile: ne scelga un altro.' };
    }
    const p = dati.persona || {};
    const persona = {
        doc: testo(p.doc, 400), id: testo(p.id, 300),
        nome: testo(p.nome, 160), azienda: testo(p.azienda, 200),
        ruolo: testo(p.ruolo, 160), email: testo(p.email, 200).toLowerCase(),
        telefono: testo(p.telefono, 60), nota: testo(p.nota, 800),
        /* L'AZIENDA e CHI PARTECIPA. `nome` resta chi ha prenotato - serve per
           richiamare qualcuno se al desk qualcosa non torna - mentre `perChi`
           e' la persona che a quel tavolo ci si siede davvero: sono due cose,
           e sul foglio del desk si leggono come due. */
        aziendaId: testo(p.aziendaId, 40), aziendaNome: testo(p.aziendaNome, 200),
        perChi: testo(p.perChi, 160), perRuolo: testo(p.perRuolo, 160), perDoc: testo(p.perDoc, 400),
        // 1 = la preferenza che prenota da se', 2 e 3 = quelle assegnate dallo staff
        scelta: [1, 2, 3].indexOf(Number(dati.scelta)) >= 0 ? Number(dati.scelta) : 1,
        codaId: testo(dati.codaId, 60),
        fine: slot.fine, quando: Date.now(),
        da: dati.forzato ? 'staff' : 'ospite'
    };
    if (!persona.doc) return { ok: false, motivo: 'dati', msg: 'Scheda non riconosciuta.' };

    const rif = rifPrenotazioni(db, evento);
    let esito = null;
    await db.runTransaction(async t => {
        const snap = await t.get(rif);
        const corrente = normalizzaPrenotazioni(snap.exists ? snap.data() : null, evento);
        const preso = ((corrente.aree || {})[areaId] || {})[chiave];
        /* DI CHI E' QUESTO ORARIO. Con l'azienda la domanda cambia: non piu'
           "e' della stessa persona?" ma "e' della stessa azienda, e della
           stessa preferenza?". La preferenza conta: un'azienda puo' avere la
           prima e una seconda assegnata, e sovrascrivere l'una con l'altra
           cancellerebbe un incontro gia' sul foglio del desk. Per tutto
           quello che e' stato prenotato prima che le aziende esistessero
           vale la regola di sempre, il documento della persona. */
        const mio = preso && (persona.aziendaId
            ? (String(preso.aziendaId || '') === persona.aziendaId
                && (Number(preso.scelta) || 1) === persona.scelta)
            : String(preso.doc || '') === persona.doc);
        if (preso && !mio) {
            esito = { ok: false, motivo: 'occupato', msg: 'Quell\'orario e stato appena prenotato da qualcun altro: ne scelga un altro.' };
            return;
        }
        // il posto che aveva prima si libera: quello indicato, oppure quello
        // della stessa azienda con la stessa preferenza (vedi il modello)
        const prima = appuntamentoDaLiberare(corrente, persona, dati.slotDa);
        const aree = Object.assign({}, corrente.aree);
        if (prima) {
            aree[prima.area] = Object.assign({}, aree[prima.area]);
            delete aree[prima.area][prima.chiave];
        }
        aree[areaId] = Object.assign({}, aree[areaId] || {});
        aree[areaId][chiave] = persona;
        /* La richiesta fuori slot, se ce n'era una di questa persona o di un
           suo collega, si chiude da se': l'azienda ha ottenuto l'incontro, e
           lasciarla aperta manderebbe lo staff a cercare un posto per chi ce
           l'ha gia'. Prima si guardava solo il documento di chi prenota, e la
           richiesta del collega restava li'. */
        const richieste = (corrente.richieste || []).filter(r => {
            if (String(r.doc || '') === persona.doc) return false;
            return !(persona.aziendaId && String(r.aziendaId || '') === persona.aziendaId);
        });
        t.set(rif, corpoPrenotazioni(corrente, {
            evento: evento, aree: aree, richieste: richieste,
            aggiornato: { quando: Date.now(), da: testo(dati.da, 200) || persona.email }
        }));
        esito = {
            ok: true, area: areaId, areaNome: nomeArea(areaId),
            ora: slot.ora, fine: slot.fine, orario: fraseOrario(slot.ora, slot.fine),
            liberato: prima ? { area: prima.area, ora: prima.ora } : null
        };
    });
    return esito || { ok: false, motivo: 'errore', msg: 'Prenotazione non riuscita: riprovi fra un momento.' };
}

/* Liberare uno slot: lo fa lo staff dall'area riservata quando l'ospite non
   viene piu'. Si puo' indicare la PERSONA (com'e' sempre stato) oppure lo
   SLOT preciso - e con le aziende serve, perche' un'impresa puo' avere due
   incontri e "quello della persona" non dice piu' quale.
   Torna anche CHI c'era dentro: chi chiama deve poter ripulire la scheda e
   avvisare l'azienda, e dopo la cancellazione quel dato non c'e' piu'. */
async function liberaSlot(db, evento, idDoc, chi, slotDa) {
    const ev = idEvento(evento);
    const rif = rifPrenotazioni(db, ev);
    let esito = null;
    await db.runTransaction(async t => {
        const snap = await t.get(rif);
        const corrente = normalizzaPrenotazioni(snap.exists ? snap.data() : null, ev);
        const mio = (slotDa && slotDa.area && slotDa.chiave)
            ? M.slotDi(corrente, slotDa.area, chiaveSlot(oraDaChiave(slotDa.chiave)) || slotDa.chiave)
            : appuntamentoDi(corrente, idDoc);
        if (!mio) { esito = { ok: false, msg: 'Nessun incontro prenotato per questa persona.' }; return; }
        const aree = Object.assign({}, corrente.aree);
        aree[mio.area] = Object.assign({}, aree[mio.area]);
        delete aree[mio.area][mio.chiave];
        t.set(rif, corpoPrenotazioni(corrente, {
            evento: ev, aree: aree,
            aggiornato: { quando: Date.now(), da: testo(chi, 200) }
        }));
        esito = {
            ok: true, area: mio.area, areaNome: nomeArea(mio.area), ora: mio.ora,
            chiave: mio.chiave, chi: mio.dati || null
        };
    });
    return esito || { ok: false, msg: 'Operazione non riuscita.' };
}

/* =========================================================
   LA RICHIESTA "FUORI SLOT"
   ------------------------------------------------------------
   Quando tutti gli orari sono presi, la pagina non lascia l'ospite
   davanti a un muro: gli lascia chiedere l'incontro lo stesso. Non
   e' una prenotazione, e la pagina lo dice - nessuno slot viene
   impegnato - ma la richiesta arriva a chi organizza, che puo'
   aprire un orario chiuso o spostare qualcosa.
========================================================= */
const MAX_RICHIESTE = 300;
async function chiediFuoriSlot(db, dati) {
    const evento = idEvento(dati.evento);
    const p = dati.persona || {};
    const voce = {
        doc: testo(p.doc, 400), nome: testo(p.nome, 160),
        azienda: testo(p.azienda, 200), ruolo: testo(p.ruolo, 160),
        email: testo(p.email, 200).toLowerCase(), telefono: testo(p.telefono, 60),
        aziendaId: testo(p.aziendaId, 40), aziendaNome: testo(p.aziendaNome, 200),
        area: (areaDa(dati.area) || {}).id || '', nota: testo(dati.nota, 800),
        quando: Date.now(), stato: 'aperta'
    };
    if (!evento || !voce.doc) return { ok: false, msg: 'Richiesta non riconosciuta.' };
    const rif = rifPrenotazioni(db, evento);
    let esito = null;
    await db.runTransaction(async t => {
        const snap = await t.get(rif);
        const corrente = normalizzaPrenotazioni(snap.exists ? snap.data() : null, evento);
        // una richiesta per persona: la seconda aggiorna la prima invece di
        // moltiplicare le righe che lo staff deve leggere
        const altre = (corrente.richieste || []).filter(r => {
            if (String(r.doc || '') === voce.doc) return false;
            // una richiesta per AZIENDA: due colleghi che bussano sono un bussare solo
            return !(voce.aziendaId && String(r.aziendaId || '') === voce.aziendaId);
        });
        const richieste = altre.concat([voce]).slice(-MAX_RICHIESTE);
        t.set(rif, corpoPrenotazioni(corrente, {
            evento: evento, richieste: richieste,
            aggiornato: { quando: Date.now(), da: voce.email }
        }));
        esito = { ok: true };
    });
    return esito || { ok: false, msg: 'Richiesta non registrata: riprovi fra un momento.' };
}

/* Segna una richiesta come gestita (o la riapre, o la toglie): lo fa lo
   staff dall'area riservata dopo aver chiamato l'impresa. */
async function segnaRichiesta(db, evento, idDoc, stato, chi) {
    const ev = idEvento(evento);
    const rif = rifPrenotazioni(db, ev);
    let esito = null;
    await db.runTransaction(async t => {
        const snap = await t.get(rif);
        const corrente = normalizzaPrenotazioni(snap.exists ? snap.data() : null, ev);
        let trovata = false;
        const richieste = [];
        (corrente.richieste || []).forEach(r => {
            if (String(r.doc || '') !== String(idDoc || '')) { richieste.push(r); return; }
            trovata = true;
            if (stato === 'tolta') return;     // sparisce dall'elenco
            richieste.push(Object.assign({}, r, { stato: stato, gestita: { quando: Date.now(), da: testo(chi, 200) } }));
        });
        if (!trovata) { esito = { ok: false, msg: 'Richiesta non trovata.' }; return; }
        t.set(rif, corpoPrenotazioni(corrente, {
            evento: ev, richieste: richieste,
            aggiornato: { quando: Date.now(), da: testo(chi, 200) }
        }));
        esito = { ok: true };
    });
    return esito || { ok: false, msg: 'Operazione non riuscita.' };
}

/* =========================================================
   LA RICEVUTA: mail di conferma con il foglio per il desk
========================================================= */
function trasporto() {
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 465,
        secure: (Number(process.env.SMTP_PORT) || 465) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
}
function mittenteMail() {
    const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
    const fromName = (process.env.SMTP_FROM_NAME || 'Revilaw S.p.A.').replace(/[\r\n]/g, ' ').slice(0, 80);
    return '"' + fromName + '" <' + fromEmail + '>';
}
/* Data e ora in Italia, per il "emessa il" stampato sul foglio: e' l'unico
   modo per capire quale di due fogli e' il piu' recente. */
function quandoInItalia() {
    try {
        return new Date().toLocaleString('it-IT', {
            timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        }).replace(',', ' alle');
    } catch (e) { return new Date().toISOString().slice(0, 16).replace('T', ' '); }
}
// il nome del file lo legge chi lo salva sul telefono: niente accenti ne' spazi
function nomeFileFoglio(nome) {
    const pulito = PDF.inLatin1(nome).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    return 'Incontri-B2B-prenotazione' + (pulito ? '-' + pulito : '') + '.pdf';
}

/* La conferma dell'appuntamento: stessa mail e stesso foglio della
   prenotazione a tavoli - un incontro solo, con l'ora esatta e il nome di
   chi lo tiene. Riparte a ogni cambio di orario, e vale sempre l'ultimo
   foglio emesso. */
async function inviaConferma(scheda, idDoc, agenda, appuntamento) {
    const a = String(scheda.email || '').toLowerCase();
    if (!a || !EMAIL_RE.test(a)) return false;
    const cfg = (agenda.aree || {})[appuntamento.area] || areaVuota();
    const ev = agenda.eventoDati || {};
    const nome = ((String(scheda.nome || '') + ' ' + String(scheda.cognome || '')).trim());
    const dati = {
        nome: nome, azienda: String(scheda.azienda || ''), ruolo: String(scheda.ruolo || ''),
        pagina: String(scheda.pagina || ''),
        evento: {
            titolo: String(ev.titolo || '') || MNGB.nomeEvento(scheda.pagina),
            quando: String(ev.quando || ''), luogo: String(ev.luogo || ''), indirizzo: String(ev.indirizzo || '')
        },
        tavoli: [{
            nome: appuntamento.areaNome || nomeArea(appuntamento.area),
            orario: fraseOrario(appuntamento.ora, appuntamento.fine),
            /* Chi trovera' al tavolo: e' la meta' dell'informazione, ed e'
               l'unica che finora non riuscivamo a dare prima del convegno. */
            con: cfg.referenti.map(r => r.nome + (r.ruolo ? ' (' + r.ruolo + ')' : '')).join(', ')
        }]
    };
    const link = NL.linkB2B(idDoc);
    const m = MNGB.confermaB2B(dati, link);
    const foglio = PDF.pdfPrenotazione(Object.assign({}, dati, { emessoIl: quandoInItalia() }));
    const trans = trasporto();
    await trans.sendMail({
        from: mittenteMail(), to: a, subject: m.oggetto, text: m.testo, html: m.html,
        attachments: [{ filename: nomeFileFoglio(nome), content: foglio, contentType: 'application/pdf' }]
    });
    try { trans.close(); } catch (_) { /* niente da chiudere */ }
    return true;
}

/* L'avviso a chi organizza quando un ospite chiede un incontro a slot
   esauriti. Va a chi ha mandato l'invito (lo sa la scheda) e, in
   mancanza, alla casella del servizio: una richiesta che non arriva a
   nessuno e' una porta che si apre sul vuoto. */
async function avvisaRichiesta(scheda, agenda, area, nota) {
    const inv = (scheda.b2bInvito && typeof scheda.b2bInvito === 'object') ? scheda.b2bInvito : {};
    const daInvito = String(inv.da || '').toLowerCase();
    const dest = (daInvito && EMAIL_RE.test(daInvito)) ? daInvito : (process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || '');
    if (!dest) return false;
    const chi = ((String(scheda.nome || '') + ' ' + String(scheda.cognome || '')).trim()) || String(scheda.email || '');
    const ev = agenda.eventoDati || {};
    const righe = [
        'Gli orari degli incontri B2B risultano esauriti e questa persona ha chiesto un incontro lo stesso.',
        'Persona: ' + chi + (scheda.azienda ? ' - ' + String(scheda.azienda) : ''),
        'Contatti: ' + String(scheda.email || '') + (scheda.telefono ? ' - ' + String(scheda.telefono) : ''),
        'Tavolo: ' + (nomeArea(area) || 'non indicato'),
        'Evento: ' + ([ev.titolo, ev.quando].filter(Boolean).join(', ') || String(scheda.pagina || '')),
        nota ? 'Ha scritto: ' + nota : '',
        'La richiesta e nella sezione Eventi dell\'area riservata, sotto "Incontri B2B: aree e orari": da li si assegna un orario.'
    ].filter(Boolean);
    const trans = trasporto();
    await trans.sendMail({
        from: mittenteMail(), to: dest,
        replyTo: String(scheda.email || '') || undefined,
        subject: 'Incontro B2B chiesto a orari esauriti - ' + chi,
        text: righe.join('\n\n')
    });
    try { trans.close(); } catch (_) { /* niente da chiudere */ }
    return true;
}

/* =========================================================
   GLI INCONTRI DI UN'AZIENDA
   ------------------------------------------------------------
   Un invito per azienda, un collegamento per azienda, una prima
   preferenza per azienda. Qui stanno le operazioni che hanno per
   soggetto l'impresa e non la persona: creare il suo documento
   all'invito, mostrarle cosa puo' scegliere, salvare le sue tre
   preferenze, e rifare ogni volta la copia sulle schede dei
   referenti.
========================================================= */

/* Il documento dell'azienda, creato o aggiornato all'invito. Referenti e
   aree si riscrivono per intero (l'invito nuovo dice la verita' nuova);
   coda ed esigenze NON si toccano: sono cose che ha scritto l'impresa, e un
   secondo invito non deve cancellarle. */
async function assicuraAzienda(db, evento, aziendaId, dati) {
    const ev = idEvento(evento);
    const id = String(aziendaId || '');
    if (!ev || !id) return { ok: false, msg: 'Azienda non riconosciuta.' };
    const d = dati || {};
    const rif = rifAzienda(db, ev, id);
    let esito = null;
    await db.runTransaction(async t => {
        const snap = await t.get(rif);
        const corrente = normalizzaAziendaB2B(snap.exists ? snap.data() : null, ev, id);
        const fuori = Object.assign({}, corrente, {
            evento: ev, id: id,
            nome: testo(d.nome, 200) || corrente.nome,
            chiave: testo(d.chiave, 200) || corrente.chiave,
            piva: testo(d.piva, 20) || corrente.piva,
            aree: Array.isArray(d.aree) && d.aree.length
                ? Array.from(new Set(d.aree.map(x => (areaDa(x) || {}).id).filter(Boolean)))
                : corrente.aree,
            referenti: Array.isArray(d.referenti) && d.referenti.length ? d.referenti : corrente.referenti,
            invito: {
                quando: Number(d.quando) || (corrente.invito && corrente.invito.quando) || Date.now(),
                da: testo(d.da, 200) || (corrente.invito && corrente.invito.da) || '',
                collab: testo(d.collab, 200) || (corrente.invito && corrente.invito.collab) || '',
                revocato: false
            },
            rev: (Number(corrente.rev) || 0) + 1,
            aggiornato: { quando: Date.now(), da: testo(d.da, 200) }
        });
        delete fuori.esiste;
        t.set(rif, fuori);
        esito = { ok: true, rev: fuori.rev };
    });
    return esito || { ok: false, msg: 'Azienda non salvata: riprovi fra un momento.' };
}

/* Chi sono i referenti di quest'azienda, ridotti a cio' che il modulo puo'
   mostrare: il nominativo si sceglie SOLO fra loro, quindi l'elenco e'
   anche la tendina. L'indirizzo non esce: serve a noi per scrivere, non a
   chi compila per mandare mail agli altri. */
function referentiPubblici(azienda) {
    return (azienda.referenti || []).map(r => ({ doc: r.doc, nome: r.nome, ruolo: r.ruolo }));
}
function referenteDi(azienda, doc) {
    return (azienda.referenti || []).filter(r => String(r.doc || '') === String(doc || ''))[0] || null;
}

/* QUELLO CHE VEDE CHI HA IL COLLEGAMENTO DELL'AZIENDA.
   Stessa riservatezza di sempre: gli orari si vedono liberi o occupati, mai
   con il nome di chi li ha presi. I propri si riconoscono - sono
   dell'AZIENDA, non della persona, e un referente deve vedere "nostro"
   anche l'orario che ha preso un collega. */
async function letturaAzienda(db, evento, aziendaId) {
    const ev = idEvento(evento);
    const agenda = await leggiAgenda(db, ev);
    const pren = await leggiPrenotazioni(db, ev);
    const azienda = await leggiAzienda(db, ev, aziendaId);
    const voci = await vociProgramma(db, ev) || [];
    const nostri = appuntamentiAzienda(pren, aziendaId);
    const primaN = nostri.filter(x => (Number(x.dati.scelta) || 1) === 1)[0] || null;
    /* I tavoli da mostrare: quelli dell'invito che sono ATTIVI, piu' quelli
       dove l'azienda ha gia' un incontro (anche se il tavolo e' stato spento
       nel frattempo: quell'incontro esiste, e nasconderlo manderebbe
       l'impresa a un tavolo che crede ancora suo). */
    const daMostrare = (azienda.aree.length ? azienda.aree : Object.keys(agenda.aree || {}))
        .filter(id => ((agenda.aree || {})[id] || {}).attiva === true);
    nostri.forEach(x => { if (daMostrare.indexOf(x.area) < 0) daMostrare.push(x.area); });
    const aree = daMostrare.map(id => {
        const cfg = (agenda.aree || {})[id] || areaVuota();
        const slot = slotDiArea(agenda, pren, id, voci);
        return {
            id: id, nome: nomeArea(id), nota: cfg.nota,
            referenti: cfg.referenti.map(r => ({ nome: r.nome, ruolo: r.ruolo, azienda: r.azienda })),
            slot: slot.map(s => {
                const suo = s.chi && String(s.chi.aziendaId || '') === String(aziendaId || '');
                return {
                    ora: s.ora, fine: s.fine, chiave: s.chiave,
                    stato: suo ? 'mio' : s.stato,
                    // di un orario nostro si dice per chi e', cosi' un collega
                    // che apre la pagina capisce cosa ha gia' fatto l'azienda
                    perChi: suo ? String(s.chi.perChi || '') : '',
                    scelta: suo ? (Number(s.chi.scelta) || 1) : 0
                };
            }),
            liberi: slot.filter(s => s.stato === 'libero').length
        };
    });
    return {
        modo: 'azienda',
        evento: agenda.eventoDati,
        giornata: agenda.giornata,
        azienda: { id: azienda.id, nome: azienda.nome },
        referenti: referentiPubblici(azienda),
        aree: aree,
        regole: regoleB2B(agenda.giornata),
        prima: primaN ? {
            area: primaN.area, areaNome: nomeArea(primaN.area), ora: primaN.ora,
            fine: String(primaN.dati.fine || ''), perChi: String(primaN.dati.perChi || ''),
            perDoc: String(primaN.dati.perDoc || ''), quando: Number(primaN.dati.quando) || 0
        } : null,
        // le seconde e terze GIA' assegnate: si vedono, e non si toccano piu'
        assegnati: nostri.filter(x => (Number(x.dati.scelta) || 1) > 1).map(x => ({
            area: x.area, areaNome: nomeArea(x.area), ora: x.ora, fine: String(x.dati.fine || ''),
            perChi: String(x.dati.perChi || ''), scelta: Number(x.dati.scelta) || 2
        })),
        coda: azienda.coda.map(c => ({
            id: c.id, pos: c.pos, area: c.area, areaNome: nomeArea(c.area),
            perChi: c.perChi, perDoc: c.perDoc, stato: c.stato,
            ora: c.assegnato ? c.assegnato.ora : ''
        })),
        esigenze: azienda.esigenze.map(e => ({
            id: e.id, perChi: e.perChi, perDoc: e.perDoc, testo: e.testo, stato: e.stato
        })),
        rev: azienda.rev,
        maxEsigenze: MAX_ESIGENZE,
        esaurito: aree.length > 0 && aree.every(a => !a.liberi) && !primaN
    };
}

/* IL SALVATAGGIO DELLE PREFERENZE (la seconda, la terza, le altre esigenze).
   La prima preferenza non passa di qui: quella prenota davvero uno slot, e
   vive nella transazione delle prenotazioni.
   Due guardie, e sono la stessa cosa vista da due lati:
     - la REVISIONE: il modulo viaggia intero, quindi due referenti che
       compilano insieme si sovrascriverebbero a vicenda. Chi salva con una
       revisione vecchia si sente dire che un collega ha appena cambiato le
       scelte, e rilegge invece di cancellargliele;
     - il LUCCHETTO: una preferenza che lo staff ha gia' assegnato non si
       tocca piu' dal modulo. Dall'altra parte c'e' un orario sul foglio del
       desk, e un risalvataggio distratto lo farebbe sparire in silenzio. */
async function salvaPreferenze(db, evento, aziendaId, dati) {
    const ev = idEvento(evento);
    const rif = rifAzienda(db, ev, aziendaId);
    const d = dati || {};
    let esito = null;
    await db.runTransaction(async t => {
        const snap = await t.get(rif);
        const corrente = normalizzaAziendaB2B(snap.exists ? snap.data() : null, ev, aziendaId);
        if (!corrente.esiste) { esito = { ok: false, motivo: 'azienda', msg: 'Azienda non riconosciuta.' }; return; }
        const revChiesta = Number(d.rev);
        if (revChiesta >= 0 && corrente.rev !== revChiesta) {
            esito = {
                ok: false, motivo: 'collega', rev: corrente.rev,
                msg: 'Un Suo collega ha appena cambiato le scelte dell\'azienda: ricarichi la pagina e le rivedrà, poi risalvi.'
            };
            return;
        }
        const bloccate = [];
        const coda = [];
        [2, 3].forEach(pos => {
            const gia = corrente.coda.filter(c => c.pos === pos)[0] || null;
            if (gia && gia.stato === 'assegnata') { bloccate.push(pos); coda.push(gia); return; }
            const arrivata = (Array.isArray(d.coda) ? d.coda : []).filter(c => Number(c.pos) === pos)[0];
            if (!arrivata || !areaDa(arrivata.area)) return;    // tolta: la si lascia fuori
            const ref = referenteDi(corrente, arrivata.perDoc);
            if (!ref) return;                                   // nominativo che non e' dei loro
            coda.push({
                id: (gia && gia.id) || ('c' + pos + '-' + Date.now()),
                pos: pos, area: (areaDa(arrivata.area) || {}).id,
                perChi: ref.nome, perRuolo: ref.ruolo, perDoc: ref.doc,
                quando: (gia && gia.quando) || Date.now(),
                stato: 'attesa', assegnato: null
            });
        });
        const esigenze = (Array.isArray(d.esigenze) ? d.esigenze : []).map((e, i) => {
            const ref = referenteDi(corrente, e && e.perDoc);
            const t2 = testo(e && e.testo, TESTO_ESIGENZA);
            if (!ref || !t2) return null;
            return {
                id: testo(e.id, 60) || ('e' + (i + 1) + '-' + Date.now()),
                perChi: ref.nome, perRuolo: ref.ruolo, perDoc: ref.doc,
                testo: t2, quando: Date.now(), stato: 'aperta'
            };
        }).filter(Boolean).slice(0, MAX_ESIGENZE);
        const fuori = Object.assign({}, corrente, {
            coda: coda, esigenze: esigenze,
            rev: corrente.rev + 1,
            aggiornato: { quando: Date.now(), da: testo(d.da, 200) }
        });
        delete fuori.esiste;
        t.set(rif, fuori);
        esito = { ok: true, rev: fuori.rev, bloccate: bloccate };
    });
    return esito || { ok: false, motivo: 'errore', msg: 'Scelte non salvate: riprovi fra un momento.' };
}

/* LA VOCE DI CODA SI PRENDE IN CARICO PRIMA DI TOCCARE LO SLOT.
   Coda e slot stanno in due documenti, e il 2 ottobre davanti allo stesso
   riepilogo ci saranno due persone. Se si assegnasse prima l'orario, il
   secondo operatore fisserebbe un secondo incontro alla stessa impresa
   senza saperlo. Passando prima da qui, il secondo si sente dire "gia'
   assegnata" e non succede niente. */
async function prendiCodaInCarico(db, evento, aziendaId, codaId, chi) {
    const ev = idEvento(evento);
    const rif = rifAzienda(db, ev, aziendaId);
    let esito = null;
    await db.runTransaction(async t => {
        const snap = await t.get(rif);
        const corrente = normalizzaAziendaB2B(snap.exists ? snap.data() : null, ev, aziendaId);
        const voce = corrente.coda.filter(c => c.id === String(codaId || ''))[0] || null;
        if (!voce) { esito = { ok: false, motivo: 'coda', msg: 'Questa preferenza non c\'è più: ricarichi il riepilogo.' }; return; }
        if (voce.stato === 'assegnata') {
            esito = { ok: false, motivo: 'gia-assegnata', msg: 'Questa preferenza è già stata assegnata da qualcun altro: ricarichi il riepilogo.' };
            return;
        }
        const coda = corrente.coda.map(c => c.id === voce.id
            ? Object.assign({}, c, { stato: 'assegnata', assegnato: { quando: Date.now(), da: testo(chi, 200) } })
            : c);
        const fuori = Object.assign({}, corrente, { coda: coda, rev: corrente.rev + 1, aggiornato: { quando: Date.now(), da: testo(chi, 200) } });
        delete fuori.esiste;
        t.set(rif, fuori);
        esito = { ok: true, voce: voce };
    });
    return esito || { ok: false, motivo: 'errore', msg: 'Operazione non riuscita.' };
}
/* Il passo indietro, quando l'orario non si e' potuto prendere: la voce
   torna in attesa, altrimenti resterebbe "assegnata" senza nessun orario -
   cioe' invisibile a chi assegna e assente dal foglio del desk. */
async function rilasciaCoda(db, evento, aziendaId, codaId, chi, stato) {
    const ev = idEvento(evento);
    const rif = rifAzienda(db, ev, aziendaId);
    const nuovo = (stato === 'scartata') ? 'scartata' : 'attesa';
    let esito = null;
    await db.runTransaction(async t => {
        const snap = await t.get(rif);
        const corrente = normalizzaAziendaB2B(snap.exists ? snap.data() : null, ev, aziendaId);
        const coda = corrente.coda.map(c => c.id === String(codaId || '')
            ? Object.assign({}, c, { stato: nuovo, assegnato: null }) : c);
        const fuori = Object.assign({}, corrente, { coda: coda, rev: corrente.rev + 1, aggiornato: { quando: Date.now(), da: testo(chi, 200) } });
        delete fuori.esiste;
        t.set(rif, fuori);
        esito = { ok: true };
    });
    return esito || { ok: false, msg: 'Operazione non riuscita.' };
}
/* La voce di coda che ha ottenuto un orario: si scrive DOVE, cosi' il
   riepilogo e il modulo lo mostrano senza rileggere gli slot. */
async function segnaCodaAssegnata(db, evento, aziendaId, codaId, dove, chi) {
    const ev = idEvento(evento);
    const rif = rifAzienda(db, ev, aziendaId);
    await db.runTransaction(async t => {
        const snap = await t.get(rif);
        const corrente = normalizzaAziendaB2B(snap.exists ? snap.data() : null, ev, aziendaId);
        const coda = corrente.coda.map(c => c.id === String(codaId || '')
            ? Object.assign({}, c, {
                stato: 'assegnata',
                assegnato: {
                    area: dove.area, chiave: dove.chiave, ora: dove.ora, fine: dove.fine,
                    quando: Date.now(), da: testo(chi, 200)
                }
            }) : c);
        const fuori = Object.assign({}, corrente, { coda: coda, rev: corrente.rev + 1, aggiornato: { quando: Date.now(), da: testo(chi, 200) } });
        delete fuori.esiste;
        t.set(rif, fuori);
    });
}

/* IL PROGRAMMA DELL'AZIENDA, RISCRITTO PER INTERO SU OGNI SCHEDA.
   Non si aggiusta: si rifa'. E' l'unico modo per non lasciare in giro la
   copia di un appuntamento che non c'e' piu' - quando uno slot si libera,
   la scheda di chi lo aveva resterebbe a dire che l'incontro esiste, e
   l'elenco mostrerebbe due prenotazioni per un posto solo.
   Su ciascuna scheda: `b2bAppuntamento` e' l'incontro di QUELLA persona
   (quello dove il nominativo e' lei); `b2bScelte` sono i tavoli
   dell'AZIENDA, perche' la colonna "B2B prenotati" ora racconta l'impresa. */
async function scriviProgrammaAzienda(db, evento, aziendaId) {
    const ev = idEvento(evento);
    const azienda = await leggiAzienda(db, ev, aziendaId);
    const pren = await leggiPrenotazioni(db, ev);
    const nostri = appuntamentiAzienda(pren, aziendaId);
    const incontri = nostri.map(x => ({
        area: x.area, areaNome: nomeArea(x.area), ora: x.ora, fine: String(x.dati.fine || ''),
        orario: fraseOrario(x.ora, String(x.dati.fine || '')),
        perChi: String(x.dati.perChi || ''), perDoc: String(x.dati.perDoc || ''),
        scelta: Number(x.dati.scelta) || 1
    }));
    const attesa = azienda.coda.filter(c => c.stato === 'attesa').map(c => ({
        area: c.area, areaNome: nomeArea(c.area), pos: c.pos, perChi: c.perChi
    }));
    const programma = {
        evento: ev, quando: Date.now(), incontri: incontri, attesa: attesa,
        esigenze: azienda.esigenze.length
    };
    const scelte = Array.from(new Set(incontri.map(i => i.areaNome)));
    const referenti = (azienda.referenti || []).filter(r => r.doc);
    for (let i = 0; i < referenti.length; i++) {
        const mio = incontri.filter(x => String(x.perDoc || '') === String(referenti[i].doc))[0] || null;
        const patch = {
            b2bProgramma: programma,
            b2bScelte: scelte,
            b2bAppuntamento: mio ? {
                evento: ev, area: mio.area, areaNome: mio.areaNome, ora: mio.ora, fine: mio.fine,
                orario: mio.orario, quando: Date.now()
            } : null
        };
        if (incontri.length) patch.incontro = 'si';
        try {
            await db.collection('iscrizioni').doc(String(referenti[i].doc)).set(patch, { merge: true });
        } catch (e) {
            console.error('Programma B2B non scritto sulla scheda:', String((e && e.message) || e).slice(0, 200));
        }
    }
    return { incontri: incontri, attesa: attesa, azienda: azienda };
}

/* LA CONFERMA ALL'AZIENDA: una mail sola, a tutti i referenti insieme.
   Una per referente vorrebbe dire quattro mail identiche, quattro allegati
   e quattro volte il tempo di una funzione che ne ha trenta secondi in
   tutto; e chi legge non saprebbe che anche gli altri l'hanno ricevuta.
   `motivo` dice perche' parte: una prenotazione nuova, uno spostamento
   deciso da noi, una preferenza assegnata, un incontro tolto. */
async function inviaConfermaAzienda(db, evento, aziendaId, motivo) {
    const ev = idEvento(evento);
    const agenda = await leggiAgenda(db, ev);
    const azienda = await leggiAzienda(db, ev, aziendaId);
    const pren = await leggiPrenotazioni(db, ev);
    const nostri = appuntamentiAzienda(pren, aziendaId);
    const a = Array.from(new Set((azienda.referenti || [])
        .map(r => String(r.email || '').toLowerCase())
        .filter(x => x && EMAIL_RE.test(x))));
    if (!a.length) return { ok: false, a: [] };
    const evd = agenda.eventoDati || {};
    const dati = {
        nome: azienda.nome, azienda: azienda.nome, ruolo: '',
        pagina: String(evd.pagina || ''),
        referenti: (azienda.referenti || []).map(r => r.nome + (r.ruolo ? ' (' + r.ruolo + ')' : '')),
        evento: {
            titolo: String(evd.titolo || '') || 'Next Generation Business',
            quando: String(evd.quando || ''), luogo: String(evd.luogo || ''), indirizzo: String(evd.indirizzo || '')
        },
        tavoli: nostri.map(x => {
            const cfg = (agenda.aree || {})[x.area] || areaVuota();
            return {
                nome: nomeArea(x.area),
                orario: fraseOrario(x.ora, String(x.dati.fine || '')),
                con: cfg.referenti.map(r => r.nome + (r.ruolo ? ' (' + r.ruolo + ')' : '')).join(', '),
                perChi: String(x.dati.perChi || ''), perRuolo: String(x.dati.perRuolo || ''),
                prenotatoDa: String(x.dati.nome || ''),
                scelta: Number(x.dati.scelta) || 1
            };
        }),
        coda: azienda.coda.filter(c => c.stato === 'attesa')
            .map(c => ({ nome: nomeArea(c.area), pos: c.pos, perChi: c.perChi })),
        esigenze: azienda.esigenze.map(e => ({ testo: e.testo, perChi: e.perChi })),
        motivo: String(motivo || 'prenotazione')
    };
    const link = NL.linkB2BAzienda(ev, aziendaId);
    const m = MNGB.confermaB2BAzienda(dati, link);
    const trans = trasporto();
    const messaggio = {
        from: mittenteMail(), to: a.join(', '), subject: m.oggetto, text: m.testo, html: m.html
    };
    // senza incontri non c'e' foglio da presentare: allegare una pagina vuota
    // sarebbe peggio di non allegarla
    if (dati.tavoli.length) {
        const foglio = PDF.pdfPrenotazione(Object.assign({}, dati, { emessoIl: quandoInItalia() }));
        messaggio.attachments = [{ filename: nomeFileFoglio(azienda.nome), content: foglio, contentType: 'application/pdf' }];
    }
    await trans.sendMail(messaggio);
    try { trans.close(); } catch (e) { /* niente */ }
    return { ok: true, a: a };
}

/* =========================================================
   L'APPUNTAMENTO SCRITTO SULLA SCHEDA DELL'ISCRITTO
   ------------------------------------------------------------
   La prenotazione vera vive nel documento degli slot, dove la
   transazione la difende. Sulla scheda se ne scrive la copia: e'
   quella che l'elenco dell'area riservata mostra accanto alla
   persona, senza dover leggere un secondo archivio per ogni riga.
   `b2bScelte` si tiene allineato perche' e' la colonna "B2B
   prenotati" che c'era gia': chi guarda l'elenco non deve imparare
   un posto nuovo dove cercare la stessa cosa.
========================================================= */
async function scriviAppuntamento(db, idDoc, app, nota) {
    const patch = {
        b2bAppuntamento: {
            evento: idEvento(app.evento), area: app.area, areaNome: app.areaNome || nomeArea(app.area),
            ora: app.ora, fine: app.fine, orario: fraseOrario(app.ora, app.fine),
            quando: Date.now()
        },
        b2bScelte: [app.areaNome || nomeArea(app.area)],
        incontro: 'si',
        b2bRisposta: { quando: Date.now(), temi: 1 }
    };
    if (typeof nota === 'string') patch.extra = { 'Nota B2B': testo(nota, 800) };
    await db.collection('iscrizioni').doc(String(idDoc)).set(patch, { merge: true });
}
/* Appuntamento tolto: si azzera invece di cancellare il campo, cosi' non
   serve la sentinella di Firestore e chi legge trova un "no" esplicito
   dove prima c'era un orario. `incontro` resta com'e': dice che l'impresa
   gli incontri li voleva, ed e' vero anche dopo una disdetta. */
async function azzeraAppuntamento(db, idDoc) {
    await db.collection('iscrizioni').doc(String(idDoc)).set({
        b2bAppuntamento: null, b2bScelte: []
    }, { merge: true });
}

/* =========================================================
   LE AZIONI DELL'AREA RISERVATA (sezione: 'b2b')
   ------------------------------------------------------------
   Leggere l'agenda la puo' chiunque veda la sezione Eventi:
   sapere chi tiene un tavolo e quanti posti restano serve a tutti
   quelli che il giorno del convegno stanno al desk. Cambiarla -
   referenti, orari chiusi, assegnazioni - no: quella e' la stessa
   mano che manda gli inviti (amministratore, equity e founding
   partner), perche' chiudere uno slot o liberare un posto disfa
   una convocazione gia' partita.
========================================================= */
function gestisce(body) { return !!(body && String(body.sezione || '') === 'b2b'); }

async function esegui(ctx) {
    const db = ctx.db;
    const body = ctx.body || {};
    const azione = String(body.azione || 'agenda');
    const evento = idEvento(body.evento);
    const chi = String(ctx.email || '');
    const puoGestire = !!ctx.eAdmin || !!ctx.ePartner;
    const negato = () => ({
        stato: 403,
        corpo: { ok: false, msg: 'Possono organizzare gli incontri B2B l\'amministratore, gli equity partner e i founding partner.' }
    });
    if (!evento) return { stato: 400, corpo: { ok: false, msg: 'Evento mancante.' } };

    /* --- l'agenda intera: configurazione, slot presi e richieste ---
       Si risponde con lo stato GIA' COMPOSTO (slot per slot, con chi lo
       occupa) invece di mandare i due archivi grezzi: il calcolo di quali
       orari esistono dipende dalla durata e dalla pausa, e farlo due volte
       - qui e nel browser - vuol dire vederlo divergere il giorno in cui
       qualcuno cambia la durata. */
    if (azione === 'agenda') {
        const agenda = await leggiAgenda(db, evento);
        const pren = await leggiPrenotazioni(db, evento);
        const aree = areeComposte(agenda, pren, await vociProgramma(db, evento) || []);
        return {
            stato: 200,
            corpo: {
                ok: true, evento: evento, eventoDati: agenda.eventoDati,
                giornata: agenda.giornata, aggiornato: agenda.aggiornato,
                aree: aree, richieste: pren.richieste || []
            }
        };
    }


    /* --- IL RIEPILOGO GENERALE: tutto quello che serve per lavorare i tavoli
       Una lettura sola, gia' composta: per ogni tavolo gli orari con dentro
       chi viene, in coda le seconde e terze preferenze che aspettano, e da
       parte le altre esigenze - che non sono incontri e non devono stare in
       mezzo agli incontri. I conti in cima dicono cosa manca ancora, perche'
       il giorno prima del convegno la domanda non e' "com'e' andata" ma
       "cosa devo ancora fare". */
    if (azione === 'riepilogo') {
        const agenda = await leggiAgenda(db, evento);
        const pren = await leggiPrenotazioni(db, evento);
        const voci = await vociProgramma(db, evento) || [];
        const aziende = await leggiAziendeB2B(db, evento);
        const aree = areeComposte(agenda, pren, voci);
        const conIncontro = {};
        aree.forEach(a => a.slot.forEach(sl => {
            if (sl.chi && sl.chi.aziendaId) conIncontro[sl.chi.aziendaId] = (conIncontro[sl.chi.aziendaId] || 0) + 1;
        }));
        const desk = aree.map(a => ({
            id: a.id, nome: a.nome, attiva: a.attiva, nota: a.nota,
            referenti: a.referenti.map(r => ({ nome: r.nome, ruolo: r.ruolo, azienda: r.azienda })),
            liberi: a.liberi, occupati: a.occupati,
            slot: a.slot,
            /* LA CODA DI QUESTO TAVOLO: le preferenze che aspettano un orario,
               marcate 2a o 3a. `haGiaUnIncontro` e' il criterio con cui si
               mettono in fila duecento decisioni prese a mano: chi non ha
               ancora niente viene prima di chi ha gia' un tavolo. */
            coda: aziende.reduce((fuori, az) => {
                az.coda.forEach(c => {
                    if (c.area !== a.id || c.stato !== 'attesa') return;
                    fuori.push({
                        id: c.id, pos: c.pos, aziendaId: az.id, aziendaNome: az.nome,
                        perChi: c.perChi, perRuolo: c.perRuolo, perDoc: c.perDoc,
                        quando: c.quando, haGiaUnIncontro: !!conIncontro[az.id],
                        referenti: (az.referenti || []).map(r => ({ nome: r.nome, email: r.email, telefono: r.telefono }))
                    });
                });
                return fuori;
            }, []).sort((x, y) => (x.haGiaUnIncontro === y.haGiaUnIncontro)
                ? (x.pos - y.pos) || (x.quando - y.quando)
                : (x.haGiaUnIncontro ? 1 : -1))
        }));
        const esigenze = [];
        aziende.forEach(az => az.esigenze.forEach(e => esigenze.push({
            id: e.id, aziendaId: az.id, aziendaNome: az.nome,
            perChi: e.perChi, perRuolo: e.perRuolo, testo: e.testo,
            quando: e.quando, stato: e.stato,
            referenti: (az.referenti || []).map(r => ({ nome: r.nome, email: r.email, telefono: r.telefono }))
        })));
        const codaTotale = desk.reduce((n, d) => n + d.coda.length, 0);
        return {
            stato: 200,
            corpo: {
                ok: true, evento: evento, eventoDati: agenda.eventoDati, giornata: agenda.giornata,
                desk: desk, esigenze: esigenze, richieste: pren.richieste || [],
                aziende: aziende.map(az => ({
                    id: az.id, nome: az.nome, piva: az.piva,
                    referenti: az.referenti, incontri: conIncontro[az.id] || 0,
                    coda: az.coda.length, esigenze: az.esigenze.length,
                    invito: az.invito, link: NL.linkB2BAzienda(evento, az.id)
                })),
                conti: {
                    aziende: aziende.length,
                    senzaIncontro: aziende.filter(az => !conIncontro[az.id]).length,
                    codaDaAssegnare: codaTotale,
                    esigenzeAperte: esigenze.filter(e => e.stato === 'aperta').length,
                    liberi: desk.reduce((n, d) => n + (d.attiva ? d.liberi : 0), 0),
                    occupati: desk.reduce((n, d) => n + d.occupati, 0)
                }
            }
        };
    }

    if (!puoGestire) return negato();

    /* --- SPOSTARE UN INCONTRO (anche fra i due tavoli gemelli)
       Si parte dallo slot, non dalla persona: un'azienda puo' avere due
       incontri, e "quello dell'azienda" non direbbe quale. Dentro la
       transazione si verifica che in partenza ci sia ancora chi credevamo,
       perche' fra quando il riepilogo e' stato disegnato e quando qualcuno
       preme possono essere passati dieci minuti - e la mattina del convegno
       davanti a quel riepilogo ci sono due persone. */
    if (azione === 'b2b-sposta') {
        const daArea = (areaDa(body.daArea) || {}).id || '';
        const daChiave = chiaveSlot(oraDaChiave(body.daChiave || '')) || chiaveSlot(body.daOra);
        const aArea = (areaDa(body.aArea) || {}).id || daArea;
        const aChiave = chiaveSlot(oraDaChiave(body.aChiave || '')) || chiaveSlot(body.aOra);
        if (!daArea || !daChiave || !aArea || !aChiave) {
            return { stato: 400, corpo: { ok: false, msg: 'Orario di partenza o di arrivo mancante.' } };
        }
        const pren = await leggiPrenotazioni(db, evento);
        const partenza = M.slotDi(pren, daArea, daChiave);
        if (!partenza) return { stato: 409, corpo: { ok: false, motivo: 'sparito', msg: 'Quell\'incontro non c\'è più: ricarichi il riepilogo.' } };
        const persona = partenza.dati || {};
        const preso = await prendiSlot(db, {
            evento: evento, area: aArea, chiave: aChiave, da: chi,
            scelta: Number(persona.scelta) || 1, codaId: String(persona.codaId || ''),
            forzato: body.forzato === true, slotDa: { area: daArea, chiave: daChiave },
            persona: persona
        });
        if (!preso.ok) return { stato: 409, corpo: preso };
        const azId = String(persona.aziendaId || '');
        if (azId) {
            if (persona.codaId) {
                try {
                    await segnaCodaAssegnata(db, evento, azId, persona.codaId,
                        { area: aArea, chiave: aChiave, ora: preso.ora, fine: preso.fine }, chi);
                } catch (_) { /* l'orario e' preso: e' quello che conta */ }
            }
            try { await scriviProgrammaAzienda(db, evento, azId); } catch (_) { /* la copia si rifara' */ }
            if (body.avvisa !== false) {
                try {
                    const inv = await inviaConfermaAzienda(db, evento, azId, 'spostamento');
                    preso.avvisati = inv.a || [];
                } catch (e) {
                    preso.avvisati = [];
                    preso.avvisoNonPartito = String((e && e.message) || e).slice(0, 200);
                }
            }
        } else if (persona.doc) {
            try { await scriviAppuntamento(db, persona.doc, Object.assign({ evento: evento }, preso), undefined); } catch (_) { /* niente */ }
        }
        if (ctx.segnaCambiamento) { try { await ctx.segnaCambiamento(db); } catch (_) { /* la lettura scade comunque */ } }
        return { stato: 200, corpo: preso };
    }

    /* --- ASSEGNARE UNA SECONDA O TERZA PREFERENZA
       L'ordine non e' negoziabile: PRIMA si prende in carico la voce di coda
       (che passa ad "assegnata" solo se era ancora "in attesa"), POI si
       prende l'orario. Al contrario, due operatori davanti allo stesso
       riepilogo fisserebbero due incontri alla stessa impresa.
       I controlli restano ACCESI - tavolo attivo, orario non chiuso,
       referente non sul palco: assegnare e' una decisione presa a freddo, e
       fissare un incontro mentre chi tiene il tavolo e' sul palco sarebbe un
       appuntamento che nessuno puo' onorare. Si puo' forzare dicendolo. */
    if (azione === 'coda-assegna') {
        const azId = testo(body.aziendaId, 40);
        const codaId = testo(body.codaId, 60);
        if (!azId || !codaId) return { stato: 400, corpo: { ok: false, msg: 'Preferenza non indicata.' } };
        const presa = await prendiCodaInCarico(db, evento, azId, codaId, chi);
        if (!presa.ok) return { stato: 409, corpo: presa };
        const voce = presa.voce;
        const azienda = await leggiAzienda(db, evento, azId);
        const ref = referenteDi(azienda, voce.perDoc) || (azienda.referenti || [])[0] || {};
        const area = (areaDa(body.area) || {}).id || voce.area;
        const chiave = chiaveSlot(oraDaChiave(body.chiave || '')) || chiaveSlot(body.ora);
        const preso = chiave ? await prendiSlot(db, {
            evento: evento, area: area, chiave: chiave, da: chi,
            scelta: voce.pos, codaId: voce.id, forzato: body.forzato === true,
            persona: {
                doc: ref.doc, nome: ref.nome, email: ref.email, telefono: ref.telefono, ruolo: ref.ruolo,
                azienda: azienda.nome, aziendaId: azId, aziendaNome: azienda.nome,
                perChi: voce.perChi, perRuolo: voce.perRuolo, perDoc: voce.perDoc
            }
        }) : { ok: false, motivo: 'orario', msg: 'Orario non indicato.' };
        if (!preso.ok) {
            // la voce torna in attesa: "assegnata" senza orario non la vedrebbe piu' nessuno
            try { await rilasciaCoda(db, evento, azId, codaId, chi, 'attesa'); } catch (_) { /* niente */ }
            return { stato: 409, corpo: preso };
        }
        try {
            await segnaCodaAssegnata(db, evento, azId, codaId,
                { area: area, chiave: chiave, ora: preso.ora, fine: preso.fine }, chi);
        } catch (_) { /* l'orario e' preso: e' quello che conta */ }
        try { await scriviProgrammaAzienda(db, evento, azId); } catch (_) { /* la copia si rifara' */ }
        if (body.avvisa !== false) {
            try {
                const inv = await inviaConfermaAzienda(db, evento, azId, 'assegnazione');
                preso.avvisati = inv.a || [];
            } catch (e) {
                preso.avvisati = [];
                preso.avvisoNonPartito = String((e && e.message) || e).slice(0, 200);
            }
        }
        if (ctx.segnaCambiamento) { try { await ctx.segnaCambiamento(db); } catch (_) { /* la lettura scade comunque */ } }
        return { stato: 200, corpo: Object.assign({ pos: voce.pos, aziendaId: azId }, preso) };
    }

    /* Scartare una preferenza che non si riesce ad assegnare: resta scritta
       (scartata, non sparita) perche' il giorno dopo qualcuno chiedera'
       perche' quell'impresa non ha avuto il suo secondo incontro. Non parte
       nessuna mail: e' una cosa che si dice a voce, e l'abbiamo deciso. */
    if (azione === 'coda-scarta') {
        const azId = testo(body.aziendaId, 40);
        const codaId = testo(body.codaId, 60);
        if (!azId || !codaId) return { stato: 400, corpo: { ok: false, msg: 'Preferenza non indicata.' } };
        const r = await rilasciaCoda(db, evento, azId, codaId, chi, body.stato === 'attesa' ? 'attesa' : 'scartata');
        if (!r.ok) return { stato: 409, corpo: r };
        try { await scriviProgrammaAzienda(db, evento, azId); } catch (_) { /* la copia si rifara' */ }
        return { stato: 200, corpo: r };
    }

    /* Un'altra esigenza segnata come gestita: sparisce dal "cosa manca"
       senza sparire dall'elenco. */
    if (azione === 'esigenza-segna') {
        const azId = testo(body.aziendaId, 40);
        const eId = testo(body.esigenzaId, 60);
        if (!azId || !eId) return { stato: 400, corpo: { ok: false, msg: 'Esigenza non indicata.' } };
        const rif = rifAzienda(db, evento, azId);
        let fatto = false;
        await db.runTransaction(async t => {
            const snap = await t.get(rif);
            const corrente = M.normalizzaAziendaB2B(snap.exists ? snap.data() : null, evento, azId);
            if (!corrente.esiste) return;
            const esigenze = corrente.esigenze.map(e => e.id === eId
                ? Object.assign({}, e, { stato: body.stato === 'aperta' ? 'aperta' : 'gestita' }) : e);
            const fuori = Object.assign({}, corrente, {
                esigenze: esigenze, rev: corrente.rev + 1,
                aggiornato: { quando: Date.now(), da: chi }
            });
            delete fuori.esiste;
            t.set(rif, fuori);
            fatto = true;
        });
        return fatto ? { stato: 200, corpo: { ok: true } } : { stato: 404, corpo: { ok: false, msg: 'Azienda non trovata.' } };
    }

    /* --- salvataggio della configurazione ---
       Le aree arrivano una alla volta (chi modifica sta guardando quella):
       si riscrivono SOLO quelle presenti nella richiesta, cosi' due
       persone che lavorano su due tavoli diversi non si cancellano il
       lavoro a vicenda. */
    if (azione === 'agenda-salva') {
        const corrente = await leggiAgenda(db, evento);
        const giornata = (body.giornata && typeof body.giornata === 'object')
            ? normalizzaGiornata(body.giornata) : corrente.giornata;
        const areeDentro = (body.aree && typeof body.aree === 'object') ? body.aree : {};
        const unite = Object.assign({}, corrente.aree);
        Object.keys(areeDentro).forEach(id => {
            if (!areaDa(id)) return;
            unite[id] = areeDentro[id];
        });
        const ev = (body.eventoDati && typeof body.eventoDati === 'object') ? body.eventoDati : corrente.eventoDati;
        const agenda = normalizzaAgenda({
            evento: evento, eventoDati: ev, giornata: giornata, aree: unite
        }, evento);
        /* Si guarda PRIMA di scrivere: un orario gia' preso non si chiude,
           un tavolo con prenotazioni non si spegne e la giornata non cambia
           forma sotto i piedi di chi ha gia' un appuntamento (vedi
           bloccoSuPrenotazioni). */
        const pren = await leggiPrenotazioni(db, evento);
        const bloccato = bloccoSuPrenotazioni(corrente, agenda.giornata, agenda.aree, pren);
        if (bloccato) return { stato: 409, corpo: { ok: false, motivo: 'prenotato', msg: bloccato } };
        agenda.aggiornato = { quando: Date.now(), da: chi, collab: String(ctx.collab || '') };
        await rifAgenda(db, evento).set(agenda);
        /* Si risponde con l'agenda rifatta e non con un "ok": la
           normalizzazione puo' aver tolto qualcosa (uno slot chiuso che non
           esiste piu' con la durata nuova), e chi ha salvato deve vedere
           com'e' rimasta, non com'era sul suo schermo. */
        return {
            stato: 200,
            corpo: {
                ok: true, giornata: agenda.giornata, aggiornato: agenda.aggiornato,
                aree: areeComposte(agenda, pren, await vociProgramma(db, evento) || [])
            }
        };
    }

    /* --- assegnare un orario a una persona ---
       E' la risposta alla richiesta di chi ha trovato tutto esaurito, ed e'
       anche il modo di sistemare un cambio deciso al telefono. Con
       `forzato` si puo' usare anche uno slot chiuso o un tavolo spento: e'
       una decisione di chi organizza, non un errore da impedire. La
       persona riceve la stessa mail con il foglio per il desk che avrebbe
       ricevuto prenotando da se': se non lo sapesse, l'orario esisterebbe
       solo nella nostra agenda. */
    if (azione === 'agenda-assegna') {
        const idDoc = testo(body.doc, 400);
        if (!idDoc) return { stato: 400, corpo: { ok: false, msg: 'Scheda mancante.' } };
        const snap = await db.collection('iscrizioni').doc(idDoc).get();
        if (!snap.exists) return { stato: 404, corpo: { ok: false, msg: 'Scheda non trovata.' } };
        const scheda = snap.data() || {};
        const preso = await prendiSlot(db, {
            evento: evento, area: body.area, ora: body.ora, chiave: body.chiave,
            forzato: true, da: chi,
            persona: {
                doc: idDoc, id: testo(scheda.idIscritto, 300),
                nome: ((String(scheda.nome || '') + ' ' + String(scheda.cognome || '')).trim()),
                azienda: String(scheda.azienda || ''), ruolo: String(scheda.ruolo || ''),
                email: String(scheda.email || ''), telefono: String(scheda.telefono || ''),
                nota: String((scheda.extra && scheda.extra['Nota B2B']) || '')
            }
        });
        if (!preso.ok) return { stato: 409, corpo: preso };
        await scriviAppuntamento(db, idDoc, Object.assign({ evento: evento }, preso));
        if (ctx.segnaCambiamento) { try { await ctx.segnaCambiamento(db); } catch (_) { /* la lettura scade comunque */ } }
        let mail = false;
        if (body.avvisa !== false) {
            try {
                const agenda = await leggiAgenda(db, evento);
                mail = await inviaConferma(scheda, idDoc, agenda, preso);
            } catch (e) {
                console.error('Conferma appuntamento B2B non inviata:', String((e && e.message) || e).slice(0, 200));
            }
        }
        return { stato: 200, corpo: Object.assign({}, preso, { mailInviata: mail }) };
    }

    /* --- liberare l'orario di una persona ---
       Non si avvisa nessuno: e' un gesto che si fa DOPO aver parlato con
       l'impresa (ha disdetto, si e' spostata), e una mail automatica
       arriverebbe come una revoca decisa da noi. */
    /* --- liberare un orario ---
       Era il gesto MUTO del sistema: si liberava e si avvisava l'impresa a
       voce, perche' chi lo faceva aveva appena parlato con lei. Con l'invito
       d'azienda non regge piu': il collegamento ce l'hanno in quattro, e chi
       ha parlato al telefono non ha parlato con gli altri tre. Quindi ora
       parte una mail - a tutti i referenti - che dice che quell'incontro non
       c'e' piu' e come riprenotarne un altro. Si puo' zittire caso per caso
       con `avvisa: false`, perche' a volte l'impresa la si e' gia' sentita. */
    if (azione === 'agenda-libera') {
        const idDoc = testo(body.doc, 400);
        const slotDa = (body.area && (body.chiave || body.ora))
            ? { area: (areaDa(body.area) || {}).id || '', chiave: chiaveSlot(body.ora) || chiaveSlot(oraDaChiave(body.chiave || '')) }
            : null;
        if (!idDoc && !(slotDa && slotDa.area && slotDa.chiave)) {
            return { stato: 400, corpo: { ok: false, msg: 'Scheda o orario mancante.' } };
        }
        const r = await liberaSlot(db, evento, idDoc, chi, slotDa);
        if (!r.ok) return { stato: 409, corpo: r };
        const liberata = r.chi || {};
        const azId = String(liberata.aziendaId || '');
        if (azId) {
            // la copia sulle schede si rifa' per intero: cosi' l'incontro tolto
            // sparisce da tutte, e non resta a dire che esiste ancora
            try { await scriviProgrammaAzienda(db, evento, azId); } catch (_) { /* lo slot e' libero: e' quello che conta */ }
            if (body.avvisa !== false) {
                try {
                    const inv = await inviaConfermaAzienda(db, evento, azId, 'disdetta');
                    r.avvisati = inv.a || [];
                } catch (e) {
                    r.avvisati = [];
                    r.avvisoNonPartito = String((e && e.message) || e).slice(0, 200);
                }
            }
        } else if (idDoc) {
            try { await azzeraAppuntamento(db, idDoc); } catch (_) { /* lo slot e' gia' libero: e' quello che conta */ }
        }
        if (ctx.segnaCambiamento) { try { await ctx.segnaCambiamento(db); } catch (_) { /* la lettura scade comunque */ } }
        return { stato: 200, corpo: r };
    }

    // --- una richiesta fuori slot: gestita, riaperta, oppure tolta ---
    if (azione === 'agenda-richiesta') {
        const idDoc = testo(body.doc, 400);
        const stato = testo(body.stato, 20);
        if (!idDoc) return { stato: 400, corpo: { ok: false, msg: 'Richiesta mancante.' } };
        if (['aperta', 'gestita', 'tolta'].indexOf(stato) < 0) {
            return { stato: 400, corpo: { ok: false, msg: 'Stato non riconosciuto.' } };
        }
        const r = await segnaRichiesta(db, evento, idDoc, stato, chi);
        return { stato: r.ok ? 200 : 404, corpo: r };
    }

    return { stato: 400, corpo: { ok: false, msg: 'Azione non riconosciuta.' } };
}

module.exports = {
    // il modello
    GIORNATA_PREDEFINITA, AREE_B2B, areaVuota,
    oraValida, minutiOra, oraDaMinuti, chiaveSlot, oraDaChiave, fraseOrario,
    normalizzaGiornata, slotDellaGiornata, normalizzaAgenda, normalizzaPrenotazioni,
    idEvento, rifAgenda, rifPrenotazioni, leggiAgenda, leggiPrenotazioni,
    slotDiArea, areeComposte, appuntamentoDi, areeInvitate, eventoInvito, invitoASlot,
    orariPresi, bloccoSuPrenotazioni,
    // le operazioni
    prendiSlot, liberaSlot, chiediFuoriSlot, segnaRichiesta,
    letturaOspite, inviaConferma, avvisaRichiesta,
    // gli incontri di un'azienda
    rifAzienda, leggiAzienda, leggiAziendeB2B, regoleB2B, appuntamentiAzienda,
    assicuraAzienda, letturaAzienda, salvaPreferenze,
    prendiCodaInCarico, rilasciaCoda, segnaCodaAssegnata,
    scriviProgrammaAzienda, inviaConfermaAzienda, referenteDi,
    scriviAppuntamento, azzeraAppuntamento,
    quandoInItalia, nomeFileFoglio,
    // l'area riservata
    gestisce, esegui
};
