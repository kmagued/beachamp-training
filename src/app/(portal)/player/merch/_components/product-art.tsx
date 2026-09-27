import Image from "next/image";
import { cn } from "@/lib/utils/cn";
import { placeholderFontSize, type CatalogTone } from "@/lib/merch/catalog";

/**
 * A product's picture: its photo, or, without one, its type in big display letters on the
 * category's colour. Sold-out products go grey; the tag stays outside the grey layer so it keeps its red.
 */
export function ProductArt({
  imageUrl,
  alt,
  word,
  tone,
  soldOut,
  sizes,
  className,
}: {
  imageUrl: string | null;
  alt: string;
  /** Shown when there's no photo, e.g. "HOODIE" */
  word: string;
  tone: CatalogTone;
  soldOut: boolean;
  /** next/image sizes hint */
  sizes: string;
  className?: string;
}) {
  return (
    <div className={cn("relative aspect-square overflow-hidden rounded-2xl", className)}>
      <div
        className={cn("absolute inset-0", soldOut && "grayscale opacity-60")}
        style={imageUrl ? undefined : { background: tone.background, containerType: "inline-size" }}
      >
        {imageUrl ? (
          <Image src={imageUrl} alt={alt} fill sizes={sizes} className="object-cover" />
        ) : (
          <span
            aria-hidden="true"
            className="absolute bottom-0 left-0 font-display leading-[0.74] whitespace-nowrap select-none"
            style={{
              color: tone.ink,
              fontSize: `${placeholderFontSize(word)}cqw`,
              transform: "translate(-2%, 6%)",
            }}
          >
            {word}
          </span>
        )}
      </div>
      {soldOut && (
        <span className="absolute top-2.5 left-2.5 rounded-full bg-white px-2.5 py-0.5 text-[11px] font-bold text-red-700 shadow-sm">
          Sold out
        </span>
      )}
    </div>
  );
}
