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

Due famiglie. I preset di **ricerca** tengono la Conoscenza a 3, come il
preset `Resist` del gioco: la differenza la fa **su quante voci si divide il
bilancio della nazione**, che si ripartisce per peso fra le priorità accese.
Gli altri servono a una situazione precisa e poi si tolgono.

| preset | voci | ricerca | militare | quando |
|---|---|---|---|---|
| `Resist` (del gioco, per confronto) | 14 | 9,1% | 45,5% | |
| - Ricerca e economia | 3 | **37,5%** | 0% | nazione ricca e stabile, senza programma spaziale |
| - Ricerca e spazio | 7 | 16,7% | 0% | nazione con programma spaziale |
| - Consolida | 4 | 12,5% | 0% | nazione appena presa o contesa (Unità: coesione e opinione pubblica) |
| - Controllo missioni | 3 | 0% | 0% | vicino al tetto di controllo missioni |
| - Arsenale | 4 | 0% | 75% | una sola nazione militare, senza disordini |

Ambiente e Welfare sono fuori dai preset di ricerca: l'Ambiente non tocca
disordini, coesione né PIL; il Welfare serve solo quando la disuguaglianza
sale, e il gioco lo segnala con un avviso sulla priorità.

Nomi e descrizioni tradotti stanno in `names.json`. La descrizione la mostra
solo il companion: il template del gioco non ha un campo per lei.

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
