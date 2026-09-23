"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useSnapshot } from "@/lib/api";
import { useSettings } from "@/lib/settings";
import { AttrIcon, Empty, MissionIcon, Panel, Tag, nf } from "@/components/ui";
import type { Dict } from "@/lib/i18n";
import {
  ATTRS, type Attr, type Councilor, type Coverage, type Income, type TraitEffect,
} from "@/lib/types";

const SHORT: Record<Attr, string> = {
  Persuasion: "PER", Investigation: "IND", Espionage: "SPI", Command: "CMD",
  Administration: "AMM", Science: "SCI", Security: "SIC",
};

type ResLabel = "resMoney" | "resInfluence" | "resResearch" | "resOps" | "resBoost";

const RES: { key: keyof Omit<Income, "fromTraits">; label: ResLabel; tone: string }[] = [
  { key: "money", label: "resMoney", tone: "text-warn" },
  { key: "influence", label: "resInfluence", tone: "text-accent" },
  { key: "research", label: "resResearch", tone: "text-good" },
  { key: "ops", label: "resOps", tone: "text-other" },
  { key: "boost", label: "resBoost", tone: "text-dim" },
];

const RES_LABEL = Object.fromEntries(RES.map((r) => [r.key, r.label])) as
  Record<string, ResLabel>;

const MAX_COMPARE = 3;

/** Somma grezza del reddito, solo per ordinare: risorse diverse non sono
 *  commensurabili, quindi non viene mai mostrata come punteggio. */
function incomeWeight(i: Income) {
  return i.money + i.influence + i.research + i.ops + i.boost;
}

const signed = (v: number) => `${v > 0 ? "+" : ""}${nf(v, 0)}`;

function IncomeLine({ income }: { income: Income }) {
  const { t } = useSettings();
  const parts = RES.filter((r) => income[r.key] !== 0);
  if (parts.length === 0) return <span className="text-dim">—</span>;
  return (
    <span className="flex gap-2 flex-wrap">
      {parts.map((r) => {
        const v = income[r.key];
        return (
          <span key={r.key} className={v < 0 ? "text-bad" : r.tone}>
            {signed(v)} {t.recruit[r.label]}
          </span>
        );
      })}
    </span>
  );
}

/** Un effetto del tratto in parole, col suo colore: verde aiuta, rosso costa. */
function describe(e: TraitEffect, t: Dict): { text: string; tone: "good" | "bad" | "dim";
  conditional?: boolean } {
  const r = t.recruit;
  const byValue = (v: number): "good" | "bad" | "dim" => (v > 0 ? "good" : v < 0 ? "bad" : "dim");
  switch (e.kind) {
    case "stat":
      return { text: `${signed(e.value)} ${SHORT[e.stat] ?? e.stat}`,
        tone: byValue(e.value), conditional: e.conditional };
    case "statFixed":
      return { text: `${e.stat} = ${e.value}`, tone: "dim", conditional: e.conditional };
    case "loyalty":
      return { text: `${signed(e.value)} ${r.fxLoyalty}`, tone: byValue(e.value),
        conditional: e.conditional };
    case "apparentLoyalty":
      return { text: `${signed(e.value)} ${r.fxApparentLoyalty}`, tone: "dim",
        conditional: e.conditional };
    case "transparent":
      return { text: r.fxTransparent, tone: "good" };
    case "income":
      return { text: `${signed(e.value)} ${r[RES_LABEL[e.resource]]}`, tone: byValue(e.value) };
    case "xp":
      // negativo = l'esperienza costa meno, quindi e' un vantaggio
      return { text: `${r.fxXp} ${signed(e.value * 100)}%`, tone: byValue(-e.value) };
    case "mission":
      return { text: `${r.fxGrants} ${e.name}`, tone: "good" };
    case "restricted":
      return { text: `${r.fxRestricted} ${e.name}`, tone: "bad" };
    case "rule":
      return r.rules[e.rule]
        ? { text: r.rules[e.rule], tone: "bad" }
        : { text: `${r.fxRule}: ${e.rule}`, tone: "dim" };
  }
}

