/*
 * Popup promozionale - Bando-tipo aiuti di Stato 2026 (decreto Mimit 18 giugno 2026)
 * Componente condiviso, autonomo (HTML + stile + logica iniettati da JS).
 * - Ha la precedenza sul popup FCD sulla home page: quando sta per comparire
 *   imposta window.__btPromoPlanned (fcd-popup.js, caricato dopo, si ritira)
 *   e marca come visto anche quel popup (mai due popup nella stessa sessione).
 * - Compare una volta per sessione, dopo un breve ritardo, senza data di scadenza.
 * - Si auto-disattiva sulla pagina dell'approfondimento (/bando_tipo_2026/).
 * - Marca come "visto" anche il popup FCD: mai due popup nella stessa sessione.
 * - Accessibile: role="dialog", focus trap, ESC, click sullo sfondo.
 * Percorsi root-relative: il sito e servito dalla radice del dominio.
 */
(function () {
  "use strict";

  // --- Configurazione ---------------------------------------------------
  var PAGE_URL = "/bando_tipo_2026/";
  // Nessuna data di scadenza: il popup resta attivo finche non viene rimosso
  // l'include dalla pagina. Per reintrodurre una scadenza, ripristinare qui
  // una data limite e la relativa guardia di uscita.
  var SHOW_DELAY_MS = 900;
  var SS_SEEN = "btPromoSeen";     // gia mostrato in questa sessione
  var LS_HIDDEN = "btPromoHidden"; // "non mostrare piu"
  var SS_FCD_SEEN = "fcdPromoSeen"; // chiave del popup FCD, per non sovrapporsi

  // --- Guardie di uscita ------------------------------------------------
  // Non mostrare sulla pagina dell'approfondimento (path ancorato all'inizio).
  if (location.pathname.indexOf("/bando_tipo_2026") === 0) return;
  // Evita doppia iniezione.
  if (document.getElementById("btPromo")) return;

  function ss(get, key, val) {
    try { return get ? sessionStorage.getItem(key) : sessionStorage.setItem(key, val); }
    catch (e) { return null; }
  }
  function ls(get, key, val) {
    try { return get ? localStorage.getItem(key) : localStorage.setItem(key, val); }
    catch (e) { return null; }
  }
  if (ls(true, LS_HIDDEN) === "1") return; // disattivato in modo permanente
  if (ss(true, SS_SEEN) === "1") return;   // gia visto in questa sessione

  // Tutte le guardie superate: questo popup comparira. Il flag dice al popup
  // FCD (fcd-popup.js, caricato dopo) di cedere la precedenza.
  window.__btPromoPlanned = true;

  // --- Stili (iniettati una sola volta) ---------------------------------
  var css = ''
    + '#btPromo{position:fixed;inset:0;z-index:2147482000;display:flex;'
    + 'align-items:center;justify-content:center;padding:20px;'
    + 'font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;}'
    + '#btPromo[hidden]{display:none;}'
    + '#btPromo,#btPromo *{box-sizing:border-box;}'
    /* entrata lenta e morbida (ease-out lungo), uscita piu rapida */
    + '#btPromo .btp-backdrop{position:absolute;inset:0;background:rgba(10,40,68,.62);'
    + 'backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);opacity:0;transition:opacity .3s ease;}'
    + '#btPromo.is-open .btp-backdrop{opacity:1;transition:opacity .55s ease;}'
    + '#btPromo .btp-card{position:relative;width:100%;max-width:520px;background:#fff;'
    + 'border-radius:20px;box-shadow:0 36px 80px rgba(10,40,68,.42);overflow:hidden;'
    + 'transform:translateY(26px) scale(.96);opacity:0;will-change:transform,opacity;'
    + 'transition:transform .3s ease,opacity .25s ease;outline:none;'
    + 'max-height:calc(100vh - 40px);overflow-y:auto;}'
    + '#btPromo.is-open .btp-card{transform:none;opacity:1;'
    + 'transition:transform .65s cubic-bezier(.16,1,.3,1),opacity .45s cubic-bezier(.33,1,.68,1);}'

    /* intestazione scura */
    + '#btPromo .btp-head{position:relative;padding:26px 28px 24px;overflow:hidden;'
    + 'background:linear-gradient(135deg,#0A1C2E 0%,#164068 55%,#1F5688 100%);}'
    + '#btPromo .btp-head::after{content:"";position:absolute;top:-90px;right:-70px;width:240px;height:240px;'
    + 'border-radius:50%;background:radial-gradient(circle,rgba(122,178,232,.34),rgba(122,178,232,0) 68%);}'
    + '#btPromo .btp-eyebrow{position:relative;z-index:1;display:inline-flex;align-items:center;gap:8px;'
    + 'background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.22);color:#DCE9F6;'
    + 'font-weight:700;font-size:11px;letter-spacing:.10em;text-transform:uppercase;'
    + 'padding:6px 12px;border-radius:999px;margin:0 0 16px;}'
    + '#btPromo .btp-dot{width:7px;height:7px;border-radius:50%;background:#7DD3A0;'
    + 'box-shadow:0 0 0 0 rgba(125,211,160,.7);animation:btpPulse 2s infinite;}'
    + '@keyframes btpPulse{0%{box-shadow:0 0 0 0 rgba(125,211,160,.65);}'
    + '70%{box-shadow:0 0 0 8px rgba(125,211,160,0);}100%{box-shadow:0 0 0 0 rgba(125,211,160,0);}}'
    + '#btPromo h2{position:relative;z-index:1;font-family:Inter,system-ui,sans-serif;color:#fff;'
    + 'font-size:25px;line-height:1.22;font-weight:800;letter-spacing:-.5px;margin:0 0 10px;}'
    + '#btPromo h2 em{font-style:normal;color:#8FC2EE;}'
    + '#btPromo .btp-sub{position:relative;z-index:1;color:rgba(255,255,255,.84);'
    + 'font-size:14px;line-height:1.6;margin:0;}'

    /* corpo chiaro */
    + '#btPromo .btp-body{padding:22px 28px 24px;}'
    + '#btPromo .btp-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:0 0 18px;}'
    + '#btPromo .btp-stat{background:#F3F7FB;border:1px solid #DCE7F2;border-radius:12px;'
    + 'padding:11px 8px;text-align:center;}'
    + '#btPromo .btp-stat b{display:block;color:#164068;font-size:16px;font-weight:800;line-height:1.2;}'
    + '#btPromo .btp-stat span{display:block;color:#6B7482;font-size:10.5px;line-height:1.35;margin-top:4px;}'
    + '#btPromo .btp-list{list-style:none;margin:0 0 18px;padding:0;}'
    + '#btPromo .btp-list li{display:flex;align-items:flex-start;gap:9px;color:#404a5a;'
    + 'font-size:13.5px;line-height:1.5;padding:5px 0;}'
    + '#btPromo .btp-list svg{flex:0 0 auto;width:17px;height:17px;margin-top:1px;color:#2A7D5A;}'
    + '#btPromo .btp-list b{color:#0A2844;}'
    + '#btPromo .btp-note{color:#7a8290;font-size:11.5px;line-height:1.5;margin:0 0 18px;}'

    /* azioni */
    + '#btPromo .btp-actions{display:flex;flex-direction:column;gap:9px;}'
    + '#btPromo .btp-cta{position:relative;overflow:hidden;display:inline-flex;align-items:center;'
    + 'justify-content:center;gap:9px;background:linear-gradient(135deg,#164068,#1F5688)!important;'
    + 'color:#fff!important;text-decoration:none!important;font-weight:700;font-size:15px;'
    + 'padding:15px 18px;border-radius:12px;border:0;cursor:pointer;'
    + 'box-shadow:0 10px 24px rgba(22,64,104,.30);'
    + 'transition:transform .18s ease,box-shadow .18s ease;}'
    + '#btPromo .btp-cta::after{content:"";position:absolute;top:0;left:-60%;width:40%;height:100%;'
    + 'background:linear-gradient(120deg,rgba(255,255,255,0),rgba(255,255,255,.34),rgba(255,255,255,0));'
    + 'transform:skewX(-18deg);animation:btpShine 3.4s ease-in-out 1.2s infinite;}'
    + '@keyframes btpShine{0%{left:-60%;}55%{left:130%;}100%{left:130%;}}'
    + '#btPromo .btp-cta:hover{transform:translateY(-2px);box-shadow:0 14px 30px rgba(22,64,104,.40);}'
    + '#btPromo .btp-cta svg{position:relative;z-index:1;width:17px;height:17px;}'
    + '#btPromo .btp-cta span{position:relative;z-index:1;}'
    + '#btPromo .btp-ghost{background:none;border:0;color:#5A6270;font-size:13px;'
    + 'font-weight:600;cursor:pointer;padding:8px;border-radius:8px;font-family:inherit;}'
    + '#btPromo .btp-ghost:hover{color:#0A2844;}'
    + '#btPromo .btp-close{position:absolute;top:14px;right:14px;width:34px;height:34px;z-index:2;'
    + 'display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.14);'
    + 'border:1px solid rgba(255,255,255,.24);border-radius:50%;cursor:pointer;color:#fff;'
    + 'transition:background .18s,color .18s;}'
    + '#btPromo .btp-close:hover{background:rgba(255,255,255,.26);}'
    + '#btPromo .btp-close svg{width:18px;height:18px;}'
    + '#btPromo .btp-dismiss{text-align:center;margin:12px 0 0;}'
    + '#btPromo .btp-dismiss button{background:none;border:0;color:#9aa1ac;font-size:11.5px;'
    + 'cursor:pointer;text-decoration:underline;font-family:inherit;padding:4px;}'
    + '#btPromo .btp-dismiss button:hover{color:#5A6270;}'
    + '#btPromo .btp-close:focus-visible,#btPromo .btp-ghost:focus-visible,'
    + '#btPromo .btp-dismiss button:focus-visible{outline:2px solid #164068;outline-offset:2px;border-radius:8px;}'
    + '#btPromo .btp-close:focus-visible{outline-color:#fff;}'
    + '#btPromo .btp-cta:focus-visible{outline:2px solid #fff;outline-offset:-4px;box-shadow:0 0 0 3px #2A5A85;}'
    + '@media (max-width:520px){#btPromo .btp-head{padding:22px 20px 20px;}'
    + '#btPromo .btp-body{padding:20px 20px 22px;}#btPromo h2{font-size:21px;}'
    + '#btPromo .btp-stat b{font-size:14.5px;}#btPromo .btp-stat span{font-size:10px;}}'
    + '@media (prefers-reduced-motion:reduce){#btPromo .btp-backdrop,#btPromo .btp-card{transition:none;}'
    + '#btPromo .btp-card{transform:none;}#btPromo .btp-dot{animation:none;}'
    + '#btPromo .btp-cta::after{animation:none;display:none;}}';

  // --- Markup -----------------------------------------------------------
  var iconCheck = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" '
    + 'stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
  var iconArrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    + 'stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line>'
    + '<polyline points="12 5 19 12 12 19"></polyline></svg>';
  var iconX = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" '
    + 'stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line>'
    + '<line x1="6" y1="6" x2="18" y2="18"></line></svg>';

  var html = ''
    + '<div class="btp-backdrop" data-btp-close aria-hidden="true"></div>'
    + '<div class="btp-card" role="dialog" aria-modal="true" tabindex="-1" '
    + 'aria-labelledby="btPromoTitle" aria-describedby="btPromoDesc">'
    + '<button type="button" class="btp-close" data-btp-close aria-label="Chiudi">' + iconX + '</button>'
    + '<div class="btp-head">'
    + '<span class="btp-eyebrow"><span class="btp-dot"></span>Novita &middot; Bando-tipo Mimit</span>'
    + '<h2 id="btPromoTitle">Aiuti di Stato: corsia preferenziale <em>a chi &egrave; virtuoso</em></h2>'
    + '<p class="btp-sub" id="btPromoDesc">Il nuovo bando-tipo cambia le regole di tutti i futuri bandi: '
    + 'contano legalit&agrave;, parit&agrave; di genere, inclusione e capacit&agrave; amministrativa e finanziaria dell\'impresa.</p>'
    + '</div>'
    + '<div class="btp-body">'
    + '<div class="btp-stats">'
    + '<div class="btp-stat"><b>60%</b><span>riservato alle PMI</span></div>'
    + '<div class="btp-stat"><b>4</b><span>premialit&agrave; in graduatoria</span></div>'
    + '<div class="btp-stat"><b>17.07.26</b><span>in Gazzetta Ufficiale</span></div>'
    + '</div>'
    + '<ul class="btp-list">'
    + '<li>' + iconCheck + '<span><b>Rating di legalit&agrave;</b> e certificazione della <b>parit&agrave; di genere</b> valgono punteggio</span></li>'
    + '<li>' + iconCheck + '<span>Gli <b>adeguati assetti</b> diventano requisito di accesso alle risorse</span></li>'
    + '<li>' + iconCheck + '<span>Tre verifiche da fare <b>prima</b> della domanda per non essere esclusi</span></li>'
    + '</ul>'
    + '<p class="btp-note">Analisi del decreto del Ministro delle imprese e del made in Italy del 18 giugno 2026, '
    + 'con l\'agenda operativa per arrivare pronti al prossimo bando.</p>'
    + '<div class="btp-actions">'
    + '<a class="btp-cta" href="' + PAGE_URL + '"><span>Leggi l\'approfondimento</span>' + iconArrow + '</a>'
    + '<button type="button" class="btp-ghost" data-btp-close>Chiudi</button>'
    + '</div>'
    + '<div class="btp-dismiss"><button type="button" data-btp-never>Non mostrare piu</button></div>'
    + '</div></div>';

  // --- Costruzione + comportamento --------------------------------------
  function build() {
    if (document.getElementById("btPromo")) return;

    var style = document.createElement("style");
    style.id = "btPromoStyle";
    style.textContent = css;
    document.head.appendChild(style);

    var root = document.createElement("div");
    root.id = "btPromo";
    root.setAttribute("hidden", "");
    root.innerHTML = html;
    document.body.appendChild(root);

    var card = root.querySelector(".btp-card");
    var lastFocus = null;
    var isClosing = false;

    function focusables() {
      return Array.prototype.slice.call(
        card.querySelectorAll('a[href],button:not([disabled])')
      );
    }
    function open() {
      lastFocus = document.activeElement;
      root.hidden = false;
      ss(false, SS_SEEN, "1");     // conta come "visto" in questa sessione
      ss(false, SS_FCD_SEEN, "1"); // niente secondo popup nella stessa sessione
      // doppio rAF: la transizione parte a stili applicati e layout stabile,
      // senza il "salto" del reflow forzato
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          root.classList.add("is-open");
        });
      });
      // focus sul dialog stesso: nessun anello di focus che lampeggia
      // sui bottoni durante l'animazione di entrata
      try { card.focus({ preventScroll: true }); } catch (e) { card.focus(); }
      document.addEventListener("keydown", onKey, true);
    }
    function close() {
      if (isClosing) return;
      isClosing = true;
      root.classList.remove("is-open");
      document.removeEventListener("keydown", onKey, true);
      var finished = false;
      var done = function () {
        if (finished) return;
        finished = true;
        root.hidden = true;
        if (lastFocus && lastFocus.focus && document.contains(lastFocus)) {
          try { lastFocus.focus(); } catch (e) {}
        }
      };
      card.addEventListener("transitionend", done, { once: true });
      // fallback se transitionend non scatta
      setTimeout(done, 550);
    }
    function never() {
      ls(false, LS_HIDDEN, "1");
      close();
    }
    function onKey(e) {
      if (e.key === "Escape" || e.keyCode === 27) { e.preventDefault(); close(); return; }
      if (e.key === "Tab" || e.keyCode === 9) {
        var f = focusables();
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }

    root.addEventListener("click", function (e) {
      if (e.target.closest("[data-btp-never]")) { never(); return; }
      if (e.target.closest("[data-btp-close]")) { close(); return; }
    });
    // la CTA naviga normalmente (link reale): segna come visto e traccia il clic
    var cta = root.querySelector(".btp-cta");
    if (cta) cta.addEventListener("click", function () {
      ss(false, SS_SEEN, "1");
      if (typeof window.gtag === "function") {
        window.gtag("event", "click_popup", { pagina: "Bando-tipo aiuti di Stato 2026" });
      }
    });

    // Apri solo a pagina completamente carica: l'entrata non compete con il
    // rendering iniziale (immagini, font) e la transizione resta fluida.
    function scheduleOpen() { setTimeout(open, SHOW_DELAY_MS); }
    if (document.readyState === "complete") scheduleOpen();
    else window.addEventListener("load", scheduleOpen, { once: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();
