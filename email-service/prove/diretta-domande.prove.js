/* ============================================================
   PROVE - le domande al relatore (lib/diretta-domande.js,
   api/diretta-domande.js, le azioni della regia in
   api/diretta-gestione.js, relatore-accesso in lib/diretta-accesso.js)
   ------------------------------------------------------------
       node prove/diretta-domande.prove.js

   Niente da installare, niente emulatori, niente rete: Firestore e
   Firebase Auth sono finti e stanno qui dentro (filtri ==,
   array-contains e >=, transazioni, conteggi), i token sono oggetti
   gia' "verificati" e la posta non parte. Esce con 1 se qualcosa e'
   rosso. Dura una decina di secondi (il primo accesso del relatore
   risponde sempre dopo lo stesso tempo, come quello dei gestori).

   COSA DIMOSTRANO.
   - IL PARTECIPANTE manda una domanda dalla porta vera: testo ripulito
     (spazi, righe vuote, caratteri di controllo), troppo corta, troppo
     lunga o con troppe righe -> 400; una ogni 8 secondi (429 'attendi');
     non iscritto, disattivato, da un altro dispositivo -> 403; dopo
     «Termina» -> 409 'domande-chiuse', prima dell'inizio e in pausa si';
     con «Domande al relatore» spento nella scheda Evento -> 409
     'domande-spente'.
     Nome, cognome, azienda ed email si copiano dal profilo. «mie» rende
     solo le sue domande di quell'evento, senza i dati di nessuno.
   - IL RELATORE vede tutte le domande del SUO evento, dalla piu'
     vecchia, con nome, cognome e azienda ma senza email; un altro
     evento, un account senza il claim, con l'email non verificata (chi
     si registra da solo), entrato senza password (il token di un
     partecipante) -> 403; tolto dall'elenco dei relatori -> 403 da
     subito. La regia (gestore) vede tutto, anche le email e chi ha
     segnato la risposta.
   - «Risposta data»: si segna e si toglie, con chi e quando; ripeterla
     non riscrive; una domanda di un altro evento -> 404; identificativo
     o valore sbagliati -> 400. Il partecipante vede il segno sulle sue.
   - I PARTECIPANTI per il relatore: solo gli attivi, chi e' collegato
     (segnale negli ultimi 150 secondi), i conteggi; l'email solo alla
     regia.
   - I RELATORI dell'evento (scheda Evento): email ripulite e senza
     doppie, una non valida -> 400 prima di salvare l'evento, al massimo
     10, evento inesistente -> 404; 'eventi' e 'evento-salva' della
     gestione li portano con l'evento; «eventi» del relatore: solo i
     suoi, del gestore tutti.
   - IL PRIMO ACCESSO DEL RELATORE: risposta sempre uguale e nello
     stesso tempo; l'email parte solo se l'indirizzo e' fra i relatori;
     l'account e' quello della sua email vera, verificata, con il claim
     relatore; chi si era registrato da solo con quell'email perde
     password e sessioni; un gestore resta gestore (e tiene la password).
   - LA PORTA: OPTIONS, GET, azione sconosciuta, senza token.
   ============================================================ */
'use strict';
const Module = require('module');
const path = require('path');

let rossi = 0, verdi = 0;
function vero(cond, descrizione, dettaglio) {
    if (cond) verdi++;
    else { rossi++; console.log('ROSSO  ' + descrizione + (dettaglio ? '\n       ' + dettaglio : '')); }
}

