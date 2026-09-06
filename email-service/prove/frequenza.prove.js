/* ============================================================
   PROVE - lib/frequenza.js
   ------------------------------------------------------------
       node prove/frequenza.prove.js

   Niente da installare: Firestore e l'orologio sono finti e stanno
   qui dentro. Esce con 1 se qualcosa e' rosso.

   COSA DIMOSTRANO. Il freno per indirizzo IP degli endpoint pubblici
   deve comportarsi come le vecchie funzioni in memoria (ammette fino
   a `massimo` richieste nella finestra, blocca le successive, riapre
   quando la finestra scorre) ma con il conteggio su Firestore. In
   piu': una richiesta bloccata non scrive; senza chiave non si tocca
   il database; se Firestore non risponde si lascia passare; se c'e'
   contesa (raffica) si frena.
   ============================================================ */
'use strict';

const path = require('path');

// ---------- orologio ----------
let orologio = Date.parse('2026-09-06T10:00:00Z');
Date.now = () => orologio;

// ---------- Firestore finto ----------
function nuovoDb(opz) {
    const documenti = new Map();
    const stato = { letture: 0, scritture: 0, transazioni: 0, documenti };
    const fallisci = (opz && opz.fallisci) || null;    // errore da lanciare in runTransaction
    const db = {
        collection(nome) {
            return {
                doc(id) {
                    if (id.indexOf('/') >= 0) throw new Error('id con / : ' + id);
                    return { chiave: nome + '/' + id, id: id };
                }
            };
        },
        async runTransaction(fn) {
            stato.transazioni++;
            if (fallisci) throw fallisci;
            const tx = {
                async get(rif) {
                    stato.letture++;
                    const d = documenti.get(rif.chiave);
                    return { exists: d !== undefined, data: () => (d === undefined ? undefined : Object.assign({}, d)) };
                },
                set(rif, dati) { stato.scritture++; documenti.set(rif.chiave, dati); }
            };
            return fn(tx);
        }
    };
    return { db, stato };
}

const F = require(path.join(__dirname, '..', 'lib', 'frequenza.js'));

let verdi = 0, rossi = 0;
function ok(cond, msg) {
    if (cond) { verdi++; console.log('  ok   ' + msg); }
    else { rossi++; console.log('  KO   ' + msg); }
}
const zitto = () => { };

