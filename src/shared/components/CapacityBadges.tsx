"use client";
import Icon from "@/shared/components/Icon";

import { CAPACITY_META } from "@/shared/constants/models";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// Render small icon badges for a model's capabilities (only those set true).
// colorOverride: force a single color class for all badges (default: per-cap color).
// size: icon font-size in px (default 16).
interface CapacityBadgesProps {
  caps?: any;
  className?: string;
  colorOverride?: any;
  size?: number;
}

export default function CapacityBadges({
  caps,
  className = "",
  colorOverride,
  size = 16,
}: CapacityBadgesProps) {
  if (!caps) return null;
  const active = Object.keys(CAPACITY_META).filter((k) => caps[k]);
  if (active.length === 0) return null;

  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`}>
      {active.map((k) => (
        <Tooltip key={k}>
          <TooltipTrigger asChild>
            <span className="relative inline-flex">
              <Icon
                name={CAPACITY_META[k].icon}
                className={`leading-none cursor-help ${colorOverride || CAPACITY_META[k].color}`}
                style={{ fontSize: `${size}px` }}
              />
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {CAPACITY_META[k].label} — {CAPACITY_META[k].desc}
          </TooltipContent>
        </Tooltip>
      ))}
    </span>
  );
}
