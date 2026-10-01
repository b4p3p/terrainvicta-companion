"use client";

import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { useSettings } from "@/lib/settings";
import { FactionLogo, GameIcon, ResourceIcon, nf } from "@/components/ui";
import { Tip, TipRow } from "@/components/Tip";
import type { PanelCP, PriorityRow, RowResult } from "@/lib/yass";

// i pallini come li disegna il gioco (ICO_Weight0..3_priority, sprite non
// quadrati): 0 e' una barra, 1-3 pallini rossi, blu, verdi
const PIP_SIZE: Record<number, [number, number]> = { 0: [14, 6], 1: [10, 10], 2: [22, 10], 3: [29, 10] };
export function Pips({ n }: { n: number }) {
  const k = Number.isFinite(n) ? Math.max(0, Math.min(3, Math.round(n))) : 0;
  const [w, h] = PIP_SIZE[k];
  return <GameIcon bundle="icons_2d" icon={`ICO_Weight${k}_priority`} size={w} height={h} />;
}

/** Legenda compatta dei pallini: tre cerchi sovrapposti nei colori del gioco
    (campionati da ICO_Weight1..3_priority: 1 rosso, 2 blu, 3 verde). */
export function PipGlyph() {
  return (
    <svg width="17" height="9" viewBox="0 0 17 9" aria-hidden="true" className="inline-block align-middle">
      <circle cx="4.5" cy="4.5" r="4" fill="#b26a60" />
      <circle cx="8.5" cy="4.5" r="4" fill="#1589ff" stroke="var(--panel)" strokeWidth=".8" />
      <circle cx="12.5" cy="4.5" r="4" fill="#84b260" stroke="var(--panel)" strokeWidth=".8" />
    </svg>
  );
}

/** Testo coi pallini: «{pip}» diventa la legenda, perché il gioco non ha una
    parola per loro. */
export function PipText({ text }: { text: string }) {
  const parts = text.split("{pip}");
  return <>{parts.map((p, i) => (
    <span key={i}>{p}{i < parts.length - 1 && <span className="yass-pip-word"><PipGlyph /></span>}</span>
  ))}</>;
}

/** Il pannello Priorità della nazione, coi pallini dei tuoi punti di
    controllo: clic +1 (dopo 3 torna a 0), clic destro −1, rotella e frecce
    su/giù per alzare e abbassare. Con Maiusc, come in RimWorld, vale per
    tutta la riga. */
