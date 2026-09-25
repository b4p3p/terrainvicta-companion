import type { NextConfig } from "next";

/* Il sito online e' la sola versione "browser", esportata come file statici
   (`npm run build:web` -> out/). trailingSlash: ogni pagina diventa
   cartella/index.html, che Apache serve senza regole di riscrittura.
   Senza NEXT_PUBLIC_ENGINE e' la copia locale, che parla con tiserver. */
const web = process.env.NEXT_PUBLIC_ENGINE === "browser";

const nextConfig: NextConfig = web
  ? { output: "export", trailingSlash: true }
  : {};

export default nextConfig;
