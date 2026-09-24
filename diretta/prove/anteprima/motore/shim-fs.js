/* ============================================================
   ANTEPRIMA - fs e path di Node, solo per la posta finta
   ------------------------------------------------------------
   Il servizio, in prova, scrive ogni email come una riga JSON in
   un file (DIRETTA_POSTA_FINTA). Qui la riga va nella "Posta di
   prova" dell'anteprima: nessun file, nessun invio vero.
   ============================================================ */
'use strict';

function appendFileSync(file, riga) {
    const posta = globalThis.NGBA_POSTA;
    String(riga).split('\n').filter(Boolean).forEach(r => {
        try { if (posta) posta.arriva(JSON.parse(r)); } catch (e) { console.error('[anteprima] riga di posta illeggibile', e); }
    });
}
function mkdirSync() { /* niente cartelle nel browser */ }
function existsSync() { return false; }
function readFileSync() { throw Object.assign(new Error('fs non disponibile nell\'anteprima'), { code: 'ENOENT' }); }

module.exports = { appendFileSync, mkdirSync, existsSync, readFileSync };
