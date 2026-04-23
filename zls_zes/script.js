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
    // Aliquote: intensità massime indicative ai sensi della Carta degli aiuti
    // a finalità regionale 2022-2027 (zone "c"). Il valore puntuale dipende
    // dal singolo Comune: per le regioni in transizione (Marche, Umbria) e
    // per le zone "c" predefinite si applica fino al 15% per le grandi
    // imprese; nelle altre zone "c" del Centro-Nord il massimale base per
    // le grandi imprese è 10%. Maggiorazioni: +20% piccole, +10% medie.
    const REGIONI_ZLS = {
        'liguria-genova': {
            nome: 'ZLS Porto e Retroporto di Genova',
            regione: 'Liguria (con estensioni in Piemonte, Lombardia ed Emilia-Romagna)',
            tagline: 'Cluster portuale del Mar Ligure occidentale',
            istitutivo: 'DPCM istitutivo (2024)',
            anno: '2024',
            lead: "Una delle ZLS più estese del Centro-Nord: ricomprende lo scalo portuale genovese e si sviluppa lungo gli assi ferroviari e autostradali verso l'entroterra piemontese, lombardo ed emiliano, fino agli interporti del Nord-Ovest.",
            superficie: 'Sistema porto + retroporti interregionali',
            estensione: 'Liguria, Piemonte, Lombardia ed Emilia-Romagna',
            aliquote: { piccole: '30%', medie: '20%', grandi: '10%' },
            ports: ['Porto di Genova', 'Voltri-Pra\'', 'Vado Ligure', 'Interporto di Rivalta Scrivia', 'Milano Smistamento', 'Dinazzano (RE)'],
            comuni: ['Genova', 'Vado Ligure', 'Rivalta Scrivia', 'Arquata Scrivia', 'Novi Ligure', 'Alessandria', 'Castellazzo Bormida', 'Ovada', 'Tortona', 'Piacenza', 'Dinazzano', 'Melzo', 'Pioltello', 'Segrate', 'Vignate', 'Milano Smistamento']
        },
        'liguria-spezia': {
            nome: 'ZLS Porto e Retroporto della Spezia',
            regione: 'Liguria (con estensione in Emilia-Romagna)',
            tagline: 'Nuova ZLS attivata il 19 gennaio 2026',
            istitutivo: 'DPCM 19 gennaio 2026',
            anno: '2026',
            lead: "Istituita con DPCM del 19 gennaio 2026, è la più recente ZLS attivata. Comprende il sistema portuale spezzino, le aree retroportuali della Val di Magra e si estende anche su alcuni Comuni dell'Emilia-Romagna lungo l'asse logistico Spezia-Parma.",
            superficie: 'Sistema porto + retroporto',
            estensione: 'Liguria + estensioni in Emilia',
            aliquote: { piccole: '30%', medie: '20%', grandi: '10%' },
            ports: ['Porto della Spezia', 'Santo Stefano di Magra', 'Aree retroportuali Val di Magra'],
            comuni: ['La Spezia', 'Arcola', 'Follo', 'Santo Stefano di Magra', 'Vezzano Ligure']
        },
        'lombardia': {
            nome: 'ZLS Regione Lombardia',
            regione: 'Lombardia',
            tagline: 'Sistema dei porti fluviali lombardi',
            istitutivo: 'DPCM 27 dicembre 2024',
            anno: '2024',
            lead: 'La ZLS Regione Lombardia riguarda il sistema dei porti fluviali e interportuali delle province di Cremona e Mantova, lungo il corridoio del Po e i suoi affluenti, 18 Comuni complessivi (9 in provincia di Cremona e 9 in provincia di Mantova).',
            superficie: 'Porti fluviali + interporti',
            estensione: 'Province di Cremona e Mantova',
            aliquote: { piccole: '30%', medie: '20%', grandi: '10%' },
            ports: ['Porto di Cremona', 'Porto di Mantova', 'Hub fluviali del Po'],
            comuni: ['Cremona', 'Mantova', '7 Comuni della provincia di Cremona', '8 Comuni della provincia di Mantova']
        },
        'veneto': {
            nome: 'ZLS Veneto - Porto di Venezia-Rodigino',
            regione: 'Veneto',
            tagline: 'Sistema portuale Alto Adriatico',
            istitutivo: 'DPCM 5 ottobre 2022',
            anno: '2022',
            lead: "Una delle prime ZLS istituite in Italia. Comprende il porto di Venezia, Marghera e l'asse logistico-produttivo del Polesine, integrato con i nodi del Nord-Est e del corridoio Mediterraneo.",
            superficie: 'Porto + retroporto + area rodigina',
            estensione: 'Province di Venezia e Rovigo',
            aliquote: { piccole: '30%', medie: '20%', grandi: '10%' },
            ports: ['Porto di Venezia', 'Porto Marghera', 'Interporto di Rovigo'],
            comuni: ['Venezia (Marghera, Campalto, Murano, Tronchetto)', 'Rovigo', 'Occhiobello', 'Polesella', 'Castelmassa', 'Bagnolo di Po', 'Ficarolo', 'Stienta', 'Trecenta', 'Fiesso Umbertiano', 'Bergantino', 'Melara', 'Bosaro', 'Calto', 'Canaro', 'Castelnovo Bariano', 'Ceneselli', 'Gaiba', 'Salara']
        },
        'fvg': {
            nome: 'ZLS Friuli-Venezia Giulia',
            regione: 'Friuli-Venezia Giulia',
            tagline: 'Porta orientale dei traffici europei',
            istitutivo: 'DPCM 3 febbraio 2025',
            anno: '2025',
            lead: 'Si estende sul sistema portuale di Trieste, Monfalcone e San Giorgio di Nogaro, snodo strategico per i traffici ferroviari e marittimi tra Mediterraneo, Centro Europa e Balcani: 26 Comuni in tre province.',
            superficie: '3 porti + interporti + aree industriali',
            estensione: '26 Comuni in province di Trieste, Gorizia, Udine e Pordenone',
            aliquote: { piccole: '30%', medie: '20%', grandi: '10%' },
            ports: ['Porto di Trieste', 'Porto di Monfalcone', 'Porto di San Giorgio di Nogaro', 'Interporto di Cervignano', 'Interporto di Pordenone'],
            comuni: ['Trieste', 'Monfalcone', 'Gorizia', 'Ronchi dei Legionari', 'Staranzano', 'Mossa', 'San Giorgio di Nogaro', 'Torviscosa', 'Cervignano del Friuli', 'Udine', 'Pavia di Udine', 'Buttrio', 'Manzano', 'San Giovanni al Natisone', 'Cividale del Friuli', 'Moimacco', 'Buja', 'Osoppo', 'Venzone', 'Amaro', 'Tarvisio', 'Mereto di Tomba', 'Pordenone', 'Brugnera', 'San Vito al Tagliamento', 'Spilimbergo', 'Zoppola']
        },
        'emilia': {
            nome: 'ZLS Emilia-Romagna',
            regione: 'Emilia-Romagna',
            tagline: 'Logistica integrata padana',
            istitutivo: 'DPCM 11 ottobre 2024',
            anno: '2024',
            lead: "Combina il porto di Ravenna con la rete interportuale emiliano-romagnola, una delle più dense d'Europa: 11 nodi intermodali, 25 aree produttive, 9 province e circa 4.500 ettari di territorio, su 28 Comuni.",
            superficie: 'Porto + 11 nodi intermodali',
            estensione: '28 Comuni in 9 province',
            aliquote: { piccole: '30%', medie: '20%', grandi: '10%' },
            ports: ['Porto di Ravenna', 'Interporto di Bologna', 'Interporto CePIM (Parma)', 'Hub ferroviario di Piacenza', 'Dinazzano (RE)'],
            comuni: ['Ravenna', 'Bologna', 'Parma', 'Piacenza', 'Modena', 'Reggiolo', 'Rubiera', 'Casalgrande', 'Ferrara', 'Bondeno', 'Codigoro', 'Argenta', 'Bagnacavallo', 'Lugo', 'Faenza', 'Imola', 'Forlì', 'Forlimpopoli', 'Cesena', 'Rimini', 'Misano Adriatico', 'Mirandola', 'Concordia sulla Secchia', 'Guastalla', 'Fontevivo', 'Bentivoglio', 'San Giorgio di Piano', 'Conselice', 'Cotignola', 'Ostellato']
        },
        'toscana': {
            nome: 'ZLS Toscana',
            regione: 'Toscana',
            tagline: 'Sistema portuale del Mar Tirreno settentrionale',
            istitutivo: 'DPCM 25 novembre 2024',
            anno: '2024',
            lead: "Ricomprende quattro porti della costa toscana, l'aeroporto di Pisa e i due principali interporti regionali: snodo per i traffici merci verso Sardegna, Corsica e Mediterraneo.",
            superficie: '4 porti + 2 interporti + 1 aeroporto',
            estensione: '10 Comuni tra costa e asse Firenze-Prato',
            aliquote: { piccole: '30%', medie: '20%', grandi: '10%' },
            ports: ['Porto di Livorno', 'Porto di Piombino', 'Porto di Marina di Carrara', 'Porto di Portoferraio', 'Interporto Toscano A. Vespucci (Guasticce)', 'Interporto della Toscana Centrale (Prato)', 'Aeroporto di Pisa'],
            comuni: ['Livorno', 'Collesalvetti', 'Piombino', 'Pisa', 'Carrara', 'Massa', 'Prato', 'Campi Bisenzio', 'Firenze', 'Portoferraio']
        },
        'umbria': {
            nome: 'ZLS Umbria',
            regione: 'Umbria',
            tagline: 'Regione in transizione - intensità maggiorate',
            istitutivo: 'Estensione alle regioni in transizione',
            anno: '2024',
            lead: "Estensione delle ZLS alle aree logistico-produttive dell'Umbria. Trattandosi di regione in transizione, può accedere alle intensità di aiuto più favorevoli previste dalla Carta aiuti regionali.",
            superficie: 'Aree logistico-produttive',
            estensione: 'Province di Perugia e Terni',
            aliquote: { piccole: '35%', medie: '25%', grandi: '15%' },
            ports: ['Polo logistico di Terni-Narni', 'Hub di Perugia', 'Aree industriali umbre'],
            comuni: ['Terni', 'Narni', 'Perugia (aree logistiche)', 'Foligno', 'Spoleto']
        },
        'marche': {
            nome: 'ZLS Marche',
            regione: 'Marche',
            tagline: 'Regione in transizione - intensità maggiorate',
            istitutivo: 'Estensione alle regioni in transizione',
            anno: '2024',
            lead: "ZLS attivata sull'asse portuale di Ancona e sulle aree retroportuali marchigiane in qualità di regione in transizione non ricompresa nella ZES Mezzogiorno: l'intera regione accede alle intensità di aiuto più favorevoli.",
            superficie: 'Porto + retroporto',
            estensione: 'Asse adriatico marchigiano',
            aliquote: { piccole: '35%', medie: '25%', grandi: '15%' },
            ports: ['Porto di Ancona', 'Interporto Marche (Jesi)', 'Aree retroportuali'],
            comuni: ['Ancona', 'Jesi', 'Falconara Marittima', 'Senigallia', 'Pesaro', 'Fano', 'Civitanova Marche']
        },
        'lazio': {
            nome: 'ZLS Lazio',
            regione: 'Lazio',
            tagline: 'Sistema portuale del Mar Tirreno centrale',
            istitutivo: 'DPCM 17 novembre 2025',
            anno: '2025',
            lead: "Istituita con DPCM del 17 novembre 2025 (registrato alla Corte dei Conti il 16 gennaio 2026). Comprende i porti di Civitavecchia, Fiumicino e Gaeta, i relativi retroporti e una rete di nodi logistici distribuita su 64 Comuni in 5 province: di questi, 36 sono ammessi alle deroghe previste per gli aiuti a finalità regionale.",
            superficie: '3 porti + aeroporto + nodi logistici',
            estensione: '64 Comuni in 5 province (di cui 36 in zone agevolate)',
            aliquote: { piccole: '30%', medie: '20%', grandi: '10%' },
            ports: ['Porto di Civitavecchia', 'Porto di Fiumicino', 'Porto di Gaeta', 'Aeroporto di Fiumicino', 'Hub logistici dell\'area romana'],
            comuni: ['Roma', 'Civitavecchia', 'Fiumicino', 'Formello', 'Fiano Romano', 'Guidonia Montecelio', 'Tivoli', 'Pomezia', 'Ardea', 'Albano Laziale', 'Velletri', 'Marino', 'Ciampino', 'Colleferro', 'Campagnano di Roma', 'Anguillara Sabazia', 'Allumiere', 'Viterbo', 'Tarquinia', 'Civita Castellana', 'Orte', 'Rieti', 'Cittaducale', 'Amatrice', 'Accumoli', 'Leonessa', 'Fara in Sabina', 'Latina', 'Aprilia', 'Cisterna di Latina', 'Sermoneta', 'Sezze', 'Pontinia', 'Terracina', 'Fondi', 'Monte San Biagio', 'Itri', 'Gaeta', 'Formia', 'Minturno', 'Castelforte', 'Santi Cosma e Damiano', 'Frosinone', 'Cassino', 'Anagni', 'Ferentino', 'Ceccano', 'Ceprano', 'Sora', 'Isola del Liri', 'Roccasecca', 'Patrica', 'Piedimonte San Germano', 'Villa Santa Lucia', 'San Vittore del Lazio', 'San Giorgio a Liri', 'Sant\'Apollinare', 'Sant\'Ambrogio sul Garigliano', 'Sant\'Andrea del Garigliano', 'Ausonia', 'Castelnuovo Parano', 'Coreno Ausonio', 'Esperia', 'Pignataro Interamna']
        }
    };

    const regioniWrap = document.querySelector('[data-regioni]');
    if (regioniWrap) {
        const detail = regioniWrap.querySelector('#regioneDetail');
        const pills = regioniWrap.querySelectorAll('.regione-pill');

        const sortIT = (a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' });

        const renderRegione = (key) => {
            const r = REGIONI_ZLS[key];
            if (!r) return;
            const portsHtml = r.ports.map((p) => `<li>${p}</li>`).join('');
            const comuniHtml = r.comuni.slice().sort(sortIT).map((c) => `<li>${c}</li>`).join('');
            detail.innerHTML = `
                <div class="regione-detail-head">
                    <div>
                        <h3>${r.nome}</h3>
                        <p>${r.regione} &bull; ${r.tagline}</p>
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

                <div class="regione-detail-aliquote">
                    <div class="aliquote-head">
                        <h4>Intensità massima del credito</h4>
                        <span class="aliquote-note">Carta aiuti regionali 2022-2027 (zone "c")</span>
                    </div>
                    <div class="aliquote-grid">
                        <div class="aliquota-card aliquota-piccole">
                            <span class="aliquota-percent">${r.aliquote.piccole}</span>
                            <span class="aliquota-label">Piccole imprese</span>
                            <span class="aliquota-desc">aliquota base + maggiorazione +20%</span>
                        </div>
                        <div class="aliquota-card aliquota-medie">
                            <span class="aliquota-percent">${r.aliquote.medie}</span>
                            <span class="aliquota-label">Medie imprese</span>
                            <span class="aliquota-desc">aliquota base + maggiorazione +10%</span>
                        </div>
                        <div class="aliquota-card aliquota-grandi">
                            <span class="aliquota-percent">${r.aliquote.grandi}</span>
                            <span class="aliquota-label">Grandi imprese</span>
                            <span class="aliquota-desc">aliquota base senza maggiorazione</span>
                        </div>
                    </div>
                </div>

                <div class="regione-detail-ports">
                    <h4>Porti, interporti e nodi logistici principali</h4>
                    <ul>${portsHtml}</ul>
                </div>

                <div class="regione-detail-comuni">
                    <div class="comuni-head">
                        <h4>Comuni interessati</h4>
                        <span class="comuni-count">${r.comuni.length} principali</span>
                    </div>
                    <ul class="comuni-list">${comuniHtml}</ul>
                </div>
            `;
        };

        const setActive = (key) => {
            pills.forEach((p) => {
                const isActive = p.dataset.region === key;
                p.setAttribute('aria-selected', isActive ? 'true' : 'false');
                p.tabIndex = isActive ? 0 : -1;
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

        // Initial render
        const initial = regioniWrap.querySelector('.regione-pill[aria-selected="true"]');
        setActive(initial ? initial.dataset.region : 'emilia');
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
