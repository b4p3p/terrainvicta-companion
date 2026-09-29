"""Scegli tecnologia: le tecnologie globali che si possono avviare adesso, con
quello che sblocca ognuna per la TUA fazione, una accanto all'altra.

E' la colonna di destra della schermata «Seleziona tecnologia per la ricerca»
del gioco (TIGenericTechTemplate.UnlockableTechString e PrereqForStr_Archive),
per tutte le tecnologie insieme e con l'effetto dei progetti in chiaro, che il
gioco mostra solo aprendo gli archivi uno per uno.

Regole lette dal codice del gioco (TIFactionState / TIProjectTemplate):

- **Disponibilita'** (la percentuale del gioco, GetProjectUnlockChance):
  100 se il progetto e' `factionAlways` della fazione o `factionAvailableChance`
  >= 100; altrimenti max(c, c * 7 / fazioni umane) + effetti ProjectUnlockChance
  + tratti «Innovativo» dei consiglieri + Scienza totale del consiglio / 5.
  E' UN tiro solo, quando i prerequisiti sono completi: chi lo perde finisce
  nei `missedProjects`.
- Nel tiro vero (RollToAddProjectTrigger) si aggiunge anche la quota di
  ricerca che la fazione ha messo nella tecnologia prerequisito, x100: chi ne
  ha pagato il 30% ha +30. La finestra del gioco la somma senza x100, cioe'
  quasi zero: la percentuale mostrata e' il minimo, non il valore del tiro.
- **Comparsa**: vinto il tiro, ogni mese il progetto compare con probabilita'
  pari al valore del «trigger» (TIFactionState.DailyProjectTriggerCheck, un
  tiro al giorno equivalente). Il valore parte da `initialUnlockChance` + quota
  x100 + Scienza/5 e cresce ogni mese di `deltaUnlockChance` x (1 + velocita'
  della ricerca della partita), fino a `maxUnlockChance`.

I mesi attesi sono una stima NOSTRA dalle regole sopra, con quota zero: il
caso peggiore.
"""

import re

from . import council, gamedata

NS = "PavonisInteractive.TerraInvicta."

# temi per filtrare, dai `contexts` degli effetti e dalle risorse concesse:
# (tema, prefissi dei contesti)
THEMES = [
    ("cpCap", ("ControlPointMaintenance",)),
    ("influence", ("Influence", "DirectInvestGlobalDiscount_Influence")),
    ("money", ("Money",)),
    ("ops", ("Operations", "Ops")),
    ("research", ("Research", "ControlPointResearch", "KnowledgePriority")),
    ("orgs", ("Org", "MaxAvailableOrgs")),
    ("councilors", ("AllRecruitTraits", "Councilor", "Recruit")),
    ("missions", ("Mission_",)),
    ("nations", ("Priority", "Bilateral", "Unrest", "Cohesion", "Army", "Spaceflight")),
    ("space", ("Hab", "Ship", "Drive", "Boost", "MissionControl", "Mining")),
]
RESOURCE_THEME = {"Influence": "influence", "Money": "money", "Operations": "ops",
                  "Research": "research", "Boost": "space", "MissionControl": "space"}

_COMMENT = re.compile(r"\s*//.*$")
_TAG = re.compile(r"<[^>]+>")
_ARG = re.compile(r"\{(\d+)\}")


def _pct(v):
    return "%d%%" % round(v * 100)


def _num(v):
    return ("%d" % v) if float(v).is_integer() else ("%.2f" % v).rstrip("0").rstrip(".")


def _data_name(lang, name):
    """Nome di un template qualunque (TemplateManager.Find<TIDataTemplate>)."""
    if not name:
        return ""
    s = gamedata.strings(lang)
    for fam in ("TITraitTemplate", "TIOrgTemplate", "TIMissionTemplate",
                "TIProjectTemplate", "TITechTemplate", "TIHabModuleTemplate"):
        v = s.get("%s.displayName.%s" % (fam, name))
        if v:
            return v.split("\t")[0].strip()
    return name


