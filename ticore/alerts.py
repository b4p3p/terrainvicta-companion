"""Motore di allerta: confronta lo snapshot corrente col precedente.

E' la ragione per cui il companion sta aperto. Ogni regola restituisce zero o
piu' allerte con severita' 'critical' | 'warning' | 'info' e un id stabile,
cosi' il frontend puo' non ripetere una notifica gia' mostrata.
"""

SEVERITY_ORDER = {"critical": 0, "warning": 1, "info": 2}

# soglie: sotto queste una risorsa blocca le operazioni
LOW = {"Influence": 15, "Operations": 10, "Money": 50}


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
                "Progetto fermo: %s" % p["name"],
                "Slot %s: %.1f/%s, invariato dal %s. Quello slot non riceve ricerca."
                % (p["slot"], p["accumulated"], p["cost"], prev["date"]),
                tab="projects", project=p["id"]))
    return out


def low_resources(cur, prev):
    out = []
    res = cur.get("resources") or {}
    net = (cur.get("flows") or {}).get("net") or {}
    for r, threshold in LOW.items():
        v = res.get(r)
        if v is None:
            continue
        if v < threshold:
            sev = "critical" if v < threshold / 2 else "warning"
            out.append(_alert(
                "low:%s" % r, sev, "%s in esaurimento" % r,
                "In cassa %.1f (soglia %s), netto del mese %+.1f."
                % (v, threshold, net.get(r, 0)), tab="overview", resource=r))
        elif net.get(r, 0) < 0 and v < threshold * 3:
            out.append(_alert(
                "drain:%s" % r, "info", "%s in calo" % r,
                "Netto del mese %+.1f con %.1f in cassa." % (net[r], v),
                tab="overview", resource=r))
    return out


def control_points(cur, prev):
    if not prev:
        return []
    out = []
    a = (prev.get("controlPoints") or {}).get("byNation", {})
    b = (cur.get("controlPoints") or {}).get("byNation", {})
    for n in set(a) | set(b):
        d = b.get(n, 0) - a.get(n, 0)
        if d < 0:
            out.append(_alert(
                "cplost:%s" % n, "critical", "Punto di controllo perso: %s" % n,
                "Da %d a %d. Qualcuno te l'ha portato via." % (a.get(n, 0), b.get(n, 0)),
                tab="nations", nation=n))
        elif d > 0:
            out.append(_alert(
                "cpgain:%s" % n, "info", "Punto di controllo preso: %s" % n,
                "Ora ne hai %d." % b.get(n, 0), tab="nations", nation=n))

    # nuove fazioni entrate dove sono presente
    prev_owners = {x["name"]: set(x["owners"]) for x in prev.get("nations", [])}
    for n in cur.get("nations", []):
        if not n["myCP"]:
            continue
        new = set(n["owners"]) - prev_owners.get(n["name"], set())
        if new:
            out.append(_alert(
                "contested:%s" % n["name"], "warning",
                "Nuova fazione in %s" % n["name"],
                "%s e' entrata in una nazione dove sei presente."
                % ", ".join(sorted(new)), tab="nations", nation=n["name"]))
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
                "Lealta' in calo: %s" % c["name"],
                "Apparente da %s a %s. Qualcuno potrebbe stare lavorando per portartelo via."
                % (old, la), tab="council", councilor=c["name"]))
        elif la <= 6:
            out.append(_alert(
                "loyaltylow:%s" % c["name"], "info",
                "Lealta' bassa: %s" % c["name"],
                "Apparente %s. Un'organizzazione che dia lealta' lo mette al sicuro." % la,
                tab="council", councilor=c["name"]))
    return out


def alien_watch(cur, prev):
    if not prev:
        return []
    old = {s["region"] for s in prev.get("alienSites", [])}
    return [_alert("alien:%s" % s["region"], "warning",
                   "Nuovo sito alieno: %s" % s["region"],
                   "Rilevato il %s." % s["since"], tab="overview")
            for s in cur.get("alienSites", []) if s["region"] not in old]


def opportunities(cur, prev):
    """Cose che ora puoi fare e prima no."""
    out = []
    prev_afford = {o["name"] for o in (prev or {}).get("orgMarket", [])
                   if o.get("affordable")}
    for o in cur.get("orgMarket", []):
        if o.get("affordable") and o["name"] not in prev_afford and o["eligible"]:
            gains = ", ".join("%+g %s" % (v, k) for k, v in o["income"].items() if v)
            out.append(_alert(
                "org:%s" % o["name"], "info",
                "Organizzazione acquistabile: %s" % o["name"],
                "%s. Puo' tenerla: %s." % (gains or "nessuna rendita",
                                           ", ".join(o["eligible"])),
                tab="orgs", org=o["name"]))
    for p in (cur.get("projects") or {}).get("items", []):
        if p["active"] and p["monthsLeft"] is not None and 0 < p["monthsLeft"] <= 0.5:
            out.append(_alert(
                "soon:%s" % p["id"], "info",
                "Progetto quasi concluso: %s" % p["name"],
                "Mancano circa %.0f giorni." % (p["monthsLeft"] * 30),
                tab="projects", project=p["id"]))
    return out


def structural(cur, prev):
    """Problemi che non dipendono dal confronto: li segnaliamo comunque."""
    out = []
    if cur.get("cpCapOverage"):
        out.append(_alert(
            "cpcap", "warning", "Tetto dei punti di controllo superato",
            "Stai pagando una penalita'. Management Research alza il tetto.",
            tab="projects"))
    missing = (cur.get("council") or {}).get("missions", {}).get("missing", [])
    key = [m for m in missing if m["id"] in ("Coup", "Purge", "Crackdown",
                                             "HostileTakeover", "Detain", "Protect")]
    if key:
        out.append(_alert(
            "missions", "info", "Missioni chiave non coperte",
            "Nessuno nel consiglio sa fare: %s."
            % ", ".join(m["name"] for m in key), tab="missions"))
    weak = [c for c in (cur.get("council") or {}).get("coverage", []) if c["weak"]]
    if weak:
        out.append(_alert(
            "weakattrs", "info", "Attributi scoperti",
            "Nessun consigliere arriva a 4 in: %s."
            % ", ".join(c["short"] for c in weak), tab="council"))
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
                              "Regola non valutata", "%s: %s" % (rule.__name__, e)))
    out.sort(key=lambda a: (SEVERITY_ORDER.get(a["severity"], 9), a["title"]))
    return out
