export const LOCALES: string[] = ["en", "fa"];
export const DEFAULT_LOCALE: string = "en";
export const LOCALE_COOKIE: string = "locale";

export const LOCALE_NAMES: Record<string, string> = {
  en: "English",
  fa: "فارسی",
};

export function normalizeLocale(locale?: string): string {
  if (locale === "fa") {
    return "fa";
  }
  return DEFAULT_LOCALE;
}

export function isSupportedLocale(locale: string): boolean {
  return LOCALES.includes(locale);
}
