const G = 9.80665;
const APP_VERSION = "v39";
const LOG_SCHEMA_VERSION = 8;
const STOP_HOLD_MS = 950;
const DB_NAME = "moto-gym-ana";
const DB_VERSION = 1;
const RUN_STORE = "runs";
const RAW_SAMPLE_LIMIT = 20000;
const PRESTART_BUFFER_MS = 5000;
const PRESTART_SAMPLE_LIMIT = 600;
const VARIANCE_WINDOW = 90;
const RAD_TO_DEG = 180 / Math.PI;
const DRAG_COEFF = 0;
const SPEED_PROCESS_NOISE = 1.2;
const GPS_SPEED_SIGMA_SCALE = 0.35;
const CALIBRATION_MS = 4000;
const AXIS_LOCK_G = 0.08;
const AXIS_LOCK_HOLD_MS = 100;
const AXIS_LOCK_MAX_GAP_MS = 80;
const AXIS_LOCK_MIN_DIRECTION_DOT = 0.8;
const MOTION_LOW_PASS_TAU_SEC = 0.08;
const VIBRATION_LEVEL_TAU_SEC = 0.35;
const BANK_OBSERVATION_VARIANCE = 30;
const BANK_DYNAMICS_SCALE = 2;
const START_CONFIRM_MS = 100;
const GENTLE_START_CONFIRM_MS = 350;
const GENTLE_START_RATIO = 0.72;
const GENTLE_START_MIN_G = 0.12;
const PRESTART_RETENTION_MS = PRESTART_BUFFER_MS + AXIS_LOCK_HOLD_MS + START_CONFIRM_MS + 250;
const AUTO_READY_HOLD_MS = 600;
const CHECKPOINT_INTERVAL_MS = 15000;
const POST_STOP_CAPTURE_MS = 5000;
const POST_STOP_SAMPLE_LIMIT = 600;
const ZERO_SPEED_HOLD_MS = 450;
const GPS_FRESH_MS = 2500;
const GPS_STOP_SPEED_MS = 0.8;
const GPS_STRICT_STOP_SPEED_MS = 0.15;
const GPS_DWELL_MEAN_SPEED_MS = 0.4;
const GPS_STOP_MAX_OBSERVATION_GAP_MS = 1600;
const GPS_STRICT_STOP_HOLD_MS = 1800;
const GPS_DWELL_HOLD_MS = 2200;
const GPS_STOP_HISTORY_MS = 3500;
const GPS_STRICT_STOP_MAX_DISPLACEMENT_M = 1.5;
const GPS_DWELL_MAX_DISPLACEMENT_M = 0.75;
const IMU_STOP_SPEED_MS = 0.35;
const RECENT_BRAKE_MS = 3500;
const SENSOR_GAP_SEC = 0.5;
const GPS_MAX_ACCURACY_M = 50;
const GPS_MAX_SPEED_MS = 90;
const GPS_INNOVATION_GATE_SIGMA = 8;
const GPS_INNOVATION_FLOOR_MS = 3;
const IMU_INNOVATION_GATE_SIGMA = 6;
const CALIBRATION_MIN_HZ = 15;
const CALIBRATION_MAX_MEAN_G = 0.12;
const CALIBRATION_MAX_GRAVITY_DRIFT_DEG = 7;
const CALIBRATION_MAX_VIBRATION_G = 0.6;
const LEARNED_START_G_MIN = 0.1;
const LEARNED_START_G_MAX = 0.24;
const IMPORT_FILE_MAX_BYTES = 100 * 1024 * 1024;
const IMPORT_RUN_MAX = 1000;
const IMPORT_SAMPLE_MAX = RAW_SAMPLE_LIMIT + PRESTART_SAMPLE_LIMIT + POST_STOP_SAMPLE_LIMIT;

const sensitivityProfiles = {
  calm: { startG: 0.22, accelG: 0.32, brakeG: -0.34, turnRate: 48, bankAngle: 24, deadbandG: 0.035 },
  normal: { startG: 0.16, accelG: 0.26, brakeG: -0.3, turnRate: 40, bankAngle: 20, deadbandG: 0.025 },
  sharp: { startG: 0.12, accelG: 0.19, brakeG: -0.22, turnRate: 30, bankAngle: 15, deadbandG: 0.014 },
};

const text = {
  idle: "\u5f85\u6a5f\u4e2d",
  sensorReady: "\u30bb\u30f3\u30b5\u63a5\u7d9a",
  needPermission: "\u8a31\u53ef\u304c\u5fc5\u8981",
  armed: "\u767a\u9032\u5f85\u3061",
  autoPreparing: "\u9759\u6b62\u78ba\u8a8d\u4e2d",
  running: "\u8d70\u884c\u4e2d",
  stopCandidate: "\u505c\u6b62\u5019\u88dc\u4e2d",
  stopped: "\u8a08\u6e2c\u5b8c\u4e86",
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
  autoOn: "\u81ea\u52d5\u8a08\u6e2c\u3092\u5f85\u6a5f",
  autoOff: "\u81ea\u52d5\u5f85\u6a5f\u3092\u89e3\u9664",
  saved: "\u81ea\u52d5\u4fdd\u5b58\u6e08\u307f",
  storageReady: "\u81ea\u52d5\u4fdd\u5b58\u6709\u52b9",
  storageUnavailable: "\u81ea\u52d5\u4fdd\u5b58\u4e0d\u53ef",
  sensorOff: "\u30bb\u30f3\u30b5OFF",
  sensorOn: "\u30bb\u30f3\u30b5\u30fc\u5f85\u6a5f",
  sensorDisabled: "\u30bb\u30f3\u30b5\u505c\u6b62",
  calibrating: "\u9759\u6b62\u88dc\u6b63\u4e2d",
  calibrated: "\u9759\u6b62\u88dc\u6b63\u5b8c\u4e86",
  axisLocked: "\u524d\u5f8c\u8ef8\u3092\u691c\u51fa",
  gpsReady: "GPS\u53d6\u5f97",
  gpsUnavailable: "GPS\u672a\u53d6\u5f97",
  gpsStandstill: "GPS\u9759\u6b62\u5f85\u3061",
  gpsMoving: "\u505c\u8eca\u3057\u3066\u518d\u5f85\u6a5f",
  backgroundStop: "\u30ca\u30d3/\u753b\u9762\u5207\u66ff\u3067\u8a08\u6e2c\u4e2d\u65ad",
  backgroundArmCancelled: "\u30ca\u30d3/\u753b\u9762\u5207\u66ff\u3067\u767a\u9032\u5f85\u3061\u3092\u89e3\u9664",
};

const elements = {
  appVersion: document.querySelector("#appVersion"),
  preflightSummary: document.querySelector("#preflightSummary"),
  readyVersion: document.querySelector("#readyVersion"),
  readySensor: document.querySelector("#readySensor"),
  readyCalibration: document.querySelector("#readyCalibration"),
  readyGps: document.querySelector("#readyGps"),
  readyStorage: document.querySelector("#readyStorage"),
  readyTiming: document.querySelector("#readyTiming"),
  sensorStatus: document.querySelector("#sensorStatus"),
  rideState: document.querySelector("#rideState"),
  timer: document.querySelector("#timer"),
  permissionButton: document.querySelector("#permissionButton"),
  sensorOffButton: document.querySelector("#sensorOffButton"),
  calibrationButton: document.querySelector("#calibrationButton"),
  sensitivitySelect: document.querySelector("#sensitivitySelect"),
  autoOnButton: document.querySelector("#autoOnButton"),
  autoOffButton: document.querySelector("#autoOffButton"),
  manualOnButton: document.querySelector("#manualOnButton"),
  manualOffButton: document.querySelector("#manualOffButton"),
  clearButton: document.querySelector("#clearButton"),
  exportButton: document.querySelector("#exportButton"),
  exportAllButton: document.querySelector("#exportAllButton"),
  selectAllRuns: document.querySelector("#selectAllRuns"),
  selectedRunCount: document.querySelector("#selectedRunCount"),
  exportSelectedJsonButton: document.querySelector("#exportSelectedJsonButton"),
  exportSelectedCsvButton: document.querySelector("#exportSelectedCsvButton"),
  deleteSelectedButton: document.querySelector("#deleteSelectedButton"),
  importJsonButton: document.querySelector("#importJsonButton"),
  importJsonInput: document.querySelector("#importJsonInput"),
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
  calibrationDetail: document.querySelector("#calibrationDetail"),
  eventLog: document.querySelector("#eventLog"),
  historyList: document.querySelector("#historyList"),
  storageStatus: document.querySelector("#storageStatus"),
  storageRetryButton: document.querySelector("#storageRetryButton"),
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
  gravityBankDeg: 0,
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
  gyroOffsetVector: [0, 0, 0],
  rawGyroVector: [0, 0, 0],
  rollRate: 0,
  forwardAxis: "",
  forwardSign: 1,
  gravityVector: [0, 0, 1],
  forwardVector: null,
  lateralVector: null,
  axisCandidateVector: [0, 0, 0],
  axisCandidateStartedAt: 0,
  axisCandidateLastAt: 0,
  calibrationActive: false,
  calibrationCompleted: false,
  calibrationState: "not-run",
  calibrationQuality: null,
  calibrationFailure: "",
  calibrationStartedAt: 0,
  calibrationSamples: [],
  bikeProfile: null,
  filteredAcceleration: [0, 0, 0],
  vibrationEnergy: 0,
  vibrationG: 0,
  startCandidateAt: 0,
  strongStartCandidateAt: 0,
  startCandidateLastAt: 0,
  startCandidateVelocityMs: 0,
  autoReadyCandidateAt: 0,
  autoStartReady: false,
  autoStopCandidate: false,
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
  gpsReceivedAt: 0,
  gpsTimestampMs: null,
  gpsAgeMs: null,
  gpsFilterTimestampMs: null,
  gpsObservationSequence: 0,
  gpsObservations: [],
  gpsStopEvidence: false,
  gpsStopObservationCount: 0,
  gpsStopDwellMs: 0,
  gpsStopDisplacementM: null,
  gpsStopLatch: null,
  gpsInnovationClipped: false,
  imuInnovationClipped: false,
  gravityErrorG: 0,
  turnConsistencyDeg: null,
  autoMeasurementEnabled: false,
  measurementMode: "none",
  sensitivity: "normal",
  longGVariance: 0,
  latGVariance: 0,
  kalmanVariance: 0,
  samples: [],
  varianceSamples: [],
  rawSamples: [],
  preStartSamples: [],
  events: [],
  savedRuns: [],
  storageAvailable: false,
  storagePersisted: null,
  storageCheckPending: false,
  storageUsageBytes: null,
  storageQuotaBytes: null,
  selectedRunIds: new Set(),
  postStopCaptures: [],
  currentRunId: "",
  lastBrakeAt: 0,
  gpsResyncPending: false,
  lastSensorGapSec: 0,
  lastCheckpointAt: 0,
};

let dbPromise = null;
let timerFrameId = null;
let runSaveQueue = Promise.resolve();

function josephScalarCovariance(covariance, gains, stateIndex, measurementVariance) {
  const innovationVariance = covariance[stateIndex][stateIndex] + measurementVariance;
  return covariance.map((row, rowIndex) => row.map((value, colIndex) =>
    value
      - gains[rowIndex] * covariance[stateIndex][colIndex]
      - covariance[rowIndex][stateIndex] * gains[colIndex]
      + gains[rowIndex] * innovationVariance * gains[colIndex]));
}

class MotionEkf {
  constructor() {
    this.n = 5;
    this.x = [0, 0, 0, 0, 0];
    this.p = diag([0.04, 0.08, 0.08, 12, 12]);
    this.gpsInnovationClipped = false;
    this.imuInnovationClipped = false;
  }

  reset() {
    this.x = [0, 0, 0, 0, 0];
    this.p = diag([0.04, 0.08, 0.08, 12, 12]);
    this.gpsInnovationClipped = false;
    this.imuInnovationClipped = false;
  }

  zeroSpeed() {
    this.x[0] = 0;
    this.p[0][0] = Math.min(this.p[0][0], 0.03);
    for (let i = 1; i < this.n; i += 1) {
      this.p[0][i] = 0;
      this.p[i][0] = 0;
    }
  }

  setSpeed(speedMs) {
    this.x[0] = Math.max(0, speedMs);
    this.p[0][0] = Math.max(this.p[0][0], 0.06);
  }

  update(measurement, dt) {
    this.predict(dt, measurement);
    this.correct(measurement);
    return this.value();
  }

