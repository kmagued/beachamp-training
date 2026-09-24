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
  loadingLabel = "Deleting...",
  confirmVariant = "danger",
  loading,
}: ConfirmDrawerProps) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={title}
      width="max-w-sm"
      footer={
        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={confirmVariant} onClick={onConfirm} disabled={loading}>
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
