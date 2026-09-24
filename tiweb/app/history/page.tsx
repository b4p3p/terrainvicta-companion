"use client";

import { useRef, useState } from "react";
import { api, useApi, useEngineStatus } from "@/lib/api";
import { useSettings } from "@/lib/settings";
import { Button, Empty, Panel, nf } from "@/components/ui";
import type { HistoryPoint } from "@/lib/types";

const SERIES = [
  { key: "Money", label: "Denaro", color: "var(--good)" },
  { key: "Influence", label: "Influenza", color: "var(--accent)" },
  { key: "Operations", label: "Operazioni", color: "var(--other)" },
] as const;

/** Grafico a linee su SVG: niente librerie, i dati sono pochi e regolari. */
function Lines({
  points, pick, color, label,
}: {
  points: HistoryPoint[];
  pick: (p: HistoryPoint) => number;
  color: string;
  label: string;
}) {
  const W = 800, H = 180, P = { t: 12, r: 12, b: 26, l: 46 };
  const vals = points.map(pick);
  const mn = Math.min(0, ...vals), mx = Math.max(...vals, 1);
  const X = (i: number) =>
    P.l + (points.length < 2 ? 0 : (i / (points.length - 1)) * (W - P.l - P.r));
  const Y = (v: number) => H - P.b - ((v - mn) / (mx - mn || 1)) * (H - P.t - P.b);
  const d = points.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(pick(p)).toFixed(1)}`).join(" ");

  return (
    <div>
      <div className="text-[12.5px] text-dim mb-1">{label}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        {[0, 1, 2, 3].map((i) => {
          const y = P.t + (i * (H - P.t - P.b)) / 3;
          const v = mx - (i * (mx - mn)) / 3;
          return (
            <g key={i}>
              <line x1={P.l} y1={y} x2={W - P.r} y2={y}
                stroke="var(--edge)" strokeDasharray="2 3" />
              <text x={P.l - 6} y={y + 3} textAnchor="end"
                fill="var(--ink-dim)" fontSize="10">{nf(v, 0)}</text>
            </g>
          );
        })}
        <path d={d} fill="none" stroke={color} strokeWidth="1.8" />
        {points.length <= 40 && points.map((p, i) => (
          <circle key={i} cx={X(i)} cy={Y(pick(p))} r="2.5" fill={color}>
            <title>{p.date}: {nf(pick(p))}</title>
          </circle>
        ))}
        {points.length > 1 && (
          <>
            <text x={P.l} y={H - 8} fill="var(--ink-dim)" fontSize="10">{points[0].dateKey}</text>
            <text x={W - P.r} y={H - 8} textAnchor="end" fill="var(--ink-dim)" fontSize="10">
              {points[points.length - 1].dateKey}
            </text>
          </>
        )}
      </svg>
    </div>
  );
}

interface DataSummary {
  snapshots: number; campaigns: number; notes: number; goals: number;
  presets: number; bytes: number;
}

const fill = (s: string, v: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));

/** Export e import di storico, note, obiettivi e preset personali. Nel
 *  browser e' l'unico modo di non perderli, e di portarci lo storico
 *  dell'API locale (vedi ticore/portable.py). */
function DataPanel({ onImported }: { onImported: () => void }) {
  const { t, live } = useSettings();
  const h = t.history;
  const browser = useEngineStatus() !== null;
  const [tick, setTick] = useState(0);
  const { data: sum } = useApi<DataSummary>("/api/data", [live.version, tick]);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const doExport = async () => {
    setBusy(true);
    try {
      const d = await api<{ file: string; base64: string }>("/api/data/export");
      const bytes = Uint8Array.from(atob(d.base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = d.file;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMsg({ text: fill(h.dataExported, { file: d.file }) });
    } catch (e) {
      setMsg({ text: String(e).replace(/^Error: /, ""), bad: true });
    } finally {
      setBusy(false);
    }
  };

  const doImport = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const b64 = await new Promise<string>((ok, ko) => {
        const r = new FileReader();
        r.onload = () => ok(String(r.result).split(",", 2)[1] ?? "");
        r.onerror = () => ko(r.error);
        r.readAsDataURL(file);
      });
      const res = await api<{ snapshots: number; snapshotsNewer: number; notes: number;
        goals: number; presets: number }>("/api/data/import",
        { method: "POST", body: JSON.stringify({ file: file.name, base64: b64 }) });
      setMsg({ text: fill(h.dataImported, { ...res, newer: res.snapshotsNewer }) });
      setTick((x) => x + 1);
      onImported();
    } catch (e) {
      setMsg({ text: String(e).replace(/^Error: /, ""), bad: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title={h.dataTitle}>
      <div className="space-y-2 text-[12.5px] max-w-3xl">
        <p className={browser ? "text-warn" : "text-dim"}>{browser ? h.dataBrowser : h.dataServer}</p>
        {sum && (
          <p className="text-dim tabular-nums">
            {fill(h.dataCounts, { ...sum, size: `${(sum.bytes / 1048576).toFixed(1)} MB` })}
          </p>
        )}
        <div className="flex items-center gap-2 flex-wrap pt-1">
          <Button tone="primary" onClick={doExport} disabled={busy || !sum?.snapshots}>{h.dataExport}</Button>
          <Button onClick={() => input.current?.click()} disabled={busy}>{h.dataImport}</Button>
          <input ref={input} type="file" accept=".zip,.db,.json" className="hidden"
            onChange={(e) => { void doImport(e.target.files?.[0]); e.target.value = ""; }} />
          {msg && <span className={`text-[12px] ${msg.bad ? "text-bad" : "text-good"}`}>{msg.text}</span>}
        </div>
        <p className="text-faint text-[11.5px]">{h.dataImportHint}</p>
      </div>
    </Panel>
  );
}

export default function HistoryPage() {
  const { t, live } = useSettings();
  const [imported, setImported] = useState(0);
  const { data, error } = useApi<HistoryPoint[]>("/api/history", [live.version, imported]);
  // il pannello dei dati c'e' sempre: e' da li' che si importa uno storico
  const dataPanel = <DataPanel onImported={() => setImported((x) => x + 1)} />;

  if (!data) return <><Empty>{error ?? t.common.loading}</Empty>{dataPanel}</>;
  if (data.length < 2) return <>
    <Panel title={t.history.title}><Empty>{t.history.empty}</Empty></Panel>
    {dataPanel}
  </>;

  return (
    <>
      <Panel title={t.history.title}
        sub={`${t.history.hint} — ${data.length} ${t.history.points}`}>
        <div className="grid gap-6 lg:grid-cols-2">
          {SERIES.map((s) => (
            <Lines key={s.key} points={data} label={s.label} color={s.color}
              pick={(p) => p.resources[s.key] ?? 0} />
          ))}
          <Lines points={data} label="Punti di controllo" color="var(--warn)"
            pick={(p) => p.cp} />
          <Lines points={data} label="Ricerca al mese" color="var(--accent)"
            pick={(p) => p.research} />
          <Lines points={data} label="Consiglieri" color="var(--other)"
            pick={(p) => p.council} />
        </div>
      </Panel>

      <Panel title="Rilevazioni">
        <div className="overflow-auto max-h-[50vh]">
          <table className="data">
            <thead>
              <tr>
                <th>Data</th><th>Denaro</th><th>Influenza</th><th>Operazioni</th>
                <th>CP</th><th>Consiglio</th><th>Ricerca/m</th>
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((p) => (
                <tr key={p.dateKey}>
                  <td>{p.date}</td>
                  <td>{nf(p.resources.Money, 0)}</td>
                  <td className={(p.resources.Influence ?? 0) < 15 ? "text-bad" : ""}>
                    {nf(p.resources.Influence, 0)}
                  </td>
                  <td>{nf(p.resources.Operations, 0)}</td>
                  <td>{p.cp}</td>
                  <td>{p.council}</td>
                  <td>{nf(p.research, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {dataPanel}
    </>
  );
}
