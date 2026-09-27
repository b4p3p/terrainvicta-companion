"use client";

import { useApi } from "@/lib/api";
import { usePersistentState } from "@/lib/persist";
import { useSettings } from "@/lib/settings";
import { AttrIcon, Empty, MissionIcon, Panel, Tag, nf } from "@/components/ui";
import { Guide } from "@/components/Guide";

const ATTRS = ["Persuasion", "Investigation", "Espionage", "Command",
  "Administration", "Science", "Security"] as const;
type Attr = (typeof ATTRS)[number];
type Level = "mine" | "mission" | "details" | "basic" | "memory" | "location";

interface FactionRef { name: string; template: string | null; colors: { accent?: string | null } | null }
interface Row {
  id: number | string;
  mine: boolean;
  identified: boolean;
  level: Level;
  intel: number;
  highest: number;
  location: string | null;
  faction?: FactionRef;
  name?: string;
  typeName?: string;
  age?: number | null;
  nationality?: string | null;
  attributes?: Record<Attr, number>;
  estimated?: boolean;
  apparentLoyalty?: number | null;
  traits?: string[];
  orgs?: string[];
  mission?: { id: string; name: string | null; icon: string | null; target: string | null } | null;
  missionHidden?: boolean;
}
interface Data {
  gates: Record<"location" | "basic" | "details" | "mission", number>;
  missionPhase: boolean;
  councilors: Row[];
}

const UNKNOWN = "__unknown";
const isString = (v: unknown): v is string => typeof v === "string";
const isBool = (v: unknown): v is boolean => typeof v === "boolean";

/** Consiglieri di tutte le fazioni in una tabella: quello che il dossier di
 *  intelligence del gioco mostra, una fazione alla volta. */
