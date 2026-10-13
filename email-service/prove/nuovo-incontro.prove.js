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
/* Quanto tempo "costa" una consegna. Serve a far scattare il tetto di tempo
   della funzione senza aspettare davvero un minuto: l'orologio e' finto, e
   una mano lenta del server di posta e' esattamente una lancetta che corre. */
let postaLenta = 0;
/* Gli indirizzi che il server di posta ACCETTA il messaggio ma rifiuta: non
   solleva niente, li mette in `rejected`. E' il modo in cui una copia nascosta
   puo' sparire senza che nessuno se ne accorga. */
let postaRifiuta = [];
const nodemailer = {
    createTransport: () => ({
        sendMail: async (msg) => {
            if (postaLenta) orologio += postaLenta;
            if (postaRotta) throw new Error('550 casella non raggiungibile');
            posta.push(msg);
            const tutti = [msg.to].concat(msg.bcc || []).map(x => String(x || '').toLowerCase());
            const rifiutati = tutti.filter(x => postaRifiuta.indexOf(x) >= 0);
            return { response: '250 ok', rejected: rifiutati, accepted: tutti.filter(x => rifiutati.indexOf(x) < 0) };
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
    dati.clear(); posta.length = 0; postaRotta = false; postaLenta = 0; postaRifiuta = [];
    /* La lancetta non torna indietro fra una prova e l'altra. Il servizio
       tiene in memoria dei freni a finestra di dieci minuti, e riportando
       l'orologio al punto di partenza se li ritroverebbe pieni dei tentativi
       della prova precedente: da quel momento rifiuterebbe i salvataggi di
       questa, e la prova diventerebbe rossa per un motivo che non c'entra. */
    orologio += 11 * 60 * 1000;
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
        b2bInvito: { quando: orologio - 100000, da: 'staff@revilaw.it', eventoId: EVENTO, aree: ['merito-creditizio'] },
        /* Il richiamo e' gia' partito: e' il momento che la firma del
           collegamento porta dentro, e senza non si aprirebbe niente. */
        nuovoIncontroInvito: { quando: orologio - 50000, da: 'staff@revilaw.it', eventoId: EVENTO, platea: 'tavoli' }
    }, extra || {}));
}
/* Una persona a cui il richiamo NON e' ancora stato mandato: e' lo stato da
   cui partono le prove dell'invio, mentre quelle della pagina partono da chi
   la mail l'ha gia' ricevuta. */
