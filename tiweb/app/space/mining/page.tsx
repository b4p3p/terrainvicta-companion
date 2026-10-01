"use client";

import { useMemo, useState } from "react";
import { useApi } from "@/lib/api";
import { usePersistentState } from "@/lib/persist";
import { useSettings } from "@/lib/settings";
import { Empty, Panel, ResourceIcon, Stat, Tag, nf, pct } from "@/components/ui";
import { Guide } from "@/components/Guide";
import { Tip, TipRow } from "@/components/Tip";

type ResKey = "water" | "volatiles" | "metals" | "nobles" | "fissiles";
interface Res { id: ResKey; name: string; icon: string | null; price: number }
interface FactionRef { name: string; template: string | null; colors: { accent?: string | null } | null }
interface Yield { value: number; min?: number; max?: number }
interface Site {
  id: string; name: string; profile: string;
  body: { id: string; name: string; type: string | null; au: number | null };
  prospected: boolean; probeEnRoute: boolean; reachable: boolean;
  yields: Record<ResKey, Yield>; value: number;
  occupant: (FactionRef & { mine: boolean }) | null;
}
interface Priority { id: string; name: string; icon: string | null; bonus: number }
interface Org {
  id: number; name: string; tier: number; type: string | null; homeNation: string | null;
  bonuses: { miningBonus: number; MCBonus: number; spaceDevBonus: number; spaceflightBonus: number };
  priorities: Priority[];
  boost: number; missionControl: number;
  cost: { money: number; influence: number; ops: number; boost: number };
  where: "mine" | "market" | "rival";
  owner: (Partial<FactionRef> & { councilor?: string }) | null;
}
interface Mining {
  resources: Res[];
  sites: Site[];
  prospectedBodies: number;
  orgs: Org[];
  orgMiningBonus: number;
  labels: { miningBonus: string | null };
  thresholds: { prospected: number; councilor: number; faction: number };
}

type SortKey = "site" | "body" | "au" | "value" | "status" | "occupied" | ResKey;
// testo in ordine alfabetico, numeri dal piu' grande
const ASC_FIRST: SortKey[] = ["site", "body", "au", "occupied"];
const LIMIT = 40;

const digits = (v: number) => (v < 1 ? 2 : v < 10 ? 1 : 0);

/** Come si pesa il Valore: prezzi di mercato del salvataggio, oppure pesi
    scelti dall'utente (tutti a 1 = somma semplice delle rese). */
type Weights = Record<ResKey, number>;
interface ValueMode { mode: "market" | "custom"; weights: Weights }
const RES_KEYS: ResKey[] = ["water", "volatiles", "metals", "nobles", "fissiles"];
const DEFAULT_MODE: ValueMode = { mode: "market", weights: { water: 1, volatiles: 1, metals: 1, nobles: 1, fissiles: 1 } };
const isValueMode = (v: unknown): v is ValueMode => {
  const x = v as ValueMode;
  return !!x && (x.mode === "market" || x.mode === "custom") && !!x.weights
    && RES_KEYS.every((k) => typeof x.weights[k] === "number" && x.weights[k] >= 0);
};
const factor = (vm: ValueMode, r: Res) => (vm.mode === "market" ? r.price : vm.weights[r.id]);
const siteValue = (s: Site, res: Res[], vm: ValueMode) =>
  res.reduce((sum, r) => sum + s.yields[r.id].value * factor(vm, r), 0);

/** Resa di una risorsa: vera se il corpo e' prospettato, altrimenti la
    forchetta minima–massima, che e' quello che mostra il gioco. */
function YieldCell({ y, site, res }: { y: Yield; site: Site; res: Res }) {
  const { t } = useSettings();
  const m = t.mining;
  if (site.prospected) {
    return y.value < 0.005 ? <span className="text-faint">—</span> : <>{nf(y.value, digits(y.value))}</>;
  }
  const lo = y.min ?? 0, hi = y.max ?? 0;
  if (hi < 0.005) return <span className="text-faint">—</span>;
  return (
    <Tip title={`${res.name} · ${site.name}`} width={300} content={
      <>
        <TipRow strong label={m.range} value={`${nf(lo, 2)} – ${nf(hi, 2)}`} />
        <TipRow label={m.expected} value={nf(y.value, 2)} />
        <p className="m-0 mt-1.5 text-faint">{m.estimateHint}</p>
      </>
    }>
      <span className="text-dim">{nf(lo, digits(hi))}–{nf(hi, digits(hi))}</span>
    </Tip>
  );
}

