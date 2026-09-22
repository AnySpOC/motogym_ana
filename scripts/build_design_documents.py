from __future__ import annotations

import csv
import math
from pathlib import Path
from statistics import mean, pstdev

from PIL import Image, ImageDraw, ImageFont
from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_ALIGN_VERTICAL, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs" / "assets"
GENERATED = ROOT / "docs" / "generated"
CSV_PATH = Path(r"C:\Users\foxho\Downloads\gym-ana-2026-09-13T04-44-31-036Z.csv")
DESIGN_DOCX = GENERATED / "Gym_Ana_System_Design.docx"
REPORT_DOCX = GENERATED / "Gym_Ana_Data_Analysis_Report.docx"

NAVY = "17365D"
BLUE = "2F75B5"
PALE_BLUE = "EAF2F8"
PALE_GRAY = "F4F6F7"
GRID = "D9D9D9"
TEXT = "202124"
GREEN = "2E8B57"
RED = "C93C3C"
AMBER = "D88A00"

FONT_CANDIDATES = [
    Path(r"C:\Windows\Fonts\YuGothM.ttc"),
    Path(r"C:\Windows\Fonts\meiryo.ttc"),
    Path(r"C:\Windows\Fonts\msgothic.ttc"),
]
FONT_PATH = next((path for path in FONT_CANDIDATES if path.exists()), None)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    if FONT_PATH:
        if bold:
            bold_path = Path(r"C:\Windows\Fonts\YuGothB.ttc")
            if bold_path.exists():
                return ImageFont.truetype(str(bold_path), size)
        return ImageFont.truetype(str(FONT_PATH), size)
    return ImageFont.load_default()


def hex_rgb(value: str) -> tuple[int, int, int]:
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def wrap_text(draw: ImageDraw.ImageDraw, text: str, fnt, max_width: int) -> list[str]:
    lines: list[str] = []
    current = ""
    for char in text:
        candidate = current + char
        if current and draw.textbbox((0, 0), candidate, font=fnt)[2] > max_width:
            lines.append(current)
            current = char
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines or [""]


def draw_centered(draw, box, text, fnt, fill=TEXT, line_gap=6):
    x1, y1, x2, y2 = box
    lines = wrap_text(draw, text, fnt, max(20, x2 - x1 - 24))
    heights = [draw.textbbox((0, 0), line, font=fnt)[3] for line in lines]
    total = sum(heights) + line_gap * (len(lines) - 1)
    y = y1 + (y2 - y1 - total) / 2
    for line, height in zip(lines, heights):
        width = draw.textbbox((0, 0), line, font=fnt)[2]
        draw.text((x1 + (x2 - x1 - width) / 2, y), line, font=fnt, fill=hex_rgb(fill))
        y += height + line_gap


def arrow(draw, start, end, color=NAVY, width=4):
    draw.line([start, end], fill=hex_rgb(color), width=width)
    angle = math.atan2(end[1] - start[1], end[0] - start[0])
    length = 16
    for delta in (2.55, -2.55):
        point = (end[0] + length * math.cos(angle + delta), end[1] + length * math.sin(angle + delta))
        draw.line([end, point], fill=hex_rgb(color), width=width)


def rounded_box(draw, box, text, fill=PALE_BLUE, outline=BLUE, radius=18, title=False):
    draw.rounded_rectangle(box, radius=radius, fill=hex_rgb(fill), outline=hex_rgb(outline), width=3)
    draw_centered(draw, box, text, font(30 if title else 25, bold=title), fill=TEXT)


def save_canvas(name: str, size=(1800, 1050)):
    image = Image.new("RGB", size, "white")
    return image, ImageDraw.Draw(image), ASSETS / name


