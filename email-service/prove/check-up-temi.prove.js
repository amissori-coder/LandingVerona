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
     - la mail parte solo con un indirizzo nudo e un nome o un cognome:
       con "lucia<vittima@...>", un indirizzo con l'accento o senza nome
       la riga si salva e non parte niente (e la riga lo dice);
     - tre avvisi al giorno per indirizzo (le varianti con "+qualcosa"
       contano insieme), contati a parte dalle domande di /contatti/;
     - un tetto di tutti al giorno (40, o CHECKUP_MAX_GIORNO), che chi ha
       gia' raggiunto il suo tetto non consuma; il giorno dopo si riparte;
     - oltre un tetto: risposta "ok", riga salva, `avvisoInterno` con ok
       falso e quale tetto, nessuna mail;
     - una pagina che non e' fra quelle dei temi: la mail parte (dentro i
       tetti) con "tema non riconosciuto" nell'oggetto, e la pagina
       scritta nel modulo solo dentro, neutralizzata;
     - la lista delle pagine del servizio (PAGINE_CHECK_UP) e' quella del
       sito: ogni `data-pagina` "<...> - Contatto" dei file HTML (e ogni
       nome di riserva negli script) c'e', e niente in piu';
     - il messaggio su piu' righe dei simulatori arriva con gli a capo:
       <br> nell'HTML, a capo nel testo;
     - con la posta giu' la risposta e' "ok", la riga c'e' e l'esito
       (`avvisoInterno`) dice che non e' partita;
     - ogni pagina dei temi del sito (letta dai file HTML) fa partire la
       mail, con il suo tema nell'oggetto; nessun altro modulo della
       scrittura generica la fa partire: newsletter della home e degli
       ebook, pagine degli eventi (anche con "- Contatto" in fondo), un
       corpo con un'azione, le domande di /contatti/;
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

