#!/usr/bin/env node
/* ============================================================
   PROVA DI RIPRISTINO
   ------------------------------------------------------------
   Un backup che non e' mai stato ripristinato e' una speranza, non un backup.
   Questo strumento prende l'ultimo backup da Drive e lo ripristina DAVVERO,
   ma in un progetto Firebase di appoggio, vuoto, che non c'entra niente con
   quello vero:

     1. scarica da Backup-NGB l'ultimo firestore-data.jsonl.gz e lo controlla;
     2. controlla che il progetto di appoggio sia vuoto;
     3. ci ripristina i dati con import-firestore.cjs, lo stesso strumento che
        si userebbe il giorno del guaio;
     4. rilegge tutto quello che ha scritto;
     5. lo confronta con il backup, documento per documento, campo per campo;
     6. ripulisce il progetto di appoggio.

   Uso (di norma lo lancia il lavoro .github/workflows/prova-ripristino.yml):

       node prova-ripristino.cjs [firestore-data.jsonl.gz] [--per-collezione 200 | --tutto] [--lascia]

   Senza il file, lo prende da Drive (servono le variabili GDRIVE_...).
   Di base ripristina un CAMPIONE: i primi 200 documenti di ogni collezione di
   primo livello, sottocollezioni comprese. Sta nel piano gratuito di Firebase.
   Con --tutto ripristina l'intero backup: serve il piano a consumo sul
   progetto di appoggio (sono centinaia di migliaia di scritture).
   Con --lascia non ripulisce, per andare a guardare i dati ripristinati.

   Variabili d'ambiente:
     FIREBASE_SERVICE_ACCOUNT_APPOGGIO  chiave del progetto di APPOGGIO
     GDRIVE_FOLDER_ID, GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET,
     GDRIVE_REFRESH_TOKEN (o GDRIVE_SERVICE_ACCOUNT)   per leggere il backup
     PROVA_REPORT                       dove scrivere il report (facoltativa)

   NON PUO' TOCCARE IL PROGETTO VERO, per costruzione:
     - non riceve mai la chiave del progetto vero, solo quella di appoggio;
     - si rifiuta se la chiave di appoggio e' del progetto vero, o dello
       stesso progetto da cui viene il backup;
     - scrive e cancella solo in un progetto trovato VUOTO, oppure che porta
       il contrassegno lasciato da una sua prova precedente; il progetto vero
       non e' vuoto e quel contrassegno non ce l'ha.

   QUESTO REPOSITORY E' PUBBLICO, e lo sono anche i registri delle esecuzioni.
   Per questo qui non si stampa MAI il contenuto di un documento ne' il suo
   percorso (dentro ci sono indirizzi email): solo nomi di collezione, conteggi
   e impronte.
   ============================================================ */

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const readline = require('readline');
const crypto = require('crypto');
const { once } = require('events');
const { spawn } = require('child_process');
const FS = require('./lib/firestore.cjs');

const PRODUZIONE = ['revilaw-incarichi'];      // il progetto vero: mai come destinazione
const SEGNO = '_provaRipristino';              // la collezione del contrassegno
const SEGNO_DOC = SEGNO + '/stato';
const STRUMENTO = 'prova-ripristino';
const PER_COLLEZIONE = 200;
const GRUPPO = 300;                            // documenti cancellati per chiamata

const radiceDiPercorso = p => p.slice(0, p.indexOf('/'));

/* I registri delle esecuzioni sono pubblici. Un messaggio d'errore di Firestore
   o dello strumento di ripristino puo' citare il percorso di un documento, e
   nei percorsi ci sono indirizzi email: prima di stampare qualunque riga si
   tolgono gli indirizzi e tutto quello che segue il nome della collezione. */
