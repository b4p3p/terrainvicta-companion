"use client";

import { useSnapshot } from "@/lib/api";
import { useSettings } from "@/lib/settings";
import { Bars, Empty, Panel, Tag, nf } from "@/components/ui";
import type { Alert } from "@/lib/types";

const TONE = {
  critical: { border: "border-bad", text: "text-bad" },
  warning: { border: "border-warn", text: "text-warn" },
  info: { border: "border-accent", text: "text-accent" },
} as const;

function AlertCard({ a, label }: { a: Alert; label: string }) {
  const tone = TONE[a.severity];
  return (
    <div className={`border-l-[3px] ${tone.border} bg-panel rounded-r px-3 py-2 mb-2`}>
      <div className="flex items-baseline gap-2">
        <span className={`text-[10.5px] uppercase tracking-wide font-bold ${tone.text}`}>
          {label}
        </span>
        <span className="font-semibold text-[13.5px]">{a.title}</span>
      </div>
      <p className="text-dim text-[12.5px] mt-0.5 mb-0">{a.detail}</p>
    </div>
  );
}

export default function Overview() {
  const { t, game, live } = useSettings();
  const { data: snap, error } = useSnapshot(live.version, game);

  if (error) return <Empty>{t.common.error}: {error}</Empty>;
  if (!snap) return <Empty>{t.common.loading}</Empty>;

  const net = snap.flows.net;
  const active = snap.projects.items.filter((p) => p.active);
  const cps = Object.entries(snap.controlPoints.byNation).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <Panel title={t.overview.alerts}
            sub={live.alerts.length ? undefined : t.overview.noAlerts}>
            {live.alerts.length === 0
              ? null
              : live.alerts.map((a) => (
                <AlertCard key={a.id} a={a} label={t.severity[a.severity]} />
              ))}
          </Panel>

          <Panel title={t.overview.flows}
            sub={`${String(snap.flows.month).padStart(2, "0")}/${snap.flows.year}`}>
            <div className="flex flex-col gap-1.5">
              {Object.entries(snap.flows.byCategory).map(([cat, vals]) => (
                <div key={cat} className="flex gap-3 text-[12.5px] items-baseline">
                  <span className="w-52 shrink-0 text-dim truncate">{cat}</span>
                  <span className="flex gap-3 flex-wrap">
                    {Object.entries(vals)
                      .filter(([, v]) => Math.abs(v) > 0.05)
                      .map(([k, v]) => (
                        <span key={k} className={v < 0 ? "text-bad" : "text-good"}>
                          {k} {v > 0 ? "+" : ""}{nf(v)}
                        </span>
                      ))}
                  </span>
                </div>
              ))}
              <div className="border-t border-edge mt-1 pt-2 flex gap-3 text-[12.5px]">
                <span className="w-52 shrink-0 font-semibold">{t.overview.net}</span>
                <span className="flex gap-3 flex-wrap">
                  {Object.entries(net)
                    .filter(([, v]) => Math.abs(v) > 0.05)
                    .map(([k, v]) => (
                      <span key={k} className={v < 0 ? "text-bad font-semibold" : "text-good"}>
                        {k} {v > 0 ? "+" : ""}{nf(v)}
                      </span>
                    ))}
                </span>
              </div>
            </div>
          </Panel>
        </div>

        <div>
          <Panel title={t.overview.projects}>
            {active.length === 0 ? <Empty>{t.common.noData}</Empty> : (
              <div className="flex flex-col gap-2.5">
                {active.map((p) => {
                  const pctDone = p.cost ? (p.accumulated / p.cost) * 100 : 0;
                  return (
                    <div key={p.id}>
                      <div className="flex justify-between text-[12.5px] mb-1">
                        <span>{p.name} <span className="text-dim">slot {p.slot}</span></span>
                        <span className="text-dim">
                          {nf(p.accumulated, 0)}/{p.cost}
                          {p.monthsLeft != null && p.monthsLeft > 0 &&
                            ` · ~${Math.round(p.monthsLeft * 30)} ${t.common.days}`}
                        </span>
                      </div>
                      <div className="h-1.5 bg-panel rounded-full overflow-hidden">
                        <div className="h-full rounded-full"
                          style={{
                            width: `${Math.min(pctDone, 100)}%`,
                            background: pctDone < 1 ? "var(--bad)" : "var(--accent)",
                          }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel title={t.overview.controlPoints}>
            <Bars rows={cps} value={(r) => r[1]} label={(r) => r[0]}
              format={(r) => String(r[1])} highlight={() => true} />
            {snap.cpCapOverage && (
              <p className="text-warn text-[12.5px] mt-3 mb-0">⚠ {t.overview.capOverage}</p>
            )}
          </Panel>

          {snap.alienSites.length > 0 && (
            <Panel title={t.overview.alienSites}>
              <div className="flex flex-col gap-1.5 text-[12.5px]">
                {snap.alienSites.map((s) => (
                  <div key={s.region} className="flex justify-between">
                    <span>{s.region}</span>
                    <Tag tone="warn">{s.since}</Tag>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
