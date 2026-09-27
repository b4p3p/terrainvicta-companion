"""API del companion: legge i salvataggi, valuta le allerte, spinge via SSE.

    uvicorn tiserver.main:app --port 8732 --reload

La logica delle rotte sta in `ticore/service.py`, che gira identica anche nel
worker del browser: qui restano solo quello che vuole un server vero — il
watcher, lo stream SSE e le icone — e la traduzione da HTTP a `Service`.

Il watcher gira in background: sorveglia la mtime del salvataggio piu' recente,
ricostruisce lo snapshot quando cambia, lo archivia e rivaluta le allerte.
I client ricevono l'aggiornamento su /api/stream senza interrogare nulla.
"""

import asyncio
import json
import os
import sys
from contextlib import contextmanager

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ticore import texts                          # noqa: E402
from ticore.service import Service, ServiceError  # noqa: E402
from . import icons                             # noqa: E402

app = FastAPI(title="TerraInvictaCompanion", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"], allow_headers=["*"],
)

POLL_SECONDS = 3.0

# TI_GAMEDATA: l'estratto di ticore/bundle.py al posto dell'installazione del
# gioco, per far girare l'API dove il gioco non c'e' (es. Linux)
if os.environ.get("TI_GAMEDATA"):
    from ticore import bundle
    bundle.load(os.environ["TI_GAMEDATA"])

state = Service()
subscribers = set()


@app.middleware("http")
async def request_lang(request: Request, call_next):
    """I testi di ticore (errori compresi) nella lingua di questa richiesta:
    `?lang=` se c'e', altrimenti quella corrente del Service."""
    texts.LANG = request.query_params.get("lang") or state.lang
    return await call_next(request)


@contextmanager
def http_errors():
    try:
        yield
    except ServiceError as e:
        raise HTTPException(e.status, e.message)


async def broadcast(event):
    dead = []
    for q in subscribers:
        try:
            q.put_nowait(event)
        except Exception:
            dead.append(q)
    for q in dead:
        subscribers.discard(q)


@app.on_event("startup")
async def startup():
    state.reload(force=True)
    asyncio.create_task(watcher())


async def watcher():
    while True:
        await asyncio.sleep(POLL_SECONDS)
        try:
            if await asyncio.to_thread(state.reload):
                await broadcast(state.event())
        except Exception as e:
            state.error = str(e)


# ------------------------------------------------------------------ rotte

@app.get("/api/health")
def health():
    return state.health()


@app.get("/api/research")
def research(lang: str = Query(None)):
    with http_errors():
        return state.research(lang)


@app.get("/api/version")
def version():
    return state.version()


@app.get("/api/presets")
def list_presets(lang: str = Query(None)):
    return state.presets_status(lang)


@app.post("/api/presets/install")
def install_presets(lang: str = Query(None)):
    with http_errors():
        return state.presets_install(lang)


@app.get("/api/presets/export")
def export_presets():
    with http_errors():
        return state.presets_export()


@app.post("/api/presets/restore")
def restore_presets(lang: str = Query(None)):
    with http_errors():
        return state.presets_restore(lang)


class PresetIn(BaseModel):
    name: str
    weights: dict[str, int]


@app.post("/api/presets/custom")
def create_preset(p: PresetIn, lang: str = Query(None), install: bool = Query(False)):
    with http_errors():
        return state.preset_create(p.name, p.weights, lang, install)


@app.put("/api/presets/custom/{data_name}")
def update_preset(data_name: str, p: PresetIn, lang: str = Query(None),
                  install: bool = Query(False)):
    with http_errors():
        return state.preset_update(data_name, p.name, p.weights, lang, install)


@app.delete("/api/presets/custom/{data_name}")
def delete_preset(data_name: str, lang: str = Query(None)):
    with http_errors():
        return state.preset_delete(data_name, lang)


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
    with http_errors():
        return state.get_snapshot(lang)


@app.get("/api/alerts")
def get_alerts(lang: str = Query(None)):
    with http_errors():
        return state.get_alerts(lang)


@app.get("/api/languages")
def languages():
    return state.languages()


@app.get("/api/saves")
def saves():
    return state.saves()


@app.get("/api/missions")
def mission_catalogue(lang: str = Query(None)):
    with http_errors():
        return state.mission_catalogue(lang)


@app.get("/api/missions/{name}/plan")
def mission_plan(name: str, councilor: str = Query(None), lang: str = Query(None)):
    with http_errors():
        return state.mission_plan(name, councilor, lang)


@app.get("/api/history")
def history():
    with http_errors():
        return state.history()


@app.get("/api/campaigns")
def campaigns():
    return state.campaigns()


@app.get("/api/nations/trends")
def nation_trends():
    with http_errors():
        return state.nation_trends()


@app.get("/api/nations/{name}/detail")
def nation_detail(name: str, lang: str = Query(None)):
    with http_errors():
        return state.nation_detail(name, lang)


@app.get("/api/factions")
def faction_compare(lang: str = Query(None)):
    with http_errors():
        return state.faction_compare(lang)


@app.get("/api/space")
def space(lang: str = Query(None)):
    with http_errors():
        return state.space(lang)


@app.get("/api/diff")
def diff():
    with http_errors():
        return state.diff()


# ---------------------------------------------------- export e import dei dati

class DataIn(BaseModel):
    file: str | None = None
    base64: str


@app.get("/api/data")
def data_summary():
    return state.data_summary()


@app.get("/api/data/export")
def data_export():
    return state.data_export()


@app.post("/api/data/import")
def data_import(d: DataIn):
    with http_errors():
        return state.data_import(d.base64)


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
    with http_errors():
        return state.notes(subject)


@app.post("/api/notes")
def note_add(n: NoteIn):
    with http_errors():
        return state.note_add(n.subject, n.body)


@app.put("/api/notes/{note_id}")
def note_edit(note_id: int, n: NoteEdit):
    return state.note_edit(note_id, n.body)


@app.delete("/api/notes/{note_id}")
def note_delete(note_id: int):
    return state.note_delete(note_id)


@app.get("/api/goals")
def goals():
    with http_errors():
        return state.goals()


@app.post("/api/goals")
def goal_add(gl: GoalIn):
    with http_errors():
        return state.goal_add(gl.title, gl.kind, gl.target, gl.amount, gl.due)


@app.post("/api/goals/{goal_id}/done")
def goal_done(goal_id: int, done: bool = True):
    return state.goal_done(goal_id, done)


@app.delete("/api/goals/{goal_id}")
def goal_delete(goal_id: int):
    return state.goal_delete(goal_id)


# -------------------------------------------------------------------- SSE

@app.get("/api/stream")
async def stream():
    q: asyncio.Queue = asyncio.Queue()
    subscribers.add(q)

    async def gen():
        try:
            yield "retry: 3000\n\n"
            if state.snapshot:
                yield _sse(state.event("hello"))
            while True:
                try:
                    ev = await asyncio.wait_for(q.get(), timeout=20)
                    yield _sse(ev)
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"   # tiene viva la connessione
        finally:
            subscribers.discard(q)

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache",
                                      "X-Accel-Buffering": "no"})


def _sse(obj):
    return "data: %s\n\n" % json.dumps(obj, ensure_ascii=False)
