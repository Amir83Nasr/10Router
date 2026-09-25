"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Page, PageHeader, CardGrid } from "@/shared/components/layouts";
import EntityCard from "@/shared/components/EntityCard";
import ProviderIcon from "@/shared/components/ProviderIcon";
import {
  MEDIA_PROVIDER_KINDS,
  AI_PROVIDERS,
  getProvidersByKind,
} from "@/shared/constants/providers";

// ── STATUS ───────────────────────────────────────────────
function getEffectiveStatus(conn: any) {
  const isCooldown = Object.entries(conn).some(
    ([k, v]) => k.startsWith("modelLock_") && v && new Date(v as string).getTime() > Date.now(),
  );
  return conn.testStatus === "unavailable" && !isCooldown ? "active" : conn.testStatus;
}

function providerIconBg(color?: string) {
  if (!color) return undefined;
  return color.length > 7 ? color : `${color}15`;
}

export default function SystemOneProvidersPage() {
  const [connections, setConnections] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/providers", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setConnections(d.connections || []))
      .catch(() => {});
  }, []);

  const kindConfig = MEDIA_PROVIDER_KINDS.find((k) => k.id === "systemone");
  const providers = getProvidersByKind("systemone");

  return (
    <Page>
      <PageHeader
        title="System One"
        backHref="/dashboard/providers"
        backLabel="Providers"
        description={
          <>
            {kindConfig?.label ?? "Decision models"} (Jev) — native{" "}
            <code className="font-mono text-xs bg-sidebar px-1 py-0.5 rounded">
              POST /v1/systemone
            </code>{" "}
            endpoint. Send a state + questions, get scored answers back.
          </>
        }
      />

      {providers.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-xl text-muted-foreground text-sm">
          No providers support <strong>System One</strong> yet.
        </div>
      ) : (
        <CardGrid>
          {providers.map((provider: any) => {
            const providerConns = connections.filter((c) => c.provider === provider.id);
            const connected = providerConns.filter((c) => {
              const s = getEffectiveStatus(c);
              return s === "active" || s === "success";
            }).length;
            const error = providerConns.filter((c) => {
              const s = getEffectiveStatus(c);
              return s === "error" || s === "expired" || s === "unavailable";
            }).length;
            const isNoAuth = !!AI_PROVIDERS[provider.id]?.noAuth;
            return (
              <EntityCard
                key={provider.id}
                href={`/dashboard/media-providers/systemone/${provider.id}`}
                title={provider.name}
                iconBg={providerIconBg(provider.color ?? "#888")}
                icon={
                  <ProviderIcon
                    src={`/providers/${provider.id}.png`}
                    alt={provider.name}
                    size={30}
                    className="max-h-[30px] max-w-[30px] rounded-lg object-contain"
                    fallbackText={provider.textIcon || provider.id.slice(0, 2).toUpperCase()}
                    fallbackColor={provider.color}
                  />
                }
              >
                {isNoAuth ? (
                  <Badge variant="default">
                    <span className="size-1.5 rounded-full bg-green-500" />
                    Ready
                  </Badge>
                ) : providerConns.length === 0 ? (
                  <span className="text-xs text-muted-foreground">No connections</span>
                ) : (
                  <>
                    {connected > 0 && (
                      <Badge variant="default">
                        <span className="size-1.5 rounded-full bg-green-500" />
                        {connected} Connected
                      </Badge>
                    )}
                    {error > 0 && (
                      <Badge variant="destructive">
                        <span className="size-1.5 rounded-full bg-red-500" />
                        {error} Error
                      </Badge>
                    )}
                    {connected === 0 && error === 0 && (
                      <Badge variant="default">{providerConns.length} Added</Badge>
                    )}
                  </>
                )}
              </EntityCard>
            );
          })}
        </CardGrid>
      )}
    </Page>
  );
}
