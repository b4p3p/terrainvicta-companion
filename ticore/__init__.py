"""ticore — lettura e analisi dei salvataggi di Terra Invicta.

Nessuna dipendenza esterna, nessuna UI. Tutto quello che sta qui sopravvive a
qualunque frontend.

    from ticore import load, snapshot, alerts
    g = load()                      # salvataggio piu' recente
    snap = snapshot(g, lang="ita")
    for a in alerts.evaluate(snap, prev):
        print(a["severity"], a["title"])
"""

from . import alerts, council, gamedata, missions, model, paths, store  # noqa: F401
from .model import snapshot  # noqa: F401
from .paths import latest_save, list_saves, resolve_save  # noqa: F401
from .save import Game, SaveLocked  # noqa: F401
from .texts import t

__all__ = ["load", "snapshot", "Game", "SaveLocked", "alerts", "council",
           "gamedata", "missions", "model", "paths", "store", "list_saves",
           "resolve_save", "latest_save"]


def load(which=None, fallback=True):
    """Carica un salvataggio: percorso, frammento di nome, o il piu' recente.

    Se il piu' recente e' bloccato (il gioco lo sta scrivendo) e `fallback` e'
    attivo, scende al successivo invece di fallire: meglio dati di trenta
    secondi fa che nessun dato.
    """
    if which:
        return Game(resolve_save(which))
    last = None
    for _, path in list_saves()[:4]:
        try:
            return Game(path)
        except SaveLocked as e:
            last = e
    raise last or SaveLocked(t("err.noReadableSave"))