def effect_text(lang, name):
    """Descrizione di un effetto coi segnaposto riempiti come fa il gioco in
    TIEffectTemplate.allDescription (senza bersaglio: «tutte le nazioni»)."""
    e = gamedata.templates()["effects"].get(name) or {}
    raw = gamedata.strings(lang).get("TIEffectTemplate.description." + name)
    if not raw:
        return None
    v = float(e.get("value") or 0)
    sv = e.get("strValue")
    args = {
        0: _num(v), 3: _pct(v), 4: _pct(1 - v), 7: _num(e.get("duration_months") or 0),
        8: _pct(v - 1), 13: _data_name(lang, sv), 18: _pct(1 / v - 1) if v else "",
        19: _num(-v), 20: sv or "", 23: _num(v), 24: _num(v), 25: _pct(abs(v)),
        27: _pct(1 - 1 / v) if v else "", 28: "%+d%%" % round((v - 1) * 100),
        29: "%+d%%" % round(v * 100),
    }
    text = _COMMENT.sub("", raw.split("\t")[0] if "\t//" in raw else raw)
    text = _ARG.sub(lambda m: args.get(int(m.group(1)), ""), text)
    text = _TAG.sub("", text).strip()
    return text[1:].strip() if text.startswith("-") else text


def _themes(effects, grants):
    tpl = gamedata.templates()["effects"]
    out = set()
    for name in effects:
        for ctx in (tpl.get(name) or {}).get("contexts") or []:
            for theme, prefixes in THEMES:
                if any(p in ctx for p in prefixes):
                    out.add(theme)
    for r in grants:
        if r.get("resource") in RESOURCE_THEME:
            out.add(RESOURCE_THEME[r["resource"]])
    return sorted(out)


