#!/usr/bin/env node
// ─── TEST GATE ─────────────────────────────────────────────────
// Runs the vitest suite (in tests/) with a JSON reporter, then fails if the
// current run shows a REGRESSION: a test that passed in the committed
// tests/__baseline__/baseline-results.json but fails now. The baseline is
// green (0 known failures); live/credential tests are excluded by default
// via --exclude and run only with --real.
//
// Usage:
//   node scripts/run-tests.mjs              # unit suite (default, no live calls)
//   node scripts/run-tests.mjs --real       # include real/provider tests (needs creds)
import { readFileSync, existsSync, mkdtempSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = dirname(fileURLToPath(new URL(".", import.meta.url))); // repo root
const testsDir = resolve(repoRoot, "tests");

// 1. vitest must be installed (tests/ is an independent npm package).
const vitestBin = join(testsDir, "node_modules", ".bin", "vitest");
if (!existsSync(vitestBin)) {
  console.error(
    "\n[ERR] vitest not installed in tests/. Run:\n" +
      "   cd tests && npm install\n" +
      "   (tests/ is a standalone package; the root package.json does not provide vitest)",
  );
  process.exit(1);
}

// 2. Run the suite, JSON output to a temp file (always written, even on test
//    failures — vitest only omits it if the suite itself can't start).
// `--reporter=dot` keeps the push-hook output readable; details live in the JSON.
const outFile = join(testsDir, ".vitest-results.json");
const args = ["vitest", "run", "--reporter=dot", "--reporter=json", `--outputFile=${outFile}`];
if (!process.argv.includes("--real")) {
  // Skip live/credential tests by default.
  args.push("--exclude", "**/real/**", "--exclude", "**/*.real.test.js");
}
// Tests must never touch the live DATA_DIR (they mutate SQLite and can corrupt
// ~/.10router). Isolate unless the caller already set DATA_DIR.
const env = process.env.DATA_DIR
  ? process.env
  : { ...process.env, DATA_DIR: mkdtempSync(join(tmpdir(), "10router-test-")) };
const vitest = spawnSync("npx", args, { cwd: testsDir, stdio: "inherit", env });

let results;
try {
  results = JSON.parse(readFileSync(outFile, "utf8"));
} catch {
  console.error("\n[ERR] Vitest produced no JSON output — the suite could not start.");
  console.error("   Check the output above for a startup/config error.");
  process.exit(1);
}

// 3. Gate: any failure NOT present in the committed baseline is a regression.
// The baseline was committed from a different build machine (absolute paths
// differ). Normalize a test's identity to `tests/<relative> :: <fullName>` by
// stripping everything through the last `/tests/` (works for both the current
// macOS path and the CI/Docker `/app/tests/...` layout).
const repoRel = (name) => {
  const i = name.lastIndexOf("/tests/");
  return i >= 0 ? name.slice(i + 1) : name;
};
const failName = (file, t) => `${repoRel(file)} :: ${t.fullName}`;
const baseline = JSON.parse(
  readFileSync(join(testsDir, "__baseline__", "baseline-results.json"), "utf8"),
);
const baselineFails = new Set(
  baseline.testResults.flatMap((f) =>
    f.assertionResults.filter((a) => a.status === "failed").map((a) => failName(f.name, a)),
  ),
);
const nowFails = new Set(
  results.testResults.flatMap((f) =>
    f.assertionResults.filter((a) => a.status === "failed").map((a) => failName(f.name, a)),
  ),
);
const regressions = [...nowFails].filter((f) => !baselineFails.has(f));
const recovered = [...baselineFails].filter((f) => !nowFails.has(f));

console.log(
  `\nSuite: ${results.numTotalTests} tests, ${results.numPassedTests} passed, ${results.numFailedTests} failed across ${results.numTotalTestSuites} files.`,
);
if (recovered.length) {
  console.log(`  (${recovered.length} were failing in baseline and now pass)`);
}

if (regressions.length) {
  console.error(
    `\n[ERR] ${regressions.length} REGRESSION(s) — failing now but passing in baseline:\n`,
  );
  regressions.sort().forEach((f) => console.error("  - " + f));
  process.exit(1);
}
console.log("No regressions vs baseline.");
