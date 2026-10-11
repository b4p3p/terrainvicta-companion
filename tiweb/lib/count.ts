"use client";

/* Contatore senza identificativo: quante persone aprono e usano il companion.

   In localStorage resta solo la data (UTC) dell'ultimo conteggio di ogni
   evento, nessun ID. Al primo evento del giorno parte una richiesta vuota a
   /hit, che nginx annota in un log a parte senza IP e chiude con 204:
     e  visit (pagina aperta) · use (partita letta) · demo (demo avviata)
     n  primo conteggio in assoluto da questo browser: un utente nuovo
     w  primo della settimana ISO, m primo del mese: i browser attivi in
        settimana e nel mese, contati senza riconoscerli
   Ogni riga e' quindi un browser attivo quel giorno. I conti li fa
   /opt/stats/stats-report (deploy/stats/stats-report.sh).

   Solo il sito online: la copia locale e i bot che eseguono JavaScript non
   contano. */

export type CountEvent = "visit" | "use" | "demo";

const BOTS = /bot|crawl|spider|slurp|Google-|GoogleOther|Lighthouse|HeadlessChrome|Chrome-Lighthouse/i;

/** Anno e settimana ISO di una data, come «2026-W41». */
function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const jan1 = Date.UTC(t.getUTCFullYear(), 0, 1);
  return `${t.getUTCFullYear()}-W${Math.ceil(((t.getTime() - jan1) / 864e5 + 1) / 7)}`;
}

export function count(e: CountEvent) {
  // NEXT_PUBLIC_ENGINE e non LOCKED_ENGINE: engine.ts importa questo modulo
  if (process.env.NEXT_PUBLIC_ENGINE !== "browser" || typeof window === "undefined") return;
  if (["localhost", "127.0.0.1"].includes(window.location.hostname)) return;
  if (navigator.webdriver || BOTS.test(navigator.userAgent)) return;

  const key = `ti.count.${e}`;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  let last: string | null;
  try {
    last = localStorage.getItem(key);
    if (last === today) return;
    localStorage.setItem(key, today);
  } catch {
    return;              // storage bloccato: contare a ogni pagina gonfierebbe i numeri
  }

  const q = new URLSearchParams({ e });
  if (!last) q.set("n", "1");
  if (!last || isoWeek(new Date(last)) !== isoWeek(now)) q.set("w", "1");
  if (!last || last.slice(0, 7) !== today.slice(0, 7)) q.set("m", "1");
  fetch(`/hit?${q}`, { cache: "no-store", credentials: "omit", keepalive: true }).catch(() => {});
}
