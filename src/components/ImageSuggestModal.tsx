"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { SceneSuggestion } from "../remotion/types";
import type { LibraryImage } from "../lib/library-types";
import { tokenize } from "../lib/library-types";
import { searchLibrary, libraryFileUrl } from "../lib/library-client";
import { searchStockPhotos, importStockPhoto, type StockPhoto, type StockSource } from "../lib/stock-photo-client";

interface Props {
  open: boolean;
  onClose: () => void;
  scene: SceneSuggestion;
  index: number;
  projectId: string | null;
  onPick: (image: LibraryImage) => void;
  showToast: (message: string, type: "error" | "success") => void;
}

const SOURCES: { value: StockSource; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "pexels", label: "Pexels" },
  { value: "serpapi", label: "Google" },
];

// Strip the boilerplate the prompt always ends with.
const cleanPrompt = (p?: string) =>
  (p || "").replace(/,?\s*(no text overlays|vertical 9:16 format)\.?/gi, "").trim();

// Generic descriptors that aren't the subject — removed to isolate the entity
// (company/person) for a concise Google query.
const GENERIC_DESC = /\b(portrait|headshot|photo|photograph|image|shot|scene|logo|facade|building|headquarters|hq|sign|signage|storefront|store|exterior|interior|office|tower|campus|aerial|view|closeup|close-up|editorial|daylight|modern|bright|professional)\b/gi;

// Derive the core subject + a concise default query from a scene. The prompt is
// written subject-first, so the first comma clause is the subject; for company
// (logo) scenes we steer toward the HQ building with signage.
function deriveSubject(scene: SceneSuggestion): { entity: string; query: string } {
  const firstSeg = cleanPrompt(scene.imagePrompt).split(",")[0].trim();
  const base = firstSeg || scene.description?.trim() || "";
  const entity = base.replace(GENERIC_DESC, "").replace(/\s{2,}/g, " ").trim() || base;
  let query = base;
  if (scene.category === "logo") query = `${entity} headquarters building logo sign`.trim();
  else if (scene.category === "person") query = entity;
  return { entity, query };
}

