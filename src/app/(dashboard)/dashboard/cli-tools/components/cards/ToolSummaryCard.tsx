"use client";

import { Badge } from "@/components/ui/badge";
import EntityCard from "@/shared/components/EntityCard";
import ProviderIcon from "@/shared/components/ProviderIcon";

// Derive simple connected/configured/not-installed status from API payload
function getStatus(status, tool) {
  if (tool?.configType === "guide") return { label: "Guide", tone: "info" as const };
  if (!status) return { label: "Unknown", tone: "muted" as const };
  if (status.container && status.installed == null)
    return { label: "Manual setup", tone: "info" as const };
  if (!status.installed) return { label: "Not installed", tone: "muted" as const };
  if (status.has10Router) return { label: "Connected", tone: "ok" as const };
  return { label: "Not configured", tone: "warn" as const };
}

const toneDot: Record<string, string> = {
  ok: "bg-green-500",
  warn: "bg-amber-500",
  info: "bg-blue-500",
  muted: "bg-muted-foreground/50",
};

export default function ToolSummaryCard({ toolId, tool, status }: any) {
  const s = getStatus(status, tool);
  return (
    <EntityCard
      href={`/dashboard/cli-tools/${toolId}`}
      title={tool.name}
      iconBg={tool.color ? `${tool.color}15` : undefined}
      icon={
        <ProviderIcon
          src={tool.image}
          alt={tool.name}
          size={30}
          className="max-h-[30px] max-w-[30px] rounded-lg object-contain"
          fallbackText={tool.name.slice(0, 2).toUpperCase()}
          fallbackColor={tool.color}
        />
      }
    >
      <Badge variant="default">
        <span className={`size-1.5 rounded-full ${toneDot[s.tone]}`} />
        {s.label}
      </Badge>
    </EntityCard>
  );
}
