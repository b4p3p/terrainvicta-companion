"""Costruzione del payload completo: nazioni, risorse, progetti, flussi."""

from collections import defaultdict

from functools import lru_cache

from . import council, gamedata, texts
from .names import Namer, bare, nation_id

# Il filtro «Europa» delle nazioni. Scritto coi nomi italiani del gioco per
# leggibilita', confrontato per chiave di template (`_eu_ids`): i nomi
# cambiano con la lingua del salvataggio, le chiavi no.
EU = {"Francia", "Germania", "Regno Unito", "Italia", "Spagna", "Polonia",
      "Paesi Bassi", "Belgio-Lussemburgo", "Svizzera", "Svezia", "Irlanda",
      "Norvegia", "Austria", "Portogallo", "Danimarca", "Grecia", "Finlandia",
      "Repubblica Ceca", "Romania", "Ungheria", "Ucraina", "Turchia"}


@lru_cache(maxsize=1)
def _eu_ids():
    s = gamedata.strings("ita")
    return {k.rsplit(".", 1)[1] for k, v in s.items()
            if k.startswith(("TINationTemplate.displayName.", "TINationTemplate.unionDisplayName."))
            and v.split("	")[0].strip() in EU}

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


# Durata dell'abbandono di una nazione: TIGlobalConfig.selfDisableControlPointDuration_months,
# 6 nel costruttore e in nessun template (IL di TINationState.SelfDisableControlPoints).
# Scade con crackdownExpiration; il rinnovo automatico la sposta di altri 6 mesi.
ABANDON_MONTHS = 6


