/* ============================================================
   IL REVISORE VEDE SOLO I SUOI INCARICHI: I DATI GLIELI PREPARA
   IL SERVIZIO
   ------------------------------------------------------------
   Nell'area riservata ogni archivio (incarichi, anagrafica,
   fatture, registro...) e' UN documento di Firestore con tutto
   dentro. Le regole di Firestore sanno dire "questo documento si'
   / questo no", ma non sanno aprirlo per darne una parte: quindi a
   un Revisore, che deve vedere solo cio' che riguarda i SUOI
   incarichi, il database non puo' consegnare l'archivio. Con le
   regole di area-riservata/FIREBASE-SETUP.md a chi ha il ruolo
   'revisore' Firestore non da' NESSUN archivio, ne' l'elenco degli
   utenti: il filtro non e' piu' "il programma non te lo mostra", e'
   "il dato non esce dal server".

   I suoi dati glieli prepara questo servizio (api/revisore.js), che
   legge gli archivi con la chiave di servizio e gli passa soltanto:

     incarichi         quelli in cui compare la sua scheda di Aderenti
                       Revilaw (team, responsabile dell'incarico o
                       della qualita', referente, coordinatore). La
                       scheda si aggancia per email, come nell'app;
     persone           la sua scheda per intero; dei colleghi citati
                       nei suoi incarichi nome, email e qualifiche
                       (niente telefono ne' indirizzo); degli equity
                       partner e dei coordinatori quanto serve a
                       indirizzare una richiesta di correzione; degli
                       omonimi il solo nome (serve a leggere le
                       etichette degli incarichi come le legge l'app);
     fattureStato      le rate dei suoi incarichi;
     controlliQualita  le schede dei suoi incarichi;
     audit             le voci dei suoi incarichi e le sue;
     richieste         quelle che ha scritto, quelle indirizzate a lui
                       o in cui e' in conoscenza;
     firmeEmail        la sua firma.

   Tutto il resto (comunicazioni, merito creditizio, sondaggi, eventi,
   newsletter, allerte, presenze) non gli viene consegnato.

   Il Revisore e' in sola visualizzazione, ma tre cose le scrive
   anche lui, e passano da qui perche' Firestore non gliele lascia
   piu' scrivere:
     - le voci del Registro modifiche (l'accesso, una richiesta
       inviata): le firma il SERVIZIO con il suo nome, non il browser;
     - le richieste di correzione: ne apre di nuove sui suoi incarichi
       e risponde a quelle di cui e' parte;
     - la sua firma email.
   Niente si cancella da qui e niente altro si modifica.

   Chi e' "revisore" lo dice utenteEffettivo(): per un collaboratore
   vale il ruolo del suo utente di riferimento, e i dati sono quelli
   del riferimento.
   ============================================================ */
'use strict';

const crypto = require('crypto');
const N = require('./nomi-incarichi');
const { firmaCollaboratore } = require('./utente-effettivo');

const RUOLO_REVISORE = 'revisore';
const ARCHIVI_SCRIVIBILI = ['audit', 'richieste', 'firmeEmail'];
const MAX_REGISTRO = 2000;              // come nell'app: il registro tiene le ultime 2000 voci
const VOCI_AL_GIORNO = 300;             // quante voci di registro puo' scrivere un revisore in 24 ore
const VOCI_PER_CHIAMATA = 30;
const RICHIESTE_PER_CHIAMATA = 10;
const GIORNO_MS = 24 * 3600 * 1000;
const STATI_RICHIESTA = ['aperta', 'presa', 'risolta', 'respinta'];
const STATI_APERTI = ['aperta', 'presa'];
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;

const basso = v => String(v == null ? '' : v).trim().toLowerCase();
// testo ripulito dai caratteri di controllo (restano a capo e tabulazione) e tagliato
function testo(v, max) {
    return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, max);
}
const nuovoId = () => crypto.randomBytes(9).toString('hex');

function eRevisore(ue) { return !!ue && ue.ok === true && String(ue.ruolo || '') === RUOLO_REVISORE; }