class _Ctx:
    """Quello che serve a valutare i progetti per la fazione del giocatore."""

    def __init__(self, g, lang):
        self.g, self.lang = g, lang
        self.me = g.me.get("templateName")
        st = next(iter(g.state("TIGlobalResearchState").values()), {})
        self.done_techs = set(st.get("finishedTechsNames") or [])
        self.one_time = set(st.get("finishedOneTimeOnlyProjectNames") or [])
        self.in_progress = [tp.get("techTemplateName") for tp in st.get("techProgress") or []]
        self.done_projects = set(g.me.get("finishedProjectNames") or [])
        self.available = set(g.me.get("availableProjectNames") or [])
        self.triggered = {t.get("projectTemplateName") for t in g.me.get("activeProjectTriggers") or []}
        self.missed = set(g.me.get("missedProjects") or [])
        self.milestones = set(g.me.get("milestones") or [])
        self.objectives = {k for k, v in (g.me.get("objectiveNames") or {}).items() if v == "Completed"}
        self.contrib = g.me.get("techNameContributionHistory") or {}
        # progetti una tantum gia' fatti da qualcuno (UniquenessReqsSatisfied)
        self.someone_did = set(self.one_time)
        for f in g.factions.values():
            self.someone_did |= set(f.get("finishedProjectNames") or []) if f is not g.me else set()
        gv = next(iter(g.state("TIGlobalValuesState").values()), {})
        sc = gv.get("scenarioCustomizations") or {}
        self.variable = sc.get("variableProjectUnlocks", True)
        self.speed = sc.get("researchSpeedMultiplier") or 1.0
        self.humans = sum(1 for f in g.factions.values()
                          if f.get("templateName") and f.get("templateName") != "AlienCouncil")
        # Scienza totale del consiglio (GetTotalStat, org comprese) e tratti
        # con specialTraitRule ProjectUnlockChance («Innovativo»)
        traits = gamedata.templates()["traits"]
        self.science, self.trait_bonus = 0, 0
        for c in g.my_councilors():
            self.science += council.councilor_view(g, c, lang)["attributes"].get("Science", 0)
            for t in c.get("traitTemplateNames") or []:
                tt = traits.get(t) or {}
                if tt.get("specialTraitRule") == "ProjectUnlockChance":
                    self.trait_bonus += tt.get("specialTraitRuleValue") or 0
        fx = next(iter(g.state("TIEffectsState").values()), {})
        mine = next((e.get("Value") or {} for e in fx.get("factionEffectsNames") or []
                     if (e.get("Key") or {}).get("value") == (g.me.get("ID") or {}).get("value")), {})
        etpl = gamedata.templates()["effects"]
        self.effect_bonus = sum((etpl.get(n) or {}).get("value") or 0
                                for n in mine.get("ProjectUnlockChance") or [])

    def finished(self, name):
        return name in self.done_techs or name in self.done_projects or name in self.one_time

    def name(self, x):
        if x in gamedata.templates()["techs"]:
            return gamedata.tech_name(self.lang, x)
        return gamedata.project_name(self.lang, x)

    def missing(self, p, assume):
        """Prerequisiti mancanti di `p` supponendo finita la tecnologia `assume`
        (TechPrereqsSatisfied: il primo e il secondo hanno un'alternativa)."""
        out = []
        for i, x in enumerate([x for x in (p.get("prereqs") or []) if x]):
            if x == assume or self.finished(x):
                continue
            alt = p.get("altPrereq%d" % i)
            if alt and (alt == assume or self.finished(alt)):
                continue
            out.append(x)
        return out

    def visible(self, name, p):
        """ShouldHide del gioco: altre fazioni, xenologia non ancora scoperta,
        obiettivi e traguardi non raggiunti. Restano fuori come nel gioco."""
        if name in self.done_projects:
            return False                       # gia' fatto: non si sceglie piu'
        fp = [x for x in (p.get("factionPrereq") or []) if x]
        if fp and self.me not in fp:
            return False
        if p.get("techCategory") == "Xenology" and name not in self.available:
            return False
        if p.get("requiredObjectiveName") and not (
                p["requiredObjectiveName"] in self.objectives
                or p.get("altRequiredObjectiveName") in self.objectives):
            return False
        ms = p.get("requiredMilestone")
        if ms and ms != "None" and ms not in self.milestones:
            return False
        if p.get("oneTimeGlobally") and name in self.someone_did:
            return False
        return True

    def chance(self, p):
        """La percentuale del gioco (GetProjectUnlockChance col bonus mostrato),
        con le parti che la compongono."""
        if p.get("factionAlways") == self.me:
            return 100.0, {"reason": "always"}
        if not self.variable:
            return 100.0, {"reason": "fixed"}
        c = p.get("factionAvailableChance") or 0
        if c >= 100:
            return 100.0, {"reason": "template"}
        base = max(c, c * 7 / max(self.humans, 1))
        parts = {"template": c, "base": round(base, 1),
                 "science": round(self.science / 5, 1),
                 "traits": max(0, self.trait_bonus), "effects": max(0, self.effect_bonus)}
        v = base + self.science / 5 + parts["traits"] + parts["effects"]
        return max(0.0, min(100.0, v)), parts

    def months(self, p):
        """Mesi attesi prima che compaia, vinto il tiro (quota zero). Stima."""
        start = (p.get("initialUnlockChance") or 0) + self.science / 5
        step = (p.get("deltaUnlockChance") or 0) * (1 + self.speed)
        top = p.get("maxUnlockChance") or 100
        v, alive, exp = max(start, 0), 1.0, 0.0
        for m in range(1, 121):
            q = min(max(v, 0), 100) / 100
            exp += alive * q * m
            alive *= 1 - q
            if alive < 1e-4:
                break
            v = min(v + step, top) if v < top else v
        return round(exp + alive * 120, 1), {"start": round(start, 1), "step": round(step, 1),
                                             "max": top}


