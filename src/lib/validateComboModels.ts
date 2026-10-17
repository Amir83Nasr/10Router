// Combo member validation (server-side, POST/PUT /api/combos).
//
// A member is valid when it is `provider/model` (provider resolved later at
// request time), a model alias, or another combo (nested). Anything else —
// bare words like "Support"/"Last" from a bad paste — dies at request time
// with "Invalid model format" and burns the whole combo run, so reject it at
// save time with a message naming the bad entries.

export interface ComboMemberContext {
  aliases?: Record<string, unknown>;
  comboNames?: string[];
  selfName?: string | null;
}

export function findComboMemberProblems(
  members: unknown,
  { aliases = {}, comboNames = [], selfName = null }: ComboMemberContext = {},
): string[] {
  if (!Array.isArray(members)) return ["models must be an array"];
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const raw of members) {
    const m = typeof raw === "string" ? raw.trim() : "";
    if (!m) {
      problems.push("empty model entry");
      continue;
    }
    if (seen.has(m)) {
      problems.push(`duplicate model "${m}"`);
      continue;
    }
    seen.add(m);
    if (m.includes("/")) {
      const slash = m.indexOf("/");
      if (slash === 0 || slash === m.length - 1)
        problems.push(`bad model shape "${m}" (want provider/model)`);
      continue;
    }
    if (selfName && m === selfName) {
      problems.push(`combo "${m}" cannot include itself`);
      continue;
    }
    if (aliases && aliases[m]) continue;
    if (comboNames.includes(m)) continue;
    problems.push(`unknown model "${m}" (want provider/model, an alias, or a combo)`);
  }
  return problems;
}
