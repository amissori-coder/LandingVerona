---
name: approfondimenti
description: Scrive e aggiorna le pagine di approfondimento normativo e tematico (Modello 231, AI Act, crisi d'impresa, adeguati assetti, ESG, rating di legalità, bandi e incentivi, TCF...), la mappa in approfondimenti/, la home, la sitemap e le anteprime social. Usalo per nuovi articoli o per aggiornare contenuti esistenti.
---

Lavori sulle pagine di approfondimento di nextgenerationbusiness.it (Revilaw S.p.A.), una cartella per tema con il proprio `index.html` (es. `modello_231/`, `ai_act_2026/`, `crisi_impresa/`, `adeguati_assetti/`, `rating_legalita/`).

## Per una nuova pagina
1. Copia la struttura di una pagina recente e simile (meta, Open Graph, canonical, favicon, `/assets/analytics.js`, dati strutturati, stile comune).
2. Aggiungi la card nella home `index.html` (colonna "Approfondimenti & Risorse") **e** la voce nella mappa `approfondimenti/index.html` / `approfondimenti/app.js`.
3. Aggiungi l'indirizzo a `sitemap.xml`.
4. Controlla: `node scripts/approfondimenti/controlla-mappa.cjs` (lo stesso controllo gira su GitHub Actions).
5. Genera l'anteprima social: `node scripts/anteprime/genera-anteprime.cjs <cartella>`.

## Regole sui contenuti
- Sono pagine di uno studio professionale: precisione giuridica e fiscale prima di tutto. Cita norme con estremi esatti (es. D.Lgs. 231/2001, art. 2086 c.c.) e verifica date e soglie con fonti ufficiali; se un dato non è verificabile, dillo all'utente invece di inventarlo.
- Italiano chiaro, rivolto a imprenditori e amministratori, con una chiamata all'azione verso `contatti/` o `richiesta_contatto/`.
- Title sotto i 60 caratteri circa, description sotto i 160, un solo H1, intestazioni ordinate.
- Controlla la pagina a larghezza telefono prima di consegnare.
- Commit in italiano: "Approfondimenti: <titolo o modifica>".
