import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cmpVer, checkUpdate } from "../../bin/update-check.mjs";

function sandbox(pkg) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "10router-upd-"));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg));
  const dataDir = path.join(dir, "data");
  return { dir, dataDir };
}

describe("cmpVer", () => {
  it("orders versions", () => {
    expect(cmpVer("0.1.0", "0.1.0")).toBe(0);
    expect(cmpVer("0.1.0", "0.2.0")).toBe(-1);
    expect(cmpVer("1.0.0", "0.9.9")).toBe(1);
    expect(cmpVer("0.1.0-alpha", "0.1.0")).toBe(-1);
    expect(cmpVer("v0.1.0", "0.1.0")).toBe(0);
  });
});

describe("checkUpdate", () => {
  it("silent in repo / opt-out modes", async () => {
    const { dir, dataDir } = sandbox({ name: "p", version: "0.1.0" });
    const fetchFn = () => {
      throw new Error("must not fetch");
    };
    expect(await checkUpdate({ root: dir, dataDir, isRepo: true, argv: [], fetchFn })).toBeNull();
    expect(
      await checkUpdate({
        root: dir,
        dataDir,
        isRepo: false,
        argv: ["--no-update-check"],
        fetchFn,
      }),
    ).toBeNull();
    expect(
      await checkUpdate({
        root: dir,
        dataDir,
        isRepo: false,
        argv: [],
        env: { NO_UPDATE_CHECK: "1" },
        fetchFn,
      }),
    ).toBeNull();
  });

  it("notices outdated version with stop-first guidance", async () => {
    const { dir, dataDir } = sandbox({ name: "@amir83nasr/10router", version: "0.1.0" });
    const fetchFn = async () => ({ ok: true, json: async () => ({ version: "0.2.0" }) });
    const notice = await checkUpdate({
      root: dir,
      dataDir,
      isRepo: false,
      argv: [],
      env: {},
      fetchFn,
    });
    expect(notice).toContain("0.1.0 → 0.2.0");
    expect(notice).toContain("10router stop;");
    expect(notice).toContain("npm install -g @amir83nasr/10router@latest");
    // cached → second call makes no fetch
    let fetched = 0;
    const counting = async () => {
      fetched++;
      return { ok: true, json: async () => ({ version: "9.9.9" }) };
    };
    const again = await checkUpdate({
      root: dir,
      dataDir,
      isRepo: false,
      argv: [],
      fetchFn: counting,
    });
    expect(fetched).toBe(0);
    expect(again).toContain("0.2.0");
  });

  it("uses pnpm command for pnpm users, silent when current", async () => {
    const { dir, dataDir } = sandbox({ name: "p", version: "0.2.0" });
    const fetchFn = async () => ({ ok: true, json: async () => ({ version: "0.3.0" }) });
    const notice = await checkUpdate({
      root: dir,
      dataDir,
      isRepo: false,
      argv: [],
      env: { npm_config_user_agent: "pnpm/10.0.0" },
      fetchFn,
    });
    expect(notice).toContain("pnpm add -g p@latest");
    const current = await checkUpdate({
      root: dir,
      dataDir: path.join(dir, "fresh"),
      isRepo: false,
      argv: [],
      fetchFn: async () => ({ ok: true, json: async () => ({ version: "0.2.0" }) }),
    });
    expect(current).toBeNull();
  });

  it("fail-open: offline without cache stays silent, stale cache used", async () => {
    const { dir, dataDir } = sandbox({ name: "p", version: "0.1.0" });
    const down = async () => {
      throw new Error("offline");
    };
    expect(
      await checkUpdate({ root: dir, dataDir, isRepo: false, argv: [], fetchFn: down }),
    ).toBeNull();
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(
      path.join(dataDir, "update-check.json"),
      JSON.stringify({ latest: "0.5.0", checkedAt: 0 }),
    );
    const stale = await checkUpdate({ root: dir, dataDir, isRepo: false, argv: [], fetchFn: down });
    expect(stale).toContain("0.5.0");
  });

  it("previewLatest bypasses repo gate without network", async () => {
    const { dir, dataDir } = sandbox({ name: "p", version: "0.1.0" });
    const never = () => {
      throw new Error("must not fetch");
    };
    const notice = await checkUpdate({
      root: dir,
      dataDir,
      isRepo: true,
      argv: [],
      previewLatest: "9.9.9",
      fetchFn: never,
    });
    expect(notice).toContain("0.1.0 → 9.9.9");
  });
});
