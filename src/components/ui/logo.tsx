import Image from "next/image";
import { branding } from "@/lib/config/branding";
import { cn } from "@/lib/utils/cn";

type LogoSize = "sm" | "md" | "lg";

const sizePx: Record<LogoSize, { w: number; h: number }> = {
  sm: { w: 32, h: 24 },
  md: { w: 44, h: 34 },
  lg: { w: 72, h: 56 },
};

interface LogoProps {
  size?: LogoSize;
  showName?: boolean;
  className?: string;
}

export function Logo({ size = "md", showName = false, className }: LogoProps) {
  const { w, h } = sizePx[size];
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Image
        src="/images/logo.png"
        alt={`${branding.name} logo`}
        width={w}
        height={h}
        priority
        className="object-contain"
      />
      {showName && (
        <span className="font-display text-lg tracking-wide text-primary-900">
          {branding.name}
        </span>
      )}
    </div>
  );
}
