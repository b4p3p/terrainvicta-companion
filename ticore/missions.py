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
    "DefenderPopulationIdeology":  ("support",    +1, "factor.defenderSupport"),
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
    # TIMissionModifier_Oligarchs_Defense -> Oligarchs_Defense (non "Defense")
    return (mod.get("$type") or "").replace("TIMissionModifier_", "", 1)


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


# --------------------------------------------------------------- la formula del gioco
# Letta nel codice (Assembly-CSharp), non stimata: TIMissionResolution_Contested.
#   D = somma dei modificatori d'attacco - somma di quelli di difesa
#   probabilita' = 0,5 x 0,775^|D|, e 1 - quella se D >= 0
# I modificatori per bersaglio nazione (GetModifier di ciascuno):
_KNOWN = {"CouncilorAttackStat", "AttackerPopulationIdeology", "ResourceSpent",
          "NationUnrest", "UnhappyElites", "Oligarchs", "FlatModifier",
          "JointControlPointStat", "NationCohesion", "HappyElites", "NationDemocracy",
          "TargetNationGDP", "numDefendedControlPoints", "Oligarchs_Defense",
          "PherocyteResistance", "DefenderPopulationIdeology"}


def _corruption(n):
    """TINationState.corruption, senza gli effetti di fazione che lo spostano
    (piccoli, e non tutti visibili): (75 - 3,98 dem - 0,86 coes - 0,0004 PIL/ab) / 150."""
    return (75 - 3.982725 * n["democracy"] - 0.86013 * n["cohesion"]
            - 0.000412312 * n["gdpPc"]) / 150


def _mod_value(mod, n, councilor_value):
    """(valore, noto?) di un modificatore per la nazione `n` (riga di nations())."""
    s = _short(mod)
    corr, fund = _corruption(n), n.get("fundingShare", 0)
    if s == "CouncilorAttackStat":
        return (councilor_value or 0) * (mod.get("multiplier") or 1), councilor_value is not None
    if s == "AttackerPopulationIdeology":
        return (10 + n["democracy"]) * (n["support"] or 0), True
    if s == "ResourceSpent":
        return 0.0, True                      # senza spendere risorse in piu'
    if s == "NationUnrest":
        return n["unrest"], True
    if s == "UnhappyElites":
        return ((corr - fund) * 15 if fund < corr else 0.0), True
    if s == "Oligarchs":
        return (3.0 if n.get("myOligarchs") else 0.0), True
    if s == "FlatModifier":
        return float(mod.get("flatModifier") or 0), True
    if s == "JointControlPointStat":
        # Comando dei consiglieri delle fazioni con punti qui: e' nei loro
        # attributi, che il gioco non ti mostra. Resta fuori, e la
        # probabilita' diventa un massimo.
        return 0.0, not n.get("defendedByOthers")
    if s == "NationCohesion":
        return n["cohesion"], True
    if s == "HappyElites":
        return ((fund - corr) * 10 if corr < fund else 0.0), True
    if s == "NationDemocracy":
        return n["democracy"], True
    if s == "TargetNationGDP":
        return n["difficulty"] * 1.0, True    # TIMissionModifier_TargetNationGDP_Multiplier = 1
    if s == "numDefendedControlPoints":
        return float(n.get("defendedCP", 0)), True
    # contro una nazione: niente fazione bersaglio (oligarchi in difesa,
    # ideologia del difensore) e attaccante umano (feromoni)
    return 0.0, True


def _label(key, lang):
    if key == "CouncilorAttackStat":
        return t("factor.councilor", lang)
    if key in NATION_FACTORS:
        return t(NATION_FACTORS[key][2], lang)
    return _opaque_label(key, lang)


