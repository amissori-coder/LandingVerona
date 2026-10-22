/* ============================================================
   Lettura delle ricevute PEC: intestazioni e daticert.xml
   ------------------------------------------------------------
   Quando si spedisce una PEC, il gestore risponde nella casella
   del mittente con dei messaggi automatici: accettazione, avvenuta
   consegna, mancata consegna, non accettazione. Ognuno porta un
   allegato daticert.xml con i dati di servizio.

   Qui dentro c'e' solo la lettura di quei dati. Niente rete,
   niente database, nessuna dipendenza: cosi' si puo' provare
   riga per riga sui messaggi veri, che e' l'unico modo per essere
   sicuri di aver capito un formato altrui.

   Perche' NON si usa un parser XML: daticert.xml e' descritto da
   un DTD chiuso e piatto (RFC 6109, par. 4.4), sempre gli stessi
   elementi, mai annidati oltre due livelli. Bastano poche righe,
   e non si apre la porta alle entita' esterne XML, che sono il
   modo classico per far leggere a un server file che non deve
   leggere. L'XML qui arriva da fuori: e' il caso di essere avari.

   Fonti: RFC 6109 (trasposizione delle regole tecniche del DM
   2/11/2005), piu' messaggi PEC reali di Aruba e di altri gestori
   usati come banco di prova (prova-daticert.js).
   ============================================================ */

/* I sette valori ammessi per X-Ricevuta (RFC 6109, Appendice A).
   ATTENZIONE: "mancata-consegna" NON esiste, benche' l'oggetto del
   messaggio dica "AVVISO DI MANCATA CONSEGNA": la mancata consegna
   vera porta "errore-consegna". Lo si accetta lo stesso, in fondo
   all'elenco, perche' qualche gestore potrebbe scriverlo davvero e
   una ricevuta non riconosciuta e' peggio di una riconosciuta con
   larghezza. */
const RICEVUTE = [
    'accettazione', 'non-accettazione', 'presa-in-carico', 'avvenuta-consegna',
    'errore-consegna', 'preavviso-errore-consegna', 'rilevazione-virus', 'mancata-consegna'
];

/* Le intestazioni che servono. Si chiedono queste e basta: scaricare
   tutto il messaggio per leggerne quattro righe sarebbe uno spreco su
   una casella con anni di posta dentro. */
const INTESTAZIONI = [
    'x-ricevuta', 'x-riferimento-message-id', 'x-trasporto', 'x-tiporicevuta',
    'x-verificasicurezza', 'message-id', 'in-reply-to', 'references',
    'from', 'reply-to', 'subject', 'date', 'auto-submitted', 'x-autoreply', 'precedence'
];

/* Lettura di un'intestazione dal blocco grezzo restituito da IMAP.
   Due accortezze che sui messaggi veri servono davvero:
   - confronto in minuscolo, perche' sulla stessa casella Aruba scrive
     "X-Tiporicevuta" sulla busta e "X-TipoRicevuta" dentro;
   - ricongiungimento delle righe spezzate (una riga che comincia con
     spazio o tabulazione e' la continuazione della precedente): i
     Message-ID lunghi vanno a capo di continuo, e letti a meta' non
     combaciano con niente. */
function intestazioni(grezzo) {
    const testo = String(grezzo == null ? '' : grezzo).replace(/\r\n/g, '\n');
    const out = {};
    let nome = '', valore = '';
    const chiudi = () => {
        if (!nome) return;
        const k = nome.toLowerCase();
        // se la stessa intestazione compare due volte vince la prima,
        // come fanno i client di posta
        if (out[k] === undefined) out[k] = DA_DECODIFICARE.indexOf(k) >= 0 ? decodificaParole(valore.trim()) : valore.trim();
        nome = ''; valore = '';
    };
    testo.split('\n').forEach(riga => {
        if (/^[ \t]/.test(riga)) { valore += ' ' + riga.trim(); return; }
        chiudi();
        const i = riga.indexOf(':');
        if (i <= 0) return;
        nome = riga.slice(0, i).trim();
        valore = riga.slice(i + 1);
    });
    chiudi();
    return out;
}
/* Le intestazioni che si leggono a video arrivano spesso codificate
   (RFC 2047): un oggetto con una lettera accentata e' "=?UTF-8?Q?Opportunit=C3=A0?=",
   e a volte il gestore codifica la riga intera, prefisso "POSTA CERTIFICATA:"
   compreso. Senza decodificarle, l'oggetto si leggeva cosi' nell'area
   riservata e nell'inoltro, e una risposta automatica con l'oggetto
   codificato non si riconosceva. */
