import { NextResponse } from "next/server";

// Dashboard Shutdown button. Respond first (client holds a spinner and polls
// /api/health until we disappear), then stop child processes, drop the CLI
// pidfile, and exit. Without the cleanup below, process.exit() orphans
// cloudflared / MCP bridge children and leaves a stale 10router.pid.
export async function POST() {
  const response = NextResponse.json({
    success: true,
    message: "Shutting down...",
  });

  setTimeout(shutdown, 500);

  return response;
}

async function shutdown() {
  try {
    (await import("@/lib/mcp/stdioSseBridge")).killAllBridges();
  } catch {
    /* best effort */
  }
  try {
    (await import("@/lib/tunnel/index")).killCloudflared();
  } catch {
    /* best effort */
  }
  try {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { getDataDir } = await import("@/lib/dataDir");
    fs.rmSync(path.join(getDataDir(), "10router.pid"), { force: true });
  } catch {
    /* best effort */
  }
  process.exit(0);
}
