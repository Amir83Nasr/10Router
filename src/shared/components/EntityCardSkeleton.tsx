"use client";

import { cn } from "@/shared/utils/cn";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// ── ENTITY CARD SKELETON ─────────────────────────────────
// Mirrors EntityCard (size="sm"): icon + title/badges + chevron row
// inside CardContent. Replaces generic CardSkeleton on card grids.

// ── STAT CARD SKELETON ───────────────────────────────────
// Mirrors UsageStats OverviewCards: label + 2xl value.

export function EntityCardSkeleton({ className }: { className?: string }) {
  return (
    <Card size="sm" aria-hidden className={cn("h-full overflow-hidden", className)}>
      <CardContent>
        <div className="flex min-w-0 items-center gap-3">
          <Skeleton className="size-10 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-2/3" />
            <div className="mt-2 flex items-center gap-1.5">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
          </div>
          <Skeleton className="size-4 shrink-0 rounded-full" />
        </div>
      </CardContent>
    </Card>
  );
}

export function StatCardSkeleton({ className }: { className?: string }) {
  return (
    <Card aria-hidden className={cn("min-w-0 overflow-hidden px-4 py-3", className)}>
      <CardContent className="flex min-w-0 flex-col gap-1 px-0 py-0">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-20" />
      </CardContent>
    </Card>
  );
}

// ── PANEL SKELETON ───────────────────────────────────────
// Mirrors full-width Card panels (endpoint keys, combo rows,
// provider detail cards): header row + 3 body lines.

export function PanelSkeleton({ className }: { className?: string }) {
  return (
    <Card aria-hidden className={cn("overflow-hidden", className)}>
      <CardContent>
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 shrink-0 rounded-[10px]" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-2 h-3 w-56" />
          </div>
          <Skeleton className="h-9 w-24 shrink-0 rounded-lg" />
        </div>
        <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </CardContent>
    </Card>
  );
}
