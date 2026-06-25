"use client";

import React from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

// Shared button so weight, padding, radius, and the one accent stay consistent.
// `primary` is the single hero action per surface (the blue→violet gradient,
// matching Export); everything else is neutral/ghost.
const BASE =
  "inline-flex items-center justify-center gap-1.5 font-medium rounded-lg transition duration-150 ease-out-soft active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:active:scale-100";

const SIZES: Record<Size, string> = {
  sm: "px-2.5 py-1 text-xs",
  md: "px-3 py-1.5 text-sm",
};

const VARIANTS: Record<Variant, string> = {
  primary:
    "text-white bg-gradient-to-br from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 disabled:from-zinc-700 disabled:to-zinc-700 disabled:text-zinc-400",
  secondary: "text-zinc-200 bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 hover:text-white disabled:opacity-50",
  ghost: "text-zinc-400 border border-zinc-700 hover:text-white hover:bg-zinc-800 disabled:opacity-50",
  danger: "text-white bg-red-600 hover:bg-red-700 disabled:opacity-50",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "secondary", size = "md", fullWidth, className = "", ...props }, ref) => (
    <button
      ref={ref}
      className={`${BASE} ${SIZES[size]} ${VARIANTS[variant]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...props}
    />
  ),
);
Button.displayName = "Button";
