"use client";

import { Card, CardContent } from "@/components/ui/card";

const fmt = (n) => new Intl.NumberFormat().format(n || 0);
const fmtCost = (n) => `$${(n || 0).toFixed(2)}`;

export default function OverviewCards({ stats }: any) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 sm:gap-4">
      <Card className="flex min-w-0 flex-col gap-1 px-4 py-3">
        <CardContent className="flex min-w-0 flex-col gap-1 px-0 py-0">
          <span className="text-muted-foreground text-sm uppercase font-semibold">
            Total Requests
          </span>
          <span className="truncate text-2xl font-bold">{fmt(stats.totalRequests)}</span>
        </CardContent>
      </Card>
      <Card className="flex min-w-0 flex-col gap-1 px-4 py-3">
        <CardContent className="flex min-w-0 flex-col gap-1 px-0 py-0">
          <span className="text-muted-foreground text-sm uppercase font-semibold">
            Total Input Tokens
          </span>
          <span className="truncate text-2xl font-bold">{fmt(stats.totalPromptTokens)}</span>
        </CardContent>
      </Card>
      <Card className="flex min-w-0 flex-col gap-1 px-4 py-3">
        <CardContent className="flex min-w-0 flex-col gap-1 px-0 py-0">
          <span className="text-muted-foreground text-sm uppercase font-semibold">
            Cached Tokens
          </span>
          <span className="truncate text-2xl font-bold">{fmt(stats.totalCachedTokens)}</span>
        </CardContent>
      </Card>
      <Card className="flex min-w-0 flex-col gap-1 px-4 py-3">
        <CardContent className="flex min-w-0 flex-col gap-1 px-0 py-0">
          <span className="text-muted-foreground text-sm uppercase font-semibold">
            Output Tokens
          </span>
          <span className="truncate text-2xl font-bold">{fmt(stats.totalCompletionTokens)}</span>
        </CardContent>
      </Card>
      <Card className="flex min-w-0 flex-col gap-1 px-4 py-3">
        <CardContent className="flex min-w-0 flex-col gap-1 px-0 py-0">
          <span className="text-muted-foreground text-sm uppercase font-semibold">
            Estimated Cost
          </span>
          <span className="truncate text-2xl font-bold">{fmtCost(stats.totalCost)}</span>
        </CardContent>
      </Card>
    </div>
  );
}