def nations(g, lang="ita"):
    me_key = (g.me.get("templateName") or "").replace("Council", "")
    nm = Namer(g, lang)
    out = []
    for n in g.nations.values():
        cps = n.get("controlPoints") or []
        if not n.get("displayName") or not cps:
            continue
        name = nm.nation(n)
        owners, mine, free, taken = {}, 0, 0, 0
        for c in cps:
            cp = g.cps.get(c["value"])
            fid = (cp.get("faction") or {}).get("value") if cp else None
            if not fid:
                free += 1
            elif g.factions.get(fid) is g.me:
                mine += 1
            else:
                taken += 1
                owners[(g.factions.get(fid) or {}).get("templateName") or "?"] = nm.faction_by_id(fid)
        pop = _now(n.get("historyPopulation")) or 0
        gdp = n.get("GDP") or 0
        # per la probabilita' delle missioni (missions.game_chance): dati che
        # il gioco mostra nella scheda nazione e nei punti di controllo
        cp_objs = [g.cps.get(c["value"]) for c in cps]
        cp_objs = [c for c in cp_objs if c]
        funding = [((c.get("controlPointPriorities") or {}).get("Funding") or 0)
                   / c["totalWeightsForControlPoint"]
                   for c in cp_objs if c.get("totalWeightsForControlPoint")]
        hist = [round(x, 1) for x in _chrono(n.get("historyResearch"))][-32:]
        # i tuoi punti coi benefici sospesi (nazione abbandonata o Reprimi),
        # la prima scadenza e l'inizio stimato, GG/MM/AAAA come il gioco
        off = [c for c in cp_objs if c.get("benefitsDisabled")
               and g.factions.get((c.get("faction") or {}).get("value")) is g.me]
        until = sorted((e["year"], e["month"], e["day"]) for e in
                       (c.get("crackdownExpiration") for c in off) if e and e.get("year"))
        since = None
        if until:
            y, m, _ = until[0]
            m -= ABANDON_MONTHS
            y, m = (y - 1, m + 12) if m < 1 else (y, m)
            since = "%02d/%04d" % (m, y)

        op = _now(n.get("historyPublicOpinion")) or n.get("publicOpinion") or {}
        out.append({
            "id": nation_id(n),              # chiave stabile: il nome cambia con la lingua
            "name": name,
            "saveName": n.get("displayName"),  # com'e' nel salvataggio: obiettivi e note vecchi
            "eu": bare(nation_id(n)) in _eu_ids(),
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
            "myCPDisabled": len(off),
            "myCPDisabledUntil": "%02d/%02d/%04d" % until[0][::-1] if until else None,
            "myCPDisabledSince": since,
            # «Rinnovo automatico abbandono» (TIFactionState.permaAbandonedNations)
            "autoAbandon": any((x or {}).get("value") == (n.get("ID") or {}).get("value")
                               for x in g.me.get("permaAbandonedNations") or []),
            # quanto occupa un punto di questa nazione nel tetto dei punti di controllo
            "cpCost": round(cp_cost(g, n), 2),
            "owners": sorted(set(owners.values())),
            "ownerIds": {k: owners[k] for k in sorted(owners)},   # id fazione -> nome
            "defendedCP": sum(1 for c in cp_objs if c.get("defended")),
            # il punto degli oligarchi e' tuo, coi benefici attivi: +3 al colpo di stato
            "myOligarchs": any(c.get("controlPointType") == "Oligarchs"
                               and g.factions.get((c.get("faction") or {}).get("value")) is g.me
                               and not c.get("benefitsDisabled") for c in cp_objs),
            # altre fazioni con punti coi benefici attivi: difesa congiunta dei
            # loro consiglieri, che il companion non puo' leggere
            "defendedByOthers": any((c.get("faction") or {}).get("value")
                                    and g.factions.get(c["faction"]["value"]) is not g.me
                                    and not c.get("benefitsDisabled") for c in cp_objs),
            # quota media della priorita' Funding sui punti (TINationState.percentWeighttoPriority)
            "fundingShare": sum(funding) / len(cp_objs) if cp_objs else 0,
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
        if not n.get("displayName") or not n.get("controlPoints"):
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
        out[nation_id(n)] = s             # per id, come `nations()[i]["id"]`
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


def nation_detail(g, key, lang="ita"):
    """Perche' una nazione si muove: cause di variazione e priorita' in uso.

    Le cause sono i tracker che il gioco mostra nella scheda nazione. Le
    priorita' sono solo quelle dei NOSTRI punti di controllo: sono le uniche
    che il giocatore imposta e vede.
    """
    # per id; il nome del salvataggio resta accettato per i link vecchi
    n = next((x for x in g.nations.values()
              if nation_id(x) == key or x.get("displayName") == key), None)
    if n is None:
        return None
    nm = Namer(g, lang)
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
            "name": nm.control_point(cp),
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
        "id": nation_id(n),
        "name": nm.nation(n),
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
    recurring = defaultdict(float)
    for cat in agg:
        for k, v in agg[cat].items():
            net[k] += v
            if cat in RECURRING:
                recurring[k] += v
    return {
        "year": y, "month": m,
        "byCategory": {c: dict(v) for c, v in agg.items()},
        "categories": [flow_category(c, lang) for c in agg],
        "net": dict(net),
        # senza le spese una tantum (assunzioni, org, missioni, eventi): e'
        # questo, non `net`, a dire se una risorsa cala da sola
        "recurring": dict(recurring),
        "resources": {k: gamedata.resource_view(lang, k) for k in net},
    }


# le sole categorie che si ripetono ogni mese senza una scelta del giocatore
RECURRING = ("Daily Income", "Spoils")

# etichette che il salvataggio scrive in chiaro, in inglese: la traduzione
# e' in texts.py (`flow.<etichetta>`)
_FLOW_LABELS = ("Daily Income", "Objective Completed", "Narrative Event",
                "Hire Councilor", "Purchase Org", "Spoils")


def flow_category(cat, lang="ita"):
    """Etichetta di una categoria di transazione.

    Il salvataggio mescola tre cose sotto la stessa chiave: nomi interni di
    missione, etichette inglesi fisse, e codici numerici che **non
    corrispondono a nessun id presente nel save** — sono hash, non risolvibili.
    Quelli restano dichiarati come tali invece di inventare un nome.
    """
    if cat in _FLOW_LABELS:
        return {"id": cat, "name": texts.t("flow." + cat, lang), "kind": "label"}
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
    # ogni slot riceve solo la sua quota (peso / somma dei pesi, vedi research()):
    # con tutta la ricerca del mese, un progetto fermo sembrava quasi finito
    share = {x["slot"]: x["share"] for x in research(g, lang)["slots"] if x["kind"] == "project"}
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
            "share": share.get(p.get("slot")) if p else None,
            "monthsLeft": (round((cost - p.get("accumulatedResearch", 0))
                                 / (rate * share[p["slot"]]), 1)
                           if p and rate and share.get(p.get("slot")) else None),
        })
    return {"rate": round(rate, 1), "items": out}


