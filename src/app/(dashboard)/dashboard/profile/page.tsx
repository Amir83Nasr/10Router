"use client";
import { useState, useEffect, useRef } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import Icon from "@/shared/components/Icon";
import ShutdownModal from "@/shared/components/ShutdownModal";
import { Page } from "@/shared/components/layouts";
import { useShutdown } from "@/shared/hooks/useShutdown";
import { Switch } from "@/components/ui/switch";
import { APP_CONFIG } from "@/shared/constants/config";

export default function ProfilePage() {
  const shutdown = useShutdown();
  const [settings, setSettings] = useState<any>({ fallbackStrategy: "fill-first" });
  const [loading, setLoading] = useState(true);
  const [passwords, setPasswords] = useState({ current: "", new: "", confirm: "" });
  const [passStatus, setPassStatus] = useState({ type: "", message: "" });
  const [passLoading, setPassLoading] = useState(false);
  const [dbLoading, setDbLoading] = useState(false);
  const [dbStatus, setDbStatus] = useState({ type: "", message: "" });
  const [dbAuth, setDbAuth] = useState({ open: false, mode: "", password: "" });
  const pendingImportRef = useRef<any>(null);
  const importFileRef = useRef<any>(null);
  const [proxyForm, setProxyForm] = useState({
    outboundProxyEnabled: false,
    outboundProxyPoolId: "",
    outboundProxyUrl: "",
    outboundNoProxy: "",
  });
  const [proxyPools, setProxyPools] = useState<any[]>([]);
  const [proxyStatus, setProxyStatus] = useState({ type: "", message: "" });
  const [proxyLoading, setProxyLoading] = useState(false);
  const [proxyTestLoading, setProxyTestLoading] = useState(false);

  const [isRemoteHost, setIsRemoteHost] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined")
      setIsRemoteHost(!["localhost", "127.0.0.1", "::1"].includes(window.location.hostname));
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/settings").then((res) => res.json()),
      fetch("/api/proxy-pools?isActive=true", { cache: "no-store" })
        .then((res) => res.json())
        .catch(() => ({})),
    ])
      .then(([data, poolsData]) => {
        setSettings(data);
        setProxyPools(poolsData?.proxyPools || []);
        setProxyForm({
          outboundProxyEnabled: data?.outboundProxyEnabled === true,
          outboundProxyPoolId: data?.outboundProxyPoolId || "",
          outboundProxyUrl: data?.outboundProxyUrl || "",
          outboundNoProxy: data?.outboundNoProxy || "",
        });
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch settings:", err);
        setLoading(false);
      });
  }, []);

  const updateOutboundProxy = async (e) => {
    e.preventDefault();
    if (settings.outboundProxyEnabled !== true) return;
    setProxyLoading(true);
    setProxyStatus({ type: "", message: "" });

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outboundProxyPoolId: proxyForm.outboundProxyPoolId || "",
          outboundProxyUrl: proxyForm.outboundProxyUrl,
          outboundNoProxy: proxyForm.outboundNoProxy,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setSettings((prev) => ({ ...prev, ...data }));
        setProxyForm((prev) => ({
          ...prev,
          outboundProxyPoolId: data?.outboundProxyPoolId ?? prev.outboundProxyPoolId,
        }));
        setProxyStatus({ type: "success", message: "Proxy settings applied" });
      } else {
        setProxyStatus({ type: "error", message: data.error || "Failed to update proxy settings" });
      }
    } catch (err) {
      setProxyStatus({ type: "error", message: "An error occurred" });
    } finally {
      setProxyLoading(false);
    }
  };

  const testOutboundProxy = async () => {
    if (settings.outboundProxyEnabled !== true) return;

    const poolId = (proxyForm.outboundProxyPoolId || "").trim();
    const proxyUrl = (proxyForm.outboundProxyUrl || "").trim();
    const selectedPool = proxyPools.find((p) => p.id === poolId);
    const effectiveUrl = poolId && selectedPool ? selectedPool.proxyUrl : proxyUrl;

    if (poolId && !selectedPool) {
      setProxyStatus({ type: "error", message: "Selected proxy pool no longer exists" });
      return;
    }
    if (!effectiveUrl) {
      setProxyStatus({
        type: "error",
        message: "Please select a proxy pool or enter a Proxy URL to test",
      });
      return;
    }

    setProxyTestLoading(true);
    setProxyStatus({ type: "", message: "" });

    try {
      const res = await fetch("/api/settings/proxy-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proxyUrl: effectiveUrl }),
      });

      const data = await res.json();
      if (res.ok && data?.ok) {
        setProxyStatus({
          type: "success",
          message: `Proxy test OK (${data.status}) in ${data.elapsedMs}ms`,
        });
      } else {
        setProxyStatus({
          type: "error",
          message: data?.error || "Proxy test failed",
        });
      }
    } catch (err) {
      setProxyStatus({ type: "error", message: "An error occurred" });
    } finally {
      setProxyTestLoading(false);
    }
  };

  const updateOutboundProxyEnabled = async (outboundProxyEnabled) => {
    setProxyLoading(true);
    setProxyStatus({ type: "", message: "" });

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outboundProxyEnabled }),
      });

      const data = await res.json();
      if (res.ok) {
        setSettings((prev) => ({ ...prev, ...data }));
        setProxyForm((prev) => ({
          ...prev,
          outboundProxyEnabled: data?.outboundProxyEnabled === true,
        }));
        setProxyStatus({
          type: "success",
          message: outboundProxyEnabled ? "Proxy enabled" : "Proxy disabled",
        });
      } else {
        setProxyStatus({ type: "error", message: data.error || "Failed to update proxy settings" });
      }
    } catch (err) {
      setProxyStatus({ type: "error", message: "An error occurred" });
    } finally {
      setProxyLoading(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (passwords.new !== passwords.confirm) {
      setPassStatus({ type: "error", message: "Passwords do not match" });
      return;
    }

    setPassLoading(true);
    setPassStatus({ type: "", message: "" });

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: passwords.current,
          newPassword: passwords.new,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setPassStatus({ type: "success", message: "Password updated successfully" });
        setPasswords({ current: "", new: "", confirm: "" });
      } else {
        setPassStatus({ type: "error", message: data.error || "Failed to update password" });
      }
    } catch (err) {
      setPassStatus({ type: "error", message: "An error occurred" });
    } finally {
      setPassLoading(false);
    }
  };

  const updateFallbackStrategy = async (strategy) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fallbackStrategy: strategy }),
      });
      if (res.ok) {
        setSettings((prev) => ({ ...prev, fallbackStrategy: strategy }));
      }
    } catch (err) {
      console.error("Failed to update settings:", err);
    }
  };

  const updateComboStrategy = async (strategy) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comboStrategy: strategy }),
      });
      if (res.ok) {
        setSettings((prev) => ({ ...prev, comboStrategy: strategy }));
      }
    } catch (err) {
      console.error("Failed to update combo strategy:", err);
    }
  };

  const updateStickyLimit = async (limit) => {
    const numLimit = parseInt(limit);
    if (isNaN(numLimit) || numLimit < 1) return;

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stickyRoundRobinLimit: numLimit }),
      });
      if (res.ok) {
        setSettings((prev) => ({ ...prev, stickyRoundRobinLimit: numLimit }));
      }
    } catch (err) {
      console.error("Failed to update sticky limit:", err);
    }
  };

  const updateComboStickyLimit = async (limit) => {
    const numLimit = parseInt(limit);
    if (isNaN(numLimit) || numLimit < 1) return;

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comboStickyRoundRobinLimit: numLimit }),
      });
      if (res.ok) {
        setSettings((prev) => ({ ...prev, comboStickyRoundRobinLimit: numLimit }));
      }
    } catch (err) {
      console.error("Failed to update combo sticky limit:", err);
    }
  };

  const updateRequireLogin = async (requireLogin) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requireLogin }),
      });
      if (res.ok) {
        setSettings((prev) => ({ ...prev, requireLogin }));
      }
    } catch (err) {
      console.error("Failed to update require login:", err);
    }
  };

  const reloadSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) return;
      const data = await res.json();
      setSettings(data);
    } catch (err) {
      console.error("Failed to reload settings:", err);
    }
  };

  const handleExportDatabase = async (password) => {
    setDbLoading(true);
    setDbStatus({ type: "", message: "" });
    try {
      const res = await fetch("/api/settings/database", {
        headers: { "x-10r-password": password },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to export database");
      }

      const payload = await res.json();
      const content = JSON.stringify(payload, null, 2);
      const blob = new Blob([content], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const stamp = new Date().toISOString().replace(/[.:]/g, "-");
      anchor.href = url;
      anchor.download = `10router-backup-${stamp}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      setDbStatus({ type: "success", message: "Database backup downloaded" });
    } catch (err) {
      setDbStatus({ type: "error", message: err.message || "Failed to export database" });
    } finally {
      setDbLoading(false);
    }
  };

  const handleImportDatabase = (event) => {
    const file = event.target.files?.[0];
    if (importFileRef.current) importFileRef.current.value = "";
    if (!file) return;
    pendingImportRef.current = file;
    setDbStatus({ type: "", message: "" });
    setDbAuth({ open: true, mode: "import", password: "" });
  };

  const runImportDatabase = async (password) => {
    const file = pendingImportRef.current;
    if (!file) return;
    setDbLoading(true);
    try {
      const raw = await file.text();
      const payload = JSON.parse(raw);

      const res = await fetch("/api/settings/database", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, password }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to import database");
      }

      await reloadSettings();
      setDbStatus({ type: "success", message: "Database imported successfully" });
    } catch (err) {
      setDbStatus({ type: "error", message: err.message || "Invalid backup file" });
    } finally {
      pendingImportRef.current = null;
      setDbLoading(false);
    }
  };

  // Confirm password modal, then run export or import.
  const handleDbAuthConfirm = async () => {
    const { mode, password } = dbAuth;
    setDbAuth({ open: false, mode: "", password: "" });
    if (mode === "export") await handleExportDatabase(password);
    else if (mode === "import") await runImportDatabase(password);
  };

  const handleLogout = async () => {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (res.ok) {
        window.location.assign("/login");
      }
    } catch (err) {
      console.error("Failed to logout:", err);
    }
  };

  return (
    <Page width="narrow">
      <div className="flex flex-col gap-6">
        {/* Local Mode Info */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-[10px] bg-background text-muted-foreground">
                <Icon name="computer" className="text-[20px]" />
              </div>
              <div>
                <CardTitle>Local Mode</CardTitle>
                <CardDescription>Running on your machine</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 pt-4 border-t border-border">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 rounded-lg bg-background border border-border gap-2">
                <div>
                  <p className="font-medium text-sm sm:text-base">Database Location</p>
                  <p className="text-xs sm:text-sm text-muted-foreground font-mono break-all">
                    ~/.10router/db/data.sqlite
                  </p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setDbAuth({ open: true, mode: "export", password: "" })}
                  disabled={dbLoading}
                  className="w-full sm:w-auto"
                >
                  {dbLoading ? <Loader2 className="animate-spin" /> : <Icon name="download" />}
                  Download Backup
                </Button>
                <Button
                  variant="outline"
                  onClick={() => importFileRef.current?.click()}
                  disabled={dbLoading}
                  className="w-full sm:w-auto"
                >
                  <Icon name="upload" />
                  Import Backup
                </Button>
                <input
                  ref={importFileRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={handleImportDatabase}
                />
              </div>
              {dbStatus.message && (
                <p
                  className={`text-sm ${dbStatus.type === "error" ? "text-red-500" : "text-green-600 dark:text-green-400"}`}
                >
                  {dbStatus.message}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Security */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-[10px] bg-background text-muted-foreground">
                <Icon name="shield" className="text-[20px]" />
              </div>
              <div>
                <CardTitle>Security</CardTitle>
                <CardDescription>Login and password settings</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              <div className="flex items-start sm:items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm sm:text-base">Require login</p>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    When ON, dashboard requires password. When OFF, access without login.
                  </p>
                </div>
                <Switch
                  checked={settings.requireLogin === true}
                  onCheckedChange={() => updateRequireLogin(!settings.requireLogin)}
                  disabled={loading}
                />
              </div>
              {settings.requireLogin === true && (
                <form
                  onSubmit={handlePasswordChange}
                  className="flex flex-col gap-4 pt-4 border-t border-border/50"
                >
                  {settings.hasPassword && (
                    <div className="flex flex-col gap-2">
                      <label className="text-xs sm:text-sm font-medium">Current Password</label>
                      <Input
                        type="password"
                        placeholder="Enter current password"
                        value={passwords.current}
                        onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                        required
                      />
                    </div>
                  )}
                  {/* {!settings.hasPassword && (
                  <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <p className="text-sm text-blue-600 dark:text-blue-400">
                      Setting password for the first time. Leave current password empty or use default: <code className="bg-blue-500/20 px-1 rounded">123456</code>
                    </p>
                  </div>
                )} */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                      <label className="text-xs sm:text-sm font-medium">New Password</label>
                      <Input
                        type="password"
                        placeholder="Enter new password"
                        value={passwords.new}
                        onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-xs sm:text-sm font-medium">Confirm New Password</label>
                      <Input
                        type="password"
                        placeholder="Confirm new password"
                        value={passwords.confirm}
                        onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  {passStatus.message && (
                    <p
                      className={`text-xs sm:text-sm ${passStatus.type === "error" ? "text-red-500" : "text-green-500"}`}
                    >
                      {passStatus.message}
                    </p>
                  )}

                  <div className="pt-2">
                    <Button type="submit" disabled={passLoading} className="w-full sm:w-auto">
                      {passLoading && <Loader2 className="animate-spin" />}
                      {settings.hasPassword ? "Update Password" : "Set Password"}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Routing Preferences */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-[10px] bg-background text-muted-foreground">
                <Icon name="route" className="text-[20px]" />
              </div>
              <div>
                <CardTitle>Routing Strategy</CardTitle>
                <CardDescription>How requests distribute across accounts</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              <div className="flex items-start sm:items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm sm:text-base">Round Robin</p>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Cycle through accounts to distribute load
                  </p>
                </div>
                <Switch
                  checked={settings.fallbackStrategy === "round-robin"}
                  onCheckedChange={() =>
                    updateFallbackStrategy(
                      settings.fallbackStrategy === "round-robin" ? "fill-first" : "round-robin",
                    )
                  }
                  disabled={loading}
                />
              </div>

              {/* Sticky Round Robin Limit */}
              {settings.fallbackStrategy === "round-robin" && (
                <div className="flex items-start sm:items-center justify-between gap-4 pt-2 border-t border-border/50">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm sm:text-base">Sticky Limit</p>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      Calls per account before switching
                    </p>
                  </div>
                  <Input
                    type="number"
                    min="1"
                    max="10"
                    value={settings.stickyRoundRobinLimit || 3}
                    onChange={(e) => updateStickyLimit(e.target.value)}
                    disabled={loading}
                    className="w-16 sm:w-20 text-center shrink-0"
                  />
                </div>
              )}

              {/* Combo Round Robin */}
              <div className="flex items-start sm:items-center justify-between gap-4 pt-4 border-t border-border/50">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm sm:text-base">Combo Round Robin</p>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Cycle through providers in combos instead of always starting with first
                  </p>
                </div>
                <Switch
                  checked={settings.comboStrategy === "round-robin"}
                  onCheckedChange={() =>
                    updateComboStrategy(
                      settings.comboStrategy === "round-robin" ? "fallback" : "round-robin",
                    )
                  }
                  disabled={loading}
                />
              </div>

              {/* Combo Sticky Round Robin Limit */}
              {settings.comboStrategy === "round-robin" && (
                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                  <div>
                    <p className="font-medium">Combo Sticky Limit</p>
                    <p className="text-sm text-muted-foreground">
                      Calls per combo model before switching
                    </p>
                  </div>
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    value={settings.comboStickyRoundRobinLimit || 1}
                    onChange={(e) => updateComboStickyLimit(e.target.value)}
                    disabled={loading}
                    className="w-20 text-center"
                  />
                </div>
              )}

              <p className="text-xs text-muted-foreground italic pt-2 border-t border-border/50">
                {settings.fallbackStrategy === "round-robin"
                  ? `Currently distributing requests across all available accounts with ${settings.stickyRoundRobinLimit || 3} calls per account.`
                  : "Currently using accounts in priority order (Fill First)."}
                {settings.comboStrategy === "round-robin"
                  ? ` Combos rotate after ${settings.comboStickyRoundRobinLimit || 1} call${(settings.comboStickyRoundRobinLimit || 1) === 1 ? "" : "s"} per model.`
                  : " Combos always start with their first model."}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Network */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-[10px] bg-background text-muted-foreground">
                <Icon name="wifi" className="text-[20px]" />
              </div>
              <div>
                <CardTitle>Network</CardTitle>
                <CardDescription>Outbound proxy for provider requests</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              <div className="flex items-start sm:items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm sm:text-base">Outbound Proxy</p>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Enable proxy for OAuth + provider outbound requests.
                  </p>
                </div>
                <Switch
                  checked={settings.outboundProxyEnabled === true}
                  onCheckedChange={() =>
                    updateOutboundProxyEnabled(!(settings.outboundProxyEnabled === true))
                  }
                  disabled={loading || proxyLoading}
                />
              </div>

              {settings.outboundProxyEnabled === true && (
                <form
                  onSubmit={updateOutboundProxy}
                  className="flex flex-col gap-4 pt-2 border-t border-border/50"
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-foreground">Proxy Pool</label>
                      <Select
                        value={proxyForm.outboundProxyPoolId || "__manual__"}
                        onValueChange={(v) =>
                          setProxyForm((prev) => ({
                            ...prev,
                            outboundProxyPoolId: v === "__manual__" ? "" : v,
                          }))
                        }
                        disabled={loading || proxyLoading}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select an option" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__manual__">Manual URL (below)</SelectItem>
                          {proxyPools
                            .filter((p) => (p?.type || "http") === "http")
                            .map((p) => (
                              <SelectItem key={p.id} value={String(p.id)}>
                                {p.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        An HTTP pool overrides the manual URL. Relay pools can&apos;t be a global
                        proxy.
                      </p>
                      {proxyPools.filter((p) => (p?.type || "http") === "http").length === 0 && (
                        <p className="text-xs text-amber-500">
                          No HTTP proxy pools yet —{" "}
                          <a href="/dashboard/proxy-pools" className="underline">
                            create one in Proxy Pools
                          </a>
                          .
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="font-medium text-sm sm:text-base">Proxy URL</label>
                    <Input
                      placeholder="http://127.0.0.1:7897"
                      value={proxyForm.outboundProxyUrl}
                      onChange={(e) =>
                        setProxyForm((prev) => ({ ...prev, outboundProxyUrl: e.target.value }))
                      }
                      disabled={loading || proxyLoading || !!proxyForm.outboundProxyPoolId}
                    />
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      {proxyForm.outboundProxyPoolId
                        ? "Using the selected pool — clear it to edit the URL."
                        : "Leave empty to inherit existing env proxy (if any)."}
                    </p>
                  </div>

                  <div className="flex flex-col gap-2 pt-2 border-t border-border/50">
                    <label className="font-medium text-sm sm:text-base">No Proxy</label>
                    <Input
                      placeholder="localhost,127.0.0.1"
                      value={proxyForm.outboundNoProxy}
                      onChange={(e) =>
                        setProxyForm((prev) => ({ ...prev, outboundNoProxy: e.target.value }))
                      }
                      disabled={loading || proxyLoading || !!proxyForm.outboundProxyPoolId}
                    />
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      {proxyForm.outboundProxyPoolId
                        ? "Using the pool's No Proxy — clear the pool to edit."
                        : "Comma-separated hostnames/domains to bypass the proxy."}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-border/50 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={loading || proxyLoading || proxyTestLoading}
                      onClick={testOutboundProxy}
                      className="w-full sm:w-auto"
                    >
                      {proxyTestLoading && <Loader2 className="animate-spin" />}
                      Test proxy URL
                    </Button>
                    <Button type="submit" disabled={proxyLoading} className="w-full sm:w-auto">
                      {proxyLoading && <Loader2 className="animate-spin" />}
                      Apply
                    </Button>
                  </div>
                </form>
              )}

              {proxyStatus.message && (
                <p
                  className={`text-xs sm:text-sm ${proxyStatus.type === "error" ? "text-red-500" : "text-green-500"} pt-2 border-t border-border/50`}
                >
                  {proxyStatus.message}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Account actions */}
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => shutdown.open()}
            className="flex-1 text-red-500 border-red-200 hover:text-red-500 hover:bg-red-50 hover:border-red-300"
          >
            <Icon name="power_settings_new" />
            Shutdown
          </Button>
          <Button
            variant="outline"
            onClick={handleLogout}
            className="flex-1 hover:text-red-500 hover:bg-red-50 hover:border-red-300"
          >
            <Icon name="logout" />
            Logout
          </Button>
        </div>

        {/* App Info */}
        <div className="text-center text-xs sm:text-sm text-muted-foreground py-4">
          <p>
            {APP_CONFIG.name} v{APP_CONFIG.version}
          </p>
          <p className="mt-1">
            {isRemoteHost ? "Remote Mode" : "Local Mode - All data stored on your machine"}
          </p>
        </div>
      </div>

      <ShutdownModal
        isOpen={shutdown.confirmOpen || shutdown.stopped || shutdown.timedOut}
        onClose={shutdown.reset}
        onConfirm={shutdown.confirm}
        shuttingDown={shutdown.shuttingDown}
        stopped={shutdown.stopped}
        timedOut={shutdown.timedOut}
      />

      <Dialog
        open={dbAuth.open}
        onOpenChange={(open) => {
          if (!open) setDbAuth({ open: false, mode: "", password: "" });
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm Password</DialogTitle>
          </DialogHeader>
          <div className="max-h-[calc(85vh-100px)] overflow-y-auto p-4">
            <p className="text-muted-foreground mb-3 text-sm">
              Enter your current password to {dbAuth.mode === "export" ? "export" : "import"} the
              database.
            </p>
            <Input
              type="password"
              value={dbAuth.password}
              onChange={(e) => setDbAuth((s) => ({ ...s, password: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && dbAuth.password) handleDbAuthConfirm();
              }}
              placeholder="Current password"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDbAuth({ open: false, mode: "", password: "" })}
              disabled={dbLoading}
            >
              Cancel
            </Button>
            <Button onClick={handleDbAuthConfirm} disabled={dbLoading || !dbAuth.password}>
              {dbLoading && <Loader2 className="animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
