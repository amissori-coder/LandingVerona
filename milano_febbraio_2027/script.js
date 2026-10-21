/**
 * Next Generation Business – Milano, 26 febbraio 2027
 * Navigazione, conto alla rovescia, animazioni allo scorrimento e il
 * modulo di iscrizione (cellulare verificato per SMS, poi conferma email).
 */

document.addEventListener('DOMContentLoaded', () => {

    // ========================
    // NAVBAR
    // ========================
    const navbar = document.getElementById('navbar');
    const navToggle = document.getElementById('navToggle');
    const navMenu = document.getElementById('navMenu');

    const aggiornaNavbar = () => navbar.classList.toggle('scrolled', window.scrollY > 40);
    window.addEventListener('scroll', aggiornaNavbar, { passive: true });
    aggiornaNavbar();

    navToggle.addEventListener('click', () => {
        const aperto = navMenu.classList.toggle('active');
        navToggle.classList.toggle('active', aperto);
        navToggle.setAttribute('aria-expanded', String(aperto));
    });

    navMenu.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            navToggle.classList.remove('active');
            navMenu.classList.remove('active');
            navToggle.setAttribute('aria-expanded', 'false');
        });
    });

    // ========================
    // CONTO ALLA ROVESCIA
    // La giornata del 26 febbraio 2027 va dalle 8.30 alle 18.00 (ora di Milano).
    // ========================
    const eventDate = new Date('2027-02-26T08:30:00+01:00').getTime();
    const eventEnd = new Date('2027-02-26T18:00:00+01:00').getTime();
    const countdownEl = document.getElementById('countdown');
    const daysEl = document.getElementById('days');
    const hoursEl = document.getElementById('hours');
    const minutesEl = document.getElementById('minutes');
    const secondsEl = document.getElementById('seconds');
    let timer = null;

    function updateCountdown() {
        const now = Date.now();
        const distance = eventDate - now;

        if (distance < 0) {
            const testo = now < eventEnd ? 'L\'evento è in corso' : 'L\'evento si è concluso';
            countdownEl.innerHTML = '<p>' + testo + '</p>';
            if (timer) clearInterval(timer);
            return;
        }

        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        daysEl.textContent = String(days).padStart(2, '0');
        hoursEl.textContent = String(hours).padStart(2, '0');
        minutesEl.textContent = String(minutes).padStart(2, '0');
        secondsEl.textContent = String(seconds).padStart(2, '0');
    }

    if (countdownEl) {
        updateCountdown();
        timer = setInterval(updateCountdown, 1000);
    }

    // ========================
    // ANIMAZIONI ALLO SCORRIMENTO
    // ========================
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    document.querySelectorAll('.momento, .pranzo, .percorso li, .sede-info, .sede-mappa, .presenza, .scarica').forEach((el, index) => {
        el.classList.add('fade-in');
        el.style.transitionDelay = `${(index % 4) * 0.08}s`;
        observer.observe(el);
    });

    // ========================
    // ANTEPRIMA DEGLI APPROFONDIMENTI
    // Un clic su un tema della giornata non porta subito via dalla pagina:
    // apre una finestra con l'immagine, il titolo e la descrizione della
    // pagina di approfondimento (letti dalla pagina stessa) e chiede se
    // andarci. Ctrl/Cmd/Maiusc + clic e il clic centrale restano quelli
    // del browser (nuova scheda o finestra). Senza <dialog> il link va
    // dritto alla pagina, come prima.
    // ========================
    const dialogo = document.getElementById('anteprima');
    if (dialogo && typeof dialogo.showModal === 'function') {
        const img = document.getElementById('anteprima-img');
        const titolo = document.getElementById('anteprima-titolo');
        const testo = document.getElementById('anteprima-testo');
        const vai = document.getElementById('anteprima-vai');
        const cache = new Map();
        let richiesta = 0;

        const leggiPagina = (url) => {
            if (!cache.has(url)) {
                cache.set(url, fetch(url, { credentials: 'same-origin' })
                    .then(r => { if (!r.ok) throw new Error(r.status); return r.text(); })
                    .then(html => {
                        const doc = new DOMParser().parseFromString(html, 'text/html');
                        const meta = (sel) => (doc.querySelector(sel) || {}).content || '';
                        const h1 = doc.querySelector('h1');
                        if (h1) h1.querySelectorAll('br').forEach(br => br.replaceWith(' '));
                        const nome = (h1 && h1.textContent.replace(/\s+/g, ' ').trim())
                            || meta('meta[property="og:title"]').replace(/\s*\|.*$/, '')
                            || doc.title;
                        const immagine = meta('meta[property="og:image"]');
                        let src = '';
                        // Stesso sito: l'immagine si prende dal percorso, cosi' funziona anche in prova.
                        if (immagine) { try { const u = new URL(immagine, url); src = u.pathname + u.search; } catch (e) {} }
                        return { nome, descrizione: meta('meta[name="description"]'), src };
                    })
                    .catch(err => { cache.delete(url); throw err; }));
            }
            return cache.get(url);
        };

        const apri = (link) => {
            const id = ++richiesta;
            vai.href = link.href;
            titolo.textContent = link.textContent.trim();
            testo.textContent = '';
            img.classList.remove('caricata');
            img.removeAttribute('src');
            dialogo.classList.add('in-caricamento');
            dialogo.showModal();
            vai.focus();

            leggiPagina(link.href).then(info => {
                if (id !== richiesta) return;
                titolo.textContent = info.nome || titolo.textContent;
                testo.textContent = info.descrizione;
                if (info.src) {
                    img.onload = () => img.classList.add('caricata');
                    img.src = info.src;
                }
            }).catch(() => {
                if (id === richiesta) testo.textContent = 'Anteprima non disponibile: puoi comunque aprire la pagina.';
            }).finally(() => {
                if (id === richiesta) dialogo.classList.remove('in-caricamento');
            });
        };

        document.querySelectorAll('.momento-temi a').forEach(link => {
            link.addEventListener('click', (e) => {
                if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                e.preventDefault();
                apri(link);
            });
            // Si comincia a leggere la pagina appena il puntatore ci passa sopra.
            link.addEventListener('pointerenter', () => { leggiPagina(link.href).catch(() => {}); }, { once: true });
        });

        const chiudi = () => dialogo.close();
        document.getElementById('anteprima-annulla').addEventListener('click', chiudi);
        document.getElementById('anteprima-chiudi').addEventListener('click', chiudi);
        // Clic sullo sfondo scuro, fuori dalla finestra.
        dialogo.addEventListener('click', (e) => {
            const r = dialogo.getBoundingClientRect();
            if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) chiudi();
        });
    }
});