  predict(dt, measurement = {}) {
    const [v, longG, latG, yawRate, bankDeg] = this.x;
    const accelDecay = Math.exp(-dt / 0.7);
    const yawDecay = Math.exp(-dt / 0.5);
    const measuredLongG = measurement.longG;
    const rollRateDps = measurement.rollRateDps || 0;
    const driveLongG = Number.isFinite(measuredLongG)
      ? 0.75 * measuredLongG + 0.25 * longG
      : longG;

    const next = [
      Math.max(0, v + (driveLongG * G - DRAG_COEFF * v) * dt),
      longG * accelDecay,
      latG * accelDecay,
      yawRate * yawDecay,
      bankDeg - rollRateDps * dt,
    ];

    const f = identity(this.n);
    f[0][0] = Math.max(0, 1 - DRAG_COEFF * dt);
    f[0][1] = 0.25 * G * dt;
    f[1][1] = accelDecay;
    f[2][2] = accelDecay;
    f[3][3] = yawDecay;
    f[4][4] = 1;

    const q = diag([
      SPEED_PROCESS_NOISE * dt,
      0.09 * dt,
      0.09 * dt,
      18 * dt,
      (1 + Math.min(3, Math.abs(rollRateDps) / 45)) * dt,
    ]);

    this.x = next;
    this.p = add(mul(mul(f, this.p), transpose(f)), q);
  }

  correct(measurement) {
    const z = [measurement.longG, measurement.latG, measurement.yawRate, measurement.bankDeg];
    const variances = [
      measurement.longVariance || 0.012,
      measurement.latVariance || 0.012,
      measurement.yawVariance || 9,
      measurement.bankVariance || BANK_OBSERVATION_VARIANCE,
    ];
    this.imuInnovationClipped = false;
    z.forEach((observation, offset) => {
      if (!Number.isFinite(observation)) return;
      const stateIndex = offset + 1;
      const variance = Math.max(1e-9, variances[offset]);
      const innovationVariance = Math.max(1e-9, this.p[stateIndex][stateIndex] + variance);
      const residual = observation - this.x[stateIndex];
      const residualLimit = IMU_INNOVATION_GATE_SIGMA * Math.sqrt(innovationVariance);
      const robustResidual = clamp(residual, -residualLimit, residualLimit);
      if (robustResidual !== residual) this.imuInnovationClipped = true;
      const gains = this.p.map((row) => row[stateIndex] / innovationVariance);
      this.x = this.x.map((value, index) => value + gains[index] * robustResidual);
      this.p = josephScalarCovariance(this.p, gains, stateIndex, variance);
      this.stabilizeCovariance();
    });
    this.x[0] = Math.max(0, this.x[0]);
  }

  stabilizeCovariance() {
    for (let row = 0; row < this.n; row += 1) {
      this.p[row][row] = Math.max(1e-9, this.p[row][row]);
      for (let col = row + 1; col < this.n; col += 1) {
        const symmetric = (this.p[row][col] + this.p[col][row]) / 2;
        this.p[row][col] = symmetric;
        this.p[col][row] = symmetric;
      }
    }
  }

