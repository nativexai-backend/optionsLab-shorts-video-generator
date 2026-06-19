import { NextRequest, NextResponse } from "next/server";

// Proxies the ticker-logo service so the API key stays server-side. Returns the
// theme-appropriate SVG for a ticker, or 404 if unavailable.
const BASE = "https://image-proxy-86637462514.us-east1.run.app/svg";

export async function GET(req: NextRequest) {
  const apiKey = process.env.TICKER_LOGO_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "TICKER_LOGO_API_KEY not configured" }, { status: 404 });
  }

  const symbol = (req.nextUrl.searchParams.get("symbol") || "").trim().toUpperCase();
  const theme = req.nextUrl.searchParams.get("theme") === "light" ? "light" : "dark";
  if (!symbol || !/^[A-Z0-9.\-]{1,12}$/.test(symbol)) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  }

  const get = (t: string) =>
    fetch(`${BASE}/${encodeURIComponent(symbol)}/${t}.svg`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

  try {
    // Coverage is uneven (some tickers only have one theme) — try the requested
    // theme, then fall back to the other so a logo shows whenever one exists.
    let res = await get(theme);
    if (!res.ok) res = await get(theme === "dark" ? "light" : "dark");
    if (!res.ok) {
      return NextResponse.json({ error: "Logo not found" }, { status: 404 });
    }
    const svg = await res.text();
    return new NextResponse(svg, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "Logo fetch failed" }, { status: 502 });
  }
}
