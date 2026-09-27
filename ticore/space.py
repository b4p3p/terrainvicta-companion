"""Scheda Spazio: habitat, orbite terrestri e cosa serve per costruire.

Visibilita': come la finestra Habitat del gioco. `TIFactionState.get_KnownHabs`
tiene gli habitat per cui `TISpaceAssetState.VisibleToFaction` e' vero, cioe'
`HasIntelOnSpaceAssetLocation`: intel sull'habitat >=
`TIGlobalConfig.intelToSeeSpaceAssetLocationandComposition` (0,1, nessun
override nei template). La stessa soglia sblocca posizione E composizione,
quindi i moduli di un habitat visibile si possono mostrare. Verificato sull'IL
di Assembly-CSharp.dll e sullo schermo del gioco (le basi aliene compaiono).

Controllo missioni: la capacita' e' quella che il gioco registra ogni giorno
nelle `Transactions` («Daily Income»), non la somma delle nazioni: ci sono
anche consiglieri e org. Il consumo e' la somma dei `missionControl` negativi
dei nostri moduli, cantieri compresi.
"""

from . import gamedata
from .factions import _monthly_income
from .names import Namer

INTEL_TO_SEE = 0.1          # TIGlobalConfig.intelToSeeSpaceAssetLocationandComposition
TONS_PER_BOOST = 10         # UI.GeneralControls.BoostDetail: «dieci tonnellate»


def _intel(me):
    return {e["Key"]["value"]: e.get("Value") or 0
            for e in me.get("intel") or []
            if str(e["Key"].get("$type", "")).endswith("TIHabState")}


def _mission_control_capacity(me):
    """Ultima voce giornaliera di Controllo missioni: e' una capacita', il
    gioco la riscrive ogni giorno con il valore corrente."""
    last = None
    for tr in (me.get("Transactions") or {}).get("Daily Income") or []:
        if tr.get("Resource") == "MissionControl":
            last = tr.get("Amount")
    return last


class _Space:
    def __init__(self, g, lang):
        self.g, self.lang = g, lang
        self.namer = Namer(g, lang)
        self.src = self.namer.src
        self.orbits = g.state("TIOrbitState")
        self.sites = g.state("TIHabSiteState")
        self.bodies = g.state("TISpaceBodyState")
        self.habs = g.state("TIHabState")
        self.sectors = g.state("TISectorState")
        self.modules = g.state("TIHabModuleState")
        tpl = gamedata.templates()
        self.module_tpl = tpl["habModules"]
        self.orbit_tpl = tpl["orbits"]

    def loc(self, family, name, raw=None):
        return gamedata.loc(self.lang, family, "displayName", name,
                            raw if raw is not None else name)

    def body(self, body_id):
        b = self.bodies.get(body_id) or {}
        return {"id": b.get("templateName"),
                "name": self.loc("TISpaceBodyTemplate", b.get("templateName"),
                                 b.get("displayName"))}

    def hab_name(self, h):
        # i nomi generati (Hong Bao) non hanno chiave: restano come sono
        return self.namer._tr(h.get("displayName"),
                              ("TIHabTemplate.displayName.%s" % h.get("templateName"),))

    def location(self, h):
        o = self.orbits.get((h.get("orbitState") or {}).get("value"))
        if o:
            return {"kind": "orbit", "id": o.get("templateName"),
                    "name": self.loc("TIOrbitTemplate", o.get("templateName"),
                                     o.get("displayName")),
                    "body": self.body((o.get("barycenter") or {}).get("value"))}
        s = self.sites.get((h.get("habSite") or {}).get("value"))
        if s:
            return {"kind": "site", "id": s.get("templateName"),
                    "name": self.loc("TIHabSiteTemplate", s.get("templateName"),
                                     s.get("displayName")),
                    "body": self.body((s.get("parentBody") or {}).get("value"))}
        return None

    def hab_modules(self, h):
        out = []
        for sref in h.get("sectors") or []:
            sec = self.sectors.get(sref.get("value")) or {}
            for mref in sec.get("habModules") or []:
                m = self.modules.get(mref.get("value")) or {}
                name = m.get("templateName")
                if not name or m.get("destroyed"):
                    continue            # slot vuoto
                t = self.module_tpl.get(name) or {}
                out.append({
                    "id": name,
                    "name": self.loc("TIHabModuleTemplate", name),
                    "core": bool(t.get("coreModule")),
                    "done": bool(m.get("constructionCompleted")),
                    "powered": bool(m.get("powered")),
                    "missionControl": t.get("missionControl") or 0,
                })
        return out

    def hab_view(self, h, mine):
        f = self.g.factions.get((h.get("faction") or {}).get("value")) or {}
        mods = self.hab_modules(h)
        return {
            "id": h.get("ID", {}).get("value"),
            "name": self.hab_name(h),
            "type": h.get("habType"),
            "tier": h.get("tier"),
            "mine": mine,
            "faction": {"name": self.namer.faction(f) or "?",
                        "template": f.get("templateName"),
                        "colors": gamedata.faction_colors(f.get("templateName"))},
            "location": self.location(h),
            "coreDone": bool(h.get("anyCoreCompleted")),
            "modules": mods,
        }


