# Terra Invicta Companion

A second-screen companion for [Terra Invicta](https://store.steampowered.com/app/1176470/Terra_Invicta/).
It reads your save file directly and shows, live while you play: your council and its
coverage, which missions you can actually run and where they are most likely to land,
a ranked view of nations, and alerts on what changed since the previous save.

It is a **reading aid, not a cheat**. The interface deliberately shows only information
the game already gives you — apparent loyalty, not real loyalty; no un-acquired intel.
Where a number is a heuristic of this tool rather than the game's own formula, it says so
and shows the raw factors next to it.

> Unofficial fan project. Not affiliated with, endorsed by, or connected to Pavonis
> Interactive or Hooded Horse. It ships no game data: templates and localization are read
> from your own local installation.

## Features

- **Council** — councilors, attributes, organizations, attribute coverage, and which
  missions your council currently has no access to.
- **Missions** — the real attacking/defending modifiers of each mission, taken from the
  game templates, with targets ranked by readable factors.
- **Nations** — control points, GDP, cohesion, unrest, with not-yet-born separatist
  states filtered out so they stop skewing every ranking.
- **Alerts and history** — every save is archived to SQLite; a rule engine compares
  consecutive snapshots and pushes what changed over SSE. No polling in the frontend.
- **Notes and goals** — per-campaign, stored locally.
- **14 game languages** — mission, organization and project names come from the game's
  own official localization files, never hand-translated. UI is available in English and
  Italian.

## Requirements

- Terra Invicta installed (the tool reads its `StreamingAssets` templates and localization)
- Python 3.10+
- Node.js 20+ (for the web interface)

## Install

```bash
git clone https://github.com/b4p3p/terrainvicta-companion.git
cd terrainvicta-companion
pip install -e ".[icons]"     # or `pip install -e .` to skip game icons
cd tiweb && npm install && cd ..
```

The optional `icons` extra pulls in UnityPy, used to read the game's own mission
icons out of your local installation. Without it nothing breaks — the interface
just stays textual.

## Run

On Windows, both services plus the browser:

```powershell
.\start.ps1                  # API on :8732, interface on :3000
.\start.ps1 -NoBrowser
```

Or separately:

```bash
python -m uvicorn tiserver.main:app --port 8732
cd tiweb && npm run dev
```

Then open <http://localhost:3000>.

## CLI

`ti.py` is a thin layer over `ticore`, useful without a browser:

```bash
python ti.py status                 # default command
python ti.py council
python ti.py missions
python ti.py plan GainInfluence     # targets for a mission, ranked
python ti.py nations --all          # drop the Europe-only filter
python ti.py diff                   # what changed since the previous save
python ti.py alerts
python ti.py --list-saves
```

Useful flags: `--save <name or fragment>`, `--lang ita|en|fr|deu|…`, `--limit N`,
`--councilor <name>`, `--eu`.

## Architecture

```
ticore/     parser and domain logic. Python, zero dependencies, no UI.
tiserver/   FastAPI: /api/*, SSE on /api/stream, save-file watcher.
tiweb/      Next.js 16 + React 19 + Tailwind 4 + TypeScript.
ti.py       CLI on top of ticore.
```

`ticore` is deliberately dependency-free and UI-free: it outlives any frontend.

| module | contents |
|---|---|
| `paths.py` | locates saves, templates, localization, data folder |
| `save.py` | loads the gzipped save and indexes gamestates; survives the file being locked while the game writes it (retry, then fallback to the previous save) |
| `gamedata.py` | JSON templates plus official localization in 14 languages |
| `council.py` | councilors, orgs, attribute coverage, missing missions |
| `missions.py` | real mission factors and ranked targets |
| `model.py` | `snapshot()`: the full payload |
| `alerts.py` | rule engine over consecutive snapshots |
| `store.py` | SQLite in `~/.terrainvicta-companion/`: history, notes, goals |

### API

`/api/health` · `/api/snapshot?lang=` · `/api/alerts` · `/api/languages` · `/api/saves`
· `/api/missions` · `/api/missions/{name}/plan` · `/api/history` · `/api/campaigns`
· `/api/diff` · `/api/notes` · `/api/goals` · `/api/stream` (SSE)

The watcher checks the save's mtime every 3 seconds, reloads, archives the snapshot,
re-evaluates alerts and pushes them over SSE.

## Where the game data is read from

Auto-detected, no configuration needed:

- **Saves** — `%USERPROFILE%\Documents\My Games\TerraInvicta\Saves\*.gz` (OneDrive-redirected
  Documents folders included). If neither exists, the path is read from `savedGamesPath`
  in the game's `Player.log`.
- **Templates and localization** — `<Steam>\steamapps\common\Terra Invicta\TerraInvicta_Data\StreamingAssets\`.
- **Mission icons** — not files on disk: they live inside the Unity asset bundle
  `StreamingAssets/AssetBundles/councilor_missions`. With the `icons` extra installed
  they are extracted **from your own copy of the game** on first request and cached
  locally. No game art is contained in or distributed with this repository.

Everything this tool writes lives in `~/.terrainvicta-companion/`.

## License

MIT — see [LICENSE](LICENSE).
