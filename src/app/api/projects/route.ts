import { NextResponse } from "next/server";
import {
  readProjectsIndex,
  updateProjectsIndex,
} from "@/lib/server-storage";
import type { ProjectMeta } from "@/lib/storage";

export async function GET() {
  const projects = await readProjectsIndex();
  return NextResponse.json({ projects });
}

export async function POST(req: Request) {
  const body = await req.json();
  const name: string = body.name ?? "Untitled";
  const id: string =
    body.id ?? Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const now = Date.now();

  const project = await updateProjectsIndex<ProjectMeta>((projects) => {
    const existing = projects.find((p) => p.id === id);
    if (existing) {
      // Repair: a state-sync may have auto-created this as "Untitled"
      // before the explicit create arrived with the real name.
      if (existing.name === "Untitled" && name !== "Untitled") {
        existing.name = name;
      }
      return existing;
    }
    const created: ProjectMeta = {
      id,
      name,
      createdAt: body.createdAt ?? now,
      modifiedAt: body.modifiedAt ?? now,
    };
    projects.push(created);
    return created;
  });

  return NextResponse.json({ project }, { status: 201 });
}
