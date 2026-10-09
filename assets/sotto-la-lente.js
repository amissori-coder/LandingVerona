/*
 * "Sotto la lente": i due approfondimenti in evidenza della home.
 * Il testo e' nell'HTML della pagina (index.html, sezione #sotto-la-lente):
 * senza JavaScript i due approfondimenti stanno uno dopo l'altro. Questo
 * file aggiunge:
 * - a sinistra (sopra, sotto i 900 px) una pagina stilizzata di
 *   approfondimenti, una colonna per ciascuno, con una lente
 *   d'ingrandimento posata sul titolo di quello scelto. La lente e' vera:
 *   dentro il cerchio c'e' una seconda copia della pagina, a grandezza
 *   piena, spostata in modo che il punto sotto il centro della lente resti
 *   al centro. La pagina piccola e' la stessa copia ridotta, per cui le
 *   righe vanno a capo negli stessi punti e il testo ingrandito resta
 *   nitido. Occhiello, titolo e cifre della pagina si leggono dal testo
 *   della sezione. Pagina e lente sono decorative (aria-hidden).
 * - le due voci sopra il testo (role tablist, tab e tabpanel; frecce,
 *   Home e Fine): scegliere una voce, o una colonna della pagina, porta la
 *   lente su quell'approfondimento e il testo cambia con una dissolvenza.
 *   Nel giro automatico il testo cambia a meta' scivolata, cosi' arriva
 *   insieme alla lente.
 * - un giro solo, quando la sezione e' in vista e la pagina ha smesso di
 *   scorrere: la lente resta sul primo approfondimento sei secondi e mezzo,
 *   scivola sul secondo (passando sulle righe del testo, non sul bianco fra
 *   le colonne), resta, torna sul primo e si ferma per sempre. Si ferma per
 *   sempre anche alla scelta di una voce o di una colonna, al focus su un
 *   comando della sezione, a un clic o a un tasto dentro la sezione e, a
 *   giro partito, al primo tocco o alla rotellina (prima sono la pagina che
 *   scorre); con la sezione fuori vista o la scheda del browser nascosta
 *   aspetta.
 *   Con "riduci movimento" la lente sta ferma: niente giro, le voci
 *   cambiano approfondimento senza animazione.
 * - testo giustificato senza buchi: le due sintesi sono a sinistra per
 *   difetto; si giustificano tutte e due solo se in nessuna uno spazio fra
 *   due parole arriva quasi al doppio del normale (1,8 volte).
 */
