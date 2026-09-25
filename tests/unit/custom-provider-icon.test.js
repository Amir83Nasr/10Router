import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getInitials,
  guessProviderIconIdFromUrl,
  KNOWN_PROVIDER_ICON_IDS,
} from "../../src/shared/utils/providerIcon.ts";

describe("guessProviderIconIdFromUrl", () => {
  it("guesses known upstream brands from the baseUrl host", () => {
    expect(guessProviderIconIdFromUrl("https://api.deepseek.com/v1")).toBe("deepseek");
    expect(guessProviderIconIdFromUrl("https://openrouter.ai/api/v1")).toBe("openrouter");
    expect(guessProviderIconIdFromUrl("https://generativelanguage.googleapis.com/v1beta")).toBe(
      "gemini",
    );
  });

  it("resolves the first non-generic subdomain token", () => {
    expect(guessProviderIconIdFromUrl("https://llm.deepseek.com/v1")).toBe("deepseek");
  });

  it("returns empty for local, IP, or invalid URLs", () => {
    expect(guessProviderIconIdFromUrl("http://localhost:11434/v1")).toBe("");
    expect(guessProviderIconIdFromUrl("http://127.0.0.1:11434/v1")).toBe("");
    expect(guessProviderIconIdFromUrl("http://192.168.1.10:11434/v1")).toBe("");
    expect(guessProviderIconIdFromUrl("not a url")).toBe("");
    expect(guessProviderIconIdFromUrl(undefined)).toBe("");
  });

  it("returns empty for unknown brands so callers skip the doomed 404", () => {
    // Regression: an unlisted guess 404d on every full refresh (initials
    // flash), while client-side navigation later showed the family logo
    // from the session 404-cache — "logos vanish on refresh".
    expect(guessProviderIconIdFromUrl("https://llm.mycompany.internal/v1")).toBe("");
    expect(guessProviderIconIdFromUrl("https://proxy.example.com:8080/v1")).toBe("");
  });

  it("stays in sync with public/providers/*.png", () => {
    const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../../public/providers");
    const onDisk = new Set(
      readdirSync(dir)
        .filter((f) => f.endsWith(".png"))
        .map((f) => f.slice(0, -4).toLowerCase()),
    );
    expect([...KNOWN_PROVIDER_ICON_IDS].sort()).toEqual([...onDisk].sort());
  });
});

describe("getInitials", () => {
  it("derives initials for the letter-avatar fallback", () => {
    expect(getInitials("My Proxy")).toBe("MP");
    expect(getInitials("  Acme   Cloud  ")).toBe("AC");
    expect(getInitials("Ollama")).toBe("OL");
    expect(getInitials("")).toBe("");
  });
});
