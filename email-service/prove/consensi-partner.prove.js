/* ============================================================
   PROVE - lib/consensi-partner.js
   ------------------------------------------------------------
       node prove/consensi-partner.prove.js

   Firestore e la posta sono finti e stanno qui dentro.

   COSA DIMOSTRANO. Il consenso partner si chiede per mail a chi si
   e' iscritto prima che il modulo avesse la casella:
     - la mail parte a chi non l'ha dato, con il nome e con il
       collegamento personale firmato al posto dei segnaposti;
     - non parte a chi il consenso lo ha gia' dato, a chi ha
       annullato, a chi e' di un altro evento, due volte allo stesso
       indirizzo, ne' - senza reinvio - a chi l'ha gia' ricevuta: un
       invio interrotto si riprende senza doppioni;
     - la pagina legge i consensi solo con la firma giusta, e una
       firma non apre la scheda di un altro;
     - il consenso si scrive una volta, con il momento, e solo con la
       casella spuntata; gli altri consensi non si toccano.
   ============================================================ */
'use strict';
const Module = require('module');
const path = require('path');
const veroRequire = Module.prototype.require;
Module.prototype.require = function (nome) {
    if (nome === 'firebase-admin') return { apps: [], firestore: { FieldValue: { serverTimestamp: () => 0 } } };
    if (nome === 'nodemailer') return { createTransport: () => ({}) };
    return veroRequire.apply(this, arguments);
};
process.env.NEWSLETTER_SECRET = 'segreto-di-prova';

const dati = {};
const db = {
    collection: c => ({
        doc: id => ({
            id: id,
            get: async () => ({ exists: Object.prototype.hasOwnProperty.call(dati, c + '/' + id), data: () => dati[c + '/' + id] }),
            set: async (patch, opz) => { dati[c + '/' + id] = Object.assign({}, (opz && opz.merge) ? (dati[c + '/' + id] || {}) : {}, patch); }
        })
    })
};
const CP = require(path.join(__dirname, '..', 'lib/consensi-partner.js'));
const NL = require(path.join(__dirname, '..', 'lib/newsletter.js'));

let ok = 0, ko = 0;
function esigi(cond, cosa, extra) {
    if (cond) { ok++; console.log('  verde  ' + cosa); }
    else { ko++; console.log('  ROSSO  ' + cosa + (extra ? '   ' + extra : '')); }
}
const MI = 'Milano 26 Febbraio 2027 - Iscrizione';
function scenario() {
    Object.keys(dati).forEach(k => delete dati[k]);
    const s = (id, v) => { dati['iscrizioni/' + id] = Object.assign({ pagina: MI, data: '10/11/2026 09:00', privacy: true, marketing: true, consensoRiprese: { quando: 5 } }, v); };
    s('anna', { nome: 'Anna', cognome: 'Alfa', email: 'Anna@Alfa.it' });
    s('bruno', { nome: 'Bruno', cognome: 'Beta', email: 'bruno@beta.it', consensoPartner: { quando: 9, come: 'modulo' } });
    s('carla', { nome: 'Carla', cognome: 'Gamma', email: 'carla@gamma.it', annullato: { quando: 1 } });
    s('dino', { nome: 'Dino', cognome: 'Delta', email: 'dino@delta.it', pagina: 'Napoli 2 Ottobre 2026' });
    s('anna2', { nome: 'Anna', cognome: 'Alfa', email: 'anna@alfa.it' });
    s('elsa', { nome: 'Elsa <b>', cognome: 'Eta', email: 'elsa@eta.it' });
    s('furio', { nome: 'Furio', cognome: 'Zeta', email: '' });
}
let spedite = [], rompi = null;
const trasporto = { sendMail: async m => { if (rompi && rompi(m)) throw new Error('server di posta giu'); spedite.push(m); } };
const MAIL = { oggetto: 'Completa i tuoi consensi', html: '<p>Gentile {{NOME}}, <a href="{{CONSENSI}}">Vedi i tuoi consensi</a></p>', testo: 'Gentile {{NOME}}: {{CONSENSI}}' };
const TUTTI = ['anna', 'bruno', 'carla', 'dino', 'anna2', 'elsa', 'furio', 'sparita'].map(x => ({ id: x, doc: x }));
function invia(extra) {
    return CP.invia(db, Object.assign({
        evento: 'milano-2027-02-26', destinatari: TUTTI, mail: MAIL, scadenza: Date.now() + 60000, trasporto: trasporto,
        da: '"Revilaw" <noreply@esempio.it>', rispondiA: 'info@esempio.it', idScheda: x => x, chi: { email: 'chi@studio.it' }
    }, extra || {}));
}

