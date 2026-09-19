/* ============================================================
   I PROGRAMMI GIA' SCRITTI (la bozza da riportare nella giornata)
   ------------------------------------------------------------
   La scaletta di un convegno non nasce nell'area riservata: nasce
   prima, in una tabella - orari, sessione, contenuto, relatori -
   che gira per posta fra chi organizza. Quando arriva il momento
   di metterla dentro la giornata, qualcuno la ricopia voce per
   voce: tredici righe, ventisei orari, e un'ora scritta male che
   nessuno rilegge perche' "l'ho appena copiata da li'".

   Qui sta quella tabella, gia' in forma di scaletta. L'area
   riservata offre un pulsante che la RIPORTA nella finestra della
   giornata; da quel momento e' una bozza come un'altra, che si
   corregge e si salva col suo pulsante.

   DUE COSE CHE QUESTO FILE NON FA, ed e' apposta:

   - NON SALVA NIENTE. Riportare la bozza riempie solo la copia di
     lavoro a video: finche' non si preme "Salva il programma" sul
     servizio non cambia nulla. Un programma che si scrivesse da
     solo sovrascriverebbe il lavoro di chi lo stava sistemando.

   - NON METTE NOMI SUL PALCO. I relatori della tabella restano
     scritti nella NOTA della voce, non fra i partecipanti. Chi
     sale sul palco si sceglie fra gli ISCRITTI all'evento (e' la
     regola di tutta la scaletta: un nome che nessuno ha
     confermato e' un nome che il giorno del convegno puo' non
     esserci), e la nota e' il posto che quella regola lascia
     libero per gli ospiti esterni. Cosi' la nota dice a chi
     compone chi era previsto, e il palco continua a dire solo
     chi e' confermato.

   COME SI AGGIUNGE UN EVENTO. Una chiave in PROPOSTE con l'id
   dell'evento (gli stessi di EVENTI_DEF in app.js) e le sue voci,
   in ordine di orario: `tipo` fra quelli del servizio
   (registrazione, saluti, istituzionali, intervento, tavola,
   coffee, pranzo, chiusura, altro), `titolo`, `dalle`, `alle`,
   `nota`. Gli identificativi non si scrivono: li da' `di()`.
   Le prove (email-service/prove/programmi-proposti.prove.js)
   controllano che ogni bozza stia in piedi da sola - tipi veri,
   ore valide, niente in contemporanea - prima che qualcuno la
   veda a video.
   ============================================================ */
