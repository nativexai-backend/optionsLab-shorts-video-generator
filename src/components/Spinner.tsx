"use client";

import React from "react";

// The one loading spinner. Size and color come from `className`
// (e.g. "h-3 w-3", "h-5 w-5 text-blue-400") — the stroke/fill use
// currentColor so it inherits from whatever button or label it sits in.
export const Spinner: React.FC<{ className?: string }> = ({ className = "h-4 w-4" }) => (
  <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);
