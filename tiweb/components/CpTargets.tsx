"use client";

import { useMemo, type ReactNode } from "react";
import { usePersistentState } from "@/lib/persist";
import { useSettings } from "@/lib/settings";
import { Tag, bn, nf, pct } from "@/components/ui";
import { Tip, TipRow } from "@/components/Tip";
import type { CpTarget, FactionRelation, GameChance } from "@/lib/types";

type SortKey = "chance" | "d" | "nation" | "owner" | "mySupport" | "ownerSupport" | "gdp" | "difficulty";
const KEYS: SortKey[] = ["chance", "d", "nation", "owner", "mySupport", "ownerSupport", "gdp", "difficulty"];
const isSort = (v: unknown): v is { key: SortKey; desc: boolean } =>
  !!v && typeof v === "object" && KEYS.includes((v as { key: SortKey }).key);

const value = (x: CpTarget, k: SortKey): number | string => {
  switch (k) {
    case "chance": return x.game.chance;
    case "d": return x.game.d;
    case "nation": return x.nation;
    case "owner": return x.owner.name;
    default: return x[k];
  }
};

/** Atteggiamento come nella schermata Intelligence: il colore ripete la parola. */
export function Attitude({ r, compact }: { r: FactionRelation; compact?: boolean }) {
  const { t } = useSettings();
  const tone = (id: string) => id === "war" ? "text-bad" : id === "conflict" ? "text-warn" : "text-dim";
  return (
    <Tip title={t.relations.title} content={
      <>
        <TipRow label={t.relations.theirs} value={<span className={tone(r.theirs.id)}>{r.theirs.label}</span>} />
        <TipRow label={t.relations.mine} value={<span className={tone(r.mine.id)}>{r.mine.label}</span>} />
        {r.treaties.map((x) => <TipRow key={x.id} label={t.relations.treaty} value={x.label} />)}
        <p className="text-faint mt-2 mb-0">{t.relations.hint}</p>
      </>
    }>
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <span className={tone(r.theirs.id)}>{r.theirs.label}</span>
        {!compact && r.mine.id !== r.theirs.id && (
          <span className="text-faint">/ <span className={tone(r.mine.id)}>{r.mine.label}</span></span>
        )}
        {r.treaties.map((x) => <Tag key={x.id} tone="free">{x.label}</Tag>)}
      </span>
    </Tip>
  );
}

/** Voce per voce la stessa somma del gioco; i fattori che non vedi restano «?». */
export function ChanceTip({ g, children, note }: { g: GameChance; children: ReactNode; note?: string }) {
  const { t } = useSettings();
  return (
    <Tip title={t.missions.chance} content={
      <>
        {g.parts.map((p, i) => (
          <TipRow key={i} label={<>{p.side === "attacco" ? "+" : "−"} {p.label}</>}
            value={p.known ? nf(p.value, 1) : "?"} />
        ))}
        <TipRow strong label={`${nf(g.attack, 1)} − ${nf(g.defense, 1)}`} value={nf(g.d, 1)} />
        {!g.exact && <p className="text-faint mt-2 mb-0">{note ?? t.missions.cpChanceApprox}</p>}
      </>
    }>
      {children}
    </Tip>
  );
}

export function CpTargets({ targets, scope }: { targets: CpTarget[]; scope: "eu" | "all" }) {
  const { t } = useSettings();
  const [sort, setSort] = usePersistentState("missions.cp.sort", { key: "chance" as SortKey, desc: true }, isSort);
  const [only, setOnly] = usePersistentState<string>("missions.cp.owner", "",
    (v): v is string => typeof v === "string");

  const owners = useMemo(() => [...new Map(targets.map((x) => [x.owner.name, x.owner])).values()]
    .sort((a, b) => a.name.localeCompare(b.name)), [targets]);
  const rows = useMemo(() => {
    const r = targets.filter((x) => (scope === "all" || x.eu) && (!only || x.owner.name === only));
    return r.sort((a, b) => {
      const va = value(a, sort.key), vb = value(b, sort.key);
      const c = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return sort.desc ? -c : c;
    });
  }, [targets, scope, only, sort]);

  const th = (k: SortKey, label: ReactNode, left = false) => {
    const on = sort.key === k;
    return (
      <th style={left ? { textAlign: "left" } : undefined}>
        <button type="button" aria-pressed={on} title={t.missions.sortHint}
          onClick={() => setSort({ key: k, desc: on ? !sort.desc : typeof value(targets[0], k) !== "string" })}
          className={`cursor-pointer ${on ? "text-accent" : "hover:text-ink"}`}>
          {label}{on && <span className="text-[10px]"> {sort.desc ? "▼" : "▲"}</span>}
        </button>
      </th>
    );
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-2 text-[12px]">
        <span className="text-dim">{t.missions.cpOwnerFilter}</span>
        <select value={only} onChange={(e) => setOnly(e.target.value)}>
          <option value="">{t.missions.cpAllOwners}</option>
          {owners.map((o) => (
            <option key={o.id} value={o.name}>{o.name} · {o.relation.theirs.label}</option>
          ))}
        </select>
        <span className="text-faint">{rows.length} / {targets.length}</span>
      </div>
      <div className="overflow-auto max-h-[62vh]">
        <table className="data">
          <thead>
            <tr>
              {th("nation", t.missions.cpTarget, true)}
              {th("owner", t.missions.cpOwner, true)}
              <th style={{ textAlign: "left" }}>{t.relations.title}</th>
              {th("chance", t.missions.chance)}
              {th("d", t.missions.attDef)}
              {th("mySupport", t.missions.support)}
              {th("ownerSupport", t.missions.cpOwnerSupport)}
              {th("difficulty", t.missions.cpDifficulty)}
              {th("gdp", t.common.gdpBn)}
              <th>{t.missions.mine}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.id}>
                <td style={{ textAlign: "left" }}>
                  {x.cpName}{" "}
                  {x.defended && <Tag tone="bad">{t.missions.cpDefended}</Tag>}{" "}
                  {x.disabled && <Tip content={t.missions.cpDisabledHint}><Tag>{t.missions.cpDisabled}</Tag></Tip>}
                </td>
                <td style={{ textAlign: "left" }}>
                  <span className="border-l-2 pl-1.5 whitespace-nowrap"
                    style={{ borderColor: x.owner.colors?.accent ?? "var(--edge-lit)" }}>{x.owner.name}</span>
                </td>
                <td style={{ textAlign: "left" }}><Attitude r={x.owner.relation} compact /></td>
                <td className={x.game.chance >= 0.6 ? "text-good font-semibold" : x.game.chance < 0.2 ? "text-dim" : ""}>
                  <ChanceTip g={x.game}>≈ {nf(x.game.chance * 100, 0)}%</ChanceTip>
                </td>
                <td className="text-dim">
                  <ChanceTip g={x.game}>{nf(x.game.attack, 1)} / {nf(x.game.defense, 1)}</ChanceTip>
                </td>
                <td className={x.mySupport > 0.2 ? "text-good" : ""}>{pct(x.mySupport)}</td>
                <td className={x.ownerSupport > 0.2 ? "text-bad" : ""}>{pct(x.ownerSupport)}</td>
                <td>{nf(x.difficulty, 1)}</td>
                <td>{bn(x.gdp)}</td>
                <td>{x.myCP ? `${x.myCP}/${x.cp}` : "—"}{x.mySecurity && <> <Tag tone="mine">{t.missions.cpSecurity}</Tag></>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
