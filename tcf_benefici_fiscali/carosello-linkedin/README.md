# Carosello LinkedIn - Circolare 6/E del 2026

Carosello in tredici slide tratto dalla pagina
[`/tcf_benefici_fiscali/`](../index.html), da pubblicare su LinkedIn come
documento.

| File | Cosa contiene |
|------|---------------|
| `index.html` | Le tredici slide. Si apre nel browser per l'anteprima e si stampa in PDF |
| `carosello-tcf-circolare-6E-2026.pdf` | Il file da caricare su LinkedIn |
| `testo-del-post.md` | Testo del post, prima riga alternativa, commento e indice delle slide |
| `font/inter-latin-var.woff2` | Inter variabile, sottoinsieme latino (SIL Open Font License 1.1) |

## Formato

Le slide misurano 1080x1350 pixel, il rapporto 4:5 che LinkedIn mostra piu'
alto nel feed. La regola `@page` del foglio di stile fissa la pagina di stampa
esattamente su quella misura, quindi ogni slide diventa una pagina del PDF
senza margini ne' ridimensionamenti.

Il font e' caricato dalla cartella `font/` e non dal CDN di Google: il PDF si
genera con un browser headless che puo' non avere rete, e senza Inter
l'impaginazione delle slide cambierebbe.

## Rigenerare il PDF

Dopo ogni modifica a `index.html`:

```sh
chromium --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="carosello-tcf-circolare-6E-2026.pdf" \
  "$(pwd)/index.html"
```

Su macOS il binario e'
`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`; su Windows
`chrome.exe`. Va bene qualsiasi browser basato su Chromium: la stampa da
Safari o Firefox non rispetta la misura di pagina in pixel e ridimensiona le
slide su A4.

Stampando dal menu del browser, servono "Margini: nessuno" e "Grafica di
sfondo: attiva", altrimenti i fondi scuri delle slide escono bianchi.

## Se il testo sfora dalla slide

Le slide hanno altezza fissa e il contenuto che eccede finisce sotto al piede.
Per controllarlo senza guardare tutte le pagine a una a una, si misura in
pagina la distanza fra il fondo del corpo e la testa del piede: un valore fino
a una quindicina di pixel significa che la slide e' piena ma dentro i bordi,
valori piu' alti indicano lo sforamento.

```js
document.querySelectorAll('.slide').forEach(function (s, i) {
    var b = s.querySelector('.s-body').getBoundingClientRect();
    var f = s.querySelector('.s-foot').getBoundingClientRect();
    console.log(i + 1, Math.round(b.bottom - f.top));
});
```

## Pubblicazione

Su LinkedIn, dal post: "Aggiungi un documento", si carica il PDF e si dà un
titolo al documento (compare sopra alle slide nel feed). Un titolo che ha
funzionato: "Circolare 6/E del 2026: gli effetti premiali del TCF".

Il testo del post e il commento con il link stanno in `testo-del-post.md`.
