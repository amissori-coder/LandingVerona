/* ============================================================
   Conferma di presenza alle cene del convegno di Napoli
   ------------------------------------------------------------
   Un solo file per le due pagine: cambia la serata (window.CENA,
   scritta nell'HTML), non il modulo. Parla con lo stesso servizio
   dei form del sito - api/iscrizione-nuova - con due azioni sue:

     cena-leggi     la scheda della serata (data, luogo, termine,
                    quanti ospiti si possono portare);
     cena-conferma  la risposta di chi compila.

   PERCHE' LA SCHEDA ARRIVA DAL SERVIZIO. Le date e il termine
   stanno scritti in un posto solo (email-service/lib/cene-evento.js).
   Se si spostasse la cena, o si allungasse il termine, cambiarlo
   in due posti vorrebbe dire prima o poi cambiarlo in uno.
   L'HTML si tiene una copia di riserva - titolo e data - che
   serve a non lasciare la pagina bianca se il servizio non
   risponde: si vede la serata, e il modulo dice di riprovare.

   IL CONTO ALLA ROVESCIA. Va sull'ora del SERVIZIO, non su quella
   del computer di chi guarda: un orologio avanti di due giorni
   direbbe "scaduto" a chi e' ancora in tempo. Quando arriva a
   zero il modulo si chiude da solo, senza ricaricare la pagina -
   ed e' comunque il servizio a rifiutare le risposte tardive:
   qui si evita solo di far compilare un modulo che verra'
   respinto.
   ============================================================ */