function pulisci(testo) {
    return String(testo)
        .replace(/(\/documents\/[^\/\s"']+)\/[^\s"']+/g, '$1/[...]')
        .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+/g, '[indirizzo]');
}
const corta = testo => crypto.createHash('sha1').update(testo).digest('hex').slice(0, 10);

/* ---------- il file del backup, una riga per volta ---------- */
async function* documenti(file, intestazione) {
    const righe = readline.createInterface({ input: fs.createReadStream(file).pipe(zlib.createGunzip()), crlfDelay: Infinity });
    let prima = true, chiusa = null, n = 0;
    for await (const riga of righe) {
        if (!riga) continue;
        const o = JSON.parse(riga);
        if (prima) {
            prima = false;
            if (o.formato !== FS.FORMATO) throw new Error('il file non e\' un backup dei dati in formato ' + FS.FORMATO + ' (quelli fino al 9 settembre 2026 erano in un altro formato)');
            if (intestazione) Object.assign(intestazione, o);
            continue;
        }
        if (o.fine) { chiusa = o; continue; }
        if (chiusa) throw new Error('il file ha righe dopo la chiusura');
        n++;
        yield { p: o.p, d: o.d || {}, riga };
    }
    if (prima) throw new Error('il file e\' vuoto');
    if (!chiusa) throw new Error('il file e\' troncato: manca la riga di chiusura');
    if (chiusa.documenti !== n) throw new Error('il file dichiara ' + chiusa.documenti + ' documenti ma ne contiene ' + n);
}

/* Legge tutto il backup (cosi' lo controlla da cima a fondo) e, se serve un
   campione, lo scrive in `destinazione` nello stesso formato: i primi
   `perCollezione` documenti di ogni collezione di primo livello, nell'ordine
   del file, sottocollezioni comprese. Torna i conteggi. */
async function preparaAtteso(file, destinazione, perCollezione) {
    const intestazione = {};
    const nelBackup = {}, scelti = {};
    let totale = 0, presi = 0;
    let gz = null, uscita = null, guasto = null;
    const scrivi = async riga => { if (guasto) throw guasto; if (!gz.write(riga + '\n')) await once(gz, 'drain'); };
    const collezioni = new Set();
    for await (const v of documenti(file, intestazione)) {
        if (!gz && perCollezione) {
            gz = zlib.createGzip({ level: 6 });
            uscita = fs.createWriteStream(destinazione);
            gz.on('error', e => { guasto = e; }); uscita.on('error', e => { guasto = e; });
            gz.pipe(uscita);
            await scrivi(JSON.stringify({ formato: intestazione.formato, progetto: intestazione.progetto, esportato: intestazione.esportato }));
        }
        const r = radiceDiPercorso(v.p);
        nelBackup[r] = (nelBackup[r] || 0) + 1;
        totale++;
        if (perCollezione && (scelti[r] || 0) >= perCollezione) continue;
        scelti[r] = (scelti[r] || 0) + 1;
        presi++;
        if (perCollezione) { collezioni.add(v.p.slice(0, v.p.lastIndexOf('/'))); await scrivi(v.riga); }
    }
    if (gz) {
        await scrivi(JSON.stringify({ fine: true, documenti: presi, collezioni: collezioni.size }));
        gz.end();
        await once(uscita, 'finish');
        if (guasto) throw guasto;
    }
    return { intestazione, nelBackup, scelti, totale, presi, file: perCollezione && gz ? destinazione : file };
}

/* ---------- il confronto ---------- */
/* Due documenti sono uguali se hanno gli stessi campi con gli stessi valori,
   a prescindere dall'ordine dei campi. Le date si confrontano come istanti
   (secondi e miliardesimi), non come testo. */
function istante(t) {
    const m = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,9}))?(Z|[+-]\d\d:\d\d)$/.exec(String(t));
    const secondi = m ? Date.parse(m[1] + m[3]) / 1000 : NaN;
    return Number.isFinite(secondi) ? secondi + '.' + (m[2] || '').padEnd(9, '0') : String(t);
}
function canonico(v) {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(canonico);
    if (v.__tipo__ === 'timestamp') return { __tipo__: 'timestamp', valore: istante(v.valore) };
    const o = {};
    for (const k of Object.keys(v).sort()) o[k] = canonico(v[k]);
    return o;
}
const impronta = d => crypto.createHash('sha1').update(JSON.stringify(canonico(d))).digest('base64');
/* di che tipo e' un valore, senza dirne il contenuto */
function tipo(v) {
    if (v === undefined) return 'assente';
    if (v === null) return 'vuoto';
    if (Array.isArray(v)) return 'lista di ' + v.length;
    if (typeof v === 'object') return v.__tipo__ ? (v.__tipo__ === 'byte' ? 'byte (' + String(v.valore || '').length + ')' : v.__tipo__) : 'mappa di ' + Object.keys(v).length;
    if (typeof v === 'string') return 'testo di ' + v.length;
    return typeof v === 'number' ? 'numero' : typeof v === 'boolean' ? 'vero/falso' : typeof v;
}
/* il nome di un campo si stampa solo se ha l'aspetto di un nome di campo
   (dentro una mappa le chiavi possono essere indirizzi email o codici) */
