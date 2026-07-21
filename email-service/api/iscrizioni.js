/* ============================================================
   Iscrizioni agli eventi (Area riservata Revilaw)
   ------------------------------------------------------------
   Legge il foglio Google dei form del sito e restituisce SOLO le
   iscrizioni dell'evento richiesto (es. Napoli 2 Ottobre 2026).

   Sicurezza: i dati sono personali (nome, email, telefono), quindi
   l'endpoint NON e' pubblico. Chi chiama deve:
     1. essere autenticato (ID token Firebase verificato qui);
     2. essere un utente abilitato e attivo (collezione "utenti");
     3. essere amministratore OPPURE essere nell'elenco degli abilitati
        alla sezione Eventi (archivio/eventiConfig).

   Il foglio si legge con l'account di servizio gia' configurato per
   Firebase (FIREBASE_SERVICE_ACCOUNT): basta condividere il foglio in
   sola lettura con la sua email e abilitare l'API Google Sheets.
   Nessuna credenziale nuova nel codice: tutto da variabili d'ambiente.
   ============================================================ */

const admin = require('firebase-admin');
const { JWT } = require('google-auth-library');

function leggiServiceAccount() {
    const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT mancante');
    let testo = raw;
    if (testo[0] !== '{') {
        try {
            const dec = Buffer.from(testo, 'base64').toString('utf8').trim();
            if (dec[0] === '{') testo = dec;
        } catch (_) { /* lo segnala JSON.parse */ }
    }
    let cred;
    try { cred = JSON.parse(testo); }
    catch (_) { throw new Error('FIREBASE_SERVICE_ACCOUNT non valido'); }
    if (cred.private_key && cred.private_key.includes('\\n')) {
        cred.private_key = cred.private_key.replace(/\\n/g, '\n');
    }
    return cred;
}

let appPronta = false;
function initAdmin(cred) {
    if (appPronta) return;
    admin.initializeApp({ credential: admin.credential.cert(cred) });
    appPronta = true;
}

// token di sola lettura per l'API Google Sheets, firmato con l'account di servizio
async function tokenSheets(cred) {
    const client = new JWT({
        email: cred.client_email,
        key: cred.private_key,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });
    const t = await client.getAccessToken();
    const token = t && typeof t === 'object' ? t.token : t;
    if (!token) throw new Error('Token Google non ottenuto');
    return token;
}

// normalizza un'intestazione ("Cognome " -> "cognome") per mappare le colonne per NOME
function chiave(s) {
    return String(s == null ? '' : s).trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');  // via gli accenti combinanti
}

// "gg/mm/aaaa hh:mm:ss" -> numero ordinabile (0 se la data manca o non si legge)
function quando(txt) {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(String(txt || '').trim());
    if (!m) return 0;
    return Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
}
// dalla piu' recente alla piu' vecchia, come ci si aspetta da un elenco iscritti
function ordina(lista) {
    return lista.slice().sort((a, b) => quando(b.data) - quando(a.data));
}

/* Unica uscita per le risposte positive: toglie le iscrizioni cancellate
   dall'amministratore (anche se tornassero dal foglio) e allega stati e note,
   cosi' l'area riservata riceve tutto in una volta sola. */
function rispondi(res, lista, fonti, presenze, cancellate, avviso) {
    const vive = ordina(lista.filter(x => !cancellate[x.id]));
    const out = { ok: true, iscrizioni: vive, presenze: presenze || {}, aggiornato: Date.now(), fonti: fonti };
    if (avviso) out.avviso = avviso;
    res.status(200).json(out);
}

/* --- memoria di breve durata delle iscrizioni ---
   Ogni richiesta rileggeva TUTTO l'archivio: con qualche centinaio di iscritti e
   un aggiornamento automatico frequente si bruciava la quota giornaliera di
   letture di Firebase, e la sezione smetteva di funzionare per tutti.
   Qui l'elenco letto resta in memoria per qualche decina di secondi ed e'
   condiviso da tutte le richieste che arrivano nel frattempo. Il pulsante
   "Aggiorna adesso" puo' forzare una lettura fresca. */
