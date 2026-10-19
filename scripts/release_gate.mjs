#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function parseOptions(argv) {
  const options = {
    json: "docs/generated/RELEASE_GATE_LATEST.json",
    markdown: "docs/generated/RELEASE_GATE_LATEST.md",
  };
  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index] === "--json") options.json = argv[++index];
    else if (argv[index] === "--markdown") options.markdown = argv[++index];
    else throw new Error(`Unknown option: ${argv[index]}`);
  }
  return options;
}

function extractJson(output) {
  const first = output.indexOf("{");
  const last = output.lastIndexOf("}");
  if (first < 0 || last < first) return null;
  try {
    return JSON.parse(output.slice(first, last + 1));
  } catch {
    return null;
  }
}

function runCheck(name, script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  return {
    name,
    passed: result.status === 0,
    exitCode: result.status,
    data: extractJson(result.stdout),
    error: result.status === 0 ? null : (result.stderr || result.stdout).trim().slice(-2000),
  };
}

const options = parseOptions(process.argv);
const checks = [
  runCheck("unit", "tests/motion-model.test.mjs"),
  runCheck("deterministicSimulation", "tests/automatic-timing.simulation.test.mjs"),
  runCheck("robustnessSimulation", "tests/automatic-timing.robustness.test.mjs"),
  runCheck("recordedLog", "tests/recorded-log-regression.test.mjs"),
];
const byName = Object.fromEntries(checks.map((check) => [check.name, check]));
const soakEvidence = fs.existsSync("docs/generated/ROBUSTNESS_SOAK_LATEST.json")
  ? JSON.parse(fs.readFileSync("docs/generated/ROBUSTNESS_SOAK_LATEST.json", "utf8"))
  : null;
const softwareGatePassed = checks.every((check) => check.passed);
const report = {
  generatedAt: new Date().toISOString(),
  appVersion: "v27",
  softwareGatePassed,
  releaseStatus: softwareGatePassed ? "FIELD_VALIDATION_REQUIRED" : "SOFTWARE_GATE_FAILED",
  checks: checks.map((check) => ({
    name: check.name,
    passed: check.passed,
    exitCode: check.exitCode,
    metrics: check.name === "robustnessSimulation" ? check.data?.summary : check.data,
    error: check.error,
  })),
  acceptance: {
    deterministicScenariosPassed: byName.deterministicSimulation.data?.passed ?? null,
    deterministicScenariosFailed: byName.deterministicSimulation.data?.failed ?? null,
    robustnessTrials: byName.robustnessSimulation.data?.summary?.trials ?? null,
    robustnessFalseStarts: byName.robustnessSimulation.data?.summary?.falseStarts ?? null,
    robustnessMissedStarts: byName.robustnessSimulation.data?.summary?.missedStarts ?? null,
    robustnessStartLatencyP95Ms: byName.robustnessSimulation.data?.summary?.startLatencyMs?.p95 ?? null,
    recordedStartGpsSpeedKmh: byName.recordedLog.data?.startGpsSpeedKmh ?? null,
    recordedStopGpsSpeedKmh: byName.recordedLog.data?.stopGpsSpeedKmh ?? null,
    recordedSpeedRmseKmh: byName.recordedLog.data?.speedRmseKmh ?? null,
    soakTrials: soakEvidence?.summary?.trials ?? null,
    soakFalseStarts: soakEvidence?.summary?.falseStarts ?? null,
    soakMissedStarts: soakEvidence?.summary?.missedStarts ?? null,
    soakStartLatencyP95Ms: soakEvidence?.summary?.startLatencyMs?.p95 ?? null,
    soakStartLatencyMaxMs: soakEvidence?.summary?.startLatencyMs?.max ?? null,
  },
  fieldGate: {
    passed: false,
    reason: "Automated tests cannot reproduce iOS suspension, real GPS multipath, or mount resonance.",
    required: [
      "30 seconds stationary with zero false STARTs",
      "three consecutive v27 closed-course runs with START, STOP, rearm, and persistence",
      "START latency within 300 ms against video or an observer reference",
      "each exported run reports appVersion v27, schemaVersion 2, and pre-start samples",
    ],
  },
};

const statusText = softwareGatePassed ? "ソフトウェア試験合格、実機確認待ち" : "ソフトウェア試験不合格";
const acceptance = report.acceptance;
const markdown = `# リリース判定レポート

- 生成日時: ${report.generatedAt}
- アプリ版: ${report.appVersion}
- 判定: **${statusText}**

## 自動試験

| 項目 | 結果 |
|---|---:|
| 決定論シナリオ | ${acceptance.deterministicScenariosPassed ?? "-"}件合格 / ${acceptance.deterministicScenariosFailed ?? "-"}件失敗 |
| 耐性試験 | ${acceptance.robustnessTrials ?? "-"}条件 |
| 耐性試験の誤START | ${acceptance.robustnessFalseStarts ?? "-"}件 |
| 耐性試験の未検知 | ${acceptance.robustnessMissedStarts ?? "-"}件 |
| START遅延 P95 | ${acceptance.robustnessStartLatencyP95Ms ?? "-"} ms |
| 実走START時GPS | ${acceptance.recordedStartGpsSpeedKmh ?? "-"} km/h |
| 実走STOP時GPS | ${acceptance.recordedStopGpsSpeedKmh ?? "-"} km/h |
| 実走速度RMSE | ${acceptance.recordedSpeedRmseKmh ?? "-"} km/h |
| 長時間耐性試験 | ${acceptance.soakTrials ?? "-"}条件 |
| 長時間耐性の誤START / 未検知 | ${acceptance.soakFalseStarts ?? "-"}件 / ${acceptance.soakMissedStarts ?? "-"}件 |
| 長時間耐性 START遅延 P95 / 最大 | ${acceptance.soakStartLatencyP95Ms ?? "-"} ms / ${acceptance.soakStartLatencyMaxMs ?? "-"} ms |

## 判定

自動試験は${softwareGatePassed ? "合格" : "不合格"}。製品リリースには次の実機確認が残る。

1. 実車静止30秒で誤START 0件。
2. v27の閉鎖コース連続3走でSTART、STOP、再待機、保存がすべて成立。
3. 動画または観測基準に対するSTART遅延300 ms以内。
4. 各出力がappVersion v27、schemaVersion 2、発進前サンプルを含む。

合成試験はiOSのバックグラウンド停止、実GPSマルチパス、取付部の共振を再現しないため、自動試験合格だけで製品リリース可とは判定しない。
`;

for (const output of [options.json, options.markdown]) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
}
fs.writeFileSync(options.json, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(options.markdown, markdown);
console.log(JSON.stringify({
  softwareGatePassed,
  releaseStatus: report.releaseStatus,
  json: path.resolve(options.json),
  markdown: path.resolve(options.markdown),
  acceptance,
}, null, 2));
if (!softwareGatePassed) process.exit(1);
