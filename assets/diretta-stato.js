/*
 * Stato della diretta per il sito pubblico (home page e pagina dell'evento)
 *
 * ATTENZIONE: EVENTO qui sotto copia data e orari dell'evento in Gestione
 * (/diretta/gestione/): se cambi data o orario in Gestione, aggiorna anche
 * qui; d'inverno +01:00. Le date sono in ora di Roma con il fuso scritto in
 * fondo: +02:00 con l'ora legale (fino all'ultima domenica di ottobre),
 * +01:00 con l'ora solare.
 *
 * Componente autonomo, senza dipendenze: window.NGBDiretta.
 * - Tiene in UN solo posto le date dell'evento trasmesso in diretta: il popup
 *   della home (diretta-popup.js), la pillola fissa della home e i pulsanti
 *   della pagina di Napoli leggono da qui la finestra in cui comparire e
 *   l'orario da mostrare.
 * - Dice se l'evento e' "in onda" SENZA chiamare Firebase: legge il piccolo
 *   endpoint pubblico del servizio (api/diretta-stato), che ha una cache di
 *   20-30 secondi sulla rete di Vercel. Qui sopra c'e' una seconda cache, in
 *   sessionStorage, di 60 secondi, e una sola richiesta in volo per pagina.
 * - Soprattutto: lo stato si chiede SOLO il giorno dell'evento, da 3 ore
 *   prima dell'inizio a 3 ore dopo la fine prevista (se si sfora, il sito
 *   deve continuare a dire "in diretta"), e non piu' appena si legge
 *   'terminato'. Negli altri giorni nessun visitatore fa richieste: la
 *   risposta la sappiamo gia'.
 * - Gli stati possibili sono 'programmato', 'in_onda', 'pausa' e
 *   'terminato'. Da stato e orario si ricava quello che il sito deve
 *   mostrare (condizione()): fuori, prima, oggi, in_onda, pausa, conclusa.
 *
 * Agganci nelle pagine (tutti facoltativi; nessuno = nessuna richiesta):
 * - <html data-diretta="..."> riceve la condizione (per i fogli di stile) e
 *   <html data-diretta-stato="..."> l'ultimo stato letto dal servizio;
 * - .indicatore-live   (IN DIRETTA) visibile solo mentre si e' in onda;
 * - .indicatore-pausa  ("In pausa") visibile solo durante una pausa;
 * - [data-diretta-aperta]   visibile finche' la diretta non e' conclusa
 *   (pulsanti e voci di menu che portano alla diretta);
 * - [data-diretta-conclusa] visibile solo dopo la fine (va scritto con
 *   l'attributo hidden, cosi' senza JavaScript non compare);
 * - data-pillola sul tag <script> di questo file: aggiunge la pillola fissa
 *   #dirPillola in basso a sinistra (la home), accesa per tutta la finestra
 *   dell'evento, anche dopo "Non mostrare più" del popup (che riguarda solo
 *   il popup), con l'indicatore IN DIRETTA mentre si e' in onda.
 * Tutto si aggiorna da solo ogni 60 secondi, senza ricaricare la pagina.
 */
