/* ============================================================
   PROVE - le richieste di check-up dalle pagine dei temi
   (lib/domande-sito.js, avvisaCheckUp, chiamata dalla scrittura
   generica di api/iscrizione-nuova.js)
   ------------------------------------------------------------
       node prove/check-up-temi.prove.js

   Niente da installare: Firestore e la posta sono finti e stanno qui
   dentro. Esce con 1 se qualcosa e' rosso.

   COSA DIMOSTRANO. Chi chiede un check-up da una pagina dei temi
   (crisi_impresa/, modello_231/... con `pagina` "<Tema> - Contatto")
   deve arrivare a chi risponde, e la scrittura generica non deve
   diventare un modo per spedire mail:
     - la riga si salva fra le iscrizioni come prima, e parte UNA mail a
       info@ (o a DOMANDE_DESTINATARI) con i dati del modulo, l'HTML
       neutralizzato e "Rispondi" verso chi ha scritto; a chi ha scritto
       niente;
     - "Rispondi" solo con un indirizzo nudo: con "lucia<vittima@...>"
       la mail parte senza, e lo dice;
     - con la posta giu' la risposta e' "ok", la riga c'e' e l'esito
       (`avvisoInterno`) dice che non e' partita;
     - ogni pagina dei temi del sito (letta dai file HTML) fa partire la
       mail; nessun altro modulo della scrittura generica la fa partire:
       newsletter della home e degli ebook, pagine degli eventi (anche
       con "- Contatto" in fondo), un corpo con un'azione, le domande di
       /contatti/;
     - lo stesso modulo spedito due volte nello stesso secondo: una mail;
     - il freno per IP: dalla nona richiesta in dieci minuti 429, e
       niente mail.
   ============================================================ */
'use strict';
const Module = require('module');
const path = require('path');
const fs = require('fs');

// ---------- orologio ----------
let orologio = Date.parse('2026-10-21T10:15:00+02:00');
const DateVera = Date;
global.Date = class extends DateVera {
    constructor(...a) { if (a.length) super(...a); else super(orologio); }
    static now() { return orologio; }
};

// ---------- Firestore finto ----------
const dati = new Map();
function applica(vecchio, patch, merge) {
    const base = (merge && vecchio) ? Object.assign({}, vecchio) : {};
    for (const k of Object.keys(patch)) {
        const v = patch[k];
        if (v && v.__del) delete base[k];
        else if (v && v.__inc) base[k] = (base[k] || 0) + v.__inc;
        else base[k] = v;
    }
    return base;
}
function istantanea(chiave, ref) {
    const v = dati.get(chiave);
    return { exists: dati.has(chiave), id: chiave.split('/').pop(), data: () => (v ? JSON.parse(JSON.stringify(v)) : undefined), ref: ref };
}
function doc(coll, id) {
    const chiave = coll + '/' + id;
    const self = {
        id: id, _chiave: chiave,
        get: async () => istantanea(chiave, self),
        set: async (patch, opz) => { dati.set(chiave, applica(dati.get(chiave), patch, !!(opz && opz.merge))); }
    };
    return self;
}
function interroga(coll, filtri, max) {
    return {
        where(campo, op, val) { return interroga(coll, filtri.concat([[campo, val]]), max); },
        limit(n) { return interroga(coll, filtri, n); },
        async get() {
            const docs = [...dati.keys()].filter(k => k.startsWith(coll + '/') && k.split('/').length === 2)
                .filter(k => filtri.every(([c, v]) => (dati.get(k) || {})[c] === v))
                .slice(0, max || 1e9)
                .map(k => istantanea(k, doc(coll, k.split('/')[1])));
            return { docs: docs, forEach: f => docs.forEach(f), size: docs.length };
        }
    };
}
const db = {
    collection(coll) { return Object.assign(interroga(coll, [], 0), { doc: id => doc(coll, id) }); },
    batch() {
        const op = [];
        return { set: (r, patch, opz) => op.push(() => r.set(patch, opz)), commit: async () => { for (const f of op) await f(); } };
    },
    async runTransaction(fn) {
        const scritture = [];
        const esito = await fn({ get: async r => r.get(), set: (r, patch, opz) => { scritture.push([r, patch, opz]); } });
        for (const [r, patch, opz] of scritture) await r.set(patch, opz);
        return esito;
    }
};
const admin = { initializeApp() { }, credential: { cert: () => ({}) }, apps: [], firestore: () => db };
admin.firestore.FieldValue = {
    serverTimestamp: () => orologio, increment: n => ({ __inc: n }),
    arrayUnion: (...a) => a, delete: () => ({ __del: true })
};

