// ============================================
// Approfondimenti per argomento: la ricerca guidata
//
// L'unica fonte dei dati è la "mappa completa" in fondo alla
// pagina (#mappaAlbero): un elenco annidato area > tema > guida.
// Questo script la legge e ci costruisce sopra:
//   1. l'esploratore a colonne (area, tema, guida)
//   2. gli ingressi rapidi "parti da una situazione"
//   3. la ricerca per parola chiave
// Il percorso scelto finisce nell'indirizzo (#area/tema), così
// si può copiare e condividere.
// ============================================
(function () {
    'use strict';

    var albero = document.getElementById('mappaAlbero');
    var esploratore = document.getElementById('esploratore');
    if (!albero || !esploratore) return;

    // ---------- 1. Lettura della mappa ----------
    // Ogni nodo: { id, nome, desc, tag, figli:[...], foglia:false }
    // oppure     { href, nome, desc, badge, tag, foglia:true }
    function leggiNodo(li, genitore) {
        var link = li.querySelector(':scope > a');
        if (link) {
            return {
                foglia: true,
                href: link.getAttribute('href'),
                nome: testo(link.querySelector('.mappa-titolo')),
                desc: testo(link.querySelector('.mappa-desc')),
                badge: link.dataset.badge || '',
                tag: link.dataset.tag || '',
                genitore: genitore
            };
        }
        var nodo = {
            foglia: false,
            id: li.dataset.id || '',
            nome: testo(li.querySelector(':scope > .mappa-nodo')),
            desc: testo(li.querySelector(':scope > .mappa-desc')),
            tag: li.dataset.tag || '',
            genitore: genitore,
            figli: []
        };
        var ul = li.querySelector(':scope > ul');
        if (ul) {
            Array.prototype.forEach.call(ul.children, function (figlio) {
                if (figlio.tagName === 'LI') nodo.figli.push(leggiNodo(figlio, nodo));
            });
        }
        return nodo;
    }

    function testo(el) { return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; }

    var radice = { foglia: false, id: '', nome: 'Tutti gli argomenti', figli: [], genitore: null };
    Array.prototype.forEach.call(albero.children, function (li) {
        if (li.tagName === 'LI') radice.figli.push(leggiNodo(li, radice));
    });

    // Quante guide (distinte) stanno sotto un nodo
    function contaGuide(nodo) {
        if (nodo.foglia) return 1;
        return nodo.figli.reduce(function (n, f) { return n + contaGuide(f); }, 0);
    }

    // Tutte le foglie con il loro percorso, per la ricerca
    var foglie = [];
    (function raccogli(nodo, percorso) {
        if (nodo.foglia) {
            foglie.push({ nodo: nodo, percorso: percorso });
            return;
        }
        nodo.figli.forEach(function (f) {
            raccogli(f, nodo === radice ? percorso : percorso.concat([nodo]));
        });
    })(radice, []);

    var pagineDistinte = {};
    foglie.forEach(function (f) { pagineDistinte[f.nodo.href] = true; });
    var conteggio = document.getElementById('heroConteggio');
    if (conteggio) {
        var nPagine = Object.keys(pagineDistinte).length;
        conteggio.textContent = radice.figli.length + ' aree, ' + nPagine + ' guide. Tre passi al massimo per arrivarci.';
    }

    // ---------- 2. Esploratore a colonne ----------
    var colonne = [
        document.getElementById('colonna0'),
        document.getElementById('colonna1'),
        document.getElementById('colonna2')
    ];
    var briciolaLista = document.getElementById('briciolaLista');
    var briciolaIndietro = document.getElementById('briciolaIndietro');

    // percorso: elenco dei nodi ramo scelti, dalla radice in giù
    var percorso = [];

    function trovaFiglio(nodo, id) {
        for (var i = 0; i < nodo.figli.length; i++) {
            if (!nodo.figli[i].foglia && nodo.figli[i].id === id) return nodo.figli[i];
        }
        return null;
    }

    function creaEl(tag, classe, html) {
        var el = document.createElement(tag);
        if (classe) el.className = classe;
        if (html !== undefined) el.innerHTML = html;
        return el;
    }

    function escape(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function classeBadge(badge) {
        var b = normalizza(badge).replace(/[^a-z]/g, '');
        return 'badge badge-' + b;
    }

    var ICONA_FRECCIA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>';
    var ICONA_AVANTI = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';

    function creaRamo(nodo, livello, attivo) {
        var n = contaGuide(nodo);
        var btn = creaEl('button', 'ramo' + (attivo ? ' is-attivo' : ''));
        btn.type = 'button';
        btn.setAttribute('role', 'listitem');
        btn.setAttribute('aria-pressed', attivo ? 'true' : 'false');
        btn.innerHTML =
            '<span class="ramo-nome">' + escape(nodo.nome) + '</span>' +
            '<span class="ramo-conta">' + n + (n === 1 ? ' guida' : ' guide') + ICONA_AVANTI + '</span>' +
            (nodo.desc ? '<span class="ramo-desc">' + escape(nodo.desc) + '</span>' : '');
        btn.addEventListener('click', function () {
            percorso = percorso.slice(0, livello).concat([nodo]);
            aggiorna(true);
        });
        return btn;
    }

    function creaGuida(nodo) {
        var a = creaEl('a', 'guida');
        a.href = nodo.href;
        a.setAttribute('role', 'listitem');
        a.innerHTML =
            '<span class="guida-testa"><span class="guida-titolo">' + escape(nodo.nome) + '</span>' +
            (nodo.badge ? '<span class="' + classeBadge(nodo.badge) + '">' + escape(nodo.badge) + '</span>' : '') +
            '</span>' +
            (nodo.desc ? '<span class="guida-desc">' + escape(nodo.desc) + '</span>' : '') +
            '<span class="guida-apri">Apri la guida' + ICONA_FRECCIA + '</span>';
        return a;
    }

    function colonnaVuota(msg) {
        return creaEl('div', 'esplora-vuota',
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>' + msg);
    }

    function riempiColonna(indice, nodo, livello) {
        var col = colonne[indice];
        col.innerHTML = '';
        if (!nodo) {
            col.appendChild(colonnaVuota(indice === 1
                ? 'Scegli un\'area nella prima colonna.'
                : 'Scegli un tema nella seconda colonna.'));
            return;
        }
        var scelto = percorso[livello] || null;
        nodo.figli.forEach(function (f) {
            if (f.foglia) col.appendChild(creaGuida(f));
            else col.appendChild(creaRamo(f, livello, f === scelto));
        });
    }

    function aggiorna(scriviHash) {
        // Colonna 0: le aree. Colonna 1: figli dell'area. Colonna 2: figli del tema.
        riempiColonna(0, radice, 0);
        riempiColonna(1, percorso[0] || null, 1);
        riempiColonna(2, percorso[1] || null, 2);

        // Se l'area ha solo guide (senza temi), la terza colonna resta vuota:
        // si spiega che le guide sono già nella seconda.
        if (percorso[0] && !percorso[1]) {
            var haRami = percorso[0].figli.some(function (f) { return !f.foglia; });
            if (!haRami) {
                colonne[2].innerHTML = '';
                colonne[2].appendChild(colonnaVuota('Per quest\'area le guide sono già nella colonna accanto.'));
            }
        }

        // Livello mostrato sugli schermi stretti
        var livello = percorso.length;
        if (percorso[0] && !percorso[1] && !percorso[0].figli.some(function (f) { return !f.foglia; })) livello = 1;
        if (livello > 2) livello = 2;
        esploratore.className = 'esplora livello-' + livello;

        // Briciole
        briciolaLista.innerHTML = '';
        var voci = [radice].concat(percorso);
        voci.forEach(function (nodo, i) {
            var li = creaEl('li');
            if (i === voci.length - 1) {
                li.className = 'corrente';
                li.appendChild(creaEl('span', '', escape(nodo.nome)));
            } else {
                var b = creaEl('button', '', escape(nodo.nome));
                b.type = 'button';
                b.addEventListener('click', function () {
                    percorso = percorso.slice(0, i);
                    aggiorna(true);
                });
                li.appendChild(b);
            }
            briciolaLista.appendChild(li);
        });
        briciolaIndietro.hidden = percorso.length === 0;

        if (scriviHash) {
            var ids = percorso.map(function (n) { return n.id; }).join('/');
            var nuovo = ids ? '#' + ids : '#esplora';
            if (window.location.hash !== nuovo) {
                history.replaceState(null, '', nuovo);
            }
        }
    }

    briciolaIndietro.addEventListener('click', function () {
        percorso = percorso.slice(0, -1);
        aggiorna(true);
    });

    // Apre un percorso "area/tema" e porta la vista sull'esploratore
    function apriPercorso(stringa, scorri) {
        var ids = (stringa || '').split('/').filter(Boolean);
        var nodo = radice, nuovo = [];
        for (var i = 0; i < ids.length; i++) {
            var f = trovaFiglio(nodo, ids[i]);
            if (!f) break;
            nuovo.push(f);
            nodo = f;
        }
        if (!nuovo.length && ids.length) return false;
        percorso = nuovo;
        aggiorna(true);
        if (scorri) {
            var sez = document.getElementById('esplora');
            if (sez) sez.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return true;
    }

    // ---------- 3. Ingressi rapidi ----------
    document.querySelectorAll('.situazione[data-percorso]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            pulisciRicerca();
            apriPercorso(btn.dataset.percorso, true);
        });
    });

    // ---------- 4. Ricerca per parola chiave ----------
    var form = document.getElementById('cercaForm');
    var input = document.getElementById('cercaInput');
    var pulisci = document.getElementById('cercaPulisci');
    var sezRisultati = document.getElementById('risultati');
    var lista = document.getElementById('risultatiLista');
    var titolo = document.getElementById('risultatiTitolo');
    var vuoto = document.getElementById('risultatiVuoto');
    var chiudi = document.getElementById('risultatiChiudi');

    function normalizza(s) {
        return String(s).toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/['’]/g, '');
    }

    // Per ogni foglia un testo unico su cui cercare: titolo, descrizione,
    // parole chiave, e i nomi (con parole chiave) dei rami sopra.
    foglie.forEach(function (f) {
        var pezzi = [f.nodo.nome, f.nodo.desc, f.nodo.tag];
        f.percorso.forEach(function (r) { pezzi.push(r.nome, r.tag); });
        f.indice = normalizza(pezzi.join(' '));
        f.titoloNorm = normalizza(f.nodo.nome);
    });

    function evidenzia(testoOriginale, parole) {
        var html = escape(testoOriginale);
        parole.forEach(function (p) {
            if (p.length < 2) return;
            var re = new RegExp('(' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
            html = html.replace(re, '<mark class="evidenzia">$1</mark>');
        });
        return html;
    }

    function cerca(q) {
        var qn = normalizza(q).trim();
        var parole = qn.split(/\s+/).filter(Boolean);
        if (!parole.length) { pulisciRicerca(); return; }

        // Ogni parola deve comparire; chi la ha nel titolo va prima.
        var visti = {};
        var risultati = [];
        foglie.forEach(function (f) {
            var ok = parole.every(function (p) { return f.indice.indexOf(p) !== -1; });
            if (!ok) return;
            var punteggio = parole.reduce(function (s, p) {
                return s + (f.titoloNorm.indexOf(p) !== -1 ? 2 : 0);
            }, 0);
            // La stessa pagina può stare in più rami: si mostra una volta,
            // sul ramo con il punteggio migliore (o il primo).
            var chiave = f.nodo.href;
            if (visti[chiave] !== undefined) {
                if (risultati[visti[chiave]].punteggio < punteggio) risultati[visti[chiave]] = { f: f, punteggio: punteggio };
                return;
            }
            visti[chiave] = risultati.length;
            risultati.push({ f: f, punteggio: punteggio });
        });
        risultati.sort(function (a, b) { return b.punteggio - a.punteggio; });

        lista.innerHTML = '';
        var paroleOriginali = q.trim().split(/\s+/).filter(Boolean);
        risultati.forEach(function (r) {
            var li = creaEl('li');
            var a = creaGuida(r.f.nodo);
            var perc = r.f.percorso.map(function (n) { return escape(n.nome); }).join(' › ');
            a.insertAdjacentHTML('afterbegin', '<span class="risultato-percorso">' + perc + '</span>');
            var t = a.querySelector('.guida-titolo');
            var d = a.querySelector('.guida-desc');
            if (t) t.innerHTML = evidenzia(r.f.nodo.nome, paroleOriginali);
            if (d) d.innerHTML = evidenzia(r.f.nodo.desc, paroleOriginali);
            li.appendChild(a);
            lista.appendChild(li);
        });

        var n = risultati.length;
        titolo.textContent = n === 0
            ? 'Nessuna guida per «' + q.trim() + '»'
            : n + (n === 1 ? ' guida trovata' : ' guide trovate') + ' per «' + q.trim() + '»';
        vuoto.hidden = n !== 0;
        sezRisultati.hidden = false;
        pulisci.hidden = false;
    }

    function pulisciRicerca() {
        sezRisultati.hidden = true;
        lista.innerHTML = '';
        pulisci.hidden = true;
        if (input.value) input.value = '';
    }

    var attesa = null;
    input.addEventListener('input', function () {
        clearTimeout(attesa);
        attesa = setTimeout(function () { cerca(input.value); }, 120);
    });
    form.addEventListener('submit', function (e) {
        e.preventDefault();
        clearTimeout(attesa);
        cerca(input.value);
        if (!sezRisultati.hidden) sezRisultati.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    pulisci.addEventListener('click', function () { pulisciRicerca(); input.focus(); });
    chiudi.addEventListener('click', function () {
        pulisciRicerca();
        var sez = document.getElementById('esplora');
        if (sez) sez.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    var vaiEsplora = document.getElementById('risultatiVaiEsplora');
    if (vaiEsplora) vaiEsplora.addEventListener('click', function () { pulisciRicerca(); });

    // "/" porta il cursore nella casella di ricerca, come nei siti di
    // documentazione; non interferisce quando si sta già scrivendo.
    document.addEventListener('keydown', function (e) {
        if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
        var t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        e.preventDefault();
        input.focus();
        input.select();
    });
    input.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { pulisciRicerca(); input.blur(); }
    });

    // ---------- 5. Avvio: percorso dall'indirizzo ----------
    function daHash() {
        var h = window.location.hash.replace(/^#/, '');
        if (!h || h === 'esplora' || h === 'situazioni' || h === 'mappa' || h === 'hero' || h === 'risultati') {
            aggiorna(false);
            return;
        }
        if (!apriPercorso(h, false)) aggiorna(false);
    }
    daHash();
    window.addEventListener('hashchange', function () {
        var h = window.location.hash.replace(/^#/, '');
        if (h && document.getElementById(h)) return; // ancora di sezione, non un percorso
        daHash();
    });
})();
