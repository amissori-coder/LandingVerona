#!/bin/bash
# Prova di carico completa: emulatori + server locale + carico.prova.js, poi spegne tutto.
# Uscita in risultati/carico-uscita.txt, numeri in risultati/carico.json.
cd "$(dirname "$0")"
node avvia-emulatori.js --firestore 8780 --auth 9780 > risultati/carico-emulatori.log 2>&1 &
EMU=$!
for i in $(seq 1 60); do grep -q PRONTI risultati/carico-emulatori.log && break; sleep 2; done
DIRETTA_POSTA_FINTA=$PWD/risultati/posta-carico.jsonl node server-locale.js --api 3780 --statico 8790 --firestore 8780 --auth 9780 > risultati/carico-server.log 2>&1 &
SRV=$!
for i in $(seq 1 30); do grep -q PRONTO risultati/carico-server.log && break; sleep 1; done
node carico.prova.js --api 3780 --firestore 8780 --auth 9780 > risultati/carico-uscita.txt 2>&1
echo "USCITA $?" >> risultati/carico-uscita.txt
kill $SRV; kill -INT $EMU; sleep 3; pkill -f "firestore.*8780" ; true
