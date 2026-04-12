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
        const ganttData = [
            { label: 'Accettazione incarico', phase: 'planning', start: 0, end: 1, color: '#1a3a5c' },
            { label: 'Pianificazione strategica', phase: 'planning', start: 1, end: 3, color: '#1a3a5c' },
            { label: 'Comprensione azienda', phase: 'planning', start: 1, end: 4, color: '#1a3a5c' },
            { label: 'Valutazione rischi', phase: 'planning', start: 2, end: 4, color: '#1a3a5c' },
            { label: 'Test controlli interni', phase: 'interim', start: 3, end: 6, color: '#2a6496' },
            { label: 'Verifiche interim', phase: 'interim', start: 5, end: 8, color: '#2a6496' },
            { label: 'Analisi processi chiave', phase: 'interim', start: 4, end: 7, color: '#2a6496' },
            { label: 'Comunicazioni periodiche', phase: 'interim', start: 3, end: 10, color: '#2a6496' },
            { label: 'Procedure sostanziali', phase: 'final', start: 8, end: 11, color: '#3d8fd4' },
            { label: 'Conferme esterne', phase: 'final', start: 9, end: 11, color: '#3d8fd4' },
            { label: 'Verifica eventi successivi', phase: 'final', start: 10, end: 11, color: '#3d8fd4' },
            { label: 'Relazione di revisione', phase: 'final', start: 11, end: 12, color: '#10b981' },
            { label: 'Management Letter', phase: 'final', start: 11, end: 12, color: '#10b981' },
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
                label.innerHTML = `<span class="row-dot" style="background:${item.color}"></span>${item.label}`;

                const bars = document.createElement('div');
                bars.className = 'gantt-bars';

                const bar = document.createElement('div');
                bar.className = 'gantt-bar';
                bar.style.gridColumn = `${item.start + 1} / ${item.end + 1}`;
                bar.style.background = item.color;
                bar.style.animationDelay = (idx * 0.08) + 's';

                const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
                const tooltip = document.createElement('div');
                tooltip.className = 'gantt-bar-tooltip';
                tooltip.textContent = `${months[item.start]} - ${months[item.end - 1]}`;
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
            colors: ['#dc2626', '#f59e0b', '#10b981']
        },
        compliance: {
            type: 'bar',
            labels: ['Sanzioni', 'Contenziosi', 'Rischio fiscale'],
            data: [95, 90, 88],
            colors: ['#1a3a5c', '#2a6496', '#3d8fd4']
        },
        efficienza: {
            type: 'bar',
            labels: ['Anno 1', 'Anno 2', 'Anno 3'],
            data: [10, 18, 25],
            colors: ['#3d8fd4', '#2a6496', '#1a3a5c']
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
    // ROI SIMULATOR
    // ==========================================
    const roiFatturato = document.getElementById('roiFatturato');
    const roiDipendenti = document.getElementById('roiDipendenti');
    const roiSettore = document.getElementById('roiSettore');
    const roiChart = document.getElementById('roiChart');

    if (roiFatturato && roiDipendenti && roiSettore && roiChart) {
        const roiCtx = roiChart.getContext('2d');
        const dpr = window.devicePixelRatio || 1;

        function fmt(n) {
            return n.toLocaleString('it-IT');
        }

        function calculateROI() {
            const fatturato = parseInt(roiFatturato.value);
            const dipendenti = parseInt(roiDipendenti.value);
            const rischio = parseFloat(roiSettore.value);

            // Display slider values
            document.getElementById('roiFatturatoVal').textContent = fmt(fatturato) + ' \u20AC';
            document.getElementById('roiDipendentiVal').textContent = dipendenti;

            // Estimate audit cost (simplified model)
            const baseCost = Math.max(8000, fatturato * 0.001 + dipendenti * 80);
            const costo = Math.round(baseCost * rischio);

            // Estimate savings
            const prevenzioneFrodi = fatturato * 0.005 * rischio;
            const efficienza = fatturato * 0.003;
            const reputazione = fatturato * 0.002;
            const sanzioni = fatturato * 0.004 * rischio;
            const risparmio = Math.round(prevenzioneFrodi + efficienza + reputazione + sanzioni);
            const roi = Math.round(((risparmio - costo) / costo) * 100);
            const payback = Math.max(1, Math.round((costo / risparmio) * 12));

            // Update KPIs
            document.getElementById('kpiCosto').textContent = fmt(costo) + ' \u20AC';
            document.getElementById('kpiRisparmio').textContent = fmt(risparmio) + ' \u20AC';
            document.getElementById('kpiROI').textContent = roi + '%';
            document.getElementById('kpiPayback').textContent = payback + ' mesi';

            // Draw donut chart
            drawROIChart(prevenzioneFrodi, efficienza, reputazione, sanzioni, costo);
        }

        function drawROIChart(frodi, efficienza, reputazione, sanzioni, costo) {
            const rect = roiChart.parentElement.getBoundingClientRect();
            const w = rect.width;
            const h = 300;
            roiChart.width = w * dpr;
            roiChart.height = h * dpr;
            roiChart.style.width = w + 'px';
            roiChart.style.height = h + 'px';
            roiCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

            const cx = w / 2;
            const cy = 140;
            const outerR = 110;
            const innerR = 65;
            const total = frodi + efficienza + reputazione + sanzioni;

            const segments = [
                { val: frodi, color: '#1a3a5c', label: 'Prevenzione frodi' },
                { val: efficienza, color: '#2a6496', label: 'Efficienza operativa' },
                { val: reputazione, color: '#3d8fd4', label: 'Reputazione' },
                { val: sanzioni, color: '#10b981', label: 'Riduzione sanzioni' },
            ];

            roiCtx.clearRect(0, 0, w, h);

            // Draw donut
            let startAngle = -Math.PI / 2;
            segments.forEach(seg => {
                const sliceAngle = (seg.val / total) * Math.PI * 2;
                roiCtx.beginPath();
                roiCtx.arc(cx, cy, outerR, startAngle, startAngle + sliceAngle);
                roiCtx.arc(cx, cy, innerR, startAngle + sliceAngle, startAngle, true);
                roiCtx.closePath();
                roiCtx.fillStyle = seg.color;
                roiCtx.fill();
                startAngle += sliceAngle;
            });

            // Center text
            roiCtx.font = 'bold 22px Montserrat';
            roiCtx.fillStyle = '#1a3a5c';
            roiCtx.textAlign = 'center';
            roiCtx.textBaseline = 'middle';
            roiCtx.fillText(fmt(Math.round(total)) + ' \u20AC', cx, cy - 8);
            roiCtx.font = '11px Inter';
            roiCtx.fillStyle = '#94a3b8';
            roiCtx.fillText('Risparmio totale', cx, cy + 14);

            // Legend below
            const legendY = cy + outerR + 30;
            const legendCols = 2;
            const colW = w / legendCols;
            segments.forEach((seg, i) => {
                const col = i % legendCols;
                const row = Math.floor(i / legendCols);
                const lx = col * colW + 20;
                const ly = legendY + row * 24;

                roiCtx.fillStyle = seg.color;
                roiCtx.beginPath();
                roiCtx.roundRect(lx, ly, 12, 12, 2);
                roiCtx.fill();

                roiCtx.font = '12px Inter';
                roiCtx.fillStyle = '#475569';
                roiCtx.textAlign = 'left';
                const pct = Math.round((seg.val / total) * 100);
                roiCtx.fillText(seg.label + ' (' + pct + '%)', lx + 18, ly + 10);
            });
        }

        roiFatturato.addEventListener('input', calculateROI);
        roiDipendenti.addEventListener('input', calculateROI);
        roiSettore.addEventListener('change', calculateROI);

        // Initial calculation
        calculateROI();
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

    document.querySelectorAll('.fade-in, .beneficio-card, .step-card, .pilastro-item, .roi-kpi, .gantt-row').forEach(el => {
        el.classList.add('fade-in');
        fadeObserver.observe(el);
    });

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
});
