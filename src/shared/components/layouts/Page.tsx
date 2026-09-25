"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/shared/utils/cn";
import { Button } from "@/components/ui/button";
import Icon from "@/shared/components/Icon";

// ── PAGE ─────────────────────────────────────────────────
// Single page-level container. Replaces ad-hoc roots
// (`flex flex-col gap-6` vs `gap-8`, stray `px-1 sm:px-0`,
// `max-w-2xl` vs `max-w-5xl` vs none). DashboardLayout already
// centers `max-w-7xl`; Page only owns vertical rhythm.
// ponytail: one gap scale (gap-6). Add `density` prop when a page
// genuinely needs tighter/looser rhythm.

type PageWidth = "default" | "narrow" | "wide";

const WIDTH_CLASS: Record<PageWidth, string> = {
  // default: full grid width, no extra cap (DashboardLayout max-w-7xl owns it)
  default: "",
  // narrow: single-column settings/forms (profile, new provider)
  narrow: "mx-auto w-full max-w-2xl",
  // wide: dense management tables (proxy pools)
  wide: "mx-auto w-full max-w-5xl",
};

export function Page({
  children,
  width = "default",
  className,
}: {
  children: ReactNode;
  width?: PageWidth;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-6", WIDTH_CLASS[width], className)}>
      {children}
    </div>
  );
}

// ── PAGE HEADER ──────────────────────────────────────────
// One title pattern: optional back link + h1 + description + actions.
// Typical h1 was `text-3xl font-semibold tracking-tight`; narrow pages
// used `text-xl sm:text-2xl`. Header owns the responsive scale so pages
// stop hand-rolling heading sizes.

export function PageHeader({
  title,
  description,
  actions,
  backHref,
  backLabel,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
  className?: string;
}) {
  const hasActions = actions !== undefined && actions !== null;
  return (
    <div className={cn(className)}>
      {backHref ? (
        <Button variant="outline" size="sm" asChild className="mb-4 self-start">
          <Link href={backHref}>
            <Icon name="arrow_back" className="text-lg" />
            {backLabel ?? "Back"}
          </Link>
        </Button>
      ) : null}
      <div
        className={cn(
          "flex flex-col gap-3",
          hasActions && "sm:flex-row sm:items-center sm:justify-between",
        )}
      >
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {hasActions ? (
          <div className="grid shrink-0 grid-cols-1 gap-2 sm:flex sm:items-center">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}

// ── SECTION ──────────────────────────────────────────────
// One section pattern: optional h2 title row + content. Replaces
// `flex flex-col gap-4` wrappers repeated per providers/combos page.

export function Section({
  title,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const hasHeader = title !== undefined || actions !== undefined;
  return (
    <section className={cn("flex min-w-0 flex-col gap-4", className)}>
      {hasHeader ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {title ? (
            <h2 className="text-lg font-semibold leading-tight sm:text-xl">{title}</h2>
          ) : (
            <span />
          )}
          {actions ? (
            <div className="grid grid-cols-1 gap-2 sm:flex sm:w-auto sm:items-center">
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

// ── CARD GRID ────────────────────────────────────────────
// One card grid. EntityCard pages repeated
// `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4`
// with one-off variants (`md:` instead of `lg:`, missing `xl:`).
// `stat` = OverviewCards / pxpipe KPI pattern (1→2→3→5/6 cols).

export function CardGrid({
  children,
  variant = "cards",
  className,
}: {
  children: ReactNode;
  variant?: "cards" | "stat";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid min-w-0 grid-cols-1 gap-3 sm:gap-4",
        variant === "cards" && "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
        variant === "stat" && "sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5",
        className,
      )}
    >
      {children}
    </div>
  );
}
