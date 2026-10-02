import {
  Award,
  Crown,
  Flame,
  Lock,
  Medal,
  Rocket,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Trophy,
  Volleyball,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { BadgeIconKey } from "@/lib/badges/config";

export const BADGE_ICON_COMPONENTS: Record<BadgeIconKey, LucideIcon> = {
  "shield-check": ShieldCheck,
  star: Star,
  flame: Flame,
  zap: Zap,
  trophy: Trophy,
  crown: Crown,
  medal: Medal,
  award: Award,
  target: Target,
  sparkles: Sparkles,
  rocket: Rocket,
  volleyball: Volleyball,
};

const SIZES = {
  sm: { circle: "w-9 h-9", icon: "w-4 h-4" },
  md: { circle: "w-14 h-14", icon: "w-6 h-6" },
  lg: { circle: "w-20 h-20", icon: "w-9 h-9" },
};

/**
 * A badge's round medallion, as in the mockup: gold with a white icon when earned (or
 * shown to an admin), slate with a lock while a player still has it to unlock.
 */
export function BadgeMedallion({
  icon,
  locked = false,
  size = "md",
  className,
}: {
  icon: BadgeIconKey;
  locked?: boolean;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const Icon = locked ? Lock : BADGE_ICON_COMPONENTS[icon];
  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center shrink-0",
        SIZES[size].circle,
        locked
          ? "bg-slate-100 text-slate-400"
          : "bg-gradient-to-br from-accent-400 to-accent-600 text-white shadow-md shadow-accent-600/25",
        className
      )}
    >
      <Icon className={SIZES[size].icon} strokeWidth={2.25} />
    </div>
  );
}
