/* ============================================================
   PROVE - area-riservata/programma-giornata.js
   ------------------------------------------------------------
       node prove/programma-giornata.prove.js

   Il modulo vive nel browser (lo carica l'area riservata) ma e'
   fatto di funzioni pure, quindi si prova da qui come tutto il
   resto. Esce con 1 se qualcosa e' rosso.

   COSA DIMOSTRANO. Che la giornata si legge come succede e che
   l'errore che nessuno vedeva viene fuori da solo:

     - mattina e pomeriggio si dividono sulla PAUSA PRANZO vera -
       quella scritta in scaletta, poi quella degli incontri B2B,
       e solo in mancanza di tutto le 13:00;
     - chi e' SUL PALCO e nello stesso orario ha un incontro B2B
       gia' prenotato e' un errore GRAVE: sono due impegni presi
       con due persone diverse. Se invece quell'ora e' soltanto
       ancora prenotabile e' un avviso: basta chiuderla;
     - un tavolo SPENTO non toglie nessuno dal palco, e un orario
       gia' chiuso non e' un conflitto: sono i due modi in cui
       una segnalazione inventata farebbe perdere fiducia a tutte
       le altre;
     - la stessa persona si riconosce dall'INDIRIZZO EMAIL anche
       se il nome e' scritto in un altro modo, perche' un
       confronto sbagliato qui vuol dire un conflitto vero non
       visto;
     - gli avvisi della scaletta (ore mancanti, contemporanee,
       tavola senza moderatore) dicono quello che manca senza
       impedire niente;
     - questa regola vive in DUE posti - qui, per dipingere di
       rosso mentre si scrive, e nel servizio, per rifiutare un
       salvataggio deciso sull'ultima versione dei dati - e
       l'ultima prova le mette una davanti all'altra sugli
       stessi casi: se una cambia senza l'altra, diventa rossa.
   ============================================================ */
'use strict';
const path = require('path');
const G = require(path.join(__dirname, '..', '..', 'area-riservata', 'programma-giornata.js'));
// la meta' della stessa regola che sta nel servizio, quella che BLOCCA
const PRG = require(path.join(__dirname, '..', 'lib', 'programma-evento.js'));

const TIPI = [
    { id: 'registrazione', nome: 'Registrazione', conRelatori: false, conModeratore: false },
    { id: 'tavola', nome: 'Tavola rotonda', conRelatori: true, conModeratore: true },
    { id: 'intervento', nome: 'Intervento', conRelatori: true, conModeratore: false },
    { id: 'pranzo', nome: 'Pausa pranzo', conRelatori: false, conModeratore: false }
];
const anna = { nome: 'Anna Verdi', email: 'anna@revilaw.it', ruolo: 'Revisore legale' };
const annaScrittaMale = { nome: 'A. Verdi', email: 'ANNA@revilaw.it' };
const luca = { nome: 'Luca Bianchi', email: 'luca@sponsor.it' };

// un tavolo B2B come lo conosce l'agenda
function tavolo(opz) {
    const slot = (opz.slot || []).map(s => ({
        ora: s[0], fine: s[1], chiave: s[0].replace(':', ''), stato: s[2],
        chi: s[3] ? { nome: s[3], azienda: s[4] || '' } : null
    }));
    return {
        id: opz.id || 'merito-creditizio', nome: opz.nome || 'Merito creditizio',
        attiva: opz.attiva !== false, referenti: opz.referenti || [anna], slot: slot
    };
}

let ok = 0, ko = 0;
function esigi(cond, testo) { if (cond) { ok++; console.log('  ok   ' + testo); } else { ko++; console.log('  KO   ' + testo); } }
function prova(nome, fn) {
    console.log('\n' + nome);
    try { fn(); } catch (e) { ko++; console.log('  KO   eccezione: ' + (e && e.stack || e)); }
}

