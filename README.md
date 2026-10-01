# Terra Invicta Companion

**🌐 <https://terrainvicta-companion.b4p3p.it/>** · [demo](https://terrainvicta-companion.b4p3p.it/?demo=1) · [support the project](#support)

A second-screen companion for [Terra Invicta](https://store.steampowered.com/app/1176470/Terra_Invicta/).
It reads your save files and puts side by side what the game spreads across a dozen
screens: your council and what it can do, which missions you can run and where, nations,
rival factions, space, technologies, and what changed since the previous save.

**Use it online:** <https://terrainvicta-companion.b4p3p.it/> — runs entirely in your
browser, nothing to install. **Try the demo** without the game:
<https://terrainvicta-companion.b4p3p.it/?demo=1>

![Overview: alerts, monthly flows and the research race](docs/screenshots/overview.png)

| Council | History |
|---|---|
| ![Council: attribute coverage and the team](docs/screenshots/council.png) | ![History: every save archived, charted over time](docs/screenshots/history.png) |

![Mining: base sites ranked by yield, and the orgs with space bonuses](docs/screenshots/mining.png)

It is a **reading aid, not a cheat**. The interface only shows information the game
already gives you: apparent loyalty, not real loyalty; no intel you haven't gathered; a
site's real mining yield only once you've probed its body. Where a number is this tool's
own heuristic rather than the game's formula, it says so and shows the raw values next
to it.

> Unofficial fan project. Not affiliated with, endorsed by, or connected to Pavonis
> Interactive or Hooded Horse.

## What it shows

- **Overview** — alerts checked on every save, monthly flows, the research race against
  the other factions.
- **Council** — attribute coverage, missions nobody on the council can run, which recruit
  candidates would fill the gaps, org requirements.
- **Missions** — the real attacking and defending modifiers of each mission, taken from
  the game templates, with targets ranked on readable factors.
- **Nations** — control points, GDP, cohesion, unrest, trends over time; not-yet-born
  separatist states filtered out so they stop skewing every ranking.
- **Factions** — rival factions and their councilors, compared only on what your intel
  unlocks, with the game's own thresholds.
- **Space** — visible habitats, Earth orbits and their free slots, buildable modules and
  when you can afford them.
- **Mining** — every base site ranked by yield (real numbers on prospected bodies, the
  game's range elsewhere), and the orgs with space bonuses: yours, on your market, and
  rival ones as Hostile Takeover targets.
- **Technologies** — what each available tech unlocks for your faction, with the game's
  own project-unlock chance.
- **Presets** — custom national priority presets written as game files, without mods, so
  achievements stay enabled.
- **History, notes and goals** — every save archived per campaign, turn-to-turn diffs,
  exportable.
- **14 game languages** — mission, org and project names come from the game's official
  localization, never hand-translated. Interface in English and Italian.

## Two ways to run it

### In the browser (recommended)

Open the site in **Chrome or Edge** on the PC where Terra Invicta is installed and pick
the `My Games` or `TerraInvicta` folder inside Documents: it finds the saves and reloads
on every save. The whole Python core runs in the page through
[Pyodide](https://pyodide.org/) (the first visit downloads about 13 MB). Saves are never
uploaded, and the tool never writes to them. The demo works in any browser.

### Locally, with the Python API

Requirements: Terra Invicta installed, Python 3.10+, Node.js 20+.

```bash
git clone https://github.com/b4p3p/terrainvicta-companion.git
cd terrainvicta-companion
pip install -e .
cd tiweb && npm install && cd ..
```

On Windows, both services plus the browser:

```powershell
.\start.ps1                  # API on :8732, interface on :3000
.\start.ps1 -NoBrowser
.\start.ps1 -NoReload        # no API auto-reload on source changes
```

Or separately:

```bash
python -m uvicorn tiserver.main:app --port 8732
cd tiweb && npm run dev
```

Then open <http://localhost:3000>. The local API watches the save folder and pushes
changes over SSE; history is kept in SQLite in `~/.terrainvicta-companion/`.

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
tiserver/   FastAPI wrapper: /api/*, SSE on /api/stream, save-file watcher.
tiweb/      Next.js 16 + React 19 + Tailwind 4 + TypeScript.
ti.py       CLI on top of ticore.
```

`ticore` is deliberately dependency-free and UI-free: the same code serves the local API
and, compiled to WebAssembly, the browser version. Its routes live in `service.py`
without any web framework; `tiserver` and the browser worker
(`tiweb/public/engine-worker.js`) both call `Service.dispatch()`.

| module | contents |
|---|---|
| `paths.py` | locates saves, templates, localization, data folder |
| `save.py` | loads the gzipped save and indexes gamestates; survives the file being locked while the game writes it |
| `gamedata.py` | JSON templates plus official localization in 14 languages |
| `names.py` | translates names the save stores in the game's language back through their template keys |
| `council.py` | councilors (attributes with trait effects), orgs, coverage, missing missions |
| `missions.py` | real mission factors and ranked targets |
| `model.py` | `snapshot()`: the full payload, control-point capacity |
| `alerts.py` | rule engine over consecutive snapshots |
| `factions.py` | rival factions and councilors, gated by intel like the game's own views |
| `space.py` | habitats, Earth orbits, buildable modules and their cost |
| `mining.py` | mining sites (real yield or the game's estimate) and orgs with space bonuses |
| `techs.py` | available techs and what they unlock for your faction |
| `presets.py` | priority presets, written into the game's template files without mods |
| `service.py` | the `/api/*` routes, shared by the server and the browser |
| `store.py` | SQLite: history, notes, goals, per campaign |
| `portable.py` | export and merge-import of the companion's data |
| `bundle.py` | the game-data extract used by the browser version |

### API

`/api/health` · `/api/snapshot?lang=` · `/api/alerts` · `/api/missions` ·
`/api/missions/{name}/plan` · `/api/nations/trends` · `/api/nations/{name}/detail` ·
`/api/factions` (+ `councilors`) · `/api/space` · `/api/mining` · `/api/techs` ·
`/api/research` · `/api/presets` (+ `export`, `install`, `restore`, `custom`) ·
`/api/history` · `/api/campaigns` · `/api/diff` · `/api/notes` · `/api/goals` ·
`/api/data` (+ `export`, `import`) · `/api/saves` · `/api/languages` · `/api/stream` (SSE)

## Where the game data comes from

- **Saves** — `%USERPROFILE%\Documents\My Games\TerraInvicta\Saves\*.gz` (OneDrive-redirected
  Documents included). If neither exists, the path is read from `savedGamesPath` in the
  game's `Player.log`.
- **Templates and localization** — the local version reads them from your installation,
  `<Steam>\steamapps\common\Terra Invicta\TerraInvicta_Data\StreamingAssets\`, in any
  Steam library (or the folder in `TI_GAME_DIR`, if set). The
  browser can't reach that folder, so the site serves a minimal extract generated by
  `python -m ticore.bundle`. The extract is not stored in this repository.
- **Icons** — `assets/icons/` holds the mission, resource, faction and cursor icons. In
  the game they live inside Unity asset bundles, not as files; if a mission, resource or
  faction icon is missing, the local server re-extracts it from your own copy of the game
  (`pip install -e ".[icons]"` pulls in UnityPy for that).

## Feedback

Any request, bug report or suggestion is welcome: something the game shows that you'd
like side by side, a number that doesn't match what you see in game, a screen that's
confusing. [Open an issue](https://github.com/b4p3p/terrainvicta-companion/issues) and
I'll take a look.

## Support

The companion is free and will stay free: no ads, no accounts, no tracking. But a
space station and a base on the Moon don't come cheap these days, and neither does the
coffee that keeps this thing running. If it saved you a few trips between screens:

[☕ A coffee (3 €)](https://paypal.me/b4p3p/3EUR) ·
[🍕 A pizza (10 €)](https://paypal.me/b4p3p/10EUR) ·
[🚀 Fund a project (any amount)](https://paypal.me/b4p3p)

PayPal opens with the amount already filled in; you can change it. No alien project will
be funded by mistake.

## License

Source code: MIT — see [LICENSE](LICENSE).

The images under `assets/icons/` are **not** covered by it. They are Terra Invicta
artwork, © Pavonis Interactive, included unmodified for identification in a
non-commercial fan tool. See [assets/icons/README.md](assets/icons/README.md).
