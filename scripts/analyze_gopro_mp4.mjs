#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const gpmfExtract = require("gpmf-extract");
const goproTelemetry = require("gopro-telemetry");
const DEFAULT_STREAMS = ["ACCL", "GYRO", "GRAV", "CORI", "GPS5", "GPS9"];
const CHUNK_SIZE = 2 * 1024 * 1024;
const EARTH_RADIUS_M = 6371000;

function parseArgs(argv) {
  const args = { streams: DEFAULT_STREAMS };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--mp4") args.mp4 = argv[++index];
    else if (arg === "--out") args.out = argv[++index];
    else if (arg === "--csv") args.csv = argv[++index];
    else if (arg === "--gpx") args.gpx = argv[++index];
    else if (arg === "--streams") args.streams = argv[++index].split(",").map((item) => item.trim()).filter(Boolean);
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return [
    "Usage:",
    "  node scripts/analyze_gopro_mp4.mjs --mp4 <video.mp4> [--out <summary.json>]",
    "  [--csv <gym-ana.csv>] [--gpx <video.gpx>]",
    "  [--streams ACCL,GYRO,GRAV,CORI,GPS5,GPS9]",
    "",
    "The JSON summary never includes GPS coordinates or full sensor samples.",
  ].join("\n");
}

function parseCsvLine(line) {
  const cells = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      cells.push(value);
      value = "";
    } else {
      value += char;
    }
  }
  cells.push(value);
  return cells;
}

function parseRunStart(filePath) {
  const match = path.basename(filePath).match(/(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/);
  if (!match) throw new Error(`Run start is not encoded in ${path.basename(filePath)}`);
  return Date.parse(`${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`);
}

function firstGpxTime(gpxPath) {
  const gpxText = fs.readFileSync(gpxPath, "utf8");
  const timeMatch = gpxText.match(/<time>([^<]+)<\/time>/);
  if (!timeMatch) throw new Error(`No GPX time found in ${gpxPath}`);
  return Date.parse(timeMatch[1]);
}

function embeddedGpsVideoStart(telemetryStreams) {
  const gps = telemetryStreams.find(({ key }) => key === "GPS9" || key === "GPS5")?.stream?.samples || [];
  const sample = gps.find((item) => Number.isFinite(item.cts) && item.date);
  if (!sample) return null;
  const sampleEpochMs = new Date(sample.date).getTime();
  return Number.isFinite(sampleEpochMs) ? sampleEpochMs - sample.cts : null;
}

function loadPhoneSamples(csvPath, videoStartMs, timingSource) {
  const csvStartMs = parseRunStart(csvPath);
  const lines = fs.readFileSync(csvPath, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(lines[0]);
  const index = Object.fromEntries(headers.map((header, position) => [header, position]));
  const number = (cells, key) => {
    const value = Number(cells[index[key]]);
    return Number.isFinite(value) ? value : null;
  };
  const samples = [];
  const events = [];
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    const timeMs = number(cells, "time_ms");
    if (timeMs === null) continue;
    if (cells[index.section] === "event" && ["START", "STOP"].includes(cells[index.type])) {
      events.push({
        type: cells[index.type],
        detail: cells[index.detail],
        videoTimeMs: csvStartMs - videoStartMs + timeMs,
        appSpeedKmh: number(cells, "speed_kmh"),
      });
      continue;
    }
    if (cells[index.section] !== "sample") continue;
    samples.push({
      videoTimeMs: csvStartMs - videoStartMs + timeMs,
      longG: number(cells, "long_g"),
      latG: number(cells, "lat_g"),
      yawRateDps: number(cells, "yaw_rate"),
      appSpeedKmh: number(cells, "speed_kmh"),
      iphoneGpsSpeedKmh: number(cells, "gps_speed_kmh"),
      gpsAccuracyM: number(cells, "gps_accuracy_m"),
      gpsTimestampMs: number(cells, "gps_timestamp_ms"),
      gpsSource: cells[index.gps_source] || "none",
    });
  }
  return {
    csvStartUtc: new Date(csvStartMs).toISOString(),
    videoStartUtc: new Date(videoStartMs).toISOString(),
    timingSource,
    csvZeroAtVideoSec: (csvStartMs - videoStartMs) / 1000,
    samples,
    events,
  };
}

function streamMp4(filePath, onProgress) {
  return (mp4boxFile) => {
    const fileSize = fs.statSync(filePath).size;
    const descriptor = fs.openSync(filePath, "r");
    const buffer = Buffer.allocUnsafe(CHUNK_SIZE);
    let offset = 0;
    let lastPercent = -1;
    try {
      while (offset < fileSize) {
        const bytesRead = fs.readSync(descriptor, buffer, 0, Math.min(CHUNK_SIZE, fileSize - offset), offset);
        if (!bytesRead) break;
        const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + bytesRead);
        arrayBuffer.fileStart = offset;
        mp4boxFile.appendBuffer(arrayBuffer);
        offset += bytesRead;
        const percent = Math.floor(offset / fileSize * 100);
        if (percent >= lastPercent + 10) {
          lastPercent = percent;
          onProgress?.(Math.min(100, percent));
        }
      }
      mp4boxFile.flush();
    } finally {
      fs.closeSync(descriptor);
    }
  };
}

