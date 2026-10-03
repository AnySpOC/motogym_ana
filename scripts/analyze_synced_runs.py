#!/usr/bin/env python3
"""Compare Gym Ana speed with an independently recorded GPX track."""

from __future__ import annotations

import argparse
import csv
import json
import math
import re
import statistics
import xml.etree.ElementTree as ET
from bisect import bisect_left
from datetime import datetime, timezone
from pathlib import Path


EARTH_RADIUS_M = 6_371_000.0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", required=True, type=Path)
    parser.add_argument("--gpx", required=True, type=Path)
    parser.add_argument("--video-duration", type=float)
    return parser.parse_args()


def parse_run_start(path: Path) -> float:
    match = re.search(r"(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z", path.name)
    if not match:
        raise ValueError(f"run start is not encoded in {path.name}")
    value = f"{match[1]}T{match[2]}:{match[3]}:{match[4]}.{match[5]}+00:00"
    return datetime.fromisoformat(value).timestamp()


def parse_iso(value: str) -> float:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()


def haversine_m(a: dict, b: dict) -> float:
    lat1 = math.radians(a["lat"])
    lat2 = math.radians(b["lat"])
    dlat = lat2 - lat1
    dlon = math.radians(b["lon"] - a["lon"])
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return EARTH_RADIUS_M * 2 * math.atan2(math.sqrt(h), math.sqrt(max(0, 1 - h)))


def load_gpx(path: Path) -> list[dict]:
    root = ET.parse(path).getroot()
    ns = {"g": "http://www.topografix.com/GPX/1/1"}
    points = []
    for node in root.findall(".//g:trkpt", ns):
        time_node = node.find("g:time", ns)
        if time_node is None or not time_node.text:
            continue
        pdop_node = node.find("g:pdop", ns)
        points.append({
            "t": parse_iso(time_node.text),
            "lat": float(node.attrib["lat"]),
            "lon": float(node.attrib["lon"]),
            "pdop": float(pdop_node.text) if pdop_node is not None and pdop_node.text else None,
        })

    radius = 5
    for index, point in enumerate(points):
        left = points[max(0, index - radius)]
        right = points[min(len(points) - 1, index + radius)]
        dt = right["t"] - left["t"]
        speed = haversine_m(left, right) / dt if dt > 0 else None
        quality_ok = point["pdop"] is None or point["pdop"] <= 4.0
        point["speed_ms"] = speed if quality_ok and speed is not None and speed <= 60 else None
    return points


def number(row: dict, key: str) -> float | None:
    value = row.get(key, "")
    try:
        return float(value) if value != "" else None
    except (TypeError, ValueError):
        return None


def load_csv(path: Path) -> tuple[float, list[dict], list[dict]]:
    start = parse_run_start(path)
    samples = []
    events = []
    with path.open("r", encoding="utf-8-sig", newline="") as stream:
        for row in csv.DictReader(stream):
            time_ms = number(row, "time_ms")
            if time_ms is None:
                continue
            item = {
                "t": start + time_ms / 1000,
                "time_ms": time_ms,
                "app_speed_ms": (number(row, "speed_kmh") or 0) / 3.6,
                "gps_speed_ms": None if number(row, "gps_speed_kmh") is None else number(row, "gps_speed_kmh") / 3.6,
                "long_accel_ms2": (number(row, "long_g") or 0) * 9.80665,
            }
            if row.get("section") == "sample":
                samples.append(item)
            elif row.get("section") == "event":
                item.update({"type": row.get("type"), "detail": row.get("detail")})
                events.append(item)
    return start, samples, events


def interpolate(points: list[dict], times: list[float], target: float, key: str) -> float | None:
    index = bisect_left(times, target)
    if index <= 0 or index >= len(points):
        return None
    left = points[index - 1]
    right = points[index]
    a = left.get(key)
    b = right.get(key)
    if a is None or b is None or right["t"] <= left["t"]:
        return None
    weight = (target - left["t"]) / (right["t"] - left["t"])
    return a + (b - a) * weight


def correlation(a: list[float], b: list[float]) -> float | None:
    if len(a) < 3:
        return None
    mean_a = statistics.fmean(a)
    mean_b = statistics.fmean(b)
    da = [value - mean_a for value in a]
    db = [value - mean_b for value in b]
    denom = math.sqrt(sum(value * value for value in da) * sum(value * value for value in db))
    return sum(x * y for x, y in zip(da, db)) / denom if denom > 0 else None


