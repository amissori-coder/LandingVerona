// ============================================
// ZLS - Revilaw SPA Website
// JavaScript
// ============================================

document.addEventListener('DOMContentLoaded', () => {

    // --- Navbar scroll effect ---
    const navbar = document.getElementById('navbar');

    if (navbar) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 50) {
                navbar.classList.add('scrolled');
            } else {
                navbar.classList.remove('scrolled');
            }
        });
    }

    // --- Mobile menu ---
    const hamburger = document.getElementById('hamburger');
    const navLinks = document.getElementById('navLinks');

    if (hamburger && navLinks) {
        hamburger.addEventListener('click', () => {
            hamburger.classList.toggle('active');
            navLinks.classList.toggle('active');
        });

        // Close menu on link click
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                hamburger.classList.remove('active');
                navLinks.classList.remove('active');
            });
        });
    }

    // --- Scroll animations (Intersection Observer) ---
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // --- FAQ accordion ---
    document.querySelectorAll('.faq-question').forEach(btn => {
        btn.addEventListener('click', () => {
            const item = btn.parentElement;
            const isActive = item.classList.contains('active');
            // Close all
            document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('active'));
            // Toggle current
            if (!isActive) item.classList.add('active');
        });
    });

    // Add fade-in class to animatable elements
    const animateElements = document.querySelectorAll(
        '.card, .vantaggio, .chi-card, .chi-note, .perche-item, .cta-text, .cta-form, .investimento-card, .processo-step, .faq-item, .detail-block, .highlight-box, .area-card'
    );

    animateElements.forEach((el, index) => {
        el.classList.add('fade-in');
        el.style.transitionDelay = `${index % 4 * 0.1}s`;
        observer.observe(el);
    });

    // --- Contact form handling ---
    const contactForm = document.getElementById('contactForm');

    if (contactForm) {
        contactForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const formData = new FormData(contactForm);
            const data = Object.fromEntries(formData.entries());

            // Validate required fields (same schema as landing newsletter
            // and Roma event registration)
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

            // Shared NGB schema: every form on the domain posts the same
            // fields so the Google Sheet keeps a consistent column layout.
            // `pagina` identifies the source page, `data` is a pre-formatted
            // Italian timestamp (dd/MM/yyyy HH:mm:ss) so the sheet always
            // has a readable Date column even if the Apps Script doesn't
            // call new Date() on its side.
            const _n = new Date();
            const _pad = (x) => String(x).padStart(2, '0');
            const _ts = _pad(_n.getDate()) + '/' + _pad(_n.getMonth() + 1) + '/' + _n.getFullYear()
                      + ' ' + _pad(_n.getHours()) + ':' + _pad(_n.getMinutes()) + ':' + _pad(_n.getSeconds());

            const jsonData = {
                data:      _ts,
                pagina:    contactForm.dataset.pagina || 'ZLS & ZES - Contatto',
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
                showNotification('Grazie! La tua richiesta è stata inviata. Ti ricontatteremo al più presto.', 'success');
                contactForm.reset();
            }).catch(() => {
                showNotification('Errore di connessione. Riprova o contattaci a info@nextgenerationbusiness.it', 'error');
            }).finally(() => {
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            });
        });
    }

    // --- Notification system ---
    function showNotification(message, type) {
        // Remove existing notification
        const existing = document.querySelector('.notification');
        if (existing) existing.remove();

        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <span>${message}</span>
            <button onclick="this.parentElement.remove()" aria-label="Chiudi">&times;</button>
        `;

        // Styles
        Object.assign(notification.style, {
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            maxWidth: '420px',
            padding: '16px 24px',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            zIndex: '9999',
            fontSize: '0.95rem',
            fontFamily: 'Inter, sans-serif',
            animation: 'fadeInUp 0.4s ease-out',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            background: type === 'success' ? '#065f46' : '#7f1d1d',
            color: '#f1f5f9',
            border: `1px solid ${type === 'success' ? '#10b981' : '#ef4444'}`
        });

        const closeBtn = notification.querySelector('button');
        Object.assign(closeBtn.style, {
            background: 'none',
            border: 'none',
            color: '#94a3b8',
            fontSize: '1.3rem',
            cursor: 'pointer',
            padding: '0',
            lineHeight: '1'
        });

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateY(12px)';
            notification.style.transition = '0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        }, 5000);
    }

    // --- Smooth scroll for same-page anchor links ---
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
});