def _project(ctx, name, p, assume):
    grants = [{"resource": r.get("resource"), "value": r.get("value"),
               "name": gamedata.resource_name(ctx.lang, r.get("resource"))}
              for r in p.get("resourcesGranted") or [] if r.get("value")]
    effects = [e for e in p.get("effects") or [] if e]
    months, trig = ctx.months(p)
    chance, parts = ctx.chance(p)
    summary = gamedata.loc(ctx.lang, "TIProjectTemplate", "summary", name, "").strip()
    # i componenti hanno come sommario un segnaposto: «<shipmodule>», «<habmodule>»
    part = {"<shipmodule>": "ship", "<habmodule>": "hab"}.get(summary)
    fp = [x for x in (p.get("factionPrereq") or []) if x]
    return {
        "id": name,
        "name": gamedata.project_name(ctx.lang, name),
        "summary": "" if part else summary,
        "part": part,
        "cost": p.get("researchCost") or 0,
        "effects": [t for t in (effect_text(ctx.lang, e) for e in effects) if t],
        "grants": grants,
        "org": bool(p.get("orgGranted")),
        "themes": sorted(set(_themes(effects, grants)) | ({"space"} if part else set())),
        # solo tua (factionPrereq = te solo) o garantita alla tua fazione
        "exclusive": fp == [ctx.me],
        "always": p.get("factionAlways") == ctx.me,
        "chance": round(chance, 1),
        "chanceParts": parts,
        "months": months,
        "trigger": trig,
        "missing": [{"id": x, "name": ctx.name(x)} for x in ctx.missing(p, assume)],
        "missed": name in ctx.missed,
        "oneTime": bool(p.get("oneTimeGlobally")),
    }


def overview(g, lang="ita"):
    ctx = _Ctx(g, lang)
    T = gamedata.templates()["techs"]
    P = gamedata.templates()["projects"]
    out = []
    for name, t in T.items():
        if name in ctx.done_techs or name in ctx.in_progress or t.get("endGameTech") \
                or name.startswith("FutureTech"):
            continue
        if any(not ctx.finished(x) for x in (t.get("prereqs") or []) if x):
            continue
        now, later = [], []
        for pn, p in P.items():
            pre = [x for x in (p.get("prereqs") or []) if x]
            if name not in pre and p.get("altPrereq0") != name and p.get("altPrereq1") != name:
                continue
            if not ctx.visible(pn, p):
                continue
            v = _project(ctx, pn, p, name)
            (later if v["missing"] else now).append(v)
        opens = []
        for m, u in T.items():
            pre = [x for x in (u.get("prereqs") or []) if x]
            if name in pre:
                miss = [x for x in pre if x != name and not ctx.finished(x)]
                opens.append({"id": m, "name": gamedata.tech_name(lang, m),
                              "missing": [{"id": x, "name": ctx.name(x)} for x in miss]})
        effects = [e for e in t.get("effects") or [] if e]
        themes = set(_themes(effects, []))
        for pr in now:
            themes |= set(pr["themes"])
        cat = t.get("techCategory")
        out.append({
            "id": name,
            "name": gamedata.tech_name(lang, name),
            "summary": gamedata.loc(lang, "TITechTemplate", "summary", name, ""),
            "category": cat,
            "categoryName": gamedata.strings(lang).get("UI.Science.Category.%s" % cat, cat),
            "cost": t.get("researchCost") or 0,
            "effects": [x for x in (effect_text(lang, e) for e in effects) if x],
            "now": sorted(now, key=lambda x: (-x["chance"], x["cost"])),
            "later": sorted(later, key=lambda x: (len(x["missing"]), x["cost"])),
            "opens": sorted(opens, key=lambda x: (len(x["missing"]), x["name"])),
            "themes": sorted(themes),
        })
    out.sort(key=lambda x: (x["category"] or "", x["cost"]))
    return {
        "techs": out,
        "projects": available_projects(g, lang),
        "inProgress": [{"id": x, "name": gamedata.tech_name(lang, x)} for x in ctx.in_progress if x],
        "rules": {"science": ctx.science, "scienceBonus": round(ctx.science / 5, 1),
                  "humanFactions": ctx.humans, "traitBonus": ctx.trait_bonus,
                  "effectBonus": ctx.effect_bonus, "speed": ctx.speed},
    }


