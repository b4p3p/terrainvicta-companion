#!/usr/bin/env python3
"""TerraInvictaCompanion — CLI sopra ticore.

Tutta la logica sta in ticore/: qui c'e' solo formattazione da terminale.
Per l'interfaccia completa: `python ti.py serve` (API) + `npm run dev` in tiweb/.

    python ti.py status      quadro generale
    python ti.py alerts      cosa e' cambiato e cosa non va
    python ti.py council     consiglio, copertura, missioni mancanti
    python ti.py missions    catalogo delle missioni del consiglio
    python ti.py plan Coup   bersagli ordinati per una missione
    python ti.py orgs        mercato delle organizzazioni
    python ti.py nations     tabella nazioni
    python ti.py targets     punti di controllo liberi
    python ti.py projects    progetti, costi e tempi
    python ti.py diff        confronto con lo snapshot precedente
    python ti.py serve       API FastAPI su :8732 (serve a tiweb)
"""

import argparse
import os
import sys

import ticore
from ticore import alerts, missions, model, paths, store

SEV = {"critical": "CRITICO", "warning": "ATTENZ.", "info": "info   "}


def bn(v):
    try:
        return "%.0f" % (v / 1e9)
    except Exception:
        return "?"


def h(title):
    print("\n" + title)
    print("=" * len(title))


def get_snapshot(args):
    g = ticore.load(args.save)
    return g, model.snapshot(g, args.lang)


# ---------------------------------------------------------------- comandi

def cmd_status(args):
    g, s = get_snapshot(args)
    print("Salvataggio : %s" % s["save"])
    print("Data partita: %s   (%s)" % (s["date"], s["difficulty"]))
    print("Fazione     : %s" % s["faction"])

    h("RISORSE")
    for k, v in s["resources"].items():
        if v:
            print("  %-16s %9.1f" % (k, v))

    f = s["flows"]
    h("FLUSSI %02d/%d" % (f["month"], f["year"]))
    for cat, vals in f["byCategory"].items():
        bits = " ".join("%s %+.1f" % (k, v) for k, v in vals.items() if abs(v) > .05)
        print("  %-26s %s" % (cat, bits))
    print("  " + "-" * 60)
    print("  %-26s %s" % ("NETTO", " ".join(
        "%s %+.1f" % (k, v) for k, v in f["net"].items() if abs(v) > .05)))

    h("PUNTI DI CONTROLLO  (%d su %d nel mondo)"
      % (s["controlPoints"]["mine"], s["controlPoints"]["total"]))
    for n, c in sorted(s["controlPoints"]["byNation"].items(), key=lambda x: -x[1]):
        tot = next((x["cp"] for x in s["nations"] if x["name"] == n), c)
        print("  %-26s %d/%d" % (n, c, tot))
    if s["cpCapOverage"]:
        print("  ATTENZIONE: tetto dei punti di controllo superato.")

    h("PROGETTI (%.0f ricerca/mese)" % s["projects"]["rate"])
    for p in s["projects"]["items"]:
        if p["active"]:
            print("  slot %-3s %-30s %7.1f/%-5s  %s"
                  % (p["slot"], p["name"], p["accumulated"], p["cost"],
                     "~%d giorni" % (p["monthsLeft"] * 30)
                     if p["monthsLeft"] and p["monthsLeft"] > 0 else ""))


def cmd_alerts(args):
    g, s = get_snapshot(args)
    con = store.connect()
    prev = store.previous_snapshot(con, s)
    store.save_snapshot(con, s)
    items = alerts.evaluate(s, prev)
    h("ALLERTE  (confronto con %s)" % (prev["date"] if prev else "nessuno snapshot precedente"))
    if not items:
        print("  Niente da segnalare.")
    for a in items:
        print("  [%s] %s" % (SEV[a["severity"]], a["title"]))
        print("            %s" % a["detail"])


def cmd_council(args):
    g, s = get_snapshot(args)
    c = s["council"]
    h("COPERTURA DEGLI ATTRIBUTI")
    for cov in c["coverage"]:
        print("  %-4s %2d  %-22s %s" % (cov["short"], cov["max"],
                                        (cov["best"] or {}).get("name", "—"),
                                        "<-- SCOPERTO" if cov["weak"] else ""))
    h("SQUADRA")
    for m in c["team"]:
        print("\n  %s  (%s, %s)" % (m["name"], m["typeName"], m["nationality"]))
        print("    %s" % "  ".join(
            "%s %d" % (k[:3].upper(), v) for k, v in m["attributes"].items()))
        print("    posizione %s | XP %s | lealta' apparente %s"
              % (m["location"], m["xp"], m["apparentLoyalty"]))
        print("    org: %s" % (", ".join(o["name"] for o in m["orgs"]) or "nessuna"))
        print("    %d missioni conosciute" % len(m["missions"]))

    h("MISSIONI CHE NESSUNO SA FARE")
    if not c["missions"]["missing"]:
        print("  Nessuna: il consiglio copre tutto.")
    for m in c["missions"]["missing"]:
        p = m["providers"]
        print("  %-26s %-4s  reclutando: %s%s"
              % (m["name"], m["attributeShort"] or "-",
                 ", ".join(t["name"] for t in p["councilorTypes"][:5]) or "—",
                 "  (+%d org)" % p["orgCount"] if p["orgCount"] else ""))