export function FactionCouncilors() {
  const { t, game, live } = useSettings();
  const s = t.factions.councilors;
  const { data, error } = useApi<Data>(`/api/factions/councilors?lang=${game}`, [live.version, game]);
  const [only, setOnly] = usePersistentState<string>("factions.councilors.only", "", isString);
  const [showMine, setShowMine] = usePersistentState<boolean>("factions.councilors.mine", true, isBool);
  const [sortKey, setSortKey] = usePersistentState<string>("factions.councilors.sort", "", isString);
  if (error) return <Empty>{error}</Empty>;
  if (!data) return null;

  const factions = [...new Map(data.councilors.filter((r) => r.faction && !r.mine)
    .map((r) => [r.faction!.name, r.faction!])).values()];
  const anyUnknown = data.councilors.some((r) => !r.identified);

  const rows = data.councilors.filter((r) => {
    if (r.mine) return showMine;
    if (!only) return true;
    return only === UNKNOWN ? !r.identified : r.faction?.name === only;
  });
  // ordinamento per attributo: i nostri restano in cima, chi non ha numeri in fondo
  if (sortKey) {
    const v = (r: Row) => r.attributes?.[sortKey as Attr] ?? -1;
    rows.sort((a, b) => Number(b.mine) - Number(a.mine) || v(b) - v(a));
  }

  const chip = (key: string, label: React.ReactNode, accent?: string | null) => {
    const on = only === key;
    return (
      <button key={key} type="button" onClick={() => setOnly(on ? "" : key)} aria-pressed={on}
        className={`inline-flex items-center gap-1.5 text-[12px] px-2.5 py-[3px] -ml-px border
          ${on ? "border-sel-edge bg-sel text-ink relative z-[1]" : "border-edge-lit bg-control text-dim hover:text-ink"}`}>
        {accent !== undefined && <span className="inline-block w-[3px] h-[12px]"
          style={{ background: accent ?? "var(--edge-lit)" }} />}
        {label}
      </button>
    );
  };

  return (
    <Panel title={s.title}
      right={
        <Guide title={s.title} sections={[
          { body: [s.guideIntro] },
          { title: s.guideGatesTitle, body: [
            <ul key="g" className="list-disc pl-5">
              <li>{nf(data.gates.location, 2)} · {s.gate.location}</li>
              <li>{nf(data.gates.basic, 2)} · {s.gate.basic}</li>
              <li>{nf(data.gates.details, 2)} · {s.gate.details}</li>
              <li>{nf(data.gates.mission, 2)} · {s.gate.mission}</li>
            </ul>,
            s.guideMemory,
          ] },
          { title: s.guideEstimateTitle, body: [s.guideEstimate] },
        ]} />
      }>
      <p className="text-faint text-[11.5px] mb-3">{s.sub}</p>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <div className="flex flex-wrap">
          {chip("", s.all)}
          {factions.map((f) => chip(f.name, f.name, f.colors?.accent ?? null))}
          {anyUnknown && chip(UNKNOWN, s.unidentified, null)}
        </div>
        <label className="inline-flex items-center gap-1.5 text-[12px] text-dim ml-2 cursor-pointer">
          <input type="checkbox" checked={showMine} onChange={(e) => setShowMine(e.target.checked)} />
          {s.showMine}
        </label>
        {data.missionPhase && <span className="text-faint text-[11px] ml-2">{s.missionPhase}</span>}
      </div>

      <div className="overflow-x-auto">
        <table className="text-[12px] w-full border-collapse">
          <thead>
            <tr className="text-left text-faint">
              <th className="font-normal pb-1.5 pr-3">{s.faction}</th>
              <th className="font-normal pb-1.5 pr-3">{s.councilor}</th>
              <th className="font-normal pb-1.5 pr-3">{s.location}</th>
              {ATTRS.map((a) => {
                const on = sortKey === a;
                return (
                  <th key={a} className="font-normal pb-1.5 px-1 text-center">
                    <button type="button" onClick={() => setSortKey(on ? "" : a)} aria-pressed={on}
                      title={s.sortHint}
                      className={`inline-flex flex-col items-center gap-0.5 ${on ? "text-accent" : "hover:text-ink"}`}>
                      <AttrIcon attr={a} size={14} />
                      <span className="text-[10px]">{t.council.attrShort[a]}{on ? " ▼" : ""}</span>
                    </button>
                  </th>
                );
              })}
              <th className="font-normal pb-1.5 px-1 text-center" title={s.loyaltyHint}>
                <span className="inline-flex flex-col items-center gap-0.5">
                  <AttrIcon attr="Loyalty" size={14} /><span className="text-[10px]">{s.loyalty}</span>
                </span>
              </th>
              <th className="font-normal pb-1.5 px-3">{s.traitsOrgs}</th>
              <th className="font-normal pb-1.5 pr-3">{s.mission}</th>
              <th className="font-normal pb-1.5 text-right" title={s.intelHint}>intel</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={`border-t border-edge align-top ${r.mine ? "bg-sel/40" : ""}`}>
                <td className="py-1.5 pr-3 whitespace-nowrap">
                  {r.faction ? (
                    <span className="inline-flex items-center gap-1.5 border-l-2 pl-1.5"
                      style={{ borderColor: r.faction.colors?.accent ?? "var(--edge-lit)" }}>
                      {r.faction.name}{r.mine && <Tag tone="mine">{t.factions.you}</Tag>}
                    </span>
                  ) : (
                    <span className="border-l-2 border-dashed border-edge-lit pl-1.5 text-faint">?</span>
                  )}
                </td>
                <td className="py-1.5 pr-3">
                  {r.identified ? (
                    <>
                      <div className="whitespace-nowrap">{r.name}</div>
                      <div className="text-faint text-[11px] whitespace-nowrap">
                        {r.typeName}
                        {r.age != null && <> · {r.age} {s.years}</>}
                        {r.nationality && <> · {r.nationality}</>}
                      </div>
                    </>
                  ) : (
                    <span className="text-faint" title={s.unidentifiedHint}>{s.unidentified}</span>
                  )}
                </td>
                <td className="py-1.5 pr-3 whitespace-nowrap">
                  {r.location ?? <span className="text-faint" title={s.lastKnownHint}>—</span>}
                </td>
                {ATTRS.map((a) => {
                  const v = r.attributes?.[a];
                  return (
                    <td key={a} className={`py-1.5 px-1 text-center ${sortKey === a ? "bg-sel/30" : ""}`}>
                      {v == null ? <span className="text-faint">·</span>
                        : r.estimated
                          ? <span className="text-faint" title={s.estimateHint}>~{v}</span>
                          : v}
                    </td>
                  );
                })}
                <td className="py-1.5 px-1 text-center">
                  {r.apparentLoyalty == null ? <span className="text-faint">·</span>
                    : r.estimated
                      ? <span className="text-faint" title={s.estimateHint}>~{r.apparentLoyalty}</span>
                      : r.apparentLoyalty}
                </td>
                <td className="py-1.5 px-3 text-[11.5px]">
                  {r.traits?.length ? <div className="text-dim">{r.traits.join(" · ")}</div> : null}
                  {r.orgs?.length ? <div className="text-faint">{r.orgs.join(" · ")}</div> : null}
                  {!r.mine && r.identified && r.level !== "details" && r.level !== "mission" && (
                    <div className="text-faint text-[11px]">{s.lockedDetails}</div>
                  )}
                </td>
                <td className="py-1.5 pr-3 text-[11.5px]">
                  {r.mission ? (
                    <span className="inline-flex items-center gap-1.5">
                      <MissionIcon icon={r.mission.icon} size={16} />
                      <span>{r.mission.name}</span>
                      {r.mission.target && <span className="text-faint">→ {r.mission.target}</span>}
                    </span>
                  ) : r.missionHidden ? (
                    <span className="text-faint" title={s.missionPhaseHint}>{s.missionHidden}</span>
                  ) : r.mine || r.level === "mission" ? (
                    <span className="text-faint">—</span>
                  ) : (
                    <span className="text-faint" title={s.lockedHint}>
                      {s.locked} · {nf(r.intel, 2)}/{nf(data.gates.mission, 2)}
                    </span>
                  )}
                </td>
                <td className="py-1.5 text-right text-faint whitespace-nowrap">
                  {r.mine ? "" : nf(r.intel, 2)}
                  {!r.mine && r.highest > r.intel + 1e-6 && <> · max {nf(r.highest, 2)}</>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
