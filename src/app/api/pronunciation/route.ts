import { NextRequest, NextResponse } from "next/server";
import { readPronunciations, writePronunciations } from "@/lib/pronunciation-storage";
import type { PronunciationEntry } from "@/lib/pronunciation";

// GET /api/pronunciation → the global dictionary (seeded with defaults)
export async function GET() {
  const entries = await readPronunciations();
  return NextResponse.json({ entries });
}

// PUT /api/pronunciation → replace the whole dictionary
export async function PUT(req: NextRequest) {
  let body: { entries?: PronunciationEntry[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!Array.isArray(body.entries)) {
    return NextResponse.json({ error: "'entries' array required" }, { status: 400 });
  }
  await writePronunciations(body.entries);
  return NextResponse.json({ entries: await readPronunciations() });
}
