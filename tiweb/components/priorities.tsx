"use client";

import { currentDict } from "@/lib/i18n";
import { GameIcon, nf } from "@/components/ui";

/* Priorità nazionali: colori, barra della ripartizione e pesi grezzi.
   Condiviso fra la scheda Preset e il dettaglio delle Nazioni. */

export interface Priority {
  id: string;
  type: string;
  name: string;
  icon: string | null;
}

export interface Slice extends Priority {
  weight: number;
  share: number;
}

/* Famiglie di priorità: un raggruppamento NOSTRO, non del gioco, che serve
   solo a leggere la barra. Venti tinte non si distinguono; cinque sì.
   Colori validati (scripts/validate_palette.js della skill dataviz) contro
   --panel, nell'ordine in cui compaiono nella barra: gli adiacenti restano
   distinguibili anche per chi non vede rosso/verde. */
export type Family = "knowledge" | "civil" | "space" | "power" | "military";
export const FAMILIES: { key: Family; color: string; members: string[] }[] = [
  { key: "knowledge", color: "#3987e5", members: ["knowledge"] },
  { key: "civil", color: "#d95926",
    members: ["economy", "welfare", "environment", "government", "unity"] },
  { key: "space", color: "#199e70",
    members: ["spaceProgram", "initSpaceProgram", "boost", "missionControl"] },
  { key: "power", color: "#c98500", members: ["oppression", "spoils"] },
  { key: "military", color: "#d55181",
    members: ["foundMilitary", "military", "army", "navy", "initNuclearWeapons",
      "nuclearProgram", "spaceDefense", "sto"] },
];
export const FAMILY_OF: Record<string, (typeof FAMILIES)[number]> = Object.fromEntries(
  FAMILIES.flatMap((f) => f.members.map((m) => [m, f])),
);

/* Ogni priorità ha un tono suo: la tinta dice la famiglia, la luce la voce.
   Rampa dal chiaro allo scuro nell'ordine fisso di `members`, così il colore
   segue la priorità e non la sua posizione nella barra: Esercito ha lo
   stesso tono in ogni preset. */
function ramp(color: string, i: number, n: number): string {
  if (n < 2) return color;
  const t = i / (n - 1);                        // 0 = più chiaro, 1 = più scuro
  const span = n > 5 ? 44 : 34;                 // più voci, rampa più larga
  const light = Math.round(span * (1 - 2 * t)); // +span% bianco … −span% nero
  return light >= 0
    ? `color-mix(in oklab, ${color}, white ${light}%)`
    : `color-mix(in oklab, ${color}, black ${-light}%)`;
}
export const COLOR_OF: Record<string, string> = Object.fromEntries(
  FAMILIES.flatMap((f) => f.members.map((m, i) => [m, ramp(f.color, i, f.members.length)])),
);
/** campione di legenda: tutta la rampa della famiglia */
const swatch = (f: (typeof FAMILIES)[number]) =>
  f.members.length < 2 ? f.color
    : `linear-gradient(to right, ${f.members.map((m) => COLOR_OF[m]).join(", ")})`;

export const pc = (v: number) => `${nf(v * 100, 1)}%`;
/** differenza in punti percentuali, col segno */
export const pp = (v: number) =>
  Math.abs(v) < 0.0005 ? "=" : `${v > 0 ? "+" : "−"}${nf(Math.abs(v) * 100, 1)}`;

export function familyShares(p: { priorities: Slice[] }) {
  const out = Object.fromEntries(FAMILIES.map((f) => [f.key, 0])) as Record<Family, number>;
  for (const s of p.priorities) {
    const f = FAMILY_OF[s.id];
    if (f) out[f.key] += s.share;
  }
  return out;
}

/** Una barra impilata: un segmento per priorità, raggruppati per famiglia,
 *  separati da 2px di fondo. L'etichetta di ogni segmento sta nel tooltip. */
export function ShareBar({ p, height = 14, weightLabel = currentDict().common.weight }: {
  p: { priorities: Slice[] }; height?: number; weightLabel?: string;
}) {
  // dentro la famiglia, nell'ordine della rampa: dal tono chiaro allo scuro
  const ordered = FAMILIES.flatMap((f) =>
    f.members.map((m) => p.priorities.find((s) => s.id === m)).filter((s) => s != null));
  return (
    <div className="flex gap-[2px] w-full bg-panel" style={{ height }} role="img"
      aria-label={ordered.map((s) => `${s.name} ${pc(s.share)}`).join(", ")}>
      {ordered.map((s) => (
        <div key={s.id} title={`${s.name} · ${weightLabel} ${s.weight} · ${pc(s.share)}`}
          style={{ width: `${s.share * 100}%`, background: COLOR_OF[s.id] }}
          className="h-full min-w-[2px] hover:brightness-125" />
      ))}
    </div>
  );
}

/** Legenda delle famiglie. Il nome della Conoscenza viene dal gioco, gli
 *  altri sono nostri: sono gruppi, non priorità. */
export function Legend({ names, knowledge }: {
  names: Record<Exclude<Family, "knowledge">, string>; knowledge: string;
}) {
  return (
    <div className="flex gap-3 flex-wrap text-[11.5px] text-dim">
      {FAMILIES.map((f) => (
        <span key={f.key} className="inline-flex items-center gap-1.5">
          <span className="inline-block w-5 h-2.5" style={{ background: swatch(f) }} />
          {f.key === "knowledge" ? knowledge : names[f.key]}
        </span>
      ))}
    </div>
  );
}

/** I pesi grezzi, in ordine di peso: la ripartizione vera del bilancio.
 *  Con `base`, accanto a ogni quota la differenza in punti. */
export function WeightChips({ p, base }: {
  p: { priorities: Slice[] }; base?: { priorities: Slice[] } | null;
}) {
  const baseShare = new Map(base?.priorities.map((s) => [s.id, s.share]));
  // le voci che il riferimento accende e questo no: senza, il confronto mente
  const missing = base ? base.priorities.filter((s) => !p.priorities.some((x) => x.id === s.id)) : [];
  return (
    <div className="flex gap-1 flex-wrap">
      {p.priorities.map((s) => (
        <Chip key={s.id} s={s} d={base ? s.share - (baseShare.get(s.id) ?? 0) : null} />
      ))}
      {missing.map((s) => <Chip key={s.id} s={s} d={-s.share} off />)}
    </div>
  );
}

function Chip({ s, d, off }: { s: Slice; d: number | null; off?: boolean }) {
  return (
    <span className={`text-[11px] border px-1.5 py-[1px] inline-flex items-center gap-1 ${
      off ? "border-dashed border-edge opacity-60" : "border-edge"}`}>
      <span className="inline-block w-1.5 h-1.5" style={{ background: COLOR_OF[s.id] }} />
      <GameIcon bundle="icons_2d" icon={s.icon} size={14} />
      <span className={s.id === "knowledge" ? "text-ink" : "text-dim"}>{s.name}</span>
      {off ? <span className="text-faint">0</span> : (
        <>
          <span className="text-faint">{s.weight}</span>
          <span className="text-faint">·</span>
          <span>{pc(s.share)}</span>
        </>
      )}
      {d != null && (
        // neutro di proposito: più militare non è né un bene né un male
        <span className={Math.abs(d) < 0.0005 ? "text-faint" : d > 0 ? "text-ink" : "text-dim"}>
          {pp(d)}
        </span>
      )}
    </span>
  );
}
