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
    const eventDate = new Date('2026-10-02T09:00:00+02:00').getTime();
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
        '.about-card, .about-feature, .speaker-item, .timeline-item, ' +
        '.location-info, .location-map, .partner-category, .form-wrapper, ' +
        '.tema-card, .evento-intro, .evento-quote, .matching-band, ' +
        '.section-header, .form-benefits-strip, .partner-brand, .register-card'
    );

    animateElements.forEach((el, index) => {
        el.classList.add('fade-in');
        el.style.transitionDelay = `${(index % 4) * 0.08}s`;
        observer.observe(el);
    });

    // Fail-safe: never leave content permanently hidden. If the observer
    // hasn't revealed an element (unusual rendering contexts, prerender, etc.),
    // reveal everything after a short delay so nothing stays invisible.
    setTimeout(function () {
        document.querySelectorAll('.fade-in:not(.visible)').forEach(function (el) {
            el.classList.add('visible');
        });
    }, 2500);

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
                pagina:    'Napoli 2 Ottobre 2026 - Manifestazione di interesse',
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
});


/* ===== Relationships interactive graph (Relatori section) ===== */
(function initRelGraph() {
    var graph = document.getElementById('relGraph');
    if (!graph) return;
    var names = { ist: 'Istituzioni', banc: 'Mondo bancario', prof: 'Professioni', impr: 'Imprenditoria' };
    var REL = {
        impr: [
            { to: 'ist',  text: "Coglie le opportunità di sviluppo, gli incentivi e i programmi promossi dalle istituzioni." },
            { to: 'banc', text: "Costruisce il proprio merito creditizio per accedere a credito e investimenti a condizioni migliori." },
            { to: 'prof', text: "Si affida ai professionisti per dotarsi di assetti, governance e controlli evoluti." }
        ],
        ist: [
            { to: 'impr', text: "Offrono alle imprese opportunità di sviluppo del territorio, incentivi e grandi programmi come Bagnoli e l'America's Cup 2027." },
            { to: 'banc', text: "Definiscono garanzie pubbliche e strumenti di finanza agevolata che orientano il credito." },
            { to: 'prof', text: "Stabiliscono le regole (Modello 231, Rating di Legalità, ESG) che i professionisti aiutano ad applicare." }
        ],
        banc: [
            { to: 'impr', text: "Valutano affidabilità e merito creditizio dell'impresa e ne sostengono la crescita con il credito." },
            { to: 'ist',  text: "Operano con le garanzie e gli strumenti pubblici della finanza agevolata." },
            { to: 'prof', text: "Leggono bilanci, rating ed ESG predisposti dai professionisti per decidere se e come finanziare." }
        ],
        prof: [
            { to: 'impr', text: "Costruiscono adeguati assetti, governance, compliance e rendicontazione che rendono l'impresa più solida." },
            { to: 'banc', text: "Traducono la solidità dell'impresa in dati e rating leggibili e affidabili per le banche." },
            { to: 'ist',  text: "Assicurano la conformità alle norme e l'accesso agli strumenti messi a disposizione dalle istituzioni." }
        ]
    };
    var titleEl = document.getElementById('relTitle');
    var listEl  = document.getElementById('relList');
    var nodes = graph.querySelectorAll('.rel-node');
    var edges = graph.querySelectorAll('.rel-edge');
    function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
    function setActive(key) {
        nodes.forEach(function (n) {
            var k = n.getAttribute('data-key');
            n.classList.toggle('active', k === key);
            n.classList.toggle('dim', k !== key);
            n.setAttribute('aria-pressed', k === key ? 'true' : 'false');
        });
        edges.forEach(function (e) {
            var on = e.getAttribute('data-a') === key || e.getAttribute('data-b') === key;
            e.classList.toggle('on', on);
            e.classList.toggle('off', !on);
        });
        if (titleEl) titleEl.textContent = names[key];
        if (listEl) listEl.innerHTML = REL[key].map(function (r) {
            return '<li class="rel-rel"><span class="rel-rel-to">' + esc(names[r.to]) + '</span><span class="rel-rel-text">' + esc(r.text) + '</span></li>';
        }).join('');
    }
    nodes.forEach(function (n) {
        n.addEventListener('click', function () { setActive(n.getAttribute('data-key')); });
        n.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); setActive(n.getAttribute('data-key')); }
        });
    });
    setActive('impr');
})();


