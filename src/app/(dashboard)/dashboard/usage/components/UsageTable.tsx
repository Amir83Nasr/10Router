"use client";
import Icon from "@/shared/components/Icon";

import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import { Card, CardContent } from "@/components/ui/card";

const fmt = (n: any) => new Intl.NumberFormat().format(n || 0);
const fmtCost = (n: any) => `$${(n || 0).toFixed(2)}`;

function fmtTime(iso: any) {
  if (!iso) return "Never";
  const diffMins = Math.floor(((Date.now() as any) - (new Date(iso) as any)) / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
  return new Date(iso).toLocaleDateString();
}

function SortIcon({ field, currentSort, currentOrder }: any) {
  if (currentSort !== field) return <span className="ml-1 opacity-20">↕</span>;
  return <span className="ml-1">{currentOrder === "asc" ? "↑" : "↓"}</span>;
}

/**
 * Render 3 token or cost cells based on viewMode
 */
function ValueCells({ item, viewMode, isSummary = false }: any) {
  if (viewMode === "tokens") {
    return (
      <>
        <td className="px-4 py-2.5 text-right tabular-nums">
          <span className="inline-flex min-w-16 items-center justify-center rounded-md bg-primary/10 px-1.5 py-1 text-center text-[11px] font-medium text-primary">
            {isSummary && item.promptTokens === undefined ? "—" : fmt(item.promptTokens)}
          </span>
        </td>
        <td className="px-4 py-2.5 text-right tabular-nums">
          <span className="inline-flex min-w-16 items-center justify-center rounded-md bg-muted px-1.5 py-1 text-center text-[11px] font-medium text-muted-foreground">
            {item.cachedTokens ? fmt(item.cachedTokens) : "—"}
          </span>
        </td>
        <td className="px-4 py-2.5 text-right tabular-nums">
          <span className="inline-flex min-w-16 items-center justify-center rounded-md bg-emerald-500/10 px-1.5 py-1 text-center text-[11px] font-medium text-emerald-600">
            {isSummary && item.completionTokens === undefined ? "—" : fmt(item.completionTokens)}
          </span>
        </td>
        <td className="px-4 py-2.5 text-right font-medium tabular-nums text-xs">
          {fmt(item.totalTokens)}
        </td>
      </>
    );
  }
  return (
    <>
      <td className="px-4 py-2.5 text-right tabular-nums">
        <span className="inline-flex min-w-16 items-center justify-center rounded-md bg-primary/10 px-1.5 py-1 text-center text-[11px] font-medium text-primary">
          {isSummary && item.inputCost === undefined ? "—" : fmtCost(item.inputCost)}
        </span>
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums">
        <span className="inline-flex min-w-16 items-center justify-center rounded-md bg-muted px-1.5 py-1 text-center text-[11px] font-medium text-muted-foreground">
          {item.cachedCost ? fmtCost(item.cachedCost) : "—"}
        </span>
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums">
        <span className="inline-flex min-w-16 items-center justify-center rounded-md bg-emerald-500/10 px-1.5 py-1 text-center text-[11px] font-medium text-emerald-600">
          {isSummary && item.outputCost === undefined ? "—" : fmtCost(item.outputCost)}
        </span>
      </td>
      <td className="px-4 py-2.5 text-right">
        <span className="inline-flex min-w-16 items-center justify-center rounded-md bg-amber-500/10 px-1.5 py-1 text-center text-[11px] font-medium text-amber-600">
          {fmtCost(item.totalCost || item.cost)}
        </span>
      </td>
    </>
  );
}

/**
 * Reusable sortable usage table with expandable group rows.
 *
 * @param {object} props
 * @param {string} props.title - Table title
 * @param {Array} props.columns - Column definitions [{field, label}]
 * @param {Array} props.groupedData - Grouped data from groupDataByKey
 * @param {string} props.tableType - Table type key for sort URL params
 * @param {string} props.sortBy - Current sort field
 * @param {string} props.sortOrder - Current sort order
 * @param {function} props.onToggleSort - Sort toggle handler
 * @param {string} props.viewMode - "tokens" or "costs"
 * @param {string} props.storageKey - localStorage key for expanded state
 * @param {function} props.renderGroupLabel - Render group summary first cell content
 * @param {function} props.renderDetailCells - Render detail row custom cells (before value cells)
 * @param {function} props.renderSummaryCells - Render summary row cells after group label (placeholder cols)
 * @param {string} props.emptyMessage - Empty state message
 */
export default function UsageTable({
  title,
  columns,
  groupedData,
  tableType,
  sortBy,
  sortOrder,
  onToggleSort,
  viewMode,
  storageKey,
  renderDetailCells,
  renderSummaryCells,
  emptyMessage,
}: any) {
  const [expanded, setExpanded] = useState(new Set());

  // Load expanded state from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setExpanded(new Set(JSON.parse(saved)));
    } catch (e) {
      console.error(`Failed to load ${storageKey}:`, e);
    }
  }, [storageKey]);

  // Save expanded state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify([...expanded]));
    } catch (e) {
      console.error(`Failed to save ${storageKey}:`, e);
    }
  }, [expanded, storageKey]);

  const toggleGroup = useCallback((groupKey) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(groupKey) ? next.delete(groupKey) : next.add(groupKey);
      return next;
    });
  }, []);

  const valueColumns = useMemo(() => {
    if (viewMode === "tokens") {
      return [
        { field: "promptTokens", label: "Input Tokens" },
        { field: "cachedTokens", label: "Cached" },
        { field: "completionTokens", label: "Output Tokens" },
        { field: "totalTokens", label: "Total Tokens" },
      ];
    }
    return [
      { field: "promptTokens", label: "Input Cost" },
      { field: "cachedCost", label: "Cached Cost" },
      { field: "completionTokens", label: "Output Cost" },
      { field: "cost", label: "Total Cost" },
    ];
  }, [viewMode]);

  const totalColSpan = columns.length + valueColumns.length;

  return (
    <Card className="flex min-w-0 flex-col overflow-hidden" style={{ paddingBlock: 0, gap: 0 }}>
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card/80 px-4 py-3 backdrop-blur">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">{groupedData.length} groups</span>
      </div>
      <CardContent className="flex min-h-0 flex-1 flex-col p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="border-b border-border/60 text-muted-foreground">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.field}
                    className={`px-4 py-2 text-[11px] font-semibold uppercase tracking-wide cursor-pointer hover:bg-accent/60 ${col.align === "right" ? "text-right" : ""}`}
                    onClick={() => onToggleSort(tableType, col.field)}
                  >
                    {col.label}{" "}
                    <SortIcon field={col.field} currentSort={sortBy} currentOrder={sortOrder} />
                  </th>
                ))}
                {valueColumns.map((col) => (
                  <th
                    key={col.field}
                    className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wide cursor-pointer hover:bg-accent/60"
                    onClick={() => onToggleSort(tableType, col.field)}
                  >
                    {col.label}{" "}
                    <SortIcon field={col.field} currentSort={sortBy} currentOrder={sortOrder} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {groupedData.map((group) => (
                <Fragment key={group.groupKey}>
                  {/* Group summary row */}
                  <tr
                    className="group-summary cursor-pointer transition-colors last:border-b-0 hover:bg-accent/60"
                    onClick={() => toggleGroup(group.groupKey)}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Icon
                          name="chevron_right"
                          className={`text-[18px] text-muted-foreground transition-transform ${expanded.has(group.groupKey) ? "rotate-90" : ""}`}
                        />
                        <span
                          className={`truncate font-mono text-xs font-medium transition-colors ${group.summary.pending > 0 ? "text-primary" : ""}`}
                        >
                          {group.groupKey}
                        </span>
                      </div>
                    </td>
                    {renderSummaryCells(group)}
                    <ValueCells item={group.summary} viewMode={viewMode} isSummary />
                  </tr>
                  {/* Detail rows */}
                  {expanded.has(group.groupKey) &&
                    group.items.map((item) => (
                      <tr
                        key={`detail-${item.key}`}
                        className="group-detail bg-muted/20 transition-colors last:border-b-0 hover:bg-accent/60"
                      >
                        {renderDetailCells(item)}
                        <ValueCells item={item} viewMode={viewMode} />
                      </tr>
                    ))}
                </Fragment>
              ))}
              {groupedData.length === 0 && (
                <tr>
                  <td colSpan={totalColSpan} className="px-4 py-2.5">
                    <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
                      <Icon name="history" className="text-2xl opacity-50" />
                      <p className="text-xs">{emptyMessage}</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// Re-export utilities for use in UsageStats orchestrator
export { fmt, fmtCost, fmtTime };