function ValueCell({ site, res, vm, value }: { site: Site; res: Res[]; vm: ValueMode; value: number }) {
  const { t } = useSettings();
  const m = t.mining;
  return (
    <Tip title={`${site.name} · ${m.value}`} width={320} content={
      <>
        {res.map((r) => {
          const v = site.yields[r.id].value, f = factor(vm, r);
          return v ? <TipRow key={r.id} label={`${r.name} ${nf(v, 2)} × ${nf(f, vm.mode === "market" ? 1 : 2)}`} value={nf(v * f, 1)} /> : null;
        })}
        <TipRow strong label={m.value} value={nf(value, 1)} />
        <p className="m-0 mt-1.5 text-faint">{vm.mode === "market" ? m.valueHint : m.valueHintCustom}</p>
      </>
    }>
      <span className={site.prospected ? "text-ink" : "text-dim"}>{site.prospected ? "" : "≈ "}{nf(value, value < 10 ? 1 : 0)}</span>
    </Tip>
  );
}

function Status({ s }: { s: Site }) {
  const { t } = useSettings();
  const m = t.mining;
  if (!s.reachable) return <Tip title={m.unreachable} content={m.unreachableHint}><span className="text-faint">{m.unreachable}</span></Tip>;
  if (s.prospected) return <span className="text-good">{m.prospected}</span>;
  if (s.probeEnRoute) return <span className="text-warn">{m.probe}</span>;
  return <Tip title={m.estimate} content={m.estimateHint}><span className="text-dim">{m.estimate}</span></Tip>;
}

function FactionName({ f, extra }: { f: Partial<FactionRef>; extra?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 border-l-2 pl-1.5 whitespace-nowrap"
      style={{ borderColor: f.colors?.accent ?? "var(--edge-lit)" }}>
      {f.name}{extra}
    </span>
  );
}

/** Intestazione ordinabile: un clic ordina, il secondo inverte. */
function Th({ k, sort, asc, onSort, right, last, hint, children }: {
  k: SortKey; sort: SortKey; asc: boolean; onSort: (k: SortKey) => void;
  right?: boolean; last?: boolean; hint?: string; children: React.ReactNode;
}) {
  const active = k === sort;
  const button = (
    <button type="button" onClick={() => onSort(k)}
      className={`whitespace-nowrap hover:text-ink ${active ? "text-accent" : ""}`}>
      {children}{active ? (asc ? " ▲" : " ▼") : ""}
    </button>
  );
  return (
    <th className={`font-normal pb-1.5 ${last ? "" : "pr-3"} ${right ? "text-right" : ""}`}
      aria-sort={active ? (asc ? "ascending" : "descending") : undefined}>
      {hint ? <Tip title={children} content={hint}>{button}</Tip> : button}
    </th>
  );
}

