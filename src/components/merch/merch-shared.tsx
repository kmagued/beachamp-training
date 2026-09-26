import Image from "next/image";
import { Shirt } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { MerchCatalogSize } from "@/lib/config/merch";

export function MerchThumb({
  url,
  alt,
  sizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw",
  className,
  children,
}: {
  url: string | null;
  alt: string;
  sizes?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("relative aspect-[4/3] bg-sand overflow-hidden flex items-center justify-center", className)}>
      {url ? (
        <Image src={url} alt={alt} fill sizes={sizes} className="object-cover" />
      ) : (
        <Shirt className="w-12 h-12 text-primary-300" />
      )}
      {children}
    </div>
  );
}

/** Sizes as players see them: sold-out sizes are crossed out, counts are never shown */
export function MerchSizes({ sizes }: { sizes: MerchCatalogSize[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {sizes.map((s) => (
        <span
          key={s.size}
          aria-label={s.in_stock ? s.size : `${s.size}, sold out`}
          className={cn(
            "text-[11px] font-semibold rounded px-1.5 py-0.5",
            s.in_stock ? "text-slate-600 bg-slate-100" : "text-slate-300 bg-slate-50 line-through",
          )}
        >
          {s.size}
        </span>
      ))}
    </div>
  );
}

export function MerchPrice({ price, className }: { price: number; className?: string }) {
  return (
    <p className={cn("text-xl font-bold text-slate-900", className)}>
      {price.toLocaleString("en-US")} <span className="text-xs font-medium text-slate-400">EGP</span>
    </p>
  );
}

export function MerchCategoryChips({
  categories,
  counts,
  value,
  onChange,
}: {
  categories: { id: string; name: string }[];
  /** Keyed by category id, plus "all" */
  counts: Record<string, number>;
  value: string;
  onChange: (value: string) => void;
}) {
  const options = [{ id: "all", name: "All" }, ...categories];
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onChange(c.id)}
          className={cn(
            "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
            value === c.id
              ? "bg-primary border-primary text-white"
              : "bg-white border-primary-100 text-primary-700 hover:border-primary-300",
          )}
        >
          {c.name}
          <span className="ml-1 opacity-60">{counts[c.id] ?? 0}</span>
        </button>
      ))}
    </div>
  );
}

export function countByCategory(items: { category_id: string }[]) {
  const counts: Record<string, number> = { all: items.length };
  for (const i of items) counts[i.category_id] = (counts[i.category_id] ?? 0) + 1;
  return counts;
}
