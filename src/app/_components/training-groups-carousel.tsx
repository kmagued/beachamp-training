"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface PhotoItem {
  id: string;
  url: string;
  caption: string | null;
}

export function TrainingGroupCarousel({
  groupName,
  photos,
}: {
  groupName: string;
  photos: PhotoItem[];
}) {
  const [index, setIndex] = useState(0);
  const count = photos.length;

  const go = useCallback(
    (next: number) => setIndex(((next % count) + count) % count),
    [count],
  );

  useEffect(() => {
    if (count <= 1) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") go(index - 1);
      if (e.key === "ArrowRight") go(index + 1);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [index, count, go]);

  if (count === 0) return null;

  const active = photos[index];

  return (
    <div className="relative">
      <div className="relative rounded-2xl overflow-hidden bg-white shadow-[0_16px_40px_-16px_rgba(18,75,93,0.3)] ring-1 ring-primary-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={active.id}
          src={active.url}
          alt={active.caption || groupName}
          className="block w-full h-auto select-none"
        />

        {/* Counter pill */}
        {count > 1 && (
          <div className="absolute top-3 right-3 bg-black/50 backdrop-blur-sm text-white text-[11px] font-semibold tracking-wider px-2.5 py-1 rounded-full">
            {index + 1} / {count}
          </div>
        )}

        {/* Caption */}
        {active.caption && (
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-5 pt-10 pb-4">
            <p className="text-white text-sm font-medium leading-snug">{active.caption}</p>
          </div>
        )}

        {/* Nav buttons */}
        {count > 1 && (
          <>
            <button
              onClick={() => go(index - 1)}
              aria-label="Previous photo"
              className="group absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/80 hover:bg-white backdrop-blur-md text-primary-900 flex items-center justify-center border border-primary-100 transition-all duration-200 hover:scale-105 hover:shadow-lg"
            >
              <ChevronLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
            </button>
            <button
              onClick={() => go(index + 1)}
              aria-label="Next photo"
              className="group absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/80 hover:bg-white backdrop-blur-md text-primary-900 flex items-center justify-center border border-primary-100 transition-all duration-200 hover:scale-105 hover:shadow-lg"
            >
              <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          </>
        )}
      </div>

      {/* Thumbnail strip */}
      {count > 1 && (
        <div className="mt-3 flex items-center justify-center gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {photos.map((p, i) => (
            <button
              key={p.id}
              onClick={() => setIndex(i)}
              aria-label={`Go to photo ${i + 1}`}
              className={cn(
                "relative shrink-0 w-14 h-10 rounded-md overflow-hidden transition-all duration-200",
                i === index
                  ? "ring-2 ring-accent ring-offset-2 ring-offset-white opacity-100"
                  : "opacity-60 hover:opacity-100 ring-1 ring-primary-100",
              )}
            >
              <Image
                src={p.url}
                alt=""
                fill
                sizes="64px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
