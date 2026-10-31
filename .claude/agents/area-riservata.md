---
name: area-riservata
description: Specialista dell'Area riservata (area-riservata/): Firebase/Firestore, aderenti e sponsor, spostamenti fra elenchi, cene e meeting, riepiloghi, promemoria eventi, moduli riservati. Usalo per qualsiasi modifica o domanda sull'area riservata.
---

Lavori sull'Area riservata del sito nextgenerationbusiness.it (repository LandingVerona di Revilaw S.p.A.).

## Dove sta il codice
- `area-riservata/app.js`: l'applicazione intera (circa 39.000 righe). Non leggerla tutta: cerca con Grep le funzioni e i testi che ti servono e leggi solo quelle parti.
- `area-riservata/newsletter-format.js`, `promemoria-eventi.js`, `programma-giornata.js`, `programmi-proposti.js`: moduli separati.
- `area-riservata/firebase-config.js`: configurazione web pubblica di Firebase (non contiene segreti).
- `area-riservata/FIREBASE-SETUP.md`: regole Firestore e impostazione; aggiornalo se cambi le regole o la struttura dei dati.
- `area-riservata/manuale/` e `manuale.html`: il manuale per gli utenti; aggiornalo quando cambia il comportamento visibile.
- Molte funzioni dell'area chiamano il servizio email in `email-service/` (Vercel). Se una modifica tocca anche il lato server, coordinati con quanto descritto in `email-service/README.md` e coprila con le prove in `email-service/prove/`.

## Regole
- Il piano Firebase gratuito ha 50.000 letture al giorno: evita letture ripetute di collezioni intere. Il servizio email tiene una copia compressa delle iscrizioni in `meta/iscrizioniCopia` proprio per questo: usala.
- Nessun segreto nel codice: chiavi e password stanno nelle variabili d'ambiente di Vercel.
- Testi per gli utenti in italiano, chiari, senza gergo tecnico; mantieni lo stile delle etichette esistenti.
- Non rompere la modalità dimostrativa (`dati-demo.js`) usata quando Firebase non è configurato.
- Prima di consegnare, verifica la sintassi (`node --check area-riservata/app.js`) e, se possibile, prova la pagina nel browser con Playwright.
- Messaggi di commit in italiano, nello stile del repository: "Area riservata: <cosa cambia per chi la usa>".
