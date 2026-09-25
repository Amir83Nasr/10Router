"use client";
import Icon from "@/shared/components/Icon";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CAPACITY_META } from "@/shared/constants/models";
import { Switch } from "@/components/ui/switch";

const defaultCaps = () => Object.fromEntries(Object.keys(CAPACITY_META).map((key) => [key, false]));

export default function AddCustomModelModal({
  isOpen,
  providerAlias,
  providerDisplayAlias,
  onSave,
  onClose,
}: any) {
  const [modelId, setModelId] = useState<string>("");
  const [caps, setCaps] = useState(defaultCaps);
  const [testStatus, setTestStatus] = useState<any>(null); // null | "testing" | "ok" | "error"
  const [testError, setTestError] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setModelId("");
      setCaps(defaultCaps());
      setTestStatus(null);
      setTestError("");
    }
  }, [isOpen]);

  // Strip provider's own alias prefix (e.g. "cc/model" -> "model" for cc provider)
  const stripAlias = (id) => {
    const prefix = `${providerAlias}/`;
    return id.startsWith(prefix) ? id.slice(prefix.length) : id;
  };

  const handleTest = async () => {
    const cleanId = stripAlias(modelId.trim());
    if (!cleanId) return;
    setTestStatus("testing");
    setTestError("");
    try {
      const res = await fetch("/api/models/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: `${providerAlias}/${cleanId}` }),
      });
      const data = await res.json();
      setTestStatus(data.ok ? "ok" : "error");
      setTestError(data.error || "");
    } catch (err) {
      setTestStatus("error");
      setTestError(err.message);
    }
  };

  const handleSave = async () => {
    const cleanId = stripAlias(modelId.trim());
    if (!cleanId || saving) return;
    setSaving(true);
    try {
      await onSave(cleanId, caps);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: any) => {
    if (e.key === "Enter") handleTest();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Custom Model</DialogTitle>
        </DialogHeader>
        <div className="flex max-h-[calc(85vh-120px)] flex-col gap-4 overflow-y-auto p-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Model ID</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={modelId}
                onChange={(e: any) => {
                  setModelId(e.target.value);
                  setTestStatus(null);
                  setTestError("");
                }}
                onKeyDown={handleKeyDown}
                placeholder="e.g. claude-opus-4-5"
                className="flex-1 min-w-0 px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:border-primary"
                autoFocus
              />
              <Button
                variant="secondary"
                disabled={!modelId.trim() || testStatus === "testing"}
                onClick={handleTest}
              >
                {testStatus === "testing" && <Loader2 className="size-4 animate-spin" />}
                {testStatus !== "testing" && <Icon name="science" />}
                {testStatus === "testing" ? "Testing..." : "Test"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Sent to provider as:{" "}
              <code className="font-mono bg-sidebar px-1 rounded">
                {stripAlias(modelId.trim()) || "model-id"}
              </code>
            </p>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Capabilities</label>
            <div className="flex flex-wrap gap-4">
              {Object.entries(CAPACITY_META).map(([key, meta]) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-2.5"
                  onClick={(e) => {
                    e.preventDefault();
                    setCaps((prev) => ({ ...prev, [key]: !prev[key] }));
                  }}
                >
                  <Switch
                    checked={!!caps[key]}
                    onCheckedChange={(v) => setCaps((prev) => ({ ...prev, [key]: v }))}
                    size="sm"
                    aria-label={meta.label}
                  />
                  <span>
                    <span className="block text-sm font-medium">{meta.label}</span>
                    <span className="block text-xs text-muted-foreground">{meta.desc}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Test result */}
          {testStatus === "ok" && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <Icon name="check_circle" className="text-base" />
              Model is reachable
            </div>
          )}
          {testStatus === "error" && (
            <div className="flex items-start gap-2 text-sm text-red-500">
              <Icon name="cancel" className="text-base shrink-0" />
              <span>{testError || "Model not reachable"}</span>
            </div>
          )}

          <Button
            onClick={handleSave}
            className="w-full"
            size="sm"
            disabled={!modelId.trim() || saving}
          >
            {saving ? "Adding..." : "Add Model"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
