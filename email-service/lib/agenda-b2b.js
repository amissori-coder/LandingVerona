/* ============================================================
   L'AGENDA DEGLI INCONTRI B2B: aree, referenti, slot, prenotazioni
   ------------------------------------------------------------
   Gli incontri B2B non sono piu' un tavolo per argomento con
   un'ora sola per tutti: sono APPUNTAMENTI. La giornata di
   ciascun'area (i nove argomenti del convegno piu' il desk Revilaw
   e la revisione legale) e' divisa in slot - dalle 10 alle 18, con
   la pausa pranzo fuori - e chi riceve l'invito ne prenota UNO.

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
    slotDiArea, areeComposte, appuntamentoDi,
    orariPresi, chiDiSlot, bloccoSuPrenotazioni
} = M;

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
        const slot = slotDiArea(agenda, pren, id);
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
    }
    const p = dati.persona || {};
    const persona = {
        doc: testo(p.doc, 400), id: testo(p.id, 300),
        nome: testo(p.nome, 160), azienda: testo(p.azienda, 200),
        ruolo: testo(p.ruolo, 160), email: testo(p.email, 200).toLowerCase(),
        telefono: testo(p.telefono, 60), nota: testo(p.nota, 800),
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
        if (preso && String(preso.doc || '') !== persona.doc) {
            esito = { ok: false, motivo: 'occupato', msg: 'Quell\'orario e stato appena prenotato da qualcun altro: ne scelga un altro.' };
            return;
        }
        // il posto che aveva prima (ovunque fosse) si libera: uno solo per persona
        const prima = appuntamentoDi(corrente, persona.doc);
        const aree = Object.assign({}, corrente.aree);
        if (prima) {
            aree[prima.area] = Object.assign({}, aree[prima.area]);
            delete aree[prima.area][prima.chiave];
        }
        aree[areaId] = Object.assign({}, aree[areaId] || {});
        aree[areaId][chiave] = persona;
        /* La richiesta fuori slot, se ce n'era una di questa persona, si
           chiude da se': ha ottenuto l'incontro, e lasciarla aperta
           manderebbe lo staff a cercare un posto per chi ce l'ha gia'. */
        const richieste = (corrente.richieste || []).filter(r => String(r.doc || '') !== persona.doc);
        t.set(rif, {
            evento: evento, aree: aree, richieste: richieste,
            aggiornato: { quando: Date.now(), da: testo(dati.da, 200) || persona.email }
        });
        esito = {
            ok: true, area: areaId, areaNome: nomeArea(areaId),
            ora: slot.ora, fine: slot.fine, orario: fraseOrario(slot.ora, slot.fine),
            liberato: prima ? { area: prima.area, ora: prima.ora } : null
        };
    });
    return esito || { ok: false, motivo: 'errore', msg: 'Prenotazione non riuscita: riprovi fra un momento.' };
}

/* Liberare lo slot di una persona: lo fa lo staff dall'area riservata
   quando l'ospite non viene piu'. Torna quello che ha liberato, cosi'
   chi chiama puo' ripulire anche la scheda. */
async function liberaSlot(db, evento, idDoc, chi) {
    const ev = idEvento(evento);
    const rif = rifPrenotazioni(db, ev);
    let esito = null;
    await db.runTransaction(async t => {
        const snap = await t.get(rif);
        const corrente = normalizzaPrenotazioni(snap.exists ? snap.data() : null, ev);
        const mio = appuntamentoDi(corrente, idDoc);
        if (!mio) { esito = { ok: false, msg: 'Nessun incontro prenotato per questa persona.' }; return; }
        const aree = Object.assign({}, corrente.aree);
        aree[mio.area] = Object.assign({}, aree[mio.area]);
        delete aree[mio.area][mio.chiave];
        t.set(rif, {
            evento: ev, aree: aree, richieste: corrente.richieste || [],
            aggiornato: { quando: Date.now(), da: testo(chi, 200) }
        });
        esito = { ok: true, area: mio.area, areaNome: nomeArea(mio.area), ora: mio.ora };
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
        const altre = (corrente.richieste || []).filter(r => String(r.doc || '') !== voce.doc);
        const richieste = altre.concat([voce]).slice(-MAX_RICHIESTE);
        t.set(rif, {
            evento: evento, aree: corrente.aree || {}, richieste: richieste,
            aggiornato: { quando: Date.now(), da: voce.email }
        });
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
        t.set(rif, {
            evento: ev, aree: corrente.aree || {}, richieste: richieste,
            aggiornato: { quando: Date.now(), da: testo(chi, 200) }
        });
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
        const aree = areeComposte(agenda, pren);
        return {
            stato: 200,
            corpo: {
                ok: true, evento: evento, eventoDati: agenda.eventoDati,
                giornata: agenda.giornata, aggiornato: agenda.aggiornato,
                aree: aree, richieste: pren.richieste || []
            }
        };
    }

    if (!puoGestire) return negato();

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
                aree: areeComposte(agenda, pren)
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
    if (azione === 'agenda-libera') {
        const idDoc = testo(body.doc, 400);
        if (!idDoc) return { stato: 400, corpo: { ok: false, msg: 'Scheda mancante.' } };
        const r = await liberaSlot(db, evento, idDoc, chi);
        if (!r.ok) return { stato: 409, corpo: r };
        try { await azzeraAppuntamento(db, idDoc); } catch (_) { /* lo slot e' gia' libero: e' quello che conta */ }
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
    scriviAppuntamento, azzeraAppuntamento,
    quandoInItalia, nomeFileFoglio,
    // l'area riservata
    gestisce, esegui
};
