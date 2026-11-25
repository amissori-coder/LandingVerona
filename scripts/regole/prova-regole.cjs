/* ============================================================
   PROVE DELLE REGOLE DI SICUREZZA DI FIRESTORE
   ------------------------------------------------------------
   Le regole (area-riservata/firestore.rules) decidono chi legge e
   chi scrive che cosa nel database dell'area riservata. Qui si
   provano sull'emulatore di Firebase, senza toccare il database
   vero: per ogni tipo di utente si tentano una sessantina di
   operazioni (leggere e scrivere ogni archivio, l'elenco degli
   utenti, i messaggi...) e si guarda se passano.

       cd scripts/regole && npm install && npm run prova

   TRE CONTROLLI.
   1. Il testo delle regole nella guida (FIREBASE-SETUP.md) e'
      uguale al file firestore.rules: sono due copie, e quella
      che si incolla in console deve essere quella provata.
   2. IL REVISORE: a chi ha il ruolo 'revisore' (e al suo
      collaboratore) il database non consegna nessun archivio ne'
      l'elenco degli utenti, e non gli lascia scrivere nulla. I
      suoi dati glieli prepara il servizio email
      (email-service/lib/revisore.js).
   3. TUTTI GLI ALTRI: ogni operazione di ogni ruolo da'
      l'esito scritto in attesi.json. E' una fotografia: se una
      modifica alle regole cambia anche un solo esito, la prova
      si ferma e dice quale. Se il cambiamento e' voluto, si
      rifa' la fotografia con "npm run aggiorna" e la si guarda
      nel confronto di git prima di pubblicare.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs } = require('firebase/firestore');

const REGOLE = path.join(__dirname, '../../area-riservata/firestore.rules');
const GUIDA = path.join(__dirname, '../../area-riservata/FIREBASE-SETUP.md');
const ATTESI = path.join(__dirname, 'attesi.json');
const AGGIORNA = process.argv.includes('--aggiorna');

let passate = 0, fallite = 0;
function verifica(cosa, ok, dett) {
    if (ok) { passate++; return; }
    fallite++;
    console.log('  NO  ' + cosa + (dett !== undefined ? '\n        ' + JSON.stringify(dett).slice(0, 1200) : ''));
}

const UTENTI = {
    'admin@studio.it': { ruolo: 'admin', attivo: true },
    'vice@studio.it': { ruolo: 'viceadmin', attivo: true },
    'qualita@studio.it': { ruolo: 'qualita', attivo: true },
    'proc@studio.it': { ruolo: 'procuratore', attivo: true },
    'coord@studio.it': { ruolo: 'coordinatore', attivo: true },
    'marketing@studio.it': { ruolo: 'marketing', attivo: true },
    'sumisura@studio.it': { ruolo: 'referente-nord', attivo: true },
    'revisore@studio.it': { ruolo: 'revisore', attivo: true },
    'revisore2@studio.it': { ruolo: 'revisore', attivo: true },
    'collab.rev@studio.it': { ruolo: 'collaboratore', collaboratoreDi: 'revisore@studio.it', attivo: true },
    'collab.qual@studio.it': { ruolo: 'collaboratore', collaboratoreDi: 'qualita@studio.it', attivo: true },
    'sond@fuori.it': { ruolo: 'sondaggio_compila', attivo: true },
    'sondris@fuori.it': { ruolo: 'sondaggio_risultati', attivo: true },
    'spento@studio.it': { ruolo: 'revisore', attivo: false },
    'spento.q@studio.it': { ruolo: 'qualita', attivo: false }
};
const ESTRANEO = 'nessuno@altrove.it';       // ha un account ma non una scheda
const ARCHIVI = ['incarichi', 'persone', 'audit', 'fattureStato', 'richieste', 'controlliQualita', 'comunicazioni', 'rating', 'firmeEmail', 'presenza', 'eventiConfig', 'newsletter', 'allerte'];

/* le operazioni da provare: nome -> funzione(db) che torna una promessa */
function operazioni(chi) {
    const ops = {};
    for (const a of ARCHIVI) {
        ops['leggi archivio/' + a] = db => getDoc(doc(db, 'archivio', a));
        ops['scrivi archivio/' + a] = db => setDoc(doc(db, 'archivio', a), { json: '[]', da: chi });
    }
    ops['leggi archivio/ruoli'] = db => getDoc(doc(db, 'archivio', 'ruoli'));
    ops['scrivi archivio/ruoli'] = db => setDoc(doc(db, 'archivio', 'ruoli'), { json: '[]' });
    ops['leggi archivio/sondaggi'] = db => getDoc(doc(db, 'archivio', 'sondaggi'));
    ops['scrivi archivio/sondaggi'] = db => setDoc(doc(db, 'archivio', 'sondaggi'), { json: '{}' });
    ops['leggi archivio/sondaggiConfig'] = db => getDoc(doc(db, 'archivio', 'sondaggiConfig'));
    ops['scrivi archivio/sondaggiConfig'] = db => setDoc(doc(db, 'archivio', 'sondaggiConfig'), { json: '{}' });
    ops['elenco utenti'] = db => getDocs(collection(db, 'utenti'));
    ops['leggi la propria scheda utente'] = db => getDoc(doc(db, 'utenti', chi));
    ops['leggi la scheda di un altro utente'] = db => getDoc(doc(db, 'utenti', 'proc@studio.it'));
    ops['leggi la scheda del revisore'] = db => getDoc(doc(db, 'utenti', 'revisore@studio.it'));
    ops['leggi la scheda del secondo revisore'] = db => getDoc(doc(db, 'utenti', 'revisore2@studio.it'));
    ops['aggiorna il proprio ultimoAccesso'] = db => updateDoc(doc(db, 'utenti', chi), { ultimoAccesso: 123 });
    ops['si cambia il ruolo da solo'] = db => updateDoc(doc(db, 'utenti', chi), { ruolo: 'admin' });
    ops['crea un utente'] = db => setDoc(doc(db, 'utenti', 'nuovo.' + chi), { ruolo: 'revisore', attivo: true });
    ops['cambia il ruolo di un altro'] = db => updateDoc(doc(db, 'utenti', 'sumisura@studio.it'), { nota: 'x' });
    ops['elimina un utente'] = db => deleteDoc(doc(db, 'utenti', 'da.eliminare@studio.it'));
    ops['leggi modelli/lettera'] = db => getDoc(doc(db, 'modelli', 'lettera'));
    ops['scrivi modelli/lettera'] = db => setDoc(doc(db, 'modelli', 'lettera'), { x: 1 });
    ops['leggi i propri messaggi'] = db => getDoc(doc(db, 'messaggi', chi));
    ops['leggi i messaggi di un altro'] = db => getDoc(doc(db, 'messaggi', 'proc@studio.it'));
    ops['scrivi un messaggio a un altro'] = db => setDoc(doc(db, 'messaggi', 'proc@studio.it'), { lista: [] }, { merge: true });
    ops['leggi meta/iscrizioni'] = db => getDoc(doc(db, 'meta', 'iscrizioni'));
    ops['scrivi meta/iscrizioni'] = db => setDoc(doc(db, 'meta', 'iscrizioni'), { n: 1 });
    ops['leggi una raccolta del servizio (circInvii)'] = db => getDoc(doc(db, 'circInvii', 'x'));
    ops['leggi meta/abilitazioni'] = db => getDoc(doc(db, 'meta', 'abilitazioni'));
    ops['leggi le iscrizioni agli eventi'] = db => getDoc(doc(db, 'iscrizioni', 'x'));
    return ops;
}

