const G = 9.80665;
const STOP_SPEED = 0.65;
const STOP_HOLD_MS = 950;
const DB_NAME = "moto-gym-ana";
const DB_VERSION = 1;
const RUN_STORE = "runs";
const RAW_SAMPLE_LIMIT = 20000;
const VARIANCE_WINDOW = 90;
const RAD_TO_DEG = 180 / Math.PI;
const DRAG_COEFF = 0.025;

const sensitivityProfiles = {
  calm: { startG: 0.26, accelG: 0.32, brakeG: -0.34, turnRate: 48, bankAngle: 24, deadbandG: 0.035 },
  normal: { startG: 0.2, accelG: 0.26, brakeG: -0.3, turnRate: 40, bankAngle: 20, deadbandG: 0.025 },
  sharp: { startG: 0.14, accelG: 0.19, brakeG: -0.22, turnRate: 30, bankAngle: 15, deadbandG: 0.014 },
};

const text = {
  idle: "\u5f85\u6a5f\u4e2d",
  sensorReady: "\u30bb\u30f3\u30b5\u63a5\u7d9a",
  needPermission: "\u8a31\u53ef\u304c\u5fc5\u8981",
  armed: "\u767a\u9032\u5f85\u3061",
  running: "\u8d70\u884c\u4e2d",
  stopped: "\u505c\u6b62",
  armDetail: "\u8a08\u6e2c\u5f85\u6a5f",
  startDetail: "\u767a\u9032\u3092\u691c\u51fa",
  stopDetail: "\u505c\u6b62\u3092\u691c\u51fa",
  stopHold: "\u505c\u6b62\u4fdd\u6301\u3092\u691c\u51fa",
  accel: "\u52a0\u901f",
  brake: "\u6e1b\u901f",
  rightTurn: "\u53f3\u65cb\u56de",
  leftTurn: "\u5de6\u65cb\u56de",
  rightBank: "\u53f3\u30d0\u30f3\u30af",
  leftBank: "\u5de6\u30d0\u30f3\u30af",
  sensorGranted: "\u30bb\u30f3\u30b5\u8a31\u53ef\u6e08\u307f",
  unsupported: "\u3053\u306e\u74b0\u5883\u3067\u306f\u30bb\u30f3\u30b5API\u304c\u4f7f\u3048\u307e\u305b\u3093",
  sensorError: "iOS\u8a2d\u5b9a\u307e\u305f\u306fSafari\u306e\u30bb\u30f3\u30b5\u8a31\u53ef\u3092\u78ba\u8a8d",
  manualStop: "\u624b\u52d5\u505c\u6b62",
  manualStart: "\u624b\u52d5\u958b\u59cb",
  autoOn: "\u81ea\u52d5\u8a08\u6e2cON",
  autoOff: "\u81ea\u52d5\u8a08\u6e2cOFF",
  saved: "\u81ea\u52d5\u4fdd\u5b58\u6e08\u307f",
  storageReady: "\u81ea\u52d5\u4fdd\u5b58\u6709\u52b9",
  storageUnavailable: "\u81ea\u52d5\u4fdd\u5b58\u4e0d\u53ef",
  sensorOff: "\u30bb\u30f3\u30b5OFF",
  sensorOn: "\u30bb\u30f3\u30b5ON",
  sensorDisabled: "\u30bb\u30f3\u30b5\u505c\u6b62",
};

