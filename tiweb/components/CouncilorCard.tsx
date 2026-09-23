"use client";

import type { ReactNode } from "react";
import { useSettings } from "@/lib/settings";
import type { Dict } from "@/lib/i18n";
import { AttrIcon, MissionIcon, ResourceIcon, Tag, nf } from "@/components/ui";
import { ATTRS, type Attr, type Councilor, type Income, type TraitEffect } from "@/lib/types";

/* La scheda di un consigliere, uguale nel Consiglio e nel Reclutamento: le
   due pagine passano solo quello che le distingue (variante, azione in alto,
   attributo evidenziato). Tutto il resto vive qui, così non divergono. */

export const SHORT: Record<Attr, string> = {
  Persuasion: "PER", Investigation: "IND", Espionage: "SPI", Command: "CMD",
  Administration: "AMM", Science: "SCI", Security: "SIC",
};

type ResLabel = "resMoney" | "resInfluence" | "resResearch" | "resOps" | "resBoost";

// icone del gioco, le stesse della barra delle risorse in cima
export const RES: { key: keyof Omit<Income, "fromTraits">; label: ResLabel; tone: string; icon: string }[] = [
  { key: "money", label: "resMoney", tone: "text-warn", icon: "ICO_currency" },
  { key: "influence", label: "resInfluence", tone: "text-accent", icon: "ICO_influence" },
  { key: "research", label: "resResearch", tone: "text-good", icon: "ICO_research" },
  { key: "ops", label: "resOps", tone: "text-other", icon: "ICO_ops" },
  { key: "boost", label: "resBoost", tone: "text-dim", icon: "ICO_boost" },
];
const RES_LABEL = Object.fromEntries(RES.map((r) => [r.key, r.label])) as Record<string, ResLabel>;

export const signed = (v: number) => `${v > 0 ? "+" : ""}${nf(v, 0)}`;

export function IncomeLine({ income }: { income: Income }) {
  const { t } = useSettings();
  const parts = RES.filter((r) => income[r.key] !== 0);
  if (parts.length === 0) return <span className="text-dim">—</span>;
  return (
    <span className="flex gap-2 flex-wrap">
      {parts.map((r) => {
        const v = income[r.key];
        return (
          <span key={r.key} className={`inline-flex items-center gap-1 ${v < 0 ? "text-bad" : r.tone}`}
            title={t.recruit[r.label]}>
            <ResourceIcon icon={r.icon} size={14} title={t.recruit[r.label]} />
            {signed(v)} <span className="text-dim">{t.recruit[r.label]}</span>
          </span>
        );
      })}
    </span>
  );
}

/** Un effetto del tratto in parole, col suo colore: verde aiuta, rosso costa. */
function describe(e: TraitEffect, t: Dict): { text: string; tone: "good" | "bad" | "dim";
  conditional?: boolean } {
  const r = t.recruit;
  const byValue = (v: number): "good" | "bad" | "dim" => (v > 0 ? "good" : v < 0 ? "bad" : "dim");
  switch (e.kind) {
    case "stat":
      return { text: `${signed(e.value)} ${SHORT[e.stat] ?? e.stat}`,
        tone: byValue(e.value), conditional: e.conditional };
    case "statFixed":
      return { text: `${e.stat} = ${e.value}`, tone: "dim", conditional: e.conditional };
    case "loyalty":
      return { text: `${signed(e.value)} ${r.fxLoyalty}`, tone: byValue(e.value),
        conditional: e.conditional };
    case "apparentLoyalty":
      return { text: `${signed(e.value)} ${r.fxApparentLoyalty}`, tone: "dim",
        conditional: e.conditional };
    case "transparent":
      return { text: r.fxTransparent, tone: "good" };
    case "income":
      return { text: `${signed(e.value)} ${r[RES_LABEL[e.resource]]}`, tone: byValue(e.value) };
    case "xp":
      // negativo = l'esperienza costa meno, quindi e' un vantaggio
      return { text: `${r.fxXp} ${signed(e.value * 100)}%`, tone: byValue(-e.value) };
    case "mission":
      return { text: `${r.fxGrants} ${e.name}`, tone: "good" };
    case "restricted":
      return { text: `${r.fxRestricted} ${e.name}`, tone: "bad" };
    case "rule":
      return r.rules[e.rule]
        ? { text: r.rules[e.rule], tone: "bad" }
        : { text: `${r.fxRule}: ${e.rule}`, tone: "dim" };
  }
}

const TONE = { good: "text-good", bad: "text-bad", dim: "text-dim" } as const;

