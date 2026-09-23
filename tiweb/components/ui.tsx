"use client";

import { useMemo, useState, type ReactNode } from "react";
import { API } from "@/lib/api";

export const nf = (v: number | null | undefined, d = 1) =>
  v == null || Number.isNaN(v)
    ? "—"
    : v.toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d });

export const bn = (v: number | null | undefined) => (v == null ? "—" : nf(v / 1e9, 0));
export const pct = (v: number | null | undefined, d = 1) =>
  v == null ? "—" : nf(v * 100, d) + "%";

export function Panel({
  title, sub, right, children, className = "",
}: {
  title?: string; sub?: string; right?: ReactNode;
  children: ReactNode; className?: string;
}) {
  return (
    <section className={`bg-raised border border-edge mb-4 ${className}`}>
      {(title || right) && (
        <header className="bg-bar border-b border-edge-lit
                           flex items-baseline justify-between gap-4 px-3 py-1.5">
          {/* il filetto d'accento a sinistra ripete il bordo di selezione del gioco */}
          <h2 className="display text-[13px] uppercase tracking-[.06em] m-0
                         border-l-2 border-accent pl-2 leading-tight">
            {title}
          </h2>
          {right}
        </header>
      )}
      {sub && (
        <p className="text-faint text-[11.5px] px-3 pt-2 pb-0 mb-0 max-w-[80ch]">{sub}</p>
      )}
      <div className="p-3">{children}</div>
    </section>
  );
}

export function Stat({
  label, value, tone = "accent",
}: { label: string; value: ReactNode; tone?: "accent" | "mine" | "warn" | "bad" }) {
  const color =
    tone === "mine" ? "text-good" : tone === "warn" ? "text-warn"
      : tone === "bad" ? "text-bad" : "text-accent";
  return (
    <div className="bg-panel border border-edge px-3 py-2 min-w-[132px] flex-1">
      <div className="text-[11px] text-faint tracking-[.05em]">{label}</div>
      <div className={`display text-[21px] leading-none mt-1 ${color}`}>{value}</div>
    </div>
  );
}

export function Tag({
  children, tone = "dim",
}: { children: ReactNode; tone?: "mine" | "free" | "bad" | "warn" | "dim" }) {
  const map = {
    mine: "border-good/50 text-good",
    free: "border-other/50 text-other",
    bad: "border-bad/60 text-bad",
    warn: "border-warn/50 text-warn",
    dim: "border-edge text-dim",
  } as const;
  return (
    <span className={`inline-block border bg-void/40 px-1.5 py-[1px]
                      text-[11px] leading-[16px] ${map[tone]}`}>
      {children}
    </span>
  );
}

/** Icona del gioco, servita dal repo o estratta dall'installazione locale.
 *  Se manca non lascia un buco: sparisce e resta il testo accanto. */
export function GameIcon({
  bundle, icon, size = 18, height, title,
}: {
  bundle: "councilor_missions" | "icons_2d";
  icon: string | null | undefined; size?: number; title?: string;
  /** per le icone non quadrate; di default uguale a `size` */
  height?: number;
}) {
  const [broken, setBroken] = useState(false);
  if (!icon || broken) return null;
  const h = height ?? size;
  return (
    // PNG di 14-20px serviti dall'API locale: next/image non avrebbe nulla da
    // ottimizzare e richiederebbe di dichiarare l'origine esterna.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${API}/api/icons/${bundle}/${encodeURIComponent(icon)}.png`}
      alt="" title={title} width={size} height={h}
      onError={() => setBroken(true)}
      className="inline-block align-text-bottom shrink-0 object-contain"
      style={{ width: size, height: h }}
    />
  );
}

export function MissionIcon(p: { icon: string | null | undefined; size?: number; title?: string }) {
  return <GameIcon bundle="councilor_missions" {...p} />;
}

export function ResourceIcon(p: { icon: string | null | undefined; size?: number; title?: string }) {
  return <GameIcon bundle="icons_2d" {...p} />;
}

/** Glifo del gioco per ogni attributo del consigliere. */
export const ATTR_ICONS: Record<string, string> = {
  Persuasion: "ICO_persuasion",
  Investigation: "ICO_investigation",
  Espionage: "ICO_espionage",
  Command: "ICO_command",
  Administration: "ICO_administration",
  Science: "ICO_science",
  Security: "ICO_security",
  Loyalty: "ICO_loyalty",
};

export function AttrIcon({
  attr, size = 14, title,
}: { attr: string | null | undefined; size?: number; title?: string }) {
  return <GameIcon bundle="icons_2d" icon={attr ? ATTR_ICONS[attr] : null}
    size={size} title={title} />;
}

/** Freccia di tendenza del gioco: la direzione dice se sale o scende, il
 *  colore se è un bene o un male. Le icone originali sono 44×39. */
export function TrendArrow({
  up, good, size = 11, title,
}: { up: boolean; good: boolean; size?: number; title?: string }) {
  const icon = `ICO_arrow_${good ? "green" : "red"}${up ? "" : "_down"}`;
  return <GameIcon bundle="icons_2d" icon={icon} size={size}
    height={Math.round((size * 39) / 44)} title={title} />;
}

/** Sparkline: verde se l'ultimo valore è sopra il primo, rossa altrimenti.
 *  `upIsBad` inverte i colori per gli indicatori che salendo peggiorano
 *  (disordini, disuguaglianza); una serie piatta resta neutra. */