const DA_DECODIFICARE = ['subject', 'from', 'reply-to'];
const RE_PAROLA = /=\?([^?\s]+)\?([bBqQ])\?([^?\s]*)\?=/;
function decodificaParola(intera) {
    const m = RE_PAROLA.exec(intera);
    if (!m) return intera;
    try {
        const gioco = m[1].split('*')[0];
        const buf = m[2].toUpperCase() === 'B'
            ? Buffer.from(m[3], 'base64')
            : Buffer.from(m[3].replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (x, h) => String.fromCharCode(parseInt(h, 16))), 'latin1');
        return decodificaTesto(buf, gioco);
    } catch (_) { return intera; }
}
function decodificaParole(v) {
    const s = String(v == null ? '' : v);
    if (s.indexOf('=?') < 0) return s;
    // fra due parole codificate lo spazio non conta (RFC 2047, 6.2)
    return s.replace(/=\?[^?\s]+\?[bBqQ]\?[^?\s]*\?=(?:\s+(?==\?[^?\s]+\?[bBqQ]\?[^?\s]*\?=))?/g, p => decodificaParola(p.trim()));
}
function intestazione(grezzo, nome) {
    const h = (grezzo && typeof grezzo === 'object' && !Buffer.isBuffer(grezzo)) ? grezzo : intestazioni(grezzo);
    return h[String(nome).toLowerCase()] || '';
}

/* Un Message-ID ridotto a chiave di documento Firestore: via gli
   angolari, minuscolo, e i caratteri che Firestore non ammette nei
   nomi sostituiti con un trattino. Le stesse sostituzioni di idDoc()
   in api/aziende-invito.js, cosi' nel progetto la convenzione resta
   una sola. */
