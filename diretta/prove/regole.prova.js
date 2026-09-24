/* ============================================================
   PROVE - regole Firestore della diretta
   ------------------------------------------------------------
       node avvia-emulatori.js --firestore 8380 --auth 9380 &   (una volta)
       FIRESTORE_EMULATOR_HOST=127.0.0.1:8380 node regole.prova.js

   Le regole VERE (diretta/firebase/firestore.rules) caricate
   nell'emulatore, e i browser simulati con @firebase/rules-unit-testing:
   ogni prova e' una lettura o una scrittura che un partecipante (o un
   curioso non autenticato, o un gestore) potrebbe tentare dal proprio
   browser, con la chiave pubblica del progetto in mano.

   COSA DIMOSTRANO. Che un partecipante legge il proprio evento e il
   proprio profilo e NIENT'ALTRO: non gli altri eventi, non gli altri
   partecipanti, non i nomi utente, gli indirizzi, gli accessi, i
   tentativi, le code. Che non puo' scrivere niente se non il proprio
   segnale di presenza, e solo nelle forme e nei tempi previsti
   (orario del server, uno ogni 50 s, un minuto alla volta, niente
   tempo contato quando la pagina era chiusa). Che un account
   disattivato o soppiantato da un altro dispositivo smette di
   scrivere. Che il gestore legge gli eventi e basta.
   Esce con 1 se qualcosa e' rosso.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const {
    initializeTestEnvironment, assertFails, assertSucceeds
} = require('@firebase/rules-unit-testing');
const {
    doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection,
    serverTimestamp, increment, Timestamp, setLogLevel
} = require('firebase/firestore');

// i rifiuti attesi li scriverebbe il client come errori: qui sono il risultato voluto
setLogLevel('silent');

const [host, porta] = String(process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
const REGOLE = fs.readFileSync(path.resolve(__dirname, '../firebase/firestore.rules'), 'utf8');

let rossi = 0, verdi = 0;
async function prova(descrizione, fn) {
    try { await fn(); verdi++; console.log('  ok  ' + descrizione); }
    catch (e) { rossi++; console.log('ROSSO ' + descrizione + '\n       ' + String(e && e.message || e).split('\n')[0]); }
}
const secondiFa = s => Timestamp.fromMillis(Date.now() - s * 1000);

(async () => {
    const env = await initializeTestEnvironment({
        projectId: 'demo-regole-diretta',
        firestore: { host, port: Number(porta), rules: REGOLE }
    });

    async function semina(fn) {
        await env.withSecurityRulesDisabled(async ctx => { await fn(ctx.firestore()); });
    }
    await env.clearFirestore();
    await semina(async db => {
        await setDoc(doc(db, 'eventi/napoli-2026'), { titolo: 'Napoli', stato: 'in_onda', videoId: 'https://webtv.esempio.it/live/napoli/playlist.m3u8' });
        await setDoc(doc(db, 'eventi/milano-2026'), { titolo: 'Milano', stato: 'programmato', videoId: '' });
        await setDoc(doc(db, 'partecipanti/anna'), { nomeUtente: 'annabianchi', stato: 'attivo', eventi: ['napoli-2026'] });
        await setDoc(doc(db, 'partecipanti/bruno'), { nomeUtente: 'brunoverdi', stato: 'attivo', eventi: ['milano-2026'] });
        await setDoc(doc(db, 'partecipanti/carla'), { nomeUtente: 'carlaneri', stato: 'disattivato', eventi: ['napoli-2026'] });
        await setDoc(doc(db, 'partecipanti/dario'), { nomeUtente: 'dariorossi', stato: 'attivo', eventi: ['napoli-2026'] });
        // stato dell'account e dispositivo ammesso: solo server
        await setDoc(doc(db, 'sessioni/anna'), { stato: 'attivo', sessioneAttiva: null });
        await setDoc(doc(db, 'sessioni/bruno'), { stato: 'attivo', sessioneAttiva: null });
        await setDoc(doc(db, 'sessioni/carla'), { stato: 'disattivato', sessioneAttiva: null });
        await setDoc(doc(db, 'sessioni/dario'), { stato: 'attivo', sessioneAttiva: 'telefono' });
        await setDoc(doc(db, 'eventiRiservati/napoli-2026'), { videoUrl: 'https://webtv.esempio.it/live/napoli/playlist.m3u8', videoId: 'https://webtv.esempio.it/live/napoli/playlist.m3u8' });
        await setDoc(doc(db, 'nomiUtente/annabianchi'), { uid: 'anna', base: 'annabianchi' });
        await setDoc(doc(db, 'indirizzi/anna@x.it'), { uid: 'anna' });
        await setDoc(doc(db, 'accessi/a1'), { uid: 'anna', idEvento: 'napoli-2026' });
        await setDoc(doc(db, 'tentativi/annabianchi'), { falliti: 2 });
        await setDoc(doc(db, 'code/napoli-2026'), { attiva: true });
        await setDoc(doc(db, 'limiti/x'), { conteggio: 1 });
    });

    const anna = env.authenticatedContext('anna', { eventi: ['napoli-2026'] }).firestore();
    const bruno = env.authenticatedContext('bruno', { eventi: ['milano-2026'] }).firestore();
    const carla = env.authenticatedContext('carla', { eventi: ['napoli-2026'] }).firestore();
    const dario = env.authenticatedContext('dario', { eventi: ['napoli-2026'] }).firestore();
    const gestore = env.authenticatedContext('g1', { gestore: true, email: 'gestore@prova.it' }).firestore();
    const furbo = env.authenticatedContext('furbo', { eventi: 'napoli-2026' }).firestore(); // claim non lista
    const anonimo = env.unauthenticatedContext().firestore();

    console.log('\nLetture');
    await prova('il partecipante legge il proprio evento', () => assertSucceeds(getDoc(doc(anna, 'eventi/napoli-2026'))));
    await prova('il partecipante NON legge un altro evento', () => assertFails(getDoc(doc(anna, 'eventi/milano-2026'))));
    await prova('il partecipante NON elenca gli eventi', () => assertFails(getDocs(collection(anna, 'eventi'))));
    await prova('il partecipante legge il proprio profilo', () => assertSucceeds(getDoc(doc(anna, 'partecipanti/anna'))));
    await prova('il partecipante NON legge il profilo di un altro', () => assertFails(getDoc(doc(anna, 'partecipanti/bruno'))));
    await prova('il partecipante NON elenca i partecipanti', () => assertFails(getDocs(collection(anna, 'partecipanti'))));
    for (const p of ['nomiUtente/annabianchi', 'indirizzi/anna@x.it', 'accessi/a1', 'tentativi/annabianchi', 'code/napoli-2026', 'limiti/x', 'presenze/napoli-2026_anna', 'sessioni/anna', 'eventiRiservati/napoli-2026']) {
        await prova('il partecipante NON legge ' + p.split('/')[0], () => assertFails(getDoc(doc(anna, p))));
    }
    await prova('un account disattivato NON legge piu\' l\'evento (anche con il token ancora valido)', () => assertFails(getDoc(doc(carla, 'eventi/napoli-2026'))));
    await prova('senza accesso NON si legge nessun evento', () => assertFails(getDoc(doc(anonimo, 'eventi/napoli-2026'))));
    await prova('senza accesso NON si legge nessun profilo', () => assertFails(getDoc(doc(anonimo, 'partecipanti/anna'))));
    await prova('un claim "eventi" che non e\' una lista non apre niente', () => assertFails(getDoc(doc(furbo, 'eventi/napoli-2026'))));
    await prova('il gestore legge gli eventi (anteprima)', () => assertSucceeds(getDoc(doc(gestore, 'eventi/milano-2026'))));
    await prova('il gestore NON legge i profili dal browser', () => assertFails(getDoc(doc(gestore, 'partecipanti/anna'))));
    await prova('il gestore NON legge i nomi utente dal browser', () => assertFails(getDoc(doc(gestore, 'nomiUtente/annabianchi'))));

    console.log('\nScritture vietate');
    await prova('il partecipante NON modifica l\'evento (es. il video)', () => assertFails(updateDoc(doc(anna, 'eventi/napoli-2026'), { videoId: 'https://altro.esempio.it/live/playlist.m3u8' })));
    await prova('il partecipante NON modifica il proprio profilo', () => assertFails(updateDoc(doc(anna, 'partecipanti/anna'), { stato: 'attivo', sessioneAttiva: null })));
    await prova('il partecipante NON crea eventi', () => assertFails(setDoc(doc(anna, 'eventi/nuovo'), { titolo: 'x' })));
    await prova('il partecipante NON prenota nomi utente', () => assertFails(setDoc(doc(anna, 'nomiUtente/zzz'), { uid: 'anna' })));
    await prova('il partecipante NON si toglie il blocco del dispositivo', () => assertFails(setDoc(doc(dario, 'sessioni/dario'), { stato: 'attivo', sessioneAttiva: null })));
    await prova('il gestore NON scrive dal browser', () => assertFails(updateDoc(doc(gestore, 'eventi/napoli-2026'), { stato: 'terminato' })));

    console.log('\nPresenza: creazione');
    const base = () => ({ uid: 'anna', idEvento: 'napoli-2026', primo: serverTimestamp(), ultimo: serverTimestamp(), secondi: 0, collegamenti: 1, sessione: 's1' });
    await prova('NON con i secondi gia\' pieni', () => assertFails(setDoc(doc(anna, 'presenze/napoli-2026_anna'), Object.assign(base(), { secondi: 600 }))));
    await prova('NON con l\'orario scelto dal browser', () => assertFails(setDoc(doc(anna, 'presenze/napoli-2026_anna'), Object.assign(base(), { primo: secondiFa(3600), ultimo: secondiFa(3600) }))));
    await prova('NON a nome di un altro', () => assertFails(setDoc(doc(anna, 'presenze/napoli-2026_bruno'), Object.assign(base(), { uid: 'bruno' }))));
    await prova('NON con un identificativo che non corrisponde', () => assertFails(setDoc(doc(anna, 'presenze/qualcosa'), base())));
    await prova('NON per un evento a cui non e\' iscritto', () => assertFails(setDoc(doc(anna, 'presenze/milano-2026_anna'), Object.assign(base(), { idEvento: 'milano-2026' }))));
    await prova('NON con campi in piu\'', () => assertFails(setDoc(doc(anna, 'presenze/napoli-2026_anna'), Object.assign(base(), { nome: 'x' }))));
    await prova('NON con una sessione troppo lunga', () => assertFails(setDoc(doc(anna, 'presenze/napoli-2026_anna'), Object.assign(base(), { sessione: 'x'.repeat(41) }))));
    await prova('NON da un account disattivato', () => assertFails(setDoc(doc(carla, 'presenze/napoli-2026_carla'), Object.assign(base(), { uid: 'carla' }))));
    await prova('NON da un dispositivo soppiantato (un solo dispositivo)', () => assertFails(setDoc(doc(dario, 'presenze/napoli-2026_dario'), Object.assign(base(), { uid: 'dario', sessione: 'computer' }))));
    await prova('SI dal dispositivo attivo (un solo dispositivo)', () => assertSucceeds(setDoc(doc(dario, 'presenze/napoli-2026_dario'), Object.assign(base(), { uid: 'dario', sessione: 'telefono' }))));
    await prova('SI il primo segnale corretto', () => assertSucceeds(setDoc(doc(anna, 'presenze/napoli-2026_anna'), base())));
    await prova('NON leggere il proprio segnale', () => assertFails(getDoc(doc(anna, 'presenze/napoli-2026_anna'))));
    await prova('NON cancellare il proprio segnale', () => assertFails(deleteDoc(doc(anna, 'presenze/napoli-2026_anna'))));

    console.log('\nPresenza: segnali successivi');
    async function presenza(ultimoSecondiFa, extra) {
        await semina(db => setDoc(doc(db, 'presenze/napoli-2026_anna'), Object.assign({
            uid: 'anna', idEvento: 'napoli-2026', primo: secondiFa(3600), ultimo: secondiFa(ultimoSecondiFa),
            secondi: 600, collegamenti: 2, sessione: 's1'
        }, extra || {})));
    }
    const rif = () => doc(anna, 'presenze/napoli-2026_anna');
    await presenza(10);
    await prova('NON un segnale 10 s dopo il precedente (uno ogni 50 s)', () => assertFails(updateDoc(rif(), { ultimo: serverTimestamp(), secondi: increment(60) })));
    await presenza(61);
    await prova('SI "continua" dopo 61 s, +60 secondi', () => assertSucceeds(updateDoc(rif(), { ultimo: serverTimestamp(), secondi: increment(60) })));
    await presenza(61);
    await prova('SI "continua" senza aggiungere secondi (evento non in onda)', () => assertSucceeds(updateDoc(rif(), { ultimo: serverTimestamp() })));
    await presenza(55);
    await prova('NON +60 secondi dopo soli 55 s (i minuti non si gonfiano)', () => assertFails(updateDoc(rif(), { ultimo: serverTimestamp(), secondi: increment(60) })));
    await presenza(55);
    await prova('SI "continua" dopo 55 s senza aggiungere secondi', () => assertSucceeds(updateDoc(rif(), { ultimo: serverTimestamp() })));
    await semina(db => updateDoc(doc(db, 'eventi/napoli-2026'), { stato: 'programmato' }));
    await presenza(61);
    await prova('NON +60 secondi mentre l\'evento non e\' in onda', () => assertFails(updateDoc(rif(), { ultimo: serverTimestamp(), secondi: increment(60) })));
    await presenza(61);
    await prova('SI "continua" a evento non in onda, senza secondi', () => assertSucceeds(updateDoc(rif(), { ultimo: serverTimestamp() })));
    await semina(db => updateDoc(doc(db, 'eventi/napoli-2026'), { stato: 'in_onda' }));
    await presenza(61);
    await prova('NON +120 secondi in un colpo', () => assertFails(updateDoc(rif(), { ultimo: serverTimestamp(), secondi: increment(120) })));
    await presenza(61);
    await prova('NON un orario scelto dal browser', () => assertFails(updateDoc(rif(), { ultimo: Timestamp.now(), secondi: increment(60) })));
    await presenza(200);
    await prova('NON contare il tempo a pagina chiusa (200 s senza segnali)', () => assertFails(updateDoc(rif(), { ultimo: serverTimestamp(), secondi: increment(60) })));
    await presenza(200);
    await prova('SI "nuovo collegamento" dopo una pausa', () => assertSucceeds(updateDoc(rif(), { ultimo: serverTimestamp(), collegamenti: increment(1), sessione: 's2' })));
    await presenza(61);
    await prova('NON "nuovo collegamento" con i secondi aumentati', () => assertFails(updateDoc(rif(), { ultimo: serverTimestamp(), collegamenti: increment(1), secondi: increment(60) })));
    await presenza(61);
    await prova('NON "continua" cambiando sessione', () => assertFails(updateDoc(rif(), { ultimo: serverTimestamp(), sessione: 's9' })));
    await presenza(61);
    await prova('NON riscrivere il primo collegamento', () => assertFails(updateDoc(rif(), { ultimo: serverTimestamp(), primo: secondiFa(99999) })));
    await presenza(61);
    await prova('NON spostare il segnale su un altro evento', () => assertFails(updateDoc(rif(), { ultimo: serverTimestamp(), idEvento: 'milano-2026' })));
    await presenza(61);
    await prova('NON azzerare i minuti', () => assertFails(updateDoc(rif(), { ultimo: serverTimestamp(), secondi: 0 })));
    await prova('NON aggiornare il segnale di un altro', () => assertFails(updateDoc(doc(bruno, 'presenze/napoli-2026_anna'), { ultimo: serverTimestamp() })));

    console.log('\nPresenza: disattivazione e secondo dispositivo durante la diretta');
    await semina(db => setDoc(doc(db, 'presenze/napoli-2026_dario'), {
        uid: 'dario', idEvento: 'napoli-2026', primo: secondiFa(600), ultimo: secondiFa(61), secondi: 480, collegamenti: 1, sessione: 'telefono'
    }));
    await semina(db => updateDoc(doc(db, 'sessioni/dario'), { sessioneAttiva: 'computer' }));
    await prova('il telefono soppiantato dal computer NON scrive piu\'', () => assertFails(updateDoc(doc(dario, 'presenze/napoli-2026_dario'), { ultimo: serverTimestamp(), secondi: increment(60) })));
    await prova('il computer (nuova sessione) scrive', () => assertSucceeds(updateDoc(doc(dario, 'presenze/napoli-2026_dario'), { ultimo: serverTimestamp(), collegamenti: increment(1), sessione: 'computer' })));
    await semina(db => updateDoc(doc(db, 'sessioni/anna'), { stato: 'disattivato' }));
    await presenza(61);
    await prova('un account disattivato durante la diretta NON scrive piu\'', () => assertFails(updateDoc(rif(), { ultimo: serverTimestamp(), secondi: increment(60) })));

    await env.cleanup();
    console.log('\n' + verdi + ' verdi, ' + rossi + ' rossi');
    process.exit(rossi ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
