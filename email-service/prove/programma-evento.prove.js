/* ============================================================
   PROVE - lib/programma-evento.js (la scaletta della giornata)
   ------------------------------------------------------------
       node prove/programma-evento.prove.js

   Niente da installare: Firestore e' finto e sta qui dentro.
   Esce con 1 se qualcosa e' rosso.

   COSA DIMOSTRANO. La scaletta e' un foglio che il giorno del
   convegno si legge dall'alto in basso, e queste prove tengono
   fermo proprio quello:

     - le voci si mettono in fila DA SOLE, in ordine di orario, e
       quella senza ora va in fondo invece di sparire;
     - una voce che non ha senso avere - il moderatore della pausa
       pranzo - non si salva: il tipo decide cosa una voce puo'
       portarsi dietro;
     - un'ora di fine prima dell'inizio non si tiene: si perde
       l'ora, non la voce che qualcuno stava scrivendo;
     - chi sale sul palco arriva dall'elenco iscritti, e un nome
       vuoto non diventa un relatore fantasma;
     - il salvataggio RISPONDE con la scaletta rifatta, cosi' chi
       ha salvato vede com'e' rimasta e non com'era sul suo
       schermo;
     - il titolo scritto a mano resta accanto al nome, che e'
       come la persona va annunciata dal palco;
     - la lettura e' di chiunque veda gli Eventi, la scrittura no;
     - una scaletta che manda sul palco qualcuno che in
       quell'ora ha gia' un incontro B2B PRENOTATO non si
       salva: sono due impegni presi con due persone
       diverse, e uno dei due salterebbe. Un orario solo
       ancora prenotabile, invece, resta un avviso: si
       chiude dai tavoli, e intanto la giornata si scrive.
   ============================================================ */
'use strict';
const path = require('path');

// ---------- orologio ----------
let orologio = Date.parse('2026-09-20T09:00:00Z');
Date.now = () => orologio;

// ---------- Firestore finto ----------
const dati = new Map();
function doc(chiave) {
    const self = {
        get: async () => ({ exists: dati.has(chiave), data: () => dati.get(chiave), ref: self }),
        set: async (v) => { dati.set(chiave, JSON.parse(JSON.stringify(v))); }
    };
    return self;
}
const db = { collection: nome => ({ doc: id => doc(nome + '/' + id) }) };

const RADICE = path.join(__dirname, '..');
const PRG = require(path.join(RADICE, 'lib/programma-evento.js'));

const EVENTO = 'napoli-2026-10-02';
function azzera() { dati.clear(); }
/* Un tavolo B2B tenuto da qualcuno, con gli orari che si vogliono presi.
   Serve a far incontrare le due cose: chi sta sul palco e chi e' atteso
   al tavolo. */
function mettiTavolo(areaId, referenti, presi, attiva) {
    const agenda = dati.get('b2bAgenda/' + EVENTO) || {
        evento: EVENTO, eventoDati: { titolo: 'Napoli', quando: '2 ottobre 2026' },
        giornata: { inizio: '10:00', fine: '18:00', pranzoDa: '13:00', pranzoA: '14:00', durata: 30 },
        aree: {}
    };
    agenda.aree[areaId] = { attiva: attiva !== false, referenti: referenti, chiusi: [], nota: '' };
    dati.set('b2bAgenda/' + EVENTO, agenda);
    const pren = dati.get('b2bPrenotazioni/' + EVENTO) || { evento: EVENTO, aree: {}, richieste: [] };
    pren.aree[areaId] = {};
    Object.keys(presi || {}).forEach(ora => {
        pren.aree[areaId][ora.replace(':', '')] = presi[ora];
    });
    dati.set('b2bPrenotazioni/' + EVENTO, pren);
}
function salvato() { return dati.get('programmaEventi/' + EVENTO); }
async function chiama(corpo, puo) {
    return PRG.esegui({
        db: db, body: Object.assign({ sezione: 'programma', evento: EVENTO }, corpo),
        email: 'staff@revilaw.it', collab: '', eAdmin: puo !== false, ePartner: puo !== false
    });
}
/* Come arrivano dall'elenco iscritti: con l'indirizzo email, che e' quello
   con cui si riconosce la stessa persona fra scaletta e tavoli B2B. */
