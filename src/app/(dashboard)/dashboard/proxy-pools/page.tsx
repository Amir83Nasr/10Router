"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Cloud,
  CloudUpload,
  FlaskConical,
  ListChecks,
  Loader2,
  Pencil,
  Plus,
  Rocket,
  ShieldCheck,
  Terminal,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Page, PageHeader, PanelSkeleton } from "@/shared/components";
import { useNotificationStore } from "@/store/notificationStore";

type ProxyPool = {
  id: string;
  name: string;
  proxyUrl: string;
  noProxy?: string;
  isActive?: boolean;
  strictProxy?: boolean;
  testStatus?: string;
  lastTestedAt?: string;
  lastError?: string;
  type?: string;
  boundConnectionCount?: number;
};

type PoolForm = {
  name: string;
  proxyUrl: string;
  noProxy: string;
  isActive: boolean;
  strictProxy: boolean;
};

type ConfirmState = {
  title: string;
  message: string;
  onConfirm: () => void;
};

function getStatusVariant(status?: string) {
  if (status === "active") return "default";
  if (status === "error") return "destructive";
  return "secondary";
}

function normalizeFormData(data: Partial<PoolForm> = {}): PoolForm {
  return {
    name: data.name || "",
    proxyUrl: data.proxyUrl || "",
    noProxy: data.noProxy || "",
    isActive: data.isActive !== false,
    strictProxy: data.strictProxy === true,
  };
}

