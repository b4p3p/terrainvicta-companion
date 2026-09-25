/* Motore del companion nel browser: ticore dentro Pyodide.

   Fa il lavoro di tiserver senza server: sorveglia la cartella dei
   salvataggi (handle della File System Access API passato dalla pagina),
   ricostruisce lo snapshot quando il gioco salva e risponde alle stesse rotte
   /api/* attraverso ticore.service.Service.dispatch.

   Messaggi dalla pagina:
     {t:"init", lang}                       avvio; risponde {t:"ready", languages}
     {t:"folder", handle}                   cartella Saves concessa: parte il controllo
     {t:"req", id, method, path, query, body}  risponde {t:"res", id, ok, status, data|error}
   Verso la pagina, oltre alle risposte:
     {t:"event", ev}      come l'SSE di tiserver: hello / snapshot
     {t:"status", state, detail}   loading | ready | nofolder | nosaves | permission | error;
                                   con loading, detail e' il passo: runtime code gamedata save

   Worker di tipo modulo: Pyodide 314 non supporta piu' quelli classici. */

import { loadPyodide } from "/pyodide/pyodide.mjs";

const POLL_MS = 3000;
const HOME = "/home/pyodide/.terrainvicta-companion";   // paths.data_dir()
const PERSIST = ["companion.db", "presets.json"];       // cio' che store/presets scrivono

let py = null;
let service = null;
let dir = null;
let lastKey = "";
let busy = false;
const loadedLangs = new Set();

// Le richieste che vogliono uno snapshot aspettano il primo salvataggio letto:
// prima Service risponderebbe «Cartella dei salvataggi non trovata», che nel
// browser e' falso (la cartella c'e', la si sta leggendo). Le altre rotte non
// dipendono dal salvataggio e passano subito.
let snapshotLoaded;
const firstSnapshot = new Promise((ok) => { snapshotLoaded = ok; });
const WITHOUT_SNAPSHOT = /^\/api\/(health|languages|campaigns|data|presets)(\/|$)/;

const post = (m) => postMessage(m);
const status = (state, detail = null) => post({ t: "status", state, detail });

// ------------------------------------------------------------ IndexedDB

