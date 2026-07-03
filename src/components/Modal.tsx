"use client";

import React, { useEffect, useId } from "react";
import { Button } from "./Button";
import { IconButton } from "./IconButton";

type Size = "sm" | "md" | "lg" | "xl";

// The one dialog recipe: a dimmed click-outside-to-close overlay (z-50 — see
// the z-index scale in globals.css) and a zinc panel with internal scroll.
// Escape always closes. When `title` is given the standard header renders
// (text-sm font-medium text-zinc-200 + × close) and labels the dialog;
// modals with custom headers pass `label` instead and render their own.
const SIZES: Record<Size, string> = {
  sm: "w-80",
  md: "w-[520px]",
  lg: "w-[720px]",
  xl: "w-full max-w-3xl",
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  size?: Size;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Accessible name when there's no `title` for aria-labelledby to point at. */
  label?: string;
  /** Extra classes on the panel (fixed heights, drag opacity…). */
  panelClassName?: string;
  /** Classes for the children wrapper — override for custom layouts. */
  bodyClassName?: string;
  /** While true the overlay stops dimming and turns click-through, so drags
      from inside the modal (LibraryModal → timeline) can hit the page below. */
  transparent?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  size = "md",
  children,
  footer,
  label,
  panelClassName = "",
  bodyClassName = "flex-1 min-h-0 overflow-y-auto",
  transparent = false,
}) => {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-colors ${
        transparent ? "bg-transparent pointer-events-none" : "bg-black/60"
      }`}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title != null ? titleId : undefined}
        aria-label={title == null ? label : undefined}
        className={`bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl flex flex-col max-w-[92vw] max-h-[85vh] ${SIZES[size]} ${panelClassName}`}
        onClick={(e) => e.stopPropagation()}
      >
        {title != null && (
          <div className="flex items-center justify-between p-4 border-b border-zinc-800">
            <h3 id={titleId} className="text-sm font-medium text-zinc-200">{title}</h3>
            <IconButton onClick={onClose} aria-label="Close" className="text-zinc-500 hover:text-zinc-200 px-2 text-lg leading-none">×</IconButton>
          </div>
        )}
        <div className={bodyClassName}>{children}</div>
        {footer && <div className="p-4 border-t border-zinc-800 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
};

// Small title/message/cancel/confirm dialog on top of Modal — the shape both
// Editor confirmations share. `danger` flips the confirm to the red variant.
export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  danger?: boolean;
  cancelLabel?: string;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  onClose,
  title,
  message,
  confirmLabel,
  onConfirm,
  danger = false,
  cancelLabel = "Cancel",
}) => (
  <Modal
    open={open}
    onClose={onClose}
    title={title}
    size="sm"
    footer={
      <>
        <Button variant="ghost" size="sm" onClick={onClose}>{cancelLabel}</Button>
        <Button variant={danger ? "danger" : "primary"} size="sm" onClick={onConfirm}>{confirmLabel}</Button>
      </>
    }
  >
    <p className="text-xs text-zinc-400 leading-relaxed p-4">{message}</p>
  </Modal>
);
