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

   window.NGBSigla = {
     durata(evento)          i secondi della sigla (immagini + conto)
     crea(contenitore)       -> { mostra(evento, t), fine(), nascondi(), distruggi() }
                             mostra: la sigla al secondo t (dall'inizio);
                             fine: l'ultima schermata, finche' il video non
                             si vede; nascondi: via, in dissolvenza
   }
   ============================================================ */
(function () {
    'use strict';

    var SECONDI_IMMAGINE = 8;
    var SECONDI_CONTO = 10;

    // il webinar del 10 dicembre 2026: i testi della sua pagina (/webinar_dicembre_2026/)
    var WEBINAR_DICEMBRE = {
        eventi: ['webinar-2026-12-10'],
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
            {
                tipo: 'percorso', etichetta: 'Next Generation Business', titolo: 'Per gli imprenditori. Dagli imprenditori.',
                tappe: [['Verona', '27 marzo 2026'], ['Roma', '29 aprile 2026'], ['Napoli', '2 ottobre 2026'], ['Webinar', '10 dicembre 2026', true], ['Milano', '26 febbraio 2027']]
            }
        ]
    };
    var SPECIALI = [WEBINAR_DICEMBRE];

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

    // le immagini dell'evento: quelle scritte qui (il webinar), altrimenti dai suoi dati
    function immagini(evento) {
        var ev = evento || {};
        var id = String(ev.id || ev.idEvento || '');
        var pagina = ev.paginaEvento ? percorso(ev.paginaEvento) : '';
        for (var i = 0; i < SPECIALI.length; i++) {
            var s = SPECIALI[i];
            if ((id && s.eventi.indexOf(id) >= 0) || (pagina && s.pagine.indexOf(pagina) >= 0)) return s.immagini;
        }
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

    window.NGBSigla = { durata: durata, immagini: immagini, crea: crea, SECONDI_IMMAGINE: SECONDI_IMMAGINE, SECONDI_CONTO: SECONDI_CONTO };
})();
