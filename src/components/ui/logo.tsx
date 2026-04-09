import Image from "next/image";
import { branding } from "@/lib/config/branding";
import { cn } from "@/lib/utils/cn";

type LogoSize = "sm" | "md" | "lg";

const sizePx: Record<LogoSize, number> = {
  sm: 28,
  md: 36,
  lg: 56,
};

interface LogoProps {
  size?: LogoSize;
  showName?: boolean;
  className?: string;
}

export function Logo({ size = "md", showName = false, className }: LogoProps) {
  const px = sizePx[size];
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Image
        src="/images/teal-logo.png"
        alt={`${branding.name} logo`}
        width={px}
        height={px}
        priority
        className="object-contain"
      />
      {showName && <span className="font-bold">{branding.name}</span>}
    </div>
  );
}
