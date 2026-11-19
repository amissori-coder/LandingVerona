/* ========================
   AREA BANDI
   L'elenco dei bandi con la ricerca per regione, per tipologia di
   agevolazione e per finalita', la scheda di ogni bando e il modulo
   "Richiedi informazioni".

   I bandi stanno in dati.js (window.NGB_BANDI): questa pagina non ne
   contiene nessuno. Da li' si ricavano anche le voci dei filtri, con
   accanto quanti bandi hanno, e l'elenco "Bando di interesse" del
   modulo: aggiunto un bando la', qui compare dappertutto.

   LO STATO di un bando (in apertura, aperto, in scadenza, chiuso) si
   calcola dalle date, sul giorno italiano di oggi: nessuno deve
   ricordarsi di spostare a mano un bando scaduto.

   L'INDIRIZZO segue quello che si guarda: i filtri stanno nella
   ricerca (?regione=lazio&tipologia=voucher), la scheda aperta
   nell'ancora (#mimit-brevetti-piu). Un collegamento copiato riapre
   la stessa vista.

   IL MODULO va al servizio email con l'azione "richiesta-bando"
   (email-service/lib/richieste-bandi.js): li' si salva e parte la mail
   a chi segue i bandi, piu' una ricevuta a chi ha scritto. Niente
   campo "pagina" nel corpo: una richiesta non e' un'iscrizione.

   LA NEWSLETTER DEI BANDI (il riquadro "I nuovi bandi, appena escono")
   va allo stesso servizio con l'azione "bandi-newsletter"
   (email-service/lib/newsletter-bandi.js): iscrizione in attesa e mail
   con il pulsante di conferma. I due moduli hanno ciascuno la sua
   casella "non sono un robot", con la sua azione.
   (text/plain evita la richiesta di verifica preliminare del browser.)
   ======================== */