/* ---------- lettura degli archivi ---------- */
function analizza(json, vuoto) {
    if (typeof json !== 'string') return vuoto;
    try {
        const v = JSON.parse(json);
        if (Array.isArray(vuoto)) return Array.isArray(v) ? v : vuoto;
        return (v && typeof v === 'object' && !Array.isArray(v)) ? v : vuoto;
    } catch (_) { return vuoto; }
}
async function leggi(db, nome, vuoto) {
    const s = await db.collection('archivio').doc(nome).get();
    return analizza(s.exists ? (s.data() || {}).json : null, vuoto);
}

/* ---------- chi e' e che cosa lo riguarda ---------- */
/* La scheda in Aderenti Revilaw di un indirizzo, come Auth.personaCorrente() nell'app:
   non eliminata; con piu' schede per lo stesso indirizzo vince la piu' completa. */
function schedaDi(persone, email) {
    const mie = (persone || []).filter(p => p && p.email && !p.eliminato && basso(p.email) === email);
    if (!mie.length) return null;
    const punti = p => (p.attivo ? 2 : 0) + (N.regioniCoperte(p).length ? 1 : 0);
    let scelta = mie[0];
    mie.forEach(p => { if (punti(p) > punti(scelta)) scelta = p; });
    return scelta;
}
function firma(ue) {
    const nome = testo((ue.dati && ue.dati.nome) || '', 120).trim();
    return (nome || ue.email) + ' <' + ue.email + '>';
}
// chi scrive su una richiesta: come meRichiesta() nell'app
function autore(ue) {
    const o = { email: basso(ue.email), nome: testo((ue.dati && ue.dati.nome) || ue.email, 120).trim() };
    const c = firmaCollaboratore(ue);
    if (c) o.collab = c;
    return o;
}
/* Il perimetro di un revisore: la sua scheda, i suoi incarichi, i loro clienti. */
function ambito(ue, incarichi, persone) {
    const email = basso(ue.email);
    const sessione = basso((ue.sessione && ue.sessione.email) || email);
    const scheda = schedaDi(persone, email);
    const risolvi = N.risolutorePersone(persone);
    const miei = scheda ? N.incarichiDellaScheda(incarichi, risolvi, scheda.id) : [];
    return {
        email: email, sessione: sessione, scheda: scheda, risolvi: risolvi, miei: miei,
        idMiei: new Set(miei.map(i => String(i.id))),
        clienti: new Set(miei.map(i => basso(i.cliente)).filter(Boolean)),
        // le regioni che coordina secondo la scheda: le richieste di quel territorio le vede
        regioniMie: scheda && (scheda.coordinatore || scheda.viceCoordinatore) ? N.regioniCoperte(scheda).map(N.chiaveRegione).filter(Boolean) : [],
        // equity e founding partner lavorano le richieste (cambiano lo stato) anche se non indirizzate a loro
        partner: !!(scheda && (scheda.equityPartner || scheda.foundingPartner))
    };
}

