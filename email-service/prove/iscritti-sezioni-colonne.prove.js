/* ============================================================
   PROVE - area-riservata/app.js, l'elenco degli iscritti: la sezione
   "In attesa di conferma mail", le colonne dal file delle aziende
   invitate e l'esportazione di tutto l'elenco
   ------------------------------------------------------------
       node prove/iscritti-sezioni-colonne.prove.js

   Niente da installare: le funzioni si ritagliano dal sorgente VERO
   di app.js, cosi' la prova non collauda una copia che puo'
   divergere. Finti sono solo i pezzi della chiusura che qui non
   servono davvero: le presenze (EventiPresenze), window e lo spazio
   del browser (localStorage).

   COSA DIMOSTRANO. A Milano l'iscrizione vale dopo la conferma
   dell'email, e le PEC partono a undicimila aziende: chi si iscrive
   e non conferma deve stare in una sezione sua, fuori dai conteggi
   della sala, e una regola sbagliata qui non da' errore - da' una
   sala contata male o un ospite vero nascosto fra gli "in attesa".
   Si verifica che:
     - la regola dell'attesa sia quella del servizio
       (lib/conferma-email.js, inAttesaDiConferma): solo dove la
       conferma e' chiesta, mai per le righe inserite a mano, quelle
       da altri portali, quelle caricate con "Importa" (a cui la mail
       non e' mai partita), quelle del vecchio foglio o senza indirizzo,
       e mai per chi e' stato segnato presente; e che la conferma valga
       per INDIRIZZO sull'elenco intero, non sulla sola sezione aperta;
     - la sezione in cui una riga si guarda sia l'attesa prima della
       modalita', e che l'attesa NON sia una modalita' (le tendine e
       il servizio non la conoscono);
     - le colonne del file restino nell'ordine del file, anche quando
       le righe non portano tutte le stesse intestazioni, e non si
       confondano con quelle di `extra` che si chiamano uguale;
     - lo zero si legga zero, gli importi abbiano i separatori - solo
       quelli nudi: un importo gia' scritto all'italiana ("557.044")
       resta com'e' - e i codici (partita IVA, CCIAA) restino come sono;
     - la tinta azzurra "dal modulo" sia della RIGA: la hanno le righe
       scritte da chi si iscrive, non quelle inserite a mano, da altri
       portali o da un file; e la ragione sociale sia "del file" solo
       dove il codice la impone (Milano);
     - la tabella larga tenga il posto in orizzontale fra un ridisegno e
       l'altro, e il menu delle ultime righe non resti tagliato;
     - le colonne scelte sopravvivano alla sessione e quelle che non
       esistono piu' si ignorino;
     - l'esportazione porti TUTTE le sezioni con la colonna "Sezione",
       TUTTE le colonne aggiuntive e del file anche se non scelte, lo
       zero, le intestazioni doppie distinte, nessun segno di spunta,
       e lasci fuori i soli invitati ai soli incontri B2B;
     - il testo del CSV tenga la guardia contro le formule, lasci
       passare i numeri negativi solo a chi lo chiede, e a chi lo chiede
       scriva i codici con lo zero davanti (partita IVA, codice fiscale)
       in modo che Excel non li trasformi in numeri.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'area-riservata', 'app.js'), 'utf8');

/* Il ritaglio per nome: si cerca l'inizio e si contano le parentesi fino
   alla chiusura. Lo stesso mestiere di prove/elenco-definitivo.prove.js. */
function ritaglia(apertura, apre, chiude) {
    const inizio = APP.indexOf(apertura);
    if (inizio < 0) throw new Error('non trovato in app.js: ' + apertura);
    let i = APP.indexOf(apre, inizio), aperte = 0, fine = -1;
    for (; i < APP.length; i++) {
        if (APP[i] === apre) aperte++;
        else if (APP[i] === chiude) { aperte--; if (!aperte) { fine = i + 1; break; } }
    }
    if (fine < 0) throw new Error('chiusura non trovata per: ' + apertura);
    return APP.slice(inizio, fine);
}
// le costanti di una riga sola: la riga intera, che e' una sola
function rigaDaAppJs(inizio) {
    const riga = APP.split('\n').filter(r => r.trim().indexOf(inizio) === 0);
    if (riga.length !== 1) throw new Error('in app.js non c\'e\' una sola riga che comincia con: ' + inizio);
    return riga[0].trim();
}
const COSTANTI = [
    rigaDaAppJs('const COL_B2B_PRENOTATI ='),
    rigaDaAppJs('const COL_PREF_ISCRIZIONE ='),
    rigaDaAppJs('const PREFISSO_COL_FILE ='),
    rigaDaAppJs('const CHIAVE_COLONNE_EVENTO ='),
    rigaDaAppJs('const PORTALE_DESK ='),
    ritaglia('const NOMI_MODALITA = {', '{', '}') + ';',
    ritaglia('const NOMI_STATO = {', '{', '}') + ';',
    ritaglia('const SEZIONI_MODALITA = [', '[', ']') + ';',
    ritaglia('const SEZIONE_ATTESA = {', '{', '}') + ';',
    ritaglia('const COLONNE_FISSE_MANUALE = [', '[', ']') + ';',
    ritaglia('const COLONNE_DAL_MODULO = [', '[', ']') + ';',
    // gli eventi veri: la prova usa Milano e Napoli come sono scritti nell'app
    ritaglia('const EVENTI_DEF = [', '[', ']') + ';'
].join('\n');
/* Le funzioni ritagliate si chiamano fra loro: si dichiarano tutte nello
   stesso giro, dentro una funzione sola, cosi' si vedono come dentro app.js. */
const NOMI = ['modalitaDi', 'sezioneDef', 'fuoriElenco', 'soloIscritti', 'dalModuloDelSito', 'inAttesaConfermaMail',
    'scrittoDaChiSiIscrive', 'aziendaDalFileDi',
    'sezioneVista', 'nomeSezioneVista', 'indirizziConfermati', 'confermaEmailDi', 'partecipantiDi',
    'colonneExtraDisponibili', 'datiInvitoDi', 'colonneFileDisponibili', 'valoreFileDi',
    'valoreColonnaVisto', 'colonneAggiuntiveDi', 'colonneScelteDi', 'salvaColonneScelte',
    'colonneDaMostrare', 'fmtDataOra', 'firmaPresenza', 'aggiornatoDaDi', 'nomeEventoDa',
    'righeCsvIscrizioni', 'testoCsv', 'esc', 'dataIscrizioneMs', 'invioConfermaTesto', 'hintAttesaMailHtml'];
const sorgente = NOMI.map(n => ritaglia('function ' + n + '(', '{', '}')).join('\n');

/* Le finzioni. Le presenze sono una tabella che ogni scenario riempie;
   window non ha RV_PROMEMORIA (nomi e aziende escono come sono); lo spazio
   del browser e' una mappa, che si puo' far rompere come in una finestra
   anonima. */
