/* ============================================================
   PROVE - il player del video di YouTube da solo (diretta/player-youtube.js):
   la registrazione che sembra una diretta
   ------------------------------------------------------------
       cd diretta/prove && node player-youtube.prova.js

   Una pagina minima (il riquadro 16:9 di diretta.css, sorgente-video.js e
   player-youtube.js) e, al posto di https://www.youtube-nocookie.com/embed/,
   il FINTO YOUTUBE di flusso-prova.js (paginaYouTube, servito con
   context.route): una pagina che parla con gli stessi messaggi del player
   vero (listening, command, onReady, initialDelivery, infoDelivery,
   onStateChange, onError), fa scorrere il tempo da sola e scrive i comandi
   ricevuti in window.__comandi. Il comportamento lo sceglie
   l'identificativo del video (11 caratteri):
     normale0001  parte da solo (senza audio) e accetta tutto
     mutoXXXXXXX  non toglie il muto ai messaggi (come iPhone): serve un tocco
     fermoXXXXXX  non parte da solo (risparmio energetico): serve un tocco
     cortoXXXXXX  dura 30 secondi
     erroreXXXXX  YouTube risponde con l'errore 150 (non incorporabile)
     silenzioXXX  non risponde ai messaggi (il player passa all'iframe semplice)
     lentoXXXXXX  la pagina di YouTube arriva dopo 6,5 secondi (rete lenta)
     liveXXXXXXX  una diretta vera di YouTube (videoData.isLive)
     botXXXXXXXX  il controllo «non sono un bot» di YouTube: non carica il
                  video (niente durata) e non parte mai

   COSA DIMOSTRA.
   - L'iframe: youtube-nocookie, controls=0, disablekb=1, fs=0, mute=1,
     autoplay=1, enablejsapi=1, origin, start = il punto atteso; non riceve
     tocchi (pointer-events none), e' piu' alto del riquadro (titolo e logo
     fuori vista), con lo scudo sopra (il menu del tasto destro non si apre);
     il sipario copre finche' il video non va da qualche secondo.
   - Tutti allo stesso punto: al via seekTo(punto atteso) e playVideo; se il
     punto atteso cambia (sincronizza) o il video resta indietro, seekTo; se
     il browser lo ferma, playVideo.
   - L'audio: attivaAudio -> unMute e setVolume 100, onAudio dice «non muto»;
     se YouTube resta muto, la scena 'tocca' (scudo tolto) e dopo il tocco
     lo scudo torna.
   - Non parte da solo: la scena 'avvia' con «Guarda la diretta»; se nemmeno
     cosi', il foro al centro sul pulsante di YouTube (il resto coperto, e i
     tocchi fuori dal foro non arrivano a YouTube).
   - Il controllo «non sono un bot» (YouTube non carica il video): mai la
     pagina di YouTube, ma «Il video non riesce a partire» con «Riprova».
   - La sigla (inAttesa): il video parte da solo e si ferma al punto di
     partenza, sotto il sipario; finita l'attesa parte subito.
   - La fine della registrazione: sipario 'fine' e pauseVideo.
   - L'errore di YouTube: onErrore 'video'. YouTube che non risponde: l'iframe
     semplice (i comandi di YouTube, niente scudo), onStato 'semplice'; ma
     con una rete lenta si aspetta che YouTube arrivi.
   - Finita la registrazione il video si ferma e non riparte dietro «La
     diretta si e' conclusa» (anche se YouTube prova a farlo partire).
   - Una diretta vera di YouTube: nessun seekTo.
   - Un indirizzo che non e' di YouTube: onErrore 'link', niente iframe.
   - Nella pagina (fuori dall'iframe) non c'e' mai il link del video.
   Esce con 1 se qualcosa e' rosso.
   ============================================================ */
'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');
const F = require('./flusso-prova');

