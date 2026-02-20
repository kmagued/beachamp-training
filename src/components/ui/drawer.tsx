"use client";

import { useEffect, useState, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
  /** Width of the side panel on desktop (default: "max-w-md") */
  width?: string;
}

export function Drawer({ open, onClose, title, children, className, width = "max-w-md" }: DrawerProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  // Phase 1: mount/unmount
  useEffect(() => {
    if (open) {
      setMounted(true);
    } else {
      setVisible(false);
      const timer = setTimeout(() => setMounted(false), 300);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Phase 2: animate in after mount paint
  useEffect(() => {
    if (mounted && open) {
      const timer = setTimeout(() => setVisible(true), 20);
      return () => clearTimeout(timer);
    }
  }, [mounted, open]);

  // Lock body scroll
  useEffect(() => {
    if (mounted) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mounted]);

  const handleBackdropClick = useCallback(() => onClose(), [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className={cn(
          "absolute inset-0 bg-black/40 transition-opacity duration-300",
          visible ? "opacity-100" : "opacity-0"
        )}
        onClick={handleBackdropClick}
      />

      {/* Single responsive panel:
          Mobile  → bottom sheet (translate-y)
          Desktop → right side panel (translate-x) */}
      <div
        className={cn(
          "absolute flex flex-col bg-white shadow-xl transition-transform duration-300 ease-out",
          // Mobile: bottom sheet positioning
          "inset-x-0 bottom-0 rounded-t-2xl max-h-[90vh]",
          // Desktop: right side panel positioning (overrides mobile)
          "sm:inset-x-auto sm:inset-y-0 sm:right-0 sm:rounded-none sm:max-h-none sm:w-full",
          width,
          // Animation: mobile uses translateY, desktop uses translateX
          visible
            ? "translate-y-0 sm:translate-x-0"
            : "translate-y-full sm:translate-y-0 sm:translate-x-full",
          className
        )}
      >
        {/* Mobile drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-slate-300" />
        </div>

        {/* Title bar */}
        {title && (
          <div className="flex items-center justify-between px-5 py-3 sm:px-6 sm:py-4 border-b border-slate-200 shrink-0">
            <h3 className="font-semibold text-slate-900 sm:text-lg">{title}</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
