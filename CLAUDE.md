# TerraInvictaCompanion

Companion di partita per **Terra Invicta**, pensato per restare aperto su un secondo
monitor mentre si gioca. L'utente gioca in **italiano**: rispondere in italiano e usare
i nomi italiani del gioco (Persuasione, Indagine, Spionaggio, Comando, Amministrazione,
Scienza, Sicurezza, Lealtà).

## A cosa serve

**Non a barare.** Terra Invicta è un gioco immenso: centinaia di nazioni, consiglieri,
organizzazioni, progetti e missioni, ognuno con decine di campi, sparsi fra schermate
che non si possono guardare insieme. Il companion serve a **leggere i dati che il gioco
già mostra** e a metterli uno accanto all'altro — confronti, differenze fra un turno e
l'altro, cosa cambia se prendo questo invece di quello.

Ne discendono le regole più sotto, che non sono un dettaglio implementativo ma il punto
del progetto: l'informazione che il gioco tiene nascosta resta nascosta, e quando un
numero è una nostra elaborazione va detto, con i valori grezzi accanto. Uno strumento di
analisi, non un aimbot.

## Avvio

```powershell
.\start.ps1          # API + interfaccia + browser
.\start.ps1 -NoReload    # senza auto-reload dell'API
```

L'API si riavvia da sola quando cambiano `ticore/` e `tiserver/` — non `tiweb/` (ci
pensa Next) né la cartella dei salvataggi, che la farebbe ripartire a ogni autosave.
Il riavvio lo fa **watchfiles, non `uvicorn --reload`**: su Windows il supervisore di
uvicorn ferma il worker con `CTRL_C_EVENT` e lo aspetta senza timeout; in background
l'evento non arriva e dal secondo reload in poi non succede più nulla.

Oppure separatamente:

