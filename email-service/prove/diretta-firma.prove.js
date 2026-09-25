/* ============================================================
   PROVE - i link firmati a tempo della web TV (lib/diretta-firma.js)
   ------------------------------------------------------------
       node prove/diretta-firma.prove.js

   Niente da installare. Esce con 1 se qualcosa e' rosso.

   COSA DIMOSTRANO.
   - nginx (secure_link): il vettore della documentazione di nginx
       echo -n '2147483647/s/link127.0.0.1 secret' | openssl md5 -binary \
         | openssl base64 | tr +/ -_ | tr -d =        -> _e4Nc3iduzkWRm01TBBNYw
     e la nostra variante senza IP, con i valori calcolati con lo
     stesso comando di openssl (anche per la firma della cartella e con
     i nomi dei parametri cambiati);
   - akamai (EdgeAuth, Token Auth 2.0): l'HMAC-SHA256 coincide con
       echo -n 'exp=...~acl=...' | openssl dgst -sha256 -mac HMAC -macopt hexkey:<chiave>
     e il token ha la forma hdnts=exp=..~acl=..~hmac=..;
   - la query della web TV resta com'e' e una firma vecchia si
     sostituisce, non si raddoppia;
   - 'nessuna' lascia il link com'e';
   - validoSecondi: i secondi di validita' da adesso, uguali per un
     orologio qualsiasi (la pagina calcola la scadenza sul suo);
   - akamai: un'acl con '~' (separa i campi del token) o '!' fuori posto,
     e un percorso del flusso con '~' o '!' (l'acl ricavata), rifiutati
     con un messaggio chiaro: in normalizza (anche con gli indirizzi del
     flusso) e in firma (mai un token rotto);
   - normalizza: le regole di evento-salva (chiave obbligatoria, chiave
     tenuta se non arriva, 'nessuna' la cancella, durata 1-24 ore,
     chiave esadecimale per Akamai, parametri controllati);
   - pubblica non mostra MAI la chiave;
   - la firma e' solo del flusso diretto: con il player di Azoto
     (tipoPlayer 'azoto') l'indirizzo del player non si firma, il
     documento pubblico non dice videoFirmato e link-video /
     link-firmato rispondono 409 'non-flusso' (senza la chiave nel
     messaggio); con il flusso diretto il link si firma.
   Se openssl c'e', i valori attesi si ricalcolano anche con openssl.
   ============================================================ */
'use strict';
const { spawnSync } = require('child_process');
const F = require('../lib/diretta-firma');

let rossi = 0, verdi = 0;
function vero(cond, descrizione) {
    if (cond) verdi++;
    else { rossi++; console.log('ROSSO  ' + descrizione); }
}

// openssl, se c'e' (altrimenti valgono i valori scritti qui, calcolati con openssl)
function openssl(args, testo) {
    const r = spawnSync('openssl', args, { input: testo });
    return r.status === 0 ? r.stdout : null;
}
function md5Openssl(testo) {
    const b = openssl(['md5', '-binary'], testo);
    return b ? b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : null;
}
function hmacOpenssl(testo, chiaveHex) {
    const b = openssl(['dgst', '-sha256', '-mac', 'HMAC', '-macopt', 'hexkey:' + chiaveHex], testo);
    const m = b ? /([0-9a-f]{64})\s*$/.exec(b.toString('utf8')) : null;
    return m ? m[1] : null;
}
const conOpenssl = md5Openssl('prova') !== null;
if (!conOpenssl) console.log('(openssl non disponibile: si usano i valori calcolati prima con openssl)');

