import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "w-full px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400",
        "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
        "transition-colors text-base sm:text-sm resize-none",
        className
      )}
      rows={3}
      {...props}
    />
  )
);

Textarea.displayName = "Textarea";
