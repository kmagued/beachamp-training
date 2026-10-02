import { cn } from "@/lib/utils/cn";

/** One of the stat tiles across the top of the Achievements page, as in the mockup */
export function AchievementStat({
  label,
  value,
  detail,
  highlight = false,
}: {
  label: string;
  value: string | number;
  detail: string;
  /** The navy tile: the page's headline figure */
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-4 sm:p-6",
        highlight
          ? "border-primary-900 bg-gradient-to-br from-primary-900 to-primary-600 text-white"
          : "border-slate-200 bg-white"
      )}
    >
      <p
        className={cn(
          "text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.14em]",
          highlight ? "text-white/70" : "text-slate-400"
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          "mt-2 font-display text-3xl sm:text-5xl uppercase leading-none",
          highlight ? "text-white" : "text-primary-900"
        )}
      >
        {value}
      </p>
      <p className={cn("mt-2 text-xs sm:text-sm", highlight ? "text-white/75" : "text-slate-500")}>{detail}</p>
    </div>
  );
}
