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

    // --- Regioni ZLS interactive explorer ---
    const REGIONI_ZLS = {
        'liguria-genova': {
            nome: 'ZLS Porto e Retroporto di Genova',
            regione: 'Liguria',
            tagline: 'Cluster portuale del Mar Ligure occidentale',
            istitutivo: 'DPCM 31 luglio 2024',
            anno: '2024',
            lead: "Una delle prime ZLS operative del Centro-Nord, ricomprende lo scalo portuale genovese e le aree retroportuali destinate alla logistica e alla manifattura collegate al traffico merci del Mediterraneo nord-occidentale.",
            superficie: 'Sistema porto + retroporto',
            estensione: '7 Comuni',
            ports: ['Porto di Genova', 'Voltri-Pra\'', 'Retroporto di Rivalta Scrivia', 'Alessandria-Tortona']
        },
        'liguria-spezia': {
            nome: 'ZLS Porto e Retroporto della Spezia',
            regione: 'Liguria',
            tagline: 'La nuova ZLS istituita nel 2026',
            istitutivo: 'DPCM 19 gennaio 2026',
            anno: '2026',
            lead: "Istituita con DPCM del 19 gennaio 2026, è l'ultima ZLS attivata. Comprende il sistema portuale spezzino e le aree retroportuali della Val di Magra fino agli snodi logistici toscani settentrionali.",
            superficie: 'Sistema porto + retroporto',
            estensione: 'Aree portuali e retroportuali',
            ports: ['Porto della Spezia', 'Santo Stefano Magra', 'Aree retroportuali Val di Magra']
        },
        'lombardia': {
            nome: 'ZLS Lombardia',
            regione: 'Lombardia',
            tagline: 'Hub interportuale del Nord Italia',
            istitutivo: 'DPCM istitutivo',
            anno: '2024',
            lead: 'Ricomprende i principali nodi interportuali e logistici lombardi, integrati con il sistema portuale ligure attraverso i corridoi infrastrutturali del Nord-Ovest.',
            superficie: 'Aree interportuali multiple',
            estensione: 'Più poli logistici',
            ports: ['Interporto di Mortara', 'Hub logistici dell\'asse Milano-Ovest']
        },
        'veneto': {
            nome: 'ZLS Veneto - Porto di Venezia-Rodigino',
            regione: 'Veneto',
            tagline: 'Sistema portuale Alto Adriatico',
            istitutivo: 'DPCM istitutivo',
            anno: '2024',
            lead: "Comprende il porto di Venezia, l'area retroportuale di Marghera e l'asse logistico-produttivo del Polesine, integrato con i nodi infrastrutturali del Nord-Est.",
            superficie: 'Porto + retroporto + area rodigina',
            estensione: 'Province di Venezia e Rovigo',
            ports: ['Porto di Venezia', 'Porto Marghera', 'Interporto di Rovigo', 'Area produttiva polesana']
        },
        'fvg': {
            nome: 'ZLS Friuli-Venezia Giulia',
            regione: 'Friuli-Venezia Giulia',
            tagline: 'Porta orientale dei traffici europei',
            istitutivo: 'DPCM istitutivo',
            anno: '2024',
            lead: 'Si estende al sistema portuale di Trieste e Monfalcone, snodo strategico per i traffici ferroviari e marittimi tra Mediterraneo, Centro Europa e Balcani.',
            superficie: 'Sistema porto + retroporto',
            estensione: 'Province di Trieste e Gorizia',
            ports: ['Porto di Trieste', 'Porto di Monfalcone', 'Interporto di Cervignano', 'Aree retroportuali']
        },
        'emilia': {
            nome: 'ZLS Emilia-Romagna',
            regione: 'Emilia-Romagna',
            tagline: 'Logistica integrata padana',
            istitutivo: 'DPCM istitutivo',
            anno: '2024',
            lead: "Combina il porto di Ravenna con la rete interportuale emiliano-romagnola, una delle più dense d'Europa, lungo i corridoi logistici dell'Adriatico e della Pianura Padana.",
            superficie: 'Porto + interporti',
            estensione: 'Più province emiliano-romagnole',
            ports: ['Porto di Ravenna', 'Interporto di Bologna', 'Interporto di Parma (CePIM)', 'Dinazzano (RE)']
        },
        'toscana': {
            nome: 'ZLS Toscana',
            regione: 'Toscana',
            tagline: 'Sistema portuale del Mar Tirreno settentrionale',
            istitutivo: 'DPCM istitutivo',
            anno: '2024',
            lead: 'Ricomprende il sistema portuale di Livorno e Piombino e le aree retroportuali e interportuali toscane, snodo per i traffici merci verso Sardegna, Corsica e Mediterraneo.',
            superficie: 'Più porti + interporto',
            estensione: 'Costa tirrenica toscana',
            ports: ['Porto di Livorno', 'Porto di Piombino', 'Interporto Toscano "A. Vespucci" (Guasticce)']
        },
        'umbria': {
            nome: 'ZLS Umbria',
            regione: 'Umbria',
            tagline: 'Nodo logistico interregionale',
            istitutivo: 'DPCM istitutivo',
            anno: '2024',
            lead: 'Estensione delle ZLS alle aree logistico-produttive dell\'Umbria, regione in transizione, con l\'obiettivo di valorizzare i nodi interportuali del Centro Italia.',
            superficie: 'Aree logistico-produttive',
            estensione: 'Province di Perugia e Terni',
            ports: ['Polo logistico di Terni-Narni', 'Aree industriali umbre']
        },
        'marche': {
            nome: 'ZLS Marche',
            regione: 'Marche',
            tagline: 'Porto adriatico del Centro Italia',
            istitutivo: 'DPCM istitutivo',
            anno: '2024',
            lead: "ZLS attivata sull'asse portuale di Ancona e sulle aree retroportuali marchigiane, in qualità di regione in transizione non ricompresa nella ZES Mezzogiorno.",
            superficie: 'Porto + retroporto',
            estensione: 'Asse adriatico marchigiano',
            ports: ['Porto di Ancona', 'Interporto Marche', 'Aree retroportuali']
        },
        'lazio': {
            nome: 'ZLS Lazio',
            regione: 'Lazio',
            tagline: 'Sistema portuale del Mar Tirreno centrale',
            istitutivo: 'DPCM istitutivo',
            anno: '2024',
            lead: "Comprende il porto di Civitavecchia e i nodi logistici del Lazio, centrale per i traffici crocieristici e commerciali del Mediterraneo centrale e per l'integrazione tra l'area metropolitana di Roma e le grandi reti europee.",
            superficie: 'Porto + nodi logistici',
            estensione: 'Asse tirrenico laziale',
            ports: ['Porto di Civitavecchia', 'Porto di Gaeta', 'Hub logistici dell\'area romana']
        }
    };

    const regioniWrap = document.querySelector('[data-regioni]');
    if (regioniWrap) {
        const detail = regioniWrap.querySelector('#regioneDetail');
        const pills = regioniWrap.querySelectorAll('.regione-pill');
        const markers = regioniWrap.querySelectorAll('.region-marker');

        const renderRegione = (key) => {
            const r = REGIONI_ZLS[key];
            if (!r) return;
            const portsHtml = r.ports.map((p) => `<li>${p}</li>`).join('');
            detail.innerHTML = `
                <div class="regione-detail-head">
                    <div>
                        <h3>${r.nome}</h3>
                        <p>${r.regione} &middot; ${r.tagline}</p>
                    </div>
                    <span class="regione-detail-badge">${r.istitutivo}</span>
                </div>
                <p class="regione-detail-lead">${r.lead}</p>
                <div class="regione-detail-grid">
                    <div class="regione-detail-item">
                        <h4>Anno di istituzione</h4>
                        <p>${r.anno}</p>
                    </div>
                    <div class="regione-detail-item">
                        <h4>Composizione</h4>
                        <p>${r.superficie}</p>
                    </div>
                    <div class="regione-detail-item">
                        <h4>Estensione territoriale</h4>
                        <p>${r.estensione}</p>
                    </div>
                </div>
                <div class="regione-detail-ports">
                    <h4>Porti, interporti e nodi logistici principali</h4>
                    <ul>${portsHtml}</ul>
                </div>
            `;
        };

        const setActive = (key) => {
            pills.forEach((p) => {
                const isActive = p.dataset.region === key;
                p.setAttribute('aria-selected', isActive ? 'true' : 'false');
                p.tabIndex = isActive ? 0 : -1;
            });
            markers.forEach((m) => {
                m.classList.toggle('active', m.dataset.region === key);
            });
            renderRegione(key);
        };

        pills.forEach((pill, idx) => {
            pill.addEventListener('click', () => setActive(pill.dataset.region));
            pill.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    const next = pills[(idx + 1) % pills.length];
                    next.focus();
                    setActive(next.dataset.region);
                } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    const prev = pills[(idx - 1 + pills.length) % pills.length];
                    prev.focus();
                    setActive(prev.dataset.region);
                }
            });
        });

        markers.forEach((marker) => {
            marker.addEventListener('click', () => setActive(marker.dataset.region));
        });

        // Initial render
        const initial = regioniWrap.querySelector('.regione-pill[aria-selected="true"]');
        setActive(initial ? initial.dataset.region : 'liguria-genova');
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
