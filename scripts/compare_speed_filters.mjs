#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  CURRENT,
  aggregate,
  collectMatchedRuns,
  compare,
  replaySpeed,
  round,
} from "./evaluate_existing_runs.mjs";
import { replayBiasEkf, replayParticleFilter, replayUkf } from "./lib/speed_filters.mjs";

function parseArgs(argv) {
  const options = { roots: [], json: null };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--root") options.roots.push(argv[++i]);
    else if (argv[i] === "--json") options.json = argv[++i];
    else throw new Error(`Unknown option: ${argv[i]}`);
  }
  if (!options.roots.length) options.roots.push("C:\\Users\\foxho\\Videos");
  return options;
}

function configs() {
  const values = [];
  for (const qSpeed of [0.2, 0.6, 1.2]) {
    for (const qBias of [0.000005, 0.00002, 0.00008]) {
      for (const gpsSigmaScale of [0.35, 0.7]) values.push({ qSpeed, qBias, gpsSigmaScale });
    }
  }
  return values;
}

function particleConfigs() {
  return [
    { particles: 160, qSpeed: 0.1, qBias: 0.000005, gpsSigmaScale: 0.35 },
    { particles: 160, qSpeed: 0.25, qBias: 0.00002, gpsSigmaScale: 0.35 },
    { particles: 160, qSpeed: 0.25, qBias: 0.00002, gpsSigmaScale: 0.7 },
    { particles: 160, qSpeed: 0.6, qBias: 0.00008, gpsSigmaScale: 0.7 },
  ];
}

function score(metric) {
  return metric.macroRmse + 0.15 * metric.macroAbsBias;
}

function evaluateCandidate(matched, replay, config, offsetMode) {
  const perRun = matched.map((item) => compare(
    replay(item.run.samples, config),
    item.track.points,
    offsetMode === "aligned" ? item.sync.offsetSec : 0,
    "replaySpeedKmh",
  ));
  return { config, perRun, aggregate: aggregate(perRun) };
}

function evaluateFamily(matched, family, replay, familyConfigs, offsetMode) {
  const evaluated = familyConfigs.map((config) => evaluateCandidate(matched, replay, config, offsetMode));
  evaluated.sort((a, b) => score(a.aggregate) - score(b.aggregate));
  const dates = [...new Set(matched.map((item) => item.run.date))];
  const crossValidation = dates.map((date) => {
    const training = matched.map((item, index) => item.run.date !== date ? index : -1).filter((index) => index >= 0);
    const testing = matched.map((item, index) => item.run.date === date ? index : -1).filter((index) => index >= 0);
    const selected = [...evaluated].sort((a, b) => score(aggregate(training.map((index) => a.perRun[index])))
      - score(aggregate(training.map((index) => b.perRun[index]))))[0];
    return { date, config: selected.config, test: aggregate(testing.map((index) => selected.perRun[index])) };
  });
  return { family, best: evaluated[0], crossValidation };
}

function compactFamily(result, baseline, baselineByDate) {
  const improvement = (baseline.rmse - result.best.aggregate.rmse) / baseline.rmse;
  const folds = result.crossValidation.map((fold) => ({
    date: fold.date,
    config: fold.config,
    rmse: round(fold.test.rmse),
    baselineRmse: round(baselineByDate.get(fold.date)?.rmse),
    improved: fold.test.rmse <= baselineByDate.get(fold.date)?.rmse,
  }));
  const accepted = improvement >= 0.1 && folds.every((fold) => fold.improved);
  return {
    family: result.family,
    bestConfig: result.best.config,
    aggregate: {
      rmse: round(result.best.aggregate.rmse),
      macroRmse: round(result.best.aggregate.macroRmse),
      macroAbsBias: round(result.best.aggregate.macroAbsBias),
    },
    improvementRatio: round(improvement, 4),
    accepted,
    crossValidation: folds,
  };
}

function evaluateMode(matched, mode) {
  const baselinePerRun = matched.map((item) => compare(
    replaySpeed(item.run.samples, CURRENT),
    item.track.points,
    mode === "aligned" ? item.sync.offsetSec : 0,
    "replaySpeedKmh",
  ));
  const baseline = aggregate(baselinePerRun);
  const dates = [...new Set(matched.map((item) => item.run.date))];
  const baselineByDate = new Map(dates.map((date) => [date, aggregate(matched
    .map((item, index) => item.run.date === date ? baselinePerRun[index] : null))]));
  const families = [
    evaluateFamily(matched, "bias-ekf", replayBiasEkf, configs(), mode),
    evaluateFamily(matched, "ukf", replayUkf, configs(), mode),
    evaluateFamily(matched, "particle", replayParticleFilter, particleConfigs(), mode),
  ].map((result) => compactFamily(result, baseline, baselineByDate));
  families.sort((a, b) => a.aggregate.rmse - b.aggregate.rmse);
  return {
    baseline: { filter: "current-ekf", config: CURRENT, aggregate: {
      rmse: round(baseline.rmse), macroRmse: round(baseline.macroRmse), macroAbsBias: round(baseline.macroAbsBias),
    } },
    families,
    decision: families.some((family) => family.accepted)
      ? "validate the accepted filter on-device"
      : "keep the current on-device filter; no alternative passed the 10% cross-date gate",
  };
}

function main() {
  const options = parseArgs(process.argv);
  const { matched, excluded } = collectMatchedRuns(options.roots);
  if (!matched.length) throw new Error("No GPS-matched runs passed the quality gate");
  const output = {
    generatedAt: new Date().toISOString(),
    roots: options.roots.map((root) => path.resolve(root)),
    method: {
      runs: matched.length,
      dates: [...new Set(matched.map((item) => item.run.date))],
      state: "speed and longitudinal acceleration bias",
      acceptance: ">= 10% overall RMSE improvement and no held-out date worse than current EKF",
      reference: "GoPro GPX speed; useful field reference, not laboratory ground truth",
    },
    aligned: evaluateMode(matched, "aligned"),
    realTime: evaluateMode(matched, "realTime"),
    excludedCount: excluded.length,
  };
  const serialized = JSON.stringify(output, null, 2);
  if (options.json) fs.writeFileSync(options.json, `${serialized}\n`);
  console.log(serialized);
}

main();
