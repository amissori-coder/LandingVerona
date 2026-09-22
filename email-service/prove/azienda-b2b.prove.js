/* ============================================================
   PROVE - gli incontri B2B PER AZIENDA
   ------------------------------------------------------------
       node prove/azienda-b2b.prove.js

   Niente da installare: Firestore, il server di posta e l'orologio
   sono finti e stanno qui dentro (stessa impalcatura di
   agenda-b2b.prove.js, che continua a provare il mondo di prima -
   una persona, un invito, un orario - e deve restare verde).

   COSA DIMOSTRANO. L'invito B2B non e' piu' di una persona: e'
   dell'IMPRESA. Cambia chi riceve la mail, chi apre il modulo, di
   chi e' l'orario e chi va avvisato quando qualcosa si muove.

     - UNA MAIL PER AZIENDA a tutti i referenti insieme, che li
       nomina; l'invito si scrive su TUTTE le loro schede, anche
       quando due condividono la casella;
     - IL COLLEGAMENTO E' DELL'AZIENDA: la firma di un'altra
       impresa non apre niente, e dal collegamento personale di un
       referente si entra nello stesso modulo - una logica sola,
       due porte, e una sola prima preferenza per impresa;
     - LA PRIMA PREFERENZA PRENOTA: l'orario diventa dell'azienda,
       e il collega che apre la pagina lo vede "nostro" e non
       "occupato da uno sconosciuto";
     - LA SECONDA E LA TERZA NON PRENOTANO NIENTE: restano in coda,
       non impegnano orari e non impediscono di configurare i
       tavoli;
     - ASSEGNARE LA SECONDA NON CANCELLA LA PRIMA. E' il punto in
       cui il sistema di prima si sarebbe rotto in silenzio: si
       liberava "il primo slot di quella persona", e la prima
       preferenza sarebbe sparita dal foglio del desk;
     - DUE OPERATORI SULLA STESSA PREFERENZA: il secondo si sente
       dire che e' gia' assegnata, invece di fissare un secondo
       incontro alla stessa impresa;
     - DUE REFERENTI CHE SALVANO INSIEME: chi arriva con una
       revisione vecchia non cancella le scelte del collega;
     - IL NOMINATIVO e' uno dei referenti dell'invito, e nessun
       altro;
     - A OGNI MODIFICA - prenotazione, spostamento, assegnazione,
       disdetta - parte UNA mail a tutti i referenti, con il foglio
       aggiornato in allegato.
   ============================================================ */
'use strict';
const Module = require('module');
const path = require('path');

// ---------- orologio ----------
let orologio = Date.parse('2026-09-20T09:00:00Z');
Date.now = () => orologio;

// ---------- Firestore finto ----------
const dati = new Map();
const FieldValue = {
    increment: (n) => ({ __op: 'increment', n: n }),
    serverTimestamp: () => ({ __op: 'ts' }),
    delete: () => ({ __op: 'del' })
};
function applica(vecchio, patch, merge) {
    const base = (merge && vecchio) ? Object.assign({}, vecchio) : {};
    for (const k of Object.keys(patch)) {
        const v = patch[k];
        if (v && v.__op === 'increment') base[k] = Number(base[k] || 0) + v.n;
        else if (v && v.__op === 'ts') base[k] = orologio;
        else if (v && v.__op === 'del') delete base[k];
        else if (merge && v && typeof v === 'object' && !Array.isArray(v)
            && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
            // il merge di Firestore fonde le mappe annidate chiave per chiave
            base[k] = applica(base[k], v, true);
        } else base[k] = v;
    }
    return base;
}
function doc(chiave) {
    const self = {
        _chiave: chiave,
        get: async () => ({ exists: dati.has(chiave), id: chiave.split('/').pop(), data: () => dati.get(chiave), ref: self }),
        set: async (patch, opz) => { dati.set(chiave, applica(dati.get(chiave), patch, !!(opz && opz.merge))); },
        delete: async () => { dati.delete(chiave); }
    };
    return self;
}
function collection(nome) {
    return {
        doc: (id) => doc(nome + '/' + id),
        get: async () => {
            const ds = [...dati.keys()].filter(k => k.startsWith(nome + '/'))
                .map(k => ({ id: k.slice(nome.length + 1), exists: true, data: () => dati.get(k) }));
            return { forEach: f => ds.forEach(f), docs: ds, size: ds.length, empty: !ds.length };
        },
        where: () => ({ where: function () { return this; }, get: async () => ({ forEach: () => { }, docs: [], size: 0, empty: true }) }),
        orderBy: function () { return this; },
        limit: function () { return this; }
    };
}
/* Le transazioni si SERIALIZZANO, come fa Firestore ritentando quella che
   ha letto dati poi cambiati: e' esattamente il comportamento che queste
   prove devono poter dare per buono, perche' e' quello su cui si regge
   "un orario, una persona". Senza la coda, due prenotazioni lanciate
   insieme leggerebbero tutte e due il posto libero e passerebbero
   entrambe: la prova direbbe verde su un servizio rotto. */