/* ---------- anagrafica ridotta ---------- */
const CAMPI_NOME = ['id', 'nome', 'nomeProprio', 'nomeCompleto', 'attivo', 'eliminato'];
const CAMPI_COLLEGA = CAMPI_NOME.concat(['email', 'regione', 'team', 'qualita', 'respIncarico', 'coordinatore', 'viceCoordinatore', 'equityPartner', 'foundingPartner', 'regioniCoordinate']);
const CAMPI_RIFERIMENTO = CAMPI_NOME.concat(['email', 'coordinatore', 'viceCoordinatore', 'equityPartner', 'foundingPartner', 'regioniCoordinate']);
function soloCampi(p, campi) { const o = {}; campi.forEach(c => { if (p[c] !== undefined) o[c] = p[c]; }); return o; }
function personeRidotte(persone, ctx) {
    persone = (persone || []).filter(p => p && p.id != null);
    const livello = new Map();          // id -> 'mia' | 'collega' | 'riferimento' | 'nome'
    const metti = (p, l) => {
        const ordine = { nome: 0, riferimento: 1, collega: 2, mia: 3 };
        if (!livello.has(p.id) || ordine[l] > ordine[livello.get(p.id)]) livello.set(p.id, l);
    };
    // 1) le etichette scritte nei miei incarichi e le persone a cui si riferiscono
    const etichette = new Set();
    ctx.miei.forEach(inc => {
        N.CAMPI_PERSONE.forEach(c => N.dividiNomi(inc[c]).forEach(t => etichette.add(t.toLowerCase())));
        N.personeDiIncarico(inc, ctx.risolvi).forEach(p => metti(p, 'collega'));
    });
    // 2) chi riceve le richieste di correzione (equity partner) e chi ne resta in copia (coordinatori e vice)
    persone.forEach(p => {
        if (p.attivo && !p.eliminato && p.email && (p.equityPartner || p.coordinatore || p.viceCoordinatore)) metti(p, 'riferimento');
    });
    // 3) chi potrebbe essere scambiato per loro: ogni scheda che una di quelle etichette
    //    potrebbe indicare, e i loro omonimi. Di queste passa il solo nome: cosi' l'app,
    //    che rilegge le etichette con l'anagrafica ridotta, arriva alle stesse persone.
    const cognomi = new Set();
    persone.forEach(p => {
        const cog = basso(p.nome), np = String(p.nomeProprio || '').trim().toLowerCase();
        const candidata = (cog && etichette.has(cog)) || (np && etichette.has(cog + ' ' + np))
            || etichette.has(N.etichettaPersona(p, persone).toLowerCase()) || livello.get(p.id) === 'collega';
        if (candidata && cog) { cognomi.add(cog); metti(p, 'nome'); }
    });
    persone.forEach(p => { if (cognomi.has(basso(p.nome))) metti(p, 'nome'); });
    // 4) la mia scheda, per intero
    if (ctx.scheda) metti(ctx.scheda, 'mia');
    return persone.filter(p => livello.has(p.id)).map(p => {
        const l = livello.get(p.id);
        return l === 'mia' ? p : soloCampi(p, l === 'collega' ? CAMPI_COLLEGA : l === 'riferimento' ? CAMPI_RIFERIMENTO : CAMPI_NOME);
    });
}

/* ---------- i filtri, archivio per archivio ---------- */
function parteDi(r, email) {
    if (!r || !email) return '';
    if (basso(r.richiedente && r.richiedente.email) === email) return 'richiedente';
    if (basso(r.destinatario && r.destinatario.email) === email) return 'destinatario';
    if ((r.conoscenza || []).some(c => basso(c && c.email) === email)) return 'conoscenza';
    return '';
}
function vedeRichiesta(r, ctx) {
    if (!r || typeof r !== 'object') return false;
    if (parteDi(r, ctx.email)) return true;
    return !!r.regione && ctx.regioniMie.includes(N.chiaveRegione(r.regione));
}
function filtraRichieste(richieste, ctx) { return (richieste || []).filter(r => vedeRichiesta(r, ctx)); }

function filtraRegistro(audit, ctx, idRichieste) {
    return (audit || []).filter(v => {
        if (!v || typeof v !== 'object') return false;
        const ent = String(v.entita || '');
        // legate a un incarico preciso: conta l'incarico, non il nome del cliente (due
        // incarichi diversi possono avere lo stesso cliente)
        if (ent === 'incarico' && v.rif != null && v.rif !== '') return ctx.idMiei.has(String(v.rif));
        if (ent === 'fattura' && v.rif) return ctx.idMiei.has(String(v.rif).split('|')[0]);
        if (ent === 'richiesta' && v.rif) return idRichieste.has(String(v.rif));
        const cli = basso(v.cliente);
        if (cli) return ctx.clienti.has(cli);
        // senza cliente (accessi, anagrafica, utenti): gli restano le sue
        const chi = basso(v.utente) + ' ' + basso(v.collaboratore);
        return basso(v.utente) === ctx.email || chi.indexOf('<' + ctx.email + '>') >= 0 || chi.indexOf('<' + ctx.sessione + '>') >= 0;
    });
}
function filtraFatture(stati, ctx) {
    const out = {};
    Object.keys(stati || {}).forEach(k => { if (ctx.idMiei.has(String(k).split('|')[0])) out[k] = stati[k]; });
    return out;
}
function filtraControlli(schede, ctx) {
    const out = [];
    (schede || []).forEach(s => {
        if (!s || typeof s !== 'object') return;
        // il record di configurazione porta solo gli anni di riferimento
        if (s.config) out.push({ id: s.id, config: true, anni: Array.isArray(s.anni) ? s.anni : [] });
        else if (ctx.idMiei.has(String(s.incaricoId))) out.push(s);
    });
    return out;
}
function filtraFirme(firme, ctx) {
    const out = {};
    if (firme && Object.prototype.hasOwnProperty.call(firme, ctx.sessione)) out[ctx.sessione] = firme[ctx.sessione];
    return out;
}

