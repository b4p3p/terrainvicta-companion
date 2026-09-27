"use client";

/* La corsa alle tecnologie globali: chi la vince a questo ritmo e se il tuo
   distacco cresce o cala. I contributi delle fazioni il gioco li mostra
   (schermata Ricerca); qui c'e' in piu' quanto si sono mossi dall'ultimo
   salvataggio e la proiezione con la regola del gioco (GetExpectedWinner),
   ma col ritmo osservato: i pesi di ricerca degli altri non si vedono. */

import Link from "next/link";
import { useApi } from "@/lib/api";
import { useSettings } from "@/lib/settings";
import { Empty, Panel, nf } from "@/components/ui";

interface RaceRow {
  id: string;
  name: string;
  mine: boolean;
  value: number;
  delta?: number;
  projected: number | null;
}

interface Race {
  rows: RaceRow[];
  daysLeft: number | null;
  winner: string;
  locked: boolean;
  paced: boolean;
  myRank?: number;
  gap?: number;
  gapTo?: string;
  gapChange?: number;
}

interface Slot {
  slot: number;
  kind: "tech" | "project";
  id: string;
  name: string;
  cost: number;
  accumulated: number;
  weight: number;
  share: number;
  delta?: number;
  daysLeft?: number | null;
  race?: Race;
}

interface Research {
  slots: Slot[];
  previous: { date: string; days: number | null } | null;
}

const signed = (v: number, d = 0) => (v > 0 ? "+" : v < 0 ? "−" : "") + nf(Math.abs(v), d);
const fill = (s: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), s);

export function ResearchPanel() {
  const { t, game, live } = useSettings();
  const r = t.research;
  const { data } = useApi<Research>(`/api/research?lang=${game}`, [live.version, game]);
  const prev = data?.previous;
  const techs = data?.slots.filter((s) => s.kind === "tech") ?? [];
  const projects = data?.slots.filter((s) => s.kind === "project") ?? [];

  return (
    <Panel title={r.title}
      right={<Link href="/techs" className="text-accent text-[12px] hover:underline">{r.choose}</Link>}
      sub={prev ? fill(r.since, { date: prev.date.split(" ")[0], days: prev.days ?? "?" }) : r.noPrevious}>
      {!data?.slots.length ? <Empty>{t.common.noData}</Empty> : (
        <div className="flex flex-col gap-4">
          {techs.map((s) => <TechRace key={s.id} s={s} days={prev?.days ?? null} />)}

          {projects.length > 0 && (
            <div className="border-t border-edge pt-3 flex flex-col gap-1.5">
              <div className="text-faint text-[10.5px] uppercase tracking-[.06em]">{r.projects}</div>
              {projects.map((p) => (
                <div key={p.id} className="flex gap-2 text-[12px] items-baseline">
                  <span className="truncate">{p.name}</span>
                  <Ticks s={p} />
                  <span className="ml-auto text-dim shrink-0">
                    {p.weight === 0 ? <span className="text-bad">{r.idle}</span> : <>
                      {nf(p.accumulated, 0)}/{p.cost}
                      {p.delta != null && <span className="text-good"> {signed(p.delta, 1)}</span>}
                      {p.daysLeft != null && <span className="text-faint"> · ~{p.daysLeft} {t.common.days}</span>}
                    </>}
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="text-faint text-[11px] m-0">{r.footnote}</p>
        </div>
      )}
    </Panel>
  );
}

function Ticks({ s }: { s: Slot }) {
  const { t } = useSettings();
  return (
    <span className="text-dim shrink-0" title={t.research.tickHint}>
      {"▲".repeat(s.weight) || "—"}<span className="text-faint"> {Math.round(s.share * 100)}%</span>
    </span>
  );
}

function TechRace({ s, days }: { s: Slot; days: number | null }) {
  const { t } = useSettings();
  const r = t.research;
  const race = s.race!;
  const name = (id?: string) => race.rows.find((x) => x.id === id)?.name ?? id ?? "?";
  const iWin = race.rows.find((x) => x.id === race.winner)?.mine;
  // chi ha messo qualcosa, o si e' mosso: gli altri sono rumore
  const rows = race.rows.filter((x) => x.value > 0.05 || (x.delta ?? 0) > 0.05);

  return (
    <div>
      <div className="flex items-baseline gap-2 text-[12.5px]">
        <span className="font-semibold truncate">{s.name}</span>
        <Ticks s={s} />
        <span className="ml-auto text-dim shrink-0">
          {nf((s.accumulated / (s.cost || 1)) * 100, 0)}%
          {race.daysLeft != null && <span className="text-faint"> · {fill(r.endsIn, { n: race.daysLeft })}</span>}
        </span>
      </div>

      {/* il verdetto: chi vince, dove sei, e se il distacco cresce */}
      <p className={`text-[12px] my-1 ${iWin ? "text-good" : "text-warn"}`}>
        {race.paced
          ? (iWin ? (race.locked ? r.youWonAlready : r.youWin)
            : fill(race.locked ? r.wonAlready : r.wins, { who: name(race.winner) }))
          : (iWin ? r.youLead : fill(r.leads, { who: name(race.winner) }))}
        {race.myRank != null && race.gap != null && race.gapTo && (
          <span className="text-dim">
            {" · "}{fill(race.gap >= 0 ? r.ahead : r.behind,
              { rank: race.myRank, gap: nf(Math.abs(race.gap), 0), who: name(race.gapTo) })}
            {race.gapChange != null && days != null && (
              <span className={race.gapChange >= 0 ? "text-good" : "text-bad"}>
                {" · "}{fill(race.gapChange >= 0 ? r.gaining : r.losing,
                  { n: nf(Math.abs(race.gapChange), 1), days })}
              </span>
            )}
          </span>
        )}
      </p>

      <table className="data">
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>{r.colFaction}</th>
            <th title={r.colNowHint}>{r.colNow}</th>
            <th title={r.colGainedHint}>{days != null ? fill(r.colGained, { days }) : r.colGainedNone}</th>
            <th title={r.colPaceHint}>{r.colPace}</th>
            <th title={r.colEndHint}>
              {race.daysLeft != null ? fill(r.colEndDays, { n: race.daysLeft }) : r.colEnd}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((x) => (
            <tr key={x.id} className={x.mine ? "text-accent font-semibold" : ""}>
              <td>{x.name}{x.id === race.winner && " 🏆"}</td>
              <td>{nf(x.value, 0)}</td>
              <td className={x.delta ? "text-good" : "text-faint"}>
                {x.delta != null ? signed(x.delta, 1) : "—"}
              </td>
              <td className="text-dim">{x.delta != null && days ? nf((x.delta / days) * 30, 0) : "—"}</td>
              <td>{x.projected != null ? nf(x.projected, 0) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