def cmd_missions(args):
    g, s = get_snapshot(args)
    h("MISSIONI DEL CONSIGLIO")
    for m in missions.catalogue(s, args.lang):
        cost = ""
        if m["cost"]:
            cost = "%s %s" % (m["cost"]["value"] or "~", m["cost"]["resource"])
        print("  %-30s %-4s %-14s %-16s %s"
              % (m["name"], m["attributeShort"] or "-", cost, m["target"],
                 (m["best"] or {}).get("name", "")))


def cmd_plan(args):
    g, s = get_snapshot(args)
    if not args.mission:
        sys.exit("Serve il nome interno della missione, es: python ti.py plan Coup")
    p = missions.plan(s, args.mission, args.councilor)
    h("%s" % p["missionName"].upper())
    if p.get("note"):
        print("  " + p["note"])
        return
    print("  consigliere: %s (%s %s)" % (p["councilor"], p["attributeShort"],
                                         p["councilorValue"]))
    print("  a favore : %s" % ", ".join(
        f["label"] for f in p["factors"]["readable"] if f["side"] == "attacco"))
    print("  contro   : %s" % ", ".join(
        f["label"] for f in p["factors"]["readable"] if f["side"] == "difesa"))
    print("  non leggibili: %s" % ", ".join(
        f["label"] for f in p["factors"]["opaque"]))
    print()
    rows = p["targets"] or []
    if args.eu:
        rows = [r for r in rows if r["eu"]]
    print("  %-24s %7s %8s %9s %10s %8s %9s  %s"
          % ("NAZIONE", "PUNTI", "DISORD", "COESIONE", "DEMOCRAZ", "SOST.", "PIL mld", "PROPRIETARI"))
    for r in rows[:args.limit]:
        print("  %-24s %7.2f %8.2f %9.1f %10.1f %7.1f%% %9s  %s"
              % (r["name"], r["score"], r["unrest"], r["cohesion"], r["democracy"],
                 100 * r["support"], bn(r["gdp"]), ", ".join(r["owners"]) or "—"))


def cmd_orgs(args):
    g, s = get_snapshot(args)
    h("MERCATO DELLE ORGANIZZAZIONI")
    for o in s["orgMarket"]:
        cost = " + ".join("%g %s" % (v, k) for k, v in o["cost"].items() if v) or "gratis"
        inc = ", ".join("%+g %s" % (v, k) for k, v in o["income"].items() if v)
        att = ", ".join("+%g %s" % (v, k[:3].upper()) for k, v in o["attributes"].items())
        print("\n  %s   [tier %s, %s]" % (o["name"], o["tier"], o["type"]))
        print("    costo  : %-28s %s" % (cost, "ACQUISTABILE" if o["affordable"] else ""))
        print("    rende  : %s" % ", ".join(x for x in (inc, att) if x))
        if o["paybackMonths"]:
            print("    rientro: ~%s mesi" % o["paybackMonths"])
        print("    tenuta : %s" % (", ".join(o["eligible"]) or "NESSUNO dei tuoi"))
        if o["missionsGranted"]:
            print("    missioni concesse: %d" % len(o["missionsGranted"]))


def cmd_nations(args):
    g, s = get_snapshot(args)
    rows = [n for n in s["nations"] if args.all or n["eu"]]
    rows.sort(key=lambda r: -r["gdp"])
    h("NAZIONI")
    print("  %-24s %8s %6s %6s %6s %7s %7s %8s  %s"
          % ("NAZIONE", "PIL mld", "EDU", "COES", "DIFF", "SPAZIO", "MIEI/CP", "LIBERI", "PROPRIETARI"))
    for r in rows:
        print("  %-24s %8s %6.1f %6.1f %6.1f %7s %7s %8d  %s"
              % (r["name"], bn(r["gdp"]), r["education"], r["cohesion"], r["difficulty"],
                 "SI" if r["space"] else "-", "%d/%d" % (r["myCP"], r["cp"]),
                 r["freeCP"], ", ".join(r["owners"]) or "-"))


