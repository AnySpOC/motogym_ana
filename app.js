const G = 9.80665;
const START_G = 0.18;
const STOP_SPEED = 0.65;
const STOP_HOLD_MS = 950;
const TURN_RATE = 35;
const BANK_ANGLE = 18;
const DB_NAME = "moto-gym-ana";
const DB_VERSION = 1;
const RUN_STORE = "runs";
const RAW_SAMPLE_LIMIT = 20000;

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
  demoStop: "\u30c7\u30e2\u505c\u6b62",
  manualStop: "\u624b\u52d5\u505c\u6b62",
  saved: "\u81ea\u52d5\u4fdd\u5b58\u6e08\u307f",
  storageReady: "\u81ea\u52d5\u4fdd\u5b58\u6709\u52b9",
  storageUnavailable: "\u81ea\u52d5\u4fdd\u5b58\u4e0d\u53ef",
};

const elements = {
  sensorStatus: document.querySelector("#sensorStatus"),
  rideState: document.querySelector("#rideState"),
  timer: document.querySelector("#timer"),
  permissionButton: document.querySelector("#permissionButton"),
  armButton: document.querySelector("#armButton"),
  stopButton: document.querySelector("#stopButton"),
  demoButton: document.querySelector("#demoButton"),
  clearButton: document.querySelector("#clearButton"),
  exportButton: document.querySelector("#exportButton"),
  exportAllButton: document.querySelector("#exportAllButton"),
  longG: document.querySelector("#longG"),
  latG: document.querySelector("#latG"),
  speed: document.querySelector("#speed"),
  bank: document.querySelector("#bank"),
  yaw: document.querySelector("#yaw"),
  confidence: document.querySelector("#confidence"),
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
  confidence: 0,
  samples: [],
  rawSamples: [],
  events: [],
  savedRuns: [],
  currentRunId: "",
  demoTimer: null,
};

let dbPromise = null;

class Kalman1D {
  constructor(processNoise = 0.018, measurementNoise = 0.18) {
    this.q = processNoise;
    this.r = measurementNoise;
    this.x = 0;
    this.p = 1;
  }

  update(measurement) {
    this.p += this.q;
    const k = this.p / (this.p + this.r);
    this.x += k * (measurement - this.x);
    this.p *= 1 - k;
    return this.x;
  }
}

const filters = {
  longG: new Kalman1D(),
  latG: new Kalman1D(),
  yaw: new Kalman1D(0.03, 0.28),
  bank: new Kalman1D(0.025, 0.22),
};

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
  const t = state.startedAt ? nowMs() - state.startedAt : 0;
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
  state.speedMs = 0;
  state.rawSamples = [];
  state.lastStopCandidateAt = 0;
  state.currentRunId = "";
  setMode("armed", text.armed);
  addEvent("ARM", text.armDetail);
}

function startRun() {
  state.startedAt = nowMs();
  state.stoppedAt = 0;
  state.samples = [];
  state.rawSamples = [];
  state.events = state.events.filter((event) => event.type === "ARM");
  state.currentRunId = makeRunId();
  setMode("running", text.running);
  addEvent("START", text.startDetail);
}

function stopRun(reason = text.stopDetail) {
  if (state.mode !== "running") return;
  state.stoppedAt = nowMs();
  setMode("stopped", text.stopped);
  addEvent("STOP", reason);
  saveCurrentRun();
}

function handleMotionSample(sample) {
  const t = sample.time ?? nowMs();
  const dt = state.lastSampleAt ? Math.min(0.12, Math.max(0.005, (t - state.lastSampleAt) / 1000)) : 0.016;
  state.lastSampleAt = t;

  state.longG = filters.longG.update(sample.longG);
  state.latG = filters.latG.update(sample.latG);
  state.yawRate = filters.yaw.update(sample.yawRate);
  state.bankDeg = filters.bank.update(sample.bankDeg);

  const drag = Math.min(0.15, state.speedMs * 0.025);
  state.speedMs = Math.max(0, state.speedMs + (state.longG * G - drag) * dt);
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
  if (state.mode === "armed" && state.longG > START_G) {
    startRun();
  }

  if (state.mode !== "running") return;

  if (state.longG > 0.22) addEdgeEvent("ACCEL", text.accel);
  if (state.longG < -0.25) addEdgeEvent("BRAKE", text.brake);
  if (Math.abs(state.yawRate) > TURN_RATE) addEdgeEvent("TURN", state.yawRate > 0 ? text.rightTurn : text.leftTurn);
  if (Math.abs(state.bankDeg) > BANK_ANGLE) addEdgeEvent("BANK", state.bankDeg > 0 ? text.rightBank : text.leftBank);

  const nearStopped = state.speedMs < STOP_SPEED && Math.abs(state.longG) < 0.05 && Math.abs(state.latG) < 0.06;
  if (nearStopped) {
    state.lastStopCandidateAt ||= t;
    if (t - state.lastStopCandidateAt > STOP_HOLD_MS && nowMs() - state.startedAt > 1500) {
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
    elapsed: state.startedAt ? t - state.startedAt : 0,
    longG: state.longG,
    latG: state.latG,
    speed: state.speedMs,
  });
  if (state.samples.length > 420) state.samples.shift();
}

