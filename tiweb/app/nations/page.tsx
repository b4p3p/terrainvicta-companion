"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useApi, useSnapshot } from "@/lib/api";
import { useSettings } from "@/lib/settings";
import { usePersistentState } from "@/lib/persist";
import {
  Column, DataTable, Empty, GameIcon, Panel, Spark, Tag, TrendArrow, bn, nf, pct,
} from "@/components/ui";
import type { Nation, NationTrends, TrendKey } from "@/lib/types";

const SCOPES = ["all", "eu", "mine", "full", "partial", "free", "contested"] as const;
type Scope = (typeof SCOPES)[number];
const isScope = (v: unknown): v is Scope => SCOPES.includes(v as Scope);
const isString = (v: unknown): v is string => typeof v === "string";
const isBool = (v: unknown): v is boolean => typeof v === "boolean";

/** Indicatori con una serie storica nel salvataggio. `fmt` formatta un valore
 *  della serie (stessa unita' della colonna), `upIsBad` inverte i colori. */
interface Metric {
  key: TrendKey;
  title: string;
  /** icona del gioco per l'intestazione; senza, resta il titolo */
  icon?: string;
  value: (n: Nation) => number;
  fmt: (v: number) => string;
  fmtDelta: (d: number) => string;
  upIsBad?: boolean;
}

const signed = (s: string, d: number) => (d > 0 ? "+" : "") + s;
const dec = (digits: number) => ({
  fmt: (v: number) => nf(v, digits),
  fmtDelta: (d: number) => signed(nf(d, digits), d),
});

const METRICS: Metric[] = [
  // la serie del PIL arriva gia' in miliardi; la colonna usa bn() sul valore grezzo
  { key: "gdp", title: "PIL mld", icon: "ICO_economy_priority", value: (n) => n.gdp / 1e9, ...dec(0) },
  // ricavato da PIL e popolazione: il salvataggio non ne tiene una serie
  { key: "gdpPc", title: "PIL/ab $", icon: "ICO_per_capita_GDP", value: (n) => n.gdpPc, ...dec(0) },
  // la popolazione si muove di poco: variazione a 2 decimali (decine di migliaia)
  { key: "pop", title: "Pop. mln", icon: "ICO_population", value: (n) => n.pop, fmt: dec(1).fmt, fmtDelta: dec(2).fmtDelta },
  { key: "research", title: "Ricerca/m", icon: "ICO_research", value: (n) => n.research, ...dec(0) },
  { key: "ip", title: "Investim.", icon: "ICO_investments", value: (n) => n.ip, ...dec(1) },
  { key: "education", title: "Istruz.", icon: "ICO_education", value: (n) => n.education, ...dec(1) },
  { key: "democracy", title: "Democr.", icon: "ICO_gov_type", value: (n) => n.democracy, ...dec(1) },
  { key: "cohesion", title: "Coesione", icon: "ICO_Cohesion_mid", value: (n) => n.cohesion, ...dec(1) },
  { key: "unrest", title: "Disordini", icon: "ICO_Unrest_mid", value: (n) => n.unrest, ...dec(2), upIsBad: true },
  { key: "inequality", title: "Disugu.", icon: "ICO_inequality", value: (n) => n.inequality, ...dec(1), upIsBad: true },
  {
    key: "support", title: "Sostegno", value: (n) => n.support,
    fmt: (v) => pct(v), fmtDelta: (d) => signed(nf(d * 100, 1), d) + " pt",
  },
  { key: "miltech", title: "Miltech", icon: "tech_military_icon", value: (n) => n.miltech, ...dec(1) },
  { key: "nukes", title: "Atomiche", icon: "ICO_nukes", value: (n) => n.nukes, ...dec(0) },
];
const METRIC = Object.fromEntries(METRICS.map((m) => [m.key, m])) as Record<TrendKey, Metric>;
const isMetric = (v: unknown): v is TrendKey => typeof v === "string" && v in METRIC;

/** Variazione su tutta la finestra: serve alla sparkline e al suo ordinamento. */
const deltaOf = (s: number[] | undefined) =>
  s && s.length > 1 ? s[s.length - 1] - s[0] : 0;

/** Ultima variazione: il valore attuale meno il piu' recente diverso da lui.
 *  E' quella che il gioco segna con la freccia; la serie resta piatta per piu'
 *  rilevazioni di fila, quindi il punto precedente e' spesso identico. */
