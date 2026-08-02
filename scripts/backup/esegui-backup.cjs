/* ============================================================
   BACKUP NOTTURNO NGB / Revilaw
   ------------------------------------------------------------
   Rifa' su GitHub Actions quello che prima faceva l'attivita' pianificata di
   Windows delle 03:00. Stessi cinque passi, stesso report, stessa cartella di
   destinazione su Drive. La differenza e' che non dipende piu' da nessun
   computer: se il PC si rompe, il backup continua.

   Variabili d'ambiente:
     FIREBASE_SERVICE_ACCOUNT  (obbligatoria) chiave del progetto Firebase
     GDRIVE_FOLDER_ID          (facoltativa)  id della cartella Backup-NGB
     GDRIVE_CLIENT_ID          \
     GDRIVE_CLIENT_SECRET       > accesso per conto dell'utente: l'unico che
     GDRIVE_REFRESH_TOKEN      /  funziona dentro "Il mio Drive"
     GDRIVE_SERVICE_ACCOUNT    (facoltativa)  alternativa per i Drive condivisi;
                                              se manca si prova con quella Firebase
     GITHUB_TOKEN              per elencare gli allegati delle release
     GITHUB_REPOSITORY         utente/repo
     CARTELLA_BACKUP           dove scrivere (predefinito: ./backup-uscita)
     INCLUDI_BUNDLE            "si" per forzare la storia git completa
     SALTA_VIDEO               "si" per non toccare i video
   ============================================================ */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const admin = require('firebase-admin');

const { leggiServiceAccount, token, modoDrive, tokenDrive } = require('./lib/credenziali.cjs');
const firestore = require('./lib/firestore.cjs');
const configurazione = require('./lib/configurazione.cjs');
const verifiche = require('./lib/verifiche.cjs');
const drive = require('./lib/drive.cjs');
const release = require('./lib/release.cjs');
const ripristino = require('./lib/ripristino.cjs');

const FUSO = 'Europe/Rome';
const radice = path.resolve(__dirname, '..', '..');

/* --- registro: stesse righe con l'orario davanti del backup di prima --- */
const righe = [];
const problemi = [];   // il backup e' incompleto: l'esecuzione deve risultare fallita
const avvisi = [];     // cose da guardare che pero' non intaccano la copia salvata
function ora() {
    return new Date().toLocaleTimeString('it-IT', { timeZone: FUSO, hour12: false });
}
function log(testo) {
    const riga = ora() + '  ' + testo;
    righe.push(riga);
    console.log(riga);
}
function guasto(testo) {
    problemi.push(testo);
    log('    ERRORE: ' + testo);
}
function avviso(testo) {
    avvisi.push(testo);
    log('    AVVISO: ' + testo);
}

function comando(programma, argomenti, opzioni) {
    return execFileSync(programma, argomenti, { cwd: radice, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opzioni }).trim();
}
function mb(byte) { return (byte / 1024 / 1024).toFixed(1) + ' MB'; }
function gb(byte) { return (byte / 1024 / 1024 / 1024).toFixed(2) + ' GB'; }

/* Un passo che puo' fallire senza far cadere tutto il resto. */
async function passo(descrizione, azione) {
    try { return await azione(); } catch (e) {
        guasto(descrizione + ': ' + (e && e.message ? e.message : e));
        return null;
    }
}