const elements = {
  sensorStatus: document.querySelector("#sensorStatus"),
  rideState: document.querySelector("#rideState"),
  timer: document.querySelector("#timer"),
  permissionButton: document.querySelector("#permissionButton"),
  sensorOffButton: document.querySelector("#sensorOffButton"),
  sensitivitySelect: document.querySelector("#sensitivitySelect"),
  autoOnButton: document.querySelector("#autoOnButton"),
  autoOffButton: document.querySelector("#autoOffButton"),
  manualOnButton: document.querySelector("#manualOnButton"),
  manualOffButton: document.querySelector("#manualOffButton"),
  clearButton: document.querySelector("#clearButton"),
  exportButton: document.querySelector("#exportButton"),
  exportAllButton: document.querySelector("#exportAllButton"),
  longG: document.querySelector("#longG"),
  latG: document.querySelector("#latG"),
  speed: document.querySelector("#speed"),
  bank: document.querySelector("#bank"),
  yaw: document.querySelector("#yaw"),
  confidence: document.querySelector("#confidence"),
  gVariance: document.querySelector("#gVariance"),
  kalmanVariance: document.querySelector("#kalmanVariance"),
  eventLog: document.querySelector("#eventLog"),
  historyList: document.querySelector("#historyList"),
  storageStatus: document.querySelector("#storageStatus"),
  canvas: document.querySelector("#traceCanvas"),
};

const ctx = elements.canvas.getContext("2d");

const state = {
  mode: "idle",
  startedAt: 0,
  stoppedAt: 0,
  lastSampleAt: 0,
  lastStopCandidateAt: 0,
  speedMs: 0,
  bankDeg: 0,
  yawRate: 0,
  longG: 0,
  latG: 0,
  observedBankDeg: 0,
  longBias: 0,
  latBias: 0,
  yawBias: 0,
  confidence: 0,
  sensorEnabled: false,
  sensorListenersAttached: false,
  autoMeasurementEnabled: false,
  measurementMode: "none",
  sensitivity: "normal",
  longGVariance: 0,
  latGVariance: 0,
  kalmanVariance: 0,
  samples: [],
  varianceSamples: [],
  rawSamples: [],
  events: [],
  savedRuns: [],
  currentRunId: "",
};

let dbPromise = null;

class MotionEkf {
  constructor() {
    this.n = 8;
    this.x = [0, 0, 0, 0, 0, 0, 0, 0];
    this.p = identity(this.n, 0.6);
  }

  reset() {
    this.x = [0, 0, 0, 0, 0, 0, 0, 0];
    this.p = identity(this.n, 0.6);
  }

  update(measurement, dt) {
    this.predict(dt);
    this.correct(measurement);
    return this.value();
  }

  predict(dt) {
    const [v, longG, latG, yawRate, bankDeg, longBias, latBias, yawBias] = this.x;
    const accelDecay = Math.exp(-dt / 0.7);
    const yawDecay = Math.exp(-dt / 0.5);
    const rollBlend = Math.min(0.35, dt / 0.45);
    const rollEqDeg = Math.atan(latG) * RAD_TO_DEG;

    const next = [
      Math.max(0, v + ((longG - longBias) * G - DRAG_COEFF * v) * dt),
      longG * accelDecay,
      latG * accelDecay,
      yawRate * yawDecay,
      bankDeg + (rollEqDeg - bankDeg) * rollBlend,
      longBias,
      latBias,
      yawBias,
    ];

    const f = identity(this.n);
    f[0][0] = Math.max(0, 1 - DRAG_COEFF * dt);
    f[0][1] = G * dt;
    f[0][5] = -G * dt;
    f[1][1] = accelDecay;
    f[2][2] = accelDecay;
    f[3][3] = yawDecay;
    f[4][2] = rollBlend * RAD_TO_DEG / (1 + latG * latG);
    f[4][4] = 1 - rollBlend;

    const q = diag([
      0.03 * dt,
      0.09 * dt,
      0.09 * dt,
      18 * dt,
      6 * dt,
      0.00008 * dt,
      0.00008 * dt,
      0.015 * dt,
    ]);

    this.x = next;
    this.p = add(mul(mul(f, this.p), transpose(f)), q);
  }

