import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer [&_svg]:shrink-0",
  { variants: {
    variant: {
      default: "bg-ink text-white hover:bg-ink/85",
      lime: "bg-lime text-ink hover:bg-lime/80",
      secondary: "border border-line-warm bg-cream text-ink hover:bg-paper",
      outline: "border border-line bg-transparent text-ink hover:border-ink hover:bg-cream",
      ghost: "text-muted hover:bg-paper hover:text-ink",
      destructive: "bg-danger text-white hover:bg-danger/90",
      success: "bg-ok text-white hover:bg-ok/90",
    },
    size: { default: "min-h-10 px-5 py-2.5", sm: "min-h-8 px-3.5 py-1.5 text-xs", lg: "min-h-12 px-7 py-3", icon: "h-10 w-10" },
  }, defaultVariants: { variant: "default", size: "default" } },
);
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}
export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
export { buttonVariants };
