"use client";

/* Motore nel browser: ticore dentro Pyodide, in un worker.

   Sostituisce l'API locale (tiserver) quando il companion gira come sito
   statico. Le pagine non se ne accorgono: `api()` in lib/api.ts manda qui le
   stesse rotte /api/*, e `useLive()` riceve da qui gli eventi che prima
   arrivavano via SSE. La logica e' la stessa: ticore/service.py.

   La cartella dei salvataggi la sceglie l'utente (File System Access API, solo
   Chrome/Edge); il riferimento resta in IndexedDB, il permesso va richiesto
   con un clic. I dati del gioco arrivano dall'estratto in /gamedata. */

import { currentDict, gameLangFromBrowser } from "./i18n";

export type EngineMode = "browser" | "server";

/** Motore fissato in build (`NEXT_PUBLIC_ENGINE`): il sito online e' costruito
 *  con "browser" e non si puo' cambiare. Senza, e' la copia locale. */
export const LOCKED_ENGINE: EngineMode | null =
  process.env.NEXT_PUBLIC_ENGINE === "browser" || process.env.NEXT_PUBLIC_ENGINE === "server"
    ? process.env.NEXT_PUBLIC_ENGINE : null;

/** Sito online: sempre browser. Copia locale: server, salvo `?engine=browser`,
 *  che vale per la scheda (sessionStorage) e non per le prossime aperture:
 *  chi lancia start.ps1 ritrova sempre l'interfaccia collegata all'API. La
 *  stessa regola e' ripetuta in app/layout.tsx, prima dell'idratazione. */
export function engineMode(): EngineMode {
  if (LOCKED_ENGINE) return LOCKED_ENGINE;
  if (typeof window === "undefined") return "server";
  try {
    localStorage.removeItem("ti.engine");  // la vecchia scelta permanente
    const q = new URLSearchParams(window.location.search).get("engine");
    if (q === "browser" || q === "server") sessionStorage.setItem("ti.engine", q);
    const saved = sessionStorage.getItem("ti.engine");
    if (saved === "browser" || saved === "server") return saved;
  } catch { /* storage bloccato: si decide dall'ambiente */ }
  return ["localhost", "127.0.0.1"].includes(window.location.hostname) ? "server" : "browser";
}

/** Partita demo: i salvataggi dell'autore serviti dal sito (/demo/), per chi
 *  vuole vedere il companion senza il gioco o con un browser che non legge
 *  le cartelle. `?demo=1` la accende, `?demo=0` la spegne; vale per la scheda
 *  (sessionStorage), cosi' la navigazione fra le schede non la perde. */
export function demoMode(): boolean {
  if (typeof window === "undefined") return false;
  const q = new URLSearchParams(window.location.search).get("demo");
  try {
    if (q === "0") sessionStorage.removeItem("ti.demo");
    else if (q !== null) sessionStorage.setItem("ti.demo", "1");
    return sessionStorage.getItem("ti.demo") === "1";
  } catch {
    return q !== null && q !== "0";          // storage bloccato: solo l'URL
  }
}

/** Entrare o uscire dalla demo ricarica la pagina: il motore si avvia una
 *  volta sola, con o senza la cartella dell'utente. */
export const enterDemo = () => window.location.assign("/?demo=1");
export const exitDemo = () => window.location.assign("/?demo=0");

export type EngineState =
  | "loading"      // Pyodide, ticore o il primo salvataggio in caricamento
  | "nofolder"     // nessuna cartella scelta
  | "permission"   // cartella ricordata, permesso da riconcedere con un clic
  | "nosaves"      // cartella senza .gz
  | "ready"
  | "unsupported"  // niente File System Access API: non e' Chrome/Edge
  | "error";

/** Passi dell'avvio, in ordine: con `loading` il dettaglio e' uno di questi. */
export const BOOT_STEPS = ["runtime", "code", "gamedata", "save"] as const;
export type BootStep = (typeof BOOT_STEPS)[number];

export interface EngineStatus {
  state: EngineState;
  detail: string | null;
  /** passi dell'avvio completati (0-4); non torna indietro */
  done: number;
  /** vero dal primo snapshot in poi: da li' l'avvio e' finito per sempre */
  everReady: boolean;
  /** cartella dei salvataggi in uso, come «TerraInvicta\Saves» */
  folder: string | null;
}

export interface LiveEvent {
  type: "hello" | "snapshot";
  date: string; save: string; faction?: string;
  alerts: import("./types").Alert[];
}

