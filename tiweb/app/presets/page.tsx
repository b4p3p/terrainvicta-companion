"use client";

import { useCallback, useEffect, useState } from "react";
import { API, api } from "@/lib/api";
import { useSettings } from "@/lib/settings";
import { Button, Empty, Panel, Tag } from "@/components/ui";

interface Preset {
  id: string;
  name: string;
  faction: string | null;
  mine: boolean;
  installed: boolean;
  count: number;
  total: number;
  research: number;
  military: number;
  weights: Record<string, number>;
}

interface Status {
  ok: boolean;
  error: string | null;
  path: string | null;
  writable: boolean;
  backup: boolean;
  installed: number;
  presets: Preset[];
  pending: Preset[];
}

const pc = (v: number) => `${(v * 100).toFixed(1)}%`;

/** Le voci accese, in ordine di peso: è la ripartizione vera del bilancio. */
function Weights({ p }: { p: Preset }) {
  const rows = Object.entries(p.weights).sort((a, b) => b[1] - a[1]);
  return (
    <div className="flex gap-1 flex-wrap">
      {rows.map(([k, w]) => (
        <span key={k} className="text-[11px] border border-edge px-1.5 py-[1px]
                                 inline-flex items-baseline gap-1">
          <span className={k === "knowledge" ? "text-good" : "text-dim"}>{k}</span>
          <span className="text-faint">{w}</span>
          <span className="text-faint">·</span>
          <span>{pc(w / p.total)}</span>
        </span>
      ))}
    </div>
  );
}

function Row({ p }: { p: Preset }) {
  return (
    <div className={`bg-panel border px-3 py-2 mb-[2px] ${
      p.mine ? "border-accent/50" : "border-edge"}`}>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="font-semibold text-[13px]">{p.name}</span>
        {p.faction && <span className="text-faint text-[11.5px]">{p.faction}</span>}
        {p.mine && p.installed && <Tag tone="mine">nel gioco</Tag>}
        <span className="ml-auto flex gap-3 text-[12px]">
          <span className="text-faint">{p.count} voci</span>
          <span className="text-good">ricerca {pc(p.research)}</span>
          <span className={p.military > 0.3 ? "text-bad" : "text-dim"}>
            militare {pc(p.military)}
          </span>
        </span>
      </div>
      <div className="mt-1.5"><Weights p={p} /></div>
    </div>
  );
}

export default function PresetsPage() {
  const { t } = useSettings();
  const [st, setSt] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Status>("/api/presets").then(setSt).catch((e) => setMsg(String(e)));
  }, []);
  useEffect(load, [load]);

  async function act(what: "install" | "restore") {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`${API}/api/presets/${what}`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail ?? r.statusText);
      setSt(d.status);
      setMsg(what === "install" ? t.presets.done : t.presets.undone);
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!st) return <Empty>{msg ?? t.common.loading}</Empty>;
  if (!st.ok) return <Empty>{st.error}</Empty>;

  return (
    <>
      <Panel title={t.presets.title} sub={t.presets.sub}>
        <p className="text-dim text-[12px] mb-3 max-w-[90ch]">{t.presets.why}</p>
        <p className="text-warn text-[12px] mb-3 max-w-[90ch]">{t.presets.achievements}</p>

        <div className="flex items-center gap-2 flex-wrap mb-3">
          <Button onClick={() => act("install")} tone="primary"
            disabled={busy || !st.writable}>
            {st.installed === st.pending.length ? t.presets.reinstall : t.presets.install}
          </Button>
          <Button onClick={() => act("restore")} tone="danger"
            disabled={busy || (!st.backup && st.installed === 0)}>
            {t.presets.restore}
          </Button>
          {msg && <span className="text-[12px] text-dim">{msg}</span>}
        </div>

        {!st.writable && (
          <p className="text-bad text-[12px] mb-3">{t.presets.notWritable}</p>
        )}
        <p className="text-faint text-[11.5px] mb-4 break-all">
          {t.presets.file}: {st.path}
        </p>

        <h3 className="display text-[12px] uppercase tracking-[.06em] text-dim mb-1.5">
          {t.presets.ours}
        </h3>
        {st.pending.map((p) => <Row key={p.id} p={p} />)}
      </Panel>

      <Panel title={t.presets.builtin} sub={t.presets.builtinHint}>
        {[...st.presets].sort((a, b) => b.research - a.research).map((p) => (
          <Row key={p.id} p={p} />
        ))}
      </Panel>
    </>
  );
}
