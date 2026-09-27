"use client";

import { useApi } from "@/lib/api";
import { useSettings } from "@/lib/settings";
import { Empty, Panel, ResourceIcon, Stat, Tag, nf } from "@/components/ui";
import { Guide } from "@/components/Guide";

interface Res { id: string; name: string; icon: string | null }
interface Amount extends Res { amount: number }
interface FactionRef { name: string; template: string | null; colors: { accent?: string | null } | null }
interface Loc {
  kind: "orbit" | "site"; id: string; name: string;
  body: { id: string; name: string };
}
interface HabModule {
  id: string; name: string; core: boolean; done: boolean; powered: boolean; missionControl: number;
}
interface Hab {
  id: number; name: string; type: "Station" | "Base"; tier: number; mine: boolean;
  faction: FactionRef; location: Loc | null; coreDone: boolean; modules: HabModule[];
}
interface Orbit {
  id: string; name: string; altitude: number | null; synchronous: boolean;
  capacity: number; interface: boolean; irradiated: number; used: number;
  habs: { name: string; faction: string; colors: FactionRef["colors"]; mine: boolean; coreDone: boolean }[];
}
interface Offer {
  id: string; name: string; core: boolean; habType: "Station" | "Base" | "Any"; tier: number;
  mass: number; boost: number; days: number; power: number; missionControl: number;
  crew: number; upkeep: Amount[]; income: Amount[];
}
interface Space {
  intelToSee: number;
  tonsPerBoost: number;
  resources: {
    boost: Res & { stock: number; monthly: number };
    missionControl: Res & { capacity: number | null; used: number };
    money: Res & { stock: number; monthly: number };
  };
  habs: Hab[];
  earthOrbits: Orbit[];
  modules: Offer[];
}

/** Filetto col colore della fazione, come nella scheda Fazioni. */
function FactionName({ f, mine }: { f: { name: string; colors: FactionRef["colors"] }; mine: boolean }) {
  const { t } = useSettings();
  return (
    <span className="inline-flex items-center gap-1.5 border-l-2 pl-1.5 whitespace-nowrap"
      style={{ borderColor: f.colors?.accent ?? "var(--edge-lit)" }}>
      {f.name}
      {mine && <Tag tone="mine">{t.space.you}</Tag>}
    </span>
  );
}

function Amounts({ xs }: { xs: Amount[] }) {
  if (!xs.length) return <span className="text-faint">—</span>;
  return (
    <span className="inline-flex flex-wrap gap-x-2.5 gap-y-0.5">
      {xs.map((x) => (
        <span key={x.id} className="inline-flex items-center gap-1 whitespace-nowrap" title={x.name}>
          {x.icon ? <ResourceIcon icon={x.icon} size={12} /> : <span className="text-faint">{x.name}</span>}
          {nf(x.amount, x.amount < 0.05 ? 3 : x.amount < 1 ? 1 : 0)}
        </span>
      ))}
    </span>
  );
}

/** Moduli raggruppati per nome: «Collettore solare ×2», i cantieri a parte. */
function ModuleList({ mods }: { mods: HabModule[] }) {
  const { t } = useSettings();
  const groups = new Map<string, { name: string; done: number; building: number; core: boolean }>();
  for (const m of mods) {
    const g = groups.get(m.id) ?? { name: m.name, done: 0, building: 0, core: m.core };
    if (m.done) g.done++; else g.building++;
    groups.set(m.id, g);
  }
  return (
    <span className="inline-flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px]">
      {[...groups.values()].sort((a, b) => Number(b.core) - Number(a.core)).map((g) => (
        <span key={g.name} className={`whitespace-nowrap ${g.core ? "text-ink" : "text-dim"}`}>
          {g.name}
          {g.done > 1 && <> ×{g.done}</>}
          {g.building > 0 && (
            <span className="text-warn"> {g.done ? `+${g.building}` : g.building > 1 ? `×${g.building}` : ""} {t.space.inProgress}</span>
          )}
        </span>
      ))}
    </span>
  );
}

