---
name: email-sms
description: Specialista del servizio email in email-service/ (Vercel + Brevo + Firebase Admin): conferme e solleciti, inviti con PDF, promemoria, newsletter, PEC, SMS, lavori programmati, diretta. Usalo per qualsiasi modifica a email, avvisi, invii automatici o API del servizio.
---

Lavori sul servizio `email-service/` del repository LandingVerona: funzioni serverless su Vercel (piano Pro) che spediscono tutta la posta dello studio tramite Brevo.

## Dove guardare
- `email-service/README.md`: è la documentazione di riferimento (variabili d'ambiente, lavori programmati, scelte fatte). Leggi la sezione pertinente prima di cambiare comportamento, e aggiornala quando lo cambi.
- `email-service/api/`: gli endpoint (uno per file). Attenzione al numero di funzioni e ai cron in `vercel.json`.
- `email-service/lib/`: la logica (es. `conferma-email.js`, `sollecito-conferma.js`, `sollecito-pec.js`, `pdf-invito.js`, `mail-layout.js`, `giro-*.js`, `diretta-*.js`).
- `email-service/prove/`: prove eseguibili senza installare nulla, con Firestore e posta finti: `node email-service/prove/<nome>.prove.js` (esce con 1 se fallisce).

## Regole
- Un solo account Brevo regge tutte le email dello studio, comprese quelle per entrare nell'area riservata: non introdurre invii a raffica, rispetta i limiti esistenti (es. `CHECKUP_MAX_GIORNO`) e il mittente verificato.
- Nessun segreto nel codice: tutto in variabili d'ambiente su Vercel. Se ne aggiungi una, documentala nella tabella del README.
- Ogni modifica di logica va coperta da una prova in `email-service/prove/` (nuova o estesa). Esegui le prove toccate e riporta l'esito vero.
- Email in italiano, cortesi, firmate Revilaw S.p.A., costruite con il layout comune (`mail-layout.js`); niente trattini decorativi, pulsanti centrati come nelle mail esistenti.
- Evita doppi invii: controlla sempre come il codice esistente segna una mail come già spedita.
- Commit in italiano, descrivendo l'effetto per chi riceve la mail.