prova('1) Mattina e pomeriggio si dividono sulla pausa pranzo', () => {
    const voci = [
        { tipo: 'registrazione', titolo: 'Registrazione', dalle: '09:00', alle: '09:30' },
        { tipo: 'pranzo', titolo: 'Pranzo', dalle: '12:30', alle: '13:30' },
        { tipo: 'tavola', titolo: 'Tavola', dalle: '14:30', alle: '15:40' },
        { tipo: 'intervento', titolo: 'Da collocare' }
    ];
    esigi(G.confine(voci, { pranzoDa: '13:00', pranzoA: '14:00' }) === 13 * 60 + 30,
        'vale la FINE della pausa scritta in scaletta, non quella dei tavoli');
    esigi(G.confine([], { pranzoDa: '13:00', pranzoA: '14:00' }) === 14 * 60, 'senza scaletta vale la pausa dei tavoli');
    esigi(G.confine([], {}) === G.CONFINE_PREDEFINITO, 'senza nemmeno quella, le 13:00');
    const f = G.dividi(voci, G.confine(voci, {}));
    esigi(f.mattina.length === 2 && f.mattina[0].titolo === 'Registrazione' && f.mattina[1].titolo === 'Pranzo',
        'la pausa pranzo sta nella mattina, che e dove comincia');
    esigi(f.pomeriggio.length === 1 && f.pomeriggio[0].titolo === 'Tavola', 'il pomeriggio comincia dopo');
    esigi(f.senzaOra.length === 1, 'la voce senza ora non sparisce: sta da parte');
    const slot = [{ ora: '10:00' }, { ora: '12:00' }, { ora: '14:00' }, { ora: '17:30' }];
    esigi(G.slotDellaFascia(slot, 0, 12 * 60 + 30).length === 2
        && G.slotDellaFascia(slot, 12 * 60 + 30, 24 * 60).length === 2,
        'anche gli orari dei tavoli si dividono sullo stesso confine');
});

prova('2) Sul palco e al tavolo nello stesso momento: errore grave', () => {
    const voci = [{ tipo: 'tavola', titolo: 'Merito creditizio', dalle: '14:30', alle: '15:40', moderatore: anna, partecipanti: [] }];
    const aree = [tavolo({
        slot: [['14:00', '14:30', 'libero'], ['14:30', '15:00', 'occupato', 'Mario Rossi', 'Alfa S.r.l.'],
        ['15:00', '15:30', 'occupato', 'Elena Bruni', 'Beta SpA'], ['16:00', '16:30', 'libero']]
    })];
    const c = G.conflittiB2B(voci, aree, TIPI);
    const gravi = c.filter(x => x.grave);
    esigi(gravi.length === 1, 'un errore grave solo, non uno per incontro');
    esigi(gravi[0].ore.join(',') === '14:30,15:00', 'con dentro tutti e due gli orari coinvolti');
    esigi(/Anna Verdi modera "Merito creditizio"/.test(gravi[0].testo)
        && /Mario Rossi \(Alfa S\.r\.l\.\)/.test(gravi[0].testo),
        'e il testo dice chi, cosa e con chi aveva appuntamento');
    esigi(c.filter(x => !x.grave).length === 0, 'le 14:00 e le 16:00 non toccano la fascia del palco');
});

prova('3) Orari ancora prenotabili: avviso, non errore', () => {
    const voci = [{ tipo: 'intervento', titolo: 'Intervento', dalle: '10:00', alle: '11:00', partecipanti: [anna] }];
    const aree = [tavolo({ slot: [['10:00', '10:30', 'libero'], ['10:30', '11:00', 'libero'], ['11:00', '11:30', 'libero']] })];
    const c = G.conflittiB2B(voci, aree, TIPI);
    esigi(c.length === 1 && !c[0].grave, 'un avviso, e non un errore');
    esigi(c[0].ore.join(',') === '10:00,10:30', 'solo gli orari che cadono davvero nella fascia');
    esigi(/Anna Verdi è sul palco per "Intervento"/.test(c[0].testo) && /chiudili/.test(c[0].testo),
        'e si dice cosa fare: chiudere quegli orari');
});