def research(g, lang="ita"):
    """Gli slot di ricerca: tecnologie globali (0-2) e progetti (3-5).

    Ripartizione letta dal codice del gioco (TIFactionState.PointsToSlot e
    TotalResearchWeights): ogni slot riceve la ricerca effettiva per peso dello
    slot / somma dei pesi. Nella somma entrano sempre i pesi 0-3; il 4 solo se
    e' sbloccato lo slot del progetto di un'organizzazione
    (`orgProjectSlotUnlocked`), il 5 solo con quello dell'habitat
    (`habProjectSlotUnlocked`). La ricerca effettiva cambia per categoria
    (bonus del gioco): per questo l'avanzamento vero si misura sul salvataggio
    precedente, non si ricava dalla quota.

    Delle tecnologie ci sono anche i contributi di ogni fazione: il gioco li
    mostra nella schermata Ricerca (FactionContributionListItemController),
    insieme al vincitore atteso. I pesi di ricerca delle altre fazioni invece
    no, e restano fuori: il ritmo di ognuna si misura sui salvataggi.
    """
    w = list(g.me.get("researchWeights") or [])
    org = bool(g.me.get("orgProjectSlotUnlocked"))
    hab = bool(g.me.get("habProjectSlotUnlocked"))

    def weight(slot):
        if slot >= len(w) or (slot == 4 and not org) or (slot == 5 and not hab):
            return 0
        return w[slot]

    total = sum(weight(i) for i in range(len(w)))
    me_id = (g.me.get("ID") or {}).get("value")
    nm = Namer(g, lang)
    slots = []
    state = next(iter(g.state("TIGlobalResearchState").values()), {})
    techs = gamedata.templates()["techs"]
    for i, tp in enumerate((state.get("techProgress") or [])[:3]):
        name = tp.get("techTemplateName")
        mine = next((c.get("Value", 0) for c in tp.get("factionContributions") or []
                     if (c.get("Key") or {}).get("value") == me_id), 0)
        slots.append({
            "slot": i, "kind": "tech", "id": name,
            "name": gamedata.tech_name(lang, name),
            "category": (techs.get(name) or {}).get("techCategory"),
            "cost": (techs.get(name) or {}).get("researchCost") or 0,
            "accumulated": round(tp.get("accumulatedResearch") or 0, 2),
            "mine": round(mine or 0, 2),
            # tutte le fazioni umane, anche a zero: per id di template, che non
            # cambia con la lingua (l'id di salvataggio si', fra partite)
            "contributions": [
                {"id": (g.factions.get(fid) or {}).get("templateName"),
                 "name": nm.faction(g.factions.get(fid)),
                 "mine": fid == me_id,
                 "value": round(c.get("Value") or 0, 2)}
                for c in tp.get("factionContributions") or []
                for fid in [(c.get("Key") or {}).get("value")]
                if g.factions.get(fid) and g.factions[fid].get("templateName") != "AlienCouncil"],
            "weight": weight(i),
            "share": weight(i) / total if total else 0,
        })
    ptpl = gamedata.templates()["projects"]
    for p in sorted(g.me.get("currentProjectProgress") or [], key=lambda x: x.get("slot", 99)):
        name, slot = p.get("projectTemplateName"), p.get("slot")
        acc = round(p.get("accumulatedResearch") or 0, 2)
        slots.append({
            "slot": slot, "kind": "project", "id": name,
            "name": gamedata.project_name(lang, name),
            "category": (ptpl.get(name) or {}).get("techCategory"),
            "cost": (ptpl.get(name) or {}).get("researchCost") or 0,
            "accumulated": acc, "mine": acc,      # un progetto e' solo tuo
            "weight": weight(slot) if isinstance(slot, int) else 0,
            "share": (weight(slot) / total) if isinstance(slot, int) and total else 0,
        })
    return {"weights": w, "totalWeight": total, "orgSlot": org, "habSlot": hab,
            "slots": slots}


def _days(a, b):
    """Giorni di gioco fra due `dateKey` AAAA-MM-GG."""
    import datetime
    try:
        return (datetime.date.fromisoformat(a) - datetime.date.fromisoformat(b)).days
    except (TypeError, ValueError):
        return None


