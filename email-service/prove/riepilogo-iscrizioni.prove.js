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
     - nella STESSA mail delle aziende (una sola per notte), con le
       iscrizioni arrivate nel giorno e i dati per la fattura, le note per
       la cena e la quota;
     - chi ha corretto il modulo quel giorno sta fra le "aggiornate", con
       i campi della fatturazione cambiati; chi ha corretto il giorno
       stesso dell'iscrizione resta fra le nuove, con i dati nuovi;
     - niente "in attesa" ne' "confermata": la conferma qui non c'e';
     - i totali e le fatture da emettere (quelle segnate emesse no);
     - senza niente di nuovo niente mail, e una volta sola per notte;
     - aziende e aderenti della stessa notte stanno in una mail sola;
     - se una notte la posta non risponde, la notte dopo la mail copre
       anche il giorno rimasto indietro ("dal ... al ...");
     - un errore nella parte delle aziende non ferma quella degli aderenti
       (la mail parte, e dice che le aziende non si sono lette);
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
       oltre i quali Gmail la tronca; anche con cento aziende in attesa e
       venti confermate la stessa notte: gli aderenti vengono prima, interi,
       e gli elenchi delle aziende si accorciano dicendo quante ne mancano;
     - una parte gia' mandata o non letta non mette zeri: una riga lo dice;
     - se la mail parte e poi Firestore non risponde, niente doppioni.
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
let rompiDopoPosta = false;       // la prima scrittura dopo la prossima mail spedita fallisce
let scritturaRotta = false;
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
        if (scritturaRotta) { scritturaRotta = false; throw new Error('firestore giu\''); }
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
    if (n === 'nodemailer') return { createTransport: () => ({ sendMail: async m => { if (postaFerma) return new Promise(() => { }); if (postaGiu > 0) { postaGiu--; throw new Error('posta giu\''); } spedite.push(m); if (rompiDopoPosta) { rompiDopoPosta = false; scritturaRotta = true; } return {}; } }) };
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
const QP = require('nodemailer/lib/qp');   // la codifica vera della parte HTML (il 'nodemailer' finto sopra e' solo il trasporto)
const inPosta = html => QP.wrap(QP.encode(Buffer.from(String(html || ''), 'utf8')), 76).length;
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
    /* Il totale delle aziende conta chi e' nell'elenco e non aspetta la
       conferma: Anna e Carla, che hanno confermato, e chi una mail da
       confermare non l'ha (Fabio inserito a mano, Ugo dal desk, Ida importata),
       come i riquadri dell'area riservata. Aderenti ancora nessuno. */
    esigi(/2 confermate/.test(m.subject) && /aziende 5, con gli aderenti 5/.test(m.subject) && /2 in attesa/.test(m.subject), 'oggetto: due confermate, cinque aziende, cinque con gli aderenti, due in attesa', m.subject);
    esigi(/Totale aziende<\/td>[\s\S]*?>5<\/td>/.test(m.html) && /Totale aziende \+ aderenti<\/td>[\s\S]*?>5<\/td>/.test(m.html), 'nel riquadro: totale aziende e totale aziende + aderenti');
    esigi(/Totale aziende: le persone iscritte al convegno/.test(m.html) && /Totale aziende: 5\nAderenti: 0\nTotale aziende \+ aderenti: 5/.test(m.text), 'con la frase che dice che cosa conta ciascuno, anche nel testo semplice');
    esigi(!/Iscrizioni totali/.test(m.html), 'e senza un terzo "totale" che direbbe un altro numero');
    const [conf, attesa] = m.html.split('Aziende: in attesa di conferma email');
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
    esigi(/AZIENDE: IN ATTESA DI CONFERMA EMAIL\n- Bruno Rossi/.test(m.text), 'anche nella versione senza formattazione');
    // la prima notte gli aderenti non hanno ancora un giorno spedito: il periodo e' la settimana di recupero
    esigi(/^Iscrizioni Milano del 15\/01\/2027 - aziende: 2 confermate, 2 in attesa; aderenti dal 09\/01\/2027 al 15\/01\/2027: 0 nuove \(aziende 5, con gli aderenti 5\)$/.test(m.subject), 'una mail sola: aziende e aderenti nell\'oggetto', m.subject);

    console.log('\nUna volta sola');
    r = await gira();
    esigi(spedite.length === 1 && r.corpo.esiti[0].aziende.gia, 'il secondo giro della stessa notte non rispedisce', JSON.stringify(r.corpo));

    console.log('\nIl giorno dopo: chi conferma passa fra le nuove');
    dati.set('iscrizioni/b', Object.assign({}, dati.get('iscrizioni/b'), { emailConfermata: { quando: ms('2027-01-16T08:00:00Z') } }));
    orologio = ms('2027-01-16T23:00:05Z');
    r = await gira();
    m = spedite[1] || {};
    const [conf2, attesa2] = (m.html || '').split('Aziende: in attesa di conferma email');
    esigi(/Bruno Rossi/.test(conf2) && !/Bruno/.test(attesa2 || ''), 'Bruno ha confermato: ora e\' fra le nuove, non piu\' in attesa');
    esigi(!/Anna/.test(conf2), 'Anna non torna: era nuova ieri');
    esigi(/Ivo/.test(attesa2 || '') && /Gino/.test(attesa2 || '') && !/Fabio/.test(m.html || ''), 'Ivo resta in attesa, e si aggiunge Gino');
    esigi(/aziende 6/.test(m.subject || ''), 'sei aziende: si e\' aggiunto Bruno', m.subject);

    console.log('\nNiente da dire, niente mail');
    // confermano gli ultimi due dal sito; Fabio e Ugo non confermano mai, e non tengono viva la mail
    ['i', 'g'].forEach(k => dati.set('iscrizioni/' + k, Object.assign({}, dati.get('iscrizioni/' + k), { emailConfermata: { quando: ms('2027-01-17T08:00:00Z') } })));
    orologio = ms('2027-01-18T23:00:05Z');
    r = await gira();
    esigi(spedite.length === 2 && r.corpo.esiti[0].aziende.nuove === 0 && r.corpo.esiti[0].vuota, 'senza conferme nuove e senza attese non parte niente', JSON.stringify(r.corpo));

    console.log('\nMezzanotte d\'estate (22 UTC) e chiamata a mano');
    orologio = ms('2026-07-10T22:00:05Z');
    r = await gira();
    esigi(r.corpo.giorno === '2026-07-10' && !r.corpo.saltato, 'd\'estate gira alle 22 UTC', JSON.stringify(r.corpo));
    r = await gira({ giorno: '2027-01-15', forza: '1' });
    esigi(spedite.length === 3, 'a mano con forza=1 si rispedisce un giorno');
    r = await gira({}, 'sbagliato');
    esigi(r.stato === 401, 'senza il segreto non risponde');

    console.log('\nGli aderenti, nella stessa mail: i dati per la fattura');
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
    esigi(spedite.length === prima + 1, 'parte una mail sola (le aziende quella notte non hanno niente di nuovo)', String(spedite.length - prima));
    m = spedite[prima] || {};
    const esA = (((r.corpo.esiti || [])[0] || {}).aderenti || []).find(e => e.quota === 'milano-2027-aderenti') || {};
    esigi(esA.nuove === 2 && esA.aggiornate === 1 && esA.totale === 4 && r.corpo.esiti[0].inviata === 5, 'l\'esito del lavoro la conta', JSON.stringify(r.corpo.esiti));
    esigi(m.to === 'andreamissori@revilaw.it, pierluigisterzi@revilaw.it, ombrettamagaraci@revilaw.it, sergiomiele@revilaw.it, vincenzoantonionapolitano@revilaw.it',
        'agli stessi cinque del riepilogo delle aziende', m.to);
    esigi(/^Iscrizioni Milano del 03\/02\/2027 - aziende: 0 confermate; aderenti: 2 nuove, 1 aggiornata \(aziende \d+, con gli aderenti \d+\)$/.test(m.subject), 'oggetto: aziende e aderenti, nuove e aggiornate, i due totali', m.subject);
    // dopo il titolo delle nuove; le aggiornate cominciano con la loro spiegazione
    const [nuoveA, aggA] = (String(m.html || '').split('Aderenti: nuove iscrizioni del 03/02/2027')[1] || '').split('Iscrizioni arrivate nei giorni scorsi');
    const sezAd = (String(m.html || '').split('Aderenti: nuove iscrizioni del 03/02/2027')[1] || '').split('Apri le iscrizioni')[0];
    esigi(/Anna Verdi/.test(nuoveA) && /Bruno Neri/.test(nuoveA) && !/Carla/.test(nuoveA), 'fra le nuove: chi si e\' iscritto oggi');
    esigi(/iscrizione alle 10:00/.test(nuoveA) && /iscrizione alle 15:00, corretta alle 18:00/.test(nuoveA), 'con l\'ora, e l\'ora della correzione per chi ha corretto subito');
    esigi(/Bruno Neri<\/b>/.test(nuoveA) && /bruno@pec\.it/.test(nuoveA) && !/Bruno N\.</.test(nuoveA), 'Bruno con i dati della correzione');
    esigi(/Carla Bassi/.test(aggA || '') && /aggiornata alle 12:00/.test(aggA || '') && /Cambiati: Intestatario, PEC\./.test(aggA || ''), 'Carla fra le aggiornate, con i campi cambiati');
    esigi(/Carla Nuova Srl/.test(aggA || '') && !/Carla Vecchia/.test(m.html), 'e i dati nuovi, non quelli vecchi');
    esigi(!/Dario/.test(m.html) && !/Ezio/.test(m.html), 'non c\'e\' chi non ha fatto niente oggi, ne\' un\'altra quota');
    esigi(/04641610235/.test(nuoveA) && /M5UXCR1/.test(nuoveA) && /Via Roma 1, 37121 Verona \(VR\)/.test(nuoveA) && /amministrazione@studio\.it/.test(nuoveA),
        'per ogni persona i dati per la fattura');
    esigi(/244,00 €/.test(nuoveA) && /Celiaco/.test(nuoveA) && /nessuna/.test(nuoveA), 'la quota e le note per la cena (anche quando non ci sono)');
    esigi(/Aderenti: fatture da emettere/.test(m.html) && /3 \(732,00 €\)/.test(m.html), 'fatture da emettere: tre, la fattura di Dario e\' gia\' emessa');
    esigi(sezAd && !/In attesa di conferma|confermata alle|Conferma il tuo indirizzo|attendono/i.test(sezAd) && !/IN ATTESA/.test(m.text.split('ADERENTI: NUOVE ISCRIZIONI')[1] || 'IN ATTESA'),
        'niente "in attesa" ne\' "confermata" fra gli aderenti: per loro la conferma non c\'e\'');
    esigi(/Aziende: iscrizioni confermate il 03\/02\/2027/.test(m.html) && /Nessuna nuova conferma nella giornata/.test(m.html), 'e la parte delle aziende c\'e\' lo stesso, vuota');
    esigi(/non c'è la conferma dell'email/.test(m.html), 'e la mail lo dice');
    esigi(/area-riservata\/#eventi/.test(m.html) && /area-riservata\/#eventi/.test(m.text), 'c\'e\' il collegamento all\'area riservata');
    esigi(/ADERENTI: NUOVE ISCRIZIONI DEL 03\/02\/2027\n[\s\S]*?\nIscritti: 4\n- Anna Verdi \(iscrizione alle 10:00\)/.test(m.text) && /ADERENTI: ISCRIZIONI AGGIORNATE\n- Carla Bassi/.test(m.text)
        && /Fattura: Intestatario Studio Verdi Associati; Partita IVA 04641610235/.test(m.text), 'anche nella versione senza formattazione');
    esigi(/non c'è la conferma dell'email/.test(m.text) && /Cena: Venerdì 26 febbraio 2027 - Meeting degli aderenti: Sabato 27 febbraio 2027 - Quota: 200 € \+ IVA/.test(m.text)
        && /«Aderenti» › «Apri le iscrizioni»/.test(m.text), 'e il testo semplice dice anche date, quota, niente conferma e dove trovarle');
    esigi(/Aziende: nessuna nuova iscrizione confermata\. Aderenti: 2 nuove iscrizioni alla cena e al meeting, una aggiornata; fatture da emettere: 3 \(732,00 € IVA inclusa\)\. Totale aziende: \d+; totale aziende \+ aderenti: \d+\./.test(m.text),
        'il sommario, in italiano corretto', (m.text || '').split('\n\n')[1]);
    esigi(/Cena e meeting degli aderenti Revilaw - Cena: Venerdì 26 febbraio 2027 - Meeting degli aderenti: Sabato 27 febbraio 2027 - Quota: 200 € \+ IVA\. Iscritti: 4\./.test(m.html),
        'la parte degli aderenti dice cena, meeting, quota e quanti sono');
    esigi(/Riepilogo iscrizioni del 03\/02\/2027/.test(m.html) && (String(m.html).match(/<html/g) || []).length === 1, 'una testata sola, quella dell\'evento');
    esigi(!/white-space:nowrap/.test(String(m.html).split('Aderenti: nuove iscrizioni del')[1] || 'x'), 'nessun pezzo degli aderenti che non va a capo: sul telefono non esce dallo schermo');
    esigi(/overflow-wrap:anywhere/.test(String(m.html).split('Aderenti: nuove iscrizioni del')[1] || ''), 'e gli indirizzi lunghi (una PEC di studio) vanno a capo');

    r = await gira();
    esigi(spedite.length === prima + 1 && (((r.corpo.esiti[0] || {}).aderenti || [])[0] || {}).gia, 'il secondo giro della notte non rispedisce');

    orologio = ms('2027-02-04T23:00:05Z');
    r = await gira();
    esigi(spedite.length === prima + 1, 'una notte senza iscrizioni nuove o corrette: niente mail');

    console.log('\nLa stessa notte, aziende e aderenti: una mail sola');
    scheda('k', { nome: 'Katia', cognome: 'Ferri', email: 'katia@x.it', data: '05/02/2027 09:00:00', ricevuto: T('2027-02-05T08:00:00Z'), emailConfermata: { quando: ms('2027-02-05T08:30:00Z') } });
    aderente('fabio', { nome: 'Fabio', cognome: 'Conti', email: 'fabio@conti.it', telefono: '340 1', fatturazione: FAT(), primaVolta: ms('2027-02-05T16:00:00Z'), quando: ms('2027-02-05T16:00:00Z') });
    orologio = ms('2027-02-05T23:00:05Z');
    r = await gira();
    const una = spedite.slice(prima + 1);
    esigi(una.length === 1 && /aziende: 1 confermata; aderenti: 1 nuova/.test(una[0].subject), 'una mail sola, con tutti e due', una.map(x => x.subject).join(' | '));
    const hUna = String((una[0] || {}).html || '');
    esigi(/Katia Ferri/.test(hUna) && /Fabio Conti/.test(hUna) && hUna.indexOf('Fabio Conti') < hUna.indexOf('Katia Ferri')
        && hUna.indexOf('Fabio Conti') > hUna.indexOf('Aderenti: nuove iscrizioni del')
        && hUna.indexOf('Katia Ferri') > hUna.indexOf('Aziende: iscrizioni confermate il'), 'prima gli aderenti (i dati per la fattura), poi le aziende, ognuno nella sua parte');
    const tUna = String((una[0] || {}).text || '');
    esigi(tUna.indexOf('ADERENTI: NUOVE ISCRIZIONI') > 0 && tUna.indexOf('ADERENTI: NUOVE ISCRIZIONI') < tUna.indexOf('AZIENDE: ISCRIZIONI CONFERMATE'), 'e lo stesso ordine nel testo semplice');
    esigi(r.corpo.esiti[0].aziende.nuove === 1 && r.corpo.esiti[0].aderenti[0].nuove === 1, 'e l\'esito le conta tutte e due', JSON.stringify(r.corpo.esiti[0]));

    console.log('\nUna notte la posta non risponde: la notte dopo recupera');
    let n0 = spedite.length;
    aderente('gina', { nome: 'Gina', cognome: 'Rota', email: 'gina@rota.it', telefono: '341', fatturazione: FAT(), primaVolta: ms('2027-02-06T10:00:00Z'), quando: ms('2027-02-06T10:00:00Z') });
    postaGiu = 1;
    orologio = ms('2027-02-06T23:00:05Z');
    r = await gira();
    let esG = r.corpo.esiti[0] || {};
    esigi(spedite.length === n0 && esG.errore, 'la mail non parte', JSON.stringify(esG));
    esigi(dati.get('meta/riepilogoAderenti-milano-2027-aderenti').ultimoGiorno === '2027-02-05', 'e il giorno torna da spedire', JSON.stringify(dati.get('meta/riepilogoAderenti-milano-2027-aderenti')));
    aderente('ivo', { nome: 'Ivo', cognome: 'Sala', email: 'ivo@sala.it', telefono: '342', fatturazione: FAT(), primaVolta: ms('2027-02-07T09:00:00Z'), quando: ms('2027-02-07T09:00:00Z') });
    orologio = ms('2027-02-07T23:00:05Z');
    r = await gira();
    m = spedite[n0] || {};
    esigi(spedite.length === n0 + 1 && /aderenti dal 06\/02\/2027 al 07\/02\/2027: 2 nuove/.test(m.subject || ''), 'la notte dopo: una mail con i due giorni', m.subject);
    esigi(/Gina Rota/.test(m.html) && /Ivo Sala/.test(m.html) && /iscrizione 06\/02 alle 11:00/.test(m.html) && /iscrizione 07\/02 alle 10:00/.test(m.html), 'Gina del 6 e Ivo del 7, con il giorno accanto all\'ora');
    esigi(/Aderenti: nuove iscrizioni dal 06\/02\/2027 al 07\/02\/2027/.test(m.html), 'e il titolo dice il periodo');
    esigi((String(m.html).match(/Aderenti: nuove iscrizioni dal 06\/02\/2027 al 07\/02\/2027/g) || []).length >= 2
        && /Aderenti dal 06\/02\/2027 al 07\/02\/2027: 2 nuove iscrizioni alla cena e al meeting/.test(m.text)
        && /\nAderenti: nuove iscrizioni dal 06\/02\/2027 al 07\/02\/2027: 2\n/.test(m.text), 'e lo dicono anche il sommario e il riquadro in cima');

    console.log('\nSe la parte delle aziende si rompe, gli aderenti partono lo stesso');
    n0 = spedite.length;
    aderente('lia', { nome: 'Lia', cognome: 'Moro', email: 'lia@moro.it', telefono: '343', fatturazione: FAT(), primaVolta: ms('2027-02-08T09:00:00Z'), quando: ms('2027-02-08T09:00:00Z') });
    rompiLettura.add('iscrizioni');
    orologio = ms('2027-02-08T23:00:05Z');
    r = await gira();
    esigi(r.stato === 200 && r.corpo.esiti[0].aziende.errore, 'le aziende danno errore', JSON.stringify(r.corpo));
    esigi(spedite.length === n0 + 1 && /Lia Moro/.test(spedite[n0].html), 'e la mail parte lo stesso, con gli aderenti');
    esigi(/Le iscrizioni delle aziende non si sono potute leggere stanotte/.test(spedite[n0].html), 'e dice che le aziende non si sono lette');
    esigi(!/Aziende: nuove conferme/.test(spedite[n0].html) && !/Aziende: in attesa di conferma mail/.test(spedite[n0].html) && !/aziende: 0/.test(spedite[n0].subject)
        && !/Aziende: nuove conferme/.test(spedite[n0].text), 'e nessuno zero per le aziende: non si sa quante sono', spedite[n0].subject);

    console.log('\nL\'anteprima di oggi non segna niente');
    n0 = spedite.length;
    aderente('mia', { nome: 'Mia', cognome: 'Fumo', email: 'mia@fumo.it', telefono: '344', fatturazione: FAT(), primaVolta: ms('2027-02-09T09:00:00Z'), quando: ms('2027-02-09T09:00:00Z') });
    orologio = ms('2027-02-09T10:00:00Z');
    r = await gira({ giorno: '2027-02-09' });
    esigi(r.corpo.anteprima === true && spedite.length === n0 + 1 && /^Anteprima: Iscrizioni Milano del 09\/02\/2027 - .*aderenti: 1 nuova/.test(spedite[n0].subject), 'parte un\'anteprima', spedite[n0] && spedite[n0].subject);
    esigi(dati.get('meta/riepilogoAderenti-milano-2027-aderenti').ultimoGiorno === '2027-02-08', 'il giorno non si segna');
    aderente('nino', { nome: 'Nino', cognome: 'Lupo', email: 'nino@lupo.it', telefono: '345', fatturazione: FAT(), mail: false, primaVolta: ms('2027-02-09T15:00:00Z'), quando: ms('2027-02-09T15:00:00Z') });
    orologio = ms('2027-02-09T23:00:05Z');
    r = await gira();
    m = spedite[n0 + 1] || {};
    esigi(spedite.length === n0 + 2 && /^Iscrizioni Milano del 09\/02\/2027 - .*aderenti: 2 nuove/.test(m.subject || ''), 'a mezzanotte la mail vera, con chi si e\' iscritto dopo la prova', m.subject);
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
    esigi(dati.get('meta/riepilogoAderenti-milano-2027-aderenti').ultimoGiorno === '2027-02-12' && /^Iscrizioni Milano del 11\/02\/2027 - .*aderenti: 1 nuova/.test((spedite[n0 + 1] || {}).subject || ''),
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
    esigi(spedite.length === n0 && (((r.corpo.esiti[0] || {}).aderenti || [])[0] || {}).gia, 'una chiamata a mano sta spedendo: il lavoro aspetta', JSON.stringify(r.corpo.esiti));
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

    console.log('\nTrenta aderenti e cento aziende in attesa nella stessa notte: i dati per la fattura non si tagliano');
    n0 = spedite.length;
    for (let k = 0; k < 30; k++) {
        aderente('molti' + k, { nome: 'Socio' + k, cognome: 'Con Un Cognome Lungo', email: 'socio.numero' + k + '@studio-associati-esempio.it', telefono: '+39 333 765 43' + String(k).padStart(2, '0'),
            studio: 'Studio Associato Esempio di Professionisti', citta: 'Reggio nell\'Emilia', note: 'Vegetariano, nessuna allergia nota, arrivo alle 20',
            fatturazione: FAT({ intestatario: 'Studio Socio' + k + ' S.t.p.', partitaIva: '0464161' + String(k).padStart(4, '0'), pec: 'studio.associato.esempio@pec.it', emailFatture: 'amministrazione.fatture@studio-associati-esempio.it', indirizzo: 'Via Giuseppe Garibaldi 123/B' }),
            primaVolta: ms('2027-02-21T09:00:00Z') + k * 60000, quando: ms('2027-02-21T09:00:00Z') + k * 60000 });
    }
    for (let k = 0; k < 100; k++) {
        scheda('attesa' + k, { nome: 'Attesa' + k, cognome: 'Con Un Cognome Lungo', email: 'attesa.numero' + k + '@azienda-di-esempio-con-nome-lungo.it', telefono: '+39 347 000 ' + String(k).padStart(4, '0'),
            azienda: 'Azienda di Esempio con un Nome Molto Lungo S.p.A.', ruolo: 'Direttore amministrazione, finanza e controllo',
            data: '21/02/2027 10:' + String(k % 60).padStart(2, '0') + ':00', ricevuto: T('2027-02-21T09:00:00Z') });
    }
    for (let k = 0; k < 20; k++) {
        scheda('conf' + k, { nome: 'Confermata' + k, cognome: 'Con Un Cognome Lungo', email: 'confermata.numero' + k + '@azienda-di-esempio-con-nome-lungo.it', telefono: '+39 347 111 ' + String(k).padStart(4, '0'),
            azienda: 'Azienda di Esempio con un Nome Molto Lungo S.p.A.', ruolo: 'Direttore amministrazione, finanza e controllo',
            data: '21/02/2027 11:00:00', ricevuto: T('2027-02-21T10:00:00Z'), emailConfermata: { quando: ms('2027-02-21T11:00:00Z') + k * 60000 } });
    }
    orologio = ms('2027-02-21T23:00:05Z');
    r = await gira();
    m = spedite[n0] || {};
    const kbTutti = inPosta(m.html) / 1024;
    esigi(spedite.length === n0 + 1 && /aziende: 20 confermate, \d+ in attesa; aderenti: 30 nuove/.test(m.subject || ''), 'una mail sola, con tutti', m.subject);
    esigi(kbTutti < 100, 'trenta aderenti e centoventi aziende: ' + kbTutti.toFixed(1) + ' KB di HTML come viaggia (quoted-printable), sotto il taglio di Gmail a 102');
    esigi(!/Gmail potrebbe accorciarla/.test(m.html || ''), 'e niente avviso: accorciando le aziende ci sta');
    const dopoUltimo = String(m.html || '').split('Socio29 Con Un Cognome Lungo')[1] || '';
    esigi(/Studio Socio29 S\.t\.p\./.test(dopoUltimo) && /04641610029/.test(dopoUltimo), 'l\'ultimo aderente c\'e\', con i dati per la fattura');
    const hT = String(m.html || '');
    esigi(hT.indexOf('Socio29 Con Un Cognome Lungo') < hT.indexOf('Aziende: iscrizioni confermate il 21/02/2027'), 'gli aderenti vengono prima delle aziende');
    const nAttesa = ((r.corpo.esiti[0] || {}).aziende || {}).inAttesa || 0;
    const kA = (hT.match(/&middot; iscritto il /g) || []).length, kN = (hT.match(/&middot; confermata alle /g) || []).length;
    esigi(nAttesa >= 100 && kA < 40 && new RegExp('E altri ' + (nAttesa - kA) + ', iscritti prima di questi: l\'elenco completo è nell\'area riservata').test(hT),
        'le aziende in attesa: quelle che ci stanno (' + kA + '), e quante ne restano', String(nAttesa));
    esigi(kN === 20 || new RegExp('E altre ' + (20 - kN) + ' conferme').test(hT), 'le confermate tutte, o il conto di quelle che mancano', String(kN));
    esigi(/Apri le iscrizioni nell'area riservata/.test(hT) && /Riepilogo automatico per gli organizzatori/.test(hT), 'e la mail arriva intera fino al pulsante e al piede');
    esigi(/Aziende: in attesa di conferma mail/.test(hT) && new RegExp('>' + nAttesa + '<').test(hT) && />20</.test(hT), 'il riquadro in cima le conta tutte');
    esigi(/Confermata19 Con/.test(m.text || '') && (String(m.text || '').split('IN ATTESA DI CONFERMA EMAIL')[1] || '').split('(iscritto il ').length - 1 === 40
        && new RegExp('E altri ' + (nAttesa - 40) + ', iscritti prima di questi: l\'elenco completo è nell\'area riservata').test(m.text || ''), 'il testo semplice ha le confermate e gli ultimi quaranta in attesa');
    for (let k = 0; k < 100; k++) dati.delete('iscrizioni/attesa' + k);
    for (let k = 0; k < 20; k++) dati.delete('iscrizioni/conf' + k);

    console.log('\nLe aziende del giorno gia\' mandate: nella mail degli aderenti nessuno zero per loro');
    n0 = spedite.length;
    scheda('gia1', { nome: 'Gaia', cognome: 'Spedita', email: 'gaia@x.it', data: '22/02/2027 09:00:00', ricevuto: T('2027-02-22T08:00:00Z'), emailConfermata: { quando: ms('2027-02-22T08:30:00Z') } });
    aderente('olga', { nome: 'Olga', cognome: 'Pace', email: 'olga@pace.it', telefono: '346', fatturazione: FAT(), primaVolta: ms('2027-02-22T10:00:00Z'), quando: ms('2027-02-22T10:00:00Z') });
    dati.set('meta/riepilogoIscrizioni-milano-2027-02-26', { ultimoGiorno: '2027-02-22', quando: 1 });
    orologio = ms('2027-02-22T23:00:05Z');
    r = await gira();
    m = spedite[n0] || {};
    esigi(spedite.length === n0 + 1 && /Olga Pace/.test(m.html || '') && !/Gaia Spedita/.test(m.html || '') && (r.corpo.esiti[0].aziende || {}).gia, 'parte la mail degli aderenti, senza le aziende gia\' mandate', JSON.stringify(r.corpo.esiti[0]));
    esigi(/Le iscrizioni delle aziende di questo giorno sono già state mandate/.test(m.html || '') && !/Aziende: nuove conferme/.test(m.html || '')
        && !/Aziende: in attesa di conferma mail/.test(m.html || '') && !/aziende: \d+ confermat/.test(m.subject || ''), 'lo dice, e non mette zeri al posto dei numeri', m.subject);
    dati.delete('iscrizioni/gia1');

    console.log('\nLa mail parte, poi Firestore non risponde: niente doppioni');
    n0 = spedite.length;
    scheda('dopo1', { nome: 'Dora', cognome: 'Dopo', email: 'dora@x.it', data: '23/02/2027 09:00:00', ricevuto: T('2027-02-23T08:00:00Z'), emailConfermata: { quando: ms('2027-02-23T08:30:00Z') } });
    aderente('piero', { nome: 'Piero', cognome: 'Dopo', email: 'piero@dopo.it', telefono: '347', fatturazione: FAT(), primaVolta: ms('2027-02-23T10:00:00Z'), quando: ms('2027-02-23T10:00:00Z') });
    rompiDopoPosta = true;
    orologio = ms('2027-02-23T23:00:05Z');
    r = await gira();
    esigi(spedite.length === n0 + 1 && r.corpo.esiti[0].inviata && r.corpo.esiti[0].errore, 'la mail e\' partita, e l\'esito dice anche l\'errore', JSON.stringify(r.corpo.esiti[0]));
    esigi(dati.get('meta/riepilogoIscrizioni-milano-2027-02-26').ultimoGiorno === '2027-02-23', 'le aziende restano segnate come spedite');
    esigi(dati.get('meta/riepilogoAderenti-milano-2027-aderenti').ultimoGiorno === '2027-02-23' && !dati.get('meta/riepilogoAderenti-milano-2027-aderenti').inCorso,
        'e gli aderenti si segnano al secondo tentativo', JSON.stringify(dati.get('meta/riepilogoAderenti-milano-2027-aderenti')));
    r = await gira();
    esigi(spedite.length === n0 + 1, 'un altro giro della notte non rimanda niente');
    orologio = ms('2027-02-24T23:00:05Z');
    r = await gira();
    esigi(!spedite.slice(n0 + 1).some(x => /Piero Dopo|Dora Dopo/.test(x.html || '')), 'e la notte dopo Piero e Dora non tornano');
    dati.delete('iscrizioni/dopo1');

    console.log('\nI due totali: aziende, e aziende + aderenti');
    {
        const R = require(path.join(__dirname, '..', 'lib/riepilogo-iscrizioni.js'));
        const GIRO = require(path.join(__dirname, '..', 'lib/giro-conferme.js'));
        const ev = R.EVENTI[0];
        const MI = 'Milano 26 Febbraio 2027 - Iscrizione';
        const conf = { quando: 1, come: 'mail' };
        const sc = [
            { id: 's1', dati: { pagina: MI, email: 'uno@alfa.it', data: '01/01/2027', emailConfermata: conf } },
            // un gruppo da Eventbrite: tre persone su una riga
            { id: 's2', dati: { pagina: MI, email: 'gruppo@beta.it', data: '01/01/2027', inserito: { da: 'x' }, extra: { Partecipanti: '3' } } },
            // aspetta la conferma: non conta
            { id: 's3', dati: { pagina: MI, email: 'attesa@gamma.it', data: '01/01/2027' } },
            // annullata, solo B2B, altro evento: non contano
            { id: 's4', dati: { pagina: MI, email: 'via@delta.it', data: '01/01/2027', emailConfermata: conf, annullato: { quando: 1 } } },
            { id: 's5', dati: { pagina: MI, email: 'b2b@eps.it', data: '01/01/2027', inserito: { da: 'x' }, soloB2B: true } },
            { id: 's6', dati: { pagina: 'Napoli 2 Ottobre 2026 - Iscrizione', email: 'napoli@x.it', data: '01/01/2027', emailConfermata: conf } },
            // messo fra gli aderenti da chi organizza, e non iscritto alla cena
            { id: 's7', dati: { pagina: MI, email: 'aderente@studio.it', data: '01/01/2027', emailConfermata: conf } },
            // iscritto al convegno E alla cena: e' un aderente, si conta una volta
            { id: 's8', dati: { pagina: MI, email: 'Doppio@Studio.it', data: '01/01/2027', emailConfermata: conf } },
            // spostato fra i soli incontri B2B dall'elenco
            { id: 's9', dati: { pagina: MI, email: 'spostato@zeta.it', data: '01/01/2027', emailConfermata: conf } },
            { id: 's10', dati: { pagina: MI, email: 'online@eta.it', data: '01/01/2027', emailConfermata: conf, modalita: 'online' } }
        ];
        const pres = new Map();
        pres.set(GIRO.idPresenza(ev, sc[6].dati), { modalita: 'aderenti' });
        pres.set(GIRO.idPresenza(ev, sc[8].dati), { modalita: 'b2b' });
        const ad = [
            { id: 'a1', dati: { quota: 'milano-2027-aderenti', email: 'doppio@studio.it' } },
            { id: 'a2', dati: { quota: 'milano-2027-aderenti', email: 'solo.cena@studio.it' } },
            { id: 'a3', dati: { quota: 'altra-quota', email: 'altrove@studio.it' } }
        ];
        const t = R.totali(sc, pres, ev, ad);
        esigi(t.aziende === 5, 'aziende: una confermata, un gruppo da tre, una online (fuori attesa, annullate, B2B, altri eventi e aderenti)', JSON.stringify(t));
        esigi(t.cena === 2 && t.soloConvegno === 1 && t.aderenti === 3, 'aderenti: i due della cena e quello messo fra gli aderenti del convegno');
        esigi(t.anche === 1 && t.tutti === 8, 'chi e\' al convegno e alla cena si conta una volta: 5 + 3 = 8');
        const MNGB = require(path.join(__dirname, '..', 'lib/mail-ngb.js'));
        const ma = MNGB.riepilogoSerale({ giornoTesto: '01/01/2027', ev: ev, az: null, ad: [{ c: R.contiAderenti(ad, R.QUOTE_ADERENTI[0], '2027-01-01'), dalTesto: null }], t: t }, 'https://x');
        esigi(/Totale aziende<\/td>[\s\S]*?>5<\/td>/.test(ma.html) && /Totale aziende \+ aderenti<\/td>[\s\S]*?>8<\/td>/.test(ma.html), 'con i soli aderenti la mail ha i due totali');
        esigi(/3 \(2 cena e meeting, 1 solo convegno\)/.test(ma.html) && /Un aderente è iscritto anche al convegno: si conta una volta sola/.test(ma.html), 'con gli aderenti divisi fra cena e solo convegno, e il doppio detto');
        esigi(/Iscritti: 2\./.test(ma.html) && !/Iscrizioni totali/.test(ma.html), 'gli iscritti alla cena stanno nella loro parte, non come un altro "totale"');

        // le righe che l'elenco toglie le toglie anche il totale
        const GIROx = GIRO;
        const canc = new Set([ev.chiave + '~' + GIROx.idIscritto(sc[0].dati)]);
        const tc = R.totali(sc, pres, ev, ad, canc);
        esigi(tc.aziende === 4 && tc.tutti === 7, 'una riga cancellata dall\'elenco esce anche dal totale delle aziende', JSON.stringify(tc));
        // la conferma vale per l'indirizzo: la stessa persona su due righe, una confermata
        const sc2 = sc.concat([{ id: 's11', dati: { pagina: MI, email: 'attesa@gamma.it', data: '02/01/2027', inserito: { da: 'x' }, emailConfermata: conf } }]);
        const t2 = R.totali(sc2, pres, ev, ad);
        esigi(t2.aziende === 7, 'chi ha una riga confermata con lo stesso indirizzo non aspetta piu\': conta (come nell\'elenco)', JSON.stringify(t2));
        // la pagina dell'evento come la legge l'elenco: basta "milano"
        const t3 = R.totali(sc.concat([{ id: 's12', dati: { pagina: 'NGB Milano 2027', email: 'import@x.it', data: '03/01/2027', importato: true } }]), pres, ev, ad);
        esigi(t3.aziende === 6, 'una riga importata con la pagina "NGB Milano 2027" conta, come nell\'elenco', JSON.stringify(t3));
        // un ordine da Eventbrite per tre, con l'indirizzo di un aderente della cena
        const t4 = R.totali([{ id: 'g', dati: { pagina: MI, email: 'socio@studio.it', data: '01/01/2027', inserito: { da: 'x' }, extra: { Portale: 'Eventbrite', Partecipanti: '3' } } }], new Map(), ev,
            [{ id: 'c', dati: { quota: 'milano-2027-aderenti', email: 'socio@studio.it' } }]);
        esigi(t4.aziende === 2 && t4.aderenti === 1 && t4.tutti === 3, 'un gruppo da tre con un aderente della cena: lui con la cena, gli altri due fra le aziende', JSON.stringify(t4));
        // un ordine da Eventbrite completato dall'intestatario: il compagno ha lo stesso indirizzo dello studio
        const t5 = R.totali([
            { id: 'ord|1', dati: { pagina: MI, email: 'seg@studio.it', data: '01/01/2027', inserito: { da: 'x' }, extra: { Portale: 'Eventbrite', Partecipanti: '1' } } },
            { id: 'ord|1~p2', dati: { pagina: MI, email: 'seg@studio.it', data: '01/01/2027', gruppo: 'ord|1', origine: 'partecipante', partecipanti: 1, extra: { Partecipanti: '1', Portale: 'Eventbrite' } } },
            { id: 'ord|1~p3', dati: { pagina: MI, email: 'luca@x.it', data: '01/01/2027', gruppo: 'ord|1', origine: 'partecipante', partecipanti: 1, extra: { Partecipanti: '1', Portale: 'Eventbrite' } } }
        ], new Map(), ev, [{ id: 'c', dati: { quota: 'milano-2027-aderenti', email: 'seg@studio.it' } }]);
        esigi(t5.aziende === 2 && t5.tutti === 3, 'l\'intestatario va alla cena: il compagno con lo stesso indirizzo resta fra le aziende', JSON.stringify(t5));
        // la stessa persona su due righe, una confermata: non e' "in attesa" nemmeno nella lista della mail
        const cp2 = R.conti(sc2, ev, '2027-01-02', pres);
        esigi(!cp2.inAttesa.some(p => p.email === 'attesa@gamma.it'), 'chi ha una riga confermata non e\' fra gli in attesa della mail: e\' gia\' nel totale');
        // chi e' segnato presente in sala non e' piu' "in attesa", nemmeno nella lista della mail
        const pres2 = new Map(pres);
        pres2.set(GIRO.idPresenza(ev, sc[2].dati), { stato: 'presente' });
        const cp = R.conti(sc, ev, '2027-01-01', pres2);
        const cp0 = R.conti(sc, ev, '2027-01-01', pres);
        const tp = R.totali(sc, pres2, ev, ad);
        esigi(cp0.inAttesa.some(p => p.email === 'attesa@gamma.it') && !cp.inAttesa.some(p => p.email === 'attesa@gamma.it') && tp.aziende === 6,
            'segnato presente: fuori dagli in attesa e dentro il totale', JSON.stringify(tp));
        const mz = MNGB.riepilogoSerale({ giornoTesto: '01/01/2027', ev: ev, az: { nuove: [], inAttesa: [], totale: 4 }, ad: [], t: null }, 'https://x');
        esigi(!/con gli aderenti/.test(mz.oggetto) && /Aziende: iscrizioni confermate in tutto/.test(mz.html) && /aziende confermate in tutto 4/.test(mz.oggetto) && !/Totale aziende/.test(mz.html), 'senza i totali (una lettura fallita) la mail dice le iscrizioni confermate, come prima');
    }
    {
        // le presenze non si leggono: le mail partono, senza i totali
        const n0 = spedite.length;
        rompiLettura.add('presenze');
        orologio = ms('2027-03-01T23:00:05Z');
        const r = await gira({ giorno: '2027-01-15', forza: '1' });
        const mm = spedite.slice(n0).find(x => /^Iscrizioni Milano/.test(x.subject)) || {};
        esigi(r.stato === 200 && !/con gli aderenti/.test(mm.subject || '') && /Aziende: iscrizioni confermate in tutto/.test(mm.html || ''), 'presenze non lette: la mail parte senza i due totali', mm.subject);
    }

    console.log('\nLa mail lunga: gli in attesa piu\' recenti, i nomi non latini, troppi aderenti');
    {
        const MNGB = require(path.join(__dirname, '..', 'lib/mail-ngb.js'));
        const R = require(path.join(__dirname, '..', 'lib/riepilogo-iscrizioni.js'));
        const ev = R.EVENTI[0];
        const persona = (nome, k, giorno) => ({ nome: nome, azienda: 'Azienda di Esempio con un Nome Molto Lungo S.p.A.', ruolo: 'Direttore amministrazione, finanza e controllo',
            email: 'persona.numero' + k + '@azienda-di-esempio-con-nome-lungo.it', telefono: '+39 347 000 ' + String(k).padStart(4, '0'), iscritto: giorno, ora: '10:00' });
        const socio = k => ({ nome: 'Socio' + k + ' Con Un Cognome Lungo', studio: 'Studio Associato Esempio di Professionisti', citta: 'Reggio nell\'Emilia',
            email: 'socio.numero' + k + '@studio-associati-esempio.it', telefono: '+39 333 765 4321', note: 'Vegetariano, nessuna allergia nota, arrivo alle 20', totale: 244, arrivata: 'alle 10:00',
            fatturazione: { intestatario: 'Studio Socio' + k + ' S.t.p.', partitaIva: '0464161' + String(k).padStart(4, '0'), codiceFiscale: '04641610235', codiceDestinatario: 'M5UXCR1',
                pec: 'studio.associato.esempio@pec.it', emailFatture: 'amministrazione.fatture@studio-associati-esempio.it', sede: 'Via Giuseppe Garibaldi 123/B, 42121 Reggio nell\'Emilia (RE)' } });
        const quota = (nn) => [{ c: { quota: R.QUOTE_ADERENTI[0], nuove: Array.from({ length: nn }, (_, k) => socio(k)), aggiornate: [], totale: nn, daFatturare: nn, totaleDaFatturare: nn * 244 }, dalTesto: null }];
        const tt = { aziende: 100, aderenti: 30, cena: 30, soloConvegno: 0, anche: 0, tutti: 130 };

        // quaranta che non confermano da settimane e cinque arrivati oggi: si vedono i cinque di oggi
        const vecchi = Array.from({ length: 40 }, (_, k) => persona('Vecchio' + k + ' Fermo', k, '01/02'));
        const nuovi = Array.from({ length: 5 }, (_, k) => persona('Nuovo' + k + ' DiOggi', 100 + k, '21/02'));
        const mv = MNGB.riepilogoSerale({ giornoTesto: '21/02/2027', ev: ev, az: { nuove: [], inAttesa: vecchi.concat(nuovi), totale: 10 }, ad: [], t: tt }, 'https://x');
        esigi(/Nuovo0 DiOggi/.test(mv.html) && /Nuovo4 DiOggi/.test(mv.html) && !/Vecchio0 Fermo/.test(mv.html) && /Vecchio5 Fermo/.test(mv.html)
            && /E altri 5, iscritti prima di questi: l'elenco completo è nell'area riservata, nella sezione «In attesa di conferma mail»\./.test(mv.html),
            'quarantacinque in attesa: gli ultimi quaranta, con i cinque di oggi, e i cinque piu\' vecchi contati');
        esigi(/Nuovo4 DiOggi/.test(mv.testo) && !/Vecchio4 Fermo/.test(mv.testo) && /E altri 5, iscritti prima di questi/.test(mv.testo), 'anche nel testo semplice');
        esigi(mv.html.indexOf('Vecchio39 Fermo') < mv.html.indexOf('Nuovo0 DiOggi'), 'in ordine di arrivo');
        const m1 = MNGB.riepilogoSerale({ giornoTesto: '21/02/2027', ev: ev, az: { nuove: [], inAttesa: vecchi.concat(nuovi.slice(0, 1)), totale: 10 }, ad: [], t: tt }, 'https://x');
        esigi(/E un altro, iscritto prima di questi/.test(m1.html) && /E un altro, iscritto prima di questi/.test(m1.testo), 'e uno solo si dice al singolare');

        // nomi in cirillico: la codifica li triplica, la misura lo sa
        const cir = Array.from({ length: 200 }, (_, k) => Object.assign(persona('Олександр' + k + ' Ковальчук-Шевченко', k, '21/02'), { azienda: 'ТОВ Українська Компанія з Дуже Довгою Назвою', ruolo: 'Фінансовий директор' }));
        const mc = MNGB.riepilogoSerale({ giornoTesto: '21/02/2027', ev: ev, az: { nuove: cir, inAttesa: [], totale: 200 }, ad: quota(10), t: tt }, 'https://x');
        esigi(inPosta(mc.html) < 102 * 1024 && /E altre \d+ conferme: l'elenco completo è/.test(mc.html), 'duecento nomi in cirillico: ' + (inPosta(mc.html) / 1024).toFixed(1) + ' KB come viaggia, sotto il taglio');
        esigi(/Socio9 Con Un Cognome Lungo/.test(mc.html), 'e gli aderenti ci sono tutti');

        // troppi aderenti: le aziende non si tolgono (non servirebbe), e in cima c'e' l'avviso
        const pochi = Array.from({ length: 5 }, (_, k) => Object.assign(persona('Confermata' + k + ' Qui', k, '21/02'), { ora: '11:00' }));
        const ml = MNGB.riepilogoSerale({ giornoTesto: '21/02/2027', ev: ev, az: { nuove: pochi, inAttesa: nuovi, totale: 10 }, ad: quota(60), t: tt }, 'https://x');
        const iAvviso = ml.html.indexOf('Gmail potrebbe accorciarla');
        esigi(iAvviso > 0 && iAvviso < ml.html.indexOf('Aderenti: nuove iscrizioni del') && /«Visualizza intero messaggio»/.test(ml.html), 'sessanta aderenti: l\'avviso in cima, prima degli aderenti');
        esigi(/Socio59 Con Un Cognome Lungo/.test(ml.html) && /Confermata4 Qui/.test(ml.html) && /Nuovo4 DiOggi/.test(ml.html) && !/Stanotte la mail non ha posto/.test(ml.html) && !/E altr[ie] \d/.test(ml.html),
            'e tutti interi: gli aderenti e le aziende, che toglierle non avrebbe fatto stare la mail sotto il taglio');
        const mq = MNGB.riepilogoSerale({ giornoTesto: '21/02/2027', ev: ev, az: { nuove: pochi, inAttesa: nuovi, totale: 10 }, ad: quota(30), t: tt }, 'https://x');
        esigi(!/Gmail potrebbe accorciarla/.test(mq.html) && /Confermata4 Qui/.test(mq.html), 'con trenta aderenti nessun avviso, e le aziende intere');
    }

    console.log('\n' + ok + ' verdi, ' + ko + ' rossi');
    require('fs').writeFileSync(process.env.ANTEPRIMA || '/dev/null', (spedite[0] || {}).html || '');
    if (process.env.ANTEPRIMA_ADERENTI) require('fs').writeFileSync(process.env.ANTEPRIMA_ADERENTI, (spedite[prima] || {}).html || '');
    process.exit(ko ? 1 : 0);
})();
