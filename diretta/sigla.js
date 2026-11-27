/* ============================================================
   LA SIGLA D'APERTURA: le immagini Revilaw sul webinar, poi il conto alla rovescia
   ------------------------------------------------------------
   Con il video di YouTube (la registrazione che sembra una diretta,
   player-youtube.js) a «Vai in onda» i partecipanti non vedono subito il
   video: nel riquadro del video parte la SIGLA,
     - alcune immagini Revilaw sul webinar, SECONDI_IMMAGINE l'una, in
       dissolvenza;
     - il conto alla rovescia «La diretta inizia tra 10… 1»;
   e poi il video, dal suo punto di partenza. Intanto il video di YouTube
   si carica sotto, fermo all'inizio (opzione inAttesa del player): alla
   fine del conto parte subito, gia' pronto, e non si vede mai YouTube
   mentre si carica.
   Tutti vedono la stessa immagine nello stesso momento: il tempo e'
   quello della diretta (onda dell'evento, lo stesso del video, vedi
   diretta.js, LA REGISTRAZIONE CHE SEMBRA UNA DIRETTA); chi entra durante
   la sigla la vede dal punto giusto, chi entra dopo va diretto al video.
   La durata dipende dalle immagini: durata(evento), la stessa per la
   pagina dei partecipanti e per la Regia (gestione.js), che toglie la
   sigla dal punto della registrazione.

   LE IMMAGINI. Per il webinar del 10 dicembre 2026 (webinar-2026-12-10,
   pagina /webinar_dicembre_2026/) quelle scritte qui sotto, dai testi
   della sua pagina; per gli altri eventi con YouTube, dai dati
   dell'evento (titolo, data, orari, luogo, programma). Il riquadro e'
   fatto con createElement e textContent: niente HTML costruito con i dati.

   MENTRE ASPETTI. Prima della diretta (la vista d'attesa, con ogni tipo
   di video) le stesse immagini girano da sole in uno schermo, SECONDI_GIOSTRA
   l'una (creaGiostra), con il percorso di Next Generation Business e il
   prossimo appuntamento (Milano, 26 febbraio 2027, per gli eventi che
   vengono prima); per il webinar anche «Che cosa porti a casa», «Per chi
   e'» e «Hai una domanda?».
   Sotto lo schermo «Mentre aspetti», un puntino per immagine (si possono
   premere) e «Ferma»/«Riprendi». E «Mettiti alla prova» (creaGioco): tre
   domande sul merito creditizio, il tema di Next Generation Business, con
   le risposte prese dalla pagina del webinar (GIOCO; per il webinar anche
   l'ora in cui se ne parla). Per un evento su un altro tema: GIOCO_PER_TEMA
   qui sotto, o niente gioco (README della diretta, §13.1, «Mentre aspetti»).

   window.NGBSigla = {
     durata(evento)          i secondi della sigla (immagini + conto)
     crea(contenitore)       -> { mostra(evento, t), fine(), nascondi(), distruggi() }
                             mostra: la sigla al secondo t (dall'inizio);
                             fine: l'ultima schermata, finche' il video non
                             si vede; nascondi: via, in dissolvenza
     immaginiAttesa(evento)  le immagini di «Mentre aspetti»
     creaGiostra(contenitore) -> { mostra(evento), ferma(), distruggi(), vai(n), avanti() }
                             le immagini dell'attesa, a rotazione; ferma: il
                             giro si ferma (la vista d'attesa e' chiusa)
     gioco(evento)           le domande di «Mettiti alla prova» ([] se non ci sono)
     creaGioco(elenco, esito) -> { mostra(evento) -> quante domande }
                             le domande nell'elenco (<ol>), il punteggio in
                             esito (role=status)
   }
   ============================================================ */
