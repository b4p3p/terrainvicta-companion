"""Regole di validita' delle priorita' (TINationState.ValidPriority), senza
salvataggi ne' file del gioco."""
from ticore import yass


def test_environment_at_best_is_invalid():
    # Cina nel salvataggio di vindicator117: sostenibilita' gia' alla migliore
    # raggiungibile, nel gioco l'Ambiente non c'e'
    assert yass._environment_valid(0.2825, False, 0.28250000000000003) == (False, True)


def test_environment_float32_noise_is_still_at_best():
    # Brasile: 0.08250001 nel salvataggio, in float32 coincide con la migliore
    assert yass._environment_valid(0.08250001, False, 0.08250000000000005) == (False, True)


def test_environment_above_best_is_valid():
    assert yass._environment_valid(0.5, False, 0.2825) == (True, True)


def test_environment_without_pollution_or_with_decontamination():
    assert yass._environment_valid(0.0, False, 0.2825) == (True, True)
    assert yass._environment_valid(0.2825, True, 0.2825) == (True, True)


def test_environment_without_best_is_uncertain():
    assert yass._environment_valid(0.5, False, None) == (True, False)


def test_fit_validity_uses_pip_totals():
    # incerta con pallini: valida solo se il totale del gioco la conta
    valid = {"Economy": (True, True), "Funding": (True, False), "MissionControl": (True, False)}
    cps = [{"priorities": {"Economy": 1, "Funding": 3, "MissionControl": 2}, "total": 3}]
    out = yass._fit_validity(dict(valid), cps)
    assert out["MissionControl"] == (True, True)
    assert out["Funding"] == (False, True)


def test_mc_cap_per_region():
    # 1 + PIL regionale / max(200, 300 - 6 x istruzione), mai sotto l'attuale
    gdp = 1000e9
    assert yass.mc_cap(gdp, [1, 1], [0, 0], 0) == 2 * (1 + int(500 / 300))
    assert yass.mc_cap(gdp, [1, 1], [9, 0], 0) == 9 + (1 + int(500 / 300))
    assert yass.mc_cap(gdp, [1], [0], 20) == 1 + int(1000 / 200)


class _Game:
    """Il minimo di save.Game che serve a priority_panel."""

    def __init__(self, nation, regions, cps, me):
        self.nations = {1: nation}
        self.regions = regions
        self.cps = cps
        self.me = me
        self.factions = {me["ID"]["value"]: me}

    def state(self, name):
        return {}


def _china(mc_room):
    """La Cina del salvataggio di vindicator117: su ogni punto Economia 1,
    Welfare 1, Ambiente 3, Controllo missioni 3, totale del gioco 5. Ambiente e
    Controllo missioni da 3 si contendono gli stessi pallini."""
    me = {"ID": {"value": 7}}
    pips = {"Economy": 1, "Welfare": 1, "Environment": 3, "MissionControl": 3}
    cps = {100 + i: {"faction": {"value": 7}, "controlPointPriorities": dict(pips),
                     "totalWeightsForControlPoint": 5, "benefitsDisabled": False} for i in range(6)}
    # un PIL che lascia posto sotto il tetto, oppure no
    regions = {1: {"populationInMillions": 100, "missionControl": 0 if mc_room else 500}}
    nation = {"displayName": "China", "spaceFlightProgram": True, "military": True, "GDP": 28_000e9,
              "education": 6.8, "sustainability": 0.2825, "canAccumulateDecontaminateTriggers": False,
              "democracy": 1.7, "regions": [{"value": 1}],
              "controlPoints": [{"value": c} for c in cps]}
    return _Game(nation, regions, cps, me), nation


def test_china_keeps_mission_control():
    g, n = _china(mc_room=True)
    rows, _ = yass.priority_panel(g, n, "en", {}, best_sust=0.28250000000000003)
    ids = {r["id"] for r in rows}
    assert "MissionControl" in ids
    assert "Environment" not in ids


def test_mission_control_at_cap_is_invalid():
    g, n = _china(mc_room=False)
    rows, _ = yass.priority_panel(g, n, "en", {}, best_sust=0.28250000000000003)
    assert "MissionControl" not in {r["id"] for r in rows}


def test_not_mine_control_point_is_empty():
    g, n = _china(mc_room=True)
    other = {"faction": {"value": 9}, "controlPointPriorities": {"Economy": 3},
             "totalWeightsForControlPoint": 3, "benefitsDisabled": False}
    g.cps[999] = other
    n["controlPoints"].append({"value": 999})
    _, cps = yass.priority_panel(g, n, "en", {}, best_sust=0.28250000000000003)
    assert [c["mine"] for c in cps].count(False) == 1
    assert next(c for c in cps if not c["mine"])["priorities"] == {}


def test_advise_uses_capped_administration(monkeypatch):
    """vindicator117: Mudgett ha 48 di Amministrazione ma Consiglia rende +25%,
    due consiglieri ~38%. AdvisingBonus chiede l'attributo «capped» (25)."""
    from ticore import council
    admin = {1: 48, 2: 31}
    monkeypatch.setattr(council, "councilor_view", lambda g, c: {
        "attributes": {"Administration": admin[c["id"]]}, "attributeCaps": {"Administration": 25}})

    class G:
        me = {"councilors": [{"value": 1}, {"value": 2}]}
        councilors = {1: {"id": 1, "displayName": "Mudgett"}, 2: {"id": 2, "displayName": "Grant"}}

        def state(self, name):
            return {}

        def my_councilors(self):
            return list(self.councilors.values())

    n = {"ID": {"value": 5}, "advisingCouncilors": [{"value": 1}, {"value": 2}]}
    bonus, who, _, _ = yass.advise_bonus(G(), n)
    assert abs(bonus - 0.375) < 1e-9
