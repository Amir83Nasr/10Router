"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogDescription,
} from "@/components/ui/dialog";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { getCurrentLocale, onLocaleChange } from "@/i18n/runtime";
import { WENYAN_LOCALES, CAVEMAN_LEVELS, PONYTAIL_LEVELS } from "../endpoint/endpointConstants";

type HeadroomStatus = {
  installed: boolean;
  running: boolean;
  python?: string | null;
  loading: boolean;
  localUrl?: string | false;
  canStart?: boolean;
  managedPid?: number | null;
};

type HeadroomExtras = {
  version: string | null;
  extras: { code: boolean; ml: boolean };
  available: string[];
  loading: boolean;
};

type PxpipeStatus = {
  installed: boolean;
  installing: boolean;
  running: boolean;
  version: string | null;
  loading: boolean;
};

type PxpipeHealth = {
  healthy?: boolean;
  checks?: { id: string; ok: boolean; label: string; detail?: string }[];
  error?: string;
};

type ExtrasConfirm = {
  title: string;
  message: string;
  confirmText: string;
  variant: "default" | "destructive";
  onConfirm: () => void;
};

function SettingRow({
  title,
  titleLink,
  titleLinkLabel,
  desc,
  children,
}: {
  title: string;
  titleLink?: string;
  titleLinkLabel?: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 py-4">
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {title}{" "}
          {titleLink && (
            <a
              href={titleLink}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-normal text-primary underline hover:opacity-80"
            >
              ({titleLinkLabel})
            </a>
          )}
        </p>
        <p className="text-sm text-muted-foreground">{desc}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">{children}</div>
    </div>
  );
}

function LevelPicker({
  levels,
  value,
  onPick,
}: {
  levels: { id: string; label: string; desc?: string; wenyan?: boolean }[];
  value: string;
  onPick: (id: string) => void;
}) {
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        {levels.map((lvl) => (
          <Tooltip key={lvl.id}>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant={value === lvl.id ? "default" : "ghost"}
                onClick={() => onPick(lvl.id)}
              >
                {lvl.label}
              </Button>
            </TooltipTrigger>
            {lvl.desc ? <TooltipContent>{lvl.desc}</TooltipContent> : null}
          </Tooltip>
        ))}
      </div>
      <p className="text-xs text-primary">{levels.find((lvl) => lvl.id === value)?.desc}</p>
    </div>
  );
}

