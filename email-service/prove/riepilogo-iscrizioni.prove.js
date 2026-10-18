/* ============================================================
   PROVE - il riepilogo serale delle iscrizioni (api/riepilogo-iscrizioni.js)
   ------------------------------------------------------------
       node prove/riepilogo-iscrizioni.prove.js

   Firestore e la posta sono finti. Si verifica che:
     - parte solo a mezzanotte di Milano, d'inverno e d'estate;
     - riepiloga il giorno appena finito, solo l'evento giusto, e le
       iscrizioni annullate non contano;
     - senza iscrizioni nuove non parte niente;
     - parte una volta sola per giorno, anche se il lavoro gira due volte;
     - va ai cinque organizzatori, con il collegamento all'area riservata;
     - senza il segreto del cron non risponde.
   ============================================================ */
'use strict';
const Module = require('module');
const path = require('path');

let orologio = 0;
const DateVera = Date;
global.Date = class extends DateVera {
    constructor(...a) { if (a.length) super(...a); else super(orologio); }
    static now() { return orologio; }
};

const dati = new Map();
function doc(coll, id) {
    const k = coll + '/' + id;
    return {
        get: async () => ({ exists: dati.has(k), data: () => dati.get(k) }),
        set: async (p, o) => { dati.set(k, Object.assign({}, (o && o.merge) ? dati.get(k) : {}, p)); }
    };
}
const db = {
    collection: c => ({
        doc: id => doc(c, id),
        get: async () => {
            const docs = [...dati.keys()].filter(k => k.startsWith(c + '/')).map(k => ({ id: k.split('/')[1], data: () => dati.get(k) }));
            return { forEach: f => docs.forEach(f) };
        }
    }),
    runTransaction: async fn => {
        const scr = [];
        const r = await fn({ get: x => x.get(), set: (x, p, o) => scr.push([x, p, o]) });
        for (const [x, p, o] of scr) await x.set(p, o);
        return r;
    }
};
const admin = { apps: [], initializeApp() { admin.apps.push(1); }, credential: { cert: () => ({}) }, firestore: () => db };
let spedite = [];
const veroRequire = Module.prototype.require;
Module.prototype.require = function (n) {
    if (n === 'firebase-admin') return admin;
    if (n === 'nodemailer') return { createTransport: () => ({ sendMail: async m => { spedite.push(m); return {}; } }) };
    return veroRequire.apply(this, arguments);
};
process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ private_key: 'x' });
process.env.CRON_SECRET = 'segreto';
process.env.SMTP_FROM_EMAIL = 'noreply@esempio.it';
delete process.env.RIEPILOGO_DESTINATARI;

const lavoro = require(path.join(__dirname, '..', 'api/riepilogo-iscrizioni.js'));
let ok = 0, ko = 0;
function esigi(c, cosa, extra) { if (c) { ok++; console.log('  verde  ' + cosa); } else { ko++; console.log('  ROSSO  ' + cosa + (extra ? '   ' + extra : '')); } }
async function gira(query, chiave) {
    let stato = 0, corpo = null;
    const res = { status(s) { stato = s; return res; }, json(c) { corpo = c; return res; } };
    await lavoro({ headers: { authorization: 'Bearer ' + (chiave || 'segreto') }, query: query || {} }, res);
    return { stato, corpo };
}
const ms = iso => DateVera.parse(iso);
function scheda(id, o) { dati.set('iscrizioni/' + id, Object.assign({ pagina: 'Milano 26 Febbraio 2027 - Iscrizione', partecipanti: undefined }, o)); }

