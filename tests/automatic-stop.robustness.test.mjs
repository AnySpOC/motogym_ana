import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { armAtStandstill, calibrateStationary, createSimulationHarness } from "./app-simulation-harness.mjs";

function parseOptions(argv) {
  const options = { trials: 36, seed: 20261101, json: null, summaryOnly: false };
  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index] === "--trials") options.trials = Number(argv[++index]);
    else if (argv[index] === "--seed") options.seed = Number(argv[++index]);
    else if (argv[index] === "--json") options.json = argv[++index];
    else if (argv[index] === "--summary-only") options.summaryOnly = true;
    else throw new Error(`Unknown option: ${argv[index]}`);
  }
  if (!Number.isInteger(options.trials) || options.trials < 1) throw new Error("--trials must be a positive integer");
  return options;
}

function randomGenerator(seed) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function percentile(values, fraction) {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
}

const options = parseOptions(process.argv);
const random = randomGenerator(options.seed);
const sampleRates = [30, 45, 60, 90, 100];
const gpsIntervals = [250, 400, 600, 900, 1200];
const orientations = [
  { name: "screen-up", gravity: [0, 0, 1], forward: [0, 1, 0] },
  { name: "right-edge-down", gravity: [1, 0, 0], forward: [0, 1, 0] },
  { name: "top-edge-down", gravity: [0, 1, 0], forward: [1, 0, 0] },
];
const latitude = 35;
const metersPerLongitudeDegree = 111_320 * Math.cos(latitude * Math.PI / 180);
const trials = [];

function motionSample(orientation, forwardG, vibrationG, clock, frequencyHz) {
  const vibration = vibrationG * Math.sin(2 * Math.PI * frequencyHz * clock / 1000);
  return {
    rawX: orientation.forward[0] * forwardG + vibration,
    rawY: orientation.forward[1] * forwardG - vibration * 0.7,
    rawZ: orientation.forward[2] * forwardG + vibration * 0.25,
    gravityX: orientation.gravity[0],
    gravityY: orientation.gravity[1],
    gravityZ: orientation.gravity[2],
    yawRate: vibration * 10,
  };
}

function runPhase(harness, state, {
  durationMs,
  actualSpeedMs,
  gpsIntervalMs,
  gpsSpeed,
  forwardG = 0,
  vibrationG = 0.02,
  vibrationHz = 14,
  positionJitterM = 0,
  duplicateTimestamp = false,
  stopOnArmed = false,
  gpsEnabled = true,
}) {
  const endAt = harness.clock + durationMs;
  let nextGpsAt = harness.clock;
  let gpsIndex = 0;
  while (harness.clock < endAt - 0.001) {
    if (gpsEnabled && harness.clock >= nextGpsAt - 0.001) {
      const elapsedSec = gpsIndex === 0 ? 0 : gpsIntervalMs / 1000;
      state.longitude += actualSpeedMs * elapsedSec / metersPerLongitudeDegree;
      const jitterM = (random() * 2 - 1) * positionJitterM;
      const reportedSpeed = typeof gpsSpeed === "function" ? gpsSpeed(gpsIndex) : gpsSpeed;
      const timestampMs = Date.parse("2026-10-18T00:00:00.000Z") + harness.clock;
      const overrides = {
        latitude,
        longitude: state.longitude + jitterM / metersPerLongitudeDegree,
        accuracy: 3 + random() * 7,
        timestampMs,
      };
      harness.gps(reportedSpeed, overrides);
      if (duplicateTimestamp && gpsIndex % 4 === 0) harness.gps(reportedSpeed, overrides);
      gpsIndex += 1;
      nextGpsAt += gpsIntervalMs;
    }
    harness.step(motionSample(orientationFor(state), forwardG, vibrationG, harness.clock, vibrationHz));
    if (stopOnArmed && harness.api.state.mode === "armed") return harness.clock;
  }
  return null;
}

function orientationFor(state) {
  return state.orientation;
}

