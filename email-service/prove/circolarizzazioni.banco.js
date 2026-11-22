/* ============================================================
   BANCO DI PROVA - circolarizzazioni via PEC, senza PEC
   ------------------------------------------------------------
       node prove/circolarizzazioni.banco.js [porta]

   Un servizio locale con il codice VERO (api/circolarizzazioni.js)
   e posta, casella e database finti (prove/circ-finti.js): serve a
   provare la sezione dell'area riservata dal browser, in modalita'
   demo, senza spedire niente. Nell'area riservata basta indicare
   questo indirizzo prima di caricare la pagina:

       window.RV_CIRCOLARIZZAZIONI_URL = 'http://127.0.0.1:8790/api/circolarizzazioni'

   In modalita' demo l'area riservata si presenta al servizio con
   'demo:<indirizzo della sessione>', che solo questo banco accetta
   (il servizio vero verifica il gettone Firebase e lo rifiuta).

   Tre comandi per far succedere le cose che in produzione fanno il
   gestore PEC e i destinatari (POST, corpo JSON):
     /banco/ricevute   accettazione e consegna per le PEC partite
                       (mancata consegna se l'indirizzo contiene "errore")
     /banco/risposta   { pec, oggetto?, inRisposta?: true, ordinaria? }
                       una risposta da quell'indirizzo, con un PDF
     /banco/giro       il giro programmato (casella, invii, pulizie, avvisi)
     /banco/avvisi     le email degli errori partite finora
     /banco/notizie    le email a chi ha preparato le lettere partite finora
     /banco/posta      le PEC partite finora
   ============================================================ */
'use strict';
const http = require('http');
const F = require('./circ-finti');
const api = require('../api/circolarizzazioni');

const persone = [
    { id: 'p0', nome: 'Missori', nomeProprio: 'Andrea', email: 'a.missori@emvas.tax', attivo: true },
    { id: 'p1', nome: 'Rossi', nomeProprio: 'Marta', email: 'marta@studio.it', attivo: true },
    { id: 'p2', nome: 'Bianchi', nomeProprio: 'Luca', email: 'luca@studio.it', attivo: true },
    { id: 'p3', nome: 'Verdi', nomeProprio: 'Anna', email: 'anna@studio.it', attivo: true },
    { id: 'p4', nome: 'Neri', nomeProprio: 'Ugo', email: 'ugo@studio.it', attivo: true }
];
const incarichi = [
    { id: 'inc-alfa', cliente: 'ALFA MECCANICA SRL', stato: 'attivo', respIncarico: 'Verdi', qualita: 'Neri', team: 'Rossi, Bianchi' },
    { id: 'inc-beta', cliente: 'BETA TESSILE SPA', stato: 'attivo', respIncarico: 'Verdi', qualita: 'Neri', team: 'Bianchi' },
    { id: 'inc-delta', cliente: 'DELTA COSTRUZIONI SRL', stato: 'attivo', respIncarico: 'Missori', qualita: 'Neri', team: 'Rossi' },
    { id: 'inc-gamma', cliente: 'GAMMA LOGISTICA SRL', stato: 'attivo', respIncarico: 'Verdi', qualita: 'Neri', team: 'Bianchi' }
];
F.dati.set('archivio/incarichi', { json: JSON.stringify(incarichi) });
F.dati.set('archivio/persone', { json: JSON.stringify(persone) });
persone.forEach(p => F.dati.set('utenti/' + p.email, { nome: p.nomeProprio + ' ' + p.nome, ruolo: p.id === 'p0' ? 'admin' : 'procuratore', attivo: true }));

const conRicevute = new Set();
function ricevute() {
    let n = 0;
    F.posta.forEach(m => {
        const rif = String(m.messageId).replace(/[<>]/g, '');
        if (conRicevute.has(rif)) return;
        conRicevute.add(rif);
        F.ricevuta('accettazione', rif, { identificativo: 'opec-' + rif });
        if (/errore/.test(m.to)) F.ricevuta('errore-consegna', rif, { errore: 'no-dest', erroreEsteso: '5.1.1 - casella inesistente' });
        else F.ricevuta('avvenuta-consegna', rif, { consegna: m.to });
        n++;
    });
    return n;
}
function rispondi(b) {
    const m = F.posta.slice().reverse().find(x => x.to === String(b.pec || '').toLowerCase());
    const rif = m ? String(m.messageId).replace(/[<>]/g, '') : '';
    F.risposta({
        da: b.da || b.pec, oggetto: b.oggetto || (m && b.inRisposta !== false ? 'R: ' + m.subject : 'Riscontro alla Vostra richiesta'),
        inRisposta: b.inRisposta && rif ? 'opec-' + rif : '', ordinaria: !!b.ordinaria, pdfByte: Number(b.pdfByte) || 40000,
        testo: b.testo || 'Spett.le Revilaw S.p.A.,\nin allegato la lettera di conferma compilata e firmata.\n\nDistinti saluti'
    });
    return 1;
}
function chiama(metodo, corpo, intestazioni) {
    return new Promise(risolvi => {
        let stato = 200;
        const res = { setHeader() { }, status(s) { stato = s; return res; }, json(j) { risolvi({ stato, corpo: j }); return res; }, end() { risolvi({ stato, corpo: null }); return res; } };
        api({ method: metodo, headers: intestazioni || {}, body: corpo }, res);
    });
}

const porta = Number(process.argv[2]) || 8790;
http.createServer((req, res) => {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
    const pezzi = [];
    req.on('data', p => pezzi.push(p));
    req.on('end', async () => {
        let b = {};
        try { b = JSON.parse(Buffer.concat(pezzi).toString('utf8') || '{}'); } catch (_) { b = {}; }
        let out;
        try {
            if (req.url === '/banco/ricevute') out = { stato: 200, corpo: { ok: true, ricevute: ricevute() } };
            else if (req.url === '/banco/risposta') out = { stato: 200, corpo: { ok: true, risposte: rispondi(b) } };
            else if (req.url === '/banco/giro') out = await chiama('GET', {}, { authorization: 'Bearer ' + process.env.CRON_SECRET });
            else if (req.url === '/banco/notizie') out = { stato: 200, corpo: { ok: true, notizie: F.notizie.map(m => ({ a: m.to, oggetto: m.subject, testo: m.text, html: m.html })) } };
            else if (req.url === '/banco/avvisi') out = { stato: 200, corpo: { ok: true, avvisi: F.avvisi.map(m => ({ a: m.to, da: m.from, oggetto: m.subject, testo: m.text, html: m.html })) } };
            else if (req.url === '/banco/posta') out = { stato: 200, corpo: { ok: true, posta: F.posta.map(m => ({ a: m.to, oggetto: m.subject, testo: m.text, html: m.html, allegato: m.attachments[0].filename })) } };
            else out = await chiama('POST', b);
        } catch (e) { out = { stato: 500, corpo: { ok: false, msg: String(e && e.message) } }; }
        res.writeHead(out.stato, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, cors));
        res.end(JSON.stringify(out.corpo || {}));
    });
}).listen(porta, '127.0.0.1', () => console.log('Banco di prova delle circolarizzazioni su http://127.0.0.1:' + porta + '/api/circolarizzazioni'));
