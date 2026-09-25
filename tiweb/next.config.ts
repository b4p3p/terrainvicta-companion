import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { NextConfig } from "next";

/* Il sito online e' la sola versione "browser", esportata come file statici
   (`npm run build:web` -> out/). trailingSlash: ogni pagina diventa
   cartella/index.html, che il server serve senza regole di riscrittura.
   Senza NEXT_PUBLIC_ENGINE e' la copia locale, che parla con tiserver. */
const web = process.env.NEXT_PUBLIC_ENGINE === "browser";

/* Versione del companion, scritta nella build e mostrata in «Chi sono»:
   quella di package.json, la data della build e il commit. */
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8"));
function commit() {
  try {
    const sha = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
    const dirty = execSync("git status --porcelain", { encoding: "utf-8" }).trim();
    return dirty ? `${sha}+` : sha;           // + = modifiche non committate
  } catch {
    return "";
  }
}

const nextConfig: NextConfig = {
  ...(web ? { output: "export" as const, trailingSlash: true } : {}),
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_BUILD_DATE: new Date().toISOString(),
    NEXT_PUBLIC_COMMIT: commit(),
  },
};

export default nextConfig;
