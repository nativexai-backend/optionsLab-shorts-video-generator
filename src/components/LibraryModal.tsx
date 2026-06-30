"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { IconButton, Chip } from "./IconButton";
import type { LibraryImage, LibraryDragPayload } from "../lib/library-types";
import { searchLibrary, updateLibraryImage, deleteLibraryImage, libraryFileUrl } from "../lib/library-client";
import { SCENE_CATEGORIES } from "../remotion/types";

interface Props {
  open: boolean;
  onClose: () => void;
  showToast: (message: string, type: "error" | "success") => void;
  // Drop a library image onto a timeline track at the given layer/start time.
  onDropToTimeline?: (payload: LibraryDragPayload, track: number, startTime: number) => void;
  // Called the moment a drag actually starts, so the host can reveal the
  // timeline (it's the drop target) if it happens to be collapsed.
  onDragActivate?: () => void;
}

const CATEGORIES = [...SCENE_CATEGORIES.map((c) => c.value), "other"];
const DRAG_THRESHOLD = 5; // px the pointer must move before a click becomes a drag

export const LibraryModal: React.FC<Props> = ({ open, onClose, showToast, onDropToTimeline, onDragActivate }) => {
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [images, setImages] = useState<LibraryImage[]>([]);
  const [selected, setSelected] = useState<LibraryImage | null>(null);
  // Custom pointer-drag of a library image out toward the timeline. We avoid
  // native HTML5 DnD because the full-screen modal makes the timeline both
  // invisible and un-hit-testable as a drop target; instead we render a
  // floating ghost, make the modal click-through so elementFromPoint can see
  // the timeline beneath it, and do the drop ourselves.
  const [drag, setDrag] = useState<{ payload: LibraryDragPayload; x: number; y: number } | null>(null);
  const dragging = drag !== null;
  const pendingRef = useRef<{ payload: LibraryDragPayload; startX: number; startY: number; active: boolean } | null>(null);
  const overTargetRef = useRef<Element | null>(null);
  // Whether the most recent pointer interaction turned into a drag, so the
  // click that follows pointerup doesn't also open the editor panel.
  const draggedRef = useRef(false);

  const findDropTarget = (x: number, y: number): Element | null =>
    document.elementFromPoint(x, y)?.closest("[data-timeline-droptarget]") ?? null;

  const clearOverTarget = () => {
    if (overTargetRef.current) {
      overTargetRef.current.dispatchEvent(new CustomEvent("vid-lib-dragleave"));
      overTargetRef.current = null;
    }
  };

  const startPointerDrag = useCallback((payload: LibraryDragPayload, e: React.PointerEvent) => {
    if (!onDropToTimeline) return; // no drop handler → behave as a normal click
    draggedRef.current = false; // fresh interaction — don't let a stale flag swallow this click
    pendingRef.current = { payload, startX: e.clientX, startY: e.clientY, active: false };

    const onMove = (ev: PointerEvent) => {
      const p = pendingRef.current;
      if (!p) return;
      if (!p.active) {
        if (Math.hypot(ev.clientX - p.startX, ev.clientY - p.startY) < DRAG_THRESHOLD) return;
        p.active = true; // crossed the threshold — this is a drag, not a click
        onDragActivate?.(); // reveal the timeline (drop target) if collapsed
      }
      setDrag({ payload: p.payload, x: ev.clientX, y: ev.clientY });
      const target = findDropTarget(ev.clientX, ev.clientY);
      if (target !== overTargetRef.current) clearOverTarget();
      if (target) {
        overTargetRef.current = target;
        target.dispatchEvent(new CustomEvent("vid-lib-dragover", { detail: { clientY: ev.clientY } }));
      }
    };

    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const p = pendingRef.current;
      pendingRef.current = null;
      setDrag(null);
      clearOverTarget();
      draggedRef.current = !!p?.active;
      if (!p?.active) return; // never moved → it was a click; onClick handles it
      const target = findDropTarget(ev.clientX, ev.clientY) as HTMLElement | null;
      if (!target || !onDropToTimeline) return;
      const rect = target.getBoundingClientRect();
      const pps = Number(target.dataset.pps) || 1;
      const rowHeight = Number(target.dataset.rowHeight) || 1;
      const trackCount = Number(target.dataset.trackCount) || 1;
      const track = Math.max(0, Math.min(trackCount, Math.floor((ev.clientY - rect.top) / rowHeight)));
      const startTime = Math.max(0, (ev.clientX - rect.left) / pps);
      onDropToTimeline(p.payload, track, startTime);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [onDropToTimeline, onDragActivate]);

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
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-colors ${
        dragging ? "bg-transparent pointer-events-none" : "bg-black/60"
      }`}
      onClick={onClose}
    >
      <div
        className={`bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl flex flex-col w-[760px] max-w-[92vw] h-[80vh] transition-opacity ${
          dragging ? "opacity-25" : "opacity-100"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header / search */}
        <div className="flex items-center gap-2 p-4 border-b border-zinc-800">
          <h3 className="text-sm font-medium text-zinc-200 flex-shrink-0">Image Library</h3>
          <span className="text-mini text-zinc-500 flex-shrink-0">{images.length}</span>
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
          <IconButton onClick={onClose} className="text-zinc-500 hover:text-zinc-200 px-2 text-lg leading-none">×</IconButton>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Grid */}
          <div className="flex-1 overflow-y-auto p-3">
            {images.length === 0 ? (
              <div className="text-center text-zinc-500 text-xs p-8 space-y-1">
                <p>{query || categoryFilter ? "No matches." : "Your library is empty."}</p>
                <p className="text-mini text-zinc-600">Images you drop into scenes are saved here automatically and matched to future shot lists.</p>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {images.map((img) => (
                  <button
                    key={img.id}
                    type="button"
                    onPointerDown={(e) => {
                      if (e.button !== 0) return;
                      startPointerDrag(
                        { id: img.id, filename: img.filename, description: img.description, category: img.category },
                        e
                      );
                    }}
                    onClick={() => {
                      if (draggedRef.current) {
                        draggedRef.current = false; // this "click" was the end of a drag — ignore it
                        return;
                      }
                      setSelected(img);
                    }}
                    title={onDropToTimeline ? "Drag onto the timeline to add — or click to edit tags" : "Click to edit tags"}
                    className={`relative aspect-[9/16] rounded-lg overflow-hidden border-2 transition-all touch-none ${
                      onDropToTimeline ? "cursor-grab active:cursor-grabbing" : ""
                    } ${
                      selected?.id === img.id ? "border-blue-500 ring-2 ring-blue-500/40" : "border-zinc-700 hover:border-zinc-500"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={libraryFileUrl(img.id)} alt={img.filename} draggable={false} className="w-full h-full object-cover pointer-events-none" />
                    <span className="absolute bottom-0 inset-x-0 bg-black/60 text-micro text-zinc-300 px-1 py-0.5 truncate text-left pointer-events-none">
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

      {/* Floating drag ghost — follows the cursor toward the timeline */}
      {drag && (
        <div
          className="fixed z-[60] pointer-events-none rounded-md overflow-hidden border-2 border-blue-400 shadow-2xl opacity-90"
          style={{ left: drag.x + 12, top: drag.y + 12, width: 54, height: 96 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={libraryFileUrl(drag.payload.id)} alt="" className="w-full h-full object-cover" />
        </div>
      )}
      {dragging && (
        <div className="fixed inset-x-0 bottom-2 z-[60] pointer-events-none flex justify-center">
          <span className="px-3 py-1 rounded-full bg-blue-600/90 text-white text-xs shadow-lg">Drop on a timeline track to add</span>
        </div>
      )}
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
      <p className="text-micro text-zinc-500 truncate" title={image.filename}>{image.filename}</p>

      <div>
        <label className="text-micro text-zinc-400 mb-0.5 block">Tags (comma-separated)</label>
        <textarea
          value={tagsText}
          onChange={(e) => setTagsText(e.target.value)}
          rows={2}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-mini text-zinc-200 resize-y focus-visible:ring-2 focus-visible:ring-blue-500"
        />
      </div>
      <div>
        <label className="text-micro text-zinc-400 mb-0.5 block">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-mini text-zinc-200 resize-y focus-visible:ring-2 focus-visible:ring-blue-500"
        />
      </div>
      <div>
        <label className="text-micro text-zinc-400 mb-0.5 block">Category</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-mini text-zinc-300"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <p className="text-micro text-zinc-600">Used in {image.usedInProjects.length} project{image.usedInProjects.length === 1 ? "" : "s"}</p>

      <div className="flex gap-2 mt-auto pt-1">
        <Chip onClick={() => onDelete(image.id)} className="px-2.5 py-1.5 text-mini text-red-400 hover:bg-red-500/10 rounded">Delete</Chip>
        <button
          onClick={() => onSave(image.id, { tags: tagsText.split(",").map((t) => t.trim()).filter(Boolean), description, category })}
          className="flex-1 px-3 py-1.5 text-mini font-medium bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
        >
          Save
        </button>
      </div>
    </div>
  );
}
