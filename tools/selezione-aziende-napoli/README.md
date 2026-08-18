# Selezione aziende - convegno di Napoli, 2 ottobre

Strumento usato per ricavare, dall'anagrafica delle imprese campane, la lista
delle aziende da invitare al convegno del 2 ottobre (rigenerazione di Bagnoli e
America's Cup 2027, con Invitalia, UniCredit e Intesa Sanpaolo).

## Cosa fa

Legge il file xlsx dell'anagrafica, tiene solo le imprese dei settori indicati
nella mail di indirizzo (costruzioni e infrastrutture, impiantistica, bonifiche
ambientali, nautica, portualità, turismo e ospitalità, ristorazione, trasporti e
logistica, eventi, tecnologie digitali, sicurezza, energia, servizi e relative
filiere di fornitura), assegna a ciascuna un punteggio e le divide in tre fasce
di invito.

Il punteggio (0-100) somma cinque componenti:

| Componente | Peso | Come è calcolata |
|---|---|---|
| Settore | 40 | Fascia A (filiera diretta dei due progetti) 40, fascia B 32, fascia C (forniture e servizi) 22 |
| Dimensione | 25 | Ultimo fatturato (60%) e addetti (40%) |
| Crescita | 15 | Crescita media annua del fatturato sullo storico disponibile |
| Solidità | 10 | Utile dell'ultimo bilancio e margine sul fatturato |
| Territorio | 10 | Napoli e area flegrea 10, resto provincia di Napoli 8, Caserta e Salerno 5, Avellino e Benevento 3 |

Le fasce di invito: **priorità 1** con punteggio >= 78 o fra le prime 10 del
proprio settore, **priorità 2** con punteggio >= 66 o fra le prime 25 del
settore, **priorità 3** le restanti. La quota per settore serve a non lasciare
fuori alberghi, ristoranti e società di eventi, che hanno fatturati più bassi
delle imprese di costruzioni ma servono comunque in sala.

## Uso

```bash
pip install pandas openpyxl
python3 seleziona_aziende.py Campania.xlsx -o lista-aziende-2-ottobre.xlsx
```

Il file prodotto ha un foglio per ciascuna fascia di priorità, la lista completa
delle aziende in target, un riepilogo per settore e un foglio con la metodologia
e i limiti dei dati.

## Dati

L'anagrafica di partenza e la lista prodotta contengono email e telefoni delle
aziende: **restano fuori dal repository**, che è pubblico (vedi `.gitignore`).
Qui sta solo il codice che li elabora.

## Limiti da tenere presenti

- L'anagrafica non dice quali imprese stiano investendo o cercando finanza:
  dimensione, crescita e solidità sono indizi, non prove.
- I bilanci più recenti nel file usato erano al 2021, quindi il trend fotografa
  gli anni disponibili.
- La verifica di merito - le aziende "positivamente riferite" - resta al gruppo.
