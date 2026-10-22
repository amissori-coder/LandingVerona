/* ========================
   DOMANDE E CONTATTI
   Il modulo delle domande del sito: un tema (e, per gli eventi, quale
   evento e perche'), la domanda e un recapito. Va al servizio email
   con l'azione "domanda-sito": li' si salva e parte la mail a
   info@nextgenerationbusiness.it, con la risposta all'indirizzo di chi
   scrive, piu' una conferma a chi ha scritto. Questa pagina controlla
   solo quello che serve a non far aspettare una risposta "manca il
   nome": le regole vere le tiene il servizio.

   Niente campo "pagina" nel corpo: una pagina col nome di un evento
   (Milano) farebbe passare la domanda per un'iscrizione.
   (text/plain evita la richiesta di verifica preliminare del browser; il
   contenuto e' comunque JSON e il servizio lo legge come tale.)
   ======================== */
(function () {
    'use strict';

    const SERVIZIO = 'https://revilaw-email.vercel.app/api/iscrizione-nuova';
    const INFO = 'info@nextgenerationbusiness.it';
    const TELEFONO = '+39 045 8010734';
    const $ = (id) => document.getElementById(id);

    const form = $('domandeForm');
    if (!form) return;

    /* Il tempo passato sul modulo (campo "ms"): un modulo compilato in un
       secondo e' un programma, e il servizio lo scarta. Si conta da quando
       la persona comincia a usarlo (il primo campo toccato, scritto o
       cambiato), non da quando si apre la pagina: tornando indietro il
       browser puo' rimettere il modulo gia' compilato, e chi lo ricontrolla
       prima di spedirlo non deve risultare "troppo veloce". Chi invece preme
       subito «Invia» comincia a contare li': se il servizio risponde di
       attendere un attimo (lo dice nel messaggio), il secondo invio passa. */
    let toccato = 0;
    const tocca = () => { if (!toccato) toccato = Date.now(); };
    ['focusin', 'input', 'change'].forEach(t => form.addEventListener(t, tocca, true));

    const campoTema = $('tema');
    const campoEvento = $('evento');
    const campoMotivo = $('motivo');
    const campoMessaggio = $('messaggio');
    const gruppoEvento = $('gruppoEvento');
    const gruppoMotivo = $('gruppoMotivo');
    const aiutoMail = $('aiutoMail');
    const conta = $('messaggioConta');
    const btnInvia = $('domandeInvia');
    const erroreInvio = $('domandeErrore');
    const MAX_MESSAGGIO = 2000;

    // gli id che il servizio riconosce: quelli delle tendine, e nient'altro
    const valori = (sel) => Array.prototype.map.call(sel.options, o => o.value).filter(Boolean);
    const TEMI = valori(campoTema);
    const EVENTI = valori(campoEvento);
    const MOTIVI = valori(campoMotivo);

    /* Per chi non ha ricevuto la mail di conferma il messaggio parte gia'
       scritto, con il posto per l'indirizzo usato all'iscrizione. Dice di
       quale evento si tratta, con le parole della pagina dell'evento. */
    const FRASE_EVENTO = {
        'milano-2027': 'al convegno Next Generation Business di Milano (26 febbraio 2027)',
        'milano-2027-aderenti': 'alla cena e al meeting degli aderenti di Milano (26-27 febbraio 2027)',
        'napoli-2026': 'al convegno Next Generation Business di Napoli (1-2 ottobre 2026)',
        'roma-2026': 'al convegno Next Generation Business di Roma (29 aprile 2026)',
        'verona-2026': 'al convegno Next Generation Business di Verona (27 marzo 2026)'
    };
    function testoMailNonRicevuta() {
        return 'Mi sono iscritto ' + (FRASE_EVENTO[campoEvento.value] || 'a un convegno Next Generation Business')
            + ' ma non ho ricevuto la mail di conferma. L\'indirizzo email che ho usato per iscrivermi è: ';
    }
    // il testo messo dalla pagina: finche' la persona non lo tocca, la pagina lo puo' cambiare
    let testoAuto = '';

    function errore(id, testo) {
        const campo = $(id);
        const el = $(id + 'Errore');
        if (el) el.textContent = testo || '';
        if (!campo) return;
        if (campo.type !== 'checkbox') campo.classList.toggle('errore', !!testo);
        if (testo) campo.setAttribute('aria-invalid', 'true'); else campo.removeAttribute('aria-invalid');
    }

    function aggiornaConta() {
        const n = campoMessaggio.value.length;
        conta.textContent = n + ' / ' + MAX_MESSAGGIO + ' caratteri';
        conta.classList.toggle('vicino', n > MAX_MESSAGGIO - 200);
    }

    // ---------- tema, evento, motivo ----------
    /* Evento e motivo servono solo per le domande sugli eventi: con un
       altro tema spariscono e non sono obbligatori. Con "mail non
       ricevuta" compare il riquadro con dove cercarla, il telefono
       diventa consigliato (se la posta non arriva, si chiama) e il
       messaggio, se e' vuoto, parte gia' scritto. */
    function aggiornaScelte() {
        const eventi = campoTema.value === 'eventi';
        gruppoEvento.hidden = !eventi;
        gruppoMotivo.hidden = !eventi;
        campoEvento.required = eventi;
        campoMotivo.required = eventi;
        if (!eventi) { errore('evento', ''); errore('motivo', ''); }

        const mail = eventi && campoMotivo.value === 'mail-non-ricevuta';
        /* La cena e il meeting degli aderenti non hanno una mail di conferma
           da recuperare: con "mail non ricevuta" la voce sparisce, e chi
           l'aveva scelta passa al convegno di Milano. */
        const voceAderenti = campoEvento.querySelector('option[value="milano-2027-aderenti"]');
        if (voceAderenti) {
            voceAderenti.hidden = mail;
            voceAderenti.disabled = mail;
            if (mail && campoEvento.value === 'milano-2027-aderenti') campoEvento.value = 'milano-2027';
        }
        aiutoMail.hidden = !mail;
        $('telefonoQuanto').textContent = mail ? '(consigliato)' : '(facoltativo)';
        $('telefonoNota').hidden = !mail;

        const attuale = campoMessaggio.value;
        if (mail && (!attuale.trim() || attuale === testoAuto)) {
            testoAuto = testoMailNonRicevuta();
            campoMessaggio.value = testoAuto;
        } else if (!mail && testoAuto && attuale === testoAuto) {
            // cambiato il motivo, il testo messo dalla pagina non c'entra piu'
            campoMessaggio.value = '';
            testoAuto = '';
        }
        aggiornaConta();
    }

    /* Il collegamento puo' portare gia' tema, evento e motivo
       (?tema=eventi&evento=milano-2027&motivo=mail-non-ricevuta), oppure la
       forma corta degli SMS e delle mail, ?t=mail. Dall'indirizzo si
       leggono SOLO queste scelte, mai dati della persona: l'indirizzo
       della pagina finisce nelle statistiche. */
    function applicaScelte(tema, evento, motivo) {
        if (EVENTI.indexOf(evento) < 0) evento = '';
        if (MOTIVI.indexOf(motivo) < 0) motivo = '';
        if (TEMI.indexOf(tema) < 0) tema = (evento || motivo) ? 'eventi' : '';
        if (!tema) return false;
        campoTema.value = tema;
        if (tema === 'eventi') {
            campoEvento.value = evento;
            campoMotivo.value = motivo;
        }
        aggiornaScelte();
        return true;
    }
    function scelteDa(ricerca) {
        const q = new URLSearchParams(ricerca || '');
        if (q.get('t') === 'mail') return ['eventi', 'milano-2027', 'mail-non-ricevuta'];
        return [String(q.get('tema') || ''), String(q.get('evento') || ''), String(q.get('motivo') || '')];
    }

    campoTema.addEventListener('change', () => { errore('tema', ''); aggiornaScelte(); });
    // l'evento cambiato cambia anche la frase gia' scritta, se nessuno l'ha toccata
    campoEvento.addEventListener('change', () => { errore('evento', ''); aggiornaScelte(); });
    campoMotivo.addEventListener('change', () => { errore('motivo', ''); aggiornaScelte(); });
    campoMessaggio.addEventListener('input', aggiornaConta);

    const daIndirizzo = scelteDa(location.search);
    if (applicaScelte(daIndirizzo[0], daIndirizzo[1], daIndirizzo[2])) {
        // arrivando con le scelte gia' fatte (dall'SMS, da una mail) si va dritti al modulo
        requestAnimationFrame(() => { $('schedaModulo').scrollIntoView({ block: 'start' }); });
    } else {
        aggiornaScelte();
    }

    // ---------- campi obbligatori ----------
    function valida(campo) {
        if (campo.type === 'checkbox') {
            errore(campo.id, campo.checked ? '' : 'Per inviare la domanda serve il consenso al trattamento dei dati.');
            return campo.checked;
        }
        const v = campo.value.trim();
        if (campo.required && !v) {
            errore(campo.id, campo.tagName === 'SELECT' ? 'Scegli una voce dall\'elenco.' : 'Campo obbligatorio.');
            return false;
        }
        if (campo.type === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) {
            errore(campo.id, 'Scrivi un indirizzo email valido, per esempio nome@azienda.it.');
            return false;
        }
        if (campo === campoMessaggio && testoAuto && v === testoAuto.trim()) {
            errore(campo.id, 'Completa il messaggio: scrivi l\'indirizzo email che hai usato per iscriverti.');
            return false;
        }
        errore(campo.id, '');
        return true;
    }
    const daControllare = () => Array.prototype.slice.call(form.querySelectorAll('[required]'))
        .filter(el => !el.closest('[hidden]'));
    Array.prototype.forEach.call(form.querySelectorAll('input, select, textarea'), campo => {
        if (campo.id === 'sito') return;
        if (campo.type === 'checkbox') { campo.addEventListener('change', () => { if (campo.required) valida(campo); }); return; }
        campo.addEventListener('blur', () => { if (campo.required || campo.value.trim()) valida(campo); });
        campo.addEventListener('input', () => { if (campo.classList.contains('errore')) valida(campo); });
    });

    /* ---------- la casella "non sono un robot" ----------
       Cloudflare Turnstile, con la stessa chiave PUBBLICA della pagina di
       Milano (milano_febbraio_2027/script.js): la segreta sta nel servizio
       (TURNSTILE_SECRET). La casella si vede SOLO quando Cloudflare chiede
       davvero un clic (appearance: interaction-only); di solito non chiede
       niente. Il gettone vale una volta: dopo ogni invio se ne prepara uno
       nuovo. Se lo script di Cloudflare non si carica (bloccato dalla rete o
       da un'estensione del browser) la domanda parte senza gettone: se il
       servizio ha la chiave segreta la rifiuta (captchaKo), e allora non
       serve riprovare, si dice di scriverci per mail o di chiamarci; senza
       la chiave la accetta. */
    const TURNSTILE_CHIAVE = '0x4AAAAAAFZkLXVSuromvnHp';
    const boxCaptcha = $('captcha');
    const captcha = { id: null, gettone: '', guasto: false };
    let attesaGettone = [];
    function gettonePronto(g) {
        captcha.gettone = g || '';
        attesaGettone.splice(0).forEach(f => f(captcha.gettone));
    }
    function preparaCaptcha() {
        if (!TURNSTILE_CHIAVE || !window.turnstile) return;
        boxCaptcha.hidden = false;
        captcha.id = window.turnstile.render(boxCaptcha, {
            sitekey: TURNSTILE_CHIAVE, language: 'it', action: 'domanda-sito',
            appearance: 'interaction-only', size: 'flexible', theme: 'light',
            callback: gettonePronto,
            'expired-callback': () => { captcha.gettone = ''; },
            'error-callback': () => { captcha.gettone = ''; },
            'before-interactive-callback': () => { boxCaptcha.classList.add('captcha--visibile'); },
            'after-interactive-callback': () => { boxCaptcha.classList.remove('captcha--visibile'); }
        });
    }
    // il gettone, aspettandolo al massimo `ms` millisecondi: '' se non arriva
    function aspettaGettone(ms) {
        if (!TURNSTILE_CHIAVE || captcha.guasto) return Promise.resolve('');
        if (captcha.gettone) return Promise.resolve(captcha.gettone);
        return new Promise(fine => {
            const t = setTimeout(() => { attesaGettone = attesaGettone.filter(f => f !== pronto); fine(''); }, ms);
            const pronto = g => { clearTimeout(t); fine(g); };
            attesaGettone.push(pronto);
        });
    }
    function rinnovaCaptcha() {
        captcha.gettone = '';
        if (captcha.id !== null && window.turnstile) window.turnstile.reset(captcha.id);
    }
    if (TURNSTILE_CHIAVE) {
        window.ngbCaptchaContatti = preparaCaptcha;
        const sc = document.createElement('script');
        sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=ngbCaptchaContatti';
        sc.async = true;
        sc.defer = true;
        sc.onerror = () => { captcha.guasto = true; gettonePronto(''); };
        document.head.appendChild(sc);
    }

    // ---------- invio ----------
    const ETICHETTA = btnInvia.textContent;
    function inAttesa(testo) {
        btnInvia.disabled = !!testo;
        btnInvia.textContent = testo || ETICHETTA;
    }
    function vaiA(el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (el.focus) el.focus({ preventScroll: true });
    }
    // testo semplice nel messaggio d'errore, con la mail pronta per chi preferisce scriverci
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    }
    function mailPronta() {
        const tema = campoTema.selectedIndex > 0 ? campoTema.options[campoTema.selectedIndex].text : '';
        const oggetto = 'Domanda dal sito' + (tema ? ' - ' + tema : '');
        return 'mailto:' + INFO + '?subject=' + encodeURIComponent(oggetto)
            + '&body=' + encodeURIComponent(campoMessaggio.value.slice(0, 1500));
    }
    /* L'indirizzo e il telefono, se il testo li nomina, diventano
       collegamenti (la mail con il messaggio gia' scritto); se non nomina
       l'indirizzo, con conMail lo si aggiunge in fondo. */
    function mostraErrore(testo, conMail) {
        let html = esc(testo);
        const mail = '<a href="' + esc(mailPronta()) + '">' + INFO + '</a>';
        if (conMail && html.indexOf(INFO) >= 0) html = html.split(INFO).join(mail);
        else if (conMail) html += ' Puoi anche scriverci direttamente a ' + mail + '.';
        html = html.split(TELEFONO).join('<a href="tel:' + TELEFONO.replace(/\s/g, '') + '">' + TELEFONO + '</a>');
        erroreInvio.innerHTML = html;
    }

    function grazie(nome, email, motivo) {
        $('grazieNome').textContent = nome ? ', ' + nome : '';
        $('grazieEmail').textContent = email;
        $('grazieMail').hidden = motivo !== 'mail-non-ricevuta';
        form.hidden = true;
        const fatto = $('domandaInviata');
        fatto.hidden = false;
        $('schedaModulo').scrollIntoView({ behavior: 'smooth', block: 'start' });
        fatto.focus({ preventScroll: true });
    }

    let inCorso = false;
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (inCorso) return;
        tocca();
        erroreInvio.textContent = '';
        let primo = null;
        daControllare().forEach(campo => { if (!valida(campo) && !primo) primo = campo; });
        if (primo) { vaiA(primo); return; }

        inCorso = true;
        inAttesa(captcha.gettone || !TURNSTILE_CHIAVE || captcha.guasto ? 'Invio in corso...' : 'Verifica in corso...');
        const valore = id => String(($(id) || {}).value || '').trim();
        const eventi = campoTema.value === 'eventi';
        const motivo = eventi ? campoMotivo.value : '';

        aspettaGettone(15000).then(gettone => {
            // Turnstile c'e' ma il gettone non e' arrivato: di solito chiede un clic
            if (TURNSTILE_CHIAVE && !captcha.guasto && window.turnstile && !gettone) {
                boxCaptcha.hidden = false;
                boxCaptcha.classList.add('captcha--visibile');
                mostraErrore('Completa la verifica di sicurezza qui sopra, poi premi di nuovo «Invia la domanda».', true);
                return null;
            }
            inAttesa('Invio in corso...');
            if (typeof window.gtag === 'function') window.gtag('event', 'invio_form', { pagina: 'Domande e contatti', tema: campoTema.value });
            return fetch(SERVIZIO, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
                body: JSON.stringify({
                    azione: 'domanda-sito',
                    nome: valore('nome'), cognome: valore('cognome'), email: valore('email'),
                    telefono: valore('telefono'), azienda: valore('azienda'),
                    tema: campoTema.value,
                    evento: eventi ? campoEvento.value : '',
                    motivo: motivo,
                    messaggio: campoMessaggio.value.trim().slice(0, MAX_MESSAGGIO),
                    privacy: $('privacy').checked === true,
                    marketing: $('marketing').checked === true,
                    captcha: gettone,
                    sito: $('sito').value,
                    ms: Date.now() - toccato
                })
            }).then(r => r.json().catch(() => ({})).then(d => Object.assign({ _stato: r.status }, d)));
        }).then(d => {
            inCorso = false;
            if (d === null) { inAttesa(''); return; }   // la verifica di sicurezza non e' finita: gia' detto
            if (d.ok) { grazie(valore('nome'), valore('email'), motivo); return; }
            rinnovaCaptcha();
            inAttesa('');
            // due freni diversi, e il servizio dice quale: troppi invii da questa rete, o troppe domande oggi da questo indirizzo
            if (d._stato === 429) {
                mostraErrore(d.msg || 'Abbiamo ricevuto troppe richieste ravvicinate da questa rete: riprova fra qualche minuto.', true);
                return;
            }
            if (d.captchaKo) {
                // lo script di Cloudflare non c'e': riprovare non serve, e la casella resterebbe vuota
                if (captcha.guasto || !window.turnstile) {
                    boxCaptcha.hidden = true;
                    mostraErrore('La verifica di sicurezza di Cloudflare non si carica su questa rete o con le estensioni attive nel browser, e senza di essa il modulo non può partire. Scrivici direttamente a ' + INFO + ' (il collegamento apre una mail con il tuo messaggio già scritto) oppure chiamaci al numero ' + TELEFONO + '.', true);
                    return;
                }
                boxCaptcha.hidden = false;
                mostraErrore('La verifica di sicurezza non è andata a buon fine: attendi qualche secondo e premi di nuovo «Invia la domanda». Se Cloudflare mostra una casella, spuntala.', true);
                return;
            }
            // l'errore accanto al campo che lo ha causato, quando si sa quale
            const campo = d.campo && $(String(d.campo));
            if (campo && campo.form === form && campo.id !== 'sito' && !campo.closest('[hidden]')) {
                errore(campo.id, d.msg || 'Controlla questo campo.');
                vaiA(campo);
                return;
            }
            mostraErrore(d.msg || 'Non siamo riusciti a inviare la domanda. Riprova fra qualche minuto.', true);
        }).catch(() => {
            inCorso = false;
            rinnovaCaptcha();
            inAttesa('');
            mostraErrore('Il servizio non risponde in questo momento. Riprova fra qualche minuto.', true);
        });
    });
})();
