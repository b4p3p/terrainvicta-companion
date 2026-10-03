"""YASS (Yet Another Spreadsheet Simulator): i dati di partenza dei calcolatori
di nazione. I conti li fa l'interfaccia, perche' rispondano a ogni cella
cambiata; qui ci sono i valori del salvataggio e le costanti del gioco.

Formule lette dall'IL di Assembly-CSharp.dll (TINationState):

- `knowledgePriorityCohesionChange` = priorityEffectPopScaling x 0,01, verso 5
  (+ sotto, - sopra, 0 a 5 esatto). `priorityEffectPopScaling` =
  (popolazione / 50 mln) ^ `populationBasedIPEffectScaling` (-0,35); il
  salvataggio ha il valore del gioco.
- Una Conoscenza costa `priority_KNO` IP (1), diviso `nationalIPMultiplier`
  se la partita ha personalizzazioni (`TIGlobalConfig.GetRequiredInvestmentPoints`).
- `ControlPointWeightsTotalToPriorityIP`: gli IP del mese si dividono in parti
  uguali fra i punti di controllo (`GetInvestmentFromControlPoint`), poi
  secondo i pallini: IP / punti x pallini sulla priorita' / pallini del punto,
  x (1 + bonus); un punto coi benefici sospesi non prende bonus positivi
  (`ControlPointPriorityBonuses`). Contiamo solo i punti della fazione del
  giocatore: le priorita' altrui restano fuori.
- Bonus della fazione alla Conoscenza (`TIFactionState.SumPriorityBonuses`):
  `knowledgeBonus` delle org dei consiglieri + `priorityBonuses` dei loro
  tratti + laboratori degli habitat in orbita bassa + effetti `KnowledgePriority`.
  Gli habitat non li calcoliamo: se ce ne sono, `leoMissing` lo dice.
- Bonus di diversita' del punto (`TIControlPoint`, `priorityDiversityBonus`):
  per ogni altra priorita' con pallini, il suo valore (Economia 0,5, le altre
  0,2) x i suoi pallini / i pallini del punto; zero se il punto ha una sola
  priorita' con pallini. La Conoscenza non ha bonus nazionali.
- `GetMonthlyCohesionMovement`: verso `cohesionRestState`, in salita al piu'
  `maxMonthlyCohesionIncrease_normal` (0,1), in discesa al piu'
  clamp((max(0, disuguaglianza - 3))^2 / 10, 0,1, 0,25).
- `unrestRestState` = 10,5 - coesione - PIL pro capite / PCGDPToReduceUnrestBy1
  + esercito + xenoformazione + rivendicazioni ostili.
- `hostileClaimsImpactOnUnrest` = quota di popolazione nelle regioni ostili x
  `maxCombinedImpactFromHostileClaims` (16) x (1 - democrazia / 10). Una
  regione e' ostile se sta in `hostileClaims` della sua nazione.
- `ClaimWillBeHostile` (l'anteprima di annessione del gioco): la regione
  annessa e' ostile se la nazione annessa ha democrazia >
  annettente + `democracyDecreaseToMakeHostileClaim` (1,5), se l'annettente non
  la rivendica, o se la rivendica in modo ostile.

Le nazioni, le rivendicazioni e le statistiche sono quelle della schermata
nazione: niente di nascosto.
"""

from . import gamedata
from .model import CP_COST_DIVISOR, CP_COST_SCALING   # (PIL / K) ^ 0,6 / 2 per nazione
from .names import Namer

