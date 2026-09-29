"""Scheda Estrazione: dove conviene scavare e quali org aiutano nello spazio.

Siti. Il salvataggio ha la resa VERA di ogni sito (`water_day` & co.), ma il
gioco la mostra solo dopo la prospezione del corpo celeste (Codex, «Siti di
habitat»). Regole lette dall'IL di Assembly-CSharp.dll:

- `TIFactionState.Prospected(corpo)`: intel sul corpo >= 1,0. Una sonda in
  viaggio porta l'intel a 0,1 (`ProspectorEnRoute`: >= 0,1 e non prospettato).
- Prima della prospezione la lista dei siti del pannello di un corpo
  (`BaseSiteListItemController.SetListItem`, per ogni corpo con siti, anche
  non esplorabile) mostra solo la forchetta `Min/MaxProductivity` = attesa
  -/+ ampiezza/2, mai sotto il minimo del profilo. L'attesa
  (`GetHabSiteExpectedProductivity_month`) e' la media del profilo corretta da
  `ModifyBaseValueForConditions`; i nobili non superano meta' dei metalli.
  L'attesa la usiamo noi per il Valore e per ordinare: l'interfaccia mostra
  la forchetta, come il gioco.
- `ModifyBaseValueForConditions`: se il profilo ha `modifyBySize`, un corpo
  piu' leggero di `maxMassforMiningResourceMalus` (5e16 kg) rende in
  proporzione alla massa; per metalli, nobili e fissili conta anche la
  densita': sotto 1,25 g/cm3 malus proporzionale, sopra 3 bonus. Il fattore
  sta fra 0,75 e 1,25. Poi il moltiplicatore globale della partita.
- Resa mensile = giornaliera x 30,436874 (`GetMonthlyProduction`).
- `CanExplore`: il corpo e' raggiungibile se la fazione ha uno dei suoi
  effetti di esplorazione (`effectToExplore`, `alternativeEffectToExplore`),
  o se non ne ha nessuno. Il limite di distanza in UA (contesto 145) qui non
  si applica.

La resa non comprende il bonus di org ed effetti della fazione
(`GetCurrentMiningMultiplierFromOrgsAndEffects`): vale per tutti i siti allo
stesso modo, quindi non cambia la classifica.

Il VALORE (resa x prezzo di mercato del salvataggio) e' una misura nostra per
ordinare: il gioco non la calcola. Accanto ci sono sempre le rese grezze.

Org. Si guardano i bonus spaziali dei `TIOrgState` (estrazione, controllo
missioni, sviluppo spaziale, volo spaziale, capacita' di lancio). Sono visibili:
le nostre, quelle del nostro mercato, quelle dei consiglieri altrui con intel
>= 0,50 (`intelToSeeCouncilorDetails`, come in factions.py) e le non assegnate
di una fazione con intel >= 0,25 (`FactionView.knownUnassignedOrgsPool`).
Queste ultime due sono i bersagli possibili di Acquisizione ostile: la
schermata del gioco elenca anche il pool non assegnato della fazione
(`UI.OrgTargeting.CouncilorTip`).
"""

from . import gamedata
from .council import org_view
from .factions import COUNCILOR_GATES, GATES, _faction_ref, _intel_on
from .names import Namer

DAYS_PER_MONTH = 30.436874          # TIHabSiteState.GetMonthlyProduction
INTEL_PROSPECTED = 1.0              # TIFactionState.Prospected
INTEL_PROBE_EN_ROUTE = 0.1          # TIFactionState.ProspectorEnRoute
INTEL_TO_SEE_HAB = 0.1              # come space.INTEL_TO_SEE
MAX_MASS_FOR_MALUS = 5e16           # TIGlobalConfig.maxMassforMiningResourceMalus
METALS_MALUS_DENSITY = 1.25         # TIGlobalConfig.metalsMalusDensityCutPoint
METALS_BONUS_DENSITY = 3.0          # TIGlobalConfig.metalsBonusDensityCutPoint
DEFAULT_DENSITY = 2.0               # TISpaceBodyState.density_gcm3 senza valore

# campo del sito/profilo -> chiave di UI.Global e di resourceMarketValues
RESOURCES = (("water", "Water"), ("volatiles", "Volatiles"), ("metals", "Metals"),
             ("nobles", "NobleMetals"), ("fissiles", "Fissiles"))
# risorse per cui conta la densita' (secondo argomento di ModifyBaseValueForConditions)
_DENSE = {"metals", "nobles", "fissiles"}

# bonus spaziali di un'org: campo di TIOrgState
ORG_BONUSES = ("miningBonus", "MCBonus", "spaceDevBonus", "spaceflightBonus")
# campo -> priorita' nazionali a cui si applica (chiavi di gamedata.PRIORITIES).
# Da `TIOrgState.description`, che scrive ogni bonus con GetPriorityString.
ORG_PRIORITIES = {
    "spaceDevBonus": ("spaceProgram",),
    "spaceflightBonus": ("initSpaceProgram", "boost", "sto"),
    "MCBonus": ("missionControl",),
}


