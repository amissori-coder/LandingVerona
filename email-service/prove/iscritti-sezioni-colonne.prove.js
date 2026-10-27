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
    rigaDaAppJs('const PREFISSO_COL_BASE ='),
    rigaDaAppJs('const PREFISSO_COL_EXTRA ='),
    rigaDaAppJs('const PREFISSO_COL_CALC ='),
    rigaDaAppJs('const COL_FILE_RICAVI ='),
    rigaDaAppJs('const COL_FILE_PROVINCIA_OP ='),
    rigaDaAppJs('const COL_FILE_COMUNE_OP ='),
    rigaDaAppJs('const COL_FILE_REGIONE_OP ='),
    rigaDaAppJs('const COL_FILE_REVISORE ='),
    rigaDaAppJs('const COL_FILE_DATA_NOMINA ='),
    rigaDaAppJs('const COL_FILE_SETTORE ='),
    rigaDaAppJs('const COL_CALC_REGIONE ='),
    rigaDaAppJs('const COL_CALC_REVISORE ='),
    ritaglia('const COLONNE_DI_BASE = [', '[', ']') + ';',
    rigaDaAppJs('const COLONNE_DI_BASE_TUTTI ='),
    ritaglia('const PROVINCE_REGIONE = {', '{', '}') + ';',
    ritaglia('const REGIONE_DI_PROVINCIA = (', '(', ')') + '();',
    rigaDaAppJs('const CHIAVE_COLONNE_EVENTO ='),
    rigaDaAppJs('const PORTALE_DESK ='),
    rigaDaAppJs('const EVENTI_CON_ADERENTI ='),
    rigaDaAppJs('const PORTALE_CENA ='),
    rigaDaAppJs('const COL_INVITO_B2B ='),
    ritaglia('const TITOLO_CENA = {', '{', '}') + ';',
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
    'chiaveProvincia', 'regioneDaProvincia', 'chiaveNomeColonna', 'nomeColonnaFile', 'colonneCalcolateDi', 'catalogoColonne',
    'colonnaDelCatalogo', 'colonneDiBaseDi', 'valoreColonnaDi', 'chiaviColonneViste', 'spostaColonna', 'nomeIntestazione',
    'colonneDaMostrare', 'fmtDataOra', 'firmaPresenza', 'aggiornatoDaDi', 'nomeEventoDa',
    'righeCsvIscrizioni', 'testoCsv', 'esc', 'dataIscrizioneMs', 'invioConfermaTesto', 'hintAttesaMailHtml',
    // gli iscritti alla cena e al meeting nell'elenco del convegno
    'inSala', 'evHaAderenti', 'aderentiDi', 'indirizziCena', 'allaCena', 'rigaCena', 'righeCena', 'righeElenco', 'firmaCena', 'sezioneElenco', 'hintCenaHtml',
    'rigaDellaCena', 'rigaPerScheda', 'emailAderenti', 'righeDaRiconoscere', 'ospiteDopoConferma', 'confrontoElencoDefinitivo', 'segnatoInvitoB2B', 'daInvitareB2B', 'iscrittiPerInvitoB2B', 'relatoriEAderenti'];
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
    + 'let _aderenti = null, _aderentiEv = \'\', _cenaIndirizzi = { quote: null, set: new Set() };\n'
    + COSTANTI + '\n' + sorgente
    + '\nreturn { ' + NOMI.join(', ') + ', SEZIONI_MODALITA, SEZIONE_ATTESA, EVENTI_DEF, PREFISSO_COL_FILE, CHIAVE_COLONNE_EVENTO, PORTALE_DESK, COLONNE_DI_BASE, COLONNE_DI_BASE_TUTTI, COL_CALC_REGIONE, COL_CALC_REVISORE,'
    + '  EVENTI_CON_ADERENTI, PORTALE_CENA, TITOLO_CENA,'
    + '  azzeraColonne: () => { _evColonne = {}; }, metti: l => { _evIscrizioni = l; },'
    + '  mettiAderenti: (ev, q) => { _aderenti = q; _aderentiEv = ev; } };')(
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
    A.salvaColonneScelte(MILANO, ['b:nome', A.PREFISSO_COL_FILE + 'Settore', 'x:Colonna sparita', A.PREFISSO_COL_FILE + 'Dipendenti']);
    const m = A.colonneDaMostrare(MILANO, [r]);
    esigi(m.length === 3 && m[0].chiave === 'b:nome' && m.slice(1).every(x => x.file), 'scelto il Settore del file, non quello del modulo', m.map(x => x.chiave));
    esigi(m.slice(1).map(x => x.nome).join('|') === 'Settore|Dipendenti', 'nell\'ordine scelto, senza la colonna sparita', m.map(x => x.nome));
    A.salvaColonneScelte(MILANO, ['b:nome', 'x:Settore']);
    const n = A.colonneDaMostrare(MILANO, [r]);
    esigi(n.length === 2 && !n[1].file && n[1].modulo && n[1].gruppo === 'extra', 'e il Settore del modulo e\' del modulo (tinta azzurra)', n);
    esigi(A.valoreColonnaDi(r, n[1]) === 'Industria e manifattura' && A.valoreColonnaDi(r, m[1]) === 'COMMERCIO', 'ognuno con il suo valore');
});