def _race(s, b, days):
    """Chi vince la tecnologia a questo ritmo.

    Stessa regola del gioco (TechProgress.GetExpectedWinner): giorni alla fine
    = costo mancante / somma dei ritmi; vince chi ha il contributo piu' alto
    alla fine (attuale + giorni x ritmo); se il primo ha gia' piu' vantaggio
    di quanto manca, ha vinto comunque. Il gioco usa il ritmo previsto dai
    pesi di ognuno, che non vedi: qui c'e' quello OSSERVATO fra due
    salvataggi. Senza un salvataggio precedente: solo la classifica attuale.
    """
    before = {c["id"]: c["value"] for c in (b or {}).get("contributions", [])}
    left = max(s["cost"] - s["accumulated"], 0)
    rows = []
    for c in s["contributions"]:
        r = dict(c)
        if c["id"] in before and days:
            r["delta"] = round(c["value"] - before[c["id"]], 2)
            r["perDay"] = r["delta"] / days
        rows.append(r)
    paced = all("perDay" in r for r in rows)
    total = sum(max(r.get("perDay", 0), 0) for r in rows) if paced else 0
    days_left = left / total if total > 0 else None
    for r in rows:
        r["projected"] = round(r["value"] + (days_left or 0) * max(r.get("perDay", 0), 0), 1)             if days_left is not None else None
    key = "projected" if days_left is not None else "value"
    rows.sort(key=lambda r: -(r[key] or 0))
    top = sorted(rows, key=lambda r: -r["value"])
    locked = len(top) > 1 and top[0]["value"] - top[1]["value"] > left
    winner = top[0] if locked else rows[0]
    me = next((r for r in rows if r["mine"]), None)
    lead_now = top[0]
    out = {"rows": rows, "daysLeft": round(days_left) if days_left else None,
           "winner": winner["id"], "locked": locked, "paced": paced}
    if me:
        others = [r for r in top if not r["mine"]]
        best_other = others[0] if others else None
        out["myRank"] = [r["id"] for r in top].index(me["id"]) + 1
        # distacco dal migliore degli altri: positivo = sei davanti
        if best_other:
            out["gap"] = round(me["value"] - best_other["value"], 1)
            out["gapTo"] = best_other["id"]
            if me.get("delta") is not None and best_other.get("delta") is not None:
                out["gapChange"] = round(me["delta"] - best_other["delta"], 1)
    return out


def research_delta(cur, prev):
    """La ricerca di `cur` con l'avanzamento di ogni slot rispetto a `prev`:
    punti guadagnati, in totale e dalla tua fazione, e la stima di quando
    finisce a quel ritmo. Stima NOSTRA: il ritmo di un solo intervallo."""
    r = dict(cur.get("research") or {})
    before = {(s["kind"], s["id"]): s for s in ((prev or {}).get("research") or {}).get("slots", [])}
    if prev and "research" not in prev:
        # snapshot archiviato prima di questa sezione: dei progetti si sa
        # l'accumulato, delle tecnologie no
        before = {("project", x["id"]): {"accumulated": x["accumulated"], "mine": x["accumulated"]}
                  for x in (prev.get("projects") or {}).get("items", []) if x.get("active")}
    days = _days(cur.get("dateKey"), (prev or {}).get("dateKey")) if prev else None
    out = []
    for s in r.get("slots", []):
        b = before.get((s["kind"], s["id"]))
        d = dict(s)
        if b is not None:
            d["delta"] = round(s["accumulated"] - b["accumulated"], 2)
            d["deltaMine"] = round(s["mine"] - b["mine"], 2)
            left = s["cost"] - s["accumulated"]
            per_day = d["delta"] / days if days else None
            d["daysLeft"] = round(left / per_day) if per_day and per_day > 0 and left > 0 else None
        if s["kind"] == "tech" and s.get("contributions"):
            d["race"] = _race(s, b, days)
        out.append(d)
    r["slots"] = out
    r["previous"] = {"date": prev.get("date"), "dateKey": prev.get("dateKey"),
                     "days": days} if prev else None
    return r


def control_points(g, lang="ita"):
    """({id nazione: punti miei}, {id nazione: nome}): per id, perche' le
    allerte confrontano snapshot che possono essere in lingue diverse."""
    nm = Namer(g, lang)
    by_nation, names = defaultdict(int), {}
    for cp in g.my_control_points():
        n = g.ref(cp, "nation", g.nations)
        key = nation_id(n) or "?"
        by_nation[key] += 1
        names[key] = nm.nation(n) or "?"
    return dict(by_nation), names


# Capacita' dei punti di controllo: la barra «173/185» del gioco, con le
# regole di TIFactionState/TINationState (IL, non documentate nei testi).
# Il costo di mantenimento di una nazione e' (PIL / K)^0,6 / 2, diviso in parti
# uguali fra i suoi punti; K e' fissato a inizio campagna e sta nel salvataggio.
CP_COST_SCALING = 0.6         # TIGlobalConfig.controlPointCostScaling
CP_COST_DIVISOR = 2.0         # TIGlobalConfig.controlPointMaintenanceDivisor
CP_CAP_ATTRS = ("Persuasion", "Command", "Administration")   # TICouncilorState.controlPointCapacity


def _global_values(g):
    return next(iter(g.state("TIGlobalValuesState").values()), {})