# costanti della DLL: in TIGlobalConfig.json non ci sono, valgono i default
POP_SCALING_BASE = 50_000_000       # TINationState.UpdatePriorityEffectPopScaling
POP_SCALING_EXP = -0.35             # TIGlobalConfig.populationBasedIPEffectScaling
KNOWLEDGE_COHESION_STEP = 0.01      # TINationState.knowledgePriorityCohesionChange
COHESION_TARGET = 5.0
MAX_COHESION_INCREASE = 0.1         # TIGlobalConfig.maxMonthlyCohesionIncrease_normal
MAX_COHESION_DECREASE = 0.1         # TIGlobalConfig.maxMonthlyCohesionDecrease_normal
MAX_COHESION_DECREASE_CAP = 0.25    # TIGlobalConfig.maxMonthlyCohesionDecrease_cap
UNREST_BASE = 10.5                  # TINationState.unrestRestState
HOSTILE_CLAIMS_MAX = 16.0           # TIGlobalConfig.maxCombinedImpactFromHostileClaims
HOSTILE_DEMOCRACY_GAP = 1.5         # TIGlobalConfig.democracyDecreaseToMakeHostileClaim
KNOWLEDGE_IP = 1.0                  # TIGlobalConfig.priority_KNO (anche nel template)
# TINationState.OnGovernmentPriorityComplete / OnUnityPriorityComplete: ogni
# completamento di Governo o Unita' con regioni ostili fa +1; a 200 l'ostilita'
# di una regione sparisce (GetNextLegitimizeClaimRegion: prima le confinanti con
# regioni proprie non ostili, poi le piu' popolose)
PRIORITIES_FOR_LEGITIMIZE = 200     # TIGlobalConfig.numPrioritiesForLegitimize
# Effetti di un completamento (TINationState, proprieta' *PriorityXxxChange);
# TIGlobalConfig.json non li ridefinisce: valgono i default della DLL
EFFECTS = {
    "ecoPcBase": 3.0,            # economyPriorityPerCapitaIncomeChange_base
    "ecoPcPerResource": 1.5,     # economyPriorityPerCapitaIncomeChange_perResourceRegion
    "ecoPcPerCore": 1.5,         # economyPriorityPerCapitaIncomeChange_perCoreEcoRegion
    "ecoIneq": 0.00015,          # economyPriorityInequalityIncrease
    "ecoIneqPerResource": 0.0001,  # economyPriorityInequalityIncrease_perResourceRegion
    "welIneq": -0.005,           # welfarePriorityInequalityChange
    "knoEdu": 0.005,             # knowledgePriorityEducationIncrease
    "govDem": 0.01,              # governmentPriorityDemocracyIncrease
    "uniCoh": 0.1,               # unityBaseCohesionChange
    "uniCohMin": 0.025,          # unityMinCohesionChange
    "uniEdu": -0.001,            # unityPriorityEducationChange
}
# Crescita (TINationState.ModifyGDP, SetBaseInvestmentPoints_month;
# TIRegionState.get_maxMissionControl, NationalGDPProportion): gli IP seguono
# il PIL, il tetto del Controllo missioni il PIL di ogni regione
IP_GDP_EXP = 0.35                   # TIGlobalConfig.controlPointIPScaling (x controlPointIPFactor 1)
UNREST_IP_FREE = 2.0                # investmentPoints_unrestPenalty_frac = max(0, disordini - 2) / 10
UNREST_IP_STEP = 10.0
MC_DIV = 300.0                      # tetto MC di una regione: 1 + PIL regionale (mld) /
MC_DIV_PER_EDU = 6.0                #   max(200, 300 - 6 x istruzione)
MC_DIV_MIN = 200.0
GDP_WEIGHT_CORE = 1.25              # TIGlobalConfig.coreEcoRegionGDPModifier
GDP_WEIGHT_RESOURCE = 1.25          # TIGlobalConfig.coreResourceRegionGDPModifier (miniere e petrolio)
GDP_WEIGHT_COLONY = 0.5             # TIGlobalConfig.colonyRegionGDPModifier


def gdp_weight(r):
    """Peso della regione nella divisione del PIL nazionale (NationalGDPProportion)."""
    w = r.get("populationInMillions") or 0
    if r.get("coreEconomicRegion"):
        w *= GDP_WEIGHT_CORE
    if r.get("resourceRegion") or r.get("oilRegion"):
        w *= GDP_WEIGHT_RESOURCE
    if r.get("colonyRegion"):
        w *= GDP_WEIGHT_COLONY
    return w


def base_ip(gdp, unrest):
    """IP del mese senza consiglieri ne' eserciti: (PIL / 1 mld)^0,35, meno la
    penalita' dei disordini."""
    pen = max(0.0, unrest - UNREST_IP_FREE) / UNREST_IP_STEP
    return (gdp / 1e9) ** IP_GDP_EXP * max(0.0, 1 - pen) if gdp > 0 else 0.0


def mc_cap(gdp, weights, missions, education):
    """Tetto del Controllo missioni della nazione: somma dei tetti delle regioni."""
    total = sum(weights)
    div = max(MC_DIV_MIN, MC_DIV - MC_DIV_PER_EDU * education)
    return sum(max(m, 1 + int(gdp / 1e9 * w / total / div)) if total else m
               for w, m in zip(weights, missions))


# costo in IP di un completamento: TIGlobalConfig.priority_*. Valori del
# template del gioco (Armi nucleari 40; la DLL ha 25), cosi' la versione nel
# browser, che non ha i file del gioco, da' gli stessi numeri dell'API locale
PRIORITY_COST_DEFAULT = {
    "Economy": ("ECO", 1), "Welfare": ("WEL", 1), "Environment": ("ENV", 1), "Knowledge": ("KNO", 1),
    "Government": ("DEM", 1), "Unity": ("UNI", 2), "Military": ("MIL", 1), "Oppression": ("OPP", 1),
    "Spoils": ("SPO", 1), "Funding": ("DEV", 1), "LaunchFacilities": ("BOO", 2), "MissionControl": ("MC", 25),
    "Civilian_InitiateSpaceflightProgram": ("FLI", 50), "Military_FoundMilitary": ("FMI", 40),
    "Military_BuildArmy": ("ARM", 60), "Military_BuildNavy": ("NAV", 100),
    "Military_InitiateNuclearProgram": ("NUC", 80), "Military_BuildNuclearWeapons": ("NUK", 40),
    "Military_BuildSpaceDefenses": ("DEF", 50), "Military_BuildSTOSquadron": ("STO", 10),
}


