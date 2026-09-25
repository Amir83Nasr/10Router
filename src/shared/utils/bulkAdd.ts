// Bulk-add API-key planner.
//
// Background: the backend upserts apikey connections BY NAME
// (src/lib/db/repos/connectionsRepo.js ~L144: existing = all.find(c =>
// c.authType === "apikey" && c.name === data.name)). A colliding name
// overwrites an existing key instead of inserting a new one. Bulk-add used to
// derive "<base> <lineIndex>" from the paste position, blind to existing
// names, so re-adding keys often silently replaced earlier ones.
//
// This planner gap-fills the smallest free "<base> <n>" against both existing
// connection names and names already assigned earlier in the same batch, so a
// generated name is never reused and the backend always inserts.
//
// ponytail: only numeric-suffix collision is handled. A user who manually
// types an exact existing non-numbered custom name (no index) will still hit
// the backend upsert — but bulk auto-naming always appends " <n>", so this
// path is unreachable from the bulk modal. Upgrade path: a backend
// "skip-if-exists" flag on POST /api/providers if single-add ever needs it.

type ParsedLine = {
  baseName: string;
  apiKey: string;
  providerSpecificData?: Record<string, unknown>;
};

type BulkEntry = {
  name: string;
  apiKey: string;
  skipped: boolean;
  providerSpecificData?: Record<string, unknown>;
};

/**
 * Parse one pipe-separated bulk line into { baseName, apiKey, providerSpecificData? }.
 */
function parseLine(line: string): ParsedLine | null {
  const parts = line.split("|");

  if (parts.length >= 2) {
    // name|apiKey  (apiKey may itself contain pipes)
    const baseName = parts[0].trim();
    const apiKey = parts.slice(1).join("|").trim();
    return { baseName: baseName || "Key", apiKey };
  }

  // apiKey only — auto-named "Key N"
  const apiKey = parts[0].trim();
  return { baseName: "Key", apiKey };
}

/**
 * Plan a bulk add: parse lines, assign collision-free "<base> <n>" names.
 *
 * @param lines raw paste lines
 * @param existingNames connection names already saved
 */
export function planBulkAdd(lines: string[], existingNames?: string[] | null): BulkEntry[] {
  const safeExisting = Array.isArray(existingNames) ? existingNames : [];
  const used = new Set(safeExisting.map((n) => (typeof n === "string" ? n.toLowerCase() : "")));

  const out: BulkEntry[] = [];
  for (const raw of lines) {
    const line = typeof raw === "string" ? raw.trim() : "";
    if (!line) continue;

    const parsed = parseLine(line);
    if (!parsed || !parsed.apiKey) continue;

    const base = parsed.baseName;

    // Gap-fill from 1: smallest free "<base> <n>" not in `used`.
    // O(batch * existing) — fine for bulk add (tens to low hundreds of keys).
    let idx = 1;
    let name: string;
    for (;;) {
      name = `${base} ${idx}`;
      if (!used.has(name.toLowerCase())) break;
      idx += 1;
    }
    used.add(name.toLowerCase());

    const entry: BulkEntry = { name, apiKey: parsed.apiKey, skipped: false };
    if (parsed.providerSpecificData) entry.providerSpecificData = parsed.providerSpecificData;
    out.push(entry);
  }
  return out;
}