let coda = Promise.resolve();
const db = {
    collection: collection,
    runTransaction: (fn) => {
        const mio = coda.then(async () => {
            const scritture = [];
            await fn({
                get: (r) => r.get(),
                set: (r, p, o) => { scritture.push([r, p, o]); }
            });
            for (const [r, p, o] of scritture) await r.set(p, o);
        });
        coda = mio.catch(() => { });
        return mio;
    }
};
const admin = {
    apps: [],
    initializeApp: () => { admin.apps.push({}); },
    credential: { cert: (c) => c },
    auth: () => ({ verifyIdToken: async () => ({ email: 'staff@revilaw.it' }) }),
    firestore: Object.assign(() => db, { FieldValue: FieldValue })
};

// ---------- SMTP finto ----------
const posta = [];
let postaRotta = false;
const nodemailer = {
    createTransport: () => ({
        sendMail: async (msg) => {
            if (postaRotta) throw new Error('550 casella non raggiungibile');
            posta.push(msg);
            return { response: '250 ok' };
        },
        close: () => { }
    })
};

// ---------- intercetta i require ----------
const veroRequire = Module.prototype.require;
Module.prototype.require = function (nome) {
    if (nome === 'firebase-admin') return admin;
    if (nome === 'nodemailer') return nodemailer;
    return veroRequire.apply(this, arguments);
};

process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ private_key: 'x', client_email: 'y' });
process.env.SMTP_FROM_EMAIL = 'noreply@ngb.it';
process.env.SMTP_FROM_NAME = 'Revilaw S.p.A.';
process.env.NEWSLETTER_SECRET = 'segreto-di-prova';

const RADICE = path.join(__dirname, '..');
const AGENDA = require(path.join(RADICE, 'lib/agenda-b2b.js'));
const NL = require(path.join(RADICE, 'lib/newsletter.js'));
const iscrizione = require(path.join(RADICE, 'api/iscrizione-nuova.js'));
const PRESENZE = require(path.join(RADICE, 'api/presenze.js'));
const CHIAVI = require(path.join(RADICE, 'lib/chiavi-azienda.js'));

// ---------- utilita' ----------
const EVENTO = 'napoli-2026-10-02';
const GIORNATA = { inizio: '10:00', fine: '18:00', pranzoDa: '13:00', pranzoA: '14:00', durata: 30 };

function azzera() {
    dati.clear(); posta.length = 0; postaRotta = false;
    orologio = Date.parse('2026-09-20T09:00:00Z');
}
/* L'agenda com'e' dopo che l'area riservata l'ha salvata: la giornata e i
   tavoli attivi con i loro referenti. `chiusi` sono gli orari in cui il
   tavolo non riceve. */
function mettiAgenda(aree, giornata) {
    const dentro = {};
    Object.keys(aree).forEach(id => {
        dentro[id] = Object.assign({ attiva: true, referenti: [], chiusi: [], nota: '' }, aree[id]);
    });
    dati.set('b2bAgenda/' + EVENTO, {
        evento: EVENTO,
        eventoDati: { titolo: 'Napoli', quando: '2 ottobre 2026', luogo: 'Hotel Eurostars Excelsior', indirizzo: 'Via Partenope 48' },
        giornata: giornata || GIORNATA,
        aree: dentro
    });
}
/* La SCALETTA della giornata, come la salva l'area riservata: serve a
   provare che gli orari di chi e' sul palco si chiudono da se'. */
