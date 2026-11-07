#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

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

function finiteNumber(value) {
  if (value === undefined || value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseArgs(argv) {
  const options = {
    csv: "",
    json: "",
    expectedVersion: "v41",
    expectedSchema: 10,
    minimumRuns: 3,
    minimumGentleRuns: 1,
  };
  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index] === "--csv") options.csv = argv[++index];
    else if (argv[index] === "--json") options.json = argv[++index];
    else if (argv[index] === "--expected-version") options.expectedVersion = argv[++index];
    else if (argv[index] === "--expected-schema") options.expectedSchema = Number(argv[++index]);
    else if (argv[index] === "--minimum-runs") options.minimumRuns = Number(argv[++index]);
    else if (argv[index] === "--minimum-gentle-runs") options.minimumGentleRuns = Number(argv[++index]);
    else if (argv[index] === "--help") {
      console.log("Usage: node scripts/audit_field_runs.mjs --csv FILE [--json FILE]");
      process.exit(0);
    } else throw new Error(`Unknown option: ${argv[index]}`);
  }
  if (!options.csv) throw new Error("--csv FILE is required");
  return options;
}

export function auditCsvText(text, options = {}) {
  const expectedVersion = options.expectedVersion || "v41";
  const expectedSchema = options.expectedSchema || 10;
  const minimumRuns = options.minimumRuns || 3;
  const minimumGentleRuns = options.minimumGentleRuns ?? 1;
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error("CSV has no data rows");
  const headers = parseCsvLine(lines[0]);
  const index = Object.fromEntries(headers.map((header, position) => [header, position]));
  for (const required of ["section", "type", "phase", "app_version", "schema_version"]) {
    if (index[required] === undefined) throw new Error(`CSV column is missing: ${required}`);
  }

  const runs = new Map();
  const value = (cells, key) => index[key] === undefined ? "" : (cells[index[key]] || "");
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    const runId = value(cells, "run_id") || "single-run";
    if (!runs.has(runId)) {
      runs.set(runId, {
        id: runId,
        events: new Set(),
        sampleCount: 0,
        preStartSamples: 0,
        postStopSamples: 0,
        appVersion: "",
        schemaVersion: null,
        qualityStatus: "",
        qualityReasons: "",
        startDetectionMode: "",
        startGpsSpeedKmh: null,
        startDecisionLatencyMs: null,
      });
    }
    const run = runs.get(runId);
    run.appVersion ||= value(cells, "app_version");
    run.schemaVersion ??= finiteNumber(value(cells, "schema_version"));
    run.qualityStatus ||= value(cells, "data_quality_status");
    run.qualityReasons ||= value(cells, "data_quality_reasons");
    run.startDetectionMode ||= value(cells, "start_detection_mode");
    run.startGpsSpeedKmh ??= finiteNumber(value(cells, "start_gps_speed_kmh"));
    run.startDecisionLatencyMs ??= finiteNumber(value(cells, "start_decision_latency_ms"));
    if (value(cells, "section") === "event") run.events.add(value(cells, "type"));
    if (value(cells, "section") === "sample") {
      run.sampleCount += 1;
      if (value(cells, "phase") === "prestart") run.preStartSamples += 1;
      if (value(cells, "phase") === "poststop") run.postStopSamples += 1;
    }
  }

  const auditedRuns = [...runs.values()].map((run) => {
    const reasons = [];
    const latencyLimitMs = run.startDetectionMode === "gentle" ? 750 : 400;
    if (run.appVersion !== expectedVersion) reasons.push("APP_VERSION_MISMATCH");
    if (run.schemaVersion !== expectedSchema) reasons.push("SCHEMA_VERSION_MISMATCH");
    if (!run.events.has("START")) reasons.push("START_MISSING");
    if (!run.events.has("STOP")) reasons.push("STOP_MISSING");
    if (run.sampleCount < 30) reasons.push("SAMPLES_TOO_FEW");
    if (run.preStartSamples === 0) reasons.push("PRESTART_MISSING");
    if (run.postStopSamples === 0) reasons.push("POSTSTOP_MISSING");
    if (!['strong', 'gentle'].includes(run.startDetectionMode)) reasons.push("AUTO_START_MODE_MISSING");
    if (!Number.isFinite(run.startDecisionLatencyMs)) reasons.push("START_LATENCY_MISSING");
    else if (run.startDecisionLatencyMs > latencyLimitMs) reasons.push("START_DECISION_SLOW");
    if (run.startGpsSpeedKmh > 2 || run.qualityReasons.split("|").includes("AUTO_START_GPS_MOVING")) {
      reasons.push("AUTO_START_GPS_MOVING");
    }
    const blockingQualityReasons = [
      "SENSOR_GAP",
      "RUN_INTERRUPTED",
      "RUN_NOT_FINALIZED",
      "CALIBRATION_FAILED",
      "GPS_COVERAGE_CRITICAL",
      "GPS_OBSERVATIONS_LOW",
    ];
    const reportedQualityReasons = run.qualityReasons.split("|");
    for (const reason of blockingQualityReasons) {
      if (reportedQualityReasons.includes(reason)) reasons.push(reason);
    }
    if (["invalid", "diagnostic"].includes(run.qualityStatus)) reasons.push("DATA_QUALITY_FAILED");
    return {
      ...run,
      events: [...run.events],
      latencyLimitMs,
      passed: reasons.length === 0,
      reasons: [...new Set(reasons)],
    };
  });
  const gentleRuns = auditedRuns.filter((run) => run.startDetectionMode === "gentle").length;
  const summaryReasons = [];
  if (auditedRuns.length < minimumRuns) summaryReasons.push("RUNS_TOO_FEW");
  if (gentleRuns < minimumGentleRuns) summaryReasons.push("GENTLE_RUNS_TOO_FEW");
  if (auditedRuns.some((run) => !run.passed)) summaryReasons.push("RUN_AUDIT_FAILED");
  return {
    passed: summaryReasons.length === 0,
    expectedVersion,
    expectedSchema,
    minimumRuns,
    minimumGentleRuns,
    runCount: auditedRuns.length,
    gentleRuns,
    reasons: summaryReasons,
    runs: auditedRuns,
  };
}

async function main() {
  const options = parseArgs(process.argv);
  const report = auditCsvText(fs.readFileSync(options.csv, "utf8"), options);
  const output = { generatedAt: new Date().toISOString(), csv: path.basename(options.csv), ...report };
  if (options.json) {
    fs.mkdirSync(path.dirname(options.json), { recursive: true });
    fs.writeFileSync(options.json, `${JSON.stringify(output, null, 2)}\n`);
  }
  console.log(JSON.stringify(output, null, 2));
  if (!report.passed) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) await main();
