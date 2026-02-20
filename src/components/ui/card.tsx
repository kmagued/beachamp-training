import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

type CardVariant = "default" | "dark";

const variantClasses: Record<CardVariant, string> = {
  default: "bg-white rounded-xl border border-slate-200 p-4 sm:p-6",
  dark: "bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4 sm:p-6",
};

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
}

export function Card({ variant = "default", className, children, ...props }: CardProps) {
  return (
    <div className={cn(variantClasses[variant], className)} {...props}>
      {children}
    </div>
  );
}
