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
    // GANTT CHART
    // ==========================================
    const ganttBody = document.getElementById('ganttBody');
    if (ganttBody) {
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
            { label: 'Relazione di revisione',      phase: 'final',       start: 12,end: 13, color: '#5B89B8' },
            { label: 'Management Letter',           phase: 'final',       start: 12,end: 13, color: '#5B89B8' },
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
                bar.style.gridColumn = (item.start + 1) + ' / ' + (item.end + 1);
                bar.style.background = item.color;
                bar.style.animationDelay = (idx * 0.08) + 's';

                const duration = item.end - item.start;
                const durLabel = document.createElement('span');
                durLabel.className = 'gantt-bar-duration';
                if (duration >= 2) {
                    durLabel.textContent = duration + ' mesi';
                } else {
                    durLabel.textContent = duration + ' mese';
                }
                bar.appendChild(durLabel);

                const tooltip = document.createElement('div');
                tooltip.className = 'gantt-bar-tooltip';
                const fromLabel = monthLabels[item.start];
                const toLabel = monthLabels[item.end - 1];
                tooltip.innerHTML = '<strong>' + item.label + '</strong><br>' + fromLabel + ' \u2192 ' + toLabel + ' \u00B7 ' + duration + ' mes' + (duration === 1 ? 'e' : 'i');
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
            colors: ['rgba(26,58,92,0.2)', '#1a3a5c']
        },
        rischio: {
            type: 'bar',
            labels: ['Prima', 'Dopo 1 anno', 'Dopo 3 anni'],
            data: [85, 50, 35],
            colors: ['#0A2844', '#2A5A85', '#5B89B8']
        },
        compliance: {
            type: 'bar',
            labels: ['Sanzioni', 'Contenziosi', 'Rischio fiscale'],
            data: [95, 90, 88],
            colors: ['#0A2844', '#164068', '#2A5A85']
        },
        efficienza: {
            type: 'bar',
            labels: ['Anno 1', 'Anno 2', 'Anno 3'],
            data: [10, 18, 25],
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
        canvas.height = 120 * dpr;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = '120px';
        ctx.scale(dpr, dpr);

        const w = rect.width;
        const h = 120;
        const padding = { top: 20, right: 10, bottom: 24, left: 10 };
        const chartW = w - padding.left - padding.right;
        const chartH = h - padding.top - padding.bottom;
        const barW = Math.min(40, chartW / config.data.length - 16);
        const maxVal = Math.max(...config.data);

        let animP = 0;

        function drawBenefitChart(progress) {
            ctx.clearRect(0, 0, w, h);

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

                // Value on top
                if (progress > 0.8) {
                    ctx.font = 'bold 11px Inter';
                    ctx.fillStyle = '#1a3a5c';
                    ctx.textAlign = 'center';
                    ctx.fillText(val + (key === 'efficienza' ? '%' : ''), x + barW / 2, y - 6);
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

            // Draw activity donut chart
            if (attivitaCanvas && oreFinali > 0) {
                drawAttivitaChart(oreVerifiche, oreBilancio, oreDichiarativi, oreFinali);
            }
        }

        function drawAttivitaChart(verifiche, bilancio, dichiarativi, totale) {
            const ctx = attivitaCanvas.getContext('2d');
            const dpr = window.devicePixelRatio || 1;
            const rect = attivitaCanvas.parentElement.getBoundingClientRect();
            const w = rect.width;
            const h = 260;
            attivitaCanvas.width = w * dpr;
            attivitaCanvas.height = h * dpr;
            attivitaCanvas.style.width = w + 'px';
            attivitaCanvas.style.height = h + 'px';
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, w, h);

            const cx = w / 2;
            const cy = 115;
            const outerR = Math.min(95, w / 2 - 40);
            const innerR = outerR * 0.58;

            const segments = [
                { val: verifiche, color: '#0A2844', label: 'Verifiche periodiche', pct: '30%' },
                { val: bilancio, color: '#164068', label: 'Verifiche sul bilancio', pct: '60%' },
                { val: dichiarativi, color: '#2A5A85', label: 'Controllo dichiarativi', pct: '10%' },
            ];

            // Donut
            let startAngle = -Math.PI / 2;
            segments.forEach(seg => {
                const sliceAngle = (seg.val / totale) * Math.PI * 2;
                ctx.beginPath();
                ctx.arc(cx, cy, outerR, startAngle, startAngle + sliceAngle);
                ctx.arc(cx, cy, innerR, startAngle + sliceAngle, startAngle, true);
                ctx.closePath();
                ctx.fillStyle = seg.color;
                ctx.fill();
                startAngle += sliceAngle;
            });

            // Center text
            ctx.font = 'bold 24px Montserrat';
            ctx.fillStyle = '#0A2844';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(numFmt.format(totale) + ' h', cx, cy - 6);
            ctx.font = '11px Inter';
            ctx.fillStyle = '#94a3b8';
            ctx.fillText('ore annue', cx, cy + 14);

            // Legend below donut
            const legendY = cy + outerR + 24;
            segments.forEach((seg, i) => {
                const lx = 16;
                const ly = legendY + i * 22;

                ctx.fillStyle = seg.color;
                ctx.beginPath();
                ctx.roundRect(lx, ly, 12, 12, 2);
                ctx.fill();

                ctx.font = '12px Inter';
                ctx.fillStyle = '#475569';
                ctx.textAlign = 'left';
                ctx.fillText(seg.label + '  ' + seg.pct + '  (' + numFmt.format(seg.val) + ' h)', lx + 18, ly + 10);
            });
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
                wCtx.fillText('Esempio su fatturato 5M\u20AC, rischio medio', padding.left, 46);
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
    // ORBIT PAUSE ON HOVER
    // ==========================================
    const orbit = document.querySelector('.hub-orbit');
    if (orbit) {
        orbit.addEventListener('mouseenter', () => {
            orbit.style.animationPlayState = 'paused';
            orbit.querySelectorAll('.hub-node').forEach(n => n.style.animationPlayState = 'paused');
        });
        orbit.addEventListener('mouseleave', () => {
            orbit.style.animationPlayState = 'running';
            orbit.querySelectorAll('.hub-node').forEach(n => n.style.animationPlayState = 'running');
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
