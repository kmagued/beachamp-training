"use client";

import { useEffect, useState, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils/cn";
import { Button } from "./button";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  confirmVariant?: "primary" | "outline" | "danger";
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Delete",
  confirmVariant = "danger",
  loading,
}: ConfirmDialogProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
    } else {
      setVisible(false);
      const timer = setTimeout(() => setMounted(false), 200);
      return () => clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    if (mounted && open) {
      const timer = setTimeout(() => setVisible(true), 20);
      return () => clearTimeout(timer);
    }
  }, [mounted, open]);

  const handleBackdrop = useCallback(() => {
    if (!loading) onClose();
  }, [loading, onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className={cn(
          "absolute inset-0 bg-black/40 transition-opacity duration-200",
          visible ? "opacity-100" : "opacity-0"
        )}
        onClick={handleBackdrop}
      />
      <div
        className={cn(
          "relative bg-white rounded-xl shadow-xl max-w-sm w-full mx-4 p-6 transition-all duration-200",
          visible ? "opacity-100 scale-100" : "opacity-0 scale-95"
        )}
      >
        <h3 className="font-semibold text-slate-900 text-lg mb-1">{title}</h3>
        {description && (
          <p className="text-sm text-slate-500 mb-5">{description}</p>
        )}
        <div className="flex gap-3 justify-end">
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={confirmVariant} size="sm" onClick={onConfirm} disabled={loading}>
            {loading ? "Deleting..." : confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
