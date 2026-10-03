#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ffmpegPath = require("ffmpeg-static");
const WIDTH = 160;
const HEIGHT = 90;
const FRAME_SIZE = WIDTH * HEIGHT;
const EARTH_RADIUS_M = 6371000;

function parseArgs(argv) {
  const args = { fps: 5 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--mp4") args.mp4 = argv[++index];
    else if (arg === "--gpx") args.gpx = argv[++index];
    else if (arg === "--csv") args.csv = argv[++index];
    else if (arg === "--out") args.out = argv[++index];
    else if (arg === "--fps") args.fps = Number(argv[++index]);
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return [
    "Usage:",
    "  node scripts/analyze_video_motion.mjs --mp4 <video.mp4> --gpx <video.gpx>",
    "    [--csv <gym-ana.csv>] [--fps 5] [--out <summary.json>]",
    "",
    "The output contains motion statistics only; no frames or GPS coordinates are saved.",
  ].join("\n");
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function frameDifference(previous, current) {
  let total = 0;
  let count = 0;
  for (let y = 16; y < HEIGHT - 2; y += 2) {
    for (let x = 6; x < WIDTH - 6; x += 2) {
      const index = y * WIDTH + x;
      total += Math.abs(current[index] - previous[index]);
      count += 1;
    }
  }
  return total / count;
}

function patchVariance(frame, centerX, centerY) {
  let total = 0;
  let squareTotal = 0;
  let count = 0;
  for (let y = centerY - 4; y <= centerY + 4; y += 2) {
    for (let x = centerX - 4; x <= centerX + 4; x += 2) {
      const value = frame[y * WIDTH + x];
      total += value;
      squareTotal += value * value;
      count += 1;
    }
  }
  const mean = total / count;
  return squareTotal / count - mean * mean;
}

function patchSad(previous, current, centerX, centerY, dx, dy) {
  let total = 0;
  let count = 0;
  for (let y = -4; y <= 4; y += 2) {
    for (let x = -4; x <= 4; x += 2) {
      total += Math.abs(
        current[(centerY + y) * WIDTH + centerX + x]
        - previous[(centerY + y + dy) * WIDTH + centerX + x + dx],
      );
      count += 1;
    }
  }
  return total / count;
}

function sparseFlow(previous, current) {
  const vectors = [];
  for (const centerY of [28, 46, 64, 80]) {
    for (const centerX of [18, 49, 80, 111, 142]) {
      if (patchVariance(current, centerX, centerY) < 80) continue;
      let best = { error: Infinity, dx: 0, dy: 0 };
      for (let dy = -6; dy <= 6; dy += 1) {
        for (let dx = -6; dx <= 6; dx += 1) {
          const error = patchSad(previous, current, centerX, centerY, dx, dy);
          if (error < best.error) best = { error, dx, dy };
        }
      }
      if (best.error > 45) continue;
      const flowX = -best.dx;
      const flowY = -best.dy;
      const radius = Math.hypot(centerX - WIDTH / 2, centerY - HEIGHT / 2) || 1;
      vectors.push({
        x: flowX,
        y: flowY,
        magnitude: Math.hypot(flowX, flowY),
        expansion: (flowX * (centerX - WIDTH / 2) + flowY * (centerY - HEIGHT / 2)) / radius,
      });
    }
  }
  return {
    trackedBlocks: vectors.length,
    flowMagnitudePx: median(vectors.map((vector) => vector.magnitude)),
    horizontalFlowPx: median(vectors.map((vector) => vector.x)),
    verticalFlowPx: median(vectors.map((vector) => vector.y)),
    expansionPx: median(vectors.map((vector) => vector.expansion)),
  };
}

async function decodeMotion(videoPath, fps) {
  const samples = [];
  let pending = Buffer.alloc(0);
  let previous = null;
  let frameIndex = 0;
  let stderr = "";
  const child = spawn(ffmpegPath, [
    "-hide_banner", "-loglevel", "error", "-i", videoPath, "-an",
    "-vf", `fps=${fps},scale=${WIDTH}:${HEIGHT},format=gray`,
    "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1",
  ], { stdio: ["ignore", "pipe", "pipe"] });

  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  child.stdout.on("data", (chunk) => {
    pending = Buffer.concat([pending, chunk]);
    while (pending.length >= FRAME_SIZE) {
      const current = Buffer.from(pending.subarray(0, FRAME_SIZE));
      pending = pending.subarray(FRAME_SIZE);
      if (previous) {
        samples.push({
          timeSec: frameIndex / fps,
          frameDifference: frameDifference(previous, current),
          ...sparseFlow(previous, current),
        });
      }
      previous = current;
      frameIndex += 1;
    }
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  if (exitCode !== 0) throw new Error(`ffmpeg exited with ${exitCode}: ${stderr.trim()}`);
  return samples;
}

function haversineMeters(a, b) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const dLat = radians(b.lat - a.lat);
  const dLon = radians(b.lon - a.lon);
  const lat1 = radians(a.lat);
  const lat2 = radians(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

function loadGpx(gpxPath) {
  const xml = fs.readFileSync(gpxPath, "utf8");
  const points = [...xml.matchAll(/<trkpt lat="([^"]+)" lon="([^"]+)">[\s\S]*?<time>([^<]+)<\/time>[\s\S]*?<\/trkpt>/g)]
    .map((match) => ({ lat: Number(match[1]), lon: Number(match[2]), epochMs: Date.parse(match[3]) }));
  if (points.length < 5) throw new Error(`Not enough GPX points in ${gpxPath}`);
  const startMs = points[0].epochMs;
  return points.map((point, index) => {
    const left = points[Math.max(0, index - 2)];
    const right = points[Math.min(points.length - 1, index + 2)];
    const elapsedSec = (right.epochMs - left.epochMs) / 1000;
    return {
      timeSec: (point.epochMs - startMs) / 1000,
      speedKmh: elapsedSec > 0 ? haversineMeters(left, right) / elapsedSec * 3.6 : 0,
    };
  });
}

function interpolate(samples, timeSec, key) {
  if (!samples.length || timeSec < samples[0].timeSec || timeSec > samples.at(-1).timeSec) return null;
  let low = 0;
  let high = samples.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (samples[middle].timeSec < timeSec) low = middle + 1;
    else high = middle - 1;
  }
  if (low <= 0) return samples[0]?.[key] ?? null;
  if (low >= samples.length) return samples.at(-1)?.[key] ?? null;
  const left = samples[low - 1];
  const right = samples[low];
  const weight = (timeSec - left.timeSec) / (right.timeSec - left.timeSec);
  return left[key] + (right[key] - left[key]) * weight;
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
  return covariance / Math.sqrt(varianceA * varianceB);
}

function movingAverage(samples, key, radius) {
  return samples.map((_, index) => {
    const values = samples
      .slice(Math.max(0, index - radius), Math.min(samples.length, index + radius + 1))
      .map((sample) => sample[key])
      .filter(Number.isFinite);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  });
}

function optimizeStationaryThreshold(values, speeds) {
  const labeled = values.map((value, index) => ({ value, speed: speeds[index] }))
    .filter(({ value, speed }) => Number.isFinite(value) && (speed <= 1.5 || speed >= 5));
  if (labeled.length < 20) return null;
  const candidates = [...new Set(labeled.map(({ value }) => value))].sort((a, b) => a - b);
  let best = null;
  for (let index = 0; index < candidates.length; index += Math.max(1, Math.floor(candidates.length / 200))) {
    const threshold = candidates[index];
    const stationary = labeled.filter(({ speed }) => speed <= 1.5);
    const moving = labeled.filter(({ speed }) => speed >= 5);
    if (!stationary.length || !moving.length) continue;
    const stationaryRecall = stationary.filter(({ value }) => value <= threshold).length / stationary.length;
    const movingRecall = moving.filter(({ value }) => value > threshold).length / moving.length;
    const balancedAccuracy = (stationaryRecall + movingRecall) / 2;
    if (!best || balancedAccuracy > best.balancedAccuracy) {
      best = { threshold, balancedAccuracy, stationaryRecall, movingRecall, labeledSamples: labeled.length };
    }
  }
  return best;
}

function parseCsvLine(line) {
  const cells = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { cells.push(value); value = ""; }
    else value += char;
  }
  cells.push(value);
  return cells;
}

function loadIphoneEvents(csvPath, videoStartMs, visualSamples, gpxSamples) {
  const match = path.basename(csvPath).match(/(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/);
  if (!match) return [];
  const csvStartMs = Date.parse(`${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`);
  const lines = fs.readFileSync(csvPath, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(lines[0]);
  const column = Object.fromEntries(headers.map((header, index) => [header, index]));
  return lines.slice(1).map(parseCsvLine)
    .filter((cells) => cells[column.section] === "event" && ["START", "STOP"].includes(cells[column.type]))
    .map((cells) => {
      const videoTimeSec = (csvStartMs - videoStartMs + Number(cells[column.time_ms])) / 1000;
      const nearest = visualSamples.reduce((best, sample) => (
        !best || Math.abs(sample.timeSec - videoTimeSec) < Math.abs(best.timeSec - videoTimeSec) ? sample : best
      ), null);
      return {
        type: cells[column.type],
        detail: cells[column.detail],
        videoTimeSec,
        iphoneSpeedKmh: Number(cells[column.speed_kmh]),
        gpsSpeedKmh: interpolate(gpxSamples, videoTimeSec, "speedKmh"),
        frameDifference: videoTimeSec >= visualSamples[0].timeSec && videoTimeSec <= visualSamples.at(-1).timeSec
          ? nearest?.frameDifference ?? null
          : null,
        flowMagnitudePx: videoTimeSec >= visualSamples[0].timeSec && videoTimeSec <= visualSamples.at(-1).timeSec
          ? nearest?.flowMagnitudePx ?? null
          : null,
      };
    });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(usage()); return; }
  if (!args.mp4 || !args.gpx) throw new Error(`--mp4 and --gpx are required\n\n${usage()}`);
  if (!Number.isFinite(args.fps) || args.fps < 1 || args.fps > 15) throw new Error("--fps must be between 1 and 15");

  const videoPath = path.resolve(args.mp4);
  const gpxPath = path.resolve(args.gpx);
  console.error(`Decoding ${path.basename(videoPath)} at ${args.fps} fps (${WIDTH}x${HEIGHT})`);
  const visualSamples = await decodeMotion(videoPath, args.fps);
  const gpxText = fs.readFileSync(gpxPath, "utf8");
  const firstTime = gpxText.match(/<time>([^<]+)<\/time>/)?.[1];
  if (!firstTime) throw new Error(`No GPX time found in ${gpxPath}`);
  const gpxSamples = loadGpx(gpxPath);
  const gpsSpeeds = visualSamples.map((sample) => interpolate(gpxSamples, sample.timeSec, "speedKmh"));
  const radius = Math.max(1, Math.round(args.fps / 2));
  const difference = movingAverage(visualSamples, "frameDifference", radius);
  const flow = movingAverage(visualSamples, "flowMagnitudePx", radius);
  const validDifference = visualSamples.map((_, index) => index).filter((index) => Number.isFinite(difference[index]) && Number.isFinite(gpsSpeeds[index]));
  const validFlow = visualSamples.map((_, index) => index).filter((index) => Number.isFinite(flow[index]) && Number.isFinite(gpsSpeeds[index]));
  const summary = {
    file: videoPath,
    analysisFps: args.fps,
    analysisResolution: { width: WIDTH, height: HEIGHT },
    sampleCount: visualSamples.length,
    durationSec: visualSamples.at(-1)?.timeSec ?? 0,
    gpsComparison: {
      frameDifferenceCorrelation: correlation(validDifference.map((index) => difference[index]), validDifference.map((index) => gpsSpeeds[index])),
      flowMagnitudeCorrelation: correlation(validFlow.map((index) => flow[index]), validFlow.map((index) => gpsSpeeds[index])),
      frameDifferenceStationaryClassifier: optimizeStationaryThreshold(difference, gpsSpeeds),
      flowStationaryClassifier: optimizeStationaryThreshold(flow, gpsSpeeds),
    },
    iphoneEvents: args.csv
      ? loadIphoneEvents(path.resolve(args.csv), Date.parse(firstTime), visualSamples, gpxSamples)
      : [],
    visualSamples,
    privacy: "No video frames or GPS coordinates are included; only derived motion statistics are saved.",
  };
  const json = `${JSON.stringify(summary, null, 2)}\n`;
  if (args.out) {
    fs.writeFileSync(path.resolve(args.out), json, "utf8");
    console.error(`Wrote ${path.resolve(args.out)}`);
  } else process.stdout.write(json);
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