const nomeCampo = k => (/^[A-Za-z_][A-Za-z0-9_]{0,39}$/.test(k) ? k : 'campo#' + corta(k));
function differenze(a, b) {
    const out = [];
    for (const k of Array.from(new Set(Object.keys(a).concat(Object.keys(b)))).sort()) {
        if (JSON.stringify(canonico(a[k])) !== JSON.stringify(canonico(b[k]))) out.push(nomeCampo(k) + ': ' + tipo(a[k]) + ' -> ' + tipo(b[k]));
    }
    return out.slice(0, 6);
}

async function confronta(fileAtteso, fileRiletto) {
    const trovati = new Map();       // percorso -> impronta, di quello che c'e' nel progetto di appoggio
    for await (const v of documenti(fileRiletto)) {
        if (radiceDiPercorso(v.p) === SEGNO) continue;
        trovati.set(v.p, impronta(v.d));
    }
    const riletti = trovati.size;
    const perRadice = {};
    const conta = (r, voce) => { (perRadice[r] = perRadice[r] || { uguali: 0, diversi: 0, mancanti: 0, inPiu: 0 })[voce]++; };
    const esito = { attesi: 0, riletti, uguali: 0, diversi: 0, mancanti: 0, inPiu: 0, perRadice, esempi: [] };
    const daSpiegare = new Map();    // i primi documenti diversi: percorso -> dati del backup
    for await (const v of documenti(fileAtteso)) {
        const r = radiceDiPercorso(v.p);
        esito.attesi++;
        const h = trovati.get(v.p);
        if (h === undefined) {
            esito.mancanti++; conta(r, 'mancanti');
            if (esito.esempi.length < 20) esito.esempi.push(r + ' #' + corta(v.p) + ': nel backup c\'e\', nel progetto di appoggio no');
            continue;
        }
        trovati.delete(v.p);
        if (h === impronta(v.d)) { esito.uguali++; conta(r, 'uguali'); continue; }
        esito.diversi++; conta(r, 'diversi');
        if (daSpiegare.size < 20) daSpiegare.set(v.p, v.d);
    }
    for (const p of trovati.keys()) {
        const r = radiceDiPercorso(p);
        esito.inPiu++; conta(r, 'inPiu');
        if (esito.esempi.length < 20) esito.esempi.push(r + ' #' + corta(p) + ': nel progetto di appoggio c\'e\', nel backup no');
    }
    if (daSpiegare.size) {
        for await (const v of documenti(fileRiletto)) {
            if (!daSpiegare.has(v.p)) continue;
            esito.esempi.push(radiceDiPercorso(v.p) + ' #' + corta(v.p) + ': diverso in ' + (differenze(daSpiegare.get(v.p), v.d).join('; ') || '(nessun campo: differenza non spiegata)'));
        }
    }
    esito.identico = esito.attesi > 0 && esito.uguali === esito.attesi && !esito.diversi && !esito.mancanti && !esito.inPiu;
    return esito;
}

/* ---------- il progetto di appoggio ---------- */
/* il token dura un'ora: su una prova lunga lo si rinnova strada facendo */
function gettoni(prendi) {
    let tok = null, quando = 0;
    return async () => {
        if (!tok || Date.now() - quando > 20 * 60 * 1000) { tok = await prendi(); quando = Date.now(); }
        return tok;
    };
}