const lastChange = (s: number[] | undefined) => {
  if (!s || s.length < 2) return 0;
  const now = s[s.length - 1];
  for (let i = s.length - 2; i >= 0; i--) if (s[i] !== now) return now - s[i];
  return 0;
};

/** Ultima variazione accanto al valore, con la freccia del gioco: la
 *  direzione dice se sale o scende, il colore se è un bene o un male. */
function Delta({ m, series }: { m: Metric; series: number[] | undefined }) {
  const d = lastChange(series);
  if (Math.abs(d) < 1e-9) return null;
  const good = (d > 0) !== !!m.upIsBad;
  const text = m.fmtDelta(d);
  // la freccia c'e' sempre; il numero solo se a questa precisione non e' zero
  const visible = text.replace(/[^1-9]/g, "") !== "";
  return (
    <span className={`ml-1 text-[10.5px] leading-none inline-flex items-center gap-0.5 [&>img]:align-middle ${
      good ? "text-good" : "text-bad"}`}>
      <TrendArrow up={d > 0} good={good} title={text} />
      {visible && text}
    </span>
  );
}

/** Tutti gli andamenti di una nazione, in piccolo, coi valori grezzi. */
function Detail({ name, series, onClose }: {
  name: string; series: Partial<Record<TrendKey, number[]>>; onClose: () => void;
}) {
  const { t } = useSettings();
  return (
    <div className="bg-panel border border-accent/50 p-3 mb-3.5">
      <div className="flex items-baseline gap-2 mb-2">
        <span className="font-semibold text-[13px]">{name}</span>
        <button onClick={onClose} className="text-[11px] text-dim hover:text-ink ml-auto">
          {t.nations.detailClose}
        </button>
      </div>
      <div className="grid gap-x-5 gap-y-2.5 grid-cols-[repeat(auto-fill,minmax(210px,1fr))]">
        {METRICS.map((m) => {
          const s = series[m.key];
          if (!s || s.length === 0) return null;
          return (
            <div key={m.key} className="text-[11.5px]">
              <div className="flex items-baseline justify-between">
                <span className="text-dim inline-flex items-center gap-1">
                  <GameIcon bundle="icons_2d" icon={m.icon} size={14} />{m.title}
                </span>
                <Delta m={m} series={s} />
              </div>
              <Spark data={s} w={200} h={30} upIsBad={m.upIsBad} />
              <div className="text-faint flex justify-between">
                <span>{t.nations.first} {m.fmt(s[0])}</span>
                <span>{t.nations.last} {m.fmt(s[s.length - 1])}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function NationsPage() {
  const { t, game, live } = useSettings();
  const { data: snap } = useSnapshot(live.version, game);
  const { data: trends } = useApi<NationTrends>("/api/nations/trends", [live.version]);
  // combo, ricerca e preferenze restano fra un caricamento e l'altro; la
  // casella dei proprietari no: e' informazione altrui, riparte spenta
  const [scope, setScope] = usePersistentState<Scope>("nations.scope", "eu", isScope);
  const [q, setQ] = usePersistentState("nations.q", "", isString);
  const [metric, setMetric] = usePersistentState<TrendKey>("nations.trend", "research", isMetric);
  const [showDelta, setShowDelta] = usePersistentState("nations.delta", true, isBool);
  const [showOwners, setShowOwners] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

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

  const seriesOf = (n: Nation, k: TrendKey) =>
    trends?.nations[n.name]?.[k] ?? (k === "research" ? n.histResearch : undefined);

  /** Colonna numerica con la variazione accanto, se richiesta. */
  const num = (k: TrendKey, render: (n: Nation) => ReactNode): Column<Nation> => ({
    key: k, title: METRIC[k].title, icon: METRIC[k].icon,
    sort: (n) => METRIC[k].value(n),
    // flex centrato: valore, freccia e numero sulla stessa linea mediana
    render: (n) => (
      <span className="inline-flex items-center justify-end">
        {render(n)}
        {showDelta && <Delta m={METRIC[k]} series={seriesOf(n, k)} />}
      </span>
    ),
  });

  const m = METRIC[metric];
  const columns: Column<Nation>[] = [
    {
      key: "name", title: t.common.nation, align: "left",
      sort: (r) => r.name,
      render: (r) => (
        <>
          <button onClick={() => setSelected(selected === r.name ? null : r.name)}
            className={`text-left hover:underline ${selected === r.name ? "text-accent" : ""}`}>
            {r.name}
          </button>{" "}
          {r.myCP > 0
            ? <Tag tone={r.myCP === r.cp ? "mine" : "warn"}>{r.myCP}/{r.cp}</Tag>
            : r.freeCP === r.cp ? <Tag tone="free">{t.nations.free}</Tag>
              : r.freeCP > 0 ? <Tag tone="free">{r.freeCP}</Tag>
                : <Tag tone="bad">{t.nations.taken}</Tag>}
        </>
      ),
    },
    num("gdp", (r) => bn(r.gdp)),
    num("gdpPc", (r) => nf(r.gdpPc, 0)),
    num("pop", (r) => nf(r.pop)),
    num("research", (r) => nf(r.research, 0)),
    {
      // l'andamento dell'indicatore scelto nella combo; si ordina per variazione
      key: "trend", title: `${t.nations.trend} ${m.title}`,
      sort: (r) => deltaOf(seriesOf(r, metric)) * (m.upIsBad ? -1 : 1),
      render: (r) => <Spark data={seriesOf(r, metric) ?? []} upIsBad={m.upIsBad} />,
    },
    num("ip", (r) => nf(r.ip)),
    num("education", (r) => nf(r.education)),
    num("democracy", (r) => nf(r.democracy)),
    num("cohesion", (r) => nf(r.cohesion)),
    num("unrest", (r) => (
      <span className={r.unrest >= 3 ? "text-warn" : ""}>{nf(r.unrest, 2)}</span>
    )),
    num("inequality", (r) => nf(r.inequality)),
    num("support", (r) => (
      <span className={r.support > 0.2 ? "text-good" : ""}>{pct(r.support)}</span>
    )),
    { key: "difficulty", title: "Difficoltà", render: (r) => nf(r.difficulty) },
    { key: "spaceFunding", title: "Fondi sp.", icon: "ICO_funding_priority", render: (r) => nf(r.spaceFunding, 0) },
    {
      key: "space", title: "Prog.sp.", icon: "ICO_spaceflightProgram_priority", sort: (r) => (r.space ? 1 : 0),
      // l'icona del gioco per il programma spaziale; se manca resta il testo
      render: (r) => (r.space
        ? <span title={t.common.yes}>
            <GameIcon bundle="icons_2d" icon="ICO_spaceflightProgram_priority" size={16}
              title="Programma spaziale" />
          </span>
        : <span className="text-faint">{t.common.no}</span>),
    },
    num("nukes", (r) => r.nukes || "—"),
    num("miltech", (r) => nf(r.miltech)),
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

  const detail = selected ? trends?.nations[selected] : undefined;

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
        <label className="flex items-center gap-1.5 text-dim text-[12.5px]">
          {t.nations.trendOf}
          <select value={metric} onChange={(e) => setMetric(e.target.value as TrendKey)}>
            {METRICS.map((x) => <option key={x.key} value={x.key}>{x.title}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-dim text-[12.5px] cursor-pointer">
          <input type="checkbox" checked={showDelta}
            onChange={(e) => setShowDelta(e.target.checked)} className="p-0" />
          {t.nations.showDelta}
        </label>
        <label className="flex items-center gap-1.5 text-dim text-[12.5px] cursor-pointer">
          <input type="checkbox" checked={showOwners}
            onChange={(e) => setShowOwners(e.target.checked)} className="p-0" />
          {t.nations.showOwners}
          <span className="text-[11px]">({t.nations.ownersWarning})</span>
        </label>
      </div>

      <p className="text-faint text-[11.5px] mb-1">
        {t.nations.trendHint.replace("{n}", String(trends?.points ?? "…"))}
      </p>
      <p className="text-faint text-[11.5px] mb-3">{t.nations.detailHint}</p>

      {selected && detail && (
        <Detail name={selected} series={detail} onClose={() => setSelected(null)} />
      )}

      <DataTable rows={rows as unknown as Record<string, unknown>[]}
        columns={columns as unknown as Column<Record<string, unknown>>[]}
        initialSort="gdp" />
    </Panel>
  );
}
