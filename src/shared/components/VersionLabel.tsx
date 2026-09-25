"use client";

import { useCallback, useEffect, useState } from "react";
import { APP_CONFIG } from "@/shared/constants/config";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import Icon from "@/shared/components/Icon";
import UpdateDialog, { type UpdateInfo } from "@/shared/components/UpdateDialog";
import { cn } from "@/shared/utils/cn";

export default function VersionLabel({ collapsed }: { collapsed?: boolean }) {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [checkFailed, setCheckFailed] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/version", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setInfo({
        currentVersion: data?.currentVersion ?? APP_CONFIG.version,
        latestVersion: data?.latestVersion ?? APP_CONFIG.version,
        hasUpdate: !!data?.hasUpdate,
      });
      setCheckFailed(false);
    } catch {
      // Fail-open: footer keeps local version, dialog still shows manual steps.
      setCheckFailed(true);
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- mount-time version fetch, same as other dashboard pages */
  useEffect(() => {
    load();
    const id = setInterval(load, 30 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const hasUpdate = info?.hasUpdate ?? false;
  const label = hasUpdate
    ? `v${info?.latestVersion} available`
    : info
      ? `v${info.currentVersion} · up to date`
      : `v${APP_CONFIG.version}`;

  const trigger = collapsed ? (
    <Tooltip>
      <TooltipTrigger asChild>
        {hasUpdate ? (
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            aria-label={`Update available. ${label}`}
            className="relative mx-auto flex size-8 items-center justify-center rounded-md bg-amber-500/15 text-amber-600 transition-colors hover:bg-amber-500/25 dark:text-amber-400"
          >
            <Icon name="download" className="size-4" />
            <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-amber-500" />
          </button>
        ) : (
          <span className="mx-auto flex size-8 items-center justify-center rounded-md text-muted-foreground">
            <Icon name="refresh" className="size-4" />
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent>{hasUpdate ? `${label} — click to update` : label}</TooltipContent>
    </Tooltip>
  ) : hasUpdate ? (
    <button
      type="button"
      onClick={() => setDialogOpen(true)}
      className="flex w-full items-center gap-2 rounded-md bg-amber-500/15 px-1 py-1 text-left transition-colors hover:bg-amber-500/25"
      aria-label={`Update available. ${label}`}
    >
      <span className="relative flex shrink-0 items-center text-muted-foreground">
        <Icon name="download" className="size-4" />
        <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-amber-500" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] text-muted-foreground">
          {APP_CONFIG.name} v{info?.currentVersion ?? APP_CONFIG.version}
        </span>
        <span className="block truncate text-[11px] font-medium text-amber-600 dark:text-amber-400">
          {label}
        </span>
      </span>
      <Icon name="chevron_right" className="size-3.5 shrink-0 text-muted-foreground" />
    </button>
  ) : (
    <div className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left">
      <span className="flex shrink-0 items-center text-muted-foreground">
        <Icon name="refresh" className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] text-muted-foreground">
          {APP_CONFIG.name} v{info?.currentVersion ?? APP_CONFIG.version}
        </span>
        <span
          className={cn(
            "block truncate text-[11px] font-medium",
            checkFailed || !info ? "text-muted-foreground" : "text-green-600 dark:text-green-400",
          )}
        >
          {label}
        </span>
      </span>
    </div>
  );

  return (
    <>
      {trigger}
      <UpdateDialog
        open={dialogOpen && hasUpdate}
        onOpenChange={setDialogOpen}
        info={info}
        checkFailed={checkFailed}
        onRetry={load}
      />
    </>
  );
}
