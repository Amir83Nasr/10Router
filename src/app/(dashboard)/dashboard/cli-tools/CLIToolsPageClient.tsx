"use client";

import { useState, useEffect } from "react";
import { CardSkeleton, Page, PageHeader, CardGrid } from "@/shared/components";
import { CLI_TOOLS } from "@/shared/constants/cliTools";
import ToolSummaryCard from "./components/cards/ToolSummaryCard";

const ALL_STATUSES_URL = "/api/cli-tools/all-statuses";

export default function CLIToolsPageClient({ machineId }: any) {
  const [loading, setLoading] = useState<boolean>(true);
  const [toolStatuses, setToolStatuses] = useState<any>({});

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(ALL_STATUSES_URL);
        if (res.ok && mounted) setToolStatuses(await res.json());
      } catch (error) {
        console.log("Error fetching tool statuses:", error);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <Page>
        <PageHeader
          title="CLI Tools"
          description="Connect coding assistants to 10Router — point each tool at your local endpoint."
          backHref="/dashboard/providers"
          backLabel="Providers"
        />
        <CardGrid>
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </CardGrid>
      </Page>
    );
  }

  const regularTools = Object.entries(CLI_TOOLS);

  return (
    <Page>
      <PageHeader
        title="CLI Tools"
        description="Connect coding assistants to 10Router — point each tool at your local endpoint."
        backHref="/dashboard/providers"
        backLabel="Providers"
      />
      <CardGrid>
        {regularTools.map(([toolId, tool]) => (
          <ToolSummaryCard key={toolId} toolId={toolId} tool={tool} status={toolStatuses[toolId]} />
        ))}
      </CardGrid>
    </Page>
  );
}
