/* ============================================================
   Prove dell'esportazione e del ripristino di Firestore
   ------------------------------------------------------------
       node scripts/backup/prove/firestore.prove.cjs

   Non tocca la rete e non serve nessuna chiave: l'API di Firestore e' finta
   (risponde come quella vera a "elenca le collezioni" e a "tutti i documenti
   sotto questa collezione, a pagine"), e lo strumento di ripristino gira con
   un firebase-admin finto che annota quello che scriverebbe.
   ============================================================ */
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');
const FS = require('../lib/firestore.cjs');

let passate = 0, fallite = 0;
function verifica(cosa, condizione, dettaglio) {
    if (condizione) { passate++; return; }
    fallite++;
    console.error('  NO  ' + cosa + (dettaglio !== undefined ? '\n        ' + JSON.stringify(dettaglio).slice(0, 600) : ''));
}

const PROGETTO = 'progetto-di-prova';
const RADICE = 'projects/' + PROGETTO + '/databases/(default)/documents';
const SERVIZIO = 'https://firestore.googleapis.com/v1/';
const cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'ngb-backup-prova-'));

/* ---------- il database finto: percorso -> campi nel formato dell'API ---------- */
const banca = new Map();
const metti = (percorso, fields) => banca.set(percorso, fields);
const s = v => ({ stringValue: v });
metti('archivio/incarichi', { json: s('[{"id":"inc-1","cliente":"ALFA"}]'), aggiornato: { timestampValue: '2026-11-23T10:15:30.123456Z' } });
metti('archivio/persone', { json: s('[]') });
metti('utenti/a@b.it', {
    nome: s('Anna'), attivo: { booleanValue: true }, accessi: { integerValue: '42' }, enorme: { integerValue: '9007199254740993' },
    media: { doubleValue: 1.5 }, nonNumero: { doubleValue: 'NaN' }, infinito: { doubleValue: '-Infinity' }, vuoto: { nullValue: null },
    dove: { geoPointValue: { latitude: 45.46, longitude: 9.19 } }, rif: { referenceValue: RADICE + '/archivio/persone' },
    lista: { arrayValue: { values: [s('x'), { integerValue: '2' }, { mapValue: { fields: { k: s('v') } } }] } }, listaVuota: { arrayValue: {} },
    scheda: { mapValue: { fields: { ruolo: s('admin'), dentro: { mapValue: { fields: { n: { integerValue: '7' } } } } } } }, mappaVuota: { mapValue: {} }
});
// una lettera delle circolarizzazioni con il PDF a pezzi in una sottocollezione, e una sotto-sottocollezione
const PEZZO = Buffer.alloc(600 * 1024, 7);
metti('circInvii/L1', { destinatario: s('Banca'), codice: s('RVL-AAAAAA') });
for (let n = 0; n < 8; n++) metti('circInvii/L1/allegato/000' + n, { dati: { bytesValue: PEZZO.toString('base64') } });
metti('circInvii/L1/allegato/0000/note/a', { testo: s('tre livelli sotto') });
// un documento che esiste solo come "genitore" di una sottocollezione (non e' mai stato scritto): i figli vanno salvati lo stesso
metti('circInvii/FANTASMA/allegato/0000', { dati: { bytesValue: Buffer.from('orfano').toString('base64') } });
// abbastanza documenti da fare piu' pagine, e un numero che cade giusto sul confine di pagina
for (let i = 0; i < 23; i++) metti('iscrizioni/i' + String(i).padStart(3, '0'), { n: { integerValue: String(i) }, email: s('p' + i + '@x.it') });
for (let i = 0; i < 14; i++) metti('registro/r' + String(i).padStart(2, '0'), { n: { integerValue: String(i) } });
// un nome che comincia come un altro: i documenti di "archivio2" non devono finire dentro "archivio"
metti('archivio2/x', { v: s('altra collezione') });