let presenze = {};
const EventiPresenze = { di(evento, idIscritto) { return presenze[idIscritto] || null; } };
const archivio = { dati: {}, rotto: false };
const localStorage = {
    getItem(k) { if (archivio.rotto) throw new Error('niente spazio'); return Object.prototype.hasOwnProperty.call(archivio.dati, k) ? archivio.dati[k] : null; },
    setItem(k, v) { if (archivio.rotto) throw new Error('niente spazio'); archivio.dati[k] = String(v); }
};
const AMBIENTE = new Function('EventiPresenze', 'window', 'localStorage', 'vedoCollaboratoreDi', 'nomeDaFirma',
    'let _evIscrizioni = null, _evColonne = {}, _evConfCache = { lista: null, mappa: null };\n'
    + COSTANTI + '\n' + sorgente
    + '\nreturn { ' + NOMI.join(', ') + ', SEZIONI_MODALITA, SEZIONE_ATTESA, EVENTI_DEF, PREFISSO_COL_FILE, CHIAVE_COLONNE_EVENTO, PORTALE_DESK,'
    + '  azzeraColonne: () => { _evColonne = {}; }, metti: l => { _evIscrizioni = l; } };')(
    EventiPresenze, {}, localStorage, () => false, x => x);
const A = AMBIENTE;

