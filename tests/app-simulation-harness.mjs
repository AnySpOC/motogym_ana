import fs from "node:fs";
import vm from "node:vm";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createIndexedDb() {
  const stores = new Map();
  const database = {
    objectStoreNames: {
      contains(name) {
        return stores.has(name);
      },
    },
    createObjectStore(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      return { createIndex() {} };
    },
    transaction(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const values = stores.get(name);
      const transaction = {
        objectStore() {
          return {
            put(value) {
              values.set(value.id, clone(value));
              queueMicrotask(() => transaction.oncomplete?.());
            },
            getAll() {
              const request = {};
              queueMicrotask(() => {
                request.result = [...values.values()].map(clone);
                request.onsuccess?.();
              });
              return request;
            },
            delete(id) {
              values.delete(id);
              queueMicrotask(() => transaction.oncomplete?.());
            },
          };
        },
      };
      return transaction;
    },
  };

  return {
    stores,
    api: {
      open() {
        const request = {};
        queueMicrotask(() => {
          request.result = database;
          request.onupgradeneeded?.();
          request.onsuccess?.();
        });
        return request;
      },
    },
  };
}

function makeElement(selector, context2d) {
  return {
    className: "",
    classList: { add() {}, remove() {} },
    textContent: "",
    innerHTML: "",
    value: selector === "#sensitivitySelect" ? "normal" : "",
    disabled: false,
    checked: false,
    width: 960,
    height: 320,
    addEventListener() {},
    getContext: () => context2d,
  };
}

export function createSimulationHarness({ sampleHz = 60 } = {}) {
  let clock = 0;
  const epochMs = Date.parse("2026-10-18T00:00:00.000Z");
  const elements = new Map();
  const context2d = {
    clearRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
  };
  const indexedDb = createIndexedDb();

  class SimulationDate extends Date {
    constructor(value) {
      super(arguments.length ? value : epochMs + clock);
    }

    static now() {
      return epochMs + clock;
    }
  }

  const window = {
    indexedDB: indexedDb.api,
    addEventListener() {},
    removeEventListener() {},
  };
  const sandbox = {
    console,
    Date: SimulationDate,
    indexedDB: indexedDb.api,
    document: {
      visibilityState: "visible",
      addEventListener() {},
      querySelector(selector) {
        if (!elements.has(selector)) elements.set(selector, makeElement(selector, context2d));
        return elements.get(selector);
      },
      createElement: () => makeElement("created", context2d),
    },
    window,
    navigator: {
      geolocation: { watchPosition: () => 1, clearWatch() {} },
    },
    performance: { now: () => clock },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    Blob: class {},
    URL: { createObjectURL: () => "blob:test", revokeObjectURL() {} },
    setTimeout,
    clearTimeout,
  };

  let source = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
  source = source.replace(/\nrender\(\);\s*\nloadRuns\(\);\s*$/, "\n");
  source += `\nglobalThis.simulationApi = {
    state, enableSensors, disableSensors, startCalibration,
    enableAutoMeasurement, disableAutoMeasurement,
    startManualMeasurement, stopManualMeasurement,
    handleMotionSample, onGpsPosition, handleAppBackground,
    currentProfile, getSaveQueue: () => runSaveQueue
  };\n`;
  vm.runInNewContext(source, sandbox, { filename: "app.js" });

  const api = sandbox.simulationApi;
  api.state.storageAvailable = true;
  const dtMs = 1000 / sampleHz;

  function gps(speed, overrides = {}) {
    const { timestampMs, timestampOffsetMs = 0, ...coordinateOverrides } = overrides;
    api.onGpsPosition({
      timestamp: timestampMs ?? epochMs + clock + timestampOffsetMs,
      coords: {
        latitude: 35,
        longitude: 139,
        accuracy: 5,
        speed,
        heading: 90,
        ...coordinateOverrides,
      },
    });
  }

  function step(sample = {}) {
    clock += dtMs;
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
      ...sample,
    });
  }

  function runFor(durationMs, sampleFactory = () => ({}), options = {}) {
    const count = Math.ceil(durationMs / dtMs);
    const gpsEveryMs = options.gpsEveryMs || 0;
    let nextGpsAt = 0;
    for (let index = 0; index < count; index += 1) {
      const elapsedMs = index * dtMs;
      if (gpsEveryMs && elapsedMs >= nextGpsAt - 0.001) {
        const speed = typeof options.gpsSpeed === "function"
          ? options.gpsSpeed(elapsedMs)
          : options.gpsSpeed;
        gps(speed ?? 0);
        nextGpsAt += gpsEveryMs;
      }
      step(sampleFactory(elapsedMs, clock));
    }
  }

  async function flushStorage() {
    await api.getSaveQueue().catch(() => {});
    for (let index = 0; index < 4; index += 1) await Promise.resolve();
  }

  function savedRuns() {
    const runStore = indexedDb.stores.get("runs");
    return runStore ? [...runStore.values()].map(clone) : [];
  }

  return {
    api,
    elements,
    sandbox,
    sampleHz,
    dtMs,
    get clock() {
      return clock;
    },
    gps,
    step,
    runFor,
    flushStorage,
    savedRuns,
  };
}

export function calibrateStationary(harness, gravity = [0, 0, 1]) {
  harness.api.enableSensors();
  harness.api.startCalibration();
  harness.runFor(4300, () => ({
    gravityX: gravity[0],
    gravityY: gravity[1],
    gravityZ: gravity[2],
  }));
}

export function armAtStandstill(harness, gravity = [0, 0, 1]) {
  harness.gps(0);
  harness.api.enableAutoMeasurement();
  harness.runFor(800, () => ({
    gravityX: gravity[0],
    gravityY: gravity[1],
    gravityZ: gravity[2],
  }), { gpsEveryMs: 300, gpsSpeed: 0 });
}
