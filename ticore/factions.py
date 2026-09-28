"""Confronto fra le fazioni, entro quello che l'intel del giocatore consente.

Il salvataggio contiene tutto di tutti: la regola e' mostrare solo quello che
la scheda Fazioni del gioco mostra. Le soglie non sono nostre, sono di
`TIGlobalConfig` (nessun override nei template JSON), e ogni campo usa la
stessa misura del gioco: `FactionView` confronta con l'intel ATTUALE
(`GetIntel`) le risorse, gli obiettivi in corso e le org non assegnate, e
col MASSIMO mai raggiunto (`GetHighestIntel`) i progetti. Verificato
sull'IL di Assembly-CSharp.dll.

L'intel cala: quello che si sapeva e non si sa piu' resta nascosto dove il
gioco lo nasconde, e visibile dove il gioco lo lascia visibile.
"""

from . import gamedata
from .names import Namer

# campo -> (soglia, misura). Valori di TIGlobalConfig.intelToSeeFaction*.
GATES = {
    "resources": (0.25, "intel"),         # FactionView.GetResourceString
    "unassignedOrgs": (0.25, "intel"),    # FactionView.knownUnassignedOrgsPool
    "objectives": (0.50, "intel"),        # FactionView.GetObjectives
    "projects": (0.75, "highest"),        # FactionView.availableProjects & co.
}

# Controllo missioni e Progetti sono capacita', non entrate: restano fuori
RESOURCES = ["Money", "Influence", "Operations", "Boost", "Research"]


def _monthly_income(g, f):
    """Entrate correnti dell'ultimo mese chiuso, dalle `Transactions`.

    Non si usa `cachedYearlyRevenue`: per la fazione del giocatore e' vuota.
    Le voci «Daily Income» del mese scorso invece tornano con quello che il
    gioco mostra (Ricerca 71,2 contro 71 nell'header, 22/03/2026)."""
    y, m, _ = g.game_date()
    m -= 1
    if m < 1:
        y, m = y - 1, 12
    out = {}
    for tr in (f.get("Transactions") or {}).get("Daily Income") or []:
        d = tr.get("Date") or {}
        if d.get("year") == y and d.get("month") == m:
            out[tr["Resource"]] = out.get(tr["Resource"], 0) + tr["Amount"]
    return out


def _intel_map(me, field):
    out = {}
    for e in me.get(field) or []:
        key = e.get("Key") or {}
        if str(key.get("$type", "")).endswith("TIFactionState"):
            out[key.get("value")] = e.get("Value") or 0
    return out


def _objective_name(lang, name, template):
    s = gamedata.strings(lang)
    en = gamedata.strings("en")
    for key in ("TIObjectiveTemplate.displayName.%s.%s" % (name, template),
                "TIObjectiveTemplate.displayName.%s" % name):
        if key in s:
            return s[key]
        if key in en:
            return en[key]
    return name


def _view(g, f, lang, level, highest, mine):
    """Una fazione, con i soli campi che il livello di intel sblocca."""
    template = f.get("templateName") or ""

    def seen(field):
        need, measure = GATES[field]
        have = highest if measure == "highest" else level
        return mine or have + 1e-6 >= need

    out = {
        "id": f.get("ID", {}).get("value"),
        "name": Namer(g, lang).faction(f) or "?",
        "template": template,
        "colors": gamedata.faction_colors(template),
        "mine": mine,
        "intel": 1.0 if mine else round(level, 2),
        "highest": 1.0 if mine else round(highest, 2),
        "locked": {k: {"need": v[0], "measure": v[1]} for k, v in GATES.items()
                   if not seen(k)},
    }
    if seen("resources"):
        res = f.get("resources") or {}
        income = _monthly_income(g, f)
        out["resources"] = [dict(gamedata.resource_view(lang, k),
                                 stock=round(res.get(k, 0), 1),
                                 monthly=round(income.get(k, 0), 1))
                            for k in RESOURCES]
    if seen("unassignedOrgs"):
        out["unassignedOrgs"] = len(f.get("unassignedOrgs") or [])
    if seen("objectives"):
        # il gioco elenca solo quelli sbloccati o completati: i Locked non si
        # vedono nemmeno per la propria fazione
        out["objectives"] = [{"id": k, "status": v,
                              "name": _objective_name(lang, k, template)}
                             for k, v in (f.get("objectiveNames") or {}).items()
                             if v in ("Unlocked", "Completed")]
    if seen("projects"):
        out["projects"] = {
            "finished": len(f.get("finishedProjectNames") or []),
            "current": [{"name": gamedata.project_name(lang, p.get("projectTemplateName")),
                         "accumulated": round(p.get("accumulatedResearch") or 0, 1),
                         "cost": (gamedata.templates()["projects"]
                                  .get(p.get("projectTemplateName")) or {}).get("researchCost")}
                        for p in f.get("currentProjectProgress") or []
                        if not p.get("completed")],
        }
    return out


