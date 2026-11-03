import assert from "node:assert/strict";
import { armAtStandstill, calibrateStationary, createSimulationHarness } from "./app-simulation-harness.mjs";

const sampleRates = [30, 60, 100];
const runsPerRate = 8;
const results = [];

function launch(harness) {
  const onsetAt = harness.clock;
  while (harness.api.state.mode !== "running" && harness.clock - onsetAt < 700) {
    harness.step({ rawY: 0.28 });
  }
  assert.equal(harness.api.state.mode, "running", "every endurance run must detect START");
  return harness.clock - onsetAt;
}

function stop(harness) {
  const onsetAt = harness.clock;
  let nextGpsAt = harness.clock;
  while (harness.api.state.mode === "running" && harness.clock - onsetAt < 6000) {
    if (harness.clock >= nextGpsAt - 0.001) {
      harness.gps(0, { latitude: 35, longitude: 139, accuracy: 5 });
      nextGpsAt += 300;
    }
    harness.step();
  }
  assert.equal(harness.api.state.mode, "armed", "every endurance run must detect STOP");
  return harness.clock - onsetAt;
}

for (const sampleHz of sampleRates) {
  const harness = createSimulationHarness({ sampleHz });
  calibrateStationary(harness);
  armAtStandstill(harness);
  const startLatencies = [];
  const stopLatencies = [];

  for (let runIndex = 0; runIndex < runsPerRate; runIndex += 1) {
    startLatencies.push(launch(harness));
    harness.runFor(1200, () => ({}), { gpsEveryMs: 300, gpsSpeed: 4 });
    stopLatencies.push(stop(harness));
    harness.runFor(800, () => ({}), { gpsEveryMs: 300, gpsSpeed: 0 });
    assert.equal(harness.api.state.autoStartReady, true, "automatic timing must rearm without button input");
  }

  harness.runFor(5400, () => ({}), { gpsEveryMs: 400, gpsSpeed: 0 });
  await harness.flushStorage();
  const savedRuns = harness.savedRuns();
  assert.equal(savedRuns.length, runsPerRate, "every endurance run must remain in IndexedDB");
  assert.equal(new Set(savedRuns.map((run) => run.id)).size, runsPerRate, "run IDs must stay unique");

  for (const run of savedRuns) {
    const rideSamples = run.samples.filter((sample) => sample.phase !== "poststop");
    const postStopSamples = run.samples.filter((sample) => sample.phase === "poststop");
    assert.equal(run.appVersion, "v36");
    assert.equal(run.schemaVersion, 7);
    assert.equal(run.summary.status, "complete");
    assert.equal(run.diagnostics.postStopCaptureStatus, "complete");
    assert.ok(postStopSamples.length >= Math.floor(sampleHz * 4.8), "post-STOP tail must survive overlapping next runs");
    assert.equal(run.summary.sampleCount, rideSamples.length);
    assert.equal(run.summary.postStopSampleCount, postStopSamples.length);
    assert.equal(run.summary.totalSampleCount, run.samples.length);
    assert.equal(run.summary.maxSpeedKmh,
      Math.round(Math.max(...rideSamples.map((sample) => sample.speedKmh || 0)) * 100) / 100,
      "next-run post-STOP speed must not change the previous run summary");
  }

  results.push({
    sampleHz,
    runs: savedRuns.length,
    maxStartLatencyMs: Math.round(Math.max(...startLatencies)),
    maxStopLatencyMs: Math.round(Math.max(...stopLatencies)),
    minimumPostStopSamples: Math.min(...savedRuns.map((run) => run.summary.postStopSampleCount)),
  });
}

console.log(JSON.stringify({
  passed: true,
  totalRuns: sampleRates.length * runsPerRate,
  results,
}, null, 2));
