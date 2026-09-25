"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useSnapshot } from "@/lib/api";
import { useSettings } from "@/lib/settings";
import { AttrIcon, Empty, Panel, ResourceIcon } from "@/components/ui";
import { Guide } from "@/components/Guide";
import { CouncilorCard, RES, short, signed } from "@/components/CouncilorCard";
import { ATTRS, type Attr, type Councilor, type Coverage, type Income } from "@/lib/types";

const MAX_COMPARE = 3;

/** Somma grezza del reddito, solo per ordinare: risorse diverse non sono
 *  commensurabili, quindi non viene mai mostrata come punteggio. */
function incomeWeight(i: Income) {
  return i.money + i.influence + i.research + i.ops + i.boost;
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
      label: <span className="inline-flex items-center gap-1"><AttrIcon attr={a} size={13} />{short(a)}</span>,
      ref: best[a],
      vals: picked.map((c) => c.attributes[a] ?? 0),
    })),
    ...RES.filter((r) => picked.some((c) => c.income[r.key] !== 0)).map((r) => ({
      label: <span className="inline-flex items-center gap-1">
        <ResourceIcon icon={r.icon} size={13} />{t.recruit[r.label]}
      </span>,
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

type Sort = "covers" | "income" | "loyalty" | "age" | Attr;

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
    // età: dal più giovane; chi non ha una data di nascita va in fondo
    if (sort === "age") return (a.age ?? 999) - (b.age ?? 999);
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
    <Panel title={t.recruit.title} sub={t.recruit.sub}
      right={
        // le note di metodo stanno qui: sopra le schede occupavano mezza pagina
        <Guide title={t.recruit.title} sections={[
          { title: t.recruit.guideRead, body: [
            t.recruit.heuristic, t.recruit.depthHint, t.recruit.traitsHint,
          ] },
          { title: t.recruit.guideHidden, body: [
            t.council.hiddenLoyalty,
            list.some((c) => c.income.fromTraits) && t.recruit.incomeFromTraits,
          ] },
          { title: t.recruit.guideAge, body: [t.recruit.guideAgeBody] },
          { title: t.recruit.compareTitle, body: [t.recruit.compareHint] },
        ]} />
      }>
      <div className="flex items-center gap-2 mb-3 text-[12px] flex-wrap">
        <Link href="/council" className="text-accent hover:underline">
          ← {t.recruit.backToCouncil}
        </Link>
        <span className="text-dim ml-auto">{t.recruit.sortBy}</span>
        {([["covers", t.recruit.sortCovers],
           ["income", t.recruit.sortIncome],
           ["loyalty", t.recruit.sortLoyalty],
           ["age", t.recruit.sortAge]] as [Sort, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setSort(k)} className={btn(sort === k)}>
            {label}
          </button>
        ))}
        <span className="text-dim">· {t.recruit.sortAttr}</span>
        {ATTRS.map((a) => (
          <button key={a} onClick={() => setSort(a)} title={short(a)}
            className={`${btn(sort === a)} inline-flex items-center gap-1`}>
            <AttrIcon attr={a} size={13} />{short(a)}
          </button>
        ))}
      </div>

      {picked.length > 0 && (
        <Compare picked={picked} coverage={snap.council.coverage}
          onClear={() => setPickedIds([])} />
      )}

      <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {list.map((c) => (
          <CouncilorCard key={c.id} c={c} variant="recruit" sortAttr={sortAttr}
            highlighted={pickedIds.includes(c.id)}
            action={(() => {
              const on = pickedIds.includes(c.id);
              return (
                <button onClick={() => toggle(c.id)} disabled={!on && pickedIds.length >= MAX_COMPARE}
                  className={`px-1.5 py-[1px] border text-[11px] disabled:opacity-40 ${
                    on ? "border-accent text-accent bg-accent/10" : "border-edge text-dim hover:text-ink"}`}>
                  {on ? "✓ " : ""}{t.recruit.compare}
                </button>
              );
            })()} />
        ))}
      </div>
    </Panel>
  );
}
