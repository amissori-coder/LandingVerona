/* ============================================================
   Riepilogo serale delle iscrizioni (Milano 2027)
   ------------------------------------------------------------
   A mezzanotte, ora di Milano, agli organizzatori parte una mail
   con le iscrizioni COMPLETATE nella giornata appena finita (email
   confermata), chi e' ancora in attesa di confermare l'email e il
   totale delle iscrizioni confermate, con il collegamento all'area
   riservata. Se non c'e' nessuna conferma nuova e nessuno in attesa
   non parte niente.

   Gli eventi sono quelli di lib/iscrizione-verificata.js (EVENTI):
   lo stesso riconoscimento della pagina, cosi' contano anche le
   iscrizioni inserite a mano dall'area riservata (titolo corto).

   Il lavoro lo fa api/riepilogo-iscrizioni.js; qui ci sono i conti,
   separati perche' si possano provare senza Firestore vero.
   ============================================================ */

const VERIFICATA = require('./iscrizione-verificata');
// chi e' "in attesa di conferma": la stessa regola dei promemoria e dell'area riservata
const CONFERMA = require('./conferma-email');

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
/* Quando l'email e' stata confermata (ms), o null. */
function quandoConfermata(s) {
    const q = s && s.emailConfermata && s.emailConfermata.quando;
    return typeof q === 'number' ? q : (q && typeof q.toMillis === 'function' ? q.toMillis() : null);
}
function oraRomaDi(ms) {
    return new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));
}

/* I conti di un evento per un giorno.
   UN'ISCRIZIONE CONTA QUANDO L'EMAIL E' CONFERMATA: e' quello il momento in
   cui la registrazione e' completa (il cellulare, dal sito, e' verificato
   prima ancora di poter inviare il modulo). Percio':
     - "nuove" sono le iscrizioni con l'email confermata NEL GIORNO, anche se
       il modulo era stato inviato giorni prima;
     - "inAttesa" sono quelle inviate (fino a quel giorno compreso) e non
       ancora confermate: tornano ogni notte, finche' non confermano, e quella
       notte passano fra le nuove. Chi e' "in attesa" lo dice
       CONFERMA.inAttesaDiConferma, la regola dei promemoria e della sezione
       dell'area riservata: le iscrizioni inserite a mano e quelle con un
       Portale (Eventbrite, il desk) non hanno una mail da confermare e qui
       non compaiono mai;
     - "totale" sono le iscrizioni confermate in tutto.
   `schede` e' un elenco di { id, dati }. */
function conti(schede, ev, giorno) {
    const dellEvento = schede.filter(x => ev.se.test(String((x.dati || {}).pagina || '').trim()));
    const attive = dellEvento.filter(x => attiva(x.dati));
    const persona = (s, ora, quando) => ({
        nome: [s.nome, s.cognome].filter(Boolean).join(' ').trim() || '(senza nome)',
        azienda: String(s.azienda || ''),
        ruolo: String(s.ruolo || ''),
        email: String(s.email || ''),
        telefono: String(s.telefono || ''),
        ora: ora,
        iscritto: quando,
        invito: s.selezionata ? String(s.invitoAzienda || s.azienda || '') : ''
    });
    const nuove = attive.filter(x => quandoConfermata(x.dati) && giornoRoma(quandoConfermata(x.dati)) === giorno)
        .sort((a, b) => quandoConfermata(a.dati) - quandoConfermata(b.dati))
        .map(x => persona(x.dati, oraRomaDi(quandoConfermata(x.dati)), ''));
    const inAttesa = attive.filter(x => CONFERMA.inAttesaDiConferma(x.dati) && giornoDi(x.dati) && giornoDi(x.dati) <= giorno)
        .sort((a, b) => (giornoDi(a.dati) + String((a.dati || {}).data || '')).localeCompare(giornoDi(b.dati) + String((b.dati || {}).data || '')))
        .map(x => {
            const s = x.dati || {};
            const g = giornoDi(s);
            return persona(s, (/\d{2}:\d{2}/.exec(String(s.data || '')) || [''])[0], g ? giornoLeggibile(g).slice(0, 5) : '');
        });
    return {
        evento: ev,
        giorno: giorno,
        nuove: nuove,
        inAttesa: inAttesa,
        totale: attive.filter(x => confermata(x.dati)).length
    };
}
// c'e' qualcosa da dire? nuove conferme oppure qualcuno ancora in attesa
function daSpedire(c) {
    return !!(c && (c.nuove.length || c.inAttesa.length));
}

module.exports = { EVENTI: VERIFICATA.EVENTI, destinatari, DESTINATARI, giornoRoma, oraRoma, giornoPrima, giornoLeggibile, giornoDi, conti, daSpedire };