function numericVector(value) {
  if (Number.isFinite(value)) return [value];
  if (Array.isArray(value)) return value.every(Number.isFinite) ? value : [];
  if (value && typeof value === "object") {
    const numbers = Object.values(value).filter(Number.isFinite);
    return numbers.length ? numbers : [];
  }
  return [];
}

function summarizeAxis(samples, axis) {
  let count = 0;
  let mean = 0;
  let m2 = 0;
  let squareSum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const sample of samples) {
    const value = numericVector(sample.value)[axis];
    if (!Number.isFinite(value)) continue;
    count += 1;
    const delta = value - mean;
    mean += delta / count;
    m2 += delta * (value - mean);
    squareSum += value * value;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  if (!count) return null;
  return {
    count,
    mean,
    stddev: Math.sqrt(m2 / count),
    rms: Math.sqrt(squareSum / count),
    min,
    max,
  };
}

function summarizeStream(key, stream) {
  const samples = Array.isArray(stream.samples) ? stream.samples : [];
  const times = samples.map((sample) => sample.cts).filter(Number.isFinite);
  const firstVector = samples.map((sample) => numericVector(sample.value)).find((value) => value.length) || [];
  const durationMs = times.length > 1 ? Math.max(...times) - Math.min(...times) : 0;
  const sampleRateHz = durationMs > 0 ? (times.length - 1) * 1000 / durationMs : null;
  const gpsStream = key.startsWith("GPS");
  return {
    name: stream.name || key,
    units: stream.units || stream.sticky?.units || null,
    sampleCount: samples.length,
    firstCtsMs: times.length ? Math.min(...times) : null,
    lastCtsMs: times.length ? Math.max(...times) : null,
    sampleRateHz,
    vectorLength: firstVector.length,
    axes: gpsStream ? null : firstVector.map((_, axis) => summarizeAxis(samples, axis)),
  };
}

function findStreams(telemetry) {
  const found = [];
  for (const [deviceId, device] of Object.entries(telemetry || {})) {
    for (const [key, stream] of Object.entries(device.streams || {})) {
      found.push({ deviceId, deviceName: device["device name"] || device.name || null, key, stream });
    }
  }
  return found;
}

function interpolateVector(samples, targetMs) {
  let low = 0;
  let high = samples.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (samples[middle].cts < targetMs) low = middle + 1;
    else high = middle - 1;
  }
  if (low <= 0 || low >= samples.length) return null;
  const left = samples[low - 1];
  const right = samples[low];
  const a = numericVector(left.value);
  const b = numericVector(right.value);
  if (!a.length || a.length !== b.length || right.cts <= left.cts) return null;
  const weight = (targetMs - left.cts) / (right.cts - left.cts);
  return a.map((value, index) => value + (b[index] - value) * weight);
}

