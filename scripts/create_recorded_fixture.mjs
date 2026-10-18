#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') value += line[++index];
      else quoted = !quoted;
    } else if (character === "," && !quoted) {
      values.push(value);
      value = "";
    } else value += character;
  }
  values.push(value);
  return values;
}

function number(value) {
  if (value === undefined || value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value, digits = 3) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error("Usage: node scripts/create_recorded_fixture.mjs INPUT.csv OUTPUT.json");
  process.exit(1);
}

const lines = fs.readFileSync(input, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
const headers = parseCsvLine(lines[0]);
const index = Object.fromEntries(headers.map((header, position) => [header, position]));
const events = [];
const allSamples = [];

for (const line of lines.slice(1)) {
  const cells = parseCsvLine(line);
  const timeMs = number(cells[index.time_ms]);
  if (timeMs === null) continue;
  if (cells[index.section] === "event") {
    if (["START", "STOP", "INTERRUPT"].includes(cells[index.type])) {
      events.push({
        timeMs,
        type: cells[index.type],
        detail: cells[index.detail] || "",
      });
    }
    continue;
  }
  if (cells[index.section] !== "sample") continue;
  allSamples.push({
    timeMs,
    longG: number(cells[index.long_g]),
    latG: number(cells[index.lat_g]),
    speedKmh: number(cells[index.speed_kmh]),
    gpsSpeedKmh: number(cells[index.gps_speed_kmh]),
    gpsAccuracyM: number(cells[index.gps_accuracy_m]),
    yawRate: number(cells[index.yaw_rate]),
    bankDeg: number(cells[index.bank_deg]),
    vibrationG: number(cells[index.vibration_g]),
    autoStopCandidate: number(cells[index.auto_stop_candidate]) === 1,
  });
}

const samples = allSamples.filter((sample, sampleIndex) =>
  sampleIndex % 3 === 0 || sample.autoStopCandidate || sampleIndex === allSamples.length - 1
);
const start = events.find((event) => event.type === "START");
const stop = events.find((event) => event.type === "STOP");
const nearestSample = (targetMs) => samples.reduce((nearest, sample) =>
  Math.abs(sample.timeMs - targetMs) < Math.abs(nearest.timeMs - targetMs) ? sample : nearest
);
const comparable = samples.filter((sample) => Number.isFinite(sample.speedKmh) && Number.isFinite(sample.gpsSpeedKmh));
const speedRmseKmh = Math.sqrt(comparable.reduce((sum, sample) =>
  sum + (sample.speedKmh - sample.gpsSpeedKmh) ** 2
, 0) / comparable.length);

const fixture = {
  schemaVersion: 1,
  id: "2026-10-18-auto-start-stop",
  privacy: {
    coordinatesRemoved: true,
    absoluteTimestampsRemoved: true,
    sourceFilenameRemoved: true,
  },
  purpose: "Recorded motorcycle regression evidence for automatic START and STOP",
  expected: {
    startTimeMs: start?.timeMs ?? null,
    stopTimeMs: stop?.timeMs ?? null,
    startGpsSpeedKmh: start ? nearestSample(start.timeMs).gpsSpeedKmh : null,
    stopGpsSpeedKmh: stop ? nearestSample(stop.timeMs).gpsSpeedKmh : null,
    maxAppSpeedKmh: round(Math.max(...samples.map((sample) => sample.speedKmh || 0))),
    speedRmseKmh: round(speedRmseKmh),
    autoStopCandidateSamples: samples.filter((sample) => sample.autoStopCandidate).length,
    sourceSampleCount: allSamples.length,
    fixtureSampleCount: samples.length,
  },
  events,
  samples,
};

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(JSON.stringify({ output: path.resolve(output), expected: fixture.expected }, null, 2));
