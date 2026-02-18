import { type LabelHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  className?: string;
  required?: boolean;
}

export function Label({ className, children, required, ...props }: LabelProps) {
  return (
    <label
      className={cn("block text-sm font-medium text-slate-700 mb-1.5", className)}
      {...props}
    >
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}
