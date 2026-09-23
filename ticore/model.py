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


# Le serie `historyXxx` delle nazioni sono dal PIU' RECENTE al piu' vecchio:
# l'indice 0 coincide col valore attuale (verificato su PIL, disordini,
# coesione, democrazia, istruzione e disuguaglianza di tutte le nazioni).

def _now(v, default=None):
    """Valore attuale di una serie storica del salvataggio."""
    return v[0] if isinstance(v, list) and v else default


def _chrono(v):
    """Serie storica in ordine cronologico, dal piu' vecchio all'attuale."""
    return list(reversed(v)) if isinstance(v, list) else []


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
        pop = _now(n.get("historyPopulation")) or 0
        gdp = n.get("GDP") or 0
        hist = [round(x, 1) for x in _chrono(n.get("historyResearch"))][-32:]
        op = _now(n.get("historyPublicOpinion")) or n.get("publicOpinion") or {}
        out.append({
            "name": name,
            "eu": name in EU,
            "gdp": gdp,
            "pop": pop,
            "gdpPc": (gdp / (pop * 1e6)) if pop else 0,
            "research": _now(n.get("historyResearch")) or 0,
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


# indicatore -> (serie storica del salvataggio, divisore). Sono le serie che il
# gioco disegna nei grafici della nazione: niente che il giocatore non veda.
TREND_FIELDS = {
    "gdp": ("historyGDP", 1e9),
    "pop": ("historyPopulation", 1),
    "research": ("historyResearch", 1),
    "ip": ("historyInvestmentPoints", 1),
    "education": ("historyEducation", 1),
    "democracy": ("historyDemocracy", 1),
    "cohesion": ("historyCohesion", 1),
    "unrest": ("historyUnrest", 1),
    "inequality": ("historyInequality", 1),
    "miltech": ("historyMiltech", 1),
    "nukes": ("historyNukes", 1),
}


def _series(values, div=1):
    return [round(x / div, 3) for x in values if isinstance(x, (int, float))]


def nation_trends(g):
    """Serie storiche per nazione, con le stesse nazioni di `nations()`.

    Fuori dallo snapshot apposta: sono ~30 punti per 12 indicatori per ~200
    nazioni, e lo snapshot viene archiviato a ogni salvataggio. Il gioco non
    documenta ogni quanto registra un punto: sono «le ultime N rilevazioni».
    """
    me_key = (g.me.get("templateName") or "").replace("Council", "")
    out, points = {}, 0
    for n in g.nations.values():
        name = n.get("displayName")
        if not name or not n.get("controlPoints"):
            continue
        s = {k: _series(_chrono(n.get(f)), d) for k, (f, d) in TREND_FIELDS.items()}
        # il PIL pro capite non ha una serie sua: si ricava punto per punto,
        # come fa nations() per il valore attuale (PIL / popolazione in milioni)
        gdp, pop = _chrono(n.get("historyGDP")), _chrono(n.get("historyPopulation"))
        s["gdpPc"] = [round(g_ / (p * 1e6), 1) if p else 0
                      for g_, p in zip(gdp, pop)]
        s["support"] = [round(op.get(me_key, 0), 4)
                        for op in _chrono(n.get("historyPublicOpinion"))
                        if isinstance(op, dict)]
        points = max(points, *(len(v) for v in s.values()))
        out[name] = s
    return {"points": points, "nations": out}


# indicatore -> prefisso dei tracker di causa nel salvataggio. Sono le tabelle
# «Causa del cambiamento di valore» che il gioco mostra nella scheda nazione,
# con le stesse tre colonne: questo mese, mese scorso, complessivo.
REASON_FIELDS = {
    "gdp": "GDP",
    "inequality": "Inequality",
    "cohesion": "Cohesion",
    "unrest": "Unrest",
    "education": "Education",
    "democracy": "Democracy",
}
_PERIODS = (("month", "CurrentTrackingPeriod"), ("last", "PriorTrackingPeriod"),
            ("all", "AllTime"))

# voce di PriorityType (come la scrive controlPointPriorities) -> campo preset
_PRIORITY_KEY = {kind: key for key, (kind, _) in gamedata.PRIORITIES.items()}


def _reasons(n, lang):
    out = {}
    for stat, prefix in REASON_FIELDS.items():
        tables = {col: n.get("tracker_%sChangeReason_%s" % (prefix, field)) or {}
                  for col, field in _PERIODS}
        rows = []
        for reason in tables["all"].keys() | tables["month"].keys() | tables["last"].keys():
            vals = {col: tables[col].get(reason) or 0 for col in tables}
            if not any(vals.values()):
                continue                   # il gioco elenca anche le cause a zero
            rows.append(dict(vals, id=reason,
                             name=gamedata.strings(lang).get(reason)
                             or gamedata.strings("en").get(reason) or reason))
        rows.sort(key=lambda r: -abs(r["all"]))
        out[stat] = rows
    return out


def _preset_index(g, lang):
    """{pesi congelati: nome} dei preset che il giocatore puo' aver scelto:
    quelli del gioco, i nostri installati e quelli salvati in partita."""
    from . import presets              # import tardivo: presets importa gamedata
    st = presets.status(lang)
    idx = {}
    for p in st.get("presets", []) + [p for p in st.get("pending", []) if p["installed"]]:
        idx.setdefault(frozenset(p["weights"].items()), p["name"])
    for p in g.me.get("customPresets") or []:
        if isinstance(p, dict):
            w = presets.weights(p)
            idx.setdefault(frozenset(w.items()),
                           p.get("friendlyName") or p.get("dataName") or "?")
    return idx


def _shares(weights):
    t = sum(weights.values())
    return {k: v / t for k, v in weights.items()} if t else {}


def _closest(weights, index):
    """Il preset piu' simile e quanto bilancio andrebbe spostato per arrivarci:
    meta' della distanza L1 fra le quote. EURISTICA NOSTRA, non del gioco."""
    mine = _shares(weights)
    best = None
    for key, name in index.items():
        other = _shares(dict(key))
        d = sum(abs(mine.get(k, 0) - other.get(k, 0)) for k in mine.keys() | other.keys()) / 2
        if best is None or d < best[1]:
            best = (name, d)
    return {"name": best[0], "moved": round(best[1], 4)} if best else None


def nation_detail(g, name, lang="ita"):
    """Perche' una nazione si muove: cause di variazione e priorita' in uso.

    Le cause sono i tracker che il gioco mostra nella scheda nazione. Le
    priorita' sono solo quelle dei NOSTRI punti di controllo: sono le uniche
    che il giocatore imposta e vede.
    """
    n = next((x for x in g.nations.values() if x.get("displayName") == name), None)
    if n is None:
        return None
    index = None
    cps = []
    for c in n.get("controlPoints") or []:
        cp = g.cps.get(c["value"])
        if not cp or g.factions.get((cp.get("faction") or {}).get("value")) is not g.me:
            continue
        raw = cp.get("controlPointPriorities") or {}
        weights = {_PRIORITY_KEY[k]: v for k, v in raw.items()
                   if v and k in _PRIORITY_KEY}
        total = sum(weights.values())
        if index is None:
            index = _preset_index(g, lang)
        order = list(gamedata.PRIORITIES)
        cps.append({
            "position": cp.get("positionInNation"),
            "name": cp.get("displayName"),
            "benefitsDisabled": bool(cp.get("benefitsDisabled")),
            "total": total,
            # nessun campo dice quale preset e' stato scelto: si confrontano i
            # pesi. Se coincidono con piu' preset, vale il primo trovato.
            "preset": index.get(frozenset(weights.items())) if weights else None,
            "closest": _closest(weights, index) if weights else None,
            "priorities": [dict(gamedata.priority_view(lang, k), weight=w,
                                share=w / total if total else 0)
                           for k, w in sorted(weights.items(),
                                              key=lambda kv: (-kv[1], order.index(kv[0])))],
        })
    cps.sort(key=lambda c: c["position"] if c["position"] is not None else 99)
    strings = gamedata.strings(lang)
    return {
        "name": name,
        "columns": {k: strings.get(key) or gamedata.strings("en").get(key) or k
                    for k, key in (("cause", "UI.Nation.Cause"), ("month", "UI.Nation.MTD"),
                                   ("last", "UI.Nation.LastMonth"),
                                   ("all", "UI.Nation.AllTime"))},
        "reasons": _reasons(n, lang),
        "controlPoints": cps,
    }


def flows(g, months_back=1, lang="ita"):
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
        "categories": [flow_category(c, lang) for c in agg],
        "net": dict(net),
        "resources": {k: gamedata.resource_view(lang, k) for k in net},
    }


# etichette che il salvataggio scrive in chiaro, in inglese
_FLOW_LABELS = {
    "Daily Income": "Entrate correnti",
    "Objective Completed": "Obiettivo completato",
    "Narrative Event": "Evento narrativo",
}


def flow_category(cat, lang="ita"):
    """Etichetta di una categoria di transazione.

    Il salvataggio mescola tre cose sotto la stessa chiave: nomi interni di
    missione, etichette inglesi fisse, e codici numerici che **non
    corrispondono a nessun id presente nel save** — sono hash, non risolvibili.
    Quelli restano dichiarati come tali invece di inventare un nome.
    """
    if cat in _FLOW_LABELS:
        return {"id": cat, "name": _FLOW_LABELS[cat], "kind": "label"}
    if cat.lstrip("-").isdigit():
        return {"id": cat, "name": None, "kind": "unresolved"}
    name = gamedata.mission_name(lang, cat)
    return {"id": cat, "name": name,
            "icon": gamedata.mission_icon(cat),
            "kind": "mission" if name != cat else "label"}


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
        "campaignStart": g.campaign_key(),
        "factionColors": gamedata.faction_colors(g.me.get("templateName")),
        "save": __import__("os").path.basename(g.path),
        "mtime": g.mtime,
        "lang": lang,
        "resources": {k: round(v, 1) for k, v in (g.me.get("resources") or {}).items()
                      if k in RESOURCES},
        "flows": flows(g, 1, lang),
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
