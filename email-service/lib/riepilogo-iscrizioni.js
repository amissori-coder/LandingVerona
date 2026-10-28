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
   stanno nella STESSA mail, in una parte loro: non c'e' un'email da
   confermare - l'iscrizione vale dall'invio del modulo - e quello che
   serve a chi organizza sono i dati per la fattura. Niente avviso a ogni
   iscrizione: tutto a mezzanotte, come per le aziende (vedi
   contiAderenti; la mail e' MNGB.riepilogoSerale).

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
   `schede` e' un elenco di { id, dati }; `presenze`, se c'e', la Map dei
   documenti delle presenze: chi e' segnato "presente" in sala non aspetta
   piu' la conferma (CONFERMA.inAttesaDiConferma). */
function conti(schede, ev, giorno, presenze) {
    const GIRO = presenze ? require('./giro-conferme') : null;
    const presenzaDi = s => (GIRO ? presenze.get(GIRO.idPresenza(ev, s)) : null) || null;
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
    /* Le conferme d'ufficio di chi e' stato spostato fra aderenti o sponsor
       (come: 'spostamento') non sono persone che hanno confermato: le ha
       spostate chi riceve questo riepilogo. Contano nel totale, non qui. */
    const daSpostamento = x => ((x.dati || {}).emailConfermata || {}).come === 'spostamento';
    const nuove = attive.filter(x => quandoConfermata(x.dati) && giornoRoma(quandoConfermata(x.dati)) === giorno && !daSpostamento(x))
        .sort((a, b) => quandoConfermata(a.dati) - quandoConfermata(b.dati))
        .map(x => persona(x.dati, oraRomaDi(quandoConfermata(x.dati)), ''));
    /* La conferma vale per l'INDIRIZZO, come nei totali e nell'elenco (app.js,
       confermaEmailDi): chi ha un'altra riga confermata con lo stesso indirizzo
       non aspetta, e la mail non lo conta due volte (nel totale e fra gli in attesa). */
    const em = v => String(v || '').trim().toLowerCase();
    const confermati = new Set(schede.map(x => x.dati || {}).filter(s => dellEventoComeElenco(ev, s) && attiva(s) && s.emailConfermata && em(s.email)).map(s => em(s.email)));
    const inAttesa = attive.filter(x => CONFERMA.inAttesaDiConferma(x.dati, presenzaDi(x.dati)) && !confermati.has(em((x.dati || {}).email))
        && giornoDi(x.dati) && giornoDi(x.dati) <= giorno)
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
   dell'email da aspettare. Per una quota e un PERIODO di giorni, da `dal` a
   `giorno` compresi (di solito uno solo: la giornata appena finita; di piu'
   quando una notte la mail non e' partita e la notte dopo recupera, vedi
   api/riepilogo-iscrizioni.js):
     - "nuove" sono le schede arrivate per la prima volta nel periodo
       (primaVolta), con i dati dell'ultimo invio: se la persona ha corretto
       qualcosa nel frattempo, vale gia' la correzione;
     - "aggiornate" sono quelle arrivate prima e inviate di nuovo nel periodo
       (quando): chi fattura deve usare i dati nuovi, e quali campi della
       fatturazione sono cambiati lo dice `cambiati`, rispetto ai dati che
       c'erano prima del periodo (la `storia` della scheda);
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
// il giorno dopo di "aaaa-mm-gg", e quello di n giorni prima
function giornoDopo(g) {
    const d = new Date(g + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
}
function giorniPrima(g, n) {
    const d = new Date(g + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
}
function contiAderenti(schede, q, giorno, dal) {
    dal = dal && dal < giorno ? dal : giorno;
    const nelPeriodo = g => !!g && g >= dal && g <= giorno;
    // su piu' giorni l'ora da sola non basta: "04/11 alle 10:00"
    const quando = ms => ms ? (dal !== giorno ? giornoLeggibile(giornoRoma(ms)).slice(0, 5) + ' alle ' : 'alle ') + oraRomaDi(ms) : '';
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
            arrivata: quando(p),
            // l'ultimo invio, se non e' il primo e sta nel periodo
            corretta: u && u !== p && nelPeriodo(giornoRoma(u)) ? quando(u) : '',
            fatturazione: {
                intestatario: String(f.intestatario || ''), partitaIva: String(f.partitaIva || ''),
                codiceFiscale: String(f.codiceFiscale || ''),
                sede: f.indirizzo ? f.indirizzo + ', ' + [f.cap, f.comune].filter(Boolean).join(' ') + (f.provincia ? ' (' + f.provincia + ')' : '') : '',
                codiceDestinatario: String(f.codiceDestinatario || ''), pec: String(f.pec || ''),
                emailFatture: String(f.emailFatture || '')
            },
            note: String(s.note || ''),
            totale: Number((s.importi || {}).totale) || 0,
            fatturaEmessa: !!(s.fattura && s.fattura.emessa),
            /* iscritto dallo spostamento fra gli aderenti dell'area riservata:
               i dati per la fattura li deve ancora mandare lui, dalla pagina */
            daSpostamento: !!s.daSpostamento,
            datiFatturaMancanti: !f.intestatario,
            /* la mail all'iscritto (quota e dati di fatturazione) e' partita?
               Senza l'avviso interno di una volta, e' qui che lo si scopre */
            mailNonPartita: s.mail === false
        };
    };
    const nuove = della.filter(x => nelPeriodo(primaDi(x.dati) ? giornoRoma(primaDi(x.dati)) : ''))
        .sort((a, b) => primaDi(a.dati) - primaDi(b.dati))
        .map(x => aderente(x.dati));
    const aggiornate = della.filter(x => {
        const p = primaDi(x.dati), u = ms(x.dati.quando);
        return p && u && giornoRoma(p) < dal && nelPeriodo(giornoRoma(u));
    }).sort((a, b) => ms(a.dati.quando) - ms(b.dati.quando)).map(x => {
        const s = x.dati;
        const a = aderente(s);
        a.corretta = quando(ms(s.quando));
        /* I dati che c'erano prima del periodo: l'ultima versione della
           storia arrivata prima di `dal`. Senza (una storia gia' sfoltita)
           non si sa che cosa e' cambiato, e non lo si inventa. */
        const prima = (Array.isArray(s.storia) ? s.storia : [])
            .filter(v => v && ms(v.quando) && giornoRoma(ms(v.quando)) < dal && v.fatturazione).pop();
        a.cambiati = prima
            ? CAMPI_FATTURA.filter(c => String(c[1](prima.fatturazione || {}) || '') !== String(c[1](s.fatturazione || {}) || '')).map(c => c[0])
            : null;
        return a;
    });
    const daFatturare = della.filter(x => !((x.dati || {}).fattura && x.dati.fattura.emessa));
    const somma = rr => Math.round(rr.reduce((t, x) => t + (Number(((x.dati || {}).importi || {}).totale) || 0), 0) * 100) / 100;
    return {
        quota: q,
        dal: dal,
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

/* ---------- il totale con gli aderenti ----------
   Numeri da non confondere, nella mail di mezzanotte come nei riquadri
   dell'area riservata (che li spartisce in due riepiloghi, in presenza e
   online, con questa stessa regola: la loro somma e' questa):
     TOTALE AZIENDE            le persone iscritte al convegno, in sala e
                               online, tolti gli aderenti e sponsor e relatori;
     ADERENTI                  chi e' iscritto alla cena e al meeting e chi
                               sta nella sezione "Aderenti Revilaw"
                               dell'elenco del convegno;
     SPONSOR E RELATORI        chi sta nella sezione "Sponsor e relatori":
                               chi l'evento lo fa, che un posto lo occupa ma
                               non e' un'azienda ospite;
     TOTALE                    tutte le persone dell'evento, ognuna una
                               volta: aziende + aderenti + sponsor.
   Chi e' iscritto al convegno E alla cena e al meeting (stesso indirizzo
   email) e' un aderente, e si conta una volta sola, con la cena - anche se
   la sua riga del convegno sta fra sponsor e relatori.
   Del convegno contano le stesse persone dei riquadri dell'area riservata:
   le iscrizioni attive, fuori chi aspetta ancora di confermare l'email e
   gli invitati ai soli incontri B2B (che in elenco non ci sono), una riga
   per le persone della colonna Partecipanti se c'e', altrimenti una.
   LA STESSA REGOLA sta in area-riservata/app.js (totaliConAderenti): se
   cambia qui va cambiata la', e prove/totali-aderenti.prove.js le mette a
   confronto.
   `convegno`: [{ email, persone, aderente, sponsor, gruppo }], le righe gia'
   scelte (`gruppo`: il gruppo dell'ordine, o il documento della riga);
   `cena`: [{ email }], le iscrizioni alla cena e al meeting. Un aderente
   della cena che sta su una riga del convegno per piu' persone toglie da
   quella riga solo se stesso. */
function totaliConAderenti(convegno, cena) {
    const chiave = e => String(e || '').trim().toLowerCase();
    const dellaCena = new Set((cena || []).map(x => chiave(x && x.email)).filter(Boolean));
    let aziende = 0, soloConvegno = 0, sponsor = 0;
    const anche = new Set();
    const tolti = new Set();
    (convegno || []).forEach(r => {
        const k = chiave(r && r.email);
        let n = Math.max(0, Number(r && r.persone) || 0);
        /* E' un aderente della cena: lui si conta con la cena, una volta sola
           per ogni iscrizione (due iscrizioni con il suo indirizzo sono lui due
           volte, un doppio). Dentro lo STESSO gruppo (un ordine per piu' posti:
           l'intestatario e i posti 2..N) toglie se stesso una volta: un compagno
           con lo stesso indirizzo dell'intestatario e' un'altra persona, e gli
           altri della riga (un ordine da Eventbrite per tre) restano dove sono. */
        if (k && dellaCena.has(k)) {
            anche.add(k);
            const g = r && r.gruppo ? k + '\n' + r.gruppo : '';
            if (!g || !tolti.has(g)) { if (g) tolti.add(g); n = Math.max(0, n - 1); }
        }
        if (r && r.aderente) soloConvegno += n; else if (r && r.sponsor) sponsor += n; else aziende += n;
    });
    const cenaN = (cena || []).length;
    return {
        aziende: aziende,
        aderenti: cenaN + soloConvegno,
        sponsor: sponsor,
        cena: cenaN,
        soloConvegno: soloConvegno,
        anche: anche.size,
        tutti: aziende + cenaN + soloConvegno + sponsor
    };
}
const SEZIONI = ['presenza', 'aderenti', 'sponsor', 'online', 'b2b'];
// la sezione di una riga: la scelta di chi organizza (fra le presenze), poi il modulo; il resto vale in presenza
function sezioneDi(s, p) {
    const m = String((p && p.modalita) || (s && s.modalita) || '').toLowerCase();
    return SEZIONI.indexOf(m) >= 0 ? m : 'presenza';
}
function personeDi(s) {
    const n = parseInt((s && s.extra && s.extra.Partecipanti) || '', 10);
    return n > 0 ? Math.min(99, n) : 1;
}
function chiaveTesto(s) {
    return String(s == null ? '' : s).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
/* La riga e' dell'evento? Come l'elenco dell'area riservata (api/iscrizioni.js):
   la pagina, senza maiuscole e accenti, contiene il `filtro` dell'evento. */
function dellEventoComeElenco(ev, s) {
    return ev.filtro ? chiaveTesto(s && s.pagina).indexOf(ev.filtro) >= 0 : ev.se.test(String((s && s.pagina) || '').trim());
}
/* I totali di un evento dai dati del servizio, contando le STESSE righe
   dell'elenco dell'area riservata: `schede` le iscrizioni, `presenze` una Map
   dal nome del documento delle presenze ai suoi dati, `aderenti` le schede
   della collezione delle quote ({ id, dati }), `cancellate` un Set di
   "evento~idIscritto" delle righe tolte dall'elenco (iscrizioniCancellate).
   Come nell'elenco, la conferma dell'email vale per l'INDIRIZZO: una riga
   che aspetta la conferma non aspetta piu' se un'altra riga con lo stesso
   indirizzo l'ha confermata (app.js, confermaEmailDi). */
function totali(schede, presenze, ev, aderenti, cancellate) {
    const GIRO = require('./giro-conferme');
    const em = v => String(v || '').trim().toLowerCase();
    const righe = (schede || []).map(x => ({ s: x.dati || {}, id: String(x.id || '') }))
        .filter(({ s }) => dellEventoComeElenco(ev, s) && attiva(s) && !(cancellate && cancellate.has(ev.chiave + '~' + GIRO.idIscritto(s))));
    const confermati = new Set(righe.filter(({ s }) => s.emailConfermata && em(s.email)).map(({ s }) => em(s.email)));
    const convegno = [];
    righe.forEach(({ s, id }) => {
        const p = (presenze && presenze.get(GIRO.idPresenza(ev, s))) || null;
        const sez = sezioneDi(s, p);
        if (s.soloB2B === true || sez === 'b2b') return;
        if (CONFERMA.inAttesaDiConferma(s, p) && !confermati.has(em(s.email))) return;
        convegno.push({ email: s.email, persone: personeDi(s), aderente: sez === 'aderenti', sponsor: sez === 'sponsor', gruppo: String(s.gruppo || id || '') });
    });
    const quote = ADERENTI.QUOTE.filter(q => q.evento === ev.chiave).map(q => q.id);
    const cena = (aderenti || []).filter(x => quote.indexOf(String((x.dati || {}).quota || '')) >= 0)
        .map(x => ({ email: (x.dati || {}).email }));
    return totaliConAderenti(convegno, cena);
}

module.exports = {
    EVENTI: VERIFICATA.EVENTI, QUOTE_ADERENTI: ADERENTI.QUOTE, COLLEZIONE_ADERENTI: ADERENTI.COLLEZIONE,
    destinatari, DESTINATARI, giornoRoma, oraRoma, giornoPrima, giornoDopo, giorniPrima, giornoLeggibile, giornoDi,
    conti, daSpedire, contiAderenti, daSpedireAderenti, totali, totaliConAderenti
};