function mettiProgramma(voci) {
    dati.set('programmaEventi/' + EVENTO, { evento: EVENTO, voci: voci });
}
// una scheda di iscritto invitato a uno o piu' tavoli (invito "a slot")
function mettiInvitato(id, nome, aree, extra) {
    dati.set('iscrizioni/' + id, Object.assign({
        pagina: 'Napoli 2 Ottobre 2026', data: '10/09/2026 11:00:00',
        nome: nome, cognome: 'Rossi', email: id + '@esempio.it', azienda: 'Alfa S.r.l.', ruolo: 'Amministratore',
        b2bInvito: { quando: orologio, da: 'staff@revilaw.it', eventoId: EVENTO, aree: aree, area: aree[0] }
    }, extra || {}));
}
function scheda(id) { return dati.get('iscrizioni/' + id); }
function prenotazioni() { return dati.get('b2bPrenotazioni/' + EVENTO) || { aree: {}, richieste: [] }; }
function slotDi(area, ora) {
    const a = (prenotazioni().aree || {})[area] || {};
    return a[String(ora).replace(':', '')] || null;
}
// una chiamata al modulo pubblico, come la fa la pagina /incontri_b2b/
async function chiama(id, corpo) {
    const res = {
        _s: 0, _j: null,
        setHeader() { }, status(n) { this._s = n; return this; },
        json(o) { this._j = o; return this; }, end() { return this; }
    };
    await iscrizione({
        method: 'POST', headers: {},
        body: Object.assign({ d: id, t: NL.firmaCompleta(id) }, corpo)
    }, res);
    return Object.assign({ _stato: res._s }, res._j || {});
}
// una chiamata dell'area riservata (sezione b2b), gia' autenticata a monte
async function staff(corpo, puo) {
    return AGENDA.esegui({
        db: db, body: Object.assign({ sezione: 'b2b', evento: EVENTO }, corpo),
        email: 'staff@revilaw.it', collab: '', eAdmin: puo !== false, ePartner: puo !== false
    });
}

// ---------- il piccolo motore delle prove ----------
let ok = 0, ko = 0;
function esigi(cond, testo) { if (cond) { ok++; console.log('  ok   ' + testo); } else { ko++; console.log('  KO   ' + testo); } }
async function prova(nome, fn) {
    console.log('\n' + nome);
    try { await fn(); }
    catch (e) { ko++; console.log('  KO   eccezione: ' + (e && e.stack || e)); }
}

/* ---------- gli aiutanti dell'azienda ----------
   `mettiReferente` crea la scheda di una persona (come l'importazione
   dell'elenco), `invita` chiama l'azione vera dell'area riservata, e
   `chiamaAzienda` bussa alla pagina con il collegamento firmato
   dell'impresa. Si passa sempre dalle azioni vere: una prova che scrivesse
   a mano il documento dell'azienda proverebbe se stessa. */