function storeRawSample(t) {
  if (!state.startedAt || state.stoppedAt) return;
  state.rawSamples.push({
    timeMs: Math.round(t - state.startedAt),
    longG: round(state.longG, 4),
    latG: round(state.latG, 4),
    speedKmh: round(state.speedMs * 3.6, 3),
    bankDeg: round(state.bankDeg, 2),
    yawRate: round(state.yawRate, 2),
    confidence: state.confidence,
  });
  if (state.rawSamples.length > RAW_SAMPLE_LIMIT) state.rawSamples.shift();
}

function onDeviceMotion(event) {
  const acc = event.accelerationIncludingGravity || event.acceleration || {};
  const rotation = event.rotationRate || {};
  handleMotionSample({
    time: nowMs(),
    longG: (acc.y || 0) / G,
    latG: (acc.x || 0) / G,
    yawRate: rotation.alpha || 0,
    bankDeg: state.bankDeg,
  });
}

function onDeviceOrientation(event) {
  if (Number.isFinite(event.gamma)) {
    state.bankDeg = filters.bank.update(event.gamma);
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
    window.addEventListener("devicemotion", onDeviceMotion);
    window.addEventListener("deviceorientation", onDeviceOrientation);
    setMode("idle", text.sensorReady);
    addEvent("SENSOR", text.sensorGranted);
  } catch {
    setMode("idle", text.needPermission);
    addEvent("ERROR", text.sensorError);
  }
}

function runDemo() {
  clearInterval(state.demoTimer);
  armTimer();
  const start = nowMs();
  state.demoTimer = setInterval(() => {
    const elapsed = (nowMs() - start) / 1000;
    if (elapsed > 12) {
      clearInterval(state.demoTimer);
      stopRun(text.demoStop);
      return;
    }
    const longG = elapsed < 1 ? 0.03 : elapsed < 3.2 ? 0.34 : elapsed < 7.4 ? 0.05 : elapsed < 9.6 ? -0.3 : 0;
    const latG = elapsed > 3.2 && elapsed < 7.3 ? Math.sin(elapsed * 3) * 0.25 : 0.02;
    const yawRate = elapsed > 3.2 && elapsed < 7.3 ? Math.sin(elapsed * 2) * 70 : 0;
    const bankDeg = elapsed > 3.2 && elapsed < 7.3 ? Math.sin(elapsed * 2) * 28 : 0;
    handleMotionSample({ time: nowMs(), longG, latG, yawRate, bankDeg });
  }, 33);
}

function render() {
  const runMs = state.startedAt ? (state.stoppedAt || nowMs()) - state.startedAt : 0;
  elements.timer.textContent = formatTime(runMs);
  elements.longG.textContent = `${state.longG.toFixed(2)} g`;
  elements.latG.textContent = `${state.latG.toFixed(2)} g`;
  elements.speed.textContent = `${(state.speedMs * 3.6).toFixed(1)} km/h`;
  elements.bank.textContent = `${state.bankDeg.toFixed(0)} deg`;
  elements.yaw.textContent = `${state.yawRate.toFixed(0)} deg/s`;
  elements.confidence.textContent = `${state.confidence}%`;
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
    durationMs: Math.round(state.startedAt ? (state.stoppedAt || nowMs()) - state.startedAt : 0),
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
  const eventHeader = "section,time_ms,type,detail,long_g,lat_g,speed_kmh,bank_deg,yaw_rate,confidence\n";
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
elements.armButton.addEventListener("click", armTimer);
elements.stopButton.addEventListener("click", () => stopRun(text.manualStop));
elements.demoButton.addEventListener("click", runDemo);
elements.clearButton.addEventListener("click", () => {
  state.samples = [];
  state.rawSamples = [];
  state.events = [];
  state.speedMs = 0;
  state.startedAt = 0;
  state.stoppedAt = 0;
  state.currentRunId = "";
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