def create_use_case_diagram():
    image, draw, path = save_canvas("use_case_diagram.png")
    draw.text((60, 35), "Gym Ana ユースケース図", font=font(42, True), fill=hex_rgb(TEXT))
    boundary = (390, 120, 1720, 980)
    draw.rounded_rectangle(boundary, radius=24, outline=hex_rgb(NAVY), width=4)
    draw.text((420, 140), "Gym Ana PWA", font=font(28, True), fill=hex_rgb(NAVY))

    # Rider actor
    cx, cy = 180, 360
    draw.ellipse((cx - 35, cy - 105, cx + 35, cy - 35), outline=hex_rgb(TEXT), width=4)
    draw.line((cx, cy - 35, cx, cy + 90), fill=hex_rgb(TEXT), width=4)
    draw.line((cx - 70, cy + 10, cx + 70, cy + 10), fill=hex_rgb(TEXT), width=4)
    draw.line((cx, cy + 90, cx - 60, cy + 175), fill=hex_rgb(TEXT), width=4)
    draw.line((cx, cy + 90, cx + 60, cy + 175), fill=hex_rgb(TEXT), width=4)
    draw.text((105, cy + 195), "ライダー", font=font(28, True), fill=hex_rgb(TEXT))

    cases = [
        ((520, 225, 920, 340), "センサーを開始する"),
        ((1080, 225, 1510, 340), "静止補正を実行する"),
        ((520, 420, 920, 535), "自動計測を開始する"),
        ((1080, 420, 1510, 535), "手動計測を開始する"),
        ((520, 615, 920, 730), "走行状態を確認する"),
        ((1080, 615, 1510, 730), "走行ログを保存する"),
        ((790, 805, 1240, 920), "CSVとJSONを出力する"),
    ]
    for box, label in cases:
        draw.ellipse(box, fill=hex_rgb(PALE_BLUE), outline=hex_rgb(BLUE), width=3)
        draw_centered(draw, box, label, font(25), fill=TEXT)
        draw.line((250, 370, box[0], (box[1] + box[3]) // 2), fill=hex_rgb("6B7280"), width=2)

    # GPS actor
    rounded_box(draw, (60, 760, 300, 875), "GPS衛星測位", fill=PALE_GRAY, outline="6B7280")
    draw.line((300, 815, 1080, 680), fill=hex_rgb("6B7280"), width=2)
    draw.text((1260, 930), "位置情報は端末内へ保存", font=font(22), fill=hex_rgb("6B7280"))
    image.save(path, quality=95)


def create_architecture_diagram():
    image, draw, path = save_canvas("architecture_diagram.png")
    draw.text((60, 35), "システム構成図", font=font(42, True), fill=hex_rgb(TEXT))
    boxes = [
        ((70, 180, 410, 360), "iPhoneセンサー\n加速度  ジャイロ  GPS", PALE_BLUE),
        ((520, 180, 860, 360), "入力アダプター\nDeviceMotion  Geolocation", PALE_GRAY),
        ((970, 135, 1380, 405), "推定処理\n静止補正\n3D車体軸変換\nEKFとGPS融合", PALE_BLUE),
        ((1490, 180, 1760, 360), "イベント検出\nSTART  STOP\nTURN  BANK", PALE_GRAY),
        ((970, 590, 1380, 810), "走行データ\nRun  Event  Sample", PALE_BLUE),
        ((1450, 590, 1760, 810), "表示\nタイマー  指標\nグラフ  履歴", PALE_GRAY),
        ((500, 590, 850, 810), "端末内保存\nIndexedDB\nCSV  JSON", PALE_GRAY),
        ((80, 590, 390, 810), "オフライン\nService Worker\nPWA Cache v12", PALE_BLUE),
    ]
    for box, label, fill in boxes:
        rounded_box(draw, box, label, fill=fill, outline=BLUE, title=False)
    arrow(draw, (410, 270), (520, 270))
    arrow(draw, (860, 270), (970, 270))
    arrow(draw, (1380, 270), (1490, 270))
    arrow(draw, (1175, 405), (1175, 590))
    arrow(draw, (1380, 700), (1450, 700))
    arrow(draw, (970, 700), (850, 700))
    arrow(draw, (500, 700), (390, 700))
    image.save(path, quality=95)


def create_activity_diagram():
    image, draw, path = save_canvas("activity_diagram.png", (1500, 1450))
    draw.text((55, 30), "自動計測アクティビティ図", font=font(42, True), fill=hex_rgb(TEXT))
    center = 750
    draw.ellipse((center - 18, 105, center + 18, 141), fill=hex_rgb(TEXT))
    steps = [
        ((530, 175, 970, 265), "Sensor ON"),
        ((450, 330, 1050, 430), "Calibrationを押して4秒静止  品質条件を確認"),
        ((550, 500, 950, 590), "Auto待機で発進待ち"),
        ((460, 830, 1040, 930), "START時に速度を0へ初期化して計測開始"),
        ((420, 995, 1080, 1095), "IMU予測と観測更新  GPS速度で補正"),
        ((520, 1260, 980, 1350), "STOPしてIndexedDBへ保存"),
    ]
    for box, label in steps:
        rounded_box(draw, box, label, fill=PALE_BLUE, outline=BLUE)
    arrows = [((center, 141), (center, 175)), ((center, 265), (center, 330)), ((center, 430), (center, 500)),
              ((center, 590), (center, 650)), ((center, 790), (center, 830)), ((center, 930), (center, 995)),
              ((center, 1095), (center, 1150)), ((center, 1230), (center, 1260))]
    for start, end in arrows:
        arrow(draw, start, end)
    # Decisions
    for cy, text in [(720, "前後GがSTARTしきい値を超えたか"), (1190, "停止条件が950 ms続いたか")]:
        diamond = [(center, cy - 70), (center + 190, cy), (center, cy + 70), (center - 190, cy)]
        draw.polygon(diamond, fill=hex_rgb(PALE_GRAY), outline=hex_rgb(NAVY))
        draw_centered(draw, (center - 175, cy - 45, center + 175, cy + 45), text, font(22), fill=TEXT)
    draw.text((965, 682), "いいえ", font=font(20), fill=hex_rgb("6B7280"))
    draw.line((940, 720, 1220, 720, 1220, 545, 950, 545), fill=hex_rgb("6B7280"), width=3)
    draw.text((790, 790), "はい", font=font(20), fill=hex_rgb(GREEN))
    draw.text((965, 1152), "いいえ", font=font(20), fill=hex_rgb("6B7280"))
    draw.line((940, 1190, 1250, 1190, 1250, 1045, 1080, 1045), fill=hex_rgb("6B7280"), width=3)
    draw.text((790, 1235), "はい", font=font(20), fill=hex_rgb(GREEN))
    draw.ellipse((center - 24, 1385, center + 24, 1433), outline=hex_rgb(TEXT), width=4)
    draw.ellipse((center - 14, 1395, center + 14, 1423), fill=hex_rgb(TEXT))
    arrow(draw, (center, 1350), (center, 1385))
    image.save(path, quality=95)


def create_class_diagram():
    image, draw, path = save_canvas("class_diagram.png", (1900, 1250))
    draw.text((60, 35), "論理クラス図", font=font(42, True), fill=hex_rgb(TEXT))

    classes = [
        ((70, 150, 570, 500), "AppState", ["mode", "speedMs", "longG  latG", "gpsSpeedMs", "calibration", "events  samples"], ["resetLiveSensorValues()"]),
        ((700, 130, 1240, 535), "MotionEkf", ["x[5]", "P[5][5]", "Q  R"], ["predict(dt)", "correct(measurement)", "updateGpsSpeed()", "zeroSpeed()"]),
        ((1370, 150, 1830, 500), "SensorController", ["DeviceMotion", "DeviceOrientation"], ["requestSensors()", "onDeviceMotion()", "startCalibration()"]),
        ((80, 710, 560, 1080), "GpsController", ["watchId", "lastPosition", "accuracy"], ["startGps()", "onGpsPosition()", "stopGps()"]),
        ((710, 705, 1230, 1100), "RunRepository", ["DB moto-gym-ana", "Store runs"], ["openDb()", "dbPut()", "dbGetAll()", "runToCsv()"]),
        ((1370, 690, 1840, 1120), "Run", ["id", "startedAtIso", "durationMs", "calibration", "summary", "events[]", "samples[]"], ["buildCurrentRun()", "buildRun()"]),
    ]

    for box, name, attrs, methods in classes:
        x1, y1, x2, y2 = box
        draw.rectangle(box, fill="white", outline=hex_rgb(NAVY), width=3)
        header_h = 64
        draw.rectangle((x1, y1, x2, y1 + header_h), fill=hex_rgb(NAVY))
        draw_centered(draw, (x1, y1, x2, y1 + header_h), name, font(27, True), fill="FFFFFF")
        split = y1 + header_h + (y2 - y1 - header_h) * 0.48
        draw.line((x1, split, x2, split), fill=hex_rgb(GRID), width=2)
        y = y1 + header_h + 16
        for attr in attrs:
            draw.text((x1 + 20, y), f"- {attr}", font=font(20), fill=hex_rgb(TEXT))
            y += 31
        y = split + 15
        for method in methods:
            draw.text((x1 + 20, y), f"+ {method}", font=font(20), fill=hex_rgb(TEXT))
            y += 32

    arrow(draw, (570, 320), (700, 320))
    draw.text((592, 280), "保持", font=font(20), fill=hex_rgb("6B7280"))
    arrow(draw, (1370, 320), (1240, 320))
    draw.text((1260, 280), "更新", font=font(20), fill=hex_rgb("6B7280"))
    arrow(draw, (560, 860), (710, 860))
    draw.text((585, 820), "補正", font=font(20), fill=hex_rgb("6B7280"))
    arrow(draw, (1230, 880), (1370, 880))
    draw.text((1260, 840), "保存", font=font(20), fill=hex_rgb("6B7280"))
    arrow(draw, (955, 535), (955, 705))
    draw.text((975, 600), "推定結果", font=font(20), fill=hex_rgb("6B7280"))
    image.save(path, quality=95)


def create_state_diagram():
    image, draw, path = save_canvas("state_transition_diagram.png", (1800, 1050))
    draw.text((60, 35), "状態遷移図", font=font(42, True), fill=hex_rgb(TEXT))
    states = {
        "idle": (70, 170, 350, 300),
        "sensor-on": (540, 160, 900, 310),
        "armed": (1090, 160, 1450, 310),
        "calibrating": (70, 520, 430, 680),
        "stopped": (540, 520, 900, 680),
        "running": (1090, 510, 1450, 680),
        "sensor-off": (540, 840, 900, 970),
    }
    labels = {
        "idle": "idle\n初期待機", "calibrating": "calibrating\n明示的な4秒補正", "sensor-on": "sensor-on\n取得中",
        "armed": "armed\n発進待ち", "running": "running\n計測中", "stopped": "stopped\n計測完了", "sensor-off": "sensor-off\n停止",
    }
    for key, box in states.items():
        rounded_box(draw, box, labels[key], fill=PALE_BLUE if key in {"calibrating", "running", "armed"} else PALE_GRAY, outline=BLUE)

    arrow(draw, (350, 235), (540, 235), color="6B7280", width=3)
    draw_centered(draw, (365, 195, 525, 225), "Sensor ON", font(18), fill=TEXT)
    arrow(draw, (900, 235), (1090, 235), color="6B7280", width=3)
    draw_centered(draw, (920, 195, 1070, 225), "Auto待機", font(18), fill=TEXT)
    arrow(draw, (1270, 310), (1270, 510), color="6B7280", width=3)
    draw.text((1290, 390), "START検出", font=font(18), fill=hex_rgb(TEXT))
    arrow(draw, (1090, 595), (900, 595), color="6B7280", width=3)
    draw_centered(draw, (900, 555, 1090, 585), "停止根拠を確認", font(17), fill=TEXT)
    arrow(draw, (720, 520), (720, 310), color="6B7280", width=3)
    draw.text((740, 400), "次の計測", font=font(18), fill=hex_rgb(TEXT))

    draw.line((540, 255, 360, 255, 360, 480), fill=hex_rgb("6B7280"), width=3)
    arrow(draw, (360, 480), (360, 520), color="6B7280", width=3)
    draw.text((375, 380), "Calibration", font=font(18), fill=hex_rgb(TEXT))
    draw.line((250, 520, 250, 350, 620, 350, 620, 310), fill=hex_rgb("6B7280"), width=3)
    arrow(draw, (620, 350), (620, 310), color="6B7280", width=3)
    draw.text((275, 315), "成功または失敗", font=font(18), fill=hex_rgb(TEXT))

    draw.line((900, 275, 1010, 275, 1010, 555, 1090, 555), fill=hex_rgb("6B7280"), width=3)
    arrow(draw, (1010, 555), (1090, 555), color="6B7280", width=3)
    draw.text((920, 330), "手動開始", font=font(18), fill=hex_rgb(TEXT))

    arrow(draw, (720, 680), (720, 840), color=RED, width=3)
    draw.text((745, 745), "Sensor OFF", font=font(19, True), fill=hex_rgb(RED))
    draw.text((1030, 895), "各状態からSensor OFFへ遷移可能", font=font(20), fill=hex_rgb(RED))
    image.save(path, quality=95)


def read_data():
    with CSV_PATH.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    samples = [row for row in rows if row.get("section") == "sample"]
    events = [row for row in rows if row.get("section") == "event"]
    return samples, events


def values(samples, key):
    return [float(row[key]) for row in samples]


def chart_axes(draw, title, x_label, y_label, y_min, y_max, width=1800, height=960):
    draw.text((55, 30), title, font=font(40, True), fill=hex_rgb(TEXT))
    plot = (150, 130, width - 80, height - 130)
    x1, y1, x2, y2 = plot
    draw.rectangle(plot, outline=hex_rgb("6B7280"), width=2)
    for i in range(6):
        y = y1 + (y2 - y1) * i / 5
        value = y_max - (y_max - y_min) * i / 5
        draw.line((x1, y, x2, y), fill=hex_rgb("E5E7EB"), width=2)
        draw.text((40, y - 13), f"{value:.1f}", font=font(18), fill=hex_rgb("6B7280"))
    draw.text(((x1 + x2) / 2 - 45, height - 75), x_label, font=font(22), fill=hex_rgb(TEXT))
    draw.text((25, 90), y_label, font=font(22), fill=hex_rgb(TEXT))
    return plot


def plot_series(draw, plot, xs, ys, x_min, x_max, y_min, y_max, color, width=4):
    x1, y1, x2, y2 = plot
    points = []
    for x, y in zip(xs, ys):
        px = x1 + (x - x_min) / max(1e-9, x_max - x_min) * (x2 - x1)
        py = y2 - (y - y_min) / max(1e-9, y_max - y_min) * (y2 - y1)
        points.append((px, py))
    if len(points) > 1:
        draw.line(points, fill=hex_rgb(color), width=width, joint="curve")


def legend(draw, items, x=1330, y=65):
    for label, color in items:
        draw.line((x, y + 12, x + 42, y + 12), fill=hex_rgb(color), width=5)
        draw.text((x + 55, y), label, font=font(20), fill=hex_rgb(TEXT))
        y += 38


def create_analysis_charts(samples):
    times = values(samples, "time_ms")
    times = [(value - times[0]) / 1000 for value in times]
    speed = values(samples, "speed_kmh")
    long_g = values(samples, "long_g")
    lat_g = values(samples, "lat_g")
    long_var = values(samples, "long_g_variance")
    lat_var = values(samples, "lat_g_variance")
    kalman = values(samples, "kalman_variance")

    image, draw, path = save_canvas("speed_time_chart.png", (1800, 960))
    plot = chart_axes(draw, "推定速度の時系列", "STARTからの時間 s", "速度 km/h", 0, 22)
    plot_series(draw, plot, times, speed, min(times), max(times), 0, 22, BLUE, 5)
    draw.line((plot[0], plot[3], plot[2], plot[3]), fill=hex_rgb("6B7280"), width=2)
    legend(draw, [("旧版推定速度", BLUE)])
    draw.text((170, 850), "最初のサンプルが11.157 km/hで、START時にゼロから始まっていない", font=font(24, True), fill=hex_rgb(RED))
    image.save(path, quality=95)

    image, draw, path = save_canvas("g_time_chart.png", (1800, 960))
    plot = chart_axes(draw, "前後Gと左右Gの時系列", "STARTからの時間 s", "加速度 G", -0.1, 0.4)
    plot_series(draw, plot, times, long_g, min(times), max(times), -0.1, 0.4, GREEN, 4)
    plot_series(draw, plot, times, lat_g, min(times), max(times), -0.1, 0.4, AMBER, 4)
    legend(draw, [("前後G", GREEN), ("左右G", AMBER)])
    draw.text((170, 850), "左右Gは全区間で0.0687 G以上となり、静止判定しきい値0.040 Gを下回らない", font=font(23, True), fill=hex_rgb(RED))
    image.save(path, quality=95)

    implied = [0.0]
    residual = [0.0]
    for i in range(1, len(samples)):
        dt = (float(samples[i]["time_ms"]) - float(samples[i - 1]["time_ms"])) / 1000
        if dt <= 0:
            implied.append(implied[-1])
            residual.append(0.0)
            continue
        v0 = float(samples[i - 1]["speed_kmh"]) / 3.6
        v1 = float(samples[i]["speed_kmh"]) / 3.6
        implied.append((v1 - v0) / dt / 9.80665)
        pred = max(0, v0 + (float(samples[i - 1]["long_g"]) * 9.80665 - 0.025 * v0) * dt)
        residual.append((v1 - pred) * 3.6)

    clipped_implied = [max(-10, min(10, value)) for value in implied]
    image, draw, path = save_canvas("speed_consistency_chart.png", (1800, 960))
    plot = chart_axes(draw, "速度差分から逆算した加速度", "STARTからの時間 s", "加速度 G", -10, 10)
    plot_series(draw, plot, times, clipped_implied, min(times), max(times), -10, 10, RED, 3)
    plot_series(draw, plot, times, long_g, min(times), max(times), -10, 10, GREEN, 5)
    legend(draw, [("速度差分から逆算", RED), ("記録前後G", GREEN)])
    draw.text((170, 850), "逆算加速度は最大9.716 G  記録前後Gでは速度変化を説明できない", font=font(24, True), fill=hex_rgb(RED))
    image.save(path, quality=95)

    image, draw, path = save_canvas("variance_chart.png", (1800, 960))
    plot = chart_axes(draw, "分散とKalman Pの時系列", "STARTからの時間 s", "分散指標", 0, 1.35)
    plot_series(draw, plot, times, long_var, min(times), max(times), 0, 1.35, GREEN, 3)
    plot_series(draw, plot, times, lat_var, min(times), max(times), 0, 1.35, AMBER, 3)
    plot_series(draw, plot, times, kalman, min(times), max(times), 0, 1.35, BLUE, 4)
    legend(draw, [("前後G分散", GREEN), ("左右G分散", AMBER), ("Kalman P", BLUE)])
    image.save(path, quality=95)

    return implied, residual


def set_cell_shading(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_border(cell, color=GRID, size="6"):
    tc_pr = cell._tc.get_or_add_tcPr()
    borders = tc_pr.first_child_found_in("w:tcBorders")
    if borders is None:
        borders = OxmlElement("w:tcBorders")
        tc_pr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        tag = "w:" + edge
        element = borders.find(qn(tag))
        if element is None:
            element = OxmlElement(tag)
            borders.append(element)
        element.set(qn("w:val"), "single")
        element.set(qn("w:sz"), size)
        element.set(qn("w:color"), color)


def set_cell_margins(cell, top=100, start=120, bottom=100, end=120):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for margin, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{margin}"))
        if node is None:
            node = OxmlElement(f"w:{margin}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def add_page_number(paragraph):
    paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    run = paragraph.add_run()
    begin = OxmlElement("w:fldChar")
    begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = " PAGE "
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    run._r.extend([begin, instr, end])


def configure_document(doc: Document, short_title: str):
    section = doc.sections[0]
    section.page_width = Inches(8.5)
    section.page_height = Inches(11)
    section.top_margin = Inches(0.72)
    section.bottom_margin = Inches(0.68)
    section.left_margin = Inches(0.78)
    section.right_margin = Inches(0.78)

    styles = doc.styles
    normal = styles["Normal"]
    normal.font.name = "Yu Gothic"
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), "游ゴシック")
    normal.font.size = Pt(10.5)
    normal.font.color.rgb = RGBColor.from_string(TEXT)
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.18

    title = styles["Title"]
    title.font.name = "Yu Gothic"
    title._element.rPr.rFonts.set(qn("w:eastAsia"), "游ゴシック")
    title.font.size = Pt(26)
    title.font.bold = True
    title.font.color.rgb = RGBColor(0, 0, 0)
    title.paragraph_format.space_after = Pt(12)
    title_ppr = title.element.get_or_add_pPr()
    title_border = title_ppr.find(qn("w:pBdr"))
    if title_border is not None:
        title_ppr.remove(title_border)

    for name, size, before, after in (("Heading 1", 17, 15, 7), ("Heading 2", 13, 12, 5), ("Heading 3", 11, 9, 4)):
        style = styles[name]
        style.font.name = "Yu Gothic"
        style._element.rPr.rFonts.set(qn("w:eastAsia"), "游ゴシック")
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = RGBColor(0, 0, 0)
        style.paragraph_format.space_before = Pt(before)
        style.paragraph_format.space_after = Pt(after)
        style.paragraph_format.keep_with_next = True

    header = section.header.paragraphs[0]
    header.text = short_title
    header.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    header.runs[0].font.name = "Yu Gothic"
    header.runs[0].font.size = Pt(8.5)
    header.runs[0].font.color.rgb = RGBColor.from_string("6B7280")
    add_page_number(section.footer.paragraphs[0])


def add_cover(doc, title, subtitle, version, source=None):
    p = doc.add_paragraph(style="Title")
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(95)
    p.add_run(title)
    sub = doc.add_paragraph()
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sub.paragraph_format.space_before = Pt(12)
    run = sub.add_run(subtitle)
    run.font.size = Pt(14)
    run.font.color.rgb = RGBColor.from_string("4B5563")
    meta = doc.add_paragraph()
    meta.alignment = WD_ALIGN_PARAGRAPH.CENTER
    meta.paragraph_format.space_before = Pt(55)
    meta.add_run(f"対象版  {version}\n作成日  2026年9月20日")
    if source:
        meta.add_run(f"\n解析対象  {source}")
    doc.add_paragraph().paragraph_format.space_before = Pt(130)
    note = doc.add_paragraph("モトジムカーナ走行計測 PWA")
    note.alignment = WD_ALIGN_PARAGRAPH.CENTER
    note.runs[0].font.size = Pt(12)
    note.runs[0].font.bold = True
    doc.add_page_break()


def add_heading(doc, text, level=1):
    return doc.add_heading(text, level=level)


def add_para(doc, text, bold_lead=None):
    p = doc.add_paragraph()
    if bold_lead and text.startswith(bold_lead):
        p.add_run(bold_lead).bold = True
        p.add_run(text[len(bold_lead):])
    else:
        p.add_run(text)
    return p


def add_bullets(doc, items):
    for item in items:
        p = doc.add_paragraph(style="List Bullet")
        p.paragraph_format.space_after = Pt(3)
        p.add_run(item)


def add_numbered(doc, items):
    for item in items:
        p = doc.add_paragraph(style="List Number")
        p.paragraph_format.space_after = Pt(3)
        p.add_run(item)


def add_table(doc, headers, rows, widths=None, font_size=9):
    table = doc.add_table(rows=1, cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    table.rows[0]._tr.get_or_add_trPr().append(OxmlElement("w:tblHeader"))
    for idx, header in enumerate(headers):
        cell = table.rows[0].cells[idx]
        cell.text = str(header)
        set_cell_shading(cell, NAVY)
        set_cell_border(cell)
        set_cell_margins(cell)
        cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
        for paragraph in cell.paragraphs:
            paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
            for run in paragraph.runs:
                run.font.bold = True
                run.font.color.rgb = RGBColor(255, 255, 255)
                run.font.size = Pt(font_size)
    for row_idx, values_row in enumerate(rows):
        cells = table.add_row().cells
        for col_idx, value in enumerate(values_row):
            cell = cells[col_idx]
            cell.text = str(value)
            set_cell_border(cell)
            set_cell_margins(cell)
            cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
            if row_idx % 2:
                set_cell_shading(cell, PALE_GRAY)
            for paragraph in cell.paragraphs:
                paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER if col_idx == 0 or isinstance(value, (int, float)) else WD_ALIGN_PARAGRAPH.LEFT
                for run in paragraph.runs:
                    run.font.size = Pt(font_size)
    if widths:
        for row in table.rows:
            for idx, width in enumerate(widths):
                row.cells[idx].width = Inches(width)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)
    return table


def add_figure(doc, image_path, caption, width=6.7):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.keep_with_next = True
    picture = p.add_run().add_picture(str(image_path), width=Inches(width))
    picture._inline.docPr.set("title", caption)
    picture._inline.docPr.set("descr", caption)
    cap = doc.add_paragraph(caption)
    cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
    cap.paragraph_format.space_after = Pt(9)
    cap.paragraph_format.keep_with_next = False
    for run in cap.runs:
        run.font.size = Pt(9)
        run.font.color.rgb = RGBColor.from_string("4B5563")


def add_code_block(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Inches(0.28)
    p.paragraph_format.right_indent = Inches(0.28)
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(8)
    run = p.add_run(text)
    run.font.name = "Consolas"
    run.font.size = Pt(9)
    shading = OxmlElement("w:shd")
    shading.set(qn("w:fill"), PALE_GRAY)
    p._p.get_or_add_pPr().append(shading)


def build_design_doc():
    doc = Document()
    configure_document(doc, "Gym Ana システム設計書")
    add_cover(doc, "Gym Ana システム設計書", "iPhoneセンサーとGPSによる走行計測", "f59a182")

    add_heading(doc, "文書の目的", 1)
    add_para(doc, "本書は、Gym Anaの要求、利用手順、構成、状態推定、データ保存、試験方法を実装と対応づけて説明する。開発者は変更時の影響範囲を確認でき、試験者はキャリブレーションと実走評価の条件を確認できる。")
    add_para(doc, "現行版は、端末取付角を3軸で補正し、IMU積分速度をGPS速度で修正する。公式計時や安全制御には使用しない。", bold_lead="現行版")

    add_heading(doc, "対象範囲", 1)
    add_table(doc, ["項目", "内容"], [
        ["対象", "iPhone Safariおよびホーム画面へ追加したPWA"],
        ["公開先", "https://anyspoc.github.io/motogym_ana/"],
        ["主機能", "発進停止検出  タイム計測  Gと姿勢推定  GPS速度補正  ログ保存"],
        ["対象外", "公道用速度計  競技公式計時  転倒判定  車体制御"],
    ], widths=[1.25, 5.45])

    add_heading(doc, "ユースケース", 1)
    add_figure(doc, ASSETS / "use_case_diagram.png", "図1  Gym Ana ユースケース図")
    add_table(doc, ["ID", "ユースケース", "事前条件", "結果"], [
        ["UC01", "センサー開始", "HTTPSで画面を開いている", "モーションと位置情報の取得を開始する"],
        ["UC02", "静止補正", "端末を車体へ固定している", "加速度オフセットと重力方向を記録する"],
        ["UC03", "自動計測", "補正が完了している", "発進と停止を検出して走行を保存する"],
        ["UC04", "手動計測", "補正が完了している", "操作時刻でSTARTとSTOPを記録する"],
        ["UC05", "ログ出力", "走行が保存されている", "CSVまたはJSONをダウンロードする"],
    ], widths=[0.65, 1.25, 2.15, 2.65], font_size=8.5)

    doc.add_page_break()
    add_heading(doc, "機能要求", 1)
    add_table(doc, ["ID", "要求"], [
        ["FR01", "Sensor ONとOFFでセンサー取得を開始および停止できる"],
        ["FR02", "Sensor OFF中は計測値をゼロまたは未取得状態にする"],
        ["FR03", "Calibration操作で4秒補正を開始し成功または失敗理由を表示する"],
        ["FR04", "Auto待機とAuto解除で自動発進待ちを制御する"],
        ["FR05", "手動開始と計測停止で計測を明示的に制御する"],
        ["FR06", "発進 停止 加速 減速 旋回 バンクを検出する"],
        ["FR07", "GPSが利用可能な場合は推定速度を補正する"],
        ["FR08", "走行をIndexedDBへ保存しCSVとJSONで出力する"],
        ["FR09", "一度読み込んだ後はオフラインで起動できる"],
    ], widths=[0.8, 5.9])

    add_heading(doc, "システム構成", 1)
    add_figure(doc, ASSETS / "architecture_diagram.png", "図2  センサー入力から保存までのシステム構成")
    add_table(doc, ["ファイル", "責務"], [
        ["index.html", "操作 状態 指標 グラフ 履歴の画面構造"],
        ["styles.css", "iPhoneとPC向けレスポンシブ表示"],
        ["app.js", "センサー 補正 EKF GPS融合 検出 保存 出力"],
        ["sw.js", "アプリシェルのオフラインキャッシュ"],
        ["manifest.webmanifest", "ホーム画面追加用PWA情報"],
        ["motion-model.test.mjs", "推定器とCSV形式の回帰テスト"],
    ], widths=[2.0, 4.7])

    add_heading(doc, "自動計測処理", 1)
    add_figure(doc, ASSETS / "activity_diagram.png", "図3  自動計測アクティビティ図", width=5.75)
    add_para(doc, "Auto待機は発進待ちを作る。最初の明確な水平加速で車体前方向を確定し、前後Gが感度しきい値を140 ms継続して超えるとSTARTする。手動開始は操作時刻から直ちに計測する。計測停止はどちらの方式でも走行を終了して保存する。")

    add_heading(doc, "状態管理", 1)
    add_figure(doc, ASSETS / "state_transition_diagram.png", "図4  主要な状態遷移")
    add_table(doc, ["状態", "内容", "主な遷移"], [
        ["idle", "初期待機", "Sensor ONでsensor-on"],
        ["calibrating", "明示的な4秒静止補正", "成功または失敗後sensor-on"],
        ["sensor-on", "センサー取得中", "Calibration Auto待機 手動開始"],
        ["armed", "自動発進待ち", "START検出でrunning"],
        ["running", "計測中", "自動停止または計測停止"],
        ["stopped", "計測完了 保存済み", "次の計測またはSensor OFF"],
        ["sensor-off", "センサー停止", "Sensor ONでsensor-on"],
    ], widths=[1.1, 2.2, 3.4], font_size=8.5)

    add_heading(doc, "論理クラス構成", 1)
    add_figure(doc, ASSETS / "class_diagram.png", "図5  JavaScript実装を論理責務へ整理したクラス図")
    add_para(doc, "実装は単一のapp.jsを中心とするが、本図では保守時の責務を明確にするため論理クラスへ分解している。MotionEkfだけが実クラスであり、その他は状態オブジェクトと関数群で構成される。")

    add_heading(doc, "センサーと座標変換", 1)
    add_heading(doc, "入力値", 2)
    add_table(doc, ["入力", "単位", "用途"], [
        ["acceleration", "m/s2", "重力を除いた3軸加速度"],
        ["accelerationIncludingGravity", "m/s2", "静止重力方向とバンク推定"],
        ["rotationRate.alpha", "deg/s", "ヨーレート"],
        ["Geolocation speed", "m/s", "速度観測"],
        ["Geolocation accuracy", "m", "GPS観測ノイズと採否"],
    ], widths=[2.25, 1.0, 3.45])

    add_heading(doc, "静止キャリブレーション", 2)
    add_para(doc, "Sensor ONは取得だけを開始する。Calibration操作後の4秒間で加速度とヨーレートの平均を計算し、重力を含む加速度の平均を正規化して端末座標上の重力方向とする。")
    add_code_block(doc, "b_a = mean([a_x, a_y, a_z])\nb_w = mean(yaw_rate)\ng_d = normalize(mean(accelerationIncludingGravity))")
    add_para(doc, "完了条件は15 Hz以上かつ60サンプル以上、平均加速度0.12 G以下、重力0.75から1.25 G、前半と後半の重力方向差7度以下、振動RMS 0.6 G以下とする。条件外はfailed状態とし理由を表示する。")
    add_heading(doc, "エンジン振動除去", 2)
    add_para(doc, "補正済み3軸加速度は、車体軸決定、イベント判定、速度積分の前に時定数0.08秒の一次低域通過フィルタへ通す。自動STARTは前後Gがしきい値を140 ms継続した場合に成立させ、開始時刻は継続判定の先頭へ戻す。確認区間の加速度は仮積分して現在速度へ引き継ぐ。静止補正はSTART待機時と同じエンジンアイドリング状態で行う。")
    add_code_block(doc, "alpha = 1 - exp(-dt / 0.08)\na_lp = a_lp + alpha * (a_c - a_lp)\nvibration = a_c - a_lp")
    add_heading(doc, "車体座標", 2)
    add_code_block(doc, "a_h = a_c - dot(a_c, g_d) * g_d\ne_forward = normalize(a_h)\ne_lateral = normalize(cross(g_d, e_forward))\nlong_g = dot(a_c, e_forward)\nlat_g = dot(a_c, e_lateral)")
    add_para(doc, "最初の水平加速が0.08 G以上になった時点で前方向を固定する。取付後に端末が動いた場合は再度Sensor ONを実行する。")

    add_heading(doc, "状態推定", 1)
    add_heading(doc, "状態ベクトル", 2)
    add_code_block(doc, "x = [v, a_long, a_lat, yaw_rate, bank]^T")
    add_heading(doc, "物理モデル", 2)
    add_code_block(doc, "a_drive = 0.75 * measured_long_g + 0.25 * a_long\nv_k = max(0, v + (a_drive * 9.80665 - 0.025 * v) * dt)\na_long_k = a_long * exp(-dt / 0.7)\na_lat_k = a_lat * exp(-dt / 0.7)\nyaw_k = yaw * exp(-dt / 0.5)\nbank_k = bank + blend * (atan(a_lat) - bank)")
    add_para(doc, "現在サンプルの前後Gを同じ周期の速度更新へ75パーセント反映し、従来の1周期遅れを減らす。速度プロセスノイズは0.18 dtとする。dtは0.005秒から0.12秒へ制限する。")
    add_heading(doc, "IMU観測", 2)
    add_code_block(doc, "z_imu = [measured_long_g, measured_lat_g, measured_yaw_rate, measured_bank]^T\ny = z - Hx\nS = HPH^T + R\nK = PH^T S^-1\nx = x + Ky\nP = (I - KH)P")
    add_heading(doc, "GPS速度観測", 2)
    add_para(doc, "GPSの直接速度があればスカラー観測として速度状態を更新する。直接速度がない場合は連続する位置のHaversine距離から速度を算出する。水平精度が50 mを超える測位と90 m/sを超える値は採用しない。")
    add_code_block(doc, "H_gps = [1, 0, 0, 0, 0]\nsigma_direct = clamp(accuracy * 0.06, 0.4, 3.0)\nsigma_position = clamp(accuracy * 0.25, 1.2, 5.0)")
    add_heading(doc, "ゼロ速度更新", 2)
    add_para(doc, "低運動状態だけでは等速走行と停止を区別できない。450 msの低運動に加え、2.5秒以内のGPSが0.8 m/s未満、またはGPSなしで速度0.35 m/s未満かつ3.5秒以内に減速を検出した場合だけ速度を0へ拘束する。")

    add_heading(doc, "イベント判定", 1)
    add_table(doc, ["感度", "START G", "加速 G", "減速 G", "旋回 deg/s", "バンク deg", "deadband G"], [
        ["低", "0.26", "0.32", "-0.34", "48", "24", "0.035"],
        ["標準", "0.20", "0.26", "-0.30", "40", "20", "0.025"],
        ["高", "0.14", "0.19", "-0.22", "30", "15", "0.014"],
    ], widths=[0.75, 0.85, 0.85, 0.85, 1.15, 1.0, 1.05], font_size=8)
    add_para(doc, "自動停止は低運動状態に加え、GPS停止または低速かつ直前の減速という停止根拠が950 ms続き、START後1.5秒以上経過した場合に成立する。")

    add_heading(doc, "データ設計", 1)
    add_code_block(doc, "Run\n  id\n  startedAtIso  endedAtIso  durationMs\n  calibration\n  summary\n  events[]\n  samples[]")
    add_table(doc, ["項目", "単位", "内容"], [
        ["timeMs", "ms", "STARTからの経過時間"],
        ["longG  latG", "G", "EKF後の前後と左右加速度"],
        ["speedKmh", "km/h", "IMUとGPSを融合した速度"],
        ["gpsSpeedKmh", "km/h", "GPS観測速度"],
        ["gpsAccuracyM", "m", "GPS水平精度"],
        ["latitude  longitude", "deg", "GPS位置"],
        ["bankDeg  yawRate", "deg  deg/s", "姿勢と旋回"],
        ["vibrationG", "G", "除去した高周波振動のRMS"],
        ["variance", "各状態", "G分散とKalman P"],
    ], widths=[2.0, 1.15, 3.55], font_size=8.5)

    add_heading(doc, "保存とオフライン", 1)
    add_bullets(doc, [
        "IndexedDBのDB名はmoto-gym-ana、ストア名はrunsとする。",
        "STOP時に走行データを自動保存する。",
        "1走行の上限は20,000サンプルで、60 Hzでは約5.6分に相当する。",
        "Service Workerはmoto-gym-ana-v12としてアプリシェルをキャッシュする。",
        "iOSがWebデータを削除する場合に備え、重要データはJSONで退避する。",
    ])

    add_heading(doc, "エラー処理", 1)
    add_table(doc, ["事象", "処理", "利用者への表示"], [
        ["モーション権限拒否", "取得を開始しない", "許可が必要"],
        ["GPS拒否またはタイムアウト", "IMU推定を継続", "GPS未取得"],
        ["GPS精度50 m超", "速度観測へ使用しない", "精度値を表示"],
        ["IndexedDB失敗", "画面処理を継続", "自動保存不可"],
        ["Sensor OFF", "リスナーとGPS watchを解除", "計測値をゼロ化"],
    ], widths=[1.7, 2.5, 2.5], font_size=8.5)

    add_heading(doc, "試験方針", 1)
    add_heading(doc, "自動試験", 2)
    add_bullets(doc, [
        "静止した4秒補正はcomplete、補正中に動かすとfailedになる。",
        "STARTイベントは時刻0、速度0 km/hで、確認区間の速度が現在値へ引き継がれる。",
        "0.3 Gを2秒与えた速度が物理的範囲に収まる。",
        "等速相当の低運動だけでは停止せず、GPS停止で速度が0へ戻る。",
        "GPS観測が速度状態を補正する。",
        "CSVの全行が同じ列数になる。",
    ])
    add_heading(doc, "実機試験", 2)
    add_numbered(doc, [
        "端末を固定してSensor ON後にCalibrationを押し、4秒静止する。",
        "GPS精度20 m以下を目安に待つ。",
        "静止、直線発進、一定速、制動、完全停止を記録する。",
        "左右旋回を記録し、ヨーとバンクの符号を確認する。",
        "JSONとCSVを出力し、動画または既知距離の速度と比較する。",
    ])

    add_heading(doc, "制約と改善計画", 1)
    add_table(doc, ["制約", "影響", "改善案"], [
        ["最初の水平加速で前方向を決定", "横揺れで誤学習する", "取付方向の手動確定を追加"],
        ["GPS速度精度を位置精度から近似", "観測重みが最適でない", "残差から速度分散を推定"],
        ["スカラー前進速度", "軌跡を状態に含めない", "東西南北速度へ拡張"],
        ["ブラウザのセンサーAPI", "端末差とiOS差がある", "実機ログで機種別評価"],
        ["簡易confidence", "統計的信頼区間ではない", "観測残差に基づく品質指標へ変更"],
    ], widths=[2.0, 2.05, 2.65], font_size=8.3)

    add_heading(doc, "安全とプライバシー", 1)
    add_bullets(doc, [
        "端末を確実に車体へ固定し、閉鎖された安全な場所で試験する。",
        "走行中に画面を操作しない。",
        "GPS位置はIndexedDBと出力ファイルに保存される。",
        "アプリ自身は走行ログを外部サーバーへ送信しない。",
        "ログ共有前に位置情報を含むことを確認する。",
    ])

    doc.core_properties.title = "Gym Ana システム設計書"
    doc.core_properties.subject = "iPhoneセンサーとGPSによるモトジムカーナ走行計測"
    doc.core_properties.author = "Gym Ana project"
    doc.save(DESIGN_DOCX)


def build_report_doc(samples, events, implied, residual):
    speed = values(samples, "speed_kmh")
    long_g = values(samples, "long_g")
    lat_g = values(samples, "lat_g")
    bank = values(samples, "bank_deg")
    yaw = values(samples, "yaw_rate")
    dt_values = []
    for i in range(1, len(samples)):
        dt = float(samples[i]["time_ms"]) - float(samples[i - 1]["time_ms"])
        if dt > 0:
            dt_values.append(dt)
    model_residual = [value for value in residual[1:] if math.isfinite(value)]

    doc = Document()
    configure_document(doc, "Gym Ana 走行データ解析レポート")
    add_cover(doc, "Gym Ana 走行データ解析レポート", "速度推定とセンサー軸の物理整合性評価", "旧推定器ログ", CSV_PATH.name)

    add_heading(doc, "解析結論", 1)
    add_para(doc, "このログの速度推定値は実速度として使用できない。START直後の速度が11.157 km/hで、18 ms後に3.816 km/h増加している。この変化には約6.00 Gが必要だが、記録前後Gは0.2069 Gである。")
    add_para(doc, "左右Gは全サンプルで0.0687 G以上となり、静止判定しきい値0.040 Gを一度も下回らない。端末取付角、重力混入、前後軸判定の問題が速度ゼロ復帰を妨げた可能性が高い。")
    add_para(doc, "ログにはGPS速度、動画、既知距離がないため、実速度に対する誤差は算定できない。本レポートはログ内部の物理整合性を評価する。")

    add_heading(doc, "解析対象", 1)
    add_table(doc, ["項目", "内容"], [
        ["ファイル", CSV_PATH.name],
        ["SHA 256", "5359017C3B2B7C3CF0CF5501748BB97700A9EA4A72BB3A895C0D8AA13C611406"],
        ["形式", "GPS融合修正前のイベントとサンプルCSV"],
        ["サンプル", f"{len(samples)}件"],
        ["記録時間", f"{(float(samples[-1]['time_ms']) - float(samples[0]['time_ms'])) / 1000:.3f}秒"],
        ["平均周期", f"{mean(dt_values):.2f} ms  約{1000 / mean(dt_values):.2f} Hz"],
    ], widths=[1.4, 5.3], font_size=8.5)

    add_heading(doc, "データ品質", 1)
    add_table(doc, ["指標", "値", "評価"], [
        ["サンプル数", len(samples), "短時間だが時系列評価は可能"],
        ["サンプリング周波数", f"{1000 / mean(dt_values):.2f} Hz", "IMU処理に十分"],
        ["同一タイムスタンプ", "2組", "時間差0の組は微分計算から除外"],
        ["欠損速度", "0件", "列欠損なし"],
        ["GPS列", "なし", "実速度誤差は評価不可"],
        ["confidence", "70から100 %", "統計的信頼区間ではない"],
    ], widths=[2.0, 1.5, 3.2], font_size=8.5)

    add_heading(doc, "基本統計", 1)
    add_table(doc, ["指標", "最小", "平均", "最大", "標準偏差"], [
        ["推定速度 km/h", f"{min(speed):.3f}", f"{mean(speed):.3f}", f"{max(speed):.3f}", f"{pstdev(speed):.3f}"],
        ["前後G", f"{min(long_g):.4f}", f"{mean(long_g):.4f}", f"{max(long_g):.4f}", f"{pstdev(long_g):.4f}"],
        ["左右G", f"{min(lat_g):.4f}", f"{mean(lat_g):.4f}", f"{max(lat_g):.4f}", f"{pstdev(lat_g):.4f}"],
        ["バンク角 deg", f"{min(bank):.2f}", f"{mean(bank):.3f}", f"{max(bank):.2f}", f"{pstdev(bank):.3f}"],
        ["ヨーレート deg/s", f"{min(yaw):.2f}", f"{mean(yaw):.3f}", f"{max(yaw):.2f}", f"{pstdev(yaw):.3f}"],
    ], widths=[1.8, 1.1, 1.1, 1.1, 1.5], font_size=8.5)

    add_heading(doc, "速度時系列", 1)
    add_figure(doc, ASSETS / "speed_time_chart.png", "図1  旧版推定速度の時系列")
    add_para(doc, "最初のサンプルはtime_msがマイナス1 msで、速度は11.157 km/hである。STARTイベントは6 ms、速度11.16 km/hで記録されている。発進待ち中に増えた速度状態がSTART時に引き継がれたと判断する。")

    add_heading(doc, "加速度時系列", 1)
    add_figure(doc, ASSETS / "g_time_chart.png", "図2  前後Gと左右Gの比較")
    add_para(doc, f"左右G平均は{mean(lat_g):.4f} Gで、前後G平均{mean(long_g):.4f} Gの約{mean(lat_g) / mean(long_g):.1f}倍である。左右Gは全区間で正値となり、最小値も{min(lat_g):.4f} Gである。")

    add_heading(doc, "速度の物理整合性", 1)
    add_figure(doc, ASSETS / "speed_consistency_chart.png", "図3  速度差分から逆算した加速度と記録前後G")
    add_para(doc, "最初の18 msで速度は3.816 km/h増えた。速度差1.060 m/sを0.018秒で割ると58.9 m/s2となり、約6.00 Gに相当する。記録前後Gの0.2069 Gでは説明できない。")
    abs_implied = sorted(abs(value) for value in implied[1:] if math.isfinite(value))
    p95 = abs_implied[int((len(abs_implied) - 1) * 0.95)]
    rmse = math.sqrt(mean(value * value for value in model_residual))
    add_table(doc, ["指標", "結果"], [
        ["速度差分から逆算した絶対G最大", f"{max(abs_implied):.3f} G"],
        ["絶対G 95パーセンタイル", f"{p95:.3f} G"],
        ["1ステップ速度残差RMSE", f"{rmse:.3f} km/h"],
        ["1ステップ最大絶対残差", f"{max(abs(value) for value in model_residual):.3f} km/h"],
    ], widths=[3.7, 3.0])

    add_heading(doc, "分散指標", 1)
    add_figure(doc, ASSETS / "variance_chart.png", "図4  G分散とKalman P")
    add_para(doc, "Kalman Pは0.974424から1.211929の範囲にある。旧版では状態式と共分散結合が一致しておらず、観測更新が速度へ過大に伝播した。現行版は状態を5要素へ整理し、状態遷移式とヤコビアンを一致させた。")

    add_heading(doc, "イベント評価", 1)
    counts = {}
    for event in events:
        counts[event["type"]] = counts.get(event["type"], 0) + 1
    add_table(doc, ["イベント", "件数", "評価"], [
        ["ARM", counts.get("ARM", 0), "同じ発進待ちが重複記録されている"],
        ["START", counts.get("START", 0), "6 ms  速度11.16 km/h"],
        ["STOP", counts.get("STOP", 0), "Sensor OFFによる停止"],
        ["SAVE", counts.get("SAVE", 0), "STOP直後に保存"],
    ], widths=[1.2, 0.9, 4.6])
    add_para(doc, "STOP時の推定速度は16.99 km/h、前後Gは0.032 G、左右Gは0.106 Gである。停止理由はセンサ停止で、自動停止条件による停止ではない。")

    add_heading(doc, "原因と修正内容", 1)
    add_table(doc, ["観測", "原因候補", "現行版の対策", "再試験"], [
        ["START時11.157 km/h", "発進待ち速度の持越し", "START時に速度と関連共分散をゼロ化", "必要"],
        ["18 msで3.816 km/h変化", "状態式と共分散結合の不整合", "5状態EKFへ整理しヤコビアンを一致", "必要"],
        ["左右G平均0.1509 G", "取付角 重力 軸選択", "4秒補正と3D車体軸投影", "必要"],
        ["停止時16.989 km/h", "静止条件不成立 絶対速度なし", "3D補正 ZUPT GPS速度観測", "必要"],
        ["ARM 12件", "Auto ON重複", "armed中の重複処理を抑制", "必要"],
    ], widths=[1.55, 1.75, 2.65, 0.75], font_size=7.8)
    add_para(doc, "本ログは修正前に取得された。表の対策はコードと自動試験で確認したが、実走条件での有効性は次回ログで確認する。")

    add_heading(doc, "次回試験", 1)
    add_numbered(doc, [
        "公開版を再読み込みし、GPSと補正カードを確認する。",
        "iPhoneを車体へ固定してSensor ONを押し、補正完了まで4秒以上静止する。",
        "GPS精度20 m以下を目安に待つ。",
        "静止、20 m以上の直線発進、一定速、制動、完全停止を最低3回記録する。",
        "左右旋回を同程度に実施する。",
        "各走行のJSONとCSVを出力する。",
    ])
    add_table(doc, ["評価項目", "暫定合格基準"], [
        ["START直前速度", "0.0 km/h"],
        ["静止10秒後速度", "0.0 km/hを維持"],
        ["静止前後G平均", "絶対値0.03 G以下"],
        ["静止左右G平均", "絶対値0.03 G以下"],
        ["直進時左右G平均", "絶対値0.05 G以下を目安"],
        ["START検出遅延", "動画基準150 ms以内を目標"],
        ["STOP検出遅延", "完全停止後1.5秒以内"],
        ["GPS速度との差", "GPS精度20 m以下でRMSE 3 km/h以下を暫定目標"],
    ], widths=[2.5, 4.2], font_size=8.5)

    add_heading(doc, "解析上の制約", 1)
    add_bullets(doc, [
        "記録時間は3.406秒で、通常のジムカーナ1走行より短い。",
        "GPS速度と位置がなく、絶対速度精度を評価できない。",
        "取付方向と走行内容の記録がなく、左右Gの原因を一意に特定できない。",
        "STOPはSensor OFF操作で、自動停止性能を評価できない。",
        "8月10日のCSVは旧デモ形式のため統計解析から除外した。",
    ])

    doc.core_properties.title = "Gym Ana 走行データ解析レポート"
    doc.core_properties.subject = "速度推定とセンサー軸の物理整合性評価"
    doc.core_properties.author = "Gym Ana project"
    doc.save(REPORT_DOCX)


def main():
    ASSETS.mkdir(parents=True, exist_ok=True)
    GENERATED.mkdir(parents=True, exist_ok=True)
    create_use_case_diagram()
    create_architecture_diagram()
    create_activity_diagram()
    create_class_diagram()
    create_state_diagram()
    samples, events = read_data()
    implied, residual = create_analysis_charts(samples)
    build_design_doc()
    build_report_doc(samples, events, implied, residual)
    print(DESIGN_DOCX)
    print(REPORT_DOCX)


if __name__ == "__main__":
    main()
