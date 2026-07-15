/* ============================================================
   AI Governance: motore della torre di controllo.
   Un solo stato, un solo verso: risposte -> viste derivate.
   Nessuna dipendenza esterna. I dati stanno in data.js.
   ============================================================ */
(function () {
    'use strict';

    var D = window.AIG_DATA;
    if (!D) return;

    var RM = window.matchMedia('(prefers-reduced-motion: reduce)');
    var CHIAVE = 'aig-v1';

    /* ---------- Costanti dichiarative ---------- */

    // Soglia di riferimento dichiarata nel metodo: sopra questo livello
    // l'asse si considera presidiato in modo strutturato.
    var SOGLIA_PRESIDIO = 67;

    // Punteggio massimo per asse (3 domande da 0 a 3 punti).
    var MAX_ASSE = 9;
    var MAX_TOTALE = 45;

    var RUOLI = {
        cfo: { label: 'CFO e direzione finanziaria', taglio: 'il rapporto tra investimento in AI e solidità dei presidi' },
        amministratore: { label: 'Amministratore', taglio: 'l\'adeguatezza degli assetti e i flussi verso il consiglio' },
        sindaco: { label: 'Sindaco o revisore', taglio: 'la verificabilità delle evidenze e l\'assurance sui presidi' },
        it: { label: 'IT, Risk e Compliance', taglio: 'il ciclo di vita dei sistemi e i controlli operativi' }
    };

    // Le fasce sono allineate alla soglia di presidio: 6 punti su 9 valgono 67 su 100,
    // cioè esattamente la soglia, quindi 6 sta nella fascia alta. Altrimenti il
    // commento direbbe "applicazione disomogenea" e "sopra la soglia" nella stessa frase.
    var FASCE_ASSE = [
        { max: 3, nota: 'presidio ancora da costruire' },
        { max: 5, nota: 'cornice presente, applicazione disomogenea' },
        { max: 9, nota: 'presidio strutturato' }
    ];

    /* ---------- Stato: unico punto di verità ---------- */

    var STATO = {
        ruolo: null,
        risposte: new Array(D.domande.length).fill(null),
        asseCorrente: 0,
        famiglia: null,
        hub: 'centro',
        aiactStack: [],
        aiactEsito: null,
        soglia: false,
        commentati: {}
    };

    /* ---------- Utility ---------- */

    function $(sel, ctx) { return (ctx || document).querySelector(sel); }
    function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

    function esc(s) {
        return String(s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

    // Accordo del numero: "1 punto" e non "1 punti".
    function plur(n, singolare, plurale) { return n + ' ' + (n === 1 ? singolare : plurale); }

    function salva() {
        try {
            sessionStorage.setItem(CHIAVE, JSON.stringify({
                ruolo: STATO.ruolo,
                risposte: STATO.risposte,
                aiactEsito: STATO.aiactEsito,
                aiactStack: STATO.aiactStack
            }));
        } catch (e) { /* Safari privato: si prosegue senza persistenza */ }
    }

    function ripristina() {
        try {
            var raw = sessionStorage.getItem(CHIAVE);
            if (!raw) return;
            var s = JSON.parse(raw);
            if (s && Array.isArray(s.risposte) && s.risposte.length === D.domande.length) {
                STATO.risposte = s.risposte;
            }
            if (s && s.ruolo && RUOLI[s.ruolo]) STATO.ruolo = s.ruolo;
            if (s && Array.isArray(s.aiactStack)) STATO.aiactStack = s.aiactStack;
            if (s && typeof s.aiactEsito === 'string') STATO.aiactEsito = s.aiactEsito;
        } catch (e) { /* dato illeggibile: si riparte puliti */ }
    }

    /* ============================================================
       MODELLO: ogni funzione restituisce {valore, trace}
       ============================================================ */

    // Punteggio grezzo di un asse (0-9) sulle sole domande risposte.
    function punteggioAsse(i) {
        var dom = D.domande.filter(function (q) { return q.asse === i; });
        var idx = [];
        D.domande.forEach(function (q, k) { if (q.asse === i) idx.push(k); });
        var date = idx.filter(function (k) { return STATO.risposte[k] !== null; });
        var somma = date.reduce(function (acc, k) { return acc + STATO.risposte[k]; }, 0);
        var trace = [
            { regola: 'Domande dell\'asse', condizione: dom.length + ' domande da 0 a 3 punti', esito: 'massimo ' + MAX_ASSE + ' punti' },
            { regola: 'Risposte fornite', condizione: date.length + ' di ' + idx.length, esito: plur(somma, 'punto', 'punti') }
        ];
        return {
            valore: date.length ? somma : null,
            date: date.length,
            totali: idx.length,
            trace: trace
        };
    }

    // Punteggio normalizzato 0-100 di un asse, sulle sole domande risposte.
    function livelloAsse(i) {
        var p = punteggioAsse(i);
        if (p.valore === null) return { valore: null, date: 0, totali: p.totali, trace: p.trace };
        var max = p.date * 3;
        var v = Math.round((p.valore / max) * 100);
        p.trace.push({
            regola: 'Normalizzazione',
            condizione: p.valore + ' su ' + max + ' punti possibili',
            esito: v + ' su 100'
        });
        return { valore: v, date: p.date, totali: p.totali, grezzo: p.valore, trace: p.trace };
    }

    function tuttiLivelli() {
        return D.assi.map(function (a, i) { return livelloAsse(i); });
    }

    function risposteDate() {
        return STATO.risposte.filter(function (r) { return r !== null; }).length;
    }

    function completo() { return risposteDate() === D.domande.length; }

    // Indice di maturità: somma dei punti effettivi su 45.
    function indice() {
        var somma = STATO.risposte.reduce(function (a, r) { return a + (r === null ? 0 : r); }, 0);
        var n = risposteDate();
        var trace = [
            { regola: 'Somma dei punti', condizione: plur(n, 'risposta', 'risposte') + ' su ' + D.domande.length, esito: somma + ' su ' + MAX_TOTALE }
        ];
        var liv = null;
        if (n === D.domande.length) {
            liv = D.livelli.filter(function (l) { return somma >= l.min && somma <= l.max; })[0] || null;
            if (liv) {
                trace.push({
                    regola: 'Fascia di maturità',
                    condizione: liv.min + ' - ' + liv.max + ' punti',
                    esito: liv.nome
                });
            }
        } else {
            trace.push({
                regola: 'Fascia di maturità',
                condizione: 'questionario incompleto',
                esito: 'non attribuita'
            });
        }
        return { valore: somma, risposte: n, livello: liv, trace: trace };
    }

    // Esposizione di una famiglia di rischio (0-100), pesata sugli assi valutati.
    function esposizione(fam) {
        var liv = tuttiLivelli();
        var num = 0, den = 0;
        var trace = [];
        fam.pesi.forEach(function (w, a) {
            if (w === 0 || liv[a].valore === null) return;
            var scoperto = 100 - liv[a].valore;
            num += w * scoperto;
            den += w;
            trace.push({
                regola: D.assi[a].nome,
                condizione: 'peso ' + w + ', presidio ' + liv[a].valore + '/100',
                esito: 'scoperto ' + scoperto + ' x ' + w
            });
        });
        if (den === 0) return { valore: null, trace: [{ regola: 'Dati insufficienti', condizione: 'nessun asse pertinente valutato', esito: 'non calcolabile' }] };
        var v = Math.round(num / den);
        trace.push({ regola: 'Media pesata', condizione: num + ' / ' + den, esito: v + ' su 100' });
        return { valore: v, trace: trace };
    }

    // Contributo del singolo asse all'esposizione della famiglia.
    // La somma dei contributi di una riga è l'esposizione della famiglia.
    function contributo(fam, a) {
        var liv = tuttiLivelli();
        var den = 0;
        fam.pesi.forEach(function (w, k) { if (w > 0 && liv[k].valore !== null) den += w; });
        if (fam.pesi[a] === 0) return { valore: null, motivo: 'non pertinente' };
        if (liv[a].valore === null || den === 0) return { valore: null, motivo: 'non valutato' };
        return {
            valore: Math.round((fam.pesi[a] * (100 - liv[a].valore)) / den),
            intensita: (100 - liv[a].valore) / 100
        };
    }

    function famiglieOrdinate() {
        return D.famiglie.slice().map(function (f) {
            return { f: f, e: esposizione(f) };
        }).sort(function (x, y) {
            if (x.e.valore === null && y.e.valore === null) return y.f.impatto - x.f.impatto;
            if (x.e.valore === null) return 1;
            if (y.e.valore === null) return -1;
            return y.e.valore - x.e.valore;
        });
    }

    function assiDeboli() {
        return tuttiLivelli()
            .map(function (l, i) { return { i: i, l: l }; })
            .filter(function (x) { return x.l.valore !== null && x.l.valore < SOGLIA_PRESIDIO; })
            .sort(function (a, b) { return a.l.valore - b.l.valore; });
    }

    /* ============================================================
       COLORE DELLA HEATMAP (interpolazione in JS, niente color-mix)
       ============================================================ */
    function coloreScala(t) {
        // t: 0 presidiato (verde tenue) -> 1 scoperto (rosso tenue)
        t = clamp(t, 0, 1);
        var a = { r: 232, g: 242, b: 234 };
        var m = { r: 245, g: 237, b: 214 };
        var b = { r: 242, g: 222, b: 222 };
        var da, db, k;
        if (t < 0.5) { da = a; db = m; k = t / 0.5; } else { da = m; db = b; k = (t - 0.5) / 0.5; }
        var r = Math.round(da.r + (db.r - da.r) * k);
        var g = Math.round(da.g + (db.g - da.g) * k);
        var bl = Math.round(da.b + (db.b - da.b) * k);
        return 'rgb(' + r + ',' + g + ',' + bl + ')';
    }

    /* ============================================================
       STREAMING DEL TESTO (solo su testi realmente calcolati)
       ============================================================ */
    // Ogni elemento in streaming tiene il proprio controllore, così una seconda
    // chiamata sullo stesso elemento ferma la prima invece di scrivere in
    // concorrenza sullo stesso textContent.
    var STREAMS = new WeakMap();

    function fermaStream(el) {
        var s = STREAMS.get(el);
        if (s) s.annulla();
    }

    function stream(el, testo) {
        if (!el) return;
        fermaStream(el);

        // Con reduced motion, o a scheda in background (dove requestAnimationFrame
        // non viene servito e il testo resterebbe vuoto), si scrive tutto subito.
        if (RM.matches || document.hidden) {
            el.textContent = testo;
            el.setAttribute('aria-busy', 'false');
            return;
        }

        var parole = testo.split(' ');
        var i = 0;
        var fatto = false;
        var handle = null;

        el.textContent = '';
        el.setAttribute('aria-busy', 'true');
        var caret = document.createElement('span');
        caret.className = 'aig-caret';
        el.appendChild(caret);

        function chiudi(scriviTesto) {
            if (fatto) return;
            fatto = true;
            if (handle) cancelAnimationFrame(handle);
            el.removeEventListener('click', completa);
            STREAMS.delete(el);
            if (scriviTesto) {
                el.textContent = testo;
                el.setAttribute('aria-busy', 'false');
            }
        }

        function completa() { chiudi(true); }

        // Annullato dall'esterno: lascia il campo a chi subentra, senza scrivere.
        STREAMS.set(el, { annulla: function () { chiudi(false); } });

        el.addEventListener('click', completa);

        var ultimo = 0;
        function passo(t) {
            if (fatto) return;
            if (t - ultimo > 45) {
                ultimo = t;
                i++;
                if (i >= parole.length) { completa(); return; }
                el.textContent = parole.slice(0, i).join(' ') + ' ';
                el.appendChild(caret);
            }
            handle = requestAnimationFrame(passo);
        }
        handle = requestAnimationFrame(passo);
    }

    /* ============================================================
       RADAR
       ============================================================ */
    var RADAR = { cx: 100, cy: 100, r: 74, correnti: [0, 0, 0, 0, 0], anim: null };

    function puntoRadar(i, v) {
        var ang = (2 * Math.PI * i) / 5;
        var rr = (RADAR.r * v) / 100;
        return [
            RADAR.cx + rr * Math.sin(ang),
            RADAR.cy - rr * Math.cos(ang)
        ];
    }

    function stringaPunti(vals) {
        return vals.map(function (v, i) {
            var p = puntoRadar(i, Math.max(v, 2));
            return p[0].toFixed(1) + ',' + p[1].toFixed(1);
        }).join(' ');
    }

    function disegnaRadarStatico() {
        var svg = $('#aigRadar');
        if (!svg) return;
        var g = $('#aigRadarGriglia', svg);
        var out = '';
        [25, 50, 75, 100].forEach(function (liv) {
            out += '<polygon class="aig-radar__griglia" points="' + stringaPunti([liv, liv, liv, liv, liv]) + '"></polygon>';
        });
        for (var i = 0; i < 5; i++) {
            var p = puntoRadar(i, 100);
            out += '<line class="aig-radar__asse" x1="' + RADAR.cx + '" y1="' + RADAR.cy + '" x2="' + p[0].toFixed(1) + '" y2="' + p[1].toFixed(1) + '"></line>';
        }
        g.innerHTML = out;

        // Etichette: una parola, posizionate fuori dal pentagono
        var lab = $('#aigRadarLabel', svg);
        var lout = '';
        D.assi.forEach(function (a, i) {
            var p = puntoRadar(i, 122);
            var anchor = 'middle';
            if (p[0] > RADAR.cx + 6) anchor = 'start';
            if (p[0] < RADAR.cx - 6) anchor = 'end';
            lout += '<text class="aig-radar__etichetta" data-asse="' + i + '" x="' + p[0].toFixed(1) + '" y="' + (p[1] + 3).toFixed(1) + '" text-anchor="' + anchor + '">' + esc(a.breve) + '</text>';
        });
        lab.innerHTML = lout;

        var nodi = $('#aigRadarNodi', svg);
        var nout = '';
        for (var k = 0; k < 5; k++) {
            nout += '<circle class="aig-radar__nodo" data-asse="' + k + '" r="3" cx="' + RADAR.cx + '" cy="' + RADAR.cy + '"></circle>';
        }
        nodi.innerHTML = nout;
    }

    function aggiornaRadar() {
        var poly = $('#aigRadarProfilo');
        if (!poly) return;
        var liv = tuttiLivelli();
        var target = liv.map(function (l) { return l.valore === null ? 0 : l.valore; });

        // Soglia di riferimento
        var sog = $('#aigRadarSoglia');
        if (sog) {
            sog.setAttribute('points', stringaPunti([SOGLIA_PRESIDIO, SOGLIA_PRESIDIO, SOGLIA_PRESIDIO, SOGLIA_PRESIDIO, SOGLIA_PRESIDIO]));
            sog.style.display = STATO.soglia ? '' : 'none';
        }

        // Nodi ed etichette: accesi quando l'asse è completo
        $$('#aigRadarNodi circle').forEach(function (c, i) {
            var completoAsse = liv[i].date === liv[i].totali;
            c.classList.toggle('is-attivo', completoAsse);
            var p = puntoRadar(i, Math.max(target[i], 2));
            c.setAttribute('cx', p[0].toFixed(1));
            c.setAttribute('cy', p[1].toFixed(1));
            c.setAttribute('r', completoAsse ? 4 : 3);
        });
        $$('#aigRadarLabel text').forEach(function (t, i) {
            t.classList.toggle('is-attivo', liv[i].valore !== null);
        });

        // Salto diretto quando l'animazione non è desiderata o non è possibile:
        // con reduced motion, al primo disegno e quando la scheda è in background
        // (in quel caso requestAnimationFrame non viene servito e il profilo
        // resterebbe senza punti).
        if (RM.matches || !poly.getAttribute('points') || document.hidden) {
            RADAR.correnti = target;
            poly.setAttribute('points', stringaPunti(target));
            return;
        }

        var partenza = RADAR.correnti.slice();
        var t0 = null;
        if (RADAR.anim) cancelAnimationFrame(RADAR.anim);

        function ease(x) { return 1 - Math.pow(1 - x, 3); }

        function passo(ts) {
            if (t0 === null) t0 = ts;
            var k = clamp((ts - t0) / 320, 0, 1);
            var e = ease(k);
            var vals = partenza.map(function (p, i) { return p + (target[i] - p) * e; });
            poly.setAttribute('points', stringaPunti(vals));
            if (k < 1) {
                RADAR.anim = requestAnimationFrame(passo);
            } else {
                RADAR.correnti = target;
                RADAR.anim = null;
            }
        }
        RADAR.anim = requestAnimationFrame(passo);
    }

    /* ============================================================
       RENDER: chiamata a ogni mutazione dello stato
       ============================================================ */

    function renderChips() {
        $$('#aigChips .aig-chip').forEach(function (b) {
            b.classList.toggle('is-attivo', b.dataset.v === STATO.ruolo);
            b.setAttribute('aria-pressed', b.dataset.v === STATO.ruolo ? 'true' : 'false');
        });
    }

    function renderKPI() {
        var n = risposteDate();
        var liv = tuttiLivelli();
        var ind = indice();

        var presidiati = liv.filter(function (l) { return l.valore !== null && l.valore >= SOGLIA_PRESIDIO; }).length;
        var esp = famiglieOrdinate().filter(function (x) { return x.e.valore !== null; });
        var espMedia = esp.length ? Math.round(esp.reduce(function (a, x) { return a + x.e.valore; }, 0) / esp.length) : null;
        var maturita = n ? Math.round((ind.valore / (n * 3)) * 100) : null;

        var kpi = [
            { id: 'copertura', valore: n ? Math.round((n / D.domande.length) * 100) : null, suffisso: '%', nota: plur(n, 'risposta', 'risposte') + ' di ' + D.domande.length, verso: 'su' },
            { id: 'maturita', valore: maturita, suffisso: '%', nota: n ? plur(ind.valore, 'punto', 'punti') + ' su ' + (n * 3) + ' possibili' : 'in attesa di dati', verso: 'su' },
            { id: 'assi', valore: n ? presidiati : null, suffisso: '/5', nota: 'assi oltre la soglia di ' + SOGLIA_PRESIDIO, verso: 'su' },
            { id: 'esposizione', valore: espMedia, suffisso: '%', nota: espMedia === null ? 'in attesa di dati' : 'esposizione media su ' + esp.length + ' famiglie di ' + D.famiglie.length, verso: 'giu' }
        ];

        kpi.forEach(function (k) {
            var el = $('#aigKpi-' + k.id);
            if (!el) return;
            var val = $('.aig-kpi__valore', el);
            var nota = $('.aig-kpi__nota', el);
            var segs = $$('.aig-seg span', el);

            if (k.valore === null) {
                el.classList.add('is-spento');
                el.classList.remove('is-ok', 'is-warn', 'is-alert');
                val.textContent = '--';
                nota.textContent = 'in attesa di dati';
                segs.forEach(function (s) { s.classList.remove('is-pieno'); });
                return;
            }

            el.classList.remove('is-spento');
            var perc = k.suffisso === '/5' ? (k.valore / 5) * 100 : k.valore;
            val.textContent = k.valore + k.suffisso;
            nota.textContent = k.nota;

            var pieni = Math.ceil((perc / 100) * segs.length);
            segs.forEach(function (s, i) { s.classList.toggle('is-pieno', i < pieni); });

            el.classList.remove('is-ok', 'is-warn', 'is-alert');
            var buono = k.verso === 'su' ? perc >= 67 : perc <= 33;
            var medio = k.verso === 'su' ? perc >= 34 : perc <= 66;
            if (k.id === 'copertura') { el.classList.add(perc === 100 ? 'is-ok' : 'is-warn'); }
            else if (buono) el.classList.add('is-ok');
            else if (medio) el.classList.add('is-warn');
            else el.classList.add('is-alert');
        });
    }

    function renderAssiNav() {
        var nav = $('#aigAssiNav');
        if (!nav) return;
        if (!nav.dataset.pronto) {
            nav.innerHTML = D.assi.map(function (a, i) {
                return '<button type="button" data-asse="' + i + '"><span class="aig-pallino"></span>' + esc(a.breve) + '</button>';
            }).join('');
            nav.dataset.pronto = '1';
        }
        var liv = tuttiLivelli();
        $$('button', nav).forEach(function (b, i) {
            b.classList.toggle('is-attivo', i === STATO.asseCorrente);
            b.classList.toggle('is-completo', liv[i].date === liv[i].totali);
            b.setAttribute('aria-pressed', i === STATO.asseCorrente ? 'true' : 'false');
        });
    }

    // Aggiorna solo gli stati delle opzioni già a schermo: ricostruire l'HTML a
    // ogni risposta farebbe perdere il focus a chi naviga da tastiera.
    // Le opzioni sono un gruppo radio: aria-checked per lo stato e roving tabindex,
    // così il gruppo occupa una sola tappa di tabulazione.
    function aggiornaScelte(wrap) {
        $$('.aig-opzioni', wrap).forEach(function (gruppo) {
            var bottoni = $$('.aig-opzione', gruppo);
            var sceltaIdx = -1;
            bottoni.forEach(function (b, k) {
                var scelta = STATO.risposte[parseInt(b.dataset.i, 10)] === parseInt(b.dataset.o, 10);
                if (scelta) sceltaIdx = k;
                b.classList.toggle('is-scelta', scelta);
                b.setAttribute('aria-checked', scelta ? 'true' : 'false');
            });
            bottoni.forEach(function (b, k) {
                b.tabIndex = (k === (sceltaIdx === -1 ? 0 : sceltaIdx)) ? 0 : -1;
            });
        });
    }

    function renderDomande() {
        var wrap = $('#aigDomande');
        if (!wrap) return;

        if (wrap.dataset.asse === String(STATO.asseCorrente)) {
            aggiornaScelte(wrap);
            aggiornaNavAsse();
            return;
        }

        var asse = D.assi[STATO.asseCorrente];
        var dom = [];
        D.domande.forEach(function (q, k) { if (q.asse === STATO.asseCorrente) dom.push({ q: q, k: k }); });

        var html = '<p class="aig-asse__desc">' + esc(asse.descrizione) + '</p>';
        dom.forEach(function (item, j) {
            var idTesto = 'aigQ-' + item.q.id;
            html += '<div class="aig-domanda" data-i="' + item.k + '">' +
                '<p class="aig-domanda__testo" id="' + idTesto + '"><span class="aig-domanda__n">' + ('0' + (j + 1)) + '</span><span>' + esc(item.q.testo) + '</span></p>' +
                '<div class="aig-opzioni" role="radiogroup" aria-labelledby="' + idTesto + '">' +
                item.q.opzioni.map(function (o, oi) {
                    // Le opzioni hanno punti crescenti 0..3: si memorizza l'indice scelto.
                    var sel = STATO.risposte[item.k] === oi;
                    return '<button type="button" role="radio" class="aig-opzione' + (sel ? ' is-scelta' : '') + '" data-i="' + item.k + '" data-o="' + oi + '" aria-checked="' + (sel ? 'true' : 'false') + '" tabindex="-1">' +
                        '<span class="aig-opzione__punti" aria-hidden="true">' + o.punti + '</span><span>' + esc(o.testo) + '</span>' +
                        '<span class="aig-sr">, ' + plur(o.punti, 'punto', 'punti') + '</span></button>';
                }).join('') +
                '</div></div>';
        });
        wrap.innerHTML = html;
        aggiornaScelte(wrap);
        wrap.dataset.asse = String(STATO.asseCorrente);
        aggiornaNavAsse();
    }

    function aggiornaNavAsse() {
        var prec = $('#aigPrec');
        var succ = $('#aigSucc');
        if (prec) prec.disabled = STATO.asseCorrente === 0;
        if (succ) succ.disabled = STATO.asseCorrente === D.assi.length - 1;
    }

    function renderIndice() {
        var ind = indice();
        var val = $('#aigIndiceValore');
        var liv = $('#aigIndiceLivello');
        var stato = $('#aigRadarStato');
        if (!val) return;

        val.textContent = ind.valore;
        if (ind.livello) {
            liv.textContent = ind.livello.nome;
            liv.classList.remove('is-spento');
        } else {
            liv.textContent = 'in corso';
            liv.classList.add('is-spento');
        }
        if (stato) {
            stato.textContent = ind.risposte === 0
                ? 'in attesa di dati'
                : 'aggiornato su ' + plur(ind.risposte, 'risposta', 'risposte') + ' di ' + D.domande.length;
        }

        var tr = $('#aigIndiceTrace');
        if (tr) tr.innerHTML = traceHtml(ind.trace);
    }

    function renderLegendaRadar() {
        var tb = $('#aigRadarLegendaCorpo');
        if (!tb) return;
        var liv = tuttiLivelli();
        tb.innerHTML = D.assi.map(function (a, i) {
            var v = liv[i].valore;
            var debole = v !== null && v < SOGLIA_PRESIDIO;
            return '<tr class="' + (debole ? 'is-debole' : '') + '"><td>' + esc(a.nome) + '</td><td>' +
                (v === null ? '--' : v + '/100') + '</td></tr>';
        }).join('');
    }

    function traceHtml(trace) {
        return trace.map(function (t) {
            return '<p><b>' + esc(t.regola) + '</b>: ' + esc(t.condizione) + ' &rarr; ' + esc(t.esito) + '</p>';
        }).join('');
    }

    function renderCommento() {
        var el = $('#aigCommento');
        if (!el) return;
        var i = STATO.asseCorrente;
        var l = livelloAsse(i);

        if (l.date !== l.totali) {
            // Asse incompleto: si azzera, ma prima si ferma lo streaming in corso,
            // altrimenti il commento dell'asse precedente continuerebbe a scriversi.
            fermaStream(el);
            if (el.textContent !== '') el.textContent = '';
            return;
        }

        var testo = testoCommento(i, l);
        var chiave = 'a' + i + '-' + l.grezzo;
        if (STATO.commentati[chiave]) {
            // Già visto: si riscrive solo se davvero cambia, così aria-live non
            // rilegge lo stesso commento a ogni render().
            fermaStream(el);
            if (el.textContent !== testo) el.textContent = testo;
            return;
        }
        STATO.commentati[chiave] = true;
        stream(el, testo);
    }

    function testoCommento(i, l) {
        var fascia = FASCE_ASSE.filter(function (f) { return l.grezzo <= f.max; })[0];
        var racc = D.raccomandazioni.filter(function (r) { return r.asseId === D.assi[i].id; })[0];
        var t = 'Asse chiuso con ' + plur(l.grezzo, 'punto', 'punti') + ' su ' + MAX_ASSE + ', pari a ' + l.valore + ' su 100: ' + fascia.nota + '.';
        if (l.valore < SOGLIA_PRESIDIO && racc) {
            t += ' Sotto la soglia di riferimento di ' + SOGLIA_PRESIDIO + ': la priorità è ' + racc.titolo.charAt(0).toLowerCase() + racc.titolo.slice(1) + '.';
        } else {
            t += ' Sopra la soglia di riferimento di ' + SOGLIA_PRESIDIO + ', in linea con le organizzazioni più strutturate.';
        }
        return t;
    }

    /* ---------- Benchmark ---------- */

    // Aggancio dichiarato fra le tre evidenze del campione e le domande.
    var AGGANCI = [
        { idx: [0], nota: 'policy, tassonomie e criteri di classificazione presidiati al centro' },
        { idx: [1], nota: 'comitato AI formalizzato con mandato e poteri' },
        { idx: [3, 12], nota: 'inventario dei sistemi e formazione avviata' }
    ];

    function renderBenchmark() {
        var wrap = $('#aigBarre');
        if (!wrap) return;
        if (!wrap.dataset.pronto) {
            wrap.innerHTML = D.benchmark.map(function (b, i) {
                return '<div class="aig-bar" data-b="' + i + '">' +
                    '<div class="aig-bar__testa"><span class="aig-bar__nome">' + esc(b.label) + '</span>' +
                    '<span class="aig-bar__valore">' + b.valore + '%</span></div>' +
                    '<div class="aig-bar__pista"><div class="aig-bar__riempimento" style="width:' + b.valore + '%"></div>' +
                    '<div class="aig-bar__tu" data-etichetta="voi" hidden></div></div>' +
                    '<p class="aig-bar__testo">' + esc(b.testo) + '</p>' +
                    '<details class="aig-trace"><summary>Come si legge il confronto</summary>' +
                    '<div class="aig-trace__corpo"><p><b>Barra</b>: quota di organizzazioni del campione &rarr; ' + b.valore + '%</p>' +
                    '<p><b>Marcatore</b>: livello di presidio dichiarato nelle vostre risposte, su scala 0-100</p>' +
                    '<p><b>Aggancio</b>: ' + esc(AGGANCI[i].nota) + '</p>' +
                    '<p class="aig-bar__calcolo"></p></div></details>' +
                    '</div>';
            }).join('');
            wrap.dataset.pronto = '1';
        }

        $$('.aig-bar', wrap).forEach(function (bar, i) {
            var ag = AGGANCI[i];
            var date = ag.idx.filter(function (k) { return STATO.risposte[k] !== null; });
            var tu = $('.aig-bar__tu', bar);
            var calc = $('.aig-bar__calcolo', bar);
            if (!date.length) {
                tu.hidden = true;
                if (calc) calc.innerHTML = '<b>Vostro dato</b>: nessuna risposta pertinente &rarr; marcatore non mostrato';
                return;
            }
            var somma = date.reduce(function (a, k) { return a + STATO.risposte[k]; }, 0);
            var v = Math.round((somma / (date.length * 3)) * 100);
            tu.hidden = false;
            tu.style.left = clamp(v, 0, 100) + '%';
            if (calc) calc.innerHTML = '<b>Vostro dato</b>: ' + somma + ' punti su ' + (date.length * 3) + ' &rarr; ' + v + ' su 100';
        });
    }

    /* ---------- Heatmap ---------- */

    function renderHeat() {
        var wrap = $('#aigHeat');
        if (!wrap) return;
        var ord = famiglieOrdinate();

        if (!wrap.dataset.pronto) {
            var head = '<div class="aig-heat__intestazione">Famiglia di rischio</div>' +
                D.assi.map(function (a) { return '<div class="aig-heat__intestazione">' + esc(a.breve) + '</div>'; }).join('') +
                '<div class="aig-heat__intestazione">Esposizione</div>';
            wrap.innerHTML = head + '<div id="aigHeatCorpo" style="display:contents"></div>';
            wrap.dataset.pronto = '1';
        }

        var corpo = $('#aigHeatCorpo');
        var idx = 0;
        corpo.innerHTML = ord.map(function (x) {
            var f = x.f;
            var celle = D.assi.map(function (a, ai) {
                var c = contributo(f, ai);
                idx++;
                if (c.valore === null) {
                    return '<button type="button" class="aig-heat__cella" data-vuota="1" data-fam="' + f.id + '" data-asse="' + ai + '" style="--i:' + idx + '" ' +
                        'aria-label="' + esc(f.nome + ', ' + a.nome + ': ' + c.motivo) + '">' + (c.motivo === 'non pertinente' ? '&middot;' : '--') + '</button>';
                }
                return '<button type="button" class="aig-heat__cella" data-fam="' + f.id + '" data-asse="' + ai + '" style="--i:' + idx + ';background-color:' + coloreScala(c.intensita) + '" ' +
                    'aria-label="' + esc(f.nome + ', ' + a.nome + ': contributo ' + c.valore) + '">' + c.valore + '</button>';
            }).join('');

            var e = x.e.valore;
            var pallino = e === null ? 'var(--aig-hairline)' : coloreScala(e / 100);
            return '<div class="aig-heat__riga">' +
                '<button type="button" class="aig-heat__nome' + (STATO.famiglia === f.id ? ' is-attivo' : '') + '" data-fam="' + f.id + '">' +
                esc(f.nome) + '<span>' + (e === null ? '--' : e) + '</span></button>' +
                celle +
                '<div class="aig-heat__totale"><i style="background:' + pallino + '"></i>' + (e === null ? '--' : e) + '</div>' +
                '</div>';
        }).join('');

        renderDettaglio();
    }

    function renderDettaglio() {
        var box = $('#aigDettaglio');
        if (!box) return;
        var ord = famiglieOrdinate();
        var scelta = STATO.famiglia
            ? ord.filter(function (x) { return x.f.id === STATO.famiglia; })[0]
            : ord[0];
        if (!scelta) return;

        var f = scelta.f;
        var e = scelta.e;
        // Numero grande (27px, peso 800): il livello AA per il testo di grandi
        // dimensioni chiede 3:1, quindi qui i colori pieni delle soglie bastano.
        var colore = e.valore === null ? 'var(--aig-text-muted)'
            : (e.valore >= 67 ? 'var(--aig-alert)' : (e.valore >= 34 ? 'var(--aig-warn)' : 'var(--aig-ok)'));

        box.innerHTML =
            '<div class="aig-dettaglio__testa"><div>' +
            '<p class="aig-tag">FAMIGLIA / ' + esc(f.id.toUpperCase().replace(/-/g, '_')) + '</p>' +
            '<h3>' + esc(f.nome) + '</h3></div>' +
            '<div class="aig-dettaglio__esposizione"><p class="aig-tag">Esposizione</p>' +
            '<b style="color:' + colore + '">' + (e.valore === null ? '--' : e.valore) + '</b></div></div>' +
            '<p class="aig-dettaglio__desc">' + esc(f.descrizione) + '</p>' +
            '<div class="aig-dettaglio__colonne">' +
            '<div><h4>Rischi principali</h4><ul class="aig-lista">' +
            f.rischi.map(function (r) { return '<li><b>' + esc(r.nome) + '</b>' + esc(r.testo) + '</li>'; }).join('') +
            '</ul></div>' +
            '<div><h4>Presidi di mitigazione</h4><ul class="aig-lista">' +
            f.mitigazioni.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') +
            '</ul></div></div>' +
            '<details class="aig-trace"><summary>Come ci sono arrivato</summary><div class="aig-trace__corpo">' +
            '<p><b>Matrice</b>: W[7][5], pesi da 0 a 2 per ogni coppia famiglia e asse</p>' +
            '<p><b>Formula</b>: somma(peso x scoperto) / somma(pesi), sugli assi valutati</p>' +
            '<p><b>Celle</b>: contributo del singolo asse, arrotondato all\'unità: la somma della riga può discostarsi di un punto dal totale</p>' +
            traceHtml(e.trace) +
            '</div></details>';
    }

    /* ---------- Classificatore AI Act ---------- */

    function nodoAiact(id) {
        return D.aiact.domande.filter(function (d) { return d.id === id; })[0];
    }

    // Il classificatore sostituisce l'intero nodo: senza questo, il bottone che
    // aveva il focus sparisce e il focus torna sul body, in silenzio.
    function focoNodo() {
        var titolo = $('#aigNodoTitolo');
        if (titolo) titolo.focus();
    }

    function esitoAiact(id) {
        return D.aiact.esiti.filter(function (e) { return e.id === id; })[0];
    }

    function renderAiact() {
        var bric = $('#aigBriciole');
        var nodo = $('#aigNodo');
        if (!nodo) return;

        // Briciole
        var passi = STATO.aiactStack;
        var html = '<button type="button" class="aig-briciola" data-passo="0">Inizio</button>';
        passi.forEach(function (p, i) {
            var d = nodoAiact(p.nodo);
            if (!d) return;
            html += '<span class="aig-briciole__sep">/</span><button type="button" class="aig-briciola" data-passo="' + (i + 1) + '">' +
                esc(d.id.toUpperCase()) + ': ' + esc(p.scelta) + '</button>';
        });
        bric.innerHTML = html;

        if (STATO.aiactEsito) {
            var e = esitoAiact(STATO.aiactEsito);
            if (e) {
                nodo.innerHTML = '<div class="aig-esito">' +
                    '<span class="aig-esito__classe" data-livello="' + esc(e.livello) + '">' + esc(e.classe) + '</span>' +
                    '<h3 id="aigNodoTitolo" tabindex="-1">' + esc(e.titolo) + '</h3>' +
                    '<p class="aig-esito__desc">' + esc(e.descrizione) + '</p>' +
                    '<h4 class="aig-tag" style="margin-bottom:11px">Adempimenti principali</h4>' +
                    '<ul class="aig-lista">' + e.adempimenti.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>' +
                    '<p class="aig-esito__nota">' + esc(e.nota) + '</p>' +
                    '<div class="aig-esito__azioni">' +
                    (e.prosegui ? '<button type="button" class="aig-btn aig-btn--chiaro" id="aigAiactProsegui">Prosegui: classifica anche il sistema</button>' : '') +
                    '<button type="button" class="aig-btn aig-btn--linea" id="aigAiactReset">Classifica un altro caso d\'uso</button>' +
                    '<a href="#piano" class="aig-btn' + (e.prosegui ? ' aig-btn--linea' : ' aig-btn--chiaro') + '">Porta l\'esito nella nota</a>' +
                    '</div>' +
                    '<details class="aig-trace"><summary>Come ci sono arrivato</summary><div class="aig-trace__corpo">' +
                    passi.map(function (p) {
                        var d = nodoAiact(p.nodo);
                        // Uno stack ripristinato da una versione precedente dei dati può
                        // puntare a un nodo non più esistente: si salta, non si esplode.
                        if (!d) return '';
                        return '<p><b>' + esc(d.id.toUpperCase()) + '</b>: ' + esc(d.testo) + ' &rarr; ' + esc(p.scelta) + '</p>';
                    }).join('') +
                    '<p><b>Esito</b>: ' + esc(e.classe) + '</p>' +
                    '</div></details>' +
                    '</div>';
                return;
            }
        }

        var corrente = passi.length ? passi[passi.length - 1].vai : 'd1';
        var d = nodoAiact(corrente);
        if (!d) { d = nodoAiact('d1'); STATO.aiactStack = []; }

        nodo.innerHTML =
            '<p class="aig-tag">AI_ACT / ' + esc(d.id.toUpperCase()) + '</p>' +
            '<p class="aig-nodo__domanda" id="aigNodoTitolo" tabindex="-1">' + esc(d.testo) + '</p>' +
            '<p class="aig-nodo__aiuto">' + esc(d.aiuto) + '</p>' +
            '<div class="aig-nodo__opzioni">' +
            d.opzioni.map(function (o) {
                return '<button type="button" class="aig-scelta" data-nodo="' + d.id + '" data-vai="' + esc(o.vai) + '" data-testo="' + esc(o.testo) + '">' +
                    '<span>' + esc(o.testo) + '</span>' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>' +
                    '</button>';
            }).join('') +
            '</div>';
    }

    /* ---------- Hub and spoke ---------- */

    var HUB = {
        centro: {
            titolo: 'Presidio di governo centrale',
            testo: 'Definisce policy, standard, tassonomie e criteri di classificazione del rischio, e gestisce l\'inventario dei sistemi di AI come strumento vivo, non come mero censimento. È il punto in cui l\'AI Act riceve un\'interpretazione omogenea per tutto il gruppo.',
            punti: [
                'Policy, tassonomie e criteri di classificazione unici per il gruppo',
                'Inventario dei sistemi integrato nei processi decisionali e di controllo',
                'Flussi verso il consiglio normalizzati nel profilo di rischio complessivo',
                'Perimetri e autonomia graduati sulla materialità del rischio'
            ]
        }
    };

    D.assi.forEach(function (a) {
        HUB[a.id] = {
            titolo: a.spoke,
            testo: a.descrizione,
            asseId: a.id
        };
    });

    function renderHub() {
        var punti = $('#aigHubPunti');
        var pannello = $('#aigHubPannello');
        if (!punti || !pannello) return;

        var deboli = assiDeboli().map(function (x) { return D.assi[x.i].id; });

        $$('.aig-hub__punto', punti).forEach(function (p) {
            var id = p.dataset.nodo;
            var btn = $('.aig-hub__btn', p);
            var chip = $('.aig-hub__chip', p);
            var prio = deboli.indexOf(id) !== -1;
            btn.classList.toggle('is-attivo', STATO.hub === id);
            // Lo stato selezionato non può essere affidato al solo colore.
            btn.setAttribute('aria-pressed', STATO.hub === id ? 'true' : 'false');
            if (chip) chip.hidden = !prio;
        });

        $$('#aigHubSvg .aig-hub__arco').forEach(function (l) {
            l.classList.toggle('is-priority', deboli.indexOf(l.dataset.nodo) !== -1);
        });
        $$('#aigHubSvg .aig-hub__cerchio').forEach(function (c) {
            var id = c.dataset.nodo;
            c.classList.toggle('is-priority', deboli.indexOf(id) !== -1);
            c.classList.toggle('is-attivo', STATO.hub === id && id !== 'centro');
        });

        var n = HUB[STATO.hub] || HUB.centro;
        var liv = null;
        if (n.asseId) {
            var i = D.assi.map(function (a) { return a.id; }).indexOf(n.asseId);
            liv = livelloAsse(i);
        }

        var html = '<p class="aig-tag">' + (n.asseId ? 'SPOKE' : 'HUB') + ' / ' + esc((n.asseId || 'centro').toUpperCase().replace(/-/g, '_')) + '</p>' +
            '<h3>' + esc(n.titolo) + '</h3><p>' + esc(n.testo) + '</p>';

        if (n.punti) {
            html += '<ul class="aig-lista">' + n.punti.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>';
        }

        if (liv) {
            if (liv.valore === null) {
                html += '<ul class="aig-lista"><li>Nessuna risposta su questo asse: compilate la plancia per vedere se lo spoke va rafforzato.</li></ul>';
            } else {
                var racc = D.raccomandazioni.filter(function (r) { return r.asseId === n.asseId; })[0];
                html += '<ul class="aig-lista"><li><b>Presidio dichiarato: ' + liv.valore + ' su 100</b>' +
                    (liv.valore < SOGLIA_PRESIDIO
                        ? 'Sotto la soglia di riferimento di ' + SOGLIA_PRESIDIO + ': lo spoke è segnalato come da rafforzare.'
                        : 'Sopra la soglia di riferimento di ' + SOGLIA_PRESIDIO + ': lo spoke opera entro perimetri presidiati.') +
                    '</li>';
                if (racc && liv.valore < SOGLIA_PRESIDIO) {
                    html += '<li><b>' + esc(racc.titolo) + '</b>' + esc(racc.testo) + '</li>';
                }
                html += '</ul>';
            }
        }

        pannello.innerHTML = html;
    }

    // Le tre linee di difesa sono contenuto informativo, non un widget: il click
    // non rivelava nulla che non fosse già scritto nella card.

    /* ---------- Piano / nota per il consiglio ---------- */

    function renderPiano() {
        var testo = $('#aigPianoTesto');
        var azioni = $('#aigPianoAzioni');
        var vuoto = $('#aigPianoVuoto');
        if (!testo) return;

        var n = risposteDate();
        var ind = indice();
        var deboli = assiDeboli();
        var ord = famiglieOrdinate().filter(function (x) { return x.e.valore !== null; });

        if (n === 0) {
            testo.textContent = '';
            vuoto.hidden = false;
            azioni.innerHTML = '';
            $('#aigCopia').disabled = true;
            $('#aigStampa').disabled = true;
            return;
        }

        vuoto.hidden = true;
        $('#aigCopia').disabled = false;
        $('#aigStampa').disabled = false;

        var t = componiPiano();
        var chiave = 'piano-' + n + '-' + ind.valore + '-' + (STATO.aiactEsito || '') + '-' + (STATO.ruolo || '');
        if (STATO.commentati[chiave]) {
            // Riscrivere un testo identico farebbe rileggere l'intera nota da capo
            // a chi usa uno screen reader, a ogni singola risposta.
            fermaStream(testo);
            if (testo.textContent !== t) testo.textContent = t;
        } else {
            STATO.commentati[chiave] = true;
            stream(testo, t);
        }

        // Azioni in priorità: dalle raccomandazioni degli assi sotto soglia,
        // integrate dalle azioni del livello quando il questionario è completo.
        var lista = [];
        deboli.forEach(function (x) {
            var r = D.raccomandazioni.filter(function (rr) { return rr.asseId === D.assi[x.i].id; })[0];
            if (r) lista.push({ t: r.titolo, d: r.testo });
        });
        if (ind.livello) {
            ind.livello.azioni.forEach(function (a) { lista.push({ t: 'Livello ' + ind.livello.nome, d: a }); });
        }
        if (!lista.length) {
            lista.push({
                t: 'Mantenere il presidio',
                d: 'Tutti gli assi valutati risultano sopra la soglia di riferimento: la priorità è dimostrare nel tempo l\'efficacia dei guard rail con evidenze verificabili.'
            });
        }

        azioni.innerHTML = lista.slice(0, 6).map(function (a) {
            return '<li><span><b>' + esc(a.t) + '.</b> ' + esc(a.d) + '</span></li>';
        }).join('');

        renderQuadro();

        var tr = $('#aigPianoTrace');
        if (tr) {
            var righe = [];
            righe.push({ regola: 'Copertura', condizione: plur(n, 'risposta', 'risposte') + ' di ' + D.domande.length, esito: plur(ind.valore, 'punto', 'punti') + ' su ' + MAX_TOTALE });
            righe.push({ regola: 'Soglia di riferimento', condizione: 'assi sotto ' + SOGLIA_PRESIDIO + '/100', esito: deboli.length + ' di ' + D.assi.length });
            if (ord.length) righe.push({ regola: 'Famiglia più esposta', condizione: ord[0].f.nome, esito: ord[0].e.valore + '/100' });
            if (STATO.aiactEsito) {
                var e = esitoAiact(STATO.aiactEsito);
                if (e) righe.push({ regola: 'Classificatore AI Act', condizione: 'esito del percorso a domande', esito: e.classe });
            }
            tr.innerHTML = traceHtml(righe);
        }
    }

    // Quadro di sintesi: le due tabelle che rendono la nota autosufficiente,
    // a schermo e soprattutto in stampa, dove radar e heatmap non arrivano.
    function renderQuadro() {
        var box = $('#aigQuadro');
        if (!box) return;
        if (risposteDate() === 0) { box.hidden = true; return; }
        box.hidden = false;

        var assi = $('#aigQuadroAssi');
        if (assi) {
            assi.innerHTML = tuttiLivelli().map(function (l, i) {
                var sotto = l.valore !== null && l.valore < SOGLIA_PRESIDIO;
                return '<tr' + (sotto ? ' class="is-debole"' : '') + '><td>' + esc(D.assi[i].nome) + '</td>' +
                    '<td>' + (l.valore === null ? 'non valutato' : l.valore + '/100') + '</td></tr>';
            }).join('');
        }

        var ris = $('#aigQuadroRischi');
        if (ris) {
            ris.innerHTML = famiglieOrdinate().map(function (x) {
                var alta = x.e.valore !== null && x.e.valore >= 67;
                return '<tr' + (alta ? ' class="is-debole"' : '') + '><td>' + esc(x.f.nome) + '</td>' +
                    '<td>' + (x.e.valore === null ? 'non calcolabile' : x.e.valore + '/100') + '</td></tr>';
            }).join('');
        }
    }

    function componiPiano() {
        var ind = indice();
        var n = risposteDate();
        var deboli = assiDeboli();
        var ord = famiglieOrdinate().filter(function (x) { return x.e.valore !== null; });
        var r = STATO.ruolo ? RUOLI[STATO.ruolo] : null;

        var p = [];
        p.push('Sintesi della posizione rilevata su ' + plur(n, 'risposta', 'risposte') + ' di ' + D.domande.length + ', per un indice di ' + plur(ind.valore, 'punto', 'punti') + ' su ' + MAX_TOTALE + (ind.livello ? ', corrispondente al livello "' + ind.livello.nome + '"' : ', con questionario ancora incompleto') + '.');

        if (ind.livello) p.push(ind.livello.descrizione);

        if (deboli.length === 1) {
            p.push('Un solo asse resta sotto la soglia di riferimento di ' + SOGLIA_PRESIDIO + ' su 100: ' + D.assi[deboli[0].i].nome.toLowerCase() + ' (' + deboli[0].l.valore + '/100).');
        } else if (deboli.length) {
            var nomi = deboli.slice(0, 3).map(function (x) { return D.assi[x.i].nome.toLowerCase() + ' (' + x.l.valore + '/100)'; });
            p.push('Gli assi sotto la soglia di riferimento di ' + SOGLIA_PRESIDIO + ' su 100 sono ' + deboli.length + ': in ordine di priorità ' + nomi.join(', ') + '.');
        } else if (n) {
            p.push('Tutti gli assi valutati risultano sopra la soglia di riferimento di ' + SOGLIA_PRESIDIO + ' su 100.');
        }

        if (ord.length && ord[0].e.valore === 0) {
            // Presidio pieno su tutti gli assi pertinenti: parlare di "esposizione più
            // alta" a fronte di uno zero sarebbe un allarme inesistente.
            p.push('Sul fronte dei rischi nessuna delle ' + ord.length + ' famiglie valutate risulta esposta: i presidi dichiarati coprono per intero gli assi pertinenti. Resta da dimostrare nel tempo, con evidenze verificabili, che i guard rail funzionino davvero come descritto.');
        } else if (ord.length) {
            p.push('Sul fronte dei rischi l\'esposizione più alta riguarda ' + ord[0].f.nome.toLowerCase() + ' (' + ord[0].e.valore + ' su 100)' + (ord[1] ? ', seguita da ' + ord[1].f.nome.toLowerCase() + ' (' + ord[1].e.valore + ' su 100)' : '') + '. ' + ord[0].f.sintesi);
        }

        if (STATO.aiactEsito) {
            var e = esitoAiact(STATO.aiactEsito);
            if (e) p.push('Il caso d\'uso classificato con lo strumento ricade nella categoria "' + e.classe + '": ' + e.titolo.charAt(0).toLowerCase() + e.titolo.slice(1) + '. La qualificazione va verificata caso per caso e non sostituisce un parere professionale.');
        }

        if (r) p.push('Lettura per il ruolo indicato (' + r.label + '): il punto di attenzione principale resta ' + r.taglio + '.');

        return p.join(' ');
    }

    function testoDaCopiare() {
        var righe = [];
        righe.push('AI GOVERNANCE - NOTA DI SINTESI');
        righe.push('Autovalutazione svolta su nextgenerationbusiness.it/ai_governance');
        righe.push('');
        righe.push(componiPiano());
        righe.push('');
        righe.push('PUNTEGGIO PER ASSE (soglia di riferimento: ' + SOGLIA_PRESIDIO + '/100)');
        tuttiLivelli().forEach(function (l, i) {
            righe.push('- ' + D.assi[i].nome + ': ' + (l.valore === null ? 'non valutato' : l.valore + '/100'));
        });
        righe.push('');
        righe.push('ESPOSIZIONE PER FAMIGLIA DI RISCHIO');
        famiglieOrdinate().forEach(function (x) {
            righe.push('- ' + x.f.nome + ': ' + (x.e.valore === null ? 'non calcolabile' : x.e.valore + '/100'));
        });
        righe.push('');
        righe.push('AZIONI IN PRIORITÀ');
        $$('#aigPianoAzioni li').forEach(function (li, i) {
            righe.push((i + 1) + '. ' + li.textContent.trim());
        });
        righe.push('');
        righe.push('Strumento di autovalutazione a fini orientativi: non sostituisce una valutazione professionale, un audit o un parere legale sulla conformità all\'AI Act.');
        return righe.join('\n');
    }

    /* ---------- render unica ---------- */

    function render() {
        renderChips();
        renderAssiNav();
        renderDomande();
        renderCommento();
        renderIndice();
        renderLegendaRadar();
        renderKPI();
        aggiornaRadar();
        renderBenchmark();
        renderHeat();
        renderAiact();
        renderHub();
        renderPiano();
    }

    /* ============================================================
       EVENTI (listener delegati)
       ============================================================ */

    function init() {
        ripristina();
        disegnaRadarStatico();

        // Chip ruolo
        var chips = $('#aigChips');
        if (chips) {
            chips.addEventListener('click', function (ev) {
                var b = ev.target.closest('.aig-chip');
                if (!b) return;
                STATO.ruolo = STATO.ruolo === b.dataset.v ? null : b.dataset.v;
                salva();
                render();
            });
        }

        // Navigazione assi
        var nav = $('#aigAssiNav');
        if (nav) {
            nav.addEventListener('click', function (ev) {
                var b = ev.target.closest('button[data-asse]');
                if (!b) return;
                STATO.asseCorrente = parseInt(b.dataset.asse, 10);
                render();
            });
        }

        var prec = $('#aigPrec');
        var succ = $('#aigSucc');
        if (prec) prec.addEventListener('click', function () {
            STATO.asseCorrente = Math.max(0, STATO.asseCorrente - 1);
            render();
        });
        if (succ) succ.addEventListener('click', function () {
            STATO.asseCorrente = Math.min(D.assi.length - 1, STATO.asseCorrente + 1);
            render();
        });

        // Risposte
        var dom = $('#aigDomande');
        if (dom) {
            dom.addEventListener('click', function (ev) {
                var b = ev.target.closest('.aig-opzione');
                if (!b) return;
                var i = parseInt(b.dataset.i, 10);
                var o = parseInt(b.dataset.o, 10);
                STATO.risposte[i] = STATO.risposte[i] === o ? null : o;
                salva();
                render();
                // Nessun avanzamento automatico: sostituire le domande sotto il
                // cursore toglierebbe il focus a chi naviga da tastiera e sposterebbe
                // la pagina mentre la si sta leggendo. Si passa di asse con i bottoni.
            });
        }

        // Azzera
        var azzera = $('#aigAzzera');
        if (azzera) azzera.addEventListener('click', function () {
            STATO.risposte = new Array(D.domande.length).fill(null);
            STATO.asseCorrente = 0;
            STATO.commentati = {};
            salva();
            render();
        });

        // Soglia sul radar
        var sog = $('#aigSoglia');
        if (sog) sog.addEventListener('change', function () {
            STATO.soglia = sog.checked;
            aggiornaRadar();
        });

        // Heatmap
        var heat = $('#aigHeat');
        if (heat) {
            heat.addEventListener('click', function (ev) {
                var c = ev.target.closest('[data-fam]');
                if (!c) return;
                STATO.famiglia = c.dataset.fam;

                // La griglia viene ricostruita: si annota quale cella aveva il focus
                // per restituirglielo, altrimenti il focus cadrebbe sul body.
                var fam = c.dataset.fam;
                var asse = c.dataset.asse;
                var avevaFocus = document.activeElement === c;

                renderHeat();

                if (avevaFocus) {
                    var sel = asse === undefined
                        ? '.aig-heat__nome[data-fam="' + fam + '"]'
                        : '.aig-heat__cella[data-fam="' + fam + '"][data-asse="' + asse + '"]';
                    var nuovo = $(sel, heat);
                    if (nuovo) nuovo.focus();
                }

                var box = $('#aigDettaglio');
                if (box && window.innerWidth < 900) box.scrollIntoView({ behavior: RM.matches ? 'instant' : 'smooth', block: 'nearest' });
            });
        }

        // Classificatore
        var nodo = $('#aigNodo');
        if (nodo) {
            nodo.addEventListener('click', function (ev) {
                var s = ev.target.closest('.aig-scelta');
                if (s) {
                    var vai = s.dataset.vai;
                    STATO.aiactStack.push({ nodo: s.dataset.nodo, scelta: s.dataset.testo, vai: vai });
                    if (vai.indexOf('esito:') === 0) {
                        STATO.aiactEsito = vai.slice(6);
                    }
                    salva();
                    renderAiact();
                    renderPiano();
                    focoNodo();
                    if (window.innerWidth < 900) {
                        $('#aigNodo').scrollIntoView({ behavior: RM.matches ? 'instant' : 'smooth', block: 'center' });
                    }
                    return;
                }
                if (ev.target.closest('#aigAiactProsegui')) {
                    // Il modello è classificato: si riparte dal punto indicato per
                    // classificare anche il sistema, perché i due regimi si cumulano.
                    var esito = esitoAiact(STATO.aiactEsito);
                    STATO.aiactEsito = null;
                    STATO.aiactStack.push({ nodo: 'gpai', scelta: 'prosegue sul sistema', vai: (esito && esito.prosegui) || 'd3' });
                    salva();
                    renderAiact();
                    renderPiano();
                    focoNodo();
                    return;
                }
                if (ev.target.closest('#aigAiactReset')) {
                    STATO.aiactStack = [];
                    STATO.aiactEsito = null;
                    salva();
                    renderAiact();
                    renderPiano();
                    focoNodo();
                }
            });
        }

        var bric = $('#aigBriciole');
        if (bric) {
            bric.addEventListener('click', function (ev) {
                var b = ev.target.closest('.aig-briciola');
                if (!b) return;
                var p = parseInt(b.dataset.passo, 10);
                STATO.aiactStack = STATO.aiactStack.slice(0, p);
                STATO.aiactEsito = null;
                // Se il taglio lascia uno stack che punta a un esito, lo si ripristina
                var ultimo = STATO.aiactStack[STATO.aiactStack.length - 1];
                if (ultimo && ultimo.vai.indexOf('esito:') === 0) STATO.aiactEsito = ultimo.vai.slice(6);
                salva();
                renderAiact();
                renderPiano();
            });
        }

        // Hub
        var hub = $('#aigHubPunti');
        if (hub) {
            hub.addEventListener('click', function (ev) {
                var b = ev.target.closest('.aig-hub__btn');
                if (!b) return;
                STATO.hub = b.closest('.aig-hub__punto').dataset.nodo;
                renderHub();
            });
        }

        // Copia e stampa
        var copia = $('#aigCopia');
        if (copia) copia.addEventListener('click', function () {
            var t = testoDaCopiare();
            var ok = function () {
                var old = copia.textContent;
                copia.textContent = 'Copiato';
                setTimeout(function () { copia.textContent = old; }, 1800);
            };
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(t).then(ok, fallback);
            } else { fallback(); }

            function fallback() {
                var ta = document.createElement('textarea');
                ta.value = t;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                try { document.execCommand('copy'); ok(); } catch (e) { /* nulla da fare */ }
                document.body.removeChild(ta);
            }
        });

        var stampa = $('#aigStampa');
        if (stampa) stampa.addEventListener('click', function () { window.print(); });

        // Rail: quale voce è attiva
        var rail = $('#aigRail');
        if (rail && 'IntersectionObserver' in window) {
            var sezioni = $$('section[id]').filter(function (s) {
                return $('#aigRail a[href="#' + s.id + '"]');
            });
            var io = new IntersectionObserver(function (entries) {
                entries.forEach(function (e) {
                    if (!e.isIntersecting) return;
                    $$('#aigRail a').forEach(function (a) {
                        a.classList.toggle('is-attivo', a.getAttribute('href') === '#' + e.target.id);
                    });
                });
            }, { rootMargin: '-45% 0px -50% 0px' });
            sezioni.forEach(function (s) { io.observe(s); });

            // Il rail è fisso e senza fondo proprio: sopra le bande navy i colori
            // pensati per il fondo chiaro sparirebbero. Si osservano TUTTE le sezioni,
            // non solo quelle presenti nel rail, altrimenti attraversando una sezione
            // non osservata la classe resterebbe appesa a quella precedente.
            var io2 = new IntersectionObserver(function (entries) {
                entries.forEach(function (e) {
                    if (!e.isIntersecting) return;
                    rail.classList.toggle('is-su-banda', e.target.classList.contains('aig-band'));
                });
            }, { rootMargin: '-50% 0px -50% 0px' });
            $$('section').forEach(function (s) { io2.observe(s); });
        }

        // Comparsa della heatmap: una sola volta
        var heatWrap = $('#aigHeat');
        if (heatWrap && 'IntersectionObserver' in window) {
            var io2 = new IntersectionObserver(function (entries, obs) {
                entries.forEach(function (e) {
                    if (!e.isIntersecting) return;
                    e.target.classList.add('is-visibile');
                    obs.unobserve(e.target);
                });
            }, { threshold: 0.12 });
            io2.observe(heatWrap);
        } else if (heatWrap) {
            heatWrap.classList.add('is-visibile');
        }

        // Tastiera sulla plancia: 1-4 scelgono l'opzione, le frecce navigano il
        // gruppo radio come previsto per i radiogroup.
        document.addEventListener('keydown', function (ev) {
            var att = document.activeElement;
            if (!att || !att.closest) return;
            var d = att.closest('.aig-domanda');
            if (!d) return;
            var opzioni = $$('.aig-opzione', d);

            if (/^[1-4]$/.test(ev.key)) {
                var scelta = opzioni[parseInt(ev.key, 10) - 1];
                if (scelta) { ev.preventDefault(); scelta.click(); scelta.focus(); }
                return;
            }

            var avanti = ev.key === 'ArrowDown' || ev.key === 'ArrowRight';
            var indietro = ev.key === 'ArrowUp' || ev.key === 'ArrowLeft';
            if (!avanti && !indietro) return;
            if (!att.classList.contains('aig-opzione')) return;

            ev.preventDefault();
            var pos = opzioni.indexOf(att);
            var next = opzioni[(pos + (avanti ? 1 : -1) + opzioni.length) % opzioni.length];
            if (next) { next.click(); next.focus(); }
        });

        render();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
