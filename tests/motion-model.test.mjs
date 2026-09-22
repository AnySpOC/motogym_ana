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
  const moved = i >= 125;
  api.handleMotionSample({
    time: clock,
    rawX: 0,
    rawY: 0,
    rawZ: 0,
    gravityX: moved ? 0.3 : 0,
    gravityY: 0,
    gravityZ: moved ? Math.sqrt(1 - 0.3 ** 2) : 1,
    yawRate: 0,
    bankDeg: 0,
  });
}

assert.equal(api.state.calibrationState, "failed", "moving the bike during calibration must fail");
assert.equal(api.state.calibrationCompleted, false);

api.startCalibration();

for (let i = 0; i < 250; i += 1) {
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

assert.equal(api.state.calibrationCompleted, true, "static calibration should complete");
assert.equal(api.state.calibrationState, "complete");
assert.deepEqual(Array.from(api.state.gravityVector), [0, 0, 1]);

for (let i = 0; i < 30; i += 1) {
  clock += 1000 / 60;
  api.handleMotionSample({
    time: clock,
    rawX: 0,
    rawY: 0.4,
    rawZ: 0,
    gravityX: 0,
    gravityY: 0,
    gravityZ: 1,
    yawRate: 0,
    bankDeg: 0,
  });
}
assert.equal(api.state.mode, "sensor-on", "Sensor ON must remain a non-measuring standby state");
assert.equal(api.state.speedMs, 0, "Sensor ON must not integrate speed before a measurement mode starts");
assert.equal(api.state.samples.length, 0, "Sensor ON must not add graph samples");
assert.equal(api.state.rawSamples.length, 0, "Sensor ON must not add run samples");

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
assert.equal(api.state.speedMs, 0, "Auto standby must keep displayed speed at zero before START");
assert.equal(api.state.samples.length, 0, "Auto standby must not add graph samples before START");
assert.equal(api.state.rawSamples.length, 0, "Auto standby must not save samples before START");
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
assert.equal(api.state.events.find((event) => event.type === "START")?.speedKmh, 0, "START event must represent zero speed at onset");
assert.ok(firstRunSpeed * 3.6 > 0.5, "confirmed launch should include velocity accumulated during START confirmation");
assert.ok(firstRunSpeed * 3.6 < 3, "START confirmation velocity must remain physically plausible");
assert.ok(api.state.speedMs * 3.6 > 5, "sustained acceleration should increase speed");
assert.ok(api.state.speedMs * 3.6 < 30, "speed should remain physically plausible");
const acceleratedSpeedKmh = api.state.speedMs * 3.6;

for (let i = 0; i < 90; i += 1) {
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
assert.equal(api.state.mode, "running", "low dynamics alone must not stop a moving run");
assert.ok(api.state.speedMs > 0, "constant-speed motion must not be mistaken for zero speed");

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
assert.ok(api.state.speedMs > 0, "GPS observation should correct estimated speed while running");

api.onGpsPosition({
  timestamp: 11000,
  coords: {
    latitude: 35,
    longitude: 139,
    accuracy: 5,
    speed: 0,
    heading: 90,
  },
});

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
assert.equal(api.state.speedMs, 0, "fresh zero GPS speed should clamp speed to zero");
assert.equal(api.state.mode, "stopped", "fresh zero GPS speed should complete automatic timing");

api.onGpsPosition({
  timestamp: 12000,
  coords: {
    latitude: 35,
    longitude: 139,
    accuracy: 5,
    speed: 8,
    heading: 90,
  },
});
assert.equal(api.state.gpsSpeedMs, 8);
assert.equal(api.state.speedMs, 0, "GPS must not change the completed run after measurement stops");

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
