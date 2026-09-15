/* ============================================================
   LA GIORNATA DELL'EVENTO: come si legge, e cosa non torna
   ------------------------------------------------------------
   Funzioni pure sulla scaletta e sugli incontri B2B. Stanno qui,
   fuori dall'applicazione, per due ragioni: l'area riservata le
   usa mentre si scrive (gli avvisi devono seguire i tasti, non
   aspettare un salvataggio) e le prove le possono provare da
   sole, senza browser.

   COSA SA FARE
     - dividere la giornata in MATTINA e POMERIGGIO, con il
       confine preso dalla pausa pranzo vera (se c'e' in scaletta,
       vince quella; se no, quella degli incontri B2B; se non c'e'
       nemmeno quella, le 13:00);
     - dire cosa NON TORNA nella scaletta: ore mancanti, una voce
       che finisce prima di cominciare, due cose in contemporanea,
       una tavola rotonda senza moderatore;
     - trovare le INCOMPATIBILITA' CON GLI INCONTRI B2B: chi e'
       sul palco non puo' essere contemporaneamente al suo tavolo.
       E' l'errore che nessuno vede finche' non succede, perche'
       vive in due schermate diverse - la scaletta e l'agenda dei
       tavoli - e ognuna, da sola, e' perfettamente coerente.

   Perche' le incompatibilita' sono di DUE gravita':
     - GRAVE: nello stesso orario c'e' un'impresa che ha gia'
       prenotato quel tavolo. Sono due impegni presi con due
       persone diverse, e uno dei due salta: va spostato adesso,
       non il giorno del convegno;
     - da sistemare: il tavolo in quell'ora e' ancora prenotabile.
       Nessuno ci ha ancora messo piede, ma se qualcuno prenota
       l'errore diventa grave da solo. Basta chiudere quegli
       orari dall'agenda dei tavoli.
   ============================================================ */
