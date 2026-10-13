/* ============================================================
   PROVE - programmare un nuovo incontro, dopo il convegno
   ------------------------------------------------------------
       node prove/nuovo-incontro.prove.js

   Niente da installare: Firestore, il server di posta e l'orologio
   sono finti e stanno qui dentro (stessa impalcatura di
   azienda-b2b.prove.js). Si passa sempre dalle azioni vere: una
   prova che scrivesse a mano la richiesta proverebbe se stessa.

   COSA DIMOSTRANO. Ai tavoli del convegno mezz'ora a testa non
   basta per tutti: qualcuno non trova posto, qualcuno ha due
   impegni alla stessa ora, qualcuno segue online e un tavolo non
   ce l'ha. Finito il convegno si scrive a quelle persone, e da
   quella mail chiedono un incontro NUOVO: scelgono gli argomenti,
   senza orario, e dicono quando preferirebbero.

   Qui si verifica che:
     - il collegamento abbia una firma SUA, e che quella di
       un'altra pagina non apra questa (un token che apre
       /completa_iscrizione/ riscrive i nominativi dei
       partecipanti: non deve bastare a entrare qui, e viceversa);
     - la richiesta finisca dove chi organizza la guarda gia', in
       mezzo alle altre, distinta per quello che e';
     - gli argomenti siano quelli VERI dei tavoli, e che uno
       inventato dal browser non entri in archivio;
     - l'avviso allo staff arrivi ai tre indirizzi con TUTTA
       l'anagrafica, e che se la posta non parte la richiesta resti
       comunque registrata;
     - il richiamo non si mandi due volte alla stessa persona.
   ============================================================ */
'use strict';
const Module = require('module');
const path = require('path');