// ---------- posta e Cloudflare finti ----------
let spedite = [];
let mailGuasta = 0;
global.fetch = async (url, opz) => {
    if (/turnstile\/v0\/siteverify/.test(String(url))) {
        return { ok: true, status: 200, json: async () => ({ success: true, action: 'domanda-sito', 'error-codes': [] }) };
    }
    throw new Error('rete non prevista: ' + url);
};
const veroRequire = Module.prototype.require;
Module.prototype.require = function (nome) {
    if (nome === 'firebase-admin') return admin;
    if (nome === 'nodemailer') return { createTransport: () => ({ sendMail: async m => {
        if (mailGuasta > 0) { mailGuasta--; throw new Error('server di posta non raggiungibile'); }
        spedite.push(m); return {};
    }, close() { } }) };
    if (nome === 'imapflow') return { ImapFlow: function () { } };
    if (nome === 'google-auth-library') return { JWT: function () { }, GoogleAuth: function () { } };
    return veroRequire.apply(this, arguments);
};
process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ client_email: 'servizio@esempio.iam.gserviceaccount.com', private_key: 'chiave-finta' });
process.env.SMTP_FROM_EMAIL = 'noreply@esempio.it';
delete process.env.DOMANDE_DESTINATARI;
delete process.env.TURNSTILE_SECRET;

const RADICE = path.join(__dirname, '..');
const SITO = path.join(RADICE, '..');
const servizio = require(path.join(RADICE, 'api/iscrizione-nuova.js'));
const DOMANDE = require(path.join(RADICE, 'lib/domande-sito.js'));

let ok = 0, ko = 0;
function esigi(cond, cosa, extra) {
    if (cond) { ok++; console.log('  verde  ' + cosa); }
    else { ko++; console.log('  ROSSO  ' + cosa + (extra ? '   ' + extra : '')); }
}
let ipProgressivo = 0;
async function chiama(corpo, ip) {
    let stato = 0, risposta = null;
    const res = { setHeader() { }, status(s) { stato = s; return res; }, json(c) { risposta = c; return res; }, end() { return res; } };
    const errVero = console.error, avvVero = console.warn, logVero = console.log;
    console.error = () => { }; console.warn = () => { };
    try {
        await servizio({ method: 'POST', headers: { 'x-forwarded-for': ip || ('10.7.' + (ipProgressivo++ % 250) + '.1') }, body: JSON.stringify(corpo) }, res);
    } finally { console.error = errVero; console.warn = avvVero; console.log = logVero; }
    return { stato: stato, corpo: risposta || {} };
}
// lo stesso corpo che manda zls_zes/script.js
function checkUp(campi) {
    return Object.assign({
        data: '21/10/2026 10:15:00', pagina: 'La Crisi d\'Impresa - Contatto',
        nome: 'Lucia', cognome: 'Bianchi', email: 'Lucia@Studio.it',
        azienda: 'Studio Bianchi', ruolo: 'Amministratrice', telefono: '333 1234567',
        messaggio: '', privacy: true, marketing: false
    }, campi || {});
}
const righe = () => [...dati.keys()].filter(k => k.startsWith('iscrizioni/')).map(k => dati.get(k));
const avvisi = () => spedite.filter(m => /^Richiesta di check-up dal sito/.test(m.subject));
function azzera() { dati.clear(); spedite = []; mailGuasta = 0; }

const prove = [];
function prova(titolo, fn) { prove.push({ titolo: titolo, fn: fn }); }

