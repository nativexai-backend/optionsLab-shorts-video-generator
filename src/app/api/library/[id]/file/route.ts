import { NextRequest, NextResponse } from "next/server";
import { loadLibraryFile } from "@/lib/library-storage";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

// GET /api/library/[id]/file → the image bytes
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await loadLibraryFile(id);
  if (!result) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(result.buffer), {
    headers: {
      "Content-Type": MIME[result.ext.toLowerCase()] ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable", // content-hash id = immutable
    },
  });
}