  correct(measurement) {
    const h = [
      [0, 1, 0, 0, 0, 1, 0, 0],
      [0, 0, 1, 0, 0, 0, 1, 0],
      [0, 0, 0, 1, 0, 0, 0, 1],
      [0, 0, 0, 0, 1, 0, 0, 0],
    ];
    const z = [measurement.longG, measurement.latG, measurement.yawRate, measurement.bankDeg];
    const r = diag([0.13, 0.13, 24, 18]);
    const hx = matVec(h, this.x);
    const residual = z.map((value, index) => value - hx[index]);
    const s = add(mul(mul(h, this.p), transpose(h)), r);
    const k = mul(mul(this.p, transpose(h)), inverse4(s));
    this.x = addVec(this.x, matVec(k, residual));
    this.x[0] = Math.max(0, this.x[0]);
    this.p = mul(sub(identity(this.n), mul(k, h)), this.p);
  }

  value() {
    return {
      speedMs: this.x[0],
      longG: this.x[1] - this.x[5],
      latG: this.x[2] - this.x[6],
      yawRate: this.x[3] - this.x[7],
      bankDeg: this.x[4],
      longBias: this.x[5],
      latBias: this.x[6],
      yawBias: this.x[7],
      covariance: (this.p[1][1] + this.p[2][2] + this.p[3][3] + this.p[4][4]) / 4,
    };
  }
}

const motionModel = new MotionEkf();

function setMode(mode, label) {
  state.mode = mode;
  elements.rideState.textContent = label;
  elements.sensorStatus.className = `status-dot ${mode}`;
}

function nowMs() {
  return performance.now();
}

function formatTime(ms) {
  const seconds = Math.max(0, ms) / 1000;
  return seconds.toFixed(3).padStart(6, "0");
}

function addEvent(type, detail = "") {
  const t = state.currentRunId ? nowMs() - state.startedAt : 0;
  const event = {
    timeMs: Math.round(t),
    type,
    detail,
    longG: state.longG,
    latG: state.latG,
    speedKmh: state.speedMs * 3.6,
    bankDeg: state.bankDeg,
    yawRate: state.yawRate,
  };
  state.events.unshift(event);
  renderEvents();
}

function armTimer() {
  state.startedAt = 0;
  state.stoppedAt = 0;
  resetLiveSensorValues();
  state.rawSamples = [];
  state.lastStopCandidateAt = 0;
  state.currentRunId = "";
  state.measurementMode = "auto";
  setMode("armed", text.armed);
  addEvent("ARM", text.armDetail);
}

function startRun(mode = "auto", detail = text.startDetail) {
  state.startedAt = nowMs();
  state.stoppedAt = 0;
  state.samples = [];
  state.rawSamples = [];
  state.events = state.events.filter((event) => event.type === "ARM");
  state.currentRunId = makeRunId();
  state.measurementMode = mode;
  setMode("running", text.running);
  addEvent("START", detail);
  render();
}

function stopRun(reason = text.stopDetail) {
  if (state.mode !== "running") return;
  state.stoppedAt = nowMs();
  setMode("stopped", text.stopped);
  addEvent("STOP", reason);
  elements.timer.textContent = formatTime(state.stoppedAt - state.startedAt);
  saveCurrentRun();
  state.measurementMode = "none";
  render();
}

function handleMotionSample(sample) {
  if (!state.sensorEnabled) return;
  const t = sample.time ?? nowMs();
  const dt = state.lastSampleAt ? Math.min(0.12, Math.max(0.005, (t - state.lastSampleAt) / 1000)) : 0.016;
  state.lastSampleAt = t;

  const profile = currentProfile();
  const cleanedLongG = applyDeadband(sample.longG, profile.deadbandG);
  const cleanedLatG = applyDeadband(sample.latG, profile.deadbandG);
  const estimate = motionModel.update({
    longG: cleanedLongG,
    latG: cleanedLatG,
    yawRate: sample.yawRate,
    bankDeg: sample.bankDeg,
  }, dt);
  state.longG = estimate.longG;
  state.latG = estimate.latG;
  state.yawRate = estimate.yawRate;
  state.bankDeg = estimate.bankDeg;
  state.speedMs = estimate.speedMs;
  state.longBias = estimate.longBias;
  state.latBias = estimate.latBias;
  state.yawBias = estimate.yawBias;
  state.kalmanVariance = estimate.covariance;
  updateVariance(cleanedLongG, cleanedLatG);

  state.confidence = estimateConfidence(sample, dt);

  detectEvents(t);
  storeSample(t);
  storeRawSample(t);
  render();
}

