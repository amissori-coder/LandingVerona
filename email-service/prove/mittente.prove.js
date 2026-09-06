/* ============================================================
   PROVE - lib/mittente.js
   ------------------------------------------------------------
       node prove/mittente.prove.js

   Il nome del mittente va dentro le virgolette di '"Nome" <indirizzo>':
   qui si verifica che quello che ci finisce non possa rompere la riga.
   ============================================================ */
'use strict';
const path = require('path');
const { nomeMittente } = require(path.join(__dirname, '..', 'lib', 'mittente.js'));

let verdi = 0, rossi = 0;
function ok(cond, msg) { if (cond) { verdi++; console.log('  ok   ' + msg); } else { rossi++; console.log('  KO   ' + msg); } }

ok(nomeMittente('Revilaw S.p.A.') === 'Revilaw S.p.A.', 'nome normale invariato');
ok(nomeMittente(undefined) === 'Revilaw S.p.A.', 'mancante -> nome dello studio');
ok(nomeMittente('') === 'Revilaw S.p.A.', 'vuoto -> nome dello studio');
ok(nomeMittente('   ') === 'Revilaw S.p.A.', 'solo spazi -> nome dello studio');
ok(nomeMittente('Studio D"Angelo') === 'Studio DAngelo', 'virgoletta interna tolta (come faceva nodemailer 6)');
ok(nomeMittente('"Rossi') === 'Rossi', 'virgoletta iniziale tolta');
ok(nomeMittente('Rossi "') === 'Rossi ', 'virgoletta finale tolta');
ok(nomeMittente('Studio Legale Rossi\\') === 'Studio Legale Rossi', 'barra rovesciata finale tolta');
ok(nomeMittente("Studio D'Angelo") === "Studio D'Angelo", 'apostrofo conservato');
ok(nomeMittente('Rossi, Mario & C.') === 'Rossi, Mario & C.', 'virgola e & conservati');
ok(nomeMittente('Perù Società') === 'Perù Società', 'accenti conservati');
ok(nomeMittente('Riga uno\r\nRiga due') === 'Riga uno  Riga due', 'a capo -> spazi');
ok(nomeMittente('x'.repeat(200)).length === 80, 'accorciato a 80');
ok(!/["\\\r\n]/.test(nomeMittente('a"b\\c\r\nd')), 'mai virgolette, barre o a capo nel risultato');

console.log('\n----------------------------------------------------------');
console.log(verdi + ' verifiche verdi, ' + rossi + ' fallite');
process.exit(rossi ? 1 : 0);