```bash
python -m watchfiles --filter python --sigint-timeout 2 --sigkill-timeout 1 "python -m uvicorn tiserver.main:app --host 127.0.0.1 --port 8732 --timeout-graceful-shutdown 2" ticore tiserver
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
| `presets.py` | preset di priorità: lettura, preset personali, scrittura nel template del gioco **senza mod** (gli achievement restano) |
| `service.py` | le rotte `/api/*` senza framework: `Service` (snapshot, precedente, allerte) + `dispatch()`. La usano sia `tiserver` sia il worker del browser (`tiweb/public/engine-worker.js`): **una rotta nuova si aggiunge qui e in `_ROUTES`**, poi l'involucro FastAPI |
| `portable.py` | export (zip con `companion.db` + `presets.json`) e import che **unisce**: accetta anche il `companion.db` dell'API locale. Nel browser è l'unico modo di non perdere lo storico |
| `bundle.py` | estratto dei dati del gioco per la versione web (template + chiavi di localizzazione usate), in `tiweb/public/gamedata/`, gitignorato: sono dati di Pavonis. Chi aggiunge un `loc()` su una famiglia nuova la mette in `KEEP_PREFIXES`; `python -m ticore.bundle --check` confronta l'output dell'API coi file del gioco e con l'estratto |
| `factions.py` | confronto fra fazioni, coi soli campi che l'intel sblocca: soglie e misure di `TIGlobalConfig`/`FactionView`. `councilors()`: i consiglieri altrui con le regole di `CouncilorView` (0,10 posizione senza nome, 0,25 identità, 0,50 attributi veri, 0,75 missione, nascosta in fase missioni); sotto 0,50 gli attributi sono la stima del gioco dal tipo |
| `space.py` | scheda Spazio: habitat visibili (intel >= `intelToSeeSpaceAssetLocationandComposition`, 0,1: stessa regola della finestra Habitat), orbite terrestri coi posti, moduli sbloccati. Controllo missioni = ultima voce giornaliera delle `Transactions` |
| `mining.py` | scheda Estrazione: tutti i siti con la resa **vera solo sui corpi prospettati** (intel sul corpo >= 1,0), altrove la stima del gioco (`GetHabSiteExpectedProductivity_month`) con forchetta; raggiungibilità da `effectToExplore`. «Valore» = resa × prezzo di mercato, euristica nostra. Org spaziali: nostre, del mercato, altrui entro l'intel (bersagli di Acquisizione ostile) |
| `techs.py` | scheda Tecnologie: le tecnologie avviabili e cosa sblocca ognuna per la tua fazione (UniqueProjectUnlocks/ShouldHide del gioco). Percentuale = `GetProjectUnlockChance` come nella schermata Ricerca; i mesi di comparsa sono una stima nostra dalle regole dei trigger |
| `yass.py` | YASS (Yet Another Spreadsheet Simulator), sotto Nazioni: i dati di partenza dei calcolatori di nazione. I conti li fa l'interfaccia (`tiweb/lib/yass.ts`, stesse formule) perché rispondano a ogni cella cambiata. Pannello Priorità come nel gioco (validità, bonus, /M), effetti per completamento, coesione di riposo coi termini leggibili e un residuo ricavato dal valore del gioco. Proiezione a 20 anni con IP che seguono il PIL e Controllo missioni fino al tetto; foglio Dividi (IP e CP di N nazioni). `python -m ticore.yass` confronta le formule col salvataggio |
| `store.py` | SQLite in `~/.terrainvicta-companion/`: storico, note, obiettivi. La campagna è identificata da **fazione + difficoltà + `realWorldCampaignStart`** |

### API
`/api/snapshot?lang=` · `/api/alerts` · `/api/missions` · `/api/missions/{id}/plan`
· `/api/nations/trends` · `/api/nations/{name}/detail` · `/api/factions` (+ `councilors`) · `/api/space` · `/api/mining` · `/api/techs` · `/api/yass`
· `/api/presets` (+ `install`, `restore`, `custom`)
· `/api/nations` (dentro snapshot) · `/api/history` · `/api/campaigns` · `/api/diff`
· `/api/goals` · `/api/notes` · `/api/saves` · `/api/languages` · `/api/stream` (SSE)
· `/api/health` · `/api/icons/mission/{icona}.png` · `/api/icons/status`

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
- **Icone**: **non sono file su disco.** `missionIconImagePath` nei template è una
  `Resources.Load` di Unity (`councilor_missions/ICO_assassinate`); le immagini stanno
  nel bundle `StreamingAssets/AssetBundles/councilor_missions`, ogni voce in variante
  `_on` e `_off`. Le 50 icone delle missioni **stanno nel repo**, in
  `assets/icons/councilor_missions/`, con un carve-out esplicito dalla licenza: sono
  arte di Pavonis Interactive e la MIT non le copre (vedi `LICENSE` e
  `assets/icons/README.md`). `tiserver/icons.py` serve prima quelle, e solo se manca
  qualcosa ricade sull'estrazione con UnityPy dall'installazione dell'utente verso
  `~/.terrainvicta-companion/icons/`. UnityPy resta opzionale (`pip install -e .[icons]`).

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
  Transfer) + `missionsGrantedNames` delle sue org + `learnedMissionsTemplateNames`
  + `missionsGrantedNames` dei suoi **tratti** (Personalità unitaria → Stabilizza
  nazione), meno i `restrictedMissionNames` dei tratti (Pacifista → niente Uccidi).
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
- **Attributi e missioni** (`gamedata.attribute_use()`): la **Scienza non la usa nessuna
  missione umana**, né in attacco né in difesa (solo due missioni aliene). La
  **Sicurezza** non tira mai ma difende da ~10 missioni nemiche. Un attributo che nessuna
  missione usa non è un «buco» del consiglio.
- **Età dei consiglieri** (IL di `TIGlobalConfig`/`TIFactionState`): all'assunzione
  +2 XP per anno oltre i 30; da **65** anni `AgeCouncilors` può dare il tratto
  «In fase di declino» (−1 IND, −1 CMD) e poi uccidere, con probabilità crescente.
  Il 65 non compare nei testi del gioco: è una regola letta dal codice, non stato
  nascosto della partita.
- **Attributi dei consiglieri**: il salvataggio ha solo il valore **base**. Il gioco
  (`TICouncilorState.GetAttribute`) somma i `statMods` dei tratti, poi i bonus delle
  org, e non scende sotto zero: Lupo solitario porta −1 AMM −1 CMD +2 SPI.
  `council.councilor_view` fa lo stesso, tranne le modifiche con una condizione.
- **Costo di reclutamento**: 60 influenza; 30 se il tipo ha affinità con la fazione
  (`affinities` in `TICouncilorTypeTemplate`: l'Agente sul campo con la Resistenza),
  120 se ha anti-affinità.
- **Tetto dei punti di controllo** (la barra «173/185» in alto; IL di `TIFactionState`/
  `TINationState`): un punto costa `(PIL / fixedPCGDPToRaiseBaseCPMaintenanceCostBy1)^0,6
  / (2 × punti della nazione)`, zero se ha `benefitsDisabled`. Tetto =
  `controlPointMaintenanceFreebies` (125, in `TIGlobalValuesState`) + PER+CMD+AMM dei
  consiglieri (org comprese) + effetti `ControlPointMaintenance` + moduli degli habitat.
  Non è il conteggio dei punti: `model.cp_capacity()`.
- **Nome di un preset in partita**: il gioco **ignora `friendlyName`** e legge
  `TIPriorityPresetTemplate.displayName.<dataName>` da
  `Localization/<lingua>/TIPriorityPresetTemplate.<lingua>`. Senza quella riga
  mostra la chiave nuda. `presets.install()`/`export()` scrivono entrambi.
- **Nomi nel salvataggio**: nazioni, regioni, fazioni, org e punti di controllo
  sono scritti **nella lingua in cui girava il gioco**. `ticore/names.py` li
  ritraduce risalendo alla chiave. I template di nazioni e regioni hanno il
  prefisso dello scenario (`2026_FRA`), la localizzazione no (`FRA`); una nazione
  può usare `displayName` o `unionDisplayName` («Inghilterra»/«Regno Unito»). Le
  org generate a caso non hanno chiave e restano com'è. **Come chiave si usa
  sempre il `templateName`** (id), mai il nome: cambia con la lingua.
- **Identità di una partita**: `TIGlobalValuesState.realWorldCampaignStart` è l'ora
  reale in cui la campagna è stata avviata — stabile per tutti i salvataggi della
  stessa partita, diversa fra partite. È l'unico modo per distinguerle: fazione e
  difficoltà non bastano, perché ricominciare con la stessa fazione produce la stessa
  coppia. Il gioco **non azzera gli slot di autosave** quando ricominci: `Autosave3.gz`
  può appartenere alla campagna precedente. Per capire di che partita è un `.gz`,
  leggere quel campo, non il nome del file né la data di gioco.
- **Rese dei siti**: il salvataggio ha la resa vera di ogni sito, ma il gioco la mostra
  solo dopo la sonda (`Prospected`: intel sul corpo ≥ 1,0; 0,1 = sonda in viaggio).
  Prima la lista dei siti (pannello del corpo, anche se non esplorabile) mostra
  solo la forchetta min–max attorno a media del profilo × fattore massa/densità
  (0,75–1,25). Verificato: resa vera / attesa, mediana 1,00 su 561 siti.
- **Bonus spaziali delle org** (`TIOrgState.description`): `spaceDevBonus` →
  Finanziamenti; `spaceflightBonus` → Programma spaziale, Capacità di lancio,
  exovelivoli; `MCBonus` → Controllo missioni. Acquisizione ostile può colpire
  anche il pool non assegnato della fazione bersaglio.
- **Priorità di una nazione** (IL di `TINationState`, verificato sulla schermata Priorità della Francia: /M, Bonus e Perc. coincidono): gli IP del mese si dividono in parti uguali fra i punti di controllo, poi secondo i pallini delle sole priorità **valide** (`ValidPriority`: il gioco mostra solo quelle; un pallino su una priorità non valida non conta nel totale), × (1 + bonus). Bonus = fazione (`SumPriorityBonuses`: org e tratti dei consiglieri, effetti) + **diversità** del punto (per ogni altra priorità con pallini: Economia 0,5, le altre 0,2 × pallini / totale) + nazionale (Economia: federazione; eserciti: regioni minerarie). Un punto coi benefici sospesi non prende bonus positivi. Costo di un completamento: `priority_*` (Unità 2, Lancio 2, Controllo missioni 25, Armi nucleari 40 nel template).
- **Effetti per completamento** = valore base × `priorityEffectPopScaling` = (pop / 50 mln)^−0,35. La Conoscenza sposta la coesione di 0,01 × scala **verso 5**: sopra 5 la abbassa. L'Unità aggiunge coesione (rende meno con istruzione e democrazia alte). Ogni 200 completamenti di Governo + Unità, sommati, una regione perde l'ostilità (`numPrioritiesForLegitimize`), a prescindere dalla popolazione.
- **Coesione**: ogni mese va verso il riposo, in salita al più di 0,1, in discesa al più di clamp((disuguaglianza − 3)²/10, 0,1, 0,25). Quindi con poca Conoscenza **si ferma** a riposo + Conoscenze × passo; sale verso 5 solo se le Conoscenze del mese superano il calo massimo. Il **riposo** = 16 + termini, con la disuguaglianza come leva principale; il PIL pro capite alto non aiuta (pesa solo sotto il massimo degli ultimi 40 trimestri); sopra 6,5 la democrazia tira il riposo verso 5. Distanze e ideologia non le ricostruiamo: residuo dal valore salvato, stabile nello storico (oscillazione mediana 0,004).
- **IP e PIL** (IL di `TINationState.ModifyGDP`/`SetBaseInvestmentPoints_month`, coincide col wiki GDP): IP base = (PIL / 1 mld)^0,35 × (1 + bonus Consigliere) × (1 − occupazione) × (1 − max(0, disordini − 2)/10) − eserciti e flotte. Un completamento di Economia (1 IP) aggiunge al PIL pro capite (3 + 1,5 × regioni risorse + 1,5 × CER + 0,5 × democrazia + istruzione) × scala di popolazione, per la popolazione. Il PIL pro capite **non cresce da solo**: il PIL segue la popolazione (`GrowPopulationByMonth`), l'Economia, eventi ed effetti, e cala col clima.
- **Consiglia** (`TINationState.SetBaseInvestmentPoints_month`/`GetAdvisingScore`): IP × (1 + bonus), bonus = Amministrazione / 100 dei consiglieri che consigliano, dal più bravo, diviso la posizione (il secondo vale metà). YASS conta solo i nostri: chi altro consiglia il gioco non lo dice.
- **Regioni sviluppate dall'Economia** (`OnEconomyPriorityComplete`, `CacheRegionValues`): ogni completamento fa un passo, nell'ordine, verso una regione petrolifera (500, regioni `oilCapable`, finché c'è petrolio), mineraria (750, `mineCapable`) o economica centrale (1200, regione con quota del PIL nazionale **sopra** 500 mld). Il contatore è della regione; senza candidate il passo si perde.
- **Tetto del Controllo missioni** (`TIRegionState.get_maxMissionControl`): per regione max(MC attuale, 1 + ⌊PIL regionale / max(200, 300 − 6 × istruzione)⌋ mld). Il PIL regionale è la quota di popolazione pesata (CER e regioni risorse ×1,25, colonie ×0,5). La priorità MC è valida con programma spaziale (anche della federazione) e almeno una regione sotto il tetto. Il wiki non riporta questa formula.

## Cosa c'e' in cantiere

`ROADMAP.md` tiene le cose decise e non ancora fatte, col perche' di ognuna.
Guardarlo prima di proporre lavoro nuovo: potrebbe gia' esserci, con il contesto
che serve per riprenderlo.

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