// i tipi della File System Access API non sono tutti in lib.dom
type DirHandle = Omit<FileSystemDirectoryHandle, "getDirectoryHandle"> & {
  values(): AsyncIterable<FileSystemHandle>;
  getDirectoryHandle(name: string): Promise<DirHandle>;
  queryPermission(o: { mode: "read" }): Promise<PermissionState>;
  requestPermission(o: { mode: "read" }): Promise<PermissionState>;
};

export class EngineError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// ------------------------------------------------------------ IndexedDB
// stesso database del worker, che ci tiene storico e note

function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
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

// ------------------------------------------------------------ cartella

/* Il selettore non accetta un percorso: parte da Documenti. Si accetta anche
   un antenato di Saves (My Games, TerraInvicta) e si scende noi. Documenti
   intera Chrome la rifiuta: blocca la cartella, non il suo contenuto
   (DIR_USER_DOCUMENTS, kDontBlockChildren). */
const TO_SAVES = ["My Games", "TerraInvicta", "Saves"];

async function hasSaves(dir: DirHandle) {
  for await (const h of dir.values())
    if (h.kind === "file" && h.name.toLowerCase().endsWith(".gz")) return true;
  return false;
}

/** La cartella Saves e il percorso da quella scelta, da mostrare: il browser
 *  non da' il percorso assoluto, solo i nomi. */
async function resolveSaves(dir: DirHandle): Promise<{ dir: DirHandle; label: string } | null> {
  if (await hasSaves(dir)) return { dir, label: dir.name };
  const at = TO_SAVES.indexOf(dir.name);
  for (const start of at >= 0 ? [at + 1] : [0, 1, 2]) {
    let cur = dir;
    try {
      for (const name of TO_SAVES.slice(start)) cur = await cur.getDirectoryHandle(name);
      if (await hasSaves(cur))
        return { dir: cur, label: [dir.name, ...TO_SAVES.slice(start)].join("\\") };
    } catch { /* percorso assente: si prova il prossimo */ }
  }
  return null;
}

// ------------------------------------------------------------ motore

/** Lingua di gioco scelta (lib/settings.tsx), per partire gia' con quella. */
function savedGameLang() {
  try { return localStorage.getItem("ti.game") || gameLangFromBrowser(); } catch { return gameLangFromBrowser(); }
}

type Pending = { ok: (v: unknown) => void; ko: (e: Error) => void };

class Engine {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, Pending>();
  private dir: DirHandle | null = null;
  private folder: string | null = null;
  /* Cartella ricordata ma senza permesso: un flag e non lo stato corrente,
     perche' durante l'avvio i "loading" del worker lo sovrascrivono. */
  private needsPermission = false;
  private eventSubs = new Set<(e: LiveEvent) => void>();
  private statusSubs = new Set<(s: EngineStatus) => void>();
  private last: LiveEvent | null = null;
  status: EngineStatus = { state: "loading", detail: "runtime", done: 0, everReady: false, folder: null };
  gameVersion: string | null = null;

  /** Avvia il worker, una volta sola. Lo chiama chi arriva prima: `useLive`
   *  o la prima richiesta, che nel montaggio di React possono venire prima. */
  start(lang = savedGameLang()) {
    if (this.worker || this.status.state === "unsupported") return;
    // la demo non legge cartelle: funziona anche in Firefox e Safari
    const demo = demoMode();
    if (!demo && !("showDirectoryPicker" in window)) {
      this.setStatus("unsupported");
      return;
    }
    this.worker = new Worker("/engine-worker.js", { type: "module" });
    this.worker.onerror = (e) => this.setStatus("error", e.message || currentDict().engine.workerError);
    this.worker.onmessage = ({ data }) => this.onMessage(data);
    this.worker.postMessage({ t: "init", lang, demo });
    if (!demo) void this.restoreFolder();
  }

  private async restoreFolder() {
    try {
      const h = await idb<DirHandle | undefined>("readonly", (s) => s.get("savesDir"));
      if (!h) return this.setStatus("nofolder");
      this.dir = h;
      // scelte fatte prima che si ricordasse il percorso: solo il nome
      this.folder = (await idb<string | undefined>("readonly", (s) => s.get("savesLabel"))) ?? h.name;
      if ((await h.queryPermission({ mode: "read" })) === "granted") this.sendFolder();
      else {
        this.needsPermission = true;
        this.setStatus("permission");
      }
    } catch (e) {
      this.setStatus("error", String(e));
    }
  }