def priority_costs(ip_mult=1.0):
    """Costo di ogni priorita', coi valori del template dove ci sono. Il file ha
    commenti, quindi niente json.load: si leggono le sole righe priority_*."""
    import os, re
    from . import paths
    text = ""
    tdir = paths.template_dir()
    if tdir:                        # nel browser i file del gioco non ci sono
        try:
            with open(os.path.join(tdir, "TIGlobalConfig.json"), encoding="utf-8-sig") as f:
                text = f.read()
        except OSError:
            pass
    found = {m.group(1): float(m.group(2)) for m in re.finditer(r'"priority_([A-Z]+)"\s*:\s*([0-9.]+)', text)}
    return {k: found.get(code, default) / ip_mult for k, (code, default) in PRIORITY_COST_DEFAULT.items()}


# TIControlPoint.priorityDiversityBonus
DIVERSITY_BONUS = {"Economy": 0.5, "Welfare": 0.2, "Environment": 0.2, "Knowledge": 0.2,
                   "Government": 0.2, "Unity": 0.2, "Military": 0.2}


def _ids(refs):
    return [r["value"] for r in refs or [] if r and "value" in r]


# ---------------------------------------------------------------- priorita'
# Il pannello Priorita' di una nazione, come lo disegna il gioco.

FEDERATION_ECO_BONUS = 0.01         # TIGlobalConfig.federationGDPEconomyBonus
CORE_MINERAL_MILITARY = 0.05        # TIGlobalConfig.coreMineralBuildMilitaryModifier

# priorita' -> campo di TIOrgState che la potenzia (TIFactionState.SumPriorityBonuses)
ORG_FIELD = {
    "Economy": "economyBonus", "Welfare": "welfareBonus", "Environment": "environmentBonus",
    "Knowledge": "knowledgeBonus", "Government": "governmentBonus", "Unity": "unityBonus",
    "Oppression": "oppressionBonus", "Spoils": "spoilsBonus", "Funding": "spaceDevBonus",
    "Civilian_InitiateSpaceflightProgram": "spaceflightBonus", "LaunchFacilities": "spaceflightBonus",
    "Military_BuildSTOSquadron": "spaceflightBonus", "MissionControl": "MCBonus",
    "Military_FoundMilitary": "militaryBonus", "Military": "militaryBonus",
    "Military_BuildArmy": "militaryBonus", "Military_BuildNavy": "militaryBonus",
    "Military_BuildSpaceDefenses": "militaryBonus",
}
# priorita' -> contesto degli effetti della fazione
EFFECT_CONTEXT = {
    "Economy": "EconomyPriority", "Welfare": "WelfarePriority", "Knowledge": "KnowledgePriority",
    "Unity": "UnityPriority", "Military": "MilitaryPriority", "Spoils": "SpoilsPriority",
    "Funding": "SpaceDevPriority", "Civilian_InitiateSpaceflightProgram": "SpaceflightPriority",
    "LaunchFacilities": "LaunchFacilitiesPriority", "MissionControl": "MissionControlPriority",
    "Military_BuildArmy": "BuildArmyPriority", "Military_BuildNavy": "UpgradeArmyPriority",
    "Military_InitiateNuclearProgram": "BuildNuclearWeaponsPriority",
    "Military_BuildNuclearWeapons": "BuildNuclearWeaponsPriority",
    "Military_BuildSpaceDefenses": "BuildSpaceDefensesPriority",
    "Oppression": "OppressionPriority", "Government": "GovernmentPriority",
    "Environment": "EnvironmentPriority",
}


def faction_priority_bonuses(g):
    """{priorita': (bonus, voci)} della fazione del giocatore: org e tratti dei
    consiglieri, effetti. Come TIFactionState.SumPriorityBonuses, senza gli
    habitat in orbita bassa."""
    tpl = gamedata.templates()
    fx = next(iter(g.state("TIEffectsState").values()), {})
    my_id = (g.me.get("ID") or {}).get("value")
    mine = next((e.get("Value") or {} for e in fx.get("factionEffectsNames") or []
                 if (e.get("Key") or {}).get("value") == my_id), {})
    out = {}
    for kind, _ in gamedata.PRIORITIES.values():
        parts = []
        field = ORG_FIELD.get(kind)
        for c in g.my_councilors():
            who = c.get("displayName")
            for ref in c.get("orgs") or []:
                o = g.orgs.get(ref["value"]) or {}
                if field and o.get(field):
                    parts.append({"source": "org", "name": o.get("displayName"), "who": who, "bonus": o[field]})
            for tn in c.get("traitTemplateNames") or []:
                for pb in (tpl["traits"].get(tn) or {}).get("priorityBonuses") or []:
                    if pb.get("priority") == kind and pb.get("bonus"):
                        parts.append({"source": "trait", "name": tn, "who": who, "bonus": pb["bonus"]})
        for name in mine.get(EFFECT_CONTEXT.get(kind, "")) or []:
            et = tpl["effects"].get(name) or {}
            if et.get("value") and et.get("operation", "Additive") == "Additive":
                parts.append({"source": "effect", "name": name, "who": None, "bonus": et["value"]})
        out[kind] = (sum(x["bonus"] for x in parts), parts)
    return out


