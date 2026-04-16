/**
 * Next Generation Business – Landing Page
 * Countdown, form validation, scroll animations, navigation
 */

document.addEventListener('DOMContentLoaded', () => {

    // ========================
    // SCROLL — native browser scroll, no library
    // ========================
    // The Roma page now relies on the browser's native scrolling.
    // No smooth-scroll library, no wheel hijacking, no snap:
    // scroll feels exactly like any normal web page.

    // ========================
    // NAVBAR SCROLL BEHAVIOR
    // ========================
    const navbar = document.getElementById('navbar');
    const navToggle = document.getElementById('navToggle');
    const navMenu = document.getElementById('navMenu');

    window.addEventListener('scroll', () => {
        if (window.scrollY > 60) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // Mobile menu toggle
    navToggle.addEventListener('click', () => {
        navToggle.classList.toggle('active');
        navMenu.classList.toggle('active');
        document.body.style.overflow = navMenu.classList.contains('active') ? 'hidden' : '';
    });

    // Close mobile menu on link click
    navMenu.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            navToggle.classList.remove('active');
            navMenu.classList.remove('active');
            document.body.style.overflow = '';
        });
    });

    // ========================
    // COUNTDOWN TIMER
    // ========================
    const eventDate = new Date('2026-04-29T14:00:00+02:00').getTime();
    const countdownEl = document.getElementById('countdown');
    const daysEl = document.getElementById('days');
    const hoursEl = document.getElementById('hours');
    const minutesEl = document.getElementById('minutes');
    const secondsEl = document.getElementById('seconds');

    function updateCountdown() {
        const now = new Date().getTime();
        const distance = eventDate - now;

        if (distance < 0) {
            countdownEl.innerHTML =
                '<p style="color: var(--accent); font-size: 1.1rem; font-weight: 600; letter-spacing: 1px;">L\'evento è in corso</p>';
            return;
        }

        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        if (daysEl) daysEl.textContent = String(days).padStart(2, '0');
        if (hoursEl) hoursEl.textContent = String(hours).padStart(2, '0');
        if (minutesEl) minutesEl.textContent = String(minutes).padStart(2, '0');
        if (secondsEl) secondsEl.textContent = String(seconds).padStart(2, '0');
    }

    updateCountdown();
    setInterval(updateCountdown, 1000);

    // ========================
    // SCROLL ANIMATIONS
    // ========================
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -40px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    const animateElements = document.querySelectorAll(
        '.about-card, .about-feature, .speaker-card, .timeline-item, ' +
        '.location-info, .location-map, .partner-category, .form-wrapper'
    );

    animateElements.forEach((el, index) => {
        el.classList.add('fade-in');
        el.style.transitionDelay = `${(index % 4) * 0.08}s`;
        observer.observe(el);
    });

    // ========================
    // HERO BACKGROUND PARTICLES
    // Subtle, slow-moving dots for a refined look
    // ========================
    const particlesContainer = document.getElementById('heroParticles');
    if (particlesContainer) {
        const style = document.createElement('style');
        style.textContent = `
            @keyframes particleDrift {
                0%   { transform: translateY(0) translateX(0); opacity: 0; }
                15%  { opacity: 0.6; }
                85%  { opacity: 0.6; }
                100% { transform: translateY(-120px) translateX(30px); opacity: 0; }
            }
        `;
        document.head.appendChild(style);

        for (let i = 0; i < 18; i++) {
            const particle = document.createElement('div');
            const size = Math.random() * 2.5 + 1;
            particle.style.cssText = `
                position: absolute;
                width: ${size}px;
                height: ${size}px;
                background: rgba(255, 255, 255, ${Math.random() * 0.15 + 0.05});
                border-radius: 50%;
                left: ${Math.random() * 100}%;
                top: ${Math.random() * 100}%;
                animation: particleDrift ${Math.random() * 15 + 20}s linear infinite;
                animation-delay: ${Math.random() * -30}s;
            `;
            particlesContainer.appendChild(particle);
        }
    }

    // ========================
    // FORM VALIDATION & SUBMIT
    // ========================
    const form = document.getElementById('accreditationForm');
    const submitBtn = document.getElementById('submitBtn');
    const formSuccess = document.getElementById('formSuccess');

    if (form) {
        const requiredFields = form.querySelectorAll('[required]');

        requiredFields.forEach(field => {
            if (field.type !== 'checkbox') {
                field.addEventListener('blur', () => validateField(field));
                field.addEventListener('input', () => {
                    if (field.classList.contains('error')) {
                        validateField(field);
                    }
                });
            }
        });

        form.addEventListener('submit', (e) => {
            e.preventDefault();

            let isValid = true;

            requiredFields.forEach(field => {
                if (!validateField(field)) {
                    isValid = false;
                }
            });

            if (!isValid) {
                const firstError = form.querySelector('.error');
                if (firstError) {
                    firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    firstError.focus();
                }
                return;
            }

            // Show loading state
            const btnText = submitBtn.querySelector('.btn-text');
            const btnLoading = submitBtn.querySelector('.btn-loading');
            btnText.style.display = 'none';
            btnLoading.style.display = 'inline-flex';
            submitBtn.disabled = true;

            // Build payload matching the shared NGB schema. Every form on
            // the domain posts to the same Google Sheet endpoint and the
            // `pagina` field identifies which page the submission came from.
            // `data` is a pre-formatted Italian timestamp so the sheet
            // always has a readable Date column without relying on the
            // Apps Script to call new Date() server-side.
            const NGB_SHEET_URL = 'https://script.google.com/macros/s/AKfycbyq8cvS_WNMFTMDi2jFhft-xnqnKjYDvIz5On9pfM66y5dGUzcXYZraAF03CCW-rJ-sQw/exec';

            const _n = new Date();
            const _pad = (x) => String(x).padStart(2, '0');
            const _ts = _pad(_n.getDate()) + '/' + _pad(_n.getMonth() + 1) + '/' + _n.getFullYear()
                      + ' ' + _pad(_n.getHours()) + ':' + _pad(_n.getMinutes()) + ':' + _pad(_n.getSeconds());

            const payload = {
                data:      _ts,
                pagina:    'Roma 29 Aprile 2026 - Iscrizione',
                nome:      (form.querySelector('#nome')    || {}).value || '',
                cognome:   (form.querySelector('#cognome') || {}).value || '',
                email:     (form.querySelector('#email')   || {}).value || '',
                azienda:   (form.querySelector('#azienda') || {}).value || '',
                ruolo:     (form.querySelector('#ruolo')   || {}).value || '',
                telefono:  (form.querySelector('#telefono')|| {}).value || '',
                messaggio: '',
                privacy:   !!(form.querySelector('#privacy')   && form.querySelector('#privacy').checked),
                marketing: !!(form.querySelector('#marketing') && form.querySelector('#marketing').checked)
            };

            fetch(NGB_SHEET_URL, {
                method:  'POST',
                mode:    'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(payload)
            }).then(() => {
                form.style.display = 'none';
                formSuccess.style.display = 'block';
                formSuccess.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }).catch(() => {
                btnText.style.display = 'inline-flex';
                btnLoading.style.display = 'none';
                submitBtn.disabled = false;

                // Show a lightweight inline error below the submit button
                let errEl = document.getElementById('submitError');
                if (!errEl) {
                    errEl = document.createElement('p');
                    errEl.id = 'submitError';
                    errEl.className = 'form-submit-error';
                    errEl.style.cssText = 'margin-top:14px;color:#B1213B;font-size:0.85rem;text-align:center;';
                    const footnote = submitBtn.parentElement.querySelector('.form-footnote');
                    if (footnote) footnote.after(errEl);
                    else submitBtn.parentElement.appendChild(errEl);
                }
                errEl.textContent = "Errore di connessione. Riprova più tardi o scrivici a info@nextgenerationbusiness.it";
            });
        });
    }

    function validateField(field) {
        const errorEl = document.getElementById(field.id + 'Error');

        if (field.type === 'checkbox') {
            if (!field.checked) {
                if (errorEl) errorEl.textContent = 'Campo obbligatorio';
                return false;
            }
            if (errorEl) errorEl.textContent = '';
            return true;
        }

        const value = field.value.trim();

        if (!value) {
            field.classList.add('error');
            if (errorEl) errorEl.textContent = 'Campo obbligatorio';
            return false;
        }

        if (field.type === 'email') {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(value)) {
                field.classList.add('error');
                if (errorEl) errorEl.textContent = 'Inserire un indirizzo email valido';
                return false;
            }
        }

        field.classList.remove('error');
        if (errorEl) errorEl.textContent = '';
        return true;
    }

    // ========================
    // SMOOTH SCROLL FOR ANCHORS
    // ========================
    // Native smooth-scroll with a fixed offset for the navbar.
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (!href || href === '#') return;
            const target = document.querySelector(href);
            if (!target) return;

            e.preventDefault();

            const offsetTop = target.getBoundingClientRect().top + window.pageYOffset - 80;
            window.scrollTo({
                top: offsetTop,
                behavior: 'smooth'
            });
        });
    });

    // ========================
    // ACTIVE NAV LINK ON SCROLL
    // ========================
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-menu a:not(.nav-cta)');

    function updateActiveNav() {
        const scrollPos = window.scrollY + 120;

        sections.forEach(section => {
            const top = section.offsetTop;
            const height = section.offsetHeight;
            const id = section.getAttribute('id');

            if (scrollPos >= top && scrollPos < top + height) {
                navLinks.forEach(link => {
                    link.classList.remove('active');
                    if (link.getAttribute('href') === '#' + id) {
                        link.classList.add('active');
                    }
                });
            }
        });
    }

    window.addEventListener('scroll', updateActiveNav);

    // Set timeline data-time attributes for mobile view
    document.querySelectorAll('.timeline-item').forEach(item => {
        const time = item.querySelector('.timeline-time');
        const content = item.querySelector('.timeline-content');
        if (time && content) {
            content.setAttribute('data-time', time.textContent.trim());
        }
    });

    // ==========================================
    // SPEAKERS SHOWCASE — interactive spotlight
    // 8 speakers grouped by organization; clicking a chip updates
    // the left spotlight card, which also auto-cycles every 7s
    // until the user interacts. Arrow keys and nav buttons also work.
    // ==========================================
    (function initSpeakersShowcase() {
        const showcase = document.getElementById('speakersShowcase');
        const spotlight = document.getElementById('speakerSpotlight');
        const rosterEl = document.getElementById('speakersRoster');
        const initialsEl = document.getElementById('spotlightInitials');
        const orgEl = document.getElementById('spotlightOrg');
        const nameEl = document.getElementById('spotlightName');
        const roleEl = document.getElementById('spotlightRole');
        const bioEl = document.getElementById('spotlightBio');
        const indexEl = document.getElementById('spotlightIndex');
        const totalEl = document.getElementById('spotlightTotal');
        const progressEl = document.getElementById('spotlightProgress');
        const prevBtn = document.getElementById('speakerPrev');
        const nextBtn = document.getElementById('speakerNext');
        if (!showcase || !spotlight || !rosterEl) return;
        // Idempotent: skip if already populated
        if (rosterEl.querySelector('.speaker-chip')) return;

        // --- Organization theming ---
        const ORGS = {
            unindustria: {
                name: 'Unindustria',
                glow: 'rgba(91, 137, 184, 0.55)',
                glowAlt: 'rgba(22, 64, 104, 0.32)',
                dot: '#5B89B8',
                avatar1: '#4A7FB0',
                avatar2: '#0F2A47'
            },
            revilaw: {
                name: 'Revilaw S.p.A.',
                glow: 'rgba(42, 90, 133, 0.55)',
                glowAlt: 'rgba(10, 40, 68, 0.4)',
                dot: '#2A5A85',
                avatar1: '#2A5A85',
                avatar2: '#0A2844'
            },
            advant: {
                name: 'Advant Nctm',
                glow: 'rgba(177, 33, 59, 0.45)',
                glowAlt: 'rgba(30, 10, 20, 0.45)',
                dot: '#B1213B',
                avatar1: '#8E1A30',
                avatar2: '#3A0E1A'
            },
            eni: {
                name: 'Eni S.p.A.',
                glow: 'rgba(250, 196, 50, 0.38)',
                glowAlt: 'rgba(30, 30, 20, 0.45)',
                dot: '#E6B94C',
                avatar1: '#C18F25',
                avatar2: '#3A2A0E'
            }
        };

        // --- Speakers data ---
        const SPEAKERS = [
            {
                name: 'Oscar Ricci',
                role: 'Presidente Piccola Industria di Roma',
                org: 'unindustria',
                bio: 'Presidente della Piccola Industria di Unindustria Roma, porta la voce delle PMI del Lazio sulle opportunit\u00E0 di sviluppo territoriale. Interviene sul ruolo delle Zone Logistiche Semplificate come leva di crescita per il tessuto produttivo locale e sui benefici concreti che l\u2019agevolazione pu\u00F2 generare per le imprese associate.'
            },
            {
                name: 'Eugenio Samori',
                role: 'Presidente Gruppo Giovani Imprenditori Unindustria',
                org: 'unindustria',
                bio: 'Presidente del Gruppo Giovani Imprenditori di Unindustria, rappresenta le istanze della nuova generazione imprenditoriale del Lazio. Porta il punto di vista delle imprese in crescita sul Rating di Legalit\u00E0 come strumento di competitivit\u00E0, accesso al credito e reputazione nei mercati di riferimento.'
            },
            {
                name: 'Vincenzo A. Napolitano',
                role: 'Equity Partner',
                org: 'revilaw',
                bio: 'Equity Partner di Revilaw, vanta una consolidata esperienza nel diritto societario, nella revisione legale e nella fiscalit\u00E0 d\u2019impresa. Affianca gruppi industriali e investitori nell\u2019analisi degli strumenti di sviluppo territoriale, con particolare riferimento alle Zone Logistiche Semplificate e alle opportunit\u00E0 connesse ai regimi agevolativi.'
            },
            {
                name: 'Stefano Pizzutelli',
                role: 'Presidente del Comitato Scientifico',
                org: 'revilaw',
                bio: 'Presidente del Comitato Scientifico di Revilaw, unisce l\u2019attivit\u00E0 professionale a un costante impegno di ricerca in materia di revisione legale, governance societaria e compliance. Riconosciuto esperto nel Rating di Legalit\u00E0, \u00E8 autore di pubblicazioni e interventi formativi su sistemi di controllo interno e responsabilit\u00E0 amministrativa degli enti.'
            },
            {
                name: 'Antonella Candelieri',
                role: 'Associate',
                org: 'revilaw',
                bio: 'Associate di Revilaw, focalizza la propria attivit\u00E0 sulla consulenza in materia di Rating di Legalit\u00E0, compliance e diritto societario. Assiste imprese e studi professionali nelle procedure di acquisizione e mantenimento del rating, curando profili reputazionali, organizzativi e di controllo, con specifica esperienza in operazioni straordinarie e due diligence.'
            },
            {
                name: 'Francesca Rogai',
                role: 'Avvocato',
                org: 'advant',
                bio: 'Avvocato dello studio Advant Nctm, esperta di diritto commerciale e contrattualistica d\u2019impresa. Affianca clienti italiani e internazionali in operazioni di M&A, ristrutturazioni societarie e contenzioso civile e commerciale, con particolare attenzione ai contesti regolamentari complessi e alle operazioni cross-border.'
            },
            {
                name: 'Francesco Follieri',
                role: 'Professore Avvocato',
                org: 'advant',
                bio: 'Professore Avvocato dello studio Advant Nctm, coniuga l\u2019attivit\u00E0 accademica a quella forense nel diritto amministrativo e nella regolamentazione dei settori produttivi. Assiste imprese e investitori sui profili autorizzatori applicabili alle Zone Logistiche Semplificate e sugli strumenti di promozione degli investimenti.'
            },
            {
                name: 'Ludovica Abbatiello',
                role: 'Relatrice',
                org: 'eni',
                bio: 'Rappresentante di Eni S.p.A., porta la testimonianza di uno dei principali operatori industriali italiani sulle strategie di investimento nelle aree logistiche e sui benefici operativi derivanti dal ricorso agli strumenti agevolativi previsti dalle Zone Logistiche Semplificate.'
            }
        ];

        const initialsOf = (name) =>
            name.split(/\s+/)
                .filter(Boolean)
                .slice(0, 3)
                .map((w) => w.replace(/[^A-Za-z\u00C0-\u017F]/g, '').charAt(0).toUpperCase())
                .join('');

        // --- Build the roster (grouped by organization) ---
        const grouped = {};
        SPEAKERS.forEach((sp, i) => {
            if (!grouped[sp.org]) grouped[sp.org] = [];
            grouped[sp.org].push({ ...sp, index: i });
        });

        Object.keys(ORGS).forEach((orgKey) => {
            const speakers = grouped[orgKey];
            if (!speakers || !speakers.length) return;
            const org = ORGS[orgKey];

            const group = document.createElement('div');
            group.className = 'speakers-group';
            group.style.setProperty('--org-dot', org.dot);
            group.style.setProperty('--org-avatar-1', org.avatar1);
            group.style.setProperty('--org-avatar-2', org.avatar2);

            const head = document.createElement('div');
            head.className = 'speakers-group-head';
            head.innerHTML = `
                <span class="speakers-group-dot" aria-hidden="true"></span>
                <h4 class="speakers-group-title">${org.name}</h4>
            `;
            group.appendChild(head);

            speakers.forEach((sp) => {
                const chip = document.createElement('button');
                chip.type = 'button';
                chip.className = 'speaker-chip';
                chip.setAttribute('role', 'tab');
                chip.setAttribute('data-index', sp.index);
                chip.setAttribute('aria-label', sp.name + ' — ' + sp.role);
                chip.innerHTML = `
                    <span class="speaker-chip-avatar" aria-hidden="true">${initialsOf(sp.name)}</span>
                    <span class="speaker-chip-info">
                        <span class="speaker-chip-name">${sp.name}</span>
                        <span class="speaker-chip-role">${sp.role}</span>
                    </span>
                `;
                chip.addEventListener('click', () => selectSpeaker(sp.index, true));
                chip.addEventListener('focus', () => selectSpeaker(sp.index, true));
                group.appendChild(chip);
            });

            rosterEl.appendChild(group);
        });

        totalEl.textContent = SPEAKERS.length;

        // --- Spotlight update ---
        let current = 0;
        let isAutoPlaying = true;
        const CYCLE_MS = 7000;

        function applyOrgTheme(orgKey) {
            const org = ORGS[orgKey] || ORGS.revilaw;
            spotlight.style.setProperty('--org-glow', org.glow);
            spotlight.style.setProperty('--org-glow-alt', org.glowAlt);
            spotlight.style.setProperty('--org-avatar-1', org.avatar1);
            spotlight.style.setProperty('--org-avatar-2', org.avatar2);
        }

        function renderSpotlight(i) {
            const sp = SPEAKERS[i];
            if (!sp) return;
            spotlight.classList.add('is-switching');

            // Fade out current content, then swap after transition
            setTimeout(() => {
                applyOrgTheme(sp.org);
                initialsEl.textContent = initialsOf(sp.name);
                orgEl.textContent = ORGS[sp.org] ? ORGS[sp.org].name : sp.org;
                nameEl.textContent = sp.name;
                roleEl.textContent = sp.role;
                bioEl.textContent = sp.bio;
                indexEl.textContent = (i + 1);

                // Highlight active chip
                rosterEl.querySelectorAll('.speaker-chip').forEach((c) => {
                    c.classList.toggle('is-active', parseInt(c.dataset.index, 10) === i);
                });

                // Fade back in
                requestAnimationFrame(() => spotlight.classList.remove('is-switching'));
            }, 180);
        }

        function selectSpeaker(i, userTriggered) {
            current = ((i % SPEAKERS.length) + SPEAKERS.length) % SPEAKERS.length;
            renderSpotlight(current);
            if (userTriggered) {
                isAutoPlaying = false;
                cycleStart = null; // resets progress bar on next frame
                progressEl.style.width = '0%';
            } else {
                cycleStart = null;
            }
        }

        // --- Auto cycle with progress bar ---
        let cycleStart = null;
        function tick(now) {
            if (isAutoPlaying) {
                if (cycleStart == null) cycleStart = now;
                const elapsed = now - cycleStart;
                const pct = Math.min(100, (elapsed / CYCLE_MS) * 100);
                progressEl.style.width = pct + '%';
                if (elapsed >= CYCLE_MS) {
                    current = (current + 1) % SPEAKERS.length;
                    renderSpotlight(current);
                    cycleStart = now;
                }
            }
            requestAnimationFrame(tick);
        }
        if (!window.matchMedia || !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            requestAnimationFrame(tick);
        }

        // Pause auto-cycle on hover/focus
        showcase.addEventListener('mouseenter', () => {
            isAutoPlaying = false;
        });
        showcase.addEventListener('mouseleave', () => {
            if (!document.activeElement || !showcase.contains(document.activeElement)) {
                isAutoPlaying = true;
                cycleStart = null;
            }
        });

        // Navigation buttons
        prevBtn.addEventListener('click', () => selectSpeaker(current - 1, true));
        nextBtn.addEventListener('click', () => selectSpeaker(current + 1, true));

        // Keyboard arrow support on the spotlight
        spotlight.setAttribute('tabindex', '0');
        spotlight.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') { e.preventDefault(); selectSpeaker(current - 1, true); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); selectSpeaker(current + 1, true); }
        });

        // Initial state
        selectSpeaker(0, false);
    })();

});
