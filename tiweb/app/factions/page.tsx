"use client";

import type { ReactNode } from "react";
import { useApi } from "@/lib/api";
import { useSettings } from "@/lib/settings";
import { Empty, Panel, ResourceIcon, Tag, nf } from "@/components/ui";
import { Guide } from "@/components/Guide";

type Field = "resources" | "unassignedOrgs" | "objectives" | "projects";
interface Gate { need: number; measure: "intel" | "highest" }

interface Faction {
  id: number;
  name: string;
  template: string;
  colors: { accent?: string } | null;
  mine: boolean;
  intel: number;
  highest: number;
  locked: Partial<Record<Field, Gate>>;
  resources?: { id: string; name: string; icon: string | null; stock: number; monthly: number }[];
  unassignedOrgs?: number;
  objectives?: { id: string; status: "Unlocked" | "Completed"; name: string }[];
  projects?: {
    finished: number;
    current: { name: string; accumulated: number; cost: number | null }[];
  };
}

interface Compare {
  gates: Record<Field, Gate>;
  factions: Faction[];
}

/** Cella chiusa: dire che non si sa, e quanto manca, è informazione anch'esso. */
function Locked({ f, gate }: { f: Faction; gate: Gate }) {
  const { t } = useSettings();
  const have = gate.measure === "highest" ? f.highest : f.intel;
  return (
    <span className="text-faint text-[11.5px]" title={t.factions.lockedHint}>
      {t.factions.locked} · {nf(have, 2)}/{nf(gate.need, 2)}
    </span>
  );
}

function Row({ label, factions, field, render }: {
  label: ReactNode; factions: Faction[]; field: Field;
  render: (f: Faction) => ReactNode;
}) {
  return (
    <tr className="border-t border-edge align-top">
      <th className="text-left font-normal text-dim py-1.5 pr-3 whitespace-nowrap">{label}</th>
      {factions.map((f) => (
        <td key={f.id} className={`py-1.5 px-3 ${f.mine ? "bg-sel/40" : ""}`}>
          {f.locked[field] ? <Locked f={f} gate={f.locked[field]!} /> : render(f)}
        </td>
      ))}
    </tr>
  );
}

export default function FactionsPage() {
  const { t, game, live } = useSettings();
  const { data, error } = useApi<Compare>(`/api/factions?lang=${game}`, [live.version, game]);
  if (error) return <Empty>{error}</Empty>;
  if (!data) return <Empty>{t.common.loading}</Empty>;
  const fs = data.factions;
  const resIds = fs.find((f) => f.resources)?.resources?.map((r) => r) ?? [];

  return (
    <Panel title={t.factions.title}
      right={
        <Guide title={t.factions.title} label={t.presets.guide}>
          <p>{t.factions.guideIntro}</p>
          <h4>{t.factions.guideGatesTitle}</h4>
          <p>{t.factions.guideGates}</p>
          <ul className="mb-3 list-disc pl-5">
            {(Object.keys(data.gates) as Field[]).map((k) => (
              <li key={k}>
                {t.factions.fields[k]}: {nf(data.gates[k].need, 2)} ·{" "}
                {data.gates[k].measure === "highest" ? t.factions.measureHighest : t.factions.measureNow}
              </li>
            ))}
          </ul>
          <h4>{t.factions.guideIncomeTitle}</h4>
          <p>{t.factions.guideIncome}</p>
        </Guide>
      }>
      <p className="text-faint text-[11.5px] mb-3">{t.factions.sub}</p>
      <div className="overflow-x-auto">
        <table className="text-[12px] w-full border-collapse">
          <thead>
            <tr>
              <th />
              {fs.map((f) => (
                <th key={f.id} className={`text-left px-3 pb-2 font-normal ${f.mine ? "bg-sel/40" : ""}`}>
                  <div className="display text-[13px] uppercase tracking-[.04em] border-l-2 pl-2"
                    style={{ borderColor: f.colors?.accent ?? "var(--edge-lit)" }}>
                    {f.name}
                  </div>
                  <div className="text-faint text-[11px] pl-2.5 mt-0.5">
                    {f.mine ? <Tag tone="mine">{t.factions.you}</Tag> : (
                      <span title={t.factions.intelHint}>
                        intel {nf(f.intel, 2)}
                        {f.highest > f.intel + 1e-6 && <> · max {nf(f.highest, 2)}</>}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {resIds.map((r) => (
              <Row key={r.id} field="resources" factions={fs}
                label={<span className="inline-flex items-center gap-1.5">
                  <ResourceIcon icon={r.icon} size={14} />{r.name}
                </span>}
                render={(f) => {
                  const x = f.resources?.find((y) => y.id === r.id);
                  if (!x) return null;
                  return (
                    <span className="whitespace-nowrap">
                      {/* la ricerca non si accumula: la scorta sarebbe sempre 0 */}
                      {x.id !== "Research" && nf(x.stock, 0)}
                      <span className={`ml-1.5 text-[11px] ${x.monthly > 0 ? "text-good" : "text-faint"}`}>
                        {x.monthly > 0 ? "+" : ""}{nf(x.monthly, 1)}/{t.common.month}
                      </span>
                    </span>
                  );
                }} />
            ))}
            <Row field="unassignedOrgs" factions={fs} label={t.factions.fields.unassignedOrgs}
              render={(f) => f.unassignedOrgs ?? 0} />
            <Row field="objectives" factions={fs} label={t.factions.fields.objectives}
              render={(f) => (
                <div className="text-[11.5px]">
                  <div className="text-faint mb-0.5">
                    {t.factions.finished}: {f.objectives!.filter((o) => o.status === "Completed").length}
                  </div>
                  <ul className="space-y-0.5">
                    {f.objectives!.filter((o) => o.status === "Unlocked").map((o) => (
                      <li key={o.id} className="text-dim">{o.name}</li>
                    ))}
                  </ul>
                </div>
              )} />
            <Row field="projects" factions={fs} label={t.factions.fields.projects}
              render={(f) => (
                <div className="text-[11.5px]">
                  <div className="text-dim mb-0.5">{t.factions.finished}: {f.projects!.finished}</div>
                  {f.projects!.current.map((p) => (
                    <div key={p.name} className="flex justify-between gap-2">
                      <span className="truncate">{p.name}</span>
                      <span className="text-faint whitespace-nowrap">
                        {nf(p.accumulated, 0)}{p.cost ? `/${nf(p.cost, 0)}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )} />
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
