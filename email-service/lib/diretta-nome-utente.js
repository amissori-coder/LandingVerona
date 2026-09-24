/* ============================================================
   Nome utente della diretta: UNA sola funzione, usata ovunque
   ------------------------------------------------------------
   Questo file e' l'unica fonte delle regole con cui un nome e un
   cognome diventano un nome utente. Lo usano:
     - la pagina della diretta (diretta/index.html), per ripulire
       quello che la persona scrive nel campo "Nome utente";
     - la gestione (diretta/gestione/), per l'anteprima del
       caricamento riga per riga;
     - il servizio su Vercel (email-service/lib/diretta-nome-utente.js),
       che ne tiene una COPIA IDENTICA: la cartella email-service e' la
       radice del progetto Vercel e non vede i file che stanno fuori.
       La prova email-service/prove/diretta-nome-utente.prove.js
       confronta i due file byte per byte e diventa rossa se
       divergono: si modifica QUI e si ricopia di la'.

   LE REGOLE. Nome e cognome attaccati, senza spazi, tutto minuscolo.
   Si tolgono gli accenti ("Nicolo'" -> "nicolo"), gli apostrofi, i
   trattini, i punti e gli spazi ("D'Angelo" -> "dangelo", "De Luca"
   -> "deluca"). Restano solo le lettere a-z e i numeri.
     "Mario Rossi"         -> mariorossi
     "Anna Maria De Luca"  -> annamariadeluca
     "Nicolo' D'Angelo"    -> nicolodangelo
   Le lettere straniere che non sono "lettera + accento" hanno una
   tabella propria (ss per la s tedesca, oe, ae, la l polacca...), e
   i nomi in cirillico o in greco si traslitterano: altrimenti
   "Ivan Petrov" scritto in cirillico diventerebbe un nome utente
   vuoto. Quello che resta fuori (ideogrammi, arabo...) sparisce: se
   il risultato e' vuoto l'anteprima lo segnala e chiede di
   scriverlo a mano.

   OMONIMI. Due persone diverse (email diverse) con lo stesso nome e
   cognome hanno lo stesso nome utente di BASE: la seconda riceve un
   numero (mariorossi2, mariorossi3...). Il numero lo propone
   analizzaRighe() qui sotto; a garantire che non esistano due volte
   e' il servizio, che prenota ogni nome nella raccolta nomiUtente
   con una transazione.

   Niente dipendenze: gira uguale nel browser (window.NGBNomeUtente)
   e in Node (require).
   ============================================================ */
