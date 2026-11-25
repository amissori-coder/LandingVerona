/* ============================================================
   NUOVI ACCESSI, ABILITATI DA CHI NON E' AMMINISTRATORE
   ------------------------------------------------------------
   Nell'area riservata gli utenti li gestisce l'amministratore
   (sezione Utenti), e le regole Firestore lasciano scrivere la
   raccolta "utenti" solo a lui. Ma i revisori che lavorano sugli
   incarichi sono tanti, e chi li conosce non e' l'amministratore:
   sono i RESPONSABILI DELLA QUALITA', gli EQUITY PARTNER e i
   FOUNDING PARTNER. A loro e' concesso un potere piccolo e preciso
   (sezione "Nuovi accessi" dell'area):

     - AGGIUNGERE un utente che ancora non c'e';
     - SOLO con uno di tre ruoli: Revisore, Coordinatore
       territoriale, Vice coordinatore territoriale.

   Nient'altro: non cambiano il ruolo di chi c'e' gia', non
   disabilitano, non eliminano, non creano amministratori. Un
   indirizzo che ha gia' una scheda (anche disabilitata) viene
   rifiutato: riabilitare qualcuno che l'amministratore ha tolto
   sarebbe scavalcarlo.

   Siccome le regole Firestore non lo permettono al browser, la
   scheda la scrive questo servizio, che decide DAVVERO: quello
   che mostra l'app (Auth.qualificaPerAbilitare in app.js) serve
   solo a non far vedere comandi inutili.

   CHI E' "RESPONSABILE DELLA QUALITA'", "EQUITY", "FOUNDING".
   Come nell'app:
     - equity partner e founding partner sono qualifiche della
       SCHEDA in Aderenti Revilaw (archivio/persone), agganciata
       all'utente per email; la scheda deve essere attiva;
     - responsabile della qualita' e' chi ha il ruolo di accesso
       'qualita', oppure la qualifica "responsabile qualita'" sulla
       scheda.
   Amministratore, vice e titolare possono sempre (hanno gia' la
   sezione Utenti). Un COLLABORATORE no: lavora a nome di un altro
   utente, ma i poteri sugli utenti non si delegano.

   Ogni scheda creata porta chi l'ha creata (creatoDa) e con quale
   qualifica (delega): la traccia resta sul dato, oltre che nel
   Registro modifiche dell'area.
   ============================================================ */
'use strict';

const { eRuoloAdmin } = require('./utente-effettivo');

// il titolare dello studio: come in area-riservata/app.js e in lib/utente-effettivo.js
const PROPRIETARIO = 'a.missori@emvas.tax';
// i soli ruoli che si possono assegnare da "Nuovi accessi" (lo stesso elenco di RUOLI_DELEGABILI in app.js)
const RUOLI_DELEGABILI = ['revisore', 'coordinatore', 'vicecoordinatore'];
const NOMI_RUOLI = { revisore: 'Revisore', coordinatore: 'Coordinatore territoriale', vicecoordinatore: 'Vice coordinatore territoriale' };
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;
// quanti accessi puo' abilitare una persona in un giorno: un freno a un errore o a un abuso, non un limite di lavoro
const MAX_AL_GIORNO = 60;
const GIORNO_MS = 24 * 3600 * 1000;
/* La qualifica di chi ha gia' i poteri sugli utenti (amministratore, vice, titolare).
   E' un'etichetta di questo file, non un ruolo: chi e' amministratore lo dice sempre
   e solo eRuoloAdmin(), che vale anche per il vice. */
const DA_AMMINISTRATORE = 'amministratore';

const pulito = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/* La scheda in Aderenti Revilaw di un indirizzo: attiva e non eliminata. Con
   piu' schede per lo stesso indirizzo vale la piu' "qualificata". */
async function schedaDi(db, email) {
    let persone = [];
    try {
        const s = await db.collection('archivio').doc('persone').get();
        const j = s.exists ? (s.data() || {}).json : null;
        const l = typeof j === 'string' ? JSON.parse(j) : j;
        persone = Array.isArray(l) ? l : [];
    } catch (_) { persone = []; }
    const mie = persone.filter(p => p && p.attivo && !p.eliminato && String(p.email || '').trim().toLowerCase() === email);
    if (!mie.length) return null;
    return { equityPartner: mie.some(p => p.equityPartner === true), foundingPartner: mie.some(p => p.foundingPartner === true), qualita: mie.some(p => p.qualita === true) };
}

