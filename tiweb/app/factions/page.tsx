"use client";

import type { ReactNode } from "react";
import { useApi } from "@/lib/api";
import { useSettings } from "@/lib/settings";
import { Empty, Panel, ResourceIcon, Tag, nf } from "@/components/ui";
import { Guide } from "@/components/Guide";

type Field = "resources" | "unassignedOrgs" | "objectives" | "projects";
interface Gate { need: number; measure: "intel" | "highest" }

interface Faction {
  id: number;
  name: string;
  template: string;
  colors: { accent?: string } | null;
  mine: boolean;
  intel: number;
  highest: number;
  locked: Partial<Record<Field, Gate>>;
  resources?: { id: string; name: string; icon: string | null; stock: number; monthly: number }[];
  unassignedOrgs?: number;
  objectives?: { id: string; status: "Unlocked" | "Completed"; name: string }[];
  projects?: {
    finished: number;
    current: { name: string; accumulated: number; cost: number | null }[];
  };
}

/** Fazione mai contattata: l'API non manda nome, colore né id veri. */
interface Unknown { id: string; unknown: true }
type Column = Faction | Unknown;
const isUnknown = (c: Column): c is Unknown => "unknown" in c;

interface Compare {
  gates: Record<Field, Gate>;
  factions: Column[];
}

/** Lunghezze pseudo-casuali ma stabili: la censura non deve tremare a ogni
 *  ricaricamento, e due celle vicine non devono sembrare fotocopie. */
function bars(seed: string, n: number) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return Array.from({ length: n }, (_, i) => 38 + (((h >>> (i * 5)) & 31) * 55) / 31);
}

