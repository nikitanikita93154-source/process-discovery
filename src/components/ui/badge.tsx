import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border gap-1 px-2.5 py-1 font-mono text-[10px] sm:text-[11px] font-medium uppercase tracking-[0.04em] transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-lime-soft text-ink",
        lime: "border-transparent bg-lime text-ink",
        accent: "border-transparent bg-accent-soft text-accent-dark",
        ok: "border-transparent bg-ok-soft text-ok",
        warn: "border-transparent bg-warn-soft text-warn",
        secondary: "border-transparent bg-cream text-ink",
        success: "border-transparent bg-ok-soft text-ok",
        warning: "border-transparent bg-warn-soft text-warn",
        destructive: "border-transparent bg-danger-soft text-danger",
        outline: "border-line text-ink",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}

export { badgeVariants };