def cp_cost(g, n):
    """Costo di un punto di controllo della nazione `n` (ControlPointMaintenanceCost).
    Il moltiplicatore della data d'inizio (CPMaintenanceModifier) vale 1 in
    tutti gli scenari del gioco."""
    k = _global_values(g).get("fixedPCGDPToRaiseBaseCPMaintenanceCostBy1") or 0
    num = n.get("numControlPoints") or len(n.get("controlPoints") or [])
    if k <= 0 or not num or n.get("alienNation"):
        return 0.0
    return ((n.get("GDP") or 0) / k) ** CP_COST_SCALING / (CP_COST_DIVISOR * num)


def cp_capacity(g):
    """Uso e tetto dei punti di controllo, come nella barra in alto del gioco.

    uso   = somma dei costi dei miei punti coi benefici attivi
    tetto = bonus di scenario + PER+CMD+AMM dei consiglieri (org comprese)
            + effetti ControlPointMaintenance (progetti) + habitat.
    Gli habitat (moduli con controlPointCapacity) non sono calcolati: se ne hai,
    `habsMissing` lo dice e il tetto e' una stima per difetto.
    """
    used = sum(cp_cost(g, g.ref(cp, "nation", g.nations))
               for cp in g.my_control_points() if not cp.get("benefitsDisabled"))
    base = _global_values(g).get("controlPointMaintenanceFreebies") or 0
    councilors = 0
    for c in g.my_councilors():
        eff = council.councilor_view(g, c)["attributes"]
        councilors += sum(eff.get(a, 0) for a in CP_CAP_ATTRS)
    fx = next(iter(g.state("TIEffectsState").values()), {})
    mine = next((e.get("Value") or {} for e in fx.get("factionEffectsNames") or []
                 if (e.get("Key") or {}).get("value") == (g.me.get("ID") or {}).get("value")), {})
    tpl = gamedata.templates()["effects"]
    # effetti additivi con valore negativo = tetto piu' alto (showTotal: Invert)
    effects = -sum((tpl.get(name) or {}).get("value") or 0
                   for name in mine.get("ControlPointMaintenance") or [])
    cap = base + councilors + effects
    return {
        "used": round(used, 2), "cap": cap, "free": round(cap - used, 2),
        "base": base, "councilors": councilors, "effects": effects,
        "habsMissing": bool(g.me.get("habs")),
    }


def alien_sites(g, lang="ita"):
    nm = Namer(g, lang)
    out = []
    for e in (g.me.get("knownAlienSites") or []):
        rid = (e.get("Key") or {}).get("value")
        d = e.get("Value") or {}
        out.append({
            "regionId": rid,
            "region": nm.region_label(rid),
            "since": "%02d/%02d/%04d" % (d.get("day", 0), d.get("month", 0), d.get("year", 0)),
            "sinceKey": "%04d-%02d-%02d" % (d.get("year", 0), d.get("month", 0), d.get("day", 0)),
        })
    # il piu' recente in cima: e' quello a cui non hai ancora reagito
    return sorted(out, key=lambda s: s["sinceKey"], reverse=True)


def snapshot(g, lang="ita"):
    """Payload completo. Niente informazione nascosta salvo dove esplicitato."""
    ns = nations(g, lang)
    cpn, cp_names = control_points(g, lang)
    return {
        "faction": Namer(g, lang).faction(g.me),
        "date": g.meta.get("gameTimeString", ""),
        "dateKey": g.date_key(),
        "difficulty": g.meta.get("difficulty"),
        "campaignStart": g.campaign_key(),
        "factionColors": gamedata.faction_colors(g.me.get("templateName")),
        "factionCursor": gamedata.faction_cursor(g.me.get("templateName")),
        "save": __import__("os").path.basename(g.path),
        "mtime": g.mtime,
        "lang": lang,
        "resources": {k: round(v, 1) for k, v in (g.me.get("resources") or {}).items()
                      if k in RESOURCES},
        "flows": flows(g, 1, lang),
        # byNation per id di nazione; `names` per mostrarli
        "controlPoints": {"byNation": cpn, "names": cp_names, "mine": sum(cpn.values()),
                          "total": sum(n["cp"] for n in ns),
                          "capacity": cp_capacity(g)},
        "nations": ns,
        "council": council.analyse(g, lang),
        "recruits": council.recruits(g, lang),
        "orgMarket": council.org_market(g, lang),
        "projects": projects(g, lang),
        "research": research(g, lang),
        "alienSites": alien_sites(g, lang),
        # la serie e' dal piu' recente (vedi _chrono): conta solo oggi. Con
        # any() l'allerta restava accesa per 32 giorni dopo essere rientrati
        "cpCapOverage": bool((g.me.get("history_CPCapOverageByDay") or [0])[0]),
    }
