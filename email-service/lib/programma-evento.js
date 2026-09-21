/* ============================================================
   IL PROGRAMMA DELLA GIORNATA (la scaletta dell'evento)
   ------------------------------------------------------------
   Com'e' fatta la giornata, dall'apertura della registrazione
   alla chiusura dei lavori: gli orari, cosa succede in ciascuno,
   e - per le tavole rotonde - chi modera e chi siede al tavolo.

   Perche' vive sul servizio e non nel browser di chi organizza:
   la scaletta la guardano in tanti (chi sta al desk, chi presenta,
   chi prepara le slide) e cambia fino all'ultimo giorno. Tenuta in
   locale sarebbe la scaletta di un computer solo, e la versione
   buona sarebbe quella dell'ultimo che l'ha aperta.

   COSA C'E' DENTRO. Una VOCE per ogni momento della giornata:
     { id, tipo, titolo, dalle, alle, nota, moderatore, partecipanti }
   Il `tipo` decide come si legge e cosa si chiede (vedi TIPI):
   la registrazione e la pausa pranzo non hanno relatori, i saluti
   istituzionali hanno chi parla, una tavola rotonda ha il
   moderatore e i suoi partecipanti.

   CHI PUO' SEDERSI A UN TAVOLO. Solo persone ISCRITTE all'evento:
   moderatore e partecipanti arrivano dall'elenco iscritti (sezioni
   "Sponsor e relatori" e "Aderenti Revilaw"), non si scrivono a
   mano. Un nome scritto a mano e' un nome che nessuno ha confermato
   e che il giorno del convegno puo' non esserci; e la scaletta non
   e' il posto dove scoprirlo. Chi dovesse esserci senza essere fra
   gli iscritti si annota nella `nota` della voce, che resta libera.

   Il documento e' uno per evento: `programmaEventi/{evento}`. Lo
   scrive per intero chi salva dalla finestra dell'area riservata -
   la scaletta si legge e si corregge tutta insieme, non voce per
   voce - e ogni salvataggio lascia scritto chi e quando.

   Come per l'agenda B2B, questo non e' un endpoint a se':
   api/presenze.js gli passa le richieste con sezione: 'programma',
   dopo aver gia' verificato chi chiama.
   ============================================================ */

function testo(v, max) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 200);
}

/* I TIPI DI VOCE, nell'ordine in cui si propongono a chi compone la
   scaletta. `conRelatori` dice se quella voce ha delle persone sul palco;
   `conModeratore` se fra quelle persone ce n'e' una che conduce. Il
   `titolo` e' solo una proposta: si riscrive sempre. */
const TIPI = [
    { id: 'registrazione', nome: 'Registrazione', titolo: 'Registrazione dei partecipanti e welcome coffee', conRelatori: false, conModeratore: false },
    { id: 'saluti', nome: 'Saluti iniziali', titolo: 'Saluti e apertura dei lavori', conRelatori: true, conModeratore: false },
    { id: 'istituzionali', nome: 'Saluti istituzionali', titolo: 'Saluti istituzionali', conRelatori: true, conModeratore: false },
    { id: 'intervento', nome: 'Intervento', titolo: '', conRelatori: true, conModeratore: false },
    { id: 'tavola', nome: 'Tavola rotonda', titolo: '', conRelatori: true, conModeratore: true },
    { id: 'coffee', nome: 'Coffee break', titolo: 'Coffee break', conRelatori: false, conModeratore: false },
    { id: 'pranzo', nome: 'Pausa pranzo', titolo: 'Pausa pranzo e incontri B2B', conRelatori: false, conModeratore: false },
    { id: 'chiusura', nome: 'Chiusura', titolo: 'Chiusura dei lavori', conRelatori: true, conModeratore: false },
    { id: 'altro', nome: 'Altro', titolo: '', conRelatori: true, conModeratore: true }
];
function tipoDa(id) {
    const k = String(id == null ? '' : id).trim().toLowerCase();
    return TIPI.filter(t => t.id === k)[0] || null;
}

/* Le ore, nella stessa forma di tutto il resto ("HH:MM", quella delle
   caselle <input type="time">): e' l'unica che si possa mettere in fila
   senza interpretare. */
const RE_ORA = /^([01]\d|2[0-3]):[0-5]\d$/;
function oraValida(v) { return RE_ORA.test(String(v || '')); }
function minutiOra(v) {
    if (!oraValida(v)) return -1;
    const p = String(v).split(':');
    return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
}

