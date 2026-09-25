"use client";
import Icon from "@/shared/components/Icon";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Reusable endpoint row component */
export default function EndpointRow({ label, url, copyId, copied, onCopy, badge, actions }: any) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`shrink-0 rounded px-1.5 py-0.5 text-center font-mono text-xs min-w-[88px] ${
          badge === "CF" || badge === "TS"
            ? "bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {label}
      </span>
      <Input value={url} readOnly className="flex-1 font-mono text-sm" />
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="relative inline-flex">
            <Button variant="ghost" size="icon-sm" onClick={() => onCopy(url, copyId)}>
              <Icon name={copied === copyId ? "check" : "content_copy"} className="text-[18px]" />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">{copied === copyId ? "Copied!" : "Copy"}</TooltipContent>
      </Tooltip>
      {actions}
    </div>
  );
}