const anna = { nome: 'Anna Verdi', email: 'anna@revilaw.it', ruolo: 'Revisore legale', azienda: 'Revilaw', sezione: 'aderenti', doc: 'c1' };
const luca = { nome: 'Luca Bianchi', email: 'luca@sponsor.it', ruolo: 'Partner', azienda: 'Sponsor Srl', sezione: 'sponsor', doc: 'd1' };

// ---------- il piccolo motore delle prove ----------
let ok = 0, ko = 0;
function esigi(cond, testo) { if (cond) { ok++; console.log('  ok   ' + testo); } else { ko++; console.log('  KO   ' + testo); } }
async function prova(nome, fn) {
    console.log('\n' + nome);
    try { await fn(); }
    catch (e) { ko++; console.log('  KO   eccezione: ' + (e && e.stack || e)); }
}

(async () => {

    await prova('1) La giornata si mette in fila da sola', async () => {
        azzera();
        const r = await chiama({
            azione: 'programma-salva',
            eventoDati: { titolo: 'Napoli', quando: '2 ottobre 2026' },
            voci: [
                { tipo: 'tavola', titolo: 'Merito creditizio', dalle: '14:30', alle: '15:40', moderatore: luca, partecipanti: [anna] },
                { tipo: 'registrazione', dalle: '09:00', alle: '09:30' },
                { tipo: 'pranzo', dalle: '13:00', alle: '14:00' },
                { tipo: 'altro', titolo: 'Da collocare' }
            ]
        });
        esigi(r.stato === 200 && r.corpo.ok, 'la scaletta si salva');
        const ordine = r.corpo.voci.map(v => v.tipo).join(' > ');
        esigi(ordine === 'registrazione > pranzo > tavola > altro',
            'in ordine di orario, e la voce senza ora va in fondo (' + ordine + ')');
        esigi(salvato().voci.length === 4, 'restano scritte tutte e quattro');
        esigi(salvato().aggiornato.da === 'staff@revilaw.it', 'resta scritto chi ha salvato');
    });

    await prova('2) Il tipo decide cosa una voce puo\' portarsi dietro', async () => {
        azzera();
        const r = await chiama({
            azione: 'programma-salva',
            voci: [
                { tipo: 'pranzo', dalle: '13:00', alle: '14:00', moderatore: luca, partecipanti: [anna] },
                { tipo: 'istituzionali', dalle: '09:45', alle: '10:00', moderatore: luca, partecipanti: [anna] },
                { tipo: 'tavola', titolo: 'Con chi', dalle: '14:30', alle: '15:40', moderatore: luca, partecipanti: [anna, { nome: '' }, anna] }
            ]
        });
        const per = t => r.corpo.voci.filter(v => v.tipo === t)[0];
        esigi(!per('pranzo').moderatore && per('pranzo').partecipanti.length === 0,
            'la pausa pranzo non ha moderatore ne relatori');
        esigi(!per('istituzionali').moderatore && per('istituzionali').partecipanti.length === 1,
            'i saluti istituzionali hanno chi parla ma non un moderatore');
        esigi(per('tavola').moderatore.nome === 'Luca Bianchi' && per('tavola').partecipanti.length === 2,
            'la tavola rotonda tiene moderatore e partecipanti, e butta il nome vuoto');
        esigi(per('tavola').moderatore.sezione === 'sponsor' && per('tavola').partecipanti[0].azienda === 'Revilaw',
            'di chi sale sul palco restano ruolo, azienda e sezione');
    });

    await prova('3) Un\'ora che non sta in piedi', async () => {
        azzera();
        const r = await chiama({
            azione: 'programma-salva',
            voci: [
                { tipo: 'intervento', titolo: 'Storta', dalle: '11:00', alle: '10:00' },
                { tipo: 'intervento', titolo: 'Ora inventata', dalle: '25:99', alle: 'boh' }
            ]
        });
        const storta = r.corpo.voci.filter(v => v.titolo === 'Storta')[0];
        esigi(storta && storta.dalle === '11:00' && storta.alle === '',
            'una fine prima dell\'inizio si perde, la voce resta');
        const inventata = r.corpo.voci.filter(v => v.titolo === 'Ora inventata')[0];
        esigi(inventata && !inventata.dalle && !inventata.alle, 'le ore che non sono ore non si scrivono');
        esigi(r.corpo.voci.length === 2, 'e tutte e due le voci restano in elenco');
    });

    await prova('4) Il titolo accanto al nome', async () => {
        azzera();
        const r = await chiama({
            azione: 'programma-salva',
            voci: [{
                tipo: 'tavola', titolo: 'Merito creditizio', dalle: '14:30', alle: '15:40',
                moderatore: Object.assign({}, luca, { titolo: 'Avv.' }),
                partecipanti: [Object.assign({}, anna, { titolo: 'Dott.ssa' })]
            }]
        });
        const v = r.corpo.voci[0];
        esigi(v.moderatore.titolo === 'Avv.' && v.partecipanti[0].titolo === 'Dott.ssa',
            'il titolo si salva con la persona, dentro quella voce');
        esigi(v.moderatore.email === 'luca@sponsor.it',
            'e l\'indirizzo email resta: e con quello che si riconosce chi tiene anche un tavolo B2B');
        const senza = await chiama({
            azione: 'programma-salva',
            voci: [{ tipo: 'tavola', titolo: 'x', dalle: '09:00', alle: '10:00', moderatore: anna }]
        });
        esigi(senza.corpo.voci[0].moderatore.titolo === '', 'senza titolo scritto, il campo resta vuoto');
    });

    await prova('5) La lettura: la scaletta e i tipi di voce', async () => {
        azzera();
        await chiama({ azione: 'programma-salva', voci: [{ tipo: 'saluti', dalle: '09:30', alle: '09:45', partecipanti: [anna] }] });
        const r = await chiama({ azione: 'programma' }, false);   // chi non puo' scrivere legge lo stesso
        esigi(r.stato === 200 && r.corpo.ok && r.corpo.voci.length === 1, 'chi vede gli Eventi legge la scaletta');
        esigi(Array.isArray(r.corpo.tipi) && r.corpo.tipi.some(t => t.id === 'tavola' && t.conModeratore),
            'i tipi di voce viaggiano con la scaletta: l\'area riservata non ne tiene una copia');
        esigi(r.corpo.voci[0].partecipanti[0].nome === 'Anna Verdi', 'e chi e sul palco si legge');
    });

    await prova('6) Chi non manda gli inviti non riscrive la giornata', async () => {
        azzera();
        await chiama({ azione: 'programma-salva', voci: [{ tipo: 'registrazione', dalle: '09:00', alle: '09:30' }] });
        const r = await chiama({ azione: 'programma-salva', voci: [] }, false);
        esigi(r.stato === 403, 'il salvataggio viene respinto');
        esigi(salvato().voci.length === 1, 'e la scaletta resta quella di prima');
        const s = await chiama({ azione: 'inventata' });
        esigi(s.stato === 400, 'un\'azione che non esiste viene respinta');
        const senza = await PRG.esegui({ db: db, body: { sezione: 'programma' }, email: 'x@y.it', eAdmin: true });
        esigi(senza.stato === 400, 'senza evento non si fa niente');
    });

    await prova('7) Le funzioni interne', async () => {
        esigi(PRG.tipoDa('TAVOLA').id === 'tavola' && PRG.tipoDa('boh') === null, 'i tipi si riconoscono, gli altri no');
        esigi(PRG.tipoDa('pranzo').nome === 'Pausa pranzo', 'il tipo ha un nome da leggere');
        esigi(PRG.oraValida('09:30') && !PRG.oraValida('9:30') && !PRG.oraValida('24:00'), 'un\'ora e "HH:MM" e basta');
        const v = PRG.normalizzaVoce({ tipo: 'tavola', titolo: 'x', partecipanti: new Array(20).fill(anna) }, 0);
        esigi(v.partecipanti.length === 12, 'a un tavolo non si siedono in venti');
        esigi(PRG.normalizzaVoce({}, 3).id === 'v4', 'una voce senza identificativo ne prende uno dalla posizione');
    });

    await prova('8) Chi e\' atteso al tavolo non si manda sul palco', async () => {
        azzera();
        mettiTavolo('merito-creditizio', [anna], { '14:30': { doc: 'b1', nome: 'Elena Bruni', azienda: 'Beta SpA' } });
        const r = await chiama({
            azione: 'programma-salva',
            voci: [{ tipo: 'tavola', titolo: 'Merito creditizio', dalle: '14:30', alle: '15:40', moderatore: luca, partecipanti: [anna] }]
        });
        esigi(r.stato === 409 && !r.corpo.ok, 'la scaletta non si salva');
        esigi(/Anna Verdi/.test(r.corpo.msg) && /Elena Bruni/.test(r.corpo.msg) && /14:30/.test(r.corpo.msg),
            'e il rifiuto dice chi e quando: ' + r.corpo.msg.slice(0, 110));
        esigi(/sposta la voce|libera la prenotazione/.test(r.corpo.msg), 'e dice le due strade per uscirne');
        esigi(!dati.get('programmaEventi/' + EVENTO), 'niente e stato scritto');
        esigi(r.corpo.conflitti.length === 1 && r.corpo.conflitti[0].areaId === 'merito-creditizio'
            && r.corpo.conflitti[0].chiavi[0] === '1430',
            'e i conflitti viaggiano con la risposta, cosi l\'area riservata li dipinge di rosso');

        // spostata fuori da quell'ora, la stessa voce si salva
        const ok2 = await chiama({
            azione: 'programma-salva',
            voci: [{ tipo: 'tavola', titolo: 'Merito creditizio', dalle: '11:00', alle: '12:00', moderatore: luca, partecipanti: [anna] }]
        });
        esigi(ok2.stato === 200 && ok2.corpo.ok,
            'spostata alle 11:00, dove nessuno ha prenotato, la stessa voce passa');
        esigi(dati.get('programmaEventi/' + EVENTO).voci.length === 1, 'e adesso e scritta');
    });

    await prova('9) Si blocca solo quello che e\' gia\' prenotato', async () => {
        azzera();
        // stesso tavolo, stessa persona, ma nessuno ha prenotato
        mettiTavolo('merito-creditizio', [anna], {});
        const libero = await chiama({
            azione: 'programma-salva',
            voci: [{ tipo: 'tavola', titolo: 'Merito creditizio', dalle: '14:30', alle: '15:40', partecipanti: [anna] }]
        });
        esigi(libero.stato === 200 && libero.corpo.ok,
            'un orario soltanto ancora prenotabile non blocca: e un avviso, e si chiude dai tavoli');

        azzera();
        // il tavolo e' spento: non aspetta nessuno
        mettiTavolo('merito-creditizio', [anna], { '14:30': { doc: 'b1', nome: 'Elena Bruni' } }, false);
        const spento = await chiama({
            azione: 'programma-salva',
            voci: [{ tipo: 'tavola', titolo: 'x', dalle: '14:30', alle: '15:40', partecipanti: [anna] }]
        });
        esigi(spento.stato === 200, 'un tavolo spento non toglie nessuno dal palco');

        azzera();
        // un'altra persona allo stesso tavolo: l'incompatibilita' e' di chi lo tiene
        mettiTavolo('merito-creditizio', [anna], { '14:30': { doc: 'b1', nome: 'Elena Bruni' } });
        const altri = await chiama({
            azione: 'programma-salva',
            voci: [{ tipo: 'tavola', titolo: 'x', dalle: '14:30', alle: '15:40', partecipanti: [luca] }]
        });
        esigi(altri.stato === 200, 'chi non tiene quel tavolo sale sul palco quando vuole');

        azzera();
        // la stessa persona riconosciuta dall'EMAIL, anche se il nome e scritto diverso
        mettiTavolo('merito-creditizio', [{ nome: 'A. Verdi', email: 'ANNA@revilaw.it' }],
            { '14:30': { doc: 'b1', nome: 'Elena Bruni' } });
        const stessa = await chiama({
            azione: 'programma-salva',
            voci: [{ tipo: 'tavola', titolo: 'x', dalle: '14:30', alle: '15:40', partecipanti: [anna] }]
        });
        esigi(stessa.stato === 409, 'la stessa persona si riconosce dall\'indirizzo email, non dal nome');
    });

    console.log('\n' + ok + ' ok, ' + ko + ' KO');
    process.exit(ko ? 1 : 0);
})().catch(e => { console.error('Errore nelle prove:', e); process.exit(1); });