async function principale() {
    const adesso = new Date();
    const stampaData = adesso.toLocaleString('it-IT', { timeZone: FUSO, hour12: false });
    const etichetta = new Intl.DateTimeFormat('sv-SE', {
        timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
    }).format(adesso).replace(' ', '_').replace(':', '');   // 2026-08-01_0300

    const uscita = path.resolve(process.env.CARTELLA_BACKUP || path.join(radice, 'backup-uscita'), etichetta);
    fs.mkdirSync(uscita, { recursive: true });

    const deposito = process.env.GITHUB_REPOSITORY || '';
    const commit = comando('git', ['rev-parse', '--short', 'HEAD']);

    log('=== BACKUP NOTTURNO NGB / Revilaw ===');
    log('Data/ora:    ' + stampaData);
    log('Repo:        ' + (deposito || radice));
    log('Destinazione:' + uscita);
    log('');

    /* ---------- 1) Backup codice ---------- */
    log('--- 1) Backup codice ---');
    const zip = path.join(uscita, 'code-snapshot.zip');
    await passo('snapshot del codice', async () => {
        comando('git', ['archive', '--format=zip', '-o', zip, 'HEAD']);
        log('  commit HEAD: ' + commit);
        log('  snapshot allineato a quanto pubblicato online');
    });

    // La storia completa pesa centinaia di MB: si salva una volta a settimana
    // (domenica), come faceva il backup di prima.
    //
    // Ma solo se c'e' Drive a conservarla. L'allegato dell'esecuzione la esclude
    // di proposito - GitHub la storia ce l'ha gia', ricopiarla dentro GitHub non
    // aggiunge nessuna sicurezza - quindi senza Drive si passerebbe mezzo minuto
    // a produrre mezzo giga per poi buttarlo via.
    const conDrive = !!(process.env.GDRIVE_FOLDER_ID || '').trim();
    const domenica = adesso.getDay() === 0;
    const forzato = String(process.env.INCLUDI_BUNDLE || '').toLowerCase() === 'si';
    let bundle = null;
    if ((conDrive && domenica) || forzato) {
        bundle = path.join(uscita, 'repo-full.bundle');
        await passo('storia git completa', async () => {
            comando('git', ['bundle', 'create', bundle, '--all']);
            log('  storia git completa: ' + mb(fs.statSync(bundle).size));
        });
    } else if (!conDrive) {
        log('  storia git completa: saltata (senza Drive verrebbe scartata comunque)');
    } else {
        log('  storia git completa: saltata (si salva la domenica)');
    }

    /* ---------- 1-bis) Video del sito ---------- */
    log('--- 1-bis) Video del sito (allegati alle release) ---');
    const tokGitHub = process.env.GITHUB_TOKEN || '';
    let inv = null;
    if (!tokGitHub || !deposito) {
        log('  saltati: manca GITHUB_TOKEN o GITHUB_REPOSITORY');
    } else if (String(process.env.SALTA_VIDEO || '').toLowerCase() === 'si') {
        log('  saltati su richiesta (SALTA_VIDEO)');
    } else {
        inv = await passo('inventario dei video', async () => {
            const i = await release.inventario(deposito, tokGitHub);
            fs.writeFileSync(path.join(uscita, 'video-inventario.json'), JSON.stringify(i, null, 1));
            log('  video: ' + i.totaleFile + ' referenziati in ' + i.release.length + ' release (' + gb(i.totaleByte) + ' in totale)');
            return i;
        });
    }

    /* ---------- 2) Verifica backup codice ---------- */
    log('--- 2) Verifica backup codice ---');
    await passo('verifica dello zip', async () => {
        const elenco = comando('unzip', ['-l', zip]);
        const quanti = Number((elenco.match(/(\d+)\s+files?\s*$/) || [])[1] || 0);
        const haApp = elenco.includes('area-riservata/app.js');
        log('  snapshot zip: ' + (haApp ? 'OK' : 'INCOMPLETO') + ' (' + quanti + ' file, ' +
            (haApp ? 'contiene' : 'NON contiene') + ' area-riservata/app.js)');
        if (!haApp) guasto('lo snapshot non contiene area-riservata/app.js');
    });
    for (const f of [
        'area-riservata/app.js',
        'email-service/api/invia-comunicazione.js',
        'email-service/api/cron-comunicazioni.js',
        'email-service/api/invia-email.js'
    ]) {
        try {
            comando('node', ['--check', f]);
            log('  node --check ' + f + ': OK');
        } catch (e) { guasto('node --check ' + f + ' fallito'); }
    }

    /* ---------- 3) Backup dati Firebase ---------- */
    log('--- 3) Backup dati Firebase ---');
    const cred = leggiServiceAccount('FIREBASE_SERVICE_ACCOUNT');
    admin.initializeApp({ credential: admin.credential.cert(cred) });
    const progetto = cred.project_id;

    const esportazione = await passo('esportazione Firestore', async () => {
        const e = await firestore.esportaTutto(progetto);
        const destinazione = path.join(uscita, 'firestore-data.json');
        fs.writeFileSync(destinazione, JSON.stringify(e.contenuto, null, 1));
        const peso = fs.statSync(destinazione).size;
        log('  Export OK: ' + e.conteggi.collezioni + ' collezioni, ' + e.conteggi.documenti + ' documenti');
        JSON.parse(fs.readFileSync(destinazione, 'utf8'));   // rilettura di controllo
        log('  dati Firebase: OK (JSON valido, ' + mb(peso) + ')');
        return e;
    });

    /* ---------- 3-bis) Configurazione Firebase ---------- */
    log('--- 3-bis) Configurazione Firebase ---');
    const tokGoogle = await passo('token Google', () => token(cred, configurazione.AMBITI));
    let quantiUtenti = 0;

    const utenti = await passo('esportazione account', async () => {
        const u = await configurazione.esportaUtenti();
        fs.writeFileSync(path.join(uscita, 'auth-users.json'), JSON.stringify(u.contenuto, null, 1));
        quantiUtenti = u.totale;
        return u;
    });

    if (tokGoogle) {
        const problemiPrima = problemi.length;
        const hash = await passo('parametri di cifratura', () => configurazione.esportaParametriHash(tokGoogle, progetto));
        if (hash) {
            fs.writeFileSync(path.join(uscita, 'auth-parametri-hash.txt'), hash.testo);
            log('    utenti Authentication: ' + (utenti ? utenti.totale : '?') +
                ' (' + (utenti ? utenti.conPassword : '?') + ' con password, parametri di hash salvati: riutilizzabili)');
        } else {
            log('    utenti Authentication: ' + (utenti ? utenti.totale : '?') + ' (parametri di hash NON disponibili)');
            guasto('parametri di cifratura non ottenuti: in caso di ripristino le password vanno reimpostate una per una');
        }

        const regole = await passo('regole di sicurezza', () => configurazione.esportaRegole(tokGoogle, progetto));
        if (regole) {
            for (const f of regole.file) fs.writeFileSync(path.join(uscita, f.nomeFile), f.contenuto);
            fs.writeFileSync(path.join(uscita, 'firebase-regole.json'), JSON.stringify(regole.grezzo || {}, null, 1));
            log('    regole di sicurezza: ' + (regole.rilasci.join(', ') || 'nessuna'));
            if (!regole.file.length) guasto('nessuna regola di sicurezza salvata');
        }

        const indici = await passo('indici Firestore', () => configurazione.esportaIndici(tokGoogle, progetto));
        if (indici) {
            fs.writeFileSync(path.join(uscita, 'firestore-indici.json'), JSON.stringify(indici.contenuto, null, 1));
            log('    indici Firestore: ' + indici.quantiIndici + ' personalizzati');
        }
        log('  configurazione: ' + (problemi.length > problemiPrima ? 'INCOMPLETA' : 'OK'));
    }

    /* ---------- 4) Verifica area / integrazioni / API ---------- */
    log('--- 4) Verifica area / integrazioni / API ---');
    // Un endpoint che fa i capricci non rende invalida la copia appena salvata:
    // e' un avviso. Il sito giu' invece merita la mail di errore, perche' non e'
    // una cosa che si scopre volentieri con comodo.
    const esiti = await verifiche.controllaEndpoints();
    const SITO = ['Sito (home)', 'Area riservata (sito)'];
    for (const e of esiti) {
        log('  ' + e.nome + ': ' + (e.stato === null ? 'nessuna risposta' : 'HTTP ' + e.stato) +
            '  [' + (e.attivo ? 'attivo' : 'DA CONTROLLARE') + ']');
        if (e.attivo) continue;
        const testo = e.nome + ' non risponde come previsto' + (e.errore ? ' (' + e.errore + ')' : '');
        if (SITO.includes(e.nome)) guasto(testo); else avviso(testo);
    }
    log('  (Nota: 401/405 sugli endpoint API sono attesi: sono protetti / solo POST. Contano come attivi.)');

    await passo('lettura DNS', async () => {
        const d = await verifiche.leggiDns();
        fs.writeFileSync(path.join(uscita, 'dns.txt'), verifiche.formattaDns(d.righe));
        log('  record DNS salvati in dns.txt (' + d.quanti + ' record)');
        if (!d.quanti) guasto('nessun record DNS letto');
    });

    /* ---------- 5) Aggiornamenti e migliorie ---------- */
    log('--- 5) Aggiornamenti e migliorie (scansione automatica) ---');
    const sporco = comando('git', ['status', '--porcelain']);
    log('  Repo: ' + (sporco ? 'ci sono modifiche non salvate.' : 'working tree pulito.'));
    try {
        const trovati = comando('git', ['grep', '-I', '-c', '-E', 'TODO|FIXME', 'HEAD', '--', '*.js', '*.html', '*.css'], { stdio: ['ignore', 'pipe', 'ignore'] });
        const somma = trovati.split('\n').filter(Boolean).reduce((n, r) => n + Number(r.split(':').pop() || 0), 0);
        log('  TODO/FIXME nel codice: ' + somma);
    } catch (_) { log('  TODO/FIXME nel codice: 0'); }
    const pacchetto = JSON.parse(fs.readFileSync(path.join(radice, 'email-service', 'package.json'), 'utf8'));
    log('  Dipendenze email-service: ' + Object.entries(pacchetto.dependencies).map(([k, v]) => k + ' ' + v).join(', '));

    /* ---------- istruzioni di ripristino + strumento di import ---------- */
    fs.writeFileSync(path.join(uscita, 'RIPRISTINO.txt'), ripristino.genera({
        dataOra: stampaData,
        commit,
        progetto,
        quantiUtenti: quantiUtenti || 0,
        quantiVideo: inv ? inv.totaleFile : 28
    }));
    fs.copyFileSync(path.join(__dirname, 'import-firestore.cjs'), path.join(uscita, 'import-firestore.cjs'));
    log('  istruzioni di ripristino salvate in RIPRISTINO.txt');

    /* ---------- copia su Google Drive ---------- */
    log('--- 6) Copia su Google Drive ---');
    // Tenuti fuori dal passo: servono ancora dopo, per mandare su Drive anche
    // il report, che a questo punto non esiste ancora.
    let tokDrive = null;
    let idBackup = null;
    const idCartella = (process.env.GDRIVE_FOLDER_ID || '').trim();
    if (!idCartella) {
        log('  saltata: GDRIVE_FOLDER_ID non impostato (il backup resta come artifact di questa esecuzione)');
    } else {
        await passo('copia su Drive', async () => {
            // Si annuncia PRIMA di autenticarsi: se le credenziali non vanno,
            // il report dice comunque quale strada stava tentando e con quale
            // client, che e' meta' della diagnosi.
            const scelta = modoDrive(cred);
            log('  accesso a Drive: ' + scelta.descrizione);
            tokDrive = await tokenDrive(scelta, drive.AMBITI);
            idBackup = await drive.trovaOCreaCartella(tokDrive, etichetta, idCartella);
            let quanti = 0;
            for (const nome of fs.readdirSync(uscita)) {
                await drive.caricaFile(tokDrive, path.join(uscita, nome), idBackup, nome);
                quanti++;
            }
            log('  caricati ' + quanti + ' file in Backup-NGB/' + etichetta);

            if (inv) {
                const idMedia = await drive.trovaOCreaCartella(tokDrive, 'media', idCartella);
                const esito = await release.sincronizzaSuDrive(inv, tokGitHub, tokDrive, idMedia, log);
                log('  video: ' + esito.presenti + " gia' presenti, " + esito.copiati + ' copiati (' +
                    gb(esito.byteCopiati) + '), ' + esito.falliti + ' falliti, ' + esito.rimandati + ' rimandati alla prossima notte');
                // I video non copiati vengono ritentati la notte dopo: avviso, non errore.
                if (esito.falliti) avviso(esito.falliti + ' video non copiati (si ritenta la prossima notte)');
                if (esito.rimandati) avviso(esito.rimandati + ' video rimandati per non sforare il tetto di traffico');
            }
        });
    }

    /* ---------- esito ---------- */
    log('');
    if (problemi.length) {
        log('=== ESITO: BACKUP INCOMPLETO - ' + problemi.length + ' da sistemare ===');
        for (const p of problemi) log('  - ' + p);
    } else if (avvisi.length) {
        log('=== ESITO: OK con ' + avvisi.length + ' avvisi - la copia e\' completa ===');
    } else {
        log('=== ESITO: OK - backup e verifiche completati senza errori ===');
    }
    for (const a of avvisi) log('  avviso: ' + a);
    log('Cartella backup: ' + uscita);

    // Il report si scrive per ultimo, perche' deve contenere anche l'esito della
    // copia su Drive. Ma allora su Drive non c'era ancora: va mandato adesso,
    // altrimenti la cartella conservata resta senza la prova di com'e' andata,
    // che e' il file che serve di piu' quando si va a ripescarla.
    const percorsoReport = path.join(uscita, 'report.txt');
    fs.writeFileSync(percorsoReport, righe.join('\n') + '\n');
    if (tokDrive && idBackup) {
        try {
            await drive.caricaFile(tokDrive, percorsoReport, idBackup, 'report.txt');
        } catch (e) {
            console.error('report.txt non copiato su Drive: ' + (e && e.message ? e.message : e));
        }
    }

    if (process.env.GITHUB_OUTPUT) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, 'cartella=' + uscita + '\netichetta=' + etichetta + '\n');
    }
    if (problemi.length) process.exitCode = 1;
}

principale().catch(e => {
    console.error(e);
    righe.push(ora() + '  === ESITO: INTERROTTO - ' + (e && e.message ? e.message : e) + ' ===');
    process.exitCode = 1;
});
