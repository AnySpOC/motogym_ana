#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const EARTH_RADIUS_M = 6_371_000;
const CURRENT = { drag: 0, processNoise: 1.2, gpsSigmaScale: 0.35, gpsPredictionSec: 0 };

function parseArgs(argv) {
  const options = { roots: [], json: null };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--root") options.roots.push(argv[++i]);
    else if (argv[i] === "--json") options.json = argv[++i];
    else if (argv[i] === "--help") {
      console.log("Usage: node scripts/evaluate_existing_runs.mjs [--root DIR ...] [--json FILE]");
      process.exit(0);
    } else throw new Error(`Unknown option: ${argv[i]}`);
  }
  if (!options.roots.length) options.roots.push("C:\\Users\\foxho\\Videos");
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

function parseRunStart(file, lines = null) {
  if (lines?.length) {
    const headers = parseCsvLine(lines[0]);
    const startedAtIndex = headers.indexOf("started_at_iso");
    if (startedAtIndex >= 0) {
      const starts = new Set();
      for (const line of lines.slice(1)) {
        const value = parseCsvLine(line)[startedAtIndex];
        if (value && Number.isFinite(Date.parse(value))) starts.add(value);
      }
      if (starts.size === 1) return Date.parse([...starts][0]);
      if (starts.size > 1) throw new Error(`Selected CSV contains multiple runs: ${file}`);
    }
  }
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
  const lines = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const startMs = parseRunStart(file, lines);
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

function continuousSegments(run, maximumGapSec = 2, minimumDurationSec = 10) {
  const groups = [];
  let current = [];
  for (const sample of run.samples) {
    if (current.length && sample.t - current.at(-1).t > maximumGapSec * 1000) {
      groups.push(current);
      current = [];
    }
    current.push(sample);
  }
  if (current.length) groups.push(current);
  return groups
    .filter((samples) => samples.length >= 20
      && samples.at(-1).t - samples[0].t >= minimumDurationSec * 1000)
    .map((samples, index) => {
      const segmentSamples = samples.map((sample, sampleIndex) => sampleIndex === 0
        && Number.isFinite(sample.gpsSpeedKmh)
        ? { ...sample, appSpeedKmh: sample.gpsSpeedKmh }
        : sample);
      return {
        ...run,
        name: groups.length > 1 ? `${run.name}#${index + 1}` : run.name,
        sourceName: run.name,
        segment: index + 1,
        startMs: segmentSamples[0].t,
        endMs: segmentSamples.at(-1).t,
        samples: segmentSamples,
        events: run.events.filter((event) => event.t >= segmentSamples[0].t - 1000
          && event.t <= segmentSamples.at(-1).t + 1000),
      };
    });
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
  let filteredLongG = 0;
  let p00 = 0.04;
  let p01 = 0;
  let p10 = 0;
  let p11 = 0.08;
  let previousTimeMs = samples[0]?.t || 0;
  let previousGpsTimestamp = null;
  return samples.map((sample) => {
    const dt = Math.min(0.12, Math.max(0.005, (sample.t - previousTimeMs) / 1000));
    previousTimeMs = sample.t;
    const transition = Math.max(0, 1 - candidate.drag * dt);
    const accelDecay = Math.exp(-dt / 0.7);
    const speedFromLongG = 0.25 * 9.80665 * dt;
    const driveLongG = 0.75 * sample.longG + 0.25 * filteredLongG;
    speedMs = Math.max(0, speedMs + (driveLongG * 9.80665 - candidate.drag * speedMs) * dt);
    filteredLongG *= accelDecay;

    const m00 = transition * p00 + speedFromLongG * p10;
    const m01 = transition * p01 + speedFromLongG * p11;
    const m10 = accelDecay * p10;
    const m11 = accelDecay * p11;
    p00 = m00 * transition + m01 * speedFromLongG + candidate.processNoise * dt;
    p01 = m01 * accelDecay;
    p10 = m10 * transition + m11 * speedFromLongG;
    p11 = m11 * accelDecay + 0.09 * dt;

    const accelerationResidual = sample.longG - filteredLongG;
    const accelerationInnovation = p11 + 0.012;
    const accelerationSpeedGain = p01 / accelerationInnovation;
    const accelerationGain = p11 / accelerationInnovation;
    filteredLongG += accelerationGain * accelerationResidual;
    speedMs = Math.max(0, speedMs + accelerationSpeedGain * accelerationResidual);
    const accelerationP10 = p10;
    const accelerationP11 = p11;
    p00 -= accelerationSpeedGain * accelerationP10;
    p01 -= accelerationSpeedGain * accelerationP11;
    p10 -= accelerationGain * accelerationP10;
    p11 -= accelerationGain * accelerationP11;

    if (Number.isFinite(sample.gpsSpeedKmh) && sample.gpsTimestamp !== previousGpsTimestamp) {
      previousGpsTimestamp = sample.gpsTimestamp;
      const accuracy = Number.isFinite(sample.gpsAccuracyM) ? sample.gpsAccuracyM : 50;
      const derived = sample.gpsSource === "position";
      const baseSigma = derived
        ? Math.min(5, Math.max(1.2, accuracy * 0.25))
        : Math.min(3, Math.max(0.4, accuracy * 0.06));
      const sigma = Math.max(0.15, baseSigma * candidate.gpsSigmaScale);
      const innovationVariance = p00 + sigma * sigma;
      const speedGain = p00 / innovationVariance;
      const accelerationGainFromGps = p10 / innovationVariance;
      const observationMs = Math.max(0, sample.gpsSpeedKmh / 3.6
        + sample.longG * 9.80665 * candidate.gpsPredictionSec);
      const residual = observationMs - speedMs;
      speedMs = Math.max(0, speedMs + speedGain * residual);
      filteredLongG += accelerationGainFromGps * residual;
      const speedP00 = p00;
      const speedP01 = p01;
      p00 -= speedGain * speedP00;
      p01 -= speedGain * speedP01;
      p10 -= accelerationGainFromGps * speedP00;
      p11 -= accelerationGainFromGps * speedP01;
    }
    return { ...sample, replaySpeedKmh: speedMs * 3.6 };
  });
}

function replayDelayCompensatedSpeed(samples, candidate) {
  let speedMs = Math.max(0, (samples[0]?.appSpeedKmh || 0) / 3.6);
  let biasG = 0;
  let previousTimeMs = samples[0]?.t || 0;
  let previousGpsTimestamp = null;
  let previousGpsTimeMs = null;
  let cumulativeAccelMs = 0;
  const history = [];

  const cumulativeAt = (targetMs) => {
    if (!history.length || targetMs <= history[0].t) return history[0]?.cumulativeAccelMs || 0;
    let low = 0;
    let high = history.length - 1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (history[middle].t < targetMs) low = middle + 1;
      else high = middle - 1;
    }
    if (low >= history.length) return history.at(-1).cumulativeAccelMs;
    const left = history[Math.max(0, low - 1)];
    const right = history[low];
    if (right.t <= left.t) return right.cumulativeAccelMs;
    const weight = (targetMs - left.t) / (right.t - left.t);
    return left.cumulativeAccelMs
      + (right.cumulativeAccelMs - left.cumulativeAccelMs) * weight;
  };

  return samples.map((sample) => {
    const dt = Math.min(0.12, Math.max(0.005, (sample.t - previousTimeMs) / 1000));
    previousTimeMs = sample.t;
    const accelerationMs2 = (sample.longG * candidate.accelScale - biasG) * 9.80665;
    cumulativeAccelMs += accelerationMs2 * dt;
    history.push({ t: sample.t, cumulativeAccelMs });
    speedMs = Math.max(0, speedMs + accelerationMs2 * dt);

    if (Number.isFinite(sample.gpsSpeedKmh) && sample.gpsTimestamp !== previousGpsTimestamp) {
      previousGpsTimestamp = sample.gpsTimestamp;
      const historyStartMs = sample.t - candidate.lagSec * 1000;
      const accelerationSinceObservation = cumulativeAccelMs - cumulativeAt(historyStartMs);
      const observationMs = Math.max(0, sample.gpsSpeedKmh / 3.6 + accelerationSinceObservation);
      const residualMs = speedMs - observationMs;
      if (previousGpsTimeMs !== null && candidate.biasGain > 0) {
        const gpsIntervalSec = Math.min(3, Math.max(0.3, (sample.t - previousGpsTimeMs) / 1000));
        biasG = Math.max(-0.06, Math.min(0.06,
          biasG + candidate.biasGain * residualMs / (9.80665 * gpsIntervalSec)));
      }
      previousGpsTimeMs = sample.t;
      speedMs = Math.max(0, speedMs + candidate.gpsGain * (observationMs - speedMs));
    }
    return { ...sample, replaySpeedKmh: speedMs * 3.6, replayBiasG: biasG };
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

function delayCompensatedCandidates() {
  const result = [];
  for (const lagSec of [0, 0.5, 1, 1.5, 2]) {
    for (const gpsGain of [0.35, 0.5, 0.7, 0.9, 1]) {
      for (const biasGain of [0, 0.03, 0.08, 0.15]) {
        for (const accelScale of [0.8, 1]) result.push({ lagSec, gpsGain, biasGain, accelScale });
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
  const runsByIdentity = new Map();
  const tracksByIdentity = new Map();
  for (const root of options.roots) {
    for (const file of walk(root, ".csv")) {
      const run = loadCsv(file);
      const identity = `${run.startMs}|${run.endMs}|${run.samples.length}`;
      if (!runsByIdentity.has(identity)) runsByIdentity.set(identity, run);
    }
    for (const file of walk(root, ".gpx")) {
      const track = loadGpx(file);
      if (track.points.length < 20) continue;
      const identity = `${track.startMs}|${track.endMs}|${track.points.length}`;
      if (!tracksByIdentity.has(identity)) tracksByIdentity.set(identity, track);
    }
  }
  const runs = [...runsByIdentity.values()];
  const tracks = [...tracksByIdentity.values()];
  const matched = [];
  const excluded = [];
  for (const run of runs) {
    const match = matchTrack(run, tracks);
    if (!match) {
      excluded.push({ csv: run.name, reason: "no GPX overlap" });
      continue;
    }
    const segments = continuousSegments(run);
    let acceptedSegments = 0;
    for (const segment of segments) {
      const segmentOverlap = overlapSec(segment, match.track);
      const sync = bestGpsOffset(segment, match.track);
      const trusted = sync && segmentOverlap >= 10 && sync.metrics.correlation >= 0.7
        && sync.metrics.rmse <= 8;
      if (trusted) {
        matched.push({ run: segment, track: match.track, overlap: segmentOverlap, sync, trusted: true });
        acceptedSegments += 1;
      } else {
        excluded.push({
          csv: segment.name,
          gpx: match.track.name,
          reason: sync
            ? `quality gate (overlap=${round(segmentOverlap, 1)}s, GPS RMSE=${round(sync.metrics.rmse)} km/h, corr=${round(sync.metrics.correlation)})`
            : "too few comparable GPS samples",
        });
      }
    }
    if (!segments.length) excluded.push({ csv: run.name, gpx: match.track.name, reason: "no continuous segment >= 10 s" });
    else if (!acceptedSegments && !excluded.some((item) => item.csv.startsWith(run.name))) {
      excluded.push({ csv: run.name, gpx: match.track.name, reason: "no segment passed quality gate" });
    }
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

  const realTimeCurrentPerRun = matched.map((item) => compare(
    replaySpeed(item.run.samples, CURRENT), item.track.points, 0, "replaySpeedKmh",
  ));
  const realTimeEvaluated = delayCompensatedCandidates().map((candidate) => {
    const perRun = matched.map((item) => compare(
      replayDelayCompensatedSpeed(item.run.samples, candidate), item.track.points, 0, "replaySpeedKmh",
    ));
    return { candidate, perRun, aggregate: aggregate(perRun) };
  });
  realTimeEvaluated.sort((a, b) => (a.aggregate.macroRmse + a.aggregate.macroAbsBias * 0.15)
    - (b.aggregate.macroRmse + b.aggregate.macroAbsBias * 0.15));
  const realTimeCrossValidation = dates.map((heldOutDate) => {
    const trainingIndexes = matched.map((item, index) => item.run.date !== heldOutDate ? index : -1).filter((i) => i >= 0);
    const testIndexes = matched.map((item, index) => item.run.date === heldOutDate ? index : -1).filter((i) => i >= 0);
    const ranked = realTimeEvaluated.map((item) => ({
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
      currentTest: aggregate(testIndexes.map((index) => realTimeCurrentPerRun[index])),
    };
  });
  const alignedImprovementRatio = (current.aggregate.rmse - evaluated[0].aggregate.rmse)
    / current.aggregate.rmse;
  const realTimeCurrentAggregate = aggregate(realTimeCurrentPerRun);
  const realTimeImprovementRatio = (realTimeCurrentAggregate.rmse - realTimeEvaluated[0].aggregate.rmse)
    / realTimeCurrentAggregate.rmse;
  const alignedAccepted = alignedImprovementRatio >= 0.1
    && crossValidation.every((fold) => fold.test.rmse <= fold.currentTest.rmse);
  const realTimeAccepted = realTimeImprovementRatio >= 0.1
    && realTimeCrossValidation.every((fold) => fold.test.rmse <= fold.currentTest.rmse);

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
    roots: options.roots.map((root) => path.resolve(root)),
    method: {
      candidateCount: evaluated.length,
      objective: "macro RMSE + 0.15 * macro absolute bias",
      qualityGate: "continuous segment >= 10 s, overlap >= 10 s, iPhone GPS correlation >= 0.7, GPS RMSE <= 8 km/h",
      note: "The GPS-derived per-run time offset is fixed before candidate comparison.",
    },
    current: { candidate: CURRENT, aggregate: current.aggregate },
    best: { candidate: evaluated[0].candidate, aggregate: evaluated[0].aggregate },
    decision: {
      accepted: alignedAccepted,
      improvementRatio: alignedImprovementRatio,
      rule: "overall RMSE improvement >= 10% and no held-out date worse than current",
      recommendation: alignedAccepted ? "candidate is eligible for on-device validation" : "keep current settings",
    },
    baselines: { recordedAppSpeed: recordedAggregate, iphoneGpsSpeed: iphoneGpsAggregate },
    topCandidates: evaluated.slice(0, 10).map((item) => ({ candidate: item.candidate, aggregate: item.aggregate })),
    crossValidation,
    realTimeEvaluation: {
      note: "Zero-shift UTC evaluation; unlike waveform alignment, this retains observable speed latency.",
      candidateCount: realTimeEvaluated.length,
      current: { candidate: CURRENT, aggregate: realTimeCurrentAggregate },
      best: { candidate: realTimeEvaluated[0].candidate, aggregate: realTimeEvaluated[0].aggregate },
      decision: {
        accepted: realTimeAccepted,
        improvementRatio: realTimeImprovementRatio,
        rule: "overall RMSE improvement >= 10% and no held-out date worse than current",
        recommendation: realTimeAccepted ? "candidate is eligible for on-device validation" : "keep current settings",
      },
      topCandidates: realTimeEvaluated.slice(0, 10).map((item) => ({
        candidate: item.candidate, aggregate: item.aggregate,
      })),
      crossValidation: realTimeCrossValidation,
    },
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
