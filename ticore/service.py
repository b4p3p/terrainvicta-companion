"""Le rotte del companion, senza framework.

La stessa logica serve due padroni: `tiserver` (FastAPI, in locale) e il worker
del browser, dove ticore gira dentro Pyodide e FastAPI non c'e'. Qui ci sono
lo stato condiviso (snapshot corrente, precedente, allerte) e una funzione per
rotta; `dispatch()` traduce metodo + percorso nella chiamata giusta.

Gli errori sono `ServiceError(status, messaggio)`: ognuno dei due involucri li
trasforma nella sua risposta.
"""

import os
import re
from urllib.parse import unquote

from . import (Game, SaveLocked, alerts, factions, gamedata, load, missions,
               model, paths, presets, snapshot, store)


class ServiceError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


class Service:
    """Snapshot corrente + allerte, condivisi fra le richieste."""

    def __init__(self, con=None):
        self.con = con or store.connect()
        self.snapshot = None
        self.trends = None
        self.game = None                 # l'ultimo Game, per i dettagli su richiesta
        self.previous = None
        self.alerts = []
        self.lang = "ita"
        self.error = None
        self.loaded_mtime = 0.0
        # Nel browser non c'e' una cartella da scandire: il worker scrive il
        # salvataggio piu' recente in memoria e lo indica qui.
        self.pinned = None

    # -- caricamento ----------------------------------------------------

    def reload(self, force=False, path=None):
        """Ricarica se il salvataggio piu' recente e' cambiato. True se l'ha fatto.

        `path` (o `self.pinned`) forza un file preciso: nel browser e' il
        worker a sapere quale salvataggio e' il piu' recente.
        """
        path = path or self.pinned
        try:
            latest, mtime = (path, os.path.getmtime(path)) if path else paths.latest_save()
        except Exception as e:
            self.error = str(e)
            return False
        if not force and mtime <= self.loaded_mtime:
            return False
        try:
            g = Game(latest) if path else load()
        except SaveLocked as e:
            self.error = str(e)          # il gioco sta scrivendo: riproviamo dopo
            return False
        snap = snapshot(g, self.lang)
        prev = store.previous_snapshot(self.con, snap)
        store.save_snapshot(self.con, snap)
        self.previous = prev
        self.snapshot = snap
        self.trends = model.nation_trends(g)
        self.game = g
        self.alerts = alerts.evaluate(snap, prev)
        self.loaded_mtime = g.mtime
        self.error = None
        return True

    def require(self):
        if self.snapshot is None and not self.reload(force=True):
            raise ServiceError(503, self.error or "Nessuno snapshot disponibile")
        return self.snapshot

    def campaign(self):
        return store.campaign_id(self.require())

    def event(self, kind="snapshot"):
        """Il messaggio che i client ricevono a ogni salvataggio nuovo."""
        s = self.snapshot or {}
        return {"type": kind, "date": s.get("date"), "save": s.get("save"),
                "faction": s.get("faction"), "alerts": self.alerts}

    # -- stato ------------------------------------------------------------

    def health(self):
        return {
            "ok": self.snapshot is not None,
            "error": self.error,
            "save": (self.snapshot or {}).get("save"),
            "date": (self.snapshot or {}).get("date"),
            "lang": self.lang,
        }

    def get_snapshot(self, lang=None):
        if lang and lang != self.lang:
            self.lang = lang
            self.reload(force=True)
        return self.require()

    def get_alerts(self):
        self.require()
        return {"alerts": self.alerts,
                "comparedTo": (self.previous or {}).get("date")}

    def languages(self):
        return {"current": self.lang,
                "available": [{"id": k, "name": gamedata.LANGUAGES.get(k, k)}
                              for k in gamedata.available_languages()]}

    def saves(self):
        return [{"name": os.path.basename(p), "mtime": m} for m, p in paths.list_saves()]

    # -- missioni, nazioni, fazioni ---------------------------------------

    def mission_catalogue(self):
        return missions.catalogue(self.require(), self.lang)

    def mission_plan(self, name, councilor=None):
        return missions.plan(self.require(), name, councilor)

    def history(self):
        self.require()
        return store.history(self.con, self.campaign())

    def campaigns(self):
        return store.campaigns(self.con)

    def nation_trends(self):
        """Serie storiche delle nazioni: stanno fuori dallo snapshot per non
        gonfiare lo storico archiviato a ogni salvataggio."""
        self.require()
        return self.trends or {"points": 0, "nations": {}}

    def nation_detail(self, name, lang=None):
        """Cause di variazione degli indicatori e priorita' dei nostri punti di
        controllo in quella nazione."""
        self.require()
        d = model.nation_detail(self.game, name, lang or self.lang)
        if d is None:
            raise ServiceError(404, "Nazione non trovata.")
        return d

    def faction_compare(self, lang=None):
        """Le fazioni conosciute, coi soli campi che il nostro intel sblocca.
        Soglie e misure sono quelle del gioco: vedi ticore/factions.py."""
        self.require()
        return factions.compare(self.game, lang or self.lang)

    def diff(self):
        """Cosa e' cambiato rispetto allo snapshot precedente."""
        cur, prev = self.require(), self.previous
        if not prev:
            return {"previous": None}
        res = {k: round((cur["resources"].get(k, 0) - prev["resources"].get(k, 0)), 1)
               for k in cur["resources"]}
        projs = {}
        before = {p["id"]: p["accumulated"] for p in prev["projects"]["items"]}
        for p in cur["projects"]["items"]:
            if p["active"]:
                projs[p["name"]] = round(p["accumulated"] - before.get(p["id"], 0), 1)
        cps = {}
        a, b = prev["controlPoints"]["byNation"], cur["controlPoints"]["byNation"]
        for n in set(a) | set(b):
            if b.get(n, 0) != a.get(n, 0):
                cps[n] = {"before": a.get(n, 0), "after": b.get(n, 0)}
        return {"previous": prev["date"], "current": cur["date"],
                "resources": res, "projects": projs, "controlPoints": cps}

    # -- preset -------------------------------------------------------------

    def _default_preset(self):
        """Il preset predefinito della fazione, per i punti di controllo nuovi.

        E' l'unico riferimento per NOME a un preset nel salvataggio: le priorita'
        dei punti di controllo sono salvate come pesi, non come preset scelto."""
        try:
            return self.game.me.get("defaultPriorityPresetTemplateName") if self.game else None
        except Exception:
            return None

    def presets_status(self, lang=None):
        return dict(presets.status(lang or self.lang), defaultPreset=self._default_preset())

    def _maybe_install(self, install, lang):
        """Dopo un salvataggio, scrive subito nel gioco se richiesto e possibile.
        Un fallimento qui non annulla il salvataggio: lo si dice e basta."""
        if not install:
            return None
        try:
            presets.install(lang or self.lang)
            return {"ok": True, "error": None}
        except (OSError, ValueError) as e:
            return {"ok": False, "error": str(e)}

    def presets_install(self, lang=None):
        """Aggiunge i preset del companion al template del gioco.

        Non passa dal sistema dei mod apposta: attivarlo disattiverebbe gli
        achievement. Vedi ticore/presets.py.
        """
        try:
            res = presets.install(lang or self.lang)
        except (OSError, ValueError) as e:
            raise ServiceError(400, str(e))
        return dict(res, status=self.presets_status(lang))

    def presets_export(self):
        """Il template completo da scaricare: nel browser e' l'unico modo di
        portare i preset nel gioco (Chrome non scrive in Program Files)."""
        try:
            return presets.export()
        except (OSError, ValueError) as e:
            raise ServiceError(400, str(e))

    def presets_restore(self, lang=None):
        try:
            res = presets.restore()
        except (OSError, ValueError) as e:
            raise ServiceError(400, str(e))
        return dict(res, status=self.presets_status(lang))

    def preset_create(self, name, weights, lang=None, install=False):
        """Nuovo preset personale, in ~/.terrainvicta-companion/presets.json.
        Con `install` lo scrive anche nel template del gioco."""
        try:
            entry = presets.save_user(name, weights)
        except ValueError as e:
            raise ServiceError(400, str(e))
        inst = self._maybe_install(install, lang)
        return {"id": entry["dataName"], "install": inst, "status": self.presets_status(lang)}

    def preset_update(self, data_name, name, weights, lang=None, install=False):
        try:
            presets.save_user(name, weights, data_name)
        except KeyError:
            raise ServiceError(404, "Preset personale non trovato.")
        except ValueError as e:
            raise ServiceError(400, str(e))
        inst = self._maybe_install(install, lang)
        return {"id": data_name, "install": inst, "status": self.presets_status(lang)}

    def preset_delete(self, data_name, lang=None):
        # il gioco lo cerca per nome al caricamento della partita: toglierlo
        # lascerebbe la fazione con un predefinito che non esiste
        if data_name == self._default_preset():
            raise ServiceError(409, "E' il preset predefinito della tua fazione in partita: "
                                    "scegline un altro come predefinito prima di eliminarlo.")
        try:
            presets.delete_user(data_name)
        except KeyError:
            raise ServiceError(404, "Preset personale non trovato.")
        return {"status": self.presets_status(lang)}

    # -- note e obiettivi ---------------------------------------------------

    def notes(self, subject=None):
        return store.list_notes(self.con, self.campaign(), subject)

    def note_add(self, subject, body):
        return {"id": store.add_note(self.con, self.campaign(), subject, body)}

    def note_edit(self, note_id, body):
        store.update_note(self.con, note_id, body)
        return {"ok": True}

    def note_delete(self, note_id):
        store.delete_note(self.con, note_id)
        return {"ok": True}

    def goals(self):
        return store.goal_progress(self.con, self.campaign(), self.require())

    def goal_add(self, title, kind=None, target=None, amount=None, due=None):
        return {"id": store.add_goal(self.con, self.campaign(), title, kind,
                                     target, amount, due)}

    def goal_done(self, goal_id, done=True):
        store.set_goal_done(self.con, goal_id, done)
        return {"ok": True}

    def goal_delete(self, goal_id):
        store.delete_goal(self.con, goal_id)
        return {"ok": True}

    # -- instradamento --------------------------------------------------------

    def dispatch(self, method, path, query=None, body=None):
        """(metodo, percorso) -> risposta. E' cio' che il worker del browser
        chiama al posto di una richiesta HTTP."""
        q, b = query or {}, body or {}
        for m, pattern, fn in _ROUTES:
            if m != method:
                continue
            hit = re.fullmatch(pattern, path)
            if hit:
                return fn(self, q, b, *(unquote(x) for x in hit.groups()))
        raise ServiceError(404, "%s %s: rotta sconosciuta" % (method, path))


