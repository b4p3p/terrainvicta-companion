"use client";

import Link from "next/link";
import { useSnapshot } from "@/lib/api";
import { useSettings } from "@/lib/settings";
import { Empty, Panel, Tag } from "@/components/ui";
import { ATTRS, type Attr, type Councilor, type Org } from "@/lib/types";

const SHORT: Record<Attr, string> = {
  Persuasion: "PER", Investigation: "IND", Espionage: "SPI", Command: "CMD",
  Administration: "AMM", Science: "SCI", Security: "SIC",
};

function AttrRow({ c }: { c: Councilor }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {ATTRS.map((a) => {
        const v = c.attributes[a] ?? 0;
        const base = c.base[a] ?? 0;
        const bonus = v - base;
        const strong = v >= 7;
        return (
          <span key={a}
            title={bonus ? `base ${base} + ${bonus} da organizzazioni` : `base ${base}`}
            className={`px-1.5 py-0.5 rounded text-[11.5px] tabular-nums
              ${strong ? "bg-mine/15 text-mine" : v <= 2 ? "bg-panel2 text-dim" : "bg-panel2"}`}>
            {SHORT[a]} <b>{v}</b>
            {bonus > 0 && <sup className="text-accent">+{bonus}</sup>}
          </span>
        );
      })}
    </div>
  );
}

function OrgLine({ o }: { o: Org }) {
  const bits: string[] = [];
  for (const [k, v] of Object.entries(o.income)) if (v) bits.push(`${v > 0 ? "+" : ""}${v} ${k}`);
  for (const [k, v] of Object.entries(o.attributes)) if (v) bits.push(`+${v} ${SHORT[k as Attr]}`);
  if (o.projectSlots) bits.push(`+${o.projectSlots} slot`);
  return (
    <div className="text-[12px]">
      <span className="text-text">{o.name}</span>{" "}
      <span className="text-dim">{bits.join(", ") || "—"}</span>
    </div>
  );
}

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
              className={`rounded-md px-3 py-2 border ${c.weak ? "border-bad/40" : "border-line"} bg-panel2`}>
              <div className="flex justify-between items-baseline">
                <span className="font-semibold">{c.short}</span>
                <span className={`text-[18px] font-semibold ${c.weak ? "text-bad" : "text-accent"}`}>
                  {c.max}
                </span>
              </div>
              <div className="h-1 bg-line rounded-full my-1.5 overflow-hidden">
                <div className="h-full rounded-full"
                  style={{
                    width: `${(c.max / maxTotal) * 100}%`,
                    background: c.weak ? "var(--bad)" : "var(--accent)",
                  }} />
              </div>
              <div className="text-[11.5px] text-dim">
                {c.weak ? t.council.weak : `${t.council.best}: ${c.best?.name ?? "—"}`}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title={t.council.team}>
        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {team.map((c) => (
            <div key={c.id} className="bg-panel2 border border-line rounded-lg p-3">
              <div className="flex justify-between items-baseline gap-2">
                <div>
                  <span className="font-semibold text-[14px]">{c.name}</span>
                  <span className="text-dim text-[12px] ml-2">{c.typeName}</span>
                </div>
                <Tag tone={(c.apparentLoyalty ?? 9) <= 6 ? "bad" : "dim"}>
                  {t.council.loyaltyApparent} {c.apparentLoyalty ?? "?"}
                </Tag>
              </div>

              <div className="my-2"><AttrRow c={c} /></div>

              <dl className="text-[12px] grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-dim">
                <dt>{t.council.location}</dt><dd className="text-text">{c.location ?? "—"}</dd>
                <dt>{t.council.nationality}</dt><dd className="text-text">{c.nationality ?? "—"}</dd>
                <dt>XP</dt><dd className="text-text">{c.xp}</dd>
                <dt>{t.council.lastMission}</dt><dd className="text-text">{c.priorMission ?? "—"}</dd>
              </dl>

              <div className="mt-2 text-[12px]">
                <div className="text-dim mb-0.5">{t.council.traits}</div>
                <div className="flex gap-1 flex-wrap">
                  {c.traits.map((tr) => <Tag key={tr.id}>{tr.name}</Tag>)}
                </div>
              </div>

              <div className="mt-2">
                <div className="text-dim text-[12px] mb-0.5">{t.council.orgs}</div>
                {c.orgs.length === 0
                  ? <div className="text-dim text-[12px]">{t.council.noOrgs}</div>
                  : c.orgs.map((o) => <OrgLine key={o.id} o={o} />)}
              </div>

              <div className="mt-2 text-[11.5px] text-dim">
                {c.missions.length} {t.council.missionsKnown}
              </div>
            </div>
          ))}

          <Link href="/recruits"
            className="bg-panel2 border border-line border-dashed rounded-lg p-3
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
                <span className="text-mine ml-1">
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
              <div key={m.id} className="bg-panel2 border border-line rounded-md px-3 py-2">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-semibold text-[13.5px]">{m.name}</span>
                  {m.attributeShort && <Tag tone="warn">{m.attributeShort}</Tag>}
                  {m.cost?.resource && (
                    <span className="text-dim text-[12px]">
                      {m.cost.value ?? "~"} {m.cost.resource}
                    </span>
                  )}
                </div>
                <div className="text-[12px] text-dim mt-1">
                  {m.providers?.councilorTypes.length ? (
                    <>
                      {t.council.viaTypes}:{" "}
                      <span className="text-text">
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
            for (const [k, v] of Object.entries(o.attributes)) if (v) bits.push(`+${v} ${SHORT[k as Attr]}`);
            if (o.projectSlots) bits.push(`+${o.projectSlots} slot`);
            const cost = Object.entries(o.cost).filter(([, v]) => v)
              .map(([k, v]) => `${v} ${k}`).join(" + ");
            return (
              <div key={o.id}
                className={`bg-panel2 border rounded-lg p-3 ${o.affordable ? "border-mine/40" : "border-line"}`}>
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
                    ? <span className="text-mine">{o.eligible.join(", ")}</span>
                    : <span className="text-bad">{t.council.nobody}</span>}
                </div>
                {o.missionsGranted.length > 0 && (
                  <div className="text-[11.5px] text-accent mt-1">
                    + {o.missionsGranted.length} missioni
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
