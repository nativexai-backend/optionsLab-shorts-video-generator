import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg"]);

export async function GET() {
  const avatarsDir = path.resolve(process.cwd(), "public/avatars");

  if (!fs.existsSync(avatarsDir)) {
    return NextResponse.json({ avatars: [] });
  }

  const files = fs.readdirSync(avatarsDir);
  const avatars = files
    .filter((f) => IMAGE_EXTENSIONS.has(path.extname(f).toLowerCase()))
    .sort((a, b) => a.localeCompare(b))
    .map((f) => `/avatars/${f}`);

  return NextResponse.json({ avatars });
}
