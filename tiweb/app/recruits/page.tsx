"use client";

import { useState } from "react";
import Link from "next/link";
import { useSnapshot } from "@/lib/api";
import { useSettings } from "@/lib/settings";
import { Empty, MissionIcon, Panel, Tag, nf } from "@/components/ui";
import { ATTRS, type Attr, type Councilor, type Income } from "@/lib/types";

const SHORT: Record<Attr, string> = {
  Persuasion: "PER", Investigation: "IND", Espionage: "SPI", Command: "CMD",
  Administration: "AMM", Science: "SCI", Security: "SIC",
};

const RES: { key: keyof Income; label: "resMoney" | "resInfluence" | "resResearch"
  | "resOps" | "resBoost"; tone: string }[] = [
  { key: "money", label: "resMoney", tone: "text-warn" },
  { key: "influence", label: "resInfluence", tone: "text-accent" },
  { key: "research", label: "resResearch", tone: "text-good" },
  { key: "ops", label: "resOps", tone: "text-other" },
  { key: "boost", label: "resBoost", tone: "text-dim" },
];

/** Somma grezza del reddito, solo per ordinare: risorse diverse non sono
 *  commensurabili, quindi non viene mai mostrata come punteggio. */
function incomeWeight(i: Income) {
  return i.money + i.influence + i.research + i.ops + i.boost;
}

function IncomeLine({ income }: { income: Income }) {
  const { t } = useSettings();
  const parts = RES.filter((r) => (income[r.key] as number) !== 0);
  if (parts.length === 0) return <span className="text-dim">—</span>;
  return (
    <span className="flex gap-2 flex-wrap">
      {parts.map((r) => {
        const v = income[r.key] as number;
        return (
          <span key={r.key} className={v < 0 ? "text-bad" : r.tone}>
            {v > 0 ? "+" : ""}{nf(v, 0)} {t.recruit[r.label]}
          </span>
        );
      })}
    </span>
  );
}

function Candidate({ c }: { c: Councilor }) {
  const { t } = useSettings();
  const covers = c.covers ?? [];
  const gain = c.gain ?? {};
  const weak = c.fixesWeak ?? [];
  const gains = ATTRS.filter((a) => (gain[a] ?? 0) > 0);

  return (
    <div className="bg-panel border border-edge rounded-lg p-3">
      <div className="flex justify-between items-baseline gap-2">
        <div>
          <span className="font-semibold text-[14px]">{c.name}</span>
          <span className="text-dim text-[12px] ml-2">{c.typeName}</span>
        </div>
        <Tag tone={(c.apparentLoyalty ?? 9) <= 6 ? "bad" : "dim"}>
          {t.council.loyaltyApparent} {c.apparentLoyalty ?? "?"}
        </Tag>
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
              className={`text-[12px] px-1.5 py-0.5 rounded border ${
                g > 0 ? "border-good/40 bg-good/10" : "border-edge"}`}
              title={g > 0 ? `+${g} sul massimo attuale del consiglio` : undefined}>
              <span className="text-dim">{SHORT[a]}</span>{" "}
              <span className={v >= 7 ? "font-semibold" : ""}>{v}</span>
              {g > 0 && <span className="text-good ml-1">+{g}</span>}
            </span>
          );
        })}
      </div>

      {weak.length > 0 && (
        <div className="text-[12px] mb-1.5">
          <Tag tone="mine">{t.recruit.fixesWeak}: {weak.join(", ")}</Tag>
        </div>
      )}

      <div className="text-[12px] mb-1.5">
        <div className="text-dim mb-0.5">{t.recruit.income}</div>
        <IncomeLine income={c.income} />
      </div>

      <div className="text-[12px] mb-1.5">
        <div className="text-dim mb-0.5">
          {t.recruit.covers} <span className="text-ink">({covers.length})</span>
        </div>
        {covers.length === 0
          ? <div className="text-dim">{t.recruit.coversNone}</div>
          : (
            <div className="flex gap-1 flex-wrap">
              {covers.map((m) => (
                <Tag key={m.id} tone="mine">
                  <span className="inline-flex items-center gap-1">
                    <MissionIcon icon={m.icon} size={16} title={m.name} />
                    {m.name}{m.attribute ? ` · ${SHORT[m.attribute]}` : ""}
                  </span>
                </Tag>
              ))}
            </div>
          )}
      </div>

      <div className="text-[12px]">
        <div className="text-dim mb-0.5">{t.council.traits}</div>
        <div className="flex gap-1 flex-wrap">
          {c.traits.map((tr) => <Tag key={tr.id}>{tr.name}</Tag>)}
        </div>
      </div>

      {gains.length === 0 && weak.length === 0 && covers.length === 0 && (
        <div className="text-dim text-[11.5px] mt-2">{t.recruit.gainNone}</div>
      )}
    </div>
  );
}

type Sort = "covers" | "income" | "loyalty";

export default function RecruitsPage() {
  const { t, game, live } = useSettings();
  const { data: snap, error } = useSnapshot(live.version, game);
  const [sort, setSort] = useState<Sort>("covers");

  if (error) return <Empty>{t.common.error}: {error}</Empty>;
  if (!snap) return <Empty>{t.common.loading}</Empty>;
  if (snap.recruits.length === 0) return <Empty>{t.recruit.empty}</Empty>;

  const list = [...snap.recruits].sort((a, b) => {
    if (sort === "covers") return (b.covers?.length ?? 0) - (a.covers?.length ?? 0);
    if (sort === "income") return incomeWeight(b.income) - incomeWeight(a.income);
    return (b.apparentLoyalty ?? 0) - (a.apparentLoyalty ?? 0);
  });

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
          <button key={k} onClick={() => setSort(k)}
            className={`px-2 py-1 rounded border text-[12px] ${
              sort === k
                ? "border-accent text-accent bg-accent/10"
                : "border-edge text-dim hover:text-ink"}`}>
            {label}
          </button>
        ))}
      </div>

      <p className="text-dim text-[11.5px] mb-3">{t.recruit.heuristic}</p>
      <p className="text-dim text-[11.5px] mb-3">{t.council.hiddenLoyalty}</p>
      {list.some((c) => c.income.fromTraits) && (
        <p className="text-dim text-[11.5px] mb-3">{t.recruit.incomeFromTraits}</p>
      )}

      <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {list.map((c) => <Candidate key={c.id} c={c} />)}
      </div>
    </Panel>
  );
}
