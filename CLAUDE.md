# TerraInvictaCompanion

Companion di partita per **Terra Invicta**, pensato per restare aperto su un secondo
monitor mentre si gioca. L'utente gioca in **italiano**: rispondere in italiano e usare
i nomi italiani del gioco (Persuasione, Indagine, Spionaggio, Comando, Amministrazione,
Scienza, Sicurezza, Lealtà).

## Avvio

```powershell
.\start.ps1          # API + interfaccia + browser
.\start.ps1 -NoReload    # senza auto-reload dell'API
```

L'API parte con `--reload` su `ticore/` e `tiserver/` — non su `tiweb/` (ci pensa
Next) né sulla cartella dei salvataggi, che la farebbe ripartire a ogni autosave.

Oppure separatamente:

```bash
python -m uvicorn tiserver.main:app --port 8732 --reload --reload-dir ticore --reload-dir tiserver
cd tiweb && npm run dev                            # interfaccia su :3000
```

## Architettura

```
ticore/     parser + dominio. Python, zero dipendenze, nessuna UI.
            Sopravvive a qualunque frontend: è la parte che vale.
tiserver/   FastAPI: /api/*, SSE su /api/stream, watcher del salvataggio.
tiweb/      Next.js 16 + React 19 + Tailwind 4 + TypeScript.
ti.py       CLI sottile sopra ticore (utile senza browser).
```

### ticore
| modulo | contenuto |
|---|---|
| `paths.py` | individua salvataggi, template, localizzazione, cartella dati |
| `save.py` | `Game`: carica il .gz e indicizza i gamestate. Gestisce il file **bloccato** mentre il gioco salva (retry + fallback al precedente) |
| `gamedata.py` | template JSON + localizzazione ufficiale in **14 lingue** |
| `council.py` | consiglieri, org, copertura attributi, **missioni mancanti** |
| `missions.py` | fattori reali di una missione e bersagli ordinati |
| `model.py` | `snapshot()`: il payload completo |
| `alerts.py` | motore di regole sul confronto fra snapshot |
| `store.py` | SQLite in `~/.terrainvicta-companion/`: storico, note, obiettivi. La campagna è identificata da **fazione + difficoltà + `realWorldCampaignStart`** |

### API
`/api/snapshot?lang=` · `/api/alerts` · `/api/missions` · `/api/missions/{id}/plan`
· `/api/nations` (dentro snapshot) · `/api/history` · `/api/campaigns` · `/api/diff`
· `/api/goals` · `/api/notes` · `/api/saves` · `/api/languages` · `/api/stream` (SSE)
· `/api/health`

Il watcher controlla la mtime ogni 3 s, ricarica, archivia lo snapshot, rivaluta le
allerte e le spinge via SSE. Il frontend non fa polling.

### Multilingua
Due livelli separati:
- **interfaccia** — `tiweb/lib/i18n.ts`, per ora `it` e `en`;
- **termini di gioco** — letti dalla localizzazione ufficiale in
  `StreamingAssets/Localization/<lang>/`, 14 lingue. Passare `?lang=ita|en|fr|deu|…`
  a `/api/snapshot`. Mai tradurre a mano un nome di missione, org o progetto.

## Dove stanno i dati del gioco

- **Salvataggi**: `%USERPROFILE%\OneDrive\Documenti\My Games\TerraInvicta\Saves\*.gz`
  — JSON gzippato, `utf-8-sig`. `Player.log` contiene `savedGamesPath` se cambia.
- **Template**: `…\Steam\steamapps\common\Terra Invicta\TerraInvicta_Data\StreamingAssets\Templates\*.json`
- **Localizzazione**: `…\StreamingAssets\Localization\<lang>\*.<lang>`, righe
  `TIMissionTemplate.displayName.GainInfluence=Controlla nazione`.

Struttura: `gamestates["PavonisInteractive.TerraInvicta.TIXxxState"]` è una lista di
`{"Key":{"value":id},"Value":{…}}`. La fazione del giocatore si trova da `TIPlayerState`
con `isAI == false`.

## Meccaniche verificate sui file (non andare a memoria)