/* ---------- l'API finta ---------- */
const chiamate = { elenco: 0, pagine: 0, perCollezione: {} };
let guasta = null;       // funzione (url, corpo) -> risposta finta, per simulare gli errori
function risposta(stato, corpo) { return { ok: stato >= 200 && stato < 300, status: stato, json: async () => corpo, text: async () => (typeof corpo === 'string' ? corpo : JSON.stringify(corpo)) }; }
global.fetch = async (url, opz) => {
    const corpo = JSON.parse(opz.body);
    if (opz.headers.Authorization !== 'Bearer gettone-finto') return risposta(401, { error: { status: 'UNAUTHENTICATED' } });
    if (guasta) { const r = guasta(url, corpo); if (r) return r; }
    // l'indirizzo deve essere quello vero del servizio, per intero: una volta e' mancato, e la prova non se n'era accorta
    try { new URL(url); } catch (_) { throw new TypeError('Failed to parse URL from ' + url); }
    if (url === SERVIZIO + RADICE + ':listCollectionIds') {
        chiamate.elenco++;
        const tutte = Array.from(new Set(Array.from(banca.keys()).map(p => p.split('/')[0]))).concat(['vuota']);
        // a due pagine, per provare anche il segno di pagina
        return corpo.pageToken ? risposta(200, { collectionIds: tutte.slice(3) }) : risposta(200, { collectionIds: tutte.slice(0, 3), nextPageToken: 'seconda' });
    }
    if (url === SERVIZIO + RADICE + ':runQuery') {
        chiamate.pagine++;
        const q = corpo.structuredQuery, f = q.where.compositeFilter.filters;
        if (!(q.from.length === 1 && q.from[0].allDescendants === true && !q.from[0].collectionId)) return risposta(400, 'interrogazione non prevista');
        const da = f[0].fieldFilter.value.referenceValue, a = f[1].fieldFilter.value.referenceValue;
        const dopo = q.startAt ? q.startAt.values[0].referenceValue : '';
        // l'ordine dei percorsi e' per segmenti, come in Firestore
        const cmp = (x, y) => { const X = x.split('/'), Y = y.split('/'); for (let i = 0; i < Math.min(X.length, Y.length); i++) { if (X[i] !== Y[i]) return X[i] < Y[i] ? -1 : 1; } return X.length - Y.length; };
        const nomi = Array.from(banca.keys()).map(p => RADICE + '/' + p).filter(n => cmp(n, da) >= 0 && cmp(n, a) < 0 && (!dopo || cmp(n, dopo) > 0)).sort(cmp).slice(0, q.limit);
        const coll = da.slice(RADICE.length + 1).split('/')[0];
        chiamate.perCollezione[coll] = (chiamate.perCollezione[coll] || 0) + 1;
        if (!nomi.length) return risposta(200, [{ readTime: '2026-11-23T10:00:00Z' }]);
        return risposta(200, nomi.map(n => ({ document: { name: n, fields: banca.get(n.slice(RADICE.length + 1)), createTime: 'x', updateTime: 'y' }, readTime: 'z' })));
    }
    return risposta(404, 'indirizzo non previsto');
};

