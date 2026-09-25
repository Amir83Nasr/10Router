"use client";

import Link from "next/link";
import { useParams, notFound } from "next/navigation";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Icon from "@/shared/components/Icon";
import ProviderIcon from "@/shared/components/ProviderIcon";
import NoAuthProxyCard from "@/shared/components/NoAuthProxyCard";
import ProviderInfoCard from "@/shared/components/ProviderInfoCard";
import ConnectionsCard from "@/app/(dashboard)/dashboard/providers/components/ConnectionsCard";
import ModelsCard from "@/app/(dashboard)/dashboard/providers/components/ModelsCard";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import {
  MEDIA_PROVIDER_KINDS,
  AI_PROVIDERS,
  getProviderAlias,
  getProviderByAlias,
} from "@/shared/constants/providers";
import { getModelsByProviderId, getModelKind } from "@/shared/constants/models";

// ── ROW ──────────────────────────────────────────────────
function Row({ label, children }: any) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      <span className="w-full text-xs font-medium text-muted-foreground sm:w-20 sm:shrink-0">
        {label}
      </span>
      <div className="w-full min-w-0 flex-1">{children}</div>
    </div>
  );
}

// ── DEFAULTS ─────────────────────────────────────────────
const DEFAULT_STATE =
  "My payments have failed for three days and I am losing sales. Please help now.";
const DEFAULT_QUESTION = "Does this request require urgent attention?";