(function (radice, fabbrica) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.NGBNomeUtente = fabbrica();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // lunghezza massima della BASE: con il numero degli omonimi e il dominio
    // dell'email tecnica si resta ben dentro i 64 caratteri della parte locale
    const LUNGHEZZA_MASSIMA = 40;

    /* Lettere che la scomposizione Unicode (NFKD) non riduce a "lettera
       semplice + segno": vanno sostituite a mano. */
    const SPECIALI = {
        'ß': 'ss', 'ẞ': 'ss', 'æ': 'ae', 'Æ': 'ae', 'œ': 'oe', 'Œ': 'oe',
        'ø': 'o', 'Ø': 'o', 'đ': 'd', 'Đ': 'd', 'ð': 'd', 'Ð': 'd',
        'þ': 'th', 'Þ': 'th', 'ł': 'l', 'Ł': 'l', 'ı': 'i', 'ħ': 'h', 'Ħ': 'h',
        'ŀ': 'l', 'Ŀ': 'l', 'ĸ': 'k', 'ŉ': 'n', 'ſ': 's', 'ƒ': 'f'
    };

    /* Cirillico e greco, traslitterazione semplice (quella dei passaporti,
       senza segni diacritici): servono a non lasciare vuoto il nome utente
       di chi si e' iscritto scrivendo il nome nel proprio alfabeto. */
    const CIRILLICO = {
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e', 'ж': 'zh',
        'з': 'z', 'и': 'i', 'й': 'i', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
        'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts',
        'ч': 'ch', 'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'iu',
        'я': 'ia', 'є': 'ie', 'і': 'i', 'ї': 'i', 'ґ': 'g', 'ў': 'u', 'ј': 'j', 'љ': 'lj',
        'њ': 'nj', 'ћ': 'c', 'ђ': 'dj', 'џ': 'dz', 'ѓ': 'g', 'ќ': 'k', 'ѕ': 'dz'
    };
    const GRECO = {
        'α': 'a', 'β': 'v', 'γ': 'g', 'δ': 'd', 'ε': 'e', 'ζ': 'z', 'η': 'i', 'θ': 'th',
        'ι': 'i', 'κ': 'k', 'λ': 'l', 'μ': 'm', 'ν': 'n', 'ξ': 'x', 'ο': 'o', 'π': 'p',
        'ρ': 'r', 'σ': 's', 'ς': 's', 'τ': 't', 'υ': 'y', 'φ': 'f', 'χ': 'ch', 'ψ': 'ps',
        'ω': 'o'
    };

    /* Il cuore: una stringa qualsiasi -> solo [a-z0-9].
       L'ordine conta: prima le lettere speciali (che NFKD non scompone),
       poi la scomposizione che separa gli accenti, poi il minuscolo, le
       traslitterazioni e infine via tutto quello che non e' a-z o 0-9
       (spazi, apostrofi dritti e tipografici, trattini, punti...). */
    function pulisci(testo) {
        let s = String(testo == null ? '' : testo);
        s = s.replace(/[^\u0000-\u007f]/g, c => (Object.prototype.hasOwnProperty.call(SPECIALI, c) ? SPECIALI[c] : c));
        s = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
        s = s.toLowerCase();
        s = s.replace(/[\u0400-\u04ff]/g, c => (Object.prototype.hasOwnProperty.call(CIRILLICO, c) ? CIRILLICO[c] : c));
        s = s.replace(/\u03bf\u03c5/g, 'ou'); // il dittongo greco ou
        s = s.replace(/[\u0370-\u03ff]/g, c => (Object.prototype.hasOwnProperty.call(GRECO, c) ? GRECO[c] : c));
        return s.replace(/[^a-z0-9]/g, '');
    }

    /* Nome utente di BASE (senza il numero degli omonimi). */
    function nomeUtenteBase(nome, cognome) {
        return (pulisci(nome) + pulisci(cognome)).slice(0, LUNGHEZZA_MASSIMA);
    }

    /* Il nome con il numero degli omonimi: 1 = la base cosi' com'e',
       2 = base + "2", e cosi' via. */
    function conNumero(base, n) {
        return n && n > 1 ? base + String(n) : base;
    }

    /* Quello che la persona scrive nel campo "Nome utente" della pagina di
       accesso: stesse regole, cosi' "Mario Rossi", " MarioRossi " e
       "mario.rossi" diventano tutti mariorossi. */
    function pulisciAccesso(testo) {
        return pulisci(testo).slice(0, LUNGHEZZA_MASSIMA + 6);
    }

    /* Un nome utente scritto a mano in gestione: stesse regole, e in piu'
       la stessa lunghezza massima di quelli calcolati (con un margine per
       il numero). */
    function pulisciNomeUtente(testo) {
        return pulisci(testo).slice(0, LUNGHEZZA_MASSIMA + 6);
    }

    /* Email: la stessa persona e' la stessa email, scritta in qualunque modo.
       Via gli spazi (anche quelli invisibili che arrivano da Excel), tutto
       minuscolo. Non si toccano i punti ne' i "+": per molti gestori sono
       caselle diverse, e decidere il contrario vorrebbe dire unire due
       persone. */
    function emailNormalizzata(email) {
        return String(email == null ? '' : email)
            .replace(/[\s\u200b-\u200d\u2060\ufeff]+/g, '')
            .replace(/^mailto:/i, '')
            .toLowerCase();
    }

    function emailValida(email) {
        const e = emailNormalizzata(email);
        if (!e || e.length > 254) return false;
        if (e.indexOf('..') >= 0) return false;
        // niente "/" (e' il separatore dei percorsi di Firestore: l'indirizzo
        // e' anche la chiave del documento che ne garantisce l'unicita')
        return /^[a-z0-9._%+'=!#$&*?^`{|}~-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(e)
            && e[0] !== '.' && e.split('@')[0].slice(-1) !== '.';
    }

    /* Due nomi scritti in modo diverso sono la stessa persona? Serve solo a
       segnalare, nell'anteprima, un'email gia' presente con un nome diverso
       (forse un errore di battitura, forse un indirizzo condiviso). */
    function stessoNome(a, b) {
        return pulisci(a) === pulisci(b);
    }

    /* ------------------------------------------------------------
       ANALISI DEL CARICAMENTO
       ------------------------------------------------------------
       La stessa funzione per l'anteprima nel browser e per il controllo
       sul servizio. Non legge niente: riceve le righe del file e quello
       che gia' esiste, e dice riga per riga che cosa succederebbe.

       righe: [{ riga, nome, cognome, email, azienda,
                 nomeUtente?        (scritto a mano in anteprima),
                 escludi?           (true = riga esclusa a mano),
                 confermaOmonimo?   (true = numero confermato),
                 confermaDoppione?  (true = stessa email, nome diverso: e' la stessa persona) }]
       esistenti: {
         perEmail:  { [emailNormalizzata]: { uid, nomeUtente, nome, cognome, eventi: [] } },
         occupati:  [ nomi utente gia' prenotati (qualunque base) ],
         dettagliOccupati?: { [nomeUtente]: { nome, cognome, azienda, emailMascherata } }
       }
       idEvento: l'evento a cui si aggiungono le persone.

       Risultato: { righe: [...], conteggi: {...}, pronto: boolean }
       Ogni riga: { riga, nome, cognome, email, emailNorm, azienda,
         base, nomeUtente, esito, problemi: [{ codice, testo, grave }],
         daConfermare, omonimo, uidEsistente }
       esito: 'nuovo' | 'esistente' | 'gia-nell-evento' | 'doppione'
              | 'escluso' | 'errore'
       pronto = nessuna riga in errore e niente da confermare (omonimi, stessa
       email con un nome diverso).
       ------------------------------------------------------------ */
    function analizzaRighe(righe, esistenti, idEvento) {
        const perEmail = (esistenti && esistenti.perEmail) || {};
        const occupati = new Set(((esistenti && esistenti.occupati) || []).map(String));
        const dettagli = (esistenti && esistenti.dettagliOccupati) || {};
        // i nomi gia' assegnati alle righe precedenti di questo file
        const assegnati = new Set();
        // prima riga di ogni email nel file (per i doppioni)
        const primaPerEmail = {};
        // quante persone diverse per base (per evidenziare tutto il gruppo)
        const gruppi = {};
        const esito = [];

        (righe || []).forEach((r, i) => {
            const nome = String((r && r.nome) || '').trim().replace(/\s+/g, ' ');
            const cognome = String((r && r.cognome) || '').trim().replace(/\s+/g, ' ');
            const azienda = String((r && r.azienda) || '').trim().replace(/\s+/g, ' ');
            const emailGrezza = String((r && r.email) || '').trim();
            const emailNorm = emailNormalizzata(emailGrezza);
            const out = {
                riga: (r && r.riga) || (i + 2),
                nome: nome, cognome: cognome, email: emailGrezza, emailNorm: emailNorm, azienda: azienda,
                base: nomeUtenteBase(nome, cognome), nomeUtente: '', esito: 'nuovo', problemi: [],
                daConfermare: false, omonimo: false, uidEsistente: null, manuale: false
            };
            const problema = (codice, testo, grave) => out.problemi.push({ codice: codice, testo: testo, grave: !!grave });

            if (r && r.escludi) {
                out.esito = 'escluso';
                problema('escluso', 'Riga esclusa a mano: non verrà creato nessun account.', false);
                esito.push(out);
                return;
            }

            if (!emailNorm) problema('email-mancante', 'Email mancante.', true);
            else if (!emailValida(emailNorm)) problema('email-non-valida', 'Email non valida: "' + emailGrezza + '".', true);
            if (!nome) problema('nome-vuoto', 'Nome vuoto.', true);
            if (!cognome) problema('cognome-vuoto', 'Cognome vuoto.', true);

            // la stessa persona scritta due volte nel file: vale la prima riga
            if (emailNorm && Object.prototype.hasOwnProperty.call(primaPerEmail, emailNorm)) {
                const prima = primaPerEmail[emailNorm];
                out.esito = 'doppione';
                problema('doppione-nel-file', 'Stessa email della riga ' + prima.riga
                    + ': è la stessa persona, la riga non crea niente.', false);
                /* Un indirizzo condiviso (info@azienda.it per due colleghi) sembra
                   un doppione ma sono due persone: la seconda resterebbe senza
                   account senza che nessuno se ne accorga. Se il nome e' diverso,
                   il gestore deve dirlo esplicitamente. */
                if (!(stessoNome(nome, prima.nome) && stessoNome(cognome, prima.cognome))) {
                    out.daConfermare = !(r && r.confermaDoppione);
                    problema('doppione-nome-diverso', 'Stessa email della riga ' + prima.riga + ' ma nome diverso ('
                        + [prima.nome, prima.cognome].join(' ').trim() + '): se è un\'altra persona serve un suo indirizzo, '
                        + 'altrimenti non potrà entrare. Conferma se è la stessa persona.', false);
                }
                esito.push(out);
                return;
            }
            if (emailNorm) primaPerEmail[emailNorm] = { riga: out.riga, nome: nome, cognome: cognome };

            // gia' presente (per email): nessun nuovo account, solo l'aggiunta all'evento
            const gia = emailNorm ? perEmail[emailNorm] : null;
            if (gia) {
                out.uidEsistente = gia.uid || null;
                out.nomeUtente = gia.nomeUtente || '';
                if (out.nomeUtente) assegnati.add(out.nomeUtente);
                const nelEvento = Array.isArray(gia.eventi) && idEvento && gia.eventi.indexOf(idEvento) >= 0;
                out.esito = nelEvento ? 'gia-nell-evento' : 'esistente';
                problema(nelEvento ? 'gia-nell-evento' : 'gia-presente',
                    nelEvento
                        ? 'Già iscritta a questo evento con il nome utente ' + out.nomeUtente + ': non cambia niente.'
                        : 'Account già esistente (' + out.nomeUtente + '): nessun nuovo account, la persona viene aggiunta all\'evento.',
                    false);
                if ((nome && gia.nome && !stessoNome(nome, gia.nome)) || (cognome && gia.cognome && !stessoNome(cognome, gia.cognome))) {
                    problema('nome-diverso', 'Con questa email è registrato "' + [gia.nome, gia.cognome].join(' ').trim()
                        + '": il nome nel file è diverso. Resta quello registrato.', false);
                }
                if (out.problemi.some(p => p.grave)) out.esito = 'errore';
                esito.push(out);
                return;
            }

            if (out.problemi.some(p => p.grave)) {
                out.esito = 'errore';
                esito.push(out);
                return;
            }

            // nome utente scritto a mano in anteprima: si ripulisce e si controlla
            const manuale = pulisciNomeUtente(r && r.nomeUtente);
            if (r && r.nomeUtente && manuale) {
                out.manuale = true;
                if (occupati.has(manuale) || assegnati.has(manuale)) {
                    out.nomeUtente = manuale;
                    out.esito = 'errore';
                    problema('nome-utente-occupato', 'Il nome utente "' + manuale + '" è già usato da un\'altra persona.', true);
                    esito.push(out);
                    return;
                }
                out.nomeUtente = manuale;
                assegnati.add(manuale);
                esito.push(out);
                return;
            }

            if (!out.base) {
                out.esito = 'errore';
                problema('nome-utente-vuoto', 'Da questo nome e cognome non resta nessuna lettera a-z: scrivi il nome utente a mano.', true);
                esito.push(out);
                return;
            }

            // il primo numero libero per questa base (1 = la base senza numero)
            let n = 1;
            while (occupati.has(conNumero(out.base, n)) || assegnati.has(conNumero(out.base, n))) n++;
            out.nomeUtente = conNumero(out.base, n);
            assegnati.add(out.nomeUtente);
            if (n > 1) {
                out.omonimo = true;
                out.daConfermare = !(r && r.confermaOmonimo);
                // chi usa gia' il nome, se il servizio ce l'ha detto: serve a capire
                // se e' davvero un'altra persona o la stessa con un'altra email
                const d = dettagli[out.base];
                const chi = d ? ' (' + [[d.nome, d.cognome].join(' ').trim(), d.azienda, d.emailMascherata].filter(Boolean).join(', ') + ')' : '';
                problema('omonimo', 'Omonimo: "' + out.base + '" è già usato da un\'altra persona' + chi + ', con email diversa. '
                    + 'Nome utente proposto: ' + out.nomeUtente + '.', false);
            }
            gruppi[out.base] = (gruppi[out.base] || 0) + 1;
            esito.push(out);
        });

        // tutto il gruppo degli omonimi dentro il file va evidenziato, anche
        // chi ha preso la base senza numero
        esito.forEach(o => {
            if (o.esito === 'nuovo' && !o.manuale && gruppi[o.base] > 1) o.omonimo = true;
        });

        const conteggi = { totale: esito.length, nuovi: 0, esistenti: 0, giaNellEvento: 0, doppioni: 0, esclusi: 0, errori: 0, omonimi: 0, daConfermare: 0 };
        esito.forEach(o => {
            if (o.esito === 'nuovo') conteggi.nuovi++;
            else if (o.esito === 'esistente') conteggi.esistenti++;
            else if (o.esito === 'gia-nell-evento') conteggi.giaNellEvento++;
            else if (o.esito === 'doppione') conteggi.doppioni++;
            else if (o.esito === 'escluso') conteggi.esclusi++;
            else if (o.esito === 'errore') conteggi.errori++;
            if (o.omonimo) conteggi.omonimi++;
            if (o.daConfermare) conteggi.daConfermare++;
        });
        return { righe: esito, conteggi: conteggi, pronto: conteggi.errori === 0 && conteggi.daConfermare === 0 };
    }

    return {
        LUNGHEZZA_MASSIMA: LUNGHEZZA_MASSIMA,
        pulisci: pulisci,
        nomeUtenteBase: nomeUtenteBase,
        conNumero: conNumero,
        pulisciAccesso: pulisciAccesso,
        pulisciNomeUtente: pulisciNomeUtente,
        emailNormalizzata: emailNormalizzata,
        emailValida: emailValida,
        stessoNome: stessoNome,
        analizzaRighe: analizzaRighe
    };
}));
