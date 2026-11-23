/* ============================================================
   Circolarizzazioni via PEC: il registro delle operazioni
   ------------------------------------------------------------
   Chi ha fatto che cosa, e quando: ogni azione che cambia qualcosa
   (una lettera preparata, le date di un sollecito spostate, una
   lettera annullata o reinviata, una risposta segnata a mano o
   associata, un errore spuntato, i supervisori cambiati, i dati di
   un incarico cancellati) lascia qui una voce.

   LE VOCI NON SI CANCELLANO. Stanno in una raccolta a parte
   (`circRegistro`) proprio per questo: quando l'amministratore
   toglie dal portale i dati di un incarico, le lettere spariscono
   ma il registro resta, e la voce della cancellazione porta con
   se' il riepilogo di ogni lettera tolta (a chi, da chi, quando e'
   partita, se e' stata consegnata, se ha avuto risposta).

   CHI SCRIVE E' IL SERVIZIO, mai il browser: la raccolta non ha
   regole Firestore, quindi dall'area riservata non si puo' ne'
   scrivere ne' ritoccare. In ogni voce c'e' la persona che e'
   entrata davvero (`da`) e, se lavora come collaboratore, l'utente
   per conto del quale ha agito (`perConto`).

   NON SONO QUI le cose che fa il servizio da solo lettera per
   lettera (la PEC che parte, le ricevute, la risposta abbinata):
   quelle stanno sulla scheda della lettera, e finiscono nel
   riepilogo quando l'incarico viene cancellato. Qui ci sono solo
   le pulizie automatiche, perche' tolgono dei dati.
   ============================================================ */
'use strict';

const C = require('./circ-comune');

const REG = 'circRegistro';
const PER_VOCE = 200;           // quante lettere al massimo nel riepilogo di una voce di cancellazione
const AZIONI = {
    'lettera-in-coda': 'Lettera preparata e messa in coda',
    'solleciti-modificati': 'Solleciti modificati',
    'lettera-annullata': 'Lettera annullata',
    'solleciti-annullati': 'Solleciti annullati',
    'risposta-manuale': 'Risposta segnata a mano',
    'risposta-manuale-tolta': 'Risposta segnata a mano tolta',
    'lettera-reinviata': 'Lettera reinviata a un altro indirizzo',
    'risposta-associata': 'Risposta associata a una lettera',
    'messaggio-scartato': 'Messaggio non associato scartato',
    'errore-risolto': 'Errore segnato come risolto',
    'errore-riaperto': 'Errore riaperto',
    'avvisi-errori': 'Destinatari dell\'avviso degli errori cambiati',
    'supervisori': 'Supervisori cambiati',
    'incarico-cancellato': 'Dati dell\'incarico cancellati dal portale',
    'bozza-svuotata': 'Bozza delle nuove lettere svuotata',
    'invii-riprovati': 'Invii ripresi a mano dopo una sospensione',
    'pulizie': 'Pulizie automatiche'
};
/* Il servizio quando agisce da solo (le pulizie del giro programmato). */
const SISTEMA = { email: 'servizio', effettivo: 'servizio', nome: 'Servizio (automatico)' };

const riga = (v, max) => C.unaRiga(v, max);
/* L'istante di una voce. Due voci scritte nello stesso millisecondo (succede
   quando si preparano molte lettere di fila) prendono istanti consecutivi:
   cosi' l'ordine in cui si leggono e' quello in cui sono state scritte. */
let ultimoIstante = 0;
function istante() {
    const t = Date.now();
    ultimoIstante = t > ultimoIstante ? t : ultimoIstante + 1;
    return ultimoIstante;
}
/* I campi che dicono di quale lettera si parla. */
function diLettera(inv) {
    inv = inv || {};
    return {
        incaricoId: inv.incaricoId, cliente: inv.cliente, ambito: C.ambitoDi(inv.categoria),
        invio: inv.id, codice: inv.codice, destinatario: inv.destinatario, pec: inv.pec
    };
}
function pulisciDati(o) {
    const out = {};
    Object.keys(o && typeof o === 'object' ? o : {}).slice(0, 20).forEach(k => {
        const v = o[k];
        if (typeof v === 'number' || typeof v === 'boolean') out[riga(k, 40)] = v;
        else if (v != null) out[riga(k, 40)] = riga(v, 300);
    });
    return out;
}
/* Scrive una voce. Non fa mai fallire l'azione che registra (che a quel punto
   e' gia' avvenuta): se la scrittura non riesce lo dice ai log e torna false,
   e chi chiama lo segnala nel registro degli errori. */
async function scrivi(db, prof, v) {
    v = v || {};
    prof = prof || SISTEMA;
    const azione = String(v.azione || '');
    const voce = {
        quando: istante(),
        da: String(prof.email || ''), nome: riga(prof.nome, 120),
        perConto: prof.effettivo && prof.effettivo !== prof.email ? String(prof.effettivo) : '',
        azione: azione, titolo: AZIONI[azione] || azione,
        incaricoId: String(v.incaricoId || ''), cliente: riga(v.cliente, 160),
        ambito: Object.prototype.hasOwnProperty.call(C.AMBITI, String(v.ambito)) ? String(v.ambito) : '',
        invio: String(v.invio || ''), codice: riga(v.codice, 20), destinatario: riga(v.destinatario, 160), pec: riga(v.pec, 200),
        dettaglio: riga(v.dettaglio, 700),
        campi: (Array.isArray(v.campi) ? v.campi : []).slice(0, 30).map(c => ({ campo: riga(c.campo, 80), prima: riga(c.prima, 300) || 'vuoto', dopo: riga(c.dopo, 300) || 'vuoto' })),
        dati: pulisciDati(v.dati)
    };
    if (Array.isArray(v.lettere)) voce.lettere = v.lettere.slice(0, PER_VOCE);
    try {
        await db.collection(REG).doc().set(voce);
        return true;
    } catch (e) {
        console.error('Circolarizzazioni, registro non scritto (' + azione + '):', String((e && e.message) || e).slice(0, 300));
        return false;
    }
}