function idb(mode, fn) {
  return new Promise((ok, ko) => {
    const open = indexedDB.open("ti-companion", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("kv");
    open.onerror = () => ko(open.error);
    open.onsuccess = () => {
      const req = fn(open.result.transaction("kv", mode).objectStore("kv"));
      req.onsuccess = () => ok(req.result);
      req.onerror = () => ko(req.error);
    };
  });
}

// Lo storico, le note, gli obiettivi e i preset personali stanno in file
// SQLite/JSON dentro il file system in memoria di Pyodide: a ogni modifica
// se ne salva una copia in IndexedDB, all'avvio la si rimette al suo posto.
async function restoreFiles() {
  py.FS.mkdirTree(HOME);
  for (const f of PERSIST) {
    const bytes = await idb("readonly", (s) => s.get("file:" + f));
    if (bytes) py.FS.writeFile(`${HOME}/${f}`, bytes);
  }
}

async function persistFiles() {
  for (const f of PERSIST) {
    const p = `${HOME}/${f}`;
    if (!py.FS.analyzePath(p).exists) continue;
    const bytes = py.FS.readFile(p);
    await idb("readwrite", (s) => s.put(bytes, "file:" + f));
  }
}

// ------------------------------------------------------------ avvio

async function fetchText(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.text();
}

async function ensureLang(lang) {
  if (!lang || loadedLangs.has(lang)) return;
  let text;
  try { text = await fetchText(`/gamedata/loc/${lang}.json`); }
  catch { return; }                         // lingua assente: ricade sull'inglese
  py.globals.set("LOC", text);
  py.runPython(`from ticore import gamedata; import json
gamedata.add_strings(${JSON.stringify(lang)}, json.loads(LOC)); del LOC`);
  loadedLangs.add(lang);
}

async function init(lang) {
  status("loading", "runtime");
  py = await loadPyodide({ indexURL: "/pyodide/" });

  status("loading", "code");
  const files = JSON.parse(await fetchText("/py/ticore/manifest.json"));
  py.FS.mkdirTree("/lib/ticore");
  for (const f of files) py.FS.writeFile(`/lib/ticore/${f}`, await fetchText(`/py/ticore/${f}`));

  status("loading", "gamedata");
  const manifest = JSON.parse(await fetchText("/gamedata/manifest.json"));
  const langs = [...new Set(["en", lang])].filter((l) => l in manifest.languages);
  py.globals.set("TPL", await fetchText("/gamedata/templates.json"));
  const loc = {};
  for (const l of langs) loc[l] = await fetchText(`/gamedata/loc/${l}.json`);
  py.globals.set("LOC", py.toPy(loc));
  py.globals.set("LANGS", py.toPy(Object.keys(manifest.languages)));
  langs.forEach((l) => loadedLangs.add(l));

  // presets.py cerca i preset distribuiti in <repo>/assets/presets: nel
  // file system del worker il "repo" e' /lib
  py.FS.mkdirTree("/lib/assets/presets");
  py.FS.writeFile("/lib/assets/presets/TIPriorityPresetTemplate.json",
                  await fetchText("/py/assets/presets/TIPriorityPresetTemplate.json"));
  py.globals.set("PRESETS", await fetchText("/gamedata/presets-template.json"));

  await restoreFiles();
  py.runPython(`
import sys, json
sys.path.insert(0, "/lib")
import ticore.paths as P
P.SAVE_DIRS = ["/saves"]
P.GAME_DIRS = []                     # nessuna installazione: solo l'estratto
from ticore import gamedata
from ticore.service import Service, ServiceError
gamedata.use_bundle(json.loads(TPL), {l: json.loads(v) for l, v in LOC.items()}, list(LANGS))
from ticore import presets
presets.use_bundled_template(json.loads(PRESETS))
del TPL, LOC, LANGS, PRESETS
`);
  service = py.runPython(`s = Service(); s.lang = ${JSON.stringify(lang)}; s`);
  post({ t: "ready", gameVersion: manifest.gameVersion });
  // senza cartella non e' "nosaves": la pagina puo' averne una in attesa del
  // permesso, e sa lei cosa mostrare (Engine.setStatus)
  status(dir ? "loading" : "nofolder", "save");
}

// ------------------------------------------------------------ salvataggi

async function newest() {
  let best = null;
  for await (const h of dir.values()) {
    if (h.kind !== "file" || !h.name.toLowerCase().endsWith(".gz")) continue;
    const f = await h.getFile();
    if (!best || f.lastModified > best.lastModified) best = f;
  }
  return best;
}

async function poll() {
  if (!service || !dir || busy) return;
  busy = true;
  try {
    if ((await dir.queryPermission({ mode: "read" })) !== "granted") {
      status("permission");
      return;
    }
    const f = await newest();
    if (!f) { status("nosaves", "nessun .gz nella cartella"); return; }
    const key = `${f.name}|${f.lastModified}|${f.size}`;
    if (key === lastKey) return;

    // un solo salvataggio in memoria: quello piu' recente, con la sua mtime
    py.FS.mkdirTree("/saves");
    for (const n of py.FS.readdir("/saves")) if (n !== "." && n !== "..") py.FS.unlink(`/saves/${n}`);
    const dest = `/saves/${f.name}`;
    py.FS.writeFile(dest, new Uint8Array(await f.arrayBuffer()));
    py.FS.utime(dest, f.lastModified, f.lastModified);

    service.pinned = dest;
    const first = !lastKey;
    const changed = service.reload(true);
    if (!changed) {                           // il gioco lo stava scrivendo
      status("loading", "save");   // il gioco lo stava scrivendo: riprovo
      return;
    }
    lastKey = key;
    snapshotLoaded();
    await persistFiles();
    const ev = py.runPython(`json.dumps(s.event(${JSON.stringify(first ? "hello" : "snapshot")}), default=str)`);
    post({ t: "event", ev: JSON.parse(ev) });
    status("ready");
  } catch (e) {
    status("error", String(e));
  } finally {
    busy = false;
  }
}

// ------------------------------------------------------------ richieste

async function request({ id, method, path, query, body }) {
  try {
    if (!service) throw Object.assign(new Error("Motore non ancora pronto"), { status: 503 });
    if (!WITHOUT_SNAPSHOT.test(path)) await firstSnapshot;
    await ensureLang(query?.lang);
    py.globals.set("REQ", py.toPy({ method, path, query: query || {}, body: body ?? null }));
    const out = py.runPython(`
try:
    _r = {"ok": True, "status": 200,
          "data": json.dumps(s.dispatch(REQ["method"], REQ["path"], REQ["query"], REQ["body"]),
                             default=str, ensure_ascii=False)}
except ServiceError as e:
    _r = {"ok": False, "status": e.status, "error": e.message}
del REQ
json.dumps(_r)
`);
    const r = JSON.parse(out);
    if (r.ok) r.data = JSON.parse(r.data);
    if (method !== "GET" && r.ok) await persistFiles();
    post({ t: "res", id, ...r });
  } catch (e) {
    post({ t: "res", id, ok: false, status: e.status || 500, error: String(e) });
  }
}

// ------------------------------------------------------------ messaggi

let ready = null;

onmessage = async ({ data }) => {
  if (data.t === "init") {
    ready = init(data.lang).catch((e) => status("error", String(e)));
    await ready;
    setInterval(poll, POLL_MS);
    poll();
  } else if (data.t === "folder") {
    dir = data.handle;
    lastKey = "";
    await ready;
    poll();
  } else if (data.t === "req") {
    await ready;
    request(data);
  }
};
