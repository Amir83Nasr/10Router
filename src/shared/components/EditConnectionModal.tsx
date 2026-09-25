"use client";

import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import Modal from "@/shared/components/Modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  isOpenAICompatibleProvider,
  isAnthropicCompatibleProvider,
  AI_PROVIDERS,
} from "@/shared/constants/providers";

interface EditConnectionModalProps {
  isOpen?: boolean;
  connection?: any;
  proxyPools?: any;
  onSave?: any;
  onClose?: () => void;
}

export default function EditConnectionModal({
  isOpen,
  connection,
  proxyPools,
  onSave,
  onClose,
}: EditConnectionModalProps) {
  const [formData, setFormData] = useState({
    name: "",
    priority: 1,
    apiKey: "",
  });
  const [azureData, setAzureData] = useState({
    azureEndpoint: "",
    apiVersion: "2024-10-01-preview",
    deployment: "",
    organization: "",
  });
  const [region, setRegion] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (connection) {
      setFormData({
        name: connection.name || "",
        priority: connection.priority || 1,
        apiKey: "",
      });
      // Load Azure-specific data if present
      if (connection.provider === "azure" && connection.providerSpecificData) {
        setAzureData({
          azureEndpoint: connection.providerSpecificData.azureEndpoint || "",
          apiVersion: connection.providerSpecificData.apiVersion || "2024-10-01-preview",
          deployment: connection.providerSpecificData.deployment || "",
          organization: connection.providerSpecificData.organization || "",
        });
      }
      // Load region for providers that support it (e.g. xiaomi-tokenplan)
      const providerCfg = AI_PROVIDERS?.[connection.provider];
      if (providerCfg?.regions) {
        const savedRegion =
          connection.providerSpecificData?.region ||
          providerCfg.defaultRegion ||
          providerCfg.regions[0]?.id ||
          "";
        setRegion(savedRegion);
      }
      setTestResult(null);
      setValidationResult(null);
    }
  }, [connection]);

  const isOAuth = connection?.authType === "oauth";
  const isAzure = connection?.provider === "azure";
  const isCompatible = connection
    ? isOpenAICompatibleProvider(connection.provider) ||
      isAnthropicCompatibleProvider(connection.provider)
    : false;
  const providerRegions = connection ? AI_PROVIDERS?.[connection.provider]?.regions || null : null;

  // Build providerSpecificData for region-aware providers
  const buildRegionSpecificData = () => {
    if (providerRegions && region) return { ...(connection?.providerSpecificData || {}), region };
    return undefined;
  };

  const handleTest = async () => {
    if (!connection?.provider) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/providers/${connection.id}/test`, { method: "POST" });
      const data = await res.json();
      setTestResult(data.valid ? "success" : "failed");
    } catch {
      setTestResult("failed");
    } finally {
      setTesting(false);
    }
  };

  const handleValidate = async () => {
    if (!connection?.provider || !formData.apiKey) return;
    setValidating(true);
    setValidationResult(null);
    try {
      const res = await fetch("/api/providers/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: connection.provider,
          apiKey: formData.apiKey,
          ...(isAzure ? { providerSpecificData: azureData } : {}),
          ...(providerRegions ? { providerSpecificData: buildRegionSpecificData() } : {}),
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
    if (!connection) return;
    setSaving(true);
    try {
      const updates: any = {
        name: formData.name,
        priority: formData.priority,
      };
      if (!isOAuth && formData.apiKey) {
        updates.apiKey = formData.apiKey;
        let isValid = validationResult === "success";
        if (!isValid) {
          try {
            setValidating(true);
            setValidationResult(null);
            const res = await fetch("/api/providers/validate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                provider: connection.provider,
                apiKey: formData.apiKey,
                ...(isAzure ? { providerSpecificData: azureData } : {}),
                ...(providerRegions ? { providerSpecificData: buildRegionSpecificData() } : {}),
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
        }
        if (isValid) {
          updates.testStatus = "active";
          updates.lastError = null;
          updates.lastErrorAt = null;
        }
      }

      // Add Azure-specific data if this is an Azure connection
      if (isAzure) {
        updates.providerSpecificData = {
          azureEndpoint: azureData.azureEndpoint,
          apiVersion: azureData.apiVersion,
          deployment: azureData.deployment,
          organization: azureData.organization,
        };
      }
      // Persist updated region for region-aware providers
      if (providerRegions && region) {
        updates.providerSpecificData = buildRegionSpecificData();
      }

      await onSave(updates);
    } finally {
      setSaving(false);
    }
  };

  if (!connection) return null;

  return (
    <Modal isOpen={isOpen} title="Edit Connection" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Name</label>
          <Input
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder={isOAuth ? "Account name" : "Production Key"}
          />
        </div>
        {isOAuth && connection.email && (
          <div className="bg-sidebar/50 p-3 rounded-lg">
            <p className="text-sm text-muted-foreground mb-1">Email</p>
            <p className="font-medium">{connection.email}</p>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Priority</label>
          <Input
            type="number"
            value={formData.priority}
            onChange={(e) =>
              setFormData({ ...formData, priority: Number.parseInt(e.target.value, 10) || 1 })
            }
          />
        </div>

        {!isOAuth && (
          <>
            <div className="flex gap-2">
              <div className="flex flex-col gap-1.5 flex-1">
                <label className="text-sm font-medium">API Key</label>
                <Input
                  type="password"
                  value={formData.apiKey}
                  onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                  placeholder="Enter new API key"
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank to keep the current API key.
                </p>
              </div>
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
            {validationResult && (
              <Badge variant={validationResult === "success" ? "default" : "destructive"}>
                {validationResult === "success" ? "Valid" : "Invalid"}
              </Badge>
            )}
          </>
        )}

        {isAzure && (
          <div className="bg-sidebar/50 p-4 rounded-lg border border-accent/20">
            <h3 className="font-semibold mb-3 text-sm">Azure OpenAI Configuration</h3>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Azure Endpoint</label>
                <Input
                  value={azureData.azureEndpoint}
                  onChange={(e) => setAzureData({ ...azureData, azureEndpoint: e.target.value })}
                  placeholder="https://your-resource.openai.azure.com"
                />
                <p className="text-xs text-muted-foreground">
                  Your Azure OpenAI resource endpoint URL
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Deployment Name</label>
                <Input
                  value={azureData.deployment}
                  onChange={(e) => setAzureData({ ...azureData, deployment: e.target.value })}
                  placeholder="gpt-4"
                />
                <p className="text-xs text-muted-foreground">
                  The deployment name in your Azure resource
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">API Version</label>
                <Input
                  value={azureData.apiVersion}
                  onChange={(e) => setAzureData({ ...azureData, apiVersion: e.target.value })}
                  placeholder="2024-10-01-preview"
                />
                <p className="text-xs text-muted-foreground">Azure OpenAI API version to use</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Organization</label>
                <Input
                  value={azureData.organization}
                  onChange={(e) => setAzureData({ ...azureData, organization: e.target.value })}
                  placeholder="Organization ID"
                />
                <p className="text-xs text-muted-foreground">Required for billing</p>
              </div>
            </div>
          </div>
        )}

        {providerRegions && (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Region</label>
            <Select value={region} onValueChange={(v) => setRegion(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select an option" />
              </SelectTrigger>
              <SelectContent>
                {providerRegions.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {!isCompatible && !isAzure && (
          <div className="flex items-center gap-3">
            <Button onClick={handleTest} variant="secondary" disabled={testing}>
              {testing ? "Testing..." : "Test Connection"}
            </Button>
            {testResult && (
              <Badge variant={testResult === "success" ? "default" : "destructive"}>
                {testResult === "success" ? "Valid" : "Failed"}
              </Badge>
            )}
          </div>
        )}

        <Button onClick={handleSubmit} className="w-full" disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </Modal>
  );
}

EditConnectionModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  connection: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    email: PropTypes.string,
    priority: PropTypes.number,
    authType: PropTypes.string,
    provider: PropTypes.string,
    providerSpecificData: PropTypes.object,
  }),
  proxyPools: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string,
      name: PropTypes.string,
    }),
  ),
  onSave: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};