prova('Le colonne di base: quelle richieste, nel loro ordine, e solo se l\'evento le ha', () => {
    archivio.dati = {}; archivio.rotto = false; A.azzeraColonne();
    const conFile = riga({ datiInvito: [{ c: 'Ragione sociale (file)', v: 'ALFA' }, { c: 'Ricavi (EUR)', v: '12500000' }, { c: 'Provincia (sede operativa)', v: 'Milano' },
        { c: 'Comune (sede operativa)', v: 'MILANO' }, { c: 'Revisore o societa di revisione', v: 'Dott. Mario Rossi' }, { c: 'Data nomina revisore', v: '30/06/2026' }] });
    const m = A.colonneDaMostrare(MILANO, [conFile]);
    esigi(m.map(x => x.nome).join('|') === 'Data|Nome|Azienda|Ruolo|Email|Telefono|Preferenze iscrizione|Ricavi (EUR)|Regione (sede operativa)|Comune (sede operativa)|Revisore e data nomina|Modalità',
        'Milano, senza scelte: data, nome, azienda, ruolo, email, telefono, preferenze, ricavi, regione, comune, revisore e data nomina, modalita\'', m.map(x => x.nome));
    esigi(m.every(x => x.col) && m.find(x => x.chiave === 'file:Ricavi (EUR)').col === 'c-extra' && m[0].col === 'c-data', 'ognuna con la sua classe di misura');
    esigi(A.valoreColonnaDi(conFile, m[8]) === 'Lombardia', 'la regione ricavata dalla provincia della sede operativa', A.valoreColonnaDi(conFile, m[8]));
    esigi(A.valoreColonnaDi(conFile, m[10]) === 'Dott. Mario Rossi · 30/06/2026', 'revisore e data nomina in una colonna', A.valoreColonnaDi(conFile, m[10]));
    // con il settore nel file, sta dopo revisore e data nomina e prima della modalita'
    const conSettore = riga({ datiInvito: conFile.datiInvito.concat([{ c: 'Settore di attività', v: 'FABBRICAZIONE DI MACCHINARI' }]) });
    const ms = A.colonneDaMostrare(MILANO, [conSettore]);
    esigi(ms.map(x => x.nome).slice(10).join('|') === 'Revisore e data nomina|Settore di attività|Modalità' && A.valoreColonnaDi(conSettore, ms[11]) === 'FABBRICAZIONE DI MACCHINARI',
        'il settore di attivita\' del file (anche con l\'accento) dopo revisore e data nomina', ms.map(x => x.nome));
    // senza il file (Napoli, o chi si e' iscritto senza codice) restano le colonne della tabella
    const n = A.colonneDaMostrare(NAPOLI, [riga()]);
    esigi(n.map(x => x.nome).join('|') === 'Data|Nome|Azienda|Ruolo|Email|Telefono' + (NAPOLI.manuale ? '|Preferenze iscrizione' : '') + '|Modalità', 'Napoli: senza le colonne del file (e le preferenze solo se l\'evento e\' manuale)', n.map(x => x.nome));
    const senzaPref = A.colonneDaMostrare({ id: 'x-2026', manuale: false }, [riga()]);
    esigi(senzaPref.map(x => x.nome).join('|') === 'Data|Nome|Azienda|Ruolo|Email|Telefono|Modalità', 'un evento non manuale: niente preferenze, niente file', senzaPref.map(x => x.nome));
    const t = A.colonneDaMostrare(TUTTI, [riga()]);
    esigi(t.map(x => x.nome).join('|') === 'Data|Nome|Azienda|Ruolo|Email|Telefono|Evento', 'nel riepilogo di tutti gli eventi, l\'evento al posto della modalita\'', t.map(x => x.nome));
    // il nome della colonna del file si cerca senza badare a maiuscole e accenti
    const accenti = riga({ datiInvito: [{ c: 'RICAVI (eur)', v: '5' }, { c: 'Revisore o società di revisione', v: 'Rev S.r.l.' }, { c: 'Provincia (Sede Operativa)', v: 'BG' }] });
    const a = A.colonneDaMostrare(MILANO, [accenti]);
    esigi(a.map(x => x.nome).join('|') === 'Data|Nome|Azienda|Ruolo|Email|Telefono|Preferenze iscrizione|RICAVI (eur)|Regione (sede operativa)|Revisore e data nomina|Modalità'
        && A.valoreColonnaDi(accenti, a[8]) === 'Lombardia' && A.valoreColonnaDi(accenti, a[9]) === 'Rev S.r.l.',
        'le colonne del file si riconoscono anche scritte diversamente (e la sigla BG e\' Lombardia)', a.map(x => x.nome));
    // la regione la dice il file, se ce l'ha: la calcolata la sostituisce (prende la sua, riempie i vuoti), senza doppioni
    const conRegione = riga({ datiInvito: [{ c: 'Provincia (sede operativa)', v: 'Milano' }, { c: 'Regione (sede operativa)', v: 'Piemonte' }] });
    const vuota = riga({ datiInvito: [{ c: 'Provincia (sede operativa)', v: 'Torino' }, { c: 'Regione (sede operativa)', v: '' }] });
    const cr = A.colonneDaMostrare(MILANO, [conRegione, vuota]);
    esigi(A.valoreColonnaDi(conRegione, cr.find(x => x.chiave === A.COL_CALC_REGIONE)) === 'Piemonte' && A.valoreColonnaDi(vuota, cr.find(x => x.chiave === A.COL_CALC_REGIONE)) === 'Piemonte',
        'con la regione nel file vale quella del file, e il vuoto si riempie dalla provincia');
    const cat = A.catalogoColonne(MILANO, [conRegione]);
    esigi(cat.filter(x => x.nome === 'Regione (sede operativa)').length === 1 && cat.some(x => x.chiave === A.COL_CALC_REGIONE) && !cat.some(x => x.chiave === 'file:Regione (sede operativa)'),
        'nel catalogo la regione c\'e\' una volta sola (la calcolata, al posto di quella nuda del file)', cat.map(x => x.chiave));
    esigi(A.colonnaDelCatalogo(cat, 'file:Regione (sede operativa)') === cat.find(x => x.chiave === A.COL_CALC_REGIONE), 'e una scelta salvata con la colonna nuda del file ritrova la calcolata');
    // il file con la sola regione (senza provincia): resta la sua colonna, e la chiave di base la trova
    const soloRegione = riga({ datiInvito: [{ c: 'Regione (sede operativa)', v: 'Veneto' }] });
    const sr = A.colonneDaMostrare(MILANO, [soloRegione]);
    const catSr = A.catalogoColonne(MILANO, [soloRegione]);
    esigi(!catSr.some(x => x.chiave === A.COL_CALC_REGIONE) && sr.some(x => x.chiave === 'file:Regione (sede operativa)') && A.valoreColonnaDi(soloRegione, sr.find(x => x.chiave === 'file:Regione (sede operativa)')) === 'Veneto',
        'senza la provincia non c\'e\' niente da calcolare: vale la colonna del file, anche fra quelle di base', sr.map(x => x.chiave));
    // una scelta che non lascia nessuna colonna: tornano quelle di base
    A.salvaColonneScelte(MILANO, ['x:Niente']);
    esigi(A.colonneDaMostrare(MILANO, [conFile]).length === 12, 'una scelta che non lascia niente: tornano le colonne di base');
});

prova('Le regioni dalle province: nomi, sigle, varianti', () => {
    const r = A.regioneDaProvincia;
    esigi(r('Milano') === 'Lombardia' && r('MI') === 'Lombardia' && r('mi') === 'Lombardia' && r('Monza e della Brianza') === 'Lombardia' && r('MONZA E BRIANZA') === 'Lombardia' && r('MB') === 'Lombardia',
        'Milano e Monza, per nome e sigla');
    esigi(r('Reggio nell\'Emilia') === 'Emilia-Romagna' && r('Reggio Emilia') === 'Emilia-Romagna' && r('Forlì-Cesena') === 'Emilia-Romagna' && r('Forli Cesena') === 'Emilia-Romagna' && r('FC') === 'Emilia-Romagna', 'le varianti emiliane');
    esigi(r('Reggio Calabria') === 'Calabria' && r('Reggio di Calabria') === 'Calabria' && r('Bolzano') === 'Trentino-Alto Adige' && r('Bozen') === 'Trentino-Alto Adige' && r('Aosta') === 'Valle d\'Aosta' && r('Aoste') === 'Valle d\'Aosta', 'Reggio Calabria, Bolzano, Aosta');
    esigi(r('Massa-Carrara') === 'Toscana' && r('Massa Carrara') === 'Toscana' && r('Pesaro e Urbino') === 'Marche' && r('Barletta-Andria-Trani') === 'Puglia' && r('Verbano-Cusio-Ossola') === 'Piemonte' && r('Sud Sardegna') === 'Sardegna' && r('Olbia-Tempio') === 'Sardegna', 'le province composte e quelle sarde vecchie');
    esigi(r('Provincia di Torino') === 'Piemonte' && r('Città metropolitana di Napoli') === 'Campania' && r('Roma (RM)') === 'Lazio' && r('Milano (MI)') === 'Lombardia', '"Provincia di", "Città metropolitana di", il nome con la sigla');
    esigi(r("Provincia dell'Aquila") === 'Abruzzo' && r("L'AQUILA") === 'Abruzzo' && r('Aquila') === 'Abruzzo' && r('Provincia della Spezia') === 'Liguria' && r('Provincia del Verbano-Cusio-Ossola') === 'Piemonte' && r("Provincia dell'Ogliastra") === 'Sardegna' && r('Prov. di Bergamo') === 'Lombardia', "\"dell'Aquila\", \"della Spezia\", \"del Verbano\", \"dell'Ogliastra\", \"Prov. di\"");
    esigi(r('') === '' && r(null) === '' && r('Atlantide') === '' && r('Lombardia') === '', 'vuoto, sconosciuto o una regione: niente');
    const regioni = {};
    A.EVENTI_DEF.length; // (le costanti ci sono)
    const tutte = ['AG','AL','AN','AO','AP','AQ','AR','AT','AV','BA','BG','BI','BL','BN','BO','BR','BS','BT','BZ','CA','CB','CE','CH','CL','CN','CO','CR','CS','CT','CZ','EN','FC','FE','FG','FI','FM','FR','GE','GO','GR','IM','IS','KR','LC','LE','LI','LO','LT','LU','MB','MC','ME','MI','MN','MO','MS','MT','NA','NO','NU','OR','PA','PC','PD','PE','PG','PI','PN','PO','PR','PT','PU','PV','PZ','RA','RC','RE','RG','RI','RM','RN','RO','SA','SI','SO','SP','SR','SS','SU','SV','TA','TE','TN','TO','TP','TR','TS','TV','UD','VA','VB','VC','VE','VI','VR','VT','VV'];
    const senza = tutte.filter(sg => !r(sg));
    tutte.forEach(sg => { regioni[r(sg)] = true; });
    esigi(senza.length === 0 && Object.keys(regioni).length === 20, 'tutte le 107 sigle hanno una regione, e le regioni sono venti', senza.join(',') + ' / ' + Object.keys(regioni).length);
});

