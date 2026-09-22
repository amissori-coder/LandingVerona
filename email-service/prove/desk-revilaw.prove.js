/* ============================================================
   PROVE - i tavoli gemelli, il desk Revilaw, le altre esigenze
   ------------------------------------------------------------
       node prove/desk-revilaw.prove.js

   Niente da installare: Firestore, il server di posta e l'orologio
   sono finti e stanno qui dentro (stessa impalcatura di
   azienda-b2b.prove.js, che continua a provare il mondo di prima e
   deve restare verde).

   COSA DIMOSTRANO. Tre cose nuove, e tutte e tre hanno un modo
   preciso di fare danno.

     - I TAVOLI GEMELLI sono UNO nel modulo dell'azienda. Prima
       comparivano due volte con lo stesso titolo ("Modello 231 e
       TCF" e "Modello 231 e TCF - secondo tavolo"): sembrava un
       errore, e all'impresa toccava scegliere a quale dei due
       professionisti sedersi - una cosa che non e' sua. Adesso e'
       una voce sola con il doppio dei posti: la stessa ora si
       prenota due volte, e su quale dei due tavoli finisce lo
       decide il servizio. La terza pero' no: i posti sono due;
     - IL DESK REVILAW e' INTERNO. Nel modulo non c'e', nemmeno
       quando l'azienda ci ha un appuntamento, e nessuno puo'
       prenotarlo da se'. L'ora e il posto glieli diciamo per mail,
       con il foglio allegato: se comparisse nel modulo, l'impresa
       crederebbe di potersela spostare;
     - LE ALTRE ESIGENZE si cancellano e si portano a un tavolo.
       Portarle e' un incontro vero, con l'ora e il foglio - e il
       punto delicato e' che NON e' una delle tre preferenze: senza
       un numero suo, portarne una cancellerebbe la seconda
       preferenza gia' fissata a quell'impresa, perche' il modello
       libera "il posto della stessa azienda con la stessa
       preferenza".
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
function esigi(cond, testo, extra) {
    if (cond) { ok++; console.log('  ok   ' + testo); }
    else { ko++; console.log('  KO   ' + testo + (extra ? '   ' + extra : '')); }
}
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


/* Due aziende con un referente ciascuna, invitate ai tavoli indicati. */
async function dueAziende(aree) {
    azzera();
    dati.set('utenti/staff@revilaw.it', { ruolo: 'admin', nome: 'Staff' });
    mettiAgenda({
        'modello-231': { referenti: [{ nome: 'Anna Verdi', ruolo: 'Partner' }] },
        'modello-231-b': { referenti: [{ nome: 'Luca Bianchi', ruolo: 'Partner' }] },
        'merito-creditizio': { referenti: [{ nome: 'Ida Neri' }] }
    });
    mettiReferente('mario@alfa.it|1', 'Mario', 'Rossi', 'Alfa Srl', 'mario@alfa.it', '09302991212');
    mettiReferente('gino@beta.it|1', 'Gino', 'Verdi', 'Beta Srl', 'gino@beta.it', '07307010632');
    mettiReferente('rita@gamma.it|1', 'Rita', 'Neri', 'Gamma Srl', 'rita@gamma.it', '02399140645');
    await invita([
        { chiave: 'p:09302991212', nome: 'Alfa Srl', piva: '09302991212', referenti: [{ id: 'mario@alfa.it|1', doc: 'mario@alfa.it|1' }] },
        { chiave: 'p:07307010632', nome: 'Beta Srl', piva: '07307010632', referenti: [{ id: 'gino@beta.it|1', doc: 'gino@beta.it|1' }] },
        { chiave: 'p:02399140645', nome: 'Gamma Srl', piva: '02399140645', referenti: [{ id: 'rita@gamma.it|1', doc: 'rita@gamma.it|1' }] }
    ], aree || ['modello-231', 'modello-231-b', 'merito-creditizio']);
    posta.length = 0;
}
const docDi = chiave => (documentoAzienda(chiave).referenti || [])[0].doc;
/* La prenotazione dell'azienda passa sempre dal suo modulo: si rilegge (per
   avere la revisione) e si salva, come fa la pagina. */
async function prenota(chiave, area, ora, coda, esigenze) {
    const letto = await chiamaAzienda(chiave, { azione: 'b2b-azienda-leggi' });
    return chiamaAzienda(chiave, {
        azione: 'b2b-azienda-salva', rev: letto.rev,
        prima: area ? { area: area, ora: ora, perDoc: docDi(chiave) } : null,
        coda: coda || [], esigenze: esigenze || []
    });
}

