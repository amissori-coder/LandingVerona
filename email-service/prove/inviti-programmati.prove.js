/* ============================================================
   PROVE - invii programmati alle aziende (ritmo, motore, giro)
   ------------------------------------------------------------
       node prove/inviti-programmati.prove.js

   Niente da installare: Firestore, il server di posta e l'orologio
   sono finti e stanno qui dentro. Esce con 1 se qualcosa e' rosso,
   cosi' si puo' appendere a un controllo automatico.

   COSA DIMOSTRANO. Un invio programmato manda posta da solo, di
   notte, senza nessuno che guardi: i due modi di sbagliare sono
   spedire due volte alla stessa azienda (una PEC si paga e non si
   richiama indietro) e spedire piu' in fretta di quanto si e'
   promesso, che e' il modo per farsi bloccare dal gestore. Qui si
   verifica, caso per caso, che nessuno dei due possa succedere:

     - il RITMO: quanti messaggi entrano in un giro, quanti in una
       finestra, e che una finestra scaduta riparta dove sarebbe
       ripartita da sola invece di accumulare il ritardo del cron;
     - il MOTORE: che salti chi ha gia' ricevuto, che un rinvio
       programmato interrotto non ricominci da capo, che il timbro
       lasciato prima di spedire trasformi un'interruzione in un
       "esito ignoto" invece che in un doppione, e che un rifiuto
       che riguarda noi fermi tutto il lotto;
     - il GIRO: che due giri sovrapposti non spedscano insieme, che
       la quota della finestra si spenda su piu' giri, che sospendi
       e annulla facciano quello che dicono, e che alla fine gli
       identificativi delle aziende spariscano dall'archivio.
   ============================================================ */
'use strict';
const Module = require('module');
const path = require('path');

/* ---------- Firestore finto ----------
   Tiene i documenti in una mappa con la chiave uguale al percorso
   ("aziendeInvito/ev1~a@b.it"), cosi' le sottocollezioni non hanno
   bisogno di niente di speciale: sono percorsi piu' lunghi. Serve
   quello che usano il motore e il giro: get/set/create sui documenti,
   una query con where/orderBy/limit, le transazioni e i batch. */
let dati = {};
const INC = n => ({ __inc: n });
function eIncremento(v) { return !!(v && typeof v === 'object' && typeof v.__inc === 'number'); }
function fondi(vecchio, patch) {
    const out = Object.assign({}, vecchio || {});
    Object.keys(patch || {}).forEach(k => {
        const v = patch[k];
        if (eIncremento(v)) out[k] = (Number(out[k]) || 0) + v.__inc;
        else out[k] = v;
    });
    return out;
}
class Errore extends Error {
    constructor(msg, codice) { super(msg); this.code = codice; }
}
function rifDoc(percorso) {
    const id = percorso.split('/').pop();
    return {
        id: id, _percorso: percorso,
        collection: nome => rifColl(percorso + '/' + nome),
        get: async () => istantanea(percorso),
        set: async (patch, opz) => {
            dati[percorso] = (opz && opz.merge) ? fondi(dati[percorso], patch) : Object.assign({}, patch);
        },
        create: async patch => {
            if (Object.prototype.hasOwnProperty.call(dati, percorso)) throw new Errore('already exists', 6);
            dati[percorso] = Object.assign({}, patch);
        },
        delete: async () => { delete dati[percorso]; }
    };
}
function istantanea(percorso) {
    const esiste = Object.prototype.hasOwnProperty.call(dati, percorso);
    return { id: percorso.split('/').pop(), ref: rifDoc(percorso), exists: esiste, data: () => dati[percorso] || {} };
}
function rifColl(base) {
    const filtri = [];
    let ordina = '', tetto = 0, daValore = null;
    const q = {
        doc: id => rifDoc(base + '/' + id),
        where(campo, op, val) { filtri.push({ campo, op, val }); return q; },
        orderBy(campo) { ordina = campo || ''; return q; },
        /* startAt su un campo ordinato: e' quello che usa il giro per far
           avanzare la finestra di lettura dei lotti insieme al lavoro. */
        startAt(v) { daValore = v; return q; },
        limit(n) { tetto = n; return q; },
        select() { return q; },
        get: async () => {
            const prefisso = base + '/';
            let chiavi = Object.keys(dati).filter(k =>
                k.indexOf(prefisso) === 0 && k.slice(prefisso.length).indexOf('/') < 0);
            filtri.forEach(f => {
                chiavi = chiavi.filter(k => {
                    const v = (dati[k] || {})[f.campo];
                    if (f.op === '==') return v === f.val;
                    if (f.op === '<=') return Number(v || 0) <= Number(f.val);
                    return true;
                });
            });
            if (ordina) chiavi.sort((x, y) => (Number((dati[x] || {})[ordina]) || 0) - (Number((dati[y] || {})[ordina]) || 0));
            else chiavi.sort();
            if (daValore !== null && ordina) {
                chiavi = chiavi.filter(k => (Number((dati[k] || {})[ordina]) || 0) >= Number(daValore));
            }
            if (tetto) chiavi = chiavi.slice(0, tetto);
            const docs = chiavi.map(istantanea);
            return { size: docs.length, empty: !docs.length, docs: docs, forEach: f => docs.forEach(f) };
        }
    };
    return q;
}
const db = {
    collection: nome => rifColl(nome),
    batch() {
        const ops = [];
        return {
            set(rif, patch, opz) { ops.push(() => rif.set(patch, opz)); },
            delete(rif) { ops.push(() => rif.delete()); },
            commit: async () => { for (const o of ops) await o(); }
        };
    },
    /* Transazione finta: legge e scrive subito. Basta a provare la logica -
       le corse vere fra due giri le esclude il lucchetto, non questo. */
    async runTransaction(fn) {
        return fn({
            get: rif => rif.get(),
            set: (rif, patch, opz) => { rif.set(patch, opz); }
        });
    }
};

