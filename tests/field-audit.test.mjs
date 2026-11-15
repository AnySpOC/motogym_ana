import assert from "node:assert/strict";
import { auditCsvText } from "../scripts/audit_field_runs.mjs";

const headers = [
  "run_id", "section", "type", "phase", "app_version", "schema_version",
  "data_quality_status", "data_quality_reasons", "start_detection_mode",
  "start_gps_speed_kmh", "start_decision_latency_ms",
  "stop_decision_latency_ms", "stop_detection_method", "stop_gps_reliability",
  "post_stop_capture_status", "post_stop_finalized_by",
];

function runRows(id, mode, gpsSpeed, latency, quality = "good", reasons = "") {
  const common = [
    id, "", "", "", "v44", "11", quality, reasons, mode, gpsSpeed, latency,
    "1000", "gps-strict", "high", "complete", "sensor-window",
  ];
  const rows = [
    [id, "event", "START", "", ...common.slice(4)],
    [id, "event", "STOP", "", ...common.slice(4)],
  ];
  for (let index = 0; index < 32; index += 1) {
    const phase = index < 2 ? "prestart" : (index > 29 ? "poststop" : "running");
    rows.push([id, "sample", "", phase, ...common.slice(4)]);
  }
  return rows;
}

function diagnosticRows(id) {
  return [
    [id, "event", "NO_START", "", "v44", "11", "diagnostic", "NO_START_DIAGNOSTIC", "", "", "0", "", "", "", "", ""],
    [id, "sample", "", "prestart", "v44", "11", "diagnostic", "NO_START_DIAGNOSTIC", "", "", "0", "", "", "", "", ""],
  ];
}

const validCsv = [
  headers,
  ...runRows("strong-1", "strong", "0.4", "190"),
  ...runRows("gentle-1", "gentle", "0.8", "620"),
  ...runRows("gentle-2", "gentle", "0.6", "610"),
  ...diagnosticRows("no-start-1"),
].map((row) => row.join(",")).join("\n");
const valid = auditCsvText(validCsv);
assert.equal(valid.passed, true);
assert.equal(valid.runCount, 3);
assert.equal(valid.recordCount, 4);
assert.equal(valid.diagnosticCount, 1);
assert.equal(valid.gentleRuns, 2);
assert.equal(valid.runs.find((run) => run.id === "no-start-1").passed, null);

const movingStartCsv = [
  headers,
  ...runRows("strong-1", "strong", "3.1", "190", "review", "AUTO_START_GPS_MOVING"),
  ...runRows("gentle-1", "gentle", "0.8", "800"),
  ...runRows("gentle-2", "gentle", "0.6", "610"),
].map((row) => row.join(",")).join("\n");
const invalid = auditCsvText(movingStartCsv);
assert.equal(invalid.passed, false);
assert.ok(invalid.runs[0].reasons.includes("AUTO_START_GPS_MOVING"));
assert.ok(invalid.runs[1].reasons.includes("START_DECISION_SLOW"));

const gapCsv = [
  headers,
  ...runRows("strong-1", "strong", "0.4", "190", "review", "SENSOR_GAP"),
  ...runRows("gentle-1", "gentle", "0.8", "620"),
  ...runRows("gentle-2", "gentle", "0.6", "610"),
].map((row) => row.join(",")).join("\n");
const gap = auditCsvText(gapCsv);
assert.equal(gap.passed, false);
assert.ok(gap.runs[0].reasons.includes("SENSOR_GAP"));

console.log("field audit tests: OK");
