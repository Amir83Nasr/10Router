import { NextResponse } from "next/server";
import { getCombos, createCombo, getComboByName, getModelAliases } from "@/lib/localDb";
import { findComboMemberProblems } from "@/lib/validateComboModels";

export const dynamic = "force-dynamic";

// Validate combo name: only a-z, A-Z, 0-9, -, _
const VALID_NAME_REGEX = /^[a-zA-Z0-9_.\-]+$/;

// GET /api/combos - Get all combos
export async function GET() {
  try {
    const combos = await getCombos();
    return NextResponse.json({ combos });
  } catch (error) {
    console.log("Error fetching combos:", error);
    return NextResponse.json({ error: "Failed to fetch combos" }, { status: 500 });
  }
}

// POST /api/combos - Create new combo
export async function POST(request) {
  try {
    const body = await request.json();
    const { name, models, kind } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Validate name format
    if (!VALID_NAME_REGEX.test(name)) {
      return NextResponse.json(
        { error: "Name can only contain letters, numbers, -, _ and ." },
        { status: 400 },
      );
    }

    // Check if name already exists
    const existing = await getComboByName(name);
    if (existing) {
      return NextResponse.json({ error: "Combo name already exists" }, { status: 400 });
    }

    // Validate members: bare words ("Support", "Last") die at request time
    // with "Invalid model format", so reject them at save time instead.
    const [aliases, combos] = await Promise.all([getModelAliases(), getCombos()]);
    if (models !== undefined && !Array.isArray(models)) {
      return NextResponse.json(
        { error: "Invalid combo models: models must be an array" },
        { status: 400 },
      );
    }
    const cleanedModels = Array.isArray(models)
      ? [...new Set(models.map((m) => (typeof m === "string" ? m.trim() : "")).filter(Boolean))]
      : [];
    const problems = findComboMemberProblems(cleanedModels, {
      aliases,
      comboNames: combos.map((c) => c.name),
      selfName: name,
    });
    if (problems.length > 0) {
      return NextResponse.json(
        { error: `Invalid combo models: ${problems.join("; ")}` },
        { status: 400 },
      );
    }

    const combo = await createCombo({ name, models: cleanedModels, kind: kind || null });

    return NextResponse.json(combo, { status: 201 });
  } catch (error) {
    console.log("Error creating combo:", error);
    return NextResponse.json({ error: "Failed to create combo" }, { status: 500 });
  }
}
