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

/* Una persona sul palco, ridotta a cio' che si stampa: nome, ruolo,
   azienda. `doc` e' la sua scheda fra gli iscritti - e' da li che arriva -
   e resta attaccata per poter risalire alla persona; il nome pero' si
   scrive anche qui, perche' la scaletta si deve poter stampare senza
   rileggere l'elenco degli iscritti. */
function normalizzaPersona(v) {
    const p = (v && typeof v === 'object') ? v : {};
    const nome = testo(p.nome, 120);
    if (!nome) return null;
    return {
        doc: testo(p.doc, 400), id: testo(p.id, 300), nome: nome,
        ruolo: testo(p.ruolo, 160), azienda: testo(p.azienda, 160),
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

/* Cosa non torna nella scaletta. Non si BLOCCA il salvataggio: una
   giornata si compone a pezzi, e un buco a meta' pomeriggio alle cinque di
   un martedi' e' normale. Si dice soltanto, perche' un orario che si
   sovrappone e' quasi sempre una svista, e accorgersene mentre si scrive
   costa niente. */
function controlla(voci) {
    const avvisi = [];
    const conOra = (voci || []).filter(v => oraValida(v.dalle));
    (voci || []).forEach(v => {
        if (!oraValida(v.dalle)) avvisi.push((v.titolo || nomeTipo(v.tipo)) + ': manca l\'ora di inizio');
        else if (!oraValida(v.alle)) avvisi.push((v.titolo || nomeTipo(v.tipo)) + ': manca l\'ora di fine');
    });
    conOra.forEach((a, i) => conOra.slice(i + 1).forEach(b => {
        if (!oraValida(a.alle) || !oraValida(b.alle)) return;
        if (minutiOra(a.dalle) < minutiOra(b.alle) && minutiOra(b.dalle) < minutiOra(a.alle)) {
            avvisi.push('si sovrappongono: ' + (a.titolo || nomeTipo(a.tipo)) + ' e ' + (b.titolo || nomeTipo(b.tipo)));
        }
    }));
    return avvisi.slice(0, 12);
}
function nomeTipo(id) { const t = tipoDa(id); return t ? t.nome : 'voce'; }

/* =========================================================
   LE AZIONI DELL'AREA RISERVATA (sezione: 'programma')
   ------------------------------------------------------------
   Leggere la scaletta la puo' chiunque veda la sezione Eventi:
   il giorno del convegno serve a tutti quelli che stanno al desk.
   Scriverla no: e' la stessa mano che manda gli inviti
   (amministratore, equity e founding partner).
========================================================= */
function gestisce(body) { return !!(body && String(body.sezione || '') === 'programma'); }

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
                voci: p.voci, aggiornato: p.aggiornato, avvisi: controlla(p.voci)
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
        p.aggiornato = { quando: Date.now(), da: String(ctx.email || ''), collab: String(ctx.collab || '') };
        await rifProgramma(db, evento).set(p);
        /* Si risponde con la scaletta rifatta e non con un "ok": la
           normalizzazione puo' aver rimesso in fila le voci o buttato un'ora
           impossibile, e chi ha salvato deve vedere com'e' rimasta. */
        return {
            stato: 200,
            corpo: { ok: true, voci: p.voci, aggiornato: p.aggiornato, avvisi: controlla(p.voci) }
        };
    }

    return { stato: 400, corpo: { ok: false, msg: 'Azione non riconosciuta.' } };
}

module.exports = {
    TIPI, tipoDa, nomeTipo,
    oraValida, minutiOra, ordina,
    normalizzaVoce, normalizzaProgramma, controlla,
    idEvento, rifProgramma, leggiProgramma,
    gestisce, esegui
};
