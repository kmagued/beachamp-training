import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "w-full px-4 py-2.5 rounded-lg border border-slate-300 text-base sm:text-sm text-slate-700",
      "focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent",
      className
    )}
    {...props}
  >
    {children}
  </select>
));

Select.displayName = "Select";
