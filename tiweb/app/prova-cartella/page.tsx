"use client";

/* Prova di fattibilita': il browser legge da solo la cartella dei salvataggi,
   senza passare dall'API. File System Access API (solo Chrome/Edge) +
   DecompressionStream per il gzip. Seconda parte: ticore dentro Pyodide, con
   i dati del gioco letti da StreamingAssets. Pagina fuori dal menu, non e'
   una funzione del companion. */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button, Panel, Tag } from "@/components/ui";
import { CopyPath, GAME_TEMPLATES_DIR } from "@/components/CopyPath";

const NS = "PavonisInteractive.TerraInvicta.";
const DB = "ti-prova-cartella";
const POLL_MS = 3000;
const TEMPLATES_DIR = GAME_TEMPLATES_DIR;

// i tipi della File System Access API non sono tutti in lib.dom
type DirHandle = Omit<FileSystemDirectoryHandle, "getDirectoryHandle"> & {
  values(): AsyncIterable<FileSystemHandle>;
  getDirectoryHandle(name: string): Promise<DirHandle>;
  queryPermission(o: { mode: "read" }): Promise<PermissionState>;
  requestPermission(o: { mode: "read" }): Promise<PermissionState>;
};

interface Letto {
  file: string;
  modificato: string;
  compresso: number;
  json: number;
  msLettura: number;
  msGunzip: number;
  msParse: number;
  data: string;
  fazione: string;
  campagna: string;
}

interface RisultatoPy {
  msPyodide: number; msGioco: number; byteGioco: number;
  msGame: number; msSnapshot: number; msJson: number; byteSnapshot: number;
  fazione: string; data: string; campagna: string; cpMiei: number;
  consiglio: string[]; missioneEsempio: string;
  fonte: "estratto" | "cartella"; versioneDati: string | null; versioneSalvataggio: string | null;
}

interface Voce { ora: string; testo: string; tono: "mine" | "bad" | "dim" }

// -- persistenza dell'handle: IndexedDB, l'unico posto che accetta un handle --

function idb<T>(fn: (s: IDBObjectStore) => IDBRequest<T>, mode: IDBTransactionMode): Promise<T> {
  return new Promise((ok, ko) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore("kv");
    open.onerror = () => ko(open.error);
    open.onsuccess = () => {
      const req = fn(open.result.transaction("kv", mode).objectStore("kv"));
      req.onsuccess = () => ok(req.result);
      req.onerror = () => ko(req.error);
    };
  });
}
const salvaHandle = (h: DirHandle, k = "dir") => idb((s) => s.put(h, k), "readwrite");
const caricaHandle = (k = "dir") => idb<DirHandle | undefined>((s) => s.get(k), "readonly");

// -- lettura del salvataggio --

/* Il selettore non accetta un percorso: puo' solo partire da una cartella nota
   ("documents") o da un handle gia' concesso. Per non costringere l'utente a
   scendere fino a Saves, accettiamo anche un antenato e completiamo noi. */
const VERSO_SAVES = ["My Games", "TerraInvicta", "Saves"];

async function haSalvataggi(dir: DirHandle) {
  for await (const h of dir.values())
    if (h.kind === "file" && h.name.endsWith(".gz")) return true;
  return false;
}

async function risolviSaves(dir: DirHandle): Promise<DirHandle | null> {
  if (await haSalvataggi(dir)) return dir;
  // Documenti -> My Games -> TerraInvicta -> Saves, partendo dal punto giusto
  const da = VERSO_SAVES.indexOf(dir.name);
  for (const start of da >= 0 ? [da + 1] : [0, 1, 2]) {
    let cur: DirHandle = dir;
    try {
      for (const nome of VERSO_SAVES.slice(start)) cur = await cur.getDirectoryHandle(nome);
      if (await haSalvataggi(cur)) return cur;
    } catch { /* percorso assente: proviamo il prossimo */ }
  }
  return null;
}

/* Dati del gioco. Chrome rifiuta la File System Access API su tutto cio' che
   sta sotto Program Files ("contiene file di sistema"), anche scendendo fino
   a StreamingAssets. Ripiego: il vecchio <input webkitdirectory>, che non ha
   quel blocco, e una copia in IndexedDB dei soli file che ticore legge.
   Cambiano solo con gli aggiornamenti del gioco: si sceglie una volta. */
