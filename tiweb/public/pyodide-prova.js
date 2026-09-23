/* Worker della prova di fattibilita': esegue ticore dentro Pyodide.

   Riceve il File del salvataggio. I dati del gioco arrivano dall'estratto
   incluso nel sito (/gamedata, vedi ticore/bundle.py) oppure, come ripiego,
   dai file della cartella scelta dall'utente. Poi chiama model.snapshot() e
   misura ogni passo. */

// Worker di tipo modulo: da Pyodide 314 i worker classici (importScripts) non
// sono piu' supportati. Servito da noi: scripts/sync-ticore.mjs lo copia da
// node_modules.
import { loadPyodide } from "/pyodide/pyodide.mjs";

const PYODIDE = "/pyodide/";

const GAME = "/game/TerraInvicta_Data/StreamingAssets";

let py = null;
const log = (testo) => postMessage({ tipo: "log", testo });

async function avvia() {
  if (py) return 0;
  const t = performance.now();
  py = await loadPyodide({ indexURL: PYODIDE });
  log(`interprete pronto (${Math.round(performance.now() - t)} ms), copio ticore…`);
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

// Estratto incluso nel sito (ticore/bundle.py): template + le sole lingue che
// servono. Nessun file del gioco da scegliere.
async function caricaEstratto(lingue) {
  const t = performance.now();
  const get = async (p) => {
    const r = await fetch("/gamedata/" + p);
    if (!r.ok) throw new Error(`/gamedata/${p}: ${r.status} (estratto non generato?)`);
    return r.text();
  };
  const manifest = JSON.parse(await get("manifest.json"));
  const tpl = await get("templates.json");
  const loc = {};
  for (const l of lingue) loc[l] = await get(`loc/${l}.json`);
  let byte = tpl.length;
  for (const v of Object.values(loc)) byte += v.length;
  py.globals.set("TPL", tpl);
  py.globals.set("LOC", py.toPy(loc));
  py.runPython(`
import json
from ticore import gamedata
gamedata.use_bundle(json.loads(TPL), {l: json.loads(v) for l, v in LOC.items()})
del TPL, LOC
`);
  return { ms: performance.now() - t, byte, versione: manifest.gameVersion };
}

onmessage = async ({ data }) => {
  try {
    log("carico Pyodide…");
    const msPyodide = await avvia();
    log(`Pyodide pronto (${Math.round(msPyodide)} ms)`);

    let gioco;
    if (data.files) {
      py.runPython("from ticore import gamedata; gamedata.use_game_files()");
      gioco = { ...(await caricaGioco(data.files)), versione: null };
      log(`dati del gioco copiati dalla cartella: ${(gioco.byte / 1048576).toFixed(1)} MB`);
    } else {
      gioco = await caricaEstratto(["ita", "en"]);
      log(`estratto del sito caricato (gioco ${gioco.versione}): ${(gioco.byte / 1048576).toFixed(1)} MB`);
    }

    py.FS.mkdirTree("/saves");
    const dest = "/saves/" + data.save.name;
    py.FS.writeFile(dest, new Uint8Array(await data.save.arrayBuffer()));

    py.globals.set("SAVE", dest);
    const r = py.runPython(`
import json, time
from ticore import save, model, gamedata
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
  "versioneSalvataggio": g.globals.get("latestSaveVersion"),
})
`);
    postMessage({ tipo: "fatto", msPyodide, msGioco: gioco.ms, byteGioco: gioco.byte,
                  fonte: data.files ? "cartella" : "estratto", versioneDati: gioco.versione,
                  ...JSON.parse(r) });
  } catch (e) {
    postMessage({ tipo: "errore", testo: String(e) });
  }
};
