#!/usr/bin/env python3
"""Plot Gym Ana, iPhone GPS, and GoPro GPX speed on one UTC-aligned chart."""

from __future__ import annotations

import argparse
from pathlib import Path

import html

from analyze_synced_runs import interpolate, load_csv, load_gpx


WIDTH = 1200
HEIGHT = 540
LEFT = 72
RIGHT = 28
TOP = 58
BOTTOM = 58


def svg_path(values: list[float | None], elapsed: list[float], x_scale, y_scale) -> str:
    commands = []
    drawing = False
    for time_sec, value in zip(elapsed, values):
        if value is None:
            drawing = False
            continue
        command = "L" if drawing else "M"
        commands.append(f"{command}{x_scale(time_sec):.1f},{y_scale(value):.1f}")
        drawing = True
    return " ".join(commands)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", required=True, type=Path)
    parser.add_argument("--gpx", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--title", default="Gym Ana speed comparison")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    start, samples, events = load_csv(args.csv)
    points = [point for point in load_gpx(args.gpx) if point["lat"] != 0 and point["lon"] != 0]
    point_times = [point["t"] for point in points]

    elapsed = []
    app_speed = []
    phone_gps = []
    gopro_speed = []
    for sample in samples[::6]:
        reference = interpolate(points, point_times, sample["t"], "speed_ms")
        if reference is None:
            continue
        elapsed.append(sample["t"] - start)
        app_speed.append(sample["app_speed_ms"] * 3.6)
        phone_gps.append(None if sample["gps_speed_ms"] is None else sample["gps_speed_ms"] * 3.6)
        gopro_speed.append(reference * 3.6)

    if not elapsed:
        raise ValueError("CSV and GPX do not overlap")

    plot_width = WIDTH - LEFT - RIGHT
    plot_height = HEIGHT - TOP - BOTTOM
    max_time = max(elapsed)
    all_speeds = app_speed + gopro_speed + [value for value in phone_gps if value is not None]
    max_speed = max(10, ((max(all_speeds) + 9.999) // 10) * 10)
    x_scale = lambda value: LEFT + value / max_time * plot_width
    y_scale = lambda value: TOP + plot_height - value / max_speed * plot_height

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}">',
        '<rect width="100%" height="100%" fill="#ffffff"/>',
        f'<text x="{LEFT}" y="32" font-family="Arial,sans-serif" font-size="20" font-weight="700" fill="#111827">{html.escape(args.title)}</text>',
    ]
    for step in range(6):
        value = max_speed * step / 5
        y = y_scale(value)
        parts.append(f'<line x1="{LEFT}" y1="{y:.1f}" x2="{WIDTH-RIGHT}" y2="{y:.1f}" stroke="#d1d5db"/>')
        parts.append(f'<text x="{LEFT-10}" y="{y+4:.1f}" text-anchor="end" font-family="Arial,sans-serif" font-size="12" fill="#4b5563">{value:.0f}</text>')
    for step in range(7):
        value = max_time * step / 6
        x = x_scale(value)
        parts.append(f'<line x1="{x:.1f}" y1="{TOP}" x2="{x:.1f}" y2="{HEIGHT-BOTTOM}" stroke="#e5e7eb"/>')
        parts.append(f'<text x="{x:.1f}" y="{HEIGHT-BOTTOM+22}" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" fill="#4b5563">{value:.0f}</text>')

    for values, color, width in [
        (gopro_speed, "#111827", 2.4),
        (phone_gps, "#0891b2", 1.8),
        (app_speed, "#dc2626", 1.9),
    ]:
        parts.append(f'<path d="{svg_path(values, elapsed, x_scale, y_scale)}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linejoin="round"/>')

    for event in events:
        if event.get("type") not in {"START", "STOP"}:
            continue
        event_sec = event["time_ms"] / 1000
        if not 0 <= event_sec <= max_time:
            continue
        x = x_scale(event_sec)
        parts.append(f'<line x1="{x:.1f}" y1="{TOP}" x2="{x:.1f}" y2="{HEIGHT-BOTTOM}" stroke="#7c3aed" stroke-width="1.2" stroke-dasharray="6 4"/>')
        parts.append(f'<text x="{x-5:.1f}" y="{TOP+14}" text-anchor="end" font-family="Arial,sans-serif" font-size="11" fill="#7c3aed">{event["type"]}</text>')

    parts.extend([
        f'<text x="{WIDTH/2:.1f}" y="{HEIGHT-12}" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" fill="#374151">Elapsed time from app START (s)</text>',
        f'<text x="18" y="{HEIGHT/2:.1f}" transform="rotate(-90 18 {HEIGHT/2:.1f})" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" fill="#374151">Speed (km/h)</text>',
    ])
    legend_x = WIDTH - RIGHT - 390
    for index, (label, color) in enumerate([("GoPro GPX", "#111827"), ("iPhone GPS", "#0891b2"), ("Gym Ana fused", "#dc2626")]):
        x = legend_x + index * 130
        parts.append(f'<line x1="{x}" y1="31" x2="{x+22}" y2="31" stroke="{color}" stroke-width="3"/>')
        parts.append(f'<text x="{x+28}" y="35" font-family="Arial,sans-serif" font-size="12" fill="#374151">{label}</text>')
    parts.append("</svg>")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text("\n".join(parts), encoding="utf-8")


if __name__ == "__main__":
    main()
