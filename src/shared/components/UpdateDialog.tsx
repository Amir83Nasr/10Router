"use client";

import { Loader2 } from "lucide-react";
import Icon from "@/shared/components/Icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { useShutdown } from "@/shared/hooks/useShutdown";

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
}

interface UpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  info: UpdateInfo | null;
  checkFailed: boolean;
  onRetry: () => void;
}

const NPM_PKG = "@amir83nasr/10router";

const COMPOSE_STEPS = ["docker compose pull", "docker compose up -d"];

const DOCKER_STEPS = [
  "docker pull ghcr.io/amir83nasr/10router:latest",
  "docker stop 10router && docker rm 10router",
  'docker run -d --name 10router -p 20128:20128 -v "$HOME/.10router:/app/data" -e DATA_DIR=/app/data ghcr.io/amir83nasr/10router:latest',
];

const SOURCE_STEPS = ["git pull", "pnpm install", "pnpm run build && PORT=20128 pnpm run start"];

function StepList({ id, steps }: { id: string; steps: string[] }) {
  const { copied, copy } = useCopyToClipboard();
  return (
    <ol className="flex flex-col gap-1.5">
      {steps.map((cmd, i) => {
        const key = `${id}-${i}`;
        const done = copied === key;
        return (
          <li key={key} className="flex items-center gap-2 text-sm">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground">
              {i + 1}
            </span>
            <code className="min-w-0 flex-1 rounded bg-muted px-2 py-1 font-mono text-xs break-all">
              {cmd}
            </code>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => copy(cmd, key)}
              aria-label={`Copy step ${i + 1}: ${cmd}`}
            >
              <Icon name={done ? "check" : "content_copy"} className="size-3.5" />
            </Button>
          </li>
        );
      })}
    </ol>
  );
}

function CollapsibleMethod({
  title,
  icon,
  id,
  steps,
}: {
  title: string;
  icon: string;
  id: string;
  steps: string[];
}) {
  return (
    <details className="group rounded-lg border border-border">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
        <Icon name={icon} className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex-1">{title}</span>
        <Icon
          name="expand_more"
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="px-3 py-2">
        <StepList id={id} steps={steps} />
      </div>
    </details>
  );
}

function OtherMethods() {
  return (
    <details className="group flex flex-col gap-2 rounded-lg border border-border p-3">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
        <Icon name="terminal" className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex-1">Other install methods</span>
        <Icon
          name="expand_more"
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="flex flex-col gap-2 py-2">
        <CollapsibleMethod title="Docker Compose" icon="lan" id="compose" steps={COMPOSE_STEPS} />
        <CollapsibleMethod title="Plain Docker run" icon="dns" id="docker" steps={DOCKER_STEPS} />
        <CollapsibleMethod title="From source" icon="code" id="source" steps={SOURCE_STEPS} />
      </div>
    </details>
  );
}

// ── NPM UPDATE FLOW ───────────────────────────────────────────────────
// Copy the install command first; the shutdown button appears only after
// the copy is confirmed, so the server never goes down before the user
// holds the command. Shutdown reuses useShutdown (same POST + health poll
// as the header/profile buttons).
function NpmMethod() {
  const { copied, copy } = useCopyToClipboard();
  const shutdown = useShutdown();
  const cmd = `npm i -g ${NPM_PKG}@latest`;
  const key = "npm-0";
  const done = copied === key;

  return (
    <Card size="sm" className="border-primary/30 bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon name="upload" className="size-4 shrink-0 text-primary" />
          npm <Badge variant="default">recommended</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 text-sm">
          <code className="min-w-0 flex-1 rounded bg-muted px-2 py-1 font-mono text-xs break-all">
            {cmd}
          </code>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => copy(cmd, key)}
            aria-label={`Copy: ${cmd}`}
          >
            <Icon name={done ? "check" : "content_copy"} className="size-3.5" />
          </Button>
        </div>
        {done && !shutdown.stopped && !shutdown.timedOut && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              Copied. Stop the server, paste the command in your terminal, then run{" "}
              <code className="rounded bg-muted px-1 font-mono">10router start</code>.
            </p>
            <Button
              variant="destructive"
              size="sm"
              className="self-start"
              onClick={shutdown.confirm}
              disabled={shutdown.shuttingDown}
            >
              {shutdown.shuttingDown ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Icon name="power_settings_new" className="size-4" />
              )}
              {shutdown.shuttingDown ? "Stopping…" : "Stop server"}
            </Button>
          </div>
        )}
        {shutdown.stopped && (
          <p className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs text-green-600 dark:text-green-400">
            Server stopped — run the copied command in your terminal, then{" "}
            <code className="font-mono">10router start</code>.
          </p>
        )}
        {shutdown.timedOut && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
            The server did not stop in time — stop it manually (
            <code className="font-mono">10router stop</code>), then run the copied command.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function UpdateDialog({
  open,
  onOpenChange,
  info,
  checkFailed,
  onRetry,
}: UpdateDialogProps) {
  const status = !info ? (
    <p className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
      {checkFailed
        ? "Could not reach GitHub to check for updates — the manual steps below still work."
        : "Checking for updates…"}
    </p>
  ) : info.hasUpdate ? (
    <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
      New version v{info.latestVersion} available (you run v{info.currentVersion}). npm is the
      fastest way — or run the steps for your install method, in order:
    </p>
  ) : (
    <p className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-600 dark:text-green-400">
      Up to date — v{info.currentVersion} is the latest.
    </p>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Updates</DialogTitle>
          <DialogDescription>
            {info
              ? `Current v${info.currentVersion} · latest v${info.latestVersion}`
              : "Compare your version against the latest release"}
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto p-4">
          {status}
          <NpmMethod />
          <OtherMethods />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onRetry}>
            <Icon name="refresh" className="size-4" />
            Check again
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
