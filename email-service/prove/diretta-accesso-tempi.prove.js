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
      dalModulo) su Vercel NON aspetta mai il lavoro della diretta: la
      risposta del modulo parte subito, sia che il lavoro sia breve (un
      indirizzo gia' iscritto) sia che sia lungo (account, password,
      email), e il lavoro finisce dopo con waitUntil. Cosi' il tempo
      della risposta non dice se un indirizzo e' gia' iscritto. Fuori da
      Vercel si aspetta la fine. Un errore della diretta non esce dal
      gancio (il modulo risponde come sempre) e nel log non finisce
      l'email. E quale pagina conta: se il modulo manda un percorso
      valido vince il percorso, l'etichetta vale solo senza.
   4. "Email o password non corretti." non parte prima di
      TEMPO_FALLITO_MS (900 ms) + fino a CASO_FALLITO_MS (300 ms) a caso:
      il pavimento sta sopra il tempo di un'email iscritta con Firestore
      e Google veri (vedi il commento in lib/diretta-accesso.js).
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
        // fuori da Vercel: un lavoro breve risponde subito
        let t0 = Date.now();
        const breve = await I.dalModulo(MODULO, { ctx: lento(20) });
        vero(breve.esito === 'nessun-evento' && Date.now() - t0 < 500, 'gancio: lavoro breve, risposta subito (' + (Date.now() - t0) + ' ms, ' + breve.esito + ')');

        // su Vercel: MAI aspettare, ne' un lavoro lungo ne' uno breve (stesso tempo per nuovo e gia' iscritto)
        const affidati = [];
        globalThis[CONTESTO] = { get: () => ({ waitUntil: p => affidati.push(p) }) };
        const tempi = [];
        for (const durata of [2500, 15, 1200, 5]) {
            let finito = false;
            const ctx = lento(durata);
            t0 = Date.now();
            const r = await I.dalModulo(MODULO, { ctx: ctx });
            tempi.push(Date.now() - t0);
            const affidato = affidati[affidati.length - 1];
            if (affidato) affidato.then(() => { finito = true; });
            await pausa(0);
            vero(r.esito === 'in-corso' && !finito, 'gancio su Vercel, lavoro di ' + durata + ' ms: il modulo risponde subito (' + tempi[tempi.length - 1] + ' ms), il lavoro non e\' ancora finito');
        }
        vero(affidati.length === 4 && Math.max.apply(null, tempi) < 50, 'gancio su Vercel: sempre waitUntil, e la risposta non dipende dal lavoro (' + tempi.join(', ') + ' ms)');
        const finali = await Promise.all(affidati);
        vero(finali.every(f => f && f.esito === 'nessun-evento'), 'gancio su Vercel: i lavori affidati a waitUntil finiscono');

        affidati.length = 0;
        const rotto = await I.dalModulo(MODULO, { ctx: lento(10, 'Firestore fermo per mario.rossi@esempio.it') });
        let rifiutata = false;
        const finaleRotto = await (affidati[0] || Promise.resolve(null)).catch(() => { rifiutata = true; });
        vero(rotto.esito === 'in-corso' && affidati.length === 1 && !rifiutata && finaleRotto && finaleRotto.esito === 'errore',
            'gancio su Vercel: un errore della diretta non esce (esito "errore" nel lavoro affidato, nessuna promessa rifiutata)');
        vero(erroriGancio.some(e => /iscrizione dal modulo non riuscita/.test(e)) && erroriGancio.every(e => !/mario\.rossi@esempio\.it/i.test(e)), 'gancio: l\'errore finisce nel log, senza l\'email');
        delete globalThis[CONTESTO];

        // fuori da Vercel si aspetta la fine (come "password dimenticata"), e un errore non esce
        t0 = Date.now();
        const locale2 = await I.dalModulo(MODULO, { ctx: lento(1500) });
        vero(locale2.esito === 'nessun-evento' && Date.now() - t0 >= 1500, 'gancio fuori da Vercel: si aspetta la fine del lavoro (' + (Date.now() - t0) + ' ms)');
        const rottoLocale = await I.dalModulo(MODULO, { ctx: lento(10, 'guasto') });
        vero(rottoLocale.esito === 'errore', 'gancio fuori da Vercel: un errore della diretta non esce (esito "errore")');

        /* quale pagina conta: il percorso, se ce n'e' uno valido; l'etichetta solo senza */
        const NAPOLI = 'Napoli 2 Ottobre 2026 - Manifestazione di interesse';
        const pg = (percorso, pagina) => JSON.stringify(I.pagineDelModulo({ percorso: percorso, pagina: pagina }));
        vero(pg('/napoli_ottobre_2026/', 'Roma 16 Aprile 2026 - Iscrizione') === '["/napoli_ottobre_2026/"]', 'percorso di Napoli con l\'etichetta di Roma: conta solo il percorso');
        vero(pg('/roma_aprile_2026/index.html', NAPOLI) === '["/roma_aprile_2026/index.html"]', 'percorso di Roma con l\'etichetta di Napoli: conta solo il percorso');
        vero(pg('', NAPOLI) === JSON.stringify([NAPOLI]) && pg(undefined, NAPOLI) === JSON.stringify([NAPOLI]), 'senza percorso: l\'etichetta');
        vero(pg('/', NAPOLI) === JSON.stringify([NAPOLI]) && pg('non un percorso', NAPOLI) === JSON.stringify([NAPOLI]) && pg('/<x>/', NAPOLI) === JSON.stringify([NAPOLI]),
            'la home o un percorso non valido non contano come percorso: si usa l\'etichetta');
        vero(pg('https://nextgenerationbusiness.it/napoli_ottobre_2026/#accreditamento', '') === '["https://nextgenerationbusiness.it/napoli_ottobre_2026/#accreditamento"]' && pg('', '') === '[]',
            'un indirizzo intero vale come percorso; niente di niente: nessuna pagina');
        vero(I.paginaCorrisponde('/napoli_ottobre_2026/index.html', '/napoli_ottobre_2026/') && !I.paginaCorrisponde('/roma_aprile_2026/', '/napoli_ottobre_2026/')
            && I.paginaCorrisponde(NAPOLI, '/napoli_ottobre_2026/') && !I.paginaCorrisponde('Roma 16 Aprile 2026 - Iscrizione', '/napoli_ottobre_2026/'),
            'il confronto con la pagina dell\'evento: percorsi normalizzati, etichetta per parole');
    } finally {
        console.error = erroreOriginale;
        delete globalThis[CONTESTO];
        delete process.env.DIRETTA_EMULATORE;
    }

    /* ---------- 4. il pavimento delle risposte sbagliate ---------- */
    vero(A.TEMPO_FALLITO_MS >= 900 && A.CASO_FALLITO_MS >= 300, 'pavimento delle risposte sbagliate: ' + A.TEMPO_FALLITO_MS + ' ms + fino a ' + A.CASO_FALLITO_MS + ' ms a caso');
    const pavimenti = [];
    for (let i = 0; i < 6; i++) {
        const t0 = Date.now();
        await A.tempoMinimo(t0);
        pavimenti.push(Date.now() - t0);
    }
    vero(pavimenti.every(ms => ms >= A.TEMPO_FALLITO_MS && ms < A.TEMPO_FALLITO_MS + A.CASO_FALLITO_MS + 60),
        'una risposta sbagliata subito pronta aspetta fra ' + A.TEMPO_FALLITO_MS + ' e ' + (A.TEMPO_FALLITO_MS + A.CASO_FALLITO_MS) + ' ms (' + pavimenti.join(', ') + ')');
    // un ramo lento (Firestore e Google veri: 800 ms) non esce dal pavimento
    const t1 = Date.now();
    await pausa(800);
    await A.tempoMinimo(t1);
    const lentoMs = Date.now() - t1;
    vero(lentoMs >= A.TEMPO_FALLITO_MS && lentoMs < A.TEMPO_FALLITO_MS + A.CASO_FALLITO_MS + 60, 'anche dopo 800 ms di lavoro la risposta parte nella stessa finestra (' + lentoMs + ' ms)');

    console.log('\n' + verdi + ' verdi, ' + rossi + ' rossi');
    process.exit(rossi ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
