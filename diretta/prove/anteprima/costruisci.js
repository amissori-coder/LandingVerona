/* ============================================================
   ANTEPRIMA DELLA DIRETTA - la costruzione
   ------------------------------------------------------------
       cd diretta/prove && npm install      (una volta: serve esbuild)
       node anteprima/costruisci.js

   Mette in diretta/prove/risultati/anteprima/ (non versionata) una
   versione della diretta che gira TUTTA nel browser, con accessi di
   prova, senza Firebase, senza Vercel e senza Brevo:
   - le pagine VERE (diretta/index.html, reimposta.html,
     gestione/index.html con i loro diretta.js e gestione.js), con pochi
     ritocchi automatici elencati qui sotto (RITOCCHI): da dove si
     caricano l'SDK di Firebase e SheetJS, e la navigazione fra le
     pagine, che nell'anteprima stanno dentro degli iframe;
   - il servizio VERO (email-service/api/diretta-*.js e lib/), impacchettato
     con esbuild in anteprima/motore.js insieme a un Firebase finto in
     memoria (motore/) e alla posta di prova;
   - i due player della diretta sostituiti da quelli di prova, con la
     stessa interfaccia: al posto del player di Azoto in iframe
     (modalita' A, player-azoto.js) un riquadro «Player Azoto
     (anteprima)» (player-azoto-anteprima.js); al posto del flusso
     diretto (modalita' B, player-webtv.js) un video di prova disegnato
     nel browser (player-anteprima.js, anche con la finestra per tornare
     indietro e le qualita', finte);
   - il guscio (guscio.html -> index.html): le schede Guida, Partecipante,
     Gestione e Posta di prova.
   Ogni ritocco controlla di trovare il testo da cambiare: se diretta.js
   o gestione.js cambiano, la costruzione si ferma e dice dove, invece
   di produrre un'anteprima rotta.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const QUI = __dirname;
const REPO = path.resolve(QUI, '../../..');
/* Con --player-vero (lo usa diretta/prove/webtv.prova.js) le pagine tengono
   i player VERI (player-azoto.js; player-webtv.js con hls.min.js e
   dash.all.min.js) e la loro CSP: serve a provare la web TV sulle pagine
   vere, in locale. Non e' la versione da pubblicare: li' i video e le
   pagine di altri siti non si caricano. */
const PLAYER_VERO = process.argv.indexOf('--player-vero') >= 0;
const OUT = path.resolve(QUI, PLAYER_VERO ? '../risultati/anteprima-vera' : '../risultati/anteprima');
const MOTORE = path.join(QUI, 'motore');

/* Il carattere U+FFFD (quello che compare al posto delle lettere quando la
   codifica di un file e' sbagliata) gestione.js lo usa apposta, per
   riconoscere i CSV rovinati. Chi pubblica l'anteprima lo rifiuta: negli
   script diventa la sua sequenza di escape, che vale uguale sia nelle
   stringhe sia nelle espressioni regolari. */
function leggi(rel) {
    const t = fs.readFileSync(path.join(REPO, rel), 'utf8');
    return /\.js$/.test(rel) ? t.split('\ufffd').join('\\uFFFD') : t;
}
function scrivi(rel, testo) {
    const p = path.join(OUT, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, testo);
}
function copia(daRepo, a) {
    const p = path.join(OUT, a || daRepo);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.copyFileSync(path.join(REPO, daRepo), p);
}

/* Sostituisce `vecchio` con `nuovo` esattamente `volte` volte (1 se non
   detto): altrimenti si ferma. */
function ritocca(testo, file, vecchio, nuovo, volte) {
    const attese = volte || 1;
    const trovate = testo.split(vecchio).length - 1;
    if (trovate !== attese) {
        throw new Error('RITOCCO NON APPLICABILE in ' + file + ': atteso ' + attese + ' volte, trovato ' + trovate + ':\n  ' + vecchio.slice(0, 160));
    }
    return testo.split(vecchio).join(nuovo);
}

/* ---------- 1. il motore: servizio vero + Firebase finto ---------- */
async function motore() {
    const shim = n => path.join(MOTORE, 'shim-' + n + '.js');
    const sostituzioni = {
        crypto: shim('crypto'), fs: shim('fs'), path: shim('path'),
        nodemailer: shim('vuoto'), 'firebase-admin': shim('vuoto'),
        // la prova del link: niente rete nell'anteprima (vedi motore/prova-link.js)
        net: shim('rete'), dns: shim('rete'), https: shim('rete'), zlib: shim('rete'), stream: shim('rete')
    };
    await esbuild.build({
        entryPoints: [path.join(MOTORE, 'indice.js')],
        outfile: path.join(OUT, 'anteprima/motore.js'),
        bundle: true, format: 'iife', platform: 'browser', target: ['es2020'],
        inject: [shim('globali')],
        define: { global: 'globalThis' },
        legalComments: 'none',
        banner: { js: '/* Anteprima della diretta: servizio vero (email-service/api/diretta-*.js) + Firebase finto in memoria. Generato da diretta/prove/anteprima/costruisci.js */' },
        logLevel: 'warning',
        plugins: [{
            name: 'anteprima',
            setup(b) {
                b.onResolve({ filter: /^(crypto|fs|path|nodemailer|firebase-admin|net|dns|https|zlib|stream)$/ }, a => ({ path: sostituzioni[a.path] }));
                // la prova del link: quella vera, con la web TV finta al posto della rete
                b.onResolve({ filter: /diretta-prova-link(\.js)?$/ }, a => (a.importer === path.join(MOTORE, 'prova-link.js') ? undefined : { path: path.join(MOTORE, 'prova-link.js') }));
                // il collegamento a Firebase del servizio -> il Firebase finto dell'anteprima
                b.onResolve({ filter: /diretta-firebase(\.js)?$/ }, () => ({ path: path.join(MOTORE, 'admin.js') }));
                // le password: uguali, con l'aggancio per le password della guida
                b.onResolve({ filter: /diretta-password(\.js)?$/ }, a => (a.importer.endsWith('shim-password.js') ? undefined : { path: shim('password') }));
            }
        }]
    });
}

