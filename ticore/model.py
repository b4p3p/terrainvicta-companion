"""Costruzione del payload completo: nazioni, risorse, progetti, flussi."""

from collections import defaultdict

from . import council, gamedata

EU = {"Francia", "Germania", "Regno Unito", "Italia", "Spagna", "Polonia",
      "Paesi Bassi", "Belgio-Lussemburgo", "Svizzera", "Svezia", "Irlanda",
      "Norvegia", "Austria", "Portogallo", "Danimarca", "Grecia", "Finlandia",
      "Repubblica Ceca", "Romania", "Ungheria", "Ucraina", "Turchia",
      # nomi inglesi, se il salvataggio e' in un'altra lingua
      "France", "Germany", "United Kingdom", "Italy", "Spain", "Poland",
      "Netherlands", "Belgium-Luxembourg", "Switzerland", "Sweden", "Ireland",
      "Norway", "Austria", "Portugal", "Denmark", "Greece", "Finland",
      "Czech Republic", "Romania", "Hungary", "Ukraine", "Turkey"}

RESOURCES = ["Money", "Influence", "Operations", "Research", "Projects",
             "Boost", "MissionControl"]


def _last(v, default=None):
    return v[-1] if isinstance(v, list) and v else default


def nations(g):
    me_key = (g.me.get("templateName") or "").replace("Council", "")
    out = []
    for n in g.nations.values():
        name = n.get("displayName")
        cps = n.get("controlPoints") or []
        if not name or not cps:
            continue
        owners, mine, free, taken = [], 0, 0, 0
        for c in cps:
            cp = g.cps.get(c["value"])
            fid = (cp.get("faction") or {}).get("value") if cp else None
            if not fid:
                free += 1
            elif g.factions.get(fid) is g.me:
                mine += 1
            else:
                taken += 1
                owners.append(g.faction_name.get(fid, "?"))
        pop = _last(n.get("historyPopulation")) or 0
        gdp = n.get("GDP") or 0
        hist = [round(x, 1) for x in (n.get("historyResearch") or [])][-32:]
        op = _last(n.get("historyPublicOpinion")) or n.get("publicOpinion") or {}
        out.append({
            "name": name,
            "eu": name in EU,
            "gdp": gdp,
            "pop": pop,
            "gdpPc": (gdp / (pop * 1e6)) if pop else 0,
            "research": _last(n.get("historyResearch")) or 0,
            "histResearch": hist,
            "resTrend": (hist[-1] - hist[0]) if len(hist) > 1 else 0,
            "ip": n.get("baseInvestmentPoints_month") or 0,
            "education": n.get("education") or 0,
            "democracy": n.get("democracy") or 0,
            "cohesion": n.get("cohesion") or 0,
            "unrest": n.get("unrest") or 0,
            "inequality": n.get("inequality") or 0,
            "support": op.get(me_key, 0) if isinstance(op, dict) else 0,
            "difficulty": n.get("missionDifficultyEconomyScore") or 0,
            "spaceFunding": n.get("spaceFunding_year") or 0,
            "space": bool(n.get("spaceFlightProgram")),
            "nukes": n.get("numNuclearWeapons") or 0,
            "miltech": n.get("militaryTechLevel") or 0,
            "cp": n.get("numControlPoints") or len(cps),
            "myCP": mine, "freeCP": free, "takenCP": taken,
            "owners": sorted(set(owners)),
        })
    return out


def flows(g, months_back=1):
    """Transazioni aggregate per categoria su un mese di gioco."""
    y, m, _ = g.game_date()
    m -= months_back
    while m < 1:
        m += 12
        y -= 1
    agg = defaultdict(lambda: defaultdict(float))
    for cat, lst in (g.me.get("Transactions") or {}).items():
        for tr in lst:
            d = tr.get("Date") or {}
            if d.get("year") == y and d.get("month") == m:
                agg[cat][tr["Resource"]] += tr["Amount"]
    net = defaultdict(float)
    for cat in agg:
        for k, v in agg[cat].items():
            net[k] += v
    return {
        "year": y, "month": m,
        "byCategory": {c: dict(v) for c, v in agg.items()},
        "net": dict(net),
    }


def projects(g, lang="ita"):
    tpl = gamedata.templates()["projects"]
    prog = {p["projectTemplateName"]: p
            for p in (g.me.get("currentProjectProgress") or [])}
    rate = flows(g, 1)["byCategory"].get("Daily Income", {}).get("Research", 0)
    out = []
    for name in (g.me.get("availableProjectNames") or []):
        t = tpl.get(name) or {}
        cost = t.get("researchCost") or 0
        p = prog.get(name)
        out.append({
            "id": name,
            "name": gamedata.project_name(lang, name),
            "cost": cost,
            "repeatable": bool(t.get("repeatable")),
            "grants": t.get("resourcesGranted") or [],
            "effects": t.get("effects") or [],
            "category": t.get("techCategory"),
            "active": bool(p),
            "slot": p.get("slot") if p else None,
            "accumulated": round(p.get("accumulatedResearch", 0), 1) if p else 0,
            "monthsLeft": round((cost - (p.get("accumulatedResearch", 0) if p else 0))
                                / rate, 1) if rate else None,
        })
    return {"rate": round(rate, 1), "items": out}


def control_points(g):
    by_nation = defaultdict(int)
    for cp in g.my_control_points():
        n = g.ref(cp, "nation", g.nations)
        by_nation[(n or {}).get("displayName") or "?"] += 1
    return dict(by_nation)


def alien_sites(g):
    out = []
    for e in (g.me.get("knownAlienSites") or []):
        rid = (e.get("Key") or {}).get("value")
        d = e.get("Value") or {}
        out.append({
            "region": g.region_label(rid),
            "since": "%04d-%02d-%02d" % (d.get("year", 0), d.get("month", 0), d.get("day", 0)),
        })
    return out


def snapshot(g, lang="ita"):
    """Payload completo. Niente informazione nascosta salvo dove esplicitato."""
    ns = nations(g)
    cpn = control_points(g)
    return {
        "faction": g.me.get("displayName"),
        "date": g.meta.get("gameTimeString", ""),
        "dateKey": g.date_key(),
        "difficulty": g.meta.get("difficulty"),
        "save": __import__("os").path.basename(g.path),
        "mtime": g.mtime,
        "lang": lang,
        "resources": {k: round(v, 1) for k, v in (g.me.get("resources") or {}).items()
                      if k in RESOURCES},
        "flows": flows(g, 1),
        "controlPoints": {"byNation": cpn, "mine": sum(cpn.values()),
                          "total": sum(n["cp"] for n in ns)},
        "nations": ns,
        "council": council.analyse(g, lang),
        "recruits": council.recruits(g, lang),
        "orgMarket": council.org_market(g, lang),
        "projects": projects(g, lang),
        "alienSites": alien_sites(g),
        "cpCapOverage": any(g.me.get("history_CPCapOverageByDay") or []),
    }