/* ---------- server di posta finto ---------- */
let spediti = [];
let comeVaSendMail = () => ({ messageId: 'x', response: '250 ok' });
const nodemailer = {
    createTransport: () => ({
        sendMail: async m => { spediti.push(m); return comeVaSendMail(m); },
        close: () => { }
    })
};

// ---------- intercetta i require ----------
const veroRequire = Module.prototype.require;
Module.prototype.require = function (nome) {
    if (nome === 'firebase-admin') return { firestore: { FieldValue: { increment: INC } }, apps: [] };
    if (nome === 'nodemailer') return nodemailer;
    if (nome === 'imapflow') return { ImapFlow: function () { } };
    if (nome === 'google-auth-library') return { GoogleAuth: function () { } };
    return veroRequire.apply(this, arguments);
};

/* Le variabili che servono ai due canali. Senza, CANALI.configurato()
   direbbe di no e meta' delle prove non partirebbe nemmeno. */
process.env.NEWSLETTER_SECRET = 'prova';
process.env.SMTP_HOST = 'smtp.esempio.it';
process.env.SMTP_USER = 'utente';
process.env.SMTP_PASS = 'segreto';
process.env.SMTP_FROM_EMAIL = 'noreply@esempio.it';
process.env.PEC_SMTP_USER = 'studio@pec.esempio.it';
process.env.PEC_SMTP_PASS = 'segreto';
process.env.PEC_FROM_EMAIL = 'studio@pec.esempio.it';
process.env.PEC_PAUSA_MS = '0';        // le prove non stanno ad aspettare un secondo e mezzo
process.env.INVITI_PASSO_CRON_MIN = '10';

const RADICE = path.join(__dirname, '..');
const RITMI = require(path.join(RADICE, 'lib/ritmi-invito.js'));
const P = require(path.join(RADICE, 'lib/programmazione-inviti.js'));
const MOTORE = require(path.join(RADICE, 'lib/invio-inviti.js'));
const GIRO = require(path.join(RADICE, 'lib/giro-inviti.js'));
const AZ = require(path.join(RADICE, 'lib/aziende-invito.js'));