async function matrice() {
    const env = await initializeTestEnvironment({ projectId: 'demo-regole', firestore: { rules: fs.readFileSync(REGOLE, 'utf8'), host: '127.0.0.1', port: 8189 } });
    const semina = async () => {
        await env.clearFirestore();
        await env.withSecurityRulesDisabled(async ctx => {
            const db = ctx.firestore();
            for (const [e, d] of Object.entries(UTENTI)) await setDoc(doc(db, 'utenti', e), d);
            await setDoc(doc(db, 'utenti', 'da.eliminare@studio.it'), { ruolo: 'procuratore', attivo: true });
            for (const a of ARCHIVI.concat(['ruoli', 'sondaggi', 'sondaggiConfig'])) await setDoc(doc(db, 'archivio', a), { json: '[]' });
            await setDoc(doc(db, 'modelli', 'lettera'), { x: 0 });
            await setDoc(doc(db, 'meta', 'iscrizioni'), { n: 0 });
            await setDoc(doc(db, 'meta', 'abilitazioni'), { n: 0 });
            for (const e of Object.keys(UTENTI)) await setDoc(doc(db, 'messaggi', e), { lista: [] });
            await setDoc(doc(db, 'circInvii', 'x'), { a: 1 });
            await setDoc(doc(db, 'iscrizioni', 'x'), { a: 1 });
        });
    };
    const esiti = {};
    for (const chi of Object.keys(UTENTI).concat([ESTRANEO, ''])) {
        const ops = operazioni(chi || 'anonimo@x.it');
        for (const nome of Object.keys(ops)) {
            await semina();
            const ctx = chi ? env.authenticatedContext('uid-' + chi, { email: chi }) : env.unauthenticatedContext();
            let esito;
            try { await ops[nome](ctx.firestore()); esito = 'si'; }
            catch (e) { esito = /permission|PERMISSION|insufficient/i.test(String(e.code || e.message)) ? 'no' : 'ERRORE ' + String(e.code || e.message).slice(0, 80); }
            esiti[(chi || '(senza accesso)') + ' | ' + nome] = esito;
        }
    }
    await env.cleanup();
    return esiti;
}

