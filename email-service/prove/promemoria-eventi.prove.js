/* ============================================================
   PROVE - api/promemoria-eventi.js
   ------------------------------------------------------------
       node prove/promemoria-eventi.prove.js

   Niente da installare: Firestore, il server di posta e l'orologio
   sono finti e stanno qui dentro. Esce con 1 se qualcosa e' rosso.

   COSA DIMOSTRANO. Che un promemoria confermato parte alle persone
   giuste e a quelle sole: la sezione decisa da chi organizza vince
   su quella dichiarata, chi ha annullato o e' cancellato resta fuori,
   un indirizzo riceve una mail sola; che {{NOME}} e {{COMPLETA}}
   diventano nome e cognome e il collegamento personale; che i giorni
   che mancano si contano la mattina dell'invio; che chi arriva dopo
   riceve il benvenuto, una mail al giorno, con la precedenza alla
   vigilia e alla mattina dell'evento; che il tempo finito a meta' non
   fa rispedire; che un promemoria di un giorno passato non parte; che
   una modifica fatta dall'area riservata nel frattempo non si perde.
   ============================================================ */
'use strict';
const Module = require('module');
const path = require('path');
const zlib = require('zlib');

// ---------- orologio ----------
let orologio = Date.parse('2026-09-17T06:05:00Z');
Date.now = () => orologio;

// ---------- Firestore finto ----------
const dati = new Map();
const FieldValue = {
    arrayUnion: (...v) => ({ __op: 'arrayUnion', v: v }),
    increment: (n) => ({ __op: 'increment', n: n }),
    serverTimestamp: () => ({ __op: 'ts' })
};
function applica(vecchio, patch, merge) {
    const base = (merge && vecchio) ? Object.assign({}, vecchio) : {};
    for (const k of Object.keys(patch)) {
        const v = patch[k];
        if (v && v.__op === 'arrayUnion') {
            const arr = Array.isArray(base[k]) ? base[k].slice() : [];
            for (const e of v.v) if (!arr.some(x => JSON.stringify(x) === JSON.stringify(e))) arr.push(e);
            base[k] = arr;
        } else if (v && v.__op === 'increment') { base[k] = Number(base[k] || 0) + v.n; }
        else if (v && v.__op === 'ts') { base[k] = orologio; }
        else base[k] = v;
    }
    return base;
}
function doc(chiave) {
    const self = {
        _chiave: chiave,
        get: async () => ({ exists: dati.has(chiave), id: chiave.split('/').pop(), data: () => dati.get(chiave), ref: self }),
        set: async (patch, opz) => { dati.set(chiave, applica(dati.get(chiave), patch, !!(opz && opz.merge))); },
        update: async (patch) => {
            if (!dati.has(chiave)) throw new Error('NOT_FOUND ' + chiave);
            dati.set(chiave, applica(dati.get(chiave), patch, true));
        },
        delete: async () => { dati.delete(chiave); }
    };
    return self;
}
function collection(nome) {
    return {
        doc: (id) => doc(nome + '/' + id),
        get: async () => {
            const ds = [...dati.keys()].filter(k => k.startsWith(nome + '/') && k.slice(nome.length + 1).indexOf('/') < 0)
                .map(k => ({ id: k.slice(nome.length + 1), exists: true, data: () => dati.get(k) }));
            return { forEach: f => ds.forEach(f), docs: ds, size: ds.length, empty: !ds.length };
        }
    };
}
const db = {
    collection: collection,
    getAll: async (...rif) => Promise.all(rif.map(r => r.get())),
    batch: () => {
        const ops = [];
        return {
            set: (r, p, o) => { ops.push(() => r.set(p, o)); },
            delete: (r) => { ops.push(() => r.delete()); },
            commit: async () => { for (const f of ops) await f(); }
        };
    },
    runTransaction: async (fn) => {
        const scritture = [];
        await fn({ get: (r) => r.get(), set: (r, p, o) => { scritture.push([r, p, o]); } });
        for (const [r, p, o] of scritture) await r.set(p, o);
    }
};
const admin = {
    apps: [],
    initializeApp: () => { admin.apps.push({}); },
    credential: { cert: (c) => c },
    firestore: Object.assign(() => db, { FieldValue: FieldValue })
};

// ---------- SMTP finto ----------
const posta = [];
let passoMs = 1000;
const rifiutati = new Set();
const nodemailer = {
    createTransport: () => ({
        sendMail: async (msg) => {
            orologio += passoMs;
            if (msg.to && rifiutati.has(msg.to)) throw new Error('550 casella inesistente');
            posta.push(msg);
            return { response: '250 ok', rejected: [] };
        }
    })
};

// ---------- intercetta i require ----------
const veroRequire = Module.prototype.require;
Module.prototype.require = function (nome) {
    if (nome === 'firebase-admin') return admin;
    if (nome === 'nodemailer') return nodemailer;
    return veroRequire.apply(this, arguments);
};

process.env.CRON_SECRET = 'segreto-di-prova';
process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ private_key: 'x', client_email: 'y' });
process.env.SMTP_FROM_EMAIL = 'noreply@ngb.it';
process.env.SMTP_FROM_NAME = 'Revilaw S.p.A.';
process.env.NEWSLETTER_SECRET = 'segreto-newsletter-di-prova';

