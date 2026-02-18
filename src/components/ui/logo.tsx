import { branding } from "@/lib/config/branding";
import { cn } from "@/lib/utils/cn";

type LogoSize = "sm" | "md";

const sizeClasses: Record<LogoSize, string> = {
  sm: "w-8 h-8 text-xs",
  md: "w-9 h-9 text-sm",
};

interface LogoProps {
  size?: LogoSize;
  showName?: boolean;
  className?: string;
}

export function Logo({ size = "md", showName = false, className }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className={cn(
          "rounded-lg bg-primary flex items-center justify-center text-white font-bold",
          sizeClasses[size]
        )}
      >
        {branding.shortName}
      </div>
      {showName && <span className="font-bold">{branding.name}</span>}
    </div>
  );
}
