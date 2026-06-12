import { NextResponse } from "next/server";
import {
  readProjectsIndex,
  updateProjectsIndex,
  readProjectState,
  writeProjectState,
  deleteServerProjectDir,
} from "@/lib/server-storage";
import type { ProjectMeta } from "@/lib/storage";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const projects = await readProjectsIndex();
  const project = projects.find((p) => p.id === id);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const state = await readProjectState(id);
  return NextResponse.json({ project, state });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  const project = await updateProjectsIndex<ProjectMeta>((projects) => {
    const existing = projects.find((p) => p.id === id);
    if (existing) {
      if (body.name !== undefined) existing.name = body.name;
      existing.modifiedAt = Date.now();
      return existing;
    }
    // Auto-create if missing (client may push before explicit create)
    const now = Date.now();
    const created: ProjectMeta = {
      id,
      name: body.name ?? "Untitled",
      createdAt: now,
      modifiedAt: now,
    };
    projects.push(created);
    return created;
  });

  if (body.state) {
    await writeProjectState(id, body.state);
  }

  return NextResponse.json({ project });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await updateProjectsIndex((projects) => {
    const idx = projects.findIndex((p) => p.id === id);
    if (idx !== -1) projects.splice(idx, 1);
  });
  await deleteServerProjectDir(id);
  return NextResponse.json({ ok: true });
}