# -- relazioni fra fazioni ----------------------------------------------------
#
# Come la griglia delle relazioni della schermata Intelligence
# (`IntelFactionRelationsGridItemController.SetListItem`), dal punto di vista
# di chi giudica:
#   Supporto      alleati permanenti (solo alieni e loro alleato: non noi);
#   Guerra        chi giudica ha un obiettivo `WarOnFaction` contro l'altra;
#   In conflitto  odio (`factionHate`) > 0;
#   Tolleranza    odio = 0.
# Accanto, i trattati: tregua e patto di non aggressione sono obiettivi di una
# delle due fazioni verso l'altra con importanza > 0 (`HasTruce`/`HasNAP`), la
# condivisione dell'intelligence e' `intelSharingFactions`.

ATTITUDE_KEYS = {"war": "UI.Intel.FactionWar", "conflict": "UI.Intel.FactionHate10",
                 "tolerance": "UI.Intel.FactionHate0"}
TREATY_KEYS = {"truce": "UI.Notifications.Diplomacy.Truce",
               "nap": "UI.Notifications.Diplomacy.NAP",
               "intelSharing": "UI.Notifications.Diplomacy.IntelSharing"}
_GOALS = {"war": "FactionGoal_WarOnFaction", "truce": "FactionGoal_TruceWithFaction",
          "nap": "FactionGoal_NonAggressionPact"}


def _goal_pairs(g):
    out = {}
    for kind, state in _GOALS.items():
        pairs = set()
        for v in g.state(state).values():
            if kind != "war" and not (v.get("importance") or 0) > 0:
                continue
            a = (v.get("faction") or {}).get("value")
            b = (v.get("targetFaction") or {}).get("value")
            if a and b:
                pairs.add((a, b))
        out[kind] = pairs
    return out


def _hate(f, other_id):
    for e in f.get("factionHate") or []:
        if (e.get("Key") or {}).get("value") == other_id:
            return e.get("Value") or 0
    return 0


def _attitude(g, a, b, goals, lang):
    aid, bid = a["ID"]["value"], b["ID"]["value"]
    if (aid, bid) in goals["war"]:
        kind = "war"
    elif _hate(a, bid) > 0:
        kind = "conflict"
    else:
        kind = "tolerance"
    return {"id": kind, "label": _ui(lang, ATTITUDE_KEYS[kind], kind)}


def _ui(lang, key, fallback):
    return gamedata.strings(lang).get(key) or gamedata.strings("en").get(key) or fallback


def relation(g, other, lang="ita", goals=None):
    """Come ci vede `other`, come lo vediamo noi, e i trattati fra noi."""
    goals = goals if goals is not None else _goal_pairs(g)
    me, mid, oid = g.me, g.me["ID"]["value"], other["ID"]["value"]
    treaties = []
    for kind in ("truce", "nap"):
        if (mid, oid) in goals[kind] or (oid, mid) in goals[kind]:
            treaties.append(kind)
    if any((x.get("value") if isinstance(x, dict) else x) == oid
           for x in me.get("intelSharingFactions") or []):
        treaties.append("intelSharing")
    return {
        "theirs": _attitude(g, other, me, goals, lang),
        "mine": _attitude(g, me, other, goals, lang),
        "treaties": [{"id": k, "label": _ui(lang, TREATY_KEYS[k], k)} for k in treaties],
    }


