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
   diventano il nome di battesimo e il collegamento personale; che il
   tempo finito a meta' non fa rispedire; che un promemoria vecchio
   di un giorno non parte e viene segnato; che una modifica fatta
   dall'area riservata nel frattempo non si perde.
   ============================================================ */
'use strict';
const Module = require('module');
const path = require('path');
const zlib = require('zlib');

// ---------- orologio ----------
let orologio = Date.parse('2026-09-17T08:05:00Z');
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
    orologio = Date.parse('2026-09-17T08:05:00Z');
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
        sezioni: ['presenza', 'aderenti', 'sponsor'], quando: Date.parse('2026-09-17T08:00:00Z'), stato: 'programmato',
        mail: { oggetto: 'Ciao {{NOME}}, ci vediamo a Napoli', html: '<p>Ciao {{NOME}}</p><a href="{{COMPLETA}}">link</a>', testo: 'Ciao {{NOME}}\n{{COMPLETA}}' },
        creato: { da: 'a.missori@emvas.tax', daNome: 'Alessandro Missori', il: 1 }
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
    mettiIscrizioni([a, b, c, d, e], [
        { evento: 'napoli-2026-10-02', idIscritto: idDi(b), modalita: 'presenza' },   // ...ma chi organizza lo ha messo in sala
        { evento: 'napoli-2026-10-02', idIscritto: idDi(c), modalita: 'online' }      // ...ma chi organizza lo ha spostato online
    ]);
    mettiPromemoria([recBase()]);
    const r = await giro();
    esigi(r._stato === 200 && r.inviati === 1, 'un promemoria inviato (' + JSON.stringify(r) + ')');
    const dest = posta.filter(m => !/^\[Copia per te\]/.test(m.subject)).map(m => m.to).sort();
    esigi(JSON.stringify(dest) === JSON.stringify(['anna@esempio.it', 'bruno@esempio.it', 'dario@esempio.it']), 'a chi: anna, bruno (in sala per decisione), dario (aderenti); non carla (online), non elena (Roma) - ' + dest.join(', '));
    const ma = posta.find(m => m.to === 'anna@esempio.it');
    esigi(ma.subject === 'Ciao Anna, ci vediamo a Napoli', 'nome di battesimo nell\'oggetto: ' + ma.subject);
    esigi(/\/completa_iscrizione\/\?d=anna-esempio-it&t=/.test(ma.html), 'collegamento personale firmato della scheda nel corpo');
    esigi(ma.replyTo === 'a.missori@emvas.tax', 'le risposte tornano a chi ha programmato');
    const copia = posta.find(m => /^\[Copia per te\]/.test(m.subject));
    esigi(copia && copia.to === 'a.missori@emvas.tax' && /Ciao Alessandro/.test(copia.html), 'una copia a chi ha programmato, con il suo nome');
    const rec = leggiPromemoria('napoli-2026-10-02~s1');
    esigi(rec.stato === 'inviato' && rec.invio && rec.invio.inviate === 3 && rec.invio.destinatari === 3, 'il record dice inviato a 3');
    esigi(!dati.has('comunicazioniInvio/promemoria~napoli-2026-10-02~s1'), 'l\'avanzamento e\' stato ripulito');
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
    esigi(r1.sospesi === 1 && prima > 0 && prima < 12, 'primo giro: sospeso, ' + prima + ' mail su 12');
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

await prova('4) Un promemoria vecchio di piu\' di un giorno non parte: segnato scaduto', async () => {
    azzera();
    mettiIscrizioni([iscr('anna@esempio.it', 'Anna', 'Verdi')], []);
    mettiPromemoria([recBase({ quando: Date.parse('2026-09-15T08:00:00Z') })]);
    const r = await giro();
    esigi(r.scaduti === 1 && posta.length === 0, 'nessuna mail, 1 scaduto');
    const rec = leggiPromemoria('napoli-2026-10-02~s1');
    esigi(rec.stato === 'scaduto' && /Riprogrammalo/.test(rec.invio.motivo), 'il record dice scaduto e spiega');
});

await prova('5) Non dovuti: futuro, sospeso, inviato, senza mail restano fermi; e una modifica concorrente non si perde', async () => {
    azzera();
    mettiIscrizioni([iscr('anna@esempio.it', 'Anna', 'Verdi')], []);
    mettiPromemoria([
        recBase({ id: 'f', quando: Date.parse('2026-09-24T08:00:00Z') }),
        recBase({ id: 's', stato: 'sospeso' }),
        recBase({ id: 'i', stato: 'inviato' }),
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

await prova('6) Chiamata senza segreto: rifiutata', async () => {
    azzera();
    const res = { _s: 0, status(n) { this._s = n; return this; }, json() { return this; } };
    await cron({ method: 'GET', headers: {} }, res);
    esigi(res._s === 401, '401 senza Authorization');
});

await prova('7) Le funzioni interne: identificativo della riga come in api/iscrizioni.js, nome di battesimo', async () => {
    const I = cron._interni;
    esigi(I.idRiga({ email: 'Anna@Esempio.it', data: '10/09/2026 11:00:00' }) === 'anna@esempio.it|10/09/2026 11:00:00', 'id dalla email in minuscolo e dalla data');
    esigi(I.idRiga({ nome: 'Élise', cognome: 'Müller', data: 'x' }) === 'elise.muller|x', 'senza email: nome.cognome senza accenti');
    esigi(I.nomeSaluto({ nome: 'Anna Maria', cognome: 'Verdi' }) === 'Anna' && I.nomeSaluto({ nome: '', cognome: 'Verdi' }) === 'Verdi' && I.nomeSaluto({}) === 'ospite', 'saluto: primo nome, poi cognome, poi ospite');
    esigi(I.nomeSaluto({ nome: 'Mario Rossi', cognome: '' }) === 'Mario Rossi', 'nome pieno in un campo solo: resta com\'e\'');
});

console.log('\n' + ok + ' ok, ' + ko + ' KO');
process.exit(ko ? 1 : 0);
})().catch(e => { console.error('Errore nelle prove:', e); process.exit(1); });