/* ---------- Firestore finto ---------- */
class Ts {
    constructor(ms) { this._ms = ms; }
    toMillis() { return this._ms; }
}
const INC = n => ({ __inc: n });
function valoreDi(v) { return v && typeof v.toMillis === 'function' ? v.toMillis() : v; }
function fondi(vecchio, nuovo) {
    const out = Object.assign({}, vecchio || {});
    Object.keys(nuovo || {}).forEach(k => {
        const v = nuovo[k];
        out[k] = v && typeof v === 'object' && typeof v.__inc === 'number' ? (Number(out[k]) || 0) + v.__inc : v;
    });
    return out;
}
function creaDb() {
    const docs = new Map();
    let auto = 0;
    const scritture = [];
    function foto(percorso) {
        const d = docs.get(percorso);
        const id = percorso.split('/').pop();
        return {
            id: id, exists: !!d, ref: rif(percorso),
            data: () => (d ? Object.assign({}, d) : undefined),
            get: campo => (d ? d[campo] : undefined)
        };
    }
    function scrivi(tipo, percorso, dati, opz) {
        const c = docs.get(percorso);
        if (tipo === 'create' && c) { const e = new Error('esiste gia\''); e.code = 6; throw e; }
        if (tipo === 'update' && !c) { const e = new Error('non esiste: ' + percorso); e.code = 5; throw e; }
        const nuovo = tipo === 'update' || (opz && opz.merge) ? fondi(c, dati) : fondi({}, dati);
        docs.set(percorso, nuovo);
        scritture.push(percorso);
    }
    function rif(percorso) {
        return {
            id: percorso.split('/').pop(), path: percorso,
            get: async () => foto(percorso),
            set: async (d, o) => scrivi('set', percorso, d, o),
            update: async d => scrivi('update', percorso, d),
            create: async d => scrivi('create', percorso, d),
            delete: async () => { docs.delete(percorso); },
            collection: nome => collezione(percorso + '/' + nome)
        };
    }
    function collezione(nome, filtri, tetto) {
        filtri = filtri || [];
        const q = {
            doc: id => rif(nome + '/' + (id === undefined ? 'auto' + (++auto) : id)),
            where: (campo, op, val) => collezione(nome, filtri.concat([{ campo, op, val }]), tetto),
            limit: n => collezione(nome, filtri, n),
            orderBy: () => q,
            _elenco: () => {
                let ch = Array.from(docs.keys()).filter(k => k.indexOf(nome + '/') === 0 && k.slice(nome.length + 1).indexOf('/') < 0).sort();
                ch = ch.filter(k => filtri.every(f => {
                    const v = docs.get(k)[f.campo];
                    if (f.op === '==') return valoreDi(v) === valoreDi(f.val);
                    if (f.op === 'array-contains') return Array.isArray(v) && v.indexOf(f.val) >= 0;
                    if (f.op === '>=') return v != null && valoreDi(v) >= valoreDi(f.val);
                    throw new Error('operatore non previsto: ' + f.op);
                }));
                if (tetto) ch = ch.slice(0, tetto);
                return ch;
            },
            get: async () => {
                const d = q._elenco().map(foto);
                return { docs: d, empty: !d.length, size: d.length, forEach: f => d.forEach(f) };
            },
            count: () => ({ get: async () => ({ data: () => ({ count: q._elenco().length }) }) })
        };
        return q;
    }
    const db = {
        collection: nome => collezione(nome),
        getAll: async (...r) => r.map(x => foto(x.path)),
        runTransaction: async fn => {
            const coda = [];
            const tx = {
                get: async x => (x.path ? foto(x.path) : x.get()),
                getAll: async (...r) => r.map(x => foto(x.path)),
                set: (x, d, o) => { coda.push(['set', x.path, d, o]); },
                update: (x, d) => { coda.push(['update', x.path, d]); },
                create: (x, d) => { coda.push(['create', x.path, d]); }
            };
            const esito = await fn(tx);
            coda.forEach(([t, p, d, o]) => scrivi(t, p, d, o));
            return esito;
        }
    };
    return { db, docs, scritture };
}

/* ---------- Firebase Auth finto: i token sono gia' "verificati" ---------- */
function creaAuth() {
    const utenti = new Map();      // uid -> { uid, email, emailVerified, disabled, customClaims, password }
    const token = new Map();       // stringa -> contenuto del token
    const revocati = new Set();
    let n = 0;
    const auth = {
        verifyIdToken: async (t, controllaRevoca) => {
            const c = token.get(t);
            if (!c) { const e = new Error('token sbagliato'); e.code = 'auth/argument-error'; throw e; }
            if (controllaRevoca && revocati.has(c.uid)) { const e = new Error('revocato'); e.code = 'auth/id-token-revoked'; throw e; }
            return Object.assign({}, c);
        },
        getUserByEmail: async email => {
            const u = Array.from(utenti.values()).find(x => x.email === email);
            if (!u) { const e = new Error('nessuno'); e.code = 'auth/user-not-found'; throw e; }
            return Object.assign({}, u);
        },
        createUser: async o => {
            const uid = o.uid || 'auth' + (++n);
            const u = { uid: uid, email: o.email, emailVerified: !!o.emailVerified, disabled: false, customClaims: null, password: o.password };
            utenti.set(uid, u);
            return Object.assign({}, u);
        },
        updateUser: async (uid, o) => { Object.assign(utenti.get(uid), o); return Object.assign({}, utenti.get(uid)); },
        setCustomUserClaims: async (uid, c) => { utenti.get(uid).customClaims = c; },
        revokeRefreshTokens: async uid => { revocati.add(uid); },
        generatePasswordResetLink: async email => 'https://ngb-eventi.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=CODICE-' + encodeURIComponent(email) + '&apiKey=x'
    };
    return { auth, utenti, token, revocati };
}

