import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export async function GET() {
  let markdown = "";
  try {
    markdown = await fs.promises.readFile(path.join(process.cwd(), "CHANGELOG.md"), "utf8");
  } catch {
    return NextResponse.json(
      { error: "changelog unavailable" },
      { status: 500, headers: CORS_HEADERS },
    );
  }
  return new NextResponse(markdown, {
    headers: { ...CORS_HEADERS, "Content-Type": "text/markdown; charset=utf-8" },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
