"""Analisi del consiglio: punti di forza, buchi, copertura delle missioni.

Regole verificate sui template del gioco:
- le missioni di un consigliere = quelle del suo TIPO + quelle concesse dalle
  sue ORGANIZZAZIONI + quelle imparate (`learnedMissionsTemplateNames`);
- le org non hanno requisiti di attributo: i vincoli sono `requiresNationality`,
  `requiredOwnerTraits`, `prohibitedOwnerTraits`;
- ogni missione tira su un attributo, leggibile dai modificatori di risoluzione.
"""

from . import gamedata

ATTRS = ["Persuasion", "Investigation", "Espionage", "Command",
         "Administration", "Science", "Security"]

# sigle italiane storiche, usate anche dalla CLI
ATTR_SHORT = {
    "Persuasion": "PER", "Investigation": "IND", "Espionage": "SPI",
    "Command": "CMD", "Administration": "AMM", "Science": "SCI",
    "Security": "SIC",
}

ORG_ATTR_FIELD = {a: a[0].lower() + a[1:] for a in ATTRS}


def org_view(g, o, lang="ita"):
    """Org del salvataggio -> dizionario piatto con costi, rendite e requisiti."""
    tpl = gamedata.templates()["orgs"].get(o.get("templateName")) or {}
    home = g.region_nation((o.get("homeRegion") or {}).get("value"))
    return {
        "id": (o.get("ID") or {}).get("value"),
        "name": o.get("displayName"),
        "template": o.get("templateName"),
        "type": tpl.get("orgType"),
        "tier": o.get("tier"),
        "cost": {
            "money": o.get("costMoney") or 0,
            "influence": o.get("costInfluence") or 0,
            "ops": o.get("costOps") or 0,
            "boost": o.get("costBoost") or 0,
        },
        "income": {
            "money": o.get("incomeMoney_month") or 0,
            "influence": o.get("incomeInfluence_month") or 0,
            "ops": o.get("incomeOps_month") or 0,
            "research": o.get("incomeResearch_month") or 0,
            "boost": o.get("incomeBoost_month") or 0,
            "missionControl": o.get("incomeMissionControl") or 0,
        },
        "attributes": {a: o.get(ORG_ATTR_FIELD[a]) or 0 for a in ATTRS
                       if o.get(ORG_ATTR_FIELD[a])},
        "projectSlots": o.get("projectCapacityGranted") or 0,
        "missionsGranted": tpl.get("missionsGrantedNames") or [],
        "requiresNationality": bool(tpl.get("requiresNationality")),
        "requiredTraits": tpl.get("requiredOwnerTraits") or [],
        "prohibitedTraits": tpl.get("prohibitedOwnerTraits") or [],
        "homeNation": (home or {}).get("displayName"),
        "assigned": ((o.get("assignedCouncilor") or {}) or {}).get("value"),
    }


def can_hold(org, nationality, traits):
    """(bool, [motivi]) — perche' un consigliere non puo' tenere questa org."""
    why = []
    if org["requiresNationality"] and org["homeNation"] and nationality != org["homeNation"]:
        why.append({"kind": "nationality", "value": org["homeNation"]})
    req = set(org["requiredTraits"])
    if req and not (req & set(traits)):
        why.append({"kind": "requiredTrait", "value": sorted(req)})
    forb = set(org["prohibitedTraits"]) & set(traits)
    if forb:
        why.append({"kind": "prohibitedTrait", "value": sorted(forb)})
    return (not why), why


# sotto questa soglia nessuno del consiglio e' credibile su un attributo
WEAK_AT = 4

# da questa soglia in su un consigliere e' una scelta seria per le missioni che
# tirano su quell'attributo. Euristica nostra, non del gioco: serve a contare
# quanti tentativi paralleli il consiglio puo' fare, non a dare un voto.
STRONG_AT = 6


def income_of(c, traits):
    """Reddito mensile del consigliere.

    Per chi e' gia' in consiglio il salvataggio espone `incomeX_month`. Per i
    candidati quei campi sono vuoti, quindi il reddito si ricostruisce dai
    tratti — che ne sono comunque l'unica origine, visto che i candidati non
    hanno org. `fromTraits` dice quale delle due strade e' stata usata.
    """
    keys = (("money", "incomeMoney_month"),
            ("influence", "incomeInfluence_month"),
            ("research", "incomeResearch_month"),
            ("ops", "incomeOps_month"),
            ("boost", "incomeBoost_month"))
    saved = {k: c.get(f) or 0 for k, f in keys}
    if any(saved.values()):
        saved["fromTraits"] = False
        return saved

    out = {k: 0 for k, _ in keys}
    for t in traits:
        for k, v in gamedata.trait_income(t).items():
            if k in out:
                out[k] += v
    out["fromTraits"] = True
    return out


