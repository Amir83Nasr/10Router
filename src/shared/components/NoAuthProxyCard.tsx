"use client";
import Icon from "@/shared/components/Icon";

import { useCallback, useEffect, useState } from "react";
import PropTypes from "prop-types";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const NONE_PROXY_POOL_VALUE = "__none__";
const STRATEGIES = [
  { value: "none", label: "None (single pool)" },
  { value: "round-robin", label: "Round-robin" },
  { value: "random", label: "Random" },
];

interface NoAuthProxyCardProps {
  providerId?: any;
  [key: string]: any;
}

export default function NoAuthProxyCard({ providerId }: NoAuthProxyCardProps) {
  const [proxyPools, setProxyPools] = useState<any>([]);
  const [proxyPoolId, setProxyPoolId] = useState(NONE_PROXY_POOL_VALUE);
  const [rotateStrategy, setRotateStrategy] = useState("none");
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/proxy-pools?isActive=true", { cache: "no-store" }).then((r) =>
        r.ok ? r.json() : { proxyPools: [] },
      ),
      fetch("/api/settings", { cache: "no-store" }).then((r) => (r.ok ? r.json() : {})),
    ])
      .then(([poolData, settingsData]: any) => {
        if (cancelled) return;
        setProxyPools(poolData.proxyPools || []);
        const override = (settingsData.providerStrategies || {})[providerId] || {};
        setProxyPoolId(override.proxyPoolId || NONE_PROXY_POOL_VALUE);
        setRotateStrategy(override.rotateStrategy || "none");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [providerId]);

  const save = useCallback(
    async (poolId: any, strategy: any) => {
      setSaving(true);
      try {
        const res = await fetch("/api/settings", { cache: "no-store" });
        const data = res.ok ? await res.json() : {};
        const current = data.providerStrategies || {};
        const override = { ...(current[providerId] || {}) };
        if (poolId === NONE_PROXY_POOL_VALUE) delete override.proxyPoolId;
        else override.proxyPoolId = poolId;
        if (strategy === "none") delete override.rotateStrategy;
        else override.rotateStrategy = strategy;
        const updated = { ...current };
        if (Object.keys(override).length === 0) delete updated[providerId];
        else updated[providerId] = override;
        await fetch("/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ providerStrategies: updated }),
        });
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 1500);
      } catch (e) {
        console.log("Save proxy config error:", e);
      } finally {
        setSaving(false);
      }
    },
    [providerId],
  );

  const handlePoolChange = (newPoolId: any) => {
    setProxyPoolId(newPoolId);
    save(newPoolId, rotateStrategy);
  };

  const handleStrategyChange = (newStrategy: any) => {
    setRotateStrategy(newStrategy);
    save(proxyPoolId, newStrategy);
  };

  const canRotate = proxyPools.length >= 2;
  const isRotation = rotateStrategy !== "none";

  return (
    <Card className="p-6">
      <CardContent>
        <div className="flex items-center gap-3 mb-4">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-green-500/10 text-green-500">
            <Icon name="lock_open" className="text-[20px]" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">No authentication required</p>
            <p className="text-xs text-muted-foreground">
              This provider is ready to use. Optionally route requests through a proxy pool to
              bypass IP-based limits.
            </p>
          </div>
          {savedFlash && <Badge variant="default">Saved</Badge>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Proxy Pool</label>
          <Select
            value={proxyPoolId}
            onValueChange={(v) => handlePoolChange(v)}
            disabled={saving || isRotation}
          >
            <SelectTrigger disabled={saving || isRotation}>
              <SelectValue placeholder="Select an option" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_PROXY_POOL_VALUE}>None (direct)</SelectItem>
              {proxyPools.map((pool: any) => (
                <SelectItem key={pool.id} value={pool.id}>
                  {pool.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isRotation && (
            <p className="text-xs text-muted-foreground">
              Pool selector is ignored when rotation is active — all active pools are used.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 mt-4">
          <label className="text-sm font-medium text-foreground">Rotation Strategy</label>
          <Select value={rotateStrategy} onValueChange={handleStrategyChange} disabled={saving}>
            <SelectTrigger disabled={saving}>
              <SelectValue placeholder="Select an option" />
            </SelectTrigger>
            <SelectContent>
              {STRATEGIES.map((s) => (
                <SelectItem
                  key={s.value}
                  value={s.value}
                  disabled={s.value !== "none" && !canRotate}
                >
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {!canRotate
              ? `Need at least 2 active proxy pools for rotation.`
              : isRotation
                ? rotateStrategy === "round-robin"
                  ? `Rotating through all ${proxyPools.length} active pools in order. State is in-memory (resets on restart).`
                  : `Picking a random pool from ${proxyPools.length} active pools each request.`
                : `Uses the selected pool above. Set to Round-robin or Random to rotate across all active pools.`}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

NoAuthProxyCard.propTypes = {
  providerId: PropTypes.string.isRequired,
};