prova('4) Le segnalazioni inventate non si fanno', () => {
    const voci = [{ tipo: 'tavola', titolo: 'Tavola', dalle: '14:30', alle: '15:40', moderatore: anna }];
    const spento = [tavolo({ attiva: false, slot: [['14:30', '15:00', 'libero']] })];
    esigi(G.conflittiB2B(voci, spento, TIPI).length === 0, 'un tavolo spento non toglie nessuno dal palco');
    const chiuso = [tavolo({ slot: [['14:30', '15:00', 'chiuso'], ['15:00', '15:30', 'chiuso']] })];
    esigi(G.conflittiB2B(voci, chiuso, TIPI).length === 0, 'gli orari gia chiusi non sono un conflitto');
    const altri = [tavolo({ referenti: [luca], slot: [['14:30', '15:00', 'occupato', 'Mario Rossi']] })];
    esigi(G.conflittiB2B(voci, altri, TIPI).length === 0, 'il tavolo di un altro non riguarda chi e sul palco');
    const senzaOre = [{ tipo: 'tavola', titolo: 'Da collocare', moderatore: anna }];
    const pieno = [tavolo({ slot: [['14:30', '15:00', 'occupato', 'Mario Rossi']] })];
    esigi(G.conflittiB2B(senzaOre, pieno, TIPI).length === 0, 'una voce senza orario non si confronta con niente');
});

prova('5) La stessa persona, scritta in due modi', () => {
    const voci = [{ tipo: 'tavola', titolo: 'Tavola', dalle: '14:30', alle: '15:40', moderatore: annaScrittaMale }];
    const aree = [tavolo({ slot: [['14:30', '15:00', 'occupato', 'Mario Rossi']] })];
    esigi(G.conflittiB2B(voci, aree, TIPI).filter(x => x.grave).length === 1,
        'si riconosce dall\'indirizzo email, anche con il nome puntato');
    esigi(G.chiavePersona({ nome: 'Élise Müller' }) === G.chiavePersona({ nome: 'elise  muller' }),
        'senza email si ripiega sul nome, senza accenti e senza doppi spazi');
    esigi(G.chiavePersona({}) === '', 'chi non ha ne nome ne email non e nessuno');
});

prova('6) Gli orari da dipingere di rosso', () => {
    const voci = [
        { tipo: 'tavola', titolo: 'Tavola', dalle: '14:30', alle: '15:40', moderatore: anna },
        { tipo: 'intervento', titolo: 'Intervento', dalle: '10:00', alle: '10:30', partecipanti: [anna] }
    ];
    const aree = [tavolo({
        slot: [['10:00', '10:30', 'libero'], ['14:30', '15:00', 'occupato', 'Mario Rossi'], ['15:00', '15:30', 'libero']]
    })];
    const mappa = G.oreInConflitto(G.conflittiB2B(voci, aree, TIPI));
    esigi(mappa['merito-creditizio|1430'] === 'grave', 'l\'orario gia prenotato e grave');
    esigi(mappa['merito-creditizio|1000'] === 'aperto' && mappa['merito-creditizio|1500'] === 'aperto',
        'quelli ancora prenotabili sono da chiudere');
    esigi(Object.keys(mappa).length === 3, 'e nessun altro orario risulta in conflitto');
});

prova('7) Cosa non torna nella scaletta', () => {
    const voci = [
        { tipo: 'tavola', titolo: 'Senza moderatore', dalle: '14:30', alle: '15:40', partecipanti: [anna] },
        { tipo: 'intervento', titolo: 'Senza fine', dalle: '16:00' },
        { tipo: 'intervento', titolo: 'Senza niente' },
        { tipo: 'intervento', titolo: 'Storta', dalle: '11:00', alle: '10:00' },
        { tipo: 'intervento', titolo: 'Contemporanea', dalle: '15:00', alle: '15:30' }
    ];
    const testi = G.avvisi(voci, TIPI).map(a => a.testo).join(' | ');
    esigi(/Senza moderatore: manca il moderatore/.test(testi), 'una tavola rotonda senza moderatore si dice');
    esigi(/Senza fine: manca l'ora di fine/.test(testi) && /Senza niente: manca l'ora di inizio/.test(testi),
        'le ore mancanti si dicono, una per una');
    esigi(/Storta: finisce prima di cominciare/.test(testi), 'e un\'ora storta pure');
    esigi(/in contemporanea: Senza moderatore e Contemporanea/.test(testi), 'due cose insieme si segnalano una volta sola');
    esigi(G.avvisi([{ tipo: 'registrazione', titolo: 'Registrazione', dalle: '09:00', alle: '09:30' }], TIPI).length === 0,
        'una giornata che torna non ha niente da dire');
    esigi(G.titoloVoce({ tipo: 'tavola' }, TIPI) === 'Tavola rotonda',
        'una voce senza titolo si nomina con il suo tipo');
    esigi(G.nomePersona({ nome: 'Mario Rossi', titolo: 'Avv.' }) === 'Avv. Mario Rossi',
        'il titolo scritto a mano sta davanti al nome');
});

