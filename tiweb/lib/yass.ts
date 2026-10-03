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

// ---------------------------------------------------------------- crescita
// Gli IP seguono il PIL (TINationState.ModifyGDP, SetBaseInvestmentPoints_month);
// il tetto del Controllo missioni segue il PIL di ogni regione e l'istruzione
// (TIRegionState.get_maxMissionControl, NationalGDPProportion).

export interface GrowthConstants {
  ipGdpExp: number; unrestIPFree: number; unrestIPStep: number;
  mcDiv: number; mcDivPerEdu: number; mcDivMin: number;
  cpGdpScale: number; cpCostScaling: number; cpCostDivisor: number;
  ecosForCoreEco: number; ecosForCoreMining: number; ecosForCoreOil: number; coreEcoMinGdp: number;
}

/** IP dal PIL: (PIL / 1 mld)^0,35, meno la penalita' dei disordini sopra 2. */
export function baseIP(g: GrowthConstants, gdp: number, unrest: number) {
  const pen = Math.max(0, unrest - g.unrestIPFree) / g.unrestIPStep;
  return gdp > 0 ? Math.pow(gdp / 1e9, g.ipGdpExp) * Math.max(0, 1 - pen) : 0;
}

/** Divisore del tetto MC: PIL regionale (mld) per un posto in piu'. */
export const mcDivisor = (g: GrowthConstants, education: number) =>
  Math.max(g.mcDivMin, g.mcDiv - g.mcDivPerEdu * education);

/** Tetto del Controllo missioni: ogni regione 1 + PIL regionale / divisore,
    mai sotto quello che ha gia'. Il PIL si divide coi pesi delle regioni. */
export function mcCap(g: GrowthConstants, gdp: number, regions: { gdpWeight: number; missionControl: number }[], education: number) {
  const total = regions.reduce((t, r) => t + r.gdpWeight, 0);
  const div = mcDivisor(g, education);
  return regions.reduce((t, r) =>
    t + (total ? Math.max(r.missionControl, 1 + Math.floor(gdp / 1e9 * r.gdpWeight / total / div)) : r.missionControl), 0);
}

/** Costo in CP di tutta la nazione: (PIL / K)^0,6 / 2, diviso fra i suoi punti. */
export const cpCost = (g: GrowthConstants, gdp: number) =>
  g.cpGdpScale > 0 ? Math.pow(gdp / g.cpGdpScale, g.cpCostScaling) / g.cpCostDivisor : 0;

// ---------------------------------------------------------------- dividi
// Un pezzo di nazione con gli stessi pallini in percentuale: cosa rende in un
// mese. Senza disordini, eserciti e consiglieri; il PIL pro capite e' quello
// della nazione da cui nasce.

export interface PieceInputs {
  gdp: number;              // dollari
  pcgdp: number;            // del pezzo: la popolazione e' PIL / pro capite
  education: number; democracy: number;
  coreEcoRegions: number; resourceRegions: number;
  /** la regione piu' ricca ha piu' di 500 mld: puo' diventare economica centrale */
  coreEcoCandidate: boolean;
  ecoShare: number; mcShare: number;      // quota degli IP, 0-1
  ecoCost: number; mcCost: number;        // IP per un completamento
}
export interface Piece {
  population: number; ip: number; cp: number;
  ecoComp: number;          // Economie completate al mese
  pcgdpMonth: number;       // PIL pro capite in piu' al mese
  gdpMonth: number;         // PIL in piu' al mese (dollari)
  mcMonth: number;          // punti di Controllo missioni al mese, se c'e' posto
  capMonth: number;         // posti di Controllo missioni nuovi al mese dal PIL
  coreEcoMonths: number | null;  // mesi per una regione economica centrale
}

export function piece(k: YassConstants, e: EffectConstants, g: GrowthConstants, p: PieceInputs): Piece {
  const population = p.pcgdp > 0 ? p.gdp / p.pcgdp / 1e6 : 0;
  const ip = baseIP(g, p.gdp, 0);
  const ecoComp = ip * p.ecoShare / p.ecoCost;
  const per = perCompletion(k, e, {
    scaling: popScaling(k, population), education: p.education, democracy: p.democracy, cohesion: k.cohesionTarget,
    resourceRegions: p.resourceRegions, coreEcoRegions: p.coreEcoRegions,
  });
  const pcgdpMonth = ecoComp * (per.Economy.pcgdp ?? 0);
  const gdpMonth = pcgdpMonth * population * 1e6;
  return {
    population, ip, cp: cpCost(g, p.gdp), ecoComp, pcgdpMonth, gdpMonth,
    mcMonth: ip * p.mcShare / p.mcCost,
    // il tetto e' 1 + PIL regionale / divisore per regione: la somma cresce
    // come il PIL nazionale / divisore, a scalini
    capMonth: gdpMonth / 1e9 / mcDivisor(g, p.education),
    coreEcoMonths: p.coreEcoCandidate && ecoComp > 0 ? g.ecosForCoreEco / ecoComp : null,
  };
}

