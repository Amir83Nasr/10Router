"use client";
import Icon from "@/shared/components/Icon";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EditConnectionModal, ConfirmModal, PanelSkeleton } from "@/shared/components";
import ConnectionRow from "../[id]/ConnectionRow";
import { Switch } from "@/components/ui/switch";

// ── CooldownTimer ──────────────────────────────────────────────
function CooldownTimer({ until }: any) {
  const [remaining, setRemaining] = useState<string>("");

  useEffect(() => {
    const update = () => {
      const diff = new Date(until).getTime() - Date.now();
      if (diff <= 0) {
        setRemaining("");
        return;
      }
      const s = Math.floor(diff / 1000);
      if (s < 60) setRemaining(`${s}s`);
      else if (s < 3600) setRemaining(`${Math.floor(s / 60)}m ${s % 60}s`);
      else setRemaining(`${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`);
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [until]);

  if (!remaining) return null;
  return <span className="text-xs text-orange-500 font-mono">⏱ {remaining}</span>;
}

// ── AddApiKeyModal ─────────────────────────────────────────────
function AddApiKeyModal({ isOpen, provider, providerName, proxyPools, onSave, onClose }: any) {
  const NONE = "__none__";
  const [formData, setFormData] = useState({
    name: "",
    apiKey: "",
    priority: 1,
    proxyPoolId: NONE,
  });
  const [validating, setValidating] = useState<boolean>(false);
  const [validationResult, setValidationResult] = useState<any>(null);
  const [saving, setSaving] = useState<boolean>(false);

  const handleValidate = async () => {
    setValidating(true);
    try {
      const res = await fetch("/api/providers/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey: formData.apiKey }),
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
    if (!provider || !formData.apiKey) return;
    setSaving(true);
    try {
      let isValid = false;
      try {
        setValidating(true);
        setValidationResult(null);
        const res = await fetch("/api/providers/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, apiKey: formData.apiKey }),
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
        name: formData.name,
        apiKey: formData.apiKey,
        priority: formData.priority,
        proxyPoolId: formData.proxyPoolId === NONE ? null : formData.proxyPoolId,
        testStatus: isValid ? "active" : "unknown",
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
          <DialogTitle>{`Add ${providerName || provider} API Key`}</DialogTitle>
        </DialogHeader>
        <div className="flex max-h-[calc(85vh-120px)] flex-col gap-4 overflow-y-auto p-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Name</label>
            <input
              className="w-full min-w-0 px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:border-primary"
              value={formData.name}
              onChange={(e: any) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Production Key"
            />
          </div>
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">API Key</label>
              <input
                type="password"
                className="w-full min-w-0 px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:border-primary"
                value={formData.apiKey}
                onChange={(e: any) => setFormData({ ...formData, apiKey: e.target.value })}
              />
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
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Priority</label>
            <input
              type="number"
              className="w-full min-w-0 px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:border-primary"
              value={formData.priority}
              onChange={(e: any) =>
                setFormData({ ...formData, priority: Number.parseInt(e.target.value) || 1 })
              }
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Proxy Pool</label>
            <Select
              value={formData.proxyPoolId}
              onValueChange={(v) => setFormData({ ...formData, proxyPoolId: v })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {(proxyPools || []).map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleSubmit}
            className="w-full"
            disabled={!formData.name || !formData.apiKey || saving}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── ConnectionsCard ────────────────────────────────────────────
// Self-contained card: fetches, displays and manages all connections for a provider.
export default function ConnectionsCard({ providerId, isOAuth }: any) {
  const [connections, setConnections] = useState<any[]>([]);
  const [proxyPools, setProxyPools] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [selectedConnection, setSelectedConnection] = useState<any>(null);
  const [providerStrategy, setProviderStrategy] = useState<any>(null);
  const [providerStickyLimit, setProviderStickyLimit] = useState<string>("1");
  const [confirmState, setConfirmState] = useState<any>(null);

  const fetch_ = useCallback(async () => {
    try {
      const [connRes, proxyRes, settingsRes] = await Promise.all([
        fetch("/api/providers", { cache: "no-store" }),
        fetch("/api/proxy-pools?isActive=true", { cache: "no-store" }),
        fetch("/api/settings", { cache: "no-store" }),
      ]);
      const connData = await connRes.json();
      const proxyData = await proxyRes.json();
      const settingsData = settingsRes.ok ? await settingsRes.json() : {};
      if (connRes.ok)
        setConnections((connData.connections || []).filter((c) => c.provider === providerId));
      if (proxyRes.ok) setProxyPools(proxyData.proxyPools || []);
      const override = (settingsData.providerStrategies || {})[providerId] || {};
      setProviderStrategy(override.fallbackStrategy || null);
      setProviderStickyLimit(
        override.stickyRoundRobinLimit != null ? String(override.stickyRoundRobinLimit) : "1",
      );
    } catch (e) {
      console.log("ConnectionsCard fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [providerId]);

  useEffect(() => {
    fetch_();
  }, [fetch_]);

  const saveStrategy = async (strategy, stickyLimit) => {
    try {
      const res = await fetch("/api/settings", { cache: "no-store" });
      const data = res.ok ? await res.json() : {};
      const current = data.providerStrategies || {};
      const override: any = {};
      if (strategy) override.fallbackStrategy = strategy;
      if (strategy === "round-robin" && stickyLimit !== "")
        override.stickyRoundRobinLimit = Number(stickyLimit) || 3;
      const updated = { ...current };
      if (Object.keys(override).length === 0) delete updated[providerId];
      else updated[providerId] = override;
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerStrategies: updated }),
      });
    } catch (e) {
      console.log("saveStrategy error:", e);
    }
  };

  const handleSwapPriority = async (i1, i2) => {
    const next = [...connections];
    [next[i1], next[i2]] = [next[i2], next[i1]];
    setConnections(next);
    try {
      await Promise.all([
        fetch(`/api/providers/${next[i1].id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ priority: i1 }),
        }),
        fetch(`/api/providers/${next[i2].id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ priority: i2 }),
        }),
      ]);
    } catch {
      await fetch_();
    }
  };

  const handleDelete = async (id) => {
    setConfirmState({
      title: "Delete Connection",
      message: "Delete this connection?",
      onConfirm: async () => {
        setConfirmState(null);
        try {
          const res = await fetch(`/api/providers/${id}`, { method: "DELETE" });
          if (res.ok) setConnections((prev) => prev.filter((c) => c.id !== id));
        } catch (e) {
          console.log("delete error:", e);
        }
      },
    });
  };

  const handleToggleActive = async (id, isActive) => {
    try {
      const res = await fetch(`/api/providers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (res.ok) setConnections((prev) => prev.map((c) => (c.id === id ? { ...c, isActive } : c)));
    } catch (e) {
      console.log("toggle error:", e);
    }
  };

  const handleUpdateProxy = async (connId, proxyPoolId) => {
    try {
      const res = await fetch(`/api/providers/${connId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proxyPoolId: proxyPoolId || null }),
      });
      if (res.ok)
        setConnections((prev) =>
          prev.map((c) =>
            c.id === connId
              ? {
                  ...c,
                  providerSpecificData: {
                    ...c.providerSpecificData,
                    proxyPoolId: proxyPoolId || null,
                  },
                }
              : c,
          ),
        );
    } catch (e) {
      console.log("proxy error:", e);
    }
  };

  const handleSaveApiKey = async (formData) => {
    try {
      const res = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providerId, ...formData }),
      });
      if (res.ok) {
        await fetch_();
        setShowAddModal(false);
      }
    } catch (e) {
      console.log("save apikey error:", e);
    }
  };

  const handleUpdateConnection = async (formData) => {
    try {
      const res = await fetch(`/api/providers/${selectedConnection.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        await fetch_();
        setShowEditModal(false);
      }
    } catch (e) {
      console.log("update connection error:", e);
    }
  };

  if (loading) return <PanelSkeleton />;

  return (
    <>
      <Card>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
            <h2 className="text-lg font-semibold">Connections</h2>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground font-medium">Round Robin</span>
              <Switch
                checked={providerStrategy === "round-robin"}
                onCheckedChange={(enabled) => {
                  const strategy = enabled ? "round-robin" : null;
                  setProviderStrategy(strategy);
                  if (enabled && !providerStickyLimit) setProviderStickyLimit("1");
                  saveStrategy(
                    strategy,
                    enabled ? providerStickyLimit || "1" : providerStickyLimit,
                  );
                }}
              />
              {providerStrategy === "round-robin" && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Sticky:</span>
                  <input
                    type="number"
                    min={1}
                    value={providerStickyLimit}
                    onChange={(e: any) => {
                      setProviderStickyLimit(e.target.value);
                      saveStrategy("round-robin", e.target.value);
                    }}
                    className="w-16 px-2 py-1 text-xs border border-border rounded-md bg-background focus:outline-none focus:border-primary"
                  />
                </div>
              )}
            </div>
          </div>

          {connections.length === 0 ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">No connections yet</p>
              <Button size="sm" onClick={() => setShowAddModal(true)}>
                <Icon name="add" />
                Add Connection
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-col divide-y divide-black/[0.03] dark:divide-white/[0.03] max-h-[500px] overflow-y-auto pr-1">
                {connections.map((conn, idx) => (
                  <ConnectionRow
                    key={conn.id}
                    connection={conn}
                    proxyPools={proxyPools}
                    isOAuth={isOAuth}
                    isFirst={idx === 0}
                    isLast={idx === connections.length - 1}
                    onMoveUp={() => handleSwapPriority(idx, idx - 1)}
                    onMoveDown={() => handleSwapPriority(idx, idx + 1)}
                    onToggleActive={(isActive) => handleToggleActive(conn.id, isActive)}
                    onUpdateProxy={(poolId) => handleUpdateProxy(conn.id, poolId)}
                    onEdit={() => {
                      setSelectedConnection(conn);
                      setShowEditModal(true);
                    }}
                    onDelete={() => handleDelete(conn.id)}
                  />
                ))}
              </div>
              <div className="mt-4 flex justify-stretch sm:justify-start">
                <Button size="sm" onClick={() => setShowAddModal(true)}>
                  <Icon name="add" />
                  Add
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <AddApiKeyModal
        isOpen={showAddModal}
        provider={providerId}
        proxyPools={proxyPools}
        onSave={handleSaveApiKey}
        onClose={() => setShowAddModal(false)}
      />
      <EditConnectionModal
        isOpen={showEditModal}
        connection={selectedConnection}
        proxyPools={proxyPools}
        onSave={handleUpdateConnection}
        onClose={() => setShowEditModal(false)}
      />

      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={!!confirmState}
        onClose={() => setConfirmState(null)}
        onConfirm={confirmState?.onConfirm}
        title={confirmState?.title || "Confirm"}
        message={confirmState?.message}
        variant="danger"
      />
    </>
  );
}
