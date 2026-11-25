# Prove delle regole del database

Le regole di sicurezza di Firestore (`area-riservata/firestore.rules`) decidono
chi legge e chi scrive che cosa nel database dell'area riservata. Qui si provano
sull'**emulatore** di Firebase, senza toccare il database vero e senza chiavi:
per ogni tipo di utente (amministratore, vice, responsabile qualita',
procuratore, coordinatore, marketing, ruolo su misura, revisore, collaboratori,
invitati al sondaggio, utente disabilitato, sconosciuto, senza accesso) si
tentano una sessantina di operazioni e si guarda se passano.

```
cd scripts/regole
npm install
npm run prova
```

Serve Java (lo usa l'emulatore). GitHub esegue la stessa prova a ogni modifica
delle regole: `.github/workflows/prova-regole.yml`.

## Che cosa controlla

1. **La guida e il file dicono la stessa cosa.** Le regole sono scritte in due
   posti: `area-riservata/firestore.rules` (il testo da incollare in console) e
   la guida `area-riservata/FIREBASE-SETUP.md`, che le spiega. Devono essere
   uguali.
2. **Il Revisore.** A chi ha il ruolo `revisore`, e al suo collaboratore, il
   database non consegna nessun archivio ne' l'elenco degli utenti, e non gli
   lascia scrivere nulla: i suoi dati glieli prepara il servizio email
   (`email-service/lib/revisore.js`), che gli passa solo quelli dei suoi
   incarichi. Gli restano la propria scheda utente, la definizione dei ruoli, i
   modelli e i messaggi privati.
3. **Tutti gli altri.** Ogni operazione di ogni ruolo deve dare l'esito scritto
   in `attesi.json`: e' una fotografia di 884 esiti. Se una modifica alle regole
   ne cambia anche uno solo, la prova si ferma e dice quale.

## La prova nel browser

`npm run prova-area` (prima, una volta: `npx playwright install chromium`) mette
insieme i pezzi veri: l'area riservata aperta in un browser, il servizio email
(`email-service/api`, con la posta finta) e il database di prova con le regole.
Controlla che:

- sullo stesso computer, dopo l'amministratore, un **revisore** si ritrovi nel
  browser solo i suoi incarichi (a video e in memoria), che leggendo il database
  da se' venga respinto, e che quello che scrive (l'accesso nel registro, una
  richiesta di correzione con la sua email) passi dal servizio;
- lo stesso valga per il collaboratore di un revisore, e che un equity partner
  entrato come revisore usi "Nuovi accessi" con l'elenco preparato dal servizio;
- chi non e' revisore lavori come prima;
- la **Prova la protezione** dell'amministratore dica "protezione attiva" con le
  regole vere e "protezione NON attiva" con regole a cui e' stata tolta la riga
  che tiene fuori il revisore;
- le altre porte del servizio (email libere, sblocco) lo tengano nel suo
  perimetro.

## Quando si cambiano le regole

1. Si modifica `area-riservata/firestore.rules` e si riporta lo stesso testo
   nella guida.
2. `npm run prova`: dice quali esiti sono cambiati.
3. Se il cambiamento e' voluto, `npm run aggiorna` rifa' la fotografia: il
   confronto di git su `attesi.json` mostra, riga per riga, che cosa e' cambiato
   e per chi. Va guardato prima di pubblicare.
4. Le regole provate qui sono quelle del repository: quelle in uso sono quelle
   **pubblicate nella console Firebase**. Dopo averle incollate si fa la prova
   vera dall'area riservata: Ruoli e permessi, scheda del ruolo Revisore,
   **Prova la protezione**.
