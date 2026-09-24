/*
 * Popup promozionale - Diretta Napoli (accesso alla diretta dell'evento)
 * Componente autonomo (HTML + stile + logica iniettati da JS), costruito come
 * bando-tipo-popup.js e fcd-popup.js. Date e stato da assets/diretta-stato.js
 * (window.NGBDiretta), che va caricato PRIMA di questo file.
 * - Ha la PRECEDENZA su tutti gli altri popup della home: quando sta per
 *   comparire imposta subito window.__dirPromoPlanned (bando-tipo-popup.js e
 *   fcd-popup.js, caricati dopo, si ritirano) e all'apertura marca come visti
 *   anche quei due popup (mai due popup nella stessa sessione).
 * - Compare SOLO sulla home page e solo nella finestra di date dell'evento:
 *   da NGBDiretta.EVENTO.mostraDaGiorni giorni prima dell'inizio fino alla
 *   fine, poi si spegne da solo (niente da togliere a mano dopo l'evento).
 * - Il giorno dell'evento cambia testo: "Siamo in diretta: accedi" con
 *   l'indicatore rosso IN DIRETTA mentre si e' in onda, "Oggi in diretta
 *   dalle 9.00" prima. Lo stato arriva da NGBDiretta.leggi (endpoint con
 *   cache, chiesto solo quel giorno): mai una chiamata a Firebase.
 * - Una volta per sessione; "Non mostrare piu" vale per questo evento.
 * - Accessibile: role="dialog", focus trap, ESC, click sullo sfondo;
 *   rispetta prefers-reduced-motion (niente movimento, niente pulsazioni).
 * Percorsi root-relative: il sito e servito dalla radice del dominio.
 */
