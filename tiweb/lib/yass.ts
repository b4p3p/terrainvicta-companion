/* YASS: le formule del gioco (TINationState, IL di Assembly-CSharp.dll) che
   i fogli applicano ai valori della nazione. Le stesse di ticore/yass.py:
   le costanti arrivano dall'API, qui c'e' solo l'aritmetica. */

export interface YassConstants {
  popScalingBase: number;   // milioni
  popScalingExp: number;
  knowledgeStep: number;
  cohesionTarget: number;
  maxIncrease: number;
  maxDecrease: number;
  maxDecreaseCap: number;
  unrestBase: number;
  hostileMax: number;
  hostileDemocracyGap: number;
  knowledgeIP: number;
  pcgdpPerUnrest: number;
}

/** priorityEffectPopScaling = (pop / 50 mln) ^ −0,35 */
export const popScaling = (k: YassConstants, popM: number) =>
  popM > 0 ? Math.pow(popM / k.popScalingBase, k.popScalingExp) : 0;

/** knowledgePriorityCohesionChange: verso 5, con segno */
export function knowledgeStep(k: YassConstants, scaling: number, cohesion: number) {
  const s = cohesion < k.cohesionTarget ? 1 : cohesion > k.cohesionTarget ? -1 : 0;
  return s * scaling * k.knowledgeStep;
}

/** tetto del calo mensile: clamp((max(0, disug. − 3))² / 10, 0,1, 0,25) */
export const decreaseCap = (k: YassConstants, inequality: number) =>
  Math.min(k.maxDecreaseCap, Math.max(k.maxDecrease, Math.max(0, inequality - 3) ** 2 / 10));

/** GetMonthlyCohesionMovement */
export function monthlyMovement(k: YassConstants, cohesion: number, rest: number, inequality: number) {
  if (cohesion < rest) return Math.min(k.maxIncrease, rest - cohesion);
  if (cohesion > rest) return -Math.min(decreaseCap(k, inequality), cohesion - rest);
  return 0;
}

/** hostileClaimsImpactOnUnrest */
export const hostileUnrest = (k: YassConstants, share: number, democracy: number) =>
  share * k.hostileMax * (1 - democracy / 10);

/** Coesione mese per mese, con `completions` Conoscenze al mese e tutto il
    resto fermo. La Conoscenza non scavalca 5: il gioco la applica a piccoli
    passi e dall'altra parte cambia segno. */
export function project(k: YassConstants, start: number, rest: number, inequality: number,
  scaling: number, completions: number, months: number) {
  const out = [start];
  let c = start;
  for (let m = 0; m < months; m++) {
    // prima il ritorno verso il riposo, poi la Conoscenza del mese sul valore
    // nuovo: cosi' nessuna delle due scavalca il punto in cui si fermano
    c += monthlyMovement(k, c, rest, inequality);
    let kn = completions * knowledgeStep(k, scaling, c);
    if ((c < k.cohesionTarget && c + kn > k.cohesionTarget) || (c > k.cohesionTarget && c + kn < k.cohesionTarget)) {
      kn = k.cohesionTarget - c;
    }
    c = Math.min(10, Math.max(0, c + kn));
    out.push(c);
  }
  return out;
}

/** Primo mese in cui la serie raggiunge `target` (dal basso o dall'alto). */
export function monthsTo(series: number[], target: number) {
  const up = series[0] <= target;
  const i = series.findIndex((v) => (up ? v >= target - 1e-9 : v <= target + 1e-9));
  return i < 0 ? null : i;
}

// ---------------------------------------------------------------- priorita'
// Il pannello Priorita' del gioco (TINationState.ControlPointWeightsTotalToPriorityIP):
// gli IP del mese si dividono fra i punti di controllo, poi secondo i pallini
// validi del punto, x (1 + bonus della fazione + diversita' del punto + nazionale).

export interface PriorityRow {
  id: string; name: string; icon: string; certain: boolean;
  factionBonus: number; nationalBonus: number;
  parts: { source: "org" | "trait" | "effect"; name: string; who: string | null; bonus: number }[];
}
export interface PanelCP { index: number; priorities: Record<string, number>; total: number; disabled: boolean }
export type Pips = Record<number, Record<string, number>>;   // punto -> priorita' -> pallini

export interface RowResult { id: string; ip: number; bonus: number; share: number }

/** Una riga per priorita' valida: IP al mese dai miei punti, bonus medio,
    quota della nazione. `nationIP` al mese, `controlPoints` tutti i punti. */