/* ---------- LETTURA: tutto quello che un revisore puo' vedere ---------- */
async function dati(db, ue) {
    const [incarichi, persone, audit, fatture, controlli, richieste, firme] = await Promise.all([
        leggi(db, 'incarichi', []), leggi(db, 'persone', []), leggi(db, 'audit', []), leggi(db, 'fattureStato', {}),
        leggi(db, 'controlliQualita', []), leggi(db, 'richieste', []), leggi(db, 'firmeEmail', {})
    ]);
    const ctx = ambito(ue, incarichi, persone);
    const mieRichieste = filtraRichieste(richieste, ctx);
    return {
        scheda: ctx.scheda ? ctx.scheda.id : null,
        miei: ctx.miei.map(i => i.id),
        archivi: {
            incarichi: ctx.miei,
            persone: personeRidotte(persone, ctx),
            audit: filtraRegistro(audit, ctx, new Set(mieRichieste.map(r => String(r.id)))),
            fattureStato: filtraFatture(fatture, ctx),
            controlliQualita: filtraControlli(controlli, ctx),
            richieste: mieRichieste,
            firmeEmail: filtraFirme(firme, ctx)
        }
    };
}

/* Gli id degli incarichi di chi chiama (per le altre porte del servizio, che a un
   revisore lasciano toccare solo i suoi). */
async function idIncarichi(db, ue) {
    const [incarichi, persone] = await Promise.all([leggi(db, 'incarichi', []), leggi(db, 'persone', [])]);
    return ambito(ue, incarichi, persone).idMiei;
}

/* ---------- le persone a cui un revisore puo' scrivere ---------- */
function equityPartners(persone) {
    return (persone || []).filter(p => p && p.equityPartner && p.attivo && !p.eliminato && p.email)
        .map(p => ({ email: basso(p.email), nome: N.nomeCompleto(p) }));
}
function coordinatoriDiRegione(persone, regione) {
    const k = N.chiaveRegione(regione || '');
    if (!k) return [];
    return (persone || [])
        .filter(p => p && p.attivo && !p.eliminato && p.email && (p.coordinatore || p.viceCoordinatore))
        .filter(p => N.regioniCoperte(p).some(r => N.chiaveRegione(r) === k))
        .map(p => ({ email: basso(p.email), nome: N.nomeCompleto(p), ruolo: p.coordinatore ? 'Coordinatore territoriale' : 'Vice coordinatore territoriale' }));
}
/* Gli indirizzi a cui un revisore puo' far partire una email dall'area: sono solo le
   persone delle sue richieste di correzione (chi le ha scritte, chi le riceve, chi e'
   in copia) e gli equity partner a cui si indirizzano. Lo usa api/invia-comunicazione.js. */
async function destinatariAmmessi(db, ue) {
    const [incarichi, persone, richieste] = await Promise.all([leggi(db, 'incarichi', []), leggi(db, 'persone', []), leggi(db, 'richieste', [])]);
    const ctx = ambito(ue, incarichi, persone);
    const ok = new Set([ctx.email]);
    equityPartners(persone).forEach(e => ok.add(e.email));
    filtraRichieste(richieste, ctx).forEach(r => {
        [r.richiedente, r.destinatario].concat(r.conoscenza || []).forEach(p => { const e = basso(p && p.email); if (e) ok.add(e); });
    });
    return ok;
}

