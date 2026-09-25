import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      message: "Self-update removed: pull a new 10router image or checkout instead.",
    },
    { status: 410 },
  );
}