/* ---------- nginx ---------- */
vero(F.md5Nginx('2147483647/s/link127.0.0.1 secret') === '_e4Nc3iduzkWRm01TBBNYw', 'nginx: il vettore della documentazione (con l\'IP) -> _e4Nc3iduzkWRm01TBBNYw');
const senzaIp = F.firma('https://webtv.esempio.it/s/link', { schema: 'nginx', segreto: 'secret', durataOre: 1 }, (2147483647 - 3600) * 1000);
vero(senzaIp.url === 'https://webtv.esempio.it/s/link?md5=0Xgm37lo5nFEuHMDKl_vQg&expires=2147483647' && senzaIp.scade === 2147483647000,
    'nginx senza IP: md5 di "2147483647/s/link secret" = 0Xgm37lo5nFEuHMDKl_vQg (openssl) ' + JSON.stringify(senzaIp));
if (conOpenssl) {
    vero(md5Openssl('2147483647/s/link127.0.0.1 secret') === '_e4Nc3iduzkWRm01TBBNYw', 'openssl: il vettore della documentazione di nginx');
    vero(md5Openssl('2147483647/s/link secret') === '0Xgm37lo5nFEuHMDKl_vQg', 'openssl: la variante senza IP');
}

const ADESSO = (1800000000 - 6 * 3600) * 1000;   // con 6 ore, la scadenza e' 1800000000
const NGINX = { schema: 'nginx', segreto: 'chiave-di-prova', durataOre: 6, parametri: {} };
const n1 = F.firma('https://webtv.esempio.it/live/napoli/playlist.m3u8?a=1', NGINX, ADESSO);
vero(n1.url === 'https://webtv.esempio.it/live/napoli/playlist.m3u8?a=1&md5=bYxWK6ZRV4Qy7ym3k6v7tg&expires=1800000000' && n1.scade === 1800000000 * 1000,
    'nginx: firma del file, la query della web TV resta (' + n1.url + ')');
if (conOpenssl) vero(md5Openssl('1800000000/live/napoli/playlist.m3u8 chiave-di-prova') === 'bYxWK6ZRV4Qy7ym3k6v7tg', 'openssl conferma la firma del file');
const n2 = F.firma('https://webtv.esempio.it/live/napoli/playlist.m3u8', Object.assign({}, NGINX, { parametri: { percorso: 'cartella', nomeFirma: 'st', nomeScadenza: 'e' } }), ADESSO);
vero(n2.url === 'https://webtv.esempio.it/live/napoli/playlist.m3u8?st=v3C24dSnA0S__4PVnxS3KA&e=1800000000',
    'nginx: firma della cartella /live/napoli/ con i nomi dei parametri cambiati (' + n2.url + ')');
if (conOpenssl) vero(md5Openssl('1800000000/live/napoli/ chiave-di-prova') === 'v3C24dSnA0S__4PVnxS3KA', 'openssl conferma la firma della cartella');
const rifirmato = F.firma(n1.url, NGINX, ADESSO + 3600 * 1000);
vero(/\?a=1&md5=[A-Za-z0-9_-]{22}&expires=1800003600$/.test(rifirmato.url) && (rifirmato.url.match(/md5=/g) || []).length === 1,
    'nginx: un link gia\' firmato si rifirma sostituendo la firma, non aggiungendone un\'altra (' + rifirmato.url + ')');
