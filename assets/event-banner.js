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
    //   finestra optional: on the HOME PAGE this event is presented in a
    //            centred window instead of the corner banner. Fields:
    //            titolo, giorno (weekday + date), luogo, punti (short
    //            facts), nota, pdf (save the date, relative to the site).
    //            The window opens once per browser session.
    const NGB_EVENTS = [
        {
            city: 'Milano',
            date: '2027-02-26',
            title: 'Merito creditizio e crescita delle imprese',
            tagline: 'Save the date',
            meta: 'Ven 26 febbraio 2027 &middot; Milano &middot; iscrizioni a breve',
            url: 'milano_febbraio_2027/',
            pagePath: 'milano_febbraio_2027',
            finestra: {
                titolo: 'Merito creditizio, crescita e competitività delle imprese',
                giorno: 'Venerdì 26 febbraio 2027',
                luogo: 'Excelsior Hotel Gallia, Milano',
                punti: ['Convegno al mattino', 'Incontri B2B al pomeriggio', 'Partecipazione gratuita', 'Solo in presenza'],
                nota: 'Le iscrizioni apriranno a breve.',
                pdf: 'milano_febbraio_2027/save-the-date-milano-2027.pdf'
            }
        },
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

    // ---------------- Home page: centred window ----------------
    /* In home la comunicazione del prossimo evento non sta in un angolo:
       si apre una finestra al centro, una volta per sessione del browser
       (chiusa, non torna finche' non si riapre il sito). Sulle altre pagine
       resta il banner piccolo in basso a destra. */
    function eHome() {
        try {
            const radice = scriptRoot ? new URL(scriptRoot).pathname : '/';
            const p = window.location.pathname.replace(/index\.html$/, '');
            return p === radice;
        } catch (_) { return false; }
    }
    const inFinestra = eHome() ? visible.find(function (e) { return !!e.finestra; }) : null;
    if (inFinestra) {
        const chiave = 'ngb-finestra-' + inFinestra.date + '-' + inFinestra.city;
        let giaVista = false;
        try { giaVista = window.sessionStorage.getItem(chiave) === '1'; } catch (_) { giaVista = false; }
        if (!giaVista) apriFinestra(inFinestra, chiave);
        return;
    }

    function apriFinestra(ev, chiave) {
        const f = ev.finestra;
        const st = document.createElement('style');
        st.setAttribute('data-ngb-event-finestra', '');
        st.textContent = [
            '.ngb-fin-velo{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;',
            '  padding:20px;background:rgba(6,22,40,.62);-webkit-backdrop-filter:blur(5px);backdrop-filter:blur(5px);',
            '  opacity:0;transition:opacity .35s ease;}',
            '.ngb-fin-velo.aperta{opacity:1;}',
            '.ngb-fin{position:relative;width:100%;max-width:540px;max-height:calc(100vh - 40px);overflow:auto;',
            '  background:#fff;color:#14243A;border-radius:16px;box-shadow:0 40px 90px rgba(6,22,40,.45);',
            "  font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;",
            '  transform:translateY(16px) scale(.98);transition:transform .45s cubic-bezier(.22,1,.36,1);}',
            '.ngb-fin-velo.aperta .ngb-fin{transform:none;}',
            '.ngb-fin-testa{position:relative;padding:32px 36px 28px;color:#fff;overflow:hidden;',
            '  background:radial-gradient(70% 90% at 50% 0%,rgba(125,184,238,.28) 0%,rgba(125,184,238,0) 70%),',
            '  linear-gradient(160deg,#08213A 0%,#0E2E4F 55%,#164068 100%);}',
            '.ngb-fin-testa::after{content:"";position:absolute;inset:0;pointer-events:none;',
            '  background-image:linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px);',
            '  background-size:36px 36px;-webkit-mask-image:linear-gradient(180deg,#000,transparent);mask-image:linear-gradient(180deg,#000,transparent);}',
            '.ngb-fin-occh{position:relative;z-index:1;display:inline-block;margin-right:44px;font-family:Montserrat,sans-serif;font-size:.66rem;font-weight:700;',
            '  letter-spacing:.22em;text-transform:uppercase;color:#B9DAF7;padding:6px 12px;border:1px solid rgba(185,218,247,.35);border-radius:100px;}',
            '.ngb-fin-data{position:relative;z-index:1;display:flex;align-items:flex-end;gap:16px;margin-top:22px;}',
            '.ngb-fin-giorno{font-family:Montserrat,sans-serif;font-size:4.2rem;font-weight:900;line-height:.85;letter-spacing:-.04em;}',
            '.ngb-fin-mese{font-family:Montserrat,sans-serif;line-height:1.15;padding-bottom:2px;}',
            '.ngb-fin-mese b{display:block;font-size:1.25rem;font-weight:800;}',
            '.ngb-fin-mese span{display:block;font-size:.9rem;font-weight:600;color:#7DB8EE;}',
            '.ngb-fin-citta{position:relative;z-index:1;margin-top:14px;font-family:Montserrat,sans-serif;font-size:1.9rem;font-weight:900;',
            '  letter-spacing:.02em;text-transform:uppercase;}',
            '.ngb-fin-corpo{padding:26px 36px 30px;}',
            '.ngb-fin-tit{margin:0;font-family:Montserrat,sans-serif;font-size:1.3rem;font-weight:800;line-height:1.25;',
            '  letter-spacing:-.01em;color:#08213A;text-align:left;}',
            '.ngb-fin-dati{margin:16px 0 0;padding:0;list-style:none;border-top:1px solid #DCE3EC;}',
            '.ngb-fin-dati li{display:flex;gap:14px;padding:10px 0;border-bottom:1px solid #DCE3EC;font-size:.92rem;text-align:left !important;}',
            '.ngb-fin-dati span{flex:0 0 74px;font-size:.66rem;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:#7A8596;padding-top:3px;}',
            '.ngb-fin-punti{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0 0;padding:0;list-style:none;}',
            '.ngb-fin-punti li{font-size:.78rem;font-weight:600;color:#164068;background:#EAF3FC;border-radius:100px;padding:6px 12px;text-align:left !important;}',
            '.ngb-fin-nota{margin:16px 0 0;font-size:.88rem;color:#556274;text-align:left !important;}',
            '.ngb-fin-azioni{display:flex;flex-wrap:wrap;gap:10px;margin-top:24px;}',
            '.ngb-fin-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:46px;padding:0 20px;border-radius:6px;',
            "  font-family:Montserrat,sans-serif;font-size:.74rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;",
            '  text-decoration:none;cursor:pointer;border:1.5px solid transparent;transition:background-color .2s ease,color .2s ease,border-color .2s ease;}',
            '.ngb-fin-btn svg{width:16px;height:16px;stroke:currentColor;fill:none;}',
            '.ngb-fin-btn-pieno{background:#164068;color:#fff;}',
            '.ngb-fin-btn-pieno:hover{background:#08213A;}',
            '.ngb-fin-btn-linea{color:#164068;border-color:#C9D3DF;background:#fff;}',
            '.ngb-fin-btn-linea:hover{border-color:#164068;}',
            '.ngb-fin-dopo{display:block;margin:16px auto 0;background:none;border:0;padding:6px;font:inherit;font-size:.82rem;',
            '  color:#7A8596;cursor:pointer;text-decoration:underline;text-underline-offset:3px;}',
            '.ngb-fin-dopo:hover{color:#14243A;}',
            '.ngb-fin-x{position:absolute;top:14px;right:14px;z-index:2;width:36px;height:36px;border-radius:50%;border:0;cursor:pointer;',
            '  display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.12);color:#fff;transition:background .2s ease;}',
            '.ngb-fin-x:hover{background:rgba(255,255,255,.24);}',
            '.ngb-fin-x svg{width:16px;height:16px;stroke:currentColor;fill:none;}',
            '.ngb-fin :focus-visible{outline:2px solid #7DB8EE;outline-offset:3px;}',
            '.ngb-fin:focus{outline:none;}',
            '@media (max-width:520px){',
            '  .ngb-fin-testa{padding:26px 22px 22px;}.ngb-fin-corpo{padding:22px 22px 24px;}',
            '  .ngb-fin-giorno{font-size:3.4rem;}.ngb-fin-citta{font-size:1.5rem;}',
            '  .ngb-fin-azioni{flex-direction:column;}.ngb-fin-btn{width:100%;}',
            '}',
            '@media (prefers-reduced-motion:reduce){.ngb-fin-velo,.ngb-fin{transition:none;}}'
        ].join('');
        document.head.appendChild(st);

        const giorno = ev._d.getDate();
        const mese = MONTHS_FULL[ev._d.getMonth()];
        const anno = ev._d.getFullYear();
        const giornoSett = (f.giorno || '').split(' ')[0] || '';
        const freccia = '<svg viewBox="0 0 24 24" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>';
        const giu = '<svg viewBox="0 0 24 24" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v12"/><polyline points="6 11 12 17 18 11"/><path d="M4 20h16"/></svg>';

        const velo = document.createElement('div');
        velo.className = 'ngb-fin-velo';
        velo.innerHTML =
            '<div class="ngb-fin" role="dialog" aria-modal="true" aria-labelledby="ngb-fin-tit" tabindex="-1">' +
                '<button type="button" class="ngb-fin-x" aria-label="Chiudi">' +
                    '<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>' +
                '</button>' +
                '<div class="ngb-fin-testa">' +
                    '<span class="ngb-fin-occh">' + escapeHtml(ev.tagline || 'Prossimo evento') + ' &middot; Next Generation Business</span>' +
                    '<div class="ngb-fin-data" aria-hidden="true">' +
                        '<span class="ngb-fin-giorno">' + giorno + '</span>' +
                        '<span class="ngb-fin-mese"><b>' + escapeHtml(mese.charAt(0).toUpperCase() + mese.slice(1)) + ' ' + anno + '</b>' +
                        '<span>' + escapeHtml(giornoSett) + '</span></span>' +
                    '</div>' +
                    '<div class="ngb-fin-citta">' + escapeHtml(ev.city) + '</div>' +
                '</div>' +
                '<div class="ngb-fin-corpo">' +
                    '<h2 class="ngb-fin-tit" id="ngb-fin-tit">' + escapeHtml(f.titolo || ev.title) + '</h2>' +
                    '<ul class="ngb-fin-dati">' +
                        (f.giorno ? '<li><span>Quando</span>' + escapeHtml(f.giorno) + '</li>' : '') +
                        (f.luogo ? '<li><span>Dove</span>' + escapeHtml(f.luogo) + '</li>' : '') +
                    '</ul>' +
                    ((f.punti && f.punti.length)
                        ? '<ul class="ngb-fin-punti">' + f.punti.map(function (x) { return '<li>' + escapeHtml(x) + '</li>'; }).join('') + '</ul>'
                        : '') +
                    (f.nota ? '<p class="ngb-fin-nota">' + escapeHtml(f.nota) + '</p>' : '') +
                    '<div class="ngb-fin-azioni">' +
                        '<a class="ngb-fin-btn ngb-fin-btn-pieno" href="' + escapeAttr(resolveUrl(ev.url)) + '">Scopri l\'evento' + freccia + '</a>' +
                        (f.pdf ? '<a class="ngb-fin-btn ngb-fin-btn-linea" href="' + escapeAttr(resolveUrl(f.pdf)) + '" download>' + giu + 'Save the date</a>' : '') +
                    '</div>' +
                    '<button type="button" class="ngb-fin-dopo">Non ora</button>' +
                '</div>' +
            '</div>';

        let primaDiAprire = null;
        function chiudi() {
            try { window.sessionStorage.setItem(chiave, '1'); } catch (_) { /* senza memoria: si riaprira' */ }
            velo.classList.remove('aperta');
            document.removeEventListener('keydown', tasti);
            setTimeout(function () {
                if (velo.parentNode) velo.parentNode.removeChild(velo);
                document.documentElement.style.overflow = '';
                if (primaDiAprire && primaDiAprire.focus) { try { primaDiAprire.focus(); } catch (_) { } }
            }, 350);
        }
        // Esc chiude; Tab resta dentro la finestra
        function tasti(e) {
            if (e.key === 'Escape') { e.preventDefault(); chiudi(); return; }
            if (e.key !== 'Tab') return;
            const fuochi = velo.querySelectorAll('a[href],button');
            if (!fuochi.length) return;
            const primo = fuochi[0], ultimo = fuochi[fuochi.length - 1];
            if (e.shiftKey && document.activeElement === primo) { e.preventDefault(); ultimo.focus(); }
            else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primo.focus(); }
        }
        velo.addEventListener('click', function (e) { if (e.target === velo) chiudi(); });
        velo.querySelector('.ngb-fin-x').addEventListener('click', chiudi);
        velo.querySelector('.ngb-fin-dopo').addEventListener('click', chiudi);
        // chi va all'evento o scarica il volantino l'ha vista: non si riapre
        velo.querySelectorAll('.ngb-fin-btn').forEach(function (a) {
            a.addEventListener('click', function () { try { window.sessionStorage.setItem(chiave, '1'); } catch (_) { } });
        });

        function monta() {
            if (!document.body) return;
            primaDiAprire = document.activeElement;
            document.body.appendChild(velo);
            document.documentElement.style.overflow = 'hidden';
            document.addEventListener('keydown', tasti);
            requestAnimationFrame(function () {
                velo.classList.add('aperta');
                // il fuoco sulla finestra, non su un bottone: chi usa la tastiera
                // parte da li', e nessun bottone appare gia' "premuto"
                const fin = velo.querySelector('.ngb-fin');
                if (fin) fin.focus({ preventScroll: true });
            });
        }
        // un attimo dopo il caricamento: prima si vede la pagina, poi la finestra
        const parti = function () { setTimeout(monta, 1200); };
        if (document.readyState === 'complete') parti();
        else window.addEventListener('load', parti);
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