def game_chance(name, n, councilor_value, lang="ita"):
    """Probabilita' del gioco per la missione `name` contro la nazione `n`, o
    None se la missione usa modificatori che non sappiamo calcolare."""
    att, dfn = _modifiers(name)
    t_ = gamedata.templates()["missions"].get(name) or {}
    if (t_.get("resolutionMethod") or {}).get("$type") != "TIMissionResolution_Contested":
        return None
    if any(_short(m) not in _KNOWN for m in att + dfn):
        return None
    parts, a_sum, d_sum, exact = [], 0.0, 0.0, True
    for mods, side in ((att, "attacco"), (dfn, "difesa")):
        for m in mods:
            v, known = _mod_value(m, n, councilor_value)
            exact &= known
            if side == "attacco":
                a_sum += v
            else:
                d_sum += v
            if abs(v) > 0.005 or not known:
                parts.append({"side": side, "key": _short(m), "label": _label(_short(m), lang),
                              "value": round(v, 2), "known": known})
    d = a_sum - d_sum
    p = 0.5 * 0.775 ** abs(d)
    chance = 1 - p if d >= 0 else p
    return {"attack": round(a_sum, 2), "defense": round(d_sum, 2), "d": round(d, 2),
            "chance": chance, "exact": exact, "parts": parts}


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
            "game": game_chance(name, r, my_attr, lang),
        })
    # con la formula del gioco si ordina per probabilita'; senza, euristica
    if all(o["game"] for o in out):
        out.sort(key=lambda x: (-x["game"]["chance"], -x["gdp"]))
    else:
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


# ------------------------------------------------ bersaglio: punto di controllo
# Repressione, Epurazione e simili colpiscono un punto di controllo di un'altra
# fazione (`TIMissionTarget_OwnedControlPoint`), non una nazione. Condizioni
# (IL): il proprietario non e' alieno (`HumanControlPoint`); l'Esecutivo di una
# nazione con piu' punti si attacca solo se ci hai gia' un punto
# (`TIControlPoint.CanBeAttacked`). Modificatori leggibili (GetModifier):
#   AttackerPopulationIdeology  (10 + democrazia) x sostegno a noi
#   DefenderPopulationIdeology  (10 + democrazia) x sostegno al proprietario
#   SecurityApparatus           +3 se il Sistema di sicurezza della nazione e' nostro
#   DefendedAsset               +10 in difesa se il punto e' difeso
#   TargetNationGDP             difficolta' economica della nazione
# Restano fuori, e rendono la probabilita' una stima: l'Amministrazione del
# consiglio avversario (`OwnedControlPoint`, attributi che il gioco non ti
# mostra) e il bonus se il difensore sfora il tetto dei punti
# (`InsufficientCPMaintenance_Defender`). Sui numeri della partita del
# 01/11/2026 la stima sta entro 1-2 punti dal gioco sulla maggior parte dei
# bersagli.

CP_TARGET = "TIMissionTarget_OwnedControlPoint"
DEFENDED_ASSET = 10.0          # TIGlobalConfig.TIMissionModifier_DefendedAsset
SECURITY_APPARATUS = 3.0       # TIMissionModifier_SecurityApparatus


def _ideology(f):
    return (f.get("templateName") or "").replace("Council", "")


def _cp_mod(s, ctx):
    """(valore, noto?) di un modificatore contro un punto di controllo."""
    n, cp = ctx["nation"], ctx["cp"]
    if s == "CouncilorAttackStat":
        return (ctx["councilor"] or 0), ctx["councilor"] is not None
    if s == "AttackerPopulationIdeology":
        return (10 + n["democracy"]) * ctx["mySupport"], True
    if s == "DefenderPopulationIdeology":
        return (10 + n["democracy"]) * ctx["ownerSupport"], True
    if s == "SecurityApparatus":
        return (SECURITY_APPARATUS if ctx["mySecurity"] else 0.0), True
    if s == "DefendedAsset":
        return (DEFENDED_ASSET if cp.get("defended") else 0.0), True
    if s == "TargetNationGDP":
        return n["difficulty"] * 1.0, True
    if s in ("ResourceSpent", "PherocyteResistance"):
        return 0.0, True
    return 0.0, False


