#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const analysisDir = path.resolve(process.argv[2] || "analysis/2026-10-11");
const outputPath = path.resolve(process.argv[3] || "docs/assets/bank_validation_2026-10-11.svg");
const runIds = ["GX010070", "GX010072", "GX010073"];
const rows = runIds.map((runId) => {
  const summary = JSON.parse(fs.readFileSync(path.join(analysisDir, `${runId}-summary.json`), "utf8"));
  const comparison = summary.iphoneComparison;
  const tuned = comparison.bankTuningCandidates.find((candidate) => (
    candidate.rollSign === -1
    && candidate.correctionTauSec === 0.7
    && candidate.dynamicsScale === 2
  ));
  return {
    runId,
    current: comparison.bankDegFromGravity.correlation,
    tuned: tuned?.correlation ?? 0,
    reliable: runId !== "GX010070",
  };
});

const width = 960;
const height = 520;
const chartLeft = 110;
const chartTop = 82;
const chartWidth = 790;
const chartHeight = 340;
const maxValue = 0.8;
const barWidth = 70;
const groupWidth = chartWidth / rows.length;
const y = (value) => chartTop + chartHeight - value / maxValue * chartHeight;
const escapeXml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const grid = Array.from({ length: 5 }, (_, index) => {
  const value = index * 0.2;
  const py = y(value);
  return `<line x1="${chartLeft}" y1="${py}" x2="${chartLeft + chartWidth}" y2="${py}" stroke="#d8dee3" stroke-width="1"/><text x="${chartLeft - 14}" y="${py + 5}" text-anchor="end" font-size="16" fill="#53616a">${value.toFixed(1)}</text>`;
}).join("");

const bars = rows.map((row, index) => {
  const center = chartLeft + groupWidth * (index + 0.5);
  const currentX = center - barWidth - 8;
  const tunedX = center + 8;
  const currentY = y(row.current);
  const tunedY = y(row.tuned);
  const note = row.reliable ? "" : `<text x="${center}" y="${chartTop + chartHeight + 54}" text-anchor="middle" font-size="13" fill="#9a5b13">参考: GPS同期なし</text>`;
  return [
    `<rect x="${currentX}" y="${currentY}" width="${barWidth}" height="${chartTop + chartHeight - currentY}" fill="#68757d"/>`,
    `<rect x="${tunedX}" y="${tunedY}" width="${barWidth}" height="${chartTop + chartHeight - tunedY}" fill="#17855b"/>`,
    `<text x="${currentX + barWidth / 2}" y="${currentY - 9}" text-anchor="middle" font-size="16" font-weight="700" fill="#29343a">${row.current.toFixed(2)}</text>`,
    `<text x="${tunedX + barWidth / 2}" y="${tunedY - 9}" text-anchor="middle" font-size="16" font-weight="700" fill="#145f44">${row.tuned.toFixed(2)}</text>`,
    `<text x="${center}" y="${chartTop + chartHeight + 30}" text-anchor="middle" font-size="17" font-weight="700" fill="#29343a">${escapeXml(row.runId)}</text>`,
    note,
  ].join("");
}).join("");

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#f8fafb"/>
  <text x="${chartLeft}" y="38" font-family="sans-serif" font-size="25" font-weight="700" fill="#172126">バンク角: GoPro重力姿勢との相関</text>
  <text x="${chartLeft}" y="64" font-family="sans-serif" font-size="15" fill="#53616a">共通設定: roll sign -1 / correction tau 0.7 s / dynamics scale 2</text>
  <g font-family="sans-serif">${grid}${bars}</g>
  <g font-family="sans-serif" font-size="15">
    <rect x="610" y="30" width="18" height="18" fill="#68757d"/><text x="637" y="45" fill="#29343a">現行 v19</text>
    <rect x="730" y="30" width="18" height="18" fill="#17855b"/><text x="757" y="45" fill="#29343a">ジャイロ融合再生</text>
  </g>
</svg>
`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, svg, "utf8");
console.log(outputPath);
