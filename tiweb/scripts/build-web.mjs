// Build del sito online: motore fissato nel browser, export statico in out/.
// Uno script invece di `NEXT_PUBLIC_ENGINE=browser next build` perche' quella
// sintassi non esiste in PowerShell ne' in cmd.
import { spawnSync } from "node:child_process";
import { copyFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// `npm run build` e non `next build`: prebuild copia ticore, Pyodide e l'estratto
// comando in una stringa sola: con shell e un array di argomenti Node emette
// DEP0190 su stderr, e PowerShell con ErrorActionPreference=Stop lo prende
// per un errore (deploy.ps1 si fermava li')
const r = spawnSync("npm run build", {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, NEXT_PUBLIC_ENGINE: "browser" },
});
if (r.status !== 0) process.exit(r.status ?? 1);

/* Il prefetch di Next 16 chiede `about/__next.about.__PAGE__.txt`, ma l'export
   statico scrive `about/__next.about/__PAGE__.txt`: 404 in console a ogni
   pagina, e il prefetch non serve a niente. Si copia ogni file delle cartelle
   `__next.*` anche col nome piatto che il browser cerca, cosi' funziona su
   qualunque server statico senza regole di riscrittura. */
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "out");
let copied = 0;
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (!statSync(p).isDirectory() || name === "pyodide" || name === "_next") continue;
    if (name.startsWith("__next.")) {
      for (const f of readdirSync(p)) {
        if (statSync(join(p, f)).isFile()) {
          copyFileSync(join(p, f), join(dir, `${name}.${f}`));
          copied++;
        }
      }
    }
    walk(p);
  }
}
walk(out);
console.log(`prefetch: ${copied} file copiati col nome che chiede il browser`);