def valid_priorities(n):
    """{priorita': (valida, certa)} con le regole di TINationState.ValidPriority.
    Dove il salvataggio non ha il dato (tetto dei finanziamenti, posti di
    controllo missioni, eserciti costruibili…) si suppone valida: `certa` False."""
    mil = bool(n.get("military"))
    space = bool(n.get("spaceFlightProgram"))
    nuke = bool(n.get("nuclearProgram"))
    no_nukes = bool(n.get("policy_noNukes"))
    sust = n.get("sustainability") or 0
    return {
        "Economy": (True, True), "Welfare": (True, True), "Knowledge": (True, True),
        "Unity": (True, True), "Spoils": (True, True),
        "Government": ((n.get("democracy") or 0) < 10 or bool(n.get("canAccumulateLegitimizeClaimTriggers")), True),
        "Environment": (True, sust <= 0 or bool(n.get("canAccumulateDecontaminateTriggers"))),
        "Oppression": (mil, True),
        "Funding": (True, False),
        "Civilian_InitiateSpaceflightProgram": (not space, True),
        "LaunchFacilities": (space, space),
        "MissionControl": (space, False),
        "Military_FoundMilitary": (not mil, True),
        "Military": (mil and (n.get("militaryTechLevel") or 0) < (n.get("maxMilitaryTechLevel") or 0), True),
        "Military_BuildArmy": (mil, False),
        "Military_BuildNavy": (False, False),
        "Military_InitiateNuclearProgram": (mil and not nuke and not no_nukes, True),
        "Military_BuildNuclearWeapons": (nuke and not no_nukes, True),
        "Military_BuildSpaceDefenses": (mil and bool(n.get("canBuildSpaceDefenses")), False),
        "Military_BuildSTOSquadron": (mil and bool(n.get("canBuildSTOSquadrons")), False),
    }


def _fit_validity(valid, cps):
    """Le priorita' incerte con pallini: valide o no secondo il totale dei
    pallini che il gioco ha scritto per ogni punto (conta solo le valide)."""
    for cp in cps:
        # solo quelle ancora incerte: un punto gia' visto le ha decise
        unsure = [k for k, (ok, sure) in valid.items() if not sure]
        prio, total = cp["priorities"], cp["total"]
        sure_sum = sum(prio.get(k) or 0 for k, (ok, s) in valid.items() if s and ok)
        cand = [k for k in unsure if prio.get(k)]
        target = total - sure_sum
        # al piu' qualche voce: si provano tutte le combinazioni
        for mask in range(1 << len(cand)):
            pick = [cand[i] for i in range(len(cand)) if mask >> i & 1]
            if sum(prio[k] for k in pick) == target:
                for k in cand:
                    valid[k] = (k in pick, True)
                break
    return valid


def priority_panel(g, n, lang, fbonus):
    """Righe del pannello Priorita' di una nazione e i miei punti di controllo."""
    cps = []
    for i, ref in enumerate(n.get("controlPoints") or []):
        cp = g.cps.get(ref["value"]) or {}
        if g.factions.get((cp.get("faction") or {}).get("value")) is not g.me:
            continue
        cps.append({"index": i, "priorities": {k: v for k, v in (cp.get("controlPointPriorities") or {}).items()},
                    "total": cp.get("totalWeightsForControlPoint") or 0,
                    "disabled": bool(cp.get("benefitsDisabled"))})
    valid = _fit_validity(valid_priorities(n), cps)
    national = {"Economy": (n.get("restofFederationECOBonus_dailyCache") or 0) * FEDERATION_ECO_BONUS,
                "Military_BuildArmy": (n.get("numMiningRegions_dailyCache") or 0) * CORE_MINERAL_MILITARY,
                "Military_BuildNavy": (n.get("numMiningRegions_dailyCache") or 0) * CORE_MINERAL_MILITARY}
    rows = []
    for key, (kind, icon) in gamedata.PRIORITIES.items():
        ok, sure = valid.get(kind, (False, True))
        if not ok:
            continue
        b, parts = fbonus.get(kind, (0.0, []))
        rows.append({"id": kind, "name": gamedata.priority_name(lang, key), "icon": icon,
                     "certain": sure, "factionBonus": b, "parts": parts,
                     "nationalBonus": national.get(kind, 0.0)})
    return rows, cps