prova('Il CSV porta la regione come la tabella', () => {
    const r1 = riga({ doc: 'c1', datiInvito: [{ c: 'Provincia (sede operativa)', v: 'Milano' }, { c: 'Regione (sede operativa)', v: '' }] });
    const r2 = riga({ doc: 'c2', datiInvito: [{ c: 'Provincia (sede operativa)', v: 'Torino' }, { c: 'Regione (sede operativa)', v: 'Piemonte' }] });
    A.metti([r1, r2]);
    const righe = A.righeCsvIscrizioni(MILANO, [r1, r2], () => null);
    const testa = righe[0];
    esigi(testa.filter(x => x === 'Regione (sede operativa)').length === 1, 'la regione nel CSV c\'e\' una volta sola', testa);
    const i = testa.indexOf('Regione (sede operativa)');
    esigi(righe[1][i] === 'Lombardia' && righe[2][i] === 'Piemonte', 'il vuoto del file si riempie dalla provincia, come in tabella', [righe[1][i], righe[2][i]]);
    const r3 = riga({ doc: 'c3', datiInvito: [{ c: 'Provincia (sede operativa)', v: 'BG' }] });
    A.metti([r3]);
    const righe3 = A.righeCsvIscrizioni(MILANO, [r3], () => null);
    esigi(righe3[0].indexOf('Regione (sede operativa)') >= 0 && righe3[1][righe3[0].indexOf('Regione (sede operativa)')] === 'Lombardia', 'senza la colonna nel file, la regione ricavata si aggiunge');
});

prova('Il nome di un\'intestazione, senza i comandi dentro', () => {
    const th = (classi, nome, resto) => ({ classList: { contains: c => classi.indexOf(c) >= 0 }, querySelector: sel => sel === '.ev-th-nome' && nome !== null ? { textContent: nome } : null, textContent: (nome || '') + (resto || '') });
    esigi(A.nomeIntestazione(th([], 'Nome', '‹×›')) === 'Nome', 'con le frecce e la x dentro resta "Nome"');
    esigi(A.nomeIntestazione(th(['ev-th-piu'], null, '+')) === '', 'il "+" non e\' una colonna');
    esigi(A.nomeIntestazione(th([], null, ' Stato ')) === 'Stato' && A.nomeIntestazione(th([], null, '')) === '' && A.nomeIntestazione(null) === '', 'le intestazioni semplici come prima, e la colonna d\'azione vuota');
});

prova('Spostare una colonna di un posto, e togliere', () => {
    const c = ['b:data', 'b:nome', 'b:azienda'];
    esigi(A.spostaColonna(c, 'b:nome', -1).join('|') === 'b:nome|b:data|b:azienda', 'a sinistra');
    esigi(A.spostaColonna(c, 'b:nome', 1).join('|') === 'b:data|b:azienda|b:nome', 'a destra');
    esigi(A.spostaColonna(c, 'b:data', -1) === null && A.spostaColonna(c, 'b:azienda', 1) === null && A.spostaColonna(c, 'b:x', 1) === null, 'ai bordi, o una colonna che non c\'e\': non si muove');
    esigi(c.join('|') === 'b:data|b:nome|b:azienda', 'e l\'elenco di partenza non si tocca');
    archivio.dati = {}; archivio.rotto = false; A.azzeraColonne();
    const r = riga({ datiInvito: [{ c: 'Ricavi (EUR)', v: '1' }] });
    const viste = A.chiaviColonneViste(MILANO, [r]);
    esigi(viste[0] === 'b:data' && viste.indexOf('file:Ricavi (EUR)') > 0, 'le chiavi di quello che si vede, risolte sul catalogo');
});

