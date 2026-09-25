import { Suspense } from "react";
import { PanelSkeleton } from "@/shared/components";
import ProviderLimits from "../usage/components/ProviderLimits";

export default function QuotaPage() {
  return (
    <Suspense fallback={<PanelSkeleton />}>
      <ProviderLimits />
    </Suspense>
  );
}