function mettiReferente(id, nome, cognome, azienda, email, piva) {
    dati.set('iscrizioni/' + id, {
        pagina: 'Napoli 2 Ottobre 2026', data: '10/09/2026 11:00:00',
        nome: nome, cognome: cognome, email: email, azienda: azienda,
        ruolo: 'Amministratore', telefono: '333',
        extra: piva ? { 'P.IVA': piva } : {}
    });
}
async function invita(aziende, aree, forza) {
    const res = risposta();
    await PRESENZE({
        method: 'POST', headers: {},
        body: {
            idToken: 'x', azione: 'invita-b2b-azienda', evento: EVENTO,
            aziende: aziende, aree: aree || ['merito-creditizio', 'esg', 'revisione'],
            forza: forza !== false,
            eventoDati: { titolo: 'Napoli', quando: '2 ottobre 2026', luogo: 'Hotel Eurostars Excelsior', indirizzo: 'Via Partenope 48' },
            mail: {
                oggetto: 'Incontri B2B',
                html: '<p>Gentile {{NOME}},</p>{{SE_COLLEGHI}}<p>Questo invito e arrivato anche a {{REFERENTI}}.</p>{{/SE_COLLEGHI}}<p><a href="{{B2B}}">Scelga</a></p>',
                testo: 'Gentile {{NOME}}. {{SE_COLLEGHI}}Anche a {{REFERENTI}}.{{/SE_COLLEGHI}} {{B2B}}'
            }
        }
    }, res);
    return Object.assign({ _stato: res._s }, res._j || {});
}
function risposta() {
    const res = {
        _s: 0, _j: null,
        setHeader() { }, status(n) { this._s = n; return this; },
        json(o) { this._j = o; return this; }, end() { return this; }
    };
    return res;
}
async function chiamaPresenze(corpo) {
    const res = risposta();
    await PRESENZE({ method: 'POST', headers: {}, body: Object.assign({ idToken: 'x', evento: EVENTO }, corpo) }, res);
    return Object.assign({ _stato: res._s }, res._j || {});
}
function idAziendaDi(chiave) { return CHIAVI.idAzienda(EVENTO, chiave); }
async function chiamaAzienda(chiave, corpo) {
    const az = idAziendaDi(chiave);
    const res = risposta();
    await iscrizione({
        method: 'POST', headers: {},
        body: Object.assign({ a: az, e: EVENTO, t: NL.firmaAzienda(EVENTO, az) }, corpo)
    }, res);
    return Object.assign({ _stato: res._s }, res._j || {});
}
function documentoAzienda(chiave) { return dati.get('b2bAziende/' + EVENTO + '--' + idAziendaDi(chiave)); }
function slotDi(area, ora) {
    const a = ((dati.get('b2bPrenotazioni/' + EVENTO) || {}).aree || {})[area] || {};
    return a[String(ora).replace(':', '')] || null;
}


