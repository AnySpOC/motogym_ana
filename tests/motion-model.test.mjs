import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

let clock = 0;
const elements = new Map();
const context2d = {
  clearRect() {},
  beginPath() {},
  moveTo() {},
  lineTo() {},
  stroke() {},
};

function makeElement(selector) {
  return {
    className: "",
    classList: { add() {}, remove() {} },
    textContent: "",
    innerHTML: "",
    value: selector === "#sensitivitySelect" ? "normal" : "",
    width: 960,
    height: 320,
    addEventListener() {},
    getContext: () => context2d,
  };
}

const sandbox = {
  console,
  document: {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, makeElement(selector));
      return elements.get(selector);
    },
    createElement: () => makeElement("created"),
  },
  window: { addEventListener() {}, removeEventListener() {} },
  navigator: {
    geolocation: { watchPosition: () => 1, clearWatch() {} },
  },
  performance: { now: () => clock },
  requestAnimationFrame: () => 1,
  Blob: class {},
  URL: { createObjectURL: () => "blob:test", revokeObjectURL() {} },
};

let source = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
source = source.replace(/\nrender\(\);\s*\nloadRuns\(\);\s*$/, "\n");
source += `\nglobalThis.testApi = {
  state, startCalibration, handleMotionSample, enableSensors,
  enableAutoMeasurement, onGpsPosition, motionModel, runToCsv
};\n`;
vm.runInNewContext(source, sandbox, { filename: "app.js" });

const api = sandbox.testApi;
api.enableSensors();
api.startCalibration();

for (let i = 0; i < 250; i += 1) {
  clock = i * (1000 / 60);
  api.handleMotionSample({
    time: clock,
    rawX: 0,
    rawY: 0,
    rawZ: 0,
    gravityX: 0,
    gravityY: 0,
    gravityZ: 1,
    yawRate: 0,
    bankDeg: 0,
  });
}

assert.equal(api.state.calibrationCompleted, true, "static calibration should complete");
assert.deepEqual(Array.from(api.state.gravityVector), [0, 0, 1]);

api.enableAutoMeasurement();

for (let i = 0; i < 180; i += 1) {
  clock += 1000 / 60;
  const vibration = 0.22 * Math.sin(2 * Math.PI * 24 * clock / 1000);
  api.handleMotionSample({
    time: clock,
    rawX: vibration,
    rawY: -vibration,
    rawZ: vibration * 0.35,
    gravityX: 0,
    gravityY: 0,
    gravityZ: 1,
    yawRate: vibration * 20,
    bankDeg: 0,
  });
}

assert.equal(api.state.mode, "armed", "engine vibration must not trigger automatic START");
assert.equal(api.state.forwardAxis, "", "engine vibration must not lock a false forward axis");
assert.ok(api.state.speedMs * 3.6 < 0.5, "engine vibration must not create speed");
assert.ok(api.state.vibrationG > 0.05, "removed vibration should remain observable for field tuning");

let firstRunSpeed = null;
for (let i = 0; i < 120; i += 1) {
  clock += 1000 / 60;
  const vibration = 0.08 * Math.sin(2 * Math.PI * 24 * clock / 1000);
  api.handleMotionSample({
    time: clock,
    rawX: vibration,
    rawY: 0.3 - vibration,
    rawZ: 0,
    gravityX: 0,
    gravityY: 0,
    gravityZ: 1,
    yawRate: 0,
    bankDeg: 0,
  });
  if (api.state.mode === "running" && firstRunSpeed === null) firstRunSpeed = api.state.speedMs;
}

assert.equal(api.state.forwardAxis, "vector", "launch should lock the 3D forward axis");
assert.ok(firstRunSpeed !== null, "automatic start should trigger");
assert.equal(api.state.events.find((event) => event.type === "START")?.timeMs, 0, "confirmed START should be backdated to its onset");
assert.ok(firstRunSpeed * 3.6 < 0.5, "START must reset pre-start velocity");
assert.ok(api.state.speedMs * 3.6 > 5, "sustained acceleration should increase speed");
assert.ok(api.state.speedMs * 3.6 < 30, "speed should remain physically plausible");
const acceleratedSpeedKmh = api.state.speedMs * 3.6;

for (let i = 0; i < 60; i += 1) {
  clock += 1000 / 60;
  api.handleMotionSample({
    time: clock,
    rawX: 0,
    rawY: 0,
    rawZ: 0,
    gravityX: 0,
    gravityY: 0,
    gravityZ: 1,
    yawRate: 0,
    bankDeg: 0,
  });
}
assert.equal(api.state.speedMs, 0, "stationary update should clamp speed to zero");

api.onGpsPosition({
  timestamp: 10000,
  coords: {
    latitude: 35,
    longitude: 139,
    accuracy: 5,
    speed: 8,
    heading: 90,
  },
});
assert.equal(api.state.gpsSpeedMs, 8);
assert.ok(api.state.speedMs > 0, "GPS observation should correct estimated speed");

const csv = api.runToCsv({ events: api.state.events.slice(0, 1), samples: api.state.rawSamples.slice(0, 1) });
const csvLines = csv.trim().split("\n");
const headerColumns = csvLines[0].split(",").length;
for (const line of csvLines.slice(1)) {
  assert.equal(line.split(",").length, headerColumns, "CSV rows must match the header width");
}

console.log(JSON.stringify({
  firstRunSpeedKmh: Number((firstRunSpeed * 3.6).toFixed(3)),
  acceleratedSpeedKmh: Number(acceleratedSpeedKmh.toFixed(3)),
  gpsCorrectedSpeedKmh: Number((api.state.speedMs * 3.6).toFixed(3)),
  calibrationCompleted: api.state.calibrationCompleted,
}));
