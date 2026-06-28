// ============================================================
// Fondo Contrasto Deindustrializzazione 2026
// Due simulatori interattivi:
//   1) Verifica requisiti (ammissibilità soggettiva, territoriale, investimento)
//   2) Calcolo contributo in conto impianti e intensità de minimis
// Calcolo interamente lato client, in memoria. Nessun dato in storage.
// Riferimenti: Avviso pubblico, DPCM 19 maggio 2025, Reg. UE 2023/2831.
// ============================================================

(function () {
    'use strict';

    var GOOGLE_SHEET_URL = 'https://script.google.com/macros/s/AKfycbyq8cvS_WNMFTMDi2jFhft-xnqnKjYDvIz5On9pfM66y5dGUzcXYZraAF03CCW-rJ-sQw/exec';

    // Costanti normative (Avviso art. 6, art. 12; Reg. UE 2023/2831).
    var MAX_CONTRIBUTO = 300000;        // massimale per impresa beneficiaria
    var PLAFOND_DE_MINIMIS = 300000;    // plafond de minimis su 3 anni
    var QUOTA_ANTICIPAZIONE = 0.5;      // anticipazione fino al 50 per cento

    var COMUNI = (typeof window !== 'undefined' && window.COMUNI) ? window.COMUNI : [];
    var ATECO_C = (typeof window !== 'undefined' && window.ATECO_C) ? window.ATECO_C : [];

    // --- Helpers DOM ---
    function $(sel, ctx) { return (ctx || document).querySelector(sel); }
    function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

    // --- Formattazione (it-IT) ---
    var EURO_FMT = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
    var PCT_FMT = new Intl.NumberFormat('it-IT', { style: 'percent', maximumFractionDigits: 1 });
    function euro(n) { return EURO_FMT.format(isFinite(n) ? n : 0); }
    function percento(x) { return PCT_FMT.format(isFinite(x) ? x : 0); }
    function fmtInt(n) { return new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 }).format(Math.round(n || 0)); }

    // Parser tollerante: accetta separatore migliaia "." e decimale ",".
    // Stringa vuota -> 0. Restituisce NaN se non interpretabile.
    function parseNum(str) {
        if (str === null || str === undefined) return 0;
        var s = String(str).trim();
        if (s === '') return 0;
        s = s.replace(/[\s€]/g, '');          // spazi e simbolo euro
        s = s.replace(/[^0-9.,\-]/g, '');           // tieni cifre, separatori, segno
        if (s === '' || s === '-') return NaN;
        if (s.indexOf(',') > -1) {                  // virgola = decimale
            s = s.replace(/\./g, '').replace(',', '.');
        } else {                                    // solo punti: trattali come migliaia
            s = s.replace(/\.(?=\d{3}(\D|$))/g, '');
        }
        var n = Number(s);
        return isFinite(n) ? n : NaN;
    }

    // ============================================================
    // LOOKUP COMUNI (addendum sez. D.2)
    // ============================================================
    function normalizza(s) {
        return String(s)
            .toLowerCase()
            .normalize('NFD').replace(/[̀-ͯ]/g, '')   // rimuove accenti
            .replace(/['`’]/g, ' ')                          // apostrofi vari a spazio
            .replace(/\s+/g, ' ')
            .trim();
    }
    function cercaComune(query) {
        var q = normalizza(query);
        if (!q) return null;
        for (var i = 0; i < COMUNI.length; i++) {
            if (normalizza(COMUNI[i].nome) === q) return COMUNI[i];
        }
        return null;
    }
    function suggerisciComuni(query, max) {
        max = max || 8;
        var q = normalizza(query);
        if (!q) return [];
        var starts = [], contains = [];
        for (var i = 0; i < COMUNI.length; i++) {
            var n = normalizza(COMUNI[i].nome);
            if (n.indexOf(q) === 0) starts.push(COMUNI[i]);
            else if (n.indexOf(q) > -1) contains.push(COMUNI[i]);
        }
        return starts.concat(contains).slice(0, max);
    }
    function consorzioShort(c) {
        if (!c) return '';
        return c.consorzio.indexOf('Lazio') > -1 ? 'Lazio' : 'Piceno';
    }

    // ============================================================
    // STATO CONDIVISO (solo in memoria)
    // ============================================================
    var state = {
        comuneObj: null,
        ateco: null,      // codice ATECO scelto su R1 (sezione C)
        req: null,        // esito simulatore 1
        calc: null        // esito simulatore 2
    };
    var lastContrib = 0;  // ultimo contributo stimato (per il pulse)

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // ============================================================
    // SIMULATORE 1: VERIFICA REQUISITI
    // ============================================================
    var STEPS_REQ = ['territorio', 'soggettivi', 'investimento', 'esito'];

    function reqShowStep(name, opts) {
        if (STEPS_REQ.indexOf(name) === -1) return;
        $$('[data-req-panel]').forEach(function (p) {
            p.hidden = (p.getAttribute('data-req-panel') !== name);
        });
        var idx = STEPS_REQ.indexOf(name);
        $$('#reqSteps li').forEach(function (li, i) {
            li.classList.remove('active', 'done');
            if (i < idx) li.classList.add('done');
            if (i === idx) li.classList.add('active');
        });
        var fill = $('#reqProgressFill');
        if (fill) fill.style.width = (((idx + 1) / STEPS_REQ.length) * 100) + '%';

        if (!opts || opts.scroll !== false) {
            var anchor = $('#sim-requisiti');
            if (anchor) anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        // Focus per accessibilità: porta il focus sul titolo del pannello attivo.
        var heading = $('[data-req-panel="' + name + '"] [data-panel-heading]');
        if (heading && (!opts || opts.focus !== false)) {
            heading.setAttribute('tabindex', '-1');
            try { heading.focus({ preventScroll: true }); } catch (e) { heading.focus(); }
        }
    }

    // Legge il valore di un gruppo radio (o null).
    function radioVal(name, ctx) {
        var el = $('input[name="' + name + '"]:checked', ctx);
        return el ? el.value : null;
    }

    // Logica di valutazione (addendum sez. B.2 e B.5).
    function valutaRequisiti() {
        var note = [];
        var bloccante = false, daVerificare = false, parziale = false;
        var ctx = $('#sim-requisiti');

        // 1) Territorio
        var comune = cercaComune(($('#reqComune') ? $('#reqComune').value : '') || '');
        state.comuneObj = comune;
        if (!comune) {
            bloccante = true;
            note.push({ voce: 'Territorio', stato: 'problema',
                testo: 'Il Comune indicato non risulta tra quelli di competenza dei due Consorzi. L\'unità produttiva deve ricadere in un Comune del Consorzio Industriale del Lazio o di Piceno Consind.' });
        } else {
            note.push({ voce: 'Territorio', stato: 'ok',
                testo: comune.consorzio + ' - ' + comune.raggruppamento + '.' });
        }

        // 2) Voci soggettive bloccanti (R1, R2, R3)
        var bloccantiSiNo = [
            ['r1', 'Attività manifatturiera (sezione C ATECO 2025)'],
            ['r2', 'Iscrizione al Registro delle Imprese'],
            ['r3', 'Assenza di liquidazione, fallimento o concordato']
        ];
        bloccantiSiNo.forEach(function (pair) {
            var v = radioVal(pair[0], ctx);
            if (v === null) { parziale = true; daVerificare = true; note.push({ voce: pair[1], stato: 'verifica', testo: 'Risposta non fornita: da completare.' }); }
            else if (v === 'no') { bloccante = true; note.push({ voce: pair[1], stato: 'problema', testo: 'Requisito non soddisfatto.' }); }
            else if (v === 'nonso') { daVerificare = true; note.push({ voce: pair[1], stato: 'verifica', testo: 'Da verificare prima della domanda.' }); }
            else { note.push({ voce: pair[1], stato: 'ok', testo: 'Requisito soddisfatto.' }); }
        });

        // 3) Voci a verifica non bloccanti (R4, R5, R6, R7, R11)
        var verifica = [
            ['r4', 'Regolarità contributiva e fiscale (DURC)'],
            ['r5', 'Assenza di cause ostative antimafia (D.Lgs. 159/2011)'],
            ['r6', 'Assenza di sanzioni interdittive (D.Lgs. 231/2001)'],
            ['r7', 'Assicurazione rischi catastrofali (condizione di accesso ed erogazione)'],
            ['r11', 'Cumulo con altri aiuti di Stato entro il costo ammissibile']
        ];
        verifica.forEach(function (pair) {
            var v = radioVal(pair[0], ctx);
            if (v === 'si') { note.push({ voce: pair[1], stato: 'ok', testo: 'Requisito soddisfatto.' }); }
            else {
                daVerificare = true;
                if (v === null) parziale = true;
                note.push({ voce: pair[1], stato: 'verifica', testo: 'Da verificare o da regolarizzare prima della domanda.' });
            }
        });

        // 4) Investimento: ambiti (R8), periodo spese (R9), beni nuovi non leasing (R10)
        var ambiti = $$('input[name="r8"]:checked', ctx).map(function (c) { return c.value; });
        if (ambiti.length === 0) {
            bloccante = true;
            note.push({ voce: 'Ambiti agevolabili', stato: 'problema', testo: 'Selezionare almeno uno dei cinque ambiti agevolabili.' });
        } else {
            note.push({ voce: 'Ambiti agevolabili', stato: 'ok', testo: ambiti.length + (ambiti.length === 1 ? ' ambito selezionato.' : ' ambiti selezionati.') });
        }

        [['r9', 'Periodo spese 8 maggio 2024 - 31 dicembre 2028'],
         ['r10', 'Beni nuovi di fabbrica, non usati, non in leasing']].forEach(function (pair) {
            var v = radioVal(pair[0], ctx);
            if (v === null) { parziale = true; daVerificare = true; note.push({ voce: pair[1], stato: 'verifica', testo: 'Risposta non fornita: da completare.' }); }
            else if (v === 'no') { bloccante = true; note.push({ voce: pair[1], stato: 'problema', testo: 'Condizione non rispettata.' }); }
            else if (v === 'inparte' || v === 'nonso') { daVerificare = true; note.push({ voce: pair[1], stato: 'verifica', testo: 'Da verificare: è ammissibile solo la parte conforme.' }); }
            else { note.push({ voce: pair[1], stato: 'ok', testo: 'Condizione rispettata.' }); }
        });

        // 5) Altre voci bloccanti binarie (Deggendorf, indipendenza dai fornitori)
        [['r12', 'Assenza dalla lista Deggendorf'],
         ['r13', 'Indipendenza dai fornitori nei 24 mesi (art. 2359 c.c.)']].forEach(function (pair) {
            var v = radioVal(pair[0], ctx);
            if (v === null) { parziale = true; daVerificare = true; note.push({ voce: pair[1], stato: 'verifica', testo: 'Risposta non fornita: da completare.' }); }
            else if (v === 'no') { bloccante = true; note.push({ voce: pair[1], stato: 'problema', testo: 'Requisito non soddisfatto.' }); }
            else if (v === 'nonso') { daVerificare = true; note.push({ voce: pair[1], stato: 'verifica', testo: 'Da verificare prima della domanda.' }); }
            else { note.push({ voce: pair[1], stato: 'ok', testo: 'Requisito soddisfatto.' }); }
        });

        var esito;
        if (bloccante) esito = 'non_ammissibile';
        else if (daVerificare) esito = 'da_verificare';
        else esito = 'ammissibile';

        return { esito: esito, comune: comune, note: note, parziale: parziale };
    }

    function renderReqResult() {
        var r = state.req;
        var emoji, title, summary, tier;

        if (r.esito === 'ammissibile') {
            tier = 'green'; emoji = '✓';
            title = 'Requisiti soddisfatti';
            summary = 'Sulla base delle risposte, rispetti i requisiti chiave del Fondo. Puoi passare alla stima del contributo.';
        } else if (r.esito === 'da_verificare') {
            tier = 'yellow'; emoji = '!';
            title = 'Da verificare';
            summary = 'Non emergono cause di esclusione certe, ma alcuni punti vanno verificati o regolarizzati prima della domanda. Puoi comunque proseguire con la stima del contributo.';
        } else {
            tier = 'red'; emoji = '✕';
            title = 'Requisiti non soddisfatti';
            summary = 'Sulla base delle risposte, almeno una condizione essenziale del Fondo non risulta soddisfatta. Verifica le voci in rosso oppure parla con noi: in molti casi si trova una soluzione.';
        }
        if (r.parziale) {
            summary += ' Attenzione: alcune risposte non sono state fornite, quindi la valutazione è parziale.';
        }

        var c = r.comune;
        var spotName = c ? escapeHtml(c.nome) : 'Comune non in elenco';
        var spotShort = c ? consorzioShort(c) : 'Fuori area';
        var spotStatus = c ? escapeHtml(c.consorzio) : 'Fuori area dei Consorzi';
        var spotSub = c ? escapeHtml(c.raggruppamento) : 'L\'unità produttiva deve ricadere nei Comuni dei due Consorzi.';

        var html = '<div class="result-card result-' + tier + '">';
        html += '<div class="result-spotlight">';
        html +=   '<span class="result-spotlight-label">Esito territoriale</span>';
        html +=   '<div class="result-spotlight-name-row">';
        html +=     '<h3 class="result-spotlight-name">' + spotName + '</h3>';
        html +=     '<span class="result-spotlight-short">' + spotShort + '</span>';
        html +=   '</div>';
        html +=   '<span class="result-spotlight-status">' + spotStatus + '</span>';
        html +=   '<p class="result-spotlight-sub">' + spotSub + '</p>';
        html += '</div>';

        html += '<div class="result-verdict">';
        html +=   '<span class="result-emoji" aria-hidden="true">' + emoji + '</span>';
        html +=   '<div class="result-verdict-body">';
        html +=     '<h4 class="result-verdict-title">' + title + '</h4>';
        html +=     '<p class="result-verdict-summary">' + summary + '</p>';
        html +=   '</div>';
        html += '</div>';

        // Contatori per stato.
        var nKo = r.note.filter(function (n) { return n.stato === 'problema'; }).length;
        var nWarn = r.note.filter(function (n) { return n.stato === 'verifica'; }).length;
        var nOk = r.note.filter(function (n) { return n.stato === 'ok'; }).length;
        html += '<div class="result-counts">';
        html +=   '<span class="rc rc-ok">' + nOk + ' a posto</span>';
        if (nWarn) html += '<span class="rc rc-warn">' + nWarn + ' da verificare</span>';
        if (nKo) html += '<span class="rc rc-ko">' + nKo + ' da risolvere</span>';
        html += '</div>';

        html += '<h4 class="result-checks-title">Punto per punto:</h4>';
        html += '<ul class="result-checks">';
        // Ordina per gravità: prima i problemi, poi le verifiche, infine gli "ok".
        var ordine = { problema: 0, verifica: 1, ok: 2 };
        r.note.slice().sort(function (a, b) { return ordine[a.stato] - ordine[b.stato]; }).forEach(function (n) {
            var cls = n.stato === 'ok' ? 'ck-ok' : (n.stato === 'verifica' ? 'ck-warn' : 'ck-ko');
            var icon = n.stato === 'ok' ? '✓' : (n.stato === 'verifica' ? '!' : '✕');
            html += '<li><span class="ck ' + cls + '">' + icon + '</span><span><strong>' + escapeHtml(n.voce) + ':</strong> ' + escapeHtml(n.testo) + '</span></li>';
        });
        html += '</ul>';
        html += '</div>';

        $('#reqResult').innerHTML = html;

        // Pulsante verso il Simulatore 2 solo se non escluso.
        var toCalc = $('#reqToCalc');
        if (toCalc) toCalc.hidden = (r.esito === 'non_ammissibile');

        // Integrazione: porta il Comune nel calcolo (solo informativo).
        updateComuneInfo();
    }

    function resetReq() {
        state.comuneObj = null;
        state.req = null;
        var ctx = $('#sim-requisiti');
        $$('input[type="radio"]', ctx).forEach(function (r) { r.checked = false; });
        $$('input[type="checkbox"]', ctx).forEach(function (c) { c.checked = false; });
        var comune = $('#reqComune'); if (comune) comune.value = '';
        hideComuneList();
        var err = $('#reqComuneErr'); if (err) { err.hidden = true; err.textContent = ''; }
        var result = $('#reqResult'); if (result) result.innerHTML = '';
        updateComuneInfo();
        reqShowStep('territorio');
    }

    // --- Autocomplete comune ---
    var acItems = [], acActive = -1;
    function hideComuneList() {
        var list = $('#reqComuneList');
        if (list) { list.hidden = true; list.innerHTML = ''; }
        acItems = []; acActive = -1;
        var inp = $('#reqComune');
        if (inp) inp.setAttribute('aria-expanded', 'false');
    }
    function renderComuneList(q) {
        var list = $('#reqComuneList');
        if (!list) return;
        acItems = suggerisciComuni(q, 8);
        acActive = -1;
        if (acItems.length === 0) { hideComuneList(); return; }
        list.innerHTML = acItems.map(function (c, i) {
            return '<li role="option" id="ac-opt-' + i + '" data-idx="' + i + '">' +
                   '<span class="ac-nome">' + escapeHtml(c.nome) + '</span>' +
                   '<span class="ac-cons">' + escapeHtml(consorzioShort(c)) + '</span></li>';
        }).join('');
        list.hidden = false;
        var inp = $('#reqComune');
        if (inp) inp.setAttribute('aria-expanded', 'true');
    }
    function chooseComune(idx) {
        var c = acItems[idx];
        if (!c) return;
        var inp = $('#reqComune');
        inp.value = c.nome;
        state.comuneObj = c;
        hideComuneList();
        var err = $('#reqComuneErr'); if (err) { err.hidden = true; err.textContent = ''; }
        inp.focus();
    }
    function highlightActive() {
        var list = $('#reqComuneList');
        if (!list) return;
        $$('li', list).forEach(function (li, i) {
            li.classList.toggle('active', i === acActive);
            if (i === acActive) li.setAttribute('aria-selected', 'true');
            else li.removeAttribute('aria-selected');
        });
        var inp = $('#reqComune');
        if (inp) inp.setAttribute('aria-activedescendant', acActive >= 0 ? ('ac-opt-' + acActive) : '');
    }

    function initReqAutocomplete() {
        var inp = $('#reqComune');
        var list = $('#reqComuneList');
        if (!inp || !list) return;

        inp.addEventListener('input', function () {
            state.comuneObj = cercaComune(inp.value);
            renderComuneList(inp.value);
        });
        inp.addEventListener('keydown', function (e) {
            if (list.hidden) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); acActive = Math.min(acActive + 1, acItems.length - 1); highlightActive(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); acActive = Math.max(acActive - 1, 0); highlightActive(); }
            else if (e.key === 'Enter') { if (acActive >= 0) { e.preventDefault(); chooseComune(acActive); } }
            else if (e.key === 'Escape') { hideComuneList(); }
        });
        list.addEventListener('mousedown', function (e) {
            var li = e.target.closest('li[data-idx]');
            if (li) { e.preventDefault(); chooseComune(parseInt(li.getAttribute('data-idx'), 10)); }
        });
        document.addEventListener('click', function (e) {
            if (!e.target.closest('.ac-wrap')) hideComuneList();
        });
    }

    function initReqWizard() {
        if (!$('#sim-requisiti')) return;
        initReqAutocomplete();

        var next1 = $('#reqNext1');
        if (next1) next1.addEventListener('click', function () {
            var err = $('#reqComuneErr');
            var c = cercaComune($('#reqComune').value);
            state.comuneObj = c;
            // Non blocchiamo l'avanzamento: il territorio fuori area sarà segnalato
            // nell'esito. Mostriamo però un avviso informativo se non riconosciuto.
            if (!c && $('#reqComune').value.trim() !== '' && err) {
                err.hidden = false;
                err.textContent = 'Comune non riconosciuto tra quelli dei due Consorzi: verrà segnalato come non ammissibile a livello territoriale.';
            } else if (err) { err.hidden = true; err.textContent = ''; }
            reqShowStep('soggettivi');
        });

        var next2 = $('#reqNext2');
        if (next2) next2.addEventListener('click', function () { reqShowStep('investimento'); });

        var evalBtn = $('#reqEval');
        if (evalBtn) evalBtn.addEventListener('click', function () {
            state.req = valutaRequisiti();
            renderReqResult();
            reqShowStep('esito');
        });

        $$('[data-req-back]').forEach(function (btn) {
            btn.addEventListener('click', function () { reqShowStep(btn.getAttribute('data-req-back')); });
        });

        var reset = $('#reqReset');
        if (reset) reset.addEventListener('click', function () {
            if (confirm('Azzerare la verifica dei requisiti? Le risposte verranno cancellate.')) resetReq();
        });

        var toCalc = $('#reqToCalc');
        if (toCalc) toCalc.addEventListener('click', function () {
            updateComuneInfo();
            var target = $('#sim-contributo');
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            var firstField = $('#cOpere');
            if (firstField) setTimeout(function () { try { firstField.focus(); } catch (e) {} }, 400);
        });

        reqShowStep('territorio', { scroll: false, focus: false });
    }

    // ============================================================
    // ATECO sezione C: helper di conferma del requisito R1
    // ============================================================
    function atecoDigits(s) { return String(s).replace(/[^\d.]/g, ''); }
    function atecoInC(code) {
        var m = String(code).replace(/\./g, '').match(/^\d{2}/);
        if (!m) return false;
        var n = parseInt(m[0], 10);
        return n >= 10 && n <= 33;
    }
    function atecoSuggerisci(query, max) {
        max = max || 8;
        var q = String(query || '').trim();
        if (!q) return [];
        var qd = atecoDigits(q).replace(/\./g, '');
        var qn = normalizza(q);
        var res = [];
        if (qd.length >= 2) {
            res = ATECO_C.filter(function (e) { return e.c.replace(/\./g, '').indexOf(qd) === 0; });
        }
        if (res.length < max && qn.length >= 2) {
            ATECO_C.forEach(function (e) {
                if (res.indexOf(e) === -1 && normalizza(e.t).indexOf(qn) > -1) res.push(e);
            });
        }
        return res.slice(0, max);
    }

    function initR1Ateco() {
        var inp = $('#r1Ateco'); var list = $('#r1AtecoList'); var msg = $('#r1AtecoMsg');
        if (!inp || !list) return;
        var items = [], active = -1;

        function hide() { list.hidden = true; list.innerHTML = ''; items = []; active = -1; inp.setAttribute('aria-expanded', 'false'); }
        function render(q) {
            items = atecoSuggerisci(q, 8); active = -1;
            if (!items.length) { hide(); return; }
            list.innerHTML = items.map(function (e, i) {
                return '<li role="option" id="ateco-opt-' + i + '" data-idx="' + i + '">' +
                       '<span class="ac-nome">' + escapeHtml(e.t) + '</span>' +
                       '<span class="ac-cons">' + escapeHtml(e.c) + '</span></li>';
            }).join('');
            list.hidden = false; inp.setAttribute('aria-expanded', 'true');
        }
        function choose(i) {
            var e = items[i]; if (!e) return;
            inp.value = e.c + ' - ' + e.t;
            state.ateco = e;
            var r1si = $('input[name="r1"][value="si"]'); if (r1si) r1si.checked = true;
            if (msg) {
                msg.hidden = false; msg.className = 'req-note req-note-ok';
                msg.innerHTML = 'Codice <strong>' + escapeHtml(e.c) + '</strong>: ' + escapeHtml(e.t) +
                    '. Rientra nella sezione C manifatturiera: requisito soddisfatto.';
            }
            hide(); inp.focus();
        }
        function highlight() {
            $$('li', list).forEach(function (li, i) { li.classList.toggle('active', i === active); });
            inp.setAttribute('aria-activedescendant', active >= 0 ? ('ateco-opt-' + active) : '');
        }

        inp.addEventListener('input', function () {
            render(inp.value);
            var raw = inp.value.trim();
            var qd = atecoDigits(raw).replace(/\./g, '');
            if (!msg) return;
            if (raw === '') { state.ateco = null; msg.hidden = true; msg.innerHTML = ''; return; }
            // Avviso solo per chi digita un codice numerico chiaramente fuori sezione C.
            if (qd.length >= 2 && !atecoInC(qd)) {
                msg.hidden = false; msg.className = 'req-note req-note-warn';
                msg.innerHTML = 'Il codice digitato non risulta nella sezione C (manifatturiera): verifica il tuo codice ATECO.';
            } else if (!state.ateco) {
                msg.hidden = true; msg.innerHTML = '';
            }
        });
        inp.addEventListener('keydown', function (e) {
            if (list.hidden) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, items.length - 1); highlight(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); highlight(); }
            else if (e.key === 'Enter') { if (active >= 0) { e.preventDefault(); choose(active); } }
            else if (e.key === 'Escape') { hide(); }
        });
        list.addEventListener('mousedown', function (e) {
            var li = e.target.closest('li[data-idx]');
            if (li) { e.preventDefault(); choose(parseInt(li.getAttribute('data-idx'), 10)); }
        });
        document.addEventListener('click', function (e) {
            if (e.target !== inp && !list.contains(e.target)) hide();
        });
    }

    // ============================================================
    // SIMULATORE 2: CALCOLO CONTRIBUTO E INTENSITÀ
    // ============================================================
    function calcolaContributo(input) {
        var opereMurarie = Number(input.opereMurarie) || 0;
        var macchinariImpianti = Number(input.macchinariImpianti) || 0;
        var immateriali = Number(input.immateriali) || 0;

        var speseAmmissibili = opereMurarie + macchinariImpianti + immateriali;
        if (input.ivaIndetraibile) {
            var aliquota = (Number(input.aliquotaIva) || 22) / 100;
            speseAmmissibili = speseAmmissibili * (1 + aliquota);
        }

        var speseNonAmmissibili = Number(input.speseNonAmmissibili) || 0;
        var deMinimisPregresso = Number(input.deMinimisPregresso) || 0;

        var investimentoTotale = speseAmmissibili + speseNonAmmissibili;
        var contributoTeorico = speseAmmissibili; // intensità 100 per cento
        var plafondResiduo = Math.max(0, PLAFOND_DE_MINIMIS - deMinimisPregresso);

        var contributoStimato = Math.max(0, Math.min(contributoTeorico, MAX_CONTRIBUTO, plafondResiduo));

        var intensitaSuAmmissibili = speseAmmissibili > 0 ? contributoStimato / speseAmmissibili : 0;
        var intensitaSuTotale = investimentoTotale > 0 ? contributoStimato / investimentoTotale : 0;
        var quotaImpresa = investimentoTotale - contributoStimato;
        var anticipazioneMax = contributoStimato * QUOTA_ANTICIPAZIONE;

        var avvisi = [];
        if (speseAmmissibili === 0) avvisi.push('Non sono state inserite spese ammissibili: il contributo stimato è pari a zero.');
        if (plafondResiduo === 0) avvisi.push('Il plafond de minimis risulta esaurito: con i de minimis già ricevuti il contributo non è disponibile.');
        if (speseAmmissibili > MAX_CONTRIBUTO) avvisi.push('Il contributo è limitato dal massimale di 300.000 euro per impresa: l\'eccedenza resta a carico dell\'impresa.');
        if (plafondResiduo > 0 && plafondResiduo < Math.min(speseAmmissibili, MAX_CONTRIBUTO)) avvisi.push('Il contributo è limitato dal plafond de minimis residuo.');

        return {
            speseAmmissibili: speseAmmissibili,
            speseNonAmmissibili: speseNonAmmissibili,
            investimentoTotale: investimentoTotale,
            contributoTeorico: contributoTeorico,
            plafondResiduo: plafondResiduo,
            contributoStimato: contributoStimato,
            intensitaSuAmmissibili: intensitaSuAmmissibili,
            intensitaSuTotale: intensitaSuTotale,
            quotaImpresa: quotaImpresa,
            anticipazioneMax: anticipazioneMax,
            avvisi: avvisi
        };
    }

    // Legge gli input, valida e (se ok) calcola. Restituisce {errors, input, result}.
    function readCalcInputs() {
        var fields = [
            { id: 'cOpere', key: 'opereMurarie', label: 'Opere murarie' },
            { id: 'cMacchinari', key: 'macchinariImpianti', label: 'Macchinari e impianti' },
            { id: 'cImmateriali', key: 'immateriali', label: 'Immobilizzazioni immateriali' },
            { id: 'cNonAmm', key: 'speseNonAmmissibili', label: 'Altre spese non ammissibili' },
            { id: 'cDeMinimis', key: 'deMinimisPregresso', label: 'De minimis già ricevuti' }
        ];
        var input = {}, errors = [];
        fields.forEach(function (f) {
            var el = $('#' + f.id);
            var n = parseNum(el ? el.value : '');
            if (isNaN(n)) { errors.push({ id: f.id, msg: f.label + ': inserire un numero valido.' }); }
            else if (n < 0) { errors.push({ id: f.id, msg: f.label + ': il valore non può essere negativo.' }); }
            input[f.key] = isNaN(n) ? 0 : n;
            markFieldError(f.id, isNaN(n) || n < 0);
        });

        var ivaOn = $('#cIva') ? $('#cIva').checked : false;
        input.ivaIndetraibile = ivaOn;
        if (ivaOn) {
            var aliq = parseNum($('#cAliquota') ? $('#cAliquota').value : '22');
            if (isNaN(aliq) || aliq < 0 || aliq > 100) {
                errors.push({ id: 'cAliquota', msg: 'Aliquota IVA: inserire un valore tra 0 e 100.' });
                markFieldError('cAliquota', true);
            } else { markFieldError('cAliquota', false); }
            input.aliquotaIva = (isNaN(aliq) ? 22 : aliq);
        } else {
            markFieldError('cAliquota', false);
            input.aliquotaIva = 22;
        }
        return { errors: errors, input: input };
    }

    function markFieldError(id, isErr) {
        var el = $('#' + id);
        if (!el) return;
        el.classList.toggle('input-error', !!isErr);
        el.setAttribute('aria-invalid', isErr ? 'true' : 'false');
    }

    function recomputeCalc() {
        var read = readCalcInputs();
        var errBox = $('#cErrori');
        if (read.errors.length > 0) {
            if (errBox) {
                errBox.hidden = false;
                errBox.innerHTML = '<strong>Controlla i campi:</strong><ul>' +
                    read.errors.map(function (e) { return '<li>' + escapeHtml(e.msg) + '</li>'; }).join('') + '</ul>';
            }
            var out = $('#cRisultati'); if (out) out.setAttribute('aria-busy', 'true');
            state.calc = null;
            renderCalc(null);
            return;
        }
        if (errBox) { errBox.hidden = true; errBox.innerHTML = ''; }

        var res = calcolaContributo(read.input);
        state.calc = res;
        renderCalc(res);
    }

    function renderCalc(res) {
        var out = $('#cRisultati');
        if (!out) return;
        if (!res) {
            out.innerHTML = '<div class="calc-empty">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="11" y2="10"/><line x1="14" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="11" y2="14"/><line x1="14" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="11" y2="18"/></svg>' +
                '<p>Qui comparirà il tuo <strong>contributo stimato</strong>, fino a 300.000 euro. Inserisci gli importi delle spese per vederlo.</p>' +
                '</div>';
            out.setAttribute('aria-busy', 'false');
            updateNudge(null);
            lastContrib = 0;
            return;
        }

        // Toggle IVA: nota a fianco dell'aliquota
        var aliqWrap = $('#cAliquotaWrap');
        if (aliqWrap) aliqWrap.hidden = !($('#cIva') && $('#cIva').checked);

        var html = '';

        // KPI principali
        html += '<div class="calc-kpis">';
        html +=   '<div class="calc-kpi calc-kpi-main">';
        html +=     '<span class="calc-kpi-label">Contributo stimato</span>';
        html +=     '<span class="calc-kpi-value">' + euro(res.contributoStimato) + '</span>';
        html +=     '<span class="calc-kpi-foot">contributo in conto impianti, aiuto de minimis</span>';
        html +=   '</div>';
        html +=   '<div class="calc-kpi">';
        html +=     '<span class="calc-kpi-label">Intensità sulle spese ammissibili</span>';
        html +=     '<span class="calc-kpi-value">' + percento(res.intensitaSuAmmissibili) + '</span>';
        html +=     '<span class="calc-kpi-foot">fino al 100 per cento</span>';
        html +=   '</div>';
        html +=   '<div class="calc-kpi">';
        html +=     '<span class="calc-kpi-label">Anticipazione massima</span>';
        html +=     '<span class="calc-kpi-value">' + euro(res.anticipazioneMax) + '</span>';
        html +=     '<span class="calc-kpi-foot">50 per cento, con garanzia fideiussoria</span>';
        html +=   '</div>';
        html += '</div>';

        // Barra di composizione dell'investimento
        if (res.investimentoTotale > 0) {
            var pctContrib = res.contributoStimato / res.investimentoTotale;
            var pctImpresa = 1 - pctContrib;
            html += '<div class="calc-bar-block">';
            html +=   '<span class="calc-bar-title">Composizione dell\'investimento totale</span>';
            html +=   '<div class="calc-bar" role="img" aria-label="Contributo ' + percento(pctContrib) + ', quota a carico dell\'impresa ' + percento(pctImpresa) + '">';
            if (pctContrib > 0) html += '<span class="calc-bar-seg calc-bar-contrib" style="width:' + (pctContrib * 100) + '%"></span>';
            if (pctImpresa > 0) html += '<span class="calc-bar-seg calc-bar-impresa" style="width:' + (pctImpresa * 100) + '%"></span>';
            html +=   '</div>';
            html +=   '<div class="calc-bar-legend">';
            html +=     '<span><span class="lg lg-contrib"></span> Contributo: ' + euro(res.contributoStimato) + ' (' + percento(pctContrib) + ')</span>';
            html +=     '<span><span class="lg lg-impresa"></span> A carico impresa: ' + euro(res.quotaImpresa) + ' (' + percento(pctImpresa) + ')</span>';
            html +=   '</div>';
            html += '</div>';
        }

        // Barra del plafond de minimis (300.000 euro su 3 anni mobili)
        var plf = PLAFOND_DE_MINIMIS;
        var pregresso = Math.max(0, plf - res.plafondResiduo);
        var questo = res.contributoStimato;
        var residuoFinale = Math.max(0, res.plafondResiduo - res.contributoStimato);
        html += '<div class="calc-bar-block">';
        html +=   '<span class="calc-bar-title">Plafond de minimis dell\'impresa unica (300.000 &euro; in 3 anni)</span>';
        html +=   '<div class="calc-bar" role="img" aria-label="Già ricevuto ' + euro(pregresso) + ', questo contributo ' + euro(questo) + ', residuo ' + euro(residuoFinale) + '">';
        if (pregresso > 0) html += '<span class="calc-bar-seg calc-bar-pregresso" style="width:' + (pregresso / plf * 100) + '%"></span>';
        if (questo > 0) html += '<span class="calc-bar-seg calc-bar-contrib" style="width:' + (questo / plf * 100) + '%"></span>';
        if (residuoFinale > 0) html += '<span class="calc-bar-seg calc-bar-residuo" style="width:' + (residuoFinale / plf * 100) + '%"></span>';
        html +=   '</div>';
        html +=   '<div class="calc-bar-legend">';
        if (pregresso > 0) html += '<span><span class="lg lg-pregresso"></span> Già ricevuto: ' + euro(pregresso) + '</span>';
        html +=     '<span><span class="lg lg-contrib"></span> Questo contributo: ' + euro(questo) + '</span>';
        html +=     '<span><span class="lg lg-residuo"></span> Residuo: ' + euro(residuoFinale) + '</span>';
        html +=   '</div>';
        html += '</div>';

        // Dettaglio voci
        html += '<dl class="calc-detail">';
        html += row('Spese ammissibili totali', euro(res.speseAmmissibili));
        if (res.speseNonAmmissibili > 0) html += row('Spese non ammissibili', euro(res.speseNonAmmissibili));
        html += row('Investimento totale', euro(res.investimentoTotale));
        html += row('Contributo teorico (100% delle spese ammissibili)', euro(res.contributoTeorico));
        html += row('Plafond de minimis residuo', euro(res.plafondResiduo));
        html += row('Intensità sull\'investimento totale', percento(res.intensitaSuTotale));
        html += row('Quota a carico dell\'impresa', euro(res.quotaImpresa));
        html += '</dl>';

        // Avvisi
        if (res.avvisi.length > 0) {
            html += '<div class="calc-avvisi">';
            res.avvisi.forEach(function (a) {
                html += '<p class="calc-avviso"><span aria-hidden="true">!</span> ' + escapeHtml(a) + '</p>';
            });
            html += '</div>';
        }

        out.innerHTML = html;
        out.setAttribute('aria-busy', 'false');

        // Pulse sul contributo quando diventa positivo per la prima volta.
        var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!reduce && res.contributoStimato > 0 && lastContrib <= 0) {
            var main = out.querySelector('.calc-kpi-main');
            if (main) { main.classList.add('pulse'); setTimeout(function () { main.classList.remove('pulse'); }, 800); }
        }
        lastContrib = res.contributoStimato;
        updateNudge(res);

        function row(label, val) {
            return '<div class="calc-row"><dt>' + escapeHtml(label) + '</dt><dd>' + val + '</dd></div>';
        }
    }

    function updateNudge(res) {
        var box = $('#cCtaNudge');
        if (!box) return;
        if (res && res.contributoStimato > 0) {
            box.hidden = false;
            box.innerHTML = 'Hai stimato un contributo fino a <strong>' + euro(res.contributoStimato) +
                '</strong>. Le domande sono valutate in ordine cronologico: prepariamoci insieme per arrivare pronti.';
        } else {
            box.hidden = true; box.innerHTML = '';
        }
    }

    function updateComuneInfo() {
        var box = $('#cComuneInfo');
        if (!box) return;
        var c = state.comuneObj;
        if (c) {
            box.hidden = false;
            box.innerHTML = 'Unità produttiva indicata nella verifica: <strong>' + escapeHtml(c.nome) +
                '</strong> &middot; ' + escapeHtml(c.consorzio) + '.';
        } else {
            box.hidden = true;
            box.innerHTML = '';
        }
    }

    function resetCalc() {
        ['cOpere', 'cMacchinari', 'cImmateriali', 'cNonAmm', 'cDeMinimis'].forEach(function (id) {
            var el = $('#' + id); if (el) el.value = '';
            markFieldError(id, false);
        });
        var iva = $('#cIva'); if (iva) iva.checked = false;
        var aliq = $('#cAliquota'); if (aliq) aliq.value = '22';
        markFieldError('cAliquota', false);
        state.calc = null;
        recomputeCalc();
    }

    function initCalc() {
        if (!$('#sim-contributo')) return;
        $$('#sim-contributo input').forEach(function (el) {
            el.addEventListener('input', recomputeCalc);
            el.addEventListener('change', recomputeCalc);
        });
        // Formattazione con separatore delle migliaia (solo sui campi in euro, al blur).
        ['cOpere', 'cMacchinari', 'cImmateriali', 'cNonAmm', 'cDeMinimis'].forEach(function (id) {
            var el = $('#' + id);
            if (!el) return;
            el.addEventListener('blur', function () {
                if (el.value.trim() === '') return;
                var n = parseNum(el.value);
                if (isNaN(n) || n < 0) return;
                el.value = new Intl.NumberFormat('it-IT', { maximumFractionDigits: (n % 1 ? 2 : 0) }).format(n);
            });
        });
        var reset = $('#cReset');
        if (reset) reset.addEventListener('click', function () { resetCalc(); });
        updateComuneInfo();
        recomputeCalc();
    }

    // ============================================================
    // STATO DELLA MISURA (banner calcolato dalle date ufficiali)
    // Per forzare lo stato impostare STATO_OVERRIDE a:
    // 'apertura' | 'registrazione' | 'aperto' | 'chiuso'.
    // ============================================================
    var STATO_OVERRIDE = null;
    function statoMisura() {
        if (STATO_OVERRIDE) return STATO_OVERRIDE;
        var now = new Date();
        var reg = new Date('2026-07-31T12:00:00');
        var apri = new Date('2026-08-31T12:00:00');
        var chiudi = new Date('2026-10-30T12:00:00');
        if (now < reg) return 'apertura';
        if (now < apri) return 'registrazione';
        if (now < chiudi) return 'aperto';
        return 'chiuso';
    }
    function initStatoBanner() {
        var el = $('#statoBanner');
        if (!el) return;
        var map = {
            apertura: { cls: 'stato-apertura', pill: 'In apertura', txt: 'Registrazione alla piattaforma Invitalia dal <strong>31 luglio 2026</strong>, sportello domande dal <strong>31 agosto</strong> al <strong>30 ottobre 2026</strong>.' },
            registrazione: { cls: 'stato-registrazione', pill: 'Registrazione aperta', txt: 'Registrazione attiva sulla piattaforma Invitalia: lo sportello per le domande apre il <strong>31 agosto 2026 ore 12:00</strong>.' },
            aperto: { cls: 'stato-aperto', pill: 'Sportello aperto', txt: 'Domande aperte fino alle <strong>ore 12:00 del 30 ottobre 2026</strong>, in ordine cronologico fino a esaurimento delle risorse.' },
            chiuso: { cls: 'stato-chiuso', pill: 'Sportello chiuso', txt: 'Lo sportello per la presentazione delle domande è chiuso. Verifica eventuali aggiornamenti sulle fonti ufficiali.' }
        };
        var m = map[statoMisura()] || map.apertura;
        el.className = 'event-banner ' + m.cls;
        el.innerHTML = '<div class="container event-banner-inner">' +
            '<span class="event-banner-pill">' + m.pill + '</span>' +
            '<span class="event-banner-text">' + m.txt + '</span></div>';
    }

    // ============================================================
    // INVIO FORM (Google Sheets)
    // ============================================================
    function tierLabelReq(esito) {
        if (esito === 'ammissibile') return 'Requisiti soddisfatti';
        if (esito === 'da_verificare') return 'Da verificare';
        if (esito === 'non_ammissibile') return 'Requisiti non soddisfatti';
        return 'non eseguita';
    }

    function buildSummaryMessage() {
        // IMPORTANT: nessuna riga deve iniziare con = + - @ (Google Sheets
        // le interpreterebbe come formula).
        var lines = [];
        lines.push('Richiesta dalla pagina Fondo Contrasto Deindustrializzazione 2026.');

        if (state.req) {
            lines.push('Verifica requisiti: ' + tierLabelReq(state.req.esito) + (state.req.parziale ? ' (valutazione parziale)' : ''));
            if (state.req.comune) {
                lines.push('Comune unità produttiva: ' + state.req.comune.nome + ' (' + state.req.comune.consorzio + ')');
            } else {
                lines.push('Comune unità produttiva: non in elenco o non indicato.');
            }
        } else {
            lines.push('Verifica requisiti: non eseguita.');
        }
        if (state.ateco) {
            lines.push('Codice ATECO indicato: ' + state.ateco.c + ' - ' + state.ateco.t + ' (sezione C)');
        }

        if (state.calc) {
            lines.push('Spese ammissibili: ' + Math.round(state.calc.speseAmmissibili) + ' EUR');
            lines.push('Investimento totale: ' + Math.round(state.calc.investimentoTotale) + ' EUR');
            lines.push('Contributo stimato: ' + Math.round(state.calc.contributoStimato) + ' EUR');
            lines.push('Intensità su spese ammissibili: ' + (Math.round(state.calc.intensitaSuAmmissibili * 1000) / 10) + '%');
            lines.push('Quota a carico impresa: ' + Math.round(state.calc.quotaImpresa) + ' EUR');
            lines.push('Anticipazione massima: ' + Math.round(state.calc.anticipazioneMax) + ' EUR');
        } else {
            lines.push('Calcolo contributo: non eseguito.');
        }
        return lines.join('\n');
    }

    function wireForms() {
        $$('form[data-pagina]').forEach(function (form) {
            if (form.dataset.wired === '1') return;
            form.dataset.wired = '1';
            form.addEventListener('submit', handleFormSubmit);
        });
    }

    function handleFormSubmit(e) {
        e.preventDefault();
        var form = e.currentTarget;
        var fd = new FormData(form);
        var data = {};
        fd.forEach(function (v, k) { data[k] = v; });

        if (!data.nome || !data.cognome || !data.email || !data.azienda || !data.ruolo) {
            showNotification('Compila tutti i campi obbligatori.', 'error');
            return;
        }
        if (!data.privacy) {
            showNotification('Devi accettare il trattamento dei dati personali.', 'error');
            return;
        }

        var btn = form.querySelector('button[type="submit"]');
        var originalText = btn ? btn.textContent : '';
        if (btn) { btn.textContent = 'Invio in corso...'; btn.disabled = true; }

        var n = new Date();
        var pad = function (x) { return String(x).padStart(2, '0'); };
        var ts = pad(n.getDate()) + '/' + pad(n.getMonth() + 1) + '/' + n.getFullYear() +
                 ' ' + pad(n.getHours()) + ':' + pad(n.getMinutes()) + ':' + pad(n.getSeconds());

        var jsonData = {
            data: ts,
            pagina: form.dataset.pagina || 'Fondo Contrasto Deindustrializzazione 2026 - Contatto',
            nome: data.nome,
            cognome: data.cognome,
            email: data.email,
            azienda: data.azienda,
            ruolo: data.ruolo,
            telefono: data.telefono || '',
            messaggio: buildSummaryMessage(),
            privacy: !!data.privacy,
            marketing: !!data.marketing
        };

        fetch(GOOGLE_SHEET_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(jsonData)
        }).then(function () {
            showNotification('Grazie! La richiesta è stata registrata. Ti contatteremo a breve.', 'success');
            form.reset();
        }).catch(function () {
            showNotification('Errore di connessione. Riprova o scrivici a info@nextgenerationbusiness.it', 'error');
        }).finally(function () {
            if (btn) { btn.textContent = originalText; btn.disabled = false; }
        });
    }

    // ============================================================
    // NAVBAR + NOTIFICHE (allineate al resto del sito)
    // ============================================================
    function initNavbar() {
        var navbar = $('#navbar');
        if (navbar) {
            window.addEventListener('scroll', function () {
                if (window.scrollY > 50) navbar.classList.add('scrolled');
                else navbar.classList.remove('scrolled');
            });
        }
        var hamb = $('#hamburger');
        var nav = $('#navLinks');
        if (hamb && nav) {
            hamb.addEventListener('click', function () {
                hamb.classList.toggle('active');
                nav.classList.toggle('active');
            });
            $$('a', nav).forEach(function (a) {
                a.addEventListener('click', function () {
                    hamb.classList.remove('active');
                    nav.classList.remove('active');
                });
            });
        }
        $$('a[href^="#"]').forEach(function (a) {
            a.addEventListener('click', function (e) {
                var href = a.getAttribute('href');
                if (href.length <= 1) return;
                var target = document.querySelector(href);
                if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth' }); }
            });
        });
    }

    function showNotification(message, type) {
        var existing = document.querySelector('.notification');
        if (existing) existing.remove();
        var n = document.createElement('div');
        n.className = 'notification notification-' + type;
        n.setAttribute('role', 'status');
        n.innerHTML = '<span>' + message + '</span><button aria-label="Chiudi">&times;</button>';
        Object.assign(n.style, {
            position: 'fixed', bottom: '24px', right: '24px',
            maxWidth: '420px', padding: '16px 24px', borderRadius: '12px',
            display: 'flex', alignItems: 'center', gap: '12px',
            zIndex: '9999', fontSize: '0.95rem', fontFamily: 'Inter, sans-serif',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            background: type === 'success' ? '#065f46' : '#7f1d1d',
            color: '#f1f5f9',
            border: '1px solid ' + (type === 'success' ? '#10b981' : '#ef4444')
        });
        var closeBtn = n.querySelector('button');
        Object.assign(closeBtn.style, { background: 'none', border: 'none', color: '#cbd5e1', fontSize: '1.3rem', cursor: 'pointer', padding: '0', lineHeight: '1' });
        closeBtn.addEventListener('click', function () { n.remove(); });
        document.body.appendChild(n);
        setTimeout(function () {
            n.style.opacity = '0';
            n.style.transform = 'translateY(12px)';
            n.style.transition = '0.3s ease-out';
            setTimeout(function () { n.remove(); }, 300);
        }, 5000);
    }

    // ============================================================
    // RIVELAZIONE AL SCROLL (usa .fade-in/.visible della base)
    // La classe .fade-in viene aggiunta via JS: senza JS i contenuti
    // restano visibili. Rispetta prefers-reduced-motion.
    // ============================================================
    function initReveal() {
        var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce || !('IntersectionObserver' in window)) return;
        var targets = $$('.section-header, .ambito, .bando-summary, .area-card, .sim-heading, .trust-band, .faq-item, .sim-overview, .territorio-total, .spese-cols .bando-block');
        if (!targets.length) return;
        targets.forEach(function (el) { el.classList.add('fade-in'); });
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) {
                if (en.isIntersecting) { en.target.classList.add('visible'); io.unobserve(en.target); }
            });
        }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
        targets.forEach(function (el) { io.observe(el); });
        // Failsafe: rivela tutto dopo 2,5s nel caso l'osservatore non scatti.
        setTimeout(function () { targets.forEach(function (el) { el.classList.add('visible'); }); }, 2500);
    }

    // ============================================================
    // INIT
    // ============================================================
    document.addEventListener('DOMContentLoaded', function () {
        initStatoBanner();
        initNavbar();
        initReqWizard();
        initR1Ateco();
        initCalc();
        wireForms();
        initReveal();
    });

})();
