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
const CALIBRATION_MS = 4000;
const AXIS_LOCK_G = 0.08;
const MOTION_LOW_PASS_TAU_SEC = 0.08;
const VIBRATION_LEVEL_TAU_SEC = 0.35;
const START_CONFIRM_MS = 140;
const ZERO_SPEED_HOLD_MS = 450;
const GPS_MAX_ACCURACY_M = 50;
const GPS_MAX_SPEED_MS = 90;

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
  calibrating: "\u9759\u6b62\u88dc\u6b63\u4e2d",
  calibrated: "\u9759\u6b62\u88dc\u6b63\u5b8c\u4e86",
  axisLocked: "\u524d\u5f8c\u8ef8\u3092\u691c\u51fa",
  gpsReady: "GPS\u53d6\u5f97",
  gpsUnavailable: "GPS\u672a\u53d6\u5f97",
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
  vibrationG: document.querySelector("#vibrationG"),
  kalmanVariance: document.querySelector("#kalmanVariance"),
  gpsSpeed: document.querySelector("#gpsSpeed"),
  gpsStatus: document.querySelector("#gpsStatus"),
  calibrationStatus: document.querySelector("#calibrationStatus"),
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
  deviceOffsetX: 0,
  deviceOffsetY: 0,
  deviceOffsetZ: 0,
  yawOffset: 0,
  forwardAxis: "",
  forwardSign: 1,
  gravityVector: [0, 0, 1],
  forwardVector: null,
  lateralVector: null,
  calibrationActive: false,
  calibrationCompleted: false,
  calibrationStartedAt: 0,
  calibrationSamples: [],
  filteredAcceleration: [0, 0, 0],
  vibrationEnergy: 0,
  vibrationG: 0,
  startCandidateAt: 0,
  zeroSpeedCandidateAt: 0,
  confidence: 0,
  sensorEnabled: false,
  sensorListenersAttached: false,
  gpsWatchId: null,
  gpsSpeedMs: null,
  gpsAccuracyM: null,
  gpsSource: "none",
  gpsLatitude: null,
  gpsLongitude: null,
  gpsHeadingDeg: null,
  gpsLastPosition: null,
  gpsLastAt: 0,
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
let timerFrameId = null;

class MotionEkf {
  constructor() {
    this.n = 5;
    this.x = [0, 0, 0, 0, 0];
    this.p = diag([0.04, 0.08, 0.08, 12, 12]);
  }

  reset() {
    this.x = [0, 0, 0, 0, 0];
    this.p = diag([0.04, 0.08, 0.08, 12, 12]);
  }

  zeroSpeed() {
    this.x[0] = 0;
    this.p[0][0] = Math.min(this.p[0][0], 0.03);
    for (let i = 1; i < this.n; i += 1) {
      this.p[0][i] = 0;
      this.p[i][0] = 0;
    }
  }

  update(measurement, dt) {
    this.predict(dt);
    this.correct(measurement);
    return this.value();
  }

