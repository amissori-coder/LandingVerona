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
        eventoDati: { titolo: 'Napoli', quando: '2 ottobre 2026', luogo: 'Hotel Eurostars Excelsior', indirizzo: 'Via Partenope 48', scadenzaB2B: '30 settembre' },
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
            eventoDati: { titolo: 'Napoli', quando: '2 ottobre 2026', luogo: 'Hotel Eurostars Excelsior', indirizzo: 'Via Partenope 48', scadenzaB2B: '30 settembre' },
            mail: {
                oggetto: 'Invito riservato per {{NOME}} - Incontri B2B',
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

    await prova('1) L\'invito per azienda: una mail per indirizzo, e ognuna nomina GLI ALTRI', async () => {
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
        /* UNA MAIL PER INDIRIZZO. Prima ne partiva una sola con tutti fra i
           destinatari, e la frase "l'invito e' arrivato anche a" elencava
           tutti - compreso chi la stava leggendo, che si vedeva annunciare
           se stesso. */
        esigi(posta.length === 2, 'parte una mail per ciascun indirizzo', 'mail: ' + posta.length);
        esigi(r.mail === 2, 'e il conto delle mail lo dice, accanto a quello delle aziende');
        const aMario = posta.filter(m => m.to === 'mario@alfa.it')[0] || {};
        const adAnna = posta.filter(m => m.to === 'anna@alfa.it')[0] || {};
        esigi(!!aMario.to && !!adAnna.to, 'ognuna al suo destinatario, da sola');
        esigi(/Anche a Anna Neri/.test(aMario.text || '') && !/Mario Rossi/.test(aMario.text || ''),
            'Mario legge che l\'altra e Anna, e non si vede annunciare se stesso');
        esigi(/Anche a Mario Rossi/.test(adAnna.text || '') && !/Anna Neri/.test(adAnna.text || ''),
            'e Anna legge che l\'altro e Mario');
        const az = documentoAzienda('p:01234567891');
        esigi(az && az.nome === 'Alfa S.r.l.' && az.referenti.length === 2, 'il documento dell\'azienda esiste, con i suoi referenti');
        esigi(dati.get('iscrizioni/mario').b2bAzienda.id === idAziendaDi('p:01234567891')
            && dati.get('iscrizioni/anna').b2bAzienda.id === idAziendaDi('p:01234567891'),
            'e l\'azienda resta scritta su TUTTE le schede, non solo sulla prima');
        esigi(posta.every(m => (m.html || '').indexOf(idAziendaDi('p:01234567891')) > 0),
            'il collegamento e lo stesso in tutte e due: e dell\'azienda, non della persona');
        const conCopia = posta.filter(m => m.bcc);
        esigi(conCopia.length === 1,
            'e la copia nascosta a chi manda parte una volta per azienda, non una per referente');
        /* CHE DENTRO CI SIA L'INDIRIZZO GIUSTO, non solo che il campo esista:
           una copia nascosta a nessuno e' indistinguibile, da qui, da una
           copia nascosta che funziona - e la si scopre il giorno che serve
           dimostrare che l'invito e' partito. */
        esigi(JSON.stringify((conCopia[0] || {}).bcc) === '[\"staff@revilaw.it\"]',
            'e in copia c e chi ha premuto Invia', JSON.stringify((conCopia[0] || {}).bcc));
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
        esigi(Array.isArray(r.regole) && r.regole.length === 7 && /prima preferenza \u00e8 una prenotazione vera e propria/.test(r.regole[1]),
            'le regole di prenotazione arrivano dal servizio, scritte una volta sola');
        /* Le tre cose che chi prenota sbaglia piu' spesso, e che le regole
           devono dire per intero: come si cambia la prima (si sposta da se',
           senza disdire nulla), che cosa sono la seconda e la terza (non
           prenotano), e che una volta assegnate non si spostano ma si possono
           solo annullare. */
        esigi(/Non occorre annullarla prima/.test(r.regole[2]),
            'e dicono che la prima si sposta senza doverla annullare');
        esigi(/non costituiscono una prenotazione/.test(r.regole[3]),
            'che la seconda e la terza non prenotano niente');
        esigi(/\u00e8 confermato/.test(r.regole[4]) && /potete annullarlo/.test(r.regole[4]),
            'e che un orario assegnato e confermato: si puo solo annullare');
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
        esigi(/in attesa di un orario/i.test(posta[0].text || ''), 'e che la seconda preferenza aspetta un orario');
        /* CHE COSA NE SARA'. "Aspetta un orario" da solo lascia in sospeso la
           domanda vera - qualcuno ci pensera'? - e la risposta va detta: se al
           tavolo restano posti, l'orario lo assegniamo noi. La stessa frase sta
           sulla pagina, dopo il salvataggio: due versioni diverse della stessa
           regola la farebbero sembrare incerta, e questa prova le tiene legate. */
        const unaRiga = (posta[0].text || '').replace(/\n/g, ' ');
        esigi(/restano posti dopo le prime preferenze di tutte le imprese/.test(unaRiga),
            'e che diventano un incontro solo se a quel tavolo restano posti');
        esigi(/l'orario lo assegniamo noi fra quelli rimasti/.test(unaRiga),
            'e che l orario lo assegniamo noi fra quelli rimasti');
        esigi(/sono confermati/.test(unaRiga) && /potete annullarlo/.test(unaRiga),
            'e che un orario assegnato e confermato: si puo solo annullare');
        esigi(/La prima preferenza, invece, si sposta da s\u00e9/.test(unaRiga),
            'mentre la prima si sposta da se, senza annullare nulla');
        esigi(/30 settembre/.test(unaRiga), 'e entro quando si sceglie');
        const pagina = require('fs').readFileSync(
            require('path').join(__dirname, '..', '..', 'incontri_b2b', 'index.html'), 'utf8');
        /* Il testo della pagina sta in un sorgente che va a capo dove gli
           pare: si cerca un pezzo che sopravviva all'andare a capo. */
        esigi(/posti dopo le prime preferenze di tutte le imprese/.test(pagina),
            'la pagina, dopo il salvataggio, dice la stessa cosa');
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
        esigi(/Rivedete le prenotazioni|Scegliete un incontro/.test(posta[0].text || ''), 'con il collegamento per riprenotare');
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

    await prova('11bis) L\'orario assegnato che non va bene, l\'azienda lo annulla', async () => {
        /* L'ora delle preferenze la scegliamo NOI fra quelle rimaste, e puo'
           cadere quando quella persona non c'e'. Prima la pagina diceva "per
           spostarlo ci scriva": nel frattempo il posto restava impegnato per
           qualcuno che non sarebbe venuto, e liberarlo richiedeva che
           qualcuno leggesse una mail e lo facesse a mano. */
        const prima = await chiamaAzienda('p:01234567891', { azione: 'b2b-azienda-leggi' });
        const ass = prima.assegnati[0];
        esigi(!!ass && ass.areaVera === 'esg' && ass.chiave === '1200',
            'il modulo sa su quale tavolo vero e a che ora sta quell\'incontro');
        posta.length = 0;
        const r = await chiamaAzienda('p:01234567891', {
            azione: 'b2b-azienda-annulla', area: ass.areaVera, chiave: ass.chiave
        });
        esigi(r.ok === true, 'l\'annullamento riesce');
        esigi(!slotDi('esg', '12:00'), 'e quell\'orario e tornato libero per un\'altra impresa');
        const coda = (documentoAzienda('p:01234567891').coda || []).filter(c => c.area === 'esg')[0];
        esigi(!!coda && coda.stato === 'attesa',
            'la preferenza non sparisce: torna in attesa, perche quel tavolo lo vogliono ancora', JSON.stringify(coda));
        esigi((r.assegnati || []).length === 0, 'e il modulo non lo mostra piu fra quelli assegnati');
        esigi(posta.length === 1 && /annullato/i.test(String(posta[0].subject || '')),
            'a tutti i referenti parte la mail con il foglio aggiornato', String((posta[0] || {}).subject || ''));
    });

    await prova('11ter) Un\'azienda non puo annullare l\'orario di un\'altra', async () => {
        /* Il collegamento e' dell'azienda, e da li' si tocca solo cio' che e'
           suo. Senza questo controllo basterebbe indovinare tavolo e ora per
           cancellare l'incontro di chiunque. */
        // un'altra impresa invitata, con un suo incontro a un'ora sua
        mettiReferente('laura', 'Laura', 'Balzano', 'Balzano Srl', 'laura@balzano.it', '07307010632');
        await invita([{ chiave: 'p:07307010632', nome: 'Balzano Srl', piva: '07307010632', referenti: [{ doc: 'laura' }] }]);
        const letto = await chiamaAzienda('p:07307010632', { azione: 'b2b-azienda-leggi' });
        await chiamaAzienda('p:07307010632', {
            azione: 'b2b-azienda-salva', rev: letto.rev,
            prima: { area: 'revisione', ora: '11:00', perDoc: 'laura' }, coda: [], esigenze: []
        });
        esigi(!!slotDi('revisione', '11:00'), 'l\'altra azienda ha il suo incontro');
        const r = await chiamaAzienda('p:01234567891', {
            azione: 'b2b-azienda-annulla', area: 'revisione', chiave: '1100'
        });
        esigi(r.ok !== true, 'la richiesta viene respinta', 'stato=' + r._stato + ' ' + (r.msg || ''));
        esigi(!!slotDi('revisione', '11:00'), 'e l\'incontro dell\'altra azienda resta dov\'e');
    });

    await prova('18) Lo stesso tavolo due volte: non si salva', async () => {
        /* Lo stesso argomento indicato due volte non e' una scelta: e' la
           stessa cosa chiesta due volte, e quando poi la seconda viene
           assegnata l'impresa si ritrova due incontri allo stesso tavolo -
           mentre quel posto manca a un'altra azienda. */
        azzera();
        dati.set('utenti/staff@revilaw.it', { ruolo: 'admin' });
        mettiAgenda({ 'merito-creditizio': {}, 'esg': {}, 'modello-231': {}, 'modello-231-b': {} });
        mettiReferente('mario', 'Mario', 'Rossi', 'Alfa', 'mario@alfa.it', '01234567891');
        await invita([{ chiave: 'p:01234567891', nome: 'Alfa S.r.l.', piva: '01234567891', referenti: [{ doc: 'mario' }] }]);
        const letto = await chiamaAzienda('p:01234567891', { azione: 'b2b-azienda-leggi' });
        const r = await chiamaAzienda('p:01234567891', {
            azione: 'b2b-azienda-salva', rev: letto.rev,
            prima: { area: 'esg', ora: '10:00', perDoc: 'mario' },
            coda: [{ pos: 2, area: 'esg', perDoc: 'mario' }], esigenze: []
        });
        esigi(r.ok !== true && r.motivo === 'doppione', 'il salvataggio si ferma', JSON.stringify(r.motivo));
        esigi(/due volte/.test(String(r.msg || '')) && /seconda/.test(String(r.msg || '')),
            'e dice quale tavolo e quale preferenza sistemare', String(r.msg || ''));
        esigi(!slotDi('esg', '10:00'), 'e non salva meta scelta: l orario non e stato preso');
        /* I GEMELLI sono lo stesso tavolo per chi sceglie: indicarne uno come
           prima e l'altro come seconda e' lo stesso doppione. */
        const r2 = await chiamaAzienda('p:01234567891', {
            azione: 'b2b-azienda-salva', rev: letto.rev,
            prima: { area: 'modello-231', ora: '10:00', perDoc: 'mario' },
            coda: [{ pos: 2, area: 'modello-231-b', perDoc: 'mario' }], esigenze: []
        });
        esigi(r2.ok !== true && r2.motivo === 'doppione', 'anche con i due tavoli gemelli, che per l impresa sono uno');
    });

    await prova('19) Assegnare sul tavolo dove ha gia la prima: si viene fermati', async () => {
        /* Non e' una cosa che si risolve da se': e' un incontro che sparirebbe
           da un foglio gia' spedito. Chi assegna si sente dire di no e sceglie
           un altro tavolo. */
        azzera();
        dati.set('utenti/staff@revilaw.it', { ruolo: 'admin' });
        mettiAgenda({ 'adeguati-assetti': {}, 'esg': {} });
        mettiReferente('mario', 'Mario', 'Rossi', 'Alfa', 'mario@alfa.it', '01234567891');
        await invita([{ chiave: 'p:01234567891', nome: 'Alfa S.r.l.', piva: '01234567891', referenti: [{ doc: 'mario' }] }]);
        const letto = await chiamaAzienda('p:01234567891', { azione: 'b2b-azienda-leggi' });
        await chiamaAzienda('p:01234567891', {
            azione: 'b2b-azienda-salva', rev: letto.rev,
            prima: { area: 'adeguati-assetti', ora: '10:00', perDoc: 'mario' },
            coda: [{ pos: 2, area: 'esg', perDoc: 'mario' }], esigenze: []
        });
        esigi(!!slotDi('adeguati-assetti', '10:00'), 'la prima preferenza e prenotata');
        // chi organizza assegna la seconda preferenza sullo STESSO tavolo
        const az = documentoAzienda('p:01234567891');
        const codaId = (az.coda || [])[0].id;
        const r = await chiamaPresenze({
            sezione: 'b2b', azione: 'coda-assegna', aziendaId: az.id, codaId: codaId,
            area: 'adeguati-assetti', ora: '11:00', avvisa: false
        });
        esigi(r.ok !== true && r.motivo === 'stesso-tavolo', 'l assegnazione viene rifiutata', JSON.stringify(r.motivo));
        esigi(/Adeguati assetti/.test(String(r.msg || '')) && /prima preferenza/.test(String(r.msg || '')),
            'e il messaggio dice dove e perche', String(r.msg || ''));
        esigi(!slotDi('adeguati-assetti', '11:00'), 'nessun secondo incontro a quel tavolo');
        esigi(!!slotDi('adeguati-assetti', '10:00'), 'e la prima preferenza resta dov era');
        const dopo = (documentoAzienda('p:01234567891').coda || [])[0];
        esigi(dopo && dopo.stato === 'attesa',
            'la preferenza torna in attesa: presa in carico e non assegnata, sparirebbe dal riepilogo',
            JSON.stringify(dopo && dopo.stato));
        /* LA RETE, sotto. Forzando - o per un doppione nato prima di questa
           regola - l'ultimo resta e il primo si libera: due incontri appesi
           allo stesso tavolo non devono restare comunque. */
        const forz = await chiamaPresenze({
            sezione: 'b2b', azione: 'coda-assegna', aziendaId: az.id, codaId: codaId,
            area: 'adeguati-assetti', ora: '11:00', avvisa: false, forzato: true
        });
        esigi(forz.ok === true, 'forzando si passa');
        esigi(!!slotDi('adeguati-assetti', '11:00') && !slotDi('adeguati-assetti', '10:00'),
            'e resta solo l ultimo: un tavolo, un incontro per azienda');
        esigi((forz.doppiLiberati || []).length === 1 && forz.doppiLiberati[0].ora === '10:00',
            'con scritto quale incontro e stato tolto', JSON.stringify(forz.doppiLiberati));
    });

    await prova('20) E nemmeno dove ha gia CHIESTO di andare', async () => {
        /* Spostare la terza sul tavolo della seconda vorrebbe dire assegnarle
           due volte lo stesso argomento appena la seconda trova posto. */
        azzera();
        dati.set('utenti/staff@revilaw.it', { ruolo: 'admin' });
        mettiAgenda({ 'adeguati-assetti': {}, 'esg': {}, 'revisione': {} });
        mettiReferente('mario', 'Mario', 'Rossi', 'Alfa', 'mario@alfa.it', '01234567891');
        await invita([{ chiave: 'p:01234567891', nome: 'Alfa S.r.l.', piva: '01234567891', referenti: [{ doc: 'mario' }] }]);
        const letto = await chiamaAzienda('p:01234567891', { azione: 'b2b-azienda-leggi' });
        await chiamaAzienda('p:01234567891', {
            azione: 'b2b-azienda-salva', rev: letto.rev,
            prima: { area: 'adeguati-assetti', ora: '10:00', perDoc: 'mario' },
            coda: [{ pos: 2, area: 'esg', perDoc: 'mario' }, { pos: 3, area: 'revisione', perDoc: 'mario' }],
            esigenze: []
        });
        const az = documentoAzienda('p:01234567891');
        const terza = (az.coda || []).filter(c => c.pos === 3)[0];
        const r = await chiamaPresenze({
            sezione: 'b2b', azione: 'coda-assegna', aziendaId: az.id, codaId: terza.id,
            area: 'esg', ora: '11:00', avvisa: false
        });
        esigi(r.ok !== true && r.motivo === 'stesso-tavolo',
            'la terza non si assegna sul tavolo della seconda', JSON.stringify(r.motivo));
        esigi(/seconda preferenza/.test(String(r.msg || '')), 'e il messaggio dice di chi e quel tavolo', String(r.msg || ''));
        esigi(!slotDi('esg', '11:00'), 'e nessun orario viene impegnato');
    });

    await prova('21) Due aziende sullo stesso orario, nello stesso istante', async () => {
        /* Non e' un caso raro: gli inviti partono insieme, e alle dieci del
           mattino dopo sono in venti sulla stessa pagina. Il posto e' uno, e
           la transazione e' l'unico punto in cui la risposta e' vera: fuori,
           fra la lettura e la scrittura, quell'ora puo' essere gia' di un
           altro. Chi arriva secondo deve sentirselo dire - e non deve perdere
           il resto di quello che aveva scritto. */
        azzera();
        dati.set('utenti/staff@revilaw.it', { ruolo: 'admin' });
        mettiAgenda({ 'merito-creditizio': {}, 'esg': {}, 'revisione': {} });
        mettiReferente('mario', 'Mario', 'Rossi', 'Alfa', 'mario@alfa.it', '01234567891');
        mettiReferente('laura', 'Laura', 'Balzano', 'Balzano Srl', 'laura@balzano.it', '07307010632');
        await invita([
            { chiave: 'p:01234567891', nome: 'Alfa S.r.l.', piva: '01234567891', referenti: [{ doc: 'mario' }] },
            { chiave: 'p:07307010632', nome: 'Balzano Srl', piva: '07307010632', referenti: [{ doc: 'laura' }] }
        ]);
        const l1 = await chiamaAzienda('p:01234567891', { azione: 'b2b-azienda-leggi' });
        const l2 = await chiamaAzienda('p:07307010632', { azione: 'b2b-azienda-leggi' });
        esigi((l1.aree.filter(a => a.id === 'merito-creditizio')[0].slot.filter(s => s.ora === '10:00')[0] || {}).stato === 'libero',
            'per tutti e due quell\'ora risulta libera: e la fotografia che hanno in mano');
        const [a, b] = await Promise.all([
            chiamaAzienda('p:01234567891', {
                azione: 'b2b-azienda-salva', rev: l1.rev,
                prima: { area: 'merito-creditizio', ora: '10:00', perDoc: 'mario' },
                coda: [{ pos: 2, area: 'esg', perDoc: 'mario' }],
                esigenze: [{ perDoc: 'mario', testo: 'Una domanda che non deve andare persa.' }]
            }),
            chiamaAzienda('p:07307010632', {
                azione: 'b2b-azienda-salva', rev: l2.rev,
                prima: { area: 'merito-creditizio', ora: '10:00', perDoc: 'laura' },
                coda: [{ pos: 2, area: 'revisione', perDoc: 'laura' }], esigenze: []
            })
        ]);
        const preso = slotDi('merito-creditizio', '10:00');
        esigi(!!preso, 'l\'orario e stato preso');
        const vincitore = preso.aziendaNome;
        esigi(['Alfa S.r.l.', 'Balzano Srl'].indexOf(vincitore) >= 0, 'da una delle due', String(vincitore));
        /* E UNA SOLA. Due scritture andate a buon fine sullo stesso posto
           vorrebbero dire due imprese davanti allo stesso tavolo alla stessa
           ora, e uno dei due manderemmo via. */
        const vinte = [a, b].filter(x => x.esitoPrima && x.esitoPrima.ok);
        const perse = [a, b].filter(x => x.esitoPrima && !x.esitoPrima.ok);
        esigi(vinte.length === 1 && perse.length === 1, 'una prenotazione sola passa',
            JSON.stringify([a, b].map(x => x.esitoPrima)));
        esigi(perse[0].esitoPrima.motivo === 'occupato', 'e all\'altra si dice perche');
        esigi(/un\'altra azienda/.test(String(perse[0].esitoPrima.msg || ''))
            && /ne scelga un altro/.test(String(perse[0].esitoPrima.msg || '')),
            'con parole che dicono che cosa fare adesso', String(perse[0].esitoPrima.msg || ''));
        esigi(perse[0].ok === true && (perse[0].coda || []).length === 1,
            'a chi non l\'ha preso resta tutto il resto: la seconda preferenza e salvata');
        const dueVolte = Object.keys(((dati.get('b2bPrenotazioni/' + EVENTO) || {}).aree || {})['merito-creditizio'] || {});
        esigi(dueVolte.length === 1, 'e a quel tavolo c\'e un orario occupato solo', JSON.stringify(dueVolte));
    });

    await prova('22) Tolta dagli incontri, un azienda non torna e non prenota piu', async () => {
        /* Non bastava cancellare il documento dell'azienda: la scheda di ogni
           referente continuava a portare la chiave dell'impresa - quella con
           cui il suo collegamento personale apre il modulo - e la colonna
           "Invito B2B", che e' cio' che la tiene nell'elenco degli inviti.
           Bastava riaprire un collegamento, o un altro giro di inviti, e il
           documento si rifaceva con dentro gli stessi referenti: tolta di qua,
           tornava di la'. */
        azzera();
        dati.set('utenti/staff@revilaw.it', { ruolo: 'admin' });
        mettiAgenda({ 'merito-creditizio': {} });
        mettiReferente('sergio', 'Sergio', 'Miele', 'Revilaw', 'sergiomiele@revilaw.it', '04641610235');
        await invita([{ chiave: 'p:04641610235', nome: 'REVILAW', piva: '04641610235', referenti: [{ doc: 'sergio' }] }]);
        const letto = await chiamaAzienda('p:04641610235', { azione: 'b2b-azienda-leggi' });
        await chiamaAzienda('p:04641610235', {
            azione: 'b2b-azienda-salva', rev: letto.rev,
            prima: { area: 'merito-creditizio', ora: '10:00', perDoc: 'sergio' }, coda: [], esigenze: []
        });
        esigi(!!slotDi('merito-creditizio', '10:00'), 'l\'azienda ha il suo incontro');
        esigi(!!dati.get('iscrizioni/sergio').b2bAzienda, 'e la scheda del referente porta la chiave dell\'impresa');
        posta.length = 0;
        const r = await chiamaPresenze({ sezione: 'b2b', azione: 'b2b-azienda-elimina', aziendaId: idAziendaDi('p:04641610235') });
        esigi(r.ok === true && (r.liberati || []).length === 1, 'si toglie, e l\'orario torna libero');
        /* E GLIELO SI DICE. Dall'altra parte c'e' chi quel collegamento ce
           l'ha in casella, e un foglio con un'ora sopra: senza una riga da noi
           si presenta al desk a un'ora che per noi non esiste piu'. */
        esigi(posta.length === 1 && posta[0].to === 'sergiomiele@revilaw.it',
            'e all\'azienda parte l\'avviso', String((posta[0] || {}).to || ''));
        esigi(/annullati/i.test(String((posta[0] || {}).subject || '')),
            'con l\'oggetto che lo dice', String((posta[0] || {}).subject || ''));
        const testoMail = String((posta[0] || {}).text || '');
        esigi(/Merito creditizio/.test(testoMail) && /10:00/.test(testoMail),
            'dentro c\'e l\'incontro annullato, con la sua ora');
        esigi(/collegamento[\s\S]*non \u00e8 pi\u00f9 attivo/i.test(testoMail),
            'e che il collegamento non e piu attivo');
        esigi(/iscrizione al convegno resta/.test(testoMail),
            'e che l\'iscrizione al convegno non c\'entra: chi legge "annullato" pensa di essere stato tolto dall\'evento');
        /* NESSUN PULSANTE: non c'e' piu' niente da aprire, e un pulsante che
           porta a una pagina che rifiuta sarebbe una beffa. */
        esigi(!/incontri_b2b/.test(String((posta[0] || {}).html || '')),
            'e nessun collegamento alla pagina di prenotazione, che rifiuterebbe');
        esigi(!slotDi('merito-creditizio', '10:00'), 'quell\'ora e libera per un\'altra impresa');
        esigi(!documentoAzienda('p:04641610235'), 'il documento dell\'azienda non c\'e piu');
        const scheda = dati.get('iscrizioni/sergio');
        esigi(!scheda.b2bAzienda && !scheda.b2bInvito, 'e la scheda del referente non porta piu l\'invito');
        esigi(!((scheda.extra || {})['Invito B2B'] || ''),
            'nemmeno la colonna che la teneva nell\'elenco degli inviti', JSON.stringify(scheda.extra));
        esigi(!!scheda.email, 'l\'iscrizione all\'evento invece resta: quella si cancella da un\'altra parte');
        // e il collegamento non apre piu' niente: non puo' piu' prenotare
        const dopo = await chiamaAzienda('p:04641610235', { azione: 'b2b-azienda-leggi' });
        esigi(dopo._stato === 403, 'il collegamento dell\'azienda non apre piu niente', 'stato=' + dopo._stato);
        const res = risposta();
        await iscrizione({ method: 'POST', headers: {}, body: { d: 'sergio', t: NL.firmaCompleta('sergio'), azione: 'b2b-leggi' } }, res);
        esigi(res._s !== 200 || (res._j || {}).modo !== 'azienda',
            'e nemmeno il collegamento personale del referente', 'stato=' + res._s);
    });

    await prova('23) Senza prenotazioni, l\'avviso dice solo che il collegamento non vale piu', async () => {
        /* Chi non aveva ancora prenotato non deve leggersi un elenco di
           incontri annullati che non ha mai avuto: gli si dice l'unica cosa
           che lo riguarda, cioe' che quel collegamento non apre piu'. */
        azzera();
        dati.set('utenti/staff@revilaw.it', { ruolo: 'admin' });
        mettiAgenda({ 'merito-creditizio': {} });
        mettiReferente('sergio', 'Sergio', 'Miele', 'Revilaw', 'sergiomiele@revilaw.it', '04641610235');
        await invita([{ chiave: 'p:04641610235', nome: 'REVILAW', piva: '04641610235', referenti: [{ doc: 'sergio' }] }]);
        posta.length = 0;
        const r = await chiamaPresenze({ sezione: 'b2b', azione: 'b2b-azienda-elimina', aziendaId: idAziendaDi('p:04641610235') });
        esigi(r.ok === true && (r.liberati || []).length === 0, 'non c\'era niente da liberare');
        esigi(posta.length === 1, 'ma l\'avviso parte lo stesso');
        const t = String((posta[0] || {}).text || '');
        esigi(/Invito agli incontri B2B annullato/i.test(String((posta[0] || {}).subject || '')),
            'con un oggetto suo: non "incontri annullati", che non ne aveva', String((posta[0] || {}).subject || ''));
        esigi(!/Incontri annullati:|Incontro annullato:/.test(t),
            'e senza l\'elenco di incontri che non ha mai avuto');
        esigi(/collegamento per prenotare non \u00e8 pi\u00f9 valido/i.test(t),
            'dice l\'unica cosa che lo riguarda');
        esigi(!/Anche il collegamento/i.test(t),
            'e non la dice due volte: lo ha gia detto la riga d apertura');
        // e chi non vuole avvisare puo' non farlo
        azzera();
        dati.set('utenti/staff@revilaw.it', { ruolo: 'admin' });
        mettiAgenda({ 'merito-creditizio': {} });
        mettiReferente('sergio', 'Sergio', 'Miele', 'Revilaw', 'sergiomiele@revilaw.it', '04641610235');
        await invita([{ chiave: 'p:04641610235', nome: 'REVILAW', piva: '04641610235', referenti: [{ doc: 'sergio' }] }]);
        posta.length = 0;
        await chiamaPresenze({
            sezione: 'b2b', azione: 'b2b-azienda-elimina',
            aziendaId: idAziendaDi('p:04641610235'), avvisa: false
        });
        esigi(posta.length === 0, 'con avvisa: false non parte niente');
        esigi(!documentoAzienda('p:04641610235'), 'ma l\'azienda e tolta lo stesso');
    });

    await prova('24) Le mail all\'azienda danno del VOI, tutte e in ogni riga', async () => {
        /* L'invito e' dell'IMPRESA - lo stesso collegamento lo aprono piu'
           referenti - quindi in queste lettere si da' del Voi. Il registro si
           rompe dai pezzi aggiunti dopo: l'etichetta di un pulsante, una nota
           in coda, la riga del piede. Qui si guardano la conferma delle
           prenotazioni e l'avviso di annullamento, riga per riga. */
        const MAIL = require(path.join(__dirname, '..', 'lib', 'mail-ngb.js'));
        const evento = { titolo: 'Napoli', quando: '2 ottobre 2026', luogo: 'Hotel Excelsior', scadenzaB2B: '30 settembre' };
        const tavoli = [{ nome: 'Merito creditizio', orario: '10:00 - 10:30', perChi: 'Giorgia Bianchi' }];
        const lettere = [
            MAIL.confermaB2BAzienda({ evento: evento, azienda: 'EMVAS S.r.l.', tavoli: tavoli,
                coda: [{ pos: 2, nome: 'Adeguati assetti', perChi: 'Giorgia Bianchi' }] }, 'https://x/'),
            MAIL.confermaB2BAzienda({ evento: evento, azienda: 'EMVAS S.r.l.', tavoli: [] }, 'https://x/'),
            MAIL.invitoB2BAnnullato({ evento: evento, azienda: 'EMVAS S.r.l.', tavoli: tavoli }),
            MAIL.invitoB2BAnnullato({ evento: evento, azienda: 'EMVAS S.r.l.', tavoli: [] })
        ];
        const daTu = [/\bla tua\b/i, /\bil tuo\b/i, /\bScegli\b/, /\bRivedi\b/, /\bpuoi\b/, /\bricevi\b/i, /\btrovi\b/];
        let pulite = 0;
        lettere.forEach((m, i) => {
            const tutto = String(m.html) + '\n' + String(m.testo);
            const sporca = daTu.filter(r => r.test(tutto));
            if (!sporca.length) pulite++;
            else esigi(false, 'la lettera ' + (i + 1) + ' da del tu', sporca.map(r => r.source).join(' '));
        });
        esigi(pulite === lettere.length, 'nessuna delle quattro lettere da del tu');
        /* E la riga del piede dice il vero: sono mail degli incontri B2B, non
           la conferma di un'iscrizione al convegno. */
        lettere.forEach(m => {
            esigi(/riguarda gli incontri B2B del convegno/.test(String(m.html)), 'il piede dice che si tratta degli incontri B2B');
            esigi(!/conferma della tua iscrizione/.test(String(m.html)), 'e non parla della conferma d iscrizione');
        });
        /* Le versioni a solo testo non restano indietro: chi ha la posta senza
           HTML legge le stesse frasi, non quelle di due ritocchi fa. */
        const annullata = MAIL.invitoB2BAnnullato({ evento: evento, azienda: 'EMVAS S.r.l.', tavoli: tavoli });
        ['non è più valido', 'Anche il collegamento', 'iscrizione al convegno resta invariata'].forEach(frase => {
            esigi(String(annullata.html).indexOf(frase) >= 0 && String(annullata.testo).indexOf(frase) >= 0,
                'la stessa frase nell HTML e nel solo testo: "' + frase + '"');
        });
    });

    await prova('25) L\'oggetto porta il nome dell\'impresa, e il segnaposto non esce mai', async () => {
        /* L'oggetto e' la riga che decide se una mail si apre, e "invito
           riservato" da solo e' quello che scrive chiunque mandi la stessa
           lettera a duemila indirizzi: la parola che non si puo' falsificare e'
           il nome dell'azienda. La mail pero' si compone UNA VOLTA SOLA per
           tutte, con i segnaposto dentro, e a sostituirli e' il servizio: se
           l'oggetto non passasse di li' - e per molto tempo non ci passava -
           partirebbe con "{{NOME}}" scritto per esteso, che e' il peggior modo
           di dire a un'impresa che la lettera non era per lei. */
        azzera();
        dati.set('utenti/staff@revilaw.it', { ruolo: 'admin' });
        mettiAgenda({ 'merito-creditizio': {} });
        mettiReferente('sergio', 'Sergio', 'Miele', 'Revilaw', 'sergiomiele@revilaw.it', '04641610235');
        mettiReferente('anna', 'Anna', 'Bianchi', 'EMVAS S.r.l.', 'anna@emvas.tax', '09876543210');
        posta.length = 0;
        await invita([
            { chiave: 'p:04641610235', nome: 'REVILAW S.P.A.', piva: '04641610235', referenti: [{ doc: 'sergio' }] },
            { chiave: 'p:09876543210', nome: 'EMVAS S.r.l.', piva: '09876543210', referenti: [{ doc: 'anna' }] }
        ]);
        esigi(posta.length === 2, 'partono due mail, una per azienda', 'mail: ' + posta.length);
        const oggetti = posta.map(m => String(m.subject || ''));
        esigi(!oggetti.some(o => /\{\{/.test(o)),
            'nessun segnaposto rimasto scritto nell oggetto', oggetti.join(' | '));
        const perRevilaw = posta.filter(m => m.to === 'sergiomiele@revilaw.it')[0];
        const perEmvas = posta.filter(m => m.to === 'anna@emvas.tax')[0];
        esigi(String((perRevilaw || {}).subject || '').indexOf('REVILAW S.P.A.') >= 0,
            'ognuna porta nell oggetto il nome della SUA impresa', String((perRevilaw || {}).subject || ''));
        esigi(String((perEmvas || {}).subject || '').indexOf('EMVAS S.r.l.') >= 0,
            'e l altra il nome dell altra', String((perEmvas || {}).subject || ''));
        /* Il nome si scrive com'e': un oggetto non e' HTML, e le virgolette di
           "EMVAS S.r.l." non devono diventare entita'. */
        esigi(!/&amp;|&quot;|&#/.test(oggetti.join(' ')), 'e senza le virgolette dell HTML, che in un oggetto si leggono');
        /* La riga d'apertura del testo continua a nominare l'impresa: l'oggetto
           si aggiunge, non sostituisce. */
        esigi(String((perEmvas || {}).text || '').indexOf('Gentile EMVAS S.r.l.') >= 0,
            'e dentro la lettera il saluto resta quello di prima');
    });

    await prova('26) Chi preme il pulsante si ritrova in copia nascosta', async () => {
        /* Ogni mail che parte da un comando dell'area riservata torna in copia
           nascosta a chi l'ha fatta partire: e' la prova che e' partita, e con
           che testo. Il manuale lo promette da sempre; le mail dell'agenda -
           un orario assegnato, un incontro spostato, una prenotazione
           disdetta, un'azienda tolta - partivano senza.
           E il rovescio conta quanto il dritto: quando a prenotare e' L'IMPRESA
           dalla sua pagina, chi ha premuto e' lei, non c'e' nessun operatore, e
           in copia non deve finire nessuno. */
        azzera();
        dati.set('utenti/staff@revilaw.it', { ruolo: 'admin' });
        mettiAgenda({ 'merito-creditizio': {}, 'esg': {} });
        mettiReferente('sergio', 'Sergio', 'Miele', 'Revilaw', 'sergiomiele@revilaw.it', '04641610235');
        await invita([{ chiave: 'p:04641610235', nome: 'REVILAW', piva: '04641610235', referenti: [{ doc: 'sergio' }] }]);

        // 1) prenota l'IMPRESA, dalla sua pagina: nessun operatore in copia
        posta.length = 0;
        const letto = await chiamaAzienda('p:04641610235', { azione: 'b2b-azienda-leggi' });
        posta.length = 0;
        const salva = await chiamaAzienda('p:04641610235', {
            azione: 'b2b-azienda-salva', rev: letto.rev,
            prima: { area: 'merito-creditizio', ora: '10:00', perDoc: 'sergio' },
            coda: [{ pos: 2, area: 'esg', perDoc: 'sergio' }]
        });
        esigi(salva.ok === true, 'l azienda prenota dalla pagina');
        esigi(posta.length === 1 && !posta[0].bcc,
            'e la ricevuta le arriva senza copia a nessuno: qui non c e nessun operatore',
            JSON.stringify((posta[0] || {}).bcc));

        // 2) lo STAFF assegna la seconda preferenza: la copia c'e'
        posta.length = 0;
        const az = idAziendaDi('p:04641610235');
        const voce = documentoAzienda('p:04641610235').coda.filter(c => c.pos === 2)[0];
        await chiamaPresenze({ sezione: 'b2b', azione: 'coda-assegna', aziendaId: az, codaId: voce.id, area: 'esg', ora: '12:00' });
        esigi(posta.length === 1 && JSON.stringify(posta[0].bcc) === '["staff@revilaw.it"]',
            'assegnando un orario, la mail torna in copia a chi ha premuto',
            JSON.stringify((posta[0] || {}).bcc));

        // 3) lo STAFF sposta un incontro
        posta.length = 0;
        await chiamaPresenze({
            sezione: 'b2b', azione: 'b2b-sposta',
            daArea: 'merito-creditizio', daChiave: '1000', aArea: 'merito-creditizio', aOra: '11:00'
        });
        esigi(posta.length === 1 && JSON.stringify(posta[0].bcc) === '["staff@revilaw.it"]',
            'e spostandolo pure', JSON.stringify((posta[0] || {}).bcc));

        // 4) lo STAFF disdice
        posta.length = 0;
        await chiamaPresenze({ sezione: 'b2b', azione: 'agenda-libera', area: 'merito-creditizio', chiave: '1100' });
        esigi(posta.length === 1 && JSON.stringify(posta[0].bcc) === '["staff@revilaw.it"]',
            'e disdicendo un incontro', JSON.stringify((posta[0] || {}).bcc));

        // 5) lo STAFF toglie l'azienda dagli incontri
        posta.length = 0;
        await chiamaPresenze({ sezione: 'b2b', azione: 'b2b-azienda-elimina', aziendaId: az });
        esigi(posta.length === 1 && JSON.stringify(posta[0].bcc) === '["staff@revilaw.it"]',
            'e togliendo l azienda dagli incontri', JSON.stringify((posta[0] || {}).bcc));
        esigi(!/staff@revilaw\.it/.test(String((posta[0] || {}).to || '')),
            'in copia NASCOSTA: fra i destinatari veri non compare');
    });

    await prova('27) Il secondo tavolo del merito creditizio raddoppia gli orari che l\'azienda vede', async () => {
        /* Il secondo desk della segreteria e' diventato il secondo tavolo del
           merito creditizio, che e' l'argomento piu' richiesto. Per chi
           organizza restano due tavoli veri - due referenti, due griglie, due
           chiusure - ma l'azienda deve vedere UNA voce sola con il doppio dei
           posti: a lei interessa l'argomento e l'ora, non a quale dei due
           professionisti la mandiamo.
           L'identificativo del tavolo e' rimasto "desk-revilaw-b": e' la
           chiave con cui viaggiano le prenotazioni gia' prese, e questa prova
           serve anche a dire che quel nome strano e' voluto. */
        azzera();
        dati.set('utenti/staff@revilaw.it', { ruolo: 'admin' });
        mettiAgenda({
            'merito-creditizio': { referenti: [{ nome: 'Filippo Lo Piccolo', ruolo: 'Partner' }] },
            'desk-revilaw-b': { referenti: [{ nome: 'Marco Rossi', ruolo: 'Senior' }] },
            'finanza-agevolata': { referenti: [{ nome: 'Sara Ventura', ruolo: 'Partner' }] },
            'finanza-agevolata-b': { referenti: [{ nome: 'Luca Bianchi', ruolo: 'Senior' }] }
        });
        mettiReferente('sergio', 'Sergio', 'Miele', 'Revilaw', 'sergiomiele@revilaw.it', '04641610235');
        await invita([{ chiave: 'p:04641610235', nome: 'REVILAW', piva: '04641610235', referenti: [{ doc: 'sergio' }] }],
            ['merito-creditizio', 'desk-revilaw-b', 'finanza-agevolata', 'finanza-agevolata-b']);
        const letto = await chiamaAzienda('p:04641610235', { azione: 'b2b-azienda-leggi' });
        esigi(letto.ok === true, 'la pagina dell azienda si apre');
        const voci = (letto.aree || []).filter(a => /Merito creditizio/i.test(a.nome || ''));
        esigi(voci.length === 1, 'il merito creditizio e UNA voce sola, non due',
            (letto.aree || []).map(a => a.nome).join(' | '));
        esigi(!/secondo tavolo/i.test(JSON.stringify(letto.aree || [])),
            'e "secondo tavolo" non si legge da nessuna parte: e affare nostro');
        /* IL DOPPIO DEI POSTI: ogni orario della famiglia ne ospita due, uno
           per tavolo. E' questo che l'azienda deve vedere. */
        const slot = ((voci[0] || {}).slot || []);
        const doppi = slot.filter(x => x.posti === 2).length;
        esigi(slot.length > 0 && doppi === slot.length,
            'e ogni orario ha due posti, uno per tavolo (' + doppi + ' su ' + slot.length + ')',
            JSON.stringify(slot.slice(0, 2)));
        /* E due imprese alla stessa ora ci stanno davvero: la prima prende il
           capofila, la seconda il secondo tavolo. */
        const ora = slot[0].ora;
        const primo = await chiamaAzienda('p:04641610235', {
            azione: 'b2b-azienda-salva', rev: letto.rev,
            prima: { area: 'merito-creditizio', ora: ora, perDoc: 'sergio' }
        });
        esigi(primo.ok === true, 'la prima impresa prenota le ' + ora);
        const dopo = await chiamaAzienda('p:04641610235', { azione: 'b2b-azienda-leggi' });
        const slotDopo = ((dopo.aree || []).filter(a => /Merito creditizio/i.test(a.nome))[0] || {}).slot || [];
        const quello = slotDopo.filter(x => x.ora === ora)[0] || {};
        esigi(quello.posti === 1 && quello.stato !== 'occupato',
            'e alle ' + ora + ' resta un posto libero, sull altro tavolo',
            JSON.stringify(quello));
        /* LA FINANZA AGEVOLATA ha lo stesso trattamento, ma per un'altra
           ragione: non e' un desk convertito, e' un posto in piu' a ogni ora
           sullo stesso argomento. Per l'azienda le due cose si vedono uguali,
           ed e' il punto. */
        const fin = (letto.aree || []).filter(a => /Finanza agevolata/i.test(a.nome || ''));
        esigi(fin.length === 1 && fin[0].nome === 'Finanza agevolata',
            'anche la finanza agevolata e una voce sola, con il nome di sempre',
            fin.map(a => a.nome).join(' | '));
        const slotFin = (fin[0] || {}).slot || [];
        esigi(slotFin.length > 0 && slotFin.every(x => x.posti === 2),
            'e ogni suo orario ha due posti (' + slotFin.filter(x => x.posti === 2).length + ' su ' + slotFin.length + ')');
    });

    console.log('\n' + ok + ' ok, ' + ko + ' KO');
    process.exit(ko ? 1 : 0);
})().catch(e => { console.error('Errore nelle prove:', e); process.exit(1); });
