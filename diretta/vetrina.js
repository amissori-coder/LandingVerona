/* ============================================================
   IL QUADRANTE DEL SITO, MENTRE SI ASPETTA LA DIRETTA
   ------------------------------------------------------------
   Nella vista d'attesa la fascia blu del titolo diventa viva, con il
   disegno dell'orbita della home: dal bordo destro della fascia (sul
   telefono e sul tablet dal bordo in basso) sorge un mezzo disco chiaro
   con due anelli. Sull'anello girano le cose del sito, come le lancette
   di un quadrante: ogni 8 secondi circa il quadrante ruota di un passo e
   porta in primo piano la voce dopo. Della voce in primo piano:
     - accanto al suo punto, il titolo (sopratitolo, titolo, link alla
       pagina del sito, in un'altra scheda: la diretta resta aperta);
     - nel disco, il segno grande (la data di Milano, le 20 interviste,
       la mappa delle 63 sedi, la categoria dell'approfondimento...);
     - con il video della home, il video stesso dietro tutta la fascia,
       sfocato e velato (luce che si muove, senza audio); il link porta al
       video nella home.
   Un anello attorno al punto in primo piano si riempie fino al passo
   dopo. Fra tutte le voci si scorre a mano, avanti e indietro: con le
   frecce sotto il quadrante (con il numero della voce, «3 / 11»), con le
   voci vicine sull'anello, trascinando il quadrante (con il mouse in su e
   in giu' lungo l'arco; con il dito di lato), con lo scorrimento di lato
   del touchpad e con i tasti freccia. Dopo un passo a mano il giro da
   solo aspetta (20 secondi senza tocchi), cosi' si legge; aspetta anche
   con il mouse sul titolo o sul disco e con il fuoco da tastiera dentro
   il quadrante. Per chi chiede meno movimento il quadrante non gira da
   solo (solo a mano) e non c'e' il video, come per chi chiede il
   risparmio dei dati. Fuori dall'attesa (ferma()) tutto si ferma, anche
   il video.

   Le voci sono quelle del sito (la home e le sue pagine, novembre 2026):
   se il sito cambia, si aggiornano qui, in VOCI. Le immagini e il video
   si prendono dal sito, accanto alla cartella diretta/ (vale anche per
   l'anteprima, che li copia: diretta/prove/anteprima/costruisci.js cerca
   qui i loro nomi); i link vanno alle pagine del sito. Tutto con
   createElement e textContent: niente HTML costruito con i dati.

   window.NGBVetrina = {
     crea(contenitore, opzioni) -> { mostra(evento), ferma(), distruggi(), vai(n), avanti(), voci() }
       opzioni.secondiVoce   la durata di ogni voce (le prove la accorciano; anche l'attesa dopo
                             un passo a mano: una volta e mezza)
     voci(evento)            le voci per l'evento (con Milano solo se viene prima)
   }
   ============================================================ */