// Scene-aware image picker: stock photos (Pexels → SerpApi) and library matches
// surface at the top as suggestions; the rest of the library sits below. Picking
// a stock photo imports it into the library first, then applies it to the scene.
export const ImageSuggestModal: React.FC<Props> = ({ open, onClose, scene, index, projectId, onPick, showToast }) => {
  const [source, setSource] = useState<StockSource>("auto");
  const [stock, setStock] = useState<StockPhoto[]>([]);
  const [matches, setMatches] = useState<LibraryImage[]>([]);
  const [library, setLibrary] = useState<LibraryImage[]>([]);
  const [loadingStock, setLoadingStock] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);

  // Pexels searches well on the rich visual prompt; Google/SerpApi wants a
  // concise entity query (a company or person), so we derive both.
  const pexelsQuery = useMemo(
    () => cleanPrompt(scene.imagePrompt) || scene.description?.trim() || "",
    [scene.imagePrompt, scene.description],
  );
  const subject = useMemo(() => deriveSubject(scene), [scene.imagePrompt, scene.description, scene.category]);
  const tags = useMemo(
    () => Array.from(new Set([...tokenize(scene.description), ...tokenize(scene.scriptSegment)])).slice(0, 8),
    [scene.description, scene.scriptSegment],
  );

  // The visible, editable search box. Defaults to the concise entity query; once
  // the user edits it, that text drives both providers.
  const [q, setQ] = useState(subject.query);
  const [edited, setEdited] = useState(false);

  const runSearch = useCallback(async (src: StockSource, text: string, isEdited: boolean) => {
    const googleQuery = text.trim();
    if (!googleQuery) return;
    const pexelsText = isEdited ? googleQuery : pexelsQuery; // keep the rich prompt for Pexels until edited
    setLoadingStock(true);
    const { photos } = await searchStockPhotos(pexelsText, src, googleQuery);
    setStock(photos);
    setLoadingStock(false);
  }, [pexelsQuery]);

  // Load suggestions + library whenever the modal opens for a scene.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStock([]); setMatches([]); setLibrary([]); setSource("auto"); setShowLibrary(false);
    setQ(subject.query); setEdited(false);
    runSearch("auto", subject.query, false);
    const sceneQuery = [scene.description, scene.scriptSegment].filter(Boolean).join(" ");
    searchLibrary({ text: sceneQuery, category: scene.category }).then((r) => { if (!cancelled) setMatches(r.slice(0, 8)); });
    searchLibrary({}).then((r) => { if (!cancelled) setLibrary(r); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scene.id]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  const pickLibrary = useCallback((img: LibraryImage) => {
    onPick(img);
    showToast("Image added to scene", "success");
    onClose();
  }, [onPick, showToast, onClose]);

  const pickStock = useCallback(async (photo: StockPhoto) => {
    if (savingId) return;
    setSavingId(photo.id);
    const record = await importStockPhoto(photo, {
      tags, description: scene.description, category: scene.category, projectId,
    });
    setSavingId(null);
    if (!record) { showToast("Couldn't import that photo", "error"); return; }
    onPick(record);
    showToast("Photo saved to library & added", "success");
    onClose();
  }, [savingId, tags, scene.description, scene.category, projectId, onPick, showToast, onClose]);

  const onSource = useCallback((src: StockSource) => { setSource(src); runSearch(src, q, edited); }, [runSearch, q, edited]);
  const applyChip = useCallback((text: string) => { setQ(text); setEdited(true); runSearch(source, text, true); }, [runSearch, source]);

  if (!open) return null;

  // Library images not already shown as scene matches go in the lower grid.
  const matchIds = new Set(matches.map((m) => m.id));
  const rest = library.filter((im) => !matchIds.has(im.id));

  // Entity-shaped (company/person) → offer building/logo/portrait shortcuts.
  const showChips = /[A-Za-z]/.test(subject.entity) && subject.entity.split(/\s+/).length <= 4 && subject.entity.length >= 2;
  const chips = [
    { label: "🏢 HQ + logo", q: `${subject.entity} headquarters building logo sign` },
    { label: "Logo", q: `${subject.entity} logo` },
    { label: "Storefront", q: `${subject.entity} store sign` },
    { label: "Portrait", q: `${subject.entity} portrait` },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 p-4 border-b border-zinc-800">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-zinc-100">Find an image · Shot {index + 1}</h3>
            <p className="text-[11px] text-zinc-500 mt-0.5 line-clamp-1">{scene.description}</p>
          </div>
          <div className="flex items-center gap-1 bg-zinc-800 rounded-md p-0.5">
            {SOURCES.map((s) => (
              <button
                key={s.value}
                onClick={() => onSource(s.value)}
                className={`px-2 py-1 text-[11px] rounded transition-colors ${source === s.value ? "bg-zinc-700 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"}`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 text-lg leading-none px-1">×</button>
        </div>

        {/* Search bar — concise query (drives Google; Pexels keeps the rich prompt until edited) */}
        <div className="px-4 pt-3 pb-2 border-b border-zinc-800 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              <input
                value={q}
                onChange={(e) => { setQ(e.target.value); setEdited(true); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runSearch(source, q, edited); } }}
                placeholder="Search photos…"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-md pl-8 pr-2 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus-visible:ring-2 focus-visible:ring-blue-500"
              />
            </div>
            <button
              onClick={() => runSearch(source, q, edited)}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-md text-xs font-medium text-white transition-colors"
            >
              Search
            </button>
          </div>
          {showChips && (
            <div className="flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <button
                  key={c.label}
                  onClick={() => applyChip(c.q)}
                  className={`px-2 py-0.5 rounded-full text-[10px] border transition-colors ${q === c.q ? "bg-blue-600/30 border-blue-500 text-blue-200" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600"}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="overflow-y-auto p-4 flex flex-col gap-5">
          {/* ── Suggested for this scene ── */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wide">Suggested for this scene</h4>
              {loadingStock && <span className="text-[10px] text-zinc-500">Searching photos…</span>}
            </div>

            {matches.length > 0 && (
              <>
                <p className="text-[10px] text-green-400/80 mb-1.5">From your library ({matches.length})</p>
                <div className="grid grid-cols-6 gap-2 mb-3">
                  {matches.map((img) => (
                    <button
                      key={img.id}
                      onClick={() => pickLibrary(img)}
                      title={img.tags.join(", ")}
                      className="group relative aspect-[3/4] rounded-md overflow-hidden border border-zinc-700 hover:border-green-500 transition-colors"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={libraryFileUrl(img.id)} alt={img.filename} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </>
            )}

            <p className="text-[10px] text-zinc-400 mb-1.5">Stock photos {stock.length ? `(${stock.length})` : ""}</p>
            {stock.length === 0 && !loadingStock ? (
              <p className="text-[11px] text-zinc-600 py-4 text-center">No stock photos found for this scene.</p>
            ) : (
              <div className="grid grid-cols-6 gap-2">
                {stock.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => pickStock(p)}
                    disabled={!!savingId}
                    title={`${p.alt}${p.credit ? ` · ${p.credit}` : ""}`}
                    className="group relative aspect-[3/4] rounded-md overflow-hidden border border-zinc-700 hover:border-blue-500 transition-colors disabled:opacity-50"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.thumb} alt={p.alt} className="w-full h-full object-cover" loading="lazy" />
                    <span className="absolute top-0.5 left-0.5 px-1 py-0.5 rounded text-[8px] font-medium bg-black/60 text-white capitalize">
                      {p.source === "serpapi" ? "web" : "pexels"}
                    </span>
                    {savingId === p.id && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-[10px] text-white">Saving…</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* ── Rest of the library (collapsed by default to keep suggestions front) ── */}
          {rest.length > 0 && (
            <section>
              <button
                onClick={() => setShowLibrary((v) => !v)}
                className="w-full flex items-center justify-between group"
              >
                <h4 className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wide group-hover:text-zinc-100">
                  Your library ({rest.length})
                </h4>
                <span className="flex items-center gap-1 text-[10px] text-zinc-500 group-hover:text-zinc-300">
                  {showLibrary ? "Hide" : "Show all"}
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform ${showLibrary ? "rotate-180" : ""}`}><polyline points="6 9 12 15 18 9" /></svg>
                </span>
              </button>
              {showLibrary && (
                <div className="grid grid-cols-6 gap-2 mt-2">
                  {rest.map((img) => (
                    <button
                      key={img.id}
                      onClick={() => pickLibrary(img)}
                      title={img.tags.join(", ")}
                      className="aspect-[3/4] rounded-md overflow-hidden border border-zinc-700 hover:border-green-500 transition-colors"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={libraryFileUrl(img.id)} alt={img.filename} className="w-full h-full object-cover" loading="lazy" />
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
};
