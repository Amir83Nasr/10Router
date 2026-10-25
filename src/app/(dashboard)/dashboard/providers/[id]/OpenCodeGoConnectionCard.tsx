"use client";
import Icon from "@/shared/components/Icon";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OPENCODE_URLS } from "open-sse/config/opencodeErrors.js";
import {
  OPENCODE_GO_DOCS_URL,
  OPENCODE_GO_ENDPOINTS,
  OPENCODE_GO_PLANS,
  OPENCODE_GO_SETUP_NOTES,
} from "open-sse/config/opencodeGo.js";

interface OpenCodeGoConnectionCardProps {
  connectionCount: number;
  activeCount: number;
  onAddConnection: () => void;
}

const SETUP_STEPS = [
  "Subscribe to a Go plan in the OpenCode Console.",
  "Copy your OpenCode API key from the same account.",
  "Add it as a connection below. The x-opencode-session header is set automatically.",
];

export default function OpenCodeGoConnectionCard({
  connectionCount,
  activeCount,
  onAddConnection,
}: OpenCodeGoConnectionCardProps) {
  const statusText =
    connectionCount === 0 ? "No connections yet" : `${activeCount} of ${connectionCount} active`;

  return (
    <Card>
      <CardContent>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">OpenCode Go Connection</h2>
            <p className="text-sm text-muted-foreground">{statusText}</p>
          </div>
          <Button size="sm" onClick={onAddConnection} className="w-full sm:w-auto">
            <Icon name="add" />
            Add Connection
          </Button>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {OPENCODE_GO_PLANS.map((plan) => (
            <div
              key={plan.id}
              className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
            >
              <span className="text-sm font-medium">{plan.name}</span>
              <span className="text-sm text-muted-foreground">{plan.price}</span>
            </div>
          ))}
        </div>

        <div className="mb-4">
          <h3 className="mb-2 text-sm font-medium">Endpoints</h3>
          <ul className="flex flex-col gap-2">
            {OPENCODE_GO_ENDPOINTS.map((endpoint) => (
              <li
                key={endpoint.format}
                className="flex flex-col gap-0.5 rounded-lg border border-border px-3 py-2"
              >
                <span className="text-sm font-medium">{endpoint.label}</span>
                <code className="break-all text-xs text-muted-foreground">{endpoint.url}</code>
                <span className="text-xs text-muted-foreground">{endpoint.note}</span>
              </li>
            ))}
          </ul>
        </div>

        <ol className="mb-4 flex list-decimal flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
          {SETUP_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>

        <ul className="mb-4 flex flex-col gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs leading-relaxed text-blue-600 dark:text-blue-400">
          {OPENCODE_GO_SETUP_NOTES.map((note) => (
            <li key={note} className="flex gap-2">
              <Icon name="info" className="mt-0.5 text-[16px] shrink-0" />
              <span className="min-w-0">{note}</span>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
          <a
            href={OPENCODE_URLS.go}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Subscribe to Go
            <Icon name="open_in_new" className="text-sm" />
          </a>
          <a
            href={OPENCODE_GO_DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            OpenCode Go docs
            <Icon name="open_in_new" className="text-sm" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