(async () => {
    // ---------- 1. l'esportazione ----------
    const file = path.join(cartella, FS.NOME_FILE);
    const righeLog = [];
    let gettoni = 0;
    const c = await FS.esportaSuFile(PROGETTO, file, { token: async () => { gettoni++; return 'gettone-finto'; }, log: t => righeLog.push(t), perPagina: 7 });
    verifica('tutti i documenti, a ogni profondita\'', c.documenti === banca.size, [c.documenti, banca.size]);
    verifica('conta le collezioni, sottocollezioni comprese', c.collezioni === 10, c.collezioni);
    verifica('una riga di avanzamento per collezione di primo livello, anche per quella vuota', righeLog.length === 7 && /^circInvii: 11 documenti/.test(righeLog.find(r => /^circInvii/.test(r))) && /^vuota: 0 documenti/.test(righeLog.find(r => /^vuota/.test(r))), righeLog);
    verifica('una lettura per documento: nessuna chiamata per documento, solo pagine', chiamate.elenco === 2 && chiamate.pagine === 1 + 1 + 2 + 4 + 3 + 1 + 1, chiamate);   // archivio, archivio2, circInvii, iscrizioni, registro, utenti, vuota
    verifica('23 documenti a pagine da 7: quattro pagine; 14 documenti (giusto due pagine piene): una terza, vuota, per accorgersi che sono finiti', chiamate.perCollezione.iscrizioni === 4 && chiamate.perCollezione.registro === 3, chiamate.perCollezione);
    verifica('la rilettura di controllo conta gli stessi documenti', (await FS.verificaFile(file)) === banca.size);

    const righe = zlib.gunzipSync(fs.readFileSync(file)).toString('utf8').trim().split('\n').map(r => JSON.parse(r));
    const testa = righe[0], coda = righe[righe.length - 1], doc = new Map(righe.slice(1, -1).map(r => [r.p, r.d]));
    verifica('intestazione e chiusura', testa.formato === 'ngb-firestore-export-v2' && testa.progetto === PROGETTO && /^\d{4}-/.test(testa.esportato) && coda.fine === true && coda.documenti === banca.size && coda.collezioni === 10, [testa, coda]);
    verifica('ogni documento una volta sola, con il suo percorso', doc.size === banca.size && Array.from(banca.keys()).every(p => doc.has(p)));
    verifica('"archivio2" non finisce dentro "archivio"', righe.filter(r => r.p === 'archivio2/x').length === 1 && doc.get('archivio2/x').v === 'altra collezione');
    const u = doc.get('utenti/a@b.it');
    verifica('testo, vero/falso, numeri, vuoto', u.nome === 'Anna' && u.attivo === true && u.accessi === 42 && u.media === 1.5 && u.vuoto === null, u);
    verifica('un intero troppo grande per JavaScript resta esatto, come testo', u.enorme.__tipo__ === 'intero-grande' && u.enorme.valore === '9007199254740993');
    verifica('NaN e infinito', u.nonNumero.__tipo__ === 'numero-speciale' && u.nonNumero.valore === 'NaN' && u.infinito.valore === '-Infinity');
    verifica('coordinate e riferimento (percorso senza il prefisso del progetto)', u.dove.__tipo__ === 'geopoint' && u.dove.latitudine === 45.46 && u.dove.longitudine === 9.19 && u.rif.__tipo__ === 'riferimento' && u.rif.percorso === 'archivio/persone', [u.dove, u.rif]);
    verifica('liste e mappe, anche vuote e annidate', JSON.stringify(u.lista) === '["x",2,{"k":"v"}]' && Array.isArray(u.listaVuota) && u.listaVuota.length === 0 && u.scheda.ruolo === 'admin' && u.scheda.dentro.n === 7 && JSON.stringify(u.mappaVuota) === '{}', u);
    verifica('la data con il suo contrassegno', doc.get('archivio/incarichi').aggiornato.__tipo__ === 'timestamp' && doc.get('archivio/incarichi').aggiornato.valore === '2026-11-23T10:15:30.123456Z');
    verifica('i byte dei PDF a pezzi, identici', Buffer.from(doc.get('circInvii/L1/allegato/0001').dati.valore, 'base64').equals(PEZZO) && doc.get('circInvii/L1/allegato/0001').dati.__tipo__ === 'byte');
    verifica('tre livelli sotto, e i figli di un documento mai scritto', doc.get('circInvii/L1/allegato/0000/note/a').testo === 'tre livelli sotto' && Buffer.from(doc.get('circInvii/FANTASMA/allegato/0000').dati.valore, 'base64').toString() === 'orfano' && !doc.has('circInvii/FANTASMA'));
    verifica('il file e\' compresso e una riga non contiene a capo', fs.readFileSync(file)[0] === 0x1f && righe.length === banca.size + 2);

    // ---------- 2. un file troncato o manomesso non passa il controllo ----------
    const intero = zlib.gunzipSync(fs.readFileSync(file)).toString('utf8');
    const prova = async (nome, testo) => { const f = path.join(cartella, nome); fs.writeFileSync(f, zlib.gzipSync(testo)); try { await FS.verificaFile(f); return 'passato'; } catch (e) { return e.message; } };
    verifica('senza la riga di chiusura: troncato', /troncato/.test(await prova('t1.jsonl.gz', intero.trim().split('\n').slice(0, -1).join('\n') + '\n')));
    verifica('con un documento in meno della chiusura', /dichiara/.test(await prova('t2.jsonl.gz', intero.trim().split('\n').filter((r, i) => i !== 5).join('\n') + '\n')));
    verifica('con una riga rovinata', (await prova('t3.jsonl.gz', intero.replace('"p":"archivio/persone"', '"p":archivio'))) !== 'passato');
    verifica('di un altro formato', /intestazione/.test(await prova('t4.jsonl.gz', intero.replace('ngb-firestore-export-v2', 'altro'))));

    // ---------- 3. i guasti dell'API ----------
    const veroTimer = global.setTimeout;
    global.setTimeout = (fn, ms, ...a) => veroTimer(fn, Math.min(ms, 5), ...a);      // le attese diventano brevi
    let n503 = 0;
    guasta = url => (/runQuery/.test(url) && n503++ < 2 ? risposta(503, 'UNAVAILABLE') : null);
    const c2 = await FS.esportaSuFile(PROGETTO, path.join(cartella, 'riprova.jsonl.gz'), { token: async () => 'gettone-finto', perPagina: 50 });
    verifica('un guasto passeggero dell\'API si ritenta, e l\'esportazione arriva in fondo completa', c2.documenti === banca.size && n503 >= 3);
    guasta = url => (/runQuery/.test(url) ? risposta(429, { error: { status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded.' } }) : null);
    let quota = '';
    try { await FS.esportaSuFile(PROGETTO, path.join(cartella, 'quota.jsonl.gz'), { token: async () => 'gettone-finto' }); } catch (e) { quota = e.message; }
    verifica('quota di letture esaurita: l\'esportazione si ferma e lo dice chiaro, invece di restare appesa', /quota esaurita/.test(quota) && /piano a consumo/.test(quota), quota);
    guasta = url => (/runQuery/.test(url) ? risposta(403, { error: { status: 'PERMISSION_DENIED' } }) : null);
    let negato = '';
    try { await FS.esportaSuFile(PROGETTO, path.join(cartella, 'negato.jsonl.gz'), { token: async () => 'gettone-finto' }); } catch (e) { negato = e.message; }
    verifica('permesso negato: errore subito, senza ritentare', /HTTP 403/.test(negato) && /PERMISSION_DENIED/.test(negato), negato);
    guasta = null;
    global.setTimeout = veroTimer;

    // ---------- 4. lo strumento di ripristino, con un firebase-admin finto ----------
    const moduli = path.join(cartella, 'node_modules', 'firebase-admin');
    fs.mkdirSync(moduli, { recursive: true });
    fs.writeFileSync(path.join(moduli, 'index.js'), `
        const fs = require('fs'), crypto = require('crypto');
        const piatto = v => Buffer.isBuffer(v) ? { __buf: v.length, sha: crypto.createHash('sha1').update(v).digest('hex') } : typeof v === 'bigint' ? { __big: String(v) } : typeof v === 'number' && !Number.isFinite(v) ? { __num: String(v) } : Array.isArray(v) ? v.map(piatto) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, piatto(x)])) : v;
        const db = { doc: p => ({ __doc: p }), batch: () => { const ops = []; return { set: (r, d) => ops.push({ p: r.__doc, d: piatto(d) }), commit: async () => fs.appendFileSync(process.env.FINTO_USCITA, JSON.stringify(ops) + '\\n') }; } };
        class GeoPoint { constructor(a, b) { this.__geo = [a, b]; } }
        module.exports = { initializeApp() { }, credential: { cert: x => x }, firestore: Object.assign(() => db, { Timestamp: { fromDate: d => ({ __ts: d.toISOString() }) }, GeoPoint }) };
    `);
    const chiave = path.join(cartella, 'chiave.json');
    fs.writeFileSync(chiave, JSON.stringify({ project_id: 'progetto-nuovo', client_email: 'x@y', private_key: 'k' }));
    const strumento = path.join(__dirname, '..', 'import-firestore.cjs');
    const uscitaFinta = path.join(cartella, 'scritture.jsonl');
    const lancia = (argomenti) => { try { return { ok: true, testo: execFileSync('node', [strumento].concat(argomenti), { env: Object.assign({}, process.env, { NODE_PATH: path.join(cartella, 'node_modules'), FINTO_USCITA: uscitaFinta }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; } catch (e) { return { ok: false, testo: String(e.stdout || '') + String(e.stderr || '') }; } };

    let r = lancia([chiave, file]);
    verifica('prova a vuoto: conta i documenti per collezione e non scrive niente', r.ok && new RegExp('Documenti: ' + banca.size).test(r.testo) && /iscrizioni\s+23 documenti/.test(r.testo) && /circInvii\s+11 documenti/.test(r.testo) && /PROVA A VUOTO/.test(r.testo) && /progetto DIVERSO/.test(r.testo) && !fs.existsSync(uscitaFinta), r.testo);
    r = lancia([chiave, file, '--conferma']);
    const lotti = fs.existsSync(uscitaFinta) ? fs.readFileSync(uscitaFinta, 'utf8').trim().split('\n').map(x => JSON.parse(x)) : [];
    const scritti = new Map([].concat(...lotti).map(o => [o.p, o.d]));
    verifica('con --conferma scrive tutti i documenti, ognuno al suo percorso', r.ok && scritti.size === banca.size && Array.from(banca.keys()).every(p => scritti.has(p)) && new RegExp('Fatto: ' + banca.size + ' documenti').test(r.testo), r.testo.slice(-300));
    verifica('i pezzi dei PDF tornano byte, identici', scritti.get('circInvii/L1/allegato/0007').dati.__buf === PEZZO.length && scritti.get('circInvii/L1/allegato/0007').dati.sha === require('crypto').createHash('sha1').update(PEZZO).digest('hex'));
    const su = scritti.get('utenti/a@b.it');
    verifica('date, coordinate, riferimenti, interi grandi e NaN tornano del loro tipo', scritti.get('archivio/incarichi').aggiornato.__ts === '2026-11-23T10:15:30.123Z' && su.dove.__geo.join() === '45.46,9.19' && su.rif.__doc === 'archivio/persone' && su.enorme.__big === '9007199254740993' && su.nonNumero.__num === 'NaN' && su.accessi === 42 && su.scheda.dentro.n === 7, su);
    verifica('i gruppi di scrittura restano sotto 300 documenti e sotto 5 MB (i pezzi dei PDF pesano)', lotti.length >= 2 && lotti.every(l => l.length <= 300 && JSON.stringify(l).length < 6 * 1024 * 1024), lotti.map(l => l.length));
    // il file decompresso a mano va bene lo stesso
    const piano = path.join(cartella, 'firestore-data.jsonl');
    fs.writeFileSync(piano, intero);
    verifica('anche il file gia\' decompresso', new RegExp('Documenti: ' + banca.size).test(lancia([chiave, piano]).testo));
    // un file troncato non si ripristina
    r = lancia([chiave, path.join(cartella, 't1.jsonl.gz'), '--conferma']);
    verifica('un file troncato viene rifiutato prima di scrivere', !r.ok && /troncato/.test(r.testo), r.testo);
    // i backup di prima (un unico JSON ad albero) si rimettono dentro ancora
    const vecchio = path.join(cartella, 'firestore-data.json');
    fs.writeFileSync(vecchio, JSON.stringify({ formato: 'ngb-firestore-export-v1', progetto: 'p', esportato: '2026-09-01T06:22:11Z', collezioni: { archivio: { incarichi: { dati: { json: '[]', quando: { __tipo__: 'timestamp', valore: '2026-09-01T06:00:00.000Z' } } } }, cose: { a: { dati: { n: 1 }, sottocollezioni: { figli: { b: { dati: { pdf: { __tipo__: 'byte', valore: 'AQID' } } } } } } } } }));
    fs.rmSync(uscitaFinta, { force: true });
    r = lancia([chiave, vecchio, '--conferma']);
    const vecchi = new Map([].concat(...fs.readFileSync(uscitaFinta, 'utf8').trim().split('\n').map(x => JSON.parse(x))).map(o => [o.p, o.d]));
    verifica('il formato di prima (firestore-data.json) si ripristina ancora, sottocollezioni comprese', r.ok && vecchi.size === 3 && vecchi.get('cose/a/figli/b').pdf.__buf === 3 && vecchi.get('archivio/incarichi').quando.__ts === '2026-09-01T06:00:00.000Z', r.testo);

    fs.rmSync(cartella, { recursive: true, force: true });
    console.log('\nbackup Firestore: ' + passate + ' verifiche passate' + (fallite ? ', ' + fallite + ' FALLITE' : ''));
    process.exit(fallite ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
