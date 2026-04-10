/**
 * Next Generation Business – Landing Page
 * Countdown, form validation, scroll animations, navigation
 */

document.addEventListener('DOMContentLoaded', () => {

    // ========================
    // SMOOTH SCROLL (Lenis) + ONE-WHEEL-ONE-SECTION
    // ========================
    // Ogni wheel/swipe/tasto muove esattamente di una sezione in avanti o
    // indietro, con transizione fluida Lenis. Niente scroll libero: la
    // pagina si comporta come una sequenza di slide a scorrimento rapido.
    let lenis = null;
    const snapTargets = Array.from(
        document.querySelectorAll('.hero, .section')
    );
    const footerEl = document.querySelector('.footer');
    if (footerEl) snapTargets.push(footerEl);

    const TRANSITION_DURATION = 1.0; // secondi per la transizione
    const WHEEL_COOLDOWN      = 1100; // ms di "cooldown" tra due transizioni
    const softEasing          = (t) => 1 - Math.pow(1 - t, 3); // cubic.out

    let currentSectionIndex = 0;
    let isTransitioning = false;
    let wheelCooldownUntil = 0;

    if (typeof Lenis !== 'undefined') {
        lenis = new Lenis({
            duration: TRANSITION_DURATION,
            easing: softEasing,
            smoothWheel: false,   // gestiamo noi la rotella
            smoothTouch: false,   // touch resta nativo su mobile
            wheelMultiplier: 1,
            touchMultiplier: 1,
        });

        function raf(time) {
            lenis.raf(time);
            requestAnimationFrame(raf);
        }
        requestAnimationFrame(raf);

        const resizeLenis = () => lenis && lenis.resize();
        window.addEventListener('load', () => setTimeout(resizeLenis, 150));
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(() => setTimeout(resizeLenis, 100));
        }

        window.lenis = lenis;
    }

    // --- Calcola l'indice della sezione attualmente visibile ---
    const getCurrentSectionIndex = () => {
        if (!lenis) return 0;
        const scroll = lenis.scroll + 60;
        let index = 0;
        for (let i = 0; i < snapTargets.length; i++) {
            if (snapTargets[i].offsetTop <= scroll) index = i;
        }
        return index;
    };

    // --- Quando una sezione è più alta della viewport (es. form, timeline),
    //     permettiamo lo scroll interno prima di saltare alla successiva ---
    const canScrollWithinCurrent = (direction) => {
        if (!lenis) return false;
        const section = snapTargets[getCurrentSectionIndex()];
        if (!section) return false;

        const sectionTop = section.offsetTop;
        const sectionHeight = section.offsetHeight;
        const sectionBottom = sectionTop + sectionHeight;
        const viewportHeight = window.innerHeight;
        const currentScroll = lenis.scroll;

        // Solo per sezioni più alte della viewport
        if (sectionHeight <= viewportHeight + 20) return false;

        if (direction === 1) {
            return currentScroll + viewportHeight < sectionBottom - 8;
        } else {
            return currentScroll > sectionTop + 8;
        }
    };

    // --- Scroll fluido parziale all'interno di una sezione alta ---
    const scrollWithinCurrent = (direction) => {
        if (!lenis) return;
        const section = snapTargets[getCurrentSectionIndex()];
        if (!section) return;

        const sectionTop = section.offsetTop;
        const sectionBottom = sectionTop + section.offsetHeight;
        const viewportHeight = window.innerHeight;
        const step = viewportHeight * 0.85;

        let nextScroll;
        if (direction === 1) {
            nextScroll = Math.min(lenis.scroll + step, sectionBottom - viewportHeight);
        } else {
            nextScroll = Math.max(lenis.scroll - step, sectionTop);
        }

        isTransitioning = true;
        wheelCooldownUntil = Date.now() + 900;

        lenis.scrollTo(nextScroll, {
            duration: 0.85,
            easing: softEasing,
            lock: true,
            onComplete: () => {
                setTimeout(() => { isTransitioning = false; }, 60);
            },
        });
    };

    // --- Transizione verso una sezione specifica ---
    const goToSection = (index) => {
        if (!lenis) return;
        if (isTransitioning) return;
        if (index < 0 || index >= snapTargets.length) return;

        currentSectionIndex = index;
        isTransitioning = true;
        wheelCooldownUntil = Date.now() + WHEEL_COOLDOWN;

        const target = snapTargets[index];
        const maxScroll = lenis.limit;
        const targetScroll = Math.min(target.offsetTop, maxScroll);

        lenis.scrollTo(targetScroll, {
            duration: TRANSITION_DURATION,
            easing: softEasing,
            lock: true,
            onComplete: () => {
                setTimeout(() => { isTransitioning = false; }, 80);
            },
        });
    };

    currentSectionIndex = getCurrentSectionIndex();

    // --- Wheel: una rotella = una sezione (o scroll parziale in sezioni alte) ---
    const onWheel = (e) => {
        if (!lenis) return;
        e.preventDefault();

        const now = Date.now();
        if (isTransitioning || now < wheelCooldownUntil) return;

        // Ignora micro-movimenti (trackpad noise)
        if (Math.abs(e.deltaY) < 4) return;

        const direction = e.deltaY > 0 ? 1 : -1;

        if (canScrollWithinCurrent(direction)) {
            scrollWithinCurrent(direction);
        } else {
            goToSection(getCurrentSectionIndex() + direction);
        }
    };
    window.addEventListener('wheel', onWheel, { passive: false });

    // --- Tastiera: frecce, PageUp/Down, Home, End ---
    const onKeydown = (e) => {
        // Non intercettare se l'utente sta scrivendo in un input/textarea
        if (e.target.matches && e.target.matches('input, textarea, select, [contenteditable]')) {
            return;
        }

        let direction = 0;
        if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') direction = 1;
        else if (e.key === 'ArrowUp' || e.key === 'PageUp') direction = -1;
        else if (e.key === 'Home') {
            e.preventDefault();
            goToSection(0);
            return;
        }
        else if (e.key === 'End') {
            e.preventDefault();
            goToSection(snapTargets.length - 1);
            return;
        }

        if (direction === 0) return;
        if (isTransitioning) { e.preventDefault(); return; }

        e.preventDefault();

        if (canScrollWithinCurrent(direction)) {
            scrollWithinCurrent(direction);
        } else {
            goToSection(getCurrentSectionIndex() + direction);
        }
    };
    window.addEventListener('keydown', onKeydown);

    // --- Touch: su mobile lasciamo lo scroll nativo del browser.
    //     Dopo che lo scroll si ferma, un debounce allinea dolcemente
    //     alla sezione più vicina (solo se non siamo già a distanza <10px). ---
    let touchSnapTimer = null;
    const TOUCH_SNAP_DELAY = 200;

    const softTouchSnap = () => {
        if (!lenis || isTransitioning) return;
        const currentScroll = lenis.scroll;
        const maxScroll = lenis.limit;
        if (currentScroll >= maxScroll - 6) return;

        // Se la sezione corrente è alta e l'utente sta navigando internamente, non agganciare
        const currentSection = snapTargets[getCurrentSectionIndex()];
        if (currentSection) {
            const sectionTop = currentSection.offsetTop;
            const sectionBottom = sectionTop + currentSection.offsetHeight;
            const viewportHeight = window.innerHeight;
            if (
                currentSection.offsetHeight > viewportHeight + 20 &&
                currentScroll > sectionTop + 8 &&
                currentScroll + viewportHeight < sectionBottom - 8
            ) {
                return;
            }
        }

        let targetScroll = null;
        let closestDistance = Infinity;
        for (const el of snapTargets) {
            const scrollFor = Math.min(el.offsetTop, maxScroll);
            const distance = Math.abs(scrollFor - currentScroll);
            if (distance < closestDistance) {
                closestDistance = distance;
                targetScroll = scrollFor;
            }
        }

        if (targetScroll === null || closestDistance < 10) return;

        isTransitioning = true;
        lenis.scrollTo(targetScroll, {
            duration: 1.1,
            easing: softEasing,
            lock: true,
            onComplete: () => {
                setTimeout(() => { isTransitioning = false; }, 80);
            },
        });
    };

    if (lenis) {
        lenis.on('scroll', () => {
            if (isTransitioning) return;
            clearTimeout(touchSnapTimer);
            touchSnapTimer = setTimeout(softTouchSnap, TOUCH_SNAP_DELAY);
        });
    }

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

            // Simulate form submission (replace with actual API endpoint)
            setTimeout(() => {
                form.style.display = 'none';
                formSuccess.style.display = 'block';
                formSuccess.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 1500);
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
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (!href || href === '#') return;
            const target = document.querySelector(href);
            if (!target) return;

            e.preventDefault();

            // Se il target è una delle nostre sezioni, usa goToSection per
            // mantenere sincronizzato currentSectionIndex
            const idx = snapTargets.indexOf(target);
            if (idx !== -1 && lenis) {
                goToSection(idx);
                return;
            }

            if (lenis) {
                lenis.scrollTo(target, {
                    offset: -70,
                    duration: 1.2,
                    easing: softEasing,
                });
            } else {
                const offsetTop = target.getBoundingClientRect().top + window.pageYOffset - 70;
                window.scrollTo({
                    top: offsetTop,
                    behavior: 'smooth'
                });
            }
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
