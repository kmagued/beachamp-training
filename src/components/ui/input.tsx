import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "w-full px-4 py-2.5 rounded-lg border border-slate-300 text-base sm:text-sm",
      "focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent",
      className
    )}
    {...props}
  />
));

Input.displayName = "Input";