function mettiDaRichiamare(id, nome, cognome, extra) {
    mettiPersona(id, nome, cognome, Object.assign({ nuovoIncontroInvito: null }, extra || {}));
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
    // la firma vale per QUEL richiamo: si legge dalla scheda, come fa la mail
    const q = Number(((dati.get('iscrizioni/' + id) || {}).nuovoIncontroInvito || {}).quando) || 0;
    await iscrizione({
        method: 'POST', headers: {},
        body: Object.assign({ d: id, t: NL.firmaNuovoIncontro(id, q) }, corpo)
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
        mettiDaRichiamare('mario', 'Mario', 'Rossi');
        mettiDaRichiamare('anna', 'Anna', 'Neri');
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
        /* Il collegamento porta dentro il MOMENTO del richiamo, che e' lo
           stesso scritto sulla scheda: cosi' un richiamo nuovo invalida da se'
           quelli vecchi. */
        const quandoScritto = Number((scheda('mario').nuovoIncontroInvito || {}).quando) || 0;
        const atteso = NL.linkNuovoIncontro('mario', quandoScritto);
        esigi(quandoScritto > 0, 'il momento del richiamo resta scritto sulla scheda', String(quandoScritto));
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
        mettiDaRichiamare('mario', 'Mario', 'Rossi');
        const mail = { oggetto: 'x', html: '<p>{{NUOVO_INCONTRO}}</p>', testo: 'x' };
        await chiamaPresenze({ azione: 'invita-nuovo-incontro', destinatari: [{ id: 'mario', doc: 'mario' }], mail: mail });
        posta.length = 0;
        const r = await chiamaPresenze({ azione: 'invita-nuovo-incontro', destinatari: [{ id: 'mario', doc: 'mario' }], mail: mail });
        esigi(r.inviate === 0 && r.giaScritto === 1, 'la seconda volta non parte niente', JSON.stringify(r));
        esigi(posta.length === 0, 'e la casella resta tranquilla');
        /* E il "gia' scritto" e' DI QUESTO CONVEGNO: la traccia porta
           l'evento, e il confronto deve guardarlo. Senza, una persona
           richiamata dopo Verona non avrebbe mai ricevuto la mail di Napoli -
           e il riassunto l'avrebbe contata fra i "gia' richiamati" senza dire
           che parlava di un'altra giornata. */
        esigi(String(scheda('mario').nuovoIncontroInvito.eventoId) === EVENTO,
            'la traccia dice di quale convegno e', String(scheda('mario').nuovoIncontroInvito.eventoId));
        posta.length = 0;
        const altroEvento = await chiamaPresenze({
            azione: 'invita-nuovo-incontro', evento: 'verona-2026-03-27',
            destinatari: [{ id: 'mario', doc: 'mario' }], mail: mail
        });
        esigi(altroEvento.inviate === 1, 'e per un altro convegno si riscrive', JSON.stringify(altroEvento));
        // si puo' forzare dicendolo
        posta.length = 0;
        const f = await chiamaPresenze({ azione: 'invita-nuovo-incontro', forza: true, destinatari: [{ id: 'mario', doc: 'mario' }], mail: mail });
        esigi(f.inviate === 1, 'ma forzando si puo rimandare', JSON.stringify(f));
    });

    await prova('14) Due schede con la stessa casella sono una mail sola', async () => {
        azzera();
        mettiDaRichiamare('mario', 'Mario', 'Rossi');
        mettiDaRichiamare('mario2', 'Mario', 'Rossi', { email: 'mario@esempio.it' });
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
        mettiDaRichiamare('mario', 'Mario', 'Rossi', { annullato: true });
        mettiDaRichiamare('anna', 'Anna', 'Neri', { email: '' });
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
        /* NON BASTA CHE IL SEGNAPOSTO CI SIA: conta che cosa gli sta intorno.
           Questa prova e' stata verde per settimane mentre l'href era
           `https://{{NUOVO_INCONTRO}}` - il costruttore del pulsante, non
           riconoscendo il segnaposto come indirizzo, ci metteva davanti lo
           schema - e dopo la sostituzione diventava
           `https://https://nextgenerationbusiness.it/...`, che nessun client
           sa aprire. Un confronto per sottostringa e' cieco ai prefissi, ed e'
           esattamente il motivo per cui centosessantacinque prove verdi non
           hanno visto il guasto che l'utente ha visto al primo clic.
           Quindi: si compone la mail vera, si sostituisce il segnaposto come
           fa il servizio, e si pretende che ogni indirizzo sia un indirizzo
           NOSTRO, letto da `new URL`. */
        esigi(m.html.indexOf('href="{{NUOVO_INCONTRO}}"') > 0, 'l html porta il collegamento NUDO nell href',
            (m.html.match(/href="[^"]*\{\{NUOVO_INCONTRO\}\}[^"]*"/g) || []).join(' '));
        esigi(!/https?:\/\/\{\{/.test(m.html), 'senza niente davanti');
        esigi(m.testo.indexOf('{{NUOVO_INCONTRO}}') > 0, 'e anche la versione a solo testo');
        const vero = NL.linkNuovoIncontro('mario', 1760000000000);
        const spedita = m.html.split('{{NUOVO_INCONTRO}}').join(vero);
        const indirizzi = (spedita.match(/href="([^"]*)"/g) || [])
            .map(h => h.slice(6, -1)).filter(h => h.indexOf('nuovo_incontro') >= 0);
        esigi(indirizzi.length === 2, 'i due pulsanti portano il collegamento', JSON.stringify(indirizzi));
        const casa = indirizzi.map(h => { try { return new URL(h).hostname; } catch (e) { return 'ILLEGGIBILE'; } });
        esigi(casa.every(h => h === 'nextgenerationbusiness.it'),
            'e aprono il NOSTRO sito, non un indirizzo che il client non sa leggere', JSON.stringify(casa));
        const nelTesto = m.testo.split('{{NUOVO_INCONTRO}}').join(vero)
            .split(/\s+/).filter(x => x.indexOf('nuovo_incontro') >= 0);
        esigi(nelTesto.length >= 1 && nelTesto.every(h => {
            try { return new URL(h).hostname === 'nextgenerationbusiness.it'; } catch (e) { return false; }
        }), 'e lo stesso vale per la versione a solo testo', JSON.stringify(nelTesto));
        esigi(!/[‒–—―]/.test(m.html + m.testo + m.oggetto), 'niente trattini lunghi');
        const o = F.invitoNuovoIncontro({ evento: { titolo: 'Napoli' }, online: true });
        esigi(o.html !== m.html, 'a chi ha seguito online si dice un altra cosa');
        esigi(/online/i.test(o.testo), 'e lo si dice davvero', o.testo.slice(0, 120));
        /* A chi era ai tavoli non si dice "ha seguito online", e a chi era
           online non si dice "non e' riuscito a fare l'incontro al desk". */
        esigi(!/ha seguito online/i.test(m.testo), 'mentre a chi era in sala no');
    });

    await prova('17) Il riepilogo porta la richiesta nuova INTERA, non meta', async () => {
        /* La risposta dell'azione riepilogo e' una whitelist campo per campo:
           finche' tipo, aree e quandoPref non c'erano, il foglio stampato
           riceveva le richieste nuove senza sapere che cosa fossero e con un
           argomento solo. Stampava la cosa sbagliata senza dirlo a nessuno, e
           una prova che si costruisce il riepilogo a mano non se ne accorge:
           per questo questa parte dal servizio vero. */
        azzera();
        mettiPersona('carlo', 'Carlo', 'Bruni');
        await chiamaNuovo('carlo', {
            azione: 'nuovo-incontro-salva',
            aree: ['merito-creditizio', 'esg', 'revisione'],
            quandoPref: 'di mattina', nota: 'Due banche da riallineare.'
        });
        const r = await chiamaPresenze({ sezione: 'b2b', azione: 'riepilogo' });
        esigi(r.ok === true, 'il riepilogo risponde');
        const v = (r.richieste || [])[0];
        esigi(!!v, 'e porta la richiesta', JSON.stringify((r.richieste || []).length));
        esigi(v.tipo === 'nuovo-incontro', 'dicendo da dove nasce', JSON.stringify(v.tipo));
        esigi(Array.isArray(v.aree) && v.aree.length === 3,
            'con TUTTI gli argomenti, non solo il primo', JSON.stringify(v.aree));
        esigi(v.quandoPref === 'di mattina', 'e con quando preferisce', JSON.stringify(v.quandoPref));
        esigi(v.area === 'merito-creditizio', 'piu il primo argomento come "area", per chi la legge cosi');
        esigi(v.nome === 'Carlo Bruni' && v.telefono === '045 123456', 'e l anagrafica per richiamarlo');
        /* La richiesta a orari esauriti non ha tipo, e non deve prenderne uno:
           "assente" vuol dire "a orari esauriti", e riempirlo a posteriori
           cambierebbe come si legge tutto l'archivio di prima. */
        esigi((r.conti || {}).richiesteAperte === 1, 'e il conto in testa la vede', JSON.stringify((r.conti || {}).richiesteAperte));
        /* E PORTA L'ESITO DELL'AVVISO. Una richiesta arrivata mentre la posta
           era rotta si vede solo qui: se il riepilogo non lo dice, quella
           persona resta in elenco e nessuno sa che nelle tre caselle non e'
           arrivato niente. */
        esigi(v.avviso && v.avviso.inviata === true, 'con l esito dell avviso allo studio', JSON.stringify(v.avviso));
        azzera();
        mettiPersona('nina', 'Nina', 'Lilla');
        postaRotta = true;
        await chiamaNuovo('nina', { azione: 'nuovo-incontro-salva', aree: ['esg'] });
        postaRotta = false;
        const r2 = await chiamaPresenze({ sezione: 'b2b', azione: 'riepilogo' });
        const v2 = (r2.richieste || [])[0];
        esigi(v2 && v2.avviso && v2.avviso.inviata === false,
            'e quando la mail non e partita il riepilogo lo dice', JSON.stringify(v2 && v2.avviso));
    });

    await prova('18) Assegnare un incontro a un collega non cancella la sua richiesta', async () => {
        /* Il percorso felice per soddisfare una richiesta e' assegnare uno
           slot. Se cosi' facendo sparisse la richiesta di un collega su un
           altro argomento, il dedup per sola persona non avrebbe protetto
           niente: la perderemmo nel momento stesso in cui lavoriamo bene. */
        azzera();
        mettiPersona('carlo', 'Carlo', 'Bruni', { b2bAzienda: { id: 'az1', nome: 'Alfa S.r.l.', evento: EVENTO } });
        mettiPersona('anna', 'Anna', 'Neri', { b2bAzienda: { id: 'az1', nome: 'Alfa S.r.l.', evento: EVENTO } });
        await chiamaNuovo('anna', { azione: 'nuovo-incontro-salva', aree: ['esg'] });
        esigi(richieste().length === 1, 'la richiesta di Anna c e');
        const r = await chiamaPresenze({
            sezione: 'b2b', azione: 'agenda-assegna', area: 'merito-creditizio', ora: '10:00',
            doc: 'carlo', avvisa: false
        });
        esigi(r._stato === 200 && r.ok, 'a Carlo si assegna un incontro', JSON.stringify(r.msg || ''));
        esigi(richieste().length === 1 && richieste()[0].doc === 'anna',
            'e la richiesta di Anna resta dov e', JSON.stringify(richieste().map(x => x.doc)));
        /* Mentre la richiesta di QUELLA STESSA persona si chiude: ha chiesto
           un incontro e adesso ce l'ha, e lasciarla aperta manderebbe a
           cercare un posto per chi e' gia' a posto. */
        azzera();
        mettiPersona('carlo', 'Carlo', 'Bruni');
        dati.set('b2bPrenotazioni/' + EVENTO, { evento: EVENTO, aree: {}, richieste: [
            { doc: 'carlo', nome: 'Carlo Bruni', area: 'merito-creditizio', quando: 1, stato: 'aperta' }
        ] });
        await chiamaPresenze({
            sezione: 'b2b', azione: 'agenda-assegna', area: 'merito-creditizio', ora: '10:00',
            doc: 'carlo', avvisa: false
        });
        esigi(richieste().length === 0, 'la sua si chiude da se', JSON.stringify(richieste()));
    });

    await prova('19) Togliere un azienda dagli incontri non cancella il contatto di dopo', async () => {
        /* Togliere un'azienda dagli incontri e' un gesto dell'epoca della
           giornata: si libera un posto in agenda. La richiesta nata dieci
           giorni dopo e' un'altra cosa, e cancellarla qui sarebbe perdere un
           contatto che nessuno ha mai letto. */
        azzera();
        mettiPersona('carlo', 'Carlo', 'Bruni', { b2bAzienda: { id: 'az1', nome: 'Alfa S.r.l.', evento: EVENTO } });
        dati.set('b2bAziende/' + EVENTO + '--az1', {
            evento: EVENTO, id: 'az1', nome: 'Alfa S.r.l.', chiave: 'p:1', aree: ['merito-creditizio'],
            referenti: [{ doc: 'carlo', nome: 'Carlo Bruni', email: 'carlo@esempio.it' }], rev: 1
        });
        await chiamaNuovo('carlo', { azione: 'nuovo-incontro-salva', aree: ['esg'] });
        esigi(richieste().length === 1, 'la richiesta c e');
        const r = await chiamaPresenze({ sezione: 'b2b', azione: 'b2b-azienda-elimina', aziendaId: 'az1' });
        esigi(r._stato === 200 && r.ok, 'l azienda si toglie dagli incontri', JSON.stringify(r.msg || ''));
        esigi(richieste().length === 1 && richieste()[0].tipo === 'nuovo-incontro',
            'e la richiesta di dopo il convegno resta', JSON.stringify(richieste()));
    });

    await prova('20) Il modulo degli incontri non racconta la richiesta di dopo', async () => {
        /* La pagina "a slot" parla della giornata del convegno: dire "la Sua
           richiesta e' gia' arrivata" a chi ne ha mandata una DOPO, da
           un'altra pagina e per un'altra cosa, gli farebbe credere di aver
           gia' chiesto un posto che invece e' ancora libero. */
        azzera();
        mettiPersona('carlo', 'Carlo', 'Bruni');
        await chiamaNuovo('carlo', { azione: 'nuovo-incontro-salva', aree: ['merito-creditizio'] });
        const res = risposta();
        await iscrizione({ method: 'POST', headers: {}, body: { d: 'carlo', t: NL.firmaCompleta('carlo'), azione: 'b2b-leggi' } }, res);
        const letto = res._j || {};
        esigi(letto.ok === true && letto.modo === 'slot', 'il modulo degli incontri si apre', JSON.stringify(letto.msg || letto.modo));
        esigi(!letto.richiesta, 'e non dichiara nessuna richiesta a orari esauriti', JSON.stringify(letto.richiesta));
    });

    await prova('21) La copia a chi preme arriva per ogni mail', async () => {
        /* Questa prova diceva il contrario, e difendeva il comportamento che
           chi manda ha poi segnalato: la copia partiva solo sulla prima mail
           della chiamata, e con i lotti da venticinque della finestra su
           settanta destinatari ne arrivavano tre. Una prova che fissa un
           comportamento sbagliato e' peggio di nessuna prova: lo rende
           intoccabile. Adesso dice quello che serve a chi preme - una mail, una
           copia - come fanno l'invito agli incontri e l'avviso di spostamento. */
        azzera();
        mettiDaRichiamare('uno', 'Uno', 'Rossi');
        mettiDaRichiamare('due', 'Due', 'Rossi');
        mettiDaRichiamare('tre', 'Tre', 'Rossi');
        posta.length = 0;
        const r = await chiamaPresenze({
            azione: 'invita-nuovo-incontro',
            destinatari: [{ id: 'uno', doc: 'uno' }, { id: 'due', doc: 'due' }, { id: 'tre', doc: 'tre' }],
            mail: { oggetto: 'x', html: '<p>{{NUOVO_INCONTRO}}</p>', testo: 'x' }
        });
        esigi(r.inviate === 3, 'partono tre mail', JSON.stringify(r));
        const conCcn = posta.filter(m => m.bcc && m.bcc.length).length;
        esigi(conCcn === 3, 'e tutte e tre portano la copia nascosta', String(conCcn));
    });

    await prova('22) L oggetto cambia fra chi era ai tavoli e chi era online', async () => {
        /* "L'incontro che non avete ancora fatto" a chi ha seguito online non
           vuol dire niente: un incontro non ce l'aveva, e quella e' la prima
           riga che legge, prima ancora di aprire. */
        const F = require(path.join(RADICE, '..', 'area-riservata', 'newsletter-format.js'));
        const sala = F.invitoNuovoIncontro({ evento: { titolo: 'Napoli' } });
        const online = F.invitoNuovoIncontro({ evento: { titolo: 'Napoli' }, online: true });
        esigi(sala.oggetto !== online.oggetto, 'i due oggetti sono diversi', sala.oggetto + ' | ' + online.oggetto);
        esigi(/non avete ancora fatto/.test(sala.oggetto), 'a chi era ai tavoli si parla dell incontro saltato');
        esigi(!/non avete ancora fatto/.test(online.oggetto), 'a chi era online no', online.oggetto);
        esigi(/\{\{NOME\}\}/.test(online.oggetto), 'e tutti e due portano il nome di chi legge');
    });

    await prova('23) L evento non lo sceglie il browser', async () => {
        /* Con un collegamento valido, chi volesse potrebbe far comparire la
           sua richiesta sotto una giornata a cui non e' mai stato, e chi la
           legge il giorno dopo non avrebbe modo di accorgersene. */
        azzera();
        dati.set('iscrizioni/zoe', { pagina: 'x', nome: 'Zoe', cognome: 'Verdi', email: 'zoe@esempio.it' });
        const r = await chiamaNuovo('zoe', { azione: 'nuovo-incontro-salva', aree: ['esg'], e: EVENTO });
        esigi(r._stato === 400 && !r.ok, 'dire l evento nel corpo non basta', JSON.stringify(r.msg || ''));
        esigi(richieste().length === 0, 'e in archivio non entra niente');
    });

    await prova('24) Un collegamento vecchio smette di aprire quando se ne manda uno nuovo', async () => {
        /* Un indirizzo inoltrato per sbaglio, o rimasto nei messaggi inviati
           di una casella condivisa, non deve restare una chiave buona per
           sempre: da li' si legge l'anagrafica di quella persona e le si
           riscrive la richiesta. */
        azzera();
        mettiPersona('mario', 'Mario', 'Rossi');
        const vecchio = Number(scheda('mario').nuovoIncontroInvito.quando);
        const apreOra = await chiamaNuovo('mario', { azione: 'nuovo-incontro-leggi' });
        esigi(apreOra.ok === true, 'il collegamento del richiamo apre');
        // se ne manda un altro: cambia il momento, e con lui la firma
        orologio += 24 * 60 * 60 * 1000;
        await chiamaPresenze({
            azione: 'invita-nuovo-incontro', forza: true,
            destinatari: [{ id: 'mario', doc: 'mario' }],
            mail: { oggetto: 'x', html: '<p>{{NUOVO_INCONTRO}}</p>', testo: 'x' }
        });
        const nuovo = Number(scheda('mario').nuovoIncontroInvito.quando);
        esigi(nuovo !== vecchio, 'il secondo richiamo scrive un momento nuovo', String(vecchio) + ' -> ' + String(nuovo));
        const conVecchia = await chiamaConToken('mario', NL.firmaNuovoIncontro('mario', vecchio), { azione: 'nuovo-incontro-leggi' });
        esigi(conVecchia._stato === 403, 'e il collegamento di prima non apre piu', String(conVecchia._stato));
        const conNuova = await chiamaConToken('mario', NL.firmaNuovoIncontro('mario', nuovo), { azione: 'nuovo-incontro-leggi' });
        esigi(conNuova.ok === true, 'mentre quello appena mandato si', JSON.stringify(conNuova.msg || ''));
        /* Una firma senza il momento - quella che si sarebbe scritta prima -
           non deve valere: altrimenti il collegamento vecchio tornerebbe buono
           a chi se lo ricostruisce. */
        const senzaMomento = await chiamaConToken('mario', NL.firmaNuovoIncontro('mario'), { azione: 'nuovo-incontro-leggi' });
        esigi(senzaMomento._stato === 403, 'ne una firma costruita senza il momento');
    });

    await prova('25) La vecchia richiesta a orari esauriti non si presenta come "la Vostra"', async () => {
        /* Presentarla da correggere la farebbe riscrivere da capo: tornerebbe
           ad "aperta" una pratica che lo staff aveva gia' chiuso, e gli
           argomenti e la nota di allora sparirebbero. */
        azzera();
        mettiPersona('mario', 'Mario', 'Rossi');
        dati.set('b2bPrenotazioni/' + EVENTO, { evento: EVENTO, aree: {}, richieste: [
            { doc: 'mario', nome: 'Mario Rossi', area: 'merito-creditizio',
              nota: 'Chiesto a orari esauriti.', quando: 1, stato: 'gestita', gestita: { quando: 2, da: 'staff@revilaw.it' } }
        ] });
        const r = await chiamaNuovo('mario', { azione: 'nuovo-incontro-leggi' });
        esigi(r.ok === true && r.mia === null, 'la pagina non la propone da correggere', JSON.stringify(r.mia));
        await chiamaNuovo('mario', { azione: 'nuovo-incontro-salva', aree: ['esg'] });
        const tutte = richieste();
        /* E LE DUE CONVIVONO. Sono due cose diverse, nate da due pagine diverse
           e per due ragioni diverse: una chiedeva un posto a un tavolo che si
           stava riempiendo, l'altra chiede un appuntamento a convegno finito.
           Prima il doppione si guardava sul solo `doc` e la seconda cancellava
           la prima in silenzio - dichiarandosi pure "correzione", cioe'
           mandando allo studio una mail che diceva di correggere una richiesta
           che nessuno aveva corretto. */
        esigi(tutte.length === 2, 'restano tutte e due, la vecchia e la nuova', String(tutte.length));
        const nuova = tutte.filter(r => r.tipo === 'nuovo-incontro')[0];
        const vecchia = tutte.filter(r => r.tipo !== 'nuovo-incontro')[0];
        esigi(nuova && nuova.stato === 'aperta' && nuova.aree[0] === 'esg', 'quella nuova e aperta',
            JSON.stringify(nuova && nuova.aree));
        esigi(vecchia && vecchia.stato === 'gestita' && /orari esauriti/.test(String(vecchia.nota || '')),
            'e quella di allora resta com era, gestita e con la sua nota', JSON.stringify(vecchia && vecchia.nota));
        esigi(!/orari esauriti/.test(JSON.stringify(nuova)), 'senza trascinarsi dietro niente di quella');
    });

    await prova('26) La correzione si riconosce, e dice da dove viene la persona', async () => {
        azzera();
        mettiPersona('mario', 'Mario', 'Rossi');
        posta.length = 0;
        await chiamaNuovo('mario', { azione: 'nuovo-incontro-salva', aree: ['esg'] });
        esigi(!/CORREZIONE/.test(String(posta[0].text || '')), 'la prima volta non e una correzione');
        esigi(/Nuovo incontro richiesto/.test(String(posta[0].subject || '')), 'e l oggetto lo dice', String(posta[0].subject));
        posta.length = 0;
        orologio += 3600000;
        await chiamaNuovo('mario', { azione: 'nuovo-incontro-salva', aree: ['revisione'] });
        esigi(/CORREZIONE/.test(String(posta[0].text || '')), 'la seconda si', String(posta[0].text || '').slice(0, 90));
        esigi(/corretta/i.test(String(posta[0].subject || '')), 'anche nell oggetto, che e la riga che si legge per prima', String(posta[0].subject));
        /* Senza, tre persone davanti alla stessa casella leggono due mail che
           sembrano due imprese, e due di loro telefonano alla stessa. */
        azzera();
        mettiPersona('lia', 'Lia', 'Blu', { modalita: 'online', b2bInvito: null });
        posta.length = 0;
        await chiamaNuovo('lia', { azione: 'nuovo-incontro-salva', aree: ['esg'] });
        esigi(/ONLINE/.test(String(posta[0].text || '')), 'e di chi ha seguito online si dice che era online',
            String(posta[0].text || '').slice(0, 140));
    });

    await prova('27) Se l avviso non parte resta scritto accanto alla richiesta', async () => {
        /* La pagina ringrazia lo stesso, ed e' giusto: la richiesta e' in
           archivio. Ma senza questa traccia nessuno nello studio saprebbe che
           quella persona ha scritto. */
        azzera();
        mettiPersona('mario', 'Mario', 'Rossi');
        postaRotta = true;
        await chiamaNuovo('mario', { azione: 'nuovo-incontro-salva', aree: ['esg'] });
        const v = richieste()[0];
        esigi(v && v.avviso, 'la richiesta porta l esito dell avviso', JSON.stringify(v && v.avviso));
        esigi(v.avviso.inviata === false, 'che dice che non e partito');
        postaRotta = false;
        orologio += 3600000;
        await chiamaNuovo('mario', { azione: 'nuovo-incontro-salva', aree: ['revisione'] });
        const v2 = richieste()[0];
        esigi(v2.avviso && v2.avviso.inviata === true && (v2.avviso.a || []).length === 3,
            'e quando parte si scrive a chi', JSON.stringify(v2.avviso));
    });

    await prova('28) Chi si e disiscritto non viene richiamato', async () => {
        /* Questa mail propone un incontro a tutta la platea di un convegno, e
           chi ha gia' detto che non vuole piu' nostre comunicazioni ha detto
           proprio questo. */
        azzera();
        mettiDaRichiamare('mario', 'Mario', 'Rossi');
        mettiDaRichiamare('anna', 'Anna', 'Neri');
        dati.set('newsletterDisiscritti/anna@esempio.it', { email: 'anna@esempio.it', quando: 1 });
        posta.length = 0;
        const r = await chiamaPresenze({
            azione: 'invita-nuovo-incontro',
            destinatari: [{ id: 'mario', doc: 'mario' }, { id: 'anna', doc: 'anna' }],
            mail: { oggetto: 'x', html: '<p>{{NUOVO_INCONTRO}}</p>', testo: 'x' }
        });
        esigi(r.inviate === 1, 'parte una mail sola', JSON.stringify(r));
        esigi(r.disiscritti === 1, 'e si dice che uno e disiscritto, invece di farlo sparire', JSON.stringify(r.disiscritti));
        esigi(posta.length === 1 && posta[0].to === 'mario@esempio.it', 'e non e la sua');
    });

    await prova('29) Gli indirizzi gia serviti nei lotti di prima non ricevono due volte', async () => {
        /* `vistiNi` vive dentro una chiamata sola: la finestra spedisce a
           lotti di venticinque, e due schede con la stessa casella finite in
           due lotti diversi riceverebbero due mail. */
        azzera();
        mettiDaRichiamare('uno', 'Uno', 'Rossi');
        mettiDaRichiamare('due', 'Due', 'Rossi', { email: 'uno@esempio.it' });
        posta.length = 0;
        const mail = { oggetto: 'x', html: '<p>{{NUOVO_INCONTRO}}</p>', testo: 'x' };
        const primo = await chiamaPresenze({ azione: 'invita-nuovo-incontro', destinatari: [{ id: 'uno', doc: 'uno' }], mail: mail });
        esigi(primo.inviate === 1 && (primo.serviti || []).length === 1,
            'il primo lotto dice a chi ha scritto', JSON.stringify(primo.serviti));
        const secondo = await chiamaPresenze({
            azione: 'invita-nuovo-incontro', destinatari: [{ id: 'due', doc: 'due' }],
            giaServiti: primo.serviti, mail: mail
        });
        esigi(secondo.inviate === 0 && secondo.giaScritto === 1,
            'e il secondo non riscrive alla stessa casella', JSON.stringify(secondo));
        esigi(posta.length === 1, 'una mail sola in tutto', String(posta.length));
    });

    await prova('30) Non si scrive agli iscritti di un altro convegno', async () => {
        /* Il browser manda gli identificativi: senza questo controllo basta un
           elenco sbagliato per mandare agli iscritti di Milano il collegamento
           di Napoli. */
        azzera();
        mettiDaRichiamare('mario', 'Mario', 'Rossi');
        mettiDaRichiamare('ugo', 'Ugo', 'Verdi', { pagina: 'Milano 26 Febbraio 2027' });
        posta.length = 0;
        const r = await chiamaPresenze({
            azione: 'invita-nuovo-incontro', filtro: 'napoli',
            destinatari: [{ id: 'mario', doc: 'mario' }, { id: 'ugo', doc: 'ugo' }],
            mail: { oggetto: 'x', html: '<p>{{NUOVO_INCONTRO}}</p>', testo: 'x' }
        });
        esigi(r.inviate === 1, 'parte una mail sola', JSON.stringify(r));
        esigi(posta[0].to === 'mario@esempio.it', 'quella di chi era a Napoli');
        esigi(r.senzaScheda === 1, 'e l altro si conta fra gli scartati', JSON.stringify(r.senzaScheda));
    });

    await prova('31) Le mail allo studio hanno un tetto, la richiesta no', async () => {
        /* Il salvataggio si puo' rifare, ed e' giusto. Ma ogni salvataggio
           suona in TRE caselle, e il freno dei salvataggi ne lascia passare
           dodici in dieci minuti: trentasei mail, dove la quarta nessuno la
           legge piu'. Il tetto e' sugli avvisi; la richiesta si registra
           sempre, perche' quella non si perde mai. */
        azzera();
        mettiPersona('dina', 'Dina', 'Gialli');
        const argomenti = ['esg', 'revisione', 'adeguati-assetti', 'finanza-agevolata', 'certificazione-iso'];
        for (let i = 0; i < 5; i++) {
            posta.length = 0;
            const r = await chiamaNuovo('dina', { azione: 'nuovo-incontro-salva', aree: [argomenti[i]] });
            esigi(r.ok === true, 'il salvataggio numero ' + (i + 1) + ' va a buon fine', JSON.stringify(r.msg || ''));
            esigi(posta.length === (i < 3 ? 1 : 0),
                i < 3 ? 'e l avviso parte' : 'e dal quarto l avviso non parte piu', String(posta.length));
        }
        const v = richieste()[0];
        esigi(richieste().length === 1 && v.aree[0] === 'certificazione-iso',
            'in archivio resta l ultima versione', JSON.stringify(v.aree));
        esigi(v.avviso && v.avviso.quante === 3, 'e si sa quanti avvisi sono partiti', JSON.stringify(v.avviso));
        esigi(v.avviso.saltati === 2, 'e quante correzioni sono arrivate senza mail', String(v.avviso.saltati));
        /* Passata la finestra si riparte: non e' un tetto per sempre, e' un
           tetto per dieci minuti. Chi corregge il giorno dopo deve essere
           avvisato come la prima volta. */
        posta.length = 0;
        orologio += 11 * 60 * 1000;
        await chiamaNuovo('dina', { azione: 'nuovo-incontro-salva', aree: ['esg'] });
        esigi(posta.length === 1, 'passata la finestra l avviso torna a partire', String(posta.length));
        esigi(richieste()[0].avviso.quante === 1, 'e il conto riparte da uno', JSON.stringify(richieste()[0].avviso));
        esigi(richieste()[0].avviso.saltati === 0, 'e le correzioni saltate si azzerano con lui');
    });

    await prova('32) Chi resta fuori per il tempo della funzione torna indietro', async () => {
        /* Sessanta schede da leggere e sessanta mail da consegnare superano il
           tempo massimo: la funzione viene troncata e chi ha chiamato non sa
           quali mail sono partite. Il servizio smette per tempo e dice CHI non
           ha servito, cosi' la finestra li rimanda in un altro lotto. */
        azzera();
        ['una', 'due', 'tre', 'quattro'].forEach((n, i) => mettiDaRichiamare(n, 'Nome' + i, 'Cognome' + i));
        posta.length = 0;
        postaLenta = 30000;
        const r = await chiamaPresenze({
            azione: 'invita-nuovo-incontro',
            destinatari: ['una', 'due', 'tre', 'quattro'].map(n => ({ id: n, doc: n })),
            mail: { oggetto: 'x', html: '<p>{{NUOVO_INCONTRO}}</p>', testo: 'x' }
        });
        postaLenta = 0;
        esigi(r.inviate === 2, 'si spedisce finche c e tempo', JSON.stringify(r));
        esigi(r.rimasti === 2, 'e si dice quanti sono rimasti fuori', String(r.rimasti));
        esigi((r.daRifare || []).join(',') === 'tre,quattro', 'e si dice QUALI', JSON.stringify(r.daRifare));
        /* A chi e' rimasto fuori non si scrive niente sulla scheda: altrimenti
           al secondo giro si conterebbe fra i "gia' richiamati" e la mail non
           gli arriverebbe mai. */
        esigi(!scheda('tre').nuovoIncontroInvito, 'e chi non e stato servito resta da richiamare');
        const secondo = await chiamaPresenze({
            azione: 'invita-nuovo-incontro', giaServiti: r.serviti,
            destinatari: (r.daRifare || []).map(n => ({ id: n, doc: n })),
            mail: { oggetto: 'x', html: '<p>{{NUOVO_INCONTRO}}</p>', testo: 'x' }
        });
        esigi(secondo.inviate === 2 && !secondo.rimasti, 'e il lotto dopo li serve tutti', JSON.stringify(secondo));
        esigi(posta.length === 4, 'quattro persone, quattro mail', String(posta.length));
    });

    await prova('33) Il taglio del tempo non scatta mai sul primo', async () => {
        /* Una chiamata che non spedisce niente e risponde "riprova" e' un giro
           a vuoto: la finestra la rimanderebbe identica, e con un server di
           posta lento il richiamo non partirebbe mai. */
        azzera();
        mettiDaRichiamare('solo', 'Solo', 'Rossi');
        mettiDaRichiamare('dopo', 'Dopo', 'Rossi');
        posta.length = 0;
        postaLenta = 120000;
        const r = await chiamaPresenze({
            azione: 'invita-nuovo-incontro',
            destinatari: [{ id: 'solo', doc: 'solo' }, { id: 'dopo', doc: 'dopo' }],
            mail: { oggetto: 'x', html: '<p>{{NUOVO_INCONTRO}}</p>', testo: 'x' }
        });
        postaLenta = 0;
        esigi(r.inviate === 1, 'la prima parte comunque', JSON.stringify(r));
        esigi(r.rimasti === 1, 'e la seconda aspetta il lotto dopo', String(r.rimasti));
    });

    await prova('34) Chi manda riceve una copia di OGNI mail, non una per lotto', async () => {
        /* La copia nascosta e' la prova, per chi preme, di che cosa e' partito
           e a chi. Partiva solo sulla prima mail spedita della chiamata, e la
           finestra manda a lotti di venticinque: su settanta destinatari ne
           arrivavano tre. Peggio, il numero dipendeva dalle cose sbagliate -
           da quanti lotti, e dal fatto che il server di posta fosse lento, che
           spezza un lotto in due e fa arrivare una copia in piu'. Chi guarda la
           casella non aveva modo di sapere quante dovessero essere. */
        azzera();
        const nomi = [];
        for (let i = 0; i < 6; i++) { nomi.push('p' + i); mettiDaRichiamare('p' + i, 'Nome' + i, 'Cognome' + i); }
        posta.length = 0;
        const r = await chiamaPresenze({
            azione: 'invita-nuovo-incontro',
            destinatari: nomi.map(n => ({ id: n, doc: n })),
            mail: { oggetto: 'x', html: '<p>{{NUOVO_INCONTRO}}</p>', testo: 'x' }
        });
        esigi(r.inviate === 6, 'sei mail partite', JSON.stringify(r.inviate));
        const conCopia = posta.filter(m => m.bcc && m.bcc.length);
        esigi(conCopia.length === 6, 'e sei copie a chi ha premuto, una per mail', String(conCopia.length));
        esigi(conCopia.every(m => m.bcc.indexOf('staff@revilaw.it') >= 0),
            'tutte al suo indirizzo', JSON.stringify((conCopia[0] || {}).bcc));
        /* E in un secondo lotto, che e' una chiamata nuova, le copie non
           ricominciano a contare da capo: ce n'e' una per mail anche li'. */
        posta.length = 0;
        mettiDaRichiamare('q1', 'Altro', 'Uno');
        mettiDaRichiamare('q2', 'Altro', 'Due');
        await chiamaPresenze({
            azione: 'invita-nuovo-incontro', giaServiti: r.serviti,
            destinatari: [{ id: 'q1', doc: 'q1' }, { id: 'q2', doc: 'q2' }],
            mail: { oggetto: 'x', html: '<p>{{NUOVO_INCONTRO}}</p>', testo: 'x' }
        });
        esigi(posta.filter(m => m.bcc && m.bcc.length).length === 2,
            'anche nel lotto dopo, una copia per mail', String(posta.length));
    });

    await prova('35) Se chi manda e anche fra i destinatari, gli altri la copia la ricevono lo stesso', async () => {
        /* Chi iscrive se stesso non deve ricevere due volte la stessa mail, e
           infatti dalla propria copia si toglie. Ma prima quel messaggio
           bruciava lo slot dell'intero lotto: la copia era "la prima spedita",
           la prima spedita era la sua, se la toglieva, e tutte le altre
           partivano senza che nessuno ne sapesse niente. */
        azzera();
        mettiDaRichiamare('io', 'Chi', 'Manda', { email: 'staff@revilaw.it' });
        mettiDaRichiamare('altro1', 'Altro', 'Uno');
        mettiDaRichiamare('altro2', 'Altro', 'Due');
        posta.length = 0;
        const r = await chiamaPresenze({
            azione: 'invita-nuovo-incontro',
            destinatari: [{ id: 'io', doc: 'io' }, { id: 'altro1', doc: 'altro1' }, { id: 'altro2', doc: 'altro2' }],
            mail: { oggetto: 'x', html: '<p>{{NUOVO_INCONTRO}}</p>', testo: 'x' }
        });
        esigi(r.inviate === 3, 'partono tutte e tre', JSON.stringify(r.inviate));
        const mia = posta.filter(m => m.to === 'staff@revilaw.it')[0];
        esigi(mia && !mia.bcc, 'a se stesso non si manda anche la copia', JSON.stringify(mia && mia.bcc));
        const altre = posta.filter(m => m.to !== 'staff@revilaw.it');
        esigi(altre.length === 2 && altre.every(m => m.bcc && m.bcc.indexOf('staff@revilaw.it') >= 0),
            'ma delle altre due la copia arriva', JSON.stringify(altre.map(m => m.bcc)));
    });

    await prova('36) Un indirizzo che il server di posta rifiuta non sparisce in silenzio', async () => {
        /* Un indirizzo scartato non fa sollevare niente: la mail "parte" e il
           riassunto dice che e' andato tutto bene. Qui conta doppio, perche'
           fra i rifiutati puo' esserci l'indirizzo in COPIA: chi manda
           resterebbe senza la prova di un invio che gli e' stato dichiarato
           riuscito, e non avrebbe modo di saperlo. */
        azzera();
        mettiDaRichiamare('uno', 'Uno', 'Rossi');
        mettiDaRichiamare('due', 'Due', 'Rossi');
        postaRifiuta = ['staff@revilaw.it'];
        posta.length = 0;
        const r = await chiamaPresenze({
            azione: 'invita-nuovo-incontro',
            destinatari: [{ id: 'uno', doc: 'uno' }, { id: 'due', doc: 'due' }],
            mail: { oggetto: 'x', html: '<p>{{NUOVO_INCONTRO}}</p>', testo: 'x' }
        });
        esigi(r.inviate === 2, 'le mail ai destinatari partono lo stesso', JSON.stringify(r.inviate));
        esigi((r.falliti || []).length === 2, 'e si dice che la copia non e stata accettata', JSON.stringify(r.falliti));
        esigi((r.falliti || []).every(f => f.email === 'staff@revilaw.it'), 'con l indirizzo e il motivo',
            JSON.stringify(r.falliti));
        /* E se a essere rifiutato e' il DESTINATARIO, quella mail non si conta
           fra le inviate e la scheda non prende il timbro: altrimenti al giro
           dopo risulterebbe "gia' richiamato" senza averla mai ricevuta. */
        azzera();
        mettiDaRichiamare('tre', 'Tre', 'Rossi', { email: 'rotta@esempio.it' });
        mettiDaRichiamare('quattro', 'Quattro', 'Rossi');
        postaRifiuta = ['rotta@esempio.it'];
        const r2 = await chiamaPresenze({
            azione: 'invita-nuovo-incontro',
            destinatari: [{ id: 'tre', doc: 'tre' }, { id: 'quattro', doc: 'quattro' }],
            mail: { oggetto: 'x', html: '<p>{{NUOVO_INCONTRO}}</p>', testo: 'x' }
        });
        esigi(r2.inviate === 1, 'si conta solo quella arrivata', JSON.stringify(r2.inviate));
        esigi(!scheda('tre').nuovoIncontroInvito, 'e chi non l ha ricevuta resta da richiamare');
        esigi(!!scheda('quattro').nuovoIncontroInvito, 'mentre l altro ha il suo timbro');
    });

    await prova('37) "Togli" non cancella il fatto che quella persona abbia scritto', async () => {
        /* Sparire dall'elenco e sparire dall'archivio sono due cose diverse.
           Da quando l'area dice anche chi ha risposto al richiamo e chi no, una
           voce cancellata farebbe ricomparire fra i silenziosi qualcuno che
           aveva risposto - e gli si riscriverebbe. */
        azzera();
        mettiPersona('mario', 'Mario', 'Rossi');
        await chiamaNuovo('mario', { azione: 'nuovo-incontro-salva', aree: ['esg'], nota: 'Due banche.' });
        esigi(richieste().length === 1, 'la richiesta c e');
        const r = await chiamaPresenze({ sezione: 'b2b', azione: 'agenda-richiesta', doc: 'mario', stato: 'tolta' });
        esigi(r._stato === 200 && r.ok, 'si toglie dall elenco', JSON.stringify(r.msg || ''));
        const dopo = richieste();
        esigi(dopo.length === 1, 'ma in archivio resta', String(dopo.length));
        esigi(dopo[0].stato === 'tolta', 'marcata come tolta', JSON.stringify(dopo[0].stato));
        esigi(dopo[0].tipo === 'nuovo-incontro' && /Due banche/.test(String(dopo[0].nota || '')),
            'con quello che quella persona aveva scritto');
        /* E il riepilogo non la conta fra quelle da guardare: per chi lavora la
           giornata non esiste piu'. */
        const rip = await chiamaPresenze({ sezione: 'b2b', azione: 'riepilogo' });
        esigi((rip.conti || {}).richiesteAperte === 0, 'e non si conta piu fra le aperte',
            JSON.stringify((rip.conti || {}).richiesteAperte));
    });

    console.log('\n' + ok + ' ok, ' + ko + ' KO');
    process.exit(ko ? 1 : 0);
})().catch(e => { console.error('Errore nelle prove:', e); process.exit(1); });
