/* ============================================================
   PROVE - api/cron-comunicazioni.js
   ------------------------------------------------------------
       node prove/cron-comunicazioni.prove.js

   Niente da installare: Firestore, il server di posta e l'orologio
   sono finti e stanno qui dentro. Esce con 1 se qualcosa e' rosso,
   cosi' si puo' appendere a un controllo automatico.

   COSA DIMOSTRANO. Il cron delle comunicazioni gira piu' volte al
   giorno (vercel.json, 0 6-18 * * *). Puo' farlo solo se un giro
   interrotto a meta' non fa rispedire le mail gia' partite: e'
   quello che qui si verifica, caso per caso, compreso quello che
   prima rompeva davvero - invio riuscito e storico non scritto.

   Se un domani si tocca inviaUna() o l'ordine fra applicaPatch e
   AV.chiudi, questo file e' il posto dove ci si accorge di averlo
   rotto.
   ============================================================ */
'use strict';
const Module = require('module');
const path = require('path');

// ---------- orologio ----------
let orologio = Date.parse('2026-09-03T06:05:00Z');
Date.now = () => orologio;

// ---------- Firestore finto ----------
const dati = new Map();
const guasti = new Map();          // chiave -> quante scritture devono fallire
function chiaveGuasto(k) {
    const n = guasti.get(k) || 0;
    if (n > 0) { guasti.set(k, n - 1); return true; }
    return false;
}
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
        set: async (patch, opz) => {
            if (chiaveGuasto(chiave)) throw new Error('guasto simulato su ' + chiave);
            dati.set(chiave, applica(dati.get(chiave), patch, !!(opz && opz.merge)));
        },
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
            const ds = [...dati.keys()].filter(k => k.startsWith(nome + '/'))
                .map(k => ({ id: k.slice(nome.length + 1), data: () => dati.get(k) }));
            return { forEach: f => ds.forEach(f), docs: ds, size: ds.length, empty: !ds.length };
        }
    };
}
const db = {
    collection: collection,
    batch: () => ({ delete() { }, commit: async () => { } }),
    runTransaction: async (fn) => {
        /* Come una transazione vera: le scritture si accumulano e si applicano
           alla fine. Serve a far PROPAGARE l'errore di scrittura, che e'
           esattamente cio' che la prova 4 deve poter simulare. */
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
let rompiInvio = 0;
const rifiutati = new Set();      // indirizzi che il server rifiuta uno per uno
const nodemailer = {
    createTransport: () => ({
        sendMail: async (msg) => {
            orologio += passoMs;
            if (rompiInvio > 0) { rompiInvio--; throw new Error('server di posta non raggiungibile'); }
            if (msg.to && rifiutati.has(msg.to)) throw new Error('550 casella inesistente');
            posta.push(msg);
            return { response: '250 ok', rejected: [] };
        }
    })
};

// manopole del server di posta finto
function passo(ms) { passoMs = ms; }                 // quanto "dura" una mail
function rompi(n) { rompiInvio = n; }                // le prossime n falliscono tutte
function rifiuta(email) { rifiutati.add(email); }    // questo indirizzo il server lo rifiuta

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

const RADICE = path.join(__dirname, '..');
const cron = require(path.join(RADICE, 'api/cron-comunicazioni.js'));
const AV = require(path.join(RADICE, 'lib/comunicazioni-avanzamento.js'));

// ---------- utilita' ----------
function azzera() {
    dati.clear(); guasti.clear(); posta.length = 0; rifiutati.clear();
    passoMs = 1000; rompiInvio = 0;
    orologio = Date.parse('2026-09-03T06:05:00Z');
}
function metticomunicazione(com) {
    dati.set('archivio/comunicazioni', { json: JSON.stringify([com]) });
    dati.set('archivio/persone', { json: '[]' });
    dati.set('archivio/incarichi', { json: '[]' });
}
function leggicomunicazione(id) {
    return JSON.parse(dati.get('archivio/comunicazioni').json).find(c => c.id === id);
}
async function giro() {
    const res = { _s: 0, _j: null, status(n) { this._s = n; return this; }, json(o) { this._j = o; return this; } };
    await cron({ method: 'GET', headers: { authorization: 'Bearer segreto-di-prova' } }, res);
    return res._j;
}
function destinatari(n) {
    return Array.from({ length: n }, (_, i) => 'p' + String(i + 1).padStart(2, '0') + '@esempio.it');
}
function comBase(extra) {
    return Object.assign({
        id: 'c1', oggetto: 'Ciao {nome}', testo: 'Testo della comunicazione', formato: 'testo',
        stato: 'programmata',
        destinatariManuali: destinatari(20),
        creato: { da: 'a.missori@emvas.tax', il: 1 },
        programmazione: { attiva: true, frequenza: 'unica', prossimoInvio: Date.parse('2026-09-03T00:00:00Z') }
    }, extra || {});
}
function aChi() { return posta.map(m => m.to || (m.bcc || []).join(',')); }

// ---------- il piccolo motore delle prove ----------
let ok = 0, ko = 0;
function esito() { return { ok: ok, ko: ko }; }
function esigi(cond, testo) {
    if (cond) { ok++; console.log('  ok   ' + testo); }
    else { ko++; console.log('  KO   ' + testo); }
}
async function prova(nome, fn) { console.log('\n' + nome); await fn(); }


// ============================================================

(async () => {


await prova('1) Invio personalizzato completo in un giro solo', async () => {
    azzera(); passo(1000);
    metticomunicazione(comBase({ destinatariManuali: destinatari(6) }));
    const r = await giro();
    esigi(posta.length === 6, 'sei mail, una per destinatario (' + posta.length + ')');
    esigi(r.inviate === 1 && r.sospese === 0, 'risposta: inviate 1, sospese 0');
    const c = leggicomunicazione('c1');
    esigi(c.stato === 'inviata', 'la comunicazione unica risulta inviata');
    esigi(c.inviata && c.inviata.n === 6, 'lo storico dice 6 destinatari');
    esigi(!dati.has('comunicazioniInvio/c1'), 'l\'avanzamento e\' stato cancellato');
});

await prova('2) Tempo esaurito a meta\': si ferma, NON avanza, ricorda', async () => {
    azzera(); passo(30000);          // 30 s per mail: il budget e' 240 s
    metticomunicazione(comBase());
    const r = await giro();
    esigi(posta.length > 0 && posta.length < 20, 'ne ha spedite alcune ma non tutte (' + posta.length + '/20)');
    esigi(r.sospese === 1 && r.inviate === 0, 'risposta: sospese 1');
    const c = leggicomunicazione('c1');
    esigi(c.stato === 'programmata', 'resta programmata: e\' ancora dovuta');
    esigi(c.programmazione.prossimoInvio === Date.parse('2026-09-03T00:00:00Z'), 'la data NON e\' stata spostata');
    const av = dati.get('comunicazioniInvio/c1');
    esigi(!!av && av.serviti.length === posta.length, 'l\'avanzamento ricorda esattamente i serviti (' + (av ? av.serviti.length : 0) + ')');
    esigi(av.inviati === posta.length, 'e i conti tornano');
});

await prova('3) Ripresa: parte solo il resto, nessuno riceve due volte', async () => {
    const primi = aChi().slice();
    posta.length = 0;
    passo(1000);                        // stavolta c'e' tempo
    const r = await giro();
    const secondi = aChi();
    esigi(primi.length + secondi.length === 20, 'in totale venti mail, non una di piu\' (' + primi.length + '+' + secondi.length + ')');
    const doppi = secondi.filter(x => primi.includes(x));
    esigi(doppi.length === 0, 'nessun indirizzo servito due volte' + (doppi.length ? ' -> ' + doppi : ''));
    esigi(new Set(primi.concat(secondi)).size === 20, 'i venti destinatari sono tutti diversi e tutti serviti');
    const c = leggicomunicazione('c1');
    esigi(c.stato === 'inviata', 'ora risulta inviata');
    esigi(c.inviata.n === 20, 'lo storico somma le due tornate: ' + c.inviata.n);
    esigi(!dati.has('comunicazioniInvio/c1'), 'avanzamento ripulito');
    esigi(r.inviate === 1, 'risposta: inviate 1');
});

await prova('4) IL CASO CHE SI VOLEVA RISOLVERE: invio riuscito, storico non scritto', async () => {
    azzera(); passo(1000);
    metticomunicazione(comBase({ destinatariManuali: destinatari(5) }));
    guasti.set('archivio/comunicazioni', 1);   // il salvataggio dello storico fallisce una volta
    const r1 = await giro();
    esigi(posta.length === 5, 'primo giro: le cinque mail sono partite');
    const c1 = leggicomunicazione('c1');
    esigi(c1.stato === 'programmata', 'lo storico NON e\' stato aggiornato: risulta ancora dovuta');
    esigi(dati.has('comunicazioniInvio/c1'), 'ma l\'avanzamento e\' rimasto');

    posta.length = 0;
    const r2 = await giro();               // il giro dopo, un'ora piu' tardi
    esigi(posta.length === 0, 'secondo giro: ZERO mail nuove (prima sarebbero state 5)');
    const c2 = leggicomunicazione('c1');
    esigi(c2.stato === 'inviata', 'e ora la programmazione avanza lo stesso');
    esigi(c2.inviata.n === 5, 'con il conto giusto: ' + c2.inviata.n);
    esigi(!dati.has('comunicazioniInvio/c1'), 'avanzamento ripulito');
});

await prova('5) Ricorrente: l\'occorrenza nuova non eredita i serviti di quella vecchia', async () => {
    azzera(); passo(1000);
    const scorsa = Date.parse('2026-08-03T00:00:00Z');
    const questa = Date.parse('2026-09-03T00:00:00Z');
    metticomunicazione(comBase({
        destinatariManuali: destinatari(4),
        programmazione: { attiva: true, frequenza: 'mensile', prossimoInvio: questa }
    }));
    // avanzamento rimasto indietro dal mese scorso, con tutti gia' "serviti"
    dati.set('comunicazioniInvio/c1', {
        quando: scorsa, inviati: 4, falliti: [],
        serviti: destinatari(4).map(e => AV.impronta(e))
    });
    await giro();
    esigi(posta.length === 4, 'tutti e quattro ricevono l\'invio di settembre (' + posta.length + ')');
    const c = leggicomunicazione('c1');
    esigi(c.programmazione.prossimoInvio > questa, 'la ricorrenza e\' avanzata al mese dopo');
    esigi(c.stato === 'programmata', 'e resta programmata, perche\' e\' ricorrente');
});

await prova('6) BCC (nessuna variabile): una sola mail, e non si ripete', async () => {
    azzera(); passo(1000);
    metticomunicazione(comBase({ oggetto: 'Avviso a tutti', destinatariManuali: destinatari(8) }));
    guasti.set('archivio/comunicazioni', 1);
    await giro();
    esigi(posta.length === 1, 'una sola sendMail per tutto il lotto');
    esigi((posta[0].bcc || []).length === 8, 'otto indirizzi in copia nascosta');
    posta.length = 0;
    await giro();
    esigi(posta.length === 0, 'il giro dopo non rispedisce il lotto');
    esigi(leggicomunicazione('c1').inviata.n === 8, 'e lo storico conta 8');
});

await prova('7) Se NIENTE parte, non si segna nessuno come servito', async () => {
    azzera(); passo(1000); rompi(99);      // il server di posta rifiuta sempre
    metticomunicazione(comBase({ destinatariManuali: destinatari(3) }));
    await giro();
    esigi(posta.length === 0, 'nessuna mail e\' partita');
    const c = leggicomunicazione('c1');
    esigi(c.stato === 'programmata', 'la comunicazione resta dovuta');
    rompi(0);
    posta.length = 0;
    await giro();
    esigi(posta.length === 3, 'col server tornato su, tutti e tre ricevono (' + posta.length + ')');
});

await prova('8) Lucchetto: due giri non lavorano la stessa comunicazione', async () => {
    azzera();
    const preso1 = await AV.prendiLucchetto(db, 'c9', 'giro-A', 6 * 60 * 1000);
    const preso2 = await AV.prendiLucchetto(db, 'c9', 'giro-B', 6 * 60 * 1000);
    esigi(preso1 === true, 'il primo lo prende');
    esigi(preso2 === false, 'il secondo lo trova occupato');
    await AV.mollaLucchetto(db, 'c9');
    const preso3 = await AV.prendiLucchetto(db, 'c9', 'giro-C', 6 * 60 * 1000);
    esigi(preso3 === true, 'mollato, il terzo lo riprende');
});

await prova('9) mollaLucchetto dopo chiudi non resuscita il documento', async () => {
    azzera();
    await AV.segna(db, 'c8', 123, ['aa'], { inviati: 1, falliti: [] });
    await AV.chiudi(db, 'c8');
    await AV.mollaLucchetto(db, 'c8');
    esigi(!dati.has('comunicazioniInvio/c8'), 'il documento resta cancellato');
});

await prova('10) Due comunicazioni dovute, tempo per una sola', async () => {
    azzera(); passo(30000);
    dati.set('archivio/comunicazioni', { json: JSON.stringify([
        comBase({ id: 'c1', destinatariManuali: destinatari(20) }),
        comBase({ id: 'c2', destinatariManuali: ['solo@esempio.it'] })
    ]) });
    dati.set('archivio/persone', { json: '[]' });
    dati.set('archivio/incarichi', { json: '[]' });
    const r = await giro();
    esigi(r.sospese >= 1, 'la seconda risulta sospesa, non persa (' + r.sospese + ')');
    esigi(leggicomunicazione('c2').stato === 'programmata', 'c2 e\' ancora dovuta');
    esigi(!aChi().includes('solo@esempio.it'), 'c2 non ha ricevuto niente a meta\'');
    passo(1000);
    posta.length = 0;
    await giro();
    esigi(aChi().includes('solo@esempio.it'), 'al giro dopo c2 parte');
    esigi(leggicomunicazione('c1').stato === 'inviata' && leggicomunicazione('c2').stato === 'inviata', 'entrambe concluse');
});

await prova('11) Server su, un indirizzo rifiuta: segnato e non ritentato', async () => {
    azzera(); passo(1000);
    rifiuta('p02@esempio.it');                 // casella inesistente
    metticomunicazione(comBase({ destinatariManuali: destinatari(3) }));
    guasti.set('archivio/comunicazioni', 1);   // e lo storico non si scrive
    await giro();
    esigi(posta.length === 2, 'partono le due buone (' + posta.length + ')');
    const av = dati.get('comunicazioniInvio/c1');
    esigi(!!av && av.serviti.length === 3, 'tutti e tre risultano TENTATI, il rifiutato compreso');
    esigi(av.falliti.length === 1 && av.falliti[0].email === 'p02@esempio.it', 'il motivo del rifiuto e\' registrato');

    posta.length = 0;
    await giro();
    esigi(posta.length === 0, 'il giro dopo non ritenta ne\' le buone ne\' la rifiutata');
    const c = leggicomunicazione('c1');
    esigi(c.stato === 'inviata' && c.inviata.n === 2, 'la comunicazione si chiude con 2 destinatari');
    esigi(c.inviata.falliti === 1 && c.inviata.dettaglioFalliti[0].email === 'p02@esempio.it',
          'e lo storico riporta il fallito, leggibile dall\'area riservata');
    esigi(!dati.has('comunicazioniInvio/c1'), 'nessun avanzamento lasciato in giro');
});

const e = esito();
console.log('\n' + '-'.repeat(58));
console.log(e.ok + ' verifiche verdi, ' + e.ko + ' fallite');
process.exit(e.ko ? 1 : 0);
})();
