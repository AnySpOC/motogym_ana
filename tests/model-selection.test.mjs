import assert from "node:assert/strict";
import { evaluateGeneralization } from "../scripts/lib/model_selection.mjs";

function metric(rmse, count = 100) {
  return { count, sse: rmse ** 2 * count, rmse, bias: 0 };
}

function aggregate(values) {
  const valid = values.filter(Boolean);
  const count = valid.reduce((sum, value) => sum + value.count, 0);
  const sse = valid.reduce((sum, value) => sum + value.sse, 0);
  return {
    runs: valid.length,
    count,
    rmse: Math.sqrt(sse / count),
    macroRmse: valid.reduce((sum, value) => sum + value.rmse, 0) / valid.length,
    macroAbsBias: 0,
  };
}

const dates = Array.from({ length: 15 }, (_, index) => `2026-10-${String(Math.floor(index / 3) + 1).padStart(2, "0")}`);
const baseline = dates.map(() => metric(10));
const score = (value) => value.macroRmse + 0.15 * value.macroAbsBias;

const stable = evaluateGeneralization({
  evaluated: [
    { config: { id: "stable" }, perRun: dates.map(() => metric(8)) },
    { config: { id: "weak" }, perRun: dates.map(() => metric(9.5)) },
  ],
  baselinePerRun: baseline,
  dates,
  aggregate,
  score,
  bootstrapIterations: 500,
});
assert.equal(stable.accepted, true, "a stable 20% improvement on every date must pass");
assert.ok(Object.values(stable.gates).every(Boolean));
assert.deepEqual(stable.temporalHoldout.holdoutDates, ["2026-10-05"]);
assert.equal(stable.bootstrap.basis, "nested-out-of-fold");

const overfit = evaluateGeneralization({
  evaluated: [
    {
      config: { id: "overfit" },
      perRun: dates.map((date) => metric(date === "2026-10-05" ? 16 : 6)),
    },
    { config: { id: "safe" }, perRun: dates.map(() => metric(9.6)) },
  ],
  baselinePerRun: baseline,
  dates,
  aggregate,
  score,
  bootstrapIterations: 500,
});
assert.equal(overfit.finalCandidate.config.id, "overfit");
assert.equal(overfit.accepted, false, "an aggregate winner that harms an unseen date must be rejected");
assert.equal(overfit.gates.finalCandidateNoDateWorse, false);
assert.equal(overfit.gates.temporalHoldoutImproved, false);

const uniqueDates = [...new Set(dates)];
const selectionTrap = evaluateGeneralization({
  evaluated: uniqueDates.map((badDate) => ({
    config: { badDate },
    perRun: dates.map((date) => metric(date === badDate ? 11 : 5)),
  })),
  baselinePerRun: baseline,
  dates,
  aggregate,
  score,
  bootstrapIterations: 1000,
});
assert.ok(selectionTrap.finalCandidate.improvementRatio > 0.1);
assert.ok(selectionTrap.bootstrap.lower95 < 0,
  "bootstrap must use candidates selected without the held-out date");
assert.equal(selectionTrap.gates.bootstrapLowerBoundPositive, false);

const insufficient = evaluateGeneralization({
  evaluated: [{ config: { id: "small" }, perRun: dates.slice(0, 6).map(() => metric(5)) }],
  baselinePerRun: baseline.slice(0, 6),
  dates: dates.slice(0, 6),
  aggregate,
  score,
  bootstrapIterations: 100,
});
assert.equal(insufficient.accepted, false, "too few runs and dates must not authorize a product model change");
assert.equal(insufficient.evaluable, false);
assert.equal(insufficient.gates.enoughDates, false);
assert.equal(insufficient.gates.enoughRuns, false);
assert.ok(Object.entries(insufficient.gates)
  .filter(([name]) => name !== "enoughDates" && name !== "enoughRuns")
  .every(([, passed]) => passed === false),
"insufficient evidence must not display any model-acceptance gate as passed");

console.log("model selection tests: OK");
