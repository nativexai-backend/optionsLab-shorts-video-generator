import { NextRequest, NextResponse } from "next/server";
import { saveLibraryImage, searchLibrary } from "@/lib/library-storage";
import { extractTagsFromFilename } from "@/lib/library-types";

// GET /api/library?q=...&category=...  → ranked matches (or recent if no query)
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? undefined;
  const category = req.nextUrl.searchParams.get("category") ?? undefined;
  const images = await searchLibrary({ text: q, category });
  return NextResponse.json({ images });
}

// POST /api/library  (multipart) → add an image to the library
export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const file = form.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const filename = (form.get("filename") as string) || file.name || "image.png";
  const description = (form.get("description") as string) || "";
  const category = (form.get("category") as string) || "other";
  const projectId = (form.get("projectId") as string) || undefined;

  let providedTags: string[] = [];
  const rawTags = form.get("tags") as string | null;
  if (rawTags) {
    try {
      providedTags = JSON.parse(rawTags);
    } catch {
      providedTags = rawTags.split(",").map((t) => t.trim()).filter(Boolean);
    }
  }

  // Always seed with tags derived from the filename, merged with provided ones.
  const tags = Array.from(
    new Set([...extractTagsFromFilename(filename), ...providedTags.map((t) => t.toLowerCase())])
  );

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const record = await saveLibraryImage(buffer, { filename, tags, description, category, projectId });
    return NextResponse.json({ image: record }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to save image: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