prova('Un check-up da una pagina dei temi: la riga si salva e UNA mail arriva a info@, con "Rispondi" verso chi scrive', async () => {
    azzera();
    const r = await chiama(checkUp());
    esigi(r.stato === 200 && JSON.stringify(r.corpo) === '{"ok":true}', 'risposta: ok, e nient\'altro', r.stato + ' ' + JSON.stringify(r.corpo));
    const rr = righe();
    esigi(rr.length === 1 && rr[0].pagina === 'La Crisi d\'Impresa - Contatto' && rr[0].email === 'lucia@studio.it'
        && rr[0].azienda === 'Studio Bianchi' && rr[0].privacy === true && rr[0].marketing === false, 'la riga fra le iscrizioni, come prima', JSON.stringify(rr[0]));
    esigi(spedite.length === 1, 'una mail sola', String(spedite.length));
    const m = spedite[0] || {};
    esigi(m.to === 'info@nextgenerationbusiness.it' && m.replyTo === 'lucia@studio.it' && m.from === '"Revilaw S.p.A." <noreply@esempio.it>',
        'a info@, dal mittente di servizio, e "Rispondi" scrive a Lucia', JSON.stringify({ to: m.to, replyTo: m.replyTo, from: m.from }));
    esigi(m.subject === 'Richiesta di check-up dal sito - La Crisi d\'Impresa - Lucia Bianchi', 'oggetto: il tema senza "- Contatto", e il nome', m.subject);
    esigi(/^<!doctype html>/.test(m.html), 'nella pagina delle mail');
    const voci = [['Nome', 'Lucia'], ['Cognome', 'Bianchi'], ['Email', 'lucia@studio.it'], ['Azienda', 'Studio Bianchi'], ['Ruolo', 'Amministratrice'],
        ['Telefono', '333 1234567'], ['Pagina', 'La Crisi d&#39;Impresa - Contatto'], ['Data', '21/10/2026 10:15:00'],
        ['Consenso privacy', 'sì'], ['Consenso marketing', 'no']];
    const mancanti = voci.filter(v => !new RegExp(v[0] + '</td><td[^>]*>' + v[1].replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + '</td>').test(m.html));
    esigi(!mancanti.length, 'la tabella: nome, cognome, email, azienda, ruolo, telefono, pagina, data, privacy, marketing', JSON.stringify(mancanti));
    esigi(/Nome: Lucia\nCognome: Bianchi\nEmail: lucia@studio\.it/.test(m.text) && /Pagina: La Crisi d'Impresa - Contatto/.test(m.text)
        && /Consenso marketing: no/.test(m.text), 'anche nella versione testo');
    esigi(/Rispondendo a questo messaggio si scrive direttamente a lucia@studio\.it/.test(m.text), 'e dice che "Rispondi" scrive a Lucia');
    esigi(!spedite.some(x => /lucia@studio\.it/.test(String(x.to))), 'a Lucia non parte niente');
    const av = rr[0] && rr[0].avvisoInterno;
    esigi(av && av.ok === true && av.a === 1 && av.quando === orologio && !av.errore, 'e sulla riga resta com\'e\' andata', JSON.stringify(av));
});

prova('Con DOMANDE_DESTINATARI arriva agli stessi indirizzi delle domande', async () => {
    azzera();
    process.env.DOMANDE_DESTINATARI = 'Uno@Studio.it, due@studio.it, non-un-indirizzo';
    try {
        await chiama(checkUp({ pagina: 'Modello 231 - Contatto' }));
    } finally { delete process.env.DOMANDE_DESTINATARI; }
    const m = avvisi()[0] || {};
    esigi(avvisi().length === 1 && m.to === 'uno@studio.it, due@studio.it', 'a tutti e due, e a nessun altro', m.to);
    esigi(m.subject === 'Richiesta di check-up dal sito - Modello 231 - Lucia Bianchi', 'con il tema della pagina', m.subject);
    esigi((righe()[0].avvisoInterno || {}).a === 2, 'e la riga dice a quanti');
});

prova('Un indirizzo che non e\' un indirizzo nudo: la mail parte, senza "Rispondi"', async () => {
    azzera();
    const sporchi = ['lucia<vittima@altro.it>', 'lucia,vittima@altro.it', '"lucia"@studio.it'];
    for (let i = 0; i < sporchi.length; i++) {
        const sporco = sporchi[i];
        spedite = [];
        const r = await chiama(checkUp({ email: sporco, data: '21/10/2026 10:1' + i + ':00' }));
        const m = avvisi()[0] || {};
        esigi(r.corpo.ok === true && avvisi().length === 1 && !('replyTo' in m), sporco + ': salvata, una mail a noi, senza "Rispondi"', r.stato + ' ' + JSON.stringify(Object.keys(m)));
        esigi(/non è un indirizzo semplice/.test(m.text) && !/Rispondendo a questo messaggio/.test(m.text), 'e la mail lo dice');
        esigi(spedite.length === 1 && m.to === 'info@nextgenerationbusiness.it', 'e all\'altro non parte niente');
    }
    const m = avvisi()[0] || {};
    esigi(/&quot;lucia&quot;@studio\.it/.test(m.html), 'l\'indirizzo strano e\' scritto neutralizzato');
});