def cmd_targets(args):
    g, s = get_snapshot(args)
    rows = [n for n in s["nations"] if n["freeCP"] and (args.all or n["eu"])]
    for r in rows:
        r["_score"] = ((r["gdp"] / 1e12) + r["spaceFunding"] / 100
                       + r["education"] / 10) / max(r["difficulty"], .1) * 10
    rows.sort(key=lambda r: -r["_score"])
    h("PUNTI DI CONTROLLO LIBERI")
    print("  %-24s %7s %7s %8s %8s %7s %7s"
          % ("NAZIONE", "LIBERI", "DIFF", "PIL mld", "FONDISP", "SPAZIO", "PUNTI"))
    for r in rows:
        print("  %-24s %7d %7.1f %8s %8.0f %7s %7.2f"
              % (r["name"], r["freeCP"], r["difficulty"], bn(r["gdp"]),
                 r["spaceFunding"], "SI" if r["space"] else "-", r["_score"]))


def cmd_projects(args):
    g, s = get_snapshot(args)
    h("PROGETTI  (%.0f ricerca/mese)" % s["projects"]["rate"])
    for p in s["projects"]["items"]:
        print("\n  %s" % p["name"])
        print("    costo %s%s%s" % (p["cost"],
                                    "  ripetibile" if p["repeatable"] else "",
                                    "  IN CORSO slot %s (%.0f/%s)"
                                    % (p["slot"], p["accumulated"], p["cost"])
                                    if p["active"] else ""))
        if p["grants"]:
            print("    concede: %s" % ", ".join(
                "%s %+g" % (x["resource"], x["value"]) for x in p["grants"]))
        if p["effects"]:
            print("    effetti: %s" % ", ".join(p["effects"]))
        if p["monthsLeft"] is not None:
            print("    ~%.1f mesi al ritmo attuale" % p["monthsLeft"])


def cmd_diff(args):
    g, s = get_snapshot(args)
    con = store.connect()
    prev = store.previous_snapshot(con, s)
    store.save_snapshot(con, s)
    if not prev:
        sys.exit("Nessuno snapshot precedente in archivio. Rilancia dopo aver giocato.")
    h("CONFRONTO  %s -> %s" % (prev["date"], s["date"]))
    print("\n  RISORSE")
    for k, v in s["resources"].items():
        d = v - prev["resources"].get(k, 0)
        if abs(d) > .05:
            print("    %-16s %+9.1f  (ora %.1f)" % (k, d, v))
    print("\n  PROGETTI")
    before = {p["id"]: p["accumulated"] for p in prev["projects"]["items"]}
    for p in s["projects"]["items"]:
        if p["active"]:
            d = p["accumulated"] - before.get(p["id"], 0)
            print("    slot %-3s %-30s %+8.1f %s"
                  % (p["slot"], p["name"], d, "<-- FERMO" if abs(d) < .05 else ""))
    print("\n  PUNTI DI CONTROLLO")
    a, b = prev["controlPoints"]["byNation"], s["controlPoints"]["byNation"]
    for n in sorted(set(a) | set(b)):
        d = b.get(n, 0) - a.get(n, 0)
        print("    %-26s %d -> %d %s" % (n, a.get(n, 0), b.get(n, 0),
                                         "(%+d)" % d if d else ""))


def cmd_serve(args):
    import uvicorn
    print("API su http://127.0.0.1:%d — interfaccia: cd tiweb && npm run dev" % args.port)
    uvicorn.run("tiserver.main:app", host="127.0.0.1", port=args.port,
                log_level="warning")


COMMANDS = {
    "status": cmd_status, "alerts": cmd_alerts, "council": cmd_council,
    "missions": cmd_missions, "plan": cmd_plan, "orgs": cmd_orgs,
    "nations": cmd_nations, "targets": cmd_targets, "projects": cmd_projects,
    "diff": cmd_diff, "serve": cmd_serve,
}


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    ap = argparse.ArgumentParser(description="TerraInvictaCompanion")
    ap.add_argument("command", nargs="?", default="status", choices=sorted(COMMANDS))
    ap.add_argument("mission", nargs="?", help="nome interno della missione (comando plan)")
    ap.add_argument("--save", help="file o frammento del nome del salvataggio")
    ap.add_argument("--lang", default="ita", help="lingua dei termini di gioco")
    ap.add_argument("--all", action="store_true", help="non limitare all'Europa")
    ap.add_argument("--eu", action="store_true", help="solo Europa (comando plan)")
    ap.add_argument("--limit", type=int, default=25)
    ap.add_argument("--councilor", help="consigliere da usare (comando plan)")
    ap.add_argument("--port", type=int, default=8732)
    ap.add_argument("--list-saves", action="store_true")
    args = ap.parse_args()

    if args.list_saves:
        import datetime
        for mt, p in paths.list_saves():
            print("  %s  %s" % (datetime.datetime.fromtimestamp(mt).strftime("%Y-%m-%d %H:%M"),
                                os.path.basename(p)))
        return

    COMMANDS[args.command](args)


if __name__ == "__main__":
    main()
