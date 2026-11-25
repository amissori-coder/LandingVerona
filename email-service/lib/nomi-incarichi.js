/* ============================================================
   CHI E' CITATO IN UN INCARICO
   ------------------------------------------------------------
   Negli incarichi le persone sono scritte per ETICHETTA: di norma
   il solo cognome, oppure "Cognome Nome" quando due persone attive
   hanno lo stesso cognome. Per sapere a quale scheda di Aderenti
   Revilaw si riferisce un'etichetta valgono le stesse regole
   dell'area riservata (dividiNomi, etichettaPersona e
   risolutorePersone in area-riservata/app.js): vanno tenute UGUALI,
   perche' e' da qui che il servizio decide quali incarichi sono
   di una persona (lib/revisore.js, lib/abilita-utente.js).
   lib/circ-dati.js ne ha una sua copia, piu' vecchia di questo file.
   ============================================================ */
'use strict';

// i campi di un incarico in cui compaiono le persone
const CAMPI_PERSONE = ['qualita', 'respIncarico', 'referente', 'coordinatore', 'team'];

/* separatore unico degli elenchi di nominativi: virgola, punto e virgola, o trattino
   con almeno uno spazio accanto (i cognomi composti "Rossi-Bianchi" restano interi) */
function dividiNomi(testo) {
    return String(testo || '').split(/[,;]|\s+-\s*|\s*-\s+/).map(t => t.trim()).filter(Boolean);
}
function etichettaPersona(p, lista) {
    const cog = String((p && p.nome) || '').trim();
    if (!cog) return '';
    const np = String(p.nomeProprio || '').trim();
    if (!np) return cog;
    const condiviso = (lista || []).some(x => x && x.id !== p.id && x.attivo && !x.eliminato
        && String(x.nome || '').trim().toLowerCase() === cog.toLowerCase());
    return condiviso ? (cog + ' ' + np) : cog;
}
/* etichetta -> scheda. Prima le attive, poi le disattivate, infine le eliminate:
   un cognome nudo si risolve alla persona attiva. */
function risolutorePersone(lista) {
    lista = (lista || []).filter(Boolean);
    const perEt = new Map(), perPieno = new Map(), perCog = new Map();
    lista.filter(p => p.attivo && !p.eliminato).concat(lista.filter(p => !p.attivo && !p.eliminato)).concat(lista.filter(p => p.eliminato)).forEach(p => {
        const et = etichettaPersona(p, lista).toLowerCase();
        if (et && !perEt.has(et)) perEt.set(et, p);
        const np = String(p.nomeProprio || '').trim();
        if (np) { const f = (String(p.nome || '').trim() + ' ' + np).toLowerCase(); if (!perPieno.has(f)) perPieno.set(f, p); }
        const cg = String(p.nome || '').trim().toLowerCase();
        if (cg && !perCog.has(cg)) perCog.set(cg, p);
    });
    return str => { const t = String(str || '').trim().toLowerCase(); return t ? (perEt.get(t) || perPieno.get(t) || perCog.get(t) || null) : null; };
}
function nomeCompleto(p) {
    return p ? ((p.nomeProprio ? String(p.nomeProprio).trim() + ' ' : '') + String(p.nome || '').trim()).trim() : '';
}

/* Le schede citate in un incarico, in uno qualunque dei campi delle persone. */
function personeDiIncarico(inc, risolvi) {
    const out = new Map();
    CAMPI_PERSONE.forEach(c => dividiNomi(inc && inc[c]).forEach(t => { const x = risolvi(t); if (x && x.id != null) out.set(x.id, x); }));
    return [...out.values()];
}
/* Gli incarichi in cui compare la scheda con questo id (team, responsabile
   dell'incarico o della qualita', referente, coordinatore). */
function incarichiDellaScheda(incarichi, risolvi, idScheda) {
    return (incarichi || []).filter(inc => inc && inc.id != null && personeDiIncarico(inc, risolvi).some(p => p.id === idScheda));
}

/* Chiave di confronto di una regione: grafie diverse della stessa regione coincidono
   (come chiaveRegione in app.js). */
function chiaveRegione(r) {
    return String(r == null ? '' : r).trim().toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/['`]/g, '')
        .replace(/[\s-]+/g, ' ');
}
/* Le regioni che una scheda coordina: solo quelle spuntate (come regioniCoperte in app.js). */
function regioniCoperte(p) {
    if (!p || !Array.isArray(p.regioniCoordinate)) return [];
    const viste = new Set(), out = [];
    p.regioniCoordinate.filter(Boolean).forEach(r => {
        const k = chiaveRegione(r);
        if (k && !viste.has(k)) { viste.add(k); out.push(String(r).trim()); }
    });
    return out;
}

module.exports = { CAMPI_PERSONE, dividiNomi, etichettaPersona, risolutorePersone, nomeCompleto, personeDiIncarico, incarichiDellaScheda, chiaveRegione, regioniCoperte };