prova('La scelta delle colonne resta fra una sessione e l\'altra', () => {
    archivio.dati = {}; archivio.rotto = false; A.azzeraColonne();
    A.salvaColonneScelte(MILANO, ['b:nome', 'x:Profilo', A.PREFISSO_COL_FILE + 'PEC']);
    esigi(archivio.dati[A.CHIAVE_COLONNE_EVENTO + MILANO.id] === JSON.stringify({ v: 2, chiavi: ['b:nome', 'x:Profilo', 'file:PEC'] }),
        'scritta nello spazio del browser, per evento, con il numero di versione', archivio.dati);
    A.azzeraColonne();   // una pagina nuova: la memoria si e' svuotata
    esigi(A.colonneScelteDi(MILANO).join('|') === 'b:nome|x:Profilo|file:PEC', 'e riletta alla prima occhiata');
    esigi(A.colonneScelteDi(NAPOLI).length === 0, 'un altro evento ha la sua (vuota)');
    archivio.dati[A.CHIAVE_COLONNE_EVENTO + 'roma-2026-04-29'] = '{non e\' json';
    esigi(A.colonneScelteDi({ id: 'roma-2026-04-29' }).length === 0, 'un valore rovinato vale "nessuna"');
    /* una scelta NUOVA senza colonne di base (tolte tutte dal pannello) resta com'e', anche di sole colonne del file */
    archivio.dati[A.CHIAVE_COLONNE_EVENTO + NAPOLI.id] = JSON.stringify({ v: 2, chiavi: ['file:Ricavi (EUR)', 'd:regione', 'x:Profilo'] });
    A.azzeraColonne();
    esigi(A.colonneScelteDi(NAPOLI).join('|') === 'file:Ricavi (EUR)|d:regione|x:Profilo', 'una scelta nuova senza colonne di base si rilegge com\'e\'', A.colonneScelteDi(NAPOLI));
    archivio.dati[A.CHIAVE_COLONNE_EVENTO + NAPOLI.id] = JSON.stringify({ v: 2, chiavi: ['file:Ricavi (EUR)', 'file:Comune (sede operativa)'] });
    A.azzeraColonne();
    esigi(A.colonneScelteDi(NAPOLI).join('|') === 'file:Ricavi (EUR)|file:Comune (sede operativa)', 'anche di sole colonne del file (che la versione di prima scriveva uguali: le distingue la forma, non il contenuto)');
    archivio.dati[A.CHIAVE_COLONNE_EVENTO + NAPOLI.id] = JSON.stringify({ v: 2, chiavi: [] });
    A.azzeraColonne();
    esigi(A.colonneScelteDi(NAPOLI).length === 0, '"Colonne di base" salva una scelta vuota, che vale le colonne di base');
    /* una scelta della versione di prima (un elenco nudo: nomi di extra e "file:"):
       le colonne di base davanti, le sue in coda */
    archivio.dati[A.CHIAVE_COLONNE_EVENTO + NAPOLI.id] = JSON.stringify(['Profilo', 'file:PEC']);
    A.azzeraColonne();
    esigi(A.colonneScelteDi(NAPOLI).join('|') === A.COLONNE_DI_BASE.join('|') + '|x:Profilo|file:PEC', 'una scelta vecchia si legge ancora: base davanti, le sue in coda', A.colonneScelteDi(NAPOLI));
    archivio.dati[A.CHIAVE_COLONNE_EVENTO + NAPOLI.id] = JSON.stringify(['file:PEC']);
    A.azzeraColonne();
    esigi(A.colonneScelteDi(NAPOLI).join('|') === A.COLONNE_DI_BASE.join('|') + '|file:PEC', 'anche una vecchia di sole colonne del file');
    archivio.rotto = true; A.azzeraColonne();
    let errore = null;
    try { A.salvaColonneScelte(MILANO, ['b:nome', 'x:Profilo']); } catch (e) { errore = e; }
    esigi(!errore && A.colonneScelteDi(MILANO).join('|') === 'b:nome|x:Profilo', 'senza spazio (finestra anonima) si lavora lo stesso');
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

prova('La tabella larga appena c\'e\' una colonna oltre quelle di base', () => {
    /* Con una sola colonna in piu', a 1440px nome, azienda e nota
       scendevano a una trentina di pixel: la tabella larga scatta subito. */
    esigi(/const larga = colonne\.some\(c => c\.gruppo !== 'base'\) \|\| colonne\.length > 11;/.test(APP), 'in tabellaIscrizioni: una colonna aggiuntiva, o piu\' di undici');
    esigi(APP.indexOf('COLONNE_PRIMA_DI_SCORRERE') < 0, 'e la vecchia soglia di quattro non c\'e\' piu\'');
    /* il "+" sta in cima all'ultima colonna, appiccicata a destra; il vecchio pannello sopra la tabella non c'e' piu' */
    esigi(/<th class="ev-th-piu"><button type="button" class="ev-piu"/.test(APP) && APP.indexOf('sceltaColonneHtml') < 0 && APP.indexOf("<details class=\"ev-colonne\"' + (_evColonneAperte") < 0, 'il "+" in cima alla colonna delle azioni, e niente pannello sopra la tabella');
    esigi(/class="ev-th-sposta ev-th-sx"/.test(APP) && /class="ev-th-sposta ev-th-dx"/.test(APP) && /class="ev-th-togli"/.test(APP), 'le frecce e la x sulle intestazioni');
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

prova('La barra orizzontale che segue: sotto la tabella, agganciata dopo il disegno, nascosta in stampa', () => {
    const tab = APP.slice(APP.indexOf('function tabellaIscrizioni('), APP.indexOf('function agganciaScorriX('));
    esigi(/<\/tbody><\/table><\/div>'\s*\n[\s\S]*?\+ '<div class="ev-scorri-x" aria-hidden="true"><div class="ev-scorri-x-dentro"><\/div><\/div>';/.test(tab), 'la barra sta subito dopo il riquadro della tabella');
    const agg = APP.slice(APP.indexOf('function agganciaScorriX('), APP.indexOf('function agganciaScorriX(') + 3000);
    esigi(/barra\.addEventListener\('scroll', daBarra\)/.test(agg) && /wrap\.addEventListener\('scroll', daRiquadro\)/.test(agg), 'legata al riquadro nei due sensi');
    esigi(/window\.addEventListener\('scroll', misura/.test(agg) && /_evScorriXStacca = \(\) =>/.test(agg) && /if \(_evScorriXStacca\) \{ _evScorriXStacca\(\); _evScorriXStacca = null; \}/.test(agg), 'gli ascolti sulla finestra si staccano al disegno dopo');
    esigi(/getBoundingClientRect\(\)\.bottom <= window\.innerHeight/.test(agg) && /serve && !fondoInVista/.test(agg), 'si vede solo se c\'e\' da scorrere e il fondo del riquadro non e\' in vista');
    const dopo = APP.slice(APP.indexOf("$vista().querySelectorAll('.ev-modalita, .ev-stato').forEach(conMouse);"), APP.indexOf("$vista().querySelectorAll('.ev-modalita, .ev-stato').forEach(conMouse);") + 120);
    esigi(/agganciaScorriX\(\);/.test(dopo), 'e si aggancia dopo ogni disegno dell\'elenco');
    const CSS = fs.readFileSync(path.join(__dirname, '..', '..', 'area-riservata', 'styles.css'), 'utf8');
    esigi(/\.ev-scorri-x \{ display: none; position: sticky; bottom: 0;/.test(CSS) && /\.ev-scorri-x\.visibile \{ display: block; \}/.test(CSS) && /@media print \{ \.ev-scorri-x \{ display: none !important; \} \}/.test(CSS), 'appiccicata in fondo alla finestra, nascosta se non serve e in stampa');
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
    /* l'SMS passa dalla whitelist VERA del servizio (api/iscrizioni.js), come
       arriva all'area riservata: una riga fatta a mano qui non lo direbbe */
    const API = fs.readFileSync(path.join(__dirname, '..', 'api', 'iscrizioni.js'), 'utf8');
    const da = API.indexOf('smsConferma: (v.smsConferma');
    const proiettaSms = new Function('v', 'return ' + API.slice(da + 'smsConferma: '.length, API.indexOf('} : null,', da) + '} : null'.length) + ';');
    const smsKo = riga({ doc: 'n5', data: dataDi(ieri), mailConferma: { quando: 1, ok: true },
        smsConferma: proiettaSms({ smsConferma: { quando: 2, ok: false, tipo: 'inviata', id: null, errore: 'Brevo 402 not enough credits' } }) });
    const ts = A.invioConfermaTesto(smsKo);
    esigi(ts.indexOf('SMS NON partito') >= 0 && ts.indexOf('Brevo 402 not enough credits') >= 0, 'un SMS non partito dice anche perche\'', ts);
    const smsOk = riga({ doc: 'n6', data: dataDi(ieri), mailConferma: { quando: 1, ok: true },
        smsConferma: proiettaSms({ smsConferma: { quando: 2, ok: true, tipo: 'inviata', id: 'abc123', errore: '' } }) });
    const to = A.invioConfermaTesto(smsOk);
    esigi(to.indexOf('SMS mandato') >= 0 && to.indexOf('(Brevo abc123)') >= 0, 'e uno partito il suo riferimento nei log di Brevo', to);
    esigi(A.hintAttesaMailHtml(NAPOLI, mai) === '', 'a Napoli nessuna attesa, nessun segno');
    /* "email da confermare" con i solleciti sta sotto il nome dell'azienda, non nella cella della modalita' */
    const tab = APP.slice(APP.indexOf('function tabellaIscrizioni('), APP.indexOf('function agganciaScorriX('));
    esigi(/const attesa = hintAttesaMailHtml\(ev, r\);/.test(tab) && /const hintM = hintModalitaHtml\(ev, r, md\) \|\| '';/.test(tab), 'l\'attesa e il suggerimento della modalita\' sono due cose');
    const email = tab.slice(tab.indexOf("celle['b:email']"), tab.indexOf("celle['b:telefono']"));
    esigi(/emailInterrompibile\(r\.email\) \+ esitoMailDi\(r\) \+ attesa \+ '<\/td>'/.test(email), 'e l\'attesa sta nella cella dell\'email, sotto l\'indirizzo');
    const azienda = tab.slice(tab.indexOf("celle['b:azienda']"), tab.indexOf("celle['b:ruolo']"));
    esigi(azienda.indexOf('attesa') < 0, 'e non in quella dell\'azienda');
    const modalita = tab.slice(tab.indexOf('const cellaModalita = segna'), tab.indexOf("celle['b:data']"));
    esigi(modalita.indexOf('hintAttesaMailHtml') < 0 && modalita.indexOf('attesa') < 0, 'e non piu\' in quella della modalita\'');
    /* i solleciti sulla riga, a vista: ogni invio tentato con data e ora, in rosso quello che non e' andato */
    const h = x => A.hintAttesaMailHtml(MILANO, riga(Object.assign({ doc: 'n7', data: dataDi(ieri), mailConferma: { quando: 1, ok: true } }, x)));
    const q = new Date(2026, 9, 26, 15, 51).getTime();
    let s = h({ sollecitoConferma: { quando: q, ok: true } });
    esigi(s.indexOf('sollecito 26/10/2026 15:51') >= 0 && s.indexOf('ev-solleciti-no') < 0, 'la lettera partita: data e ora, in grigio', s);
    s = h({ sollecitoConferma: { quando: q, ok: false, definitivo: true, errore: '550 5.1.1' } });
    esigi(s.indexOf('sollecito NON partito 26/10/2026 15:51 (rifiutato)') >= 0 && s.indexOf('ev-solleciti-no') >= 0, 'la lettera rifiutata: NON partito, in rosso', s);
    s = h({ sollecitoConferma: { quando: q, ok: false, errore: '451' } });
    esigi(s.indexOf('sollecito NON partito 26/10/2026 15:51 (si riprova)') >= 0, 'il no temporaneo: si riprova', s);
    s = h({ sollecitoConferma: { quando: q, ok: false, canale: true, errore: 'ECONNREFUSED' } });
    esigi(s.indexOf('sollecito 26/10/2026 15:51 (ferma per un guasto, si riprova)') >= 0 && s.indexOf('ev-solleciti-no') < 0, 'il guasto del canale non e\' un no', s);
    s = h({ sollecitoConferma: { quando: q, ok: true }, pecSollecito: { quando: q + 86400000, ok: true, a: 'x@pec.it', consegnata: { quando: q + 86400000 + 60000 }, risposta: { quando: q + 90000000, da: 'x@pec.it' } } });
    esigi(s.indexOf('sollecito 26/10/2026 15:51') >= 0 && s.indexOf('PEC 27/10/2026 15:51, consegnata (ha risposto)') >= 0, 'la PEC mandata: data e ora, consegna e risposta', s);
    s = h({ sollecitoConferma: { quando: q, ok: true }, pecSollecito: { quando: q + 86400000, ok: true, a: 'x@pec.it', problema: { quando: q + 86400000 + 60000, motivo: 'casella piena' } } });
    esigi(s.indexOf('PEC 27/10/2026 15:51, NON consegnata') >= 0, 'la PEC non consegnata lo dice', s);
    s = h({ sollecitoConferma: { quando: q, ok: true }, pecSollecito: { quando: q + 86400000, ok: false, esclusa: true, errore: 'l\'azienda invitata non ha un indirizzo PEC' } });
    esigi(s.indexOf('PEC non mandata: nessun indirizzo PEC') >= 0 && s.indexOf('ev-solleciti-no') >= 0, 'la PEC che non si puo\' mandare: in rosso, con il perche\'', s);
    s = h({ sollecitoConferma: { quando: q, ok: true }, pecSollecito: { quando: q + 86400000, ok: false, esclusa: true, errore: 'nessuna azienda invitata collegata all\'iscrizione' } });
    esigi(s.indexOf('PEC non mandata: nessuna azienda collegata') >= 0, 'senza azienda collegata lo dice', s);
    s = h({ sollecitoConferma: { quando: q, ok: true }, pecSollecito: { quando: q + 86400000, ok: false, incerto: true, errore: 'timeout' } });
    esigi(s.indexOf('PEC 27/10/2026 15:51 (esito incerto)') >= 0, 'la PEC dall\'esito incerto', s);
    s = h({ sollecitoConferma: { quando: q, ok: true }, pecSollecito: { quando: q + 86400000, ok: false, definitivo: true, errore: '550' } });
    esigi(s.indexOf('PEC NON partita 27/10/2026 15:51 (rifiutato)') >= 0, 'la PEC rifiutata dal gestore', s);
});

/* ------------------------------------------------------------
   GLI ISCRITTI ALLA CENA E AL MEETING FRA GLI ADERENTI REVILAW
   ------------------------------------------------------------ */

prova('Chi e\' iscritto alla cena e al meeting sta fra gli aderenti Revilaw', () => {
    const e = elencoMilano();
    const quando = Date.UTC(2026, 9, 20, 8, 0);
    /* la risposta del servizio (api/presenze.js, sezione "aderenti"): una quota
       con le sue righe (lib/iscrizioni-aderenti.js, rigaElenco) */
    A.mettiAderenti('milano-2027-02-26', [{ quota: { id: 'milano-2027-aderenti' }, conti: { iscritti: 3 }, righe: [
        { id: 'milano-2027-aderenti~mario', email: 'MARIO@studio.it ', nome: 'Mario', cognome: 'Rossi', studio: 'Studio Rossi', telefono: '333 1', citta: 'Verona', note: 'celiaco', quando: quando, primaVolta: quando - 3600000 },
        // l'ospite del convegno e' anche alla cena: resta con la sua riga, fra gli aderenti
        { id: 'milano-2027-aderenti~ospite', email: e.ospite.email.toUpperCase(), nome: 'X', cognome: 'Y', studio: 'Z', quando: quando, primaVolta: quando },
        // chi aspetta la conferma resta nell'attesa; chi e' online resta online
        { id: 'milano-2027-aderenti~attesa', email: e.attesa.email, nome: 'A', cognome: 'B', studio: 'C', quando: quando, primaVolta: quando },
        { id: 'milano-2027-aderenti~online', email: e.online.email, nome: 'D', cognome: 'E', studio: 'F', quando: quando, primaVolta: quando }
    ] }]);
    A.metti(e.lista);
    const el = A.righeElenco(MILANO, e.lista);
    esigi(el.length === 6, 'l\'elenco: le cinque iscrizioni del convegno (il solo B2B fuori) piu\' la riga della cena di chi al convegno non c\'e\'', el.length);
    const cena = el.find(r => r.soloCena);
    esigi(cena && cena.id === 'cena~milano-2027-aderenti~mario' && cena.modalita === 'aderenti' && cena.doc === '', 'la riga della cena: aderente, senza documento del convegno', JSON.stringify(cena));
    esigi(cena && cena.nome === 'Mario' && cena.cognome === 'Rossi' && cena.azienda === 'Studio Rossi' && cena.email === 'MARIO@studio.it ' && cena.telefono === '333 1',
        'con i dati della scheda della cena: lo studio fa da azienda', JSON.stringify(cena));
    esigi(cena && cena.extra.Portale === A.PORTALE_CENA && cena.extra.Partecipanti === '1' && cena.extra['Citt\u00e0'] === 'Verona' && cena.extra['Note cena'] === 'celiaco',
        'e "Cena e meeting" nella colonna Portale, una persona, citta\' e note fra le aggiuntive', JSON.stringify(cena && cena.extra));
    esigi(cena && cena.data === A.fmtDataOra(quando - 3600000), 'la data e\' quella della prima iscrizione alla cena, nella forma delle altre righe', cena && cena.data);
    esigi(el.filter(r => r.soloCena).length === 1, 'chi ha gia\' una riga del convegno (ospite, attesa, online) non ne ha una seconda');
    // la sezione in cui si mostra, e quella in cui si conta
    esigi(A.sezioneElenco(MILANO, cena, e.lista) === 'aderenti', 'la riga della cena si mostra fra gli aderenti');
    esigi(A.sezioneVista(MILANO, e.ospite, e.lista) === 'presenza' && A.sezioneElenco(MILANO, e.ospite, e.lista) === 'aderenti',
        'l\'ospite che e\' anche alla cena si conta in presenza ma si mostra fra gli aderenti');
    esigi(A.sezioneElenco(MILANO, e.attesa, e.lista) === 'attesa', 'chi aspetta la conferma resta nell\'attesa anche se e\' alla cena');
    esigi(A.sezioneElenco(MILANO, e.online, e.lista) === 'online', 'chi segue online resta online anche se e\' alla cena');
    esigi(A.sezioneElenco(MILANO, e.aMano, e.lista) === 'presenza' && A.sezioneElenco(MILANO, e.aderente, e.lista) === 'aderenti', 'gli altri stanno dove stavano');
    esigi(A.allaCena(MILANO, e.ospite) === true && A.allaCena(MILANO, e.aMano) === false && A.allaCena(MILANO, cena) === true, 'allaCena: per indirizzo, senza badare a maiuscole e spazi');
    // la scritta sotto la modalita'
    const hC = A.hintCenaHtml(MILANO, cena), hO = A.hintCenaHtml(MILANO, e.ospite);
    esigi(/ev-cena/.test(hC) && />cena e meeting</.test(hC) && hC.indexOf(A.esc(A.TITOLO_CENA.solo)) >= 0, 'sulla riga della cena: "cena e meeting", e il suggerimento dice che si legge soltanto', hC);
    esigi(/ev-cena/.test(hO) && />anche cena e meeting</.test(hO) && hO.indexOf(A.esc(A.TITOLO_CENA.anche)) >= 0, 'sulla riga del convegno: "anche cena e meeting"', hO);
    esigi(A.hintCenaHtml(MILANO, e.aMano) === '', 'e niente per chi alla cena non c\'e\'');
    // la firma con cui l'elenco si disegna: cambia quando cambiano le righe della cena
    esigi(JSON.parse(A.firmaCena(MILANO))[0].join('|') === [e.ospite.id, e.online.id, e.attesa.id].sort().join('|') && JSON.parse(A.firmaCena(MILANO))[1].length === 4,
        'la firma: le righe del convegno che sono la persona della cena, e i dati delle schede della cena', A.firmaCena(MILANO));
    // il CSV: la sezione in cui si mostra, e niente conferma dell'email per la cena
    const righe = A.righeCsvIscrizioni(MILANO, el, id => presenze[id] || null);
    const testa = righe[0];
    const iEmail = testa.indexOf('Email'), iConf = testa.indexOf('Email confermata'), iPort = testa.indexOf('Portale'), iMod = testa.indexOf('Modalit\u00e0');
    const rCena = righe.find(r => r[iEmail] === 'MARIO@studio.it ');
    esigi(righe.length === 7 && rCena && rCena[0] === 'Aderenti Revilaw' && rCena[iConf] === '' && rCena[iPort] === A.PORTALE_CENA && rCena[iMod] === 'Aderente',
        'nel CSV la riga della cena sta fra gli aderenti, con il suo Portale e senza "email confermata"', JSON.stringify(rCena));
    const rOspite = righe.find(r => r[iEmail] === e.ospite.email);
    esigi(rOspite && rOspite[0] === 'Aderenti Revilaw' && rOspite[iConf].indexOf('s\u00ec') === 0 && rOspite[iMod] === 'In presenza',
        'l\'ospite alla cena: sezione Aderenti Revilaw, modalita\' In presenza, email confermata', JSON.stringify(rOspite));
    esigi(testa.indexOf('Citt\u00e0') >= 0 && testa.indexOf('Note cena') >= 0, 'citta\' e note della cena fra le colonne aggiuntive del CSV', testa.join('|'));
    // senza le iscrizioni degli aderenti (non ancora lette) l'elenco e' quello di sempre
    A.mettiAderenti('', null);
    esigi(A.righeElenco(MILANO, e.lista).length === 5 && A.sezioneElenco(MILANO, e.ospite, e.lista) === 'presenza' && A.firmaCena(MILANO) === '[[],[]]',
        'finche\' le iscrizioni alla cena non sono lette, niente righe in piu\' e nessuno si sposta');
    // a Napoli non ci sono aderenti: niente di tutto questo
    A.mettiAderenti('napoli-2026-10-02', [{ quota: {}, conti: {}, righe: [{ id: 'x', email: e.ospite.email }] }]);
    esigi(A.righeElenco(NAPOLI, e.lista).length === 5 && A.allaCena(NAPOLI, e.ospite) === false, 'a Napoli l\'elenco resta quello del convegno');
    A.mettiAderenti('', null);
    A.metti(null);
});

/* La cena con le righe di elencoMilano: chi ci si iscrive, per indirizzo. */
function conCena(e, indirizzi, extra) {
    A.mettiAderenti('milano-2027-02-26', [{ quota: { id: 'milano-2027-aderenti' }, conti: { iscritti: indirizzi.length }, righe: indirizzi.map((m, i) => Object.assign({
        id: 'milano-2027-aderenti~' + i, email: m, nome: 'N' + i, cognome: 'C' + i, studio: 'S' + i, quando: Date.UTC(2026, 9, 1 + i, 8, 0), primaVolta: Date.UTC(2026, 9, 1 + i, 8, 0)
    }, (extra || {})[m] || {})) }]);
    A.metti(e.lista);
}

prova('La firma con cui l\'elenco si ridisegna cambia quando la cena cambia davvero', () => {
    const e = elencoMilano();
    conCena(e, ['solo@cena.it']);
    const prima = A.firmaCena(MILANO);
    esigi(A.firmaCena(MILANO) === prima, 'due letture uguali, la stessa firma');
    conCena(e, ['solo@cena.it', e.ospite.email]);
    esigi(A.firmaCena(MILANO) !== prima, 'un iscritto al convegno si iscrive anche alla cena: la firma cambia (la sua riga va fra gli aderenti)');
    const conOspite = A.firmaCena(MILANO);
    conCena(e, ['solo@cena.it', e.ospite.email], { 'solo@cena.it': { nome: 'Corretto' } });
    esigi(A.firmaCena(MILANO) !== conOspite, 'un dato corretto in una scheda della cena: la firma cambia (la riga in sola lettura va rifatta)');
    // senza date la riga della cena prende "adesso": la firma non deve cambiare da sola
    conCena(e, ['senza@data.it'], { 'senza@data.it': { quando: 0, primaVolta: 0 } });
    const f1 = A.firmaCena(MILANO);
    esigi(A.firmaCena(MILANO) === f1, 'una scheda senza data non fa cambiare la firma da sola');
    A.mettiAderenti('', null); A.metti(null);
});

prova('Fra gli aderenti si sposta solo la persona della cena, e per una persona sola', () => {
    const e = elencoMilano();
    // un ordine con piu' posti: l'intestatario e un compagno con lo stesso indirizzo
    /* come li manda il servizio: l'id e' indirizzo|data, e il posto ~p2 prende la
       data dell'intestatario - con lo stesso indirizzo, lo stesso id */
    const ID = 'seg@studio.it|12/01/2027 09:00:00';
    const capo = riga({ id: ID, doc: 'ord|1', data: '12/01/2027 09:00:00', emailConfermata: CONFERMATA, email: 'seg@studio.it' });
    const comp = riga({ id: ID, doc: 'ord|1~p2', gruppo: 'ord|1', data: '12/01/2027 09:00:00', emailConfermata: CONFERMATA, email: 'seg@studio.it' });
    e.lista.push(comp, capo);
    conCena(e, [e.aMano.email, e.online.email, e.attesa.email, 'seg@studio.it', e.ospite.email]);
    // la riga da Eventbrite per tre: l'intestatario e' alla cena, gli altri due no
    esigi(A.sezioneElenco(MILANO, e.aMano, e.lista) === 'presenza', 'una riga per tre persone resta in presenza');
    esigi(A.hintCenaHtml(MILANO, e.aMano).indexOf(A.esc(A.TITOLO_CENA.gruppo)) >= 0, 'con la scritta e il suggerimento che dicono perche\'');
    // l'ordine: si sposta l'intestatario, il compagno con lo stesso indirizzo e' un'altra persona
    esigi(A.sezioneElenco(MILANO, capo, e.lista) === 'aderenti' && A.sezioneElenco(MILANO, comp, e.lista) === 'presenza', 'nell\'ordine si sposta l\'intestatario, non il compagno');
    esigi(A.hintCenaHtml(MILANO, comp) === '' && /anche cena e meeting/.test(A.hintCenaHtml(MILANO, capo)), 'e la scritta la porta solo lui');
    // anche quando la riga arriva come copia (stesso documento): e' lei
    esigi(A.rigaDellaCena(MILANO, Object.assign({}, capo), e.lista) === true && A.rigaDellaCena(MILANO, Object.assign({}, comp), e.lista) === false, 'si riconosce la scheda dal documento, non dall\'identificativo');
    // i comandi della tabella ritrovano la scheda dal documento: dalla riga del compagno, il compagno
    esigi(A.rigaPerScheda(ID, 'ord|1~p2') === comp && A.rigaPerScheda(ID, 'ord|1') === capo && A.rigaPerScheda(ID, '') === comp,
        'rigaPerScheda: la scheda del comando, non la prima con quell\'identificativo (senza documento, la prima)');
    // elenco definitivo: il compagno condivide la presenza con l'intestatario della cena, e non si propone
    const c5 = A.confrontoElencoDefinitivo(MILANO, e.lista, [e.ospite.email]);
    esigi(!c5.fuori.some(x => x.riga === comp) && !c5.fuori.some(x => x.riga === capo), 'elenco definitivo: spostare il compagno sposterebbe l\'aderente (stessa presenza): non si propone');
    esigi(c5.legati.length === 1 && c5.legati[0].riga === comp, 'ma si dice a parte: e\' un ospite in sala che nell\'elenco non c\'e\'', JSON.stringify(c5.legati.map(x => x.email)));
    // con la presenza condivisa fra sponsor e relatori il compagno non e' un ospite: il suo indirizzo non e' "trovato"
    presenze[ID] = { modalita: 'sponsor' };
    const c7 = A.confrontoElencoDefinitivo(MILANO, e.lista, ['seg@studio.it']);
    esigi(c7.mancanti.some(x => x.email === 'seg@studio.it' && x.dove) && c7.legati.length === 0, 'se la presenza condivisa non e\' in presenza, l\'indirizzo incollato non si trova fra gli ospiti, e si dice dove sta', JSON.stringify(c7.mancanti));
    delete presenze[ID];
    const FIN = APP.slice(APP.indexOf('function modaleConfrontoElenco('), APP.indexOf('function modaleConfrontoElenco(') + 12000);
    esigi(/const legati = esito\.legati \|\| \[\];/.test(FIN) && /\(nlSala \? '' : '<p class="hint">Tutti gli ospiti in sala sono nell[^\n]*\n\s*\+ bloccoLegati/.test(FIN)
        && /\(nlSala \? '' : '<p class="hint" style="margin:0 0 8px;">Tutti gli ospiti in sala/.test(FIN)
        && /const nlSala = legati\.filter\(t => t\.sezione !== SEZIONE_ATTESA\.id\)\.length;/.test(FIN),
        'la finestra lo dice, e non scrive che tutti gli ospiti in sala sono nell\'elenco (chi aspetta la conferma non e\' "in sala")');
    const c6 = A.confrontoElencoDefinitivo(MILANO, e.lista, ['seg@studio.it']);
    esigi(c6.mancanti.every(x => x.email !== 'seg@studio.it'), 'e se il suo indirizzo e\' nell\'elenco incollato, risulta trovato');
    const ME = APP.slice(APP.indexOf('function cellaAzioniHtml('), APP.indexOf('function cellaAzioniHtml(') + 20000);
    esigi(/class="ev-menu-voce ev-b2bi" data-id="' \+ esc\(r\.id\) \+ '" data-doc="' \+ esc\(r\.doc \|\| ''\)/.test(ME)
        && /querySelectorAll\('\.ev-b2bi'\)[\s\S]{0,200}rigaPerScheda\(b\.dataset\.id, b\.dataset\.doc\)/.test(APP),
        'la voce B2B del menu porta il documento, e il clic ritrova quella scheda');
    esigi(/<select class="ev-stato" data-id="' \+ esc\(r\.id\) \+ '" data-doc="/.test(APP) && /<select class="ev-modalita ' \+ md \+ '" data-id="' \+ esc\(r\.id\) \+ '" data-doc="/.test(APP)
        && (APP.match(/rigaPerScheda\(id, s\.dataset\.doc\)/g) || []).length === 2,
        'e cosi\' le tendine di stato e modalita\'');
    // la voce del menu "Invita agli incontri B2B" segue la stessa regola dell'invito a tutte
    esigi(/daInvitareB2B\(sezioneElenco\(ev, r\)\)/.test(APP.slice(APP.indexOf('function cellaAzioniHtml('), APP.indexOf('function cellaAzioniHtml(') + 20000)),
        'la voce "Invita agli incontri B2B" del menu guarda la sezione in cui la riga si mostra');
    // online e attesa: restano dove sono, e la scritta dice il vero
    esigi(A.hintCenaHtml(MILANO, e.online).indexOf(A.esc(A.TITOLO_CENA.online)) >= 0, 'online: "anche cena e meeting" con il suggerimento dell\'online');
    esigi(A.hintCenaHtml(MILANO, e.attesa).indexOf(A.esc(A.TITOLO_CENA.attesa)) >= 0, 'in attesa: con il suggerimento dell\'attesa');
    esigi(A.hintCenaHtml(MILANO, e.ospite).indexOf(A.esc(A.TITOLO_CENA.anche)) >= 0, 'fra gli aderenti: con il suo');
    A.mettiAderenti('', null); A.metti(null);
});

prova('Chi si mostra fra gli aderenti e\' un aderente anche per l\'elenco definitivo, gli inviti B2B e i relatori', () => {
    const e = elencoMilano();
    e.ospite.extra = Object.assign({}, e.ospite.extra, { 'Invito B2B': 'si' });
    e.aMano.extra = Object.assign({}, e.aMano.extra, { 'Invito B2B': 'si' });
    conCena(e, [e.ospite.email]);
    const c = A.confrontoElencoDefinitivo(MILANO, e.lista, ['nessuno@altrove.it']);
    esigi(!c.fuori.some(x => x.riga === e.ospite) && c.fuori.some(x => x.riga === e.aMano), 'elenco definitivo: l\'ospite alla cena non e\' fra gli ospiti da spostare online, gli altri si');
    const c2 = A.confrontoElencoDefinitivo(MILANO, e.lista, [e.ospite.email]);
    esigi(c2.mancanti.length === 1 && c2.mancanti[0].dove === 'aderenti', 'e se e\' nell\'elenco incollato, si dice che sta fra gli aderenti', JSON.stringify(c2.mancanti));
    // chi aspetta la conferma ed e' alla cena: confermando va fra gli aderenti, quindi non si propone per l'online
    const e2 = elencoMilano();
    conCena(e2, [e2.attesa.email]);
    const c3 = A.confrontoElencoDefinitivo(MILANO, e2.lista, [e2.ospite.email]);
    esigi(!c3.daConfermare.some(x => x.riga === e2.attesa), 'elenco definitivo: chi aspetta la conferma ed e\' alla cena non e\' fra quelli da confermare in sala', JSON.stringify(c3.daConfermare.map(x => x.email)));
    conCena(e2, []);
    const c4 = A.confrontoElencoDefinitivo(MILANO, e2.lista, [e2.ospite.email]);
    esigi(c4.daConfermare.some(x => x.riga === e2.attesa), 'senza la cena invece si propone, come prima');
    conCena(e, [e.ospite.email]);
    const inv = A.iscrittiPerInvitoB2B(MILANO, e.lista);
    esigi(!inv.includes(e.ospite) && inv.includes(e.aMano), 'inviti B2B: l\'aderente della cena non e\' un\'impresa da abbinare');
    esigi(A.relatoriEAderenti(MILANO).some(x => x.email === e.ospite.email && x.sezione === 'aderenti'), 'e fra relatori e aderenti della giornata c\'e\'');
    A.mettiAderenti('', null); A.metti(null);
});

prova('"Riconosci aderenti": chi si mostra gia\' fra gli aderenti no, chi resta online si', () => {
    const e = elencoMilano();
    e.ospite.aderente = true; e.online.aderente = true;
    conCena(e, [e.ospite.email, e.online.email]);
    const r = A.righeDaRiconoscere(MILANO, A.righeElenco(MILANO, e.lista)).map(x => x.riga);
    esigi(!r.includes(e.ospite) && r.includes(e.online), 'l\'ospite alla cena e\' gia\' fra gli aderenti; chi segue online si propone come sempre');
    esigi(!r.some(x => x.soloCena), 'e le righe della cena non si propongono');
    A.mettiAderenti('', null); A.metti(null);
});

prova('Le righe della cena stanno al loro posto per data, e l\'ordine del convegno non cambia', () => {
    const e = elencoMilano();
    const base = [riga({ data: '25/10/2026 10:00:00' }), riga({ data: '01/07/2026 10:00:00' }), riga({ data: '' })];
    A.mettiAderenti('milano-2027-02-26', [{ quota: {}, conti: {}, righe: [
        { id: 'q~vecchia', email: 'v@cena.it', primaVolta: new Date(2026, 8, 1, 10, 0).getTime() },
        { id: 'q~oggi', email: 'o@cena.it', primaVolta: new Date(2026, 9, 26, 10, 0).getTime() }
    ] }]);
    const el = A.righeElenco(MILANO, base);
    esigi(el.map(r => r.id).join(',') === ['cena~q~oggi', base[0].id, 'cena~q~vecchia', base[1].id, base[2].id].join(','),
        'la piu\' recente in cima, ognuna al suo posto; le righe del convegno nell\'ordine di prima', el.map(r => r.id + ' ' + r.data).join(' | '));
    A.mettiAderenti('', null);
});

prova('Il CSV legge la conferma dell\'email sull\'elenco intero, come la tabella', () => {
    presenze = {}; seq = 0;
    const a = riga({ email: 'Mario@Azienda.it ' });
    const b = riga({ email: 'mario@azienda.it', emailConfermata: CONFERMATA, modalita: 'b2b', soloB2B: true });
    const righe = A.righeCsvIscrizioni(MILANO, [a, b], id => presenze[id] || null);
    const testa = righe[0], iConf = testa.indexOf('Email confermata');
    esigi(righe.length === 2 && righe[1][0] === 'In presenza' && righe[1][iConf].indexOf('s\u00ec') === 0,
        'una riga confermata fra i soli incontri B2B conferma l\'indirizzo anche nel CSV (la riga B2B non si esporta)', JSON.stringify(righe));
    const vista = APP.slice(APP.indexOf('function vistaEventi('), APP.indexOf('function vistaEventi(') + 40000);
    esigi(/const righe = righeCsvIscrizioni\(ev, _evIscrizioni \|\| \[\], id => EventiPresenze\.di\(ev\.id, id\)\);/.test(APP), 'l\'esportazione passa l\'elenco intero');
});

prova('Le righe della cena si leggono soltanto: niente casella, tendine o menu', () => {
    const tab = APP.slice(APP.indexOf('function tabellaIscrizioni('), APP.indexOf('function agganciaScorriX('));
    esigi(/const segnaR = segna && !r\.soloCena;/.test(tab) && /const cellaStato = segnaR/.test(tab) && /const cellaNota = segnaR/.test(tab) && /const cellaModalita = segnaR/.test(tab),
        'stato, nota e modalita\' in sola lettura sulle righe della cena');
    esigi(/r\.soloCena \? '<td data-label=""><\/td>' : '<td data-label=""><input type="checkbox" class="ev-sel"/.test(tab), 'nessuna casella di selezione');
    esigi(/\(azioniEv && !r\.soloCena \? cellaAzioniHtml\(ev, r, md\)/.test(tab), 'e nessun menu della riga');
    esigi(/lista = lista\.filter\(r => sezioneElenco\(ev, r\) === sezione\)/.test(tab), 'il filtro della sezione guarda dove la riga si mostra');
    esigi(/const hintC = hintCenaHtml\(ev, r\);/.test(tab) && /\+ '<\/select>' \+ hintM \+ hintC \+ '<\/td>'/.test(tab), 'con "cena e meeting" sotto la tendina della modalita\'');
    const vista = APP.slice(APP.indexOf('function vistaEventi('), APP.indexOf('function vistaEventi(') + 40000);
    esigi(/tabellaIscrizioni\(ev, righeElenco\(ev, _evIscrizioni\)\)/.test(vista) && /_evCenaDisegnata = _evIscrizioni \? firmaCena\(ev\) : null;/.test(vista),
        'la pagina disegna l\'elenco con le righe della cena e segna con quali');
    esigi(/const tutte = righeElenco\(ev, lista \|\| \[\]\);/.test(APP.slice(APP.indexOf('function righeCsvIscrizioni('), APP.indexOf('function tabellaIscrizioni('))), 'e il CSV le esporta');
    // cambiando la tendina della modalita' si rimettono tutte le righine, "anche cena e meeting" compresa
    esigi(/\[hintAttesaMailHtml\(ev, rr\), hintModalitaHtml\(ev, rr, vero\), hintCenaHtml\(ev, rr\)\]/.test(APP), 'la tendina della modalita\' rimette anche "anche cena e meeting"');
    const agg = APP.slice(APP.indexOf('function aggiornaSchedaAderenti('), APP.indexOf('function aggiornaSchedaAderenti(') + 2500);
    esigi(/firmaCena\(ev\) !== _evCenaDisegnata\) ridisegnaEventiSeLibero\(\);/.test(agg), 'arrivate o cambiate le iscrizioni alla cena, l\'elenco si ridisegna');
    const num = APP.slice(APP.indexOf('function aggiornaNumeriEventi('), APP.indexOf('function titoloVoceSezione('));
    esigi(/const tutte = righeElenco\(ev, _evIscrizioni \|\| \[\]\);/.test(num) && /tutte\.filter\(r => sezioneElenco\(ev, r\) === id\)/.test(num), 'le voci sopra l\'elenco contano le righe della cena, nella sezione in cui si mostrano');
    const filtro = APP.slice(APP.indexOf('function filtroSezioniHtml('), APP.indexOf('function righeCsvIscrizioni('));
    esigi(/tutte\.filter\(r => sezioneElenco\(ev, r\) === id\)/.test(filtro), 'e cosi\' il filtro delle sezioni');
    const CSS = fs.readFileSync(path.join(__dirname, '..', '..', 'area-riservata', 'styles.css'), 'utf8');
    esigi(/\.ev-cena \{/.test(CSS), 'la riga "cena e meeting" ha la sua veste');
});

prova('I totali: aziende + aderenti + sponsor e relatori', () => {
    const tot = APP.slice(APP.indexOf('function totaliHtml('), APP.indexOf('function totaliHtml(') + 4000);
    esigi(/'sponsor e relatori', ti\.sponsor, '', q\('sponsor'\)/.test(tot) && /'totale', ti\.tutti, 'forte', q\('tutti'\)/.test(tot),
        'il riquadro di sponsor e relatori sta fra gli aderenti e il totale');
    const num = APP.slice(APP.indexOf('function aggiornaNumeriEventi('), APP.indexOf('function titoloVoceSezione('));
    esigi(/\['aziende', 'aderenti', 'sponsor', 'tutti', 'attesa', 'conAttesaAziende', 'conAttesaTutti'\]/.test(num), 'e si aggiorna al volo con gli altri');
    const ev = APP.slice(APP.indexOf('function totaliEvento('), APP.indexOf('function titoliTotali('));
    esigi(/sponsor: m === 'sponsor'/.test(ev), 'le righe del convegno dicono se stanno fra sponsor e relatori');
});

console.log('\nL\'elenco degli iscritti: attesa della conferma, colonne dal file, esportazione\n');
for (const p of prove) {
    console.log('\n' + p.titolo);
    try { p.fn(); } catch (e) { ko++; console.log('  ROSSO  eccezione: ' + (e && e.stack || e)); }
}
console.log('\n' + ok + ' verdi, ' + ko + ' rossi');
process.exit(ko ? 1 : 0);
