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
   ============================================================ */
'use strict';
const Module = require('module');
const path = require('path');

// ---------- Firestore finto ----------
/* Serve solo quello che usa il caricamento: il conteggio delle schede
   dell'evento, la lettura in blocco (getAll) e i batch di scrittura. */
let dati = {};
let conteggio = 0;
const admin = { firestore: { FieldValue: { serverTimestamp: () => 0 } }, apps: [] };
const db = {
    collection() {
        return {
            doc: id => ({ id: id }),
            where: () => ({
                count: () => ({ get: async () => ({ data: () => ({ count: conteggio }) }) }),
                limit: () => ({ get: async () => ({ forEach: () => { } }) })
            })
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

(async () => {
    console.log('\nCaricamento dell\'elenco aziende da invitare\n');

    console.log('Evento vuoto');
    scenario({}, 0);
    let r = await carica(csv([['Alfa Srl', 'alfa@pec.it'], ['Beta Spa', 'beta@pec.it'], ['Gamma Srl', 'gamma@pec.it']]));
    esigi(r.nuove === 3 && r.aggiornate === 0 && r.oltreIlLimite === 0, 'le tre righe entrano tutte', JSON.stringify(r));
    esigi(dati[id('alfa@pec.it')].stato === 'da-invitare', 'ogni scheda nuova nasce "da invitare"');

    console.log('\nElenco pieno, righe gia\' in elenco (il caso che si vedeva rotto)');
    scenario({
        [id('alfa@pec.it')]: { evento: 'ev1', campagna: 'invito', ragioneSociale: 'Alfa', stato: 'inviata', invio: { quando: 111, canale: 'pec' } },
        [id('beta@pec.it')]: { evento: 'ev1', campagna: 'invito', ragioneSociale: 'Beta', stato: 'risposta' }
    }, 5000);
    r = await carica(csv([['Alfa Srl', 'alfa@pec.it'], ['Beta Spa', 'beta@pec.it']]));
    esigi(r.aggiornate === 2 && r.nuove === 0 && r.oltreIlLimite === 0, 'a elenco pieno gli aggiornamenti passano', JSON.stringify(r));
    esigi(dati[id('alfa@pec.it')].ragioneSociale === 'Alfa Srl', 'l\'anagrafica si aggiorna');
    esigi(dati[id('alfa@pec.it')].stato === 'inviata' && dati[id('alfa@pec.it')].invio.quando === 111,
        'stato ed esito dell\'invito gia\' spedito restano intatti');

    console.log('\nElenco pieno, righe nuove');
    scenario({}, 5000);
    r = await carica(csv([['Delta Srl', 'delta@pec.it']]));
    esigi(r.oltreIlLimite === 1 && r.nuove === 0, 'la scheda nuova resta fuori', JSON.stringify(r));
    esigi(r.limite === 5000 && r.inElenco === 5000, 'la risposta dice il tetto e quante ce ne sono', JSON.stringify(r));

    console.log('\nUn posto solo prima del tetto');
    scenario({ [id('alfa@pec.it')]: { evento: 'ev1', campagna: 'invito', stato: 'da-invitare' } }, 4999);
    r = await carica(csv([['Alfa Srl', 'alfa@pec.it'], ['Beta Spa', 'beta@pec.it'], ['Gamma Srl', 'gamma@pec.it']]));
    esigi(r.aggiornate === 1 && r.nuove === 1 && r.oltreIlLimite === 1,
        'entra una nuova, l\'aggiornamento passa, l\'ultima resta fuori', JSON.stringify(r));

    console.log('\nGli altri scarti, che devono restare quelli di prima');
    scenario({}, 0);
    r = await carica(csv([['Alfa Srl', 'alfa@pec.it'], ['Alfa Srl', 'alfa@pec.it'], ['', 'muta@pec.it'], ['Senza Recapito Srl', 'non-un-indirizzo']]));
    esigi(r.nuove === 1 && r.doppie === 1 && r.senzaDenominazione === 1 && r.senzaRecapito === 1,
        'doppione, riga senza denominazione e recapito storto: uno per tipo', JSON.stringify(r));

    console.log('\nScheda vecchia rimasta senza stato');
    scenario({ [id('alfa@pec.it')]: { evento: 'ev1', campagna: 'invito', ragioneSociale: 'Alfa' } }, 5000);
    r = await carica(csv([['Alfa Srl', 'alfa@pec.it']]));
    esigi(dati[id('alfa@pec.it')].stato === 'da-invitare', 'il caricamento le mette lo stato iniziale');

    console.log('\n' + '-'.repeat(58));
    console.log(ok + ' verifiche verdi, ' + ko + ' fallite');
    process.exit(ko ? 1 : 0);
})();
