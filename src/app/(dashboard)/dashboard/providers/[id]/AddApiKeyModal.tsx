"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AI_PROVIDERS } from "@/shared/constants/providers";

function Field({
  label,
  required,
  error,
  hint,
  className,
  children,
}: {
  label?: any;
  required?: any;
  error?: any;
  hint?: any;
  className?: string;
  children: any;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className || ""}`}>
      {label && (
        <label className="text-sm font-medium text-foreground">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function AddApiKeyModal({
  isOpen,
  provider,
  providerName,
  authType,
  authHint,
  website,
  proxyPools,
  error,
  onSave,
  onClose,
}: any) {
  const NONE_PROXY_POOL_VALUE = "__none__";
  const isOllamaLocal = provider === "ollama-local";
  const isCookie = authType === "cookie";
  const isXaiApiKey = provider === "xai" && !isCookie;
  const credentialLabel = isCookie
    ? "Cookie Value"
    : provider === "qoder"
      ? "Personal Access Token (PAT)"
      : "API Key";
  const credentialPlaceholder = isCookie
    ? provider === "grok-web"
      ? "sso=xxxxx... or just the raw value"
      : "eyJhbGciOi..."
    : isXaiApiKey
      ? "xai-..."
      : provider === "qoder"
        ? "pt-..."
        : "";

  const isAzure = provider === "azure";
  const providerRegions = AI_PROVIDERS?.[provider]?.regions || null;
  const defaultRegion = AI_PROVIDERS?.[provider]?.defaultRegion || providerRegions?.[0]?.id || "";

  const [formData, setFormData] = useState({
    name: "",
    apiKey: "",
    priority: 1,
    proxyPoolId: NONE_PROXY_POOL_VALUE,
    ollamaHostUrl: "",
  });
  const [azureData, setAzureData] = useState({
    azureEndpoint: "",
    apiVersion: "2024-10-01-preview",
    deployment: "",
    organization: "",
  });
  const [region, setRegion] = useState(defaultRegion);
  const [validating, setValidating] = useState<boolean>(false);
  const [validationResult, setValidationResult] = useState<any>(null);
  const [saving, setSaving] = useState<boolean>(false);

  const buildProviderSpecificData = () => {
    if (isOllamaLocal && formData.ollamaHostUrl.trim()) {
      return { baseUrl: formData.ollamaHostUrl.trim() };
    }
    if (isAzure) {
      return {
        azureEndpoint: azureData.azureEndpoint,
        apiVersion: azureData.apiVersion,
        deployment: azureData.deployment,
        organization: azureData.organization,
      };
    }
    if (providerRegions && region) {
      return { region };
    }
    return undefined;
  };

  const handleValidate = async () => {
    setValidating(true);
    try {
      const res = await fetch("/api/providers/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          apiKey: formData.apiKey,
          providerSpecificData: buildProviderSpecificData(),
        }),
      });
      const data = await res.json();
      setValidationResult(data.valid ? "success" : "failed");
    } catch {
      setValidationResult("failed");
    } finally {
      setValidating(false);
    }
  };

  const handleSubmit = async () => {
    if (!provider) return;
    if (!isOllamaLocal && !formData.apiKey) return;
    if (!isOllamaLocal) {
      // Non-ollama providers require a name
      if (!formData.name) return;
    }

    setSaving(true);
    try {
      let isValid = false;
      try {
        setValidating(true);
        setValidationResult(null);
        const res = await fetch("/api/providers/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider,
            apiKey: formData.apiKey,
            providerSpecificData: buildProviderSpecificData(),
          }),
        });
        const data = await res.json();
        isValid = !!data.valid;
        setValidationResult(isValid ? "success" : "failed");
      } catch {
        setValidationResult("failed");
      } finally {
        setValidating(false);
      }

      await onSave({
        name: formData.name || (isOllamaLocal ? "Ollama Local" : ""),
        apiKey: formData.apiKey,
        priority: formData.priority,
        proxyPoolId: formData.proxyPoolId === NONE_PROXY_POOL_VALUE ? null : formData.proxyPoolId,
        testStatus: isValid ? "active" : "unknown",
        providerSpecificData: buildProviderSpecificData(),
      });
    } finally {
      setSaving(false);
    }
  };

  if (!provider) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{`Add ${providerName || provider} ${credentialLabel}`}</DialogTitle>
        </DialogHeader>
        <div className="flex max-h-[calc(85vh-120px)] flex-col gap-4 overflow-y-auto p-4">
          <Field label="Name">
            <Input
              value={formData.name}
              onChange={(e: any) => setFormData({ ...formData, name: e.target.value })}
              placeholder={isOllamaLocal ? "Ollama Local" : "Production Key"}
            />
          </Field>
          {isOllamaLocal && (
            <div className="flex gap-2">
              <Field label="Ollama Host URL" className="flex-1">
                <Input
                  value={formData.ollamaHostUrl}
                  onChange={(e: any) => setFormData({ ...formData, ollamaHostUrl: e.target.value })}
                  placeholder="http://localhost:11434"
                />
              </Field>
              <div className="pt-6">
                <Button
                  onClick={handleValidate}
                  disabled={validating || saving}
                  variant="secondary"
                >
                  {validating ? "Checking..." : "Check"}
                </Button>
              </div>
            </div>
          )}
          {!isOllamaLocal && (
            <div className="flex gap-2">
              <Field label={credentialLabel} className="flex-1">
                <Input
                  type={isCookie ? "text" : "password"}
                  value={formData.apiKey}
                  onChange={(e: any) => setFormData({ ...formData, apiKey: e.target.value })}
                  placeholder={credentialPlaceholder}
                />
              </Field>
              <div className="pt-6">
                <Button
                  onClick={handleValidate}
                  disabled={!formData.apiKey || validating || saving}
                  variant="secondary"
                >
                  {validating ? "Checking..." : "Check"}
                </Button>
              </div>
            </div>
          )}
          {isXaiApiKey && (
            <p className="text-xs text-muted-foreground">
              Use a direct xAI API key from console.x.ai. This is separate from Grok Build OAuth.
            </p>
          )}
          {isCookie && authHint && (
            <p className="text-xs text-muted-foreground">
              {authHint}
              {website && (
                <>
                  {" "}
                  <a
                    href={website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline"
                  >
                    Open {website.replace(/^https?:\/\//, "")}
                  </a>
                </>
              )}
            </p>
          )}
          {providerRegions && (
            <Field label="Region">
              <Select value={region} onValueChange={(v) => setRegion(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a region" />
                </SelectTrigger>
                <SelectContent>
                  {providerRegions.map((r) => (
                    <SelectItem key={r.id} value={String(r.id)}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          {error && <p className="text-xs text-red-500 break-words">{error}</p>}
          {isAzure && (
            <div className="bg-sidebar/50 p-4 rounded-lg border border-accent/20">
              <h3 className="font-semibold mb-3 text-sm">Azure OpenAI Configuration</h3>
              <div className="flex flex-col gap-3">
                <Field label="Azure Endpoint">
                  <Input
                    value={azureData.azureEndpoint}
                    onChange={(e: any) =>
                      setAzureData({ ...azureData, azureEndpoint: e.target.value })
                    }
                    placeholder="https://your-resource.openai.azure.com"
                  />
                </Field>
                <Field label="Deployment Name">
                  <Input
                    value={azureData.deployment}
                    onChange={(e: any) =>
                      setAzureData({ ...azureData, deployment: e.target.value })
                    }
                    placeholder="gpt-4"
                  />
                </Field>
                <Field label="API Version">
                  <Input
                    value={azureData.apiVersion}
                    onChange={(e: any) =>
                      setAzureData({ ...azureData, apiVersion: e.target.value })
                    }
                    placeholder="2024-10-01-preview"
                  />
                </Field>
                <Field label="Organization">
                  <Input
                    value={azureData.organization}
                    onChange={(e: any) =>
                      setAzureData({ ...azureData, organization: e.target.value })
                    }
                    placeholder="Organization ID"
                  />
                </Field>
              </div>
            </div>
          )}

          <Field label="Priority">
            <Input
              type="number"
              value={formData.priority}
              onChange={(e: any) =>
                setFormData({ ...formData, priority: Number.parseInt(e.target.value) || 1 })
              }
            />
          </Field>

          <Field label="Proxy Pool">
            <Select
              value={formData.proxyPoolId}
              onValueChange={(v) => setFormData({ ...formData, proxyPoolId: v })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_PROXY_POOL_VALUE}>None</SelectItem>
                {(proxyPools || []).map((pool) => (
                  <SelectItem key={pool.id} value={String(pool.id)}>
                    {pool.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {(proxyPools || []).length === 0 && (
            <p className="text-xs text-muted-foreground">
              No active proxy pools available. Create one in Proxy Pools page first.
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            Legacy manual proxy fields are still accepted by API for backward compatibility.
          </p>

          <Button
            onClick={handleSubmit}
            className="w-full"
            disabled={
              saving ||
              (!isOllamaLocal && (!formData.name || !formData.apiKey)) ||
              (isAzure &&
                (!azureData.azureEndpoint || !azureData.deployment || !azureData.organization))
            }
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
