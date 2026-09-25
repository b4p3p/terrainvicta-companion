// Build del sito online: motore fissato nel browser, export statico in out/.
// Uno script invece di `NEXT_PUBLIC_ENGINE=browser next build` perche' quella
// sintassi non esiste in PowerShell ne' in cmd.
import { spawnSync } from "node:child_process";

// `npm run build` e non `next build`: prebuild copia ticore, Pyodide e l'estratto
const r = spawnSync("npm", ["run", "build"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, NEXT_PUBLIC_ENGINE: "browser" },
});
process.exit(r.status ?? 1);
