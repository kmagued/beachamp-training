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
      <svg viewBox="0 0 24 24" fill="currentColor" className={cn("w-7 h-7 text-primary", size === "sm" && "w-6 h-6")}>
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 2.07c2.59.44 4.81 2.03 6.09 4.24L15 10.43c-.28-.89-.8-1.67-1.52-2.25L14 7.71V4.07h-1zm-2 0V7.1l-.31.22C9.38 8.2 8.49 9.53 8.23 11.03l-4.02-2.32C5.46 6.17 8.15 4.42 11 4.07zM4.63 15.1c-.4-1-.63-2.07-.63-3.18 0-.26.02-.52.05-.77L8.08 13.5c.14 1.47.88 2.79 2.02 3.67l.46.35-1.88 3.27c-1.78-.85-3.24-2.27-4.05-3.97v.28zM12 20c-.36 0-.71-.03-1.06-.08l1.88-3.27c.32.06.65.1.99.13l.48-.02 2.1 3.64C14.98 19.78 13.53 20 12 20zm5.49-1.57l-2.1-3.64c.93-.7 1.6-1.71 1.88-2.88l4.12 2.38c-.55 1.66-1.75 3.2-3.25 4.04l-.65.1z" />
      </svg>
      {showName && <span className="font-bold">{branding.name}</span>}
    </div>
  );
}