(function () {
    'use strict';

    var SECONDI_IMMAGINE = 8;
    var SECONDI_CONTO = 10;
    var SECONDI_GIOSTRA = 9;

    // le tappe di Next Generation Business: nome, data da leggere, data
    var TAPPE = [
        ['Verona', '27 marzo 2026', '2026-03-27'],
        ['Roma', '29 aprile 2026', '2026-04-29'],
        ['Napoli', '2 ottobre 2026', '2026-10-02'],
        ['Webinar', '10 dicembre 2026', '2026-12-10'],
        ['Milano', '26 febbraio 2027', '2027-02-26']
    ];
    // l'immagine del percorso: in evidenza la tappa del giorno dell'evento, se e' una di queste
    function percorsoDi(data) {
        return {
            tipo: 'percorso', etichetta: 'Next Generation Business', titolo: 'Per gli imprenditori. Dagli imprenditori.',
            tappe: TAPPE.map(function (t) { return [t[0], t[1], t[2] === data]; })
        };
    }

    // il prossimo appuntamento (la sua pagina, /milano_febbraio_2027/): nell'attesa degli eventi che vengono prima
    var MILANO = {
        data: '2027-02-26',
        immagine: {
            tipo: 'titolo', etichetta: 'Il prossimo appuntamento · Milano, venerdì 26 febbraio 2027',
            titolo: 'Merito creditizio, crescita e competitività delle imprese.',
            sottotitolo: 'Excelsior Hotel Gallia: al mattino il convegno, al pomeriggio gli incontri B2B one-to-one. Gratuito, in presenza.'
        }
    };
    function prossimoDopo(data) {
        var d = String(data || '');
        return !/^\d{4}-\d{2}-\d{2}$/.test(d) || d < MILANO.data ? [MILANO.immagine] : [];
    }

    // il webinar del 10 dicembre 2026: i testi della sua pagina (/webinar_dicembre_2026/)
    var WEBINAR_DICEMBRE = {
        eventi: ['webinar-2026-12-10'],
        data: '2026-12-10',
        pagine: ['/webinar_dicembre_2026/'],
        immagini: [
            { tipo: 'apertura', sopra: 'Revilaw presenta', titolo: 'Next Generation Business', sotto: 'Webinar · Giovedì 10 dicembre 2026' },
            {
                tipo: 'titolo', etichetta: 'Webinar · 10 dicembre 2026 · 15.00 – 17.00',
                titolo: 'Come migliorare il merito creditizio.',
                sottotitolo: 'Il ruolo del bilancio, della revisione legale e degli adeguati assetti'
            },
            {
                tipo: 'elenco', etichetta: 'Il programma', titolo: 'Un dialogo in tre domande',
                voci: [
                    ['01', '15.00', 'Perché un\'impresa sana può incontrare difficoltà nell\'accesso al credito?'],
                    ['02', '15.35', 'In che modo un bilancio sottoposto a revisione rafforza la credibilità dell\'impresa?'],
                    ['03', '16.35', 'Le vostre domande, e il passo successivo']
                ]
            },
            percorsoDi('2026-12-10')
        ],
        // in piu', mentre si aspetta la diretta
        attesa: [
            {
                tipo: 'elenco', etichetta: 'Che cosa porti a casa', titolo: 'Quattro risposte pratiche',
                voci: [
                    ['01', '', 'Quali documenti preparare prima di incontrare una banca, e quali carenze correggere'],
                    ['02', '', 'Che cosa cambia per la banca quando il bilancio è revisionato, e che cosa non cambia'],
                    ['03', '', 'Quali domande rivolgere al revisore e all\'organo di controllo'],
                    ['04', '', 'Come prepararsi alla scadenza dell\'incarico di revisione']
                ]
            },
            {
                tipo: 'titolo', etichetta: 'Per chi è', titolo: 'Per chi tratta con le banche.',
                sottotitolo: 'Imprenditori, amministratori e direttori finanziari; responsabili amministrativi; commercialisti, revisori e sindaci che affiancano le imprese.'
            },
            {
                tipo: 'titolo', etichetta: 'Hai una domanda?', titolo: 'Scrivila a info@nextgenerationbusiness.it',
                sottotitolo: 'Prima e durante la diretta: i relatori rispondono nella parte finale, dalle 16.35.'
            }
        ],
        // in «Mettiti alla prova» anche l'ora in cui se ne parla (il suo programma)
        orariGioco: true
    };
    var SPECIALI = [WEBINAR_DICEMBRE];

    /* «Mettiti alla prova»: tre domande sul merito creditizio, il tema di
       Next Generation Business; le risposte sono quelle della pagina del
       webinar (con l'ora del suo programma in cui se ne parla). */
    var GIOCO = [
        {
            domanda: 'L\'azienda è in utile: la banca può comunque essere prudente?',
            scelte: ['Sì', 'No'], giusta: 0, ora: '15.15',
            spiegazione: 'Sì: oltre al bilancio la banca guarda la Centrale dei rischi e i flussi di cassa prospettici.'
        },
        {
            domanda: 'Un bilancio sottoposto a revisione garantisce un finanziamento?',
            scelte: ['Sì', 'No'], giusta: 1, ora: '15.35',
            spiegazione: 'No: rafforza l\'affidabilità dell\'informazione e la credibilità dell\'impresa verso le banche, senza promettere di per sé finanziamenti o condizioni migliori.'
        },
        {
            domanda: 'Che cosa rende i numeri dell\'impresa affidabili e tempestivi, prima ancora che qualcuno li verifichi?',
            scelte: ['La revisione legale', 'Gli adeguati assetti organizzativi, amministrativi e contabili', 'La Centrale dei rischi'], giusta: 1, ora: '15.55',
            spiegazione: 'Gli adeguati assetti organizzativi, amministrativi e contabili: sono la base di numeri affidabili.'
        }
    ];
    /* Per un evento su un altro tema: le sue domande qui, con l'identificativo
       dell'evento ({ 'id-evento': [ { domanda, scelte, giusta, spiegazione } ] };
       [] per non avere il gioco). */
    var GIOCO_PER_TEMA = {};

    var GIORNI = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
    var MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
    function ora(hhmm) {
        var m = /^(\d{1,2})[:.](\d{2})$/.exec(String(hhmm || '').trim());
        return m ? Number(m[1]) + '.' + m[2] : '';
    }
    // "Giovedì 10 dicembre 2026 · 15.00 – 17.00" dai campi dell'evento
    function quando(ev) {
        var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ev.data || ''));
        var parti = [];
        if (m) {
            var g = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
            parti.push(GIORNI[g.getUTCDay()] + ' ' + (+m[3]) + ' ' + MESI[+m[2] - 1] + ' ' + m[1]);
        }
        var oi = ora(ev.oraInizio), of = ora(ev.oraFine);
        if (oi) parti.push(of ? oi + ' – ' + of : oi);
        return parti.join(' · ');
    }
    function percorso(p) { return String(p || '').trim().toLowerCase().replace(/\/?$/, '/'); }

    // i testi scritti qui per l'evento (il webinar), o null
    function speciale(evento) {
        var ev = evento || {};
        var id = String(ev.id || ev.idEvento || '');
        var pagina = ev.paginaEvento ? percorso(ev.paginaEvento) : '';
        for (var i = 0; i < SPECIALI.length; i++) {
            var s = SPECIALI[i];
            if ((id && s.eventi.indexOf(id) >= 0) || (pagina && s.pagine.indexOf(pagina) >= 0)) return s;
        }
        return null;
    }
    // le immagini dell'evento: quelle scritte qui (il webinar), altrimenti dai suoi dati
    function immagini(evento) {
        var ev = evento || {};
        var sp = speciale(ev);
        if (sp) return sp.immagini;
        var q = quando(ev);
        var out = [{ tipo: 'apertura', sopra: 'Revilaw presenta', titolo: 'Next Generation Business', sotto: q }];
        out.push({ tipo: 'titolo', etichetta: q, titolo: String(ev.titolo || 'La diretta').trim().slice(0, 140), sottotitolo: String(ev.luogo || '').trim().slice(0, 140) });
        var voci = (Array.isArray(ev.programma) ? ev.programma : []).filter(function (v) { return v && v.titolo; }).slice(0, 5);
        if (voci.length) {
            out.push({
                tipo: 'elenco', etichetta: q, titolo: 'Il programma',
                voci: voci.map(function (v, n) { return [(n < 9 ? '0' : '') + (n + 1), String(v.ora || ''), String(v.titolo).slice(0, 160)]; })
            });
        }
        return out;
    }
    function durata(evento) { return immagini(evento).length * SECONDI_IMMAGINE + SECONDI_CONTO; }
    // mentre si aspetta: le immagini della sigla e, per il webinar, quelle in piu'; per gli altri eventi il percorso
    function immaginiAttesa(evento) {
        var ev = evento || {};
        var sp = speciale(ev);
        if (sp) return sp.immagini.concat(sp.attesa || [], prossimoDopo(sp.data));
        return immagini(ev).concat([percorsoDi(String(ev.data || ''))], prossimoDopo(ev.data));
    }
    function gioco(evento) {
        var ev = evento || {};
        var id = String(ev.id || ev.idEvento || '');
        if (id && Object.prototype.hasOwnProperty.call(GIOCO_PER_TEMA, id)) return GIOCO_PER_TEMA[id].slice();
        var sp = speciale(ev);
        return GIOCO.map(function (g) {
            return {
                domanda: g.domanda, scelte: g.scelte.slice(), giusta: g.giusta,
                spiegazione: g.spiegazione + (sp && sp.orariGioco && g.ora ? ' Se ne parla alle ' + g.ora + '.' : '')
            };
        });
    }

    /* ---------- il disegno ---------- */
    function el(tag, classe, testo) {
        var e = document.createElement(tag);
        if (classe) e.className = classe;
        if (testo != null) e.textContent = testo;
        return e;
    }
    // il logo bianco: lo stesso della testata della pagina (che sa da dove caricarlo)
    function logo() {
        var t = document.querySelector('.testata-marchio img, img[src*="logo-revilaw-bianco"]');
        var img = el('img', 'sigla-logo');
        img.alt = 'Revilaw';
        img.src = t ? t.src : '/assets/logo-revilaw-bianco.png';
        return img;
    }
    function disegnaImmagine(d) {
        var f = el('div', 'sigla-immagine sigla-tipo-' + d.tipo);
        if (d.tipo === 'apertura') {
            f.appendChild(logo());
            f.appendChild(el('p', 'sigla-sopra', d.sopra));
            f.appendChild(el('p', 'sigla-titolo-grande', d.titolo));
            if (d.sotto) f.appendChild(el('p', 'sigla-sotto', d.sotto));
            return f;
        }
        if (d.etichetta) f.appendChild(el('p', 'sigla-etichetta', d.etichetta));
        f.appendChild(el('p', 'sigla-titolo', d.titolo));
        if (d.tipo === 'titolo' && d.sottotitolo) f.appendChild(el('p', 'sigla-sottotitolo', d.sottotitolo));
        if (d.tipo === 'elenco') {
            var ol = el('ol', 'sigla-voci');
            d.voci.forEach(function (v) {
                var li = el('li', 'sigla-voce');
                li.appendChild(el('span', 'sigla-numero', v[0]));
                var testo = el('span', 'sigla-voce-testo');
                if (v[1]) testo.appendChild(el('span', 'sigla-ora', v[1]));
                testo.appendChild(el('span', 'sigla-domanda', v[2]));
                li.appendChild(testo);
                ol.appendChild(li);
            });
            f.appendChild(ol);
        }
        if (d.tipo === 'percorso') {
            var ul = el('ol', 'sigla-tappe');
            d.tappe.forEach(function (t) {
                var li = el('li', 'sigla-tappa' + (t[2] ? ' sigla-tappa-oggi' : ''));
                li.appendChild(el('span', 'sigla-tappa-punto'));
                li.appendChild(el('span', 'sigla-tappa-nome', t[0]));
                li.appendChild(el('span', 'sigla-tappa-data', t[1]));
                ul.appendChild(li);
            });
            f.appendChild(ul);
        }
        // la firma in basso, come nelle grafiche della diretta
        var firma = el('div', 'sigla-firma');
        firma.appendChild(logo());
        firma.appendChild(el('span', 'sigla-firma-testo', 'Next Generation Business'));
        f.appendChild(firma);
        return f;
    }

    function crea(contenitore) {
        var radice = el('div', 'sigla');
        radice.hidden = true;
        radice.setAttribute('role', 'img');
        radice.setAttribute('aria-label', 'Sigla d\'apertura della diretta');
        var palco = el('div', 'sigla-palco');
        radice.appendChild(palco);
        // il conto alla rovescia: un anello che si svuota e il numero
        var conto = el('div', 'sigla-conto');
        conto.hidden = true;
        conto.appendChild(el('p', 'sigla-conto-titolo', 'La diretta inizia tra'));
        var anello = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        anello.setAttribute('viewBox', '0 0 120 120');
        anello.setAttribute('class', 'sigla-anello');
        anello.setAttribute('aria-hidden', 'true');
        var fondo = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        fondo.setAttribute('cx', '60'); fondo.setAttribute('cy', '60'); fondo.setAttribute('r', '52');
        fondo.setAttribute('class', 'sigla-anello-fondo');
        var arco = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        arco.setAttribute('cx', '60'); arco.setAttribute('cy', '60'); arco.setAttribute('r', '52');
        arco.setAttribute('class', 'sigla-anello-arco');
        anello.appendChild(fondo);
        anello.appendChild(arco);
        var numero = el('span', 'sigla-conto-numero', '');
        var cerchio = el('div', 'sigla-conto-cerchio');
        cerchio.appendChild(anello);
        cerchio.appendChild(numero);
        conto.appendChild(cerchio);
        conto.appendChild(logo());
        radice.appendChild(conto);
        contenitore.appendChild(radice);

        var mostrata = -1;          // l'immagine sullo schermo (-1 nessuna, -2 il conto)
        var firmaEvento = '';
        var timerVia = null;
        var LUNGHEZZA_ARCO = 2 * Math.PI * 52;
        arco.style.strokeDasharray = String(LUNGHEZZA_ARCO);

        function mostra(evento, t) {
            clearTimeout(timerVia);
            radice.classList.remove('sigla-via');
            radice.hidden = false;
            var lista = immagini(evento);
            var f = JSON.stringify(lista);
            if (f !== firmaEvento) { firmaEvento = f; mostrata = -1; }
            var secondi = Math.max(0, Number(t) || 0);
            var n = Math.floor(secondi / SECONDI_IMMAGINE);
            if (n < lista.length) {
                if (n !== mostrata) {
                    mostrata = n;
                    conto.hidden = true;
                    while (palco.firstChild) palco.removeChild(palco.firstChild);
                    palco.appendChild(disegnaImmagine(lista[n]));
                    palco.hidden = false;
                }
                return;
            }
            // il conto alla rovescia
            var resto = Math.max(0, lista.length * SECONDI_IMMAGINE + SECONDI_CONTO - secondi);
            if (mostrata !== -2) {
                mostrata = -2;
                palco.hidden = true;
                conto.hidden = false;
            }
            var cifra = Math.max(1, Math.ceil(resto));
            if (numero.textContent !== String(cifra)) numero.textContent = String(cifra);
            arco.style.strokeDashoffset = String(LUNGHEZZA_ARCO * (1 - resto / SECONDI_CONTO));
            conto.classList.toggle('sigla-conto-finito', resto <= 0);
        }
        // finito il conto, finche' il video non si vede: il logo e l'anello pieno, senza numero
        function fine() {
            clearTimeout(timerVia);
            radice.hidden = false;
            palco.hidden = true;
            conto.hidden = false;
            mostrata = -2;
            numero.textContent = '';
            arco.style.strokeDashoffset = String(LUNGHEZZA_ARCO);
            conto.classList.add('sigla-conto-finito');
        }
        function nascondi() {
            if (radice.hidden || radice.classList.contains('sigla-via')) return;
            radice.classList.add('sigla-via');
            clearTimeout(timerVia);
            timerVia = setTimeout(function () { radice.hidden = true; radice.classList.remove('sigla-via'); mostrata = -1; }, 700);
        }
        function distruggi() {
            clearTimeout(timerVia);
            if (radice.parentNode) radice.parentNode.removeChild(radice);
        }
        return { mostra: mostra, fine: fine, nascondi: nascondi, distruggi: distruggi, visibile: function () { return !radice.hidden; } };
    }

    // le icone dei pulsanti della giostra (Ferma / Riprendi)
    function icona(tipo) {
        var NS = 'http://www.w3.org/2000/svg';
        var svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('class', 'giostra-icona');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        var p = document.createElementNS(NS, 'path');
        p.setAttribute('fill', 'currentColor');
        p.setAttribute('d', tipo === 'riprendi' ? 'M8 5.5v13l10.5-6.5z' : 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z');
        svg.appendChild(p);
        return svg;
    }

    /* MENTRE ASPETTI: le immagini a rotazione nello schermo dell'attesa,
       SECONDI_GIOSTRA l'una. Sotto lo schermo la barra: «Mentre aspetti», un
       puntino per immagine (premuto, va a quell'immagine e il tempo riparte
       da li') e «Ferma»/«Riprendi» (le immagini che si muovono da sole si
       devono poter fermare). ferma(): il giro si ferma (vista chiusa); il
       prossimo mostra() lo fa ripartire, se non e' stato premuto «Ferma». */
    function creaGiostra(contenitore) {
        var radice = el('div', 'giostra');
        radice.setAttribute('role', 'region');
        radice.setAttribute('aria-label', 'Mentre aspetti');
        var schermo = el('div', 'giostra-schermo');
        var fondo = el('div', 'giostra-fondo');
        var palco = el('div', 'sigla-palco');
        fondo.appendChild(palco);
        schermo.appendChild(fondo);
        radice.appendChild(schermo);
        var barra = el('div', 'giostra-barra');
        barra.appendChild(el('p', 'giostra-etichetta', 'Mentre aspetti'));
        var punti = el('div', 'giostra-punti');
        barra.appendChild(punti);
        var pausa = el('button', 'giostra-pausa');
        pausa.type = 'button';
        barra.appendChild(pausa);
        radice.appendChild(barra);
        contenitore.appendChild(radice);

        var lista = [], firma = '', n = 0, timer = null;
        var attiva = false;     // la vista d'attesa e' aperta
        var inPausa = false;    // premuto «Ferma»

        function aggiornaPausa() {
            while (pausa.firstChild) pausa.removeChild(pausa.firstChild);
            pausa.appendChild(icona(inPausa ? 'riprendi' : 'pausa'));
            pausa.appendChild(el('span', 'giostra-pausa-testo', inPausa ? 'Riprendi' : 'Ferma'));
            pausa.setAttribute('aria-label', inPausa ? 'Riprendi le immagini' : 'Ferma le immagini');
        }
        function disegna() {
            while (palco.firstChild) palco.removeChild(palco.firstChild);
            if (lista[n]) {
                var f = disegnaImmagine(lista[n]);
                f.setAttribute('role', 'group');
                f.setAttribute('aria-label', 'Immagine ' + (n + 1) + ' di ' + lista.length);
                palco.appendChild(f);
            }
            Array.prototype.forEach.call(punti.children, function (b, i) {
                b.classList.toggle('giostra-punto-ora', i === n);
                if (i === n) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
            });
        }
        function preparaPunti() {
            while (punti.firstChild) punti.removeChild(punti.firstChild);
            lista.forEach(function (x, i) {
                var b = el('button', 'giostra-punto');
                b.type = 'button';
                b.setAttribute('aria-label', 'Immagine ' + (i + 1) + ' di ' + lista.length);
                b.addEventListener('click', function () { vai(i); });
                punti.appendChild(b);
            });
            var piu = lista.length > 1;
            punti.hidden = !piu;
            pausa.hidden = !piu;
        }
        function gira() {
            var deve = attiva && !inPausa && lista.length > 1;
            if (deve && !timer) timer = setInterval(avanti, SECONDI_GIOSTRA * 1000);
            if (!deve && timer) { clearInterval(timer); timer = null; }
        }
        function vai(i) {
            if (!lista.length) return;
            n = ((i % lista.length) + lista.length) % lista.length;
            disegna();
            // il tempo dell'immagine riparte da qui
            if (timer) { clearInterval(timer); timer = null; }
            gira();
        }
        function avanti() { vai(n + 1); }
        function mostra(evento) {
            var l = immaginiAttesa(evento);
            var f = JSON.stringify(l);
            if (f !== firma) { firma = f; lista = l; n = 0; preparaPunti(); disegna(); }
            attiva = true;
            gira();
        }
        function ferma() { attiva = false; gira(); }
        function distruggi() { ferma(); if (radice.parentNode) radice.parentNode.removeChild(radice); }
        pausa.addEventListener('click', function () { inPausa = !inPausa; aggiornaPausa(); gira(); });
        aggiornaPausa();
        return { mostra: mostra, ferma: ferma, distruggi: distruggi, vai: vai, avanti: avanti };
    }

    /* «METTITI ALLA PROVA»: le domande di gioco(evento) nell'elenco, ognuna
       con le sue risposte (pulsanti). Alla risposta: la giusta in verde, la
       tua se e' sbagliata in rosso, e la spiegazione; in esito (role=status)
       quante giuste finora; finite le domande, «Ricomincia». Niente di
       salvato: ricaricando la pagina si ricomincia. */
    function creaGioco(elenco, esito) {
        var firma = '', domande = [], risposte = [];
        var ricomincia = el('button', 'gioco-ricomincia', 'Ricomincia');
        ricomincia.type = 'button';
        ricomincia.hidden = true;
        if (esito.parentNode) esito.parentNode.insertBefore(ricomincia, esito.nextSibling);

        function scrivi(t) { if (esito.textContent !== t) esito.textContent = t; }
        function conta() {
            var date = 0, giuste = 0;
            risposte.forEach(function (r, i) { if (r != null) { date++; if (r === domande[i].giusta) giuste++; } });
            return { date: date, giuste: giuste };
        }
        function disegna() {
            risposte = domande.map(function () { return null; });
            while (elenco.firstChild) elenco.removeChild(elenco.firstChild);
            domande.forEach(function (d, i) {
                var li = el('li', 'gioco-domanda');
                var t = el('p', 'gioco-testo', d.domanda);
                t.id = 'gioco-domanda-' + (i + 1);
                li.appendChild(t);
                var scelte = el('div', 'gioco-scelte' + (d.scelte.length > 2 ? ' gioco-scelte-colonna' : ''));
                scelte.setAttribute('role', 'group');
                scelte.setAttribute('aria-labelledby', t.id);
                var spiegazione = el('p', 'gioco-spiegazione');
                spiegazione.hidden = true;
                d.scelte.forEach(function (testoScelta, j) {
                    var b = el('button', 'gioco-scelta', testoScelta);
                    b.type = 'button';
                    b.addEventListener('click', function () { rispondi(i, j, li, scelte, spiegazione); });
                    scelte.appendChild(b);
                });
                li.appendChild(scelte);
                li.appendChild(spiegazione);
                elenco.appendChild(li);
            });
            ricomincia.hidden = true;
            scrivi('');
        }
        function rispondi(i, j, li, scelte, spiegazione) {
            if (risposte[i] != null) return;
            risposte[i] = j;
            var d = domande[i];
            var giusta = j === d.giusta;
            Array.prototype.forEach.call(scelte.children, function (b, k) {
                b.setAttribute('aria-disabled', 'true');
                if (k === d.giusta) b.classList.add('gioco-scelta-giusta');
                if (k === j) b.classList.add(giusta ? 'gioco-scelta-tua' : 'gioco-scelta-sbagliata');
            });
            li.classList.add(giusta ? 'gioco-risposta-giusta' : 'gioco-risposta-sbagliata');
            while (spiegazione.firstChild) spiegazione.removeChild(spiegazione.firstChild);
            spiegazione.appendChild(el('strong', 'gioco-verdetto', giusta ? 'Giusto. ' : 'Non proprio. '));
            spiegazione.appendChild(document.createTextNode(d.spiegazione));
            spiegazione.hidden = false;
            var c = conta();
            var verdetto = giusta ? 'Giusto.' : 'Non proprio: la risposta è «' + d.scelte[d.giusta] + '».';
            if (c.date < domande.length) {
                scrivi(verdetto + ' Risposte giuste: ' + c.giuste + ' su ' + c.date + '.');
                return;
            }
            scrivi(verdetto + ' Hai finito: ' + (c.giuste === domande.length ? 'tutte giuste, complimenti!' : c.giuste + ' risposte giuste su ' + domande.length + '.')
                + ' Se ne parla nella diretta.');
            ricomincia.hidden = false;
        }
        ricomincia.addEventListener('click', function () {
            disegna();
            var primo = elenco.querySelector('.gioco-scelta');
            if (primo) { try { primo.focus({ preventScroll: true }); } catch (e) { primo.focus(); } }
        });
        function mostra(evento) {
            var l = gioco(evento).filter(function (d) {
                return d && d.domanda && Array.isArray(d.scelte) && d.scelte.length > 1 && d.giusta >= 0 && d.giusta < d.scelte.length;
            });
            var f = JSON.stringify(l);
            if (f !== firma) { firma = f; domande = l; disegna(); }
            return domande.length;
        }
        return { mostra: mostra };
    }

    window.NGBSigla = {
        durata: durata, immagini: immagini, immaginiAttesa: immaginiAttesa, gioco: gioco,
        crea: crea, creaGiostra: creaGiostra, creaGioco: creaGioco,
        SECONDI_IMMAGINE: SECONDI_IMMAGINE, SECONDI_CONTO: SECONDI_CONTO, SECONDI_GIOSTRA: SECONDI_GIOSTRA
    };
})();