export function Spark({ data, w = 54, h = 14, upIsBad = false }: {
  data: number[]; w?: number; h?: number; upIsBad?: boolean;
}) {
  if (!data || data.length < 2) return null;
  const mn = Math.min(...data), mx = Math.max(...data), sp = mx - mn || 1;
  const pts = data
    .map((v, i) => `${((i / (data.length - 1)) * w).toFixed(1)},${(h - ((v - mn) / sp) * h).toFixed(1)}`)
    .join(" ");
  const d = data[data.length - 1] - data[0];
  const stroke = d === 0 ? "var(--ink-faint)"
    : (d > 0) !== upIsBad ? "var(--good)" : "var(--bad)";
  return (
    <svg width={w} height={h} className="inline-block align-middle">
      <polyline points={pts} fill="none" strokeWidth={1.4} stroke={stroke} />
    </svg>
  );
}

/** Riempimento delle barre: lucido verticale come le barre del gioco, riga
 *  chiara in alto, corpo pieno, base più scura. `shade` (0-1) scurisce il
 *  tono, per separare segmenti adiacenti dello stesso colore senza cambiare
 *  tinta: l'identità resta al colore, la variazione è solo di luce. */
export function barFill(color: string, shade = 0): string {
  const c = shade ? `color-mix(in oklab, ${color}, black ${Math.round(shade * 100)}%)` : color;
  return [
    `linear-gradient(to bottom,`,
    `color-mix(in oklab, ${c}, white 55%) 0,`,
    `color-mix(in oklab, ${c}, white 28%) 1.5px,`,
    `color-mix(in oklab, ${c}, white 12%) 35%,`,
    `${c} 55%,`,
    `color-mix(in oklab, ${c}, black 22%) 85%,`,
    `color-mix(in oklab, ${c}, black 40%) 100%)`,
  ].join(" ");
}

/** Barre orizzontali etichettate. */
export function Bars<T>({
  rows, value, label, highlight, format,
}: {
  rows: T[];
  value: (r: T) => number;
  label: (r: T) => string;
  highlight?: (r: T) => boolean;
  format: (r: T) => string;
}) {
  const max = Math.max(...rows.map(value), 1);
  return (
    <div className="flex flex-col gap-1">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2 text-[12px]">
          <span className="w-40 shrink-0 text-right text-dim truncate">{label(r)}</span>
          <span className="h-[11px]"
            style={{
              width: `${Math.max((value(r) / max) * 100, 1)}%`,
              background: barFill(highlight?.(r) ? "var(--good)" : "var(--accent)"),
            }} />
          <span className="text-dim shrink-0">{format(r)}</span>
        </div>
      ))}
    </div>
  );
}

export interface Column<T> {
  key: string;
  title: string;
  render: (r: T) => ReactNode;
  sort?: (r: T) => number | string;
  align?: "left" | "right";
  /** icona del gioco (bundle icons_2d) al posto del titolo; il titolo resta nel tooltip */
  icon?: string;
}

/** Tabella ordinabile. L'ordinamento usa `sort` se c'è, altrimenti la chiave. */
export function DataTable<T extends Record<string, unknown>>({
  rows, columns, initialSort, maxHeight = "70vh",
}: {
  rows: T[]; columns: Column<T>[]; initialSort?: string; maxHeight?: string;
}) {
  const [sortKey, setSortKey] = useState(initialSort ?? columns[0].key);
  const [asc, setAsc] = useState(false);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey);
    const get = (r: T) => (col?.sort ? col.sort(r) : (r[sortKey] as number | string));
    return [...rows].sort((a, b) => {
      const va = get(a), vb = get(b);
      if (typeof va === "string" || typeof vb === "string") {
        return asc
          ? String(va).localeCompare(String(vb))
          : String(vb).localeCompare(String(va));
      }
      return asc ? (va ?? 0) - (vb ?? 0) : (vb ?? 0) - (va ?? 0);
    });
  }, [rows, columns, sortKey, asc]);

  return (
    <div className="overflow-auto" style={{ maxHeight }}>
      <table className="data">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} title={c.icon ? c.title : undefined}
                onClick={() => {
                  if (c.key === sortKey) setAsc(!asc);
                  else { setSortKey(c.key); setAsc(false); }
                }}>
                {c.icon
                  ? <GameIcon bundle="icons_2d" icon={c.icon} size={20} title={c.title} />
                  : c.title}
                {c.key === sortKey && <span className="text-accent ml-1">{asc ? "▴" : "▾"}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c.key} style={c.align === "left" ? { textAlign: "left" } : undefined}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-faint text-[12px] py-8 text-center">{children}</p>;
}

export function Button({
  children, onClick, tone = "normal", disabled, type = "button",
}: {
  children: ReactNode; onClick?: () => void;
  tone?: "normal" | "primary" | "danger"; disabled?: boolean;
  type?: "button" | "submit";
}) {
  const map = {
    normal: "border-edge-lit text-ink hover:border-sel-edge hover:bg-sel",
    primary: "border-accent text-accent hover:bg-accent/15",
    danger: "border-edge-lit text-dim hover:border-bad hover:text-bad",
  } as const;
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`bg-control border px-3 py-1 text-[12px] cursor-pointer
        disabled:opacity-40 disabled:cursor-default transition-colors ${map[tone]}`}>
      {children}
    </button>
  );
}