(function (radice, fabbrica) {
    const api = fabbrica();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else radice.RV_PROGRAMMI_PROPOSTI = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const PROPOSTE = {
        /* NAPOLI, 2 ottobre 2026 - Hotel Eurostars Excelsior.
           Ricopiata dalla tabella dei lavori (ORARI / DURATA / SESSIONE /
           CONTENUTO / RELATORI). Gli ORARI della tabella fanno testo: dove la
           colonna "durata" non tornava con le due ore - i saluti dicono 15
           minuti e vanno dalle 09:30 alle 09:50, il keynote dice 15 minuti e
           va dalle 09:50 alle 10:00 - si sono tenute le ORE, perche' sono
           quelle che compongono la giornata e che il pubblico legge; la
           durata nell'area riservata si ricava da sole.
           La tavola rotonda delle banche resta SENZA MODERATORE: la giornata
           lo segnala in giallo, ed e' giusto che lo faccia, perche' nella
           tabella non c'e' e va scelto fra gli iscritti. */
        'napoli-2026-10-02': {
            fonte: 'Programma dei lavori di Napoli, 2 ottobre 2026',
            voci: [
                {
                    tipo: 'registrazione', dalle: '09:00', alle: '09:30',
                    titolo: 'Registrazione e welcome coffee',
                    nota: 'Accoglienza dei partecipanti e consegna dei badge. A cura della segreteria organizzativa.'
                },
                {
                    tipo: 'istituzionali', dalle: '09:30', alle: '09:50',
                    titolo: 'Saluti istituzionali',
                    nota: 'Apertura ufficiale dei lavori. Dal programma: delegato del Presidente dell\'Ordine dei Commercialisti; '
                        + 'Pier Luigi Sterzi; Fausta Bianchi; Chiara Marciani (assessore alle attività produttive); '
                        + 'Francesca Serao (già presidente).'
                },
                {
                    tipo: 'intervento', dalle: '09:50', alle: '10:00',
                    titolo: 'Keynote introduttivo',
                    nota: 'Scenario, obiettivi del convegno e presentazione del network. Dal programma: Sergio Miele (Revilaw).'
                },
                {
                    tipo: 'intervento', dalle: '10:00', alle: '10:40',
                    titolo: 'Adeguati assetti e continuità aziendale',
                    nota: 'Prevenzione, monitoraggio e segnali di crisi. Dal programma: Stefano Pizzutelli (Revilaw); Andrea Missori (Revilaw).'
                },
                {
                    tipo: 'intervento', dalle: '10:40', alle: '11:20',
                    titolo: 'Modello 231 e Tax Control Framework',
                    nota: 'Governance, presidio dei rischi e conformità. Dal programma: Melo Martella (Revilaw); Luca Barbero (ADVANT NCTM).'
                },
                {
                    tipo: 'intervento', dalle: '11:20', alle: '11:50',
                    titolo: 'Rating di Legalità',
                    nota: 'Requisiti, benefici e riflessi sul merito creditizio. Dal programma: Francesca Ragai (ADVANT NCTM); avv. Antonella Candelieri.'
                },
                {
                    tipo: 'intervento', dalle: '11:50', alle: '12:40',
                    titolo: 'Sostenibilità e fattori ESG',
                    nota: 'Valore, competitività e accesso al credito. Dal programma: Vincenzo Furca (NATU); '
                        + 'Benito De Berardis (ceo Serviter); Antonella Candelieri (Revilaw).'
                },
                {
                    tipo: 'intervento', dalle: '12:40', alle: '13:30',
                    titolo: 'Finanza agevolata',
                    nota: 'Strumenti e opportunità per le imprese. Dal programma: Sara Ventura (Spacoup); '
                        + 'prof. Federico Secondo Maria Mustilli (senza presentazione); Strato Feola (Fineco); Concetta Petti.'
                },
                {
                    tipo: 'pranzo', dalle: '13:30', alle: '14:30',
                    titolo: 'Lunch buffet e networking',
                    nota: 'Incontri e relazioni professionali. È la fascia degli incontri B2B: gli orari dei tavoli si impostano qui sotto.'
                },
                {
                    tipo: 'tavola', dalle: '14:30', alle: '15:20',
                    titolo: 'Banche. Tavola rotonda',
                    nota: 'Merito creditizio e dialogo banca-impresa. Al tavolo, dal programma: Federica Tartaro (Banca Intesa Sanpaolo), '
                        + 'specialista per l\'innovazione e referente ESG per Campania, Calabria e Sicilia; Michele Novale '
                        + '(Banca Intesa Sanpaolo), specialista dell\'Ufficio Crediti della Direzione Generale. Il moderatore va scelto fra gli iscritti.'
                },
                {
                    tipo: 'intervento', dalle: '15:20', alle: '16:10',
                    titolo: 'Invitalia e MCC. Bagnoli e America\'s Cup',
                    nota: 'Sviluppo del territorio e opportunità per le imprese. Dal programma: Sergio Schirani (Invitalia); Carlo De Simone (SIMEST).'
                },
                {
                    tipo: 'intervento', dalle: '16:10', alle: '16:40',
                    titolo: 'Sessione Questions and Answers',
                    nota: 'Domande dal pubblico.'
                },
                {
                    tipo: 'chiusura', dalle: '16:40', alle: '17:00',
                    titolo: 'Conclusioni e chiusura dei lavori',
                    nota: 'Sintesi, prossimi passi e networking finale. Dal programma: Sergio Miele (Revilaw).'
                }
            ]
        }
    };

    function esiste(evento) {
        const k = String(evento == null ? '' : evento).trim();
        return !!(k && PROPOSTE[k] && (PROPOSTE[k].voci || []).length);
    }
    function fonte(evento) {
        const p = PROPOSTE[String(evento == null ? '' : evento).trim()];
        return (p && p.fonte) || '';
    }
    function quante(evento) {
        const p = PROPOSTE[String(evento == null ? '' : evento).trim()];
        return p ? (p.voci || []).length : 0;
    }
    /* Le voci pronte per la finestra della giornata: una COPIA, con gli
       identificativi dati qui. La copia perche' chi riporta la bozza poi la
       corregge, e una bozza corretta una volta non deve tornare corretta la
       volta dopo; gli identificativi perche' li' dentro servono solo a non
       confondere due voci mentre si scrive, e quelli buoni li mette il
       servizio quando si salva. */
    function di(evento) {
        const p = PROPOSTE[String(evento == null ? '' : evento).trim()];
        if (!p) return [];
        return (p.voci || []).map((v, i) => ({
            id: 'bz' + (i + 1) + '-' + Date.now(),
            tipo: v.tipo, titolo: v.titolo || '',
            dalle: v.dalle || '', alle: v.alle || '',
            nota: v.nota || '',
            moderatore: null, partecipanti: []
        }));
    }

    return { PROPOSTE: PROPOSTE, esiste: esiste, fonte: fonte, quante: quante, di: di };
});
