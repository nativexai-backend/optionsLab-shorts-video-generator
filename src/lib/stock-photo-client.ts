import type { LibraryImage } from "./library-types";

// Client-side wrappers around /api/stock-photo (Pexels + SerpApi).

export interface StockPhoto {
  id: string;
  url: string;
  thumb: string;
  width?: number;
  height?: number;
  alt: string;
  source: "pexels" | "serpapi";
  credit?: string;
}

export type StockSource = "auto" | "pexels" | "serpapi";

export async function searchStockPhotos(
  query: string,
  source: StockSource = "auto",
  googleQuery?: string,
): Promise<{ photos: StockPhoto[]; source: string }> {
  try {
    const params = new URLSearchParams({ q: query });
    if (source !== "auto") params.set("source", source);
    if (googleQuery && googleQuery !== query) params.set("gq", googleQuery);
    const res = await fetch(`/api/stock-photo?${params.toString()}`);
    const data = await res.json();
    return { photos: data.photos ?? [], source: data.source ?? "none" };
  } catch {
    return { photos: [], source: "none" };
  }
}

/** Download a chosen stock photo into the library; returns the saved record. */
export async function importStockPhoto(
  photo: StockPhoto,
  meta: { tags?: string[]; description?: string; category?: string; projectId?: string | null },
): Promise<LibraryImage | null> {
  try {
    const res = await fetch("/api/stock-photo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: photo.url,
        fallbackUrl: photo.thumb, // gstatic thumb saves even when the original is blocked
        alt: photo.alt,
        credit: photo.credit,
        tags: meta.tags,
        description: meta.description,
        category: meta.category,
        projectId: meta.projectId ?? undefined,
      }),
    });
    if (!res.ok) return null;
    return (await res.json()).image ?? null;
  } catch {
    return null;
  }
}