def compare(samples: list[dict], points: list[dict], offset_sec: float, source_key: str) -> dict | None:
    times = [point["t"] for point in points]
    observed = []
    reference = []
    for sample in samples[::6]:
        source = sample.get(source_key)
        gpx = interpolate(points, times, sample["t"] + offset_sec, "speed_ms")
        if source is None or gpx is None:
            continue
        observed.append(source)
        reference.append(gpx)
    if len(observed) < 20:
        return None
    errors = [value - truth for value, truth in zip(observed, reference)]
    return {
        "count": len(errors),
        "rmse_kmh": math.sqrt(statistics.fmean(error * error for error in errors)) * 3.6,
        "mae_kmh": statistics.fmean(abs(error) for error in errors) * 3.6,
        "bias_kmh": statistics.fmean(errors) * 3.6,
        "correlation": correlation(observed, reference),
    }


def best_offset(samples: list[dict], points: list[dict], source_key: str) -> tuple[float, dict] | tuple[None, None]:
    candidates = []
    for step in range(-50, 51):
        offset = step / 10
        metrics = compare(samples, points, offset, source_key)
        if metrics:
            candidates.append((metrics["rmse_kmh"], offset, metrics))
    if not candidates:
        return None, None
    _, offset, metrics = min(candidates, key=lambda item: item[0])
    return offset, metrics


def iso(timestamp: float) -> str:
    return datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def cadence(samples: list[dict]) -> dict:
    intervals = [b["t"] - a["t"] for a, b in zip(samples, samples[1:]) if b["t"] > a["t"]]
    gps_change_times = []
    previous = None
    for sample in samples:
        value = sample["gps_speed_ms"]
        if value is not None and (previous is None or abs(value - previous) > 1e-6):
            gps_change_times.append(sample["t"])
            previous = value
    gps_intervals = [b - a for a, b in zip(gps_change_times, gps_change_times[1:]) if b > a]
    return {
        "imu_median_hz": 1 / statistics.median(intervals) if intervals else None,
        "imu_p95_interval_ms": sorted(intervals)[min(len(intervals) - 1, int(len(intervals) * 0.95))] * 1000 if intervals else None,
        "imu_max_gap_sec": max(intervals) if intervals else None,
        "imu_gaps_over_0_5_sec": sum(interval > 0.5 for interval in intervals),
        "imu_active_coverage_ratio": min(1, sum(min(interval, 0.1) for interval in intervals) / (samples[-1]["t"] - samples[0]["t"])) if len(samples) > 1 else None,
        "gps_distinct_updates": len(gps_change_times),
        "gps_median_interval_sec": statistics.median(gps_intervals) if gps_intervals else None,
    }


def main() -> None:
    args = parse_args()
    start, samples, events = load_csv(args.csv)
    points = load_gpx(args.gpx)
    gps_offset, gps_metrics = best_offset(samples, points, "gps_speed_ms")
    app_offset, app_metrics = best_offset(samples, points, "app_speed_ms")
    zero_metrics_gps = compare(samples, points, 0, "gps_speed_ms")
    zero_metrics_app = compare(samples, points, 0, "app_speed_ms")
    gpx_start = points[0]["t"]
    gpx_end = points[-1]["t"]
    csv_end = samples[-1]["t"] if samples else start
    result = {
        "csv": str(args.csv),
        "gpx": str(args.gpx),
        "csv_start_utc": iso(start),
        "csv_end_utc": iso(csv_end),
        "csv_duration_sec": csv_end - start,
        "sample_count": len(samples),
        "event_count": len(events),
        "cadence": cadence(samples),
        "gpx_start_utc": iso(gpx_start),
        "gpx_end_utc": iso(gpx_end),
        "gpx_duration_sec": gpx_end - gpx_start,
        "gpx_point_count": len(points),
        "csv_zero_at_video_sec": start - gpx_start,
        "overlap_start_utc": iso(max(start, gpx_start)),
        "overlap_end_utc": iso(min(csv_end, gpx_end)),
        "overlap_sec": max(0, min(csv_end, gpx_end) - max(start, gpx_start)),
        "video_duration_sec": args.video_duration,
        "zero_offset": {"iphone_gps_vs_gpx": zero_metrics_gps, "app_vs_gpx": zero_metrics_app},
        "best_offset": {
            "iphone_gps_shift_sec": gps_offset,
            "iphone_gps_vs_gpx": gps_metrics,
            "app_shift_sec": app_offset,
            "app_vs_gpx": app_metrics,
        },
        "start_values_kmh": {
            "app": samples[0]["app_speed_ms"] * 3.6 if samples else None,
            "iphone_gps": samples[0]["gps_speed_ms"] * 3.6 if samples and samples[0]["gps_speed_ms"] is not None else None,
        },
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
