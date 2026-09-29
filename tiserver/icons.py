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

# bundle Unity da cui arrivano le icone, per famiglia
BUNDLES = ("councilor_missions", "icons_2d", "faction_logos")
_BUNDLE = BUNDLES[0]          # compatibilita': la famiglia storica

_lock = threading.Lock()
_done = set()

_REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _shipped_dir(bundle):
    return os.path.join(_REPO, "assets", "icons", bundle)


_SHIPPED = _shipped_dir(_BUNDLE)


def available():
    """True se le icone sono servibili, comunque le si ottenga."""
    if shipped_count():
        return True
    return can_extract()


def shipped_count(bundle=None):
    bundles = (bundle,) if bundle else BUNDLES
    n = 0
    for b in bundles:
        try:
            n += len([f for f in os.listdir(_shipped_dir(b)) if f.endswith(".png")])
        except OSError:
            pass
    return n


def can_extract():
    try:
        import UnityPy  # noqa: F401
    except ImportError:
        return False
    return paths.bundle_dir() is not None


def icons_dir(bundle=_BUNDLE):
    d = os.path.join(paths.data_dir(), "icons", bundle)
    os.makedirs(d, exist_ok=True)
    return d


def extract(bundle=_BUNDLE, force=False):
    """Estrae le icone di un bundle. Ritorna quante ne ha scritte.

    Idempotente: quelle gia' presenti non vengono riscritte, e ogni bundle si
    estrae una volta sola per processo salvo `force`.
    """
    with _lock:
        if bundle in _done and not force:
            return 0
        bundles = paths.bundle_dir()
        if not bundles:
            return 0
        src = os.path.join(bundles, bundle)
        if not os.path.isfile(src):
            return 0
        try:
            import UnityPy
        except ImportError:
            return 0

        out = icons_dir(bundle)
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
            # nelle missioni ogni icona esiste in variante _on (accesa) e _off
            # (spenta): serve solo la prima, e il suffisso sparisce dal nome.
            # Gli altri bundle hanno un'icona sola per voce.
            if name.endswith("_off"):
                continue
            if name.endswith("_on"):
                name = name[:-3]
            dest = os.path.join(out, name + ".png")
            if os.path.exists(dest) and not force:
                continue
            try:
                data.image.save(dest)
                n += 1
            except Exception:
                continue
        _done.add(bundle)
        return n


def icon_file(bundle, icon_name):
    """Percorso del PNG di un'icona. None se non recuperabile.

    Ordine: quella distribuita col progetto, poi la cache locale, poi
    l'estrazione dall'installazione del gioco.
    """
    if bundle not in BUNDLES:
        return None
    if (not icon_name or "/" in icon_name or "\\" in icon_name
            or ".." in icon_name):
        return None
    name = icon_name + ".png"

    p = os.path.join(_shipped_dir(bundle), name)
    if os.path.isfile(p):
        return p

    p = os.path.join(icons_dir(bundle), name)
    if os.path.isfile(p):
        return p

    extract(bundle)
    return p if os.path.isfile(p) else None


def mission_icon_file(icon_name):
    return icon_file(_BUNDLE, icon_name)