export function panel(rows: PriorityRow[], cps: PanelCP[], pips: Pips, nationIP: number,
  controlPoints: number, diversity: Record<string, number>): RowResult[] {
  const valid = rows.map((r) => r.id);
  const perCP = nationIP / Math.max(1, controlPoints);
  return rows.map((r) => {
    let ip = 0, bonus = 0, share = 0;
    for (const cp of cps) {
      const p = pips[cp.index] ?? cp.priorities;
      const total = valid.reduce((s, k) => s + (p[k] ?? 0), 0);
      const withPips = valid.filter((k) => p[k]).length;
      const div = total && withPips > 1
        ? Object.entries(diversity).reduce((s, [k, b]) => s + (k !== r.id && valid.includes(k) ? b * (p[k] ?? 0) / total : 0), 0)
        : 0;
      let b = r.factionBonus + div + r.nationalBonus;
      if (cp.disabled && b > 0) b = 0;
      const mine = p[r.id] ?? 0;
      if (total && mine) ip += perCP * mine / total * (1 + b);
      bonus += b / cps.length;
      share += total ? mine / total / Math.max(1, controlPoints) : 0;
    }
    return { id: r.id, ip, bonus, share };
  });
}

// ---------------------------------------------------------------- effetti
// Cosa fa un completamento di ogni priorita' (TINationState.On*PriorityComplete
// e le proprieta' *PriorityXxxChange), moltiplicato per i completamenti del
// mese: IP alla priorita' / costo. Effetti di tecnologie sulle priorita' esclusi.

export interface EffectConstants {
  ecoPcBase: number; ecoPcPerResource: number; ecoPcPerCore: number;
  ecoIneq: number; ecoIneqPerResource: number; welIneq: number;
  knoEdu: number; govDem: number; uniCoh: number; uniCohMin: number; uniEdu: number;
}
export interface EffectInputs {
  scaling: number; education: number; democracy: number; cohesion: number;
  resourceRegions: number; coreEcoRegions: number;
}

/** Per completamento, priorita' per priorita'. */
export function perCompletion(k: YassConstants, e: EffectConstants, n: EffectInputs) {
  const s = n.scaling;
  const edu = n.education;
  const eduFactor = edu < 8.5 ? 8.5 / Math.max(1, edu) : edu >= 12 ? 12 / Math.max(1, edu) : 1;
  const govAsKnowledge = n.democracy >= 10;     // a democrazia 10 il Governo fa una Conoscenza
  const knowledge = { education: s * eduFactor * e.knoEdu, cohesion: knowledgeStep(k, s, n.cohesion) };
  return {
    Economy: {
      pcgdp: (e.ecoPcBase + n.resourceRegions * e.ecoPcPerResource + n.coreEcoRegions * e.ecoPcPerCore
        + n.democracy * 0.5 + edu) * s,
      inequality: (e.ecoIneq + e.ecoIneqPerResource * n.resourceRegions) * s,
    },
    Welfare: { inequality: e.welIneq * s },
    Knowledge: knowledge,
    Government: govAsKnowledge ? knowledge : { democracy: s * e.govDem * (edu / 10) },
    Unity: {
      cohesion: s * Math.min(e.uniCoh, Math.max(e.uniCohMin, e.uniCoh - e.uniCoh * 0.05 * (edu + n.democracy))),
      education: s * e.uniEdu,
    },
  } as Record<string, Partial<Record<"pcgdp" | "inequality" | "education" | "cohesion" | "democracy", number>>>;
}

// ---------------------------------------------------------------- proiezione
// La nazione mese per mese coi pallini di oggi: effetti delle priorita'
// ricalcolati ogni mese (con piu' istruzione l'Economia rende di piu'), ritorno
// della coesione verso il riposo. Fermi: popolazione, coesione di riposo, punti
// di investimento, esercito. Stima per orientarsi, non simulazione completa.

export interface NationState {
  cohesion: number; rest: number; pcgdp: number; inequality: number; democracy: number; education: number; unrest: number;
}
export interface ProjectionInputs {
  start: Omit<NationState, "unrest" | "rest">;
  rest: number; scaling: number; hostileShare: number; armyOther: number;
  resourceRegions: number; coreEcoRegions: number;
  /** completamenti al mese, priorita' per priorita' */
  completions: Record<string, number>;
  /** coesione di riposo dallo stato del mese; senza, resta `rest` */
  restOf?: (s: Omit<NationState, "unrest" | "rest">, unrest: number) => number;
}

const unrestOf = (k: YassConstants, s: Omit<NationState, "unrest" | "rest">, p: ProjectionInputs) =>
  Math.min(10, Math.max(0, k.unrestBase - s.cohesion - s.pcgdp / k.pcgdpPerUnrest
    + hostileUnrest(k, p.hostileShare, s.democracy) + p.armyOther));

