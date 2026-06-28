/*
 * Popup promozionale - Fondo Contrasto Deindustrializzazione 2026
 * Componente condiviso, autonomo (HTML + stile + logica iniettati da JS).
 * - Compare su tutte le pagine del sito, una volta per sessione.
 * - Mostra la data: attivo fino al 30 ottobre 2026, poi si nasconde da solo.
 * - Si auto-disattiva sulla pagina del fondo stesso (/fcd_2026/).
 * - Accessibile: role="dialog", focus trap, ESC, click sullo sfondo.
 * Percorsi root-relative: il sito e servito dalla radice del dominio.
 */
(function () {
  "use strict";

  // --- Configurazione ---------------------------------------------------
  var FUND_URL = "/fcd_2026/";
  // Mostra il popup FINO AL 30 ottobre 2026 incluso: si nasconde dal 31/10/2026.
  var HIDE_FROM = new Date(2026, 9, 31, 0, 0, 0); // mese 9 = ottobre
  var SHOW_DELAY_MS = 900;
  var SS_SEEN = "fcdPromoSeen";     // gia mostrato in questa sessione
  var LS_HIDDEN = "fcdPromoHidden"; // "non mostrare piu"

  // --- Guardie di uscita ------------------------------------------------
  // Non mostrare sulla pagina del fondo stesso (path ancorato all'inizio).
  if (location.pathname.indexOf("/fcd_2026") === 0) return;
  // Non mostrare dopo la data limite.
  try { if (new Date().getTime() >= HIDE_FROM.getTime()) return; } catch (e) {}
  // Evita doppia iniezione.
  if (document.getElementById("fcdPromo")) return;

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

  // --- Stili (iniettati una sola volta) ---------------------------------
  var css = ''
    + '#fcdPromo{position:fixed;inset:0;z-index:2147482000;display:flex;'
    + 'align-items:center;justify-content:center;padding:20px;'
    + 'font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;}'
    + '#fcdPromo[hidden]{display:none;}'
    + '#fcdPromo,#fcdPromo *{box-sizing:border-box;}'
    + '#fcdPromo .fcdp-backdrop{position:absolute;inset:0;background:rgba(10,40,68,.55);'
    + 'backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);opacity:0;transition:opacity .28s ease;}'
    + '#fcdPromo.is-open .fcdp-backdrop{opacity:1;}'
    + '#fcdPromo .fcdp-card{position:relative;width:100%;max-width:440px;background:#fff;'
    + 'border-radius:18px;box-shadow:0 30px 70px rgba(10,40,68,.35);overflow:hidden;'
    + 'transform:translateY(14px) scale(.98);opacity:0;transition:transform .3s cubic-bezier(.22,1,.36,1),opacity .3s ease;}'
    + '#fcdPromo.is-open .fcdp-card{transform:none;opacity:1;}'
    + '#fcdPromo .fcdp-accent{height:5px;background:linear-gradient(90deg,#0A2844,#2A5A85 55%,#5B89B8);}'
    + '#fcdPromo .fcdp-pad{padding:26px 26px 24px;}'
    + '#fcdPromo .fcdp-eyebrow{display:inline-flex;align-items:center;gap:7px;'
    + 'background:#EAF1F8;color:#164068;font-weight:700;font-size:11.5px;letter-spacing:.06em;'
    + 'text-transform:uppercase;padding:6px 11px;border-radius:999px;margin:0 0 14px;}'
    + '#fcdPromo .fcdp-eyebrow svg{width:14px;height:14px;}'
    + '#fcdPromo h2{font-family:Montserrat,Inter,system-ui,sans-serif;color:#0A2844;'
    + 'font-size:21px;line-height:1.25;font-weight:800;margin:0 0 10px;}'
    + '#fcdPromo p{color:#404a5a;font-size:14.5px;line-height:1.6;margin:0 0 14px;}'
    + '#fcdPromo .fcdp-date{display:flex;align-items:flex-start;gap:9px;background:#F3F7FB;'
    + 'border:1px solid #D8E3EE;border-radius:12px;padding:11px 13px;margin:0 0 8px;'
    + 'color:#164068;font-size:13px;line-height:1.5;font-weight:600;}'
    + '#fcdPromo .fcdp-date svg{flex:0 0 auto;width:17px;height:17px;margin-top:1px;color:#2A5A85;}'
    + '#fcdPromo .fcdp-date b{color:#0A2844;}'
    + '#fcdPromo .fcdp-note{color:#7a8290;font-size:11.5px;line-height:1.5;margin:0 0 18px;}'
    + '#fcdPromo .fcdp-actions{display:flex;flex-direction:column;gap:9px;}'
    + '#fcdPromo .fcdp-cta{display:inline-flex;align-items:center;justify-content:center;gap:8px;'
    + 'background:#164068!important;color:#fff!important;text-decoration:none!important;font-weight:700;font-size:14.5px;'
    + 'padding:13px 18px;border-radius:11px;border:0;cursor:pointer;'
    + 'transition:background .18s ease,transform .18s ease;}'
    + '#fcdPromo .fcdp-cta:hover{background:#0A2844;transform:translateY(-1px);}'
    + '#fcdPromo .fcdp-cta svg{width:16px;height:16px;}'
    + '#fcdPromo .fcdp-ghost{background:none;border:0;color:#5A6270;font-size:13px;'
    + 'font-weight:600;cursor:pointer;padding:8px;border-radius:8px;font-family:inherit;}'
    + '#fcdPromo .fcdp-ghost:hover{color:#0A2844;}'
    + '#fcdPromo .fcdp-close{position:absolute;top:12px;right:12px;width:34px;height:34px;'
    + 'display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.85);'
    + 'border:0;border-radius:50%;cursor:pointer;color:#5A6270;transition:background .18s,color .18s;}'
    + '#fcdPromo .fcdp-close:hover{background:#F3F5F8;color:#0A2844;}'
    + '#fcdPromo .fcdp-close svg{width:18px;height:18px;}'
    + '#fcdPromo .fcdp-dismiss{text-align:center;margin:12px 0 0;}'
    + '#fcdPromo .fcdp-dismiss button{background:none;border:0;color:#9aa1ac;font-size:11.5px;'
    + 'cursor:pointer;text-decoration:underline;font-family:inherit;padding:4px;}'
    + '#fcdPromo .fcdp-dismiss button:hover{color:#5A6270;}'
    + '#fcdPromo .fcdp-close:focus-visible,#fcdPromo .fcdp-ghost:focus-visible,'
    + '#fcdPromo .fcdp-dismiss button:focus-visible{outline:2px solid #164068;outline-offset:2px;border-radius:8px;}'
    + '#fcdPromo .fcdp-cta:focus-visible{outline:2px solid #fff;outline-offset:-4px;box-shadow:0 0 0 3px #2A5A85;}'
    + '@media (max-width:480px){#fcdPromo .fcdp-pad{padding:22px 20px 20px;}'
    + '#fcdPromo h2{font-size:19px;}}'
    + '@media (prefers-reduced-motion:reduce){#fcdPromo .fcdp-backdrop,'
    + '#fcdPromo .fcdp-card{transition:none;}#fcdPromo .fcdp-card{transform:none;}}';

  // --- Markup -----------------------------------------------------------
  var iconNew = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    + 'stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l18-5v12L3 14v-3z"></path>'
    + '<path d="M11.6 16.8a3 3 0 0 1-5.8-1.6"></path></svg>';
  var iconCal = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    + 'stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect>'
    + '<line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line>'
    + '<line x1="3" y1="10" x2="21" y2="10"></line></svg>';
  var iconArrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    + 'stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line>'
    + '<polyline points="12 5 19 12 12 19"></polyline></svg>';
  var iconX = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" '
    + 'stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line>'
    + '<line x1="6" y1="6" x2="18" y2="18"></line></svg>';

  var html = ''
    + '<div class="fcdp-backdrop" data-fcdp-close aria-hidden="true"></div>'
    + '<div class="fcdp-card" role="dialog" aria-modal="true" '
    + 'aria-labelledby="fcdPromoTitle" aria-describedby="fcdPromoDesc">'
    + '<div class="fcdp-accent"></div>'
    + '<button type="button" class="fcdp-close" data-fcdp-close aria-label="Chiudi">' + iconX + '</button>'
    + '<div class="fcdp-pad">'
    + '<span class="fcdp-eyebrow">' + iconNew + 'Nuovo bando nazionale</span>'
    + '<h2 id="fcdPromoTitle">Fondo Contrasto Deindustrializzazione 2026</h2>'
    + '<p id="fcdPromoDesc">Contributo a fondo perduto fino a <b>300.000&nbsp;&euro;</b>, '
    + 'copertura fino al <b>100% delle spese ammissibili</b>, per le imprese manifatturiere '
    + '(ATECO sezione C) nei territori dei Consorzi industriali del Lazio e di Piceno Consind.</p>'
    + '<div class="fcdp-date">' + iconCal
    + '<span>Approfondimento e simulatori online disponibili <b>fino al 30 ottobre 2026</b>.</span></div>'
    + '<p class="fcdp-note">Termini di presentazione delle domande in via di definizione. '
    + 'Aiuto in regime de minimis (Reg. UE 2023/2831).</p>'
    + '<div class="fcdp-actions">'
    + '<a class="fcdp-cta" href="' + FUND_URL + '">Scopri il fondo e simula il contributo' + iconArrow + '</a>'
    + '<button type="button" class="fcdp-ghost" data-fcdp-close>Chiudi</button>'
    + '</div>'
    + '<div class="fcdp-dismiss"><button type="button" data-fcdp-never>Non mostrare piu</button></div>'
    + '</div></div>';

  // --- Costruzione + comportamento --------------------------------------
  function build() {
    if (document.getElementById("fcdPromo")) return;

    var style = document.createElement("style");
    style.id = "fcdPromoStyle";
    style.textContent = css;
    document.head.appendChild(style);

    var root = document.createElement("div");
    root.id = "fcdPromo";
    root.setAttribute("hidden", "");
    root.innerHTML = html;
    document.body.appendChild(root);

    var card = root.querySelector(".fcdp-card");
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
      ss(false, SS_SEEN, "1"); // conta come "visto" in questa sessione
      // forza reflow per far partire la transizione
      void root.offsetWidth;
      root.classList.add("is-open");
      var f = focusables();
      if (f.length) f[0].focus();
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
      setTimeout(done, 450);
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
      if (e.target.closest("[data-fcdp-never]")) { never(); return; }
      if (e.target.closest("[data-fcdp-close]")) { close(); return; }
    });
    // la CTA naviga normalmente (link reale): segna come visto
    var cta = root.querySelector(".fcdp-cta");
    if (cta) cta.addEventListener("click", function () { ss(false, SS_SEEN, "1"); });

    setTimeout(open, SHOW_DELAY_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();
