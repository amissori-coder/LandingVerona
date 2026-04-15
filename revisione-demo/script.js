// ============================================
// Revisione Legale - Interactive Demo
// Revilaw S.p.A.
// ============================================

document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // NAVBAR
    // ==========================================
    const navbar = document.getElementById('navbar');
    if (navbar) {
        window.addEventListener('scroll', () => {
            navbar.classList.toggle('scrolled', window.scrollY > 50);
        });
    }

    // Mobile menu
    const hamburger = document.getElementById('hamburger');
    const navLinks = document.getElementById('navLinks');
    if (hamburger && navLinks) {
        hamburger.addEventListener('click', () => {
            hamburger.classList.toggle('active');
            navLinks.classList.toggle('active');
        });
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                hamburger.classList.remove('active');
                navLinks.classList.remove('active');
            });
        });
    }

    // Smooth scroll
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) target.scrollIntoView({ behavior: 'smooth' });
        });
    });

    // ==========================================
    // HERO PARTICLES
    // ==========================================
    const particlesContainer = document.getElementById('heroParticles');
    if (particlesContainer) {
        for (let i = 0; i < 20; i++) {
            const p = document.createElement('div');
            p.classList.add('particle');
            const size = Math.random() * 6 + 2;
            p.style.width = size + 'px';
            p.style.height = size + 'px';
            p.style.left = Math.random() * 100 + '%';
            p.style.animationDuration = (Math.random() * 15 + 10) + 's';
            p.style.animationDelay = (Math.random() * 10) + 's';
            particlesContainer.appendChild(p);
        }
    }

    // ==========================================
    // HERO COUNTER ANIMATION
    // ==========================================
    const counterEl = document.querySelector('[data-count]');
    if (counterEl) {
        const target = parseInt(counterEl.dataset.count);
        let current = 0;
        const step = Math.ceil(target / 60);
        const timer = setInterval(() => {
            current += step;
            if (current >= target) { current = target; clearInterval(timer); }
            counterEl.textContent = current + '+';
        }, 30);
    }

    // ==========================================
    // PROCESS STEPS
    // ==========================================
    const progressDots = document.querySelectorAll('.progress-dot');
    const stepCards = document.querySelectorAll('.step-card');
    const progressFill = document.getElementById('progressFill');

    function setStep(index) {
        progressDots.forEach((dot, i) => {
            dot.classList.toggle('active', i === index);
            dot.classList.toggle('completed', i < index);
        });
        stepCards.forEach((card, i) => {
            card.classList.toggle('active', i === index);
        });
        if (progressFill) {
            progressFill.style.width = (index / (progressDots.length - 1) * 100) + '%';
        }
    }

    progressDots.forEach(dot => {
        dot.addEventListener('click', () => setStep(parseInt(dot.dataset.step)));
    });

    // Auto-advance every 6 seconds
    let currentStep = 0;
    let autoAdvance = setInterval(() => {
        currentStep = (currentStep + 1) % 5;
        setStep(currentStep);
    }, 6000);

    // Pause auto on user interaction
    document.querySelector('.process-interactive')?.addEventListener('click', () => {
        clearInterval(autoAdvance);
    });

    // ==========================================
    // RADAR CHART (Canvas)
    // ==========================================
    const radarCanvas = document.getElementById('radarChart');
    if (radarCanvas) {
        const ctx = radarCanvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        radarCanvas.width = 400 * dpr;
        radarCanvas.height = 400 * dpr;
        ctx.scale(dpr, dpr);

        const labels = ['Leadership', 'Etica', 'Incarichi', 'Standard', 'Revisione', 'Formazione', 'Monitoraggio'];
        const values = [92, 95, 88, 97, 90, 93, 91];
        const cx = 200, cy = 200, maxR = 150;
        let activeIndex = 0;
        let animProgress = 0;

        function drawRadar(progress) {
            ctx.clearRect(0, 0, 400, 400);
            const n = labels.length;
            const angleStep = (Math.PI * 2) / n;

            // Grid circles
            for (let r = 1; r <= 5; r++) {
                ctx.beginPath();
                const radius = (maxR / 5) * r;
                for (let i = 0; i <= n; i++) {
                    const angle = angleStep * i - Math.PI / 2;
                    const x = cx + Math.cos(angle) * radius;
                    const y = cy + Math.sin(angle) * radius;
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.strokeStyle = 'rgba(26,58,92,0.08)';
                ctx.lineWidth = 1;
                ctx.stroke();
            }

            // Axes
            for (let i = 0; i < n; i++) {
                const angle = angleStep * i - Math.PI / 2;
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.lineTo(cx + Math.cos(angle) * maxR, cy + Math.sin(angle) * maxR);
                ctx.strokeStyle = 'rgba(26,58,92,0.1)';
                ctx.stroke();
            }

            // Data polygon
            ctx.beginPath();
            for (let i = 0; i <= n; i++) {
                const idx = i % n;
                const angle = angleStep * idx - Math.PI / 2;
                const val = (values[idx] / 100) * maxR * progress;
                const x = cx + Math.cos(angle) * val;
                const y = cy + Math.sin(angle) * val;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.fillStyle = 'rgba(26,58,92,0.12)';
            ctx.fill();
            ctx.strokeStyle = '#1a3a5c';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Data points & labels
            for (let i = 0; i < n; i++) {
                const angle = angleStep * i - Math.PI / 2;
                const val = (values[i] / 100) * maxR * progress;
                const x = cx + Math.cos(angle) * val;
                const y = cy + Math.sin(angle) * val;

                // Point
                ctx.beginPath();
                ctx.arc(x, y, i === activeIndex ? 7 : 4, 0, Math.PI * 2);
                ctx.fillStyle = i === activeIndex ? '#1a3a5c' : '#2a6496';
                ctx.fill();
                if (i === activeIndex) {
                    ctx.strokeStyle = 'rgba(26,58,92,0.3)';
                    ctx.lineWidth = 3;
                    ctx.stroke();
                }

                // Label
                const lx = cx + Math.cos(angle) * (maxR + 28);
                const ly = cy + Math.sin(angle) * (maxR + 28);
                ctx.font = i === activeIndex ? 'bold 11px Inter' : '11px Inter';
                ctx.fillStyle = i === activeIndex ? '#1a3a5c' : '#94a3b8';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(labels[i], lx, ly);

                // Value
                if (i === activeIndex) {
                    ctx.font = 'bold 14px Montserrat';
                    ctx.fillStyle = '#1a3a5c';
                    ctx.fillText(values[i] + '%', lx, ly + 16);
                }
            }
        }

        // Animate in
        function animateRadar() {
            animProgress += 0.03;
            if (animProgress > 1) animProgress = 1;
            drawRadar(animProgress);
            if (animProgress < 1) requestAnimationFrame(animateRadar);
        }

        // Intersection observer to trigger animation
        const radarObserver = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                animProgress = 0;
                animateRadar();
                radarObserver.unobserve(radarCanvas);
            }
        }, { threshold: 0.3 });
        radarObserver.observe(radarCanvas);

        // Pilastri interaction
        document.querySelectorAll('.pilastro-item').forEach(item => {
            item.addEventListener('click', () => {
                document.querySelectorAll('.pilastro-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                activeIndex = parseInt(item.dataset.index);
                drawRadar(animProgress);
            });
        });
    }

    // ==========================================
    // PIANO DI REVISIONE — Materiality calculator
    // Model:
    //   1. User picks one or more reference parameters via checkbox
    //   2. For each picked row:
    //        materiality_i = valore_bilancio_stimato * (pct / 100)
    //      (displayed live in the "Materialità di riga" column)
    //   3. Materialità = average of the materiality_i values of selected rows
    //   4. Materialità operativa = Materialità * (op_pct / 100)   [65–85%]
    //   5. Errore trascurabile   = Materialità * (err_pct / 100)  [5–15%]
    // All numbers display in Italian format (1.234.567).
    // ==========================================
    (function initPianoMateriality() {
        const rows = document.querySelectorAll('#pianoMatBody .piano-mat-row');
        const totEl = document.getElementById('pianoMatTot');
        const opEl = document.getElementById('pianoMatOp');
        const errEl = document.getElementById('pianoMatErr');
        const countEl = document.getElementById('pianoMatCount');
        const opPctInput = document.querySelector('.piano-mat-op-pct');
        const errPctInput = document.querySelector('.piano-mat-err-pct');
        if (!rows.length || !totEl || !opPctInput || !errPctInput) return;

        // ---------- Italian number parsing / formatting ----------
        // Handles Italian (1.234.567,89) and English (1,234,567.89) formats
        // as well as plain integers and single-decimal values.
        const parseItNumber = (str) => {
            if (str == null) return 0;
            const cleaned = String(str).replace(/[^0-9,.\-]/g, '').trim();
            if (!cleaned) return 0;

            const hasComma = cleaned.indexOf(',') !== -1;
            const hasDot = cleaned.indexOf('.') !== -1;
            let normalized;

            if (hasComma && hasDot) {
                // Both present: the LAST one is the decimal separator
                const lastComma = cleaned.lastIndexOf(',');
                const lastDot = cleaned.lastIndexOf('.');
                if (lastComma > lastDot) {
                    // Italian: "1.234.567,89" → dots are thousands
                    normalized = cleaned.replace(/\./g, '').replace(',', '.');
                } else {
                    // English: "1,234,567.89" → commas are thousands
                    normalized = cleaned.replace(/,/g, '');
                }
            } else if (hasComma) {
                // Only comma(s): Italian decimal OR English thousands.
                // Multiple commas → thousands; single comma → decimal (Italian).
                const commaCount = (cleaned.match(/,/g) || []).length;
                normalized = commaCount > 1
                    ? cleaned.replace(/,/g, '')
                    : cleaned.replace(',', '.');
            } else if (hasDot) {
                // Only dot(s): multiple dots → thousands (Italian "1.234.567").
                // Single dot with exactly 3 digits after → thousands ("1.234").
                // Single dot otherwise → decimal ("1.78", "0.5").
                const dotCount = (cleaned.match(/\./g) || []).length;
                if (dotCount > 1) {
                    normalized = cleaned.replace(/\./g, '');
                } else {
                    const parts = cleaned.split('.');
                    if (parts.length === 2 && parts[1].length === 3 && parts[0].length > 0) {
                        normalized = parts.join('');
                    } else {
                        normalized = cleaned;
                    }
                }
            } else {
                normalized = cleaned;
            }

            const n = parseFloat(normalized);
            return isFinite(n) ? n : 0;
        };

        const formatIntIt = (n) => Math.round(n).toLocaleString('it-IT');
        const formatEur = (n) => '\u20AC\u00A0' + formatIntIt(n);
        const formatDec2 = (n) =>
            n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

        // ---------- Flash animation for result amounts ----------
        const prevValues = { tot: null, op: null, err: null };
        const flash = (el) => {
            el.classList.remove('is-flashing');
            void el.offsetWidth; // force reflow
            el.classList.add('is-flashing');
        };

        // ---------- Core calculation ----------
        function recompute() {
            const selectedMaterialities = [];

            rows.forEach((row) => {
                const checkbox = row.querySelector('input[type="checkbox"]');
                const resultEl = row.querySelector('[data-row-result]');
                const pctEl = row.querySelector('.piano-mat-pct');
                const valEl = row.querySelector('.piano-mat-val');
                const isChecked = checkbox.checked;
                row.classList.toggle('is-unchecked', !isChecked);

                if (!isChecked) {
                    if (resultEl) resultEl.innerHTML = '&mdash;';
                    return;
                }

                const pct = parseItNumber(pctEl.value);
                const val = parseItNumber(valEl.value);
                if (val > 0 && pct > 0) {
                    const rowMat = val * (pct / 100);
                    selectedMaterialities.push(rowMat);
                    if (resultEl) resultEl.textContent = formatEur(rowMat);
                } else {
                    if (resultEl) resultEl.innerHTML = '&mdash;';
                }
            });

            const n = selectedMaterialities.length;
            const materialita = n
                ? selectedMaterialities.reduce((s, m) => s + m, 0) / n
                : 0;

            const opPct = clamp(parseItNumber(opPctInput.value), 0, 100);
            const errPct = clamp(parseItNumber(errPctInput.value), 0, 100);

            // Update averaging badge
            if (countEl) countEl.textContent = n || '0';

            // Update result cards with flash animation on change
            const newTot = formatEur(materialita);
            const newOp  = formatEur(materialita * (opPct / 100));
            const newErr = formatEur(materialita * (errPct / 100));

            if (newTot !== prevValues.tot) { totEl.textContent = newTot; flash(totEl); prevValues.tot = newTot; }
            if (newOp  !== prevValues.op)  { opEl.textContent  = newOp;  flash(opEl);  prevValues.op  = newOp;  }
            if (newErr !== prevValues.err) { errEl.textContent = newErr; flash(errEl); prevValues.err = newErr; }
        }

        // ---------- Event wiring ----------
        rows.forEach((row) => {
            const checkbox = row.querySelector('input[type="checkbox"]');
            checkbox.addEventListener('change', recompute);

            const valInput = row.querySelector('.piano-mat-val');
            const pctInput = row.querySelector('.piano-mat-pct');

            valInput.addEventListener('input', recompute);
            valInput.addEventListener('blur', () => {
                const n = parseItNumber(valInput.value);
                valInput.value = n > 0 ? formatIntIt(n) : '';
                recompute();
            });

            pctInput.addEventListener('input', recompute);
            pctInput.addEventListener('blur', () => {
                const n = parseItNumber(pctInput.value);
                pctInput.value = n > 0 ? formatDec2(n) : '';
                recompute();
            });
        });

        [opPctInput, errPctInput].forEach((input) => {
            input.addEventListener('input', recompute);
            input.addEventListener('blur', () => {
                const n = parseItNumber(input.value);
                input.value = n > 0 ? formatDec2(n) : '';
                recompute();
            });
        });

        // Initial paint: seed prevValues so the initial render doesn't flash
        prevValues.tot = totEl.textContent;
        prevValues.op  = opEl.textContent;
        prevValues.err = errEl.textContent;
        recompute();
    })();

    // ==========================================
    // PIANO DI REVISIONE — 3D cube matrix
    // 27 balance areas arranged in a real 3×3×3 cube that rotates with
    // mouse drag. The parent .piano-cube-space rotates in 3D space, each
    // sub-cube has 6 faces (CSS transform). Clicking a cube updates the
    // detail panel below.
    // ==========================================
    (function initPianoCubeMatrix() {
        const scene = document.getElementById('pianoCubeScene');
        const space = document.getElementById('pianoCubeSpace');
        const tooltip = document.getElementById('pianoCubeTooltip');
        const detailIcon = document.getElementById('pianoAreaDetailIcon');
        const detailName = document.getElementById('pianoAreaDetailName');
        const detailChips = document.getElementById('pianoAreaDetailChips');
        const detailProcedures = document.getElementById('pianoAreaDetailProcedures');
        const detailRisks = document.getElementById('pianoAreaDetailRisks');
        if (!scene || !space || !detailName) return;
        // Idempotent guard
        if (space.querySelector('.piano-cube-item')) return;

        const svg = (path) =>
            `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;

        const AREAS = [
            {
                id: 'rimanenze',
                name: 'Rimanenze',
                icon: svg('<path d="M20 7 12 3 4 7v10l8 4 8-4z"/><path d="M12 12 4 7"/><path d="m12 12 8-5"/><path d="M12 12v9"/>'),
                asserzioni: ['Esistenza', 'Completezza', 'Valutazione', 'Diritti'],
                procedure: [
                    'Partecipazione alla rilevazione fisica e conteggio a campione',
                    'Verifica del valore al minore tra costo e valore di mercato',
                    'Analisi della rotazione e dell\u2019obsolescenza delle scorte',
                    'Riconciliazione tra magazzino contabile e fisico'
                ],
                rischi: ['Obsolescenza o danneggiamento', 'Furti e ammanchi', 'Valutazione sovrastimata']
            },
            {
                id: 'crediti',
                name: 'Crediti vs clienti',
                icon: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>'),
                asserzioni: ['Esistenza', 'Completezza', 'Valutazione', 'Classificazione'],
                procedure: [
                    'Circolarizzazione di un campione di clienti',
                    'Analisi dell\u2019anzianit\u00E0 dei crediti (aging)',
                    'Verifica della congruit\u00E0 del fondo svalutazione',
                    'Test di cut-off su fatture di fine esercizio'
                ],
                rischi: ['Insolvenza dei clienti', 'Ricavi fittizi', 'Sopravvalutazione dei crediti']
            },
            {
                id: 'immob-mat',
                name: 'Immobilizzazioni materiali',
                icon: svg('<path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><path d="M9 9v.01"/><path d="M9 12v.01"/><path d="M9 15v.01"/><path d="M9 18v.01"/>'),
                asserzioni: ['Esistenza', 'Diritti', 'Valutazione', 'Completezza'],
                procedure: [
                    'Verifica dei titoli di propriet\u00E0 e dei contratti',
                    'Ricalcolo degli ammortamenti e vita utile',
                    'Test di impairment e verifica indicatori',
                    'Ispezione fisica dei cespiti significativi'
                ],
                rischi: ['Capitalizzazioni non giustificate', 'Vita utile sovrastimata', 'Mancata svalutazione']
            },
            {
                id: 'immob-imm',
                name: 'Immobilizzazioni immateriali',
                icon: svg('<path d="M12 2v4"/><path d="M12 18v4"/><path d="m4.93 4.93 2.83 2.83"/><path d="m16.24 16.24 2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="m4.93 19.07 2.83-2.83"/><path d="m16.24 7.76 2.83-2.83"/>'),
                asserzioni: ['Esistenza', 'Valutazione', 'Diritti'],
                procedure: [
                    'Verifica della capitalizzabilit\u00E0 di costi sviluppo',
                    'Ricalcolo ammortamenti e periodo di riferimento',
                    'Impairment test su avviamento e marchi',
                    'Revisione della documentazione di supporto'
                ],
                rischi: ['Avviamento non recuperabile', 'Capitalizzazione di costi operativi', 'Stime discrezionali']
            },
            {
                id: 'partecipazioni',
                name: 'Partecipazioni',
                icon: svg('<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>'),
                asserzioni: ['Esistenza', 'Diritti', 'Valutazione'],
                procedure: [
                    'Esame del bilancio delle societ\u00E0 partecipate',
                    'Verifica del metodo di valutazione (costo o PN)',
                    'Impairment test su partecipazioni significative',
                    'Analisi dei flussi di cassa attesi'
                ],
                rischi: ['Perdite durevoli non rilevate', 'Valutazione al costo non giustificata', 'Transazioni infragruppo']
            },
            {
                id: 'disponibilita',
                name: 'Disponibilit\u00E0 liquide',
                icon: svg('<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M2 10h20"/><circle cx="17" cy="14" r="1.5"/>'),
                asserzioni: ['Esistenza', 'Completezza', 'Classificazione', 'Diritti'],
                procedure: [
                    'Richiesta di conferma saldi alle banche',
                    'Verifica riconciliazioni bancarie di fine periodo',
                    'Conteggio fisico del contante in cassa',
                    'Analisi dei movimenti successivi alla chiusura'
                ],
                rischi: ['Ammanchi di cassa', 'Firme non autorizzate', 'Conti non dichiarati']
            },
            {
                id: 'debiti-comm',
                name: 'Debiti commerciali',
                icon: svg('<path d="M3 6h18"/><path d="M3 12h18"/><path d="M3 18h12"/><path d="m17 15-3 3 3 3"/>'),
                asserzioni: ['Completezza', 'Valutazione', 'Classificazione', 'Cut-off'],
                procedure: [
                    'Conferma esterna dei saldi con i fornitori',
                    'Test di completezza (ricerca debiti non registrati)',
                    'Verifica cut-off su fatture da ricevere',
                    'Analisi dell\u2019anzianit\u00E0 e dei tempi di pagamento'
                ],
                rischi: ['Debiti sottostimati', 'Fatture da ricevere omesse', 'Passivit\u00E0 nascoste']
            },
            {
                id: 'debiti-fin',
                name: 'Debiti finanziari',
                icon: svg('<path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>'),
                asserzioni: ['Completezza', 'Valutazione', 'Classificazione'],
                procedure: [
                    'Conferma esterna ai finanziatori',
                    'Verifica del rispetto dei covenant',
                    'Ricalcolo degli interessi passivi maturati',
                    'Analisi del piano di rimborso e delle scadenze'
                ],
                rischi: ['Rottura di covenant', 'Errata classificazione corrente/non corrente', 'Interessi non contabilizzati']
            },
            {
                id: 'debiti-trib',
                name: 'Debiti tributari',
                icon: svg('<path d="M4 10h16"/><path d="M4 14h16"/><path d="M9 6h6"/><path d="M9 18h6"/><rect x="3" y="6" width="18" height="12" rx="1"/>'),
                asserzioni: ['Completezza', 'Accuratezza', 'Valutazione'],
                procedure: [
                    'Riscontro con dichiarazioni fiscali e F24',
                    'Verifica delle ritenute operate e versate',
                    'Analisi dei contenziosi tributari in essere',
                    'Ricalcolo delle imposte correnti dell\u2019esercizio'
                ],
                rischi: ['Contenziosi fiscali', 'Omessi versamenti', 'Sanzioni e interessi non rilevati']
            },
            {
                id: 'tfr',
                name: 'TFR e fondi personale',
                icon: svg('<circle cx="12" cy="8" r="4"/><path d="M6 21v-2a6 6 0 0 1 12 0v2"/>'),
                asserzioni: ['Completezza', 'Valutazione'],
                procedure: [
                    'Ricalcolo analitico del fondo TFR per dipendente',
                    'Verifica dei movimenti dell\u2019esercizio (anticipi, liquidazioni)',
                    'Riscontro con LUL e cedolini paga',
                    'Confronto con le risultanze del consulente del lavoro'
                ],
                rischi: ['Errato ricalcolo OIC 31', 'Movimenti non contabilizzati', 'Stime attuariali discrezionali']
            },
            {
                id: 'fondi-rischi',
                name: 'Fondi per rischi e oneri',
                icon: svg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M12 8v4"/><path d="M12 16h.01"/>'),
                asserzioni: ['Completezza', 'Valutazione', 'Classificazione'],
                procedure: [
                    'Richiesta ai legali sulle cause in corso',
                    'Analisi delle stime e delle probabilit\u00E0 di esborso',
                    'Verifica movimenti (accantonamenti, utilizzi, rilasci)',
                    'Valutazione della sufficienza delle informazioni in NI'
                ],
                rischi: ['Passivit\u00E0 potenziali non rilevate', 'Stime insufficienti', 'Contenziosi non comunicati']
            },
            {
                id: 'ratei',
                name: 'Ratei e risconti',
                icon: svg('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'),
                asserzioni: ['Completezza', 'Accuratezza', 'Cut-off'],
                procedure: [
                    'Verifica di competenza economica (OIC 18)',
                    'Ricalcolo su contratti pluriennali',
                    'Analisi delle poste di cut-off a cavallo esercizio',
                    'Riconciliazione con i partitari contabili'
                ],
                rischi: ['Errata competenza economica', 'Poste omesse', 'Duplicazioni con fatture emesse/ricevute']
            },
            {
                id: 'patrimonio',
                name: 'Patrimonio netto',
                icon: svg('<path d="M12 2 2 22h20z"/><path d="M12 8v6"/><circle cx="12" cy="17" r="1"/>'),
                asserzioni: ['Completezza', 'Valutazione', 'Classificazione'],
                procedure: [
                    'Verifica dei verbali assembleari e del CdA',
                    'Riscontro delle variazioni con atti notarili',
                    'Analisi della destinazione dell\u2019utile d\u2019esercizio',
                    'Controllo dei vincoli su riserve'
                ],
                rischi: ['Distribuzione di riserve non distribuibili', 'Errata classificazione riserve', 'Operazioni straordinarie']
            },
            {
                id: 'ricavi',
                name: 'Ricavi',
                icon: svg('<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>'),
                asserzioni: ['Occorrenza', 'Completezza', 'Accuratezza', 'Cut-off'],
                procedure: [
                    'Test documentale su campione (DDT, fatture, contratti)',
                    'Analisi comparativa con dati storici e budget',
                    'Test di cut-off a cavallo esercizio',
                    'Verifica resi, abbuoni e sconti sui volumi'
                ],
                rischi: ['Ricavi fittizi o anticipati', 'Side letter non disclosed', 'Errata applicazione OIC 15']
            },
            {
                id: 'costi',
                name: 'Costi della produzione',
                icon: svg('<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>'),
                asserzioni: ['Occorrenza', 'Completezza', 'Classificazione', 'Cut-off'],
                procedure: [
                    'Test documentale su campione fatture passive',
                    'Analisi per natura e per destinazione',
                    'Cut-off sulle prestazioni di fine esercizio',
                    'Verifica di competenza di costi pluriennali'
                ],
                rischi: ['Costi non competenza', 'Classificazione errata', 'Omissione di costi per rettifiche indebite']
            },
            {
                id: 'oneri-fin',
                name: 'Proventi e oneri finanziari',
                icon: svg('<path d="m3 17 6-6 4 4 8-8"/><path d="M14 7h7v7"/>'),
                asserzioni: ['Completezza', 'Accuratezza', 'Classificazione'],
                procedure: [
                    'Ricalcolo degli interessi attivi/passivi',
                    'Verifica degli effetti cambio su poste in valuta',
                    'Analisi dei derivati di copertura',
                    'Riconciliazione con estratti conto bancari'
                ],
                rischi: ['Interessi omessi', 'Differenze cambio errate', 'Derivati speculativi non disclosed']
            },
            {
                id: 'imposte',
                name: 'Imposte correnti e differite',
                icon: svg('<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8"/><path d="M8 10h8"/><path d="M8 14h5"/><path d="M14 18h2"/>'),
                asserzioni: ['Completezza', 'Accuratezza', 'Valutazione'],
                procedure: [
                    'Ricalcolo della base imponibile IRES/IRAP',
                    'Verifica del prospetto di raccordo civilistico-fiscale',
                    'Analisi della recuperabilit\u00E0 delle imposte differite attive',
                    'Riscontro con le dichiarazioni dei redditi'
                ],
                rischi: ['Imposte differite non recuperabili', 'Errata base imponibile', 'Mancato rispetto OIC 25']
            },
            {
                id: 'parti-correlate',
                name: 'Parti correlate',
                icon: svg('<circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><circle cx="17" cy="7" r="4"/><path d="M21 21v-2a4 4 0 0 0-3-3.87"/>'),
                asserzioni: ['Completezza', 'Occorrenza', 'Informativa'],
                procedure: [
                    'Mappatura delle parti correlate tramite dichiarazione',
                    'Verifica delle transazioni a condizioni di mercato',
                    'Lettura delle informative in nota integrativa',
                    'Controllo dei saldi infragruppo'
                ],
                rischi: ['Transazioni non at arm\u2019s length', 'Mancata disclosure', 'Trasferimenti di valore nascosti']
            },
            {
                id: 'fatti-succ',
                name: 'Fatti successivi',
                icon: svg('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><circle cx="12" cy="15" r="2"/>'),
                asserzioni: ['Occorrenza', 'Completezza', 'Cut-off'],
                procedure: [
                    'Lettura verbali assembleari post-chiusura',
                    'Richiesta informazioni alla direzione',
                    'Analisi della stampa di settore successiva',
                    'Review dei movimenti bancari successivi'
                ],
                rischi: ['Eventi rettificativi omessi', 'Eventi non rettificativi senza disclosure', 'Modifiche al going concern']
            },
            {
                id: 'continuita',
                name: 'Continuit\u00E0 aziendale',
                icon: svg('<path d="M12 2v6"/><path d="M12 22v-6"/><path d="m4.22 10.22 4.24 4.24"/><path d="m15.54 9.46 4.24-4.24"/><path d="M2 12h6"/><path d="M22 12h-6"/><path d="m4.22 13.78 4.24-4.24"/><path d="m15.54 14.54 4.24 4.24"/>'),
                asserzioni: ['Presupposto going concern', 'Informativa'],
                procedure: [
                    'Analisi del budget 12 mesi e del cash flow previsionale',
                    'Verifica degli indicatori della crisi (CCII)',
                    'Test di stress su covenant e liquidit\u00E0',
                    'Valutazione degli allarmi dell\u2019organo di controllo'
                ],
                rischi: ['Incertezza significativa non disclosed', 'Indicatori CCII trascurati', 'Andamento negativo prolungato']
            },
            {
                id: 'avviamento',
                name: 'Avviamento',
                icon: svg('<path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>'),
                asserzioni: ['Valutazione', 'Esistenza', 'Informativa'],
                procedure: [
                    'Impairment test secondo OIC 9',
                    'Analisi dei flussi di cassa attesi della CGU',
                    'Verifica del tasso di attualizzazione utilizzato',
                    'Confronto tra valore contabile e valore recuperabile'
                ],
                rischi: ['Avviamento non recuperabile', 'Tassi di sconto inadeguati', 'Ammortamento non coerente con vita utile']
            },
            {
                id: 'derivati',
                name: 'Strumenti finanziari derivati',
                icon: svg('<path d="M3 12c2-6 4 6 6 0s4 6 6 0 4 6 6 0"/>'),
                asserzioni: ['Esistenza', 'Valutazione', 'Informativa'],
                procedure: [
                    'Mappatura dei contratti derivati in essere',
                    'Verifica del fair value a fine esercizio',
                    'Test di efficacia delle coperture (hedge accounting)',
                    'Valutazione dell\u2019informativa in NI secondo OIC 32'
                ],
                rischi: ['Derivati speculativi non disclosed', 'Fair value errato', 'Perdite nascoste su contratti aperti']
            },
            {
                id: 'leasing',
                name: 'Leasing e canoni pluriennali',
                icon: svg('<path d="M3 9 12 3l9 6v12H3V9z"/><path d="M9 21v-6h6v6"/>'),
                asserzioni: ['Completezza', 'Valutazione', 'Classificazione'],
                procedure: [
                    'Verifica dei contratti di leasing in essere',
                    'Ricalcolo dei canoni di competenza',
                    'Informativa metodo finanziario in nota integrativa',
                    'Analisi dei riscatti esercitati nell\u2019esercizio'
                ],
                rischi: ['Classificazione errata op/fin', 'Canoni non di competenza', 'Impegni futuri non disclosed']
            },
            {
                id: 'crediti-gruppo',
                name: 'Crediti vs gruppo',
                icon: svg('<circle cx="6" cy="12" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M9 12h6"/><path d="m8 10 8-4"/><path d="m8 14 8 4"/>'),
                asserzioni: ['Esistenza', 'Completezza', 'Valutazione'],
                procedure: [
                    'Riconciliazione dei saldi intercompany',
                    'Analisi delle operazioni a condizioni di mercato',
                    'Verifica delle garanzie infragruppo',
                    'Controllo delle compensazioni e dei netting'
                ],
                rischi: ['Saldi non riconciliati', 'Transazioni non at arm\u2019s length', 'Svalutazioni omesse su controllate in perdita']
            },
            {
                id: 'conti-ordine',
                name: 'Garanzie e conti d\u2019ordine',
                icon: svg('<path d="M12 3 2 7.5v9L12 21l10-4.5v-9L12 3z"/><path d="M8 11h8"/><path d="M8 14h5"/>'),
                asserzioni: ['Completezza', 'Informativa'],
                procedure: [
                    'Richiesta circolari a banche su fideiussioni rilasciate',
                    'Analisi dei contratti di garanzia in essere',
                    'Verifica delle informazioni in nota integrativa',
                    'Quantificazione degli impegni assunti'
                ],
                rischi: ['Garanzie omesse', 'Impegni futuri non disclosed', 'Escussione di garanzie']
            },
            {
                id: 'valuta-estera',
                name: 'Operazioni in valuta estera',
                icon: svg('<circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10"/><path d="M12 2a15.3 15.3 0 0 0-4 10 15.3 15.3 0 0 0 4 10"/><path d="M2 12h20"/>'),
                asserzioni: ['Valutazione', 'Accuratezza'],
                procedure: [
                    'Verifica del tasso di cambio alla data di chiusura',
                    'Ricalcolo delle poste monetarie in valuta',
                    'Analisi degli effetti cambio su risultato',
                    'Riconciliazione con le registrazioni contabili'
                ],
                rischi: ['Cambi non aggiornati', 'Differenze di conversione errate', 'Poste monetarie non rivalutate']
            },
            {
                id: 'frodi',
                name: 'Frodi e atti illeciti',
                icon: svg('<path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/><line x1="4" y1="4" x2="20" y2="20"/>'),
                asserzioni: ['Completezza', 'Occorrenza', 'Scetticismo'],
                procedure: [
                    'Valutazione del rischio di frode ex ISA 240',
                    'Intervista al management e al Collegio Sindacale',
                    'Analisi delle scritture contabili inusuali (JET)',
                    'Test sui controlli anti-frode e override del management'
                ],
                rischi: ['Override dei controlli interni', 'Appropriazione indebita', 'Riciclaggio e antiriciclaggio']
            }
        ];

        // Build detail-panel updater
        let currentArea = null;
        function showArea(area) {
            currentArea = area;
            detailIcon.innerHTML = area.icon;
            detailName.textContent = area.name;

            detailChips.innerHTML = '';
            area.asserzioni.forEach((a) => {
                const span = document.createElement('span');
                span.className = 'piano-area-detail-chip';
                span.textContent = a;
                detailChips.appendChild(span);
            });

            detailProcedures.innerHTML = '';
            area.procedure.forEach((p) => {
                const li = document.createElement('li');
                li.textContent = p;
                detailProcedures.appendChild(li);
            });

            detailRisks.innerHTML = '';
            area.rischi.forEach((r) => {
                const li = document.createElement('li');
                li.textContent = r;
                detailRisks.appendChild(li);
            });

            space.querySelectorAll('.piano-cube-item').forEach((c) =>
                c.classList.toggle('is-active', c.dataset.area === area.id)
            );
        }

        // ------------------------------------------------------------
        // Build the 3×3×3 matrix of sub-cubes
        // ------------------------------------------------------------
        // Each sub-cube is a DOM element positioned via CSS custom
        // properties --tx, --ty, --tz on a 3-grid {-1, 0, +1}. Each has
        // 6 faces (front, back, right, left, top, bottom). Abbreviated
        // labels on every face make the content visible from any angle.
        const POSITIONS = [];
        for (let zz = -1; zz <= 1; zz++) {
            for (let yy = -1; yy <= 1; yy++) {
                for (let xx = -1; xx <= 1; xx++) {
                    POSITIONS.push({ x: xx, y: yy, z: zz });
                }
            }
        }

        const abbrOf = (name) => {
            const words = name.replace(/[·\u00B7]/g, ' ').split(/\s+/).filter(Boolean);
            if (words.length === 1) return words[0].substr(0, 3).toUpperCase();
            return words.slice(0, 3).map((w) => w.charAt(0).toUpperCase()).join('');
        };

        const frag = document.createDocumentFragment();
        AREAS.slice(0, 27).forEach((area, i) => {
            const pos = POSITIONS[i];
            const item = document.createElement('div');
            item.className = 'piano-cube-item';
            item.setAttribute('data-area', area.id);
            item.setAttribute('tabindex', '0');
            item.setAttribute('role', 'button');
            item.setAttribute('aria-label', 'Area: ' + area.name);
            item.style.setProperty('--gx', pos.x);
            item.style.setProperty('--gy', pos.y);
            item.style.setProperty('--gz', pos.z);

            const abbr = abbrOf(area.name);
            ['f', 'b', 'r', 'l', 't', 'd'].forEach((f) => {
                const face = document.createElement('div');
                face.className = 'piano-cube-face piano-cube-face-' + f;
                face.innerHTML = '<span class="piano-cube-face-abbr">' + abbr + '</span>';
                item.appendChild(face);
            });

            // Keyboard activation
            item.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    showArea(area);
                }
            });
            item.addEventListener('focus', () => showArea(area));

            // Hover tooltip
            item.addEventListener('mouseenter', (e) => {
                tooltip.textContent = area.name;
                tooltip.hidden = false;
            });
            item.addEventListener('mouseleave', () => {
                tooltip.hidden = true;
            });
            item.addEventListener('mousemove', (e) => {
                const rect = scene.getBoundingClientRect();
                tooltip.style.left = (e.clientX - rect.left) + 'px';
                tooltip.style.top  = (e.clientY - rect.top - 14) + 'px';
            });

            frag.appendChild(item);
        });
        space.appendChild(frag);

        // ------------------------------------------------------------
        // Rotation: pointer drag on the scene
        // ------------------------------------------------------------
        let rx = -22;   // rotateX (deg)
        let ry = 32;    // rotateY (deg)
        const applyRotation = () => {
            space.style.setProperty('--rx', rx + 'deg');
            space.style.setProperty('--ry', ry + 'deg');
        };
        applyRotation();

        let isDown = false;
        let hasDragged = false;
        let startX = 0, startY = 0, startRx = 0, startRy = 0;
        const DRAG_THRESHOLD = 5; // px

        scene.addEventListener('pointerdown', (e) => {
            if (e.button !== undefined && e.button !== 0) return;
            isDown = true;
            hasDragged = false;
            startX = e.clientX;
            startY = e.clientY;
            startRx = rx;
            startRy = ry;
            try { scene.setPointerCapture(e.pointerId); } catch (_) {}
            e.preventDefault();
        });

        scene.addEventListener('pointermove', (e) => {
            if (!isDown) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            if (!hasDragged && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
                hasDragged = true;
                scene.classList.add('is-dragging');
                tooltip.hidden = true;
            }
            if (hasDragged) {
                ry = startRy + dx * 0.45;
                rx = startRx - dy * 0.45;
                // Clamp vertical to avoid upside-down disorientation
                rx = Math.max(-82, Math.min(82, rx));
                applyRotation();
            }
        });

        const endDrag = (e) => {
            if (!isDown) return;
            if (!hasDragged) {
                // Click — find the cube under the pointer
                const target = document.elementFromPoint(e.clientX, e.clientY);
                const cube = target && target.closest && target.closest('.piano-cube-item');
                if (cube) {
                    const area = AREAS.find((a) => a.id === cube.dataset.area);
                    if (area) showArea(area);
                }
            }
            isDown = false;
            hasDragged = false;
            scene.classList.remove('is-dragging');
        };
        scene.addEventListener('pointerup', endDrag);
        scene.addEventListener('pointercancel', () => {
            isDown = false;
            hasDragged = false;
            scene.classList.remove('is-dragging');
        });

        // Subtle auto-orbit while idle (disabled once the user interacts)
        let hasInteracted = false;
        scene.addEventListener('pointerdown', () => { hasInteracted = true; }, { once: true });
        const nowMs = () =>
            (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        let lastT = nowMs();
        const autoOrbit = () => {
            const now = nowMs();
            const dt = Math.min(60, now - lastT); // clamp to avoid huge jumps after tab switch
            lastT = now;
            if (!hasInteracted && !isDown && isFinite(dt)) {
                ry += dt * 0.008;
                applyRotation();
            }
            requestAnimationFrame(autoOrbit);
        };
        if (!window.matchMedia || !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            requestAnimationFrame(autoOrbit);
        }

        // Initial state: show the first area in the detail panel
        showArea(AREAS[0]);
    })();

    // ==========================================
    // GANTT CHART
    // ==========================================
    const ganttBody = document.getElementById('ganttBody');
    if (ganttBody) {
        // Timeline: 13 colonne = Apr..Dic (Anno N, 9 mesi) + Gen..Apr (Anno N+1, 4 mesi)
        // Timeline: 13 colonne = Apr..Dic (Anno N, 9 mesi) + Gen..Apr (Anno N+1, 4 mesi)
        // Indici: 0=Apr, 1=Mag, 2=Giu, 3=Lug, 4=Ago, 5=Set, 6=Ott, 7=Nov, 8=Dic, 9=Gen+1, 10=Feb+1, 11=Mar+1, 12=Apr+1
        const TOTAL_COLS = 13;
        const monthLabels = ['Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic','Gen','Feb','Mar','Apr'];

        const ganttData = [
            { label: 'Accettazione incarico',      phase: 'accettazione', start: 0, end: 3,  color: '#0A2844' },
            { label: 'Pianificazione strategica',   phase: 'planning',    start: 2, end: 5,  color: '#164068' },
            { label: 'Comprensione azienda',        phase: 'planning',    start: 2, end: 6,  color: '#164068' },
            { label: 'Valutazione rischi',          phase: 'planning',    start: 4, end: 7,  color: '#164068' },
            { label: 'Test controlli interni',      phase: 'interim',     start: 5, end: 8,  color: '#2A5A85' },
            { label: 'Analisi processi chiave',     phase: 'interim',     start: 5, end: 9,  color: '#2A5A85' },
            { label: 'Verifiche interim',           phase: 'interim',     start: 6, end: 9,  color: '#2A5A85' },
            { label: 'Comunicazioni periodiche',    phase: 'interim',     start: 5, end: 12, color: '#2A5A85' },
            { label: 'Procedure sostanziali',       phase: 'final',       start: 9, end: 12, color: '#3C6FA0' },
            { label: 'Conferme esterne',            phase: 'final',       start: 9, end: 11, color: '#3C6FA0' },
            { label: 'Verifica eventi successivi',  phase: 'final',       start: 10,end: 12, color: '#3C6FA0' },
            { label: 'Management Letter',           phase: 'final',       start: 11,end: 12, color: '#5B89B8' },
            { label: 'Relazione di revisione',      phase: 'final',       start: 12,end: 13, color: '#5B89B8', halfFirst: true, tooltipRange: '1 Apr \u2192 15 Apr' },
        ];

        function renderGantt(filter) {
            ganttBody.innerHTML = '';
            ganttData.forEach((item, idx) => {
                const row = document.createElement('div');
                row.className = 'gantt-row';
                if (filter !== 'all' && item.phase !== filter) {
                    row.classList.add('hidden');
                }

                const label = document.createElement('div');
                label.className = 'gantt-row-label';
                label.innerHTML = '<span class="row-dot" style="color:' + item.color + '"></span>' + item.label;

                const bars = document.createElement('div');
                bars.className = 'gantt-bars';
                bars.style.gridTemplateColumns = 'repeat(' + TOTAL_COLS + ', 1fr)';

                const bar = document.createElement('div');
                bar.className = 'gantt-bar';
                // Bars that end in the Apr N+1 delivery column get a "tail"
                // class so the tooltip anchors to the right and doesn't clip.
                if (item.end >= 13) bar.classList.add('gantt-bar-tail');
                // Bars that occupy only the first half of their grid cell
                // (e.g. Relazione di revisione: 1-15 Aprile)
                if (item.halfFirst) bar.classList.add('gantt-bar-half-first');
                bar.style.gridColumn = (item.start + 1) + ' / ' + (item.end + 1);
                bar.style.background = item.color;
                bar.style.animationDelay = (idx * 0.06) + 's';

                const duration = item.end - item.start;

                const tooltip = document.createElement('div');
                tooltip.className = 'gantt-bar-tooltip';
                const fromLabel = monthLabels[item.start];
                const toLabel = monthLabels[item.end - 1];
                const rangeText = item.tooltipRange || (fromLabel + ' \u2192 ' + toLabel + ' \u00B7 ' + duration + ' mes' + (duration === 1 ? 'e' : 'i'));
                tooltip.innerHTML = '<strong>' + item.label + '</strong><br>' + rangeText;
                bar.appendChild(tooltip);

                bars.appendChild(bar);
                row.appendChild(label);
                row.appendChild(bars);
                ganttBody.appendChild(row);
            });
        }

        renderGantt('all');

        document.querySelectorAll('.gantt-filter').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.gantt-filter').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderGantt(btn.dataset.filter);
            });
        });
    }

    // ==========================================
    // BENEFIT MINI-CHARTS (Canvas)
    // ==========================================
    const chartConfigs = {
        credibilita: {
            type: 'bar',
            labels: ['Senza revisione', 'Con revisione'],
            data: [45, 80],
            unit: '/100',
            axisLabel: 'Indice di affidabilita\' bancaria',
            colors: ['rgba(26,58,92,0.25)', '#164068']
        },
        rischio: {
            type: 'bar',
            labels: ['Prima', 'Dopo 1 anno', 'Dopo 3 anni'],
            data: [85, 50, 35],
            unit: '/100',
            axisLabel: 'Indice di rischio frodi',
            colors: ['#0A2844', '#2A5A85', '#5B89B8']
        },
        compliance: {
            type: 'bar',
            labels: ['Sanzioni', 'Contenziosi', 'Risk fiscale'],
            data: [95, 90, 88],
            unit: '%',
            axisLabel: 'Copertura conformita\' normativa',
            colors: ['#0A2844', '#164068', '#2A5A85']
        },
        efficienza: {
            type: 'bar',
            labels: ['Anno 1', 'Anno 2', 'Anno 3'],
            data: [10, 18, 25],
            unit: '%',
            axisLabel: 'Incremento efficienza processi',
            colors: ['#5B89B8', '#2A5A85', '#164068']
        }
    };

    document.querySelectorAll('[data-chart]').forEach(canvas => {
        const key = canvas.dataset.chart;
        const config = chartConfigs[key];
        if (!config) return;

        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = 150 * dpr;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = '150px';
        ctx.scale(dpr, dpr);

        const w = rect.width;
        const h = 150;
        const padding = { top: 36, right: 10, bottom: 30, left: 10 };
        const chartW = w - padding.left - padding.right;
        const chartH = h - padding.top - padding.bottom;
        const barW = Math.min(44, chartW / config.data.length - 16);
        const maxVal = Math.max(...config.data);
        const unit = config.unit || '';

        let animP = 0;

        function drawBenefitChart(progress) {
            ctx.clearRect(0, 0, w, h);

            // Axis title (top)
            if (config.axisLabel) {
                ctx.font = '10px Inter';
                ctx.fillStyle = '#94a3b8';
                ctx.textAlign = 'center';
                ctx.fillText(config.axisLabel, w / 2, 14);
            }

            // Base line
            ctx.beginPath();
            ctx.moveTo(padding.left, h - padding.bottom);
            ctx.lineTo(w - padding.right, h - padding.bottom);
            ctx.strokeStyle = '#e2e8f0';
            ctx.lineWidth = 1;
            ctx.stroke();

            config.data.forEach((val, i) => {
                const x = padding.left + (chartW / config.data.length) * i + (chartW / config.data.length - barW) / 2;
                const barH = (val / maxVal) * chartH * progress;
                const y = h - padding.bottom - barH;

                // Bar
                ctx.beginPath();
                const radius = 4;
                ctx.moveTo(x + radius, y);
                ctx.lineTo(x + barW - radius, y);
                ctx.quadraticCurveTo(x + barW, y, x + barW, y + radius);
                ctx.lineTo(x + barW, h - padding.bottom);
                ctx.lineTo(x, h - padding.bottom);
                ctx.lineTo(x, y + radius);
                ctx.quadraticCurveTo(x, y, x + radius, y);
                ctx.fillStyle = config.colors[i] || config.colors[0];
                ctx.fill();

                // Value on top with unit
                if (progress > 0.8) {
                    ctx.font = 'bold 11px Inter';
                    ctx.fillStyle = '#164068';
                    ctx.textAlign = 'center';
                    ctx.fillText(val + unit, x + barW / 2, y - 6);
                }

                // Label
                ctx.font = '9px Inter';
                ctx.fillStyle = '#94a3b8';
                ctx.textAlign = 'center';
                ctx.fillText(config.labels[i], x + barW / 2, h - 6);
            });
        }

        // Animate on scroll
        const chartObserver = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                animP = 0;
                function anim() {
                    animP += 0.04;
                    if (animP > 1) animP = 1;
                    drawBenefitChart(animP);
                    if (animP < 1) requestAnimationFrame(anim);
                }
                anim();
                chartObserver.unobserve(canvas);
            }
        }, { threshold: 0.5 });
        chartObserver.observe(canvas);
    });

    // ==========================================
    // STIMA ORE SIMULATOR
    // ==========================================
    const roiAttivo = document.getElementById('roiAttivo');
    const roiRicavi = document.getElementById('roiRicavi');
    const roiSettore = document.getElementById('roiSettore');
    const roiRischio = document.getElementById('roiRischio');
    const attivitaCanvas = document.getElementById('attivitaChart');

    if (roiAttivo && roiRicavi && roiSettore && roiRischio) {
        const numFmt = new Intl.NumberFormat('it-IT');
        const eurFmt = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

        function parseNumero(str) {
            if (!str) return 0;
            const cleaned = String(str).replace(/[.\s]/g, '').replace(',', '.');
            const n = parseFloat(cleaned);
            return isNaN(n) ? 0 : n;
        }

        function formatInputNumero(el) {
            const raw = parseNumero(el.value);
            if (raw <= 0) { el.value = ''; return 0; }
            el.value = numFmt.format(raw);
            return raw;
        }

        // Scaglioni CNDCEC (identici a stima-ore-test)
        function oreBaseDaMedia(media) {
            if (media <= 0) return 0;
            if (media <= 2000000)  return 80;
            if (media <= 5000000)  return 130;
            if (media <= 7000000)  return 160;
            if (media <= 10000000) return 180;
            if (media <= 15000000) return 220;
            if (media <= 20000000) return 250;
            if (media <= 30000000) return 310;
            if (media <= 40000000) return 360;
            return 400;
        }

        function calcolaOre() {
            const attivo = parseNumero(roiAttivo.value);
            const ricavi = parseNumero(roiRicavi.value);
            const media = (attivo + ricavi) / 2;
            const moltSettore = parseFloat(roiSettore.value) || 1;
            const moltRischio = parseFloat(roiRischio.value) || 1;

            document.getElementById('roiMediaVal').textContent = eurFmt.format(media);

            // Ore CNDCEC
            const oreBase = oreBaseDaMedia(media);
            const oreFinali = Math.ceil(oreBase * moltSettore * moltRischio);

            document.getElementById('kpiOreBase').textContent = numFmt.format(oreBase) + ' h';
            document.getElementById('kpiMoltSettore').textContent = '\u00D7 ' + moltSettore.toFixed(2).replace('.', ',');
            document.getElementById('kpiMoltRischio').textContent = '\u00D7 ' + moltRischio.toFixed(2).replace('.', ',');
            document.getElementById('kpiOreFinali').textContent = numFmt.format(oreFinali) + ' h';
            document.getElementById('kpiY1').textContent = numFmt.format(oreFinali) + ' h';
            document.getElementById('kpiY2').textContent = numFmt.format(oreFinali) + ' h';
            document.getElementById('kpiY3').textContent = numFmt.format(oreFinali) + ' h';

            // Suddivisione attivita': 30% periodiche, 60% bilancio, 10% dichiarativi
            const oreVerifiche = Math.round(oreFinali * 0.30);
            const oreBilancio = Math.round(oreFinali * 0.60);
            const oreDichiarativi = oreFinali - oreVerifiche - oreBilancio;

            document.getElementById('oreVerifiche').textContent = numFmt.format(oreVerifiche) + ' h';
            document.getElementById('oreBilancio').textContent = numFmt.format(oreBilancio) + ' h';
            document.getElementById('oreDichiarativi').textContent = numFmt.format(oreDichiarativi) + ' h';

            // Draw activity donut chart (always, even when ore = 0)
            if (attivitaCanvas) {
                drawAttivitaChart(oreVerifiche, oreBilancio, oreDichiarativi, oreFinali);
            }
        }

        function drawAttivitaChart(verifiche, bilancio, dichiarativi, totale) {
            const ctx = attivitaCanvas.getContext('2d');
            const dpr = window.devicePixelRatio || 1;
            const rect = attivitaCanvas.parentElement.getBoundingClientRect();
            const w = rect.width;
            const h = 240;
            attivitaCanvas.width = w * dpr;
            attivitaCanvas.height = h * dpr;
            attivitaCanvas.style.width = w + 'px';
            attivitaCanvas.style.height = h + 'px';
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, w, h);

            const cx = w / 2;
            const cy = h / 2;
            const outerR = Math.min(110, Math.min(w, h) / 2 - 20);
            const innerR = outerR * 0.58;

            // When there are no hours, draw the donut using the canonical
            // 30/60/10 split so the chart is still visible as a placeholder.
            const isEmpty = totale <= 0;
            // Colors mirror the .attivita-card .attivita-bar backgrounds
            // below the donut so the chart and the cards are coherent.
            const segments = isEmpty ? [
                { val: 30, color: '#0A2844', label: 'Verifiche periodiche' },
                { val: 60, color: '#164068', label: 'Verifiche sul bilancio' },
                { val: 10, color: '#2A5A85', label: 'Controllo dichiarativi' },
            ] : [
                { val: verifiche,    color: '#0A2844', label: 'Verifiche periodiche' },
                { val: bilancio,     color: '#164068', label: 'Verifiche sul bilancio' },
                { val: dichiarativi, color: '#2A5A85', label: 'Controllo dichiarativi' },
            ];
            const sum = segments.reduce((a, s) => a + s.val, 0);

            // Donut slices
            let startAngle = -Math.PI / 2;
            segments.forEach(seg => {
                const sliceAngle = (seg.val / sum) * Math.PI * 2;
                ctx.beginPath();
                ctx.arc(cx, cy, outerR, startAngle, startAngle + sliceAngle);
                ctx.arc(cx, cy, innerR, startAngle + sliceAngle, startAngle, true);
                ctx.closePath();
                ctx.fillStyle = seg.color;
                if (isEmpty) ctx.globalAlpha = 0.35;
                ctx.fill();
                ctx.globalAlpha = 1;
                startAngle += sliceAngle;
            });

            // Center text
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            if (isEmpty) {
                ctx.font = 'bold 15px Montserrat';
                ctx.fillStyle = '#94a3b8';
                ctx.fillText('Inserisci i dati', cx, cy - 6);
                ctx.font = '10px Inter';
                ctx.fillStyle = '#cbd5e1';
                ctx.fillText('per vedere le ore', cx, cy + 12);
            } else {
                ctx.font = 'bold 28px Montserrat';
                ctx.fillStyle = '#0A2844';
                ctx.fillText(numFmt.format(totale) + ' h', cx, cy - 6);
                ctx.font = '11px Inter';
                ctx.fillStyle = '#94a3b8';
                ctx.fillText('ore annue', cx, cy + 16);
            }
        }

        // Wire events
        roiSettore.addEventListener('change', calcolaOre);
        roiRischio.addEventListener('change', calcolaOre);
        [roiAttivo, roiRicavi].forEach(el => {
            el.addEventListener('input', calcolaOre);
            el.addEventListener('blur', () => { formatInputNumero(el); calcolaOre(); });
        });

        calcolaOre();
    }

    // ==========================================
    // FADE-IN OBSERVER
    // ==========================================
    const fadeObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                fadeObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

    document.querySelectorAll('.fade-in, .beneficio-card, .step-card, .pilastro-item, .roi-kpi, .gantt-row, .risparmio-source').forEach(el => {
        el.classList.add('fade-in');
        fadeObserver.observe(el);
    });

    // ==========================================
    // WATERFALL CHART (Risparmio breakdown)
    // ==========================================
    const waterfallCanvas = document.getElementById('waterfallChart');
    if (waterfallCanvas) {
        const wCtx = waterfallCanvas.getContext('2d');
        const wDpr = window.devicePixelRatio || 1;

        function drawWaterfall(progress) {
            const rect = waterfallCanvas.parentElement.getBoundingClientRect();
            const w = Math.min(rect.width, 820);
            const h = 440;
            waterfallCanvas.width = w * wDpr;
            waterfallCanvas.height = h * wDpr;
            waterfallCanvas.style.width = w + 'px';
            waterfallCanvas.style.height = h + 'px';
            wCtx.setTransform(wDpr, 0, 0, wDpr, 0, 0);
            wCtx.clearRect(0, 0, w, h);

            // Layout: title area | chart area | axis+labels area
            const padding = { top: 70, right: 24, bottom: 90, left: 60 };
            const negSpace = 60; // space below zero line for negative bars
            const chartTop = padding.top;
            const zeroLineY = h - padding.bottom - negSpace;
            const chartH = zeroLineY - chartTop;

            // Data
            const items = [
                { label: 'Costo\nrevisione', value: -15000, color: '#0A2844' },
                { label: 'Errori\nevitati', value: 25000, color: '#132d47' },
                { label: 'Frodi\nprevenute', value: 75000, color: '#164068' },
                { label: 'Credito\nrisparmiato', value: 10000, color: '#2A5A85' },
                { label: 'Processi\nottimizzati', value: 12000, color: '#3C6FA0' },
                { label: 'Sanzioni\nevitate', value: 30000, color: '#5B89B8' },
            ];

            const netTotal = items.reduce((sum, i) => sum + i.value, 0);
            const maxPos = 160000; // max positive value we want to scale to chartH
            const maxNeg = 50000;  // max negative value we want to scale to negSpace
            const chartW = w - padding.left - padding.right;
            const barW = Math.min(76, chartW / items.length - 18);
            const gap = (chartW - barW * items.length) / (items.length + 1);

            const valueToY = (val) => {
                if (val >= 0) return zeroLineY - (val / maxPos) * chartH;
                return zeroLineY - (val / maxNeg) * negSpace;
            };

            // Zero line
            wCtx.strokeStyle = '#cbd5e1';
            wCtx.lineWidth = 1;
            wCtx.setLineDash([4, 4]);
            wCtx.beginPath();
            wCtx.moveTo(padding.left, zeroLineY);
            wCtx.lineTo(w - padding.right, zeroLineY);
            wCtx.stroke();
            wCtx.setLineDash([]);

            // Zero label
            wCtx.font = '10px Inter';
            wCtx.fillStyle = '#94a3b8';
            wCtx.textAlign = 'right';
            wCtx.fillText('0 \u20AC', padding.left - 8, zeroLineY + 3);

            // Running total waterfall
            let runningTotal = 0;

            items.forEach((item, i) => {
                const x = padding.left + gap + i * (barW + gap);
                const startY = valueToY(runningTotal);
                const endVal = runningTotal + item.value;
                const endY = valueToY(endVal);
                const animStartY = zeroLineY + (startY - zeroLineY) * progress;
                const animEndY = zeroLineY + (endY - zeroLineY) * progress;

                // Bar spans between startY and endY
                const barTop = Math.min(animStartY, animEndY);
                const barBottom = Math.max(animStartY, animEndY);
                const barHeight = barBottom - barTop;

                // Bar with rounded corners
                if (barHeight > 1) {
                    wCtx.beginPath();
                    const r = Math.min(4, barHeight / 2);
                    wCtx.moveTo(x + r, barTop);
                    wCtx.lineTo(x + barW - r, barTop);
                    wCtx.quadraticCurveTo(x + barW, barTop, x + barW, barTop + r);
                    wCtx.lineTo(x + barW, barBottom - r);
                    wCtx.quadraticCurveTo(x + barW, barBottom, x + barW - r, barBottom);
                    wCtx.lineTo(x + r, barBottom);
                    wCtx.quadraticCurveTo(x, barBottom, x, barBottom - r);
                    wCtx.lineTo(x, barTop + r);
                    wCtx.quadraticCurveTo(x, barTop, x + r, barTop);
                    wCtx.fillStyle = item.color;
                    wCtx.fill();
                }

                // Value label (above bar for positive, below for negative)
                if (progress > 0.7) {
                    wCtx.font = 'bold 12px Inter';
                    wCtx.fillStyle = item.color;
                    wCtx.textAlign = 'center';
                    const sign = item.value < 0 ? '-' : '+';
                    const valLabel = sign + Math.abs(item.value / 1000).toFixed(0) + 'k \u20AC';
                    if (item.value < 0) {
                        wCtx.fillText(valLabel, x + barW / 2, barBottom + 14);
                    } else {
                        wCtx.fillText(valLabel, x + barW / 2, barTop - 8);
                    }
                }

                // Connector line to next bar
                runningTotal = endVal;
                if (i < items.length - 1) {
                    const nextStartY = valueToY(runningTotal);
                    const animNextY = zeroLineY + (nextStartY - zeroLineY) * progress;
                    wCtx.beginPath();
                    wCtx.setLineDash([3, 3]);
                    wCtx.moveTo(x + barW, animEndY);
                    wCtx.lineTo(x + barW + gap, animNextY);
                    wCtx.strokeStyle = '#94a3b8';
                    wCtx.lineWidth = 1;
                    wCtx.stroke();
                    wCtx.setLineDash([]);
                }
            });

            // X-axis labels (drawn after bars, well below negSpace)
            wCtx.font = '11px Inter';
            wCtx.fillStyle = '#475569';
            wCtx.textAlign = 'center';
            items.forEach((item, i) => {
                const x = padding.left + gap + i * (barW + gap) + barW / 2;
                const lines = item.label.split('\n');
                const labelStartY = h - padding.bottom + 20;
                lines.forEach((line, li) => {
                    wCtx.fillText(line, x, labelStartY + li * 15);
                });
            });

            // Net result label (top-left)
            if (progress > 0.9) {
                wCtx.font = 'bold 14px Montserrat';
                wCtx.fillStyle = '#164068';
                wCtx.textAlign = 'left';
                wCtx.fillText('Valore netto generato: +' + (netTotal / 1000).toFixed(0) + '.000 \u20AC', padding.left, 26);

                wCtx.font = '11px Inter';
                wCtx.fillStyle = '#94a3b8';
                wCtx.textAlign = 'left';
                wCtx.fillText('Esempio su societa\' manifatturiera con rischio medio', padding.left, 46);
            }
        }

        const waterfallObserver = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                let wP = 0;
                function animW() {
                    wP += 0.025;
                    if (wP > 1) wP = 1;
                    drawWaterfall(wP);
                    if (wP < 1) requestAnimationFrame(animW);
                }
                animW();
                waterfallObserver.unobserve(waterfallCanvas);
            }
        }, { threshold: 0.3 });
        waterfallObserver.observe(waterfallCanvas);
    }

    // ==========================================
    // ORBIT PAUSE ON HOVER + SERVICE DETAILS
    // ==========================================
    const orbit = document.querySelector('.hub-orbit');
    const servizioDetail = document.getElementById('servizioDetail');

    const serviziData = {
        audit: {
            label: 'Core service',
            title: 'Audit & Assurance',
            desc: 'Revisione legale dei conti secondo la metodologia ISA Italia per societa\' private, Enti di Interesse Pubblico ed Enti Sottoposti a Regime Intermedio, ai sensi del D.Lgs. 39/2010.',
            list: [
                'Revisione di bilanci d\'esercizio e consolidati, principi italiani e internazionali',
                'Revisione di situazioni infrannuali e relazioni semestrali',
                'Revisione di reporting packages per gruppi multinazionali',
                'Visto di conformita\' per l\'utilizzo di crediti d\'imposta',
                'Certificazione dei requisiti per l\'ottenimento di crediti d\'imposta'
            ]
        },
        esg: {
            label: 'Sostenibilita\'',
            title: 'ESG & Sostenibilita\'',
            desc: 'Accompagniamo le imprese nell\'integrazione dei criteri ambientali, sociali e di governance, con servizi di assurance del bilancio di sostenibilita\' secondo lo standard europeo ESRS.',
            list: [
                'Consulenza strategica ESG e definizione del piano di sostenibilita\'',
                'Identificazione e gestione dei rischi climatici, sociali e di governance',
                'Redazione di report di sostenibilita\' conformi agli standard ESRS',
                'Revisione del bilancio di sostenibilita\' (assurance CSRD)',
                'Supporto nell\'accesso alla finanza sostenibile'
            ]
        },
        risk: {
            label: 'Compliance',
            title: 'Risk Advisory & Compliance',
            desc: 'Consulenza specialistica in materia di D.Lgs. 231/01 e D.Lgs. 262/05 per rafforzare il sistema di controllo interno e prevenire la responsabilita\' amministrativa degli enti.',
            list: [
                'Redazione e aggiornamento dei Modelli Organizzativi 231',
                'Supporto agli Organismi di Vigilanza (OdV)',
                'Affiancamento alla funzione di Internal Audit',
                'Verifiche periodiche di conformita\' normativa',
                'Esternalizzazione parziale o totale dell\'Internal Audit'
            ]
        },
        valuation: {
            label: 'Valutazioni',
            title: 'Business Valuation Services',
            desc: 'Servizi di valutazione erogati in conformita\' agli standard internazionali e alle best practice aziendali, a supporto di bilanci, operazioni straordinarie e contenziosi.',
            list: [
                'Valutazione del fair value di beni immateriali per il bilancio',
                'Valutazioni per acquisizioni, conferimenti, fusioni e cessioni',
                'Valutazioni di partecipazioni di maggioranza e minoranza',
                'Perizie valutative a supporto di controversie legali',
                'Supporto nella definizione del prezzo di cessione'
            ]
        },
        transaction: {
            label: 'M&A',
            title: 'Transaction Services',
            desc: 'Supporto ad aziende, investitori e private equity nelle operazioni straordinarie attraverso due diligence, acquisition investigation e business review di dettaglio.',
            list: [
                'Due diligence economico-finanziaria, contabile e organizzativa',
                'Due diligence fiscale e predisposizione di proiezioni economico-finanziarie',
                'Assistenza al processo di quotazione su mercati regolamentati',
                'Comfort letter per IPO e operazioni straordinarie',
                'Impairment test IAS 36 e Purchase Price Allocation IFRS 3'
            ]
        },
        litigation: {
            label: 'Contenzioso',
            title: 'Litigation Services',
            desc: 'Assistenza qualificata ad aziende, studi legali e organi giudicanti nell\'ambito di frodi, azioni di responsabilita\', contenziosi e procedure fallimentari.',
            list: [
                'Ricostruzione e documentazione di illeciti aziendali e frodi',
                'Quantificazione dei danni a supporto di studi legali',
                'Perizie contabili e assistenza a collegi arbitrali',
                'Determinazione di tassi di usura e anatocismo bancario',
                'Valutazione di azioni revocatorie in procedure concorsuali'
            ]
        },
        crisi: {
            label: 'Crisi d\'impresa',
            title: 'Crisi d\'Impresa',
            desc: 'Assistenza specializzata nella gestione della crisi d\'impresa, con sistemi di allerta precoce per l\'intercettazione tempestiva dei segnali di difficolta\' aziendale.',
            list: [
                'Assessment del sistema di allerta esistente',
                'Realizzazione di modelli di Early Warning System',
                'Rilevazione di squilibri patrimoniali, economici e finanziari',
                'Verifica della sostenibilita\' del debito e continuita\' aziendale',
                'Piani attestati di risanamento e accordi di ristrutturazione'
            ]
        }
    };

    const hubWrapper = document.querySelector('.servizi-hub-wrapper');

    function showServizioDetail(key) {
        if (!servizioDetail) return;
        const data = serviziData[key];
        if (!data) return;
        document.getElementById('servizioLabel').textContent = data.label;
        document.getElementById('servizioTitle').textContent = data.title;
        document.getElementById('servizioDesc').textContent = data.desc;
        const list = document.getElementById('servizioList');
        list.innerHTML = '';
        data.list.forEach(item => {
            const li = document.createElement('li');
            li.textContent = item;
            list.appendChild(li);
        });
        servizioDetail.classList.add('active');
        if (hubWrapper) hubWrapper.classList.add('active');
    }

    function hideServizioDetail() {
        if (servizioDetail) servizioDetail.classList.remove('active');
        if (hubWrapper) hubWrapper.classList.remove('active');
    }

    if (orbit && hubWrapper) {
        // Pause orbit when mouse is anywhere over the hub wrapper
        hubWrapper.addEventListener('mouseenter', () => {
            orbit.style.animationPlayState = 'paused';
            orbit.querySelectorAll('.hub-node').forEach(n => n.style.animationPlayState = 'paused');
        });
        hubWrapper.addEventListener('mouseleave', () => {
            orbit.style.animationPlayState = 'running';
            orbit.querySelectorAll('.hub-node').forEach(n => n.style.animationPlayState = 'running');
            hideServizioDetail();
        });

        orbit.querySelectorAll('.hub-node').forEach(node => {
            node.addEventListener('mouseenter', () => {
                showServizioDetail(node.dataset.service);
            });
            // Touch/click support for mobile
            node.addEventListener('click', (e) => {
                e.preventDefault();
                showServizioDetail(node.dataset.service);
            });
        });
    }

    // ==========================================
    // CONTACT FORM (same schema as all NGB pages)
    // ==========================================
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const formData = new FormData(contactForm);
            const data = Object.fromEntries(formData.entries());

            if (!data.nome || !data.cognome || !data.email || !data.azienda || !data.ruolo) {
                showNotification('Compila tutti i campi obbligatori.', 'error');
                return;
            }
            if (!data.privacy) {
                showNotification('Devi accettare il trattamento dei dati personali.', 'error');
                return;
            }

            const submitBtn = contactForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            submitBtn.textContent = 'Invio in corso...';
            submitBtn.disabled = true;

            const _n = new Date();
            const _pad = (x) => String(x).padStart(2, '0');
            const _ts = _pad(_n.getDate()) + '/' + _pad(_n.getMonth() + 1) + '/' + _n.getFullYear()
                      + ' ' + _pad(_n.getHours()) + ':' + _pad(_n.getMinutes()) + ':' + _pad(_n.getSeconds());

            const jsonData = {
                data:      _ts,
                pagina:    contactForm.dataset.pagina || 'Revisione Legale Demo - Contatto',
                nome:      data.nome,
                cognome:   data.cognome,
                email:     data.email,
                azienda:   data.azienda,
                ruolo:     data.ruolo,
                telefono:  data.telefono || '',
                messaggio: '',
                privacy:   !!data.privacy,
                marketing: !!data.marketing
            };

            var GOOGLE_SHEET_URL = 'https://script.google.com/macros/s/AKfycbyq8cvS_WNMFTMDi2jFhft-xnqnKjYDvIz5On9pfM66y5dGUzcXYZraAF03CCW-rJ-sQw/exec';

            fetch(GOOGLE_SHEET_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(jsonData)
            }).then(() => {
                showNotification('Grazie! La tua richiesta e\' stata inviata. Ti ricontatteremo al piu\' presto.', 'success');
                contactForm.reset();
            }).catch(() => {
                showNotification('Errore di connessione. Riprova o contattaci a info@nextgenerationbusiness.it', 'error');
            }).finally(() => {
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            });
        });
    }

    // ==========================================
    // NOTIFICATION SYSTEM
    // ==========================================
    function showNotification(message, type) {
        const existing = document.querySelector('.notification');
        if (existing) existing.remove();

        const notification = document.createElement('div');
        notification.className = 'notification notification-' + type;
        notification.innerHTML = '<span>' + message + '</span><button onclick="this.parentElement.remove()" aria-label="Chiudi">&times;</button>';

        Object.assign(notification.style, {
            position: 'fixed', bottom: '24px', right: '24px', maxWidth: '420px',
            padding: '16px 24px', borderRadius: '12px', display: 'flex',
            alignItems: 'center', gap: '12px', zIndex: '9999', fontSize: '0.95rem',
            fontFamily: 'Inter, sans-serif', animation: 'fadeInUp 0.4s ease-out',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            background: type === 'success' ? '#0A2844' : '#7f1d1d',
            color: '#f1f5f9',
            border: '1px solid ' + (type === 'success' ? '#2A5A85' : '#ef4444')
        });

        const closeBtn = notification.querySelector('button');
        Object.assign(closeBtn.style, {
            background: 'none', border: 'none', color: '#94a3b8',
            fontSize: '1.3rem', cursor: 'pointer', padding: '0', lineHeight: '1'
        });

        document.body.appendChild(notification);
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateY(12px)';
            notification.style.transition = '0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        }, 5000);
    }
});
