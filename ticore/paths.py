"""Individuazione di salvataggi, template e localizzazione del gioco."""

import os

from .texts import t

SAVE_DIRS = [
    os.path.expanduser(r"~/OneDrive/Documenti/My Games/TerraInvicta/Saves"),
    os.path.expanduser(r"~/Documents/My Games/TerraInvicta/Saves"),
    os.path.expanduser(r"~/OneDrive/Documents/My Games/TerraInvicta/Saves"),
]

GAME_DIRS = [
    r"C:/Program Files (x86)/Steam/steamapps/common/Terra Invicta",
    r"C:/Program Files/Steam/steamapps/common/Terra Invicta",
]

_STREAMING = "TerraInvicta_Data/StreamingAssets"


class NoSavesFound(RuntimeError):
    pass


def save_dir():
    # TI_SAVES: una cartella qualunque, per lavorare senza il gioco installato
    # (su Linux, o con i salvataggi di prova in fixtures/saves)
    env = os.environ.get("TI_SAVES")
    if env and os.path.isdir(env):
        return env
    for d in SAVE_DIRS:
        if os.path.isdir(d):
            return d
    # ultimo tentativo: il log del gioco dichiara il percorso effettivo
    log = os.path.expanduser(
        r"~/AppData/LocalLow/Pavonis Interactive/TerraInvicta/Player.log")
    if os.path.isfile(log):
        for line in open(log, encoding="utf-8", errors="ignore"):
            if "savedGamesPath:" in line:
                p = line.split("savedGamesPath:", 1)[1].strip()
                if os.path.isdir(p):
                    return p
    raise NoSavesFound(t("err.noSaveDir"))


def list_saves():
    """[(mtime, path)] dal piu' recente."""
    d = save_dir()
    out = [(os.path.getmtime(os.path.join(d, f)), os.path.join(d, f))
           for f in os.listdir(d) if f.lower().endswith(".gz")]
    return sorted(out, reverse=True)


def latest_save():
    saves = list_saves()
    if not saves:
        raise NoSavesFound(t("err.noSavesIn", None, save_dir()))
    return saves[0][1], saves[0][0]


def resolve_save(arg=None):
    """Percorso esplicito, frammento di nome, oppure il piu' recente."""
    if arg and os.path.isfile(arg):
        return arg
    saves = list_saves()
    if not saves:
        raise NoSavesFound("Nessun salvataggio .gz trovato.")
    if arg:
        for _, p in saves:
            if arg.lower() in os.path.basename(p).lower():
                return p
        raise NoSavesFound("Nessun salvataggio corrisponde a %r." % arg)
    return saves[0][1]


def game_dir():
    for d in GAME_DIRS:
        if os.path.isdir(d):
            return d
    return None


def template_dir():
    g = game_dir()
    p = os.path.join(g, _STREAMING, "Templates") if g else None
    return p if p and os.path.isdir(p) else None


def localization_dir():
    g = game_dir()
    p = os.path.join(g, _STREAMING, "Localization") if g else None
    return p if p and os.path.isdir(p) else None


def bundle_dir():
    g = game_dir()
    p = os.path.join(g, _STREAMING, "AssetBundles") if g else None
    return p if p and os.path.isdir(p) else None


def data_dir():
    """Dove il companion tiene il suo database (fuori dalla cartella di gioco)."""
    d = os.path.join(os.path.expanduser("~"), ".terrainvicta-companion")
    os.makedirs(d, exist_ok=True)
    return d
