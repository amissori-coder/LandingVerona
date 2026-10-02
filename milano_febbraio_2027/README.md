# Next Generation Business — Milano, venerdì 26 febbraio 2027

Piano di lavoro tecnico, scritto il 2 ottobre 2026. La pagina non esiste ancora: per ora questa cartella contiene solo il piano. Il modello è Napoli (`napoli_ottobre_2026/`), l'evento più completo: pagina, modulo verso il servizio, diretta, incontri B2B, cene, badge con QR, accredito al desk, promemoria.

Mancano 147 giorni. Napoli è nata a 94 giorni dall'evento e ha richiesto circa 1.050 commit e 276 PR in tre mesi, quasi tutti per costruire l'infrastruttura (servizio iscrizioni, promemoria, B2B, diretta, desk). Quella infrastruttura oggi esiste: per Milano è configurazione, non sviluppo. Ordine di grandezza: 12-16 giornate di lavoro tecnico spalmate su 21 settimane, più i contenuti.

## 1. Le quattro chiavi, da fissare prima di scrivere qualsiasi cosa

| Chiave | Valore proposto | Chi la usa |
| --- | --- | --- |
| Cartella della pagina | `milano_febbraio_2027/` | il modulo la manda al servizio come `percorso`; la diretta abbina l'iscrizione all'evento cercando le parole della cartella (milano, febbraio, 2027) nell'etichetta del modulo (`email-service/lib/diretta-iscrizione.js:248-265`); `conferma_email/index.html:128-131` ricostruisce l'indirizzo della pagina dall'etichetta |
| Etichetta del modulo (`PAGINA_NGB`) | `Milano 26 Febbraio 2027 - Manifestazione di interesse` | la parte prima del trattino è la chiave evento del servizio (`email-service/api/iscrizione-nuova.js:457-461`); la parola "Milano" è il filtro dell'area riservata e fa partire la conferma automatica (`RE_PAGINA_EVENTO`, riga 96, che Milano già comprende) |
| Id dell'evento | `milano-2027-02-26` | area riservata (`EVENTI_DEF`), presenze, agenda e prenotazioni B2B, programma, promemoria, codici invito, desk; la data in coda all'id è un dato: `api/promemoria-eventi.js:197-199` la legge per calcolare la fine dell'evento |
| Id della diretta | `milano-2027` | gestione della diretta e `assets/diretta-stato.js`; la gestione lo propone da luogo e anno (Napoli: `napoli-2026`); non è legato agli altri tre, il ponte è la "pagina dell'evento" |

