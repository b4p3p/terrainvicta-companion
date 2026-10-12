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
  Laboratori (`SumLEOHabPriorityBonuses`): moduli attivi delle stazioni in
  orbita bassa con la regola della priorita' (`LEOBonusKnowledge`...), somma di
  `specialRulesValue`, al piu' `LEOHabModulePriorityBonusCap` (0,3).
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

- `SetBaseInvestmentPoints_month`: IP = economyScore x (1 + bonus Consiglia)
  x (1 - occupazione) x (1 - penalita' dei disordini) - eserciti.
  `GetAdvisingScore(Amministrazione)`: i consiglieri attivi che consigliano la
  nazione, dal piu' bravo, Amministrazione / 100 / posizione (il secondo vale
  la meta', il terzo un terzo). Contiamo solo i nostri: chi altro consiglia
  una nazione il gioco non lo dice.
- `OnEconomyPriorityComplete`: ogni Economia completata conta un passo verso
  una regione petrolifera (500), mineraria (750) o economica centrale (1200),
  in quest'ordine, se la nazione ne ha una candidata
  (`CacheRegionValues`). Petrolio e miniere: regioni col flag del template
  (`oilCapable`, `mineCapable`; il petrolio finche' c'e'); regione economica
  centrale: quota del PIL nazionale sopra 500 mld
  (`CandidateCoreEconomicRegions`). Il contatore e' della regione e il gioco
  lo mostra («Current progress: x/1200»). Fra le candidate va avanti quella
  col contatore piu' alto, poi la quota del PIL piu' alta. Una regione che
  diventa economica centrale smette di essere regione di risorse.
- Effetto di un'Economia (`get_economyPriorityPerCapitaIncomeChange`): base,
  per regione di risorse e per regione economica centrale passano ciascuno per
  `SumEffectsModifiers` della fazione che ha il punto esecutivo (contesti
  `Economy_BasePCGDPIncrease`, `Economy_ResourcePCGDPMultiplier`,
  `Economy_CoreEcoPCGDPMultiplier`): le tecnologie danno x1,02 alla base.
- Al mese il pro capite cresce di (pc / 20)^0,35 x K x E: gli IP crescono con
  (pop x pc)^0,35, l'effetto cala con pop^-0,35, e la popolazione si elide.

Le nazioni, le rivendicazioni e le statistiche sono quelle della schermata
nazione: niente di nascosto.
"""

from . import gamedata
from .model import CP_COST_DIVISOR, CP_COST_SCALING, cp_gdp_scale, leo_modules   # (PIL / K) ^ 0,6 / 2 per nazione
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
    # TINationState.get_militaryPriorityTechLevelChange: per completamento
    # militaryPriorityMiltechIncrease x miglior miltech umano / max(1, miltech),
    # poi AddToMilitaryTechLevel lo tiene fra minMilitaryTechLevel e il tetto
    "milTech": 0.00125,          # militaryPriorityMiltechIncrease
    "milTechMin": 2.0,           # minMilitaryTechLevel
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
# regioni sviluppate dall'Economia (TIGlobalConfig, default della DLL: il
# template non li ridefinisce) e la soglia di CandidateCoreEconomicRegions
ECOS_FOR_CORE_ECO = 1200            # numEcosForCoreEcoRegion
ECOS_FOR_CORE_MINING = 750          # numEcosForCoreMiningRegion
ECOS_FOR_CORE_OIL = 500             # numEcosForCoreOilRegion
CORE_ECO_MIN_GDP_BN = 500.0         # nationalGDPShareValue_bn > 500
# TIRegionState.get_annualPopulationGrowth, % annua: base + max(-base,
# istruzione x c) + coesione x c + min(180.000, pro capite) x c + sqrt|latitudine|
# x c + modificatore della regione che svanisce in 20 anni di campagna +
# modificatore della nazione - xenoformazione / 200 - 4 x esplosioni nucleari,
# fra -10 e 10. Il clima toglie solo sopra 8 gradi di anomalia: non lo ricostruiamo.
POP_GROWTH = {"base": 4.49788037409348, "education": -0.418190741, "cohesion": -0.0624798523403752,
              "pcgdp": 9.80843732089162e-06, "pcgdpMax": 180000.0, "latitude": -0.115739931206548,
              "xenoDiv": 200.0, "nuke": 4.0, "clamp": 10.0}
POP_REGRESSION_YEARS = 20.0         # TIStartTimeTemplate.populationRegressionPeriod_years
DAYS_PER_YEAR = 365.2421875         # TITimeState.CampaignDuration_years_Exact


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


def region_view(nm, rid, r, hostile, rtpl, mtpl=None, xeno=None):
    """Una regione per YASS: peso nel PIL, Controllo missioni, lo sviluppo
    dall'Economia (flag del template, contatori che il gioco mostra) e quello
    che serve alla crescita della popolazione."""
    tp = rtpl.get(r.get("templateName")) or {}
    mp = (mtpl or {}).get(tp.get("mapRegionName")) or {}
    xs = (xeno or {}).get((r.get("xenoforming") or {}).get("value")) or {}
    return {"id": rid, "name": nm.region(r), "population": r.get("populationInMillions") or 0,
            "hostile": rid in hostile, "gdpWeight": gdp_weight(r),
            "missionControl": r.get("missionControl") or 0,
            "core": bool(r.get("coreEconomicRegion")),
            "mine": bool(r.get("resourceRegion")), "oil": bool(r.get("oilRegion")),
            "colony": bool(r.get("colonyRegion")), "nuked": bool(r.get("nuclearDetonations")),
            "oilCapable": bool(tp.get("oilCapable")), "mineCapable": bool(tp.get("mineCapable")),
            "accOil": r.get("accumulatedCoreOilRegionTriggers") or 0,
            "accMine": r.get("accumulatedCoreMiningRegionTriggers") or 0,
            "accCore": r.get("accumulatedCoreEconomyRegionTriggers") or 0,
            "lat": mp.get("latitude") or 0, "popMod": r.get("annualPopGrowthModifier") or 0,
            "xeno": xs.get("xenoformingLevel") or 0, "nukes": r.get("nuclearDetonations") or 0}


def base_ip(gdp, unrest):
    """IP del mese senza consiglieri ne' eserciti: (PIL / 1 mld)^0,35, meno la
    penalita' dei disordini."""
    pen = max(0.0, unrest - UNREST_IP_FREE) / UNREST_IP_STEP
    return (gdp / 1e9) ** IP_GDP_EXP * max(0.0, 1 - pen) if gdp > 0 else 0.0


def _advise_score(adv):
    adv = sorted(adv, key=lambda x: -x[0])
    return sum(a / 100 / (i + 1) for i, (a, _) in enumerate(adv)), [name for _, name in adv]


def advise_bonus(g, n):
    """Bonus agli IP dai NOSTRI consiglieri che consigliano la nazione
    (GetAdvisingScore con l'Amministrazione, al piu' 25): dal piu' bravo,
    AMM / 100 / posizione. Due letture: chi consiglia ora (`advisingCouncilors`, gia'
    dentro gli IP del salvataggio) e chi ha Consiglia assegnata come missione
    attiva, che entra in vigore alla risoluzione: un salvataggio fatto in fase
    missioni ha la prima lista vuota. Anche i nomi, per la nota della cella."""
    from .council import councilor_view

    def admin(c):
        # AdvisingBonus chiede l'attributo «capped»: al piu' 25, meno i malus dei tratti
        v = councilor_view(g, c)
        return max(0, min(v["attributes"]["Administration"], v["attributeCaps"]["Administration"]))
    mine = {c["value"] for c in (g.me.get("councilors") or [])}
    nid = (n.get("ID") or {}).get("value")
    missions = g.state("TIMissionState")
    now, assigned = [], []
    for ref in n.get("advisingCouncilors") or []:
        c = g.councilors.get(ref["value"])
        if c and ref["value"] in mine and c.get("active") is not False:
            now.append((admin(c), c.get("displayName")))
    for c in g.my_councilors():
        m = missions.get((c.get("activeMission") or {}).get("value")) or {}
        if m.get("templateName") == "Advise" and (m.get("target") or {}).get("value") == nid:
            assigned.append((admin(c), c.get("displayName")))
    b_now, who_now = _advise_score(now)
    b_next, who_next = _advise_score(assigned) if assigned else (b_now, who_now)
    return b_now, who_now, b_next, who_next


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


# priorita' -> regola dei moduli che la potenzia (TIFactionState.SumLEOHabPriorityBonuses)
LEO_RULE = {
    "Economy": "LEOBonusEconomy", "Welfare": "LEOBonusWelfare", "Environment": "LEOBonusEnvironment",
    "Knowledge": "LEOBonusKnowledge", "Government": "LEOBonusGovernment", "Unity": "LEOBonusUnity",
    "Oppression": "LEOBonusOppression", "LaunchFacilities": "LEOBonusLaunchFacilities",
    "MissionControl": "LEOBonusMissionControl", "Military": "LEOBonusMiltech",
}
LEO_CAP = 0.3                       # TIGlobalConfig.LEOHabModulePriorityBonusCap


def leo_bonuses(g, faction=None):
    """{priorita': (bonus, [(modulo, valore, quanti)])} dai laboratori delle
    stazioni in orbita bassa: somma dei moduli attivi, al piu' LEO_CAP."""
    tpl = gamedata.templates()["habModules"]
    count = {}
    for m in leo_modules(g, faction):
        count[m] = count.get(m, 0) + 1
    out = {}
    for kind, rule in LEO_RULE.items():
        mods = [(m, (tpl.get(m) or {}).get("specialRulesValue") or 0, n) for m, n in count.items()
                if rule in ((tpl.get(m) or {}).get("specialRules") or [])]
        total = sum(v * n for _, v, n in mods)
        if total:
            out[kind] = (min(total, LEO_CAP), mods)
    return out


def _leo_part(g, kind, lang="ita", faction=None):
    b, mods = leo_bonuses(g, faction).get(kind, (0.0, []))
    if not b:
        return []
    what = ", ".join("%s%s" % ("%d x " % n if n > 1 else "",
                               gamedata.loc(lang, "TIHabModuleTemplate", "displayName", m, m))
                     for m, _, n in mods)
    raw = sum(v * n for _, v, n in mods)
    if raw > b:     # oltre il tetto i moduli in piu' non servono
        what += " (%d%%, tetto %d%%)" % (round(raw * 100), round(LEO_CAP * 100))
    return [{"source": "hab", "name": what, "who": None, "bonus": b}]


def _faction_effects(g, faction):
    """{contesto: [nomi degli effetti]} di una fazione (TIEffectsState.factionEffects)."""
    fx = next(iter(g.state("TIEffectsState").values()), {})
    fid = ((faction or {}).get("ID") or {}).get("value")
    return next((e.get("Value") or {} for e in fx.get("factionEffectsNames") or []
                 if (e.get("Key") or {}).get("value") == fid), {})


ECO_PC_CONTEXT = {"base": "Economy_BasePCGDPIncrease", "resource": "Economy_ResourcePCGDPMultiplier",
                  "core": "Economy_CoreEcoPCGDPMultiplier"}


def _apply_effects(value, names, tpl):
    """TIEffectsState.SumEffectsModifiers: le operazioni in fila sul valore."""
    v = value
    for name in names:
        e = tpl.get(name) or {}
        x, op = e.get("value") or 0, e.get("operation", "Additive")
        if op == "Additive":
            v += x
        elif op == "Multiplicative":
            v *= x
        elif op == "Set":
            v = x
        elif op == "Minimum":
            v = max(v, x)
        elif op == "Maximum":
            v = min(v, x)
    return v


def economy_multipliers(g, n):
    """Fattori su base, regioni di risorse e regioni economiche centrali di
    un'Economia: effetti della fazione col punto esecutivo (il primo punto)."""
    cps = n.get("controlPoints") or []
    cp = g.cps.get(cps[0]["value"]) if cps else None
    fac = g.factions.get(((cp or {}).get("faction") or {}).get("value"))
    if not fac:
        return {k: 1.0 for k in ECO_PC_CONTEXT}
    names = _faction_effects(g, fac)
    tpl = gamedata.templates()["effects"]
    base = {"base": EFFECTS["ecoPcBase"], "resource": EFFECTS["ecoPcPerResource"], "core": EFFECTS["ecoPcPerCore"]}
    return {k: _apply_effects(base[k], names.get(ctx) or [], tpl) / base[k] for k, ctx in ECO_PC_CONTEXT.items()}


def faction_priority_bonuses(g, lang="ita"):
    """{priorita': (bonus, voci)} della fazione del giocatore: org e tratti dei
    consiglieri, laboratori in orbita bassa, effetti. Come
    TIFactionState.SumPriorityBonuses."""
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
        parts += _leo_part(g, kind, lang)
        for name in mine.get(EFFECT_CONTEXT.get(kind, "")) or []:
            et = tpl["effects"].get(name) or {}
            if et.get("value") and et.get("operation", "Additive") == "Additive":
                parts.append({"source": "effect", "name": name, "who": None, "bonus": et["value"]})
        out[kind] = (sum(x["bonus"] for x in parts), parts)
    return out


def best_sustainability(g):
    """TINationState.BestCurrentSustainabilityValue: la sostenibilita' sotto cui
    l'Ambiente non porta piu' (max(0, initialSustainabilityMin + modificatore ×
    effetti della fazione)). Il modificatore lo fissa l'inizio della campagna
    (TIGlobalValuesState.PostGlobalGameStateCreateInit_2): se le tecnologie, tutte
    insieme, scenderebbero sotto il greenEconomy piu' basso delle nazioni, le si
    scala fino a quello. None senza il dato."""
    lo = g.globals.get("initialSustainabilityMin")
    if lo is None:
        return None
    tpl = gamedata.templates()
    ctx = "Environment_BestSustainabilityValue"
    reach = -sum((tpl["effects"].get(e) or {}).get("value") or 0
                 for t in tpl["techs"].values() for e in t.get("effects") or []
                 if ctx in ((tpl["effects"].get(e) or {}).get("contexts") or []))
    green = [((tpl.get("nations") or {}).get(n.get("templateName")) or {}).get("greenEconomy")
             for n in g.nations.values() if not n.get("alienNation")]
    green = [x for x in green if x is not None]
    mod = min(green) / reach if green and reach > min(green) else 1.0
    mine = sum((tpl["effects"].get(e) or {}).get("value") or 0
               for e in _faction_effects(g, g.me).get(ctx) or [])
    return max(0.0, lo + mod * mine)


def mc_room(g, n):
    """Controllo missioni (TINationState.ValidPriority): (valida, certa).
    Programma spaziale, anche della federazione (TIFederationState.
    SetSpaceProgramValue: un membro che ce l'ha), e una regione sotto il tetto
    (TIRegionState.get_maxMissionControl). Il PIL salvato non e' quello con cui
    il gioco ha contato i pallini: un tetto a meno dell'1% da un intero resta
    incerto, e lo decidono i pallini (_fit_validity)."""
    space = bool(n.get("spaceFlightProgram"))
    fed = g.state("TIFederationState").get((n.get("federation") or {}).get("value"))
    if not space and fed:
        space = any((g.nations.get(m.get("value")) or {}).get("spaceFlightProgram") for m in fed.get("members") or [])
    if not space:
        return (False, True)
    regs = [g.regions.get(rid) or {} for rid in _ids(n.get("regions"))]
    weights = [gdp_weight(r) for r in regs]
    total = sum(weights)
    if not total:
        return (False, True)
    div = max(MC_DIV_MIN, MC_DIV - MC_DIV_PER_EDU * (n.get("education") or 0))
    gdp = n.get("GDP") or 0
    near = False
    for r, w in zip(regs, weights):
        x = gdp / 1e9 * w / total / div
        mc = r.get("missionControl") or 0
        if abs(x - round(x)) <= 0.01 * max(1.0, x) and mc in (round(x), round(x) + 1) and mc > 0:
            near = True
        elif mc < 1 + int(x):
            return (True, True)
    return (True, False) if near else (False, True)


def valid_priorities(n, best_sust=None, mc=None):
    """{priorita': (valida, certa)} con le regole di TINationState.ValidPriority.
    Dove il salvataggio non ha il dato (tetto dei finanziamenti, posti di
    controllo missioni, eserciti costruibili…) si suppone valida: `certa` False.
    `best_sust` e' best_sustainability(), `mc` mc_room(): senza, Ambiente e
    Controllo missioni restano incerti."""
    mil = bool(n.get("military"))
    space = bool(n.get("spaceFlightProgram"))
    nuke = bool(n.get("nuclearProgram"))
    no_nukes = bool(n.get("policy_noNukes"))
    sust = n.get("sustainability") or 0
    return {
        "Economy": (True, True), "Welfare": (True, True), "Knowledge": (True, True),
        "Unity": (True, True), "Spoils": (True, True),
        "Government": ((n.get("democracy") or 0) < 10 or bool(n.get("canAccumulateLegitimizeClaimTriggers")), True),
        "Environment": _environment_valid(sust, bool(n.get("canAccumulateDecontaminateTriggers")), best_sust),
        "Oppression": (mil, True),
        "Funding": (True, False),
        "Civilian_InitiateSpaceflightProgram": (not space, True),
        "LaunchFacilities": (space, space),
        "MissionControl": (space, False) if mc is None else mc,
        "Military_FoundMilitary": (not mil, True),
        "Military": (mil and (n.get("militaryTechLevel") or 0) < (n.get("maxMilitaryTechLevel") or 0), True),
        "Military_BuildArmy": (mil, False),
        "Military_BuildNavy": (mil, False),
        "Military_InitiateNuclearProgram": (mil and not nuke and not no_nukes, True),
        "Military_BuildNuclearWeapons": (nuke and not no_nukes, True),
        "Military_BuildSpaceDefenses": (mil and bool(n.get("canBuildSpaceDefenses")), False),
        "Military_BuildSTOSquadron": (mil and bool(n.get("canBuildSTOSquadrons")), False),
    }


def _environment_valid(sust, decontaminate, best):
    """Ambiente: valida con sostenibilita' <= 0, sopra la migliore raggiungibile
    o con contaminazione da ripulire. Una nazione gia' alla migliore (vi resta
    ferma: e' il pavimento) non la vede; il confronto e' fra float del gioco."""
    if sust <= 0 or decontaminate:
        return (True, True)
    if best is None:
        return (True, False)
    return (sust > best + 1e-5, True)


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


def priority_panel(g, n, lang, fbonus, best_sust=None):
    """Righe del pannello Priorita' di una nazione e i miei punti di controllo."""
    cps = []
    for i, ref in enumerate(n.get("controlPoints") or []):
        cp = g.cps.get(ref["value"]) or {}
        if g.factions.get((cp.get("faction") or {}).get("value")) is not g.me:
            # i pallini altrui il gioco non li mostra: il punto c'e', vuoto, per
            # provare «e se fosse mio»
            cps.append({"index": i, "priorities": {}, "total": 0, "disabled": False, "mine": False})
            continue
        cps.append({"index": i, "priorities": {k: v for k, v in (cp.get("controlPointPriorities") or {}).items()},
                    "total": cp.get("totalWeightsForControlPoint") or 0,
                    "disabled": bool(cp.get("benefitsDisabled")), "mine": True})
    valid = _fit_validity(valid_priorities(n, best_sust, mc_room(g, n)), [c for c in cps if c["mine"]])
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


def faction_knowledge_bonus(g, lang="ita"):
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
    parts += _leo_part(g, "Knowledge", lang)
    mine = _faction_effects(g, g.me)
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
    fbonus, fparts = faction_knowledge_bonus(g, lang)
    # residuo tipico della coesione di riposo, per le nazioni in cui non si ricava
    resids = sorted(r for r in (cohesion_terms(g, x)[1] for x in g.nations.values()
                                if x.get("displayName") and x.get("regions")) if r is not None)
    resid_med = resids[len(resids) // 2] if resids else 0.0
    pbonus = faction_priority_bonuses(g, lang)
    best_sust = best_sustainability(g)
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

    tpl = gamedata.templates()
    rtpl = tpl.get("regions") or {}
    mtpl = tpl.get("mapRegions") or {}
    ntpl = tpl.get("nations") or {}
    xeno = g.state("TIRegionXenoformingState")
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
        prows, pcps = priority_panel(g, n, lang, pbonus, best_sust)
        advise, advisers, advise_next, advisers_next = advise_bonus(g, n)
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
            # bonus Consiglia dei nostri consiglieri, gia' dentro "ip"
            "advise": advise,
            # senza esercito il Miltech non si muove: niente colonna
            "miltech": (n.get("militaryTechLevel") or 0) if n.get("military") else None,
            "maxMiltech": n.get("maxMilitaryTechLevel") or 0,
            "advisers": advisers,
            # Consiglia assegnata come missione: vale dalla risoluzione
            "adviseNext": advise_next,
            "advisersNext": advisers_next,
            "controlPoints": len(n.get("controlPoints") or []),
            "myControlPoints": my_cps.get(nid, []),
            "priorities": prows,
            "restModel": rest_model(g, n, resid_med),
            "panelCPs": pcps,
            "regions": [region_view(nm, rid, r, hostile, rtpl, mtpl, xeno) for rid, r in regs],
            "popGrowthModifier": (ntpl.get(n.get("templateName")) or {}).get("popGrowthModifier") or 0,
            # puo' ancora sviluppare petrolio e miniere (politiche e fine del petrolio)
            "canOil": not n.get("policy_noOilDevelopment") and not gv.get("endOfOil"),
            "canMine": not n.get("policy_noMineralDevelopment"),
            "ecoMult": economy_multipliers(g, n),
            "claims": _ids(n.get("claims")),
            "hostileClaims": sorted(hostile),
        })
    out.sort(key=lambda x: (not x["mine"], x["name"] or ""))
    return {
        "nations": out,
        "faction": g.me.get("templateName"),
        "campaign": g.campaign_key(),
        "knowledgeBonus": {"total": fbonus, "parts": fparts},
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
            "bestMiltech": g.globals.get("bestGlobalHumanMiltech") or 0,
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
            "cpGdpScale": cp_gdp_scale(g),
            "cpCostScaling": CP_COST_SCALING,
            "cpCostDivisor": CP_COST_DIVISOR,
            "ecosForCoreEco": ECOS_FOR_CORE_ECO,
            "ecosForCoreMining": ECOS_FOR_CORE_MINING,
            "ecosForCoreOil": ECOS_FOR_CORE_OIL,
            "coreEcoMinGdp": CORE_ECO_MIN_GDP_BN,
            "gdpWeightCore": GDP_WEIGHT_CORE,
            "gdpWeightResource": GDP_WEIGHT_RESOURCE,
            "popGrowth": POP_GROWTH,
            "popRegressionYears": POP_REGRESSION_YEARS,
            "campaignYears": (next(iter(g.state("TITimeState").values()), {}).get("daysInCampaign") or 0) / DAYS_PER_YEAR,
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
    # (PIL / 1 mld)^0,35 meno i disordini
    ip_ok = 0
    for n in d["nations"]:
        nat = g.nations.get(n["id"]) or {}
        # chi consiglia (anche altre fazioni) alza gli IP: si confronta senza
        if nat.get("armies") or nat.get("advisingCouncilors"):
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
    eco_ok, eco_skip, eco_bad = check_economy(g, d)
    return len(d["nations"]), unrest_ok, ip_ok, mc_ok, (eco_ok, eco_skip), bad + eco_bad


def economy_per_completion(n):
    """PIL pro capite in piu' per un'Economia (get_economyPriorityPerCapitaIncomeChange)."""
    mu = n["ecoMult"]
    k = (EFFECTS["ecoPcBase"] * mu["base"] + n["resourceRegions"] * EFFECTS["ecoPcPerResource"] * mu["resource"]
         + n["coreEcoRegions"] * EFFECTS["ecoPcPerCore"] * mu["core"] + n["democracy"] * 0.5 + n["education"])
    return k * n["popScaling"]


def economy_ip(n):
    """IP del mese sull'Economia dai miei punti, coi bonus (ControlPointWeightsTotalToPriorityIP)."""
    row = next((r for r in n["priorities"] if r["id"] == "Economy"), None)
    if row is None:
        return 0.0
    per_cp = n["ip"] / max(1, n["controlPoints"])
    out = 0.0
    for cp in n["panelCPs"]:
        if not cp["total"]:
            continue
        b = row["factionBonus"] + row["nationalBonus"] + diversity_bonus(cp["priorities"], cp["total"], "Economy")
        if cp["disabled"] and b > 0:
            b = 0.0
        out += per_cp * (cp["priorities"].get("Economy") or 0) / cp["total"] * (1 + b)
    return out / (PRIORITY_COST_DEFAULT["Economy"][1] or 1)


def check_economy(g, d, tolerance=0.1):
    """Le Economie del mese contro il registro del gioco
    (`tracker_GDPChangeReason_CurrentTrackingPeriod`, voce EconomyPriority):
    PIL dall'Economia / (effetto di un completamento x popolazione) = quante
    Economie ha completato. Solo il primo del mese (il registro copre il mese
    appena chiuso), solo le nazioni coi punti tutti miei e senza Consiglia
    nostra in corso o appena finita (nel mese non si sa per quanti giorni) e
    senza territorio cambiato nel mese.
    Ritorna (verificate, saltate, differenze)."""
    if g.game_date()[2] != 1:
        return 0, 0, []
    advised = set()
    for c in g.my_councilors():
        if c.get("priorMissionTemplateName") == "Advise":
            advised.add((c.get("priorMissionTarget") or {}).get("value"))
    ok, skipped, bad = 0, 0, []
    for n in d["nations"]:
        tr = (g.nations.get(n["id"]) or {}).get("tracker_GDPChangeReason_CurrentTrackingPeriod") or {}
        gdp = tr.get("GDPReason_EconomyPriority") or 0
        if gdp <= 0 or sum(cp["mine"] for cp in n["panelCPs"]) != n["controlPoints"] or not n["controlPoints"]:
            continue
        # nata, annessa o divisa nel mese: il registro copre solo una parte del mese
        if n["advise"] or n["adviseNext"] or n["id"] in advised or tr.get("GDPReason_TerritoryChange"):
            skipped += 1
            continue
        model = economy_ip(n)
        done = gdp / (economy_per_completion(n) * n["population"] * 1e6)
        if model and abs(done / model - 1) <= tolerance:
            ok += 1
        else:
            bad.append(f"Economia {n['name']}: {done:.1f} completate secondo il gioco, {model:.1f} dal modello")
    return ok, skipped, bad


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
    # python -m ticore.yass [salvataggio ...]: senza argomenti l'ultimo salvataggio
    import sys
    failed = False
    for path in sys.argv[1:] or [None]:
        total, unrest_ok, ip_ok, mc_ok, (eco_ok, eco_skip), bad = check(path)
        if path:
            print(path)
        print(f"{total} nazioni, disordini verificati su {unrest_ok} senza esercito, "
              f"IP dal PIL su {ip_ok}, tetto MC su {mc_ok} coi miei pallini, "
              f"Economie del mese su {eco_ok} (saltate {eco_skip}: Consiglia o confini cambiati)")
        print("\n".join(bad) if bad else "Nessuna differenza.")
        failed = failed or bool(bad)
    raise SystemExit(1 if failed else 0)