def compare(g, lang="ita"):
    """La nostra fazione e quelle che conosciamo, nell'ordine del gioco.

    Una fazione compare coi suoi dati solo se l'abbiamo incontrata:
    `highestIntel` > 0. Le altre sono segnaposto senza identita'.
    """
    now = _intel_map(g.me, "intel")
    top = _intel_map(g.me, "highestIntel")
    out = [_view(g, g.me, lang, 1.0, 1.0, True)]
    goals = _goal_pairs(g)
    unknown = 0
    for fid, f in g.factions.items():
        if f is g.me or f.get("defeated"):
            continue
        highest = top.get(fid, 0)
        if highest <= 0:
            unknown += 1
            continue
        v = _view(g, f, lang, now.get(fid, 0), highest, False)
        v["relation"] = relation(g, f, lang, goals)
        out.append(v)
    # Le mai contattate diventano segnaposto anonimi: si sa che esistono (il
    # consiglio e' di otto, lo dice la schermata iniziale del gioco) ma non
    # chi sono. Niente nome, colore o id: nemmeno l'API li espone.
    out += [{"id": "unknown-%d" % i, "unknown": True} for i in range(unknown)]
    return {"gates": {k: {"need": v[0], "measure": v[1]} for k, v in GATES.items()},
            "factions": out}


# -- consiglieri delle altre fazioni ------------------------------------------
#
# Le regole di `CouncilorView` e `TIFactionState` (IL), soglia per soglia:
#   0,10  intelToSeeNeutralPawn: si sa DOVE e' (CurrentKnownCouncilors vuole una
#         posizione), ma non chi e' ne' per chi lavora;
#   0,25  intelToSeeCouncilorBasicData: nome, fazione, tipo, eta', citta', e i
#         soli tratti `easilyVisible`. Col MASSIMO raggiunto (memoria) restano
#         nome, fazione e tipo, e gli attributi diventano la stima del gioco
#         dal tipo: base + casuale/2 (`EstimateAttributeFromJob`). La memoria
#         non e' per sempre: il gioco puo' togliere il consigliere anche da
#         `highestIntel` (Hanyi Shu, 0,47 il 16/09/2026, sparito il 24/09);
#   0,50  intelToSeeCouncilorDetails: attributi veri, tutti i tratti, le org;
#   0,75  intelToSeeCouncilorMission: la missione in corso, ma non durante la
#         fase delle missioni (`InMissionPhase` -> null), quando anche la
#         posizione e' quella di prima della fase;
#   1,00  intelToSeeCouncilorSecrets: la lealta' vera. Qui non si usa: resta
#         l'apparente, come per i nostri.

COUNCILOR_GATES = {"location": 0.10, "basic": 0.25, "details": 0.50,
                   "mission": 0.75}


def _intel_on(me, field, suffix):
    return {e["Key"]["value"]: e.get("Value") or 0
            for e in me.get(field) or []
            if str(e["Key"].get("$type", "")).endswith(suffix)}


