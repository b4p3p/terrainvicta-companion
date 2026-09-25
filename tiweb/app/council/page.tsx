"use client";

import Link from "next/link";
import { useSnapshot } from "@/lib/api";
import { useSettings } from "@/lib/settings";
import { AttrIcon, Empty, MissionIcon, Panel, ResourceIcon, Tag } from "@/components/ui";
import { CouncilorCard, short } from "@/components/CouncilorCard";
import type { Councilor } from "@/lib/types";

export default function CouncilPage() {
  const { t, game, live } = useSettings();
  const { data: snap, error } = useSnapshot(live.version, game);

  if (error) return <Empty>{t.common.error}: {error}</Empty>;
  if (!snap) return <Empty>{t.common.loading}</Empty>;

  const { team, coverage, missions } = snap.council;
  const maxTotal = Math.max(...coverage.map((c) => c.max), 1);
  // il candidato che copre piu' missioni scoperte, come anteprima sulla card
  const bestCover = snap.recruits.reduce<Councilor | null>(
    (best, c) => ((c.covers?.length ?? 0) > (best?.covers?.length ?? 0) ? c : best), null);

  return (
    <>
      <Panel title={t.council.coverage} sub={t.council.coverageHint}>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {coverage.map((c) => (
            <div key={c.attribute}
              className={`px-3 py-2 border ${c.weak ? "border-bad/40" : "border-edge"} bg-panel ${
                c.used ? "" : "opacity-55"}`}>
              <div className="flex justify-between items-baseline">
                <span className="font-semibold flex items-center gap-1.5">
                  <AttrIcon attr={c.attribute} size={16} title={c.short} />
                  {c.short}
                </span>
                <span className={`text-[18px] font-semibold ${
                  c.weak ? "text-bad" : c.used ? "text-accent" : "text-dim"}`}>
                  {c.max}
                </span>
              </div>
              <div className="h-1 bg-edge my-1.5 overflow-hidden">
                <div className="h-full rounded-full"
                  style={{
                    width: `${(c.max / maxTotal) * 100}%`,
                    background: c.weak ? "var(--bad)" : c.used ? "var(--accent)" : "var(--ink-faint)",
                  }} />
              </div>
              <div className="text-[11.5px] text-dim">
                {c.weak ? t.council.weak : `${t.council.best}: ${c.best?.name ?? "—"}`}
              </div>
              <div className="text-[11px] text-faint mt-0.5" title={t.council.useHint}>
                {c.used
                  ? t.council.use.replace("{a}", String(c.attack)).replace("{d}", String(c.defense))
                  : t.council.unused}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title={t.council.team}>
        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {team.map((c) => (
            <CouncilorCard key={c.id} c={c} variant="council" />
          ))}

          <Link href="/recruits"
            className="bg-panel border border-edge border-dashed rounded-lg p-3
                       flex flex-col justify-center items-start gap-1
                       hover:border-accent hover:bg-accent/5 transition-colors">
            <span className="font-semibold text-[14px] text-accent">
              {t.council.recruitCard}
            </span>
            <span className="text-dim text-[12px]">
              {snap.recruits.length} {t.council.recruitCardHint}
            </span>
            {bestCover && (
              <span className="text-[12px]">
                <span className="text-dim">{t.council.recruitBestCoverage}:</span>{" "}
                {bestCover.name}
                <span className="text-good ml-1">
                  {bestCover.covers?.length}/{missions.missing.length}
                </span>
              </span>
            )}
            <span className="text-accent text-[12px] mt-1">{t.council.recruitOpen} →</span>
          </Link>
        </div>
      </Panel>

      <Panel title={t.council.missing} sub={t.council.missingHint}>
        {missions.missing.length === 0 ? (
          <Empty>—</Empty>
        ) : (
          <div className="flex flex-col gap-2">
            {missions.missing.map((m) => (
              <div key={m.id} className="bg-panel border border-edge rounded-md px-3 py-2">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <MissionIcon icon={m.icon} size={20} title={m.name} />
                  <span className="font-semibold text-[13.5px]">{m.name}</span>
                  {m.attributeShort && <Tag tone="warn">{m.attributeShort}</Tag>}
                  {m.cost?.resource && (
                    <span className="text-dim text-[12px] inline-flex items-center gap-1">
                      <ResourceIcon icon={m.cost.icon} size={13}
                        title={m.cost.resourceName} />
                      {m.cost.value ?? "~"} {m.cost.resourceName}
                    </span>
                  )}
                </div>
                <div className="text-[12px] text-dim mt-1">
                  {m.providers?.councilorTypes.length ? (
                    <>
                      {t.council.viaTypes}:{" "}
                      <span className="text-ink">
                        {m.providers.councilorTypes.map((x) => x.name).join(", ")}
                      </span>
                    </>
                  ) : null}
                  {m.providers?.orgCount ? (
                    <> · {m.providers.orgCount} {t.council.viaOrgs}</>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title={t.council.market}>
        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {snap.orgMarket.map((o) => {
            const bits: string[] = [];
            for (const [k, v] of Object.entries(o.income)) if (v) bits.push(`${v > 0 ? "+" : ""}${v} ${k}`);
            for (const [k, v] of Object.entries(o.attributes)) if (v) bits.push(`+${v} ${short(k)}`);
            if (o.projectSlots) bits.push(`+${o.projectSlots} slot`);
            const cost = Object.entries(o.cost).filter(([, v]) => v)
              .map(([k, v]) => `${v} ${k}`).join(" + ");
            return (
              <div key={o.id}
                className={`bg-panel border rounded-lg p-3 ${o.affordable ? "border-good/40" : "border-edge"}`}>
                <div className="flex justify-between items-baseline gap-2">
                  <span className="font-semibold text-[13.5px]">{o.name}</span>
                  <Tag tone={o.affordable ? "mine" : "dim"}>
                    {o.affordable ? t.council.affordable : t.council.notAffordable}
                  </Tag>
                </div>
                <div className="text-[12px] text-dim mt-1">
                  {cost || "—"}
                  {o.paybackMonths != null && ` · ${t.council.payback} ~${o.paybackMonths} ${t.common.month}`}
                </div>
                <div className="text-[12px] mt-1">{bits.join(", ") || "—"}</div>
                <div className="text-[11.5px] mt-1.5">
                  <span className="text-dim">{t.council.canHold}: </span>
                  {o.eligible && o.eligible.length
                    ? <span className="text-good">{o.eligible.join(", ")}</span>
                    : <span className="text-bad">{t.council.nobody}</span>}
                </div>
                {o.missionsGranted.length > 0 && (
                  <div className="text-[11.5px] text-accent mt-1">
                    {t.council.moreMissions.replace("{n}", String(o.missionsGranted.length))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Panel>

    </>
  );
}
