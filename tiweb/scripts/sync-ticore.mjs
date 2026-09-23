// Copia ticore/*.py in public/py/ticore/ con un manifest, Pyodide da
// node_modules in public/pyodide/ (niente CDN: si serve da noi), e rigenera
// in public/gamedata/ l'estratto dei dati del gioco (ticore/bundle.py).
// Sono tutte copie generate e gitignorate: l'estratto sono dati di Pavonis.

import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "..", "ticore");
const dst = join(here, "..", "public", "py", "ticore");

rmSync(dst, { recursive: true, force: true });
mkdirSync(dst, { recursive: true });
const files = readdirSync(src).filter((f) => f.endsWith(".py"));
for (const f of files) copyFileSync(join(src, f), join(dst, f));
writeFileSync(join(dst, "manifest.json"), JSON.stringify(files));
console.log(`ticore: ${files.length} file -> public/py/ticore`);

// Pyodide: solo il nucleo. sqlite3 in questa versione sta gia' nella stdlib.
const pyo = join(here, "..", "node_modules", "pyodide");
const pyoDst = join(here, "..", "public", "pyodide");
mkdirSync(pyoDst, { recursive: true });
for (const f of ["pyodide.mjs", "pyodide.asm.mjs", "pyodide.asm.wasm",
                 "python_stdlib.zip", "pyodide-lock.json"])
  copyFileSync(join(pyo, f), join(pyoDst, f));
console.log("pyodide: nucleo -> public/pyodide");

// icone delle missioni e delle risorse: nella versione web sono file statici
// (arte di Pavonis, come l'estratto: vedi assets/icons/README.md)
const iconsSrc = join(here, "..", "..", "assets", "icons");
const iconsDst = join(here, "..", "public", "icons");
rmSync(iconsDst, { recursive: true, force: true });
cpSync(iconsSrc, iconsDst, { recursive: true, filter: (p) => !p.endsWith(".md") });
console.log("icone: assets/icons -> public/icons");

// l'estratto richiede il gioco installato: se manca, la build va avanti e la
// pagina ricade sulla cartella scelta dall'utente
const out = join(here, "..", "public", "gamedata");
const r = spawnSync("python", ["-m", "ticore.bundle", out],
  { cwd: join(here, "..", ".."), encoding: "utf-8" });
console.log(r.status === 0 ? r.stdout.trim()
  : `gamedata: estratto non generato (${(r.stderr || r.error || "").toString().trim().split("\n").pop()})`);