// ---------- orologio ----------
let orologio = Date.parse('2026-10-13T09:00:00Z');
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
let coda = Promise.resolve();
const db = {
    collection: collection,
    runTransaction: (fn) => {
        const mio = coda.then(async () => {
            const scritture = [];
            await fn({ get: (r) => r.get(), set: (r, p, o) => { scritture.push([r, p, o]); } });
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

// ---------- utilita' ----------
const EVENTO = 'napoli-2026-10-02';
function azzera() {
    dati.clear(); posta.length = 0; postaRotta = false;
    orologio = Date.parse('2026-10-13T09:00:00Z');
    dati.set('utenti/staff@revilaw.it', { ruolo: 'admin' });
    dati.set('b2bAgenda/' + EVENTO, {
        evento: EVENTO,
        eventoDati: { titolo: 'Napoli', quando: '2 ottobre 2026' },
        giornata: { inizio: '10:00', fine: '18:00', pranzoDa: '13:00', pranzoA: '14:00', durata: 30 },
        aree: { 'merito-creditizio': { attiva: true, referenti: [], chiusi: [], nota: '' } }
    });
}
/* Una persona che e' stata al convegno, con l'invito agli incontri addosso:
   e' da li' che il servizio capisce di quale giornata si parla. */
function mettiPersona(id, nome, cognome, extra) {
    dati.set('iscrizioni/' + id, Object.assign({
        pagina: 'Napoli 2 Ottobre 2026', data: '10/09/2026 11:00:00',
        nome: nome, cognome: cognome, email: id + '@esempio.it',
        azienda: 'Alfa S.r.l.', ruolo: 'Amministratore', telefono: '045 123456',
        b2bInvito: { quando: orologio - 100000, da: 'staff@revilaw.it', eventoId: EVENTO, aree: ['merito-creditizio'] }
    }, extra || {}));
}
function risposta() {
    const r = {
        _s: 0, _j: null,
        setHeader: () => r, status: (n) => { r._s = n; return r; },
        json: (o) => { r._j = o; return r; }, end: () => r
    };
    return r;
}
// la pagina /nuovo_incontro/, con il suo collegamento firmato
async function chiamaNuovo(id, corpo) {
    const res = risposta();
    await iscrizione({
        method: 'POST', headers: {},
        body: Object.assign({ d: id, t: NL.firmaNuovoIncontro(id) }, corpo)
    }, res);
    return Object.assign({ _stato: res._s }, res._j || {});
}
// la stessa pagina, con un token di un'altra pagina
async function chiamaConToken(id, token, corpo) {
    const res = risposta();
    await iscrizione({ method: 'POST', headers: {}, body: Object.assign({ d: id, t: token }, corpo) }, res);
    return Object.assign({ _stato: res._s }, res._j || {});
}
// l'area riservata, gia' autenticata
async function chiamaPresenze(corpo) {
    const res = risposta();
    await PRESENZE({ method: 'POST', headers: {}, body: Object.assign({ idToken: 'x', evento: EVENTO }, corpo) }, res);
    return Object.assign({ _stato: res._s }, res._j || {});
}
function richieste() { return (dati.get('b2bPrenotazioni/' + EVENTO) || {}).richieste || []; }
function scheda(id) { return dati.get('iscrizioni/' + id); }

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

(async () => {

    await prova('1) Il collegamento ha una firma sua, e quella di un altra pagina non apre', async () => {
        azzera();
        mettiPersona('mario', 'Mario', 'Rossi');
        const buona = await chiamaNuovo('mario', { azione: 'nuovo-incontro-leggi' });
        esigi(buona._stato === 200 && buona.ok === true, 'con la firma giusta la pagina si apre', JSON.stringify(buona.msg || ''));

        /* Il token che apre /completa_iscrizione/ riscrive i nominativi dei
           partecipanti: se aprisse anche questa pagina, chiunque abbia
           ricevuto quella mail potrebbe mandare richieste a nome altrui. */
        const altra = await chiamaConToken('mario', NL.firmaCompleta('mario'), { azione: 'nuovo-incontro-leggi' });
        esigi(altra._stato === 403, 'la firma di "completa i dati" non apre questa pagina', String(altra._stato));
        const b2b = await chiamaConToken('mario', NL.firmaAzienda(EVENTO, 'az1'), { azione: 'nuovo-incontro-leggi' });
        esigi(b2b._stato === 403, 'e nemmeno quella del modulo d azienda', String(b2b._stato));
        const vuota = await chiamaConToken('mario', '', { azione: 'nuovo-incontro-leggi' });
        esigi(vuota._stato === 403, 'senza firma non si risponde nulla');
        /* E la firma di QUESTA pagina non deve aprire le altre: altrimenti
           basterebbe la mail del richiamo per riscrivere un iscrizione. */
        const res = risposta();
        await iscrizione({ method: 'POST', headers: {}, body: { d: 'mario', t: NL.firmaNuovoIncontro('mario'), azione: 'completa-leggi' } }, res);
        esigi(res._s === 403, 'e la firma di questa pagina non apre "completa i dati"', String(res._s));
    });

    await prova('2) La pagina mostra gli argomenti veri e l anagrafica di chi legge', async () => {
        azzera();
        mettiPersona('mario', 'Mario', 'Rossi');
        const r = await chiamaNuovo('mario', { azione: 'nuovo-incontro-leggi' });
        esigi(r.ok === true, 'la lettura risponde');
        esigi(r.persona && r.persona.nome === 'Mario Rossi', 'con il nome di chi legge', JSON.stringify(r.persona));
        esigi(r.persona.email === 'mario@esempio.it' && r.persona.telefono === '045 123456', 'e i suoi recapiti');
        esigi(Array.isArray(r.argomenti) && r.argomenti.length > 0, 'gli argomenti ci sono', String((r.argomenti || []).length));
        /* IL DESK DELLA SEGRETERIA non si chiede: ci si finisce quando siamo
           noi a portarci una domanda. E i gemelli sono un argomento solo,
           perche' per chi sceglie lo sono. */
        esigi(!r.argomenti.some(a => a.id === 'desk-revilaw'), 'il desk interno non e fra quelli da scegliere');
        esigi(!r.argomenti.some(a => a.id === 'desk-revilaw-b' || a.id === 'finanza-agevolata-b'),
            'e i secondi tavoli non compaiono come argomenti a parte',
            r.argomenti.map(a => a.id).join(','));
        esigi(r.mia === null, 'e non risulta nessuna richiesta gia mandata');
        esigi(Number(r.massimo) >= 1, 'la pagina sa quanti argomenti si possono scegliere', String(r.massimo));
    });

    await prova('3) La richiesta si registra, con gli argomenti e quando preferisce', async () => {
        azzera();
        mettiPersona('mario', 'Mario', 'Rossi');
        const r = await chiamaNuovo('mario', {
            azione: 'nuovo-incontro-salva',
            aree: ['merito-creditizio', 'finanza-agevolata'],
            quandoPref: 'di mattina, non il lunedi',
            nota: 'Siamo in trattativa con due banche.'
        });
        esigi(r._stato === 200 && r.ok === true, 'la richiesta passa', JSON.stringify(r.msg || ''));
        const v = richieste()[0];
        esigi(richieste().length === 1 && v, 'e finisce fra le richieste della giornata');
        esigi(v.tipo === 'nuovo-incontro', 'marcata per quello che e', String(v && v.tipo));
        esigi(Array.isArray(v.aree) && v.aree.join(',') === 'merito-creditizio,finanza-agevolata',
            'con tutti e due gli argomenti, nell ordine in cui li ha scelti', JSON.stringify(v.aree));
        /* `area` resta scritto e vale il primo: e' il campo che leggono il
           riquadro della giornata, il foglio stampato e il filtro per tavolo. */
        esigi(v.area === 'merito-creditizio', 'e il primo vale anche come "area", per chi la legge cosi', String(v.area));
        esigi(v.quandoPref === 'di mattina, non il lunedi', 'quando preferisce e scritto', String(v.quandoPref));
        esigi(v.nota === 'Siamo in trattativa con due banche.', 'e quello che ha scritto, per intero');
        esigi(v.stato === 'aperta', 'nasce da guardare');
        esigi(v.nome === 'Mario Rossi' && v.email === 'mario@esempio.it' && v.telefono === '045 123456',
            'con l anagrafica attaccata: chi richiama non deve aprire altro');
    });

    await prova('4) Un argomento inventato non entra in archivio', async () => {
        azzera();
        mettiPersona('mario', 'Mario', 'Rossi');
        const r = await chiamaNuovo('mario', {
            azione: 'nuovo-incontro-salva', aree: ['merito-creditizio', 'tavolo-che-non-esiste']
        });
        esigi(r.ok === true, 'la richiesta passa lo stesso');
        esigi(richieste()[0].aree.join(',') === 'merito-creditizio',
            'ma resta solo l argomento vero', JSON.stringify(richieste()[0].aree));
        /* Senza nessun argomento valido non c'e' richiesta: chi organizza
           leggerebbe un nome senza sapere di che cosa parlargli. */
        azzera();
        mettiPersona('mario', 'Mario', 'Rossi');
        const vuoto = await chiamaNuovo('mario', { azione: 'nuovo-incontro-salva', aree: ['niente'] });
        esigi(vuoto._stato === 400 && !vuoto.ok, 'e senza nessun argomento valido la richiesta non si registra');
        esigi(richieste().length === 0, 'in archivio non resta niente');
        // il desk interno non si puo' chiedere nemmeno scrivendolo a mano
        const interno = await chiamaNuovo('mario', { azione: 'nuovo-incontro-salva', aree: ['desk-revilaw'] });
        esigi(!interno.ok, 'e il desk della segreteria non si puo chiedere nemmeno a mano');
    });

    await prova('5) Lo stesso argomento due volte non e una scelta in piu', async () => {
        azzera();
        mettiPersona('mario', 'Mario', 'Rossi');
        await chiamaNuovo('mario', {
            azione: 'nuovo-incontro-salva', aree: ['esg', 'esg', 'revisione']
        });
        esigi(richieste()[0].aree.join(',') === 'esg,revisione',
            'il doppione si toglie', JSON.stringify(richieste()[0].aree));
    });

    await prova('6) Ripensarci corregge la richiesta, non ne aggiunge una seconda', async () => {
        azzera();
        mettiPersona('mario', 'Mario', 'Rossi');
        await chiamaNuovo('mario', { azione: 'nuovo-incontro-salva', aree: ['esg'], quandoPref: 'di mattina' });
        orologio += 60 * 60 * 1000;
        const r = await chiamaNuovo('mario', { azione: 'nuovo-incontro-salva', aree: ['revisione'], quandoPref: 'di pomeriggio' });
        esigi(r.ok === true, 'la seconda passa');
        esigi(richieste().length === 1, 'e resta una richiesta sola', String(richieste().length));
        esigi(richieste()[0].aree.join(',') === 'revisione' && richieste()[0].quandoPref === 'di pomeriggio',
            'quella nuova, non quella vecchia');
        // e riaprendo la pagina si rivede quello che si e' chiesto
        const letto = await chiamaNuovo('mario', { azione: 'nuovo-incontro-leggi' });
        esigi(letto.mia && letto.mia.aree.join(',') === 'revisione',
            'riaprendo il collegamento la richiesta si rivede, e si corregge', JSON.stringify(letto.mia));
    });

    await prova('7) Due persone della stessa azienda chiedono due cose diverse', async () => {
        /* Nelle richieste a orari esauriti due colleghi che bussano sono un
           bussare solo: li' si chiede un posto per l'impresa a un tavolo che
           sta per riempirsi. Qui no: due persone possono volere due incontri
           su due argomenti, e cancellare il primo sarebbe perdere una
           richiesta che qualcuno ha scritto. */
        azzera();
        mettiPersona('mario', 'Mario', 'Rossi', { b2bAzienda: { id: 'az1', nome: 'Alfa S.r.l.', evento: EVENTO } });
        mettiPersona('anna', 'Anna', 'Neri', { b2bAzienda: { id: 'az1', nome: 'Alfa S.r.l.', evento: EVENTO } });
        await chiamaNuovo('mario', { azione: 'nuovo-incontro-salva', aree: ['esg'] });
        await chiamaNuovo('anna', { azione: 'nuovo-incontro-salva', aree: ['revisione'] });
        esigi(richieste().length === 2, 'restano tutte e due', String(richieste().length));
        esigi(richieste().map(r => r.aree[0]).sort().join(',') === 'esg,revisione', 'ciascuna con il suo argomento');
        esigi(richieste().every(r => r.aziendaId === 'az1'), 'e tutte e due portano l azienda');
    });

    await prova('8) L avviso allo staff arriva ai tre indirizzi, con tutta l anagrafica', async () => {
        azzera();
        mettiPersona('mario', 'Mario', 'Rossi');
        posta.length = 0;
        const r = await chiamaNuovo('mario', {
            azione: 'nuovo-incontro-salva', aree: ['merito-creditizio', 'esg'],
            quandoPref: 'di mattina', nota: 'Due banche da riallineare.'
        });
        esigi(r.ok === true && r.avvisati === 3, 'parte una mail ai tre indirizzi', String(r.avvisati));
        esigi(posta.length === 1, 'una mail sola, non tre', String(posta.length));
        const m = posta[0] || {};
        const a = String(m.to || '');
        esigi(a.indexOf('sergiomiele@revilaw.it') >= 0, 'a Sergio Miele');
        esigi(a.indexOf('vincenzoantonionapolitano@revilaw.it') >= 0, 'a Vincenzo Antonio Napolitano');
        esigi(a.indexOf('andreamissori@revilaw.it') >= 0, 'e ad Andrea Missori');
        esigi(m.replyTo === 'mario@esempio.it', 'rispondere scrive direttamente a chi ha chiesto', String(m.replyTo));
        const t = String(m.text || '');
        esigi(/Mario Rossi/.test(t), 'nel testo c e il nome');
        esigi(/Alfa S\.r\.l\./.test(t), 'l azienda');
        esigi(/Amministratore/.test(t), 'il ruolo');
        esigi(/mario@esempio\.it/.test(t) && /045 123456/.test(t), 'l indirizzo e il telefono');
        esigi(/Merito creditizio/.test(t) && /ESG/i.test(t), 'tutti gli argomenti', t.slice(0, 200));
        esigi(/di mattina/.test(t), 'quando preferirebbe');
        esigi(/Due banche da riallineare/.test(t), 'e quello che ha scritto');
        esigi(/Napoli/.test(t), 'piu il convegno da cui arriva');
        esigi(/Mario Rossi/.test(String(m.subject || '')), 'e l oggetto dice di chi si tratta', String(m.subject));
    });

    await prova('9) Se la posta non parte, la richiesta resta comunque registrata', async () => {
        /* Perderla per un server di posta lento sarebbe il modo peggiore di
           trattare qualcuno che ha risposto a un nostro invito. */
        azzera();
        mettiPersona('mario', 'Mario', 'Rossi');
        postaRotta = true;
        const r = await chiamaNuovo('mario', { azione: 'nuovo-incontro-salva', aree: ['esg'] });
        esigi(r._stato === 200 && r.ok === true, 'la pagina dice comunque di si');
        esigi(r.avvisati === 0, 'e dichiara che nessuno e stato avvisato', String(r.avvisati));
        esigi(richieste().length === 1, 'ma la richiesta e in archivio', String(richieste().length));
    });

    await prova('10) Gli indirizzi dell avviso si cambiano senza toccare il codice', async () => {
        azzera();
        mettiPersona('mario', 'Mario', 'Rossi');
        dati.set('avvisiNuovoIncontro/' + EVENTO, { a: ['uno@revilaw.it', 'due@revilaw.it'] });
        posta.length = 0;
        const r = await chiamaNuovo('mario', { azione: 'nuovo-incontro-salva', aree: ['esg'] });
        esigi(r.avvisati === 2, 'vanno a chi dice l archivio', String(r.avvisati));
        esigi(String(posta[0].to).indexOf('uno@revilaw.it') >= 0, 'e non ai tre scritti nel codice');
        esigi(String(posta[0].to).indexOf('sergiomiele@revilaw.it') < 0, 'quelli valgono solo finche nessuno li cambia');
    });

    await prova('11) Il freno: la stessa richiesta mandata dodici volte si ferma', async () => {
        azzera();
        mettiPersona('mario', 'Mario', 'Rossi');
        let fermato = 0;
        for (let i = 0; i < 14; i++) {
            const r = await chiamaNuovo('mario', { azione: 'nuovo-incontro-salva', aree: ['esg'] });
            if (r._stato === 429) fermato++;
        }
        esigi(fermato > 0, 'dopo un po si viene fermati', String(fermato));
        esigi(richieste().length === 1, 'e in archivio resta comunque una richiesta sola');
    });

    await prova('11bis) Chi ha seguito online non ha l invito ai tavoli, e la pagina funziona lo stesso', async () => {
        /* E' la meta' dei destinatari: chi seguiva da casa un tavolo non ce
           l'aveva, quindi `b2bInvito` non ce l'ha. Se l'evento si ricavasse
           solo da li', quelle persone si troverebbero davanti a un errore che
           non sanno spiegarsi. Lo dice il RICHIAMO che abbiamo mandato noi. */
        azzera();
        dati.set('iscrizioni/lia', {
            pagina: 'Napoli 2 Ottobre 2026', data: '10/09/2026 11:00:00',
            nome: 'Lia', cognome: 'Blu', email: 'lia@esempio.it', azienda: 'Gamma Srl',
            modalita: 'online',
            nuovoIncontroInvito: { quando: orologio - 1000, da: 'staff@revilaw.it', eventoId: EVENTO }
        });
        const letto = await chiamaNuovo('lia', { azione: 'nuovo-incontro-leggi' });
        esigi(letto._stato === 200 && letto.ok === true, 'la pagina si apre anche senza invito ai tavoli', JSON.stringify(letto.msg || ''));
        esigi(letto.evento && letto.evento.titolo === 'Napoli', 'e sa di quale convegno si parla', JSON.stringify(letto.evento));
        const r = await chiamaNuovo('lia', { azione: 'nuovo-incontro-salva', aree: ['esg'] });
        esigi(r.ok === true, 'e la richiesta si registra', JSON.stringify(r.msg || ''));
        esigi(richieste().length === 1 && richieste()[0].nome === 'Lia Blu', 'sotto il convegno giusto', JSON.stringify(richieste()[0] && richieste()[0].nome));
        /* Senza nessuno dei due, e senza che il browser possa inventarselo, si
           dice che non si sa invece di scrivere la richiesta sotto un
           convegno a caso. */
        azzera();
        dati.set('iscrizioni/zoe', { pagina: 'x', nome: 'Zoe', cognome: 'Verdi', email: 'zoe@esempio.it' });
        const senza = await chiamaNuovo('zoe', { azione: 'nuovo-incontro-leggi' });
        esigi(senza._stato === 400 && !senza.ok, 'senza nessun riferimento si dice che non si sa', String(senza._stato));
    });

    await prova('12) Il richiamo parte dall area riservata, una mail a testa', async () => {
        azzera();
        mettiPersona('mario', 'Mario', 'Rossi');
        mettiPersona('anna', 'Anna', 'Neri');
        posta.length = 0;
        const r = await chiamaPresenze({
            azione: 'invita-nuovo-incontro',
            destinatari: [{ id: 'mario', doc: 'mario' }, { id: 'anna', doc: 'anna' }],
            mail: {
                oggetto: '{{NOME}}: programmiamo un nuovo incontro',
                html: '<p>Gentile {{NOME}}, <a href="{{NUOVO_INCONTRO}}">scelga gli argomenti</a>.</p>',
                testo: 'Gentile {{NOME}}, scelga gli argomenti: {{NUOVO_INCONTRO}}'
            }
        });
        esigi(r._stato === 200 && r.inviate === 2, 'partono due mail', JSON.stringify(r));
        esigi(posta.length === 2, 'una per persona', String(posta.length));
        const aMario = posta.filter(m => m.to === 'mario@esempio.it')[0] || {};
        esigi(/Mario Rossi/.test(String(aMario.subject || '')), 'anche l oggetto porta il nome', String(aMario.subject));
        esigi(String(aMario.html || '').indexOf('{{') < 0, 'e nessun segnaposto resta scritto per esteso', String(aMario.html));
        /* Il collegamento dev'essere QUELLO di quella scheda: se fosse di
           un'altra, Mario aprirebbe la pagina di Anna. */
        const atteso = NL.linkNuovoIncontro('mario');
        esigi(String(aMario.html || '').indexOf(atteso) >= 0, 'il collegamento e quello della sua scheda');
        esigi(String(aMario.text || '').indexOf(atteso) >= 0, 'anche nella versione a solo testo');
        esigi(!!scheda('mario').nuovoIncontroInvito, 'e resta scritto che e stato richiamato');
        /* NON si scrive b2bInvito: direbbe che e' stata invitata a una
           giornata finita, e la finestra degli inviti la crederebbe a posto. */
        esigi(String(scheda('mario').b2bInvito.quando) !== String(orologio),
            'l invito agli incontri del convegno non viene toccato');
    });

    await prova('13) Non si scrive due volte alla stessa persona', async () => {
        azzera();
        mettiPersona('mario', 'Mario', 'Rossi');
        const mail = { oggetto: 'x', html: '<p>{{NUOVO_INCONTRO}}</p>', testo: 'x' };
        await chiamaPresenze({ azione: 'invita-nuovo-incontro', destinatari: [{ id: 'mario', doc: 'mario' }], mail: mail });
        posta.length = 0;
        const r = await chiamaPresenze({ azione: 'invita-nuovo-incontro', destinatari: [{ id: 'mario', doc: 'mario' }], mail: mail });
        esigi(r.inviate === 0 && r.giaScritto === 1, 'la seconda volta non parte niente', JSON.stringify(r));
        esigi(posta.length === 0, 'e la casella resta tranquilla');
        // si puo' forzare dicendolo
        const f = await chiamaPresenze({ azione: 'invita-nuovo-incontro', forza: true, destinatari: [{ id: 'mario', doc: 'mario' }], mail: mail });
        esigi(f.inviate === 1, 'ma forzando si puo rimandare', JSON.stringify(f));
    });

    await prova('14) Due schede con la stessa casella sono una mail sola', async () => {
        azzera();
        mettiPersona('mario', 'Mario', 'Rossi');
        mettiPersona('mario2', 'Mario', 'Rossi', { email: 'mario@esempio.it' });
        posta.length = 0;
        const r = await chiamaPresenze({
            azione: 'invita-nuovo-incontro',
            destinatari: [{ id: 'mario', doc: 'mario' }, { id: 'mario2', doc: 'mario2' }],
            mail: { oggetto: 'x', html: '<p>{{NUOVO_INCONTRO}}</p>', testo: 'x' }
        });
        esigi(r.inviate === 1 && r.giaScritto === 1, 'parte una mail sola', JSON.stringify(r));
        esigi(posta.length === 1, 'due righe nostre non sono due persone da disturbare due volte');
    });

    await prova('15) Chi ha annullato, e chi non ha indirizzo, restano fuori', async () => {
        azzera();
        mettiPersona('mario', 'Mario', 'Rossi', { annullato: true });
        mettiPersona('anna', 'Anna', 'Neri', { email: '' });
        posta.length = 0;
        const r = await chiamaPresenze({
            azione: 'invita-nuovo-incontro',
            destinatari: [{ id: 'mario', doc: 'mario' }, { id: 'anna', doc: 'anna' }],
            mail: { oggetto: 'x', html: '<p>{{NUOVO_INCONTRO}}</p>', testo: 'x' }
        });
        esigi(r.inviate === 0, 'non parte niente', JSON.stringify(r));
        esigi(r.senzaScheda === 1 && r.senzaEmail === 1, 'e si dice perche', JSON.stringify(r));
    });

    await prova('16) La mail del richiamo e quella vera del formato', async () => {
        /* La compone l'area riservata e il servizio la spedisce: se il
           segnaposto del collegamento non ci fosse, partirebbe una mail con
           un pulsante che non porta da nessuna parte. */
        const F = require(path.join(RADICE, '..', 'area-riservata', 'newsletter-format.js'));
        const m = F.invitoNuovoIncontro({ evento: { titolo: 'Napoli', quando: '2 ottobre 2026' } });
        esigi(/\{\{NOME\}\}/.test(m.oggetto), 'l oggetto porta il nome di chi legge', m.oggetto);
        esigi(m.html.indexOf('{{NUOVO_INCONTRO}}') > 0, 'l html porta il collegamento');
        esigi(m.testo.indexOf('{{NUOVO_INCONTRO}}') > 0, 'e anche la versione a solo testo');
        esigi(!/[‒–—―]/.test(m.html + m.testo + m.oggetto), 'niente trattini lunghi');
        const o = F.invitoNuovoIncontro({ evento: { titolo: 'Napoli' }, online: true });
        esigi(o.html !== m.html, 'a chi ha seguito online si dice un altra cosa');
        esigi(/online/i.test(o.testo), 'e lo si dice davvero', o.testo.slice(0, 120));
        /* A chi era ai tavoli non si dice "ha seguito online", e a chi era
           online non si dice "non e' riuscito a fare l'incontro al desk". */
        esigi(!/ha seguito online/i.test(m.testo), 'mentre a chi era in sala no');
    });

    console.log('\n' + ok + ' ok, ' + ko + ' KO');
    process.exit(ko ? 1 : 0);
})().catch(e => { console.error('Errore nelle prove:', e); process.exit(1); });
