"use client";

import { type ReactNode } from "react";
import { Drawer } from "./drawer";
import { Button } from "./button";

interface ConfirmDrawerProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: ReactNode;
  /** Rendered below the description — e.g. a summary of the record being deleted */
  details?: ReactNode;
  confirmLabel?: string;
  /** The button that backs out — rename it when the action itself is a "Cancel …" */
  cancelLabel?: string;
  loadingLabel?: string;
  confirmVariant?: "primary" | "outline" | "danger";
  loading?: boolean;
}

/**
 * Confirmation built on Drawer, so destructive actions get the same panel,
 * backdrop and animation as the rest of the app's drawers.
 */
export function ConfirmDrawer({
  open,
  onClose,
  onConfirm,
  title,
  description,
  details,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  loadingLabel = "Deleting...",
  confirmVariant = "danger",
  loading,
}: ConfirmDrawerProps) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={title}
      // sm: only, so the phone bottom sheet spans the full width
      width="sm:max-w-sm"
      footer={
        <div className="flex gap-3 sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={loading} className="flex-1 sm:flex-none">
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant} onClick={onConfirm} disabled={loading} className="flex-1 sm:flex-none">
            {loading ? loadingLabel : confirmLabel}
          </Button>
        </div>
      }
    >
      {description && <p className="text-sm text-slate-500">{description}</p>}
      {details && <div className="mt-4">{details}</div>}
    </Drawer>
  );
}