def _factor(profile, body_tpl, dense):
    if not profile.get("modifyBySize"):
        return 1.0
    f = 1.0
    mass = body_tpl.get("mass_kg") or 5e-324
    if mass <= MAX_MASS_FOR_MALUS:
        f *= mass / MAX_MASS_FOR_MALUS
    if dense:
        d = body_tpl.get("density_gcm3")
        d = DEFAULT_DENSITY if d is None else d
        if d <= METALS_MALUS_DENSITY:
            f *= d / METALS_MALUS_DENSITY
        elif d >= METALS_BONUS_DENSITY:
            f *= d / METALS_BONUS_DENSITY
    return min(1.25, max(0.75, f))


def _modify(value, profile, body_tpl, dense, global_mult):
    if value > 0:
        value *= _factor(profile, body_tpl, dense)
    return value * global_mult


def expected(profile, body_tpl, global_mult=1.0):
    """{risorsa: (attesa, minima, massima)} al mese, come il gioco prima della
    prospezione."""
    out = {}
    for k, _ in RESOURCES:
        dense = k in _DENSE
        mean = _modify(profile.get(k + "_mean") or 0, profile, body_tpl, dense, global_mult)
        if k == "nobles":
            mean = min(out["metals"][0] / 2, mean)
        half = _modify(profile.get(k + "_width") or 0, profile, body_tpl, False, global_mult) / 2
        lo = max(profile.get(k + "_min") or 0, mean - half)
        out[k] = (mean, lo, mean + half)
    return out


def _my_effects(g, my_id):
    names = set()
    for es in g.state("TIEffectsState").values():
        for e in es.get("factionEffectsNames") or []:
            if (e.get("Key") or {}).get("value") == my_id:
                for lst in (e.get("Value") or {}).values():
                    names.update(lst or [])
    return names


def _system_au(bodies_tpl, name):
    """Distanza media dal Sole: per una luna, quella del suo pianeta."""
    seen = set()
    while name and name not in seen:
        seen.add(name)
        t = bodies_tpl.get(name) or {}
        if t.get("barycenterName") in (None, "Sol"):
            return t.get("semiMajorAxis_AU")
        name = t.get("barycenterName")
    return None


def _sites(g, lang, my_id, nm):
    tpl = gamedata.templates()
    site_tpl, body_tpl, profiles = tpl["habSites"], tpl["spaceBodies"], tpl["miningProfiles"]
    gv = next(iter(g.state("TIGlobalValuesState").values()), {})
    market = gv.get("resourceMarketValues") or {}
    global_mult = ((gv.get("scenarioCustomizations") or {})
                   .get("miningProductivityMultiplier") or 1.0)
    body_intel = _intel_on(g.me, "intel", "TISpaceBodyState")
    hab_intel = _intel_on(g.me, "intel", "TIHabState")
    effects = _my_effects(g, my_id)
    bodies = g.state("TISpaceBodyState")
    habs = g.state("TIHabState")

    out = []
    for sid, s in g.state("TIHabSiteState").items():
        if not s.get("exists", True) or s.get("archived"):
            continue
        body_id = (s.get("parentBody") or {}).get("value")
        b = bodies.get(body_id) or {}
        bname = b.get("templateName")
        bt = body_tpl.get(bname) or {}
        st = site_tpl.get(s.get("templateName")) or {}
        profile = profiles.get(st.get("miningProfileName")) or {}

        intel = body_intel.get(body_id, 0)
        prospected = intel + 1e-6 >= INTEL_PROSPECTED
        probe = not prospected and intel + 1e-6 >= INTEL_PROBE_EN_ROUTE
        options = [e for e in (bt.get("effectToExplore"), bt.get("alternativeEffectToExplore")) if e]
        reachable = not options or any(e in effects for e in options)

        if prospected:
            y = {k: (s.get(k + "_day") or 0) * DAYS_PER_MONTH for k, _ in RESOURCES}
            rows = {k: {"value": v} for k, v in y.items()}
        else:
            exp = expected(profile, bt, global_mult)
            y = {k: v[0] for k, v in exp.items()}
            rows = {k: {"value": v[0], "min": v[1], "max": v[2]} for k, v in exp.items()}
        value = sum(y[k] * (market.get(key) or 0) for k, key in RESOURCES)

        occupant = None
        h = habs.get((s.get("hab") or {}).get("value"))
        if h and h.get("exists", True) and not h.get("archived"):
            mine = (h.get("faction") or {}).get("value") == my_id
            hid = (h.get("ID") or {}).get("value")
            if mine or hab_intel.get(hid, 0) + 1e-6 >= INTEL_TO_SEE_HAB:
                f = g.factions.get((h.get("faction") or {}).get("value"))
                occupant = dict(_faction_ref(g, nm, f), mine=mine)

        out.append({
            "id": s.get("templateName"),
            "name": gamedata.loc(lang, "TIHabSiteTemplate", "displayName",
                                 s.get("templateName"), s.get("displayName")),
            "body": {"id": bname,
                     "name": gamedata.loc(lang, "TISpaceBodyTemplate", "displayName",
                                          bname, b.get("displayName")),
                     "type": bt.get("objectType"),
                     "au": _system_au(body_tpl, bname)},
            "profile": gamedata.loc(lang, "TIMiningProfileTemplate", "displayName",
                                    profile.get("dataName"), profile.get("friendlyName")),
            "prospected": prospected,
            "probeEnRoute": probe,
            "reachable": reachable,
            "yields": rows,
            "value": round(value, 1),
            "occupant": occupant,
        })
    out.sort(key=lambda r: -r["value"])
    return out, market