const TONE = { good: "text-good", bad: "text-bad", dim: "text-dim" } as const;

function Traits({ c }: { c: Councilor }) {
  const { t } = useSettings();
  return (
    // flex-wrap: ogni tratto e' un blocco coi suoi effetti, e i blocchi vanno a capo
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {c.traits.map((tr) => {
        const fx = (tr.effects ?? []).map((e) => describe(e, t));
        return (
          <div key={tr.id} className="flex flex-wrap items-baseline gap-x-1.5">
            <Tag>{tr.name}</Tag>
            {fx.map((f, i) => (
              <span key={i} className={`text-[11.5px] ${TONE[f.tone]}`}
                title={f.conditional ? t.recruit.conditional : undefined}>
                {f.text}{f.conditional && "*"}{i < fx.length - 1 ? "," : ""}
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function Candidate({ c, sortAttr, picked, canPick, onPick }: {
  c: Councilor; sortAttr: Attr | null; picked: boolean; canPick: boolean;
  onPick: () => void;
}) {
  const { t } = useSettings();
  const gain = c.gain ?? {};
  const weak = c.fixesWeak ?? [];
  const depth = c.depth ?? {};
  const missions = c.missionList ?? [];
  const fresh = missions.filter((m) => m.new).length;
  const depthAttrs = ATTRS.filter((a) => depth[a]);

  return (
    <div className={`bg-panel border rounded-lg p-3 ${picked ? "border-accent" : "border-edge"}`}>
      <div className="flex justify-between items-baseline gap-2">
        <div>
          <span className="font-semibold text-[14px]">{c.name}</span>
          <span className="text-dim text-[12px] ml-2">{c.typeName}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Tag tone={(c.apparentLoyalty ?? 9) <= 6 ? "bad" : "dim"}>
            {t.council.loyaltyApparent} {c.apparentLoyalty ?? "?"}
          </Tag>
          <button onClick={onPick} disabled={!picked && !canPick}
            className={`px-1.5 py-[1px] border text-[11px] disabled:opacity-40 ${
              picked ? "border-accent text-accent bg-accent/10"
                : "border-edge text-dim hover:text-ink"}`}>
            {picked ? "✓ " : ""}{t.recruit.compare}
          </button>
        </div>
      </div>

      <div className="text-dim text-[12px] mt-0.5">
        {c.nationality ?? "—"} · {c.location ?? "—"}
      </div>

      {/* attributi: valore grezzo, col guadagno sul massimo del consiglio accanto */}
      <div className="flex gap-1 flex-wrap my-2">
        {ATTRS.map((a) => {
          const v = c.attributes[a] ?? 0;
          const g = gain[a] ?? 0;
          return (
            <span key={a}
              className={`text-[12px] px-1.5 py-0.5 border inline-flex items-center gap-1 ${
                g > 0 ? "border-good/40 bg-good/10" : "border-edge"} ${
                sortAttr === a ? "outline outline-1 outline-accent" : ""}`}
              title={g > 0 ? `+${g} sul massimo attuale del consiglio` : undefined}>
              <AttrIcon attr={a} size={13} title={SHORT[a]} />
              <span className="text-faint">{SHORT[a]}</span>
              <span className={v >= 7 ? "font-semibold" : ""}>{v}</span>
              {g > 0 && <span className="text-good ml-1">+{g}</span>}
            </span>
          );
        })}
      </div>

      {(weak.length > 0 || depthAttrs.length > 0) && (
        <div className="text-[12px] mb-1.5 flex gap-1 flex-wrap items-center">
          {weak.length > 0 && <Tag tone="mine">{t.recruit.fixesWeak}: {weak.join(", ")}</Tag>}
          {depthAttrs.length > 0 && (
            <span className="text-dim" title={t.recruit.depthHint}>{t.recruit.depth}:</span>
          )}
          {depthAttrs.map((a) => (
            <Tag key={a}>
              <span className="inline-flex items-center gap-1" title={t.recruit.depthHint}>
                <AttrIcon attr={a} size={12} title={SHORT[a]} />
                {SHORT[a]} {depth[a]!.now} → <span className="text-good">{depth[a]!.after}</span>
              </span>
            </Tag>
          ))}
        </div>
      )}

      <div className="text-[12px] mb-1.5">
        <div className="text-dim mb-0.5">{t.recruit.income}</div>
        <IncomeLine income={c.income} />
      </div>

      <div className="text-[12px] mb-1.5">
        <div className="text-dim mb-0.5" title={t.recruit.missionsNewHint}>
          {t.recruit.missions} <span className="text-ink">({missions.length})</span>
          {fresh > 0 && <span className="text-good"> · {fresh} {t.recruit.compareMissionsNew}</span>}
        </div>
        {missions.length === 0
          ? <div className="text-dim">—</div>
          : (
            <div className="flex gap-1 flex-wrap">
              {missions.map((m) => (
                <Tag key={m.id} tone={m.new ? "mine" : "dim"}>
                  <span className="inline-flex items-center gap-1">
                    <MissionIcon icon={m.icon} size={16} title={m.name} />
                    {m.name}
                    {m.attribute && (
                      <AttrIcon attr={m.attribute} size={12} title={SHORT[m.attribute]} />
                    )}
                  </span>
                </Tag>
              ))}
            </div>
          )}
      </div>

      <div className="text-[12px]">
        <div className="text-dim mb-0.5">{t.council.traits}</div>
        <Traits c={c} />
      </div>
    </div>
  );
}

/** Tabella affiancata: una colonna per candidato, il massimo del consiglio come riferimento. */
function Compare({ picked, coverage, onClear }: {
  picked: Councilor[]; coverage: Coverage[]; onClear: () => void;
}) {
  const { t } = useSettings();
  const best = Object.fromEntries(coverage.map((c) => [c.attribute, c.best?.value ?? 0])) as
    Record<Attr, number>;

  // in ogni riga si evidenzia il valore piu' alto fra i candidati, non un vincitore assoluto
  const top = (vals: number[]) => Math.max(...vals);
  const cell = (v: number, hi: number, extra = "") =>
    `px-2 py-1 text-right tabular-nums ${v === hi && picked.length > 1 ? "text-good font-semibold" : ""} ${extra}`;

  const rows: { label: ReactNode; ref?: ReactNode; vals: number[]; fmt?: (v: number) => string }[] = [
    ...ATTRS.map((a) => ({
      label: <span className="inline-flex items-center gap-1"><AttrIcon attr={a} size={13} />{SHORT[a]}</span>,
      ref: best[a],
      vals: picked.map((c) => c.attributes[a] ?? 0),
    })),
    ...RES.filter((r) => picked.some((c) => c.income[r.key] !== 0)).map((r) => ({
      label: t.recruit[r.label],
      vals: picked.map((c) => c.income[r.key]),
      fmt: signed,
    })),
    {
      label: t.council.loyaltyApparent,
      vals: picked.map((c) => c.apparentLoyalty ?? 0),
    },
    {
      label: t.recruit.compareMissionsNew,
      vals: picked.map((c) => (c.missionList ?? []).filter((m) => m.new).length),
    },
  ];

  return (
    <div className="bg-panel border border-accent/50 rounded-lg p-3 mb-3 overflow-x-auto">
      <div className="flex items-baseline gap-2 mb-2">
        <span className="font-semibold text-[13px]">{t.recruit.compareTitle}</span>
        <button onClick={onClear} className="text-[11px] text-dim hover:text-ink ml-auto">
          {t.recruit.compareClear}
        </button>
      </div>
      <table className="text-[12px] w-full">
        <thead>
          <tr className="text-dim">
            <th className="px-2 py-1 text-left font-normal"></th>
            <th className="px-2 py-1 text-right font-normal">{t.recruit.compareCouncil}</th>
            {picked.map((c) => (
              <th key={c.id} className="px-2 py-1 text-right font-semibold text-ink">
                {c.name}
                <div className="text-dim font-normal">{c.typeName}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const hi = top(row.vals);
            return (
              <tr key={i} className="border-t border-edge/60">
                <td className="px-2 py-1 text-dim">{row.label}</td>
                <td className="px-2 py-1 text-right text-faint tabular-nums">{row.ref ?? ""}</td>
                {row.vals.map((v, j) => (
                  <td key={j} className={cell(v, hi,
                    typeof row.ref === "number" && v > row.ref ? "bg-good/10" : "")}>
                    {row.fmt ? row.fmt(v) : v}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type Sort = "covers" | "income" | "loyalty" | Attr;

export default function RecruitsPage() {
  const { t, game, live } = useSettings();
  const { data: snap, error } = useSnapshot(live.version, game);
  const [sort, setSort] = useState<Sort>("covers");
  const [pickedIds, setPickedIds] = useState<number[]>([]);

  if (error) return <Empty>{t.common.error}: {error}</Empty>;
  if (!snap) return <Empty>{t.common.loading}</Empty>;
  if (snap.recruits.length === 0) return <Empty>{t.recruit.empty}</Empty>;

  const sortAttr = (ATTRS as readonly string[]).includes(sort) ? (sort as Attr) : null;
  const list = [...snap.recruits].sort((a, b) => {
    if (sortAttr) return (b.attributes[sortAttr] ?? 0) - (a.attributes[sortAttr] ?? 0);
    if (sort === "covers") return (b.covers?.length ?? 0) - (a.covers?.length ?? 0);
    if (sort === "income") return incomeWeight(b.income) - incomeWeight(a.income);
    return (b.apparentLoyalty ?? 0) - (a.apparentLoyalty ?? 0);
  });

  // i candidati spariscono dal mercato: si confronta solo chi c'e' ancora
  const picked = pickedIds
    .map((id) => snap.recruits.find((c) => c.id === id))
    .filter((c): c is Councilor => !!c);
  const toggle = (id: number) => setPickedIds((ids) =>
    ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id].slice(-MAX_COMPARE));

  const btn = (active: boolean) => `px-2 py-1 rounded border text-[12px] ${
    active ? "border-accent text-accent bg-accent/10" : "border-edge text-dim hover:text-ink"}`;

  return (
    <Panel title={t.recruit.title} sub={t.recruit.sub}>
      <div className="flex items-center gap-2 mb-3 text-[12px] flex-wrap">
        <Link href="/council" className="text-accent hover:underline">
          ← {t.recruit.backToCouncil}
        </Link>
        <span className="text-dim ml-auto">{t.recruit.sortBy}</span>
        {([["covers", t.recruit.sortCovers],
           ["income", t.recruit.sortIncome],
           ["loyalty", t.recruit.sortLoyalty]] as [Sort, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setSort(k)} className={btn(sort === k)}>
            {label}
          </button>
        ))}
        <span className="text-dim">· {t.recruit.sortAttr}</span>
        {ATTRS.map((a) => (
          <button key={a} onClick={() => setSort(a)} title={SHORT[a]}
            className={`${btn(sort === a)} inline-flex items-center gap-1`}>
            <AttrIcon attr={a} size={13} />{SHORT[a]}
          </button>
        ))}
      </div>

      <p className="text-dim text-[11.5px] mb-3">{t.recruit.heuristic}</p>
      <p className="text-dim text-[11.5px] mb-3">{t.council.hiddenLoyalty}</p>
      <p className="text-dim text-[11.5px] mb-3">{t.recruit.traitsHint}</p>
      <p className="text-dim text-[11.5px] mb-3">{t.recruit.depthHint}</p>
      {list.some((c) => c.income.fromTraits) && (
        <p className="text-dim text-[11.5px] mb-3">{t.recruit.incomeFromTraits}</p>
      )}

      {picked.length > 0
        ? <Compare picked={picked} coverage={snap.council.coverage}
            onClear={() => setPickedIds([])} />
        : <p className="text-dim text-[11.5px] mb-3">{t.recruit.compareHint}</p>}

      <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {list.map((c) => (
          <Candidate key={c.id} c={c} sortAttr={sortAttr}
            picked={pickedIds.includes(c.id)}
            canPick={pickedIds.length < MAX_COMPARE}
            onPick={() => toggle(c.id)} />
        ))}
      </div>
    </Panel>
  );
}
