/* Test delle formule di YASS: node --test (npm test). Node toglie i tipi da
   solo, niente dipendenze. Costanti: quelle che l'API manda oggi. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { panel, projectNation, type EffectConstants, type PanelCP, type PriorityRow, type ProjectionInputs, type YassConstants } from "./yass.ts";

const k: YassConstants = {
  popScalingBase: 50, popScalingExp: -0.35, knowledgeStep: 0.01, cohesionTarget: 5,
  maxIncrease: 0.1, maxDecrease: 0.1, maxDecreaseCap: 0.25, unrestBase: 10.5,
  hostileMax: 16, hostileDemocracyGap: 1.5, knowledgeIP: 1, pcgdpPerUnrest: 8835.928,
};
const e: EffectConstants = {
  ecoPcBase: 3, ecoPcPerResource: 1.5, ecoPcPerCore: 1.5, ecoIneq: 0.00015, ecoIneqPerResource: 0.0001,
  welIneq: -0.005, knoEdu: 0.005, govDem: 0.01, uniCoh: 0.1, uniCohMin: 0.025, uniEdu: -0.001,
  milTech: 0.00125, milTechMin: 2,
};
const YEARS = [0, 12, 60, 240];

function inputs(over: Partial<ProjectionInputs> = {}): ProjectionInputs {
  return {
    start: { cohesion: 5, pcgdp: 20000, inequality: 3, democracy: 5, education: 8 },
    rest: 5, scaling: 1, hostileShare: 0, armyOther: 0, resourceRegions: 0, coreEcoRegions: 0,
    completions: {},
    ...over,
  };
}

test("il Welfare non porta la disuguaglianza sotto 1", () => {
  const st = projectNation(k, e, inputs({ start: { ...inputs().start, inequality: 1.5 }, completions: { Welfare: 50 } }), YEARS);
  assert.equal(st.at(-1)!.inequality, 1);
});

test("l'Economia non la porta sopra 9", () => {
  const st = projectNation(k, e, inputs({ start: { ...inputs().start, inequality: 8.9 }, completions: { Economy: 500 } }), YEARS);
  assert.equal(st.at(-1)!.inequality, 9);
});

test("senza priorità che la muovano una disuguaglianza a zero resta zero (Somaliland)", () => {
  const st = projectNation(k, e, inputs({ start: { ...inputs().start, inequality: 0 } }), YEARS);
  assert.equal(st.at(-1)!.inequality, 0);
});

test("il Miltech sale, più in fretta da indietro, e si ferma al tetto", () => {
  const p = inputs({ completions: { Military: 20 }, miltech: { start: 3, max: 4, best: 4.6 } });
  const st = projectNation(k, e, p, YEARS);
  // primo mese: 20 × 0,00125 × 4,6 / 3
  const one = projectNation(k, e, p, [1])[0];
  assert.ok(Math.abs(one.miltech! - (3 + 20 * 0.00125 * 4.6 / 3)) < 1e-12);
  assert.equal(st.at(-1)!.miltech, 4);
});

test("al tetto il Military non vale e i suoi pallini passano alle altre", () => {
  const asked: string[][] = [];
  const p = inputs({
    completions: { Military: 20, Welfare: 0 },
    without: (invalid) => { asked.push(invalid); return { Welfare: 20 }; },
    miltech: { start: 3.99, max: 4, best: 4.6 },
    start: { ...inputs().start, inequality: 5 },
  });
  const st = projectNation(k, e, p, YEARS);
  assert.deepEqual(asked.at(-1), ["Military"]);
  assert.ok(st.at(-1)!.inequality < 5);       // il Welfare ha preso i pallini
});

test("senza esercito niente colonna del Miltech", () => {
  assert.equal(projectNation(k, e, inputs(), [0])[0].miltech, undefined);
});

const row = (id: string): PriorityRow => ({ id, name: id, icon: "", certain: true, factionBonus: 0, nationalBonus: 0, parts: [] });
const rows = [row("Economy"), row("Welfare")];
const mine: PanelCP = { index: 0, priorities: { Economy: 1 }, total: 1, disabled: false, mine: true };
const other: PanelCP = { index: 1, priorities: {}, total: 0, disabled: false, mine: false };

test("un punto non mio vuoto non cambia il pannello", () => {
  const a = panel(rows, [mine], {}, 10, 2, {});
  const b = panel(rows, [mine, other], {}, 10, 2, {});
  assert.deepEqual(b, a);
});

test("coi pallini, un punto non mio conta come se fosse mio", () => {
  const b = panel(rows, [mine, other], { 1: { Welfare: 2 } }, 10, 2, {});
  assert.equal(b.find((r) => r.id === "Economy")!.ip, 5);
  assert.equal(b.find((r) => r.id === "Welfare")!.ip, 5);
});