(async () => {
    /* ---- 1. la guida riporta le stesse regole del file ---- */
    {
        const file = fs.readFileSync(REGOLE, 'utf8');
        const corpo = file.slice(file.indexOf('rules_version')).trim();
        const guida = fs.readFileSync(GUIDA, 'utf8');
        const m = /```\n( *)rules_version = '2';\n[\s\S]*?\n *```\n/.exec(guida);
        const rientro = m ? m[1].length : 0;
        const dellaGuida = m ? m[0].split('\n').slice(1, -2).map(l => l.slice(rientro)).join('\n').trim() : '';
        const senzaSpaziFinali = t => t.split('\n').map(l => l.replace(/\s+$/, '')).join('\n');
        verifica('la guida FIREBASE-SETUP.md riporta le stesse regole di firestore.rules', !!m && senzaSpaziFinali(dellaGuida) === senzaSpaziFinali(corpo));
    }

    const esiti = await matrice();
    const errori = Object.keys(esiti).filter(k => /^ERRORE/.test(esiti[k]));
    verifica('nessuna operazione finisce in un errore diverso da "permesso negato"', errori.length === 0, errori.map(k => k + ' -> ' + esiti[k]));
    const controllo = (chi, op, atteso) => verifica(chi + ': ' + op + ' = ' + atteso, esiti[chi + ' | ' + op] === atteso, esiti[chi + ' | ' + op]);

    /* ---- 2. il Revisore e il suo collaboratore ---- */
    for (const chi of ['revisore@studio.it', 'revisore2@studio.it', 'collab.rev@studio.it']) {
        for (const a of ARCHIVI) { controllo(chi, 'leggi archivio/' + a, 'no'); controllo(chi, 'scrivi archivio/' + a, 'no'); }
        controllo(chi, 'leggi archivio/sondaggi', 'no'); controllo(chi, 'leggi archivio/sondaggiConfig', 'no');
        controllo(chi, 'scrivi archivio/sondaggi', 'no'); controllo(chi, 'scrivi archivio/sondaggiConfig', 'no');
        controllo(chi, 'scrivi archivio/ruoli', 'no'); controllo(chi, 'scrivi modelli/lettera', 'no');
        controllo(chi, 'elenco utenti', 'no'); controllo(chi, 'leggi la scheda di un altro utente', 'no');
        controllo(chi, 'crea un utente', 'no'); controllo(chi, 'cambia il ruolo di un altro', 'no'); controllo(chi, 'elimina un utente', 'no'); controllo(chi, 'si cambia il ruolo da solo', 'no');
        controllo(chi, 'leggi meta/iscrizioni', 'no'); controllo(chi, 'leggi meta/abilitazioni', 'no'); controllo(chi, 'leggi una raccolta del servizio (circInvii)', 'no'); controllo(chi, 'leggi le iscrizioni agli eventi', 'no');
        controllo(chi, 'leggi i messaggi di un altro', 'no');
        // la scheda di un altro revisore no; quella del proprio riferimento si' (al collaboratore serve per entrare)
        controllo(chi, 'leggi la scheda del secondo revisore', chi === 'revisore2@studio.it' ? 'si' : 'no');
        controllo(chi, 'leggi la scheda del revisore', chi === 'revisore2@studio.it' ? 'no' : 'si');
        // quello che gli serve per entrare e lavorare
        controllo(chi, 'leggi la propria scheda utente', 'si'); controllo(chi, 'aggiorna il proprio ultimoAccesso', 'si');
        controllo(chi, 'leggi archivio/ruoli', 'si'); controllo(chi, 'leggi modelli/lettera', 'si');
        controllo(chi, 'leggi i propri messaggi', 'si'); controllo(chi, 'scrivi un messaggio a un altro', 'si');
    }
    controllo('spento@studio.it', 'leggi archivio/ruoli', 'no'); controllo('spento@studio.it', 'leggi la propria scheda utente', 'no');

    /* ---- un campione letto a occhio, per non fidarsi solo della fotografia ---- */
    controllo('admin@studio.it', 'leggi archivio/incarichi', 'si'); controllo('admin@studio.it', 'crea un utente', 'si'); controllo('vice@studio.it', 'scrivi archivio/ruoli', 'si');
    controllo('qualita@studio.it', 'leggi archivio/incarichi', 'si'); controllo('qualita@studio.it', 'scrivi archivio/incarichi', 'si'); controllo('qualita@studio.it', 'crea un utente', 'no');
    controllo('coord@studio.it', 'leggi archivio/incarichi', 'si'); controllo('collab.qual@studio.it', 'leggi archivio/incarichi', 'si'); controllo('collab.qual@studio.it', 'scrivi archivio/incarichi', 'si');
    controllo('sumisura@studio.it', 'elenco utenti', 'si'); controllo('marketing@studio.it', 'scrivi archivio/ruoli', 'no');
    controllo('sond@fuori.it', 'leggi archivio/incarichi', 'no'); controllo('sond@fuori.it', 'leggi archivio/sondaggi', 'si'); controllo('sond@fuori.it', 'scrivi archivio/sondaggi', 'si'); controllo('sondris@fuori.it', 'scrivi archivio/sondaggi', 'no');
    controllo('spento.q@studio.it', 'leggi archivio/incarichi', 'no'); controllo(ESTRANEO, 'leggi archivio/incarichi', 'no'); controllo('(senza accesso)', 'leggi archivio/incarichi', 'no');

    /* ---- 3. la fotografia: ogni operazione di ogni ruolo ---- */
    if (AGGIORNA) {
        const ordinati = {}; Object.keys(esiti).sort().forEach(k => { ordinati[k] = esiti[k]; });
        fs.writeFileSync(ATTESI, JSON.stringify(ordinati, null, 1) + '\n');
        console.log('fotografia aggiornata: ' + Object.keys(esiti).length + ' operazioni in attesi.json');
    } else {
        const attesi = JSON.parse(fs.readFileSync(ATTESI, 'utf8'));
        const cambiate = Object.keys(esiti).filter(k => attesi[k] !== esiti[k]).concat(Object.keys(attesi).filter(k => !(k in esiti)));
        verifica('ogni operazione di ogni ruolo dà l\'esito atteso (' + Object.keys(attesi).length + ' operazioni)', cambiate.length === 0, cambiate.map(k => k + ': atteso ' + attesi[k] + ', ora ' + esiti[k]));
    }
    console.log('\nregole Firestore: ' + passate + ' verifiche passate' + (fallite ? ', ' + fallite + ' FALLITE' : '') + ' (' + Object.keys(esiti).length + ' operazioni provate)');
    process.exit(fallite ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
