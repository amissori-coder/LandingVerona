/**
 * Next Generation Business — Upcoming event banner
 * ---------------------------------------------------------------
 * Drop-in, zero-dependency script that injects a floating banner
 * pointing at the next upcoming NGB event on every content page.
 * The banner hides itself automatically the day after the event.
 *
 * Usage: add to any content page just before </body>:
 *   <script src="../assets/event-banner.js" defer></script>
 *
 * Config: add new events to the NGB_EVENTS array below. Each event is
 * displayed from the moment the script runs until 23:59 of its event
 * date; from the following day it is filtered out. If the visitor is
 * already on the event's own page (detected via the pagePath token)
 * the banner is not shown.
 */
(function () {
    'use strict';

    // ---------------- Config ----------------
    const NGB_EVENTS = [
        {
            city: 'Roma',
            date: '2026-04-29',            // YYYY-MM-DD of the event
            title: 'ZLS e Rating di Legalità',
            tagline: 'Prossimo convegno',
            url: 'roma_aprile_2026/',       // relative to site root
            pagePath: 'roma_aprile_2026'    // substring of location.pathname that means "already on this event's page"
        }
    ];

    // ---------------- Guards ----------------
    if (typeof window === 'undefined' || !document || !document.createElement) return;

    // Pick the nearest event whose date is today or in the future.
    const now = new Date();
    const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const upcoming = NGB_EVENTS
        .map((e) => Object.assign({}, e, { _d: new Date(e.date + 'T00:00:00') }))
        .filter((e) => !isNaN(e._d.getTime()) && e._d.getTime() >= todayMid.getTime())
        .sort((a, b) => a._d.getTime() - b._d.getTime());

    if (upcoming.length === 0) return;
    const next = upcoming[0];

    // Skip if the visitor is already on the event's own page.
    const path = (window.location.pathname || '').toLowerCase();
    if (next.pagePath && path.indexOf(next.pagePath.toLowerCase()) !== -1) return;

    // Skip if the user dismissed the banner during this session.
    try {
        if (window.sessionStorage && sessionStorage.getItem('ngbEventBanner:' + next.date)) return;
    } catch (_) { /* ignore storage errors (private mode, etc.) */ }

    // ---------------- URL resolution ----------------
    // The banner can be included from any depth in the site. We resolve
    // the event URL using the script's own <script src="..."> to anchor
    // paths to the site root (…/assets/event-banner.js → site root).
    let resolvedUrl = next.url;
    try {
        const scriptEl = document.currentScript ||
            Array.prototype.slice.call(document.scripts).reverse().find(function (s) {
                return s.src && s.src.indexOf('event-banner.js') !== -1;
            });
        if (scriptEl && scriptEl.src) {
            const root = new URL('..', scriptEl.src); // …/assets/ → …/
            resolvedUrl = new URL(next.url.replace(/^\//, ''), root).href;
        }
    } catch (_) { /* best-effort; fall back to the raw url */ }

    // ---------------- Italian date formatting ----------------
    const MONTHS_SHORT = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
    const MONTHS_FULL  = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
    const WEEKDAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];

    const dayNum = next._d.getDate();
    const monthAbbr = MONTHS_SHORT[next._d.getMonth()];
    const weekdayAbbr = WEEKDAYS_SHORT[next._d.getDay()];
    const monthFull = MONTHS_FULL[next._d.getMonth()];
    const metaText = weekdayAbbr + ' ' + dayNum + ' ' + monthFull + ' · ' + next.city;

    // ---------------- Style injection ----------------
    const style = document.createElement('style');
    style.setAttribute('data-ngb-event-banner', '');
    style.textContent = [
        '.ngb-event-banner{',
        '  position:fixed;right:24px;bottom:24px;z-index:9998;',
        '  max-width:360px;width:calc(100% - 48px);',
        '  background:linear-gradient(160deg,#0A2844 0%,#164068 60%,#2A5A85 100%);',
        '  color:#fff;border-radius:14px;padding:18px 40px 18px 18px;',
        '  box-shadow:0 22px 46px rgba(10,25,45,.38),0 4px 14px rgba(10,25,45,.2);',
        "  font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;",
        '  display:flex;gap:14px;align-items:flex-start;',
        '  transform:translateY(24px);opacity:0;',
        '  transition:transform .55s cubic-bezier(.22,1,.36,1),opacity .55s ease;',
        '  border:1px solid rgba(255,255,255,.1);box-sizing:border-box;',
        '}',
        '.ngb-event-banner::before{',
        '  content:"";position:absolute;top:0;left:0;right:0;height:3px;',
        '  background:linear-gradient(90deg,#5B89B8 0%,#B1213B 100%);',
        '  border-radius:14px 14px 0 0;',
        '}',
        '.ngb-event-banner.is-visible{transform:translateY(0);opacity:1;}',
        '.ngb-eb-date{',
        '  flex-shrink:0;width:56px;text-align:center;padding:10px 0;',
        '  background:rgba(255,255,255,.08);',
        '  border:1px solid rgba(255,255,255,.16);',
        '  border-radius:8px;',
        '}',
        '.ngb-eb-day{',
        "  display:block;font-family:'Montserrat',sans-serif;",
        '  font-size:1.5rem;font-weight:800;color:#fff;line-height:1;letter-spacing:-.5px;',
        '}',
        '.ngb-eb-month{',
        '  display:block;font-size:.6rem;font-weight:800;letter-spacing:1.4px;',
        '  text-transform:uppercase;color:rgba(255,255,255,.75);margin-top:4px;',
        '}',
        '.ngb-eb-content{flex:1;min-width:0;}',
        '.ngb-eb-label{',
        "  display:block;font-family:'Montserrat',sans-serif;",
        '  font-size:.56rem;font-weight:800;letter-spacing:1.6px;',
        '  text-transform:uppercase;color:rgba(255,255,255,.58);margin-bottom:6px;',
        '}',
        '.ngb-eb-title{',
        "  font-family:'Montserrat',sans-serif;",
        '  font-size:.96rem;font-weight:700;color:#fff;line-height:1.25;',
        '  margin:0 0 4px;letter-spacing:-.2px;',
        '}',
        '.ngb-eb-meta{',
        '  font-size:.72rem;color:rgba(255,255,255,.6);margin:0 0 10px;',
        '}',
        '.ngb-eb-cta{',
        '  display:inline-flex;align-items:center;gap:6px;',
        "  font-family:'Montserrat',sans-serif;font-size:.68rem;font-weight:800;",
        '  letter-spacing:.6px;text-transform:uppercase;color:#7fbaff;',
        '  text-decoration:none;transition:color .2s ease,gap .2s ease;',
        '}',
        '.ngb-eb-cta:hover{color:#fff;gap:10px;}',
        '.ngb-eb-cta svg{width:12px;height:12px;stroke:currentColor;fill:none;}',
        '.ngb-eb-close{',
        '  position:absolute;top:8px;right:8px;width:26px;height:26px;',
        '  border-radius:50%;background:transparent;border:none;',
        '  color:rgba(255,255,255,.55);cursor:pointer;padding:0;',
        '  display:flex;align-items:center;justify-content:center;',
        '  transition:background .2s ease,color .2s ease;',
        '}',
        '.ngb-eb-close:hover{background:rgba(255,255,255,.12);color:#fff;}',
        '.ngb-eb-close svg{width:14px;height:14px;stroke:currentColor;fill:none;}',
        '@media (max-width:640px){',
        '  .ngb-event-banner{right:12px;left:12px;bottom:12px;max-width:none;width:auto;}',
        '}',
        '@media (prefers-reduced-motion:reduce){',
        '  .ngb-event-banner{transition:opacity .2s ease;}',
        '}'
    ].join('');
    document.head.appendChild(style);

    // ---------------- DOM construction ----------------
    const banner = document.createElement('aside');
    banner.className = 'ngb-event-banner';
    banner.setAttribute('role', 'complementary');
    banner.setAttribute('aria-label', 'Prossimo evento Next Generation Business');
    banner.innerHTML =
        '<div class="ngb-eb-date" aria-hidden="true">' +
            '<span class="ngb-eb-day">' + dayNum + '</span>' +
            '<span class="ngb-eb-month">' + monthAbbr + '</span>' +
        '</div>' +
        '<div class="ngb-eb-content">' +
            '<span class="ngb-eb-label">' + escapeHtml(next.tagline) + '</span>' +
            '<h4 class="ngb-eb-title">' + escapeHtml(next.title) + '</h4>' +
            '<p class="ngb-eb-meta">' + escapeHtml(metaText) + '</p>' +
            '<a class="ngb-eb-cta" href="' + escapeAttr(resolvedUrl) + '">' +
                'Scopri l\u2019evento' +
                '<svg viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                    '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>' +
                '</svg>' +
            '</a>' +
        '</div>' +
        '<button class="ngb-eb-close" type="button" aria-label="Chiudi il banner">' +
            '<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>' +
            '</svg>' +
        '</button>';

    banner.querySelector('.ngb-eb-close').addEventListener('click', function () {
        try { sessionStorage.setItem('ngbEventBanner:' + next.date, '1'); } catch (_) {}
        banner.classList.remove('is-visible');
        setTimeout(function () { if (banner.parentNode) banner.parentNode.removeChild(banner); }, 500);
    });

    // ---------------- Mount ----------------
    const mount = function () {
        if (!document.body) return;
        document.body.appendChild(banner);
        // Small delay to let the browser register the element before
        // applying the is-visible class for the entry transition.
        requestAnimationFrame(function () {
            banner.classList.add('is-visible');
        });
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mount);
    } else {
        mount();
    }

    // ---------------- Helpers ----------------
    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    function escapeAttr(s) { return escapeHtml(s); }
})();