def _res_key(k):
    """`nobleMetals` dei template -> `NobleMetals` di UI.Global."""
    return k[:1].upper() + k[1:]


def _module_offer(s, finished, lang):
    """Moduli che i nostri progetti sbloccano, coi numeri dei template."""
    out = []
    for name, t in s.module_tpl.items():
        req = t.get("requiredProjectName")
        if (req not in finished or t.get("alienModule") or t.get("disable")
                or t.get("destroyed") or t.get("noBuild")):
            continue
        mass = t.get("baseMass_tons") or 0
        income = {k[len("income"):-len("_month")]: v for k, v in t.items()
                  if k.startswith("income") and k.endswith("_month") and v}
        out.append({
            "id": name,
            "name": s.loc("TIHabModuleTemplate", name),
            "core": bool(t.get("coreModule")),
            "habType": t.get("habType") or "Any",
            "tier": t.get("tier"),
            "mass": mass,
            "boost": round(mass / TONS_PER_BOOST, 2),
            "days": t.get("buildTime_Days"),
            "power": t.get("power") or 0,
            "missionControl": t.get("missionControl") or 0,
            "crew": t.get("crew") or 0,
            "upkeep": [dict(gamedata.resource_view(lang, _res_key(k)), amount=v)
                       for k, v in (t.get("supportMaterials_month") or {}).items() if v],
            "income": [dict(gamedata.resource_view(lang, k), amount=v)
                       for k, v in income.items()],
            "techBonuses": t.get("techBonuses") or [],
        })
    out.sort(key=lambda m: (not m["core"], m["tier"] or 0, m["name"]))
    return out


def overview(g, lang="ita"):
    s = _Space(g, lang)
    me = g.me
    my_id = me.get("ID", {}).get("value")
    intel = _intel(me)

    habs, earth_id = [], None
    for bid, b in s.bodies.items():
        if b.get("templateName") == "Earth":
            earth_id = bid
    by_orbit = {}
    for hid, h in s.habs.items():
        if not h.get("exists", True) or h.get("archived"):
            continue
        mine = (h.get("faction") or {}).get("value") == my_id
        if not mine and intel.get(hid, 0) + 1e-6 < INTEL_TO_SEE:
            continue
        v = s.hab_view(h, mine)
        habs.append(v)
        loc = v["location"]
        if loc and loc["kind"] == "orbit":
            by_orbit.setdefault(loc["id"], []).append(v)
    habs.sort(key=lambda v: (not v["mine"],
                             (v["location"] or {}).get("body", {}).get("id") != "Earth",
                             v["faction"]["name"], v["name"]))

    orbits = []
    for oid, o in s.orbits.items():
        if (o.get("barycenter") or {}).get("value") != earth_id:
            continue
        name = o.get("templateName")
        t = s.orbit_tpl.get(name) or {}
        here = by_orbit.get(name, [])
        orbits.append({
            "id": name,
            "name": s.loc("TIOrbitTemplate", name, o.get("displayName")),
            "altitude": t.get("altitude_km"),
            "synchronous": bool(t.get("synch")),
            "capacity": t.get("stationCapacity"),
            "interface": bool(t.get("interfaceOrbit")),
            "irradiated": t.get("irradiatedMultiplier") or 1,
            "used": len(here) + (o.get("pendingHabs") or 0),
            "habs": [{"name": h["name"], "faction": h["faction"]["name"],
                      "colors": h["faction"]["colors"], "mine": h["mine"],
                      "coreDone": h["coreDone"]} for h in here],
        })
    orbits.sort(key=lambda o: (o["altitude"] is None, o["altitude"] or 0))

    res = me.get("resources") or {}
    income = _monthly_income(g, me)
    finished = set(me.get("finishedProjectNames") or [])
    used_mc = sum(-m["missionControl"] for h in habs if h["mine"]
                  for m in h["modules"] if m["missionControl"] < 0)
    return {
        "intelToSee": INTEL_TO_SEE,
        "tonsPerBoost": TONS_PER_BOOST,
        "resources": {
            "boost": dict(gamedata.resource_view(lang, "Boost"),
                          stock=round(res.get("Boost", 0), 2),
                          monthly=round(income.get("Boost", 0), 2)),
            "missionControl": dict(gamedata.resource_view(lang, "MissionControl"),
                                   capacity=_mission_control_capacity(me),
                                   used=used_mc),
            "money": dict(gamedata.resource_view(lang, "Money"),
                          stock=round(res.get("Money", 0), 1),
                          monthly=round(income.get("Money", 0), 1)),
        },
        "habs": habs,
        "earthOrbits": orbits,
        "modules": _module_offer(s, finished, lang),
    }
