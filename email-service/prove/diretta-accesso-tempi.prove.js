/* ============================================================
   PROVE - tempi di risposta e token rifiutati della diretta
   ------------------------------------------------------------
       node prove/diretta-accesso-tempi.prove.js

   Niente da installare, niente emulatori. Esce con 1 se qualcosa e'
   rosso. Dura una ventina di secondi.

   COSA DIMOSTRANO.
   1. "Password dimenticata" e l'accesso dei gestori rispondono sempre
      dopo lo stesso tempo (2,5-2,9 s), anche quando il lavoro dietro
      (Brevo lento) dura di piu': su Vercel la risposta parte allo
      scadere e il lavoro finisce dopo con waitUntil; fuori da Vercel
      si aspetta la fine. Un errore nel lavoro non cambia la risposta.
   2. Un token scaduto, revocato o sbagliato fa uscire (401); un
      intoppo di Google (rete, chiavi pubbliche non scaricate, errore
      interno) no (503, si riprova), anche quando firebase-admin lo
      presenta come 'auth/argument-error'.
   3. Il gancio del modulo del sito (lib/diretta-iscrizione.js,
      dalModulo) non tiene ferma la risposta del modulo oltre il suo
      tempo massimo: su Vercel la risposta parte e il lavoro della
      diretta finisce dopo con waitUntil; un lavoro breve non aspetta
      niente; un errore della diretta non esce dal gancio (il modulo
      risponde come sempre) e nel log non finisce l'email.
   ============================================================ */
'use strict';
const A = require('../lib/diretta-accesso');
const C = require('../lib/diretta-comune');
const I = require('../lib/diretta-iscrizione');

let rossi = 0, verdi = 0;
function vero(cond, descrizione) {
    if (cond) verdi++;
    else { rossi++; console.log('ROSSO  ' + descrizione); }
}
const pausa = ms => new Promise(r => setTimeout(r, ms));
const CONTESTO = Symbol.for('@vercel/request-context');

async function misura(fn) {
    const t0 = Date.now();
    await A.aDurataCostante('prova', fn);
    return Date.now() - t0;
}

