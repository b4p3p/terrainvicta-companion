"""Motore di allerta: confronta lo snapshot corrente col precedente.

E' la ragione per cui il companion sta aperto. Ogni regola restituisce zero o
piu' allerte con severita' 'critical' | 'warning' | 'info' e un id stabile,
cosi' il frontend puo' non ripetere una notifica gia' mostrata.
"""

from . import gamedata
from .texts import t

SEVERITY_ORDER = {"critical": 0, "warning": 1, "info": 2}

# le rendite delle org usano chiavi minuscole: qui tornano alle risorse del
# gioco, cosi' l'allerta parla la lingua della localizzazione ufficiale
_INCOME_RESOURCE = {
    "money": "Money", "influence": "Influence", "ops": "Operations",
    "research": "Research", "boost": "Boost",
    "missionControl": "MissionControl",
}

# soglie: sotto queste una risorsa blocca le operazioni
LOW = {"Influence": 15, "Operations": 10, "Money": 50}


def _lang(snap):
    """Lingua di gioco dello snapshot: i testi escono nella sua lingua."""
    return (snap or {}).get("lang") or "ita"


def _alert(aid, severity, title, detail, tab=None, **extra):
    return dict(id=aid, severity=severity, title=title, detail=detail,
                tab=tab, **extra)


def stalled_projects(cur, prev):
    """Progetto attivo che non accumula ricerca: lo slot ha allocazione zero."""
    if not prev:
        return []
    before = {p["id"]: p["accumulated"]
              for p in (prev.get("projects") or {}).get("items", []) if p["active"]}
    out = []
    for p in (cur.get("projects") or {}).get("items", []):
        if not p["active"] or p["id"] not in before:
            continue
        if p["accumulated"] <= before[p["id"]] + 0.05:
            out.append(_alert(
                "stalled:%s" % p["id"], "warning",
                t("alert.stalled.title", _lang(cur), p["name"]),
                t("alert.stalled.detail", _lang(cur),
                  p["slot"], p["accumulated"], p["cost"], prev["date"]),
                tab="projects", project=p["id"]))
    return out


def low_resources(cur, prev):
    out = []
    res = cur.get("resources") or {}
    # il netto ricorrente: un acquisto una tantum (un'org da 182) non e' un
    # calo. Gli snapshot archiviati prima di `recurring` ricadono su `net`.
    flows = cur.get("flows") or {}
    net = flows.get("recurring", flows.get("net")) or {}
    lang = _lang(cur)
    for r, threshold in LOW.items():
        v = res.get(r)
        if v is None:
            continue
        # il nome della risorsa dalla localizzazione del gioco, non l'id "Money"
        name = gamedata.resource_name(lang, r)
        if v < threshold:
            sev = "critical" if v < threshold / 2 else "warning"
            out.append(_alert(
                "low:%s" % r, sev, t("alert.low.title", lang, name),
                t("alert.low.detail", lang, v, threshold, net.get(r, 0)),
                tab="overview", resource=r))
        elif net.get(r, 0) < 0 and v < threshold * 3:
            out.append(_alert(
                "drain:%s" % r, "info", t("alert.drain.title", lang, name),
                t("alert.drain.detail", lang, net[r], v),
                tab="overview", resource=r))
    return out


def _by_id(snap):
    """Lo snapshot tiene nazioni e fazioni per id? Quelli archiviati prima
    dei nomi tradotti le tenevano per nome, nella lingua del salvataggio:
    confrontarli con uno nuovo darebbe allerte false su tutto."""
    return "names" in (snap.get("controlPoints") or {})


def control_points(cur, prev):
    if not prev or not _by_id(prev):
        return []
    out = []
    a = (prev.get("controlPoints") or {}).get("byNation", {})
    b = (cur.get("controlPoints") or {}).get("byNation", {})
    names = {**(prev.get("controlPoints") or {}).get("names", {}),
             **(cur.get("controlPoints") or {}).get("names", {})}
    for n in set(a) | set(b):
        d = b.get(n, 0) - a.get(n, 0)
        label = names.get(n, n)
        if d < 0:
            out.append(_alert(
                "cplost:%s" % n, "critical", t("alert.cplost.title", _lang(cur), label),
                t("alert.cplost.detail", _lang(cur), a.get(n, 0), b.get(n, 0)),
                tab="nations", nation=n))
        elif d > 0:
            out.append(_alert(
                "cpgain:%s" % n, "info", t("alert.cpgain.title", _lang(cur), label),
                t("alert.cpgain.detail", _lang(cur), b.get(n, 0)), tab="nations", nation=n))

    # nuove fazioni entrate dove sono presente: per id di fazione, i nomi
    # dipendono dalla lingua
    prev_owners = {x["id"]: set(x.get("ownerIds", [])) for x in prev.get("nations", [])}
    for n in cur.get("nations", []):
        if not n["myCP"]:
            continue
        new = set(n.get("ownerIds", [])) - prev_owners.get(n["id"], set())
        if new:
            shown = [n["ownerIds"][i] for i in new]
            out.append(_alert(
                "contested:%s" % n["id"], "warning",
                t("alert.contested.title", _lang(cur), n["name"]),
                t("alert.contested.detail", _lang(cur), ", ".join(sorted(shown))),
                tab="nations", nation=n["id"]))
    return out


