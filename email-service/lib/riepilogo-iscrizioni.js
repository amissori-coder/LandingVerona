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

   GLI ADERENTI (cena e meeting di Milano, lib/iscrizioni-aderenti.js)
   hanno un riepilogo loro, una mail a parte agli stessi destinatari:
   non c'e' un'email da confermare - l'iscrizione vale dall'invio del
   modulo - e quello che serve a chi organizza sono i dati per la
   fattura. Niente avviso a ogni iscrizione: tutto a mezzanotte, come
   per le aziende (vedi contiAderenti).

   Il lavoro lo fa api/riepilogo-iscrizioni.js; qui ci sono i conti,
   separati perche' si possano provare senza Firestore vero.
   ============================================================ */

const VERIFICATA = require('./iscrizione-verificata');
const ADERENTI = require('./iscrizioni-aderenti');
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

/* ---------- gli aderenti ----------
   UN'ISCRIZIONE DEGLI ADERENTI CONTA QUANDO ARRIVA: non c'e' una conferma
   dell'email da aspettare. Per una quota e un giorno:
     - "nuove" sono le schede arrivate per la prima volta quel giorno
       (primaVolta), con i dati dell'ultimo invio: se la persona ha corretto
       qualcosa in giornata, vale gia' la correzione;
     - "aggiornate" sono quelle arrivate prima e inviate di nuovo quel giorno
       (quando): chi fattura deve usare i dati nuovi, e quali campi della
       fatturazione sono cambiati lo dice `cambiati`, rispetto ai dati che
       c'erano alla fine del giorno prima (la `storia` della scheda);
     - "totale" sono le iscrizioni in tutto, e "daFatturare" quelle senza la
       fattura segnata come emessa, con l'importo IVA inclusa.
   Le schede tolte dall'area riservata non ci sono piu', e non contano.
   `schede` e' un elenco di { id, dati } della collezione delle quote. */
const CAMPI_FATTURA = [
    ['Intestatario', f => f.intestatario],
    ['Partita IVA', f => f.partitaIva],
    ['Codice fiscale', f => f.codiceFiscale],
    ['Sede', f => [f.indirizzo, f.cap, f.comune, f.provincia].join('|')],
    ['Codice destinatario', f => f.codiceDestinatario],
    ['PEC', f => f.pec],
    ['Email per la fattura', f => f.emailFatture]
];
function contiAderenti(schede, q, giorno) {
    const ms = v => Number(v) || 0;
    const primaDi = s => ms(s.primaVolta) || ms(s.quando);
    const della = schede.filter(x => String((x.dati || {}).quota || '') === q.id);
    const aderente = s => {
        const f = s.fatturazione || {};
        const p = primaDi(s), u = ms(s.quando);
        return {
            nome: [s.nome, s.cognome].filter(Boolean).join(' ').trim() || '(senza nome)',
            email: String(s.email || ''),
            telefono: String(s.telefono || ''),
            studio: String(s.studio || ''),
            citta: String(s.citta || ''),
            ora: p ? oraRomaDi(p) : '',
            // l'ultimo invio, se non e' il primo
            aggiornataAlle: u && u !== p && giornoRoma(u) === giorno ? oraRomaDi(u) : '',
            fatturazione: {
                intestatario: String(f.intestatario || ''), partitaIva: String(f.partitaIva || ''),
                codiceFiscale: String(f.codiceFiscale || ''),
                sede: f.indirizzo ? f.indirizzo + ', ' + [f.cap, f.comune].filter(Boolean).join(' ') + (f.provincia ? ' (' + f.provincia + ')' : '') : '',
                codiceDestinatario: String(f.codiceDestinatario || ''), pec: String(f.pec || ''),
                emailFatture: String(f.emailFatture || '')
            },
            note: String(s.note || ''),
            totale: Number((s.importi || {}).totale) || 0,
            fatturaEmessa: !!(s.fattura && s.fattura.emessa)
        };
    };
    const nuove = della.filter(x => primaDi(x.dati) && giornoRoma(primaDi(x.dati)) === giorno)
        .sort((a, b) => primaDi(a.dati) - primaDi(b.dati))
        .map(x => aderente(x.dati));
    const aggiornate = della.filter(x => {
        const p = primaDi(x.dati), u = ms(x.dati.quando);
        return p && u && giornoRoma(p) < giorno && giornoRoma(u) === giorno;
    }).sort((a, b) => ms(a.dati.quando) - ms(b.dati.quando)).map(x => {
        const s = x.dati;
        const a = aderente(s);
        a.aggiornataAlle = oraRomaDi(ms(s.quando));
        /* I dati che c'erano a fine giornata ieri: l'ultima versione della
           storia arrivata prima di oggi. Senza (una storia gia' sfoltita) non
           si sa che cosa e' cambiato, e non lo si inventa. */
        const prima = (Array.isArray(s.storia) ? s.storia : [])
            .filter(v => v && ms(v.quando) && giornoRoma(ms(v.quando)) < giorno && v.fatturazione).pop();
        a.cambiati = prima
            ? CAMPI_FATTURA.filter(c => String(c[1](prima.fatturazione || {}) || '') !== String(c[1](s.fatturazione || {}) || '')).map(c => c[0])
            : null;
        return a;
    });
    const daFatturare = della.filter(x => !((x.dati || {}).fattura && x.dati.fattura.emessa));
    const somma = rr => Math.round(rr.reduce((t, x) => t + (Number(((x.dati || {}).importi || {}).totale) || 0), 0) * 100) / 100;
    return {
        quota: q,
        giorno: giorno,
        nuove: nuove,
        aggiornate: aggiornate,
        totale: della.length,
        daFatturare: daFatturare.length,
        totaleDaFatturare: somma(daFatturare)
    };
}
// c'e' qualcosa da dire? iscrizioni nuove oppure dati cambiati
function daSpedireAderenti(c) {
    return !!(c && (c.nuove.length || c.aggiornate.length));
}

module.exports = {
    EVENTI: VERIFICATA.EVENTI, QUOTE_ADERENTI: ADERENTI.QUOTE, COLLEZIONE_ADERENTI: ADERENTI.COLLEZIONE,
    destinatari, DESTINATARI, giornoRoma, oraRoma, giornoPrima, giornoLeggibile, giornoDi,
    conti, daSpedire, contiAderenti, daSpedireAderenti
};
