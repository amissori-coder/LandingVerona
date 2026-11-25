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
     - SOLO con il ruolo Revisore: ogni altro ruolo (Coordinatore
       territoriale, Vice, Responsabile qualita', Procuratore...)
       lo assegna l'amministratore dalla sezione Utenti;
     - SOLO una persona che ha gia' una scheda ATTIVA in Aderenti
       Revilaw con quell'indirizzo email. Non si abilita un
       indirizzo scritto a mano: prima la persona si inserisce in
       anagrafica (e la si mette negli incarichi), poi le si da'
       l'accesso. E' la scheda a dire chi e' e che cosa vedra'.

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
const N = require('./nomi-incarichi');

// il titolare dello studio: come in area-riservata/app.js e in lib/utente-effettivo.js
const PROPRIETARIO = 'a.missori@emvas.tax';
// il solo ruolo che si puo' assegnare da "Nuovi accessi" (lo stesso elenco di RUOLI_DELEGABILI in app.js)
const RUOLI_DELEGABILI = ['revisore'];
const NOMI_RUOLI = { revisore: 'Revisore' };
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;
// quanti accessi puo' abilitare una persona in un giorno: un freno a un errore o a un abuso, non un limite di lavoro
const MAX_AL_GIORNO = 60;
const GIORNO_MS = 24 * 3600 * 1000;
/* La qualifica di chi ha gia' i poteri sugli utenti (amministratore, vice, titolare).
   E' un'etichetta di questo file, non un ruolo: chi e' amministratore lo dice sempre
   e solo eRuoloAdmin(), che vale anche per il vice. */
const DA_AMMINISTRATORE = 'amministratore';

const pulito = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/* L'anagrafica (archivio/persone): un elenco, vuoto se non si legge. */
async function leggiPersone(db) {
    try {
        const s = await db.collection('archivio').doc('persone').get();
        const j = s.exists ? (s.data() || {}).json : null;
        const l = typeof j === 'string' ? JSON.parse(j) : j;
        return Array.isArray(l) ? l : [];
    } catch (_) { return []; }
}
/* La scheda in Aderenti Revilaw di un indirizzo: attiva e non eliminata. Con
   piu' schede per lo stesso indirizzo vale la piu' "qualificata". `persone` e'
   l'anagrafica gia' letta (facoltativa). */
async function schedaDi(db, email, persone) {
    const tutte = persone || await leggiPersone(db);
    const mie = tutte.filter(p => p && p.attivo && !p.eliminato && String(p.email || '').trim().toLowerCase() === email);
    if (!mie.length) return null;
    const p0 = mie[0];
    return {
        nome: pulito((p0.nomeProprio ? p0.nomeProprio + ' ' : '') + (p0.nome || ''), 120),
        equityPartner: mie.some(p => p.equityPartner === true), foundingPartner: mie.some(p => p.foundingPartner === true), qualita: mie.some(p => p.qualita === true)
    };
}

/* Con quale qualifica l'utente effettivo `ue` (da utenteEffettivo) puo'
   abilitare nuovi accessi: 'amministratore' | 'equity' | 'founding' | 'qualita',
   oppure '' se non puo'. */
async function qualifica(db, ue, persone) {
    if (!ue || !ue.ok || ue.collaboratore) return '';
    if (ue.email === PROPRIETARIO || eRuoloAdmin(ue.ruolo)) return DA_AMMINISTRATORE;
    if (ue.ruolo === 'sondaggio_compila' || ue.ruolo === 'sondaggio_risultati') return '';
    const scheda = await schedaDi(db, ue.email, persone);
    if (scheda && scheda.equityPartner) return 'equity';
    if (scheda && scheda.foundingPartner) return 'founding';
    if (ue.ruolo === 'qualita' || (scheda && scheda.qualita)) return 'qualita';
    return '';
}

/* Abilita un nuovo utente. `ue` e' chi chiama; `dati` { email, ruolo }. Il nome
   e' quello della scheda in Aderenti Revilaw. Torna { ok, stato (HTTP), msg } e,
   se va bene, { email, nome, ruolo, nomeRuolo }. */
async function abilita(db, ue, dati) {
    if (ue && ue.ok && ue.collaboratore) return { ok: false, stato: 403, msg: 'Un collaboratore non può abilitare nuovi accessi: lo fa l\'utente a cui è associato.' };
    const persone = await leggiPersone(db);
    const come = await qualifica(db, ue, persone);
    if (!come) return { ok: false, stato: 403, msg: 'Nuovi accessi li abilitano l\'amministratore, i responsabili della qualità, gli equity partner e i founding partner.' };

    const email = pulito(dati && dati.email, 200).toLowerCase();
    const ruolo = pulito(dati && dati.ruolo, 40);
    if (!EMAIL_RE.test(email)) return { ok: false, stato: 400, msg: 'Indirizzo email non valido.' };
    if (RUOLI_DELEGABILI.indexOf(ruolo) < 0) return { ok: false, stato: 400, msg: 'Da qui si abilita solo con il ruolo Revisore: per un altro ruolo serve l\'amministratore.' };
    const rif = db.collection('utenti').doc(email);
    const GIA = 'Questo indirizzo ha già un accesso (attivo o disabilitato): per cambiarlo serve l\'amministratore.';
    // chi ha gia' un accesso lo si dice subito, prima di ogni altra cosa (la transazione sotto lo ricontrolla)
    if ((await rif.get()).exists) return { ok: false, stato: 409, msg: GIA };
    // solo chi e' gia' in anagrafica: la scheda dice chi e' (e da li' si prende il nome)
    const persona = await schedaDi(db, email, persone);
    if (!persona) return { ok: false, stato: 400, msg: 'In Aderenti Revilaw non c\'è una scheda attiva con questo indirizzo email: prima va inserita la persona in anagrafica, poi le si dà l\'accesso.' };
    const nome = persona.nome || email;

    // il freno giornaliero, per chi non e' amministratore
    const rifLimite = db.collection('meta').doc('abilitazioni');
    const ora = Date.now();
    const conFreno = come !== DA_AMMINISTRATORE;
    if (conFreno) {
        let recenti = [];
        try { const s = await rifLimite.get(); recenti = (((s.exists ? s.data() : {}) || {})[chiaveDi(ue.email)] || []).filter(t => ora - t < GIORNO_MS); } catch (_) { recenti = []; }
        if (recenti.length >= MAX_AL_GIORNO) return { ok: false, stato: 429, msg: 'Hai già abilitato ' + MAX_AL_GIORNO + ' accessi nelle ultime 24 ore: per gli altri rivolgiti all\'amministratore, o riprova domani.' };
    }

    const scheda = { nome: nome, ruolo: ruolo, attivo: true, creato: ora, creatoDa: ue.email, delega: come };
    // in transazione: se nel frattempo la scheda e' comparsa, non la si tocca
    const creato = await db.runTransaction(async tx => {
        const s = await tx.get(rif);
        if (s.exists) return false;
        tx.set(rif, scheda);
        return true;
    });
    if (!creato) return { ok: false, stato: 409, msg: GIA };

    if (conFreno) {
        try {
            const s = await rifLimite.get();
            const tutti = (s.exists ? s.data() : {}) || {};
            const k = chiaveDi(ue.email);
            await rifLimite.set({ [k]: (tutti[k] || []).filter(t => ora - t < GIORNO_MS).concat([ora]).slice(-MAX_AL_GIORNO) }, { merge: true });
        } catch (_) { /* il conteggio serve solo da freno */ }
    }
    return { ok: true, stato: 200, email: email, nome: nome, ruolo: ruolo, nomeRuolo: NOMI_RUOLI[ruolo], come: come };
}
/* L'elenco che mostra la sezione "Nuovi accessi": le persone attive di Aderenti
   Revilaw che hanno un indirizzo email e non hanno ancora un accesso (con quanti
   incarichi le citano), e gli accessi abilitati da chi chiama. Lo prepara il
   servizio perche' chi abilita puo' avere a sua volta il ruolo Revisore, e a un
   Revisore il database non consegna ne' l'anagrafica ne' l'elenco degli utenti.
   Torna { ok, stato, msg } e, se va bene, { come, candidati, miei }. */
async function candidati(db, ue) {
    const persone = await leggiPersone(db);
    const come = await qualifica(db, ue, persone);
    if (!come) return { ok: false, stato: 403, msg: 'Nuovi accessi li abilitano l\'amministratore, i responsabili della qualità, gli equity partner e i founding partner.' };
    let incarichi = [];
    try {
        const s = await db.collection('archivio').doc('incarichi').get();
        const j = s.exists ? (s.data() || {}).json : null;
        const l = typeof j === 'string' ? JSON.parse(j) : j;
        incarichi = Array.isArray(l) ? l : [];
    } catch (_) { incarichi = []; }
    const utenti = (await db.collection('utenti').get()).docs.map(d => Object.assign({}, d.data() || {}, { email: String(d.id).toLowerCase() }));
    const conAccesso = new Set(utenti.map(u => u.email));
    // quanti incarichi citano ciascuna scheda: una sola passata
    const risolvi = N.risolutorePersone(persone), conta = new Map();
    incarichi.forEach(inc => N.personeDiIncarico(inc, risolvi).forEach(p => conta.set(p.id, (conta.get(p.id) || 0) + 1)));
    const visti = new Set();
    const elenco = persone
        .filter(p => p && p.attivo && !p.eliminato && p.email && !conAccesso.has(String(p.email).trim().toLowerCase()))
        // due schede con la stessa email darebbero due righe per lo stesso accesso
        .filter(p => { const e = String(p.email).trim().toLowerCase(); if (visti.has(e)) return false; visti.add(e); return true; })
        .map(p => ({
            id: p.id, nome: pulito(p.nome, 120), nomeProprio: pulito(p.nomeProprio, 120), email: String(p.email).trim(),
            incarichi: conta.get(p.id) || 0,
            equityPartner: p.equityPartner === true, foundingPartner: p.foundingPartner === true, qualita: p.qualita === true,
            respIncarico: p.respIncarico === true, coordinatore: p.coordinatore === true, viceCoordinatore: p.viceCoordinatore === true
        }));
    const miei = utenti.filter(u => String(u.creatoDa || '').toLowerCase() === ue.email)
        .map(u => ({ email: u.email, nome: pulito(u.nome, 120), ruolo: pulito(u.ruolo, 40), creato: Number(u.creato) || 0, attivo: u.attivo !== false, ultimoAccesso: Number(u.ultimoAccesso) || 0 }));
    return { ok: true, stato: 200, come: come, candidati: elenco, miei: miei };
}

// una chiave di campo senza punti (Firestore li leggerebbe come percorso)
function chiaveDi(email) { return String(email || '').toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 200); }

module.exports = { abilita, qualifica, candidati, RUOLI_DELEGABILI, MAX_AL_GIORNO, _interni: { schedaDi, leggiPersone, chiaveDi } };
