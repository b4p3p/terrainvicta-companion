// Copia ticore/*.py in public/py/ticore/ con un manifest, per Pyodide.
// ticore resta l'unica fonte: questa e' una copia generata (gitignorata).

import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