/* ---------- il servizio vero, con Firebase e la posta finti ---------- */
let ctx = null;
const posta = [];
const veroRequire = Module.prototype.require;
Module.prototype.require = function (nome) {
    if (/diretta-firebase$/.test(nome)) return { contesto: () => ctx };
    if (/diretta-invio$/.test(nome)) {
        return {
            inviaReimpostazione: async (c, o) => { posta.push(Object.assign({}, o)); return { ok: true }; }
        };
    }
    return veroRequire.apply(this, arguments);
};
process.env.DIRETTA_ADMIN_EMAILS = 'regia@revilaw.it';
const RADICE = path.join(__dirname, '..');
const Q = require(path.join(RADICE, 'lib/diretta-domande.js'));
const A = require(path.join(RADICE, 'lib/diretta-accesso.js'));
const PORTA = require(path.join(RADICE, 'api/diretta-domande.js'));
const GESTIONE = require(path.join(RADICE, 'api/diretta-gestione.js'));

function nuovoMondo() {
    const f = creaDb();
    const a = creaAuth();
    const m = { ora: Date.UTC(2026, 11, 10, 14, 30), db: f.db, docs: f.docs, scritture: f.scritture, auth: a };
    ctx = {
        db: f.db, auth: a.auth, adesso: () => m.ora,
        Timestamp: { fromMillis: ms => new Ts(ms) },
        FieldValue: { increment: INC },
        emulatore: false
    };
    return m;
}
const WEB = 'webinar-2026-12-10';
const ALTRO = 'milano-2027-02-26';
function evento(m, id, stato) {
    m.docs.set('eventi/' + id, { titolo: 'Webinar 10 dicembre', data: '2026-12-10', oraInizio: '15:00', oraFine: '17:00', inizio: new Ts(Date.UTC(2026, 11, 10, 14)), fine: new Ts(Date.UTC(2026, 11, 10, 16)), stato: stato || 'in_onda', domande: true });
}
function partecipante(m, uid, p) {
    m.docs.set('partecipanti/' + uid, Object.assign({ nome: 'Mario', cognome: 'Rossi', azienda: 'Rossi Srl', email: uid + '@esempio.it', emailNorm: uid + '@esempio.it', stato: 'attivo', eventi: [WEB] }, p || {}));
    m.docs.set('sessioni/' + uid, { stato: 'attivo' });
    m.auth.token.set('tok-' + uid, { uid: uid, email: 'u-' + uid + '@utenti.diretta.invalid', firebase: { sign_in_provider: 'custom' }, eventi: [WEB] });
}
function relatoreTok(m, uid, email, extra) {
    m.auth.token.set('tok-' + uid, Object.assign({ uid: uid, email: email, email_verified: true, relatore: true, firebase: { sign_in_provider: 'password' } }, extra || {}));
}

/* La porta, chiamata come Vercel: restituisce { stato, corpo } */
async function chiama(handler, corpo, token, metodo) {
    const req = { method: metodo || 'POST', headers: { origin: 'https://nextgenerationbusiness.it' }, body: corpo };
    if (token) req.headers.authorization = 'Bearer ' + token;
    let stato = 200, out = null;
    const res = {
        setHeader() { return res; },
        status(s) { stato = s; return res; },
        json(o) { out = o; return res; },
        end() { return res; }
    };
    await handler(req, res);
    return { stato: stato, corpo: out || {} };
}
const domande = (corpo, token) => chiama(PORTA, corpo, token);
const gestione = (corpo) => chiama(GESTIONE, corpo, 'tok-regia');

