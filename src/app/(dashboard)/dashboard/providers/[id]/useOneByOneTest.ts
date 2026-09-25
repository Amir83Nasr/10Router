"use client";

import { useRef, useState } from "react";

const ONE_BY_ONE_DELAY_MS = 1000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type OneByOneStatus = { state: string; error: string | null };
export type OneByOneSummary = {
  total: number;
  completed: number;
  passed: number;
  failed: number;
  stopped: boolean;
} | null;

// Sequential per-connection test runner. Extracted from ProviderDetailPage;
// behavior identical: queued → testing → success/failed, stoppable, 1s gap.
export function useOneByOneTest(connections: any[]) {
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [currentConnectionId, setCurrentConnectionId] = useState<any>(null);
  const [results, setResults] = useState<Record<string, OneByOneStatus>>({});
  const [summary, setSummary] = useState<OneByOneSummary>(null);
  const stopRef = useRef(false);

  const run = async () => {
    if (running || connections.length === 0) return;
    const queuedState = Object.fromEntries(
      connections.map((c) => [c.id, { state: "queued", error: null }]),
    );
    stopRef.current = false;
    setRunning(true);
    setStopping(false);
    setCurrentConnectionId(null);
    setResults(queuedState);
    setSummary({ total: connections.length, completed: 0, passed: 0, failed: 0, stopped: false });
    let passed = 0;
    let failed = 0;
    try {
      for (let index = 0; index < connections.length; index += 1) {
        if (stopRef.current) {
          setSummary({
            total: connections.length,
            completed: index,
            passed,
            failed,
            stopped: true,
          });
          break;
        }
        const connection = connections[index];
        setCurrentConnectionId(connection.id);
        setResults((prev) => ({ ...prev, [connection.id]: { state: "testing", error: null } }));
        try {
          const res = await fetch(`/api/providers/${connection.id}/test`, { method: "POST" });
          const data = await res.json();
          const valid = !!data.valid;
          if (valid) passed += 1;
          else failed += 1;
          setResults((prev) => ({
            ...prev,
            [connection.id]: {
              state: valid ? "success" : "failed",
              error: valid ? null : data.error || null,
            },
          }));
        } catch (error: any) {
          failed += 1;
          setResults((prev) => ({
            ...prev,
            [connection.id]: { state: "failed", error: error.message || "Test failed" },
          }));
        }
        setSummary({
          total: connections.length,
          completed: index + 1,
          passed,
          failed,
          stopped: false,
        });
        if (index < connections.length - 1) await sleep(ONE_BY_ONE_DELAY_MS);
      }
    } finally {
      setCurrentConnectionId(null);
      setRunning(false);
      setStopping(false);
      stopRef.current = false;
    }
  };

  const stop = () => {
    if (!running) return;
    stopRef.current = true;
    setStopping(true);
  };

  return { running, stopping, currentConnectionId, results, summary, run, stop };
}