def _org_row(g, o, lang, where, owner=None):
    v = org_view(g, o, lang)
    return {
        "id": v["id"], "name": v["name"], "tier": v["tier"], "type": v["type"],
        "homeNation": v["homeNation"],
        "bonuses": {k: o.get(k) or 0 for k in ORG_BONUSES},
        "priorities": [dict(gamedata.priority_view(lang, p), bonus=o.get(k))
                       for k, ps in ORG_PRIORITIES.items() if o.get(k) for p in ps],
        "boost": v["income"]["boost"],
        "missionControl": v["income"]["missionControl"],
        "cost": v["cost"],
        "requiresNationality": v["requiresNationality"],
        "where": where,
        "owner": owner,
    }


def _is_space(o):
    return any(o.get(k) for k in ORG_BONUSES) or o.get("incomeBoost_month") or o.get("incomeMissionControl")


def _orgs(g, lang, my_id, nm):
    rows, seen = [], set()

    def add(ref, where, owner=None):
        o = g.orgs.get(ref)
        if not o or ref in seen or not _is_space(o):
            return
        seen.add(ref)
        rows.append(_org_row(g, o, lang, where, owner))

    for c in g.my_councilors():
        for r in c.get("orgs") or []:
            add(r["value"], "mine", {"councilor": c.get("displayName")})
    for r in g.me.get("unassignedOrgs") or []:
        add(r["value"], "mine")
    for r in g.me.get("availableOrgs") or []:
        add(r["value"], "market")

    c_intel = _intel_on(g.me, "intel", "TICouncilorState")
    f_intel = _intel_on(g.me, "intel", "TIFactionState")
    for cid, c in g.councilors.items():
        fid = (c.get("faction") or {}).get("value")
        if fid in (None, my_id) or c_intel.get(cid, 0) + 1e-6 < COUNCILOR_GATES["details"]:
            continue
        for r in c.get("orgs") or []:
            add(r["value"], "rival", dict(_faction_ref(g, nm, g.factions.get(fid)),
                                          councilor=c.get("displayName")))
    for fid, f in g.factions.items():
        if fid == my_id or f_intel.get(fid, 0) + 1e-6 < GATES["unassignedOrgs"][0]:
            continue
        for r in f.get("unassignedOrgs") or []:
            add(r["value"], "rival", _faction_ref(g, nm, f))

    order = {"mine": 0, "market": 1, "rival": 2}
    rows.sort(key=lambda r: (order[r["where"]], -r["bonuses"]["miningBonus"],
                             -(r["bonuses"]["MCBonus"] + r["boost"]), r["name"] or ""))
    mining_now = sum(r["bonuses"]["miningBonus"] for r in rows
                     if r["where"] == "mine" and r["owner"])
    return rows, mining_now


def overview(g, lang="ita"):
    nm = Namer(g, lang)
    my_id = (g.me.get("ID") or {}).get("value")
    sites, market = _sites(g, lang, my_id, nm)
    orgs, mining_now = _orgs(g, lang, my_id, nm)
    return {
        "resources": [dict(gamedata.resource_view(lang, key), id=k,
                           price=market.get(key) or 0) for k, key in RESOURCES],
        "sites": sites,
        "prospectedBodies": len({s["body"]["id"] for s in sites if s["prospected"]}),
        "orgs": orgs,
        "orgMiningBonus": round(mining_now, 3),
        "labels": {"miningBonus": gamedata.loc(lang, "UI", "OrgTargeting", "SpaceMiningBonus", None),
                   "priorities": {k: [gamedata.priority_view(lang, p) for p in ps]
                                  for k, ps in ORG_PRIORITIES.items()}},
        "thresholds": {"prospected": INTEL_PROSPECTED, "councilor": COUNCILOR_GATES["details"],
                       "faction": GATES["unassignedOrgs"][0]},
    }
