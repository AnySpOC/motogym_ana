import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  createSimulationHarness,
} from "./app-simulation-harness.mjs";

function parseOptions(argv) {
  const options = { trials: 24, seed: 20261018, json: null, summaryOnly: false };
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
const orientations = [
  { gravity: [0, 0, 1], forward: [0, 1, 0] },
  { gravity: [1, 0, 0], forward: [0, 1, 0] },
  { gravity: [0, 1, 0], forward: [1, 0, 0] },
];
const sampleRates = [30, 45, 60, 90, 100];
const trials = [];

function calibrateWithVibration(harness, orientation, amplitudeG, frequencyHz) {
  harness.api.enableSensors();
  harness.api.startCalibration();
  harness.runFor(4300, (_elapsed, clock) => {
    const vibration = amplitudeG * Math.sin(2 * Math.PI * frequencyHz * clock / 1000);
    return {
      rawX: vibration,
      rawY: -vibration * 0.8,
      rawZ: vibration * 0.35,
      gravityX: orientation.gravity[0],
      gravityY: orientation.gravity[1],
      gravityZ: orientation.gravity[2],
      yawRate: vibration * 12,
    };
  });
}

for (let trialIndex = 0; trialIndex < options.trials; trialIndex += 1) {
  const sampleHz = sampleRates[Math.floor(random() * sampleRates.length)];
  const orientation = orientations[Math.floor(random() * orientations.length)];
  const vibrationAmplitudeG = 0.02 + random() * 0.13;
  const maximumVibrationHz = Math.min(25, sampleHz * 0.4);
  const vibrationHz = 8 + random() * (maximumVibrationHz - 8);
  const gpsIntervalMs = 250 + random() * 1400;
  const requestedLaunchG = 0.16 + random() * 0.2;
  const harness = createSimulationHarness({ sampleHz });
  calibrateWithVibration(harness, orientation, vibrationAmplitudeG, vibrationHz);
  assert.equal(harness.api.state.calibrationCompleted, true);
  const launchG = Math.max(requestedLaunchG, harness.api.currentProfile().startG + 0.06);
  harness.gps(0);
  harness.api.enableAutoMeasurement();

  harness.runFor(2200, (_elapsed, clock) => {
    const vibration = vibrationAmplitudeG * Math.sin(2 * Math.PI * vibrationHz * clock / 1000);
    return {
      rawX: vibration,
      rawY: -vibration * 0.8,
      rawZ: vibration * 0.35,
      gravityX: orientation.gravity[0],
      gravityY: orientation.gravity[1],
      gravityZ: orientation.gravity[2],
      yawRate: vibration * 12,
    };
  }, {
    gpsEveryMs: gpsIntervalMs,
    gpsSpeed: () => random() * 0.3,
  });

  const falseStart = harness.api.state.mode === "running";
  const ready = harness.api.state.autoStartReady;
  const onsetAt = harness.clock;
  let detectedAt = null;
  if (!falseStart && ready) {
    for (let sampleIndex = 0; sampleIndex < Math.ceil(sampleHz * 0.6); sampleIndex += 1) {
      const vibration = vibrationAmplitudeG * 0.4
        * Math.sin(2 * Math.PI * vibrationHz * harness.clock / 1000);
      harness.step({
        rawX: orientation.forward[0] * launchG + vibration,
        rawY: orientation.forward[1] * launchG - vibration * 0.4,
        rawZ: orientation.forward[2] * launchG + vibration * 0.2,
        gravityX: orientation.gravity[0],
        gravityY: orientation.gravity[1],
        gravityZ: orientation.gravity[2],
      });
      if (harness.api.state.mode === "running") {
        detectedAt = harness.clock;
        break;
      }
    }
  }

  trials.push({
    trial: trialIndex + 1,
    sampleHz,
    vibrationAmplitudeG: Number(vibrationAmplitudeG.toFixed(3)),
    vibrationHz: Number(vibrationHz.toFixed(1)),
    gpsIntervalMs: Math.round(gpsIntervalMs),
    launchG: Number(launchG.toFixed(3)),
    falseStart,
    ready,
    detected: detectedAt !== null,
    startLatencyMs: detectedAt === null ? null : Math.round(detectedAt - onsetAt),
  });
}

const falseStarts = trials.filter((trial) => trial.falseStart).length;
const readyFailures = trials.filter((trial) => !trial.falseStart && !trial.ready).length;
const detectedTrials = trials.filter((trial) => trial.detected);
const missedStarts = options.trials - falseStarts - detectedTrials.length;
const latencies = detectedTrials.map((trial) => trial.startLatencyMs);
const summary = {
  seed: options.seed,
  trials: options.trials,
  passed: falseStarts === 0
    && readyFailures === 0
    && missedStarts === 0
    && percentile(latencies, 0.95) <= 300,
  falseStarts,
  readyFailures,
  missedStarts,
  detectionRate: detectedTrials.length / options.trials,
  startLatencyMs: {
    min: Math.min(...latencies),
    median: percentile(latencies, 0.5),
    p95: percentile(latencies, 0.95),
    max: Math.max(...latencies),
  },
};

summary.bySampleHz = Object.fromEntries(sampleRates.map((sampleHz) => {
  const matching = trials.filter((trial) => trial.sampleHz === sampleHz);
  const matchingLatencies = matching.map((trial) => trial.startLatencyMs).filter(Number.isFinite);
  return [sampleHz, {
    trials: matching.length,
    p95StartLatencyMs: matchingLatencies.length ? percentile(matchingLatencies, 0.95) : null,
    maxStartLatencyMs: matchingLatencies.length ? Math.max(...matchingLatencies) : null,
  }];
}));

const output = { summary, trials };
if (options.json) {
  const artifact = {
    generatedAt: new Date().toISOString(),
    summary,
    slowestTrials: trials
      .slice()
      .sort((a, b) => b.startLatencyMs - a.startLatencyMs)
      .slice(0, 10),
  };
  fs.mkdirSync(path.dirname(options.json), { recursive: true });
  fs.writeFileSync(options.json, `${JSON.stringify(artifact, null, 2)}\n`);
}

console.log(JSON.stringify(options.summaryOnly ? { summary } : output, null, 2));
assert.equal(falseStarts, 0, "randomized vibration must not cause false START");
assert.equal(readyFailures, 0, "randomized stationary conditions must reach ready state");
assert.equal(missedStarts, 0, "all randomized launches must be detected");
assert.ok(summary.startLatencyMs.p95 <= 300, "P95 START latency must be at most 300 ms");