/* Con quale qualifica l'utente effettivo `ue` (da utenteEffettivo) puo'
   abilitare nuovi accessi: 'amministratore' | 'equity' | 'founding' | 'qualita',
   oppure '' se non puo'. */
async function qualifica(db, ue) {
    if (!ue || !ue.ok || ue.collaboratore) return '';
    if (ue.email === PROPRIETARIO || eRuoloAdmin(ue.ruolo)) return DA_AMMINISTRATORE;
    if (ue.ruolo === 'sondaggio_compila' || ue.ruolo === 'sondaggio_risultati') return '';
    const scheda = await schedaDi(db, ue.email);
    if (scheda && scheda.equityPartner) return 'equity';
    if (scheda && scheda.foundingPartner) return 'founding';
    if (ue.ruolo === 'qualita' || (scheda && scheda.qualita)) return 'qualita';
    return '';
}

/* Abilita un nuovo utente. `ue` e' chi chiama; `dati` { email, nome, ruolo }.
   Torna { ok, stato (HTTP), msg } e, se va bene, { email, ruolo, nomeRuolo }. */
async function abilita(db, ue, dati) {
    if (ue && ue.ok && ue.collaboratore) return { ok: false, stato: 403, msg: 'Un collaboratore non può abilitare nuovi accessi: lo fa l\'utente a cui è associato.' };
    const come = await qualifica(db, ue);
    if (!come) return { ok: false, stato: 403, msg: 'Nuovi accessi li abilitano l\'amministratore, i responsabili della qualità, gli equity partner e i founding partner.' };

    const email = pulito(dati && dati.email, 200).toLowerCase();
    const nome = pulito(dati && dati.nome, 120);
    const ruolo = pulito(dati && dati.ruolo, 40);
    if (!EMAIL_RE.test(email)) return { ok: false, stato: 400, msg: 'Indirizzo email non valido.' };
    if (!nome) return { ok: false, stato: 400, msg: 'Manca il nome della persona.' };
    if (RUOLI_DELEGABILI.indexOf(ruolo) < 0) return { ok: false, stato: 400, msg: 'Da qui si assegnano solo i ruoli Revisore, Coordinatore territoriale e Vice coordinatore territoriale.' };

    // il freno giornaliero, per chi non e' amministratore
    const rifLimite = db.collection('meta').doc('abilitazioni');
    const ora = Date.now();
    const conFreno = come !== DA_AMMINISTRATORE;
    if (conFreno) {
        let recenti = [];
        try { const s = await rifLimite.get(); recenti = (((s.exists ? s.data() : {}) || {})[chiaveDi(ue.email)] || []).filter(t => ora - t < GIORNO_MS); } catch (_) { recenti = []; }
        if (recenti.length >= MAX_AL_GIORNO) return { ok: false, stato: 429, msg: 'Hai già abilitato ' + MAX_AL_GIORNO + ' accessi nelle ultime 24 ore: per gli altri rivolgiti all\'amministratore, o riprova domani.' };
    }

    const rif = db.collection('utenti').doc(email);
    const scheda = { nome: nome, ruolo: ruolo, attivo: true, creato: ora, creatoDa: ue.email, delega: come };
    // in transazione: se nel frattempo la scheda e' comparsa, non la si tocca
    const creato = await db.runTransaction(async tx => {
        const s = await tx.get(rif);
        if (s.exists) return false;
        tx.set(rif, scheda);
        return true;
    });
    if (!creato) return { ok: false, stato: 409, msg: 'Questo indirizzo ha già un accesso (attivo o disabilitato): per cambiarlo serve l\'amministratore.' };

    if (conFreno) {
        try {
            const s = await rifLimite.get();
            const tutti = (s.exists ? s.data() : {}) || {};
            const k = chiaveDi(ue.email);
            await rifLimite.set({ [k]: (tutti[k] || []).filter(t => ora - t < GIORNO_MS).concat([ora]).slice(-MAX_AL_GIORNO) }, { merge: true });
        } catch (_) { /* il conteggio serve solo da freno */ }
    }
    return { ok: true, stato: 200, email: email, ruolo: ruolo, nomeRuolo: NOMI_RUOLI[ruolo], come: come };
}
// una chiave di campo senza punti (Firestore li leggerebbe come percorso)
function chiaveDi(email) { return String(email || '').toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 200); }

module.exports = { abilita, qualifica, RUOLI_DELEGABILI, MAX_AL_GIORNO, _interni: { schedaDi, chiaveDi } };
