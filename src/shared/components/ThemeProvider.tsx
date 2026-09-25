"use client";

import { useEffect } from "react";
import useThemeStore from "@/store/themeStore";
import { TooltipProvider } from "@/components/ui/tooltip";

export function ThemeProvider({ children }: any) {
  const { initTheme } = useThemeStore();

  useEffect(() => {
    initTheme();
  }, [initTheme]);

  return <TooltipProvider>{children}</TooltipProvider>;
}
