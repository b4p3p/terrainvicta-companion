"""Le formule contro quello che il gioco ha scritto nel salvataggio."""
import os

import pytest

from conftest import FIXTURES, SAVES, needs_game
from ticore import yass

pytestmark = needs_game
ids = [os.path.basename(p) for p in SAVES]


@pytest.mark.parametrize("path", SAVES, ids=ids)
def test_valid_pips_match_game_totals(path, games):
    """Su ogni mio punto di controllo i pallini delle priorita' che diamo per
    valide sommano al totale del gioco (totalWeightsForControlPoint conta solo
    le valide). E' il controllo che avrebbe colto il Controllo missioni sparito.
    Il totale si aggiorna quando cambiano pallini o validita': un salvataggio
    fatto subito dopo un cambio puo' averlo vecchio."""
    g = games(path)
    best = yass.best_sustainability(g)
    bad = []
    for n in g.nations.values():
        if not n.get("displayName"):
            continue
        rows, cps = yass.priority_panel(g, n, "en", {}, best)
        ids_ = {r["id"] for r in rows}
        for cp in cps:
            if not cp["mine"]:
                continue
            got = sum(v for k, v in cp["priorities"].items() if k in ids_)
            if got != cp["total"]:
                bad.append(f"{n['displayName']} punto {cp['index']}: {got} invece di {cp['total']}")
    assert not bad, "\n".join(bad)


@pytest.mark.parametrize("path", SAVES, ids=ids)
def test_not_mine_control_points_start_empty(path, games):
    """I pallini altrui il gioco non li mostra: i punti non miei arrivano vuoti."""
    g = games(path)
    for n in yass.overview(g, "en")["nations"]:
        for cp in n["panelCPs"]:
            if not cp["mine"]:
                assert cp["priorities"] == {} and cp["total"] == 0, n["name"]


@pytest.mark.parametrize("path", SAVES, ids=ids)
def test_population_growth_inputs(path, games):
    """La crescita della popolazione della Proiezione (yass.ts, annualPopGrowth)
    vuole latitudine e modificatore di ogni regione e gli anni di campagna: se
    mancano la popolazione cresce di colpo da un'altra parte del mondo."""
    ov = yass.overview(games(path), "en")
    assert ov["constants"]["campaignYears"] > 0
    regions = [r for n in ov["nations"] for r in n["regions"]]
    # l'equatore esiste, ma non per quasi tutte le regioni
    assert sum(1 for r in regions if r["lat"]) > 0.9 * len(regions)
    assert any(r["popMod"] for r in regions)


# solo i salvataggi del repo: su partite lunghe il modello ha scarti noti
# (guerre, Consiglia altrui), che `python -m ticore.yass` elenca
@pytest.mark.parametrize("path", FIXTURES, ids=[os.path.basename(p) for p in FIXTURES])
def test_yass_formulas_match_save(path):
    """python -m ticore.yass: disordini, IP dal PIL, tetto MC, Economie del mese."""
    *_, bad = yass.check(path)
    assert not bad, "\n".join(bad)


@pytest.mark.slow
def test_bundle_is_enough(tmp_path):
    """python -m ticore.bundle --check: l'estratto del sito da' gli stessi risultati."""
    from ticore import bundle
    diffs = bundle.check(SAVES[0])
    assert not diffs, "\n".join(diffs[:30])
