"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useApi } from "@/lib/api";
import { useSettings } from "@/lib/settings";
import { usePersistentState } from "@/lib/persist";
import { Empty, Panel, ResourceIcon, nf, numberLocale } from "@/components/ui";
import { Combo } from "@/components/Combo";
import { Guide } from "@/components/Guide";
import { Tip } from "@/components/Tip";
import { YassIcon } from "@/components/YassIcon";
import { PipGlyph, PipText, PriorityPanel } from "./PriorityPanel";
import {
  type EffectConstants, type NationState, type PanelCP, type Pips as PipMap, type PriorityRow, type YassConstants,
  type RestModel, decreaseCap, maxInequalityFor, panel, perCompletion, projectNation, restParts, hostileUnrest, knowledgeStep, monthlyMovement,
  popScaling,
} from "@/lib/yass";

interface Region { id: number; name: string; population: number; hostile: boolean }
interface Nation {
  id: number; name: string; mine: boolean;
  population: number; gdp: number;
  cohesion: number; cohesionRest: number; unrest: number; unrestRest: number;
  democracy: number; inequality: number; education: number; popScaling: number; ip: number;
  coreEcoRegions: number; resourceRegions: number; legitimizeProgress: number;
  restModel: RestModel;
  controlPoints: number;
  priorities: PriorityRow[]; panelCPs: PanelCP[];
  regions: Region[]; claims: number[]; hostileClaims: number[];
}
interface Yass {
  nations: Nation[];
  constants: YassConstants & {
    diversity: Record<string, number>; effects: EffectConstants; priorityCost: Record<string, number>; legitimize: number;
    ineqCohesionMult: number; severeInequality: number;
  };
  faction: string | null; campaign: string | null;
}

/** Le prove dell'utente, salvate nel browser per partita: valori sovrascritti
    e pallini cambiati, nazione per nazione. */
interface Tests {
  over: Record<string, Partial<Record<InputKey, number>>>;
  pips: Record<string, PipMap>;
}
const NO_TESTS: Tests = { over: {}, pips: {} };
const isTests = (v: unknown): v is Tests =>
  !!v && typeof v === "object" && typeof (v as Tests).over === "object" && typeof (v as Tests).pips === "object";

type Sheet = "cohesion" | "effects" | "unrest" | "annex" | "projection";
const SHEETS: Sheet[] = ["cohesion", "effects", "unrest", "annex", "projection"];
// le priorita' del pannello che ogni foglio usa nei suoi conti
const USED_BY_SHEET: Record<Sheet, string[]> = {
  cohesion: ["Knowledge"],
  effects: ["Economy", "Welfare", "Knowledge", "Government", "Unity"],
  unrest: ["Economy", "Knowledge", "Government", "Unity"],
  annex: ["Government", "Unity"],
  projection: ["Economy", "Welfare", "Knowledge", "Government", "Unity"],
};
const isSheet = (v: unknown): v is Sheet => SHEETS.includes(v as Sheet);
const isStr = (v: unknown): v is string => typeof v === "string";

type InputKey = "nationIP" | "education" | "population" | "cohesion" | "cohesionRest" | "inequality" | "knowledgeIP"
  | "pcgdp" | "democracy" | "hostileShare" | "armyOther" | "unrestTarget" | "annexedDemocracy" | "target";

const REDDIT = "https://www.reddit.com/r/TerraInvicta/comments/1wrmm62/nation_building_calculators_and_other_references/";

const hostilePop = (n: Nation) => n.regions.reduce((s, r) => s + (r.hostile ? r.population : 0), 0);
/** Separatore decimale della lingua dei numeri («,» in italiano). */
const decimalSep = () =>
  new Intl.NumberFormat(numberLocale()).formatToParts(1.5).find((x) => x.type === "decimal")?.value ?? ".";

/** Il numero com'e' scritto in una cella in modifica: senza migliaia. */
const editText = (v: number, digits: number) =>
  v.toLocaleString(numberLocale(), { useGrouping: false, maximumFractionDigits: Math.max(digits, 4) });

/** Accetta virgola o punto come decimale; «70.000» in italiano e' settantamila. */
function parseNum(raw: string) {
  let s = raw.replace(/\s/g, "");
  const dec = decimalSep();
  const group = dec === "," ? "." : ",";
  if (new RegExp(`^-?\\d{1,3}(\\${group}\\d{3})+(\\${dec}\\d*)?$`).test(s)) s = s.split(group).join("");
  const v = parseFloat(s.replace(",", "."));
  return Number.isFinite(v) ? v : null;
}

/** Valori di partenza degli ingressi, dal salvataggio. */
function defaults(n: Nation, k: YassConstants, annexed: Nation | null, knowledgeIP: number): Record<InputKey, number> {
  const pc = n.gdp / (n.population * 1e6);
  const share = hostilePop(n) / n.population;
  // esercito, xenoformazione e il resto: cio' che manca al valore di riposo del gioco
  const army = n.unrestRest - (k.unrestBase - n.cohesion - pc / k.pcgdpPerUnrest + hostileUnrest(k, share, n.democracy));
  return {
    nationIP: n.ip, education: n.education, population: n.population, cohesion: n.cohesion, cohesionRest: n.cohesionRest, inequality: n.inequality,
    knowledgeIP, pcgdp: pc, democracy: n.democracy, hostileShare: share * 100,
    armyOther: army, unrestTarget: 2, annexedDemocracy: annexed?.democracy ?? 0, target: k.cohesionTarget,
  };
}

// ---------------------------------------------------------------- celle

// valori letti dalla partita: si possono sovrascrivere per un «e se…»; gli
// altri ingressi sono scelte dell'utente, che il salvataggio non ha
const FROM_SAVE = new Set<InputKey>(["nationIP", "knowledgeIP", "education", "population", "cohesion", "cohesionRest", "inequality",
  "pcgdp", "democracy", "hostileShare", "armyOther", "annexedDemocracy"]);

type Row =
  | { kind: "section"; label: string }
  | { kind: "input"; key: InputKey; label: string; digits: number; note?: ReactNode }
  | { kind: "pick"; id: string; label: string; node: ReactNode; note?: ReactNode }
  | { kind: "out"; id: string; label: string; value: ReactNode; formula: string; note?: ReactNode;
      tone?: "good" | "bad" | "warn"; main?: boolean; linked?: boolean;
      /** voce di una somma: rientrata sotto la riga che la somma */
      sub?: boolean };

// icona del gioco per ogni riga, le stesse della pagina Nazioni
const COHESION = "ICO_Cohesion_mid", UNREST = "ICO_Unrest_mid", PC = "ICO_per_capita_GDP";
const KNOWLEDGE = "ICO_knowledge_priority", IP = "ICO_investments", POP = "ICO_population", GOV = "ICO_gov_type";
const ICONS: Record<string, string> = {
  population: POP, education: "ICO_education", cohesion: COHESION, cohesionRest: COHESION, inequality: "ICO_inequality",
  nationIP: IP, knowledgeIP: KNOWLEDGE, pcgdp: PC, democracy: GOV, annexedDemocracy: GOV,
  armyOther: "ICO_military_priority", unrestTarget: UNREST, target: COHESION, annexed: GOV,
  scaling: POP, step: KNOWLEDGE, move: COHESION, completions: KNOWLEDGE, net: COHESION, cap: COHESION,
  eq: COHESION, hold: IP, up1: IP, up2: IP, uniStop: "ICO_unity_priority",
  uBase: UNREST, uCoh: COHESION, uPc: PC, uHostile: UNREST, uRest: UNREST, uNeeded: PC, uGap: PC,
  aPop: POP, aGdp: "ICO_economy_priority", aPc: PC, aHostileRegions: UNREST, aShare: UNREST,
  aUnrest: UNREST, aScaling: POP, aStep: KNOWLEDGE, pIn: COHESION,
  aLegit: GOV, aLegitOne: UNREST, aLegitAll: UNREST, aLegitDem: GOV,
  rRest: COHESION, rIneq: "ICO_inequality", rPop: POP, rPc: PC, rHostile: UNREST, rGov: GOV, rMaxIneq: "ICO_inequality",
  uCohM: COHESION, uCohDrift: COHESION, uCohKno: KNOWLEDGE, uCohUni: "ICO_unity_priority", uPcM: PC, uDemM: GOV, uM: UNREST, uMonths: UNREST,
  tPc: PC, tIneq: "ICO_inequality", tEdu: "ICO_education", tDem: GOV, tCoh: COHESION,
};
const STAT_ICON: Record<string, string> = { pcgdp: PC, inequality: "ICO_inequality", education: "ICO_education", cohesion: COHESION, democracy: GOV };
const iconFor = (id: string) => ICONS[id] ?? (/^p\d+$/.test(id) ? COHESION : undefined)
  ?? (/^c[A-Z]/.test(id) ? IP : undefined)
  ?? STAT_ICON[Object.keys(STAT_ICON).find((s) => id.startsWith("e") && id.endsWith(s)) ?? ""];

