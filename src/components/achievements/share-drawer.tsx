"use client";

import { useEffect, useRef, useState } from "react";
import { Download, ImagePlus, Loader2, Share2, X } from "lucide-react";
import { Button, Drawer, Toast } from "@/components/ui";
import { shareFileName, shareText, type ShareSubject } from "@/lib/share/share";
import { BADGE_ICON_COMPONENTS } from "./badge-icon";
import { cardFile, drawShareCard, loadCardFonts, loadImage } from "./draw-share-card";
import { forgetPhoto, readPhoto, recallPhoto, rememberPhoto } from "./share-photo";

/** The badge's line icon, as rendered in the hidden span, turned into an image for the canvas */
function iconImage(holder: HTMLElement | null): Promise<HTMLImageElement | null> {
  const svg = holder?.querySelector("svg");
  if (!svg) return Promise.resolve(null);
  const markup = new XMLSerializer().serializeToString(svg);
  return loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`);
}

function download(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Draws the achievement card in the browser, lets the player add their own photo, and
 * hands the image to the phone's share sheet (or saves it where files can't be shared).
 */
export function ShareDrawer({
  open,
  onClose,
  subject,
  playerId,
}: {
  open: boolean;
  onClose: () => void;
  subject: ShareSubject;
  playerId: string;
}) {
  // Callback refs: the Drawer mounts its content a moment after opening
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [iconHolder, setIconHolder] = useState<HTMLSpanElement | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  // The finished image, made ahead of the tap: iOS only opens the share sheet if share()
  // is called straight from the tap, with no waiting in between
  const [file, setFile] = useState<File | null>(null);
  const [drawing, setDrawing] = useState(true);
  const [readingPhoto, setReadingPhoto] = useState(false);
  const [toast, setToast] = useState<{ message: string; variant: "error" | "info" } | null>(null);

  const subjectKey = JSON.stringify(subject);

  useEffect(() => {
    if (open) setPhoto(recallPhoto(playerId));
  }, [open, playerId]);

  useEffect(() => {
    if (!open || !canvas) return;
    let cancelled = false;
    setDrawing(true);
    setFile(null);
    (async () => {
      try {
        await loadCardFonts();
        const [logo, photoImg, badgeIcon] = await Promise.all([
          loadImage("/images/logo-cream.png"),
          photo ? loadImage(photo).catch(() => null) : Promise.resolve(null),
          subject.kind === "badge" ? iconImage(iconHolder).catch(() => null) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        drawShareCard(canvas, subject, { logo, photo: photoImg, badgeIcon });
        const made = await cardFile(canvas, shareFileName(subject));
        if (!cancelled) setFile(made);
      } catch (err) {
        console.error("[share]", err);
        if (!cancelled) setToast({ message: "Couldn't draw the card. Please try again.", variant: "error" });
      } finally {
        if (!cancelled) setDrawing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // subjectKey stands in for subject, which may be a new object with the same content
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, canvas, iconHolder, photo, subjectKey]);

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked) return;
    setReadingPhoto(true);
    try {
      const dataUrl = await readPhoto(picked);
      setPhoto(dataUrl);
      rememberPhoto(playerId, dataUrl);
    } catch {
      setToast({ message: "That photo format isn't supported. Try a JPG or PNG.", variant: "error" });
    } finally {
      setReadingPhoto(false);
    }
  }

  function removePhoto() {
    setPhoto(null);
    forgetPhoto(playerId);
  }

  const canShareFiles = file !== null && typeof navigator !== "undefined" && !!navigator.canShare?.({ files: [file] });

  async function handleShare() {
    if (!file) return;
    if (!canShareFiles) {
      download(file);
      return;
    }
    try {
      await navigator.share({ files: [file], text: shareText(subject) });
    } catch (err) {
      // Closing the share sheet isn't a failure
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("[share]", err);
      download(file);
      setToast({ message: "Couldn't open sharing, so the image was saved instead.", variant: "info" });
    }
  }

  const BadgeIcon = subject.kind === "badge" ? BADGE_ICON_COMPONENTS[subject.icon] : null;

  return (
    <>
      <Toast message={toast?.message ?? null} variant={toast?.variant} onClose={() => setToast(null)} />
      <Drawer
        open={open}
        onClose={onClose}
        title={subject.kind === "award" ? "Share your award" : "Share your badge"}
        footer={
          <Button className="w-full" onClick={handleShare} disabled={!file}>
            <span className="flex items-center justify-center gap-2">
              {drawing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : canShareFiles ? (
                <Share2 className="w-4 h-4" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {canShareFiles || drawing ? "Share" : "Save image"}
            </span>
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="relative">
            <canvas
              ref={setCanvas}
              className="block w-full h-auto aspect-[4/5] rounded-2xl bg-primary-900 shadow-lg shadow-primary-900/20"
              aria-label="Your achievement card"
            />
            {drawing && (
              <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-primary-900/40">
                <Loader2 className="w-7 h-7 animate-spin text-white/80" />
              </div>
            )}
          </div>

          <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="flex-1 px-3"
              onClick={() => fileInput.current?.click()}
              disabled={readingPhoto}
            >
              <span className="flex items-center justify-center gap-2">
                {readingPhoto ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                {photo ? "Change photo" : "Add your photo"}
              </span>
            </Button>
            {photo && (
              <Button variant="ghost" className="px-3" onClick={removePhoto}>
                <span className="flex items-center gap-1.5">
                  <X className="w-4 h-4" />
                  Remove photo
                </span>
              </Button>
            )}
          </div>
          <p className="text-xs text-slate-400">
            Your photo stays on this phone. It&apos;s only used to draw the card.
          </p>
        </div>

        {/* The badge's icon, drawn into the card from this hidden copy */}
        {BadgeIcon && (
          <span ref={setIconHolder} className="hidden" aria-hidden>
            <BadgeIcon color="#FFFFFF" strokeWidth={2.25} size={256} />
          </span>
        )}
      </Drawer>
    </>
  );
}
