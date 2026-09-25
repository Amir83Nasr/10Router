"use client";
import Icon from "@/shared/components/Icon";

import { useState, useEffect } from "react";
import { LOCALES, LOCALE_COOKIE, normalizeLocale } from "@/i18n/config";
import { reloadTranslations } from "@/i18n/runtime";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function getLocaleFromCookie() {
  if (typeof document === "undefined") return "en";
  const cookie = document.cookie.split(";").find((c) => c.trim().startsWith(`${LOCALE_COOKIE}=`));
  const value = cookie ? decodeURIComponent(cookie.split("=")[1]) : "en";
  return normalizeLocale(value);
}

// Locale display names and flags - will be translated by runtime i18n
const getLocaleInfo = (locale) => {
  const locales = {
    en: { name: "English", flag: "🇺🇸" },
    fa: { name: "فارسی", flag: "🇮🇷" },
  };
  return locales[locale] || { name: locale, flag: "🌐" };
};

interface LanguageSwitcherProps {
  className?: string;
  isOpen?: boolean;
  onClose?: any;
  hideTrigger?: boolean;
}

export default function LanguageSwitcher({
  className = "",
  isOpen: controlledOpen,
  onClose,
  hideTrigger = false,
}: LanguageSwitcherProps) {
  const [locale, setLocale] = useState("en");
  const [isPending, setIsPending] = useState(false);
  const [internalOpen, setInternalOpen] = useState(false);

  const isControlled = typeof controlledOpen === "boolean";
  const isOpen = isControlled ? controlledOpen : internalOpen;
  const setIsOpen = (value, nextLocale = locale) => {
    if (isControlled) {
      if (!value && onClose) onClose(nextLocale);
    } else {
      setInternalOpen(value);
    }
  };

  useEffect(() => {
    setLocale(getLocaleFromCookie());
  }, []);

  const handleSetLocale = async (nextLocale) => {
    if (nextLocale === locale || isPending) return;

    setIsPending(true);
    try {
      await fetch("/api/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: nextLocale }),
      });

      // Reload translations without full page reload
      await reloadTranslations();
      setLocale(nextLocale);
      setIsOpen(false, nextLocale);
    } catch (err) {
      console.error("Failed to set locale:", err);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className={className}>
      {/* Trigger button */}
      {!hideTrigger && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setIsOpen(!isOpen)}
              disabled={isPending}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card/60 transition-colors"
              data-i18n-skip="true"
            >
              <Icon name="language" className="text-[20px]" />
              <span className="text-sm font-medium">{getLocaleInfo(locale).name}</span>
              <span className="text-lg">{getLocaleInfo(locale).flag}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent>Language</TooltipContent>
        </Tooltip>
      )}

      <Dialog open={isOpen} onOpenChange={(open) => !open && setIsOpen(false)}>
        <DialogContent className="sm:max-w-2xl" data-i18n-skip="true">
          <DialogHeader>
            <DialogTitle>Select Language</DialogTitle>
          </DialogHeader>

          {/* Modal body - fixed grid columns, equal sizing */}
          <div className="p-6 overflow-y-auto">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-2">
              {LOCALES.map((item) => {
                const active = locale === item;
                const info = getLocaleInfo(item);
                return (
                  <button
                    key={item}
                    onClick={() => handleSetLocale(item)}
                    disabled={isPending}
                    className={`flex flex-col items-center justify-start gap-1 px-2 py-3 rounded-lg text-xs font-medium transition-colors w-full ${
                      active
                        ? "bg-primary/15 text-primary ring-2 ring-primary"
                        : "text-foreground hover:bg-black/5 dark:hover:bg-white/5"
                    } ${isPending ? "opacity-70 cursor-wait" : ""}`}
                    title={info.name}
                  >
                    <span className="text-2xl">{info.flag}</span>
                    {/* Fixed 2-line height so all cards are uniform */}
                    <span className="text-center leading-tight line-clamp-2 h-8 flex items-center">
                      {info.name}
                    </span>
                    {active && <Icon name="check" className="text-sm" />}
                  </button>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
