"use client";

import { useMemo, useState } from "react";
import { useSnapshot } from "@/lib/api";
import { useSettings } from "@/lib/settings";
import { usePersistentState } from "@/lib/persist";
import {
  Column, DataTable, Empty, Panel, Spark, Tag, bn, nf, pct,
} from "@/components/ui";
import type { Nation } from "@/lib/types";

const SCOPES = ["all", "eu", "mine", "full", "partial", "free", "contested"] as const;
type Scope = (typeof SCOPES)[number];
const isScope = (v: unknown): v is Scope => SCOPES.includes(v as Scope);
const isString = (v: unknown): v is string => typeof v === "string";

export default function NationsPage() {
  const { t, game, live } = useSettings();
  const { data: snap } = useSnapshot(live.version, game);
  // combo e ricerca restano fra un caricamento e l'altro; la casella dei
  // proprietari no: e' informazione altrui, deve ripartire spenta ogni volta
  const [scope, setScope] = usePersistentState<Scope>("nations.scope", "eu", isScope);
  const [q, setQ] = usePersistentState("nations.q", "", isString);
  const [showOwners, setShowOwners] = useState(false);

  const rows = useMemo(() => {
    if (!snap) return [];
    return snap.nations.filter((n) => {
      if (q && !n.name.toLowerCase().includes(q.toLowerCase())) return false;
      switch (scope) {
        case "eu": return n.eu;
        case "free": return n.freeCP > 0;
        case "mine": return n.myCP > 0;
        case "full": return n.myCP > 0 && n.myCP === n.cp;
        case "partial": return n.myCP > 0 && n.myCP < n.cp;
        case "contested": return n.takenCP > 0;
        default: return true;
      }
    });
  }, [snap, scope, q]);

  if (!snap) return <Empty>{t.common.loading}</Empty>;

  const columns: Column<Nation>[] = [
    {
      key: "name", title: t.common.nation, align: "left",
      sort: (r) => r.name,
      render: (r) => (
        <>
          {r.name}{" "}
          {r.myCP > 0
            ? <Tag tone={r.myCP === r.cp ? "mine" : "warn"}>{r.myCP}/{r.cp}</Tag>
            : r.freeCP === r.cp ? <Tag tone="free">{t.nations.free}</Tag>
              : r.freeCP > 0 ? <Tag tone="free">{r.freeCP}</Tag>
                : <Tag tone="bad">{t.nations.taken}</Tag>}
        </>
      ),
    },
    { key: "gdp", title: "PIL mld", render: (r) => bn(r.gdp) },
    { key: "gdpPc", title: "PIL/ab $", render: (r) => nf(r.gdpPc, 0) },
    { key: "pop", title: "Pop. mln", render: (r) => nf(r.pop) },
    { key: "research", title: "Ricerca/m", render: (r) => nf(r.research, 0) },
    {
      key: "trend", title: t.nations.trend, sort: (r) => r.resTrend,
      render: (r) => <Spark data={r.histResearch} />,
    },
    { key: "ip", title: "Investim.", render: (r) => nf(r.ip) },
    { key: "education", title: "Istruz.", render: (r) => nf(r.education) },
    { key: "democracy", title: "Democr.", render: (r) => nf(r.democracy) },
    { key: "cohesion", title: "Coesione", render: (r) => nf(r.cohesion) },
    {
      key: "unrest", title: "Disordini",
      render: (r) => <span className={r.unrest >= 3 ? "text-warn" : ""}>{nf(r.unrest, 2)}</span>,
    },
    { key: "inequality", title: "Disugu.", render: (r) => nf(r.inequality) },
    {
      key: "support", title: "Sostegno",
      render: (r) => <span className={r.support > 0.2 ? "text-good" : ""}>{pct(r.support)}</span>,
    },
    { key: "difficulty", title: "Difficoltà", render: (r) => nf(r.difficulty) },
    { key: "spaceFunding", title: "Fondi sp.", render: (r) => nf(r.spaceFunding, 0) },
    { key: "space", title: "Prog.sp.", sort: (r) => (r.space ? 1 : 0), render: (r) => (r.space ? t.common.yes : t.common.no) },
    { key: "nukes", title: "Atomiche", render: (r) => r.nukes || "—" },
    { key: "miltech", title: "Miltech", render: (r) => nf(r.miltech) },
    ...(showOwners
      ? [{
        key: "owners", title: "Proprietari", align: "left" as const,
        sort: (r: Nation) => r.owners.join(","),
        render: (r: Nation) => (
          <span className="text-dim text-[11.5px]">{r.owners.join(", ") || "—"}</span>
        ),
      }]
      : []),
  ];

  return (
    <Panel title={t.nations.title} sub={`${rows.length} / ${snap.nations.length}`}>
      <div className="flex gap-2.5 flex-wrap items-center mb-3.5">
        <input type="search" placeholder={t.common.search}
          value={q} onChange={(e) => setQ(e.target.value)} className="min-w-[220px]" />
        <select value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
          {(Object.keys(t.nations.scope) as (keyof typeof t.nations.scope)[]).map((k) => (
            <option key={k} value={k}>{t.nations.scope[k]}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-dim text-[12.5px] cursor-pointer">
          <input type="checkbox" checked={showOwners}
            onChange={(e) => setShowOwners(e.target.checked)} className="p-0" />
          {t.nations.showOwners}
          <span className="text-[11px]">({t.nations.ownersWarning})</span>
        </label>
      </div>
      <DataTable rows={rows as unknown as Record<string, unknown>[]}
        columns={columns as unknown as Column<Record<string, unknown>>[]}
        initialSort="gdp" />
    </Panel>
  );
}
