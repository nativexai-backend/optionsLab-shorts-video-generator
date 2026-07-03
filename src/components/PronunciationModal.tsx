"use client";

import React, { useCallback, useEffect, useState } from "react";
import { IconButton } from "./IconButton";
import { Modal } from "./Modal";
import type { PronunciationEntry } from "../lib/pronunciation";

interface Props {
  open: boolean;
  onClose: () => void;
  showToast: (message: string, type: "error" | "success") => void;
}

export const PronunciationModal: React.FC<Props> = ({ open, onClose, showToast }) => {
  const [entries, setEntries] = useState<PronunciationEntry[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/pronunciation")
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setEntries(d.entries ?? []); })
      .catch(() => { if (!cancelled) setEntries([]); });
    return () => { cancelled = true; };
  }, [open]);

  const update = useCallback((i: number, field: "term" | "say", value: string) => {
    setEntries((prev) => (prev ? prev.map((e, idx) => (idx === i ? { ...e, [field]: value } : e)) : prev));
  }, []);

  const remove = useCallback((i: number) => {
    setEntries((prev) => (prev ? prev.filter((_, idx) => idx !== i) : prev));
  }, []);

  const add = useCallback(() => {
    setEntries((prev) => [...(prev ?? []), { term: "", say: "" }]);
  }, []);

  const save = useCallback(async () => {
    if (!entries) return;
    setSaving(true);
    try {
      const res = await fetch("/api/pronunciation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      });
      if (!res.ok) throw new Error("save failed");
      const data = await res.json();
      setEntries(data.entries ?? entries);
      showToast("Pronunciations saved", "success");
      onClose();
    } catch {
      showToast("Couldn't save pronunciations", "error");
    } finally {
      setSaving(false);
    }
  }, [entries, showToast, onClose]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Pronunciations"
      size="md"
      footer={
        <>
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors">Cancel</button>
          <button
            onClick={save}
            disabled={saving || entries === null}
            className="px-4 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-md transition-colors"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div className="p-4">
        <p className="text-mini text-zinc-500 mb-3">
          Tell the voice how to say tricky terms. Applies to the voiceover only — your script and captions keep the original spelling. Shared across all projects.
        </p>
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 mb-1.5 text-micro uppercase tracking-wider text-zinc-500 font-medium px-1">
          <span>Term (as written)</span>
          <span>Say it like</span>
          <span />
        </div>
        {entries === null ? (
          <p className="text-xs text-zinc-500 p-4 text-center">Loading…</p>
        ) : (
          <div className="space-y-1.5">
            {entries.map((e, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                <input
                  value={e.term}
                  onChange={(ev) => update(i, "term", ev.target.value)}
                  placeholder="G7"
                  className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus-visible:ring-2 focus-visible:ring-blue-500"
                />
                <input
                  value={e.say}
                  onChange={(ev) => update(i, "say", ev.target.value)}
                  placeholder="G seven"
                  className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus-visible:ring-2 focus-visible:ring-blue-500"
                />
                <IconButton
                  onClick={() => remove(i)}
                  aria-label="Remove"
                  className="w-7 h-7 text-zinc-500 hover:text-red-400 hover:bg-zinc-800"
                >
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="2" y1="2" x2="8" y2="8" /><line x1="8" y1="2" x2="2" y2="8" /></svg>
                </IconButton>
              </div>
            ))}
            <button onClick={add} className="text-mini text-blue-400 hover:text-blue-300 transition-colors mt-1">+ Add term</button>
          </div>
        )}
      </div>
    </Modal>
  );
};