/* Una persona sul palco, ridotta a cio' che si stampa: nome, titolo, ruolo,
   azienda. `doc` e' la sua scheda fra gli iscritti - e' da li che arriva -
   e resta attaccata per poter risalire alla persona; il nome pero' si
   scrive anche qui, perche' la scaletta si deve poter stampare senza
   rileggere l'elenco degli iscritti.
   Il `titolo` e' l'unica cosa che si scrive a mano, e sta accanto al nome
   ("Avv.", "Dott.", "Presidente"): non e' un dato dell'iscrizione - li'
   c'e' il ruolo in azienda - ma e' come la persona va annunciata dal palco,
   e cambia da un evento all'altro. */
function normalizzaPersona(v) {
    const p = (v && typeof v === 'object') ? v : {};
    const nome = testo(p.nome, 120);
    if (!nome) return null;
    return {
        doc: testo(p.doc, 400), id: testo(p.id, 300), nome: nome,
        titolo: testo(p.titolo, 80),
        ruolo: testo(p.ruolo, 160), azienda: testo(p.azienda, 160),
        email: testo(p.email, 200).toLowerCase(),
        sezione: (['aderenti', 'sponsor'].indexOf(testo(p.sezione, 20)) >= 0) ? testo(p.sezione, 20) : ''
    };
}
const MAX_VOCI = 60;
const MAX_PARTECIPANTI = 12;
function normalizzaVoce(v, n) {
    const x = (v && typeof v === 'object') ? v : {};
    const tipo = tipoDa(x.tipo) || tipoDa('altro');
    const dalle = oraValida(x.dalle) ? x.dalle : '';
    const alle = oraValida(x.alle) ? x.alle : '';
    return {
        // l'identificativo serve solo a non confondere due voci mentre si
        // modificano: se manca se ne da' uno stabile dalla posizione
        id: testo(x.id, 40) || ('v' + (n + 1)),
        tipo: tipo.id,
        titolo: testo(x.titolo, 200),
        dalle: dalle,
        // una fine prima dell'inizio non e' una fine: si butta l'ora, non la voce
        alle: (alle && dalle && minutiOra(alle) <= minutiOra(dalle)) ? '' : alle,
        nota: testo(x.nota, 500),
        moderatore: tipo.conModeratore ? normalizzaPersona(x.moderatore) : null,
        partecipanti: tipo.conRelatori
            ? (Array.isArray(x.partecipanti) ? x.partecipanti : [])
                .map(normalizzaPersona).filter(Boolean).slice(0, MAX_PARTECIPANTI)
            : []
    };
}
/* La scaletta IN ORDINE DI ORARIO: e' l'ordine in cui la giornata succede,
   ed e' l'unico in cui si legge. Una voce senza ora va in fondo (e non
   sparisce: e' una voce che qualcuno deve ancora collocare), e a parita' di
   ora resta l'ordine in cui e' stata scritta. */