/* Cancella tutto quello che c'e' nel progetto di appoggio. Il contrassegno
   per ultimo: se la pulizia si interrompe a meta', resta li' a dire che quei
   dati sono i resti di una prova, e la prova dopo li puo' togliere. */
async function svuota(radice, gettone, protetto) {
    protetto(radice);
    let cancellati = 0;
    const radici = (await FS.elencaRadici(radice, await gettone())).sort((a, b) => (a === SEGNO) - (b === SEGNO) || (a < b ? -1 : a > b ? 1 : 0));
    for (const nome of radici) {
        let ultimo = '';
        for (;;) {
            const pagina = await FS.leggiPagina(radice, await gettone(), nome, '', GRUPPO, true);
            if (!pagina.length) break;
            if (pagina[0].name === ultimo) throw new Error('la pulizia di ' + nome + ' non avanza: i documenti cancellati ci sono ancora');
            ultimo = pagina[0].name;
            protetto(radice);
            await FS.scriviGruppo(radice, await gettone(), pagina.map(d => ({ delete: d.name })));
            cancellati += pagina.length;
        }
    }
    return cancellati;
}

/* Lancia import-firestore.cjs, lo stesso strumento del giorno del guaio. */
function importa(fileChiave, fileDati, ambiente, log) {
    return new Promise((fatto, fallito) => {
        const figlio = spawn(process.execPath, [path.join(__dirname, 'import-firestore.cjs'), fileChiave, fileDati, '--conferma'], { env: Object.assign({}, process.env, ambiente || {}), stdio: ['ignore', 'pipe', 'pipe'] });
        let ultimaRiga = '';
        const ascolta = flusso => readline.createInterface({ input: flusso }).on('line', riga => {
            ultimaRiga = riga || ultimaRiga;
            // l'avanzamento ("scritti 300/9000") riempirebbe il registro: se ne tiene una riga ogni tanto
            const m = /^\s*scritti (\d+)\/(\d+)$/.exec(riga);
            if (m && Number(m[1]) !== Number(m[2]) && Math.floor(Number(m[1]) / 15000) === Math.floor((Number(m[1]) - GRUPPO) / 15000)) return;
            if (riga.trim()) log('    ' + riga);
        });
        ascolta(figlio.stdout); ascolta(figlio.stderr);
        figlio.on('error', fallito);
        figlio.on('close', codice => (codice === 0 ? fatto() : fallito(new Error('lo strumento di ripristino si e\' fermato (codice ' + codice + '): ' + ultimaRiga.trim().slice(0, 300)))));
    });
}

/* ---------- la prova ---------- */
/* opz: { file, cred, token, cartella, perCollezione (0 = tutto), lascia,
          vietati, ambiente, log }. Torna l'esito; non lancia eccezioni per
   una prova fallita (esito.ok = false, esito.errore). */
