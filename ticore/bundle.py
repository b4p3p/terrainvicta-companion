"""Estratto dei dati del gioco da distribuire con la versione web.

Nel browser `ticore` non puo' leggere l'installazione del gioco: Chrome rifiuta
la File System Access API su tutto cio' che sta sotto Program Files. Qui si
prepara, al momento della build, un estratto con **solo** quello che `ticore`
usa, e `gamedata.use_bundle()` lo carica al posto dei file originali.

Sono dati di Pavonis Interactive: il sito che li serve resta dietro un blocco
finche' Pavonis non da' il consenso, e l'estratto non va in un repo pubblico.

    python -m ticore.bundle tiweb/public/gamedata
    python -m ticore.bundle --check      # l'estratto da' gli stessi risultati?

Produce `manifest.json`, `templates.json` e `loc/<lingua>.json`: il browser
scarica i template e solo le lingue che gli servono.
"""

import json
import os
import re
import sys

from . import gamedata, paths, presets

STEAM_APP_ID = "1176470"

# Chiavi di localizzazione che ticore legge. Chi aggiunge un `loc()` o uno
# `strings().get()` su una famiglia nuova deve aggiungerla qui, altrimenti sul
# web ricade sull'inglese e poi sul dataName. `--check` lo segnala.
KEEP_PREFIXES = (
    "TIMissionTemplate.displayName.",
    "TIOrgTemplate.displayName.",
    "TITraitTemplate.displayName.",
    "TITraitTemplate.description.",
    "TICouncilorTypeTemplate.displayName.",
    "TIProjectTemplate.displayName.",
    "TITechTemplate.displayName.",
    "TIFactionTemplate.displayName.",
    # nomi di nazioni e regioni: il salvataggio li ha nella lingua del gioco,
    # names.py li ritraduce (una nazione puo' usare anche il nome "di unione")
    "TINationTemplate.displayName.",
    "TINationTemplate.unionDisplayName.",
    "TIRegionTemplate.displayName.",
    "TIObjectiveTemplate.displayName.",
    "TIPriorityPresetTemplate.displayName.",
    # scheda Spazio: habitat coi nomi dei template, orbite, corpi, siti, moduli
    "TIHabTemplate.displayName.",
    "TIHabModuleTemplate.displayName.",
    # componenti sbloccati dai progetti (gamedata.PART_FAMILIES)
    "TIShipHullTemplate.displayName.", "TIDriveTemplate.displayName.",
    "TIPowerPlantTemplate.displayName.", "TIRadiatorTemplate.displayName.",
    "TIHeatSinkTemplate.displayName.", "TIBatteryTemplate.displayName.",
    "TIShipArmorTemplate.displayName.", "TIGunTemplate.displayName.",
    "TIMagneticGunTemplate.displayName.", "TILaserWeaponTemplate.displayName.",
    "TIParticleWeaponTemplate.displayName.", "TIPlasmaWeaponTemplate.displayName.",
    "TIMissileTemplate.displayName.", "TIUtilityModuleTemplate.displayName.",
    "TIOrbitTemplate.displayName.",
    "TISpaceBodyTemplate.displayName.",
    "TIHabSiteTemplate.displayName.",
    # scheda Tecnologie: sommari, effetti dei progetti, nomi delle categorie
    "TITechTemplate.summary.",
    "TIProjectTemplate.summary.",
    "TIEffectTemplate.description.",
    "UI.Science.Category.",
    "UI.Global.",
    # relazioni fra fazioni, come la schermata Intelligence
    "UI.Intel.Faction",
    "UI.Notifications.Diplomacy.",
    "UI.Nation.",
    # scheda Estrazione: profili minerari, bonus di estrazione delle org
    "TIMiningProfileTemplate.displayName.",
    "UI.OrgTargeting.SpaceMiningBonus",
)
# cause delle variazioni nazionali (`tracker_*ChangeReason_*`): chiavi nude,
# es. `CohesionReason_Annexation`
KEEP_PATTERNS = (re.compile(r"^[A-Za-z]+Reason_[A-Za-z0-9_]+$"),)


def keep(key):
    return key.startswith(KEEP_PREFIXES) or any(p.match(key) for p in KEEP_PATTERNS)


def game_version():
    """Versione del gioco installato: `TerraInvicta v1.0.53b` in Player.log.

    E' la stessa stringa che il salvataggio registra in
    `TIGlobalValuesState.latestSaveVersion`: e' cosi' che il browser capisce se
    l'estratto e' di una versione diversa dal salvataggio che sta leggendo.
    """
    log = os.path.expanduser(
        r"~/AppData/LocalLow/Pavonis Interactive/TerraInvicta/Player.log")
    try:
        with open(log, encoding="utf-8", errors="ignore") as f:
            for line in f:
                m = re.match(r"TerraInvicta v(\S+)", line)
                if m:
                    return m.group(1)
    except OSError:
        pass
    return None


def steam_build():
    """buildid di Steam: cambia a ogni aggiornamento, anche senza nuova versione."""
    g = paths.game_dir()
    if not g:
        return None
    acf = os.path.join(os.path.dirname(os.path.dirname(g)),
                       "appmanifest_%s.acf" % STEAM_APP_ID)
    try:
        with open(acf, encoding="utf-8", errors="ignore") as f:
            m = re.search(r'"buildid"\s+"(\d+)"', f.read())
            return m.group(1) if m else None
    except OSError:
        return None


