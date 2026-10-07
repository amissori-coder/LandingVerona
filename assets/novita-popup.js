/*
 * Popup "Novita'" della home - Cassazione n. 7134/2026
 * Componente autonomo (HTML + stile + logica iniettati da JS), stesso
 * comportamento degli altri popup della home (fcd-popup.js, bando-tipo-popup.js).
 * - Compare SOLO sulla home page, una volta per sessione.
 * - E' il SECONDO popup all'entrata: se un altro popup della home deve
 *   comparire (diretta, bando-tipo o FCD), aspetta che venga chiuso e poi
 *   compare. Se nella sessione non c'e' un primo popup, compare da solo.
 *   Non apre mai sopra un altro popup.
 * - "Non mostrare piu" lo disattiva in modo permanente per questa novita'
 *   (la chiave contiene l'identificativo: una novita' nuova riparte da capo).
 * - Accessibile: role="dialog", focus trap, ESC, click sullo sfondo.
 * Sostituisce la striscia fissa sotto il menu che c'era prima.
 * Percorsi root-relative: il sito e servito dalla radice del dominio.
 */
(function () {
  "use strict";

  // --- Configurazione ---------------------------------------------------
  var NOVITA_ID = "cass7134";
  var URL_APPROFONDIMENTO = "/cassazione_7134_2026/";
  var SS_SEEN = "novitaPromoSeen_" + NOVITA_ID;     // gia mostrato in questa sessione
  var LS_HIDDEN = "novitaPromoHidden_" + NOVITA_ID; // "non mostrare piu"
  var ALTRI = ["dirPromo", "btPromo", "fcdPromo"];  // i popup che vengono prima
  var PAUSA_DOPO_PRIMO_MS = 700;   // respiro fra la chiusura del primo e l'apertura di questo
  var DA_SOLO_DOPO_MS = 2400;      // senza un primo popup in vista: compare da solo
  var ATTESA_MASSIMA_MS = 6000;    // un primo popup previsto ma mai aperto (es. diretta gia conclusa): non aspettare oltre

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
  if (ls(true, LS_HIDDEN) === "1") return; // disattivato in modo permanente
  if (ss(true, SS_SEEN) === "1") return;   // gia visto in questa sessione

  // --- Stili (iniettati una sola volta) ---------------------------------
  var css = ''
    + '#novitaPromo{position:fixed;inset:0;z-index:2147482000;display:flex;'
    + 'align-items:center;justify-content:center;padding:20px;'
    + 'font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;}'
    + '#novitaPromo[hidden]{display:none;}'
    + '#novitaPromo,#novitaPromo *{box-sizing:border-box;}'
    + '#novitaPromo .novp-backdrop{position:absolute;inset:0;background:rgba(10,40,68,.55);'
    + 'opacity:0;transition:opacity .3s ease;}'
    + '#novitaPromo.is-open .novp-backdrop{opacity:1;transition:opacity .55s ease;}'
    + '#novitaPromo .novp-card{position:relative;width:100%;max-width:460px;background:#fff;'
    + 'border-radius:4px;overflow:hidden;box-shadow:0 24px 60px rgba(10,40,68,.35);'
    + 'transform:translateY(14px);opacity:0;transition:transform .3s ease,opacity .3s ease;outline:none;}'
    + '#novitaPromo.is-open .novp-card{transform:none;opacity:1;'
    + 'transition:transform .6s cubic-bezier(.16,1,.3,1),opacity .45s ease;}'
    + '#novitaPromo .novp-pad{padding:24px 26px 22px;}'
    + '#novitaPromo .novp-testa{display:flex;align-items:baseline;justify-content:space-between;gap:12px;'
    + 'padding:0 40px 12px 0;margin:0 0 16px;border-bottom:1px solid rgba(22,64,104,.22);}'
    + '#novitaPromo .novp-eyebrow{font-family:Montserrat,Inter,system-ui,sans-serif;font-size:11px;'
    + 'font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#164068;}'
    + '#novitaPromo .novp-data{font-size:12px;color:#5b6b7c;white-space:nowrap;}'
    + '#novitaPromo h2{font-family:Montserrat,Inter,system-ui,sans-serif;color:#0A2844;'
    + 'font-size:22px;font-weight:800;line-height:1.2;letter-spacing:-.2px;margin:0 0 10px;}'
    + '#novitaPromo p{color:#404a5a;font-size:15px;line-height:1.6;margin:0 0 20px;}'
    + '#novitaPromo p b{color:#0A2844;}'
    + '#novitaPromo .novp-actions{display:flex;flex-direction:column;gap:9px;text-align:center;}'
    + '#novitaPromo .novp-cta{display:inline-flex;align-items:center;justify-content:center;gap:8px;'
    + 'background:#164068;color:#fff;text-decoration:none;font-weight:700;font-size:14.5px;'
    + 'padding:13px 18px;border-radius:3px;transition:background .2s ease;}'
    + '#novitaPromo .novp-cta:hover{background:#0A2844;}'
    + '#novitaPromo .novp-cta svg{width:16px;height:16px;}'
    + '#novitaPromo .novp-ghost{background:none;border:0;color:#5A6270;font-size:13px;'
    + 'cursor:pointer;padding:8px;font-family:inherit;}'
    + '#novitaPromo .novp-ghost:hover{color:#0A2844;}'
    + '#novitaPromo .novp-close{position:absolute;top:16px;right:14px;width:34px;height:34px;'
    + 'display:inline-flex;align-items:center;justify-content:center;background:none;border:0;'
    + 'border-radius:3px;color:#5A6270;cursor:pointer;}'
    + '#novitaPromo .novp-close:hover{background:#F3F5F8;color:#0A2844;}'
    + '#novitaPromo .novp-close svg{width:18px;height:18px;}'
    + '#novitaPromo .novp-dismiss{text-align:center;margin:10px 0 0;}'
    + '#novitaPromo .novp-dismiss button{background:none;border:0;color:#6b7482;font-size:11.5px;'
    + 'cursor:pointer;text-decoration:underline;font-family:inherit;padding:4px;}'
    + '#novitaPromo .novp-dismiss button:hover{color:#3d4654;}'
    + '#novitaPromo .novp-close:focus-visible,#novitaPromo .novp-ghost:focus-visible,'
    + '#novitaPromo .novp-dismiss button:focus-visible{outline:2px solid #164068;outline-offset:2px;}'
    + '#novitaPromo .novp-cta:focus-visible{outline:2px solid #fff;outline-offset:-4px;box-shadow:0 0 0 3px #164068;}'
    + '@media (max-width:480px){#novitaPromo .novp-pad{padding:20px 20px 18px;}'
    + '#novitaPromo h2{font-size:19px;}#novitaPromo .novp-testa{flex-direction:column;gap:2px;}}'
    + '@media (prefers-reduced-motion:reduce){#novitaPromo .novp-backdrop,'
    + '#novitaPromo .novp-card{transition:none;}#novitaPromo .novp-card{transform:none;}}';

  // --- Markup -----------------------------------------------------------
  var iconArrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'
    + '<line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>';
  var iconX = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" '
    + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'
    + '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

  var html = ''
    + '<div class="novp-backdrop" data-novp-close aria-hidden="true"></div>'
    + '<div class="novp-card" role="dialog" aria-modal="true" tabindex="-1" '
    + 'aria-labelledby="novitaPromoTitle" aria-describedby="novitaPromoDesc">'
    + '<button type="button" class="novp-close" data-novp-close aria-label="Chiudi">' + iconX + '</button>'
    + '<div class="novp-pad">'
    + '<div class="novp-testa"><span class="novp-eyebrow">Osservatorio giurisprudenza</span>'
    + '<span class="novp-data">Ordinanza 25 marzo 2026</span></div>'
    + '<h2 id="novitaPromoTitle">Cassazione n. 7134/2026</h2>'
    + '<p id="novitaPromoDesc">Nullo il finanziamento concesso all\'impresa gi&agrave; decotta, anche se coperto '
    + 'dalla garanzia MCC. Gli <b>adeguati assetti</b> diventano una condizione di <b>bancabilit&agrave;</b>.</p>'
    + '<div class="novp-actions">'
    + '<a class="novp-cta" href="' + URL_APPROFONDIMENTO + '">Leggi l\'approfondimento' + iconArrow + '</a>'
    + '<button type="button" class="novp-ghost" data-novp-close>Chiudi</button>'
    + '</div>'
    + '<div class="novp-dismiss"><button type="button" data-novp-never>Non mostrare pi&ugrave;</button></div>'
    + '</div></div>';

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

    var card = root.querySelector(".novp-card");
    var lastFocus = null;
    var isClosing = false;

    function focusables() {
      return Array.prototype.slice.call(card.querySelectorAll('a[href],button:not([disabled])'));
    }
    function open() {
      if (!root.hidden) return;
      lastFocus = document.activeElement;
      root.hidden = false;
      ss(false, SS_SEEN, "1");
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { root.classList.add("is-open"); });
      });
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
      setTimeout(done, 450);
    }
    function never() { ls(false, LS_HIDDEN, "1"); close(); }
    function onKey(e) {
      if (e.key === "Escape" || e.keyCode === 27) { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key === "Tab" || e.keyCode === 9) {
        var f = focusables();
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }

    root.addEventListener("click", function (e) {
      if (e.target.closest("[data-novp-never]")) { never(); return; }
      if (e.target.closest("[data-novp-close]")) { close(); return; }
    });
    var cta = root.querySelector(".novp-cta");
    if (cta) cta.addEventListener("click", function () {
      ss(false, SS_SEEN, "1");
      if (typeof window.gtag === "function") window.gtag("event", "click_popup_novita", { destinazione: URL_APPROFONDIMENTO });
    });

    // --- Turno: dopo il primo popup -------------------------------------
    // Un altro popup e' "aperto" quando il suo contenitore esiste e non e' nascosto.
    function altroAperto() {
      for (var i = 0; i < ALTRI.length; i++) {
        var el = document.getElementById(ALTRI[i]);
        if (el && !el.hidden) return true;
      }
      return false;
    }
    // Un altro popup e' "previsto" se il suo script ha prenotato il turno
    // (diretta e bando-tipo impostano un flag) o se ha gia creato il contenitore.
    function altroPrevisto() {
      if (window.__dirPromoPlanned || window.__btPromoPlanned) return true;
      for (var i = 0; i < ALTRI.length; i++) if (document.getElementById(ALTRI[i])) return true;
      return false;
    }
    var avviato = Date.now(), primoVisto = false, programmato = null, finito = false, osservatore = null;
    function apriTraPoco(ms) {
      if (programmato || finito) return;
      programmato = setTimeout(function () {
        programmato = null;
        if (altroAperto()) return;          // un primo popup si e' aperto nel frattempo: si riaspetta
        finito = true;
        if (osservatore) osservatore.disconnect();
        open();
      }, ms);
    }
    function controlla() {
      if (finito) return;
      if (altroAperto()) {
        primoVisto = true;
        if (programmato) { clearTimeout(programmato); programmato = null; }
        return;
      }
      var trascorso = Date.now() - avviato;
      if (primoVisto) { apriTraPoco(PAUSA_DOPO_PRIMO_MS); return; }
      if (!altroPrevisto() && trascorso >= DA_SOLO_DOPO_MS) { apriTraPoco(0); return; }
      if (trascorso >= ATTESA_MASSIMA_MS) { apriTraPoco(0); return; }
    }
    function avvia() {
      avviato = Date.now();
      if ("MutationObserver" in window) {
        osservatore = new MutationObserver(controlla);
        osservatore.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
      }
      // controlli a tempo per i casi senza mutazioni (nessun primo popup, attesa massima)
      var giro = setInterval(function () { if (finito) { clearInterval(giro); return; } controlla(); }, 400);
      controlla();
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
