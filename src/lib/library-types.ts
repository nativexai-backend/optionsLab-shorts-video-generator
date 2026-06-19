// Client-safe types + pure matching logic for the Smart Image Library.
// No Node APIs here so the UI can import it; the server storage layer and the
// API routes reuse the same scoring.

export interface LibraryImage {
  id: string; // content hash — identical images dedupe to one record
  filename: string; // original filename as dropped
  ext: string; // ".jpg" etc
  tags: string[]; // from filename + manual edits
  description: string; // scene context the image was used for
  category: string; // person | logo | chart | product | b-roll | text-overlay | other
  visionLabels: string[]; // reserved for phase-2 vision tagging
  addedOn: number;
  usedInProjects: string[];
  width?: number;
  height?: number;
}

const STOPWORDS = new Set([
  "a", "an", "the", "of", "to", "in", "on", "at", "for", "and", "or", "with",
  "is", "are", "was", "were", "be", "this", "that", "it", "as", "by", "from",
  "show", "showing", "image", "photo", "shot", "scene", "background", "visual",
]);

/** Lowercase word tokens, stopwords and 1-char fragments removed. */
export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (t) => t.length >= 2 && !STOPWORDS.has(t)
  );
}

/** Derive tags from a filename, e.g. "donald-trump_handshake.jpg" → donald, trump, handshake. */
export function extractTagsFromFilename(filename: string): string[] {
  const base = filename.replace(/\.[^.]+$/, "");
  // split camelCase and letter/digit boundaries so "teslaLogo2024" → tesla logo 2024
  const spaced = base
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([a-zA-Z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-zA-Z])/g, "$1 $2");
  return Array.from(new Set(tokenize(spaced))).filter((t) => !/^\d+$/.test(t));
}

// Generic finance/market vocabulary that shows up in almost every script. These
// words are too common to identify a specific visual, so they're weak signals
// and never enough on their own to surface an image — otherwise an abstract line
// like "investors bracing for slower growth and cooler inflation" would pull in
// any finance photo (a bank logo, a trading floor) that happens to share a word.
const GENERIC_TERMS = new Set([
  "investor", "investors", "market", "markets", "growth", "inflation", "economy",
  "economic", "stock", "stocks", "share", "shares", "price", "prices", "rate",
  "rates", "yield", "yields", "trading", "trader", "traders", "finance", "financial",
  "money", "cash", "fund", "funds", "capital", "earnings", "revenue", "profit",
  "loss", "losses", "gain", "gains", "report", "quarter", "quarterly", "percent",
  "recession", "demand", "supply", "consumer", "consumers", "spending", "jobs",
  "labor", "sector", "index", "bond", "bonds", "bull", "bear", "investing",
  "investment", "investments", "signals", "slower", "cooler", "bracing",
]);

export interface LibraryQuery {
  text?: string; // scene description / prompt / free text
  category?: string;
}

/**
 * Score how well a library image matches a query. Entity/keyword overlap is the
 * primary signal; same-category is a strong boost (a logo scene wants logos).
 * Returns 0 when nothing matches so the caller can filter.
 */
export function scoreLibraryMatch(image: LibraryImage, query: LibraryQuery): number {
  const queryTokens = tokenize(query.text ?? "");
  if (queryTokens.length === 0 && !query.category) return 0;

  // Everything searchable about the image, weighted by source reliability.
  const tagSet = new Set(image.tags.map((t) => t.toLowerCase()));
  const descTokens = new Set(tokenize(image.description));
  const visionSet = new Set(image.visionLabels.map((t) => t.toLowerCase()));

  let score = 0;
  let distinctiveMatch = false; // matched at least one specific (non-generic) term
  for (const qt of queryTokens) {
    let pts = 0;
    if (tagSet.has(qt)) pts = 3; // explicit tags are the strongest signal
    else if (descTokens.has(qt)) pts = 2;
    else if (visionSet.has(qt)) pts = 1.5;
    if (pts === 0) continue;
    if (GENERIC_TERMS.has(qt)) {
      score += pts * 0.25; // generic finance words barely count
    } else {
      score += pts;
      distinctiveMatch = true; // a real entity/name/object overlap
    }
  }

  // A DISTINCTIVE match is REQUIRED: sharing only generic finance vocabulary
  // ("investors", "growth", "inflation") never surfaces an image — the match
  // must hinge on a specific name/entity/object. Category and usage only re-rank
  // among images that already share distinctive content with the shot.
  if (!distinctiveMatch) return 0;

  if (query.category && image.category === query.category) score += 2;
  score += Math.min(image.usedInProjects.length, 5) * 0.1;

  return score;
}

/** Rank a set of images against a query, dropping non-matches. */
export function rankLibrary(images: LibraryImage[], query: LibraryQuery): LibraryImage[] {
  return images
    .map((img) => ({ img, score: scoreLibraryMatch(img, query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.img);
}
