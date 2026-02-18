import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

type AlertVariant = "error" | "success" | "warning";

const variantClasses: Record<AlertVariant, string> = {
  error: "bg-red-50 border border-red-200 text-red-700",
  success: "bg-emerald-50 border border-emerald-200 text-emerald-700",
  warning: "bg-amber-50 border border-amber-200 text-amber-700",
};

interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
}

export function Alert({ variant = "error", className, children, ...props }: AlertProps) {
  return (
    <div
      role="alert"
      className={cn("text-sm rounded-lg px-4 py-3", variantClasses[variant], className)}
      {...props}
    >
      {children}
    </div>
  );
}
