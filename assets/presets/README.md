# Preset di priorità

Definizioni dei preset che la scheda **Preset** del companion sa aggiungere al
gioco. Il file segue lo schema di `TIPriorityPresetTemplate.json` nei template
di Terra Invicta.

## Non sono un mod, di proposito

Terra Invicta ha un sistema di mod che risolverebbe il problema, ma **attivare
i mod disattiva gli achievement** — e basta spuntare la casella nel menu, senza
nemmeno un mod acceso. Il salvataggio lo registra in `playedWithMods`.

Quindi `ticore/presets.py` scrive queste voci **direttamente nel template del
gioco**, con un `dataName` che inizia per `TIC_`. Il gioco non le distingue
dalle proprie, `playedWithMods` resta falso, e gli achievement restano.

Il prezzo: un aggiornamento di Steam o «verifica integrità file» riscrive i
template e le cancella. `install()` è idempotente, quindi basta ripremere il
pulsante nella scheda.

## Cosa contengono

Il valore della Conoscenza è 3 in tutti — come nel preset `Resist` del gioco.
Non è lì la differenza: conta **su quante voci si divide il bilancio della
nazione**, che si ripartisce per peso fra le priorità accese.

| preset | voci | ricerca | militare |
|---|---|---|---|
| `Resist` (del gioco, per confronto) | 14 | 9,1% | 45,5% |
| - Ricerca e economia | 4 | **33,3%** | 0% |
| - Ricerca e spazio | 7 | 16,7% | 0% |
| - Resisti senza riarmo | 8 | 15,0% | 5% |

Il trattino iniziale serve a riconoscerli nella lista del gioco, dove non c'è
altro modo di distinguere le voci aggiunte da quelle originali.

## Modificarli

I campi si chiamano `<priorità>Setting` e valgono **1, 2 o 3**. **Omettere un
campo spegne quella priorità**, ed è così che si alza la quota delle altre.

Disponibili: `economy`, `knowledge`, `government`, `welfare`, `environment`,
`unity`, `oppression`, `spoils`, `spaceProgram`, `initSpaceProgram`, `boost`,
`missionControl`, `military`, `foundMilitary`, `army`, `navy`, `spaceDefense`,
`sto`, `nuclearProgram`, `initNuclearWeapons`.

Senza `factionName` il preset compare con qualunque fazione. Il nome mostrato
viene da `friendlyName`, perché la localizzazione ufficiale non conosce questi
`dataName`.

Dopo una modifica, ripremere **Riscrivi nel gioco** nella scheda.
