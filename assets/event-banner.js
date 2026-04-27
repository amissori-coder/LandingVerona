/**
 * Next Generation Business — Upcoming events banner
 * ---------------------------------------------------------------
 * Drop-in, zero-dependency script that injects one floating banner
 * per upcoming NGB event on every content page. Banners stack
 * vertically in the bottom-right corner.
 *
 * Each banner hides itself automatically the day after its event
 * date. If the visitor is already on the event's own page (detected
 * via the pagePath token) that banner is skipped.
 *
 * Usage: add to any content page just before </body>:
 *   <script src="../assets/event-banner.js" defer></script>
 *
 * Config: add new entries to the NGB_EVENTS array below.
 */
(function () {
    'use strict';

    // ---------------- Config ----------------
    // Each entry supports:
    //   date     YYYY-MM-DD shown in the banner badge and used for sorting
    //   expires  YYYY-MM-DD optional — internal cut-off; the banner is
    //            removed the day after this date. If omitted, falls back
    //            to `date`. Never shown to the user.
    //   meta     optional custom text for the small grey line under the
    //            title. If omitted, auto-generated as "Wkd Day Month · City".
    const NGB_EVENTS = [
        {
            city: 'Roma',
            date: '2026-04-29',
            title: 'ZLS e Rating di Legalita',
            tagline: 'Prossimo convegno',
            url: 'roma_aprile_2026/',
            pagePath: 'roma_aprile_2026'
        },
        {
            city: 'Lazio',
            date: '2026-05-11',
            expires: '2026-05-30',
            title: 'Bandi Regione Lazio 2026',
            tagline: 'Apertura sportello',
            meta: 'A partire da lun 11 maggio &middot; Regione Lazio',
            url: 'lazio_bandi_2026/',
            pagePath: 'lazio_bandi_2026'
        }
    ];

    // ---------------- Guards ----------------
    if (typeof window === 'undefined' || !document || !document.createElement) return;

    const now = new Date();
    const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const upcoming = NGB_EVENTS
        .map((e) => Object.assign({}, e, {
            _d: new Date(e.date + 'T00:00:00'),
            // Internal cut-off: defaults to `date` so legacy entries
            // without `expires` keep their original lifespan.
            _exp: new Date((e.expires || e.date) + 'T00:00:00')
        }))
        .filter((e) => !isNaN(e._exp.getTime()) && e._exp.getTime() >= todayMid.getTime())
        .sort((a, b) => a._d.getTime() - b._d.getTime());

    if (upcoming.length === 0) return;

    // Skip events whose page the visitor is already on.
    const path = (window.location.pathname || '').toLowerCase();
    const visible = upcoming.filter(function (e) {
        return !(e.pagePath && path.indexOf(e.pagePath.toLowerCase()) !== -1);
    });
    if (visible.length === 0) return;

    // ---------------- URL resolution ----------------
    // Anchor relative URLs to the site root using the script's own src.
    let scriptRoot = null;
    try {
        const scriptEl = document.currentScript ||
            Array.prototype.slice.call(document.scripts).reverse().find(function (s) {
                return s.src && s.src.indexOf('event-banner.js') !== -1;
            });
        if (scriptEl && scriptEl.src) {
            scriptRoot = new URL('..', scriptEl.src).href; // …/assets/ → …/
        }
    } catch (_) { /* fall back to raw urls */ }

    function resolveUrl(rawUrl) {
        if (!scriptRoot) return rawUrl;
        try { return new URL(rawUrl.replace(/^\//, ''), scriptRoot).href; }
        catch (_) { return rawUrl; }
    }

    // ---------------- Italian date formatting ----------------
    const MONTHS_SHORT = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
    const MONTHS_FULL  = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
    const WEEKDAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];

    // ---------------- Style injection (once) ----------------
    const style = document.createElement('style');
    style.setAttribute('data-ngb-event-banner', '');
    style.textContent = [
        '.ngb-event-banner{',
        '  position:fixed;right:24px;z-index:9998;',
        '  max-width:360px;width:calc(100% - 48px);',
        '  background:linear-gradient(160deg,#0A2844 0%,#164068 60%,#2A5A85 100%);',
        '  color:#fff;border-radius:14px;padding:18px 40px 18px 18px;',
        '  box-shadow:0 22px 46px rgba(10,25,45,.38),0 4px 14px rgba(10,25,45,.2);',
        "  font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;",
        '  display:flex;gap:14px;align-items:flex-start;',
        '  transform:translateY(24px);opacity:0;',
        '  transition:transform .55s cubic-bezier(.22,1,.36,1),opacity .55s ease,bottom .35s ease;',
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
        '  .ngb-event-banner{right:12px;left:12px;max-width:none;width:auto;}',
        '}',
        '@media (prefers-reduced-motion:reduce){',
        '  .ngb-event-banner{transition:opacity .2s ease,bottom .2s ease;}',
        '}'
    ].join('');
    document.head.appendChild(style);

    // ---------------- Banner factory ----------------
    function createBanner(event) {
        const dayNum = event._d.getDate();
        const monthAbbr = MONTHS_SHORT[event._d.getMonth()];
        const weekdayAbbr = WEEKDAYS_SHORT[event._d.getDay()];
        const monthFull = MONTHS_FULL[event._d.getMonth()];
        // Custom meta wins over the auto-generated "Wkd Day Month · City".
        // Custom meta is treated as trusted HTML so &middot; etc. render.
        const autoMeta = escapeHtml(weekdayAbbr + ' ' + dayNum + ' ' + monthFull + ' · ' + event.city);
        const metaHtml = event.meta || autoMeta;
        const resolvedUrl = resolveUrl(event.url);

        const banner = document.createElement('aside');
        banner.className = 'ngb-event-banner';
        banner.setAttribute('role', 'complementary');
        banner.setAttribute('aria-label', 'Comunicazione Next Generation Business');
        banner.innerHTML =
            '<div class="ngb-eb-date" aria-hidden="true">' +
                '<span class="ngb-eb-day">' + dayNum + '</span>' +
                '<span class="ngb-eb-month">' + monthAbbr + '</span>' +
            '</div>' +
            '<div class="ngb-eb-content">' +
                '<span class="ngb-eb-label">' + escapeHtml(event.tagline) + '</span>' +
                '<h4 class="ngb-eb-title">' + escapeHtml(event.title) + '</h4>' +
                '<p class="ngb-eb-meta">' + metaHtml + '</p>' +
                '<a class="ngb-eb-cta" href="' + escapeAttr(resolvedUrl) + '">' +
                    'Scopri di piu' +
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
            banner.classList.remove('is-visible');
            setTimeout(function () {
                if (banner.parentNode) banner.parentNode.removeChild(banner);
                restack();
            }, 500);
        });

        return banner;
    }

    // ---------------- Stacking ----------------
    function restack() {
        const isMobile = window.matchMedia('(max-width:640px)').matches;
        const baseOffset = isMobile ? 12 : 24;
        const gap = isMobile ? 10 : 14;
        let bottomOffset = baseOffset;
        const all = document.querySelectorAll('.ngb-event-banner');
        for (let i = 0; i < all.length; i++) {
            all[i].style.bottom = bottomOffset + 'px';
            bottomOffset += all[i].offsetHeight + gap;
        }
    }

    // ---------------- Mount ----------------
    const banners = visible.map(createBanner);

    const mount = function () {
        if (!document.body) return;
        banners.forEach(function (b) { document.body.appendChild(b); });
        requestAnimationFrame(function () {
            restack();
            // Reveal after positioning so the entry animation fires from
            // the correct stacked location.
            banners.forEach(function (b) { b.classList.add('is-visible'); });
        });
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mount);
    } else {
        mount();
    }

    // Re-stack on resize so mobile/desktop transitions stay tidy.
    window.addEventListener('resize', restack);

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