(function () {
    'use strict';

    var API = 'https://revilaw-email.vercel.app/api/iscrizione-nuova';
    var P = window.CENA || {};          // id della cena + copia di riserva dei testi
    var box = document.getElementById('contenuto');
    var cena = null;                    // la scheda vera, quando arriva
    var scartoOrologio = 0;             // differenza fra l'ora del servizio e quella qui
    var battito = null;

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }
    function el(id) { return document.getElementById(id); }
    function adesso() { return Date.now() + scartoOrologio; }
    /* Senza il termine - il servizio non ha risposto e si sta andando avanti
       con la copia di riserva - non si dichiara scaduto niente: a dire di no
       sara' semmai il servizio, che il termine ce l'ha. */
    function scaduta() { return !!(cena && cena.scadenza) && adesso() > cena.scadenza; }

    /* Il termine scritto per esteso: "domenica 27 settembre, entro le 23:59".
       Si compone dalla data che manda il servizio, cosi' resta giusto anche
       se il termine si sposta. */
    var GIORNI = ['domenica', 'lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato'];
    var MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
        'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
    function terminePerEsteso() {
        if (!cena || !cena.scadenza) return '';
        var d = new Date(cena.scadenza);
        try {
            /* L'ora di Roma, non quella di chi guarda: chi apre la pagina da
               fuori Italia deve leggere il termine com'e' stato deciso. */
            var parti = new Intl.DateTimeFormat('it-IT', {
                timeZone: 'Europe/Rome', weekday: 'long', day: 'numeric', month: 'long'
            }).format(d);
            return parti;
        } catch (e) {
            return GIORNI[d.getDay()] + ' ' + d.getDate() + ' ' + MESI[d.getMonth()];
        }
    }

    /* --- il conto alla rovescia --- */
    function rovesciaHtml() {
        if (!cena || !cena.scadenza) return '';
        return '<div class="rovescia" id="rovescia">'
            + '<span class="et" id="rov-et">Tempo per confermare</span>'
            + '<div class="cifre" id="rov-cifre"></div>'
            + '<div class="quando" id="rov-quando"></div>'
            + '</div>';
    }
    function quadrante(n, u) {
        return '<span class="q"><span class="n">' + n + '</span><span class="u">' + u + '</span></span>';
    }
    function disegnaRovescia() {
        var r = el('rovescia');
        if (!r || !cena || !cena.scadenza) return;
        var cifre = el('rov-cifre'), et = el('rov-et'), quando = el('rov-quando');
        var manca = cena.scadenza - adesso();
        if (manca <= 0) {
            r.className = 'rovescia scaduta';
            et.textContent = 'Le conferme si sono chiuse';
            cifre.innerHTML = '';
            quando.innerHTML = 'Il termine era ' + esc(terminePerEsteso())
                + '. Se ha bisogno di comunicarci qualcosa scriva a '
                + '<a href="mailto:info@nextgenerationbusiness.it">info@nextgenerationbusiness.it</a>.';
            if (battito) { clearInterval(battito); battito = null; }
            chiudiModulo();
            return;
        }
        var sec = Math.floor(manca / 1000);
        var gg = Math.floor(sec / 86400), hh = Math.floor((sec % 86400) / 3600);
        var mm = Math.floor((sec % 3600) / 60), ss = sec % 60;
        // sotto le 24 ore il riquadro si accende: e' il momento in cui serve
        r.className = 'rovescia' + (gg < 1 ? ' stretta' : '');
        et.textContent = 'Tempo per confermare';
        /* Tre quadranti, mai quattro: sullo schermo di un telefono il quarto
           va a capo da solo e il conto si legge su due righe storte. Finche'
           c'e' piu' di un giorno i secondi non dicono niente a nessuno;
           nell'ultima giornata, invece, sono proprio loro a far compilare
           subito, e allora prendono il posto dei giorni. */
        cifre.innerHTML = gg
            ? quadrante(gg, gg === 1 ? 'giorno' : 'giorni') + quadrante(hh, 'ore') + quadrante(mm, 'minuti')
            : quadrante(hh, 'ore') + quadrante(mm, 'minuti') + quadrante(('0' + ss).slice(-2), 'secondi');
        quando.textContent = 'Si conferma entro ' + terminePerEsteso() + ', fino a mezzanotte.';
    }
    function avviaRovescia() {
        disegnaRovescia();
        if (battito) clearInterval(battito);
        battito = setInterval(disegnaRovescia, 1000);
    }
    // il modulo si spegne sul posto quando il tempo finisce, senza ricaricare
    function chiudiModulo() {
        var f = el('modulo');
        if (!f) return;
        var campi = f.querySelectorAll('input, select, textarea, button');
        for (var i = 0; i < campi.length; i++) campi[i].disabled = true;
        var az = el('azioni-modulo');
        if (az && !el('avviso-chiusa')) {
            az.insertAdjacentHTML('beforebegin', '<div class="chiusa" id="avviso-chiusa">'
                + '<b>Le conferme sono chiuse.</b> Il termine e\' scaduto mentre la pagina era aperta. '
                + 'Se deve comunicarci qualcosa scriva a <a href="mailto:info@nextgenerationbusiness.it">info@nextgenerationbusiness.it</a>.</div>');
        }
    }

    /* --- la serata --- */
    function serataHtml() {
        var righe = '<dt>Quando</dt><dd>' + esc(cena.quando) + (cena.ora ? ', ore ' + esc(cena.ora) : '') + '</dd>';
        if (cena.luogo) righe += '<dt>Dove</dt><dd>' + esc(cena.luogo) + '</dd>';
        if (cena.chi) righe += '<dt>Invitati</dt><dd>' + esc(cena.chi) + '</dd>';
        return '<div class="serata"><dl>' + righe + '</dl></div>';
    }

    /* --- il modulo --- */
    function moduloHtml() {
        var max = Math.max(0, Number(cena.ospitiMax) || 0);
        var opzioni = '';
        for (var i = 0; i <= max; i++) {
            opzioni += '<option value="' + i + '">' + (i === 0 ? 'nessun ospite' : i + (i === 1 ? ' ospite' : ' ospiti')) + '</option>';
        }
        return '<form id="modulo" novalidate>'
            + '<div class="due">'
            + '<div class="campo"><label for="c-nome">Nome</label>'
            + '<input type="text" id="c-nome" name="nome" autocomplete="given-name" required></div>'
            + '<div class="campo"><label for="c-cognome">Cognome</label>'
            + '<input type="text" id="c-cognome" name="cognome" autocomplete="family-name" required></div>'
            + '</div>'
            + '<div class="campo"><label for="c-email">Email</label>'
            + '<input type="email" id="c-email" name="email" autocomplete="email" inputmode="email" required>'
            + '<span class="nota">Le mandiamo qui il riepilogo. Se cambia idea, torni su questa pagina con lo stesso indirizzo: '
            + 'la Sua risposta si aggiorna, senza creare un doppione.</span></div>'
            + '<div class="campo"><label for="c-tel">Telefono <span class="nota">(facoltativo)</span></label>'
            + '<input type="tel" id="c-tel" name="telefono" autocomplete="tel"></div>'
            + '<div class="scelta"><span>Parteciper&agrave; alla cena?</span><div class="opzioni">'
            + '<label class="opz" id="opz-si"><input type="radio" name="presente" value="si"><span>S&igrave;, ci sar&ograve;</span></label>'
            + '<label class="opz" id="opz-no"><input type="radio" name="presente" value="no"><span>No, non posso</span></label>'
            + '</div></div>'
            + '<div class="ospiti" id="ospiti" hidden>'
            + '<div class="campo"><label for="c-quanti">Ospiti che porta con s&eacute;</label>'
            + '<select id="c-quanti">' + opzioni + '</select>'
            + '<span class="nota">Ogni ospite &egrave; un posto in pi&ugrave; a tavola. Se non sa ancora i nomi, indichi solo quanti sono.</span></div>'
            + '<div class="nomi" id="nomi" hidden></div>'
            + '</div>'
            + '<div class="campo"><label for="c-note">Note <span class="nota">(intolleranze, allergie, altro)</span></label>'
            + '<textarea id="c-note" maxlength="500"></textarea></div>'
            + '<div class="azioni" id="azioni-modulo">'
            + '<button type="submit" class="invia" id="c-invia">Invia la conferma</button>'
            + '<div class="esito" id="c-esito"></div>'
            + '</div></form>';
    }

    function disegna() {
        box.innerHTML = serataHtml() + rovesciaHtml() + moduloHtml();
        collega();
        avviaRovescia();
        if (scaduta()) chiudiModulo();
    }

    function collega() {
        var ospiti = el('ospiti'), nomi = el('nomi'), quanti = el('c-quanti');
        var radio = document.querySelectorAll('input[name="presente"]');

        function mostraOspiti() {
            var si = el('opz-si').querySelector('input').checked;
            var no = el('opz-no').querySelector('input').checked;
            el('opz-si').className = 'opz' + (si ? ' scelta-si' : '');
            el('opz-no').className = 'opz' + (no ? ' scelta-no' : '');
            ospiti.hidden = !si;
            if (!si) { quanti.value = '0'; disegnaNomi(); }
        }
        /* Una casella per ospite, con quello che era gia' stato scritto: chi
           passa da tre a due ospiti non deve riscrivere i primi due nomi. */
        function disegnaNomi() {
            var n = Number(quanti.value) || 0;
            var vecchi = [];
            var caselle = nomi.querySelectorAll('input');
            for (var i = 0; i < caselle.length; i++) vecchi.push(caselle[i].value);
            var html = '';
            for (var j = 0; j < n; j++) {
                html += '<input type="text" class="nome-ospite" maxlength="120" placeholder="Nome e cognome del '
                    + (j + 1) + '&deg; ospite (facoltativo)" value="' + esc(vecchi[j] || '') + '">';
            }
            nomi.innerHTML = html;
            nomi.hidden = n === 0;
        }
        for (var i = 0; i < radio.length; i++) radio[i].addEventListener('change', mostraOspiti);
        quanti.addEventListener('change', disegnaNomi);
        el('modulo').addEventListener('submit', invia);
        mostraOspiti();
    }

    function invia(ev) {
        ev.preventDefault();
        var esito = el('c-esito'), bottone = el('c-invia');
        function ko(msg) { esito.className = 'esito ko'; esito.textContent = msg; }

        if (scaduta()) { chiudiModulo(); ko('Le conferme sono chiuse.'); return; }

        var nome = el('c-nome').value.trim();
        var cognome = el('c-cognome').value.trim();
        var email = el('c-email').value.trim();
        var si = el('opz-si').querySelector('input').checked;
        var no = el('opz-no').querySelector('input').checked;
        if (!nome || !cognome) { ko('Indichi nome e cognome.'); return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { ko('Controlli l\'indirizzo email.'); return; }
        if (!si && !no) { ko('Ci dica se sarà presente alla cena.'); return; }

        var nomiOspiti = [];
        var caselle = document.querySelectorAll('.nome-ospite');
        for (var i = 0; i < caselle.length; i++) {
            var v = caselle[i].value.trim();
            if (v) nomiOspiti.push(v);
        }
        var corpo = {
            azione: 'cena-conferma',
            cena: cena.id,
            nome: nome, cognome: cognome, email: email,
            telefono: el('c-tel').value.trim(),
            presente: si,
            quantiOspiti: si ? (Number(el('c-quanti').value) || 0) : 0,
            ospiti: si ? nomiOspiti : [],
            note: el('c-note').value.trim(),
            origine: location.pathname
        };

        bottone.disabled = true;
        esito.className = 'esito';
        esito.textContent = 'Invio in corso…';
        fetch(API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(corpo)
        }).then(function (r) {
            return r.json().catch(function () { return {}; });
        }).then(function (d) {
            bottone.disabled = false;
            if (!d || !d.ok) {
                if (d && d.chiusa) { chiudiModulo(); }
                ko((d && d.msg) || 'Non siamo riusciti a registrare la conferma: riprovi fra poco.');
                return;
            }
            fatto(d, corpo);
        }).catch(function () {
            bottone.disabled = false;
            ko('Servizio non raggiungibile: riprovi fra qualche minuto.');
        });
    }

    /* Quello che si vede dopo l'invio. Ripete quello che abbiamo scritto -
       presente o no, quanti posti - perche' chi ha appena compilato deve
       poter verificare subito, non alla mail che arrivera' fra un minuto. */
    function fatto(d, corpo) {
        if (battito) { clearInterval(battito); battito = null; }
        var posti = Number(d.posti) || 0;
        var riepilogo = d.presente
            ? '<b>' + posti + ' ' + (posti === 1 ? 'posto' : 'posti') + '</b> a tavola'
                + (corpo.quantiOspiti ? ' (Lei e ' + corpo.quantiOspiti + (corpo.quantiOspiti === 1 ? ' ospite' : ' ospiti') + ')' : ' (Lei)')
                + (corpo.ospiti.length ? '<br>Ospiti: ' + esc(corpo.ospiti.join(', ')) : '')
                + (corpo.note ? '<br>Note: ' + esc(corpo.note) : '')
            : 'Abbiamo registrato che non potrà partecipare.';
        box.innerHTML = '<div class="fatto">'
            + '<div class="segno">&#10003;</div>'
            + '<h2>' + (d.aggiornata ? 'Risposta aggiornata' : 'Grazie, abbiamo registrato la Sua risposta') + '</h2>'
            + '<p>' + esc(cena.titolo) + ' &middot; ' + esc(cena.quando) + '</p>'
            + '<div class="riepilogo">' + riepilogo + '</div>'
            + '<p style="margin-top:14px;font-size:0.9rem;">'
            + (d.mail ? 'Le abbiamo mandato il riepilogo per email.' : 'Il riepilogo per email potrebbe arrivare con qualche minuto di ritardo.')
            + '</p>'
            + '<button type="button" class="rifai" id="rifai">Modifica la risposta</button>'
            + '</div>';
        el('rifai').addEventListener('click', function () {
            disegna();
            // i campi si ricompilano con quello che era stato mandato: chi cambia
            // una cosa sola non deve riscrivere tutto il resto
            el('c-nome').value = corpo.nome;
            el('c-cognome').value = corpo.cognome;
            el('c-email').value = corpo.email;
            el('c-tel').value = corpo.telefono || '';
            el('c-note').value = corpo.note || '';
            var r = document.querySelector('input[name="presente"][value="' + (corpo.presente ? 'si' : 'no') + '"]');
            if (r) { r.checked = true; r.dispatchEvent(new Event('change')); }
            if (corpo.presente && corpo.quantiOspiti) {
                el('c-quanti').value = String(corpo.quantiOspiti);
                el('c-quanti').dispatchEvent(new Event('change'));
                var caselle = document.querySelectorAll('.nome-ospite');
                for (var i = 0; i < caselle.length && i < corpo.ospiti.length; i++) caselle[i].value = corpo.ospiti[i];
            }
        });
    }

    /* --- avvio ---
       Prima la scheda della serata dal servizio; se non risponde si va avanti
       con la copia di riserva scritta nell'HTML, che ha data e titolo ma non
       il termine: in quel caso il conto alla rovescia non si mostra, perche'
       un conto alla rovescia sbagliato e' peggio che nessuno. */
    function avvia() {
        if (!P.id) {
            box.innerHTML = '<div class="avviso errore">Pagina non configurata.</div>';
            return;
        }
        box.innerHTML = '<div class="avviso">Un momento&hellip;</div>';
        fetch(API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ azione: 'cena-leggi', cena: P.id })
        }).then(function (r) {
            return r.json().catch(function () { return {}; });
        }).then(function (d) {
            if (!d || !d.ok || !d.cena) throw new Error('scheda non letta');
            cena = d.cena;
            if (d.adesso) scartoOrologio = Number(d.adesso) - Date.now();
            disegna();
        }).catch(function () {
            cena = {
                id: P.id, titolo: P.titolo || '', quando: P.quando || '',
                ora: P.ora || '', luogo: P.luogo || '', chi: P.chi || '',
                ospitiMax: Number(P.ospitiMax) || 3, scadenza: 0
            };
            box.innerHTML = serataHtml() + moduloHtml();
            collega();
            el('c-esito').className = 'esito ko';
            el('c-esito').textContent = 'Il servizio non risponde: può compilare, ma l\'invio potrebbe non riuscire.';
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvia);
    else avvia();
})();
