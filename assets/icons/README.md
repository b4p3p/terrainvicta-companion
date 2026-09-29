# Game icons

These images are **not** part of this project's source and are **not** covered by its
MIT license. They are artwork from Terra Invicta, © Pavonis Interactive.

## What they are

`councilor_missions/` holds the 50 council mission icons (128×128 RGBA PNG). They come
from the Unity asset bundle `TerraInvicta_Data/StreamingAssets/AssetBundles/councilor_missions`
in a retail installation of the game. Each icon exists there in an `_on` and an `_off`
variant; these are the `_on` ones, with the suffix dropped, so the file name matches the
`missionIconImagePath` field in `TIMissionTemplate.json`
(`councilor_missions/ICO_assassinate` → `ICO_assassinate.png`).

`icons_2d/` holds 57 icons from the bundle of the same name: the seven resources
(`ICO_currency`, `ICO_influence`, `ICO_ops`, `ICO_research`, `ICO_boost`,
`ICO_mission_control`, `ICO_projects`), the control-point marker, the eight
councilor attribute glyphs, the spaceflight-program marker
(`ICO_spaceflightProgram_priority`), and the four trend arrows
(`ICO_arrow_green`, `ICO_arrow_green_down`, `ICO_arrow_red`, `ICO_arrow_red_down`:
the colour says good or bad, the direction says up or down), and twelve nation
statistics used as table headers (`ICO_economy_priority`, `ICO_per_capita_GDP`,
`ICO_population`, `ICO_investments`, `ICO_education`, `ICO_gov_type`,
`ICO_Cohesion_mid`, `ICO_Unrest_mid`, `ICO_inequality`, `ICO_funding_priority`,
`ICO_nukes`, `tech_military_icon`), and the seventeen remaining national priority
icons, so that every priority a preset can set has its game icon
(`ICO_knowledge_priority`, `ICO_welfare_priority`, `ICO_military_priority`, …;
the `*_priority` files), and the other seven technology category icons
(`tech_energy_icon`, `tech_info_icon`, `tech_life_icon`, `tech_material_icon`,
`tech_social_icon`, `tech_space_icon`, `tech_xeno_icon`).

`cursors/` holds the 24 mouse cursors (32×32 RGBA PNG) from the bundle of the same
name: `Cursor_Neutral` and one per faction, as named by `cursorPath` in
`TIFactionTemplate.json` (`cursors/Cursor_ResistCouncil` → `Cursor_ResistCouncil.png`),
each with a `_Valid` and an `_Invalid` variant. The arrow tip sits at the centre of the
texture (16, 16), which is the hotspot the companion uses.
`Cursor_ResistCouncil_invalid` is spelled with a lowercase `i` in the bundle and was
renamed to `_Invalid` like the others.

`faction_logos/` holds the faction emblems (64×64 and 128×128 RGBA PNG) from the bundle
of the same name, as named by `councilIcon64` / `councilIcon128` in
`TIFactionTemplate.json` (`faction_logos/FAC_ResistCouncil_64` → `FAC_ResistCouncil_64.png`).
The `_ui` variants the template also lists are pixel-identical and were left out.

## Why they are here

They are included so the interface shows the same icons the player sees in game, without
requiring the optional UnityPy extraction step. They are used unmodified, for
identification, in a non-commercial fan tool.

## Regenerating them

`tiserver/icons.py` extracts them from a local installation:

```python
from tiserver import icons
icons.extract("councilor_missions", force=True)   # -> ~/.terrainvicta-companion/icons/
icons.extract("icons_2d", force=True)
```

That path is also the runtime fallback: if an icon is missing from this folder, the
server extracts it from the user's own copy of the game.

## If you are Pavonis Interactive

Open an issue, or contact the repository owner, and these files will be removed. The
tool falls back to extracting them locally and keeps working without them.
