import { NextRequest, NextResponse } from "next/server";
import { patchLibraryImage, deleteLibraryImage } from "@/lib/library-storage";

// PATCH /api/library/[id]  → edit tags / description / category
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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
  await deleteLibraryImage(id);
  return NextResponse.json({ ok: true });
}
