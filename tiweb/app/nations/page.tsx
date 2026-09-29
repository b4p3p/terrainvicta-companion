"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useApi, useSnapshot } from "@/lib/api";
import { Legend, ShareBar, WeightChips, pc, type Slice } from "@/components/priorities";
import { useSettings } from "@/lib/settings";
import { usePersistentState } from "@/lib/persist";
import {
  Column, DataTable, Empty, GameIcon, MissionIcon, Panel, Spark, Tag, TrendArrow, bn, nf, pct,
} from "@/components/ui";
import { Guide } from "@/components/Guide";
import { Tip } from "@/components/Tip";
import type { Nation, NationTrends, TrendKey } from "@/lib/types";

const SCOPES = ["all", "eu", "mine", "full", "partial", "free", "affordable", "contested"] as const;
type Scope = (typeof SCOPES)[number];
const isScope = (v: unknown): v is Scope => SCOPES.includes(v as Scope);
const isString = (v: unknown): v is string => typeof v === "string";
const isBool = (v: unknown): v is boolean => typeof v === "boolean";

/** Indicatori con una serie storica nel salvataggio. `fmt` formatta un valore
 *  della serie (stessa unita' della colonna), `upIsBad` inverte i colori. */
interface Metric {
  key: TrendKey;
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
  { key: "gdp", icon: "ICO_economy_priority", value: (n) => n.gdp / 1e9, ...dec(0) },
  // ricavato da PIL e popolazione: il salvataggio non ne tiene una serie
  { key: "gdpPc", icon: "ICO_per_capita_GDP", value: (n) => n.gdpPc, ...dec(0) },
  // la popolazione si muove di poco: variazione a 2 decimali (decine di migliaia)
  { key: "pop", icon: "ICO_population", value: (n) => n.pop, fmt: dec(1).fmt, fmtDelta: dec(2).fmtDelta },
  { key: "research", icon: "ICO_research", value: (n) => n.research, ...dec(0) },
  { key: "ip", icon: "ICO_investments", value: (n) => n.ip, ...dec(1) },
  { key: "education", icon: "ICO_education", value: (n) => n.education, ...dec(1) },
  { key: "democracy", icon: "ICO_gov_type", value: (n) => n.democracy, ...dec(1) },
  { key: "cohesion", icon: "ICO_Cohesion_mid", value: (n) => n.cohesion, ...dec(1) },
  { key: "unrest", icon: "ICO_Unrest_mid", value: (n) => n.unrest, ...dec(2), upIsBad: true },
  { key: "inequality", icon: "ICO_inequality", value: (n) => n.inequality, ...dec(1), upIsBad: true },
  {
    key: "support", value: (n) => n.support,
    fmt: (v) => pct(v), fmtDelta: (d) => signed(nf(d * 100, 1), d) + " pt",
  },
  { key: "miltech", icon: "tech_military_icon", value: (n) => n.miltech, ...dec(1) },
  { key: "nukes", icon: "ICO_nukes", value: (n) => n.nukes, ...dec(0) },
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

interface ReasonRow { id: string; name: string; month: number; last: number; all: number }
interface NationDetail {
  name: string;
  columns: { cause: string; month: string; last: string; all: string };
  reasons: Partial<Record<TrendKey, ReasonRow[]>>;
  controlPoints: {
    position: number | null;
    name: string;
    benefitsDisabled: boolean;
    total: number;
    preset: string | null;
    closest: { name: string; moved: number } | null;
    priorities: Slice[];
  }[];
}

/** oltre questa quota di bilancio spostata, «il più simile» non dice nulla */
const CLOSE_ENOUGH = 0.25;

/** Il PIL arriva in dollari: in milioni si leggono le cause di un mese. Gli
 *  altri indicatori si muovono di millesimi, e a 1 decimale sparirebbero. */
function fmtReason(stat: TrendKey, v: number, million: string) {
  if (Math.abs(v) < 1e-9) return "·";
  // almeno due cifre significative: 0,00025 non deve diventare «0,000»
  const digits = Math.min(5, Math.max(3, Math.ceil(-Math.log10(Math.abs(v))) + 1));
  const s = stat === "gdp" ? `${nf(Math.abs(v) / 1e6, 1)} ${million}` : nf(Math.abs(v), digits);
  return (v > 0 ? "+" : "−") + s;
}

/** Le cause di variazione, come nella scheda nazione del gioco. */
function Reasons({ d }: { d: NationDetail }) {
  const { t } = useSettings();
  const stats = (Object.keys(d.reasons) as TrendKey[]).filter((k) => d.reasons[k]?.length);
  if (!stats.length) return <p className="text-faint text-[11.5px]">{t.nations.noReasons}</p>;
  return (
    <div className="grid gap-x-5 gap-y-3 grid-cols-[repeat(auto-fill,minmax(400px,1fr))]">
      {stats.map((k) => (
        <table key={k} className="text-[11.5px] w-full self-start">
          <thead>
            <tr className="text-faint">
              <th className="text-left font-normal pb-0.5">
                <span className="text-dim inline-flex items-center gap-1">
                  <GameIcon bundle="icons_2d" icon={METRIC[k].icon} size={14} />{t.nations.metric[k]}
                </span>
              </th>
              <th className="text-right font-normal pb-0.5 pl-2 whitespace-nowrap">{d.columns.month}</th>
              <th className="text-right font-normal pb-0.5 pl-2 whitespace-nowrap">{d.columns.last}</th>
              <th className="text-right font-normal pb-0.5 pl-2 whitespace-nowrap">{d.columns.all}</th>
            </tr>
          </thead>
          <tbody>
            {d.reasons[k]!.map((r) => (
              <tr key={r.id} className="border-t border-edge">
                <td className="text-dim py-[2px] pr-2">{r.name}</td>
                {(["month", "last", "all"] as const).map((c) => (
                  <td key={c} className={`text-right pl-2 whitespace-nowrap ${
                    r[c] === 0 ? "text-faint" : c === "all" ? "text-dim" : ""}`}>
                    {fmtReason(k, r[c], t.nations.million)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </div>
  );
}

/** Priorità dei NOSTRI punti di controllo: le sole che il giocatore imposta.
 *  Quelli con pesi identici si raggruppano in una riga. */
function MyPriorities({ d, knowledge }: { d: NationDetail; knowledge: string }) {
  const { t } = useSettings();
  const groups = new Map<string, NationDetail["controlPoints"]>();
  for (const cp of d.controlPoints) {
    const key = cp.priorities.map((s) => `${s.id}:${s.weight}`).join(",");
    groups.set(key, [...(groups.get(key) ?? []), cp]);
  }
  return (
    <div className="flex flex-col gap-2">
      {[...groups.values()].map((cps) => {
        const cp = cps[0];
        // «Belgio-Lussemburgo (Legislatura)» -> «Legislatura»
        const label = cps.map((c) => c.name.match(/\(([^)]+)\)$/)?.[1] ?? c.name).join(" · ");
        const near = !cp.preset && cp.closest && cp.closest.moved <= CLOSE_ENOUGH;
        return (
          <div key={label} className="bg-void/30 border border-edge px-2.5 py-2">
            <div className="flex items-baseline gap-2 flex-wrap text-[12px] mb-1.5">
              <span className="text-ink">{label}</span>
              {cp.preset ? <Tag tone="mine">{cp.preset}</Tag>
                : near ? <Tag>{t.nations.closeTo.replace("{name}", cp.closest!.name)
                    .replace("{moved}", pc(cp.closest!.moved))}</Tag>
                : <Tag>{t.nations.customPreset}</Tag>}
              {cps.some((c) => c.benefitsDisabled) && <Tag tone="bad">{t.nations.benefitsOff}</Tag>}
              <span className="ml-auto text-faint text-[11px]">Σ {cp.total}</span>
            </div>
            {cp.priorities.length ? (
              <>
                <ShareBar p={cp} weightLabel={t.presets.weight} />
                <div className="mt-1.5"><WeightChips p={cp} /></div>
              </>
            ) : <p className="text-faint text-[11.5px]">{t.nations.noPriorities}</p>}
          </div>
        );
      })}
      <Legend names={t.presets.fam} knowledge={knowledge} />
    </div>
  );
}

/** Tutti gli andamenti di una nazione, in piccolo, coi valori grezzi. */
function Detail({ id, name, series, onClose }: {
  id: string; name: string; series: Partial<Record<TrendKey, number[]>>; onClose: () => void;
}) {
  const { t, game, live } = useSettings();
  const { data: why } = useApi<NationDetail>(
    `/api/nations/${encodeURIComponent(id)}/detail?lang=${game}`, [live.version, game]);
  const knowledge = why?.controlPoints.flatMap((c) => c.priorities)
    .find((s) => s.id === "knowledge")?.name ?? t.nations.knowledge;
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
                  <GameIcon bundle="icons_2d" icon={m.icon} size={14} />{t.nations.metric[m.key]}
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

      {why && why.controlPoints.length > 0 && (
        <>
          <h3 className="display text-[12px] uppercase tracking-[.06em] text-dim mt-4 mb-1.5">
            {t.nations.myPriorities}
          </h3>
          <MyPriorities d={why} knowledge={knowledge} />
        </>
      )}
      {why && (
        <>
          <h3 className="display text-[12px] uppercase tracking-[.06em] text-dim mt-4 mb-1">
            {t.nations.why}
          </h3>
          <Reasons d={why} />
        </>
      )}
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
  // margine nel tetto dei punti di controllo: quanto costa ancora prendere
  const headroom = snap?.controlPoints.capacity?.free ?? 0;

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
        case "affordable": return n.freeCP > 0 && n.cpCost <= headroom;
        case "contested": return n.takenCP > 0;
        default: return true;
      }
    });
  }, [snap, scope, q, headroom]);

  if (!snap) return <Empty>{t.common.loading}</Empty>;

  const seriesOf = (n: Nation, k: TrendKey) =>
    trends?.nations[n.id]?.[k] ?? (k === "research" ? n.histResearch : undefined);

  /** Colonna numerica con la variazione accanto, se richiesta. */
  const num = (k: TrendKey, render: (n: Nation) => ReactNode): Column<Nation> => ({
    key: k, title: t.nations.metric[k], icon: METRIC[k].icon,
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
          <button onClick={() => setSelected(selected === r.id ? null : r.id)}
            className={`text-left hover:underline ${selected === r.id ? "text-accent" : ""}`}>
            {r.name}
          </button>{" "}
          {r.myCP > 0
            ? <Tag tone={r.myCP === r.cp ? "mine" : "warn"}>{r.myCP}/{r.cp}</Tag>
            : r.freeCP === r.cp ? <Tag tone="free">{t.nations.free}</Tag>
              : r.freeCP > 0 ? <Tag tone="free">{r.freeCP}</Tag>
                : <Tag tone="bad">{t.nations.taken}</Tag>}
          {r.myCPDisabled > 0 && <>
            {" "}
            {/* l'icona di Reprimi: il gioco segna cosi' i punti coi benefici sospesi */}
            <Tip title={t.nations.cpOffTitle} content={<>
              {r.myCPDisabledSince && <div>{t.nations.cpOffSince.replace("{date}", r.myCPDisabledSince)}</div>}
              {r.myCPDisabledUntil && <div className={r.autoAbandon ? "" : "text-warn"}>
                {(r.autoAbandon ? t.nations.cpOffRenew : t.nations.cpOffUntil).replace("{date}", r.myCPDisabledUntil)}
              </div>}
              <div className="text-dim mt-1">{t.nations.cpOffNote}</div>
            </>}>
              <span className="inline-block align-[-3px]"><MissionIcon icon="ICO_crackdown" size={16} /></span>
            </Tip>
          </>}
        </>
      ),
    },
    num("gdp", (r) => bn(r.gdp)),
    num("gdpPc", (r) => nf(r.gdpPc, 0)),
    num("pop", (r) => nf(r.pop)),
    num("research", (r) => nf(r.research, 0)),
    {
      // l'andamento dell'indicatore scelto nella combo; si ordina per variazione
      key: "trend", title: `${t.nations.trend} ${t.nations.metric[m.key]}`,
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
    {
      key: "cpCost", title: t.nations.cpCost, sort: (r) => r.cpCost,
      render: (r) => (
        <span title={t.nations.cpCostHint}
          className={r.freeCP > 0 && r.cpCost <= headroom ? "text-good" : ""}>
          {nf(r.cpCost, 1)}
        </span>
      ),
    },
    { key: "difficulty", title: t.nations.difficulty, render: (r) => nf(r.difficulty) },
    { key: "spaceFunding", title: t.nations.spaceFunding, icon: "ICO_funding_priority", render: (r) => nf(r.spaceFunding, 0) },
    {
      key: "space", title: t.nations.spaceProgShort, icon: "ICO_spaceflightProgram_priority", sort: (r) => (r.space ? 1 : 0),
      // l'icona del gioco per il programma spaziale; se manca resta il testo
      render: (r) => (r.space
        ? <span title={t.common.yes}>
            <GameIcon bundle="icons_2d" icon="ICO_spaceflightProgram_priority" size={16}
              title={t.nations.spaceProgram} />
          </span>
        : <span className="text-faint">{t.common.no}</span>),
    },
    num("nukes", (r) => r.nukes || "—"),
    num("miltech", (r) => nf(r.miltech)),
    ...(showOwners
      ? [{
        key: "owners", title: t.common.owners, align: "left" as const,
        sort: (r: Nation) => r.owners.join(","),
        render: (r: Nation) => (
          <span className="text-dim text-[11.5px]">{r.owners.join(", ") || "—"}</span>
        ),
      }]
      : []),
  ];

  const detail = selected ? trends?.nations[selected] : undefined;

  return (
    <Panel title={t.nations.title} sub={`${rows.length} / ${snap.nations.length}`}
      right={
        <Guide title={t.nations.title} sections={[
          { title: t.nations.guideTrends, body: [
            t.nations.trendHint.replace("{n}", String(trends?.points ?? "…")),
          ] },
          { title: t.nations.why, body: [t.nations.whyHint] },
          { title: t.nations.myPriorities, body: [t.nations.guidePriorities] },
        ]} />
      }>
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
            {METRICS.map((x) => <option key={x.key} value={x.key}>{t.nations.metric[x.key]}</option>)}
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

      <p className="text-faint text-[11.5px] mb-3">{t.nations.detailHint}</p>

      {selected && detail && (
        <Detail id={selected} name={snap.nations.find((n) => n.id === selected)?.name ?? selected}
          series={detail} onClose={() => setSelected(null)} />
      )}

      <DataTable rows={rows as unknown as Record<string, unknown>[]}
        columns={columns as unknown as Column<Record<string, unknown>>[]}
        initialSort="gdp" />
    </Panel>
  );
}