/* ========================
   MODULO DI ISCRIZIONE
   Due conferme: il cellulare con il codice SMS, qui dentro e prima di
   inviare, e l'indirizzo email con il pulsante della mail che parte
   dopo l'invio. Il servizio (email-service/lib/iscrizione-verificata.js)
   tiene le regole - un'iscrizione per email e per numero, due per
   codice invito - e questa pagina le anticipa, perche' scoprirle dopo
   aver compilato tutto e' il modo migliore per far abbandonare.
   (text/plain evita la richiesta di verifica preliminare del browser; il
   contenuto e' comunque JSON e il servizio lo legge come tale.)
   ======================== */
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('moduloIscrizione');
    if (!form) return;

    const SERVIZIO = 'https://revilaw-email.vercel.app/api/iscrizione-nuova';
    const PAGINA = 'Milano 26 Febbraio 2027 - Iscrizione';
    const $ = (id) => document.getElementById(id);
    const chiama = (corpo) => fetch(SERVIZIO, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(Object.assign({ pagina: PAGINA }, corpo))
    }).then(r => r.json().catch(() => ({})).then(d => Object.assign({ _stato: r.status }, d)));

    function errore(id, testo) {
        const campo = $(id);
        const el = $(id + 'Error');
        if (el) el.textContent = testo || '';
        if (campo && campo.type !== 'checkbox') campo.classList.toggle('errore', !!testo);
    }

    // ---------- il cellulare ----------
    /* Stessa regola del servizio: cellulare italiano, 3 e poi 8 o 9 cifre,
       con o senza +39. Qui serve solo a dire subito "non e' un cellulare". */
    function cellulare(v) {
        let s = String(v || '').replace(/[\s().\-\/]/g, '');
        if (s.indexOf('00') === 0) s = '+' + s.slice(2);
        if (s.indexOf('+') === 0) { if (s.indexOf('+39') !== 0) return ''; s = s.slice(3); }
        else if (/^393\d{8,9}$/.test(s) && s.length > 10) s = s.slice(2);
        return /^3\d{8,9}$/.test(s) ? '+39' + s : '';
    }
    const campoTel = $('telefono');
    const btnInvia = $('smsInvia');
    const btnVerifica = $('smsVerifica');
    const btnDiNuovo = $('smsDiNuovo');
    const campoSms = $('codiceSms');
    const gruppoSms = $('gruppoSms');
    const telOk = $('telefonoOk');
    const smsNota = $('smsNota');
    // il numero verificato e la firma che il servizio ha reso: viaggiano con l'iscrizione
    let verificato = { numero: '', token: '' };

    /* ---------- la casella "non sono un robot" ----------
       Cloudflare Turnstile, prima di ogni SMS (gli SMS costano, e un programma
       che li chiede a raffica svuota i crediti). TURNSTILE_CHIAVE e' la chiave
       PUBBLICA del sito, dal pannello Cloudflare (Turnstile -> il sito): la
       segreta sta nel servizio (TURNSTILE_SECRET). Vuota, la casella non
       compare, e il servizio senza la segreta non la chiede. Il gettone vale
       una volta: dopo ogni richiesta se ne prepara uno nuovo. */
    const TURNSTILE_CHIAVE = '0x4AAAAAAFZkLXVSuromvnHp';
    const boxCaptcha = $('captcha');
    let captcha = { id: null, gettone: '' };
    /* La casella si vede SOLO quando Cloudflare chiede davvero un clic
       (appearance: interaction-only). Di solito riconosce da se' un telefono o
       un computer normale e non chiede niente: prima la casella compariva gia'
       spuntata, e sul telefono sembrava un errore. Chi preme «Invia il codice»
       prima che la verifica sia finita aspetta qualche secondo, non riceve un
       errore. */
    let attesaGettone = [];
    function gettonePronto(g) {
        captcha.gettone = g;
        errore('telefono', '');
        attesaGettone.splice(0).forEach(f => f(g));
    }
    function preparaCaptcha() {
        if (!TURNSTILE_CHIAVE || !window.turnstile) return;
        boxCaptcha.hidden = false;
        captcha.id = window.turnstile.render(boxCaptcha, {
            sitekey: TURNSTILE_CHIAVE, language: 'it', action: 'sms-iscrizione',
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
        if (!TURNSTILE_CHIAVE) return Promise.resolve('');
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
        window.ngbCaptchaPronto = preparaCaptcha;
        const sc = document.createElement('script');
        sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=ngbCaptchaPronto';
        sc.async = true;
        sc.defer = true;
        document.head.appendChild(sc);
    }
    let numeroInviato = '';
    let attesaTimer = null;

    function contoAllaRovescia(secondi) {
        clearInterval(attesaTimer);
        let restano = secondi;
        btnDiNuovo.disabled = true;
        const scrivi = () => { btnDiNuovo.textContent = 'Invia di nuovo il codice (fra ' + restano + ' s)'; };
        scrivi();
        attesaTimer = setInterval(() => {
            restano--;
            if (restano <= 0) {
                clearInterval(attesaTimer);
                btnDiNuovo.disabled = false;
                btnDiNuovo.textContent = 'Invia di nuovo il codice';
                return;
            }
            scrivi();
        }, 1000);
    }

    function azzeraVerifica() {
        smettiDiAscoltare();
        verificato = { numero: '', token: '' };
        numeroInviato = '';
        clearInterval(attesaTimer);
        campoTel.readOnly = false;
        btnInvia.hidden = false;
        btnInvia.disabled = false;
        btnInvia.textContent = 'Invia il codice';
        gruppoSms.hidden = true;
        campoSms.value = '';
        telOk.textContent = '';
        errore('codiceSms', '');
        if (captcha.id !== null) { boxCaptcha.hidden = false; rinnovaCaptcha(); }
    }

    function inviaCodice() {
        const numero = cellulare(campoTel.value);
        errore('telefono', '');
        if (!numero) {
            errore('telefono', 'Scrivi un numero di cellulare italiano, per esempio 333 123 4567.');
            campoTel.focus();
            return;
        }
        btnInvia.disabled = true;
        btnDiNuovo.disabled = true;
        btnInvia.textContent = captcha.gettone || !TURNSTILE_CHIAVE ? 'Invio...' : 'Verifica in corso...';
        aspettaGettone(15000).then(gettone => {
            if (TURNSTILE_CHIAVE && !gettone) {
                btnInvia.disabled = false;
                btnDiNuovo.disabled = false;
                btnInvia.textContent = 'Invia il codice';
                errore('telefono', 'Completa la verifica di sicurezza qui sotto, poi premi di nuovo «Invia il codice».');
                return null;
            }
            btnInvia.textContent = 'Invio...';
            return chiama({ azione: 'sms-invia', telefono: campoTel.value, email: ($('email').value || '').trim(), captcha: gettone });
        })
            .then(d => {
                if (d === null) return;    // la verifica di sicurezza non e' finita: gia' detto
                rinnovaCaptcha();
                btnInvia.textContent = 'Invia il codice';
                if (!d.ok) {
                    btnInvia.disabled = false;
                    if (d.campo === 'email') { errore('email', d.msg); $('email').focus(); }
                    else errore('telefono', d.msg || 'Non siamo riusciti a mandare l\'SMS. Riprova fra qualche minuto.');
                    if (d.attesa) { gruppoSms.hidden = false; contoAllaRovescia(d.attesa); }
                    return;
                }
                /* Un "ok" senza il numero mascherato non viene da chi spedisce gli
                   SMS: e' un servizio non ancora aggiornato, che avrebbe preso la
                   richiesta per un'iscrizione. Meglio dirlo che fingere un invio. */
                if (!d.numero) {
                    btnInvia.disabled = false;
                    errore('telefono', 'Il servizio di verifica non è ancora attivo. Riprova fra qualche minuto, oppure scrivici a info@nextgenerationbusiness.it.');
                    return;
                }
                numeroInviato = numero;
                // il codice vale per questo numero: per cambiarlo si passa da «Cambia numero»
                campoTel.readOnly = true;
                btnInvia.disabled = false;
                btnInvia.textContent = 'Cambia numero';
                gruppoSms.hidden = false;
                smsNota.textContent = 'Codice inviato a ' + (d.numero || numero) + '. Vale ' + (d.vale || 10) + ' minuti.';
                contoAllaRovescia(d.attesa || 60);
                campoSms.focus();
                ascoltaSms();
            })
            .catch(() => {
                rinnovaCaptcha();
                btnInvia.disabled = false;
                btnInvia.textContent = 'Invia il codice';
                errore('telefono', 'Errore di connessione. Riprova fra qualche secondo.');
            });
    }

    /* ANDROID (Chrome, Edge, Samsung Internet): il codice si legge da solo
       dall'SMS, con il permesso della persona (WebOTP). Funziona perche' l'SMS
       finisce con la riga "@nextgenerationbusiness.it #123456": lega il codice
       a questo sito. Su iPhone ci pensa la tastiera, che propone il codice
       appena arriva (autocomplete="one-time-code"). Dove nessuno dei due c'e',
       il codice si scrive a mano come sempre. */
    let ascoltoSms = null;
    function ascoltaSms() {
        if (!('OTPCredential' in window) || !navigator.credentials) return;
        if (ascoltoSms) ascoltoSms.abort();
        ascoltoSms = new AbortController();
        navigator.credentials.get({ otp: { transport: ['sms'] }, signal: ascoltoSms.signal })
            .then(otp => {
                if (!otp || !otp.code || verificato.token) return;
                campoSms.value = String(otp.code).replace(/\D/g, '').slice(0, 6);
                if (campoSms.value.length === 6) verificaCodice();
            })
            .catch(() => { /* annullato, scaduto o rifiutato: si scrive a mano */ });
    }
    function smettiDiAscoltare() { if (ascoltoSms) { ascoltoSms.abort(); ascoltoSms = null; } }

    function verificaCodice() {
        const codice = campoSms.value.replace(/\D/g, '');
        errore('codiceSms', '');
        if (codice.length !== 6) { errore('codiceSms', 'Il codice è di 6 cifre.'); return; }
        btnVerifica.disabled = true;
        chiama({ azione: 'sms-verifica', telefono: campoTel.value, codice: codice })
            .then(d => {
                btnVerifica.disabled = false;
                if (!d.ok) {
                    errore('codiceSms', d.msg || 'Il codice non è corretto.');
                    if (d.esito === 'scaduto' || d.esito === 'troppi' || d.esito === 'nessuno') btnDiNuovo.disabled = false;
                    return;
                }
                verificato = { numero: numeroInviato || cellulare(campoTel.value), token: String(d.token || '') };
                smettiDiAscoltare();
                clearInterval(attesaTimer);
                gruppoSms.hidden = true;
                campoTel.readOnly = true;
                btnInvia.textContent = 'Cambia numero';
                telOk.textContent = '✓ Numero verificato';
                boxCaptcha.hidden = true;   // a numero verificato la casella non serve piu'
                errore('telefono', '');
            })
            .catch(() => {
                btnVerifica.disabled = false;
                errore('codiceSms', 'Errore di connessione. Riprova fra qualche secondo.');
            });
    }

    btnInvia.addEventListener('click', () => {
        // a numero gia' inviato o verificato, lo stesso pulsante serve a cambiarlo
        if (numeroInviato || verificato.token) { azzeraVerifica(); campoTel.focus(); return; }
        inviaCodice();
    });
    btnDiNuovo.addEventListener('click', inviaCodice);
    btnVerifica.addEventListener('click', verificaCodice);
    campoSms.addEventListener('input', () => {
        const c = campoSms.value.replace(/\D/g, '').slice(0, 6);
        if (campoSms.value !== c) campoSms.value = c;
        if (c.length === 6) verificaCodice();
    });
    campoSms.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); verificaCodice(); } });
    campoTel.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !campoTel.readOnly) { e.preventDefault(); inviaCodice(); }
    });

    // ---------- il codice invito e l'azienda ----------
    /* Facoltativo; se c'e' dev'essere uno di quelli spediti, con ancora un
       posto (vale per due iscrizioni). Riconosciuto, porta nel modulo il
       nome dell'azienda a cui e' stato mandato, e il campo resta fermo:
       e' quello che lega l'iscrizione all'elenco delle aziende invitate.
       Se il servizio non risponde non si blocca nulla: il codice si
       controlla di nuovo all'invio. */
    const campoCodice = $('codiceInvito');
    const codiceOk = $('codiceInvitoOk');
    const campoAzienda = $('azienda');
    const aziendaNota = $('aziendaNota');
    const ripulisci = v => String(v || '').toUpperCase().replace(/[^0-9A-Z]/g, '')
        .replace(/[IL]/g, '1').replace(/O/g, '0').slice(0, 5);
    let statoCodice = { valore: '', esito: 'vuoto', azienda: '' };
    let aziendaDalCodice = false;

    /* Il campo fermo si deve VEDERE fermo, non solo esserlo: con lo stesso
       aspetto degli altri, chi prova a correggere la ragione sociale pensa
       che la pagina non risponda. Il lucchetto e il cursore lo dicono a
       chi guarda; aria-readonly e la nota collegata lo dicono a chi usa un
       lettore di schermo, che altrimenti sente solo "campo di testo". La
       nota si collega solo quando c'e': nascosta, verrebbe letta lo stesso. */
    function applicaAzienda(nome) {
        if (nome) {
            campoAzienda.value = nome;
            campoAzienda.readOnly = true;
            campoAzienda.classList.add('campo-bloccato');
            campoAzienda.setAttribute('aria-readonly', 'true');
            campoAzienda.setAttribute('aria-describedby', 'aziendaNota');
            aziendaDalCodice = true;
            aziendaNota.hidden = false;
            errore('azienda', '');
        } else if (aziendaDalCodice) {
            campoAzienda.value = '';
            campoAzienda.readOnly = false;
            campoAzienda.classList.remove('campo-bloccato');
            campoAzienda.removeAttribute('aria-readonly');
            campoAzienda.removeAttribute('aria-describedby');
            aziendaDalCodice = false;
            aziendaNota.hidden = true;
        }
    }
    function mostraCodice(esito, azienda) {
        codiceOk.textContent = '';
        errore('codiceInvito', '');
        if (esito === 'buono') {
            codiceOk.textContent = azienda ? '✓ Codice riconosciuto: invito a ' + azienda : '✓ Codice riconosciuto.';
            applicaAzienda(azienda);
            return;
        }
        applicaAzienda('');
        if (esito === 'esaurito') errore('codiceInvito', 'Questo codice è già stato usato per due iscrizioni, il massimo previsto. Puoi iscriverti lasciando vuoto il campo, oppure scriverci a info@nextgenerationbusiness.it.');
        else if (esito === 'cattivo') errore('codiceInvito', 'Questo codice non risulta fra quelli inviati. Ricontrollalo sul messaggio che hai ricevuto, oppure lascia il campo vuoto e iscriviti senza.');
        else if (esito === 'corto') errore('codiceInvito', 'Il codice è di 5 caratteri.');
    }
    function verificaInvito() {
        const c = ripulisci(campoCodice.value);
        campoCodice.value = c;
        if (!c) { statoCodice = { valore: '', esito: 'vuoto', azienda: '' }; mostraCodice('vuoto'); return Promise.resolve(true); }
        if (c.length < 5) { statoCodice = { valore: c, esito: 'corto', azienda: '' }; mostraCodice('corto'); return Promise.resolve(false); }
        if (statoCodice.valore === c && statoCodice.esito !== 'ignoto') {
            mostraCodice(statoCodice.esito, statoCodice.azienda);
            return Promise.resolve(statoCodice.esito === 'buono');
        }
        return chiama({ azione: 'verifica-codice', codice: c })
            .then(d => {
                if (d && d.ok) {
                    statoCodice = { valore: c, esito: 'buono', azienda: String(d.azienda || '') };
                } else {
                    statoCodice = { valore: c, esito: d && d.motivo === 'esaurito' ? 'esaurito' : 'cattivo', azienda: '' };
                }
                mostraCodice(statoCodice.esito, statoCodice.azienda);
                return statoCodice.esito === 'buono';
            })
            .catch(() => {
                statoCodice = { valore: c, esito: 'ignoto', azienda: '' };
                mostraCodice('vuoto');
                return true;
            });
    }
    campoCodice.addEventListener('blur', () => { verificaInvito(); });
    campoCodice.addEventListener('input', () => {
        const c = ripulisci(campoCodice.value);
        if (campoCodice.value !== c) campoCodice.value = c;
        if (c.length === 5) verificaInvito();
        else if (statoCodice.esito !== 'vuoto' || aziendaDalCodice) { statoCodice = { valore: '', esito: 'vuoto', azienda: '' }; mostraCodice('vuoto'); }
    });

    // ---------- il ruolo: da elenco, oppure "Altro" scritto a mano ----------
    const campoRuolo = $('ruolo');
    const gruppoRuoloAltro = $('gruppoRuoloAltro');
    const campoRuoloAltro = $('ruoloAltro');
    campoRuolo.addEventListener('change', () => {
        const altro = campoRuolo.value === 'altro';
        gruppoRuoloAltro.hidden = !altro;
        campoRuoloAltro.required = altro;
        if (altro) campoRuoloAltro.focus(); else errore('ruoloAltro', '');
    });
    // nell'elenco degli iscritti si legge il ruolo, non la parola "altro"
    function ruoloScelto() {
        return campoRuolo.value === 'altro' ? campoRuoloAltro.value.trim() : campoRuolo.value;
    }

    // ---------- il tasto «Avanti» della tastiera ----------
    /* Sul telefono il tasto in basso a destra della tastiera, in un campo di
       testo, spedirebbe il modulo a meta': qui porta al campo successivo
       (le tendine e le caselle si saltano solo se nascoste o bloccate). Il
       cellulare e il codice SMS hanno il loro comportamento, gia' sopra. */
    const percorso = () => Array.prototype.slice.call(form.querySelectorAll('input, select, button[type="submit"]'))
        .filter(el => el.type !== 'hidden' && !el.disabled && !el.readOnly && el.offsetParent !== null);
    form.addEventListener('keydown', (e) => {
        const el = e.target;
        if (e.key !== 'Enter' || el.tagName !== 'INPUT' || el.type === 'checkbox' || el === campoTel || el === campoSms) return;
        e.preventDefault();
        const campi = percorso();
        const i = campi.indexOf(el);
        const dopo = campi[i + 1];
        if (dopo) dopo.focus(); else el.blur();
    });

    // ---------- campi obbligatori ----------
    const obbligatori = Array.prototype.slice.call(form.querySelectorAll('[required]'));
    function valida(campo) {
        if (campo.type === 'checkbox') {
            errore(campo.id, campo.checked ? '' : 'Campo obbligatorio');
            return campo.checked;
        }
        const v = campo.value.trim();
        if (!v) { errore(campo.id, 'Campo obbligatorio'); return false; }
        if (campo.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) {
            errore(campo.id, 'Inserire un indirizzo email valido');
            return false;
        }
        if (campo === campoTel) {
            if (!cellulare(v)) { errore('telefono', 'Scrivi un numero di cellulare italiano, per esempio 333 123 4567.'); return false; }
            return true;   // la verifica col codice si controlla all'invio
        }
        errore(campo.id, '');
        return true;
    }
    campoRuoloAltro.addEventListener('input', () => { if (campoRuoloAltro.classList.contains('errore')) valida(campoRuoloAltro); });
    obbligatori.forEach(campo => {
        if (campo.type === 'checkbox') { campo.addEventListener('change', () => valida(campo)); return; }
        campo.addEventListener('blur', () => { if (!campo.readOnly) valida(campo); });
        campo.addEventListener('input', () => { if (campo.classList.contains('errore')) valida(campo); });
    });
    // l'email cambiata dopo un "gia' iscritto" va ricontrollata dal servizio, non da qui
    $('email').addEventListener('input', () => { if ($('emailError').textContent && !$('email').classList.contains('errore')) errore('email', ''); });

    // ---------- la conferma a video ----------
    /* Riepiloga cio' che la persona ha scritto (nome, email, azienda, il
       numero mascherato) e prepara la data in agenda: Google Calendar e un
       file .ics per Outlook e Apple, dalle 8.30 alle 18.00 ora di Milano
       (scritte in UTC: a febbraio Milano e' un'ora avanti). */
    function riempiConferma(c) {
        const chi = (c.nome + ' ' + c.cognome).trim();
        $('fattoNome').textContent = c.nome ? ', ' + c.nome : '';
        $('fattoChi').textContent = chi || '-';
        $('fattoAzienda').textContent = c.azienda || '-';
        $('fattoEmail').textContent = c.email || 'il tuo indirizzo';
        const n = String(c.telefono || '').replace(/^\+39/, '');
        if (n) $('fattoTelefono').textContent = 'Il codice SMS inviato a +39 ' + n.slice(0, 3) + ' ••• ' + n.slice(-4) + ' è stato confermato.';
        const titolo = 'Next Generation Business - Milano';
        const luogo = 'Excelsior Hotel Gallia, Piazza Duca d\'Aosta 9, 20124 Milano';
        const dettagli = 'Merito creditizio, crescita e competitività delle imprese. Convegno, networking lunch e incontri B2B. '
            + 'Programma e orari: https://nextgenerationbusiness.it/milano_febbraio_2027/';
        $('fattoGoogle').href = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
            + '&text=' + encodeURIComponent(titolo) + '&dates=20270226T073000Z/20270226T170000Z'
            + '&location=' + encodeURIComponent(luogo) + '&details=' + encodeURIComponent(dettagli);
        const esc = s => s.replace(/[\\;,]/g, m => '\\' + m);
        const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Revilaw//Next Generation Business//IT', 'BEGIN:VEVENT',
            'UID:ngb-milano-2027@nextgenerationbusiness.it', 'DTSTAMP:20261017T000000Z',
            'DTSTART:20270226T073000Z', 'DTEND:20270226T170000Z',
            'SUMMARY:' + esc(titolo), 'LOCATION:' + esc(luogo), 'DESCRIPTION:' + esc(dettagli),
            'URL:https://nextgenerationbusiness.it/milano_febbraio_2027/', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
        $('fattoIcs').href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
    }

    // ---------- la conferma si aggiorna da sola ----------
    /* Dopo l'invio la pagina rilegge lo stato dell'iscrizione (azione
       "stato-iscrizione", con la firma resa dal servizio): quando la persona
       conferma l'email - da questo telefono o da un altro dispositivo - il
       riquadro passa da "manca un ultimo passo" a "iscrizione confermata", e
       segna l'invito come inviato. Si rilegge spesso nei primi minuti, poi
       piu' di rado, e subito quando si torna sulla scheda del browser. */
    const SEGNO_OK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
    function segnaFatto(id, titolo, testo) {
        const li = $(id);
        li.classList.remove('fatto-passo--attesa');
        li.classList.add('fatto-passo--ok');
        li.querySelector('.fatto-segno').innerHTML = SEGNO_OK;
        li.querySelector('strong').textContent = titolo;
        $(id + 'Testo').textContent = testo;
    }
    function seguiStato(stato, nome) {
        const inizio = Date.now();
        let finito = false, timer = null, inCorso = false;
        const prossimo = () => {
            const trascorso = Date.now() - inizio;
            if (trascorso > 2 * 60 * 60 * 1000) return;            // dopo due ore si smette
            timer = setTimeout(leggi, trascorso < 10 * 60 * 1000 ? 5000 : 20000);
        };
        function leggi() {
            if (finito || inCorso) return;
            inCorso = true;
            chiama({ azione: 'stato-iscrizione', d: stato.d, t: stato.t })
                .then(s => {
                    inCorso = false;
                    if (!s || !s.ok) { if (s && (s._stato === 403 || s._stato === 404)) finito = true; else prossimo(); return; }
                    if (s.emailConfermata) {
                        $('fattoOcchiello').textContent = 'Iscrizione confermata';
                        $('fattoTitolo').textContent = 'Iscrizione confermata' + (nome ? ', ' + nome : '') + '.';
                        $('fattoIntro').textContent = 'Il tuo indirizzo email è confermato e la registrazione è completa. '
                            + (s.invito ? 'Ti abbiamo inviato per email l\'invito personale in PDF da presentare all\'accreditamento, insieme al file per aggiungere la giornata al calendario.'
                                : 'L\'invito personale in PDF è in arrivo per email.')
                            + ' Ti aspettiamo il 26 febbraio all\'Excelsior Hotel Gallia.';
                        segnaFatto('passoEmail', 'Indirizzo email confermato', 'La registrazione è completa.');
                        if (s.invito) {
                            segnaFatto('passoInvito', 'Invito personale inviato', 'Lo trovi nella mail «Il tuo invito», con il PDF da mostrare al desk Revilaw, stampato o dal telefono.');
                            finito = true;
                            return;
                        }
                    }
                    prossimo();
                })
                .catch(() => { inCorso = false; prossimo(); });
        }
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && !finito) { clearTimeout(timer); leggi(); }
        });
        prossimo();
    }

    // ---------- invio ----------
    const btnInvio = $('submitBtn');
    const btnTesto = btnInvio.querySelector('.btn-text');
    const btnAttesa = btnInvio.querySelector('.btn-loading');
    const erroreInvio = $('submitError');
    function inAttesa(si) {
        btnInvio.disabled = si;
        btnTesto.hidden = si;
        btnAttesa.hidden = !si;
    }
    function vaiA(el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (el.focus) el.focus({ preventScroll: true });
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        erroreInvio.textContent = '';
        let primo = null;
        obbligatori.forEach(campo => { if (!valida(campo) && !primo) primo = campo; });
        if (campoRuolo.value === 'altro' && !valida(campoRuoloAltro) && !primo) primo = campoRuoloAltro;
        if (!primo && (!verificato.token || verificato.numero !== cellulare(campoTel.value))) {
            errore('telefono', 'Verifica il numero: tocca «Invia il codice» e scrivi il codice che ricevi per SMS.');
            primo = campoTel;
        }
        if (primo) { vaiA(primo); return; }

        // il codice invito, se c'e', deve essere buono: lo si verifica adesso se non lo e' ancora
        const codice = ripulisci(campoCodice.value);
        if (codice && statoCodice.esito !== 'buono' && statoCodice.esito !== 'ignoto') {
            verificaInvito().then(buono => {
                if (buono) { if (form.requestSubmit) form.requestSubmit(); else form.dispatchEvent(new Event('submit', { cancelable: true })); }
                else vaiA(campoCodice);
            });
            return;
        }

        inAttesa(true);
        if (typeof window.gtag === 'function') window.gtag('event', 'invio_form', { pagina: document.title });
        const n = new Date();
        const p2 = x => String(x).padStart(2, '0');
        const data = p2(n.getDate()) + '/' + p2(n.getMonth() + 1) + '/' + n.getFullYear()
            + ' ' + p2(n.getHours()) + ':' + p2(n.getMinutes()) + ':' + p2(n.getSeconds());
        const valore = id => (($(id) || {}).value || '').trim();
        const interessi = Array.prototype.slice.call(form.querySelectorAll('input[name="interessi"]:checked'))
            .map(c => c.value).join(', ');

        chiama({
            data: data,
            nome: valore('nome'), cognome: valore('cognome'), email: valore('email'),
            telefono: valore('telefono'), smsToken: verificato.token,
            azienda: valore('azienda'), ruolo: ruoloScelto(), messaggio: '',
            profilo: valore('profilo'), settore: valore('settore'), dimensione: valore('dimensione'),
            interessi: interessi,
            codiceInvito: codice,
            modalita: valore('modalita') || 'presenza',
            privacy: $('privacy').checked, marketing: $('marketing').checked, riprese: $('riprese').checked,
            percorso: location.pathname
        }).then(d => {
            if (!d || !d.ok) {
                inAttesa(false);
                const msg = (d && d.msg) || 'Iscrizione non registrata. Riprova, oppure scrivici a info@nextgenerationbusiness.it';
                // l'errore si mostra accanto al campo che lo ha causato, quando si sa quale
                if (d && d.smsKo) { azzeraVerifica(); errore('telefono', msg); vaiA(campoTel); return; }
                if (d && d.campo === 'telefono') { errore('telefono', msg); vaiA(campoTel); return; }
                if (d && d.campo === 'email') { errore('email', msg); vaiA($('email')); return; }
                if (d && d.campo === 'riprese') { errore('riprese', msg); vaiA($('riprese')); return; }
                if (d && d.codiceKo) {
                    statoCodice = { valore: codice, esito: d.campo === 'codice' ? 'esaurito' : 'cattivo', azienda: '' };
                    mostraCodice(statoCodice.esito);
                    vaiA(campoCodice);
                    return;
                }
                erroreInvio.textContent = msg;
                return;
            }
            riempiConferma({
                nome: valore('nome'), cognome: valore('cognome'), email: valore('email'),
                azienda: valore('azienda'), telefono: verificato.numero
            });
            if (d.stato && d.stato.d && d.stato.t) seguiStato(d.stato, valore('nome'));
            form.hidden = true;
            const fatto = $('formSuccess');
            fatto.hidden = false;
            vaiA(fatto);
        }).catch(() => {
            inAttesa(false);
            erroreInvio.textContent = 'Errore di connessione. Riprova più tardi o scrivici a info@nextgenerationbusiness.it';
        });
    });
});
