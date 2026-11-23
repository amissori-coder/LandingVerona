/* ============================================================
   Prove della prova di ripristino
   ------------------------------------------------------------
       node scripts/backup/prove/prova-ripristino.prove.cjs
       MOSTRA=1 node scripts/backup/prove/prova-ripristino.prove.cjs    (fa vedere anche il registro di una prova)

   Non tocca la rete e non serve nessuna chiave. Ci sono due progetti finti,
   quello "di origine" e quello "di appoggio", dietro un'API di Firestore
   finta che sa elencare, leggere a pagine, scrivere e cancellare. Lo
   strumento di ripristino vero (import-firestore.cjs) gira come nella
   realta', in un processo a parte, con un firebase-admin finto che traduce
   quello che scriverebbe nel formato dell'API: cosi' il giro e' completo,
   backup -> ripristino -> rilettura -> confronto -> pulizia.
   ============================================================ */
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');
const FS = require('../lib/firestore.cjs');
const PR = require('../prova-ripristino.cjs');

let passate = 0, fallite = 0;
function verifica(cosa, condizione, dettaglio) {
    if (condizione) { passate++; return; }
    fallite++;
    console.error('  NO  ' + cosa + (dettaglio !== undefined ? '\n        ' + JSON.stringify(dettaglio).slice(0, 900) : ''));
}

const ORIGINE = 'progetto-vero-finto';
const APPOGGIO = 'progetto-appoggio-finto';
const SERVIZIO = 'https://firestore.googleapis.com/v1/';
const radice = p => 'projects/' + p + '/databases/(default)/documents';
const cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'ngb-prova-ripristino-'));
const uscitaFinta = path.join(cartella, 'scritture.jsonl');

/* ---------- i due database finti: progetto -> (percorso -> campi dell'API) ---------- */
const banche = {};
const banca = p => (banche[p] = banche[p] || new Map());
const s = v => ({ stringValue: v });
const O = banca(ORIGINE);
const R = radice(ORIGINE);
O.set('archivio/incarichi', { json: s('[{"id":"inc-1","cliente":"ALFA S.p.A."}]'), aggiornato: { timestampValue: '2026-11-23T10:15:30.123456Z' } });
O.set('archivio/persone', { json: s('[]'), quando: { timestampValue: '2026-11-23T10:15:30Z' } });
O.set('utenti/mario.rossi@studio.it', {
    nome: s('Mario'), attivo: { booleanValue: true }, accessi: { integerValue: '42' }, enorme: { integerValue: '9007199254740993' },
    media: { doubleValue: 1.5 }, nonNumero: { doubleValue: 'NaN' }, infinito: { doubleValue: '-Infinity' }, vuoto: { nullValue: null },
    dove: { geoPointValue: { latitude: 45.46, longitude: 9.19 } }, rif: { referenceValue: R + '/archivio/persone' },
    lista: { arrayValue: { values: [s('x'), { integerValue: '2' }, { mapValue: { fields: { k: s('v') } } }, { timestampValue: '2026-01-02T03:04:05.000001Z' }] } }, listaVuota: { arrayValue: {} },
    scheda: { mapValue: { fields: { ruolo: s('admin'), dentro: { mapValue: { fields: { n: { integerValue: '7' } } } }, 'anna@pec.it': s('chiave che e\' un indirizzo') } } }, mappaVuota: { mapValue: {} }
});
const PEZZO = Buffer.alloc(300 * 1024, 7);
O.set('circInvii/L1', { destinatario: s('Banca'), codice: s('RVL-AAAAAA') });
for (let n = 0; n < 6; n++) O.set('circInvii/L1/allegato/000' + n, { dati: { bytesValue: PEZZO.toString('base64') } });
O.set('circInvii/L1/allegato/0000/note/a', { testo: s('tre livelli sotto') });
O.set('circInvii/FANTASMA/allegato/0000', { dati: { bytesValue: Buffer.from('orfano').toString('base64') } });
for (let i = 0; i < 23; i++) O.set('iscrizioni/i' + String(i).padStart(3, '0'), { n: { integerValue: String(i) }, email: s('p' + i + '@x.it') });
for (let i = 0; i < 14; i++) O.set('registro/r' + String(i).padStart(2, '0'), { n: { integerValue: String(i) }, senzaCampi: { mapValue: {} } });
O.set('vuoti/senza-campi', {});
const quantiSotto = nome => Array.from(O.keys()).filter(p => p.split('/')[0] === nome).length;
const RADICI = Array.from(new Set(Array.from(O.keys()).map(p => p.split('/')[0]))).sort();
const TOTALE = O.size;        // 50 documenti, sottocollezioni comprese