const CACHE_MS = 45 * 1000;
let _cache = { quando: 0, righe: null, rev: -1 };
/* Numero di revisione dei dati: lo alza di uno chiunque scriva (nuova iscrizione,
   importazione, stato, nota, cancellazione). Leggerlo costa UN documento: se non e'
   cambiato non serve rileggere l'intero archivio, che di documenti ne ha centinaia.
   E' la differenza fra qualche centinaio di letture al giorno e decine di migliaia. */
async function revisione(db) {
    try {
        const d = await db.collection('meta').doc('iscrizioni').get();
        return (d.exists && typeof d.data().rev === 'number') ? d.data().rev : 0;
    } catch (_) { return -1; }   // in caso di dubbio si rilegge
}
async function leggiTutteLeIscrizioni(db, forza, rev) {
    if (!forza && _cache.righe) {
        // se il numero di revisione si legge, decide LUI: uguale = niente e' cambiato,
        // diverso = si rilegge subito. La scadenza a tempo vale solo quando non si
        // riesce a leggere la revisione, per non restare fermi su dati vecchi.
        if (rev >= 0) {
            if (rev === _cache.rev) return { righe: _cache.righe, daMemoria: true };
        } else if ((Date.now() - _cache.quando) < CACHE_MS) {
            return { righe: _cache.righe, daMemoria: true };
        }
    }
    const snap = await db.collection('iscrizioni').get();
    const righe = [];
    snap.forEach(d => righe.push(d.data() || {}));
    _cache = { quando: Date.now(), righe: righe, rev: rev };
    return { righe: righe, daMemoria: false };
}
// stesso trattamento per stati/note e cancellazioni, per evento
const _cacheEv = {};
async function leggiPerEvento(db, collezione, idEvento, forza, rev) {
    const k = collezione + '~' + idEvento;
    const c = _cacheEv[k];
    if (!forza && c) {
        if (rev >= 0) {
            if (c.rev === rev) return c.righe;
        } else if ((Date.now() - c.quando) < CACHE_MS) {
            return c.righe;
        }
    }
    const snap = await db.collection(collezione).where('evento', '==', idEvento).get();
    const righe = [];
    snap.forEach(d => righe.push(d.data() || {}));
    _cacheEv[k] = { quando: Date.now(), righe: righe, rev: rev };
    return righe;
}

