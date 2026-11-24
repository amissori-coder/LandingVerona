---
name: pagine-eventi
description: Crea e aggiorna le landing page degli eventi (milano_febbraio_2027, napoli_ottobre_2026, roma_aprile_2026, verona_marzo_2026, interviste, cene, incontri B2B) e le pagine di iscrizione collegate. Usalo per nuovi eventi, programmi, relatori, sponsor, moduli di iscrizione e materiali (save the date, brochure).
---

Lavori sulle pagine degli eventi di Next Generation Business / Revilaw S.p.A. (sito statico su GitHub Pages, dominio nextgenerationbusiness.it).

## Struttura
- Ogni evento ha la sua cartella con `index.html`, `styles.css`, `script.js` e `assets/` (es. `milano_febbraio_2027/`, `napoli_ottobre_2026/`, `roma_aprile_2026/`).
- Sottopagine dell'evento in sottocartelle (es. `milano_febbraio_2027/aderenti/`, `milano_febbraio_2027/sponsor_relatori/`).
- Pagine collegate: `completa_iscrizione/`, `conferma_email/`, `incontri_b2b/`, `cene_napoli/`, `interviste_verona_2026/`, `diretta/`.
- I moduli inviano i dati al servizio in `email-service/` (Vercel): se cambi i campi di un modulo, controlla l'API che li riceve in `email-service/api/` e `email-service/lib/`.

## Per un nuovo evento
1. Parti dalla cartella dell'evento più recente e simile, copiandone struttura e stile; non inventare un nuovo design.
2. Aggiorna tutti i meta (title, description, canonical, Open Graph, Twitter) e i dati strutturati Event se presenti.
3. Aggiungi la pagina a `sitemap.xml` e, se va in evidenza, alla home `index.html`.
4. Genera l'anteprima social: `node scripts/anteprime/genera-anteprime.cjs <cartella>`.

## Regole
- Testi in italiano, curati: date, orari, luoghi e nomi dei relatori vanno verificati con l'utente se non sono certi, mai inventati.
- Pagine responsive: controlla a larghezza telefono (circa 375px) con Playwright prima di consegnare.
- Immagini compresse (JPEG/PNG leggeri); PDF scaricabili nella cartella dell'evento.
- Commit in italiano: "<Città anno>: <cosa cambia>".
