"use client";

import { Suspense, useState } from "react";
import {
  UsageStats,
  SegmentedControl,
  Page,
  StatCardSkeleton,
  CardGrid,
} from "@/shared/components";

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "60d", label: "60D" },
];

export default function UsagePage() {
  return (
    <Suspense
      fallback={
        <Page>
          <CardGrid variant="stat">
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </CardGrid>
        </Page>
      }
    >
      <UsageContent />
    </Suspense>
  );
}

function UsageContent() {
  const [period, setPeriod] = useState("today");

  return (
    <Page>
      <div className="flex justify-start">
        <SegmentedControl
          options={PERIODS}
          value={period}
          onChange={setPeriod}
          size="sm"
          className="w-full sm:w-auto"
        />
      </div>

      <Suspense
        fallback={
          <CardGrid variant="stat">
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </CardGrid>
        }
      >
        <UsageStats period={period} setPeriod={setPeriod} hidePeriodSelector />
      </Suspense>
    </Page>
  );
}