function Sites({ data }: { data: Mining }) {
  const { t } = useSettings();
  const m = t.mining;
  const [sort, setSort] = useState<SortKey>("value");
  const [asc, setAsc] = useState(false);
  const sortBy = (k: SortKey) => {
    if (k === sort) setAsc(!asc);
    else { setSort(k); setAsc(ASC_FIRST.includes(k)); }
  };
  const [q, setQ] = useState("");
  const [reachable, setReachable] = useState(true);
  const [hideOccupied, setHideOccupied] = useState(false);
  const [all, setAll] = useState(false);
  const [vm, setVm] = usePersistentState<ValueMode>("mining.value", DEFAULT_MODE, isValueMode);
  const setWeight = (k: ResKey, v: number) =>
    setVm({ ...vm, weights: { ...vm.weights, [k]: Number.isFinite(v) && v >= 0 ? v : 0 } });

  const values = useMemo(
    () => new Map(data.sites.map((s) => [s.id, siteValue(s, data.resources, vm)])),
    [data.sites, data.resources, vm]);

  const rows = useMemo(() => {
    const val = (s: Site) => values.get(s.id) ?? 0;
    const needle = q.trim().toLowerCase();
    const xs = data.sites.filter((s) =>
      (!reachable || s.reachable)
      && (!hideOccupied || !s.occupant)
      && (!needle || s.name.toLowerCase().includes(needle) || s.body.name.toLowerCase().includes(needle)));
    const key = (s: Site): number | string => {
      switch (sort) {
        case "site": return s.name;
        case "body": return s.body.name;
        case "au": return s.body.au ?? Infinity;
        case "value": return val(s);
        case "status": return s.prospected ? 3 : s.probeEnRoute ? 2 : s.reachable ? 1 : 0;
        case "occupied": return s.occupant?.name ?? "￿";   // i liberi in fondo
        default: return s.yields[sort].value;
      }
    };
    const dir = asc ? 1 : -1;
    return xs.sort((a, b) => {
      const ka = key(a), kb = key(b);
      const c = typeof ka === "string" ? ka.localeCompare(kb as string) : ka - (kb as number);
      return c * dir || val(b) - val(a);
    });
  }, [data.sites, sort, asc, q, reachable, hideOccupied, values]);
  const shown = all ? rows : rows.slice(0, LIMIT);
  const th = { sort, asc, onSort: sortBy };

  return (
    <Panel title={m.sitesTitle}>
      <div className="flex gap-2.5 flex-wrap items-center mb-3">
        <input type="search" placeholder={m.filter} value={q}
          onChange={(e) => setQ(e.target.value)} className="min-w-[220px]" />
        <label className="flex items-center gap-1.5 text-dim text-[12.5px] cursor-pointer">
          <input type="checkbox" checked={reachable} onChange={(e) => setReachable(e.target.checked)} className="p-0" />
          {m.onlyReachable}
        </label>
        <label className="flex items-center gap-1.5 text-dim text-[12.5px] cursor-pointer">
          <input type="checkbox" checked={hideOccupied} onChange={(e) => setHideOccupied(e.target.checked)} className="p-0" />
          {m.hideOccupied}
        </label>
        <label className="flex items-center gap-1.5 text-dim text-[12.5px]">
          {m.valueBy}
          <select value={vm.mode} onChange={(e) => setVm({ ...vm, mode: e.target.value as ValueMode["mode"] })}>
            <option value="market">{m.valueMarket}</option>
            <option value="custom">{m.valueCustom}</option>
          </select>
        </label>
        {vm.mode === "market" ? (
          <Tip title={m.prices} content={
            <>{data.resources.map((r) => <TipRow key={r.id} label={r.name} value={nf(r.price, 2)} />)}</>
          }>
            <span className="text-faint text-[11.5px] underline decoration-dotted">{m.prices}</span>
          </Tip>
        ) : (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {data.resources.map((r) => (
              <label key={r.id} className="flex items-center gap-1 text-dim text-[12px]">
                {r.icon ? <ResourceIcon icon={r.icon} size={12} /> : r.name}
                <input type="number" min={0} step={0.5} value={vm.weights[r.id]}
                  aria-label={r.name} className="w-14 p-0.5 text-right"
                  onChange={(e) => setWeight(r.id, parseFloat(e.target.value))} />
              </label>
            ))}
            <button type="button" className="text-accent text-[12px] hover:text-ink"
              onClick={() => setVm({ ...vm, weights: Object.fromEntries(
                data.resources.map((r) => [r.id, Math.round(r.price * 100) / 100])) as Weights })}>
              {m.weightsFromPrices}
            </button>
            <button type="button" className="text-accent text-[12px] hover:text-ink"
              onClick={() => setVm({ ...vm, weights: DEFAULT_MODE.weights })}>
              {m.weightsReset}
            </button>
            <Tip title={m.valueCustom} content={m.weightsHint}>
              <span className="text-faint text-[11.5px] underline decoration-dotted">?</span>
            </Tip>
          </span>
        )}
      </div>

      {!rows.length ? <Empty>{m.none}</Empty> : (
        <div className="overflow-x-auto">
          <table className="text-[12px] w-full border-collapse">
            <thead>
              <tr className="text-left text-faint">
                <Th k="site" {...th}>{m.site}</Th>
                <Th k="body" {...th}>{m.body}</Th>
                <Th k="au" right hint={m.auHint} {...th}>{m.au}</Th>
                {data.resources.map((r) => (
                  <Th key={r.id} k={r.id} right hint={m.yieldHint} {...th}>{r.name}</Th>
                ))}
                <Th k="value" right hint={vm.mode === "market" ? m.valueHint : m.valueHintCustom} {...th}>{m.value}</Th>
                <Th k="status" {...th}>{m.status}</Th>
                <Th k="occupied" last {...th}>{m.occupied}</Th>
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => (
                <tr key={s.id} className={`border-t border-edge align-top ${s.occupant?.mine ? "bg-sel/40" : ""}`}>
                  <td className="py-1.5 pr-3">
                    <div className="whitespace-nowrap">{s.name}</div>
                    <div className="text-faint text-[11px]">{s.profile}</div>
                  </td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{s.body.name}</td>
                  <td className="py-1.5 pr-3 text-right text-faint">{s.body.au != null ? nf(s.body.au, s.body.au < 10 ? 2 : 0) : "—"}</td>
                  {data.resources.map((r) => (
                    <td key={r.id} className="py-1.5 pr-3 text-right whitespace-nowrap">
                      <YieldCell y={s.yields[r.id]} site={s} res={r} />
                    </td>
                  ))}
                  <td className="py-1.5 pr-3 text-right whitespace-nowrap"><ValueCell site={s} res={data.resources} vm={vm} value={values.get(s.id) ?? 0} /></td>
                  <td className="py-1.5 pr-3 whitespace-nowrap"><Status s={s} /></td>
                  <td className="py-1.5">
                    {s.occupant ? <FactionName f={s.occupant} extra={s.occupant.mine && <Tag tone="mine">{t.space.you}</Tag>} /> : <span className="text-faint">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > LIMIT && (
        <button type="button" className="mt-2 text-accent text-[12px]" onClick={() => setAll(!all)}>
          {all ? m.showLess : m.showAll.replace("{n}", String(rows.length))}
        </button>
      )}
    </Panel>
  );
}

function Orgs({ data }: { data: Mining }) {
  const { t } = useSettings();
  const m = t.mining;
  if (!data.orgs.length) return <Panel title={m.orgsTitle}><Empty>{m.noOrgs}</Empty></Panel>;
  return (
    <Panel title={m.orgsTitle}>
      <p className="text-faint text-[11.5px] mb-2">{m.orgsSub}</p>
      <div className="overflow-x-auto">
        <table className="text-[12px] w-full border-collapse">
          <thead>
            <tr className="text-left text-faint">
              <th className="font-normal pb-1.5 pr-3">{m.org}</th>
              <th className="font-normal pb-1.5 pr-3">{m.where}</th>
              <th className="font-normal pb-1.5 pr-3 text-right">{m.tier}</th>
              <th className="font-normal pb-1.5 pr-3 text-right">
                {data.labels.miningBonus
                  ? <Tip title={m.mining} content={data.labels.miningBonus}>{m.mining}</Tip>
                  : m.mining}
              </th>
              <th className="font-normal pb-1.5 pr-3">{m.priorities}</th>
              <th className="font-normal pb-1.5 pr-3 text-right">{m.boost}</th>
              <th className="font-normal pb-1.5 pr-3 text-right">{m.mc}</th>
              <th className="font-normal pb-1.5">{m.cost}</th>
            </tr>
          </thead>
          <tbody>
            {data.orgs.map((o) => (
              <tr key={o.id} className={`border-t border-edge align-top ${o.where === "mine" ? "bg-sel/40" : ""}`}>
                <td className="py-1.5 pr-3">
                  <div>{o.name}</div>
                  {o.homeNation && <div className="text-faint text-[11px]">{o.homeNation}</div>}
                </td>
                <td className="py-1.5 pr-3">
                  {o.where === "mine" && (
                    <span className="inline-flex items-center gap-1.5"><Tag tone="mine">{m.yours}</Tag>
                      <span className="text-dim">{o.owner?.councilor ?? m.unassigned}</span></span>
                  )}
                  {o.where === "market" && <Tag tone="free">{m.market}</Tag>}
                  {o.where === "rival" && o.owner && (
                    <div className="flex flex-col gap-0.5">
                      <FactionName f={o.owner} />
                      <span className="text-dim text-[11px]">{o.owner.councilor ?? m.unassigned}</span>
                      <Tip title={m.takeover} content={m.takeoverHint}><Tag tone="warn">{m.takeover}</Tag></Tip>
                    </div>
                  )}
                </td>
                <td className="py-1.5 pr-3 text-right">{o.tier}</td>
                <td className={`py-1.5 pr-3 text-right ${o.bonuses.miningBonus ? "text-good" : "text-faint"}`}>
                  {o.bonuses.miningBonus ? `+${pct(o.bonuses.miningBonus, 0)}` : "—"}
                </td>
                <td className="py-1.5 pr-3">
                  {o.priorities.length ? (
                    <span className="inline-flex flex-wrap gap-x-2.5 gap-y-0.5">
                      {o.priorities.map((p) => (
                        <span key={p.id} className="inline-flex items-center gap-1 whitespace-nowrap">
                          {p.icon && <ResourceIcon icon={p.icon} size={12} />}
                          <span className="text-dim">{p.name}</span> +{pct(p.bonus, 0)}
                        </span>
                      ))}
                    </span>
                  ) : <span className="text-faint">—</span>}
                </td>
                <td className={`py-1.5 pr-3 text-right ${o.boost ? "text-good" : "text-faint"}`}>
                  {o.boost ? `+${nf(o.boost, 1)}` : "—"}
                </td>
                <td className={`py-1.5 pr-3 text-right ${o.missionControl ? "text-good" : "text-faint"}`}>
                  {o.missionControl ? `+${nf(o.missionControl, 0)}` : "—"}
                </td>
                <td className="py-1.5 whitespace-nowrap">
                  {o.where === "market" ? (
                    <span className="inline-flex gap-2.5">
                      {o.cost.influence > 0 && <span><ResourceIcon icon="ICO_influence" size={12} /> {nf(o.cost.influence, 0)}</span>}
                      {o.cost.money > 0 && <span><ResourceIcon icon="ICO_currency" size={12} /> {nf(o.cost.money, 0)}</span>}
                    </span>
                  ) : <span className="text-faint">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export default function MiningPage() {
  const { t, game, live } = useSettings();
  const { data, error } = useApi<Mining>(`/api/mining?lang=${game}`, [live.version, game]);
  if (error) return <Empty>{error}</Empty>;
  if (!data) return <Empty>{t.common.loading}</Empty>;
  const m = t.mining;
  const reachable = data.sites.filter((s) => s.reachable).length;

  return (
    <>
      <Panel title={m.title}
        right={
          <Guide title={m.title} sections={[
            { body: [m.guideIntro] },
            { title: m.guideValueTitle, body: [m.guideValue] },
            { title: m.guideOrgsTitle, body: [m.guideOrgs
              .replace("{councilor}", nf(data.thresholds.councilor, 2))
              .replace("{faction}", nf(data.thresholds.faction, 2))] },
          ]} />
        }>
        <p className="text-faint text-[11.5px] mb-3">{m.sub}</p>
        <div className="flex flex-wrap gap-2">
          <Stat label={m.statProspected} value={data.prospectedBodies} />
          <Stat label={m.statReachable} value={`${reachable}/${data.sites.length}`} />
          <Stat label={m.statBonus} tone={data.orgMiningBonus ? "mine" : "accent"}
            value={`+${pct(data.orgMiningBonus, 0)}`} />
        </div>
      </Panel>
      <Sites data={data} />
      <Orgs data={data} />
    </>
  );
}
