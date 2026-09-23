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
        "name": g.faction_name.get(f.get("ID", {}).get("value")) or f.get("displayName"),
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


def compare(g, lang="ita"):
    """La nostra fazione e quelle che conosciamo, nell'ordine del gioco.

    Una fazione compare solo se l'abbiamo incontrata: `highestIntel` > 0.
    Quelle mai contattate non esistono, per il giocatore, e qui nemmeno.
    """
    now = _intel_map(g.me, "intel")
    top = _intel_map(g.me, "highestIntel")
    out = [_view(g, g.me, lang, 1.0, 1.0, True)]
    for fid, f in g.factions.items():
        if f is g.me or f.get("defeated"):
            continue
        highest = top.get(fid, 0)
        if highest <= 0:
            continue
        out.append(_view(g, f, lang, now.get(fid, 0), highest, False))
    return {"gates": {k: {"need": v[0], "measure": v[1]} for k, v in GATES.items()},
            "factions": out}
