// PUT /api/combos/[id] must persist member edits. The handler re-assigns its
// parsed body after cleaning members, so a `const` binding there throws
// "Assignment to constant variable" — inside the try, that surfaces as an
// opaque 500 "Failed to update combo" for every edit that carries models.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

let tempDir;
const originalDataDir = process.env.DATA_DIR;

function put(handler, id, body) {
  return handler(
    new Request(`https://10router.local/api/combos/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "10router-combos-put-"));
  process.env.DATA_DIR = tempDir;
  delete global._dbAdapter;
  vi.resetModules();
});

afterEach(() => {
  try {
    global._dbAdapter?.instance?.close?.();
  } catch {}
  delete global._dbAdapter;
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
});

async function seedCombo() {
  const { createCombo } = await import("@/lib/db/repos/combosRepo.js");
  return createCombo({ name: "combo-a", models: ["openai/gpt-5"] });
}

describe("PUT /api/combos/[id]", () => {
  it("updates models and name without a 500", async () => {
    const combo = await seedCombo();
    const { PUT } = await import("../../src/app/api/combos/[id]/route.js");

    const res = await put(PUT, combo.id, { name: "combo-b", models: ["openai/gpt-5.5"] });

    expect(res.status).toBe(200);
    const updated = await res.json();
    expect(updated.name).toBe("combo-b");
    expect(updated.models).toEqual(["openai/gpt-5.5"]);
  });

  it("trims and dedupes members before persisting", async () => {
    const combo = await seedCombo();
    const { PUT } = await import("../../src/app/api/combos/[id]/route.js");

    const res = await put(PUT, combo.id, {
      models: [" openai/gpt-5 ", "openai/gpt-5", "anthropic/claude-sonnet-5-5"],
    });

    expect(res.status).toBe(200);
    const updated = await res.json();
    expect(updated.models).toEqual(["openai/gpt-5", "anthropic/claude-sonnet-5-5"]);
  });

  it("still rejects invalid members with a 400", async () => {
    const combo = await seedCombo();
    const { PUT } = await import("../../src/app/api/combos/[id]/route.js");

    const res = await put(PUT, combo.id, { models: ["Body", "Support"] });

    expect(res.status).toBe(400);
    const err = await res.json();
    expect(err.error).toMatch(/Invalid combo models/);
  });

  it("keeps a name-only update working", async () => {
    const combo = await seedCombo();
    const { PUT } = await import("../../src/app/api/combos/[id]/route.js");

    const res = await put(PUT, combo.id, { name: "combo-renamed" });

    expect(res.status).toBe(200);
    const updated = await res.json();
    expect(updated.name).toBe("combo-renamed");
    expect(updated.models).toEqual(["openai/gpt-5"]);
  });
});
