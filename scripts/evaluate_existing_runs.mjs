#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const EARTH_RADIUS_M = 6_371_000;
const CURRENT = { drag: 0, processNoise: 1.2, gpsSigmaScale: 0.35, gpsPredictionSec: 0 };

function parseArgs(argv) {
  const options = { root: "C:\\Users\\foxho\\Videos", json: null };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--root") options.root = argv[++i];
    else if (argv[i] === "--json") options.json = argv[++i];
    else if (argv[i] === "--help") {
      console.log("Usage: node scripts/evaluate_existing_runs.mjs [--root DIR] [--json FILE]");
      process.exit(0);
    } else throw new Error(`Unknown option: ${argv[i]}`);
  }
  return options;
}

function walk(directory, extension, result = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const item = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(item, extension, result);
    else if (entry.name.toLowerCase().endsWith(extension)) result.push(item);
  }
  return result;
}

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const character = line[i];
    if (character === '"') {
      if (quoted && line[i + 1] === '"') value += line[++i];
      else quoted = !quoted;
    } else if (character === "," && !quoted) {
      values.push(value);
      value = "";
    } else value += character;
  }
  values.push(value);
  return values;
}

function parseRunStart(file) {
  const match = path.basename(file).match(/(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/);
  if (!match) throw new Error(`Run start is not encoded in ${file}`);
  return Date.parse(`${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`);
}

function number(cells, index, key) {
  const raw = cells[index[key]];
  if (raw === undefined || raw === null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function loadCsv(file) {
  const startMs = parseRunStart(file);
  const lines = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(lines[0]);
  const index = Object.fromEntries(headers.map((header, position) => [header, position]));
  const samples = [];
  const events = [];
  let previousObservation = null;
  let generatedGpsTimestamp = 0;
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    const timeMs = number(cells, index, "time_ms");
    if (timeMs === null) continue;
    const t = startMs + timeMs;
    if (cells[index.section] === "event") {
      if (["START", "STOP", "INTERRUPT"].includes(cells[index.type])) {
        events.push({ type: cells[index.type], detail: cells[index.detail] || "", t });
      }
      continue;
    }
    if (cells[index.section] !== "sample") continue;
    const gpsSpeedKmh = number(cells, index, "gps_speed_kmh");
    const explicitGpsTimestamp = number(cells, index, "gps_timestamp_ms");
    const observation = [gpsSpeedKmh, cells[index.latitude], cells[index.longitude]].join("|");
    if (gpsSpeedKmh !== null && observation !== previousObservation) {
      previousObservation = observation;
      generatedGpsTimestamp += 1;
    }
    samples.push({
      t,
      timeMs,
      longG: number(cells, index, "long_g") || 0,
      appSpeedKmh: number(cells, index, "speed_kmh"),
      gpsSpeedKmh,
      gpsAccuracyM: number(cells, index, "gps_accuracy_m"),
      gpsSource: cells[index.gps_source] || "none",
      gpsTimestamp: explicitGpsTimestamp ?? (gpsSpeedKmh === null ? null : generatedGpsTimestamp),
    });
  }
  return {
    file,
    name: path.basename(file),
    date: new Date(startMs).toISOString().slice(0, 10),
    startMs,
    endMs: samples.at(-1)?.t ?? startMs,
    samples,
    events,
  };
}

function haversineM(a, b) {
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const dLat = lat2 - lat1;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

function loadGpx(file) {
  const xml = fs.readFileSync(file, "utf8");
  const points = [];
  for (const match of xml.matchAll(/<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>([\s\S]*?)<\/trkpt>/g)) {
    const time = match[3].match(/<time>([^<]+)<\/time>/)?.[1];
    const pdopText = match[3].match(/<pdop>([^<]+)<\/pdop>/)?.[1];
    const pdop = pdopText === undefined ? null : Number(pdopText);
    const point = { t: Date.parse(time), lat: Number(match[1]), lon: Number(match[2]), pdop };
    if (!Number.isFinite(point.t) || !Number.isFinite(point.lat) || !Number.isFinite(point.lon)) continue;
    if (point.t < Date.UTC(2025, 0, 1) || (Math.abs(point.lat) < 0.001 && Math.abs(point.lon) < 0.001)) continue;
    points.push(point);
  }
  points.sort((a, b) => a.t - b.t);
  const radius = 5;
  for (let i = 0; i < points.length; i += 1) {
    const left = points[Math.max(0, i - radius)];
    const right = points[Math.min(points.length - 1, i + radius)];
    const dt = (right.t - left.t) / 1000;
    const speedMs = dt > 0 ? haversineM(left, right) / dt : null;
    points[i].speedKmh = (points[i].pdop === null || points[i].pdop <= 4)
      && speedMs !== null && speedMs <= 60 ? speedMs * 3.6 : null;
  }
  return { file, name: path.basename(file), points, startMs: points[0]?.t, endMs: points.at(-1)?.t };
}

function overlapSec(run, track) {
  return Math.max(0, Math.min(run.endMs, track.endMs) - Math.max(run.startMs, track.startMs)) / 1000;
}

function matchTrack(run, tracks) {
  return tracks
    .map((track) => ({ track, overlap: overlapSec(run, track) }))
    .filter((item) => item.overlap >= 10)
    .sort((a, b) => b.overlap - a.overlap)[0] || null;
}

function interpolate(points, targetMs) {
  let low = 0;
  let high = points.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (points[middle].t < targetMs) low = middle + 1;
    else high = middle - 1;
  }
  if (low <= 0 || low >= points.length) return null;
  const left = points[low - 1];
  const right = points[low];
  if (!Number.isFinite(left.speedKmh) || !Number.isFinite(right.speedKmh) || right.t <= left.t) return null;
  const weight = (targetMs - left.t) / (right.t - left.t);
  return left.speedKmh + (right.speedKmh - left.speedKmh) * weight;
}

function correlation(a, b) {
  if (a.length < 3) return null;
  const meanA = a.reduce((sum, value) => sum + value, 0) / a.length;
  const meanB = b.reduce((sum, value) => sum + value, 0) / b.length;
  let numerator = 0;
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    numerator += da * db;
    sumA += da * da;
    sumB += db * db;
  }
  return sumA > 0 && sumB > 0 ? numerator / Math.sqrt(sumA * sumB) : null;
}

function compare(samples, points, offsetSec, key) {
  const observed = [];
  const truth = [];
  for (let i = 0; i < samples.length; i += 6) {
    const value = samples[i][key];
    const reference = interpolate(points, samples[i].t + offsetSec * 1000);
    if (!Number.isFinite(value) || !Number.isFinite(reference)) continue;
    observed.push(value);
    truth.push(reference);
  }
  if (observed.length < 20) return null;
  let squareError = 0;
  let absoluteError = 0;
  let error = 0;
  for (let i = 0; i < observed.length; i += 1) {
    const difference = observed[i] - truth[i];
    squareError += difference * difference;
    absoluteError += Math.abs(difference);
    error += difference;
  }
  return {
    count: observed.length,
    sse: squareError,
    rmse: Math.sqrt(squareError / observed.length),
    mae: absoluteError / observed.length,
    bias: error / observed.length,
    correlation: correlation(observed, truth),
  };
}

function bestGpsOffset(run, track) {
  let best = null;
  for (let step = -50; step <= 50; step += 1) {
    const offsetSec = step / 10;
    const metrics = compare(run.samples, track.points, offsetSec, "gpsSpeedKmh");
    if (metrics && (!best || metrics.rmse < best.metrics.rmse)) best = { offsetSec, metrics };
  }
  return best;
}

function replaySpeed(samples, candidate) {
  let speedMs = Math.max(0, (samples[0]?.appSpeedKmh || 0) / 3.6);
  let variance = 0.04;
  let previousTimeMs = samples[0]?.t || 0;
  let previousGpsTimestamp = null;
  return samples.map((sample) => {
    const dt = Math.min(0.12, Math.max(0.005, (sample.t - previousTimeMs) / 1000));
    previousTimeMs = sample.t;
    const transition = Math.max(0, 1 - candidate.drag * dt);
    speedMs = Math.max(0, speedMs + (sample.longG * 9.80665 - candidate.drag * speedMs) * dt);
    variance = transition * transition * variance + candidate.processNoise * dt;
    if (Number.isFinite(sample.gpsSpeedKmh) && sample.gpsTimestamp !== previousGpsTimestamp) {
      previousGpsTimestamp = sample.gpsTimestamp;
      const accuracy = Number.isFinite(sample.gpsAccuracyM) ? sample.gpsAccuracyM : 50;
      const derived = sample.gpsSource === "position";
      const baseSigma = derived
        ? Math.min(5, Math.max(1.2, accuracy * 0.25))
        : Math.min(3, Math.max(0.4, accuracy * 0.06));
      const sigma = Math.max(0.15, baseSigma * candidate.gpsSigmaScale);
      const gain = variance / (variance + sigma * sigma);
      const observationMs = Math.max(0, sample.gpsSpeedKmh / 3.6
        + sample.longG * 9.80665 * candidate.gpsPredictionSec);
      speedMs = Math.max(0, speedMs + gain * (observationMs - speedMs));
      variance *= 1 - gain;
    }
    return { ...sample, replaySpeedKmh: speedMs * 3.6 };
  });
}

function candidates() {
  const result = [];
  for (const drag of [0, 0.005, 0.015, 0.025]) {
    for (const processNoise of [0.3, 0.45, 0.8, 1.2, 1.8]) {
      for (const gpsSigmaScale of [0.25, 0.35, 0.5, 0.75, 1]) {
        for (const gpsPredictionSec of [0, 0.4, 0.8, 1.2]) {
          result.push({ drag, processNoise, gpsSigmaScale, gpsPredictionSec });
        }
      }
    }
  }
  return result;
}

function candidateId(candidate) {
  return `${candidate.drag}/${candidate.processNoise}/${candidate.gpsSigmaScale}/${candidate.gpsPredictionSec}`;
}

function aggregate(runResults) {
  const valid = runResults.filter(Boolean);
  const count = valid.reduce((sum, item) => sum + item.count, 0);
  const sse = valid.reduce((sum, item) => sum + item.sse, 0);
  return {
    runs: valid.length,
    count,
    rmse: count ? Math.sqrt(sse / count) : null,
    macroRmse: valid.length ? valid.reduce((sum, item) => sum + item.rmse, 0) / valid.length : null,
    macroAbsBias: valid.length ? valid.reduce((sum, item) => sum + Math.abs(item.bias), 0) / valid.length : null,
  };
}

function speedAtEvent(event, track, offsetSec) {
  const value = interpolate(track.points, event.t + offsetSec * 1000);
  return Number.isFinite(value) ? value : null;
}

function round(value, digits = 3) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function main() {
  const options = parseArgs(process.argv);
  const runs = walk(options.root, ".csv").map(loadCsv);
  const tracks = walk(options.root, ".gpx").map(loadGpx).filter((track) => track.points.length >= 20);
  const matched = [];
  const excluded = [];
  for (const run of runs) {
    const match = matchTrack(run, tracks);
    if (!match) {
      excluded.push({ csv: run.name, reason: "no GPX overlap" });
      continue;
    }
    const sync = bestGpsOffset(run, match.track);
    if (!sync) {
      excluded.push({ csv: run.name, gpx: match.track.name, reason: "too few comparable GPS samples" });
      continue;
    }
    const maxGapSec = run.samples.slice(1).reduce(
      (maximum, sample, index) => Math.max(maximum, (sample.t - run.samples[index].t) / 1000), 0,
    );
    const trusted = match.overlap >= 10 && sync.metrics.correlation >= 0.7
      && sync.metrics.rmse <= 8 && maxGapSec <= 2;
    const item = { run, track: match.track, overlap: match.overlap, sync, maxGapSec, trusted };
    if (trusted) matched.push(item);
    else excluded.push({
      csv: run.name,
      gpx: match.track.name,
      reason: `quality gate (overlap=${round(match.overlap, 1)}s, GPS RMSE=${round(sync.metrics.rmse)} km/h, corr=${round(sync.metrics.correlation)}, max gap=${round(maxGapSec)}s)`,
    });
  }

  const evaluated = candidates().map((candidate) => {
    const perRun = matched.map((item) => compare(
      replaySpeed(item.run.samples, candidate), item.track.points, item.sync.offsetSec, "replaySpeedKmh",
    ));
    return { candidate, perRun, aggregate: aggregate(perRun) };
  });
  evaluated.sort((a, b) => (a.aggregate.macroRmse + a.aggregate.macroAbsBias * 0.15)
    - (b.aggregate.macroRmse + b.aggregate.macroAbsBias * 0.15));
  const current = evaluated.find((item) => candidateId(item.candidate) === candidateId(CURRENT));
  const dates = [...new Set(matched.map((item) => item.run.date))];
  const crossValidation = dates.map((heldOutDate) => {
    const trainingIndexes = matched.map((item, index) => item.run.date !== heldOutDate ? index : -1).filter((i) => i >= 0);
    const testIndexes = matched.map((item, index) => item.run.date === heldOutDate ? index : -1).filter((i) => i >= 0);
    const ranked = evaluated.map((item) => ({
      ...item,
      training: aggregate(trainingIndexes.map((index) => item.perRun[index])),
    })).sort((a, b) => (a.training.macroRmse + a.training.macroAbsBias * 0.15)
      - (b.training.macroRmse + b.training.macroAbsBias * 0.15));
    const selected = ranked[0];
    return {
      heldOutDate,
      candidate: selected.candidate,
      training: selected.training,
      test: aggregate(testIndexes.map((index) => selected.perRun[index])),
      currentTest: aggregate(testIndexes.map((index) => current.perRun[index])),
    };
  });

  const recordedAggregate = aggregate(matched.map((item) => compare(
    item.run.samples, item.track.points, item.sync.offsetSec, "appSpeedKmh",
  )));
  const iphoneGpsAggregate = aggregate(matched.map((item) => compare(
    item.run.samples, item.track.points, item.sync.offsetSec, "gpsSpeedKmh",
  )));

  const runSummary = matched.map((item, index) => {
    const events = item.run.events.map((event) => ({
      type: event.type,
      detail: event.detail,
      utc: new Date(event.t).toISOString(),
      gpxSpeedKmh: round(speedAtEvent(event, item.track, item.sync.offsetSec)),
    }));
    return {
      csv: item.run.name,
      gpx: item.track.name,
      date: item.run.date,
      samples: item.run.samples.length,
      overlapSec: round(item.overlap, 1),
      gpsOffsetSec: item.sync.offsetSec,
      iphoneGps: {
        rmse: round(item.sync.metrics.rmse),
        bias: round(item.sync.metrics.bias),
        correlation: round(item.sync.metrics.correlation),
      },
      appRecorded: (() => {
        const metric = compare(item.run.samples, item.track.points, item.sync.offsetSec, "appSpeedKmh");
        return metric ? { rmse: round(metric.rmse), bias: round(metric.bias), correlation: round(metric.correlation) } : null;
      })(),
      currentReplay: current.perRun[index] ? {
        rmse: round(current.perRun[index].rmse), bias: round(current.perRun[index].bias),
      } : null,
      bestReplay: evaluated[0].perRun[index] ? {
        rmse: round(evaluated[0].perRun[index].rmse), bias: round(evaluated[0].perRun[index].bias),
      } : null,
      events,
    };
  });
  const output = {
    generatedAt: new Date().toISOString(),
    root: path.resolve(options.root),
    method: {
      candidateCount: evaluated.length,
      objective: "macro RMSE + 0.15 * macro absolute bias",
      qualityGate: "overlap >= 10 s, iPhone GPS correlation >= 0.7, GPS RMSE <= 8 km/h, max sample gap <= 2 s",
      note: "The GPS-derived per-run time offset is fixed before candidate comparison.",
    },
    current: { candidate: CURRENT, aggregate: current.aggregate },
    best: { candidate: evaluated[0].candidate, aggregate: evaluated[0].aggregate },
    baselines: { recordedAppSpeed: recordedAggregate, iphoneGpsSpeed: iphoneGpsAggregate },
    topCandidates: evaluated.slice(0, 10).map((item) => ({ candidate: item.candidate, aggregate: item.aggregate })),
    crossValidation,
    runs: runSummary,
    excluded,
    limitations: [
      "Old CSV files begin at START and contain no pre-start iPhone IMU samples, so alternative START logic cannot be replayed faithfully.",
      "START/STOP event speeds are audits against GPX, not a replay of the v23 state machine.",
      "GPX speed is an independent reference, not laboratory ground truth.",
    ],
  };
  const serialized = JSON.stringify(output, null, 2);
  if (options.json) fs.writeFileSync(options.json, `${serialized}\n`);
  console.log(serialized);
}

main();
