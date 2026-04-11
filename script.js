/**
 * Next Generation Business — Main Landing
 * Minimal interactions: navbar scroll effect and smooth anchor links.
 */

document.addEventListener('DOMContentLoaded', () => {

    // Navbar: add .scrolled class after 60px of scroll
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

    // Smooth-scroll for in-page anchor links (nav menu, hero CTA)
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

});
