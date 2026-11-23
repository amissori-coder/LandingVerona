/* ============================================================
   Esportazione dei dati Firestore
   ------------------------------------------------------------
   Salva TUTTI i documenti del database, a qualunque profondita' (collezioni
   e sottocollezioni), in un file solo: firestore-data.jsonl.gz, che
   import-firestore.cjs sa rimettere dentro.

   COME LEGGE. Una interrogazione per ogni collezione di primo livello che
   chiede "tutti i documenti che stanno sotto, a qualunque livello", a pagine.
   Costa UNA lettura per documento e niente altro.

   Prima si faceva diversamente: si leggeva una collezione e poi, per OGNI
   documento, si chiedeva a Firestore se avesse sottocollezioni. Una chiamata
   per documento, in fila: con 2.500 documenti erano sette minuti, e quando
   il database e' cresciuto il backup ha smesso di arrivare in fondo (veniva
   interrotto allo scadere delle due ore, e i dati non venivano salvati).

   COME SCRIVE. Una riga per documento (JSON Lines), compressa, scritta man
   mano che i documenti arrivano: il database non sta mai tutto in memoria, e
   non c'e' un limite alla sua grandezza. Con un unico grande JSON il limite
   c'era (mezzo gigabyte, il testo piu' lungo che Node sa tenere).

       riga 1      { formato, progetto, esportato }
       riga 2..N   { p: "collezione/documento/...", d: { campi } }
       ultima      { fine: true, documenti, collezioni }

   L'ultima riga serve a riconoscere un file troncato.

   Nota sulla struttura dell'Area riservata: incarichi, persone, fatture e
   registro NON sono collezioni separate. Stanno dentro la collezione
   "archivio", un documento ciascuno, con tutto il contenuto nel campo "json".
   Qui non serve saperlo (si esporta tutto alla cieca), ma serve a chi legge
   il file per ritrovare le cose.

   I tipi che JSON non conosce (date, byte, coordinate, riferimenti) vengono
   salvati con un contrassegno "__tipo__" e ricostruiti in fase di import.
   ============================================================ */

const fs = require('fs');
const zlib = require('zlib');
const readline = require('readline');
const { once } = require('events');

const FORMATO = 'ngb-firestore-export-v2';
const NOME_FILE = 'firestore-data.jsonl.gz';
/* Un documento Firestore arriva a 1 MB (i pezzi dei PDF delle
   circolarizzazioni ci vanno vicino): cento per pagina tengono ogni risposta
   ben sotto il testo piu' lungo che Node sa leggere. */
const PER_PAGINA = 100;
const AMBITI = ['https://www.googleapis.com/auth/datastore'];

function radiceDi(progetto) { return 'projects/' + progetto + '/databases/(default)/documents'; }
const pausa = ms => new Promise(r => setTimeout(r, ms));

/* --- da valore dell'API (con il tipo scritto accanto) a valore del backup --- */
function daRest(v, radice) {
    if (v === null || v === undefined) return null;
    if ('nullValue' in v) return null;
    if ('booleanValue' in v) return !!v.booleanValue;
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) {
        const n = Number(v.integerValue);
        // oltre i numeri che JavaScript tiene esatti si conserva il testo
        return Number.isSafeInteger(n) ? n : { __tipo__: 'intero-grande', valore: String(v.integerValue) };
    }
    if ('doubleValue' in v) {
        // NaN e Infinity non esistono in JSON: l'API li manda come testo, e cosi' si conservano
        return typeof v.doubleValue === 'number' ? v.doubleValue : { __tipo__: 'numero-speciale', valore: String(v.doubleValue) };
    }
    if ('timestampValue' in v) return { __tipo__: 'timestamp', valore: v.timestampValue };
    if ('bytesValue' in v) return { __tipo__: 'byte', valore: v.bytesValue };
    if ('referenceValue' in v) {
        const r = String(v.referenceValue);
        return { __tipo__: 'riferimento', percorso: radice && r.indexOf(radice + '/') === 0 ? r.slice(radice.length + 1) : r };
    }
    if ('geoPointValue' in v) {
        const g = v.geoPointValue || {};
        return { __tipo__: 'geopoint', latitudine: Number(g.latitude) || 0, longitudine: Number(g.longitude) || 0 };
    }
    if ('arrayValue' in v) return ((v.arrayValue || {}).values || []).map(x => daRest(x, radice));
    if ('mapValue' in v) return campi((v.mapValue || {}).fields, radice);
    return null;
}
function campi(fields, radice) {
    const out = {};
    for (const [k, x] of Object.entries(fields || {})) out[k] = daRest(x, radice);
    return out;
}

