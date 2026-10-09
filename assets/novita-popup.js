/*
 * Le novita' della home: una finestra sola, con le schede una accanto all'altra
 * Componente autonomo (HTML + stile + logica iniettati da JS).
 * - Riunisce i popup che prima comparivano uno dopo l'altro (bando-tipo,
 *   FCD e la novita' dell'Osservatorio): all'entrata compaiono INSIEME,
 *   affiancati e tutti nello stesso formato (occhiello e riferimento,
 *   titolo, testo, tre cifre, invito all'approfondimento, Chiudi,
 *   Non mostrare piu').
 * - Sul computer le schede stanno affiancate; sotto gli 800 px (telefono,
 *   tablet in verticale) scorrono di lato, una accanto all'altra: si vede
 *   il bordo della seconda e due trattini dicono quale si sta guardando.
 *   Se lo schermo e' basso scorre la finestra intera.
 * - Le schede sono di due gruppi e di ogni gruppo ne compare al massimo
 *   una, una volta per sessione: "bandi" (il bando-tipo; il Fondo Contrasto
 *   Deindustrializzazione solo per chi ha spento il bando-tipo con "Non
 *   mostrare piu'", come prima) e "osservatorio" (la Cassazione 7134/2026).
 *   Le chiavi in sessionStorage e localStorage sono quelle dei vecchi
 *   popup: chi ne aveva spento uno continua a non vederlo.
 * - "Chiudi" e la X chiudono la loro scheda; chiusa l'ultima si chiude la
 *   finestra. ESC e il clic fuori dalle schede chiudono tutto. "Non
 *   mostrare piu'" spegne per sempre solo quella scheda.
 * - Il popup della diretta (diretta-popup.js, caricato prima, imposta
 *   window.__dirPromoPlanned) ha la precedenza: nei giorni dell'evento le
 *   schede dei bandi non compaiono e quella dell'Osservatorio arriva dopo
 *   la chiusura della diretta. Al contrario, quando compare una scheda dei
 *   bandi si segna dirPromoSeen: niente diretta dopo, nella stessa sessione.
 * - Accessibile: la finestra e' un role="dialog" modale, ogni scheda un
 *   article con il suo titolo; focus trap, ESC, clic sullo sfondo.
 * Percorsi root-relative: il sito e' servito dalla radice del dominio.
 */
