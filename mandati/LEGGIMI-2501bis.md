# Mandato — Relazione ex art. 2501-bis, comma 5, c.c. (fusione inversa SPV SIEM / SIEM)

Proposta di incarico per la relazione del revisore legale da allegare al progetto di
fusione per incorporazione di SPV SIEM S.r.l. in SIEM S.r.l. (MLBO ex art. 2501-bis c.c.).
Il fascicolo è costruito **sul modello ufficiale Revilaw** (`Incarico_att_v2026`): grafica,
prime pagine e pagine finali sono quelle del modello; è sostituito solo il contenuto
dell'incarico.

## Struttura del fascicolo (23 pagine)

| Pagine | Contenuto | Origine |
| --- | --- | --- |
| 1–2 | Presentazione Revilaw ("Oltre la Verifica, Verso il Valore") | modello, invariate |
| 3 | Frontespizio con logo — titolo sostituito: "Proposta di Incarico Professionale — Relazione ex art. 2501-bis, comma 5, c.c." | modello, solo titolo nuovo |
| 4–14 | Lettera di incarico 2501-bis nella grafica del modello (marchio in alto, footer centrato, sezioni numerate sottolineate, tabella corrispettivi con griglia) | contenuto nuovo |
| 15–18 | Scheda di identificazione del cliente / adeguata verifica D.Lgs. 231/2007 + obblighi del cliente | modello, invariate |
| 19–21 | Informativa privacy | modello, invariate |
| 22–23 | Moduli finali | modello, invariate |

## Struttura della lettera (sezioni)

- Destinatari (SIEM precompilata; SPV con campi), oggetto, premessa sull'operazione,
  "Oggetto dell'incarico" con esclusioni.
- **Sezioni 1–7** (contenuto specifico, testo già revisionato): natura dell'incarico
  (ISAE 3400, conclusioni in forma negativa), modalità di svolgimento, responsabilità
  degli organi amministrativi, personale/tempi/corrispettivi e fatturazione (50%
  all'accettazione, 50% alla consegna), coordinamento con l'esperto ex art.
  2501-sexies, documenti finali (consegna in tempo utile per il deposito ex artt.
  2501-ter co. 3 e 2501-septies, senza termine espresso), indipendenza.
- **Sezioni 8–13 e 15–18** (condizioni generali del modello, riprese alla lettera):
  riservatezza dei dati, carte di lavoro, comunicazioni elettroniche, accesso alla
  rete, normativa antiriciclaggio, salute e sicurezza, utilizzo di sistemi di IA,
  foro competente, modifiche, allegati.
- **Sezione 14** (specifica): interruzione dell'incarico e limitazione di
  responsabilità (tre volte il corrispettivo, manleva).
- Chiusura con doppia accettazione ex artt. 1341–1342 c.c.: approvazione specifica
  delle sole clausole onerose, enumerate con oggetto (nn. 3, 4, 6, 14 e 16), con un
  unico blocco firme per **entrambe** le Società.

## File

- `Mandato_2501bis_SIEM_SPV.pdf` — fascicolo ufficiale, **141 campi compilabili**
  invisibili come nel modello (il testo digitato appare sopra le linee).
- `Mandato_2501bis_SIEM_SPV.docx` — master Word del solo corpo lettera (campi
  evidenziati in grigio); le pagine di presentazione e gli allegati del modello
  restano nel PDF.

## Campi lasciati da compilare (o precompilati da rivedere)

| Campo | Stato |
| --- | --- |
| Pec SIEM; sede/C.f./Pec SPV | vuoti (dati cliente) |
| Luogo e data lettera | luogo precompilato "Verona", data vuota |
| Responsabile incarico | vuoto (riesame qualità e team non più indicati in lettera) |
| Tabella: ore/importi a-b-c | precompilati 24/36/20 h — € 4.500/6.750/3.750 (listino € 15.000) |
| Tabella: riga extra descrizione libera | vuota (come il modello) |
| Totale | sconto € 5.000 → 80 h — € 10.000 netti; tariffa € 187,50/h, effettiva € 125/h |
| Società di fatturazione | precompilata SIEM S.R.L. |
| Date accettazione | uniche editabili nella versione definitiva |
| Allegati N° | fisso: 2 |
| Scheda antiriciclaggio e privacy (pagg. 15–23) | campi del modello, invariati |

## Impostazione del compenso (razionale)

- Listino: 80 h × € 187,50/h = € 15.000; sconto di € 5.000 per il contestuale incarico di
  revisione → **€ 10.000 netti** (tariffa effettiva € 125/h) + spese vive + forfait 5% + IVA.
- Benchmark: 1,25 volte il corrispettivo annuo di revisione di SIEM (€ 8.000 da nota
  integrativa 2025); range di mercato coerente € 8.000–16.000.
- Nessun compenso condizionato all'esito (indipendenza ex art. 10 D.Lgs. 39/2010);
  extra a consuntivo per versioni successive del piano; indicazione in nota
  integrativa ex art. 2427, co. 1, n. 16-bis, c.c.

## Punti di attenzione (dalla revisione della bozza)

1. Mandato triennale di revisione su SIEM **in scadenza**: la legittimazione ex comma 5
   presuppone che Revilaw sia revisore in carica alla data della relazione — la lettera
   lo esplicita (premessa) e richiama l'eventuale rinnovo ex art. 13 D.Lgs. 39/2010.
2. VECTON S.p.A. risulta **già controllante** della SPV (debito verso controllanti nella
   situazione contabile): il "subentro" descritto è il passaggio al controllo diretto.
3. La **scissione immobiliare verso Kalisa Srl** (approvata il 16/02/2026) modifica il
   perimetro del patrimonio a garanzia del debito: richiamata in premessa e nell'esame
   del piano.
4. Conclusioni in **forma negativa** (ISAE 3400); esclusa ogni sovrapposizione con la
   relazione degli esperti ex artt. 2501-sexies / 2501-bis, co. 4.

## Versione definitiva

`build_fascicolo.py finale` genera la versione con i dati fissati come testo
(non modificabile fino a pag. 14, editabili solo le due date di accettazione;
le schede antiriciclaggio e privacy restano compilabili dal cliente).