function estimateConfidence(sample, dt) {
  const hasMotion = Number.isFinite(sample.longG) && Number.isFinite(sample.latG);
  const cadence = dt > 0.006 && dt < 0.08;
  const attitude = Number.isFinite(sample.bankDeg);
  return Math.round(((hasMotion ? 0.45 : 0) + (cadence ? 0.3 : 0) + (attitude ? 0.25 : 0)) * 100);
}

function detectEvents(t) {
  const profile = currentProfile();
  if (state.autoMeasurementEnabled && state.mode === "armed" && state.longG > profile.startG) {
    startRun("auto", text.startDetail);
  }

  if (state.mode !== "running") return;

  if (state.longG > profile.accelG) addEdgeEvent("ACCEL", text.accel);
  if (state.longG < profile.brakeG) addEdgeEvent("BRAKE", text.brake);
  if (Math.abs(state.yawRate) > profile.turnRate) addEdgeEvent("TURN", state.yawRate > 0 ? text.rightTurn : text.leftTurn);
  if (Math.abs(state.bankDeg) > profile.bankAngle) addEdgeEvent("BANK", state.bankDeg > 0 ? text.rightBank : text.leftBank);

  const nearStopped = state.speedMs < STOP_SPEED && Math.abs(state.longG) < 0.05 && Math.abs(state.latG) < 0.06;
  if (nearStopped) {
    state.lastStopCandidateAt ||= t;
    if (state.autoMeasurementEnabled && state.measurementMode === "auto" && t - state.lastStopCandidateAt > STOP_HOLD_MS && nowMs() - state.startedAt > 1500) {
      stopRun(text.stopHold);
    }
  } else {
    state.lastStopCandidateAt = 0;
  }
}

function addEdgeEvent(type, detail) {
  const recent = state.events.find((event) => event.type === type);
  if (recent && Math.abs(recent.timeMs - (nowMs() - state.startedAt)) < 900) return;
  addEvent(type, detail);
}

function storeSample(t) {
  state.samples.push({
    t,
    elapsed: state.currentRunId ? t - state.startedAt : 0,
    longG: state.longG,
    latG: state.latG,
    speed: state.speedMs,
    variance: state.longGVariance + state.latGVariance,
  });
  if (state.samples.length > 420) state.samples.shift();
}

function storeRawSample(t) {
  if (!state.currentRunId || state.stoppedAt) return;
  state.rawSamples.push({
    timeMs: Math.round(t - state.startedAt),
    longG: round(state.longG, 4),
    latG: round(state.latG, 4),
    speedKmh: round(state.speedMs * 3.6, 3),
    bankDeg: round(state.bankDeg, 2),
    yawRate: round(state.yawRate, 2),
    longGVariance: round(state.longGVariance, 6),
    latGVariance: round(state.latGVariance, 6),
    kalmanVariance: round(state.kalmanVariance, 6),
    longBias: round(state.longBias, 5),
    latBias: round(state.latBias, 5),
    yawBias: round(state.yawBias, 3),
    confidence: state.confidence,
  });
  if (state.rawSamples.length > RAW_SAMPLE_LIMIT) state.rawSamples.shift();
}

function onDeviceMotion(event) {
  const acc = event.acceleration || event.accelerationIncludingGravity || {};
  const rotation = event.rotationRate || {};
  handleMotionSample({
    time: nowMs(),
    longG: (acc.y || 0) / G,
    latG: (acc.x || 0) / G,
    yawRate: rotation.alpha || 0,
    bankDeg: state.observedBankDeg,
  });
}

function onDeviceOrientation(event) {
  if (!state.sensorEnabled) return;
  if (Number.isFinite(event.gamma)) {
    state.observedBankDeg = event.gamma;
  }
}