function averageVector(samples, targetMs, halfWindowMs) {
  let start = 0;
  let end = samples.length;
  const minimum = targetMs - halfWindowMs;
  const maximum = targetMs + halfWindowMs;
  while (start < end) {
    const middle = Math.floor((start + end) / 2);
    if (samples[middle].cts < minimum) start = middle + 1;
    else end = middle;
  }
  const sums = [];
  let count = 0;
  for (let index = start; index < samples.length && samples[index].cts <= maximum; index += 1) {
    const vector = numericVector(samples[index].value);
    if (!vector.length) continue;
    for (let axis = 0; axis < vector.length; axis += 1) sums[axis] = (sums[axis] || 0) + vector[axis];
    count += 1;
  }
  return count ? sums.map((sum) => sum / count) : interpolateVector(samples, targetMs);
}

function correlation(a, b) {
  if (a.length < 3 || a.length !== b.length) return null;
  const meanA = a.reduce((sum, value) => sum + value, 0) / a.length;
  const meanB = b.reduce((sum, value) => sum + value, 0) / b.length;
  let covariance = 0;
  let varianceA = 0;
  let varianceB = 0;
  for (let index = 0; index < a.length; index += 1) {
    const da = a[index] - meanA;
    const db = b[index] - meanB;
    covariance += da * db;
    varianceA += da * da;
    varianceB += db * db;
  }
  const denominator = Math.sqrt(varianceA * varianceB);
  return denominator > 0 ? covariance / denominator : null;
}

