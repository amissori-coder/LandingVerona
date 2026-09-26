/* ANTEPRIMA - moduli che nell'anteprima non servono (nodemailer, firebase-admin):
   la posta e' quella finta e Firebase e' finto-firebase.js. Usarli e' un errore. */
'use strict';
function assente() { throw new Error('modulo non disponibile nell\'anteprima'); }
module.exports = { createTransport: assente, initializeApp: assente, apps: [] };