export default function ProxyPoolsPage() {
  const [proxyPools, setProxyPools] = useState<ProxyPool[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFormModal, setShowFormModal] = useState(false);
  const [showBatchImportModal, setShowBatchImportModal] = useState(false);
  const [showVercelModal, setShowVercelModal] = useState(false);
  const [showCloudflareModal, setShowCloudflareModal] = useState(false);
  const [showDenoModal, setShowDenoModal] = useState(false);
  const [showRelayMenu, setShowRelayMenu] = useState(false);
  const [editingProxyPool, setEditingProxyPool] = useState<ProxyPool | null>(null);
  const [formData, setFormData] = useState<PoolForm>(normalizeFormData());
  const [batchImportText, setBatchImportText] = useState("");
  const [vercelForm, setVercelForm] = useState({ vercelToken: "", projectName: "vercel-relay" });
  const [cloudflareForm, setCloudflareForm] = useState({
    accountId: "",
    apiToken: "",
    projectName: "cloudflare-relay",
  });
  const [denoForm, setDenoForm] = useState({ denoToken: "", orgDomain: "", projectName: "" });
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [healthChecking, setHealthChecking] = useState(false);
  const [healthProgress, setHealthProgress] = useState({ current: 0, total: 0 });
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const notify = useNotificationStore();

  const fetchProxyPools = useCallback(async () => {
    try {
      const res = await fetch("/api/proxy-pools?includeUsage=true", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setProxyPools(data.proxyPools || []);
      }
    } catch (error) {
      console.log("Error fetching proxy pools:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- mount-time data fetch, same as other dashboard pages */
  useEffect(() => {
    void fetchProxyPools();
  }, [fetchProxyPools]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Cleanup selectedIds when pools change
  /* eslint-disable react-hooks/set-state-in-effect -- derived cleanup on data change */
  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => proxyPools.some((p) => p.id === id)));
  }, [proxyPools]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const resetForm = () => {
    setEditingProxyPool(null);
    setFormData(normalizeFormData());
  };

  const openCreateModal = () => {
    resetForm();
    setShowFormModal(true);
  };

  const openEditModal = (proxyPool: ProxyPool) => {
    setEditingProxyPool(proxyPool);
    setFormData(normalizeFormData(proxyPool));
    setShowFormModal(true);
  };

  const closeFormModal = () => {
    setShowFormModal(false);
    resetForm();
  };

  const handleSave = async () => {
    const payload = {
      name: formData.name.trim(),
      proxyUrl: formData.proxyUrl.trim(),
      noProxy: formData.noProxy.trim(),
      isActive: formData.isActive === true,
      strictProxy: formData.strictProxy === true,
    };

    if (!payload.name || !payload.proxyUrl) return;

    setSaving(true);
    try {
      const isEdit = !!editingProxyPool;
      const res = await fetch(
        isEdit ? `/api/proxy-pools/${editingProxyPool.id}` : "/api/proxy-pools",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (res.ok) {
        await fetchProxyPools();
        closeFormModal();
        notify.success(editingProxyPool ? "Proxy pool updated" : "Proxy pool created");
      } else {
        const data = await res.json();
        notify.error(data.error || "Failed to save proxy pool");
      }
    } catch (error) {
      console.log("Error saving proxy pool:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (proxyPool: ProxyPool) => {
    setConfirmState({
      title: "Delete Proxy Pool",
      message: `Delete proxy pool "${proxyPool.name}"?`,
      onConfirm: async () => {
        setConfirmState(null);
        try {
          const res = await fetch(`/api/proxy-pools/${proxyPool.id}`, { method: "DELETE" });
          if (res.ok) {
            setProxyPools((prev) => prev.filter((item) => item.id !== proxyPool.id));
            notify.success("Proxy pool deleted");
            return;
          }

          const data = await res.json();
          if (res.status === 409) {
            notify.warning(
              `Cannot delete: ${data.boundConnectionCount || 0} connection(s) are still using this pool.`,
            );
          } else {
            notify.error(data.error || "Failed to delete proxy pool");
          }
        } catch (error) {
          console.log("Error deleting proxy pool:", error);
          notify.error("Failed to delete proxy pool");
        }
      },
    });
  };

  const handleTest = async (proxyPoolId: string) => {
    setTestingId(proxyPoolId);
    try {
      const res = await fetch(`/api/proxy-pools/${proxyPoolId}/test`, { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        notify.error(data.error || "Failed to test proxy");
        return;
      }

      await fetchProxyPools();
      notify.success(data.ok ? "Proxy test passed" : "Proxy test failed");
    } catch (error) {
      console.log("Error testing proxy pool:", error);
      notify.error("Failed to test proxy");
    } finally {
      setTestingId(null);
    }
  };

  const handleToggleActive = async (pool: ProxyPool) => {
    const next = !pool.isActive;
    setProxyPools((prev) => prev.map((p) => (p.id === pool.id ? { ...p, isActive: next } : p)));
    try {
      const res = await fetch(`/api/proxy-pools/${pool.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: next }),
      });
      if (!res.ok) {
        setProxyPools((prev) =>
          prev.map((p) => (p.id === pool.id ? { ...p, isActive: pool.isActive } : p)),
        );
        notify.error("Failed to update active state");
      }
    } catch (error) {
      console.log("Error toggling active:", error);
      setProxyPools((prev) =>
        prev.map((p) => (p.id === pool.id ? { ...p, isActive: pool.isActive } : p)),
      );
    }
  };

  const allSelected = proxyPools.length > 0 && selectedIds.length === proxyPools.length;
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleSelectAll = () => setSelectedIds(allSelected ? [] : proxyPools.map((p) => p.id));
  const clearSelection = () => setSelectedIds([]);

  const bulkSetActive = async (isActive: boolean) => {
    const targets = selectedIds.length > 0 ? selectedIds : proxyPools.map((p) => p.id);
    if (targets.length === 0) return;
    setBulkBusy(true);
    try {
      let ok = 0;
      let failed = 0;
      for (const id of targets) {
        try {
          const res = await fetch(`/api/proxy-pools/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isActive }),
          });
          if (res.ok) ok += 1;
          else failed += 1;
        } catch {
          failed += 1;
        }
      }
      await fetchProxyPools();
      notify.success(
        `${isActive ? "Activated" : "Deactivated"} ${ok}${failed ? `, failed ${failed}` : ""}`,
      );
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkDelete = async () => {
    if (selectedIds.length === 0) return;
    setConfirmState({
      title: "Delete Proxy Pools",
      message: `Delete ${selectedIds.length} proxy pool(s)?`,
      onConfirm: async () => {
        setConfirmState(null);
        setBulkBusy(true);
        try {
          let ok = 0;
          let blocked = 0;
          let failed = 0;
          for (const id of selectedIds) {
            try {
              const res = await fetch(`/api/proxy-pools/${id}`, { method: "DELETE" });
              if (res.ok) ok += 1;
              else if (res.status === 409) blocked += 1;
              else failed += 1;
            } catch {
              failed += 1;
            }
          }
          await fetchProxyPools();
          clearSelection();
          notify.success(
            `Deleted ${ok}${blocked ? `, ${blocked} bound` : ""}${failed ? `, ${failed} failed` : ""}`,
          );
        } finally {
          setBulkBusy(false);
        }
      },
    });
  };

  const handleHealthCheck = async () => {
    const targets =
      selectedIds.length > 0 ? proxyPools.filter((p) => selectedIds.includes(p.id)) : proxyPools;
    if (targets.length === 0) return;
    setHealthChecking(true);
    setHealthProgress({ current: 0, total: targets.length });
    let alive = 0;
    const deadIds: string[] = [];
    let done = 0;
    const CONCURRENCY = 10;
    const queue = [...targets];

    const worker = async () => {
      while (queue.length > 0) {
        const pool = queue.shift();
        if (!pool) break;
        try {
          const res = await fetch(`/api/proxy-pools/${pool.id}/test`, { method: "POST" });
          const data = await res.json();
          if (res.ok && data.ok) alive += 1;
          else deadIds.push(pool.id);
        } catch {
          deadIds.push(pool.id);
        } finally {
          done += 1;
          setHealthProgress({ current: done, total: targets.length });
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));
    await fetchProxyPools();
    setHealthChecking(false);
    setHealthProgress({ current: 0, total: 0 });

    if (deadIds.length > 0) {
      setConfirmState({
        title: "Disable Dead Proxies",
        message: `Alive: ${alive}, Dead: ${deadIds.length}.\n\nDisable ${deadIds.length} dead proxies?`,
        onConfirm: async () => {
          setConfirmState(null);
          setBulkBusy(true);
          try {
            for (const id of deadIds) {
              try {
                await fetch(`/api/proxy-pools/${id}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ isActive: false }),
                });
              } catch {}
            }
            await fetchProxyPools();
            notify.success(`Disabled ${deadIds.length} dead proxies`);
          } finally {
            setBulkBusy(false);
          }
        },
      });
    } else {
      notify.success(`Health check done. Alive: ${alive}, Dead: ${deadIds.length}`);
    }
  };

  const openBatchImportModal = () => {
    setBatchImportText("");
    setShowBatchImportModal(true);
  };

  const closeBatchImportModal = () => {
    if (importing) return;
    setShowBatchImportModal(false);
  };

  const openVercelModal = () => {
    setVercelForm({ vercelToken: "", projectName: "vercel-relay" });
    setShowVercelModal(true);
  };

  const closeVercelModal = () => {
    if (deploying) return;
    setShowVercelModal(false);
  };

  const openCloudflareModal = () => {
    setCloudflareForm({ accountId: "", apiToken: "", projectName: "cloudflare-relay" });
    setShowCloudflareModal(true);
  };

  const closeCloudflareModal = () => {
    if (deploying) return;
    setShowCloudflareModal(false);
  };

  const openDenoModal = () => {
    setDenoForm({ denoToken: "", orgDomain: "", projectName: "" });
    setShowDenoModal(true);
  };

  const closeDenoModal = () => {
    if (deploying) return;
    setShowDenoModal(false);
  };

  const handleVercelDeploy = async () => {
    if (!vercelForm.vercelToken.trim()) return;
    setDeploying(true);
    try {
      const res = await fetch("/api/proxy-pools/vercel-deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vercelForm),
      });
      const data = await res.json();
      if (res.ok) {
        await fetchProxyPools();
        closeVercelModal();
        notify.success(`Deployed: ${data.deployUrl}`);
      } else {
        notify.error(data.error || "Deploy failed");
      }
    } catch (error) {
      console.log("Error deploying Vercel relay:", error);
      notify.error("Deploy failed");
    } finally {
      setDeploying(false);
    }
  };

  const handleCloudflareDeploy = async () => {
    if (!cloudflareForm.accountId.trim() || !cloudflareForm.apiToken.trim()) return;
    setDeploying(true);
    try {
      const res = await fetch("/api/proxy-pools/cloudflare-deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cloudflareForm),
      });
      const data = await res.json();
      if (res.ok) {
        await fetchProxyPools();
        closeCloudflareModal();
        notify.success(`Deployed: ${data.deployUrl}`);
      } else {
        notify.error(data.error || "Deploy failed");
      }
    } catch (error) {
      console.log("Error deploying Cloudflare relay:", error);
      notify.error("Deploy failed");
    } finally {
      setDeploying(false);
    }
  };

  const handleDenoDeploy = async () => {
    if (!denoForm.denoToken.trim()) return;
    setDeploying(true);
    try {
      const res = await fetch("/api/proxy-pools/deno-deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(denoForm),
      });
      const data = await res.json();
      if (res.ok) {
        await fetchProxyPools();
        closeDenoModal();
        notify.success(`Deployed: ${data.deployUrl}`);
      } else {
        notify.error(data.error || "Deploy failed");
      }
    } catch (error) {
      console.log("Error deploying Deno relay:", error);
      notify.error("Deploy failed");
    } finally {
      setDeploying(false);
    }
  };

  const parseProxyLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return null;

    if (trimmed.includes("://")) {
      const parsed = new URL(trimmed);
      const hostLabel = parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
      return {
        proxyUrl: parsed.toString(),
        name: `Imported ${hostLabel}`,
      };
    }

    const parts = trimmed.split(":");
    if (parts.length === 4) {
      const [host, port, username, password] = parts;
      if (!host || !port || !username || !password) {
        throw new Error("Invalid host:port:user:pass format");
      }

      const proxyUrl = `http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}`;
      const parsed = new URL(proxyUrl);
      return {
        proxyUrl: parsed.toString(),
        name: `Imported ${host}:${port}`,
      };
    }

    throw new Error("Unsupported format");
  };

  const handleBatchImport = async () => {
    const lines = batchImportText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      notify.warning("Please paste at least one proxy line.");
      return;
    }

    const parsedEntries: { proxyUrl: string; name: string; lineNumber: number }[] = [];
    const invalidLines: string[] = [];

    lines.forEach((line, index) => {
      try {
        const parsed = parseProxyLine(line);
        if (parsed) {
          parsedEntries.push({
            ...parsed,
            lineNumber: index + 1,
          });
        }
      } catch (error) {
        invalidLines.push(`Line ${index + 1}: ${(error as Error).message}`);
      }
    });

    if (invalidLines.length > 0) {
      notify.error(`Invalid proxy format:\n${invalidLines.join("\n")}`);
      return;
    }

    setImporting(true);
    try {
      const existingKeys = new Set(
        proxyPools.map(
          (pool) => `${(pool.proxyUrl || "").trim()}|||${(pool.noProxy || "").trim()}`,
        ),
      );

      let created = 0;
      let skipped = 0;
      let failed = 0;

      for (const entry of parsedEntries) {
        const dedupeKey = `${entry.proxyUrl}|||`;
        if (existingKeys.has(dedupeKey)) {
          skipped += 1;
          continue;
        }

        const res = await fetch("/api/proxy-pools", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: entry.name,
            proxyUrl: entry.proxyUrl,
            noProxy: "",
            isActive: true,
          }),
        });

        if (res.ok) {
          created += 1;
          existingKeys.add(dedupeKey);
        } else {
          failed += 1;
        }
      }

      await fetchProxyPools();
      setShowBatchImportModal(false);
      notify.success(
        `Batch import completed: Created ${created}, Skipped ${skipped}, Failed ${failed}`,
      );
    } catch (error) {
      console.log("Error batch importing proxies:", error);
      notify.error("Batch import failed");
    } finally {
      setImporting(false);
    }
  };

  const activeCount = useMemo(
    () => proxyPools.filter((pool) => pool.isActive === true).length,
    [proxyPools],
  );

  if (loading) {
    return (
      <Page width="wide">
        <PanelSkeleton />
        <PanelSkeleton />
      </Page>
    );
  }

  return (
    <>
      <Page width="wide">
        <PageHeader
          title="Proxy Pools"
          actions={
            <>
              <DropdownMenu open={showRelayMenu} onOpenChange={setShowRelayMenu}>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="secondary">
                    <Rocket />
                    Deploy Relay
                    {showRelayMenu ? (
                      <ChevronUp className="ml-1 size-4" />
                    ) : (
                      <ChevronDown className="ml-1 size-4" />
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem
                    onClick={() => {
                      openCloudflareModal();
                      setShowRelayMenu(false);
                    }}
                  >
                    <Cloud className="size-5 text-orange-500" />
                    Cloudflare Relay
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      openVercelModal();
                      setShowRelayMenu(false);
                    }}
                  >
                    <CloudUpload className="size-5 text-blue-500" />
                    Vercel Relay
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      openDenoModal();
                      setShowRelayMenu(false);
                    }}
                  >
                    <Terminal className="size-5 text-green-500" />
                    Deno Relay
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button size="sm" variant="secondary" onClick={openBatchImportModal}>
                <Upload />
                Batch Import
              </Button>
              <Button size="sm" onClick={openCreateModal}>
                <Plus />
                Add Proxy Pool
              </Button>
            </>
          }
        />
        <Card size="sm">
          <CardContent>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {proxyPools.length > 0 && (
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                  <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} />
                  {allSelected ? "Unselect all" : "Select all"}
                </label>
              )}
              <Badge variant="secondary">Total: {proxyPools.length}</Badge>
              <Badge variant="default">Active: {activeCount}</Badge>
            </div>

            {(selectedIds.length > 0 || healthChecking) && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
                <ListChecks className="size-4 text-primary" />
                <span className="text-xs font-medium text-primary">
                  {selectedIds.length > 0 ? `${selectedIds.length} selected` : "All pools"}
                </span>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    onClick={handleHealthCheck}
                    disabled={healthChecking || bulkBusy || proxyPools.length === 0}
                  >
                    {healthChecking ? (
                      <>
                        <Loader2 className="animate-spin" />
                        Checking {healthProgress.current}/{healthProgress.total}
                      </>
                    ) : (
                      <>
                        <ShieldCheck />
                        Health Check
                      </>
                    )}
                  </Button>
                  {selectedIds.length > 0 && (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => bulkSetActive(true)}
                        disabled={bulkBusy || healthChecking}
                      >
                        <ToggleRight />
                        Activate
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => bulkSetActive(false)}
                        disabled={bulkBusy || healthChecking}
                      >
                        <ToggleLeft />
                        Deactivate
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={bulkDelete}
                        disabled={bulkBusy || healthChecking}
                      >
                        <Trash2 />
                        Delete
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={clearSelection}
                        disabled={bulkBusy || healthChecking}
                      >
                        Clear
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}

            {proxyPools.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-foreground font-medium mb-1">No proxy pool entries yet</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Create a proxy pool entry, then assign it to connections.
                </p>
                <Button onClick={openCreateModal}>
                  <Plus />
                  Add Proxy Pool
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {proxyPools.length > 0 && (
          <div className="flex flex-col gap-4">
            {proxyPools.map((pool) => (
              <Card key={pool.id} size="sm">
                <CardContent>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <Checkbox
                        checked={selectedIds.includes(pool.id)}
                        onCheckedChange={() => toggleSelect(pool.id)}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="min-w-0 max-w-full truncate text-sm font-medium sm:max-w-[18rem]">
                            {pool.name}
                          </p>
                          <Badge variant={getStatusVariant(pool.testStatus)}>
                            {pool.testStatus || "unknown"}
                          </Badge>
                          <Badge variant={pool.isActive ? "default" : "secondary"}>
                            {pool.isActive ? "active" : "inactive"}
                          </Badge>
                          {pool.type === "vercel" && (
                            <Badge variant="secondary">vercel relay</Badge>
                          )}
                          {pool.type === "cloudflare" && (
                            <Badge variant="secondary">cloudflare relay</Badge>
                          )}
                          <Badge variant="secondary">{pool.boundConnectionCount || 0} bound</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {pool.proxyUrl}
                          {pool.noProxy ? ` · No proxy: ${pool.noProxy}` : ""}
                          {pool.lastError ? ` · ${pool.lastError}` : ""}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-1">
                      <Switch
                        checked={pool.isActive === true}
                        onCheckedChange={() => handleToggleActive(pool)}
                        aria-label={pool.isActive ? "Disable" : "Enable"}
                      />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => handleTest(pool.id)}
                            disabled={testingId === pool.id}
                          >
                            {testingId === pool.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <FlaskConical className="size-4" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Test proxy</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => openEditModal(pool)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Edit</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => handleDelete(pool)}
                            className="text-red-500 hover:bg-red-500/10 hover:text-red-500"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Delete</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </Page>

      <Dialog open={showBatchImportModal} onOpenChange={closeBatchImportModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Batch Import Proxies</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 p-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">
                Paste Proxy List (One per line)
              </label>
              <textarea
                value={batchImportText}
                onChange={(e) => setBatchImportText(e.target.value)}
                placeholder={"http://user:pass@127.0.0.1:7897\n127.0.0.1:7897:user:pass"}
                className="w-full min-h-[180px] py-2 px-3 text-sm text-foreground bg-white dark:bg-white/5 border border-border rounded-md focus:ring-1 focus:ring-primary/30 focus:border-primary/50 focus:outline-none transition-all"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Supported formats: protocol://user:pass@host:port, host:port:user:pass
              </p>
            </div>

            <Button
              onClick={handleBatchImport}
              disabled={!batchImportText.trim() || importing}
              className="w-full"
            >
              {importing ? "Importing..." : "Import"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showVercelModal} onOpenChange={closeVercelModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Deploy Vercel Relay</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 p-4">
            <div className="rounded-lg bg-blue-500/5 border border-blue-500/10 p-3 flex flex-col gap-1.5">
              <p className="text-sm text-foreground font-medium">What is Vercel Relay?</p>
              <p className="text-xs text-muted-foreground">
                Deploys an edge relay function to Vercel. All AI provider requests will be forwarded
                through Vercel&apos;s edge network, masking your real IP from providers.
              </p>
              <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                <li>
                  Your IP is replaced by Vercel&apos;s dynamic edge IPs (hundreds of IPs across 20+
                  global regions)
                </li>
                <li>
                  Vercel serves millions of apps — providers can&apos;t block Vercel IPs without
                  affecting legitimate traffic
                </li>
                <li>Free tier: 100GB bandwidth/month, 500K edge invocations</li>
                <li>Deploy multiple relays on different accounts for more IP diversity</li>
              </ul>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Vercel API Token
              </label>
              <Input
                value={vercelForm.vercelToken}
                onChange={(e) =>
                  setVercelForm((prev) => ({ ...prev, vercelToken: e.target.value }))
                }
                placeholder="your-vercel-api-token"
                type="password"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Token is used once for deployment and not stored.{" "}
                <a
                  href="https://vercel.com/account/tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Get token →
                </a>
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Project Name
              </label>
              <Input
                value={vercelForm.projectName}
                onChange={(e) =>
                  setVercelForm((prev) => ({ ...prev, projectName: e.target.value }))
                }
                placeholder="my-relay"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Unique name for your Vercel project. Leave empty for auto-generated name.
              </p>
            </div>
            <Button
              onClick={handleVercelDeploy}
              disabled={!vercelForm.vercelToken.trim() || deploying}
              className="w-full"
            >
              {deploying ? "Deploying... (may take ~1 min)" : "Deploy"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showCloudflareModal} onOpenChange={closeCloudflareModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Deploy Cloudflare Relay</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 p-4">
            <div className="rounded-lg bg-orange-500/5 border border-orange-500/10 p-3 flex flex-col gap-1.5">
              <p className="text-sm text-foreground font-medium">What is Cloudflare Relay?</p>
              <p className="text-xs text-muted-foreground">
                Deploys a Cloudflare Worker as a proxy relay. All AI provider requests will be
                forwarded through Cloudflare&apos;s global edge network.
              </p>
              <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                <li>High performance global routing and IP masking via Cloudflare Workers</li>
                <li>Free tier: 100,000 requests per day</li>
                <li>
                  Requires Cloudflare Account ID and a Workers API Token (Edit Workers permission)
                </li>
              </ul>
              <div className="mt-2 pt-2 border-t border-orange-500/10 text-xs text-muted-foreground">
                <p className="font-medium text-foreground mb-1">How to generate your API Token:</p>
                <ol className="list-decimal pl-4 space-y-0.5">
                  <li>
                    Go to <b>My Profile</b> → <b>API Tokens</b> → <b>Create Token</b>
                  </li>
                  <li>
                    Scroll down to <b>Custom Token</b> and click <b>Get started</b>
                  </li>
                  <li>
                    Under <b>Permissions</b>: Account | Workers Scripts | Edit
                  </li>
                  <li>
                    Under <b>Account Resources</b>: Include | Account | <i>Your Account Name</i>
                  </li>
                  <li>
                    Click <b>Continue to summary</b> → <b>Create Token</b>
                  </li>
                </ol>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Account ID</label>
              <Input
                value={cloudflareForm.accountId}
                onChange={(e) =>
                  setCloudflareForm((prev) => ({ ...prev, accountId: e.target.value }))
                }
                placeholder="your-cloudflare-account-id"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Found on the right side of the Cloudflare dashboard overview page.
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">API Token</label>
              <Input
                value={cloudflareForm.apiToken}
                onChange={(e) =>
                  setCloudflareForm((prev) => ({ ...prev, apiToken: e.target.value }))
                }
                placeholder="your-cloudflare-api-token"
                type="password"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Requires &quot;Workers Scripts: Edit&quot; permission.{" "}
                <a
                  href="https://dash.cloudflare.com/profile/api-tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Get token →
                </a>
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Worker Name
              </label>
              <Input
                value={cloudflareForm.projectName}
                onChange={(e) =>
                  setCloudflareForm((prev) => ({ ...prev, projectName: e.target.value }))
                }
                placeholder="my-relay"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Unique name for your Cloudflare Worker. Leave empty for auto-generated name.
              </p>
            </div>
            <Button
              onClick={handleCloudflareDeploy}
              disabled={
                !cloudflareForm.accountId.trim() || !cloudflareForm.apiToken.trim() || deploying
              }
              className="w-full"
            >
              {deploying ? "Deploying..." : "Deploy Worker"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showDenoModal} onOpenChange={closeDenoModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Deploy Deno Relay</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 p-4">
            <div className="rounded-lg bg-black/5 dark:bg-white/5 border border-border p-3 flex flex-col gap-1.5">
              <p className="text-sm text-foreground font-medium">What is Deno Relay?</p>
              <p className="text-xs text-muted-foreground">
                Deploys a relay worker to Deno Deploy&apos;s global edge network. All AI provider
                requests are forwarded through Deno&apos;s edge, masking your real IP.
              </p>
              <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                <li>Deno Deploy v2 runs on a high-performance global edge network</li>
                <li>Free tier: 1M requests & 100GiB outbound traffic per month</li>
                <li>No per-request CPU time limits (unlike Vercel/Cloudflare)</li>
                <li>Support up to 20 active apps & 50 custom domains</li>
                <li>Deploy multiple relays for maximum IP diversity</li>
              </ul>
              <div className="mt-2 pt-2 border-t border-border text-xs text-muted-foreground">
                <p className="font-medium text-foreground mb-1">How to generate API token:</p>
                <ol className="list-decimal pl-4 space-y-0.5">
                  <li>
                    Go to <b>console.deno.com</b>
                  </li>
                  <li>
                    Select your <b>Organization</b> → <b>Settings</b> → <b>Organization Tokens</b>
                  </li>
                  <li>
                    Create a <b>Organization Token</b> (prefix <b>ddo_</b>)
                  </li>
                </ol>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Deno Deploy API Token
              </label>
              <Input
                value={denoForm.denoToken}
                onChange={(e) => setDenoForm((prev) => ({ ...prev, denoToken: e.target.value }))}
                placeholder="ddo_xxxxxxxxxxxxxxxx"
                type="password"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Token is used once for deployment, not stored. Found in Organization Settings.
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Organization Domain
              </label>
              <Input
                value={denoForm.orgDomain}
                onChange={(e) => setDenoForm((prev) => ({ ...prev, orgDomain: e.target.value }))}
                placeholder="your-org.deno.net"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Organization&apos;s default domain. Your relay URL will be in the format:
                https://my-relay.your-org.deno.net
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">App Name</label>
              <Input
                value={denoForm.projectName}
                onChange={(e) => setDenoForm((prev) => ({ ...prev, projectName: e.target.value }))}
                placeholder="deno-relay"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Unique app name. Leave empty for auto-generated name.
              </p>
            </div>
            <Button
              onClick={handleDenoDeploy}
              disabled={!denoForm.denoToken.trim() || !denoForm.orgDomain.trim() || deploying}
              className="w-full"
            >
              {deploying ? "Deploying..." : "Deploy Relay"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showFormModal} onOpenChange={closeFormModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingProxyPool ? "Edit Proxy Pool" : "Add Proxy Pool"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 p-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Name</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Office Proxy"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Proxy URL</label>
              <Input
                value={formData.proxyUrl}
                onChange={(e) => setFormData((prev) => ({ ...prev, proxyUrl: e.target.value }))}
                placeholder="http://127.0.0.1:7897"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">No Proxy</label>
              <Input
                value={formData.noProxy}
                onChange={(e) => setFormData((prev) => ({ ...prev, noProxy: e.target.value }))}
                placeholder="localhost,127.0.0.1,.internal"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Comma-separated hosts/domains to bypass proxy
              </p>
            </div>

            <div className="flex flex-col gap-3 rounded-lg border border-border/50 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-sm">Active</p>
                <p className="text-xs text-muted-foreground">
                  Inactive pools are ignored by runtime resolution.
                </p>
              </div>
              <Switch
                checked={formData.isActive === true}
                onCheckedChange={() =>
                  setFormData((prev) => ({ ...prev, isActive: !prev.isActive }))
                }
                disabled={saving}
              />
            </div>

            <div className="flex flex-col gap-3 rounded-lg border border-border/50 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-sm">Strict Proxy</p>
                <p className="text-xs text-muted-foreground">
                  Fail request if proxy is unreachable instead of falling back to direct.
                </p>
              </div>
              <Switch
                checked={formData.strictProxy === true}
                onCheckedChange={() =>
                  setFormData((prev) => ({ ...prev, strictProxy: !prev.strictProxy }))
                }
                disabled={saving}
              />
            </div>

            <Button
              onClick={handleSave}
              disabled={!formData.name.trim() || !formData.proxyUrl.trim() || saving}
              className="w-full"
            >
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Modal */}
      {confirmState && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirmState(null);
          }}
        >
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{confirmState.title}</DialogTitle>
            </DialogHeader>
            <p className="p-4 text-sm text-muted-foreground">{confirmState.message}</p>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirmState(null)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirmState.onConfirm}>
                Confirm
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
