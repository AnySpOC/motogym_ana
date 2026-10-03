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
    "  [--csv <gym-ana.csv> --gpx <video.gpx>]",
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

function loadPhoneSamples(csvPath, gpxPath) {
  const csvStartMs = parseRunStart(csvPath);
  const gpxText = fs.readFileSync(gpxPath, "utf8");
  const timeMatch = gpxText.match(/<time>([^<]+)<\/time>/);
  if (!timeMatch) throw new Error(`No GPX time found in ${gpxPath}`);
  const videoStartMs = Date.parse(timeMatch[1]);
  const lines = fs.readFileSync(csvPath, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(lines[0]);
  const index = Object.fromEntries(headers.map((header, position) => [header, position]));
  const number = (cells, key) => {
    const value = Number(cells[index[key]]);
    return Number.isFinite(value) ? value : null;
  };
  const samples = [];
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    if (cells[index.section] !== "sample") continue;
    const timeMs = number(cells, "time_ms");
    if (timeMs === null) continue;
    samples.push({
      videoTimeMs: csvStartMs - videoStartMs + timeMs,
      longG: number(cells, "long_g"),
      latG: number(cells, "lat_g"),
      yawRateDps: number(cells, "yaw_rate"),
    });
  }
  return {
    csvStartUtc: new Date(csvStartMs).toISOString(),
    videoStartUtc: new Date(videoStartMs).toISOString(),
    csvZeroAtVideoSec: (csvStartMs - videoStartMs) / 1000,
    samples,
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

function comparePhoneWithGopro(phone, telemetryStreams) {
  const streamMap = Object.fromEntries(telemetryStreams.map(({ key, stream }) => [key, stream]));
  const acceleration = streamMap.ACCL?.samples || [];
  const gyroscope = streamMap.GYRO?.samples || [];
  return {
    csvStartUtc: phone.csvStartUtc,
    videoStartUtc: phone.videoStartUtc,
    csvZeroAtVideoSec: phone.csvZeroAtVideoSec,
    phoneSampleCount: phone.samples.length,
    longitudinalG: acceleration.length ? compareChannel(phone.samples, "longG", acceleration, 1 / 9.80665, 200) : null,
    lateralG: acceleration.length ? compareChannel(phone.samples, "latG", acceleration, 1 / 9.80665, 200) : null,
    yawRateDps: gyroscope.length ? compareChannel(phone.samples, "yawRateDps", gyroscope, 180 / Math.PI, 100) : null,
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
    ? await goproTelemetry(extracted, { stream: selected, repeatSticky: true, timeOut: "cts", tolerant: true })
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
    iphoneComparison: args.csv && args.gpx
      ? comparePhoneWithGopro(loadPhoneSamples(path.resolve(args.csv), path.resolve(args.gpx)), telemetryStreams)
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