/* ---------- 2. le pagine vere, ritoccate ---------- */
const RITOCCHI_DIRETTA = [
    // l'SDK di Firebase: i moduli finti accanto all'anteprima invece di gstatic
    ["return 'https://www.gstatic.com/firebasejs/' + ((CFG && CFG.versioneFirebase) || '11.6.1') + '/' + nome + '.js';",
        "return new URL('anteprima/sdk/' + nome + '.js', document.baseURI).href;"],
    // i parametri dell'indirizzo: in un iframe dell'anteprima li tiene il guscio
    ['new URLSearchParams(location.search)', 'new URLSearchParams(NGBA_RICERCA())', 2],
    ['const u = new URL(location.href);', "const u = new URL('https://anteprima.invalid/' + NGBA_RICERCA());"],
    ["history.replaceState(history.state, '', u.pathname + (u.search || '') + u.hash);", "NGBA_RICERCA_IMPOSTA(u.search || '');"],
    // la navigazione fra le pagine della diretta resta dentro l'anteprima
    ["location.href = '/diretta/gestione/';", "NGBA_VAI('/diretta/gestione/');"],
    ["location.replace('/diretta/' + ", "NGBA_VAI('/diretta/' + "]
];
const RITOCCHI_GESTIONE = [
    ["import('https://www.gstatic.com/firebasejs/' + V + '/firebase-app.js')", "import(new URL('anteprima/sdk/firebase-app.js', document.baseURI).href)"],
    ["import('https://www.gstatic.com/firebasejs/' + V + '/firebase-auth.js')", "import(new URL('anteprima/sdk/firebase-auth.js', document.baseURI).href)"],
    // SheetJS da cdnjs (l'unico indirizzo per gli script ammesso dove si pubblica l'anteprima),
    // con la sua impronta SRI (calcolata sul file di cdnjs, versione 0.18.5)
    ["const SHEETJS_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';",
        "const SHEETJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';"],
    ['s.integrity = SHEETJS_IMPRONTA;', 's.integrity = SHEETJS_IMPRONTA_ANTEPRIMA;'],
    ["const SHEETJS_IMPRONTA = ", "const SHEETJS_IMPRONTA_ANTEPRIMA = 'sha512-r22gChDnGvBylk90+2e/ycr3RVrDi8DIOkIGNhJlKfuyQM4tIRAI062MaV8sfjQKYVGjOBaZBOA87z+IhZE9DA==';\n    const SHEETJS_IMPRONTA = "],
    // "Vedi come un partecipante": nell'anteprima si apre sopra la gestione
    ["window.open(url, '_blank', 'noopener');", 'NGBA_APRI(url);'],
    // l'esportazione: dove si pubblica l'anteprima i file non si scaricano, se ne mostra il contenuto
    ['XLSX.writeFile(wb, nome, { compression: true });', 'NGBA_SCARICA_EXCEL(XLSX, wb, nome);']
];

/* I riferimenti di script, fogli di stile e immagini diventano relativi
   al guscio (index.html sta nella radice dell'anteprima): le pagine
   vivono in iframe srcdoc, che risolvono gli indirizzi rispetto al guscio.
   I collegamenti <a> restano com'erano: li gestisce anteprima/pagina.js. */
function riferimentiDalGuscio(html, cartellaPagina, file) {
    return html.replace(/<(script|link|img|source)\b([^>]*?)\s(src|href)="([^"]+)"/gi, (tutto, tag, prima, attr, valore) => {
        if (/^(https?:|data:|mailto:|#)/i.test(valore)) return tutto;
        const u = new URL(valore, 'https://anteprima.invalid' + cartellaPagina);
        return '<' + tag + prima + ' ' + attr + '="' + u.pathname.slice(1) + '"';
    }).replace(/\?v=[0-9a-z]+"/gi, '"');
}

/* azotoObbligato: la pagina DEVE caricare player-azoto.js (la diretta);
   la gestione lo carica per l'anteprima della regia, se c'e' si sostituisce. */
