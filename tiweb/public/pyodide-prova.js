/* Worker della prova di fattibilita': esegue ticore dentro Pyodide.

   Riceve il File del salvataggio e i file del gioco gia' filtrati dalla
   pagina (template + localizzazione ita/en), li scrive nel file system in
   memoria e chiama model.snapshot(). Misura ogni passo. */

const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/";
importScripts(PYODIDE + "pyodide.js");

const GAME = "/game/TerraInvicta_Data/StreamingAssets";

let py = null;
const log = (testo) => postMessage({ tipo: "log", testo });

async function avvia() {
  if (py) return 0;
  const t = performance.now();
  py = await loadPyodide({ indexURL: PYODIDE });
  await py.loadPackage("sqlite3");          // store.py lo importa al primo livello
  const files = await (await fetch("/py/ticore/manifest.json")).json();
  py.FS.mkdirTree("/lib/ticore");
  for (const f of files) {
    const src = await (await fetch("/py/ticore/" + f)).text();
    py.FS.writeFile("/lib/ticore/" + f, src);
  }
  py.runPython(`
import sys; sys.path.insert(0, "/lib")
import ticore.paths as P
P.SAVE_DIRS = ["/saves"]
P.GAME_DIRS = ["/game"]
`);
  return performance.now() - t;
}

// files: { "Templates/X.json" | "Localization/ita/x.ita": Blob }, gia' filtrati
async function caricaGioco(files) {
  const t = performance.now();
  let byte = 0;
  for (const [rel, blob] of Object.entries(files)) {
    const dest = `${GAME}/${rel}`;
    py.FS.mkdirTree(dest.slice(0, dest.lastIndexOf("/")));
    py.FS.writeFile(dest, new Uint8Array(await blob.arrayBuffer()));
    byte += blob.size;
  }
  return { ms: performance.now() - t, byte };
}

onmessage = async ({ data }) => {
  try {
    log("carico Pyodide…");
    const msPyodide = await avvia();
    log(`Pyodide pronto (${Math.round(msPyodide)} ms)`);

    const gioco = await caricaGioco(data.files);
    log(`dati del gioco copiati: ${(gioco.byte / 1048576).toFixed(1)} MB`);

    py.FS.mkdirTree("/saves");
    const dest = "/saves/" + data.save.name;
    py.FS.writeFile(dest, new Uint8Array(await data.save.arrayBuffer()));

    py.globals.set("SAVE", dest);
    const r = py.runPython(`
import json, time
from ticore import save, model, gamedata
gamedata.templates.cache_clear(); gamedata.strings.cache_clear()
t0 = time.perf_counter()
g = save.Game(SAVE)
t1 = time.perf_counter()
snap = model.snapshot(g, "ita")
t2 = time.perf_counter()
out = json.dumps(snap, default=str)
t3 = time.perf_counter()
json.dumps({
  "msGame": (t1 - t0) * 1000, "msSnapshot": (t2 - t1) * 1000, "msJson": (t3 - t2) * 1000,
  "byteSnapshot": len(out),
  "fazione": snap["faction"], "data": snap["date"], "campagna": snap["campaignStart"],
  "cpMiei": snap["controlPoints"]["mine"],
  "consiglio": [c.get("name") for c in snap["council"].get("team", [])],
  "missioneEsempio": gamedata.mission_name("ita", "GainInfluence"),
})
`);
    postMessage({ tipo: "fatto", msPyodide, msGioco: gioco.ms, byteGioco: gioco.byte,
                  ...JSON.parse(r) });
  } catch (e) {
    postMessage({ tipo: "errore", testo: String(e) });
  }
};
