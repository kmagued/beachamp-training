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
import { TIERS, type BadgeIconKey, type TierNumber } from "@/lib/badges/config";

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
  xs: { circle: "w-7 h-7", icon: "w-3.5 h-3.5" },
  sm: { circle: "w-9 h-9", icon: "w-4 h-4" },
  md: { circle: "w-14 h-14", icon: "w-6 h-6" },
  lg: { circle: "w-20 h-20", icon: "w-9 h-9" },
};

/**
 * A badge's round medallion: the tier's metal (Bronze to Diamond) with a white icon, or
 * slate with a lock while a player still has the tier to unlock.
 */
export function BadgeMedallion({
  icon,
  tier = 3,
  locked = false,
  size = "md",
  className,
}: {
  icon: BadgeIconKey;
  /** The metal; Gold when not given */
  tier?: TierNumber;
  locked?: boolean;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const Icon = locked ? Lock : BADGE_ICON_COMPONENTS[icon];
  const metal = TIERS[tier];
  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center shrink-0",
        SIZES[size].circle,
        locked ? "bg-slate-100 text-slate-400" : "text-white shadow-md shadow-slate-900/15",
        className
      )}
      style={locked ? undefined : { backgroundImage: `linear-gradient(135deg, ${metal.from}, ${metal.to})` }}
    >
      <Icon className={SIZES[size].icon} strokeWidth={2.25} />
    </div>
  );
}
