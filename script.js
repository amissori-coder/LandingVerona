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

    // ==================================================================
    // Sedi: interactive Italy map
    // Coordinates are already projected into the SVG viewBox (0 0 450 620)
    // so no runtime lat/lon conversion is needed. Markers and list items
    // are generated from a single source of truth and cross-linked by slug.
    // ==================================================================
    (function initSediMap() {
        const markersContainer = document.getElementById('sediMarkers');
        const listContainer = document.getElementById('sediList');
        const countEl = document.getElementById('sediCount');
        const tooltip = document.getElementById('sediTooltip');
        const mapWrap = document.querySelector('.sedi-map-wrap');
        const mapSvg = document.querySelector('.sedi-map');
        if (!markersContainer || !listContainer || !tooltip || !mapWrap || !mapSvg) return;

        const CITIES = [
            { name: 'Roma',            x: 219.87, y: 290.35 },
            { name: 'Verona',          x: 167.21, y: 95.89 },
            { name: 'Milano',          x: 104.15, y: 94.47 },
            { name: 'Brescia',         x: 139.91, y: 90.21 },
            { name: 'Cosenza',         x: 351.39, y: 433.56 },
            { name: 'Padova',          x: 198.19, y: 97.65 },
            { name: 'Venezia',         x: 213.54, y: 95.76 },
            { name: 'Vicenza',         x: 186.24, y: 90.00 },
            { name: 'Treviso',         x: 210.51, y: 83.32 },
            { name: 'Rovigo',          x: 195.15, y: 116.14 },
            { name: 'Belluno',         x: 210.05, y: 57.33 },
            { name: 'Bolzano',         x: 179.42, y: 37.59 },
            { name: 'Monza',           x: 107.10, y: 87.85 },
            { name: 'Mantova',         x: 160.20, y: 111.40 },
            { name: 'Bergamo',         x: 121.21, y: 81.59 },
            { name: 'Pavia',           x: 103.04, y: 109.84 },
            { name: 'Cremona',         x: 133.29, y: 112.66 },
            { name: 'Alessandria',     x: 83.54,  y: 124.81 },
            { name: 'Cuneo',           x: 45.99,  y: 153.88 },
            { name: 'Torino',          x: 51.04,  y: 116.13 },
            { name: 'Sanremo',         x: 54.16,  y: 185.13 },
            { name: 'Savona',          x: 78.85,  y: 158.09 },
            { name: 'Firenze',         x: 175.95, y: 187.67 },
            { name: 'Livorno',         x: 142.87, y: 199.83 },
            { name: 'Lucca',           x: 149.59, y: 183.64 },
            { name: 'Pisa',            x: 146.06, y: 190.25 },
            { name: 'Prato',           x: 170.58, y: 181.73 },
            { name: 'Siena',           x: 178.57, y: 212.47 },
            { name: 'Parma',           x: 143.48, y: 130.92 },
            { name: 'Bologna',         x: 178.99, y: 147.78 },
            { name: 'Ravenna',         x: 208.88, y: 152.04 },
            { name: 'Pistoia',         x: 164.08, y: 178.67 },
            { name: 'Perugia',         x: 215.61, y: 223.83 },
            { name: 'Viterbo',         x: 205.77, y: 261.86 },
            { name: 'Latina',          x: 233.63, y: 314.28 },
            { name: 'Rieti',           x: 231.98, y: 262.75 },
            { name: 'Campobasso',      x: 295.38, y: 309.21 },
            { name: 'Chieti',          x: 277.87, y: 265.69 },
            { name: 'Pescara',         x: 279.50, y: 259.46 },
            { name: 'Teramo',          x: 261.65, y: 248.76 },
            { name: 'Ancona',          x: 255.16, y: 196.13 },
            { name: 'Macerata',        x: 252.87, y: 213.46 },
            { name: 'Pesaro',          x: 233.97, y: 179.94 },
            { name: 'Bari',            x: 373.02, y: 333.56 },
            { name: 'Barletta',        x: 352.35, y: 322.40 },
            { name: 'Foggia',          x: 326.56, y: 314.59 },
            { name: 'Lecce',           x: 418.63, y: 375.67 },
            { name: 'Taranto',         x: 385.90, y: 368.93 },
            { name: 'Potenza',         x: 335.70, y: 359.88 },
            { name: 'Catanzaro',       x: 363.08, y: 455.46 },
            { name: 'Reggio Calabria', x: 330.17, y: 499.38 },
            { name: 'Palmi',           x: 336.64, y: 485.80 },
            { name: 'Avellino',        x: 299.76, y: 344.70 },
            { name: 'Caserta',         x: 283.60, y: 336.04 },
            { name: 'Salerno',         x: 298.57, y: 357.45 },
            { name: 'Napoli',          x: 281.38, y: 348.15 },
            { name: 'Catania',         x: 310.41, y: 532.56 },
            { name: 'Messina',         x: 326.89, y: 494.84 },
            { name: 'Palermo',         x: 270.15, y: 499.14 },
            { name: 'Caltanissetta',   x: 274.69, y: 533.70 },
            { name: 'Trapani',         x: 221.78, y: 504.53 },
            { name: 'Cagliari',        x: 101.76, y: 437.69 },
            { name: 'Sud Sardegna',    x: 80.80,  y: 440.84 }
        ];

        const SVG_NS = 'http://www.w3.org/2000/svg';
        const slugify = (name) => name.toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '');

        countEl.textContent = CITIES.length;

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
            pulse.setAttribute('r', '4');
            pulse.setAttribute('class', 'sedi-marker-pulse');
            markersContainer.appendChild(pulse);

            const marker = document.createElementNS(SVG_NS, 'circle');
            marker.setAttribute('cx', city.x);
            marker.setAttribute('cy', city.y);
            marker.setAttribute('r', '4');
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

        // Build alphabetical list (locale-aware for Italian)
        const sortedCities = CITIES.slice().sort((a, b) =>
            a.name.localeCompare(b.name, 'it', { sensitivity: 'base' })
        );

        sortedCities.forEach((city) => {
            const slug = slugify(city.name);
            const li = document.createElement('li');
            li.setAttribute('data-city', slug);
            li.textContent = city.name;
            li.addEventListener('mouseenter', () => activate(city));
            li.addEventListener('mouseleave', deactivate);
            li.addEventListener('click', () => activate(city));
            listContainer.appendChild(li);
        });

        // Reposition the tooltip on window resize while a marker is active
        window.addEventListener('resize', () => {
            if (!activeSlug) return;
            const current = CITIES.find((c) => slugify(c.name) === activeSlug);
            if (current) positionTooltipFor(current);
        });
    })();

});