_XN = re.compile(r"\s*x\d+$")


def _unlocks(lang, name):
    """Componenti sbloccati, per famiglia, coi nomi del gioco. Le varianti
    «x1…x6» dello stesso motore diventano una voce sola."""
    by = {}
    for fam, dn in gamedata.templates()["projectUnlocks"].get(name) or []:
        n = gamedata.loc(lang, "TI%sTemplate" % fam, "displayName", dn, dn)
        n = _XN.sub("", n.split("\t")[0].strip())
        if n not in by.setdefault(fam, []):
            by[fam].append(n)
    return [{"family": f, "names": v} for f, v in by.items()]


def available_projects(g, lang="ita"):
    """Scegli progetto: quelli che la fazione puo' avviare adesso
    (`availableProjectNames`), con effetti, componenti sbloccati, cio' che
    aprono e il tempo alla quota di ricerca di uno slot progetto.

    Il tempo e' una stima NOSTRA: costo che manca / (ricerca del mese x quota
    dello slot). Per un progetto fermo la quota e' la sua; per uno da avviare,
    la piu' alta fra gli slot progetto col peso, cioe' dove lo metteresti."""
    from . import model
    P = gamedata.templates()["projects"]
    T = gamedata.templates()["techs"]
    proj = model.projects(g, lang)
    rate = proj["rate"]
    slot_shares = [s["share"] for s in model.research(g, lang)["slots"]
                   if s["kind"] == "project" and s.get("share")]
    best = max(slot_shares) if slot_shares else None
    # «segna come obsoleto» nella schermata dei progetti del gioco
    hidden = set(g.me.get("hiddenProjects") or [])
    out = []
    for it in proj["items"]:
        name = it["id"]
        p = P.get(name) or {}
        effects = [e for e in p.get("effects") or [] if e]
        grants = [{"resource": r.get("resource"), "value": r.get("value"),
                   "name": gamedata.resource_name(lang, r.get("resource"))}
                  for r in p.get("resourcesGranted") or [] if r.get("resource")]
        summary = gamedata.loc(lang, "TIProjectTemplate", "summary", name, "")
        unlocks = _unlocks(lang, name)
        opens = [{"id": m, "name": gamedata.tech_name(lang, m) if m in T else gamedata.project_name(lang, m),
                  "kind": "tech" if m in T else "project"}
                 for fam in (T, P) for m, u in fam.items()
                 if name in [x for x in (u.get("prereqs") or []) if x]
                 or name in (u.get("altPrereq0"), u.get("altPrereq1"))]
        share = it["share"] if it["active"] else best
        left = max(0, it["cost"] - it["accumulated"])
        out.append({
            "id": name,
            "name": it["name"],
            "summary": "" if summary.startswith("<") else _TAG.sub("", summary).strip(),
            "cost": it["cost"],
            "effects": [t for t in (effect_text(lang, e) for e in effects) if t],
            "grants": grants,
            "unlocks": unlocks,
            "opens": opens,
            "themes": sorted(set(_themes(effects, grants)) | ({"space"} if unlocks else set())),
            "repeatable": it["repeatable"],
            "obsolete": name in hidden,
            "active": it["active"],
            "slot": it["slot"],
            "accumulated": it["accumulated"],
            "share": share,
            "months": round(left / (rate * share), 1) if rate and share else None,
        })
    out.sort(key=lambda x: (x["obsolete"], not x["active"], x["cost"]))
    return {"items": out, "rate": rate, "share": best}