/* Una lettera in una riga, per il riepilogo di quelle cancellate. */
function letteraBreve(inv) {
    const p = (inv.passi || {}), primo = p.primo || {};
    const sol = x => x && x.stato === 'inviato' ? (x.inviatoIl || 0) : 0;
    return {
        codice: inv.codice || '', destinatario: riga(inv.destinatario, 160), pec: riga(inv.pec, 200),
        tipologia: (C.CATEGORIE[inv.categoria] || {}).uno || inv.categoria || '', ambito: C.ambitoDi(inv.categoria),
        stato: inv.stato || '', preparataDa: (inv.creato || {}).da || '', preparataIl: (inv.creato || {}).il || 0,
        inviataIl: primo.inviatoIl || 0, consegnataIl: (primo.consegnata || {}).quando || 0,
        sollecito1Il: sol(p.sollecito1), sollecito2Il: sol(p.sollecito2),
        rispostaIl: (inv.risposta || {}).il || 0, rispostaModo: (inv.risposta || {}).modo || (inv.risposta ? 'pec' : ''),
        saldo: inv.saldo == null ? null : inv.saldo, annullataDa: (inv.annullato || {}).da || ''
    };
}
/* La cancellazione dei dati di un incarico: una voce ogni PER_VOCE lettere,
   cosi' nessun documento supera il limite di Firestore. */
async function scriviCancellazione(db, prof, inc, schede, extra) {
    const lettere = (schede || []).map(letteraBreve);
    const parti = Math.max(1, Math.ceil(lettere.length / PER_VOCE));
    let ok = true;
    for (let i = 0; i < parti; i++) {
        const fetta = lettere.slice(i * PER_VOCE, (i + 1) * PER_VOCE);
        const scritta = await scrivi(db, prof, {
            azione: 'incarico-cancellato', incaricoId: inc.id, cliente: inc.cliente,
            dettaglio: lettere.length + (lettere.length === 1 ? ' lettera tolta' : ' lettere tolte') + ' dal portale, con PDF, date dei solleciti ed elenco di ricevute e risposte'
                + (extra && extra.bozze ? '; ' + extra.bozze + (extra.bozze === 1 ? ' bozza non inviata tolta' : ' bozze non inviate tolte') : '')
                + '. I messaggi restano nella casella PEC.' + (parti > 1 ? ' Riepilogo delle lettere: parte ' + (i + 1) + ' di ' + parti + '.' : ''),
            lettere: fetta, dati: { lettere: lettere.length, parte: i + 1, parti: parti }
        });
        ok = ok && scritta;
    }
    return ok;
}

function conId(s) { return Object.assign({ id: s.id }, s.data() || {}); }
/* Per un incarico: tutte le sue voci, dalla piu' recente. Per tutti: una
   pagina per volta, dalla piu' recente (`prima` e' il segno da cui ripartire).
   Solo uguaglianze, o un intervallo sullo stesso campo su cui si ordina:
   nessun indice da creare a mano. */
async function elenco(db, opz) {
    opz = opz || {};
    if (opz.incaricoId) {
        const q = await db.collection(REG).where('incaricoId', '==', String(opz.incaricoId)).get();
        const tutte = q.docs.map(conId).sort((a, b) => (b.quando || 0) - (a.quando || 0));
        return { voci: tutte.slice(0, 2000), totale: tutte.length, altre: false, prima: 0 };
    }
    const limite = Math.max(1, Math.min(500, Math.round(Number(opz.limite) || 200)));
    const prima = Math.round(Number(opz.prima) || 0);
    let q = db.collection(REG);
    if (prima > 0) q = q.where('quando', '<=', prima);
    const s = await q.orderBy('quando', 'desc').limit(limite + 1).get();
    const voci = s.docs.map(conId);
    const altre = voci.length > limite;
    return { voci: voci.slice(0, limite), altre: altre, prima: altre ? (voci[limite].quando || 0) : 0 };
}
/* La voce come la vede l'area riservata. */
function perArea(v) {
    return {
        id: v.id, quando: v.quando || 0, da: v.da || '', nome: v.nome || '', perConto: v.perConto || '',
        azione: v.azione || '', titolo: v.titolo || v.azione || '',
        incaricoId: v.incaricoId || '', cliente: v.cliente || '', ambito: v.ambito || '',
        invio: v.invio || '', codice: v.codice || '', destinatario: v.destinatario || '', pec: v.pec || '',
        dettaglio: v.dettaglio || '', campi: v.campi || [], dati: v.dati || {}, lettere: v.lettere || null
    };
}

module.exports = { REG, AZIONI, SISTEMA, scrivi, scriviCancellazione, diLettera, letteraBreve, elenco, perArea };