def age_of(g, c):
    """Anni compiuti alla data di gioco, da `dateBorn`. None se manca."""
    born = c.get("dateBorn") or {}
    y, m, d = g.game_date()
    if not born.get("year") or not y:
        return None
    return y - born["year"] - ((m, d) < (born.get("month", 1), born.get("day", 1)))


def councilor_view(g, c, lang="ita", known=True):
    """Un consigliere: attributi base ed effettivi, org, missioni, tratti.

    `known=False` per i candidati: la lealta' reale resta fuori dal payload.
    """
    attrs = c.get("attributes") or {}
    orgs = []
    for ref in (c.get("orgs") or []):
        o = g.orgs.get(ref["value"])
        if o:
            orgs.append(org_view(g, o, lang))

    effective = {a: attrs.get(a, 0) for a in ATTRS}
    for o in orgs:
        for a, v in o["attributes"].items():
            effective[a] += v

    ctype = c.get("typeTemplateName")
    traits = c.get("traitTemplateNames") or []
    missions = missions_for(ctype, traits, orgs, c.get("learnedMissionsTemplateNames"))
    home = g.region_nation((c.get("homeRegion") or {}).get("value"))

    out = {
        "id": (c.get("ID") or {}).get("value"),
        "name": c.get("displayName"),
        "type": ctype,
        "typeName": gamedata.councilor_type_name(lang, ctype),
        "nationality": (home or {}).get("displayName"),
        "location": g.region_label((c.get("location") or {}).get("value")),
        "xp": c.get("XP") or 0,
        "age": age_of(g, c),
        "base": {a: attrs.get(a, 0) for a in ATTRS},
        "attributes": effective,
        "traits": [{"id": t, "name": gamedata.trait_name(lang, t),
                    "effects": gamedata.trait_effects(lang, t)} for t in traits],
        "orgs": orgs,
        "missions": sorted(missions),
        "apparentLoyalty": attrs.get("ApparentLoyalty"),
        "priorMission": c.get("priorMissionTemplateName"),
        "income": income_of(c, traits),
    }
    if known:
        out["loyalty"] = attrs.get("Loyalty")
    return out


def missions_for(ctype, traits, orgs, learned=None):
    tpl = gamedata.templates()["councilorTypes"].get(ctype) or {}
    m = set(tpl.get("missionNames") or [])
    m.update(gamedata.base_missions())   # la categoria 'Standard', ce l'hanno tutti
    m.update(learned or [])
    for o in orgs:
        m.update(o["missionsGranted"])
    return m


def mission_view(lang, name, team):
    """Scheda di una missione + chi nel consiglio la sa fare meglio."""
    attr = gamedata.mission_attribute(name)
    res, val = gamedata.mission_cost(name)
    holders = [c for c in team if name in c["missions"]]
    best = None
    if holders:
        best = max(holders, key=lambda c: c["attributes"].get(attr, 0) if attr else 0)
    return {
        "id": name,
        "name": gamedata.mission_name(lang, name),
        "icon": gamedata.mission_icon(name),
        "attribute": attr,
        "attributeShort": ATTR_SHORT.get(attr),
        "cost": ({"resource": res, "value": val,
                  "resourceName": gamedata.resource_name(lang, res),
                  "icon": gamedata.RESOURCE_ICONS.get(res)} if res else None),
        "covered": bool(holders),
        "holders": [c["name"] for c in holders],
        "best": {"name": best["name"], "value": best["attributes"].get(attr, 0)}
                if best and attr else None,
    }


def analyse(g, lang="ita"):
    """Quadro completo del consiglio: squadra, copertura, buchi."""
    team = [councilor_view(g, c, lang) for c in g.my_councilors()]

    # punti di forza e debolezza per attributo
    coverage = {}
    for a in ATTRS:
        best = max(team, key=lambda c: c["attributes"].get(a, 0)) if team else None
        vals = [c["attributes"].get(a, 0) for c in team]
        coverage[a] = {
            "attribute": a,
            "short": ATTR_SHORT[a],
            "best": {"name": best["name"], "value": best["attributes"].get(a, 0)}
                    if best else None,
            "total": sum(vals),
            "max": max(vals) if vals else 0,
            "weak": (max(vals) if vals else 0) < WEAK_AT,
        }

    have = set()
    for c in team:
        have.update(c["missions"])
    all_missions = gamedata.player_missions()
    missing = sorted(all_missions - have)

    # per ogni missione mancante: chi potrebbe portarla
    tpl = gamedata.templates()
    providers = {}
    for name in missing:
        types = [t["dataName"] for t in tpl["councilorTypes"].values()
                 if t["dataName"] != "Alien" and name in (t.get("missionNames") or [])]
        orgs = [o["dataName"] for o in gamedata.obtainable_orgs().values()
                if name in (o.get("missionsGrantedNames") or [])]
        providers[name] = {
            "councilorTypes": [{"id": t, "name": gamedata.councilor_type_name(lang, t)}
                               for t in sorted(types)],
            "orgCount": len(orgs),
        }

    return {
        "team": team,
        "coverage": list(coverage.values()),
        "missions": {
            "covered": [mission_view(lang, m, team) for m in sorted(have)],
            "missing": [dict(mission_view(lang, m, team), providers=providers[m])
                        for m in missing],
        },
        "size": len(team),
    }