def targets_control_points(g, snap, name, councilor=None):
    """Punti di controllo delle altre fazioni attaccabili da questa missione,
    con la probabilita' stimata (vedi sopra cosa resta fuori)."""
    from .factions import _goal_pairs, relation
    from .names import Namer, nation_id
    lang = gamedata_lang(snap)
    t_ = gamedata.templates()["missions"].get(name) or {}
    att, dfn = _modifiers(name)
    attr = gamedata.mission_attribute(name)
    my_attr = (councilor or {}).get("attributes", {}).get(attr) if attr else None
    nm = Namer(g, lang)
    my_id = g.me["ID"]["value"]
    my_key = _ideology(g.me)
    rows_by_id = {r["id"]: r for r in snap["nations"]}
    goals = _goal_pairs(g)
    rel_cache = {}

    out = []
    for cp in g.cps.values():
        fid = (cp.get("faction") or {}).get("value")
        owner = g.factions.get(fid)
        if not owner or fid == my_id or (gamedata.templates()["factions"].get(
                owner.get("templateName")) or {}).get("isAlien"):
            continue
        nat = g.nations.get((cp.get("nation") or {}).get("value"))
        row = rows_by_id.get(nation_id(nat)) if nat else None
        if not row:
            continue
        here = [g.cps.get(c["value"]) for c in nat.get("controlPoints") or []]
        mine_here = [c for c in here if c and (c.get("faction") or {}).get("value") == my_id]
        if (cp.get("controlPointType") == "Executive" and len(here) > 1
                and not mine_here):
            continue                                  # CanBeAttacked
        op = nat.get("publicOpinion") or {}
        ctx = {"nation": row, "cp": cp, "councilor": my_attr,
               "mySupport": op.get(my_key, 0) or 0,
               "ownerSupport": op.get(_ideology(owner), 0) or 0,
               "mySecurity": any(c.get("controlPointType") == "SecurityApparatus"
                                 and not c.get("benefitsDisabled") for c in mine_here)}
        parts, a_sum, d_sum, exact = [], 0.0, 0.0, True
        for mods, side in ((att, "attacco"), (dfn, "difesa")):
            for m in mods:
                v, known = _cp_mod(_short(m), ctx)
                exact &= known
                if side == "attacco":
                    a_sum += v
                else:
                    d_sum += v
                if abs(v) > 0.005 or not known:
                    parts.append({"side": side, "key": _short(m), "label": _label(_short(m), lang),
                                  "value": round(v, 2), "known": known})
        d = a_sum - d_sum
        p = 0.5 * 0.775 ** abs(d)
        if fid not in rel_cache:
            rel_cache[fid] = relation(g, owner, lang, goals)
        out.append({
            "id": cp["ID"]["value"],
            "nationId": row["id"], "nation": row["name"], "eu": row["eu"],
            "cpType": cp.get("controlPointType"),
            "cpName": nm.control_point(cp),
            "owner": {"id": fid, "name": nm.faction(owner) or "?",
                      "colors": gamedata.faction_colors(owner.get("templateName")),
                      "relation": rel_cache[fid]},
            "defended": bool(cp.get("defended")),
            "disabled": bool(cp.get("benefitsDisabled")),
            "myCP": len(mine_here), "cp": row["cp"],
            "gdp": row["gdp"], "democracy": row["democracy"], "difficulty": row["difficulty"],
            "mySupport": ctx["mySupport"], "ownerSupport": ctx["ownerSupport"],
            "mySecurity": ctx["mySecurity"],
            "game": {"attack": round(a_sum, 2), "defense": round(d_sum, 2), "d": round(d, 2),
                     "chance": 1 - p if d >= 0 else p, "exact": exact, "approx": not exact,
                     "parts": parts},
        })
    out.sort(key=lambda x: (-x["game"]["chance"], -x["gdp"]))
    return {
        "mission": name, "targetKind": "controlPoint",
        "missionName": gamedata.mission_name(lang, name),
        "attribute": attr, "attributeShort": council.attr_short(attr, lang),
        "councilorValue": my_attr, "factors": factors(name, lang),
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
            "supportsTargeting": (t.get("target") or {}).get("$type") in (NATION_TARGET, CP_TARGET),
            "holders": m["holders"],
            "best": m["best"],
            "xp": t.get("XPonSuccess") or 0,
        })
    out.sort(key=lambda x: x["name"])
    return out


def plan(snap, name, councilor_name=None, g=None):
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
    t_ = gamedata.templates()["missions"].get(name) or {}
    if g is not None and (t_.get("target") or {}).get("$type") == CP_TARGET:
        res = targets_control_points(g, snap, name, c)
    else:
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
