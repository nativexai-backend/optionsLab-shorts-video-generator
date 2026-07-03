import { NextRequest, NextResponse } from "next/server";
import { patchLibraryImage, deleteLibraryImage } from "@/lib/library-storage";
import { isSafeSegment } from "@/lib/json-file";

// The id names a file on disk — reject anything path-like.
function badId() {
  return NextResponse.json({ error: "Invalid image id" }, { status: 400 });
}

// PATCH /api/library/[id]  → edit tags / description / category
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isSafeSegment(id)) return badId();
  let body: { tags?: string[]; description?: string; category?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const updated = await patchLibraryImage(id, body);
  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ image: updated });
}

// DELETE /api/library/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isSafeSegment(id)) return badId();
  await deleteLibraryImage(id);
  return NextResponse.json({ ok: true });
}
