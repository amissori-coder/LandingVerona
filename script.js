/**
 * Next Generation Business — Main Landing
 * Vanilla JS: navbar scroll effect, smooth anchors, contents filter.
 */

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

});