prova('Senza un indirizzo nudo, o senza nome e cognome: la riga si salva e non parte niente', async () => {
    azzera();
    const sporchi = ['lucia<vittima@altro.it>', 'lucia,vittima@altro.it', '"lucia"@studio.it', 'lucìa@studio.it', 'lucia@studio.it;x'];
    for (let i = 0; i < sporchi.length; i++) {
        const sporco = sporchi[i];
        const r = await chiama(checkUp({ email: sporco, data: '21/10/2026 10:1' + i + ':00' }));
        const riga = righe().find(x => x.data === '21/10/2026 10:1' + i + ':00') || {};
        const av = riga.avvisoInterno || {};
        esigi(r.stato === 200 && r.corpo.ok === true && riga.email === sporco.toLowerCase(), sporco + ': risposta ok, la riga c\'e\'', r.stato + ' ' + JSON.stringify(r.corpo));
        esigi(av.ok === false && /indirizzo semplice/.test(av.errore) && av.quando === orologio, 'e dice perche\' non e\' partito l\'avviso', JSON.stringify(av));
    }
    esigi(spedite.length === 0, 'nessuna mail, ne\' a noi ne\' ad altri', JSON.stringify(spedite.map(m => m.to)));
    azzera();
    const r = await chiama(checkUp({ nome: '', cognome: '  ' }));
    const av = (righe()[0] || {}).avvisoInterno || {};
    esigi(r.corpo.ok === true && righe().length === 1 && !spedite.length && av.ok === false && /mancano nome e cognome/.test(av.errore),
        'un indirizzo buono senza nome e cognome: la riga, e nessuna mail', JSON.stringify(av));
    azzera();
    await chiama(checkUp({ cognome: '' }));
    esigi(avvisi().length === 1 && avvisi()[0].subject === 'Richiesta di check-up dal sito - La Crisi d\'Impresa - Lucia', 'con il nome soltanto la mail parte', (avvisi()[0] || {}).subject);
    azzera();
    await chiama(checkUp({ email: 'O\'Neil@Studio.it' }));
    const m = avvisi()[0] || {};
    esigi(avvisi().length === 1 && m.replyTo === 'o\'neil@studio.it' && /o&#39;neil@studio\.it/.test(m.html), 'un indirizzo nudo con l\'apostrofo: la mail parte, scritto neutralizzato', JSON.stringify({ replyTo: m.replyTo }));
});

prova('Tre avvisi al giorno per indirizzo; oltre, la riga c\'e\' e la mail no', async () => {
    azzera();
    const risposte = [];
    for (let i = 0; i < 4; i++) risposte.push(await chiama(checkUp({ data: '21/10/2026 10:2' + i + ':00' })));
    esigi(risposte.every(r => r.stato === 200 && JSON.stringify(r.corpo) === '{"ok":true}'), 'quattro risposte "ok", tutte uguali', JSON.stringify(risposte));
    esigi(righe().length === 4 && avvisi().length === 3, 'quattro righe, tre mail', righe().length + ' / ' + avvisi().length);
    const quarta = righe().find(x => x.data === '21/10/2026 10:23:00') || {};
    const av = quarta.avvisoInterno || {};
    esigi(av.ok === false && /^tetto per indirizzo: 3 avvisi al giorno$/.test(av.errore) && !('a' in av), 'la quarta riga dice il tetto', JSON.stringify(av));
    await chiama(checkUp({ email: 'Lucia+checkup@studio.it', data: '21/10/2026 10:30:00' }));
    esigi(avvisi().length === 3, 'lucia+checkup@studio.it e\' la stessa casella: niente');
    await chiama(checkUp({ email: 'marco@studio.it', nome: 'Marco', data: '21/10/2026 10:31:00' }));
    esigi(avvisi().length === 4, 'un altro indirizzo: la mail parte');
    const limiti = [...dati.keys()].filter(k => k.startsWith('domandeSitoLimiti/'));
    esigi(limiti.length === 2 && !limiti.some(k => /lucia|marco|studio/.test(k + JSON.stringify(dati.get(k)))), 'i contatori per impronta: l\'indirizzo non ci sta scritto', JSON.stringify(limiti));
    // le domande di /contatti/ hanno il loro conto
    const domanda = await chiama({
        azione: 'domanda-sito', nome: 'Lucia', cognome: 'Bianchi', email: 'lucia@studio.it',
        tema: 'crisi', messaggio: 'Una domanda', privacy: true, ms: 15000, sito: ''
    });
    esigi(domanda.corpo.ok === true && spedite.some(m => /^Domanda dal sito/.test(m.subject)), 'una domanda da /contatti/ dello stesso indirizzo passa: i due conti sono separati');
    // il giorno dopo si riparte
    const ieri = orologio;
    orologio += 24 * 3600 * 1000;
    try {
        await chiama(checkUp({ data: '22/10/2026 09:00:00' }));
        esigi(avvisi().length === 5, 'il giorno dopo l\'avviso riparte');
    } finally { orologio = ieri; }
});

prova('Il tetto di tutti al giorno: 40, o CHECKUP_MAX_GIORNO', async () => {
    azzera();
    process.env.CHECKUP_MAX_GIORNO = '4';
    try {
        // cinque dallo stesso indirizzo: tre passano, due fermate dal tetto suo, che non consumano quello di tutti
        for (let i = 0; i < 5; i++) await chiama(checkUp({ data: '21/10/2026 11:0' + i + ':00' }));
        esigi(avvisi().length === 3 && (dati.get('checkUpLimiti/2026-10-21') || {}).quante === 3, 'cinque dallo stesso indirizzo: tre mail, tre nel conto di tutti',
            avvisi().length + ' / ' + JSON.stringify(dati.get('checkUpLimiti/2026-10-21')));
        const r1 = await chiama(checkUp({ email: 'marco@studio.it', nome: 'Marco' }));
        esigi(r1.corpo.ok === true && avvisi().length === 4, 'un altro indirizzo: la quarta');
        const r2 = await chiama(checkUp({ email: 'anna@studio.it', nome: 'Anna' }));
        const riga = righe().find(x => x.email === 'anna@studio.it') || {};
        const av = riga.avvisoInterno || {};
        esigi(r2.stato === 200 && JSON.stringify(r2.corpo) === '{"ok":true}' && avvisi().length === 4, 'la quinta: risposta "ok", nessuna mail', r2.stato + ' ' + JSON.stringify(r2.corpo));
        esigi(av.ok === false && av.errore === 'tetto del giorno: 4 avvisi', 'e la riga dice il tetto del giorno', JSON.stringify(av));
        esigi((dati.get('checkUpLimiti/2026-10-21') || {}).quante === 4, 'il conto si ferma al tetto', JSON.stringify(dati.get('checkUpLimiti/2026-10-21')));
        const ieri = orologio;
        orologio += 24 * 3600 * 1000;
        try {
            await chiama(checkUp({ email: 'anna@studio.it', nome: 'Anna', data: '22/10/2026 09:00:00' }));
            esigi(avvisi().length === 5 && (dati.get('checkUpLimiti/2026-10-22') || {}).quante === 1, 'il giorno dopo si riparte da zero');
        } finally { orologio = ieri; }
    } finally { delete process.env.CHECKUP_MAX_GIORNO; }
    for (const valore of [undefined, 'abc', '0', '-3', '2.5']) {
        azzera();
        if (valore === undefined) delete process.env.CHECKUP_MAX_GIORNO; else process.env.CHECKUP_MAX_GIORNO = valore;
        try {
            for (let i = 0; i < 41; i++) await chiama(checkUp({ email: 'persona' + i + '@studio.it', nome: 'Persona', cognome: String(i) }));
        } finally { delete process.env.CHECKUP_MAX_GIORNO; }
        const ultima = righe().find(x => x.email === 'persona40@studio.it') || {};
        esigi(righe().length === 41 && avvisi().length === 40 && (ultima.avvisoInterno || {}).errore === 'tetto del giorno: 40 avvisi',
            (valore === undefined ? 'senza CHECKUP_MAX_GIORNO' : 'con CHECKUP_MAX_GIORNO="' + valore + '"') + ': 41 richieste, 40 mail', righe().length + ' / ' + avvisi().length);
    }
});

prova('Una pagina che non e\' fra quelle dei temi: la mail parte con "tema non riconosciuto"', async () => {
    azzera();
    const strana = 'Vinci un iPhone su www.truffa.example - Contatto';
    const r = await chiama(checkUp({ pagina: strana }));
    const m = avvisi()[0] || {};
    esigi(r.corpo.ok === true && righe().length === 1 && righe()[0].pagina === strana, 'la riga si salva com\'e\' arrivata');
    esigi(avvisi().length === 1 && m.subject === 'Richiesta di check-up dal sito - tema non riconosciuto - Lucia Bianchi', 'oggetto neutro', m.subject);
    esigi(!/truffa|iPhone/.test(m.subject), 'il testo della pagina non e\' nell\'oggetto');
    esigi(/non è fra quelle dei temi del sito/.test(m.html) && /Pagina<\/td><td[^>]*>Vinci un iPhone su www\.truffa\.example - Contatto<\/td>/.test(m.html)
        && /Pagina: Vinci un iPhone su www\.truffa\.example - Contatto/.test(m.text), 'dentro, la pagina com\'e\' arrivata, nella tabella');
    azzera();
    await chiama(checkUp({ pagina: 'la crisi d\'impresa  -  contatto' }));
    esigi((avvisi()[0] || {}).subject === 'Richiesta di check-up dal sito - La Crisi d\'Impresa - Lucia Bianchi', 'una pagina nota scritta in minuscolo: il tema, con la nostra etichetta', (avvisi()[0] || {}).subject);
    esigi(DOMANDE.temaDaPagina(strana) === '' && DOMANDE.temaDaPagina('Modello 231 - Contatto') === 'Modello 231', 'temaDaPagina: la nostra etichetta, o niente');
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
    esigi(!/Messaggio/.test((avvisi()[0] || {}).html || '') && !/Messaggio/.test((avvisi()[0] || {}).text || ''), 'e senza messaggio niente riquadro vuoto');
    azzera();
    await chiama(checkUp({ messaggio: '  \n\r\n \t ' }));
    esigi(avvisi().length === 1 && !/Messaggio/.test(avvisi()[0].html + avvisi()[0].text), 'un messaggio di soli spazi e a capo: niente riquadro');
});

prova('Il riassunto dei simulatori, su piu\' righe, arriva con gli a capo', async () => {
    azzera();
    // come lo costruiscono wizard.js e simulatori.js: righe unite con '\n'
    const riassunto = ['Esito simulatore FCD', 'Spese ammissibili: 120000 EUR', 'Risposte:', '  ateco: <C.25>'].join('\n')
        + '\r\n\n\n\n\nFine \u0007 riassunto';
    await chiama(checkUp({ pagina: 'Fondo Contrasto Deindustrializzazione 2026 - Contatto', messaggio: riassunto }));
    const m = avvisi()[0] || {};
    esigi(m.html && m.html.indexOf('<b>Messaggio</b><br>Esito simulatore FCD<br>Spese ammissibili: 120000 EUR<br>Risposte:<br>  ateco: &lt;C.25&gt;<br><br><br>Fine   riassunto</p>') >= 0,
        'nell\'HTML: una riga per riga, con <br>, il testo neutralizzato (e non piu\' di due righe vuote)', ((m.html || '').match(/<b>Messaggio<\/b>[^]*?<\/p>/) || [''])[0]);
    esigi((m.text || '').indexOf('Messaggio:\nEsito simulatore FCD\nSpese ammissibili: 120000 EUR\nRisposte:\n  ateco: <C.25>\n\n\nFine   riassunto') >= 0,
        'nel testo: gli stessi a capo', JSON.stringify(m.text));
    esigi(!/\n/.test(righe()[0].messaggio) && /Esito simulatore FCD Spese ammissibili/.test(righe()[0].messaggio), 'la riga fra le iscrizioni resta com\'era, su una riga', JSON.stringify(righe()[0].messaggio));
    azzera();
    await chiama(checkUp({ messaggio: ('x'.repeat(99) + '\n').repeat(30) }));
    const m2 = avvisi()[0] || {};
    const corpo = ((m2.text || '').match(/Messaggio:\n([^]*?)\n\nRispondendo/) || ['', ''])[1];
    esigi(corpo.length > 1990 && corpo.length <= 2000 && (m2.html.match(/<br>/g) || []).length >= 20, 'al massimo 2000 caratteri, a capo compresi', String(corpo.length));
});

/* Le pagine dei temi del sito: ogni `data-pagina` "<...> - Contatto" dei file
   HTML, e i nomi di riserva degli script (`form.dataset.pagina || '...'`).
   Le pagine degli eventi restano fuori, come nel servizio (non avvisano). */
function pagineDelSito() {
    const html = [], js = [];
    (function giro(cartella) {
        for (const voce of fs.readdirSync(cartella, { withFileTypes: true })) {
            if (voce.name.startsWith('.') || voce.name === 'node_modules' || voce.name === 'email-service') continue;
            const f = path.join(cartella, voce.name);
            if (voce.isDirectory()) giro(f);
            else if (/\.html$/.test(voce.name)) html.push(f);
            else if (/\.js$/.test(voce.name)) js.push(f);
        }
    })(SITO);
    const decodifica = x => x.replace(/&#39;|&apos;/g, '\'').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    const pagine = new Map();
    for (const f of html) {
        const t = fs.readFileSync(f, 'utf8');
        for (const x of t.matchAll(/data-pagina="([^"]*)"/g)) pagine.set(decodifica(x[1]), path.relative(SITO, f));
    }
    for (const f of js) {
        const t = fs.readFileSync(f, 'utf8');
        for (const x of t.matchAll(/'([^'\n]{1,200})'/g)) if (DOMANDE.paginaCheckUp(x[1])) pagine.set(x[1], path.relative(SITO, f));
    }
    for (const p of [...pagine.keys()]) if (!DOMANDE.paginaCheckUp(p) || /verona|roma|napoli|milano/i.test(p)) pagine.delete(p);
    return pagine;
}

prova('La lista delle pagine dei temi del servizio e\' quella del sito', async () => {
    const sito = pagineDelSito();
    const lista = DOMANDE.PAGINE_CHECK_UP;
    esigi(sito.size >= 30, 'le pagine dei temi lette dai file: ' + sito.size);
    const mancanti = [...sito.keys()].filter(p => lista.indexOf(p) < 0).map(p => p + ' (' + sito.get(p) + ')');
    esigi(!mancanti.length, 'ogni pagina del sito e\' nella lista di lib/domande-sito.js (PAGINE_CHECK_UP)', JSON.stringify(mancanti));
    const inPiu = lista.filter(p => !sito.has(p));
    esigi(!inPiu.length, 'e nella lista non c\'e\' una pagina che il sito non ha piu\'', JSON.stringify(inPiu));
    esigi(new Set(lista).size === lista.length && lista.every(p => / - Contatto$/.test(p) && DOMANDE.temaDaPagina(p) === p.slice(0, -' - Contatto'.length)),
        'nessun doppione, e ognuna ha il suo tema');
});

prova('Ogni pagina dei temi del sito fa partire la mail, con il suo tema nell\'oggetto', async () => {
    const temi = [...pagineDelSito().keys()];
    esigi(temi.length >= 30, 'le pagine dei temi lette dai file: ' + temi.length);
    const senza = [];
    for (const p of temi) {
        azzera();
        const r = await chiama(checkUp({ pagina: p }));
        const m = avvisi()[0] || {};
        if (!(r.corpo.ok === true && avvisi().length === 1
            && m.subject === 'Richiesta di check-up dal sito - ' + p.slice(0, -' - Contatto'.length) + ' - Lucia Bianchi')) senza.push(p + ': ' + m.subject);
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