  predict(dt) {
    const [v, longG, latG, yawRate, bankDeg] = this.x;
    const accelDecay = Math.exp(-dt / 0.7);
    const yawDecay = Math.exp(-dt / 0.5);
    const rollBlend = Math.min(0.35, dt / 0.45);
    const rollEqDeg = Math.atan(latG) * RAD_TO_DEG;

    const next = [
      Math.max(0, v + (longG * G - DRAG_COEFF * v) * dt),
      longG * accelDecay,
      latG * accelDecay,
      yawRate * yawDecay,
      bankDeg + (rollEqDeg - bankDeg) * rollBlend,
    ];

    const f = identity(this.n);
    f[0][0] = Math.max(0, 1 - DRAG_COEFF * dt);
    f[0][1] = G * dt;
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
    ]);

    this.x = next;
    this.p = add(mul(mul(f, this.p), transpose(f)), q);
  }

  correct(measurement) {
    const h = [
      [0, 1, 0, 0, 0],
      [0, 0, 1, 0, 0],
      [0, 0, 0, 1, 0],
      [0, 0, 0, 0, 1],
    ];
    const z = [measurement.longG, measurement.latG, measurement.yawRate, measurement.bankDeg];
    const r = diag([0.012, 0.012, 9, 12]);
    const hx = matVec(h, this.x);
    const residual = z.map((value, index) => value - hx[index]);
    const s = add(mul(mul(h, this.p), transpose(h)), r);
    const k = mul(mul(this.p, transpose(h)), inverse4(s));
    this.x = addVec(this.x, matVec(k, residual));
    this.x[0] = Math.max(0, this.x[0]);
    this.p = mul(sub(identity(this.n), mul(k, h)), this.p);
  }

  updateGpsSpeed(speedMs, accuracyM, derived = false) {
    const sigma = derived
      ? Math.min(5, Math.max(1.2, accuracyM * 0.25))
      : Math.min(3, Math.max(0.4, accuracyM * 0.06));
    const innovationVariance = this.p[0][0] + sigma * sigma;
    const gains = this.p.map((row) => row[0] / innovationVariance);
    const residual = speedMs - this.x[0];
    const speedRow = this.p[0].slice();
    this.x = this.x.map((value, index) => value + gains[index] * residual);
    this.x[0] = Math.max(0, this.x[0]);
    this.p = this.p.map((row, rowIndex) =>
      row.map((value, colIndex) => value - gains[rowIndex] * speedRow[colIndex])
    );
    return this.value();
  }

  value() {
    return {
      speedMs: this.x[0],
      longG: this.x[1],
      latG: this.x[2],
      yawRate: this.x[3],
      bankDeg: this.x[4],
      longBias: 0,
      latBias: 0,
      yawBias: 0,
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
    vibrationG: state.vibrationG,
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

function startRun(mode = "auto", detail = text.startDetail, onsetAt = nowMs()) {
  state.startedAt = onsetAt;
  state.stoppedAt = 0;
  state.samples = [];
  state.rawSamples = [];
  state.events = state.events.filter((event) => event.type === "ARM");
  state.currentRunId = makeRunId();
  state.measurementMode = mode;
  state.startCandidateAt = 0;
  state.speedMs = 0;
  motionModel.zeroSpeed();
  setMode("running", text.running);
  addEvent("START", detail);
  state.events[0].timeMs = 0;
  render();
  startTimerRenderLoop();
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

function startTimerRenderLoop() {
  if (timerFrameId !== null) return;
  const tick = () => {
    timerFrameId = null;
    if (state.mode !== "running") return;
    render();
    timerFrameId = requestAnimationFrame(tick);
  };
  timerFrameId = requestAnimationFrame(tick);
}

function handleMotionSample(sample) {
  if (!state.sensorEnabled) return;
  const t = sample.time ?? nowMs();
  const dt = state.lastSampleAt ? Math.min(0.12, Math.max(0.005, (t - state.lastSampleAt) / 1000)) : 0.016;
  state.lastSampleAt = t;

  if (collectCalibrationSample(sample, t)) {
    render();
    return;
  }

  const profile = currentProfile();
  const calibrated = calibrateAndProjectSample(sample, t, dt);
  const cleanedLongG = applyDeadband(calibrated.longG, profile.deadbandG);
  const cleanedLatG = applyDeadband(calibrated.latG, profile.deadbandG);
  const estimate = motionModel.update({
    longG: cleanedLongG,
    latG: cleanedLatG,
    yawRate: calibrated.yawRate,
    bankDeg: calibrated.bankDeg,
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
  applyZeroSpeedUpdate(t);

  state.confidence = estimateConfidence({ ...sample, longG: calibrated.longG, latG: calibrated.latG, yawRate: calibrated.yawRate }, dt);

  detectEvents(t);
  storeSample(t);
  storeRawSample(t);
  render();
}

function calibrateAndProjectSample(sample, t, dt) {
  const rawX = Number.isFinite(sample.rawX) ? sample.rawX : sample.latG;
  const rawY = Number.isFinite(sample.rawY) ? sample.rawY : sample.longG;
  const rawZ = Number.isFinite(sample.rawZ) ? sample.rawZ : 0;
  const rawYaw = Number.isFinite(sample.yawRate) ? sample.yawRate : 0;

  const x = rawX - state.deviceOffsetX;
  const y = rawY - state.deviceOffsetY;
  const z = rawZ - state.deviceOffsetZ;
  const yawRate = rawYaw - state.yawOffset;
  const rawAcceleration = [x, y, z];
  const acceleration = filterEngineVibration(rawAcceleration, dt);

  maybeLockForwardAxis(acceleration);

  if (state.forwardVector && state.lateralVector) {
    const gravity = normalizeVector([
      sample.gravityX || 0,
      sample.gravityY || 0,
      sample.gravityZ || 0,
    ], state.gravityVector);
    const bankDeg = Math.atan2(
      dotVector(gravity, state.lateralVector),
      dotVector(gravity, state.gravityVector)
    ) * RAD_TO_DEG;
    return {
      longG: dotVector(acceleration, state.forwardVector),
      latG: dotVector(acceleration, state.lateralVector),
      yawRate,
      bankDeg: Number.isFinite(bankDeg) ? bankDeg : sample.bankDeg,
    };
  }

  if (state.forwardAxis === "x") {
    return { longG: state.forwardSign * x, latG: y, yawRate, bankDeg: sample.bankDeg };
  }
  if (state.forwardAxis === "y") {
    return { longG: state.forwardSign * y, latG: x, yawRate, bankDeg: sample.bankDeg };
  }

  if (Math.abs(y) >= Math.abs(x)) {
    return { longG: y, latG: x, yawRate, bankDeg: sample.bankDeg };
  }
  return { longG: x, latG: y, yawRate, bankDeg: sample.bankDeg };
}

function collectCalibrationSample(sample, t) {
  if (!state.calibrationActive) return false;
  const rawX = Number.isFinite(sample.rawX) ? sample.rawX : sample.latG;
  const rawY = Number.isFinite(sample.rawY) ? sample.rawY : sample.longG;
  const rawZ = Number.isFinite(sample.rawZ) ? sample.rawZ : 0;
  const rawYaw = Number.isFinite(sample.yawRate) ? sample.yawRate : 0;
  state.calibrationSamples.push({
    x: rawX,
    y: rawY,
    z: rawZ,
    yaw: rawYaw,
    gravityX: sample.gravityX || 0,
    gravityY: sample.gravityY || 0,
    gravityZ: sample.gravityZ || 0,
  });
  if (t - state.calibrationStartedAt >= CALIBRATION_MS && state.calibrationSamples.length >= 10) {
    finishCalibration();
  }
  return true;
}

function maybeLockForwardAxis(acceleration) {
  if (state.forwardAxis) return;
  if (state.mode !== "armed" && state.mode !== "running") return;
  const verticalPart = dotVector(acceleration, state.gravityVector);
  const horizontal = acceleration.map((value, index) => value - verticalPart * state.gravityVector[index]);
  if (vectorLength(horizontal) < AXIS_LOCK_G) return;
  state.forwardVector = normalizeVector(horizontal, [0, 1, 0]);
  state.lateralVector = normalizeVector(crossVector(state.gravityVector, state.forwardVector), [1, 0, 0]);
  state.forwardAxis = "vector";
  state.forwardSign = 1;
  addEvent("AXIS", `${text.axisLocked} 3D`);
}

function startCalibration() {
  resetLiveSensorValues();
  state.calibrationActive = true;
  state.calibrationCompleted = false;
  state.calibrationStartedAt = nowMs();
  state.calibrationSamples = [];
  state.filteredAcceleration = [0, 0, 0];
  state.vibrationEnergy = 0;
  state.vibrationG = 0;
  state.startCandidateAt = 0;
  state.deviceOffsetX = 0;
  state.deviceOffsetY = 0;
  state.deviceOffsetZ = 0;
  state.yawOffset = 0;
  state.forwardAxis = "";
  state.forwardSign = 1;
  state.forwardVector = null;
  state.lateralVector = null;
  setMode("calibrating", text.calibrating);
}

function finishCalibration() {
  const count = Math.max(1, state.calibrationSamples.length);
  state.deviceOffsetX = state.calibrationSamples.reduce((sum, sample) => sum + sample.x, 0) / count;
  state.deviceOffsetY = state.calibrationSamples.reduce((sum, sample) => sum + sample.y, 0) / count;
  state.deviceOffsetZ = state.calibrationSamples.reduce((sum, sample) => sum + sample.z, 0) / count;
  state.yawOffset = state.calibrationSamples.reduce((sum, sample) => sum + sample.yaw, 0) / count;
  state.gravityVector = normalizeVector([
    state.calibrationSamples.reduce((sum, sample) => sum + sample.gravityX, 0) / count,
    state.calibrationSamples.reduce((sum, sample) => sum + sample.gravityY, 0) / count,
    state.calibrationSamples.reduce((sum, sample) => sum + sample.gravityZ, 0) / count,
  ], [0, 0, 1]);
  state.calibrationActive = false;
  state.calibrationCompleted = true;
  state.calibrationSamples = [];
  resetLiveSensorValues(false);
  if (state.autoMeasurementEnabled && state.measurementMode === "auto" && !state.currentRunId) {
    setMode("armed", text.armed);
  } else {
    setMode("sensor-on", text.sensorOn);
  }
  addEvent("CAL", text.calibrated);
}

function applyZeroSpeedUpdate(t) {
  const stationary = Math.abs(state.longG) < 0.035 && Math.abs(state.latG) < 0.04 && Math.abs(state.yawRate) < 3.5;
  if (stationary) {
    state.zeroSpeedCandidateAt ||= t;
    if (t - state.zeroSpeedCandidateAt > ZERO_SPEED_HOLD_MS) {
      state.speedMs = 0;
      motionModel.zeroSpeed();
    }
  } else {
    state.zeroSpeedCandidateAt = 0;
  }
}

function estimateConfidence(sample, dt) {
  const hasMotion = Number.isFinite(sample.longG) && Number.isFinite(sample.latG);
  const cadence = dt > 0.006 && dt < 0.08;
  const attitude = Number.isFinite(sample.bankDeg);
  return Math.round(((hasMotion ? 0.45 : 0) + (cadence ? 0.3 : 0) + (attitude ? 0.25 : 0)) * 100);
}

function detectEvents(t) {
  const profile = currentProfile();
  if (state.autoMeasurementEnabled && state.mode === "armed") {
    if (state.longG > profile.startG) {
      state.startCandidateAt ||= t;
      if (t - state.startCandidateAt >= START_CONFIRM_MS) {
        startRun("auto", text.startDetail, state.startCandidateAt);
      }
    } else {
      state.startCandidateAt = 0;
    }
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
    gpsSpeedKmh: Number.isFinite(state.gpsSpeedMs) ? round(state.gpsSpeedMs * 3.6, 3) : null,
    gpsAccuracyM: Number.isFinite(state.gpsAccuracyM) ? round(state.gpsAccuracyM, 1) : null,
    gpsSource: state.gpsSource,
    latitude: Number.isFinite(state.gpsLatitude) ? round(state.gpsLatitude, 7) : null,
    longitude: Number.isFinite(state.gpsLongitude) ? round(state.gpsLongitude, 7) : null,
    gpsHeadingDeg: Number.isFinite(state.gpsHeadingDeg) ? round(state.gpsHeadingDeg, 1) : null,
    bankDeg: round(state.bankDeg, 2),
    yawRate: round(state.yawRate, 2),
    vibrationG: round(state.vibrationG, 4),
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
  const linear = event.acceleration;
  const gravity = event.accelerationIncludingGravity || {};
  const acc = linear || gravity;
  const rotation = event.rotationRate || {};
  const rawX = (acc.x || 0) / G;
  const rawY = (acc.y || 0) / G;
  const rawZ = (acc.z || 0) / G;
  handleMotionSample({
    time: nowMs(),
    rawX,
    rawY,
    rawZ,
    gravityX: (gravity.x || 0) / G,
    gravityY: (gravity.y || 0) / G,
    gravityZ: (gravity.z || 0) / G,
    longG: rawY,
    latG: rawX,
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
    startCalibration();
    startGps();
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
  state.calibrationActive = false;
  state.calibrationCompleted = false;
  state.calibrationSamples = [];
  state.forwardAxis = "";
  state.forwardSign = 1;
  state.forwardVector = null;
  state.lateralVector = null;
  stopGps();
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
  if (!state.sensorEnabled) {
    addEvent("ERROR", "先にSensor ONを押してください");
    return;
  }
  if (state.mode === "armed" && state.autoMeasurementEnabled) return;
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
  if (!state.sensorEnabled) {
    addEvent("ERROR", "先にSensor ONを押してください");
    return;
  }
  if (state.calibrationActive) {
    addEvent("CAL", "静止補正の完了を待ってください");
    return;
  }
  state.autoMeasurementEnabled = false;
  startRun("manual", text.manualStart);
}

function stopManualMeasurement() {
  stopRun(text.manualStop);
}

function resetLiveSensorValues() {
  state.lastSampleAt = 0;
  state.lastStopCandidateAt = 0;
  state.startCandidateAt = 0;
  state.zeroSpeedCandidateAt = 0;
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
  state.filteredAcceleration = [0, 0, 0];
  state.vibrationEnergy = 0;
  state.vibrationG = 0;
  motionModel.reset();
}

function startGps() {
  if (!("geolocation" in navigator) || state.gpsWatchId !== null) return;
  state.gpsWatchId = navigator.geolocation.watchPosition(
    onGpsPosition,
    () => {
      state.gpsSpeedMs = null;
      state.gpsAccuracyM = null;
      state.gpsSource = "none";
      render();
    },
    { enableHighAccuracy: true, maximumAge: 500, timeout: 12000 }
  );
}

function stopGps() {
  if (state.gpsWatchId !== null && "geolocation" in navigator) {
    navigator.geolocation.clearWatch(state.gpsWatchId);
  }
  state.gpsWatchId = null;
  state.gpsSpeedMs = null;
  state.gpsAccuracyM = null;
  state.gpsSource = "none";
  state.gpsLatitude = null;
  state.gpsLongitude = null;
  state.gpsHeadingDeg = null;
  state.gpsLastPosition = null;
  state.gpsLastAt = 0;
}

function onGpsPosition(position) {
  if (!state.sensorEnabled) return;
  const { coords, timestamp } = position;
  const accuracy = Number.isFinite(coords.accuracy) ? coords.accuracy : GPS_MAX_ACCURACY_M;
  let speedMs = Number.isFinite(coords.speed) && coords.speed >= 0 ? coords.speed : null;
  let derived = false;

  if (speedMs === null && state.gpsLastPosition && timestamp > state.gpsLastAt) {
    const dt = (timestamp - state.gpsLastAt) / 1000;
    const distance = haversineMeters(
      state.gpsLastPosition.latitude,
      state.gpsLastPosition.longitude,
      coords.latitude,
      coords.longitude
    );
    if (dt >= 0.3 && dt <= 5 && distance >= Math.max(2, accuracy * 0.5)) {
      speedMs = distance / dt;
      derived = true;
    }
  }

  state.gpsLastPosition = { latitude: coords.latitude, longitude: coords.longitude };
  state.gpsLastAt = timestamp;
  state.gpsAccuracyM = accuracy;
  state.gpsLatitude = coords.latitude;
  state.gpsLongitude = coords.longitude;
  state.gpsHeadingDeg = Number.isFinite(coords.heading) ? coords.heading : null;

  if (speedMs === null || speedMs > GPS_MAX_SPEED_MS || accuracy > GPS_MAX_ACCURACY_M) {
    state.gpsSpeedMs = null;
    state.gpsSource = "none";
    render();
    return;
  }

  state.gpsSpeedMs = speedMs;
  state.gpsSource = derived ? "position" : "sensor";
  const estimate = motionModel.updateGpsSpeed(speedMs, accuracy, derived);
  state.speedMs = estimate.speedMs;
  state.kalmanVariance = estimate.covariance;
  render();
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
  elements.vibrationG.textContent = `${state.vibrationG.toFixed(3)} g`;
  elements.kalmanVariance.textContent = state.kalmanVariance.toFixed(4);
  elements.gpsSpeed.textContent = Number.isFinite(state.gpsSpeedMs)
    ? `${(state.gpsSpeedMs * 3.6).toFixed(1)} km/h`
    : "-- km/h";
  elements.gpsStatus.textContent = Number.isFinite(state.gpsAccuracyM)
    ? `精度 ${state.gpsAccuracyM.toFixed(0)} m`
    : text.gpsUnavailable;
  if (state.calibrationActive) {
    const remaining = Math.max(0, CALIBRATION_MS - (nowMs() - state.calibrationStartedAt));
    elements.calibrationStatus.textContent = `${(remaining / 1000).toFixed(1)} 秒`;
  } else {
    elements.calibrationStatus.textContent = state.calibrationCompleted ? "完了" : "未実行";
  }
  drawTrace();
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

function filterEngineVibration(acceleration, dt) {
  const alpha = 1 - Math.exp(-dt / MOTION_LOW_PASS_TAU_SEC);
  state.filteredAcceleration = state.filteredAcceleration.map((value, index) =>
    value + alpha * (acceleration[index] - value)
  );
  const residual = acceleration.map((value, index) => value - state.filteredAcceleration[index]);
  const residualEnergy = dotVector(residual, residual);
  const vibrationAlpha = 1 - Math.exp(-dt / VIBRATION_LEVEL_TAU_SEC);
  state.vibrationEnergy += vibrationAlpha * (residualEnergy - state.vibrationEnergy);
  state.vibrationG = Math.sqrt(Math.max(0, state.vibrationEnergy));
  return state.filteredAcceleration.slice();
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

function dotVector(a, b) {
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

function crossVector(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function vectorLength(vector) {
  return Math.sqrt(dotVector(vector, vector));
}

function normalizeVector(vector, fallback) {
  const length = vectorLength(vector);
  if (!Number.isFinite(length) || length < 1e-6) return fallback.slice();
  return vector.map((value) => value / length);
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
    calibration: {
      deviceOffsetX: round(state.deviceOffsetX, 5),
      deviceOffsetY: round(state.deviceOffsetY, 5),
      deviceOffsetZ: round(state.deviceOffsetZ, 5),
      yawOffset: round(state.yawOffset, 3),
      forwardAxis: state.forwardAxis || "auto",
      forwardSign: state.forwardSign,
      gravityVector: state.gravityVector.map((value) => round(value, 5)),
      forwardVector: state.forwardVector?.map((value) => round(value, 5)) || null,
      lateralVector: state.lateralVector?.map((value) => round(value, 5)) || null,
    },
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
    calibration: run.calibration || null,
    summary: {
      maxSpeedKmh: round(samples.reduce((max, sample) => Math.max(max, sample.speedKmh || 0), 0), 2),
      maxGpsSpeedKmh: round(samples.reduce((max, sample) => Math.max(max, sample.gpsSpeedKmh || 0), 0), 2),
      gpsSampleCount: samples.filter((sample) => Number.isFinite(sample.gpsSpeedKmh)).length,
      maxLongG: round(samples.reduce((max, sample) => Math.max(max, sample.longG || 0), 0), 3),
      minLongG: round(samples.reduce((min, sample) => Math.min(min, sample.longG || 0), 0), 3),
      maxLatGAbs: round(maxByAbs("latG"), 3),
      maxBankDegAbs: round(maxByAbs("bankDeg"), 1),
      maxYawRateAbs: round(maxByAbs("yawRate"), 1),
      maxVibrationG: round(samples.reduce((max, sample) => Math.max(max, sample.vibrationG || 0), 0), 4),
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
  const eventHeader = "section,time_ms,type,detail,long_g,lat_g,speed_kmh,gps_speed_kmh,gps_accuracy_m,gps_source,latitude,longitude,gps_heading_deg,bank_deg,yaw_rate,vibration_g,long_g_variance,lat_g_variance,kalman_variance,long_bias,lat_bias,yaw_bias,confidence\n";
  const eventRows = run.events.map((event) => [
    "event",
    event.timeMs,
    event.type,
    event.detail,
    fixed(event.longG, 3),
    fixed(event.latG, 3),
    fixed(event.speedKmh, 2),
    "",
    "",
    "",
    "",
    "",
    "",
    fixed(event.bankDeg, 1),
    fixed(event.yawRate, 1),
    fixed(event.vibrationG, 4),
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
    fixed(sample.gpsSpeedKmh, 3),
    fixed(sample.gpsAccuracyM, 1),
    sample.gpsSource || "",
    fixed(sample.latitude, 7),
    fixed(sample.longitude, 7),
    fixed(sample.gpsHeadingDeg, 1),
    fixed(sample.bankDeg, 2),
    fixed(sample.yawRate, 2),
    fixed(sample.vibrationG, 4),
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