(async () => {
    /* ---------- 1. durata costante ---------- */
    const errori = [];
    const originale = console.error;
    console.error = m => errori.push(String(m));
    try {
        const breve = await misura(async () => { await pausa(50); });
        vero(breve >= 2500 && breve < 3000, 'lavoro breve: risposta dopo 2,5-2,9 s (' + breve + ' ms)');

        const conErrore = await misura(async () => { await pausa(20); throw new Error('Brevo non risponde'); });
        vero(conErrore >= 2500 && conErrore < 3000, 'lavoro che fallisce: stessa attesa (' + conErrore + ' ms)');
        vero(errori.some(e => /prova: .*Brevo non risponde/.test(e)), 'l\'errore del lavoro finisce nel log');

        // fuori da Vercel: nessun waitUntil, si aspetta la fine del lavoro
        let finitoLocale = false;
        const locale = await misura(async () => { await pausa(3600); finitoLocale = true; });
        vero(finitoLocale && locale >= 3600, 'fuori da Vercel il lavoro lungo si aspetta (' + locale + ' ms)');

        // su Vercel: la risposta parte allo scadere, il lavoro continua con waitUntil
        const affidati = [];
        globalThis[CONTESTO] = { get: () => ({ waitUntil: p => affidati.push(p) }) };
        let finitoVercel = false;
        const vercel = await misura(async () => { await pausa(4000); finitoVercel = true; });
        vero(vercel >= 2500 && vercel < 3000, 'su Vercel il lavoro lungo non allunga la risposta (' + vercel + ' ms)');
        vero(affidati.length === 1 && typeof affidati[0].then === 'function', 'il lavoro rimasto passa a waitUntil');
        vero(!finitoVercel, 'alla risposta il lavoro non e\' ancora finito');
        if (affidati[0]) await affidati[0];
        vero(finitoVercel, 'il lavoro affidato a waitUntil finisce');

        // su Vercel, lavoro breve: nessun waitUntil, stessa attesa
        affidati.length = 0;
        const vercelBreve = await misura(async () => { await pausa(30); });
        vero(vercelBreve >= 2500 && vercelBreve < 3000 && affidati.length === 0, 'su Vercel un lavoro breve non usa waitUntil (' + vercelBreve + ' ms)');

        // su Vercel, un lavoro lungo che poi fallisce: la promessa affidata non rifiuta
        affidati.length = 0;
        await misura(async () => { await pausa(3200); throw new Error('tardi e male'); });
        let rifiutata = false;
        try { await affidati[0]; } catch (_) { rifiutata = true; }
        vero(affidati.length === 1 && !rifiutata && errori.some(e => /tardi e male/.test(e)), 'un errore dopo la risposta finisce nel log, senza promesse rifiutate');
        delete globalThis[CONTESTO];
    } finally {
        console.error = originale;
    }

    /* ---------- 2. token rifiutati: uscire o riprovare ---------- */
    const casi = [
        [{ code: 'auth/id-token-expired', message: 'Firebase ID token has expired.' }, true, 'token scaduto'],
        [{ code: 'auth/id-token-revoked', message: 'The Firebase ID token has been revoked.' }, true, 'token revocato'],
        [{ code: 'auth/user-disabled', message: 'The user record is disabled.' }, true, 'account disattivato'],
        [{ code: 'auth/argument-error', message: 'Firebase ID token has invalid signature. See https://firebase.google.com/docs/auth/admin/verify-id-tokens' }, true, 'firma sbagliata'],
        [{ code: 'auth/argument-error', message: 'Decoding Firebase ID token failed. Make sure you passed the entire string JWT which represents an ID token.' }, true, 'token illeggibile'],
        [{ code: 'auth/argument-error', message: 'Firebase ID token has "kid" claim which does not correspond to a known public key.' }, true, 'chiave sconosciuta'],
        [{ errorInfo: { code: 'auth/id-token-expired' }, message: '' }, true, 'codice solo in errorInfo'],
        // firebase-admin: le chiavi pubbliche non si scaricano -> 'auth/argument-error' con il messaggio dell'errore di rete
        [{ code: 'auth/argument-error', message: 'socket hang up' }, false, 'chiavi pubbliche: connessione interrotta'],
        [{ code: 'auth/argument-error', message: 'Error while making request: timeout of 10000ms exceeded.' }, false, 'chiavi pubbliche: tempo scaduto'],
        [{ code: 'auth/argument-error', message: 'Error fetching public keys for Google certs: Internal error' }, false, 'chiavi pubbliche: errore di Google'],
        [{ code: 'auth/argument-error', message: 'getaddrinfo EAI_AGAIN www.googleapis.com' }, false, 'chiavi pubbliche: DNS'],
        [{ code: 'app/network-error', message: 'Error while making request' }, false, 'controllo della revoca: rete'],
        [{ code: 'auth/internal-error', message: 'An internal error has occurred.' }, false, 'errore interno di Google'],
        [new Error('qualcosa di inatteso'), false, 'errore senza codice']
    ];
    casi.forEach(([e, atteso, nome]) => {
        vero(C.tokenNonValido(e) === atteso, nome + ': ' + (atteso ? 'fa uscire (401)' : 'si riprova (503)'));
    });

    // verificaGestore: dalla classificazione alla risposta
    async function stato(e) {
        const ctx = { auth: { verifyIdToken: async () => { throw e; } } };
        try { await C.verificaGestore(ctx, { headers: { authorization: 'Bearer x.y.z' } }); return 200; } catch (x) { return x.stato || 0; }
    }
    vero(await stato({ code: 'auth/id-token-expired', message: '' }) === 401, 'verificaGestore: token scaduto -> 401');
    vero(await stato({ code: 'auth/argument-error', message: 'socket hang up' }) === 503, 'verificaGestore: chiavi pubbliche non scaricate -> 503');

    /* ---------- 3. il gancio del modulo del sito ---------- */
    // un contesto finto: la lettura degli eventi con l'interruttore acceso dura quanto si vuole
    const lento = (ms, errore) => ({
        adesso: () => Date.now(),
        db: {
            collection: () => ({
                where: () => ({ get: async () => { await pausa(ms); if (errore) throw new Error(errore); return { empty: true, docs: [] }; } })
            })
        }
    });
    process.env.DIRETTA_EMULATORE = '1';   // "configurata": il contesto e' quello finto qui sopra
    const erroriGancio = [];
    const erroreOriginale = console.error;
    console.error = m => erroriGancio.push(String(m));
    try {
        const MODULO = { email: 'Mario.Rossi@Esempio.it', nome: 'Mario', cognome: 'Rossi', pagina: 'Napoli 2 Ottobre 2026 - Manifestazione di interesse' };
        let t0 = Date.now();
        const breve = await I.dalModulo(MODULO, { ctx: lento(20), attesaMs: 1000 });
        vero(breve.esito === 'nessun-evento' && Date.now() - t0 < 500, 'gancio: lavoro breve, risposta subito (' + (Date.now() - t0) + ' ms, ' + breve.esito + ')');

        const affidati = [];
        globalThis[CONTESTO] = { get: () => ({ waitUntil: p => affidati.push(p) }) };
        t0 = Date.now();
        const lungo = await I.dalModulo(MODULO, { ctx: lento(2500), attesaMs: 1000 });
        const durata = Date.now() - t0;
        vero(lungo.esito === 'in-corso' && durata >= 1000 && durata < 1400, 'gancio su Vercel: il modulo risponde allo scadere del tempo massimo (' + durata + ' ms), non alla fine del lavoro');
        vero(affidati.length === 1, 'gancio su Vercel: il lavoro rimasto passa a waitUntil');
        const finale = affidati[0] ? await affidati[0] : null;
        vero(finale && finale.esito === 'nessun-evento', 'gancio su Vercel: il lavoro affidato a waitUntil finisce');

        affidati.length = 0;
        t0 = Date.now();
        const rotto = await I.dalModulo(MODULO, { ctx: lento(10, 'Firestore fermo per mario.rossi@esempio.it'), attesaMs: 1000 });
        vero(rotto.esito === 'errore' && Date.now() - t0 < 500 && affidati.length === 0, 'gancio: un errore della diretta non esce (esito "errore", niente eccezioni)');
        vero(erroriGancio.some(e => /iscrizione dal modulo non riuscita/.test(e)) && erroriGancio.every(e => !/mario\.rossi@esempio\.it/i.test(e)), 'gancio: l\'errore finisce nel log, senza l\'email');
        delete globalThis[CONTESTO];

        // fuori da Vercel si aspetta la fine (come "password dimenticata")
        t0 = Date.now();
        const locale2 = await I.dalModulo(MODULO, { ctx: lento(1500), attesaMs: 500 });
        vero(locale2.esito === 'nessun-evento' && Date.now() - t0 >= 1500, 'gancio fuori da Vercel: si aspetta la fine del lavoro (' + (Date.now() - t0) + ' ms)');
    } finally {
        console.error = erroreOriginale;
        delete globalThis[CONTESTO];
        delete process.env.DIRETTA_EMULATORE;
    }

    console.log('\n' + verdi + ' verdi, ' + rossi + ' rossi');
    process.exit(rossi ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
