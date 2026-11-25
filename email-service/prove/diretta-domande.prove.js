/* ============================================================
   PROVE - le domande al relatore (lib/diretta-domande.js,
   api/diretta-domande.js, le azioni della regia in
   api/diretta-gestione.js)
   ------------------------------------------------------------
       node prove/diretta-domande.prove.js

   Niente da installare, niente emulatori, niente rete: Firestore e
   Firebase Auth sono finti e stanno qui dentro (filtri ==,
   array-contains e >=, transazioni, conteggi), i token sono oggetti
   gia' "verificati". Esce con 1 se qualcosa e' rosso. Dura un attimo.

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
   - IL RELATORE e' un partecipante dell'evento segnato dalla regia
     (scheda Partecipanti, 'relatore-segna'; anche piu' d'uno, al
     massimo 10; solo chi e' iscritto all'evento), con il token della
     diretta. Vede tutte le domande del SUO evento, dalla piu' vecchia,
     con nome, cognome e azienda ma senza email; un altro evento, un
     partecipante non segnato, un account con email e password che non
     e' un gestore vero -> 403; account disattivato, tolto dall'evento o
     segno tolto -> 403 da subito. «mie» dice alla pagina della diretta
     se chi chiama e' relatore. La regia (gestore) vede tutto, anche le
     email e chi ha segnato la risposta.
   - «Risposta data»: si segna e si toglie, con chi e quando; ripeterla
     non riscrive; una domanda di un altro evento -> 404; identificativo
     o valore sbagliati -> 400. Il partecipante vede il segno sulle sue.
   - I PARTECIPANTI per il relatore: solo gli attivi, chi e' collegato
     (segnale negli ultimi 150 secondi), chi e' relatore, i conteggi;
     l'email solo alla regia.
   - 'eventi' e 'evento-salva' della gestione portano i relatori con
     l'evento; «eventi» del relatore: solo i suoi, del gestore tutti.
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
const veroRequire = Module.prototype.require;
Module.prototype.require = function (nome) {
    if (/diretta-firebase$/.test(nome)) return { contesto: () => ctx };
    return veroRequire.apply(this, arguments);
};
process.env.DIRETTA_ADMIN_EMAILS = 'regia@revilaw.it';
const RADICE = path.join(__dirname, '..');
const Q = require(path.join(RADICE, 'lib/diretta-domande.js'));
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
        // i relatori sono partecipanti anche loro, con le credenziali di tutti
        partecipante(m, 'r1', { nome: 'Rita', cognome: 'Relatrice', azienda: 'Studio Relatori' });
        partecipante(m, 'r2', { nome: 'Remo', cognome: 'Secondo', azienda: 'Altro Studio', eventi: [WEB, ALTRO] });
        m.auth.token.set('tok-regia', { uid: 'g1', email: 'regia@revilaw.it', email_verified: true, gestore: true, firebase: { sign_in_provider: 'password' } });
        m.auth.token.set('tok-finto-gestore', { uid: 'x1', email: 'regia@revilaw.it', email_verified: false, gestore: true, firebase: { sign_in_provider: 'password' } });
        m.auth.token.set('tok-estraneo', { uid: 'x2', email: 'chiunque@studio.it', email_verified: true, firebase: { sign_in_provider: 'password' } });

        // la regia segna i relatori dalla scheda Partecipanti
        let g = await gestione({ azione: 'relatore-segna', idEvento: WEB, uid: 'r1', relatore: true });
        vero(g.stato === 200 && JSON.stringify(g.corpo.relatori) === '["r1"]' && m.docs.get('relatoriEventi/' + WEB).da === 'regia@revilaw.it',
            'la regia segna un partecipante come relatore, con chi l\'ha segnato', JSON.stringify(g.corpo));
        vero(JSON.stringify(m.docs.get('partecipanti/r1').relatoreDi) === JSON.stringify([WEB]),
            'il segno sta anche nel profilo della persona (relatoreDi): la diretta la porta subito alla sua pagina', JSON.stringify(m.docs.get('partecipanti/r1')));
        g = await gestione({ azione: 'relatore-segna', idEvento: WEB, uid: 'r2', relatore: true });
        vero(g.stato === 200 && JSON.stringify(g.corpo.relatori) === '["r1","r2"]', 'i relatori possono essere più d\'uno', JSON.stringify(g.corpo));
        const primaR = m.scritture.length;
        g = await gestione({ azione: 'relatore-segna', idEvento: WEB, uid: 'r1', relatore: true });
        vero(g.stato === 200 && m.scritture.length === primaR && JSON.stringify(g.corpo.relatori) === '["r1","r2"]', 'segnarlo di nuovo non cambia niente');
        for (const [corpo, stato, codice, perche] of [
            [{ idEvento: ALTRO, uid: 'p1', relatore: true }, 404, 'partecipante', 'chi non è iscritto all\'evento non si segna'],
            [{ idEvento: 'evento-che-non-ce', uid: 'r1', relatore: true }, 404, 'evento', 'un evento inesistente'],
            [{ idEvento: WEB, uid: 'non/valido', relatore: true }, 400, 'uid', 'un identificativo sbagliato'],
            [{ idEvento: WEB, uid: 'r1', relatore: 'si' }, 400, 'relatore', 'un valore che non è vero o falso']
        ]) {
            g = await gestione(Object.assign({ azione: 'relatore-segna' }, corpo));
            vero(g.stato === stato && g.corpo.codice === codice, perche + ': ' + stato + ' ' + codice, JSON.stringify(g.corpo));
        }
        g = await gestione({ azione: 'relatore-segna', idEvento: ALTRO, uid: 'r2', relatore: true });
        g = await gestione({ azione: 'eventi' });
        const evWeb = (g.corpo.eventi || []).find(e => e.id === WEB) || {};
        vero(g.stato === 200 && JSON.stringify(evWeb.relatori) === '["r1","r2"]', '«eventi» della gestione porta i relatori di ogni evento', JSON.stringify(evWeb.relatori));
        g = await gestione({ azione: 'evento-salva', evento: { id: WEB, domande: true } });
        vero(g.stato === 200 && g.corpo.evento.domande === true && JSON.stringify(g.corpo.evento.relatori) === '["r1","r2"]',
            '«evento-salva» accende «Domande al relatore» e rimanda i relatori', JSON.stringify(g.corpo).slice(0, 300));

        // le domande
        m.ora += 1000; await domande({ azione: 'invia', idEvento: WEB, testo: 'Prima domanda di Lia' }, 'tok-p1');
        m.ora += 1000; await domande({ azione: 'invia', idEvento: WEB, testo: 'La domanda di Ugo' }, 'tok-p2');
        m.ora += 9000; await domande({ azione: 'invia', idEvento: ALTRO, testo: 'Ugo, ma per Milano' }, 'tok-p2');
        m.ora += 1000; await domande({ azione: 'invia', idEvento: WEB, testo: 'Seconda domanda di Lia' }, 'tok-p1');

        let r = await domande({ azione: 'elenco', idEvento: WEB }, 'tok-r1');
        const testi = (r.corpo.domande || []).map(d => d.testo);
        vero(r.stato === 200 && testi.join('|') === 'Prima domanda di Lia|La domanda di Ugo|Seconda domanda di Lia' && r.corpo.conteggi.totale === 3 && r.corpo.conteggi.risposte === 0
            && r.corpo.evento.titolo === 'Webinar 10 dicembre' && r.corpo.evento.stato === 'in_onda',
            'il relatore (un partecipante segnato) vede tutte le domande del suo evento, dalla piu\' vecchia', JSON.stringify(r.corpo).slice(0, 400));
        const d0 = (r.corpo.domande || [])[0] || {};
        vero(d0.nome === 'Lia' && d0.cognome === 'Libera' && d0.azienda === 'Delta Servizi' && !('email' in d0) && !('rispostaDa' in d0) && !('uid' in d0),
            'al relatore nome, cognome e azienda; niente email, niente uid', JSON.stringify(d0));
        r = await domande({ azione: 'elenco', idEvento: ALTRO }, 'tok-r1');
        vero(r.stato === 403 && r.corpo.codice === 'non-relatore', 'il relatore non vede le domande di un evento non suo: 403');
        r = await domande({ azione: 'elenco', idEvento: ALTRO }, 'tok-r2');
        vero(r.stato === 200 && r.corpo.domande.length === 1, 'chi è relatore di due eventi vede le domande di tutti e due');
        for (const [tok, perche] of [['tok-p1', 'un partecipante non segnato'], ['tok-finto-gestore', 'un gestore con l\'email non verificata'], ['tok-estraneo', 'un account qualsiasi con email e password']]) {
            r = await domande({ azione: 'elenco', idEvento: WEB }, tok);
            vero(r.stato === 403 && r.corpo.codice === 'non-relatore', perche + ': 403', JSON.stringify(r.corpo));
        }
        r = await domande({ azione: 'eventi' }, 'tok-r1');
        vero(r.stato === 200 && r.corpo.ruolo === 'relatore' && r.corpo.email === 'r1@esempio.it' && (r.corpo.eventi || []).map(e => e.id).join(',') === WEB,
            '«eventi» del relatore: solo i suoi, con la sua email', JSON.stringify(r.corpo));
        r = await domande({ azione: 'eventi' }, 'tok-r2');
        vero(r.stato === 200 && (r.corpo.eventi || []).map(e => e.id).sort().join(',') === [ALTRO, WEB].sort().join(','), '«eventi» di chi è relatore di due eventi: tutti e due');
        r = await domande({ azione: 'eventi' }, 'tok-p1');
        vero(r.stato === 200 && r.corpo.eventi.length === 0, '«eventi» di un partecipante non segnato: nessuno (la pagina lo dice)');
        r = await domande({ azione: 'eventi' }, 'tok-regia');
        vero(r.stato === 200 && r.corpo.ruolo === 'gestore' && (r.corpo.eventi || []).length === 2, '«eventi» di un gestore: tutti', JSON.stringify(r.corpo));
        r = await domande({ azione: 'mie', idEvento: WEB }, 'tok-r1');
        const mieP = await domande({ azione: 'mie', idEvento: WEB }, 'tok-p1');
        vero(r.stato === 200 && r.corpo.relatore === true && mieP.corpo.relatore === false, '«mie» dice alla pagina della diretta chi è relatore (per la strada verso la sua pagina)');

        // la regia vede di piu', e segna
        g = await gestione({ azione: 'domande', idEvento: WEB });
        const dg = (g.corpo.domande || [])[1] || {};
        vero(g.stato === 200 && g.corpo.domande.length === 3 && dg.email === 'p2@esempio.it', 'la regia vede le stesse domande, con l\'email di chi le ha scritte', JSON.stringify(dg));
        r = await domande({ azione: 'segna', idEvento: WEB, idDomanda: d0.id, risposta: true }, 'tok-r1');
        vero(r.stato === 200 && r.corpo.domanda.risposta === true && r.corpo.domanda.rispostaQuando === m.ora && m.docs.get('domande/' + d0.id).rispostaDa === 'r1@esempio.it',
            '«Risposta data» dal relatore: con chi e quando', JSON.stringify(r.corpo));
        const prima = m.scritture.length;
        r = await domande({ azione: 'segna', idEvento: WEB, idDomanda: d0.id, risposta: true }, 'tok-r1');
        vero(r.stato === 200 && m.scritture.length === prima, 'ripetere «Risposta data» non riscrive la domanda');
        g = await gestione({ azione: 'domande', idEvento: WEB });
        vero(g.corpo.conteggi.risposte === 1 && g.corpo.domande[0].rispostaDa === 'r1@esempio.it', 'la regia vede il segno del relatore e chi l\'ha messo');
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
        const nomi = (r.corpo.partecipanti || []).map(p => p.cognome + (p.collegato ? '*' : '') + (p.relatore ? '(R)' : ''));
        vero(r.stato === 200 && nomi.join(',') === 'Libera*,Relatrice(R),Secondo(R),Uno' && r.corpo.conteggi.iscritti === 4 && r.corpo.conteggi.collegati === 1
            && r.corpo.partecipanti.every(p => !('email' in p)),
            'partecipanti: solo gli attivi, chi e\' collegato (ultimi 150 s), chi e\' relatore, i conteggi, niente email', JSON.stringify(r.corpo));
        r = await domande({ azione: 'partecipanti', idEvento: WEB }, 'tok-regia');
        vero(r.corpo.partecipanti[0].email === 'p1@esempio.it', 'alla regia anche l\'email dei partecipanti');

        // la porta si chiude subito: account disattivato, tolto dall'evento, segno tolto
        m.docs.get('partecipanti/r2').stato = 'disattivato';
        r = await domande({ azione: 'elenco', idEvento: WEB }, 'tok-r2');
        vero(r.stato === 403 && r.corpo.codice === 'disattivato', 'relatore con l\'account disattivato: 403 da subito');
        m.docs.get('partecipanti/r2').stato = 'attivo';
        m.docs.get('partecipanti/r2').eventi = [ALTRO];
        r = await domande({ azione: 'elenco', idEvento: WEB }, 'tok-r2');
        vero(r.stato === 403 && r.corpo.codice === 'non-relatore', 'relatore tolto dall\'evento: 403 da subito, anche se il segno è rimasto');
        await gestione({ azione: 'relatore-segna', idEvento: WEB, uid: 'r1', relatore: false });
        r = await domande({ azione: 'elenco', idEvento: WEB }, 'tok-r1');
        vero(r.stato === 403 && JSON.stringify(m.docs.get('relatoriEventi/' + WEB).uid) === '["r2"]', 'segno tolto: 403 da subito, anche con il token di prima');
        vero(JSON.stringify(m.docs.get('partecipanti/r1').relatoreDi) === '[]', 'e il profilo non lo dice più (la diretta non lo porta più alla pagina del relatore)');

        // un relatore segnato quando il profilo non lo diceva ancora: si rimette in pari
        m.docs.set('relatoriEventi/' + WEB, { uid: ['r1'] });
        delete m.docs.get('partecipanti/r1').relatoreDi;
        r = await domande({ azione: 'mie', idEvento: WEB }, 'tok-r1');
        vero(r.corpo.relatore === true && JSON.stringify(m.docs.get('partecipanti/r1').relatoreDi) === JSON.stringify([WEB]), '«mie» rimette in pari il profilo di chi è relatore');
        delete m.docs.get('partecipanti/r1').relatoreDi;
        g = await gestione({ azione: 'relatore-segna', idEvento: WEB, uid: 'r1', relatore: true });
        vero(g.stato === 200 && JSON.stringify(m.docs.get('partecipanti/r1').relatoreDi) === JSON.stringify([WEB]), 'e anche «Segna come relatore» su chi lo è già');
    }

    /* ======================== AL MASSIMO 10 RELATORI ======================== */
    {
        const m = nuovoMondo();
        evento(m, WEB, 'in_onda');
        m.auth.token.set('tok-regia', { uid: 'g1', email: 'regia@revilaw.it', email_verified: true, gestore: true, firebase: { sign_in_provider: 'password' } });
        for (let i = 0; i < 11; i++) partecipante(m, 'q' + i, { nome: 'Q' + i, cognome: 'Tanti' });
        let g = null;
        for (let i = 0; i < 10; i++) g = await gestione({ azione: 'relatore-segna', idEvento: WEB, uid: 'q' + i, relatore: true });
        vero(g.stato === 200 && g.corpo.relatori.length === 10, 'dieci relatori si segnano');
        g = await gestione({ azione: 'relatore-segna', idEvento: WEB, uid: 'q10', relatore: true });
        vero(g.stato === 400 && g.corpo.codice === 'relatori' && m.docs.get('relatoriEventi/' + WEB).uid.length === 10, 'l\'undicesimo no: 400 relatori');
        g = await gestione({ azione: 'relatore-segna', idEvento: WEB, uid: 'q0', relatore: false });
        g = await gestione({ azione: 'relatore-segna', idEvento: WEB, uid: 'q10', relatore: true });
        vero(g.stato === 200 && g.corpo.relatori.length === 10 && g.corpo.relatori.indexOf('q10') >= 0 && g.corpo.relatori.indexOf('q0') < 0, 'tolto uno, se ne segna un altro');
    }

    /* ======================== L'EMAIL GIA' DI UN ALTRO ACCOUNT (aggiunta a mano) ======================== */
    {
        const m = nuovoMondo();
        evento(m, WEB, 'programmato');
        evento(m, ALTRO, 'programmato');
        m.auth.token.set('tok-regia', { uid: 'g1', email: 'regia@revilaw.it', email_verified: true, gestore: true, firebase: { sign_in_provider: 'password' } });
        // una prova fatta con l'email di un altro: l'account c'e', con un altro nome, iscritto a Milano
        partecipante(m, 'z1', { nome: 'Anna', cognome: 'Prova', email: 'mia.email@esempio.it', emailNorm: 'mia.email@esempio.it', eventi: [ALTRO] });
        m.docs.set('indirizzi/mia.email@esempio.it', { uid: 'z1' });
        const g = await gestione({ azione: 'partecipante-aggiungi', idEvento: WEB, nome: 'Andrea', cognome: 'Vero', email: 'mia.email@esempio.it' });
        vero(g.stato === 409 && g.corpo.codice === 'email-condivisa'
            && /^Con questa email è già registrato Anna Prova: se è la stessa persona, scrivi il nome come è registrato/.test(g.corpo.msg)
            && /Quell'account è iscritto a: «Webinar 10 dicembre»\./.test(g.corpo.msg) && /«Correggi» sulla sua riga/.test(g.corpo.msg),
            'email già di un altro account: il messaggio dice a quale evento è iscritto e come dargli il nome giusto', g.corpo.msg);
        m.docs.get('partecipanti/z1').eventi = [];
        const g2 = await gestione({ azione: 'partecipante-aggiungi', idEvento: WEB, nome: 'Andrea', cognome: 'Vero', email: 'mia.email@esempio.it' });
        vero(g2.stato === 409 && /Quell'account non è iscritto a nessun evento\./.test(g2.corpo.msg), '…anche quando non è iscritto a nessun evento', g2.corpo.msg);
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