(function () {
    'use strict';

    var SECONDI_VOCE = 8;
    var DATA_MILANO = '2027-02-26';
    var PASSO = 24;                     // i gradi fra una voce e l'altra sull'anello

    // i file del sito: la cartella sopra diretta/ (sul sito la radice; nell'anteprima la sua cartella)
    var QUI = (document.currentScript && document.currentScript.src) || location.href;
    function sito(percorso) { return new URL('../' + percorso, QUI).href; }
    function accanto(file) { return new URL(file, QUI).href; }
    var VIDEO = 'assets/video-home.mp4';
    var MAPPA = 'vetrina-sedi-chiara.svg';

    /* Le voci, nell'ordine in cui girano. nome: sull'anello; sopra e titolo:
       accanto al punto in primo piano; link: [testo, pagina del sito];
       disco: i pezzi del segno nel disco ([tipo, testo]). */
    var VOCI = [
        {
            tipo: 'milano', nome: 'Milano · 26 febbraio 2027', sopra: 'Il prossimo evento',
            titolo: 'Milano: merito creditizio, crescita e competitività delle imprese',
            link: ['Scopri l\'evento', 'milano_febbraio_2027/'],
            disco: [['grande', '26'], ['riga', 'Febbraio 2027'], ['piccolo', 'Venerdì · Milano']]
        },
        {
            tipo: 'video', nome: 'Il video della home', sopra: 'Next Generation Business',
            titolo: 'Il percorso in sei passaggi: governare un\'impresa, oggi', link: ['Guarda il video', '#video'], secondi: 14,
            disco: [['play', ''], ['riga', 'Il video'], ['piccolo', 'In sei passaggi']]
        },
        {
            tipo: 'interviste', nome: 'Le interviste di Verona', sopra: 'Verona · 27 marzo 2026',
            titolo: 'Le interviste ai protagonisti del convegno, in video',
            link: ['Guarda le interviste', 'interviste_verona_2026/'],
            disco: [['grande', '20'], ['riga', 'interviste'], ['piccolo', 'in video']]
        },
        {
            tipo: 'articolo', nome: 'Cassazione 7134', sopra: 'Sotto la lente',
            titolo: 'Credito all\'impresa già decotta: il finanziamento è nullo',
            link: ['Leggi l\'approfondimento', 'cassazione_7134_2026/'], secondi: 9,
            disco: [['piccolo', 'Approfondimento'], ['riga', 'Sotto'], ['riga', 'la lente']]
        },
        {
            tipo: 'sedi', nome: '63 sedi in Italia', sopra: 'Una presenza capillare',
            titolo: 'Professionisti e sedi da Nord a Sud, vicino alle imprese', link: null,
            disco: [['mappa', ''], ['grande', '63'], ['piccolo', 'sedi in Italia']]
        },
        {
            tipo: 'articolo', nome: 'Merito creditizio ed ESG', sopra: 'ESG & Sostenibilità',
            titolo: 'Merito creditizio ed ESG: cosa cambia nel 2027 per le imprese che chiedono credito',
            link: ['Leggi l\'approfondimento', 'esg_merito_creditizio/'], secondi: 9,
            disco: [['piccolo', 'Approfondimento'], ['riga', 'ESG']]
        },
        {
            tipo: 'revisione', nome: 'Revisione legale', sopra: 'Il sistema di protezione',
            titolo: 'La revisione legale al centro: adeguati assetti, Modello 231, ESG, AI governance',
            link: ['Scopri il processo', 'revisione-demo/'],
            disco: [['riga', 'Revisione'], ['riga', 'legale'], ['piccolo', '5 fasi, metodo ISA Italia']]
        },
        {
            tipo: 'articolo', nome: 'Bando-tipo Mimit', sopra: 'Sotto la lente',
            titolo: 'Aiuti di Stato: corsia preferenziale a chi è virtuoso',
            link: ['Leggi l\'approfondimento', 'bando_tipo_2026/'], secondi: 9,
            disco: [['piccolo', 'Approfondimento'], ['riga', 'Aiuti'], ['riga', 'di Stato']]
        },
        {
            tipo: 'articolo', nome: 'L\'organo di controllo', sopra: 'Governance',
            titolo: 'L\'organo di controllo dopo il D.Lgs. 47/2026: vigilanza sugli assetti, evidenze e verbali',
            link: ['Leggi l\'approfondimento', 'organo_di_controllo/'], secondi: 9,
            disco: [['piccolo', 'Approfondimento'], ['riga', 'D.Lgs.'], ['riga', '47/2026']]
        },
        {
            tipo: 'articolo', nome: 'Rating di legalità', sopra: 'Rating di legalità',
            titolo: 'Il rating di legalità diventa criterio per gli incentivi',
            link: ['Leggi l\'approfondimento', 'rating_legalita_incentivi/'], secondi: 9,
            disco: [['piccolo', 'Approfondimento'], ['riga', 'Rating'], ['riga', 'di legalità']]
        },
        {
            tipo: 'articolo', nome: 'L\'IA in azienda', sopra: 'AI Governance',
            titolo: 'Intelligenza artificiale in azienda: l\'algoritmo propone, l\'impresa risponde',
            link: ['Leggi l\'approfondimento', 'governo_ia_impresa/'], secondi: 9,
            disco: [['piccolo', 'Approfondimento'], ['riga', 'L\'IA'], ['riga', 'in azienda']]
        }
    ];

    // meno movimento: il quadrante non gira da solo e non c'e' il video
    function menoMovimento() {
        try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
    }
    // niente video che parte da solo per chi chiede meno movimento o il risparmio dei dati
    function senzaVideo() {
        if (menoMovimento()) return true;
        try {
            var c = navigator.connection;
            return !!(c && c.saveData);
        } catch (e) { return false; }
    }
    // la disposizione dei computer (il disco dal bordo destro): la stessa soglia di diretta.css
    function suComputer() {
        try { return !window.matchMedia || window.matchMedia('(min-width: 1200px)').matches; } catch (e) { return true; }
    }
    function oggi() {
        var d = new Date();
        return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    }

    // le voci per l'evento: Milano solo per gli eventi che vengono prima (senza la data dell'evento: fino a quel giorno)
    function voci(evento) {
        var d = String((evento && evento.data) || '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) d = oggi();
        var noVideo = senzaVideo();
        return VOCI.filter(function (v) {
            if (v.tipo === 'milano') return d < DATA_MILANO;
            if (v.tipo === 'video') return !noVideo;
            return true;
        });
    }

    /* ---------- il disegno ---------- */
    function el(tag, classe, testo) {
        var e = document.createElement(tag);
        if (classe) e.className = classe;
        if (testo != null) e.textContent = testo;
        return e;
    }
    // i link alle pagine del sito: dalla radice del sito (come gli altri link della pagina; nell'anteprima li apre anteprima/pagina.js sul sito vero)
    function link(classe, testo, pagina) {
        var a = el('a', classe, testo);
        a.href = '/' + pagina;
        a.target = '_blank';
        a.rel = 'noopener';
        return a;
    }
    var NS = 'http://www.w3.org/2000/svg';
    function svg(classe, viewBox) {
        var s = document.createElementNS(NS, 'svg');
        s.setAttribute('class', classe);
        s.setAttribute('viewBox', viewBox);
        s.setAttribute('aria-hidden', 'true');
        s.setAttribute('focusable', 'false');
        return s;
    }
    // le icone: play e le frecce
    var DISEGNI = { play: 'M8 5.5v13l10.5-6.5z', prima: 'M14.7 5.3 8 12l6.7 6.7 1.4-1.4L10.8 12l5.3-5.3z', dopo: 'M9.3 5.3 16 12l-6.7 6.7-1.4-1.4 5.3-5.3-5.3-5.3z' };
    function icona(tipo, classe) {
        var s = svg(classe || 'vetrina-icona', '0 0 24 24');
        var p = document.createElementNS(NS, 'path');
        p.setAttribute('fill', 'currentColor');
        p.setAttribute('d', DISEGNI[tipo]);
        s.appendChild(p);
        return s;
    }

    function segnoDelDisco(v) {
        var d = el('div', 'vetrina-disco-dentro vetrina-disco-' + v.tipo);
        v.disco.forEach(function (pezzo) {
            if (pezzo[0] === 'mappa') {
                var img = el('img', 'vetrina-disco-mappa');
                img.src = accanto(MAPPA);
                img.alt = '';
                img.decoding = 'async';
                d.appendChild(img);
            } else if (pezzo[0] === 'play') {
                var p = el('span', 'vetrina-disco-play');
                p.appendChild(icona('play'));
                d.appendChild(p);
            } else {
                d.appendChild(el('p', 'vetrina-disco-' + pezzo[0], pezzo[1]));
            }
        });
        return d;
    }
    function titoloDellaVoce(v) {
        var t = el('div', 'vetrina-titolo-dentro');
        t.appendChild(el('p', 'vetrina-sopra', v.sopra));
        t.appendChild(el('p', 'vetrina-titolo-testo', v.titolo));
        if (v.link) t.appendChild(link('vetrina-link', v.link[0], v.link[1]));
        return t;
    }

    function crea(contenitore, opzioni) {
        opzioni = opzioni || {};
        var secondiProva = Number(opzioni.secondiVoce) > 0 ? Number(opzioni.secondiVoce) : 0;

        var radice = el('div', 'vetrina');
        radice.setAttribute('role', 'region');
        radice.setAttribute('aria-label', 'Mentre aspetti: dal sito Next Generation Business');
        // lo sfondo vivo: il video della home dietro tutta la fascia (solo con la sua voce)
        var sfondo = el('div', 'vetrina-sfondo');
        sfondo.setAttribute('aria-hidden', 'true');
        radice.appendChild(sfondo);
        // il quadrante: gli anelli, il disco, le voci e l'anello che si riempie attorno al punto in primo piano
        var palco = el('div', 'vetrina-palco');
        var quadrante = el('div', 'vetrina-quadrante');
        ['fuori', 'voci', 'disco'].forEach(function (a) {
            var s = el('span', 'vetrina-anello vetrina-anello-' + a);
            s.setAttribute('aria-hidden', 'true');
            quadrante.appendChild(s);
        });
        var disco = el('div', 'vetrina-disco');
        disco.setAttribute('aria-hidden', 'true');
        quadrante.appendChild(disco);
        var anello = el('div', 'vetrina-voci');
        quadrante.appendChild(anello);
        var progresso = svg('vetrina-progresso', '0 0 40 40');
        var cerchio = document.createElementNS(NS, 'circle');
        cerchio.setAttribute('cx', '20');
        cerchio.setAttribute('cy', '20');
        cerchio.setAttribute('r', '17');
        cerchio.setAttribute('pathLength', '100');
        progresso.appendChild(cerchio);
        quadrante.appendChild(progresso);
        palco.appendChild(quadrante);
        radice.appendChild(palco);
        // il titolo della voce in primo piano (il fuoco ci va quando si sceglie una voce da tastiera)
        var titolo = el('div', 'vetrina-titolo');
        titolo.tabIndex = -1;
        radice.appendChild(titolo);
        // per scorrere a mano fra tutte le voci: indietro, il numero della voce, avanti
        var comandi = el('div', 'vetrina-comandi');
        var indietro = el('button', 'vetrina-freccia vetrina-freccia-prima');
        indietro.type = 'button';
        indietro.setAttribute('aria-label', 'Contenuto precedente');
        indietro.appendChild(icona('prima'));
        var numero = el('p', 'vetrina-numero');
        numero.setAttribute('aria-hidden', 'true');
        var poi = el('button', 'vetrina-freccia vetrina-freccia-dopo');
        poi.type = 'button';
        poi.setAttribute('aria-label', 'Contenuto successivo');
        poi.appendChild(icona('dopo'));
        comandi.appendChild(indietro);
        comandi.appendChild(numero);
        comandi.appendChild(poi);
        radice.appendChild(comandi);
        // per i lettori di schermo: la voce scelta a mano (il giro da solo non si annuncia)
        var annuncio = el('p', 'vetrina-solo-lettori');
        annuncio.setAttribute('aria-live', 'polite');
        radice.appendChild(annuncio);
        contenitore.appendChild(radice);

        var lista = [], firma = '', n = 0;
        var timer = null, scadenza = 0, restante = 0;
        var attiva = false;
        var trattenuta = { mouse: false, fuoco: false, tocco: false, trascina: false };
        var timerTocco = null;
        var ATTESA_DOPO_TOCCO = secondiProva ? secondiProva * 1500 : 20000;
        var video = null;

        function fermo() { return !attiva || menoMovimento() || trattenuta.mouse || trattenuta.fuoco || trattenuta.tocco || trattenuta.trascina; }
        function durataMs(v) { return secondiProva ? secondiProva * 1000 : (v.secondi || SECONDI_VOCE) * 1000; }

        function preparaVideo() {
            if (video) return video;
            video = document.createElement('video');
            video.className = 'vetrina-video';
            video.muted = true;
            video.defaultMuted = true;
            video.loop = true;
            video.playsInline = true;
            ['muted', 'playsinline', 'loop', 'disablepictureinpicture', 'disableremoteplayback'].forEach(function (a) { video.setAttribute(a, ''); });
            video.setAttribute('preload', 'none');
            video.setAttribute('tabindex', '-1');
            video.src = sito(VIDEO);
            sfondo.appendChild(video);
            return video;
        }
        function videoSi() {
            var p = preparaVideo().play();
            if (p && typeof p.catch === 'function') p.catch(function () { /* il browser non lo fa partire: resta lo sfondo */ });
        }
        function videoNo() { if (video) { try { video.pause(); } catch (e) { /* niente */ } } }

        // il tempo della voce: aspetta (e riprende da dove era) dopo un passo a mano, con il mouse o con il fuoco
        function aggiornaStato() {
            var f = fermo();
            radice.classList.toggle('vetrina-ferma', f);
            radice.classList.toggle('vetrina-a-mano', menoMovimento());
            var conVideo = !!(lista[n] && lista[n].tipo === 'video');
            radice.classList.toggle('vetrina-con-video', conVideo && attiva);
            if (f) {
                if (timer) { clearTimeout(timer); timer = null; restante = Math.max(0, scadenza - Date.now()); }
                if (!attiva || !conVideo) videoNo(); else videoSi();
            } else {
                if (!timer && lista.length > 1) {
                    var ms = restante > 0 ? restante : durataMs(lista[n]);
                    restante = 0;
                    scadenza = Date.now() + ms;
                    timer = setTimeout(avanti, ms);
                }
                if (conVideo) videoSi(); else videoNo();
            }
        }

        // la distanza (in passi) della voce i dalla voce in primo piano: da -m/2 a m/2
        function distanza(i) {
            var m = lista.length;
            var k = ((i - n) % m + m) % m;
            return k > m / 2 ? k - m : k;
        }
        function disponi() {
            var m = lista.length;
            lista.forEach(function (v, i) {
                var k = distanza(i);
                var b = v.bottone;
                // chi passa dall'altra parte (fuori dalla fascia) salta, senza attraversare il quadrante
                var salta = v.k == null || Math.abs(k - v.k) >= m / 2;
                if (salta) b.classList.add('vetrina-voce-salta');
                b.style.setProperty('--ang', (-k * PASSO) + 'deg');
                b.setAttribute('data-vicino', String(Math.min(Math.abs(k), 3)));
                b.setAttribute('data-lato', k < 0 ? 'prima' : (k > 0 ? 'dopo' : 'ora'));
                var vicina = Math.abs(k) === 1;
                b.tabIndex = vicina ? 0 : -1;
                if (vicina) b.removeAttribute('aria-hidden'); else b.setAttribute('aria-hidden', 'true');
                if (salta) {
                    void b.offsetWidth;
                    b.classList.remove('vetrina-voce-salta');
                }
                v.k = k;
            });
        }
        // il disco e il titolo: il nuovo entra, il vecchio esce (e poi si toglie)
        function cambia(dove, nuovo) {
            Array.prototype.slice.call(dove.children).forEach(function (x) {
                if (x.classList.contains('vetrina-esce')) return;
                x.classList.remove('vetrina-entra');
                x.classList.add('vetrina-esce');
                x.setAttribute('aria-hidden', 'true');
                x.inert = true;
                setTimeout(function () { if (x.parentNode) x.parentNode.removeChild(x); }, 700);
            });
            nuovo.classList.add('vetrina-entra');
            dove.appendChild(nuovo);
        }
        function riavviaProgresso() {
            cerchio.classList.remove('vetrina-progresso-va');
            void cerchio.getBoundingClientRect();
            cerchio.style.animationDuration = durataMs(lista[n]) + 'ms';
            if (lista.length > 1) cerchio.classList.add('vetrina-progresso-va');
        }

        function vai(i) {
            if (!lista.length) return;
            var prima = n;
            n = ((i % lista.length) + lista.length) % lista.length;
            disponi();
            if (n !== prima || !disco.children.length) {
                cambia(disco, segnoDelDisco(lista[n]));
                cambia(titolo, titoloDellaVoce(lista[n]));
            }
            radice.setAttribute('data-voce', lista[n].tipo);
            numero.textContent = (n + 1) + ' / ' + lista.length;
            clearTimeout(timer);
            timer = null;
            restante = 0;
            riavviaProgresso();
            aggiornaStato();
        }
        function avanti() { timer = null; vai(n + 1); }
        // un passo a mano (frecce, voci vicine, trascinamento, tasti): il giro da solo aspetta, la voce si annuncia
        function aMano(i) {
            if (!lista.length) return;
            trattenuta.tocco = true;
            clearTimeout(timerTocco);
            timerTocco = setTimeout(function () { trattenuta.tocco = false; aggiornaStato(); }, ATTESA_DOPO_TOCCO);
            vai(i);
            annuncio.textContent = (n + 1) + ' di ' + lista.length + ': ' + lista[n].nome;
        }

        function costruisci(nuove) {
            while (anello.firstChild) anello.removeChild(anello.firstChild);
            while (disco.firstChild) disco.removeChild(disco.firstChild);
            while (titolo.firstChild) titolo.removeChild(titolo.firstChild);
            lista = nuove.map(function (v, i) {
                var voce = Object.assign({}, v);
                var b = el('button', 'vetrina-voce');
                b.type = 'button';
                b.setAttribute('aria-label', 'Mostra: ' + v.nome);
                b.appendChild(el('span', 'vetrina-voce-punto'));
                b.appendChild(el('span', 'vetrina-voce-nome', v.nome));
                b.addEventListener('click', function (e) {
                    aMano(i);
                    // da tastiera il fuoco va al titolo della voce, che si legge (il quadrante aspetta)
                    if (e.detail === 0) titolo.focus();
                });
                anello.appendChild(b);
                voce.bottone = b;
                return voce;
            });
            n = 0;
            vai(0);
        }

        function mostra(evento) {
            var nuove = voci(evento);
            var f = nuove.map(function (v) { return v.tipo + ':' + v.nome; }).join('|');
            if (f !== firma) { firma = f; costruisci(nuove); }
            attiva = true;
            aggiornaStato();
        }
        // la vista d'attesa e' chiusa: si ferma tutto (anche il video)
        function ferma() { attiva = false; aggiornaStato(); }
        function distruggi() { ferma(); if (radice.parentNode) radice.parentNode.removeChild(radice); }

        indietro.addEventListener('click', function () { aMano(n - 1); });
        poi.addEventListener('click', function () { aMano(n + 1); });
        // i tasti freccia, con il fuoco nel quadrante
        radice.addEventListener('keydown', function (e) {
            var passo = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
            if (!passo || e.altKey || e.ctrlKey || e.metaKey) return;
            e.preventDefault();
            aMano(n + passo);
        });
        // lo scorrimento di lato del touchpad (o della rotella) sul quadrante: un passo alla volta
        var ultimoScorrimento = 0;
        palco.addEventListener('wheel', function (e) {
            if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || Math.abs(e.deltaX) < 8) return;
            e.preventDefault();
            var ora = Date.now();
            if (ora - ultimoScorrimento < 450) return;
            ultimoScorrimento = ora;
            aMano(n + (e.deltaX > 0 ? 1 : -1));
        }, { passive: false });
        /* Il quadrante si trascina: le voci seguono il puntatore lungo l'arco (--trascina) e, lasciato,
           si ferma sulla voce piu' vicina. Sui computer con il mouse in su e in giu' (l'arco e' in
           verticale); con il dito di lato (in su e in giu' resta lo scorrimento della pagina). */
        var presa = null, nienteClic = 0;
        function raggio() { var a = quadrante.querySelector('.vetrina-anello-voci'); return (a && a.offsetWidth / 2) || 300; }
        palco.addEventListener('pointerdown', function (e) {
            if ((e.pointerType === 'mouse' && e.button !== 0) || lista.length < 2) return;
            presa = { id: e.pointerId, x: e.clientX, y: e.clientY, gradi: 0, mossa: false, verticale: suComputer() && e.pointerType === 'mouse', computer: suComputer() };
        });
        palco.addEventListener('pointermove', function (e) {
            if (!presa || e.pointerId !== presa.id) return;
            var dx = e.clientX - presa.x, dy = e.clientY - presa.y;
            if (!presa.mossa) {
                if (Math.abs(presa.verticale ? dy : dx) < 8) return;
                // con il dito, un gesto in su o in giu' e' lo scorrimento della pagina
                if (!presa.verticale && Math.abs(dy) > Math.abs(dx)) { presa = null; return; }
                presa.mossa = true;
                try { palco.setPointerCapture(e.pointerId); } catch (x) { /* niente */ }
                radice.classList.add('vetrina-trascina');
                trattenuta.trascina = true;
                aggiornaStato();
            }
            // le voci seguono il puntatore: in su sui computer (le voci salgono), di lato sul telefono (seguono il dito)
            var d = presa.verticale ? -dy : (presa.computer ? -dx : dx);
            presa.gradi = d / raggio() * 180 / Math.PI;
            quadrante.style.setProperty('--trascina', presa.gradi.toFixed(2) + 'deg');
            e.preventDefault();
        });
        function lascia(e) {
            if (!presa || (e && e.pointerId !== presa.id)) return;
            var gradi = presa.gradi, mossa = presa.mossa;
            presa = null;
            if (!mossa) return;
            nienteClic = Date.now();
            radice.classList.remove('vetrina-trascina');
            quadrante.style.setProperty('--trascina', '0deg');
            trattenuta.trascina = false;
            var passi = Math.round(gradi / PASSO);
            if (passi) aMano(n + passi); else aggiornaStato();
        }
        palco.addEventListener('pointerup', lascia);
        palco.addEventListener('pointercancel', lascia);
        // il clic che chiude un trascinamento non preme la voce sotto il puntatore
        palco.addEventListener('click', function (e) {
            if (Date.now() - nienteClic < 350) { e.stopPropagation(); e.preventDefault(); }
        }, true);
        // il mouse sul titolo o sul disco: il quadrante aspetta
        [titolo, disco].forEach(function (x) {
            x.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') { trattenuta.mouse = true; aggiornaStato(); } });
            x.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') { trattenuta.mouse = false; aggiornaStato(); } });
        });
        // il fuoco da tastiera dentro il quadrante: aspetta (con il clic del mouse no: il giro continua)
        radice.addEventListener('focusin', function (e) {
            var daTastiera = true;
            try { daTastiera = e.target.matches(':focus-visible'); } catch (x) { /* browser vecchio: come da tastiera */ }
            if (e.target === indietro || e.target === poi) daTastiera = false;
            trattenuta.fuoco = daTastiera;
            aggiornaStato();
        });
        radice.addEventListener('focusout', function (e) {
            if (!radice.contains(e.relatedTarget)) { trattenuta.fuoco = false; aggiornaStato(); }
        });
        aggiornaStato();

        return {
            mostra: mostra, ferma: ferma, distruggi: distruggi, vai: vai, avanti: avanti,
            voci: function () { return lista.map(function (v) { return v.tipo; }); }
        };
    }

    window.NGBVetrina = { crea: crea, voci: voci, SECONDI_VOCE: SECONDI_VOCE };
})();
