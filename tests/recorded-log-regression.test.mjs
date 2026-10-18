import assert from "node:assert/strict";
import fs from "node:fs";

const fixture = JSON.parse(fs.readFileSync(
  new URL("./fixtures/2026-10-18-auto-start-stop.json", import.meta.url),
  "utf8",
));
const start = fixture.events.find((event) => event.type === "START");
const stop = fixture.events.find((event) => event.type === "STOP");
const nearestSample = (targetMs) => fixture.samples.reduce((nearest, sample) =>
  Math.abs(sample.timeMs - targetMs) < Math.abs(nearest.timeMs - targetMs) ? sample : nearest
);
const comparable = fixture.samples.filter((sample) =>
  Number.isFinite(sample.speedKmh) && Number.isFinite(sample.gpsSpeedKmh)
);
const speedRmseKmh = Math.sqrt(comparable.reduce((sum, sample) =>
  sum + (sample.speedKmh - sample.gpsSpeedKmh) ** 2
, 0) / comparable.length);

assert.equal(fixture.privacy.coordinatesRemoved, true);
assert.equal(fixture.privacy.absoluteTimestampsRemoved, true);
assert.ok(start, "recorded fixture must contain automatic START");
assert.ok(stop, "recorded fixture must contain automatic STOP");
assert.equal(start.timeMs, 0);
assert.equal(stop.timeMs, fixture.expected.stopTimeMs);
assert.ok(stop.timeMs > 30000, "recorded run must be long enough to exercise normal riding");
assert.ok(nearestSample(start.timeMs).gpsSpeedKmh < 1, "recorded START must begin from GPS standstill");
assert.ok(nearestSample(stop.timeMs).gpsSpeedKmh < 1, "recorded STOP must end at GPS standstill");
assert.ok(fixture.samples.some((sample) => sample.autoStopCandidate), "recorded STOP candidate must be present");
assert.ok(fixture.expected.autoStopCandidateSamples >= 30);
assert.ok(speedRmseKmh <= fixture.expected.speedRmseKmh + 0.001);
assert.ok(fixture.samples.every((sample, index, samples) =>
  index === 0 || sample.timeMs >= samples[index - 1].timeMs
), "recorded fixture must remain time ordered");
assert.equal("latitude" in fixture.samples[0], false);
assert.equal("longitude" in fixture.samples[0], false);

console.log(JSON.stringify({
  passed: true,
  fixture: fixture.id,
  sourceSamples: fixture.expected.sourceSampleCount,
  retainedSamples: fixture.samples.length,
  startGpsSpeedKmh: nearestSample(start.timeMs).gpsSpeedKmh,
  stopGpsSpeedKmh: nearestSample(stop.timeMs).gpsSpeedKmh,
  speedRmseKmh: Number(speedRmseKmh.toFixed(3)),
  autoStopCandidateSamples: fixture.expected.autoStopCandidateSamples,
}));
