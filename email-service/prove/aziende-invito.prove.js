/* ============================================================
   PROVE - lib/aziende-invito.js, caricamento dell'elenco
   ------------------------------------------------------------
       node prove/aziende-invito.prove.js

   Niente da installare: Firestore e' finto e sta qui dentro.
   Esce con 1 se qualcosa e' rosso, cosi' si puo' appendere a un
   controllo automatico.

   COSA DIMOSTRANO. Il tetto delle aziende per evento (5000) esiste
   perche' l'elenco si legge tutto insieme, e deve fermare le schede
   NUOVE. Prima fermava anche le righe che erano gia' in elenco e
   chiedevano solo un aggiornamento: chi ricaricava il proprio file
   su un evento pieno si vedeva rispondere "2250 righe lette, 0
   nuove, 0 aggiornate, 2250 oltre il limite" - il caricamento non
   faceva niente e sembrava rotto.

   Qui si verifica, caso per caso, che a elenco pieno gli
   aggiornamenti passino, che le nuove restino fuori dicendo qual e'
   il tetto, e che un aggiornamento non cancelli lo stato ne' l'esito
   dell'invito gia' spedito.

   E POI IL TETTO E' SALITO A 50.000. A quella misura l'elenco non sta
   piu' in una risposta sola ne' il file in una richiesta sola: la
   lettura va a pagine con un segnalibro, e il caricamento parte a
   blocchi dall'area riservata. Le prove coprono le due giunture, che
   sono il punto dove si perdono le righe: che le pagine non ne
   saltino ne' ne ripetano nessuna, che "anche nell'altro elenco"
   regga quando le due schede cadono su pagine diverse, che un'area
   riservata vecchia rimasta in cache riceva ancora un blocco solo, e
   che spedire il file a blocchi dia esattamente lo stesso elenco che
   si otteneva mandandolo intero - a capo dentro le virgolette
   compresi.
   ============================================================ */
'use strict';
const Module = require('module');
const path = require('path');

// ---------- Firestore finto ----------
/* Serve solo quello che usa il caricamento: il conteggio delle schede
   dell'evento, la lettura in blocco (getAll) e i batch di scrittura. */
let dati = {};
let conteggio = 0;
const DOC_ID = { __documentId: true };
const admin = {
    firestore: { FieldValue: { serverTimestamp: () => 0 }, FieldPath: { documentId: () => DOC_ID } },
    apps: []
};
/* La query che serve al servizio: filtro sull'evento, ordine per
   identificativo, segnalibro (startAfter) e tetto di pagina. Le schede
   stanno in un oggetto, quindi l'ordine lo si rifa' qui ogni volta. */
function query(filtro) {
    const q = {
        _dopo: '', _quante: 0, _campi: null,
        select() { q._campi = Array.prototype.slice.call(arguments); return q; },
        orderBy() { return q; },
        startAfter(rif) { q._dopo = rif && rif.id; return q; },
        limit(n) { q._quante = n; return q; },
        count: () => ({ get: async () => ({ data: () => ({ count: conteggio }) }) }),
        get: async () => {
            let ids = Object.keys(dati).filter(filtro).sort();
            if (q._dopo) ids = ids.filter(x => x > q._dopo);
            if (q._quante) ids = ids.slice(0, q._quante);
            const doc = ids.map(x => ({
                id: x,
                data: () => {
                    if (!q._campi) return dati[x];
                    const solo = {};
                    q._campi.forEach(c => { if (dati[x][c] !== undefined) solo[c] = dati[x][c]; });
                    return solo;
                }
            }));
            return { size: doc.length, forEach: f => doc.forEach(f) };
        }
    };
    return q;
}
const db = {
    collection() {
        return {
            doc: id => ({ id: id }),
            where: (campo, op, val) => query(id => (dati[id] || {})[campo] === val)
        };
    },
    batch() {
        const ops = [];
        return {
            set(rif, patch) { ops.push({ id: rif.id, patch: patch }); },
            commit: async () => { ops.forEach(o => { dati[o.id] = Object.assign({}, dati[o.id] || {}, o.patch); }); }
        };
    },
    async getAll() {
        return Array.prototype.slice.call(arguments).map(r => ({
            id: r.id, ref: r,
            exists: Object.prototype.hasOwnProperty.call(dati, r.id),
            data: () => dati[r.id] || {}
        }));
    }
};