// ---------- utilita' ----------
let ok = 0, ko = 0;
function esigi(cond, cosa, extra) {
    if (cond) { ok++; console.log('  verde  ' + cosa); }
    else { ko++; console.log('  ROSSO  ' + cosa + (extra ? '   ' + extra : '')); }
}
const MIN = 60 * 1000;
const idScheda = mail => 'ev1~' + String(mail).toLowerCase();
function azienda(mail, extra) {
    return Object.assign({
        evento: 'ev1', campagna: 'invito', ragioneSociale: 'Alfa ' + mail,
        pec: mail, email: '', stato: 'da-invitare'
    }, extra || {});
}
function scenario(schede) {
    dati = {};
    spediti = [];
    comeVaSendMail = () => ({ messageId: 'x', response: '250 ok' });
    Object.keys(schede || {}).forEach(m => { dati['aziendeInvito/' + idScheda(m)] = azienda(m, schede[m]); });
}
const MAIL = { oggetto: 'Invito', html: '<p>Ciao {ragione_sociale}</p>' };
function invia(ids, opz) {
    return MOTORE.inviaSchede(db, Object.assign({
        evento: 'ev1', campagna: 'invito', canale: 'pec',
        ids: ids.map(idScheda), mail: MAIL, email: 'chi@studio.it', fuori: {}
    }, opz || {}));
}
async function chiama(azione, corpo) {
    const r = await AZ.esegui({
        db: db, email: 'chi@studio.it', eAdmin: true,
        body: Object.assign({ sezione: 'aziende', azione: azione, evento: 'ev1', campagna: 'invito' }, corpo || {})
    });
    return r.corpo;
}
const docProg = () => dati['invitiProgrammati/ev1~invito'] || null;

