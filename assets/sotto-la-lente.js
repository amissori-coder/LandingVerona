/*
 * "Sotto la lente": i due approfondimenti in evidenza della home, in testa
 * alla colonna Approfondimenti & Risorse (index.html, #sotto-la-lente).
 * Il testo e' nell'HTML: senza JavaScript i due approfondimenti stanno uno
 * sotto l'altro (titolo con il link alla pagina e riferimento). Questo
 * file aggiunge:
 * - a sinistra (sopra sul telefono e fra 901 e 1000 px) una pagina
 *   stilizzata di giornale, con i due approfondimenti in mezzo e una lente
 *   d'ingrandimento posata sul titolo di quello scelto. La lente e' vera:
 *   dentro il cerchio c'e' una seconda copia della pagina, a grandezza
 *   piena, spostata in modo che il punto sotto il centro della lente resti
 *   al centro. La pagina piccola e' la stessa copia ridotta, per cui le
 *   righe vanno a capo negli stessi punti e il testo ingrandito resta
 *   nitido. I titoli della pagina si leggono dal testo del riquadro.
 *   Pagina e lente sono decorative (aria-hidden); un clic sulla colonna
 *   sotto la lente apre l'approfondimento, un clic sull'altra ci porta la
 *   lente.
 * - le due voci accanto all'occhiello (role tablist, tab e tabpanel;
 *   frecce, Home e Fine), con il nome del bando e della sentenza: scegliere
 *   una voce porta la lente su quell'approfondimento e il titolo cambia
 *   con una dissolvenza. Nel giro automatico il titolo cambia a meta'
 *   scivolata, cosi' arriva insieme alla lente.
 * - un giro solo, quando il riquadro e' in vista e la pagina ha smesso di
 *   scorrere: la lente resta sul primo approfondimento qualche secondo,
 *   scivola sul secondo, resta, torna sul primo e si ferma per sempre. Il
 *   carosello degli ultimi approfondimenti, subito sotto, avanza da solo
 *   ogni 5 secondi (script.js): la lente scivola nella pausa fra due passi
 *   del carosello, mai insieme. Il giro si ferma per sempre anche alla
 *   scelta di una voce o di una colonna, al focus su un comando o su un
 *   link del riquadro, a un clic o a un tasto dentro il riquadro e, a giro
 *   partito, al primo tocco o alla rotellina (prima sono la pagina che
 *   scorre); con il riquadro fuori vista o la scheda del browser nascosta
 *   aspetta.
 *   Con "riduci movimento" la lente sta ferma: niente giro, le voci
 *   cambiano approfondimento senza animazione.
 */