def _estimate(ctype, attrs):
    """`EstimateAttributeFromJob`: base del tipo + meta' della parte casuale.
    Vale anche per la lealta' (apparente e vera usano entrambe `Loyalty`)."""
    t = gamedata.templates()["councilorTypes"].get(ctype) or {}
    return {a: (t.get("base" + a) or 0) + (t.get("rand" + a) or 0) // 2 for a in attrs}


def _place(g, nm, ref_id):
    """Regione, habitat o flotta: il nome che il gioco mostrerebbe."""
    label = nm.region_label(ref_id)
    if label:
        return label
    for st in ("TIHabState", "TISpaceFleetState"):
        x = g.state(st).get(ref_id)
        if x:
            return x.get("displayName")
    return None


def _target_name(g, nm, ref_id):
    for table, fn in ((g.nations, nm.nation), (g.regions, nm.region),
                      (g.factions, nm.faction), (g.orgs, nm.org),
                      (g.councilors, lambda c: c.get("displayName")),
                      (g.cps, nm.control_point)):
        if ref_id in table:
            return fn(table[ref_id])
    return None


def councilors(g, lang="ita"):
    """Consiglieri delle altre fazioni che il gioco ci lascia vedere, piu' i
    nostri come riferimento. Stessi campi del dossier di intelligence."""
    from . import council
    nm = Namer(g, lang)
    now = _intel_on(g.me, "intel", "TICouncilorState")
    top = _intel_on(g.me, "highestIntel", "TICouncilorState")
    my_id = (g.me.get("ID") or {}).get("value")
    mission_phase = any(v.get("phaseActive") for v in g.state("TIMissionPhaseState").values())
    missions = g.state("TIMissionState")

    rows = []
    for c in g.my_councilors():
        v = council.councilor_view(g, c, lang, known=False)
        rows.append({
            "id": v["id"], "mine": True, "identified": True, "level": "mine",
            "intel": 1.0, "highest": 1.0,
            "faction": _faction_ref(g, nm, g.me),
            "name": v["name"], "typeName": v["typeName"], "age": v["age"],
            "nationality": v["nationality"], "location": v["location"],
            "attributes": v["attributes"], "estimated": False,
            "apparentLoyalty": v["apparentLoyalty"],
            "traits": [t["name"] for t in v["traits"]],
            "orgs": [o["name"] for o in v["orgs"]],
            "mission": _mission(g, nm, c, missions, lang),
        })

    anon = []
    for fid, f in g.factions.items():
        if fid == my_id:
            continue
        for ref in f.get("councilors") or []:
            c = g.councilors.get(ref.get("value"))
            if not c or c.get("status") not in ("Active", "Detained"):
                continue
            cid = ref["value"]
            i, h = now.get(cid, 0) + 1e-6, top.get(cid, 0) + 1e-6
            located = i >= COUNCILOR_GATES["location"]
            basic_now = i >= COUNCILOR_GATES["basic"]
            basic_mem = h >= COUNCILOR_GATES["basic"]
            details = i >= COUNCILOR_GATES["details"]
            if not located and not basic_mem:
                continue            # il gioco non lo mostra da nessuna parte
            loc_ref = (c.get("preMissionPhaseLocation") if mission_phase
                       else c.get("location")) or {}
            row = {
                "mine": False, "identified": basic_mem,
                "intel": round(now.get(cid, 0), 2), "highest": round(top.get(cid, 0), 2),
                "level": ("mission" if i >= COUNCILOR_GATES["mission"] else
                          "details" if details else "basic" if basic_now else
                          "memory" if basic_mem else "location"),
                "location": _place(g, nm, loc_ref.get("value")) if located else None,
            }
            if not basic_mem:
                anon.append(row)
                continue
            view = council.councilor_view(g, c, lang, known=False)
            ctype = c.get("typeTemplateName")
            row.update({
                "id": cid,
                "faction": _faction_ref(g, nm, f),
                "name": c.get("displayName"),
                "typeName": gamedata.councilor_type_name(lang, ctype),
            })
            if basic_now:
                row["age"] = view["age"]
                row["nationality"] = view["nationality"]
            if details:
                row["attributes"] = view["attributes"]
                row["estimated"] = False
                row["apparentLoyalty"] = view["apparentLoyalty"]
                row["traits"] = [t["name"] for t in view["traits"]]
                row["orgs"] = [o["name"] for o in view["orgs"]]
            else:
                from .council import ATTRS
                row["attributes"] = _estimate(ctype, ATTRS)
                row["estimated"] = True
                row["apparentLoyalty"] = _estimate(ctype, ["Loyalty"])["Loyalty"]
                if basic_now:
                    tpl = gamedata.templates()["traits"]
                    row["traits"] = [gamedata.trait_name(lang, t)
                                     for t in c.get("traitTemplateNames") or []
                                     if (tpl.get(t) or {}).get("easilyVisible")]
            if i >= COUNCILOR_GATES["mission"]:
                row["mission"] = (None if mission_phase
                                  else _mission(g, nm, c, missions, lang))
                row["missionHidden"] = mission_phase
            rows.append(row)
    # Non identificati: si sa dove sono, non per chi lavorano. Ne' id veri ne'
    # l'ordine delle fazioni, che raggrupperebbe quelli della stessa: si
    # ordinano per posizione e si numerano dopo.
    anon.sort(key=lambda r: r["location"] or "")
    for n, r in enumerate(anon, 1):
        r["id"] = "unknown-%d" % n
    rows += anon
    return {"gates": COUNCILOR_GATES, "missionPhase": mission_phase,
            "councilors": rows}


def _faction_ref(g, nm, f):
    return {"name": nm.faction(f) or "?", "template": f.get("templateName"),
            "colors": gamedata.faction_colors(f.get("templateName"))}


def _mission(g, nm, c, missions, lang):
    m = missions.get((c.get("activeMission") or {}).get("value"))
    if not m:
        return None
    name = m.get("missionTemplate") or m.get("templateName")
    if isinstance(name, dict):
        name = name.get("value")
    return {"id": name, "name": gamedata.mission_name(lang, name) if name else None,
            "icon": gamedata.mission_icon(name) if name else None,
            "target": _target_name(g, nm, (m.get("target") or {}).get("value"))}