def recruits(g, lang="ita", include_hidden=False):
    """Candidati sul mercato, confrontati col consiglio attuale.

    A ogni candidato si aggiunge cosa cambierebbe prendendolo: quali missioni
    scoperte sbloccherebbe, di quanto alzerebbe il massimo di ogni attributo e
    quali attributi deboli sanerebbe. Sono differenze rispetto allo stato
    attuale, non un punteggio: la scelta resta all'utente.
    """
    team = [councilor_view(g, c, lang) for c in g.my_councilors()]
    have = set()
    for c in team:
        have.update(c["missions"])
    missing = gamedata.player_missions() - have
    best_now = {a: max([c["attributes"].get(a, 0) for c in team] or [0]) for a in ATTRS}
    strong_now = {a: sum(1 for c in team if c["attributes"].get(a, 0) >= STRONG_AT)
                  for a in ATTRS}
    base = gamedata.base_missions()

    out = []
    for c in g.available_councilors():
        v = councilor_view(g, c, lang, known=include_hidden)
        cov = sorted(missing & set(v["missions"]))
        v["covers"] = [{"id": m, "name": gamedata.mission_name(lang, m),
                        "icon": gamedata.mission_icon(m),
                        "attribute": gamedata.mission_attribute(m)} for m in cov]
        v["gain"] = {a: v["attributes"].get(a, 0) - best_now[a]
                     for a in ATTRS if v["attributes"].get(a, 0) > best_now[a]}
        # WEAK_AT: sotto questa soglia nessuno del consiglio e' credibile
        v["fixesWeak"] = sorted(
            ATTR_SHORT[a] for a in ATTRS
            if best_now[a] < WEAK_AT <= v["attributes"].get(a, 0))
        # quanti consiglieri forti su quell'attributo, prima e dopo
        v["depth"] = {a: {"now": strong_now[a], "after": strong_now[a] + 1}
                      for a in ATTRS if v["attributes"].get(a, 0) >= STRONG_AT}
        # le missioni standard le ha chiunque: elencarle non distingue nessuno
        v["missionList"] = [
            {"id": m, "name": gamedata.mission_name(lang, m),
             "icon": gamedata.mission_icon(m),
             "attribute": gamedata.mission_attribute(m), "new": m in missing}
            for m in sorted(set(v["missions"]) - base,
                            key=lambda m: gamedata.mission_name(lang, m))]
        out.append(v)
    return out


def org_market(g, lang="ita"):
    """Org acquistabili, con chi del consiglio puo' tenerle e cosa costa."""
    team = [councilor_view(g, c, lang) for c in g.my_councilors()]
    res = g.me.get("resources") or {}
    out = []
    for ref in (g.me.get("availableOrgs") or []):
        o = g.orgs.get(ref["value"])
        if not o:
            continue
        ov = org_view(g, o, lang)
        eligible, blocked = [], []
        for c in team:
            ok, why = can_hold(ov, c["nationality"], [t["id"] for t in c["traits"]])
            (eligible if ok else blocked).append(
                {"name": c["name"], "why": why})
        ov["eligible"] = [e["name"] for e in eligible]
        ov["blocked"] = blocked
        ov["affordable"] = (ov["cost"]["money"] <= (res.get("Money") or 0)
                            and ov["cost"]["influence"] <= (res.get("Influence") or 0))
        cm, im = ov["cost"]["money"], ov["income"]["money"]
        ci, ii = ov["cost"]["influence"], ov["income"]["influence"]
        months = [x for x in ((cm / im if cm > 0 and im > 0 else None),
                              (ci / ii if ci > 0 and ii > 0 else None)) if x]
        ov["paybackMonths"] = round(min(months), 1) if months and min(months) <= 60 else None
        out.append(ov)
    return out
