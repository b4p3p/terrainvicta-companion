"""Salvataggi e dati del gioco per i test.

Il salvataggio del repo (`fixtures/saves/`) c'e' sempre. Altri si aggiungono
con TI_TEST_SAVES, uno o piu' glob separati da `;` (per esempio i salvataggi
che ci mandano gli utenti, che non vanno nel repo). I test che leggono i
template del gioco si saltano dove il gioco non c'e'.
"""
import glob
import os

import pytest

from ticore import gamedata, paths

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIXTURES = sorted(glob.glob(os.path.join(ROOT, "fixtures", "saves", "*.gz")))


def _extra():
    out = []
    for pattern in filter(None, os.environ.get("TI_TEST_SAVES", "").split(";")):
        out += sorted(glob.glob(pattern))
    return out


SAVES = FIXTURES + _extra()

needs_game = pytest.mark.skipif(not paths.template_dir(), reason="servono i file del gioco")


@pytest.fixture(scope="session", autouse=True)
def _game_files():
    # un test che carica l'estratto non deve cambiare gli altri
    gamedata.use_game_files()
    yield
    gamedata.use_game_files()


@pytest.fixture(scope="session")
def games():
    """Un Game per salvataggio, caricato una volta sola: sono lenti da leggere."""
    from ticore.save import Game
    cache = {}

    def get(path):
        if path not in cache:
            cache[path] = Game(path)
        return cache[path]
    return get