function haversineMeters(a, b) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const dLat = radians(b[0] - a[0]);
  const dLon = radians(b[1] - a[1]);
  const lat1 = radians(a[0]);
  const lat2 = radians(b[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

function gpsSpeedSamples(samples) {
  const radius = 5;
  const result = [];
  for (let index = 0; index < samples.length; index += 1) {
    const left = samples[Math.max(0, index - radius)];
    const right = samples[Math.min(samples.length - 1, index + radius)];
    const value = numericVector(samples[index].value);
    const leftValue = numericVector(left.value);
    const rightValue = numericVector(right.value);
    const elapsedSec = (right.cts - left.cts) / 1000;
    const dop = value[7];
    const fix = value[8];
    if (elapsedSec <= 0 || leftValue.length < 2 || rightValue.length < 2 || fix < 2 || dop > 4) continue;
    const speedMs = haversineMeters(leftValue, rightValue) / elapsedSec;
    if (!Number.isFinite(speedMs) || speedMs > 60) continue;
    result.push({ cts: samples[index].cts, value: speedMs * 3.6 });
  }
  return result;
}

function projectGyroOntoGravity(gyroscope, gravity) {
  const projected = [];
  for (const sample of gyroscope) {
    const gyro = numericVector(sample.value);
    const gravityVector = interpolateVector(gravity, sample.cts);
    if (gyro.length < 3 || !gravityVector || gravityVector.length < 3) continue;
    const magnitude = Math.hypot(gravityVector[0], gravityVector[1], gravityVector[2]);
    if (magnitude < 1e-6) continue;
    const value = (
      gyro[0] * gravityVector[0]
      + gyro[1] * gravityVector[1]
      + gyro[2] * gravityVector[2]
    ) / magnitude;
    projected.push({ cts: sample.cts, value });
  }
  return projected;
}

function compareChannel(phoneSamples, phoneKey, goproSamples, scale, smoothingWindowMs) {
  const vectorLength = numericVector(goproSamples.find((sample) => numericVector(sample.value).length)?.value).length;
  const candidates = [];
  for (let axis = 0; axis < vectorLength; axis += 1) {
    for (const sign of [1, -1]) {
      for (let step = -50; step <= 50; step += 1) {
        const shiftSec = step / 10;
        const phone = [];
        const gopro = [];
        for (let index = 0; index < phoneSamples.length; index += 6) {
          const sample = phoneSamples[index];
          const phoneValue = sample[phoneKey];
          const vector = averageVector(
            goproSamples,
            sample.videoTimeMs + shiftSec * 1000,
            smoothingWindowMs / 2,
          );
          if (!Number.isFinite(phoneValue) || !vector || !Number.isFinite(vector[axis])) continue;
          phone.push(phoneValue);
          gopro.push(vector[axis] * scale * sign);
        }
        if (phone.length < 100) continue;
        const corr = correlation(phone, gopro);
        const errors = phone.map((value, index) => value - gopro[index]);
        const bias = errors.reduce((sum, value) => sum + value, 0) / errors.length;
        const rmse = Math.sqrt(errors.reduce((sum, value) => sum + value * value, 0) / errors.length);
        const centeredRmse = Math.sqrt(
          errors.reduce((sum, value) => sum + (value - bias) ** 2, 0) / errors.length,
        );
        candidates.push({
          axis,
          sign,
          shiftSec,
          smoothingWindowMs,
          count: phone.length,
          correlation: corr,
          bias,
          rmse,
          centeredRmse,
        });
      }
    }
  }
  return candidates.sort((a, b) => b.correlation - a.correlation)[0] || null;
}

function replaySpeedModel(phoneSamples, dragCoefficient, speedProcessNoise) {
  let speedMs = Math.max(0, (phoneSamples[0]?.appSpeedKmh || 0) / 3.6);
  let variance = 0.04;
  let previousTimeMs = phoneSamples[0]?.videoTimeMs || 0;
  let previousGpsTimestamp = null;
  return phoneSamples.map((sample) => {
    const dt = Math.min(0.12, Math.max(0.005, (sample.videoTimeMs - previousTimeMs) / 1000));
    previousTimeMs = sample.videoTimeMs;
    const transition = Math.max(0, 1 - dragCoefficient * dt);
    speedMs = Math.max(0, speedMs + ((sample.longG || 0) * 9.80665 - dragCoefficient * speedMs) * dt);
    variance = transition * transition * variance + speedProcessNoise * dt;
    if (Number.isFinite(sample.iphoneGpsSpeedKmh)
      && Number.isFinite(sample.gpsTimestampMs)
      && sample.gpsTimestampMs !== previousGpsTimestamp) {
      previousGpsTimestamp = sample.gpsTimestampMs;
      const accuracy = Number.isFinite(sample.gpsAccuracyM) ? sample.gpsAccuracyM : 50;
      const derived = sample.gpsSource === "position";
      const sigma = derived
        ? Math.min(5, Math.max(1.2, accuracy * 0.25))
        : Math.min(3, Math.max(0.4, accuracy * 0.06));
      const gain = variance / (variance + sigma * sigma);
      speedMs = Math.max(0, speedMs + gain * (sample.iphoneGpsSpeedKmh / 3.6 - speedMs));
      variance *= 1 - gain;
    }
    return { ...sample, replaySpeedKmh: speedMs * 3.6 };
  });
}

function evaluateSpeedTuning(phoneSamples, goproSpeed) {
  if (!goproSpeed.length || phoneSamples.filter((sample) => Number.isFinite(sample.gpsTimestampMs)).length < 10) return null;
  const candidates = [];
  for (const dragCoefficient of [0, 0.0025, 0.005, 0.01, 0.015, 0.025]) {
    for (const speedProcessNoise of [0.18, 0.3, 0.45]) {
      const replay = replaySpeedModel(phoneSamples, dragCoefficient, speedProcessNoise);
      const comparison = compareChannel(replay, "replaySpeedKmh", goproSpeed, 1, 1000);
      if (comparison) candidates.push({ dragCoefficient, speedProcessNoise, ...comparison });
    }
  }
  return candidates.sort((a, b) => a.rmse - b.rmse).slice(0, 6);
}

function comparePhoneWithGopro(phone, telemetryStreams) {
  const streamMap = Object.fromEntries(telemetryStreams.map(({ key, stream }) => [key, stream]));
  const acceleration = streamMap.ACCL?.samples || [];
  const gyroscope = streamMap.GYRO?.samples || [];
  const projectedYaw = projectGyroOntoGravity(gyroscope, streamMap.GRAV?.samples || []);
  const gpsSpeed = gpsSpeedSamples(streamMap.GPS9?.samples || streamMap.GPS5?.samples || []);
  return {
    csvStartUtc: phone.csvStartUtc,
    videoStartUtc: phone.videoStartUtc,
    csvZeroAtVideoSec: phone.csvZeroAtVideoSec,
    timingSource: phone.timingSource,
    phoneSampleCount: phone.samples.length,
    events: phone.events.map((event) => ({
      ...event,
      videoTimeSec: event.videoTimeMs / 1000,
      videoTimeMs: undefined,
      goproGpsSpeedKmh: interpolateVector(gpsSpeed, event.videoTimeMs)?.[0] ?? null,
    })),
    longitudinalG: acceleration.length ? compareChannel(phone.samples, "longG", acceleration, 1 / 9.80665, 200) : null,
    lateralG: acceleration.length ? compareChannel(phone.samples, "latG", acceleration, 1 / 9.80665, 200) : null,
    yawRateDps: gyroscope.length ? compareChannel(phone.samples, "yawRateDps", gyroscope, 180 / Math.PI, 100) : null,
    yawRateProjectedDps: projectedYaw.length
      ? compareChannel(phone.samples, "yawRateDps", projectedYaw, 180 / Math.PI, 100)
      : null,
    appSpeedKmh: gpsSpeed.length ? compareChannel(phone.samples, "appSpeedKmh", gpsSpeed, 1, 1000) : null,
    iphoneGpsSpeedKmh: gpsSpeed.length ? compareChannel(phone.samples, "iphoneGpsSpeedKmh", gpsSpeed, 1, 1000) : null,
    speedTuningCandidates: evaluateSpeedTuning(phone.samples, gpsSpeed),
    note: "axis is zero-based in the interpreted GoPro vector; shiftSec is added to mapped video time; centeredRmse excludes the constant sensor/mounting bias.",
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.mp4) throw new Error(`--mp4 is required\n\n${usage()}`);

  const mp4Path = path.resolve(args.mp4);
  const stat = fs.statSync(mp4Path);
  console.error(`Reading ${path.basename(mp4Path)} (${(stat.size / 1024 / 1024).toFixed(1)} MiB)`);
  let extracted;
  try {
    extracted = await gpmfExtract(streamMp4(mp4Path, (percent) => console.error(`  ${percent}%`)));
  } catch (error) {
    if (String(error).includes("terminate")) {
      throw new Error("No gpmd telemetry track found. Use the original GoPro MP4, not a transcoded copy.");
    }
    throw error;
  }
  const streamList = await goproTelemetry(extracted, { streamList: true, tolerant: true });
  const available = findStreams(streamList).map(({ deviceId, deviceName, key, stream }) => ({
    deviceId,
    deviceName,
    key,
    name: stream,
  }));
  const selected = args.streams.filter((key) => available.some((item) => item.key === key));
  const telemetry = selected.length
    ? await goproTelemetry(extracted, { stream: selected, repeatSticky: true, tolerant: true })
    : {};
  const telemetryStreams = findStreams(telemetry);
  const streams = telemetryStreams.map(({ deviceId, deviceName, key, stream }) => ({
    deviceId,
    deviceName,
    key,
    ...summarizeStream(key, stream),
  }));
  const summary = {
    file: mp4Path,
    fileSizeBytes: stat.size,
    videoDurationSec: extracted.timing.videoDuration,
    videoFrameRateHz: extracted.timing.frameDuration ? 1 / extracted.timing.frameDuration : null,
    telemetryStart: extracted.timing.start instanceof Date ? extracted.timing.start.toISOString() : extracted.timing.start,
    gpmfPayloadCount: extracted.timing.samples?.length || 0,
    availableStreams: available,
    streams,
    iphoneComparison: args.csv
      ? (() => {
          const videoStartMs = args.gpx
            ? firstGpxTime(path.resolve(args.gpx))
            : embeddedGpsVideoStart(telemetryStreams);
          if (!Number.isFinite(videoStartMs)) {
            throw new Error("Could not derive UTC video start from GPX or embedded GPS telemetry.");
          }
          return comparePhoneWithGopro(
            loadPhoneSamples(path.resolve(args.csv), videoStartMs, args.gpx ? "gpx" : "embedded-gps"),
            telemetryStreams,
          );
        })()
      : null,
    privacy: "GPS coordinates and full sensor samples are intentionally omitted.",
  };
  const json = `${JSON.stringify(summary, null, 2)}\n`;
  if (args.out) {
    fs.writeFileSync(path.resolve(args.out), json, "utf8");
    console.error(`Wrote ${path.resolve(args.out)}`);
  } else {
    process.stdout.write(json);
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
