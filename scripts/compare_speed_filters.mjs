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
import {
  replayBiasEkf,
  replayParticleFilter,
  replayTimestampEkf,
  replayUkf,
} from "./lib/speed_filters.mjs";
import { evaluateGeneralization } from "./lib/model_selection.mjs";

const V31 = {
  ...CURRENT,
  adaptiveNoise: true,
  vibrationProcessMax: 0,
  vibrationObservationMax: 2,
  vibrationObservationReferenceG: 0.25,
};

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

function timestampConfigs() {
  const result = [];
  for (const ageScale of [0, 0.5, 1]) {
    for (const gateSigma of [4, 6, 8]) {
      for (const residualFloorMs of [3, 5, 8]) result.push({ ageScale, gateSigma, residualFloorMs });
    }
  }
  return result;
}

function physicsUkfConfigs() {
  const result = [];
  for (const turnBankSigmaDeg of [5, 10, 20, 40]) {
    for (const turnYawMinDps of [4, 8, 12]) {
      for (const turnRollMaxDps of [5, 10, 15]) {
        for (const turnLongGMax of [0.1, 0.2]) {
          result.push({
            qSpeed: 1.2,
            qBias: 0.000005,
            gpsSigmaScale: 0.35,
            turnBankSigmaDeg,
            turnYawMinDps,
            turnRollMaxDps,
            turnLongGMax,
          });
        }
      }
    }
  }
  return result;
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
  return { family, evaluated };
}

function compactFamily(result, baselinePerRun, dates) {
  const generalization = evaluateGeneralization({
    evaluated: result.evaluated,
    baselinePerRun,
    dates,
    aggregate,
    score,
  });
  return {
    family: result.family,
    bestConfig: generalization.finalCandidate.config,
    aggregate: Object.fromEntries(Object.entries(generalization.finalCandidate.aggregate)
      .map(([key, value]) => [key, Number.isFinite(value) ? round(value) : value])),
    improvementRatio: round(generalization.finalCandidate.improvementRatio, 4),
    accepted: generalization.accepted,
    gates: generalization.gates,
    finalCandidateByDate: generalization.finalCandidate.byDate,
    crossValidation: generalization.nested.folds,
    temporalHoldout: generalization.temporalHoldout,
    bootstrap: generalization.bootstrap,
  };
}

function evaluateMode(matched, mode) {
  const baselinePerRun = matched.map((item) => compare(
    replaySpeed(item.run.samples, V31),
    item.track.points,
    mode === "aligned" ? item.sync.offsetSec : 0,
    "replaySpeedKmh",
  ));
  const baseline = aggregate(baselinePerRun);
  const dates = matched.map((item) => item.run.date);
  const families = [
    evaluateFamily(matched, "physics-ukf", replayUkf, physicsUkfConfigs(), mode),
    evaluateFamily(matched, "timestamp-robust-ekf", replayTimestampEkf, timestampConfigs(), mode),
    evaluateFamily(matched, "bias-ekf", replayBiasEkf, configs(), mode),
    evaluateFamily(matched, "ukf", replayUkf, configs(), mode),
    evaluateFamily(matched, "particle", replayParticleFilter, particleConfigs(), mode),
  ].map((result) => compactFamily(result, baselinePerRun, dates));
  families.sort((a, b) => a.aggregate.rmse - b.aggregate.rmse);
  return {
    baseline: { filter: "v31-adaptive-ekf", config: V31, aggregate: {
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
    roots: options.roots.map((root) => path.basename(path.resolve(root))),
    method: {
      runs: matched.length,
      dates: [...new Set(matched.map((item) => item.run.date))],
      state: "speed and longitudinal acceleration bias; physics UKF adds a gated nonlinear bank observation",
      acceptance: "four-gate policy: >=10% overall, nested CV, chronological holdout, positive bootstrap lower bound",
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
