/* ============================================================
   ANTEPRIMA - la "Posta di prova"
   ------------------------------------------------------------
   Ogni email che il servizio spedirebbe con Brevo (credenziali,
   promemoria, password dimenticata, primo accesso dei gestori,
   email di prova) arriva qui, con l'HTML e il testo veri. Il guscio
   dell'anteprima la mostra nella scheda "Posta di prova".
   Si tengono le ultime 80, anche ricaricando la pagina.
   ============================================================ */
'use strict';

const CHIAVE = 'ngbAnteprimaPosta.v3';
const MASSIMO = 80;

const posta = {
    messaggi: [],
    osservatori: new Set(),
    contatore: 0,

    carica() {
        try { this.messaggi = JSON.parse(localStorage.getItem(CHIAVE) || '[]'); } catch (e) { this.messaggi = []; }
        this.contatore = this.messaggi.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0);
    },
    salva() {
        try { localStorage.setItem(CHIAVE, JSON.stringify(this.messaggi.slice(0, MASSIMO))); } catch (e) { /* pazienza */ }
    },
    svuota() {
        this.messaggi = [];
        try { localStorage.removeItem(CHIAVE); } catch (e) { /* niente */ }
        this.avvisa(null);
    },
    // una riga come quelle di DIRETTA_POSTA_FINTA: { a, oggetto, html, testo, quando, intestazioni, tipo }
    arriva(riga) {
        const m = Object.assign({}, riga, { id: String(++this.contatore), letto: false });
        this.messaggi.unshift(m);
        if (this.messaggi.length > MASSIMO) this.messaggi.length = MASSIMO;
        this.salva();
        this.avvisa(m);
    },
    segnaLetto(id) {
        const m = this.messaggi.find(x => x.id === id);
        if (m && !m.letto) { m.letto = true; this.salva(); this.avvisa(null); }
    },
    nonLetti() { return this.messaggi.filter(m => !m.letto).length; },
    ascolta(fn) { this.osservatori.add(fn); return () => this.osservatori.delete(fn); },
    avvisa(m) { Array.from(this.osservatori).forEach(fn => { try { fn(m); } catch (e) { this.osservatori.delete(fn); } }); }
};

module.exports = posta;
