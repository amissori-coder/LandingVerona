/* ============================================================
   Iscrizione degli aderenti Revilaw · Milano 2027
   ------------------------------------------------------------
   Il modulo manda i dati al servizio email (azione
   "aderenti-iscrizione"): li' si controllano davvero, si
   registrano e partono le due mail, l'avviso a chi fattura e
   il riepilogo a chi si iscrive. Qui si controlla solo quello
   che serve a non far aspettare una risposta "manca il CAP".
   La quota e le date le decide il servizio, non questa pagina.
   ============================================================ */
(function () {
    'use strict';

    var API = 'https://revilaw-email.vercel.app/api/iscrizione-nuova';
    var QUOTA = 'milano-2027-aderenti';

    var form = document.getElementById('modulo');
    var errore = document.getElementById('errore');
    var bottone = document.getElementById('invia');
    var fatto = document.getElementById('fatto');

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
                document.getElementById('fatto-titolo').textContent = d.aggiornata ? 'Iscrizione aggiornata' : 'Iscrizione registrata';
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
                bottone.textContent = 'Invia l\'iscrizione';
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

    // provincia, SDI e codice fiscale si scrivono in maiuscolo
    ['provincia', 'codiceDestinatario', 'codiceFiscale'].forEach(function (n) {
        form.elements[n].addEventListener('blur', function () { this.value = this.value.toUpperCase().trim(); });
    });
}());
