/**
 * Next Generation Business — Main Landing
 * Vanilla JS: navbar scroll effect, smooth anchors, contents filter,
 * newsletter submission (shared Google Sheet endpoint with roma and zls_zes).
 */

// ======================================================================
// Shared backend for every form on the NGB domain (landing, roma, zls_zes)
// Each submission carries a `pagina` field so rows in the sheet can be
// grouped by source, and a `data` field pre-formatted as dd/MM/yyyy HH:mm:ss
// so the spreadsheet always has a human-readable timestamp column.
// ======================================================================
const NGB_SHEET_URL = 'https://script.google.com/macros/s/AKfycbyq8cvS_WNMFTMDi2jFhft-xnqnKjYDvIz5On9pfM66y5dGUzcXYZraAF03CCW-rJ-sQw/exec';

/**
 * Italian-formatted timestamp for the submission. Runs at call time.
 *   → "11/04/2026 15:30:42"
 */
function ngbTimestamp() {
    const n = new Date();
    const p = (x) => String(x).padStart(2, '0');
    return p(n.getDate()) + '/' + p(n.getMonth() + 1) + '/' + n.getFullYear()
         + ' ' + p(n.getHours()) + ':' + p(n.getMinutes()) + ':' + p(n.getSeconds());
}

/**
 * Build a full payload object. Unused fields are sent as empty strings so
 * every submission writes to the exact same columns in the target sheet.
 */
function buildNgbPayload(pagina, overrides) {
    return Object.assign({
        data: ngbTimestamp(),
        pagina: pagina,
        nome: '',
        cognome: '',
        email: '',
        azienda: '',
        ruolo: '',
        telefono: '',
        messaggio: '',
        privacy: false,
        marketing: false
    }, overrides || {});
}

