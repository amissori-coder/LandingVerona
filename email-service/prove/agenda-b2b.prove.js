/* ============================================================
   PROVE - lib/agenda-b2b.js e la prenotazione a slot
   ------------------------------------------------------------
       node prove/agenda-b2b.prove.js

   Niente da installare: Firestore, il server di posta e l'orologio
   sono finti e stanno qui dentro. Esce con 1 se qualcosa e' rosso.

   COSA DIMOSTRANO. Gli incontri B2B sono APPUNTAMENTI, e un
   appuntamento e' una cosa che o e' tua o e' di un altro. Qui si
   verifica proprio quello:

     - la giornata si divide come e' stata scritta, e la PAUSA
       PRANZO non produce appuntamenti (dalle 10 alle 18 con
       mezz'ora ciascuno e un'ora di pausa fanno 14 orari);
     - DUE OSPITI SULLO STESSO ORARIO: il secondo si sente dire
       che non c'e' piu', e l'orario resta di chi e' arrivato
       prima. E' la ragione per cui il conto lo tiene il servizio
       dentro una transazione, e non il browser;
     - UN SOLO ORARIO A TESTA: chi cambia idea sposta la sua
       prenotazione, non ne tiene due;
     - un orario CHIUSO (il referente e' sul palco) l'ospite non
       lo puo' prendere; lo staff si', perche' forzare e' una
       decisione, non un errore;
     - un tavolo che non e' nel suo invito non lo puo' prenotare,
       nemmeno chiamando il servizio a mano con il collegamento
       firmato in mano;
     - a orari ESAURITI la richiesta fuori slot si registra e
       avvisa chi ha mandato l'invito; se un orario libero c'e'
       ancora, la richiesta viene respinta (si prenota, non si
       chiede);
     - chi prenota riceve la mail con il FOGLIO PER IL DESK in
       allegato, e sulla sua scheda resta scritto l'appuntamento;
     - chi e' stato invitato con il modulo VECCHIO (a caselle)
       continua a vedere quello: la pagina non cambia le regole
       sotto i piedi di chi ha gia' la mail in casella;
     - UN ORARIO PRENOTATO NON SI TOCCA: chi organizza non puo'
       chiuderlo, non puo' spegnere quel tavolo e non puo'
       cambiare la durata della giornata se cosi' quell'orario
       sparirebbe. Dall'altra parte c'e' un'impresa con in mano
       un foglio che dice ora, tavolo e nome. Si blocca il
       CAMBIAMENTO e non lo stato: un orario prenotato che era
       gia' chiuso non trasforma quel tavolo in un pezzo di
       agenda che non si puo' piu' salvare.
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
        eventoDati: { titolo: 'Napoli', quando: '2 ottobre 2026', luogo: 'Hotel Eurostars Excelsior', indirizzo: 'Via Partenope 48' },
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

(async () => {

    await prova('1) La giornata: la pausa pranzo non produce appuntamenti', async () => {
        const s = AGENDA.slotDellaGiornata(GIORNATA);
        esigi(s.length === 14, 'dalle 10 alle 18, mezz\'ora ciascuno, un\'ora di pausa: 14 orari (trovati ' + s.length + ')');
        esigi(!s.some(x => x.ora === '13:00' || x.ora === '13:30'), 'nessun appuntamento durante la pausa');
        esigi(s[0].ora === '10:00' && s[s.length - 1].fine === '18:00', 'si comincia alle 10:00 e si finisce alle 18:00');
        const lunghi = AGENDA.slotDellaGiornata({ inizio: '10:00', fine: '18:00', pranzoDa: '13:00', pranzoA: '14:30', durata: 45 });
        esigi(lunghi.length === 8 && lunghi.map(x => x.ora).indexOf('12:15') >= 0,
            'con 45 minuti e pausa 13:00-14:30 restano 8 orari, l\'ultimo della mattina alle 12:15');
        const storta = AGENDA.normalizzaGiornata({ inizio: '18:00', fine: '10:00', durata: 20 });
        esigi(storta.inizio === '10:00' && storta.fine === '17:00' && storta.durata === 20,
            'una giornata che finisce prima di cominciare torna agli orari di partenza (10-17)');
        esigi(storta.pranzoDa === '13:30' && storta.pranzoA === '14:30',
            'e alla pausa pranzo del convegno');
    });

    await prova('2) Quello che vede chi ha ricevuto l\'invito', async () => {
        azzera();
        mettiAgenda({
            'merito-creditizio': { referenti: [{ nome: 'Anna Verdi', ruolo: 'Revisore legale', email: 'anna@revilaw.it' }], chiusi: ['1100'] },
            'esg': { referenti: [{ nome: 'Luca Bianchi' }] },
            'revisione': { attiva: false }
        });
        mettiInvitato('mario', 'Mario', ['merito-creditizio']);
        const r = await chiama('mario', { azione: 'b2b-leggi' });
        esigi(r.ok && r.modo === 'slot', 'la pagina si apre in modalita orari');
        esigi(r.aree.length === 1 && r.aree[0].id === 'merito-creditizio', 'vede solo il tavolo del suo invito');
        esigi(r.aree[0].referenti.length === 1 && r.aree[0].referenti[0].nome === 'Anna Verdi', 'sa chi trovera al tavolo');
        esigi(r.aree[0].referenti[0].email === undefined, 'del referente non si da l\'indirizzo email');
        const alle11 = r.aree[0].slot.filter(s => s.ora === '11:00')[0];
        esigi(alle11 && alle11.stato === 'chiuso', 'l\'orario chiuso si vede come non disponibile');
        esigi(r.aree[0].liberi === 13, 'restano 13 orari liberi su 14');
        esigi(!r.esaurito && !r.mio, 'niente da esaurire e nessun appuntamento gia preso');
    });

    await prova('3) Prenota: l\'orario e suo, la mail parte con il foglio per il desk', async () => {
        azzera();
        mettiAgenda({ 'merito-creditizio': { referenti: [{ nome: 'Anna Verdi', ruolo: 'Revisore legale' }] } });
        mettiInvitato('mario', 'Mario', ['merito-creditizio']);
        const r = await chiama('mario', { azione: 'b2b-slot-prenota', area: 'merito-creditizio', ora: '10:30', nota: 'Vorremmo parlare di garanzie.' });
        esigi(r.ok && r.ora === '10:30' && r.fine === '11:00', 'la prenotazione torna con l\'orario preso');
        esigi(!!slotDi('merito-creditizio', '10:30'), 'l\'orario risulta impegnato nell\'agenda');
        const s = scheda('mario');
        esigi(s.b2bAppuntamento && s.b2bAppuntamento.ora === '10:30' && s.b2bAppuntamento.area === 'merito-creditizio',
            'sulla scheda resta scritto l\'appuntamento');
        esigi(Array.isArray(s.b2bScelte) && s.b2bScelte[0] === 'Merito creditizio', 'la colonna "B2B prenotati" resta allineata');
        esigi(s.extra && s.extra['Nota B2B'] === 'Vorremmo parlare di garanzie.', 'la nota finisce sulla scheda');
        esigi(r.mailInviata && posta.length === 1 && posta[0].to === 'mario@esempio.it', 'la conferma parte a chi ha prenotato');
        const allegato = (posta[0].attachments || [])[0];
        esigi(!!allegato && /^%PDF/.test(String(allegato.content.slice(0, 4))), 'in allegato c\'e il foglio in PDF');
        esigi(/10:30/.test(posta[0].html) && /Anna Verdi/.test(posta[0].html), 'la mail dice l\'ora e chi tiene il tavolo');
    });

    await prova('4) Due ospiti sullo stesso orario: uno solo lo prende', async () => {
        azzera();
        mettiAgenda({ 'merito-creditizio': {} });
        mettiInvitato('mario', 'Mario', ['merito-creditizio']);
        mettiInvitato('anna', 'Anna', ['merito-creditizio']);
        const [a, b] = await Promise.all([
            chiama('mario', { azione: 'b2b-slot-prenota', area: 'merito-creditizio', ora: '10:00' }),
            chiama('anna', { azione: 'b2b-slot-prenota', area: 'merito-creditizio', ora: '10:00' })
        ]);
        const riusciti = [a, b].filter(x => x.ok);
        const respinti = [a, b].filter(x => !x.ok);
        esigi(riusciti.length === 1 && respinti.length === 1, 'passa una prenotazione sola');
        esigi(respinti[0].motivo === 'occupato', 'all\'altro si dice che l\'orario e stato appena preso');
        const preso = slotDi('merito-creditizio', '10:00');
        esigi(preso && (preso.doc === 'mario' || preso.doc === 'anna'), 'l\'orario resta di chi e arrivato prima');
        const perdente = preso.doc === 'mario' ? 'anna' : 'mario';
        esigi(!scheda(perdente).b2bAppuntamento, 'a chi non l\'ha preso non resta scritto nessun appuntamento');
    });

    await prova('5) Un solo orario a testa: cambiare idea sposta, non aggiunge', async () => {
        azzera();
        mettiAgenda({ 'merito-creditizio': {}, 'esg': {} });
        mettiInvitato('mario', 'Mario', ['merito-creditizio', 'esg']);
        await chiama('mario', { azione: 'b2b-slot-prenota', area: 'merito-creditizio', ora: '10:00' });
        const r = await chiama('mario', { azione: 'b2b-slot-prenota', area: 'esg', ora: '15:00' });
        esigi(r.ok && r.area === 'esg', 'la seconda scelta passa');
        esigi(!slotDi('merito-creditizio', '10:00'), 'il primo orario torna libero');
        esigi(!!slotDi('esg', '15:00'), 'il nuovo orario risulta preso');
        esigi(scheda('mario').b2bAppuntamento.area === 'esg', 'sulla scheda resta solo l\'ultimo');
        esigi(posta.length === 2, 'ogni cambio manda un foglio nuovo');
        const letto = await chiama('mario', { azione: 'b2b-leggi' });
        const mio = letto.aree.filter(a => a.id === 'esg')[0].slot.filter(s => s.ora === '15:00')[0];
        esigi(mio.stato === 'mio', 'riaprendo la pagina il suo orario si riconosce');
        const altrui = letto.aree.filter(a => a.id === 'merito-creditizio')[0].slot.filter(s => s.ora === '10:00')[0];
        esigi(altrui.stato === 'libero', 'e quello lasciato e di nuovo libero');
    });

    await prova('6) Quello che l\'ospite non puo\' fare', async () => {
        azzera();
        mettiAgenda({
            'merito-creditizio': { chiusi: ['1100'] },
            'esg': { attiva: false },
            'bagnoli': {}
        });
        mettiInvitato('mario', 'Mario', ['merito-creditizio', 'esg']);
        const chiuso = await chiama('mario', { azione: 'b2b-slot-prenota', area: 'merito-creditizio', ora: '11:00' });
        esigi(!chiuso.ok && chiuso.motivo === 'chiuso', 'un orario chiuso non si prenota');
        const spento = await chiama('mario', { azione: 'b2b-slot-prenota', area: 'esg', ora: '10:00' });
        esigi(!spento.ok && spento.motivo === 'area', 'un tavolo non attivo non si prenota');
        const altrui = await chiama('mario', { azione: 'b2b-slot-prenota', area: 'bagnoli', ora: '10:00' });
        esigi(!altrui.ok && /non e fra quelli del Suo invito/.test(altrui.msg || ''), 'un tavolo fuori invito viene respinto');
        const inventato = await chiama('mario', { azione: 'b2b-slot-prenota', area: 'merito-creditizio', ora: '09:15' });
        esigi(!inventato.ok && inventato.motivo === 'orario', 'un orario che non esiste viene respinto');
        const res = {
            _s: 0, _j: null, setHeader() { }, status(n) { this._s = n; return this; },
            json(o) { this._j = o; return this; }, end() { return this; }
        };
        await iscrizione({ method: 'POST', headers: {}, body: { d: 'mario', t: 'firma-sbagliata', azione: 'b2b-leggi' } }, res);
        esigi(res._s === 403, 'senza firma valida il servizio non risponde nulla');
    });

    await prova('7) Orari esauriti: si puo\' chiedere un incontro lo stesso', async () => {
        azzera();
        // un tavolo con due soli orari: si riempie in fretta
        mettiAgenda({ 'merito-creditizio': { referenti: [{ nome: 'Anna Verdi' }] } },
            { inizio: '10:00', fine: '11:00', pranzoDa: '', pranzoA: '', durata: 30 });
        mettiInvitato('mario', 'Mario', ['merito-creditizio']);
        mettiInvitato('anna', 'Anna', ['merito-creditizio']);
        mettiInvitato('ugo', 'Ugo', ['merito-creditizio']);
        const presto = await chiama('ugo', { azione: 'b2b-slot-richiedi', area: 'merito-creditizio', nota: 'mi interessa' });
        esigi(!presto.ok && /ancora qualche orario libero/.test(presto.msg || ''), 'finche c\'e posto si prenota, non si chiede');
        await chiama('mario', { azione: 'b2b-slot-prenota', area: 'merito-creditizio', ora: '10:00' });
        await chiama('anna', { azione: 'b2b-slot-prenota', area: 'merito-creditizio', ora: '10:30' });
        const letto = await chiama('ugo', { azione: 'b2b-leggi' });
        esigi(letto.esaurito === true, 'per il terzo la pagina dice esaurito');
        posta.length = 0;
        const r = await chiama('ugo', { azione: 'b2b-slot-richiedi', area: 'merito-creditizio', nota: 'Siamo in trattativa con la banca.' });
        esigi(r.ok && r.avvisato, 'la richiesta si registra e avvisa chi ha mandato l\'invito');
        esigi(posta.length === 1 && posta[0].to === 'staff@revilaw.it', 'l\'avviso va a chi ha firmato l\'invito');
        esigi(/Siamo in trattativa/.test(posta[0].text || ''), 'nell\'avviso c\'e quello che ha scritto');
        const rich = prenotazioni().richieste || [];
        esigi(rich.length === 1 && rich[0].doc === 'ugo' && rich[0].stato === 'aperta', 'la richiesta resta in elenco, aperta');
        const ancora = await chiama('ugo', { azione: 'b2b-leggi' });
        esigi(!!ancora.richiesta, 'riaprendo la pagina, sa che la richiesta e gia partita');
        esigi(!slotDi('merito-creditizio', '10:00') || slotDi('merito-creditizio', '10:00').doc === 'mario',
            'la richiesta non ruba il posto a nessuno');
    });

    await prova('8) Lo staff: forza un orario chiuso e chiude la richiesta', async () => {
        azzera();
        mettiAgenda({ 'merito-creditizio': { referenti: [{ nome: 'Anna Verdi' }], chiusi: ['1100'] } },
            { inizio: '10:00', fine: '11:30', pranzoDa: '', pranzoA: '', durata: 30 });
        mettiInvitato('mario', 'Mario', ['merito-creditizio']);
        mettiInvitato('anna', 'Anna', ['merito-creditizio']);
        mettiInvitato('ugo', 'Ugo', ['merito-creditizio']);
        await chiama('mario', { azione: 'b2b-slot-prenota', area: 'merito-creditizio', ora: '10:00' });
        await chiama('anna', { azione: 'b2b-slot-prenota', area: 'merito-creditizio', ora: '10:30' });
        await chiama('ugo', { azione: 'b2b-slot-richiedi', area: 'merito-creditizio', nota: 'per favore' });
        posta.length = 0;
        const r = await staff({ azione: 'agenda-assegna', doc: 'ugo', area: 'merito-creditizio', ora: '11:00' });
        esigi(r.stato === 200 && r.corpo.ok, 'lo staff assegna anche un orario chiuso');
        esigi(r.corpo.mailInviata && posta.length === 1 && posta[0].to === 'ugo@esempio.it', 'chi riceve l\'orario riceve anche il foglio');
        esigi(scheda('ugo').b2bAppuntamento.ora === '11:00', 'l\'appuntamento e scritto sulla sua scheda');
        esigi((prenotazioni().richieste || []).length === 0, 'la richiesta si chiude da se: ora un orario ce l\'ha');
        const negato = await staff({ azione: 'agenda-assegna', doc: 'ugo', area: 'merito-creditizio', ora: '11:00' }, false);
        esigi(negato.stato === 403, 'chi non manda gli inviti non assegna orari');
    });

    await prova('9) Lo staff: libera un orario e l\'elenco torna pulito', async () => {
        azzera();
        mettiAgenda({ 'merito-creditizio': {} });
        mettiInvitato('mario', 'Mario', ['merito-creditizio']);
        await chiama('mario', { azione: 'b2b-slot-prenota', area: 'merito-creditizio', ora: '10:00' });
        posta.length = 0;
        const r = await staff({ azione: 'agenda-libera', doc: 'mario' });
        esigi(r.stato === 200 && r.corpo.ok, 'l\'orario si libera');
        esigi(!slotDi('merito-creditizio', '10:00'), 'l\'orario torna disponibile');
        esigi(!scheda('mario').b2bAppuntamento && (scheda('mario').b2bScelte || []).length === 0,
            'sulla scheda non resta un appuntamento che non c\'e piu');
        esigi(posta.length === 0, 'non parte nessuna mail: e un gesto che si fa dopo aver parlato con l\'impresa');
    });

    await prova('10) La configurazione salvata dall\'area riservata', async () => {
        azzera();
        mettiAgenda({ 'merito-creditizio': { chiusi: ['1100'] } });
        /* Con incontri da 45 minuti gli orari cadono alle 10:00, 10:45, 11:30...:
           le 11:00 non esistono piu', e la chiusura che le riguardava deve
           sparire. Se restasse, toglierebbe un posto che nessuno vede dove. */
        const r = await staff({
            azione: 'agenda-salva',
            giornata: { inizio: '10:00', fine: '18:00', pranzoDa: '13:00', pranzoA: '14:00', durata: 45 },
            eventoDati: { titolo: 'Napoli', quando: '2 ottobre 2026' }
        });
        esigi(r.stato === 200 && r.corpo.ok, 'la giornata si salva');
        const area = r.corpo.aree.filter(a => a.id === 'merito-creditizio')[0];
        esigi(area.slot.length === 8, 'con 45 minuti per incontro restano 8 appuntamenti');
        esigi(area.chiusi.length === 0, 'l\'orario chiuso delle 11:00, che con questa durata non esiste piu, sparisce');
        const conRef = await staff({
            azione: 'agenda-salva',
            aree: {
                'desk-revilaw': {
                    attiva: true, nota: 'Sala 2',
                    referenti: [{ nome: 'Anna Verdi', ruolo: 'Revisore', sezione: 'aderenti', email: 'ANNA@revilaw.it' }],
                    chiusi: ['1215']
                },
                'tavolo-inventato': { attiva: true }
            }
        });
        const desk = conRef.corpo.aree.filter(a => a.id === 'desk-revilaw')[0];
        esigi(desk.attiva && desk.referenti[0].email === 'anna@revilaw.it' && desk.nota === 'Sala 2',
            'il tavolo del desk Revilaw si salva con il suo referente');
        esigi(desk.chiusi.length === 1 && desk.chiusi[0] === '1215', 'l\'orario chiuso resta');
        esigi(conRef.corpo.aree.length === AGENDA.AREE_B2B.length,
            'i tavoli restano quelli dell\'elenco: quello inventato non entra');
        esigi(conRef.corpo.aree.filter(a => a.id === 'merito-creditizio')[0].slot.length === 8,
            'salvare un tavolo non tocca la giornata degli altri');
    });

    await prova('11) L\'invito vecchio, a caselle, continua a funzionare', async () => {
        azzera();
        mettiAgenda({ 'merito-creditizio': {} });
        dati.set('iscrizioni/vecchio', {
            pagina: 'Napoli 2 Ottobre 2026', data: '01/09/2026 10:00:00',
            nome: 'Carlo', cognome: 'Neri', email: 'carlo@esempio.it', azienda: 'Beta',
            b2bInvito: { quando: orologio, da: 'staff@revilaw.it', orari: { 'Merito creditizio': 'dalle 14:30 alle 15:15' } }
        });
        const r = await chiama('vecchio', { azione: 'b2b-leggi' });
        esigi(r.ok && r.modo !== 'slot', 'chi ha l\'invito vecchio vede la pagina a caselle');
        esigi(Array.isArray(r.temi) && r.temi.length === AGENDA.AREE_B2B.length,
            'gli argomenti sono tutti quelli dell\'elenco, nel loro ordine');
        esigi(r.orari[0] === 'dalle 14:30 alle 15:15', 'l\'orario del suo invito e ancora quello');
        const slot = await chiama('vecchio', { azione: 'b2b-slot-prenota', area: 'merito-creditizio', ora: '10:00' });
        esigi(!slot.ok, 'con l\'invito vecchio non si prenota uno slot');
        const salva = await chiama('vecchio', { azione: 'b2b-salva', temi: [0], nota: '' });
        esigi(salva.ok, 'la prenotazione a caselle passa come prima');
    });

    await prova('12) La mail non parte: la prenotazione resta comunque', async () => {
        azzera();
        mettiAgenda({ 'merito-creditizio': {} });
        mettiInvitato('mario', 'Mario', ['merito-creditizio']);
        postaRotta = true;
        const r = await chiama('mario', { azione: 'b2b-slot-prenota', area: 'merito-creditizio', ora: '10:00' });
        esigi(r.ok && r.mailInviata === false, 'la pagina lo dice: prenotato, ma la mail non e partita');
        esigi(!!slotDi('merito-creditizio', '10:00'), 'l\'orario resta suo: perderlo sarebbe il danno peggiore');
    });

    await prova('13) Un orario prenotato non si tocca piu\'', async () => {
        azzera();
        mettiAgenda({ 'merito-creditizio': { referenti: [{ nome: 'Anna Verdi' }] }, 'esg': {} });
        mettiInvitato('mario', 'Mario', ['merito-creditizio']);
        const preso = await chiama('mario', { azione: 'b2b-slot-prenota', area: 'merito-creditizio', ora: '11:00' });
        esigi(preso.ok, 'Mario ha il suo appuntamento delle 11:00');

        // chiudere l'orario di qualcuno
        const chiudi = await staff({
            azione: 'agenda-salva',
            aree: { 'merito-creditizio': { attiva: true, nota: '', chiusi: ['1100'], referenti: [{ nome: 'Anna Verdi' }] } }
        });
        esigi(chiudi.stato === 409 && !chiudi.corpo.ok, 'chiudere le 11:00 viene rifiutato');
        esigi(/11:00/.test(chiudi.corpo.msg) && /Merito creditizio/.test(chiudi.corpo.msg) && /Mario/.test(chiudi.corpo.msg),
            'e il rifiuto dice quale orario, quale tavolo e chi ci sarebbe: ' + chiudi.corpo.msg.slice(0, 90));
        esigi(!!slotDi('merito-creditizio', '11:00'), 'la prenotazione e rimasta dov\'era');

        // un orario LIBERO dello stesso tavolo si chiude come sempre
        const altro = await staff({
            azione: 'agenda-salva',
            aree: { 'merito-creditizio': { attiva: true, nota: '', chiusi: ['1130'], referenti: [{ nome: 'Anna Verdi' }] } }
        });
        esigi(altro.stato === 200 && altro.corpo.ok, 'chiudere le 11:30, che e libero, si puo ancora');
        const area = altro.corpo.aree.filter(a => a.id === 'merito-creditizio')[0];
        esigi(area.slot.filter(x => x.chiave === '1130')[0].stato === 'chiuso', 'e si vede chiuso');

        // spegnere il tavolo di chi ha prenotato
        const spegni = await staff({
            azione: 'agenda-salva',
            aree: { 'merito-creditizio': { attiva: false, nota: '', chiusi: [], referenti: [] } }
        });
        esigi(spegni.stato === 409 && /Merito creditizio/.test(spegni.corpo.msg),
            'spegnere il tavolo con una prenotazione dentro viene rifiutato');
        const spegniAltro = await staff({
            azione: 'agenda-salva', aree: { 'esg': { attiva: false, nota: '', chiusi: [], referenti: [] } }
        });
        esigi(spegniAltro.stato === 200, 'un tavolo senza prenotazioni si spegne come prima');

        // cambiare la forma della giornata sotto i piedi di chi ha un appuntamento
        const durata = await staff({
            azione: 'agenda-salva',
            giornata: { inizio: '10:00', fine: '18:00', pranzoDa: '13:00', pranzoA: '14:00', durata: 45 }
        });
        esigi(durata.stato === 409 && /11:00/.test(durata.corpo.msg),
            'con 45 minuti le 11:00 non esisterebbero piu: la modifica viene rifiutata');
        esigi(/libera la prenotazione/.test(durata.corpo.msg), 'e dice cosa fare prima');

        // liberato l'orario, la stessa modifica passa
        const libera = await staff({ azione: 'agenda-libera', doc: 'mario' });
        esigi(libera.stato === 200 && libera.corpo.ok, 'si libera l\'orario di Mario');
        const ora = await staff({
            azione: 'agenda-salva',
            giornata: { inizio: '10:00', fine: '18:00', pranzoDa: '13:00', pranzoA: '14:00', durata: 45 }
        });
        esigi(ora.stato === 200 && ora.corpo.ok, 'adesso la durata si cambia');
    });

    await prova('14) Si blocca il cambiamento, non lo stato', async () => {
        azzera();
        mettiAgenda({ 'merito-creditizio': { referenti: [{ nome: 'Anna Verdi' }], chiusi: ['1100'] } });
        mettiInvitato('elena', 'Elena', ['merito-creditizio']);
        /* Un posto assegnato d'ufficio su un orario CHIUSO: la chiusura c'era
           gia', e non deve diventare un lucchetto sul tavolo intero. */
        const dato = await staff({ azione: 'agenda-assegna', doc: 'elena', area: 'merito-creditizio', ora: '11:00' });
        esigi(dato.stato === 200 && dato.corpo.ok, 'lo staff assegna le 11:00, che erano chiuse');
        const nota = await staff({
            azione: 'agenda-salva',
            aree: { 'merito-creditizio': { attiva: true, nota: 'Sala 3', chiusi: ['1100'], referenti: [{ nome: 'Anna Verdi' }] } }
        });
        esigi(nota.stato === 200 && nota.corpo.ok, 'quel tavolo si salva lo stesso: la chiusura non e nuova');
        esigi(nota.corpo.aree.filter(a => a.id === 'merito-creditizio')[0].nota === 'Sala 3', 'e la nota e passata');
    });

    await prova('15) Chi tiene il tavolo e sul palco: quegli orari si chiudono da se', async () => {
        azzera();
        const anna = { nome: 'Anna Verdi', email: 'anna@revilaw.it' };
        mettiAgenda({
            'merito-creditizio': { referenti: [anna] },
            // il secondo tavolo dello stesso argomento, tenuto da un altro:
            // e' il motivo per cui i tavoli doppi sono due tavoli
            'modello-231-b': { referenti: [{ nome: 'Luca Bianchi', email: 'luca@revilaw.it' }] }
        });
        mettiProgramma([
            { tipo: 'tavola', titolo: 'Modello 231 e Tax Control Framework', dalle: '10:40', alle: '11:20', moderatore: anna }
        ]);
        mettiInvitato('gino', 'Gino', ['merito-creditizio', 'modello-231-b']);
        const r = await chiama('gino', { azione: 'b2b-leggi' });
        const suo = r.aree.filter(a => a.id === 'merito-creditizio')[0];
        const stato = ora => (suo.slot.filter(x => x.ora === ora)[0] || {}).stato;
        esigi(stato('10:30') === 'chiuso' && stato('11:00') === 'chiuso',
            'gli orari sotto il palco non sono prenotabili, e nessuno ha dovuto chiuderli');
        /* Il margine di dieci minuti, dai due lati: le 10:00-10:30 finiscono
           quando la fascia comincia, le 11:30 cominciano quando finisce. */
        esigi(stato('10:00') === 'libero' && stato('11:30') === 'libero',
            'gli orari che stanno fuori dal margine restano liberi');
        const altro = r.aree.filter(a => a.id === 'modello-231-b')[0];
        esigi((altro.slot.filter(x => x.ora === '10:30')[0] || {}).stato === 'libero',
            'il secondo tavolo, tenuto da un altro, in quell\'ora riceve lo stesso');
        const negato = await chiama('gino', { azione: 'b2b-slot-prenota', area: 'merito-creditizio', ora: '10:30' });
        esigi(!negato.ok && negato.motivo === 'palco', 'e se ci prova lo stesso, non passa');
        esigi(!slotDi('merito-creditizio', '10:30'), 'nell\'agenda quell\'orario resta vuoto');
        const preso = await chiama('gino', { azione: 'b2b-slot-prenota', area: 'merito-creditizio', ora: '10:00' });
        esigi(preso.ok, 'l\'orario di prima del margine si prenota come sempre');
        // chi organizza vede il perche', non solo la porta chiusa
        const letto = await staff({ azione: 'agenda' });
        const s1030 = letto.corpo.aree.filter(a => a.id === 'merito-creditizio')[0]
            .slot.filter(x => x.ora === '10:30')[0];
        esigi(s1030.motivo === 'palco' && s1030.palco && s1030.palco.chi === 'Anna Verdi',
            'nell\'area riservata l\'orario dice chi e sul palco e per cosa');
        // forzare resta una decisione di chi organizza
        mettiInvitato('elena', 'Elena', ['merito-creditizio']);
        const forzato = await staff({ azione: 'agenda-assegna', doc: 'elena', area: 'merito-creditizio', ora: '10:30' });
        esigi(forzato.stato === 200 && forzato.corpo.ok, 'lo staff puo assegnarlo lo stesso: e una decisione, non un errore');
    });

    await prova('16) Senza scaletta non si chiude niente', async () => {
        azzera();
        mettiAgenda({ 'merito-creditizio': { referenti: [{ nome: 'Anna Verdi', email: 'anna@revilaw.it' }] } });
        // un evento senza programma scritto: nessuno e' sul palco, e i tavoli
        // si leggono come si sono sempre letti
        mettiInvitato('nina', 'Nina', ['merito-creditizio']);
        const r = await chiama('nina', { azione: 'b2b-leggi' });
        esigi(r.aree[0].liberi === 14, 'tutti e 14 gli orari restano liberi');
        // e una voce senza ore non colloca nessuno
        mettiProgramma([{ tipo: 'tavola', titolo: 'Da collocare', moderatore: { nome: 'Anna Verdi', email: 'anna@revilaw.it' } }]);
        const r2 = await chiama('nina', { azione: 'b2b-leggi' });
        esigi(r2.aree[0].liberi === 14, 'e una voce senza orario non ne toglie nemmeno uno');
    });

    console.log('\n' + ok + ' ok, ' + ko + ' KO');
    process.exit(ko ? 1 : 0);
})().catch(e => { console.error('Errore nelle prove:', e); process.exit(1); });
