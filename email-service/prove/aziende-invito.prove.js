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

   E IL FILE DELLA LOMBARDIA, che entrava con ZERO aziende: le sue
   intestazioni hanno una parentesi in fondo ("Ragione sociale
   (file)") e la colonna del nome non veniva trovata. Si carica con le
   sue diciotto intestazioni esatte e si verifica che entri tutto, che
   la provincia scritta per intero non diventi una sigla tagliata, e
   che ogni colonna resti nella scheda (datiFile) nell'ordine del file,
   celle vuote comprese - senza appesantire l'elenco della finestra
   degli inviti, e senza perdersi quando si cambia la PEC a mano.
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
/* La scheda singola serve alla modifica a mano (leggi, scrivi, togli la
   vecchia quando cambia la PEC): il merge e' di primo livello, come il
   batch qui sotto. */
function rifScheda(id) {
    const rif = {
        id: id,
        get: async () => ({
            id: id, ref: rif,
            exists: Object.prototype.hasOwnProperty.call(dati, id),
            data: () => dati[id]
        }),
        set: async (patch, opz) => { dati[id] = Object.assign({}, (opz && opz.merge) ? (dati[id] || {}) : {}, patch); },
        delete: async () => { delete dati[id]; }
    };
    return rif;
}
const db = {
    collection() {
        return {
            doc: id => rifScheda(id),
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

    console.log('\nIl file della Lombardia, con le sue diciotto colonne');
    /* Le intestazioni ESATTE del file vero, e righe come le sue: numeri
       come testo, date gia' scritte, celle vuote, la partita IVA con lo zero
       davanti. Prima di questa prova il file entrava con zero aziende: la
       colonna "Ragione sociale (file)" non era riconosciuta e ogni riga
       finiva fra le "senza denominazione". Il CSV lo compone la funzione
       vera dell'area riservata, la stessa che converte il foglio .xlsx. */
    const inCsv = dallAreaRiservata('righeInCsv');
    const INTEST18 = ['#', 'Ragione sociale (file)', 'Codice fiscale', 'PEC', 'Ricavi (EUR)', 'Utile netto (EUR)',
        'Totale attivo (EUR)', 'Capitale sociale (EUR)', 'Dipendenti', 'Chiusura bilancio', 'Provincia (sede operativa)',
        'Comune (sede operativa)', 'Provincia (sede legale)', 'Settore di attivita', 'Partita IVA', 'Numero CCIAA',
        'Revisore o societa di revisione', 'Data nomina revisore'];
    const settoreLungo = ('FABBRICAZIONE DI MACCHINE PER L\'INDUSTRIA ALIMENTARE, DELLE BEVANDE E DEL TABACCO; '
        + 'COMPRESE PARTI E ACCESSORI; ').repeat(10).slice(0, 629) + '.';
    const AVAS = ['1', 'AVAS PHARMACEUTICALS S.R.L.', '09190500968', 'info@pec.avaspharma.com', '100674810', '1557044',
        '102555667', '1000000', '12', '31/12/2025', 'Milano', 'MILANO', 'Milano', 'COMMERCIO ALL\'INGROSSO DI MEDICINALI',
        '09190500968', 'MI2074797', 'Sig. Alessandro Ballardini', '30/06/2026'];
    // celle vuote in mezzo, un utile negativo, e le ultime due che il foglio non scrive proprio
    const BETA = ['2', 'BETA COSTRUZIONI S.P.A.', '01234560157', 'beta@pec.betacostruzioni.it', '5400000', '-1769584',
        '', '', '', '31/12/2025', 'Monza e della Brianza', 'MONZA', 'Monza e della Brianza', '', '01234560157', 'MB1234567'];
    const GAMMA = ['3', 'GAMMA "MECCANICA" S.R.L.', '00987650123', 'gamma@pec.gamma.it', '820000', '0', '1500000', '50000',
        '7', '30/06/2025', 'Bergamo', 'BERGAMO', 'Bergamo', settoreLungo, '00987650123', 'BG7654321',
        'Studio Revisori Associati', '15/05/2026'];
    esigi(settoreLungo.length === 630, 'il settore di prova e\' lungo come quelli veri (630 caratteri)', String(settoreLungo.length));
    scenario({}, 0);
    r = await carica(inCsv([INTEST18, AVAS, BETA, GAMMA]));
    esigi(r.nuove === 3 && r.senzaDenominazione === 0 && r.senzaRecapito === 0,
        'entrano tutte e tre, nessuna "senza denominazione"', JSON.stringify(r));
    const avas = dati[id('info@pec.avaspharma.com')] || {};
    const beta = dati[id('beta@pec.betacostruzioni.it')] || {};
    const gamma = dati[id('gamma@pec.gamma.it')] || {};
    esigi(avas.ragioneSociale === 'AVAS PHARMACEUTICALS S.R.L.' && gamma.ragioneSociale === 'GAMMA "MECCANICA" S.R.L.',
        '"Ragione sociale (file)" e\' la ragione sociale', avas.ragioneSociale + ' | ' + gamma.ragioneSociale);
    esigi(avas.pec === 'info@pec.avaspharma.com', 'la PEC', avas.pec);
    esigi(avas.piva === '09190500968' && beta.piva === '01234560157' && gamma.cf === '00987650123',
        'partita IVA e codice fiscale con lo zero davanti', [avas.piva, beta.piva, gamma.cf].join(' '));
    esigi(avas.cf === '09190500968', 'il codice fiscale', avas.cf);
    esigi(avas.citta === 'MILANO' && beta.citta === 'MONZA', 'la citta\' da "Comune (sede operativa)"', avas.citta + ' | ' + beta.citta);
    esigi(avas.settore === 'COMMERCIO ALL\'INGROSSO DI MEDICINALI', 'il settore da "Settore di attivita"', avas.settore);
    esigi(!avas.provincia && !beta.provincia,
        'la provincia NON diventa "Mila" o "Monz": il nome intero resta fra i dati del file', JSON.stringify([avas.provincia, beta.provincia]));
    const etichette = l => (l || []).map(x => x.c).join('|');
    esigi(Array.isArray(avas.datiFile) && avas.datiFile.length === 18 && etichette(avas.datiFile) === INTEST18.join('|'),
        'datiFile: diciotto colonne, nell\'ordine del file', etichette(avas.datiFile));
    const valore = (l, c) => ((l || []).find(x => x.c === c) || {}).v;
    esigi(valore(avas.datiFile, 'Ricavi (EUR)') === '100674810' && valore(avas.datiFile, 'PEC') === 'info@pec.avaspharma.com'
        && valore(avas.datiFile, 'Partita IVA') === '09190500968' && valore(avas.datiFile, 'Provincia (sede operativa)') === 'Milano',
        'con i valori come nel file, anche delle colonne riconosciute');
    esigi(beta.datiFile.length === 18 && valore(beta.datiFile, 'Totale attivo (EUR)') === '' && valore(beta.datiFile, 'Settore di attivita') === ''
        && valore(beta.datiFile, 'Data nomina revisore') === '' && valore(beta.datiFile, 'Utile netto (EUR)') === '-1769584',
        'le celle vuote ci sono, con v vuoto (anche quelle in fondo che il foglio non scrive), e il negativo resta com\'e\'',
        JSON.stringify(beta.datiFile.slice(5, 9)));
    esigi(valore(gamma.datiFile, 'Settore di attivita') === settoreLungo && gamma.settore.length === 300,
        'il settore lungo e\' intero fra i dati del file (il campo settore resta a 300)', String((valore(gamma.datiFile, 'Settore di attivita') || '').length));
    esigi(avas.extra && avas.extra['Ricavi (EUR)'] === '100674810' && avas.extra['Provincia (sede operativa)'] === 'Milano' && !('PEC' in avas.extra),
        '`extra` si scrive come prima, per chi lo legge gia\'', JSON.stringify(avas.extra));
    e = await leggiElenco('invito');
    esigi(e.aziende.length === 3 && e.aziende.every(a => !('datiFile' in a)),
        'l\'elenco della finestra degli inviti non si porta dietro datiFile');

    console.log('\nCambiare la PEC a mano non perde le colonne del file');
    const vecchiaId = id('info@pec.avaspharma.com');
    const daFile = JSON.stringify(avas.datiFile);
    const rm = await AZ.esegui({
        db: db, email: 'chi.carica@esempio.it', eAdmin: true,
        body: {
            sezione: 'aziende', azione: 'modifica', evento: 'ev1', campagna: 'invito', id: vecchiaId,
            azienda: { ragioneSociale: 'AVAS PHARMACEUTICALS S.R.L.', pec: 'amministrazione@pec.avaspharma.com', piva: '09190500968' }
        }
    });
    const spostata = dati[id('amministrazione@pec.avaspharma.com')] || {};
    esigi(rm.corpo.ok && !dati[vecchiaId] && JSON.stringify(spostata.datiFile) === daFile,
        'la scheda cambia identificativo e i dati del file vanno con lei', JSON.stringify(rm.corpo).slice(0, 200));
    esigi(spostata.extra && spostata.extra['Numero CCIAA'] === 'MI2074797', 'e anche `extra`');
    esigi(rm.corpo.azienda && !('datiFile' in rm.corpo.azienda), 'la risposta della modifica non li rimanda indietro');

    console.log('\nIl modello di sempre, e i nomi esatti prima di quelli con la parentesi');
    scenario({}, 0);
    r = await carica('Denominazione *;PEC *;Partita IVA;Referente;Email;Telefono;Citta;Provincia;Settore;Note\n'
        + 'Delta Srl;delta@pec.it;01112223334;Anna Neri;info@delta.it;02 1234567;Milano;MI;Meccanica;cliente storico');
    const delta = dati[id('delta@pec.it')] || {};
    esigi(r.nuove === 1 && delta.ragioneSociale === 'Delta Srl' && delta.provincia === 'MI' && delta.citta === 'Milano'
        && delta.settore === 'Meccanica' && delta.referente === 'Anna Neri' && delta.email === 'info@delta.it' && delta.note === 'cliente storico',
        'il modello scaricabile entra come prima', JSON.stringify(delta).slice(0, 300));
    esigi((delta.datiFile || []).length === 10 && delta.datiFile[0].c === 'Denominazione' && delta.datiFile[1].c === 'PEC'
        && delta.datiFile[7].c === 'Provincia' && delta.datiFile[7].v === 'MI',
        'datiFile anche qui, senza l\'asterisco del modello', etichette(delta.datiFile));
    scenario({}, 0);
    r = await carica('Nome (referente);Provincia (sede legale);Denominazione;PEC;Provincia\nMario Bianchi;Milano;Epsilon Srl;eps@pec.it;MI');
    const eps = dati[id('eps@pec.it')] || {};
    esigi(eps.ragioneSociale === 'Epsilon Srl' && eps.provincia === 'MI',
        '"Denominazione" vince su "Nome (referente)", "Provincia" su "Provincia (sede legale)"', JSON.stringify([eps.ragioneSociale, eps.provincia]));

    console.log('\nLa forma dei dati del file (lib/dati-file-azienda.js)');
    const DF = require(path.join(RADICE, 'lib/dati-file-azienda.js'));
    const sporco = [{ c: ' Ricavi ', v: 12 }, null, 'testo', { c: '', v: 'senza intestazione' }, { c: 'X'.repeat(100), v: 'Y'.repeat(1200) }, { c: 'A\u0007capo', v: 'riga\nnuova' }];
    const pulita = DF.pulito(sporco);
    esigi(pulita.length === 3 && pulita[0].c === 'Ricavi' && pulita[0].v === '12' && pulita[1].c.length === 80 && pulita[1].v.length === 1000
        && pulita[2].c === 'A capo' && pulita[2].v === 'riga nuova',
        'solo voci con l\'intestazione, stringhe, nei limiti (80 e 1000), senza caratteri di controllo', JSON.stringify(pulita).slice(0, 160));
    esigi(DF.pulito([]) === null && DF.pulito(null) === null && DF.pulito({ c: 'a' }) === null, 'vuoto o non un elenco: null');
    esigi(DF.pulito(Array.from({ length: 120 }, (x, i) => ({ c: 'c' + i, v: '' }))).length === 80, 'al massimo 80 voci');
    /* La lettura dell'area riservata e' una whitelist campo per campo: senza
       la riga che passa datiInvito, il dato resterebbe sul database e la
       tabella non lo vedrebbe mai. */
    const API_ISCRIZIONI = require('fs').readFileSync(path.join(RADICE, 'api/iscrizioni.js'), 'utf8');
    esigi(/datiInvito:\s*DATI_FILE\.pulito\(v\.datiInvito\)/.test(API_ISCRIZIONI), 'api/iscrizioni.js passa datiInvito, rimesso in forma');

    console.log('\n' + '-'.repeat(58));
    console.log(ok + ' verifiche verdi, ' + ko + ' fallite');
    process.exit(ko ? 1 : 0);
})();