prova('Con la posta giu\' la risposta e\' "ok", la riga c\'e\' e dice che la mail non e\' partita', async () => {
    azzera();
    mailGuasta = 1;
    const r = await chiama(checkUp());
    esigi(r.stato === 200 && r.corpo.ok === true, 'risposta: ok', r.stato + ' ' + JSON.stringify(r.corpo));
    const rr = righe();
    esigi(rr.length === 1 && rr[0].email === 'lucia@studio.it', 'la riga e\' salva');
    const av = rr[0] && rr[0].avvisoInterno;
    esigi(av && av.ok === false && /non raggiungibile/.test(av.errore) && av.quando === orologio, 'avvisoInterno: ok falso, con l\'errore', JSON.stringify(av));
    esigi(spedite.length === 0, 'e nessuna mail');
    // rispedito dopo: la riga non era stata avvisata, quindi ora si'
    const r2 = await chiama(checkUp());
    esigi(r2.corpo.ok === true && avvisi().length === 1 && (righe()[0].avvisoInterno || {}).ok === true, 'rispedito con la posta tornata: l\'avviso parte');
});

prova('L\'HTML che arriva dal modulo e\' neutralizzato', async () => {
    azzera();
    await chiama(checkUp({
        nome: '<img src=x onerror=alert(1)>', cognome: 'Bianchi', azienda: 'A & B "Srl"', ruolo: '<script>alert(2)</script>',
        telefono: '<a href="https://truffa.example">chiama</a>', pagina: '<b>Tema</b> - Contatto'
    }));
    const m = avvisi()[0] || {};
    esigi(avvisi().length === 1, 'la mail parte');
    esigi(!/<img src=x|<script>|<b>Tema<\/b>|<a href="https:\/\/truffa/.test(m.html), 'nessun pezzo di HTML del modulo passa com\'e\'');
    esigi(/&lt;img src=x onerror=alert\(1\)&gt;/.test(m.html) && /A &amp; B &quot;Srl&quot;/.test(m.html) && /&lt;script&gt;alert\(2\)&lt;\/script&gt;/.test(m.html)
        && /&lt;b&gt;Tema&lt;\/b&gt; - Contatto/.test(m.html), 'si legge, scritto come testo');
    esigi(!/[\r\n]/.test(m.subject), 'l\'oggetto sta su una riga');
});

prova('Il messaggio, quando la pagina lo manda (i simulatori di fcd_2026 e lazio_bandi_2026), c\'e\'', async () => {
    azzera();
    await chiama(checkUp({ pagina: 'Bandi Lazio 2026 - Contatto', messaggio: 'Esito del simulatore: <b>3 bandi</b> compatibili' }));
    const m = avvisi()[0] || {};
    esigi(/<b>Messaggio<\/b><br>Esito del simulatore: &lt;b&gt;3 bandi&lt;\/b&gt; compatibili/.test(m.html) && /Messaggio:\nEsito del simulatore/.test(m.text),
        'nell\'HTML (neutralizzato) e nel testo');
    azzera();
    await chiama(checkUp());
    esigi(!/Messaggio/.test((avvisi()[0] || {}).html || ''), 'e senza messaggio niente riquadro vuoto');
});

prova('Ogni pagina dei temi del sito fa partire la mail', async () => {
    const pagine = new Set();
    for (const cartella of fs.readdirSync(SITO)) {
        const f = path.join(SITO, cartella, 'index.html');
        if (!fs.existsSync(f)) continue;
        const html = fs.readFileSync(f, 'utf8');
        (html.match(/data-pagina="[^"]*"/g) || []).forEach(x => pagine.add(x.slice(13, -1)));
    }
    const temi = [...pagine].filter(p => / - Contatto$/.test(p));
    esigi(temi.length >= 30, 'le pagine dei temi lette dai file: ' + temi.length);
    const senza = [];
    for (const p of temi) {
        azzera();
        const r = await chiama(checkUp({ pagina: p }));
        const m = avvisi()[0] || {};
        if (!(r.corpo.ok === true && avvisi().length === 1 && m.subject === DOMANDE.mailCheckUp({ pagina: p, nome: 'Lucia', cognome: 'Bianchi' }).oggetto
            && !/ - Contatto - Lucia/.test(m.subject))) senza.push(p);
    }
    esigi(!senza.length, 'tutte, con il tema senza "- Contatto" nell\'oggetto', JSON.stringify(senza));
    esigi(DOMANDE.temaDaPagina('Cassazione 7134/2026 - Adeguati Assetti - Contatto') === 'Cassazione 7134/2026 - Adeguati Assetti', 'un tema con un trattino dentro resta intero');
});

prova('Nessun altro modulo della scrittura generica fa partire la mail', async () => {
    const altre = [
        ['Landing - Newsletter', 'la newsletter della home (script.js)'],
        ['Responsabilita Amministratori - Newsletter', 'l\'ebook di responsabilita_amministratori/'],
        ['Tax Control Framework - Newsletter', 'l\'ebook di tax_control_framework/'],
        ['Roma 29 Aprile 2026 - Iscrizione', 'l\'iscrizione a Roma'],
        ['Napoli 2 Ottobre 2026 - Manifestazione di interesse', 'Napoli e il questionario p26/'],
        ['Verona 27 Marzo 2026 - Contatto', 'una pagina di evento, anche con "- Contatto" in fondo'],
        ['Contatto', 'una pagina che si chiama solo "Contatto"'],
        ['Modello 231 - Contattoxyz', 'un "Contatto" che non e\' in fondo']
    ];
    for (const [pagina, cosa] of altre) {
        azzera();
        const r = await chiama(checkUp({ pagina: pagina }));
        const rr = righe();
        esigi(r.corpo.ok === true && rr.length === 1 && !avvisi().length && !spedite.some(m => /info@nextgenerationbusiness\.it/.test(String(m.to)))
            && !('avvisoInterno' in rr[0]), cosa + ': salvata, nessuna mail a noi', r.stato + ' ' + JSON.stringify(spedite.map(m => m.subject)));
    }
    azzera();
    const conAzione = await chiama(checkUp({ azione: 'qualcosa-di-nuovo' }));
    esigi(conAzione.corpo.ok === true && righe().length === 1 && !avvisi().length, 'un corpo con un\'azione sconosciuta: salvato, nessuna mail');
    azzera();
    const domanda = await chiama({
        azione: 'domanda-sito', pagina: 'Modello 231 - Contatto', nome: 'Lucia', cognome: 'Bianchi', email: 'lucia@studio.it',
        tema: 'modello-231', messaggio: 'Una domanda', privacy: true, ms: 15000, sito: ''
    });
    esigi(domanda.corpo.ok === true && !avvisi().length && righe().length === 0 && spedite.some(m => /^Domanda dal sito/.test(m.subject)),
        'una domanda di /contatti/ con una pagina dei temi: resta una domanda, niente check-up', JSON.stringify(spedite.map(m => m.subject)));
});

prova('Lo stesso modulo spedito due volte nello stesso secondo: una mail', async () => {
    azzera();
    await chiama(checkUp());
    await chiama(checkUp());
    esigi(righe().length === 1 && avvisi().length === 1, 'una riga, una mail', righe().length + ' / ' + avvisi().length);
    await chiama(checkUp({ data: '21/10/2026 10:16:00' }));
    esigi(righe().length === 2 && avvisi().length === 2, 'un\'altra richiesta, un minuto dopo: un\'altra mail');
});

prova('Il freno per indirizzo IP: dalla nona in dieci minuti 429, e niente mail', async () => {
    azzera();
    let respinte = 0;
    for (let i = 0; i < 10; i++) {
        const r = await chiama(checkUp({ email: 'ip' + i + '@studio.it' }), '172.16.9.9');
        if (r.stato === 429) respinte++;
    }
    esigi(respinte === 2 && righe().length === 8 && avvisi().length === 8, 'otto passano, due no', respinte + ' / ' + righe().length + ' / ' + avvisi().length);
});

(async () => {
    for (const p of prove) { console.log('\n' + p.titolo); await p.fn(); }
    console.log('\n' + ok + ' verdi, ' + ko + ' rossi');
    process.exit(ko ? 1 : 0);
})();
