import { NextResponse } from "next/server";
import path from "path";
import { loadServerFile, saveServerFile, deleteServerFile } from "@/lib/server-storage";

const MIME_MAP: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

function mimeFromFilename(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return MIME_MAP[ext] || "application/octet-stream";
}

type Params = { params: Promise<{ id: string; key: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id, key } = await params;
  const result = await loadServerFile(id, key);
  if (!result) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const contentType = mimeFromFilename(result.filename);

  return new NextResponse(new Uint8Array(result.buffer), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${result.filename}"`,
    },
  });
}

export async function PUT(req: Request, { params }: Params) {
  const { id, key } = await params;
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  await saveServerFile(id, key, buffer, file.name);

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id, key } = await params;
  await deleteServerFile(id, key);
  return NextResponse.json({ ok: true });
}