  updateGpsSpeed(speedMs, accuracyM, derived = false) {
    const baseSigma = derived
      ? Math.min(5, Math.max(1.2, accuracyM * 0.25))
      : Math.min(3, Math.max(0.4, accuracyM * 0.06));
    const sigma = Math.max(0.15, baseSigma * GPS_SPEED_SIGMA_SCALE);
    const innovationVariance = this.p[0][0] + sigma * sigma;
    const gains = this.p.map((row) => row[0] / innovationVariance);
    const residual = speedMs - this.x[0];
    const residualLimit = Math.max(
      GPS_INNOVATION_FLOOR_MS,
      GPS_INNOVATION_GATE_SIGMA * Math.sqrt(innovationVariance)
    );
    this.gpsInnovationClipped = Math.abs(residual) > residualLimit;
    const robustResidual = Math.max(-residualLimit, Math.min(residualLimit, residual));
    this.x = this.x.map((value, index) => value + gains[index] * robustResidual);
    this.x[0] = Math.max(0, this.x[0]);
    this.p = josephScalarCovariance(this.p, gains, 0, sigma * sigma);
    this.stabilizeCovariance();
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
      gpsInnovationClipped: this.gpsInnovationClipped,
      imuInnovationClipped: this.imuInnovationClipped,
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
  resetLiveSensorValues(true);
  resetForwardAxis();
  state.samples = [];
  state.rawSamples = [];
  state.preStartSamples = [];
  state.lastStopCandidateAt = 0;
  state.lastBrakeAt = 0;
  state.currentRunId = "";
  state.events = [];
  state.measurementMode = "auto";
  state.autoReadyCandidateAt = 0;
  state.autoStartReady = false;
  state.autoStopCandidate = false;
  state.gpsObservations = [];
  state.gpsStopEvidence = false;
  state.gpsStopObservationCount = 0;
  state.gpsStopDwellMs = 0;
  state.gpsStopDisplacementM = null;
  state.gpsStopLatch = null;
  state.gpsFilterTimestampMs = null;
  setMode("armed", text.autoPreparing);
  addEvent("ARM", text.armDetail);
}

function startRun(mode = "auto", detail = text.startDetail, onsetAt = nowMs(), initialSpeedMs = 0) {
  const detectedAt = nowMs();
  const bufferedSamples = mode === "auto"
    ? state.preStartSamples
      .filter((entry) => entry.t >= onsetAt - PRESTART_BUFFER_MS && entry.t < detectedAt)
      .map((entry) => ({ ...entry.sample, timeMs: Math.round(entry.t - onsetAt) }))
    : [];
  state.startedAt = onsetAt;
  state.stoppedAt = 0;
  state.samples = [];
  state.rawSamples = bufferedSamples;
  state.preStartSamples = [];
  state.events = state.events.filter((event) => event.type === "ARM");
  state.currentRunId = makeRunId();
  state.measurementMode = mode;
  state.startCandidateAt = 0;
  state.strongStartCandidateAt = 0;
  state.startCandidateLastAt = 0;
  state.startCandidateVelocityMs = 0;
  state.autoStopCandidate = false;
  state.gpsObservations = [];
  state.gpsStopEvidence = false;
  state.gpsStopObservationCount = 0;
  state.gpsStopDwellMs = 0;
  state.gpsStopDisplacementM = null;
  state.gpsStopLatch = null;
  state.gpsFilterTimestampMs = null;
  state.lastCheckpointAt = onsetAt;
  state.speedMs = Math.max(0, initialSpeedMs);
  motionModel.zeroSpeed();
  motionModel.setSpeed(state.speedMs);
  setMode("running", text.running);
  addEvent("START", detail);
  state.events[0].timeMs = 0;
  if (mode === "auto") state.events[0].speedKmh = 0;
  render();
  startTimerRenderLoop();
}

function stopRun(reason = text.stopDetail, stoppedAt = nowMs(), eventType = "STOP") {
  if (state.mode !== "running") return;
  const shouldRearmAuto = eventType === "STOP"
    && reason === text.stopHold
    && state.autoMeasurementEnabled
    && state.measurementMode === "auto"
    && state.sensorEnabled;
  state.stoppedAt = Math.max(state.startedAt, Math.min(stoppedAt, nowMs()));
  state.autoStopCandidate = false;
  setMode("stopped", text.stopped);
  addEvent(eventType, reason);
  state.events[0].timeMs = Math.round(state.stoppedAt - state.startedAt);
  elements.timer.textContent = formatTime(state.stoppedAt - state.startedAt);
  saveCurrentRun(shouldRearmAuto);
  if (shouldRearmAuto) {
    armTimer();
  } else {
    state.measurementMode = "none";
  }
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
  const sampleIntervalSec = state.lastSampleAt ? Math.max(0, (t - state.lastSampleAt) / 1000) : 0.016;
  const dt = Math.min(0.12, Math.max(0.005, sampleIntervalSec));
  state.lastSampleAt = t;

  if (collectCalibrationSample(sample, t)) {
    render();
    return;
  }

  if (!state.calibrationCompleted || (state.mode !== "armed" && state.mode !== "running")) {
    return;
  }

  if (state.mode === "running" && sampleIntervalSec > SENSOR_GAP_SEC) {
    handleSensorGap(sampleIntervalSec);
  }

  const profile = currentProfile();
  const calibrated = calibrateAndProjectSample(sample, t, dt);
  const cleanedLongG = applyDeadband(calibrated.longG, profile.deadbandG);
  const cleanedLatG = applyDeadband(calibrated.latG, profile.deadbandG);
  const vibrationVarianceScale = 1 + Math.min(2, (state.vibrationG / 0.25) ** 2);
  const gravityVarianceScale = 1 + Math.min(8, (calibrated.gravityErrorG / 0.08) ** 2);
  const calibratedYawNoise = Math.max(3, profile.yawNoiseP95Dps || 0);
  const yawVariance = calibratedYawNoise ** 2
    * (1 + Math.min(2, (state.vibrationG / 0.5) ** 2))
    * gravityVarianceScale;
  const estimate = motionModel.update({
    longG: cleanedLongG,
    latG: cleanedLatG,
    yawRate: calibrated.yawRate,
    bankDeg: calibrated.bankDeg,
    rollRateDps: state.rollRate,
    vibrationG: state.vibrationG,
    longVariance: 0.012 * vibrationVarianceScale,
    latVariance: 0.012 * vibrationVarianceScale,
    yawVariance,
    bankVariance: BANK_OBSERVATION_VARIANCE * Math.exp(Math.min(
      4,
      BANK_DYNAMICS_SCALE * (Math.abs(cleanedLongG) + Math.abs(cleanedLatG) + state.vibrationG),
    )) * gravityVarianceScale,
  }, dt);
  state.longG = estimate.longG;
  state.latG = estimate.latG;
  state.yawRate = estimate.yawRate;
  state.bankDeg = estimate.bankDeg;
  state.gravityBankDeg = calibrated.bankDeg;
  state.speedMs = estimate.speedMs;
  state.longBias = estimate.longBias;
  state.latBias = estimate.latBias;
  state.yawBias = estimate.yawBias;
  state.kalmanVariance = estimate.covariance;
  state.imuInnovationClipped = estimate.imuInnovationClipped;
  state.gravityErrorG = calibrated.gravityErrorG;
  state.turnConsistencyDeg = coordinatedTurnErrorDeg(
    estimate.speedMs,
    estimate.yawRate,
    estimate.bankDeg,
    state.rollRate,
  );
  if (state.mode === "armed") {
    state.speedMs = 0;
    motionModel.setSpeed(0);
  }
  if (state.longG < -0.05) state.lastBrakeAt = t;
  updateVariance(cleanedLongG, cleanedLatG);
  applyZeroSpeedUpdate(t);

  state.confidence = estimateConfidence({ ...sample, longG: calibrated.longG, latG: calibrated.latG, yawRate: calibrated.yawRate }, dt);

  if (state.mode === "armed" && state.autoMeasurementEnabled) storePreStartSample(t, sampleIntervalSec);
  detectEvents(t);
  capturePostStopSamples(t, sampleIntervalSec);
  if (state.mode === "running") {
    storeSample(t);
    storeRawSample(t, sampleIntervalSec);
  }
  render();
}

function handleSensorGap(gapSec) {
  state.lastSensorGapSec = gapSec;
  state.gpsResyncPending = true;
  addEvent("GAP", `IMU欠測 ${gapSec.toFixed(1)}秒`);
  if (hasFreshGps()) resyncSpeedFromGps("欠測復帰時GPS");
}

function resyncSpeedFromGps(reason) {
  if (!Number.isFinite(state.gpsSpeedMs)) return false;
  motionModel.reset();
  motionModel.setSpeed(state.gpsSpeedMs);
  state.speedMs = state.gpsSpeedMs;
  state.gpsInnovationClipped = false;
  state.gpsResyncPending = false;
  state.gpsObservations = [];
  state.gpsStopEvidence = false;
  state.gpsStopObservationCount = 0;
  state.gpsStopDwellMs = 0;
  state.gpsStopDisplacementM = null;
  state.gpsStopLatch = null;
  addEvent("SYNC", `${reason} ${(state.gpsSpeedMs * 3.6).toFixed(1)} km/h`);
  return true;
}

function calibrateAndProjectSample(sample, t, dt) {
  const rawX = Number.isFinite(sample.rawX) ? sample.rawX : sample.latG;
  const rawY = Number.isFinite(sample.rawY) ? sample.rawY : sample.longG;
  const rawZ = Number.isFinite(sample.rawZ) ? sample.rawZ : 0;
  const rawGyro = Array.isArray(sample.gyroVector)
    ? sample.gyroVector.map((value) => Number.isFinite(value) ? value : 0)
    : [0, 0, Number.isFinite(sample.yawRate) ? sample.yawRate : 0];

  const x = rawX - state.deviceOffsetX;
  const y = rawY - state.deviceOffsetY;
  const z = rawZ - state.deviceOffsetZ;
  const gyro = rawGyro.map((value, index) => value - state.gyroOffsetVector[index]);
  const gravity = normalizeVector([
    sample.gravityX || 0,
    sample.gravityY || 0,
    sample.gravityZ || 0,
  ], state.gravityVector);
  const gravityMagnitudeG = vectorLength([
    sample.gravityX || 0,
    sample.gravityY || 0,
    sample.gravityZ || 0,
  ]);
  const gravityErrorG = Math.abs(gravityMagnitudeG - 1);
  const yawRate = dotVector(gyro, gravity);
  const rollRate = state.forwardVector ? dotVector(gyro, state.forwardVector) : 0;
  state.rawGyroVector = rawGyro;
  state.rollRate = rollRate;
  const rawAcceleration = [x, y, z];
  const acceleration = filterEngineVibration(rawAcceleration, dt);

  const verticalPart = dotVector(acceleration, state.gravityVector);
  const horizontalAcceleration = acceleration.map((value, index) => value - verticalPart * state.gravityVector[index]);
  maybeLockForwardAxis(horizontalAcceleration, t);

  if (state.forwardVector && state.lateralVector) {
    const bankDeg = Math.atan2(
      dotVector(gravity, state.lateralVector),
      dotVector(gravity, state.gravityVector)
    ) * RAD_TO_DEG;
    return {
      longG: dotVector(acceleration, state.forwardVector),
      latG: dotVector(acceleration, state.lateralVector),
      yawRate,
      bankDeg: Number.isFinite(bankDeg) ? bankDeg : sample.bankDeg,
      gravityErrorG,
    };
  }

  if (state.forwardAxis === "x") {
    return { longG: state.forwardSign * x, latG: y, yawRate, bankDeg: 0, gravityErrorG };
  }
  if (state.forwardAxis === "y") {
    return { longG: state.forwardSign * y, latG: x, yawRate, bankDeg: 0, gravityErrorG };
  }

  return { longG: vectorLength(horizontalAcceleration), latG: 0, yawRate, bankDeg: 0, gravityErrorG };
}

function coordinatedTurnErrorDeg(speedMs, yawRateDps, bankDeg, rollRateDps) {
  if (speedMs < 2
    || Math.abs(yawRateDps) < 4
    || Math.abs(bankDeg) < 3
    || Math.abs(rollRateDps) > 15) return null;
  const expectedBankDeg = Math.atan(
    Math.abs(speedMs * yawRateDps / RAD_TO_DEG) / G
  ) * RAD_TO_DEG;
  return Math.abs(Math.abs(bankDeg) - expectedBankDeg);
}

function collectCalibrationSample(sample, t) {
  if (!state.calibrationActive) return false;
  const rawX = Number.isFinite(sample.rawX) ? sample.rawX : sample.latG;
  const rawY = Number.isFinite(sample.rawY) ? sample.rawY : sample.longG;
  const rawZ = Number.isFinite(sample.rawZ) ? sample.rawZ : 0;
  const rawGyro = Array.isArray(sample.gyroVector)
    ? sample.gyroVector.map((value) => Number.isFinite(value) ? value : 0)
    : [0, 0, Number.isFinite(sample.yawRate) ? sample.yawRate : 0];
  state.calibrationSamples.push({
    x: rawX,
    y: rawY,
    z: rawZ,
    linearAvailable: sample.linearAvailable !== false,
    gyroX: rawGyro[0],
    gyroY: rawGyro[1],
    gyroZ: rawGyro[2],
    gravityX: sample.gravityX || 0,
    gravityY: sample.gravityY || 0,
    gravityZ: sample.gravityZ || 0,
  });
  if (t - state.calibrationStartedAt >= CALIBRATION_MS && state.calibrationSamples.length >= 10) {
    finishCalibration();
  }
  return true;
}

function resetAxisCandidate() {
  state.axisCandidateVector = [0, 0, 0];
  state.axisCandidateStartedAt = 0;
  state.axisCandidateLastAt = 0;
}

function resetForwardAxis() {
  state.forwardAxis = "";
  state.forwardSign = 1;
  state.forwardVector = null;
  state.lateralVector = null;
  resetAxisCandidate();
}

function maybeLockForwardAxis(horizontal, t) {
  if (state.forwardAxis) return;
  if (state.mode !== "armed" && state.mode !== "running") return;
  if (state.mode === "armed" && !state.autoStartReady) return;
  const magnitude = vectorLength(horizontal);
  if (magnitude < AXIS_LOCK_G) {
    if (state.axisCandidateLastAt && t - state.axisCandidateLastAt > AXIS_LOCK_MAX_GAP_MS) resetAxisCandidate();
    return;
  }

  const direction = normalizeVector(horizontal, [0, 1, 0]);
  const candidateDirection = normalizeVector(state.axisCandidateVector, direction);
  const candidateExpired = !state.axisCandidateStartedAt || t - state.axisCandidateLastAt > AXIS_LOCK_MAX_GAP_MS;
  const directionChanged = state.axisCandidateStartedAt
    && dotVector(candidateDirection, direction) < AXIS_LOCK_MIN_DIRECTION_DOT;
  if (candidateExpired || directionChanged) {
    state.axisCandidateVector = horizontal.slice();
    state.axisCandidateStartedAt = t;
  } else {
    state.axisCandidateVector = state.axisCandidateVector.map((value, index) => value + horizontal[index]);
  }
  state.axisCandidateLastAt = t;
  if (t - state.axisCandidateStartedAt < AXIS_LOCK_HOLD_MS) return;

  state.forwardVector = normalizeVector(state.axisCandidateVector, [0, 1, 0]);
  state.lateralVector = normalizeVector(crossVector(state.gravityVector, state.forwardVector), [1, 0, 0]);
  state.forwardAxis = "vector";
  state.forwardSign = 1;
  resetAxisCandidate();
  addEvent("AXIS", `${text.axisLocked} 3D`);
}

function startCalibration() {
  if (!state.sensorEnabled) {
    addEvent("ERROR", "先にSensor ONを押してください");
    return;
  }
  if (state.mode === "running") {
    addEvent("CAL", "走行中は補正できません");
    return;
  }
  resetLiveSensorValues();
  state.autoMeasurementEnabled = false;
  state.measurementMode = "none";
  state.calibrationActive = true;
  state.calibrationCompleted = false;
  state.calibrationState = "running";
  state.calibrationQuality = null;
  state.calibrationFailure = "";
  state.calibrationStartedAt = nowMs();
  state.calibrationSamples = [];
  state.preStartSamples = [];
  state.bikeProfile = null;
  state.filteredAcceleration = [0, 0, 0];
  state.vibrationEnergy = 0;
  state.vibrationG = 0;
  state.startCandidateAt = 0;
  state.strongStartCandidateAt = 0;
  state.startCandidateLastAt = 0;
  state.startCandidateVelocityMs = 0;
  state.deviceOffsetX = 0;
  state.deviceOffsetY = 0;
  state.deviceOffsetZ = 0;
  state.yawOffset = 0;
  state.gyroOffsetVector = [0, 0, 0];
  resetForwardAxis();
  setMode("calibrating", text.calibrating);
  render();
}

function finishCalibration() {
  const quality = evaluateCalibration(state.calibrationSamples, nowMs() - state.calibrationStartedAt);
  if (!quality.passed) {
    state.calibrationActive = false;
    state.calibrationCompleted = false;
    state.calibrationState = "failed";
    state.calibrationQuality = quality;
    state.calibrationFailure = quality.reason;
    state.calibrationSamples = [];
    resetLiveSensorValues();
    setMode("sensor-on", text.sensorOn);
    addEvent("CAL", `補正失敗: ${quality.reason}`);
    render();
    return;
  }
  const count = state.calibrationSamples.length;
  state.deviceOffsetX = state.calibrationSamples.reduce((sum, sample) => sum + sample.x, 0) / count;
  state.deviceOffsetY = state.calibrationSamples.reduce((sum, sample) => sum + sample.y, 0) / count;
  state.deviceOffsetZ = state.calibrationSamples.reduce((sum, sample) => sum + sample.z, 0) / count;
  state.gyroOffsetVector = ["gyroX", "gyroY", "gyroZ"].map((key) =>
    state.calibrationSamples.reduce((sum, sample) => sum + sample[key], 0) / count
  );
  state.gravityVector = normalizeVector([
    state.calibrationSamples.reduce((sum, sample) => sum + sample.gravityX, 0) / count,
    state.calibrationSamples.reduce((sum, sample) => sum + sample.gravityY, 0) / count,
    state.calibrationSamples.reduce((sum, sample) => sum + sample.gravityZ, 0) / count,
  ], [0, 0, 1]);
  state.bikeProfile = quality.bikeProfile;
  state.yawOffset = dotVector(state.gyroOffsetVector, state.gravityVector);
  state.calibrationActive = false;
  state.calibrationCompleted = true;
  state.calibrationState = "complete";
  state.calibrationQuality = quality;
  state.calibrationFailure = "";
  state.calibrationSamples = [];
  resetLiveSensorValues(false);
  if (state.autoMeasurementEnabled && state.measurementMode === "auto" && !state.currentRunId) {
    setMode("armed", text.armed);
  } else {
    setMode("sensor-on", text.sensorOn);
  }
  addEvent("CAL", text.calibrated);
}

function evaluateCalibration(samples, durationMs) {
  const count = samples.length;
  const durationSec = Math.max(0.001, durationMs / 1000);
  const sampleRateHz = count / durationSec;
  if (count < 60 || sampleRateHz < CALIBRATION_MIN_HZ) {
    return { passed: false, reason: "センサー周期不足", sampleRateHz, vibrationRmsG: 0, gravityDriftDeg: 0 };
  }

  const mean = (items, key) => items.reduce((sum, sample) => sum + sample[key], 0) / items.length;
  const linearSamples = samples.map((sample) => ({
    x: sample.x - (sample.linearAvailable ? 0 : sample.gravityX),
    y: sample.y - (sample.linearAvailable ? 0 : sample.gravityY),
    z: sample.z - (sample.linearAvailable ? 0 : sample.gravityZ),
  }));
  const linearMean = [mean(linearSamples, "x"), mean(linearSamples, "y"), mean(linearSamples, "z")];
  const meanLinearG = vectorLength(linearMean);
  const vibrationRmsG = Math.sqrt(linearSamples.reduce((sum, sample) =>
    sum + (sample.x - linearMean[0]) ** 2 + (sample.y - linearMean[1]) ** 2 + (sample.z - linearMean[2]) ** 2
  , 0) / count);
  const gravityMean = (items) => [mean(items, "gravityX"), mean(items, "gravityY"), mean(items, "gravityZ")];
  const gravity = gravityMean(samples);
  const gravityMagnitudeG = vectorLength(gravity);
  const midpoint = Math.floor(count / 2);
  const gravityFirst = normalizeVector(gravityMean(samples.slice(0, midpoint)), [0, 0, 1]);
  const gravityLast = normalizeVector(gravityMean(samples.slice(midpoint)), [0, 0, 1]);
  const gravityDot = Math.max(-1, Math.min(1, dotVector(gravityFirst, gravityLast)));
  const gravityDriftDeg = Math.acos(gravityDot) * RAD_TO_DEG;
  const gravityUnit = normalizeVector(gravity, [0, 0, 1]);
  const sampleDt = 1 / Math.max(CALIBRATION_MIN_HZ, sampleRateHz);
  const filterAlpha = 1 - Math.exp(-sampleDt / MOTION_LOW_PASS_TAU_SEC);
  let filtered = [0, 0, 0];
  const filteredHorizontalG = linearSamples.map((sample) => {
    const centered = [sample.x - linearMean[0], sample.y - linearMean[1], sample.z - linearMean[2]];
    filtered = filtered.map((value, index) => value + filterAlpha * (centered[index] - value));
    const vertical = dotVector(filtered, gravityUnit);
    return vectorLength(filtered.map((value, index) => value - vertical * gravityUnit[index]));
  });
  const gyroMean = ["gyroX", "gyroY", "gyroZ"].map((key) => mean(samples, key));
  const yawNoise = samples.map((sample) => Math.abs(dotVector([
    sample.gyroX - gyroMean[0],
    sample.gyroY - gyroMean[1],
    sample.gyroZ - gyroMean[2],
  ], gravityUnit)));
  const filteredNoiseP95G = percentile(filteredHorizontalG, 0.95);
  const yawNoiseP95Dps = percentile(yawNoise, 0.95);
  const bikeProfile = {
    filteredNoiseP95G,
    yawNoiseP95Dps,
    startGNormal: clamp(Math.max(LEARNED_START_G_MIN, filteredNoiseP95G * 4), LEARNED_START_G_MIN, LEARNED_START_G_MAX),
    stationaryG: clamp(0.04 + filteredNoiseP95G * 1.5, 0.04, 0.09),
    stationaryYawRate: clamp(4 + yawNoiseP95Dps * 1.5, 4, 12),
    deadbandG: clamp(filteredNoiseP95G * 1.25, 0.008, 0.05),
  };

  let reason = "";
  if (meanLinearG > CALIBRATION_MAX_MEAN_G) reason = "発進せず静止してください";
  else if (gravityMagnitudeG < 0.75 || gravityMagnitudeG > 1.25) reason = "重力値を取得できません";
  else if (gravityDriftDeg > CALIBRATION_MAX_GRAVITY_DRIFT_DEG) reason = "補正中に車体が動きました";
  else if (vibrationRmsG > CALIBRATION_MAX_VIBRATION_G) reason = "振動が大きすぎます";

  return {
    passed: !reason,
    reason,
    sampleRateHz,
    meanLinearG,
    gravityMagnitudeG,
    gravityDriftDeg,
    vibrationRmsG,
    bikeProfile,
  };
}

function applyZeroSpeedUpdate(t) {
  const profile = currentProfile();
  const lowDynamics = Math.abs(state.longG) < profile.stationaryG
    && Math.abs(state.latG) < profile.stationaryG
    && Math.abs(state.yawRate) < profile.stationaryYawRate;
  const gpsFresh = hasFreshGps();
  const gpsStopped = gpsFresh && gpsStopEvidence(t).confirmed;
  const recentlyBraked = state.lastBrakeAt > 0 && t - state.lastBrakeAt < RECENT_BRAKE_MS;
  const imuStopped = !gpsFresh && state.speedMs < IMU_STOP_SPEED_MS && recentlyBraked;
  const stationary = lowDynamics && (state.mode !== "running" || gpsStopped || imuStopped);
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
  const gentleStartG = gentleStartThreshold(profile);
  if (state.autoMeasurementEnabled && state.mode === "armed") {
    const lowDynamics = Math.abs(state.longG) < profile.stationaryG
      && Math.abs(state.latG) < profile.stationaryG
      && Math.abs(state.yawRate) < profile.stationaryYawRate;
    const gpsFresh = hasFreshGps();
    const gpsStopped = gpsFresh && state.gpsSpeedMs < GPS_STOP_SPEED_MS;
    if (!state.autoStartReady) {
      if (lowDynamics && gpsStopped) {
        state.autoReadyCandidateAt ||= t;
        if (t - state.autoReadyCandidateAt >= AUTO_READY_HOLD_MS) {
          state.autoStartReady = true;
          setMode("armed", text.armed);
          addEvent("READY", "\u9759\u6b62\u78ba\u8a8d\u5b8c\u4e86");
        }
      } else {
        state.autoReadyCandidateAt = 0;
        setMode("armed", !gpsFresh ? text.gpsStandstill : text.autoPreparing);
      }
      state.startCandidateAt = 0;
      state.strongStartCandidateAt = 0;
      state.startCandidateLastAt = 0;
      state.startCandidateVelocityMs = 0;
      return;
    }
    if (!gpsFresh || (state.gpsSpeedMs >= GPS_STOP_SPEED_MS && !state.startCandidateAt)) {
      state.autoStartReady = false;
      state.autoReadyCandidateAt = 0;
      state.startCandidateAt = 0;
      state.strongStartCandidateAt = 0;
      state.startCandidateLastAt = 0;
      state.startCandidateVelocityMs = 0;
      resetForwardAxis();
      setMode("armed", !gpsFresh ? text.gpsStandstill : text.gpsMoving);
      return;
    }
    if (state.longG > gentleStartG) {
      if (!state.startCandidateAt) {
        state.startCandidateAt = t;
        state.startCandidateLastAt = t;
        state.startCandidateVelocityMs = 0;
      } else {
        const candidateDt = Math.min(0.12, Math.max(0, (t - state.startCandidateLastAt) / 1000));
        state.startCandidateVelocityMs += Math.max(0, state.longG * G) * candidateDt;
        state.startCandidateLastAt = t;
      }
      if (state.longG > profile.startG) {
        state.strongStartCandidateAt ||= t;
      } else {
        state.strongStartCandidateAt = 0;
      }
      const strongConfirmed = state.strongStartCandidateAt
        && t - state.strongStartCandidateAt >= START_CONFIRM_MS;
      const gentleConfirmed = t - state.startCandidateAt >= GENTLE_START_CONFIRM_MS;
      if (strongConfirmed || gentleConfirmed) {
        const detail = gentleConfirmed && !strongConfirmed
          ? `${text.startDetail}（緩発進）`
          : text.startDetail;
        startRun("auto", detail, state.startCandidateAt, state.startCandidateVelocityMs);
      }
    } else {
      state.startCandidateAt = 0;
      state.strongStartCandidateAt = 0;
      state.startCandidateLastAt = 0;
      state.startCandidateVelocityMs = 0;
    }
  }

  if (state.mode !== "running") return;

  if (state.longG > profile.accelG) addEdgeEvent("ACCEL", text.accel);
  if (state.longG < profile.brakeG) addEdgeEvent("BRAKE", text.brake);
  if (Math.abs(state.yawRate) > profile.turnRate) addEdgeEvent("TURN", state.yawRate > 0 ? text.rightTurn : text.leftTurn);
  if (Math.abs(state.bankDeg) > profile.bankAngle) addEdgeEvent("BANK", state.bankDeg > 0 ? text.rightBank : text.leftBank);

  const lowDynamics = Math.abs(state.longG) < profile.stationaryG
    && Math.abs(state.latG) < profile.stationaryG
    && Math.abs(state.yawRate) < profile.stationaryYawRate;
  const gpsFresh = hasFreshGps();
  const gpsStop = gpsStopEvidence(t);
  const gpsStopped = gpsFresh && gpsStop.confirmed;
  state.gpsStopEvidence = gpsStopped;
  state.gpsStopObservationCount = gpsStop.count;
  state.gpsStopDwellMs = gpsStop.dwellMs;
  state.gpsStopDisplacementM = gpsStop.displacementM;
  const recentlyBraked = state.lastBrakeAt > 0 && t - state.lastBrakeAt < RECENT_BRAKE_MS;
  const imuStopped = !gpsFresh && state.speedMs < IMU_STOP_SPEED_MS && recentlyBraked;
  const nearStopped = lowDynamics && (gpsStopped || imuStopped);
  const canAutoStop = state.autoMeasurementEnabled
    && state.measurementMode === "auto"
    && nowMs() - state.startedAt > 1500;
  if (nearStopped && canAutoStop) {
    state.lastStopCandidateAt ||= t;
    if (!state.autoStopCandidate) {
      state.autoStopCandidate = true;
      setMode("running", text.stopCandidate);
    }
    if (t - state.lastStopCandidateAt > STOP_HOLD_MS) {
      stopRun(text.stopHold, state.lastStopCandidateAt);
    }
  } else {
    state.lastStopCandidateAt = 0;
    if (state.autoStopCandidate) {
      state.autoStopCandidate = false;
      setMode("running", text.running);
    }
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

function buildRawSample(t, sampleIntervalSec, phase) {
  const profile = currentProfile();
  return {
    timeMs: 0,
    phase,
    sensorIntervalMs: round(sampleIntervalSec * 1000, 2),
    autoStartReady: state.autoStartReady,
    startCandidateHoldMs: state.startCandidateAt ? Math.max(0, Math.round(t - state.startCandidateAt)) : 0,
    startThresholdG: round(profile.startG, 4),
    stationaryThresholdG: round(profile.stationaryG, 4),
    gpsFresh: hasFreshGps(),
    forwardAxisLocked: Boolean(state.forwardAxis),
    longG: round(state.longG, 4),
    latG: round(state.latG, 4),
    speedKmh: round(state.speedMs * 3.6, 3),
    gpsSpeedKmh: Number.isFinite(state.gpsSpeedMs) ? round(state.gpsSpeedMs * 3.6, 3) : null,
    gpsAccuracyM: Number.isFinite(state.gpsAccuracyM) ? round(state.gpsAccuracyM, 1) : null,
    gpsSource: state.gpsSource,
    latitude: phase === "prestart" ? null : (Number.isFinite(state.gpsLatitude) ? round(state.gpsLatitude, 7) : null),
    longitude: phase === "prestart" ? null : (Number.isFinite(state.gpsLongitude) ? round(state.gpsLongitude, 7) : null),
    gpsHeadingDeg: Number.isFinite(state.gpsHeadingDeg) ? round(state.gpsHeadingDeg, 1) : null,
    gpsTimestampMs: Number.isFinite(state.gpsTimestampMs) ? Math.round(state.gpsTimestampMs) : null,
    gpsAgeMs: Number.isFinite(state.gpsAgeMs) ? Math.round(state.gpsAgeMs) : null,
    gpsObservationSequence: state.gpsObservationSequence,
    gpsInnovationClipped: state.gpsInnovationClipped,
    imuInnovationClipped: state.imuInnovationClipped,
    gravityErrorG: round(state.gravityErrorG, 5),
    turnConsistencyDeg: Number.isFinite(state.turnConsistencyDeg)
      ? round(state.turnConsistencyDeg, 2)
      : null,
    bankDeg: round(state.bankDeg, 2),
    gravityBankDeg: round(state.gravityBankDeg, 2),
    yawRate: round(state.yawRate, 2),
    gyroX: round(state.rawGyroVector[0], 3),
    gyroY: round(state.rawGyroVector[1], 3),
    gyroZ: round(state.rawGyroVector[2], 3),
    rollRate: round(state.rollRate, 2),
    vibrationG: round(state.vibrationG, 4),
    longGVariance: round(state.longGVariance, 6),
    latGVariance: round(state.latGVariance, 6),
    kalmanVariance: round(state.kalmanVariance, 6),
    longBias: round(state.longBias, 5),
    latBias: round(state.latBias, 5),
    yawBias: round(state.yawBias, 3),
    confidence: state.confidence,
    autoStopCandidate: state.autoStopCandidate,
    gpsStopEvidence: state.gpsStopEvidence,
    gpsStopObservationCount: state.gpsStopObservationCount,
    gpsStopDwellMs: Math.round(state.gpsStopDwellMs),
    gpsStopDisplacementM: Number.isFinite(state.gpsStopDisplacementM)
      ? round(state.gpsStopDisplacementM, 2)
      : null,
  };
}

function storePreStartSample(t, sampleIntervalSec) {
  state.preStartSamples.push({
    t,
    sample: buildRawSample(t, sampleIntervalSec, "prestart"),
  });
  const oldest = t - PRESTART_RETENTION_MS;
  while (state.preStartSamples.length
    && (state.preStartSamples[0].t < oldest || state.preStartSamples.length > PRESTART_SAMPLE_LIMIT)) {
    state.preStartSamples.shift();
  }
}

function storeRawSample(t, sampleIntervalSec) {
  if (!state.currentRunId || state.stoppedAt) return;
  state.rawSamples.push({
    ...buildRawSample(t, sampleIntervalSec, "running"),
    timeMs: Math.round(t - state.startedAt),
  });
  if (state.rawSamples.length > RAW_SAMPLE_LIMIT) state.rawSamples.shift();
  if (t - state.lastCheckpointAt >= CHECKPOINT_INTERVAL_MS) {
    state.lastCheckpointAt = t;
    checkpointCurrentRun();
  }
}

function postStopRun(capture, status) {
  return buildRun({
    ...capture.run,
    diagnostics: {
      ...capture.run.diagnostics,
      postStopBufferMs: POST_STOP_CAPTURE_MS,
      postStopCaptureStatus: status,
      postStopSampleCount: capture.postStopSampleCount,
    },
  });
}

function finalizePostStopCaptures(t = nowMs(), force = false) {
  const completed = [];
  state.postStopCaptures = state.postStopCaptures.filter((capture) => {
    if (!force && t < capture.captureUntilAt) return true;
    completed.push(capture);
    return false;
  });
  return Promise.all(completed.map((capture) =>
    queueRunSave(postStopRun(capture, force ? "interrupted" : "complete"))))
    .then(() => completed.length ? loadRuns() : undefined)
    .catch(() => {
      state.storageAvailable = false;
      setStorageStatus(text.storageUnavailable);
      render();
    });
}

function capturePostStopSamples(t, sampleIntervalSec) {
  if (!state.postStopCaptures.length) return;
  for (const capture of state.postStopCaptures) {
    if (t > capture.captureUntilAt || capture.postStopSampleCount >= POST_STOP_SAMPLE_LIMIT) continue;
    capture.run.samples.push({
      ...buildRawSample(t, sampleIntervalSec, "poststop"),
      timeMs: Math.round(t - capture.runStartedAt),
    });
    capture.postStopSampleCount += 1;
  }
  if (state.postStopCaptures.some((capture) => t >= capture.captureUntilAt)) {
    finalizePostStopCaptures(t);
  }
}

function deriveGravityVector(linear, accelerationIncludingGravity, linearAvailable) {
  return ["x", "y", "z"].map((axis) => {
    const combined = Number.isFinite(accelerationIncludingGravity?.[axis])
      ? accelerationIncludingGravity[axis]
      : 0;
    const motion = linearAvailable && Number.isFinite(linear?.[axis]) ? linear[axis] : 0;
    return combined - motion;
  });
}

function onDeviceMotion(event) {
  const linear = event.acceleration;
  const accelerationIncludingGravity = event.accelerationIncludingGravity || {};
  const linearAvailable = Boolean(linear && [linear.x, linear.y, linear.z].some(Number.isFinite));
  const acc = linearAvailable ? linear : accelerationIncludingGravity;
  const gravity = deriveGravityVector(linear, accelerationIncludingGravity, linearAvailable);
  const rotation = event.rotationRate || {};
  const rawX = (acc.x || 0) / G;
  const rawY = (acc.y || 0) / G;
  const rawZ = (acc.z || 0) / G;
  handleMotionSample({
    time: nowMs(),
    rawX,
    rawY,
    rawZ,
    linearAvailable,
    gravityX: gravity[0] / G,
    gravityY: gravity[1] / G,
    gravityZ: gravity[2] / G,
    longG: rawY,
    latG: rawX,
    gyroVector: [rotation.beta || 0, rotation.gamma || 0, rotation.alpha || 0],
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
    startGps();
    requestPersistentStorage();
    if (!state.storageAvailable) recoverStorage();
    setMode("sensor-on", text.sensorOn);
    addEvent("SENSOR", text.sensorGranted);
    render();
  } catch {
    setMode("idle", text.needPermission);
    addEvent("ERROR", text.sensorError);
  }
}

async function requestPersistentStorage() {
  if (!navigator.storage?.persist) {
    state.storagePersisted = null;
    render();
    return;
  }
  try {
    state.storagePersisted = await navigator.storage.persist();
  } catch {
    state.storagePersisted = false;
  }
  render();
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
  } else if (state.mode === "armed") {
    saveArmedDiagnostic(text.sensorDisabled);
  }
  finalizePostStopCaptures(nowMs(), true);
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
  state.calibrationState = "not-run";
  state.calibrationQuality = null;
  state.calibrationFailure = "";
  state.calibrationSamples = [];
  state.bikeProfile = null;
  state.forwardAxis = "";
  state.forwardSign = 1;
  state.forwardVector = null;
  state.lateralVector = null;
  stopGps();
  state.samples = [];
  state.rawSamples = [];
  state.preStartSamples = [];
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
  if (!state.calibrationCompleted) {
    addEvent("CAL", "先にCalibrationを完了してください");
    return;
  }
  if (!state.storageAvailable) {
    addEvent("STORAGE", "端末保存を再確認しています");
    recoverStorage().then((available) => {
      if (available) enableAutoMeasurement();
      else addEvent("ERROR", "端末保存を利用できません。保存を再確認してください");
    });
    return;
  }
  if (state.mode === "armed" && state.autoMeasurementEnabled) return;
  state.autoMeasurementEnabled = true;
  armTimer();
  addEvent("AUTO", text.autoOn);
  render();
}

function disableAutoMeasurement() {
  if (state.mode === "armed") saveArmedDiagnostic(text.autoOff);
  state.autoMeasurementEnabled = false;
  if (state.mode === "armed") {
    state.measurementMode = "none";
    resetLiveSensorValues(true);
    state.samples = [];
    state.rawSamples = [];
    state.preStartSamples = [];
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
  if (!state.calibrationCompleted) {
    addEvent("CAL", state.calibrationActive ? "静止補正の完了を待ってください" : "先にCalibrationを完了してください");
    return;
  }
  if (!state.storageAvailable) {
    addEvent("STORAGE", "端末保存を再確認しています");
    recoverStorage().then((available) => {
      if (available) startManualMeasurement();
      else addEvent("ERROR", "端末保存を利用できません。保存を再確認してください");
    });
    return;
  }
  state.autoMeasurementEnabled = false;
  const initialSpeedMs = hasFreshGps() ? state.gpsSpeedMs : 0;
  const detail = initialSpeedMs > 0.5
    ? `${text.manualStart} / GPS ${(initialSpeedMs * 3.6).toFixed(1)} km/h`
    : text.manualStart;
  startRun("manual", detail, nowMs(), initialSpeedMs);
}

function stopManualMeasurement() {
  stopRun(text.manualStop);
}

function resetLiveSensorValues(preserveMotionFilter = false) {
  state.lastSampleAt = 0;
  state.lastStopCandidateAt = 0;
  state.lastBrakeAt = 0;
  state.startCandidateAt = 0;
  state.strongStartCandidateAt = 0;
  state.startCandidateLastAt = 0;
  state.startCandidateVelocityMs = 0;
  state.autoReadyCandidateAt = 0;
  state.autoStartReady = false;
  state.autoStopCandidate = false;
  state.gpsResyncPending = false;
  state.gpsObservations = [];
  state.gpsStopEvidence = false;
  state.gpsStopObservationCount = 0;
  state.gpsStopDwellMs = 0;
  state.gpsStopDisplacementM = null;
  state.gpsStopLatch = null;
  state.lastSensorGapSec = 0;
  state.zeroSpeedCandidateAt = 0;
  state.speedMs = 0;
  state.longG = 0;
  state.latG = 0;
  state.yawRate = 0;
  state.rawGyroVector = [0, 0, 0];
  state.rollRate = 0;
  state.bankDeg = 0;
  state.gravityBankDeg = 0;
  state.observedBankDeg = 0;
  resetAxisCandidate();
  state.longBias = 0;
  state.latBias = 0;
  state.yawBias = 0;
  state.confidence = 0;
  state.longGVariance = 0;
  state.latGVariance = 0;
  state.kalmanVariance = 0;
  state.gpsInnovationClipped = false;
  state.imuInnovationClipped = false;
  state.gravityErrorG = 0;
  state.turnConsistencyDeg = null;
  state.varianceSamples = [];
  if (!preserveMotionFilter) {
    state.filteredAcceleration = [0, 0, 0];
    state.vibrationEnergy = 0;
    state.vibrationG = 0;
  }
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
  state.gpsReceivedAt = 0;
  state.gpsTimestampMs = null;
  state.gpsAgeMs = null;
  state.gpsFilterTimestampMs = null;
  state.gpsObservationSequence = 0;
  state.gpsObservations = [];
  state.gpsStopEvidence = false;
  state.gpsStopObservationCount = 0;
  state.gpsStopDwellMs = 0;
  state.gpsStopDisplacementM = null;
  state.gpsStopLatch = null;
  state.gpsInnovationClipped = false;
}

function hasFreshGps() {
  return Number.isFinite(state.gpsSpeedMs)
    && state.gpsReceivedAt > 0
    && nowMs() - state.gpsReceivedAt <= GPS_FRESH_MS
    && (state.gpsAgeMs === null || state.gpsAgeMs <= GPS_FRESH_MS);
}

function gpsStopEvidence(t = nowMs()) {
  const empty = { confirmed: false, onsetAt: 0, count: 0, dwellMs: 0, displacementM: null };
  if (!hasFreshGps() || state.gpsSpeedMs >= GPS_STOP_SPEED_MS) {
    state.gpsStopLatch = null;
    return empty;
  }

  const recent = state.gpsObservations.filter((observation) =>
    t - observation.receivedAt <= GPS_STOP_HISTORY_MS);
  const lowSpeed = [];
  for (let index = recent.length - 1; index >= 0; index -= 1) {
    if (recent[index].speedMs >= GPS_STOP_SPEED_MS) break;
    lowSpeed.unshift(recent[index]);
  }
  if (lowSpeed.length < 2) return { ...empty, count: lowSpeed.length };

  if (state.gpsStopLatch) {
    const displacementM = haversineMeters(
      state.gpsStopLatch.latitude,
      state.gpsStopLatch.longitude,
      state.gpsLatitude,
      state.gpsLongitude,
    );
    if (displacementM <= state.gpsStopLatch.maxDisplacementM) {
      return {
        confirmed: true,
        onsetAt: state.gpsStopLatch.onsetAt,
        count: lowSpeed.length,
        dwellMs: Math.max(0, t - state.gpsStopLatch.onsetAt),
        displacementM,
      };
    }
    state.gpsStopLatch = null;
  }

  const first = lowSpeed[0];
  const last = lowSpeed.at(-1);
  const dwellMs = Math.max(0, last.receivedAt - first.receivedAt);
  const displacementM = haversineMeters(first.latitude, first.longitude, last.latitude, last.longitude);
  const continuousObservations = lowSpeed.every((observation, index) => index === 0
    || observation.receivedAt - lowSpeed[index - 1].receivedAt <= GPS_STOP_MAX_OBSERVATION_GAP_MS);
  const strictStop = dwellMs >= GPS_STRICT_STOP_HOLD_MS
    && continuousObservations
    && lowSpeed.every((observation) => observation.speedMs < GPS_STRICT_STOP_SPEED_MS)
    && displacementM <= GPS_STRICT_STOP_MAX_DISPLACEMENT_M;
  const meanSpeedMs = lowSpeed.reduce((sum, observation) => sum + observation.speedMs, 0)
    / lowSpeed.length;
  const positionDwell = dwellMs >= GPS_DWELL_HOLD_MS
    && continuousObservations
    && meanSpeedMs <= GPS_DWELL_MEAN_SPEED_MS
    && displacementM <= GPS_DWELL_MAX_DISPLACEMENT_M;
  if (strictStop || positionDwell) {
    state.gpsStopLatch = {
      onsetAt: first.receivedAt,
      latitude: first.latitude,
      longitude: first.longitude,
      maxDisplacementM: strictStop
        ? GPS_STRICT_STOP_MAX_DISPLACEMENT_M
        : GPS_DWELL_MAX_DISPLACEMENT_M,
    };
  }
  return {
    confirmed: strictStop || positionDwell,
    onsetAt: first.receivedAt,
    count: lowSpeed.length,
    dwellMs,
    displacementM,
  };
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
  state.gpsReceivedAt = nowMs();
  state.gpsTimestampMs = Number.isFinite(timestamp) ? timestamp : null;
  state.gpsAgeMs = Number.isFinite(timestamp) && timestamp > 1_000_000_000_000
    ? Math.max(0, Date.now() - timestamp)
    : 0;
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
  if (!Number.isFinite(state.gpsObservations.at(-1)?.timestamp)
    || timestamp > state.gpsObservations.at(-1).timestamp) {
    state.gpsObservations.push({
      receivedAt: state.gpsReceivedAt,
      timestamp,
      speedMs,
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy,
    });
    state.gpsObservationSequence += 1;
  }
  state.gpsObservations = state.gpsObservations.filter((observation) =>
    state.gpsReceivedAt - observation.receivedAt <= GPS_STOP_HISTORY_MS);
  if (state.mode !== "running") {
    render();
    return;
  }
  const filterTimestamp = Number.isFinite(timestamp) ? timestamp : state.gpsReceivedAt;
  if (Number.isFinite(state.gpsFilterTimestampMs) && filterTimestamp <= state.gpsFilterTimestampMs) {
    render();
    return;
  }
  state.gpsFilterTimestampMs = filterTimestamp;
  if (state.gpsResyncPending && resyncSpeedFromGps("欠測後GPS再同期")) {
    render();
    return;
  }
  const estimate = motionModel.updateGpsSpeed(speedMs, accuracy, derived);
  state.speedMs = estimate.speedMs;
  state.kalmanVariance = estimate.covariance;
  state.gpsInnovationClipped = estimate.gpsInnovationClipped;
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
  elements.gpsSpeed.textContent = state.mode === "running" && Number.isFinite(state.gpsSpeedMs)
    ? `${(state.gpsSpeedMs * 3.6).toFixed(1)} km/h`
    : "-- km/h";
  elements.gpsStatus.textContent = Number.isFinite(state.gpsAccuracyM)
    ? `精度 ${state.gpsAccuracyM.toFixed(0)} m`
    : text.gpsUnavailable;
  if (state.calibrationActive) {
    const remaining = Math.max(0, CALIBRATION_MS - (nowMs() - state.calibrationStartedAt));
    elements.calibrationStatus.textContent = `${(remaining / 1000).toFixed(1)} 秒`;
    elements.calibrationDetail.textContent = "アイドリングで車体を静止";
    elements.calibrationButton.textContent = "Calibrating";
    elements.calibrationButton.classList.add("primary");
  } else if (state.calibrationState === "complete") {
    elements.calibrationStatus.textContent = "車体学習済";
    elements.calibrationDetail.textContent = `発進 ${currentProfile().startG.toFixed(2)} g / 振動 ${state.calibrationQuality.vibrationRmsG.toFixed(3)} g`;
    elements.calibrationButton.textContent = "Recalibrate";
    elements.calibrationButton.classList.remove("primary");
  } else if (state.calibrationState === "failed") {
    elements.calibrationStatus.textContent = "失敗";
    elements.calibrationDetail.textContent = state.calibrationFailure;
    elements.calibrationButton.textContent = "Retry Calibration";
    elements.calibrationButton.classList.remove("primary");
  } else {
    elements.calibrationStatus.textContent = "未実行";
    elements.calibrationDetail.textContent = "Calibrationを押す";
    elements.calibrationButton.textContent = "Calibration";
    elements.calibrationButton.classList.remove("primary");
  }
  elements.autoOnButton.textContent = "自動計測を待機";
  elements.autoOffButton.textContent = "待機解除";
  elements.manualOnButton.textContent = "手動開始";
  elements.manualOffButton.textContent = "計測停止";
  elements.calibrationButton.disabled = !state.sensorEnabled || state.mode === "running";
  elements.autoOnButton.disabled = state.mode === "running" || state.mode === "armed";
  elements.autoOffButton.disabled = state.mode !== "armed";
  elements.manualOnButton.disabled = state.mode === "running";
  elements.manualOffButton.disabled = state.mode !== "running";
  elements.clearButton.disabled = state.mode === "running";
  elements.storageRetryButton.disabled = state.storageCheckPending;
  elements.storageRetryButton.hidden = state.storageAvailable;
  elements.importJsonButton.disabled = state.mode === "running";
  renderPreflight();
  drawTrace();
}

function preflightSnapshot() {
  return {
    appVersion: APP_VERSION,
    sensorEnabled: state.sensorEnabled,
    calibrationCompleted: state.calibrationCompleted,
    gpsFresh: hasFreshGps(),
    gpsAccuracyM: Number.isFinite(state.gpsAccuracyM) ? round(state.gpsAccuracyM, 1) : null,
    gpsAgeMs: Number.isFinite(state.gpsAgeMs) ? Math.round(state.gpsAgeMs) : null,
    storageAvailable: state.storageAvailable,
    storagePersisted: state.storagePersisted,
    autoStartReady: state.autoStartReady,
  };
}

function setReadiness(element, status, label) {
  element.className = `readiness-item ${status}`;
  element.textContent = label;
}

function renderPreflight() {
  const snapshot = preflightSnapshot();
  setReadiness(elements.readyVersion, "ready", `アプリ: ${APP_VERSION}`);
  setReadiness(elements.readySensor, snapshot.sensorEnabled ? "ready" : "waiting",
    `センサー: ${snapshot.sensorEnabled ? "ON" : "OFF"}`);
  setReadiness(elements.readyCalibration, snapshot.calibrationCompleted ? "ready" : "waiting",
    `キャリブレーション: ${snapshot.calibrationCompleted ? "完了" : "未完了"}`);
  const gpsLabel = snapshot.gpsFresh
    ? `GPS: 有効 / 精度 ${snapshot.gpsAccuracyM?.toFixed(0) ?? "-"} m`
    : `GPS: ${Number.isFinite(snapshot.gpsAgeMs) && snapshot.gpsAgeMs > GPS_FRESH_MS ? "時刻が古い" : "待機中"}`;
  setReadiness(elements.readyGps, snapshot.gpsFresh ? "ready" : "waiting", gpsLabel);
  const storageLabel = !snapshot.storageAvailable
    ? "端末保存: 利用不可"
    : (snapshot.storagePersisted ? "端末保存: 永続化" : "端末保存: 利用可");
  setReadiness(elements.readyStorage, snapshot.storageAvailable ? "ready" : "error", storageLabel);
  const timingReady = state.mode === "running" || snapshot.autoStartReady;
  const timingLabel = state.mode === "running"
    ? "自動計測: 計測中"
    : (state.mode === "armed"
      ? `自動計測: ${snapshot.autoStartReady ? "発進待ち完了" : "静止GPS確認中"}`
      : "自動計測: 未待機");
  setReadiness(elements.readyTiming, timingReady ? "ready" : "waiting", timingLabel);

  const missing = [];
  if (!snapshot.sensorEnabled) missing.push("センサー");
  if (!snapshot.calibrationCompleted) missing.push("補正");
  if (!snapshot.gpsFresh) missing.push("GPS");
  if (!snapshot.storageAvailable) missing.push("保存");
  elements.preflightSummary.textContent = missing.length
    ? `準備待ち: ${missing.join(" / ")}`
    : (state.mode === "armed" ? timingLabel : "走行準備完了");
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
  const base = sensitivityProfiles[state.sensitivity] || sensitivityProfiles.normal;
  if (!state.bikeProfile) {
    return { ...base, stationaryG: 0.05, stationaryYawRate: 4 };
  }
  const sensitivityScale = base.startG / sensitivityProfiles.normal.startG;
  return {
    ...base,
    startG: clamp(state.bikeProfile.startGNormal * sensitivityScale, 0.08, 0.3),
    deadbandG: Math.max(base.deadbandG, state.bikeProfile.deadbandG),
    stationaryG: state.bikeProfile.stationaryG,
    stationaryYawRate: state.bikeProfile.stationaryYawRate,
  };
}

function gentleStartThreshold(profile = currentProfile()) {
  return Math.min(profile.startG, Math.max(
    GENTLE_START_MIN_G,
    profile.stationaryG + 0.04,
    profile.startG * GENTLE_START_RATIO,
  ));
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

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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

function mul(a, b) {
  return a.map((row) =>
    b[0].map((_, colIndex) =>
      row.reduce((sum, value, innerIndex) => sum + value * b[innerIndex][colIndex], 0)
    )
  );
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
    request.onsuccess = () => {
      const db = request.result;
      db.onclose = () => {
        dbPromise = null;
      };
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
    request.onblocked = () => {
      dbPromise = null;
      reject(new Error("indexedDB open blocked"));
    };
  });
  return dbPromise;
}

function resetDbConnection() {
  const previous = dbPromise;
  dbPromise = null;
  previous?.then((db) => db.close()).catch(() => {});
}

function runDbOperation(operation, retry = true) {
  return openDb().then(operation).catch((error) => {
    if (!retry) throw error;
    resetDbConnection();
    return openDb().then(operation);
  });
}

function dbPut(storeName, value) {
  return runDbOperation((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

function dbPutMany(storeName, values) {
  if (!values.length) return Promise.resolve();
  return runDbOperation((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    values.forEach((value) => store.put(value));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("import transaction aborted"));
  }));
}

function dbGetAll(storeName) {
  return runDbOperation((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}

function dbDeleteMany(storeName, ids) {
  return runDbOperation((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    ids.forEach((id) => store.delete(id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

function buildCurrentRun() {
  const currentAt = nowMs();
  const endedAt = state.currentRunId ? (state.stoppedAt || currentAt) : currentAt;
  const durationMs = Math.round(state.currentRunId ? endedAt - state.startedAt : 0);
  const endedAtEpochMs = Date.now() - Math.max(0, currentAt - endedAt);
  return buildRun({
    id: state.currentRunId || makeRunId(),
    startedAtIso: state.currentRunId ? new Date(endedAtEpochMs - durationMs).toISOString() : new Date().toISOString(),
    endedAtIso: new Date(endedAtEpochMs).toISOString(),
    durationMs,
    calibration: {
      deviceOffsetX: round(state.deviceOffsetX, 5),
      deviceOffsetY: round(state.deviceOffsetY, 5),
      deviceOffsetZ: round(state.deviceOffsetZ, 5),
      yawOffset: round(state.yawOffset, 3),
      gyroOffsetVector: state.gyroOffsetVector.map((value) => round(value, 4)),
      forwardAxis: state.forwardAxis || "auto",
      forwardSign: state.forwardSign,
      gravityVector: state.gravityVector.map((value) => round(value, 5)),
      forwardVector: state.forwardVector?.map((value) => round(value, 5)) || null,
      lateralVector: state.lateralVector?.map((value) => round(value, 5)) || null,
      quality: state.calibrationQuality,
      bikeProfile: state.bikeProfile,
    },
    appVersion: APP_VERSION,
    schemaVersion: LOG_SCHEMA_VERSION,
    diagnostics: {
      preStartBufferMs: PRESTART_BUFFER_MS,
      sensitivity: state.sensitivity,
      startThresholdG: round(currentProfile().startG, 4),
      gentleStartThresholdG: round(gentleStartThreshold(), 4),
      stationaryThresholdG: round(currentProfile().stationaryG, 4),
      stationaryYawRateDps: round(currentProfile().stationaryYawRate, 2),
      preflight: preflightSnapshot(),
    },
    events: state.events.slice().reverse(),
    samples: state.rawSamples.slice(),
  });
}

function assessRunQuality(run) {
  const samples = run.samples || [];
  const events = run.events || [];
  const startEvent = events.find((event) => event.type === "START");
  const autoStart = String(startEvent?.detail || "").includes(text.startDetail);
  const manualStart = String(startEvent?.detail || "").includes(text.manualStart);
  const startGpsSample = samples.reduce((nearest, sample) => {
    if (!Number.isFinite(sample.timeMs) || !Number.isFinite(sample.gpsSpeedKmh)) return nearest;
    return !nearest || Math.abs(sample.timeMs) < Math.abs(nearest.timeMs) ? sample : nearest;
  }, null);
  const measurementSamples = samples.filter((sample) =>
    sample.phase === "running" || (!sample.phase && Number(sample.timeMs) >= 0));
  const intervals = measurementSamples
    .map((sample) => sample.sensorIntervalMs)
    .filter((value) => Number.isFinite(value) && value > 0 && value < 1000);
  const gpsSamples = measurementSamples.filter((sample) =>
    sample.gpsFresh === true || (sample.gpsFresh === undefined && Number.isFinite(sample.gpsSpeedKmh)));
  const gpsAccuracy = measurementSamples
    .map((sample) => sample.gpsAccuracyM)
    .filter((value) => Number.isFinite(value) && value >= 0);
  const gpsObservationKeys = new Set(measurementSamples.map((sample) => {
    if (Number.isFinite(sample.gpsObservationSequence) && sample.gpsObservationSequence > 0) {
      return `s:${sample.gpsObservationSequence}`;
    }
    return Number.isFinite(sample.gpsTimestampMs) ? `t:${sample.gpsTimestampMs}` : null;
  }).filter(Boolean));
  const ratio = (count) => measurementSamples.length ? count / measurementSamples.length : 0;
  const metrics = {
    sampleCount: measurementSamples.length,
    observedSampleRateHz: intervals.length ? round(1000 / percentile(intervals, 0.5), 1) : null,
    sensorIntervalP95Ms: intervals.length ? round(percentile(intervals, 0.95), 1) : null,
    sensorGapCount: events.filter((event) => event.type === "GAP").length,
    gpsFreshRatio: round(ratio(gpsSamples.length), 3),
    gpsObservationCount: gpsObservationKeys.size,
    gpsAccuracyP95M: gpsAccuracy.length ? round(percentile(gpsAccuracy, 0.95), 1) : null,
    gpsInnovationClippedRatio: round(ratio(measurementSamples
      .filter((sample) => sample.gpsInnovationClipped).length), 3),
    imuInnovationClippedRatio: round(ratio(measurementSamples
      .filter((sample) => sample.imuInnovationClipped).length), 3),
    startGpsSpeedKmh: startGpsSample ? round(startGpsSample.gpsSpeedKmh, 3) : null,
    startDetectionMode: autoStart
      ? (String(startEvent.detail).includes("緩発進") ? "gentle" : "strong")
      : (manualStart ? "manual" : null),
  };

  if (run.diagnostics?.noStartAttempt) {
    return { status: "diagnostic", score: null, reasons: ["NO_START_DIAGNOSTIC"], metrics };
  }

  let score = 100;
  let invalid = false;
  const reasons = [];
  const penalize = (reason, points, fatal = false) => {
    if (!reasons.includes(reason)) reasons.push(reason);
    score -= points;
    invalid ||= fatal;
  };

  if (measurementSamples.length < 30) penalize("TOO_FEW_SAMPLES", 60, true);
  if (!Number.isFinite(run.durationMs) || run.durationMs < 500) penalize("RUN_TOO_SHORT", 50, true);
  if (run.calibration?.quality?.passed === false) penalize("CALIBRATION_FAILED", 60, true);
  else if (run.calibration?.quality?.passed !== true) penalize("CALIBRATION_UNKNOWN", 10);
  if (events.some((event) => event.type === "INTERRUPT")) penalize("RUN_INTERRUPTED", 30);
  if (events.some((event) => event.type === "START")
    && !events.some((event) => event.type === "STOP" || event.type === "INTERRUPT")) {
    penalize("RUN_NOT_FINALIZED", 30);
  }
  if (!Number.isFinite(metrics.observedSampleRateHz)) penalize("SAMPLE_RATE_UNKNOWN", 25);
  else if (metrics.observedSampleRateHz < 15) penalize("SAMPLE_RATE_CRITICAL", 50, true);
  else if (metrics.observedSampleRateHz < 30) penalize("SAMPLE_RATE_LOW", 20);
  if (metrics.sensorIntervalP95Ms > 100) penalize("SENSOR_INTERVAL_UNSTABLE", 30);
  else if (metrics.sensorIntervalP95Ms > 50) penalize("SENSOR_INTERVAL_SLOW", 15);
  if (metrics.sensorGapCount > 0) penalize("SENSOR_GAP", Math.min(40, 20 * metrics.sensorGapCount));
  if (metrics.gpsFreshRatio < 0.2) penalize("GPS_COVERAGE_CRITICAL", 40);
  else if (metrics.gpsFreshRatio < 0.5) penalize("GPS_COVERAGE_LOW", 20);
  if (metrics.gpsObservationCount < 3) penalize("GPS_OBSERVATIONS_LOW", 15);
  if (!Number.isFinite(metrics.gpsAccuracyP95M)) penalize("GPS_ACCURACY_UNKNOWN", 10);
  else if (metrics.gpsAccuracyP95M > 50) penalize("GPS_ACCURACY_CRITICAL", 30);
  else if (metrics.gpsAccuracyP95M > 30) penalize("GPS_ACCURACY_LOW", 15);
  if (metrics.imuInnovationClippedRatio > 0.3) penalize("IMU_OUTLIERS_HIGH", 25);
  else if (metrics.imuInnovationClippedRatio > 0.1) penalize("IMU_OUTLIERS", 10);
  if (metrics.gpsInnovationClippedRatio > 0.3) penalize("GPS_OUTLIERS_HIGH", 20);
  else if (metrics.gpsInnovationClippedRatio > 0.1) penalize("GPS_OUTLIERS", 10);
  if (autoStart && metrics.startGpsSpeedKmh > 2) penalize("AUTO_START_GPS_MOVING", 25);

  score = clamp(Math.round(score), 0, 100);
  const status = invalid || score < 50 ? "invalid" : (score < 80 ? "review" : "good");
  return { status, score, reasons, metrics };
}

function buildRun(run) {
  const samples = run.samples || [];
  const rideSamples = samples.filter((sample) => sample.phase !== "poststop");
  const events = run.events || [];
  const sampleIntervals = rideSamples
    .map((sample) => sample.sensorIntervalMs)
    .filter((value) => Number.isFinite(value) && value > 0 && value < 1000);
  const medianIntervalMs = sampleIntervals.length ? percentile(sampleIntervals, 0.5) : null;
  const maxByAbs = (key) => rideSamples.reduce((max, sample) => Math.max(max, Math.abs(sample[key] || 0)), 0);
  const normalizedRun = {
    id: run.id,
    startedAtIso: run.startedAtIso,
    endedAtIso: run.endedAtIso,
    durationMs: run.durationMs,
    appVersion: run.appVersion || "legacy",
    schemaVersion: run.schemaVersion || 1,
    calibration: run.calibration || null,
    diagnostics: {
      ...(run.diagnostics || {}),
      preStartSampleCount: samples.filter((sample) => sample.phase === "prestart").length,
      observedSampleRateHz: medianIntervalMs ? round(1000 / medianIntervalMs, 1) : null,
    },
    summary: {
      status: run.diagnostics?.noStartAttempt
        ? "no-start"
        : (events.some((event) => event.type === "INTERRUPT") ? "interrupted" : "complete"),
      maxSpeedKmh: round(rideSamples.reduce((max, sample) => Math.max(max, sample.speedKmh || 0), 0), 2),
      maxGpsSpeedKmh: round(rideSamples.reduce((max, sample) => Math.max(max, sample.gpsSpeedKmh || 0), 0), 2),
      gpsSampleCount: rideSamples.filter((sample) => Number.isFinite(sample.gpsSpeedKmh)).length,
      maxLongG: round(rideSamples.reduce((max, sample) => Math.max(max, sample.longG || 0), 0), 3),
      minLongG: round(rideSamples.reduce((min, sample) => Math.min(min, sample.longG || 0), 0), 3),
      maxLatGAbs: round(maxByAbs("latG"), 3),
      maxBankDegAbs: round(maxByAbs("bankDeg"), 1),
      maxYawRateAbs: round(maxByAbs("yawRate"), 1),
      maxVibrationG: round(rideSamples.reduce((max, sample) => Math.max(max, sample.vibrationG || 0), 0), 4),
      imuInnovationClippedCount: rideSamples.filter((sample) => sample.imuInnovationClipped).length,
      coordinatedTurnSampleCount: rideSamples.filter((sample) => Number.isFinite(sample.turnConsistencyDeg)).length,
      coordinatedTurnErrorP95Deg: round(percentile(rideSamples
        .map((sample) => sample.turnConsistencyDeg)
        .filter(Number.isFinite), 0.95), 2),
      sensorGapCount: events.filter((event) => event.type === "GAP").length,
      sampleCount: rideSamples.length,
      postStopSampleCount: samples.length - rideSamples.length,
      totalSampleCount: samples.length,
      eventCount: events.length,
    },
    events,
    samples,
  };
  const quality = assessRunQuality(normalizedRun);
  normalizedRun.quality = quality;
  normalizedRun.summary.dataQualityStatus = quality.status;
  normalizedRun.summary.dataQualityScore = quality.score;
  return normalizedRun;
}

function queueRunSave(run) {
  runSaveQueue = runSaveQueue
    .catch(() => {})
    .then(() => dbPut(RUN_STORE, run));
  return runSaveQueue;
}

function checkpointCurrentRun() {
  if (state.mode !== "running" || !state.currentRunId || !state.rawSamples.length) return Promise.resolve();
  return queueRunSave(buildCurrentRun()).catch(() => {
    state.storageAvailable = false;
    setStorageStatus(text.storageUnavailable);
    render();
  });
}

function saveCurrentRun(capturePostStop = false) {
  addEvent("SAVE", text.saved);
  let run = buildCurrentRun();
  if (!run.samples.length && !run.events.length) return;
  if (capturePostStop) {
    const capture = {
      run,
      runStartedAt: state.startedAt,
      captureUntilAt: nowMs() + POST_STOP_CAPTURE_MS,
      postStopSampleCount: 0,
    };
    state.postStopCaptures.push(capture);
    run = postStopRun(capture, "pending");
  }
  queueRunSave(run)
    .then(() => {
      return loadRuns();
    })
    .catch(() => {
      state.storageAvailable = false;
      addEvent("SAVE", text.storageUnavailable);
      setStorageStatus(text.storageUnavailable);
      render();
    });
}

function saveArmedDiagnostic(reason) {
  if (!state.preStartSamples.length) return;
  const endedAt = nowMs();
  const entries = state.preStartSamples.filter((entry) => entry.t >= endedAt - PRESTART_BUFFER_MS);
  const buffered = entries.map((entry) => ({ ...entry.sample, timeMs: Math.round(entry.t - endedAt) }));
  if (buffered.length < 30) return;
  const profile = currentProfile();
  const run = buildRun({
    id: makeRunId(),
    startedAtIso: new Date(Date.now() - (endedAt - entries[0].t)).toISOString(),
    endedAtIso: new Date().toISOString(),
    durationMs: 0,
    appVersion: APP_VERSION,
    schemaVersion: LOG_SCHEMA_VERSION,
    calibration: {
      gravityVector: state.gravityVector.map((value) => round(value, 5)),
      bikeProfile: state.bikeProfile,
    },
    diagnostics: {
      noStartAttempt: true,
      reason,
      preStartBufferMs: PRESTART_BUFFER_MS,
      sensitivity: state.sensitivity,
      startThresholdG: round(profile.startG, 4),
      gentleStartThresholdG: round(gentleStartThreshold(profile), 4),
      stationaryThresholdG: round(profile.stationaryG, 4),
      stationaryYawRateDps: round(profile.stationaryYawRate, 2),
      preflight: preflightSnapshot(),
    },
    events: [{
      timeMs: 0,
      type: "NO_START",
      detail: reason,
      longG: round(state.longG, 3),
      latG: round(state.latG, 3),
      speedKmh: 0,
      bankDeg: round(state.bankDeg, 1),
      yawRate: round(state.yawRate, 1),
      vibrationG: round(state.vibrationG, 4),
    }],
    samples: buffered,
  });
  queueRunSave(run).then(loadRuns).catch(() => {
    state.storageAvailable = false;
    setStorageStatus(text.storageUnavailable);
    render();
  });
}

function handleAppBackground(event) {
  if (event?.type !== "pagehide" && document.visibilityState && document.visibilityState !== "hidden") return;
  finalizePostStopCaptures(nowMs(), true);
  if (state.mode === "running") {
    stopRun(text.backgroundStop, nowMs(), "INTERRUPT");
    return;
  }
  if (state.mode === "armed") {
    saveArmedDiagnostic(text.backgroundArmCancelled);
    state.autoMeasurementEnabled = false;
    state.measurementMode = "none";
    state.autoStartReady = false;
    state.autoReadyCandidateAt = 0;
    state.startCandidateAt = 0;
    state.strongStartCandidateAt = 0;
    state.preStartSamples = [];
    setMode(state.sensorEnabled ? "sensor-on" : "idle", text.backgroundArmCancelled);
    addEvent("AUTO", text.backgroundArmCancelled);
    render();
  }
}

function loadRuns() {
  return dbGetAll(RUN_STORE)
    .then((runs) => {
      state.storageAvailable = true;
      state.savedRuns = runs.map(buildRun).sort((a, b) => b.startedAtIso.localeCompare(a.startedAtIso));
      const existingIds = new Set(state.savedRuns.map((run) => run.id));
      state.selectedRunIds = new Set([...state.selectedRunIds].filter((id) => existingIds.has(id)));
      setStorageStatus(`${text.storageReady} / ${state.savedRuns.length} runs`);
      refreshStorageEstimate();
      renderHistory();
      render();
    })
    .catch(() => {
      state.storageAvailable = false;
      setStorageStatus(text.storageUnavailable);
      renderHistory();
      render();
    });
}

function recoverStorage() {
  if (state.storageCheckPending) return Promise.resolve(false);
  state.storageCheckPending = true;
  resetDbConnection();
  setStorageStatus("端末保存を再確認中");
  render();
  return loadRuns()
    .then(() => state.storageAvailable)
    .finally(() => {
      state.storageCheckPending = false;
      render();
    });
}

function setStorageStatus(message) {
  const capacity = Number.isFinite(state.storageUsageBytes) && Number.isFinite(state.storageQuotaBytes)
    ? ` / ${formatBytes(state.storageUsageBytes)} / ${formatBytes(state.storageQuotaBytes)}`
    : "";
  elements.storageStatus.textContent = `${message}${capacity}`;
}

async function refreshStorageEstimate() {
  if (!navigator.storage?.estimate) return;
  try {
    const estimate = await navigator.storage.estimate();
    state.storageUsageBytes = Number.isFinite(estimate.usage) ? estimate.usage : null;
    state.storageQuotaBytes = Number.isFinite(estimate.quota) ? estimate.quota : null;
    if (state.storageAvailable) {
      setStorageStatus(`${text.storageReady} / ${state.savedRuns.length} runs`);
    }
  } catch {
    state.storageUsageBytes = null;
    state.storageQuotaBytes = null;
  }
}

function renderHistory() {
  if (!state.savedRuns.length) {
    elements.historyList.innerHTML = `<div class="history-card"><small>No saved runs yet</small></div>`;
    syncHistorySelectionControls();
    return;
  }
  elements.historyList.innerHTML = state.savedRuns
    .map((run) => {
      const date = new Date(run.startedAtIso).toLocaleString();
      const runStatus = run.summary?.status === "interrupted"
        ? "中断"
        : (run.summary?.status === "no-start" ? "未発進診断" : "完了");
      const quality = run.quality || assessRunQuality(run);
      const qualityLabel = quality.status === "good"
        ? "品質良好"
        : (quality.status === "review"
          ? "要確認"
          : (quality.status === "invalid" ? "解析不可" : "診断"));
      const qualityScore = Number.isFinite(quality.score) ? ` ${quality.score}点` : "";
      return `<article class="history-card">
        <label class="run-selector" aria-label="${escapeHtml(date)} を選択">
          <input type="checkbox" data-select-run="${escapeHtml(run.id)}"${state.selectedRunIds.has(run.id) ? " checked" : ""}>
        </label>
        <div>
          <strong>${formatTime(run.durationMs)} <span class="data-quality ${quality.status}" title="${escapeHtml(quality.reasons.join(", "))}">${qualityLabel}${qualityScore}</span></strong>
          <small>${escapeHtml(date)} / ${runStatus} / max ${run.summary.maxSpeedKmh.toFixed(1)} km/h / bank ${run.summary.maxBankDegAbs.toFixed(0)} deg / ${run.summary.sampleCount} samples</small>
        </div>
        <div class="history-actions">
          <button type="button" data-action="csv" data-run="${escapeHtml(run.id)}">CSV</button>
          <button type="button" data-action="json" data-run="${escapeHtml(run.id)}">JSON</button>
        </div>
      </article>`;
    })
    .join("");
  syncHistorySelectionControls();
}

function selectedRuns() {
  return state.savedRuns.filter((run) => state.selectedRunIds.has(run.id));
}

function syncHistorySelectionControls() {
  const selectedCount = state.selectedRunIds.size;
  const totalCount = state.savedRuns.length;
  elements.selectedRunCount.textContent = `${selectedCount}件選択`;
  elements.selectAllRuns.checked = totalCount > 0 && selectedCount === totalCount;
  elements.selectAllRuns.indeterminate = selectedCount > 0 && selectedCount < totalCount;
  elements.selectAllRuns.disabled = totalCount === 0;
  elements.exportSelectedJsonButton.disabled = selectedCount === 0;
  elements.exportSelectedCsvButton.disabled = selectedCount === 0;
  elements.deleteSelectedButton.disabled = selectedCount === 0;
  elements.exportAllButton.disabled = totalCount === 0;
}

function runToCsv(run, includeRunMetadata = false) {
  const quality = run.quality || assessRunQuality(run);
  const qualityColumns = [quality.status, quality.score, quality.reasons.join("|")];
  const metadataHeader = includeRunMetadata ? "run_id,started_at_iso," : "";
  const metadata = includeRunMetadata ? [run.id, run.startedAtIso] : [];
  const eventHeader = `${metadataHeader}section,time_ms,type,detail,long_g,lat_g,speed_kmh,gps_speed_kmh,gps_accuracy_m,gps_source,latitude,longitude,gps_heading_deg,gps_timestamp_ms,gps_age_ms,bank_deg,gravity_bank_deg,yaw_rate,gyro_x_dps,gyro_y_dps,gyro_z_dps,roll_rate_dps,vibration_g,long_g_variance,lat_g_variance,kalman_variance,long_bias,lat_bias,yaw_bias,confidence,auto_stop_candidate,app_version,schema_version,phase,sensor_interval_ms,auto_start_ready,start_candidate_hold_ms,start_threshold_g,stationary_threshold_g,gps_fresh,forward_axis_locked,gps_innovation_clipped,gravity_error_g,turn_consistency_deg,imu_innovation_clipped,gps_stop_evidence,gps_stop_observation_count,gps_stop_dwell_ms,gps_stop_displacement_m,gps_observation_sequence,data_quality_status,data_quality_score,data_quality_reasons\n`;
  const eventRows = run.events.map((event) => [
    ...metadata,
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
    "",
    "",
    "",
    fixed(event.bankDeg, 1),
    "",
    fixed(event.yawRate, 1),
    "",
    "",
    "",
    "",
    fixed(event.vibrationG, 4),
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    run.appVersion || "legacy",
    run.schemaVersion || 1,
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    ...qualityColumns,
  ].map(csvCell).join(","));
  const sampleRows = run.samples.map((sample) => [
    ...metadata,
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
    fixed(sample.gpsTimestampMs, 0),
    fixed(sample.gpsAgeMs, 0),
    fixed(sample.bankDeg, 2),
    fixed(sample.gravityBankDeg, 2),
    fixed(sample.yawRate, 2),
    fixed(sample.gyroX, 3),
    fixed(sample.gyroY, 3),
    fixed(sample.gyroZ, 3),
    fixed(sample.rollRate, 2),
    fixed(sample.vibrationG, 4),
    fixed(sample.longGVariance, 6),
    fixed(sample.latGVariance, 6),
    fixed(sample.kalmanVariance, 6),
    fixed(sample.longBias, 5),
    fixed(sample.latBias, 5),
    fixed(sample.yawBias, 3),
    sample.confidence,
    sample.autoStopCandidate ? 1 : 0,
    run.appVersion || "legacy",
    run.schemaVersion || 1,
    sample.phase || "running",
    fixed(sample.sensorIntervalMs, 2),
    sample.autoStartReady ? 1 : 0,
    fixed(sample.startCandidateHoldMs, 0),
    fixed(sample.startThresholdG, 4),
    fixed(sample.stationaryThresholdG, 4),
    sample.gpsFresh ? 1 : 0,
    sample.forwardAxisLocked ? 1 : 0,
    sample.gpsInnovationClipped ? 1 : 0,
    fixed(sample.gravityErrorG, 5),
    fixed(sample.turnConsistencyDeg, 2),
    sample.imuInnovationClipped ? 1 : 0,
    sample.gpsStopEvidence ? 1 : 0,
    fixed(sample.gpsStopObservationCount, 0),
    fixed(sample.gpsStopDwellMs, 0),
    fixed(sample.gpsStopDisplacementM, 2),
    fixed(sample.gpsObservationSequence, 0),
    ...qualityColumns,
  ].map(csvCell).join(","));
  return eventHeader + eventRows.concat(sampleRows).join("\n");
}

function runsToCsv(runs) {
  const documents = runs.map((run) => runToCsv(run, true).trimEnd().split("\n"));
  if (!documents.length) return "";
  return `${documents[0][0]}\n${documents.flatMap((lines) => lines.slice(1)).join("\n")}`;
}

function fixed(value, digits) {
  return Number.isFinite(value) ? value.toFixed(digits) : "";
}

function formatBytes(value) {
  if (!Number.isFinite(value) || value < 0) return "--";
  if (value < 1024) return `${Math.round(value)} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(1)} GB`;
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

function parseRunBackup(content, existingIds = new Set()) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("JSONを読み取れません");
  }
  const sourceRuns = Array.isArray(parsed?.runs)
    ? parsed.runs
    : (parsed && typeof parsed === "object" && parsed.id ? [parsed] : null);
  if (!sourceRuns) throw new Error("Gym Anaの走行JSONではありません");
  if (parsed.backupVersion !== undefined
    && (!Number.isInteger(parsed.backupVersion) || parsed.backupVersion < 1 || parsed.backupVersion > 1)) {
    throw new Error("未対応のバックアップ形式です");
  }
  if (sourceRuns.length > IMPORT_RUN_MAX) throw new Error(`一度に復元できるのは${IMPORT_RUN_MAX}走までです`);

  const knownIds = new Set(existingIds);
  const runs = [];
  let skipped = 0;
  sourceRuns.forEach((run, index) => {
    if (!run || typeof run !== "object" || Array.isArray(run)) {
      throw new Error(`${index + 1}件目の走行形式が不正です`);
    }
    if (typeof run.id !== "string" || !run.id.trim() || run.id.length > 200) {
      throw new Error(`${index + 1}件目の走行IDが不正です`);
    }
    if (knownIds.has(run.id)) {
      skipped += 1;
      return;
    }
    if (!run.startedAtIso || !Number.isFinite(Date.parse(run.startedAtIso))) {
      throw new Error(`${index + 1}件目の開始日時が不正です`);
    }
    if (run.endedAtIso && !Number.isFinite(Date.parse(run.endedAtIso))) {
      throw new Error(`${index + 1}件目の終了日時が不正です`);
    }
    if (!Number.isFinite(run.durationMs) || run.durationMs < 0 || run.durationMs > 24 * 60 * 60 * 1000) {
      throw new Error(`${index + 1}件目の計測時間が不正です`);
    }
    if (!Array.isArray(run.samples) || !Array.isArray(run.events)) {
      throw new Error(`${index + 1}件目のサンプルまたはイベントが不正です`);
    }
    if (run.samples.length > IMPORT_SAMPLE_MAX) {
      throw new Error(`${index + 1}件目のサンプル数が上限を超えています`);
    }
    if (!run.samples.every((sample) => sample && typeof sample === "object" && !Array.isArray(sample))
      || !run.events.every((event) => event && typeof event === "object" && !Array.isArray(event))) {
      throw new Error(`${index + 1}件目の記録内容が不正です`);
    }
    if (run.schemaVersion !== undefined
      && (!Number.isInteger(run.schemaVersion) || run.schemaVersion < 1 || run.schemaVersion > LOG_SCHEMA_VERSION)) {
      throw new Error(`${index + 1}件目のschema版に対応していません`);
    }
    knownIds.add(run.id);
    runs.push(buildRun(run));
  });
  return { runs, skipped, total: sourceRuns.length };
}

async function importRunBackup(file) {
  if (!file) return;
  if (file.size > IMPORT_FILE_MAX_BYTES) {
    setStorageStatus("JSONが100 MBを超えています");
    return;
  }
  elements.importJsonButton.disabled = true;
  setStorageStatus("JSONを確認中");
  try {
    const existingIds = new Set(state.savedRuns.map((run) => run.id));
    const result = parseRunBackup(await file.text(), existingIds);
    if (result.runs.length) {
      await dbPutMany(RUN_STORE, result.runs);
      await loadRuns();
    }
    setStorageStatus(`復元 ${result.runs.length}件 / 重複 ${result.skipped}件`);
    refreshStorageEstimate();
  } catch (error) {
    setStorageStatus(`復元できません: ${error.message}`);
  } finally {
    elements.importJsonButton.disabled = state.mode === "running";
    elements.importJsonInput.value = "";
  }
}

function backupDocument(runs) {
  return {
    backupVersion: 1,
    appVersion: APP_VERSION,
    schemaVersion: LOG_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    runs,
  };
}

function exportAllJson() {
  downloadText(JSON.stringify(backupDocument(state.savedRuns), null, 2), `gym-ana-all-${makeRunId()}.json`, "application/json;charset=utf-8");
}

function exportSelectedJson() {
  const runs = selectedRuns();
  if (!runs.length) return;
  downloadText(JSON.stringify(backupDocument(runs), null, 2), `gym-ana-selected-${makeRunId()}.json`, "application/json;charset=utf-8");
}

function exportSelectedCsv() {
  const runs = selectedRuns();
  if (!runs.length) return;
  downloadText(runsToCsv(runs), `gym-ana-selected-${makeRunId()}.csv`, "text/csv;charset=utf-8");
}

function deleteSelectedRuns() {
  const ids = [...state.selectedRunIds];
  if (!ids.length) return;
  if (!window.confirm(`選択した${ids.length}件の走行データを端末から削除します。元には戻せません。`)) return;
  setStorageStatus("削除中");
  dbDeleteMany(RUN_STORE, ids)
    .then(() => {
      state.selectedRunIds.clear();
      return loadRuns();
    })
    .catch(() => setStorageStatus("削除できませんでした"));
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
elements.calibrationButton.addEventListener("click", startCalibration);
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
elements.storageRetryButton.addEventListener("click", recoverStorage);
elements.clearButton.addEventListener("click", () => {
  if (state.mode === "running") return;
  state.samples = [];
  state.rawSamples = [];
  state.preStartSamples = [];
  state.events = [];
  state.speedMs = 0;
  state.startedAt = 0;
  state.stoppedAt = 0;
  state.currentRunId = "";
  state.autoMeasurementEnabled = false;
  state.measurementMode = "none";
  resetLiveSensorValues();
  setMode(state.sensorEnabled ? "sensor-on" : "idle", state.sensorEnabled ? text.sensorOn : text.idle);
  renderEvents();
  render();
});
elements.exportButton.addEventListener("click", exportCsv);
elements.exportAllButton.addEventListener("click", exportAllJson);
elements.exportSelectedJsonButton.addEventListener("click", exportSelectedJson);
elements.exportSelectedCsvButton.addEventListener("click", exportSelectedCsv);
elements.deleteSelectedButton.addEventListener("click", deleteSelectedRuns);
elements.importJsonButton.addEventListener("click", () => elements.importJsonInput.click());
elements.importJsonInput.addEventListener("change", () => importRunBackup(elements.importJsonInput.files?.[0]));
elements.selectAllRuns.addEventListener("change", () => {
  state.selectedRunIds = elements.selectAllRuns.checked
    ? new Set(state.savedRuns.map((run) => run.id))
    : new Set();
  renderHistory();
});
elements.historyList.addEventListener("change", (event) => {
  const checkbox = event.target.closest("input[data-select-run]");
  if (!checkbox) return;
  if (checkbox.checked) state.selectedRunIds.add(checkbox.dataset.selectRun);
  else state.selectedRunIds.delete(checkbox.dataset.selectRun);
  syncHistorySelectionControls();
});
elements.historyList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action][data-run]");
  if (!button) return;
  exportStoredRun(button.dataset.run, button.dataset.action);
});

document.addEventListener("visibilitychange", handleAppBackground);
window.addEventListener("pagehide", handleAppBackground);

if ("serviceWorker" in navigator) {
  let serviceWorkerReloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (serviceWorkerReloading) return;
    serviceWorkerReloading = true;
    window.location.reload();
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js")
      .then((registration) => registration.update())
      .catch(() => {
        addEvent("CACHE", "Offline cache unavailable");
      });
  });
}

elements.appVersion.textContent = APP_VERSION;
render();
loadRuns();
