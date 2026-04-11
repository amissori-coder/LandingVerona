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

});
