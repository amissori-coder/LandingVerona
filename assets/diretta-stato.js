/*
 * Stato della diretta per il sito pubblico (home page e pagina dell'evento)
 * Componente autonomo, senza dipendenze: window.NGBDiretta.
 * - Tiene in UN solo posto le date dell'evento trasmesso in diretta: il popup
 *   della home (diretta-popup.js) e il pulsante della pagina di Napoli leggono
 *   da qui la finestra in cui comparire e l'orario da mostrare.
 * - Dice se l'evento e' "in onda" SENZA chiamare Firebase: legge il piccolo
 *   endpoint pubblico del servizio (api/diretta-stato), che ha una cache di
 *   20-30 secondi sulla rete di Vercel. Qui sopra c'e' una seconda cache, in
 *   sessionStorage, di 60 secondi, e una sola richiesta in volo per pagina.
 * - Soprattutto: lo stato si chiede SOLO nel giorno dell'evento (da 3 ore prima
 *   dell'inizio a 1 ora dopo la fine). Negli altri giorni nessun visitatore del
 *   sito fa richieste: la risposta la sappiamo gia' (non e' in onda).
 * - Sulle pagine che contengono elementi .indicatore-live (il pulsante
 *   "Diretta" di Napoli) li mostra solo mentre si e' in onda, con un
 *   ricontrollo ogni 60 secondi, e scrive lo stato in <html data-diretta-stato>.
 *
 * Per un nuovo evento basta cambiare EVENTO qui sotto (le date sono in ora di
 * Roma, con il fuso scritto in fondo: +02:00 d'estate, +01:00 d'inverno).
 */