(function () {
  "use strict";

  // --- Le schede --------------------------------------------------------
  // In ogni gruppo vale la prima scheda disponibile (non spenta, non gia'
  // vista in questa sessione, non scaduta). "segna": le chiavi di sessione
  // da segnare quando la scheda compare.
  var SCHEDE = [
    {
      nome: "bando-tipo", gruppo: "bandi",
      visto: "btPromoSeen", spento: "btPromoHidden",
      segna: ["btPromoSeen", "fcdPromoSeen", "dirPromoSeen"],
      occhiello: "Osservatorio normativo",
      riferimento: ["Bando-tipo Mimit", "decreto 18 giugno 2026"],
      titolo: "Aiuti di Stato: corsia preferenziale a chi &egrave; virtuoso",
      testo: "Il nuovo bando-tipo cambia le regole di tutti i futuri bandi: contano legalit&agrave;, "
        + "parit&agrave; di genere, inclusione e capacit&agrave; amministrativa e finanziaria delle "
        + "imprese. Gli <b>adeguati assetti</b> diventano un requisito di accesso alle risorse.",
      cifre: [["60%", "minimo riservato alle PMI"], ["4", "premialit&agrave; in graduatoria"],
        ["17.07.26", "in Gazzetta Ufficiale"]],
      url: "/bando_tipo_2026/", invito: "Leggi l'approfondimento",
      evento: ["click_popup", { pagina: "Bando-tipo aiuti di Stato 2026" }]
    },
    {
      nome: "fcd", gruppo: "bandi",
      visto: "fcdPromoSeen", spento: "fcdPromoHidden",
      segna: ["fcdPromoSeen", "btPromoSeen", "dirPromoSeen"],
      fino: new Date(2026, 10, 28, 12, 0, 0), // fino alle 12 del 28 novembre 2026, quando chiude lo sportello (mese 10 = novembre)
      occhiello: "Bando nazionale",
      riferimento: ["Invitalia", "sportello aperto dal 28 settembre"],
      titolo: "Fondo Contrasto Deindustrializzazione 2026",
      testo: "Contributo a fondo perduto per le imprese manifatturiere (ATECO sezione C) nei territori "
        + "dei Consorzi industriali del Lazio e di Piceno Consind. Le domande sono valutate "
        + "in ordine cronologico di presentazione, fino a esaurimento delle risorse.",
      cifre: [["300 mila", "euro di contributo massimo"], ["100%", "delle spese ammissibili"],
        ["28.11.26", "chiusura alle ore 12"]],
      url: "/fcd_2026/", invito: "Leggi l'approfondimento",
      evento: ["click_popup", { pagina: "Fondo Contrasto Deindustrializzazione 2026" }]
    },
    {
      nome: "cass7134", gruppo: "osservatorio",
      visto: "novitaPromoSeen_cass7134", spento: "novitaPromoHidden_cass7134",
      segna: ["novitaPromoSeen_cass7134"],
      occhiello: "Osservatorio giurisprudenza",
      riferimento: ["Cassazione n. 7134", "ordinanza 25 marzo 2026"],
      titolo: "Credito all'impresa gi&agrave; decotta: il&nbsp;finanziamento &egrave; nullo",
      testo: "La nullit&agrave; vale anche con la garanzia pubblica del Fondo PMI e le somme erogate dalla banca sono "
        + "irripetibili. I segnali della crisi erano gi&agrave; scritti nel bilancio 2018: gli "
        + "<b>adeguati assetti</b> diventano una condizione di bancabilit&agrave;.",
      cifre: [["34,05", "debiti su mezzi propri"], ["630 mila", "euro di debiti scaduti"],
        ["19 mila", "euro di patrimonio netto"]],
      url: "/cassazione_7134_2026/", invito: "Leggi l'approfondimento",
      evento: ["click_popup_novita", { destinazione: "/cassazione_7134_2026/" }]
    }
  ];
  var SHOW_DELAY_MS = 900;         // a pagina carica, come prima
  var PAUSA_DOPO_DIRETTA_MS = 700; // respiro fra la chiusura della diretta e queste schede
  var ATTESA_MASSIMA_MS = 6000;    // diretta prenotata ma mai aperta (es. gia' conclusa): non aspettare oltre

  // --- Guardie di uscita ------------------------------------------------
  if (location.pathname !== "/" && location.pathname !== "/index.html") return;
  if (document.getElementById("novitaPromo")) return;

  function ss(get, key, val) {
    try { return get ? sessionStorage.getItem(key) : sessionStorage.setItem(key, val); }
    catch (e) { return null; }
  }
  function ls(get, key, val) {
    try { return get ? localStorage.getItem(key) : localStorage.setItem(key, val); }
    catch (e) { return null; }
  }
  // Il popup della diretta e' caricato prima: se sta per comparire, le
  // schede dei bandi si ritirano e le altre aspettano che si chiuda.
  var direttaPrima = !!window.__dirPromoPlanned;
  function disponibile(s) {
    if (s.gruppo === "bandi" && direttaPrima) return false;
    if (s.fino && Date.now() >= s.fino.getTime()) return false;
    return ls(true, s.spento) !== "1" && ss(true, s.visto) !== "1";
  }
  var scelte = [], gruppi = {};
  for (var i = 0; i < SCHEDE.length; i++) {
    var s = SCHEDE[i];
    if (gruppi[s.gruppo] || !disponibile(s)) continue;
    gruppi[s.gruppo] = true;
    scelte.push(s);
  }
  if (!scelte.length) return;

  // --- Stili (iniettati una sola volta) ---------------------------------
  // Il formato e' quello sobrio del sito: angoli appena smussati, filetti
  // sottili, titoli in Montserrat, un solo pulsante pieno.
  var css = ''
    /* se lo schermo e' basso scorre la finestra intera, mai la scheda da sola
       (le azioni in fondo restano raggiungibili); margin:auto la centra
       quando c'e' spazio */
    + '#novitaPromo{position:fixed;inset:0;z-index:2147482000;display:flex;padding:20px;'
    + 'overflow-y:auto;overscroll-behavior:contain;'
    + 'font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;}'
    + '#novitaPromo[hidden]{display:none;}'
    + '#novitaPromo,#novitaPromo *{box-sizing:border-box;}'
    + '#novitaPromo .novp-sfondo{position:fixed;inset:0;background:rgba(10,40,68,.62);'
    + '-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);opacity:0;transition:opacity .3s ease;}'
    + '#novitaPromo.is-open .novp-sfondo{opacity:1;transition:opacity .55s ease;}'
    + '#novitaPromo .novp-finestra{position:relative;width:100%;max-width:940px;margin:auto;'
    + 'display:flex;flex-direction:column;align-items:center;outline:none;}'
    + '#novitaPromo .novp-fila{display:flex;justify-content:center;align-items:stretch;gap:20px;width:100%;}'

    /* la scheda */
    + '#novitaPromo .novp-scheda{position:relative;flex:0 1 450px;min-width:0;display:flex;flex-direction:column;'
    + 'background:#fff;border-radius:4px;padding:24px 26px 18px;outline:none;'
    + 'box-shadow:0 18px 48px rgba(10,40,68,.30);transform:translateY(14px);opacity:0;'
    + 'transition:transform .3s ease,opacity .3s ease;}'
    + '#novitaPromo .novp-scheda[hidden]{display:none;}'
    + '#novitaPromo.is-open .novp-scheda{transform:none;opacity:1;'
    + 'transition:transform .6s cubic-bezier(.16,1,.3,1),opacity .45s ease;}'
    + '#novitaPromo.is-open .novp-scheda+.novp-scheda{transition-delay:.08s;}'
    + '#novitaPromo.is-open .novp-scheda.is-chiusa{opacity:0;transform:translateY(10px);'
    + 'transition:transform .22s ease,opacity .22s ease;transition-delay:0s;}'
    + '#novitaPromo .novp-testa{display:flex;flex-direction:column;align-items:flex-start;gap:3px;'
    + 'padding:0 40px 12px 0;margin:0 0 16px;border-bottom:1px solid rgba(22,64,104,.22);}'
    + '#novitaPromo .novp-occhiello{font-family:Montserrat,Inter,system-ui,sans-serif;font-size:11px;'
    + 'font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#164068;}'
    + '#novitaPromo .novp-rif{font-size:12px;line-height:1.45;color:#5b6b7c;}'
    + '#novitaPromo .novp-rif span{white-space:nowrap;}'
    + '#novitaPromo h2{font-family:Montserrat,Inter,system-ui,sans-serif;color:#0A2844;text-align:left;'
    + 'font-size:21px;font-weight:800;line-height:1.22;letter-spacing:-.2px;text-transform:none;margin:0 0 10px;'
    + 'text-wrap:balance;}'
    /* senza sillabazione automatica: le righe sono quelle misurate, in ogni browser */
    + '#novitaPromo p{color:#404a5a;font-size:14.5px;line-height:1.6;margin:0 0 18px;'
    + 'hyphens:manual!important;-webkit-hyphens:manual!important;}'
    + '#novitaPromo p b{color:#0A2844;font-weight:600;}'
    /* giustificato solo con le schede larghe (da 960 px): nelle schede
       strette la giustificazione aprirebbe buchi fra le parole */
    + '@media (max-width:959px){#novitaPromo p{text-align:left!important;}}'

    /* in fondo alla scheda: cifre e azioni, allineate fra le schede affiancate */
    + '#novitaPromo .novp-fondo{margin-top:auto;}'
    + '#novitaPromo .novp-cifre{list-style:none;margin:0 0 18px;padding:11px 0;display:grid;'
    + 'grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;'
    + 'border-top:1px solid rgba(22,64,104,.22);border-bottom:1px solid rgba(22,64,104,.22);}'
    + '#novitaPromo .novp-cifre li{margin:0;padding:0;text-align:left!important;hyphens:manual!important;'
    + '-webkit-hyphens:manual!important;}'
    + '#novitaPromo .novp-cifre b{display:block;font-family:Montserrat,Inter,system-ui,sans-serif;'
    + 'font-size:17px;font-weight:800;line-height:1.2;color:#164068;white-space:nowrap;}'
    + '#novitaPromo .novp-cifre span{display:block;margin-top:3px;font-size:11.5px;line-height:1.35;color:#5b6b7c;}'
    + '#novitaPromo .novp-azioni{display:flex;flex-direction:column;gap:6px;text-align:center;}'
    + '#novitaPromo .novp-cta{display:flex;align-items:center;justify-content:center;gap:8px;'
    + 'background:#164068!important;color:#fff!important;text-decoration:none!important;font-weight:700;'
    + 'font-size:14.5px;line-height:1.3;padding:13px 18px;border-radius:3px;transition:background .2s ease;}'
    + '#novitaPromo .novp-cta:hover{background:#0A2844!important;}'
    + '#novitaPromo .novp-cta svg{flex:0 0 auto;width:16px;height:16px;}'
    + '#novitaPromo .novp-chiudi{align-self:center;background:none;border:0;color:#5A6270;font-size:13px;'
    + 'font-weight:600;cursor:pointer;padding:8px 14px;font-family:inherit;}'
    + '#novitaPromo .novp-chiudi:hover{color:#0A2844;}'
    + '#novitaPromo .novp-mai{text-align:center;margin:2px 0 0;}'
    + '#novitaPromo .novp-mai button{background:none;border:0;color:#6b7482;font-size:11.5px;'
    + 'cursor:pointer;text-decoration:underline;font-family:inherit;padding:4px;}'
    + '#novitaPromo .novp-mai button:hover{color:#3d4654;}'
    + '#novitaPromo .novp-x{position:absolute;top:16px;right:14px;width:34px;height:34px;'
    + 'display:inline-flex;align-items:center;justify-content:center;background:none;border:0;'
    + 'border-radius:3px;color:#5A6270;cursor:pointer;}'
    + '#novitaPromo .novp-x:hover{background:#F3F5F8;color:#0A2844;}'
    + '#novitaPromo .novp-x svg{width:18px;height:18px;}'
    + '#novitaPromo .novp-x:focus-visible,#novitaPromo .novp-chiudi:focus-visible,'
    + '#novitaPromo .novp-mai button:focus-visible{outline:2px solid #164068;outline-offset:2px;}'
    + '#novitaPromo .novp-cta:focus-visible{outline:2px solid #fff;outline-offset:-4px;box-shadow:0 0 0 3px #164068;}'
    + '#novitaPromo .novp-scheda:focus-visible{box-shadow:0 0 0 3px #8FC2EE,0 18px 48px rgba(10,40,68,.30);}'

    /* i trattini sotto le schede (solo quando scorrono di lato) */
    + '#novitaPromo .novp-segni{display:none;gap:8px;justify-content:center;margin-top:14px;}'
    + '#novitaPromo .novp-segni i{display:block;width:22px;height:3px;border-radius:2px;'
    + 'background:rgba(255,255,255,.38);transition:background .25s ease;}'
    + '#novitaPromo .novp-segni i[hidden]{display:none;}'
    + '#novitaPromo .novp-segni i.is-qui{background:#fff;}'

    /* telefono e tablet stretto: le schede scorrono di lato, centrate,
       con il bordo della vicina in vista. Gli spazi ai lati sono elementi
       (::before e ::after) e non padding: Safari non conta il padding finale
       di un contenitore che scorre, e l'ultima scheda non si centrerebbe. */
    + '@media (max-width:799px){'
    + '#novitaPromo{padding:20px 0;}'
    + '#novitaPromo .novp-finestra{max-width:none;}'
    + '#novitaPromo .novp-fila{justify-content:flex-start;align-items:center;gap:12px;overflow-x:auto;overflow-y:hidden;'
    + 'scroll-snap-type:x mandatory;overscroll-behavior-x:contain;scrollbar-width:none;-webkit-overflow-scrolling:touch;}'
    + '#novitaPromo .novp-fila::-webkit-scrollbar{display:none;}'
    + '#novitaPromo .novp-fila::before,#novitaPromo .novp-fila::after{content:"";'
    + 'flex:0 0 calc((100% - min(440px, 100% - 56px)) / 2 - 12px);}'
    + '#novitaPromo .novp-scheda{flex:0 0 min(440px, calc(100% - 56px));scroll-snap-align:center;'
    + 'scroll-snap-stop:always;}'
    + '#novitaPromo.is-coppia .novp-segni{display:flex;}}'
    + '@media (max-width:480px){#novitaPromo .novp-scheda{padding:20px 20px 16px;}'
    + '#novitaPromo h2{font-size:19px;}#novitaPromo .novp-occhiello{letter-spacing:.12em;}'
    + '#novitaPromo .novp-cifre{gap:10px;}#novitaPromo .novp-cifre b{font-size:clamp(13px,4.1vw,16px);}'
    + '#novitaPromo .novp-cifre span{font-size:11px;}}'
    + '@media (max-width:360px){#novitaPromo .novp-cta{font-size:13.5px;padding:12px 10px;gap:6px;}}'
    + '@media (prefers-reduced-motion:reduce){#novitaPromo .novp-sfondo,#novitaPromo .novp-scheda,'
    + '#novitaPromo .novp-segni i{transition:none!important;}#novitaPromo .novp-scheda{transform:none;}}';

  // --- Markup (solo testi costanti, scritti qui sopra) ------------------
  var iconArrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'
    + '<line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>';
  var iconX = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" '
    + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'
    + '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

  function schedaHtml(s) {
    var id = "novitaPromo-" + s.nome;
    var cifre = "";
    for (var c = 0; c < s.cifre.length; c++) {
      cifre += '<li><b>' + s.cifre[c][0] + '</b><span>' + s.cifre[c][1] + '</span></li>';
    }
    return ''
      + '<article class="novp-scheda" data-scheda="' + s.nome + '" tabindex="-1" aria-labelledby="' + id + '">'
      + '<button type="button" class="novp-x" data-novp-chiudi aria-label="Chiudi questa novit&agrave;" aria-describedby="' + id + '">' + iconX + '</button>'
      + '<div class="novp-testa"><span class="novp-occhiello">' + s.occhiello + '</span>'
      + '<span class="novp-rif"><span>' + s.riferimento.join('</span>, <span>') + '</span></span></div>'
      + '<h2 id="' + id + '">' + s.titolo + '</h2>'
      + '<p>' + s.testo + '</p>'
      + '<div class="novp-fondo">'
      + '<ul class="novp-cifre">' + cifre + '</ul>'
      + '<div class="novp-azioni">'
      + '<a class="novp-cta" href="' + s.url + '" aria-describedby="' + id + '">' + s.invito + iconArrow + '</a>'
      + '<button type="button" class="novp-chiudi" data-novp-chiudi aria-describedby="' + id + '">Chiudi</button>'
      + '</div>'
      + '<div class="novp-mai"><button type="button" data-novp-mai aria-describedby="' + id + '">Non mostrare pi&ugrave;</button></div>'
      + '</div></article>';
  }

  var html = '<div class="novp-sfondo" data-novp-tutto aria-hidden="true"></div>'
    + '<div class="novp-finestra" role="dialog" aria-modal="true" tabindex="-1" aria-label="Novit&agrave;">'
    + '<div class="novp-fila" data-novp-tutto>';
  for (var k = 0; k < scelte.length; k++) html += schedaHtml(scelte[k]);
  html += '</div>';
  if (scelte.length > 1) {
    html += '<div class="novp-segni" aria-hidden="true">';
    for (var t = 0; t < scelte.length; t++) html += '<i></i>';
    html += '</div>';
  }
  html += '</div>';

  // --- Costruzione + comportamento --------------------------------------
  function build() {
    if (document.getElementById("novitaPromo")) return;

    var style = document.createElement("style");
    style.id = "novitaPromoStyle";
    style.textContent = css;
    document.head.appendChild(style);

    var root = document.createElement("div");
    root.id = "novitaPromo";
    root.setAttribute("hidden", "");
    root.innerHTML = html;
    document.body.appendChild(root);

    var finestra = root.querySelector(".novp-finestra");
    var fila = root.querySelector(".novp-fila");
    var segni = root.querySelectorAll(".novp-segni i");
    var lastFocus = null;
    var isClosing = false;
    var calmo = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

    function datiDi(el) {
      var nome = el && el.getAttribute("data-scheda");
      for (var j = 0; j < SCHEDE.length; j++) if (SCHEDE[j].nome === nome) return SCHEDE[j];
      return null;
    }
    function aperte() {
      return Array.prototype.filter.call(root.querySelectorAll(".novp-scheda"), function (el) {
        return !el.hidden && !el.classList.contains("is-chiusa");
      });
    }
    function focusables() {
      var f = [];
      aperte().forEach(function (el) {
        f = f.concat(Array.prototype.slice.call(el.querySelectorAll("a[href],button:not([disabled])")));
      });
      return f;
    }
    // quale scheda e' al centro, quando scorrono di lato
    function aggiornaSegni() {
      var a = aperte();
      root.classList.toggle("is-coppia", a.length > 1);
      if (!segni.length) return;
      var f = fila.getBoundingClientRect(), centro = f.left + f.width / 2, qui = 0, meglio = Infinity;
      a.forEach(function (el, n) {
        var r = el.getBoundingClientRect(), d = Math.abs(r.left + r.width / 2 - centro);
        if (d < meglio) { meglio = d; qui = n; }
      });
      for (var n = 0; n < segni.length; n++) {
        segni[n].hidden = n >= a.length;
        segni[n].classList.toggle("is-qui", n === qui);
      }
    }
    fila.addEventListener("scroll", aggiornaSegni, { passive: true });
    window.addEventListener("resize", function () { if (!root.hidden) aggiornaSegni(); });

    function open() {
      if (!root.hidden || isClosing) return;
      // nel frattempo vista o spenta (un'altra scheda del browser, Indietro dalla bfcache)
      Array.prototype.forEach.call(root.querySelectorAll(".novp-scheda"), function (el) {
        var d = datiDi(el);
        if (!d || ls(true, d.spento) === "1" || ss(true, d.visto) === "1") el.parentNode.removeChild(el);
      });
      var a = aperte();
      if (!a.length) return;
      a.forEach(function (el) {
        var d = datiDi(el);
        for (var j = 0; j < d.segna.length; j++) ss(false, d.segna[j], "1");
      });
      lastFocus = document.activeElement;
      root.hidden = false;
      fila.scrollLeft = 0;
      aggiornaSegni();
      // doppio rAF: la transizione parte a stili applicati e layout stabile
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { root.classList.add("is-open"); });
      });
      // focus sulla finestra: nessun anello che lampeggia sui pulsanti durante l'entrata
      try { finestra.focus({ preventScroll: true }); } catch (e) { finestra.focus(); }
      document.addEventListener("keydown", onKey, true);
    }
    function close() {
      if (isClosing || root.hidden) return;
      isClosing = true;
      // via lo scivolamento di una scheda appena chiusa: la dissolvenza vale per tutte
      Array.prototype.forEach.call(root.querySelectorAll(".novp-scheda"), function (r) {
        r.style.transition = "";
        r.style.transform = "";
      });
      root.classList.remove("is-open");
      document.removeEventListener("keydown", onKey, true);
      setTimeout(function () {
        root.hidden = true;
        isClosing = false;
        if (lastFocus && lastFocus.focus && document.contains(lastFocus)) {
          try { lastFocus.focus({ preventScroll: true }); } catch (e) {}
        }
      }, calmo ? 0 : 450);
    }
    // chiude una scheda sola; con l'ultima si chiude la finestra
    function chiudiScheda(el) {
      if (isClosing) return;
      var resto = aperte().filter(function (x) { return x !== el; });
      if (!resto.length) { close(); return; }
      var avevaFocus = el.contains(document.activeElement);
      el.classList.add("is-chiusa");
      setTimeout(function () {
        if (isClosing || root.hidden) return; // nel frattempo si chiude tutto
        // FLIP: la scheda che resta scivola al centro invece di saltarci
        var prima = resto.map(function (r) { return r.getBoundingClientRect().left; });
        el.hidden = true;
        aggiornaSegni();
        if (!calmo) resto.forEach(function (r, n) {
          var dx = prima[n] - r.getBoundingClientRect().left;
          if (Math.abs(dx) < 1) return;
          r.style.transition = "none";
          r.style.transform = "translateX(" + dx + "px)";
          void r.offsetWidth;
          r.style.transition = "transform .4s cubic-bezier(.16,1,.3,1)";
          r.style.transform = "";
          setTimeout(function () { if (!isClosing) r.style.transition = ""; }, 450);
        });
        if (avevaFocus) {
          try { resto[0].focus({ preventScroll: true }); } catch (e) { resto[0].focus(); }
        }
      }, calmo ? 0 : 220);
    }
    function onKey(e) {
      if (e.key === "Escape" || e.keyCode === 27) { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key === "Tab" || e.keyCode === 9) {
        var f = focusables();
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        // dalla finestra o da una scheda (focus iniziale) si rientra nel giro
        if (f.indexOf(document.activeElement) === -1) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
        else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }

    root.addEventListener("click", function (e) {
      var scheda = e.target.closest(".novp-scheda");
      if (scheda) {
        if (e.target.closest("[data-novp-mai]")) {
          ls(false, datiDi(scheda).spento, "1");
          chiudiScheda(scheda);
          return;
        }
        if (e.target.closest("[data-novp-chiudi]")) { chiudiScheda(scheda); return; }
        // un tocco sulla scheda di lato (quando scorrono) la porta al centro
        if (!e.target.closest("a,button") && fila.scrollWidth > fila.clientWidth + 1) {
          var r = scheda.getBoundingClientRect(), f = fila.getBoundingClientRect();
          var dx = r.left + r.width / 2 - (f.left + f.width / 2);
          if (Math.abs(dx) > 4) fila.scrollBy({ left: dx, behavior: calmo ? "auto" : "smooth" });
        }
        return;
      }
      // fuori dalle schede: lo sfondo o lo spazio fra le schede
      if (e.target.closest("[data-novp-tutto]")) close();
    });
    Array.prototype.forEach.call(root.querySelectorAll(".novp-cta"), function (a) {
      a.addEventListener("click", function () {
        var d = datiDi(a.closest(".novp-scheda"));
        if (d && typeof window.gtag === "function") window.gtag("event", d.evento[0], d.evento[1]);
      });
    });

    // Tornando Indietro (bfcache) dopo "Leggi l'approfondimento" la finestra non resta aperta
    window.addEventListener("pageshow", function (e) { if (e.persisted && !root.hidden) close(); });

    // --- Quando aprire --------------------------------------------------
    // Di solito: a pagina carica + 900 ms. Con la diretta prenotata:
    // quando la sua finestra si e' aperta e poi chiusa, o dopo l'attesa
    // massima se non si apre mai.
    function direttaAperta() {
      var el = document.getElementById("dirPromo");
      return !!el && !el.hidden;
    }
    function aspettaDiretta() {
      var avviato = Date.now(), vista = false, programmato = null, finito = false, osservatore = null, giro = null;
      function apriTraPoco(ms) {
        if (programmato || finito) return;
        programmato = setTimeout(function () {
          programmato = null;
          if (direttaAperta()) return; // si e' aperta nel frattempo: si riaspetta
          finito = true;
          if (osservatore) osservatore.disconnect();
          clearInterval(giro);
          open();
        }, ms);
      }
      function controlla() {
        if (finito) return;
        if (direttaAperta()) {
          vista = true;
          if (programmato) { clearTimeout(programmato); programmato = null; }
          return;
        }
        if (vista) apriTraPoco(PAUSA_DOPO_DIRETTA_MS);
        else if (Date.now() - avviato >= ATTESA_MASSIMA_MS) apriTraPoco(0);
      }
      if ("MutationObserver" in window) {
        osservatore = new MutationObserver(controlla);
        osservatore.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
      }
      // controlli a tempo per i casi senza mutazioni (attesa massima)
      giro = setInterval(controlla, 400);
      controlla();
    }
    function avvia() {
      if (direttaPrima) aspettaDiretta();
      else setTimeout(open, SHOW_DELAY_MS);
    }
    if (document.readyState === "complete") avvia();
    else window.addEventListener("load", avvia, { once: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();
