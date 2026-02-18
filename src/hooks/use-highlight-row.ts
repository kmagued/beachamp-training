"use client";

import { useEffect, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export function useHighlightRow() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const highlightId = searchParams.get("highlight");
  const processedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!highlightId || processedRef.current === highlightId) return;
    processedRef.current = highlightId;

    // Delay to allow data fetch + DOM render
    const timeout = setTimeout(() => {
      const el = document.getElementById(`row-${highlightId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("row-highlight");
      }
      // Strip the highlight param from URL so refresh does not re-trigger
      const url = new URL(window.location.href);
      url.searchParams.delete("highlight");
      router.replace(url.pathname + url.search, { scroll: false });
    }, 500);

    return () => clearTimeout(timeout);
  }, [highlightId, router]);

  const getRowId = useCallback((id: string) => `row-${id}`, []);
  const isHighlighted = useCallback(
    (id: string) => id === highlightId,
    [highlightId]
  );

  return { highlightId, getRowId, isHighlighted };
}
