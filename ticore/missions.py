"""Selezione del bersaglio per una missione.

I fattori NON sono inventati: vengono dai modificatori di risoluzione che il
gioco dichiara in TIMissionTemplate. Per il colpo di stato, per esempio:

  attacco : Comando, ideologia della popolazione, operazioni spese,
            disordini, elite scontente, oligarchi
  difesa  : coesione, democrazia, PIL, punti di controllo difesi,
            Comando dei consiglieri nemici sul punto

Le formule esatte del gioco non sono pubbliche, quindi il punteggio qui e' una
**euristica dichiarata**: normalizza i fattori noti e li combina. I valori grezzi
sono sempre esposti accanto, cosi' la decisione resta tua.
"""

from . import council, gamedata
from .texts import TEXTS, t

# modificatore del gioco -> (campo della nazione, verso, etichetta in texts.py)
# verso +1 = aiuta l'attaccante, -1 = aiuta il difensore
NATION_FACTORS = {
    "NationUnrest":                ("unrest",     +1, "factor.unrest"),
    "NationCohesion":              ("cohesion",   -1, "factor.cohesion"),
    "NationDemocracy":             ("democracy",  -1, "factor.democracy"),
    "TargetNationGDP":             ("gdp",        -1, "factor.gdp"),
    "NationPopulation":            ("pop",        -1, "factor.population"),
    "AttackerPopulationIdeology":  ("support",    +1, "factor.support"),
    "DefenderPopulationIdeology":  ("support",    +1, "factor.support"),
    "NationalIndustries":          ("gdp",        +1, "factor.industries"),
    "SecurityApparatus":           ("miltech",    -1, "factor.security"),
}

# fattori che il gioco usa ma che non possiamo leggere dalla nazione: li
# elenchiamo senza valore, per onesta'. Etichetta in texts.py come
# `factor.<nome>`; quelli senza voce mostrano il nome interno del gioco.


def _opaque_label(s, lang):
    return t("factor." + s, lang) if "factor." + s in TEXTS else s

NATION_TARGET = "TIMissionTarget_Nation"


def _modifiers(name):
    t = gamedata.templates()["missions"].get(name) or {}
    rm = t.get("resolutionMethod") or {}
    return (rm.get("attackingModifiers") or []), (rm.get("defendingModifiers") or [])


def _short(mod):
    return (mod.get("$type") or "").split("_")[-1]


def factors(name, lang="ita"):
    """Fattori dichiarati dal gioco per questa missione, divisi fra leggibili e opachi.

    `side` ("attacco"/"difesa") e' un valore interno che l'interfaccia
    confronta: resta uguale in ogni lingua. Si traducono solo le etichette."""
    att, dfn = _modifiers(name)
    readable, opaque = [], []
    for mods, side in ((att, "attacco"), (dfn, "difesa")):
        for m in mods:
            s = _short(m)
            if s == "CouncilorAttackStat":
                readable.append({"side": side, "kind": "councilor",
                                 "field": m.get("attackerAttribute"),
                                 "label": t("factor.councilor", lang)})
            elif s in NATION_FACTORS:
                f, sign, label = NATION_FACTORS[s]
                readable.append({"side": side, "kind": "nation", "field": f,
                                 "sign": sign, "label": t(label, lang)})
            else:
                opaque.append({"side": side, "label": _opaque_label(s, lang)})
    return {"readable": readable, "opaque": opaque}