(function () {
  "use strict";

  // --- Configurazione ---------------------------------------------------
  var D = window.NGBDiretta;
  // Senza diretta-stato.js non si sa quando comparire: niente popup, e gli
  // altri due si comportano come prima.
  if (!D || !D.EVENTO) return;
  var EVENTO = D.EVENTO;
  var SHOW_DELAY_MS = 900;
  // Il giorno dell'evento il testo dipende dallo stato: si aspetta la
  // risposta al massimo per questo tempo dopo il ritardo normale, poi si
  // apre con il testo "Oggi in diretta" (vero comunque).
  var ATTESA_STATO_MS = 2500;
  var SS_SEEN = "dirPromoSeen";                      // gia mostrato in questa sessione
  var LS_HIDDEN = "dirPromoHidden_" + EVENTO.id;     // "non mostrare piu" (per evento)
  var SS_ALTRI = ["btPromoSeen", "fcdPromoSeen"];    // i popup che cedono la precedenza

  // --- Guardie di uscita ------------------------------------------------
  // Mostra SOLO sulla home page.
  if (location.pathname !== "/" && location.pathname !== "/index.html") return;
  // Solo nella finestra di date: prima e dopo si spegne da solo.
  var faseIniziale = D.fase();
  if (faseIniziale !== "prima" && faseIniziale !== "oggi") return;
  // Evita doppia iniezione.
  if (document.getElementById("dirPromo")) return;

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
  // Se in questa scheda si e' gia letto che la diretta e' terminata (finita
  // prima dell'orario previsto), non ha piu senso prenotarsi: lascia il posto
  // agli altri popup.
  var giaLetto = D.ultimo && D.ultimo();
  if (faseIniziale === "oggi" && giaLetto && giaLetto.stato === "terminato") return;

  // Tutte le guardie superate: questo popup comparira. Il flag, impostato
  // subito (in modo sincrono), dice a bando-tipo-popup.js e fcd-popup.js,
  // caricati dopo, di cedere la precedenza.
  window.__dirPromoPlanned = true;

  // --- Testi ------------------------------------------------------------
  var orario = D.orario();
  var eyebrow = "Diretta " + String(EVENTO.titolo || "").replace(", ", " · ");
  var quando = orario.giorno ? orario.giorno.charAt(0).toUpperCase() + orario.giorno.slice(1)
    + ", dalle " + orario.inizio + " alle " + orario.fine : "";
  var TESTI = {
    prima: {
      titolo: "Segui il convegno in diretta",
      sotto: "Next Generation Business Napoli si segue anche online, in diretta, "
        + "da computer, tablet e telefono."
    },
    oggi: {
      titolo: "Oggi in diretta dalle " + orario.inizio,
      sotto: "Il convegno di Napoli si segue online: tieni a portata di mano il nome utente "
        + "e la password che hai ricevuto via email."
    },
    inOnda: {
      titolo: "Siamo in diretta: accedi",
      sotto: "Il convegno di Napoli è in corso: entra con il nome utente e la password "
        + "che hai ricevuto via email."
    }
  };

  // --- Stili (iniettati una sola volta) ---------------------------------
  var css = ''
    + '#dirPromo{position:fixed;inset:0;z-index:2147482000;display:flex;'
    + 'align-items:center;justify-content:center;padding:20px;'
    + 'font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;}'
    + '#dirPromo[hidden],#dirPromo [hidden]{display:none!important;}'
    + '#dirPromo,#dirPromo *{box-sizing:border-box;}'
    /* entrata lenta e morbida (ease-out lungo), uscita piu rapida */
    + '#dirPromo .dirp-backdrop{position:absolute;inset:0;background:rgba(10,40,68,.62);'
    + 'backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);opacity:0;transition:opacity .3s ease;}'
    + '#dirPromo.is-open .dirp-backdrop{opacity:1;transition:opacity .55s ease;}'
    + '#dirPromo .dirp-card{position:relative;width:100%;max-width:480px;background:#fff;'
    + 'border-radius:20px;box-shadow:0 36px 80px rgba(10,40,68,.42);overflow:hidden;'
    + 'transform:translateY(26px) scale(.96);opacity:0;will-change:transform,opacity;'
    + 'transition:transform .3s ease,opacity .25s ease;outline:none;'
    + 'max-height:calc(100vh - 40px);overflow-y:auto;}'
    + '#dirPromo.is-open .dirp-card{transform:none;opacity:1;'
    + 'transition:transform .65s cubic-bezier(.16,1,.3,1),opacity .45s cubic-bezier(.33,1,.68,1);}'

    /* intestazione scura, come le testate del sito */
    + '#dirPromo .dirp-head{position:relative;padding:26px 28px 24px;overflow:hidden;'
    + 'background:linear-gradient(135deg,#0A1C2E 0%,#164068 55%,#1F5688 100%);}'
    + '#dirPromo .dirp-head::after{content:"";position:absolute;top:-90px;right:-70px;width:240px;height:240px;'
    + 'border-radius:50%;background:radial-gradient(circle,rgba(122,178,232,.34),rgba(122,178,232,0) 68%);}'
    + '#dirPromo .dirp-eyebrow{position:relative;z-index:1;display:inline-flex;align-items:center;gap:8px;'
    + 'background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.22);color:#DCE9F6;'
    + 'font-weight:700;font-size:11px;letter-spacing:.10em;text-transform:uppercase;'
    + 'padding:6px 12px;border-radius:999px;margin:0 0 16px;}'
    + '#dirPromo .dirp-eyebrow svg{width:15px;height:15px;flex:0 0 auto;color:#8FC2EE;}'
    /* indicatore IN DIRETTA: rosso pieno, pallino bianco che pulsa */
    + '#dirPromo .dirp-live{position:relative;z-index:1;display:inline-flex;align-items:center;gap:8px;'
    + 'background:#C8203F;color:#fff;font-weight:800;font-size:11.5px;letter-spacing:.12em;'
    + 'text-transform:uppercase;padding:6px 13px 6px 11px;border-radius:999px;margin:0 0 16px;'
    + 'box-shadow:0 6px 18px rgba(200,32,63,.45);}'
    + '#dirPromo .dirp-live-dot{width:8px;height:8px;border-radius:50%;background:#fff;'
    + 'box-shadow:0 0 0 0 rgba(255,255,255,.8);animation:dirpPulse 1.6s infinite;}'
    + '@keyframes dirpPulse{0%{box-shadow:0 0 0 0 rgba(255,255,255,.75);}'
    + '70%{box-shadow:0 0 0 7px rgba(255,255,255,0);}100%{box-shadow:0 0 0 0 rgba(255,255,255,0);}}'
    + '#dirPromo h2{position:relative;z-index:1;font-family:Montserrat,Inter,system-ui,sans-serif;color:#fff;'
    + 'font-size:25px;line-height:1.22;font-weight:800;letter-spacing:-.3px;margin:0 0 10px;}'
    + '#dirPromo .dirp-sub{position:relative;z-index:1;color:rgba(255,255,255,.84);'
    + 'font-size:14px;line-height:1.6;margin:0;}'

    /* corpo chiaro */
    + '#dirPromo .dirp-body{padding:22px 28px 24px;}'
    + '#dirPromo .dirp-info{list-style:none;margin:0 0 20px;padding:0;display:flex;flex-direction:column;gap:8px;}'
    + '#dirPromo .dirp-info li{display:flex;align-items:flex-start;gap:10px;background:#F3F7FB;'
    + 'border:1px solid #DCE7F2;border-radius:12px;padding:11px 13px;'
    + 'color:#404a5a;font-size:13.5px;line-height:1.5;}'
    + '#dirPromo .dirp-info svg{flex:0 0 auto;width:17px;height:17px;margin-top:1px;color:#2A5A85;}'
    + '#dirPromo .dirp-info b{color:#0A2844;}'

    /* azioni */
    + '#dirPromo .dirp-actions{display:flex;flex-direction:column;gap:6px;}'
    + '#dirPromo .dirp-cta{position:relative;overflow:hidden;display:inline-flex;align-items:center;'
    + 'justify-content:center;gap:9px;background:linear-gradient(135deg,#164068,#1F5688)!important;'
    + 'color:#fff!important;text-decoration:none!important;font-weight:700;font-size:15px;'
    + 'padding:15px 18px;border-radius:12px;border:0;cursor:pointer;'
    + 'box-shadow:0 10px 24px rgba(22,64,104,.30);'
    + 'transition:transform .18s ease,box-shadow .18s ease;}'
    + '#dirPromo .dirp-cta::after{content:"";position:absolute;top:0;left:-60%;width:40%;height:100%;'
    + 'background:linear-gradient(120deg,rgba(255,255,255,0),rgba(255,255,255,.34),rgba(255,255,255,0));'
    + 'transform:skewX(-18deg);animation:dirpShine 3.4s ease-in-out 1.2s infinite;}'
    + '@keyframes dirpShine{0%{left:-60%;}55%{left:130%;}100%{left:130%;}}'
    + '#dirPromo .dirp-cta:hover{transform:translateY(-2px);box-shadow:0 14px 30px rgba(22,64,104,.40);}'
    + '#dirPromo .dirp-cta svg{position:relative;z-index:1;width:17px;height:17px;}'
    + '#dirPromo .dirp-cta span{position:relative;z-index:1;}'
    + '#dirPromo .dirp-row{display:flex;align-items:center;justify-content:center;gap:6px;flex-wrap:wrap;}'
    + '#dirPromo .dirp-ghost{background:none;border:0;color:#5A6270;font-size:13px;'
    + 'font-weight:600;cursor:pointer;padding:8px 10px;border-radius:8px;font-family:inherit;'
    + 'text-decoration:none;}'
    + '#dirPromo .dirp-ghost:hover{color:#0A2844;}'
    + '#dirPromo .dirp-sep{width:4px;height:4px;border-radius:50%;background:#C8D2DE;}'
    + '#dirPromo .dirp-close{position:absolute;top:14px;right:14px;width:34px;height:34px;z-index:2;'
    + 'display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.14);'
    + 'border:1px solid rgba(255,255,255,.24);border-radius:50%;cursor:pointer;color:#fff;'
    + 'transition:background .18s,color .18s;}'
    + '#dirPromo .dirp-close:hover{background:rgba(255,255,255,.26);}'
    + '#dirPromo .dirp-close svg{width:18px;height:18px;}'
    + '#dirPromo .dirp-dismiss{text-align:center;margin:8px 0 0;}'
    + '#dirPromo .dirp-dismiss button{background:none;border:0;color:#9aa1ac;font-size:11.5px;'
    + 'cursor:pointer;text-decoration:underline;font-family:inherit;padding:4px;}'
    + '#dirPromo .dirp-dismiss button:hover{color:#5A6270;}'
    + '#dirPromo .dirp-close:focus-visible,#dirPromo .dirp-ghost:focus-visible,'
    + '#dirPromo .dirp-dismiss button:focus-visible{outline:2px solid #164068;outline-offset:2px;border-radius:8px;}'
    + '#dirPromo .dirp-close:focus-visible{outline-color:#fff;}'
    + '#dirPromo .dirp-cta:focus-visible{outline:2px solid #fff;outline-offset:-4px;box-shadow:0 0 0 3px #2A5A85;}'
    + '@media (max-width:520px){#dirPromo{padding:14px;}#dirPromo .dirp-head{padding:22px 20px 20px;}'
    + '#dirPromo .dirp-body{padding:18px 20px 20px;}#dirPromo h2{font-size:21px;padding-right:30px;}'
    + '#dirPromo .dirp-info li{font-size:13px;}}'
    + '@media (prefers-reduced-motion:reduce){#dirPromo .dirp-backdrop,#dirPromo .dirp-card{transition:none;}'
    + '#dirPromo .dirp-card{transform:none;}#dirPromo .dirp-live-dot{animation:none;}'
    + '#dirPromo .dirp-cta::after{animation:none;display:none;}#dirPromo .dirp-cta:hover{transform:none;}}';

  // --- Markup -----------------------------------------------------------
  // Solo stringhe costanti: i testi che dipendono dalla data e dallo stato
  // si scrivono dopo, con textContent.
  var iconLive = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.9 19.1a10 10 0 0 1 0-14.2"></path>'
    + '<path d="M7.8 16.2a6 6 0 0 1 0-8.4"></path><circle cx="12" cy="12" r="2"></circle>'
    + '<path d="M16.2 7.8a6 6 0 0 1 0 8.4"></path><path d="M19.1 4.9a10 10 0 0 1 0 14.2"></path></svg>';
  var iconCal = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"></rect>'
    + '<line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line>'
    + '<line x1="3" y1="10" x2="21" y2="10"></line></svg>';
  var iconKey = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"></rect>'
    + '<path d="m22 7-10 6L2 7"></path></svg>';
  var iconArrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"></line>'
    + '<polyline points="12 5 19 12 12 19"></polyline></svg>';
  var iconX = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" '
    + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line>'
    + '<line x1="6" y1="6" x2="18" y2="18"></line></svg>';

  var html = ''
    + '<div class="dirp-backdrop" data-dirp-close aria-hidden="true"></div>'
    + '<div class="dirp-card" role="dialog" aria-modal="true" tabindex="-1" '
    + 'aria-labelledby="dirPromoTitle" aria-describedby="dirPromoDesc">'
    + '<button type="button" class="dirp-close" data-dirp-close aria-label="Chiudi">' + iconX + '</button>'
    + '<div class="dirp-head">'
    + '<span class="dirp-eyebrow">' + iconLive + '<span class="dirp-eyebrow-testo"></span></span>'
    + '<span class="dirp-live" hidden><span class="dirp-live-dot" aria-hidden="true"></span>IN DIRETTA</span>'
    + '<h2 id="dirPromoTitle"></h2>'
    + '<p class="dirp-sub" id="dirPromoDesc"></p>'
    + '</div>'
    + '<div class="dirp-body">'
    + '<ul class="dirp-info">'
    + '<li>' + iconCal + '<span class="dirp-quando"></span></li>'
    + '<li>' + iconKey + '<span>Gli <b>iscritti online</b> ricevono <b>via email nome utente e password</b> '
    + 'per entrare nella diretta. Non trovi l&rsquo;email? Guarda anche nella posta indesiderata.</span></li>'
    + '</ul>'
    + '<div class="dirp-actions">'
    + '<a class="dirp-cta" href=""><span>Accedi alla diretta</span>' + iconArrow + '</a>'
    + '<div class="dirp-row">'
    + '<a class="dirp-ghost dirp-programma" href="">Programma dell&rsquo;evento</a>'
    + '<span class="dirp-sep" aria-hidden="true"></span>'
    + '<button type="button" class="dirp-ghost" data-dirp-close>Chiudi</button>'
    + '</div>'
    + '</div>'
    + '<div class="dirp-dismiss"><button type="button" data-dirp-never>Non mostrare pi&ugrave;</button></div>'
    + '</div></div>';

  // --- Costruzione + comportamento --------------------------------------
  function build() {
    if (document.getElementById("dirPromo")) return;

    var style = document.createElement("style");
    style.id = "dirPromoStyle";
    style.textContent = css;
    document.head.appendChild(style);

    var root = document.createElement("div");
    root.id = "dirPromo";
    root.setAttribute("hidden", "");
    root.innerHTML = html;
    document.body.appendChild(root);

    var card = root.querySelector(".dirp-card");
    var lastFocus = null;
    var isClosing = false;
    var isOpen = false;

    // collegamenti dalla configurazione (setAttribute, mai HTML)
    root.querySelector(".dirp-cta").setAttribute("href", EVENTO.urlDiretta || "/diretta/");
    root.querySelector(".dirp-programma").setAttribute("href", (EVENTO.pagina || "/") + "#programma");
    root.querySelector(".dirp-eyebrow-testo").textContent = eyebrow;
    root.querySelector(".dirp-quando").textContent = quando;

    // I testi dipendono dalla fase (giorni prima / giorno dell'evento) e,
    // il giorno dell'evento, dallo stato letto dal servizio.
    function scriviTesti(dati) {
      var f = D.fase();
      var inOnda = f === "oggi" && !!(dati && dati.stato === "in_onda");
      var t = inOnda ? TESTI.inOnda : (f === "oggi" ? TESTI.oggi : TESTI.prima);
      root.querySelector("#dirPromoTitle").textContent = t.titolo;
      root.querySelector(".dirp-sub").textContent = t.sotto;
      root.querySelector(".dirp-live").hidden = !inOnda;
      root.querySelector(".dirp-eyebrow").hidden = inOnda;
      root.setAttribute("data-dirp-stato", inOnda ? "in_onda" : f);
    }
    scriviTesti(null);

    function focusables() {
      return Array.prototype.slice.call(
        card.querySelectorAll('a[href],button:not([disabled])')
      );
    }
    function open() {
      isOpen = true;
      lastFocus = document.activeElement;
      root.hidden = false;
      ss(false, SS_SEEN, "1");     // conta come "visto" in questa sessione
      // niente secondo popup nella stessa sessione: gli altri si ritirano
      for (var i = 0; i < SS_ALTRI.length; i++) ss(false, SS_ALTRI[i], "1");
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
      // fallback se transitionend non scatta (e con prefers-reduced-motion,
      // dove non c'e' nessuna transizione)
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
        // dal dialog stesso (focus iniziale) o da fuori si rientra nel giro
        if (f.indexOf(document.activeElement) === -1) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
        else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }

    root.addEventListener("click", function (e) {
      if (e.target.closest("[data-dirp-never]")) { never(); return; }
      if (e.target.closest("[data-dirp-close]")) { close(); return; }
    });
    // la CTA naviga normalmente (link reale): segna come visto e traccia il clic
    var cta = root.querySelector(".dirp-cta");
    if (cta) cta.addEventListener("click", function () {
      ss(false, SS_SEEN, "1");
      if (typeof window.gtag === "function") {
        window.gtag("event", "click_popup", { pagina: "Diretta Napoli" });
      }
    });

    // Il giorno dell'evento serve lo stato prima di aprire (il titolo cambia).
    // Negli altri giorni non si chiede niente: NGBDiretta non fa richieste
    // fuori dal giorno dell'evento, e qui non la si chiama nemmeno.
    var dati = null;
    var statoPronto = faseIniziale !== "oggi";
    var daAprire = false;
    function prova() {
      if (!daAprire || !statoPronto || isOpen || isClosing) return;
      daAprire = false;
      var f = D.fase();
      // la pagina e' rimasta aperta oltre la fine: il popup non serve piu'
      if (f !== "prima" && f !== "oggi") return;
      // diretta gia' terminata (prima dell'orario previsto): niente popup
      if (f === "oggi" && dati && dati.stato === "terminato") return;
      scriviTesti(dati);
      open();
    }
    if (!statoPronto) {
      D.leggi(function (d) {
        dati = d;
        statoPronto = true;
        // arrivato tardi, a popup gia' aperto: si aggiorna il testo
        if (isOpen && !isClosing && !(d && d.stato === "terminato")) scriviTesti(d);
        prova();
      });
    }

    // Apri solo a pagina completamente carica: l'entrata non compete con il
    // rendering iniziale (immagini, font) e la transizione resta fluida.
    function scheduleOpen() {
      setTimeout(function () {
        daAprire = true;
        prova();
        // se lo stato tarda, si apre comunque con il testo del giorno
        if (!statoPronto) setTimeout(function () { statoPronto = true; prova(); }, ATTESA_STATO_MS);
      }, SHOW_DELAY_MS);
    }
    if (document.readyState === "complete") scheduleOpen();
    else window.addEventListener("load", scheduleOpen, { once: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();