(async () => {
    console.log('\nLa mail: a chi parte e a chi no');
    scenario(); spedite = []; rompi = null;
    let r = await invia();
    esigi(spedite.map(m => m.to).join(',') === 'anna@alfa.it,elsa@eta.it', 'parte a chi non ha dato il consenso, un indirizzo una mail', spedite.map(m => m.to).join(','));
    esigi(r.inviate === 2 && r.giaConsenso === 1 && r.senzaScheda === 3 && r.doppie === 1 && r.senzaEmail === 1,
        'gli altri si contano: consenso gia\' dato, annullata, altro evento, sparita, doppia, senza email', JSON.stringify(r));
    const perAnna = spedite[0];
    const atteso = CP.PAGINA + '?d=anna&t=' + NL.firmaConsensi('anna');
    esigi(perAnna.html.indexOf('Gentile Anna,') >= 0 && perAnna.html.indexOf('href="' + atteso.replace(/&/g, '&amp;') + '"') >= 0, 'nell\'HTML il nome e il collegamento firmato della sua scheda', perAnna.html);
    esigi(perAnna.text.indexOf(atteso) >= 0 && !/\{\{/.test(perAnna.html + perAnna.text + perAnna.subject), 'anche nel solo testo, e nessun segnaposto resta');
    esigi(spedite[1].html.indexOf('Elsa &lt;b&gt;') >= 0, 'il nome entra nell\'HTML senza poterlo rompere');
    esigi(dati['iscrizioni/anna'].mailConsensoPartner.ok === true && dati['iscrizioni/anna'].mailConsensoPartner.a === 'anna@alfa.it', 'sulla scheda resta scritto che e\' partita');

    console.log('\nRiprendere senza doppioni, e il reinvio');
    spedite = [];
    r = await invia();
    esigi(spedite.length === 0 && r.giaChieste === 2, 'un secondo giro non riscrive a nessuno', JSON.stringify(r));
    r = await invia({ forza: true });
    esigi(spedite.length === 2 && r.inviate === 2, 'con il reinvio riparte a chi non ha ancora risposto');
    scenario(); spedite = []; rompi = m => m.to === 'anna@alfa.it';
    r = await invia();
    esigi(r.falliti.length === 1 && r.inviate === 1 && dati['iscrizioni/anna'].mailConsensoPartner.ok === false, 'una mail che non parte si segna come non riuscita', JSON.stringify(r.falliti));
    rompi = null; spedite = [];
    r = await invia();
    esigi(spedite.map(m => m.to).join(',') === 'anna@alfa.it', 'e al giro dopo riparte solo quella');
    scenario(); spedite = [];
    r = await invia({ scadenza: Date.now() - 1 });
    esigi(spedite.length === 0 && r.restanti.length === TUTTI.length, 'a tempo finito non parte niente e tutto torna fra i restanti');

    console.log('\nLa pagina: leggere i consensi');
    scenario();
    const t = NL.firmaConsensi('anna');
    let p = await CP.leggi(db, { d: 'anna', t: t });
    esigi(p.stato === 200 && p.corpo.nome === 'Anna Alfa' && p.corpo.consensi.privacy === true && p.corpo.consensi.marketing === true
        && p.corpo.consensi.riprese.quando === 5 && p.corpo.consensi.partner === null && p.corpo.conRiprese === true,
        'i consensi gia\' espressi e quello che manca', JSON.stringify(p.corpo));
    esigi(!('email' in p.corpo) && !('telefono' in p.corpo), 'niente recapiti nella risposta');
    p = await CP.leggi(db, { d: 'bruno', t: t });
    esigi(p.stato === 403, 'la firma di una scheda non apre quella di un altro');
    p = await CP.leggi(db, { d: 'carla', t: NL.firmaConsensi('carla') });
    esigi(p.stato === 404, 'un\'iscrizione annullata non si apre');

    console.log('\nLa pagina: dare il consenso');
    p = await CP.salva(db, { d: 'anna', t: t });
    esigi(p.stato === 400 && !dati['iscrizioni/anna'].consensoPartner, 'senza la casella spuntata non si scrive niente');
    p = await CP.salva(db, { d: 'anna', t: 'sbagliata', partner: true });
    esigi(p.stato === 403 && !dati['iscrizioni/anna'].consensoPartner, 'con la firma sbagliata nemmeno');
    p = await CP.salva(db, { d: 'anna', t: t, partner: true });
    const c = dati['iscrizioni/anna'].consensoPartner || {};
    esigi(p.stato === 200 && p.corpo.gia === false && c.quando > 0 && c.come === 'collegamento' && p.corpo.consensi.partner.quando === c.quando,
        'spuntata: resta sulla scheda, con il momento', JSON.stringify(c));
    esigi(dati['iscrizioni/anna'].privacy === true && dati['iscrizioni/anna'].consensoRiprese.quando === 5, 'gli altri consensi restano com\'erano');
    const prima = c.quando;
    p = await CP.salva(db, { d: 'anna', t: t, partner: true });
    esigi(p.corpo.gia === true && dati['iscrizioni/anna'].consensoPartner.quando === prima, 'una seconda volta non cambia il momento del consenso');
    spedite = [];
    r = await invia({ forza: true });
    esigi(spedite.every(m => m.to !== 'anna@alfa.it'), 'e a chi lo ha dato la mail non parte piu\', nemmeno col reinvio');

    console.log('\n' + ok + ' verdi, ' + ko + ' rossi');
    process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
