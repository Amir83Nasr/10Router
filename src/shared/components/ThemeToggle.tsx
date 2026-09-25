"use client";

import { useTheme } from "@/shared/hooks/useTheme";
import { cn } from "@/shared/utils/cn";
import Icon from "@/shared/components/Icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ThemeToggleProps {
  className?: string;
  variant?: any;
}

export default function ThemeToggle({ className, variant = "default" }: ThemeToggleProps) {
  const { isDark, toggleTheme } = useTheme();

  const variants: any = {
    default: cn(
      "flex items-center justify-center size-10 rounded-full",
      "text-muted-foreground hover:text-foreground",
      "hover:bg-muted transition-colors",
    ),
    card: cn(
      "flex items-center justify-center size-11 rounded-full",
      "bg-card/60 hover:bg-card",
      "border border-border",
      "backdrop-blur-md shadow-sm hover:shadow-md",
      "text-muted-foreground hover:text-foreground",
      "transition-all group",
    ),
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={toggleTheme}
          className={cn(variants[variant], className)}
          aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
        >
          <Icon
            name={isDark ? "light_mode" : "dark_mode"}
            className={cn(
              "text-[22px]",
              variant === "card" && "transition-transform duration-300 group-hover:rotate-12",
            )}
          />
        </button>
      </TooltipTrigger>
      <TooltipContent>{`Switch to ${isDark ? "light" : "dark"} mode`}</TooltipContent>
    </Tooltip>
  );
}
