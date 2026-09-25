"use client";

// ponytail: Spinner/PageLoading/CardSkeleton stay custom (no shadcn
// equivalent for spinner); Skeleton now re-exports shadcn ui/skeleton.

import { cn } from "@/shared/utils/cn";
import Icon from "@/shared/components/Icon";
import { Skeleton as ShadcnSkeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

interface SpinnerProps {
  size?: any;
  className?: string;
  [key: string]: any;
}

interface PageLoadingProps {
  message?: any;
  [key: string]: any;
}

interface SkeletonProps {
  className?: string;
  [key: string]: any;
}

interface LoadingProps {
  type?: any;
  size?: any;
  message?: any;
  className?: string;
  [key: string]: any;
}

// Spinner loading
export function Spinner({ size = "md", className }: SpinnerProps) {
  const sizes = {
    sm: "size-4",
    md: "size-6",
    lg: "size-8",
    xl: "size-12",
  };

  return (
    <Icon
      name="progress_activity"
      className={cn("animate-spin text-primary", sizes[size], className)}
    />
  );
}

// Full page loading
export function PageLoading({ message = "Loading..." }: PageLoadingProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background">
      <Spinner size="xl" />
      <p className="mt-4 text-muted-foreground">{message}</p>
    </div>
  );
}

// Skeleton loading
export function Skeleton({ className, ...props }: SkeletonProps) {
  return <ShadcnSkeleton className={className} {...props} />;
}

// Card skeleton — mirrors EntityCard (size="sm"): icon + title/badges +
// chevron inside shadcn Card so grid keeps real card size/spacing.
// ponytail: PanelSkeleton covers full-width panels; add a TableSkeleton
// only when a table page needs one.
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <Card aria-hidden className={cn("h-full overflow-hidden", className)}>
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

export default function Loading({ type = "spinner", ...props }: LoadingProps) {
  switch (type) {
    case "page":
      return <PageLoading {...props} />;
    case "skeleton":
      return <Skeleton {...props} />;
    case "card":
      return <CardSkeleton />;
    default:
      return <Spinner {...props} />;
  }
}
