"use client";

import { useEffect, useState, type ReactNode } from "react";
import { api, useApi, useSnapshot } from "@/lib/api";
import { useSettings } from "@/lib/settings";
import { Empty, Panel, Tag, bn, nf, pct } from "@/components/ui";
import type { CatalogueEntry, CpTarget, MissionPlan, MissionTarget } from "@/lib/types";
import { usePersistentState } from "@/lib/persist";
import { ChanceTip, CpTargets } from "@/components/CpTargets";

// colonne ordinabili della tabella per nazione
type NSort = "chance" | "d" | "score" | "unrest" | "cohesion" | "democracy" | "support" | "gdp" | "myCP" | "name";
const NSORTS: NSort[] = ["chance", "d", "score", "unrest", "cohesion", "democracy", "support", "gdp", "myCP", "name"];
const isNSort = (v: unknown): v is { key: NSort; desc: boolean } =>
  !!v && typeof v === "object" && NSORTS.includes((v as { key: NSort }).key);
const nval = (x: MissionTarget, k: NSort): number | string =>
  k === "chance" ? x.game?.chance ?? x.score : k === "d" ? x.game?.d ?? x.score : x[k];

export default function MissionsPage() {
  const { t, game, live } = useSettings();
  const { data: snap } = useSnapshot(live.version, game);
  const { data: cat } = useApi<CatalogueEntry[]>(`/api/missions?lang=${game}`, [live.version, game]);

  const [picked, setPicked] = useState<string | null>(null);
  const [councilor, setCouncilor] = useState<string>("");
  const [plan, setPlan] = useState<MissionPlan | null>(null);
  const [scope, setScope] = useState<"eu" | "all">("all");
  const [nsort, setNsort] = usePersistentState("missions.nation.sort", { key: "chance" as NSort, desc: true }, isNSort);

  // alla prima apertura punta su una missione con bersaglio nazione
  useEffect(() => {
    if (!picked && cat?.length) {
      setPicked((cat.find((c) => c.id === "Coup") ?? cat.find((c) => c.supportsTargeting) ?? cat[0]).id);
    }
  }, [cat, picked]);

  useEffect(() => {
    if (!picked) return;
    const q = `?lang=${game}` + (councilor ? `&councilor=${encodeURIComponent(councilor)}` : "");
    api<MissionPlan>(`/api/missions/${picked}/plan${q}`)
      .then(setPlan)
      .catch(() => setPlan(null));
  }, [picked, councilor, live.version, game]);

  if (!cat || !snap) return <Empty>{t.common.loading}</Empty>;

  const entry = cat.find((c) => c.id === picked);
  const cpMode = plan?.targetKind === "controlPoint";
  const nationTargets = cpMode ? [] : ((plan?.targets ?? []) as MissionTarget[]);
  const targets = nationTargets.filter((x) => scope === "all" || x.eu).sort((a, b) => {
    const va = nval(a, nsort.key), vb = nval(b, nsort.key);
    const c = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
    return nsort.desc ? -c : c;
  });

  const hasGame = !!nationTargets.length && nationTargets.every((x) => x.game);
  const sortTh = (k: NSort, label: ReactNode, title?: string, left = false) => {
    const on = nsort.key === k;
    return (
      <th title={title} style={left ? { textAlign: "left" } : undefined}>
        <button type="button" aria-pressed={on} title={t.missions.sortHint}
          onClick={() => setNsort({ key: k, desc: on ? !nsort.desc : k !== "name" })}
          className={`cursor-pointer ${on ? "text-accent" : "hover:text-ink"}`}>
          {label}{on && <span className="text-[10px]"> {nsort.desc ? "▼" : "▲"}</span>}
        </button>
      </th>
    );
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[300px_1fr] items-start">
      <Panel title={t.missions.catalogue} sub={t.missions.pick} className="mb-0">
        <div className="flex flex-col gap-0.5 max-h-[72vh] overflow-auto -mx-1 px-1">
          {cat.map((m) => (
            <button key={m.id} onClick={() => setPicked(m.id)}
              className={`text-left px-2.5 py-1.5 rounded text-[12.5px] cursor-pointer transition-colors
                ${picked === m.id ? "bg-accent/12 text-accent" : "hover:bg-panel"}`}>
              <div className="flex justify-between items-baseline gap-2">
                <span>{m.name}</span>
                {m.attributeShort && (
                  <span className="text-[10.5px] text-dim shrink-0">{m.attributeShort}</span>
                )}
              </div>
              {!m.supportsTargeting && (
                <span className="text-[10.5px] text-dim">{m.target}</span>
              )}
            </button>
          ))}
        </div>
      </Panel>

      <div>
        {entry && (
          <Panel title={entry.name} className="mb-5"
            right={
              <div className="flex gap-2 items-center text-[12px]">
                {plan?.candidates && plan.candidates.length > 1 && (
                  <select value={councilor} onChange={(e) => setCouncilor(e.target.value)}>
                    <option value="">{t.missions.councilor}: auto</option>
                    {plan.candidates.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}
                <select value={scope} onChange={(e) => setScope(e.target.value as "eu" | "all")}>
                  <option value="all">{t.common.world}</option>
                  <option value="eu">{t.common.europe}</option>
                </select>
              </div>
            }>
            <div className="flex gap-6 flex-wrap text-[12.5px] mb-3">
              <span>
                <span className="text-dim">{t.missions.attribute}: </span>
                <b>{entry.attributeShort ?? "—"}</b>
                {plan?.councilorValue != null && (
                  <span className="text-good"> {plan.councilor} = {plan.councilorValue}</span>
                )}
              </span>
              <span>
                <span className="text-dim">{t.missions.cost}: </span>
                {entry.cost
                  ? `${entry.cost.value ?? "~"} ${entry.cost.resourceName}${entry.cost.value == null ? ` (${t.missions.scales})` : ""}`
                  : "—"}
              </span>
              <span>
                <span className="text-dim">{t.missions.whoDoesIt}: </span>
                {entry.holders.join(", ") || "—"}
              </span>
              <span className="text-dim">+{entry.xp} XP</span>
            </div>

            {plan && (
              <div className="grid gap-3 md:grid-cols-2 text-[12px]">
                <div>
                  <div className="text-dim mb-1">{t.missions.factorsReadable}</div>
                  <div className="flex gap-1.5 flex-wrap">
                    {plan.factors.readable.map((f, i) => (
                      <Tag key={i} tone={f.side === "attacco" ? "mine" : "bad"}>
                        {f.label}
                      </Tag>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-dim mb-1">{t.missions.factorsOpaque}</div>
                  <div className="flex gap-1.5 flex-wrap">
                    {plan.factors.opaque.map((f, i) => <Tag key={i}>{f.label}</Tag>)}
                  </div>
                </div>
              </div>
            )}
          </Panel>
        )}

        <Panel title={t.missions.targets} sub={cpMode ? t.missions.cpFactorsHint : t.missions.factorsHint}>
          {!plan ? <Empty>{t.common.loading}</Empty>
            : plan.targets === null ? <Empty>{t.missions.noTargeting}</Empty>
              : cpMode ? <CpTargets targets={plan.targets as CpTarget[]} scope={scope} />
              : (
                <div className="overflow-auto max-h-[62vh]">
                  <table className="data">
                    <thead>
                      <tr>
                        {sortTh("name", t.common.nation)}
                        {hasGame ? <>
                          {sortTh("chance", t.missions.chance, t.missions.chanceHint)}
                          {sortTh("d", t.missions.attDef, t.missions.attDefHint)}
                        </> : sortTh("score", t.missions.score)}
                        {sortTh("unrest", t.missions.unrest)}
                        {sortTh("cohesion", t.missions.cohesion)}
                        {sortTh("democracy", t.missions.democracy)}
                        {sortTh("support", t.missions.support)}
                        {sortTh("gdp", t.common.gdpBn)}
                        {sortTh("myCP", t.missions.mine)}
                        <th style={{ textAlign: "left" }}>{t.common.owners}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {targets.map((x) => (
                        <tr key={x.id ?? x.name}>
                          <td>
                            {x.name}{" "}
                            {x.myCP === x.cp && <Tag tone="mine">{x.myCP}/{x.cp}</Tag>}
                            {x.myCP > 0 && x.myCP < x.cp && <Tag tone="warn">{x.myCP}/{x.cp}</Tag>}
                          </td>
                          {x.game ? <>
                            <td className={x.game.chance >= 0.6 ? "text-good font-semibold"
                              : x.game.chance < 0.2 ? "text-dim" : ""}>
                              <ChanceTip g={x.game} note={x.game.exact ? undefined : t.missions.chanceUnknown}>
                                {!x.game.exact && "≤ "}{nf(x.game.chance * 100, 0)}%
                              </ChanceTip>
                            </td>
                            <td className="text-dim">
                              <ChanceTip g={x.game} note={x.game.exact ? undefined : t.missions.chanceUnknown}>
                                {nf(x.game.attack, 1)} / {nf(x.game.defense, 1)}{!x.game.exact && " +?"}
                              </ChanceTip>
                            </td>
                          </> : <td className={x.score > 0.5 ? "text-good font-semibold"
                            : x.score < 0 ? "text-dim" : ""}>{nf(x.score, 2)}</td>}
                          <td className={x.unrest >= 3 ? "text-good" : x.unrest === 0 ? "text-dim" : ""}>
                            {nf(x.unrest, 2)}
                          </td>
                          <td>{nf(x.cohesion)}</td>
                          <td>{nf(x.democracy)}</td>
                          <td className={x.support > 0.2 ? "text-good" : ""}>{pct(x.support)}</td>
                          <td>{bn(x.gdp)}</td>
                          <td>{x.myCP || "—"}</td>
                          <td style={{ textAlign: "left" }} className="text-dim text-[11.5px]">
                            {x.owners.join(", ") || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
        </Panel>
      </div>
    </div>
  );
}
