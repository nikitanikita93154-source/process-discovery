import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function SynaptLogo({ className, markOnly = false }: { className?: string; markOnly?: boolean }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-2.5 text-ink", className)}>
      <svg viewBox="0 0 40 40" fill="none" className="h-9 w-9 shrink-0" aria-hidden="true">
        <path d="M10 10 29 7 32 29 13 32 10 10 32 29M29 7 13 32" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
        <circle cx="10" cy="10" r="5" fill="currentColor" /><circle cx="29" cy="7" r="5" fill="currentColor" />
        <circle cx="32" cy="29" r="5" fill="currentColor" /><circle cx="13" cy="32" r="5" fill="#C7F14E" stroke="currentColor" strokeWidth="2" />
      </svg>
      {markOnly ? <span className="sr-only">Synapt</span> : <span className="font-head text-xl font-medium tracking-[-0.06em]">Synapt</span>}
    </span>
  );
}

export function Eyebrow({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("font-mono text-[10px] font-medium uppercase leading-relaxed tracking-[0.14em] text-muted sm:text-[11px]", className)} {...props} />;
}

export function PageTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h1 className={cn("break-words font-head text-2xl font-medium leading-[1.3] tracking-[-0.045em] text-ink sm:text-3xl", className)} {...props} />;
}