async function prova(opz) {
    const stampa = opz.log || (t => console.log(t));
    const log = t => stampa(pulisci(t));
    const cred = opz.cred || {};
    const progetto = String(cred.project_id || '');
    const radice = FS.radiceDi(progetto);
    const gettone = gettoni(opz.token);
    const perCollezione = opz.perCollezione === 0 ? 0 : (Number(opz.perCollezione) || PER_COLLEZIONE);
    const esito = { ok: false, progetto, scritto: false, pulito: false, residui: 0, errore: '' };
    const vietati = new Set(PRODUZIONE.concat(opz.vietati || []).filter(Boolean));
    const protetto = r => { for (const v of vietati) if (r === FS.radiceDi(v)) throw new Error('RIFIUTO: «' + v + '» non e\' un progetto di appoggio. Non scrivo e non cancello niente.'); };
    let segnato = false, fileChiave = '';

    try {
        if (!progetto) throw new Error('la chiave del progetto di appoggio non ha il campo project_id');
        protetto(radice);      // prima di tutto, e prima di qualunque chiamata

        log('--- 1) Il backup ---');
        const atteso = await preparaAtteso(opz.file, path.join(opz.cartella, 'atteso.jsonl.gz'), perCollezione);
        esito.origine = atteso.intestazione.progetto || '';
        esito.esportato = atteso.intestazione.esportato || '';
        esito.nelBackup = atteso.totale;
        esito.daRipristinare = atteso.presi;
        log('  progetto di origine: ' + (esito.origine || '?') + ', esportato il ' + (esito.esportato || '?'));
        log('  il file e\' integro: ' + atteso.totale + ' documenti in ' + Object.keys(atteso.nelBackup).length + ' collezioni di primo livello');
        log(perCollezione
            ? '  si ripristina un CAMPIONE: i primi ' + perCollezione + ' documenti di ogni collezione, ' + atteso.presi + ' in tutto'
            : '  si ripristina TUTTO: ' + atteso.presi + ' documenti');
        if (!atteso.presi) throw new Error('il backup non contiene documenti: non c\'e\' niente da provare');
        // lo stesso progetto da cui viene il backup non puo' essere quello di appoggio
        vietati.add(esito.origine);
        protetto(radice);

        log('--- 2) Il progetto di appoggio: ' + progetto + ' ---');
        let presenti;
        try { presenti = await FS.elencaRadici(radice, await gettone()); } catch (e) {
            const t = String(e && e.message || e);
            if (/HTTP 404/.test(t)) throw new Error('nel progetto di appoggio non c\'e\' ancora il database: va creato da Firebase > Firestore Database > Crea database. ' + t.slice(0, 200));
            if (/HTTP 403/.test(t)) throw new Error('la chiave non ha accesso al database del progetto di appoggio. ' + t.slice(0, 200));
            throw e;
        }
        if (presenti.length) {
            const segni = presenti.includes(SEGNO) ? await FS.leggiPagina(radice, await gettone(), SEGNO, '', 5) : [];
            const nostro = segni.some(d => d.name === radice + '/' + SEGNO_DOC && d.fields && d.fields.strumento && d.fields.strumento.stringValue === STRUMENTO);
            if (!nostro) throw new Error('RIFIUTO: il progetto «' + progetto + '» non e\' vuoto (' + presenti.length + ' collezioni) e non porta il contrassegno di una prova precedente. Non e\' un progetto di appoggio: non scrivo e non cancello niente.');
            log('  ci sono i resti di una prova precedente: li tolgo');
            segnato = true;
            const tolti = await svuota(radice, gettone, protetto);
            segnato = false;
            log('  tolti ' + tolti + ' documenti');
        } else {
            log('  e\' vuoto: si puo\' usare');
        }
        protetto(radice);
        await FS.scriviGruppo(radice, await gettone(), [{
            update: {
                name: radice + '/' + SEGNO_DOC,
                fields: { strumento: { stringValue: STRUMENTO }, iniziata: { timestampValue: new Date().toISOString() }, origine: { stringValue: esito.origine } }
            }
        }]);
        segnato = true;

        log('--- 3) Ripristino ---');
        fileChiave = path.join(opz.cartella, 'chiave-appoggio.json');
        fs.writeFileSync(fileChiave, JSON.stringify(cred), { mode: 0o600 });
        const inizio = Date.now();
        esito.scritto = true;
        await importa(fileChiave, atteso.file, opz.ambiente, log);
        log('  ripristinati in ' + Math.round((Date.now() - inizio) / 1000) + ' secondi');

        log('--- 4) Rilettura del progetto di appoggio ---');
        const fileRiletto = path.join(opz.cartella, 'riletto.jsonl.gz');
        const r = await FS.esportaSuFile(progetto, fileRiletto, { token: gettone });
        log('  riletti ' + (r.documenti - (r.perRadice[SEGNO] || 0)) + ' documenti');

        log('--- 5) Confronto con il backup ---');
        const c = await confronta(atteso.file, fileRiletto);
        Object.assign(esito, { attesi: c.attesi, riletti: c.riletti, uguali: c.uguali, diversi: c.diversi, mancanti: c.mancanti, inPiu: c.inPiu, perRadice: c.perRadice, esempi: c.esempi, identico: c.identico });
        const largo = Math.max(12, ...Object.keys(c.perRadice).map(n => n.length)) + 2;
        log('  ' + 'collezione'.padEnd(largo) + 'nel backup'.padStart(11) + 'ripristinati'.padStart(14) + 'identici'.padStart(10));
        for (const nome of Object.keys(atteso.nelBackup).sort()) {
            const v = c.perRadice[nome] || { uguali: 0, diversi: 0, mancanti: 0, inPiu: 0 };
            const guai = v.diversi + v.mancanti + v.inPiu;
            log('  ' + nome.padEnd(largo) + String(atteso.nelBackup[nome]).padStart(11) + String(atteso.scelti[nome] || 0).padStart(14) + String(v.uguali).padStart(10) + (guai ? '   <-- ' + v.diversi + ' diversi, ' + v.mancanti + ' mancanti, ' + v.inPiu + ' in piu\'' : ''));
        }
        for (const nome of Object.keys(c.perRadice).filter(n => !(n in atteso.nelBackup))) log('  ' + nome.padEnd(largo) + '0'.padStart(11) + '0'.padStart(14) + '0'.padStart(10) + '   <-- ' + c.perRadice[nome].inPiu + ' documenti che nel backup non ci sono');
        log('  identici: ' + c.uguali + ' su ' + c.attesi + (c.diversi ? ', DIVERSI: ' + c.diversi : '') + (c.mancanti ? ', MANCANTI: ' + c.mancanti : '') + (c.inPiu ? ', IN PIU\': ' + c.inPiu : ''));
        for (const e of c.esempi) log('    ' + e);
        if (!c.identico) throw new Error('i dati ripristinati NON sono identici al backup');
        esito.ok = true;
    } catch (e) {
        esito.errore = pulisci(e && e.message ? e.message : e);
        log('  ERRORE: ' + esito.errore);
    } finally {
        if (fileChiave) { try { fs.rmSync(fileChiave, { force: true }); } catch (_) { /* cartella temporanea */ } }
    }

    /* la pulizia: sempre, anche quando la prova e' fallita (purche' il
       progetto sia nostro: lo dice il contrassegno) */
    if (segnato && opz.lascia) {
        log('--- 6) Pulizia: saltata su richiesta (--lascia). I dati restano nel progetto di appoggio; li toglie la prossima prova ---');
    } else if (segnato) {
        log('--- 6) Pulizia del progetto di appoggio ---');
        try {
            const tolti = await svuota(radice, gettone, protetto);
            const rimaste = await FS.elencaRadici(radice, await gettone());
            esito.residui = rimaste.length;
            esito.pulito = rimaste.length === 0;
            log('  cancellati ' + tolti + ' documenti: ' + (esito.pulito ? 'il progetto di appoggio e\' di nuovo vuoto' : 'restano ' + rimaste.length + ' collezioni'));
            if (!esito.pulito) { esito.ok = false; esito.errore = esito.errore || 'la pulizia non ha svuotato il progetto di appoggio'; }
        } catch (e) {
            esito.ok = false;
            esito.errore = esito.errore || pulisci('pulizia non riuscita: ' + (e && e.message ? e.message : e));
            log('  ERRORE nella pulizia: ' + (e && e.message ? e.message : e));
        }
    }

    log('');
    log(esito.ok
        ? '=== ESITO: OK - ' + esito.uguali + ' documenti ripristinati e riletti, identici al backup' + (perCollezione ? ' (campione di ' + esito.daRipristinare + ' su ' + esito.nelBackup + ')' : ' (tutto il backup)') + ' ==='
        : '=== ESITO: PROVA FALLITA - ' + esito.errore + ' ===');
    return esito;
}

