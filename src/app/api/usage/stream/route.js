import { getUsageStats, statsEmitter, getActiveRequests } from "@/lib/usageDb";

export const dynamic = "force-dynamic";

// ── SHARED STATS CACHE ───────────────────────────────────────────────────
// Every open dashboard tab holds one of these streams, and statsEmitter fires
// on every saved request. Recomputing getUsageStats() (two full table reads +
// a 100-row scan + the whole daily-summary fold) once per client per event
// made server CPU scale with tabs × request rate. One cache + one in-flight
// recompute, shared by every subscriber in this process, makes N tabs cost the
// same as one. Module scope persists across requests in the Node server.
//
// Only the active/recent overlay is pushed downstream (that is all the client
// merges), so the heavy snapshot is read for its cached fields alone.
let cache = null;
let inflight = null;

// Concurrent bursts collapse onto a single getUsageStats() call.
function refreshStats() {
  if (!inflight) {
    inflight = Promise.resolve()
      .then(() => getUsageStats("all"))
      .then((stats) => {
        cache = stats;
        return stats;
      })
      .catch(() => cache) // keep serving the last good snapshot
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

// Fresh active/recent overlay, primed by the shared snapshot. Null before the
// first compute so callers can skip a duplicate push.
async function overlay() {
  if (!cache) await refreshStats();
  if (!cache) return null;
  return getActiveRequests();
}

// ── STREAM ───────────────────────────────────────────────────────────────
export async function GET() {
  const encoder = new TextEncoder();
  let closed = false;
  let keepalive = null;
  let controller = null;

  const write = (chunk) => {
    if (closed) return;
    try {
      controller.enqueue(encoder.encode(chunk));
    } catch {
      teardown();
    }
  };

  const sendEvent = (payload) => write(`data: ${JSON.stringify(payload)}\n\n`);

  const send = async () => {
    if (closed) return;
    const stats = await overlay();
    if (stats && !closed) sendEvent(stats);
  };

  // Cheap path: only the active/recent overlay moved.
  const sendPending = send;

  const teardown = () => {
    if (closed) return;
    closed = true;
    statsEmitter.off("update", send);
    statsEmitter.off("pending", sendPending);
    clearInterval(keepalive);
  };

  const stream = new ReadableStream({
    async start(c) {
      controller = c;
      await send();
      if (closed) return;
      statsEmitter.on("update", send);
      statsEmitter.on("pending", sendPending);
      keepalive = setInterval(() => write(": ping\n\n"), 25000);
    },
    cancel() {
      teardown();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
