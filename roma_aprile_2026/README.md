# Next Generation Business — Roma (29 Aprile 2026)

Landing page per l'evento **"Le novità su ZLS e Rating di Legalità"**, organizzato da Revilaw S.p.A. e Advant Nctm, Roma, 29 Aprile 2026.

Questa cartella è **pronta per il deploy** su GitHub Pages come sottocartella del dominio principale:

```
https://nextgenerationbusiness.it/roma_aprile_2026/
```

## 📂 Struttura

```
roma_aprile_2026/
├── index.html              # landing page
├── styles.css              # stili (Montserrat + Inter, palette Revilaw/Advant)
├── script.js               # Lenis smooth scroll, countdown, validazione form
└── assets/
    ├── logo-revilaw.png        # logo Revilaw (versione navy per sfondi chiari)
    ├── logo-revilaw-mark.png   # marchio "R" Revilaw (versione bianca per navbar scura)
    ├── logo-advant-nctm.png    # logo Advant Nctm
    ├── logo-unindustria.png    # logo Unindustria (patrocinio)
    └── logo-sole24ore.png      # logo Gruppo Il Sole 24 Ore (media partner)
```

## 🚀 Come deployarla nel repository principale

### Opzione A — GitHub Desktop (consigliata)

1. Clona il repository principale (quello che possiede il dominio `nextgenerationbusiness.it`) in locale
2. **Copia l'intera cartella `roma_aprile_2026/`** di questo repo dentro il repository principale, alla root
3. Verifica che la struttura del repository principale ora sia:
   ```
   CNAME
   index.html                       (landing root, se presente)
   verona/                          (sito Verona già caricato)
   roma_aprile_2026/                (appena copiato)
     ├── index.html
     ├── styles.css
     ├── script.js
     └── assets/
   ```
4. Commit con messaggio: `Add Roma April 2026 event site`
5. Push su `main`
6. Attendi 1-2 minuti che GitHub Pages completi il deploy

### Opzione B — Via web GitHub

1. Vai sul repository principale, entra nella root
2. Clicca **"Add file" → "Upload files"**
3. Trascina **l'intera cartella `roma_aprile_2026/`** di questo repo nella zona di upload (il browser la espanderà ricorsivamente)
4. Commit direttamente dalla pagina

## ✅ Verifica post-deploy

Apri in **finestra in incognito** per evitare cache:

- `https://nextgenerationbusiness.it/roma_aprile_2026/`

Dovresti vedere la landing page completa con tutti i loghi, la countdown funzionante e il form di iscrizione.

## 🛠 Tecnologie usate

- **HTML5 + CSS3 + vanilla JavaScript** (nessun build step necessario)
- **Lenis 1.1.20** per lo smooth scrolling (caricato da CDN unpkg)
- **Montserrat + Inter** (Google Fonts)
- **Percorsi completamente relativi** — il sito funziona da qualsiasi sottocartella senza modifiche