def _bool(v, default=False):
    if v is None:
        return default
    return v if isinstance(v, bool) else str(v).lower() in ("1", "true", "yes")


# Stesse rotte di tiserver/main.py: chi ne aggiunge una la aggiunge qui.
_ROUTES = [
    ("GET", r"/api/health", lambda s, q, b: s.health()),
    ("GET", r"/api/snapshot", lambda s, q, b: s.get_snapshot(q.get("lang"))),
    ("GET", r"/api/alerts", lambda s, q, b: s.get_alerts()),
    ("GET", r"/api/languages", lambda s, q, b: s.languages()),
    ("GET", r"/api/saves", lambda s, q, b: s.saves()),
    ("GET", r"/api/missions", lambda s, q, b: s.mission_catalogue()),
    ("GET", r"/api/missions/([^/]+)/plan",
     lambda s, q, b, name: s.mission_plan(name, q.get("councilor"))),
    ("GET", r"/api/history", lambda s, q, b: s.history()),
    ("GET", r"/api/campaigns", lambda s, q, b: s.campaigns()),
    ("GET", r"/api/nations/trends", lambda s, q, b: s.nation_trends()),
    ("GET", r"/api/nations/([^/]+)/detail",
     lambda s, q, b, name: s.nation_detail(name, q.get("lang"))),
    ("GET", r"/api/factions", lambda s, q, b: s.faction_compare(q.get("lang"))),
    ("GET", r"/api/diff", lambda s, q, b: s.diff()),
    ("GET", r"/api/presets", lambda s, q, b: s.presets_status(q.get("lang"))),
    ("GET", r"/api/presets/export", lambda s, q, b: s.presets_export()),
    ("POST", r"/api/presets/install", lambda s, q, b: s.presets_install(q.get("lang"))),
    ("POST", r"/api/presets/restore", lambda s, q, b: s.presets_restore(q.get("lang"))),
    ("POST", r"/api/presets/custom",
     lambda s, q, b: s.preset_create(b.get("name"), b.get("weights") or {},
                                     q.get("lang"), _bool(q.get("install")))),
    ("PUT", r"/api/presets/custom/([^/]+)",
     lambda s, q, b, dn: s.preset_update(dn, b.get("name"), b.get("weights") or {},
                                         q.get("lang"), _bool(q.get("install")))),
    ("DELETE", r"/api/presets/custom/([^/]+)",
     lambda s, q, b, dn: s.preset_delete(dn, q.get("lang"))),
    ("GET", r"/api/notes", lambda s, q, b: s.notes(q.get("subject"))),
    ("POST", r"/api/notes", lambda s, q, b: s.note_add(b.get("subject"), b.get("body"))),
    ("PUT", r"/api/notes/(\d+)", lambda s, q, b, i: s.note_edit(int(i), b.get("body"))),
    ("DELETE", r"/api/notes/(\d+)", lambda s, q, b, i: s.note_delete(int(i))),
    ("GET", r"/api/goals", lambda s, q, b: s.goals()),
    ("POST", r"/api/goals",
     lambda s, q, b: s.goal_add(b.get("title"), b.get("kind"), b.get("target"),
                                b.get("amount"), b.get("due"))),
    ("POST", r"/api/goals/(\d+)/done",
     lambda s, q, b, i: s.goal_done(int(i), _bool(q.get("done"), True))),
    ("DELETE", r"/api/goals/(\d+)", lambda s, q, b, i: s.goal_delete(int(i))),
]