const conHash = F.firma('https://webtv.esempio.it/live/pl.m3u8#x', NGINX, ADESSO);
vero(/\?md5=.+&expires=1800000000#x$/.test(conHash.url), 'nginx: il #... resta in fondo');
const accenti = F.firma('https://webtv.esempio.it/live/citt%C3%A0/pl.m3u8', NGINX, ADESSO);
vero(accenti.url.indexOf('md5=' + F.md5Nginx('1800000000/live/città/pl.m3u8 chiave-di-prova')) > 0, 'nginx: il percorso si firma decodificato, come $uri');

/* ---------- akamai ---------- */
const CHIAVE_AK = '52a152a152a152a152a152a152a1';
const AKAMAI = { schema: 'akamai', segreto: CHIAVE_AK, durataOre: 6, parametri: {} };
const HMAC_ATTESO = 'bc1b2cd87f34b4e9e0b8e2abe629bf288af7a50934efff74d53b32d9d17f6dd1';
vero(F.hmacAkamai('exp=1800000000~acl=/live/napoli/*', CHIAVE_AK) === HMAC_ATTESO, 'akamai: HMAC-SHA256 con la chiave esadecimale = quello di openssl');
if (conOpenssl) vero(hmacOpenssl('exp=1800000000~acl=/live/napoli/*', CHIAVE_AK) === HMAC_ATTESO, 'openssl dgst -sha256 -mac HMAC -macopt hexkey:... conferma');
const a1 = F.firma('https://webtv.esempio.it/live/napoli/playlist.m3u8?hdnts=vecchio&x=1', AKAMAI, ADESSO);
vero(a1.url === 'https://webtv.esempio.it/live/napoli/playlist.m3u8?x=1&hdnts=exp=1800000000~acl=/live/napoli/*~hmac=' + HMAC_ATTESO && a1.scade === 1800000000 * 1000,
    'akamai: hdnts=exp=..~acl=<cartella>*~hmac=.., il vecchio token sostituito (' + a1.url + ')');
const CHIAVE_AK2 = 'aabbccddeeff00112233445566778899';
const a2 = F.firma('https://cdn.webtv.it/hls/master.m3u8', { schema: 'akamai', segreto: CHIAVE_AK2, durataOre: 6, parametri: { acl: '/hls/*', nomeParametro: '__token__' } }, ADESSO);
vero(a2.url === 'https://cdn.webtv.it/hls/master.m3u8?__token__=exp=1800000000~acl=/hls/*~hmac=616ccdc84b7c55f6621e219a2be717271973096d88343885420193515797d2bb',
    'akamai: acl e nome del parametro cambiati (' + a2.url + ')');
if (conOpenssl) vero(hmacOpenssl('exp=1800000000~acl=/hls/*', CHIAVE_AK2) === '616ccdc84b7c55f6621e219a2be717271973096d88343885420193515797d2bb', 'openssl conferma (acl cambiata)');

/* ---------- validoSecondi: la validita' da adesso, per l'orologio della pagina ---------- */
vero(n1.validoSecondi === 6 * 3600 && a1.validoSecondi === 6 * 3600, 'validoSecondi: 6 ore (21600 s) per nginx e akamai (' + n1.validoSecondi + ', ' + a1.validoSecondi + ')');
const unOra = F.firma('https://webtv.esempio.it/live/pl.m3u8', Object.assign({}, NGINX, { durataOre: 1 }), ADESSO + 999);
vero(unOra.validoSecondi === 3600 && unOra.scade === (Math.floor((ADESSO + 999) / 1000) + 3600) * 1000,
    'validoSecondi con 1 ora: 3600, scade = adesso del servizio + 1 ora (' + unOra.validoSecondi + ')');

/* ---------- akamai: acl che romperebbero il token ---------- */
let rotto = null;
try { F.firma('https://cdn.webtv.it/~canale/live/pl.m3u8', AKAMAI, ADESSO); } catch (e) { rotto = e; }
vero(rotto && rotto.codice === 'acl' && /~/.test(rotto.message) && /ACL/.test(rotto.message) && rotto.message.indexOf(CHIAVE_AK) < 0,
    'akamai: un percorso con ~ (acl ricavata) non fa un token rotto: errore chiaro, senza la chiave (' + (rotto && rotto.message) + ')');
let rotto2 = null;
try { F.firma('https://cdn.webtv.it/live!napoli/pl.m3u8', AKAMAI, ADESSO); } catch (e) { rotto2 = e; }
vero(rotto2 && rotto2.codice === 'acl', 'akamai: un percorso con ! (acl ricavata): errore');
const aMano = F.firma('https://cdn.webtv.it/~canale/live/pl.m3u8', { schema: 'akamai', segreto: CHIAVE_AK, durataOre: 6, parametri: { acl: '/*' } }, ADESSO);
vero(/~acl=\/\*~hmac=[0-9a-f]{64}$/.test(aMano.url) && (aMano.url.match(/~/g) || []).length === 3,
    'akamai: con l\'acl scritta a mano (/*) lo stesso percorso si firma, e il token ha solo i suoi due ~ (' + aMano.url + ')');
vero(F.problemaAcl('https://cdn.webtv.it/~canale/live/pl.m3u8', AKAMAI).length > 0 && F.problemaAcl('https://cdn.webtv.it/live/pl.m3u8', AKAMAI) === ''
    && F.problemaAcl('https://cdn.webtv.it/~canale/pl.m3u8', NGINX) === '', 'problemaAcl: solo per akamai, solo per il percorso con ~');
vero(/ACL/.test(F.normalizza({ schema: 'akamai', segreto: CHIAVE_AK, parametri: { acl: '/live/!x' } }, null).errore || '')
    && /ACL/.test(F.normalizza({ schema: 'akamai', segreto: CHIAVE_AK, parametri: { acl: '/live/*!' } }, null).errore || '')
    && /ACL/.test(F.normalizza({ schema: 'akamai', segreto: CHIAVE_AK, parametri: { acl: '/a/*!b/*' } }, null).errore || ''),
    'acl con ! fuori posto (non fra due percorsi che cominciano con /): errore');
const dueAcl = F.normalizza({ schema: 'akamai', segreto: CHIAVE_AK, parametri: { acl: '/live/*!/riserva/*' } }, null);
vero(dueAcl.firma && dueAcl.firma.parametri.acl === '/live/*!/riserva/*', 'acl con due percorsi separati da ! (come vuole EdgeAuth): ok');
const conLink = F.normalizza({ schema: 'akamai', segreto: CHIAVE_AK }, null, ['https://cdn.webtv.it/live/pl.m3u8', 'https://cdn.webtv.it/~riserva/pl.m3u8']);
vero(/«~» o «!»/.test(conLink.errore || '') && /ACL a mano/.test(conLink.errore || ''), 'normalizza con gli indirizzi del flusso: il percorso della riserva con ~ si dice subito (' + conLink.errore + ')');
vero(F.normalizza({ schema: 'akamai', segreto: CHIAVE_AK, parametri: { acl: '/*' } }, null, ['https://cdn.webtv.it/~riserva/pl.m3u8']).firma,
    'normalizza: con l\'acl scritta a mano il percorso con ~ va bene');

/* ---------- nessuna ---------- */
const nessuna = F.firma('https://webtv.esempio.it/live/pl.m3u8?t=1', { schema: 'nessuna' }, ADESSO);
vero(nessuna.url === 'https://webtv.esempio.it/live/pl.m3u8?t=1' && nessuna.scade === null && nessuna.validoSecondi === null, '\'nessuna\': il link resta com\'e\', senza scadenza');
vero(F.firma('https://webtv.esempio.it/live/pl.m3u8', null, ADESSO).url === 'https://webtv.esempio.it/live/pl.m3u8', 'senza impostazioni: il link resta com\'e\'');
let senzaChiave = '';
try { F.firma('https://webtv.esempio.it/live/pl.m3u8', { schema: 'nginx', segreto: '' }, ADESSO); } catch (e) { senzaChiave = e.message; }
vero(/senza chiave/.test(senzaChiave), 'nginx senza chiave: errore (senza dati della firma nel messaggio)');
const durataStrana = F.firma('https://webtv.esempio.it/live/pl.m3u8', Object.assign({}, NGINX, { durataOre: 99 }), ADESSO);
vero(/expires=1800000000$/.test(durataStrana.url), 'durata fuori dai limiti: si usano le 6 ore predefinite');

/* ---------- normalizza (evento-salva) ---------- */
const SALVATA = { schema: 'nginx', segreto: 'segreto-salvato', durataOre: 4, parametri: { nomeFirma: 'st' } };
const n = x => F.normalizza(x, SALVATA);
vero(JSON.stringify(n(undefined).firma) === JSON.stringify(SALVATA), 'firma assente: resta quella salvata');
vero(n({ schema: 'nginx', segreto: '' }).firma.segreto === 'segreto-salvato', 'segreto \'\': si tiene quello salvato');
vero(n({ schema: 'nginx' }).firma.segreto === 'segreto-salvato' && n({ schema: 'nginx' }).firma.durataOre === 4 && n({ schema: 'nginx' }).firma.parametri.nomeFirma === 'st',
    'segreto, durata e parametri assenti: restano quelli salvati');
vero(n({ schema: 'nginx', segreto: '  nuovo  ' }).firma.segreto === 'nuovo', 'segreto nuovo: sostituisce quello salvato (senza spazi ai lati)');
const via = n({ schema: 'nessuna', segreto: 'x' }).firma;
vero(via.schema === 'nessuna' && via.segreto === '' && JSON.stringify(via.parametri) === '{}', '\'nessuna\': via anche la chiave');
vero(/chiave segreta/.test(F.normalizza({ schema: 'nginx' }, null).errore || ''), 'nginx senza chiave (ne\' nuova ne\' salvata): errore');
vero(/chiave segreta/.test(F.normalizza({ schema: 'nginx' }, { schema: 'nessuna', segreto: 'resto' }).errore || ''), 'da \'nessuna\' a nginx senza chiave: errore (niente chiavi rimaste da prima)');
vero(/esadecimale/.test(n({ schema: 'akamai' }).errore || ''), 'akamai con la chiave non esadecimale salvata per nginx: errore');
vero(/esadecimale/.test(F.normalizza({ schema: 'akamai', segreto: 'abc' }, null).errore || ''), 'akamai con un numero dispari di cifre: errore');
vero(F.normalizza({ schema: 'akamai', segreto: CHIAVE_AK }, null).firma.schema === 'akamai', 'akamai con la chiave esadecimale: ok');
vero(/sconosciuto/.test(n({ schema: 'wowza' }).errore || ''), 'schema sconosciuto: errore');
[0, 25, 1.5, 'tante'].forEach(d => vero(/da 1 a 24 ore/.test(n({ schema: 'nginx', durataOre: d }).errore || ''), 'durata ' + JSON.stringify(d) + ': errore'));
vero(n({ schema: 'nginx', durataOre: '12' }).firma.durataOre === 12, 'durata "12" (dal modulo): 12 ore');
vero(F.normalizza({ schema: 'nginx', segreto: 's' }, null).firma.durataOre === 6, 'durata predefinita: 6 ore');
vero(/Nome di parametro/.test(n({ schema: 'nginx', parametri: { nomeFirma: 'a&b' } }).errore || ''), 'nome di parametro con & : errore');
vero(/nomi diversi/.test(n({ schema: 'nginx', parametri: { nomeFirma: 'x', nomeScadenza: 'x' } }).errore || ''), 'firma e scadenza con lo stesso nome: errore');
vero(/Percorso/.test(n({ schema: 'nginx', parametri: { percorso: 'tutto' } }).errore || ''), 'percorso sconosciuto: errore');
vero(/ACL/.test(F.normalizza({ schema: 'akamai', segreto: CHIAVE_AK, parametri: { acl: 'live/*' } }, null).errore || ''), 'acl che non comincia con /: errore');
vero(/ACL/.test(F.normalizza({ schema: 'akamai', segreto: CHIAVE_AK, parametri: { acl: '/live/~x' } }, null).errore || ''), 'acl con ~: errore');
const pulitiNginx = n({ schema: 'nginx', parametri: { nomeFirma: 'st', altro: 'x', acl: '/x' } }).firma.parametri;
vero(JSON.stringify(pulitiNginx) === '{"nomeFirma":"st"}', 'parametri sconosciuti o di un altro schema: tolti (' + JSON.stringify(pulitiNginx) + ')');
vero(/non validi/.test(n({ schema: 'nginx', parametri: [1] }).errore || '') && /non valide/.test(n('nginx').errore || ''), 'parametri o impostazioni che non sono un oggetto: errore');
vero(/non è valida/.test(n({ schema: 'nginx', segreto: 'a\nb' }).errore || '') && /non è valida/.test(n({ schema: 'nginx', segreto: 'x'.repeat(600) }).errore || ''),
    'chiave con a capo o troppo lunga: errore');

/* ---------- pubblica: MAI la chiave ---------- */
const pub = F.pubblica(SALVATA);
vero(JSON.stringify(pub) === '{"schema":"nginx","durataOre":4,"parametri":{"nomeFirma":"st"},"segretoImpostato":true}', 'pubblica: schema, durata, parametri, segretoImpostato (' + JSON.stringify(pub) + ')');
vero(JSON.stringify(pub).indexOf('segreto-salvato') < 0, 'pubblica: la chiave non compare');
vero(F.pubblica(undefined).schema === 'nessuna' && F.pubblica(undefined).segretoImpostato === false, 'pubblica di un evento senza firma');
vero(F.attiva(SALVATA) === true && F.attiva({ schema: 'nginx', segreto: '' }) === false && F.attiva(null) === false, 'attiva: solo con schema e chiave');

/* ---------- la firma e' solo del flusso diretto (non del player di Azoto) ---------- */
const D = require('../lib/diretta-dati');
const AZOTO = 'https://cdn.azotosolutions.com/cloudtv/livetv29/player';
const FLUSSO = 'https://webtv.esempio.it/live/napoli/playlist.m3u8';
const conAzoto = { tipoPlayer: 'azoto', azotoUrl: AZOTO, videoUrl: FLUSSO, videoId: FLUSSO, riservaUrl: '', riservaId: '', firma: NGINX };
const campiAzoto = D.campiVideo({}, conAzoto, 'in_onda');
vero(campiAzoto.videoId === AZOTO && campiAzoto.videoFirmato === undefined, 'player Azoto con la firma impostata: l\'indirizzo del player si pubblica com\'e\', videoFirmato resta false');
const campiFlusso = D.campiVideo({}, Object.assign({}, conAzoto, { tipoPlayer: 'flusso' }), 'in_onda');
vero(campiFlusso.videoId === FLUSSO && campiFlusso.videoFirmato === true, 'flusso diretto con la firma: videoFirmato (la pagina chiede il link firmato)');
function ctxFinto(ris) {
    const docs = { 'eventi/napoli-2026': { stato: 'in_onda' }, 'eventiRiservati/napoli-2026': ris };
    return { adesso: () => ADESSO, db: { collection: n => ({ doc: id => n + '/' + id }), getAll: async (...r) => r.map(k => ({ exists: !!docs[k], data: () => docs[k] })) } };
}
(async () => {
    for (const soloInOnda of [true, false]) {
        let e = null;
        try { await D.linkVideo(ctxFinto(conAzoto), { idEvento: 'napoli-2026', sorgente: 'principale', soloInOnda: soloInOnda }); } catch (x) { e = x; }
        vero(e && e.stato === 409 && e.codice === 'non-flusso' && String(e.message).indexOf(NGINX.segreto) < 0,
            (soloInOnda ? 'link-video' : 'link-firmato') + ' con il player Azoto: 409 non-flusso, nessuna firma (' + (e && e.message) + ')');
    }
    const firmato = await D.linkVideo(ctxFinto(Object.assign({}, conAzoto, { tipoPlayer: 'flusso' })), { idEvento: 'napoli-2026', sorgente: 'principale', soloInOnda: true });
    vero(firmato.url === F.firma(FLUSSO, NGINX, ADESSO).url && firmato.validoSecondi === 6 * 3600, 'link-video con il flusso diretto: il link firmato (' + firmato.url + ')');
    console.log('\n' + verdi + ' verdi, ' + rossi + ' rossi');
    process.exit(rossi ? 1 : 0);
})();