def faction_knowledge_bonus(g):
    """Bonus della fazione alla priorita' Conoscenza, con le voci."""
    tpl = gamedata.templates()
    parts = []
    for c in g.my_councilors():
        name = c.get("displayName")
        for ref in c.get("orgs") or []:
            o = g.orgs.get(ref["value"]) or {}
            if o.get("knowledgeBonus"):
                parts.append({"source": "org", "name": o.get("displayName"), "who": name,
                              "bonus": o["knowledgeBonus"]})
        for tn in c.get("traitTemplateNames") or []:
            for pb in (tpl["traits"].get(tn) or {}).get("priorityBonuses") or []:
                if pb.get("priority") == "Knowledge" and pb.get("bonus"):
                    parts.append({"source": "trait", "name": tn, "who": name, "bonus": pb["bonus"]})
    fx = next(iter(g.state("TIEffectsState").values()), {})
    my_id = (g.me.get("ID") or {}).get("value")
    mine = next((e.get("Value") or {} for e in fx.get("factionEffectsNames") or []
                 if (e.get("Key") or {}).get("value") == my_id), {})
    for name in mine.get("KnowledgePriority") or []:
        v = (tpl["effects"].get(name) or {}).get("value") or 0
        if v:
            parts.append({"source": "effect", "name": name, "who": None, "bonus": v})
    return sum(p["bonus"] for p in parts), parts


def diversity_bonus(priorities, total, priority="Knowledge"):
    """Bonus di diversita' di un punto di controllo per una priorita'."""
    if not total or sum(1 for v in priorities.values() if v) <= 1:
        return 0.0
    return sum(b * (priorities.get(k) or 0) / total
               for k, b in DIVERSITY_BONUS.items() if k != priority)


