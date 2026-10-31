"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, Toast } from "@/components/ui";
import { Upload, Trash2, Loader2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { LandingPhotoGrid, LandingPhotoTile } from "@/components/landing/landing-photo-grid";
import { CTA_SLOT, GALLERY_SLOTS, LEVELS_SLOT, type LandingPhoto } from "@/lib/config/landing-photos";
import { uploadLandingPhoto, removeLandingPhoto } from "../actions";

export function LandingPhotosClient({ photos }: { photos: Record<number, LandingPhoto> }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busySlot, setBusySlot] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);

  function handleFile(slot: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Cleared so picking the same file again still uploads
    e.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setToast({ message: "Photo must be under 5MB", variant: "error" });
      return;
    }

    const fd = new FormData();
    fd.append("slot", String(slot));
    fd.append("file", file);
    setBusySlot(slot);
    startTransition(async () => {
      const res = await uploadLandingPhoto(fd);
      setBusySlot(null);
      if (res.error) {
        setToast({ message: res.error, variant: "error" });
      } else {
        setToast({ message: "Photo saved", variant: "success" });
        router.refresh();
      }
    });
  }

  function handleRemove(slot: number) {
    if (!confirm("Remove this photo from the landing page?")) return;
    setBusySlot(slot);
    startTransition(async () => {
      const res = await removeLandingPhoto(slot);
      setBusySlot(null);
      if (res.error) {
        setToast({ message: res.error, variant: "error" });
      } else {
        setToast({ message: "Photo removed", variant: "success" });
        router.refresh();
      }
    });
  }

  /** Upload/Replace and Remove, laid over a spot */
  function controls(photo: LandingPhoto) {
    return (
      <>
        {busySlot === photo.slot && (
          <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
          </div>
        )}
        <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
          <label
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white/90 text-xs font-medium text-slate-700 shadow-sm",
              busySlot !== null ? "pointer-events-none opacity-50" : "cursor-pointer hover:bg-white",
            )}
          >
            <Upload className="w-3.5 h-3.5" />
            {photo.url ? "Replace" : "Upload"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              disabled={busySlot !== null}
              onChange={(e) => handleFile(photo.slot, e)}
            />
          </label>
          {photo.url && (
            <button
              type="button"
              onClick={() => handleRemove(photo.slot)}
              disabled={busySlot !== null}
              className="p-1.5 rounded-md bg-white/90 text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50 shadow-sm"
              title="Remove"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <Toast message={toast?.message ?? null} variant={toast?.variant} onClose={() => setToast(null)} />

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl tracking-tight text-slate-900">Landing Photos</h1>
          <p className="text-slate-500 text-sm">
            Photos around the landing page, cropped to fit their spot. PNG, JPG or WebP up to 5MB.
          </p>
        </div>
        <Link
          href="/"
          target="_blank"
          className="shrink-0 flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          View page <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="space-y-6">
        <Card>
          <h2 className="font-semibold text-slate-900">Gallery</h2>
          <p className="text-xs text-slate-400 mb-4">Below the numbers at the top, under &quot;Life at …&quot;</p>
          <LandingPhotoGrid photos={GALLERY_SLOTS.map((slot) => photos[slot])} overlay={controls} />
        </Card>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <h2 className="font-semibold text-slate-900">Find your level</h2>
            <p className="text-xs text-slate-400 mb-4">Beside the heading of the levels section</p>
            <LandingPhotoTile
              photo={photos[LEVELS_SLOT]}
              sizes="(max-width: 768px) 100vw, 520px"
              className="aspect-[16/10]"
              overlay={controls}
            />
          </Card>

          <Card>
            <h2 className="font-semibold text-slate-900">Ready to hit the court?</h2>
            <p className="text-xs text-slate-400 mb-4">
              Behind the closing call to action, darkened under the text. Empty, it keeps its plain background.
            </p>
            <LandingPhotoTile
              photo={photos[CTA_SLOT]}
              sizes="(max-width: 768px) 100vw, 520px"
              className="aspect-[16/10]"
              overlay={controls}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
