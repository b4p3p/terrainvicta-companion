"""Estrazione delle icone dai bundle Unity dell'installazione locale.

Le icone delle missioni non sono file su disco: stanno dentro il bundle
`StreamingAssets/AssetBundles/councilor_missions`. Vengono estratte **dalla
copia del gioco dell'utente**, una volta sola, in `~/.terrainvicta-companion/
icons/`. Non fanno parte del repo e non vengono ridistribuite: sono materiale
di Pavonis Interactive, esattamente come i template e la localizzazione che
`ticore` legge dalla stessa installazione.

UnityPy e' opzionale: senza, `mission_icon_file()` restituisce None e
l'interfaccia resta testuale.
"""

import os
import threading

from ticore import paths

_BUNDLE = "councilor_missions"
_lock = threading.Lock()
_done = False


def available():
    try:
        import UnityPy  # noqa: F401
    except ImportError:
        return False
    return paths.bundle_dir() is not None


def icons_dir():
    d = os.path.join(paths.data_dir(), "icons", _BUNDLE)
    os.makedirs(d, exist_ok=True)
    return d


def extract(force=False):
    """Estrae le icone delle missioni. Ritorna quante ne ha scritte.

    Idempotente: gia' presenti non vengono riscritte, e l'estrazione parte una
    volta sola per processo salvo `force`.
    """
    global _done
    with _lock:
        if _done and not force:
            return 0
        bundles = paths.bundle_dir()
        if not bundles:
            return 0
        src = os.path.join(bundles, _BUNDLE)
        if not os.path.isfile(src):
            return 0
        try:
            import UnityPy
        except ImportError:
            return 0

        out = icons_dir()
        env = UnityPy.load(src)
        n = 0
        for obj in env.objects:
            if obj.type.name != "Sprite":
                continue
            try:
                data = obj.read()
            except Exception:
                continue
            name = data.m_Name
            # ogni icona esiste in variante _on (accesa) e _off (spenta):
            # serve solo la prima, e il suffisso sparisce dal nome del file
            if not name.endswith("_on"):
                continue
            dest = os.path.join(out, name[:-3] + ".png")
            if os.path.exists(dest) and not force:
                continue
            try:
                data.image.save(dest)
                n += 1
            except Exception:
                continue
        _done = True
        return n


def mission_icon_file(icon_name):
    """Percorso del PNG di un'icona, estraendola se serve. None se assente."""
    if not icon_name or "/" in icon_name or "\\" in icon_name or ".." in icon_name:
        return None
    p = os.path.join(icons_dir(), icon_name + ".png")
    if os.path.isfile(p):
        return p
    extract()
    return p if os.path.isfile(p) else None
