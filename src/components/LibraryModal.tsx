"use client";

import React, { useCallback, useEffect, useState } from "react";
import type { LibraryImage } from "../lib/library-types";
import { searchLibrary, updateLibraryImage, deleteLibraryImage, libraryFileUrl } from "../lib/library-client";
import { SCENE_CATEGORIES } from "../remotion/types";

interface Props {
  open: boolean;
  onClose: () => void;
  showToast: (message: string, type: "error" | "success") => void;
}

const CATEGORIES = [...SCENE_CATEGORIES.map((c) => c.value), "other"];

export const LibraryModal: React.FC<Props> = ({ open, onClose, showToast }) => {
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [images, setImages] = useState<LibraryImage[]>([]);
  const [selected, setSelected] = useState<LibraryImage | null>(null);

  // Search whenever the modal opens or the filters change (state set only in
  // the async resolution, so no synchronous setState-in-effect).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    searchLibrary({ text: query || undefined, category: categoryFilter || undefined }).then((res) => {
      if (!cancelled) setImages(res);
    });
    return () => { cancelled = true; };
  }, [open, query, categoryFilter]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleSave = useCallback(async (id: string, patch: { tags: string[]; description: string; category: string }) => {
    const updated = await updateLibraryImage(id, patch);
    if (updated) {
      setImages((prev) => prev.map((im) => (im.id === updated.id ? updated : im)));
      setSelected(updated);
      showToast("Tags saved", "success");
    } else {
      showToast("Couldn't save", "error");
    }
  }, [showToast]);

  const handleDelete = useCallback(async (id: string) => {
    await deleteLibraryImage(id);
    setImages((prev) => prev.filter((im) => im.id !== id));
    setSelected(null);
    showToast("Removed from library", "success");
  }, [showToast]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl flex flex-col w-[760px] max-w-[92vw] h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header / search */}
        <div className="flex items-center gap-2 p-4 border-b border-zinc-800">
          <h3 className="text-sm font-medium text-zinc-200 flex-shrink-0">Image Library</h3>
          <span className="text-[11px] text-zinc-500 flex-shrink-0">{images.length}</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tags, people, companies…"
            className="ml-2 flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus-visible:ring-2 focus-visible:ring-blue-500"
          />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-300"
          >
            <option value="">All</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 px-2 text-lg leading-none">×</button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Grid */}
          <div className="flex-1 overflow-y-auto p-3">
            {images.length === 0 ? (
              <div className="text-center text-zinc-500 text-xs p-8 space-y-1">
                <p>{query || categoryFilter ? "No matches." : "Your library is empty."}</p>
                <p className="text-[11px] text-zinc-600">Images you drop into scenes are saved here automatically and matched to future shot lists.</p>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {images.map((img) => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => setSelected(img)}
                    className={`relative aspect-[9/16] rounded-lg overflow-hidden border-2 transition-all ${
                      selected?.id === img.id ? "border-blue-500 ring-2 ring-blue-500/40" : "border-zinc-700 hover:border-zinc-500"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={libraryFileUrl(img.id)} alt={img.filename} className="w-full h-full object-cover" />
                    <span className="absolute bottom-0 inset-x-0 bg-black/60 text-[10px] text-zinc-300 px-1 py-0.5 truncate text-left">
                      {img.tags.slice(0, 2).join(", ") || img.filename}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Detail / editor — keyed so its fields re-init per selection */}
          {selected && (
            <LibraryDetail
              key={selected.id}
              image={selected}
              onSave={handleSave}
              onDelete={handleDelete}
            />
          )}
        </div>
      </div>
    </div>
  );
};

function LibraryDetail({
  image,
  onSave,
  onDelete,
}: {
  image: LibraryImage;
  onSave: (id: string, patch: { tags: string[]; description: string; category: string }) => void;
  onDelete: (id: string) => void;
}) {
  const [tagsText, setTagsText] = useState(image.tags.join(", "));
  const [description, setDescription] = useState(image.description);
  const [category, setCategory] = useState(image.category);

  return (
    <div className="w-64 flex-shrink-0 border-l border-zinc-800 p-3 overflow-y-auto flex flex-col gap-2.5">
      <div className="rounded-lg overflow-hidden border border-zinc-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={libraryFileUrl(image.id)} alt={image.filename} className="w-full object-contain max-h-44 bg-zinc-950" />
      </div>
      <p className="text-[10px] text-zinc-500 truncate" title={image.filename}>{image.filename}</p>

      <div>
        <label className="text-[10px] text-zinc-400 mb-0.5 block">Tags (comma-separated)</label>
        <textarea
          value={tagsText}
          onChange={(e) => setTagsText(e.target.value)}
          rows={2}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-[11px] text-zinc-200 resize-y focus-visible:ring-2 focus-visible:ring-blue-500"
        />
      </div>
      <div>
        <label className="text-[10px] text-zinc-400 mb-0.5 block">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-[11px] text-zinc-200 resize-y focus-visible:ring-2 focus-visible:ring-blue-500"
        />
      </div>
      <div>
        <label className="text-[10px] text-zinc-400 mb-0.5 block">Category</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-[11px] text-zinc-300"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <p className="text-[10px] text-zinc-600">Used in {image.usedInProjects.length} project{image.usedInProjects.length === 1 ? "" : "s"}</p>

      <div className="flex gap-2 mt-auto pt-1">
        <button onClick={() => onDelete(image.id)} className="px-2.5 py-1.5 text-[11px] text-red-400 hover:bg-red-500/10 rounded transition-colors">Delete</button>
        <button
          onClick={() => onSave(image.id, { tags: tagsText.split(",").map((t) => t.trim()).filter(Boolean), description, category })}
          className="flex-1 px-3 py-1.5 text-[11px] font-medium bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
        >
          Save
        </button>
      </div>
    </div>
  );
}
