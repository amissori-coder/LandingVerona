/* ============================================================
   Aziende da invitare a un evento, e invio dell'invito via PEC
   ------------------------------------------------------------
   L'elenco delle aziende (ragione sociale + PEC) si carica da un
   file CSV nella sezione Eventi dell'area riservata e vive nella
   collezione "aziendePec", una scheda per azienda per evento.

   L'invito parte come PEC VERA, dalla casella PEC dello studio
   attraverso l'SMTP del gestore (lib/pec.js): Brevo qui non
   c'entra, perche' non e' un gestore accreditato e quello che
   passa di li' non e' certificato. Se le credenziali PEC non
   sono configurate, l'invio si rifiuta di partire e lo dice.

   Azioni:
     - "elenco"    : le aziende di un evento (chi vede gli Eventi)
     - "importa"   : carica un CSV (amministratore e partner)
     - "aggiungi"  : una scheda a mano
     - "modifica"  : corregge una scheda
     - "cancella"  : toglie una o piu' schede
     - "segna"     : stato a mano (esclusa, consegnata...)
     - "invia"     : spedisce le PEC di un LOTTO di aziende
     - "configurazione" : dice se la PEC e' pronta e da quale casella

   L'invio va a lotti perche' la funzione ha 60 secondi e ogni PEC
   costa un giro di SMTP: l'area riservata richiama il servizio
   finche' l'elenco non e' finito, e ogni scheda porta con se' il
   proprio esito, cosi' una ripresa non rispedisce a chi ha gia'
   ricevuto.
   ============================================================ */

const admin = require('firebase-admin');
const PEC = require('../lib/pec');

function leggiServiceAccount() {
    const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT mancante');
    let testoCred = raw;
    if (testoCred[0] !== '{') {
        try {
            const dec = Buffer.from(testoCred, 'base64').toString('utf8').trim();
            if (dec[0] === '{') testoCred = dec;
        } catch (_) { /* lo segnala JSON.parse */ }
    }
    let cred;
    try { cred = JSON.parse(testoCred); }
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

function testo(v, max) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 200);
}
function chiave(s) {
    return String(s == null ? '' : s).trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function pecValida(e) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || ''));
}
/* Identificativo della scheda: evento + indirizzo PEC. Cosi' ricaricare lo
   stesso elenco NON crea doppioni e non azzera gli invii gia' fatti. */