(function () {
    'use strict';

    var D = window.NGB_BANDI;
    if (!D || !D.BANDI) return;
    var $ = function (id) { return document.getElementById(id); };
    var NAZIONALE = 'Nazionale';
    var GIORNI_SCADENZA = 15;   // "in scadenza" negli ultimi 15 giorni

    // ---------- piccoli attrezzi ----------
    function crea(tag, classe, testo) {
        var el = document.createElement(tag);
        if (classe) el.className = classe;
        if (testo != null) el.textContent = testo;
        return el;
    }
    // "Emilia-Romagna" -> "emilia-romagna": la forma delle regioni nell'indirizzo
    function chiave(s) {
        return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }
    // per la ricerca libera: minuscole senza accenti
    function piatto(s) {
        return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    }
    var MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
    function dataEstesa(iso) {
        var p = String(iso || '').split('-');
        if (p.length !== 3) return '';
        return Number(p[2]) + ' ' + MESI[Number(p[1]) - 1] + ' ' + p[0];
    }
    // il giorno di oggi in Italia, 'AAAA-MM-GG'
    function oggiItaliano() {
        try {
            return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        } catch (_) {
            return new Date().toISOString().slice(0, 10);
        }
    }
    function giorniFra(da, a) {
        return Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(da + 'T00:00:00Z')) / 86400000);
    }

    // ---------- lo stato, dalle date ----------
    var OGGI = oggiItaliano();
    var STATI = {
        'in-scadenza': { ordine: 0 },
        'in-apertura': { ordine: 1 },
        'aperto': { ordine: 2 },
        'chiuso': { ordine: 3 }
    };
    function statoDi(b) {
        if (b.chiusura && b.chiusura < OGGI) return { id: 'chiuso', testo: 'Chiuso il ' + dataEstesa(b.chiusura) };
        if (b.apertura && b.apertura > OGGI) return { id: 'in-apertura', testo: 'Apre il ' + dataEstesa(b.apertura) };
        if (b.chiusura && giorniFra(OGGI, b.chiusura) <= GIORNI_SCADENZA) {
            var g = giorniFra(OGGI, b.chiusura);
            return { id: 'in-scadenza', testo: g === 0 ? 'Scade oggi' : (g === 1 ? 'Scade domani' : 'Scade fra ' + g + ' giorni') };
        }
        return { id: 'aperto', testo: 'Aperto' };
    }

    var BANDI = D.BANDI.map(function (b) {
        var stato = statoDi(b);
        var testoSezioni = (b.sezioni || []).map(function (s) {
            return [s.t].concat(s.p || [], s.l || []).join(' ');
        }).join(' ');
        return {
            b: b, stato: stato, regioneChiave: chiave(b.regione),
            nazionale: b.regione === NAZIONALE,
            // tutto il testo in cui cerca la parola chiave
            pagliaio: piatto([b.titolo, b.ente, b.regione, b.beneficiari, b.importo, b.sintesi, b.scadenza,
                (b.tipologie || []).map(function (t) { return D.TIPOLOGIE[t] || t; }).join(' '),
                (b.finalita || []).map(function (f) { return D.FINALITA[f] || f; }).join(' '),
                b.revisore ? 'certificazione del revisore legale ' + (b.revisore === true ? '' : b.revisore) : '',
                testoSezioni].join(' '))
        };
    });
    /* L'ordine dell'elenco: prima quello che scade, poi quello che sta per
       aprire, poi il resto; i chiusi in fondo. A parita', per data e per nome. */
    BANDI.sort(function (x, y) {
        var o = STATI[x.stato.id].ordine - STATI[y.stato.id].ordine;
        if (o) return o;
        var dx = (x.stato.id === 'in-apertura' ? x.b.apertura : x.b.chiusura) || '9999';
        var dy = (y.stato.id === 'in-apertura' ? y.b.apertura : y.b.chiusura) || '9999';
        if (dx !== dy) return dx < dy ? -1 : 1;
        return x.b.titolo.localeCompare(y.b.titolo, 'it');
    });
    var PER_ID = {};
    BANDI.forEach(function (x) { PER_ID[x.b.id] = x; });

    // ---------- i filtri ----------
    var filtri = $('filtri');
    var campoCerca = $('cerca');
    var campoRegione = $('regione');
    var campoTipologia = $('tipologia');
    var campoFinalita = $('finalita');
    var campoNazionali = $('nazionali');
    var campoChiusi = $('chiusi');
    var campoRevisore = $('revisore');
    var spuntaRevisore = $('spuntaRevisore');
    var spuntaNazionali = $('spuntaNazionali');
    var griglia = $('griglia');
    var conta = $('conta');
    var vuoto = $('vuoto');

    function opzione(valore, testo) {
        var o = document.createElement('option');
        o.value = valore;
        o.textContent = testo;
        return o;
    }
    // le regioni: prima i nazionali, poi le regioni che hanno almeno un bando, in ordine alfabetico
    (function () {
        var quanti = {}, nomi = {};
        BANDI.forEach(function (x) {
            quanti[x.regioneChiave] = (quanti[x.regioneChiave] || 0) + 1;
            nomi[x.regioneChiave] = x.b.regione;
        });
        var kNaz = chiave(NAZIONALE);
        if (quanti[kNaz]) campoRegione.appendChild(opzione(kNaz, 'Nazionali, tutta Italia (' + quanti[kNaz] + ')'));
        Object.keys(nomi).filter(function (k) { return k !== kNaz; })
            .sort(function (a, b) { return nomi[a].localeCompare(nomi[b], 'it'); })
            .forEach(function (k) { campoRegione.appendChild(opzione(k, nomi[k] + ' (' + quanti[k] + ')')); });
    })();
    // tipologie e finalita': solo le voci usate da almeno un bando, nell'ordine di dati.js
    function riempi(campo, elenco, proprieta) {
        Object.keys(elenco).forEach(function (k) {
            var n = BANDI.filter(function (x) { return (x.b[proprieta] || []).indexOf(k) >= 0; }).length;
            if (n) campo.appendChild(opzione(k, elenco[k] + ' (' + n + ')'));
        });
    }
    // la spunta "certificazione del revisore" c'e' solo se almeno un bando la chiede
    spuntaRevisore.hidden = !BANDI.some(function (x) { return !!x.b.revisore; });
    riempi(campoTipologia, D.TIPOLOGIE, 'tipologie');
    riempi(campoFinalita, D.FINALITA, 'finalita');

    function ha(campo, valore) {
        return Array.prototype.some.call(campo.options, function (o) { return o.value === valore; });
    }
    function statoFiltri() {
        return {
            q: campoCerca.value.trim(),
            regione: campoRegione.value,
            tipologia: campoTipologia.value,
            finalita: campoFinalita.value,
            nazionali: campoNazionali.checked,
            chiusi: campoChiusi.checked,
            revisore: campoRevisore.checked
        };
    }
    function passa(x, f) {
        if (!f.chiusi && x.stato.id === 'chiuso') return false;
        if (f.revisore && !x.b.revisore) return false;
        if (f.regione) {
            var stessa = x.regioneChiave === f.regione;
            /* Scelta una regione, i bandi nazionali valgono anche li': restano
               in elenco finche' la spunta non li toglie. */
            var ancheNazionale = x.nazionale && f.nazionali && f.regione !== chiave(NAZIONALE);
            if (!stessa && !ancheNazionale) return false;
        }
        if (f.tipologia && (x.b.tipologie || []).indexOf(f.tipologia) < 0) return false;
        if (f.finalita && (x.b.finalita || []).indexOf(f.finalita) < 0) return false;
        if (f.q) {
            /* Tutte le parole devono esserci. Di una parola lunga non conta
               l'ultima vocale: "fotovoltaico" trova "fotovoltaici", "fiera"
               trova "fiere". */
            var parole = piatto(f.q).split(/\s+/).filter(Boolean);
            for (var i = 0; i < parole.length; i++) {
                var w = parole[i].length > 4 ? parole[i].replace(/[aeiou]$/, '') : parole[i];
                if (x.pagliaio.indexOf(w) < 0) return false;
            }
        }
        return true;
    }

    // ---------- le card ----------
    function etichettaStato(stato) {
        return crea('span', 'bando-stato bando-stato--' + stato.id, stato.testo);
    }
    /* L'etichetta in evidenza dei bandi che chiedono la certificazione del
       revisore legale (campo `revisore` in dati.js): una fascia color oro con
       il sigillo, come il bollo su un documento certificato. Sulla card sta in
       cima, con il sigillo che sporge dal bordo; nella scheda (`piccola`) e'
       una targhetta accanto a regione e stato. */
    var SIGILLO = '<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">'
        + '<path class="sigillo-nastro" d="M15 30 10 46l7-4 4 5 3-12zM33 30l5 16-7-4-4 5-3-12z"/>'
        + '<circle class="sigillo-fondo" cx="24" cy="21" r="18"/>'
        + '<circle class="sigillo-bordo" cx="24" cy="21" r="18" fill="none" stroke-width="3.2" stroke-dasharray="3.14 3.14"/>'
        + '<circle class="sigillo-filo" cx="24" cy="21" r="12.5" fill="none" stroke-width="1.1"/>'
        + '<path class="sigillo-spunta" d="M18.2 21.4l4 4 7.6-8.2" fill="none" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'
        + '</svg>';
    function sigillo() {
        var sig = crea('span', 'bando-sigillo');
        sig.innerHTML = SIGILLO;
        return sig;
    }
    function etichettaRevisore(piccola) {
        var el = crea('div', 'bando-revisore' + (piccola ? ' bando-revisore--piccola' : ''));
        // nella targhetta il sigillo sta dentro; sulla card lo mette card(), fuori dalla fascia
        if (piccola) el.appendChild(sigillo());
        var corpo = crea('span', 'bando-revisore-corpo');
        corpo.appendChild(crea('span', 'bando-revisore-nome', 'Certificazione del revisore'));
        if (!piccola) corpo.appendChild(crea('span', 'bando-revisore-riga', 'Richiesta da questo bando'));
        el.appendChild(corpo);
        return el;
    }
    function fatto(dl, nome, valore) {
        if (!valore) return;
        var riga = crea('div', 'bando-fatto');
        riga.appendChild(crea('dt', '', nome));
        riga.appendChild(crea('dd', '', valore));
        dl.appendChild(riga);
    }
    function card(x) {
        var b = x.b;
        var art = crea('article', 'bando-card' + (x.stato.id === 'chiuso' ? ' bando-card--chiuso' : ''));
        art.id = 'card-' + b.id;
        if (b.revisore) {
            art.className += ' bando-card--revisore';
            art.appendChild(etichettaRevisore());
            /* fuori dalla fascia, che ritaglia la lama di luce: cosi' il
               sigillo puo' sporgere dal bordo della card */
            art.appendChild(sigillo());
        }

        var testa = crea('div', 'bando-card-testa');
        testa.appendChild(crea('span', 'bando-regione' + (x.nazionale ? ' bando-regione--nazionale' : ''), b.regione));
        testa.appendChild(etichettaStato(x.stato));
        art.appendChild(testa);

        var titolo = crea('h3', 'bando-titolo');
        var apri = crea('a', '', b.titolo);
        apri.href = '#' + b.id;
        apri.setAttribute('data-scheda', b.id);
        titolo.appendChild(apri);
        art.appendChild(titolo);
        art.appendChild(crea('div', 'bando-ente', b.ente));
        art.appendChild(crea('div', 'bando-sintesi', b.sintesi));

        var dl = crea('dl', 'bando-fatti');
        fatto(dl, 'Agevolazione', b.importo);
        fatto(dl, 'Per chi', b.beneficiari);
        fatto(dl, 'Quando', b.scadenza);
        art.appendChild(dl);

        var chip = crea('div', 'bando-chip');
        (b.tipologie || []).forEach(function (t) { chip.appendChild(crea('span', 'bando-chip-voce', D.TIPOLOGIE[t] || t)); });
        art.appendChild(chip);

        var azioni = crea('div', 'bando-azioni');
        var leggi = crea('a', 'btn btn-outline-dark bando-leggi', 'Leggi la scheda');
        leggi.href = '#' + b.id;
        leggi.setAttribute('data-scheda', b.id);
        azioni.appendChild(leggi);
        var chiedi = crea('a', 'btn btn-primary bando-chiedi', 'Richiedi informazioni');
        chiedi.href = '#richiesta';
        chiedi.setAttribute('data-richiedi', b.id);
        azioni.appendChild(chiedi);
        art.appendChild(azioni);
        return art;
    }

    function scriviIndirizzo(f) {
        var q = new URLSearchParams();
        if (f.q) q.set('q', f.q);
        if (f.regione) q.set('regione', f.regione);
        if (f.tipologia) q.set('tipologia', f.tipologia);
        if (f.finalita) q.set('finalita', f.finalita);
        if (f.regione && !f.nazionali) q.set('nazionali', 'no');
        if (f.chiusi) q.set('chiusi', 'si');
        if (f.revisore) q.set('revisore', 'si');
        var s = q.toString();
        try { history.replaceState(null, '', location.pathname + (s ? '?' + s : '') + location.hash); } catch (_) { /* file:// */ }
    }

    function aggiorna() {
        var f = statoFiltri();
        var regioneVera = f.regione && f.regione !== chiave(NAZIONALE);
        spuntaNazionali.hidden = !regioneVera;
        var visti = BANDI.filter(function (x) { return passa(x, f); });

        griglia.textContent = '';
        visti.forEach(function (x) { griglia.appendChild(card(x)); });
        vuoto.hidden = visti.length > 0;

        var aperti = BANDI.filter(function (x) { return x.stato.id !== 'chiuso'; }).length;
        var totale = f.chiusi ? BANDI.length : aperti;
        var filtrato = !!(f.q || f.regione || f.tipologia || f.finalita || f.revisore);
        conta.textContent = visti.length === 0 ? ''
            : (filtrato
                ? visti.length + (visti.length === 1 ? ' bando trovato' : ' bandi trovati') + ' su ' + totale
                : visti.length + (visti.length === 1 ? ' bando' : ' bandi') + (f.chiusi ? '' : ' aperti o in apertura'));
        $('azzera').hidden = !(filtrato || f.chiusi);
        scriviIndirizzo(f);
    }

    function azzera() {
        campoCerca.value = '';
        campoRegione.value = '';
        campoTipologia.value = '';
        campoFinalita.value = '';
        campoNazionali.checked = true;
        campoChiusi.checked = false;
        campoRevisore.checked = false;
        aggiorna();
    }

    // i filtri dall'indirizzo: solo valori che esistono nelle tendine
    (function () {
        var q = new URLSearchParams(location.search);
        campoCerca.value = String(q.get('q') || '').slice(0, 80);
        var r = chiave(q.get('regione'));
        if (ha(campoRegione, r)) campoRegione.value = r;
        var t = String(q.get('tipologia') || '');
        if (ha(campoTipologia, t)) campoTipologia.value = t;
        var fi = String(q.get('finalita') || '');
        if (ha(campoFinalita, fi)) campoFinalita.value = fi;
        campoNazionali.checked = q.get('nazionali') !== 'no';
        campoChiusi.checked = q.get('chiusi') === 'si';
        campoRevisore.checked = q.get('revisore') === 'si';
    })();

    filtri.addEventListener('submit', function (e) { e.preventDefault(); });
    var attesaCerca = 0;
    campoCerca.addEventListener('input', function () {
        clearTimeout(attesaCerca);
        attesaCerca = setTimeout(aggiorna, 150);
    });
    [campoRegione, campoTipologia, campoFinalita, campoNazionali, campoChiusi, campoRevisore].forEach(function (c) {
        c.addEventListener('change', aggiorna);
    });
    $('azzera').addEventListener('click', azzera);
    $('azzeraVuoto').addEventListener('click', azzera);

    // ---------- la scheda ----------
    var finestra = $('scheda');
    var apertaId = '';
    function riempiScheda(x) {
        var b = x.b;
        var et = $('schedaEtichette');
        et.textContent = '';
        et.appendChild(crea('span', 'bando-regione' + (x.nazionale ? ' bando-regione--nazionale' : ''), b.regione));
        et.appendChild(etichettaStato(x.stato));
        if (b.revisore) et.appendChild(etichettaRevisore(true));
        $('schedaTitolo').textContent = b.titolo;
        $('schedaEnte').textContent = b.ente;

        var dl = $('schedaFatti');
        dl.textContent = '';
        fatto(dl, 'Agevolazione', b.importo);
        fatto(dl, 'Tipologia', (b.tipologie || []).map(function (t) { return D.TIPOLOGIE[t] || t; }).join(', '));
        fatto(dl, 'Per chi', b.beneficiari);
        fatto(dl, 'Quando', b.scadenza);
        fatto(dl, 'Revisore', b.revisore ? (b.revisore === true ? 'È richiesta la certificazione del revisore legale' : b.revisore) : '');
        fatto(dl, 'Procedura', b.procedura === 'graduatoria' ? 'A graduatoria, per punteggio'
            : (b.procedura === 'sportello' ? 'A sportello, in ordine cronologico' : ''));

        var corpo = $('schedaSezioni');
        corpo.textContent = '';
        (b.sezioni || []).forEach(function (s) {
            var sez = crea('section', 'bando-sezione');
            sez.appendChild(crea('h3', 'bando-sezione-titolo', s.t));
            /* Paragrafi ed elenco nell'ordine in cui la sezione li da': se
               l'elenco e' scritto prima dei paragrafi, viene prima. */
            var chiavi = Object.keys(s).filter(function (k) { return k === 'p' || k === 'l'; });
            chiavi.forEach(function (k) {
                if (k === 'p') (s.p || []).forEach(function (t) { sez.appendChild(crea('p', '', t)); });
                else {
                    var ul = crea('ul', '');
                    (s.l || []).forEach(function (t) { ul.appendChild(crea('li', '', t)); });
                    sez.appendChild(ul);
                }
            });
            corpo.appendChild(sez);
        });
        if (b.aggiornata) corpo.appendChild(crea('div', 'bando-aggiornata', 'Scheda aggiornata al ' + dataEstesa(b.aggiornata) + '.'));

        var pdf = $('schedaPdf');
        pdf.hidden = !b.pdf;
        if (b.pdf) pdf.href = 'schede/' + b.pdf;
        $('schedaRichiedi').setAttribute('data-richiedi', b.id);
    }
    function apriScheda(id) {
        var x = PER_ID[id];
        if (!x) return false;
        riempiScheda(x);
        apertaId = id;
        // l'indirizzo della scheda, da copiare e mandare
        if (location.hash !== '#' + id) {
            try { history.replaceState(null, '', location.pathname + location.search + '#' + id); } catch (_) { /* file:// */ }
        }
        if (!finestra.open) {
            if (typeof finestra.showModal === 'function') finestra.showModal();
            else finestra.setAttribute('open', '');
        }
        $('schedaCorpo').scrollTop = 0;
        if (typeof window.gtag === 'function') window.gtag('event', 'scheda_bando', { bando: id });
        return true;
    }
    function chiudiScheda() {
        if (finestra.open) {
            if (typeof finestra.close === 'function') finestra.close();
            else finestra.removeAttribute('open');
        }
    }
    // chiusa la scheda (con il pulsante, Esc o un clic fuori) l'ancora torna vuota
    finestra.addEventListener('close', function () {
        if (apertaId && location.hash === '#' + apertaId) {
            try { history.replaceState(null, '', location.pathname + location.search); } catch (_) { /* file:// */ }
        }
        apertaId = '';
    });
    $('schedaChiudi').addEventListener('click', chiudiScheda);
    finestra.addEventListener('click', function (e) { if (e.target === finestra) chiudiScheda(); });

    /* I collegamenti alla scheda si aprono da qui, non lasciando fare al
       browser: zls_zes/script.js ferma il clic su ogni collegamento "#..."
       per scorrere con dolcezza fino all'ancora, e l'ancora di una scheda non
       e' un punto della pagina. L'href resta, per chi apre in un'altra scheda. */
    document.addEventListener('click', function (e) {
        var el = e.target.closest ? e.target.closest('[data-scheda]') : null;
        if (!el || e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
        e.preventDefault();
        apriScheda(el.getAttribute('data-scheda'));
    });

    function daAncora() {
        var id = decodeURIComponent(String(location.hash || '').slice(1));
        if (PER_ID[id]) apriScheda(id);
        else if (apertaId) chiudiScheda();
    }
    window.addEventListener('hashchange', daAncora);

    // ---------- il modulo ----------
    var SERVIZIO = 'https://revilaw-email.vercel.app/api/iscrizione-nuova';
    var INFO = 'info@nextgenerationbusiness.it';
    var form = $('bandiForm');
    var campoBando = $('bando');
    var campoMessaggio = $('messaggio');
    var contaMessaggio = $('messaggioConta');
    var btnInvia = $('bandiInvia');
    var erroreInvio = $('bandiErrore');
    var MAX_MESSAGGIO = 2000;

    // "Bando di interesse": i bandi non chiusi, raggruppati per regione
    (function () {
        var gruppi = {}, ordine = [];
        BANDI.filter(function (x) { return x.stato.id !== 'chiuso'; })
            .sort(function (x, y) {
                if (x.nazionale !== y.nazionale) return x.nazionale ? -1 : 1;
                return x.b.regione.localeCompare(y.b.regione, 'it') || x.b.titolo.localeCompare(y.b.titolo, 'it');
            })
            .forEach(function (x) {
                if (!gruppi[x.b.regione]) {
                    gruppi[x.b.regione] = document.createElement('optgroup');
                    gruppi[x.b.regione].label = x.nazionale ? 'Nazionali' : x.b.regione;
                    ordine.push(x.b.regione);
                }
                gruppi[x.b.regione].appendChild(opzione(x.b.id, x.b.titolo));
            });
        ordine.forEach(function (r) { campoBando.appendChild(gruppi[r]); });
    })();

    /* "Richiedi informazioni" da una card o dalla scheda: il bando e' gia'
       scelto nel modulo, e ci si arriva. */
    function vaiAlModulo(id) {
        chiudiScheda();
        if (ha(campoBando, id)) campoBando.value = id;
        else campoBando.value = '';
        var meta = $('richiesta');
        requestAnimationFrame(function () {
            meta.scrollIntoView({ behavior: 'smooth', block: 'start' });
            var primo = campoBando.value ? campoMessaggio : campoBando;
            setTimeout(function () { try { primo.focus({ preventScroll: true }); } catch (_) { /* vecchi browser */ } }, 400);
        });
    }
    document.addEventListener('click', function (e) {
        var el = e.target.closest ? e.target.closest('[data-richiedi]') : null;
        if (!el) return;
        e.preventDefault();
        vaiAlModulo(el.getAttribute('data-richiedi') || '');
    });

    /* Il tempo passato sul modulo (campo "ms"): un modulo compilato in un
       secondo e' un programma, e il servizio lo scarta. Si conta dal primo
       campo toccato, non da quando si apre la pagina. */
    var toccato = 0;
    function tocca() { if (!toccato) toccato = Date.now(); }
    ['focusin', 'input', 'change'].forEach(function (t) { form.addEventListener(t, tocca, true); });

    function errore(id, testo) {
        var campo = $(id);
        var el = $(id + 'Errore');
        if (el) el.textContent = testo || '';
        if (!campo) return;
        if (campo.type !== 'checkbox') campo.classList.toggle('errore', !!testo);
        if (testo) campo.setAttribute('aria-invalid', 'true'); else campo.removeAttribute('aria-invalid');
    }
    function aggiornaConta() {
        var n = campoMessaggio.value.length;
        contaMessaggio.textContent = n + ' / ' + MAX_MESSAGGIO + ' caratteri';
        contaMessaggio.classList.toggle('vicino', n > MAX_MESSAGGIO - 200);
    }
    campoMessaggio.addEventListener('input', aggiornaConta);

    function valida(campo) {
        if (campo.type === 'checkbox') {
            errore(campo.id, campo.checked ? '' : 'Per inviare la richiesta serve il consenso al trattamento dei dati.');
            return campo.checked;
        }
        var v = campo.value.trim();
        if (campo.required && !v) { errore(campo.id, 'Campo obbligatorio.'); return false; }
        if (campo.type === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) {
            errore(campo.id, 'Scrivi un indirizzo email valido, per esempio nome@azienda.it.');
            return false;
        }
        if (campo.type === 'tel' && v && v.replace(/[^0-9]/g, '').length < 6) {
            errore(campo.id, 'Il numero di telefono non sembra completo.');
            return false;
        }
        errore(campo.id, '');
        return true;
    }
    Array.prototype.forEach.call(form.querySelectorAll('input, select, textarea'), function (campo) {
        if (campo.id === 'sito') return;
        if (campo.type === 'checkbox') { campo.addEventListener('change', function () { if (campo.required) valida(campo); }); return; }
        campo.addEventListener('blur', function () { if (campo.required || campo.value.trim()) valida(campo); });
        campo.addEventListener('input', function () { if (campo.classList.contains('errore')) valida(campo); });
    });

    /* ---------- la casella "non sono un robot", per i due moduli ----------
       Cloudflare Turnstile, con la stessa chiave PUBBLICA del modulo delle
       domande (contatti/contatti.js) e un'azione per modulo: 'richiesta-bando'
       per le richieste, 'bandi-newsletter' per l'iscrizione alla newsletter.
       La segreta sta nel servizio (TURNSTILE_SECRET), che rifiuta il gettone
       nato per l'altro modulo. La casella si vede SOLO quando Cloudflare chiede
       davvero un clic. Il gettone vale una volta: dopo ogni invio se ne
       prepara uno nuovo. Se lo script di Cloudflare non si carica il modulo
       parte senza gettone: se il servizio ha la chiave segreta lo rifiuta
       (captchaKo), e allora si dice di scriverci per mail.
       Lo script si carica una volta sola, e solo quando qualcuno comincia a
       usare uno dei due moduli: chi viene a leggere le schede non lo scarica. */
    var TURNSTILE_CHIAVE = '0x4AAAAAAFZkLXVSuromvnHp';
    var turnstile = { chiesto: false, pronto: false, guasto: false, attese: [] };
    function conTurnstile(fn) {
        if (turnstile.pronto || turnstile.guasto) { fn(); return; }
        turnstile.attese.push(fn);
        if (turnstile.chiesto) return;
        turnstile.chiesto = true;
        var fatto = function () { turnstile.attese.splice(0).forEach(function (f) { f(); }); };
        window.ngbCaptchaBandi = function () { turnstile.pronto = true; fatto(); };
        var sc = document.createElement('script');
        sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=ngbCaptchaBandi';
        sc.async = true;
        sc.defer = true;
        sc.onerror = function () { turnstile.guasto = true; fatto(); };
        document.head.appendChild(sc);
    }
    function nuovoCaptcha(box, azione) {
        var c = { id: null, gettone: '', richiesto: false, attese: [] };
        Object.defineProperty(c, 'guasto', { get: function () { return turnstile.guasto; } });
        function pronto(g) {
            c.gettone = g || '';
            c.attese.splice(0).forEach(function (f) { f(c.gettone); });
        }
        c.prepara = function () {
            if (c.richiesto || !TURNSTILE_CHIAVE) return;
            c.richiesto = true;
            conTurnstile(function () {
                if (turnstile.guasto || !window.turnstile) { pronto(''); return; }
                box.hidden = false;
                c.id = window.turnstile.render(box, {
                    sitekey: TURNSTILE_CHIAVE, language: 'it', action: azione,
                    appearance: 'interaction-only', size: 'flexible', theme: 'light',
                    callback: pronto,
                    'expired-callback': function () { c.gettone = ''; },
                    'error-callback': function () { c.gettone = ''; },
                    'before-interactive-callback': function () { box.classList.add('captcha--visibile'); },
                    'after-interactive-callback': function () { box.classList.remove('captcha--visibile'); }
                });
            });
        };
        // il gettone, aspettandolo al massimo `ms` millisecondi: '' se non arriva
        c.aspetta = function (ms) {
            if (!TURNSTILE_CHIAVE || turnstile.guasto) return Promise.resolve('');
            if (c.gettone) return Promise.resolve(c.gettone);
            return new Promise(function (fine) {
                var finito = function (g) { clearTimeout(t); fine(g); };
                var t = setTimeout(function () {
                    c.attese = c.attese.filter(function (f) { return f !== finito; });
                    fine('');
                }, ms);
                c.attese.push(finito);
            });
        };
        c.rinnova = function () {
            c.gettone = '';
            if (c.id !== null && window.turnstile) window.turnstile.reset(c.id);
        };
        // la verifica c'e' ma il gettone non e' arrivato: di solito Cloudflare chiede un clic
        c.chiedeClic = function (gettone) {
            return !!(TURNSTILE_CHIAVE && !turnstile.guasto && window.turnstile && !gettone);
        };
        return c;
    }
    var boxCaptcha = $('captcha');
    var captcha = nuovoCaptcha(boxCaptcha, 'richiesta-bando');
    form.addEventListener('focusin', captcha.prepara, true);

    // ---------- invio ----------
    var ETICHETTA = btnInvia.textContent;
    function inAttesa(testo) {
        btnInvia.disabled = !!testo;
        btnInvia.textContent = testo || ETICHETTA;
    }
    function vaiA(el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (el.focus) el.focus({ preventScroll: true });
    }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
    }
    function titoloScelto() {
        var x = PER_ID[campoBando.value];
        return x ? x.b.titolo : '';
    }
    // la mail gia' scritta, per chi non riesce a usare il modulo
    function mailPronta() {
        var t = titoloScelto();
        return 'mailto:' + INFO + '?subject=' + encodeURIComponent('Richiesta bando' + (t ? ' - ' + t : ''))
            + '&body=' + encodeURIComponent(campoMessaggio.value.slice(0, 1500));
    }
    function mostraErrore(testo) {
        var html = esc(testo);
        var mail = '<a href="' + esc(mailPronta()) + '">' + INFO + '</a>';
        if (html.indexOf(INFO) >= 0) html = html.split(INFO).join(mail);
        else html += ' Puoi anche scriverci direttamente a ' + mail + '.';
        erroreInvio.innerHTML = html;
    }
    function grazie(nome, email) {
        $('grazieNome').textContent = nome ? ', ' + nome : '';
        $('grazieEmail').textContent = email;
        form.hidden = true;
        var fatta = $('richiestaInviata');
        fatta.hidden = false;
        $('schedaModulo').scrollIntoView({ behavior: 'smooth', block: 'start' });
        fatta.focus({ preventScroll: true });
    }

    var inCorso = false;
    form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (inCorso) return;
        tocca();
        captcha.prepara();
        erroreInvio.textContent = '';
        var primo = null;
        Array.prototype.forEach.call(form.querySelectorAll('[required], input[type="tel"]'), function (campo) {
            if (!valida(campo) && !primo) primo = campo;
        });
        if (campoMessaggio.value.length > MAX_MESSAGGIO) {
            errore('messaggio', 'Il messaggio è troppo lungo: al massimo ' + MAX_MESSAGGIO + ' caratteri.');
            if (!primo) primo = campoMessaggio;
        }
        if (primo) { vaiA(primo); return; }

        inCorso = true;
        inAttesa(captcha.gettone || captcha.guasto ? 'Invio in corso...' : 'Verifica in corso...');
        var valore = function (id) { return String(($(id) || {}).value || '').trim(); };
        var scelto = PER_ID[campoBando.value];

        captcha.aspetta(15000).then(function (gettone) {
            // Turnstile c'e' ma il gettone non e' arrivato: di solito chiede un clic
            if (captcha.chiedeClic(gettone)) {
                boxCaptcha.hidden = false;
                boxCaptcha.classList.add('captcha--visibile');
                mostraErrore('Completa la verifica di sicurezza qui sopra, poi premi di nuovo «Invia la richiesta».');
                return null;
            }
            inAttesa('Invio in corso...');
            if (typeof window.gtag === 'function') window.gtag('event', 'invio_form', { pagina: 'Bandi e agevolazioni', bando: campoBando.value || 'generica' });
            return fetch(SERVIZIO, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
                body: JSON.stringify({
                    azione: 'richiesta-bando',
                    bando: scelto ? scelto.b.id : '',
                    bandoTitolo: scelto ? scelto.b.titolo : '',
                    bandoRegione: scelto ? scelto.b.regione : '',
                    bandoTipologia: scelto ? (scelto.b.tipologie || []).map(function (t) { return D.TIPOLOGIE[t] || t; }).join(', ') : '',
                    nome: valore('nome'), cognome: valore('cognome'), azienda: valore('azienda'),
                    sede: valore('sede'), email: valore('email'), telefono: valore('telefono'),
                    messaggio: campoMessaggio.value.trim().slice(0, MAX_MESSAGGIO),
                    privacy: $('privacy').checked === true,
                    marketing: $('marketing').checked === true,
                    captcha: gettone,
                    sito: $('sito').value,
                    ms: Date.now() - toccato
                })
            }).then(function (r) {
                return r.json().catch(function () { return {}; }).then(function (d) { d._stato = r.status; return d; });
            });
        }).then(function (d) {
            inCorso = false;
            if (d === null) { inAttesa(''); return; }   // la verifica di sicurezza non e' finita: gia' detto
            if (d.ok) { grazie(valore('nome'), valore('email')); return; }
            captcha.rinnova();
            inAttesa('');
            if (d._stato === 429) {
                mostraErrore(d.msg || 'Abbiamo ricevuto troppe richieste ravvicinate da questa rete: riprova fra qualche minuto.');
                return;
            }
            if (d.captchaKo) {
                if (captcha.guasto || !window.turnstile) {
                    boxCaptcha.hidden = true;
                    mostraErrore('La verifica di sicurezza di Cloudflare non si carica su questa rete o con le estensioni attive nel browser, e senza di essa il modulo non può partire. Scrivici direttamente a ' + INFO + ' (il collegamento apre una mail già intestata al bando).');
                    return;
                }
                boxCaptcha.hidden = false;
                mostraErrore('La verifica di sicurezza non è andata a buon fine: attendi qualche secondo e premi di nuovo «Invia la richiesta». Se Cloudflare mostra una casella, spuntala.');
                return;
            }
            // l'errore accanto al campo che lo ha causato, quando si sa quale
            var campo = d.campo && $(String(d.campo));
            if (campo && campo.form === form && campo.id !== 'sito') {
                errore(campo.id, d.msg || 'Controlla questo campo.');
                vaiA(campo);
                return;
            }
            mostraErrore(d.msg || 'Non siamo riusciti a inviare la richiesta. Riprova fra qualche minuto.');
        }).catch(function () {
            inCorso = false;
            captcha.rinnova();
            inAttesa('');
            mostraErrore('Il servizio non risponde in questo momento. Riprova fra qualche minuto.');
        });
    });

    /* ---------- la newsletter dei bandi ----------
       Il riquadro "I nuovi bandi, appena escono": nome (facoltativo), email,
       consenso. Va al servizio email con l'azione "bandi-newsletter"
       (email-service/lib/newsletter-bandi.js), che salva l'iscrizione in
       attesa e manda la mail con il pulsante di conferma. La risposta e' la
       stessa anche per chi e' gia' iscritto: glielo dice la mail. */
    (function () {
        var nlForm = $('newsletterForm');
        if (!nlForm) return;
        var nlEmail = $('nlEmail');
        var nlPrivacy = $('nlPrivacy');
        var nlInvia = $('nlInvia');
        var nlErrore = $('nlErrore');
        var nlBox = $('nlCaptcha');
        var nlCaptcha = nuovoCaptcha(nlBox, 'bandi-newsletter');
        var nlToccato = 0;
        var nlTocca = function () { if (!nlToccato) nlToccato = Date.now(); };
        ['focusin', 'input', 'change'].forEach(function (t) { nlForm.addEventListener(t, nlTocca, true); });
        nlForm.addEventListener('focusin', nlCaptcha.prepara, true);

        function nlCampo(id, testo) {
            var campo = $(id);
            var el = $(id + 'Errore');
            if (el) el.textContent = testo || '';
            if (campo && campo.type !== 'checkbox') campo.classList.toggle('errore', !!testo);
            if (campo) { if (testo) campo.setAttribute('aria-invalid', 'true'); else campo.removeAttribute('aria-invalid'); }
        }
        function nlValida() {
            var primo = null;
            var v = nlEmail.value.trim();
            if (!v) { nlCampo('nlEmail', 'Scrivi l\'indirizzo a cui mandarti i bandi.'); primo = nlEmail; }
            else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { nlCampo('nlEmail', 'Scrivi un indirizzo email valido, per esempio nome@azienda.it.'); primo = nlEmail; }
            else nlCampo('nlEmail', '');
            if (!nlPrivacy.checked) { nlCampo('nlPrivacy', 'Per iscriverti serve il tuo consenso.'); if (!primo) primo = nlPrivacy; }
            else nlCampo('nlPrivacy', '');
            return primo;
        }
        nlEmail.addEventListener('blur', function () { if (nlEmail.value.trim()) nlValida(); });
        nlEmail.addEventListener('input', function () { if (nlEmail.classList.contains('errore')) nlValida(); });
        nlPrivacy.addEventListener('change', function () { if (nlPrivacy.checked) nlCampo('nlPrivacy', ''); });

        var ETICHETTA_NL = nlInvia.textContent;
        function nlAttesa(testo) {
            nlInvia.disabled = !!testo;
            nlInvia.textContent = testo || ETICHETTA_NL;
        }
        function nlMostra(testo) {
            var html = esc(testo).split(INFO).join('<a href="mailto:' + INFO + '?subject=' + encodeURIComponent('Iscrizione agli aggiornamenti sui bandi') + '">' + INFO + '</a>');
            nlErrore.innerHTML = html;
        }

        var nlInCorso = false;
        nlForm.addEventListener('submit', function (e) {
            e.preventDefault();
            if (nlInCorso) return;
            nlTocca();
            nlCaptcha.prepara();
            nlErrore.textContent = '';
            var primo = nlValida();
            if (primo) { vaiA(primo); return; }
            nlInCorso = true;
            nlAttesa(nlCaptcha.gettone || nlCaptcha.guasto ? 'Invio in corso...' : 'Verifica in corso...');
            var email = nlEmail.value.trim();

            nlCaptcha.aspetta(15000).then(function (gettone) {
                if (nlCaptcha.chiedeClic(gettone)) {
                    nlBox.hidden = false;
                    nlBox.classList.add('captcha--visibile');
                    nlMostra('Completa la verifica di sicurezza qui sopra, poi premi di nuovo «Iscriviti».');
                    return null;
                }
                nlAttesa('Invio in corso...');
                if (typeof window.gtag === 'function') window.gtag('event', 'iscrizione_newsletter', { pagina: 'Bandi e agevolazioni' });
                return fetch(SERVIZIO, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
                    body: JSON.stringify({
                        azione: 'bandi-newsletter',
                        email: email, nome: $('nlNome').value.trim(),
                        privacy: nlPrivacy.checked === true,
                        captcha: gettone, sito: $('nlSito').value,
                        ms: Date.now() - nlToccato, origine: 'bandi'
                    })
                }).then(function (r) {
                    return r.json().catch(function () { return {}; }).then(function (d) { d._stato = r.status; return d; });
                });
            }).then(function (d) {
                nlInCorso = false;
                if (d === null) { nlAttesa(''); return; }
                if (d.ok) {
                    $('nlFattoEmail').textContent = email;
                    nlForm.hidden = true;
                    var fatto = $('nlFatto');
                    fatto.hidden = false;
                    try { fatto.focus({ preventScroll: true }); } catch (_) { /* vecchi browser */ }
                    return;
                }
                nlCaptcha.rinnova();
                nlAttesa('');
                if (d.captchaKo) {
                    if (nlCaptcha.guasto || !window.turnstile) {
                        nlBox.hidden = true;
                        nlMostra('La verifica di sicurezza di Cloudflare non si carica su questa rete o con le estensioni attive nel browser. Riprova da un\'altra rete, oppure scrivici a ' + INFO + ' e ti iscriviamo noi.');
                        return;
                    }
                    nlBox.hidden = false;
                    nlMostra('La verifica di sicurezza non è andata a buon fine: attendi qualche secondo e premi di nuovo «Iscriviti». Se Cloudflare mostra una casella, spuntala.');
                    return;
                }
                if (d.campo === 'email') { nlCampo('nlEmail', d.msg || 'Controlla l\'indirizzo.'); vaiA(nlEmail); return; }
                if (d.campo === 'privacy') { nlCampo('nlPrivacy', d.msg || 'Per iscriverti serve il tuo consenso.'); vaiA(nlPrivacy); return; }
                nlMostra(d.msg || 'Non siamo riusciti a iscriverti. Riprova fra qualche minuto.');
            }).catch(function () {
                nlInCorso = false;
                nlCaptcha.rinnova();
                nlAttesa('');
                nlMostra('Il servizio non risponde in questo momento. Riprova fra qualche minuto.');
            });
        });
    })();

    // ---------- si parte ----------
    // letto prima di aggiorna(), che riscrive la ricerca dell'indirizzo
    var bandoChiesto = String(new URLSearchParams(location.search).get('bando') || '');
    aggiorna();
    aggiornaConta();
    /* ?bando=<id>: il collegamento che porta dritto al modulo con il bando
       gia' scelto (per una mail, per una newsletter). */
    if (PER_ID[bandoChiesto] && ha(campoBando, bandoChiesto)) vaiAlModulo(bandoChiesto);
    else daAncora();
})();