/* ===== Percorso: interactive 3D cube (2x2x2 = 8 tappe) ===== */
(function initPercorsoCube() {
    var wrap = document.getElementById('cubeWrap');
    if (!wrap) return;
    var stage = document.getElementById('cubeStage');
    var cube = document.getElementById('cube');
    var nav = document.getElementById('cubeNav');
    var stepEl = document.getElementById('cubeStep');
    var labelEl = document.getElementById('cubeLabel');
    var titleEl = document.getElementById('cubeTitle');
    var textEl = document.getElementById('cubeText');
    var linkEl = document.getElementById('cubeLink');
    if (!stage || !cube) return;

    var STEPS = [
        { n: '01', label: 'Organizzazione',      title: 'Adeguati Assetti', text: "Assetti organizzativi, amministrativi e contabili adeguati: la base di un'impresa che si conosce, si misura e sa decidere.", href: '../adeguati_assetti/', link: 'Approfondisci gli adeguati assetti' },
        { n: '02', label: 'Controllo',           title: 'Governance e Controllo di Gestione', text: "Strumenti di governance e controllo di gestione per guidare l'impresa con dati, indicatori e responsabilità chiare.", href: null },
        { n: '03', label: 'Gestione dei rischi', title: 'Modello 231 e Tax Control Framework', text: 'Presidiare i rischi penali e fiscali con il Modello 231 e il Tax Control Framework, in un unico sistema di controllo.', href: '../modello_231/', link: 'Approfondisci il Modello 231' },
        { n: '04', label: 'Reputazione',         title: 'Rating di Legalità', text: "Dimostrare affidabilità e trasparenza con il Rating di Legalità rilasciato dall'AGCM, valorizzandolo verso banche e mercato.", href: '../rating_legalita/', link: 'Approfondisci il Rating di Legalità' },
        { n: '05', label: 'Valore nel tempo',    title: 'ESG e Sostenibilità', text: 'Integrare sostenibilità e fattori ESG nella strategia per creare valore duraturo e accedere a nuove opportunità.', href: '../sostenibilita_esg/', link: 'Approfondisci ESG e sostenibilità' },
        { n: '06', label: 'Banche e investitori', title: 'Merito Creditizio', text: "Migliorare il merito creditizio rafforzando il dialogo con banche e investitori: un'impresa organizzata è un'impresa più finanziabile.", href: null },
        { n: '07', label: 'Opportunità',         title: 'Finanza Agevolata', text: 'Cogliere le opportunità della finanza agevolata e dei grandi programmi di sviluppo, trasformandole in progetti concreti.', href: null },
        { n: '08', label: 'Territorio',          title: "Bagnoli e America's Cup 2027", text: "Le grandi opportunità di sviluppo del territorio: la rigenerazione di Bagnoli e gli investimenti collegati all'America's Cup 2027.", href: null }
    ];
    var corners = [[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1],[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1]];
    var faces = ['front','back','right','left','top','bottom'];
    var off = 52;
    var cubelets = [];

    STEPS.forEach(function (s, i) {
        var c = document.createElement('div');
        c.className = 'cubelet';
        c.dataset.step = i;
        c.setAttribute('role', 'button');
        c.setAttribute('aria-label', 'Tappa ' + s.n + ': ' + s.title);
        var p = corners[i];
        c.style.transform = 'translate3d(' + (p[0] * off) + 'px,' + (p[1] * off) + 'px,' + (p[2] * off) + 'px)';
        faces.forEach(function (f) {
            var fe = document.createElement('span');
            fe.className = 'cubelet-face cf-' + f;
            fe.textContent = s.n;
            c.appendChild(fe);
        });
        cube.appendChild(c);
        cubelets.push(c);

        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = s.n;
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-label', 'Tappa ' + s.n + ': ' + s.title);
        b.addEventListener('click', function () { setStep(i); });
        nav.appendChild(b);
    });
    var navBtns = nav.querySelectorAll('button');

    function setStep(i) {
        var s = STEPS[i];
        cubelets.forEach(function (c, idx) {
            c.classList.toggle('is-active', idx === i);
            c.classList.toggle('dim', idx !== i);
        });
        navBtns.forEach(function (b, idx) {
            b.classList.toggle('is-active', idx === i);
            b.setAttribute('aria-selected', idx === i ? 'true' : 'false');
        });
        if (stepEl) stepEl.textContent = s.n;
        if (labelEl) labelEl.textContent = s.label;
        if (titleEl) titleEl.textContent = s.title;
        if (textEl) textEl.textContent = s.text;
        if (linkEl) {
            if (s.href) { linkEl.href = s.href; linkEl.textContent = s.link; linkEl.hidden = false; }
            else { linkEl.hidden = true; linkEl.removeAttribute('href'); }
        }
    }

    cubelets.forEach(function (c) {
        c.addEventListener('click', function () { if (!moved) setStep(+c.dataset.step); });
    });

    var rotX = -24, rotY = -32, dragging = false, moved = false, lx = 0, ly = 0;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function apply() { cube.style.transform = 'rotateX(' + rotX + 'deg) rotateY(' + rotY + 'deg)'; }
    function frame() { if (!dragging && !reduce) { rotY += 0.22; apply(); } requestAnimationFrame(frame); }
    apply();
    if (!reduce && window.requestAnimationFrame) requestAnimationFrame(frame);

    stage.addEventListener('pointerdown', function (e) {
        dragging = true; moved = false; lx = e.clientX; ly = e.clientY;
        stage.classList.add('is-dragging');
    });
    window.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        var dx = e.clientX - lx, dy = e.clientY - ly;
        if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
        rotY += dx * 0.4; rotX -= dy * 0.4;
        rotX = Math.max(-85, Math.min(85, rotX));
        lx = e.clientX; ly = e.clientY; apply();
    });
    window.addEventListener('pointerup', function () { dragging = false; stage.classList.remove('is-dragging'); });

    setStep(0);
})();