function Traits({ c }: { c: Councilor }) {
  const { t } = useSettings();
  return (
    // un tratto per riga: nome in colonna, effetti accanto. In fila uno
    // dietro l'altro il nome di un tratto finiva attaccato agli effetti
    // del precedente
    <div className="grid grid-cols-[max-content_1fr] gap-x-2.5 text-[11.5px]">
      {c.traits.map((tr, i) => {
        const fx = (tr.effects ?? []).map((e) => describe(e, t));
        const line = i ? "border-t border-edge" : "";
        return (
          <div key={tr.id} className="contents">
            <div className={`py-[3px] ${line}`} title={tr.description ?? undefined}>
              <Tag>{tr.name}</Tag>
            </div>
            <div className={`py-[3px] ${line} flex items-center`}>
              <span className="leading-snug">
                {/* senza effetti leggibili resta la descrizione del gioco */}
                {fx.length === 0 && <span className="text-faint italic">{tr.description ?? "—"}</span>}
                {fx.map((f, j) => (
                  <span key={j} className={TONE[f.tone]}
                    title={f.conditional ? t.recruit.conditional : undefined}>
                    {f.text}{f.conditional && "*"}{j < fx.length - 1 ? ", " : ""}
                  </span>
                ))}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

type FigureTone = "good" | "faint" | "warn" | "bad";

function KeyFigure({ label, value, tone, title, note }: {
  label: string; value: string; tone?: FigureTone; title?: string; note?: ReactNode;
}) {
  const color = { good: "text-good", faint: "text-faint", warn: "text-warn", bad: "text-bad" };
  return (
    <div className={`bg-void/40 border px-2 py-1 ${
      tone === "bad" ? "border-bad/60" : tone === "warn" ? "border-warn/50" : "border-edge"}`}
      title={title}>
      <div className="text-[10.5px] text-faint uppercase tracking-[.05em]">{label}</div>
      <div className="flex items-baseline gap-1.5 mt-0.5">
        <span className={`display text-[20px] leading-none ${tone ? color[tone] : "text-ink"}`}>
          {value}
        </span>
        {note && <span className="text-[10.5px] leading-tight">{note}</span>}
      </div>
    </div>
  );
}

/** Età nel linguaggio del gioco: da `declineAt` (65) può arrivare il tratto
 *  «In fase di declino» e poi la morte; i 5 anni prima sono un preavviso
 *  nostro. Ai candidati, sotto quella soglia, l'età porta solo XP. */
function AgeFigure({ c, recruit }: { c: Councilor; recruit: boolean }) {
  const { t } = useSettings();
  const r = t.recruit;
  if (c.age == null) return <KeyFigure label={r.age} value="—" />;
  const old = c.age >= c.declineAt;
  const near = !old && c.age >= c.declineAt - 5;
  const note = old
    ? <span className="text-bad">⚠ {r.ageOld}</span>
    : near
      ? <span className="text-warn">{r.ageNear.replace("{n}", String(c.declineAt - c.age)).replace("{at}", String(c.declineAt))}</span>
      : recruit && c.hireXp
        ? <span className="text-good">+{c.hireXp} XP</span>
        : null;
  return (
    <KeyFigure label={r.age} value={String(c.age)} tone={old ? "bad" : near ? "warn" : undefined}
      note={note}
      title={r.ageHint.replace("{decline}", String(c.declineAt))
        + (recruit && c.hireXp ? ` ${r.ageXpHint.replace("{xp}", String(c.hireXp))}` : "")} />
  );
}

function AttrRow({ c, sortAttr }: { c: Councilor; sortAttr?: Attr | null }) {
  const gain = c.gain ?? {};
  return (
    <div className="flex gap-1 flex-wrap">
      {ATTRS.map((a) => {
        const v = c.attributes[a] ?? 0;
        const bonus = v - (c.base[a] ?? 0);          // dalle organizzazioni
        const g = gain[a] ?? 0;                      // sul massimo del consiglio
        return (
          <span key={a}
            className={`text-[12px] px-1.5 py-0.5 border inline-flex items-center gap-1 ${
              g > 0 ? "border-good/40 bg-good/10" : "border-edge"} ${
              sortAttr === a ? "outline outline-1 outline-accent" : ""}`}
            title={[bonus ? `base ${c.base[a]} + ${bonus} org` : "",
              g > 0 ? `+${g} sul massimo attuale del consiglio` : ""].filter(Boolean).join(" · ")
              || undefined}>
            <AttrIcon attr={a} size={13} title={SHORT[a]} />
            <span className="text-faint">{SHORT[a]}</span>
            <span className={v >= 7 ? "font-semibold" : v <= 2 ? "text-dim" : ""}>{v}</span>
            {bonus > 0 && <sup className="text-accent">+{bonus}</sup>}
            {g > 0 && <span className="text-good ml-1">+{g}</span>}
          </span>
        );
      })}
    </div>
  );
}

function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="text-[12px] mt-2">
      <div className="text-dim mb-0.5">{title}</div>
      {children}
    </div>
  );
}

export function CouncilorCard({ c, variant, action, sortAttr, highlighted }: {
  c: Councilor;
  /** «council»: già nel consiglio; «recruit»: candidato, con le differenze */
  variant: "council" | "recruit";
  /** in alto a destra, accanto alla lealtà (es. «Confronta») */
  action?: ReactNode;
  sortAttr?: Attr | null;
  highlighted?: boolean;
}) {
  const { t } = useSettings();
  const recruit = variant === "recruit";
  const missions = c.missionList;
  const fresh = missions.filter((m) => m.new).length;
  const weak = c.fixesWeak ?? [];
  const depth = c.depth ?? {};
  const depthAttrs = ATTRS.filter((a) => depth[a]);

  return (
    <div className={`bg-panel border p-3 ${highlighted ? "border-accent" : "border-edge"}`}>
      <div className="flex justify-between items-baseline gap-2">
        <div>
          <span className="font-semibold text-[14px]">{c.name}</span>
          <span className="text-dim text-[12px] ml-2">{c.typeName}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Tag tone={(c.apparentLoyalty ?? 9) <= 6 ? "bad" : "dim"}>
            {t.council.loyaltyApparent} {c.apparentLoyalty ?? "?"}
          </Tag>
          {action}
        </div>
      </div>

      <div className="text-dim text-[12px] mt-0.5">
        {c.nationality ?? "—"} · {c.location ?? "—"}
      </div>

      {/* i numeri che decidono: si leggono prima di tutto il resto */}
      <div className="grid grid-cols-3 gap-[2px] mt-2">
        {recruit
          ? <KeyFigure label={t.recruit.newMissions} tone={fresh ? "good" : "faint"}
              value={fresh ? `+${fresh}` : "0"} title={t.recruit.missionsNewHint} />
          : <KeyFigure label="XP" value={String(c.xp)} />}
        <KeyFigure label={t.recruit.totalMissions} value={String(missions.length)} />
        <AgeFigure c={c} recruit={recruit} />
      </div>

      <div className="my-2"><AttrRow c={c} sortAttr={sortAttr} /></div>

      {(weak.length > 0 || depthAttrs.length > 0) && (
        <div className="text-[12px] mb-1.5 flex gap-1 flex-wrap items-center">
          {weak.length > 0 && <Tag tone="mine">{t.recruit.fixesWeak}: {weak.join(", ")}</Tag>}
          {depthAttrs.length > 0 && (
            <span className="text-dim" title={t.recruit.depthHint}>{t.recruit.depth}:</span>
          )}
          {depthAttrs.map((a) => (
            <Tag key={a}>
              <span className="inline-flex items-center gap-1" title={t.recruit.depthHint}>
                <AttrIcon attr={a} size={12} title={SHORT[a]} />
                {SHORT[a]} {depth[a]!.now} → <span className="text-good">{depth[a]!.after}</span>
              </span>
            </Tag>
          ))}
        </div>
      )}

      <Section title={t.recruit.income}><IncomeLine income={c.income} /></Section>

      {!recruit && (
        <>
          <Section title={t.council.orgs}>
            {c.orgs.length === 0
              ? <div className="text-dim">{t.council.noOrgs}</div>
              : c.orgs.map((o) => {
                const bits: string[] = [];
                for (const [k, v] of Object.entries(o.attributes)) if (v) bits.push(`+${v} ${SHORT[k as Attr]}`);
                if (o.projectSlots) bits.push(`+${o.projectSlots} slot`);
                return (
                  <div key={o.id} className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-ink">{o.name}</span>
                    <IncomeLine income={{ ...o.income, fromTraits: false } as Income} />
                    {bits.length > 0 && <span className="text-dim">{bits.join(", ")}</span>}
                  </div>
                );
              })}
          </Section>
          <Section title={t.council.lastMission}>
            <span className="text-ink">{c.priorMission ?? "—"}</span>
          </Section>
        </>
      )}

      <Section title={
        <span title={recruit ? t.recruit.missionsNewHint : undefined}>
          {t.recruit.missions} <span className="text-ink">({missions.length})</span>
          {fresh > 0 && <span className="text-good"> · {fresh} {t.recruit.compareMissionsNew}</span>}
        </span>
      }>
        {missions.length === 0
          ? <div className="text-dim">—</div>
          : (
            <div className="flex gap-1 flex-wrap">
              {missions.map((m) => (
                <Tag key={m.id} tone={m.new ? "mine" : "dim"}>
                  <span className="inline-flex items-center gap-1">
                    <MissionIcon icon={m.icon} size={16} title={m.name} />
                    {m.name}
                    {m.attribute && <AttrIcon attr={m.attribute} size={12} title={SHORT[m.attribute]} />}
                  </span>
                </Tag>
              ))}
            </div>
          )}
      </Section>

      <Section title={t.council.traits}><Traits c={c} /></Section>
    </div>
  );
}
