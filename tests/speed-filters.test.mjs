import assert from "node:assert/strict";
import {
  replayBiasEkf,
  replayParticleFilter,
  replayTimestampEkf,
  replayUkf,
} from "../scripts/lib/speed_filters.mjs";

function samples({ count = 240, accelerationG = 0, gpsSpeedKmh = 0 } = {}) {
  return Array.from({ length: count }, (_, index) => ({
    t: index * 50,
    longG: accelerationG,
    appSpeedKmh: 0,
    gpsSpeedKmh: index % 20 === 0 ? gpsSpeedKmh : null,
    gpsAccuracyM: 5,
    gpsSource: "coordinates",
    gpsTimestamp: index % 20 === 0 ? index : null,
  }));
}

const filters = [
  ["timestamp robust EKF", replayTimestampEkf],
  ["bias EKF", replayBiasEkf],
  ["UKF", replayUkf],
  ["particle filter", replayParticleFilter],
];

for (const [name, replay] of filters) {
  const stationary = replay(samples(), {});
  assert.ok(stationary.every((sample) => Number.isFinite(sample.replaySpeedKmh)), `${name} must stay finite`);
  assert.ok(stationary.at(-1).replaySpeedKmh < 2, `${name} boundary drift must remain bounded before ZUPT`);

  const gpsConvergence = replay(samples({ gpsSpeedKmh: 18 }), {});
  assert.ok(gpsConvergence.at(-1).replaySpeedKmh > 12, `${name} must converge toward GPS speed`);
  assert.ok(gpsConvergence.at(-1).replaySpeedKmh < 24, `${name} must not overshoot GPS excessively`);
}

const particleInput = samples({ count: 80, accelerationG: 0.03, gpsSpeedKmh: 8 });
assert.deepEqual(
  replayParticleFilter(particleInput, { seed: 42 }).map((sample) => sample.replaySpeedKmh),
  replayParticleFilter(particleInput, { seed: 42 }).map((sample) => sample.replaySpeedKmh),
  "particle replay must be deterministic for regression tests",
);

const coordinatedTurn = samples({ count: 120, gpsSpeedKmh: 36 }).map((sample) => ({
  ...sample,
  yawRateDps: 10,
  rollRateDps: 0,
  gravityBankDeg: 10,
  vibrationG: 0.1,
}));
const physicsUkf = replayUkf(coordinatedTurn, {
  qSpeed: 1.2,
  qBias: 0.000005,
  gpsSigmaScale: 0.35,
  turnBankSigmaDeg: 10,
  turnYawMinDps: 4,
  turnRollMaxDps: 10,
  turnLongGMax: 0.1,
});
assert.ok(physicsUkf.some((sample) => sample.turnObservationUsed), "physics UKF must use valid steady-turn observations");
assert.ok(physicsUkf.every((sample) => Number.isFinite(sample.replaySpeedKmh)), "physics UKF must remain finite");

console.log("speed filter tests: OK");
