/* ============================================================
   Diretta degli eventi: i link firmati a tempo della web TV
   ------------------------------------------------------------
   Se la web TV protegge il suo flusso con link firmati (un "token"
   che scade), il link vero non basta: chi guarda riceve dal servizio
   (azione 'link-video' di diretta-accesso) il link con la firma, valido
   qualche ora. La chiave segreta sta SOLO in eventiRiservati/{id}.firma
   e non esce MAI dal servizio: ne' nelle risposte ne' nei log.

   Gli schemi (i due piu' diffusi fra i server di streaming):
   - 'nessuna': il link resta com'e'.
   - 'nginx': il modulo secure_link di nginx (e i server che lo
     imitano). Firma = base64url( md5( scadenza + percorso + ' ' + chiave ) ),
     nei parametri md5 e expires (nomi cambiabili). E' la ricetta della
     documentazione di nginx senza l'indirizzo IP di chi guarda: l'IP che
     vede il nostro servizio non e' quello che vede la web TV (reti
     mobili, IPv4 contro IPv6), quindi la web TV deve configurare
       secure_link $arg_md5,$arg_expires;
       secure_link_md5 "$secure_link_expires$uri <chiave>";
     Con parametri.percorso = 'cartella' si firma la cartella del flusso
     ('/live/napoli/' invece di '/live/napoli/playlist.m3u8'): serve
     quando anche i segmenti video devono passare con la stessa firma.
   - 'akamai': EdgeAuth (Token Auth 2.0) di Akamai.
       hdnts=exp=<scadenza>~acl=<acl>~hmac=<HMAC-SHA256 esadecimale>
     con l'HMAC calcolato con la chiave (esadecimale) su
     "exp=<scadenza>~acl=<acl>". L'acl predefinito e' la cartella del
     flusso seguita da '*' (vale per playlist e segmenti); nome del
     parametro e acl si possono cambiare. Nel token '~' separa i campi e
     '!' separa piu' acl: un'acl con '~' (o un percorso del flusso con
     '~' o '!', da cui si ricaverebbe l'acl) romperebbe il token, e la web
     TV rifiuterebbe ogni richiesta. Si rifiuta con un messaggio chiaro:
     l'acl scritta a mano (piu' percorsi si separano con '!', ognuno che
     comincia con /), e quella ricavata dal percorso (bisogna scriverla a
     mano, per esempio /*). EdgeAuth potrebbe anche codificare l'acl
     ("escape early"), ma solo se la web TV l'ha configurato allo stesso
     modo: meglio un errore chiaro che un token che non passa.

   firma(url, { schema, segreto, durataOre, parametri }, adesso)
     -> { url, scade, validoSecondi }
        scade: la scadenza in millisecondi, sull'orologio del SERVIZIO
        (null senza firma); validoSecondi: quanti secondi vale da adesso
        (null senza firma). La pagina calcola la scadenza sul proprio
        orologio con validoSecondi: un dispositivo con l'ora sbagliata di
        un'ora, con scade, vedrebbe i link gia' scaduti (o validi un'ora
        di troppo).
   normalizza(ingresso, salvata, link?) -> { firma } oppure { errore }
     (la lettura di quello che manda la gestione, con i controlli; link:
     facoltativo, gli indirizzi del flusso che si firmeranno, per
     controllare l'acl che se ne ricava)
   problemaAcl(url, firma) -> '' oppure la frase per la persona (l'acl di
     Akamai per quell'indirizzo non si puo' usare)
   pubblica(firma) -> quello che la gestione puo' vedere (MAI la chiave)
   ============================================================ */
'use strict';
const crypto = require('crypto');