  private sendFolder() {
    this.needsPermission = false;
    this.setStatus("loading", "save");
    this.worker?.postMessage({ t: "folder", handle: this.dir });
  }

  /** Scelta della cartella: va chiamata da un clic. */
  async pickFolder(): Promise<string | null> {
    let chosen: DirHandle;
    try {
      chosen = await (window as unknown as {
        showDirectoryPicker(o: object): Promise<DirHandle>;
      }).showDirectoryPicker({ id: "ti-saves", mode: "read", startIn: this.dir ?? "documents" });
    } catch {
      return null;                                  // annullata
    }
    const saves = await resolveSaves(chosen);
    if (!saves) return currentDict().engine.noSavesIn.replace("{name}", chosen.name);
    await idb("readwrite", (s) => s.put(saves.dir, "savesDir"));
    await idb("readwrite", (s) => s.put(saves.label, "savesLabel"));
    this.dir = saves.dir;
    this.folder = saves.label;
    this.sendFolder();
    return null;
  }

  /** Riconcede il permesso sulla cartella ricordata: va chiamata da un clic. */
  async regrant() {
    if (!this.dir) return;
    if ((await this.dir.requestPermission({ mode: "read" })) === "granted") this.sendFolder();
  }

  request<T>(method: string, path: string, query: Record<string, string>, body?: unknown): Promise<T> {
    this.start();
    if (!this.worker) return Promise.reject(new EngineError(503, this.status.detail ?? currentDict().engine.unavailable));
    const id = ++this.seq;
    return new Promise<T>((ok, ko) => {
      this.pending.set(id, { ok: ok as (v: unknown) => void, ko });
      this.worker!.postMessage({ t: "req", id, method, path, query, body });
    });
  }

  onEvent(fn: (e: LiveEvent) => void) {
    this.eventSubs.add(fn);
    if (this.last) fn({ ...this.last, type: "hello" });
    return () => { this.eventSubs.delete(fn); };
  }

  onStatus(fn: (s: EngineStatus) => void) {
    this.statusSubs.add(fn);
    fn(this.status);
    return () => { this.statusSubs.delete(fn); };
  }

  private setStatus(state: EngineState, detail: string | null = null) {
    /* Il worker dice "nofolder" quando ha finito l'avvio senza una cartella.
       Ma la pagina puo' averne una ricordata e in attesa del permesso (o gia'
       in viaggio verso il worker): in quel caso lo stato giusto e' il suo.
       Prima qui arrivava "nosaves", e con il permesso da riconcedere la
       pagina diceva «non ci sono salvataggi» di una cartella mai letta. */
    if (this.needsPermission && (state === "loading" || state === "nofolder"))
      state = "permission";          // i passi avanzano, il pulsante resta
    else if (state === "nofolder" && this.dir)
      state = "loading";             // cartella gia' in viaggio verso il worker
    let done = this.status.done;
    const i = BOOT_STEPS.indexOf(detail as BootStep);
    if (i >= 0) done = Math.max(done, i);
    if (state === "ready") done = BOOT_STEPS.length;
    this.status = { state, detail, done, folder: this.folder,
                    everReady: this.status.everReady || state === "ready" };
    this.statusSubs.forEach((f) => f(this.status));
  }

  private onMessage(m: {
    t: string; id?: number; ok?: boolean; status?: number; data?: unknown;
    error?: string; ev?: LiveEvent; state?: EngineState; detail?: string | null;
    gameVersion?: string;
  }) {
    if (m.t === "res" && m.id != null) {
      const p = this.pending.get(m.id);
      this.pending.delete(m.id);
      if (!p) return;
      if (m.ok) p.ok(m.data);
      else p.ko(new EngineError(m.status ?? 500,
        m.error === "not-ready" ? currentDict().engine.notReady      // codice dal worker
          : m.error ?? currentDict().engine.genericError));
    } else if (m.t === "event" && m.ev) {
      this.last = m.ev;
      this.eventSubs.forEach((f) => f(m.ev!));
    } else if (m.t === "status" && m.state) {
      this.setStatus(m.state, m.detail ?? null);
    } else if (m.t === "ready") {
      this.gameVersion = m.gameVersion ?? null;
      // interprete, codice e dati pronti: manca solo il salvataggio
      this.status = { ...this.status, done: Math.max(this.status.done, 3) };
      this.statusSubs.forEach((f) => f(this.status));
    }
  }
}

export const engine = new Engine();
