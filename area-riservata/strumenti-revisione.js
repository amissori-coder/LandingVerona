/* =========================================================
   STRUMENTI DI REVISIONE (area riservata)
   ------------------------------------------------------------
   Il piano di revisione 2026 come nel foglio "PIANO REVISIONE
   2024-2025-2026" (colonna Anno = 2026): fase, attivita', date e la
   carta di lavoro della colonna F, trascritta passo per passo.
   Dove la riga 2026 non ha ancora un collegamento vale la carta
   dell'esercizio 2025 della stessa attivita' (annoCarta: 2025).

   I documenti collegati nelle carte sono in
   strumenti-revisione/allegati/ (copiati da Drive il 21/11/2026);
   il testo dei documenti Word brevi sta in strumenti-revisione/testi.json
   e si carica solo quando qualcuno apre "Leggi".

   Per cambiare un passo basta modificare il testo qui sotto. Per
   aggiungere un documento: copiarlo nella cartella degli allegati,
   aggiungerlo in "allegati" e citarlo nel passo con { a: 'nome-file', et: 'Etichetta' }.
   Collegamento esterno: { l: 'https://...', et: 'Etichetta', tipo: 'modulo' | 'drive' | 'web' }.
   Il file lo carica app.js solo quando si apre la sezione: dopo ogni
   modifica cambiare SR_DATI_VERSIONE in app.js (e la ?v= di app.js in index.html).
========================================================= */
window.RV_STRUMENTI_REVISIONE = {
 "anno": 2026,
 "aggiornato": "2026-11-21",
 "fonte": {
  "titolo": "PIANO REVISIONE 2024-2025-2026",
  "url": "https://docs.google.com/spreadsheets/d/1UevDcfT96BJ2yhOTiX0pZm6SGXTQ_KHxBqy2maLKkl4/edit?usp=sharing"
 },
 "fasi": {
  "interim": "Fase interim",
  "final": "Fase final",
  "newsletter": "Newsletter",
  "giudizio": "Giudizio di revisione"
 },
 "piano": [
  {
   "fase": "interim",
   "attivita": "Accettazione/mantenimento incarico",
   "inizio": "2026-04-01",
   "fine": "2026-09-30",
   "carta": "indipendenza",
   "linkAnno2026": true
  },
  {
   "fase": "interim",
   "attivita": "Scambio informazioni revisore uscente",
   "inizio": "2026-04-01",
   "fine": "2026-09-30",
   "carta": "revisoreUscente",
   "linkAnno2026": true
  },
  {
   "fase": "interim",
   "attivita": "Pianificazione e identificazione del rischio",
   "inizio": "2026-07-01",
   "fine": "2026-09-30",
   "carta": null,
   "linkAnno2026": false
  },
  {
   "fase": "interim",
   "attivita": "Strategia di audit e piano di revisione",
   "inizio": "2026-09-01",
   "fine": "2026-11-30",
   "carta": null,
   "linkAnno2026": false
  },
  {
   "fase": "interim",
   "attivita": "Modello IVA",
   "inizio": "2026-03-16",
   "fine": "2026-05-16",
   "carta": "modelloIva",
   "linkAnno2026": false
  },
  {
   "fase": "interim",
   "attivita": "Modello Redditi/IRAP/CNM/770",
   "inizio": "2026-09-01",
   "fine": "2026-10-31",
   "carta": "redditi",
   "linkAnno2026": true
  },
  {
   "fase": "interim",
   "attivita": "Verifica 1° trimestre",
   "inizio": "2026-03-20",
   "fine": "2026-05-16",
   "carta": "trimestrali",
   "linkAnno2026": false
  },
  {
   "fase": "interim",
   "attivita": "Verifica 2° trimestre",
   "inizio": "2026-06-20",
   "fine": "2026-08-10",
   "carta": "trimestrali",
   "linkAnno2026": false
  },
  {
   "fase": "interim",
   "attivita": "Verifica 3° trimestre",
   "inizio": "2026-09-16",
   "fine": "2026-11-16",
   "carta": "trimestrali",
   "linkAnno2026": false
  },
  {
   "fase": "interim",
   "attivita": "Verifica 4° trimestre",
   "inizio": "2026-12-20",
   "fine": "2027-02-16",
   "carta": "trimestrali",
   "linkAnno2026": false
  },
  {
   "fase": "final",
   "attivita": "Inventario magazzino",
   "inizio": "2026-12-27",
   "fine": "2027-01-16",
   "carta": "inventario",
   "linkAnno2026": false
  },
  {
   "fase": "final",
   "attivita": "Circolarizzazioni obbligatorie",
   "inizio": "2027-01-07",
   "fine": "2027-01-31",
   "carta": "circObbligatorie",
   "linkAnno2026": false
  },
  {
   "fase": "final",
   "attivita": "Verifica cespiti",
   "inizio": "2027-02-10",
   "fine": "2027-02-28",
   "carta": "cespiti",
   "linkAnno2026": false
  },
  {
   "fase": "final",
   "attivita": "Circolarizzazione clienti & fornitori",
   "inizio": "2027-01-16",
   "fine": "2027-02-28",
   "carta": "circClientiFornitori",
   "linkAnno2026": false
  },
  {
   "fase": "newsletter",
   "attivita": "Sottoscrizione dichiarazioni fiscali 2026 (2025)",
   "inizio": "2026-02-13",
   "fine": "2026-02-28",
   "carta": "dichiarazioni",
   "linkAnno2026": true
  },
  {
   "fase": "final",
   "attivita": "Verifiche bilancio 120/180 gg",
   "inizio": "2027-03-01",
   "fine": "2027-04-10",
   "carta": "bilancio",
   "linkAnno2026": false
  },
  {
   "fase": "giudizio",
   "attivita": "Richiesta controllo di qualità",
   "inizio": "2027-03-16",
   "fine": "2027-06-01",
   "carta": "qualita",
   "linkAnno2026": false
  }
 ],
 "carte": {
  "indipendenza": {
   "titolo": "Check list indipendenza",
   "drive": "https://docs.google.com/spreadsheets/d/1SoGJ1tZVoatnEzXLTic17tx4UUzwf_LToJwk_t4YX4M/edit?usp=sharing",
   "annoCarta": 2026,
   "inEvidenza": [
    {
     "a": "lettera-di-incarico-revisione-legale",
     "et": "Lettera di incarico"
    },
    {
     "a": "lettera-di-incarico-volontaria-revisione-limitata-annuale",
     "et": "Lettera di incarico «volontaria»"
    }
   ],
   "blocchi": [
    {
     "titolo": "Adeguata verifica e privacy",
     "passi": [
      {
       "n": 1,
       "testo": "Memorandum",
       "doc": [
        {
         "a": "memorandum-verifica-annuale-di-adeguata-verifica-privacy-e-indipendenza",
         "et": "Memorandum"
        }
       ]
      },
      {
       "n": 2,
       "testo": "Email al cliente",
       "doc": [
        {
         "a": "email-aggiornamento-annuale-di-adeguata-verifica-e-privacy",
         "et": "Email"
        },
        {
         "a": "allegati-di-adeguata-verifica-privacy-e-raccolta-dati",
         "et": "Adeguata verifica, privacy e raccolta dati"
        },
        {
         "a": "dati-email-comunicazione-dell-indirizzo-email-amministrativo",
         "et": "Dati email"
        }
       ]
      }
     ]
    },
    {
     "titolo": "Indipendenza",
     "passi": [
      {
       "n": 1,
       "testo": "Memorandum",
       "doc": [
        {
         "a": "memorandum-attestazione-di-indipendenza",
         "et": "Memorandum"
        }
       ]
      },
      {
       "n": 2,
       "testo": "Email al cliente",
       "doc": [
        {
         "a": "email-al-cliente-trasmissione-dell-attestazione-di-indipendenza",
         "et": "Email"
        },
        {
         "a": "attestazione-di-indipendenza-revilaw",
         "et": "Attestazione di indipendenza"
        },
        {
         "a": "addendum-alla-lettera-di-incarico-variazione-del-responsabile",
         "et": "Addendum variazione responsabile"
        }
       ]
      }
     ]
    }
   ]
  },
  "revisoreUscente": {
   "titolo": "Check list revisore uscente",
   "drive": "https://docs.google.com/spreadsheets/d/1PtjQR8-6sigOwDFHp5j1jLO805GzonD02tJbc0i4szA/edit?usp=sharing",
   "annoCarta": 2026,
   "blocchi": [
    {
     "titolo": "",
     "passi": [
      {
       "n": 1,
       "testo": "Scambio di informazioni con il revisore uscente",
       "doc": [
        {
         "a": "memorandum-scambio-di-informazioni-con-il-revisore-uscente",
         "et": "Memorandum"
        },
        {
         "a": "allegato-1-assirevi-lettera-della-societa-conferente",
         "et": "Allegato 1 Assirevi"
        },
        {
         "a": "allegato-2-assirevi-lettera-al-revisore-entrante",
         "et": "Allegato 2 Assirevi"
        },
        {
         "a": "assirevi-documento-di-ricerca-n-212",
         "et": "Assirevi 212"
        }
       ]
      }
     ]
    }
   ]
  },
  "modelloIva": {
   "titolo": "Modello IVA",
   "drive": "https://docs.google.com/document/d/1U6v30CcFMUD4j2REeRRQSGbA_rkb8afZOiqC28frEZA/edit?usp=sharing",
   "annoCarta": 2025,
   "note": [
    "Il modello IVA non deve essere firmato dal revisore: nel frontespizio non vanno quindi inseriti i codici fiscali di Revilaw e del responsabile della revisione.",
    "Solo se il cliente chiede la sottoscrizione per utilizzare il credito IVA in dichiarazione occorre avvisare il responsabile della qualità, che valuterà l'eventuale compenso."
   ],
   "blocchi": [
    {
     "titolo": "",
     "passi": [
      {
       "n": 1,
       "testo": "Indicazioni sul modello IVA",
       "doc": [
        {
         "a": "modello-iva-indicazioni-per-il-team",
         "et": "Indicazioni"
        }
       ]
      }
     ]
    }
   ]
  },
  "redditi": {
   "titolo": "Check list modello Redditi 2026 (2025)",
   "drive": "https://docs.google.com/spreadsheets/d/1MQYVJrS065z_4YxI6709JGXdfyDxvy8fTZhUiJfFQnI/edit?usp=sharing",
   "annoCarta": 2026,
   "blocchi": [
    {
     "titolo": "Sottoscrizione delle dichiarazioni",
     "passi": [
      {
       "n": 1,
       "testo": "Memorandum sulla sottoscrizione della dichiarazione dei redditi",
       "doc": [
        {
         "a": "memorandum-sottoscrizione-delle-dichiarazioni-fiscali-2026-anno-d-impost",
         "et": "Memorandum"
        },
        {
         "a": "assirevi-documento-di-ricerca-n-208r-2020",
         "et": "Assirevi 208R/2020"
        },
        {
         "a": "check-controlli-documenti-ricevuti-per-la-sottoscrizione",
         "et": "Check controlli"
        },
        {
         "a": "dubbi-sul-quadro-ro-2026",
         "et": "Dubbi quadro RO"
        }
       ]
      },
      {
       "n": 2,
       "testo": "Email al cliente",
       "doc": [
        {
         "a": "email-al-cliente-trasmissione-dei-modelli-770-redditi-sc-irap-e-cnm-2026",
         "et": "Email"
        }
       ]
      },
      {
       "n": 3,
       "testo": "Attestazione",
       "doc": [
        {
         "a": "attestazione-sulle-dichiarazioni-2026-2025",
         "et": "Attestazione"
        }
       ]
      }
     ]
    },
    {
     "titolo": "Adesione al CPB",
     "passi": [
      {
       "n": 1,
       "testo": "Memorandum",
       "doc": [
        {
         "a": "memorandum-concordato-preventivo-biennale-novita-2025-e-fac-simile-di-de",
         "et": "Memorandum"
        }
       ]
      },
      {
       "n": 2,
       "testo": "Delibera dell'assemblea dei soci (obbligatoria in caso di trasparenza)",
       "doc": [
        {
         "a": "verbale-di-assemblea-dei-soci-per-il-cpb-2026",
         "et": "Delibera assemblea"
        }
       ]
      },
      {
       "n": 3,
       "testo": "Delibera dell'organo amministrativo (obbligatoria)",
       "doc": [
        {
         "a": "verbale-di-delibera-dell-organo-amministrativo-per-il-cpb-2026",
         "et": "Delibera organo amministrativo"
        }
       ]
      },
      {
       "n": 4,
       "testo": "Attestazione CPB",
       "doc": [
        {
         "a": "attestazione-dell-organo-amministrativo-per-il-cpb-2026",
         "et": "Attestazione CPB"
        }
       ]
      }
     ]
    },
    {
     "titolo": "Modulo di invio delle dichiarazioni",
     "passi": [
      {
       "n": 1,
       "testo": "Memorandum",
       "doc": [
        {
         "a": "memorandum-invio-della-documentazione-e-istruzioni-per-il-modulo-2026",
         "et": "Memorandum"
        }
       ]
      },
      {
       "n": 2,
       "testo": "Modulo di invio delle dichiarazioni",
       "doc": [
        {
         "l": "https://forms.gle/o4YeDu2pvBkJEU5g9",
         "et": "Modulo di invio delle dichiarazioni",
         "tipo": "modulo"
        }
       ]
      }
     ]
    }
   ]
  },
  "trimestrali": {
   "titolo": "Check list verifiche trimestrali e segnalazione di crisi e insolvenza",
   "drive": "https://docs.google.com/spreadsheets/d/1UyfFHZ3wXdsSID-wFFa9E55tA9lzOrfq4LhCJN0KYXk/edit?usp=sharing",
   "annoCarta": 2025,
   "note": [
    "Non rientra nei compiti del revisore legale, in considerazione del suo ruolo, valutare l'adeguatezza delle azioni pianificate dagli amministratori in risposta allo stato di crisi o di insolvenza oggetto di segnalazione; il revisore legale, inoltre, non ha alcuno strumento per intervenire se gli amministratori non mettono in atto le iniziative programmate. Sulla scorta dei principi di revisione applicabili, potrà fare le proprie considerazioni su tali iniziative ai soli fini delle valutazioni per il giudizio professionale sul bilancio, nelle procedure svolte a tal fine.",
    "Se il revisore legale, nello scambio di informazioni con l'organo di controllo ai sensi dell'art. 2409-septies c.c., viene a sapere che quest'ultimo ha inviato la segnalazione, è raccomandabile che, previe le opportune verifiche e analisi, formalizzi anch'esso le proprie valutazioni, per inviare tempestivamente una propria segnalazione all'organo amministrativo."
   ],
   "blocchi": [
    {
     "titolo": "Procedura per il primo incontro con un nuovo cliente",
     "passi": [
      {
       "n": 1,
       "testo": "Email da inviare per un nuovo incarico",
       "doc": [
        {
         "a": "email-richiesta-del-primo-incontro-nuovo-incarico",
         "et": "Email"
        },
        {
         "a": "allegato-attestazione-delle-polizze-assicurative",
         "et": "Allegato"
        }
       ]
      },
      {
       "n": 2,
       "testo": "Inviare l'attestazione di indipendenza firmata da Pier Luigi.",
       "doc": [
        {
         "a": "email-invio-dell-attestazione-di-indipendenza",
         "et": "Email"
        },
        {
         "a": "attestazione-di-indipendenza",
         "et": "Attestazione di indipendenza"
        }
       ],
       "nota": "Attenzione: l'attestazione va reinviata ogni anno, per la verifica dei bilanci successivi al primo."
      }
     ]
    },
    {
     "titolo": "Verifiche periodiche trimestrali e bilancio comparato da importare nella carta di lavoro 4.12",
     "passi": [
      {
       "n": 1,
       "testo": "Email da inviare entro la fine del trimestre che sarà oggetto di verifica.",
       "doc": [
        {
         "a": "email-richiesta-di-incontro-e-documenti-per-la-verifica-trimestrale",
         "et": "Email"
        },
        {
         "a": "bilancio-standard-comparato",
         "et": "Bilancio"
        }
       ]
      },
      {
       "n": 2,
       "testo": "Entro 15 giorni dalla fine del trimestre oggetto di verifica occorre ricevere il bilancio comparato con lo stesso trimestre dell'esercizio precedente. Redigere il verbale di consegna!",
       "doc": [
        {
         "a": "verbale-di-consegna-del-bilancio-trimestrale",
         "et": "Verbale di consegna del bilancio"
        }
       ],
       "nota": "Esempio: per verificare il 1° trimestre si invia l'email del punto 1 entro il 31 marzo e si deve ricevere dalla società il bilancio comparato del 1° trimestre entro il 15 aprile."
      }
     ]
    },
    {
     "titolo": "Analisi e segnalazione di situazioni di crisi e di insolvenza «in corso di esercizio» nelle procedure di revisione previste dal principio SA 250B",
     "passi": [
      {
       "n": 0,
       "testo": "Documenti utili da studiare per il revisore",
       "doc": [
        {
         "a": "segnalazioni-durante-le-verifiche-in-corso-di-esercizio-sa-250b",
         "et": "Segnalazioni durante le verifiche in corso di esercizio (SA 250B)"
        },
        {
         "a": "sintesi-del-documento-di-ricerca-assirevi-n-259",
         "et": "Sintesi del documento di ricerca 259"
        },
        {
         "a": "assirevi-documento-di-ricerca-n-259",
         "et": "Assirevi, documento di ricerca n. 259"
        }
       ],
       "nota": "Carta di lavoro Revisoft: allegare e rendicontare nella carta di lavoro 4.12.12 del trimestre oggetto di verifica."
      },
      {
       "n": 1,
       "testo": "Svolgere l'analisi sull'emersione dei segnali di crisi e di insolvenza di cui all'art. 3, comma 4, del CCII.",
       "doc": [
        {
         "a": "test-segnali-di-crisi-ex-art-3-c-4-ccii",
         "et": "Test"
        }
       ]
      },
      {
       "n": 2,
       "testo": "Se la società non è in grado di fornire al revisore legale le informazioni necessarie per individuare i segnali di crisi e di insolvenza, contattare il responsabile della qualità per informare l'organo di controllo, nell'ottica del reciproco scambio di informazioni."
      },
      {
       "n": 3,
       "testo": "Contattare il responsabile della qualità se emerge almeno un segnale di crisi e di insolvenza del CCII, oppure squilibri economici e/o finanziari diversi da quelli del test."
      },
      {
       "n": 4,
       "testo": "Discutere con l'organo amministrativo per acquisire elementi probativi sull'avvenuta risoluzione o sul superamento dei segnali di crisi e di insolvenza, o su specifici fatti e circostanze che facciano ritenere non dovuta la segnalazione.",
       "nota": "Tra gli elementi probativi idonei a escludere la segnalazione rientrano unicamente quelli di concreta attualità e messi tempestivamente a disposizione del revisore. Non vanno invece considerate le iniziative che gli amministratori abbiano in corso o intendano intraprendere per far fronte alla crisi o all'insolvenza nel momento in cui si riscontrano uno o più segnali dell'art. 3, comma 4, CCII: gli amministratori ne riferiranno nella risposta da inviare entro trenta giorni dalla ricezione della segnalazione (art. 25-octies CCII)."
      },
      {
       "n": 5,
       "testo": "Segnalare all'organo amministrativo (e per conoscenza all'organo di controllo), con la PEC di Revilaw, i segnali di crisi e di insolvenza entro 60 giorni da quando il revisore ne ha conoscenza nell'ambito delle verifiche trimestrali svolte regolarmente. Nella comunicazione va inserito l'invito all'organo amministrativo a riferire all'organo di controllo sulle iniziative intraprese."
      },
      {
       "n": 6,
       "testo": "Risposta dell'organo amministrativo sulla PEC di Revilaw entro 30 giorni dalla segnalazione."
      }
     ]
    }
   ]
  },
  "inventario": {
   "titolo": "Check list inventario",
   "drive": "https://docs.google.com/spreadsheets/d/1VEIHgUT3GgqaAqjD_OTPtRUBSR-DPZJH7oz2mPshHw8/edit?usp=sharing",
   "annoCarta": 2025,
   "note": [
    "Tutti i documenti vanno allegati nella carta di lavoro 3.4.4, indicando correttamente il nome del file, descrivendo i controlli nelle memo e riportando nelle memo l'elenco degli allegati."
   ],
   "blocchi": [
    {
     "titolo": "Prima dell'inizio dell'inventario",
     "passi": [
      {
       "n": 1,
       "testo": "Inviare l'email alla società revisionata",
       "doc": [
        {
         "a": "email-inventario-di-fine-anno",
         "et": "Email"
        },
        {
         "a": "allegato-1-manuale-di-inventario-fac-simile",
         "et": "Allegato 1"
        },
        {
         "a": "allegato-2-attestazione-frontespizio-da-inviare-con-il-bilancio",
         "et": "Allegato 2"
        },
        {
         "a": "allegato-3-focus-sulla-revisione-delle-rimanenze-di-magazzino",
         "et": "Allegato 3"
        },
        {
         "a": "allegato-4-valorizzazione-dell-inventario-di-magazzino-cliente",
         "et": "Allegato 4"
        }
       ]
      },
      {
       "n": 2,
       "testo": "Sollecitare la conferma della data di inizio e di fine dell'inventario."
      },
      {
       "n": 3,
       "testo": "Sollecitare l'invio della procedura di inventario o dell'allegato 1 dell'email."
      },
      {
       "n": 4,
       "testo": "Sollecitare l'invio delle planimetrie dei locali del magazzino."
      },
      {
       "n": 5,
       "testo": "Sollecitare l'eventuale perizia."
      },
      {
       "n": 6,
       "testo": "Chiedere se ci sono merci di proprietà presso terzi."
      },
      {
       "n": 7,
       "testo": "Eventualmente circolarizzare il depositario della merce presso terzi (riferire al responsabile qualità).",
       "doc": [
        {
         "a": "lettera-di-circolarizzazione-ai-depositari-delle-rimanenze",
         "et": "Lettera di circolarizzazione"
        }
       ]
      },
      {
       "n": 8,
       "testo": "Completare, se non già fatto, la carta di lavoro 3.4.4 Pianificazione.",
       "doc": [
        {
         "a": "esempio-della-carta-di-lavoro-3-4-4-pianificazione",
         "et": "Esempio"
        }
       ]
      }
     ]
    },
    {
     "titolo": "Durante l'inventario",
     "passi": [
      {
       "n": 9,
       "testo": "Partecipare alla conta fisica del magazzino per verificare quanto indicato dalla società secondo il punto 2, nonché i tabulati ciechi."
      },
      {
       "n": 10,
       "testo": "Durante la conta verificare la presenza di merce obsoleta e di merci di terzi."
      }
     ]
    },
    {
     "titolo": "Verifica del revisore",
     "passi": [
      {
       "n": 11,
       "testo": "Chiedere l'invio dell'attestazione (allegato 2 dell'email), della valorizzazione (allegato 4) e di un bilancio di verifica al 31/12."
      },
      {
       "n": 12,
       "testo": "Importare la valorizzazione in Revisoft e fare il campionamento statistico (chi vuole fare anche quello ragionato faccia sempre prima lo statistico)."
      },
      {
       "n": 13,
       "testo": "Tornare in azienda per la verifica del campione e riconciliare con DDT e fatture (conservare in Revisoft i documenti acquisiti).",
       "doc": [
        {
         "a": "carta-di-lavoro-conta-fisica-del-revisore",
         "et": "Conta fisica del revisore"
        }
       ]
      },
      {
       "n": 14,
       "testo": "Svolgere la verifica dal fisico al contabile."
      },
      {
       "n": 15,
       "testo": "Svolgere la verifica slow moving.",
       "doc": [
        {
         "a": "carta-di-lavoro-slow-moving",
         "et": "Slow moving"
        }
       ]
      },
      {
       "n": 16,
       "testo": "Svolgere il price test.",
       "doc": [
        {
         "a": "carta-di-lavoro-price-test",
         "et": "Price test"
        }
       ]
      },
      {
       "n": 17,
       "testo": "Svolgere il cut-off.",
       "doc": [
        {
         "a": "carta-di-lavoro-cut-off",
         "et": "Cut-off"
        }
       ]
      },
      {
       "n": 18,
       "testo": "Segnalare all'azienda gli eventuali errori al di sopra dell'errore trascurabile e la merce obsoleta, per la svalutazione del magazzino."
      },
      {
       "n": 19,
       "testo": "Riportare nella scheda «Errori rilevati» di Revisoft le anomalie rilevate e non corrette."
      },
      {
       "n": 20,
       "testo": "Documentare nelle note di Revisoft le attività sopra indicate, allegando carte di lavoro e documenti probativi (foto e altri documenti utili)."
      },
      {
       "n": 21,
       "testo": "Redigere il verbale di verifica del magazzino.",
       "doc": [
        {
         "a": "verbale-di-verifica-del-magazzino",
         "et": "Verbale"
        }
       ]
      },
      {
       "n": 22,
       "testo": "Inviare il modulo per i controlli di qualità.",
       "doc": [
        {
         "l": "https://forms.gle/ohhvfyKs5rJZX2YEA",
         "et": "Modulo per i controlli di qualità",
         "tipo": "modulo"
        }
       ]
      }
     ]
    }
   ]
  },
  "circObbligatorie": {
   "titolo": "Check list circolarizzazione soggetti obbligatori",
   "drive": "https://docs.google.com/spreadsheets/d/1H7ybLvCJlzEC9Hm5Vaua4IWTRDiwMToBjpDDcq3CFEQ/edit?usp=sharing",
   "annoCarta": 2025,
   "note": [
    "Fasi specifiche per gli incarichi affidati al controllo qualità di Elisa e Andrea (PEC: circolarizzazionirevilaw@pec.it)."
   ],
   "blocchi": [
    {
     "titolo": "",
     "passi": [
      {
       "n": 1,
       "testo": "Inviare l'email al cliente per chiedere l'attestazione.",
       "doc": [
        {
         "a": "email-al-cliente-richiesta-dell-attestazione-per-le-circolarizzazioni",
         "et": "Email"
        },
        {
         "a": "attestazione-dei-soggetti-obbligatori-pdf-compilabile",
         "et": "Attestazione"
        }
       ]
      },
      {
       "n": 2,
       "testo": "Ricevere l'attestazione."
      },
      {
       "n": 3,
       "testo": "Autocertificazione rischi legali: farla firmare quando nell'attestazione non sono indicati legali. Integrare il controllo con il punto 9.",
       "doc": [
        {
         "a": "autocertificazione-rischi-legali",
         "et": "Autocertificazione rischi legali"
        },
        {
         "a": "guida-pratica-circolarizzazioni-e-conferme-legali",
         "et": "Guida pratica legali"
        }
       ]
      },
      {
       "n": 4,
       "testo": "Predisporre le lettere di circolarizzazione come da attestazione ricevuta.",
       "doc": [
        {
         "c": [
          "lettera-alla-societa-incaricata-della-conta-fisica-delle-rimanenze",
          "lettera-agli-enti-finanziatori",
          "lettera-agli-istituti-di-credito",
          "lettera-all-amministrazione-postale",
          "lettera-ai-consulenti-del-lavoro",
          "lettera-ai-consulenti-fiscali",
          "lettera-ai-consulenti-legali",
          "lettera-alle-compagnie-assicurative",
          "lettera-alle-societa-di-leasing",
          "lettera-alle-societa-di-factor",
          "lettera-ai-depositanti-delle-rimanenze-di-magazzino",
          "lettera-alle-parti-correlate-gruppi-societari"
         ],
         "et": "Fac-simile delle lettere",
         "drive": "https://drive.google.com/drive/folders/12pC9-0mwEtDq_acuy70ML_xRKgzHDQHh?usp=sharing"
        }
       ]
      },
      {
       "n": 5,
       "testo": "Inviare al cliente le lettere di circolarizzazione da far stampare e firmare su carta intestata.",
       "doc": [
        {
         "a": "email-invio-delle-lettere-di-circolarizzazione",
         "et": "Email"
        }
       ]
      },
      {
       "n": 6,
       "testo": "Ricevere le lettere di circolarizzazione entro 5 giorni."
      },
      {
       "n": 7,
       "testo": "Sui mastrini al 31/12 verificare che nell'attestazione ci siano tutti i soggetti obbligatori."
      },
      {
       "n": 8,
       "testo": "Controllare gli indirizzi PEC su INI-PEC.",
       "doc": [
        {
         "l": "https://www.inipec.gov.it/web/guest/cerca-pec?p_p_id=search_pec_SearchPecPortlet_INSTANCE_AXK2wimPmw44&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_search_pec_SearchPecPortlet_INSTANCE_AXK2wimPmw44_tabSelected=companies",
         "et": "INI-PEC",
         "tipo": "web"
        }
       ]
      },
      {
       "n": 9,
       "testo": "Inviare le circolarizzazioni con il modulo (partono dalla PEC circolarizzazionirevilaw@pec.it).",
       "doc": [
        {
         "l": "https://forms.gle/btkRZP3sPAmMQ7x39",
         "et": "Modulo di invio delle circolarizzazioni",
         "tipo": "modulo"
        }
       ]
      }
     ]
    },
    {
     "titolo": "Controllo qualità: invio PEC",
     "passi": [
      {
       "n": 10,
       "testo": "Verificare eventuali errori di invio.",
       "doc": [
        {
         "l": "https://docs.google.com/spreadsheets/d/10uaO97iC2pQ_7MaLMsxVPG2mB9hOLwyXNklVIz-p4Jo/edit?usp=sharing",
         "et": "Foglio degli errori di invio",
         "tipo": "drive"
        }
       ]
      },
      {
       "n": 11,
       "testo": "Controllare le risposte ricevute e i solleciti.",
       "doc": [
        {
         "l": "https://docs.google.com/spreadsheets/d/1EPT2qb0jr3RdtpfMDPYpSaTpACgoaOx169LQEkyyHCo/edit?usp=sharing",
         "et": "Foglio delle risposte ricevute e dei solleciti",
         "tipo": "drive"
        },
        {
         "l": "https://docs.google.com/spreadsheets/d/e/2PACX-1vRnzUpoHjf2kb2tiTDgW8vUodJsXZ0PWtzHaJ735XxRX0qlmdQPtN8lCqBLqSW1n_9a3az2Ktly_st4/pubhtml?gid=1423201834&single=true",
         "et": "Dettagli degli invii",
         "tipo": "drive"
        }
       ]
      },
      {
       "n": 12,
       "testo": "Report delle risposte ricevute dal team, da allegare in Revisoft 3.98.",
       "doc": [
        {
         "a": "report-del-team-soggetti-obbligatori-e-risposte",
         "et": "Report del team"
        }
       ]
      }
     ]
    },
    {
     "titolo": "Verificare fondo rischi, saldi dei c/c, debiti verso consulenti e informazioni in nota integrativa",
     "passi": [
      {
       "n": 13,
       "testo": "Chiedere all'azienda la Centrale Rischi al 31/12.",
       "doc": [
        {
         "a": "email-richiesta-della-centrale-rischi",
         "et": "Email"
        }
       ]
      },
      {
       "n": 14,
       "testo": "Allegare le risposte di enti finanziatori, istituti di credito e amministrazione postale in Revisoft 3.4.11 (Ctrl)."
      },
      {
       "n": 15,
       "testo": "Allegare le risposte di consulenti del lavoro, consulenti fiscali, consulenti legali e compagnie assicurative in Revisoft 3.4.14 (Ctrl)."
      },
      {
       "n": 16,
       "testo": "Allegare le risposte dei depositari delle rimanenze di magazzino in Revisoft 3.4.4 (Ctrl)."
      },
      {
       "n": 17,
       "testo": "Allegare le risposte delle società di leasing in Revisoft 3.98."
      }
     ]
    }
   ],
   "doveAllegare": [
    {
     "cosa": "Attestazione",
     "carta": "3.91"
    },
    {
     "cosa": "Risposte alle lettere a enti finanziatori, istituti di credito, amministrazione postale, Centrale Rischi",
     "carta": "3.4.11"
    },
    {
     "cosa": "Risposte alle lettere a società di leasing e compagnie assicurative",
     "carta": "3.98"
    },
    {
     "cosa": "Risposte alle lettere a consulenti del lavoro, fiscali e legali, e autocertificazione rischi legali",
     "carta": "3.4.14"
    },
    {
     "cosa": "Risposte alle lettere ai depositanti delle rimanenze di magazzino",
     "carta": "3.4.4"
    }
   ],
   "noteFinali": [
    "Tutti i soggetti indicati nell'attestazione devono rispondere alla richiesta di conferma esterna."
   ]
  },
  "cespiti": {
   "titolo": "Check list verifica cespiti",
   "drive": "https://docs.google.com/spreadsheets/d/1vMeZOQEtsRAU0Rl6btxy1s-j0hpWw2xjzVyaDbt9ovA/edit?usp=sharing",
   "annoCarta": 2025,
   "blocchi": [
    {
     "titolo": "",
     "passi": [
      {
       "n": 1,
       "testo": "Inviare l'email al cliente.",
       "doc": [
        {
         "a": "email-richiesta-del-libro-cespiti",
         "et": "Email"
        }
       ]
      },
      {
       "n": 2,
       "testo": "Controllare che il totale delle immobilizzazioni del libro cespiti coincida con quello del progetto di bilancio e delle schede contabili/mastrini."
      },
      {
       "n": 3,
       "testo": "Individuare il numero di cespiti da campionare (grandezza del campione).",
       "doc": [
        {
         "a": "grandezza-del-campione",
         "et": "Grandezza del campione"
        },
        {
         "l": "https://amissori-coder.github.io/CALCOLO-GRANDEZZA-CAMPIONE-CESPITI/",
         "et": "App per il campionamento",
         "tipo": "web"
        }
       ]
      },
      {
       "n": 4,
       "testo": "Campionamento ragionato.",
       "doc": [
        {
         "a": "campionamento-ragionato-dei-cespiti",
         "et": "Campionamento ragionato"
        }
       ]
      },
      {
       "n": 5,
       "testo": "Test overall del fondo ammortamento.",
       "doc": [
        {
         "a": "test-overall-del-fondo-ammortamento",
         "et": "Test overall"
        }
       ]
      },
      {
       "n": 6,
       "testo": "Test di ricalcolo delle quote di ammortamento.",
       "doc": [
        {
         "a": "test-di-ricalcolo-delle-quote-di-ammortamento",
         "et": "Test ammortamento"
        }
       ]
      },
      {
       "n": 7,
       "testo": "Test incrementi e decrementi.",
       "doc": [
        {
         "a": "test-incrementi-e-decrementi",
         "et": "Test incrementi/decrementi"
        }
       ]
      },
      {
       "n": 8,
       "testo": "Verifica fisica con foto del cespite (allegare anche le planimetrie per i beni immobili)."
      },
      {
       "n": 9,
       "testo": "Acquisire fatture di acquisto, ricevute di bonifico e ogni altra documentazione probatoria (atti di compravendita, ecc.)."
      },
      {
       "n": 10,
       "testo": "Verificare eventuali crediti d'imposta fruiti con la relativa documentazione probatoria (ad esempio la certificazione di interconnessione 4.0) e i risconti."
      },
      {
       "n": 11,
       "testo": "Redigere il verbale di verifica.",
       "doc": [
        {
         "a": "verbale-di-verifica-dei-beni-strumentali",
         "et": "Verbale"
        }
       ]
      }
     ]
    }
   ]
  },
  "circClientiFornitori": {
   "titolo": "Check list circolarizzazione clienti/fornitori",
   "drive": "https://docs.google.com/spreadsheets/d/1it9ZQo2N_o87J77iBjaD1juZAp9V25AOGWYPWVBhqd0/edit?usp=sharing",
   "annoCarta": 2025,
   "blocchi": [
    {
     "titolo": "",
     "passi": [
      {
       "n": 1,
       "testo": "Inviare l'email al cliente.",
       "doc": [
        {
         "a": "email-richiesta-della-documentazione-per-la-circolarizzazione-clienti-e",
         "et": "Email"
        },
        {
         "a": "allegato-elenco-clienti",
         "et": "Allegato clienti"
        },
        {
         "a": "allegato-elenco-fornitori",
         "et": "Allegato fornitori"
        }
       ]
      },
      {
       "n": 2,
       "testo": "Ricevere le schede contabili di clienti e fornitori e gli elenchi xls di clienti e fornitori, con il bilancio di verifica."
      },
      {
       "n": 3,
       "testo": "Procedere al campionamento in Revisoft.",
       "doc": [
        {
         "l": "https://drive.google.com/file/d/1MDEZRnbwPFDJ5D2lUtA2E3jFwfbJfw19/view?usp=sharing",
         "et": "Video sul campionamento",
         "tipo": "drive"
        },
        {
         "a": "note-sui-segni-dei-saldi-dare-avere",
         "et": "Note sui segni +/- dei saldi dare/avere"
        },
        {
         "a": "istruzioni-revisoft-campionamento",
         "et": "Istruzioni Revisoft"
        },
        {
         "a": "chiarimenti-per-il-campionamento",
         "et": "Chiarimenti Revisoft"
        }
       ]
      },
      {
       "n": 4,
       "testo": "Inviare l'xls dei clienti/fornitori campionati e chiedere di inserire le PEC.",
       "doc": [
        {
         "a": "xls-per-il-campionamento-pec-di-clienti-e-fornitori",
         "et": "Xls campionamento"
        }
       ]
      },
      {
       "n": 5,
       "testo": "Predisporre le lettere di circolarizzazione.",
       "doc": [
        {
         "a": "lettera-ai-clienti",
         "et": "Lettere clienti"
        },
        {
         "a": "lettera-ai-fornitori",
         "et": "Lettere fornitori"
        }
       ]
      },
      {
       "n": 6,
       "testo": "Inviare al cliente le lettere di circolarizzazione da far stampare e firmare su carta intestata.",
       "doc": [
        {
         "a": "email-invio-delle-lettere-di-circolarizzazione-a-clienti-e-fornitori",
         "et": "Email"
        }
       ]
      },
      {
       "n": 7,
       "testo": "Ricevere le lettere di circolarizzazione entro 5 giorni."
      },
      {
       "n": 8,
       "testo": "Per le lettere ai clienti, verificare che l'azienda abbia allegato l'estratto conto al 31/12."
      },
      {
       "n": 9,
       "testo": "Controllare gli indirizzi PEC su INI-PEC.",
       "doc": [
        {
         "l": "https://www.inipec.gov.it/web/guest/cerca-pec?p_p_id=search_pec_SearchPecPortlet_INSTANCE_AXK2wimPmw44&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_search_pec_SearchPecPortlet_INSTANCE_AXK2wimPmw44_tabSelected=companies",
         "et": "INI-PEC",
         "tipo": "web"
        }
       ]
      },
      {
       "n": 10,
       "testo": "Inviare le circolarizzazioni con il modulo (partono dalla PEC circolarizzazionirevilaw@pec.it).",
       "doc": [
        {
         "l": "https://docs.google.com/forms/d/e/1FAIpQLScrBmP_Zv46lwsbU86KC44cH-FHT0WuMwlsRH_LNfgVtuBKsw/viewform",
         "et": "Modulo di invio delle circolarizzazioni",
         "tipo": "modulo"
        }
       ]
      }
     ]
    },
    {
     "titolo": "Controllo qualità: invio PEC",
     "passi": [
      {
       "n": 11,
       "testo": "Verificare eventuali errori di invio.",
       "doc": [
        {
         "l": "https://docs.google.com/spreadsheets/d/10uaO97iC2pQ_7MaLMsxVPG2mB9hOLwyXNklVIz-p4Jo/edit?usp=sharing",
         "et": "Foglio degli errori di invio",
         "tipo": "drive"
        }
       ]
      },
      {
       "n": 12,
       "testo": "Controllare le risposte ricevute e i solleciti.",
       "doc": [
        {
         "l": "https://docs.google.com/spreadsheets/d/1EPT2qb0jr3RdtpfMDPYpSaTpACgoaOx169LQEkyyHCo/edit?usp=sharing",
         "et": "Foglio delle risposte ricevute e dei solleciti",
         "tipo": "drive"
        },
        {
         "l": "https://docs.google.com/spreadsheets/d/e/2PACX-1vRXwdaXiUiSnzWb1bAjSC1KcafwJX4Z34NIFM-zvyBvGk5qV0skXBZMt0AEVbyljlQClUdhO2cc69PD/pubhtml?gid=1423201834&single=true",
         "et": "Dettagli degli invii",
         "tipo": "drive"
        }
       ]
      },
      {
       "n": 13,
       "testo": "Report delle risposte ricevute dal team, da allegare in Revisoft 3.98.",
       "doc": [
        {
         "a": "report-del-team-clienti-fornitori-e-risposte",
         "et": "Report del team"
        }
       ]
      },
      {
       "n": 14,
       "testo": "Svolgere procedure alternative per i clienti/fornitori che non hanno risposto."
      },
      {
       "n": 15,
       "testo": "Verificare «tutte» le fatture da emettere/ricevere, riconciliando le schede contabili con i documenti probativi (copia delle fatture, ecc., da allegare in Revisoft)."
      },
      {
       "n": 16,
       "testo": "Chiedere l'aging di tutti i crediti e debiti per verificarne l'anzianità e la capienza del fondo svalutazione.",
       "doc": [
        {
         "a": "esempio-di-aging-dei-crediti-e-dei-debiti",
         "et": "Esempio per il cliente"
        }
       ]
      }
     ]
    }
   ],
   "doveAllegare": [
    {
     "cosa": "Risposte alle lettere ai clienti",
     "carta": "3.4.7 Camp"
    },
    {
     "cosa": "Risposte alle lettere ai fornitori",
     "carta": "3.4.17 Camp"
    }
   ]
  },
  "dichiarazioni": {
   "titolo": "Check list sottoscrizione dichiarazioni fiscali 2026",
   "drive": "https://docs.google.com/spreadsheets/d/1j8O6ZAgGfCxEf5ZiQxrSWDNg80Rm2v0auzufX0kxVkc/edit?usp=sharing",
   "annoCarta": 2026,
   "blocchi": [
    {
     "titolo": "",
     "passi": [
      {
       "n": 1,
       "testo": "Email da inviare per le dichiarazioni fiscali",
       "doc": [
        {
         "a": "email-aggiornamenti-sulle-dichiarazioni-fiscali-2026-e-ruolo-della-socie",
         "et": "Email"
        }
       ]
      }
     ]
    }
   ]
  },
  "bilancio": {
   "titolo": "Check list verifiche bilancio",
   "drive": "https://docs.google.com/spreadsheets/d/1sVZUxy5-6erjCOg_MrlCowVxL7abBJWAL0pZzOlyIto/edit?usp=sharing",
   "annoCarta": 2025,
   "note": [
    "Nessuna relazione di revisione può essere emessa prima dei controlli di qualità di Revilaw. Al termine, se il controllo di qualità riterrà concluse positivamente tutte le verifiche, rilascerà: la lettera di attestazione della direzione su format Revilaw; la relazione di revisione su format Revilaw.",
    "Con l'emissione del giudizio le carte di lavoro vengono stampate con tutti gli allegati, così da essere congelate: dettagliare in modo analitico ogni controllo svolto e allegare tutti i documenti utili."
   ],
   "blocchi": [
    {
     "titolo": "",
     "passi": [
      {
       "n": 1,
       "testo": "Inviare l'email al cliente.",
       "doc": [
        {
         "a": "email-comunicazione-del-progetto-di-bilancio-al-revisore-legale",
         "et": "Email"
        }
       ]
      }
     ]
    },
    {
     "titolo": "Bilancio approvato entro 120 giorni",
     "passi": [
      {
       "n": 1,
       "testo": "Se il progetto di bilancio non arriva entro il 30/03, inviare un sollecito.",
       "doc": [
        {
         "a": "note-tecniche-mancata-comunicazione-del-progetto-di-bilancio-nei-tempi",
         "et": "Note tecniche"
        },
        {
         "a": "lettera-di-primo-sollecito",
         "et": "Email 1° sollecito"
        },
        {
         "a": "lettera-di-secondo-sollecito",
         "et": "Email 2° sollecito"
        }
       ]
      },
      {
       "n": 2,
       "testo": "Ricevere la rinuncia ai termini firmata da tutti i soci e dall'amministratore.",
       "doc": [
        {
         "a": "rinuncia-ai-termini-art-2429-c-c",
         "et": "Rinuncia ai termini"
        }
       ]
      },
      {
       "n": 3,
       "testo": "Ricevere il progetto di bilancio con la delibera del CdA (determina dell'A.U.)."
      },
      {
       "n": 4,
       "testo": "Verificare la tipologia di bilancio (ordinario/abbreviato)."
      },
      {
       "n": 5,
       "testo": "Svolgere le verifiche."
      },
      {
       "n": 6,
       "testo": "Verificare in nota integrativa l'indicazione dei compensi del revisore."
      },
      {
       "n": 7,
       "testo": "Sottoscrizione delle parti correlate.",
       "doc": [
        {
         "a": "attestazione-dei-controlli-sulle-parti-correlate-modello",
         "et": "Modello"
        },
        {
         "a": "lettera-alle-parti-correlate-gruppi-societari",
         "et": "Per i soli gruppi"
        }
       ],
       "nota": "Per i soli gruppi allegare anche la risposta alla circolarizzazione delle parti correlate presente nei fac-simile delle circolarizzazioni obbligatorie."
      },
      {
       "n": 8,
       "testo": "Comunicare al responsabile della qualità la fine delle verifiche.",
       "doc": [
        {
         "l": "https://docs.google.com/spreadsheets/d/17ywCgLGfJooPHhVTmTEOP39RnpMaTeebSugWYQ11b1A/edit?usp=sharing",
         "et": "Responsabile qualità di ogni cliente",
         "tipo": "drive"
        }
       ]
      },
      {
       "n": 9,
       "testo": "Sottoscrizione della lettera di attestazione: lo stesso giorno dell'emissione del giudizio.",
       "doc": [
        {
         "c": [
          "lettera-di-attestazione-bilancio-abbreviato",
          "lettera-di-attestazione-bilancio-ordinario-con-relazione-sulla-gestione",
          "assirevi-documento-di-ricerca-n-251r-2026-le-attestazioni-della-direzion"
         ],
         "et": "Format Revilaw da concordare con il responsabile qualità",
         "drive": "https://drive.google.com/drive/folders/1CeOR7fD26OneZfBeGAE01caE73HBJ3gQ?usp=sharing"
        }
       ],
       "nota": "Il format Revilaw si concorda con il responsabile qualità."
      },
      {
       "n": 10,
       "testo": "Verificare la bozza del verbale di approvazione del bilancio, con i riferimenti alla rinuncia ai termini da parte di tutti i soci."
      },
      {
       "n": 11,
       "testo": "Emissione del giudizio di revisione: almeno 15 giorni prima dell'assemblea in prima convocazione.",
       "doc": [
        {
         "c": [
          "giudizio-bilancio-ordinario-senza-collegio",
          "giudizio-bilancio-ordinario-con-collegio",
          "giudizio-bilancio-abbreviato-senza-collegio",
          "giudizio-con-rilievi-bilancio-abbreviato-senza-collegio",
          "impossibilita-di-esprimere-un-giudizio-bilancio-abbreviato-senza-collegi",
          "report-of-the-independent-legal-auditor-in-inglese"
         ],
         "et": "Format Revilaw da concordare con il responsabile qualità",
         "drive": "https://drive.google.com/drive/folders/1l0xxZOorqn-n4HWnWke6-cd20Kx3X-2M?usp=sharing"
        }
       ],
       "nota": "Il format Revilaw si concorda con il responsabile qualità."
      },
      {
       "n": 12,
       "testo": "Emissione del giudizio di revisione: con la rinuncia ai termini anche nei 15 giorni prima dell'assemblea in prima convocazione."
      }
     ]
    },
    {
     "titolo": "Bilancio approvato entro 180 giorni",
     "passi": [
      {
       "n": 1,
       "testo": "Ricevere il verbale dell'organo amministrativo (determina dell'A.U.) per il rinvio a 180 giorni."
      },
      {
       "n": 2,
       "testo": "Verificare le condizioni statutarie per il rinvio a 180 giorni."
      },
      {
       "n": 3,
       "testo": "Se il progetto di bilancio non arriva entro il 30/05, inviare un sollecito.",
       "doc": [
        {
         "a": "note-tecniche-mancata-comunicazione-del-progetto-di-bilancio-nei-tempi",
         "et": "Note tecniche"
        },
        {
         "a": "lettera-di-primo-sollecito",
         "et": "Email 1° sollecito"
        },
        {
         "a": "lettera-di-secondo-sollecito",
         "et": "Email 2° sollecito"
        }
       ]
      },
      {
       "n": 4,
       "testo": "Ricevere la rinuncia ai termini firmata da tutti i soci e dall'amministratore.",
       "doc": [
        {
         "a": "rinuncia-ai-termini-art-2429-c-c",
         "et": "Rinuncia ai termini"
        }
       ]
      },
      {
       "n": 5,
       "testo": "Ricevere il progetto di bilancio con la delibera del CdA (determina dell'A.U.)."
      },
      {
       "n": 6,
       "testo": "Verificare la tipologia di bilancio (ordinario/abbreviato)."
      },
      {
       "n": 7,
       "testo": "Svolgere le verifiche."
      },
      {
       "n": 8,
       "testo": "Verificare in nota integrativa la presenza delle motivazioni del rinvio a 180 giorni."
      },
      {
       "n": 9,
       "testo": "Verificare in nota integrativa l'indicazione dei compensi del revisore."
      },
      {
       "n": 10,
       "testo": "Sottoscrizione delle parti correlate.",
       "doc": [
        {
         "a": "attestazione-dei-controlli-sulle-parti-correlate-modello",
         "et": "Modello"
        },
        {
         "a": "lettera-alle-parti-correlate-gruppi-societari",
         "et": "Per i soli gruppi"
        }
       ],
       "nota": "Per i soli gruppi allegare anche la risposta alla circolarizzazione delle parti correlate presente nei fac-simile delle circolarizzazioni obbligatorie."
      },
      {
       "n": 11,
       "testo": "Comunicare al responsabile della qualità la fine delle verifiche.",
       "doc": [
        {
         "l": "https://docs.google.com/spreadsheets/d/17ywCgLGfJooPHhVTmTEOP39RnpMaTeebSugWYQ11b1A/edit?usp=sharing",
         "et": "Responsabile qualità di ogni cliente",
         "tipo": "drive"
        }
       ]
      },
      {
       "n": 12,
       "testo": "Sottoscrizione della lettera di attestazione: lo stesso giorno dell'emissione del giudizio.",
       "doc": [
        {
         "c": [
          "lettera-di-attestazione-bilancio-abbreviato",
          "lettera-di-attestazione-bilancio-ordinario-con-relazione-sulla-gestione",
          "assirevi-documento-di-ricerca-n-251r-2026-le-attestazioni-della-direzion"
         ],
         "et": "Format Revilaw da concordare con il responsabile qualità",
         "drive": "https://drive.google.com/drive/folders/1CeOR7fD26OneZfBeGAE01caE73HBJ3gQ?usp=sharing"
        }
       ],
       "nota": "Il format Revilaw si concorda con il responsabile qualità."
      },
      {
       "n": 13,
       "testo": "Verificare la bozza del verbale di approvazione del bilancio, con i riferimenti alla rinuncia ai termini da parte di tutti i soci."
      },
      {
       "n": 14,
       "testo": "Emissione del giudizio di revisione: almeno 15 giorni prima dell'assemblea in prima convocazione.",
       "doc": [
        {
         "c": [
          "giudizio-bilancio-ordinario-senza-collegio",
          "giudizio-bilancio-ordinario-con-collegio",
          "giudizio-bilancio-abbreviato-senza-collegio",
          "giudizio-con-rilievi-bilancio-abbreviato-senza-collegio",
          "impossibilita-di-esprimere-un-giudizio-bilancio-abbreviato-senza-collegi",
          "report-of-the-independent-legal-auditor-in-inglese"
         ],
         "et": "Format Revilaw da concordare con il responsabile qualità",
         "drive": "https://drive.google.com/drive/folders/1l0xxZOorqn-n4HWnWke6-cd20Kx3X-2M?usp=sharing"
        }
       ],
       "nota": "Il format Revilaw si concorda con il responsabile qualità."
      },
      {
       "n": 15,
       "testo": "Emissione del giudizio di revisione: con la rinuncia ai termini anche nei 15 giorni prima dell'assemblea in prima convocazione."
      }
     ]
    }
   ],
   "doveAllegare": [
    {
     "cosa": "Rinuncia ai termini",
     "carta": "3.95"
    },
    {
     "cosa": "Modello parti correlate",
     "carta": "3.5.1"
    },
    {
     "cosa": "Risposta alla circolarizzazione delle parti correlate (gruppi)",
     "carta": "3.5.1"
    },
    {
     "cosa": "Lettera di attestazione",
     "carta": "3.91"
    },
    {
     "cosa": "Giudizio di revisione",
     "carta": "3.95"
    }
   ],
   "noteFinali": [
    "Se la società non riesce ad approvare il bilancio neanche entro 180 giorni, occorre un verbale dell'organo amministrativo che spieghi le ragioni del ritardo e annulli le convocazioni in prima e seconda convocazione."
   ]
  },
  "qualita": {
   "titolo": "Check list rilascio attestazione e giudizio",
   "drive": "https://docs.google.com/spreadsheets/d/1tj7Hl5fTKLWnqkwJMo2tqXHQ3KQeKl7YdG_c2V2V42s/edit?usp=sharing",
   "annoCarta": 2025,
   "note": [
    "Attenzione: prima di chiedere il controllo qualità verificare che tutte le carte di lavoro siano completate come indicato qui sotto."
   ],
   "blocchi": [
    {
     "titolo": "Controlli generici",
     "passi": [
      {
       "n": 1,
       "testo": "Frequenza delle verifiche sulle carte di lavoro dell'area 4 (31/03, 30/06, 30/09, 31/12).",
       "doc": [
        {
         "a": "ciclo-delle-verifiche-periodiche-area-4",
         "et": "Ciclo verifiche periodiche"
        }
       ]
      },
      {
       "n": 2,
       "testo": "Import del progetto di bilancio.",
       "doc": [
        {
         "a": "import-del-bilancio",
         "et": "Nota"
        }
       ]
      },
      {
       "n": 3,
       "testo": "Materialità di bilancio.",
       "doc": [
        {
         "a": "materialita-di-bilancio",
         "et": "Nota"
        }
       ]
      },
      {
       "n": 4,
       "testo": "Carte di lavoro «Pianificazione» e «Controllo».",
       "doc": [
        {
         "a": "carte-di-lavoro-pianificazione-e-controllo",
         "et": "Nota"
        }
       ]
      },
      {
       "n": 5,
       "testo": "Errori di bilancio.",
       "doc": [
        {
         "a": "errori-nel-bilancio",
         "et": "Nota"
        }
       ]
      }
     ]
    },
    {
     "titolo": "Kickoff",
     "passi": [
      {
       "n": 1,
       "testo": "Pacchetto Kickoff, pensato soprattutto per i meno esperti, per avviare rapidamente le verifiche sul bilancio con le richieste iniziali. Il set documentale raccoglie i documenti che al 95% servono e sono subito disponibili in azienda; le milestone sono le attività che al 95% vanno svolte.",
       "doc": [
        {
         "a": "pacchetto-kickoff",
         "et": "Pacchetto Kickoff"
        }
       ],
       "nota": "Il pacchetto non sostituisce quanto indicato nelle carte di lavoro successive."
      }
     ]
    },
    {
     "titolo": "Controlli sulle carte di lavoro",
     "passi": [
      {
       "n": 1,
       "testo": "Immobilizzazioni immateriali",
       "doc": [
        {
         "a": "controlli-immobilizzazioni-immateriali",
         "et": "Note di controllo"
        }
       ]
      },
      {
       "n": 2,
       "testo": "Immobilizzazioni materiali",
       "doc": [
        {
         "a": "controlli-immobilizzazioni-materiali",
         "et": "Note di controllo"
        }
       ]
      },
      {
       "n": 3,
       "testo": "Immobilizzazioni finanziarie",
       "doc": [
        {
         "a": "controlli-immobilizzazioni-finanziarie",
         "et": "Note di controllo"
        }
       ]
      },
      {
       "n": 4,
       "testo": "Rimanenze di magazzino",
       "doc": [
        {
         "a": "controlli-rimanenze-di-magazzino",
         "et": "Note di controllo"
        }
       ]
      },
      {
       "n": 5,
       "testo": "Rimanenze: commesse e opere a lungo termine",
       "doc": [
        {
         "a": "controlli-rimanenze-commesse-e-opere-a-lungo-termine",
         "et": "Note di controllo"
        }
       ]
      },
      {
       "n": 6,
       "testo": "Attività finanziarie non immobilizzate",
       "doc": [
        {
         "a": "controlli-attivita-finanziarie-non-immobilizzate",
         "et": "Note di controllo"
        }
       ]
      },
      {
       "n": 7,
       "testo": "Crediti commerciali (clienti)",
       "doc": [
        {
         "a": "controlli-crediti-commerciali-clienti",
         "et": "Note di controllo"
        }
       ]
      },
      {
       "n": 8,
       "testo": "Crediti e debiti infragruppo",
       "doc": [
        {
         "a": "controlli-crediti-e-debiti-infragruppo",
         "et": "Note di controllo"
        }
       ]
      },
      {
       "n": 9,
       "testo": "Crediti tributari e per imposte anticipate",
       "doc": [
        {
         "a": "controlli-crediti-tributari-e-per-imposte-anticipate",
         "et": "Note di controllo"
        }
       ]
      },
      {
       "n": 10,
       "testo": "Crediti verso altri",
       "doc": [
        {
         "a": "controlli-crediti-verso-altri",
         "et": "Note di controllo"
        }
       ]
      },
      {
       "n": 11,
       "testo": "Cassa e banche",
       "doc": [
        {
         "a": "controlli-cassa-e-banche",
         "et": "Note di controllo"
        }
       ]
      },
      {
       "n": 12,
       "testo": "Ratei e risconti (attivi e passivi)",
       "doc": [
        {
         "a": "controlli-ratei-e-risconti-attivi-e-passivi",
         "et": "Note di controllo"
        }
       ]
      },
      {
       "n": 13,
       "testo": "Patrimonio netto",
       "doc": [
        {
         "a": "controlli-patrimonio-netto",
         "et": "Note di controllo"
        }
       ]
      },
      {
       "n": 14,
       "testo": "Fondi per rischi e oneri",
       "doc": [
        {
         "a": "controlli-fondi-per-rischi-e-oneri",
         "et": "Note di controllo"
        }
       ]
      },
      {
       "n": 15,
       "testo": "T.F.R. (trattamento di fine rapporto)",
       "doc": [
        {
         "a": "controlli-t-f-r",
         "et": "Note di controllo"
        }
       ]
      },
      {
       "n": 16,
       "testo": "Mutui e finanziamenti non bancari",
       "doc": [
        {
         "a": "controlli-mutui-e-finanziamenti-non-bancari",
         "et": "Note di controllo"
        }
       ]
      },
      {
       "n": 17,
       "testo": "Debiti commerciali (fornitori)",
       "doc": [
        {
         "a": "controlli-debiti-commerciali-fornitori",
         "et": "Note di controllo"
        }
       ]
      },
      {
       "n": 18,
       "testo": "Debiti tributari",
       "doc": [
        {
         "a": "controlli-debiti-tributari",
         "et": "Note di controllo"
        }
       ]
      },
      {
       "n": 19,
       "testo": "Debiti verso altri",
       "doc": [
        {
         "a": "controlli-debiti-verso-altri",
         "et": "Note di controllo"
        }
       ]
      },
      {
       "n": 20,
       "testo": "CE: valore della produzione",
       "doc": [
        {
         "a": "controlli-ce-valore-della-produzione",
         "et": "Note di controllo"
        },
        {
         "a": "verifica-della-corretta-applicazione-del-nuovo-oic-34",
         "et": "Nuovo OIC 34"
        }
       ]
      },
      {
       "n": 21,
       "testo": "CE: costi della produzione",
       "doc": [
        {
         "a": "controlli-ce-costi-della-produzione",
         "et": "Note di controllo"
        }
       ]
      },
      {
       "n": 22,
       "testo": "CE: gestione finanziaria",
       "doc": [
        {
         "a": "controlli-ce-gestione-finanziaria",
         "et": "Note di controllo"
        }
       ]
      },
      {
       "n": 23,
       "testo": "Parti correlate",
       "nota": "Questionario Revisoft, con l'attestazione delle parti correlate in allegato."
      },
      {
       "n": 24,
       "testo": "Fatti censurabili",
       "nota": "Questionario Revisoft."
      },
      {
       "n": 25,
       "testo": "Eventi successivi",
       "nota": "Questionario Revisoft."
      },
      {
       "n": 26,
       "testo": "Continuità aziendale",
       "doc": [
        {
         "a": "verifica-della-continuita-aziendale-linee-guida-per-il-revisore",
         "et": "Verifica della continuità"
        }
       ],
       "nota": "Questionario Revisoft."
      },
      {
       "n": 27,
       "testo": "Relazione sulla gestione",
       "nota": "Questionario Revisoft."
      },
      {
       "n": 28,
       "testo": "Sommario errori",
       "doc": [
        {
         "a": "sommario-errori",
         "et": "Nota"
        }
       ]
      },
      {
       "n": 29,
       "testo": "Promemoria conclusivo",
       "nota": "Questionario Revisoft."
      },
      {
       "n": 30,
       "testo": "Lettera di attestazione",
       "nota": "Da chiedere al responsabile qualità."
      },
      {
       "n": 31,
       "testo": "Giudizio di revisione",
       "nota": "Da chiedere al responsabile qualità."
      }
     ]
    }
   ]
  }
 },
 "allegati": {
  "lettera-di-incarico-revisione-legale": {
   "nome": "Lettera di incarico (revisione legale)",
   "file": "strumenti-revisione/allegati/lettera-di-incarico-revisione-legale.pdf",
   "tipo": "pdf",
   "kb": 5204,
   "drive": "https://drive.google.com/file/d/125YJvjVWF2Uvi8eKUyLIjl3wskwhddKY/view?usp=sharing",
   "titoloDrive": "Incarico_att_v2026_AI"
  },
  "lettera-di-incarico-volontaria-revisione-limitata-annuale": {
   "nome": "Lettera di incarico «volontaria» (revisione limitata annuale)",
   "file": "strumenti-revisione/allegati/lettera-di-incarico-volontaria-revisione-limitata-annuale.pdf",
   "tipo": "pdf",
   "kb": 1518,
   "drive": "https://drive.google.com/file/d/1sfWOzNpsfEJrKsoGfZCLdFAVyF7rGP1h/view?usp=sharing",
   "titoloDrive": "Incarico_revisione_limitata_volontaria_annuale_EDITABILE"
  },
  "memorandum-verifica-annuale-di-adeguata-verifica-privacy-e-indipendenza": {
   "nome": "Memorandum: verifica annuale di adeguata verifica, privacy e indipendenza",
   "file": "strumenti-revisione/allegati/memorandum-verifica-annuale-di-adeguata-verifica-privacy-e-indipendenza.docx",
   "tipo": "docx",
   "kb": 152,
   "drive": "https://docs.google.com/document/d/1QrLV7IP9iPVMz-5GbTYuLcfV70mmSU6nPtNQw9SG2FM/edit?usp=sharing",
   "titoloDrive": "Verifica annuale – Adeguata Verifica, Privacy e Indipendenza 2025",
   "testo": true
  },
  "email-aggiornamento-annuale-di-adeguata-verifica-e-privacy": {
   "nome": "Email: aggiornamento annuale di adeguata verifica e privacy",
   "file": "strumenti-revisione/allegati/email-aggiornamento-annuale-di-adeguata-verifica-e-privacy.docx",
   "tipo": "docx",
   "kb": 8,
   "drive": "https://docs.google.com/document/d/1bQkB-cmXl3j5pt3RD55frff3U1gxbSf3n9TBATnVf9o/edit?usp=sharing",
   "titoloDrive": "Adeguata verifica e Privacy",
   "testo": true
  },
  "allegati-di-adeguata-verifica-privacy-e-raccolta-dati": {
   "nome": "Allegati di adeguata verifica, privacy e raccolta dati",
   "file": "strumenti-revisione/allegati/allegati-di-adeguata-verifica-privacy-e-raccolta-dati.pdf",
   "tipo": "pdf",
   "kb": 801,
   "drive": "https://drive.google.com/file/d/1G_fLXcKdKf1lNIJUMdqaPOUjj5yFFMom/view?usp=sharing",
   "titoloDrive": "Allegati di Adeguata Verifica, Privacy e raccolta dati"
  },
  "dati-email-comunicazione-dell-indirizzo-email-amministrativo": {
   "nome": "Dati email: comunicazione dell'indirizzo email amministrativo",
   "file": "strumenti-revisione/allegati/dati-email-comunicazione-dell-indirizzo-email-amministrativo.docx",
   "tipo": "docx",
   "kb": 7,
   "drive": "https://docs.google.com/document/d/1G_VY2mjmDXdHhbOYk5NoFGsIpqPfAVwwih3VuCk1chQ/edit?usp=sharing",
   "titoloDrive": "Comunicazione indirizzo email amministrativo per attività di revisione legale",
   "testo": true
  },
  "memorandum-attestazione-di-indipendenza": {
   "nome": "Memorandum: attestazione di indipendenza",
   "file": "strumenti-revisione/allegati/memorandum-attestazione-di-indipendenza.docx",
   "tipo": "docx",
   "kb": 8,
   "drive": "https://docs.google.com/document/d/1MAnfLrgo1ZqyTRs0EsxkdAUn10qq0BQJC7E_A1jdhOI/edit?usp=sharing",
   "titoloDrive": "MEMORANDUM – Attestazione di Indipendenza",
   "testo": true
  },
  "email-al-cliente-trasmissione-dell-attestazione-di-indipendenza": {
   "nome": "Email al cliente: trasmissione dell'attestazione di indipendenza",
   "file": "strumenti-revisione/allegati/email-al-cliente-trasmissione-dell-attestazione-di-indipendenza.docx",
   "tipo": "docx",
   "kb": 7,
   "drive": "https://docs.google.com/document/d/1uJPgaGHYCXwhxbpqyLxbfkVvKrRt5URy54pUAg22rZE/edit?usp=sharing",
   "titoloDrive": "EMAIL CLIENTE",
   "testo": true
  },
  "attestazione-di-indipendenza-revilaw": {
   "nome": "Attestazione di indipendenza Revilaw",
   "file": "strumenti-revisione/allegati/attestazione-di-indipendenza-revilaw.docx",
   "tipo": "docx",
   "kb": 41,
   "drive": "https://docs.google.com/document/d/1bQ7MHAtngKXCDodNfdAGjmcwXXYzLR34/edit?usp=sharing&ouid=116491662150692381667&rtpof=true&sd=true",
   "titoloDrive": "Attestazione indipendenza Revilaw",
   "testo": true
  },
  "addendum-alla-lettera-di-incarico-variazione-del-responsabile": {
   "nome": "Addendum alla lettera di incarico (variazione del responsabile)",
   "file": "strumenti-revisione/allegati/addendum-alla-lettera-di-incarico-variazione-del-responsabile.docx",
   "tipo": "docx",
   "kb": 19,
   "drive": "https://docs.google.com/document/d/17_ZzQfvb6zfC3eHAMgW3PqzzzTDTZ7SC/edit?usp=sharing&ouid=116491662150692381667&rtpof=true&sd=true",
   "titoloDrive": "ADDENDUM ALLA LETTERA DI INCARICO DI REVISIONE LEGALE DEI CONTI",
   "testo": true
  },
  "memorandum-scambio-di-informazioni-con-il-revisore-uscente": {
   "nome": "Memorandum: scambio di informazioni con il revisore uscente",
   "file": "strumenti-revisione/allegati/memorandum-scambio-di-informazioni-con-il-revisore-uscente.docx",
   "tipo": "docx",
   "kb": 9,
   "drive": "https://docs.google.com/document/d/14R65IVKdhdot_YY-WOWcSJ2ZNixp9p6t75i4ahkIOkA/edit?usp=sharing",
   "titoloDrive": "Gestione dello scambio di informazioni con il revisore uscente",
   "testo": true
  },
  "allegato-1-assirevi-lettera-della-societa-conferente": {
   "nome": "Allegato 1 Assirevi: lettera della società conferente",
   "file": "strumenti-revisione/allegati/allegato-1-assirevi-lettera-della-societa-conferente.docx",
   "tipo": "docx",
   "kb": 8,
   "drive": "https://docs.google.com/document/d/19VpDE_86nr42EA9eJ66Zf0om4U23asYZroYmKRi6v0k/edit?usp=sharing",
   "titoloDrive": "Allegato 1 Assirevi",
   "testo": true
  },
  "allegato-2-assirevi-lettera-al-revisore-entrante": {
   "nome": "Allegato 2 Assirevi: lettera al revisore entrante",
   "file": "strumenti-revisione/allegati/allegato-2-assirevi-lettera-al-revisore-entrante.docx",
   "tipo": "docx",
   "kb": 9,
   "drive": "https://docs.google.com/document/d/1PYWgggGGCaDjrgAoabRQiXY7eZxJAFxS2d0OiDPO8mw/edit?usp=sharing",
   "titoloDrive": "Allegato 2 Assirevi",
   "testo": true
  },
  "assirevi-documento-di-ricerca-n-212": {
   "nome": "Assirevi, Documento di ricerca n. 212",
   "file": "strumenti-revisione/allegati/assirevi-documento-di-ricerca-n-212.pdf",
   "tipo": "pdf",
   "kb": 130,
   "drive": "https://drive.google.com/file/d/1WO2hy0O7VIq9XOgHUPk_IfdzAL0m4OS0/view?usp=sharing",
   "titoloDrive": "Doc 212_unlocked"
  },
  "modello-iva-indicazioni-per-il-team": {
   "nome": "Modello IVA: indicazioni per il team",
   "file": "strumenti-revisione/allegati/modello-iva-indicazioni-per-il-team.docx",
   "tipo": "docx",
   "kb": 7,
   "drive": "https://drive.google.com/file/d/1U6v30CcFMUD4j2REeRRQSGbA_rkb8afZOiqC28frEZA/view?usp=sharing",
   "titoloDrive": "MODELLO IVA",
   "testo": true
  },
  "memorandum-sottoscrizione-delle-dichiarazioni-fiscali-2026-anno-d-impost": {
   "nome": "Memorandum: sottoscrizione delle dichiarazioni fiscali 2026 (anno d'imposta 2025)",
   "file": "strumenti-revisione/allegati/memorandum-sottoscrizione-delle-dichiarazioni-fiscali-2026-anno-d-impost.docx",
   "tipo": "docx",
   "kb": 61,
   "drive": "https://docs.google.com/document/d/1dqi3nvWIuSkXfHP3eXsct-pWvbZTnpzXh3n8Sj6djd4/edit?usp=sharing",
   "titoloDrive": "Sottoscrizioni dichiarazioni fiscali 2026 (anno di imposta 2025)",
   "testo": true
  },
  "assirevi-documento-di-ricerca-n-208r-2020": {
   "nome": "Assirevi, Documento di ricerca n. 208R/2020",
   "file": "strumenti-revisione/allegati/assirevi-documento-di-ricerca-n-208r-2020.pdf",
   "tipo": "pdf",
   "kb": 186,
   "drive": "https://drive.google.com/file/d/1ccqbo7X0_JjuzJ_IpduxqAcxLK5pQsX6/view?usp=sharing",
   "titoloDrive": "ASSIREVI 208R_2020"
  },
  "check-controlli-documenti-ricevuti-per-la-sottoscrizione": {
   "nome": "Check controlli: documenti ricevuti per la sottoscrizione",
   "file": "strumenti-revisione/allegati/check-controlli-documenti-ricevuti-per-la-sottoscrizione.xlsx",
   "tipo": "xlsx",
   "kb": 16,
   "drive": "https://docs.google.com/spreadsheets/d/1eNKw1ftBP5SmYZhPw5pn0F1fRAfpnObIX6jpmkpKMkI/edit?usp=sharing",
   "titoloDrive": "Sottoscrizioni dichiarazioni fiscali 2025_Revilaw"
  },
  "dubbi-sul-quadro-ro-2026": {
   "nome": "Dubbi sul quadro RO 2026",
   "file": "strumenti-revisione/allegati/dubbi-sul-quadro-ro-2026.docx",
   "tipo": "docx",
   "kb": 8,
   "drive": "https://docs.google.com/document/d/1S0TyjaRXP4ZsgMrp69uOi9PFvYElmdULBZ4-9jXTOIk/edit?usp=sharing",
   "titoloDrive": "Quadro RO 2026",
   "testo": true
  },
  "email-al-cliente-trasmissione-dei-modelli-770-redditi-sc-irap-e-cnm-2026": {
   "nome": "Email al cliente: trasmissione dei modelli 770, Redditi SC, IRAP e CNM 2026",
   "file": "strumenti-revisione/allegati/email-al-cliente-trasmissione-dei-modelli-770-redditi-sc-irap-e-cnm-2026.docx",
   "tipo": "docx",
   "kb": 9,
   "drive": "https://docs.google.com/document/d/1ARsF8vOti2agnWurMKdo3ewac-rGEuX8bEXEadmzriA/edit?usp=sharing",
   "titoloDrive": "EMAIL TRASMISSIONE DICHIARAZIONI 2026 (2025)",
   "testo": true
  },
  "attestazione-sulle-dichiarazioni-2026-2025": {
   "nome": "Attestazione sulle dichiarazioni 2026 (2025)",
   "file": "strumenti-revisione/allegati/attestazione-sulle-dichiarazioni-2026-2025.docx",
   "tipo": "docx",
   "kb": 317,
   "drive": "https://docs.google.com/document/d/1DUELBjtcnb7rmQENgMYW05SVqVmqeaDlX75xjnLlULs/edit?usp=sharing",
   "titoloDrive": "ATTESTAZIONE DICHIARAZIONI 2026 (2025)",
   "testo": true
  },
  "memorandum-concordato-preventivo-biennale-novita-2025-e-fac-simile-di-de": {
   "nome": "Memorandum: Concordato preventivo biennale, novità 2025 e fac-simile di delibera",
   "file": "strumenti-revisione/allegati/memorandum-concordato-preventivo-biennale-novita-2025-e-fac-simile-di-de.docx",
   "tipo": "docx",
   "kb": 9,
   "drive": "https://docs.google.com/document/d/1YolxP8XKK71wptH7oEpKNH1JM7BnELnhAfJKkpNJHC4/edit?usp=sharing",
   "titoloDrive": "Concordato Preventivo Biennale (CPB) – Novità 2025 e fac-simile di delibera",
   "testo": true
  },
  "verbale-di-assemblea-dei-soci-per-il-cpb-2026": {
   "nome": "Verbale di assemblea dei soci per il CPB (2026)",
   "file": "strumenti-revisione/allegati/verbale-di-assemblea-dei-soci-per-il-cpb-2026.docx",
   "tipo": "docx",
   "kb": 12,
   "drive": "https://docs.google.com/document/d/1ZuFSZ7mPRbR017XjquiVtJmI6KxNUhr0/edit?usp=sharing&ouid=116491662150692381667&rtpof=true&sd=true",
   "titoloDrive": "Verbale di assemblea di S.r.l. 2026 per la valutazione del concordato preventivo biennale",
   "testo": true
  },
  "verbale-di-delibera-dell-organo-amministrativo-per-il-cpb-2026": {
   "nome": "Verbale di delibera dell'organo amministrativo per il CPB (2026)",
   "file": "strumenti-revisione/allegati/verbale-di-delibera-dell-organo-amministrativo-per-il-cpb-2026.docx",
   "tipo": "docx",
   "kb": 11,
   "drive": "https://docs.google.com/document/d/1DH9YR71l4rgrlX8k4LfkEJHq6gnAA-tl/edit?usp=sharing&ouid=116491662150692381667&rtpof=true&sd=true",
   "titoloDrive": "Verbale di Delibera dell’Organo Amministrativo 2026",
   "testo": true
  },
  "attestazione-dell-organo-amministrativo-per-il-cpb-2026": {
   "nome": "Attestazione dell'organo amministrativo per il CPB (2026)",
   "file": "strumenti-revisione/allegati/attestazione-dell-organo-amministrativo-per-il-cpb-2026.docx",
   "tipo": "docx",
   "kb": 321,
   "drive": "https://docs.google.com/document/d/1Yru55hUhyTvg-INa7ht5bxqiUqh1MQHi/edit?usp=sharing&ouid=116491662150692381667&rtpof=true&sd=true",
   "titoloDrive": "Attestazione dell'Organo Amministrativo 2026 per la valutazione dei rischi e l'adesione al Concordato Preventivo Biennale",
   "testo": true
  },
  "memorandum-invio-della-documentazione-e-istruzioni-per-il-modulo-2026": {
   "nome": "Memorandum: invio della documentazione e istruzioni per il modulo 2026",
   "file": "strumenti-revisione/allegati/memorandum-invio-della-documentazione-e-istruzioni-per-il-modulo-2026.docx",
   "tipo": "docx",
   "kb": 9,
   "drive": "https://docs.google.com/document/d/11lhudAGdbIpEgmLnpnYfzBtq4Cm0FP98kpbUQkHI7f0/edit?usp=sharing",
   "titoloDrive": "Invio documentazione dichiarazioni fiscali e istruzioni per il modulo 2026",
   "testo": true
  },
  "email-richiesta-del-primo-incontro-nuovo-incarico": {
   "nome": "Email: richiesta del primo incontro (nuovo incarico)",
   "file": "strumenti-revisione/allegati/email-richiesta-del-primo-incontro-nuovo-incarico.docx",
   "tipo": "docx",
   "kb": 9,
   "drive": "https://docs.google.com/document/d/10B49LyTefke8QvgjJn32qPz-BeJ60HsSt0JJPJpx9Rk/edit?usp=sharing",
   "titoloDrive": "EMAIL NUOVO INCARICO",
   "testo": true
  },
  "allegato-attestazione-delle-polizze-assicurative": {
   "nome": "Allegato: attestazione delle polizze assicurative",
   "file": "strumenti-revisione/allegati/allegato-attestazione-delle-polizze-assicurative.docx",
   "tipo": "docx",
   "kb": 10,
   "drive": "https://docs.google.com/document/d/1itwOQJxG7Czq0XBNKltMEJjzBKD4Rywy/edit?usp=sharing&ouid=116491662150692381667&rtpof=true&sd=true",
   "titoloDrive": "ATTESTAZIONE POLIZZE ASSICURATIVE",
   "testo": true
  },
  "email-invio-dell-attestazione-di-indipendenza": {
   "nome": "Email: invio dell'attestazione di indipendenza",
   "file": "strumenti-revisione/allegati/email-invio-dell-attestazione-di-indipendenza.docx",
   "tipo": "docx",
   "kb": 7,
   "drive": "https://docs.google.com/document/d/1ccS885IJ0K5xVhqZ3wzZq-Wn8LTrTfAaRrEORfVEFn8/edit?usp=sharing",
   "titoloDrive": "EMAIL ATTESTAZIONE DI INDIPENDENZA",
   "testo": true
  },
  "attestazione-di-indipendenza": {
   "nome": "Attestazione di indipendenza",
   "file": "strumenti-revisione/allegati/attestazione-di-indipendenza.docx",
   "tipo": "docx",
   "kb": 13,
   "drive": "https://docs.google.com/document/d/1V_wOabEOxXAp15-Lk6_o4_CUEp8a10M0WgQFruXonEI/edit?usp=sharing",
   "titoloDrive": "ATTESTAZIONE DI INDIPENDENZA",
   "testo": true
  },
  "email-richiesta-di-incontro-e-documenti-per-la-verifica-trimestrale": {
   "nome": "Email: richiesta di incontro e documenti per la verifica trimestrale",
   "file": "strumenti-revisione/allegati/email-richiesta-di-incontro-e-documenti-per-la-verifica-trimestrale.docx",
   "tipo": "docx",
   "kb": 9,
   "drive": "https://docs.google.com/document/d/1fuSZWBjhZWm1Uwg2ySUTiHSo0ti80XhD8BD1g-9EoTE/edit?usp=sharing",
   "titoloDrive": "EMAIL VERIFICA TRIMESTRALE",
   "testo": true
  },
  "bilancio-standard-comparato": {
   "nome": "Bilancio standard comparato",
   "file": "strumenti-revisione/allegati/bilancio-standard-comparato.xlsx",
   "tipo": "xlsx",
   "kb": 82,
   "drive": "https://docs.google.com/spreadsheets/d/1S1KtzX2XdPX0jVyG5fpnEB2Z5ZDmLXaMWOwHW0Qvk1U/edit?usp=sharing",
   "titoloDrive": "Bilancio Standard 2025"
  },
  "verbale-di-consegna-del-bilancio-trimestrale": {
   "nome": "Verbale di consegna del bilancio trimestrale",
   "file": "strumenti-revisione/allegati/verbale-di-consegna-del-bilancio-trimestrale.docx",
   "tipo": "docx",
   "kb": 9,
   "drive": "https://docs.google.com/document/d/1QY2G_0nigNdsu_4BtIva8B5HKVk4W0RwrCmd_g2WeX8/edit?usp=sharing",
   "titoloDrive": "Verbale di consegna del bilancio trimestrale",
   "testo": true
  },
  "segnalazioni-durante-le-verifiche-in-corso-di-esercizio-sa-250b": {
   "nome": "Segnalazioni durante le verifiche in corso di esercizio (SA 250B)",
   "file": "strumenti-revisione/allegati/segnalazioni-durante-le-verifiche-in-corso-di-esercizio-sa-250b.docx",
   "tipo": "docx",
   "kb": 8,
   "drive": "https://docs.google.com/document/d/1IH9Z4FkTvXzGCSmnVQpK6smwG4Jzx0KEyIMb00MoFi4/edit?usp=sharing",
   "titoloDrive": "Differenze tra le segnalazioni di un revisore durante le verifiche in corso di esercizio ai sensi del Principio SA 250B e le segnalazioni effettuate durante l'emissione del giudizio di revisione",
   "testo": true
  },
  "sintesi-del-documento-di-ricerca-assirevi-n-259": {
   "nome": "Sintesi del Documento di ricerca Assirevi n. 259",
   "file": "strumenti-revisione/allegati/sintesi-del-documento-di-ricerca-assirevi-n-259.docx",
   "tipo": "docx",
   "kb": 11,
   "drive": "https://docs.google.com/document/d/1BCef1uouc7LV38S6K10HbQujQrNnZUAavwvD-mKIuiE/edit?usp=sharing",
   "titoloDrive": "SINTESI DOCUMENTO DI RICERCA 259 ASSIREVI",
   "testo": true
  },
  "assirevi-documento-di-ricerca-n-259": {
   "nome": "Assirevi, Documento di ricerca n. 259",
   "file": "strumenti-revisione/allegati/assirevi-documento-di-ricerca-n-259.pdf",
   "tipo": "pdf",
   "kb": 400,
   "drive": "https://drive.google.com/file/d/1B2wDeOXZuhfoNVqNnYpgUOg9Z7iQrbH9/view?usp=sharing",
   "titoloDrive": "ASSIREVI_Documento di Ricerca n. 259"
  },
  "test-segnali-di-crisi-ex-art-3-c-4-ccii": {
   "nome": "Test: segnali di crisi ex art. 3, c. 4 CCII",
   "file": "strumenti-revisione/allegati/test-segnali-di-crisi-ex-art-3-c-4-ccii.xlsx",
   "tipo": "xlsx",
   "kb": 61,
   "drive": "https://docs.google.com/spreadsheets/d/1_xvp77mHHwGIoYz_q3hNk7FxPaVGoNdoSAG_Kz6Bm-0/edit?usp=sharing",
   "titoloDrive": "Emersione di segnali di cui all’art. 3, c. 4 del CCII nello svolgimento delle verifiche ai sensi principio SA 250b"
  },
  "email-inventario-di-fine-anno": {
   "nome": "Email: inventario di fine anno",
   "file": "strumenti-revisione/allegati/email-inventario-di-fine-anno.docx",
   "tipo": "docx",
   "kb": 9,
   "drive": "https://docs.google.com/document/d/1Z2DLNQ0vq33JmdSkJoDKlscPN1Xm0pFYl16YX6yebjM/edit?usp=sharing",
   "titoloDrive": "EMAIL INVENTARIO 2025",
   "testo": true
  },
  "allegato-1-manuale-di-inventario-fac-simile": {
   "nome": "Allegato 1: manuale di inventario (fac-simile)",
   "file": "strumenti-revisione/allegati/allegato-1-manuale-di-inventario-fac-simile.docx",
   "tipo": "docx",
   "kb": 201,
   "drive": "https://docs.google.com/document/d/1OF2C9Zvy_jGhcrH-OBPcFrqQJqMbLa4U/edit?usp=sharing&ouid=116491662150692381667&rtpof=true&sd=true",
   "titoloDrive": "All 1_Manuale Inventario_Fac Simile",
   "testo": true
  },
  "allegato-2-attestazione-frontespizio-da-inviare-con-il-bilancio": {
   "nome": "Allegato 2: attestazione (frontespizio da inviare con il bilancio)",
   "file": "strumenti-revisione/allegati/allegato-2-attestazione-frontespizio-da-inviare-con-il-bilancio.docx",
   "tipo": "docx",
   "kb": 249,
   "drive": "https://docs.google.com/document/d/1ODtx_V6IEgaIa57rhadQkZKVNvIvL1oX/edit?usp=sharing&ouid=116491662150692381667&rtpof=true&sd=true",
   "titoloDrive": "All 2_Attestazione",
   "testo": true
  },
  "allegato-3-focus-sulla-revisione-delle-rimanenze-di-magazzino": {
   "nome": "Allegato 3: focus sulla revisione delle rimanenze di magazzino",
   "file": "strumenti-revisione/allegati/allegato-3-focus-sulla-revisione-delle-rimanenze-di-magazzino.pdf",
   "tipo": "pdf",
   "kb": 661,
   "drive": "https://drive.google.com/file/d/183X6zwVK5ellvbq1Y93_oq4dLTmXvib2/view?usp=sharing",
   "titoloDrive": "Revisione delle rimanenze di magazzino 2025"
  },
  "allegato-4-valorizzazione-dell-inventario-di-magazzino-cliente": {
   "nome": "Allegato 4: valorizzazione dell'inventario di magazzino (cliente)",
   "file": "strumenti-revisione/allegati/allegato-4-valorizzazione-dell-inventario-di-magazzino-cliente.xlsx",
   "tipo": "xlsx",
   "kb": 57,
   "drive": "https://docs.google.com/spreadsheets/d/1OFn7O3I9QNP8DiUfv3gpGI6NyuRubOr2/edit?usp=sharing&ouid=116491662150692381667&rtpof=true&sd=true",
   "titoloDrive": "Valorizzazione dell'inventario di magazzino_cliente"
  },
  "lettera-di-circolarizzazione-ai-depositari-delle-rimanenze": {
   "nome": "Lettera di circolarizzazione ai depositari delle rimanenze",
   "file": "strumenti-revisione/allegati/lettera-di-circolarizzazione-ai-depositari-delle-rimanenze.docx",
   "tipo": "docx",
   "kb": 319,
   "drive": "https://docs.google.com/document/d/1JfcQLGQLRmK968Sh68HtGPtf8SdhvGoQ/edit?usp=sharing&ouid=116491662150692381667&rtpof=true&sd=true",
   "titoloDrive": "Lettera ai depositanti Rimanenze di Magazzino 2025",
   "testo": true
  },
  "esempio-della-carta-di-lavoro-3-4-4-pianificazione": {
   "nome": "Esempio della carta di lavoro 3.4.4 Pianificazione",
   "file": "strumenti-revisione/allegati/esempio-della-carta-di-lavoro-3-4-4-pianificazione.pdf",
   "tipo": "pdf",
   "kb": 48,
   "drive": "https://drive.google.com/file/d/1D6KJiMn4u0YU8k5a5YiHMvWJ_j8Ep2Kw/view?usp=sharing",
   "titoloDrive": "carta_lavoro-20241207033422"
  },
  "carta-di-lavoro-conta-fisica-del-revisore": {
   "nome": "Carta di lavoro: conta fisica del revisore",
   "file": "strumenti-revisione/allegati/carta-di-lavoro-conta-fisica-del-revisore.xlsx",
   "tipo": "xlsx",
   "kb": 57,
   "drive": "https://docs.google.com/spreadsheets/d/1zhhov_TXx7QcsZKXRqjvVnnRN3tnI5AG/edit?usp=sharing&ouid=116491662150692381667&rtpof=true&sd=true",
   "titoloDrive": "Carta_di_Lavoro_Conta fisica"
  },
  "carta-di-lavoro-slow-moving": {
   "nome": "Carta di lavoro: slow moving",
   "file": "strumenti-revisione/allegati/carta-di-lavoro-slow-moving.xlsx",
   "tipo": "xlsx",
   "kb": 63,
   "drive": "https://docs.google.com/spreadsheets/d/1seeG-RDVvPvKGjsX1cA0eQ-zwcUc2DWB/edit?usp=sharing&ouid=116491662150692381667&rtpof=true&sd=true",
   "titoloDrive": "Carta_di_Lavoro_Slow Moving"
  },
  "carta-di-lavoro-price-test": {
   "nome": "Carta di lavoro: price test",
   "file": "strumenti-revisione/allegati/carta-di-lavoro-price-test.xlsx",
   "tipo": "xlsx",
   "kb": 53,
   "drive": "https://docs.google.com/spreadsheets/d/1yCUeUmOkSt9Fw5m51yzuG4XgkuAedhLL/edit?usp=sharing&ouid=116491662150692381667&rtpof=true&sd=true",
   "titoloDrive": "Carta_di_Lavoro_Price Test"
  },
  "carta-di-lavoro-cut-off": {
   "nome": "Carta di lavoro: cut-off",
   "file": "strumenti-revisione/allegati/carta-di-lavoro-cut-off.xlsx",
   "tipo": "xlsx",
   "kb": 56,
   "drive": "https://docs.google.com/spreadsheets/d/1yybgJj6xDwtRzA0qm5USVjGk3rrWKX8g/edit?usp=sharing&ouid=116491662150692381667&rtpof=true&sd=true",
   "titoloDrive": "Carta_di_Lavoro_Cut-off Test."
  },
  "verbale-di-verifica-del-magazzino": {
   "nome": "Verbale di verifica del magazzino",
   "file": "strumenti-revisione/allegati/verbale-di-verifica-del-magazzino.docx",
   "tipo": "docx",
   "kb": 227,
   "drive": "https://docs.google.com/document/d/164g8bVGItU_to5r-cFKkS-PZtPh0yD_r/edit?usp=sharing&ouid=116491662150692381667&rtpof=true&sd=true",
   "titoloDrive": "All.1 - VERBALE VERIFICA MAGAZZINO 2025",
   "testo": true
  },
  "email-al-cliente-richiesta-dell-attestazione-per-le-circolarizzazioni": {
   "nome": "Email al cliente: richiesta dell'attestazione per le circolarizzazioni",
   "file": "strumenti-revisione/allegati/email-al-cliente-richiesta-dell-attestazione-per-le-circolarizzazioni.docx",
   "tipo": "docx",
   "kb": 8,
   "drive": "https://docs.google.com/document/d/1NCU_0TBgX2Vzo8seTDqprocAOkHRVbQLtABDkaX7m1s/edit?usp=sharing",
   "titoloDrive": "EMAIL CIRC. OBBLIGATORIE 2025",
   "testo": true
  },
  "attestazione-dei-soggetti-obbligatori-pdf-compilabile": {
   "nome": "Attestazione dei soggetti obbligatori (PDF compilabile)",
   "file": "strumenti-revisione/allegati/attestazione-dei-soggetti-obbligatori-pdf-compilabile.pdf",
   "tipo": "pdf",
   "kb": 243,
   "drive": "https://drive.google.com/file/d/1YhggICDkwT_nF-g7T5Ucmx360x5wOu7u/view?usp=sharing",
   "titoloDrive": "ATTESTAZIONE SOGGETTI OBBLIGATORI_EDITABILE"
  },
  "autocertificazione-rischi-legali": {
   "nome": "Autocertificazione rischi legali",
   "file": "strumenti-revisione/allegati/autocertificazione-rischi-legali.docx",
   "tipo": "docx",
   "kb": 9,
   "drive": "https://docs.google.com/document/d/1PtIMYPvy9Y0wU-D1GlQ4Cfz-ZZqKYTF07VXdNv3pgfY/edit?usp=sharing",
   "titoloDrive": "AUTOCERTIFICAZIONE RISCHI LEGALI",
   "testo": true
  },
  "guida-pratica-circolarizzazioni-e-conferme-legali": {
   "nome": "Guida pratica: circolarizzazioni e conferme legali",
   "file": "strumenti-revisione/allegati/guida-pratica-circolarizzazioni-e-conferme-legali.docx",
   "tipo": "docx",
   "kb": 15,
   "drive": "https://docs.google.com/document/d/1wy9vjmlXMmzsT4BGnxvQac5yzDUFR2yb/edit?usp=sharing&ouid=116491662150692381667&rtpof=true&sd=true",
   "titoloDrive": "Guida_pratica_circolarizzazioni_e_conferme_legali",
   "testo": true
  },
  "lettera-alla-societa-incaricata-della-conta-fisica-delle-rimanenze": {
   "nome": "Lettera alla società incaricata della conta fisica delle rimanenze",
   "file": "strumenti-revisione/allegati/lettera-alla-societa-incaricata-della-conta-fisica-delle-rimanenze.docx",
   "tipo": "docx",
   "kb": 14,
   "drive": "https://drive.google.com/file/d/1bI7xJcoYK62BseGZcbURoiPj61vdQw9j/view?usp=sharing",
   "titoloDrive": "Lettera_societa_incaricata_conta_fisica_Rimanenze_di_Magazzino",
   "testo": true
  },
  "lettera-agli-enti-finanziatori": {
   "nome": "Lettera agli enti finanziatori",
   "file": "strumenti-revisione/allegati/lettera-agli-enti-finanziatori.docx",
   "tipo": "docx",
   "kb": 320,
   "drive": "https://drive.google.com/file/d/1fTtDcJczbNWprvdr2f_GjIOdkyVGSEg5/view?usp=sharing",
   "titoloDrive": "Lettera agli Enti Finanziatori",
   "testo": true
  },
  "lettera-agli-istituti-di-credito": {
   "nome": "Lettera agli istituti di credito",
   "file": "strumenti-revisione/allegati/lettera-agli-istituti-di-credito.docx",
   "tipo": "docx",
   "kb": 18,
   "drive": "https://drive.google.com/file/d/1-YZnibhx3WCLBhqY7AhXooO3BwA2ICx1/view?usp=sharing",
   "titoloDrive": "Lettera agli Istituti di Credito",
   "testo": true
  },
  "lettera-all-amministrazione-postale": {
   "nome": "Lettera all'amministrazione postale",
   "file": "strumenti-revisione/allegati/lettera-all-amministrazione-postale.docx",
   "tipo": "docx",
   "kb": 16,
   "drive": "https://drive.google.com/file/d/1YgmJg0w9G70U6Ad1w4gTlnTpLRoDGBKb/view?usp=sharing",
   "titoloDrive": "Lettera alla Amministrazione Postale",
   "testo": true
  },
  "lettera-ai-consulenti-del-lavoro": {
   "nome": "Lettera ai consulenti del lavoro",
   "file": "strumenti-revisione/allegati/lettera-ai-consulenti-del-lavoro.docx",
   "tipo": "docx",
   "kb": 320,
   "drive": "https://drive.google.com/file/d/1dP-ZTDQ1gy9aP8ZTfVzP7RGHXRBU7yhr/view?usp=sharing",
   "titoloDrive": "Lettera ai Consulenti del lavoro",
   "testo": true
  },
  "lettera-ai-consulenti-fiscali": {
   "nome": "Lettera ai consulenti fiscali",
   "file": "strumenti-revisione/allegati/lettera-ai-consulenti-fiscali.docx",
   "tipo": "docx",
   "kb": 17,
   "drive": "https://drive.google.com/file/d/1r7fzw8Yz9o03djBdg3tRj008u31pSDga/view?usp=sharing",
   "titoloDrive": "Lettera ai Consulenti Fiscali",
   "testo": true
  },
  "lettera-ai-consulenti-legali": {
   "nome": "Lettera ai consulenti legali",
   "file": "strumenti-revisione/allegati/lettera-ai-consulenti-legali.docx",
   "tipo": "docx",
   "kb": 17,
   "drive": "https://drive.google.com/file/d/1FfzVhk-owKQmccDaYkwNdXHoiSHlH0Nh/view?usp=sharing",
   "titoloDrive": "Lettera ai Consulenti Legali",
   "testo": true
  },
  "lettera-alle-compagnie-assicurative": {
   "nome": "Lettera alle compagnie assicurative",
   "file": "strumenti-revisione/allegati/lettera-alle-compagnie-assicurative.docx",
   "tipo": "docx",
   "kb": 16,
   "drive": "https://drive.google.com/file/d/1h9UAkGeXsARdzXKqnlamTsVCGEKlPofB/view?usp=sharing",
   "titoloDrive": "Lettera alle Compagnie Assicurative",
   "testo": true
  },
  "lettera-alle-societa-di-leasing": {
   "nome": "Lettera alle società di leasing",
   "file": "strumenti-revisione/allegati/lettera-alle-societa-di-leasing.docx",
   "tipo": "docx",
   "kb": 16,
   "drive": "https://drive.google.com/file/d/1U0zY0Ekg-xNKUu6rVCEndiDy_Sz7Y-z0/view?usp=sharing",
   "titoloDrive": "Lettera alle società di Leasing",
   "testo": true
  },
  "lettera-alle-societa-di-factor": {
   "nome": "Lettera alle società di factor",
   "file": "strumenti-revisione/allegati/lettera-alle-societa-di-factor.docx",
   "tipo": "docx",
   "kb": 17,
   "drive": "https://drive.google.com/file/d/1nafR7iiTkyIjkJhGXBTudLJ33onNNVzg/view?usp=sharing",
   "titoloDrive": "Lettera alle società di Factor",
   "testo": true
  },
  "lettera-ai-depositanti-delle-rimanenze-di-magazzino": {
   "nome": "Lettera ai depositanti delle rimanenze di magazzino",
   "file": "strumenti-revisione/allegati/lettera-ai-depositanti-delle-rimanenze-di-magazzino.docx",
   "tipo": "docx",
   "kb": 15,
   "drive": "https://drive.google.com/file/d/1QP1MIW2xWrp2jg5y5Sddh0jQhNxS_iRU/view?usp=sharing",
   "titoloDrive": "Lettera ai depositanti Rimanenze di Magazzino",
   "testo": true
  },
  "lettera-alle-parti-correlate-gruppi-societari": {
   "nome": "Lettera alle parti correlate (gruppi societari)",
   "file": "strumenti-revisione/allegati/lettera-alle-parti-correlate-gruppi-societari.docx",
   "tipo": "docx",
   "kb": 17,
   "drive": "https://docs.google.com/document/d/1te9HXHrPd2M5D2k6bMOXlLHEGy-ZJzZa/edit?usp=sharing&ouid=116491662150692381667&rtpof=true&sd=true",
   "titoloDrive": "Lettera alle parti correlate (gruppi societari)",
   "testo": true
  },
  "email-invio-delle-lettere-di-circolarizzazione": {
   "nome": "Email: invio delle lettere di circolarizzazione",
   "file": "strumenti-revisione/allegati/email-invio-delle-lettere-di-circolarizzazione.docx",
   "tipo": "docx",
   "kb": 7,
   "drive": "https://docs.google.com/document/d/1wevAdLlPkrXtUWH3g8cYiJ-dJiBtFcYdw-x8XYJ1wTk/edit?usp=sharing",
   "titoloDrive": "EMAIL INVIO CIRC. OBBLIGATORIE",
   "testo": true
  },
  "report-del-team-soggetti-obbligatori-e-risposte": {
   "nome": "Report del team: soggetti obbligatori e risposte",
   "file": "strumenti-revisione/allegati/report-del-team-soggetti-obbligatori-e-risposte.xlsx",
   "tipo": "xlsx",
   "kb": 51,
   "drive": "https://docs.google.com/spreadsheets/d/1QhC-SLWPGRrBa4lTQrBoAnGmjmjbvZ3v/edit?usp=sharing&ouid=116491662150692381667&rtpof=true&sd=true",
   "titoloDrive": "ELENCO OBBLIGATORI"
  },
  "email-richiesta-della-centrale-rischi": {
   "nome": "Email: richiesta della Centrale Rischi",
   "file": "strumenti-revisione/allegati/email-richiesta-della-centrale-rischi.docx",
   "tipo": "docx",
   "kb": 7,
   "drive": "https://docs.google.com/document/d/1r8ThZ2StukmYgHdppzP63jeFDWK7ASKtXrmHveRVzeA/edit?usp=sharing",
   "titoloDrive": "EMAIL CENTRALE RISCHI 2025",
   "testo": true
  },
  "email-richiesta-del-libro-cespiti": {
   "nome": "Email: richiesta del libro cespiti",
   "file": "strumenti-revisione/allegati/email-richiesta-del-libro-cespiti.docx",
   "tipo": "docx",
   "kb": 7,
   "drive": "https://docs.google.com/document/d/1ylUOzHFZT_1zO5g0mw90owJ1C-n7NAurvtB0tOmSRMY/edit?usp=sharing",
   "titoloDrive": "EMAIL RICHIESTA LIBRO CESPITI 2025",
   "testo": true
  },
  "grandezza-del-campione": {
   "nome": "Grandezza del campione",
   "file": "strumenti-revisione/allegati/grandezza-del-campione.docx",
   "tipo": "docx",
   "kb": 24,
   "drive": "https://docs.google.com/document/d/1m8698Pb1nuCXt6XtG2ZISgyU4TorQklYMPsvZF0vljU/edit?usp=sharing",
   "titoloDrive": "GRANDEZZA CAMPIONE",
   "testo": true
  },
  "campionamento-ragionato-dei-cespiti": {
   "nome": "Campionamento ragionato dei cespiti",
   "file": "strumenti-revisione/allegati/campionamento-ragionato-dei-cespiti.docx",
   "tipo": "docx",
   "kb": 7,
   "drive": "https://docs.google.com/document/d/1OHqcu6Qu-qxO2aE8TXrmDfbVsqB974saqTer26U6-R4/edit?usp=sharing",
   "titoloDrive": "CAMPIONAMENTO RAGIONATO CESPITI",
   "testo": true
  },
  "test-overall-del-fondo-ammortamento": {
   "nome": "Test overall del fondo ammortamento",
   "file": "strumenti-revisione/allegati/test-overall-del-fondo-ammortamento.xlsx",
   "tipo": "xlsx",
   "kb": 55,
   "drive": "https://docs.google.com/spreadsheets/d/1kIxvHzzSfycHmhatAhDsYe_OLcZfvz11SXOdC1n_Dbc/edit?usp=sharing",
   "titoloDrive": "Excel test overall fondo amm.to"
  },
  "test-di-ricalcolo-delle-quote-di-ammortamento": {
   "nome": "Test di ricalcolo delle quote di ammortamento",
   "file": "strumenti-revisione/allegati/test-di-ricalcolo-delle-quote-di-ammortamento.xlsx",
   "tipo": "xlsx",
   "kb": 56,
   "drive": "https://docs.google.com/spreadsheets/d/108k8VJthMDb0x44YA_tShyquBKmzkxpAc3-vkMqnHBs/edit?usp=sharing",
   "titoloDrive": "Test ricalcolo quote amm.to"
  },
  "test-incrementi-e-decrementi": {
   "nome": "Test incrementi e decrementi",
   "file": "strumenti-revisione/allegati/test-incrementi-e-decrementi.xlsx",
   "tipo": "xlsx",
   "kb": 119,
   "drive": "https://docs.google.com/spreadsheets/d/1UP-AJ2gD1Hf123_dCbIZlPJq1XIQtyA1nBxfVND75bY/edit?usp=sharing",
   "titoloDrive": "Excel Test incrementi-decrementi"
  },
  "verbale-di-verifica-dei-beni-strumentali": {
   "nome": "Verbale di verifica dei beni strumentali",
   "file": "strumenti-revisione/allegati/verbale-di-verifica-dei-beni-strumentali.docx",
   "tipo": "docx",
   "kb": 485,
   "drive": "https://docs.google.com/document/d/1BnoJNt9ZHOJz6uun-5nI7H8EZbLZS6mo/edit?usp=sharing&ouid=116491662150692381667&rtpof=true&sd=true",
   "titoloDrive": "VERBALE BENI STRUMENTALI",
   "testo": true
  },
  "email-richiesta-della-documentazione-per-la-circolarizzazione-clienti-e": {
   "nome": "Email: richiesta della documentazione per la circolarizzazione clienti e fornitori",
   "file": "strumenti-revisione/allegati/email-richiesta-della-documentazione-per-la-circolarizzazione-clienti-e.docx",
   "tipo": "docx",
   "kb": 8,
   "drive": "https://docs.google.com/document/d/1H25CJl83bCrGGhlVwWY6rjvU9KVY7Bwz1j-lkKuWO28/edit?usp=sharing",
   "titoloDrive": "Richiesta documentazione per circolarizzazione clienti e fornitori – Esercizio 2024",
   "testo": true
  },
  "allegato-elenco-clienti": {
   "nome": "Allegato: elenco clienti",
   "file": "strumenti-revisione/allegati/allegato-elenco-clienti.xlsx",
   "tipo": "xlsx",
   "kb": 11,
   "drive": "https://docs.google.com/spreadsheets/d/1QcYruMdBgF1r1EsFoLTy3OCLYiNyOm5o/edit?usp=sharing&ouid=116491662150692381667&rtpof=true&sd=true",
   "titoloDrive": "ELENCO CLIENTI"
  },
  "allegato-elenco-fornitori": {
   "nome": "Allegato: elenco fornitori",
   "file": "strumenti-revisione/allegati/allegato-elenco-fornitori.xlsx",
   "tipo": "xlsx",
   "kb": 11,
   "drive": "https://docs.google.com/spreadsheets/d/1QeOYm4hzXH0P32d4iw1MKh94_uWtuLZz/edit?usp=sharing&ouid=116491662150692381667&rtpof=true&sd=true",
   "titoloDrive": "ELENCO FORNITORI"
  },
  "note-sui-segni-dei-saldi-dare-avere": {
   "nome": "Note sui segni +/- dei saldi dare/avere",
   "file": "strumenti-revisione/allegati/note-sui-segni-dei-saldi-dare-avere.docx",
   "tipo": "docx",
   "kb": 7,
   "drive": "https://docs.google.com/document/d/10Lla3tb5DvDKdiwVW_-0Ep8n46zlLOAAXHPkWI1miUc/edit?usp=sharing",
   "titoloDrive": "Chiarimenti segni +/- per i saldi dare/avere",
   "testo": true
  },
  "istruzioni-revisoft-campionamento": {
   "nome": "Istruzioni Revisoft: campionamento",
   "file": "strumenti-revisione/allegati/istruzioni-revisoft-campionamento.pdf",
   "tipo": "pdf",
   "kb": 771,
   "drive": "https://drive.google.com/file/d/1Xux8CbhV7Op3Rm6s1rgqtBQ638ocqCA6/view?usp=sharing",
   "titoloDrive": "17Campionamento"
  },
  "chiarimenti-per-il-campionamento": {
   "nome": "Chiarimenti per il campionamento",
   "file": "strumenti-revisione/allegati/chiarimenti-per-il-campionamento.pdf",
   "tipo": "pdf",
   "kb": 164,
   "drive": "https://drive.google.com/file/d/1mHgZjl_wm_gwmL8CgwHFeExYJLZAgS_t/view?usp=sharing",
   "titoloDrive": "CHIARIMENTI PER IL CAMPIONAMENTO"
  },
  "xls-per-il-campionamento-pec-di-clienti-e-fornitori": {
   "nome": "Xls per il campionamento: PEC di clienti e fornitori",
   "file": "strumenti-revisione/allegati/xls-per-il-campionamento-pec-di-clienti-e-fornitori.xlsx",
   "tipo": "xlsx",
   "kb": 40,
   "drive": "https://docs.google.com/spreadsheets/d/1nkrtGNdI3gItwe_6sl4AbBS1_j98lmmk/edit?usp=sharing&ouid=116491662150692381667&rtpof=true&sd=true",
   "titoloDrive": "ELENCO_PEC_CLIENTI/FORNITORI"
  },
  "lettera-ai-clienti": {
   "nome": "Lettera ai clienti",
   "file": "strumenti-revisione/allegati/lettera-ai-clienti.docx",
   "tipo": "docx",
   "kb": 322,
   "drive": "https://docs.google.com/document/d/12HHx3C8DAxsRMGLKud_Bz1eu9LwOO_jv/edit?usp=sharing&ouid=116491662150692381667&rtpof=true&sd=true",
   "titoloDrive": "Lettera ai Clienti_v2025",
   "testo": true
  },
  "lettera-ai-fornitori": {
   "nome": "Lettera ai fornitori",
   "file": "strumenti-revisione/allegati/lettera-ai-fornitori.docx",
   "tipo": "docx",
   "kb": 16,
   "drive": "https://docs.google.com/document/d/1D99yw3sxUE-zr4izexLqB2zuhO8csut7/edit?usp=sharing&ouid=116491662150692381667&rtpof=true&sd=true",
   "titoloDrive": "Lettera ai Fornitori_v2025",
   "testo": true
  },
  "email-invio-delle-lettere-di-circolarizzazione-a-clienti-e-fornitori": {
   "nome": "Email: invio delle lettere di circolarizzazione a clienti e fornitori",
   "file": "strumenti-revisione/allegati/email-invio-delle-lettere-di-circolarizzazione-a-clienti-e-fornitori.docx",
   "tipo": "docx",
   "kb": 8,
   "drive": "https://docs.google.com/document/d/1EJJhFlFJv1_6m2SOERMZSsAZxnegPX2kG_a9kuV4PG0/edit?usp=sharing",
   "titoloDrive": "EMAIL INVIO CIRC. CLIENTI/FORNITORI",
   "testo": true
  },
  "report-del-team-clienti-fornitori-e-risposte": {
   "nome": "Report del team: clienti/fornitori e risposte",
   "file": "strumenti-revisione/allegati/report-del-team-clienti-fornitori-e-risposte.xlsx",
   "tipo": "xlsx",
   "kb": 51,
   "drive": "https://docs.google.com/spreadsheets/d/1X6IMb1OMLwOZapUDHMUk5eYfI1gIZC_t/edit?usp=sharing&ouid=116491662150692381667&rtpof=true&sd=true",
   "titoloDrive": "ELENCOCLIENTI/FORNITORI"
  },
  "esempio-di-aging-dei-crediti-e-dei-debiti": {
   "nome": "Esempio di aging dei crediti e dei debiti",
   "file": "strumenti-revisione/allegati/esempio-di-aging-dei-crediti-e-dei-debiti.xlsx",
   "tipo": "xlsx",
   "kb": 107,
   "drive": "https://docs.google.com/spreadsheets/d/1sWxqN7UIBXSq6SsPk0bJJachFUgT-lGyh0MjZ3X_qSU/edit?usp=sharing",
   "titoloDrive": "AGING CREDITI/DEBITI"
  },
  "email-aggiornamenti-sulle-dichiarazioni-fiscali-2026-e-ruolo-della-socie": {
   "nome": "Email: aggiornamenti sulle dichiarazioni fiscali 2026 e ruolo della società di revisione",
   "file": "strumenti-revisione/allegati/email-aggiornamenti-sulle-dichiarazioni-fiscali-2026-e-ruolo-della-socie.docx",
   "tipo": "docx",
   "kb": 8,
   "drive": "https://docs.google.com/document/d/1gH4zG3YJJPyWN9293e5gNBN7qISjd1q4G6oqgNfiv3E/edit?usp=sharing",
   "titoloDrive": "Aggiornamenti importanti sulle dichiarazioni fiscali 2026 e il ruolo della Società di Revisione Legale",
   "testo": true
  },
  "email-comunicazione-del-progetto-di-bilancio-al-revisore-legale": {
   "nome": "Email: comunicazione del progetto di bilancio al revisore legale",
   "file": "strumenti-revisione/allegati/email-comunicazione-del-progetto-di-bilancio-al-revisore-legale.docx",
   "tipo": "docx",
   "kb": 7,
   "drive": "https://docs.google.com/document/d/1wQL52oaG3U_w9vTQGAVpUH0btwiRD0XmWqN8ehyQikQ/edit?usp=sharing",
   "titoloDrive": "Comunicazione del Progetto di Bilancio 2024 al Revisore Legale",
   "testo": true
  },
  "note-tecniche-mancata-comunicazione-del-progetto-di-bilancio-nei-tempi": {
   "nome": "Note tecniche: mancata comunicazione del progetto di bilancio nei tempi",
   "file": "strumenti-revisione/allegati/note-tecniche-mancata-comunicazione-del-progetto-di-bilancio-nei-tempi.docx",
   "tipo": "docx",
   "kb": 8,
   "drive": "https://docs.google.com/document/d/1WRZ2d3hzXFUuTcKSgty-Qcyqz7aeU2zLlsQ1zVgeLps/edit?usp=sharing",
   "titoloDrive": "Mancata comunicazione del progetto di bilancio nei tempi previsti dal codice civile e tempistiche relazione di revisione",
   "testo": true
  },
  "lettera-di-primo-sollecito": {
   "nome": "Lettera di primo sollecito",
   "file": "strumenti-revisione/allegati/lettera-di-primo-sollecito.docx",
   "tipo": "docx",
   "kb": 328,
   "drive": "https://docs.google.com/document/d/1916Ssif5EIwdNcwHoFLixmNkrv-76g6Z/edit?usp=sharing&ouid=116491662150692381667&rtpof=true&sd=true",
   "titoloDrive": "Lettera primo sollecito ottenimento documentazione",
   "testo": true
  },
  "lettera-di-secondo-sollecito": {
   "nome": "Lettera di secondo sollecito",
   "file": "strumenti-revisione/allegati/lettera-di-secondo-sollecito.docx",
   "tipo": "docx",
   "kb": 325,
   "drive": "https://docs.google.com/document/d/1M7BigpyhRI_K9IwE5Sg9fIromDdwk6bG/edit?usp=sharing&ouid=116491662150692381667&rtpof=true&sd=true",
   "titoloDrive": "Lettera secondo sollecito ottenimento documentazione",
   "testo": true
  },
  "rinuncia-ai-termini-art-2429-c-c": {
   "nome": "Rinuncia ai termini (art. 2429 c.c.)",
   "file": "strumenti-revisione/allegati/rinuncia-ai-termini-art-2429-c-c.docx",
   "tipo": "docx",
   "kb": 319,
   "drive": "https://docs.google.com/document/d/1H4ctLFkh-CetUfYQAZxKleBOXH6VUpT2/edit?usp=sharing&ouid=116491662150692381667&rtpof=true&sd=true",
   "titoloDrive": "Rinuncia ai termini di cui all’art. 2429 c.c.",
   "testo": true
  },
  "attestazione-dei-controlli-sulle-parti-correlate-modello": {
   "nome": "Attestazione dei controlli sulle parti correlate (modello)",
   "file": "strumenti-revisione/allegati/attestazione-dei-controlli-sulle-parti-correlate-modello.pdf",
   "tipo": "pdf",
   "kb": 279,
   "drive": "https://drive.google.com/file/d/1qtJm0qXGz9ZDolMNlwm7JSAu8pAFyGGM/view?usp=sharing",
   "titoloDrive": "All.3 - Attestazione Controlli Parti Correlate"
  },
  "lettera-di-attestazione-bilancio-abbreviato": {
   "nome": "Lettera di attestazione: bilancio abbreviato",
   "file": "strumenti-revisione/allegati/lettera-di-attestazione-bilancio-abbreviato.docx",
   "tipo": "docx",
   "kb": 169,
   "drive": "https://drive.google.com/file/d/1zTkwNmDXicwWwBJMb5eVYHXGnhlN-CiFpUh2PJ8qSL4/view?usp=sharing",
   "titoloDrive": "Revilaw_Lettera di Attestazione 2025 - Abbreviato"
  },
  "lettera-di-attestazione-bilancio-ordinario-con-relazione-sulla-gestione": {
   "nome": "Lettera di attestazione: bilancio ordinario con relazione sulla gestione e collegio sindacale",
   "file": "strumenti-revisione/allegati/lettera-di-attestazione-bilancio-ordinario-con-relazione-sulla-gestione.docx",
   "tipo": "docx",
   "kb": 170,
   "drive": "https://drive.google.com/file/d/122PkeaU_CU7EepE_HY8kVQHfw28QPoCqROO4KBetEuA/view?usp=sharing",
   "titoloDrive": "Revilaw_Lettera di Attestazione 2025 - Ordinario con  relazione di gestione (ex art.2428 cc) e collegio sindacale"
  },
  "assirevi-documento-di-ricerca-n-251r-2026-le-attestazioni-della-direzion": {
   "nome": "Assirevi, Documento di ricerca n. 251R/2026: le attestazioni della Direzione",
   "file": "strumenti-revisione/allegati/assirevi-documento-di-ricerca-n-251r-2026-le-attestazioni-della-direzion.docx",
   "tipo": "docx",
   "kb": 136,
   "drive": "https://drive.google.com/file/d/114UXHHvkp7WbQJLpmPU5cZTo1MWn2UMl/view?usp=sharing",
   "titoloDrive": "Assirevi_Doc. n. 251R 2026- Le attestazioni della Direzione"
  },
  "giudizio-bilancio-ordinario-senza-collegio": {
   "nome": "Giudizio: bilancio ordinario (senza collegio)",
   "file": "strumenti-revisione/allegati/giudizio-bilancio-ordinario-senza-collegio.docx",
   "tipo": "docx",
   "kb": 465,
   "drive": "https://drive.google.com/file/d/1CpkLm3iYeuiFUZVTiubZjz4H179kNsUdpTtMB1vzsC4/view?usp=sharing",
   "titoloDrive": "GIUDIZIO ORDINARIO (NO COLLEGIO)",
   "testo": true
  },
  "giudizio-bilancio-ordinario-con-collegio": {
   "nome": "Giudizio: bilancio ordinario (con collegio)",
   "file": "strumenti-revisione/allegati/giudizio-bilancio-ordinario-con-collegio.docx",
   "tipo": "docx",
   "kb": 465,
   "drive": "https://drive.google.com/file/d/1jZDhEBvGz2ilzC5tUg4YycB1VhC5XstWh9lQu9NiHhY/view?usp=sharing",
   "titoloDrive": "GIUDIZIO ORDINARIO_COLLEGIO",
   "testo": true
  },
  "giudizio-bilancio-abbreviato-senza-collegio": {
   "nome": "Giudizio: bilancio abbreviato (senza collegio)",
   "file": "strumenti-revisione/allegati/giudizio-bilancio-abbreviato-senza-collegio.docx",
   "tipo": "docx",
   "kb": 465,
   "drive": "https://drive.google.com/file/d/1ZGp4o1kz9oXnrvQGQxXt1o5nwjGN5XEiwXeDMXTzGd0/view?usp=sharing",
   "titoloDrive": "GIUDIZIO ABBREVIATO (NO COLLEGIO)",
   "testo": true
  },
  "giudizio-con-rilievi-bilancio-abbreviato-senza-collegio": {
   "nome": "Giudizio con rilievi: bilancio abbreviato (senza collegio)",
   "file": "strumenti-revisione/allegati/giudizio-con-rilievi-bilancio-abbreviato-senza-collegio.docx",
   "tipo": "docx",
   "kb": 465,
   "drive": "https://drive.google.com/file/d/1_rKBLvH5EBvx3ELpEM7fQfLmREilcp-edlTCp-Ld0oo/view?usp=sharing",
   "titoloDrive": "GIUDIZIO CON RILIEVI ABBREVIATO (NO COLLEGIO)",
   "testo": true
  },
  "impossibilita-di-esprimere-un-giudizio-bilancio-abbreviato-senza-collegi": {
   "nome": "Impossibilità di esprimere un giudizio: bilancio abbreviato (senza collegio)",
   "file": "strumenti-revisione/allegati/impossibilita-di-esprimere-un-giudizio-bilancio-abbreviato-senza-collegi.docx",
   "tipo": "docx",
   "kb": 466,
   "drive": "https://drive.google.com/file/d/1z72sC7QS1So3WW0kr5jOoemS6ZIKafw7DFVBpkm0e4w/view?usp=sharing",
   "titoloDrive": "NO OPINION ABBREVIATO (NO COLLEGIO)",
   "testo": true
  },
  "report-of-the-independent-legal-auditor-in-inglese": {
   "nome": "Report of the independent legal auditor (in inglese)",
   "file": "strumenti-revisione/allegati/report-of-the-independent-legal-auditor-in-inglese.docx",
   "tipo": "docx",
   "kb": 2347,
   "drive": "https://drive.google.com/file/d/1pNkf2y4sFb2EgOPfoSWQT1ZCyF4Kj-aj/view?usp=sharing",
   "titoloDrive": "REPORT OF THE INDEPENDENT LEGAL AUDITOR’S",
   "testo": true
  },
  "ciclo-delle-verifiche-periodiche-area-4": {
   "nome": "Ciclo delle verifiche periodiche (area 4)",
   "file": "strumenti-revisione/allegati/ciclo-delle-verifiche-periodiche-area-4.xlsx",
   "tipo": "xlsx",
   "kb": 22,
   "drive": "https://docs.google.com/spreadsheets/d/11vdEPbaoeZ5lVFm7JDsrKqEEcf9TBpifVnlP0suti2c/edit?usp=sharing",
   "titoloDrive": "CICLO VERIFICHE PERIODICHE"
  },
  "import-del-bilancio": {
   "nome": "Import del bilancio",
   "file": "strumenti-revisione/allegati/import-del-bilancio.docx",
   "tipo": "docx",
   "kb": 7,
   "drive": "https://docs.google.com/document/d/1IGnkh8PSvnn4OPPYFgobrymhfEmREjcyJwSEJqN8Ruo/edit?usp=sharing",
   "titoloDrive": "Import Bilancio",
   "testo": true
  },
  "materialita-di-bilancio": {
   "nome": "Materialità di bilancio",
   "file": "strumenti-revisione/allegati/materialita-di-bilancio.docx",
   "tipo": "docx",
   "kb": 7,
   "drive": "https://docs.google.com/document/d/1RMvk2I5MUYC6JxXcyWyybtoi3FmsOXvcEBDYJyKXHi4/edit?usp=sharing",
   "titoloDrive": "Materialità di bilancio",
   "testo": true
  },
  "carte-di-lavoro-pianificazione-e-controllo": {
   "nome": "Carte di lavoro «Pianificazione» e «Controllo»",
   "file": "strumenti-revisione/allegati/carte-di-lavoro-pianificazione-e-controllo.docx",
   "tipo": "docx",
   "kb": 7,
   "drive": "https://docs.google.com/document/d/141NImL1ob-Q718M_oV0ADRnRPx7SPEnn7KTEBBvpDTg/edit?usp=sharing",
   "titoloDrive": "Carte di lavoro \\\\\"Pianificazione\\\\\" e \\\\\"Controllo\\\\\"",
   "testo": true
  },
  "errori-nel-bilancio": {
   "nome": "Errori nel bilancio",
   "file": "strumenti-revisione/allegati/errori-nel-bilancio.docx",
   "tipo": "docx",
   "kb": 7,
   "drive": "https://docs.google.com/document/d/1Lxw-xKwM9tPJnf2a5FE5BCD667qidIIRl9SruJ_PW5E/edit?usp=sharing",
   "titoloDrive": "Errori nel bilancio",
   "testo": true
  },
  "pacchetto-kickoff": {
   "nome": "Pacchetto Kickoff",
   "file": "strumenti-revisione/allegati/pacchetto-kickoff.xlsx",
   "tipo": "xlsx",
   "kb": 9,
   "drive": "https://docs.google.com/spreadsheets/d/10xMlqviBvIuEEl3pUJooCNLOKz6PjvXdIGKVls4cpi8/edit?usp=sharing",
   "titoloDrive": "Pacchetto Kickoff"
  },
  "controlli-immobilizzazioni-immateriali": {
   "nome": "Controlli: immobilizzazioni immateriali",
   "file": "strumenti-revisione/allegati/controlli-immobilizzazioni-immateriali.docx",
   "tipo": "docx",
   "kb": 12,
   "drive": "https://docs.google.com/document/d/1zwDgzoK8kF1a_Xkpd7PlUCkfwLtijdr4BqPoIhWgz40/edit?usp=sharing",
   "titoloDrive": "Immobilizzazioni immateriali",
   "testo": true
  },
  "controlli-immobilizzazioni-materiali": {
   "nome": "Controlli: immobilizzazioni materiali",
   "file": "strumenti-revisione/allegati/controlli-immobilizzazioni-materiali.docx",
   "tipo": "docx",
   "kb": 12,
   "drive": "https://docs.google.com/document/d/1lnm4I4ghQmdkY2gRJeDKF-lKRDyv_dRq6bPrmYu6TzI/edit?usp=sharing",
   "titoloDrive": "Immobilizzazioni materiali",
   "testo": true
  },
  "controlli-immobilizzazioni-finanziarie": {
   "nome": "Controlli: immobilizzazioni finanziarie",
   "file": "strumenti-revisione/allegati/controlli-immobilizzazioni-finanziarie.docx",
   "tipo": "docx",
   "kb": 12,
   "drive": "https://docs.google.com/document/d/1GXjL-iKazt5xHxk05i4q1X1kVWE5gpPmVIARE4zCPT0/edit?usp=sharing",
   "titoloDrive": "Immobilizzazioni finanziarie",
   "testo": true
  },
  "controlli-rimanenze-di-magazzino": {
   "nome": "Controlli: rimanenze di magazzino",
   "file": "strumenti-revisione/allegati/controlli-rimanenze-di-magazzino.docx",
   "tipo": "docx",
   "kb": 99,
   "drive": "https://docs.google.com/document/d/106OJVgO0sOo5ve3BHcRulVFjO96W7vMsi7TUSgwbXmA/edit?usp=sharing",
   "titoloDrive": "Rimanenze di magazzino",
   "testo": true
  },
  "controlli-rimanenze-commesse-e-opere-a-lungo-termine": {
   "nome": "Controlli: rimanenze, commesse e opere a lungo termine",
   "file": "strumenti-revisione/allegati/controlli-rimanenze-commesse-e-opere-a-lungo-termine.docx",
   "tipo": "docx",
   "kb": 11,
   "drive": "https://docs.google.com/document/d/1hf2Dp1LgBmeD6Ku17rZuupbSGrs0kEx_YLvY8yVK3bw/edit?usp=sharing",
   "titoloDrive": "Rimanenze - commesse/opere a lungo termine",
   "testo": true
  },
  "controlli-attivita-finanziarie-non-immobilizzate": {
   "nome": "Controlli: attività finanziarie non immobilizzate",
   "file": "strumenti-revisione/allegati/controlli-attivita-finanziarie-non-immobilizzate.docx",
   "tipo": "docx",
   "kb": 11,
   "drive": "https://docs.google.com/document/d/1ZYtyhafFLC-4TrXYkBPjp5TbVNLKHrwXLn0j2rxQ8p4/edit?usp=sharing",
   "titoloDrive": "Attività finanziarie non immobilizzate",
   "testo": true
  },
  "controlli-crediti-commerciali-clienti": {
   "nome": "Controlli: crediti commerciali (clienti)",
   "file": "strumenti-revisione/allegati/controlli-crediti-commerciali-clienti.docx",
   "tipo": "docx",
   "kb": 71,
   "drive": "https://docs.google.com/document/d/1STvhqmoXb3kIC_-PiekP6SvvAQRHBA28eYy_BpgdR8E/edit?usp=sharing",
   "titoloDrive": "Crediti commerciali (Clienti)",
   "testo": true
  },
  "controlli-crediti-e-debiti-infragruppo": {
   "nome": "Controlli: crediti e debiti infragruppo",
   "file": "strumenti-revisione/allegati/controlli-crediti-e-debiti-infragruppo.docx",
   "tipo": "docx",
   "kb": 12,
   "drive": "https://docs.google.com/document/d/18sbpQmGuvUAxMEn-Z_gOP917axM9d8GllKzTI2LruP0/edit?usp=sharing",
   "titoloDrive": "Crediti e Debiti Infra Gruppo",
   "testo": true
  },
  "controlli-crediti-tributari-e-per-imposte-anticipate": {
   "nome": "Controlli: crediti tributari e per imposte anticipate",
   "file": "strumenti-revisione/allegati/controlli-crediti-tributari-e-per-imposte-anticipate.docx",
   "tipo": "docx",
   "kb": 12,
   "drive": "https://docs.google.com/document/d/17tX7--zv7vAjaxg_MHtut8rD39wR7T7hzwPBOk2C16M/edit?usp=sharing",
   "titoloDrive": "Crediti tributari e per imposte anticipate",
   "testo": true
  },
  "controlli-crediti-verso-altri": {
   "nome": "Controlli: crediti verso altri",
   "file": "strumenti-revisione/allegati/controlli-crediti-verso-altri.docx",
   "tipo": "docx",
   "kb": 11,
   "drive": "https://docs.google.com/document/d/1eq4IaHewaVlJVHJZGFr1IKDF4iqLiwxW7FWqyc7X7Vc/edit?usp=sharing",
   "titoloDrive": "Crediti verso altri",
   "testo": true
  },
  "controlli-cassa-e-banche": {
   "nome": "Controlli: cassa e banche",
   "file": "strumenti-revisione/allegati/controlli-cassa-e-banche.docx",
   "tipo": "docx",
   "kb": 12,
   "drive": "https://docs.google.com/document/d/1RYqYk84HvPtXFCzT34yFmY6YtBUJ30Hx0UUtx87IP6c/edit?usp=sharing",
   "titoloDrive": "Cassa e Banche",
   "testo": true
  },
  "controlli-ratei-e-risconti-attivi-e-passivi": {
   "nome": "Controlli: ratei e risconti (attivi e passivi)",
   "file": "strumenti-revisione/allegati/controlli-ratei-e-risconti-attivi-e-passivi.docx",
   "tipo": "docx",
   "kb": 12,
   "drive": "https://docs.google.com/document/d/1qOUG8rveZuPLZKq3xYO57s5MJeM-XQ6Y6SPnjNFsgk4/edit?usp=sharing",
   "titoloDrive": "Ratei e risconti (attivi e passivi)",
   "testo": true
  },
  "controlli-patrimonio-netto": {
   "nome": "Controlli: patrimonio netto",
   "file": "strumenti-revisione/allegati/controlli-patrimonio-netto.docx",
   "tipo": "docx",
   "kb": 12,
   "drive": "https://docs.google.com/document/d/1s93-K1nxI-6eHOlld6D0bf7rwCp_9Yr33BksQdqZfzQ/edit?usp=sharing",
   "titoloDrive": "Patrimonio netto",
   "testo": true
  },
  "controlli-fondi-per-rischi-e-oneri": {
   "nome": "Controlli: fondi per rischi e oneri",
   "file": "strumenti-revisione/allegati/controlli-fondi-per-rischi-e-oneri.docx",
   "tipo": "docx",
   "kb": 12,
   "drive": "https://docs.google.com/document/d/1Bp_qNqaLLVPVvzg-Fk1SYs4t5Kj0CJoylRyQcawk5Eg/edit?usp=sharing",
   "titoloDrive": "Fondi per rischi e oneri",
   "testo": true
  },
  "controlli-t-f-r": {
   "nome": "Controlli: T.F.R.",
   "file": "strumenti-revisione/allegati/controlli-t-f-r.docx",
   "tipo": "docx",
   "kb": 12,
   "drive": "https://docs.google.com/document/d/16Vnjh5Bn_KBNUT0KnffKv4ToIGY7FaWBnb6w8oSmTUM/edit?usp=sharing",
   "titoloDrive": "T.F.R. (Trattamento Fine Rapporto)",
   "testo": true
  },
  "controlli-mutui-e-finanziamenti-non-bancari": {
   "nome": "Controlli: mutui e finanziamenti non bancari",
   "file": "strumenti-revisione/allegati/controlli-mutui-e-finanziamenti-non-bancari.docx",
   "tipo": "docx",
   "kb": 12,
   "drive": "https://docs.google.com/document/d/1_3CavrNtszB7hm7ZDFyg8VNzHAPE1ws_UnjJozzyjfs/edit?usp=sharing",
   "titoloDrive": "Mutui e finanziamenti non bancari",
   "testo": true
  },
  "controlli-debiti-commerciali-fornitori": {
   "nome": "Controlli: debiti commerciali (fornitori)",
   "file": "strumenti-revisione/allegati/controlli-debiti-commerciali-fornitori.docx",
   "tipo": "docx",
   "kb": 71,
   "drive": "https://docs.google.com/document/d/15bS8wu7TzQ22KK3Nz7Nbn7u8hs1ktGBeZS3E1e4CllA/edit?usp=sharing",
   "titoloDrive": "Debiti commerciali (Fornitori)",
   "testo": true
  },
  "controlli-debiti-tributari": {
   "nome": "Controlli: debiti tributari",
   "file": "strumenti-revisione/allegati/controlli-debiti-tributari.docx",
   "tipo": "docx",
   "kb": 12,
   "drive": "https://docs.google.com/document/d/1sc4PiJGHuGLmGiZBN_7Vw4wFX5B4k-TTlMZQw48Q1m4/edit?usp=sharing",
   "titoloDrive": "Debiti tributari",
   "testo": true
  },
  "controlli-debiti-verso-altri": {
   "nome": "Controlli: debiti verso altri",
   "file": "strumenti-revisione/allegati/controlli-debiti-verso-altri.docx",
   "tipo": "docx",
   "kb": 12,
   "drive": "https://docs.google.com/document/d/18mGpqme3BoJCwU9b2XE-n1aInA4UDS9m5k2XLL2K7TQ/edit?usp=sharing",
   "titoloDrive": "Debiti verso altri",
   "testo": true
  },
  "controlli-ce-valore-della-produzione": {
   "nome": "Controlli: CE, valore della produzione",
   "file": "strumenti-revisione/allegati/controlli-ce-valore-della-produzione.docx",
   "tipo": "docx",
   "kb": 12,
   "drive": "https://docs.google.com/document/d/13bJVVERHajOsB9TCW9dAr33QnykSCDQyfDiYdnNAABE/edit?usp=sharing",
   "titoloDrive": "CE - Valore della Produzion",
   "testo": true
  },
  "verifica-della-corretta-applicazione-del-nuovo-oic-34": {
   "nome": "Verifica della corretta applicazione del nuovo OIC 34",
   "file": "strumenti-revisione/allegati/verifica-della-corretta-applicazione-del-nuovo-oic-34.docx",
   "tipo": "docx",
   "kb": 9,
   "drive": "https://docs.google.com/document/d/1RoUfc8LLx3Z3eDt53WuJZf4dxokmjfUiJAR4dTZck80/edit?usp=sharing",
   "titoloDrive": "Verifica della corretta applicazione dell'OIC 34 da parte del revisore",
   "testo": true
  },
  "controlli-ce-costi-della-produzione": {
   "nome": "Controlli: CE, costi della produzione",
   "file": "strumenti-revisione/allegati/controlli-ce-costi-della-produzione.docx",
   "tipo": "docx",
   "kb": 12,
   "drive": "https://docs.google.com/document/d/1WfZOW2tZz8ehWxMKJHLqvjG57Bdm8GjuhVAqiUfrbN8/edit?usp=sharing",
   "titoloDrive": "CE - Costi della Produzione",
   "testo": true
  },
  "controlli-ce-gestione-finanziaria": {
   "nome": "Controlli: CE, gestione finanziaria",
   "file": "strumenti-revisione/allegati/controlli-ce-gestione-finanziaria.docx",
   "tipo": "docx",
   "kb": 11,
   "drive": "https://docs.google.com/document/d/1MEqOBJJ1Gv54Z2hQpHtVbEW0s1ZjsYJa5BFa0sVOCa4/edit?usp=sharing",
   "titoloDrive": "CE - Gestione finanziaria",
   "testo": true
  },
  "verifica-della-continuita-aziendale-linee-guida-per-il-revisore": {
   "nome": "Verifica della continuità aziendale: linee guida per il revisore",
   "file": "strumenti-revisione/allegati/verifica-della-continuita-aziendale-linee-guida-per-il-revisore.docx",
   "tipo": "docx",
   "kb": 153,
   "drive": "https://docs.google.com/document/d/1xUuzZ-OqPMGm5LPxDdl8cmEilodH93FynI5zM3N-ZTE/edit?usp=sharing",
   "titoloDrive": "VERIFICA DELLA CONTINUITÀ AZIENDALE IN OTTICA DI SEGNALAZIONE DI SITUAZIONE DI CRISI: LINEE GUIDA PER IL REVISORE",
   "testo": true
  },
  "sommario-errori": {
   "nome": "Sommario errori",
   "file": "strumenti-revisione/allegati/sommario-errori.docx",
   "tipo": "docx",
   "kb": 127,
   "drive": "https://docs.google.com/document/d/1N_hp1BJXn9l_-bGvItA0HX8esNozceRuPeoim_DXJsY/edit?usp=sharing",
   "titoloDrive": "Sommario errori",
   "testo": true
  }
 }
};