export default function TokenSaverClient() {
  const [rtkEnabled, setRtkEnabledState] = useState(true);
  const [headroomEnabled, setHeadroomEnabled] = useState(false);
  const [headroomUrl, setHeadroomUrl] = useState("http://localhost:8787");
  const [headroomTimeoutMs, setHeadroomTimeoutMs] = useState<number | string>(3000);
  const [headroomStatus, setHeadroomStatus] = useState<HeadroomStatus>({
    installed: false,
    running: false,
    python: null,
    loading: true,
  });
  const [showHeadroomInstallModal, setShowHeadroomInstallModal] = useState(false);
  const [headroomActionLoading, setHeadroomActionLoading] = useState(false);
  const [headroomActionError, setHeadroomActionError] = useState("");
  const [headroomExtras, setHeadroomExtras] = useState<HeadroomExtras>({
    version: null,
    extras: { code: false, ml: false },
    available: ["code", "ml"],
    loading: false,
  });
  const [pendingExtras, setPendingExtras] = useState<string[]>([]);
  const [extrasActionLoading, setExtrasActionLoading] = useState(false);
  const [extrasActionError, setExtrasActionError] = useState("");
  const [removingExtra, setRemovingExtra] = useState<string | null>(null);
  const [installLog, setInstallLog] = useState("");
  const [extrasConfirm, setExtrasConfirm] = useState<ExtrasConfirm | null>(null);
  const [codeAware, setCodeAware] = useState(false);
  const [kompress, setKompress] = useState(true);
  const [restartingProxy, setRestartingProxy] = useState(false);
  const logPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [cavemanEnabled, setCavemanEnabled] = useState(false);
  const [cavemanLevel, setCavemanLevel] = useState("full");
  const [ponytailEnabled, setPonytailEnabled] = useState(false);
  const [ponytailLevel, setPonytailLevel] = useState("full");
  const [pxpipeEnabled, setPxpipeEnabled] = useState(false);
  const [pxpipeMinChars, setPxpipeMinChars] = useState<number | string>(25000);
  const [pxpipeStatus, setPxpipeStatus] = useState<PxpipeStatus>({
    installed: false,
    installing: false,
    running: false,
    version: null,
    loading: true,
  });
  const [pxpipeHealth, setPxpipeHealth] = useState<PxpipeHealth | null>(null);
  const [showPxpipeModal, setShowPxpipeModal] = useState(false);
  const [pxpipeActionLoading, setPxpipeActionLoading] = useState(false);
  const [pxpipeActionError, setPxpipeActionError] = useState("");
  const [locale, setLocale] = useState("en");

  const { copied, copy } = useCopyToClipboard();

  /* eslint-disable react-hooks/set-state-in-effect -- mount-time settings/subscription init, same as other dashboard pages */
  useEffect(() => {
    setLocale(getCurrentLocale());
    return onLocaleChange(() => setLocale(getCurrentLocale()));
  }, []);

  const isWenyanLocale = WENYAN_LOCALES.includes(locale);
  const visibleCavemanLevels = isWenyanLocale
    ? CAVEMAN_LEVELS
    : CAVEMAN_LEVELS.filter((lvl) => !lvl.wenyan);

  const patchSetting = async (patch: Record<string, unknown>) => {
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    } catch (error) {
      console.log("Error updating setting:", error);
    }
  };

  useEffect(() => {
    const current = CAVEMAN_LEVELS.find((lvl) => lvl.id === cavemanLevel);
    if (current?.wenyan && !isWenyanLocale) {
      setCavemanLevel("ultra");
      patchSetting({ cavemanLevel: "ultra" });
    }
  }, [isWenyanLocale, cavemanLevel]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleRtkEnabled = async (value: boolean) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rtkEnabled: value }),
      });
      if (res.ok) setRtkEnabledState(value);
    } catch (error) {
      console.log("Error updating rtkEnabled:", error);
    }
  };

  const handleCavemanEnabled = (value: boolean) => {
    setCavemanEnabled(value);
    patchSetting({ cavemanEnabled: value });
  };

  const handleHeadroomEnabled = (value: boolean) => {
    const nextUrl = headroomUrl.trim() || "http://localhost:8787";
    setHeadroomUrl(nextUrl);
    setHeadroomEnabled(value);
    patchSetting({ headroomEnabled: value, headroomUrl: nextUrl });
  };

  const handleHeadroomUrlBlur = async () => {
    const next = headroomUrl.trim() || "http://localhost:8787";
    setHeadroomUrl(next);
    await patchSetting({ headroomUrl: next });
    refreshHeadroomStatus();
  };

  const refreshHeadroomStatus = useCallback(async () => {
    setHeadroomStatus((s) => ({ ...s, loading: true }));
    try {
      const res = await fetch("/api/headroom/status", {
        headers: { "Cache-Control": "no-store" },
      });
      const data = await res.json();
      setHeadroomStatus({ ...data, loading: false });
      if (!data?.installed) {
        setHeadroomExtras({
          version: null,
          extras: { code: false, ml: false },
          available: ["code", "ml"],
          loading: false,
        });
        setPendingExtras([]);
        return;
      }
      try {
        const er = await fetch("/api/headroom/extras", {
          headers: { "Cache-Control": "no-store" },
        });
        if (!er.ok) throw new Error("extras status failed");
        const ed = await er.json();
        setHeadroomExtras((s) => ({
          ...s,
          version: ed.version ?? null,
          extras: ed.extras || { code: false, ml: false },
          available: ed.available || ["code", "ml"],
          loading: false,
        }));
        setPendingExtras([]);
      } catch {
        setHeadroomExtras({
          version: null,
          extras: { code: false, ml: false },
          available: ["code", "ml"],
          loading: false,
        });
        setPendingExtras([]);
      }
    } catch {
      setHeadroomStatus({
        installed: false,
        running: false,
        python: null,
        loading: false,
      });
      setHeadroomExtras({
        version: null,
        extras: { code: false, ml: false },
        available: ["code", "ml"],
        loading: false,
      });
      setPendingExtras([]);
    }
  }, []);

  const handleHeadroomStart = useCallback(async () => {
    setHeadroomActionError("");
    setHeadroomActionLoading(true);
    try {
      const res = await fetch("/api/headroom/start", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to start proxy");
      await refreshHeadroomStatus();
    } catch (e) {
      setHeadroomActionError((e as Error).message);
    } finally {
      setHeadroomActionLoading(false);
    }
  }, [refreshHeadroomStatus]);

  const handleHeadroomStop = useCallback(async () => {
    setHeadroomActionLoading(true);
    try {
      await fetch("/api/headroom/stop", { method: "POST" });
      await refreshHeadroomStatus();
    } finally {
      setHeadroomActionLoading(false);
    }
  }, [refreshHeadroomStatus]);

  const togglePendingExtra = (extra: string) => {
    setPendingExtras((cur) =>
      cur.includes(extra) ? cur.filter((e) => e !== extra) : [...cur, extra],
    );
  };

  // Poll the install log tail while a pip install/uninstall is running.
  const startLogPolling = useCallback(() => {
    setInstallLog("");
    if (logPollRef.current) clearInterval(logPollRef.current);
    const tick = async () => {
      try {
        const r = await fetch("/api/headroom/extras?log=1", {
          headers: { "Cache-Control": "no-store" },
        });
        const d = await r.json().catch(() => ({}));
        if (typeof d.log === "string") setInstallLog(d.log);
      } catch {
        /* ignore transient poll errors */
      }
    };
    tick();
    logPollRef.current = setInterval(tick, 1500);
  }, []);

  const stopLogPolling = useCallback(() => {
    if (logPollRef.current) {
      clearInterval(logPollRef.current);
      logPollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopLogPolling(), [stopLogPolling]);

  const installExtrasConfirmed = useCallback(async () => {
    if (pendingExtras.length === 0) return;
    setExtrasActionLoading(true);
    setExtrasActionError("");
    startLogPolling();
    try {
      const res = await fetch("/api/headroom/extras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extras: pendingExtras }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Install failed");
      setHeadroomExtras((s) => ({
        ...s,
        version: data.version ?? s.version,
        extras: data.extras || s.extras,
      }));
      setPendingExtras([]);
    } catch (e) {
      setExtrasActionError((e as Error).message);
    } finally {
      stopLogPolling();
      setExtrasActionLoading(false);
    }
  }, [pendingExtras, startLogPolling, stopLogPolling]);

  const removeExtraConfirmed = useCallback(
    async (extra: string) => {
      setRemovingExtra(extra);
      setExtrasActionError("");
      startLogPolling();
      try {
        const res = await fetch("/api/headroom/extras", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ extras: [extra] }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Remove failed");
        setHeadroomExtras((s) => ({
          ...s,
          version: data.version ?? s.version,
          extras: data.extras || s.extras,
        }));
      } catch (e) {
        setExtrasActionError((e as Error).message);
      } finally {
        stopLogPolling();
        setRemovingExtra(null);
      }
    },
    [startLogPolling, stopLogPolling],
  );

  const handleInstallExtras = useCallback(() => {
    if (pendingExtras.length === 0) return;
    // Warn about the heavy ~1GB torch download before installing [ml].
    if (pendingExtras.includes("ml")) {
      setExtrasConfirm({
        title: "Install [ml]",
        message: "[ml] downloads ~1 GB (torch + huggingface-hub). Continue?",
        confirmText: "Install",
        variant: "default",
        onConfirm: installExtrasConfirmed,
      });
      return;
    }
    installExtrasConfirmed();
  }, [pendingExtras, installExtrasConfirmed]);

  const handleRemoveExtra = useCallback(
    (extra: string) => {
      setExtrasConfirm({
        title: `Remove [${extra}]`,
        message: `Remove [${extra}] and its packages?`,
        confirmText: "Remove",
        variant: "destructive",
        onConfirm: () => removeExtraConfirmed(extra),
      });
    },
    [removeExtraConfirmed],
  );

  // Toggle an extra's active state (persist setting), then restart the proxy so
  // the new --code-aware / --disable-kompress flags take effect.
  const toggleExtraActive = useCallback(
    async (extra: string, value: boolean) => {
      setExtrasActionError("");
      if (extra === "code") setCodeAware(value);
      if (extra === "ml") setKompress(value);
      const key = extra === "code" ? "headroomCodeAware" : "headroomKompress";
      await patchSetting({ [key]: value });
      if (!headroomStatus.running) return;
      setRestartingProxy(true);
      try {
        const res = await fetch("/api/headroom/restart", { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Restart failed");
        await refreshHeadroomStatus();
      } catch (e) {
        setExtrasActionError((e as Error).message);
      } finally {
        setRestartingProxy(false);
      }
    },
    [headroomStatus.running, refreshHeadroomStatus],
  );

  const handleCavemanLevel = (level: string) => {
    setCavemanLevel(level);
    patchSetting({ cavemanLevel: level });
  };

  const handlePonytailEnabled = (value: boolean) => {
    setPonytailEnabled(value);
    patchSetting({ ponytailEnabled: value });
  };

  const handlePonytailLevel = (level: string) => {
    setPonytailLevel(level);
    patchSetting({ ponytailLevel: level });
  };

  const refreshPxpipeStatus = useCallback(async () => {
    setPxpipeStatus((s) => ({ ...s, loading: true }));
    try {
      const res = await fetch("/api/pxpipe/status", {
        headers: { "Cache-Control": "no-store" },
      });
      const data = await res.json();
      setPxpipeStatus({ ...data, loading: false });
      if (typeof data.minChars === "number") setPxpipeMinChars(data.minChars);
    } catch {
      setPxpipeStatus({
        installed: false,
        installing: false,
        running: false,
        version: null,
        loading: false,
      });
    }
  }, []);

  const runPxpipeHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/pxpipe/health", { method: "POST" });
      setPxpipeHealth(await res.json());
    } catch (e) {
      setPxpipeHealth({ healthy: false, checks: [], error: (e as Error).message });
    }
  }, []);

  const pxpipeAction = useCallback(
    async (endpoint: string) => {
      setPxpipeActionError("");
      setPxpipeActionLoading(true);
      try {
        const res = await fetch(`/api/pxpipe/${endpoint}`, { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `PXPIPE ${endpoint} failed`);
        await refreshPxpipeStatus();
        await runPxpipeHealth();
      } catch (e) {
        setPxpipeActionError((e as Error).message);
      } finally {
        setPxpipeActionLoading(false);
      }
    },
    [refreshPxpipeStatus, runPxpipeHealth],
  );

  const handlePxpipeEnabled = (value: boolean) => {
    setPxpipeEnabled(value);
    patchSetting({ pxpipeEnabled: value });
  };

  const handlePxpipeMinCharsBlur = () => {
    const next = Math.max(0, Number(pxpipeMinChars) || 25000);
    setPxpipeMinChars(next);
    patchSetting({ pxpipeMinChars: next });
  };

  const handleHeadroomTimeoutBlur = () => {
    const raw = Math.round(Number(headroomTimeoutMs));
    const next = Number.isFinite(raw) && raw > 0 ? raw : 3000;
    setHeadroomTimeoutMs(next);
    patchSetting({ headroomTimeoutMs: next });
  };

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const data = await res.json();
          setRtkEnabledState(data.rtkEnabled !== false);
          setHeadroomEnabled(!!data.headroomEnabled);
          setHeadroomUrl(data.headroomUrl || "http://localhost:8787");
          if (typeof data.headroomTimeoutMs === "number")
            setHeadroomTimeoutMs(data.headroomTimeoutMs);
          setCodeAware(data.headroomCodeAware === true);
          setKompress(data.headroomKompress !== false);
          setCavemanEnabled(!!data.cavemanEnabled);
          setCavemanLevel(data.cavemanLevel || "full");
          setPonytailEnabled(!!data.ponytailEnabled);
          setPonytailLevel(data.ponytailLevel || "full");
          setPxpipeEnabled(!!data.pxpipeEnabled);
          if (typeof data.pxpipeMinChars === "number") setPxpipeMinChars(data.pxpipeMinChars);
          refreshHeadroomStatus();
          // PRD: run the PXPIPE health check automatically when the page opens
          refreshPxpipeStatus().then(runPxpipeHealth);
        }
      } catch {}
    };
    loadSettings();
  }, [refreshHeadroomStatus, refreshPxpipeStatus, runPxpipeHealth]);

  const headroomRunning = !!headroomStatus.running;
  const headroomStatusLabel = headroomStatus.loading
    ? "Checking…"
    : headroomRunning
      ? "Running"
      : headroomStatus.localUrl !== false && !headroomStatus.installed
        ? "Not installed"
        : headroomStatus.localUrl !== false
          ? "Stopped"
          : "External";
  const headroomLocalUrl = headroomStatus.localUrl !== false;
  const headroomCanStart = !!headroomStatus.canStart;
  const headroomManaged = headroomLocalUrl && !!headroomStatus.managedPid;

  const pxpipeHealthy = pxpipeHealth?.healthy === true;
  const pxpipeStatusLabel = pxpipeStatus.loading
    ? "Checking…"
    : pxpipeStatus.installing
      ? "Installing…"
      : !pxpipeStatus.installed
        ? "Not installed"
        : pxpipeHealthy
          ? "Healthy"
          : pxpipeStatus.running
            ? "Running"
            : "Stopped";

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Zap className="text-primary" />
            Token Saver
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SettingRow
            title="Compress tool output"
            titleLink="https://github.com/rtk-ai/rtk"
            titleLinkLabel="RTK"
            desc="git/grep/ls/tree/logs → 60-90% fewer input tokens"
          >
            <Switch checked={rtkEnabled} onCheckedChange={() => handleRtkEnabled(!rtkEnabled)} />
          </SettingRow>

          <div className="border-t border-border">
            <SettingRow
              title="Compress context"
              titleLink="https://github.com/chopratejas/headroom"
              titleLinkLabel="Headroom"
              desc="Compress prompts via /v1/compress before routing to the model"
            >
              <span
                className={`rounded px-2 py-0.5 text-xs ${headroomRunning ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-600"}`}
              >
                {headroomStatusLabel}
              </span>
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={() => setShowHeadroomInstallModal(true)}
                className="h-auto px-0 text-xs"
              >
                {headroomRunning ? "Manage" : "Setup"}
              </Button>
              <Switch
                checked={headroomEnabled}
                onCheckedChange={() => handleHeadroomEnabled(!headroomEnabled)}
              />
            </SettingRow>
            {headroomStatus.installed && (
              <div className="mb-3 ml-1 border-l-2 border-border pb-4 pl-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    Compression extras
                    {headroomExtras.version ? ` · v${headroomExtras.version}` : ""}:
                  </span>
                  {headroomExtras.available.map((extra) => {
                    const installed =
                      !!headroomExtras.extras[extra as keyof typeof headroomExtras.extras];
                    const pending = pendingExtras.includes(extra);
                    const extraTitle =
                      extra === "code"
                        ? "tree-sitter AST compression for code responses"
                        : "Kompress-v2 HF model for prose/agentic traces (~+1GB)";

                    if (installed) {
                      const active = extra === "code" ? codeAware : kompress;
                      return (
                        <Tooltip key={extra}>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-1.5 rounded border border-emerald-500/40 bg-emerald-500/5 px-2 py-1 text-xs text-foreground">
                              <Switch
                                checked={active}
                                disabled={restartingProxy}
                                onCheckedChange={() => toggleExtraActive(extra, !active)}
                                size="sm"
                              />
                              <span className="font-medium">[{extra}]</span>
                              <Button
                                type="button"
                                variant="link"
                                size="sm"
                                onClick={() => handleRemoveExtra(extra)}
                                disabled={removingExtra === extra}
                                className="h-auto px-0 text-xs text-destructive"
                              >
                                {removingExtra === extra ? "Uninstalling…" : "Uninstall"}
                              </Button>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>{extraTitle}</TooltipContent>
                        </Tooltip>
                      );
                    }

                    return (
                      <Tooltip key={extra}>
                        <TooltipTrigger asChild>
                          <label
                            className={`flex cursor-pointer items-center gap-1.5 rounded border px-2 py-1 text-xs transition-colors ${
                              pending
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border text-muted-foreground hover:bg-muted"
                            }`}
                          >
                            <Checkbox
                              className="size-3 [&_svg]:size-2"
                              checked={pending}
                              onCheckedChange={() => togglePendingExtra(extra)}
                            />
                            <span className="font-medium">[{extra}]</span>
                            <span className="opacity-70">not installed</span>
                          </label>
                        </TooltipTrigger>
                        <TooltipContent>{extraTitle}</TooltipContent>
                      </Tooltip>
                    );
                  })}
                  {pendingExtras.length > 0 && (
                    <Button size="sm" onClick={handleInstallExtras} disabled={extrasActionLoading}>
                      {extrasActionLoading
                        ? "Installing…"
                        : `Install [proxy,${pendingExtras.join(",")}]`}
                    </Button>
                  )}
                </div>
                {extrasActionError && (
                  <p className="mt-1 text-xs text-destructive">{extrasActionError}</p>
                )}
                {restartingProxy && (
                  <p className="mt-1 text-xs text-muted-foreground">Restarting proxy…</p>
                )}
                {(extrasActionLoading || removingExtra) && installLog && (
                  <pre className="mt-2 max-h-32 overflow-auto rounded bg-muted p-2 text-[10px] leading-tight whitespace-pre-wrap text-muted-foreground">
                    {installLog}
                  </pre>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  Installing adds the package; use <code>on</code>/<code>off</code> to activate it
                  (restarts the proxy). Default install is <code>[proxy]</code> only (SmartCrusher
                  for JSON). Adding <code>[code]</code> enables AST compression
                  (Python/JS/TS/Go/Rust/Java/C/C++/Perl). Adding <code>[ml]</code> enables the
                  Kompress-v2 HF model for prose/agentic traces but adds ~1 GB (torch +
                  huggingface-hub).
                </p>
              </div>
            )}
          </div>

          <div className="border-t border-border">
            <SettingRow
              title="Compress LLM output"
              titleLink="https://github.com/JuliusBrussee/caveman"
              titleLinkLabel="Caveman"
              desc="Terse-style system prompt → ~65% fewer output tokens (up to 87%)"
            >
              {cavemanEnabled && (
                <LevelPicker
                  levels={visibleCavemanLevels}
                  value={cavemanLevel}
                  onPick={handleCavemanLevel}
                />
              )}
              <Switch
                checked={cavemanEnabled}
                onCheckedChange={() => handleCavemanEnabled(!cavemanEnabled)}
              />
            </SettingRow>
          </div>

          <div className="border-t border-border">
            <SettingRow
              title="Lazy senior dev"
              titleLink="https://github.com/DietrichGebert/ponytail"
              titleLinkLabel="Ponytail"
              desc="Bias the model toward minimal code: YAGNI, reuse stdlib, deletion over addition"
            >
              {ponytailEnabled && (
                <LevelPicker
                  levels={PONYTAIL_LEVELS}
                  value={ponytailLevel}
                  onPick={handlePonytailLevel}
                />
              )}
              <Switch
                checked={ponytailEnabled}
                onCheckedChange={() => handlePonytailEnabled(!ponytailEnabled)}
              />
            </SettingRow>
          </div>

          {/* PXPIPE hidden from UI — experimental, not exposed to users yet */}
          {false && (
            <div className="border-t border-border">
              <SettingRow
                title="Compress prompts as images"
                titleLink="https://github.com/teamchong/pxpipe"
                titleLinkLabel="PXPIPE"
                desc="Transforms large textual context into optimized images before sending to the LLM. Ideal for huge prompts, tool outputs and long conversations."
              >
                <span
                  className={`rounded px-2 py-0.5 text-xs ${pxpipeHealthy || pxpipeStatus.running ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-600"}`}
                >
                  {pxpipeStatusLabel}
                </span>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  onClick={() => setShowPxpipeModal(true)}
                  className="h-auto px-0 text-xs"
                >
                  {pxpipeStatus.installed ? "Manage" : "Setup"}
                </Button>
                <a
                  href="/dashboard/pxpipe"
                  className="text-xs text-primary underline hover:opacity-80"
                >
                  Dashboard
                </a>
                <Switch
                  checked={pxpipeEnabled}
                  disabled={!pxpipeStatus.installed}
                  onCheckedChange={() => handlePxpipeEnabled(!pxpipeEnabled)}
                />
              </SettingRow>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showHeadroomInstallModal} onOpenChange={setShowHeadroomInstallModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{headroomRunning ? "Headroom" : "Setup Headroom"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 p-4">
            <div className="flex items-center justify-between text-sm">
              <span>Status</span>
              <span className={headroomRunning ? "text-emerald-600" : "text-amber-600"}>
                {headroomStatusLabel}
              </span>
            </div>
            {headroomRunning && (
              <a
                href="/api/headroom/proxy/dashboard"
                target="_blank"
                rel="noreferrer"
                className="w-full rounded border border-border px-4 py-2 text-center text-sm hover:bg-muted"
              >
                Open Headroom Dashboard
              </a>
            )}
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">Proxy URL</p>
              <Input
                value={headroomUrl}
                onChange={(e) => setHeadroomUrl(e.target.value)}
                onBlur={handleHeadroomUrlBlur}
                placeholder="http://localhost:8787"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Use a local proxy for Start/Stop, or an external Docker sidecar like
                http://headroom:8787.
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">Timeout (ms)</p>
              <Input
                value={String(headroomTimeoutMs)}
                onChange={(e) => setHeadroomTimeoutMs(e.target.value)}
                onBlur={handleHeadroomTimeoutBlur}
                placeholder="3000"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Request timeout in milliseconds. Defaults to 3000 ms.
              </p>
            </div>
            {headroomManaged ? (
              <Button
                onClick={handleHeadroomStop}
                variant="ghost"
                className="w-full"
                disabled={headroomActionLoading}
              >
                {headroomActionLoading ? "Stopping…" : "Stop Headroom"}
              </Button>
            ) : headroomRunning ? (
              <p className="text-sm text-emerald-600">
                Headroom proxy is reachable. You can enable the token saver.
              </p>
            ) : headroomCanStart ? (
              <Button
                onClick={handleHeadroomStart}
                className="w-full"
                disabled={headroomActionLoading}
              >
                {headroomActionLoading ? "Starting…" : "Start Headroom"}
              </Button>
            ) : !headroomLocalUrl ? (
              <p className="text-sm text-amber-600">
                Start Headroom separately at the configured URL, then recheck.
              </p>
            ) : !headroomStatus.python ? (
              <p className="text-sm text-amber-600">
                Python ≥ 3.10 required for local managed mode. Install Python first, or use an
                external proxy URL.
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">Install then click Start:</p>
                <div className="flex items-center gap-2">
                  <pre className="flex-1 overflow-x-auto rounded bg-black/5 p-2 font-mono text-xs dark:bg-white/5">
                    {`pip install "headroom-ai[proxy]"`}
                  </pre>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copy(`pip install "headroom-ai[proxy]"`)}
                  >
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>
            )}
            {headroomActionError && <p className="text-sm text-amber-600">{headroomActionError}</p>}
          </div>
          <DialogFooter>
            <Button onClick={() => refreshHeadroomStatus()} variant="ghost" className="w-full">
              Recheck
            </Button>
            <Button onClick={() => setShowHeadroomInstallModal(false)} className="w-full">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showPxpipeModal} onOpenChange={setShowPxpipeModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{pxpipeStatus.installed ? "PXPIPE" : "Setup PXPIPE"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 p-4">
            <p className="text-sm text-muted-foreground">
              Compress prompts using multimodal encoding. Runs in-process — no extra server or
              environment variables required.
            </p>
            <div className="flex items-center justify-between text-sm">
              <span>Status</span>
              <span
                className={
                  pxpipeHealthy || pxpipeStatus.running ? "text-emerald-600" : "text-amber-600"
                }
              >
                {pxpipeStatusLabel}
                {pxpipeStatus.version ? ` · v${pxpipeStatus.version}` : ""}
              </span>
            </div>
            {(pxpipeHealth?.checks?.length ?? 0) > 0 && (
              <div className="flex flex-col gap-1 rounded border border-border p-3">
                <p className="mb-1 text-sm font-medium">Health check</p>
                {pxpipeHealth!.checks!.map((check) => (
                  <div key={check.id} className="flex items-center justify-between text-xs">
                    <span className={check.ok ? "text-emerald-600" : "text-amber-600"}>
                      {check.ok ? "●" : "○"} {check.label}
                    </span>
                    {check.detail && (
                      <span className="max-w-[50%] truncate font-mono text-muted-foreground">
                        {check.detail}
                      </span>
                    )}
                  </div>
                ))}
                {pxpipeHealth!.error && (
                  <p className="mt-1 text-xs text-amber-600">{pxpipeHealth!.error}</p>
                )}
              </div>
            )}
            {!pxpipeStatus.installed ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-amber-600">PXPIPE is not installed.</p>
                <Button
                  onClick={() => pxpipeAction("install")}
                  className="w-full"
                  disabled={pxpipeActionLoading || pxpipeStatus.installing}
                >
                  {pxpipeActionLoading || pxpipeStatus.installing ? "Installing…" : "Install"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Installs the npm package <code className="font-mono">pxpipe-proxy</code> into the
                  10Router data directory. May take a few minutes.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {pxpipeStatus.running ? (
                  <>
                    <Button
                      onClick={() => pxpipeAction("restart")}
                      variant="ghost"
                      disabled={pxpipeActionLoading}
                    >
                      Restart
                    </Button>
                    <Button
                      onClick={() => pxpipeAction("stop")}
                      variant="ghost"
                      disabled={pxpipeActionLoading}
                    >
                      Stop
                    </Button>
                  </>
                ) : (
                  <Button onClick={() => pxpipeAction("start")} disabled={pxpipeActionLoading}>
                    {pxpipeActionLoading ? "Starting…" : "Start"}
                  </Button>
                )}
                <Button
                  onClick={() => pxpipeAction("install")}
                  variant="ghost"
                  disabled={pxpipeActionLoading}
                >
                  Repair
                </Button>
                <a
                  href="/dashboard/pxpipe#logs"
                  className="col-span-2 rounded border border-border px-4 py-2 text-center text-sm hover:bg-muted"
                >
                  Open Logs
                </a>
              </div>
            )}
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">Minimum prompt size (chars)</p>
              <Input
                value={String(pxpipeMinChars)}
                onChange={(e) => setPxpipeMinChars(e.target.value)}
                onBlur={handlePxpipeMinCharsBlur}
                placeholder="25000"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Requests smaller than this bypass PXPIPE and are sent as-is.
              </p>
            </div>
            {pxpipeActionError && <p className="text-sm text-amber-600">{pxpipeActionError}</p>}
          </div>
          <DialogFooter>
            <Button
              onClick={() => refreshPxpipeStatus().then(runPxpipeHealth)}
              variant="ghost"
              className="w-full"
            >
              Recheck
            </Button>
            <Button onClick={() => setShowPxpipeModal(false)} className="w-full">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!extrasConfirm} onOpenChange={(open) => !open && setExtrasConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{extrasConfirm?.title ?? "Confirm"}</DialogTitle>
          </DialogHeader>
          <div className="p-4">
            <DialogDescription>{extrasConfirm?.message}</DialogDescription>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button
              variant={extrasConfirm?.variant === "destructive" ? "destructive" : "default"}
              onClick={() => {
                const fn = extrasConfirm?.onConfirm;
                setExtrasConfirm(null);
                fn?.();
              }}
            >
              {extrasConfirm?.confirmText ?? "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