(function () {
  "use strict";

  // --- Configurazione ---------------------------------------------------
  var EVENTO = {
    id: "napoli-2026",
    titolo: "Napoli, 2 ottobre 2026",
    inizio: "2026-10-02T09:00:00+02:00",
    fine: "2026-10-02T17:30:00+02:00",
    // il popup della home compare da tanti giorni prima dell'inizio
    // fino alla fine dell'evento, poi si spegne da solo
    mostraDaGiorni: 7,
    pagina: "/napoli_ottobre_2026/",
    urlDiretta: "/diretta/"
  };
  var SERVIZIO = "https://revilaw-email.vercel.app/api/diretta-stato";
  var ORE_PRIMA = 3;          // lo stato si chiede da 3 ore prima dell'inizio...
  var ORE_DOPO = 1;           // ...fino a 1 ora dopo la fine (se si sfora)
  var CACHE_MS = 60 * 1000;   // una lettura vale 60 secondi per tutta la scheda
  var RICONTROLLO_MS = 60 * 1000;
  var ATTESA_MAX_MS = 8000;   // oltre, la richiesta si considera fallita
  var SS_CACHE = "ngbDirettaStato_" + EVENTO.id;
  var STATI = { programmato: 1, in_onda: 1, terminato: 1 };

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
  var pInizio = partiIso(EVENTO.inizio);
  var pFine = partiIso(EVENTO.fine);
  // mezzanotte (ora di Roma) del giorno dell'evento: da li' si parla di "oggi"
  var INIZIO_GIORNO = pInizio ? Date.parse(pInizio.data + "T00:00:00" + pInizio.fuso) : INIZIO;

  function istante(adesso) {
    if (adesso instanceof Date) return adesso.getTime();
    if (typeof adesso === "number" && isFinite(adesso)) return adesso;
    return Date.now();
  }

  // 'fuori' (prima della finestra) | 'prima' (nella finestra, giorni
  // precedenti) | 'oggi' (giorno dell'evento, fino alla fine) | 'dopo'
  function fase(adesso) {
    var t = istante(adesso);
    if (!isFinite(INIZIO) || !isFinite(FINE)) return "fuori"; // date scritte male: non mostrare niente
    if (t >= FINE) return "dopo";
    if (t < INIZIO - EVENTO.mostraDaGiorni * GIORNO_MS) return "fuori";
    if (t >= INIZIO_GIORNO) return "oggi";
    return "prima";
  }

  // la finestra in cui ha senso chiedere se si e' in onda
  function eGiorno(adesso) {
    var t = istante(adesso);
    return t >= INIZIO - ORE_PRIMA * ORA_MS && t < FINE + ORE_DOPO * ORA_MS;
  }

  // "9.00", "17.30": come l'orario e' scritto nel resto del sito
  function oraLeggibile(p) { return p ? p.ore + "." + p.minuti : ""; }

  // { giorno: "venerdì 2 ottobre 2026", inizio: "9.00", fine: "17.30" }
  function orario() {
    var giorno = "";
    if (pInizio) {
      var g = new Date(Date.UTC(pInizio.anno, pInizio.mese - 1, pInizio.giorno)).getUTCDay();
      giorno = GIORNI[g] + " " + pInizio.giorno + " " + MESI[pInizio.mese - 1] + " " + pInizio.anno;
    }
    return { giorno: giorno, inizio: oraLeggibile(pInizio), fine: oraLeggibile(pFine) };
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
      letto: Date.now()
    };
  }

  // --- Lettura ----------------------------------------------------------
  var inAttesa = [];   // chi aspetta la risposta della richiesta in volo

  function rispondi(cb, dati) {
    // sempre in modo asincrono, come se la risposta arrivasse dalla rete:
    // chi chiama non deve preoccuparsi di quale dei due casi capita
    setTimeout(function () { try { cb(dati); } catch (e) { /* errore di chi chiama */ } }, 0);
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

  // cb({ stato: 'programmato'|'in_onda'|'terminato', ... }) oppure cb(null)
  // fuori dal giorno dell'evento o se la lettura non riesce.
  function leggi(cb) {
    if (typeof cb !== "function") return;
    if (!eGiorno()) { rispondi(cb, null); return; }
    var c = leggiCache();
    var eta = c ? Date.now() - c.quando : -1;
    // eta' negativa = orologio tornato indietro: la copia non e' affidabile
    if (c && eta >= 0 && eta < CACHE_MS) { rispondi(cb, c.dati || null); return; }
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

  // Chiama cb con lo stato adesso e poi ogni 60 secondi, ma solo nel giorno
  // dell'evento e solo a scheda visibile (una scheda in secondo piano non
  // chiede niente; al ritorno si aggiorna subito). Fuori dal giorno
  // dell'evento cb(null) e nessuna richiesta.
  function segui(cb) {
    if (typeof cb !== "function") return function () {};
    var timer = null;
    function giro() {
      var t = Date.now();
      if (t >= FINE + ORE_DOPO * ORA_MS) { ferma(); cb(null); return; }
      if (!eGiorno(t)) { cb(null); return; }
      if (document.hidden) return;
      leggi(cb);
    }
    function alCambioVisibilita() { if (!document.hidden) giro(); }
    function ferma() {
      if (timer) clearInterval(timer);
      timer = null;
      document.removeEventListener("visibilitychange", alCambioVisibilita);
    }
    giro();
    if (Date.now() < FINE + ORE_DOPO * ORA_MS) {
      timer = setInterval(giro, RICONTROLLO_MS);
      document.addEventListener("visibilitychange", alCambioVisibilita);
    }
    return ferma;
  }

  window.NGBDiretta = {
    EVENTO: EVENTO,
    SERVIZIO: SERVIZIO,
    fase: fase,
    eGiorno: eGiorno,
    leggi: leggi,
    ultimo: ultimo,
    segui: segui,
    orario: orario
  };

  // --- Indicatori "IN DIRETTA" nelle pagine -----------------------------
  // Gli elementi .indicatore-live nascono nascosti (attributo hidden) e si
  // mostrano solo mentre l'evento e' in onda. Nessun elemento = niente da
  // fare (la home usa il popup, che legge lo stato per conto suo).
  function agganciaIndicatori() {
    var indicatori = document.querySelectorAll(".indicatore-live");
    if (!indicatori.length) return;
    var radice = document.documentElement;
    segui(function (dati) {
      // Nel giorno dell'evento un null e' una lettura fallita (rete, servizio):
      // si tiene quello che si vede, invece di spegnere l'indicatore per un
      // minuto a meta' diretta. Fuori dal giorno null vuol dire "non in onda".
      if (!dati && eGiorno()) return;
      var inOnda = !!(dati && dati.stato === "in_onda");
      for (var i = 0; i < indicatori.length; i++) indicatori[i].hidden = !inOnda;
      if (dati) radice.setAttribute("data-diretta-stato", dati.stato);
      else radice.removeAttribute("data-diretta-stato");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", agganciaIndicatori);
  } else {
    agganciaIndicatori();
  }
})();
