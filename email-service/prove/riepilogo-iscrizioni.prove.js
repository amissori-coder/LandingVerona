/* ============================================================
   PROVE - il riepilogo serale delle iscrizioni (api/riepilogo-iscrizioni.js)
   ------------------------------------------------------------
       node prove/riepilogo-iscrizioni.prove.js

   Firestore e la posta sono finti. Si verifica che:
     - parte solo a mezzanotte di Milano, d'inverno e d'estate;
     - un'iscrizione conta quando l'email e' CONFERMATA: e' nuova il
       giorno della conferma, anche se il modulo era di giorni prima;
     - chi non ha confermato compare fra gli "in attesa" ogni notte,
       finche' non conferma, e quella notte passa fra le nuove;
     - chi e' stato inserito a mano, viene dal desk (con un Portale) o
       e' stato caricato con "Importa" non e' mai "in attesa": non ha una
       mail da confermare (la regola e' CONFERMA.inAttesaDiConferma, la
       stessa dei promemoria);
     - solo l'evento giusto, e le annullate non contano;
     - senza conferme nuove e senza attese non parte niente;
     - parte una volta sola per giorno, anche se il lavoro gira due volte;
     - va ai cinque organizzatori, con il collegamento all'area riservata;
     - senza il segreto del cron non risponde.
   E per gli ADERENTI (cena e meeting, iscrizioniAderenti), che non hanno
   un'email da confermare e da cui parte una fattura:
     - una mail a parte, agli stessi cinque, con le iscrizioni arrivate
       nel giorno e i dati per la fattura, le note per la cena e la quota;
     - chi ha corretto il modulo quel giorno sta fra le "aggiornate", con
       i campi della fatturazione cambiati; chi ha corretto il giorno
       stesso dell'iscrizione resta fra le nuove, con i dati nuovi;
     - niente "in attesa" ne' "confermata": la conferma qui non c'e';
     - i totali e le fatture da emettere (quelle segnate emesse no);
     - senza niente di nuovo niente mail, e una volta sola per notte;
     - le due mail partono insieme, la notte che servono tutte e due.
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
    const T = iso => ({ toMillis: () => ms(iso) });
    scheda('a', { nome: 'Anna', cognome: 'Bianchi', email: 'anna@x.it', telefono: '+39 333 111 2222', azienda: 'Alfa', ruolo: 'CFO', data: '15/01/2027 10:12:00', ricevuto: T('2027-01-15T09:12:00Z'), emailConfermata: { quando: ms('2027-01-15T09:20:00Z') } });
    scheda('b', { nome: 'Bruno', cognome: 'Rossi', email: 'bruno@x.it', data: '15/01/2027 18:40:00', ricevuto: T('2027-01-15T17:40:00Z'), selezionata: true, invitoAzienda: 'Beta S.p.A.' });
    scheda('c', { nome: 'Carla', cognome: 'Verdi', email: 'carla@x.it', data: '14/01/2027 09:00:00', ricevuto: T('2027-01-14T08:00:00Z'), emailConfermata: { quando: ms('2027-01-15T07:00:00Z') } });
    scheda('d', { nome: 'Dario', email: 'dario@x.it', data: '15/01/2027 11:00:00', ricevuto: T('2027-01-15T10:00:00Z'), annullato: { quando: 1 } });
    scheda('e', { nome: 'Elena', email: 'elena@x.it', pagina: 'Napoli 2 Ottobre 2026 - Manifestazione di interesse', data: '15/01/2027 12:00:00', emailConfermata: { quando: ms('2027-01-15T12:00:00Z') } });
    // inserita a mano dall'area riservata (Eventbrite): non ha una mail da confermare
    scheda('f', { nome: 'Fabio', email: 'fabio@x.it', pagina: 'Milano 26 Febbraio 2027', data: '15/01/2027 20:00:00', inserito: { da: 'segreteria@revilaw.it', quando: ms('2027-01-15T19:00:00Z') } });
    // registrata al desk, con il QR: nemmeno lei
    scheda('h', { nome: 'Ugo', cognome: 'Desk', email: 'ugo@x.it', data: '15/01/2027 16:00:00', ricevuto: T('2027-01-15T15:00:00Z'), extra: { Portale: 'Desk Revilaw' } });
    scheda('i', { nome: 'Ivo', cognome: 'Neri', email: 'ivo@x.it', data: '15/01/2027 19:30:00', ricevuto: T('2027-01-15T18:30:00Z') });
    // caricata con "Importa" (da un altro portale): nessuna mail di conferma e' partita
    scheda('j', { nome: 'Ida', cognome: 'Importata', email: 'ida@x.it', pagina: 'Milano 26 Febbraio 2027', data: '15/01/2027 17:00:00', importato: true, extra: { Ruolo: 'CFO' } });
    scheda('g', { nome: 'Gino', email: 'gino@x.it', data: '16/01/2027 10:00:00', ricevuto: T('2027-01-16T09:00:00Z') });

    console.log('\nMezzanotte d\'inverno (23 UTC)');
    orologio = ms('2027-01-15T22:00:05Z');   // 23:00 a Milano
    let r = await gira();
    esigi(r.corpo.saltato && spedite.length === 0, 'alle 23 di Milano non fa niente', JSON.stringify(r.corpo));
    orologio = ms('2027-01-15T23:00:05Z');   // mezzanotte a Milano
    r = await gira();
    esigi(r.corpo.giorno === '2027-01-15', 'riepiloga il giorno appena finito', r.corpo.giorno);
    esigi(spedite.length === 1, 'parte una mail');
    let m = spedite[0] || {};
    esigi(m.to === 'andreamissori@revilaw.it, pierluigisterzi@revilaw.it, ombrettamagaraci@revilaw.it, sergiomiele@revilaw.it, vincenzoantonionapolitano@revilaw.it', 'ai cinque organizzatori', m.to);
    esigi(/2 confermate/.test(m.subject) && /totale 2/.test(m.subject) && /2 in attesa/.test(m.subject), 'oggetto: due confermate, due in tutto, due in attesa', m.subject);
    const [conf, attesa] = m.html.split('In attesa di conferma email');
    esigi(/Anna Bianchi/.test(conf) && /Carla Verdi/.test(conf), 'fra le confermate: chi ha confermato oggi, anche se iscritto ieri');
    esigi(/confermata alle 10:20/.test(conf), 'con l\'ora della conferma');
    esigi(/Bruno Rossi/.test(attesa || '') && /Ivo Neri/.test(attesa || ''), 'fra gli in attesa: chi si e\' iscritto dal sito e non ha confermato');
    esigi(!/Fabio/.test(m.html) && !/Ugo Desk/.test(m.html), 'mai chi e\' stato inserito a mano o viene dal desk: non ha una mail da confermare');
    esigi(!/Ida Importata/.test(m.html), 'e nemmeno chi e\' stato caricato con "Importa"');
    esigi(!/Bruno/.test(conf) && !/Gino/.test(m.html), 'chi attende non e\' fra le confermate, e chi si iscrive domani non c\'e\'');
    esigi(/iscritto il 15\/01 alle 18:40/.test(attesa || ''), 'per chi attende, il giorno e l\'ora del modulo');
    esigi(!/Dario/.test(m.html) && !/Elena/.test(m.html), 'non ci sono gli annullati ne\' un altro evento');
    esigi(!/Cellulare/.test(m.html), 'niente stato del cellulare: dal sito e\' sempre verificato');
    esigi(/area-riservata\/#eventi/.test(m.html) && /area-riservata\/#eventi/.test(m.text), 'c\'e\' il collegamento all\'area riservata');
    esigi(/Azienda invitata: Beta S\.p\.A\./.test(m.html), 'chi e\' arrivato con il codice invito si riconosce');
    esigi(/IN ATTESA DI CONFERMA EMAIL\n- Bruno Rossi/.test(m.text), 'anche nella versione senza formattazione');

    console.log('\nUna volta sola');
    r = await gira();
    esigi(spedite.length === 1 && r.corpo.esiti[0].gia, 'il secondo giro della stessa notte non rispedisce', JSON.stringify(r.corpo));

    console.log('\nIl giorno dopo: chi conferma passa fra le nuove');
    dati.set('iscrizioni/b', Object.assign({}, dati.get('iscrizioni/b'), { emailConfermata: { quando: ms('2027-01-16T08:00:00Z') } }));
    orologio = ms('2027-01-16T23:00:05Z');
    r = await gira();
    m = spedite[1] || {};
    const [conf2, attesa2] = (m.html || '').split('In attesa di conferma email');
    esigi(/Bruno Rossi/.test(conf2) && !/Bruno/.test(attesa2 || ''), 'Bruno ha confermato: ora e\' fra le nuove, non piu\' in attesa');
    esigi(!/Anna/.test(conf2), 'Anna non torna: era nuova ieri');
    esigi(/Ivo/.test(attesa2 || '') && /Gino/.test(attesa2 || '') && !/Fabio/.test(m.html || ''), 'Ivo resta in attesa, e si aggiunge Gino');
    esigi(/totale 3/.test(m.subject || ''), 'tre confermate in tutto', m.subject);

    console.log('\nNiente da dire, niente mail');
    // confermano gli ultimi due dal sito; Fabio e Ugo non confermano mai, e non tengono viva la mail
    ['i', 'g'].forEach(k => dati.set('iscrizioni/' + k, Object.assign({}, dati.get('iscrizioni/' + k), { emailConfermata: { quando: ms('2027-01-17T08:00:00Z') } })));
    orologio = ms('2027-01-18T23:00:05Z');
    r = await gira();
    esigi(spedite.length === 2 && r.corpo.esiti[0].nuove === 0, 'senza conferme nuove e senza attese non parte niente', JSON.stringify(r.corpo));

    console.log('\nMezzanotte d\'estate (22 UTC) e chiamata a mano');
    orologio = ms('2026-07-10T22:00:05Z');
    r = await gira();
    esigi(r.corpo.giorno === '2026-07-10' && !r.corpo.saltato, 'd\'estate gira alle 22 UTC', JSON.stringify(r.corpo));
    r = await gira({ giorno: '2027-01-15', forza: '1' });
    esigi(spedite.length === 3, 'a mano con forza=1 si rispedisce un giorno');
    r = await gira({}, 'sbagliato');
    esigi(r.stato === 401, 'senza il segreto non risponde');

    console.log('\nGli aderenti: una mail loro, con i dati per la fattura');
    const FAT = (o) => Object.assign({ intestatario: 'Studio Verdi Associati', partitaIva: '04641610235', codiceFiscale: '04641610235',
        indirizzo: 'Via Roma 1', cap: '37121', comune: 'Verona', provincia: 'VR', codiceDestinatario: 'M5UXCR1', pec: '', emailFatture: 'amministrazione@studio.it' }, o);
    const aderente = (id, o) => dati.set('iscrizioniAderenti/' + id, Object.assign({ quota: 'milano-2027-aderenti', evento: 'milano-2027-02-26',
        importi: { imponibile: 200, iva: 44, totale: 244 }, mail: true }, o));
    aderente('anna', { nome: 'Anna', cognome: 'Verdi', email: 'anna.verdi@studio.it', telefono: '+39 333 1234567', studio: 'Studio Verdi', citta: 'Verona',
        fatturazione: FAT(), note: 'Celiaco', primaVolta: ms('2027-02-03T09:00:00Z'), quando: ms('2027-02-03T09:00:00Z'), storia: [] });
    // si iscrive e corregge lo stesso giorno: e' nuova, con i dati della correzione
    aderente('bruno', { nome: 'Bruno', cognome: 'Neri', email: 'bruno@neri.it', telefono: '347 000 1111',
        fatturazione: FAT({ intestatario: 'Bruno Neri', codiceFiscale: 'RSSMRA80A01F205X', codiceDestinatario: '', pec: 'bruno@pec.it' }),
        primaVolta: ms('2027-02-03T14:00:00Z'), quando: ms('2027-02-03T17:00:00Z'),
        storia: [{ quando: ms('2027-02-03T14:00:00Z'), fatturazione: FAT({ intestatario: 'Bruno N.' }) }] });
    // iscritta l'1 febbraio, il 3 cambia intestatario e PEC
    aderente('carla', { nome: 'Carla', cognome: 'Bassi', email: 'carla@bassi.it', telefono: '348 222 3333',
        fatturazione: FAT({ intestatario: 'Carla Nuova Srl', pec: 'carla@pec.it' }),
        primaVolta: ms('2027-02-01T10:00:00Z'), quando: ms('2027-02-03T11:00:00Z'),
        storia: [{ quando: ms('2027-02-01T10:00:00Z'), fatturazione: FAT({ intestatario: 'Carla Vecchia' }) }] });
    // iscritto l'1, fattura gia' emessa, il 3 non fa niente
    aderente('dario', { nome: 'Dario', cognome: 'Galli', email: 'dario@galli.it', telefono: '349 444 5555', fatturazione: FAT({ intestatario: 'Galli Spa' }),
        primaVolta: ms('2027-02-01T12:00:00Z'), quando: ms('2027-02-01T12:00:00Z'), fattura: { emessa: true, numero: '7/2027' } });
    // un'altra quota (un evento futuro): non e' di questa mail
    aderente('ezio', { quota: 'altra-quota', nome: 'Ezio', cognome: 'Altrove', email: 'ezio@x.it', primaVolta: ms('2027-02-03T10:00:00Z'), quando: ms('2027-02-03T10:00:00Z') });

    const prima = spedite.length;
    orologio = ms('2027-02-03T23:00:05Z');
    r = await gira();
    esigi(spedite.length === prima + 1, 'parte una mail, quella degli aderenti (le aziende quella notte non hanno niente)', String(spedite.length - prima));
    m = spedite[prima] || {};
    const esA = (r.corpo.esiti || []).find(e => e.quota === 'milano-2027-aderenti') || {};
    esigi(esA.nuove === 2 && esA.aggiornate === 1 && esA.totale === 4 && esA.inviata === 5, 'l\'esito del lavoro la conta', JSON.stringify(esA));
    esigi(m.to === 'andreamissori@revilaw.it, pierluigisterzi@revilaw.it, ombrettamagaraci@revilaw.it, sergiomiele@revilaw.it, vincenzoantonionapolitano@revilaw.it',
        'agli stessi cinque del riepilogo delle aziende', m.to);
    esigi(m.subject === 'Iscrizioni aderenti Milano - 2 nuove, 1 aggiornata il 03/02/2027 (totale 4)', 'oggetto: nuove, aggiornate, totale', m.subject);
    const [nuoveA, aggA] = String(m.html || '').split('Iscrizioni aggiornate</td>');
    esigi(/Anna Verdi/.test(nuoveA) && /Bruno Neri/.test(nuoveA) && !/Carla/.test(nuoveA), 'fra le nuove: chi si e\' iscritto oggi');
    esigi(/iscritto alle 10:00/.test(nuoveA) && /iscritto alle 15:00, corretto alle 18:00/.test(nuoveA), 'con l\'ora, e l\'ora della correzione per chi ha corretto subito');
    esigi(/Bruno Neri<\/td>/.test(nuoveA) && /bruno@pec\.it/.test(nuoveA) && !/Bruno N\.</.test(nuoveA), 'Bruno con i dati della correzione');
    esigi(/Carla Bassi/.test(aggA || '') && /aggiornato alle 12:00/.test(aggA || '') && /Cambiati: Intestatario, PEC\./.test(aggA || ''), 'Carla fra le aggiornate, con i campi cambiati', (aggA || '').slice(0, 0));
    esigi(/Carla Nuova Srl/.test(aggA || '') && !/Carla Vecchia/.test(m.html), 'e i dati nuovi, non quelli vecchi');
    esigi(!/Dario/.test(m.html) && !/Ezio/.test(m.html), 'non c\'e\' chi non ha fatto niente oggi, ne\' un\'altra quota');
    esigi(/04641610235/.test(nuoveA) && /M5UXCR1/.test(nuoveA) && /Via Roma 1, 37121 Verona \(VR\)/.test(nuoveA) && /amministrazione@studio\.it/.test(nuoveA),
        'per ogni persona i dati per la fattura');
    esigi(/244,00 €/.test(nuoveA) && /Celiaco/.test(nuoveA) && /nessuna/.test(nuoveA), 'la quota e le note per la cena (anche quando non ci sono)');
    esigi(/Fatture da emettere/.test(m.html) && /3 \(732,00 €\)/.test(m.html), 'fatture da emettere: tre, la fattura di Dario e\' gia\' emessa');
    esigi(!/In attesa di conferma|confermata alle|Conferma il tuo indirizzo|attendono/i.test(m.html) && !/IN ATTESA/.test(m.text),
        'niente "in attesa" ne\' "confermata": per gli aderenti la conferma non c\'e\'');
    esigi(/non c'è la conferma dell'email/.test(m.html), 'e la mail lo dice');
    esigi(/area-riservata\/#eventi/.test(m.html) && /area-riservata\/#eventi/.test(m.text), 'c\'e\' il collegamento all\'area riservata');
    esigi(/NUOVE ISCRIZIONI DEL 03\/02\/2027\n- Anna Verdi \(iscritto alle 10:00\)/.test(m.text) && /ISCRIZIONI AGGIORNATE\n- Carla Bassi/.test(m.text)
        && /Fattura: Intestatario Studio Verdi Associati; Partita IVA 04641610235/.test(m.text), 'anche nella versione senza formattazione');

    r = await gira();
    esigi(spedite.length === prima + 1 && (r.corpo.esiti.find(e => e.quota === 'milano-2027-aderenti') || {}).gia, 'il secondo giro della notte non rispedisce');

    orologio = ms('2027-02-04T23:00:05Z');
    r = await gira();
    esigi(spedite.length === prima + 1, 'una notte senza iscrizioni nuove o corrette: niente mail');

    console.log('\nLa stessa notte, aziende e aderenti: due mail');
    scheda('k', { nome: 'Katia', cognome: 'Ferri', email: 'katia@x.it', data: '05/02/2027 09:00:00', ricevuto: T('2027-02-05T08:00:00Z'), emailConfermata: { quando: ms('2027-02-05T08:30:00Z') } });
    aderente('fabio', { nome: 'Fabio', cognome: 'Conti', email: 'fabio@conti.it', telefono: '340 1', fatturazione: FAT(), primaVolta: ms('2027-02-05T16:00:00Z'), quando: ms('2027-02-05T16:00:00Z') });
    orologio = ms('2027-02-05T23:00:05Z');
    r = await gira();
    const due = spedite.slice(prima + 1);
    esigi(due.length === 2 && /^Iscrizioni Milano/.test(due[0].subject) && /^Iscrizioni aderenti Milano/.test(due[1].subject),
        'prima quella delle aziende, poi quella degli aderenti', due.map(x => x.subject).join(' | '));
    esigi(/Katia Ferri/.test(due[0].html) && !/Fabio Conti/.test(due[0].html) && /Fabio Conti/.test(due[1].html) && !/Katia/.test(due[1].html),
        'ognuno nella sua');
    esigi(r.corpo.esiti[0].evento && r.corpo.esiti[0].nuove === 1, 'l\'esito delle aziende resta il primo', JSON.stringify(r.corpo.esiti[0]));

    console.log('\n' + ok + ' verdi, ' + ko + ' rossi');
    require('fs').writeFileSync(process.env.ANTEPRIMA || '/dev/null', (spedite[0] || {}).html || '');
    if (process.env.ANTEPRIMA_ADERENTI) require('fs').writeFileSync(process.env.ANTEPRIMA_ADERENTI, (spedite[prima] || {}).html || '');
    process.exit(ko ? 1 : 0);
})();
