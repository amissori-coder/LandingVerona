/* ============================================================
   Riepilogo serale delle iscrizioni (Milano 2027)
   ------------------------------------------------------------
   A mezzanotte, ora di Milano, agli organizzatori parte una mail
   con chi si e' iscritto nella giornata appena finita e il totale
   delle iscrizioni, con il collegamento all'area riservata.
   SE NELLA GIORNATA NON SI E' ISCRITTO NESSUNO NON PARTE NIENTE:
   una mail che dice "zero" ogni notte smette presto di essere letta.

   Gli eventi sono quelli di lib/iscrizione-verificata.js (EVENTI):
   lo stesso riconoscimento della pagina, cosi' contano anche le
   iscrizioni inserite a mano dall'area riservata (titolo corto).

   Il lavoro lo fa api/riepilogo-iscrizioni.js; qui ci sono i conti,
   separati perche' si possano provare senza Firestore vero.
   ============================================================ */

const VERIFICATA = require('./iscrizione-verificata');

/* Chi riceve il riepilogo. Si puo' cambiare senza toccare il codice con la
   variabile RIEPILOGO_DESTINATARI (indirizzi separati da virgola). */
const DESTINATARI = [
    'andreamissori@revilaw.it',
    'pierluigisterzi@revilaw.it',
    'ombrettamagaraci@revilaw.it',
    'sergiomiele@revilaw.it',
    'vincenzoantonionapolitano@revilaw.it'
];
function destinatari() {
    const env = String(process.env.RIEPILOGO_DESTINATARI || '').split(/[,;\s]+/).map(s => s.trim().toLowerCase()).filter(s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
    return env.length ? env : DESTINATARI.slice();
}

// "2027-02-26" del momento indicato, ora di Roma
function giornoRoma(ms) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}
function oraRoma(ms) {
    return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', hour12: false }).format(new Date(ms))) % 24;
}
// il giorno prima di "aaaa-mm-gg"
function giornoPrima(g) {
    const d = new Date(g + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
}
// "26/02/2027" per la mail
function giornoLeggibile(g) {
    const p = String(g).split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
}

/* Il giorno d'iscrizione di una scheda: dal momento in cui il servizio l'ha
   ricevuta (ricevuto), oppure dalla data scritta dal modulo ("gg/mm/aaaa
   hh:mm:ss", gia' ora di Roma) per le schede che non hanno l'altro. */
function giornoDi(s) {
    const r = s && s.ricevuto;
    const ms = r && typeof r.toMillis === 'function' ? r.toMillis() : (typeof r === 'number' ? r : null);
    if (ms) return giornoRoma(ms);
    const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(String((s && s.data) || ''));
    return m ? m[3] + '-' + m[2] + '-' + m[1] : '';
}
function attiva(s) {
    return !!s && !s.annullato && Number(s.partecipanti) !== 0;
}
function confermata(s) {
    return !!(s && s.emailConfermata && s.emailConfermata.quando);
}
// il cellulare verificato con il codice SMS (le schede inserite a mano non lo hanno)
function cellulareVerificato(s) {
    return !!(s && s.telefonoVerificato && s.telefonoVerificato.quando);
}

/* I conti di un evento per un giorno: dalle schede (id + dati) alle righe
   della mail. `schede` e' un elenco di { id, dati }. */
function conti(schede, ev, giorno) {
    const dellEvento = schede.filter(x => ev.se.test(String((x.dati || {}).pagina || '').trim()));
    const attive = dellEvento.filter(x => attiva(x.dati));
    const nuove = attive.filter(x => giornoDi(x.dati) === giorno)
        .sort((a, b) => String((a.dati || {}).data || '').localeCompare(String((b.dati || {}).data || '')));
    return {
        evento: ev,
        giorno: giorno,
        nuove: nuove.map(x => {
            const s = x.dati || {};
            return {
                nome: [s.nome, s.cognome].filter(Boolean).join(' ').trim() || '(senza nome)',
                azienda: String(s.azienda || ''),
                ruolo: String(s.ruolo || ''),
                email: String(s.email || ''),
                telefono: String(s.telefono || ''),
                ora: (/\d{2}:\d{2}/.exec(String(s.data || '')) || [''])[0],
                confermata: confermata(s),
                cellulare: cellulareVerificato(s),
                invito: s.selezionata ? String(s.invitoAzienda || s.azienda || '') : ''
            };
        }),
        totale: attive.length,
        confermate: attive.filter(x => confermata(x.dati)).length,
        cellulari: attive.filter(x => cellulareVerificato(x.dati)).length
    };
}

module.exports = { EVENTI: VERIFICATA.EVENTI, destinatari, DESTINATARI, giornoRoma, oraRoma, giornoPrima, giornoLeggibile, giornoDi, conti };