export default function SpacePage() {
  const { t, game, live } = useSettings();
  const { data, error } = useApi<Space>(`/api/space?lang=${game}`, [live.version, game]);
  if (error) return <Empty>{error}</Empty>;
  if (!data) return <Empty>{t.common.loading}</Empty>;
  const s = t.space;
  const { boost, missionControl: mc, money } = data.resources;
  const mcFree = mc.capacity == null ? null : mc.capacity - mc.used;

  return (
    <>
      <Panel title={s.title}
        right={
          <Guide title={s.title} sections={[
            { body: [s.guideIntro.replace("{need}", nf(data.intelToSee, 1))] },
            { title: s.guideMcTitle, body: [s.guideMc] },
            { title: s.guideBoostTitle, body: [s.guideBoost] },
          ]} />
        }>
        <p className="text-faint text-[11.5px] mb-3">{s.sub}</p>
        <div className="flex flex-wrap gap-2">
          <Stat label={boost.name} value={
            <span className="inline-flex items-baseline gap-2">
              <ResourceIcon icon={boost.icon} size={16} />{nf(boost.stock, 2)}
              <span className="text-[12px] text-dim">+{nf(boost.monthly, 2)}{s.perMonth}</span>
            </span>} />
          <Stat label={mc.name} tone={mcFree != null && mcFree <= 0 ? "warn" : "accent"} value={
            <span className="inline-flex items-baseline gap-2">
              <ResourceIcon icon={mc.icon} size={16} />
              {mc.capacity == null ? "—" : `${nf(mc.used, 0)}/${nf(mc.capacity, 0)}`}
              {mcFree != null && <span className="text-[12px] text-dim">{nf(mcFree, 0)} {s.free}</span>}
            </span>} />
          <Stat label={money.name} value={
            <span className="inline-flex items-baseline gap-2">
              <ResourceIcon icon={money.icon} size={16} />{nf(money.stock, 0)}
              <span className="text-[12px] text-dim">+{nf(money.monthly, 0)}{s.perMonth}</span>
            </span>} />
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2 items-start">
        <Panel title={s.orbitsTitle} className="mb-0">
          <div className="overflow-x-auto">
            <table className="text-[12px] w-full border-collapse">
              <thead>
                <tr className="text-left text-faint">
                  <th className="font-normal pb-1.5 pr-3">{s.orbit}</th>
                  <th className="font-normal pb-1.5 pr-3 text-right">{s.altitude}</th>
                  <th className="font-normal pb-1.5 pr-3 text-right">{s.slots}</th>
                  <th className="font-normal pb-1.5 pr-3" title={s.ifaceHint}>{s.iface}</th>
                  <th className="font-normal pb-1.5 pr-3 text-right">{s.radiation}</th>
                  <th className="font-normal pb-1.5">{s.occupants}</th>
                </tr>
              </thead>
              <tbody>
                {data.earthOrbits.map((o) => {
                  const full = o.used >= o.capacity;
                  return (
                    <tr key={o.id} className={`border-t border-edge align-top ${o.interface ? "" : "text-dim"}`}>
                      <td className="py-1.5 pr-3 whitespace-nowrap">{o.name}</td>
                      <td className="py-1.5 pr-3 text-right whitespace-nowrap">
                        {o.altitude != null ? `${nf(o.altitude, 0)} km` : <span className="text-faint">{s.synch}</span>}
                      </td>
                      <td className="py-1.5 pr-3 text-right whitespace-nowrap">
                        <span className={full ? "text-bad" : ""}>{o.used}/{o.capacity}</span>
                        {full && <span className="text-bad text-[11px]"> {s.full}</span>}
                      </td>
                      <td className="py-1.5 pr-3" title={s.ifaceHint}>{o.interface ? "✓" : ""}</td>
                      <td className={`py-1.5 pr-3 text-right ${o.irradiated > 1 ? "text-bad" : "text-faint"}`}>
                        ×{nf(o.irradiated, 0)}
                      </td>
                      <td className="py-1.5">
                        <div className="flex flex-col gap-0.5">
                          {o.habs.map((h) => (
                            <span key={h.name} className="inline-flex items-center gap-2">
                              <FactionName f={{ name: h.faction, colors: h.colors }} mine={h.mine} />
                              <span className="text-dim">{h.name}</span>
                              {!h.coreDone && <span className="text-warn text-[11px]">{s.building}</span>}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title={s.modulesTitle} className="mb-0">
          <p className="text-faint text-[11.5px] mb-2">{s.modulesSub}</p>
          <div className="overflow-x-auto">
            <table className="text-[12px] w-full border-collapse">
              <thead>
                <tr className="text-left text-faint">
                  <th className="font-normal pb-1.5 pr-3">{s.module}</th>
                  <th className="font-normal pb-1.5 pr-3 text-right">{s.mass}</th>
                  <th className="font-normal pb-1.5 pr-3 text-right" title={s.boostEstHint}>{s.boostEst}</th>
                  <th className="font-normal pb-1.5 pr-3 text-right">{s.days}</th>
                  <th className="font-normal pb-1.5 pr-3 text-right" title={s.powerHint}>{s.power}</th>
                  <th className="font-normal pb-1.5 pr-3 text-right">{s.mc}</th>
                  <th className="font-normal pb-1.5 pr-3" title={s.upkeepHint}>{s.upkeep}</th>
                  <th className="font-normal pb-1.5">{s.yields}</th>
                </tr>
              </thead>
              <tbody>
                {data.modules.map((m) => (
                  <tr key={m.id} className="border-t border-edge align-top">
                    <td className="py-1.5 pr-3">
                      <span className={m.core ? "text-ink" : ""}>{m.name}</span>
                      {m.core && <> <Tag>{s.core}</Tag></>}
                      {m.habType === "Station" && !m.core && <> <Tag>{s.stationOnly}</Tag></>}
                      {m.habType === "Base" && <> <Tag>{s.baseOnly}</Tag></>}
                    </td>
                    <td className="py-1.5 pr-3 text-right whitespace-nowrap">{nf(m.mass, 0)} t</td>
                    <td className="py-1.5 pr-3 text-right whitespace-nowrap" title={s.boostEstHint}>
                      <span className={m.boost > boost.stock ? "text-bad" : ""}>{nf(m.boost, 1)}</span>
                    </td>
                    <td className="py-1.5 pr-3 text-right">{m.days}</td>
                    <td className={`py-1.5 pr-3 text-right ${m.power > 0 ? "text-good" : m.power < 0 ? "text-dim" : "text-faint"}`}>
                      {m.power > 0 ? "+" : ""}{nf(m.power, 0)}
                    </td>
                    <td className={`py-1.5 pr-3 text-right ${m.missionControl < 0 ? "text-warn" : "text-faint"}`}>
                      {m.missionControl ? nf(m.missionControl, 0) : "—"}
                    </td>
                    <td className="py-1.5 pr-3"><Amounts xs={m.upkeep} /></td>
                    <td className="py-1.5"><Amounts xs={m.income} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <Panel title={s.habsTitle} className="mt-4">
        <div className="overflow-x-auto">
          <table className="text-[12px] w-full border-collapse">
            <thead>
              <tr className="text-left text-faint">
                <th className="font-normal pb-1.5 pr-3">{s.faction}</th>
                <th className="font-normal pb-1.5 pr-3">{s.habitat}</th>
                <th className="font-normal pb-1.5 pr-3">{s.where}</th>
                <th className="font-normal pb-1.5 pr-3 text-right">{s.tier}</th>
                <th className="font-normal pb-1.5 pr-3">{s.status}</th>
                <th className="font-normal pb-1.5">{s.modules}</th>
              </tr>
            </thead>
            <tbody>
              {data.habs.map((h) => (
                <tr key={h.id} className={`border-t border-edge align-top ${h.mine ? "bg-sel/40" : ""}`}>
                  <td className="py-1.5 pr-3"><FactionName f={h.faction} mine={h.mine} /></td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{h.name}</td>
                  <td className="py-1.5 pr-3">
                    {h.location ? (
                      <>
                        <div>{h.location.name}</div>
                        <div className="text-faint text-[11px]">{h.location.body.name}</div>
                      </>
                    ) : <span className="text-faint">—</span>}
                  </td>
                  <td className="py-1.5 pr-3 text-right">{h.tier}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">
                    {h.coreDone ? <span className="text-dim">{s.operational}</span>
                      : <span className="text-warn">{s.building}</span>}
                  </td>
                  <td className="py-1.5"><ModuleList mods={h.modules} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
