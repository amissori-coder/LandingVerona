/* ============================================================
   PROVE - tutte, una dopo l'altra
   ------------------------------------------------------------
       cd diretta/prove && npm install      (una volta)
       node esegui-tutte.js                 (circa 15 minuti)
       node esegui-tutte.js --carico        (anche il carico: +8 minuti)
       node esegui-tutte.js --solo regole,e2e

   Ogni prova avvia e ferma da sola quello che le serve (emulatori,
   server locale, browser) sulle sue porte; per le regole e la
   separazione questo file accende un emulatore apposta. Alla fine un
   riepilogo con i numeri di ciascuna, anche in
   risultati/riepilogo.json. Esce con 1 se qualcosa e' rosso.

   Le prove del video (pagina, e2e, player, webtv) trasmettono una
   diretta di prova con ffmpeg (quello di sistema, FFMPEG=/percorso,
   oppure pip install imageio-ffmpeg); player e webtv usano anche il
   flusso pubblico di prova di Shaka Player (storage.googleapis.com),
   quindi vogliono la rete.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const QUI = __dirname;
const SERVIZIO = path.resolve(QUI, '../../email-service');
const argomenti = process.argv.slice(2);
const conCarico = argomenti.indexOf('--carico') >= 0;
const solo = (() => {
    const i = argomenti.indexOf('--solo');
    return i >= 0 && argomenti[i + 1] ? argomenti[i + 1].split(',') : null;
})();

// nome, cartella, comando, variabili d'ambiente in piu', ha bisogno dell'emulatore comune
const PROVE = [
    { nome: 'nome-utente', cartella: SERVIZIO, file: 'prove/diretta-nome-utente.prove.js' },
    { nome: 'password', cartella: SERVIZIO, file: 'prove/diretta-password.prove.js' },
    { nome: 'email', cartella: SERVIZIO, file: 'prove/diretta-mail.prove.js' },
    { nome: 'tempi', cartella: SERVIZIO, file: 'prove/diretta-accesso-tempi.prove.js' },
    { nome: 'video', cartella: SERVIZIO, file: 'prove/diretta-video.prove.js' },
    { nome: 'firma', cartella: SERVIZIO, file: 'prove/diretta-firma.prove.js' },
    { nome: 'prova-link', cartella: SERVIZIO, file: 'prove/diretta-prova-link.prove.js' },
    { nome: 'regole', cartella: QUI, file: 'regole.prova.js', emulatore: true },
    { nome: 'separazione', cartella: QUI, file: 'separazione.prova.js', emulatore: true },
    { nome: 'doppioni', cartella: QUI, file: 'doppioni.prova.js' },
    { nome: 'accesso', cartella: QUI, file: 'accesso.prova.js' },
    { nome: 'coda', cartella: QUI, file: 'coda.prova.js' },
    { nome: 'pagina', cartella: QUI, file: 'pagina.prova.js' },
    { nome: 'gestione', cartella: QUI, file: 'gestione.prova.js' },
    { nome: 'sito', cartella: QUI, file: 'sito.prova.js' },
    { nome: 'e2e', cartella: QUI, file: 'e2e.prova.js' },
    { nome: 'player', cartella: QUI, file: 'player.prova.js' },
    { nome: 'webtv', cartella: QUI, file: 'webtv.prova.js' },
    { nome: 'anteprima', cartella: QUI, file: 'anteprima/anteprima.prova.js' }
];
const EMULATORE = { firestore: 8980, auth: 9980 };

function esegui(comando, args, cartella, env, rigaPronto) {
    return new Promise(risolvi => {
        const f = spawn(comando, args, { cwd: cartella, env: Object.assign({}, process.env, env || {}), stdio: ['ignore', 'pipe', 'pipe'] });
        let uscita = '';
        const leggi = d => {
            uscita += d.toString();
            if (rigaPronto && uscita.indexOf(rigaPronto) >= 0) risolvi({ f, uscita });
        };
        f.stdout.on('data', leggi);
        f.stderr.on('data', leggi);
        f.on('exit', codice => risolvi({ codice, uscita }));
    });
}

(async () => {
    const scelte = PROVE.filter(p => !solo || solo.indexOf(p.nome) >= 0);
    let emulatore = null;
    if (scelte.some(p => p.emulatore)) {
        process.stdout.write('emulatore comune (firestore ' + EMULATORE.firestore + ', auth ' + EMULATORE.auth + ')... ');
        emulatore = await esegui(process.execPath, ['avvia-emulatori.js', '--firestore', String(EMULATORE.firestore), '--auth', String(EMULATORE.auth)], QUI, {}, 'EMULATORI PRONTI');
        console.log(emulatore.f ? 'pronto' : 'NON PARTITO');
    }
    const riepilogo = [];
    for (const p of scelte) {
        const t0 = Date.now();
        process.stdout.write(p.nome.padEnd(14));
        const env = p.emulatore ? {
            FIRESTORE_EMULATOR_HOST: '127.0.0.1:' + EMULATORE.firestore,
            FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:' + EMULATORE.auth
        } : {};
        const r = await esegui(process.execPath, [p.file], p.cartella, env);
        const numeri = /(\d+) verdi, (\d+) rossi/.exec(r.uscita.split('\n').filter(x => /verdi, \d+ rossi/.test(x)).pop() || '') || [];
        const esito = {
            prova: p.nome, file: path.relative(path.resolve(QUI, '../..'), path.join(p.cartella, p.file)),
            verdi: Number(numeri[1] || 0), rossi: Number(numeri[2] || 0), uscita: r.codice, secondi: Math.round((Date.now() - t0) / 1000)
        };
        riepilogo.push(esito);
        console.log((r.codice === 0 ? 'ok   ' : 'ROSSO') + '  ' + String(esito.verdi).padStart(4) + ' verdi  ' + String(esito.rossi).padStart(3) + ' rossi  ' + String(esito.secondi).padStart(4) + ' s');
        if (r.codice !== 0) {
            fs.mkdirSync(path.join(QUI, 'risultati'), { recursive: true });
            fs.writeFileSync(path.join(QUI, 'risultati', 'uscita-' + p.nome + '.txt'), r.uscita);
            console.log('               uscita completa in risultati/uscita-' + p.nome + '.txt');
        }
    }
    if (emulatore && emulatore.f) emulatore.f.kill('SIGINT');
    if (conCarico) {
        console.log('\ncarico (1000 persone): vedi carico.prova.js per il comando completo; qui si usa la stessa procedura');
        const sh = path.join(QUI, 'carico.sh');
        if (fs.existsSync(sh)) {
            const r = await esegui('bash', [sh], QUI, {});
            riepilogo.push({ prova: 'carico', uscita: r.codice });
            console.log(r.uscita.split('\n').slice(-25).join('\n'));
        }
    }
    fs.mkdirSync(path.join(QUI, 'risultati'), { recursive: true });
    fs.writeFileSync(path.join(QUI, 'risultati', 'riepilogo.json'), JSON.stringify({ quando: new Date().toISOString(), prove: riepilogo }, null, 2));
    const tot = riepilogo.reduce((a, x) => ({ v: a.v + (x.verdi || 0), r: a.r + (x.rossi || 0) }), { v: 0, r: 0 });
    const falliti = riepilogo.filter(x => x.uscita !== 0);
    console.log('\nTotale: ' + tot.v + ' verdi, ' + tot.r + ' rossi; prove non riuscite: ' + (falliti.map(x => x.prova).join(', ') || 'nessuna'));
    setTimeout(() => process.exit(falliti.length ? 1 : 0), 1000);
})();