function ngbSubmit(payload) {
    return fetch(NGB_SHEET_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
}

/**
 * Corner notification used as form feedback.
 */
function showNgbNotification(message, type) {
    const existing = document.querySelector('.ngb-notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.className = 'ngb-notification ngb-notification-' + type;
    notification.innerHTML = '<span></span><button type="button" aria-label="Chiudi">&times;</button>';
    notification.querySelector('span').textContent = message;

    Object.assign(notification.style, {
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        maxWidth: '420px',
        padding: '16px 22px',
        borderRadius: '10px',
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        zIndex: '9999',
        fontSize: '0.9rem',
        fontFamily: "'Inter', -apple-system, sans-serif",
        lineHeight: '1.45',
        boxShadow: '0 14px 40px rgba(10, 40, 68, 0.35)',
        background: type === 'success' ? '#0F3D2E' : '#5C1A1F',
        color: '#F1F5F9',
        border: '1px solid ' + (type === 'success' ? '#10B981' : '#EF4444'),
        transform: 'translateY(16px)',
        opacity: '0',
        transition: 'opacity 0.35s ease, transform 0.35s ease'
    });

    const closeBtn = notification.querySelector('button');
    Object.assign(closeBtn.style, {
        background: 'transparent',
        border: 'none',
        color: 'rgba(255,255,255,0.7)',
        fontSize: '1.3rem',
        cursor: 'pointer',
        padding: '0',
        lineHeight: '1'
    });
    closeBtn.addEventListener('click', () => notification.remove());

    document.body.appendChild(notification);
    requestAnimationFrame(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(12px)';
        setTimeout(() => notification.remove(), 400);
    }, 5500);
}

document.addEventListener('DOMContentLoaded', () => {

    // === Navbar: add .scrolled class after 60px of scroll ===
    const navbar = document.getElementById('navbar');
    if (navbar) {
        const onScroll = () => {
            if (window.scrollY > 60) {
                navbar.classList.add('scrolled');
            } else {
                navbar.classList.remove('scrolled');
            }
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
    }

    // === Smooth-scroll for in-page anchor links ===
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', (e) => {
            const href = anchor.getAttribute('href');
            if (!href || href === '#') return;
            const target = document.querySelector(href);
            if (!target) return;
            e.preventDefault();
            const navbarHeight = navbar ? navbar.offsetHeight : 80;
            const top = target.getBoundingClientRect().top + window.pageYOffset - navbarHeight + 10;
            window.scrollTo({ top, behavior: 'smooth' });
        });
    });

    // === Contents filter ===
    // The toolbar is populated at runtime from each .content-card
    // data-category attribute, so adding a new card with a new
    // category automatically creates a matching filter pill.
    const toolbar = document.getElementById('contentsToolbar');
    const grid    = document.getElementById('contentsGrid');
    const count   = document.getElementById('contentsCount');
    const empty   = document.getElementById('contentsEmpty');

    if (toolbar && grid) {
        const cards = Array.from(grid.querySelectorAll('.content-card'));
        const total = cards.length;

        // Human-readable labels for category slugs. Unknown slugs
        // fall back to a Title Case conversion of the slug itself,
        // so any new data-category value still renders cleanly.
        const CATEGORY_LABELS = {
            'agevolazioni-fiscali': 'Agevolazioni Fiscali',
            'compliance':           'Compliance',
            'diritto-societario':   'Diritto Societario',
            'revisione-legale':     'Revisione Legale',
            'rating-legalita':      'Rating di Legalità',
            'esg':                  'ESG & Sostenibilità',
            'internazionalizzazione': 'Internazionalizzazione',
            'finanza-agevolata':    'Finanza Agevolata'
        };

        const slugToLabel = (slug) => {
            if (CATEGORY_LABELS[slug]) return CATEGORY_LABELS[slug];
            return slug
                .split('-')
                .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                .join(' ');
        };

        // Collect categories in the order they first appear in the DOM
        const categories = [];
        cards.forEach(card => {
            const cat = card.dataset.category;
            if (cat && !categories.includes(cat)) categories.push(cat);
        });

        // Build a single filter pill
        const buildPill = (filterKey, label, countValue) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'content-filter';
            btn.dataset.filter = filterKey;
            btn.setAttribute('role', 'tab');
            btn.setAttribute('aria-selected', 'false');

            const lbl = document.createElement('span');
            lbl.className = 'filter-label';
            lbl.textContent = label;
            btn.appendChild(lbl);

            const cnt = document.createElement('span');
            cnt.className = 'filter-count';
            cnt.textContent = countValue;
            btn.appendChild(cnt);

            return btn;
        };

        // "Tutti" pill — always first, active by default
        const allPill = buildPill('all', 'Tutti', total);
        allPill.classList.add('is-active');
        allPill.setAttribute('aria-selected', 'true');
        toolbar.appendChild(allPill);

        // One pill per category present in the grid. Adding a new
        // card with a new data-category automatically creates a new
        // pill here, with no HTML or script edits required.
        categories.forEach(cat => {
            const n = cards.filter(c => c.dataset.category === cat).length;
            toolbar.appendChild(buildPill(cat, slugToLabel(cat), n));
        });

        // Update the live count line under the grid
        const updateCount = (visible) => {
            if (!count) return;
            const word = total === 1 ? 'contenuto' : 'contenuti';
            const avail = total === 1 ? 'disponibile' : 'disponibili';
            count.textContent = visible === total
                ? `${total} ${word} ${avail}`
                : `Mostrando ${visible} di ${total} ${word}`;
        };

        // Apply a filter and refresh empty state / counter
        const applyFilter = (filterKey) => {
            let visible = 0;
            cards.forEach(card => {
                const match = filterKey === 'all' || card.dataset.category === filterKey;
                card.classList.toggle('is-hidden', !match);
                if (match) visible++;
            });
            if (empty) empty.hidden = visible !== 0;
            updateCount(visible);
        };

        // Delegate clicks on the toolbar
        toolbar.addEventListener('click', (e) => {
            const btn = e.target.closest('.content-filter');
            if (!btn) return;
            toolbar.querySelectorAll('.content-filter').forEach(b => {
                b.classList.remove('is-active');
                b.setAttribute('aria-selected', 'false');
            });
            btn.classList.add('is-active');
            btn.setAttribute('aria-selected', 'true');
            applyFilter(btn.dataset.filter);
        });

        // Initial count render
        updateCount(total);
    }

    // === Newsletter submission ===
    // The landing newsletter collects the same user information as
    // the Roma registration form and the ZLS/ZES contact form, so
    // the NGB Google Sheet has a uniform row structure regardless
    // of source page.
    const newsletterForm = document.getElementById('newsletterForm');
    if (newsletterForm) {
        const submitBtn = document.getElementById('newsletterSubmit');
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        const setFieldError = (name, hasError) => {
            const input = newsletterForm.querySelector('[name="' + name + '"]');
            const field = input ? input.closest('.newsletter-field') : null;
            if (field) field.classList.toggle('is-error', !!hasError);
        };

        newsletterForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const formData = new FormData(newsletterForm);
            const data = Object.fromEntries(formData.entries());

            // Required text fields
            const required = ['nome', 'cognome', 'email', 'azienda', 'ruolo'];
            let firstMissing = null;
            required.forEach(name => {
                const value = (data[name] || '').trim();
                const missing = !value;
                setFieldError(name, missing);
                if (missing && !firstMissing) firstMissing = name;
            });

            if (firstMissing) {
                showNgbNotification('Compila tutti i campi obbligatori prima di proseguire.', 'error');
                const el = newsletterForm.querySelector('[name="' + firstMissing + '"]');
                if (el) el.focus();
                return;
            }

            // Email format
            if (!emailRegex.test((data.email || '').trim())) {
                setFieldError('email', true);
                showNgbNotification('Inserisci un indirizzo email valido.', 'error');
                return;
            }

            // GDPR consent
            if (!data.privacy) {
                showNgbNotification('È necessario accettare il trattamento dei dati personali.', 'error');
                return;
            }

            const originalContent = submitBtn.innerHTML;
            submitBtn.innerHTML = '<span>Invio in corso...</span>';
            submitBtn.disabled = true;

            const payload = buildNgbPayload('Landing - Newsletter', {
                nome:      (data.nome     || '').trim(),
                cognome:   (data.cognome  || '').trim(),
                email:     (data.email    || '').trim(),
                azienda:   (data.azienda  || '').trim(),
                ruolo:     (data.ruolo    || '').trim(),
                telefono:  (data.telefono || '').trim(),
                privacy:   !!data.privacy,
                marketing: !!data.marketing
            });

            ngbSubmit(payload)
                .then(() => {
                    showNgbNotification('Iscrizione avvenuta con successo. A presto!', 'success');
                    newsletterForm.reset();
                    required.forEach(name => setFieldError(name, false));
                })
                .catch(() => {
                    showNgbNotification('Errore di connessione. Riprova o scrivici a info@nextgenerationbusiness.it', 'error');
                })
                .finally(() => {
                    submitBtn.innerHTML = originalContent;
                    submitBtn.disabled = false;
                });
        });

        // Clear the error state on a field as soon as the user edits it
        newsletterForm.querySelectorAll('.newsletter-field input').forEach(input => {
            input.addEventListener('input', () => setFieldError(input.name, false));
        });
    }

});