module.exports = async (req, res) => {
    const origin = process.env.ALLOWED_ORIGIN || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false, msg: 'Metodo non consentito' }); return; }

    try {
        const cred = leggiServiceAccount();
        initAdmin(cred);
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

        // 1) autenticazione
        const idToken = String(body.idToken || '');
        if (!idToken) { res.status(401).json({ ok: false, msg: 'Autenticazione mancante' }); return; }
        let decoded;
        try { decoded = await admin.auth().verifyIdToken(idToken); }
        catch (e) { res.status(401).json({ ok: false, msg: 'Sessione non valida: rientra e riprova.' }); return; }
        const email = String(decoded.email || '').toLowerCase();
        if (!email) { res.status(401).json({ ok: false, msg: 'Utente non valido' }); return; }

        // 2) utente abilitato e attivo
        const uDoc = await admin.firestore().collection('utenti').doc(email).get();
        if (!uDoc.exists || uDoc.data().attivo === false) { res.status(403).json({ ok: false, msg: 'Utenza non abilitata.' }); return; }
        const ruolo = String(uDoc.data().ruolo || '');

        // 3) autorizzazione alla sezione Eventi: admin oppure nell'elenco abilitati
        let abilitati = [];
        try {
            const cfgDoc = await admin.firestore().collection('archivio').doc('eventiConfig').get();
            if (cfgDoc.exists) {
                const cfg = JSON.parse(cfgDoc.data().json || '{}');
                abilitati = Array.isArray(cfg.abilitati) ? cfg.abilitati.map(x => String(x).toLowerCase()) : [];
            }
        } catch (_) { abilitati = []; }
        // Il contrassegno "eventi" sulla scheda utente vale QUANTO l'elenco condiviso:
        // e' l'unica strada che funziona per i ruoli "solo sondaggio", ed e' la stessa
        // regola applicata da /api/presenze. Se le due regole divergono si finisce con
        // utenti che possono scrivere ma non leggere.
        if (ruolo !== 'admin' && uDoc.data().eventi !== true && abilitati.indexOf(email) < 0) {
            res.status(403).json({ ok: false, msg: 'Non sei abilitato alla sezione Eventi.' });
            return;
        }

        // 4) filtro dell'evento (serve a entrambe le fonti). Con "tutti" non si filtra:
        //    serve alla schermata che raccoglie le iscrizioni di tutti gli eventi.
        const tutti = body.tutti === true;
        const filtro = tutti ? '' : chiave(body.evento || 'napoli');
        // Nel riepilogo NON si prende tutto il database: sullo stesso archivio scrivono
        // anche gli altri moduli del sito. Si tengono solo le iscrizioni degli eventi
        // che l'area riservata conosce, indicati da chi chiama.
        const filtriTutti = Array.isArray(body.filtri)
            ? body.filtri.map(chiave).filter(Boolean)
            : [];
        const idEvento = String(body.idEvento || '');
        const tieni = (pagina) => {
            const p = chiave(pagina);
            if (!tutti) return !filtro || p.indexOf(filtro) >= 0;
            if (!filtriTutti.length) return true;
            return filtriTutti.some(f => p.indexOf(f) >= 0);
        };

        // 4b) stati, note e cancellazioni stanno sul server: si leggono qui, cosi'
        //     l'area riservata riceve tutto con una sola richiesta e mostra l'elenco
        //     gia' completo, senza secondi giri e senza copie nel browser.
        const revDati = await revisione(admin.firestore());
        const presenze = {};
        const cancellate = {};
        if (idEvento) {
            try {
                const sp = await leggiPerEvento(admin.firestore(), 'presenze', idEvento, body.forza === true, revDati);
                sp.forEach(v => {
                    if (!v.idIscritto) return;
                    presenze[v.idIscritto] = {
                        stato: String(v.stato || ''), nota: String(v.nota || ''),
                        da: String(v.da || ''), daNome: String(v.daNome || ''),
                        quando: typeof v.quando === 'number' ? v.quando : 0
                    };
                });
            } catch (e) {
                console.error('Lettura presenze non riuscita:', String((e && e.message) || e).slice(0, 200));
            }
            try {
                const sc = await leggiPerEvento(admin.firestore(), 'iscrizioniCancellate', idEvento, body.forza === true, revDati);
                sc.forEach(v => { if (v.idIscritto) cancellate[v.idIscritto] = true; });
            } catch (e) {
                console.error('Lettura cancellate non riuscita:', String((e && e.message) || e).slice(0, 200));
            }
        }

        // 5) prima fonte: Firestore, dove arrivano le iscrizioni nuove dal form.
        //    Non dipende ne' dall'API Sheets ne' dalla condivisione del foglio.
        const daFirestore = [];
        let daMemoria = false;
        try {
            const lette = await leggiTutteLeIscrizioni(admin.firestore(), body.forza === true, revDati);
            daMemoria = lette.daMemoria;
            lette.righe.forEach(v => {
                const pag = String(v.pagina || '');
                if (!tieni(pag)) return;
                const em = String(v.email || '');
                daFirestore.push({
                    id: (em.toLowerCase() || (chiave(v.nome) + '.' + chiave(v.cognome))) + '|' + String(v.data || ''),
                    data: String(v.data || ''), pagina: pag,
                    nome: String(v.nome || ''), cognome: String(v.cognome || ''), email: em,
                    azienda: String(v.azienda || ''), ruolo: String(v.ruolo || ''),
                    telefono: String(v.telefono || ''), messaggio: String(v.messaggio || ''),
                    extra: (v.extra && typeof v.extra === 'object') ? v.extra : {}
                });
            });
        } catch (e) {
            console.error('Lettura iscrizioni da Firestore non riuscita:', String((e && e.message) || e).slice(0, 200));
        }

        // 6) seconda fonte: il foglio Google, per le iscrizioni raccolte prima del
        //    passaggio a Firestore. Se non e' configurato o non risponde si prosegue
        //    con le sole iscrizioni di Firestore, invece di non mostrare niente.
        const sheetId = process.env.EVENTI_SHEET_ID || '';
        if (!sheetId) {
            rispondi(res, daFirestore, ['firestore'], presenze, cancellate);
            return;
        }
        const range = process.env.EVENTI_SHEET_RANGE || 'A:K';
        const token = await tokenSheets(cred);
        const url = 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(sheetId)
            + '/values/' + encodeURIComponent(range) + '?majorDimension=ROWS';
        const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
        if (!r.ok) {
            const dett = await r.text().catch(() => '');
            console.error('Lettura foglio non riuscita:', r.status, dett.slice(0, 300));
            // il foglio e' ormai la fonte SECONDARIA: se non risponde si mostrano
            // comunque le iscrizioni gia' presenti su Firestore, segnalando il problema
            const msg = r.status === 403
                ? 'Il foglio non e condiviso con l\'account di servizio, oppure l\'API Google Sheets non e abilitata.'
                : (r.status === 404 ? 'Foglio non trovato: controlla EVENTI_SHEET_ID.' : 'Lettura del foglio non riuscita (' + r.status + ').');
            if (daFirestore.length) {
                rispondi(res, daFirestore, ['firestore'], presenze, cancellate, msg);
            } else {
                res.status(502).json({ ok: false, msg: msg });
            }
            return;
        }
        const dati = await r.json();
        const righe = Array.isArray(dati.values) ? dati.values : [];
        if (!righe.length) {
            rispondi(res, daFirestore, ['firestore'], presenze, cancellate);
            return;
        }

        // 7) mappa le colonne per NOME (non per posizione): il foglio puo cambiare ordine
        const intest = righe[0].map(chiave);
        const col = n => intest.indexOf(n);
        const iData = col('data'), iPagina = col('pagina'), iNome = col('nome'), iCognome = col('cognome');
        const iEmail = col('email'), iAzienda = col('azienda'), iRuolo = col('ruolo');
        const iTel = col('telefono'), iMsg = col('messaggio');
        const cella = (riga, i) => (i >= 0 && riga[i] != null) ? String(riga[i]).trim() : '';

        const iscrizioni = [];
        for (let i = 1; i < righe.length; i++) {
            const riga = righe[i];
            if (!riga || !riga.length) continue;
            const pagina = cella(riga, iPagina);
            if (!tieni(pagina)) continue;
            const em = cella(riga, iEmail);
            const nome = cella(riga, iNome), cognome = cella(riga, iCognome);
            if (!em && !nome && !cognome) continue;
            iscrizioni.push({
                // id stabile: serve all'app per agganciare presenze e note
                id: (em.toLowerCase() || (chiave(nome) + '.' + chiave(cognome))) + '|' + cella(riga, iData),
                data: cella(riga, iData),
                pagina: pagina,
                nome: nome,
                cognome: cognome,
                email: em,
                azienda: cella(riga, iAzienda),
                ruolo: cella(riga, iRuolo),
                telefono: cella(riga, iTel),
                messaggio: cella(riga, iMsg)
            });
        }

        // 8) unione delle due fonti: a parita' di identificativo vince Firestore,
        //    che e' la fonte aggiornata. Cosi le iscrizioni raccolte prima del
        //    passaggio restano visibili e non ci sono doppioni.
        const perId = {};
        iscrizioni.forEach(x => { perId[x.id] = x; });
        daFirestore.forEach(x => { perId[x.id] = x; });
        rispondi(res, Object.keys(perId).map(k => perId[k]), ['firestore', 'foglio'], presenze, cancellate);
    } catch (e) {
        const motivo = String((e && e.message) || 'errore').slice(0, 200);
        console.error('Iscrizioni: lettura non riuscita:', motivo);
        res.status(500).json({ ok: false, msg: motivo });
    }
};