prova('8) La regola del browser e quella del servizio dicono la stessa cosa', () => {
    /* La regola vive in due posti, e deve: il browser la usa a ogni tasto
       per dipingere di rosso, il servizio la usa al salvataggio per
       rifiutare - e il servizio deve decidere sull'ultima versione dei
       dati, non su quella che aveva in mano chi guardava.
       Due copie che si allontanano sarebbero il peggio dei due mondi: uno
       schermo rosso che si salva, o uno schermo pulito che viene
       respinto. Qui si mettono le stesse carte davanti a tutte e due e si
       pretende la stessa risposta. */
    const casi = [
        {
            nome: 'un orario prenotato sotto il palco',
            voci: [{ tipo: 'tavola', titolo: 'Tavola', dalle: '14:30', alle: '15:40', moderatore: anna, partecipanti: [luca] }],
            aree: [tavolo({ slot: [['14:00', '14:30', 'libero'], ['14:30', '15:00', 'occupato', 'Elena Bruni', 'Beta SpA'], ['15:00', '15:30', 'libero']] })]
        },
        {
            nome: 'nessuna prenotazione, solo orari liberi',
            voci: [{ tipo: 'tavola', titolo: 'Tavola', dalle: '14:30', alle: '15:40', partecipanti: [anna] }],
            aree: [tavolo({ slot: [['14:30', '15:00', 'libero'], ['15:00', '15:30', 'chiuso']] })]
        },
        {
            nome: 'il tavolo e spento',
            voci: [{ tipo: 'tavola', titolo: 'Tavola', dalle: '14:30', alle: '15:40', partecipanti: [anna] }],
            aree: [tavolo({ attiva: false, slot: [['14:30', '15:00', 'occupato', 'Elena Bruni']] })]
        },
        {
            nome: 'il nome scritto in un altro modo',
            voci: [{ tipo: 'tavola', titolo: 'Tavola', dalle: '14:30', alle: '15:40', partecipanti: [annaScrittaMale] }],
            aree: [tavolo({ slot: [['14:30', '15:00', 'occupato', 'Elena Bruni']] })]
        },
        {
            nome: 'due tavoli, due prenotazioni',
            voci: [{ tipo: 'tavola', titolo: 'Tavola', dalle: '14:00', alle: '16:00', moderatore: anna, partecipanti: [luca] }],
            aree: [
                tavolo({ slot: [['14:30', '15:00', 'occupato', 'Elena Bruni']] }),
                tavolo({ id: 'esg', nome: 'ESG', referenti: [luca], slot: [['15:00', '15:30', 'occupato', 'Ugo Neri']] })
            ]
        },
        {
            nome: 'una voce senza ora non impegna nessuno',
            voci: [{ tipo: 'tavola', titolo: 'Tavola', partecipanti: [anna] }],
            aree: [tavolo({ slot: [['14:30', '15:00', 'occupato', 'Elena Bruni']] })]
        },
        {
            nome: 'il palco finisce quando il tavolo comincia',
            voci: [{ tipo: 'tavola', titolo: 'Tavola', dalle: '13:30', alle: '14:30', partecipanti: [anna] }],
            aree: [tavolo({ slot: [['14:30', '15:00', 'occupato', 'Elena Bruni']] })]
        }
    ];
    const impronta = lista => lista.map(c => c.areaId + '|' + (c.chiavi || []).join(',')).sort().join(' ; ');
    casi.forEach(caso => {
        const browser = G.conflittiB2B(caso.voci, caso.aree, TIPI).filter(c => c.grave);
        const servizio = PRG.conflittiConPrenotazioni(caso.voci, caso.aree);
        esigi(impronta(browser) === impronta(servizio),
            caso.nome + ': stessa risposta (' + (impronta(servizio) || 'nessun blocco') + ')');
    });
});

console.log('\n' + ok + ' ok, ' + ko + ' KO');
process.exit(ko ? 1 : 0);
