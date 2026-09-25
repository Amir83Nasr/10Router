import Icon from "@/shared/components/Icon";
import { CapacityBadges } from "@/shared/components";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export default function ModelRow({
  model,
  fullModel,
  alias,
  copied,
  onCopy,
  testStatus,
  isCustom,
  isFree,
  onDeleteAlias,
  onTest,
  isTesting,
  onDisable,
  caps,
}: any) {
  const displayModel = fullModel;
  const borderColor =
    testStatus === "ok"
      ? "border-green-500/40"
      : testStatus === "error"
        ? "border-red-500/40"
        : "border-border";

  const iconColor =
    testStatus === "ok" ? "#22c55e" : testStatus === "error" ? "#ef4444" : undefined;

  return (
    <div
      className={`group min-w-0 max-w-full rounded-lg border px-3 py-2 ${borderColor} hover:bg-sidebar/50`}
    >
      <div className="flex min-w-0 items-start gap-2 sm:items-center">
        <Icon
          name={
            testStatus === "ok" ? "check_circle" : testStatus === "error" ? "cancel" : "smart_toy"
          }
          className="shrink-0 text-base"
          style={iconColor ? { color: iconColor } : undefined}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <code className="max-w-[72vw] truncate rounded bg-sidebar px-1.5 py-0.5 font-mono text-xs text-muted-foreground sm:max-w-[360px]">
            {displayModel}
          </code>
          <span className="flex min-w-0 items-center text-[9px] gap-1 pl-1">
            {model.name && (
              <span className="truncate text-[9px] italic text-muted-foreground/70">
                {model.name}
              </span>
            )}
            <CapacityBadges caps={caps} colorOverride="text-muted-foreground/70" size={12} />
          </span>
        </div>
        {onTest && (
          <div className="relative shrink-0 group/btn">
            <button
              onClick={onTest}
              disabled={isTesting}
              className={`rounded p-0.5 text-muted-foreground transition-opacity hover:bg-sidebar hover:text-primary ${isTesting ? "opacity-100" : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100"}`}
            >
              <Icon
                name={isTesting ? "progress_activity" : "science"}
                className="text-sm"
                style={isTesting ? { animation: "spin 1s linear infinite" } : undefined}
              />
            </button>
            <span className="pointer-events-none absolute mt-1 top-5 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity">
              {isTesting ? "Testing..." : "Test"}
            </span>
          </div>
        )}
        <div className="relative shrink-0 group/btn">
          <button
            onClick={() => onCopy(displayModel, `model-${model.id}`)}
            className="rounded p-0.5 text-muted-foreground hover:bg-sidebar hover:text-primary"
          >
            <Icon
              name={copied === `model-${model.id}` ? "check" : "content_copy"}
              className="text-sm"
            />
          </button>
          <span className="pointer-events-none absolute mt-1 top-5 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity">
            {copied === `model-${model.id}` ? "Copied!" : "Copy"}
          </span>
        </div>
        {isCustom ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onDeleteAlias}
                className="ml-auto rounded p-0.5 text-muted-foreground opacity-100 transition-opacity hover:bg-red-500/10 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100"
              >
                <Icon name="close" className="text-sm" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Remove custom model</TooltipContent>
          </Tooltip>
        ) : onDisable ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onDisable}
                className="ml-auto rounded p-0.5 text-muted-foreground opacity-100 transition-opacity hover:bg-red-500/10 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100"
              >
                <Icon name="close" className="text-sm" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Disable this model</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
    </div>
  );
}