function pagina(rel, cartella, conPlayer, azotoObbligato) {
    let html = leggi(rel);
    if (!PLAYER_VERO) html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\s*/i, '');
    html = riferimentiDalGuscio(html, cartella, rel);
    if (conPlayer && !PLAYER_VERO) {
        // i player dell'anteprima al posto di quelli veri: il flusso diretto (B) e il player di Azoto (A)
        html = ritocca(html, rel, '"diretta/player-webtv.js"', '"anteprima/player-anteprima.js"');
        if (azotoObbligato || html.indexOf('"diretta/player-azoto.js"') >= 0) {
            html = ritocca(html, rel, '"diretta/player-azoto.js"', '"anteprima/player-azoto-anteprima.js"');
        }
    }
    // nessun altro player: se una pagina ne carica ancora uno, la costruzione si ferma
    const altri = html.match(/<script src="diretta\/player-(?!webtv\.js"|azoto\.js")[^"]*"/g);
    if (altri) throw new Error('script di un player sconosciuto in ' + rel + ': ' + altri.join(', '));
    if (!PLAYER_VERO && /<script src="[^"]*player-(webtv|azoto)\.js"/.test(html)) throw new Error('player vero ancora presente in ' + rel);
    return html;
}

async function costruisci() {
    fs.rmSync(OUT, { recursive: true, force: true });
    fs.mkdirSync(OUT, { recursive: true });

    await motore();

    let diretta = leggi('diretta/diretta.js');
    RITOCCHI_DIRETTA.forEach(([a, b, n]) => { diretta = ritocca(diretta, 'diretta.js', a, b, n); });
    scrivi('diretta/diretta.js', diretta);

    let gestione = leggi('diretta/gestione/gestione.js');
    RITOCCHI_GESTIONE.forEach(([a, b, n]) => { gestione = ritocca(gestione, 'gestione.js', a, b, n); });
    scrivi('diretta/gestione/gestione.js', gestione);

    ['diretta/diretta.css', 'diretta/gestione/gestione.css'].forEach(f => copia(f));
    scrivi('diretta/nome-utente.js', leggi('diretta/nome-utente.js'));
    scrivi('diretta/sorgente-video.js', leggi('diretta/sorgente-video.js'));
    if (PLAYER_VERO) ['diretta/player-webtv.js', 'diretta/player-azoto.js', 'diretta/hls.min.js', 'diretta/dash.all.min.js'].forEach(f => copia(f));
    copia('diretta/prove/anteprima/config.js', 'diretta/config.js');
    copia('diretta/prove/anteprima/pagina.js', 'anteprima/pagina.js');
    copia('diretta/prove/anteprima/player-anteprima.js', 'anteprima/player-anteprima.js');
    copia('diretta/prove/anteprima/player-azoto-anteprima.js', 'anteprima/player-azoto-anteprima.js');
    fs.readdirSync(path.join(QUI, 'sdk')).forEach(f => copia('diretta/prove/anteprima/sdk/' + f, 'anteprima/sdk/' + f));

    const pagine = {
        diretta: pagina('diretta/index.html', '/diretta/', true, true),
        reimposta: pagina('diretta/reimposta.html', '/diretta/', false),
        gestione: pagina('diretta/gestione/index.html', '/diretta/gestione/', true)
    };
    scrivi('anteprima/pagine.js', '/* Le pagine vere della diretta, ritoccate da costruisci.js */\nwindow.NGBA_PAGINE = ' + JSON.stringify(pagine) + ';\n'
        + 'window.NGBA_CSV_ESEMPIO = ' + JSON.stringify(leggi('diretta/prove/esempio-partecipanti.csv')) + ';\n');

    // le immagini citate dalle pagine e dalle email (la fascia e il logo bianco)
    const immagini = new Set(['assets/newsletter/fascia-filigrana.png', 'assets/logo-revilaw-bianco.png', 'assets/favicon.png']);
    Object.values(pagine).join('\n').replace(/"(assets\/[^"]+\.(?:png|jpg|jpeg|svg|webp|ico))"/g, (t, f) => { immagini.add(f); return t; });
    immagini.forEach(f => copia(f));

    copia('diretta/prove/anteprima/guscio.html', 'index.html');
    copia('diretta/prove/anteprima/guscio.js', 'anteprima/guscio.js');

    // riepilogo
    const elenco = [];
    (function giro(d) {
        fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
            const p = path.join(d, e.name);
            if (e.isDirectory()) giro(p); else elenco.push([path.relative(OUT, p), fs.statSync(p).size]);
        });
    })(OUT);
    elenco.sort((a, b) => a[0].localeCompare(b[0]));
    elenco.forEach(([f, n]) => console.log(String(Math.round(n / 1024)).padStart(6) + ' KB  ' + f));
    console.log('\nAnteprima in ' + path.relative(REPO, OUT) + '/ (' + elenco.length + ' file, ' + Math.round(elenco.reduce((a, x) => a + x[1], 0) / 1024) + ' KB)');
}

costruisci().catch(e => { console.error(e.message || e); process.exit(1); });
