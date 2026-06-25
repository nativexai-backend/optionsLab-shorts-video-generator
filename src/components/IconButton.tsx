"use client";

import React from "react";

// Shared interaction layer for small hand-rolled buttons (icon buttons + chips).
// These two primitives DON'T impose colors or size — call sites keep their exact
// visual classes via `className`. What they unify is the *interaction*: pointer
// cursor, a subtle spring-y press-scale, the soft easing, and the standard focus
// ring. `transition` (full) is used deliberately so the scale actually animates
// (`transition-colors` does not cover the `scale` property).
const INTERACTION =
  "transition duration-150 ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:active:scale-100";

// A small square, icon-only button (close ×, reorder, delete, play/pause…).
// Bakes in flex-centering + rounding since every icon button wants them.
export const IconButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className = "", type = "button", ...props }, ref) => (
  <button
    ref={ref}
    type={type}
    className={`inline-flex items-center justify-center rounded ${INTERACTION} active:scale-90 ${className}`}
    {...props}
  />
));
IconButton.displayName = "IconButton";

// A pill/tag toggle or filter button. Rounding is left to the call site so both
// `rounded` and `rounded-full` chips work without class conflicts.
export const Chip = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className = "", type = "button", ...props }, ref) => (
  <button
    ref={ref}
    type={type}
    className={`${INTERACTION} active:scale-95 ${className}`}
    {...props}
  />
));
Chip.displayName = "Chip";