(function () {
  "use strict";

  var sezione = document.getElementById("sotto-la-lente");
  if (!sezione || sezione.classList.contains("is-viva")) return;
  var corpoSezione = sezione.querySelector(".lente-corpo");
  var elencoVoci = sezione.querySelector(".lente-voci");
  var voci = sezione.querySelectorAll('.lente-voci [role="tab"]');
  if (!corpoSezione || !elencoVoci || voci.length < 2) return;
  var schede = [];
  for (var v = 0; v < voci.length; v++) {
    var scheda = document.getElementById(voci[v].getAttribute("aria-controls"));
    if (!scheda) return;
    schede.push(scheda);
  }

  var RIPOSO_MS = 6500;   // la lente resta ferma su un approfondimento...
  var VOLO_MS = 1700;     // ...poi scivola sull'altro; un giro solo
  var CAMBIO_MS = 850;    // nel giro il testo cambia a meta' scivolata
  var ENTRATA_MS = 1250;  // la lente si posa sulla pagina la prima volta
  var QUIETE_MS = 400;    // si parte quando la pagina ha smesso di scorrere
  var SOGLIA = 0.5;       // in vista: almeno meta' della pagina con la lente
  var TUFFO = 0.45;       // a meta' scivolata la lente scende sulle righe (frazione del raggio)
  var mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  var calmo = !!(mq && mq.matches);

  // --- La pagina: occhiello, titolo e cifre presi dal testo -------------
  function testo(el) { return el ? el.textContent.replace(/[ \t\r\n]+/g, " ").trim() : ""; }
  function esc(t) { return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  // righe di testo della pagina, in percentuale della colonna (0 = stacco):
  // prima delle cifre un capoverso lungo, cosi' a riposo anello e manico non
  // tagliano i numeri; dopo, abbastanza righe da riempire la pagina
  var RIGHE = [
    [[100, 96, 100, 91, 100, 62, 0, 100, 98, 100, 94, 100, 97, 71],
      [100, 95, 100, 100, 88, 100, 54, 0, 100, 97, 100, 93, 100, 78, 0, 100, 100, 96, 100, 92, 100, 67,
        0, 100, 94, 100, 98, 100, 83, 0, 100, 97, 100, 91, 100, 58, 0, 100, 96, 100, 100, 87, 70]],
    [[100, 94, 100, 100, 87, 49, 0, 100, 100, 95, 100, 98, 100, 83],
      [100, 96, 100, 100, 91, 100, 66, 0, 100, 100, 94, 100, 97, 100, 72, 0, 100, 95, 100, 100, 89, 61,
        0, 100, 98, 100, 93, 100, 76, 0, 100, 100, 92, 100, 96, 64, 0, 100, 94, 100, 97, 100, 81]]
  ];
  function righe(l) {
    var h = "";
    for (var r = 0; r < l.length; r++) h += l[r] ? '<i style="width:' + l[r] + '%"></i>' : '<i class="lp-stacco"></i>';
    return h;
  }
  function colonna(s, n) {
    var cifre = "", bs = s.querySelectorAll(".lente-cifre b");
    for (var c = 0; c < bs.length; c++) cifre += '<span><b>' + esc(testo(bs[c])) + '</b><i></i></span>';
    return '<div class="lp-art" data-indice="' + n + '">'
      + '<span class="lp-occ">' + esc(testo(s.querySelector(".lente-occhiello"))) + '</span>'
      + '<span class="lp-tit">' + esc(testo(s.querySelector("h3"))) + '</span>'
      + righe(RIGHE[n % 2][0])
      + '<span class="lp-cifre">' + cifre + '</span>'
      + righe(RIGHE[n % 2][1]) + '</div>';
  }
  var pagina = '<div class="lente-pagina">'
    + '<span class="lp-testa"><span>Next Generation Business</span><span>2026</span></span>'
    + '<span class="lp-capo">Approfondimenti</span><i class="lp-riga"></i><div class="lp-colonne">';
  for (var n = 0; n < schede.length; n++) pagina += colonna(schede[n], n);
  pagina += '</div></div>';

  // anello e manico (40 gradi, verso il basso a destra) in coordinate 0-100:
  // il tratto resta di 2 px qualunque sia il diametro
  var MANICO_FINE = 73;     // raggio della punta del manico, in centesimi del diametro
  var MANICO_CAPO = 4.5;    // mezzo spessore della punta, in px
  var svgLente = '<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">'
    + '<line x1="87.84" y1="81.75" x2="93.66" y2="86.64" stroke="#164068" stroke-width="5" vector-effect="non-scaling-stroke"></line>'
    + '<line x1="93.66" y1="86.64" x2="105.92" y2="96.92" stroke="#0A2844" stroke-width="9" stroke-linecap="round" vector-effect="non-scaling-stroke"></line>'
    + '<circle cx="50" cy="50" r="49.4" fill="none" stroke="#0A2844" stroke-width="2" vector-effect="non-scaling-stroke"></circle>'
    + '</svg>';

  var scena = document.createElement("div");
  scena.className = "lente-scena";
  scena.setAttribute("aria-hidden", "true");
  scena.innerHTML = '<div class="lente-foglio">' + pagina + '</div>'
    + '<div class="lente-cerchio"><div class="lente-vetro"><div class="lente-copia">' + pagina + '</div></div>' + svgLente + '</div>';
  corpoSezione.insertBefore(scena, corpoSezione.firstChild);

  var foglio = scena.querySelector(".lente-foglio");
  var paginaPiccola = foglio.querySelector(".lente-pagina");
  var cerchio = scena.querySelector(".lente-cerchio");
  var copia = cerchio.querySelector(".lente-copia");
  var paginaGrande = copia.querySelector(".lente-pagina");
  var colonne = foglio.querySelectorAll(".lp-art");
  var colonneTutte = scena.querySelectorAll(".lp-art");

  // voci e testi diventano schede (tab e tabpanel)
  for (var k = 0; k < schede.length; k++) {
    schede[k].setAttribute("role", "tabpanel");
    schede[k].setAttribute("aria-labelledby", voci[k].id);
    schede[k].setAttribute("tabindex", "0");
  }
  elencoVoci.hidden = false;
  sezione.classList.add("is-viva");

  // --- La lente -------------------------------------------------------
  var qui = 0, geo = null, stati = [], lim = null, cur = null, R = 90, M = 2;
  var raf = 0, volo = null, timer = null, entrataTimer = null, quieteTimer = null, cambioTimer = null;
  var fermo = false, giri = 0, avviato = false, inVista = false;

  function limita(x, a, b) { return a > b ? (a + b) / 2 : Math.min(b, Math.max(a, x)); }
  // ingombro del testo (non del riquadro, che arriva al limite di larghezza)
  function ingombro(nodo) {
    var r = null;
    if (!nodo) return null;
    try { var rg = document.createRange(); rg.selectNodeContents(nodo); r = rg.getBoundingClientRect(); }
    catch (e) { r = null; }
    if (!r || !r.width) r = nodo.getBoundingClientRect();
    return (r.width && r.height) ? r : null;
  }
  // misura la pagina e trova, per ogni approfondimento, dove posare la
  // lente (centro di occhiello e titolo) e di quanto spostare la pagina
  // quando il titolo e' troppo vicino al bordo della scena
  function misura() {
    var cs = window.getComputedStyle(scena);
    M = parseFloat(cs.getPropertyValue("--m")) || 2;
    // distanza minima dal bordo della scena, in verticale e in orizzontale
    var bordo = parseFloat(cs.getPropertyValue("--bordo"));
    if (isNaN(bordo)) bordo = 10;
    var bordoX = parseFloat(cs.getPropertyValue("--bordo-x"));
    if (isNaN(bordoX)) bordoX = bordo;
    var D = cerchio.offsetWidth || 180;
    R = D / 2;
    foglio.style.transform = "";
    var W = scena.clientWidth, H = scena.clientHeight;
    var largo = foglio.clientWidth * M; // la pagina a grandezza piena
    paginaPiccola.style.width = largo + "px";
    paginaPiccola.style.transform = "scale(" + (1 / M) + ")";
    paginaGrande.style.width = largo + "px";
    // nessun antenato e' scalato: le differenze fra rettangoli bastano
    var sr = scena.getBoundingClientRect(), fr = foglio.getBoundingClientRect();
    geo = { fx: fr.left - sr.left, fy: fr.top - sr.top, fw: fr.width, fh: fr.height };
    copia.style.width = geo.fw * M + "px";
    copia.style.height = geo.fh * M + "px";
    copia.style.borderWidth = M + "px";
    // ingombro del manico oltre il cerchio
    var punta = MANICO_FINE / 100 * D + MANICO_CAPO;
    var hx = Math.max(0, punta * 0.766 - R), hy = Math.max(0, punta * 0.643 - R);
    lim = { y0: R + bordo, y1: H - R - hy - bordo };
    stati = [];
    for (var i = 0; i < colonne.length; i++) {
      var a = colonne[i];
      var t = ingombro(a.querySelector(".lp-tit")) || a.getBoundingClientRect();
      // l'occhiello conta solo se si vede (sul telefono la pagina non lo ha)
      var o = ingombro(a.querySelector(".lp-occ")) || t;
      var x0 = Math.min(t.left, o.left), x1 = Math.max(t.right, o.right), y0 = Math.min(t.top, o.top), y1 = t.bottom;
      var cx = (x0 + x1) / 2 - sr.left, cy = (y0 + y1) / 2 - sr.top;
      var lx = limita(cx, R + bordoX, W - R - hx - bordoX), ly = limita(cy, lim.y0, lim.y1);
      stati.push({ lx: lx, ly: ly, sx: lx - cx, sy: ly - cy });
    }
  }
  // posa la lente nel punto (lx, ly) della scena, con la pagina spostata di (sx, sy)
  function posa(p) {
    cur = p;
    if (!geo || !p) return;
    cerchio.style.transform = "translate(" + (p.lx - R).toFixed(2) + "px," + (p.ly - R).toFixed(2) + "px)";
    foglio.style.transform = (Math.abs(p.sx) > 0.01 || Math.abs(p.sy) > 0.01)
      ? "translate(" + p.sx.toFixed(2) + "px," + p.sy.toFixed(2) + "px)" : "";
    copia.style.transform = "translate(" + (R + (geo.fx + p.sx - p.lx) * M).toFixed(2) + "px,"
      + (R + (geo.fy + p.sy - p.ly) * M).toFixed(2) + "px)";
  }
  function pronta() { cerchio.classList.add("is-pronta"); }
  function fermaVolo(arriva) {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    var x = volo; volo = null;
    if (arriva && x && stati[x.j]) posa(stati[x.j]);
  }
  // scivolata calma da cur a stati[j], lenta all'inizio e alla fine; il
  // punto d'arrivo si rilegge a ogni passo, cosi' una nuova misura non la
  // interrompe. "tuffo": a meta' strada il punto sotto la lente scende sulla
  // pagina, cosi' la lente passa sulle righe e non sul bianco fra le
  // colonne; scende la lente finche' c'e' posto, poi sale la pagina.
  // "posarsi": solo rallentamento finale (la lente che si posa).
  function vola(j, dur, tuffo, posarsi, fine) {
    fermaVolo(false);
    var a0 = stati[j];
    if (!a0) return;
    var da = cur || a0, t0 = null, x = { j: j };
    volo = x;
    function passo(t) {
      if (volo !== x) return;
      var a = stati[j] || a0;
      if (t0 === null) t0 = t;
      var p = Math.min(1, (t - t0) / dur);
      var e = posarsi ? 1 - Math.pow(1 - p, 3) : 0.5 - 0.5 * Math.cos(Math.PI * p);
      var q = {
        lx: da.lx + (a.lx - da.lx) * e,
        ly: da.ly + (a.ly - da.ly) * e,
        sx: da.sx + (a.sx - da.sx) * e,
        sy: da.sy + (a.sy - da.sy) * e
      };
      if (tuffo && lim) {
        var d = tuffo * Math.sin(Math.PI * e);
        var giu = Math.max(0, Math.min(d, lim.y1 - q.ly));
        q.ly += giu;
        q.sy -= d - giu;
      }
      posa(q);
      if (p < 1) { raf = requestAnimationFrame(passo); return; }
      raf = 0; volo = null;
      if (fine) fine();
    }
    raf = requestAnimationFrame(passo);
  }

  // --- Quale approfondimento ------------------------------------------
  function segnaQui() {
    var i;
    for (i = 0; i < voci.length; i++) {
      voci[i].setAttribute("aria-selected", i === qui ? "true" : "false");
      voci[i].setAttribute("tabindex", i === qui ? "0" : "-1");
    }
    for (i = 0; i < schede.length; i++) schede[i].classList.toggle("is-qui", i === qui);
    for (i = 0; i < colonneTutte.length; i++) {
      colonneTutte[i].classList.toggle("is-qui", +colonneTutte[i].getAttribute("data-indice") === qui);
    }
  }
  // mostra subito l'approfondimento scelto (voci, testo, colonna)
  function mostra() { clearTimeout(cambioTimer); cambioTimer = null; segnaQui(); }
  function attivo() { return inVista && !document.hidden; }
  // basta giro: chi tocca, clicca, scorre o sceglie sta leggendo
  function ferma() { fermo = true; clearTimeout(timer); timer = null; }
  function vai(j, aMano) {
    if (j < 0 || j >= schede.length) return;
    if (aMano) ferma();
    if (j === qui && (!volo || volo.j === j)) { if (cambioTimer) mostra(); return; }
    qui = j;
    if (!stati[j]) { mostra(); return; }
    // lente non ancora comparsa, ferma o fuori vista: subito al suo posto
    if (calmo || !avviato || !attivo() || entrataTimer) {
      avviato = true;
      clearTimeout(entrataTimer); entrataTimer = null;
      mostra();
      fermaVolo(false); posa(stati[j]); pronta();
      return;
    }
    // scelta a mano: il testo cambia subito; nel giro, a meta' scivolata
    if (aMano) mostra();
    else { clearTimeout(cambioTimer); cambioTimer = setTimeout(mostra, CAMBIO_MS); }
    vola(j, VOLO_MS, R * TUFFO, false, programma);
  }
  // la prossima scivolata; un giro solo (dal primo all'ultimo e di nuovo
  // al primo), poi la lente resta
  function programma() {
    clearTimeout(timer); timer = null;
    if (giri >= schede.length) fermo = true;
    if (fermo || calmo || !avviato || !attivo() || volo || entrataTimer) return;
    timer = setTimeout(function () {
      timer = null;
      if (fermo || !attivo()) return;
      giri++;
      vai((qui + 1) % schede.length, false);
    }, RIPOSO_MS);
  }
  function sospendi() {
    clearTimeout(timer); timer = null;
    if (entrataTimer) { clearTimeout(entrataTimer); entrataTimer = null; pronta(); }
    fermaVolo(true);
    if (cambioTimer) mostra();
  }
  // la prima volta in vista la lente si posa sulla pagina: arriva da poco
  // piu' in basso a destra
  function entrata() {
    avviato = true;
    var a = stati[qui];
    if (!a) { pronta(); return; }
    if (calmo) { posa(a); pronta(); return; }
    posa({ lx: a.lx + 14, ly: a.ly + 10, sx: a.sx, sy: a.sy });
    entrataTimer = setTimeout(function () {
      entrataTimer = null;
      pronta();
      if (!attivo()) { posa(stati[qui]); return; }
      vola(qui, ENTRATA_MS, 0, true, programma);
    }, 120);
  }
  // si parte con la sezione in vista e la pagina ferma da QUIETE_MS
  function aspettaQuiete() {
    if (avviato || !attivo()) return;
    clearTimeout(quieteTimer);
    quieteTimer = setTimeout(function () {
      quieteTimer = null;
      if (!avviato && attivo()) entrata();
    }, QUIETE_MS);
  }
  function rimisura() {
    misura();
    if (!stati[qui]) return;
    if (!volo && !entrataTimer) posa(stati[qui]); // in volo: il passo successivo usa la nuova misura
  }

  // --- Testo giustificato senza buchi ---------------------------------
  // Le sintesi sono a sinistra per difetto (anche senza JavaScript). Qui si
  // prova a giustificarle (.is-giustificato sulla colonna dei testi) e si
  // misura ogni spazio fra due parole: se in una delle due uno arriva a 1,8
  // volte uno spazio normale (stesso carattere, senza giustificare), tutte
  // e due tornano a sinistra. Una scelta sola per le due, cosi' al cambio
  // di approfondimento il testo non cambia aspetto.
  var pannelli = sezione.querySelector(".lente-pannelli");
  var tela = null;
  function larghezzaSpazio(el) {
    try {
      tela = tela || document.createElement("canvas").getContext("2d");
      var cs = window.getComputedStyle(el);
      tela.font = cs.fontStyle + " " + cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily;
      return tela.measureText(" ").width;
    } catch (e) { return 0; }
  }
  function controllaGiustificato() {
    if (!pannelli) return;
    var paragrafi = pannelli.querySelectorAll(".lente-sintesi");
    var bene = paragrafi.length > 0;
    pannelli.classList.add("is-giustificato");
    for (var i = 0; i < paragrafi.length && bene; i++) {
      var p = paragrafi[i];
      // colonna stretta: il CSS li tiene comunque a sinistra
      if (window.getComputedStyle(p).textAlign !== "justify") { bene = false; break; }
      var normale = larghezzaSpazio(p), massimo = 0;
      if (!normale) { bene = false; break; }
      var giro = document.createTreeWalker(p, NodeFilter.SHOW_TEXT, null, false), nodo;
      var rg = document.createRange();
      while ((nodo = giro.nextNode())) {
        var t = nodo.nodeValue;
        for (var c = 0; c < t.length; c++) {
          if (t.charAt(c) !== " ") continue;
          rg.setStart(nodo, c); rg.setEnd(nodo, c + 1);
          var r = rg.getBoundingClientRect();
          if (r.width > massimo) massimo = r.width;
        }
      }
      if (massimo > normale * 1.8) bene = false;
    }
    if (!bene) pannelli.classList.remove("is-giustificato");
  }

  // --- Avvio ------------------------------------------------------------
  segnaQui();
  misura();
  posa(stati[qui]);
  controllaGiustificato();
  if (calmo || !("IntersectionObserver" in window)) {
    // niente giro: la lente sta sull'approfondimento scelto
    avviato = true; fermo = true; pronta();
  } else {
    new IntersectionObserver(function (voce) {
      var e = voce[voce.length - 1];
      inVista = e.isIntersecting && e.intersectionRatio >= SOGLIA;
      if (!avviato) { if (inVista) aspettaQuiete(); else clearTimeout(quieteTimer); return; }
      if (inVista) programma(); else sospendi();
    }, { threshold: [0, SOGLIA, 1] }).observe(scena);
    window.addEventListener("scroll", function () { if (!avviato && quieteTimer) aspettaQuiete(); }, { passive: true });
  }

  // voci: clic, frecce, Home e Fine (la voce raggiunta si sceglie subito)
  function indiceVoce(b) {
    for (var i = 0; i < voci.length; i++) if (voci[i] === b) return i;
    return -1;
  }
  elencoVoci.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest('[role="tab"]');
    if (b) vai(indiceVoce(b), true);
  });
  elencoVoci.addEventListener("keydown", function (e) {
    var j = indiceVoce(e.target), z = voci.length, nuovo = -1;
    if (j < 0) return;
    if (e.key === "ArrowRight" || e.key === "Right") nuovo = (j + 1) % z;
    else if (e.key === "ArrowLeft" || e.key === "Left") nuovo = (j + z - 1) % z;
    else if (e.key === "Home") nuovo = 0;
    else if (e.key === "End") nuovo = z - 1;
    if (nuovo < 0) return;
    e.preventDefault();
    voci[nuovo].focus();
    vai(nuovo, true);
  });
  // un clic su una colonna della pagina ci porta la lente
  scena.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest(".lp-art");
    if (a) vai(+a.getAttribute("data-indice"), true);
  });
  // qualunque gesto dentro la sezione ferma il giro per sempre. Tocchi e
  // rotellina contano solo a giro partito: prima sono la pagina che scorre
  function gesto(e) {
    if (avviato || e.type === "keydown" || (e.type === "pointerdown" && e.pointerType !== "touch")) ferma();
  }
  ["pointerdown", "touchstart", "wheel", "keydown"].forEach(function (tipo) {
    sezione.addEventListener(tipo, gesto, { passive: true });
  });
  sezione.addEventListener("focusin", ferma);
  // scheda del browser nascosta: tutto fermo; di nuovo visibile: si riparte
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { sospendi(); clearTimeout(quieteTimer); }
    else if (!avviato) aspettaQuiete();
    else programma();
  });
  if (mq) {
    var cambia = function () {
      calmo = mq.matches;
      if (calmo) { ferma(); sospendi(); avviato = true; posa(stati[qui]); pronta(); }
    };
    if (mq.addEventListener) mq.addEventListener("change", cambia); else if (mq.addListener) mq.addListener(cambia);
  }
  // nuove misure: finestra ridimensionata, caratteri caricati, colonna del
  // testo che cambia altezza
  var misuraProssima = 0;
  function piuTardi() {
    if (misuraProssima) return;
    misuraProssima = requestAnimationFrame(function () {
      misuraProssima = 0;
      rimisura();
      controllaGiustificato();
    });
  }
  if ("ResizeObserver" in window) new ResizeObserver(piuTardi).observe(scena);
  window.addEventListener("resize", piuTardi);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(piuTardi);

  // l'invito all'approfondimento, per le statistiche
  sezione.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest(".lente-cta");
    if (a && typeof window.gtag === "function") {
      window.gtag("event", "click_sotto_la_lente", { destinazione: a.getAttribute("href") });
    }
  });
})();