(async () => {
    const errOrig = console.error;

    console.log('\nAmmette fino a `massimo`, poi blocca; il bloccato non scrive');
    {
        const { db, stato } = nuovoDb();
        const opz = { finestraMs: 10 * 60 * 1000, massimo: 3 };
        const esiti = [];
        for (let i = 0; i < 5; i++) {
            esiti.push(await F.troppeRichieste(db, 'prova', '93.184.216.34', opz));
            orologio += 1000;
        }
        ok(JSON.stringify(esiti) === JSON.stringify([false, false, false, true, true]), 'esiti: ' + JSON.stringify(esiti));
        ok(stato.letture === 5, 'una lettura per richiesta (' + stato.letture + ')');
        ok(stato.scritture === 3, 'solo le richieste ammesse scrivono (' + stato.scritture + ')');
        const doc = stato.documenti.get('richieste_throttle/prova~93-184-216-34');
        ok(!!doc, 'documento in richieste_throttle con id ambito~ip senza punti');
        ok(doc && doc.colpi.length === 3, 'colpi non supera massimo (' + (doc && doc.colpi.length) + ')');
        ok(doc && doc.scade instanceof Date && doc.scade.getTime() === doc.ultimo + opz.finestraMs, 'scade = ultimo + finestra, come Date (per la TTL)');
        ok(doc && doc.ambito === 'prova' && doc.chiave === '93.184.216.34', 'ambito e chiave leggibili in console');
    }

    console.log('\nLa finestra scorre: passata la finestra si riammette');
    {
        const { db } = nuovoDb();
        const opz = { finestraMs: 60 * 1000, massimo: 2 };
        await F.troppeRichieste(db, 'p', 'ip', opz);
        orologio += 30 * 1000;
        await F.troppeRichieste(db, 'p', 'ip', opz);
        ok(await F.troppeRichieste(db, 'p', 'ip', opz) === true, 'terza entro la finestra: bloccata');
        orologio += 31 * 1000;   // il primo colpo e' uscito dalla finestra
        ok(await F.troppeRichieste(db, 'p', 'ip', opz) === false, 'uscito il primo colpo: riammessa');
        ok(await F.troppeRichieste(db, 'p', 'ip', opz) === true, 'e la successiva e\' di nuovo bloccata');
    }

    console.log('\nChiavi diverse e ambiti diversi non si disturbano');
    {
        const { db } = nuovoDb();
        const opz = { finestraMs: 60 * 1000, massimo: 1 };
        ok(await F.troppeRichieste(db, 'a', '1.1.1.1', opz) === false, 'a/1.1.1.1 passa');
        ok(await F.troppeRichieste(db, 'a', '2.2.2.2', opz) === false, 'a/2.2.2.2 passa');
        ok(await F.troppeRichieste(db, 'b', '1.1.1.1', opz) === false, 'b/1.1.1.1 passa');
        ok(await F.troppeRichieste(db, 'a', '1.1.1.1', opz) === true, 'a/1.1.1.1 di nuovo: bloccata');
    }

    console.log('\nSenza chiave non si frena e non si tocca il database');
    {
        const { db, stato } = nuovoDb();
        ok(await F.troppeRichieste(db, 'p', '', { massimo: 1 }) === false, 'chiave vuota: passa');
        ok(await F.troppeRichieste(db, 'p', undefined, { massimo: 1 }) === false, 'chiave undefined: passa');
        ok(stato.transazioni === 0, 'nessuna transazione (' + stato.transazioni + ')');
    }

    console.log('\nFirestore guasto: si lascia passare (e si logga)');
    {
        console.error = zitto;
        const guasto = new Error('14 UNAVAILABLE'); guasto.code = 14;
        const { db } = nuovoDb({ fallisci: guasto });
        ok(await F.troppeRichieste(db, 'p', 'ip', { massimo: 1 }) === false, 'UNAVAILABLE: passa');
        const quota = new Error('8 RESOURCE_EXHAUSTED'); quota.code = 8;
        const { db: db2 } = nuovoDb({ fallisci: quota });
        ok(await F.troppeRichieste(db2, 'p', 'ip', { massimo: 1 }) === false, 'RESOURCE_EXHAUSTED: passa');
        const { db: db3 } = nuovoDb({ fallisci: new Error('senza codice') });
        ok(await F.troppeRichieste(db3, 'p', 'ip', { massimo: 1 }) === false, 'errore generico: passa');
        console.error = errOrig;
    }

    console.log('\nContesa (ABORTED): e\' la raffica, si frena');
    {
        console.error = zitto;
        const contesa = new Error('10 ABORTED: too much contention'); contesa.code = 10;
        const { db } = nuovoDb({ fallisci: contesa });
        ok(await F.troppeRichieste(db, 'p', 'ip', { massimo: 100 }) === true, 'ABORTED: bloccata');
        console.error = errOrig;
    }

    console.log('\nDati sporchi nel documento non fanno male');
    {
        const { db, stato } = nuovoDb();
        stato.documenti.set('richieste_throttle/p~ip', { colpi: 'non un array', ultimo: 'x' });
        ok(await F.troppeRichieste(db, 'p', 'ip', { massimo: 1 }) === false, 'colpi non array: si riparte da zero');
        stato.documenti.set('richieste_throttle/p~ip2', { colpi: [null, 'abc', -5, Date.now() + 999999] });
        ok(await F.troppeRichieste(db, 'p', 'ip2', { massimo: 1 }) === false, 'valori non numerici o troppo nel futuro: ignorati');
        stato.documenti.set('richieste_throttle/p~ip3', { colpi: [Date.now() + 2000] });
        ok(await F.troppeRichieste(db, 'p', 'ip3', { massimo: 1 }) === true, 'un istante di poco nel futuro (orologi sfasati) conta');
    }

    console.log('\nId documento');
    {
        ok(F.idDocumento('ebook', '93.184.216.34') === 'ebook~93-184-216-34', 'IPv4 con i punti sostituiti');
        ok(F.idDocumento('ebook', '2a01:4f8:1c0c:8a2b::1') === 'ebook~2a01:4f8:1c0c:8a2b::1', 'IPv6 con i due punti conservati');
        ok(F.idDocumento('a/b', 'x/y#z') .indexOf('/') < 0, 'mai una barra nell\'id');
        ok(F.idDocumento('iscrizione-scheda', 'x'.repeat(1000)).length <= 441, 'chiave lunga troncata');
        ok(F.COLLEZIONE === 'richieste_throttle', 'nome della collezione');
    }

    console.log('\n----------------------------------------------------------');
    console.log(verdi + ' verifiche verdi, ' + rossi + ' fallite');
    process.exit(rossi ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
