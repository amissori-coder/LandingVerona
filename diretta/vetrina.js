/* ============================================================
   LA VETRINA DEL SITO, MENTRE SI ASPETTA LA DIRETTA
   ------------------------------------------------------------
   Nella vista d'attesa, nello schermo accanto al conto alla rovescia
   (sul telefono sotto), girano da sole le cose del sito Next
   Generation Business, una «scena» alla volta, in dissolvenza:
     1. il video della home, «Next Generation Business in sei passaggi»
        (assets/video-home.mp4, senza audio; finito il video, la scena
        dopo);
     2. i temi in orbita attorno alla revisione legale, come nella home
        (sul telefono in fila, accesi uno alla volta);
     3. gli ultimi approfondimenti, che scorrono, ognuno con il link alla
        sua pagina (si apre in un'altra scheda: la diretta resta aperta);
     4. il prossimo appuntamento, Milano 26 febbraio 2027, con il save
        the date (solo per gli eventi che vengono prima);
     5. le 20 interviste di Verona, con i loro temi;
     6. le 63 sedi in Italia, sulla mappa (vetrina-sedi.svg, ricavata
        dalla mappa della home, con i punti che pulsano).
   In cima allo schermo, in una fascia sua (le scene stanno sotto: non la
   coprono e non ne sono coperte), il CONTO ALLA ROVESCIA all'inizio della
   diretta (opzioni.inizio(), lo stesso del conto grande della pagina);
   passata l'ora, «La diretta sta per iniziare». Con il mouse sullo schermo, o
   con il fuoco su un suo link, la scena resta quella (non sparisce sotto le
   mani); il video non c'e' per chi chiede meno movimento o il risparmio dei
   dati. Sotto lo schermo un puntino per
   scena (premuto, va a quella scena e il tempo riparte da li') e
   «Ferma»/«Riprendi» (le cose che si muovono da sole si devono poter
   fermare). Fuori dall'attesa (ferma()) tutto si ferma, anche il video.

   I testi sono quelli del sito (la home e le sue pagine, novembre 2026):
   se il sito cambia, si aggiornano qui, in CONTENUTI. Le immagini e il
   video si prendono dal sito, accanto alla cartella diretta/ (vale
   anche per l'anteprima, che li copia: diretta/prove/anteprima/costruisci.js
   cerca qui i loro nomi); i link vanno alle pagine del sito. Tutto con
   createElement e textContent: niente HTML costruito con i dati.

   window.NGBVetrina = {
     crea(contenitore, opzioni) -> { mostra(evento), ferma(), distruggi(), vai(n), avanti(), scene() }
       opzioni.inizio()      l'inizio della diretta in ms (o null)
       opzioni.adesso()      l'ora (ms), se non quella del dispositivo
       opzioni.secondiScena  la durata delle scene (le prove la accorciano;
                             anche il video si ferma li')
     scene(evento)          le scene per l'evento (i loro tipi)
   }
   ============================================================ */