(function (radice, fabbrica) {
    const api = fabbrica();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else radice.RV_GIORNATA = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const RE_ORA = /^([01]\d|2[0-3]):[0-5]\d$/;
    function oraValida(v) { return RE_ORA.test(String(v || '')); }
    function minutiOra(v) {
        if (!oraValida(v)) return -1;
        const p = String(v).split(':');
        return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
    }
    function oraDaMinuti(n) {
        const m = ((Math.round(n) % 1440) + 1440) % 1440;
        return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
    }
    // due fasce si sovrappongono se una comincia prima che l'altra finisca
    function siSovrappongono(da1, a1, da2, a2) { return da1 < a2 && da2 < a1; }
    /* Una voce dura da... a... solo se ha DUE ore e la seconda viene dopo.
       Le altre non entrano in nessun confronto: non si sa quando succedono,
       e indovinarlo vorrebbe dire segnalare conflitti inventati. */
    function durata(v) {
        const da = minutiOra(v && v.dalle), a = minutiOra(v && v.alle);
        return (da >= 0 && a > da) ? { da: da, a: a } : null;
    }
    const SENZA_ORA = 99999;
    function ordina(voci) {
        return (voci || []).map((v, i) => ({ v: v, i: i }))
            .sort((a, b) => {
                const ma = oraValida(a.v.dalle) ? minutiOra(a.v.dalle) : SENZA_ORA;
                const mb = oraValida(b.v.dalle) ? minutiOra(b.v.dalle) : SENZA_ORA;
                return (ma - mb) || (a.i - b.i);
            })
            .map(x => x.v);
    }

    /* --- IL CONFINE FRA MATTINA E POMERIGGIO ---
       Non e' mezzogiorno per convenzione: e' la FINE DELLA PAUSA PRANZO, che
       e' il momento in cui la giornata riparte. Si prende dalla scaletta (la
       voce "pausa pranzo"), altrimenti dagli incontri B2B, che la pausa ce
       l'hanno scritta; in mancanza di tutto, le 13:00.
       La fine e non l'inizio perche' la pausa CHIUDE la mattina: e' l'ultima
       riga della prima colonna, come su un programma stampato. Prendendo
       l'inizio, il pranzo aprirebbe il pomeriggio e la mattina finirebbe con
       l'ultimo intervento, che non e' come la giornata si legge. */
    const CONFINE_PREDEFINITO = 13 * 60;
    function confine(voci, giornata) {
        const pranzo = (voci || []).filter(v => v && v.tipo === 'pranzo' && oraValida(v.dalle))[0];
        if (pranzo) return minutiOra(oraValida(pranzo.alle) ? pranzo.alle : pranzo.dalle);
        const g = giornata || {};
        if (oraValida(g.pranzoA)) return minutiOra(g.pranzoA);
        if (oraValida(g.pranzoDa)) return minutiOra(g.pranzoDa);
        return CONFINE_PREDEFINITO;
    }
    /* La giornata in due meta', piu' quello che non ha ancora un'ora: quelle
       voci non spariscono - sono voci che qualcuno deve ancora collocare - ma
       non stanno ne' di qua ne' di la'. */
    function dividi(voci, confineMin) {
        const c = typeof confineMin === 'number' ? confineMin : CONFINE_PREDEFINITO;
        const fuori = { mattina: [], pomeriggio: [], senzaOra: [] };
        ordina(voci).forEach(v => {
            if (!oraValida(v.dalle)) fuori.senzaOra.push(v);
            else if (minutiOra(v.dalle) < c) fuori.mattina.push(v);
            else fuori.pomeriggio.push(v);
        });
        return fuori;
    }
    // gli orari di un tavolo B2B che cadono in una meta' della giornata
    function slotDellaFascia(slot, da, a) {
        return (slot || []).filter(s => {
            const m = minutiOra(s && s.ora);
            return m >= 0 && m >= da && m < a;
        });
    }

    /* --- CHI E' SUL PALCO ---
       Moderatore e partecipanti di una voce, con il ruolo che hanno li'
       dentro: serve a dirlo in chiaro quando qualcosa non torna ("modera",
       "e' al tavolo"). */
    function personeDiVoce(v) {
        const fuori = [];
        if (v && v.moderatore && v.moderatore.nome) fuori.push({ persona: v.moderatore, ruolo: 'moderatore' });
        ((v && v.partecipanti) || []).forEach(p => { if (p && p.nome) fuori.push({ persona: p, ruolo: 'partecipante' }); });
        return fuori;
    }
    /* Due schede sono la stessa persona se hanno lo stesso indirizzo email:
       il nome si scrive in dieci modi, e qui un confronto sbagliato vuol dire
       o un conflitto inventato o - peggio - un conflitto vero non visto.
       Senza email si ripiega sul nome ridotto all'osso. */
    function chiavePersona(p) {
        if (!p) return '';
        const mail = String(p.email || '').trim().toLowerCase();
        if (mail) return 'm:' + mail;
        const nome = String(p.nome || '').trim().toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
        return nome ? 'n:' + nome : '';
    }
    // come si chiama una persona quando la si nomina in un avviso
    function nomePersona(p) {
        const n = String((p && p.nome) || '').trim();
        const t = String((p && p.titolo) || '').trim();
        return t ? t + ' ' + n : n;
    }
    function titoloVoce(v, tipi) {
        const t = String((v && v.titolo) || '').trim();
        if (t) return t;
        const def = (tipi || []).filter(x => x.id === (v && v.tipo))[0];
        return def ? def.nome : 'voce senza titolo';
    }

    /* --- COSA NON TORNA NELLA SCALETTA ---
       Avvisi, non divieti: una giornata si compone a pezzi, e un buco a meta'
       pomeriggio due settimane prima e' normale. Serve che si vedano mentre
       si scrive, non che impediscano di salvare. */
    function avvisi(voci, tipi) {
        const fuori = [];
        const lista = voci || [];
        lista.forEach(v => {
            const nome = titoloVoce(v, tipi);
            if (!oraValida(v.dalle)) fuori.push({ testo: nome + ': manca l\'ora di inizio' });
            else if (!oraValida(v.alle)) fuori.push({ testo: nome + ': manca l\'ora di fine' });
            else if (minutiOra(v.alle) <= minutiOra(v.dalle)) fuori.push({ testo: nome + ': finisce prima di cominciare' });
            const def = (tipi || []).filter(x => x.id === v.tipo)[0];
            if (def && def.conModeratore && !(v.moderatore && v.moderatore.nome)) {
                fuori.push({ testo: nome + ': manca il moderatore' });
            }
        });
        const conOra = lista.map(v => ({ v: v, d: durata(v) })).filter(x => x.d);
        conOra.forEach((x, i) => conOra.slice(i + 1).forEach(y => {
            if (siSovrappongono(x.d.da, x.d.a, y.d.da, y.d.a)) {
                fuori.push({ testo: 'in contemporanea: ' + titoloVoce(x.v, tipi) + ' e ' + titoloVoce(y.v, tipi) });
            }
        }));
        return fuori;
    }

    /* --- LE INCOMPATIBILITA' CON GLI INCONTRI B2B ---
       Chi tiene un tavolo B2B e sale sul palco nello stesso orario non puo'
       fare tutte e due le cose. `aree` sono i tavoli come li conosce l'agenda
       (`id, nome, attiva, referenti, slot[{ora, fine, stato, chi}]`).
       Si guardano solo i tavoli ATTIVI: uno spento non riceve nessuno, quindi
       non toglie la persona dal palco. */
    function conflittiB2B(voci, aree, tipi) {
        const fuori = [];
        (voci || []).forEach(v => {
            const d = durata(v);
            if (!d) return;
            personeDiVoce(v).forEach(chi => {
                const k = chiavePersona(chi.persona);
                if (!k) return;
                (aree || []).forEach(area => {
                    if (!area || area.attiva === false) return;
                    if (!(area.referenti || []).some(r => chiavePersona(r) === k)) return;
                    const presi = [], liberi = [];
                    (area.slot || []).forEach(s => {
                        const sda = minutiOra(s && s.ora);
                        if (sda < 0) return;
                        const sa = minutiOra(s.fine);
                        if (!siSovrappongono(d.da, d.a, sda, sa > sda ? sa : sda + 1)) return;
                        if (s.stato === 'occupato') presi.push(s);
                        else if (s.stato !== 'chiuso') liberi.push(s);
                    });
                    const base = {
                        chi: nomePersona(chi.persona), chiave: k, ruolo: chi.ruolo,
                        voce: titoloVoce(v, tipi), dalle: v.dalle, alle: v.alle,
                        area: area.nome || area.id, areaId: area.id
                    };
                    if (presi.length) {
                        const ospiti = presi.map(s => {
                            const p = s.chi || {};
                            return s.ora + ' ' + (p.nome || 'prenotato') + (p.azienda ? ' (' + p.azienda + ')' : '');
                        });
                        fuori.push(Object.assign({}, base, {
                            grave: true,
                            chiavi: presi.map(s => s.chiave || s.ora.replace(':', '')),
                            ore: presi.map(s => s.ora),
                            ospiti: ospiti,
                            testo: base.chi + ' ' + (chi.ruolo === 'moderatore' ? 'modera' : 'partecipa a')
                                + ' "' + base.voce + '" dalle ' + v.dalle + ' alle ' + v.alle
                                + ', e nello stesso orario ha '
                                + (presi.length === 1 ? 'un incontro B2B già prenotato' : presi.length + ' incontri B2B già prenotati')
                                + ' al tavolo ' + base.area + ' (' + ospiti.join('; ')
                                + '): uno dei due impegni va spostato.'
                        }));
                    }
                    if (liberi.length) {
                        fuori.push(Object.assign({}, base, {
                            grave: false,
                            chiavi: liberi.map(s => s.chiave || s.ora.replace(':', '')),
                            ore: liberi.map(s => s.ora),
                            ospiti: [],
                            testo: base.chi + ' è sul palco per "' + base.voce + '" dalle ' + v.dalle + ' alle ' + v.alle
                                + ', ma al tavolo ' + base.area + ' quegli orari sono ancora prenotabili ('
                                + liberi.map(s => s.ora).join(', ') + '): chiudili dall\'agenda dei tavoli, '
                                + 'prima che qualcuno li prenoti.'
                        }));
                    }
                });
            });
        });
        return fuori;
    }
    /* Gli orari da dipingere di rosso nella panoramica: "tavolo|chiave". Si
       ricavano dai conflitti, cosi' la griglia e l'elenco degli errori non
       possono raccontare due cose diverse. */
    function oreInConflitto(conflitti) {
        const mappa = {};
        (conflitti || []).forEach(c => {
            (c.chiavi || []).forEach(k => {
                const id = c.areaId + '|' + k;
                // il grave vince: se un orario e' sia prenotato sia da chiudere,
                // quello che conta e' che c'e' gia' qualcuno che aspetta
                if (c.grave || !mappa[id]) mappa[id] = c.grave ? 'grave' : 'aperto';
            });
        });
        return mappa;
    }

    return {
        CONFINE_PREDEFINITO: CONFINE_PREDEFINITO,
        oraValida: oraValida, minutiOra: minutiOra, oraDaMinuti: oraDaMinuti,
        siSovrappongono: siSovrappongono, durata: durata, ordina: ordina,
        confine: confine, dividi: dividi, slotDellaFascia: slotDellaFascia,
        personeDiVoce: personeDiVoce, chiavePersona: chiavePersona,
        nomePersona: nomePersona, titoloVoce: titoloVoce,
        avvisi: avvisi, conflittiB2B: conflittiB2B, oreInConflitto: oreInConflitto
    };
});
