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
     - le due mail partono insieme, la notte che servono tutte e due;
     - se una notte la posta non risponde, la notte dopo la mail copre
       anche il giorno rimasto indietro ("dal ... al ...");
     - un errore nella parte delle aziende non ferma quella degli aderenti;
     - ?giorno= con il giorno di oggi e' un'anteprima: non segna niente,
       e a mezzanotte la mail vera parte con chi si e' iscritto dopo;
     - se all'iscritto la sua mail non e' partita, il riepilogo lo dice;
     - forza su un giorno non ancora coperto copre anche quelli prima, e su
       uno gia' coperto non riporta indietro l'ultimo giorno spedito;
     - se la funzione si ferma a meta' (posta che non risponde) il giorno
       non risulta spedito, e la notte dopo lo recupera; anche la prima
       notte in assoluto, che riparte dal giorno del cambio (riepilogoDal);
     - un giro in corso, anche per un altro giorno, ferma gli altri;
     - con trenta iscrizioni in un giorno la mail resta sotto i 102 KB
       oltre i quali Gmail la tronca.
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
const rompiLettura = new Set();   // collezioni la cui prossima lettura fallisce
let postaGiu = 0;                 // quante spedizioni falliscono, d'ora in poi
let postaFerma = false;           // la posta non risponde mai (la funzione resta appesa)
const db = {
    collection: c => ({
        doc: id => doc(c, id),
        get: async () => {
            if (rompiLettura.has(c)) { rompiLettura.delete(c); throw new Error('firestore giu\''); }
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
    if (n === 'nodemailer') return { createTransport: () => ({ sendMail: async m => { if (postaFerma) return new Promise(() => { }); if (postaGiu > 0) { postaGiu--; throw new Error('posta giu\''); } spedite.push(m); return {}; } }) };
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

    // come se il lavoro avesse girato tutte le notti fino al 2 febbraio
    dati.set('meta/riepilogoAderenti-milano-2027-aderenti', { ultimoGiorno: '2027-02-02' });
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
    // dopo il titolo delle nuove; le aggiornate cominciano con la loro spiegazione
    const [nuoveA, aggA] = (String(m.html || '').split('Nuove iscrizioni del 03/02/2027')[1] || '').split('Iscrizioni arrivate nei giorni scorsi');
    esigi(/Anna Verdi/.test(nuoveA) && /Bruno Neri/.test(nuoveA) && !/Carla/.test(nuoveA), 'fra le nuove: chi si e\' iscritto oggi');
    esigi(/iscrizione alle 10:00/.test(nuoveA) && /iscrizione alle 15:00, corretta alle 18:00/.test(nuoveA), 'con l\'ora, e l\'ora della correzione per chi ha corretto subito');
    esigi(/Bruno Neri<\/b>/.test(nuoveA) && /bruno@pec\.it/.test(nuoveA) && !/Bruno N\.</.test(nuoveA), 'Bruno con i dati della correzione');
    esigi(/Carla Bassi/.test(aggA || '') && /aggiornata alle 12:00/.test(aggA || '') && /Cambiati: Intestatario, PEC\./.test(aggA || ''), 'Carla fra le aggiornate, con i campi cambiati');
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
    esigi(/NUOVE ISCRIZIONI DEL 03\/02\/2027\n- Anna Verdi \(iscrizione alle 10:00\)/.test(m.text) && /ISCRIZIONI AGGIORNATE\n- Carla Bassi/.test(m.text)
        && /Fattura: Intestatario Studio Verdi Associati; Partita IVA 04641610235/.test(m.text), 'anche nella versione senza formattazione');
    esigi(/non c'è la conferma dell'email/.test(m.text) && /Cena: Venerdì 26 febbraio 2027 - Meeting degli aderenti: Sabato 27 febbraio 2027 - Quota: 200 € \+ IVA/.test(m.text)
        && /«Aderenti» › «Apri le iscrizioni»/.test(m.text), 'e il testo semplice dice anche date, quota, niente conferma e dove trovarle');
    esigi(/Il 03\/02\/2027 sono arrivate 2 nuove iscrizioni a «Cena e meeting degli aderenti Revilaw»\. Un'iscrizione è stata aggiornata: valgono i dati qui sotto\. Iscrizioni in tutto: 4; fatture da emettere: 3 \(732,00 € IVA inclusa\)\./.test(m.text),
        'il sommario, in italiano corretto', (m.text || '').split('\n\n')[2]);
    esigi(/Milano &middot; 26-27 febbraio 2027/.test(m.html) && !/8\.30 - 18\.00/.test(m.html) && !/Merito creditizio/.test(m.html) && !/Excelsior/.test(m.html),
        'testata e piede dicono cena e meeting, non il convegno');
    esigi(/href="https:\/\/nextgenerationbusiness\.it\/milano_febbraio_2027\/aderenti\/"/.test(m.html), 'e il piede porta alla pagina degli aderenti');
    esigi(!/white-space:nowrap/.test(String(m.html).split('Nuove iscrizioni del')[1] || 'x'), 'nessun pezzo che non va a capo: sul telefono non esce dallo schermo');
    esigi(/overflow-wrap:anywhere/.test(String(m.html).split('Nuove iscrizioni del')[1] || ''), 'e gli indirizzi lunghi (una PEC di studio) vanno a capo');

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

    console.log('\nUna notte la posta non risponde: la notte dopo recupera');
    let n0 = spedite.length;
    aderente('gina', { nome: 'Gina', cognome: 'Rota', email: 'gina@rota.it', telefono: '341', fatturazione: FAT(), primaVolta: ms('2027-02-06T10:00:00Z'), quando: ms('2027-02-06T10:00:00Z') });
    postaGiu = 1;
    orologio = ms('2027-02-06T23:00:05Z');
    r = await gira();
    let esG = r.corpo.esiti.find(e => e.quota) || {};
    esigi(spedite.length === n0 && esG.errore, 'la mail non parte', JSON.stringify(esG));
    esigi(dati.get('meta/riepilogoAderenti-milano-2027-aderenti').ultimoGiorno === '2027-02-05', 'e il giorno torna da spedire', JSON.stringify(dati.get('meta/riepilogoAderenti-milano-2027-aderenti')));
    aderente('ivo', { nome: 'Ivo', cognome: 'Sala', email: 'ivo@sala.it', telefono: '342', fatturazione: FAT(), primaVolta: ms('2027-02-07T09:00:00Z'), quando: ms('2027-02-07T09:00:00Z') });
    orologio = ms('2027-02-07T23:00:05Z');
    r = await gira();
    m = spedite[n0] || {};
    esigi(spedite.length === n0 + 1 && m.subject === 'Iscrizioni aderenti Milano - 2 nuove dal 06/02/2027 al 07/02/2027 (totale 7)', 'la notte dopo: una mail con i due giorni', m.subject);
    esigi(/Gina Rota/.test(m.html) && /Ivo Sala/.test(m.html) && /iscrizione 06\/02 alle 11:00/.test(m.html) && /iscrizione 07\/02 alle 10:00/.test(m.html), 'Gina del 6 e Ivo del 7, con il giorno accanto all\'ora');
    esigi(/Nuove iscrizioni dal 06\/02\/2027 al 07\/02\/2027/.test(m.html), 'e il titolo dice il periodo');

    console.log('\nSe la parte delle aziende si rompe, gli aderenti partono lo stesso');
    n0 = spedite.length;
    aderente('lia', { nome: 'Lia', cognome: 'Moro', email: 'lia@moro.it', telefono: '343', fatturazione: FAT(), primaVolta: ms('2027-02-08T09:00:00Z'), quando: ms('2027-02-08T09:00:00Z') });
    rompiLettura.add('iscrizioni');
    orologio = ms('2027-02-08T23:00:05Z');
    r = await gira();
    esigi(r.stato === 200 && r.corpo.esiti.some(e => e.evento === '' && e.errore), 'le aziende danno errore', JSON.stringify(r.corpo));
    esigi(spedite.length === n0 + 1 && /Lia Moro/.test(spedite[n0].html), 'e la mail degli aderenti parte');

    console.log('\nL\'anteprima di oggi non segna niente');
    n0 = spedite.length;
    aderente('mia', { nome: 'Mia', cognome: 'Fumo', email: 'mia@fumo.it', telefono: '344', fatturazione: FAT(), primaVolta: ms('2027-02-09T09:00:00Z'), quando: ms('2027-02-09T09:00:00Z') });
    orologio = ms('2027-02-09T10:00:00Z');
    r = await gira({ giorno: '2027-02-09' });
    esigi(r.corpo.anteprima === true && spedite.length === n0 + 1 && /^Anteprima: Iscrizioni aderenti Milano - 1 nuova il 09\/02\/2027/.test(spedite[n0].subject), 'parte un\'anteprima', spedite[n0] && spedite[n0].subject);
    esigi(dati.get('meta/riepilogoAderenti-milano-2027-aderenti').ultimoGiorno === '2027-02-08', 'il giorno non si segna');
    aderente('nino', { nome: 'Nino', cognome: 'Lupo', email: 'nino@lupo.it', telefono: '345', fatturazione: FAT(), mail: false, primaVolta: ms('2027-02-09T15:00:00Z'), quando: ms('2027-02-09T15:00:00Z') });
    orologio = ms('2027-02-09T23:00:05Z');
    r = await gira();
    m = spedite[n0 + 1] || {};
    esigi(spedite.length === n0 + 2 && /^Iscrizioni aderenti Milano - 2 nuove il 09\/02\/2027/.test(m.subject || ''), 'a mezzanotte la mail vera, con chi si e\' iscritto dopo la prova', m.subject);
    esigi(/Mia Fumo/.test(m.html) && /Nino Lupo/.test(m.html), 'Mia e Nino');
    const [, nino] = String(m.html).split('Nino Lupo');
    esigi(/NON è partita: scrivigli tu/.test((nino || '').split('Dati per la fattura')[0]) && /NON è partita/.test(m.text), 'a Nino la mail non era partita: il riepilogo lo dice');
    esigi(!/NON è partita/.test(String(m.html).split('Nino Lupo')[0]), 'solo per lui');

    console.log('\nforza su un giorno non ancora coperto non salta i giorni prima');
    n0 = spedite.length;
    aderente('olga', { nome: 'Olga', cognome: 'Rizzi', email: 'olga@rizzi.it', telefono: '346', fatturazione: FAT(), primaVolta: ms('2027-02-11T09:00:00Z'), quando: ms('2027-02-11T09:00:00Z') });
    aderente('pino', { nome: 'Pino', cognome: 'Vela', email: 'pino@vela.it', telefono: '347', fatturazione: FAT(), primaVolta: ms('2027-02-12T09:00:00Z'), quando: ms('2027-02-12T09:00:00Z') });
    dati.set('meta/riepilogoAderenti-milano-2027-aderenti', { ultimoGiorno: '2027-02-10' });
    orologio = ms('2027-02-13T10:00:00Z');
    r = await gira({ giorno: '2027-02-12', forza: '1' });
    m = spedite[n0] || {};
    esigi(/Olga Rizzi/.test(m.html || '') && /Pino Vela/.test(m.html || '') && /dal 11\/02\/2027 al 12\/02\/2027/.test(m.subject || ''), 'copre l\'11 e il 12', m.subject);
    esigi(dati.get('meta/riepilogoAderenti-milano-2027-aderenti').ultimoGiorno === '2027-02-12', 'e segna il 12');
    r = await gira({ giorno: '2027-02-11', forza: '1' });
    esigi(dati.get('meta/riepilogoAderenti-milano-2027-aderenti').ultimoGiorno === '2027-02-12' && /^Iscrizioni aderenti Milano - 1 nuova il 11\/02\/2027/.test((spedite[n0 + 1] || {}).subject || ''),
        'forza su un giorno gia\' coperto: rispedisce quello, senza tornare indietro', (spedite[n0 + 1] || {}).subject);

    console.log('\nLa funzione si ferma a meta\' (posta che non risponde): il giorno resta da spedire');
    n0 = spedite.length;
    aderente('rita', { nome: 'Rita', cognome: 'Bosco', email: 'rita@bosco.it', telefono: '348', fatturazione: FAT(), primaVolta: ms('2027-02-13T09:00:00Z'), quando: ms('2027-02-13T09:00:00Z') });
    postaFerma = true;
    orologio = ms('2027-02-13T23:00:05Z');
    gira();                                   // non finisce mai: Vercel la chiuderebbe
    await new Promise(f => setImmediate(f));
    await new Promise(f => setImmediate(f));
    postaFerma = false;
    const metaFermo = dati.get('meta/riepilogoAderenti-milano-2027-aderenti');
    esigi(metaFermo.ultimoGiorno === '2027-02-12' && metaFermo.inCorso && metaFermo.inCorso.giorno === '2027-02-13', 'il 13 non risulta spedito, solo "in corso"', JSON.stringify(metaFermo));
    aderente('sara', { nome: 'Sara', cognome: 'Neve', email: 'sara@neve.it', telefono: '349', fatturazione: FAT(), primaVolta: ms('2027-02-14T09:00:00Z'), quando: ms('2027-02-14T09:00:00Z') });
    orologio = ms('2027-02-14T23:00:05Z');
    r = await gira();
    m = spedite[n0] || {};
    esigi(/Rita Bosco/.test(m.html || '') && /Sara Neve/.test(m.html || '') && /dal 13\/02\/2027 al 14\/02\/2027/.test(m.subject || ''), 'la notte dopo recupera il 13', m.subject);
    esigi(!dati.get('meta/riepilogoAderenti-milano-2027-aderenti').inCorso, 'e l\'"in corso" e\' tolto');

    console.log('\nLa prima notte in assoluto: se fallisce, la notte dopo riparte dal giorno del cambio');
    // come se il riepilogo avesse preso il posto degli avvisi il 15 febbraio
    const QUOTA = require(path.join(__dirname, '..', 'lib/iscrizioni-aderenti.js')).QUOTE[0];
    const dalVero = QUOTA.riepilogoDal;
    QUOTA.riepilogoDal = '2027-02-15';
    n0 = spedite.length;
    dati.delete('meta/riepilogoAderenti-milano-2027-aderenti');
    aderente('tea', { nome: 'Tea', cognome: 'Prima', email: 'tea@prima.it', telefono: '350', fatturazione: FAT(), primaVolta: ms('2027-02-15T09:00:00Z'), quando: ms('2027-02-15T09:00:00Z') });
    // la prima notte non si leggono nemmeno le iscrizioni: sul documento meta non si scrive niente
    rompiLettura.add('iscrizioniAderenti');
    orologio = ms('2027-02-15T23:00:05Z');
    r = await gira();
    esigi(spedite.length === n0 && !dati.has('meta/riepilogoAderenti-milano-2027-aderenti'), 'la prima notte fallisce prima di cominciare');
    aderente('ugo', { nome: 'Ugo', cognome: 'Dopo', email: 'ugo@dopo.it', telefono: '351', fatturazione: FAT(), primaVolta: ms('2027-02-16T09:00:00Z'), quando: ms('2027-02-16T09:00:00Z') });
    postaGiu = 1;
    orologio = ms('2027-02-16T23:00:05Z');
    r = await gira();
    esigi(spedite.length === n0 && dati.get('meta/riepilogoAderenti-milano-2027-aderenti').ultimoGiorno === '2027-02-14',
        'la seconda la posta non risponde: resta segnato il giorno prima del cambio', JSON.stringify(dati.get('meta/riepilogoAderenti-milano-2027-aderenti')));
    orologio = ms('2027-02-17T23:00:05Z');
    r = await gira();
    m = spedite[n0] || {};
    esigi(/Tea Prima/.test(m.html || '') && /Ugo Dopo/.test(m.html || '') && /dal 15\/02\/2027 al 17\/02\/2027/.test(m.subject || ''), 'la terza ci sono tutti, dal giorno del cambio', m.subject);
    QUOTA.riepilogoDal = dalVero;

    console.log('\nUn giro in corso (anche per un altro giorno) ferma gli altri: niente doppioni');
    n0 = spedite.length;
    aderente('vera', { nome: 'Vera', cognome: 'Lago', email: 'vera@lago.it', telefono: '352', fatturazione: FAT(), primaVolta: ms('2027-02-18T09:00:00Z'), quando: ms('2027-02-18T09:00:00Z') });
    orologio = ms('2027-02-18T23:00:05Z');
    dati.set('meta/riepilogoAderenti-milano-2027-aderenti', Object.assign({}, dati.get('meta/riepilogoAderenti-milano-2027-aderenti'),
        { inCorso: { giorno: '2027-02-16', da: orologio - 30000, id: 'manuale' } }));
    r = await gira();
    esigi(spedite.length === n0 && (r.corpo.esiti.find(e => e.quota) || {}).gia, 'una chiamata a mano sta spedendo: il lavoro aspetta', JSON.stringify(r.corpo.esiti));
    esigi(dati.get('meta/riepilogoAderenti-milano-2027-aderenti').inCorso.id === 'manuale', 'e non tocca l\'"in corso" dell\'altro');
    orologio = ms('2027-02-19T23:00:05Z');
    r = await gira();
    esigi(spedite.length === n0 + 1 && /Vera Lago/.test(spedite[n0].html) && /dal 18\/02\/2027 al 19\/02\/2027/.test(spedite[n0].subject), 'la notte dopo (giro di prima scaduto) recupera il 18', (spedite[n0] || {}).subject);

    console.log('\nTrenta iscrizioni in un giorno: la mail resta sotto il taglio di Gmail');
    n0 = spedite.length;
    for (let k = 0; k < 30; k++) {
        aderente('tanti' + k, { nome: 'Persona' + k, cognome: 'Con Un Cognome Lungo', email: 'persona.numero' + k + '@studio-associati-esempio.it', telefono: '+39 333 123 45' + String(k).padStart(2, '0'),
            studio: 'Studio Associato Esempio di Professionisti', citta: 'Reggio nell\'Emilia', note: 'Vegetariano, nessuna allergia nota, arrivo alle 20',
            fatturazione: FAT({ intestatario: 'Studio Associato Esempio di Professionisti S.t.p.', pec: 'studio.associato.esempio@pec.it', emailFatture: 'amministrazione.fatture@studio-associati-esempio.it', indirizzo: 'Via Giuseppe Garibaldi 123/B' }),
            primaVolta: ms('2027-02-20T09:00:00Z') + k * 60000, quando: ms('2027-02-20T09:00:00Z') + k * 60000 });
    }
    orologio = ms('2027-02-20T23:00:05Z');
    r = await gira();
    m = spedite[n0] || {};
    const kb = Buffer.byteLength(String(m.html || ''), 'utf8') / 1024;
    esigi(spedite.length === n0 + 1 && /30 nuove/.test(m.subject) && kb < 95, 'trenta persone, ' + kb.toFixed(1) + ' KB di HTML: sotto i 95');
    esigi(/Persona29 Con Un Cognome Lungo/.test(m.html) && /Apri le iscrizioni nell'area riservata/.test(m.html), 'e c\'e\' tutto, fino all\'ultima persona e al pulsante');

    console.log('\n' + ok + ' verdi, ' + ko + ' rossi');
    require('fs').writeFileSync(process.env.ANTEPRIMA || '/dev/null', (spedite[0] || {}).html || '');
    if (process.env.ANTEPRIMA_ADERENTI) require('fs').writeFileSync(process.env.ANTEPRIMA_ADERENTI, (spedite[prima] || {}).html || '');
    process.exit(ko ? 1 : 0);
})();
