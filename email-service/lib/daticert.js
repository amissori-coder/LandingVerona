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
const RE_PAROLA = /=\?([^?\s]+)\?([bBqQ])\?([^?\s]*)\?=/g;
function byteParola(codifica, dentro) {
    return codifica.toUpperCase() === 'B'
        ? Buffer.from(dentro, 'base64')
        : Buffer.from(dentro.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (x, h) => String.fromCharCode(parseInt(h, 16))), 'latin1');
}
/* Le parole codificate una accanto all'altra con lo stesso gioco di
   caratteri si decodificano INSIEME: c'e' chi spezza una lettera accentata
   fra due parole, e ciascuna meta' da sola non e' utf-8 valido. Fra due
   parole codificate lo spazio non conta (RFC 2047, 6.2). */
function decodificaParole(v) {
    const s = String(v == null ? '' : v);
    if (s.indexOf('=?') < 0) return s;
    let out = '', dopo = 0, gruppo = null, codificata = false;
    const chiudi = () => {
        if (!gruppo) return;
        try { out += decodificaTesto(Buffer.concat(gruppo.pezzi), gruppo.gioco); }
        catch (_) { out += gruppo.grezzo; }
        gruppo = null;
    };
    let m;
    RE_PAROLA.lastIndex = 0;
    while ((m = RE_PAROLA.exec(s))) {
        const fra = s.slice(dopo, m.index);
        const gioco = m[1].split('*')[0].toLowerCase();
        const soloSpazio = codificata && /^\s*$/.test(fra);
        if (gruppo && soloSpazio && gruppo.gioco === gioco) {
            gruppo.pezzi.push(byteParola(m[2], m[3])); gruppo.grezzo += fra + m[0];
        } else {
            chiudi();
            if (!soloSpazio) out += fra;
            gruppo = { gioco: gioco, pezzi: [byteParola(m[2], m[3])], grezzo: m[0] };
        }
        codificata = true;
        dopo = m.index + m[0].length;
    }
    chiudi();
    return out + s.slice(dopo);
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
/* windows-1252 a mano. iso-8859-1 dichiarato e' quasi sempre windows-1252
   (Outlook scrive cosi' l'apostrofo curvo, le virgolette e l'euro, fra
   0x80 e 0x9F), e il TextDecoder di Node 22 per queste etichette restituisce
   i caratteri di controllo invisibili U+0080-U+009F: "l'evento" diventava
   "levento" e "30 €" "30 ". Il resto della tabella coincide con latin1. */
const CP1252 = [0x20AC, 0x81, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6, 0x2030, 0x0160, 0x2039, 0x0152, 0x8D, 0x017D, 0x8F,
    0x90, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014, 0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0x9D, 0x017E, 0x0178];
function daWindows1252(b) {
    let s = '';
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i] >= 0x80 && b[i] <= 0x9F ? CP1252[b[i] - 0x80] : b[i]);
    return s;
}
function decodificaTesto(buffer, gioco, tagliato) {
    let b = Buffer.isBuffer(buffer) ? buffer : Buffer.from(String(buffer || ''), 'utf8');
    const nome = String(gioco || '').trim().toLowerCase();
    if (nome && nome !== 'utf-8' && nome !== 'utf8' && nome !== 'us-ascii' && nome !== 'ascii') {
        let dec = null;
        try { dec = new TextDecoder(nome); } catch (_) { return daWindows1252(b); }
        return dec.encoding === 'windows-1252' ? daWindows1252(b) : dec.decode(b);
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
    catch (_) { return daWindows1252(b); }
}

/* format=flowed (RFC 3676, Thunderbird e altri): una riga che finisce con
   uno spazio continua nella riga dopo. Senza ricucirle il testo arriva a
   capo ogni settanta caratteri, e con delsp=yes con le parole spezzate. */
function testoFlowed(testo, delsp) {
    const out = [];
    let acc = null, livAcc = 0;
    // la riga "-- " che apre la firma resta com'e'
    const chiudi = () => { if (acc !== null) out.push((livAcc ? '>'.repeat(livAcc) + ' ' : '') + (acc === '-- ' ? acc : acc.replace(/ +$/, ''))); acc = null; };
    String(testo == null ? '' : testo).split('\n').forEach(grezza => {
        const liv = /^>*/.exec(grezza)[0].length;
        let r = grezza.slice(liv);
        if (r.charAt(0) === ' ') r = r.slice(1);
        const fluisce = / $/.test(r) && r !== '-- ';
        if (fluisce && delsp) r = r.slice(0, -1);
        if (acc !== null && liv === livAcc) acc += r;
        else { chiudi(); acc = r; livAcc = liv; }
        if (!fluisce) chiudi();
    });
    chiudi();
    return out.join('\n');
}

/* Il contenuto di una parte com'e' sul server (base64, quoted-printable o
   cosi' com'e') riportato ai byte veri. Serve a chi scarica le parti da se'
   (lib/inoltro-risposte-pec.js, scaricaParte): la codifica si legge dalla
   struttura del messaggio, senza chiederla al server. */
function decodificaTrasferimento(buf, codifica, tagliato) {
    const c = String(codifica || '').trim().toLowerCase();
    let b = Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf || ''), 'latin1');
    /* Tagliata a un numero di byte, la parte puo' finire a meta' di un
       "=C3=A0": si torna all'ultimo a capo, e si perde al massimo una riga
       invece di rovinare tutto il testo. */
    if (tagliato && c === 'quoted-printable') {
        const fine = b.lastIndexOf(0x0A);
        if (fine > 0) b = b.slice(0, fine + 1);
        else b = Buffer.from(b.toString('latin1').replace(/=[0-9A-Fa-f]?\r?$/, ''), 'latin1');
    }
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
function normalizzaParti(nodo, mappa) {
    if (!nodo || typeof nodo !== 'object') return nodo;
    mappa = mappa || (x => x);
    const copia = Object.assign({}, nodo);
    if (nodo.part) copia.part = mappa(String(nodo.part));
    if (Array.isArray(nodo.childNodes)) {
        const busta = String(nodo.type || '').toLowerCase() === 'message/rfc822';
        copia.childNodes = nodo.childNodes.map(f => {
            const multi = String((f && f.type) || '').toLowerCase().indexOf('multipart/') === 0;
            if (busta && f && !multi && copia.part) {
                /* Il corpo di una parte sola (anche un'altra busta): lui e
                   tutto quello che ha sotto passano da "<n>" a "<n>.1".
                   Dall'alto in basso, cosi' una busta dentro la busta si
                   rinumera a sua volta sul numero gia' corretto. */
                const vecchio = String(f.part || nodo.part);
                const nuovo = copia.part + '.1';
                const sotto = x => (x === vecchio || x.indexOf(vecchio + '.') === 0) ? nuovo + x.slice(vecchio.length) : mappa(x);
                return normalizzaParti(f, sotto);
            }
            return normalizzaParti(f, mappa);
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
   del gestore, cioe' proprio quello che serve leggere).
   Non sono "il testo": le parti allegate (un note.txt) e un messaggio
   inoltrato come allegato dentro la busta (che di solito e' il nostro
   invito). `fuoriBusta` guarda solo fuori: per le ricevute, dove dentro la
   busta c'e' il nostro invito e il testo da leggere e' quello del gestore. */
function trovaParteTesto(nodo, cercato, dentroBusta, fuoriBusta) {
    if (!nodo) return null;
    const p = nodo.parameters || {};
    const dp = nodo.dispositionParameters || {};
    const nomeFile = String(dp.filename || p.name || '').toLowerCase();
    const tipo = String(nodo.type || '').toLowerCase();

    // la busta: si scende li' dentro e quello che si trova ha la precedenza
    if (nomeFile === 'postacert.eml' || tipo === 'message/rfc822') {
        if (dentroBusta || fuoriBusta) return null;
        for (const figlio of (nodo.childNodes || [])) {
            const t = trovaParteTesto(figlio, cercato, true, false);
            if (t) return t;
        }
        return null;
    }
    let migliore = null;
    const allegato = String(nodo.disposition || '').toLowerCase() === 'attachment' || !!nomeFile;
    if (tipo === cercato && !allegato) {
        migliore = {
            parte: nodo.part || '1', gioco: p.charset || '', codifica: String(nodo.encoding || '').toLowerCase(),
            flowed: String(p.format || '').toLowerCase() === 'flowed', delsp: String(p.delsp || '').toLowerCase() === 'yes',
            dimensione: Number(nodo.size) || 0, dentroBusta: !!dentroBusta
        };
    }
    for (const figlio of (nodo.childNodes || [])) {
        const t = trovaParteTesto(figlio, cercato, dentroBusta, fuoriBusta);
        if (!t) continue;
        // il testo dentro la busta vince sempre su quello fuori
        if (!migliore || (t.dentroBusta && !migliore.dentroBusta)) migliore = t;
    }
    return migliore;
}
function trovaTesto(nodo, dentroBusta) { return trovaParteTesto(nodo, 'text/plain', !!dentroBusta, false); }
/* La versione HTML del testo, per chi scrive SOLO in HTML (capita con
   alcuni programmi di posta e con le webmail): stesse regole. */
function trovaHtml(nodo, dentroBusta) { return trovaParteTesto(nodo, 'text/html', !!dentroBusta, false); }

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
        /* I blocchi (aperti o chiusi) diventano un SEGNO, non un a capo: piu'
           segni di fila sono un a capo solo. Cosi' "</div><div>" di Gmail e
           "</p><p>" di Outlook non lasciano una riga vuota fra ogni riga, e il
           testo prima di un blocco va comunque a capo. Il <p> o <div> subito
           dentro un <li> (Google Documenti, Word) non stacca il trattino. */
        .replace(/<li\b[^>]*>(?:\s*<(?:p|div)\b[^>]*>)*/gi, '\u0001- ')
        .replace(/<\/?(p|div|li|tr|h[1-6]|blockquote|table|ul|ol)\b[^>]*>/gi, '\u0001')
        .replace(/<\/t[dh]\s*>/gi, ' ')
        .replace(/<[^>]*>/g, '')
        .replace(/&#(\d{1,7});/g, (m, n) => carattere(Number(n)))
        .replace(/&#x([0-9a-f]{1,6});/gi, (m, n) => carattere(parseInt(n, 16)))
        .replace(/&([a-z]+);/gi, (m, n) => (Object.prototype.hasOwnProperty.call(ENTITA, n) ? ENTITA[n] : m))
        .replace(/[ \t]*\u0001(?:[ \t]*\u0001)*[ \t]*/g, '\n')
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
function trovaLeggibile(nodo, opz) {
    if (opz && opz.fuoriBusta) {
        const fuori = trovaParteTesto(nodo, 'text/plain', false, true);
        if (fuori) return Object.assign({ html: false }, fuori);
        const fuoriHtml = trovaParteTesto(nodo, 'text/html', false, true);
        return fuoriHtml ? Object.assign({ html: true }, fuoriHtml) : null;
    }
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
    decodificaTesto, decodificaTrasferimento, decodificaParole, normalizzaParti, trovaBusta, testoFlowed,
    trovaTesto, trovaHtml, trovaLeggibile, testoDaHtml, trovaAllegati,
    RICEVUTE, INTESTAZIONI,
    intestazioni, intestazione, chiaveMsgId, parteLocale,
    leggiDaticert, quandoDa, genere, automatica, soloIndirizzo, oggettoPulito,
    gravitaProblema, esitoDa
};