for (let trialIndex = 0; trialIndex < options.trials; trialIndex += 1) {
  const sampleHz = sampleRates[trialIndex % sampleRates.length];
  const gpsIntervalMs = gpsIntervals[Math.floor(random() * gpsIntervals.length)];
  const orientation = orientations[trialIndex % orientations.length];
  const vibrationG = 0.008 + random() * 0.025;
  const vibrationHz = 8 + random() * 16;
  const crawlSpeedMs = 0.5 + random() * 0.28;
  const harness = createSimulationHarness({ sampleHz });
  const phaseState = { longitude: 139, orientation };

  calibrateStationary(harness, orientation.gravity);
  armAtStandstill(harness, orientation.gravity);
  const launchG = harness.api.currentProfile().startG + 0.08;
  const launchStartedAt = harness.clock;
  while (harness.api.state.mode !== "running" && harness.clock - launchStartedAt < 700) {
    harness.step(motionSample(orientation, launchG, vibrationG, harness.clock, vibrationHz));
  }
  const started = harness.api.state.mode === "running";

  if (started) {
    runPhase(harness, phaseState, {
      durationMs: 2200,
      actualSpeedMs: 5,
      gpsIntervalMs,
      gpsSpeed: 5,
      vibrationG,
      vibrationHz,
    });
  }

  let falseStopOnGpsGlitch = !started;
  if (started) {
    runPhase(harness, phaseState, {
      durationMs: 4500,
      actualSpeedMs: 5,
      gpsIntervalMs,
      gpsSpeed: (index) => index % 5 < 3 ? 0 : 5,
      vibrationG,
      vibrationHz,
      positionJitterM: 0.15,
      duplicateTimestamp: true,
    });
    falseStopOnGpsGlitch = harness.api.state.mode !== "running";
  }

  if (started && !falseStopOnGpsGlitch) {
    runPhase(harness, phaseState, {
      durationMs: 3200,
      actualSpeedMs: 5,
      gpsIntervalMs,
      gpsSpeed: 5,
      vibrationG,
      vibrationHz,
      gpsEnabled: false,
    });
    falseStopOnGpsGlitch = harness.api.state.mode !== "running";
  }

  let falseStopWhileCrawling = !started;
  if (started && !falseStopOnGpsGlitch) {
    runPhase(harness, phaseState, {
      durationMs: 6500,
      actualSpeedMs: crawlSpeedMs,
      gpsIntervalMs,
      gpsSpeed: () => Math.max(0.2, crawlSpeedMs + (random() * 2 - 1) * 0.08),
      vibrationG,
      vibrationHz,
      positionJitterM: 0.1,
    });
    falseStopWhileCrawling = harness.api.state.mode !== "running";
  }

  let stopLatencyMs = null;
  if (started && !falseStopOnGpsGlitch && !falseStopWhileCrawling) {
    runPhase(harness, phaseState, {
      durationMs: 600,
      actualSpeedMs: Math.max(0.5, crawlSpeedMs / 2),
      gpsIntervalMs: 300,
      gpsSpeed: 0.5,
      forwardG: -0.24,
      vibrationG,
      vibrationHz,
    });
    const stoppedAt = harness.clock;
    const detectedAt = runPhase(harness, phaseState, {
      durationMs: 7000,
      actualSpeedMs: 0,
      gpsIntervalMs,
      gpsSpeed: () => random() * 0.28,
      vibrationG,
      vibrationHz,
      positionJitterM: 0.25,
      stopOnArmed: true,
    });
    if (detectedAt !== null) stopLatencyMs = detectedAt - stoppedAt;
  }

  let rearmed = false;
  let postStopSaved = false;
  if (stopLatencyMs !== null) {
    runPhase(harness, phaseState, {
      durationMs: 5400,
      actualSpeedMs: 0,
      gpsIntervalMs: Math.min(gpsIntervalMs, 600),
      gpsSpeed: 0,
      vibrationG,
      vibrationHz,
      positionJitterM: 0.2,
    });
    await harness.flushStorage();
    rearmed = harness.api.state.mode === "armed" && harness.api.state.autoStartReady;
    const savedRun = harness.savedRuns()[0];
    const postStopSamples = savedRun?.samples.filter((sample) => sample.phase === "poststop") || [];
    postStopSaved = savedRun?.diagnostics.postStopCaptureStatus === "complete"
      && postStopSamples.length >= Math.min(290, Math.floor(sampleHz * 4.8));
  }

  trials.push({
    trial: trialIndex + 1,
    sampleHz,
    gpsIntervalMs,
    orientation: orientation.name,
    vibrationG: Number(vibrationG.toFixed(3)),
    crawlSpeedKmh: Number((crawlSpeedMs * 3.6).toFixed(2)),
    started,
    falseStopOnGpsGlitch,
    falseStopWhileCrawling,
    stopDetected: stopLatencyMs !== null,
    stopLatencyMs: stopLatencyMs === null ? null : Math.round(stopLatencyMs),
    rearmed,
    postStopSaved,
  });
}

const startedFailures = trials.filter((trial) => !trial.started).length;
const falseStopsOnGpsGlitch = trials.filter((trial) => trial.falseStopOnGpsGlitch).length;
const falseStopsWhileCrawling = trials.filter((trial) => trial.falseStopWhileCrawling).length;
const missedStops = trials.filter((trial) => !trial.stopDetected).length;
const rearmFailures = trials.filter((trial) => !trial.rearmed).length;
const postStopSaveFailures = trials.filter((trial) => !trial.postStopSaved).length;
const stopLatencies = trials.map((trial) => trial.stopLatencyMs).filter(Number.isFinite);
const summary = {
  seed: options.seed,
  trials: options.trials,
  passed: startedFailures === 0
    && falseStopsOnGpsGlitch === 0
    && falseStopsWhileCrawling === 0
    && missedStops === 0
    && rearmFailures === 0
    && postStopSaveFailures === 0
    && percentile(stopLatencies, 0.95) <= 5500,
  startedFailures,
  falseStopsOnGpsGlitch,
  falseStopsWhileCrawling,
  missedStops,
  rearmFailures,
  postStopSaveFailures,
  stopLatencyMs: {
    min: Math.min(...stopLatencies),
    median: percentile(stopLatencies, 0.5),
    p95: percentile(stopLatencies, 0.95),
    max: Math.max(...stopLatencies),
  },
};

const output = { summary, trials };
if (options.json) {
  fs.mkdirSync(path.dirname(options.json), { recursive: true });
  fs.writeFileSync(options.json, `${JSON.stringify({ generatedAt: new Date().toISOString(), ...output }, null, 2)}\n`);
}
console.log(JSON.stringify(options.summaryOnly ? { summary } : output, null, 2));

assert.equal(startedFailures, 0, "every trial must start before STOP robustness checks");
assert.equal(falseStopsOnGpsGlitch, 0, "GPS zero bursts, duplicates, and outages must not STOP a moving run");
assert.equal(falseStopsWhileCrawling, 0, "continuous low-speed position movement must not STOP a run");
assert.equal(missedStops, 0, "every sustained physical stop must be detected");
assert.equal(rearmFailures, 0, "every automatic STOP must return to ready state");
assert.equal(postStopSaveFailures, 0, "every automatic STOP must persist the post-STOP diagnostic tail");
assert.ok(summary.stopLatencyMs.p95 <= 5500, "P95 STOP latency must be at most 5.5 seconds");
