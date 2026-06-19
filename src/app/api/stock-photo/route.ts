import { NextRequest, NextResponse } from "next/server";
import { saveLibraryImage } from "@/lib/library-storage";

// Stock-photo search for shot-list scenes. Pexels is the primary source (free,
// bright editorial photography that fits the house style); SerpApi (Google
// Images) is the backup when Pexels has thin or no coverage for a query.
//
// Both keys stay server-side. Results are normalized to one shape so the UI
// doesn't care which provider answered.

export interface StockPhoto {
  id: string;
  url: string; // full-size image to import/use
  thumb: string; // smaller preview for the grid
  width?: number;
  height?: number;
  alt: string;
  source: "pexels" | "serpapi";
  credit?: string; // photographer / source site
}

const PER_PAGE = 12;

async function searchPexels(query: string): Promise<StockPhoto[]> {
  const key = process.env.PEXEL_API_KEY;
  if (!key) return [];
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${PER_PAGE}&orientation=portrait`;
  const res = await fetch(url, { headers: { Authorization: key } });
  if (!res.ok) throw new Error(`Pexels ${res.status}`);
  const data = await res.json();
  const photos = Array.isArray(data.photos) ? data.photos : [];
  return photos.map((p: {
    id: number;
    src: { large2x?: string; large?: string; portrait?: string; medium?: string; tiny?: string };
    width: number;
    height: number;
    alt?: string;
    photographer?: string;
  }): StockPhoto => ({
    id: `pexels-${p.id}`,
    url: p.src.large2x || p.src.large || p.src.portrait || p.src.medium || "",
    thumb: p.src.medium || p.src.tiny || p.src.portrait || "",
    width: p.width,
    height: p.height,
    alt: p.alt || query,
    source: "pexels",
    credit: p.photographer ? `Pexels · ${p.photographer}` : "Pexels",
  })).filter((p: StockPhoto) => p.url);
}

async function searchSerpApi(query: string): Promise<StockPhoto[]> {
  const key = process.env.SERPAPI_API_KEY;
  if (!key) return [];
  // Bias toward tall, editorial results to suit the 9:16 frame.
  const url = `https://serpapi.com/search.json?engine=google_images&q=${encodeURIComponent(query)}&imgar=t&api_key=${key}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`SerpApi ${res.status}`);
  const data = await res.json();
  const results = Array.isArray(data.images_results) ? data.images_results : [];
  return results.slice(0, PER_PAGE).map((r: {
    position?: number;
    original?: string;
    thumbnail?: string;
    original_width?: number;
    original_height?: number;
    title?: string;
    source?: string;
  }): StockPhoto => ({
    id: `serp-${r.position ?? r.original ?? Math.abs(hashString(r.thumbnail || ""))}`,
    url: r.original || r.thumbnail || "",
    thumb: r.thumbnail || r.original || "",
    width: r.original_width,
    height: r.original_height,
    alt: r.title || query,
    source: "serpapi",
    credit: r.source ? `${r.source}` : "Google Images",
  })).filter((p: StockPhoto) => p.url);
}

// Stable small hash for ids when SerpApi omits a position.
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

export async function GET(req: NextRequest) {
  const query = (req.nextUrl.searchParams.get("q") || "").trim();
  if (!query) return NextResponse.json({ error: "q is required" }, { status: 400 });
  // Google/SerpApi works best with a concise entity query, while Pexels wants the
  // richer visual description — so the client can pass a separate `gq` for Google.
  const googleQuery = (req.nextUrl.searchParams.get("gq") || query).trim();
  // "auto" (default) tries Pexels then SerpApi; an explicit source forces one.
  const want = req.nextUrl.searchParams.get("source") || "auto";

  const errors: string[] = [];
  let photos: StockPhoto[] = [];
  let usedSource: StockPhoto["source"] | "none" = "none";

  if (want === "pexels" || want === "auto") {
    try {
      photos = await searchPexels(query);
      if (photos.length) usedSource = "pexels";
    } catch (e) {
      errors.push(`pexels: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Fall back to SerpApi when Pexels is thin/empty (or was the explicit choice).
  if ((want === "serpapi") || (want === "auto" && photos.length < 3)) {
    try {
      const serp = await searchSerpApi(googleQuery);
      if (want === "auto") {
        // Append SerpApi results the Pexels pass didn't already cover.
        photos = [...photos, ...serp].slice(0, PER_PAGE);
        if (!usedSource || usedSource === "none") usedSource = serp.length ? "serpapi" : usedSource;
      } else {
        photos = serp;
        usedSource = serp.length ? "serpapi" : "none";
      }
    } catch (e) {
      errors.push(`serpapi: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (!photos.length) {
    return NextResponse.json(
      { photos: [], source: "none", error: errors.join("; ") || "No results" },
      { status: errors.length ? 502 : 200 },
    );
  }
  return NextResponse.json({ photos, source: usedSource });
}

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

// POST /api/stock-photo → download a chosen stock photo and save it into the
// reusable library with scene-derived tags. Returns the LibraryImage record so
// the client can drop it straight onto a timeline slot.

// Detect the real image type from magic bytes, so octet-stream responses still
// work and HTML error pages (common with Google-Images originals) are rejected.
function sniffExt(buf: Buffer, contentType: string): string | null {
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) return ".jpg";
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return ".png";
  if (buf.length >= 3 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return ".gif";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return ".webp";
  return EXT_BY_TYPE[contentType] || null;
}

// Fetch a URL as image bytes with a browser UA + timeout. Returns null (not a
// throw) for anything that isn't a usable image, so the caller can fall back.
async function fetchImageBytes(url: string): Promise<{ buffer: Buffer; ext: string } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (type.startsWith("text/")) return null; // HTML error page, not an image
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 100) return null;
    const ext = sniffExt(buffer, type);
    return ext ? { buffer, ext } : null;
  } catch {
    return null; // network error, timeout, abort
  }
}

export async function POST(req: NextRequest) {
  let body: {
    url?: string;
    fallbackUrl?: string; // e.g. the Google thumbnail, used when the original is unfetchable
    alt?: string;
    tags?: string[];
    description?: string;
    category?: string;
    projectId?: string;
    credit?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.url || !/^https?:\/\//.test(body.url)) {
    return NextResponse.json({ error: "A valid image url is required" }, { status: 400 });
  }

  try {
    // Try the full-size original first; fall back to the thumbnail (Google's
    // gstatic CDN always serves it) so a pick never silently fails to save.
    let img = await fetchImageBytes(body.url);
    let usedFallback = false;
    if (!img && body.fallbackUrl && body.fallbackUrl !== body.url) {
      img = await fetchImageBytes(body.fallbackUrl);
      usedFallback = !!img;
    }
    if (!img) {
      return NextResponse.json({ error: "Couldn't download that image (source blocked the request)" }, { status: 502 });
    }

    // Build a descriptive filename so the library's filename→tags step has signal.
    const slug = (body.alt || body.description || "stock photo")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "stock-photo";

    const record = await saveLibraryImage(img.buffer, {
      filename: `${slug}${img.ext}`,
      tags: (body.tags ?? []).map((t) => t.toLowerCase()),
      description: body.description ?? body.alt ?? "",
      category: body.category ?? "b-roll",
      projectId: body.projectId,
    });
    return NextResponse.json({ image: record, usedFallback }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: `Import failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }
}