// i valori non scendono sotto zero, tranne il residuo dei disordini
const minFor = (k: InputKey) => (k === "armyOther" ? -Infinity : 0);

const rowId = (r: Exclude<Row, { kind: "section" }>) => (r.kind === "input" ? r.key : r.id);
const isChoice = (r: Row) => (r.kind === "input" && !FROM_SAVE.has(r.key)) || r.kind === "pick";

/** Passo di una cella: un'unita' dell'ultima cifra mostrata, o un centesimo
    dell'ordine di grandezza se e' piu' grande (59.328 $ si muove di 100). */
function stepFor(v: number, digits: number) {
  const base = 10 ** -digits;
  const a = Math.abs(v);
  return a >= 1 ? Math.max(base, 10 ** (Math.floor(Math.log10(a)) - 2)) : base;
}
const roundTo = (v: number, step: number) => {
  const d = Math.max(0, -Math.floor(Math.log10(step)));
  return +(Math.round(v / step) * step).toFixed(d);
};

/** Cella modificabile: testo libero (virgola o punto), formattata quando non
    ha il fuoco. Si cambia anche col mouse: trascinando in orizzontale (il
    cursore diventa ↔), o con la rotella mentre e' in modifica.
    Tastiera: ↑/↓ alzano e abbassano il valore (Maiusc ×10, Alt passo fine);
    Invio conferma e resta sulla cella, col testo selezionato per un altro
    tentativo; Tab e Maiusc+Tab passano alla riga dopo e prima; Esc annulla. */
function InputCell({ value, digits, edited, min, onChange, onFocus, onMove, onCancel }: {
  value: number; digits: number; edited: boolean; min: number;
  onChange: (v: number) => void; onFocus: () => void;
  onMove: (delta: number) => void; onCancel: (start: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const start = useRef(value);
  const ref = useRef<HTMLInputElement>(null);
  const drag = useRef<{ x: number; v: number; active: boolean } | null>(null);
  // valori correnti per i gestori registrati una volta sola (rotella)
  const live = useRef({ value, draft, min, digits, onChange });
  useLayoutEffect(() => { live.current = { value, draft, min, digits, onChange }; });

  const current = () => {
    const d = live.current.draft != null ? parseNum(live.current.draft) : null;
    return d ?? live.current.value;
  };
  /** Imposta un valore nuovo: arrotondato al passo, mai sotto il minimo. */
  const apply = (v: number, step: number) => {
    const x = Math.max(live.current.min, roundTo(v, step));
    live.current.onChange(x);
    setDraft(editText(x, live.current.digits));
    return x;
  };
  const nudge = (dir: number, e: { shiftKey: boolean; altKey: boolean }) => {
    const v = current();
    const step = stepFor(v, live.current.digits) * (e.altKey ? 1 : 10) * (e.shiftKey ? 10 : 1);
    apply(v + dir * step, stepFor(v, live.current.digits));
  };

  // rotella: solo sulla cella in modifica, cosi' la pagina continua a scorrere
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (document.activeElement !== el || !e.deltaY) return;
      e.preventDefault();
      nudge(e.deltaY < 0 ? 1 : -1, e);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // nudge legge tutto da live: basta registrarlo una volta
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const keys = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      nudge(e.key === "ArrowUp" ? 1 : -1, e);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const v = draft != null ? parseNum(draft) : null;
      const x = v ?? value;
      if (v != null) onChange(v);
      setDraft(editText(x, digits));
      const el = e.currentTarget;
      requestAnimationFrame(() => el.select());
    } else if (e.key === "Tab") {
      e.preventDefault();
      const v = draft != null ? parseNum(draft) : null;
      if (v != null) onChange(v);
      setDraft(null);
      onMove(e.shiftKey ? -1 : 1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setDraft(null);
      onCancel(start.current);
    }
  };

  return (
    <input ref={ref} type="text" inputMode="decimal"
      value={draft ?? nf(value, digits)}
      onFocus={(e) => {
        start.current = value;
        setDraft(editText(value, digits));
        onFocus();
        // il testo cambia (niente migliaia) col render: si seleziona dopo, o la selezione si perde
        const el = e.currentTarget;
        requestAnimationFrame(() => el.select());
      }}
      onChange={(e) => { setDraft(e.target.value); const v = parseNum(e.target.value); if (v != null) onChange(v); }}
      onBlur={() => setDraft(null)}
      onKeyDown={keys}
      onPointerDown={(e) => { if (e.button === 0) drag.current = { x: e.clientX, v: current(), active: false }; }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || !(e.buttons & 1)) return;
        const dx = e.clientX - d.x;
        if (!d.active) {
          if (Math.abs(dx) < 4) return;
          d.active = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          document.body.classList.add("yass-scrubbing");
        }
        const step = stepFor(d.v, digits);
        apply(d.v + dx * step * (e.shiftKey ? 10 : e.altKey ? 0.1 : 1), e.altKey ? step / 10 : step);
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        if (!d?.active) return;
        document.body.classList.remove("yass-scrubbing");
        e.currentTarget.releasePointerCapture(e.pointerId);
        const el = e.currentTarget;
        requestAnimationFrame(() => el.select());
      }}
      className={`yass-in w-full text-right ${edited ? "yass-changed" : ""}`} />
  );
}