function idDoc(evento, pec) {
    return (evento + '~' + String(pec || '').toLowerCase()).replace(/[\/\\.#$\[\]]/g, '-').slice(0, 400);
}

const STATI = ['da-invitare', 'inviata', 'errore', 'esclusa', 'consegnata', 'non-consegnata'];
const MAX_AZIENDE_EVENTO = 5000;

/* Equity o founding partner: stessa regola di api/presenze.js (conta il RUOLO
   DI ACCESSO, non la spunta in anagrafica). In caso di dubbio si risponde no. */
const RE_PARTNER = /equity|found/i;
async function ePartner(db, ruolo) {
    if (!ruolo) return false;
    if (RE_PARTNER.test(ruolo)) return true;
    try {
        const rd = await db.collection('archivio').doc('ruoli').get();
        if (!rd.exists || typeof rd.data().json !== 'string') return false;
        const lista = JSON.parse(rd.data().json) || [];
        const r = (Array.isArray(lista) ? lista : []).find(x => x && x.id === ruolo);
        return !!(r && RE_PARTNER.test(String(r.nome || '')));
    } catch (_) { return false; }
}

/* Lettore CSV completo (virgolette, separatori dentro i campi, a capo nel
   testo). Riconosce da solo virgola e punto e virgola: gli elenchi camerali
   scaricati in Italia usano quasi sempre il punto e virgola. */
function separatore(s) {
    const prima = String(s || '').split('\n')[0] || '';
    const pv = (prima.match(/;/g) || []).length;
    const vg = (prima.match(/,/g) || []).length;
    return pv > vg ? ';' : ',';
}
function leggiCsv(testoCsv) {
    const sep = separatore(testoCsv);
    const righe = [];
    let riga = [], campo = '', dentroVirgolette = false;
    const s = String(testoCsv || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (dentroVirgolette) {
            if (c === '"') {
                if (s[i + 1] === '"') { campo += '"'; i++; }
                else dentroVirgolette = false;
            } else campo += c;
        } else if (c === '"') {
            dentroVirgolette = true;
        } else if (c === sep) {
            riga.push(campo); campo = '';
        } else if (c === '\n') {
            riga.push(campo); campo = '';
            if (riga.some(x => x !== '')) righe.push(riga);
            riga = [];
        } else campo += c;
    }
    riga.push(campo);
    if (riga.some(x => x !== '')) righe.push(riga);
    return righe;
}

/* Intestazioni riconosciute. Gli elenchi arrivano dai posti piu' diversi
   (visure, gestionali, fogli fatti a mano): si accettano le varianti piu'
   comuni, e tutte le colonne NON riconosciute restano lo stesso nella
   scheda, cosi' non si perde niente di quello che e' stato caricato. */
const ALIAS = {
    'ragione sociale': 'ragioneSociale', 'ragione_sociale': 'ragioneSociale', 'ragionesociale': 'ragioneSociale',
    'denominazione': 'ragioneSociale', 'azienda': 'ragioneSociale', 'societa': 'ragioneSociale',
    'impresa': 'ragioneSociale', 'nome azienda': 'ragioneSociale', 'nome impresa': 'ragioneSociale', 'nome': 'ragioneSociale',
    'pec': 'pec', 'indirizzo pec': 'pec', 'email pec': 'pec', 'e-mail pec': 'pec', 'pec impresa': 'pec',
    'posta elettronica certificata': 'pec', 'pec_impresa': 'pec', 'indirizzo_pec': 'pec', 'domicilio digitale': 'pec',
    'partita iva': 'piva', 'partita_iva': 'piva', 'piva': 'piva', 'p.iva': 'piva', 'p iva': 'piva', 'vat': 'piva',
    'codice fiscale': 'cf', 'codice_fiscale': 'cf', 'cf': 'cf', 'cod. fiscale': 'cf',
    'referente': 'referente', 'contatto': 'referente', 'nome referente': 'referente', 'persona di riferimento': 'referente',
    'citta': 'citta', 'comune': 'citta', 'sede': 'citta', 'comune sede': 'citta',
    'provincia': 'provincia', 'prov': 'provincia', 'sigla provincia': 'provincia',
    'telefono': 'telefono', 'tel': 'telefono', 'cellulare': 'telefono',
    'email': 'email', 'e-mail': 'email', 'mail': 'email', 'email ordinaria': 'email',
    'note': 'note', 'nota': 'note', 'settore': 'settore', 'ateco': 'settore', 'attivita': 'settore'
};

/* Freno agli invii: una PEC si paga e non si richiama indietro. Il conteggio
   sta su Firestore (non in memoria) perche' ogni chiamata puo' finire su una
   macchina diversa, e una transazione regge anche le richieste in parallelo. */
const ORA_MS = 60 * 60 * 1000;
async function consumaGettoni(db, chi, quanti) {
    const rif = db.collection('pec_throttle').doc(chi);
    return db.runTransaction(async tx => {
        const snap = await tx.get(rif);
        const ora = Date.now();
        const d = snap.exists ? (snap.data() || {}) : {};
        const stessaFinestra = (ora - (d.inizioFinestra || 0)) < ORA_MS;
        const fatti = stessaFinestra ? (d.conteggio || 0) : 0;
        const disponibili = Math.max(0, PEC.MAX_ORA - fatti);
        const concessi = Math.min(quanti, disponibili);
        if (concessi > 0) {
            tx.set(rif, {
                inizioFinestra: stessaFinestra ? d.inizioFinestra : ora,
                conteggio: fatti + concessi, ultimo: ora
            }, { merge: true });
        }
        return { concessi: concessi, disponibili: disponibili };
    });
}

/* La scheda come la vede l'area riservata: fuori restano solo i campi
   che servono a video, non l'intero documento. */
function inChiaro(id, d) {
    d = d || {};
    return {
        id: id,
        ragioneSociale: d.ragioneSociale || '', pec: d.pec || '', piva: d.piva || '', cf: d.cf || '',
        referente: d.referente || '', citta: d.citta || '', provincia: d.provincia || '',
        telefono: d.telefono || '', email: d.email || '', settore: d.settore || '', note: d.note || '',
        stato: d.stato || 'da-invitare', extra: d.extra || {},
        invio: d.invio || null, errore: d.errore || null, aggiunta: d.aggiunta || null
    };
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false, msg: 'Metodo non consentito' }); return; }

    try {
        const cred = leggiServiceAccount();
        initAdmin(cred);
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

        // 1) chi sta chiamando
        const idToken = String(body.idToken || '');
        if (!idToken) { res.status(401).json({ ok: false, msg: 'Autenticazione mancante' }); return; }
        let decoded;
        try { decoded = await admin.auth().verifyIdToken(idToken); }
        catch (e) { res.status(401).json({ ok: false, msg: 'Sessione non valida: rientra e riprova.' }); return; }
        const email = String(decoded.email || '').toLowerCase();
        if (!email) { res.status(401).json({ ok: false, msg: 'Utente non valido' }); return; }

        const db = admin.firestore();
        const uDoc = await db.collection('utenti').doc(email).get();
        if (!uDoc.exists || uDoc.data().attivo === false) { res.status(403).json({ ok: false, msg: 'Utenza non abilitata.' }); return; }
        const dati = uDoc.data() || {};
        const ruolo = String(dati.ruolo || '');
        const eAdmin = ruolo === 'admin';

        // 2) abilitato agli Eventi: stessa regola di presenze.js
        let abilitati = [];
        try {
            const cfgDoc = await db.collection('archivio').doc('eventiConfig').get();
            if (cfgDoc.exists) {
                const cfg = JSON.parse(cfgDoc.data().json || '{}');
                abilitati = Array.isArray(cfg.abilitati) ? cfg.abilitati.map(x => String(x).toLowerCase()) : [];
            }
        } catch (_) { abilitati = []; }
        if (!eAdmin && dati.eventi !== true && abilitati.indexOf(email) < 0) {
            res.status(403).json({ ok: false, msg: 'Non sei abilitato alla sezione Eventi.' });
            return;
        }

        const azione = String(body.azione || 'elenco');
        const evento = testo(body.evento, 80);

        /* Chi puo' TOCCARE l'elenco e spedire: amministratore, equity e founding
           partner. Consultarlo lo puo' chiunque veda la sezione Eventi. */
        let puoGestire = eAdmin;
        if (!puoGestire && azione !== 'elenco' && azione !== 'configurazione') puoGestire = await ePartner(db, ruolo);
        const negato = () => res.status(403).json({ ok: false, msg: 'Possono gestire le aziende da invitare l\'amministratore, gli equity partner e i founding partner.' });

        if (azione === 'configurazione') {
            const c = PEC.configurazione();
            const pronta = PEC.configurata();
            res.status(200).json({
                ok: true, pronta: pronta,
                casella: pronta ? c.mittente : '', host: pronta ? c.host : '',
                rispondiA: c.rispondiA || '', maxLotto: PEC.MAX_LOTTO, maxOra: PEC.MAX_ORA
            });
            return;
        }

        if (!evento) { res.status(400).json({ ok: false, msg: 'Evento mancante.' }); return; }

        if (azione === 'elenco') {
            const snap = await db.collection('aziendePec').where('evento', '==', evento).limit(MAX_AZIENDE_EVENTO).get();
            const aziende = [];
            snap.forEach(d => aziende.push(inChiaro(d.id, d.data())));
            aziende.sort((a, b) => String(a.ragioneSociale).localeCompare(String(b.ragioneSociale), 'it'));
            res.status(200).json({ ok: true, aziende: aziende, aggiornato: Date.now(), pecPronta: PEC.configurata() });
            return;
        }

        if (azione === 'importa') {
            if (!puoGestire) { negato(); return; }
            const righe = leggiCsv(typeof body.csv === 'string' ? body.csv : '');
            if (righe.length < 2) { res.status(400).json({ ok: false, msg: 'Il file non contiene righe da importare.' }); return; }

            const intest = righe[0].map(h => chiave(h).replace(/\s+/g, ' '));
            const campoDi = {};
            const presi = {};
            intest.forEach((h, i) => {
                const campo = ALIAS[h];
                // la prima colonna che vale per un campo vince: se il file ha sia
                // "Denominazione" sia "Nome", la ragione sociale resta una sola
                if (campo && !presi[campo]) { campoDi[i] = campo; presi[campo] = true; }
            });
            const col = n => { for (const i in campoDi) { if (campoDi[i] === n) return +i; } return -1; };
            const iPec = col('pec'), iRag = col('ragioneSociale');
            if (iPec < 0) {
                res.status(400).json({ ok: false, msg: 'Non trovo la colonna della PEC: chiamala "PEC" (o "Indirizzo PEC") nella prima riga del file.' });
                return;
            }
            const cella = (riga, i) => (i >= 0 && riga[i] != null) ? testo(riga[i], 300) : '';

            // quante ce ne sono gia': l'elenco non deve crescere all'infinito
            let gia = 0;
            try { gia = (await db.collection('aziendePec').where('evento', '==', evento).count().get()).data().count || 0; }
            catch (_) { gia = 0; }

            let importate = 0, senzaPec = 0, doppie = 0, oltreIlLimite = 0;
            const viste = {};
            let batch = db.batch(), nel = 0;
            const nuoviId = [];
            for (let r = 1; r < righe.length; r++) {
                const riga = righe[r];
                if (!riga || !riga.length) continue;
                const pec = cella(riga, iPec).toLowerCase();
                if (!pecValida(pec)) { senzaPec++; continue; }
                if (viste[pec]) { doppie++; continue; }
                viste[pec] = true;
                if (gia + importate >= MAX_AZIENDE_EVENTO) { oltreIlLimite++; continue; }

                // colonne non riconosciute: restano con la loro intestazione
                const extra = {};
                for (let c = 0; c < riga.length; c++) {
                    if (campoDi[c]) continue;
                    const et = String(righe[0][c] == null ? '' : righe[0][c]).trim();
                    const val = cella(riga, c);
                    if (!et || !val) continue;
                    extra[et.slice(0, 60)] = val.slice(0, 300);
                }
                const id = idDoc(evento, pec);
                nuoviId.push(id);
                /* merge: ricaricare lo stesso elenco aggiorna i dati anagrafici
                   e NON tocca stato ed esito dell'invio gia' fatto. Lo stato
                   iniziale si scrive solo alla creazione della scheda. */
                batch.set(db.collection('aziendePec').doc(id), {
                    evento: evento, pec: pec,
                    ragioneSociale: cella(riga, iRag) || pec.split('@')[0],
                    piva: cella(riga, col('piva')), cf: cella(riga, col('cf')),
                    referente: cella(riga, col('referente')), citta: cella(riga, col('citta')),
                    provincia: cella(riga, col('provincia')).slice(0, 4), telefono: cella(riga, col('telefono')),
                    email: cella(riga, col('email')).toLowerCase(), settore: cella(riga, col('settore')),
                    note: cella(riga, col('note')), extra: extra,
                    aggiornata: { quando: Date.now(), da: email }
                }, { merge: true });
                nel++; importate++;
                if (nel >= 300) { await batch.commit(); batch = db.batch(); nel = 0; }
            }
            if (nel) await batch.commit();

            /* Lo stato iniziale va messo SOLO alle schede nuove: si rileggono e
               si completa chi non ce l'ha, invece di sovrascrivere gli invii. */
            let nuove = 0;
            for (let i = 0; i < nuoviId.length; i += 200) {
                const fetta = nuoviId.slice(i, i + 200).map(x => db.collection('aziendePec').doc(x));
                const doc = await db.getAll.apply(db, fetta);
                let b = db.batch(), n = 0;
                doc.forEach(d => {
                    if (!d.exists) return;
                    const v = d.data() || {};
                    if (v.stato) return;
                    b.set(d.ref, { stato: 'da-invitare', aggiunta: { quando: Date.now(), da: email } }, { merge: true });
                    n++; nuove++;
                });
                if (n) await b.commit();
            }

            res.status(200).json({
                ok: true, lette: righe.length - 1, importate: importate, nuove: nuove,
                aggiornate: importate - nuove, senzaPec: senzaPec, doppie: doppie, oltreIlLimite: oltreIlLimite
            });
            return;
        }

        if (azione === 'aggiungi' || azione === 'modifica') {
            if (!puoGestire) { negato(); return; }
            const a = (body.azienda && typeof body.azienda === 'object') ? body.azienda : {};
            const pec = testo(a.pec, 200).toLowerCase();
            if (!pecValida(pec)) { res.status(400).json({ ok: false, msg: 'Indirizzo PEC non valido.' }); return; }
            const rag = testo(a.ragioneSociale, 200);
            if (!rag) { res.status(400).json({ ok: false, msg: 'Ragione sociale mancante.' }); return; }
            const campi = {
                evento: evento, pec: pec, ragioneSociale: rag,
                piva: testo(a.piva, 30), cf: testo(a.cf, 30), referente: testo(a.referente, 120),
                citta: testo(a.citta, 80), provincia: testo(a.provincia, 4), telefono: testo(a.telefono, 40),
                email: testo(a.email, 200).toLowerCase(), settore: testo(a.settore, 120), note: testo(a.note, 500),
                aggiornata: { quando: Date.now(), da: email }
            };
            const id = idDoc(evento, pec);
            const rif = db.collection('aziendePec').doc(id);
            const prima = await rif.get();
            if (!prima.exists) {
                campi.stato = 'da-invitare';
                campi.aggiunta = { quando: Date.now(), da: email };
            }
            /* Cambiare la PEC vuol dire cambiare identificativo: la scheda
               vecchia va tolta, altrimenti resterebbe un doppione con
               l'indirizzo sbagliato ancora da invitare. Si porta con se' lo
               stato, cosi' una correzione di battitura non fa ripartire una
               PEC gia' spedita. */
            const idVecchio = testo(body.id, 400);
            if (azione === 'modifica' && idVecchio && idVecchio !== id) {
                const vecchia = await db.collection('aziendePec').doc(idVecchio).get();
                if (vecchia.exists) {
                    const v = vecchia.data() || {};
                    if (!prima.exists && v.stato) {
                        campi.stato = v.stato;
                        if (v.invio) campi.invio = v.invio;
                        if (v.errore) campi.errore = v.errore;
                        if (v.aggiunta) campi.aggiunta = v.aggiunta;
                    }
                    await vecchia.ref.delete().catch(() => { });
                }
            }
            await rif.set(campi, { merge: true });
            const dopo = await rif.get();
            res.status(200).json({ ok: true, azienda: inChiaro(id, dopo.data()) });
            return;
        }

        if (azione === 'cancella') {
            if (!puoGestire) { negato(); return; }
            const ids = (Array.isArray(body.ids) ? body.ids : []).map(x => testo(x, 400)).filter(Boolean);
            if (!ids.length) { res.status(400).json({ ok: false, msg: 'Nessuna azienda indicata.' }); return; }
            if (ids.length > 500) { res.status(400).json({ ok: false, msg: 'Troppe aziende in una volta sola.' }); return; }
            let batch = db.batch(), n = 0;
            for (const id of ids) {
                batch.delete(db.collection('aziendePec').doc(id));
                n++;
                if (n >= 300) { await batch.commit(); batch = db.batch(); n = 0; }
            }
            if (n) await batch.commit();
            res.status(200).json({ ok: true, tolte: ids.length });
            return;
        }

        if (azione === 'segna') {
            if (!puoGestire) { negato(); return; }
            const ids = (Array.isArray(body.ids) ? body.ids : []).map(x => testo(x, 400)).filter(Boolean).slice(0, 500);
            const stato = testo(body.stato, 30);
            if (!ids.length) { res.status(400).json({ ok: false, msg: 'Nessuna azienda indicata.' }); return; }
            if (STATI.indexOf(stato) < 0) { res.status(400).json({ ok: false, msg: 'Stato non riconosciuto.' }); return; }
            let batch = db.batch(), n = 0;
            for (const id of ids) {
                batch.set(db.collection('aziendePec').doc(id), { stato: stato, aggiornata: { quando: Date.now(), da: email } }, { merge: true });
                n++;
                if (n >= 300) { await batch.commit(); batch = db.batch(); n = 0; }
            }
            if (n) await batch.commit();
            res.status(200).json({ ok: true, segnate: ids.length });
            return;
        }

        if (azione === 'invia') {
            if (!puoGestire) { negato(); return; }
            if (!PEC.configurata()) {
                res.status(400).json({
                    ok: false, nonConfigurata: true,
                    msg: 'La casella PEC non e ancora configurata sul servizio: senza quelle credenziali l\'invito non sarebbe una PEC. Vanno impostate le variabili PEC_SMTP_USER, PEC_SMTP_PASS e PEC_FROM_EMAIL su Vercel.'
                });
                return;
            }
            const ids = (Array.isArray(body.ids) ? body.ids : []).map(x => testo(x, 400)).filter(Boolean).slice(0, PEC.MAX_LOTTO);
            if (!ids.length) { res.status(400).json({ ok: false, msg: 'Nessuna azienda indicata.' }); return; }
            const mail = (body.mail && typeof body.mail === 'object') ? body.mail : {};
            const oggetto = testo(mail.oggetto, 250);
            const html = String(mail.html || '').slice(0, 300000);
            if (!oggetto) { res.status(400).json({ ok: false, msg: 'Oggetto della PEC mancante.' }); return; }
            if (!html.trim()) { res.status(400).json({ ok: false, msg: 'Testo della PEC mancante.' }); return; }
            const forza = body.forza === true;

            // gettoni: si prenotano PRIMA, per non spedire oltre il tetto orario
            let gettoni;
            try { gettoni = await consumaGettoni(db, email, ids.length); }
            catch (_) { gettoni = { concessi: ids.length, disponibili: ids.length }; }
            if (!gettoni.concessi) {
                res.status(429).json({ ok: false, msg: 'Hai raggiunto il tetto di ' + PEC.MAX_ORA + ' PEC in un\'ora: riprendi fra un po\', l\'elenco si ricorda a che punto era.' });
                return;
            }
            const daFare = ids.slice(0, gettoni.concessi);
            const tettoRaggiunto = gettoni.concessi < ids.length;

            const trans = PEC.trasporto();
            const partite = Date.now();
            let inviate = 0, giaInviate = 0, mancanti = 0;
            const falliti = [];
            const esiti = {};
            for (const id of daFare) {
                // oltre i 45 secondi si smette: il resto lo fa la chiamata dopo
                if (Date.now() - partite > 45000) break;
                const rif = db.collection('aziendePec').doc(id);
                const snap = await rif.get();
                if (!snap.exists) { mancanti++; continue; }
                const a = snap.data() || {};
                if (String(a.evento || '') !== evento) { mancanti++; continue; }
                if (!pecValida(a.pec)) { mancanti++; continue; }
                if (a.stato === 'esclusa') { giaInviate++; continue; }
                if (a.invio && a.invio.quando && !forza) { giaInviate++; continue; }
                try {
                    const info = await trans.sendMail(PEC.messaggio(a, { oggetto: oggetto, html: html }));
                    const invio = {
                        quando: Date.now(), da: email, oggetto: PEC.applica(oggetto, a).slice(0, 250),
                        messageId: String((info && info.messageId) || '').slice(0, 300),
                        risposta: String((info && info.response) || '').slice(0, 200)
                    };
                    await rif.set({ stato: 'inviata', invio: invio, errore: null }, { merge: true });
                    esiti[id] = { stato: 'inviata', invio: invio };
                    inviate++;
                } catch (e) {
                    const motivo = String((e && e.message) || 'errore del server di posta').slice(0, 200);
                    const errore = { quando: Date.now(), da: email, motivo: motivo };
                    await rif.set({ stato: 'errore', errore: errore }, { merge: true });
                    esiti[id] = { stato: 'errore', errore: errore };
                    falliti.push({ id: id, pec: a.pec || '', motivo: motivo });
                }
            }
            try { trans.close(); } catch (_) { /* niente da chiudere */ }

            /* Gettoni prenotati e non usati (tempo scaduto, schede saltate):
               si restituiscono, altrimenti il tetto orario si consumerebbe
               anche per le PEC che non sono mai partite. */
            const nonUsati = daFare.length - inviate - falliti.length;
            if (nonUsati > 0) {
                try {
                    await db.collection('pec_throttle').doc(email)
                        .set({ conteggio: admin.firestore.FieldValue.increment(-nonUsati) }, { merge: true });
                } catch (_) { /* il tetto si riazzera comunque a fine finestra */ }
            }

            res.status(200).json({
                ok: true, inviate: inviate, giaInviate: giaInviate, mancanti: mancanti,
                falliti: falliti.slice(0, 50), esiti: esiti,
                tettoRaggiunto: tettoRaggiunto, maxLotto: PEC.MAX_LOTTO
            });
            return;
        }

        res.status(400).json({ ok: false, msg: 'Azione non riconosciuta.' });
    } catch (e) {
        const motivo = String((e && e.message) || 'errore').slice(0, 200);
        console.error('Aziende PEC:', motivo);
        res.status(500).json({ ok: false, msg: 'Operazione non riuscita: ' + motivo });
    }
};
