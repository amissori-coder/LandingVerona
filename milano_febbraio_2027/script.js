/**
 * Next Generation Business – Milano, 26 febbraio 2027
 * Navigazione, conto alla rovescia, animazioni allo scorrimento.
 * Le iscrizioni non sono ancora aperte: niente modulo in questa pagina.
 */

document.addEventListener('DOMContentLoaded', () => {

    // ========================
    // NAVBAR
    // ========================
    const navbar = document.getElementById('navbar');
    const navToggle = document.getElementById('navToggle');
    const navMenu = document.getElementById('navMenu');

    const aggiornaNavbar = () => navbar.classList.toggle('scrolled', window.scrollY > 40);
    window.addEventListener('scroll', aggiornaNavbar, { passive: true });
    aggiornaNavbar();

    navToggle.addEventListener('click', () => {
        const aperto = navMenu.classList.toggle('active');
        navToggle.classList.toggle('active', aperto);
        navToggle.setAttribute('aria-expanded', String(aperto));
    });

    navMenu.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            navToggle.classList.remove('active');
            navMenu.classList.remove('active');
            navToggle.setAttribute('aria-expanded', 'false');
        });
    });

    // ========================
    // CONTO ALLA ROVESCIA
    // L'orario d'inizio non è ancora fissato: si conta fino all'inizio
    // della giornata del 26 febbraio 2027 (ora di Milano).
    // ========================
    const eventDate = new Date('2027-02-26T00:00:00+01:00').getTime();
    const eventEnd = new Date('2027-02-27T00:00:00+01:00').getTime();
    const countdownEl = document.getElementById('countdown');
    const daysEl = document.getElementById('days');
    const hoursEl = document.getElementById('hours');
    const minutesEl = document.getElementById('minutes');
    const secondsEl = document.getElementById('seconds');
    let timer = null;

    function updateCountdown() {
        const now = Date.now();
        const distance = eventDate - now;

        if (distance < 0) {
            const testo = now < eventEnd ? 'L\'evento è oggi' : 'L\'evento si è concluso';
            countdownEl.innerHTML = '<p>' + testo + '</p>';
            if (timer) clearInterval(timer);
            return;
        }

        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        daysEl.textContent = String(days).padStart(2, '0');
        hoursEl.textContent = String(hours).padStart(2, '0');
        minutesEl.textContent = String(minutes).padStart(2, '0');
        secondsEl.textContent = String(seconds).padStart(2, '0');
    }

    if (countdownEl) {
        updateCountdown();
        timer = setInterval(updateCountdown, 1000);
    }

    // ========================
    // ANIMAZIONI ALLO SCORRIMENTO
    // ========================
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    document.querySelectorAll('.momento, .pranzo, .percorso li, .sede-info, .sede-mappa, .presenza, .scarica').forEach((el, index) => {
        el.classList.add('fade-in');
        el.style.transitionDelay = `${(index % 4) * 0.08}s`;
        observer.observe(el);
    });

    // ========================
    // ANTEPRIMA DEGLI APPROFONDIMENTI
    // Un clic su un tema della giornata non porta subito via dalla pagina:
    // apre una finestra con l'immagine, il titolo e la descrizione della
    // pagina di approfondimento (letti dalla pagina stessa) e chiede se
    // andarci. Ctrl/Cmd/Maiusc + clic e il clic centrale restano quelli
    // del browser (nuova scheda o finestra). Senza <dialog> il link va
    // dritto alla pagina, come prima.
    // ========================
    const dialogo = document.getElementById('anteprima');
    if (dialogo && typeof dialogo.showModal === 'function') {
        const img = document.getElementById('anteprima-img');
        const titolo = document.getElementById('anteprima-titolo');
        const testo = document.getElementById('anteprima-testo');
        const vai = document.getElementById('anteprima-vai');
        const cache = new Map();
        let richiesta = 0;

        const leggiPagina = (url) => {
            if (!cache.has(url)) {
                cache.set(url, fetch(url, { credentials: 'same-origin' })
                    .then(r => { if (!r.ok) throw new Error(r.status); return r.text(); })
                    .then(html => {
                        const doc = new DOMParser().parseFromString(html, 'text/html');
                        const meta = (sel) => (doc.querySelector(sel) || {}).content || '';
                        const h1 = doc.querySelector('h1');
                        if (h1) h1.querySelectorAll('br').forEach(br => br.replaceWith(' '));
                        const nome = (h1 && h1.textContent.replace(/\s+/g, ' ').trim())
                            || meta('meta[property="og:title"]').replace(/\s*\|.*$/, '')
                            || doc.title;
                        const immagine = meta('meta[property="og:image"]');
                        let src = '';
                        // Stesso sito: l'immagine si prende dal percorso, cosi' funziona anche in prova.
                        if (immagine) { try { const u = new URL(immagine, url); src = u.pathname + u.search; } catch (e) {} }
                        return { nome, descrizione: meta('meta[name="description"]'), src };
                    })
                    .catch(err => { cache.delete(url); throw err; }));
            }
            return cache.get(url);
        };

        const apri = (link) => {
            const id = ++richiesta;
            vai.href = link.href;
            titolo.textContent = link.textContent.trim();
            testo.textContent = '';
            img.classList.remove('caricata');
            img.removeAttribute('src');
            dialogo.classList.add('in-caricamento');
            dialogo.showModal();
            vai.focus();

            leggiPagina(link.href).then(info => {
                if (id !== richiesta) return;
                titolo.textContent = info.nome || titolo.textContent;
                testo.textContent = info.descrizione;
                if (info.src) {
                    img.onload = () => img.classList.add('caricata');
                    img.src = info.src;
                }
            }).catch(() => {
                if (id === richiesta) testo.textContent = 'Anteprima non disponibile: puoi comunque aprire la pagina.';
            }).finally(() => {
                if (id === richiesta) dialogo.classList.remove('in-caricamento');
            });
        };

        document.querySelectorAll('.momento-temi a').forEach(link => {
            link.addEventListener('click', (e) => {
                if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                e.preventDefault();
                apri(link);
            });
            // Si comincia a leggere la pagina appena il puntatore ci passa sopra.
            link.addEventListener('pointerenter', () => { leggiPagina(link.href).catch(() => {}); }, { once: true });
        });

        const chiudi = () => dialogo.close();
        document.getElementById('anteprima-annulla').addEventListener('click', chiudi);
        document.getElementById('anteprima-chiudi').addEventListener('click', chiudi);
        // Clic sullo sfondo scuro, fuori dalla finestra.
        dialogo.addEventListener('click', (e) => {
            const r = dialogo.getBoundingClientRect();
            if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) chiudi();
        });
    }
});