/* --- una chiamata all'API, con qualche ritentativo sui guasti passeggeri --- */
async function chiama(url, tok, corpo, cosa) {
    let ultimo = null;
    for (let tentativo = 1; tentativo <= 5; tentativo++) {
        let r;
        try {
            r = await fetch(url, {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
                body: JSON.stringify(corpo),
                signal: AbortSignal.timeout(180000)
            });
        } catch (e) {
            ultimo = new Error(cosa + ': ' + (e && e.message ? e.message : e));
            await pausa(1500 * tentativo);
            continue;
        }
        if (r.ok) return r.json();
        const testo = (await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 400);
        if (r.status === 429 || /RESOURCE_EXHAUSTED/.test(testo)) {
            // la quota del giorno non torna aspettando un minuto: si prova due volte e poi lo si dice chiaro
            ultimo = new Error(cosa + ': Firestore ha rifiutato per quota esaurita (HTTP ' + r.status + '). Se il progetto e\' sul piano gratuito, le letture di un giorno non bastano a salvare tutto il database: serve il piano a consumo. ' + testo);
            if (tentativo >= 2) throw ultimo;
            await pausa(20000);
            continue;
        }
        if (r.status >= 500 || r.status === 409) {
            ultimo = new Error(cosa + ': HTTP ' + r.status + ' ' + testo);
            await pausa(2000 * tentativo);
            continue;
        }
        throw new Error(cosa + ': HTTP ' + r.status + ' ' + testo);
    }
    throw ultimo || new Error(cosa + ': non riuscita');
}

/* Le collezioni di primo livello. */
async function elencaRadici(radice, tok) {
    const nomi = [];
    let segno = '';
    do {
        const r = await chiama(radice + ':listCollectionIds', tok, Object.assign({ pageSize: 300 }, segno ? { pageToken: segno } : {}), 'elenco delle collezioni');
        (r.collectionIds || []).forEach(n => nomi.push(n));
        segno = r.nextPageToken || '';
    } while (segno);
    return nomi;
}

/* Una pagina dei documenti che stanno sotto la collezione `nome`, a qualunque
   livello, in ordine di percorso. E' l'interrogazione "senza tipo" che usa
   anche lo strumento di Firebase per cancellare una collezione con tutto
   quello che contiene: nessun nome di collezione, tutti i discendenti, e il
   percorso compreso fra il primo e l'ultimo possibile sotto `nome`. */
async function leggiPagina(radice, tok, nome, dopo, quanti) {
    const nul = '\u0000';
    const q = {
        from: [{ allDescendants: true }],
        where: {
            compositeFilter: {
                op: 'AND', filters: [
                    { fieldFilter: { field: { fieldPath: '__name__' }, op: 'GREATER_THAN_OR_EQUAL', value: { referenceValue: radice + '/' + nome + '/' + nul } } },
                    { fieldFilter: { field: { fieldPath: '__name__' }, op: 'LESS_THAN', value: { referenceValue: radice + '/' + nome + nul + '/' + nul } } }
                ]
            }
        },
        orderBy: [{ field: { fieldPath: '__name__' } }],
        limit: quanti
    };
    if (dopo) q.startAt = { values: [{ referenceValue: dopo }], before: false };
    const r = await chiama(radice + ':runQuery', tok, { structuredQuery: q }, 'lettura di ' + nome);
    return (Array.isArray(r) ? r : []).map(x => x && x.document).filter(Boolean);
}

/* Esporta l'intero database in `destinazione` (firestore-data.jsonl.gz).
   `opz`: { token: () => Promise<token di accesso>, log: riga => void,
            perPagina }. Torna i conteggi. */
