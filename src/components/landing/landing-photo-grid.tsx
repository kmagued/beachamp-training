import type { ReactNode } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils/cn";
import { branding } from "@/lib/config/branding";
import type { LandingPhoto } from "@/lib/config/landing-photos";

/**
 * One photo spot on the landing page, cropped to fit. Without a photo it shows a branded
 * placeholder. The admin page renders the same spots with its controls laid over them.
 */
export function LandingPhotoTile({
  photo,
  sizes,
  className,
  overlay,
}: {
  photo: LandingPhoto;
  sizes: string;
  /** Sets the spot's shape, e.g. an aspect ratio */
  className?: string;
  overlay?: (photo: LandingPhoto) => ReactNode;
}) {
  return (
    <div className={cn("relative overflow-hidden rounded-2xl bg-sand/40 ring-1 ring-primary-100", className)}>
      {photo.url ? (
        <Image src={photo.url} alt={`Training at ${branding.name}`} fill sizes={sizes} className="object-cover" />
      ) : (
        <div aria-hidden className="absolute inset-0 flex items-center justify-center">
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage: "url('/images/pattern.jpeg')",
              backgroundSize: "500px",
              backgroundRepeat: "repeat",
            }}
          />
          <Image
            src="/images/logo-badge.png"
            alt=""
            width={941}
            height={636}
            className="relative w-1/3 max-w-[160px] h-auto opacity-25"
          />
        </div>
      )}
      {overlay?.(photo)}
    </div>
  );
}

/** The "Life at …" gallery: one large photo with two small ones beside it (below it on phones) */
export function LandingPhotoGrid({
  photos,
  overlay,
}: {
  photos: LandingPhoto[];
  overlay?: (photo: LandingPhoto) => ReactNode;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
      {photos.map((photo, i) => {
        const large = i === 0;
        return (
          <LandingPhotoTile
            key={photo.slot}
            photo={photo}
            overlay={overlay}
            sizes={large ? "(max-width: 640px) 100vw, 740px" : "(max-width: 640px) 50vw, 370px"}
            className={large ? "col-span-2 aspect-[4/3] sm:row-span-2 sm:aspect-auto" : "aspect-square"}
          />
        );
      })}
    </div>
  );
}