/* ---------- l'API finta (Firestore e Drive) ---------- */
const chiamate = [];             // { progetto, metodo } di ogni chiamata a Firestore
let guasta = null;               // (progetto, metodo) -> risposta finta
let lette = 0;
function assorbi() {             // le scritture fatte dallo strumento di ripristino, nel suo processo
    if (!fs.existsSync(uscitaFinta)) return;
    const righe = fs.readFileSync(uscitaFinta, 'utf8').split('\n').filter(Boolean);
    for (const r of righe.slice(lette)) { const o = JSON.parse(r); banca(o.progetto).set(o.p, o.fields); }
    lette = righe.length;
}
const cmp = (x, y) => { const X = x.split('/'), Y = y.split('/'); for (let i = 0; i < Math.min(X.length, Y.length); i++) { if (X[i] !== Y[i]) return X[i] < Y[i] ? -1 : 1; } return X.length - Y.length; };
const risposta = (stato, corpo) => new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), { status: stato, headers: { 'Content-Type': 'application/json' } });
const drive = { cartelle: {}, file: {} };       // id cartella -> [voci]; id file -> Buffer
global.fetch = async (url, opz) => {
    opz = opz || {};
    if ((opz.headers || {}).Authorization !== 'Bearer gettone-finto') return risposta(401, { error: { status: 'UNAUTHENTICATED' } });
    if (url.startsWith('https://www.googleapis.com/drive/v3/files?')) {
        const q = decodeURIComponent(new URL(url).searchParams.get('q'));
        return risposta(200, { files: drive.cartelle[/^'([^']+)' in parents/.exec(q)[1]] || [] });
    }
    if (url.startsWith('https://www.googleapis.com/drive/v3/files/')) {
        const id = decodeURIComponent(url.slice('https://www.googleapis.com/drive/v3/files/'.length).split('?')[0]);
        return drive.file[id] ? new Response(drive.file[id], { status: 200 }) : risposta(404, 'notFound');
    }
    const m = /^https:\/\/firestore\.googleapis\.com\/v1\/projects\/([^/]+)\/databases\/\(default\)\/documents:(\w+)$/.exec(url);
    if (!m) return risposta(404, 'indirizzo non previsto');
    const progetto = m[1], metodo = m[2], rad = radice(progetto), db = banca(progetto);
    const corpo = JSON.parse(opz.body);
    chiamate.push({ progetto, metodo });
    if (guasta) { const g = guasta(progetto, metodo); if (g) return g; }
    assorbi();
    if (metodo === 'listCollectionIds') return risposta(200, db.size ? { collectionIds: Array.from(new Set(Array.from(db.keys()).map(p => p.split('/')[0]))) } : {});
    if (metodo === 'runQuery') {
        const q = corpo.structuredQuery, f = q.where.compositeFilter.filters;
        const da = f[0].fieldFilter.value.referenceValue, a = f[1].fieldFilter.value.referenceValue;
        const dopo = q.startAt ? q.startAt.values[0].referenceValue : '';
        const nomi = Array.from(db.keys()).map(p => rad + '/' + p).filter(n => cmp(n, da) >= 0 && cmp(n, a) < 0 && (!dopo || cmp(n, dopo) > 0)).sort(cmp).slice(0, q.limit);
        if (!nomi.length) return risposta(200, [{ readTime: 'z' }]);
        return risposta(200, nomi.map(n => ({ document: q.select ? { name: n } : { name: n, fields: db.get(n.slice(rad.length + 1)) }, readTime: 'z' })));
    }
    if (metodo === 'commit') {
        for (const w of corpo.writes) {
            if (w.update) db.set(w.update.name.slice(rad.length + 1), w.update.fields || {});
            else if (w.delete) db.delete(w.delete.slice(rad.length + 1));
            else return risposta(400, 'scrittura non prevista');
        }
        return risposta(200, { writeResults: corpo.writes.map(() => ({})) });
    }
    return risposta(404, 'metodo non previsto');
};

/* ---------- il firebase-admin finto dello strumento di ripristino ---------- */
const moduli = path.join(cartella, 'node_modules');
fs.mkdirSync(path.join(moduli, 'firebase-admin'), { recursive: true });
fs.writeFileSync(path.join(moduli, 'firebase-admin', 'index.js'), `
    const fs = require('fs');
    let progetto = '';
    class Timestamp { constructor(s, n) { if (!Number.isInteger(s) || !Number.isInteger(n) || n < 0 || n > 999999999) throw new Error('Timestamp non valido'); this.s = s; this.n = n; } static fromDate(d) { return new Timestamp(Math.floor(d.getTime() / 1000), (((d.getTime() % 1000) + 1000) % 1000) * 1e6); } }
    class GeoPoint { constructor(a, b) { this.a = a; this.b = b; } }
    class Rif { constructor(p) { if (!p || p.split('/').length % 2) throw new Error('percorso di documento non valido'); this.p = p; } }
    const data = t => { const n = process.env.FINTO_GUASTA === 'millesimi' ? Math.floor(t.n / 1e6) * 1e6 : t.n; let f = String(n).padStart(9, '0'); while (f.length && f.endsWith('000')) f = f.slice(0, -3); return new Date(t.s * 1000).toISOString().replace('.000Z', '') + (f ? '.' + f : '') + 'Z'; };
    function rest(v) {
        if (v === null) return { nullValue: null };
        if (typeof v === 'boolean') return { booleanValue: v };
        if (typeof v === 'string') return { stringValue: v };
        if (typeof v === 'bigint') return { integerValue: String(v) };
        if (typeof v === 'number') return Number.isSafeInteger(v) && !Object.is(v, -0) ? { integerValue: String(v) } : { doubleValue: Number.isFinite(v) ? v : String(v) };
        if (Buffer.isBuffer(v)) return { bytesValue: v.toString('base64') };
        if (v instanceof Timestamp) return { timestampValue: data(v) };
        if (v instanceof GeoPoint) return { geoPointValue: { latitude: v.a, longitude: v.b } };
        if (v instanceof Rif) return { referenceValue: 'projects/' + progetto + '/databases/(default)/documents/' + v.p };
        if (Array.isArray(v)) return { arrayValue: v.length ? { values: v.map(rest) } : {} };
        if (v === undefined) throw new Error('valore non definito');
        const k = Object.keys(v);
        return { mapValue: k.length ? { fields: Object.fromEntries(k.map(x => [x, rest(v[x])])) } : {} };
    }
    let scritti = 0;
    const db = {
        doc: p => new Rif(p),
        batch: () => {
            const ops = [];
            return {
                set: (r, d) => ops.push({ progetto, p: r.p, fields: rest(d).mapValue.fields || {} }),
                commit: async () => {
                    for (const o of ops) {
                        scritti++;
                        if (process.env.FINTO_GUASTA === 'perde' && scritti === 3) continue;
                        if (process.env.FINTO_GUASTA === 'altera' && scritti === 3) o.fields.intruso = { stringValue: 'x' };
                        fs.appendFileSync(process.env.FINTO_USCITA, JSON.stringify(o) + '\\n');
                    }
                    if (process.env.FINTO_GUASTA === 'cade') { console.error('Errore su projects/x/databases/(default)/documents/utenti/mario.rossi@studio.it: DEADLINE_EXCEEDED'); process.exit(3); }
                }
            };
        }
    };
    module.exports = { initializeApp(o) { progetto = o.credential.project_id; }, credential: { cert: x => x }, firestore: Object.assign(() => db, { Timestamp, GeoPoint }) };
`);
fs.mkdirSync(path.join(moduli, 'google-auth-library'), { recursive: true });
fs.writeFileSync(path.join(moduli, 'google-auth-library', 'index.js'), 'module.exports = { GoogleAuth: class { async getClient() { return { getAccessToken: async () => ({ token: "gettone-finto" }) }; } } };');

(async () => {
    // il backup del progetto "vero", fatto con l'esportazione vera
    const backup = path.join(cartella, FS.NOME_FILE);
    await FS.esportaSuFile(ORIGINE, backup, { token: async () => 'gettone-finto', perPagina: 7 });
    const dopoIlBackup = chiamate.length;

    const giro = async (extra) => {
        const righe = [];
        const lavoro = fs.mkdtempSync(path.join(cartella, 'giro-'));
        const prima = chiamate.length;
        const ambiente = Object.assign({ NODE_PATH: moduli, FINTO_USCITA: uscitaFinta, FINTO_GUASTA: '' }, (extra || {}).ambiente);
        const e = await PR.prova(Object.assign({
            file: backup, cred: { project_id: APPOGGIO, client_email: 'x@y', private_key: 'k' }, cartella: lavoro,
            token: async () => 'gettone-finto', log: t => righe.push(t)
        }, extra, { ambiente }));
        assorbi();
        return { e, righe, testo: righe.join('\n'), fatte: chiamate.slice(prima), lavoro };
    };
    const toccato = (g, progetto) => g.fatte.filter(c => c.progetto === progetto);
    const A = banca(APPOGGIO);

    // ---------- 1. un campione: i primi 5 documenti di ogni collezione ----------
    let g = await giro({ perCollezione: 5 });
    const attesiCampione = RADICI.reduce((n, r) => n + Math.min(5, quantiSotto(r)), 0);
    if (process.env.MOSTRA) console.log(g.testo + '\n');        // MOSTRA=1 fa vedere il registro di una prova
    verifica('campione: la prova riesce', g.e.ok && g.e.identico && !g.e.errore, [g.e.errore, g.testo.slice(-600)]);
    verifica('campione: i primi 5 di ogni collezione, sottocollezioni comprese', g.e.daRipristinare === attesiCampione && g.e.attesi === attesiCampione && g.e.uguali === attesiCampione && g.e.nelBackup === O.size, [g.e.daRipristinare, attesiCampione, g.e.uguali]);
    verifica('campione: alla fine il progetto di appoggio e\' di nuovo vuoto, contrassegno compreso', A.size === 0 && g.e.pulito && g.e.residui === 0, Array.from(A.keys()));
    verifica('la prova non fa NESSUNA chiamata al progetto di origine', toccato(g, ORIGINE).length === 0 && toccato(g, APPOGGIO).length > 0, toccato(g, ORIGINE));
    verifica('il progetto di origine resta com\'era', O.size === TOTALE && TOTALE === 50 && O.has('utenti/mario.rossi@studio.it'), O.size);
    verifica('il registro e\' pubblico: mai un indirizzo email, mai il percorso di un documento', !/@/.test(g.testo) && !/mario|i00\d|r0\d|L1|FANTASMA|ALFA/.test(g.testo), g.testo.match(/.*(@|mario|i00\d|L1).*/));
    verifica('la tabella: per ogni collezione quanti nel backup, quanti ripristinati, quanti identici', /iscrizioni\s+23\s+5\s+5\s*$/m.test(g.testo) && /circInvii\s+9\s+5\s+5\s*$/m.test(g.testo) && /vuoti\s+1\s+1\s+1\s*$/m.test(g.testo), g.testo);
    verifica('l\'esito in fondo dice che e\' un campione, e di quanti documenti', new RegExp('ESITO: OK - ' + attesiCampione + ' documenti ripristinati e riletti, identici al backup \\(campione di ' + attesiCampione + ' su 50\\)').test(g.testo), g.righe.slice(-1));
    verifica('la chiave di appoggio scritta per lo strumento viene tolta', !fs.existsSync(path.join(g.lavoro, 'chiave-appoggio.json')));

    // ---------- 2. tutto il backup ----------
    g = await giro({ perCollezione: 0 });
    verifica('tutto: ogni documento ripristinato e\' identico al backup', g.e.ok && g.e.uguali === O.size && g.e.attesi === O.size && g.e.diversi === 0 && g.e.mancanti === 0 && g.e.inPiu === 0, [g.e.errore, g.e.uguali, g.e.esempi]);
    verifica('tutto: l\'esito lo dice, e il progetto di appoggio torna vuoto', /ESITO: OK - 50 documenti .* \(tutto il backup\)/.test(g.testo) && A.size === 0, g.righe.slice(-1));
    verifica('tutto: pulizia a gruppi, il contrassegno per ultimo', toccato(g, APPOGGIO).filter(c => c.metodo === 'commit').length >= 1 + RADICI.length + 1);

    // ---------- 3. il confronto si accorge di tutto ----------
    g = await giro({ perCollezione: 0, ambiente: { FINTO_GUASTA: 'millesimi' } });
    verifica('una data che perde i milionesimi di secondo: la prova FALLISCE', !g.e.ok && g.e.diversi === 2 && /NON sono identici/.test(g.e.errore), [g.e.diversi, g.e.esempi]);
    verifica('...e dice in quale collezione e in quale campo, senza dire il contenuto', g.e.esempi.some(x => /^archivio #[0-9a-f]{10}: diverso in aggiornato: timestamp -> timestamp$/.test(x)) && g.e.esempi.some(x => /^utenti #[0-9a-f]{10}: diverso in lista: lista di 4 -> lista di 4$/.test(x)) && /ESITO: PROVA FALLITA/.test(g.testo), g.e.esempi);
    verifica('anche dopo una prova fallita il progetto di appoggio viene ripulito', A.size === 0 && g.e.pulito);
    g = await giro({ perCollezione: 0, ambiente: { FINTO_GUASTA: 'perde' } });
    verifica('un documento non scritto: 1 mancante', !g.e.ok && g.e.mancanti === 1 && g.e.uguali === O.size - 1 && g.e.esempi.some(x => /nel backup c'e', nel progetto di appoggio no/.test(x)) && A.size === 0, [g.e.mancanti, g.e.esempi]);
    g = await giro({ perCollezione: 0, ambiente: { FINTO_GUASTA: 'altera' } });
    verifica('un campo in piu\' in un documento: 1 diverso, con il nome del campo', !g.e.ok && g.e.diversi === 1 && g.e.esempi.some(x => /diverso in intruso: assente -> testo di 1/.test(x)) && A.size === 0, g.e.esempi);
    // un documento che compare nel progetto di appoggio dopo il controllo iniziale, prima della rilettura
    // (il primo elenco delle collezioni e' il controllo "e' vuoto?", il secondo apre la rilettura)
    let conta = 0;
    guasta = (p, m) => { if (p === APPOGGIO && m === 'listCollectionIds' && ++conta === 2) A.set('zzz/intruso', { v: s('x') }); return null; };
    g = await giro({ perCollezione: 5 });
    guasta = null;
    verifica('un documento che nel backup non c\'e\': 1 in piu\'', !g.e.ok && g.e.inPiu === 1 && /zzz\s+0\s+0\s+0\s+<-- 1 documenti che nel backup non ci sono/.test(g.testo) && A.size === 0, [g.e.inPiu, g.testo.slice(-500)]);
    g = await giro({ perCollezione: 5, ambiente: { FINTO_GUASTA: 'cade' } });
    verifica('lo strumento di ripristino che si ferma a meta\': prova fallita, e il progetto ripulito', !g.e.ok && /si e' fermato \(codice 3\)/.test(g.e.errore) && A.size === 0 && g.e.pulito, g.e.errore);
    verifica('...e l\'errore stampato non porta ne\' indirizzi ne\' percorsi', !/@|mario/.test(g.testo) && /documents\/utenti\/\[\.\.\.\]/.test(g.testo), g.testo.match(/.*fermato.*/));

    // ---------- 4. non puo' toccare un progetto che non sia di appoggio ----------
    let prima = chiamate.length;
    g = await giro({ cred: { project_id: ORIGINE } });
    verifica('la chiave "di appoggio" e\' dello stesso progetto del backup: RIFIUTO, senza scrivere ne\' cancellare', !g.e.ok && /RIFIUTO/.test(g.e.errore) && chiamate.slice(prima).filter(c => c.metodo === 'commit').length === 0 && O.size === TOTALE, [g.e.errore, chiamate.slice(prima)]);
    verifica('...anzi, senza nemmeno una chiamata', chiamate.length === prima);
    prima = chiamate.length;
    g = await giro({ cred: { project_id: PR.PRODUZIONE[0] } });
    verifica('la chiave e\' del progetto vero: RIFIUTO prima di qualunque chiamata', !g.e.ok && /RIFIUTO: «revilaw-incarichi» non e' un progetto di appoggio/.test(g.e.errore) && chiamate.length === prima, g.e.errore);
    prima = chiamate.length;
    g = await giro({ cred: { project_id: 'un-altro-progetto' }, vietati: ['un-altro-progetto'] });
    verifica('un progetto dichiarato vietato (quello della chiave vera, se presente): RIFIUTO', !g.e.ok && /RIFIUTO/.test(g.e.errore) && chiamate.length === prima);
    g = await giro({ cred: {} });
    verifica('una chiave senza progetto: non parte', !g.e.ok && /project_id/.test(g.e.errore));

    A.set('clienti/c1', { nome: s('dati veri di qualcuno') });
    A.set('clienti/c1/note/n1', { t: s('x') });
    prima = chiamate.length;
    g = await giro({ perCollezione: 5 });
    verifica('il progetto non e\' vuoto e non ha il contrassegno: RIFIUTO', !g.e.ok && /RIFIUTO: il progetto «progetto-appoggio-finto» non e' vuoto \(1 collezioni\)/.test(g.e.errore), g.e.errore);
    verifica('...e i dati che c\'erano restano tutti li\': nessuna scrittura, nessuna cancellazione', A.size === 2 && A.has('clienti/c1/note/n1') && chiamate.slice(prima).every(c => c.metodo === 'listCollectionIds'), [A.size, chiamate.slice(prima)]);
    // un contrassegno finto, messo da altri in un'altra forma, non basta
    A.set(PR.SEGNO_DOC, { strumento: s('altro') });
    g = await giro({ perCollezione: 5 });
    verifica('un contrassegno che non e\' il nostro non basta: RIFIUTO, dati intatti', !g.e.ok && /RIFIUTO/.test(g.e.errore) && A.size === 3, g.e.errore);
    A.clear();

    // ---------- 5. --lascia, e i resti di una prova precedente ----------
    g = await giro({ perCollezione: 5, lascia: true });
    verifica('--lascia: prova riuscita, dati e contrassegno restano nel progetto di appoggio', g.e.ok && !g.e.pulito && A.size === attesiCampione + 1 && A.has(PR.SEGNO_DOC) && A.get(PR.SEGNO_DOC).strumento.stringValue === 'prova-ripristino' && A.get(PR.SEGNO_DOC).origine.stringValue === ORIGINE && /Pulizia: saltata/.test(g.testo), [A.size, attesiCampione]);
    g = await giro({ perCollezione: 0 });
    verifica('la prova dopo trova i resti (con il contrassegno), li toglie e riparte da vuoto', g.e.ok && /resti di una prova precedente/.test(g.testo) && new RegExp('tolti ' + (attesiCampione + 1) + ' documenti').test(g.testo) && g.e.uguali === O.size && A.size === 0, g.testo.slice(0, 900));

    // ---------- 6. un backup che non va, un progetto che non c'e' ----------
    const intero = zlib.gunzipSync(fs.readFileSync(backup)).toString('utf8');
    const troncato = path.join(cartella, 'troncato.jsonl.gz');
    fs.writeFileSync(troncato, zlib.gzipSync(intero.trim().split('\n').slice(0, -1).join('\n') + '\n'));
    prima = chiamate.length;
    g = await giro({ file: troncato });
    verifica('un backup troncato: la prova fallisce subito, senza toccare il progetto di appoggio', !g.e.ok && /troncato/.test(g.e.errore) && chiamate.length === prima && A.size === 0, g.e.errore);
    const vecchio = path.join(cartella, 'altro.jsonl.gz');
    fs.writeFileSync(vecchio, zlib.gzipSync(intero.replace(FS.FORMATO, 'un-altro-formato')));
    g = await giro({ file: vecchio });
    verifica('un file di un altro formato: lo dice', !g.e.ok && /formato/.test(g.e.errore) && chiamate.length === prima, g.e.errore);
    guasta = (p, m) => (p === APPOGGIO && m === 'listCollectionIds' ? risposta(404, { error: { status: 'NOT_FOUND', message: 'The database (default) does not exist for project progetto-appoggio-finto' } }) : null);
    g = await giro({ perCollezione: 5 });
    guasta = null;
    verifica('nel progetto di appoggio manca il database: lo spiega', !g.e.ok && /non c'e' ancora il database: va creato da Firebase/.test(g.e.errore) && A.size === 0, g.e.errore);
    let n500 = 0;
    const veroTimer = global.setTimeout;
    global.setTimeout = (fn, ms, ...a) => veroTimer(fn, Math.min(ms, 5), ...a);
    guasta = (p, m) => (p === APPOGGIO && m === 'commit' && n500++ < 2 ? risposta(503, 'UNAVAILABLE') : null);
    g = await giro({ perCollezione: 5 });
    guasta = null;
    global.setTimeout = veroTimer;
    verifica('un guasto passeggero di Firestore durante la prova si ritenta', g.e.ok && n500 >= 3 && A.size === 0, g.e.errore);

    // ---------- 7. l'ultimo backup che sta su Drive ----------
    const D = require('../lib/drive.cjs');
    const cart = 'application/vnd.google-apps.folder';
    drive.cartelle.RADICE = [
        { id: 'c1', name: '2026-09-01_0814', mimeType: cart }, { id: 'c2', name: '2026-11-23_1725', mimeType: cart },
        { id: 'c3', name: '2026-11-24_0317', mimeType: cart }, { id: 'cm', name: 'media', mimeType: cart }, { id: 'f0', name: '2026-12-01_0000', mimeType: 'text/plain' }
    ];
    drive.cartelle.c1 = [{ id: 'v1', name: 'firestore-data.json', mimeType: 'application/json' }];
    drive.cartelle.c2 = [{ id: 'r2', name: 'report.txt' }, { id: 'd2', name: FS.NOME_FILE }];
    drive.cartelle.c3 = [{ id: 'r3', name: 'report.txt' }];          // il backup di stanotte non ha ancora (o non ha) i dati
    drive.file.d2 = fs.readFileSync(backup);
    const scaricato = path.join(cartella, 'da-drive.jsonl.gz');
    const b = await PR.ultimoBackupSuDrive(D, 'gettone-finto', 'RADICE', scaricato);
    verifica('da Drive: la cartella piu\' recente che contiene i dati, scaricati identici', b.etichetta === '2026-11-23_1725' && b.byte === fs.statSync(backup).size && fs.readFileSync(scaricato).equals(fs.readFileSync(backup)), b);
    drive.cartelle.c2 = [{ id: 'r2', name: 'report.txt' }];
    let senza = '';
    try { await PR.ultimoBackupSuDrive(D, 'gettone-finto', 'RADICE', scaricato); } catch (e) { senza = e.message; }
    verifica('da Drive: se i dati non ci sono in nessuna cartella recente, lo dice', /non c'e' nessun firestore-data\.jsonl\.gz/.test(senza), senza);

    // ---------- 8. da riga di comando, e il lavoro su GitHub ----------
    const strumento = path.join(__dirname, '..', 'prova-ripristino.cjs');
    const report = path.join(cartella, 'report-prova.txt');
    const ambiente = Object.assign({}, process.env, { NODE_PATH: moduli, PROVA_REPORT: report, RUNNER_TEMP: cartella });
    for (const k of ['FIREBASE_SERVICE_ACCOUNT_APPOGGIO', 'FIREBASE_SERVICE_ACCOUNT', 'GDRIVE_FOLDER_ID', 'GDRIVE_CLIENT_ID', 'GDRIVE_CLIENT_SECRET', 'GDRIVE_REFRESH_TOKEN', 'GDRIVE_SERVICE_ACCOUNT']) delete ambiente[k];
    const lancia = (argomenti, extra) => { try { return { codice: 0, testo: execFileSync('node', [strumento].concat(argomenti), { env: Object.assign({}, ambiente, extra), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; } catch (e) { return { codice: e.status, testo: String(e.stdout || '') + String(e.stderr || '') }; } };
    let r = lancia([backup]);
    verifica('senza la chiave di appoggio: non parte, esce con errore e lo scrive nel report', r.codice === 1 && /PROVA NON ESEGUITA - manca FIREBASE_SERVICE_ACCOUNT_APPOGGIO/.test(r.testo) && /PROVA NON ESEGUITA/.test(fs.readFileSync(report, 'utf8')), r);
    r = lancia([backup], { FIREBASE_SERVICE_ACCOUNT_APPOGGIO: JSON.stringify({ project_id: 'revilaw-incarichi', client_email: 'x@y', private_key: 'k' }) });
    verifica('con la chiave del progetto vero al posto di quella di appoggio: RIFIUTO', r.codice === 1 && /RIFIUTO: «revilaw-incarichi»/.test(r.testo), r);
    r = lancia([], { FIREBASE_SERVICE_ACCOUNT_APPOGGIO: JSON.stringify({ project_id: APPOGGIO, client_email: 'x@y', private_key: 'k' }) });
    verifica('senza file e senza Drive configurato: dice cosa manca', r.codice === 1 && /manca GDRIVE_FOLDER_ID/.test(r.testo), r);
    verifica('non lascia cartelle temporanee', fs.readdirSync(cartella).filter(n => /^prova-ripristino-/.test(n)).length === 0);

    const lavoro = fs.readFileSync(path.join(__dirname, '..', '..', '..', '.github', 'workflows', 'prova-ripristino.yml'), 'utf8');
    const attive = lavoro.split('\n').filter(x => !/^\s*#/.test(x)).join('\n');
    verifica('il lavoro su GitHub non riceve MAI la chiave del progetto vero', !/secrets\.FIREBASE_SERVICE_ACCOUNT\s*\}\}/.test(attive) && /secrets\.FIREBASE_SERVICE_ACCOUNT_APPOGGIO/.test(attive));
    verifica('il lavoro su GitHub non allega niente e puo\' solo leggere il repository', !/upload-artifact/.test(attive) && /permissions:\s*\n\s+contents: read\s*\n(?!\s+\w+: write)/.test(attive));

    fs.rmSync(cartella, { recursive: true, force: true });
    console.log('\nprova di ripristino: ' + passate + ' verifiche passate' + (fallite ? ', ' + fallite + ' FALLITE' : ''));
    process.exit(fallite ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