def _dump(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    return os.path.getsize(path)


# famiglie grandi di cui ci servono pochi campi (ticore/mining.py): il resto
# (orbite, note degli astronomi) peserebbe mezzo megabyte nel browser
SLIM_FIELDS = {
    "habSites": ("dataName", "miningProfileName"),
    "spaceBodies": ("dataName", "barycenterName", "objectType", "mass_kg", "density_gcm3",
                    "semiMajorAxis_AU", "effectToExplore", "alternativeEffectToExplore"),
}


def _slim(tpl):
    return {k: ({n: {f: t[f] for f in SLIM_FIELDS[k] if f in t} for n, t in v.items()}
                if k in SLIM_FIELDS else v)
            for k, v in tpl.items()}


def build(out):
    if not paths.template_dir() or not paths.localization_dir():
        raise SystemExit("Installazione di Terra Invicta non trovata.")
    gamedata.templates.cache_clear()
    gamedata.strings.cache_clear()
    os.makedirs(os.path.join(out, "loc"), exist_ok=True)

    sizes = {"templates.json": _dump(os.path.join(out, "templates.json"),
                                     _slim(gamedata.templates()))}
    langs = gamedata.available_languages()
    for lang in langs:
        s = {k: v for k, v in gamedata.strings(lang).items() if keep(k)}
        sizes["loc/%s.json" % lang] = _dump(
            os.path.join(out, "loc", "%s.json" % lang), s)

    # i preset del gioco, senza le nostre voci: nel browser la scheda Preset ci
    # costruisce il file completo da scaricare
    sizes["presets-template.json"] = _dump(os.path.join(out, "presets-template.json"),
                                           presets.game_original() or [])

    manifest = {
        "gameVersion": game_version(),
        "steamBuild": steam_build(),
        "languages": {l: gamedata.LANGUAGES[l] for l in langs},
        "files": sizes,
    }
    _dump(os.path.join(out, "manifest.json"), manifest)
    return manifest


def load(src):
    """Carica un estratto da disco in `gamedata`. Il browser fa lo stesso da JS."""
    with open(os.path.join(src, "manifest.json"), encoding="utf-8") as f:
        manifest = json.load(f)
    with open(os.path.join(src, "templates.json"), encoding="utf-8") as f:
        tpl = json.load(f)
    strings = {}
    for lang in manifest["languages"]:
        with open(os.path.join(src, "loc", "%s.json" % lang), encoding="utf-8") as f:
            strings[lang] = json.load(f)
    gamedata.use_bundle(tpl, strings, list(manifest["languages"]))
    p = os.path.join(src, "presets-template.json")
    if os.path.isfile(p):
        with open(p, encoding="utf-8") as f:
            presets.use_bundled_template(json.load(f))
    return manifest


def _diff(a, b, path="", out=None, limit=20):
    out = [] if out is None else out
    if len(out) >= limit:
        return out
    if isinstance(a, dict) and isinstance(b, dict):
        for k in a.keys() | b.keys():
            _diff(a.get(k), b.get(k), "%s.%s" % (path, k), out, limit)
    elif isinstance(a, list) and isinstance(b, list) and len(a) == len(b):
        for i, (x, y) in enumerate(zip(a, b)):
            _diff(x, y, "%s[%d]" % (path, i), out, limit)
    elif a != b:
        out.append("%s: %r -> %r" % (path, a, b))
    return out


def check(save_path=None):
    """Confronta cio' che l'API produce coi file del gioco e con l'estratto.

    Ogni differenza e' una chiave di localizzazione o un template che manca
    dall'estratto: va aggiunta a KEEP_PREFIXES/KEEP_PATTERNS.
    """
    import tempfile
    from . import factions, mining, missions, model, save, space, techs, yass
    g = save.Game(save_path or paths.latest_save()[0])

    def run():
        out = {}
        for lang in ("ita", "en"):
            snap = model.snapshot(g, lang)
            out[lang] = {
                "snapshot": snap,
                "missions": missions.catalogue(snap, lang),
                "factions": factions.compare(g, lang),
                "councilors": factions.councilors(g, lang),
                "space": space.overview(g, lang),
                "mining": mining.overview(g, lang),
                "techs": techs.overview(g, lang),
                "yass": yass.overview(g, lang),
                "details": {n["id"]: model.nation_detail(g, n["id"], lang)
                            for n in model.nations(g, lang)},
            }
        return json.loads(json.dumps(out, default=str))

    gamedata.use_game_files()
    full = run()
    with tempfile.TemporaryDirectory() as d:
        build(d)
        load(d)                         # dall'estratto
        extract = run()
        # come nel browser: niente cartella del gioco. Qui contano solo le
        # eccezioni (chi legge un file del gioco senza l'estratto si rompe qui
        # e non in produzione); i valori possono cambiare, per esempio senza i
        # preset installati nel gioco
        real_template_dir = paths.template_dir
        paths.template_dir = lambda: None
        try:
            run()
        except Exception as e:          # noqa: BLE001 - va riportato, non nascosto
            raise SystemExit(f"Senza la cartella del gioco (come nel browser) si rompe: {e!r}")
        finally:
            paths.template_dir = real_template_dir
    gamedata.use_game_files()
    return _diff(full, extract)


if __name__ == "__main__":
    if "--check" in sys.argv:
        diffs = check()
        print("\n".join(diffs) if diffs else "Nessuna differenza: l'estratto basta.")
        sys.exit(1 if diffs else 0)
    out = sys.argv[1] if len(sys.argv) > 1 else "gamedata"
    m = build(out)
    total = sum(m["files"].values())
    print("Terra Invicta %s (build %s): %d lingue, %.1f MB in %s"
          % (m["gameVersion"], m["steamBuild"], len(m["languages"]),
             total / 1048576, out))
