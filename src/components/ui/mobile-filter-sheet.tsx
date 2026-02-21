"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface MobileFilterSheetProps {
  children: ReactNode;
  activeCount?: number;
}

export function MobileFilterSheet({ children, activeCount = 0 }: MobileFilterSheetProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
    } else {
      setVisible(false);
      const timer = setTimeout(() => setMounted(false), 300);
      return () => clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    if (mounted && open) {
      const timer = setTimeout(() => setVisible(true), 20);
      return () => clearTimeout(timer);
    }
  }, [mounted, open]);

  useEffect(() => {
    if (mounted) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mounted]);

  const handleClose = useCallback(() => setOpen(false), []);

  return (
    <>
      {/* Floating button — mobile only */}
      <button
        onClick={() => setOpen(true)}
        className="sm:hidden fixed bottom-6 right-6 z-30 w-12 h-12 rounded-full bg-primary text-white shadow-lg shadow-primary/30 flex items-center justify-center active:scale-95 transition-transform"
      >
        <SlidersHorizontal className="w-5 h-5" />
        {activeCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {activeCount}
          </span>
        )}
      </button>

      {/* Sheet portal */}
      {mounted && createPortal(
        <div className="fixed inset-0 z-50 sm:hidden">
          <div
            className={cn(
              "absolute inset-0 bg-black/40 transition-opacity duration-300",
              visible ? "opacity-100" : "opacity-0"
            )}
            onClick={handleClose}
          />
          <div
            className={cn(
              "absolute inset-x-0 bottom-0 bg-white rounded-t-2xl max-h-[80vh] flex flex-col transition-transform duration-300 ease-out",
              visible ? "translate-y-0" : "translate-y-full"
            )}
          >
            {/* Handle + header */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-slate-300" />
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 shrink-0">
              <h3 className="font-semibold text-slate-900">Filters</h3>
              <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {children}
            </div>

            {/* Done button */}
            <div className="p-4 border-t border-slate-200 shrink-0">
              <button
                onClick={handleClose}
                className="w-full py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary-600 transition-colors"
              >
                Show Results
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