/* ---------- SCRITTURA ---------- */
function dettagliVoce(d) {
    if (d == null) return null;
    if (Array.isArray(d)) {
        return d.slice(0, 60).filter(x => x && typeof x === 'object')
            .map(x => ({ campo: testo(x.campo, 120), prima: testo(x.prima, 2000), dopo: testo(x.dopo, 2000) }));
    }
    return testo(typeof d === 'object' ? JSON.stringify(d) : d, 2000);
}
/* Una voce del registro scritta da un revisore: chi l'ha scritta lo dice il servizio. */
function voceRegistro(ue, v, ora) {
    if (!v || typeof v !== 'object') return null;
    const id = testo(v.id, 60).trim(), azione = testo(v.azione, 200).trim();
    if (!id || !azione) return null;
    const ts = Number(v.ts);
    const voce = {
        id: id,
        // l'ora la tiene chi scrive solo se e' credibile (a pochi minuti da adesso)
        ts: Number.isFinite(ts) && Math.abs(ts - ora) < 10 * 60 * 1000 ? ts : ora,
        utente: firma(ue), azione: azione, entita: testo(v.entita, 40).trim(),
        rif: v.rif == null || v.rif === '' ? null : testo(v.rif, 200),
        cliente: v.cliente == null || v.cliente === '' ? null : testo(v.cliente, 300),
        dettagli: dettagliVoce(v.dettagli)
    };
    const c = firmaCollaboratore(ue);
    if (c) voce.collaboratore = c;
    return voce;
}
function applicaRegistro(lista, voci, ue, ora) {
    const mia = '<' + basso(ue.email) + '>';
    const recenti = lista.filter(v => v && ora - (v.ts || 0) < GIORNO_MS && basso(v.utente).indexOf(mia) >= 0).length;
    const presenti = new Set(lista.map(v => v && String(v.id)));
    let accolte = 0;
    const rifiutate = [];
    (Array.isArray(voci) ? voci : []).slice(0, VOCI_PER_CHIAMATA).forEach(g => {
        const v = voceRegistro(ue, g, ora);
        if (!v) { rifiutate.push({ id: g && g.id, msg: 'voce non valida' }); return; }
        if (presenti.has(v.id)) return;                 // gia' scritta: niente da fare (e niente da correggere: il registro non si riscrive)
        if (recenti + accolte >= VOCI_AL_GIORNO) { rifiutate.push({ id: v.id, msg: 'troppe voci in un giorno' }); return; }
        lista.push(v); presenti.add(v.id); accolte++;
    });
    lista.sort((a, b) => ((b && b.ts) || 0) - ((a && a.ts) || 0));
    if (lista.length > MAX_REGISTRO) lista.length = MAX_REGISTRO;
    return { accolte: accolte, rifiutate: rifiutate };
}

function invioRichiesta(v) {
    if (!v || typeof v !== 'object') return null;
    const il = Number(v.il);
    if (!Number.isFinite(il)) return null;
    return {
        il: il,
        a: (Array.isArray(v.a) ? v.a : []).slice(0, 20).map(e => basso(e)).filter(e => EMAIL_RE.test(e)),
        esito: v.esito === 'ok' ? 'ok' : 'errore', msg: testo(v.msg, 300)
    };
}
/* Una richiesta di correzione che arriva da un revisore: nuova, oppure la sua parte
   di una che esiste gia'. Modifica `lista`; torna '' se va bene, altrimenti il motivo. */
