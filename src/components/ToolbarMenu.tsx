"use client";

import React, { useEffect, useRef, useState } from "react";

export interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
}

interface Props {
  icon: React.ReactNode;
  label?: string; // omit for an icon-only trigger
  title?: string;
  items: MenuItem[];
}

// A small dropdown menu for the top toolbar — closes on outside-click / Escape.
export const ToolbarMenu: React.FC<Props> = ({ icon, label, title, items }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`py-1.5 text-sm rounded-lg border transition-colors inline-flex items-center gap-1.5 ${label ? "px-3" : "px-2"} ${
          open ? "text-white bg-zinc-800 border-zinc-600" : "text-zinc-400 hover:text-white hover:bg-zinc-800 border-zinc-700"
        }`}
      >
        {icon}
        {label}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-1 min-w-[170px] bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 z-50">
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              onClick={() => { setOpen(false); it.onClick(); }}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700/60 hover:text-white transition-colors text-left"
            >
              {it.icon && <span className="text-zinc-400 flex-shrink-0">{it.icon}</span>}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
