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
});