function applicaRichiesta(lista, r, ue, ctx, persone, incarichi, ora) {
    if (!r || typeof r !== 'object') return 'richiesta non valida';
    const id = testo(r.id, 60).trim();
    if (!id) return 'richiesta senza identificativo';
    const io = autore(ue);
    const i = lista.findIndex(x => x && String(x.id) === id);

    if (i < 0) {
        // NUOVA: la scrive lui, su un suo incarico (o su una funzione dell'area), a un equity partner
        const oggetto = testo(r.oggetto, 200).trim();
        const primo = (Array.isArray(r.messaggi) ? r.messaggi : []).find(m => m && m.tipo === 'richiesta') || (r.messaggi || [])[0];
        const corpo = testo(primo && primo.testo, 5000).trim();
        if (!oggetto || !corpo) return 'servono l\'oggetto e la descrizione del dato da correggere';
        const perIncarico = r.ambito === 'incarico';
        const inc = perIncarico ? (incarichi || []).find(x => x && String(x.id) === String(r.incaricoId)) : null;
        if (perIncarico && (!inc || !ctx.idMiei.has(String(inc.id)))) return 'l\'incarico indicato non è tra i tuoi';
        const dest = equityPartners(persone).find(e => e.email === basso(r.destinatario && r.destinatario.email));
        if (!dest) return 'la richiesta va indirizzata a un equity partner';
        const regione = inc ? String(inc.regione || '') : testo(r.regione, 80).trim();
        lista.unshift({
            id: id, oggetto: oggetto,
            ambito: perIncarico ? 'incarico' : 'funzione',
            incaricoId: inc ? inc.id : null,
            cliente: inc ? String(inc.cliente || '') : '',
            funzione: perIncarico ? '' : testo(r.funzione, 120).trim(),
            campo: testo(r.campo, 200).trim(),
            regione: regione,
            richiedente: io, destinatario: dest,
            conoscenza: coordinatoriDiRegione(persone, regione),
            stato: 'aperta', creato: ora, aggiornato: ora,
            messaggi: [{ id: testo(primo && primo.id, 60).trim() || nuovoId(), ts: ora, autore: io, tipo: 'richiesta', testo: corpo }],
            // l'avviso per email parte subito dopo: se il suo esito arriva insieme alla richiesta, resta scritto
            invii: (Array.isArray(r.invii) ? r.invii : []).map(invioRichiesta).filter(Boolean).slice(0, 5)
        });
        return '';
    }

    // ESISTENTE: aggiunge la sua parte, il resto non si tocca
    const s = lista[i];
    if (!vedeRichiesta(s, ctx)) return 'questa richiesta non ti riguarda';
    const ruolo = parteDi(s, ctx.email);
    const lavora = ruolo === 'destinatario' || ctx.partner;
    let cambiata = false;
    const gia = new Set((s.messaggi || []).map(m => m && String(m.id)));
    (Array.isArray(r.messaggi) ? r.messaggi : []).filter(m => m && m.id != null && !gia.has(String(m.id))).slice(0, 5).forEach(m => {
        const idMsg = testo(m.id, 60).trim();
        if (!idMsg) return;
        if (m.tipo === 'stato') {
            const stato = String(m.stato || '');
            if (STATI_RICHIESTA.indexOf(stato) < 0) return;
            // lo stato lo cambia chi lavora la richiesta; chi l'ha scritta puo' solo ritirarla
            const ritiro = ruolo === 'richiedente' && stato === 'respinta' && STATI_APERTI.indexOf(String(s.stato || 'aperta')) >= 0;
            if (!lavora && !ritiro) return;
            s.stato = stato;
            s.messaggi = (s.messaggi || []).concat([{ id: idMsg, ts: ora, autore: io, tipo: 'stato', testo: testo(m.testo, 300), stato: stato, evento: testo(m.evento, 120) }]);
        } else {
            const corpo = testo(m.testo, 5000).trim();
            if (!corpo) return;
            s.messaggi = (s.messaggi || []).concat([{ id: idMsg, ts: ora, autore: io, tipo: 'messaggio', testo: corpo }]);
        }
        gia.add(idMsg); cambiata = true;
    });
    // l'esito degli avvisi per email partiti dal suo browser
    const visti = new Set((s.invii || []).map(v => v && Number(v.il)));
    (Array.isArray(r.invii) ? r.invii : []).map(invioRichiesta).filter(v => v && !visti.has(v.il)).slice(0, 5).forEach(v => {
        s.invii = (s.invii || []).concat([v]).slice(-50);
        visti.add(v.il); cambiata = true;
    });
    if (cambiata) s.aggiornato = ora;
    return '';
}