// ---------- intercetta i require ----------
const veroRequire = Module.prototype.require;
Module.prototype.require = function (nome) {
    if (nome === 'firebase-admin') return admin;
    if (nome === 'nodemailer') return { createTransport: () => ({ sendMail: async () => ({}) }) };
    if (nome === 'imapflow') return { ImapFlow: function () { } };
    if (nome === 'google-auth-library') return { GoogleAuth: function () { } };
    return veroRequire.apply(this, arguments);
};

const RADICE = path.join(__dirname, '..');
const AZ = require(path.join(RADICE, 'lib/aziende-invito.js'));

// ---------- utilita' ----------
let ok = 0, ko = 0;
function esigi(cond, cosa, extra) {
    if (cond) { ok++; console.log('  verde  ' + cosa); }
    else { ko++; console.log('  ROSSO  ' + cosa + (extra ? '   ' + extra : '')); }
}
function prova(titolo, fn) { return { titolo: titolo, fn: fn }; }

const TETTO = 50000;   // MAX_AZIENDE_EVENTO: il tetto di aziende per evento

// l'id che il servizio costruisce per la campagna 'invito'
function id(mail) { return ('ev1~' + String(mail).toLowerCase()).replace(/[\/\\.#$\[\]]/g, '-'); }
const INTEST = 'Denominazione,PEC';
const csv = righe => [INTEST].concat(righe.map(r => r.join(','))).join('\n');

async function carica(testo) {
    const r = await AZ.esegui({
        db: db, email: 'chi.carica@esempio.it', eAdmin: true,
        body: { sezione: 'aziende', azione: 'importa', evento: 'ev1', campagna: 'invito', csv: testo }
    });
    return r.corpo;
}
function scenario(schede, quante) { dati = Object.assign({}, schede); conteggio = quante; }

/* L'elenco come lo legge l'area riservata: una pagina per volta, con il
   segnalibro dell'ultima scheda, e la sovrapposizione con l'altra lista
   applicata alla fine, quando le pagine sono tutte in mano. */
async function leggiElenco(campagna, aPagine) {
    const aziende = [];
    const altre = {};
    let dopo = '', pagine = 0, ultimo = null;
    for (; ;) {
        const rr = await AZ.esegui({
            db: db, email: 'chi.guarda@esempio.it', eAdmin: true,
            body: {
                sezione: 'aziende', azione: 'elenco', evento: 'ev1',
                campagna: campagna || 'invito', aPagine: aPagine !== false, dopo: dopo
            }
        });
        ultimo = rr.corpo; pagine++;
        (ultimo.aziende || []).forEach(a => aziende.push(a));
        Object.assign(altre, ultimo.altre || {});
        if (aPagine === false || !ultimo.ancora || !ultimo.cursore || pagine > 60) break;
        dopo = ultimo.cursore;
    }
    aziende.forEach(a => {
        const k = String(a.pec || a.email || '').toLowerCase();
        if (k && altre[k]) a.anche = altre[k];
    });
    return { aziende: aziende, pagine: pagine, ultima: ultimo };
}

/* La funzione dell'area riservata che spezza il file in righe si legge dal
   sorgente vero: cosi' la prova non collauda una copia che puo' divergere. */
function dallAreaRiservata(nome) {
    const testo = require('fs').readFileSync(path.join(RADICE, '..', 'area-riservata', 'app.js'), 'utf8');
    const inizio = testo.indexOf('function ' + nome + '(');
    if (inizio < 0) throw new Error('funzione ' + nome + ' non trovata in app.js');
    let i = testo.indexOf('{', inizio), graffe = 0, fine = -1;
    for (; i < testo.length; i++) {
        if (testo[i] === '{') graffe++;
        else if (testo[i] === '}') { graffe--; if (!graffe) { fine = i + 1; break; } }
    }
    return eval('(' + testo.slice(inizio, fine) + ')');
}

(async () => {
    console.log('\nCaricamento dell\'elenco aziende da invitare\n');

    console.log('Il tetto per evento');
    scenario({}, 0);
    let r = await carica(csv([['Alfa Srl', 'alfa@pec.it']]));
    esigi(r.limite === TETTO, 'il servizio dichiara il tetto di ' + TETTO + ' aziende', JSON.stringify({ limite: r.limite }));

    console.log('Evento vuoto');
    scenario({}, 0);
    r = await carica(csv([['Alfa Srl', 'alfa@pec.it'], ['Beta Spa', 'beta@pec.it'], ['Gamma Srl', 'gamma@pec.it']]));
    esigi(r.nuove === 3 && r.aggiornate === 0 && r.oltreIlLimite === 0, 'le tre righe entrano tutte', JSON.stringify(r));
    esigi(dati[id('alfa@pec.it')].stato === 'da-invitare', 'ogni scheda nuova nasce "da invitare"');

    console.log('\nElenco pieno, righe gia\' in elenco (il caso che si vedeva rotto)');
    scenario({
        [id('alfa@pec.it')]: { evento: 'ev1', campagna: 'invito', ragioneSociale: 'Alfa', stato: 'inviata', invio: { quando: 111, canale: 'pec' } },
        [id('beta@pec.it')]: { evento: 'ev1', campagna: 'invito', ragioneSociale: 'Beta', stato: 'risposta' }
    }, TETTO);
    r = await carica(csv([['Alfa Srl', 'alfa@pec.it'], ['Beta Spa', 'beta@pec.it']]));
    esigi(r.aggiornate === 2 && r.nuove === 0 && r.oltreIlLimite === 0, 'a elenco pieno gli aggiornamenti passano', JSON.stringify(r));
    esigi(dati[id('alfa@pec.it')].ragioneSociale === 'Alfa Srl', 'l\'anagrafica si aggiorna');
    esigi(dati[id('alfa@pec.it')].stato === 'inviata' && dati[id('alfa@pec.it')].invio.quando === 111,
        'stato ed esito dell\'invito gia\' spedito restano intatti');

    console.log('\nElenco pieno, righe nuove');
    scenario({}, TETTO);
    r = await carica(csv([['Delta Srl', 'delta@pec.it']]));
    esigi(r.oltreIlLimite === 1 && r.nuove === 0, 'la scheda nuova resta fuori', JSON.stringify(r));
    esigi(r.limite === TETTO && r.inElenco === TETTO, 'la risposta dice il tetto e quante ce ne sono', JSON.stringify(r));

    console.log('\nUn posto solo prima del tetto');
    scenario({ [id('alfa@pec.it')]: { evento: 'ev1', campagna: 'invito', stato: 'da-invitare' } }, TETTO - 1);
    r = await carica(csv([['Alfa Srl', 'alfa@pec.it'], ['Beta Spa', 'beta@pec.it'], ['Gamma Srl', 'gamma@pec.it']]));
    esigi(r.aggiornate === 1 && r.nuove === 1 && r.oltreIlLimite === 1,
        'entra una nuova, l\'aggiornamento passa, l\'ultima resta fuori', JSON.stringify(r));

    console.log('\nGli altri scarti, che devono restare quelli di prima');
    scenario({}, 0);
    r = await carica(csv([['Alfa Srl', 'alfa@pec.it'], ['Alfa Srl', 'alfa@pec.it'], ['', 'muta@pec.it'], ['Senza Recapito Srl', 'non-un-indirizzo']]));
    esigi(r.nuove === 1 && r.doppie === 1 && r.senzaDenominazione === 1 && r.senzaRecapito === 1,
        'doppione, riga senza denominazione e recapito storto: uno per tipo', JSON.stringify(r));

    console.log('\nScheda vecchia rimasta senza stato');
    scenario({ [id('alfa@pec.it')]: { evento: 'ev1', campagna: 'invito', ragioneSociale: 'Alfa' } }, TETTO);
    r = await carica(csv([['Alfa Srl', 'alfa@pec.it']]));
    esigi(dati[id('alfa@pec.it')].stato === 'da-invitare', 'il caricamento le mette lo stato iniziale');

    console.log('\nLettura dell\'elenco a pagine');
    /* Piu' schede di quante ne stia in una pagina (PAGINA_ELENCO = 1500):
       e' l'unico modo di verificare che il segnalibro regga e che non si
       perda ne' si ripeta nessuna riga. */
    const molte = {};
    for (let i = 0; i < 3200; i++) {
        const m = 'a' + String(i).padStart(5, '0') + '@pec.it';
        molte[id(m)] = { evento: 'ev1', campagna: 'invito', pec: m, ragioneSociale: 'Az ' + i, stato: 'da-invitare' };
    }
    // la stessa azienda anche nell'altra lista, in fondo all'ordine per identificativo
    molte['ev1~a00007@pec-it~sponsor'] = { evento: 'ev1', campagna: 'sponsor', pec: 'a00007@pec.it', ragioneSociale: 'Az 7', stato: 'inviata', invio: { quando: 999 } };
    scenario(molte, 3201);
    let e = await leggiElenco('invito');
    esigi(e.aziende.length === 3200, 'arrivano tutte le schede della campagna', e.aziende.length + ' su 3200');
    esigi(e.pagine === 3, 'in tre pagine da 1500', e.pagine + ' pagine');
    esigi(new Set(e.aziende.map(a => a.id)).size === 3200, 'nessuna riga ripetuta fra una pagina e l\'altra');
    esigi(!e.ultima.ancora && !e.ultima.cursore, 'l\'ultima pagina dice che l\'elenco e\' finito');
    const sette = e.aziende.find(a => a.pec === 'a00007@pec.it');
    esigi(!!(sette && sette.anche && sette.anche.campagna === 'sponsor'),
        '"anche nell\'altro elenco" regge anche se la gemella cade su un\'altra pagina');

    console.log('\nArea riservata vecchia, che non sa chiedere le pagine');
    e = await leggiElenco('invito', false);
    esigi(e.pagine === 1 && e.aziende.length === 3200, 'riceve un blocco solo, come prima', JSON.stringify({ pagine: e.pagine, aziende: e.aziende.length }));
    esigi(!!(e.aziende.find(a => a.pec === 'a00007@pec.it') || {}).anche, 'con la sovrapposizione gia\' applicata dal servizio');

    console.log('\nCaricamento a blocchi, come lo manda l\'area riservata');
    /* Il file non si taglia sul primo a capo: una cella fra virgolette puo'
       contenerne uno, e li' la riga non e' finita. Si verifica che spedire a
       blocchi dia esattamente lo stesso elenco di un colpo solo. */
    const spezza = dallAreaRiservata('spezzaRigheCsv');
    const VIRG = String.fromCharCode(34);
    const fileCsv = 'Denominazione;PEC;Note\n'
        + 'Alfa Srl;alfa@pec.it;' + VIRG + 'Sede in via Roma 1,\nscala B' + VIRG + '\n'
        + 'Beta Spa;beta@pec.it;niente\n'
        + '\n'
        + 'Gamma Srl;gamma@pec.it;' + VIRG + 'Dice: ' + VIRG + VIRG + 'ci pensiamo' + VIRG + VIRG + VIRG + '\n'
        + 'Delta Srl;delta@pec.it;\n';
    const righeFile = spezza(fileCsv);
    esigi(righeFile.length === 5, 'cinque righe: intestazioni e quattro aziende, l\'a capo dentro le virgolette non spezza', righeFile.length + ' righe');

    scenario({}, 0);
    r = await carica(righeFile.join('\n'));
    const inUnaVolta = JSON.parse(JSON.stringify(dati));
    const unaVolta = { nuove: r.nuove, lette: r.lette };

    scenario({}, 0);
    const somma = { lette: 0, nuove: 0, aggiornate: 0 };
    for (let i = 1; i < righeFile.length; i += 2) {
        const pezzo = [righeFile[0]].concat(righeFile.slice(i, i + 2)).join('\n');
        const rr = await carica(pezzo);
        somma.lette += rr.lette; somma.nuove += rr.nuove; somma.aggiornate += rr.aggiornate;
    }
    esigi(somma.nuove === unaVolta.nuove && somma.lette === unaVolta.lette,
        'a blocchi i conti tornano uguali', JSON.stringify({ blocchi: somma, unaVolta: unaVolta }));
    /* Il confronto ignora i timbri dell'ora, che cambiano fra un giro e
       l'altro: quello che deve coincidere e' il contenuto delle schede. */
    const senzaOra = m => JSON.stringify(Object.keys(m).sort().map(k => {
        const v = Object.assign({}, m[k]);
        delete v.aggiornata; delete v.aggiunta;
        return [k, v];
    }));
    esigi(senzaOra(dati) === senzaOra(inUnaVolta), 'e l\'elenco che ne esce e\' lo stesso');
    esigi(String(dati[id('alfa@pec.it')].note || '').indexOf('scala B') > 0,
        'la cella con l\'a capo dentro arriva intera', JSON.stringify(dati[id('alfa@pec.it')].note));

    console.log('\n' + '-'.repeat(58));
    console.log(ok + ' verifiche verdi, ' + ko + ' fallite');
    process.exit(ko ? 1 : 0);
})();
