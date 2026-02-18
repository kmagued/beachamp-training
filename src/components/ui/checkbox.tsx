import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, className, ...props }, ref) => (
    <label className={cn("flex items-center gap-2.5 cursor-pointer group", className)}>
      <input
        ref={ref}
        type="checkbox"
        className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary/20 cursor-pointer"
        {...props}
      />
      <span className="text-sm text-slate-700 group-hover:text-slate-900 transition-colors">
        {label}
      </span>
    </label>
  )
);

Checkbox.displayName = "Checkbox";
