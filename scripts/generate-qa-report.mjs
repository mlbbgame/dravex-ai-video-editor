import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outputDir = path.join(root, "test-results");
await mkdir(outputDir, { recursive: true });

let data;
try {
  data = JSON.parse(await readFile(path.join(outputDir, "results.json"), "utf8"));
} catch {
  data = null;
}

const tests = [];
function walk(suites = []) {
  for (const suite of suites) {
    for (const spec of suite.specs ?? []) {
      for (const testCase of spec.tests ?? []) {
        const results = testCase.results ?? [];
        const latest = results.at(-1);
        tests.push({
          title: spec.title ?? testCase.title ?? "Untitled test",
          file: spec.file ?? suite.file ?? "",
          status: latest?.status ?? (testCase.expectedStatus === "skipped" ? "skipped" : "unknown"),
          durationMs: latest?.duration ?? 0,
          errors: (latest?.errors ?? []).map((error) => error.message ?? error.value ?? "Unknown error"),
        });
      }
    }
    walk(suite.suites ?? []);
  }
}
if (data) walk(data.suites ?? []);

const counts = {
  total: tests.length,
  passed: tests.filter((test) => test.status === "passed").length,
  failed: tests.filter((test) => test.status === "failed" || test.status === "timedOut").length,
  skipped: tests.filter((test) => test.status === "skipped").length,
  other: tests.filter((test) => !["passed", "failed", "timedOut", "skipped"].includes(test.status)).length,
};
const visualPath = path.join(outputDir, "dravex-visual-checks.json");
let visual = null;
try { visual = JSON.parse(await readFile(visualPath, "utf8")); } catch {}

const lines = [
  "# DRAVEX Auto QA report",
  "",
  `- Generated: ${new Date().toISOString()}`,
  `- Overall: ${counts.failed === 0 && counts.total > 0 ? "PASS (no recorded test failures)" : counts.failed > 0 ? "FAIL" : "INCOMPLETE (no Playwright result JSON found)"}`,
  `- Tests: ${counts.total} total, ${counts.passed} passed, ${counts.failed} failed, ${counts.skipped} skipped, ${counts.other} other`,
  "",
  "## Test results",
  "",
  "| Status | Test | Duration |",
  "|---|---|---:|",
  ...tests.map((test) => `| ${test.status} | ${test.title.replaceAll("|", "\\|")} | ${Math.round(test.durationMs)} ms |`),
  "",
  "## Failures",
  "",
  ...(tests.filter((test) => test.errors.length).flatMap((test) => [
    `### ${test.title}`,
    ...test.errors.map((error) => `- ${String(error).split("\n")[0]}`),
    "",
  ]).length ? tests.filter((test) => test.errors.length).flatMap((test) => [
    `### ${test.title}`,
    ...test.errors.map((error) => `- ${String(error).split("\n")[0]}`),
    "",
  ]) : ["No test errors were recorded.", ""]),
  "## Render evidence",
  "",
  ...(visual ? [
    `- Render test: ${visual.status}`,
    `- Duration: ${Number(visual.output?.durationSeconds ?? 0).toFixed(2)} seconds`,
    `- Dimensions: ${visual.output?.width ?? "?"} × ${visual.output?.height ?? "?"}`,
    `- Download: ${visual.export?.filename ?? "not captured"} (${visual.export?.bytes ?? 0} bytes)`,
    `- Screenshots: ${(visual.evidence ?? []).join(", ")}`,
    "",
    ...(visual.limitations ?? []).map((item) => `- Limitation: ${item}`),
  ] : ["The focused render evidence file was not produced in this run."]),
  "",
  "## Interpretation",
  "",
  "Passing tests demonstrate only the behaviors they exercise. They do not prove professional visual quality, reliable operation on every Android device, or correctness for every input format.",
  "",
];
await writeFile(path.join(outputDir, "dravex-auto-qa-report.md"), lines.join("\n"), "utf8");
console.log(lines.join("\n"));