(async () => {
    console.log('\nMezzanotte d\'inverno (23 UTC)');
    scheda('a', { nome: 'Anna', cognome: 'Bianchi', email: 'anna@x.it', telefono: '+39 333 111 2222', azienda: 'Alfa', ruolo: 'CFO', data: '15/01/2027 10:12:00', ricevuto: { toMillis: () => ms('2027-01-15T09:12:00Z') }, emailConfermata: { quando: 1 } });
    scheda('b', { nome: 'Bruno', cognome: 'Rossi', email: 'bruno@x.it', data: '15/01/2027 18:40:00', ricevuto: { toMillis: () => ms('2027-01-15T17:40:00Z') }, selezionata: true, invitoAzienda: 'Beta S.p.A.' });
    scheda('c', { nome: 'Carla', email: 'carla@x.it', data: '14/01/2027 09:00:00', ricevuto: { toMillis: () => ms('2027-01-14T08:00:00Z') }, emailConfermata: { quando: 1 } });
    scheda('d', { nome: 'Dario', email: 'dario@x.it', data: '15/01/2027 11:00:00', ricevuto: { toMillis: () => ms('2027-01-15T10:00:00Z') }, annullato: { quando: 1 } });
    scheda('e', { nome: 'Elena', email: 'elena@x.it', pagina: 'Napoli 2 Ottobre 2026 - Manifestazione di interesse', data: '15/01/2027 12:00:00' });
    scheda('f', { nome: 'Fabio', email: 'fabio@x.it', pagina: 'Milano 26 Febbraio 2027', data: '15/01/2027 20:00:00' });   // inserita a mano, senza "ricevuto"
    orologio = ms('2027-01-15T22:00:05Z');   // 23:00 a Milano: non e' mezzanotte
    let r = await gira();
    esigi(r.corpo.saltato && spedite.length === 0, 'alle 23 di Milano non fa niente', JSON.stringify(r.corpo));
    orologio = ms('2027-01-15T23:00:05Z');   // mezzanotte a Milano
    r = await gira();
    esigi(r.corpo.giorno === '2027-01-15', 'riepiloga il giorno appena finito', r.corpo.giorno);
    esigi(spedite.length === 1, 'parte una mail');
    const m = spedite[0] || {};
    esigi(m.to === 'andreamissori@revilaw.it, pierluigisterzi@revilaw.it, ombrettamagaraci@revilaw.it, sergiomiele@revilaw.it, vincenzoantonionapolitano@revilaw.it', 'ai cinque organizzatori', m.to);
    esigi(/3 nuove/.test(m.subject) && /totale 4/.test(m.subject), 'nell\'oggetto: tre nuove, quattro in tutto (annullate e Napoli escluse)', m.subject);
    esigi(/Anna Bianchi/.test(m.html) && /Bruno Rossi/.test(m.html) && /Fabio/.test(m.html), 'ci sono i nuovi, anche quello inserito a mano');
    esigi(!/Carla/.test(m.html.split('Le nuove iscrizioni')[1] || '') && !/Dario/.test(m.html) && !/Elena/.test(m.html), 'non ci sono quelli di ieri, gli annullati e un altro evento');
    esigi(/area-riservata\/#eventi/.test(m.html) && /area-riservata\/#eventi/.test(m.text), 'c\'e\' il collegamento all\'area riservata');
    esigi(/azienda invitata: Beta S\.p\.A\./.test(m.html), 'chi e\' arrivato con il codice invito si riconosce');
    esigi(/Email confermata/.test(m.html) && /Email da confermare/.test(m.html), 'e si vede chi ha confermato l\'email');

    console.log('\nUna volta sola');
    r = await gira();
    esigi(spedite.length === 1 && r.corpo.esiti[0].gia, 'il secondo giro della stessa notte non rispedisce', JSON.stringify(r.corpo));

    console.log('\nNessuna iscrizione nuova');
    orologio = ms('2027-01-16T23:00:05Z');
    r = await gira();
    esigi(spedite.length === 1 && r.corpo.esiti[0].nuove === 0, 'nel giorno senza iscrizioni non parte niente');

    console.log('\nMezzanotte d\'estate (22 UTC) e chiamata a mano');
    orologio = ms('2026-07-10T22:00:05Z');
    r = await gira();
    esigi(r.corpo.giorno === '2026-07-10' && !r.corpo.saltato, 'd\'estate gira alle 22 UTC', JSON.stringify(r.corpo));
    r = await gira({ giorno: '2027-01-15', forza: '1' });
    esigi(spedite.length === 2, 'a mano con forza=1 si rispedisce un giorno');
    r = await gira({}, 'sbagliato');
    esigi(r.stato === 401, 'senza il segreto non risponde');

    console.log('\n' + ok + ' verdi, ' + ko + ' rossi');
    require('fs').writeFileSync(process.env.ANTEPRIMA || '/dev/null', (spedite[0] || {}).html || '');
    process.exit(ko ? 1 : 0);
})();
