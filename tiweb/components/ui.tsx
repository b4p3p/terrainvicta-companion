"use client";

import { useMemo, useState, type ReactNode } from "react";

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
    <section
      className={`bg-panel border border-line rounded-lg p-4 mb-5 ${className}`}
    >
      {(title || right) && (
        <header className="flex items-start justify-between gap-4 mb-1">
          <div>
            {title && <h2 className="text-[15px] text-warn font-semibold m-0">{title}</h2>}
            {sub && <p className="text-dim text-[12.5px] mt-1 mb-0">{sub}</p>}
          </div>
          {right}
        </header>
      )}
      <div className={title ? "mt-3" : ""}>{children}</div>
    </section>
  );
}

export function Stat({
  label, value, tone = "accent",
}: { label: string; value: ReactNode; tone?: "accent" | "mine" | "warn" | "bad" }) {
  const color =
    tone === "mine" ? "text-mine" : tone === "warn" ? "text-warn"
      : tone === "bad" ? "text-bad" : "text-accent";
  return (
    <div className="bg-panel border border-line rounded-lg px-4 py-3 min-w-[140px] flex-1">
      <div className={`text-[22px] font-semibold leading-tight ${color}`}>{value}</div>
      <div className="text-[11.5px] text-dim uppercase tracking-wide mt-1">{label}</div>
    </div>
  );
}

export function Tag({
  children, tone = "dim",
}: { children: ReactNode; tone?: "mine" | "free" | "bad" | "warn" | "dim" }) {
  const map = {
    mine: "bg-mine/15 text-mine",
    free: "bg-free/15 text-free",
    bad: "bg-bad/12 text-bad",
    warn: "bg-warn/15 text-warn",
    dim: "bg-panel2 text-dim",
  } as const;
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-semibold ${map[tone]}`}>
      {children}
    </span>
  );
}

/** Sparkline: verde se l'ultimo valore è sopra il primo, rossa altrimenti. */
export function Spark({ data, w = 54, h = 14 }: { data: number[]; w?: number; h?: number }) {
  if (!data || data.length < 2) return null;
  const mn = Math.min(...data), mx = Math.max(...data), sp = mx - mn || 1;
  const pts = data
    .map((v, i) => `${((i / (data.length - 1)) * w).toFixed(1)},${(h - ((v - mn) / sp) * h).toFixed(1)}`)
    .join(" ");
  const up = data[data.length - 1] >= data[0];
  return (
    <svg width={w} height={h} className="inline-block align-middle">
      <polyline points={pts} fill="none" strokeWidth={1.4}
        stroke={up ? "var(--mine)" : "var(--bad)"} />
    </svg>
  );
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
          <span className="h-3 rounded-sm"
            style={{
              width: `${Math.max((value(r) / max) * 100, 1)}%`,
              background: highlight?.(r) ? "var(--mine)" : "var(--accent)",
              opacity: 0.8,
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
              <th key={c.key}
                onClick={() => {
                  if (c.key === sortKey) setAsc(!asc);
                  else { setSortKey(c.key); setAsc(false); }
                }}>
                {c.title}
                {c.key === sortKey && <span className="text-accent">{asc ? " ▴" : " ▾"}</span>}
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
  return <p className="text-dim text-[13px] py-6 text-center">{children}</p>;
}

export function Button({
  children, onClick, tone = "normal", disabled, type = "button",
}: {
  children: ReactNode; onClick?: () => void;
  tone?: "normal" | "primary" | "danger"; disabled?: boolean;
  type?: "button" | "submit";
}) {
  const map = {
    normal: "border-line hover:border-accent hover:text-accent",
    primary: "border-accent text-accent hover:bg-accent/10",
    danger: "border-line text-dim hover:border-bad hover:text-bad",
  } as const;
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`bg-panel2 border rounded-md px-4 py-2 text-[13px] cursor-pointer
        disabled:opacity-50 disabled:cursor-default transition-colors ${map[tone]}`}>
      {children}
    </button>
  );
}