async function esportaSuFile(progetto, destinazione, opz) {
    opz = opz || {};
    const radice = radiceDi(progetto);
    const log = opz.log || (() => { });
    const perPagina = Number(opz.perPagina) || PER_PAGINA;
    let tok = await opz.token(), tokQuando = Date.now();

    const gz = zlib.createGzip({ level: 6 });
    const file = fs.createWriteStream(destinazione);
    let guastoFile = null;
    file.on('error', e => { guastoFile = e; });
    gz.on('error', e => { guastoFile = e; });
    gz.pipe(file);
    const scrivi = async riga => {
        if (guastoFile) throw guastoFile;
        if (!gz.write(riga + '\n')) await once(gz, 'drain');
    };

    const conteggi = { collezioni: 0, documenti: 0, byte: 0, perRadice: {} };
    const viste = new Set();      // ogni collezione incontrata, sottocollezioni comprese
    await scrivi(JSON.stringify({ formato: FORMATO, progetto: progetto, esportato: new Date().toISOString() }));

    const radici = (await elencaRadici(radice, tok)).sort();
    for (const nome of radici) {
        const inizio = Date.now();
        let quanti = 0, byte = 0, dopo = '';
        for (;;) {
            // il token dura un'ora: su un database grande lo si rinnova strada facendo
            if (Date.now() - tokQuando > 20 * 60 * 1000) { tok = await opz.token(); tokQuando = Date.now(); }
            const pagina = await leggiPagina(radice, tok, nome, dopo, perPagina);
            for (const d of pagina) {
                const percorso = String(d.name).slice(radice.length + 1);
                const riga = JSON.stringify({ p: percorso, d: campi(d.fields, radice) });
                await scrivi(riga);
                quanti++; byte += riga.length;
                viste.add(percorso.slice(0, percorso.lastIndexOf('/')));
            }
            if (pagina.length < perPagina) break;
            dopo = pagina[pagina.length - 1].name;
        }
        viste.add(nome);
        conteggi.documenti += quanti;
        conteggi.byte += byte;
        conteggi.perRadice[nome] = quanti;
        log(nome + ': ' + quanti + ' documenti, ' + (byte / 1048576).toFixed(1) + ' MB, ' + Math.round((Date.now() - inizio) / 1000) + ' s');
    }
    conteggi.collezioni = viste.size;
    await scrivi(JSON.stringify({ fine: true, documenti: conteggi.documenti, collezioni: conteggi.collezioni }));
    gz.end();
    await once(file, 'finish');
    if (guastoFile) throw guastoFile;
    return conteggi;
}

/* Rilegge il file dall'inizio alla fine, riga per riga: ogni riga deve essere
   JSON valido, l'intestazione e la chiusura devono esserci, e i documenti
   devono essere tanti quanti ne dichiara la chiusura. Torna quanti sono. */
async function verificaFile(destinazione) {
    const righe = readline.createInterface({ input: fs.createReadStream(destinazione).pipe(zlib.createGunzip()), crlfDelay: Infinity });
    let testa = null, coda = null, n = 0;
    for await (const riga of righe) {
        if (!riga) continue;
        const o = JSON.parse(riga);
        if (!testa) { testa = o; continue; }
        if (o.fine) { coda = o; continue; }
        if (coda) throw new Error('righe dopo la chiusura');
        if (typeof o.p !== 'string' || !o.p || typeof o.d !== 'object' || o.d === null) throw new Error('riga ' + (n + 2) + ' senza percorso o senza dati');
        n++;
    }
    if (!testa || testa.formato !== FORMATO) throw new Error('intestazione mancante o di un altro formato');
    if (!coda) throw new Error('file troncato: manca la riga di chiusura');
    if (coda.documenti !== n) throw new Error('la chiusura dichiara ' + coda.documenti + ' documenti, nel file ce ne sono ' + n);
    return n;
}

module.exports = { FORMATO, NOME_FILE, AMBITI, PER_PAGINA, esportaSuFile, verificaFile, daRest, campi, _interni: { radiceDi, leggiPagina, elencaRadici, chiama } };