(async () => {

    await prova('1) L\'invito per azienda: una mail sola, che nomina i colleghi', async () => {
        azzera();
        dati.set('utenti/staff@revilaw.it', { ruolo: 'admin', nome: 'Staff' });
        mettiAgenda({
            'merito-creditizio': { referenti: [{ nome: 'Anna Verdi', ruolo: 'Revisore' }] },
            'esg': { referenti: [{ nome: 'Luca Bianchi' }] },
            'revisione': { referenti: [{ nome: 'Ombretta Magaraci' }] }
        });
        mettiReferente('mario', 'Mario', 'Rossi', 'Alfa S.r.l.', 'mario@alfa.it', '01234567891');
        mettiReferente('anna', 'Anna', 'Neri', 'Alfa S.r.l.', 'anna@alfa.it', '01234567891');
        const r = await invita([{ chiave: 'p:01234567891', nome: 'Alfa S.r.l.', piva: '01234567891', referenti: [{ doc: 'mario' }, { doc: 'anna' }] }]);
        esigi(r.ok && r.inviate === 1, 'un invito per azienda, non uno per persona');
        esigi(posta.length === 1, 'e una mail sola');
        esigi(posta[0].to === 'mario@alfa.it, anna@alfa.it', 'con dentro tutti e due i referenti');
        esigi(/Anche a Mario Rossi, Anna Neri/.test(posta[0].text || ''), 'la mail dice che e arrivata anche agli altri, e li nomina');
        const az = documentoAzienda('p:01234567891');
        esigi(az && az.nome === 'Alfa S.r.l.' && az.referenti.length === 2, 'il documento dell\'azienda esiste, con i suoi referenti');
        esigi(dati.get('iscrizioni/mario').b2bAzienda.id === idAziendaDi('p:01234567891')
            && dati.get('iscrizioni/anna').b2bAzienda.id === idAziendaDi('p:01234567891'),
            'e l\'azienda resta scritta su TUTTE le schede, non solo sulla prima');
        esigi((posta[0].html || '').indexOf(idAziendaDi('p:01234567891')) > 0, 'il collegamento nella mail e quello dell\'azienda');
    });

    await prova('2) Due persone sulla stessa casella: una mail, due schede', async () => {
        azzera();
        dati.set('utenti/staff@revilaw.it', { ruolo: 'admin' });
        mettiAgenda({ 'merito-creditizio': {} });
        mettiReferente('laura', 'Laura', 'Balzano', 'Balzano Srl', 'laura@balzano.it', '07307010632');
        mettiReferente('livio', 'Livio', 'Balzano', 'Balzano Srl', 'laura@balzano.it', '07307010632');
        await invita([{ chiave: 'p:07307010632', nome: 'Balzano Srl', piva: '07307010632', referenti: [{ doc: 'laura' }, { doc: 'livio' }] }]);
        esigi(posta.length === 1 && posta[0].to === 'laura@balzano.it', 'alla casella condivisa la mail arriva una volta sola');
        esigi(/Laura Balzano, Livio Balzano/.test(posta[0].text || ''), 'e nomina tutte e due le persone');
        esigi(!!dati.get('iscrizioni/livio').b2bAzienda, 'anche la seconda scheda ha la sua azienda: senza, il suo collegamento non aprirebbe niente');
    });

    await prova('3) Il modulo dell\'azienda: si apre, dice le regole, conosce i referenti', async () => {
        azzera();
        dati.set('utenti/staff@revilaw.it', { ruolo: 'admin' });
        mettiAgenda({ 'merito-creditizio': { referenti: [{ nome: 'Anna Verdi', ruolo: 'Revisore' }] }, 'esg': {}, 'revisione': {} });
        mettiReferente('mario', 'Mario', 'Rossi', 'Alfa', 'mario@alfa.it', '01234567891');
        mettiReferente('anna', 'Anna', 'Neri', 'Alfa', 'anna@alfa.it', '01234567891');
        await invita([{ chiave: 'p:01234567891', nome: 'Alfa S.r.l.', piva: '01234567891', referenti: [{ doc: 'mario' }, { doc: 'anna' }] }]);
        const r = await chiamaAzienda('p:01234567891', { azione: 'b2b-azienda-leggi' });
        esigi(r.ok && r.modo === 'azienda', 'la pagina si apre in modalita azienda');
        esigi(r.azienda.nome === 'Alfa S.r.l.' && r.referenti.length === 2, 'sa di che impresa e chi sono i referenti');
        esigi(r.referenti[0].doc === 'mario' && r.referenti[0].email === undefined, 'la tendina dei nominativi non porta gli indirizzi');
        esigi(Array.isArray(r.regole) && r.regole.length === 5 && /prima preferenza prenota davvero/.test(r.regole[1]),
            'le regole di prenotazione arrivano dal servizio, scritte una volta sola');
        esigi(r.aree.length === 3, 'i tavoli sono quelli dell\'invito, tutti');
        esigi(r.prima === null && r.coda.length === 0, 'e all\'inizio non c\'e nessuna scelta');
    });

    await prova('4) La prima preferenza prenota, e la conferma va a tutti', async () => {
        azzera();
        dati.set('utenti/staff@revilaw.it', { ruolo: 'admin' });
        mettiAgenda({ 'merito-creditizio': { referenti: [{ nome: 'Anna Verdi', ruolo: 'Revisore' }] }, 'esg': {}, 'revisione': {} });
        mettiReferente('mario', 'Mario', 'Rossi', 'Alfa', 'mario@alfa.it', '01234567891');
        mettiReferente('anna', 'Anna', 'Neri', 'Alfa', 'anna@alfa.it', '01234567891');
        await invita([{ chiave: 'p:01234567891', nome: 'Alfa S.r.l.', piva: '01234567891', referenti: [{ doc: 'mario' }, { doc: 'anna' }] }]);
        const letto = await chiamaAzienda('p:01234567891', { azione: 'b2b-azienda-leggi' });
        posta.length = 0;
        const r = await chiamaAzienda('p:01234567891', {
            azione: 'b2b-azienda-salva', rev: letto.rev,
            prima: { area: 'merito-creditizio', ora: '10:30', perDoc: 'anna' },
            coda: [{ pos: 2, area: 'esg', perDoc: 'mario' }],
            esigenze: [{ perDoc: 'mario', testo: 'Vorremmo parlare di garanzie sui fidi.' }]
        });
        esigi(r.ok && r.prima && r.prima.ora === '10:30', 'l\'orario e prenotato');
        const preso = slotDi('merito-creditizio', '10:30');
        esigi(preso && preso.aziendaId === idAziendaDi('p:01234567891'), 'e l\'orario e dell\'AZIENDA');
        esigi(preso.perChi === 'Anna Neri' && preso.nome === 'Anna Neri', 'con il nominativo di chi partecipa');
        esigi(r.coda.length === 1 && r.coda[0].pos === 2 && r.coda[0].areaNome === 'ESG e sostenibilita',
            'la seconda preferenza resta in coda');
        esigi(!slotDi('esg', '10:30') && !slotDi('esg', '10:00'), 'e non impegna nessun orario');
        esigi(r.esigenze.length === 1 && r.esigenze[0].perChi === 'Mario Rossi', 'l\'altra esigenza e registrata, con il suo nominativo');
        esigi(posta.length === 1 && posta[0].to === 'mario@alfa.it, anna@alfa.it', 'la conferma e una mail sola, a tutti i referenti');
        esigi((posta[0].attachments || []).length === 1, 'con il foglio per il desk in allegato');
        esigi(/per Anna Neri/.test(posta[0].text || ''), 'e dice a chi tocca quell\'incontro');
        esigi(/In attesa di un orario/.test(posta[0].text || ''), 'e che la seconda preferenza aspetta un orario');
        const prg = dati.get('iscrizioni/mario').b2bProgramma;
        esigi(prg && prg.incontri.length === 1 && prg.attesa.length === 1,
            'il programma dell\'azienda e ricopiato anche sulla scheda del collega che non partecipa');
        esigi(dati.get('iscrizioni/anna').b2bAppuntamento.ora === '10:30', 'e chi partecipa ha il suo appuntamento sulla scheda');
        esigi(dati.get('iscrizioni/mario').b2bAppuntamento === null, 'chi non partecipa non ha un appuntamento che non ha');
    });

    await prova('5) L\'orario e dell\'azienda: il collega lo vede nostro, non occupato', async () => {
        const r = await chiamaAzienda('p:01234567891', { azione: 'b2b-azienda-leggi' });
        const area = r.aree.filter(a => a.id === 'merito-creditizio')[0];
        const s = area.slot.filter(x => x.ora === '10:30')[0];
        esigi(s.stato === 'mio', 'l\'orario preso da un collega si legge "mio"');
        esigi(s.perChi === 'Anna Neri', 'e dice per chi e');
        esigi(r.prima && r.prima.perChi === 'Anna Neri', 'la prima preferenza dell\'azienda e li, per chiunque apra il collegamento');
    });

    await prova('6) Il nominativo e uno dei referenti, e nessun altro', async () => {
        const letto = await chiamaAzienda('p:01234567891', { azione: 'b2b-azienda-leggi' });
        const r = await chiamaAzienda('p:01234567891', {
            azione: 'b2b-azienda-salva', rev: letto.rev,
            prima: { area: 'esg', ora: '11:00', perDoc: 'estraneo' }
        });
        esigi(!r.ok && r.motivo === 'nominativo', 'un nome che non e fra i referenti non passa');
        esigi(!slotDi('esg', '11:00'), 'e nessun orario viene impegnato');
    });

    await prova('7) Due referenti che salvano insieme: la revisione fa da guardia', async () => {
        const letto = await chiamaAzienda('p:01234567891', { azione: 'b2b-azienda-leggi' });
        const primo = await chiamaAzienda('p:01234567891', {
            azione: 'b2b-azienda-salva', rev: letto.rev,
            prima: { area: 'merito-creditizio', ora: '10:30', perDoc: 'anna' },
            coda: [{ pos: 2, area: 'esg', perDoc: 'mario' }, { pos: 3, area: 'revisione', perDoc: 'anna' }],
            esigenze: []
        });
        esigi(primo.ok && primo.coda.length === 2, 'il primo salva le sue tre preferenze');
        const secondo = await chiamaAzienda('p:01234567891', {
            azione: 'b2b-azienda-salva', rev: letto.rev,
            prima: { area: 'merito-creditizio', ora: '10:30', perDoc: 'mario' },
            coda: [], esigenze: []
        });
        esigi(!secondo.ok && secondo._stato === 409 && secondo.motivo === 'collega',
            'il secondo, che aveva la pagina vecchia, si sente dire che un collega ha appena cambiato');
        esigi(secondo.coda && secondo.coda.length === 2, 'e si ritrova davanti le scelte aggiornate, non il vuoto');
        esigi(documentoAzienda('p:01234567891').coda.length === 2, 'le preferenze del primo non sono state cancellate');
    });

    await prova('8) La coda non impegna orari e non blocca la configurazione dei tavoli', async () => {
        const r = await chiamaPresenze({
            sezione: 'b2b', azione: 'agenda-salva',
            aree: { 'esg': { attiva: true, nota: 'Sala 2', chiusi: ['1100'], referenti: [{ nome: 'Luca Bianchi' }] } }
        });
        esigi(r._stato === 200 && r.ok, 'il tavolo di una seconda preferenza si configura lo stesso');
        esigi(documentoAzienda('p:01234567891').coda.length === 2, 'e la coda resta dov\'e');
    });

    await prova('9) Assegnare la seconda NON cancella la prima', async () => {
        posta.length = 0;
        const az = idAziendaDi('p:01234567891');
        const voce = documentoAzienda('p:01234567891').coda.filter(c => c.pos === 2)[0];
        const r = await chiamaPresenze({
            sezione: 'b2b', azione: 'coda-assegna',
            aziendaId: az, codaId: voce.id, area: 'esg', ora: '12:00'
        });
        esigi(r._stato === 200 && r.ok, 'lo staff assegna un orario alla seconda preferenza');
        esigi(!!slotDi('esg', '12:00'), 'il secondo incontro c\'e');
        esigi(!!slotDi('merito-creditizio', '10:30'), 'E LA PRIMA PREFERENZA E ANCORA LI');
        esigi(slotDi('esg', '12:00').scelta === 2, 'il secondo incontro sa di essere una seconda scelta');
        const coda = documentoAzienda('p:01234567891').coda.filter(c => c.pos === 2)[0];
        esigi(coda.stato === 'assegnata' && coda.assegnato.ora === '12:00', 'la voce di coda risulta assegnata, con il suo orario');
        esigi(posta.length === 1 && /assegnato/i.test(posta[0].subject || ''), 'e l\'azienda viene avvisata');
        const prg = dati.get('iscrizioni/anna').b2bProgramma;
        esigi(prg.incontri.length === 2, 'sulle schede il programma dell\'azienda ora dice due incontri');
    });

    await prova('10) Due operatori sulla stessa preferenza: il secondo si ferma', async () => {
        const az = idAziendaDi('p:01234567891');
        const voce = documentoAzienda('p:01234567891').coda.filter(c => c.pos === 2)[0];
        const r = await chiamaPresenze({
            sezione: 'b2b', azione: 'coda-assegna',
            aziendaId: az, codaId: voce.id, area: 'esg', ora: '12:30'
        });
        esigi(!r.ok && r.motivo === 'gia-assegnata', 'la seconda assegnazione viene respinta');
        esigi(!slotDi('esg', '12:30'), 'e non si fissa un secondo incontro alla stessa impresa');
    });

    await prova('11) La seconda gia assegnata non si tocca piu dal modulo', async () => {
        const letto = await chiamaAzienda('p:01234567891', { azione: 'b2b-azienda-leggi' });
        esigi(letto.assegnati.length === 1 && letto.assegnati[0].ora === '12:00',
            'il modulo mostra l\'incontro assegnato dallo staff');
        const r = await chiamaAzienda('p:01234567891', {
            azione: 'b2b-azienda-salva', rev: letto.rev,
            prima: { area: 'merito-creditizio', ora: '10:30', perDoc: 'anna' },
            coda: [{ pos: 2, area: 'revisione', perDoc: 'mario' }], esigenze: []
        });
        esigi(r.ok && (r.bloccate || []).indexOf(2) >= 0, 'cambiarla non passa in silenzio: la pagina lo dice');
        esigi(!!slotDi('esg', '12:00'), 'e l\'incontro gia fissato resta dov\'e');
    });

    await prova('12) Lo staff sposta un incontro, e l\'azienda lo sa', async () => {
        posta.length = 0;
        const r = await chiamaPresenze({
            sezione: 'b2b', azione: 'b2b-sposta',
            daArea: 'merito-creditizio', daChiave: '1030', aArea: 'merito-creditizio', aOra: '15:00'
        });
        esigi(r._stato === 200 && r.ok && r.ora === '15:00', 'l\'incontro si sposta');
        esigi(!slotDi('merito-creditizio', '10:30') && !!slotDi('merito-creditizio', '15:00'), 'l\'orario vecchio si libera e quello nuovo e preso');
        esigi(slotDi('merito-creditizio', '15:00').perChi === 'Anna Neri', 'con lo stesso nominativo');
        esigi(posta.length === 1 && /spostato/i.test(posta[0].subject || ''), 'e parte la mail con il foglio aggiornato');
        esigi(dati.get('iscrizioni/anna').b2bAppuntamento.ora === '15:00', 'anche la scheda dice l\'orario nuovo');
    });

    await prova('13) Liberare un orario non e piu muto', async () => {
        posta.length = 0;
        const r = await chiamaPresenze({
            sezione: 'b2b', azione: 'agenda-libera', area: 'merito-creditizio', chiave: '1500'
        });
        esigi(r._stato === 200 && r.ok, 'l\'orario si libera');
        esigi(posta.length === 1 && /annullato/i.test(posta[0].subject || ''), 'e l\'azienda riceve la disdetta');
        esigi(/Rivedi le prenotazioni|Scegli un incontro/.test(posta[0].text || ''), 'con il collegamento per riprenotare');
        const prg = dati.get('iscrizioni/anna').b2bProgramma;
        esigi(prg.incontri.length === 1, 'e la copia sulle schede non racconta piu un incontro che non c\'e');
    });

    await prova('14) Il collegamento personale apre il modulo dell\'azienda', async () => {
        const res = risposta();
        await iscrizione({
            method: 'POST', headers: {},
            body: { d: 'mario', t: NL.firmaCompleta('mario'), azione: 'b2b-leggi' }
        }, res);
        const r = res._j || {};
        esigi(r.ok && r.modo === 'azienda', 'dal collegamento personale si entra nello stesso modulo');
        esigi(r.azienda && r.azienda.id === idAziendaDi('p:01234567891'), 'ed e quello della sua azienda');
    });

    await prova('15) Il collegamento di un\'altra azienda non apre niente', async () => {
        const res = risposta();
        await iscrizione({
            method: 'POST', headers: {},
            body: { a: idAziendaDi('p:01234567891'), e: EVENTO, t: NL.firmaAzienda(EVENTO, 'az0000000000000000'), azione: 'b2b-azienda-leggi' }
        }, res);
        esigi(res._s === 403, 'una firma che non e la sua viene respinta');
        const res2 = risposta();
        await iscrizione({
            method: 'POST', headers: {},
            body: { a: 'az0000000000000000', e: EVENTO, t: NL.firmaAzienda(EVENTO, 'az0000000000000000'), azione: 'b2b-azienda-leggi' }
        }, res2);
        esigi(res2._s === 403, 'e un\'azienda che non esiste risponde come una firma sbagliata, senza farlo capire');
    });

    console.log('\n' + ok + ' ok, ' + ko + ' KO');
    process.exit(ko ? 1 : 0);
})().catch(e => { console.error('Errore nelle prove:', e); process.exit(1); });
