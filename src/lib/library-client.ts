import type { LibraryImage } from "./library-types";

// Client-side wrappers around the library API.

export async function addImageToLibrary(
  file: File,
  meta: { description?: string; category?: string; projectId?: string | null }
): Promise<void> {
  // Skip placeholder/empty files
  if (!file || file.size === 0) return;
  try {
    const form = new FormData();
    form.append("file", file);
    form.append("filename", file.name);
    if (meta.description) form.append("description", meta.description);
    if (meta.category) form.append("category", meta.category);
    if (meta.projectId) form.append("projectId", meta.projectId);
    await fetch("/api/library", { method: "POST", body: form });
  } catch {
    // non-fatal — capture is best-effort
  }
}

export async function searchLibrary(query: {
  text?: string;
  category?: string;
}): Promise<LibraryImage[]> {
  try {
    const params = new URLSearchParams();
    if (query.text) params.set("q", query.text);
    if (query.category) params.set("category", query.category);
    const res = await fetch(`/api/library?${params.toString()}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.images ?? [];
  } catch {
    return [];
  }
}

export async function updateLibraryImage(
  id: string,
  patch: { tags?: string[]; description?: string; category?: string }
): Promise<LibraryImage | null> {
  try {
    const res = await fetch(`/api/library/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return null;
    return (await res.json()).image;
  } catch {
    return null;
  }
}

export async function deleteLibraryImage(id: string): Promise<void> {
  try {
    await fetch(`/api/library/${id}`, { method: "DELETE" });
  } catch {
    // non-fatal
  }
}

export function libraryFileUrl(id: string): string {
  return `/api/library/${id}/file`;
}

/** Fetch a library image as a File, to load it into a timeline slot. */
export async function fetchLibraryImageAsFile(image: LibraryImage): Promise<File | null> {
  try {
    const res = await fetch(libraryFileUrl(image.id));
    if (!res.ok) return null;
    const blob = await res.blob();
    return new File([blob], image.filename, { type: blob.type });
  } catch {
    return null;
  }
}