(async () => {
    /* ======================== IL PARTECIPANTE ======================== */
    {
        const m = nuovoMondo();
        evento(m, WEB, 'in_onda');
        partecipante(m, 'p1', { nome: 'Lia', cognome: 'Libera', azienda: 'Delta Servizi' });
        partecipante(m, 'p2', { nome: 'Ugo', cognome: 'Uno', azienda: 'Epsilon' });

        let r = await domande({ azione: 'invia', idEvento: WEB, testo: '  Come  incide\tla revisione\u0007 sul rating?\n\n\n\nGrazie  ' }, 'tok-p1');
        vero(r.stato === 200 && r.corpo.ok && r.corpo.domanda && r.corpo.domanda.testo === 'Come incide la revisione sul rating?\n\nGrazie' && r.corpo.aperte === true,
            'il partecipante manda una domanda: testo ripulito (spazi, tabulazioni, caratteri di controllo, righe vuote)', JSON.stringify(r.corpo));
        const id1 = r.corpo.domanda && r.corpo.domanda.id;
        const salvata = m.docs.get('domande/' + id1) || {};
        vero(salvata.idEvento === WEB && salvata.uid === 'p1' && salvata.nome === 'Lia' && salvata.cognome === 'Libera' && salvata.azienda === 'Delta Servizi'
            && salvata.email === 'p1@esempio.it' && salvata.risposta === false && salvata.quando instanceof Ts,
            'nome, cognome, azienda ed email si copiano dal profilo; nasce senza risposta', JSON.stringify(salvata));
        vero(Object.keys(r.corpo.domanda).sort().join(',') === 'id,quando,risposta,testo', 'a chi scrive torna solo la sua domanda (id, testo, quando, risposta)', Object.keys(r.corpo.domanda).join(','));

        r = await domande({ azione: 'invia', idEvento: WEB, testo: 'Un\'altra subito dopo' }, 'tok-p1');
        vero(r.stato === 429 && r.corpo.codice === 'attendi' && r.corpo.attesaSecondi === 8, 'una seconda domanda dopo un secondo: 429 attendi', JSON.stringify(r.corpo));
        m.ora += 9000;
        r = await domande({ azione: 'invia', idEvento: WEB, testo: 'Un\'altra, con calma' }, 'tok-p1');
        vero(r.stato === 200, 'dopo 9 secondi passa');

        for (const [testo, perche] of [['  a ', 'troppo corta'], ['x'.repeat(601), 'troppo lunga'], [Array(17).fill('riga').join('\n'), 'troppe righe'], [null, 'vuota']]) {
            m.ora += 9000;
            r = await domande({ azione: 'invia', idEvento: WEB, testo: testo }, 'tok-p2');
            vero(r.stato === 400 && r.corpo.codice === 'testo', 'domanda ' + perche + ': 400 testo', JSON.stringify(r.corpo));
        }
        vero(Array.from(m.docs.keys()).filter(k => k.indexOf('domande/') === 0).length === 2, 'le domande rifiutate non si salvano');

        m.ora += 9000;
        r = await domande({ azione: 'invia', idEvento: ALTRO, testo: 'Domanda per Milano' }, 'tok-p2');
        vero(r.stato === 403 && r.corpo.codice === 'non-iscritto', 'un evento a cui non e\' iscritto: 403 non-iscritto');
        m.docs.get('sessioni/p2').sessioneAttiva = 'telefono';
        r = await domande({ azione: 'invia', idEvento: WEB, testo: 'Dal computer', sessione: 'computer' }, 'tok-p2');
        vero(r.stato === 403 && r.corpo.codice === 'altro-dispositivo', 'da un dispositivo diverso da quello ammesso: 403 altro-dispositivo');
        r = await domande({ azione: 'invia', idEvento: WEB, testo: 'Dal telefono', sessione: 'telefono' }, 'tok-p2');
        vero(r.stato === 200, 'dal dispositivo ammesso passa');
        m.docs.get('partecipanti/p2').stato = 'disattivato';
        m.ora += 9000;
        r = await domande({ azione: 'invia', idEvento: WEB, testo: 'Ancora io', sessione: 'telefono' }, 'tok-p2');
        vero(r.stato === 403 && r.corpo.codice === 'disattivato', 'account disattivato: 403');
        m.docs.get('partecipanti/p2').stato = 'attivo';

        for (const [stato, ok] of [['programmato', true], ['pausa', true], ['terminato', false]]) {
            m.docs.get('eventi/' + WEB).stato = stato;
            m.ora += 9000;
            r = await domande({ azione: 'invia', idEvento: WEB, testo: 'Domanda con l\'evento ' + stato, sessione: 'telefono' }, 'tok-p2');
            vero(ok ? r.stato === 200 : (r.stato === 409 && r.corpo.codice === 'domande-chiuse'), 'con l\'evento «' + stato + '»: ' + (ok ? 'si manda' : '409 domande-chiuse'), JSON.stringify(r.corpo));
        }
        m.docs.get('eventi/' + WEB).stato = 'in_onda';
        m.docs.get('eventi/' + WEB).domande = false;
        m.ora += 9000;
        r = await domande({ azione: 'invia', idEvento: WEB, testo: 'Con le domande spente', sessione: 'telefono' }, 'tok-p2');
        vero(r.stato === 409 && r.corpo.codice === 'domande-spente', 'con «Domande al relatore» spento: 409 domande-spente', JSON.stringify(r.corpo));
        r = await domande({ azione: 'mie', idEvento: WEB }, 'tok-p1');
        vero(r.stato === 200 && r.corpo.attive === false && r.corpo.aperte === false, '«mie» con le domande spente: attive e aperte false', JSON.stringify(r.corpo));
        m.docs.get('eventi/' + WEB).domande = true;
        m.docs.get('eventi/' + WEB).stato = 'terminato';
        r = await domande({ azione: 'mie', idEvento: WEB }, 'tok-p1');
        vero(r.stato === 200 && r.corpo.aperte === false && r.corpo.attive === true && r.corpo.domande.length === 2 && r.corpo.domande[0].id === id1
            && r.corpo.domande.every(d => Object.keys(d).sort().join(',') === 'id,quando,risposta,testo'),
            '«mie»: solo le sue domande di quell\'evento, dalla piu\' vecchia, e le domande chiuse dopo «Termina»', JSON.stringify(r.corpo));
        r = await domande({ azione: 'invia', idEvento: WEB, testo: 'Senza accesso' }, null);
        vero(r.stato === 401, 'senza token: 401');
        r = await domande({ azione: 'invia', idEvento: WEB, testo: 'Token inventato' }, 'tok-nessuno');
        vero(r.stato === 401 && r.corpo.codice === 'non-autenticato', 'token non valido: 401 non-autenticato');
    }

    /* ======================== IL RELATORE E LA REGIA ======================== */
    {
        const m = nuovoMondo();
        evento(m, WEB, 'in_onda');
        evento(m, ALTRO, 'programmato');
        partecipante(m, 'p1', { nome: 'Lia', cognome: 'Libera', azienda: 'Delta Servizi' });
        partecipante(m, 'p2', { nome: 'Ugo', cognome: 'Uno', azienda: 'Epsilon', eventi: [WEB, ALTRO] });
        partecipante(m, 'p3', { nome: 'Zeno', cognome: 'Spento', stato: 'disattivato' });
        relatoreTok(m, 'r1', 'relatore@studio.it');
        relatoreTok(m, 'r2', 'altro.relatore@studio.it');
        relatoreTok(m, 'finto', 'relatore@studio.it', { email_verified: false, relatore: undefined });
        relatoreTok(m, 'senza', 'relatore@studio.it', { relatore: undefined });
        m.auth.token.set('tok-regia', { uid: 'g1', email: 'regia@revilaw.it', email_verified: true, gestore: true, firebase: { sign_in_provider: 'password' } });

        // la regia scrive i relatori nella scheda Evento
        let g = await gestione({ azione: 'evento-salva', evento: { id: WEB, relatori: 'Relatore@Studio.it\nrelatore@studio.it, ; nonvalida' } });
        vero(g.stato === 400 && g.corpo.codice === 'relatori' && /nonvalida/.test(g.corpo.msg) && !m.docs.get('relatoriEventi/' + WEB),
            'un\'email non valida fra i relatori: 400 prima di toccare l\'evento', JSON.stringify(g.corpo));
        g = await gestione({ azione: 'evento-salva', evento: { id: WEB, domande: true, relatori: 'primo@studio.it' } });
        vero(g.stato === 200 && m.docs.get('eventi/' + WEB).domande === true && JSON.stringify(g.corpo.evento.relatori) === '["primo@studio.it"]'
            && g.corpo.evento.domande === true,
            '«evento-salva» accende «Domande al relatore» e salva i relatori insieme all\'evento', JSON.stringify(g.corpo).slice(0, 300));
        g = await gestione({ azione: 'evento-salva', evento: { id: WEB, titolo: 'Webinar 10 dicembre' } });
        vero(g.stato === 200 && m.docs.get('eventi/' + WEB).domande === true && JSON.stringify(g.corpo.evento.relatori) === '["primo@studio.it"]',
            'un salvataggio che non li tocca lascia com\'erano l\'interruttore e i relatori', JSON.stringify(g.corpo).slice(0, 300));
        g = await gestione({ azione: 'relatori-salva', idEvento: WEB, relatori: ' Relatore@Studio.it \n relatore@studio.it ; ' });
        vero(g.stato === 200 && JSON.stringify(g.corpo.relatori) === '["relatore@studio.it"]' && m.docs.get('relatoriEventi/' + WEB).da === 'regia@revilaw.it',
            'relatori: email ripulite, senza doppie, con chi le ha scritte', JSON.stringify(g.corpo));
        g = await gestione({ azione: 'relatori-salva', idEvento: WEB, relatori: Array.from({ length: 11 }, (x, i) => 'r' + i + '@studio.it') });
        vero(g.stato === 400 && g.corpo.codice === 'relatori', 'piu\' di 10 relatori: 400');
        g = await gestione({ azione: 'relatori-salva', idEvento: 'evento-che-non-ce', relatori: ['a@b.it'] });
        vero(g.stato === 404, 'relatori di un evento inesistente: 404');
        g = await gestione({ azione: 'relatori-salva', idEvento: ALTRO, relatori: ['altro.relatore@studio.it'] });
        g = await gestione({ azione: 'eventi' });
        const evWeb = (g.corpo.eventi || []).find(e => e.id === WEB) || {};
        vero(g.stato === 200 && JSON.stringify(evWeb.relatori) === '["relatore@studio.it"]', '«eventi» della gestione porta i relatori di ogni evento', JSON.stringify(evWeb.relatori));

        // le domande
        m.ora += 1000; await domande({ azione: 'invia', idEvento: WEB, testo: 'Prima domanda di Lia' }, 'tok-p1');
        m.ora += 1000; await domande({ azione: 'invia', idEvento: WEB, testo: 'La domanda di Ugo' }, 'tok-p2');
        m.ora += 9000; await domande({ azione: 'invia', idEvento: ALTRO, testo: 'Ugo, ma per Milano' }, 'tok-p2');
        m.ora += 1000; await domande({ azione: 'invia', idEvento: WEB, testo: 'Seconda domanda di Lia' }, 'tok-p1');

        let r = await domande({ azione: 'elenco', idEvento: WEB }, 'tok-r1');
        const testi = (r.corpo.domande || []).map(d => d.testo);
        vero(r.stato === 200 && testi.join('|') === 'Prima domanda di Lia|La domanda di Ugo|Seconda domanda di Lia' && r.corpo.conteggi.totale === 3 && r.corpo.conteggi.risposte === 0
            && r.corpo.evento.titolo === 'Webinar 10 dicembre' && r.corpo.evento.stato === 'in_onda',
            'il relatore vede tutte le domande del suo evento, dalla piu\' vecchia', JSON.stringify(r.corpo).slice(0, 400));
        const d0 = (r.corpo.domande || [])[0] || {};
        vero(d0.nome === 'Lia' && d0.cognome === 'Libera' && d0.azienda === 'Delta Servizi' && !('email' in d0) && !('rispostaDa' in d0) && !('uid' in d0),
            'al relatore nome, cognome e azienda; niente email, niente uid', JSON.stringify(d0));
        r = await domande({ azione: 'elenco', idEvento: ALTRO }, 'tok-r1');
        vero(r.stato === 403 && r.corpo.codice === 'non-relatore', 'il relatore non vede le domande di un evento non suo: 403');
        for (const [tok, perche] of [['tok-finto', 'email non verificata (registrato da solo)'], ['tok-senza', 'senza il claim relatore'], ['tok-p1', 'il token di un partecipante']]) {
            r = await domande({ azione: 'elenco', idEvento: WEB }, tok);
            vero(r.stato === 403 && r.corpo.codice === 'non-relatore', perche + ': 403', JSON.stringify(r.corpo));
        }
        r = await domande({ azione: 'eventi' }, 'tok-r1');
        vero(r.stato === 200 && r.corpo.ruolo === 'relatore' && (r.corpo.eventi || []).map(e => e.id).join(',') === WEB, '«eventi» del relatore: solo i suoi', JSON.stringify(r.corpo));
        r = await domande({ azione: 'eventi' }, 'tok-regia');
        vero(r.stato === 200 && r.corpo.ruolo === 'gestore' && (r.corpo.eventi || []).length === 2, '«eventi» di un gestore: tutti', JSON.stringify(r.corpo));

        // la regia vede di piu', e segna
        g = await gestione({ azione: 'domande', idEvento: WEB });
        const dg = (g.corpo.domande || [])[1] || {};
        vero(g.stato === 200 && g.corpo.domande.length === 3 && dg.email === 'p2@esempio.it', 'la regia vede le stesse domande, con l\'email di chi le ha scritte', JSON.stringify(dg));
        r = await domande({ azione: 'segna', idEvento: WEB, idDomanda: d0.id, risposta: true }, 'tok-r1');
        vero(r.stato === 200 && r.corpo.domanda.risposta === true && r.corpo.domanda.rispostaQuando === m.ora && m.docs.get('domande/' + d0.id).rispostaDa === 'relatore@studio.it',
            '«Risposta data» dal relatore: con chi e quando', JSON.stringify(r.corpo));
        const prima = m.scritture.length;
        r = await domande({ azione: 'segna', idEvento: WEB, idDomanda: d0.id, risposta: true }, 'tok-r1');
        vero(r.stato === 200 && m.scritture.length === prima, 'ripetere «Risposta data» non riscrive la domanda');
        g = await gestione({ azione: 'domande', idEvento: WEB });
        vero(g.corpo.conteggi.risposte === 1 && g.corpo.domande[0].rispostaDa === 'relatore@studio.it', 'la regia vede il segno del relatore e chi l\'ha messo');
        g = await gestione({ azione: 'domanda-segna', idEvento: WEB, idDomanda: d0.id, risposta: false });
        vero(g.stato === 200 && g.corpo.domanda.risposta === false && g.corpo.domanda.rispostaQuando === null && m.docs.get('domande/' + d0.id).rispostaDa === '',
            'la regia toglie il segno', JSON.stringify(g.corpo));
        g = await gestione({ azione: 'domanda-segna', idEvento: WEB, idDomanda: dg.id, risposta: true });
        r = await domande({ azione: 'mie', idEvento: WEB }, 'tok-p2');
        vero(r.corpo.domande.length === 1 && r.corpo.domande[0].risposta === true, 'chi ha scritto vede che la sua domanda ha avuto risposta', JSON.stringify(r.corpo));
        const milano = Array.from(m.docs.keys()).find(k => k.indexOf('domande/') === 0 && m.docs.get(k).idEvento === ALTRO).split('/')[1];
        for (const [corpo, stato, perche] of [
            [{ idDomanda: milano, risposta: true }, 404, 'una domanda di un altro evento'],
            [{ idDomanda: 'non/valida', risposta: true }, 400, 'un identificativo sbagliato'],
            [{ idDomanda: d0.id, risposta: 'si' }, 400, 'un valore che non e\' vero o falso']
        ]) {
            r = await domande(Object.assign({ azione: 'segna', idEvento: WEB }, corpo), 'tok-r1');
            vero(r.stato === stato, perche + ': ' + stato, JSON.stringify(r.corpo));
        }

        // i partecipanti per il relatore
        m.docs.set('presenze/' + WEB + '_p1', { uid: 'p1', idEvento: WEB, ultimo: new Ts(m.ora - 60 * 1000) });
        m.docs.set('presenze/' + WEB + '_p2', { uid: 'p2', idEvento: WEB, ultimo: new Ts(m.ora - 10 * 60 * 1000) });
        r = await domande({ azione: 'partecipanti', idEvento: WEB }, 'tok-r1');
        const nomi = (r.corpo.partecipanti || []).map(p => p.cognome + (p.collegato ? '*' : ''));
        vero(r.stato === 200 && nomi.join(',') === 'Libera*,Uno' && r.corpo.conteggi.iscritti === 2 && r.corpo.conteggi.collegati === 1
            && r.corpo.partecipanti.every(p => !('email' in p)),
            'partecipanti: solo gli attivi, chi e\' collegato (ultimi 150 s), i conteggi, niente email', JSON.stringify(r.corpo));
        g = await gestione({ azione: 'domande', idEvento: WEB });
        r = await domande({ azione: 'partecipanti', idEvento: WEB }, 'tok-regia');
        vero(r.corpo.partecipanti[0].email === 'p1@esempio.it', 'alla regia anche l\'email dei partecipanti');

        // tolto dai relatori: la porta si chiude subito
        await gestione({ azione: 'relatori-salva', idEvento: WEB, relatori: [] });
        r = await domande({ azione: 'elenco', idEvento: WEB }, 'tok-r1');
        vero(r.stato === 403, 'tolto dai relatori dell\'evento: 403 da subito, anche con il token di prima');
    }

    /* ======================== IL PRIMO ACCESSO DEL RELATORE ======================== */
    {
        const m = nuovoMondo();
        evento(m, WEB, 'programmato');
        m.docs.set('relatoriEventi/' + WEB, { email: ['relatore@studio.it', 'regia@revilaw.it'] });
        const t0 = Date.now();
        const r1 = await A.relatoreAccesso(ctx, { email: 'nessuno@studio.it', ip: '93.1.1.1' });
        const d1 = Date.now() - t0;
        vero(r1.msg === A.MSG_RELATORE && posta.length === 0 && m.auth.utenti.size === 0, 'un indirizzo che non e\' fra i relatori: stessa risposta, nessuna email, nessun account');
        const t1 = Date.now();
        const r2 = await A.relatoreAccesso(ctx, { email: '  Relatore@Studio.it ', ip: '93.1.1.1' });
        const d2 = Date.now() - t1;
        vero(r2.msg === r1.msg && d1 >= 2400 && d2 >= 2400 && Math.abs(d1 - d2) < 700, 'stessa risposta e stesso tempo, iscritto o no (' + d1 + ' e ' + d2 + ' ms)');
        const u = Array.from(m.auth.utenti.values()).find(x => x.email === 'relatore@studio.it') || {};
        vero(u.emailVerified === true && JSON.stringify(u.customClaims) === '{"relatore":true}' && posta.length === 1 && posta[0].perRelatore === true
            && /\/diretta\/reimposta\.html\?oobCode=.*&per=relatore$/.test(posta[0].link) && posta[0].a === 'relatore@studio.it',
            'l\'account del relatore: la sua email, verificata, con il claim; il collegamento porta alla pagina del relatore', JSON.stringify({ u, posta }));
        vero(!!m.docs.get('relatoriAccount/' + u.uid), 'l\'account resta nell\'elenco degli account dei relatori');

        // chi si era registrato da solo con l'email di un relatore perde l'accesso
        const m2 = nuovoMondo();
        m2.docs.set('relatoriEventi/' + WEB, { email: ['relatore@studio.it'] });
        const ladro = await m2.auth.auth.createUser({ email: 'relatore@studio.it', emailVerified: false, password: 'scelta-dal-ladro' });
        await A.relatoreAccesso(ctx, { email: 'relatore@studio.it', ip: '93.1.1.2' });
        const dopo = m2.auth.utenti.get(ladro.uid);
        vero(dopo.password !== 'scelta-dal-ladro' && dopo.emailVerified === true && m2.auth.revocati.has(ladro.uid) && dopo.customClaims.relatore === true,
            'chi si era registrato da solo: password cambiata, sessioni chiuse, il collegamento va al vero titolare');

        // un gestore che e' anche relatore resta gestore e tiene la sua password
        const m3 = nuovoMondo();
        m3.docs.set('relatoriEventi/' + WEB, { email: ['regia@revilaw.it'] });
        const reg = await m3.auth.auth.createUser({ email: 'regia@revilaw.it', emailVerified: true, password: 'quella-del-gestore' });
        await m3.auth.auth.setCustomUserClaims(reg.uid, { gestore: true });
        await A.relatoreAccesso(ctx, { email: 'regia@revilaw.it', ip: '93.1.1.3' });
        const gg = m3.auth.utenti.get(reg.uid);
        vero(gg.password === 'quella-del-gestore' && !m3.auth.revocati.has(reg.uid) && gg.customClaims.gestore === true && gg.customClaims.relatore === true,
            'un gestore che e\' anche relatore: resta gestore, tiene la password, prende il claim', JSON.stringify(gg));
    }

    /* ======================== LA PORTA ======================== */
    {
        nuovoMondo();
        let r = await chiama(PORTA, {}, null, 'OPTIONS');
        vero(r.stato === 204, 'OPTIONS: 204');
        r = await chiama(PORTA, {}, null, 'GET');
        vero(r.stato === 405, 'GET: 405');
        r = await domande({ azione: 'cancella-tutto' }, 'tok-x');
        vero(r.stato === 400 && r.corpo.codice === 'azione', 'azione sconosciuta: 400');
        r = await domande({ azione: 'elenco', idEvento: 'Non Valido!' }, 'tok-x');
        vero(r.stato === 400 && r.corpo.codice === 'evento', 'evento non valido: 400 prima di guardare il token');
    }

    console.log('\n' + verdi + ' verdi, ' + rossi + ' rossi');
    process.exit(rossi ? 1 : 0);
})().catch(e => { console.error('Prove non eseguite:', e); process.exit(1); });