def council_watch(cur, prev):
    out = []
    team = (cur.get("council") or {}).get("team", [])
    prev_team = {c["name"]: c for c in (prev or {}).get("council", {}).get("team", [])}
    for c in team:
        la = c.get("apparentLoyalty")
        if la is None:
            continue
        old = prev_team.get(c["name"], {}).get("apparentLoyalty")
        if old is not None and la < old - 1:
            out.append(_alert(
                "loyalty:%s" % c["name"], "warning",
                t("alert.loyalty.title", _lang(cur), c["name"]),
                t("alert.loyalty.detail", _lang(cur), old, la),
                tab="council", councilor=c["name"]))
        elif la <= 6:
            out.append(_alert(
                "loyaltylow:%s" % c["name"], "info",
                t("alert.loyaltylow.title", _lang(cur), c["name"]),
                t("alert.loyaltylow.detail", _lang(cur), la),
                tab="council", councilor=c["name"]))
    return out


def alien_watch(cur, prev):
    if not prev:
        return []
    key = lambda s: s.get("regionId", s["region"])      # id; il nome solo nei vecchi snapshot
    old = {key(s) for s in prev.get("alienSites", [])}
    if not _by_id(prev):
        old |= {s.get("regionId") for s in cur.get("alienSites", [])}   # niente allerte false
    return [_alert("alien:%s" % key(s), "warning",
                   t("alert.alien.title", _lang(cur), s["region"]),
                   t("alert.alien.detail", _lang(cur), s["since"]), tab="overview")
            for s in cur.get("alienSites", []) if key(s) not in old]


def opportunities(cur, prev):
    """Cose che ora puoi fare e prima no."""
    out = []
    # per id: il nome dell'org cambia con la lingua
    prev_afford = {o["id"] for o in (prev or {}).get("orgMarket", [])
                   if o.get("affordable")}
    for o in cur.get("orgMarket", []):
        if o.get("affordable") and o["id"] not in prev_afford and o["eligible"]:
            lang = _lang(cur)
            gains = ", ".join(
                "%+g %s" % (v, gamedata.resource_name(lang, _INCOME_RESOURCE.get(k, k)))
                for k, v in o["income"].items() if v)
            out.append(_alert(
                "org:%s" % o["id"], "info",
                t("alert.org.title", lang, o["name"]),
                t("alert.org.detail", lang, gains or t("alert.org.noIncome", lang),
                  ", ".join(o["eligible"])),
                tab="orgs", org=o["name"]))
    for p in (cur.get("projects") or {}).get("items", []):
        if p["active"] and p["monthsLeft"] is not None and 0 < p["monthsLeft"] <= 0.5:
            out.append(_alert(
                "soon:%s" % p["id"], "info",
                t("alert.soon.title", _lang(cur), p["name"]),
                t("alert.soon.detail", _lang(cur), p["monthsLeft"] * 30),
                tab="projects", project=p["id"]))
    return out


def structural(cur, prev):
    """Problemi che non dipendono dal confronto: li segnaliamo comunque."""
    out = []
    if cur.get("cpCapOverage"):
        out.append(_alert(
            "cpcap", "warning", t("alert.cpcap.title", _lang(cur)),
            t("alert.cpcap.detail", _lang(cur),
              gamedata.project_name(_lang(cur), "Project_ManagementResearch")),
            tab="projects"))
    missing = (cur.get("council") or {}).get("missions", {}).get("missing", [])
    key = [m for m in missing if m["id"] in ("Coup", "Purge", "Crackdown",
                                             "HostileTakeover", "Detain", "Protect")]
    if key:
        out.append(_alert(
            "missions", "info", t("alert.missions.title", _lang(cur)),
            t("alert.missions.detail", _lang(cur), ", ".join(m["name"] for m in key)),
            tab="missions"))
    weak = [c for c in (cur.get("council") or {}).get("coverage", []) if c["weak"]]
    if weak:
        out.append(_alert(
            "weakattrs", "info", t("alert.weakattrs.title", _lang(cur)),
            t("alert.weakattrs.detail", _lang(cur), ", ".join(c["short"] for c in weak)),
            tab="council"))
    return out


RULES = [stalled_projects, low_resources, control_points, council_watch,
         alien_watch, opportunities, structural]


def evaluate(cur, prev=None):
    out = []
    for rule in RULES:
        try:
            out.extend(rule(cur, prev) or [])
        except Exception as e:  # una regola rotta non deve spegnere le altre
            out.append(_alert("ruleerror:%s" % rule.__name__, "info",
                              t("alert.ruleerror.title", _lang(cur)),
                              "%s: %s" % (rule.__name__, e)))
    out.sort(key=lambda a: (SEVERITY_ORDER.get(a["severity"], 9), a["title"]))
    return out