function chiaveMsgId(v) {
    return String(v == null ? '' : v).replace(/[<>]/g, '').trim().toLowerCase()
        .replace(/[\/\\.#$\[\]]/g, '-').slice(0, 400);
}
/* La sola parte prima della chiocciola. Serve perche' il dominio del
   riferimento VIENE RISCRITTO dal gestore: sugli stessi due messaggi
   veri di prova, l'accettazione riporta "...@fakepec.it" e l'avviso di
   mancata consegna "...@pec.it", stessa parte locale. Siccome la parte
   locale che generiamo noi contiene 16 cifre esadecimali casuali, da
   sola basta a riconoscere l'invio. */
function parteLocale(v) {
    const s = String(v == null ? '' : v).replace(/[<>]/g, '').trim().toLowerCase();
    const i = s.lastIndexOf('@');
    return chiaveMsgId(i > 0 ? s.slice(0, i) : s);
}

function testoTag(xml, tag) {
    const m = new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + tag + '>', 'i').exec(xml);
    return m ? disescapa(m[1]).trim() : '';
}
function attributo(xml, tag, attr) {
    const m = new RegExp('<' + tag + '\\s[^>]*' + attr + '\\s*=\\s*"([^"]*)"', 'i').exec(xml);
    return m ? disescapa(m[1]).trim() : '';
}
function disescapa(s) {
    return String(s == null ? '' : s)
        .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
        .replace(/&apos;/gi, "'").replace(/&#39;/g, "'").replace(/&amp;/gi, '&');
}

/* Data e ora del gestore in millisecondi. Il formato e' fisso:
   <data zona="+0100"><giorno>15/11/2024</giorno><ora>18:21:03</ora></data>.
   Il fuso c'e' sempre e va usato: una consegna delle 00:30 con fuso
   sbagliato finisce nel giorno prima, e sulle scadenze la data di
   consegna e' esattamente il dato che conta. */
function quandoDa(xml) {
    const giorno = testoTag(xml, 'giorno');
    const ora = testoTag(xml, 'ora');
    const zona = attributo(xml, 'data', 'zona') || '+0000';
    const g = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(giorno);
    const o = /^(\d{2}):(\d{2}):(\d{2})$/.exec(ora);
    if (!g || !o) return 0;
    const z = /^([+-])(\d{2})(\d{2})$/.exec(zona.trim()) || ['', '+', '00', '00'];
    const iso = g[3] + '-' + g[2] + '-' + g[1] + 'T' + o[1] + ':' + o[2] + ':' + o[3] + z[1] + z[2] + ':' + z[3];
    const t = Date.parse(iso);
    return Number.isFinite(t) ? t : 0;
}

/* Il contenuto di daticert.xml ridotto a quello che serve.
   Restituisce null se non e' un daticert leggibile: chi chiama deve
   poterlo distinguere da un daticert vuoto. */
function leggiDaticert(xml) {
    const s = String(xml == null ? '' : xml);
    if (s.indexOf('<postacert') < 0) return null;
    const tipo = (attributo(s, 'postacert', 'tipo') || '').toLowerCase();
    if (!tipo) return null;
    return {
        tipo: tipo,
        errore: (attributo(s, 'postacert', 'errore') || 'nessuno').toLowerCase(),
        mittente: testoTag(s, 'mittente').slice(0, 200),
        oggetto: testoTag(s, 'oggetto').slice(0, 250),
        gestore: testoTag(s, 'gestore-emittente').slice(0, 120),
        identificativo: testoTag(s, 'identificativo').replace(/[<>]/g, '').slice(0, 250),
        // il Message-ID ORIGINALE, quello che abbiamo messo noi: e' la chiave
        // per ritrovare a quale invio si riferisce questa ricevuta
        msgid: testoTag(s, 'msgid').replace(/[<>]/g, '').slice(0, 400),
        // un solo indirizzo: con piu' destinatari arriva una consegna per ciascuno
        consegna: testoTag(s, 'consegna').toLowerCase().slice(0, 200),
        destinatari: (s.match(/<destinatari(?:\s[^>]*)?>([\s\S]*?)<\/destinatari>/gi) || [])
            .map(x => disescapa(x.replace(/<[^>]+>/g, '')).trim().toLowerCase()).filter(Boolean).slice(0, 20),
        tipoRicevuta: (attributo(s, 'ricevuta', 'tipo') || '').toLowerCase(),
        erroreEsteso: testoTag(s, 'errore-esteso').slice(0, 300),
        quando: quandoDa(s)
    };
}

/* Che cosa e' arrivato. Si guarda SOLO alle intestazioni, mai
   all'oggetto: l'oggetto di una ricevuta comincia con "ACCETTAZIONE:"
   seguito dall'oggetto originale, e un invito intitolato "Avviso di
   mancata consegna" (per assurdo) manderebbe fuori strada un
   riconoscimento fatto sul testo.

     ricevuta  -> c'e' X-Ricevuta: e' un messaggio automatico del gestore
     risposta  -> busta di trasporto (X-Trasporto: posta-certificata)
                  senza X-Ricevuta: e' una PEC vera, scritta da qualcuno
     anomalia  -> X-Trasporto: errore: messaggio arrivato da posta
                  ordinaria, senza valore di PEC (capita quando l'azienda
                  risponde dalla casella normale)
     estraneo  -> tutto il resto: e' la posta dello studio, non ci
                  riguarda e non va nemmeno guardata
*/
function genere(h) {
    const ric = String(h['x-ricevuta'] || '').trim().toLowerCase();
    if (ric) return { genere: 'ricevuta', tipo: RICEVUTE.indexOf(ric) >= 0 ? ric : 'sconosciuta' };
    const trasp = String(h['x-trasporto'] || '').trim().toLowerCase();
    if (trasp === 'posta-certificata') return { genere: 'risposta', tipo: 'posta-certificata' };
    if (trasp === 'errore') return { genere: 'anomalia', tipo: 'anomalia' };
    return { genere: 'estraneo', tipo: '' };
}

/* Risposte scritte da una persona contro risposte scritte da un
   programma. Un "sono in ferie" o un rapporto di mancato recapito non
   sono un segno di interesse, e segnarli come "ha risposto" fa sembrare
   viva una campagna che non lo e'. Le regole sono quelle standard
   (RFC 3834) piu' i modi in cui i client italiani scrivono l'oggetto. */
const RE_AUTOMATICA = /^\s*(?:(?:re|r|fwd?|i):\s*)*(?:out of office|automatic reply|risposta automatica|assente|fuori sede|delivery status notification|undelivered mail|mail delivery|messaggio non recapitato|conferma di lettura|read receipt)/i;
function automatica(h) {
    const auto = String(h['auto-submitted'] || '').trim().toLowerCase();
    if (auto && auto !== 'no') return true;
    if (String(h['x-autoreply'] || '').trim()) return true;
    const prec = String(h['precedence'] || '').trim().toLowerCase();
    if (prec === 'auto_reply' || prec === 'bulk' || prec === 'junk') return true;
    /* L'oggetto SENZA il prefisso del gestore: sulla busta di una risposta
       PEC l'oggetto e' "POSTA CERTIFICATA: Risposta automatica: ...", e con
       il prefisso davanti l'espressione non riconosceva mai niente. */
    return RE_AUTOMATICA.test(oggettoPulito(h['subject']));
}

/* Il solo indirizzo, senza il nome che di solito lo precede.
   "Posta Certificata <posta-certificata@pec.it>" -> l'indirizzo. */
function soloIndirizzo(v) {
    const s = String(v == null ? '' : v).trim();
    const m = /<([^<>]+@[^<>]+)>/.exec(s);
    const grezzo = m ? m[1] : s;
    const solo = grezzo.split(/[\s,;]+/).filter(x => x.indexOf('@') > 0)[0] || '';
    return solo.replace(/^[<"']+|[>"']+$/g, '').toLowerCase().slice(0, 200);
}

/* L'oggetto senza il prefisso che il gestore antepone, per mostrarlo
   com'e' stato scritto. */
function oggettoPulito(v) {
    return String(v == null ? '' : v)
        .replace(/^\s*(?:ACCETTAZIONE|AVVISO DI MANCATA CONSEGNA|AVVISO DI NON ACCETTAZIONE|CONSEGNA|POSTA CERTIFICATA|ANOMALIA MESSAGGIO|PREAVVISO DI MANCATA CONSEGNA)\s*:\s*/i, '')
        .trim().slice(0, 250);
}

/* Quanto e' grave il problema segnalato, e se e' l'ultima parola.
   Serve a non far arretrare uno stato gia' acquisito: un preavviso
   che arriva dopo un errore definitivo non lo cancella.

   La distinzione piu' delicata: il preavviso di mancata consegna
   arriva DUE volte, a dodici ore e a ventiquattro, con lo stesso
   X-Ricevuta e lo stesso oggetto. Solo il testo di errore-esteso dice
   se e' l'avviso conclusivo. Quando non e' chiaro si sceglie la
   lettura prudente ("consegna in dubbio"), che invita a guardare, non
   quella definitiva, che chiuderebbe la partita per conto del gestore. */
function gravitaProblema(tipo, erroreEsteso) {
    const t = String(tipo || '');
    const testo = String(erroreEsteso || '').toLowerCase();
    if (t === 'non-accettazione') return { gravita: 4, definitivo: true };
    if (t === 'rilevazione-virus') return { gravita: 4, definitivo: true };
    if (t === 'errore-consegna' || t === 'mancata-consegna') return { gravita: 3, definitivo: true };
    if (t === 'preavviso-errore-consegna') {
        const conclusivo = /24\s*ore|ventiquattro|non\s+e['’]?\s*stat[oa]\s+consegnat|non\s+andata\s+a\s+buon\s+fine|definitiv/.test(testo);
        return { gravita: conclusivo ? 3 : 1, definitivo: conclusivo };
    }
    return { gravita: 1, definitivo: false };
}

/* L'esito da mostrare, calcolato dai fatti raccolti finora.
   E' una funzione PURA dei tre fatti (accettata, consegnata, problema):
   riapplicare due volte la stessa ricevuta da' lo stesso risultato, ed
   e' questo che rende innocua una rilettura della casella. */
function esitoDa(r) {
    r = r || {};
    if (r.consegnata && r.consegnata.quando) return 'consegnata';
    if (r.problema && r.problema.definitivo) {
        return r.problema.tipo === 'non-accettazione' ? 'non-accettata' : 'non-consegnata';
    }
    if (r.problema) return 'in-dubbio';
    if (r.accettata && r.accettata.quando) return 'accettata';
    return 'attesa';
}

/* Il testo di un messaggio, decodificato secondo il gioco di caratteri
   dichiarato dal mittente. Le PEC italiane usano quasi sempre iso-8859-1 o
   utf-8: letto con quello sbagliato, un "e' andata" diventa "Ã¨". Se la
   dichiarazione manca o e' sconosciuta si prova utf-8 e, se i byte NON sono
   utf-8 valido, si ripiega su latin1. Non si guarda se nel risultato c'e'
   il carattere di sostituzione: un messaggio che cita un "perch\uFFFD" gia'
   rovinato, o un testo tagliato a meta' di una lettera accentata, finivano
   interi in latin1, con ogni "a'" diventata "Ã ".
   `tagliato`: il chiamante ha accorciato il testo a un numero di byte. Solo
   allora una lettera lasciata a meta' in fondo si toglie, invece di far
   fallire tutto il resto: senza quel segno, un byte alto in fondo e' piu'
   facile che sia una "a'" in latin1. */
function decodificaTesto(buffer, gioco, tagliato) {
    let b = Buffer.isBuffer(buffer) ? buffer : Buffer.from(String(buffer || ''), 'utf8');
    const nome = String(gioco || '').trim().toLowerCase();
    if (nome && nome !== 'utf-8' && nome !== 'utf8' && nome !== 'us-ascii' && nome !== 'ascii') {
        try { return new TextDecoder(nome).decode(b); }
        catch (_) { return b.toString('latin1'); }
    }
    if (tagliato) {
        let fine = b.length, indietro = 0;
        while (fine > 0 && indietro < 3 && (b[fine - 1] & 0xC0) === 0x80) { fine--; indietro++; }
        if (fine > 0 && b[fine - 1] >= 0xC0) {
            const serve = b[fine - 1] >= 0xF0 ? 4 : b[fine - 1] >= 0xE0 ? 3 : 2;
            if (b.length - (fine - 1) < serve) b = b.slice(0, fine - 1);
        }
    }
    try { return new TextDecoder('utf-8', { fatal: true }).decode(b); }
    catch (_) { return b.toString('latin1'); }
}

/* Il contenuto di una parte com'e' sul server (base64, quoted-printable o
   cosi' com'e') riportato ai byte veri. Serve a chi scarica le parti da se'
   (lib/inoltro-risposte-pec.js, scaricaParte): la codifica si legge dalla
   struttura del messaggio, senza chiederla al server. */
function decodificaTrasferimento(buf, codifica) {
    const c = String(codifica || '').trim().toLowerCase();
    const b = Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf || ''), 'latin1');
    if (c === 'base64') return Buffer.from(b.toString('latin1').replace(/[^A-Za-z0-9+/=]/g, ''), 'base64');
    if (c === 'quoted-printable') {
        return Buffer.from(b.toString('latin1')
            .replace(/[ \t]+(\r?\n)/g, '$1')
            .replace(/=\r?\n/g, '')
            .replace(/=([0-9A-Fa-f]{2})/g, (x, h) => String.fromCharCode(parseInt(h, 16))), 'latin1');
    }
    return b;
}

/* LA NUMERAZIONE DELLE PARTI DENTRO LA BUSTA. imapflow (tools.js,
   parseBodystructure) da' al corpo di un messaggio incapsulato lo STESSO
   numero dell'involucro message/rfc822. Se quel corpo e' multipart va bene
   (i figli sono 2.1, 2.2...), ma se e' una parte sola - una risposta di solo
   testo, o di solo HTML, che e' il caso piu' comune - quel numero indica il
   messaggio INTERO, intestazioni comprese: scaricandolo usciva il sorgente
   grezzo con il testo ancora in quoted-printable. Per IMAP (RFC 3501, 6.4.5)
   il corpo di un messaggio incapsulato di una parte sola e' "<numero>.1": qui
   si rinumera una copia della struttura, prima di cercarci dentro. */
function normalizzaParti(nodo) {
    if (!nodo || typeof nodo !== 'object') return nodo;
    const copia = Object.assign({}, nodo);
    if (Array.isArray(nodo.childNodes)) {
        const busta = String(nodo.type || '').toLowerCase() === 'message/rfc822';
        copia.childNodes = nodo.childNodes.map(f => {
            const c = normalizzaParti(f);
            if (busta && c && !(c.childNodes && c.childNodes.length) && nodo.part && (!c.part || c.part === nodo.part)) {
                c.part = nodo.part + '.1';
            }
            return c;
        });
    }
    return copia;
}

/* La busta (postacert.eml), se il messaggio ne ha una. */
function trovaBusta(nodo) {
    if (!nodo) return null;
    const p = nodo.parameters || {};
    const dp = nodo.dispositionParameters || {};
    const nomeFile = String(dp.filename || p.name || '').toLowerCase();
    if (nomeFile === 'postacert.eml' || String(nodo.type || '').toLowerCase() === 'message/rfc822') return nodo;
    for (const f of (nodo.childNodes || [])) {
        const t = trovaBusta(f);
        if (t) return t;
    }
    return null;
}

/* Dove sta il testo leggibile dentro il messaggio.
   Per una RISPOSTA il messaggio vero non e' quello esterno: la busta di
   trasporto contiene postacert.eml, e dentro c'e' quello che l'azienda ha
   scritto davvero. Si cerca quindi PRIMA dentro la busta, e solo se non
   c'e' si prende il testo esterno (che per una ricevuta e' la descrizione
   del gestore, cioe' proprio quello che serve leggere). */
function trovaTesto(nodo, dentroBusta) {
    if (!nodo) return null;
    const p = nodo.parameters || {};
    const dp = nodo.dispositionParameters || {};
    const nomeFile = String(dp.filename || p.name || '').toLowerCase();
    const tipo = String(nodo.type || '').toLowerCase();

    // la busta: si scende li' dentro e quello che si trova ha la precedenza
    if (nomeFile === 'postacert.eml' || tipo === 'message/rfc822') {
        for (const figlio of (nodo.childNodes || [])) {
            const t = trovaTesto(figlio, true);
            if (t) return t;
        }
    }
    let migliore = null;
    if (tipo === 'text/plain' && nomeFile !== 'daticert.xml') {
        migliore = { parte: nodo.part || '1', gioco: p.charset || '', codifica: String(nodo.encoding || '').toLowerCase(), dimensione: Number(nodo.size) || 0, dentroBusta: !!dentroBusta };
    }
    for (const figlio of (nodo.childNodes || [])) {
        const t = trovaTesto(figlio, dentroBusta);
        if (!t) continue;
        // il testo dentro la busta vince sempre su quello fuori
        if (!migliore || (t.dentroBusta && !migliore.dentroBusta)) migliore = t;
    }
    return migliore;
}

/* La versione HTML del testo, per chi scrive SOLO in HTML (capita con
   alcuni programmi di posta e con le webmail): stesse regole di trovaTesto,
   la busta prima di tutto. Serve quando di text/plain non ce n'e'. */
function trovaHtml(nodo, dentroBusta) {
    if (!nodo) return null;
    const p = nodo.parameters || {};
    const dp = nodo.dispositionParameters || {};
    const nomeFile = String(dp.filename || p.name || '').toLowerCase();
    const tipo = String(nodo.type || '').toLowerCase();
    if (nomeFile === 'postacert.eml' || tipo === 'message/rfc822') {
        for (const figlio of (nodo.childNodes || [])) {
            const t = trovaHtml(figlio, true);
            if (t) return t;
        }
    }
    let migliore = null;
    if (tipo === 'text/html' && String(nodo.disposition || '').toLowerCase() !== 'attachment') {
        migliore = { parte: nodo.part || '1', gioco: p.charset || '', codifica: String(nodo.encoding || '').toLowerCase(), dimensione: Number(nodo.size) || 0, dentroBusta: !!dentroBusta };
    }
    for (const figlio of (nodo.childNodes || [])) {
        const t = trovaHtml(figlio, dentroBusta);
        if (!t) continue;
        if (!migliore || (t.dentroBusta && !migliore.dentroBusta)) migliore = t;
    }
    return migliore;
}

/* Da HTML a testo semplice, quanto basta per leggere un messaggio: i capoversi
   restano capoversi, i tag spariscono, le entita' piu' comuni (anche quelle
   delle lettere accentate, che i programmi italiani scrivono spesso come
   &egrave;) tornano caratteri. Non e' un convertitore completo e non deve
   esserlo: il messaggio vero resta nella casella PEC. */
const ENTITA = {
    nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'',
    agrave: 'à', aacute: 'á', egrave: 'è', eacute: 'é', igrave: 'ì', iacute: 'í',
    ograve: 'ò', oacute: 'ó', ugrave: 'ù', uacute: 'ú',
    Agrave: 'À', Egrave: 'È', Eacute: 'É', Igrave: 'Ì', Ograve: 'Ò', Ugrave: 'Ù',
    euro: '€', laquo: '«', raquo: '»', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
    ndash: '–', mdash: '—', hellip: '…', deg: '°', copy: '©', middot: '·', bull: '•'
};
function carattere(n) {
    return (n > 0 && n <= 0x10FFFF && !(n >= 0xD800 && n <= 0xDFFF)) ? String.fromCodePoint(n) : '';
}
function testoDaHtml(html) {
    return String(html == null ? '' : html)
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<(script|style|head|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
        // gli a capo e i rientri del SORGENTE non contano, in HTML: si
        // schiacciano prima, e gli a capo veri li fanno i tag qui sotto
        .replace(/\s+/g, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|tr|h[1-6]|blockquote|table|ul|ol)\s*>/gi, '\n')
        .replace(/<\/t[dh]\s*>/gi, ' ')
        .replace(/<li\b[^>]*>/gi, '- ')
        .replace(/<[^>]*>/g, '')
        .replace(/&#(\d{1,7});/g, (m, n) => carattere(Number(n)))
        .replace(/&#x([0-9a-f]{1,6});/gi, (m, n) => carattere(parseInt(n, 16)))
        .replace(/&([a-z]+);/gi, (m, n) => (Object.prototype.hasOwnProperty.call(ENTITA, n) ? ENTITA[n] : m))
        .replace(/\r\n?/g, '\n')
        .replace(/[ \t ]+\n/g, '\n')
        .replace(/\n[ \t\u00A0]+/g, '\n')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/* Il testo da mostrare: quello semplice o, se dentro la busta c'e' solo
   l'HTML, l'HTML. Senza questa scelta una risposta scritta solo in HTML
   mostrava il testo FUORI dalla busta, cioe' la descrizione del gestore
   ("Messaggio di posta certificata..."), al posto di quello dell'azienda.
   `html: true` dice a chi lo scarica di passarlo per testoDaHtml. */
function trovaLeggibile(nodo) {
    const t = trovaTesto(nodo);
    if (t && t.dentroBusta) return Object.assign({ html: false }, t);
    const h = trovaHtml(nodo);
    if (h && (h.dentroBusta || !t)) return Object.assign({ html: true }, h);
    return t ? Object.assign({ html: false }, t) : null;
}

/* Gli allegati che il messaggio porta con se', per dire almeno che ci sono.
   Si escludono le parti di servizio della PEC, che non interessano a nessuno.
   `parte` e `tipo` servono a chi li va a prendere (l'inoltro delle risposte,
   lib/inoltro-risposte-pec.js). */
const PARTI_DI_SERVIZIO = ['daticert.xml', 'smime.p7s', 'postacert.eml'];
function trovaAllegati(nodo, elenco) {
    elenco = elenco || [];
    if (!nodo || elenco.length >= 20) return elenco;
    const p = nodo.parameters || {};
    const dp = nodo.dispositionParameters || {};
    const nome = String(dp.filename || p.name || '');
    const tipo = String(nodo.type || '').toLowerCase();
    if (nome && PARTI_DI_SERVIZIO.indexOf(nome.toLowerCase()) < 0 && tipo.indexOf('multipart') !== 0) {
        elenco.push({
            nome: nome.slice(0, 120), dimensione: Number(nodo.size) || 0,
            parte: String(nodo.part || ''), tipo: tipo.slice(0, 100), codifica: String(nodo.encoding || '').toLowerCase()
        });
    }
    (nodo.childNodes || []).forEach(f => trovaAllegati(f, elenco));
    return elenco;
}

module.exports = {
    decodificaTesto, decodificaTrasferimento, decodificaParole, normalizzaParti, trovaBusta,
    trovaTesto, trovaHtml, trovaLeggibile, testoDaHtml, trovaAllegati,
    RICEVUTE, INTESTAZIONI,
    intestazioni, intestazione, chiaveMsgId, parteLocale,
    leggiDaticert, quandoDa, genere, automatica, soloIndirizzo, oggettoPulito,
    gravitaProblema, esitoDa
};
