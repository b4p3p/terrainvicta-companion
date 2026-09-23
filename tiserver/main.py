"""API del companion: legge i salvataggi, valuta le allerte, spinge via SSE.

    uvicorn tiserver.main:app --port 8732 --reload

Il watcher gira in background: sorveglia la mtime del salvataggio piu' recente,
ricostruisce lo snapshot quando cambia, lo archivia e rivaluta le allerte.
I client ricevono l'aggiornamento su /api/stream senza interrogare nulla.
"""

import asyncio
import json
import os
import sys
import time

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import ticore                                    # noqa: E402
from ticore import (alerts, factions, gamedata, missions, model, paths,  # noqa: E402
                    presets, store)
from . import icons                             # noqa: E402

app = FastAPI(title="TerraInvictaCompanion", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"], allow_headers=["*"],
)

POLL_SECONDS = 3.0


class State:
    """Snapshot corrente + allerte, condivisi fra le richieste."""

    def __init__(self):
        self.con = store.connect()
        self.snapshot = None
        self.trends = None
        self.game = None                 # l'ultimo Game, per i dettagli su richiesta
        self.previous = None
        self.alerts = []
        self.lang = "ita"
        self.error = None
        self.loaded_mtime = 0.0
        self.subscribers = set()

    # -- caricamento ----------------------------------------------------

    def reload(self, force=False):
        try:
            path, mtime = paths.latest_save()
        except Exception as e:
            self.error = str(e)
            return False
        if not force and mtime <= self.loaded_mtime:
            return False
        try:
            g = ticore.load()
        except ticore.SaveLocked as e:
            self.error = str(e)          # il gioco sta scrivendo: riproviamo dopo
            return False
        snap = ticore.snapshot(g, self.lang)
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
            raise HTTPException(503, self.error or "Nessuno snapshot disponibile")
        return self.snapshot

    def campaign(self):
        return store.campaign_id(self.require())

    async def broadcast(self, event):
        dead = []
        for q in self.subscribers:
            try:
                q.put_nowait(event)
            except Exception:
                dead.append(q)
        for q in dead:
            self.subscribers.discard(q)


state = State()


@app.on_event("startup")
async def startup():
    state.reload(force=True)
    asyncio.create_task(watcher())


async def watcher():
    while True:
        await asyncio.sleep(POLL_SECONDS)
        try:
            changed = await asyncio.to_thread(state.reload)
            if changed:
                await state.broadcast({
                    "type": "snapshot",
                    "date": state.snapshot["date"],
                    "save": state.snapshot["save"],
                    "faction": state.snapshot["faction"],
                    "alerts": state.alerts,
                })
        except Exception as e:
            state.error = str(e)


# ------------------------------------------------------------------ rotte

@app.get("/api/health")
def health():
    return {
        "ok": state.snapshot is not None,
        "error": state.error,
        "save": (state.snapshot or {}).get("save"),
        "date": (state.snapshot or {}).get("date"),
        "lang": state.lang,
    }


@app.get("/api/presets")
def list_presets(lang: str = Query(None)):
    return presets.status(lang or state.lang)


@app.post("/api/presets/install")
def install_presets(lang: str = Query(None)):
    """Aggiunge i preset del companion al template del gioco.

    Non passa dal sistema dei mod apposta: attivarlo disattiverebbe gli
    achievement. Vedi ticore/presets.py.
    """
    try:
        res = presets.install(lang or state.lang)
    except (OSError, ValueError) as e:
        raise HTTPException(400, str(e))
    return dict(res, status=presets.status(lang or state.lang))


@app.post("/api/presets/restore")
def restore_presets(lang: str = Query(None)):
    try:
        res = presets.restore()
    except (OSError, ValueError) as e:
        raise HTTPException(400, str(e))
    return dict(res, status=presets.status(lang or state.lang))


class PresetIn(BaseModel):
    name: str
    weights: dict[str, int]


@app.post("/api/presets/custom")
def create_preset(p: PresetIn, lang: str = Query(None)):
    """Nuovo preset personale, in ~/.terrainvicta-companion/presets.json.

    Non tocca il gioco: per portarlo in partita serve reinstallare.
    """
    try:
        entry = presets.save_user(p.name, p.weights)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"id": entry["dataName"], "status": presets.status(lang or state.lang)}


@app.put("/api/presets/custom/{data_name}")
def update_preset(data_name: str, p: PresetIn, lang: str = Query(None)):
    try:
        presets.save_user(p.name, p.weights, data_name)
    except KeyError:
        raise HTTPException(404, "Preset personale non trovato.")
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"id": data_name, "status": presets.status(lang or state.lang)}


@app.delete("/api/presets/custom/{data_name}")
def delete_preset(data_name: str, lang: str = Query(None)):
    try:
        presets.delete_user(data_name)
    except KeyError:
        raise HTTPException(404, "Preset personale non trovato.")
    return {"status": presets.status(lang or state.lang)}


@app.get("/api/icons/{bundle}/{name}.png")
def game_icon(bundle: str, name: str):
    """Icona di una missione.

    Servita da `assets/icons/`, o estratta dall'installazione locale del gioco
    se manca da li'. Arte di Pavonis Interactive, fuori dalla licenza MIT del
    progetto: vedi LICENSE.
    """
    p = icons.icon_file(bundle, name)
    if not p:
        raise HTTPException(404, "icona non disponibile")
    return FileResponse(p, media_type="image/png",
                        headers={"Cache-Control": "public, max-age=86400"})