- **Le org non hanno requisiti di attributo.** I vincoli sono `requiresNationality`
  (nazionalità del consigliere = sede dell'org), `requiredOwnerTraits`,
  `prohibitedOwnerTraits`. Il Jet Propulsion Laboratory vuole un americano.
- **Il reddito dei candidati non viene dalle org** (ne hanno zero): viene dai **tratti**
  (`Wealthy`→denaro, `Connected`/`Eminent`/`Oligarch`→influenza, `Astronomer`→ricerca).
- **Lealtà apparente ≠ reale.** Il save contiene entrambe; l'apparente è una stima
  rumorosa che oscilla anche di 10 punti. **L'interfaccia mostra solo l'apparente**:
  l'utente non vuole barare. La reale resta accessibile da `ticore` per la CLI.
- **Missioni di un consigliere** = `missionNames` del suo TIPO + `baseMission` (la
  categoria "Standard": Contact, Deorbit, GoToGround, Orbit, SetNationalPolicy,
  Transfer) + `missionsGrantedNames` delle sue org + `learnedMissionsTemplateNames`.
  Per le "mancanti" escludere il tipo `Alien` e le org non `allowedOnMarket`.
- **Nomi interni**: `GainInfluence` = "Controlla nazione", `Propaganda` = "Campagna
  pubblica", `DefendInterests` costa **20 influenza fisse**, `HostileTakeover` si paga
  in **denaro**, `Advise` costa 10 influenza.
- **Fattori di una missione**: `resolutionMethod.attackingModifiers` /
  `defendingModifiers`. Il Colpo di Stato vuole **disordini, élite scontenta, oligarchi**
  contro **coesione, democrazia, PIL, punti difesi**.
- **Progetti**: `AudienceResearch` 100→+25 influenza; `CommercialResearch` 100→+100
  denaro; `OperationsResearch` 100→+20 operazioni; `ManagementResearch` 1500→alza il
  tetto CP; `ClandestineCells` 600→**+1 posto in consiglio**;
  `ResistanceTalentDevelopment` 500→**+2 IND e +2 SPI a tutti**; `EnergyLab` 300→solo un
  modulo di habitat, inutile senza stazione.
- Le **tecnologie** sono globali (le prendono tutte le fazioni), i **progetti** no.
- Gli **stati separatisti non ancora nati** hanno punti di controllo ma PIL e coesione a
  zero: vanno filtrati o falsano ogni classifica.
- **Identità di una partita**: `TIGlobalValuesState.realWorldCampaignStart` è l'ora
  reale in cui la campagna è stata avviata — stabile per tutti i salvataggi della
  stessa partita, diversa fra partite. È l'unico modo per distinguerle: fazione e
  difficoltà non bastano, perché ricominciare con la stessa fazione produce la stessa
  coppia. Il gioco **non azzera gli slot di autosave** quando ricominci: `Autosave3.gz`
  può appartenere alla campagna precedente. Per capire di che partita è un `.gz`,
  leggere quel campo, non il nome del file né la data di gioco.

## Regole di progetto

- **Niente informazione nascosta nell'interfaccia.** Lealtà reali, intel non acquisita e
  simili restano fuori. I proprietari dei punti di controllo altrui sono dietro una
  casella disattivata di default, con avviso. L'utente non vuole barare: vuole leggere
  meglio le statistiche che il gioco già gli mostra.
- **Le euristiche si dichiarano.** Il punteggio dei bersagli non è la formula del gioco:
  è una normalizzazione dei fattori leggibili. Mostrare sempre i valori grezzi accanto.
- **Verificare nei template prima di affermare.** È già successo di sbagliare andando a
  memoria: requisiti delle org, origine del reddito dei candidati, tempi di trasferimento.

## Stato della partita

Lo stato della partita in corso (consiglio, CP, obiettivi aperti) sta in
`PARTITA.local.md`, che resta **fuori dal repo**: è un file personale, non
documentazione del progetto. Il riferimento qui sotto lo carica in contesto
quando esiste.

@PARTITA.local.md

## Come lavorare su questa partita

- L'utente manda screenshot: leggerli, ma **incrociare sempre col salvataggio**.
- Raccomandazione secca e il perché, non un elenco di opzioni.
- Se si usa informazione che il gioco nasconde, **dirlo esplicitamente**.