def overview(g, lang="ita"):
    nm = Namer(g, lang)
    gv = next(iter(g.state("TIGlobalValuesState").values()), {})
    cust = gv.get("scenarioCustomizations") or {}
    ip_mult = (cust.get("nationalIPMultiplier") or 1.0) if cust.get("usingCustomizations") else 1.0
    regions = g.state("TIRegionState")
    mine = {(g.ref(cp, "nation", g.nations) or {}).get("ID", {}).get("value")
            for cp in g.my_control_points()}
    fbonus, fparts = faction_knowledge_bonus(g)
    # residuo tipico della coesione di riposo, per le nazioni in cui non si ricava
    resids = sorted(r for r in (cohesion_terms(g, x)[1] for x in g.nations.values()
                                if x.get("displayName") and x.get("regions")) if r is not None)
    resid_med = resids[len(resids) // 2] if resids else 0.0
    pbonus = faction_priority_bonuses(g)
    # i miei punti di controllo, nazione per nazione: quota dei pallini sulla
    # Conoscenza e bonus totale del punto
    my_cps = {}
    for cp in g.my_control_points():
        nid = ((cp.get("nation") or {}).get("value"))
        total = cp.get("totalWeightsForControlPoint") or 0
        prio = cp.get("controlPointPriorities") or {}
        if nid is None or not total:
            continue
        bonus = fbonus + diversity_bonus(prio, total)
        if cp.get("benefitsDisabled") and bonus > 0:
            bonus = 0.0
        my_cps.setdefault(nid, []).append({
            "pips": prio.get("Knowledge") or 0,
            "total": total,
            "share": (prio.get("Knowledge") or 0) / total,
            "bonus": bonus,
            "diversity": diversity_bonus(prio, total),
            "disabled": bool(cp.get("benefitsDisabled")),
        })

    out = []
    for nid, n in g.nations.items():
        if not n.get("displayName") or not n.get("exists", True) or n.get("archived"):
            continue
        regs = [(rid, regions.get(rid) or {}) for rid in _ids(n.get("regions"))]
        pop_m = sum(r.get("populationInMillions") or 0 for _, r in regs)
        # i separatisti non ancora nati hanno regioni ma niente popolazione
        if pop_m <= 0 or n.get("alienNation"):
            continue
        hostile = set(_ids(n.get("hostileClaims")))
        prows, pcps = priority_panel(g, n, lang, pbonus)
        out.append({
            "id": nid,
            "name": nm.nation(n),
            "mine": nid in mine,
            "population": round(pop_m, 3),          # milioni
            "gdp": n.get("GDP") or 0,
            "cohesion": n.get("cohesion") or 0,
            "cohesionRest": n.get("cohesionRestState_dailyCache") or 0,
            "unrest": n.get("unrest") or 0,
            "unrestRest": n.get("unrestRestState_dailyCache") or 0,
            "democracy": n.get("democracy") or 0,
            "inequality": n.get("inequality") or 0,
            "education": n.get("education") or 0,
            "popScaling": n.get("priorityEffectPopScaling") or 0,
            "coreEcoRegions": n.get("numCoreEconomicRegions_dailyCache") or 0,
            "legitimizeProgress": n.get("accumulatedLegitimizeClaimTriggers") or 0,
            "resourceRegions": (n.get("numMiningRegions_dailyCache") or 0) + (n.get("numOilRegions_dailyCache") or 0),
            "ip": n.get("baseInvestmentPoints_month") or 0,
            # quello che negli IP non viene dal PIL: eserciti (meno) e consiglieri (piu')
            "ipOther": (n.get("baseInvestmentPoints_month") or 0) - base_ip(n.get("GDP") or 0, n.get("unrest") or 0),
            "controlPoints": len(n.get("controlPoints") or []),
            "myControlPoints": my_cps.get(nid, []),
            "priorities": prows,
            "restModel": rest_model(g, n, resid_med),
            "panelCPs": pcps,
            "regions": [{"id": rid, "name": nm.region(r), "population": r.get("populationInMillions") or 0,
                         "hostile": rid in hostile, "gdpWeight": gdp_weight(r),
                         "missionControl": r.get("missionControl") or 0} for rid, r in regs],
            "claims": _ids(n.get("claims")),
            "hostileClaims": sorted(hostile),
        })
    out.sort(key=lambda x: (not x["mine"], x["name"] or ""))
    return {
        "nations": out,
        "faction": g.me.get("templateName"),
        "campaign": g.campaign_key(),
        "knowledgeBonus": {"total": fbonus, "parts": fparts,
                           "leoMissing": bool(g.me.get("habs"))},
        "constants": {
            "popScalingBase": POP_SCALING_BASE / 1e6,     # in milioni, come population
            "popScalingExp": POP_SCALING_EXP,
            "knowledgeStep": KNOWLEDGE_COHESION_STEP,
            "cohesionTarget": COHESION_TARGET,
            "maxIncrease": MAX_COHESION_INCREASE,
            "maxDecrease": MAX_COHESION_DECREASE,
            "maxDecreaseCap": MAX_COHESION_DECREASE_CAP,
            "unrestBase": UNREST_BASE,
            "hostileMax": HOSTILE_CLAIMS_MAX,
            "hostileDemocracyGap": HOSTILE_DEMOCRACY_GAP,
            "knowledgeIP": KNOWLEDGE_IP / ip_mult,
            "diversity": DIVERSITY_BONUS,
            "effects": EFFECTS,
            "legitimize": PRIORITIES_FOR_LEGITIMIZE,
            "ineqCohesionMult": INEQ_COHESION_MULT,
            "severeInequality": SEVERE_INEQUALITY,
            "priorityCost": priority_costs(ip_mult),
            "pcgdpPerUnrest": gv.get("fixedPCGDPToReduceUnrestBy1") or 0,
            "ipGdpExp": IP_GDP_EXP,
            "unrestIPFree": UNREST_IP_FREE,
            "unrestIPStep": UNREST_IP_STEP,
            "mcDiv": MC_DIV,
            "mcDivPerEdu": MC_DIV_PER_EDU,
            "mcDivMin": MC_DIV_MIN,
            "cpGdpScale": gv.get("fixedPCGDPToRaiseBaseCPMaintenanceCostBy1") or 0,
            "cpCostScaling": CP_COST_SCALING,
            "cpCostDivisor": CP_COST_DIVISOR,
        },
    }


# ---------------------------------------------------------------- formule
# Le stesse dell'interfaccia (tiweb/lib/yass.ts): i test le confrontano coi
# valori che il gioco ha scritto nel salvataggio.

def pop_scaling(pop_m):
    return (pop_m / (POP_SCALING_BASE / 1e6)) ** POP_SCALING_EXP if pop_m > 0 else 0.0


def knowledge_step(scaling, cohesion):
    s = 1 if cohesion < COHESION_TARGET else -1 if cohesion > COHESION_TARGET else 0
    return s * scaling * KNOWLEDGE_COHESION_STEP


def monthly_movement(cohesion, rest, inequality):
    if cohesion < rest:
        return min(MAX_COHESION_INCREASE, rest - cohesion)
    if cohesion > rest:
        cap = min(MAX_COHESION_DECREASE_CAP, max(MAX_COHESION_DECREASE, max(0.0, inequality - 3) ** 2 / 10))
        return -min(cap, cohesion - rest)
    return 0.0


def hostile_unrest(hostile_share, democracy):
    return hostile_share * HOSTILE_CLAIMS_MAX * (1 - democracy / 10)


def check(save_path=None):
    """Confronta le formule coi valori che il gioco ha scritto nel salvataggio:
    la scala per popolazione su tutte le nazioni, i disordini di riposo dove
    non c'e' esercito (l'unico termine che non ricostruiamo)."""
    from . import paths, save
    g = save.Game(save_path or paths.latest_save()[0])
    d = overview(g)
    k = d["constants"]
    bad = []
    unrest_ok = 0
    for n in d["nations"]:
        s = pop_scaling(n["population"])
        if abs(s - n["popScaling"]) > 1e-3 * max(1.0, n["popScaling"]):
            bad.append(f"scala {n['name']}: {s:.5f} invece di {n['popScaling']:.5f}")
        nat = g.nations.get(n["id"]) or {}
        if nat.get("military") or not 0 < n["unrestRest"] < 10:
            continue
        share = sum(r["population"] for r in n["regions"] if r["hostile"]) / n["population"]
        pc = n["gdp"] / (n["population"] * 1e6)
        calc = UNREST_BASE - n["cohesion"] - pc / k["pcgdpPerUnrest"] + hostile_unrest(share, n["democracy"])
        if abs(calc - n["unrestRest"]) > 0.01:
            bad.append(f"disordini {n['name']}: {calc:.3f} invece di {n['unrestRest']:.3f}")
        else:
            unrest_ok += 1
    # IP dal PIL: dove non ci sono eserciti il gioco scrive esattamente
    # (PIL / 1 mld)^0,35 meno i disordini (i consiglieri che consigliano sono rari)
    ip_ok = 0
    for n in d["nations"]:
        nat = g.nations.get(n["id"]) or {}
        if nat.get("armies"):
            continue
        if abs(n["ipOther"]) > 0.01:
            bad.append(f"IP {n['name']}: {n['ip']:.3f}, dal PIL {n['ip'] - n['ipOther']:.3f}")
        else:
            ip_ok += 1
    # tetto MC: la priorita' e' valida se una regione e' sotto il tetto; per i
    # miei punti il gioco lo dice coi pallini contati (_fit_validity)
    mc_ok = 0
    for n in d["nations"]:
        nat = g.nations.get(n["id"]) or {}
        mc = next((r for r in n["priorities"] if r["id"] == "MissionControl"), None)
        if not nat.get("spaceFlightProgram") or not any(cp["priorities"].get("MissionControl") for cp in n["panelCPs"]):
            continue
        regs = n["regions"]
        cap = mc_cap(n["gdp"], [r["gdpWeight"] for r in regs], [r["missionControl"] for r in regs], n["education"])
        have = sum(r["missionControl"] for r in regs)
        if (mc is not None) != (have < cap):
            bad.append(f"tetto MC {n['name']}: {have}/{cap}, il gioco la da' {'valida' if mc else 'non valida'}")
        else:
            mc_ok += 1
    return len(d["nations"]), unrest_ok, ip_ok, mc_ok, bad


# ---------------------------------------------------------------- coesione di riposo
# TINationState.cohesionRestState = clamp(16 + somma dei termini, poi la spinta
# della democrazia verso 5, fra 0 e 10). Calcoliamo i termini che si possono
# leggere dal salvataggio; distanza capitale-centro abitato, divario fra elite e
# popolo e dispersione dell'opinione pubblica restano un residuo, ricavato dal
# valore che il gioco ha scritto (`cohesionRestState_dailyCache`).

INEQ_COHESION_MULT = 2.25           # TIGlobalConfig.inequalityCohesionMultiplier
SEVERE_INEQUALITY = 4.75            # TIGlobalConfig.severeInequality
POP_COHESION_POWER = 0.2            # TIGlobalConfig.populationCohesionImpactPower
REST_BASE = 16.0                    # TINationState.cohesionRestState


def ineq_term(inequality, education):
    """inequalityImpactOnCohesion."""
    return min(1.0, 0.5 + education / 20) * (-inequality * INEQ_COHESION_MULT
                                             - (inequality - SEVERE_INEQUALITY if inequality > SEVERE_INEQUALITY else 0.0))


def democracy_terms(democracy, unrest):
    """autocracyImpactOnCohesion + anocracyImpactOnCohesion."""
    if democracy <= 3.5:
        return (3.5 ** 1.285 - max(0.0, democracy) ** 1.285) * ((10 - unrest) / 10)
    if democracy <= 6.5:
        return 2 * abs(5 - democracy) - 3
    return 0.0


def democracy_pull(value, democracy):
    """DemocracyImpactOnCohesion: sopra 6,5 di democrazia il valore va verso 5."""
    if democracy <= 6.5:
        return value
    d = abs(6.5 - democracy) / 2
    return min(5.0, value + d) if value <= 5 else max(5.0, value - d)


def rest_from_raw(raw, democracy):
    return min(10.0, max(0.0, democracy_pull(raw, democracy)))


def raw_from_rest(rest, democracy):
    """L'inverso della spinta e del taglio, quando e' unico: None se il gioco ha
    tagliato a 0 o 10, o se la democrazia ha portato il valore esattamente a 5."""
    if rest <= 1e-6 or rest >= 10 - 1e-6:
        return None
    if democracy <= 6.5:
        return rest
    d = abs(6.5 - democracy) / 2
    if abs(rest - 5) < 1e-6:
        return None
    return rest - d if rest < 5 else rest + d


def cohesion_terms(g, n):
    """Termini della coesione di riposo che il salvataggio permette di calcolare."""
    regions = g.state("TIRegionState")
    regs = [regions.get(r["value"]) or {} for r in n.get("regions") or []]
    pop_m = sum(r.get("populationInMillions") or 0 for r in regs)
    # TotalImpactFromHostileClaims: solo le regioni della nazione che stanno nelle
    # sue rivendicazioni ostili, non quelle che rivendica altrove
    hostile = {r["value"] for r in n.get("hostileClaims") or []}
    hostile_pop = sum((regions.get(r["value"]) or {}).get("populationInMillions") or 0
                      for r in n.get("regions") or [] if r["value"] in hostile)
    dem = n.get("democracy") or 0
    edu = n.get("education") or 0
    ineq = n.get("inequality") or 0
    unrest = n.get("unrest") or 0
    # recessione: PIL pro capite sotto il massimo degli ultimi 40 trimestri
    track = n.get("tracker_PCGDP_ByQuarter") or []
    pc = (n.get("GDP") or 0) / (pop_m * 1e6) if pop_m else 0
    if track:
        last = max(e["Key"] for e in track)
        peak = max(100.0, max(e["Value"] for e in track if e["Key"] >= last - 40))
    else:
        peak = pc
    pc_term = (1 - pc / peak) * -ineq if peak and pc / peak < 1 else 0.0
    # guerre e rivali (warsImpactOnCohesion, rivalsImpactOnCohesion)
    def nat(ref):
        return g.nations.get(ref["value"]) or {}
    wars = {r["value"]: nat(r) for r in n.get("wars") or []}
    wars_n = sum(1 for w in wars.values() if w.get("exists", True) and (dem < 6 or (w.get("democracy") or 0) < 6))
    wars_term = min(3.0, wars_n)
    ncp = n.get("numControlPoints") or 0
    rivals = [nat(r) for r in n.get("rivals") or []]
    rcount = sum(1 for x in rivals if (x.get("numControlPoints") or 0) >= ncp - 1
                 and (dem < 6 or (x.get("democracy") or 0) < 6))
    rivals_term = min(max(0.0, 3 - wars_term), 0.5 * rcount)
    terms = {
        "base": REST_BASE,
        "inequality": ineq_term(ineq, edu),
        "pcgdp": pc_term,
        "population": -(pop_m ** (POP_COHESION_POWER + (0.1 if len(regs) == 1 else 0.0))) if pop_m > 0 else 0.0,
        "hostile": -(hostile_pop / pop_m * HOSTILE_CLAIMS_MAX * dem / 10) if pop_m else 0.0,
        "wars": wars_term,
        "rivals": rivals_term,
        "government": democracy_terms(dem, unrest),
    }
    known = sum(terms.values())
    raw = raw_from_rest(n.get("cohesionRestState_dailyCache") or 0, dem)
    terms["_pcPeak"] = peak
    return terms, (None if raw is None else raw - known)


def rest_model(g, n, fallback):
    """Il modello della coesione di riposo per l'interfaccia: termini fermi
    (popolazione, guerre, rivali), residuo e picco del PIL pro capite.
    Quando il residuo non si ricava, `fallback` (la mediana delle altre
    nazioni) dentro i limiti compatibili col valore del gioco."""
    terms, res = cohesion_terms(g, n)
    peak = terms.pop("_pcPeak")
    known = sum(terms.values())
    estimated = res is None
    if estimated:
        rest = n.get("cohesionRestState_dailyCache") or 0
        dem = n.get("democracy") or 0
        lo, hi = -1e9, 1e9
        if rest <= 1e-6:
            hi = 0.0
        elif rest >= 10 - 1e-6:
            lo = 10.0
        elif dem > 6.5:
            d = abs(6.5 - dem) / 2
            lo, hi = 5 - d, 5 + d
        raw = min(hi, max(lo, known + fallback))
        res = raw - known
    return {"base": terms["base"], "population": terms["population"], "wars": terms["wars"],
            "rivals": terms["rivals"], "residual": res, "estimated": estimated, "pcPeak": peak}


if __name__ == "__main__":
    total, unrest_ok, ip_ok, mc_ok, bad = check()
    print(f"{total} nazioni, disordini verificati su {unrest_ok} senza esercito, "
          f"IP dal PIL su {ip_ok}, tetto MC su {mc_ok} coi miei pallini")
    print("\n".join(bad) if bad else "Nessuna differenza.")
    raise SystemExit(1 if bad else 0)
