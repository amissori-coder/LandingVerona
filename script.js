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

    // ==================================================================
    // Upcoming → past auto-demotion for event cards
    // ==================================================================
    // Any <a class="event-card" data-event-date="YYYY-MM-DD"> is kept
    // in its "upcoming" state (class .event-upcoming) until the end of
    // the event date. From the day after, it is demoted to .event-past
    // and the badge/link labels are swapped using the data attributes
    //   data-event-badge-past   (default: "Evento precedente")
    //   data-event-link-past    (default: "Rivedi l'evento")
    // This runs before any other listeners so the UI reflects the
    // correct state on first paint.
    (function autoDemoteEventCards() {
        const now = new Date();
        const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        document.querySelectorAll('.event-card[data-event-date]').forEach((card) => {
            const d = new Date(card.dataset.eventDate + 'T00:00:00');
            if (isNaN(d.getTime())) return;
            // Keep visible on the event day; demote from the following day.
            if (d.getTime() >= todayMid.getTime()) return;
            card.classList.remove('event-upcoming');
            card.classList.add('event-past');
            const badge = card.querySelector('.event-badge-text');
            if (badge) badge.textContent = card.dataset.eventBadgePast || 'Evento precedente';
            const linkText = card.querySelector('.event-link-text');
            if (linkText) linkText.textContent = card.dataset.eventLinkPast || 'Rivedi l\u2019evento';
        });
    })();

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

    // ==================================================================
    // Sedi: stylized dotted Italy map
    // The country shape is rendered as a grid of small dots sampled from the
    // real Italy polygon (equirectangular projection with cos(lat) aspect
    // correction). City coordinates use the same projection so markers sit
    // exactly on top of the dot pattern. viewBox is 0 0 480 620.
    // ==================================================================
    (function initSediMap() {
        const dotsContainer = document.getElementById('sediDots');
        const markersContainer = document.getElementById('sediMarkers');
        const listContainer = document.getElementById('sediList');
        const countEl = document.getElementById('sediCount');
        const tooltip = document.getElementById('sediTooltip');
        const mapWrap = document.querySelector('.sedi-map-wrap');
        const mapSvg = document.querySelector('.sedi-map');
        if (!markersContainer || !listContainer || !tooltip || !mapWrap || !mapSvg) return;

        // Cities projected into the 0 0 480 620 viewBox
        const CITIES = [
            { name: 'Roma',            x: 237.04, y: 278.87 },
            { name: 'Verona',          x: 179.35, y: 98.46 },
            { name: 'Milano',          x: 110.28, y: 97.14 },
            { name: 'Brescia',         x: 149.45, y: 93.19 },
            { name: 'Cosenza',         x: 381.10, y: 411.74 },
            { name: 'Padova',          x: 213.29, y: 100.09 },
            { name: 'Venezia',         x: 230.11, y: 98.34 },
            { name: 'Vicenza',         x: 200.20, y: 92.99 },
            { name: 'Treviso',         x: 227.33, y: 86.80 },
            { name: 'Rovigo',          x: 209.96, y: 117.25 },
            { name: 'Belluno',         x: 226.29, y: 62.68 },
            { name: 'Bolzano',         x: 193.28, y: 44.37 },
            { name: 'Monza',           x: 113.51, y: 91.00 },
            { name: 'Mantova',         x: 171.68, y: 112.85 },
            { name: 'Bergamo',         x: 128.96, y: 85.20 },
            { name: 'Pavia',           x: 109.06, y: 111.40 },
            { name: 'Cremona',         x: 142.20, y: 114.02 },
            { name: 'Alessandria',     x: 88.25,  y: 125.29 },
            { name: 'Cuneo',           x: 47.11,  y: 152.26 },
            { name: 'Torino',          x: 52.65,  y: 117.24 },
            { name: 'Sanremo',         x: 56.07,  y: 181.26 },
            { name: 'Savona',          x: 83.11,  y: 156.17 },
            { name: 'Firenze',         x: 189.48, y: 183.61 },
            { name: 'Livorno',         x: 153.24, y: 194.89 },
            { name: 'Lucca',           x: 160.61, y: 179.87 },
            { name: 'Pisa',            x: 156.73, y: 186.00 },
            { name: 'Prato',           x: 183.59, y: 178.10 },
            { name: 'Siena',           x: 192.35, y: 206.62 },
            { name: 'Parma',           x: 153.91, y: 130.96 },
            { name: 'Bologna',         x: 192.81, y: 146.60 },
            { name: 'Ravenna',         x: 225.55, y: 150.55 },
            { name: 'Pistoia',         x: 176.48, y: 175.26 },
            { name: 'Perugia',         x: 232.92, y: 217.16 },
            { name: 'Viterbo',         x: 222.14, y: 252.44 },
            { name: 'Latina',          x: 252.66, y: 301.07 },
            { name: 'Rieti',           x: 250.86, y: 253.27 },
            { name: 'Campobasso',      x: 320.30, y: 296.37 },
            { name: 'Chieti',          x: 301.12, y: 255.99 },
            { name: 'Pescara',         x: 302.90, y: 250.21 },
            { name: 'Teramo',          x: 283.35, y: 240.29 },
            { name: 'Ancona',          x: 276.25, y: 191.46 },
            { name: 'Macerata',        x: 273.73, y: 207.54 },
            { name: 'Pesaro',          x: 253.04, y: 176.44 },
            { name: 'Bari',            x: 404.80, y: 318.96 },
            { name: 'Barletta',        x: 382.16, y: 308.60 },
            { name: 'Foggia',          x: 353.91, y: 301.36 },
            { name: 'Lecce',           x: 454.76, y: 358.03 },
            { name: 'Taranto',         x: 418.91, y: 351.77 },
            { name: 'Potenza',         x: 363.92, y: 343.38 },
            { name: 'Catanzaro',       x: 393.91, y: 431.60 },
            { name: 'Reggio Calabria', x: 358.41, y: 472.34 },
            { name: 'Palmi',           x: 365.49, y: 459.74 },
            { name: 'Avellino',        x: 325.10, y: 329.30 },
            { name: 'Caserta',         x: 307.39, y: 321.26 },
            { name: 'Salerno',         x: 323.79, y: 341.12 },
            { name: 'Napoli',          x: 304.97, y: 332.50 },
            { name: 'Catania',         x: 336.21, y: 503.13 },
            { name: 'Messina',         x: 354.27, y: 468.13 },
            { name: 'Palermo',         x: 270.21, y: 472.12 },
            { name: 'Caltanissetta',   x: 297.09, y: 504.19 },
            { name: 'Trapani',         x: 238.58, y: 477.12 },
            { name: 'Cagliari',        x: 107.66, y: 415.57 },
            { name: 'Sud Sardegna',    x: 84.70,  y: 418.50 }
        ];

        // Dotted silhouette: ~789 points sampled inside the real Italy polygon
        // on a 0.18° lat/lon grid, projected into the same viewBox.
        const DOTS = '319.7,541.6 328.9,541.6 315.1,532.4 324.3,532.4 333.5,532.4 292.1,523.2 301.3,523.2 310.5,523.2 319.7,523.2 328.9,523.2 338.1,523.2 278.4,514.1 287.5,514.1 296.7,514.1 305.9,514.1 315.1,514.1 324.3,514.1 333.5,514.1 264.6,504.9 273.8,504.9 283.0,504.9 292.1,504.9 301.3,504.9 310.5,504.9 319.7,504.9 328.9,504.9 241.6,495.7 250.8,495.7 260.0,495.7 269.2,495.7 278.4,495.7 287.5,495.7 296.7,495.7 305.9,495.7 315.1,495.7 324.3,495.7 333.5,495.7 237.0,486.5 246.2,486.5 255.4,486.5 264.6,486.5 273.8,486.5 283.0,486.5 292.1,486.5 301.3,486.5 310.5,486.5 319.7,486.5 328.9,486.5 338.1,486.5 241.6,477.3 250.8,477.3 260.0,477.3 269.2,477.3 278.4,477.3 296.7,477.3 305.9,477.3 315.1,477.3 324.3,477.3 333.5,477.3 342.7,477.3 361.0,477.3 370.2,477.3 246.2,468.1 347.2,468.1 365.6,468.1 374.8,468.1 370.2,459.0 379.4,459.0 388.6,459.0 374.8,449.8 384.0,449.8 393.2,449.8 379.4,440.6 388.6,440.6 90.1,431.4 99.3,431.4 384.0,431.4 393.2,431.4 402.4,431.4 411.5,431.4 85.5,422.2 94.7,422.2 103.8,422.2 379.4,422.2 388.6,422.2 397.8,422.2 407.0,422.2 80.9,413.0 90.1,413.0 99.3,413.0 108.4,413.0 117.6,413.0 374.8,413.0 384.0,413.0 393.2,413.0 402.4,413.0 411.5,413.0 85.5,403.8 94.7,403.8 103.8,403.8 113.0,403.8 122.2,403.8 379.4,403.8 388.6,403.8 397.8,403.8 407.0,403.8 90.1,394.7 99.3,394.7 108.4,394.7 117.6,394.7 126.8,394.7 365.6,394.7 374.8,394.7 384.0,394.7 393.2,394.7 85.5,385.5 94.7,385.5 103.8,385.5 113.0,385.5 122.2,385.5 370.2,385.5 379.4,385.5 388.6,385.5 462.1,385.5 80.9,376.3 90.1,376.3 99.3,376.3 108.4,376.3 117.6,376.3 126.8,376.3 347.2,376.3 365.6,376.3 374.8,376.3 384.0,376.3 393.2,376.3 448.3,376.3 457.5,376.3 85.5,367.1 94.7,367.1 103.8,367.1 113.0,367.1 122.2,367.1 342.7,367.1 351.8,367.1 361.0,367.1 370.2,367.1 379.4,367.1 388.6,367.1 397.8,367.1 452.9,367.1 462.1,367.1 80.9,357.9 90.1,357.9 99.3,357.9 108.4,357.9 117.6,357.9 126.8,357.9 338.1,357.9 347.2,357.9 356.4,357.9 365.6,357.9 374.8,357.9 384.0,357.9 393.2,357.9 402.4,357.9 429.9,357.9 439.1,357.9 448.3,357.9 457.5,357.9 85.5,348.7 94.7,348.7 103.8,348.7 113.0,348.7 122.2,348.7 131.4,348.7 333.5,348.7 342.7,348.7 351.8,348.7 361.0,348.7 370.2,348.7 379.4,348.7 388.6,348.7 397.8,348.7 407.0,348.7 416.1,348.7 425.3,348.7 434.5,348.7 443.7,348.7 71.7,339.5 80.9,339.5 90.1,339.5 99.3,339.5 108.4,339.5 117.6,339.5 126.8,339.5 319.7,339.5 328.9,339.5 338.1,339.5 347.2,339.5 356.4,339.5 365.6,339.5 374.8,339.5 384.0,339.5 393.2,339.5 402.4,339.5 411.5,339.5 420.7,339.5 429.9,339.5 439.1,339.5 94.7,330.4 103.8,330.4 113.0,330.4 122.2,330.4 296.7,330.4 305.9,330.4 315.1,330.4 324.3,330.4 333.5,330.4 342.7,330.4 351.8,330.4 361.0,330.4 370.2,330.4 379.4,330.4 388.6,330.4 397.8,330.4 407.0,330.4 416.1,330.4 108.4,321.2 117.6,321.2 292.1,321.2 301.3,321.2 310.5,321.2 319.7,321.2 328.9,321.2 338.1,321.2 347.2,321.2 356.4,321.2 365.6,321.2 374.8,321.2 384.0,321.2 393.2,321.2 402.4,321.2 411.5,321.2 260.0,312.0 278.4,312.0 287.5,312.0 296.7,312.0 305.9,312.0 315.1,312.0 324.3,312.0 333.5,312.0 342.7,312.0 351.8,312.0 361.0,312.0 370.2,312.0 379.4,312.0 388.6,312.0 246.2,302.8 255.4,302.8 264.6,302.8 273.8,302.8 283.0,302.8 292.1,302.8 301.3,302.8 310.5,302.8 319.7,302.8 328.9,302.8 338.1,302.8 347.2,302.8 356.4,302.8 365.6,302.8 241.6,293.6 250.8,293.6 260.0,293.6 269.2,293.6 278.4,293.6 287.5,293.6 296.7,293.6 305.9,293.6 315.1,293.6 324.3,293.6 333.5,293.6 342.7,293.6 351.8,293.6 361.0,293.6 227.8,284.4 237.0,284.4 246.2,284.4 255.4,284.4 264.6,284.4 273.8,284.4 283.0,284.4 292.1,284.4 301.3,284.4 310.5,284.4 319.7,284.4 328.9,284.4 338.1,284.4 347.2,284.4 356.4,284.4 365.6,284.4 374.8,284.4 223.3,275.3 232.4,275.3 241.6,275.3 250.8,275.3 260.0,275.3 269.2,275.3 278.4,275.3 287.5,275.3 296.7,275.3 305.9,275.3 315.1,275.3 324.3,275.3 333.5,275.3 209.5,266.1 218.7,266.1 227.8,266.1 237.0,266.1 246.2,266.1 255.4,266.1 264.6,266.1 273.8,266.1 283.0,266.1 292.1,266.1 301.3,266.1 310.5,266.1 319.7,266.1 204.9,256.9 214.1,256.9 223.3,256.9 232.4,256.9 241.6,256.9 250.8,256.9 260.0,256.9 269.2,256.9 278.4,256.9 287.5,256.9 296.7,256.9 305.9,256.9 191.1,247.7 200.3,247.7 209.5,247.7 218.7,247.7 227.8,247.7 237.0,247.7 246.2,247.7 255.4,247.7 264.6,247.7 273.8,247.7 283.0,247.7 292.1,247.7 301.3,247.7 186.5,238.5 195.7,238.5 204.9,238.5 214.1,238.5 223.3,238.5 232.4,238.5 241.6,238.5 250.8,238.5 260.0,238.5 269.2,238.5 278.4,238.5 287.5,238.5 172.7,229.3 181.9,229.3 191.1,229.3 200.3,229.3 209.5,229.3 218.7,229.3 227.8,229.3 237.0,229.3 246.2,229.3 255.4,229.3 264.6,229.3 273.8,229.3 283.0,229.3 292.1,229.3 168.1,220.1 177.3,220.1 186.5,220.1 195.7,220.1 204.9,220.1 214.1,220.1 223.3,220.1 232.4,220.1 241.6,220.1 250.8,220.1 260.0,220.1 269.2,220.1 278.4,220.1 287.5,220.1 163.6,211.0 172.7,211.0 181.9,211.0 191.1,211.0 200.3,211.0 209.5,211.0 218.7,211.0 227.8,211.0 237.0,211.0 246.2,211.0 255.4,211.0 264.6,211.0 273.8,211.0 283.0,211.0 159.0,201.8 168.1,201.8 177.3,201.8 186.5,201.8 195.7,201.8 204.9,201.8 214.1,201.8 223.3,201.8 232.4,201.8 241.6,201.8 250.8,201.8 260.0,201.8 269.2,201.8 278.4,201.8 154.4,192.6 163.6,192.6 172.7,192.6 181.9,192.6 191.1,192.6 200.3,192.6 209.5,192.6 218.7,192.6 227.8,192.6 237.0,192.6 246.2,192.6 255.4,192.6 264.6,192.6 273.8,192.6 159.0,183.4 168.1,183.4 177.3,183.4 186.5,183.4 195.7,183.4 204.9,183.4 214.1,183.4 223.3,183.4 232.4,183.4 241.6,183.4 250.8,183.4 260.0,183.4 53.3,174.2 62.5,174.2 71.7,174.2 154.4,174.2 163.6,174.2 172.7,174.2 181.9,174.2 191.1,174.2 200.3,174.2 209.5,174.2 218.7,174.2 227.8,174.2 246.2,174.2 39.6,165.0 57.9,165.0 67.1,165.0 131.4,165.0 140.6,165.0 149.8,165.0 159.0,165.0 168.1,165.0 177.3,165.0 186.5,165.0 195.7,165.0 204.9,165.0 214.1,165.0 223.3,165.0 232.4,165.0 25.8,155.8 35.0,155.8 44.1,155.8 53.3,155.8 62.5,155.8 71.7,155.8 80.9,155.8 108.4,155.8 117.6,155.8 126.8,155.8 136.0,155.8 145.2,155.8 154.4,155.8 163.6,155.8 172.7,155.8 181.9,155.8 191.1,155.8 200.3,155.8 209.5,155.8 218.7,155.8 227.8,155.8 21.2,146.7 30.4,146.7 39.6,146.7 48.7,146.7 57.9,146.7 67.1,146.7 76.3,146.7 85.5,146.7 94.7,146.7 103.8,146.7 113.0,146.7 122.2,146.7 131.4,146.7 140.6,146.7 149.8,146.7 159.0,146.7 168.1,146.7 177.3,146.7 186.5,146.7 195.7,146.7 204.9,146.7 214.1,146.7 223.3,146.7 25.8,137.5 35.0,137.5 44.1,137.5 53.3,137.5 62.5,137.5 71.7,137.5 80.9,137.5 90.1,137.5 99.3,137.5 108.4,137.5 117.6,137.5 126.8,137.5 136.0,137.5 145.2,137.5 154.4,137.5 163.6,137.5 172.7,137.5 181.9,137.5 191.1,137.5 200.3,137.5 209.5,137.5 218.7,137.5 227.8,137.5 21.2,128.3 30.4,128.3 39.6,128.3 48.7,128.3 57.9,128.3 67.1,128.3 76.3,128.3 85.5,128.3 94.7,128.3 103.8,128.3 113.0,128.3 122.2,128.3 131.4,128.3 140.6,128.3 149.8,128.3 159.0,128.3 168.1,128.3 177.3,128.3 186.5,128.3 195.7,128.3 204.9,128.3 214.1,128.3 223.3,128.3 232.4,128.3 16.6,119.1 25.8,119.1 35.0,119.1 44.1,119.1 53.3,119.1 62.5,119.1 71.7,119.1 80.9,119.1 90.1,119.1 99.3,119.1 108.4,119.1 117.6,119.1 126.8,119.1 136.0,119.1 145.2,119.1 154.4,119.1 163.6,119.1 172.7,119.1 181.9,119.1 191.1,119.1 200.3,119.1 209.5,119.1 218.7,119.1 227.8,119.1 30.4,109.9 39.6,109.9 48.7,109.9 57.9,109.9 67.1,109.9 76.3,109.9 85.5,109.9 94.7,109.9 103.8,109.9 113.0,109.9 122.2,109.9 131.4,109.9 140.6,109.9 149.8,109.9 159.0,109.9 168.1,109.9 177.3,109.9 186.5,109.9 195.7,109.9 204.9,109.9 214.1,109.9 223.3,109.9 35.0,100.7 44.1,100.7 53.3,100.7 62.5,100.7 71.7,100.7 80.9,100.7 90.1,100.7 99.3,100.7 108.4,100.7 117.6,100.7 126.8,100.7 136.0,100.7 145.2,100.7 154.4,100.7 163.6,100.7 172.7,100.7 181.9,100.7 191.1,100.7 200.3,100.7 209.5,100.7 218.7,100.7 227.8,100.7 30.4,91.6 39.6,91.6 48.7,91.6 57.9,91.6 67.1,91.6 76.3,91.6 85.5,91.6 94.7,91.6 103.8,91.6 113.0,91.6 122.2,91.6 131.4,91.6 140.6,91.6 149.8,91.6 159.0,91.6 168.1,91.6 177.3,91.6 186.5,91.6 195.7,91.6 204.9,91.6 214.1,91.6 223.3,91.6 232.4,91.6 241.6,91.6 287.5,91.6 25.8,82.4 35.0,82.4 44.1,82.4 53.3,82.4 62.5,82.4 71.7,82.4 80.9,82.4 90.1,82.4 99.3,82.4 108.4,82.4 117.6,82.4 126.8,82.4 136.0,82.4 145.2,82.4 154.4,82.4 163.6,82.4 172.7,82.4 181.9,82.4 191.1,82.4 200.3,82.4 209.5,82.4 218.7,82.4 227.8,82.4 237.0,82.4 246.2,82.4 255.4,82.4 264.6,82.4 273.8,82.4 283.0,82.4 48.7,73.2 57.9,73.2 67.1,73.2 76.3,73.2 85.5,73.2 94.7,73.2 103.8,73.2 113.0,73.2 122.2,73.2 131.4,73.2 140.6,73.2 149.8,73.2 159.0,73.2 168.1,73.2 177.3,73.2 186.5,73.2 195.7,73.2 204.9,73.2 214.1,73.2 223.3,73.2 232.4,73.2 241.6,73.2 250.8,73.2 260.0,73.2 269.2,73.2 278.4,73.2 71.7,64.0 80.9,64.0 90.1,64.0 108.4,64.0 117.6,64.0 126.8,64.0 136.0,64.0 145.2,64.0 154.4,64.0 163.6,64.0 172.7,64.0 181.9,64.0 191.1,64.0 200.3,64.0 209.5,64.0 218.7,64.0 227.8,64.0 237.0,64.0 246.2,64.0 255.4,64.0 264.6,64.0 273.8,64.0 76.3,54.8 122.2,54.8 131.4,54.8 140.6,54.8 149.8,54.8 159.0,54.8 168.1,54.8 177.3,54.8 186.5,54.8 195.7,54.8 204.9,54.8 214.1,54.8 223.3,54.8 232.4,54.8 241.6,54.8 250.8,54.8 260.0,54.8 269.2,54.8 117.6,45.6 145.2,45.6 154.4,45.6 163.6,45.6 172.7,45.6 181.9,45.6 191.1,45.6 200.3,45.6 209.5,45.6 218.7,45.6 227.8,45.6 237.0,45.6 246.2,45.6 255.4,45.6 264.6,45.6 273.8,45.6 283.0,45.6 159.0,36.4 168.1,36.4 177.3,36.4 186.5,36.4 195.7,36.4 204.9,36.4 214.1,36.4 223.3,36.4 232.4,36.4 241.6,36.4 163.6,27.3 191.1,27.3 200.3,27.3 209.5,27.3 218.7,27.3 227.8,27.3 214.1,18.1 223.3,18.1';

        const SVG_NS = 'http://www.w3.org/2000/svg';
        const slugify = (name) => name.toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '');

        countEl.textContent = CITIES.length;

        // Render the dotted silhouette
        if (dotsContainer) {
            const frag = document.createDocumentFragment();
            DOTS.split(' ').forEach((pair) => {
                const comma = pair.indexOf(',');
                if (comma < 0) return;
                const dot = document.createElementNS(SVG_NS, 'circle');
                dot.setAttribute('cx', pair.slice(0, comma));
                dot.setAttribute('cy', pair.slice(comma + 1));
                dot.setAttribute('r', '2.1');
                dot.setAttribute('class', 'sedi-dot');
                frag.appendChild(dot);
            });
            dotsContainer.appendChild(frag);
        }

        const tooltipCityEl = tooltip.querySelector('.sedi-tooltip-city');
        let activeSlug = null;

        function positionTooltipFor(city) {
            const svgRect = mapSvg.getBoundingClientRect();
            const wrapRect = mapWrap.getBoundingClientRect();
            const vb = mapSvg.viewBox.baseVal;
            if (!vb.width || !vb.height) return;
            const scaleX = svgRect.width / vb.width;
            const scaleY = svgRect.height / vb.height;
            const offsetX = svgRect.left - wrapRect.left;
            const offsetY = svgRect.top - wrapRect.top;
            tooltip.style.left = (offsetX + city.x * scaleX) + 'px';
            tooltip.style.top  = (offsetY + city.y * scaleY) + 'px';
        }

        function activate(city) {
            const slug = slugify(city.name);
            if (activeSlug === slug) {
                positionTooltipFor(city);
                return;
            }
            deactivate();
            activeSlug = slug;
            tooltipCityEl.textContent = city.name;
            tooltip.hidden = false;
            requestAnimationFrame(() => {
                tooltip.setAttribute('data-visible', 'true');
                positionTooltipFor(city);
            });
            const marker = markersContainer.querySelector('[data-city="' + slug + '"]');
            if (marker) marker.classList.add('is-active');
            const li = listContainer.querySelector('[data-city="' + slug + '"]');
            if (li) li.classList.add('is-active');
        }

        function deactivate() {
            if (!activeSlug) return;
            tooltip.removeAttribute('data-visible');
            tooltip.hidden = true;
            const prevMarker = markersContainer.querySelector('.sedi-marker.is-active');
            if (prevMarker) prevMarker.classList.remove('is-active');
            const prevLi = listContainer.querySelector('.sedi-list > li.is-active');
            if (prevLi) prevLi.classList.remove('is-active');
            activeSlug = null;
        }

        // Build markers on the SVG
        CITIES.forEach((city) => {
            const slug = slugify(city.name);

            const pulse = document.createElementNS(SVG_NS, 'circle');
            pulse.setAttribute('cx', city.x);
            pulse.setAttribute('cy', city.y);
            pulse.setAttribute('r', '4.5');
            pulse.setAttribute('class', 'sedi-marker-pulse');
            markersContainer.appendChild(pulse);

            const marker = document.createElementNS(SVG_NS, 'circle');
            marker.setAttribute('cx', city.x);
            marker.setAttribute('cy', city.y);
            marker.setAttribute('r', '4.5');
            marker.setAttribute('class', 'sedi-marker');
            marker.setAttribute('data-city', slug);
            marker.setAttribute('tabindex', '0');
            marker.setAttribute('role', 'button');
            marker.setAttribute('aria-label', 'Sede Revilaw: ' + city.name);

            marker.addEventListener('mouseenter', () => activate(city));
            marker.addEventListener('mouseleave', deactivate);
            marker.addEventListener('focus', () => activate(city));
            marker.addEventListener('blur', deactivate);
            marker.addEventListener('click', (e) => { e.preventDefault(); activate(city); });
            markersContainer.appendChild(marker);
        });

        // Build alphabetical index grouped by initial letter (Italian locale)
        const sortedCities = CITIES.slice().sort((a, b) =>
            a.name.localeCompare(b.name, 'it', { sensitivity: 'base' })
        );

        const groups = new Map();
        sortedCities.forEach((city) => {
            const letter = city.name.charAt(0).toUpperCase();
            if (!groups.has(letter)) groups.set(letter, []);
            groups.get(letter).push(city);
        });

        groups.forEach((cities, letter) => {
            const row = document.createElement('div');
            row.className = 'sedi-index-row';

            const letterEl = document.createElement('span');
            letterEl.className = 'sedi-index-letter';
            letterEl.textContent = letter;
            row.appendChild(letterEl);

            const citiesEl = document.createElement('div');
            citiesEl.className = 'sedi-index-cities';

            cities.forEach((city, i) => {
                const slug = slugify(city.name);
                const span = document.createElement('span');
                span.className = 'sedi-index-city';
                span.setAttribute('data-city', slug);
                span.textContent = city.name;
                span.addEventListener('mouseenter', () => activate(city));
                span.addEventListener('mouseleave', deactivate);
                span.addEventListener('click', () => activate(city));
                citiesEl.appendChild(span);
                if (i < cities.length - 1) {
                    // Separator lives outside the clickable span so it isn't
                    // highlighted when the adjacent city is hovered.
                    citiesEl.appendChild(document.createTextNode(' · '));
                }
            });

            row.appendChild(citiesEl);
            listContainer.appendChild(row);
        });

        // Reposition the tooltip on window resize while a marker is active
        window.addEventListener('resize', () => {
            if (!activeSlug) return;
            const current = CITIES.find((c) => slugify(c.name) === activeSlug);
            if (current) positionTooltipFor(current);
        });
    })();

});
