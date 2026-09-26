import Image from "next/image";
import { Shirt } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { MERCH_CATEGORIES } from "@/lib/config/merch";

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

export function MerchSizes({ sizes }: { sizes: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {sizes.map((s) => (
        <span key={s} className="text-[11px] font-semibold text-slate-600 bg-slate-100 rounded px-1.5 py-0.5">
          {s}
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
  counts,
  value,
  onChange,
}: {
  counts: Record<string, number>;
  value: string;
  onChange: (value: string) => void;
}) {
  const options = [{ value: "all", label: "All" }, ...MERCH_CATEGORIES];
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((c) => (
        <button
          key={c.value}
          type="button"
          onClick={() => onChange(c.value)}
          className={cn(
            "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
            value === c.value
              ? "bg-primary border-primary text-white"
              : "bg-white border-primary-100 text-primary-700 hover:border-primary-300",
          )}
        >
          {c.label}
          <span className="ml-1 opacity-60">{counts[c.value] ?? 0}</span>
        </button>
      ))}
    </div>
  );
}

export function countByCategory(items: { category: string }[]) {
  const counts: Record<string, number> = { all: items.length };
  for (const c of MERCH_CATEGORIES) counts[c.value] = items.filter((i) => i.category === c.value).length;
  return counts;
}
