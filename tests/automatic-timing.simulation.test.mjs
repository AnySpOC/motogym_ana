import assert from "node:assert/strict";
import {
  armAtStandstill,
  calibrateStationary,
  createSimulationHarness,
} from "./app-simulation-harness.mjs";

const results = [];

function record(name, metrics = {}) {
  results.push({ name, passed: true, ...metrics });
}

function launch(harness, vector = [0, 0.28, 0], gravity = [0, 0, 1]) {
  const onsetAt = harness.clock;
  let detectedAt = null;
  for (let index = 0; index < 30; index += 1) {
    harness.step({
      rawX: vector[0],
      rawY: vector[1],
      rawZ: vector[2],
      gravityX: gravity[0],
      gravityY: gravity[1],
      gravityZ: gravity[2],
    });
    if (harness.api.state.mode === "running") {
      detectedAt = harness.clock;
      break;
    }
  }
  assert.notEqual(detectedAt, null, "sustained launch acceleration must trigger START");
  return { onsetAt, detectedAt, latencyMs: detectedAt - onsetAt };
}

{
  const harness = createSimulationHarness();
  calibrateStationary(harness);
  assert.equal(harness.api.state.calibrationCompleted, true);
  harness.gps(0);
  harness.api.enableAutoMeasurement();
  harness.runFor(5000, (_elapsed, clock) => {
    const phase = 2 * Math.PI * 24 * clock / 1000;
    const vibration = 0.22 * Math.sin(phase);
    return {
      rawX: vibration,
      rawY: -vibration,
      rawZ: vibration * 0.35,
      yawRate: vibration * 20,
    };
  }, { gpsEveryMs: 400, gpsSpeed: 0 });
  assert.equal(harness.api.state.mode, "armed", "engine vibration must not cause a false START");
  assert.equal(harness.api.state.autoStartReady, true);
  assert.equal(harness.api.state.currentRunId, "");
  record("stationary-engine-vibration", { simulatedMs: 5000, falseStarts: 0 });
}

{
  const harness = createSimulationHarness();
  calibrateStationary(harness);
  harness.api.state.storageAvailable = false;
  harness.api.render();
  assert.equal(harness.elements.get("#autoOnButton").disabled, false,
    "automatic timing button must remain actionable while storage recovery is available");
  assert.equal(harness.elements.get("#manualOnButton").disabled, false,
    "manual timing button must remain actionable while storage recovery is available");
  harness.api.enableAutoMeasurement();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(harness.api.state.mode, "armed", "automatic timing must continue after storage reconnects");

  const manualHarness = createSimulationHarness();
  calibrateStationary(manualHarness);
  manualHarness.api.state.storageAvailable = false;
  manualHarness.api.startManualMeasurement();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(manualHarness.api.state.mode, "running", "manual timing must continue after storage reconnects");
  record("storage-recovery", { autoRecovered: true, manualRecovered: true });
}

{
  const harness = createSimulationHarness();
  calibrateStationary(harness);
  harness.gps(0, { timestampOffsetMs: -10_000 });
  harness.api.enableAutoMeasurement();
  harness.runFor(1000);
  assert.equal(harness.api.state.autoStartReady, false, "an old GPS observation must not arm START detection");
  assert.equal(harness.api.state.mode, "armed");
  harness.gps(0);
  harness.runFor(800, () => ({}), { gpsEveryMs: 300, gpsSpeed: 0 });
  assert.equal(harness.api.state.autoStartReady, true, "fresh stopped GPS must recover readiness");
  record("stale-gps-observation-guard", { staleAgeMs: 10_000, recovered: true });
}

{
  const harness = createSimulationHarness();
  calibrateStationary(harness);
  harness.api.startManualMeasurement();
  const timestampMs = Date.parse("2026-10-18T00:00:00.000Z") + harness.clock;
  harness.gps(8, { timestampMs });
  const firstFilteredSpeed = harness.api.state.speedMs;
  const firstSequence = harness.api.state.gpsObservationSequence;
  assert.ok(firstFilteredSpeed > 0, "a new GPS observation must update the speed filter");

  for (let index = 0; index < 10; index += 1) harness.gps(0, { timestampMs });
  harness.gps(0, { timestampMs: timestampMs - 1000 });
  assert.equal(harness.api.state.speedMs, firstFilteredSpeed,
    "duplicate and out-of-order GPS timestamps must not be fused repeatedly");
  assert.equal(harness.api.state.gpsObservationSequence, firstSequence,
    "duplicate and out-of-order GPS timestamps must not advance the observation sequence");

  harness.gps(0, { timestampMs: timestampMs + 1000 });
  assert.ok(harness.api.state.speedMs < firstFilteredSpeed, "a genuinely new GPS timestamp must update the filter");
  assert.equal(harness.api.state.gpsObservationSequence, firstSequence + 1);
  record("gps-observation-deduplication", { duplicateCallbacks: 10, outOfOrderCallbacks: 1 });
}