const TEMPLATES = [
  "TIOrgTemplate.json", "TIProjectTemplate.json", "TIMissionTemplate.json",
  "TICouncilorTypeTemplate.json", "TITraitTemplate.json", "TIEffectTemplate.json",
  "TIFactionTemplate.json", "TIPriorityPresetTemplate.json",
];
const LINGUE = ["ita", "en"];

interface DatiGioco { salvato: string; files: Record<string, Blob> }

// percorso relativo a StreamingAssets, o null se ticore non lo usa
function relativo(webkitPath: string): string | null {
  const m = webkitPath.match(/(?:^|\/)((?:Templates\/[^/]+\.json)|(?:Localization\/[^/]+\/[^/]+))$/);
  if (!m) return null;
  const rel = m[1];
  if (rel.startsWith("Templates/")) return TEMPLATES.includes(rel.slice(10)) ? rel : null;
  return LINGUE.includes(rel.split("/")[1]) ? rel : null;
}

const salvaDati = (d: DatiGioco) => idb((s) => s.put(d, "datiGioco"), "readwrite");
const caricaDati = () => idb<DatiGioco | undefined>((s) => s.get("datiGioco"), "readonly");

async function piuRecente(dir: DirHandle) {
  let best: File | null = null;
  for await (const h of dir.values()) {
    if (h.kind !== "file" || !h.name.endsWith(".gz")) continue;
    const f = await (h as FileSystemFileHandle).getFile();
    if (!best || f.lastModified > best.lastModified) best = f;
  }
  return best;
}

async function leggi(f: File): Promise<Letto> {
  const t0 = performance.now();
  const buf = await f.arrayBuffer();
  const t1 = performance.now();
  const plain = await new Response(
    new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip")),
  ).text();                                   // TextDecoder toglie gia' il BOM
  const t2 = performance.now();
  // Il gioco scrive Infinity/NaN nudi (Python li accetta, JSON.parse no).
  // 1e999 e' JSON valido e diventa proprio Infinity; NaN non ha equivalente.
  const gs = JSON.parse(plain.replace(
    /([:\[,]\s*)(-?)(Infinity|NaN)(?=\s*[,\]}])/g,
    (_, pre, neg, v) => pre + (v === "NaN" ? "null" : neg + "1e999"),
  )).gamestates;
  const t3 = performance.now();

  const meta = gs[NS + "TIMetadataState"]?.[0]?.Value ?? {};
  const t = gs[NS + "TIGlobalValuesState"]?.[0]?.Value?.realWorldCampaignStart;
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    file: f.name,
    modificato: new Date(f.lastModified).toLocaleString(),
    compresso: buf.byteLength,
    json: plain.length,
    msLettura: t1 - t0,
    msGunzip: t2 - t1,
    msParse: t3 - t2,
    data: meta.gameTimeString ?? "?",
    fazione: meta.playerFactionName ?? "?",
    campagna: t ? `${t.year}${p(t.month)}${p(t.day)}T${p(t.hour)}${p(t.minute)}${p(t.second)}` : "?",
  };
}

const mb = (n: number) => (n / 1048576).toFixed(1) + " MB";
const ms = (n: number) => Math.round(n) + " ms";

