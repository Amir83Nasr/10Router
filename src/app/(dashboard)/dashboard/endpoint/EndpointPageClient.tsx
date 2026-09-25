"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardAction,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import Icon from "@/shared/components/Icon";
import { Page, PanelSkeleton, ConfirmModal } from "@/shared/components";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import EndpointRow from "./components/EndpointRow";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import SecurityWarning from "./components/SecurityWarning";
export default function APIPageClient({ machineId }: any) {
  const [keys, setKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [newKeyName, setNewKeyName] = useState<string>("");
  const [createdKey, setCreatedKey] = useState<any>(null);
  const [confirmState, setConfirmState] = useState<any>(null);

  const [requireApiKey, setRequireApiKey] = useState<boolean>(false);

  // API key visibility toggle state
  const [visibleKeys, setVisibleKeys] = useState(new Set());

  // Client-side local/remote detection (UI hint only, not a security gate)
  const [isRemoteHost, setIsRemoteHost] = useState<boolean>(false);
  useEffect(() => {
    if (typeof window !== "undefined")
      setIsRemoteHost(!["localhost", "127.0.0.1", "::1"].includes(window.location.hostname));
  }, []);

  const { copied, copy } = useCopyToClipboard();

  useEffect(() => {
    fetchData();
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const settingsRes = await fetch("/api/settings");
      if (settingsRes.ok) {
        const data = await settingsRes.json();
        setRequireApiKey(data.requireApiKey || false);
      }
    } catch (error) {
      console.log("Error loading settings:", error);
    }
  };

  const handleRequireApiKey = async (value) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requireApiKey: value }),
      });
      if (res.ok) setRequireApiKey(value);
    } catch (error) {
      console.log("Error updating requireApiKey:", error);
    }
  };

  const fetchData = async () => {
    try {
      const fetchKeys = async () => {
        const res = await fetch("/api/keys");
        if (!res.ok) return [];
        const data = await res.json();
        return data.keys || [];
      };

      let existing = await fetchKeys();
      // Auto-provision a default key for first-time users so the endpoint works out of the box.
      if (existing.length === 0) {
        try {
          const createRes = await fetch("/api/keys", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Default Key" }),
          });
          if (createRes.ok) existing = await fetchKeys();
        } catch {
          /* fall through to empty render */
        }
      }
      setKeys(existing);
    } catch (error) {
      console.log("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return;

    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName }),
      });
      const data = await res.json();

      if (res.ok) {
        setCreatedKey(data.key);
        await fetchData();
        setNewKeyName("");
        setShowAddModal(false);
      }
    } catch (error) {
      console.log("Error creating key:", error);
    }
  };

  const handleDeleteKey = async (id) => {
    setConfirmState({
      title: "Delete API Key",
      message: "Delete this API key?",
      onConfirm: async () => {
        setConfirmState(null);
        try {
          const res = await fetch(`/api/keys/${id}`, { method: "DELETE" });
          if (res.ok) {
            setKeys(keys.filter((k) => k.id !== id));
            setVisibleKeys((prev) => {
              const next = new Set(prev);
              next.delete(id);
              return next;
            });
          }
        } catch (error) {
          console.log("Error deleting key:", error);
        }
      },
    });
  };

  const maskKey = (fullKey) => {
    if (!fullKey || fullKey.length <= 10) return fullKey || "";
    return fullKey.slice(0, 6) + "•".repeat(fullKey.length - 10) + fullKey.slice(-4);
  };

  const toggleKeyVisibility = (keyId) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(keyId)) next.delete(keyId);
      else next.add(keyId);
      return next;
    });
  };

  const [baseUrl, setBaseUrl] = useState<string>("/v1");

  // Hydration fix: Only access window on client side
  useEffect(() => {
    if (typeof window !== "undefined") {
      setBaseUrl(`${window.location.origin}/v1`);
    }
  }, []);

  if (loading) {
    return (
      <Page>
        <PanelSkeleton />
        <PanelSkeleton />
      </Page>
    );
  }

  const currentEndpoint = baseUrl;

  return (
    <>
      <Page>
        {/* Endpoint Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-[10px] bg-background text-muted-foreground">
                <Icon name="api" className="text-[20px]" />
              </div>
              <div>
                <CardTitle>API Endpoint</CardTitle>
                <CardDescription>Local and remote access URLs</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Endpoint rows */}
            <div className="flex flex-col gap-2">
              {/* Local */}
              <EndpointRow
                label="Local"
                url={currentEndpoint}
                copyId="local_url"
                copied={copied}
                onCopy={copy}
              />
            </div>
          </CardContent>
        </Card>

        {/* API Keys */}
        <Card id="require-api-key">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-[10px] bg-background text-muted-foreground">
                <Icon name="vpn_key" className="text-[20px]" />
              </div>
              <div>
                <CardTitle>API Keys</CardTitle>
                <CardDescription>Keys for authenticating gateway requests</CardDescription>
              </div>
            </div>
            <CardAction>
              <Button onClick={() => setShowAddModal(true)}>
                <Icon name="add" />
                Create Key
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-border">
              <div>
                <p className="font-medium">Require API key</p>
                <p className="text-sm text-muted-foreground">
                  Requests without a valid key will be rejected
                </p>
              </div>
              <Switch
                checked={requireApiKey}
                onCheckedChange={() => handleRequireApiKey(!requireApiKey)}
              />
            </div>

            {isRemoteHost && !requireApiKey && (
              <div className="mb-4 -mt-2">
                <SecurityWarning message="Endpoint is exposed without an API key." />
              </div>
            )}

            {keys.length === 0 ? (
              <div className="text-center py-12">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary mb-4">
                  <Icon name="vpn_key" className="text-[32px]" />
                </div>
                <p className="text-foreground font-medium mb-1">No API keys yet</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Create your first API key to get started
                </p>
                <Button onClick={() => setShowAddModal(true)}>
                  <Icon name="add" />
                  Create Key
                </Button>
              </div>
            ) : (
              <div className="flex flex-col">
                {keys.map((key) => (
                  <div
                    key={key.id}
                    className={`group flex items-center justify-between py-3 border-b border-black/[0.03] dark:border-white/[0.03] last:border-b-0 ${key.isActive === false ? "opacity-60" : ""}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{key.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <code className="text-xs text-muted-foreground font-mono">
                          {visibleKeys.has(key.id) ? key.key : maskKey(key.key)}
                        </code>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="relative inline-flex">
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={() => toggleKeyVisibility(key.id)}
                              >
                                <Icon
                                  name={visibleKeys.has(key.id) ? "visibility_off" : "visibility"}
                                  className="text-[14px]"
                                />
                              </Button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            {visibleKeys.has(key.id) ? "Hide key" : "Show key"}
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="relative inline-flex">
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={() => copy(key.key, key.id)}
                              >
                                <Icon
                                  name={copied === key.id ? "check" : "content_copy"}
                                  className="text-[14px]"
                                />
                              </Button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            {copied === key.id ? "Copied!" : "Copy"}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Created {new Date(key.createdAt).toLocaleDateString()}
                      </p>
                      {key.isActive === false && (
                        <p className="text-xs text-orange-500 mt-1">Paused</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDeleteKey(key.id)}
                        className="text-red-500 opacity-100 hover:bg-red-500/10 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100"
                      >
                        <Icon name="delete" className="text-[18px]" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </Page>

      {/* Add Key Modal */}
      <Dialog
        open={showAddModal}
        onOpenChange={(open) => {
          if (!open) {
            setShowAddModal(false);
            setNewKeyName("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
          </DialogHeader>
          <div className="max-h-[calc(85vh-100px)] overflow-y-auto p-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">Key Name</label>
                <Input
                  value={newKeyName}
                  onChange={(e: any) => setNewKeyName(e.target.value)}
                  placeholder="Production Key"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <div className="flex w-full gap-2 sm:w-auto">
              <Button
                onClick={handleCreateKey}
                className="w-full sm:w-auto"
                disabled={!newKeyName.trim()}
              >
                Create
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Created Key Modal */}
      <Dialog open={!!createdKey} onOpenChange={(open) => !open && setCreatedKey(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>API Key Created</DialogTitle>
          </DialogHeader>
          <div className="max-h-[calc(85vh-100px)] overflow-y-auto p-4">
            <div className="flex flex-col gap-4">
              <Alert>
                <AlertDescription>
                  <span className="font-medium">Save this key now! </span>
                  This is the only time you will see this key. Store it securely.
                </AlertDescription>
              </Alert>
              <div className="flex gap-2">
                <Input value={createdKey || ""} readOnly className="flex-1 font-mono text-sm" />
                <Button variant="secondary" onClick={() => copy(createdKey, "created_key")}>
                  <Icon name={copied === "created_key" ? "check" : "content_copy"} />
                  {copied === "created_key" ? "Copied!" : "Copy"}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setCreatedKey(null)} className="w-full sm:w-auto">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