// ---------------------------------------------------------------- proiezione
// La nazione mese per mese coi pallini di oggi: effetti delle priorita'
// ricalcolati ogni mese (con piu' istruzione l'Economia rende di piu'), ritorno
// della coesione verso il riposo. Con `growth` gli IP seguono il PIL e i
// disordini, e il Controllo missioni si accumula fino al tetto. Fermi:
// popolazione, esercito. Stima per orientarsi, non simulazione completa.

export interface NationState {
  cohesion: number; rest: number; pcgdp: number; inequality: number; democracy: number; education: number; unrest: number;
  /** solo con `growth`: PIL, IP del mese, Controllo missioni e tetto */
  gdp?: number; ip?: number; mc?: number; mcCap?: number;
}
export interface GrowthInputs {
  g: GrowthConstants;
  population: number;                 // milioni, ferma
  ip0: number;                        // IP del mese oggi: i completamenti di oggi sono per questi
  /** bonus Consiglia gia' dentro ip0 e quello da provare, dal primo mese */
  advise0: number; advise: number;
  regions: { gdpWeight: number; missionControl: number }[];
  mcIP: number;                       // IP al mese sul Controllo missioni, oggi (gia' col bonus)
  mcCost: number;                     // IP per un punto di Controllo missioni
  /** completamenti al mese col Controllo missioni pieno: i suoi pallini non contano piu' */
  completionsFull: Record<string, number>;
}
export interface ProjectionInputs {
  start: Omit<NationState, "unrest" | "rest">;
  rest: number; scaling: number; hostileShare: number; armyOther: number;
  resourceRegions: number; coreEcoRegions: number;
  /** completamenti al mese, priorita' per priorita' */
  completions: Record<string, number>;
  /** coesione di riposo dallo stato del mese; senza, resta `rest` */
  restOf?: (s: Omit<NationState, "unrest" | "rest">, unrest: number) => number;
  growth?: GrowthInputs;
}

const unrestOf = (k: YassConstants, s: Omit<NationState, "unrest" | "rest">, p: ProjectionInputs) =>
  Math.min(10, Math.max(0, k.unrestBase - s.cohesion - s.pcgdp / k.pcgdpPerUnrest
    + hostileUnrest(k, p.hostileShare, s.democracy) + p.armyOther));

/** Lo stato della nazione ai mesi richiesti (0 = oggi). */
export function projectNation(k: YassConstants, e: EffectConstants, p: ProjectionInputs, at: number[]): NationState[] {
  const last = Math.max(...at);
  let s = { ...p.start };
  const gr = p.growth;
  const restAt = (st: typeof s) => (p.restOf ? p.restOf(st, unrestOf(k, st, p)) : p.rest);
  // crescita: PIL dal PIL pro capite (popolazione ferma), IP dal PIL, MC verso il tetto
  const gdpOf = (st: typeof s) => (gr ? st.pcgdp * gr.population * 1e6 : 0);
  // IP = base dal PIL x (1 + Consiglia) + il resto (eserciti, consiglieri
  // altrui) fermo, ricavato da oggi: al mese 0 gli IP sono quelli della cella
  const ipOther = gr ? gr.ip0 - baseIP(gr.g, gdpOf(p.start), unrestOf(k, p.start, p)) * (1 + gr.advise0) : 0;
  const ipOf = (st: typeof s) => (gr ? Math.max(0, baseIP(gr.g, gdpOf(st), unrestOf(k, st, p)) * (1 + gr.advise) + ipOther) : 0);
  let mc = gr ? gr.regions.reduce((t, r) => t + r.missionControl, 0) : 0;
  let mcPoints = 0;
  const capOf = (st: typeof s) => (gr ? mcCap(gr.g, gdpOf(st), gr.regions, st.education) : 0);
  const snap = (st: typeof s, now = false): NationState => ({
    ...st, rest: restAt(st), unrest: unrestOf(k, st, p),
    ...(gr ? { gdp: gdpOf(st), ip: now ? gr.ip0 : ipOf(st), mc, mcCap: capOf(st) } : {}),
  });
  const out = new Map<number, NationState>([[0, snap(s, true)]]);
  for (let m = 1; m <= last; m++) {
    // gli IP del mese rispetto a oggi: tutti i completamenti scalano con loro;
    // a Controllo missioni pieno la sua priorita' non e' valida e i suoi pallini
    // passano alle altre
    let ratio = 1, comp = p.completions;
    if (gr) {
      ratio = gr.ip0 > 0 ? ipOf(s) / gr.ip0 : 1;
      if (mc < capOf(s)) {
        mcPoints += gr.mcIP * ratio;
        while (mcPoints >= gr.mcCost && mc < capOf(s)) { mcPoints -= gr.mcCost; mc += 1; }
      } else {
        comp = gr.completionsFull;
      }
    }
    const c = (id: string) => (comp[id] ?? 0) * ratio;
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
    if (at.includes(m)) out.set(m, snap(s));
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