const SCHEMI = ['nessuna', 'nginx', 'akamai'];
const DURATA_PREDEFINITA = 6;          // ore
const DURATA_MINIMA = 1;
const DURATA_MASSIMA = 24;
const LUNGHEZZA_CHIAVE = 512;
const RE_NOME_PARAMETRO = /^[A-Za-z0-9_.-]{1,40}$/;
// un percorso dell'acl di Akamai: comincia con /, niente spazi, ~ (separa i campi del token), ! (separa le acl), & # ? " ' < > \
const RE_PERCORSO_ACL = /^\/[^\s~!&#?"'<>\\]*$/;
const LUNGHEZZA_ACL = 500;
const PREDEFINITI = {
    nginx: { nomeFirma: 'md5', nomeScadenza: 'expires', percorso: 'intero' },
    akamai: { nomeParametro: 'hdnts', acl: '' }
};

function base64url(buf) {
    return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// la firma di nginx su una stringa gia' composta (serve anche alla prova con il vettore della documentazione)
function md5Nginx(stringa) {
    return base64url(crypto.createHash('md5').update(String(stringa), 'utf8').digest());
}

// l'HMAC di Akamai: chiave esadecimale, risultato esadecimale
function hmacAkamai(campi, chiaveHex) {
    return crypto.createHmac('sha256', Buffer.from(String(chiaveHex), 'hex')).update(String(campi), 'utf8').digest('hex');
}

// '/live/napoli/playlist.m3u8' -> '/live/napoli/'
function cartellaDi(percorso) {
    return String(percorso || '/').replace(/[^/]*$/, '') || '/';
}

// il percorso come lo vede nginx in $uri: decodificato
function percorsoDecodificato(u) {
    try { return decodeURIComponent(u.pathname); } catch (_) { return u.pathname; }
}

/* Aggiunge (o sostituisce) dei parametri alla query senza toccare gli
   altri: la query della web TV puo' contenere caratteri che
   URLSearchParams riscriverebbe (e una firma gia' presente andrebbe
   cambiata, non raddoppiata). I valori sono gia' sicuri per una query. */
function conParametri(url, coppie) {
    const u = new URL(url);
    const nomi = new Set(coppie.map(c => c[0]));
    const nomeDi = parte => { const n = parte.split('=')[0]; try { return decodeURIComponent(n); } catch (_) { return n; } };
    const resto = u.search.replace(/^\?/, '').split('&').filter(p => p && !nomi.has(nomeDi(p)));
    const query = resto.concat(coppie.map(c => c[0] + '=' + c[1])).join('&');
    return u.origin + u.pathname + (query ? '?' + query : '') + u.hash;
}

function parametriCompleti(schema, parametri) {
    return Object.assign({}, PREDEFINITI[schema] || {}, parametri || {});
}

/* L'acl di Akamai scritta a mano: uno o piu' percorsi separati da '!',
   ognuno che comincia con / (per esempio /live/napoli/* oppure
   /live/*!/riserva/*). */
function aclValida(acl) {
    const a = String(acl || '');
    return a.length > 0 && a.length <= LUNGHEZZA_ACL && a.split('!').every(p => RE_PERCORSO_ACL.test(p));
}
// l'acl per quell'indirizzo: quella scritta a mano, oppure la cartella del flusso + '*'
function aclPer(url, parametri) {
    const p = parametriCompleti('akamai', parametri);
    return p.acl || (cartellaDi(new URL(url).pathname) + '*');
}
const MSG_ACL_PERCORSO = 'Il percorso del flusso contiene «~» o «!», che nel token di Akamai separano i campi e le ACL: scrivi l\'ACL a mano nei parametri dei link firmati (per esempio /* oppure la cartella del flusso senza quei caratteri, con *).';
function problemaAcl(url, cfg) {
    const c = cfg || {};
    if (c.schema !== 'akamai' || !url) return '';
    let acl;
    try { acl = aclPer(url, c.parametri); } catch (_) { return ''; }
    if (aclValida(acl)) return '';
    return parametriCompleti('akamai', c.parametri).acl ? 'ACL dei link firmati non valida.' : MSG_ACL_PERCORSO;
}

function firma(url, cfg, adesso) {
    const c = cfg || {};
    const schema = c.schema || 'nessuna';
    if (!url || schema === 'nessuna') return { url: String(url || ''), scade: null, validoSecondi: null };
    if (SCHEMI.indexOf(schema) < 0) throw new Error('schema di firma sconosciuto');
    if (!c.segreto) throw new Error('firma senza chiave segreta');
    const ora = Number.isFinite(adesso) ? adesso : Date.now();
    const durata = Number.isInteger(c.durataOre) && c.durataOre >= DURATA_MINIMA && c.durataOre <= DURATA_MASSIMA ? c.durataOre : DURATA_PREDEFINITA;
    const scadenza = Math.floor(ora / 1000) + durata * 3600;
    // i secondi di validita' da adesso: la pagina li conta sul proprio orologio
    const validoSecondi = scadenza - Math.floor(ora / 1000);
    const p = parametriCompleti(schema, c.parametri);
    const u = new URL(url);
    if (schema === 'nginx') {
        const percorso = p.percorso === 'cartella' ? cartellaDi(percorsoDecodificato(u)) : percorsoDecodificato(u);
        const md5 = md5Nginx(String(scadenza) + percorso + ' ' + c.segreto);
        return { url: conParametri(url, [[p.nomeFirma, md5], [p.nomeScadenza, String(scadenza)]]), scade: scadenza * 1000, validoSecondi: validoSecondi };
    }
    // akamai: mai un token con un'acl che lo romperebbe (vedi sopra)
    const acl = aclPer(url, p);
    if (!aclValida(acl)) {
        const e = new Error(problemaAcl(url, c) || 'ACL dei link firmati non valida.');
        e.codice = 'acl';
        throw e;
    }
    const campi = 'exp=' + scadenza + '~acl=' + acl;
    const token = campi + '~hmac=' + hmacAkamai(campi, c.segreto);
    return { url: conParametri(url, [[p.nomeParametro, token]]), scade: scadenza * 1000, validoSecondi: validoSecondi };
}

/* La firma salvata, ripulita e con i valori predefiniti (anche per gli
   eventi di prima, che non ce l'hanno). */
function pulita(salvata) {
    const f = salvata && typeof salvata === 'object' ? salvata : {};
    const schema = SCHEMI.indexOf(f.schema) >= 0 ? f.schema : 'nessuna';
    const durata = Number.isInteger(f.durataOre) && f.durataOre >= DURATA_MINIMA && f.durataOre <= DURATA_MASSIMA ? f.durataOre : DURATA_PREDEFINITA;
    return {
        schema: schema,
        segreto: schema === 'nessuna' ? '' : String(f.segreto || ''),
        durataOre: durata,
        parametri: schema === 'nessuna' ? {} : Object.assign({}, f.parametri || {})
    };
}

/* Quello che manda la gestione (evento-salva, campo firma):
     { schema, segreto?, durataOre?, parametri? }
   - assente: resta la firma salvata;
   - segreto assente o '': si tiene quello salvato;
   - schema 'nessuna': via anche la chiave.
   Restituisce { firma } oppure { errore: 'frase per la persona' }. */
function normalizza(ingresso, salvata, link) {
    const vecchia = pulita(salvata);
    if (ingresso === undefined) return { firma: vecchia };
    if (!ingresso || typeof ingresso !== 'object' || Array.isArray(ingresso)) return { errore: 'Impostazioni dei link firmati non valide.' };
    const schema = ingresso.schema === undefined ? vecchia.schema : String(ingresso.schema || '').trim().toLowerCase();
    if (SCHEMI.indexOf(schema) < 0) return { errore: 'Tipo di firma sconosciuto: scegli «nessuna», «nginx» o «akamai».' };
    if (schema === 'nessuna') return { firma: { schema: 'nessuna', segreto: '', durataOre: DURATA_PREDEFINITA, parametri: {} } };

    const d = ingresso.durataOre;
    const durata = d === undefined || d === null || d === '' ? vecchia.durataOre : Number(d);
    if (!Number.isInteger(durata) || durata < DURATA_MINIMA || durata > DURATA_MASSIMA) {
        return { errore: 'La validità dei link firmati va da ' + DURATA_MINIMA + ' a ' + DURATA_MASSIMA + ' ore.' };
    }
    const nuovo = typeof ingresso.segreto === 'string' ? ingresso.segreto.trim() : '';
    const segreto = nuovo || (vecchia.schema !== 'nessuna' ? vecchia.segreto : '');
    if (!segreto) return { errore: 'Inserisci la chiave segreta dei link firmati (te la dà la web TV).' };
    if (segreto.length > LUNGHEZZA_CHIAVE || /[\u0000-\u001f\u007f]/.test(segreto)) return { errore: 'La chiave segreta non è valida (troppo lunga o con caratteri non ammessi).' };
    if (schema === 'akamai' && !/^([0-9a-f]{2})+$/i.test(segreto)) {
        return { errore: 'Per Akamai la chiave segreta è esadecimale: solo cifre 0-9 e lettere a-f, in numero pari.' };
    }

    const grezzi = ingresso.parametri === undefined ? (schema === vecchia.schema ? vecchia.parametri : {}) : ingresso.parametri;
    if (grezzi === null || typeof grezzi !== 'object' || Array.isArray(grezzi)) return { errore: 'Parametri dei link firmati non validi.' };
    const testo = v => String(v == null ? '' : v).trim();
    const parametri = {};
    if (schema === 'nginx') {
        for (const nome of ['nomeFirma', 'nomeScadenza']) {
            const v = testo(grezzi[nome]);
            if (!v) continue;
            if (!RE_NOME_PARAMETRO.test(v)) return { errore: 'Nome di parametro non valido: «' + v.slice(0, 40) + '» (lettere, numeri, _ . -).' };
            parametri[nome] = v;
        }
        const completi = parametriCompleti('nginx', parametri);
        if (completi.nomeFirma === completi.nomeScadenza) return { errore: 'La firma e la scadenza devono avere due parametri con nomi diversi.' };
        const percorso = testo(grezzi.percorso);
        if (percorso && percorso !== 'intero' && percorso !== 'cartella') return { errore: 'Percorso firmato non valido: «intero» o «cartella».' };
        if (percorso) parametri.percorso = percorso;
    } else {
        const nome = testo(grezzi.nomeParametro);
        if (nome && !RE_NOME_PARAMETRO.test(nome)) return { errore: 'Nome di parametro non valido: «' + nome.slice(0, 40) + '» (lettere, numeri, _ . -).' };
        if (nome) parametri.nomeParametro = nome;
        const acl = testo(grezzi.acl);
        if (acl && !aclValida(acl)) {
            return { errore: 'ACL non valida: ogni percorso comincia con / (per esempio /live/napoli/*), più percorsi si separano con «!», senza spazi né «~» (nel token di Akamai separa i campi) & # ?.' };
        }
        if (acl) parametri.acl = acl;
    }
    const nuova = { schema: schema, segreto: segreto, durataOre: durata, parametri: parametri };
    // l'acl ricavata dagli indirizzi del flusso (senza un'acl scritta a mano): anche quella deve andare
    const problema = (Array.isArray(link) ? link : []).map(u => problemaAcl(u, nuova)).filter(Boolean)[0];
    if (problema) return { errore: problema };
    return { firma: nuova };
}

// quello che vede la gestione: MAI la chiave, solo se c'e'
function pubblica(salvata) {
    const f = pulita(salvata);
    return { schema: f.schema, durataOre: f.durataOre, parametri: f.parametri, segretoImpostato: f.schema !== 'nessuna' && !!f.segreto };
}

function attiva(salvata) {
    const f = pulita(salvata);
    return f.schema !== 'nessuna' && !!f.segreto;
}

module.exports = {
    SCHEMI, DURATA_PREDEFINITA, DURATA_MINIMA, DURATA_MASSIMA, PREDEFINITI,
    firma, normalizza, pubblica, pulita, attiva, problemaAcl, aclValida,
    md5Nginx, hmacAkamai, cartellaDi, conParametri, base64url
};
