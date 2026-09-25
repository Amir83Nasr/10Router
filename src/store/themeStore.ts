"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { THEME_CONFIG } from "@/shared/constants/config";

type ThemeState = {
  theme: "light";
  setTheme: () => void;
  toggleTheme: () => void;
  initTheme: () => void;
};

const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      // Theme pinned to light — selector UI removed.
      theme: "light",

      setTheme: () => {
        set({ theme: "light" });
        applyTheme();
      },

      toggleTheme: () => {
        set({ theme: "light" });
        applyTheme();
      },

      initTheme: () => {
        set({ theme: "light" });
        applyTheme();
      },
    }),
    {
      name: THEME_CONFIG.storageKey,
    },
  ),
);

// Apply theme to document — always light (clears stale dark class).
function applyTheme(): void {
  if (typeof window === "undefined") return;

  document.documentElement.classList.remove("dark");
}

export default useThemeStore;
