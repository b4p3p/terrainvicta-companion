"use client";

import { useMemo } from "react";
import { usePersistentState } from "@/lib/persist";
import { useSettings } from "@/lib/settings";
import { AttrIcon, MissionIcon, Panel, Tag } from "@/components/ui";
import { Combo } from "@/components/Combo";
import type { Councilor, MissionInfo, MissionSource, Org } from "@/lib/types";

const isString = (v: unknown): v is string => typeof v === "string";

/** Una missione -> chi del consiglio ce l'ha, da dove, e a chi darebbe di
 *  piu' un'org che la concede. Tutto dal payload del consiglio: nessun dato
 *  nuovo, solo messo in fila. */
export function MissionFinder({ team, missions, market }: {
  team: Councilor[];
  missions: { covered: MissionInfo[]; missing: MissionInfo[] };
  market: Org[];
}) {
  const { t } = useSettings();
  const all = useMemo(
    () => [...missions.covered, ...missions.missing].sort((a, b) => a.name.localeCompare(b.name)),
    [missions]);
  const [picked, setPicked] = usePersistentState("council.finder", "", isString);
  const m = all.find((x) => x.id === picked) ?? null;

  const rows = useMemo(() => {
    if (!m) return [];
    return team.map((c) => {
      const entry = c.missionList.find((x) => x.id === m.id);
      // le standard non stanno in missionList: le ha chiunque
      const has = c.missions.includes(m.id);
      const sources: MissionSource[] = entry?.sources
        ?? (has ? [{ kind: "base", id: null, name: null }] : []);
      return { c, has, sources, value: m.attribute ? c.attributes[m.attribute] ?? 0 : null };
    }).sort((a, b) => Number(b.has) - Number(a.has) || (b.value ?? 0) - (a.value ?? 0));
  }, [m, team]);

  const orgPick = m?.attribute
    ? rows.filter((r) => !r.has).reduce<(typeof rows)[number] | null>(
        (best, r) => (r.value ?? 0) > (best?.value ?? -1) ? r : best, null)
    : null;
  const granting = m ? market.filter((o) => o.missionsGranted.includes(m.id)) : [];

  return (
    <Panel title={t.council.finder} sub={t.council.finderHint}>
      <div className="flex items-center gap-3 flex-wrap mb-2">
        <Combo value={m?.id ?? null} onChange={setPicked} width={320}
          placeholder={t.council.finderPick}
          options={all.map((x) => ({ id: x.id, label: x.name, hint: x.attributeShort ?? undefined }))} />
        {m && (
          <span className="flex items-center gap-2 text-[12.5px]">
            <MissionIcon icon={m.icon} size={20} title={m.name} />
            {m.attribute
              ? <span className="inline-flex items-center gap-1">
                  <AttrIcon attr={m.attribute} size={14} title={m.attributeShort ?? ""} />
                  {m.attributeShort}
                </span>
              : <span className="text-faint">{t.council.finderNoAttr}</span>}
          </span>
        )}
      </div>

      {m && (
        <>
          <div className="flex flex-col gap-[2px]">
            {rows.map(({ c, has, sources, value }) => (
              <div key={c.id}
                className={`flex items-center gap-3 flex-wrap bg-panel border px-3 py-1.5 text-[12.5px] ${
                  has ? "border-good/40" : "border-edge"}`}>
                <span className="font-semibold w-44 truncate">{c.name}</span>
                <span className="text-dim w-36 truncate">{c.typeName}</span>
                {value != null && (
                  <span className="inline-flex items-center gap-1 w-14">
                    <AttrIcon attr={m.attribute} size={13} title={m.attributeShort ?? ""} />
                    <span className="font-semibold">{value}</span>
                  </span>
                )}
                {has
                  ? <span className="flex gap-1 flex-wrap items-center">
                      <Tag tone="mine">{t.council.finderHas}</Tag>
                      {sources.map((s, i) => (
                        <span key={i} className="text-dim text-[11.5px]">
                          {t.council.finderSource[s.kind]}{s.name && s.kind !== "type" ? `: ${s.name}` : ""}
                        </span>
                      ))}
                    </span>
                  : <span className="flex gap-1 items-center">
                      <span className="text-faint">{t.council.finderLacks}</span>
                      {orgPick?.c.id === c.id && (
                        <span title={t.council.finderOrgPickHint}>
                          <Tag tone="free">{t.council.finderOrgPick}</Tag>
                        </span>
                      )}
                    </span>}
              </div>
            ))}
          </div>

          <div className="mt-2 text-[12px]">
            <span className="text-dim">{t.council.finderMarket}: </span>
            {granting.length === 0
              ? <span className="text-faint">{t.council.finderMarketNone}</span>
              : granting.map((o, i) => (
                  <span key={o.id}>
                    {i > 0 && " · "}
                    <span className={o.affordable ? "text-good" : ""}>{o.name}</span>
                    <span className="text-faint">
                      {" "}({o.eligible?.length ? `${t.council.canHold}: ${o.eligible.join(", ")}` : t.council.nobody})
                    </span>
                  </span>
                ))}
          </div>
        </>
      )}
    </Panel>
  );
}