function ordina(voci) {
    return (voci || []).map((v, i) => ({ v: v, i: i }))
        .sort((a, b) => {
            const ma = oraValida(a.v.dalle) ? minutiOra(a.v.dalle) : 99999;
            const mb = oraValida(b.v.dalle) ? minutiOra(b.v.dalle) : 99999;
            return (ma - mb) || (a.i - b.i);
        })
        .map(x => x.v);
}
function normalizzaProgramma(v, evento) {
    const d = (v && typeof v === 'object') ? v : {};
    const ev = (d.eventoDati && typeof d.eventoDati === 'object') ? d.eventoDati : {};
    const voci = (Array.isArray(d.voci) ? d.voci : []).slice(0, MAX_VOCI).map(normalizzaVoce);
    return {
        evento: idEvento(evento || d.evento),
        eventoDati: {
            titolo: testo(ev.titolo, 120), quando: testo(ev.quando, 120),
            luogo: testo(ev.luogo, 200), indirizzo: testo(ev.indirizzo, 200)
        },
        voci: ordina(voci),
        aggiornato: (d.aggiornato && typeof d.aggiornato === 'object') ? d.aggiornato : null
    };
}
function idEvento(evento) {
    return String(evento == null ? '' : evento).trim()
        .replace(/[\/\\.#$\[\]]/g, '-').slice(0, 120);
}
function rifProgramma(db, evento) { return db.collection('programmaEventi').doc(idEvento(evento)); }

async function leggiProgramma(db, evento) {
    const snap = await rifProgramma(db, evento).get();
    return normalizzaProgramma(snap.exists ? snap.data() : null, evento);
}

/* Gli AVVISI non si calcolano qui. Cosa non torna in una scaletta - ore
   mancanti, cose in contemporanea, una tavola senza moderatore, e soprattutto
   le incompatibilita' con gli incontri B2B - si deve vedere MENTRE si scrive,
   non dopo un salvataggio: vive quindi in area-riservata/programma-giornata.js,
   che l'area riservata usa a ogni tasto e le prove provano da sole. Tenerne
   una copia anche qui vorrebbe dire due regole che si allontanano, e la
   seconda opinione su quando una giornata torna non serve a nessuno. */

/* =========================================================
   LE AZIONI DELL'AREA RISERVATA (sezione: 'programma')
   ------------------------------------------------------------
   Leggere la scaletta la puo' chiunque veda la sezione Eventi:
   il giorno del convegno serve a tutti quelli che stanno al desk.
   Scriverla no: e' la stessa mano che manda gli inviti
   (amministratore, equity e founding partner).
========================================================= */
function gestisce(body) { return !!(body && String(body.sezione || '') === 'programma'); }

/* =========================================================
   LE INCOMPATIBILITA' CON GLI INCONTRI GIA' PRENOTATI
   ---------------------------------------------------------
   Chi tiene un tavolo B2B non puo' essere sul palco nella stessa ora. Se
   in quell'ora c'e' soltanto un orario ancora libero e' una cosa da
   sistemare, e l'area riservata la dice in giallo; se invece c'e' gia'
   una PRENOTAZIONE, sono due impegni presi con due persone diverse e uno
   dei due saltera' il giorno del convegno. Quello non si salva: si
   respinge, e si dice quale.

   Perche' anche qui e non solo nel browser: la scaletta la si scrive per
   mezz'ora di fila, e in mezz'ora un'impresa prenota. Chi salva avrebbe
   in mano una giornata che era coerente quando l'ha aperta e non lo e'
   piu' quando preme. Qui si decide sull'ultima versione dei dati.

   La regola completa - con anche gli avvisi in giallo - sta in
   `area-riservata/programma-giornata.js`, che e' quella che disegna il
   rosso mentre si scrive. Qui c'e' solo la meta' che BLOCCA, e
   `prove/programma-giornata.prove.js` verifica che le due dicano la
   stessa cosa sugli stessi dati: e' la ragione per cui possono vivere in
   due file senza allontanarsi.
========================================================= */
function chiavePersona(p) {
    if (!p) return '';
    const mail = String(p.email || '').trim().toLowerCase();
    if (mail) return 'm:' + mail;
    const nome = String(p.nome || '').trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
    return nome ? 'n:' + nome : '';
}
function personeDiVoce(v) {
    const fuori = [];
    if (v && v.moderatore && v.moderatore.nome) fuori.push({ persona: v.moderatore, ruolo: 'moderatore' });
    ((v && v.partecipanti) || []).forEach(p => { if (p && p.nome) fuori.push({ persona: p, ruolo: 'partecipante' }); });
    return fuori;
}
function nomePersona(p) {
    const n = String((p && p.nome) || '').trim();
    const t = String((p && p.titolo) || '').trim();
    return t ? t + ' ' + n : n;
}
/* `aree` sono i tavoli come li compone l'agenda: {id, nome, attiva,
   referenti, slot[{ora, fine, chiave, stato, chi}]}. Si guardano solo i
   tavoli ATTIVI e solo gli slot OCCUPATI: un tavolo spento non aspetta
   nessuno, e un orario libero non e' un impegno con nessuno. */
function conflittiConPrenotazioni(voci, aree) {
    const fuori = [];
    (voci || []).forEach(v => {
        /* La fascia del palco si allarga del MARGINE di prudenza (dieci
           minuti prima e dopo, gli stessi con cui l'agenda chiude gli
           orari): un incontro attaccato alla tavola rotonda e' un incontro
           in cui l'impresa aspetta al tavolo mentre la persona riconsegna
           il microfono. */
        const dalle = minutiOra(v && v.dalle), alle = minutiOra(v && v.alle);
        if (dalle < 0 || alle <= dalle) return;
        const da = dalle - AGENDA.MARGINE_PALCO, a = alle + AGENDA.MARGINE_PALCO;
        personeDiVoce(v).forEach(chi => {
            const k = chiavePersona(chi.persona);
            if (!k) return;
            (aree || []).forEach(area => {
                if (!area || area.attiva === false) return;
                if (!(area.referenti || []).some(r => chiavePersona(r) === k)) return;
                const presi = (area.slot || []).filter(s => {
                    if (!s || s.stato !== 'occupato') return false;
                    const sda = minutiOra(s.ora);
                    if (sda < 0) return false;
                    const sa = minutiOra(s.fine);
                    return da < (sa > sda ? sa : sda + 1) && sda < a;
                });
                if (!presi.length) return;
                const t = tipoDa(v.tipo);
                fuori.push({
                    chi: nomePersona(chi.persona), chiave: k, ruolo: chi.ruolo,
                    areaId: area.id, area: area.nome || area.id,
                    voce: testo(v.titolo, 200) || (t ? t.nome : 'voce senza titolo'),
                    dalle: v.dalle, alle: v.alle,
                    chiavi: presi.map(s => s.chiave || String(s.ora).replace(':', '')),
                    ore: presi.map(s => s.ora),
                    ospiti: presi.map(s => {
                        const p = s.chi || {};
                        return s.ora + ' ' + (p.nome || 'prenotato') + (p.azienda ? ' (' + p.azienda + ')' : '');
                    })
                });
            });
        });
    });
    return fuori;
}
function frasePerRifiuto(conflitti) {
    const righe = conflitti.slice(0, 4).map(c => c.chi
        + (c.ruolo === 'moderatore' ? ' modera' : ' partecipa a')
        + ' "' + c.voce + '" dalle ' + c.dalle + ' alle ' + c.alle
        + ', ma al tavolo ' + c.area + ' ha ' + c.ospiti.join('; '));
    return 'Non posso salvare: ' + righe.join('. ')
        + (conflitti.length > 4 ? '. E altre ' + (conflitti.length - 4) + ' incompatibilita' : '')
        + '. Sono due impegni presi con due persone diverse, e uno dei due salterebbe: '
        + 'sposta la voce del programma, oppure libera la prenotazione dai tavoli B2B, e risalva.';
}
/* Si legge dal MODELLO dell'agenda (lib/agenda-modello.js) e non da
   agenda-b2b.js: qui serve solo sapere chi ha prenotato, e il modulo
   grande si tira dietro la posta e il PDF, che a una scaletta che si
   salva non servono. */
const AGENDA = require('./agenda-modello');
async function areeConPrenotazioni(db, evento) {
    const agenda = await AGENDA.leggiAgenda(db, evento);
    const pren = await AGENDA.leggiPrenotazioni(db, evento);
    return AGENDA.areeComposte(agenda, pren);
}

async function esegui(ctx) {
    const db = ctx.db;
    const body = ctx.body || {};
    const azione = String(body.azione || 'programma');
    const evento = idEvento(body.evento);
    if (!evento) return { stato: 400, corpo: { ok: false, msg: 'Evento mancante.' } };

    if (azione === 'programma') {
        const p = await leggiProgramma(db, evento);
        return {
            stato: 200,
            corpo: {
                ok: true, evento: evento, eventoDati: p.eventoDati,
                /* I tipi di voce viaggiano con la scaletta: l'area riservata
                   compone i pulsanti "aggiungi" e le etichette da qui, invece
                   di tenerne una copia sua che il giorno dopo non combacia. */
                tipi: TIPI,
                voci: p.voci, aggiornato: p.aggiornato
            }
        };
    }

    if (!ctx.eAdmin && !ctx.ePartner) {
        return {
            stato: 403,
            corpo: { ok: false, msg: 'Possono comporre il programma l\'amministratore, gli equity partner e i founding partner.' }
        };
    }

    /* Si salva TUTTA la scaletta, non una voce per volta: si compone
       guardandola intera - un intervento si sposta perche' un altro si e'
       allungato - e mandare le modifiche una a una vorrebbe dire lasciare a
       video una giornata che per mezzo secondo non sta in piedi. */
    if (azione === 'programma-salva') {
        const corrente = await leggiProgramma(db, evento);
        const ev = (body.eventoDati && typeof body.eventoDati === 'object') ? body.eventoDati : corrente.eventoDati;
        const p = normalizzaProgramma({ evento: evento, eventoDati: ev, voci: body.voci }, evento);
        /* Prima di scrivere: se la scaletta manda sul palco qualcuno che in
           quell'ora ha gia' un incontro PRENOTATO, non si salva (vedi
           conflittiConPrenotazioni). */
        const aree = await areeConPrenotazioni(db, evento);
        const scontri = conflittiConPrenotazioni(p.voci, aree);
        if (scontri.length) {
            return {
                stato: 409,
                corpo: { ok: false, motivo: 'prenotato', msg: frasePerRifiuto(scontri), conflitti: scontri }
            };
        }
        p.aggiornato = { quando: Date.now(), da: String(ctx.email || ''), collab: String(ctx.collab || '') };
        await rifProgramma(db, evento).set(p);
        /* Si risponde con la scaletta rifatta e non con un "ok": la
           normalizzazione puo' aver rimesso in fila le voci o buttato un'ora
           impossibile, e chi ha salvato deve vedere com'e' rimasta. */
        return {
            stato: 200,
            corpo: { ok: true, voci: p.voci, aggiornato: p.aggiornato }
        };
    }

    return { stato: 400, corpo: { ok: false, msg: 'Azione non riconosciuta.' } };
}

module.exports = {
    TIPI, tipoDa,
    oraValida, minutiOra, ordina,
    normalizzaVoce, normalizzaProgramma,
    idEvento, rifProgramma, leggiProgramma,
    conflittiConPrenotazioni, areeConPrenotazioni, frasePerRifiuto,
    gestisce, esegui
};