(function () {
  "use strict";

  var sezione = document.getElementById("sotto-la-lente");
  if (!sezione || sezione.classList.contains("is-viva")) return;
  var elencoVoci = sezione.querySelector(".lente-voci");
  var voci = sezione.querySelectorAll(".lente-voci button[data-scheda]");
  if (!elencoVoci || voci.length < 2) return;
  var schede = [];
  for (var v = 0; v < voci.length; v++) {
    var scheda = document.getElementById(voci[v].getAttribute("data-scheda"));
    if (!scheda) return;
    schede.push(scheda);
  }

  var RIPOSO_MS = 5000;   // la lente resta ferma su un approfondimento almeno 5 s...
  var VOLO_MS = 1700;     // ...poi scivola sull'altro; un giro solo
  var CAMBIO_MS = 850;    // nel giro il testo cambia a meta' scivolata
  var ENTRATA_MS = 1250;  // la lente si posa sulla pagina la prima volta
  var QUIETE_MS = 400;    // si parte quando la pagina ha smesso di scorrere
  var SOGLIA = 0.5;       // in vista: almeno meta' della pagina con la lente
  var TUFFO = 0.3;        // a meta' scivolata la lente scende sulle righe, se c'e' posto (frazione del raggio)
  // il carosello degli ultimi approfondimenti (script.js) fa un passo ogni
  // PASSO_MS: la scivolata parte almeno DOPO_PASSO dopo la fine di un passo
  // e finisce almeno PRIMA_PASSO prima del successivo
  var PASSO_MS = 5000, DOPO_PASSO = 1200, PRIMA_PASSO = 900;
  var mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  var calmo = !!(mq && mq.matches);

  // --- La pagina: i titoli presi dal testo ------------------------------
  function testo(el) { return el ? el.textContent.replace(/[ \t\r\n]+/g, " ").trim() : ""; }
  function esc(t) { return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  // righe di testo della pagina, in percentuale della colonna (0 = stacco)
  var RIGHE = [
    [100, 96, 100, 91, 100, 62, 0, 100, 98, 100, 94, 100, 97, 71, 0, 100, 95, 100, 100, 88, 100, 54],
    [100, 94, 100, 100, 87, 49, 0, 100, 100, 95, 100, 98, 100, 83, 0, 100, 96, 100, 100, 91, 100, 66],
    [100, 100, 93, 100, 76, 0, 100, 97, 100, 100, 89, 100, 58, 0, 100, 94, 100, 97, 100, 81]
  ];
  // le ultime righe dell'articolo prima, sopra i titoli: tutti i titoli
  // della pagina stanno sulla stessa riga, a meta' altezza
  var SOPRA = [[100, 97, 64], [100, 100, 41], [100, 92, 78], [100, 99, 52]];
  function righe(l) {
    var h = "";
    for (var r = 0; r < l.length; r++) h += l[r] ? '<i style="width:' + l[r] + '%"></i>' : '<i class="lp-stacco"></i>';
    return h;
  }
  function colonna(s, n) {
    return '<div class="lp-art" data-indice="' + n + '">' + righe(SOPRA[n % 4]) + '<i class="lp-stacco"></i>'
      + '<i class="lp-occhio"></i>'
      + '<span class="lp-tit">' + esc(testo(s.querySelector(".lente-banda-titolo")).replace(/\u00a0/g, " ")) + '</span>'
      + righe(RIGHE[n % 2]) + '</div>';
  }
  // colonne senza titolo vero (barre al posto delle parole), tre per parte:
  // la pagina sembra un giornale e i due approfondimenti stanno in mezzo
  function altro(k) {
    return '<div class="lp-art lp-altro">' + righe(SOPRA[(k + 2) % 4]) + '<i class="lp-stacco"></i>'
      + '<i class="lp-occhio lp-occhio-grigio"></i>'
      + '<i class="lp-barra" style="width:' + (k % 2 ? 86 : 94) + '%"></i><i class="lp-barra" style="width:' + (k % 2 ? 58 : 71) + '%"></i>'
      + righe(RIGHE[k % 3]) + '</div>';
  }
  var pagina = '<div class="lente-pagina"><i class="lp-riga"></i><div class="lp-colonne">';
  for (var n = 0; n < 3; n++) pagina += altro(n);
  for (n = 0; n < schede.length; n++) pagina += colonna(schede[n], n);
  for (n = 3; n < 6; n++) pagina += altro(n);
  pagina += '</div></div>';

  // anello e manico (40 gradi, verso il basso a destra) in coordinate 0-100:
  // i tratti restano dello stesso spessore qualunque sia il diametro
  var MANICO_FINE = 73;     // raggio della punta del manico, in centesimi del diametro
  var MANICO_CAPO = 3;      // mezzo spessore della punta, in px
  var svgLente = '<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">'
    + '<line x1="87.84" y1="81.75" x2="93.66" y2="86.64" stroke="#164068" stroke-width="3.5" vector-effect="non-scaling-stroke"></line>'
    + '<line x1="93.66" y1="86.64" x2="105.92" y2="96.92" stroke="#0A2844" stroke-width="6" stroke-linecap="round" vector-effect="non-scaling-stroke"></line>'
    + '<circle cx="50" cy="50" r="49.1" fill="none" stroke="#0A2844" stroke-width="1.75" vector-effect="non-scaling-stroke"></circle>'
    + '</svg>';

  var scena = document.createElement("div");
  scena.className = "lente-scena";
  scena.setAttribute("aria-hidden", "true");
  scena.innerHTML = '<div class="lente-foglio">' + pagina + '</div>'
    + '<div class="lente-cerchio"><div class="lente-vetro"><div class="lente-copia">' + pagina + '</div></div>' + svgLente + '</div>';
  sezione.insertBefore(scena, sezione.firstChild);

  var foglio = scena.querySelector(".lente-foglio");
  var paginaPiccola = foglio.querySelector(".lente-pagina");
  var cerchio = scena.querySelector(".lente-cerchio");
  var copia = cerchio.querySelector(".lente-copia");
  var paginaGrande = copia.querySelector(".lente-pagina");
  var colonne = foglio.querySelectorAll(".lp-art[data-indice]");
  var colonneTutte = scena.querySelectorAll(".lp-art[data-indice]");

  // voci e testi diventano schede (tablist, tab e tabpanel); i testi hanno
  // un link, per cui non serve renderli raggiungibili con il tasto Tab
  elencoVoci.setAttribute("role", "tablist");
  elencoVoci.setAttribute("aria-label", "Approfondimenti in evidenza");
  for (var k = 0; k < schede.length; k++) {
    voci[k].setAttribute("role", "tab");
    voci[k].setAttribute("aria-controls", schede[k].id);
    schede[k].setAttribute("role", "tabpanel");
    schede[k].setAttribute("aria-labelledby", voci[k].id);
  }
  elencoVoci.hidden = false;
  sezione.classList.add("is-viva");

  // --- La lente -------------------------------------------------------
  var qui = 0, geo = null, stati = [], lim = null, cur = null, R = 46, M = 2;
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
  function numero(cs, nome, base) {
    var x = parseFloat(cs.getPropertyValue(nome));
    return isNaN(x) ? base : x;
  }
  // misura la pagina e trova, per ogni approfondimento, dove posare la
  // lente (centro del titolo) e di quanto spostare la pagina quando il
  // titolo e' troppo vicino al bordo
  function misura() {
    var cs = window.getComputedStyle(scena);
    M = numero(cs, "--m", 2);
    var bordo = numero(cs, "--bordo", 6);
    var bordoX = numero(cs, "--bordo-x", bordo);
    var D = cerchio.offsetWidth || 92;
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
    // ingombro del manico oltre il cerchio
    var punta = MANICO_FINE / 100 * D + MANICO_CAPO;
    var hx = Math.max(0, punta * 0.766 - R), hy = Math.max(0, punta * 0.643 - R);
    lim = { y0: R + bordo, y1: H - R - hy - bordo };
    stati = [];
    for (var i = 0; i < colonne.length; i++) {
      var t = ingombro(colonne[i].querySelector(".lp-tit")) || colonne[i].getBoundingClientRect();
      var cx = (t.left + t.right) / 2 - sr.left, cy = (t.top + t.bottom) / 2 - sr.top;
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
  // interrompe. "tuffo": a meta' strada la lente scende un poco sulle righe
  // della pagina, se sotto c'e' posto (la pagina non si muove). "posarsi":
  // solo rallentamento finale (la lente che si posa).
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
      if (tuffo && lim) q.ly += Math.max(0, Math.min(tuffo * Math.sin(Math.PI * e), lim.y1 - q.ly));
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
  function ferma() { fermo = true; clearTimeout(timer); timer = null; attesaPasso = false; }
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
    clearTimeout(timer); timer = null; attesaPasso = false;
    if (giri >= schede.length) fermo = true;
    if (fermo || calmo || !avviato || !attivo() || volo || entrataTimer) return;
    timer = setTimeout(scivola, RIPOSO_MS);
  }
  // riposo finito: la lente scivola appena il carosello lascia una pausa
  function scivola() {
    clearTimeout(timer); timer = null; attesaPasso = false;
    if (fermo || calmo || !attivo() || volo) return;
    var w = attesaCarosello();
    if (w > 0) { timer = setTimeout(scivola, w); return; }
    if (w < 0) {
      // aspetta la fine del prossimo passo; se il carosello si e' fermato
      // nel frattempo, si riprova comunque
      attesaPasso = true;
      timer = setTimeout(scivola, PASSO_MS + 1600);
      return;
    }
    giri++;
    vai((qui + 1) % schede.length, false);
  }

  // --- Il carosello sotto il riquadro --------------------------------
  // un passo del carosello si riconosce dallo scorrimento della lista; il
  // carosello parte con la pagina, come se un passo fosse appena finito
  var lista = document.getElementById("contentsGrid");
  var passoInizio = performance.now(), passoFine = passoInizio, passoInCorso = false, passoTimer = null;
  var attesaPasso = false;
  if (lista) {
    lista.addEventListener("scroll", function () {
      if (!passoInCorso) { passoInCorso = true; passoInizio = performance.now(); }
      clearTimeout(passoTimer);
      passoTimer = setTimeout(function () {
        passoInCorso = false;
        passoFine = performance.now();
        if (attesaPasso) scivola();
      }, 160);
    }, { passive: true });
  }
  // fra quanti ms la lente puo' partire senza incrociare un passo del
  // carosello: 0 subito, -1 dopo il prossimo passo. Parte a meta' della
  // pausa fra due passi, o subito se la meta' e' passata ma c'e' ancora
  // tempo per arrivare prima del passo seguente
  function attesaCarosello() {
    if (!lista) return 0;
    if (passoInCorso) return -1;
    var ora = performance.now();
    // nessun passo da piu' di un intervallo: il carosello e' fermo
    if (ora - passoInizio > PASSO_MS + 1500) return 0;
    var prossimo = passoInizio + PASSO_MS;
    var primo = passoFine + DOPO_PASSO, ultimo = prossimo - PRIMA_PASSO - VOLO_MS;
    if (ora > ultimo || primo > ultimo) return -1;
    var meta = Math.min(ultimo, Math.max(primo, (passoFine + prossimo - VOLO_MS) / 2));
    return ora < meta ? Math.ceil(meta - ora) : 0;
  }
  function sospendi() {
    clearTimeout(timer); timer = null; attesaPasso = false;
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
    posa({ lx: a.lx + 10, ly: a.ly + 5, sx: a.sx, sy: a.sy });
    entrataTimer = setTimeout(function () {
      entrataTimer = null;
      pronta();
      if (!attivo()) { posa(stati[qui]); return; }
      vola(qui, ENTRATA_MS, 0, true, programma);
    }, 120);
  }
  // si parte con il riquadro in vista e la pagina ferma da QUIETE_MS
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

  // --- Avvio ------------------------------------------------------------
  segnaQui();
  misura();
  posa(stati[qui]);
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
  // un clic sulla colonna sotto la lente apre l'approfondimento (come il
  // titolo); un clic sull'altra colonna ci porta la lente
  scena.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest(".lp-art[data-indice]");
    if (!a) return;
    var j = +a.getAttribute("data-indice");
    if (j !== qui || volo) { vai(j, true); return; }
    var link = schede[j].querySelector(".lente-banda-titolo a");
    if (!link) return;
    statistica(link);
    if (e.ctrlKey || e.metaKey || e.shiftKey) window.open(link.href, "_blank", "noopener");
    else window.location.assign(link.href);
  });
  // qualunque gesto dentro il riquadro ferma il giro per sempre. Tocchi e
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
  // nuove misure: finestra ridimensionata, caratteri caricati, riquadro che
  // cambia misura
  var misuraProssima = 0;
  function piuTardi() {
    if (misuraProssima) return;
    misuraProssima = requestAnimationFrame(function () {
      misuraProssima = 0;
      rimisura();
    });
  }
  if ("ResizeObserver" in window) new ResizeObserver(piuTardi).observe(scena);
  window.addEventListener("resize", piuTardi);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(piuTardi);

  // il titolo dell'approfondimento, per le statistiche
  function statistica(a) {
    if (typeof window.gtag === "function") {
      window.gtag("event", "click_sotto_la_lente", { destinazione: a.getAttribute("href") });
    }
  }
  sezione.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest(".lente-banda-titolo a");
    if (a) statistica(a);
  });
})();