function Pencil() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M8.5 1.5l2 2L4 10H2V8z" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function Grid({ rows, values, originals, edited, set, unset, selected, select, pcgdpPerUnrest, panelSig }: {
  rows: Row[]; values: Record<InputKey, number>; originals: Record<InputKey, number>;
  edited: Set<InputKey>; set: (k: InputKey, v: number) => void; unset: (k: InputKey) => void;
  selected: string | null; select: (id: string) => void; pcgdpPerUnrest: number;
  /** firma del pannello Priorita': quando cambia, le celle collegate lampeggiano */
  panelSig: string;
}) {
  const { t } = useSettings();
  const y = t.yass;
  const table = useRef<HTMLTableElement>(null);
  const hints = y.hints as Record<string, string>;
  // la spiegazione di ogni riga; le righe «fra N anni» la condividono
  const hintFor = (id: string) =>
    (hints[id] ?? (/^p\d+$/.test(id) ? hints.pYears : undefined))?.replace("{pc}", nf(pcgdpPerUnrest, 0));

  const cellAt = (n: number) => table.current?.querySelector<HTMLElement>(`[data-cell="${n}"]`) ?? null;
  /** Fuoco alla prossima cella di valori, saltando le intestazioni. */
  const move = (from: number, delta: number) => {
    if (delta === 0) { requestAnimationFrame(() => cellAt(from)?.focus()); return; }
    for (let n = from + delta; n >= 1 && n <= rows.length; n += delta) {
      const c = cellAt(n);
      if (c) { requestAnimationFrame(() => c.focus()); return; }
    }
    requestAnimationFrame(() => cellAt(from)?.focus());
  };
  const startEdit = (r: Extract<Row, { kind: "input" }>, n: number) => {
    const focusInput = () => cellAt(n)?.querySelector("input")?.focus();
    if (FROM_SAVE.has(r.key) && !edited.has(r.key)) {
      // l'input nasce col prossimo render: il fuoco dopo, cosi' scatta onFocus e il testo si seleziona
      set(r.key, values[r.key]);
      requestAnimationFrame(() => requestAnimationFrame(focusInput));
    } else {
      focusInput();
    }
  };
  const cellKeys = (e: KeyboardEvent<HTMLElement>, r: Exclude<Row, { kind: "section" }>, n: number) => {
    if (e.target !== e.currentTarget) return;           // i tasti dell'input li gestisce lui
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault(); move(n, e.key === "ArrowDown" ? 1 : -1);
    } else if ((e.key === "Enter" || e.key === "F2") && r.kind === "input") {
      e.preventDefault(); startEdit(r, n);
    } else if ((e.key === "Enter" || e.key === "F2") && r.kind === "pick") {
      e.preventDefault(); cellAt(n)?.querySelector("input")?.focus();
    } else if ((e.key === "Delete" || e.key === "Backspace") && r.kind === "input" && edited.has(r.key)) {
      e.preventDefault(); unset(r.key); move(n, 0);
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="yass-grid" ref={table}>
        <thead>
          <tr><th className="yass-rn" /><th>A</th><th>B</th><th>C</th></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const n = i + 1;
            if (r.kind === "section") {
              return (
                <tr key={`s${n}`} className="yass-section">
                  <td className="yass-rn">{n}</td><td colSpan={3}>{r.label}</td>
                </tr>
              );
            }
            const id = rowId(r);
            const sel = selected === id;
            let cell: ReactNode;
            let note = r.note;
            if (r.kind === "out") {
              cell = r.value;
            } else if (r.kind === "pick") {
              cell = r.node;
            } else if (!FROM_SAVE.has(r.key)) {
              cell = <InputCell value={values[r.key]} digits={r.digits} edited={false} min={minFor(r.key)}
                onChange={(v) => set(r.key, v)} onFocus={() => select(id)}
                onMove={(d) => move(n, d)} onCancel={(v) => { set(r.key, v); move(n, 0); }} />;
            } else if (edited.has(r.key)) {
              const key = r.key;
              cell = <InputCell value={values[key]} digits={r.digits} edited min={minFor(key)}
                onChange={(v) => set(key, v)} onFocus={() => select(id)}
                onMove={(d) => move(n, d)}
                onCancel={(v) => {
                  // Esc su una cella appena aperta la richiude: torna il valore della partita
                  if (Math.abs(v - originals[key]) < 1e-12) unset(key); else set(key, v);
                  move(n, 0);
                }} />;
              note = (
                <span className="inline-flex items-center gap-2">
                  <span className="text-warn">{y.fromSave.replace("{v}", nf(originals[r.key], r.digits))}</span>
                  <button type="button" onClick={() => unset(r.key)} className="text-accent hover:text-ink">{y.undo}</button>
                </span>
              );
            } else {
              cell = (
                <span className="flex items-center justify-end gap-2">
                  <Tip title={y.override} content={y.overrideHint}>
                    <button type="button" aria-label={y.override} tabIndex={-1}
                      onClick={() => startEdit(r, n)} className="yass-pencil"><Pencil /></button>
                  </Tip>
                  {nf(values[r.key], r.digits)}
                </span>
              );
            }
            const choice = isChoice(r);
            return (
              <tr key={id} className={r.kind === "out" && r.main ? "yass-main" : r.kind === "out" && r.sub ? "yass-sub" : ""}>
                <td className="yass-rn">{n}</td>
                <td className={choice || (r.kind === "out" && r.main) ? "text-ink" : "text-dim"}>
                  <span className="inline-flex items-center gap-2">
                    <span className="yass-icon">{iconFor(id) && <ResourceIcon icon={iconFor(id)} size={15} />}</span>
                    {hintFor(id)
                      ? <Tip title={r.label} content={<PipText text={hintFor(id)!} />} width={340}><span className="yass-hinted">{r.label}</span></Tip>
                      : r.label}
                    {((r.kind === "out" && r.linked) || (r.kind === "input" && r.key === "knowledgeIP")) && (
                      <Tip title={y.linkedTitle} content={<PipText text={y.linkedHint} />}><span className="yass-link"><PipGlyph /></span></Tip>
                    )}
                  </span>
                </td>
                <td className={`yass-val ${r.kind === "pick" ? "yass-pick" : ""} ${sel ? "yass-sel" : ""} ${r.kind === "out" && r.tone ? `text-${r.tone}` : ""}`}
                  data-cell={n} tabIndex={0}
                  onFocus={(e) => { if (e.target === e.currentTarget) select(id); }}
                  onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.focus(); else select(id); }}
                  onKeyDown={(e) => cellKeys(e, r, n)}>
                  {(r.kind === "out" && r.linked) || (r.kind === "input" && r.key === "knowledgeIP" && !edited.has(r.key))
                    ? <span key={panelSig} className="yass-flash">{cell}</span>
                    : cell}
                </td>
                <td className="text-faint">{note}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- proiezione

const PROJ_YEARS = [0, 1, 2, 5, 10, 20];
type StatKey = "cohesion" | "rest" | "unrest" | "pcgdp" | "inequality" | "democracy" | "education";
const PROJ_COLS: { key: StatKey; icon: string; digits: number; upIsGood: boolean }[] = [
  { key: "cohesion", icon: "ICO_Cohesion_mid", digits: 2, upIsGood: true },
  { key: "rest", icon: "ICO_Cohesion_mid", digits: 2, upIsGood: true },
  { key: "unrest", icon: "ICO_Unrest_mid", digits: 2, upIsGood: false },
  { key: "pcgdp", icon: "ICO_per_capita_GDP", digits: 0, upIsGood: true },
  { key: "inequality", icon: "ICO_inequality", digits: 2, upIsGood: false },
  { key: "democracy", icon: "ICO_gov_type", digits: 2, upIsGood: true },
  { key: "education", icon: "ICO_education", digits: 2, upIsGood: true },
];

/** La nazione fra 1, 2, 5… anni coi pallini di oggi: righe gli anni, colonne
    le statistiche, come un foglio di calcolo. Verde se migliora, rosso se
    peggiora rispetto a oggi; la cella scelta spiega il conto nella barra fx. */
function ProjectionTable({ states, years, panelSig, selected, onSelect }: {
  states: NationState[]; years: number[]; panelSig: string;
  selected: { ref: string } | null; onSelect: (s: { ref: string; text: string }) => void;
}) {
  const { t } = useSettings();
  const y = t.yass;
  const now = states[0];
  return (
    <div className="overflow-x-auto mt-3">
      <table className="yass-grid yass-proj">
        <thead>
          <tr><th className="yass-rn" /><th>A</th>{PROJ_COLS.map((c, i) => <th key={c.key}>{String.fromCharCode(66 + i)}</th>)}</tr>
        </thead>
        <tbody>
          <tr className="yass-section">
            <td className="yass-rn">1</td>
            <td>{y.projWhen}</td>
            {PROJ_COLS.map((c) => (
              <td key={c.key} className="text-right">
                <span className="inline-flex items-center gap-1.5 justify-end">
                  <ResourceIcon icon={c.icon} size={14} />{y.projCols[c.key]}
                </span>
              </td>
            ))}
          </tr>
          {states.map((st, r) => (
            <tr key={years[r]} className={r === 0 ? "yass-main" : ""}>
              <td className="yass-rn">{r + 2}</td>
              <td className={r === 0 ? "text-ink" : "text-dim"}>
                {years[r] === 0 ? y.projNow : y.projIn.replace("{n}", String(years[r])).replace("{u}", years[r] === 1 ? y.year : y.years)}
              </td>
              {PROJ_COLS.map((c, i) => {
                const d = st[c.key] - now[c.key];
                const tone = r === 0 || Math.abs(d) < 10 ** -c.digits / 2 ? "" : (d > 0) === c.upIsGood ? "text-good" : "text-bad";
                const ref = `${String.fromCharCode(66 + i)}${r + 2}`;
                const text = r === 0
                  ? y.projFxNow.replace("{v}", nf(st[c.key], c.digits))
                  : y.projFx.replace("{n}", String(years[r] * 12)).replace("{from}", nf(now[c.key], c.digits))
                    .replace("{to}", nf(st[c.key], c.digits)).replace("{d}", (d >= 0 ? "+" : "") + nf(d, c.digits))
                    .replace("{how}", y.projHow[c.key]);
                return (
                  <td key={c.key} tabIndex={0}
                    className={`yass-val ${tone} ${selected?.ref === ref ? "yass-sel" : ""}`}
                    onClick={() => onSelect({ ref, text })} onFocus={() => onSelect({ ref, text })}>
                    {r === 0 ? nf(st[c.key], c.digits) : <span key={panelSig} className="yass-flash">{nf(st[c.key], c.digits)}</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-faint text-[11.5px] mt-2 mb-0">{y.projNote}</p>
    </div>
  );
}

// ---------------------------------------------------------------- pagina

export default function YassPage() {
  const { t, game, live } = useSettings();
  const y = t.yass;
  const { data, error } = useApi<Yass>(`/api/yass?lang=${game}`, [live.version, game]);
  const [nationId, setNationId] = usePersistentState<string>("yass.nation", "", isStr);
  const [annexId, setAnnexId] = usePersistentState<string>("yass.annex", "", isStr);
  const [sheet, setSheet] = usePersistentState<Sheet>("yass.sheet", "cohesion", isSheet);
  // le prove restano nel browser, una voce per partita: una campagna nuova parte pulita
  const [tests, setTests] = usePersistentState<Tests>(`yass.tests.${data?.campaign ?? "none"}`, NO_TESTS, isTests);
  const over = tests.over;
  const pipsOver = tests.pips;
  const setOver = (o: Tests["over"]) => setTests({ ...tests, over: o });
  const [selected, setSelected] = useState<string | null>(null);
  // cella scelta nella tabella della Proiezione: riferimento e spiegazione per la barra fx
  const [projSel, setProjSel] = useState<{ ref: string; text: string } | null>(null);

  // Alt+PagSu / Alt+PagGiu cambiano foglio (Ctrl+PagSu in Chrome cambia scheda)
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (!e.altKey || (e.key !== "PageUp" && e.key !== "PageDown")) return;
      e.preventDefault();
      const i = SHEETS.indexOf(sheet) + (e.key === "PageDown" ? 1 : -1);
      setSheet(SHEETS[(i + SHEETS.length) % SHEETS.length]);
      setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet, setSheet]);

  const nations = data?.nations;
  const nation = useMemo(() => nations?.find((n) => String(n.id) === nationId) ?? nations?.[0] ?? null, [nations, nationId]);
  const annexed = useMemo(() => nations?.find((n) => String(n.id) === annexId && n.id !== nation?.id) ?? null, [nations, annexId, nation]);

  if (error) return <Empty>{error}</Empty>;
  if (!data || !nation) return <Empty>{t.common.loading}</Empty>;
  const k = data.constants;

  // pannello Priorita': pallini del salvataggio con le modifiche sopra
  const myPips = pipsOver[nation.id] ?? {};
  const savedPip = (cp: number, id: string) => nation.panelCPs.find((c) => c.index === cp)?.priorities[id] ?? 0;
  const pipOf = (cp: number, id: string) => myPips[cp]?.[id] ?? savedPip(cp, id);
  const effPips: PipMap = Object.fromEntries(nation.panelCPs.map((c) => [c.index, { ...c.priorities, ...myPips[c.index] }]));
  const pipsChanged = nation.panelCPs.some((c) => nation.priorities.some((r) => pipOf(c.index, r.id) !== savedPip(c.index, r.id)));
  const setPip = (cp: number, id: string, value: number) => {
    const cur = pipsOver[nation.id] ?? {};
    setTests({ ...tests, pips: { ...pipsOver, [nation.id]: { ...cur, [cp]: { ...cur[cp], [id]: value } } } });
  };
  const nationIPNow = over[nation.id]?.nationIP ?? nation.ip;
  const results = panel(nation.priorities, nation.panelCPs, effPips, nationIPNow, nation.controlPoints, k.diversity);
  const knowledgeNow = results.find((r) => r.id === "Knowledge")?.ip ?? 0;

  const originals = defaults(nation, k, annexed, knowledgeNow);
  const mine = over[nation.id] ?? {};
  const v = { ...originals, ...mine } as Record<InputKey, number>;
  // coesione di riposo: ricalcolata da disuguaglianza, istruzione, democrazia,
  // PIL pro capite e regioni ostili correnti, salvo «e se…» sul riposo stesso
  const restIn = (x: Record<InputKey, number>) => ({
    inequality: x.inequality, education: x.education, democracy: x.democracy, unrest: nation.unrest,
    pcgdp: x.pcgdp, hostileShare: x.hostileShare / 100,
  });
  const restCalc = restParts(k, nation.restModel, restIn(v));
  if (mine.cohesionRest === undefined) v.cohesionRest = restCalc.rest;
  const restRecalc = mine.cohesionRest === undefined && Math.abs(restCalc.rest - nation.cohesionRest) > 0.005;
  const set = (key: InputKey, val: number) => setOver({ ...over, [nation.id]: { ...mine, [key]: val } });
  const unset = (key: InputKey) => { const m = { ...mine }; delete m[key]; setOver({ ...over, [nation.id]: m }); };
  const edited = new Set(Object.keys(mine) as InputKey[]);
  const reset = () => {
    const o = { ...over }; delete o[nation.id];
    const p = { ...pipsOver }; delete p[nation.id];
    setTests({ over: o, pips: p });
  };

  const options = data.nations.map((n) => ({ id: String(n.id), label: n.name, group: n.mine ? y.groupMine : y.groupOthers }));

  // ------------------------------------------------ calcoli comuni
  const scaling = popScaling(k, v.population);
  const step = knowledgeStep(k, scaling, v.cohesion);
  const move = monthlyMovement(k, v.cohesion, v.cohesionRest, v.inequality);
  const perIP = 1 / k.knowledgeIP;      // Conoscenze per IP (gli IP comprendono gia' i bonus)
  const completions = v.knowledgeIP * perIP;
  const net = move + completions * step;
  // Il calo verso il riposo e' min(tetto, coesione − riposo): con poca
  // Conoscenza la coesione si ferma a riposo + Conoscenze × passo; sale verso 5
  // solo se le Conoscenze del mese superano il tetto.
  const cap = decreaseCap(k, v.inequality);
  const absStep = Math.abs(step) || scaling * k.knowledgeStep;
  const kGain = completions * absStep;
  // sopra 5 la Conoscenza spinge la coesione verso il basso: non aiuta a salire
  const noHelp = v.cohesion >= k.cohesionTarget - 1e-9;
  const restAt5 = v.cohesionRest >= k.cohesionTarget;

  const f = (x: number, d = 2) => nf(x, d);
  // termine di una somma: «+ 1,20» o «− 1,04», mai «+ -1,04»
  const sg = (x: number, d = 2) => (x < 0 ? `− ${nf(-x, d)}` : `+ ${nf(x, d)}`);
  const dash = <span className="text-faint">—</span>;
  const ipCell = (gain: number): Pick<Extract<Row, { kind: "out" }>, "value" | "formula" | "tone" | "note"> => {
    if (noHelp) return { value: dash, formula: y.atTarget };
    if (restAt5 && gain === 0) return { value: nf(0, 1), formula: y.restAt5 };
    const ip = (cap + gain) / absStep / perIP;
    const over = ip > v.nationIP;
    return {
      value: nf(ip, 1), tone: over ? "bad" : undefined,
      note: over ? <span className="text-bad">{y.overNation.replace("{n}", nf(v.nationIP, 1))}</span> : undefined,
      formula: `= (${f(cap, 3)} + ${f(gain, 1)}) / ${f(absStep, 5)} / ${f(perIP, 2)}`,
    };
  };
  const equilibrium: Pick<Extract<Row, { kind: "out" }>, "value" | "formula" | "tone"> =
    noHelp ? { value: dash, formula: y.atTarget }
    : restAt5 ? { value: nf(k.cohesionTarget, 2), formula: y.restAt5, tone: "good" }
    : kGain > cap ? { value: y.climbsTo5, formula: `= ${f(completions, 1)} × ${f(absStep, 5)} = ${f(kGain, 3)} > ${f(cap, 3)}   ${y.beatsCap}`, tone: "good" }
    : { value: nf(Math.min(k.cohesionTarget, v.cohesionRest + kGain), 2),
        formula: `= ${f(v.cohesionRest)} + ${f(completions, 1)} × ${f(absStep, 5)}   ${y.stopsNote}` };

  const pipsNote = nation.panelCPs.length
    ? <span className={pipsChanged ? "text-warn" : ""}>
        <PipText text={(pipsChanged ? y.fromPanelChanged : y.fromPanel).replace("{pct}", nf(v.nationIP ? (knowledgeNow / v.nationIP) * 100 : 0, 0))} />
      </span>
    : y.noPips;
  const knowledgeInputs: Row[] = [
    { kind: "input", key: "nationIP", label: y.nationIP, digits: 1 },
    { kind: "input", key: "knowledgeIP", label: y.knowledgeIP, digits: 2, note: pipsNote },
  ];

  // effetti delle priorita' al mese: completamenti (IP / costo) x effetto per completamento
  const per = perCompletion(k, k.effects, {
    scaling, education: v.education, democracy: v.democracy, cohesion: v.cohesion,
    resourceRegions: nation.resourceRegions, coreEcoRegions: nation.coreEcoRegions,
  });
  const ipOf = (id: string) => (id === "Knowledge" ? v.knowledgeIP : results.find((r) => r.id === id)?.ip ?? 0);
  const compOf = (id: string) => ipOf(id) / (k.priorityCost[id] ?? 1);
  const monthly = (stat: "pcgdp" | "inequality" | "education" | "cohesion" | "democracy") =>
    Object.keys(per).reduce((s, id) => s + compOf(id) * (per[id][stat] ?? 0), 0);
  const prioName = (id: string) => nation.priorities.find((r) => r.id === id)?.name ?? id;
  const validPrio = (id: string) => nation.priorities.some((r) => r.id === id);

  /** Punti/mese in Unita' per fermare il calo: compensa ritorno verso il riposo
      e Conoscenza del mese, con quello che rende un punto in Unita' qui. */
  const unityStop = (): Row => {
    const fall = monthlyMovement(k, v.cohesion, v.cohesionRest, v.inequality) + compOf("Knowledge") * (per.Knowledge.cohesion ?? 0);
    const perIPUnity = (per.Unity.cohesion ?? 0) / (k.priorityCost.Unity ?? 2);
    if (fall >= 0 || !perIPUnity) {
      return { kind: "out", id: "uniStop", label: y.unityStop, value: <span className="text-good">{y.notFalling}</span>, formula: y.notFalling };
    }
    const ip = -fall / perIPUnity;
    const over = ip > v.nationIP;
    return {
      kind: "out", id: "uniStop", label: y.unityStop, value: nf(ip, 1), linked: true, tone: over ? "bad" : undefined,
      note: over ? <span className="text-bad">{y.overNation.replace("{n}", nf(v.nationIP, 1))}</span>
        : y.unityShare.replace("{pct}", nf(ip / Math.max(0.01, v.nationIP) * 100, 0)),
      formula: `= ${f(-fall, 3)} / (${nf(per.Unity.cohesion ?? 0, 5)} / ${f(k.priorityCost.Unity ?? 2, 0)})`,
    };
  };

  /** «1 anno e 1 mese», «2 anni», «5 mesi»: singolare e plurale. */
  const duration = (months: number) => {
    const yy = Math.floor(months / 12), mm = months % 12;
    const ys = yy ? `${yy} ${yy === 1 ? y.year : y.years}` : "";
    const ms = mm ? `${mm} ${mm === 1 ? y.month : y.monthsWord}` : "";
    return ys && ms ? y.durationAnd.replace("{a}", ys).replace("{b}", ms) : ys || ms;
  };

  let rows: Row[] = [];
  if (sheet === "cohesion") {
    rows = [
      { kind: "section", label: y.inputs },
      { kind: "input", key: "population", label: y.population, digits: 1 },
      { kind: "input", key: "cohesion", label: y.cohesion, digits: 2 },
      { kind: "input", key: "cohesionRest", label: y.cohesionRest, digits: 2,
        note: restRecalc ? <span className="text-warn">{y.restRecalc.replace("{v}", f(nation.cohesionRest))}</span> : y.cohesionRestNote },
      { kind: "input", key: "inequality", label: y.inequality, digits: 2 },
      ...knowledgeInputs,
      { kind: "section", label: y.results },
      { kind: "out", id: "scaling", label: y.scaling, value: nf(scaling, 4),
        formula: `= (${f(v.population, 1)} / ${f(k.popScalingBase, 0)}) ^ ${f(k.popScalingExp)}` },
      { kind: "out", id: "step", label: y.step, value: nf(step, 5),
        formula: `= ${f(k.knowledgeStep)} × ${f(scaling, 4)} ${y.towards5}` },
      { kind: "out", id: "move", label: y.movement, value: nf(move, 3), tone: move < 0 ? "bad" : move > 0 ? "good" : undefined,
        formula: v.cohesion > v.cohesionRest
          ? `= −min(${f(decreaseCap(k, v.inequality), 3)}, ${f(v.cohesion)} − ${f(v.cohesionRest)})   ${y.capNote}`
          : `= min(${f(k.maxIncrease, 1)}, ${f(v.cohesionRest)} − ${f(v.cohesion)})` },
      { kind: "out", id: "completions", label: y.completions, value: nf(completions, 1),
        formula: `= ${f(v.knowledgeIP, 1)} / ${f(k.knowledgeIP, 0)} ${y.ipUnit}` },
      { kind: "out", id: "net", label: y.netMonthly, value: nf(net, 3), tone: net < 0 ? "bad" : net > 0 ? "good" : undefined,
        formula: `= ${f(move, 3)} ${sg(completions * step, 3)}` },
      { kind: "out", id: "cap", label: y.decreaseCap, value: nf(cap, 3),
        formula: `= clamp((max(0, ${f(v.inequality)} − 3))² / 10, ${f(k.maxDecrease, 1)}, ${f(k.maxDecreaseCap, 2)})` },
      { kind: "out", id: "eq", label: y.equilibrium, main: true, ...equilibrium },
      { kind: "out", id: "hold", label: y.minHold, main: true, ...ipCell(0) },
      { kind: "out", id: "up1", label: y.minUp1, ...ipCell(0.1) },
      { kind: "out", id: "up2", label: y.minUp2, ...ipCell(0.2) },
      ...(validPrio("Unity") ? [unityStop()] : []),
      { kind: "section", label: y.restSection },
      { kind: "out", id: "rRest", label: y.cohesionRest, main: true, value: nf(restCalc.rest, 2),
        note: nation.restModel.estimated ? <span className="text-warn">{y.restEstimated}</span> : undefined,
        formula: `= 16 ${sg(nation.restModel.population)} ${sg(restCalc.inequality)} ${sg(restCalc.pcgdp)} ${sg(restCalc.hostile)} ${sg(restCalc.government)} ${sg(nation.restModel.wars + nation.restModel.rivals)} ${sg(nation.restModel.residual)} ${sg(restCalc.pull)}   ${y.clampNote}` },
      { kind: "out", id: "rIneq", sub: true, label: y.restIneq, value: nf(restCalc.inequality, 2),
        formula: `= min(1, 0,5 + ${f(v.education)} / 20) × (−${f(v.inequality)} × ${f(k.ineqCohesionMult)}${v.inequality > k.severeInequality ? ` − (${f(v.inequality)} − ${f(k.severeInequality)})` : ""})` },
      { kind: "out", id: "rPop", sub: true, label: y.restPop, value: nf(nation.restModel.population, 2), formula: y.restPopF },
      { kind: "out", id: "rPc", sub: true, label: y.restPc, value: nf(restCalc.pcgdp, 2),
        formula: restCalc.pcgdp ? `= (1 − ${nf(v.pcgdp, 0)} / ${nf(nation.restModel.pcPeak, 0)}) × −${f(v.inequality)}` : y.restPcZero },
      { kind: "out", id: "rHostile", sub: true, label: y.restHostile, value: nf(restCalc.hostile, 2),
        formula: `= −${f(v.hostileShare / 100, 3)} × ${f(k.hostileMax, 0)} × ${f(v.democracy)} / 10` },
      { kind: "out", id: "rGov", sub: true, label: y.restGov, value: nf(restCalc.government + restCalc.pull, 2),
        formula: `${y.restGovF} = ${f(restCalc.government)} ${sg(restCalc.pull)}` },
      { kind: "out", id: "rOther", sub: true, label: y.restOther, value: nf(nation.restModel.wars + nation.restModel.rivals + nation.restModel.residual, 2),
        formula: `= ${f(nation.restModel.wars + nation.restModel.rivals)} ${sg(nation.restModel.residual)}   ${y.restOtherF}` },
      (() => {
        const mx = maxInequalityFor(k, nation.restModel, restIn(v), k.cohesionTarget);
        return { kind: "out", id: "rMaxIneq", main: true, label: y.restMaxIneq,
          value: mx == null ? <span className="text-warn">{y.restImpossible}</span> : nf(mx, 2),
          tone: mx != null && v.inequality > mx ? "bad" : mx != null ? "good" : undefined,
          note: mx != null && v.inequality > mx ? y.restIneqGap.replace("{d}", f(v.inequality - mx)) : undefined,
          formula: mx == null ? y.restImpossible : y.restMaxIneqF } as Row;
      })(),
    ];
  }

  if (sheet === "unrest") {
    const fromCoh = -v.cohesion;
    const fromPc = -v.pcgdp / k.pcgdpPerUnrest;
    const fromHostile = hostileUnrest(k, v.hostileShare / 100, v.democracy);
    const rest = k.unrestBase + fromCoh + fromPc + fromHostile + v.armyOther;
    const needed = (k.unrestBase - v.cohesion + fromHostile + v.armyOther - v.unrestTarget) * k.pcgdpPerUnrest;
    const clamped = nation.unrestRest <= 0 || nation.unrestRest >= 10;
    // con le priorita' di oggi: coesione (ritorno al riposo + Conoscenza e Unita'),
    // PIL pro capite (Economia), democrazia (Governo, che toglie disordini ostili)
    const dCoh = monthlyMovement(k, v.cohesion, v.cohesionRest, v.inequality) + monthly("cohesion");
    const dPc = monthly("pcgdp");
    const dDem = monthly("democracy");
    const dHostile = -(v.hostileShare / 100) * k.hostileMax * dDem / 10;
    const dUnrest = -dCoh - dPc / k.pcgdpPerUnrest + dHostile;
    const restNow = Math.min(10, Math.max(0, k.unrestBase - v.cohesion - v.pcgdp / k.pcgdpPerUnrest
      + hostileUnrest(k, v.hostileShare / 100, v.democracy) + v.armyOther));
    const monthsUnrest = restNow <= v.unrestTarget ? 0 : dUnrest < 0 ? (restNow - v.unrestTarget) / -dUnrest : null;
    const unrestPrio: Row[] = [
      { kind: "section", label: y.withPriorities },
      { kind: "out", id: "uCohM", label: y.uCohMonth, value: nf(dCoh, 3), linked: true, tone: dCoh > 0 ? "good" : dCoh < 0 ? "bad" : undefined,
        formula: `= ${f(monthlyMovement(k, v.cohesion, v.cohesionRest, v.inequality), 3)} ${sg(monthly("cohesion"), 3)}   ${y.uCohMonthNote}` },
      // le tre voci della coesione, come sotto-righe
      { kind: "out", id: "uCohDrift", sub: true, label: y.uCohDrift,
        value: nf(monthlyMovement(k, v.cohesion, v.cohesionRest, v.inequality), 3),
        note: v.cohesion > v.cohesionRest ? y.uCohDriftDown.replace("{rest}", f(v.cohesionRest))
          : v.cohesion < v.cohesionRest ? y.uCohDriftUp.replace("{rest}", f(v.cohesionRest)) : y.uCohDriftStill,
        formula: v.cohesion > v.cohesionRest
          ? `= −min(${f(decreaseCap(k, v.inequality), 3)}, ${f(v.cohesion)} − ${f(v.cohesionRest)})`
          : `= min(${f(k.maxIncrease, 1)}, ${f(v.cohesionRest)} − ${f(v.cohesion)})` },
      { kind: "out", id: "uCohKno", sub: true, linked: true, label: prioName("Knowledge"),
        value: nf(compOf("Knowledge") * (per.Knowledge.cohesion ?? 0), 3),
        note: v.cohesion > k.cohesionTarget ? y.uCohKnoAbove : undefined,
        formula: `= ${f(compOf("Knowledge"), 2)} × ${nf(per.Knowledge.cohesion ?? 0, 5)}` },
      { kind: "out", id: "uCohUni", sub: true, linked: true, label: prioName("Unity"),
        value: nf(compOf("Unity") * (per.Unity.cohesion ?? 0), 3),
        formula: `= ${f(compOf("Unity"), 2)} × ${nf(per.Unity.cohesion ?? 0, 5)}` },
      { kind: "out", id: "uPcM", label: y.uPcMonth, value: nf(dPc, 0), linked: true, tone: dPc > 0 ? "good" : undefined,
        formula: `= ${f(compOf("Economy"), 2)} × ${f(per.Economy.pcgdp ?? 0, 1)}` },
      { kind: "out", id: "uDemM", label: y.uDemMonth, value: nf(dDem, 3), linked: true,
        formula: `= ${f(compOf("Government"), 2)} × ${f(per.Government.democracy ?? 0, 4)}` },
      { kind: "out", id: "uM", label: y.uMonth, value: nf(dUnrest, 3), linked: true, main: true,
        tone: dUnrest < 0 ? "good" : dUnrest > 0 ? "bad" : undefined,
        formula: `= −(${f(dCoh, 3)}) − ${f(dPc, 0)} / ${nf(k.pcgdpPerUnrest, 0)} ${sg(dHostile, 3)}` },
      { kind: "out", id: "uMonths", label: y.uMonthsTo.replace("{x}", nf(v.unrestTarget, 1)), linked: true,
        value: monthsUnrest == null ? <span className="text-warn">{y.uNever}</span>
          : monthsUnrest === 0 ? <span className="text-good">{y.already}</span> : nf(monthsUnrest, 0),
        formula: monthsUnrest == null ? y.uNever : `= (${f(restNow)} − ${f(v.unrestTarget, 1)}) / ${f(-dUnrest, 3)}` },
    ];
    rows = [
      { kind: "section", label: y.inputs },
      { kind: "input", key: "cohesion", label: y.cohesion, digits: 2 },
      { kind: "input", key: "cohesionRest", label: y.cohesionRest, digits: 2 },
      { kind: "input", key: "inequality", label: y.inequality, digits: 2 },
      { kind: "input", key: "education", label: y.education, digits: 2 },
      { kind: "input", key: "pcgdp", label: y.pcgdp, digits: 0 },
      { kind: "input", key: "democracy", label: y.democracy, digits: 2 },
      { kind: "input", key: "hostileShare", label: y.hostileShare, digits: 1 },
      { kind: "input", key: "armyOther", label: y.armyOther, digits: 2,
        note: clamped ? <span className="text-warn">{y.armyOtherClamped}</span> : y.armyOtherNote },
      { kind: "input", key: "unrestTarget", label: y.unrestTarget, digits: 1 },
      { kind: "section", label: y.results },
      { kind: "out", id: "uBase", label: y.unrestBase, value: nf(k.unrestBase, 1), formula: `= ${f(k.unrestBase, 1)}` },
      { kind: "out", id: "uCoh", label: y.fromCohesion, value: nf(fromCoh, 2), formula: `= −${f(v.cohesion)}` },
      { kind: "out", id: "uPc", label: y.fromPcgdp, value: nf(fromPc, 2),
        formula: `= −${nf(v.pcgdp, 0)} / ${nf(k.pcgdpPerUnrest, 0)}` },
      { kind: "out", id: "uHostile", label: y.fromHostile, value: nf(fromHostile, 2),
        formula: `= ${f(v.hostileShare / 100, 3)} × ${f(k.hostileMax, 0)} × (1 − ${f(v.democracy)} / 10)` },
      { kind: "out", id: "uRest", label: y.unrestRest, main: true, value: nf(Math.min(10, Math.max(0, rest)), 2),
        tone: rest > v.unrestTarget ? "bad" : "good",
        note: y.unrestGame.replace("{v}", nf(nation.unrestRest, 2)),
        formula: `= ${f(k.unrestBase, 1)} − ${f(v.cohesion)} − ${nf(v.pcgdp, 0)} / ${nf(k.pcgdpPerUnrest, 0)} ${sg(fromHostile)} ${sg(v.armyOther)}   ${y.clampNote}` },
      { kind: "out", id: "uNeeded", main: true, label: y.pcgdpNeeded.replace("{x}", nf(v.unrestTarget, 1)), value: nf(Math.max(0, needed), 0),
        formula: `= (${f(k.unrestBase, 1)} − ${f(v.cohesion)} ${sg(fromHostile)} ${sg(v.armyOther)} − ${f(v.unrestTarget, 1)}) × ${nf(k.pcgdpPerUnrest, 0)}` },
      { kind: "out", id: "uGap", label: y.pcgdpGap, value: needed > v.pcgdp ? nf(needed - v.pcgdp, 0) : <span className="text-good">{y.none}</span>,
        tone: needed > v.pcgdp ? "bad" : undefined, formula: `= ${nf(Math.max(0, needed), 0)} − ${nf(v.pcgdp, 0)}` },
      ...unrestPrio,
    ];
  }

  if (sheet === "effects") {
    const out = (id: string, label: string, value: number, digits: number, formula: string): Extract<Row, { kind: "out" }> =>
      ({ kind: "out", id, label, value: nf(value, digits), formula, linked: true });
    const comp = (id: string): Row => out(`c${id}`, y.compPerMonth, compOf(id), 2,
      `= ${f(ipOf(id), 2)} / ${f(k.priorityCost[id] ?? 1, 0)} ${y.ipUnit}`);
    const eff = (id: string, stat: "pcgdp" | "inequality" | "education" | "cohesion" | "democracy", label: string, digits: number): Row =>
      out(`e${id}${stat}`, label, compOf(id) * (per[id][stat] ?? 0), digits,
        `= ${f(compOf(id), 2)} × ${nf(per[id][stat] ?? 0, digits + 2)}`);
    rows = [
      { kind: "section", label: y.inputs },
      { kind: "input", key: "population", label: y.population, digits: 1 },
      { kind: "input", key: "education", label: y.education, digits: 2 },
      { kind: "input", key: "democracy", label: y.democracy, digits: 2 },
      { kind: "input", key: "cohesion", label: y.cohesion, digits: 2 },
      { kind: "input", key: "nationIP", label: y.nationIP, digits: 1 },
      { kind: "input", key: "knowledgeIP", label: y.knowledgeIP, digits: 2 },
      { kind: "section", label: y.results },
      ...(validPrio("Economy") ? [{ kind: "section", label: prioName("Economy") } as Row, comp("Economy"),
        eff("Economy", "pcgdp", y.ePcgdp, 0), eff("Economy", "inequality", y.eIneq, 4)] : []),
      ...(validPrio("Welfare") ? [{ kind: "section", label: prioName("Welfare") } as Row, comp("Welfare"),
        eff("Welfare", "inequality", y.eIneq, 4)] : []),
      { kind: "section", label: prioName("Knowledge") }, comp("Knowledge"),
      eff("Knowledge", "education", y.eEdu, 4), eff("Knowledge", "cohesion", y.eCoh, 4),
      ...(validPrio("Government") ? [{ kind: "section", label: prioName("Government") } as Row, comp("Government"),
        v.democracy >= 10 ? eff("Government", "education", y.eEdu, 4) : eff("Government", "democracy", y.eDem, 4)] : []),
      ...(validPrio("Unity") ? [{ kind: "section", label: prioName("Unity") } as Row, comp("Unity"),
        eff("Unity", "cohesion", y.eCoh, 4), eff("Unity", "education", y.eEdu, 4)] : []),
      { kind: "section", label: y.totalMonth },
      { ...out("tPc", y.ePcgdp, monthly("pcgdp"), 0, y.totalFormula), main: true },
      { ...out("tIneq", y.eIneq, monthly("inequality"), 4, y.totalFormula), main: true },
      { ...out("tEdu", y.eEdu, monthly("education"), 4, y.totalFormula), main: true },
      { ...out("tDem", y.eDem, monthly("democracy"), 4, y.totalFormula), main: true },
      { ...out("tCoh", y.eCohPrio, monthly("cohesion"), 4, y.totalFormula), main: true },
    ];
  }

  if (sheet === "annex") {
    rows = [
      { kind: "section", label: y.inputs },
      { kind: "input", key: "population", label: y.population, digits: 1 },
      { kind: "input", key: "pcgdp", label: y.pcgdp, digits: 0 },
      { kind: "input", key: "democracy", label: y.democracy, digits: 2 },
      { kind: "input", key: "hostileShare", label: y.hostileShare, digits: 1 },
      { kind: "pick", id: "annexed", label: y.annexed, node: (
        <Combo value={annexed ? String(annexed.id) : null} onChange={setAnnexId} placeholder={y.pickAnnexed}
          options={options.filter((o) => o.id !== String(nation.id))} width={200} />
      ) },
    ];
    if (annexed) {
      rows.push({ kind: "input", key: "annexedDemocracy", label: y.annexedDemocracy, digits: 2 });
      const byDemocracy = v.annexedDemocracy > v.democracy + k.hostileDemocracyGap;
      const claims = new Set(nation.claims), hostileClaims = new Set(nation.hostileClaims);
      const newHostile = annexed.regions.filter((r) => byDemocracy || !claims.has(r.id) || hostileClaims.has(r.id));
      const newHostilePop = newHostile.reduce((s, r) => s + r.population, 0);
      const pop = v.population + annexed.population;
      const gdp = v.pcgdp * v.population * 1e6 + annexed.gdp;
      const share = (v.hostileShare / 100 * v.population + newHostilePop) / pop;
      const mScaling = popScaling(k, pop);
      rows.push(
        { kind: "section", label: y.results },
        { kind: "out", id: "aPop", label: y.mergedPop, value: nf(pop, 1),
          formula: `= ${f(v.population, 1)} + ${f(annexed.population, 1)}` },
        { kind: "out", id: "aGdp", label: y.mergedGdp, value: nf(gdp / 1e9, 0),
          formula: `= ${nf(v.pcgdp, 0)} × ${f(v.population, 1)} mln + ${nf(annexed.gdp / 1e9, 0)} mld` },
        { kind: "out", id: "aPc", label: y.mergedPc, main: true, value: nf(gdp / (pop * 1e6), 0),
          formula: `= ${nf(gdp / 1e9, 0)} mld / ${f(pop, 1)} mln` },
        { kind: "out", id: "aHostileRegions", label: y.hostileRegions,
          value: `${newHostile.length} / ${annexed.regions.length}`,
          note: byDemocracy ? y.hostileByDemocracy.replace("{gap}", nf(k.hostileDemocracyGap, 1))
            : y.hostileRegionsNote.replace("{pop}", nf(newHostilePop, 1)),
          formula: byDemocracy
            ? `= ${f(v.annexedDemocracy)} > ${f(v.democracy)} + ${f(k.hostileDemocracyGap, 1)}`
            : y.hostileRule },
        { kind: "out", id: "aShare", label: y.mergedHostileShare, value: `${nf(share * 100, 1)}%`,
          formula: `= (${f(v.hostileShare / 100 * v.population, 1)} + ${f(newHostilePop, 1)}) / ${f(pop, 1)}` },
        { kind: "out", id: "aUnrest", label: y.fromHostile, main: true, value: nf(hostileUnrest(k, share, v.democracy), 2), tone: "bad",
          formula: `= ${f(share, 3)} × ${f(k.hostileMax, 0)} × (1 − ${f(v.democracy)} / 10)` },
        { kind: "out", id: "aScaling", label: y.scaling, value: nf(mScaling, 4),
          formula: `= (${f(pop, 1)} / ${f(k.popScalingBase, 0)}) ^ ${f(k.popScalingExp)}` },
        { kind: "out", id: "aStep", label: y.stepAbs, value: nf(mScaling * k.knowledgeStep, 5),
          formula: `= ${f(k.knowledgeStep)} × ${f(mScaling, 4)}` },
      );
      // ogni completamento di Governo o Unita' avvicina di uno la fine
      // dell'ostilita' di una regione: a 200 sparisce
      const legit = compOf("Government") + compOf("Unity");
      const totalHostile = newHostile.length + nation.regions.filter((r) => r.hostile).length;
      const perRegion = legit > 0 ? k.legitimize / legit : null;
      rows.push(
        { kind: "section", label: y.legitTitle },
        { kind: "out", id: "aLegit", label: y.legitComp, value: nf(legit, 2), linked: true,
          formula: `= ${f(compOf("Government"), 2)} + ${f(compOf("Unity"), 2)}` },
        { kind: "out", id: "aLegitOne", label: y.legitOne, linked: true, main: true,
          value: perRegion == null ? <span className="text-warn">{y.legitNever}</span> : duration(Math.ceil(perRegion)),
          formula: perRegion == null ? y.legitNever : `= ${f(k.legitimize, 0)} / ${f(legit, 2)}` },
        { kind: "out", id: "aLegitAll", label: y.legitAll.replace("{n}", String(totalHostile)), linked: true,
          value: perRegion == null || !totalHostile ? <span className="text-faint">—</span> : duration(Math.ceil(perRegion * totalHostile)),
          note: nation.legitimizeProgress ? y.legitProgress.replace("{p}", nf(nation.legitimizeProgress, 0)).replace("{n}", f(k.legitimize, 0)) : undefined,
          formula: perRegion == null ? y.legitNever : `= ${f(k.legitimize, 0)} × ${totalHostile} / ${f(legit, 2)}` },
        { kind: "out", id: "aLegitDem", label: y.uDemMonth, value: nf(compOf("Government") * (per.Government.democracy ?? 0), 3), linked: true,
          formula: `= ${f(compOf("Government"), 2)} × ${nf(per.Government.democracy ?? 0, 4)}` },
      );
    }
  }

  let projection: ReactNode = null;
  if (sheet === "projection") {
    const at = PROJ_YEARS.map((yy) => yy * 12);
    const states = projectNation(k, k.effects, {
      start: { cohesion: v.cohesion, pcgdp: v.pcgdp, inequality: v.inequality, democracy: v.democracy, education: v.education },
      rest: v.cohesionRest, scaling, hostileShare: v.hostileShare / 100, armyOther: v.armyOther,
      resourceRegions: nation.resourceRegions, coreEcoRegions: nation.coreEcoRegions,
      completions: Object.fromEntries(Object.keys(per).map((id) => [id, compOf(id)])),
      // il riposo segue disuguaglianza, istruzione, democrazia e PIL del mese;
      // se l'hai fissato con la matita resta fermo
      restOf: mine.cohesionRest === undefined
        ? (st, unrest) => restParts(k, nation.restModel, { ...st, unrest, hostileShare: v.hostileShare / 100 }).rest
        : undefined,
    }, at);
    rows = [
      { kind: "section", label: y.inputs },
      { kind: "input", key: "cohesion", label: y.cohesion, digits: 2 },
      { kind: "input", key: "cohesionRest", label: y.cohesionRest, digits: 2 },
      { kind: "input", key: "inequality", label: y.inequality, digits: 2 },
      { kind: "input", key: "education", label: y.education, digits: 2 },
      { kind: "input", key: "democracy", label: y.democracy, digits: 2 },
      { kind: "input", key: "pcgdp", label: y.pcgdp, digits: 0 },
      { kind: "input", key: "hostileShare", label: y.hostileShare, digits: 1 },
      { kind: "input", key: "armyOther", label: y.armyOther, digits: 2 },
      { kind: "input", key: "knowledgeIP", label: y.knowledgeIP, digits: 2 },
    ];
    projection = (
      <ProjectionTable states={states} years={PROJ_YEARS} panelSig={results.map((r) => r.ip.toFixed(3)).join("|")}
        selected={projSel} onSelect={setProjSel} />
    );
  }

  // ingressi in due gruppi: cio' che viene dalla partita e le scelte dell'utente
  {
    const at = rows.findIndex((r) => r.kind === "section" && r.label === y.results);
    const save = rows.filter((r) => r.kind === "input" && FROM_SAVE.has(r.key));
    const choice = rows.filter(isChoice);
    rows = [
      ...(save.length ? [{ kind: "section", label: y.fromGame } as Row, ...save] : []),
      ...(choice.length ? [{ kind: "section", label: y.yourChoices } as Row, ...choice] : []),
      ...(at >= 0 ? rows.slice(at) : []),
    ];
  }
  const selIndex = rows.findIndex((r) => r.kind !== "section" && rowId(r) === selected);
  const sel = selIndex >= 0 ? rows[selIndex] as Exclude<Row, { kind: "section" }> : null;
  const fx = !sel ? (sheet === "projection" && projSel ? <span>{projSel.text}</span> : <span className="text-faint">{y.fxHint}</span>)
    : sel.kind === "pick" ? <span className="text-dim">{y.choiceCell}</span>
    : sel.kind === "input"
      ? <span className="text-dim">{FROM_SAVE.has(sel.key)
          ? y.fromSave.replace("{v}", nf(originals[sel.key], sel.digits))
          : y.choiceCell}</span>
      : <span>{sel.formula}</span>;

  return (
    <Panel title={<span className="inline-flex items-center gap-2"><YassIcon size={15} />{y.title}</span>} right={
      <Guide title={y.title} sections={[
        { body: [y.guideIntro] },
        { title: y.guideSheetsTitle, body: [y.guideSheets] },
        { title: y.guideIPTitle, body: [<PipText key="ip1" text={y.guideIP} />, <PipText key="ip2" text={y.guideIP2} />] },
        { title: y.guideHonestTitle, body: [y.guideHonest] },
        { title: y.guideKeysTitle, body: [y.guideKeys] },
        { title: y.guideThanksTitle, body: [<>{y.thanks} <a href={REDDIT} target="_blank" rel="noreferrer" className="text-accent">{y.thanksLink}</a></>] },
      ]} />
    }>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <Combo value={String(nation.id)} onChange={(id) => { setNationId(id); setSelected(null); }}
          options={options} width={280} />
        <button type="button" onClick={reset} disabled={!Object.keys(mine).length && !pipsChanged}
          className="text-[12px] text-accent hover:text-ink disabled:text-faint">{y.reset}</button>
        <span className="ml-auto text-faint text-[11.5px]">
          {y.thanks} <a href={REDDIT} target="_blank" rel="noreferrer" className="text-accent hover:text-ink">{y.thanksLink}</a>
        </span>
      </div>

      <div className="yass-layout">
      <section className="yass-panel">
        <PriorityPanel rows={nation.priorities} cps={nation.panelCPs} pips={pipOf} saved={savedPip}
          used={USED_BY_SHEET[sheet]} usedBy={y.sheets[sheet]}
          results={results} controlPoints={nation.controlPoints} faction={data.faction} onPip={setPip}
          onRow={(id, values) => {
            const cur = { ...(pipsOver[nation.id] ?? {}) };
            for (const [cp, val] of Object.entries(values)) cur[+cp] = { ...cur[+cp], [id]: val };
            setTests({ ...tests, pips: { ...pipsOver, [nation.id]: cur } });
          }} />
      </section>
      <div className="min-w-0">
      <div className="yass-fx">
        <span className="yass-name">{sel ? `B${selIndex + 1}` : sheet === "projection" && projSel ? projSel.ref : ""}</span>
        <span className="yass-fx-label">fx</span>
        <span className="yass-fx-body">{fx}</span>
      </div>

      <div className="yass-body">
      <Grid rows={rows} values={v} originals={originals} edited={edited} set={set} unset={unset}
        selected={selected} select={setSelected} pcgdpPerUnrest={k.pcgdpPerUnrest}
        panelSig={results.map((r) => r.ip.toFixed(3)).join("|")} />
      {sheet === "annex" && <p className="text-faint text-[11.5px] mt-2 mb-0">{annexed ? y.annexNote : y.pickAnnexedHint}</p>}
      {projection}
      </div>

      <nav className="yass-sheets" aria-label={y.sheetsLabel}>
        {SHEETS.map((s) => (
          <button key={s} type="button" onClick={() => { setSheet(s); setSelected(null); }}
            aria-current={s === sheet ? "page" : undefined}
            className={s === sheet ? "yass-sheet-on" : ""}>
            {y.sheets[s]}
          </button>
        ))}
      </nav>
      </div>
      </div>
    </Panel>
  );
}
