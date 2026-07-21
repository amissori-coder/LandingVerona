/* ============================================================
   Presenze, note e cancellazione di un'iscrizione
   ------------------------------------------------------------
   Stato ("confermato / presente / assente") e nota di ogni iscritto
   vivono sul server, nella collezione "presenze". Prima stavano in un
   archivio condiviso che il server riserva allo staff: chi era
   invitato alla sola sezione Eventi non riusciva a salvare nulla, e
   con un ruolo "solo sondaggio" nemmeno a leggerli.

   Qui la decisione la prende il servizio, con la stessa regola della
   lettura delle iscrizioni: amministratore, oppure utente presente
   nell'elenco degli abilitati agli Eventi. Le scritture avvengono con
   l'account di servizio, quindi non dipendono dalle regole di Firestore.

   Azioni:
     - "imposta"  : stato e/o nota di un iscritto (tutti gli abilitati)
     - "cancella" : rimuove un'iscrizione (SOLO amministratore)
   La cancellazione lascia una traccia in "iscrizioniCancellate", cosi'
   la persona non ricompare se la sua riga esiste ancora sul foglio.
   ============================================================ */

const admin = require('firebase-admin');

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

function testo(v, max) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 200);
}
// l'identificativo dell'iscritto contiene "@", "|" e barre: nel nome di un documento no
function idDoc(evento, idIscritto) {
    return (evento + '~' + idIscritto).replace(/[\/\\.#$\[\]]/g, '-').slice(0, 400);
}
// stessa normalizzazione usata nella lettura: serve a ricostruire l'identificativo
// di chi non ha email (nome.cognome), altrimenti la scheda cambierebbe identita'
function chiaveTesto(s) {
    return String(s == null ? '' : s).trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
// stessa regola usata dal form e dall'importazione, per colpire la scheda giusta
function idIscrizione(idIscritto) {
    return String(idIscritto).replace(/[\/\\.#$\[\]]/g, '-').slice(0, 300) || 'senza-identificativo';
}
const STATI = ['', 'confermato', 'presente', 'assente'];

/* Freno agli invii per utente: serve a contenere i danni se qualcuno usasse il
   proprio accesso per gonfiare il database con scritture ripetute. Il lavoro
   normale (segnare una tavolata di presenze) resta ampiamente sotto il limite. */
const RL_FINESTRA_MS = 60 * 1000;
const RL_MAX = 60;
const invii = new Map();
function troppiInvii(chi) {
    if (!chi) return false;
    const ora = Date.now();
    const elenco = (invii.get(chi) || []).filter(t => ora - t < RL_FINESTRA_MS);
    if (elenco.length >= RL_MAX) { invii.set(chi, elenco); return true; }
    elenco.push(ora);
    invii.set(chi, elenco);
    if (invii.size > 300) {
        for (const [k, v] of invii) {
            if (!v.length || ora - v[v.length - 1] > RL_FINESTRA_MS) invii.delete(k);
        }
    }
    return false;
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

        // 1) chi sta scrivendo
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

        // 2) abilitato agli Eventi: amministratore, contrassegno sulla scheda, o elenco condiviso
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

        if (troppiInvii(email)) { res.status(429).json({ ok: false, msg: 'Troppe modifiche ravvicinate: attendi qualche istante.' }); return; }

        const evento = testo(body.evento, 80);
        const azione = String(body.azione || 'imposta');
        // una sola persona o piu' insieme: la cancellazione accetta entrambe le forme
        const elencoId = Array.isArray(body.idIscritti)
            ? body.idIscritti.map(x => testo(x, 300)).filter(Boolean)
            : [];
        const idIscritto = testo(body.idIscritto, 300);
        if (!evento) { res.status(400).json({ ok: false, msg: 'Evento mancante.' }); return; }
        if (!idIscritto && !elencoId.length) { res.status(400).json({ ok: false, msg: 'Nessun iscritto indicato.' }); return; }

        if (azione === 'cancella') {
            if (!eAdmin) { res.status(403).json({ ok: false, msg: 'Solo l\'amministratore puo cancellare un\'iscrizione.' }); return; }
            const daCancellare = elencoId.length ? elencoId : [idIscritto];
            if (daCancellare.length > 300) { res.status(400).json({ ok: false, msg: 'Troppe iscrizioni in una volta sola.' }); return; }
            const firma = { da: email, daNome: testo(dati.nome, 120) || email, quando: Date.now() };
            // Traccia PRIMA, cancellazione poi: se qualcosa va storto a meta' strada la
            // persona resta comunque fuori dall'elenco, invece di ricomparire dal foglio.
            let batch = db.batch(), nel = 0;
            for (const id of daCancellare) {
                batch.set(db.collection('iscrizioniCancellate').doc(idDoc(evento, id)), { evento: evento, idIscritto: id, ...firma });
                nel++;
                if (nel >= 400) { await batch.commit(); batch = db.batch(); nel = 0; }
            }
            if (nel) await batch.commit();
            // Dal RIEPILOGO ("tutti") si toglie solo dall'elenco riepilogativo: la
            // scheda e la sua presenza restano intatte nel singolo evento. La traccia
            // scritta sopra vale infatti solo per l'elenco "tutti".
            if (evento === 'tutti') {
                res.status(200).json({ ok: true, cancellate: daCancellare.length, soloRiepilogo: true });
                return;
            }
            // La scheda vera e propria: il nome del documento si ricava dallo stesso
            // identificativo usato dal form ("email|data"), quindi si cancella SOLO
            // quella persona per quell'evento, non tutte le sue iscrizioni.
            batch = db.batch(); nel = 0;
            for (const id of daCancellare) {
                batch.delete(db.collection('iscrizioni').doc(idIscrizione(id)));
                batch.delete(db.collection('presenze').doc(idDoc(evento, id)));
                nel += 2;
                if (nel >= 400) { await batch.commit(); batch = db.batch(); nel = 0; }
            }
            if (nel) await batch.commit();
            res.status(200).json({ ok: true, cancellate: daCancellare.length });
            return;
        }

        if (azione === 'modifica') {
            if (!eAdmin) { res.status(403).json({ ok: false, msg: 'Solo l\'amministratore puo modificare un\'iscrizione.' }); return; }
            const c = body.campi || {};
            const rifVecchio = db.collection('iscrizioni').doc(idIscrizione(idIscritto));
            const snap = await rifVecchio.get();
            // se la scheda esisteva solo sul foglio, la modifica la crea su Firestore
            const attuale = (snap.exists && snap.data()) || {};
            const nuovo = {
                data: c.data !== undefined ? testo(c.data, 40) : String(attuale.data || idIscritto.split('|')[1] || ''),
                pagina: String(attuale.pagina || testo(body.pagina, 200) || ''),
                nome: c.nome !== undefined ? testo(c.nome, 120) : String(attuale.nome || ''),
                cognome: c.cognome !== undefined ? testo(c.cognome, 120) : String(attuale.cognome || ''),
                email: c.email !== undefined ? testo(c.email, 200).toLowerCase() : String(attuale.email || ''),
                azienda: c.azienda !== undefined ? testo(c.azienda, 200) : String(attuale.azienda || ''),
                ruolo: c.ruolo !== undefined ? testo(c.ruolo, 200) : String(attuale.ruolo || ''),
                telefono: c.telefono !== undefined ? testo(c.telefono, 60) : String(attuale.telefono || ''),
                messaggio: c.messaggio !== undefined ? testo(c.messaggio, 2000) : String(attuale.messaggio || ''),
                modificato: { da: email, daNome: testo(dati.nome, 120) || email, quando: Date.now() }
            };
            if (nuovo.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(nuovo.email)) {
                res.status(400).json({ ok: false, msg: 'Indirizzo email non valido.' }); return;
            }
            if (!nuovo.email && !nuovo.nome && !nuovo.cognome) {
                res.status(400).json({ ok: false, msg: 'Servono almeno un nome o un indirizzo email.' }); return;
            }
            if (!nuovo.pagina) nuovo.pagina = String(attuale.pagina || '');
            // L'identificativo nasce da email e data: se cambiano, la scheda TRASLOCA su
            // un nuovo documento e con lei lo stato e la nota gia' registrati.
            const idNuovo = (nuovo.email || (chiaveTesto(nuovo.nome) + '.' + chiaveTesto(nuovo.cognome))) + '|' + nuovo.data;
            const rifNuovo = db.collection('iscrizioni').doc(idIscrizione(idNuovo));
            await rifNuovo.set(nuovo, { merge: true });
            if (idIscrizione(idNuovo) !== idIscrizione(idIscritto)) {
                const pVecchia = await db.collection('presenze').doc(idDoc(evento, idIscritto)).get();
                if (pVecchia.exists) {
                    const pd = pVecchia.data() || {};
                    await db.collection('presenze').doc(idDoc(evento, idNuovo))
                        .set({ ...pd, idIscritto: idNuovo }, { merge: true });
                }
                const b = db.batch();
                b.delete(rifVecchio);
                b.delete(db.collection('presenze').doc(idDoc(evento, idIscritto)));
                await b.commit();
            }
            res.status(200).json({ ok: true, id: idNuovo, iscrizione: { id: idNuovo, ...nuovo, modificato: undefined } });
            return;
        }

        // 3) stato e nota
        const patch = {
            evento: evento, idIscritto: idIscritto,
            da: email, daNome: testo(dati.nome, 120) || email, quando: Date.now()
        };
        if (Object.prototype.hasOwnProperty.call(body, 'stato')) {
            const st = testo(body.stato, 20);
            if (STATI.indexOf(st) < 0) { res.status(400).json({ ok: false, msg: 'Stato non valido.' }); return; }
            patch.stato = st;
        }
        if (Object.prototype.hasOwnProperty.call(body, 'nota')) patch.nota = testo(body.nota, 500);
        if (patch.stato === undefined && patch.nota === undefined) {
            res.status(400).json({ ok: false, msg: 'Niente da salvare.' });
            return;
        }
        await db.collection('presenze').doc(idDoc(evento, idIscritto)).set(patch, { merge: true });
        // si risponde con cio' che risulta ORA sul server, non con la sola modifica:
        // altrimenti chi ha salvato la sola nota si vedrebbe azzerare lo stato
        const dopo = await db.collection('presenze').doc(idDoc(evento, idIscritto)).get();
        const v = (dopo.exists && dopo.data()) || patch;
        res.status(200).json({
            ok: true,
            presenza: {
                stato: String(v.stato || ''), nota: String(v.nota || ''),
                da: String(v.da || ''), daNome: String(v.daNome || ''),
                quando: typeof v.quando === 'number' ? v.quando : Date.now()
            }
        });
    } catch (e) {
        const motivo = String((e && e.message) || 'errore').slice(0, 200);
        console.error('Presenze: operazione non riuscita:', motivo);
        res.status(500).json({ ok: false, msg: motivo });
    }
};
