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

## Why they are here

They are included so the interface shows the same icons the player sees in game, without
requiring the optional UnityPy extraction step. They are used unmodified, for
identification, in a non-commercial fan tool.

## Regenerating them

`tiserver/icons.py` extracts them from a local installation:

```python
from tiserver import icons
icons.extract(force=True)   # writes to ~/.terrainvicta-companion/icons/
```

That path is also the runtime fallback: if an icon is missing from this folder, the
server extracts it from the user's own copy of the game.

## If you are Pavonis Interactive

Open an issue, or contact the repository owner, and these files will be removed. The
tool falls back to extracting them locally and keeps working without them.