/** Lo stato della nazione ai mesi richiesti (0 = oggi). */
export function projectNation(k: YassConstants, e: EffectConstants, p: ProjectionInputs, at: number[]): NationState[] {
  const last = Math.max(...at);
  let s = { ...p.start };
  const restAt = (st: typeof s) => (p.restOf ? p.restOf(st, unrestOf(k, st, p)) : p.rest);
  const out = new Map<number, NationState>([[0, { ...s, rest: restAt(s), unrest: unrestOf(k, s, p) }]]);
  const c = (id: string) => p.completions[id] ?? 0;
  for (let m = 1; m <= last; m++) {
    const per = perCompletion(k, e, {
      scaling: p.scaling, education: s.education, democracy: s.democracy, cohesion: s.cohesion,
      resourceRegions: p.resourceRegions, coreEcoRegions: p.coreEcoRegions,
    });
    const sum = (stat: "pcgdp" | "inequality" | "education" | "democracy") =>
      Object.keys(per).reduce((t, id) => t + c(id) * (per[id][stat] ?? 0), 0);
    // coesione: prima il ritorno verso il riposo, poi la Conoscenza (che non
    // scavalca 5), poi l'Unita'
    let coh = s.cohesion + monthlyMovement(k, s.cohesion, restAt(s), s.inequality);
    let kn = c("Knowledge") * knowledgeStep(k, p.scaling, coh) + (s.democracy >= 10 ? c("Government") * knowledgeStep(k, p.scaling, coh) : 0);
    if ((coh < k.cohesionTarget && coh + kn > k.cohesionTarget) || (coh > k.cohesionTarget && coh + kn < k.cohesionTarget)) kn = k.cohesionTarget - coh;
    coh += kn + c("Unity") * (per.Unity.cohesion ?? 0);
    s = {
      cohesion: Math.min(10, Math.max(0, coh)),
      pcgdp: Math.max(0, s.pcgdp + sum("pcgdp")),
      inequality: Math.max(0, s.inequality + sum("inequality")),
      democracy: Math.min(10, Math.max(0, s.democracy + sum("democracy"))),
      education: Math.max(0, s.education + sum("education")),
    };
    if (at.includes(m)) out.set(m, { ...s, rest: restAt(s), unrest: unrestOf(k, s, p) });
  }
  return at.map((m) => out.get(m)!);
}

// ---------------------------------------------------------------- coesione di riposo
// TINationState.cohesionRestState: 16 + termini, poi la spinta della democrazia
// verso 5 (sopra 6,5), fra 0 e 10. Popolazione, guerre e rivali restano fermi;
// distanze e ideologia sono il residuo ricavato dal valore del gioco.

export interface RestModel {
  base: number; population: number; wars: number; rivals: number;
  residual: number; estimated: boolean; pcPeak: number;
}
export interface RestInputs { inequality: number; education: number; democracy: number; unrest: number; pcgdp: number; hostileShare: number }
export interface RestConstants { ineqCohesionMult: number; severeInequality: number; hostileMax: number }

export function restParts(k: RestConstants, m: RestModel, s: RestInputs) {
  const inequality = Math.min(1, 0.5 + s.education / 20)
    * (-s.inequality * k.ineqCohesionMult - (s.inequality > k.severeInequality ? s.inequality - k.severeInequality : 0));
  const pcgdp = m.pcPeak && s.pcgdp < m.pcPeak ? (1 - s.pcgdp / m.pcPeak) * -s.inequality : 0;
  const hostile = -s.hostileShare * k.hostileMax * s.democracy / 10;
  const government = s.democracy <= 3.5
    ? (Math.pow(3.5, 1.285) - Math.pow(Math.max(0, s.democracy), 1.285)) * ((10 - s.unrest) / 10)
    : s.democracy <= 6.5 ? 2 * Math.abs(5 - s.democracy) - 3 : 0;
  const raw = m.base + m.population + m.wars + m.rivals + m.residual + inequality + pcgdp + hostile + government;
  let pulled = raw;
  if (s.democracy > 6.5) {
    const d = Math.abs(6.5 - s.democracy) / 2;
    pulled = raw <= 5 ? Math.min(5, raw + d) : Math.max(5, raw - d);
  }
  return { inequality, pcgdp, hostile, government, raw, pull: pulled - raw, rest: Math.min(10, Math.max(0, pulled)) };
}

/** La disuguaglianza piu' alta con cui il riposo resta almeno a `target`;
    null se non basta nemmeno a disuguaglianza zero. */
export function maxInequalityFor(k: RestConstants, m: RestModel, s: RestInputs, target: number) {
  const ok = (x: number) => restParts(k, m, { ...s, inequality: x }).rest >= target - 1e-9;
  if (!ok(0)) return null;
  let lo = 0, hi = 30;
  if (ok(hi)) return hi;
  for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (ok(mid)) lo = mid; else hi = mid; }
  return lo;
}
