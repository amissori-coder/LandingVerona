/* ANTEPRIMA - la prova del link VERA (email-service/lib/diretta-prova-link.js)
   con la web TV finta dell'anteprima al posto della rete (webtv-finta.js).
   costruisci.js fa arrivare qui ogni require di diretta-prova-link. */
'use strict';
const PL = require('../../../../email-service/lib/diretta-prova-link.js');
const W = require('./webtv-finta');

module.exports = Object.assign({}, PL, {
    provaLink(link, opzioni) {
        return PL.provaLink(link, Object.assign({ fetch: W.fetch, lookup: W.lookup }, opzioni || {}));
    }
});
