"use client";

import type { MouseEvent, ReactNode } from "react";
import Link from "next/link";
import { cn } from "cn";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tooltip as ShadcnTooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import Icon from "@/shared/components/Icon";

export interface EntityCardToggle {
  checked: boolean;
  enabledLabel?: string;
  disabledLabel?: string;
  onToggle: (next: boolean) => void;
}

interface EntityCardProps {
  href: string;
  icon: ReactNode;
  iconBg?: string;
  title: string;
  children: ReactNode;
  meta?: ReactNode;
  dimmed?: boolean;
  toggle?: EntityCardToggle;
  className?: string;
}

export default function EntityCard({
  href,
  icon,
  iconBg,
  title,
  children,
  meta,
  dimmed,
  toggle,
  className,
}: EntityCardProps) {
  const label = toggle
    ? toggle.checked
      ? (toggle.disabledLabel ?? "Disable")
      : (toggle.enabledLabel ?? "Enable")
    : undefined;
  const onToggleClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!toggle) return;
    e.preventDefault();
    e.stopPropagation();
    toggle.onToggle(!toggle.checked);
  };
  return (
    <Link href={href} className="group block h-full min-w-0">
      <Card
        size="sm"
        className={cn(
          "h-full transition-all hover:border-primary/40 hover:shadow-sm",
          dimmed && "opacity-50",
          className,
        )}
      >
        <CardContent>
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-foreground/5"
              style={iconBg ? { backgroundColor: iconBg } : undefined}
            >
              {icon}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-semibold">{title}</h3>
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
                {children}
                {meta}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {toggle && (
                <div
                  className="opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                  onClick={onToggleClick}
                >
                  <ShadcnTooltip>
                    <TooltipTrigger asChild>
                      <Switch
                        size="sm"
                        checked={toggle.checked}
                        onCheckedChange={() => {}}
                        aria-label={label}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="top">{label}</TooltipContent>
                  </ShadcnTooltip>
                </div>
              )}
              <Icon
                name="chevron_right"
                className="shrink-0 text-[18px] text-muted-foreground transition-transform group-hover:translate-x-0.5"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
