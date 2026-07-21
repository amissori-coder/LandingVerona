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
// stessa regola usata dal form e dall'importazione, per colpire la scheda giusta
function idIscrizione(idIscritto) {
    return String(idIscritto).replace(/[\/\\.#$\[\]]/g, '-').slice(0, 300) || 'senza-identificativo';
}
const STATI = ['', 'confermato', 'presente', 'assente'];

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

        const evento = testo(body.evento, 80);
        const idIscritto = testo(body.idIscritto, 300);
        if (!evento || !idIscritto) { res.status(400).json({ ok: false, msg: 'Evento o iscritto mancante.' }); return; }
        const azione = String(body.azione || 'imposta');

        if (azione === 'cancella') {
            if (!eAdmin) { res.status(403).json({ ok: false, msg: 'Solo l\'amministratore puo cancellare un\'iscrizione.' }); return; }
            const traccia = {
                evento: evento, idIscritto: idIscritto,
                da: email, daNome: testo(dati.nome, 120) || email, quando: Date.now()
            };
            await db.collection('iscrizioniCancellate').doc(idDoc(evento, idIscritto)).set(traccia);
            // La scheda vera e propria: il nome del documento si ricava dallo stesso
            // identificativo usato dal form ("email|data"), quindi si cancella SOLO
            // quella persona per quell'evento, non tutte le sue iscrizioni.
            const batch = db.batch();
            batch.delete(db.collection('iscrizioni').doc(idIscrizione(idIscritto)));
            batch.delete(db.collection('presenze').doc(idDoc(evento, idIscritto)));
            await batch.commit();
            res.status(200).json({ ok: true, cancellata: true });
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