(async () => {

    await prova('1) I due tavoli gemelli sono UNA voce sola nel modulo', async () => {
        await dueAziende();
        const r = await chiamaAzienda('p:09302991212', { azione: 'b2b-azienda-leggi' });
        const nomi = (r.aree || []).map(a => a.nome);
        esigi(nomi.indexOf('Modello 231 e Tax Control Framework') >= 0, 'l\'argomento c\'e\'');
        esigi(nomi.filter(n => /231/.test(n)).length === 1,
            'e c\'e\' UNA volta sola: il "secondo tavolo" non si propone a nessuno (' + nomi.join(' | ') + ')');
        const tav = (r.aree || []).filter(a => a.id === 'modello-231')[0] || {};
        const dieci = (tav.slot || []).filter(s => s.ora === '10:00')[0] || {};
        esigi(dieci.stato === 'libero' && dieci.posti === 2,
            'alle 10:00 i posti sono due, uno per professionista');
        const solo = (r.aree || []).filter(a => a.id === 'merito-creditizio')[0] || {};
        esigi(((solo.slot || []).filter(s => s.ora === '10:00')[0] || {}).posti === 1,
            'e su un tavolo tenuto da una persona sola il posto resta uno');
    });

    await prova('2) La stessa ora si prenota due volte, e la terza no', async () => {
        const a = await prenota('p:09302991212', 'modello-231', '10:00');
        const b = await prenota('p:07307010632', 'modello-231', '10:00');
        esigi(a.ok === true && b.ok === true, 'le prime due prenotazioni passano tutte e due');
        esigi(!!slotDi('modello-231', '10:00') && !!slotDi('modello-231-b', '10:00'),
            'e sono finite una per tavolo: il servizio ha scelto lui, senza chiederlo');
        esigi(slotDi('modello-231', '10:00').aziendaNome === 'Alfa Srl'
            && slotDi('modello-231-b', '10:00').aziendaNome === 'Beta Srl',
            'la prima sul capofila, la seconda sul gemello');
        const c = await prenota('p:02399140645', 'modello-231', '10:00');
        /* Il modulo risponde sempre 200 e racconta com'e' andata la prima
           preferenza: le altre scelte si salvano comunque, e quello che
           l'impresa ha scritto non si butta per un orario perso. */
        esigi(c.ok === true && c.esitoPrima && c.esitoPrima.ok === false && c.esitoPrima.motivo === 'occupato',
            'la terza si sente dire che quell\'ora e\' finita: i posti sono due, non infiniti',
            JSON.stringify(c.esitoPrima));
        const r = await chiamaAzienda('p:02399140645', { azione: 'b2b-azienda-leggi' });
        const tav = (r.aree || []).filter(a => a.id === 'modello-231')[0] || {};
        esigi(((tav.slot || []).filter(s => s.ora === '10:00')[0] || {}).stato === 'occupato',
            'e nel modulo quell\'ora si legge occupata');
    });

    await prova('3) Chi ha prenotato vede il SUO orario, non un posto libero accanto', async () => {
        const r = await chiamaAzienda('p:09302991212', { azione: 'b2b-azienda-leggi' });
        const tav = (r.aree || []).filter(a => a.id === 'modello-231')[0] || {};
        const dieci = (tav.slot || []).filter(s => s.ora === '10:00')[0] || {};
        esigi(dieci.stato === 'mio', 'la casella e\' sua');
        esigi(!!r.prima && r.prima.area === 'modello-231',
            'e la prima preferenza torna con il nome della FAMIGLIA, non del secondo tavolo');
    });

    await prova('4) Il desk Revilaw nasce acceso e non si propone a nessuno', async () => {
        await dueAziende();
        const ag = await staff({ azione: 'agenda' });
        const desk = (ag.corpo.aree || []).filter(a => a.id === 'desk-revilaw')[0] || {};
        esigi(desk.attiva === true, 'per chi organizza il desk c\'e\' gia\', senza doverlo accendere');
        esigi((desk.slot || []).length > 0 && (desk.slot || []).every(s => s.stato === 'libero'),
            'con i suoi orari, tutti liberi');
        const r = await chiamaAzienda('p:09302991212', { azione: 'b2b-azienda-leggi' });
        esigi(!(r.aree || []).some(a => /Revilaw/i.test(a.nome)), 'nel modulo dell\'azienda non compare');
        const p = await prenota('p:09302991212', 'desk-revilaw', '10:00');
        esigi(p.esitoPrima && p.esitoPrima.ok === false && p.esitoPrima.motivo === 'area',
            'e chi provasse a prenotarlo lo stesso si sente dire di no', JSON.stringify(p.esitoPrima));
        esigi(!slotDi('desk-revilaw', '10:00'), 'e al desk non resta nessun orario occupato');
    });

    await prova('5) Un\'altra esigenza si porta al desk, e la mail arriva con il foglio', async () => {
        await dueAziende();
        const doc = docDi('p:09302991212');
        await prenota('p:09302991212', 'merito-creditizio', '10:00', [],
            [{ perDoc: doc, testo: 'Vorremmo capire come si apre una posizione a Bagnoli.' }]);
        posta.length = 0;
        const az = documentoAzienda('p:09302991212');
        const eId = (az.esigenze || [])[0].id;
        const r = await staff({
            azione: 'esigenza-assegna', aziendaId: az.id, esigenzaId: eId,
            area: 'desk-revilaw', ora: '11:00'
        });
        esigi(r.stato === 200 && r.corpo.ok === true, 'l\'esigenza si porta al desk');
        esigi(r.corpo.interno === true, 'e il servizio dice che e\' un tavolo interno');
        const preso = slotDi('desk-revilaw', '11:00');
        esigi(!!preso && preso.aziendaNome === 'Alfa Srl', 'l\'orario al desk e\' occupato dall\'azienda');
        esigi(Number(preso.scelta) === 4,
            'con un numero di preferenza suo: non e\' una delle tre che ha scelto l\'impresa');
        esigi(String(preso.nota || '').indexOf('Bagnoli') >= 0,
            'e sul foglio del desk si legge di cosa si tratta');
        esigi(!!slotDi('merito-creditizio', '10:00'),
            'la prima preferenza resta dov\'era: portare un\'esigenza non cancella un incontro');
        const m = posta[posta.length - 1] || {};
        esigi(/desk Revilaw/i.test(String(m.subject || '')), 'all\'azienda arriva una mail che lo dice nell\'oggetto');
        esigi((m.attachments || []).length === 1 && /pdf/.test((m.attachments || [{}])[0].contentType || ''),
            'con il foglio in PDF allegato');
        esigi(/11:00/.test(String(m.text || '')), 'e dentro c\'e\' l\'ora a cui presentarsi');
        const dopo = await chiamaAzienda('p:09302991212', { azione: 'b2b-azienda-leggi' });
        esigi(!(dopo.aree || []).some(a => /Revilaw/i.test(a.nome)),
            'nel modulo il desk continua a non comparire, nemmeno adesso che ci ha un appuntamento');
        esigi(!(dopo.assegnati || []).some(x => /Revilaw/i.test(x.areaNome)),
            'e nemmeno fra gli incontri assegnati');
        esigi((dopo.esigenze || []).length === 0,
            'e la domanda non torna fra quelle aperte: e\' diventata un incontro, e la riga libera resta libera');
    });

    await prova('6) La stessa esigenza non si porta a un tavolo due volte', async () => {
        const az = documentoAzienda('p:09302991212');
        const eId = (az.esigenze || [])[0].id;
        esigi((az.esigenze || [])[0].stato === 'assegnata', 'l\'esigenza risulta assegnata');
        const r = await staff({
            azione: 'esigenza-assegna', aziendaId: az.id, esigenzaId: eId,
            area: 'desk-revilaw', ora: '12:00'
        });
        esigi(r.stato === 409 && r.corpo.motivo === 'gia-assegnata',
            'il secondo operatore si sente dire che c\'e\' gia\' andato qualcuno');
        esigi(!slotDi('desk-revilaw', '12:00'), 'e il secondo orario non viene occupato');
    });

    await prova('7) Un\'altra esigenza si cancella, e sparisce davvero', async () => {
        await dueAziende();
        const doc = docDi('p:07307010632');
        await prenota('p:07307010632', '', '', [], [{ perDoc: doc, testo: 'Ci risentiamo dopo il convegno.' }]);
        const az = documentoAzienda('p:07307010632');
        const eId = (az.esigenze || [])[0].id;
        posta.length = 0;
        const r = await staff({ azione: 'esigenza-cancella', aziendaId: az.id, esigenzaId: eId });
        esigi(r.stato === 200 && r.corpo.ok === true, 'la cancellazione va a buon fine');
        esigi((documentoAzienda('p:07307010632').esigenze || []).length === 0, 'e la riga non c\'e\' piu\'');
        esigi(!posta.length, 'nessuna mail: non e\' successo niente da raccontare all\'azienda');
        const r2 = await staff({ azione: 'esigenza-cancella', aziendaId: az.id, esigenzaId: eId });
        esigi(r2.stato === 409, 'cancellarla due volte lo dice, invece di rispondere "fatto"');
    });

    await prova('8) Chi non manda gli inviti non tocca le esigenze', async () => {
        await dueAziende();
        const doc = docDi('p:09302991212');
        await prenota('p:09302991212', '', '', [], [{ perDoc: doc, testo: 'Una domanda.' }]);
        const az = documentoAzienda('p:09302991212');
        const eId = (az.esigenze || [])[0].id;
        const r = await staff({ azione: 'esigenza-cancella', aziendaId: az.id, esigenzaId: eId }, false);
        esigi(r.stato === 403, 'chi guarda e basta viene respinto');
        esigi((documentoAzienda('p:09302991212').esigenze || []).length === 1, 'e l\'esigenza resta dov\'era');
    });

    await prova('9) Una preferenza scartata dal riepilogo sparisce anche dal modulo', async () => {
        await dueAziende();
        const doc = docDi('p:09302991212');
        await prenota('p:09302991212', 'merito-creditizio', '10:00',
            [{ pos: 2, area: 'modello-231', perDoc: doc }]);
        const az = documentoAzienda('p:09302991212');
        const codaId = (az.coda || [])[0].id;
        const r = await staff({ azione: 'coda-scarta', aziendaId: az.id, codaId: codaId });
        esigi(r.stato === 200, 'la preferenza si scarta');
        esigi((documentoAzienda('p:09302991212').coda || [])[0].stato === 'scartata',
            'e da noi resta scritta: il giorno dopo qualcuno chiedera\' perche\' quell\'impresa non ha avuto il secondo incontro');
        const letto = await chiamaAzienda('p:09302991212', { azione: 'b2b-azienda-leggi' });
        esigi((letto.coda || []).length === 0,
            'nel modulo pero\' non c\'e\' piu\': tornava selezionata, e l\'azienda credeva di averla ancora',
            JSON.stringify(letto.coda));
        esigi(!!letto.prima, 'la prima preferenza invece resta dov\'era');
    });

    await prova('10) Annullato l\'incontro, la preferenza torna fra quelle da assegnare', async () => {
        await dueAziende();
        const doc = docDi('p:09302991212');
        await prenota('p:09302991212', 'merito-creditizio', '10:00',
            [{ pos: 2, area: 'modello-231', perDoc: doc }]);
        const az = documentoAzienda('p:09302991212');
        const codaId = (az.coda || [])[0].id;
        const a = await staff({
            azione: 'coda-assegna', aziendaId: az.id, codaId: codaId,
            area: 'modello-231', ora: '11:00'
        });
        esigi(a.stato === 200, 'la seconda preferenza si assegna');
        const dopoAss = await chiamaAzienda('p:09302991212', { azione: 'b2b-azienda-leggi' });
        esigi((dopoAss.coda || [])[0].stato === 'assegnata', 'e nel modulo risulta fissata');
        // ora si annulla quell'incontro dal riepilogo
        const b = await staff({ azione: 'agenda-libera', area: 'modello-231', chiave: '1100', avvisa: false });
        esigi(b.stato === 200, 'l\'incontro si annulla');
        esigi(!slotDi('modello-231', '11:00'), 'e l\'orario torna libero');
        const dopo = await chiamaAzienda('p:09302991212', { azione: 'b2b-azienda-leggi' });
        esigi((dopo.coda || []).length === 1 && dopo.coda[0].stato === 'attesa',
            'nel modulo la preferenza non dice piu "gia fissato": e di nuovo in attesa',
            JSON.stringify(dopo.coda));
        const r = await staff({ azione: 'riepilogo' });
        const desk = (r.corpo.desk || []).filter(d => d.id === 'modello-231')[0] || {};
        esigi((desk.coda || []).length === 1,
            'e nel riepilogo torna fra le preferenze da assegnare: i due schermi dicono la stessa cosa',
            JSON.stringify((desk.coda || []).map(c => c.aziendaNome)));
    });

    await prova('11) Annullato l\'appuntamento al desk, l\'esigenza torna aperta', async () => {
        await dueAziende();
        const doc = docDi('p:09302991212');
        await prenota('p:09302991212', '', '', [], [{ perDoc: doc, testo: 'Una domanda nostra.' }]);
        const az = documentoAzienda('p:09302991212');
        const eId = (az.esigenze || [])[0].id;
        await staff({ azione: 'esigenza-assegna', aziendaId: az.id, esigenzaId: eId, area: 'desk-revilaw', ora: '11:00' });
        esigi((documentoAzienda('p:09302991212').esigenze || [])[0].stato === 'assegnata', 'l\'esigenza risulta portata al desk');
        await staff({ azione: 'agenda-libera', area: 'desk-revilaw', chiave: '1100', avvisa: false });
        const dopo = await chiamaAzienda('p:09302991212', { azione: 'b2b-azienda-leggi' });
        esigi((dopo.esigenze || []).length === 1,
            'annullato l\'appuntamento, la domanda torna in elenco invece di sparire per sempre',
            JSON.stringify(dopo.esigenze));
        const r = await staff({ azione: 'riepilogo' });
        esigi((r.corpo.esigenze || []).filter(e => e.stato === 'aperta').length === 1,
            'e nel riepilogo torna fra quelle da guardare');
    });

    await prova('12) Il programma nuovo manda sul palco chi tiene il tavolo: gli incontri si allineano', async () => {
        await dueAziende();
        await prenota('p:09302991212', 'modello-231', '11:00');
        esigi(!!slotDi('modello-231', '11:00'), 'l\'impresa ha il suo incontro alle 11:00');
        /* La scaletta NUOVA, quella che si sta salvando: Anna, che tiene il
           primo tavolo del 231, modera una tavola rotonda a quell'ora. */
        const voci = [{
            id: 'v1', tipo: 'tavola', titolo: 'Tavola rotonda sul 231',
            dalle: '10:50', alle: '11:40',
            moderatore: { nome: 'Anna Verdi' }, partecipanti: []
        }];
        const r = await staff({ azione: 'b2b-allinea', voci: voci, avvisa: false });
        esigi(r.stato === 200 && r.corpo.ok === true, 'l\'allineamento va a buon fine', JSON.stringify(r.corpo).slice(0, 200));
        esigi((r.corpo.spostati || []).length === 1, 'un incontro spostato', JSON.stringify(r.corpo.spostati));
        esigi(!slotDi('modello-231', '11:00'), 'il tavolo di chi va sul palco e libero a quell\'ora');
        esigi(!!slotDi('modello-231-b', '11:00'),
            'e l\'impresa tiene la sua ora: cambia solo chi la riceve, perche\' il gemello quell\'ora ce l\'ha');
        const dopo = await chiamaAzienda('p:09302991212', { azione: 'b2b-azienda-leggi' });
        esigi(!!dopo.prima && dopo.prima.ora === '11:00' && /231/.test(dopo.prima.areaNome),
            'nel modulo l\'impresa legge lo stesso argomento alla stessa ora');
    });

    await prova('13) Se sul palco ci vanno tutti e due, l\'incontro si sposta d\'ora', async () => {
        await dueAziende();
        await prenota('p:09302991212', 'modello-231', '11:00');
        const voci = [{
            id: 'v1', tipo: 'tavola', titolo: 'Tavola rotonda sul 231',
            dalle: '10:50', alle: '11:40',
            moderatore: { nome: 'Anna Verdi' },
            partecipanti: [{ nome: 'Luca Bianchi' }]
        }];
        const r = await staff({ azione: 'b2b-allinea', voci: voci, avvisa: false });
        esigi((r.corpo.spostati || []).length === 1, 'l\'incontro si sposta lo stesso', JSON.stringify(r.corpo));
        esigi(!slotDi('modello-231', '11:00') && !slotDi('modello-231-b', '11:00'),
            'nessuno dei due gemelli riceve mentre i suoi sono sul palco');
        const dove = (r.corpo.spostati || [])[0] || {};
        esigi(dove.a && dove.a.ora !== '11:00', 'e l\'ora nuova e un\'altra', JSON.stringify(dove.a));
        /* Il margine di prudenza vale anche qui: l'ora nuova non deve cadere
           dentro la fascia del palco allargata di dieci minuti. */
        const min = h => Number(String(h).split(':')[0]) * 60 + Number(String(h).split(':')[1]);
        esigi(min(dove.a.ora) + 30 <= 10 * 60 + 40 || min(dove.a.ora) >= 11 * 60 + 50,
            'e nemmeno appiccicata alla tavola rotonda: il margine di dieci minuti vale anche adesso', dove.a.ora);
    });

    await prova('14) Con il programma nuovo si avvisa una volta sola per azienda', async () => {
        await dueAziende();
        await prenota('p:09302991212', 'modello-231', '11:00',
            [{ pos: 2, area: 'merito-creditizio', perDoc: docDi('p:09302991212') }]);
        const az = documentoAzienda('p:09302991212');
        await staff({
            azione: 'coda-assegna', aziendaId: az.id, codaId: (az.coda || [])[0].id,
            area: 'merito-creditizio', ora: '11:30'
        });
        posta.length = 0;
        const voci = [
            { id: 'v1', tipo: 'tavola', titolo: 'Tavola 231', dalle: '10:50', alle: '11:40', moderatore: { nome: 'Anna Verdi' }, partecipanti: [] },
            { id: 'v2', tipo: 'tavola', titolo: 'Tavola credito', dalle: '11:20', alle: '12:00', moderatore: { nome: 'Ida Neri' }, partecipanti: [] }
        ];
        const r = await staff({ azione: 'b2b-allinea', voci: voci });
        esigi((r.corpo.spostati || []).length === 2, 'tutti e due gli incontri si spostano', JSON.stringify(r.corpo.spostati));
        esigi(posta.length === 1, 'ma la mail e una sola: lo stesso foglio due volte non serve a nessuno', 'mail: ' + posta.length);
        esigi((r.corpo.avvisati || []).length === 1, 'e la risposta dice chi e stato avvisato');
    });

    await prova('15) Un\'azienda si elimina dagli incontri: gli orari tornano liberi', async () => {
        await dueAziende();
        await prenota('p:09302991212', 'modello-231', '10:00');
        await prenota('p:07307010632', 'merito-creditizio', '10:00');
        const az = documentoAzienda('p:09302991212');
        esigi(!!az && !!slotDi('modello-231', '10:00'), 'l\'azienda c\'e\' e ha il suo incontro');
        const r = await staff({ azione: 'b2b-azienda-elimina', aziendaId: az.id });
        esigi(r.stato === 200 && r.corpo.ok === true, 'l\'eliminazione va a buon fine', JSON.stringify(r.corpo));
        esigi((r.corpo.liberati || []).length === 1, 'e dice quanti orari tornano liberi', JSON.stringify(r.corpo.liberati));
        esigi(!slotDi('modello-231', '10:00'), 'quell\'ora e\' libera per un\'altra impresa');
        esigi(!documentoAzienda('p:09302991212'), 'e il documento dell\'azienda non c\'e\' piu\': il collegamento non apre niente');
        esigi(!!slotDi('merito-creditizio', '10:00'),
            'l\'incontro di un\'ALTRA azienda resta dov\'era: si elimina una riga, non l\'elenco');
        const letto = await chiamaAzienda('p:09302991212', { azione: 'b2b-azienda-leggi' });
        esigi(letto.ok === false, 'e chi apre quel collegamento non trova piu\' niente', JSON.stringify(letto).slice(0, 120));
    });

    await prova('16) Eliminare un\'azienda dagli incontri e\' cosa da amministratore', async () => {
        await dueAziende();
        await prenota('p:09302991212', 'modello-231', '10:00');
        const az = documentoAzienda('p:09302991212');
        const r = await AGENDA.esegui({
            db: db, body: { sezione: 'b2b', evento: EVENTO, azione: 'b2b-azienda-elimina', aziendaId: az.id },
            email: 'socio@revilaw.it', collab: '', eAdmin: false, ePartner: true
        });
        esigi(r.stato === 403, 'l\'equity partner, che pure manda gli inviti, viene respinto', 'stato=' + r.stato);
        esigi(!!documentoAzienda('p:09302991212') && !!slotDi('modello-231', '10:00'),
            'e non si e\' toccato niente');
    });

    console.log('\n' + ok + ' ok, ' + ko + ' KO');
    process.exit(ko ? 1 : 0);
})();