(function () {
    'use strict';

    var SECONDI_SCENA = 11;
    var SECONDI_APPROFONDIMENTI = 17;
    var VIDEO_MAX_S = 62;               // il video della home dura 56 secondi
    var DATA_MILANO = '2027-02-26';

    // i file del sito: la cartella sopra diretta/ (sul sito la radice; nell'anteprima la sua cartella)
    var QUI = (document.currentScript && document.currentScript.src) || location.href;
    function sito(percorso) { return new URL('../' + percorso, QUI).href; }
    function accanto(file) { return new URL(file, QUI).href; }

    var CONTENUTI = {
        video: {
            titolo: 'Next Generation Business in sei passaggi',
            file: 'assets/video-home.mp4', poster: 'assets/video-home-poster.jpg'
        },
        temi: {
            sopra: 'Next Generation Business',
            titolo: 'Un unico sistema di protezione, dell\'impresa e di chi la guida',
            centro: ['Revisione legale', '5 fasi, metodo ISA Italia'],
            voci: [
                ['Adeguati assetti', 'Art. 2086 c.c.'],
                ['Tax Control Framework', 'Adempimento collaborativo'],
                ['AI Governance', 'AI Act e FRIA'],
                ['Modello 231', 'D.Lgs. 231/2001'],
                ['ESG', 'Bilancio VSME ed ESRS'],
                ['Bandi e agevolazioni', 'Nazionali e regionali'],
                ['Rating di Legalità', 'AGCM']
            ]
        },
        // [categoria, etichetta, titolo, pagina del sito]
        approfondimenti: [
            ['Sotto la lente', 'Cassazione 7134', 'Credito all\'impresa già decotta: il finanziamento è nullo', 'cassazione_7134_2026/'],
            ['ESG & Sostenibilità', 'Novità', 'Merito creditizio ed ESG: cosa cambia nel 2027 per le imprese che chiedono credito', 'esg_merito_creditizio/'],
            ['Sotto la lente', 'Bando-tipo Mimit', 'Aiuti di Stato: corsia preferenziale a chi è virtuoso', 'bando_tipo_2026/'],
            ['Governance', 'Novità', 'L\'organo di controllo dopo il D.Lgs. 47/2026: vigilanza sugli assetti, evidenze e verbali', 'organo_di_controllo/'],
            ['Rating di Legalità', 'Novità', 'Il rating di legalità diventa criterio per gli incentivi', 'rating_legalita_incentivi/'],
            ['Governance', 'Novità', 'Amministratori, controllori e revisori di S.p.A.: cosa cambia dopo il D.Lgs. 47/2026', 'amministratori_controllori_revisori/'],
            ['AI Governance', 'Novità', 'Intelligenza artificiale in azienda: l\'algoritmo propone, l\'impresa risponde', 'governo_ia_impresa/'],
            ['Governance', 'Ebook', 'La responsabilità degli amministratori di società: la guida operativa 2026', 'responsabilita_amministratori/'],
            ['Bandi Nazionali', 'Novità', 'Nuove imprese a tasso zero: 59 milioni per giovani e donne', 'nuove_imprese_tasso_zero/']
        ],
        milano: {
            immagine: 'milano_febbraio_2027/assets/save-the-date-anteprima.jpg',
            pagina: 'milano_febbraio_2027/',
            pillola: 'Save the date · Next Generation Business',
            giorno: '26', mese: 'Febbraio 2027', settimana: 'Venerdì', citta: 'Milano',
            titolo: 'Merito creditizio, crescita e competitività delle imprese',
            voci: ['Convegno al mattino', 'Incontri B2B al pomeriggio', 'Partecipazione gratuita']
        },
        interviste: {
            pagina: 'interviste_verona_2026/',
            sopra: 'Verona · 27 marzo 2026',
            titolo: 'Le interviste ai protagonisti',
            numero: 20, dopo: 'interviste in video',
            temi: ['Governance e controllo interno', 'Modello 231', 'Revisione nelle PMI', 'Il punto di vista del sindaco',
                'Il revisore specializzato', 'Oltre la verifica', 'Intelligenza artificiale', 'Rischi integrati']
        },
        sedi: {
            sopra: 'Revilaw · Una presenza capillare',
            numero: 63, dopo: 'sedi in Italia',
            sotto: 'Da Nord a Sud, vicino alle imprese.',
            citta: ['Alessandria', 'Ancona', 'Avellino', 'Bari', 'Barletta', 'Belluno', 'Bergamo', 'Bologna', 'Bolzano', 'Brescia',
                'Cagliari', 'Caltanissetta', 'Campobasso', 'Caserta', 'Catania', 'Catanzaro', 'Chieti', 'Cosenza', 'Cremona', 'Cuneo',
                'Firenze', 'Foggia', 'Latina', 'Lecce', 'Livorno', 'Lucca', 'Macerata', 'Mantova', 'Messina', 'Milano', 'Monza',
                'Napoli', 'Padova', 'Palermo', 'Palmi', 'Parma', 'Pavia', 'Perugia', 'Pesaro', 'Pescara', 'Pisa', 'Pistoia',
                'Potenza', 'Prato', 'Ravenna', 'Reggio Calabria', 'Rieti', 'Roma', 'Rovigo', 'Salerno', 'Sanremo', 'Savona',
                'Siena', 'Sud Sardegna', 'Taranto', 'Teramo', 'Torino', 'Trapani', 'Treviso', 'Venezia', 'Verona', 'Vicenza', 'Viterbo']
        }
    };

    // niente video che parte da solo per chi chiede meno movimento o il risparmio dei dati
    function senzaVideo() {
        try {
            if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
            var c = navigator.connection;
            return !!(c && c.saveData);
        } catch (e) { return false; }
    }

    // le scene per l'evento: Milano solo per gli eventi che vengono prima (senza la data dell'evento: fino a quel giorno)
    function scene(evento) {
        var d = String((evento && evento.data) || '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
            var oggi = new Date();
            d = oggi.getFullYear() + '-' + ('0' + (oggi.getMonth() + 1)).slice(-2) + '-' + ('0' + oggi.getDate()).slice(-2);
        }
        var tipi = senzaVideo() ? ['temi', 'approfondimenti'] : ['video', 'temi', 'approfondimenti'];
        if (d < DATA_MILANO) tipi.push('milano');
        tipi.push('interviste', 'sedi');
        return tipi;
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
    // un numero che sale da 0 (quando la scena compare)
    function conta(b) {
        var fino = Number(b.dataset.fino) || 0;
        var t0 = Date.now(), durata = 1300;
        clearInterval(b.__giro);
        b.textContent = '0';
        b.__giro = setInterval(function () {
            var p = Math.min(1, (Date.now() - t0) / durata);
            b.textContent = String(Math.round(fino * (1 - Math.pow(1 - p, 3))));
            if (p >= 1) clearInterval(b.__giro);
        }, 40);
    }
    // un nastro che scorre: la lista ripetuta due volte (l'animazione va da 0 a -50%)
    function nastro(classe, voci, conVoce) {
        var fuori = el('div', classe);
        fuori.setAttribute('aria-hidden', 'true');
        var dentro = el('div', classe + '-dentro');
        for (var giro = 0; giro < 2; giro++) voci.forEach(function (v) { dentro.appendChild(conVoce(v)); });
        fuori.appendChild(dentro);
        return fuori;
    }

    var DISEGNA = {
        video: function () {
            var c = CONTENUTI.video;
            var s = el('div', 'vetrina-scena vetrina-scena-video');
            var v = document.createElement('video');
            v.className = 'vetrina-video';
            v.muted = true;
            v.defaultMuted = true;
            v.playsInline = true;
            v.setAttribute('muted', '');
            v.setAttribute('playsinline', '');
            v.setAttribute('preload', 'none');
            v.setAttribute('disablepictureinpicture', '');
            v.setAttribute('disableremoteplayback', '');
            v.setAttribute('aria-hidden', 'true');
            v.setAttribute('tabindex', '-1');
            v.poster = sito(c.poster);
            s.appendChild(v);
            var d = el('p', 'vetrina-didascalia');
            d.appendChild(el('span', 'vetrina-chip', 'Video'));
            d.appendChild(document.createTextNode(' ' + c.titolo));
            s.appendChild(d);
            return {
                el: s, titolo: c.titolo, video: v,
                avvia: function () {
                    if (!v.getAttribute('src')) v.src = sito(c.file);
                    try { v.currentTime = 0; } catch (e) { /* non ancora caricato */ }
                    var p = v.play();
                    if (p && typeof p.catch === 'function') p.catch(function () { /* il browser non lo fa partire: resta il poster */ });
                },
                riprendi: function () { var p = v.play(); if (p && p.catch) p.catch(function () {}); },
                ferma: function () { try { v.pause(); } catch (e) { /* niente */ } }
            };
        },
        temi: function () {
            var c = CONTENUTI.temi;
            var s = el('div', 'vetrina-scena vetrina-scena-temi');
            var testa = el('div', 'vetrina-testa vetrina-entra');
            testa.appendChild(el('p', 'vetrina-sopra', c.sopra));
            testa.appendChild(el('p', 'vetrina-titolo', c.titolo));
            s.appendChild(testa);
            // i temi su un'ellisse attorno al centro: la posizione la calcola il CSS
            // (cos/sin dell'angolo --a piu' il giro); --cx/--cy servono ai browser senza cos()/sin()
            var orbita = el('div', 'vetrina-orbita');
            orbita.setAttribute('aria-hidden', 'true');
            c.voci.forEach(function (v, i) {
                var a = i * 360 / c.voci.length - 90;
                var tema = el('div', 'vetrina-tema');
                tema.style.setProperty('--a', a.toFixed(2) + 'deg');
                tema.style.setProperty('--cx', Math.cos(a * Math.PI / 180).toFixed(4));
                tema.style.setProperty('--cy', Math.sin(a * Math.PI / 180).toFixed(4));
                tema.style.setProperty('--i', String(i));
                tema.appendChild(el('span', 'vetrina-tema-etichetta', v[0]));
                orbita.appendChild(tema);
            });
            var centro = el('div', 'vetrina-orbita-centro');
            centro.appendChild(el('b', '', c.centro[0]));
            centro.appendChild(el('small', '', c.centro[1]));
            orbita.appendChild(centro);
            s.appendChild(orbita);
            // per i lettori di schermo: l'elenco dei temi, in ordine
            var lista = el('p', 'vetrina-solo-lettori', 'I temi: ' + c.voci.map(function (v) { return v[0] + ' (' + v[1] + ')'; }).join(', ') + '; al centro la revisione legale.');
            s.appendChild(lista);
            return { el: s, titolo: 'I temi di Next Generation Business' };
        },
        approfondimenti: function () {
            var s = el('div', 'vetrina-scena vetrina-scena-approfondimenti');
            var testa = el('div', 'vetrina-testa vetrina-entra');
            testa.appendChild(el('p', 'vetrina-sopra', 'Dal sito · Approfondimenti & Risorse'));
            testa.appendChild(el('p', 'vetrina-titolo', 'Gli ultimi approfondimenti'));
            s.appendChild(testa);
            var fin = el('div', 'vetrina-schede');
            var lista = el('ul', 'vetrina-schede-dentro');
            // due giri della lista per lo scorrimento continuo; il secondo giro non e' raggiungibile con il tasto Tab
            for (var giro = 0; giro < 2; giro++) {
                CONTENUTI.approfondimenti.forEach(function (a) {
                    var li = el('li', 'vetrina-scheda-voce');
                    var x = link('vetrina-scheda', null, a[3]);
                    var riga = el('span', 'vetrina-scheda-riga');
                    riga.appendChild(el('span', 'vetrina-chip', a[0]));
                    riga.appendChild(el('span', 'vetrina-chip vetrina-chip-scura', a[1]));
                    x.appendChild(riga);
                    x.appendChild(el('span', 'vetrina-scheda-titolo', a[2]));
                    if (giro) { li.setAttribute('aria-hidden', 'true'); x.tabIndex = -1; }
                    li.appendChild(x);
                    lista.appendChild(li);
                });
            }
            fin.appendChild(lista);
            s.appendChild(fin);
            return { el: s, titolo: 'Gli ultimi approfondimenti del sito', durata: SECONDI_APPROFONDIMENTI };
        },
        milano: function () {
            var c = CONTENUTI.milano;
            var s = el('div', 'vetrina-scena vetrina-scena-milano');
            var img = el('img', 'vetrina-volantino');
            img.src = sito(c.immagine);
            img.alt = 'Il save the date di Milano, 26 febbraio 2027';
            img.decoding = 'async';
            img.loading = 'lazy';
            s.appendChild(img);
            var t = el('div', 'vetrina-milano-testo vetrina-entra');
            t.appendChild(el('p', 'vetrina-pillola', c.pillola));
            var data = el('p', 'vetrina-data');
            data.appendChild(el('b', '', c.giorno));
            var mese = el('span', '', c.mese);
            mese.appendChild(el('small', '', c.settimana));
            data.appendChild(mese);
            t.appendChild(data);
            t.appendChild(el('p', 'vetrina-citta', c.citta));
            t.appendChild(el('p', 'vetrina-milano-titolo', c.titolo));
            var voci = el('ul', 'vetrina-voci');
            c.voci.forEach(function (v) { voci.appendChild(el('li', '', v)); });
            t.appendChild(voci);
            t.appendChild(link('vetrina-link', 'Scopri l\'evento', c.pagina));
            s.appendChild(t);
            return { el: s, titolo: 'Il prossimo appuntamento: Milano, 26 febbraio 2027' };
        },
        interviste: function () {
            var c = CONTENUTI.interviste;
            var s = el('div', 'vetrina-scena vetrina-scena-interviste');
            var t = el('div', 'vetrina-testa vetrina-entra');
            t.appendChild(el('p', 'vetrina-sopra', c.sopra));
            t.appendChild(el('p', 'vetrina-titolo', c.titolo));
            var n = el('p', 'vetrina-numero');
            var b = el('b', 'vetrina-conta', String(c.numero));
            b.dataset.fino = String(c.numero);
            n.appendChild(b);
            n.appendChild(el('span', '', ' ' + c.dopo));
            t.appendChild(n);
            s.appendChild(t);
            var play = el('div', 'vetrina-play');
            play.setAttribute('aria-hidden', 'true');
            play.appendChild(icona('riprendi', 'vetrina-play-icona'));
            s.appendChild(play);
            s.appendChild(nastro('vetrina-nastro', c.temi, function (v) { return el('span', 'vetrina-nastro-voce', v); }));
            s.appendChild(el('p', 'vetrina-solo-lettori', 'I temi delle interviste: ' + c.temi.join(', ') + '.'));
            var piede = el('div', 'vetrina-piede vetrina-entra');
            piede.appendChild(link('vetrina-link', 'Guarda le interviste', c.pagina));
            s.appendChild(piede);
            return { el: s, titolo: c.titolo, avvia: function () { conta(b); } };
        },
        sedi: function () {
            var c = CONTENUTI.sedi;
            var s = el('div', 'vetrina-scena vetrina-scena-sedi');
            var img = el('img', 'vetrina-mappa');
            img.src = accanto('vetrina-sedi.svg');
            img.alt = '';
            img.decoding = 'async';
            img.loading = 'lazy';
            s.appendChild(img);
            var t = el('div', 'vetrina-sedi-testo vetrina-entra');
            t.appendChild(el('p', 'vetrina-sopra', c.sopra));
            var n = el('p', 'vetrina-numero vetrina-numero-grande');
            var b = el('b', 'vetrina-conta', String(c.numero));
            b.dataset.fino = String(c.numero);
            n.appendChild(b);
            n.appendChild(el('span', '', ' ' + c.dopo));
            t.appendChild(n);
            t.appendChild(el('p', 'vetrina-sotto', c.sotto));
            s.appendChild(t);
            s.appendChild(nastro('vetrina-nastro vetrina-nastro-citta', c.citta, function (v) { return el('span', 'vetrina-nastro-voce', v); }));
            return { el: s, titolo: c.numero + ' ' + c.dopo, avvia: function () { conta(b); } };
        }
    };

    // le icone (play e pausa)
    function icona(tipo, classe) {
        var NS = 'http://www.w3.org/2000/svg';
        var svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('class', classe || 'vetrina-icona');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        var p = document.createElementNS(NS, 'path');
        p.setAttribute('fill', 'currentColor');
        p.setAttribute('d', tipo === 'riprendi' ? 'M8 5.5v13l10.5-6.5z' : 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z');
        svg.appendChild(p);
        return svg;
    }

    // il conto alla rovescia: «12:34:56», con i giorni se sono di piu'; null se manca l'inizio
    function tempoMancante(inizio, adesso) {
        if (!inizio) return null;
        var resto = inizio - adesso;
        if (resto <= 0) return '';
        var s = Math.floor(resto / 1000);
        var g = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
        var due = function (v) { return (v < 10 ? '0' : '') + v; };
        var orologio = due(h) + ':' + due(m) + ':' + due(x);
        return g ? g + (g === 1 ? ' giorno ' : ' giorni ') + orologio : orologio;
    }

    function crea(contenitore, opzioni) {
        opzioni = opzioni || {};
        var secondi = Number(opzioni.secondiScena) > 0 ? Number(opzioni.secondiScena) : 0;
        var radice = el('div', 'vetrina');
        radice.setAttribute('role', 'region');
        radice.setAttribute('aria-label', 'Mentre aspetti: dal sito Next Generation Business');
        var schermo = el('div', 'vetrina-schermo');
        radice.appendChild(schermo);
        // il conto alla rovescia, nella fascia in cima (quello per i lettori di schermo e' il conto grande della pagina)
        var conto = el('p', 'vetrina-conto');
        conto.setAttribute('aria-hidden', 'true');
        var contoPunto = el('span', 'vetrina-conto-punto');
        var contoTesto = el('span', 'vetrina-conto-testo');
        var contoTempo = el('b', 'vetrina-conto-tempo');
        conto.appendChild(contoPunto);
        conto.appendChild(contoTesto);
        conto.appendChild(contoTempo);
        var barra = el('div', 'vetrina-barra');
        barra.appendChild(el('p', 'vetrina-etichetta', 'Mentre aspetti · dal sito'));
        var punti = el('div', 'vetrina-punti');
        barra.appendChild(punti);
        var pausa = el('button', 'vetrina-pausa');
        pausa.type = 'button';
        barra.appendChild(pausa);
        radice.appendChild(barra);
        contenitore.appendChild(radice);

        var lista = [], firma = '', n = 0, timer = null, giroConto = null;
        var attiva = false, inPausa = false;
        // la scena resta quella finche' il mouse e' sullo schermo o il fuoco e' su un suo link (non sparisce sotto le mani)
        var trattenuta = { mouse: false, fuoco: false };

        function adesso() {
            var f = opzioni.adesso;
            var t = typeof f === 'function' ? Number(f()) : NaN;
            return isFinite(t) ? t : Date.now();
        }
        var statoConto = '';
        function aggiornaConto() {
            var f = opzioni.inizio, inizio = null;
            try { inizio = typeof f === 'function' ? f() : null; } catch (e) { inizio = null; }
            var t = tempoMancante(inizio, adesso());
            conto.hidden = t === null;
            schermo.classList.toggle('vetrina-con-conto', t !== null);
            if (t === null) return;
            var ora = t ? 'prima' : 'ora';
            if (ora !== statoConto) {
                statoConto = ora;
                while (contoTesto.firstChild) contoTesto.removeChild(contoTesto.firstChild);
                if (t) {
                    contoTesto.appendChild(el('span', 'vetrina-conto-lungo', 'La diretta '));
                    contoTesto.appendChild(document.createTextNode('inizia tra'));
                } else contoTesto.textContent = 'La diretta sta per iniziare';
            }
            if (contoTempo.textContent !== t) contoTempo.textContent = t;
            contoTempo.hidden = !t;
            conto.classList.toggle('vetrina-conto-ora', !t);
        }
        function aggiornaPausa() {
            while (pausa.firstChild) pausa.removeChild(pausa.firstChild);
            pausa.appendChild(icona(inPausa ? 'riprendi' : 'pausa'));
            pausa.appendChild(el('span', 'vetrina-pausa-testo', inPausa ? 'Riprendi' : 'Ferma'));
            pausa.setAttribute('aria-label', inPausa ? 'Riprendi la vetrina' : 'Ferma la vetrina');
            radice.classList.toggle('vetrina-ferma', inPausa || !attiva);
        }

        function costruisci(tipi) {
            while (schermo.firstChild) schermo.removeChild(schermo.firstChild);
            while (punti.firstChild) punti.removeChild(punti.firstChild);
            lista = tipi.map(function (t) { var s = DISEGNA[t](); s.tipo = t; return s; });
            lista.forEach(function (s, i) {
                s.el.setAttribute('role', 'group');
                s.el.setAttribute('aria-label', (i + 1) + ' di ' + lista.length + ': ' + s.titolo);
                schermo.appendChild(s.el);
                var b = el('button', 'vetrina-punto');
                b.type = 'button';
                b.setAttribute('aria-label', (i + 1) + ' di ' + lista.length + ': ' + s.titolo);
                b.addEventListener('click', function () { vai(i); });
                punti.appendChild(b);
            });
            schermo.appendChild(conto);
            n = 0;
        }
        function mostraScena(i) {
            lista.forEach(function (s, k) {
                var si = k === i;
                var era = s.el.classList.contains('vetrina-scena-ora');
                s.el.classList.toggle('vetrina-scena-ora', si);
                s.el.setAttribute('aria-hidden', si ? 'false' : 'true');
                s.el.inert = !si;
                if (!si && era && s.ferma) s.ferma();
                if (si && attiva && !inPausa && s.avvia) s.avvia();
            });
            Array.prototype.forEach.call(punti.children, function (b, k) {
                b.classList.toggle('vetrina-punto-ora', k === i);
                if (k === i) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
            });
        }
        function durataMs(s) {
            if (secondi) return secondi * 1000;
            if (s.tipo === 'video') return VIDEO_MAX_S * 1000;
            return (s.durata || SECONDI_SCENA) * 1000;
        }
        function programma() {
            clearTimeout(timer);
            timer = null;
            if (!attiva || inPausa || lista.length < 2 || trattenuta.mouse || trattenuta.fuoco) return;
            timer = setTimeout(avanti, durataMs(lista[n]));
        }
        function vai(i) {
            if (!lista.length) return;
            n = ((i % lista.length) + lista.length) % lista.length;
            mostraScena(n);
            programma();
        }
        function avanti() { vai(n + 1); }

        function mostra(evento) {
            var tipi = scene(evento);
            var f = tipi.join(',');
            var nuova = f !== firma;
            if (nuova) { firma = f; costruisci(tipi); }
            var eraAttiva = attiva;
            attiva = true;
            aggiornaPausa();
            aggiornaConto();
            if (!giroConto) giroConto = setInterval(aggiornaConto, 1000);
            if (nuova || !eraAttiva) vai(n);
        }
        // la vista d'attesa e' chiusa: si ferma tutto (anche il video)
        function ferma() {
            attiva = false;
            clearTimeout(timer); timer = null;
            clearInterval(giroConto); giroConto = null;
            lista.forEach(function (s) { if (s.ferma) s.ferma(); });
            aggiornaPausa();
        }
        function distruggi() { ferma(); if (radice.parentNode) radice.parentNode.removeChild(radice); }

        pausa.addEventListener('click', function () {
            inPausa = !inPausa;
            aggiornaPausa();
            var s = lista[n];
            if (inPausa) { clearTimeout(timer); timer = null; if (s && s.ferma) s.ferma(); }
            else { if (s && s.riprendi) s.riprendi(); else if (s && s.avvia && s.tipo !== 'video') s.avvia(); programma(); }
        });
        schermo.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') { trattenuta.mouse = true; programma(); } });
        schermo.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') { trattenuta.mouse = false; programma(); } });
        schermo.addEventListener('focusin', function () { trattenuta.fuoco = true; programma(); });
        schermo.addEventListener('focusout', function (e) { if (!schermo.contains(e.relatedTarget)) { trattenuta.fuoco = false; programma(); } });
        // il video finito (o che non si carica): la scena dopo
        function dopoIlVideo() { if (attiva && !inPausa && !trattenuta.mouse && !trattenuta.fuoco && lista[n] && lista[n].tipo === 'video') avanti(); }
        schermo.addEventListener('ended', function (e) { if (e.target && e.target.tagName === 'VIDEO') dopoIlVideo(); }, true);
        schermo.addEventListener('error', function (e) { if (e.target && e.target.tagName === 'VIDEO') setTimeout(dopoIlVideo, 1500); }, true);
        aggiornaPausa();
        return {
            mostra: mostra, ferma: ferma, distruggi: distruggi, vai: vai, avanti: avanti,
            scene: function () { return lista.map(function (s) { return s.tipo; }); }
        };
    }

    window.NGBVetrina = { crea: crea, scene: scene, tempoMancante: tempoMancante, SECONDI_SCENA: SECONDI_SCENA };
})();