let ok = 0, ko = 0;
function esigi(cond, cosa, extra) {
    if (cond) { ok++; console.log('  verde  ' + cosa); }
    else { ko++; console.log('  ROSSO  ' + cosa + (extra !== undefined ? '   ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); }
}
const prove = [];
function prova(titolo, fn) { prove.push({ titolo: titolo, fn: fn }); }

const MILANO = A.EVENTI_DEF.find(e => e.id === 'milano-2027-02-26');
const NAPOLI = A.EVENTI_DEF.find(e => e.id === 'napoli-2026-10-02');
const TUTTI = A.EVENTI_DEF.find(e => e.tutti);

/* Una riga dell'elenco come la manda il servizio (api/iscrizioni.js). */
let seq = 0;
function riga(campi) {
    const id = 'i' + (++seq);
    return Object.assign({
        id: id, doc: 'doc-' + id, data: '20/10/2026 10:0' + (seq % 10), pagina: 'Milano 26 Febbraio 2027',
        nome: 'Nome' + seq, cognome: 'Cognome' + seq, email: 'p' + seq + '@esempio.it',
        azienda: 'Azienda ' + seq, ruolo: 'CFO', telefono: '333000' + seq
    }, campi || {});
}
const CONFERMATA = { quando: Date.UTC(2026, 9, 20, 9, 30), come: 'mail' };
/* La riga del file delle aziende invitate, nell'ordine del file vero. */
const FILE = ['#', 'Ragione sociale (file)', 'Codice fiscale', 'PEC', 'Ricavi (EUR)', 'Utile netto (EUR)',
    'Totale attivo (EUR)', 'Capitale sociale (EUR)', 'Dipendenti', 'Chiusura bilancio', 'Provincia (sede operativa)',
    'Comune (sede operativa)', 'Provincia (sede legale)', 'Settore di attivita', 'Partita IVA', 'Numero CCIAA',
    'Revisore o societa di revisione', 'Data nomina revisore'];
const AVAS = ['1', 'AVAS PHARMACEUTICALS S.R.L.', '09190500968', 'info@pec.avaspharma.com', '100674810', '1557044',
    '102555667', '1000000', '12', '31/12/2025', 'Milano', 'MILANO', 'Milano', 'COMMERCIO ALL\'INGROSSO DI MEDICINALI',
    '09190500968', 'MI2074797', 'Sig. Alessandro Ballardini', '30/06/2026'];
const datiInvito = valori => FILE.map((c, i) => ({ c: c, v: valori[i] }));

/* ------------------------------------------------------------
   L'ATTESA DELLA CONFERMA
   ------------------------------------------------------------ */

prova('Milano chiede la conferma, Napoli e il riepilogo no', () => {
    esigi(MILANO && MILANO.confermaEmail === true, 'Milano ha confermaEmail');
    esigi(NAPOLI && !NAPOLI.confermaEmail, 'Napoli no');
    esigi(A.SEZIONE_ATTESA.id === 'attesa' && A.SEZIONE_ATTESA.nome === 'In attesa di conferma mail',
        'la sezione si chiama "In attesa di conferma mail"', A.SEZIONE_ATTESA.nome);
    /* NON e' una modalita': le tendine, gli spostamenti in blocco e la
       whitelist del servizio (MODALITA_SCELTE) non la conoscono. */
    esigi(!A.SEZIONI_MODALITA.some(x => x.id === 'attesa'), 'e non sta fra le modalita\'',
        A.SEZIONI_MODALITA.map(x => x.id));
});

prova('Chi si iscrive dal sito e non conferma e\' in attesa; chi conferma no', () => {
    presenze = {};
    const attesa = riga();
    const conf = riga({ emailConfermata: CONFERMATA });
    const lista = [attesa, conf];
    esigi(A.inAttesaConfermaMail(MILANO, attesa, lista) === true, 'senza conferma: in attesa');
    esigi(A.inAttesaConfermaMail(MILANO, conf, lista) === false, 'con la conferma: no');
    // il vecchio foglio arriva senza doc: e' pregresso, non c'e' niente da confermare
    esigi(A.inAttesaConfermaMail(MILANO, riga({ doc: '' }), lista) === false, 'senza doc (vecchio foglio): mai in attesa');
    // confermata d'ufficio ("Segna confermati gli iscritti finora"): conta come confermata
    const preg = riga({ emailConfermata: { quando: 5, come: 'pregresso' } });
    esigi(A.inAttesaConfermaMail(MILANO, preg, lista.concat([preg])) === false, 'confermata d\'ufficio: no');
});

prova('Fuori dall\'attesa: a mano, da altri portali, senza indirizzo', () => {
    presenze = {};
    const aMano = riga({ inserito: { da: 'admin@x.it', daNome: 'Admin', quando: 1 } });
    const portale = riga({ extra: { Portale: 'Eventbrite', Partecipanti: '2' } });
    const desk = riga({ extra: { Portale: 'Desk (QR)' } });
    const senza = riga({ email: '   ' });
    const lista = [aMano, portale, desk, senza];
    esigi(!A.inAttesaConfermaMail(MILANO, aMano, lista), 'inserita a mano: l\'indirizzo lo ha scritto chi organizza');
    esigi(!A.inAttesaConfermaMail(MILANO, portale, lista), 'da Eventbrite: la mail con il pulsante non parte');
    esigi(!A.inAttesaConfermaMail(MILANO, desk, lista), 'registrata al desk: nemmeno');
    esigi(!A.inAttesaConfermaMail(MILANO, senza, lista), 'senza indirizzo: non c\'e\' niente da confermare');
});

prova('Le righe caricate con "Importa": in attesa solo se la mail era partita', () => {
    presenze = {};
    /* Un file di un altro portale caricato con "Importa": la scheda nasce con
       `importato` e nessuna mail di conferma. Nessuno la potrebbe confermare,
       e in attesa resterebbe per sempre, fuori dalla sala e dai promemoria.
       Chi si era iscritto dal sito e poi e' stato toccato da un'importazione
       (la colonna degli inviti B2B) la mail ce l'ha: quello resta in attesa. */
    const importata = riga({ importato: true });
    const dalSito = riga({ importato: true, mailConferma: { quando: 5, ok: true, errore: '' } });
    const lista = [importata, dalSito];
    esigi(A.inAttesaConfermaMail(MILANO, importata, lista) === false, 'importata senza mail di conferma: mai in attesa');
    esigi(A.sezioneVista(MILANO, importata, lista) === 'presenza', 'e sta nella sua modalita\'');
    esigi(A.inAttesaConfermaMail(MILANO, dalSito, lista) === true, 'iscritta dal sito e poi toccata da un\'importazione: in attesa');
    esigi(A.dalModuloDelSito(importata) === false && A.dalModuloDelSito(dalSito) === true,
        'la regola e\' una sola (dalModuloDelSito)');
    esigi(A.dalModuloDelSito(riga({ inserito: { da: 'a@x.it' } })) === false
        && A.dalModuloDelSito(riga({ extra: { Portale: 'Eventbrite' } })) === false
        && A.dalModuloDelSito(riga()) === true && A.dalModuloDelSito(null) === false,
        'a mano e da altri portali no, dal sito si\'');
});

prova('Chi e\' segnato presente non e\' piu\' in attesa', () => {
    presenze = {};
    /* E' entrato in sala: chi lo ha accolto l'ha visto. Conta fra chi c'e',
       confermato o no - e' la regola dei promemoria del servizio. Gli altri
       stati non bastano: "confermato" e' una telefonata, non una presenza. */
    const presente = riga();
    const confermato = riga();
    const assente = riga();
    presenze[presente.id] = { stato: 'presente', modalita: 'aderenti' };
    presenze[confermato.id] = { stato: 'confermato' };
    presenze[assente.id] = { stato: 'assente' };
    const lista = [presente, confermato, assente];
    esigi(A.inAttesaConfermaMail(MILANO, presente, lista) === false, 'presente: non in attesa');
    esigi(A.sezioneVista(MILANO, presente, lista) === 'aderenti', 'e sta nella sua sezione', A.sezioneVista(MILANO, presente, lista));
    esigi(A.inAttesaConfermaMail(MILANO, confermato, lista) === true, 'confermato da voi: ancora in attesa della mail');
    esigi(A.inAttesaConfermaMail(MILANO, assente, lista) === true, 'assente: ancora in attesa');
});

prova('Dove la conferma non e\' chiesta nessuno e\' mai in attesa', () => {
    presenze = {};
    const r = riga({ pagina: 'Napoli 2 Ottobre 2026' });
    esigi(A.inAttesaConfermaMail(NAPOLI, r, [r]) === false, 'Napoli: mai');
    esigi(A.inAttesaConfermaMail(TUTTI, r, [r]) === false, 'riepilogo di tutti gli eventi: mai');
    esigi(A.inAttesaConfermaMail(null, r, [r]) === false, 'senza evento: mai');
    esigi(A.sezioneVista(NAPOLI, r, [r]) === 'presenza', 'e la sezione resta la modalita\'');
});

prova('La conferma vale per INDIRIZZO, sull\'elenco intero', () => {
    presenze = {};
    /* Due iscrizioni con la stessa casella: una confermata, l'altra no. La
       seconda non e' in attesa - l'indirizzo e' confermato - ma solo se si
       guarda l'elenco intero: con la sola sezione aperta sembrerebbe di si'.
       E' per questo che la regola vuole l'elenco dell'evento. */
    const prima = riga({ email: 'Ufficio@Alfa.it', emailConfermata: CONFERMATA });
    const seconda = riga({ email: 'ufficio@alfa.it ' });
    esigi(A.inAttesaConfermaMail(MILANO, seconda, [prima, seconda]) === false, 'con l\'elenco intero: confermata');
    esigi(A.inAttesaConfermaMail(MILANO, seconda, [seconda]) === true, 'con la sola sezione sembrerebbe in attesa');
    // senza elenco vale quello dell'evento caricato
    A.metti([prima, seconda]);
    esigi(A.inAttesaConfermaMail(MILANO, seconda) === false, 'senza elenco si usa quello caricato');
    A.metti(null);
});

prova('La sezione in cui una riga si guarda', () => {
    presenze = {};
    const attesa = riga();
    const attesaOnline = riga({ modalita: 'online' });
    const aderente = riga({ emailConfermata: CONFERMATA });
    const spostataOnline = riga({ emailConfermata: CONFERMATA });
    presenze[aderente.id] = { modalita: 'aderenti' };
    presenze[spostataOnline.id] = { modalita: 'online' };
    // la modalita' scelta da chi organizza non toglie dall'attesa: l'email e' ancora da confermare
    presenze[attesa.id] = { modalita: 'sponsor' };
    const lista = [attesa, attesaOnline, aderente, spostataOnline];
    esigi(A.sezioneVista(MILANO, attesa, lista) === 'attesa', 'in attesa anche se spostata fra gli sponsor');
    esigi(A.sezioneVista(MILANO, attesaOnline, lista) === 'attesa', 'in attesa anche se iscritta online');
    esigi(A.modalitaDi(MILANO, attesa) === 'sponsor', 'e la modalita\' resta quella scelta (per quando conferma)');
    esigi(A.sezioneVista(MILANO, aderente, lista) === 'aderenti', 'confermata: la sua modalita\'');
    esigi(A.sezioneVista(MILANO, spostataOnline, lista) === 'online', 'confermata e spostata: online');
    esigi(A.nomeSezioneVista('attesa') === 'In attesa di conferma mail', 'il nome della sezione dell\'attesa');
    esigi(A.nomeSezioneVista('aderenti') === 'Aderenti Revilaw', 'e quello delle altre, dal loro elenco');
});

/* ------------------------------------------------------------
   LE COLONNE DAL FILE DELLE AZIENDE INVITATE
   ------------------------------------------------------------ */

prova('Le colonne del file restano nell\'ordine del file', () => {
    const r = riga({ datiInvito: datiInvito(AVAS) });
    const c = A.colonneFileDisponibili([r]);
    esigi(c.join('|') === FILE.join('|'), 'tutte e diciotto, nell\'ordine del file (e "#" in testa)', c);
    esigi(A.valoreFileDi(r, 'Ricavi (EUR)') === '100674810', 'il valore e\' quello del file, com\'e\'');
    esigi(A.valoreFileDi(r, 'Colonna che non c\'e\'') === '', 'una colonna assente vale vuoto');
});

prova('Righe con intestazioni diverse: la nuova va dopo quella che la precede', () => {
    const vecchia = riga({ datiInvito: [{ c: 'A', v: '1' }, { c: 'C', v: '3' }] });
    const nuova = riga({ datiInvito: [{ c: 'A', v: '1' }, { c: 'B', v: '2' }, { c: 'C', v: '3' }, { c: 'D', v: '4' }] });
    const senza = riga({ datiInvito: null });
    const strana = riga({ datiInvito: [null, { c: '  ', v: 'x' }, { c: ' A ', v: 'y' }, 'testo'] });
    const c = A.colonneFileDisponibili([senza, vecchia, strana, nuova]);
    esigi(c.join('|') === 'A|B|C|D', 'A, B, C, D come nel file', c);
    esigi(A.colonneFileDisponibili([senza, riga()]).length === 0, 'senza datiInvito non ci sono colonne del file');
});

prova('Le colonne di `extra` e quelle del file non si confondono', () => {
    archivio.dati = {}; archivio.rotto = false; A.azzeraColonne();
    const r = riga({ extra: { Settore: 'Industria e manifattura', Portale: 'Eventbrite' },
        datiInvito: [{ c: 'Settore', v: 'COMMERCIO' }, { c: 'Dipendenti', v: '0' }] });
    const d = A.colonneAggiuntiveDi(MILANO, [r]);
    esigi(d.extra.join('|') === 'Settore', 'Milano ha Portale fisso: fra le aggiuntive resta Settore', d.extra);
    esigi(d.file.join('|') === 'Settore|Dipendenti', 'e il file ha il suo Settore', d.file);
    A.salvaColonneScelte(MILANO, [A.PREFISSO_COL_FILE + 'Settore', 'Colonna sparita', A.PREFISSO_COL_FILE + 'Dipendenti']);
    const m = A.colonneDaMostrare(MILANO, [r]);
    esigi(m.length === 2 && m.every(x => x.file), 'scelto il Settore del file, non quello del modulo', m);
    esigi(m.map(x => x.nome).join('|') === 'Settore|Dipendenti', 'nell\'ordine del file, senza la colonna sparita', m.map(x => x.nome));
    A.salvaColonneScelte(MILANO, ['Settore']);
    const n = A.colonneDaMostrare(MILANO, [r]);
    esigi(n.length === 1 && !n[0].file && n[0].modulo, 'e il Settore del modulo e\' del modulo (tinta azzurra)', n);
});

prova('La scelta delle colonne resta fra una sessione e l\'altra', () => {
    archivio.dati = {}; archivio.rotto = false; A.azzeraColonne();
    A.salvaColonneScelte(MILANO, ['Profilo', A.PREFISSO_COL_FILE + 'PEC']);
    esigi(archivio.dati[A.CHIAVE_COLONNE_EVENTO + MILANO.id] === JSON.stringify(['Profilo', 'file:PEC']),
        'scritta nello spazio del browser, per evento', archivio.dati);
    A.azzeraColonne();   // una pagina nuova: la memoria si e' svuotata
    esigi(A.colonneScelteDi(MILANO).join('|') === 'Profilo|file:PEC', 'e riletta alla prima occhiata');
    esigi(A.colonneScelteDi(NAPOLI).length === 0, 'un altro evento ha la sua (vuota)');
    archivio.dati[A.CHIAVE_COLONNE_EVENTO + 'roma-2026-04-29'] = '{non e\' json';
    esigi(A.colonneScelteDi({ id: 'roma-2026-04-29' }).length === 0, 'un valore rovinato vale "nessuna"');
    archivio.rotto = true; A.azzeraColonne();
    let errore = null;
    try { A.salvaColonneScelte(MILANO, ['Profilo']); } catch (e) { errore = e; }
    esigi(!errore && A.colonneScelteDi(MILANO).join('|') === 'Profilo', 'senza spazio (finestra anonima) si lavora lo stesso');
    A.azzeraColonne();
    esigi(A.colonneScelteDi(MILANO).length === 0, 'e alla pagina dopo si riparte da zero, senza errori');
    archivio.rotto = false;
});

prova('Come si legge un valore: lo zero, gli importi, i codici', () => {
    esigi(A.valoreColonnaVisto('Dipendenti', '0') === '0', 'zero dipendenti si legge 0, non "-"');
    esigi(A.valoreColonnaVisto('Dipendenti', 0) === '0', 'anche quando arriva come numero');
    esigi(A.valoreColonnaVisto('Dipendenti', '') === '-' && A.valoreColonnaVisto('X', null) === '-', 'il vuoto e\' "-"');
    esigi(A.valoreColonnaVisto('Ricavi (EUR)', '100674810') === '100.674.810', 'gli importi con i separatori',
        A.valoreColonnaVisto('Ricavi (EUR)', '100674810'));
    esigi(A.valoreColonnaVisto('Utile netto (EUR)', '-1769584') === '-1.769.584', 'anche negativi',
        A.valoreColonnaVisto('Utile netto (EUR)', '-1769584'));
    esigi(A.valoreColonnaVisto('Utile netto (EUR)', '0') === '0', 'un utile a zero e\' zero');
    esigi(A.valoreColonnaVisto('Fatturato €', '2500000') === '2.500.000', 'anche con il simbolo dell\'euro',
        A.valoreColonnaVisto('Fatturato €', '2500000'));
    /* Un file .csv salvato da un Excel italiano porta gli importi gia'
       scritti: "557.044" sono 557 mila euro, non 557 euro e 4 centesimi.
       Si mostrano com'erano, e cosi' tutto quello che non e' un intero nudo. */
    esigi(A.valoreColonnaVisto('Utile netto (EUR)', '557.044') === '557.044', 'un importo gia\' scritto all\'italiana resta com\'e\'',
        A.valoreColonnaVisto('Utile netto (EUR)', '557.044'));
    esigi(A.valoreColonnaVisto('Utile netto (EUR)', '1.557.044') === '1.557.044', 'anche con due punti',
        A.valoreColonnaVisto('Utile netto (EUR)', '1.557.044'));
    esigi(A.valoreColonnaVisto('Utile netto (EUR)', '-114.178') === '-114.178', 'e negativo',
        A.valoreColonnaVisto('Utile netto (EUR)', '-114.178'));
    esigi(A.valoreColonnaVisto('Fatturato €', '2500000.5') === '2500000.5', 'un decimale non si indovina: resta com\'e\'',
        A.valoreColonnaVisto('Fatturato €', '2500000.5'));
    esigi(A.valoreColonnaVisto('Ricavi (EUR)', '1.234,56') === '1.234,56', 'e nemmeno la virgola');
    esigi(A.valoreColonnaVisto('Partita IVA', '09190500968') === '09190500968', 'la partita IVA resta com\'e\', zero davanti');
    esigi(A.valoreColonnaVisto('Codice fiscale', '00123456789') === '00123456789', 'e cosi\' il codice fiscale');
    esigi(A.valoreColonnaVisto('Numero CCIAA', 'MI2074797') === 'MI2074797', 'e il numero CCIAA');
    esigi(A.valoreColonnaVisto('Ricavi (EUR)', 'n.d.') === 'n.d.', 'un importo che non e\' un numero si mostra com\'e\'');
});

/* ------------------------------------------------------------
   LA TINTA "DAL MODULO" E' DELLA RIGA
   ------------------------------------------------------------ */

prova('L\'azzurro "dal modulo" solo sulle righe scritte da chi si iscrive', () => {
    const dalSito = riga();
    const vecchioFoglio = riga({ doc: '' });
    const aMano = riga({ inserito: { da: 'a@x.it', daNome: 'Admin', quando: 1 }, extra: { Portale: 'Eventbrite' } });
    const portale = riga({ extra: { Portale: 'Eventbrite' } });
    const importata = riga({ importato: true });
    const desk = riga({ extra: { Portale: A.PORTALE_DESK } });
    esigi(A.scrittoDaChiSiIscrive(dalSito) && A.scrittoDaChiSiIscrive(dalSito, true), 'dal sito: dati ed email');
    esigi(A.scrittoDaChiSiIscrive(vecchioFoglio, true), 'il vecchio foglio raccoglieva gli stessi moduli');
    esigi(!A.scrittoDaChiSiIscrive(aMano) && !A.scrittoDaChiSiIscrive(aMano, true), 'inserita a mano (Eventbrite): niente azzurro');
    esigi(!A.scrittoDaChiSiIscrive(portale), 'da un altro portale: niente');
    esigi(!A.scrittoDaChiSiIscrive(importata), 'caricata con "Importa": niente');
    esigi(A.scrittoDaChiSiIscrive(desk, true), 'dal QR del desk: il questionario del sito, compilato da lui');
    esigi(!A.scrittoDaChiSiIscrive(riga({ inserito: { da: 'a@x.it' }, extra: { Portale: A.PORTALE_DESK } })),
        'ma "Desk (QR)" scritto a mano da voi resta vostro');
    esigi(!A.scrittoDaChiSiIscrive(null), 'senza riga, niente');
});

prova('Chi completa i dati dal suo collegamento li ha scritti lui (l\'email no)', () => {
    /* "Completa i dati" riscrive nome, azienda, ruolo e telefono, ma mai
       l'email dell'intestatario, che e' l'identita' della scheda; quella
       degli accompagnatori (~p2, ~p3) si scrive proprio li'. */
    const compilato = { daNome: 'Mario Rossi', quando: 5 };
    const intestatario = riga({ doc: 'abc', inserito: { da: 'a@x.it' }, extra: { Portale: 'Eventbrite' }, compilato: compilato, completato: true });
    const accompagnatore = riga({ doc: 'abc~p2', extra: { Portale: 'Eventbrite' }, compilato: compilato });
    esigi(A.scrittoDaChiSiIscrive(intestatario), 'i dati dell\'intestatario: azzurri');
    esigi(!A.scrittoDaChiSiIscrive(intestatario, true), 'la sua email no: l\'avete scritta voi');
    esigi(A.scrittoDaChiSiIscrive(accompagnatore) && A.scrittoDaChiSiIscrive(accompagnatore, true),
        'l\'accompagnatore: dati ed email, scritti nel modulo');
});

prova('Chi prenota un tavolo B2B non ha scritto lui i dati della riga', () => {
    /* La prenotazione dei tavoli lascia "compilato" (la firma di "Aggiornato
       da") ma non "completato": nome, azienda e ruolo di una riga inserita da
       voi restano vostri. */
    const prenotato = riga({ doc: 'abc', inserito: { da: 'a@x.it' }, extra: { Portale: 'Eventbrite' },
        compilato: { daNome: 'Mario Rossi', quando: 5 }, b2bRisposta: { quando: 5, temi: 2 } });
    esigi(!A.scrittoDaChiSiIscrive(prenotato), 'senza "completato" la riga resta senza tinta');
    esigi(!A.scrittoDaChiSiIscrive(prenotato, true), 'e la sua email pure');
});

prova('La ragione sociale e\' "del file" solo dove il codice la impone', () => {
    const conCodice = riga({ invito: { codice: 'AB3K9', azienda: 'AVAS PHARMACEUTICALS S.R.L.', scheda: 's1' } });
    const napoli = riga({ pagina: 'Napoli 2 Ottobre 2026', invito: { codice: 'ZZ9Q1', azienda: 'BETA SPA', scheda: 's2' } });
    esigi(A.aziendaDalFileDi(MILANO, conCodice) === true, 'Milano, con il codice: il nome e\' quello del file');
    esigi(A.aziendaDalFileDi(MILANO, riga()) === false, 'Milano, senza codice: lo ha scritto la persona');
    esigi(A.aziendaDalFileDi(NAPOLI, napoli) === false, 'Napoli, con il codice: il nome lo ha digitato lui');
    esigi(A.aziendaDalFileDi(TUTTI, conCodice) === true && A.aziendaDalFileDi(TUTTI, napoli) === false,
        'nel riepilogo di tutti gli eventi vale l\'evento della riga');
});

prova('La tabella larga appena c\'e\' una colonna aggiuntiva', () => {
    /* Con una sola colonna in piu', a 1440px nome, azienda e nota
       scendevano a una trentina di pixel: la tabella larga scatta subito. */
    esigi(/const larga = extra\.length > 0;/.test(APP), 'in tabellaIscrizioni: extra.length > 0');
    esigi(APP.indexOf('COLONNE_PRIMA_DI_SCORRERE') < 0, 'e la vecchia soglia di quattro non c\'e\' piu\'');
});

/* Il posto in orizzontale e il menu dentro il riquadro: le funzioni vere,
   con un finto pezzo di pagina - quanto basta a leggerne i conti. */
const PAGINA = { riquadro: null, ridisegni: 0 };
const DOM = new Function('window', 'document', 'getComputedStyle', '$vista', 'vistaEventi',
    [ritaglia('function vistaEventiMantenendoPosto(', '{', '}'),
        ritaglia('function menuEvNelRiquadro(', '{', '}'),
        ritaglia('function menuEvFuoriDalRiquadro(', '{', '}')].join('\n')
    + '\nreturn { vistaEventiMantenendoPosto, menuEvNelRiquadro, menuEvFuoriDalRiquadro };')(
    { scrollY: 0, scrollTo() { } },
    { querySelectorAll: s => (s === '.ev-wrap.ev-larga' && PAGINA.riquadro ? [PAGINA.riquadro] : []) },
    el => ({ paddingBottom: (el && el.base) || '0px' }),
    () => ({ querySelector: s => (s === '.ev-wrap' ? PAGINA.riquadro : null) }),
    // il ridisegno: un riquadro NUOVO, che nasce a sinistra come nel browser
    () => { PAGINA.ridisegni++; PAGINA.riquadro = { scrollLeft: 0, style: { paddingBottom: '' } }; });

prova('La tabella larga resta dov\'era quando si ridisegna', () => {
    PAGINA.riquadro = { scrollLeft: 640, style: {} };
    const prima = PAGINA.riquadro;
    DOM.vistaEventiMantenendoPosto();
    esigi(PAGINA.ridisegni === 1 && PAGINA.riquadro !== prima, 'il riquadro e\' nuovo');
    esigi(PAGINA.riquadro.scrollLeft === 640, 'e riparte da dove si era arrivati a destra', PAGINA.riquadro.scrollLeft);
    PAGINA.riquadro.scrollLeft = 0;
    DOM.vistaEventiMantenendoPosto();
    esigi(PAGINA.riquadro.scrollLeft === 0, 'chi era a sinistra resta a sinistra');
    /* E lo scorrimento DENTRO il riquadro conta come "in movimento": i
       ridisegni automatici aspettano che si fermi, come per la finestra. */
    esigi(/querySelector\('\.ev-wrap'\);\s*if \(riquadro\) riquadro\.addEventListener\('scroll', \(\) => \{ _evScorrendoFino = Date\.now\(\) \+ EV_QUIETE_MS; \}/.test(APP),
        'lo scorrimento del riquadro tiene fermi i ridisegni (_evScorrendoFino)');
});

prova('Il menu delle ultime righe non resta tagliato dal riquadro', () => {
    /* Il riquadro largo e' alto 148px dal suo bordo (in cima a 100px, bordo di
       1px); il menu dell'ultima riga arriva 60px piu' giu': il riquadro si
       allunga di quanto sporge, piu' un filo, e torna com'era alla chiusura. */
    const riquadro = { getBoundingClientRect: () => ({ top: 100 }), clientTop: 1, clientHeight: 148, style: { paddingBottom: '' } };
    PAGINA.riquadro = riquadro;
    const menu = fondo => ({
        closest: s => (s === '.ev-wrap.ev-larga' ? riquadro : null),
        getBoundingClientRect: () => ({ bottom: fondo })
    });
    DOM.menuEvNelRiquadro(menu(100 + 1 + 148 + 60));
    esigi(riquadro.style.paddingBottom === '68px', 'sporge di 60px: il riquadro si allunga di 68', riquadro.style.paddingBottom);
    DOM.menuEvFuoriDalRiquadro();
    esigi(riquadro.style.paddingBottom === '', 'chiuso il menu, torna com\'era', riquadro.style.paddingBottom);
    riquadro.base = '4px';
    DOM.menuEvNelRiquadro(menu(100 + 1 + 148 + 10.2));
    esigi(riquadro.style.paddingBottom === '23px', 'sopra il margine che il riquadro ha gia\'', riquadro.style.paddingBottom);
    DOM.menuEvFuoriDalRiquadro();
    delete riquadro.base;
    DOM.menuEvNelRiquadro(menu(100 + 1 + 100));
    esigi(riquadro.style.paddingBottom === '', 'un menu che sta dentro non tocca niente');
    // fuori dalla tabella larga il riquadro non taglia: non si fa nulla
    const altrove = { closest: () => null, getBoundingClientRect: () => ({ bottom: 9999 }) };
    let errore = null;
    try { DOM.menuEvNelRiquadro(altrove); DOM.menuEvNelRiquadro(null); } catch (e) { errore = e; }
    esigi(!errore && riquadro.style.paddingBottom === '', 'fuori dalla tabella larga, e senza menu, niente');
});

/* ------------------------------------------------------------
   L'ESPORTAZIONE DI TUTTO L'ELENCO
   ------------------------------------------------------------ */

function elencoMilano() {
    presenze = {}; seq = 0;
    const ospite = riga({ emailConfermata: CONFERMATA, invito: { codice: 'AB3K9', azienda: 'AVAS PHARMACEUTICALS S.R.L.', scheda: 's1' },
        azienda: 'AVAS PHARMACEUTICALS S.R.L.', datiInvito: datiInvito(AVAS),
        extra: { Profilo: 'Impresa', Fatturato: 'Oltre 50 mln', Partecipanti: '1' } });
    const aderente = riga({ emailConfermata: CONFERMATA });
    presenze[aderente.id] = { modalita: 'aderenti', stato: 'confermato', nota: 'tavolo 3', daNome: 'Segreteria', quando: Date.UTC(2026, 9, 1, 8, 0) };
    const online = riga({ emailConfermata: { quando: 0, come: 'pregresso' }, modalita: 'online' });
    const attesa = riga({ invito: { codice: 'ZZ9Q1', azienda: 'BETA SPA', scheda: 's2' }, azienda: 'BETA SPA',
        datiInvito: datiInvito(['2', 'BETA SPA', '01234567890', 'beta@pec.it', '0', '-1769584', '5', '10000', '0',
            '31/12/2025', 'Monza', 'MONZA', 'Monza', 'SERVIZI', '01234567890', 'MB123', '', '']),
        extra: { Interessi: 'ESG, Credito' } });
    const aMano = riga({ inserito: { da: 'a@x.it', daNome: 'Admin', quando: Date.UTC(2026, 9, 2, 8, 0) },
        extra: { Portale: 'Eventbrite', Partecipanti: '3' } });
    const soloB2B = riga({ soloB2B: true, modalita: 'b2b', inserito: { da: 'a@x.it' }, extra: { 'Invito B2B': 'si' } });
    return { lista: [attesa, aMano, online, aderente, ospite, soloB2B], ospite, aderente, online, attesa, aMano, soloB2B };
}

prova('Tutte le sezioni, con la sezione in prima colonna', () => {
    const e = elencoMilano();
    const righe = A.righeCsvIscrizioni(MILANO, e.lista, id => presenze[id] || null);
    const testa = righe[0];
    esigi(testa[0] === 'Sezione', 'la prima colonna e\' "Sezione"', testa[0]);
    esigi(righe.length === 6, 'cinque iscrizioni piu\' l\'intestazione: il solo B2B resta fuori', righe.length);
    const sez = righe.slice(1).map(r => r[0]);
    esigi(sez.join('|') === 'In presenza|In presenza|Aderenti Revilaw|Online|In attesa di conferma mail',
        'nell\'ordine delle voci sopra l\'elenco, l\'attesa per ultima', sez);
    const iEmail = testa.indexOf('Email');
    esigi(!righe.slice(1).some(r => r[iEmail] === e.soloB2B.email), 'nessuna riga dell\'invitato ai soli incontri B2B');
});

prova('Tutte le colonne, anche quelle non scelte', () => {
    const e = elencoMilano();
    archivio.dati = {}; A.azzeraColonne();   // nessuna colonna aggiuntiva spuntata
    const righe = A.righeCsvIscrizioni(MILANO, e.lista, id => presenze[id] || null);
    const testa = righe[0];
    ['Data', 'Nome', 'Cognome', 'Azienda', 'Codice invito', 'Ruolo', 'Email', 'Email confermata', 'Telefono',
        'Portale', 'Partecipanti', 'B2B prenotati', 'Preferenze iscrizione', 'Modalità', 'Stato', 'Nota', 'Aggiornato da']
        .forEach(c => esigi(testa.indexOf(c) >= 0, 'c\'e\' la colonna ' + c));
    ['Profilo', 'Fatturato'].forEach(c => esigi(testa.indexOf(c) >= 0, 'c\'e\' la colonna aggiuntiva ' + c));
    esigi(testa.indexOf('Interessi') < 0, 'gli interessi stanno in "Preferenze iscrizione", non doppi');
    const iFile = testa.indexOf('#');
    esigi(iFile > 0 && testa.slice(iFile, iFile + FILE.length).join('|') === FILE.join('|'),
        'tutte le colonne del file, nell\'ordine del file', testa.slice(iFile));
    esigi(testa.slice(-4).join('|') === 'Modalità|Stato|Nota|Aggiornato da', 'e in fondo quelle di chi organizza', testa.slice(-4));
    esigi(righe.every(r => r.length === testa.length), 'ogni riga ha tutte le colonne');
});

prova('Valori puliti: dai dati, non dalle celle', () => {
    const e = elencoMilano();
    const righe = A.righeCsvIscrizioni(MILANO, e.lista, id => presenze[id] || null);
    const testa = righe[0];
    const di = (r, c) => r[testa.indexOf(c)];
    const perEmail = em => righe.find(r => di(r, 'Email') === em);
    const ospite = perEmail(e.ospite.email), attesa = perEmail(e.attesa.email);
    const aderente = perEmail(e.aderente.email), online = perEmail(e.online.email), aMano = perEmail(e.aMano.email);
    esigi(di(ospite, 'Azienda') === 'AVAS PHARMACEUTICALS S.R.L.', 'la ragione sociale senza il codice attaccato', di(ospite, 'Azienda'));
    esigi(di(ospite, 'Codice invito') === 'AB3K9', 'il codice invito nella sua colonna');
    esigi(/^sì il \d\d\/\d\d\/2026 \d\d:\d\d$/.test(di(ospite, 'Email confermata')), 'confermata: sì e quando', di(ospite, 'Email confermata'));
    esigi(di(online, 'Email confermata') === 'sì (d\'ufficio)', 'il pregresso: sì, d\'ufficio', di(online, 'Email confermata'));
    esigi(di(attesa, 'Email confermata') === 'no', 'in attesa: no');
    esigi(di(attesa, 'Ricavi (EUR)') === '0' && di(attesa, 'Dipendenti') === '0', 'lo zero resta zero',
        [di(attesa, 'Ricavi (EUR)'), di(attesa, 'Dipendenti')]);
    esigi(di(attesa, 'Utile netto (EUR)') === '-1769584', 'gli importi come sono arrivati, senza separatori', di(attesa, 'Utile netto (EUR)'));
    esigi(di(ospite, 'Partita IVA') === '09190500968', 'la partita IVA con lo zero davanti');
    esigi(di(attesa, 'Preferenze iscrizione') === 'ESG, Credito', 'le preferenze dal modulo');
    esigi(di(aMano, 'Portale') === 'Eventbrite' && di(aMano, 'Partecipanti') === '3', 'portale e partecipanti delle righe a mano',
        [di(aMano, 'Portale'), di(aMano, 'Partecipanti')]);
    esigi(di(ospite, 'Portale') === 'Sito NGB', 'dal sito: "Sito NGB", come in tabella');
    esigi(di(aderente, 'Modalità') === 'Aderente' && di(aderente, 'Stato') === 'Confermato' && di(aderente, 'Nota') === 'tavolo 3',
        'modalita\', stato e nota dalle presenze', [di(aderente, 'Modalità'), di(aderente, 'Stato'), di(aderente, 'Nota')]);
    esigi(/^Segreteria, /.test(di(aderente, 'Aggiornato da')), 'e chi ha aggiornato', di(aderente, 'Aggiornato da'));
    esigi(/^Admin, /.test(di(aMano, 'Aggiornato da')), 'per le righe a mano chi le ha inserite', di(aMano, 'Aggiornato da'));
    esigi(di(attesa, 'Modalità') === 'In presenza', 'chi e\' in attesa porta la modalita\' che ha chiesto');
    esigi(di(attesa, 'Revisore o societa di revisione') === '', 'una cella vuota del file resta vuota');
    const tutto = righe.map(r => r.join(';')).join('\n');
    esigi(!/[\u2713\u2714]/.test(tutto), 'nessun segno di spunta, da nessuna parte');
    esigi(tutto.indexOf('email da confermare') < 0 && tutto.indexOf('mail non inviata') < 0, 'e nessuna scritta di servizio');
});

prova('Un\'intestazione del file che si chiama come un\'altra colonna prende " (file)"', () => {
    presenze = {}; seq = 0;
    const r = riga({ emailConfermata: CONFERMATA, extra: { Settore: 'Industria e manifattura' },
        datiInvito: [{ c: 'Email', v: 'info@pec.it' }, { c: 'Settore', v: 'COMMERCIO' }, { c: 'Ricavi (EUR)', v: '10' }] });
    const righe = A.righeCsvIscrizioni(MILANO, [r], () => null);
    const testa = righe[0];
    esigi(testa.indexOf('Email (file)') >= 0 && testa.indexOf('Settore (file)') >= 0, 'Email e Settore del file distinti', testa);
    esigi(testa.filter(c => c === 'Email').length === 1 && testa.filter(c => c === 'Settore').length === 1, 'e nessun nome doppio');
    esigi(righe[1][testa.indexOf('Email (file)')] === 'info@pec.it' && righe[1][testa.indexOf('Email')] === r.email,
        'ognuna con il suo valore');
    esigi(testa.indexOf('Ricavi (EUR)') >= 0, 'le intestazioni senza doppioni restano come sono');
});

prova('Il riepilogo di tutti gli eventi: l\'evento si, la sezione no', () => {
    presenze = {}; seq = 0;
    const a = riga({ pagina: 'Napoli 2 Ottobre 2026 - Manifestazione di interesse' });
    const b = riga({ pagina: 'Milano 26 Febbraio 2027' });
    const righe = A.righeCsvIscrizioni(TUTTI, [a, b], () => null);
    const testa = righe[0];
    esigi(testa[0] === 'Data' && testa.indexOf('Sezione') < 0, 'senza presenze la sezione non si sa: non c\'e\'', testa[0]);
    esigi(testa.indexOf('Evento') >= 0 && testa.indexOf('Modalità') < 0, 'c\'e\' l\'evento, non la modalita\'');
    esigi(righe[1][testa.indexOf('Evento')] === 'Napoli 2 ottobre 2026', 'l\'evento con il suo nome', righe[1][testa.indexOf('Evento')]);
    esigi(righe.length === 3, 'tutte le righe');
});

prova('Il testo del CSV: virgolette, punto e virgola, guardia contro le formule', () => {
    const t = A.testoCsv([['a', 'b"c', null], ['=SOMMA(1;2)', '+39 333', '-1769584'], [0, '@x', '1234.5']]);
    const r = t.split('\r\n');
    esigi(r.length === 3, 'una riga per riga, a capo alla Windows');
    esigi(r[0] === '"a";"b""c";""', 'virgolette raddoppiate, il nulla vuoto', r[0]);
    esigi(r[1] === '"\'=SOMMA(1;2)";"\'+39 333";"\'-1769584"', 'senza opzione: la guardia vale per tutto, come prima', r[1]);
    esigi(r[2] === '"0";"\'@x";"1234.5"', 'lo zero e\' "0"', r[2]);
    const n = A.testoCsv([['=1+1', '-1769584', '-1+1', '-0.5', '+5']], { numeri: true }).split('\r\n')[0];
    esigi(n === '"\'=1+1";"-1769584";"\'-1+1";"-0.5";"=""+5"""', 'con { numeri: true } passano i numeri negativi, e "+5" resta testo senza apice', n);
});

prova('Il CSV: cellulari con il prefisso e codici che Excel leggerebbe come esponenti', () => {
    const n = A.testoCsv([['+39 333 1234567', '+393331234567', '12E45', '1e7', 'AB3K9', '+39 333 x', '12345']], { numeri: true }).split('\r\n')[0];
    esigi(n === '"=""+39 333 1234567""";"=""+393331234567""";"=""12E45""";"=""1e7""";"AB3K9";"\'+39 333 x";"12345"',
        'il cellulare e il codice "12E45" restano testo; il resto come prima', n);
    const senza = A.testoCsv([['+39 333 1234567', '12E45']]).split('\r\n')[0];
    esigi(senza === '"\'+39 333 1234567";"12E45"', 'senza opzione le altre tabelle restano come erano', senza);
});

prova('Il CSV: partita IVA e codice fiscale con lo zero davanti restano testo', () => {
    /* Nel file della Lombardia l'85% delle partite IVA comincia con 0, ed
       Excel le virgolette non le rispetta: "09190500968" diventerebbe
       9190500968. Si scrivono come ="09190500968", che Excel mostra come
       testo, zeri compresi. Solo per chi lo chiede (l'elenco degli iscritti). */
    const n = A.testoCsv([['09190500968', '0', '100674810', '-1769584', '00', '0,5', '0.5', '0123A']], { numeri: true }).split('\r\n')[0];
    esigi(n === '"=""09190500968""";"0";"100674810";"-1769584";"=""00""";"0,5";"0.5";"0123A"',
        'zero davanti: testo per Excel; lo zero, gli importi e i decimali restano numeri', n);
    const senza = A.testoCsv([['09190500968']]).split('\r\n')[0];
    esigi(senza === '"09190500968"', 'senza opzione le altre tabelle restano come erano', senza);
    // e l'esportazione vera lo chiede: la partita IVA del file arriva cosi' nel CSV
    const e = elencoMilano();
    const righe = A.righeCsvIscrizioni(MILANO, e.lista, id => presenze[id] || null);
    const testo = A.testoCsv(righe, { numeri: true });
    esigi(testo.indexOf('"=""09190500968"""') >= 0, 'la partita IVA di AVAS nel file esportato, zero compreso');
    esigi(testo.indexOf('"-1769584"') >= 0, 'e l\'utile negativo resta un numero, senza apice');
});

prova('Chi e\' in attesa: che cosa e\' gia\' partito per fargli arrivare la mail', () => {
    const adesso = new Date(Date.now() - 60 * 1000), ieri = new Date(Date.now() - 26 * 3600 * 1000);
    const dataDi = d => String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear()
        + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':00';
    const appena = riga({ doc: 'n1', data: dataDi(adesso) });
    const mai = riga({ doc: 'n2', data: dataDi(ieri) });
    const fallita = riga({ doc: 'n3', data: dataDi(ieri), mailConferma: { quando: 1, ok: false, errore: '421 timeout' }, invioConferma: { tentativi: 3 } });
    const partita = riga({ doc: 'n4', data: dataDi(ieri), mailConferma: { quando: 1, ok: true },
        smsConferma: { quando: 2, ok: true }, promemoriaConferma: { quando: 3 } });
    A.metti([appena, mai, fallita, partita]);
    esigi(A.hintAttesaMailHtml(MILANO, appena).indexOf('mail non ancora partita') < 0, 'iscritta un minuto fa: niente allarme, la mail sta partendo');
    esigi(A.hintAttesaMailHtml(MILANO, mai).indexOf('mail non ancora partita') >= 0, 'da ieri senza nessun invio: lo dice la riga');
    const tf = A.invioConfermaTesto(fallita);
    esigi(tf.indexOf('NON partita') >= 0 && tf.indexOf('421 timeout') >= 0 && tf.indexOf('Tentativi di invio: 3') >= 0, 'il suggerimento dice l\'errore e i tentativi', tf);
    const tp = A.invioConfermaTesto(partita);
    esigi(tp.indexOf('Mail di conferma partita') >= 0 && tp.indexOf('SMS mandato') >= 0 && tp.indexOf('Promemoria') >= 0, 'e la mail, l\'SMS e il promemoria partiti', tp);
    esigi(A.hintAttesaMailHtml(MILANO, partita).indexOf('mail non ancora partita') < 0, 'una mail partita non fa allarme');
    const smsKo = riga({ doc: 'n5', data: dataDi(ieri), mailConferma: { quando: 1, ok: true },
        smsConferma: { quando: 2, ok: false, errore: 'Brevo 402 not enough credits' } });
    const ts = A.invioConfermaTesto(smsKo);
    esigi(ts.indexOf('SMS NON partito') >= 0 && ts.indexOf('Brevo 402 not enough credits') >= 0, 'un SMS non partito dice anche perche\'', ts);
    esigi(A.hintAttesaMailHtml(NAPOLI, mai) === '', 'a Napoli nessuna attesa, nessun segno');
});

console.log('\nL\'elenco degli iscritti: attesa della conferma, colonne dal file, esportazione\n');
for (const p of prove) {
    console.log('\n' + p.titolo);
    try { p.fn(); } catch (e) { ko++; console.log('  ROSSO  eccezione: ' + (e && e.stack || e)); }
}
console.log('\n' + ok + ' verdi, ' + ko + ' rossi');
process.exit(ko ? 1 : 0);