export default function SystemOneProviderPage() {
  const { id } = useParams();
  const kindConfig = MEDIA_PROVIDER_KINDS.find((k) => k.id === "systemone");
  if (!kindConfig) return notFound();

  const provider =
    (AI_PROVIDERS as Record<string, any>)[id as string] || getProviderByAlias(id as string);
  if (!provider) return notFound();
  const providerId = provider.id;
  const kinds: string[] = provider.serviceKinds ?? ["llm"];
  if (!kinds.includes("systemone")) return notFound();

  const providerAlias = getProviderAlias(providerId);
  const kindModels = getModelsByProviderId(providerId).filter(
    (m) => getModelKind(m) === "systemone",
  );

  const [selectedModel, setSelectedModel] = useState(kindModels[0]?.id ?? "");
  const [state, setState] = useState(DEFAULT_STATE);
  const [question, setQuestion] = useState(DEFAULT_QUESTION);
  const [apiKey, setApiKey] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [localEndpoint, setLocalEndpoint] = useState("");
  const { copied: copiedCurl, copy: copyCurl } = useCopyToClipboard();
  const { copied: copiedRes, copy: copyRes } = useCopyToClipboard();

  useEffect(() => {
    setLocalEndpoint(window.location.origin);
    fetch("/api/keys")
      .then((r) => r.json())
      .then((d) => {
        setApiKey((d.keys || []).find((k: any) => k.isActive !== false)?.key || "");
      })
      .catch(() => {});
  }, []);

  const modelFull = selectedModel ? `${providerAlias}/${selectedModel}` : providerAlias;
  const requestBody = {
    model: modelFull,
    state,
    questions: {
      is_urgent: { type: "noul", instructions: question.trim() || DEFAULT_QUESTION },
    },
  };

  const endpoint = localEndpoint || window.location.origin;
  const apiPath = kindConfig.endpoint.path;
  const curlSnippet =
    `curl -X ${kindConfig.endpoint.method} ${endpoint}${apiPath} \\\n` +
    `  -H "Content-Type: application/json" \\\n` +
    `  -H "Authorization: Bearer ${apiKey || "YOUR_KEY"}" \\\n` +
    `  -d '${JSON.stringify(requestBody)}'`;

  const handleRun = async () => {
    if (!state.trim() || !modelFull) return;
    setRunning(true);
    setError("");
    setResult(null);
    setLatencyMs(null);
    const start = Date.now();
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
      const res = await fetch(`/api${apiPath}`, {
        method: kindConfig.endpoint.method,
        headers,
        body: JSON.stringify(requestBody),
      });
      const data = await res.json().catch(() => ({}));
      setLatencyMs(Date.now() - start);
      if (!res.ok) {
        setError(data?.error?.message || data?.error || `HTTP ${res.status}`);
        return;
      }
      setResult(data);
    } catch (e: any) {
      setError(e.message || "Network error");
    } finally {
      setRunning(false);
    }
  };

  const resultJson = result ? JSON.stringify(result, null, 2) : "";

  return (
    <div className="flex flex-col gap-8">
      {/* Back */}
      <div>
        <Button variant="outline" size="sm" asChild className="mb-4 self-start">
          <Link href="/dashboard/media-providers/systemone">
            <Icon name="arrow_back" className="text-lg" />
            System One
          </Link>
        </Button>

        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div
            className="size-12 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${provider.color}15` }}
          >
            <ProviderIcon
              src={`/providers/${providerId}.png`}
              alt={provider.name}
              size={48}
              className="object-contain rounded-lg max-w-[48px] max-h-[48px]"
              fallbackText={provider.textIcon || providerId.slice(0, 2).toUpperCase()}
              fallbackColor={provider.color}
            />
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <h1 className="text-3xl font-semibold tracking-tight">{provider.name}</h1>
              {provider.notice?.apiKeyUrl && (
                <a
                  href={provider.notice.apiKeyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                >
                  <Icon name="open_in_new" className="text-sm" />
                  Get API Key
                </a>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {kinds.map((k: string) => (
                <Badge key={k} variant={k === "systemone" ? "default" : "secondary"}>
                  {k.toUpperCase()}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Connections */}
      {provider.noAuth ? (
        <NoAuthProxyCard providerId={providerId} />
      ) : (
        <ConnectionsCard providerId={providerId} isOAuth={false} />
      )}

      {/* Models */}
      <ModelsCard providerId={providerId} kindFilter="systemone" />

      {/* Provider Info */}
      {provider.systemoneConfig && (
        <ProviderInfoCard
          config={provider.systemoneConfig}
          provider={provider}
          title="System One Config"
        />
      )}

      {/* Example */}
      <Card>
        <CardContent>
          <h2 className="text-lg font-semibold mb-4">Example</h2>
          <div className="flex flex-col gap-2.5">
            {kindModels.length > 0 ? (
              <Row label="Model">
                <select
                  value={selectedModel}
                  onChange={(e: any) => setSelectedModel(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:border-primary"
                >
                  {kindModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name || m.id}
                    </option>
                  ))}
                </select>
              </Row>
            ) : (
              <Row label="Model">
                <input
                  value={selectedModel}
                  onChange={(e: any) => setSelectedModel(e.target.value)}
                  placeholder="Enter model id (provider-specific)"
                  className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:border-primary font-mono"
                />
              </Row>
            )}

            <Row label="Endpoint">
              <span className="w-full min-w-0 flex-1 px-3 py-1.5 text-sm font-mono bg-sidebar rounded-lg truncate block">
                {endpoint}
                {apiPath}
              </span>
            </Row>

            <Row label="API Key">
              <span className="px-3 py-1.5 text-sm font-mono bg-sidebar rounded-lg truncate block">
                {apiKey ? (
                  `${apiKey.slice(0, 8)}${"•".repeat(Math.min(20, Math.max(0, apiKey.length - 8)))}`
                ) : (
                  <span className="text-muted-foreground italic">No key configured</span>
                )}
              </span>
            </Row>

            <Row label="State">
              <div className="relative">
                <input
                  value={state}
                  onChange={(e: any) => setState(e.target.value)}
                  placeholder="Situation, support ticket, or text to evaluate"
                  className="w-full px-3 py-1.5 pr-7 text-sm border border-border rounded-lg bg-background focus:outline-none focus:border-primary"
                />
                {state && (
                  <button
                    type="button"
                    onClick={() => setState("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Icon name="close" className="text-[14px]" />
                  </button>
                )}
              </div>
            </Row>

            <Row label="Question">
              <div className="relative">
                <input
                  value={question}
                  onChange={(e: any) => setQuestion(e.target.value)}
                  placeholder="Enter evaluation question or criteria"
                  className="w-full px-3 py-1.5 pr-7 text-sm border border-border rounded-lg bg-background focus:outline-none focus:border-primary"
                />
                {question && (
                  <button
                    type="button"
                    onClick={() => setQuestion("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Icon name="close" className="text-[14px]" />
                  </button>
                )}
              </div>
            </Row>

            {/* Curl + Run */}
            <div className="mt-1">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-1.5">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Request
                </span>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                  <button
                    onClick={() => copyCurl(curlSnippet)}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Icon name={copiedCurl ? "check" : "content_copy"} className="text-[14px]" />
                    {copiedCurl ? "Copied" : "Copy"}
                  </button>
                  <button
                    onClick={handleRun}
                    disabled={running || !state.trim() || !modelFull}
                    className="flex w-full sm:w-auto items-center justify-center gap-1.5 px-3 py-1 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Icon
                      name="play_arrow"
                      className="text-[14px]"
                      style={running ? { animation: "spin 1s linear infinite" } : undefined}
                    />
                    {running ? "Running..." : "Run"}
                  </button>
                </div>
              </div>
              <pre className="bg-sidebar rounded-lg px-3 py-2.5 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all">
                {curlSnippet}
              </pre>
            </div>

            {error && <p className="text-xs text-red-500 break-words">{error}</p>}

            <div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-1.5">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Response{" "}
                  {latencyMs !== null && (
                    <span className="font-normal normal-case">⚡ {latencyMs}ms</span>
                  )}
                </span>
                {result && (
                  <button
                    onClick={() => copyRes(resultJson)}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Icon name={copiedRes ? "check" : "content_copy"} className="text-[14px]" />
                    {copiedRes ? "Copied" : "Copy"}
                  </button>
                )}
              </div>
              <pre className="bg-sidebar rounded-lg px-3 py-2.5 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all opacity-70">
                {result
                  ? resultJson
                  : `{\n  "model": "jev-1.13",\n  "answers": {\n    "is_urgent": { "type": "noul", "noul": 0.99 }\n  },\n  "usage": { "input_tokens": 312, "output_tokens": 48 }\n}`}
              </pre>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
