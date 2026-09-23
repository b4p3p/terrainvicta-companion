# Mod per Terra Invicta

Piccoli mod che colmano lacune del gioco, non che lo sbilanciano.
Terra Invicta li unisce **voce per voce** sul campo `dataName`: quelli qui dentro
**aggiungono** righe nuove e non toccano nessuna definizione originale.

## TerraInvictaCompanionPresets

I preset di priorità nazionali personalizzati vivono in `customPresets`, un campo
**dentro il salvataggio**: nascono e muoiono con la partita. Questo mod li sposta nei
template, che il gioco carica a ogni avvio — quindi restano disponibili in ogni partita,
inclusa una nuova.

Aggiunge tre preset. Nessuno ha `factionName`, quindi compaiono con qualunque fazione.

I nomi aggiunti iniziano con un **trattino**, così nella lista del gioco si
distinguono dalle voci originali.

| preset | voci | ricerca | militare |
|---|---|---|---|
| `Resist` (del gioco, per confronto) | 14 | 9,1% | 45,5% |
| - Ricerca e economia | 4 | **33,3%** | 0% |
| - Ricerca e spazio | 7 | 16,7% | 0% |
| - Resisti senza riarmo | 8 | 15,0% | 5% |

Il punto non è il valore della Conoscenza, che resta 3 ovunque: è **quante voci si
spartiscono il bilancio**. `Resist` ne accende 14, e la ricerca prende 3 pesi su 33.
Togliendo le voci che non stai usando, gli stessi 3 pesi valgono molto di più.

### Installazione

Copiare la cartella `TerraInvictaCompanionPresets/` in:

```
…\Steam\steamapps\common\Terra Invicta\Mods\Enabled\
```

Il nome della cartella **deve** essere identico al campo `Title` di `ModInfo.json`,
altrimenti il gioco non lo carica. Poi attivare i mod dal menu principale del gioco.

### Modificarli

I campi sono quelli di `TIPriorityPresetTemplate.json` nei template del gioco: ognuno
si chiama `<priorità>Setting` e vale **1, 2 o 3**. **Omettere un campo spegne quella
priorità** — ed è proprio così che si alza la quota delle altre.

Campi disponibili: `economy`, `knowledge`, `government`, `welfare`, `environment`,
`unity`, `oppression`, `spoils`, `spaceProgram`, `initSpaceProgram`, `boost`,
`missionControl`, `military`, `foundMilitary`, `army`, `navy`, `spaceDefense`, `sto`,
`nuclearProgram`, `initNuclearWeapons`.

Il nome mostrato viene da `friendlyName`, perché la localizzazione ufficiale non
conosce questi `dataName`.