/* La firma email: un oggetto piccolo di testi e di spunte. */
function firmaPulita(f, ora) {
    if (!f || typeof f !== 'object' || Array.isArray(f)) return null;
    const out = {};
    Object.keys(f).slice(0, 40).forEach(k => {
        const chiave = testo(k, 40);
        const v = f[k];
        if (typeof v === 'boolean') out[chiave] = v;
        else if (typeof v === 'number' && Number.isFinite(v)) out[chiave] = v;
        else if (typeof v === 'string') out[chiave] = testo(v, 2000);
    });
    out.aggiornato = ora;
    return out;
}

/* Salva la parte di un revisore in uno dei tre archivi che puo' scrivere.
   `upserts`: le voci nuove o cambiate (un elenco; per la firma un oggetto
   { <email>: firma }). Torna { ok, stato (HTTP), msg } e, se va bene, `valore`:
   l'archivio come lo vede lui dopo il salvataggio.
   opz.timbro: il valore per il campo "aggiornato" del documento. */
async function salva(db, ue, nome, upserts, opz) {
    if (ARCHIVI_SCRIVIBILI.indexOf(nome) < 0) return { ok: false, stato: 403, msg: 'Il tuo accesso è in sola visualizzazione: questo archivio non si modifica.' };
    const ora = Date.now();
    const [incarichi, persone] = await Promise.all([leggi(db, 'incarichi', []), leggi(db, 'persone', [])]);
    const ctx = ambito(ue, incarichi, persone);
    const vuoto = nome === 'firmeEmail' ? {} : [];
    const rif = db.collection('archivio').doc(nome);
    let rifiutate = [];
    const scritto = await db.runTransaction(async tx => {
        const s = await tx.get(rif);
        const valore = analizza(s.exists ? (s.data() || {}).json : null, vuoto);
        rifiutate = [];
        if (nome === 'audit') {
            rifiutate = applicaRegistro(valore, upserts, ue, ora).rifiutate;
        } else if (nome === 'richieste') {
            (Array.isArray(upserts) ? upserts : []).slice(0, RICHIESTE_PER_CHIAMATA).forEach(r => {
                const no = applicaRichiesta(valore, r, ue, ctx, persone, incarichi, ora);
                if (no) rifiutate.push({ id: r && r.id, msg: no });
            });
        } else {
            const mia = upserts && typeof upserts === 'object' && !Array.isArray(upserts) ? firmaPulita(upserts[ctx.sessione], ora) : null;
            Object.keys((upserts && typeof upserts === 'object' && !Array.isArray(upserts)) ? upserts : {}).forEach(k => { if (k !== ctx.sessione) rifiutate.push({ id: k, msg: 'si salva solo la propria firma' }); });
            if (mia) valore[ctx.sessione] = mia;
        }
        tx.set(rif, { json: JSON.stringify(valore), aggiornato: (opz && opz.timbro) || new Date(), da: ctx.sessione, via: 'servizio-revisori' });
        return valore;
    });
    const mio = nome === 'audit' ? filtraRegistro(scritto, ctx, new Set(filtraRichieste(await leggi(db, 'richieste', []), ctx).map(r => String(r.id))))
        : nome === 'richieste' ? filtraRichieste(scritto, ctx) : filtraFirme(scritto, ctx);
    return { ok: true, stato: 200, valore: mio, rifiutate: rifiutate };
}

module.exports = {
    RUOLO_REVISORE, ARCHIVI_SCRIVIBILI, eRevisore, dati, salva, idIncarichi, destinatariAmmessi,
    _interni: { ambito, schedaDi, personeRidotte, filtraRegistro, filtraFatture, filtraControlli, filtraRichieste, filtraFirme, applicaRichiesta, applicaRegistro, voceRegistro, equityPartners, coordinatoriDiRegione, leggi, VOCI_AL_GIORNO }
};