async function requestSensors() {
  try {
    if (typeof DeviceMotionEvent === "undefined") {
      setMode("idle", text.needPermission);
      addEvent("ERROR", text.unsupported);
      return;
    }
    if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
      const motionPermission = await DeviceMotionEvent.requestPermission();
      if (motionPermission !== "granted") throw new Error("motion denied");
    }
    if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
      await DeviceOrientationEvent.requestPermission();
    }
    enableSensors();
    setMode("sensor-on", text.sensorOn);
    addEvent("SENSOR", text.sensorGranted);
  } catch {
    setMode("idle", text.needPermission);
    addEvent("ERROR", text.sensorError);
  }
}

function enableSensors() {
  if (!state.sensorListenersAttached) {
    window.addEventListener("devicemotion", onDeviceMotion);
    window.addEventListener("deviceorientation", onDeviceOrientation);
    state.sensorListenersAttached = true;
  }
  state.sensorEnabled = true;
  elements.permissionButton.classList.add("primary");
  elements.sensorOffButton.classList.remove("primary");
}

function disableSensors() {
  if (state.mode === "running") {
    stopRun(text.sensorDisabled);
  }
  if (state.sensorListenersAttached) {
    window.removeEventListener("devicemotion", onDeviceMotion);
    window.removeEventListener("deviceorientation", onDeviceOrientation);
    state.sensorListenersAttached = false;
  }
  state.sensorEnabled = false;
  state.autoMeasurementEnabled = false;
  state.measurementMode = "none";
  state.samples = [];
  state.rawSamples = [];
  resetLiveSensorValues();
  elements.permissionButton.classList.remove("primary");
  elements.sensorOffButton.classList.add("primary");
  setMode("sensor-off", text.sensorOff);
  addEvent("SENSOR", text.sensorDisabled);
  render();
}

function enableAutoMeasurement() {
  if (state.mode === "running") return;
  state.autoMeasurementEnabled = true;
  armTimer();
  addEvent("AUTO", text.autoOn);
}

function disableAutoMeasurement() {
  state.autoMeasurementEnabled = false;
  if (state.mode === "armed") {
    state.measurementMode = "none";
    setMode(state.sensorEnabled ? "sensor-on" : "idle", state.sensorEnabled ? text.sensorOn : text.idle);
  }
  addEvent("AUTO", text.autoOff);
  render();
}

function startManualMeasurement() {
  if (state.mode === "running") return;
  state.autoMeasurementEnabled = false;
  startRun("manual", text.manualStart);
}

function stopManualMeasurement() {
  stopRun(text.manualStop);
}

function resetLiveSensorValues() {
  state.lastSampleAt = 0;
  state.lastStopCandidateAt = 0;
  state.speedMs = 0;
  state.longG = 0;
  state.latG = 0;
  state.yawRate = 0;
  state.bankDeg = 0;
  state.observedBankDeg = 0;
  state.longBias = 0;
  state.latBias = 0;
  state.yawBias = 0;
  state.confidence = 0;
  state.longGVariance = 0;
  state.latGVariance = 0;
  state.kalmanVariance = 0;
  state.varianceSamples = [];
  motionModel.reset();
}

function render() {
  const runMs = state.currentRunId ? (state.stoppedAt || nowMs()) - state.startedAt : 0;
  elements.timer.textContent = formatTime(runMs);
  elements.longG.textContent = `${state.longG.toFixed(2)} g`;
  elements.latG.textContent = `${state.latG.toFixed(2)} g`;
  elements.speed.textContent = `${(state.speedMs * 3.6).toFixed(1)} km/h`;
  elements.bank.textContent = `${state.bankDeg.toFixed(0)} deg`;
  elements.yaw.textContent = `${state.yawRate.toFixed(0)} deg/s`;
  elements.confidence.textContent = `${state.confidence}%`;
  elements.gVariance.textContent = `${state.longGVariance.toFixed(4)} / ${state.latGVariance.toFixed(4)}`;
  elements.kalmanVariance.textContent = state.kalmanVariance.toFixed(4);
  drawTrace();
  if (state.mode === "running") requestAnimationFrame(render);
}