@app.get("/api/icons/status")
def icons_status():
    return {
        "available": icons.available(),
        "shipped": {b: icons.shipped_count(b) for b in icons.BUNDLES},
        "canExtract": icons.can_extract(),
        "cacheDir": icons.icons_dir(),
    }


@app.get("/api/snapshot")
def get_snapshot(lang: str = Query(None)):
    if lang and lang != state.lang:
        state.lang = lang
        state.reload(force=True)
    return state.require()


@app.get("/api/alerts")
def get_alerts():
    state.require()
    return {"alerts": state.alerts,
            "comparedTo": (state.previous or {}).get("date")}


@app.get("/api/languages")
def languages():
    return {"current": state.lang,
            "available": [{"id": k, "name": gamedata.LANGUAGES.get(k, k)}
                          for k in gamedata.available_languages()]}


@app.get("/api/saves")
def saves():
    return [{"name": os.path.basename(p), "mtime": m} for m, p in paths.list_saves()]


@app.get("/api/missions")
def mission_catalogue():
    snap = state.require()
    return missions.catalogue(snap, state.lang)


@app.get("/api/missions/{name}/plan")
def mission_plan(name: str, councilor: str = Query(None)):
    snap = state.require()
    return missions.plan(snap, name, councilor)


@app.get("/api/history")
def history():
    state.require()
    return store.history(state.con, state.campaign())


@app.get("/api/campaigns")
def campaigns():
    return store.campaigns(state.con)


@app.get("/api/nations/trends")
def nation_trends():
    """Serie storiche delle nazioni: stanno fuori dallo snapshot per non
    gonfiare lo storico archiviato a ogni salvataggio."""
    state.require()
    return state.trends or {"points": 0, "nations": {}}


@app.get("/api/nations/{name}/detail")
def nation_detail(name: str, lang: str = Query(None)):
    """Cause di variazione degli indicatori e priorita' dei nostri punti di
    controllo in quella nazione."""
    state.require()
    d = model.nation_detail(state.game, name, lang or state.lang)
    if d is None:
        raise HTTPException(404, "Nazione non trovata.")
    return d


@app.get("/api/factions")
def faction_compare(lang: str = Query(None)):
    """Le fazioni conosciute, coi soli campi che il nostro intel sblocca.
    Soglie e misure sono quelle del gioco: vedi ticore/factions.py."""
    state.require()
    return factions.compare(state.game, lang or state.lang)


@app.get("/api/diff")
def diff():
    """Cosa e' cambiato rispetto allo snapshot precedente."""
    cur, prev = state.require(), state.previous
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


# ---------------------------------------------------------- note e obiettivi

class NoteIn(BaseModel):
    subject: str
    body: str


class NoteEdit(BaseModel):
    body: str


class GoalIn(BaseModel):
    title: str
    kind: str | None = None
    target: str | None = None
    amount: float | None = None
    due: str | None = None


@app.get("/api/notes")
def notes(subject: str = Query(None)):
    return store.list_notes(state.con, state.campaign(), subject)


@app.post("/api/notes")
def note_add(n: NoteIn):
    return {"id": store.add_note(state.con, state.campaign(), n.subject, n.body)}


@app.put("/api/notes/{note_id}")
def note_edit(note_id: int, n: NoteEdit):
    store.update_note(state.con, note_id, n.body)
    return {"ok": True}


@app.delete("/api/notes/{note_id}")
def note_delete(note_id: int):
    store.delete_note(state.con, note_id)
    return {"ok": True}


@app.get("/api/goals")
def goals():
    return store.goal_progress(state.con, state.campaign(), state.require())


@app.post("/api/goals")
def goal_add(gl: GoalIn):
    return {"id": store.add_goal(state.con, state.campaign(), gl.title, gl.kind,
                                 gl.target, gl.amount, gl.due)}


@app.post("/api/goals/{goal_id}/done")
def goal_done(goal_id: int, done: bool = True):
    store.set_goal_done(state.con, goal_id, done)
    return {"ok": True}


@app.delete("/api/goals/{goal_id}")
def goal_delete(goal_id: int):
    store.delete_goal(state.con, goal_id)
    return {"ok": True}


# -------------------------------------------------------------------- SSE

@app.get("/api/stream")
async def stream():
    q: asyncio.Queue = asyncio.Queue()
    state.subscribers.add(q)

    async def gen():
        try:
            yield "retry: 3000\n\n"
            if state.snapshot:
                yield _sse({"type": "hello", "date": state.snapshot["date"],
                            "save": state.snapshot["save"],
                            "faction": state.snapshot["faction"],
                            "alerts": state.alerts})
            while True:
                try:
                    ev = await asyncio.wait_for(q.get(), timeout=20)
                    yield _sse(ev)
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"   # tiene viva la connessione
        finally:
            state.subscribers.discard(q)

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache",
                                      "X-Accel-Buffering": "no"})


def _sse(obj):
    return "data: %s\n\n" % json.dumps(obj, ensure_ascii=False)