export function PriorityPanel({ rows, cps, pips, saved, results, controlPoints, faction, onPip, onRow, used, usedBy }: {
  rows: PriorityRow[]; cps: PanelCP[];
  pips: (cp: number, id: string) => number;
  saved: (cp: number, id: string) => number;
  results: RowResult[]; controlPoints: number; faction: string | null;
  onPip: (cp: number, id: string, value: number) => void;
  onRow: (id: string, values: Record<number, number>) => void;
  /** le priorita' che il foglio aperto usa: evidenziate */
  used: string[]; usedBy: string;
}) {
  const { t } = useSettings();
  const y = t.yass;
  const res = Object.fromEntries(results.map((r) => [r.id, r]));
  const others = controlPoints - cps.length;

  const change = (cp: number, id: string, delta: number, wrap: boolean) => {
    const v = pips(cp, id) + delta;
    onPip(cp, id, wrap ? (v + 4) % 4 : Math.max(0, Math.min(3, v)));
  };
  // tutta la riga in un colpo, quello che il gioco non permette
  const changeRow = (id: string, delta: number) =>
    onRow(id, Object.fromEntries(cps.map((cp) => [cp.index, Math.max(0, Math.min(3, pips(cp.index, id) + delta))])));
  const setRow = (id: string, value: number) =>
    onRow(id, Object.fromEntries(cps.map((cp) => [cp.index, value])));
  /** Un passo su una cella, o su tutta la riga con Maiusc. */
  const step = (cp: number, id: string, delta: number, row: boolean, wrap: boolean) => {
    if (!row) { change(cp, id, delta, wrap); return; }
    if (wrap) setRow(id, (pips(cp, id) + delta + 4) % 4);
    else changeRow(id, delta);
  };
  const keys = (e: KeyboardEvent, cp: number, id: string) => {
    if (e.key === "ArrowUp" || e.key === "ArrowRight" || e.key === "+") { e.preventDefault(); step(cp, id, 1, e.shiftKey, false); }
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "-") { e.preventDefault(); step(cp, id, -1, e.shiftKey, false); }
    else if (/^[0-3]$/.test(e.key)) { e.preventDefault(); if (e.shiftKey) setRow(id, +e.key); else onPip(cp, id, +e.key); }
  };

  // rotella: listener nativo non passivo, l'unico modo di non far scorrere la
  // pagina; legge lo stato corrente da un ref
  const table = useRef<HTMLTableElement>(null);
  const stepRef = useRef(step);
  useLayoutEffect(() => { stepRef.current = step; });
  useEffect(() => {
    const el = table.current;
    if (!el) return;
    const onWheel = (e: globalThis.WheelEvent) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-pip]");
      // con Maiusc Windows manda la rotella in orizzontale
      const d = e.deltaY || e.deltaX;
      if (!b || !d) return;
      e.preventDefault();
      stepRef.current(+b.dataset.cp!, b.dataset.pip!, d < 0 ? 1 : -1, e.shiftKey, false);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [cps.length]);

  if (!cps.length) return <p className="text-faint text-[12px] m-0"><PipText text={y.panelNone} /></p>;

  const bonusTip = (r: PriorityRow): ReactNode => (
    <>
      {r.parts.map((p, i) => (
        <TipRow key={i} label={`${y.bonusSource[p.source]}: ${p.name}${p.who ? ` (${p.who})` : ""}`} value={`${p.bonus >= 0 ? "+" : ""}${nf(p.bonus * 100, 0)}%`} />
      ))}
      {r.nationalBonus ? <TipRow label={y.nationalBonus} value={`+${nf(r.nationalBonus * 100, 0)}%`} /> : null}
      <TipRow label={y.diversityLabel} value={<PipText text={y.diversityValue} />} />
      <TipRow strong label={y.panelBonus} value={`${nf((res[r.id]?.bonus ?? 0) * 100, 0)}%`} />
    </>
  );

  return (
    <div>
      <table className="yass-prio" ref={table}>
        <thead>
          <tr>
            <th className="text-left">{y.panelTitle}</th>
            {cps.map((cp) => (
              <th key={cp.index} className="yass-prio-cp">
                <FactionLogo template={faction} size={22} />
              </th>
            ))}
            <th><Tip title="/M" content={y.panelIPHint}><span className="inline-flex items-center gap-1"><ResourceIcon icon="ICO_investments" size={13} />/M</span></Tip></th>
            <th><Tip title={y.panelBonus} content={<PipText text={y.panelBonusHint} />}>{y.panelBonus}</Tip></th>
            <th><Tip title={y.panelShare} content={<PipText text={y.panelShareHint} />}>{y.panelShare}</Tip></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={used.includes(r.id) ? "yass-prio-used" : ""}>
              <td className="text-left whitespace-nowrap">
                <span className="inline-flex items-center gap-1.5">
                  <button type="button" className="yass-prio-row"
                    onClick={() => changeRow(r.id, 1)}
                    onContextMenu={(e) => { e.preventDefault(); changeRow(r.id, -1); }}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowUp" || e.key === "+") { e.preventDefault(); changeRow(r.id, 1); }
                      else if (e.key === "ArrowDown" || e.key === "-") { e.preventDefault(); changeRow(r.id, -1); }
                      else if (/^[0-3]$/.test(e.key)) { e.preventDefault(); setRow(r.id, +e.key); }
                    }}>
                    <ResourceIcon icon={r.icon} size={16} />
                    {r.name}
                  </button>
                  {!r.certain && <Tip title={y.panelUncertain} content={y.panelUncertainHint}><span className="text-faint">*</span></Tip>}
                </span>
              </td>
              {cps.map((cp) => {
                const v = pips(cp.index, r.id);
                const changed = v !== saved(cp.index, r.id);
                return (
                  <td key={cp.index} className="yass-prio-cp">
                    <button type="button" aria-label={`${r.name}: ${v}`} data-pip={r.id} data-cp={cp.index}
                      className={`yass-pip ${changed ? "yass-pip-changed" : ""}`}
                      onClick={(e) => step(cp.index, r.id, 1, e.shiftKey, true)}
                      onContextMenu={(e) => { e.preventDefault(); step(cp.index, r.id, -1, e.shiftKey, true); }}
                      onKeyDown={(e) => keys(e, cp.index, r.id)}>
                      <Pips n={v} />
                    </button>
                  </td>
                );
              })}
              <td className={res[r.id]?.ip ? "text-ink" : "text-faint"}>{nf(res[r.id]?.ip ?? 0, 1)}</td>
              <td className="text-dim"><Tip title={`${y.panelBonus} · ${r.name}`} content={bonusTip(r)} width={360}>{nf((res[r.id]?.bonus ?? 0) * 100, 0)}%</Tip></td>
              <td className="text-dim">{nf((res[r.id]?.share ?? 0) * 100, 0)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-faint text-[11.5px] mt-2 mb-0">
        <span className="yass-used-key" />{" "}
        {used.length ? y.panelUsed.replace("{sheet}", usedBy) : y.panelUsedNone.replace("{sheet}", usedBy)}
      </p>
      <p className="text-faint text-[11.5px] mt-1 mb-0">
        <PipText text={y.panelHelp} />{others > 0 && <> <PipText text={y.panelOthers.replace("{n}", String(others))} /></>}
      </p>
    </div>
  );
}