def targets_nation(snap, name, councilor=None):
    """Nazioni ordinate per convenienza come bersaglio di questa missione.

    `snap` e' il payload di model.snapshot(); `councilor` il dizionario di un
    consigliere (per mostrare il suo attributo rilevante).
    """
    lang = gamedata_lang(snap)
    f = factors(name, lang)
    nation_factors = [x for x in f["readable"] if x["kind"] == "nation"]
    if not nation_factors:
        return None

    # gli stati separatisti non ancora nati hanno punti di controllo ma PIL e
    # popolazione a zero: falsano ogni normalizzazione
    rows = [n for n in snap["nations"] if n["cp"] and n["gdp"] > 0 and n["pop"] > 0]
    if not rows:
        return None

    # normalizzazione min-max per ciascun fattore, cosi' sono confrontabili
    ranges = {}
    for fac in nation_factors:
        vals = [r.get(fac["field"]) or 0 for r in rows]
        lo, hi = min(vals), max(vals)
        ranges[fac["field"]] = (lo, hi if hi > lo else lo + 1)

    attr = gamedata.mission_attribute(name)
    my_attr = (councilor or {}).get("attributes", {}).get(attr) if attr else None

    out = []
    for r in rows:
        parts, score = [], 0.0
        for fac in nation_factors:
            v = r.get(fac["field"]) or 0
            lo, hi = ranges[fac["field"]]
            norm = (v - lo) / (hi - lo)
            contrib = norm * fac["sign"]
            score += contrib
            parts.append({"label": fac["label"], "field": fac["field"],
                          "value": v, "sign": fac["sign"],
                          "contribution": round(contrib, 3)})
        out.append({
            "id": r.get("id"),
            "name": r["name"],
            "eu": r["eu"],
            "myCP": r["myCP"], "freeCP": r["freeCP"], "takenCP": r["takenCP"],
            "cp": r["cp"], "owners": r["owners"],
            "difficulty": r["difficulty"],
            "gdp": r["gdp"], "pop": r["pop"], "research": r["research"],
            "unrest": r["unrest"], "cohesion": r["cohesion"],
            "democracy": r["democracy"], "support": r["support"],
            "score": round(score, 3),
            "factors": parts,
        })
    out.sort(key=lambda x: (-x["score"], -x["gdp"]))
    return {
        "mission": name,
        "missionName": gamedata.mission_name(lang, name),
        "attribute": attr,
        "attributeShort": council.attr_short(attr, lang),
        "councilorValue": my_attr,
        "factors": f,
        "targets": out,
    }


def gamedata_lang(snap):
    return snap.get("lang") or "ita"


def catalogue(snap, lang="ita"):
    """Tutte le missioni che il consiglio sa fare, con bersaglio e attributo."""
    team = snap["council"]["team"]
    out = []
    for m in snap["council"]["missions"]["covered"]:
        t = gamedata.templates()["missions"].get(m["id"]) or {}
        target = ((t.get("target") or {}).get("$type") or "").split("_")[-1]
        out.append({
            "id": m["id"],
            "name": m["name"],
            "attribute": m["attribute"],
            "attributeShort": m["attributeShort"],
            "cost": m["cost"],
            "target": target,
            "supportsTargeting": (t.get("target") or {}).get("$type") == NATION_TARGET,
            "holders": m["holders"],
            "best": m["best"],
            "xp": t.get("XPonSuccess") or 0,
        })
    out.sort(key=lambda x: x["name"])
    return out


def plan(snap, name, councilor_name=None):
    """Scheda completa per pianificare una missione: fattori + bersagli ordinati."""
    team = snap["council"]["team"]
    c = None
    if councilor_name:
        c = next((x for x in team if x["name"] == councilor_name), None)
    if c is None:
        attr = gamedata.mission_attribute(name)
        holders = [x for x in team if name in x["missions"]]
        if holders and attr:
            c = max(holders, key=lambda x: x["attributes"].get(attr, 0))
        elif holders:
            c = holders[0]
    res = targets_nation(snap, name, c)
    if res is None:
        lang = gamedata_lang(snap)
        return {"mission": name,
                "missionName": gamedata.mission_name(lang, name),
                "factors": factors(name, lang), "targets": None,
                "councilor": c["name"] if c else None,
                "note": t("mission.noTargeting", lang)}
    res["councilor"] = c["name"] if c else None
    res["candidates"] = [x["name"] for x in team if name in x["missions"]]
    return res