const PORTA = 8797;
const QUI = __dirname;
const DIRETTA = path.resolve(QUI, '..');
let rossi = 0, verdi = 0;
function vero(cond, descrizione, dettaglio) {
    if (cond) { verdi++; console.log('  ok  ' + descrizione); }
    else { rossi++; console.log('ROSSO ' + descrizione + (dettaglio !== undefined ? '\n       ' + String(dettaglio).slice(0, 400) : '')); }
}
const pausa = ms => new Promise(r => setTimeout(r, ms));
async function aspetta(f, ms, cosa) {
    const fine = Date.now() + ms;
    for (;;) {
        let v = false;
        try { v = await f(); } catch (e) { v = false; }
        if (v) return v;
        if (Date.now() > fine) throw new Error('Tempo scaduto: ' + cosa);
        await pausa(100);
    }
}

/* ---------- la pagina di prova ---------- */
const PAGINA = `<!doctype html><html lang="it"><head><meta charset="utf-8">
<link rel="stylesheet" href="/diretta/diretta.css">
<style>body{margin:0;background:#123;font-family:sans-serif} #riquadro{width:640px;margin:20px}</style>
<script src="/diretta/sorgente-video.js"></script><script src="/diretta/player-youtube.js"></script>
</head><body><div id="riquadro"><div class="area-video"><div id="video-player" class="video-player"></div></div></div>
<script>
window.__eventi = [];
window.__posizione = 120;
window.__t0 = Date.now();
window.crea = function (url, opz) {
    if (window.player) window.player.distruggi();
    window.__eventi = [];
    window.__t0 = Date.now();
    window.player = NGBPlayerYouTube.crea(document.getElementById('video-player'), Object.assign({
        posizione: function () { return window.__posizione == null ? null : window.__posizione + (Date.now() - window.__t0) / 1000; },
        onPronto: function () { __eventi.push(['pronto']); },
        onStato: function (s) { __eventi.push(['stato', s]); },
        onAudio: function (a) { __eventi.push(['audio', a.muto, a.volume]); },
        onErrore: function (e) { __eventi.push(['errore', e.codice]); },
        tempi: { attesaApi: 4000, dopoCarico: 2000, attesaApiMax: 15000, attesaAvvio: 2500, rivela: 1200, controllo: 500, pausaSalti: 1500, verificaAudio: 1000 }
    }, opz || {}));
    window.player.carica(url, { titolo: 'Webinar di prova' });
};
</script></body></html>`;

/* ---------- il finto YouTube (sta al posto di youtube-nocookie): flusso-prova.js, paginaYouTube ---------- */
const FINTO_YT = F.paginaYouTube();

