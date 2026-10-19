import assert from "node:assert/strict";
import { replayBiasEkf, replayParticleFilter, replayUkf } from "../scripts/lib/speed_filters.mjs";

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

console.log("speed filter tests: OK");
