import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

type ButtonVariant = "primary" | "outline" | "ghost" | "secondary";
type ButtonSize = "sm" | "md";

export const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-primary hover:bg-cyan-700 disabled:bg-cyan-300 text-white font-semibold transition-colors",
  outline:
    "border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white font-medium transition-all",
  ghost:
    "text-slate-400 hover:text-white font-medium transition-colors",
  secondary:
    "border border-slate-300 text-slate-500 hover:text-slate-700 font-medium transition-colors",
};

export const buttonSizes: Record<ButtonSize, string> = {
  sm: "text-sm px-5 py-2.5 rounded-lg",
  md: "text-base px-8 py-3.5 rounded-xl",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "sm", fullWidth, className, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        buttonVariants[variant],
        buttonSizes[size],
        fullWidth && "w-full",
        className
      )}
      {...props}
    />
  )
);

Button.displayName = "Button";