function drawTrace() {
  const { width, height } = elements.canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = "#263035";
  ctx.lineWidth = 1;
  for (let i = 1; i < 5; i += 1) {
    const y = (height / 5) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  drawLine("longG", "#42d392", 0.6);
  drawLine("latG", "#69d2e7", 0.6);
  drawLine("variance", "#f0ba4a", 0.08);
}

function drawLine(key, color, scale) {
  if (state.samples.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  state.samples.forEach((sample, index) => {
    const x = (index / Math.max(1, state.samples.length - 1)) * elements.canvas.width;
    const y = elements.canvas.height / 2 - (sample[key] / scale) * (elements.canvas.height / 2 - 24);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function currentProfile() {
  return sensitivityProfiles[state.sensitivity] || sensitivityProfiles.normal;
}

function applyDeadband(value, deadband) {
  if (!Number.isFinite(value)) return 0;
  return Math.abs(value) < deadband ? 0 : value;
}

function updateVariance(longG, latG) {
  state.varianceSamples.push({ longG, latG });
  if (state.varianceSamples.length > VARIANCE_WINDOW) state.varianceSamples.shift();
  state.longGVariance = rollingVariance(state.varianceSamples.map((sample) => sample.longG));
  state.latGVariance = rollingVariance(state.varianceSamples.map((sample) => sample.latG));
}

function rollingVariance(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (values.length - 1);
}

function identity(size, value = 1) {
  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) => (row === col ? value : 0))
  );
}

function diag(values) {
  return Array.from({ length: values.length }, (_, row) =>
    Array.from({ length: values.length }, (_, col) => (row === col ? values[row] : 0))
  );
}

function transpose(matrix) {
  return matrix[0].map((_, col) => matrix.map((row) => row[col]));
}

function add(a, b) {
  return a.map((row, rowIndex) => row.map((value, colIndex) => value + b[rowIndex][colIndex]));
}

function sub(a, b) {
  return a.map((row, rowIndex) => row.map((value, colIndex) => value - b[rowIndex][colIndex]));
}

function mul(a, b) {
  return a.map((row) =>
    b[0].map((_, colIndex) =>
      row.reduce((sum, value, innerIndex) => sum + value * b[innerIndex][colIndex], 0)
    )
  );
}

function matVec(matrix, vector) {
  return matrix.map((row) => row.reduce((sum, value, index) => sum + value * vector[index], 0));
}

function addVec(a, b) {
  return a.map((value, index) => value + b[index]);
}

function inverse4(matrix) {
  const size = 4;
  const work = matrix.map((row, rowIndex) => row.concat(identity(size)[rowIndex]));

  for (let col = 0; col < size; col += 1) {
    let pivotRow = col;
    for (let row = col + 1; row < size; row += 1) {
      if (Math.abs(work[row][col]) > Math.abs(work[pivotRow][col])) pivotRow = row;
    }
    if (pivotRow !== col) [work[col], work[pivotRow]] = [work[pivotRow], work[col]];

    const pivot = Math.abs(work[col][col]) < 1e-9 ? 1e-9 : work[col][col];
    for (let j = 0; j < size * 2; j += 1) work[col][j] /= pivot;

    for (let row = 0; row < size; row += 1) {
      if (row === col) continue;
      const factor = work[row][col];
      for (let j = 0; j < size * 2; j += 1) {
        work[row][j] -= factor * work[col][j];
      }
    }
  }

  return work.map((row) => row.slice(size));
}

function renderEvents() {
  elements.eventLog.innerHTML = state.events
    .map((event) => `<li><strong>${event.type} ${formatTime(event.timeMs)}</strong><small>${event.detail} / ${event.speedKmh.toFixed(1)} km/h / ${event.bankDeg.toFixed(0)} deg</small></li>`)
    .join("");
}

function exportCsv() {
  const run = buildCurrentRun();
  downloadText(runToCsv(run), `gym-ana-${run.id || "current"}.csv`, "text/csv;charset=utf-8");
}

function makeRunId() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function round(value, digits) {
  const base = 10 ** digits;
  return Math.round(value * base) / base;
}

function openDb() {
  if (!("indexedDB" in window)) return Promise.reject(new Error("indexedDB unavailable"));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(RUN_STORE)) {
        const store = db.createObjectStore(RUN_STORE, { keyPath: "id" });
        store.createIndex("startedAtIso", "startedAtIso");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function dbPut(storeName, value) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

function dbGetAll(storeName) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}

function buildCurrentRun() {
  return buildRun({
    id: state.currentRunId || makeRunId(),
    startedAtIso: state.currentRunId ? new Date(Date.now() - ((state.stoppedAt || nowMs()) - state.startedAt)).toISOString() : new Date().toISOString(),
    endedAtIso: new Date().toISOString(),
    durationMs: Math.round(state.currentRunId ? (state.stoppedAt || nowMs()) - state.startedAt : 0),
    events: state.events.slice().reverse(),
    samples: state.rawSamples.slice(),
  });
}

function buildRun(run) {
  const samples = run.samples || [];
  const events = run.events || [];
  const maxByAbs = (key) => samples.reduce((max, sample) => Math.max(max, Math.abs(sample[key] || 0)), 0);
  return {
    id: run.id,
    startedAtIso: run.startedAtIso,
    endedAtIso: run.endedAtIso,
    durationMs: run.durationMs,
    summary: {
      maxSpeedKmh: round(samples.reduce((max, sample) => Math.max(max, sample.speedKmh || 0), 0), 2),
      maxLongG: round(samples.reduce((max, sample) => Math.max(max, sample.longG || 0), 0), 3),
      minLongG: round(samples.reduce((min, sample) => Math.min(min, sample.longG || 0), 0), 3),
      maxLatGAbs: round(maxByAbs("latG"), 3),
      maxBankDegAbs: round(maxByAbs("bankDeg"), 1),
      maxYawRateAbs: round(maxByAbs("yawRate"), 1),
      sampleCount: samples.length,
      eventCount: events.length,
    },
    events,
    samples,
  };
}

function saveCurrentRun() {
  addEvent("SAVE", text.saved);
  const run = buildCurrentRun();
  if (!run.samples.length && !run.events.length) return;
  dbPut(RUN_STORE, run)
    .then(() => {
      return loadRuns();
    })
    .catch(() => {
      addEvent("SAVE", text.storageUnavailable);
      setStorageStatus(text.storageUnavailable);
    });
}

function loadRuns() {
  return dbGetAll(RUN_STORE)
    .then((runs) => {
      state.savedRuns = runs.sort((a, b) => b.startedAtIso.localeCompare(a.startedAtIso));
      setStorageStatus(`${text.storageReady} / ${state.savedRuns.length} runs`);
      renderHistory();
    })
    .catch(() => {
      setStorageStatus(text.storageUnavailable);
      renderHistory();
    });
}

function setStorageStatus(message) {
  elements.storageStatus.textContent = message;
}

function renderHistory() {
  if (!state.savedRuns.length) {
    elements.historyList.innerHTML = `<div class="history-card"><small>No saved runs yet</small></div>`;
    return;
  }
  elements.historyList.innerHTML = state.savedRuns
    .map((run) => {
      const date = new Date(run.startedAtIso).toLocaleString();
      return `<article class="history-card">
        <div>
          <strong>${formatTime(run.durationMs)}</strong>
          <small>${escapeHtml(date)} / max ${run.summary.maxSpeedKmh.toFixed(1)} km/h / bank ${run.summary.maxBankDegAbs.toFixed(0)} deg / ${run.summary.sampleCount} samples</small>
        </div>
        <div class="history-actions">
          <button type="button" data-action="csv" data-run="${escapeHtml(run.id)}">CSV</button>
          <button type="button" data-action="json" data-run="${escapeHtml(run.id)}">JSON</button>
        </div>
      </article>`;
    })
    .join("");
}

function runToCsv(run) {
  const eventHeader = "section,time_ms,type,detail,long_g,lat_g,speed_kmh,bank_deg,yaw_rate,long_g_variance,lat_g_variance,kalman_variance,long_bias,lat_bias,yaw_bias,confidence\n";
  const eventRows = run.events.map((event) => [
    "event",
    event.timeMs,
    event.type,
    event.detail,
    fixed(event.longG, 3),
    fixed(event.latG, 3),
    fixed(event.speedKmh, 2),
    fixed(event.bankDeg, 1),
    fixed(event.yawRate, 1),
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ].map(csvCell).join(","));
  const sampleRows = run.samples.map((sample) => [
    "sample",
    sample.timeMs,
    "",
    "",
    fixed(sample.longG, 4),
    fixed(sample.latG, 4),
    fixed(sample.speedKmh, 3),
    fixed(sample.bankDeg, 2),
    fixed(sample.yawRate, 2),
    fixed(sample.longGVariance, 6),
    fixed(sample.latGVariance, 6),
    fixed(sample.kalmanVariance, 6),
    fixed(sample.longBias, 5),
    fixed(sample.latBias, 5),
    fixed(sample.yawBias, 3),
    sample.confidence,
  ].map(csvCell).join(","));
  return eventHeader + eventRows.concat(sampleRows).join("\n");
}

function fixed(value, digits) {
  return Number.isFinite(value) ? value.toFixed(digits) : "";
}

function csvCell(value) {
  const textValue = String(value ?? "");
  return /[",\n]/.test(textValue) ? `"${textValue.replaceAll("\"", "\"\"")}"` : textValue;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function downloadText(content, filename, type) {
  const blob = new Blob([content], { type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function exportAllJson() {
  downloadText(JSON.stringify({ exportedAt: new Date().toISOString(), runs: state.savedRuns }, null, 2), `gym-ana-all-${makeRunId()}.json`, "application/json;charset=utf-8");
}

function exportStoredRun(runId, format) {
  const run = state.savedRuns.find((item) => item.id === runId);
  if (!run) return;
  if (format === "csv") {
    downloadText(runToCsv(run), `gym-ana-${run.id}.csv`, "text/csv;charset=utf-8");
  } else {
    downloadText(JSON.stringify(run, null, 2), `gym-ana-${run.id}.json`, "application/json;charset=utf-8");
  }
}

elements.permissionButton.addEventListener("click", requestSensors);
elements.sensorOffButton.addEventListener("click", disableSensors);
elements.sensitivitySelect.addEventListener("change", () => {
  state.sensitivity = elements.sensitivitySelect.value;
  if (state.mode !== "running") resetLiveSensorValues();
  addEvent("SENSE", elements.sensitivitySelect.value);
  render();
});
elements.autoOnButton.addEventListener("click", enableAutoMeasurement);
elements.autoOffButton.addEventListener("click", disableAutoMeasurement);
elements.manualOnButton.addEventListener("click", startManualMeasurement);
elements.manualOffButton.addEventListener("click", stopManualMeasurement);
elements.clearButton.addEventListener("click", () => {
  state.samples = [];
  state.rawSamples = [];
  state.events = [];
  state.speedMs = 0;
  state.startedAt = 0;
  state.stoppedAt = 0;
  state.currentRunId = "";
  state.autoMeasurementEnabled = false;
  state.measurementMode = "none";
  resetLiveSensorValues();
  setMode("idle", text.idle);
  renderEvents();
  render();
});
elements.exportButton.addEventListener("click", exportCsv);
elements.exportAllButton.addEventListener("click", exportAllJson);
elements.historyList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action][data-run]");
  if (!button) return;
  exportStoredRun(button.dataset.run, button.dataset.action);
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      addEvent("CACHE", "Offline cache unavailable");
    });
  });
}

render();
loadRuns();