export default function ProvaCartella() {
  // null sul server, dove window non c'e'
  const supportato = useSyncExternalStore(
    () => () => {}, () => "showDirectoryPicker" in window, () => null);
  const [dir, setDir] = useState<DirHandle | null>(null);
  const [permesso, setPermesso] = useState<PermissionState | null>(null);
  const [letto, setLetto] = useState<Letto | null>(null);
  const [log, setLog] = useState<Voce[]>([]);
  const ultimo = useRef<string>("");        // nome+mtime dell'ultimo file letto
  const ultimoFile = useRef<File | null>(null);
  const [dati, setDati] = useState<DatiGioco | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [py, setPy] = useState<RisultatoPy | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const worker = useRef<Worker | null>(null);
  const occupato = useRef(false);

  const scrivi = (testo: string, tono: Voce["tono"] = "dim") =>
    setLog((l) => [{ ora: new Date().toLocaleTimeString(), testo, tono }, ...l].slice(0, 40));

  // all'avvio: il browser supporta l'API? c'e' un handle salvato?
  useEffect(() => {
    if (!("showDirectoryPicker" in window)) return;
    caricaHandle().then(async (h) => {
      if (!h) return;
      setDir(h);
      const s = await h.queryPermission({ mode: "read" });
      setPermesso(s);
      scrivi(`cartella ricordata: ${h.name} — permesso ${s}`, s === "granted" ? "mine" : "dim");
    }).catch((e) => scrivi(`IndexedDB: ${e}`, "bad"));
    caricaDati().then((d) => {
      if (!d) return;
      setDati(d);
      scrivi(`dati del gioco in cache: ${Object.keys(d.files).length} file, del ${d.salvato}`, "mine");
    }).catch((e) => scrivi(`IndexedDB: ${e}`, "bad"));
    return () => worker.current?.terminate();
  }, []);

  const cartellaGioco = async (lista: FileList | null) => {
    if (!lista?.length) return;
    const files: Record<string, Blob> = {};
    for (const f of Array.from(lista)) {
      const rel = relativo(f.webkitRelativePath);
      // le Blob di un <input> vanno lette subito: in IndexedDB salviamo i byte
      if (rel) files[rel] = new Blob([await f.arrayBuffer()], { type: f.type });
    }
    const tpl = Object.keys(files).filter((k) => k.startsWith("Templates/")).length;
    const loc = Object.keys(files).length - tpl;
    if (tpl < TEMPLATES.length || !loc) {
      scrivi(`nella cartella scelta (${lista.length} file) trovo ${tpl}/${TEMPLATES.length} template e ${loc} file di localizzazione: serve Terra Invicta o StreamingAssets`, "bad");
      return;
    }
    const d = { salvato: new Date().toLocaleString(), files };
    await salvaDati(d);
    setDati(d);
    const byte = Object.values(files).reduce((n, b) => n + b.size, 0);
    scrivi(`dati del gioco salvati: ${tpl} template + ${loc} file di localizzazione, ${mb(byte)} (su ${lista.length} file nella cartella)`, "mine");
  };

  const eseguiPy = (fonte: "estratto" | "cartella") => {
    if (!ultimoFile.current || (fonte === "cartella" && !dati)) return;
    if (!worker.current) {
      scrivi("avvio il worker…");
      worker.current = new Worker("/pyodide-prova.js", { type: "module" });
      // senza questi, un errore nel worker (es. importScripts fallito) e' muto
      worker.current.onerror = (e) => {
        scrivi(`[py] errore nel worker: ${e.message || "sconosciuto"} (${e.filename}:${e.lineno})`, "bad");
        worker.current?.terminate(); worker.current = null; setInCorso(false);
      };
      worker.current.onmessageerror = () => scrivi("[py] messaggio non leggibile dal worker", "bad");
      worker.current.onmessage = ({ data }) => {
        if (data.tipo === "log") scrivi(`[py] ${data.testo}`);
        else if (data.tipo === "errore") { scrivi(`[py] ${data.testo}`, "bad"); setInCorso(false); }
        else {
          setPy(data as RisultatoPy);
          setInCorso(false);
          scrivi(`[py] snapshot pronto in ${ms(data.msGame + data.msSnapshot)}`, "mine");
        }
      };
    }
    setInCorso(true);
    scrivi(`[py] invio ${ultimoFile.current.name} al worker (${fonte})`);
    worker.current.postMessage({ save: ultimoFile.current,
                                 files: fonte === "cartella" ? dati?.files : undefined });
  };

  const scegli = async () => {
    try {
      const scelta = await (window as unknown as {
        showDirectoryPicker(o: object): Promise<DirHandle>;
      }).showDirectoryPicker({ id: "ti-saves", mode: "read", startIn: dir ?? "documents" });
      const h = await risolviSaves(scelta);
      if (!h) {
        scrivi(`in ${scelta.name} non trovo né .gz né My Games\\TerraInvicta\\Saves`, "bad");
        return;
      }
      if (h !== scelta) scrivi(`scelta ${scelta.name}, scendo fino a ${h.name}`, "dim");
      await salvaHandle(h);
      setDir(h);
      setPermesso("granted");
      ultimo.current = "";
      scrivi(`cartella scelta: ${h.name}`, "mine");
    } catch (e) {
      scrivi(`scelta annullata: ${e}`, "bad");
    }
  };

  /* Prova 3: il selettore di salvataggio arriva fino a Templates? Chrome
     blocca la lettura sotto Program Files; la scrittura con
     showSaveFilePicker e' da verificare. Si scrive un .txt innocuo, non il
     template vero: il gioco carica solo i suoi .json. */
  const provaSalvataggio = async () => {
    try {
      const h = await (window as unknown as {
        showSaveFilePicker(o: object): Promise<FileSystemFileHandle>;
      }).showSaveFilePicker({
        id: "ti-templates",
        suggestedName: "prova-companion.txt",
        types: [{ description: "Testo", accept: { "text/plain": [".txt"] } }],
      });
      const w = await (h as unknown as {
        createWritable(): Promise<{ write(d: string): Promise<void>; close(): Promise<void> }>;
      }).createWritable();
      await w.write(`Prova di scrittura del companion, ${new Date().toLocaleString()}. Si puo' cancellare.
`);
      await w.close();
      scrivi(`scrittura riuscita: ${h.name} — controlla in che cartella è finito`, "mine");
    } catch (e) {
      scrivi(`scrittura non riuscita: ${e}`, "bad");
    }
  };

  const riconcedi = async () => {
    if (!dir) return;
    const s = await dir.requestPermission({ mode: "read" });
    setPermesso(s);
    scrivi(`permesso: ${s}`, s === "granted" ? "mine" : "bad");
  };

  // il "watcher": controlla la mtime ogni 3 s, come tiserver
  const giro = useCallback(async () => {
    if (!dir || permesso !== "granted" || occupato.current) return;
    occupato.current = true;
    try {
      const f = await piuRecente(dir);
      if (!f) { scrivi("nessun .gz nella cartella", "bad"); return; }
      const chiave = `${f.name}|${f.lastModified}`;
      if (chiave === ultimo.current) return;
      const r = await leggi(f);
      ultimo.current = chiave;
      ultimoFile.current = f;
      setLetto(r);
      scrivi(`letto ${r.file} — ${r.data} — ${ms(r.msLettura + r.msGunzip + r.msParse)}`, "mine");
    } catch (e) {
      // il gioco puo' avere il file aperto in scrittura: si riprova al giro dopo
      scrivi(`lettura fallita, riprovo: ${e}`, "bad");
    } finally {
      occupato.current = false;
    }
  }, [dir, permesso]);

  useEffect(() => {
    const primo = setTimeout(giro, 0);
    const id = setInterval(giro, POLL_MS);
    return () => { clearTimeout(primo); clearInterval(id); };
  }, [giro]);

  return (
    <div>
      <Panel title="Prova: lettura della cartella dal browser"
        sub="File System Access API + DecompressionStream, senza l'API Python">
        <div className="p-4 space-y-3 text-[13px]">
          {supportato === false && (
            <p className="text-bad">Questo browser non ha <code>showDirectoryPicker</code>: serve Chrome o Edge.</p>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            <Button tone="primary" onClick={scegli} disabled={!supportato}>
              {dir ? "Cambia cartella" : "Scegli la cartella Saves"}
            </Button>
            {dir && permesso !== "granted" && (
              <Button onClick={riconcedi}>Riconcedi l&apos;accesso</Button>
            )}
            {dir && <Tag tone={permesso === "granted" ? "mine" : "warn"}>{dir.name} · {permesso ?? "?"}</Tag>}
          </div>
          <p className="text-dim text-[12px]">
            La finestra si apre in Documenti: basta scegliere <b>Documenti</b>, <b>My Games</b> o
            {" "}<b>TerraInvicta</b>, fino a Saves ci arriva la pagina da sola.
            {" "}Controllo ogni {POLL_MS / 1000} s del file .gz più recente. Salva in partita e guarda il registro.
          </p>
        </div>
      </Panel>

      {letto && (
        <Panel title="Ultimo salvataggio letto">
          <table className="w-full text-[13px]">
            <tbody>
              {([
                ["file", letto.file],
                ["modificato", letto.modificato],
                ["data di gioco", letto.data],
                ["fazione", letto.fazione],
                ["campagna", letto.campagna],
                ["dimensioni", `${mb(letto.compresso)} compresso · ${mb(letto.json)} JSON`],
                ["tempi", `lettura ${ms(letto.msLettura)} · gunzip ${ms(letto.msGunzip)} · parse ${ms(letto.msParse)}`],
              ] as const).map(([k, v]) => (
                <tr key={k} className="border-t border-edge">
                  <td className="px-4 py-1.5 text-dim w-40">{k}</td>
                  <td className="px-4 py-1.5 tabular-nums">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      <Panel title="Prova 2: ticore in Pyodide"
        sub="snapshot() completo, come fa oggi l'API. Dati del gioco: estratto incluso nel sito, o la cartella come ripiego">
        <div className="p-4 space-y-3 text-[13px]">
          <div className="flex items-center gap-3 flex-wrap">
            {/* webkitdirectory non e' negli attributi tipizzati di React */}
            <input ref={input} type="file" className="hidden"
              {...{ webkitdirectory: "" }}
              onChange={(e) => { cartellaGioco(e.target.files); e.target.value = ""; }} />
            <Button onClick={() => input.current?.click()}>
              {dati ? "Ricarica i dati del gioco" : "Scegli la cartella del gioco"}
            </Button>
            {dati && <Tag tone="mine">{Object.keys(dati.files).length} file · {dati.salvato}</Tag>}
            <Button tone="primary" onClick={() => eseguiPy("estratto")}
              disabled={!letto || inCorso}>
              {inCorso ? "In corso…" : "Esegui ticore (dati inclusi)"}
            </Button>
            <Button onClick={() => eseguiPy("cartella")}
              disabled={!dati || !letto || inCorso}>
              Esegui con la cartella
            </Button>
          </div>
          <p className="text-dim text-[12px]">
            Di solito <code>C:\Program Files (x86)\Steam\steamapps\common\Terra Invicta</code>:
            oppure la sua StreamingAssets. Chrome chiederà conferma per «caricare» i file: non escono dal
            PC, la pagina ne tiene solo template e localizzazione. Il primo avvio scarica Pyodide (~13 MB, dal nostro server).
          </p>
        </div>
        {py && (
          <table className="w-full text-[13px]">
            <tbody>
              {([
                ["Pyodide", ms(py.msPyodide) + (py.msPyodide === 0 ? " (già caricato)" : "")],
                ["dati del gioco", `${py.fonte}: ${mb(py.byteGioco)} in ${ms(py.msGioco)}`],
                ["versione", py.versioneDati
                  ? `dati ${py.versioneDati} · salvataggio ${py.versioneSalvataggio}` +
                    (py.versioneDati === py.versioneSalvataggio ? " ✓" : " — DIVERSE")
                  : `salvataggio ${py.versioneSalvataggio}`],
                ["Game()", ms(py.msGame)],
                ["snapshot()", ms(py.msSnapshot)],
                ["json.dumps", `${ms(py.msJson)} · ${mb(py.byteSnapshot)}`],
                ["fazione · data", `${py.fazione} · ${py.data}`],
                ["campagna", py.campagna],
                ["CP miei", String(py.cpMiei)],
                ["consiglio", py.consiglio.join(", ")],
                ["GainInfluence →", py.missioneEsempio],
              ] as const).map(([k, v]) => (
                <tr key={k} className="border-t border-edge">
                  <td className="px-4 py-1.5 text-dim w-40">{k}</td>
                  <td className="px-4 py-1.5 tabular-nums">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title="Prova 3: salvare dentro la cartella del gioco"
        sub="Per i preset: Chrome lascia scrivere in Templates con il selettore di salvataggio?">
        <div className="p-4 space-y-3 text-[13px]">
          <ol className="space-y-3 list-none">
            <li>
              <div className="text-dim mb-1.5"><span className="text-accent display">1 ·</span> Copia il percorso della cartella dei template</div>
              <CopyPath path={TEMPLATES_DIR} />
            </li>
            <li className="text-dim">
              <span className="text-accent display">2 ·</span> Premi il pulsante qui sotto, incolla il percorso nella
              barra degli indirizzi della finestra e premi Invio
            </li>
            <li className="text-dim">
              <span className="text-accent display">3 ·</span> Salva. Il file è <code className="text-ink">prova-companion.txt</code>:
              un testo innocuo che il gioco non legge, da cancellare dopo la prova
            </li>
          </ol>
          <Button tone="primary" onClick={provaSalvataggio} disabled={!supportato}>
            Prova a salvare nel gioco
          </Button>
        </div>
      </Panel>

      <Panel title="Registro">
        <ul className="p-4 space-y-1 text-[12px] font-mono">
          {log.length === 0 && <li className="text-dim">—</li>}
          {log.map((v, i) => (
            <li key={i} className={v.tono === "mine" ? "text-good" : v.tono === "bad" ? "text-bad" : "text-dim"}>
              {v.ora} · {v.testo}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