/** Cella di un dossier riservato: barre di censura al posto dei dati. */
function Redacted({ seed, lines = 1 }: { seed: string; lines?: number }) {
  const { t } = useSettings();
  return (
    <div className="flex flex-col gap-[5px] py-[3px]" title={t.factions.noContact}
      aria-label={t.factions.noContact}>
      {bars(seed, lines).map((w, i) => (
        <span key={i} className="redacted block h-[10px]" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

/** Intestazione del dossier: niente nome, un timbro e un numero di pratica. */
function DossierHeader({ n, total }: { n: number; total: number }) {
  const { t } = useSettings();
  return (
    <div className="relative pl-2 border-l-2 border-dashed border-edge-lit">
      <div className="flex items-center gap-1.5">
        <span className="dossier-glyph display text-[13px] text-dim">?</span>
        <span className="redacted inline-block h-[11px] w-[88px]" />
      </div>
      <div className="text-faint text-[10.5px] mt-1 tracking-[.08em] uppercase">
        {t.factions.file} {String(n).padStart(2, "0")}/{String(total).padStart(2, "0")}
      </div>
      <span className="dossier-stamp display">{t.factions.classified}</span>
    </div>
  );
}

/** Cella chiusa: dire che non si sa, e quanto manca, è informazione anch'esso. */
function Locked({ f, gate }: { f: Faction; gate: Gate }) {
  const { t } = useSettings();
  const have = gate.measure === "highest" ? f.highest : f.intel;
  return (
    <span className="text-faint text-[11.5px]" title={t.factions.lockedHint}>
      {t.factions.locked} · {nf(have, 2)}/{nf(gate.need, 2)}
    </span>
  );
}

function Row({ label, factions, field, render, lines, seed }: {
  label: ReactNode; factions: Column[]; field: Field;
  render: (f: Faction) => ReactNode;
  /** righe di censura nelle colonne sconosciute */
  lines?: number; seed: string;
}) {
  return (
    <tr className="border-t border-edge align-top">
      <th className="text-left font-normal text-dim py-1.5 pr-3 whitespace-nowrap">{label}</th>
      {factions.map((f) => isUnknown(f) ? (
        <td key={f.id} className="py-1.5 px-3 dossier">
          <Redacted seed={`${seed}-${f.id}`} lines={lines} />
        </td>
      ) : (
        <td key={f.id} className={`py-1.5 px-3 ${f.mine ? "bg-sel/40" : ""}`}>
          {f.locked[field] ? <Locked f={f} gate={f.locked[field]!} /> : render(f)}
        </td>
      ))}
    </tr>
  );
}

export default function FactionsPage() {
  const { t, game, live } = useSettings();
  const { data, error } = useApi<Compare>(`/api/factions?lang=${game}`, [live.version, game]);
  if (error) return <Empty>{error}</Empty>;
  if (!data) return <Empty>{t.common.loading}</Empty>;
  const fs = data.factions;
  const known = fs.filter((f): f is Faction => !isUnknown(f));
  const resIds = known.find((f) => f.resources)?.resources ?? [];
  const unknownIds = fs.filter(isUnknown).map((f) => f.id);

  return (
    <Panel title={t.factions.title}
      right={
        <Guide title={t.factions.title} label={t.presets.guide}>
          <p>{t.factions.guideIntro}</p>
          <h4>{t.factions.guideGatesTitle}</h4>
          <p>{t.factions.guideGates}</p>
          <ul className="mb-3 list-disc pl-5">
            {(Object.keys(data.gates) as Field[]).map((k) => (
              <li key={k}>
                {t.factions.fields[k]}: {nf(data.gates[k].need, 2)} ·{" "}
                {data.gates[k].measure === "highest" ? t.factions.measureHighest : t.factions.measureNow}
              </li>
            ))}
          </ul>
          <h4>{t.factions.guideIncomeTitle}</h4>
          <p>{t.factions.guideIncome}</p>
        </Guide>
      }>
      <p className="text-faint text-[11.5px] mb-3">{t.factions.sub}</p>
      <div className="overflow-x-auto">
        <table className="text-[12px] w-full border-collapse">
          <thead>
            <tr>
              <th />
              {fs.map((f) => isUnknown(f) ? (
                <th key={f.id} className="text-left px-3 pb-2 pt-1 font-normal dossier">
                  <DossierHeader n={known.length + unknownIds.indexOf(f.id) + 1} total={fs.length} />
                </th>
              ) : (
                <th key={f.id} className={`text-left px-3 pb-2 font-normal ${f.mine ? "bg-sel/40" : ""}`}>
                  <div className="display text-[13px] uppercase tracking-[.04em] border-l-2 pl-2"
                    style={{ borderColor: f.colors?.accent ?? "var(--edge-lit)" }}>
                    {f.name}
                  </div>
                  <div className="text-faint text-[11px] pl-2.5 mt-0.5">
                    {f.mine ? <Tag tone="mine">{t.factions.you}</Tag> : (
                      <span title={t.factions.intelHint}>
                        intel {nf(f.intel, 2)}
                        {f.highest > f.intel + 1e-6 && <> · max {nf(f.highest, 2)}</>}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {resIds.map((r) => (
              <Row key={r.id} field="resources" factions={fs} seed={r.id}
                label={<span className="inline-flex items-center gap-1.5">
                  <ResourceIcon icon={r.icon} size={14} />{r.name}
                </span>}
                render={(f) => {
                  const x = f.resources?.find((y) => y.id === r.id);
                  if (!x) return null;
                  return (
                    <span className="whitespace-nowrap">
                      {/* la ricerca non si accumula: la scorta sarebbe sempre 0 */}
                      {x.id !== "Research" && nf(x.stock, 0)}
                      <span className={`ml-1.5 text-[11px] ${x.monthly > 0 ? "text-good" : "text-faint"}`}>
                        {x.monthly > 0 ? "+" : ""}{nf(x.monthly, 1)}/{t.common.month}
                      </span>
                    </span>
                  );
                }} />
            ))}
            <Row field="unassignedOrgs" factions={fs} seed="orgs" label={t.factions.fields.unassignedOrgs}
              render={(f) => f.unassignedOrgs ?? 0} />
            <Row field="objectives" factions={fs} seed="obj" lines={4} label={t.factions.fields.objectives}
              render={(f) => (
                <div className="text-[11.5px]">
                  <div className="text-faint mb-0.5">
                    {t.factions.finished}: {f.objectives!.filter((o) => o.status === "Completed").length}
                  </div>
                  <ul className="space-y-0.5">
                    {f.objectives!.filter((o) => o.status === "Unlocked").map((o) => (
                      <li key={o.id} className="text-dim">{o.name}</li>
                    ))}
                  </ul>
                </div>
              )} />
            <Row field="projects" factions={fs} seed="proj" lines={3} label={t.factions.fields.projects}
              render={(f) => (
                <div className="text-[11.5px]">
                  <div className="text-dim mb-0.5">{t.factions.finished}: {f.projects!.finished}</div>
                  {f.projects!.current.map((p) => (
                    <div key={p.name} className="flex justify-between gap-2">
                      <span className="truncate">{p.name}</span>
                      <span className="text-faint whitespace-nowrap">
                        {nf(p.accumulated, 0)}{p.cost ? `/${nf(p.cost, 0)}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )} />
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