// ============================================================
async function principale() {

    console.log('\nIl ritmo: quanto ne esce per giro e per finestra');
    {
        const pec = RITMI.predefinito('pec');
        esigi(pec.quanti === 250 && pec.ogniMin === 90, 'sulla PEC il ritmo predefinito e 250 ogni 90 minuti',
            JSON.stringify(pec));
        const mail = RITMI.predefinito('email');
        esigi(mail.quanti === 1000 && mail.ogniMin === 60, 'sull\'email ordinaria e 1.000 ogni ora',
            JSON.stringify(mail));
        esigi(RITMI.descrizione('pec', pec) === '250 PEC ogni 90 minuti', 'e lo si dice a parole cosi\' com\'e');

        /* Il ritmo NON deve uscire tutto nei primi minuti della finestra:
           una raffica e' esattamente il profilo che i filtri cercano. Con il
           cron ogni dieci minuti, 250 ogni novanta stanno in nove passi. */
        const q = RITMI.perGiro(pec, 10);
        esigi(q < 250 && q * 9 >= 250, 'la quota di un giro spalma la finestra invece di svuotarla subito',
            'per giro ' + q);
        /* Ma deve esserci margine per recuperare un giro saltato: senza, una
           finestra con un buco chiuderebbe sotto quanto promesso. */
        esigi(q > Math.ceil(250 / 9), 'e lascia margine per recuperare un giro saltato', 'per giro ' + q);

        const tagliato = RITMI.normalizza('pec', { quanti: 100000, ogniMin: 1 });
        esigi(tagliato.quanti <= RITMI.MAX_QUANTI.pec && tagliato.ogniMin >= RITMI.MIN_OGNI_MIN,
            'un ritmo assurdo si taglia invece di essere rifiutato', JSON.stringify(tagliato));
    }

    console.log('\nLa finestra scorrevole');
    {
        const base = { canale: 'pec', ritmo: { quanti: 250, ogniMin: 90 } };
        const mai = P.finestraDi(Object.assign({ finestra: { inizio: 0, usati: 0 } }, base));
        esigi(mai.disponibili === 250 && mai.inizio === 0, 'prima del primo messaggio la finestra non e ancora aperta');

        const adesso = 1000000000;
        const piena = P.finestraDi(Object.assign({ finestra: { inizio: adesso, usati: 250 } }, base), adesso + 5 * MIN);
        esigi(piena.disponibili === 0, 'a finestra piena non parte piu niente');
        esigi(piena.riprendeAlle === adesso + 90 * MIN, 'e si sa a che ora si riapre, non "piu tardi"');

        /* Il difetto che questa prova sorveglia: rimettendo l'inizio
           all'istante in cui il cron si accorge della scadenza, ogni finestra
           incasserebbe il ritardo del giro e il ritmo reale scenderebbe sotto
           quello promesso, senza che si veda da nessuna parte. */
        const tardi = P.finestraDi(Object.assign({ finestra: { inizio: adesso, usati: 250 } }, base), adesso + 97 * MIN);
        esigi(tardi.disponibili === 250, 'passata la finestra il conto riparte da zero');
        esigi(tardi.inizio === adesso + 90 * MIN,
            'e la finestra nuova comincia dove sarebbe cominciata da sola, non con sette minuti di ritardo',
            'inizio ' + ((tardi.inizio - adesso) / MIN) + ' minuti dopo');
        const moltoTardi = P.finestraDi(Object.assign({ finestra: { inizio: adesso, usati: 250 } }, base), adesso + 400 * MIN);
        esigi(moltoTardi.inizio === adesso + 360 * MIN, 'anche saltando quattro finestre la cadenza non si sposta');
    }

    console.log('\nIl motore: chi salta e chi no');
    {
        scenario({ 'a@x.it': {}, 'b@x.it': {}, 'c@x.it': { stato: 'esclusa' } });
        let r = await invia(['a@x.it', 'b@x.it', 'c@x.it']);
        esigi(r.inviate === 2 && r.saltate === 1, 'le escluse non ricevono niente', JSON.stringify(r.inviate + '/' + r.saltate));
        esigi(spediti.length === 2, 'e al server di posta arrivano due messaggi, non tre');
        esigi(spediti[0].to === 'a@x.it', 'un destinatario per messaggio, mai piu insieme');

        // seconda passata: nessuno riceve due volte
        spediti = [];
        r = await invia(['a@x.it', 'b@x.it']);
        esigi(r.inviate === 0 && r.saltate === 2 && !spediti.length,
            'ripassare lo stesso elenco non rispedisce a nessuno');

        // il rinvio a mano, invece, rispedisce apposta
        spediti = [];
        r = await invia(['a@x.it'], { forza: true });
        esigi(r.inviate === 1, '"manda una seconda volta" rispedisce davvero');
    }

    console.log('\nIl motore: un rinvio programmato che si interrompe non ricomincia da capo');
    {
        /* Il caso vero: si programma un RINVIO (forza) a chi aveva gia'
           ricevuto. Il primo giro serve meta' elenco e finisce il tempo. Se
           il giro dopo ripartisse da capo, le prime aziende riceverebbero il
           messaggio due volte - e questa volta a mandarlo e' una macchina che
           gira di notte. */
        scenario({ 'a@x.it': { invio: { quando: 1, canale: 'pec' } }, 'b@x.it': { invio: { quando: 1, canale: 'pec' } } });
        let r = await invia(['a@x.it'], { forza: true, prog: 'ev1~invito' });
        esigi(r.inviate === 1, 'il rinvio programmato parte a chi aveva gia ricevuto');
        spediti = [];
        r = await invia(['a@x.it', 'b@x.it'], { forza: true, prog: 'ev1~invito' });
        esigi(r.inviate === 1 && r.saltate === 1,
            'e ripassando l\'elenco salta chi ha gia ricevuto DA QUESTA programmazione', JSON.stringify(r.inviate + '/' + r.saltate));
        esigi(spediti.length === 1 && spediti[0].to === 'b@x.it', 'a partire e solo quella che mancava');
    }

    console.log('\nIl motore: il messaggio parte e l\'esito non si scrive');
    {
        scenario({ 'a@x.it': {} });
        await invia(['a@x.it']);
        esigi(!dati['aziendeInvito/' + idScheda('a@x.it')].tentativo,
            'a invio riuscito il timbro sparisce, altrimenti la scheda resterebbe bloccata per sempre');

        // la funzione muore fra il sendMail e la scrittura: resta solo il timbro
        scenario({ 'a@x.it': {} });
        dati['aziendeInvito/' + idScheda('a@x.it')].tentativo = { quando: Date.now(), canale: 'pec' };
        let r = await invia(['a@x.it']);
        esigi(r.inviate === 0 && r.saltate === 1 && !spediti.length,
            'un timbro fresco vuol dire "ci sta lavorando qualcuno": non si spedisce');

        scenario({ 'a@x.it': {} });
        dati['aziendeInvito/' + idScheda('a@x.it')].tentativo = { quando: Date.now() - 30 * MIN, canale: 'pec' };
        r = await invia(['a@x.it']);
        esigi(r.incerte === 1 && !spediti.length,
            'un timbro vecchio vuol dire "esito ignoto": NON si ritenta, si conta a parte');
        const scheda = dati['aziendeInvito/' + idScheda('a@x.it')];
        esigi(scheda.stato === 'errore' && !scheda.tentativo,
            'e la scheda finisce sotto gli occhi di una persona, non sparisce');
        esigi(/ignoto/i.test(String(scheda.errore && scheda.errore.motivo)),
            'con scritto perche, cosi chi la rimanda a mano sa cosa sta rischiando');
    }

    console.log('\nIl motore: i disiscritti e i rifiuti che riguardano noi');
    {
        scenario({ 'a@x.it': {}, 'b@x.it': {} });
        const r = await invia(['a@x.it', 'b@x.it'], { fuori: { 'a@x.it': { quando: 1 } } });
        esigi(r.disiscritte === 1 && r.inviate === 1, 'chi si e disiscritto non riceve niente, da nessuna lista');
        esigi(dati['aziendeInvito/' + idScheda('a@x.it')].stato === 'disiscritta',
            'e la scheda lo dice, cosi non ricapita al prossimo giro');

        scenario({ 'a@x.it': {}, 'b@x.it': {}, 'c@x.it': {} });
        comeVaSendMail = () => { throw new Error('421 servizio non disponibile, troppi messaggi'); };
        const r2 = await invia(['a@x.it', 'b@x.it', 'c@x.it']);
        esigi(!!r2.bloccato, 'un rifiuto che riguarda noi ferma il lotto invece di insistere');
        esigi(r2.falliti.length === 1,
            'e non marca "errore" le aziende non ancora tentate, che non c\'entrano niente',
            'fallite ' + r2.falliti.length);
    }

    console.log('\nIl motore: il tempo finisce prima dell\'elenco');
    {
        scenario({ 'a@x.it': {}, 'b@x.it': {} });
        const r = await invia(['a@x.it', 'b@x.it'], { scadenza: Date.now() - 1 });
        esigi(r.finite === false && r.inviate === 0, 'scaduto il tempo non si comincia un altro messaggio');
        esigi(dati['aziendeInvito/' + idScheda('a@x.it')].stato === 'da-invitare',
            'e le schede non toccate restano esattamente com\'erano');
    }

    console.log('\nL\'invio A MANO, che il motore condiviso non deve aver cambiato');
    {
        /* Il ciclo per-azienda e' stato tolto da dentro l'azione 'invia' e
           messo in un file suo, perche' lo usa anche il lavoro automatico.
           Questa sezione sorveglia proprio quel passaggio: l'invio guidato dal
           browser deve rispondere esattamente come prima, campo per campo,
           perche' l'area riservata quei campi li legge. */
        dati = {}; spediti = [];
        ['a@x.it', 'b@x.it'].forEach(m => { dati['aziendeInvito/' + idScheda(m)] = azienda(m); });
        const r = await chiama('invia', { canale: 'pec', ids: [idScheda('a@x.it'), idScheda('b@x.it')], mail: MAIL });
        esigi(r.ok && r.inviate === 2, 'l\'invio a mano spedisce come prima', JSON.stringify(r.inviate));
        ['canale', 'inviate', 'saltate', 'senzaRecapito', 'disiscritte', 'falliti', 'esiti', 'tettoRaggiunto', 'maxLotto', 'bloccato', 'riprendeAlle']
            .forEach(c => esigi(Object.prototype.hasOwnProperty.call(r, c),
                'la risposta porta ancora il campo "' + c + '", che l\'area riservata legge'));
        esigi(r.esiti[idScheda('a@x.it')] && r.esiti[idScheda('a@x.it')].stato === 'inviata',
            'e il dettaglio per scheda, con cui la tabella si aggiorna senza rileggere l\'elenco');

        // il tetto orario per utente vale ancora, e i gettoni non spesi tornano
        const gett = dati['invito_throttle/chi@studio.it~pec'] || {};
        esigi(gett.conteggio === 2, 'il tetto orario per utente ha contato i due invii', JSON.stringify(gett.conteggio));
        spediti = [];
        const r2 = await chiama('invia', { canale: 'pec', ids: [idScheda('a@x.it')], mail: MAIL });
        esigi(r2.ok && r2.saltate === 1 && !spediti.length, 'ripremere Invia non rispedisce a chi ha gia ricevuto');
        const gett2 = dati['invito_throttle/chi@studio.it~pec'] || {};
        esigi(gett2.conteggio === 2,
            'e il gettone prenotato per una scheda saltata torna indietro, invece di consumare il tetto',
            JSON.stringify(gett2.conteggio));
    }

    console.log('\nProgrammare: si crea, si riempie a blocchi, si accende');
    {
        scenario({ 'a@x.it': {}, 'b@x.it': {} });
        let r = await chiama('programma', {
            canale: 'pec', ritmo: { quanti: 250, ogniMin: 90 }, mail: MAIL, quando: Date.now()
        });
        esigi(r.ok && r.perLotto > 0, 'la programmazione nasce in preparazione');
        esigi(docProg().stato === 'preparazione', 'e finche non e accesa non spedisce niente');

        // un secondo tentativo sullo stesso elenco viene respinto
        const doppia = await chiama('programma', { canale: 'pec', mail: MAIL, quando: Date.now() });
        esigi(!doppia.ok && doppia.giaProgrammato,
            'due programmazioni sullo stesso elenco non possono esistere: le stesse aziende riceverebbero due messaggi');

        r = await chiama('programma-lotto', { n: 1, ids: [idScheda('a@x.it'), idScheda('b@x.it')] });
        esigi(r.ok && docProg().totale === 2, 'gli identificativi arrivano a blocchi e il conto cresce');
        // lo stesso blocco rispedito dopo un errore di rete non deve contare due volte
        await chiama('programma-lotto', { n: 1, ids: [idScheda('a@x.it'), idScheda('b@x.it')] });
        esigi(docProg().totale === 2 && docProg().lotti === 1,
            'un blocco rispedito dopo un errore di rete non conta due volte');

        r = await chiama('programma-avvia', {});
        esigi(r.ok && docProg().stato === 'programmata', 'accesa, aspetta il suo giro');
        esigi(!!dati['invitiProgrammati/ev1~invito/lotti/00001'],
            'gli identificativi stanno nella sottocollezione, non nel documento che si legge a video');
        const video = P.perVideo('ev1~invito', docProg());
        esigi(!JSON.stringify(video).includes('a@x.it'),
            'e quello che si mostra a video non contiene nessun recapito');
    }

    console.log('\nIl giro automatico');
    {
        const r = await GIRO.eseguiGiro(db);
        esigi(r.ok && r.trattate === 1, 'il giro prende la programmazione dovuta');
        esigi(spediti.length === 2, 'e spedisce le due aziende dell\'elenco', 'spediti ' + spediti.length);
        esigi(docProg().stato === 'conclusa', 'finito l\'elenco, la programmazione si chiude');
        esigi(!dati['invitiProgrammati/ev1~invito/lotti/00001'],
            'e gli identificativi delle aziende spariscono: non devono restare un secondo archivio');
        esigi(docProg().conti.inviate === 2, 'i conti restano, perche servono a chi legge dopo');
    }

    console.log('\nIl giro automatico: il ritmo e il freno');
    {
        // elenco piu' lungo della finestra, con un ritmo molto stretto
        const molte = {};
        for (let i = 0; i < 12; i++) molte['a' + i + '@x.it'] = {};
        scenario(molte);
        /* Finestra da un quarto d'ora: con il cron ogni dieci minuti ci sta
           un passo solo, quindi la quota del giro non stringe piu' della
           finestra ed e' la finestra a farsi sentire. E' il caso che
           interessa qui: il tetto per finestra. */
        await chiama('programma', { canale: 'pec', ritmo: { quanti: 3, ogniMin: 15 }, mail: MAIL, quando: Date.now() });
        await chiama('programma-lotto', { n: 1, ids: Object.keys(molte).map(idScheda) });
        await chiama('programma-avvia', {});

        await GIRO.eseguiGiro(db);
        esigi(spediti.length === 3, 'in una finestra da tre non ne partono quattro', 'partiti ' + spediti.length);
        esigi(docProg().stato === 'in-corso', 'e la programmazione resta aperta, con il resto da fare');

        const primi = spediti.length;
        await GIRO.eseguiGiro(db);
        esigi(spediti.length === primi, 'il giro subito dopo non spedisce niente: la finestra e esaurita');

        // si finge che la finestra sia passata
        docProg().finestra = { inizio: Date.now() - 16 * MIN, usati: 3 };
        await GIRO.eseguiGiro(db);
        esigi(spediti.length === primi + 3, 'passata la finestra ne partono altri tre, non tutti quelli arretrati',
            'partiti in tutto ' + spediti.length);

        /* E il caso opposto: una finestra larga NON deve svuotarsi nei primi
           minuti. Tre messaggi spalmati su un'ora, con il cron ogni dieci
           minuti, vogliono dire uno per giro - non tre subito e poi
           cinquantacinque minuti di silenzio, che e' il profilo che i filtri
           antispam cercano. */
        esigi(RITMI.perGiro({ quanti: 3, ogniMin: 60 }, 10) === 1,
            'una finestra larga si spalma sui giri invece di svuotarsi subito',
            'per giro ' + RITMI.perGiro({ quanti: 3, ogniMin: 60 }, 10));
    }

    console.log('\nUn elenco lungo: piu lotti di quanti se ne leggano in un giro');
    {
        /* IL DIFETTO CHE QUESTA PROVA SORVEGLIA. Il giro leggeva i primi
           trenta lotti e scartava quelli gia' fatti. Su cinquantamila aziende
           i lotti sono cento: appena i primi trenta erano finiti, la lettura
           tornava vuota, il giro concludeva "elenco finito" e trentacinquemila
           aziende sparivano senza che niente lo dicesse. Qui i lotti sono
           quaranta, cioe' piu' della finestra di lettura, e alla fine devono
           aver ricevuto tutte. */
        const molte = {};
        for (let i = 0; i < 40; i++) molte['b' + i + '@x.it'] = {};
        scenario(molte);
        const ids = Object.keys(molte).map(idScheda);
        await chiama('programma', { canale: 'email', ritmo: { quanti: 1000, ogniMin: 60 }, mail: MAIL, quando: Date.now() });
        // un identificativo per lotto: quaranta lotti, oltre i trenta letti per giro
        for (let i = 0; i < ids.length; i++) await chiama('programma-lotto', { n: i + 1, ids: [ids[i]] });
        const acceso = await chiama('programma-avvia', {});
        esigi(acceso.ok && acceso.lotti === 40, 'quaranta lotti, uno per azienda', 'lotti ' + acceso.lotti);

        let giri = 0;
        while (docProg() && docProg().stato !== 'conclusa' && giri < 10) { await GIRO.eseguiGiro(db); giri++; }
        esigi(docProg().stato === 'conclusa', 'la programmazione arriva in fondo', 'dopo ' + giri + ' giri');
        esigi(spediti.length === 40,
            'e NESSUNA azienda resta indietro oltre la finestra di lettura dei lotti',
            'spedite ' + spediti.length + ' su 40');
        esigi(docProg().conti.inviate === 40, 'e il conto lo dice', JSON.stringify(docProg().conti.inviate));
    }

    console.log('\nSospendi, riprendi, annulla');
    {
        /* Una programmazione tutta sua: appoggiarsi a quella lasciata dalla
           sezione precedente vuol dire che riordinare le prove le rompe, e
           una prova che si rompe per un motivo che non c'entra e' peggio di
           una prova che manca. Il ritmo e' stretto apposta, cosi' dopo il
           primo giro ne resta ancora da fare. */
        const molte = {};
        for (let i = 0; i < 6; i++) molte['c' + i + '@x.it'] = {};
        scenario(molte);
        await chiama('programma', { canale: 'pec', ritmo: { quanti: 2, ogniMin: 15 }, mail: MAIL, quando: Date.now() });
        await chiama('programma-lotto', { n: 1, ids: Object.keys(molte).map(idScheda) });
        await chiama('programma-avvia', {});
        await GIRO.eseguiGiro(db);
        esigi(spediti.length === 2 && docProg().stato === 'in-corso', 'si parte, e resta del lavoro da fare');

        let r = await chiama('programma-sospendi', {});
        esigi(r.ok && docProg().stato === 'sospesa', 'si mette in pausa');
        const prima = spediti.length;
        docProg().finestra = { inizio: 0, usati: 0 };
        await GIRO.eseguiGiro(db);
        esigi(spediti.length === prima, 'e in pausa non parte piu niente, anche se la finestra e libera');

        r = await chiama('programma-riprendi', {});
        esigi(r.ok && docProg().stato === 'programmata', 'si riprende dallo stesso punto');
        await GIRO.eseguiGiro(db);
        esigi(spediti.length === prima + 2, 'e riprende da dove era, senza rispedire ai primi due',
            'partite in tutto ' + spediti.length);

        r = await chiama('programma-annulla', {});
        esigi(r.ok && docProg().stato === 'annullata', 'si annulla');
        esigi(!dati['invitiProgrammati/ev1~invito/lotti/00001'],
            'e gli identificativi se ne vanno subito, non alla prossima pulizia');
        const dopo = spediti.length;
        await GIRO.eseguiGiro(db);
        esigi(spediti.length === dopo, 'una programmazione annullata non spedisce piu niente');
    }

    console.log('\nPiu programmazioni attive di quante ne stiano in un giro');
    {
        /* IL DIFETTO CHE QUESTA PROVA SORVEGLIA. Un giro ne lavora al massimo
           tre, e Firestore le restituisce ordinate per "quando", che non cambia
           mai: con quattro programmazioni attive le stesse tre sarebbero
           servite per sempre e la quarta non sarebbe partita mai, senza che
           niente lo dicesse. Ora si sceglie prima chi puo' davvero spedire e
           poi chi e' stato servito meno di recente.

           Perche' due aziende per elenco e un ritmo da uno all'ora: cosi'
           dopo il primo giro le prime tre restano ATTIVE con la finestra
           piena. Se finissero subito, la quarta partirebbe comunque al giro
           dopo e la prova non dimostrerebbe niente. */
        dati = {}; spediti = [];
        const eventi = ['e1', 'e2', 'e3', 'e4'];
        const chiama4 = (evento, azione, extra) => AZ.esegui({
            db: db, email: 'chi@studio.it', eAdmin: true,
            body: Object.assign({ sezione: 'aziende', azione: azione, evento: evento, campagna: 'invito' }, extra || {})
        }).then(r => r.corpo);
        for (const e of eventi) {
            const ids = [];
            for (let i = 0; i < 2; i++) {
                const m = 'z' + i + e + '@x.it';
                dati['aziendeInvito/' + e + '~' + m] = Object.assign(azienda(m), { evento: e });
                ids.push(e + '~' + m);
            }
            const r = await chiama4(e, 'programma', {
                canale: 'email', ritmo: { quanti: 1, ogniMin: 60 }, mail: MAIL, quando: Date.now()
            });
            if (!r.ok) throw new Error('programma ' + e + ': ' + r.msg);
            await chiama4(e, 'programma-lotto', { n: 1, ids: ids });
            await chiama4(e, 'programma-avvia', {});
        }
        await GIRO.eseguiGiro(db);
        esigi(spediti.length === 3, 'un giro ne lavora tre, non quattro', 'partite ' + spediti.length);
        const attive = eventi.filter(e => (dati['invitiProgrammati/' + e + '~invito'] || {}).stato === 'in-corso');
        esigi(attive.length === 3, 'e le tre servite restano attive, con la finestra piena', attive.join(', '));

        await GIRO.eseguiGiro(db);
        esigi(spediti.length === 4,
            'al giro dopo tocca alla quarta, che con le stesse tre in testa non sarebbe partita mai',
            'partite in tutto ' + spediti.length);
        esigi((dati['invitiProgrammati/e4~invito'] || {}).stato === 'in-corso',
            'ed e proprio la quarta ad essere partita',
            JSON.stringify((dati['invitiProgrammati/e4~invito'] || {}).conti));
    }

    console.log('\nIl canale spento a meta strada');
    {
        scenario({ 'a@x.it': {} });
        await chiama('programma', { canale: 'pec', mail: MAIL, quando: Date.now() });
        await chiama('programma-lotto', { n: 1, ids: [idScheda('a@x.it')] });
        await chiama('programma-avvia', {});
        const pass = process.env.PEC_SMTP_PASS;
        delete process.env.PEC_SMTP_PASS;      // come se togliessero le credenziali da Vercel
        await GIRO.eseguiGiro(db);
        process.env.PEC_SMTP_PASS = pass;
        esigi(!spediti.length, 'senza credenziali PEC non si spedisce posta ordinaria spacciandola per certificata');
        esigi(docProg().stato === 'sospesa' && /PEC/.test(String(docProg().ultimoErrore)),
            'la programmazione si mette in pausa e dice perche', String(docProg().ultimoErrore).slice(0, 60));
    }

    console.log('\n----------------------------------------------------------');
    console.log(ok + ' verifiche verdi, ' + ko + ' fallite');
    if (ko) process.exit(1);
}

principale().catch(e => { console.error('\nProve non eseguite:', e); process.exit(1); });