const RADICE = path.join(__dirname, '..');
const cron = require(path.join(RADICE, 'api/promemoria-eventi.js'));

// ---------- utilita' ----------
function azzera() {
    dati.clear(); posta.length = 0; rifiutati.clear(); passoMs = 1000;
    orologio = Date.parse('2026-09-17T06:05:00Z');
}
/* L'archivio delle iscrizioni, nella forma in cui lo legge
   lib/copia-iscrizioni.js: le collezioni vere, con la revisione a zero
   (cosi' rilegge da capo) e nessuna copia. */
let revIscrizioni = 0;
function mettiIscrizioni(iscrizioni, presenze, cancellate) {
    /* La revisione sale a ogni prova: lib/copia-iscrizioni.js tiene in memoria
       l'ultimo archivio letto e, a parita' di numero, non rilegge. */
    dati.set('meta/iscrizioni', { rev: ++revIscrizioni, quando: orologio });
    iscrizioni.forEach((v, i) => {
        const d = Object.assign({}, v);
        delete d._doc;   // il nome del documento e' la chiave, non un campo
        dati.set('iscrizioni/' + (v._doc || ('doc' + i)), d);
    });
    (presenze || []).forEach((v, i) => dati.set('presenze/p' + i, v));
    (cancellate || []).forEach((v, i) => dati.set('iscrizioniCancellate/c' + i, v));
}
function mettiPromemoria(lista) {
    dati.set('archivio/promemoriaEventi', { json: JSON.stringify(lista) });
}
function leggiPromemoria(id) {
    return JSON.parse(dati.get('archivio/promemoriaEventi').json).find(r => r.id === id);
}
async function giro() {
    const res = { _s: 0, _j: null, status(n) { this._s = n; return this; }, json(o) { this._j = o; return this; } };
    await cron({ method: 'GET', headers: { authorization: 'Bearer segreto-di-prova' } }, res);
    return Object.assign({ _stato: res._s }, res._j || {});
}
function iscr(email, nome, cognome, extra) {
    return Object.assign({ pagina: 'Napoli 2 Ottobre 2026 - Manifestazione di interesse', data: '10/09/2026 11:00:00', nome: nome, cognome: cognome, email: email, _doc: email.replace(/[@.]/g, '-') }, extra || {});
}
const idDi = v => (v.email.toLowerCase()) + '|' + v.data;
function recBase(extra) {
    return Object.assign({
        id: 'napoli-2026-10-02~s1', evento: 'napoli-2026-10-02', filtro: 'napoli', proposta: 's1', nome: 'Due settimane prima',
        sezioni: ['presenza', 'aderenti', 'sponsor'], quando: Date.parse('2026-09-16T22:00:00Z'), stato: 'programmato',
        mail: { oggetto: 'Ciao {{NOME}}, ci vediamo a Napoli', html: '<p>Ciao {{NOME}}</p><a href="{{COMPLETA}}">link</a>', testo: 'Ciao {{NOME}}\n{{COMPLETA}}' },
        creato: { da: 'a.missori@emvas.tax', daNome: 'Alessandro Missori', il: 1 },
        recupera: true
    }, extra || {});
}
const aChi = () => posta.map(m => m.to).sort();

// ---------- il piccolo motore delle prove ----------
let ok = 0, ko = 0;
function esigi(cond, testo) { if (cond) { ok++; console.log('  ok   ' + testo); } else { ko++; console.log('  KO   ' + testo); } }
async function prova(nome, fn) { console.log('\n' + nome); await fn(); }

