// Thin wrapper: canonical gate is scripts/run-tests.mjs (baseline JSON compare).
// Kept so old docs/scripts calling this path still work: delegates to the
// root gate, which runs vitest + compares against baseline-results.json.
// Usage: node tests/__baseline__/verify-no-regression.mjs
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const r = spawnSync("node", ["scripts/run-tests.mjs"], { cwd: repoRoot, stdio: "inherit" });
process.exit(r.status ?? 1);