{
  const harness = createSimulationHarness();
  calibrateStationary(harness);
  harness.gps(6);
  harness.api.enableAutoMeasurement();
  harness.runFor(2500, () => ({ rawY: 0.3 }), { gpsEveryMs: 400, gpsSpeed: 6 });
  assert.equal(harness.api.state.mode, "armed", "Auto enabled while moving must not START");
  assert.equal(harness.api.state.autoStartReady, false);

  harness.runFor(900, () => ({}), { gpsEveryMs: 300, gpsSpeed: 0 });
  assert.equal(harness.api.state.autoStartReady, true, "a later standstill must arm START detection");
  const timing = launch(harness);
  assert.ok(timing.latencyMs <= 300, `START latency ${timing.latencyMs} ms exceeds 300 ms`);
  record("moving-auto-enable-guard", { startLatencyMs: Math.round(timing.latencyMs) });
}

{
  const harness = createSimulationHarness();
  calibrateStationary(harness);
  harness.api.enableAutoMeasurement();
  harness.runFor(3200);
  assert.equal(harness.api.state.autoStartReady, false, "missing GPS must keep automatic timing unarmed");
  assert.equal(harness.api.state.mode, "armed");
  harness.api.disableAutoMeasurement();
  await harness.flushStorage();
  const diagnosticRuns = harness.savedRuns();
  assert.equal(diagnosticRuns.length, 1, "cancelling an undetected START must preserve diagnostics");
  assert.equal(diagnosticRuns[0].summary.status, "no-start");
  assert.equal(diagnosticRuns[0].events[0].type, "NO_START");
  assert.ok(diagnosticRuns[0].samples.every((sample) => sample.timeMs <= 0));
  assert.ok(diagnosticRuns[0].samples.every((sample) => sample.latitude === null && sample.longitude === null));
  record("missing-gps-guard", { simulatedMs: 3200, falseStarts: 0 });
}

{
  const harness = createSimulationHarness();
  calibrateStationary(harness);
  armAtStandstill(harness);
  assert.equal(harness.api.state.autoStartReady, true);
  harness.runFor(4500, () => ({}), { gpsEveryMs: 500, gpsSpeed: 0 });
  const firstStart = launch(harness);
  assert.ok(firstStart.latencyMs <= 300, `START latency ${firstStart.latencyMs} ms exceeds 300 ms`);

  harness.runFor(2000, () => ({}), { gpsEveryMs: 300, gpsSpeed: 5 });
  harness.runFor(500, () => ({}), { gpsEveryMs: 200, gpsSpeed: 0 });
  assert.equal(harness.api.state.mode, "running", "a 500 ms pause must not end the run");
  assert.equal(harness.savedRuns().length, 0, "a short pause must not save a false run");
  harness.runFor(500, () => ({ rawY: 0.04 }), { gpsEveryMs: 200, gpsSpeed: 5 });
  assert.equal(harness.api.state.autoStopCandidate, false, "movement must cancel the STOP candidate");

  const stopEvidenceAt = harness.clock;
  let stopDetectedAt = null;
  for (let index = 0; index < 240; index += 1) {
    if (index % 12 === 0) harness.gps(0);
    harness.step();
    if (harness.api.state.mode === "armed") {
      stopDetectedAt = harness.clock;
      break;
    }
  }
  assert.notEqual(stopDetectedAt, null, "sustained stop evidence must trigger STOP");
  assert.equal(harness.api.state.mode, "armed", "confirmed STOP must rearm automatic timing");
  assert.equal(harness.api.state.measurementMode, "auto");
  await harness.flushStorage();

  const saved = harness.savedRuns();
  assert.equal(saved.length, 1, "the completed first run must be persisted");
  const firstRun = saved[0];
  const preStartSamples = firstRun.samples.filter((sample) => sample.phase === "prestart");
  assert.ok(preStartSamples.length >= 250, "the saved run must include about five seconds before START");
  assert.ok(Math.min(...preStartSamples.map((sample) => sample.timeMs)) <= -4900);
  assert.ok(Math.min(...preStartSamples.map((sample) => sample.timeMs)) >= -5050);
  assert.equal(firstRun.appVersion, "v35");
  assert.equal(firstRun.schemaVersion, 7);
  assert.equal(firstRun.diagnostics.preflight.storageAvailable, true);
  assert.equal(firstRun.diagnostics.preflight.calibrationCompleted, true);
  assert.equal(firstRun.diagnostics.preStartSampleCount, preStartSamples.length);
  assert.ok(firstRun.diagnostics.observedSampleRateHz >= 59);
  assert.ok(preStartSamples.every((sample) => Number.isFinite(sample.startThresholdG)));
  const stopEvent = firstRun.events.find((event) => event.type === "STOP");
  assert.ok(stopEvent, "the persisted run must contain STOP");
  assert.equal(firstRun.durationMs, stopEvent.timeMs, "run duration must use the backdated STOP onset");
  const stopConfirmationMs = stopDetectedAt - stopEvidenceAt;
  assert.ok(stopConfirmationMs >= 2900 && stopConfirmationMs <= 3500,
    `STOP confirmation ${stopConfirmationMs} ms must include multi-observation GPS evidence`);

  harness.runFor(800, () => ({}), { gpsEveryMs: 300, gpsSpeed: 0 });
  assert.equal(harness.api.state.autoStartReady, true, "automatic rearm must reconfirm standstill");
  const secondStart = launch(harness);
  assert.ok(secondStart.latencyMs <= 300);
  assert.equal(harness.api.state.mode, "running", "the second run must start without another button press");
  assert.notEqual(harness.api.state.currentRunId, firstRun.id);
  record("two-run-auto-cycle", {
    firstStartLatencyMs: Math.round(firstStart.latencyMs),
    stopConfirmationMs: Math.round(stopConfirmationMs),
    secondStartLatencyMs: Math.round(secondStart.latencyMs),
    savedRuns: saved.length,
    preStartSamples: preStartSamples.length,
  });
}

