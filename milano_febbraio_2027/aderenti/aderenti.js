/* ============================================================
   Iscrizione degli aderenti Revilaw · Milano 2027
   ------------------------------------------------------------
   Il modulo manda i dati al servizio email (azione
   "aderenti-iscrizione"): li' si controllano davvero, si
   registrano e parte il riepilogo a chi si iscrive (chi
   fattura li riceve a mezzanotte, tutti insieme). Qui si
   controlla solo quello
   che serve a non far aspettare una risposta "manca il CAP".
   La quota e le date le decide il servizio, non questa pagina.
   Dal pulsante "Completa i dati per la fattura" della mail
   (?d=<scheda>&t=<firma>) la pagina chiede i dati della persona
   (azione "aderenti-leggi"), li mette nel modulo con l'email
   bloccata e manda d e t con l'invio: il servizio aggiorna quella
   stessa iscrizione.
   ============================================================ */
(function () {
    'use strict';

    var API = 'https://revilaw-email.vercel.app/api/iscrizione-nuova';
    var QUOTA = 'milano-2027-aderenti';

    var form = document.getElementById('modulo');
    var errore = document.getElementById('errore');
    var bottone = document.getElementById('invia');
    var fatto = document.getElementById('fatto');
    var personale = null;   // { d, t } quando la pagina arriva dal collegamento della mail

    function valore(nome) {
        var el = form.elements[nome];
        return el ? String(el.value || '').trim() : '';
    }
    function mostraErrore(msg, campo) {
        errore.textContent = msg;
        errore.hidden = false;
        Array.prototype.forEach.call(form.querySelectorAll('[aria-invalid]'), function (el) { el.removeAttribute('aria-invalid'); });
        if (campo && form.elements[campo]) {
            var el = form.elements[campo];
            el.setAttribute('aria-invalid', 'true');
            el.focus();
        } else {
            errore.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    // i controlli rapidi, nello stesso ordine del servizio
    function controlla() {
        if (!valore('nome')) return ['Indichi il nome.', 'nome'];
        if (!valore('cognome')) return ['Indichi il cognome.', 'cognome'];
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valore('email'))) return ['L\'indirizzo email non sembra valido.', 'email'];
        if (valore('telefono').replace(/\D/g, '').length < 6) return ['Indichi un numero di telefono.', 'telefono'];
        if (!valore('intestatario')) return ['Indichi l\'intestatario della fattura.', 'intestatario'];
        if (!/^\d{11}$/.test(valore('partitaIva').replace(/\s+/g, '').replace(/^IT/i, ''))) return ['Indichi la partita IVA dell\'intestatario (11 cifre).', 'partitaIva'];
        if (!valore('codiceFiscale')) return ['Indichi il codice fiscale dell\'intestatario.', 'codiceFiscale'];
        if (!valore('indirizzo')) return ['Indichi l\'indirizzo della sede di fatturazione.', 'indirizzo'];
        if (!/^\d{5}$/.test(valore('cap'))) return ['Il CAP è di 5 cifre.', 'cap'];
        if (!valore('comune')) return ['Indichi il comune.', 'comune'];
        if (!/^[A-Za-z]{2}$/.test(valore('provincia'))) return ['Indichi la sigla della provincia (per esempio MI).', 'provincia'];
        if (!valore('codiceDestinatario') && !valore('pec')) {
            return ['Indichi il codice destinatario SDI o la PEC (almeno uno dei due).', 'codiceDestinatario'];
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valore('emailFatture'))) return ['Indichi l\'indirizzo email a cui inviare la fattura.', 'emailFatture'];
        if (!form.elements.accettaQuota.checked) return ['Confermi la partecipazione e la quota.', 'accettaQuota'];
        if (!form.elements.privacy.checked) return ['Per iscriversi serve il consenso al trattamento dei dati.', 'privacy'];
        return null;
    }

    // il servizio dice che cosa non va a parole: si prova a indicare il campo
    function campoDa(msg) {
        var m = String(msg || '').toLowerCase();
        var mappa = [['partita iva', 'partitaIva'], ['codice fiscale', 'codiceFiscale'], ['cap', 'cap'], ['provincia', 'provincia'],
            ['sdi', 'codiceDestinatario'], ['pec', 'pec'], ['email a cui inviare la fattura', 'emailFatture'], ['email per la fattura', 'emailFatture'], ['intestatario', 'intestatario'],
            ['indirizzo della sede', 'indirizzo'], ['telefono', 'telefono'], ['email', 'email'], ['nome', 'nome']];
        for (var i = 0; i < mappa.length; i++) if (m.indexOf(mappa[i][0]) >= 0) return mappa[i][1];
        return null;
    }

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        var problema = controlla();
        if (problema) { mostraErrore(problema[0], problema[1]); return; }
        errore.hidden = true;

        var corpo = {
            azione: 'aderenti-iscrizione',
            quota: QUOTA,
            nome: valore('nome'), cognome: valore('cognome'), email: valore('email'),
            telefono: valore('telefono'), studio: valore('studio'), citta: valore('citta'),
            fatturazione: {
                intestatario: valore('intestatario'), partitaIva: valore('partitaIva'),
                codiceFiscale: valore('codiceFiscale'), indirizzo: valore('indirizzo'),
                cap: valore('cap'), comune: valore('comune'), provincia: valore('provincia'),
                codiceDestinatario: valore('codiceDestinatario'), pec: valore('pec'),
                emailFatture: valore('emailFatture')
            },
            note: valore('note'),
            accettaQuota: form.elements.accettaQuota.checked,
            privacy: form.elements.privacy.checked,
            origine: location.pathname
        };
        if (personale) { corpo.d = personale.d; corpo.t = personale.t; }

        bottone.disabled = true;
        bottone.textContent = 'Invio in corso…';
        fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
            .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
            .then(function (d) {
                if (!d || !d.ok) {
                    var msg = (d && d.msg) || 'Non siamo riusciti a registrare l\'iscrizione: riprovi fra poco.';
                    mostraErrore(msg, campoDa(msg));
                    return;
                }
                document.getElementById('fatto-titolo').textContent = personale ? 'Dati per la fattura registrati'
                    : (d.aggiornata ? 'Iscrizione aggiornata' : 'Iscrizione registrata');
                document.getElementById('fatto-testo').textContent =
                    'Grazie, ' + corpo.nome + '. ' + (d.mail
                        ? 'Le abbiamo inviato il riepilogo all\'indirizzo ' + corpo.email + '. '
                        : '') + 'Nei prossimi giorni riceverà la fattura di 200 € + IVA intestata a ' + corpo.fatturazione.intestatario + '.';
                form.hidden = true;
                fatto.hidden = false;
                fatto.focus();
                fatto.scrollIntoView({ behavior: 'smooth', block: 'start' });
            })
            .catch(function () {
                mostraErrore('Connessione non riuscita: controlli la rete e riprovi. Se il problema continua scriva a info@nextgenerationbusiness.it');
            })
            .then(function () {
                bottone.disabled = false;
                bottone.textContent = personale ? 'Invia i dati per la fattura' : 'Invia l\'iscrizione';
            });
    });

    document.getElementById('ancora').addEventListener('click', function () {
        fatto.hidden = true;
        form.hidden = false;
        form.elements.nome.focus();
    });

    // il bordo rosso se ne va appena si corregge il campo
    form.addEventListener('input', function (e) {
        if (e.target && e.target.removeAttribute) e.target.removeAttribute('aria-invalid');
    });

    /* --- il collegamento personale della mail --- */
    function mostraPersonale(titolo, testo, ko) {
        var box = document.getElementById('personale');
        document.getElementById('personale-titolo').textContent = titolo;
        document.getElementById('personale-testo').textContent = testo;
        box.className = 'ad-personale' + (ko ? ' ad-personale-ko' : '');
        box.hidden = false;
    }
    function metti(nome, v) {
        var el = form.elements[nome];
        if (el && v && !el.value) el.value = v;
    }
    (function () {
        var q;
        try { q = new URLSearchParams(location.search); } catch (e) { return; }
        var d = q.get('d'), t = q.get('t');
        if (!d || !t) return;
        fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ azione: 'aderenti-leggi', d: d, t: t }) })
            .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
            .then(function (r) {
                if (!r || !r.ok || !r.scheda) {
                    mostraPersonale('Collegamento non riconosciuto',
                        (r && r.msg) || 'Non siamo riusciti a leggere la Sua iscrizione: compili il modulo, oppure scriva a info@nextgenerationbusiness.it', true);
                    return;
                }
                personale = { d: d, t: t };
                var s = r.scheda, f = s.fatturazione || {};
                ['nome', 'cognome', 'telefono', 'studio', 'citta'].forEach(function (n) { metti(n, s[n]); });
                ['intestatario', 'partitaIva', 'codiceFiscale', 'indirizzo', 'cap', 'comune', 'provincia',
                    'codiceDestinatario', 'pec', 'emailFatture'].forEach(function (n) { metti(n, f[n]); });
                var em = form.elements.email;
                em.value = s.email;
                em.readOnly = true;
                em.title = 'L\'indirizzo della Sua iscrizione: non si cambia da qui';
                document.getElementById('iscrizione-titolo').textContent = 'Completa i dati per la fattura';
                document.getElementById('iscrizione-sotto').textContent = 'La Sua iscrizione a cena e meeting è già registrata: manca solo l\'intestazione della fattura.';
                mostraPersonale(s.datiFatturaMancanti ? 'Completa i dati per la fattura' : 'I Suoi dati per la fattura',
                    'Gentile ' + (s.nome || 'aderente') + ', abbiamo già inserito i Suoi dati: '
                    + (s.datiFatturaMancanti ? 'indichi quelli per la fattura qui sotto, confermi la quota e invii.'
                        : 'li controlli, corregga quello che serve e invii.')
                    + ' L\'iscrizione resta associata all\'indirizzo ' + s.email + '.');
                document.getElementById('dati-fattura').className = 'ad-evidenza';
                bottone.textContent = 'Invia i dati per la fattura';
                var primo = form.elements[s.datiFatturaMancanti ? 'intestatario' : 'nome'];
                document.getElementById('personale').scrollIntoView({ behavior: 'smooth', block: 'start' });
                if (primo && primo.focus) { try { primo.focus({ preventScroll: true }); } catch (e) { primo.focus(); } }
            })
            .catch(function () {
                mostraPersonale('Connessione non riuscita', 'Non siamo riusciti a leggere la Sua iscrizione: ricarichi la pagina, oppure compili il modulo con lo stesso indirizzo email della mail ricevuta.', true);
            });
    }());

    // provincia, SDI e codice fiscale si scrivono in maiuscolo
    ['provincia', 'codiceDestinatario', 'codiceFiscale'].forEach(function (n) {
        form.elements[n].addEventListener('blur', function () { this.value = this.value.toUpperCase().trim(); });
    });
}());
