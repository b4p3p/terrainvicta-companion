"""Icone delle missioni: quelle nel repo, con estrazione locale come ripiego.

Le icone stanno in `assets/icons/councilor_missions/`. Sono arte di Pavonis
Interactive, fuori dalla licenza MIT del progetto: vedi `LICENSE` e
`assets/icons/README.md`.

Se un'icona manca da li' (versione nuova del gioco, file rimosso su richiesta
dell'avente diritto) si ricade sull'estrazione dal bundle Unity
`StreamingAssets/AssetBundles/councilor_missions` della copia del gioco
dell'utente, verso `~/.terrainvicta-companion/icons/`. Quel passaggio richiede
UnityPy, che e' opzionale: senza, `mission_icon_file()` torna None e
l'interfaccia resta testuale.
"""

import os
import threading

from ticore import paths

_BUNDLE = "councilor_missions"
_lock = threading.Lock()
_done = False

_REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_SHIPPED = os.path.join(_REPO, "assets", "icons", _BUNDLE)


def available():
    """True se le icone sono servibili, comunque le si ottenga."""
    if os.path.isdir(_SHIPPED) and os.listdir(_SHIPPED):
        return True
    return can_extract()


def shipped_count():
    try:
        return len([f for f in os.listdir(_SHIPPED) if f.endswith(".png")])
    except OSError:
        return 0


def can_extract():
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
    """Percorso del PNG di un'icona. None se non recuperabile.

    Ordine: quella distribuita col progetto, poi la cache locale, poi
    l'estrazione dall'installazione del gioco.
    """
    if not icon_name or "/" in icon_name or "\\" in icon_name or ".." in icon_name:
        return None
    name = icon_name + ".png"

    p = os.path.join(_SHIPPED, name)
    if os.path.isfile(p):
        return p

    p = os.path.join(icons_dir(), name)
    if os.path.isfile(p):
        return p

    extract()
    return p if os.path.isfile(p) else None