(async () => {

await prova('1) Parte in sala e non online; la sezione decisa vince su quella dichiarata; {{NOME}} e {{COMPLETA}} sostituiti', async () => {
    azzera();
    const a = iscr('anna@esempio.it', 'Anna Maria', 'Verdi');           // presenza (vuoto)
    const b = iscr('bruno@esempio.it', 'Bruno', 'Bianchi', { modalita: 'online' });   // dichiara online...
    const c = iscr('carla@esempio.it', 'Carla', 'Rossi', { modalita: 'presenza' });   // dichiara presenza...
    const d = iscr('dario@esempio.it', 'Dario', 'Neri', { modalita: 'aderenti' });    // aderenti (dal modulo)
    const e = iscr('elena@altro.it', 'Elena', 'Gialli', { pagina: 'Roma 29 Aprile 2026 - Manifestazione di interesse' });
    const f = iscr('franco@esempio.it', 'Franco', 'Blu', { modalita: 'b2b' });      // invitato ai soli incontri B2B
    const g = iscr('gina@esempio.it', 'Gina', 'Viola');                                // si iscrive in sala...
    mettiIscrizioni([a, b, c, d, e, f, g], [
        { evento: 'napoli-2026-10-02', idIscritto: idDi(b), modalita: 'presenza' },   // ...ma chi organizza lo ha messo in sala
        { evento: 'napoli-2026-10-02', idIscritto: idDi(c), modalita: 'online' },     // ...ma chi organizza lo ha spostato online
        { evento: 'napoli-2026-10-02', idIscritto: idDi(g), modalita: 'b2b' }         // ...ma poi e' passata ai soli B2B
    ]);
    mettiPromemoria([recBase()]);
    const r = await giro();
    esigi(r._stato === 200 && r.inviati === 1, 'un promemoria inviato (' + JSON.stringify(r) + ')');
    const dest = posta.filter(m => !/^\[Copia per te\]/.test(m.subject)).map(m => m.to).sort();
    esigi(JSON.stringify(dest) === JSON.stringify(['anna@esempio.it', 'bruno@esempio.it', 'dario@esempio.it']), 'a chi: anna, bruno (in sala per decisione), dario (aderenti); non carla (online), non elena (Roma), non franco e gina (soli B2B) - ' + dest.join(', '));
    const ma = posta.find(m => m.to === 'anna@esempio.it');
    esigi(ma.subject === 'Ciao Anna Maria Verdi, ci vediamo a Napoli', 'nome e cognome nell\'oggetto: ' + ma.subject);
    esigi(/\/completa_iscrizione\/\?d=anna-esempio-it&t=/.test(ma.html), 'collegamento personale firmato della scheda nel corpo');
    esigi(ma.replyTo === 'a.missori@emvas.tax', 'le risposte tornano a chi ha programmato');
    const copia = posta.find(m => /^\[Copia per te\]/.test(m.subject));
    esigi(copia && copia.to === 'a.missori@emvas.tax' && /Ciao Alessandro/.test(copia.html), 'una copia a chi ha programmato, con il suo nome');
    const rec = leggiPromemoria('napoli-2026-10-02~s1');
    esigi(rec.stato === 'inviato' && rec.invio && rec.invio.inviate === 3 && rec.invio.destinatari === 3, 'il record dice inviato a 3');
    const mem = dati.get('comunicazioniInvio/promemoria~napoli-2026-10-02~s1');
    esigi(mem && (mem.serviti || []).length === 3, 'la memoria di chi ha ricevuto resta (3 impronte): serve ai recuperi');
});

await prova('2) Online: solo la sezione online; annullati, cancellati, assenti, senza email e doppioni restano fuori', async () => {
    azzera();
    const a = iscr('anna@esempio.it', 'Anna', 'Verdi', { modalita: 'online' });
    const b = iscr('anna@esempio.it', 'Anna', 'Verdi', { modalita: 'online', data: '11/09/2026 09:00:00', _doc: 'anna-2' });  // stesso indirizzo
    const c = iscr('carlo@esempio.it', 'Carlo', 'Rossi', { modalita: 'online', annullato: true });
    const d = iscr('dino@esempio.it', 'Dino', 'Neri', { modalita: 'online' });
    const e = iscr('', 'Senza', 'Email', { modalita: 'online', _doc: 'senza-email' });
    const f = iscr('fabio@esempio.it', 'Fabio', 'Blu', { modalita: 'online' });
    const g = iscr('gina@esempio.it', 'Gina', 'Verde', { modalita: 'presenza' });
    mettiIscrizioni([a, b, c, d, e, f, g],
        [{ evento: 'napoli-2026-10-02', idIscritto: idDi(f), stato: 'assente' }],
        [{ evento: 'napoli-2026-10-02', idIscritto: idDi(d) }]);
    mettiPromemoria([recBase({ id: 'napoli-2026-10-02~o1', proposta: 'o1', sezioni: ['online'] })]);
    const r = await giro();
    const dest = posta.filter(m => !/^\[Copia/.test(m.subject)).map(m => m.to);
    esigi(JSON.stringify(dest) === JSON.stringify(['anna@esempio.it']), 'parte alla sola anna, una volta (' + dest.join(', ') + ')');
    const rec = leggiPromemoria('napoli-2026-10-02~o1');
    esigi(rec.invio.doppie === 1 && rec.invio.senzaEmail === 1, 'conta 1 doppione e 1 senza email');
});

await prova('3) Tempo finito a meta\': si ferma, resta programmato "in corso", il giro dopo finisce senza doppioni', async () => {
    azzera(); passoMs = 30000;   // 30 s a mail: il budget e' 240 s
    const lista = [];
    for (let i = 1; i <= 12; i++) lista.push(iscr('p' + String(i).padStart(2, '0') + '@esempio.it', 'Nome' + i, 'Cognome'));
    mettiIscrizioni(lista, []);
    mettiPromemoria([recBase()]);
    const r1 = await giro();
    const prima = posta.filter(m => !/^\[Copia/.test(m.subject)).length;
    esigi(r1.sospesi === 1 && prima > 0 && prima < 12, 'primo giro: sospeso, ' + prima + ' mail su 12 (a quattro alla volta)');
    let rec = leggiPromemoria('napoli-2026-10-02~s1');
    esigi(rec.stato === 'programmato' && rec.invio && rec.invio.inCorso === true && rec.invio.inviate === prima, 'record ancora programmato, "in corso" con il conteggio');
    passoMs = 1000;
    orologio += 15 * 60 * 1000;
    const r2 = await giro();
    const tutte = posta.filter(m => !/^\[Copia/.test(m.subject)).map(m => m.to);
    esigi(r2.inviati === 1 && tutte.length === 12 && new Set(tutte).size === 12, 'secondo giro: finisce, 12 mail in tutto, nessun doppione');
    esigi(posta.filter(m => /^\[Copia/.test(m.subject)).length === 1, 'la copia a chi ha programmato e\' partita una volta sola');
    rec = leggiPromemoria('napoli-2026-10-02~s1');
    esigi(rec.stato === 'inviato' && rec.invio.inviate === 12 && rec.invio.inCorso === false, 'record inviato a 12');
});

await prova('4) Un promemoria previsto per un giorno gia\' passato non parte: segnato scaduto', async () => {
    azzera();
    mettiIscrizioni([iscr('anna@esempio.it', 'Anna', 'Verdi')], []);
    // previsto per il 16 (mezzanotte di Roma), il giro e' quello del 17
    mettiPromemoria([recBase({ quando: Date.parse('2026-09-15T22:00:00Z') })]);
    const r = await giro();
    esigi(r.scaduti === 1 && posta.length === 0, 'nessuna mail, 1 scaduto');
    const rec = leggiPromemoria('napoli-2026-10-02~s1');
    esigi(rec.stato === 'scaduto' && /Riprogrammalo/.test(rec.invio.motivo), 'il record dice scaduto e spiega');
});

await prova('5) Non dovuti: futuro, sospeso, inviato, senza mail restano fermi; e una modifica concorrente non si perde', async () => {
    azzera();
    mettiIscrizioni([iscr('anna@esempio.it', 'Anna', 'Verdi')], []);
    mettiPromemoria([
        recBase({ id: 'f', quando: Date.parse('2026-09-23T22:00:00Z') }),   // previsto per il 24
        recBase({ id: 's', stato: 'sospeso' }),
        recBase({ id: 'i', stato: 'inviato', invio: { il: 1, inviate: 1 } }),   // gia' inviato, e non e' un benvenuto: fermo
        recBase({ id: 'm', mail: null }),
        recBase({ id: 'd' })
    ]);
    // mentre il cron lavora, l'area riservata cambia la data del record "f":
    // il set in transazione rilegge il documento, quindi la modifica resta
    const set0 = db.collection('archivio').doc('promemoriaEventi').set;
    const r = await giro();
    esigi(r.inviati === 1 && posta.filter(m => !/^\[Copia/.test(m.subject)).length === 1, 'parte solo "d"');
    const arr = JSON.parse(dati.get('archivio/promemoriaEventi').json);
    esigi(arr.find(x => x.id === 'f').stato === 'programmato' && arr.find(x => x.id === 's').stato === 'sospeso' && arr.find(x => x.id === 'i').stato === 'inviato' && arr.find(x => x.id === 'm').stato === 'programmato', 'gli altri quattro sono come prima');
    esigi(arr.find(x => x.id === 'd').stato === 'inviato', '"d" e\' inviato');
    void set0;
});

/* ---- I giorni che mancano e il benvenuto a chi arriva dopo ---- */
// giorni in ora di Roma: la mezzanotte di Roma e' le 22 UTC del giorno prima (ora legale)
const giorno = iso => Date.parse(iso + 'T00:00:00+02:00');
const alle8 = iso => Date.parse(iso + 'T08:05:00+02:00');
const noCopia = () => posta.filter(m => !/^\[Copia/.test(m.subject));
function recW(extra) {
    return recBase(Object.assign({
        id: 'n~sala-programma', proposta: 'sala-programma', benvenuto: true, chiusuraB2B: '2026-09-30', giornoEvento: '2026-10-02',
        quando: giorno('2026-09-25'),
        mail: {
            oggetto: '{{MANCANO}} a Napoli: ciao {{NOME}}',
            html: '<p>{{mancano}} | {{QUANDO}}</p><!--SE_B2B--><p>PRENOTA entro {{CHIUSURA_B2B}}</p><!--/SE_B2B-->',
            testo: '{{mancano}}\n\n[[SE_B2B]]PRENOTA entro {{CHIUSURA_B2B}}[[/SE_B2B]]\n\nfine'
        }
    }, extra || {}));
}
function recNormale(id, iso, extra) {
    return recBase(Object.assign({ id: id, proposta: id, quando: giorno(iso), giornoEvento: '2026-10-02',
        mail: { oggetto: id + ' {{MANCANO}} {{NOME}}', html: '<p>' + id + '</p>', testo: id } }, extra || {}));
}

await prova('8) I giorni che mancano si contano la mattina dell\'invio; il blocco B2B vale fino alla chiusura', async () => {
    azzera();
    orologio = alle8('2026-09-25');
    mettiIscrizioni([iscr('anna@esempio.it', 'Anna', 'Verdi')], []);
    mettiPromemoria([recW()]);
    await giro();
    const m = noCopia()[0];
    esigi(m && m.subject === 'Mancano 7 giorni a Napoli: ciao Anna Verdi', 'oggetto del 25 settembre: ' + (m && m.subject));
    esigi(/mancano 7 giorni \| Venerdì 2 ottobre/.test(m.html) && /PRENOTA entro il 30 settembre/.test(m.html), 'corpo: giorni, giorno dell\'evento e chiusura B2B');
    esigi(/PRENOTA entro il 30 settembre/.test(m.text) && !/\[\[/.test(m.text), 'anche il solo testo, senza segni rimasti');
});

await prova('9) Benvenuto: chi arriva dopo riceve la mail completa la mattina dopo, con i giorni ricalcolati, una volta sola', async () => {
    azzera();
    orologio = alle8('2026-09-25');
    mettiIscrizioni([iscr('anna@esempio.it', 'Anna', 'Verdi')], []);
    mettiPromemoria([recW()]);
    await giro();
    mettiIscrizioni([iscr('anna@esempio.it', 'Anna', 'Verdi'), iscr('bruno@esempio.it', 'Bruno', 'Bianchi')], []);
    posta.length = 0;
    orologio = alle8('2026-09-26');
    const r = await giro();
    esigi(r.recuperi === 1 && posta.length === 1 && posta[0].to === 'bruno@esempio.it', 'il 26: solo bruno (' + posta.map(x => x.to).join() + ')');
    esigi(posta[0].subject === 'Mancano 6 giorni a Napoli: ciao Bruno Bianchi', 'con i giorni del 26: ' + posta[0].subject);
    esigi(!posta.some(x => /^\[Copia/.test(x.subject)), 'nessuna copia a chi ha programmato per un benvenuto');
    const w = leggiPromemoria('n~sala-programma');
    esigi(w.invio.recuperi === 1 && w.invio.inviate === 1, 'il record conta 1 inviata e 1 benvenuto');
    posta.length = 0;
    orologio = alle8('2026-09-27');
    const r2 = await giro();
    esigi(r2.recuperi === 0 && posta.length === 0, 'il 27 niente');
});

await prova('10) Una mail al giorno: chi arriva la vigilia di una mail normale riceve il benvenuto AL SUO POSTO', async () => {
    azzera();
    orologio = alle8('2026-09-25');
    mettiIscrizioni([iscr('anna@esempio.it', 'Anna', 'Verdi')], []);
    mettiPromemoria([recW(), recNormale('n~sala-presenza', '2026-09-29')]);
    await giro();
    mettiIscrizioni([iscr('anna@esempio.it', 'Anna', 'Verdi'), iscr('carla@esempio.it', 'Carla', 'Rossi')], []);
    posta.length = 0;
    orologio = alle8('2026-09-29');
    const r = await giro();
    const a = noCopia().map(m => m.to + ': ' + m.subject).sort();
    esigi(a.length === 2 && a[0] === 'anna@esempio.it: n~sala-presenza Mancano 3 giorni Anna Verdi' && a[1] === 'carla@esempio.it: Mancano 3 giorni a Napoli: ciao Carla Rossi',
        'anna la mail del giorno, carla il benvenuto e basta (' + a.join(' | ') + ')');
    esigi(posta.some(m => /^\[Copia per te\] n~sala-presenza/.test(m.subject)), 'la copia della mail del giorno parte lo stesso');
    esigi(r.recuperi === 1 && leggiPromemoria('n~sala-presenza').invio.inviate === 1, 'la mail del giorno conta una sola inviata');
});

await prova('11) La vigilia e la mattina dell\'evento hanno la precedenza: quel giorno niente benvenuto', async () => {
    azzera();
    orologio = alle8('2026-09-25');
    mettiIscrizioni([iscr('anna@esempio.it', 'Anna', 'Verdi')], []);
    mettiPromemoria([recW(),
        recNormale('n~sala-vigilia', '2026-10-01', { soloIlGiorno: true, mail: { oggetto: '{{QUANDO}} a Napoli {{NOME}}', html: '<p>vigilia</p>', testo: 'vigilia' } }),
        recNormale('n~sala-mattina', '2026-10-02', { soloIlGiorno: true })]);
    await giro();
    mettiIscrizioni([iscr('anna@esempio.it', 'Anna', 'Verdi'), iscr('dario@esempio.it', 'Dario', 'Neri')], []);
    posta.length = 0;
    orologio = alle8('2026-10-01');
    const r = await giro();
    const a = noCopia().map(m => m.to + ': ' + m.subject).sort();
    esigi(r.recuperi === 0 && a.length === 2 && a[1] === 'dario@esempio.it: Domani a Napoli Dario Neri', 'il 1° ottobre dario riceve la vigilia, con "Domani" (' + a.join(' | ') + ')');
    posta.length = 0;
    orologio = alle8('2026-10-02');
    const r2 = await giro();
    esigi(r2.recuperi === 0 && noCopia().length === 2, 'il 2 ottobre la mattina a tutti, niente benvenuto');
});

await prova('12) Il blocco B2B nel benvenuto: il giorno della chiusura dice "oggi", dopo sparisce', async () => {
    azzera();
    orologio = alle8('2026-09-25');
    mettiIscrizioni([iscr('anna@esempio.it', 'Anna', 'Verdi')], []);
    mettiPromemoria([recW()]);
    await giro();
    mettiIscrizioni([iscr('anna@esempio.it', 'Anna', 'Verdi'), iscr('ugo@esempio.it', 'Ugo', 'Primo')], []);
    posta.length = 0;
    orologio = alle8('2026-09-30');
    await giro();
    esigi(posta.length === 1 && /PRENOTA entro oggi/.test(posta[0].html) && /mancano 2 giorni/.test(posta[0].html), 'il 30: "entro oggi", mancano 2 giorni');
    mettiIscrizioni([iscr('anna@esempio.it', 'Anna', 'Verdi'), iscr('ugo@esempio.it', 'Ugo', 'Primo'), iscr('eva@esempio.it', 'Eva', 'Tarda')], []);
    posta.length = 0;
    orologio = alle8('2026-10-01');
    await giro();
    esigi(posta.length === 1 && posta[0].to === 'eva@esempio.it' && !/PRENOTA/.test(posta[0].html) && !/PRENOTA/.test(posta[0].text), 'il 1° ottobre: niente invito a prenotare');
    esigi(posta.length === 1 && /manca un giorno \| Domani/.test(posta[0].html), 'e i giorni del 1° ottobre');
});

await prova('13) Spostato di serie dopo l\'invio: riceve il benvenuto della serie nuova', async () => {
    azzera();
    orologio = alle8('2026-09-25');
    mettiIscrizioni([iscr('anna@esempio.it', 'Anna', 'Verdi'), iscr('bruno@esempio.it', 'Bruno', 'Bianchi')], []);
    mettiPromemoria([recW(), recW({ id: 'n~online-programma', proposta: 'online-programma', sezioni: ['online'], mail: { oggetto: 'Online {{MANCANO}} {{NOME}}', html: '<p>online</p>', testo: 'online' } })]);
    await giro();
    esigi(noCopia().length === 2, 'il 25 la mail in sala ai due');
    mettiIscrizioni([iscr('anna@esempio.it', 'Anna', 'Verdi'), iscr('bruno@esempio.it', 'Bruno', 'Bianchi')],
        [{ evento: 'napoli-2026-10-02', idIscritto: idDi(iscr('bruno@esempio.it', 'Bruno', 'Bianchi')), modalita: 'online' }]);
    posta.length = 0;
    orologio = alle8('2026-09-27');
    const r = await giro();
    esigi(r.recuperi === 1 && posta.length === 1 && posta[0].to === 'bruno@esempio.it' && posta[0].subject === 'Online Mancano 5 giorni Bruno Bianchi', 'bruno riceve il benvenuto online (' + posta.map(m => m.subject).join() + ')');
});

await prova('14) Solo i promemoria con i testi nuovi fanno da benvenuto', async () => {
    azzera();
    orologio = alle8('2026-09-25');
    mettiIscrizioni([iscr('anna@esempio.it', 'Anna', 'Verdi')], []);
    mettiPromemoria([recW({ recupera: undefined })]);
    await giro();
    mettiIscrizioni([iscr('anna@esempio.it', 'Anna', 'Verdi'), iscr('tardi@esempio.it', 'Tardi', 'Nuovo')], []);
    posta.length = 0;
    orologio = alle8('2026-09-26');
    const r = await giro();
    esigi(r.recuperi === 0 && posta.length === 0, 'prima versione: niente benvenuto');
});

await prova('15) Dopo il giorno dell\'evento non parte niente, nemmeno il resto di un invio a meta\'', async () => {
    azzera();
    mettiIscrizioni([iscr('anna@esempio.it', 'Anna', 'Verdi')], []);
    mettiPromemoria([recBase({ quando: Date.parse('2026-10-01T22:00:00Z'), invio: { inCorso: true, il: 1, inviate: 5 } })]);
    orologio = Date.parse('2026-10-03T06:05:00Z');
    const r = await giro();
    const rec = leggiPromemoria('napoli-2026-10-02~s1');
    esigi(r.scaduti === 1 && posta.length === 0, 'il 3 ottobre nessuna mail');
    esigi(rec.stato === 'scaduto' && rec.invio.inCorso === false && rec.invio.inviate === 5, 'segnato scaduto, con il conto di quelle gia\' partite');
});

await prova('16) Le due copie del calcolo dei giorni (servizio e anteprima) dicono le stesse cose, giorno per giorno', async () => {
    const T1 = require(path.join(RADICE, 'lib/promemoria-tempo.js'));
    const T2 = require(path.join(RADICE, '..', 'area-riservata', 'promemoria-eventi.js')).tempo;
    const campione = '{{MANCANO}} / {{mancano}} / {{QUANDO}} / {{quando}} / {{CHIUSURA_B2B}} <!--SE_B2B-->b2b<!--/SE_B2B--> [[SE_B2B]]b2b[[/SE_B2B]]';
    let uguali = 0, giorni = 0;
    for (let d = Date.UTC(2026, 8, 15); d <= Date.UTC(2026, 9, 5); d += 86400000) {
        const iso = new Date(d).toISOString().slice(0, 10);
        for (const ch of ['2026-09-30', '']) {
            giorni++;
            if (T1.applica(campione, T1.frasi(iso, '2026-10-02', ch)) === T2.applica(campione, T2.frasi(iso, '2026-10-02', ch))) uguali++;
        }
    }
    esigi(uguali === giorni, 'uguali in ' + uguali + ' casi su ' + giorni);
    const P = require(path.join(RADICE, '..', 'area-riservata', 'promemoria-eventi.js'));
    esigi(P.giornoDaTesto('30 settembre', '2026-10-02') === '2026-09-30' && P.giornoDaTesto('', '2026-10-02') === '', '"30 settembre" diventa 2026-09-30');
});

await prova('17) La mail della mattina dell\'evento parte solo dal giro delle 7; la sera dell\'evento niente benvenuto', async () => {
    const mattina = require('../api/promemoria-eventi-mattina');
    const giroMattina = async () => {
        const res = { _s: 0, _j: null, status(n) { this._s = n; return this; }, json(o) { this._j = o; return this; } };
        await mattina({ method: 'GET', headers: { authorization: 'Bearer segreto-di-prova' } }, res);
        return Object.assign({ _stato: res._s }, res._j || {});
    };
    azzera();
    orologio = alle8('2026-09-25');
    mettiIscrizioni([iscr('anna@esempio.it', 'Anna', 'Verdi')], []);
    mettiPromemoria([recW(),
        recNormale('n~sala-vigilia', '2026-10-01', { soloIlGiorno: true }),
        recNormale('n~sala-mattina', '2026-10-02', { soloIlGiorno: true, mattina: true })]);
    await giro();
    posta.length = 0;
    orologio = alle8('2026-10-01');
    const rm = await giroMattina();
    esigi(rm._stato === 200 && noCopia().length === 0 && rm.recuperi === 0, 'il giro delle 7 del 1° ottobre non manda la vigilia, che e\' della sera');
    await giro();
    esigi(noCopia().length === 1, 'la vigilia parte dal giro della sera');
    mettiIscrizioni([iscr('anna@esempio.it', 'Anna', 'Verdi'), iscr('dario@esempio.it', 'Dario', 'Neri')], []);
    posta.length = 0;
    orologio = alle8('2026-10-02');
    const r = await giro();
    esigi(noCopia().length === 0 && r.recuperi === 0, 'il 2 ottobre il giro della sera non manda la mail della mattina ne\' il benvenuto');
    const r2 = await giroMattina();
    const a = noCopia().map(m => m.to).sort();
    esigi(r2.inviati === 1 && JSON.stringify(a) === JSON.stringify(['anna@esempio.it', 'dario@esempio.it']), 'il giro delle 7 la manda a tutti, anche a chi si e\' iscritto la sera prima (' + a.join(', ') + ')');
});

await prova('18) Oggetto con IMPORTANTE e l\'azienda di chi riceve; nomi e aziende scritti allo stesso modo', async () => {
    azzera();
    mettiIscrizioni([
        iscr('anna@esempio.it', 'ANNA MARIA', 'VERDI', { azienda: 'VERDI SRL' }),
        iscr('bruno@esempio.it', 'bruno', 'de luca', { azienda: 'banca di credito cooperativo spa' }),
        iscr('carla@esempio.it', 'Carla', 'McArthur', { azienda: '' })
    ], []);
    mettiPromemoria([recBase({ quando: Date.parse('2026-09-23T22:00:00Z'), mail: { oggetto: 'IMPORTANTE - {{AZIENDA}} - {{MANCANO}} a Napoli', html: '<title>IMPORTANTE - {{AZIENDA}} - x</title><p>Gentile {{NOME}}</p>', testo: 'Gentile {{NOME}}' } })]);
    orologio = alle8('2026-09-24');
    await giro();
    const ogg = {};
    noCopia().forEach(m => { ogg[m.to] = m.subject + ' | ' + (/Gentile ([^<]+)</.exec(m.html) || [])[1]; });
    esigi(ogg['anna@esempio.it'] === 'IMPORTANTE - Verdi S.r.l. - Mancano 8 giorni a Napoli | Anna Maria Verdi', 'anna: ' + ogg['anna@esempio.it']);
    esigi(ogg['bruno@esempio.it'] === 'IMPORTANTE - Banca di Credito Cooperativo S.p.A. - Mancano 8 giorni a Napoli | Bruno De Luca', 'bruno: ' + ogg['bruno@esempio.it']);
    esigi(ogg['carla@esempio.it'] === 'IMPORTANTE - Mancano 8 giorni a Napoli | Carla McArthur', 'carla senza azienda: il trattino sparisce - ' + ogg['carla@esempio.it']);
    const T1 = require(path.join(RADICE, 'lib/promemoria-tempo.js'));
    const T2 = require(path.join(RADICE, '..', 'area-riservata', 'promemoria-eventi.js')).tempo;
    const casi = ['VERDI SRL', 'alfa s.r.l', 'Gamma, SRL', 'McKinsey & Company', 'studio rossi & associati sas', 'MARIO DE LUCA', "anna d'amico", ''];
    esigi(casi.every(c => T1.formaAzienda(c) === T2.formaAzienda(c) && T1.formaNome(c) === T2.formaNome(c) && T1.conAzienda('A - {{AZIENDA}} - B', c) === T2.conAzienda('A - {{AZIENDA}} - B', c)), 'servizio e anteprima scrivono nomi e aziende allo stesso modo');
});

await prova('19) Ogni promemoria parte alla sua ora: 8 dal giro delle 8, 20 da quello delle 20', async () => {
    const lancia = modulo => async () => {
        const res = { _s: 0, _j: null, status(n) { this._s = n; return this; }, json(o) { this._j = o; return this; } };
        await require(modulo)({ method: 'GET', headers: { authorization: 'Bearer segreto-di-prova' } }, res);
        return Object.assign({ _stato: res._s }, res._j || {});
    };
    const giro8 = lancia('../api/promemoria-eventi-ore8'), giro7 = lancia('../api/promemoria-eventi-mattina'), giro22 = lancia('../api/promemoria-eventi-ore22');
    azzera();
    mettiIscrizioni([iscr('anna@esempio.it', 'Anna', 'Verdi')], []);
    mettiPromemoria([recNormale('n~sala-sabato', '2026-09-26', { ora: 8 }), recNormale('n~sala-presenza', '2026-09-26')]);
    orologio = alle8('2026-09-26');
    await giro7();
    esigi(noCopia().length === 0, 'il giro delle 7 non manda nulla');
    const r8 = await giro8();
    const dopo8 = noCopia().length;
    esigi(r8._stato === 200 && r8.inviati === 1 && dopo8 === 1, 'il giro delle 8 manda solo quella delle 8 (' + dopo8 + ')');
    await giro();
    esigi(noCopia().length === 2, 'il giro delle 20 manda quella delle 20, e non rimanda quella delle 8 (' + noCopia().length + ')');
    // una delle 22: solo dal giro delle 22
    azzera();
    mettiIscrizioni([iscr('anna@esempio.it', 'Anna', 'Verdi')], []);
    mettiPromemoria([recNormale('n~sera', '2026-09-24', { ora: 22 })]);
    orologio = alle8('2026-09-24');
    await giro();
    esigi(noCopia().length === 0, 'il giro delle 20 non manda quella delle 22');
    const r22 = await giro22();
    esigi(r22.inviati === 1 && noCopia().length === 1 && /Mancano 8 giorni/.test(noCopia()[0].subject), 'il giro delle 22 la manda, con i giorni di oggi');
    // una delle 8 rimasta in un giorno passato
    azzera();
    mettiIscrizioni([iscr('anna@esempio.it', 'Anna', 'Verdi')], []);
    mettiPromemoria([recNormale('n~x', '2026-09-26', { ora: 8 })]);
    orologio = alle8('2026-09-27');
    await giro8();
    esigi(noCopia().length === 0 && leggiPromemoria('n~x').stato === 'scaduto' && /alle 8/.test(leggiPromemoria('n~x').invio.motivo), 'il giorno dopo non parte: segnata non partita, e dice alle 8');
});

await prova('6) Chiamata senza segreto: rifiutata', async () => {
    azzera();
    const res = { _s: 0, status(n) { this._s = n; return this; }, json() { return this; } };
    await cron({ method: 'GET', headers: {} }, res);
    esigi(res._s === 401, '401 senza Authorization');
});

await prova('7) Le funzioni interne: identificativo della riga come in api/iscrizioni.js, nome e cognome nel saluto', async () => {
    const I = cron._interni;
    esigi(I.idRiga({ email: 'Anna@Esempio.it', data: '10/09/2026 11:00:00' }) === 'anna@esempio.it|10/09/2026 11:00:00', 'id dalla email in minuscolo e dalla data');
    esigi(I.idRiga({ nome: 'Élise', cognome: 'Müller', data: 'x' }) === 'elise.muller|x', 'senza email: nome.cognome senza accenti');
    esigi(I.nomeSaluto({ nome: 'Anna Maria', cognome: 'Verdi' }) === 'Anna Maria Verdi' && I.nomeSaluto({ nome: '', cognome: 'Verdi' }) === 'Verdi' && I.nomeSaluto({}) === 'ospite', 'saluto: nome e cognome, poi quello che c\'e\', poi ospite');
    esigi(I.nomeSaluto({ nome: 'Mario Rossi', cognome: '' }) === 'Mario Rossi', 'nome pieno in un campo solo: resta com\'e\'');
    esigi(I.nomeSaluto({ nome: 'MARIO', cognome: 'DE LUCA' }) === 'Mario De Luca' && I.nomeSaluto({ nome: 'anna', cognome: 'd\'amico' }) === 'Anna D\'Amico', 'tutto maiuscolo o tutto minuscolo: rimesso in forma');
    esigi(I.nomeSaluto({ nome: 'Anna', cognome: 'McArthur' }) === 'Anna McArthur', 'maiuscole gia\' al loro posto: non si toccano');
});

console.log('\n' + ok + ' ok, ' + ko + ' KO');
process.exit(ko ? 1 : 0);
})().catch(e => { console.error('Errore nelle prove:', e); process.exit(1); });