const TIPI = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
function server() {
    return http.createServer((req, res) => {
        const u = new URL(req.url, 'http://x');
        if (u.pathname === '/') { res.writeHead(200, { 'content-type': TIPI['.html'], 'cache-control': 'no-store' }); res.end(PAGINA); return; }
        const f = path.join(DIRETTA, decodeURIComponent(u.pathname.replace(/^\/diretta\//, '/')));
        if (!f.startsWith(DIRETTA) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'content-type': TIPI[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
        res.end(fs.readFileSync(f));
    });
}

const YT = id => 'https://www.youtube.com/live/' + id;
const NGB = v => 'https://www.youtube-nocookie.com/embed/' + v + '?autoplay=1&playsinline=1&rel=0';

(async () => {
    const srv = server();
    await new Promise(r => srv.listen(PORTA, '127.0.0.1', r));
    const browser = await chromium.launch({ executablePath: ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].find(p => fs.existsSync(p)) });
    const errori = [];
    try {
        const context = await browser.newContext({ viewport: { width: 900, height: 600 }, locale: 'it-IT' });
        // lentoXXXXXX: la pagina di YouTube arriva dopo 6,5 secondi (una rete lenta)
        await context.route('https://www.youtube-nocookie.com/**', async route => {
            if (/\/embed\/lentoXXXXXX/.test(route.request().url())) await pausa(6500);
            try { await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: FINTO_YT }); } catch (e) { /* pagina gia' chiusa */ }
        });
        // niente altro di YouTube
        await context.route(/https:\/\/(www\.)?youtube\.com\//, route => route.abort());
        const page = await context.newPage();
        page.on('pageerror', e => errori.push(String(e && e.message || e)));
        await page.goto('http://127.0.0.1:' + PORTA + '/');
        const eventi = () => page.evaluate(() => window.__eventi.slice());
        const haEvento = async (...e) => (await eventi()).some(x => JSON.stringify(x) === JSON.stringify(e));
        const frame = () => page.frames().find(f => f.url().startsWith('https://www.youtube-nocookie.com/embed/'));
        const comandi = async () => { const f = frame(); return f ? f.evaluate(() => window.__comandi.slice()) : []; };
        const attr = s => page.evaluate(sel => { const e = document.querySelector(sel); return e ? { hidden: e.hidden, src: e.getAttribute('src') } : null; }, s);

        /* ---------- 1. la partenza, al punto atteso ---------- */
        console.log('\n1. La partenza: iframe senza niente di YouTube, al punto atteso');
        await page.evaluate(u => { window.__posizione = 120; window.crea(u); }, YT('normale0001'));
        const src = await page.getAttribute('.yt-palco iframe', 'src');
        const u = new URL(src);
        vero(u.origin === 'https://www.youtube-nocookie.com' && u.pathname === '/embed/normale0001', 'l\'iframe e\' youtube-nocookie con l\'identificativo del video', src);
        const p = Object.fromEntries(u.searchParams);
        vero(p.controls === '0' && p.disablekb === '1' && p.fs === '0' && p.mute === '1' && p.autoplay === '1' && p.enablejsapi === '1' && p.iv_load_policy === '3' && p.rel === '0' && p.playsinline === '1'
            && p.origin === 'http://127.0.0.1:' + PORTA && Number(p.start) >= 119 && Number(p.start) <= 121, 'parametri: niente comandi, tasti, schermo intero di YouTube; muto e via; start = punto atteso (' + p.start + ')', src);
        const stile = await page.evaluate(() => {
            const f = document.querySelector('.yt-palco iframe');
            const palco = document.querySelector('.yt-palco').getBoundingClientRect();
            const r = f.getBoundingClientRect();
            return { pe: getComputedStyle(f).pointerEvents, tab: f.getAttribute('tabindex'), sopra: palco.top - r.top, sotto: r.bottom - palco.bottom, scudo: !!document.querySelector('.yt-scudo:not([hidden])'), overflow: getComputedStyle(document.querySelector('.yt-palco')).overflow };
        });
        vero(stile.pe === 'none' && stile.tab === '-1' && stile.scudo && stile.overflow === 'hidden', 'l\'iframe non riceve tocchi ne\' il fuoco, e sopra c\'e\' lo scudo', JSON.stringify(stile));
        vero(stile.sopra >= 60 && stile.sotto >= 60, 'l\'iframe e\' piu\' alto del riquadro: titolo e logo di YouTube restano fuori vista (' + stile.sopra + ' px sopra, ' + stile.sotto + ' px sotto)');
        vero((await attr('.yt-sipario')).hidden === false && /La diretta sta arrivando/.test(await page.textContent('.yt-sipario')), 'finche\' il video non va: il sipario «La diretta sta arrivando…»');
        await aspetta(() => haEvento('stato', 'video'), 8000, 'video');
        const c1 = await comandi();
        const salto = c1.find(c => c[0] === 'seekTo');
        vero(salto && salto[1] >= 119 && salto[1] <= 124 && salto[2] === true && c1.some(c => c[0] === 'playVideo') && c1.some(c => c[0] === 'addEventListener' && c[1] === 'onStateChange'),
            'al via: seekTo al punto atteso (' + (salto && salto[1].toFixed(1)) + ') e playVideo; ascolto di onStateChange', JSON.stringify(c1));
        vero((await attr('.yt-sipario')).hidden === true && await haEvento('pronto'), 'dopo qualche secondo di video il sipario si toglie (onPronto)');
        const testoPagina = await page.evaluate(() => document.body.innerText + document.body.innerHTML.replace(/<iframe[^>]*>/g, ''));
        vero(!/normale0001|youtube\.com\/(live|watch)|youtu\.be/.test(testoPagina), 'fuori dall\'iframe la pagina non contiene il link del video');
        const menu = await page.evaluate(() => { const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); document.querySelector('.yt-scudo').dispatchEvent(e); return e.defaultPrevented; });
        vero(menu, 'il tasto destro sul video non apre nessun menu');
        await page.screenshot({ path: path.join(QUI, 'risultati/player-youtube-video.png') }).catch(() => {});

        /* ---------- 2. tutti allo stesso punto ---------- */
        console.log('\n2. Tutti allo stesso punto');
        const n2 = (await comandi()).length;
        await page.evaluate(() => { window.__posizione += 300; window.player.sincronizza(); });
        await aspetta(async () => (await comandi()).slice(n2).some(c => c[0] === 'seekTo' && c[1] > 420), 3000, 'salto');
        vero(true, 'il punto atteso va avanti di 5 minuti (la regia riprende, cambia il punto di partenza): sincronizza -> seekTo al nuovo punto');
        const n3 = (await comandi()).length;
        await frame().evaluate(() => window.__salta(10));
        await aspetta(async () => (await comandi()).slice(n3).some(c => c[0] === 'seekTo' && c[1] > 420), 5000, 'indietro');
        vero(true, 'il video resta indietro (10 s invece di ~425): torna da solo al punto atteso');
        const n4 = (await comandi()).length;
        await pausa(1600);
        await frame().evaluate(() => window.__pausaDelBrowser());
        await aspetta(async () => (await comandi()).slice(n4).some(c => c[0] === 'playVideo'), 4000, 'ripresa');
        vero(true, 'il browser ferma il video (scheda in secondo piano): riparte da solo (playVideo)');

        /* ---------- 3. l'audio ---------- */
        console.log('\n3. L\'audio');
        const n5 = (await comandi()).length;
        await page.evaluate(() => window.player.attivaAudio());
        await aspetta(() => haEvento('audio', false, 100), 3000, 'audio');
        const c5 = (await comandi()).slice(n5);
        vero(c5.some(c => c[0] === 'unMute') && c5.some(c => c[0] === 'setVolume' && c[1] === 100), '«Attiva l\'audio»: unMute e setVolume 100; YouTube dice «non muto» (onAudio)', JSON.stringify(c5));
        await pausa(1200);
        vero(!(await haEvento('stato', 'tocca')), '...e il browser l\'ha concesso: nessun tocco da chiedere');
        await page.evaluate(() => window.player.muto());
        await aspetta(async () => (await comandi()).some(c => c[0] === 'mute'), 2000, 'muto');
        vero(await page.evaluate(() => window.player.eMuto()), 'muto(): mute, e il player dice muto');
        await page.evaluate(() => window.player.volume(40));
        await aspetta(async () => (await comandi()).some(c => c[0] === 'setVolume' && c[1] === 40), 2000, 'volume');
        vero(await page.evaluate(() => window.player.volumeAttuale()) === 40, 'volume(40): setVolume 40');

        console.log('\n4. L\'audio che il browser non concede (iPhone): un tocco sul video');
        await page.evaluate(u => { window.__posizione = 60; window.crea(u); }, YT('mutoXXXXXXX'));
        await aspetta(() => haEvento('stato', 'video'), 8000, 'video muto');
        await page.evaluate(() => window.player.attivaAudio());
        await aspetta(() => haEvento('stato', 'tocca'), 4000, 'tocca');
        const tocca = await page.evaluate(() => ({
            scudo: document.querySelector('.yt-scudo').hidden, pe: getComputedStyle(document.querySelector('.yt-palco iframe')).pointerEvents,
            testo: document.querySelector('.yt-sipario').innerText, trasparente: document.querySelector('.yt-sipario').classList.contains('yt-sipario-trasparente')
        }));
        vero(tocca.scudo === true && tocca.pe === 'auto' && tocca.trasparente && /Tocca il video/.test(tocca.testo), 'YouTube resta muto: scena «Tocca il video», scudo tolto e video toccabile', JSON.stringify(tocca));
        await pausa(1500);
        const ancora = await page.evaluate(() => ({ scudo: document.querySelector('.yt-scudo').hidden, sipario: document.querySelector('.yt-sipario').hidden }));
        vero(ancora.scudo === true && ancora.sipario === false, '...e la scena resta finche\' la persona non tocca (il video va, ma senza audio)', JSON.stringify(ancora));
        const r = await page.locator('.yt-palco').boundingBox();
        await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
        await aspetta(async () => !(await page.evaluate(() => window.player.eMuto())) && await page.evaluate(() => !document.querySelector('.yt-scudo').hidden && document.querySelector('.yt-sipario').hidden), 4000, 'dopo il tocco');
        const dopo = await frame().evaluate(() => ({ tocchi: window.__tocchi, c: window.__comandi.slice(-6) }));
        vero(await page.evaluate(() => getComputedStyle(document.querySelector('.yt-palco iframe')).pointerEvents) === 'none' && dopo.tocchi === 1,
            '...il tocco arriva a YouTube (che si ferma): unMute e playVideo, riparte con l\'audio; lo scudo torna e il sipario sparisce', JSON.stringify(dopo));
        vero(await haEvento('audio', false, 100) && (await eventi()).slice(-1)[0][0] !== 'errore', '...e la pagina sa che l\'audio c\'e\' (onAudio)');
        console.log('\n4b. Chi rinuncia all\'audio durante «Tocca il video»');
        await page.evaluate(u => { window.__posizione = 60; window.crea(u); }, YT('mutoXXXXXXX'));
        await aspetta(() => haEvento('stato', 'video'), 8000, 'video muto 2');
        await page.evaluate(() => window.player.attivaAudio());
        await aspetta(() => haEvento('stato', 'tocca'), 4000, 'tocca 2');
        await page.evaluate(() => window.player.muto());
        await aspetta(() => page.evaluate(() => document.querySelector('.yt-sipario').hidden && !document.querySelector('.yt-scudo').hidden), 3000, 'rinuncia');
        vero((await eventi()).slice(-1)[0].join() === 'pronto' || await haEvento('stato', 'video'), '«Disattiva l\'audio»: la scena si chiude, il video resta senza audio e con lo scudo');

        console.log('\n5. Il video che non parte da solo');
        await page.evaluate(u => { window.__posizione = 30; window.crea(u); }, YT('fermoXXXXXX'));
        await aspetta(() => haEvento('stato', 'avvia'), 6000, 'avvia');
        vero(/Guarda la diretta/.test(await page.textContent('.yt-sipario')) && await page.isVisible('.yt-avvia'), 'non parte da solo: il sipario con «Guarda la diretta»');
        await page.click('.yt-avvia');
        await aspetta(() => haEvento('stato', 'tocca'), 6000, 'tocca dopo avvia');
        const foro = await page.evaluate(() => {
            const sp = document.querySelector('.yt-sipario');
            const r = sp.getBoundingClientRect();
            // chi riceve un tocco al centro (il foro) e uno vicino all'angolo (coperto)
            const centro = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            const angolo = document.elementFromPoint(r.left + 20, r.bottom - 20);
            return {
                foro: sp.classList.contains('yt-sipario-foro'), trasparente: sp.classList.contains('yt-sipario-trasparente'), nascosto: sp.hidden,
                testo: sp.innerText, centro: centro ? centro.tagName : '', angolo: angolo ? angolo.className : ''
            };
        });
        vero(foro.foro && !foro.trasparente && !foro.nascosto && /Tocca il pulsante al centro/.test(foro.testo) && foro.centro === 'IFRAME' && /yt-sipario/.test(foro.angolo),
            '...il browser non lo fa partire nemmeno cosi\': il sipario resta e lascia libero solo il centro, sul pulsante di YouTube', JSON.stringify(foro));
        const r2 = await page.locator('.yt-palco').boundingBox();
        await page.mouse.click(r2.x + r2.width / 2, r2.y + r2.height / 2);
        await aspetta(() => page.evaluate(() => document.querySelector('.yt-sipario').hidden && !document.querySelector('.yt-scudo').hidden), 4000, 'parte');
        vero(true, '...un tocco e parte; scudo di nuovo sopra');

        console.log('\n6. La fine della registrazione');
        await page.evaluate(u => { window.__posizione = 26; window.crea(u); }, YT('cortoXXXXXX'));
        await aspetta(() => haEvento('stato', 'fine'), 12000, 'fine');
        vero(/La diretta si è conclusa/.test(await page.textContent('.yt-sipario')) && (await attr('.yt-sipario')).hidden === false && (await comandi()).some(c => c[0] === 'pauseVideo'),
            'finita la registrazione: il sipario «La diretta si è conclusa» copre YouTube, pauseVideo');
        await page.evaluate(u => { window.__posizione = 40; window.crea(u); }, YT('cortoXXXXXX'));
        await aspetta(() => haEvento('stato', 'fine'), 6000, 'fine subito');
        await pausa(1500);
        vero(await frame().evaluate(() => window.__stato()) !== 1, 'chi arriva quando la registrazione e\' gia\' finita: subito «La diretta si è conclusa», e YouTube resta fermo dietro (stato ' + await frame().evaluate(() => window.__stato()) + ')');

        console.log('\n7. Errori, YouTube che non risponde, diretta vera, link sbagliato');
        await page.evaluate(u => window.crea(u), YT('erroreXXXXX'));
        await aspetta(() => haEvento('errore', 'video'), 6000, 'errore');
        vero((await attr('.yt-sipario')).hidden === false, 'YouTube non mostra il video (errore 150): onErrore «video», e il sipario copre il suo messaggio');
        await pausa(3200);
        vero(!(await haEvento('stato', 'avvia')) && !(await page.isVisible('.yt-avvia')), '...e dopo l\'errore nessun «Guarda la diretta» (il video non c\'e\')', JSON.stringify(await eventi()));
        console.log('\n7b. Il controllo «non sono un bot» di YouTube: mai la sua pagina');
        await page.evaluate(u => window.crea(u), YT('botXXXXXXXX'));
        await aspetta(() => haEvento('stato', 'avvia'), 6000, 'avvia con il controllo');
        await page.click('.yt-avvia');
        await aspetta(() => haEvento('stato', 'bloccato'), 6000, 'bloccato');
        const bloccato = await page.evaluate(() => {
            const sp = document.querySelector('.yt-sipario');
            const f = document.querySelector('.yt-palco iframe');
            return {
                nascosto: sp.hidden, classi: sp.className, testo: sp.innerText, scudo: !document.querySelector('.yt-scudo').hidden,
                pe: getComputedStyle(f).pointerEvents, riprova: !document.querySelector('.yt-riprova').hidden, opaco: getComputedStyle(sp).backgroundColor
            };
        });
        vero(!bloccato.nascosto && !/trasparente|foro/.test(bloccato.classi) && bloccato.scudo && bloccato.pe === 'none' && bloccato.riprova
            && /Il video non riesce a partire/.test(bloccato.testo) && !(await haEvento('stato', 'tocca')),
            'YouTube non carica il video: il sipario resta coperto, con «Il video non riesce a partire» e «Riprova»; la pagina di YouTube non si vede e non si tocca', JSON.stringify(bloccato));
        const iframePrima = await page.$('.yt-palco iframe');
        await page.click('.yt-riprova');
        await aspetta(async () => { const f = await page.$('.yt-palco iframe'); return f && !(await f.evaluate((a, b) => a === b, iframePrima)); }, 5000, 'iframe nuovo');
        vero(/La diretta sta arrivando/.test(await page.textContent('.yt-sipario')), '«Riprova»: un iframe nuovo, e di nuovo «La diretta sta arrivando…»');

        console.log('\n7c. La sigla d\'apertura: il video si carica fermo al punto di partenza, poi parte subito');
        await page.evaluate(u => { window.__attesa = true; window.__posizione = 30; window.crea(u, { inAttesa: () => window.__attesa, posizione: () => window.__attesa ? 30 : 30 + (Date.now() - window.__fineAttesa) / 1000 }); }, YT('normale0001'));
        await aspetta(async () => (await comandi()).some(c => c[0] === 'pauseVideo'), 8000, 'fermo durante la sigla');
        await pausa(2500);
        const inAttesa = { stato: await frame().evaluate(() => window.__stato()), eventi: await eventi(), sipario: await page.evaluate(() => !document.querySelector('.yt-sipario').hidden) };
        vero(inAttesa.stato === 2 && inAttesa.sipario && !inAttesa.eventi.some(e => e[1] === 'video' || e[1] === 'avvia'),
            'durante la sigla: YouTube parte da solo e il player lo ferma (pauseVideo), sotto il sipario, senza «Guarda la diretta»', JSON.stringify(inAttesa));
        const t0 = Date.now();
        await page.evaluate(() => { window.__fineAttesa = Date.now(); window.__attesa = false; window.player.sincronizza(); });
        await aspetta(() => haEvento('stato', 'video'), 5000, 'video dopo la sigla');
        const dopoSigla = Date.now() - t0;
        const salti = (await comandi()).filter(c => c[0] === 'seekTo').map(c => c[1]);
        vero(dopoSigla < 2500 && salti.every(x => x >= 29 && x <= 33), 'finita la sigla il video si vede dopo ' + dopoSigla + ' ms, dal punto di partenza (' + salti.map(x => x.toFixed(1)).join(', ') + ')');

        await page.evaluate(u => window.crea(u), YT('silenzioXXX'));
        await aspetta(() => haEvento('stato', 'semplice'), 9000, 'semplice');
        const srcSemplice = await page.getAttribute('.yt-palco iframe', 'src');
        const semplice = await page.evaluate(() => ({ scudo: !!document.querySelector('.yt-scudo'), pe: getComputedStyle(document.querySelector('.yt-palco iframe')).pointerEvents }));
        vero(!/controls=0|enablejsapi/.test(srcSemplice) && !semplice.scudo && semplice.pe !== 'none', 'YouTube non risponde ai messaggi: l\'iframe semplice, con i comandi di YouTube e senza scudo (onStato «semplice»)', srcSemplice);
        await page.evaluate(u => window.crea(u), YT('lentoXXXXXX'));
        await aspetta(() => haEvento('stato', 'video'), 15000, 'video lento').catch(async e => { console.log('       eventi: ' + JSON.stringify(await eventi()) + ' comandi: ' + JSON.stringify(await comandi())); throw e; });
        vero(!(await haEvento('stato', 'semplice')) && /controls=0/.test(await page.getAttribute('.yt-palco iframe', 'src')),
            'una rete lenta (YouTube arriva dopo 6,5 s, oltre l\'attesa dei messaggi): si aspetta il caricamento, niente iframe semplice', JSON.stringify(await eventi()));
        await page.evaluate(u => { window.__posizione = 500; window.crea(u); }, YT('liveXXXXXXX'));
        await aspetta(() => haEvento('stato', 'video'), 8000, 'live');
        await pausa(1500);
        vero(!(await comandi()).some(c => c[0] === 'seekTo'), 'una diretta vera di YouTube: nessun seekTo (il punto lo decide YouTube)');
        await page.evaluate(() => window.crea('https://cdn.azotosolutions.com/cloudtv/livetv9/player'));
        await aspetta(() => haEvento('errore', 'link'), 3000, 'link');
        vero(!(await page.$('.yt-palco')), 'un indirizzo che non e\' di YouTube: onErrore «link», niente iframe');
        await page.evaluate(u => window.crea(u), NGB('normale0001'));
        await aspetta(() => haEvento('stato', 'video'), 8000, 'valore salvato');
        vero(true, 'il valore salvato dal servizio (youtube-nocookie/embed/...) va bene uguale');
        await page.evaluate(() => window.player.distruggi());
        vero(!(await page.$('.yt-palco')) && !frame(), 'distruggi(): via il palco e l\'iframe');
        vero(errori.length === 0, 'nessun errore nella pagina', errori.join(' | '));
    } catch (e) {
        rossi++;
        console.log('ROSSO la prova si e\' interrotta: ' + (e && e.stack || e));
    } finally {
        await browser.close().catch(() => {});
        srv.close();
        console.log('\n' + verdi + ' verdi, ' + rossi + ' rossi');
        process.exit(rossi ? 1 : 0);
    }
})();
