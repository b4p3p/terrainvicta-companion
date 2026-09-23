"use client";

import type { ReactNode } from "react";
import { useApi } from "@/lib/api";
import { usePersistentState } from "@/lib/persist";
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
    <div className="pl-2 border-l-2 border-dashed border-edge-lit">
      <div className="flex items-center gap-1.5">
        <span className="dossier-glyph display text-[13px] text-dim">?</span>
        <span className="redacted inline-block h-[11px] w-[88px] max-w-full" />
      </div>
      {/* il timbro sta nel flusso della cella, non sopra: così non può uscire
          dal bordo della tabella, qualunque sia la larghezza della colonna */}
      <div className="flex items-center gap-2 mt-1 flex-wrap">
        <span className="text-faint text-[10.5px] tracking-[.08em] uppercase">
          {t.factions.file} {String(n).padStart(2, "0")}/{String(total).padStart(2, "0")}
        </span>
        <span className="dossier-stamp display">{t.factions.classified}</span>
      </div>
    </div>
  );
}

/** Il valore che conta di una risorsa: la scorta, tranne la ricerca, che non
 *  si accumula e si confronta col reddito mensile. null = intel insufficiente. */
function metric(f: Faction, id: string): number | null {
  const x = f.resources?.find((r) => r.id === id);
  if (!x) return null;
  return id === "Research" ? x.monthly : x.stock;
}

/** Distanza da noi: chi ci sta davanti è un problema (rosso), chi sta dietro no.
 *  Freccia e segno ripetono il colore, che da solo non basta. */
function Gap({ d, digits = 0, title }: { d: number; digits?: number; title?: string }) {
  // sotto la precisione mostrata è pari: «▲ +0» direbbe il falso
  if (Math.abs(d) < 0.5 * 10 ** -digits) return <span className="text-faint text-[11px]" title={title}>=</span>;
  const ahead = d > 0;
  return (
    <span className={`text-[11px] whitespace-nowrap ${ahead ? "text-bad" : "text-good"}`} title={title}>
      {ahead ? "▲" : "▼"} {ahead ? "+" : "−"}{nf(Math.abs(d), digits)}
    </span>
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

function Row({ label, factions, field, render, lines, seed, active }: {
  label: ReactNode; factions: Column[]; field: Field;
  render: (f: Faction) => ReactNode;
  /** righe di censura nelle colonne sconosciute */
  lines?: number; seed: string;
  /** riga della metrica di ordinamento */
  active?: boolean;
}) {
  return (
    <tr className={`border-t border-edge align-top ${active ? "outline outline-1 outline-sel-edge/50 -outline-offset-1" : ""}`}>
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
  const [sortKey, setSortKey] = usePersistentState<string>(
    "factions.sort", "Money", (v): v is string => typeof v === "string");
  const [sortDesc, setSortDesc] = usePersistentState<boolean>(
    "factions.desc", true, (v): v is boolean => typeof v === "boolean");
  if (error) return <Empty>{error}</Empty>;
  if (!data) return <Empty>{t.common.loading}</Empty>;
  const known = data.factions.filter((f): f is Faction => !isUnknown(f));
  const me = known.find((f) => f.mine)!;
  const resIds = me.resources ?? [];
  const unknownIds = data.factions.filter(isUnknown).map((f) => f.id);

  // la nostra colonna resta prima e i dossier ultimi: si ordinano le altre.
  // Chi non ha il dato (intel insufficiente) va in fondo, qualunque verso.
  const others = known.filter((f) => !f.mine).sort((a, b) => {
    const va = metric(a, sortKey), vb = metric(b, sortKey);
    if (va == null || vb == null) return va == null ? (vb == null ? 0 : 1) : -1;
    return sortDesc ? vb - va : va - vb;
  });
  const fs: Column[] = [me, ...others, ...data.factions.filter(isUnknown)];
  const sortRes = resIds.find((r) => r.id === sortKey);
  const mineVal = metric(me, sortKey);

  function pick(id: string) {
    if (id === sortKey) setSortDesc(!sortDesc);
    else { setSortKey(id); setSortDesc(true); }
  }

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

      <div className="flex items-center gap-2 flex-wrap mb-3 border-t border-edge pt-3">
        <span className="text-dim text-[12px] mr-1">{t.factions.sortBy}</span>
        <div className="flex">
          {resIds.map((r) => {
            const on = r.id === sortKey;
            return (
              <button key={r.id} type="button" onClick={() => pick(r.id)}
                aria-pressed={on}
                className={`inline-flex items-center gap-1.5 text-[12px] px-2.5 py-[3px] -ml-px
                  border ${on ? "border-sel-edge bg-sel text-ink relative z-[1]"
                    : "border-edge-lit bg-control text-dim hover:text-ink"}`}>
                <ResourceIcon icon={r.icon} size={14} />
                {r.name}
                {on && <span className="text-[10px] text-accent">{sortDesc ? "▼" : "▲"}</span>}
              </button>
            );
          })}
        </div>
        <span className="text-faint text-[11px] ml-2">{t.factions.sortHint}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="text-[12px] w-full border-collapse">
          <thead>
            <tr>
              <th />
              {fs.map((f) => isUnknown(f) ? (
                <th key={f.id} className="text-left align-top px-3 pb-2 pt-1 font-normal dossier">
                  <DossierHeader n={known.length + unknownIds.indexOf(f.id) + 1} total={fs.length} />
                </th>
              ) : (
                <th key={f.id} className={`text-left align-top px-3 pb-2 pt-1 font-normal ${f.mine ? "bg-sel/40" : ""}`}>
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
                  {!f.mine && sortRes && (() => {
                    const v = metric(f, sortKey);
                    return (
                      <div className="pl-2.5 mt-1 text-[11px] flex items-center gap-1.5 whitespace-nowrap">
                        <ResourceIcon icon={sortRes.icon} size={12} />
                        {v == null || mineVal == null
                          ? <span className="text-faint">{t.factions.locked}</span>
                          : <Gap d={v - mineVal} digits={sortKey === "Research" ? 1 : 0}
                              title={t.factions.gapHint} />}
                        {v != null && mineVal != null && <span className="text-faint">{t.factions.vsYou}</span>}
                      </div>
                    );
                  })()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {resIds.map((r) => (
              <Row key={r.id} field="resources" factions={fs} seed={r.id} active={r.id === sortKey}
                label={<span className="inline-flex items-center gap-1.5">
                  <ResourceIcon icon={r.icon} size={14} />{r.name}
                </span>}
                render={(f) => {
                  const x = f.resources?.find((y) => y.id === r.id);
                  if (!x) return null;
                  const v = metric(f, r.id), mv = metric(me, r.id);
                  return (
                    <div className="whitespace-nowrap">
                      {/* la ricerca non si accumula: la scorta sarebbe sempre 0 */}
                      {x.id !== "Research" && nf(x.stock, 0)}
                      <span className={`ml-1.5 text-[11px] ${x.monthly > 0 ? "text-dim" : "text-faint"}`}>
                        {x.monthly > 0 ? "+" : ""}{nf(x.monthly, 1)}/{t.common.month}
                      </span>
                      {!f.mine && v != null && mv != null && (
                        <span className="ml-2"><Gap d={v - mv} digits={r.id === "Research" ? 1 : 0}
                          title={t.factions.gapHint} /></span>
                      )}
                    </div>
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