{
  const harness = createSimulationHarness();
  calibrateStationary(harness);
  armAtStandstill(harness);
  launch(harness);

  let longitude = 139;
  const crawlSpeedMs = 0.7;
  const longitudeMetersPerDegree = 111_320 * Math.cos(35 * Math.PI / 180);
  for (let elapsedMs = 0; elapsedMs < 6000; elapsedMs += 500) {
    longitude += crawlSpeedMs * 0.5 / longitudeMetersPerDegree;
    harness.gps(crawlSpeedMs, { longitude });
    harness.runFor(500);
  }
  assert.equal(harness.api.state.mode, "running",
    "continuous 2.5 km/h position movement must not be classified as STOP");
  assert.equal(harness.api.state.autoStopCandidate, false);

  for (let elapsedMs = 0; elapsedMs < 2600; elapsedMs += 500) {
    harness.gps(0, { longitude });
    harness.runFor(500);
  }
  assert.equal(harness.api.state.mode, "armed",
    "repeated zero-speed observations at one position must confirm STOP");
  harness.runFor(5200, () => ({}), { gpsEveryMs: 500, gpsSpeed: 0 });
  await harness.flushStorage();
  const savedRun = harness.savedRuns()[0];
  const postStopSamples = savedRun.samples.filter((sample) => sample.phase === "poststop");
  assert.ok(postStopSamples.length >= 290, "about five seconds of post-STOP IMU data must be persisted");
  assert.ok(postStopSamples.at(-1).timeMs - postStopSamples[0].timeMs >= 4900);
  assert.equal(savedRun.diagnostics.postStopCaptureStatus, "complete");
  assert.equal(savedRun.diagnostics.postStopSampleCount, postStopSamples.length);
  assert.equal(savedRun.summary.postStopSampleCount, postStopSamples.length);
  assert.equal(savedRun.summary.sampleCount + savedRun.summary.postStopSampleCount,
    savedRun.summary.totalSampleCount);
  record("low-speed-crawl-stop-guard", {
    crawlSpeedKmh: crawlSpeedMs * 3.6,
    crawlDurationMs: 6000,
    postStopSamples: postStopSamples.length,
  });
}

{
  const harness = createSimulationHarness();
  calibrateStationary(harness);
  armAtStandstill(harness);
  launch(harness);
  harness.api.disableSensors();
  assert.equal(harness.api.state.mode, "sensor-off");
  assert.equal(harness.api.state.sensorEnabled, false);
  assert.equal(harness.api.state.autoMeasurementEnabled, false,
    "Sensor OFF must cancel Auto instead of rearming it");
  assert.equal(harness.api.state.measurementMode, "none");
  await harness.flushStorage();
  assert.equal(harness.savedRuns().length, 1, "Sensor OFF must preserve the interrupted run");
  record("sensor-off-cancels-auto", { savedRuns: harness.savedRuns().length });
}

for (const mounting of [
  { name: "screen-up", gravity: [0, 0, 1], forward: [0, 0.28, 0] },
  { name: "right-edge-down", gravity: [1, 0, 0], forward: [0, 0.28, 0] },
  { name: "top-edge-down", gravity: [0, 1, 0], forward: [0.28, 0, 0] },
]) {
  const harness = createSimulationHarness();
  calibrateStationary(harness, mounting.gravity);
  assert.equal(harness.api.state.calibrationCompleted, true, `${mounting.name} calibration must complete`);
  armAtStandstill(harness, mounting.gravity);
  const timing = launch(harness, mounting.forward, mounting.gravity);
  assert.ok(timing.latencyMs <= 300);
  assert.equal(harness.api.state.forwardAxis, "vector");
  record(`mounting-${mounting.name}`, { startLatencyMs: Math.round(timing.latencyMs) });
}

console.log(JSON.stringify({
  passed: results.length,
  failed: 0,
  scenarios: results,
}, null, 2));