/* ---------- l'ultimo backup che sta su Drive ---------- */
async function ultimoBackupSuDrive(drive, tok, idCartella, destinazione) {
    const cartelle = (await drive.elenca(tok, idCartella))
        .filter(f => f.mimeType === 'application/vnd.google-apps.folder' && /^\d{4}-\d{2}-\d{2}_\d{4}$/.test(f.name))
        .sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
    for (const c of cartelle.slice(0, 10)) {
        const dati = (await drive.elenca(tok, c.id)).find(f => f.name === FS.NOME_FILE);
        if (!dati) continue;
        const byte = await drive.scaricaFile(tok, dati.id, destinazione);
        return { etichetta: c.name, byte };
    }
    throw new Error('nelle ultime ' + Math.min(10, cartelle.length) + ' cartelle di Backup-NGB non c\'e\' nessun ' + FS.NOME_FILE);
}

/* ---------- da riga di comando ---------- */
async function principale() {
    const { leggiServiceAccount, token, modoDrive, tokenDrive } = require('./lib/credenziali.cjs');
    const argomenti = process.argv.slice(2);
    const opzione = nome => { const i = argomenti.indexOf(nome); return i >= 0 ? argomenti[i + 1] : undefined; };
    const tutto = argomenti.includes('--tutto');
    const lascia = argomenti.includes('--lascia');
    const quanti = Number(opzione('--per-collezione')) || PER_COLLEZIONE;
    let file = argomenti.find((a, i) => !a.startsWith('--') && argomenti[i - 1] !== '--per-collezione');

    const righe = [];
    const ora = () => new Date().toLocaleTimeString('it-IT', { timeZone: 'Europe/Rome', hour12: false });
    const log = t => { const riga = t ? ora() + '  ' + t : ''; righe.push(riga); console.log(riga); };
    const cartella = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'prova-ripristino-'));
    let esito = { ok: false, errore: '' };
    try {
        log('=== PROVA DI RIPRISTINO ===');
        const cred = leggiServiceAccount('FIREBASE_SERVICE_ACCOUNT_APPOGGIO', false);
        if (!cred) throw new Error('manca FIREBASE_SERVICE_ACCOUNT_APPOGGIO: la chiave del progetto Firebase di appoggio (vedi scripts/backup/README.md)');
        // se per sbaglio qualcuno passasse anche la chiave del progetto vero, il suo progetto e' vietato
        const vero = leggiServiceAccount('FIREBASE_SERVICE_ACCOUNT', false);
        if (!file) {
            log('--- 0) L\'ultimo backup, da Drive ---');
            const idCartella = (process.env.GDRIVE_FOLDER_ID || '').trim();
            if (!idCartella) throw new Error('manca GDRIVE_FOLDER_ID: non so dove prendere il backup');
            const drive = require('./lib/drive.cjs');
            const scelta = modoDrive(null);
            if (scelta.tipo === 'servizio' && !scelta.cred) throw new Error('mancano le credenziali per leggere Drive (GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, GDRIVE_REFRESH_TOKEN)');
            const tokDrive = await tokenDrive(scelta, drive.AMBITI);
            file = path.join(cartella, FS.NOME_FILE);
            const b = await ultimoBackupSuDrive(drive, tokDrive, idCartella, file);
            log('  Backup-NGB/' + b.etichetta + '/' + FS.NOME_FILE + ' (' + (b.byte / 1048576).toFixed(1) + ' MB)');
        } else if (!fs.existsSync(file)) {
            throw new Error('file non trovato: ' + file);
        }
        esito = await prova({ file, cred, cartella, lascia, perCollezione: tutto ? 0 : quanti, vietati: vero ? [vero.project_id] : [], token: () => token(cred, FS.AMBITI), log });
    } catch (e) {
        esito.errore = pulisci(e && e.message ? e.message : e);
        log('=== ESITO: PROVA NON ESEGUITA - ' + esito.errore + ' ===');
    } finally {
        try { fs.rmSync(cartella, { recursive: true, force: true }); } catch (_) { /* cartella temporanea */ }
        if (process.env.PROVA_REPORT) { try { fs.writeFileSync(process.env.PROVA_REPORT, righe.join('\n') + '\n'); } catch (_) { /* resta il registro */ } }
    }
    process.exitCode = esito.ok ? 0 : 1;
}

if (require.main === module) principale();

module.exports = { prova, confronta, preparaAtteso, ultimoBackupSuDrive, svuota, PRODUZIONE, SEGNO, SEGNO_DOC, PER_COLLEZIONE, _interni: { canonico, istante, impronta, differenze, tipo, pulisci } };