Se cartella ed etichetta non combaciano (per esempio un'etichetta "Milano 2027"), la password automatica della diretta e il pulsante della conferma email si rompono senza alcun errore.

## 2. Da correggere subito: Milano è già nel repo, con la data sbagliata

- `area-riservata/app.js:15488`: la voce Milano in `EVENTI_DEF` dice `milano-2027-02-27`, "27 febbraio 2027", che è un sabato. Portarla a `milano-2027-02-26`, "26 febbraio 2027", giorno `2027-02-26`, pagina `Milano 26 Febbraio 2027`; completare luogo (Excelsior Hotel Gallia), indirizzo (Piazza Duca d'Aosta 9, Milano), `urlPagina`, sottotitolo, `scadenzaB2B` (dentro il 2027: la funzione prende l'anno dal giorno dell'evento) e il blocco `invito`. Va fatto prima che nasca qualunque documento (presenze, agenda, promemoria) sotto l'id sbagliato. Dal 3 ottobre l'area riservata apre da sola la scheda Milano.
- `index.html:356-392`: la card Milano in home è un segnaposto con `data-event-date="2027-02-28"`. Portarla al 26; diventa un link solo quando la pagina esiste.
- Fuso orario: Napoli era in ora legale (+02:00), Milano è in ora solare (+01:00). Punti con +02:00 scritto a mano: `event:start_time`/`end_time` e JSON-LD della pagina; `assets/diretta-stato.js:56-57`; `email-service/api/promemoria-eventi.js:201` (`fineEvento`); il `TERMINE` delle cene in `lib/cene-evento.js`; i cron di `email-service/vercel.json:7-11`, scritti in UTC e tarati sull'estate (a febbraio le mail "delle 8" partono alle 7 e quelle "delle 22" alle 21); le prove che li verificano (`promemoria-eventi.prove.js:609-610` e `diretta/prove/sito.prova.js`, 58 righe con +02:00).

## 3. Che cosa è già pronto (nessun codice)

- Area riservata: schede, iscritti con le sezioni, presenze, importazione, inviti e sponsor, agenda B2B, programma della giornata, gruppi newsletter, avviso nuovi iscritti. Tutto legge l'evento da `EVENTI_DEF` e chiama il servizio con `evento: ev.id`.
- Incontri B2B a slot: `agenda-b2b.js`, `agenda-modello.js`, `orari-b2b.js`, `chiavi-azienda.js` e `incontri_b2b/index.html` sono per evento. Dalla sezione Eventi si salvano giornata, tavoli e referenti e nasce `b2bAgenda/milano-2027-02-26`. Attenzione: `GIORNATA_PREDEFINITA` (`agenda-modello.js:72`) è la giornata di Napoli; salvare quella di Milano prima di aprire le prenotazioni.
- Codici invito e campagne alle aziende (PEC ed email): generici, etichetta `invito-<evento>`; un codice di Napoli non vale per Milano.
- Diretta: multi-evento dalle fondamenta. L'evento si crea da `/diretta/gestione/` (identificativo, titolo, luogo, data, orari, tipo di player, programma, pagina dell'evento, promemoria). Firebase, regole, indici, Vercel e cron non si toccano. Chi aveva già la password di Napoli riceve solo "Sei iscritto anche a…".
- Conferma dell'indirizzo email, newsletter, richiesta contatto, completa iscrizione, ebook: generici.
- Promemoria: il motore è per evento; vanno scritti solo i testi (punto 4).

## 4. Che cosa va aggiunto accanto a Napoli

Aggiungere, non sostituire: così le 34 prove del servizio restano verdi.

| File | Che cosa c'è | Per Milano |
| --- | --- | --- |
| `email-service/lib/conferma-email.js:58-60` | `DETTAGLI_EVENTO`: data, orario e sede della mail "Il tuo invito" e del PDF | voce `/milano/i` con venerdì 26 febbraio 2027, orario, Excelsior Hotel Gallia, Piazza Duca d'Aosta 9. Senza, l'invito esce senza giorno e sede |
| `email-service/lib/accredito-desk.js:64-72, 114` | `EVENTI` del desk (pagina, filtro, finestra dal/al), `EVENTO_PREDEFINITO`, variabile `PRESENZA_NAPOLI_CHIAVE` | voce Milano con finestra 19-27 febbraio 2027; generalizzare il nome della chiave (`PRESENZA_DESK_CHIAVE` oppure un campo per evento); variabile su Vercel in Production prima di stampare il cartello |
| `email-service/lib/cene-evento.js:57-86, 177, 268` | `CENE`, `TERMINE` globale e due frasi con "27 settembre" scritte a mano | solo se ci saranno cene: voci con termine proprio in +01:00; derivare le due frasi dalla scadenza |
| `email-service/lib/temi-b2b.js:54-117` | `AREE_B2B`: i 13 tavoli di Napoli, elenco unico per tutti gli eventi, letto per indice | tavoli nuovi (per esempio "Intelligenza artificiale per le PMI") solo in coda, con id stabili; replicare in `area-riservata/newsletter-format.js:1558-1592`, `incontri_b2b/index.html:261-285` e nell'ORDINE di `prove/tavoli-b2b.prove.js` |
| `area-riservata/promemoria-eventi.js:142` | `PROPOSTE`: le 10 mail di Napoli (6 in sala, 4 online), circa 200 righe | chiave `milano-2027-02-26` con i testi di Milano (circa 60 stringhe cambiano davvero) e una costante `MILANO` accanto a `NAPOLI` (righe 97-117) |
| `area-riservata/programmi-proposti.js:83` | la scaletta di Napoli, 14 voci | voce Milano quando il programma esiste |
| `area-riservata/app.js:19663-19667, 19767` | `EVENTI_CON_CENE`, `CENE_PAGINE` e il termine "entro domenica 27 settembre" scritto a mano | solo con le cene; il termine va derivato da `d.cena.scadenza` |
| `area-riservata/app.js:25563-25564` | frase sui temi della giornata nell'apertura dell'invito | spostarla nei dati dell'evento |
| `area-riservata/app.js:28688-28712` | `PAGINE_SITO`, le pagine proposte nella newsletter | aggiungere `/milano_febbraio_2027/` quando è online |
| `area-riservata/newsletter-format.js:2486` | titolo di riserva "Ci vediamo a Napoli" | togliere il ripiego |
| `email-service/api/iscrizioni.js:340` | evento predefinito `'napoli'` quando il chiamante non passa l'evento | innocuo (l'area riservata passa sempre l'evento); meglio un errore esplicito |

## 5. Che cosa va duplicato

### La pagina

Partire dalla pagina attuale di Napoli, non dalla prima versione del 30 giugno: il modulo (`index.html` dalla riga 1029) e `script.js` (righe 169-170, 208-213, 367, 395, 423-450) sono accoppiati, e la versione del 30 giugno scriveva ancora sul foglio Google.

1. `cp -r napoli_ottobre_2026 milano_febbraio_2027`, senza il PDF.
2. `script.js`: `eventDate` (riga 47) a `2027-02-26T09:00:00+01:00`, `PAGINA_NGB` (riga 170) all'etichetta, le 12 frasi `REL` (564-585). Endpoint e `percorso` non si toccano.
3. `index.html`: title, meta, og e twitter (8-44), canonical e url (18, 27, 42), `event:*` (37-38), JSON-LD `BusinessEvent` (56-150: sede Excelsior Hotel Gallia, Piazza Duca d'Aosta 9, 20124 Milano MI, sponsor vuoti) e Breadcrumb (162), hero (205-281), L'Evento (331-350), Sede (925-977, con la mappa nuova), footer.
4. Riportare il modulo allo stato "sala aperta". Napoli è in "sala esaurita": modalità fissa `online` alla riga 1030, lista d'attesa alla 1031, avviso alle 993-1000, casella aderente spenta alle 1043-1054, tendina degli incontri spenta alle 1154-1167. Nuovo elenco `interessi` (1172-1213) coerente con i tavoli decisi (punto 7).
5. Togliere, o ridurre a segnaposto, le sezioni senza contenuti: video (353-370), percorso (374-521), statistiche e b2b-callout (533-556), timeline (564-845), i due pulsanti del PDF (274, 1022), la sezione Diretta (294-328) finché non è decisa. Partner ridotta a "A cura di Revilaw". Menu adeguato alle sezioni rimaste.
6. `styles.css` copiato intero (non è uguale a Roma: 990 righe diverse). Un logo nuovo è una classe in quattro blocchi (2114-2251, 2832-2912, 3067-3147, 3192-3228).
7. Home: la card Milano da `div` a `<a href="milano_febbraio_2027/">`, con il blocco `event-collab--multi` di Napoli (328-345) per i partner; `sitemap.xml` dopo la riga 53; `assets/event-banner.js` solo se si vuole il banner sulle 32 pagine di contenuto (per Napoli non è stato usato).

### Desk, agende, cene, badge

- `p27/` da `p26/` (PAGINA ed EVENTO alle 362-363, testi, interessi 319-326). PAGINA deve essere esattamente l'etichetta del modulo.
- `n27/` da `n26/`, con collezione `agendaMilano` (riga 560) e chiave localStorage (431). Regola Firestore da incollare a mano nella console del progetto `revilaw-incarichi`:

  ```
  match /agendaMilano/{codice} {
    allow get: if true;
    allow list: if false;
    allow write: if false;
  }
  ```

  Nessun'altra regola: tutto il resto lo scrive il servizio con l'Admin SDK.
- `cene_milano/` da `cene_napoli/` solo se ci saranno cene (`window.CENA` con gli id nuovi; `modulo.js` e `stile.css` sono generici).
- `badge-milano/` da `badge-napoli/` (BASE `/n27/#` in `prepara.js:37`, COLLEZIONE in `pubblica.js:33`, PAGINA `/p27/` in `cartello.js:29`, nome della variabile chiave alla 40), oppure un `badge-eventi/` con un file di configurazione per evento. In ogni caso replicare le esclusioni di `.gitignore:3-9`: senza, al primo `git add` nomi, email e codici personali finiscono nel repo pubblico. Il registro `out/codici.json` riparte da zero.
- `robots.txt`: `Disallow` per `/n27/`, `/p27/`, `/cene_milano/` accanto alle righe 21, 25, 29. Niente sitemap per queste pagine.
- Nota: l'agenda da badge (`n26`: tavolo di partenza, turni da 15 minuti) è il modello B2B vecchio; non c'è un ponte da `b2bPrenotazioni` a `partecipanti.json`. Decidere se serve ancora o se basta l'agenda a slot con il foglio PDF per azienda.

## 6. Il sito pubblico mostra una diretta alla volta

`assets/diretta-stato.js:52-78` ha un solo `EVENTO` e l'interruttore `PUBBLICA`; governa pillola e popup della home e le voci "Diretta" della pagina evento. In ordine:

1. La pagina di Napoli carica lo stesso script (`napoli_ottobre_2026/index.html:1421`) e lo script non confronta il percorso: appena `EVENTO` diventa Milano con `PUBBLICA = true`, la pagina di Napoli riaccende "Segui la diretta" puntando a Milano. Prima togliere quel tag dalla pagina di Napoli e adeguare `diretta/prove/sito.prova.js:310`.
2. Poi `EVENTO` di Milano (id `milano-2027`, inizio e fine in +01:00, `pagina`, `urlIscrizione`), con `PUBBLICA = false` fino alla prova generale.
3. `assets/diretta-popup.js`: sei testi con "Napoli" scritti a mano (91-109) e due etichette Analytics (405, 414): usare `EVENTO.citta`.
4. `diretta/config.js:42` (link di iscrizione) e i `?v=` in `index.html:1332-1333`, `diretta/index.html:37`, `diretta/reimposta.html:19`.
5. In gestione: evento `milano-2027` con "pagina dell'evento" `/milano_febbraio_2027/`; "Invia la password a chi si iscrive dal modulo" spento finché non è caricata la prima lista.
6. Prima dell'evento: domande ad Azoto (`diretta/README.md` §5.8: dominio, 1000 spettatori, p2p, .m3u8), prova su iPhone, Android, Chrome, Edge e Firefox, prova di carico (`diretta/prove/carico.sh`: 1000 accessi in 2 minuti sugli emulatori; poi 300 accessi sul progetto vero la settimana prima), "Torna alla fase iniziale" prima della finestra del promemoria del giorno prima.

## 7. Il modulo: cinque copie dell'elenco dei tavoli

Le caselle `interessi` del modulo (e quelle del desk) sono lette dal servizio per indice: `indiciDaInteressi` (`iscrizione-nuova.js:328-341`) normalizza l'etichetta e la cerca in `TEMI_B2B`. L'elenco vive in cinque posti: `temi-b2b.js`, `newsletter-format.js`, `incontri_b2b/index.html`, le caselle della pagina evento, le caselle di `p26`. Un `value` sbagliato di una lettera non dà errore: produce preferenze vuote per tutti gli iscritti (a Napoli due voci su otto non mappavano). Da fare: una prova in `tavoli-b2b.prove.js` che legge i `value` dei moduli e pretende che stiano in `TEMI_B2B` o negli alias; esportare `normalizzaTema`.

Campo nuovo per Milano: cellulare WhatsApp con consenso dedicato e verifica con un codice inviato su WhatsApp (stesso schema della conferma dell'indirizzo email). Lato servizio: whitelist dei campi in `iscrizione-nuova.js:1506`, `CAMPI_MATCHING` in `iscrizioni.js:97-132`, riga nella scheda in `app.js:22263`, una funzione di invio verso l'API WhatsApp di Brevo (account WhatsApp Business dedicato, modelli approvati da Meta). I promemoria per evento guadagnano così un secondo canale.

## 8. Prove

- `email-service/prove`: 34 file; `cd email-service && npm ci && node prove/<nome>.prove.js` (nessuno script `npm test`, nessuna rete). Oggi 34/34 verdi, 2.471 verifiche. Aggiungendo Milano accanto a Napoli nei registri restano verdi; sostituendo Napoli si rompono `accredito-desk`, `cene-evento`, `conferma-email` (riga 187) e le prove 20-21 di `promemoria-eventi`.
- Prove nuove: casi Milano in `accredito-desk`, `conferma-email`, `promemoria-eventi` (cron in ora solare: `o - 1`), la coppia etichetta/cartella in `diretta-email` e `diretta-accesso-tempi`, la prova sui `value` del modulo.
- `diretta/prove`: 24 prove con emulatori Firebase (Java), Playwright/Chromium e ffmpeg; `node esegui-tutte.js` dura circa 25 minuti. `sito.prova.js` ha 68 righe legate a Napoli: va riscritta nello stesso commit di `diretta-stato.js`, o generalizzata su `D.EVENTO`. `modulo.prova.js` da duplicare per Milano con un commit di riferimento e una data in +01:00.
- Nessun workflow esegue le prove: sono manuali. Valutare un runner unico (i riepiloghi hanno quattro formati diversi).

## 9. Buchi da chiudere a prescindere da Milano

1. Backup notturno: copre solo il progetto Firebase dello studio (`revilaw-incarichi`). Il progetto della diretta `ngb-eventi` (account e password, eventi, chiavi dei link firmati, presenze, accessi, ascolti) non ha nessuna copia automatica, e "Torna alla fase iniziale" cancella in modo irreversibile. Riguarda già i dati vivi di Napoli. Mezza giornata: app con nome in `scripts/backup/esegui-backup.cjs` (come fa `email-service/lib/diretta-firebase.js`), segreto GitHub `DIRETTA_FIREBASE_SERVICE_ACCOUNT`, riga nel blocco env di `backup-notturno.yml:88`. Intanto, a mano: Esporta dalla gestione prima e dopo ogni evento.
2. Home dopo il 2 ottobre: lo script di root cambia solo le classi della card di Napoli ("Evento concluso", "Rivedi l'evento") ma non la sposta in "Eventi passati" e non aggiorna i contatori scritti a mano (`index.html:302` e `395`). Da fare a mano.
3. Pagina post evento (video, interviste): esiste solo per Verona, tutta scritta a mano (release `media-interviste-verona-2026`, agganci in home, mappa, sitemap, CI). Per Napoli non c'è nulla; per Milano è una copia, circa una giornata a video pronti. La pagina `/diretta/` rifiuta i file .mp4: la registrazione dello streaming va su una release e dentro la pagina evento.

## 10. Calendario tecnico a ritroso

| Entro | T | Che cosa |
| --- | --- | --- |
| 9 ottobre | T-140 | correggere data e id (punto 2); backup di `ngb-eventi`; card Napoli fra gli eventi passati; esportazioni della diretta di Napoli |
| 30 ottobre | T-119 | pagina `milano_febbraio_2027/` online come save the date; card in home; sitemap; `DETTAGLI_EVENTO` nel servizio; voce Milano completa nell'area riservata |
| 30 novembre | T-88 | modulo aperto in modalità presenza (interessi coerenti con i tavoli decisi, campo WhatsApp e consenso); invio di prova e cancellazione della scheda |
| 12 dicembre | T-76 | account WhatsApp Business collegato a Brevo con i modelli approvati; evento `milano-2027` creato in gestione (`PUBBLICA = false`); prima campagna di inviti con codici |
| 15 gennaio | T-42 | tavoli B2B decisi e replicati nei cinque elenchi; agenda salvata; pagina degli inviti B2B; le 10 mail di promemoria scritte; prove del servizio verdi |
| 29 gennaio | T-28 | programma in `programmi-proposti.js`; brochure PDF in pagina; sponsor e loghi; script della diretta tolto dalla pagina di Napoli ed `EVENTO` su Milano |
| 8 febbraio | T-18 | promemoria programmati; prova di carico della diretta; `p27`, `n27`, regola Firestore e chiave Vercel pronti |
| 12 febbraio | T-14 | cene, se previste; prova generale della diretta su telefoni e browser |
| 19 febbraio | T-7 | chiusura dell'elenco per i badge; `prepara`, `pubblica`, cartello; `PUBBLICA = true`; popup in home |
| 25 febbraio | T-1 | Esporta dalla gestione; "Aggiorna esiti"; promemoria del giorno prima |
| 26 febbraio | 0 | evento; Regia: Vai in onda, Pausa, Termina, Esporta |
| 27 febbraio | T+1 | esportazioni finali; card in home fra gli eventi passati; chiedere ad Azoto di spegnere il canale |

## 11. Stime

| Sottosistema | Lavoro |
| --- | --- |
| Pagina save the date | 1 giornata (mezza meccanica, mezza di testi) |
| Home, sitemap, robots, banner | 1-2 ore; diretta lato home 1-2 ore |
| Servizio email (tabelle, desk, cene, tavoli, README) | 1-2 giornate |
| Area riservata (dati), promemoria (testi), scaletta | mezza giornata, 1-2 giornate di testi, mezza giornata |
| Diretta (sito, configurazione, prove) | mezza giornata di codice; 2-3 mezze giornate operative nelle ultime due settimane |
| Desk, agende, cene, badge | 1-1,5 giornate (mezza senza cene e badge QR) |
| Modulo e prova sui tavoli | 3-4 ore |
| Prove (copertura Milano, `sito.prova.js`, `modulo.prova.js`) | 3-4 giornate |
| Backup della diretta | mezza giornata |
| WhatsApp (campo, consenso, verifica, invio via Brevo) | 1-2 giornate, più i tempi di Meta |
| Pagina post evento | 1 giornata, dopo l'evento |

Totale: 12-16 giornate di lavoro tecnico, più i contenuti (programma, relatori, loghi, PDF, video).

## 12. Decisioni tecniche da prendere

- Si tengono diretta, incontri B2B, cene, badge con QR, accredito al desk? Ognuno porta cartelle, chiavi e regole.
- Orario della giornata: determina countdown, meta, JSON-LD, invito PDF, diretta, giornata B2B.
- Tavoli B2B: i 13 di Napoli, un sottoinsieme, uno o due tavoli sull'IA in più?
- Chiave del desk: una variabile condivisa rinominata o una per evento.
- Generalizzare o duplicare: `diretta-stato.js` e popup (`EVENTO.citta`), serie dei promemoria (funzione parametrica), `badge-eventi`, `n27` con mappa percorso -> collezione. Con un evento all'anno la copia è la via meno rischiosa; con due all'anno la generalizzazione ripaga.
- Cron dei promemoria: spostare le cinque righe per l'ora solare o scrivere il calendario con le ore reali.
- Foglio Google: Milano senza foglio, come Napoli (consigliato).
- Immagine OG dedicata; crediti formativi presso l'ODCEC di Milano; video di presentazione (release `media-milano-2027`).

## 13. Verifica prima di pubblicare

- `python3 -m http.server` dalla radice e aprire `/milano_febbraio_2027/`: countdown, ancore del menu, loghi, nessun 404.
- Invio di prova dal modulo con un indirizzo di prova: il servizio deve rispondere ok, la scheda deve comparire nell'area riservata sotto "Milano 26 Febbraio 2027", la conferma deve arrivare con data e sede; poi cancellare la scheda, perché l'invio scrive su Firestore e manda email vere via Brevo.
- JSON-LD con il Rich Results Test di Google.
- `node prove/<nome>.prove.js` per le prove toccate; `node diretta/prove/sito.prova.js` a ogni ritocco di `diretta-stato.js`.
- Push su main: GitHub Pages pubblica da solo in 1-2 minuti; Vercel pubblica il servizio da solo.