(function () {
  "use strict";

  // --- Configurazione ---------------------------------------------------
  var EVENTO = {
    id: "napoli-2026",
    titolo: "Napoli, 2 ottobre 2026",
    citta: "Napoli",
    inizio: "2026-10-02T09:00:00+02:00",
    fine: "2026-10-02T17:30:00+02:00",
    // il popup e la pillola della home compaiono da tanti giorni prima
    // dell'inizio fino alla fine dell'evento, poi si spengono da soli
    mostraDaGiorni: 7,
    pagina: "/napoli_ottobre_2026/",
    urlDiretta: "/diretta/"
  };
  var SERVIZIO = "https://revilaw-email.vercel.app/api/diretta-stato";
  var FUSO = "Europe/Rome";
  var ORE_PRIMA = 3;          // lo stato si chiede da 3 ore prima dell'inizio...
  var ORE_DOPO = 3;           // ...fino a 3 ore dopo la fine prevista
  var CACHE_MS = 60 * 1000;   // una lettura vale 60 secondi per tutta la scheda
  var RICONTROLLO_MS = 60 * 1000;
  var ATTESA_MAX_MS = 8000;   // oltre, la richiesta si considera fallita
  var SS_CACHE = "ngbDirettaStato_" + EVENTO.id;
  var STATI = { programmato: 1, in_onda: 1, pausa: 1, terminato: 1 };

  // Il tag <script> di questo file, letto subito: dopo non e' piu' disponibile.
  var QUESTO_SCRIPT = document.currentScript;

  var ORA_MS = 60 * 60 * 1000;
  var GIORNO_MS = 24 * ORA_MS;
  var GIORNI = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
  var MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio",
    "agosto", "settembre", "ottobre", "novembre", "dicembre"];

  // --- Date -------------------------------------------------------------
  // Le date sono scritte in ISO con il fuso di Roma: se ne ricavano sia
  // l'istante (per i confronti) sia l'ora "da orologio" da mostrare, senza
  // dipendere dal fuso del computer di chi visita.
  function partiIso(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/.exec(String(iso || ""));
    if (!m) return null;
    return { data: m[1] + "-" + m[2] + "-" + m[3], anno: +m[1], mese: +m[2], giorno: +m[3],
      ore: +m[4], minuti: m[5], fuso: m[6] || "" };
  }
  var INIZIO = Date.parse(EVENTO.inizio);
  var FINE = Date.parse(EVENTO.fine);
  var FINE_LETTURA = FINE + ORE_DOPO * ORA_MS;
  var pInizio = partiIso(EVENTO.inizio);
  var pFine = partiIso(EVENTO.fine);

  function istante(adesso) {
    var t = adesso instanceof Date ? adesso.getTime() : adesso;
    return typeof t === "number" && isFinite(t) ? t : Date.now();
  }

  // Il giorno di calendario a Roma di un istante, come 'YYYY-MM-DD': il
  // "giorno dell'evento" comincia alla mezzanotte di Roma per tutti, anche
  // per chi visita da un altro fuso. Lo calcola Intl con il fuso vero (ora
  // legale compresa).
  var formatoGiorno = null;
  try {
    formatoGiorno = new Intl.DateTimeFormat("en-GB", {
      timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit"
    });
    if (typeof formatoGiorno.formatToParts !== "function") formatoGiorno = null;
  } catch (e) { formatoGiorno = null; }

  // Ripiego per i browser senza fusi orari in Intl (molto vecchi): lo scarto
  // scritto nella data d'inizio. Sbaglia solo se fra quel giorno e l'evento
  // cambia l'ora legale, e solo nell'ora attorno alla mezzanotte.
  function scartoFuso(fuso) {
    var m = /^([+-])(\d{2}):(\d{2})$/.exec(fuso || "");
    if (!m) return 0; // 'Z' o nessun fuso: UTC
    var minuti = (+m[2]) * 60 + (+m[3]);
    return (m[1] === "-" ? -minuti : minuti) * 60 * 1000;
  }
  var SCARTO_MS = pInizio ? scartoFuso(pInizio.fuso) : 0;

  function giornoRoma(t) {
    if (formatoGiorno) {
      try {
        var parti = formatoGiorno.formatToParts(new Date(t)), v = {};
        for (var i = 0; i < parti.length; i++) v[parti[i].type] = parti[i].value;
        if (/^\d{4}$/.test(v.year) && /^\d{2}$/.test(v.month) && /^\d{2}$/.test(v.day)) {
          return v.year + "-" + v.month + "-" + v.day;
        }
      } catch (e) { /* si passa al ripiego */ }
    }
    return new Date(t + SCARTO_MS).toISOString().slice(0, 10);
  }

  // 'fuori' (prima della finestra) | 'prima' (nella finestra, giorni
  // precedenti) | 'oggi' (giorno dell'evento a Roma, fino alla fine
  // prevista) | 'dopo' (dalla fine prevista in poi). Solo l'orario: lo
  // stato letto dal servizio lo aggiunge condizione().
  function fase(adesso) {
    var t = istante(adesso);
    if (!isFinite(INIZIO) || !isFinite(FINE) || !pInizio) return "fuori"; // date scritte male: non mostrare niente
    if (t >= FINE) return "dopo";
    if (t < INIZIO - EVENTO.mostraDaGiorni * GIORNO_MS) return "fuori";
    // confronto fra date 'YYYY-MM-DD': funziona anche come stringhe
    if (giornoRoma(t) >= pInizio.data) return "oggi";
    return "prima";
  }

  // La finestra in cui ha senso chiedere lo stato (il nome e' rimasto dal
  // primo giro: oggi arriva a 3 ore dopo la fine prevista).
  function eGiorno(adesso) {
    var t = istante(adesso);
    return t >= INIZIO - ORE_PRIMA * ORA_MS && t < FINE_LETTURA;
  }

  // Quello che il sito deve mostrare, da orario e ultimo stato letto:
  //   'fuori'    prima della finestra: in home niente popup ne' pillola
  //   'prima'    nei giorni precedenti l'evento
  //   'oggi'     il giorno dell'evento, non (ancora) in onda
  //   'in_onda'  in onda, anche oltre l'orario previsto se si sfora
  //   'pausa'    in pausa
  //   'conclusa' dopo la fine: 'terminato' letto a evento cominciato,
  //              oppure passata la fine prevista senza essere in onda
  //              (o senza essere riusciti a saperlo), e comunque 3 ore
  //              dopo la fine prevista
  // Un 'terminato' letto PRIMA dell'inizio previsto non chiude niente:
  // puo' essere solo una prova del gestore, e la diretta deve ancora esserci.
  function condizione(dati, adesso) {
    var t = istante(adesso);
    var f = fase(t);
    if (f === "fuori") return "fuori";
    if (t >= FINE_LETTURA) return "conclusa";
    var s = dati && STATI[dati.stato] ? dati.stato : "";
    if ((s === "in_onda" || s === "pausa") && eGiorno(t)) return s;
    if (f === "prima") return "prima";
    if (s === "terminato" && t >= INIZIO) return "conclusa";
    return f === "dopo" ? "conclusa" : "oggi";
  }

  // Un 'terminato' letto a evento cominciato chiude la lettura: da li' in
  // poi questa scheda non chiede piu' niente, anche a cache scaduta. Il
  // rovescio (accettato): se il gestore preme "Termina" per sbaglio e poi
  // torna in onda, chi l'ha letto in quel minuto rivede la diretta sul sito
  // solo in una nuova sessione. La pagina della diretta, invece, resta in
  // ascolto e riparte da sola.
  function eConclusiva(dati) {
    return !!(dati && dati.stato === "terminato" && typeof dati.letto === "number" && dati.letto >= INIZIO);
  }

  // "9.00", "17.30": come l'orario e' scritto nel resto del sito
  function oraLeggibile(p) { return p ? p.ore + "." + p.minuti : ""; }

  // { giorno: "venerdì 2 ottobre 2026", inizio: "9.00", fine: "17.30",
  //   giornoBreve: "2 ottobre" }
  function orario() {
    var giorno = "", breve = "";
    if (pInizio) {
      var g = new Date(Date.UTC(pInizio.anno, pInizio.mese - 1, pInizio.giorno)).getUTCDay();
      breve = pInizio.giorno + " " + MESI[pInizio.mese - 1];
      giorno = GIORNI[g] + " " + breve + " " + pInizio.anno;
    }
    return { giorno: giorno, inizio: oraLeggibile(pInizio), fine: oraLeggibile(pFine), giornoBreve: breve };
  }

  // --- Cache in sessionStorage ------------------------------------------
  function leggiCache() {
    try {
      var c = JSON.parse(sessionStorage.getItem(SS_CACHE) || "null");
      return c && typeof c.quando === "number" ? c : null;
    } catch (e) { return null; }
  }
  function scriviCache(dati) {
    try { sessionStorage.setItem(SS_CACHE, JSON.stringify({ quando: Date.now(), dati: dati })); }
    catch (e) { /* senza sessionStorage si rinuncia alla cache, non alla lettura */ }
  }

  // "14:30" o "14.30" -> "14.30"; qualsiasi altra cosa -> ""
  function ripresaLeggibile(v) {
    var m = /^([01]?\d|2[0-3])[:.]([0-5]\d)$/.exec(typeof v === "string" ? v.trim() : "");
    return m ? (+m[1]) + "." + m[2] : "";
  }

  // Tiene solo i campi attesi: la risposta viene da fuori e finisce
  // in pagina (mai il video, che questo endpoint non restituisce).
  function normalizza(json) {
    if (!json || json.ok !== true || !STATI[json.stato]) return null;
    return {
      stato: json.stato,
      id: String(json.id || EVENTO.id),
      titolo: typeof json.titolo === "string" ? json.titolo : "",
      inizio: typeof json.inizio === "number" ? json.inizio : null,
      fine: typeof json.fine === "number" ? json.fine : null,
      paginaEvento: typeof json.paginaEvento === "string" ? json.paginaEvento : "",
      // orario di ripresa di una pausa, se il servizio lo manda
      ripresa: json.stato === "pausa" ? ripresaLeggibile(json.ripresa) : "",
      letto: Date.now()
    };
  }

  // --- Lettura ----------------------------------------------------------
  var inAttesa = [];   // chi aspetta la risposta della richiesta in volo

  function rispondi(cb, dati) {
    // sempre in modo asincrono, come se la risposta arrivasse dalla rete:
    // chi chiama non deve preoccuparsi di quale dei due casi capita. Ogni
    // callback gira per conto suo: se una sbaglia, le altre ricevono lo
    // stesso la risposta (e l'errore resta visibile nella console).
    setTimeout(function () { cb(dati); }, 0);
  }

  function chiedi() {
    var finito = false;
    function fine(dati) {
      if (finito) return;
      finito = true;
      scriviCache(dati); // anche un fallimento vale 60 s: niente raffiche se il servizio non risponde
      var lista = inAttesa;
      inAttesa = [];
      for (var i = 0; i < lista.length; i++) rispondi(lista[i], dati);
    }
    try {
      // XMLHttpRequest "semplice" (GET, nessuna intestazione): nessuna
      // richiesta preliminare CORS, e la cache di Vercel risponde da sola.
      var xhr = new XMLHttpRequest();
      xhr.open("GET", SERVIZIO + "?evento=" + encodeURIComponent(EVENTO.id), true);
      xhr.timeout = ATTESA_MAX_MS;
      xhr.onload = function () {
        var json = null;
        try { json = JSON.parse(xhr.responseText); } catch (e) { json = null; }
        fine(xhr.status >= 200 && xhr.status < 300 ? normalizza(json) : null);
      };
      xhr.onerror = xhr.ontimeout = xhr.onabort = function () { fine(null); };
      xhr.send();
    } catch (e) {
      fine(null);
    }
  }

  // cb({ stato: 'programmato'|'in_onda'|'pausa'|'terminato', ... }) oppure
  // cb(null) fuori dalla finestra di lettura o se la lettura non riesce.
  function leggi(cb) { leggiDaCacheORete(cb, false); }

  // `saltaCache`: lo usa solo il ricontrollo di ogni minuto di segui(). La
  // sua copia ha, per costruzione, quasi esattamente 60 secondi (59,7 s se
  // la risposta era arrivata 300 ms dopo l'apertura): con la sola cache il
  // ricontrollo la troverebbe ancora buona e chiederebbe davvero solo ogni
  // due minuti. Anche cosi' resta una sola richiesta in volo.
  function leggiDaCacheORete(cb, saltaCache) {
    if (typeof cb !== "function") return;
    if (!eGiorno()) { rispondi(cb, null); return; }
    var c = leggiCache();
    // 'terminato' a evento cominciato: la lettura e' chiusa (vedi eConclusiva)
    if (c && eConclusiva(c.dati)) { rispondi(cb, c.dati); return; }
    var eta = c ? Date.now() - c.quando : -1;
    // eta' negativa = orologio tornato indietro: la copia non e' affidabile
    if (!saltaCache && c && eta >= 0 && eta < CACHE_MS) { rispondi(cb, c.dati || null); return; }
    inAttesa.push(cb);
    if (inAttesa.length === 1) chiedi(); // una sola richiesta in volo
  }

  // L'ultimo stato letto in questa scheda, anche se vecchio (o null): serve
  // a decidere SUBITO, senza aspettare la rete, per esempio che dopo
  // "Termina" il popup della home non deve piu' prenotarsi.
  function ultimo() {
    var c = leggiCache();
    return c && c.dati ? c.dati : null;
  }

  // Chiama cb subito e poi ogni 60 secondi finche' serve: nella finestra di
  // lettura con lo stato (o null se la lettura non riesce), fuori con null,
  // senza richieste; chi riceve null ricalcola dall'orario (e' cosi' che la
  // pillola compare da sola all'apertura della finestra, a pagina aperta).
  // Solo a scheda visibile: una scheda in secondo piano non chiede niente
  // e al ritorno si aggiorna, dalla cache se ancora buona. All'apertura
  // vale la cache (chi passa da una pagina all'altra non rifa' la
  // richiesta); il ricontrollo del minuto chiede sempre: e' lui che si
  // accorge del "Vai in onda". Si ferma da solo 3 ore dopo la fine
  // prevista o appena legge 'terminato' a evento cominciato.
  function segui(cb) {
    if (typeof cb !== "function") return function () {};
    var timer = null;
    var fermo = false;
    function giro(ricontrollo) {
      if (fermo) return;
      var t = Date.now();
      if (t >= FINE_LETTURA) { ferma(); cb(null); return; }
      if (!eGiorno(t)) { cb(null); return; }
      if (document.hidden) return;
      leggiDaCacheORete(function (dati) {
        if (fermo) return;
        if (eConclusiva(dati)) ferma();
        cb(dati);
      }, ricontrollo === true);
    }
    function alCambioVisibilita() { if (!document.hidden) giro(false); }
    function ferma() {
      fermo = true;
      if (timer) clearInterval(timer);
      timer = null;
      document.removeEventListener("visibilitychange", alCambioVisibilita);
    }
    if (Date.now() < FINE_LETTURA) {
      timer = setInterval(function () { giro(true); }, RICONTROLLO_MS);
      document.addEventListener("visibilitychange", alCambioVisibilita);
    }
    giro(false);
    return function () { ferma(); };
  }

  window.NGBDiretta = {
    EVENTO: EVENTO,
    SERVIZIO: SERVIZIO,
    fase: fase,
    eGiorno: eGiorno,
    condizione: condizione,
    giornoRoma: giornoRoma,
    leggi: leggi,
    ultimo: ultimo,
    segui: segui,
    orario: orario
  };

  // --- Pillola fissa della home (#dirPillola) ---------------------------
  // Un collegamento discreto in basso a sinistra, per tutta la finestra
  // dell'evento: resta anche dopo "Non mostrare più" del popup e porta alla
  // diretta con un tocco. Sta sopra ogni contenuto della pagina (z-index
  // 9990: la barra del sito e' a 1000) ma sotto gli avvisi del sito, che
  // sul telefono le passano sopra e che devono leggersi interi (i banner
  // degli eventi, 9998, e l'esito del modulo newsletter, showNgbNotification
  // di script.js, 9999: resta pochi secondi ed e' l'unico riscontro
  // dell'iscrizione), sotto i popup (2147482000) e sotto il banner dei
  // cookie, che deve restare usabile.
  var CSS_PILLOLA = ''
    + '#dirPillola{position:fixed;left:16px;bottom:16px;'
    + 'left:max(16px,env(safe-area-inset-left));bottom:max(16px,env(safe-area-inset-bottom));'
    + 'z-index:9990;display:inline-flex;align-items:center;gap:9px;box-sizing:border-box;'
    + 'max-width:calc(100vw - 32px);min-height:46px;padding:10px 16px 10px 14px;border-radius:999px;'
    + 'background:linear-gradient(135deg,#0A1C2E 0%,#164068 60%,#1F5688 100%);'
    + 'border:1px solid rgba(255,255,255,.16);color:#fff!important;text-decoration:none!important;'
    + 'font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;'
    + 'font-size:14px;line-height:1.2;font-weight:600;white-space:nowrap;'
    + 'box-shadow:0 12px 30px rgba(10,40,68,.34),0 2px 8px rgba(10,40,68,.2);'
    + 'transition:transform .2s ease,box-shadow .2s ease;animation:dirplEntra .45s cubic-bezier(.16,1,.3,1);}'
    + '#dirPillola[hidden]{display:none!important;}'
    + '#dirPillola:hover{transform:translateY(-2px);box-shadow:0 16px 34px rgba(10,40,68,.42),0 2px 8px rgba(10,40,68,.2);}'
    + '#dirPillola:focus-visible{outline:3px solid #8FC2EE;outline-offset:3px;}'
    + '@keyframes dirplEntra{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:none;}}'
    /* il segno davanti: pallino azzurro, poi bianco che pulsa in onda,
       due barre in pausa */
    + '#dirPillola .dirpl-segno{flex:0 0 auto;box-sizing:border-box;width:9px;height:9px;border-radius:50%;background:#8FC2EE;'
    + 'box-shadow:0 0 0 3px rgba(143,194,238,.22);}'
    + '#dirPillola .dirpl-testo{font-weight:700;letter-spacing:.2px;}'
    + '#dirPillola .dirpl-dettaglio{color:rgba(255,255,255,.78);font-weight:500;overflow:hidden;text-overflow:ellipsis;}'
    + '#dirPillola .dirpl-dettaglio:empty{display:none;}'
    + '#dirPillola .dirpl-dettaglio::before{content:"\\00B7";margin-right:9px;color:rgba(255,255,255,.5);}'
    + '#dirPillola svg{flex:0 0 auto;width:16px;height:16px;margin-left:1px;opacity:.85;}'
    + '#dirPillola[data-dirpl="in_onda"]{background:#C8203F;border-color:#C8203F;'
    + 'box-shadow:0 12px 30px rgba(200,32,63,.42),0 2px 8px rgba(10,40,68,.2);}'
    + '#dirPillola[data-dirpl="in_onda"] .dirpl-testo{letter-spacing:1.2px;font-weight:800;font-size:13px;}'
    + '#dirPillola[data-dirpl="in_onda"] .dirpl-dettaglio{color:#fff;}'
    + '#dirPillola[data-dirpl="in_onda"] .dirpl-segno{background:#fff;animation:dirplPulsa 1.6s infinite;}'
    + '@keyframes dirplPulsa{0%{box-shadow:0 0 0 0 rgba(255,255,255,.75);}'
    + '70%{box-shadow:0 0 0 7px rgba(255,255,255,0);}100%{box-shadow:0 0 0 0 rgba(255,255,255,0);}}'
    + '#dirPillola[data-dirpl="pausa"] .dirpl-segno{width:10px;height:11px;border-radius:1px;background:none;'
    + 'box-shadow:none;border-left:3px solid #F5C15C;border-right:3px solid #F5C15C;}'
    + '#dirPillola[data-dirpl="pausa"] .dirpl-dettaglio{color:#F9D48C;}'
    + '@media (max-width:420px){#dirPillola{font-size:13.5px;padding:10px 14px 10px 12px;gap:8px;}}'
    + '@media (prefers-reduced-motion:reduce){#dirPillola{animation:none;transition:none;}'
    + '#dirPillola:hover{transform:none;}#dirPillola .dirpl-segno{animation:none!important;}}';

  // Solo stringhe costanti: i testi si scrivono con textContent. Lo spazio
  // fra testo e dettaglio non si vede (fra gli elementi di un flex non conta)
  // ma separa le parole per i lettori di schermo.
  var HTML_PILLOLA = ''
    + '<span class="dirpl-segno" aria-hidden="true"></span>'
    + '<span class="dirpl-testo"></span> '
    + '<span class="dirpl-dettaglio"></span>'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" '
    + 'stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"></line>'
    + '<polyline points="12 5 19 12 12 19"></polyline></svg>';

  function creaPillola() {
    if (document.getElementById("dirPillola") || !document.body) return null;
    var stile = document.createElement("style");
    stile.id = "dirPillolaStyle";
    stile.textContent = CSS_PILLOLA;
    document.head.appendChild(stile);

    var a = document.createElement("a");
    a.id = "dirPillola";
    a.setAttribute("href", EVENTO.urlDiretta || "/diretta/");
    a.hidden = true;
    a.innerHTML = HTML_PILLOLA;
    document.body.appendChild(a);
    var testo = a.querySelector(".dirpl-testo");
    var dettaglio = a.querySelector(".dirpl-dettaglio");
    var ore = orario();
    var citta = EVENTO.citta || "";

    a.addEventListener("click", function () {
      if (typeof window.gtag === "function") {
        window.gtag("event", "click_pillola", { pagina: "Diretta " + citta });
      }
    });

    // accesa per tutta la finestra (anche oltre la fine se si sfora),
    // spenta prima e dopo
    return function (cond) {
      var accesa = cond === "prima" || cond === "oggi" || cond === "in_onda" || cond === "pausa";
      a.hidden = !accesa;
      if (!accesa) { a.removeAttribute("data-dirpl"); return; }
      a.setAttribute("data-dirpl", cond);
      if (cond === "in_onda") {
        testo.textContent = "IN DIRETTA";
        dettaglio.textContent = citta;
      } else {
        testo.textContent = "Diretta " + citta;
        dettaglio.textContent = cond === "pausa" ? "In pausa"
          : cond === "oggi" ? "oggi dalle " + ore.inizio
          : ore.giornoBreve;
      }
    };
  }

  // --- Agganci nelle pagine ---------------------------------------------
  function mostra(lista, si) {
    for (var i = 0; i < lista.length; i++) lista[i].hidden = !si;
  }

  function agganciaPagina() {
    // la pillola si costruisce solo se puo' ancora servire: finita la
    // finestra di lettura non si accenderebbe piu'
    var vuolePillola = !!(QUESTO_SCRIPT && QUESTO_SCRIPT.hasAttribute("data-pillola")) && Date.now() < FINE_LETTURA;
    var aggiornaPillola = vuolePillola ? creaPillola() : null;
    var live = document.querySelectorAll(".indicatore-live");
    var pausa = document.querySelectorAll(".indicatore-pausa");
    var aperte = document.querySelectorAll("[data-diretta-aperta]");
    var concluse = document.querySelectorAll("[data-diretta-conclusa]");
    // niente da mostrare = niente da chiedere
    if (!aggiornaPillola && !live.length && !pausa.length && !aperte.length && !concluse.length) return;
    var radice = document.documentElement;

    // L'ultimo stato letto bene. Nella finestra di lettura un null e' una
    // lettura fallita (rete, servizio): si tiene quello che si vede invece
    // di spegnere tutto per un minuto a meta' diretta. Fuori dalla finestra
    // conta solo l'orario, e condizione() lo sa gia'.
    var buono = ultimo();
    function applica() {
      var cond = condizione(buono);
      radice.setAttribute("data-diretta", cond);
      if (buono) radice.setAttribute("data-diretta-stato", buono.stato);
      mostra(live, cond === "in_onda");
      mostra(pausa, cond === "pausa");
      mostra(aperte, cond !== "conclusa");
      mostra(concluse, cond === "conclusa");
      if (aggiornaPillola) aggiornaPillola(cond);
    }
    // subito, con l'orario e l'eventuale stato gia' letto in questa scheda
    // (niente attesa della rete per mostrare "La diretta si e' conclusa" il
    // giorno dopo), poi a ogni lettura
    applica();
    segui(function (dati) {
      if (dati) buono = dati;
      applica();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", agganciaPagina);
  } else {
    agganciaPagina();
  }
})();
