// ============================================
// Bandi Lazio 2026 - simulatore interattivo
// State machine + eligibility + simulazione finanziaria
// ============================================

(function () {
    'use strict';

    var GOOGLE_SHEET_URL = 'https://script.google.com/macros/s/AKfycbyq8cvS_WNMFTMDi2jFhft-xnqnKjYDvIz5On9pfM66y5dGUzcXYZraAF03CCW-rJ-sQw/exec';

    // --- State ---
    var STEPS = ['routing', 'eligibility', 'result', 'simulator', 'lead'];
    var state = {
        step: 'routing',
        bando: null,
        routingChoice: null,
        elig: {},
        result: null,
        sim: {
            amount: 0,
            durataTot: 0, durataPreamm: 12, durataAmm: 0,
            rata: 0, totale: 0, abbuono: 0,
            useAbbuono: true
        }
    };

    // ATECO macro-categorie tipicamente escluse (Appendice 4 NFPC, semplificata).
    var ATECO_ESCLUSI = ['12', '64', '65', '66', '92'];

    var BANDI = {
        nfpc: {
            label: 'Nuovo Fondo Piccolo Credito',
            short: 'NFPC',
            min: 10000, max: 50000, step: 1000, defaultAmount: 25000,
            durataAmm: 48,
            hasAbbuono: false,
            hasTranche: false,
            tasso: 0
        },
        nff: {
            label: 'Nuovo Fondo Futuro',
            short: 'NFF',
            min: 5000, max: 25000, step: 500, defaultAmount: 15000,
            durataAmm: 60,
            hasAbbuono: true,
            hasTranche: true,
            tasso: 0
        }
    };

    // --- Helpers ---
    function $(sel, ctx) { return (ctx || document).querySelector(sel); }
    function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
    function fmtEur(n) { return '€ ' + Math.round(n).toLocaleString('it-IT'); }
    function fmtEurNoSym(n) { return Math.round(n).toLocaleString('it-IT') + ' €'; }

    // ============================================
    // STEP NAVIGATION
    // ============================================
    function showStep(name, opts) {
        if (STEPS.indexOf(name) === -1) return;
        state.step = name;

        $$('[data-step-panel]').forEach(function (panel) {
            panel.hidden = (panel.getAttribute('data-step-panel') !== name);
        });

        var idx = STEPS.indexOf(name);
        $$('.wizard-steps li').forEach(function (li, i) {
            li.classList.remove('active', 'done');
            if (i < idx) li.classList.add('done');
            if (i === idx) li.classList.add('active');
        });
        var pct = ((idx + 1) / STEPS.length) * 100;
        var fill = $('#wizardProgressFill');
        if (fill) fill.style.width = pct + '%';

        // Scroll into view (skip on initial load)
        if (!opts || opts.scroll !== false) {
            var sim = $('#simulatore');
            if (sim) sim.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    // ============================================
    // RESET
    // ============================================
    function resetWizard() {
        state.bando = null;
        state.routingChoice = null;
        state.elig = {};
        state.result = null;
        state.sim = {
            amount: 0,
            durataTot: 0, durataPreamm: 12, durataAmm: 0,
            rata: 0, totale: 0, abbuono: 0,
            useAbbuono: true
        };

        // Clear all radio/text inputs in the wizard
        $$('input[type="radio"]', $('#simulatore')).forEach(function (r) { r.checked = false; });
        var ateco = $('#nfpcAteco');
        if (ateco) ateco.value = '';

        // Reset routing button
        var nb = $('#routingNext');
        if (nb) nb.disabled = true;
        var hint = $('#routingHint');
        if (hint) { hint.hidden = true; hint.innerHTML = ''; }
        var en = $('#eligibilityNext');
        if (en) en.disabled = true;

        showStep('routing');
    }

    // ============================================
    // STEP 1: ROUTING
    // ============================================
    function initRouting() {
        var radios = $$('input[name="routing"]');
        var hint = $('#routingHint');
        var nextBtn = $('#routingNext');

        radios.forEach(function (r) {
            r.addEventListener('change', function () {
                state.routingChoice = r.value;
                state.bando = decideBando(r.value);

                hint.hidden = false;
                hint.innerHTML = renderRoutingHint(r.value, state.bando);
                nextBtn.disabled = false;
            });
        });

        nextBtn.addEventListener('click', function () {
            if (!state.bando) return;
            prepareEligibilityStep();
            showStep('eligibility');
        });
    }

    function decideBando(routing) {
        if (routing === 'costituenda' || routing === 'under36') return 'nff';
        if (routing === 'over36') return 'nfpc';
        return 'nfpc';
    }

    function renderRoutingHint(routing, bando) {
        var b = BANDI[bando];
        if (routing === 'costituenda') {
            return '<strong>Il bando giusto per te e il ' + b.label + '.</strong> ' +
                   'E pensato per chi sta avviando un\'attivita o vuole aprirla a breve.';
        }
        if (routing === 'under36') {
            return '<strong>Il bando giusto per te e il ' + b.label + '.</strong> ' +
                   'Riguarda le microimprese aperte da meno di 3 anni e i liberi professionisti con partita IVA recente.';
        }
        if (routing === 'over36') {
            return '<strong>Il bando giusto per te e il ' + b.label + '.</strong> ' +
                   'E un finanziamento a tasso zero per imprese gia avviate da almeno 2 anni.';
        }
        return '<strong>Proviamo con il ' + b.label + ' come prima ipotesi.</strong> ' +
               'Dalle prossime risposte capiremo se invece l\'altro bando e piu adatto al tuo caso. Puoi sempre tornare indietro.';
    }

    // ============================================
    // STEP 2: ELIGIBILITY
    // ============================================
    function prepareEligibilityStep() {
        var label = BANDI[state.bando].label;
        $('#eligibilityBandoLabel').textContent = label;
        $('#eligibilityTitle').textContent = 'Hai i requisiti per il ' + label + '?';

        var lead;
        if (state.bando === 'nfpc') {
            lead = 'Rispondi a 6 domande veloci. Bastano due minuti. ' +
                   'Le risposte restano sul tuo dispositivo: non salviamo nulla finche non invii tu il modulo finale.';
        } else {
            lead = 'Rispondi a 5 domande veloci. Bastano due minuti. ' +
                   'Le risposte restano sul tuo dispositivo: non salviamo nulla finche non invii tu il modulo finale.';
        }
        $('#eligibilityLead').textContent = lead;

        $('[data-eligibility="nfpc"]').hidden = (state.bando !== 'nfpc');
        $('[data-eligibility="nff"]').hidden = (state.bando !== 'nff');

        wireEligibility();
    }

    function wireEligibility() {
        var prefix = state.bando + '-';
        var requiredFields;
        if (state.bando === 'nfpc') {
            requiredFields = ['sede', 'forma', 'bilanci', 'espo', 'mpmi'];
        } else {
            requiredFields = ['sede', 'forma', 'compagine', 'eta', 'importo'];
        }

        function recompute() {
            state.elig = {};
            requiredFields.forEach(function (f) {
                var checked = $('input[name="' + prefix + f + '"]:checked');
                if (checked) state.elig[f] = checked.value;
            });
            if (state.bando === 'nfpc') {
                var ateco = $('#nfpcAteco');
                state.elig.ateco = ateco ? ateco.value.trim() : '';
            }

            var allAnswered = requiredFields.every(function (f) { return !!state.elig[f]; });
            $('#eligibilityNext').disabled = !allAnswered;
        }

        var block = $('[data-eligibility="' + state.bando + '"]');
        $$('input[type="radio"]', block).forEach(function (r) {
            r.addEventListener('change', recompute);
        });
        if (state.bando === 'nfpc') {
            var ateco = $('#nfpcAteco');
            if (ateco) ateco.addEventListener('input', recompute);
        }

        $('#eligibilityNext').onclick = function () {
            state.result = evaluateEligibility();
            renderResult();
            showStep('result');
        };

        recompute();
    }

    // ============================================
    // STEP 3: RESULT
    // ============================================
    function evaluateEligibility() {
        var checks = [];
        var koCount = 0, warnCount = 0;

        function add(status, text) {
            checks.push({ status: status, text: text });
            if (status === 'ko') koCount++;
            else if (status === 'warn') warnCount++;
        }

        var e = state.elig;

        if (state.bando === 'nfpc') {
            if (e.sede === 'si') add('ok', 'Sede operativa nel Lazio: ce l\'hai.');
            else if (e.sede === 'entro') add('ok', 'Sede operativa nel Lazio: la aprirai prima della firma, ammesso dal bando.');
            else add('ko', 'Sede operativa nel Lazio: ti serve, altrimenti non puoi accedere al bando.');

            if (e.forma === 'mpmi' || e.forma === 'consorzio' || e.forma === 'lp') {
                add('ok', 'Forma giuridica: e ammessa dal bando.');
            } else {
                add('ko', 'Forma giuridica: non e ammessa. Il bando prende solo societa, consorzi/reti con personalita giuridica e liberi professionisti.');
            }

            if (e.bilanci === 'si') add('ok', 'Bilanci o dichiarazioni dei redditi: ne hai almeno 2, ok.');
            else add('ko', 'Bilanci o dichiarazioni dei redditi: ne servono almeno 2 su anni interi. Senza, devi guardare al Fondo Futuro.');

            if (e.espo === 'under') add('ok', 'Prestiti bancari aperti: sotto i 100.000 €, dentro il limite.');
            else if (e.espo === 'over') add('ko', 'Prestiti bancari aperti: sopra i 100.000 €, fuori dal limite del bando.');
            else add('warn', 'Prestiti bancari aperti: chiedi alla tua banca o consulta la Centrale dei Rischi prima di presentare la domanda.');

            if (e.mpmi === 'si') add('ok', 'Dimensioni dell\'impresa: rientri nei limiti per micro, piccole e medie imprese.');
            else add('ko', 'Dimensioni dell\'impresa: sei sopra i limiti (250 dipendenti, 50 milioni di fatturato o 43 milioni di attivo). Il bando e solo per MPMI.');

            if (!e.ateco) {
                add('warn', 'Codice ATECO: non indicato. Controlla le esclusioni dell\'Appendice 4 del bando prima della domanda.');
            } else {
                var prefix2 = e.ateco.replace(/\D/g, '').substr(0, 2);
                if (ATECO_ESCLUSI.indexOf(prefix2) !== -1) {
                    add('ko', 'Codice ATECO ' + e.ateco + ': rientra in un settore escluso dal bando (per esempio finanza, gioco d\'azzardo, tabacco).');
                } else {
                    add('ok', 'Codice ATECO ' + e.ateco + ': non rientra tra i settori esclusi (verifica puntuale al momento della domanda).');
                }
            }

        } else {
            if (e.sede === 'si') add('ok', 'Sede operativa nel Lazio: ce l\'hai.');
            else if (e.sede === 'entro') add('ok', 'Sede operativa nel Lazio: la aprirai prima della firma, ammesso dal bando.');
            else add('ko', 'Sede operativa nel Lazio: ti serve, altrimenti non puoi accedere al bando.');

            var formaOk = ['lp', 'ditta', 'snc', 'sas', 'coop', 'srl', 'srls'];
            if (formaOk.indexOf(e.forma) !== -1) add('ok', 'Forma giuridica: e ammessa dal bando.');
            else add('ko', 'Forma giuridica: non e ammessa (Spa, Sapa e altre societa di capitali sono escluse).');

            if (e.compagine === 'pulita') add('ok', 'Soci: solo persone fisiche operative, va bene.');
            else if (e.compagine === 'ba') add('ko', 'Soci: la presenza di Business Angels o investitori istituzionali esclude dal bando.');
            else add('ko', 'Soci: la presenza di holding finanziarie o di famiglia esclude dal bando.');

            if (e.eta === 'costituenda' || e.eta === 'under36') {
                add('ok', 'Eta dell\'impresa: rientra nel target del bando (in apertura o entro 3 anni).');
            } else {
                add('ko', 'Eta dell\'impresa: la tua e attiva da piu di 3 anni. Per te e piu adatto il Nuovo Fondo Piccolo Credito.');
            }

            if (e.importo === 'entro') add('ok', 'Importo richiesto: fino a 25.000 €, copertura piena.');
            else add('warn', 'Importo richiesto: oltre 25.000 € il bando copre solo una parte del progetto, dovrai trovare il resto altrove.');
        }

        var tier = (koCount > 0) ? 'red' : (warnCount > 0 ? 'yellow' : 'green');
        return {
            tier: tier,
            checks: checks,
            canSimulate: (tier !== 'red'),
            koCount: koCount,
            warnCount: warnCount
        };
    }

    function renderResult() {
        var r = state.result;
        var b = BANDI[state.bando];
        var emoji, title, summary, spotlightLabel, spotlightCta;

        if (r.tier === 'green') {
            emoji = '✓';
            title = 'Hai i requisiti per accedere';
            summary = 'Sulla base delle tue risposte, rispetti tutti i requisiti chiave del ' + b.label + '. ' +
                      'Vai al passo successivo per calcolare la rata.';
            spotlightLabel = 'Il bando giusto per te';
            spotlightCta = 'Sei ammissibile';
        } else if (r.tier === 'yellow') {
            emoji = '!';
            title = 'Probabilmente ammissibile, con qualche verifica';
            summary = 'Sembri compatibile con il ' + b.label + ', ma ci sono ' + r.warnCount +
                      ' punto' + (r.warnCount === 1 ? '' : 'i') + ' da approfondire prima della domanda. ' +
                      'Puoi comunque proseguire con il calcolo della rata.';
            spotlightLabel = 'Il bando piu adatto al tuo profilo';
            spotlightCta = 'Da verificare';
        } else {
            emoji = '✕';
            title = 'Cosi non sei ammissibile';
            summary = 'Sulla base delle risposte, ' + r.koCount + ' requisito' +
                      (r.koCount === 1 ? '' : ' (o piu)') + ' del ' + b.label +
                      ' non risulta soddisfatto. Valuta l\'altro bando oppure parla con noi: in molti casi si trova una soluzione.';
            spotlightLabel = 'Bando analizzato';
            spotlightCta = 'Non in linea';
        }

        var html = '<div class="result-card result-' + r.tier + '">';

        // Spotlight: bando in evidenza
        html += '<div class="result-spotlight">';
        html +=     '<span class="result-spotlight-label">' + spotlightLabel + '</span>';
        html +=     '<div class="result-spotlight-name-row">';
        html +=         '<h3 class="result-spotlight-name">' + b.label + '</h3>';
        html +=         '<span class="result-spotlight-short">' + b.short + '</span>';
        html +=     '</div>';
        html +=     '<span class="result-spotlight-status">' + spotlightCta + '</span>';
        html += '</div>';

        // Verdict: titolo + summary
        html += '<div class="result-verdict">';
        html +=     '<span class="result-emoji" aria-hidden="true">' + emoji + '</span>';
        html +=     '<div class="result-verdict-body">';
        html +=         '<h4 class="result-verdict-title">' + title + '</h4>';
        html +=         '<p class="result-verdict-summary">' + summary + '</p>';
        html +=     '</div>';
        html += '</div>';

        // Punto per punto
        html += '<h4 class="result-checks-title">Punto per punto:</h4>';
        html += '<ul class="result-checks">';
        r.checks.forEach(function (c) {
            var cls = c.status === 'ok' ? 'ck-ok' : (c.status === 'warn' ? 'ck-warn' : 'ck-ko');
            var icon = c.status === 'ok' ? '✓' : (c.status === 'warn' ? '!' : '✕');
            html += '<li><span class="ck ' + cls + '">' + icon + '</span><span>' + c.text + '</span></li>';
        });
        html += '</ul>';
        html += '</div>';
        $('#resultBlock').innerHTML = html;

        $('#resultNext').hidden = !r.canSimulate;
        $('#resultLead').hidden = r.canSimulate;

        $('#resultNext').onclick = function () {
            prepareSimulator();
            showStep('simulator');
        };
        $('#resultLead').onclick = function () {
            prepareLeadForm();
            showStep('lead');
        };
    }

    // ============================================
    // STEP 4: SIMULATOR
    // ============================================
    function prepareSimulator() {
        var b = BANDI[state.bando];
        $('#simBandoLabel').textContent = b.label;
        $('#simLead').textContent = (state.bando === 'nfpc'
            ? 'Sposta lo slider per scegliere l\'importo che vuoi chiedere. Il Piccolo Credito dura in tutto 5 anni: il primo anno non paghi rate, poi paghi per 4 anni a tasso zero senza commissioni.'
            : 'Sposta lo slider per scegliere l\'importo che vuoi chiedere. Il Fondo Futuro dura in tutto 6 anni: il primo anno non paghi rate, poi paghi per 5 anni. Con il pulsante qui sotto puoi vedere come cambia la rata se ottieni la cancellazione delle ultime 12 rate.');

        var slider = $('#simAmount');
        slider.min = b.min;
        slider.max = b.max;
        slider.step = b.step;
        slider.value = b.defaultAmount;

        $('#simAmountMin').innerHTML = fmtEurNoSym(b.min);
        $('#simAmountMax').innerHTML = fmtEurNoSym(b.max);

        $('#kpiDurataFoot').textContent = '12 mesi senza pagare + ' + b.durataAmm + ' mesi di rate';
        $('#simAbbuonoWrap').hidden = !b.hasAbbuono;
        $('#kpiAbbuonoCard').hidden = !b.hasAbbuono;
        $('#simTrancheBlock').hidden = !b.hasTranche;
        $('#lgAbbuono').hidden = !b.hasAbbuono;
        $('#lgAbbuonoText').hidden = !b.hasAbbuono;

        slider.oninput = function () { recomputeSim(); };
        var tog = $('#simAbbuono');
        if (tog) tog.onchange = function () { recomputeSim(); };

        $('#simNext').onclick = function () {
            prepareLeadForm();
            showStep('lead');
        };

        recomputeSim();
    }

    function recomputeSim() {
        var b = BANDI[state.bando];
        var amount = parseInt($('#simAmount').value, 10);
        var useAbb = b.hasAbbuono && $('#simAbbuono').checked;

        var rata = amount / b.durataAmm;
        var rateEffettive = useAbb ? (b.durataAmm - 12) : b.durataAmm;
        var totalePagato = rata * rateEffettive;
        var risparmio = useAbb ? (rata * 12) : 0;

        state.sim = {
            amount: amount,
            durataTot: 12 + b.durataAmm,
            durataPreamm: 12,
            durataAmm: b.durataAmm,
            rata: rata,
            totale: totalePagato,
            abbuono: risparmio,
            useAbbuono: useAbb
        };

        $('#simAmountValue').textContent = amount.toLocaleString('it-IT');
        $('#kpiRata').textContent = fmtEur(rata);
        $('#kpiDurata').textContent = state.sim.durataTot + ' mesi';
        $('#kpiTotale').textContent = fmtEur(totalePagato);
        $('#kpiTotaleFoot').textContent = useAbb
            ? 'paghi ' + rateEffettive + ' rate (12 cancellate)'
            : 'paghi ' + rateEffettive + ' rate, interessi zero';
        if (b.hasAbbuono) {
            $('#kpiAbbuono').textContent = fmtEur(risparmio);
        }

        if (b.hasTranche) {
            $('#trancheA').textContent = fmtEur(amount * 0.20);
            $('#trancheB').textContent = fmtEur(amount * 0.40);
            $('#trancheC').textContent = fmtEur(amount * 0.40);
        }

        renderChart();
        renderAmmortTable();
    }

    function renderChart() {
        var s = state.sim;
        var svg = $('#simChart');
        var W = 600, H = 220;
        var pad = { l: 50, r: 20, t: 18, b: 36 };
        var innerW = W - pad.l - pad.r;
        var innerH = H - pad.t - pad.b;
        var months = s.durataTot;
        var maxAmt = s.amount;

        var x = function (m) { return pad.l + (m / months) * innerW; };
        var y = function (a) { return pad.t + innerH - (a / maxAmt) * innerH; };

        var preammEnd = s.durataPreamm;
        var ammEnd = s.durataPreamm + s.durataAmm;
        var abbStart = s.useAbbuono ? (ammEnd - 12) : ammEnd;

        var preammPath = 'M ' + x(0) + ' ' + y(maxAmt) + ' L ' + x(preammEnd) + ' ' + y(maxAmt);
        var ammResidueAtAbbStart = s.useAbbuono ? (s.rata * 12) : 0;
        var ammPath = 'M ' + x(preammEnd) + ' ' + y(maxAmt) + ' L ' + x(abbStart) + ' ' + y(ammResidueAtAbbStart);

        var abbPath = '';
        if (s.useAbbuono) {
            abbPath = 'M ' + x(abbStart) + ' ' + y(ammResidueAtAbbStart) + ' L ' + x(ammEnd) + ' ' + y(0);
        }

        var ticks = '';
        for (var i = 0; i <= 4; i++) {
            var amt = (maxAmt / 4) * i;
            var ty = y(amt);
            ticks += '<line x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + ty + '" y2="' + ty + '" stroke="#e2e8f0" stroke-dasharray="2 3"/>';
            ticks += '<text x="' + (pad.l - 8) + '" y="' + (ty + 4) + '" text-anchor="end" font-size="10" fill="#94a3b8">' + Math.round(amt / 1000) + 'k</text>';
        }

        var xticks = '';
        var stepX = 12;
        for (var m = 0; m <= months; m += stepX) {
            xticks += '<text x="' + x(m) + '" y="' + (H - 14) + '" text-anchor="middle" font-size="10" fill="#94a3b8">' + m + 'm</text>';
            if (m > 0) xticks += '<line x1="' + x(m) + '" x2="' + x(m) + '" y1="' + pad.t + '" y2="' + (H - pad.b) + '" stroke="#f1f5f9"/>';
        }
        xticks += '<line x1="' + x(preammEnd) + '" x2="' + x(preammEnd) + '" y1="' + pad.t + '" y2="' + (H - pad.b) + '" stroke="#cbd5e1" stroke-dasharray="3 3"/>';
        xticks += '<text x="' + x(preammEnd) + '" y="' + (pad.t + 12) + '" text-anchor="middle" font-size="9" fill="#64748b">fine preamm.</text>';

        var html = ticks + xticks;
        html += '<path d="' + preammPath + '" stroke="#cbd5e1" stroke-width="3" fill="none" stroke-linecap="round"/>';
        html += '<path d="' + ammPath + '" stroke="#164068" stroke-width="3" fill="none" stroke-linecap="round"/>';
        if (abbPath) {
            html += '<path d="' + abbPath + '" stroke="#d4a444" stroke-width="3" fill="none" stroke-dasharray="5 4" stroke-linecap="round"/>';
        }

        html += '<circle cx="' + x(preammEnd) + '" cy="' + y(maxAmt) + '" r="4" fill="#164068"/>';
        html += '<circle cx="' + x(ammEnd) + '" cy="' + y(0) + '" r="4" fill="' + (s.useAbbuono ? '#d4a444' : '#164068') + '"/>';

        svg.innerHTML = html;
    }

    function renderAmmortTable() {
        var s = state.sim;
        var tbody = $('#simTable tbody');
        var rows = [];
        var residuo = s.amount;
        var totalMonths = s.durataTot;
        var preammEnd = s.durataPreamm;
        var abbuonoStart = s.useAbbuono ? (totalMonths - 12) : totalMonths + 1;

        for (var m = 1; m <= totalMonths; m++) {
            var fase, rata, cls = '';
            if (m <= preammEnd) {
                fase = 'Preammortamento';
                rata = 0;
                cls = 'preamm-row';
            } else if (m > abbuonoStart) {
                fase = 'Abbuono ex Art. 14';
                rata = 0;
                cls = 'abbuono-row';
                residuo = Math.max(0, residuo - s.rata);
            } else {
                fase = 'Ammortamento';
                rata = s.rata;
                residuo = Math.max(0, residuo - s.rata);
            }
            rows.push(
                '<tr class="' + cls + '">' +
                    '<td>' + m + '</td>' +
                    '<td>' + fase + '</td>' +
                    '<td>' + (rata > 0 ? fmtEur(rata) : 'nessuna') + '</td>' +
                    '<td>' + fmtEur(residuo) + '</td>' +
                '</tr>'
            );
        }
        tbody.innerHTML = rows.join('');
    }

    // ============================================
    // STEP 5: LEAD FORM
    // ============================================
    function prepareLeadForm() {
        var b = BANDI[state.bando];
        var summary = '';
        summary += '<div><span class="lead-summary-pill">' + b.short + '</span>';
        summary += '<strong>' + b.label + '</strong> &middot; ';
        summary += 'esito: <strong>' + tierLabel(state.result.tier) + '</strong>';
        if (state.result.canSimulate && state.sim.amount) {
            summary += '<br>Importo simulato: <strong>' + fmtEur(state.sim.amount) + '</strong>';
            summary += ' &middot; rata mensile: <strong>' + fmtEur(state.sim.rata) + '</strong>';
            summary += ' &middot; durata: <strong>' + state.sim.durataTot + ' mesi</strong>';
            if (state.sim.useAbbuono && state.sim.abbuono > 0) {
                summary += '<br>Risparmio da abbuono ultime 12 rate: <strong>' + fmtEur(state.sim.abbuono) + '</strong>';
            }
        }
        summary += '</div>';
        $('#leadSummary').innerHTML = summary;

        wireForms();
    }

    function tierLabel(t) {
        return t === 'green' ? 'ammissibile' : (t === 'yellow' ? 'ammissibile con riserve' : 'non ammissibile');
    }

    function buildSummaryMessage() {
        // Generic submission from the public contact form at the bottom of
        // the page (user did not go through the simulator).
        if (!state.bando || !state.result) {
            return 'Richiesta inviata dal modulo di contatto della pagina Bandi Regione Lazio 2026, senza completare il simulatore.';
        }
        var b = BANDI[state.bando];
        var lines = [];
        // IMPORTANT: never start a line with =, +, - or @ — Google Sheets
        // would interpret the whole cell as a formula and show #ERROR!.
        lines.push('Riepilogo simulatore Bandi Lazio');
        lines.push('Bando: ' + b.label + ' (' + b.short + ')');
        lines.push('Inquadramento: ' + state.routingChoice);
        lines.push('Esito eligibility: ' + tierLabel(state.result.tier) +
                   ' (ok ' + (state.result.checks.length - state.result.koCount - state.result.warnCount) +
                   ', warn ' + state.result.warnCount +
                   ', ko ' + state.result.koCount + ')');
        if (state.result.canSimulate && state.sim.amount) {
            lines.push('Importo simulato: ' + Math.round(state.sim.amount) + ' EUR');
            lines.push('Rata mensile: ' + Math.round(state.sim.rata) + ' EUR');
            lines.push('Durata totale: ' + state.sim.durataTot + ' mesi (12 preamm. piu ' + state.sim.durataAmm + ' amm.)');
            lines.push('Totale rimborsato: ' + Math.round(state.sim.totale) + ' EUR');
            if (state.sim.useAbbuono) lines.push('Abbuono ultime 12 rate considerato: ' + Math.round(state.sim.abbuono) + ' EUR');
        }
        lines.push('Risposte eligibility:');
        Object.keys(state.elig).forEach(function (k) {
            lines.push('  ' + k + ': ' + state.elig[k]);
        });
        return lines.join('\n');
    }

    // Attaches the same submit handler to every form on the page that
    // declares a data-pagina attribute. The handler builds the summary
    // message dynamically: from the wizard state if the user completed
    // the simulator, otherwise a generic note. Idempotent (skips forms
    // already wired).
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
        var originalText = btn.textContent;
        btn.textContent = 'Invio in corso...';
        btn.disabled = true;

        var n = new Date();
        var pad = function (x) { return String(x).padStart(2, '0'); };
        var ts = pad(n.getDate()) + '/' + pad(n.getMonth() + 1) + '/' + n.getFullYear() +
                 ' ' + pad(n.getHours()) + ':' + pad(n.getMinutes()) + ':' + pad(n.getSeconds());

        var jsonData = {
            data: ts,
            pagina: form.dataset.pagina || 'Bandi Lazio 2026 - Contatto',
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
            showNotification('Grazie! La richiesta e stata registrata. Ti contatteremo a breve.', 'success');
            form.reset();
        }).catch(function () {
            showNotification('Errore di connessione. Riprova o scrivici a info@nextgenerationbusiness.it', 'error');
        }).finally(function () {
            btn.textContent = originalText;
            btn.disabled = false;
        });
    }

    // ============================================
    // BACK navigation
    // ============================================
    function initBackButtons() {
        $$('[data-back-to]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                showStep(btn.getAttribute('data-back-to'));
            });
        });
    }

    function initRestartButton() {
        var btn = $('#wizardRestart');
        if (btn) {
            btn.addEventListener('click', function () {
                if (state.step === 'routing' && !state.routingChoice) return;
                if (confirm('Ricominciare il simulatore? Le risposte verranno cancellate.')) {
                    resetWizard();
                }
            });
        }
    }

    // ============================================
    // NAVBAR scroll + mobile menu
    // ============================================
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

        // Smooth scroll for any in-page anchor
        $$('a[href^="#"]').forEach(function (a) {
            a.addEventListener('click', function (e) {
                var href = a.getAttribute('href');
                if (href.length <= 1) return;
                var target = document.querySelector(href);
                if (target) {
                    e.preventDefault();
                    target.scrollIntoView({ behavior: 'smooth' });
                }
            });
        });
    }

    // ============================================
    // NOTIFICATION
    // ============================================
    function showNotification(message, type) {
        var existing = document.querySelector('.notification');
        if (existing) existing.remove();

        var n = document.createElement('div');
        n.className = 'notification notification-' + type;
        n.innerHTML = '<span>' + message + '</span><button onclick="this.parentElement.remove()" aria-label="Chiudi">&times;</button>';
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
        Object.assign(closeBtn.style, {
            background: 'none', border: 'none', color: '#cbd5e1',
            fontSize: '1.3rem', cursor: 'pointer', padding: '0', lineHeight: '1'
        });
        document.body.appendChild(n);
        setTimeout(function () {
            n.style.opacity = '0';
            n.style.transform = 'translateY(12px)';
            n.style.transition = '0.3s ease-out';
            setTimeout(function () { n.remove(); }, 300);
        }, 5000);
    }

    // ============================================
    // INIT
    // ============================================
    document.addEventListener('DOMContentLoaded', function () {
        initNavbar();
        initRouting();
        initBackButtons();
        initRestartButton();
        // Wire up the public contact form at the bottom of the page
        // immediately. The wizard step-5 form (same id is *not* used —
        // they have different ids) gets wired again from prepareLeadForm,
        // but the dataset.wired guard makes that idempotent.
        wireForms();
        showStep('routing', { scroll: false });
    });

})();
